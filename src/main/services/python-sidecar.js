// Long-lived Python subprocess that dispatches inference requests.
//
// Responsibilities:
//   - Lazy start, handshake via ping/pong so callers know it's alive
//   - Correlate JSON request/response pairs via `id`
//   - Per-request timeout so a hung pipeline never wedges the app
//   - Graceful shutdown (SIGTERM → SIGKILL fallback) for app quit
//   - Survive the child exiting mid-flight: pending requests get rejected and
//     the next call re-spawns a fresh child

const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');
const { app } = require('electron');
const { runEnv } = require('./python-setup');

// In dev: <repo>/python/runner.py. In a packaged build python/ is shipped as
// extraResources (outside app.asar) because the Python subprocess can't read
// files from inside an asar archive.
const PY_DIR = app.isPackaged
  ? path.join(process.resourcesPath, 'python')
  : path.join(__dirname, '..', '..', '..', 'python');
const RUNNER = path.join(PY_DIR, 'runner.py');
const DEFAULT_REQUEST_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes — long enough for first-time model loads

let _proc = null;
let _rl = null;
let _startPromise = null;
const _pending = new Map();
// modelId → request id of the currently in-flight download. Lets cancelDownload
// look up the Python-side request id without leaking it to the renderer.
const _activeDownloads = new Map();

function _resolvePending(msg) {
  if (msg.id == null) return;
  const entry = _pending.get(msg.id);
  if (!entry) return;
  // Progress messages are streamed updates — they don't resolve the request.
  if (msg.type === 'progress') {
    if (entry.onProgress) {
      try { entry.onProgress(msg); } catch {}
    }
    return;
  }
  _pending.delete(msg.id);
  clearTimeout(entry.timer);
  if (msg.type === 'result') entry.resolve(msg.output);
  else if (msg.type === 'pong') entry.resolve({ pong: true });
  else if (msg.type === 'error') entry.reject(new Error(msg.error || 'runner error'));
  else entry.resolve(msg);
}

function _rejectAll(reason) {
  for (const entry of _pending.values()) {
    clearTimeout(entry.timer);
    entry.reject(new Error(reason));
  }
  _pending.clear();
}

function _teardown(reason) {
  _rejectAll(reason);
  _rl?.close();
  _rl = null;
  _proc = null;
  _startPromise = null;
}

function start(pythonBin) {
  if (_startPromise) return _startPromise;
  _startPromise = new Promise((resolve, reject) => {
    let proc;
    try {
      proc = spawn(pythonBin, ['-u', RUNNER], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: runEnv(),
      });
    } catch (err) {
      _startPromise = null;
      return reject(err);
    }
    _proc = proc;
    _rl = readline.createInterface({ input: proc.stdout });

    _rl.on('line', (line) => {
      let msg;
      try { msg = JSON.parse(line); } catch { return; }
      _resolvePending(msg);
    });

    proc.stderr.on('data', (d) => {
      // Surface stderr to the in-app log so users can see Python errors
      // even when the app was launched without an attached console (Finder
      // / Explorer launches on macOS / Windows). Best-effort; failures here
      // must not crash the sidecar.
      try {
        const text = d.toString();
        const lines = text.split(/\r?\n/).filter(Boolean);
        for (const l of lines) {
          try { require('./logs').record({ source: 'app', level: 'warn', event: 'sidecar.stderr', message: l.slice(0, 800) }); } catch {}
        }
        try { process.stderr.write(lines.map(l => `[py] ${l}\n`).join('')); } catch {}
      } catch {}
    });

    proc.on('error', (err) => {
      try { require('./logs').record({ source: 'app', level: 'error', event: 'sidecar.spawn.error', message: `Sidecar spawn failed: ${err.message}` }); } catch {}
      _teardown(`sidecar spawn error: ${err.message}`);
      reject(err);
    });
    proc.on('exit', (code, signal) => {
      // SIGTERM is what stop() sends for a graceful shutdown — only log when
      // the process died unexpectedly. Code 0 also means a clean exit.
      const unexpected = (code !== 0 && code !== null) || (signal && signal !== 'SIGTERM');
      if (unexpected) {
        try { require('./logs').record({ source: 'app', level: 'error', event: 'sidecar.crash', message: `Python sidecar crashed (code=${code}${signal ? `, signal=${signal}` : ''})` }); } catch {}
      }
      _teardown(`python sidecar exited (code=${code}${signal ? `, signal=${signal}` : ''})`);
    });

    // Handshake with a timeout so we fail fast if the child is dead on arrival.
    const pingId = 'ping-' + Date.now();
    const timer = setTimeout(() => {
      _pending.delete(pingId);
      try { proc.kill('SIGKILL'); } catch {}
      _teardown('sidecar ping timed out (30s)');
      reject(new Error('Python sidecar did not respond to ping within 30s'));
    }, 30000);
    _pending.set(pingId, {
      resolve: () => { clearTimeout(timer); resolve(proc); },
      reject: (err) => { clearTimeout(timer); reject(err); },
      timer,
    });
    try {
      proc.stdin.write(JSON.stringify({ id: pingId, type: 'ping' }) + '\n');
    } catch (err) {
      clearTimeout(timer);
      _teardown(`sidecar stdin write failed: ${err.message}`);
      reject(err);
    }
  });
  return _startPromise;
}

