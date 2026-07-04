// Python runtime manager.
//
// First launch:
//   1. Download a portable Python from python-build-standalone (~30 MB,
//      hosted on GitHub Releases by Astral). Extract to `<userData>/py-runtime/`.
//   2. Download the uv binary (~30 MB, also Astral). Extract to
//      `<userData>/py-runtime/uv/`.
//   3. Run `uv pip install --python <portable-python>` for torch (cpu or
//      cu124 wheels, picked by the user's accelerator choice) and the rest
//      of `requirements.txt`. uv is ~10–100× faster than pip — parallel
//      downloads + a Rust resolver — which matters because the wheels are
//      multi-GB.
//   4. Verify the key imports work.
//
// Subsequent launches:
//   - The bundled Python lives under `<userData>/py-runtime/python/`. The
//     sidecar uses it directly. No re-downloading.
//
// We never touch system Python — users don't need it installed.

const { spawn, execSync, spawnSync } = require('child_process');
const path   = require('path');
const fs     = require('fs/promises');
const fsSync = require('fs');
const os     = require('os');
const https  = require('https');
const http   = require('http');
const { app } = require('electron');

const bundle = require('./runtime-bundle');

// In dev: <repo>/python/. In a packaged build python/ is shipped as
// extraResources so Python subprocesses (pip, the sidecar) can read it
// directly off disk.
const PY_DIR = app.isPackaged
  ? path.join(process.resourcesPath, 'python')
  : path.join(__dirname, '..', '..', '..', 'python');
const REQ_FILE = path.join(PY_DIR, 'requirements.txt');
const IS_WIN = process.platform === 'win32';

// Layout under userData:
//   py-runtime/
//     installed.json          ← { active: 'cpu'|'gpu', accelerators: { cpu:{installedAt}, gpu:{installedAt} } }
//     cpu/                    ← per-accelerator subtree. independent venv.
//       python/...            ← portable Python tree
//       uv/...                ← uv binary
//     gpu/
//       python/...
//       uv/...
//
// Per-accelerator subdirs let us switch between CPU and GPU instantly once
// both are installed: no torch reinstall, just flip the `active` pointer in
// installed.json. First-time switching to a missing variant triggers a
// fresh install into that subdir; the other subdir is preserved.
//
// Migration: if an old single-tree layout exists at `py-runtime/python/`
// (pre-2026-05), `_migrateToPerAccelerator` moves it into the active
// accelerator's subdir on next run. No reinstall needed.
function runtimeBaseDir() { return path.join(app.getPath('userData'), 'py-runtime'); }
function infoFile()       { return path.join(runtimeBaseDir(), 'installed.json'); }
function hfCacheDir()     { return path.join(app.getPath('userData'), 'hf-cache'); }

function _readInfo() {
  try { return JSON.parse(fsSync.readFileSync(infoFile(), 'utf8')); } catch { return {}; }
}

function _writeInfo(info) {
  try { fsSync.mkdirSync(runtimeBaseDir(), { recursive: true }); } catch {}
  try { fsSync.writeFileSync(infoFile(), JSON.stringify(info, null, 2)); } catch {}
}

function activeAccelerator() {
  const info = _readInfo();
  if (info.active === 'cpu' || info.active === 'gpu') return info.active;
  // Legacy single-tree installs stored `accelerator` at the top level.
  if (info.accelerator === 'cpu' || info.accelerator === 'gpu') return info.accelerator;
  return null;
}

// `runtimeDir(accel)` returns the per-accelerator subtree. With no arg, returns
// the active accelerator's subtree; if none is active yet, returns the legacy
// flat path so isReady() can detect a pre-migration install.
function runtimeDir(accelerator) {
  const accel = accelerator || activeAccelerator();
  if (!accel) return runtimeBaseDir();
  return path.join(runtimeBaseDir(), accel);
}

function venvPython(accelerator) { return path.join(runtimeDir(accelerator), bundle.bundledPythonRelPath()); }
function uvBin(accelerator)      { return path.join(runtimeDir(accelerator), bundle.bundledUvRelPath()); }

