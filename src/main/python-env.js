/**
 * Python interpreter discovery + the app-managed venv.
 *
 * InferML ships the Electron shell and the `python/` source tree, but NOT a
 * Python runtime - the user supplies one (3.10+). Everything that depends on
 * that decision is confined to this file: to switch to a bundled interpreter
 * later, only `findSystemPython()` has to change (return the bundled path) and
 * the rest of the app is unaffected.
 *
 * The venv lives under userData, is owned entirely by the app, and is where the
 * onboarding screen's torch install lands - the server runs *inside* it, so
 * `/api/setup` (which pips into sys.executable) targets it with no changes.
 */
'use strict';

const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const MIN_PYTHON = [3, 10];

// The light server layer only. torch/transformers are installed later, into
// this same venv, by the onboarding screen (POST /api/setup).
const SERVER_DEPS = [
  'fastapi>=0.110',
  'uvicorn[standard]>=0.29',
  'python-multipart>=0.0.9',
  'huggingface_hub',
  'platformdirs>=4',
  'psutil>=5.9',
  // The MCP server used to be a `pipx install "inferml[mcp]"` extra. With PyPI
  // dropped there is no extra to install, so it ships in the base venv and is
  // launched straight from the app's python.
  'mcp>=1.2',
  'httpx>=0.27',
];

// Ask a candidate interpreter what it actually is. A candidate that isn't real
// Python (most importantly the Windows Store "app execution alias" stub, a
// 0-byte reparse point that pops open the Store instead of running) either
// fails, times out, or prints nothing - all of which we treat as "not Python".
const PROBE = 'import sys,json;print(json.dumps({"exe":sys.executable,"ver":list(sys.version_info[:3])}))';

function probe(cmd, args) {
  let r;
  try {
    r = spawnSync(cmd, [...args, '-c', PROBE], {
      encoding: 'utf8',
      timeout: 5000,
      windowsHide: true,
    });
  } catch {
    return null;
  }
  if (!r || r.error || r.status !== 0 || !r.stdout) return null;
  let info;
  try {
    info = JSON.parse(r.stdout.trim().split('\n').pop());
  } catch {
    return null;
  }
  if (!info || !info.exe || !Array.isArray(info.ver)) return null;
  return { exe: info.exe, version: info.ver };
}

function meetsMinimum(version) {
  const [maj, min] = version;
  if (maj !== MIN_PYTHON[0]) return maj > MIN_PYTHON[0];
  return min >= MIN_PYTHON[1];
}

function candidates() {
  if (process.platform === 'win32') {
    // The `py` launcher first: it resolves the newest registered interpreter
    // and, unlike bare `python`, is never the Store stub.
    return [['py', ['-3']], ['py', []], ['python', []], ['python3', []]];
  }
  return [
    ['python3', []],
    ['python', []],
    ['/opt/homebrew/bin/python3', []], // Apple Silicon Homebrew
    ['/usr/local/bin/python3', []],    // Intel Homebrew
    ['/usr/bin/python3', []],
  ];
}

/**
 * The first interpreter on this machine that is real Python >= 3.10.
 * Returns { cmd, args, exe, version } or null.
 */
function findSystemPython() {
  const tooOld = [];
  for (const [cmd, args] of candidates()) {
    const info = probe(cmd, args);
    if (!info) continue;
    if (!meetsMinimum(info.version)) {
      tooOld.push(`${info.exe} (${info.version.join('.')})`);
      continue;
    }
    return { cmd, args, exe: info.exe, version: info.version, tooOld };
  }
  return { cmd: null, args: null, exe: null, version: null, tooOld };
}

function venvDir(userData) {
  return path.join(userData, 'venv');
}

/** Path to the venv's interpreter (platform-dependent layout). */
function venvPython(userData) {
  const dir = venvDir(userData);
  return process.platform === 'win32'
    ? path.join(dir, 'Scripts', 'python.exe')
    : path.join(dir, 'bin', 'python');
}

/** True once the venv exists AND the server layer is importable from it. */
function isVenvReady(userData) {
  const py = venvPython(userData);
  if (!fs.existsSync(py)) return false;
  const r = spawnSync(py, ['-c', 'import fastapi, uvicorn, huggingface_hub'], {
    encoding: 'utf8',
    timeout: 20000,
    windowsHide: true,
  });
  return !!r && !r.error && r.status === 0;
}

function run(cmd, args, onLog) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true });
    const emit = (buf) => {
      for (const line of String(buf).split(/\r?\n/)) {
        if (line.trim() && onLog) onLog(line.trim());
      }
    };
    child.stdout.on('data', emit);
    child.stderr.on('data', emit);
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(cmd)} ${args[0] || ''} exited ${code}`));
    });
  });
}

/**
 * Create the venv (if needed) and install the server layer into it.
 * `onProgress({ step, log })` drives the bootstrap screen.
 */
async function ensureVenv(userData, systemPython, onProgress) {
  const emit = (step) => onProgress && onProgress({ step });
  const log = (line) => onProgress && onProgress({ log: line });
  const py = venvPython(userData);

  if (!fs.existsSync(py)) {
    emit('Creating the Python environment');
    fs.mkdirSync(userData, { recursive: true });
    await run(systemPython.cmd, [...systemPython.args, '-m', 'venv', venvDir(userData)], log);
  }

  emit('Installing the InferML server');
  await run(py, ['-m', 'pip', 'install', '--upgrade', 'pip'], log);
  await run(py, ['-m', 'pip', 'install', ...SERVER_DEPS], log);

  return py;
}

module.exports = {
  MIN_PYTHON,
  findSystemPython,
  venvDir,
  venvPython,
  isVenvReady,
  ensureVenv,
};