function _ensureAlive() {
  if (!_proc || _proc.killed || _proc.exitCode != null) {
    throw new Error('python sidecar not running');
  }
}

function _send(type, payload, timeoutMs, onProgress, explicitId) {
  _ensureAlive();
  const id = explicitId || (type[0] + '-' + Math.random().toString(36).slice(2));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      _pending.delete(id);
      reject(new Error(`${type} request timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);
    _pending.set(id, { resolve, reject, timer, onProgress });
    try {
      _proc.stdin.write(JSON.stringify({ id, type, ...payload }) + '\n');
    } catch (err) {
      clearTimeout(timer);
      _pending.delete(id);
      reject(err);
    }
  });
}

async function _ensureStarted(pythonBin) {
  try {
    if (!_startPromise) await start(pythonBin);
    else await _startPromise;
  } catch (err) {
    _startPromise = null;
    throw err;
  }
}

async function run(pythonBin, payload, { timeoutMs } = {}) {
  await _ensureStarted(pythonBin);
  return _send('run', payload || {}, timeoutMs || DEFAULT_REQUEST_TIMEOUT_MS);
}

async function download(pythonBin, modelId, { timeoutMs, onProgress } = {}) {
  await _ensureStarted(pythonBin);
  const id = 'd-' + Math.random().toString(36).slice(2);
  _activeDownloads.set(modelId, id);
  try {
    return await _send('download', { modelId }, timeoutMs || 60 * 60 * 1000, onProgress, id);
  } finally {
    // Only clear if we still own the slot — a fresh download for the same
    // model may have raced and overwritten it.
    if (_activeDownloads.get(modelId) === id) _activeDownloads.delete(modelId);
  }
}

async function cancelDownload(modelId) {
  const targetId = _activeDownloads.get(modelId);
  if (!targetId) return { cancelled: false, reason: 'no active download' };
  if (!isRunning()) return { cancelled: false, reason: 'sidecar not running' };
  // Fire-and-forget cancel message. The original download's pending promise
  // will reject with `{error: "cancelled"}` once Python's worker thread
  // observes the flag and unwinds.
  try {
    _proc.stdin.write(JSON.stringify({
      id: 'c-' + Math.random().toString(36).slice(2),
      type: 'cancelDownload',
      targetId,
    }) + '\n');
  } catch (err) {
    return { cancelled: false, reason: String(err?.message || err) };
  }
  return { cancelled: true, targetId };
}

// Track in-flight stop() calls so concurrent callers (e.g. before-quit firing
// while tasks:stop is still pending) coalesce onto a single shutdown promise
// rather than each adding their own `exit` listener and SIGKILL timer.
let _stopPromise = null;

function stop({ graceful = true, timeoutMs = 2000 } = {}) {
  if (_stopPromise) return _stopPromise;
  if (!_proc) { _teardown('stopped'); return Promise.resolve(); }
  const proc = _proc;
  if (proc.exitCode != null || proc.killed) {
    _teardown('stopped');
    return Promise.resolve();
  }
  _stopPromise = new Promise((resolve) => {
    let killTimer = null;
    const finish = () => {
      if (killTimer) { clearTimeout(killTimer); killTimer = null; }
      _stopPromise = null;
      _teardown('stopped');
      resolve();
    };
    proc.once('exit', finish);
    try {
      if (graceful) {
        proc.kill('SIGTERM');
        // Cleared in `finish` above so a clean SIGTERM exit doesn't leave
        // the timer pending and block the Node event loop from exiting.
        killTimer = setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} }, timeoutMs);
      } else {
        proc.kill('SIGKILL');
      }
    } catch {
      finish();
    }
  });
  return _stopPromise;
}

function isRunning() {
  return !!(_proc && !_proc.killed && _proc.exitCode == null);
}

// True when start() has been kicked off but the handshake hasn't completed
// (or failed). Used by before-quit to wait out the spawn rather than racing
// it and orphaning a fresh Python process.
function isStarting() {
  return !!_startPromise && !isRunning();
}

module.exports = { start, run, download, cancelDownload, stop, isRunning, isStarting };