function _legacyVenvPython() {
  return path.join(runtimeBaseDir(), bundle.bundledPythonRelPath());
}

// One-shot migration. If the user has a pre-2026 single-tree install, move it
// into the active accelerator's subdir. Idempotent — does nothing if the
// new layout is already in place.
async function _migrateToPerAccelerator() {
  const base = runtimeBaseDir();
  const legacyPython = path.join(base, 'python');
  const legacyUv     = path.join(base, 'uv');
  if (!fsSync.existsSync(legacyPython)) return;  // nothing to migrate

  const info = _readInfo();
  const accel = info.accelerator || 'cpu';  // best-effort. defaults to cpu.
  const target = path.join(base, accel);
  if (fsSync.existsSync(target)) {
    // Both old and new exist (shouldn't normally happen). Leave migration
    // alone; the user can clear py-runtime if it gets confused.
    return;
  }
  await fs.mkdir(target, { recursive: true });
  try { await fs.rename(legacyPython, path.join(target, 'python')); } catch {}
  try { await fs.rename(legacyUv,     path.join(target, 'uv')); }     catch {}
  // Rewrite installed.json into the new shape.
  const installedAt = info.installedAt || new Date().toISOString();
  _writeInfo({
    active: accel,
    accelerators: { [accel]: { installedAt } },
  });
}

function loadHfTokenSync() {
  try {
    const file = path.join(app.getPath('userData'), 'hf-token.json');
    return JSON.parse(fsSync.readFileSync(file, 'utf8'))?.token || null;
  } catch { return null; }
}

function runEnv() {
  const env = {
    ...process.env,
    PYTHONIOENCODING: 'utf-8',
    PYTHONUNBUFFERED: '1',
    HF_HOME: hfCacheDir(),
    // Don't set TRANSFORMERS_CACHE — modern transformers reads $HF_HOME/hub
    // by default, which is the same path snapshot_download writes to. Setting
    // TRANSFORMERS_CACHE to a sibling dir would split the cache and cause
    // re-downloads.
    HF_HUB_ENABLE_HF_TRANSFER: '0',
  };
  const token = loadHfTokenSync();
  if (token) {
    env.HF_TOKEN = token;
    env.HUGGING_FACE_HUB_TOKEN = token;
  }
  return env;
}

// -------- readiness check --------

// Modules whose presence == "we can actually run inference."
const REQUIRED_MODS = [
  'torch', 'transformers', 'diffusers', 'PIL', 'numpy',
  'huggingface_hub', 'soundfile', 'librosa', 'accelerate', 'timm',
];

// Probe an arbitrary python interpreter for "all required deps are present".
// ASYNC: spawnSync would freeze the renderer (the GUI process is the same
// Node event loop) for the duration of the probe — torch import alone is
// 5-15s, which is enough for Windows to mark the window "(Not Responding)".
function _probeReadyUncached(pythonExe) {
  return new Promise((resolve) => {
    const probe =
      'import importlib.util as u, sys\n' +
      `mods = ${JSON.stringify(REQUIRED_MODS)}\n` +
      'missing = [m for m in mods if u.find_spec(m) is None]\n' +
      'if missing: sys.exit(1)\n' +
      'import torch\n' +
      'v = tuple(int(x) for x in torch.__version__.split(".")[:2])\n' +
      'sys.exit(0 if v >= (2, 6) else 2)\n';
    let done = false;
    const child = spawn(pythonExe, ['-c', probe], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: runEnv(),
    });
    const finish = (ok) => {
      if (done) return;
      done = true;
      try { child.kill(); } catch {}
      resolve(!!ok);
    };
    child.on('exit', (code) => finish(code === 0));
    child.on('error', () => finish(false));
    setTimeout(() => finish(false), 30_000);
  });
}

// Cache the probe results keyed on the python interpreter path + its mtime.
// Importing torch in a fresh interpreter takes 5-15s on Windows, and the
// renderer polls status() repeatedly while the user is in Settings. Without
// this cache, every status() call paid 3× that cost (active venv + cpu probe
// + gpu probe), making the post-install "ready" indicator lag by ~5s.
//
// The cache key includes mtime so that a `pip install` (or a Clean Python
// runtime) busts the entry: the python.exe's mtime updates when the venv
// changes meaningfully. TTL is 60s as a safety net.
const _probeCache = new Map();   // path → { ok, expiresAt, mtime }
const _probeInflight = new Map(); // path → Promise (de-dupes concurrent calls)
const _PROBE_TTL_MS = 60_000;

function _probeKey(pythonExe) {
  try {
    const stat = fsSync.statSync(pythonExe);
    return { mtime: stat.mtimeMs };
  } catch {
    return { mtime: 0 };
  }
}

function _probeReady(pythonExe) {
  const { mtime } = _probeKey(pythonExe);
  const cached = _probeCache.get(pythonExe);
  if (cached && cached.expiresAt > Date.now() && cached.mtime === mtime) {
    return Promise.resolve(cached.ok);
  }
  // De-dupe concurrent probes for the same interpreter (e.g. status() racing
  // with a freshly-fired UI re-render).
  const inflight = _probeInflight.get(pythonExe);
  if (inflight) return inflight;
  const p = _probeReadyUncached(pythonExe).then((ok) => {
    _probeCache.set(pythonExe, { ok, expiresAt: Date.now() + _PROBE_TTL_MS, mtime });
    _probeInflight.delete(pythonExe);
    return ok;
  });
  _probeInflight.set(pythonExe, p);
  return p;
}

// Force-refresh the probe cache for one interpreter. Called at the end of
// setup() / fast-switch so the renderer's next status() sees ok=true without
// re-running torch import.
function _markReady(pythonExe) {
  if (!pythonExe) return;
  const { mtime } = _probeKey(pythonExe);
  _probeCache.set(pythonExe, { ok: true, expiresAt: Date.now() + _PROBE_TTL_MS, mtime });
}

async function isReady() {
  const py = venvPython();
  if (!fsSync.existsSync(py)) {
    // Pre-migration single-tree layout?
    const legacy = _legacyVenvPython();
    if (fsSync.existsSync(legacy)) return await _probeReady(legacy);
    return false;
  }
  return await _probeReady(py);
}

// Like isReady() but for a SPECIFIC accelerator subdir. Used by the fast-
// switch path: if the target subdir already has a fully-functional venv we
// just flip the active pointer without reinstalling anything.
async function isAcceleratorReady(accelerator) {
  const py = venvPython(accelerator);
  if (!fsSync.existsSync(py)) return false;
  return await _probeReady(py);
}

// -------- HTTP helpers (download + redirects) --------

function fetchToFile(url, destPath, onProgress, onPct) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const go = (u) => {
      attempts += 1;
      if (attempts > 6) return reject(new Error(`Too many redirects fetching ${url}`));
      const lib = u.startsWith('https:') ? https : http;
      const req = lib.get(u, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return go(new URL(res.headers.location, u).toString());
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} for ${u}`));
        }
        const total = Number(res.headers['content-length'] || 0);
        let done = 0, lastEmit = 0;
        const file = fsSync.createWriteStream(destPath);
        res.on('data', (chunk) => {
          done += chunk.length;
          const now = Date.now();
          if (now - lastEmit >= 200) {
            lastEmit = now;
            const pct = total ? (done / total) * 100 : 0;
            onPct?.(pct, done, total);
            onProgress?.({
              kind: 'log', channel: 'stdout',
              text: `download: ${(done/1024/1024).toFixed(1)} / ${(total/1024/1024).toFixed(1)} MB (${pct.toFixed(1)}%)\r`,
            });
          }
        });
        res.pipe(file);
        file.on('finish', () => file.close((err) => err ? reject(err) : resolve()));
        file.on('error', reject);
      });
      req.on('error', reject);
      req.setTimeout(120_000, () => req.destroy(new Error('Connection timeout')));
    };
    go(url);
  });
}

// -------- portable Python install --------

async function ensurePortablePython(accelerator, onProgress) {
  const targetPy  = venvPython(accelerator);
  const targetDir = runtimeDir(accelerator);
  if (fsSync.existsSync(targetPy)) {
    onProgress?.({ kind: 'log', channel: 'stdout', text: `Portable Python already installed for ${accelerator}.\n` });
    return;
  }

  const url = bundle.pythonStandaloneUrl();
  onProgress?.({ kind: 'step', text: `Downloading portable Python` });
  onProgress?.({ kind: 'log', channel: 'stdout', text: `Source: ${url}\n` });

  await fs.mkdir(targetDir, { recursive: true });
  const tarPath = path.join(targetDir, 'python.tar.gz');
  await fetchToFile(url, tarPath, onProgress, (pct, done, total) => {
    onProgress?.({ kind: 'progress', phase: 'download-python', pct, done, total });
  });

  onProgress?.({ kind: 'step', text: 'Extracting Python' });
  await new Promise((resolve, reject) => {
    const proc = _trackChild(spawn('tar', ['-xzf', tarPath, '-C', targetDir], {
      stdio: ['ignore', 'pipe', 'pipe'],
    }));
    let err = '';
    proc.stderr.on('data', (d) => { err += d.toString(); });
    proc.on('error', reject);
    proc.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`tar exited ${code}: ${err}`)));
  });
  await fs.rm(tarPath, { force: true }).catch(() => {});

  if (!fsSync.existsSync(targetPy)) {
    throw new Error(`Portable Python missing at ${targetPy} after extract`);
  }

  // Sanity check.
  const probe = spawnSync(targetPy, ['-c', 'import sys; print(sys.version_info[:3])'], {
    encoding: 'utf-8', timeout: 10_000, stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (probe.status !== 0) {
    throw new Error(`Bundled Python failed to start: ${probe.stderr || probe.error}`);
  }
  onProgress?.({ kind: 'log', channel: 'stdout', text: `Bundled Python ready: ${probe.stdout?.trim()}\n` });
}

// -------- uv install --------

async function ensureUv(accelerator, onProgress) {
  const targetUv = uvBin(accelerator);
  if (fsSync.existsSync(targetUv)) {
    onProgress?.({ kind: 'log', channel: 'stdout', text: `uv already installed for ${accelerator}.\n` });
    return;
  }

  const url = bundle.uvUrl();
  onProgress?.({ kind: 'step', text: 'Downloading uv (fast Python package manager)' });
  onProgress?.({ kind: 'log', channel: 'stdout', text: `Source: ${url}\n` });

  const uvDir = path.dirname(targetUv);
  await fs.mkdir(uvDir, { recursive: true });

  const archiveExt = IS_WIN ? '.zip' : '.tar.gz';
  const archivePath = path.join(runtimeDir(accelerator), `uv${archiveExt}`);
  await fetchToFile(url, archivePath, onProgress, (pct, done, total) => {
    onProgress?.({ kind: 'progress', phase: 'download-uv', pct, done, total });
  });

  onProgress?.({ kind: 'step', text: 'Extracting uv' });
  await new Promise((resolve, reject) => {
    // Windows: zip → bsdtar (built into Win10+) handles it via -xf.
    // POSIX: tar.gz with a single uv-<triple>/ wrapper directory; strip it
    // so the binary lands at uv/uv directly.
    const args = IS_WIN
      ? ['-xf', archivePath, '-C', uvDir]
      : ['-xzf', archivePath, '--strip-components=1', '-C', uvDir];
    const proc = _trackChild(spawn('tar', args, { stdio: ['ignore', 'pipe', 'pipe'] }));
    let err = '';
    proc.stderr.on('data', (d) => { err += d.toString(); });
    proc.on('error', reject);
    proc.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`tar exited ${code}: ${err}`)));
  });
  await fs.rm(archivePath, { force: true }).catch(() => {});

  if (!fsSync.existsSync(targetUv)) {
    throw new Error(`uv missing at ${targetUv} after extract`);
  }

  if (!IS_WIN) {
    // Tarball preserves the executable bit but be defensive.
    try { await fs.chmod(targetUv, 0o755); } catch {}
  }

  // Sanity check.
  const probe = spawnSync(targetUv, ['--version'], {
    encoding: 'utf-8', timeout: 10_000, stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (probe.status !== 0) {
    throw new Error(`uv failed to start: ${probe.stderr || probe.error}`);
  }
  onProgress?.({ kind: 'log', channel: 'stdout', text: `${probe.stdout?.trim()} ready\n` });
}

// -------- uv pip install with retry --------

function runCommand(command, args, onProgress) {
  return new Promise((resolve, reject) => {
    const proc = _trackChild(spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      env: runEnv(),
    }));
    let stderrBuf = '';
    const forward = (stream, channel) => {
      stream.on('data', (d) => {
        const text = d.toString();
        if (channel === 'stderr') stderrBuf += text;
        onProgress?.({ kind: 'log', channel, text });
      });
    };
    forward(proc.stdout, 'stdout');
    forward(proc.stderr, 'stderr');
    proc.on('error', reject);
    proc.on('exit', (code, signal) => {
      if (code === 0) return resolve();
      const err = new Error(`${command} exited (code=${code}${signal ? `, signal=${signal}` : ''})`);
      err.stderr = stderrBuf;
      err.exitCode = code;
      reject(err);
    });
  });
}

async function uvInstall(accelerator, args, onProgress, { attempts = 3, delayMs = 2500 } = {}) {
  const py = venvPython(accelerator);
  const uv = uvBin(accelerator);
  for (let i = 1; i <= attempts; i++) {
    try {
      // `uv pip install --python <interpreter>` installs into that interpreter's
      // site-packages, no venv required. --no-cache is intentionally NOT set —
      // uv's global wheel cache is the whole point: subsequent installs (same
      // user re-running setup, or sibling versions) reuse cached wheels.
      await runCommand(uv, ['pip', 'install', '--python', py, ...args], onProgress);
      return;
    } catch (e) {
      const msg = (e.stderr || '') + ' ' + String(e.message || '');
      const retriable =
        /WinError\s*32|being used by another process|PermissionError|Read timed out|Temporary failure in name resolution|ConnectionError|ReadTimeoutError|ProtocolError|Connection reset|Max retries exceeded/i
          .test(msg);
      if (i >= attempts || !retriable) throw e;
      onProgress?.({
        kind: 'step',
        text: `Install hiccup (attempt ${i}/${attempts}). Retrying in ${Math.round(delayMs / 1000)}s…`,
      });
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}

async function installPackages(accelerator, onProgress) {
  // No "upgrade pip" step — uv has its own resolver and bypasses pip entirely.
  // Per-accelerator subdirs mean we never reinstall over an existing install
  // when switching: the other accelerator's venv is in a sibling directory
  // and untouched. So no --reinstall-package flags needed.
  // torchaudio MUST come from the same index as torch — installing it from
  // PyPI alongside a CUDA torch produces an ABI mismatch (WinError 127 on
  // Windows when GraniteSpeechFeatureExtractor / Voxtral / etc. try to load
  // their DLLs).
  const torchIndex = bundle.torchIndexUrl(accelerator);
  const accelLabel = accelerator === 'gpu' ? 'GPU' : 'CPU';
  onProgress?.({ kind: 'step', text: `Installing PyTorch (${accelLabel}, largest step)` });
  if (torchIndex) {
    await uvInstall(accelerator, ['--index-url', torchIndex, 'torch>=2.6', 'torchvision', 'torchaudio>=2.6'], onProgress);
  } else {
    // macOS: default PyPI wheel ships MPS support on Apple Silicon.
    await uvInstall(accelerator, ['torch>=2.6', 'torchvision', 'torchaudio>=2.6'], onProgress);
  }

  onProgress?.({ kind: 'step', text: 'Installing transformers, diffusers, and supporting libraries' });
  await uvInstall(accelerator, ['-r', REQ_FILE], onProgress);
}

// -------- verification --------

async function verifyInstallation(accelerator, onProgress) {
  // ASYNC spawn instead of spawnSync. importing torch + transformers takes
  // 30-60s and we cannot freeze the renderer that long (Windows shows
  // "(Not Responding)" and OS may force-kill).
  onProgress?.({ kind: 'step', text: 'Verifying install: importing packages' });
  const probe = [
    'import sys',
    `mods = ${JSON.stringify(REQUIRED_MODS)}`,
    'missing = []',
    'for m in mods:',
    '    try: __import__(m)',
    '    except Exception as e: missing.append(f"{m}: {e}")',
    'print("MISSING:" + ",".join(missing) if missing else "OK")',
    'import torch',
    'print("TORCH:" + torch.__version__)',
    'print("CUDA:" + str(torch.cuda.is_available()))',
    'print("MPS:" + str(getattr(torch.backends, "mps", None) is not None and torch.backends.mps.is_available()))',
  ].join('\n');

  const result = await new Promise((resolve, reject) => {
    let stdoutBuf = '', stderrBuf = '';
    let timer;
    const child = _trackChild(spawn(venvPython(accelerator), ['-c', probe], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: runEnv(),
    }));
    child.stdout.on('data', (d) => {
      const t = d.toString(); stdoutBuf += t;
      onProgress?.({ kind: 'log', channel: 'stdout', text: t });
    });
    child.stderr.on('data', (d) => {
      const t = d.toString(); stderrBuf += t;
      onProgress?.({ kind: 'log', channel: 'stderr', text: t });
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`Verification could not spawn Python: ${err.message}`));
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve({ status: code, stdout: stdoutBuf, stderr: stderrBuf });
    });
    timer = setTimeout(() => {
      try { child.kill(); } catch {}
      reject(new Error('Verification timed out (>120s waiting on torch import)'));
    }, 120_000);
  });

  if (result.status !== 0) {
    throw new Error(`Verification process exited with code ${result.status}`);
  }
  const out = result.stdout || '';
  const missingLine = out.split(/\r?\n/).find(l => l.startsWith('MISSING:'));
  if (missingLine && missingLine !== 'MISSING:') {
    throw new Error(`Some packages failed to import: ${missingLine.slice('MISSING:'.length)}`);
  }
}

// -------- kill helpers --------

// Pre-audit, this function string-interpolated `dir` directly into a shell
// command. A path containing an apostrophe (e.g. `C:\Users\O'Brien\...`)
// would terminate the PowerShell single-quoted string and the rest of the
// path would be interpreted as PowerShell code — broken behaviour at best,
// command-injection surface at worst. Same problem with backticks / $() in
// the POSIX `pgrep -f` branch.
//
// We now spawn the kill helpers via spawnSync with arg arrays + env passing,
// so the path is never lexed as part of a shell line.
function killVenvProcessesFor(accelerator, onProgress) {
  // Only kill python.exe processes whose path is inside the named
  // accelerator's subtree. Lets the other accelerator stay running undisturbed.
  const dir = runtimeDir(accelerator);
  return _killProcessesUnderDir(dir, onProgress);
}

function killVenvProcesses(onProgress) {
  // Backward-compat alias. Kills everything under py-runtime/.
  const dir = runtimeBaseDir();
  return _killProcessesUnderDir(dir, onProgress);
}

function _killProcessesUnderDir(dir, onProgress) {
  // ASYNC: PowerShell startup + WMI query can take several seconds; doing it
  // synchronously froze the renderer at the start of every install.
  return new Promise((resolve) => {
    let timer;
    const finish = () => {
      if (resolve._done) return;
      resolve._done = true;
      clearTimeout(timer);
      try { onProgress?.({ kind: 'log', channel: 'stdout', text: 'Cleared lingering python processes.\n' }); } catch {}
      resolve();
    };
    try {
      if (IS_WIN) {
        const psCmd =
          `$dir = $env:LOCALML_VENV_DIR; ` +
          `Get-CimInstance Win32_Process -Filter "Name='python.exe'" | ` +
          `Where-Object { $_.ExecutablePath -like ($dir + '\\*') } | ` +
          `ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
        const encoded = Buffer.from(psCmd, 'utf16le').toString('base64');
        const child = spawn('powershell', ['-NoProfile', '-EncodedCommand', encoded], {
          stdio: ['ignore', 'ignore', 'ignore'],
          env: { ...process.env, LOCALML_VENV_DIR: dir },
        });
        child.on('exit',  finish);
        child.on('error', finish);
        timer = setTimeout(() => { try { child.kill(); } catch {} finish(); }, 10_000);
      } else {
        const escaped = dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const child = spawn('pgrep', ['-f', escaped], {
          stdio: ['ignore', 'pipe', 'ignore'],
        });
        let buf = '';
        child.stdout.on('data', (d) => { buf += d.toString(); });
        child.on('exit', (code) => {
          if (code === 0 && buf) {
            for (const line of buf.split('\n')) {
              const pid = parseInt(line, 10);
              if (Number.isFinite(pid)) {
                try { process.kill(pid, 'SIGKILL'); } catch {}
              }
            }
          }
          finish();
        });
        child.on('error', finish);
        timer = setTimeout(() => { try { child.kill(); } catch {} finish(); }, 5_000);
      }
    } catch {
      finish();
    }
  });
}

// -------- in-flight child tracking --------
//
// `before-quit` needs to know if `setup()` is mid-install so it can kill any
// `tar`, `uv`, `pip`, etc. children we spawned. Without this, Cmd+Q during a
// first-launch install leaves orphaned processes and a half-installed
// runtime that fails the next `isReady()` probe permanently.
const _activeChildren = new Set();

function _trackChild(child) {
  if (!child || !child.pid) return child;
  _activeChildren.add(child);
  const cleanup = () => _activeChildren.delete(child);
  child.once('exit',  cleanup);
  child.once('close', cleanup);
  child.once('error', cleanup);
  return child;
}

function hasActiveChildren() { return _activeChildren.size > 0; }

function killActiveChildren({ signal = 'SIGTERM' } = {}) {
  for (const c of _activeChildren) {
    try { c.kill(signal); } catch {}
  }
}

// -------- public API --------

// `setup({ accelerator, onProgress })` is the single entry point.
// Legacy `setup(onProgress)` still works (function-as-first-arg).
async function setup(...args) {
  let opts = {};
  let onProgress = null;
  if (typeof args[0] === 'function') {
    onProgress = args[0];
  } else {
    opts = args[0] || {};
    onProgress = args[1] || opts.onProgress || null;
  }
  const accelerator = opts.accelerator || bundle.suggestAccelerator();

  // First, migrate any pre-2026 single-tree install into a per-accelerator
  // subdir. No-op on fresh installs.
  await _migrateToPerAccelerator();

  await fs.mkdir(hfCacheDir(), { recursive: true }).catch(() => {});

  // Fast-switch path. If the requested accelerator's subdir already has a
  // working venv, just flip the active pointer in installed.json. No
  // download, no pip install, no waiting.
  const prev = activeAccelerator();
  if (prev !== accelerator && await isAcceleratorReady(accelerator)) {
    onProgress?.({
      kind: 'step',
      text: `Switching to ${accelerator.toUpperCase()} runtime (already installed). Activating…`,
    });
    const info = _readInfo();
    info.active = accelerator;
    info.accelerators = info.accelerators || {};
    info.accelerators[accelerator] = info.accelerators[accelerator] || { installedAt: new Date().toISOString() };
    _writeInfo(info);
    _markReady(venvPython(accelerator));
    onProgress?.({ kind: 'step', text: `${accelerator.toUpperCase()} runtime active` });
    return venvPython();
  }

  if (prev && prev !== accelerator) {
    onProgress?.({
      kind: 'step',
      text: `Installing ${accelerator.toUpperCase()} runtime alongside the existing ${prev.toUpperCase()} install`,
    });
  }

  // Only kill processes that point at the accelerator we're about to (re)install.
  // Doesn't touch the OTHER accelerator's venv if it's running.
  await killVenvProcessesFor(accelerator, onProgress);
  await ensurePortablePython(accelerator, onProgress);
  await ensureUv(accelerator, onProgress);
  await installPackages(accelerator, onProgress);
  await verifyInstallation(accelerator, onProgress);

  // Update installed.json: this accelerator is now active and was just installed.
  const info = _readInfo();
  info.active = accelerator;
  info.accelerators = info.accelerators || {};
  info.accelerators[accelerator] = { installedAt: new Date().toISOString() };
  _writeInfo(info);

  // Mark the new venv as ready in the probe cache. The renderer's next
  // tasks:status call would otherwise re-spawn `python -c "import torch"`
  // (~5s on Windows) before flipping the UI to "ready". verifyInstallation
  // just proved the venv works; record that.
  _markReady(venvPython(accelerator));

  onProgress?.({ kind: 'step', text: 'Python runtime ready' });
  return venvPython();
}

// Synchronous, filesystem-only snapshot of the runtime state. Skips the
// torch-import probe so this is safe to invoke via ipcRenderer.sendSync at
// renderer init: it returns in microseconds and lets the Welcome → "Get
// started" decision be made on the first paint without an async wait. The
// async `status()` below is still the source of truth for `ready` (which
// requires actually importing torch); statusSync only fills in the
// filesystem-derivable fields.
function statusSync() {
  const active = activeAccelerator();
  const info = _readInfo();
  const cpuInstalled = fsSync.existsSync(path.join(runtimeBaseDir(), 'cpu', bundle.bundledPythonRelPath()));
  const gpuInstalled = fsSync.existsSync(path.join(runtimeBaseDir(), 'gpu', bundle.bundledPythonRelPath()));
  // Last-known torch-probe result, if we cached one in this process. Lets
  // the renderer's first paint reflect "ready" too on a re-launch where
  // setup completed earlier in this app session.
  const cachedProbe = _probeCache.get(venvPython());
  const cachedReady = cachedProbe && cachedProbe.ok ? true : false;
  return {
    runtimePath: runtimeBaseDir(),
    runtimeInstalled: fsSync.existsSync(venvPython()),
    activeAccelerator: active,
    installedAccelerator: active,
    installedAt: info.accelerators?.[active]?.installedAt || info.installedAt || null,
    accelerators: {
      cpu: { installed: cpuInstalled, installedAt: info.accelerators?.cpu?.installedAt || null },
      gpu: { installed: gpuInstalled, installedAt: info.accelerators?.gpu?.installedAt || null },
    },
    suggestedAccelerator: bundle.suggestAccelerator(),
    hasNvidia: bundle.hasNvidiaGpu(),
    hfCachePath: hfCacheDir(),
    platform: process.platform,
    arch: os.arch(),
    ready: cachedReady,
  };
}

async function status() {
  const ready = await isReady();
  const info = _readInfo();
  const active = activeAccelerator();
  // Per-accelerator existence flags so the renderer can show which builds
  // are installed and which would need a download. Used by the Hardware
  // panel to render "switch instantly" vs "install ~1 GB".
  // status() runs frequently (called by the renderer's polling) so we keep
  // these probes parallel + bounded.
  const [cpuReady, gpuReady] = await Promise.all([
    isAcceleratorReady('cpu'),
    isAcceleratorReady('gpu'),
  ]);
  return {
    runtimePath: runtimeBaseDir(),
    runtimeInstalled: fsSync.existsSync(venvPython()),
    activeAccelerator: active,
    installedAccelerator: active,  // back-compat with older renderer code
    installedAt: info.accelerators?.[active]?.installedAt || info.installedAt || null,
    accelerators: {
      cpu: { installed: cpuReady, installedAt: info.accelerators?.cpu?.installedAt || null },
      gpu: { installed: gpuReady, installedAt: info.accelerators?.gpu?.installedAt || null },
    },
    suggestedAccelerator: bundle.suggestAccelerator(),
    hasNvidia: bundle.hasNvidiaGpu(),
    hfCachePath: hfCacheDir(),
    platform: process.platform,
    arch: os.arch(),
    ready,
  };
}

module.exports = {
  setup,
  status,
  statusSync,
  isReady,
  isAcceleratorReady,
  activeAccelerator,
  venvPython,
  killVenvProcesses,
  killVenvProcessesFor,
  runEnv,
  hasActiveChildren,
  killActiveChildren,
};
