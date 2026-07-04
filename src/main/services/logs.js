// In-app event log.
//
// Records inference runs, downloads, setup events, HF activity, and errors.
// Two layers:
//   - in-memory ring buffer (last MAX_BUFFER entries) for fast UI reads
//   - JSONL file in userData/logs.jsonl for persistence across launches
//
// Hardening notes (post-audit):
//   - All writes go through a single in-memory queue so two rapid record()
//     calls can't race the file stream into a half-written line, and a
//     stream `error` handler is always attached so disk-full / readonly /
//     locked-file conditions don't crash main with an uncaughtException.
//   - clear() drains the existing stream before unlinking and re-init() so
//     we never delete-then-reopen on top of pending writes.
//   - rotation no longer empties the in-memory buffer (previously the UI
//     went blank after crossing 5MB even though new entries kept arriving).
//   - archived rotated files older than RETENTION_MS are deleted on every
//     init() and at midnight (whichever comes first), capped at 7 days.

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { app } = require('electron');
const { safeBroadcast } = require('./broadcast');

const MAX_BUFFER = 2000;
const MAX_FILE_BYTES = 5 * 1024 * 1024;     // 5 MB → rotate
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const PURGE_INTERVAL_MS = 60 * 60 * 1000;   // re-check hourly while alive

let _buffer = [];
let _logFile = null;
let _stream = null;
let _streamReady = false;
let _writeQueue = Promise.resolve();
let _ready = false;
let _initPromise = null;
let _purgeTimer = null;

function logFile() {
  if (!_logFile) _logFile = path.join(app.getPath('userData'), 'logs.jsonl');
  return _logFile;
}

function logsDir() {
  return path.dirname(logFile());
}

async function _readTail(file, maxLines) {
  try {
    const text = await fsp.readFile(file, 'utf8');
    const lines = text.split(/\r?\n/).filter(Boolean);
    return lines.slice(-maxLines)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
  } catch { return []; }
}

// Walk the userData dir for archived rotated logs (logs.<epoch>.jsonl) older
// than the retention window. Failures are intentionally silent — log GC is a
// best-effort process, never a crash surface.
async function _purgeOldArchives() {
  try {
    const dir = logsDir();
    const entries = await fsp.readdir(dir).catch(() => []);
    const now = Date.now();
    for (const name of entries) {
      const m = name.match(/^logs\.(\d+)\.jsonl$/);
      if (!m) continue;
      const archivedAt = parseInt(m[1], 10);
      if (!Number.isFinite(archivedAt)) continue;
      if (now - archivedAt > RETENTION_MS) {
        await fsp.unlink(path.join(dir, name)).catch(() => {});
      }
    }
  } catch {}
}

function _attachStream(file) {
  let s;
  try {
    s = fs.createWriteStream(file, { flags: 'a' });
  } catch (e) {
    _streamReady = false;
    return null;
  }
  // The single most important hardening: never let an unhandled stream error
  // bubble up and kill the main process. Disk full, readonly partition, file
  // locked by AV, ENOSPC etc. all surface here.
  s.on('error', (err) => {
    _streamReady = false;
    try { console.warn('[logs] write stream error:', err?.message || err); } catch {}
  });
  s.on('open', () => { _streamReady = true; });
  return s;
}

async function init() {
  if (_ready) return;
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    const file = logFile();
    try {
      await fsp.mkdir(logsDir(), { recursive: true });
      const stat = await fsp.stat(file).catch(() => null);
      if (stat && stat.size > MAX_FILE_BYTES) {
        const archived = path.join(logsDir(), `logs.${Date.now()}.jsonl`);
        await fsp.rename(file, archived).catch(() => {});
      }
      // Read tail BEFORE replacing _buffer so a rotation right before init
      // doesn't hand us an empty buffer (we keep whatever's in memory).
      const tail = await _readTail(file, MAX_BUFFER);
      if (tail.length) _buffer = tail;
    } catch {}
    _stream = _attachStream(file);
    _streamReady = !!_stream;
    _ready = true;
    // Fire-and-forget retention sweep + schedule periodic re-runs.
    _purgeOldArchives();
    if (!_purgeTimer) {
      _purgeTimer = setInterval(_purgeOldArchives, PURGE_INTERVAL_MS);
      _purgeTimer.unref?.();
    }
  })();
  return _initPromise;
}

// If the stream went bad (disk full briefly, AV holding the file, etc.),
// try to reattach. Throttled to once per minute so we don't thrash on a
// permanently-broken file. Without this, a single transient write error
// would silently disable persistence for the whole app session.
const _REATTACH_COOLDOWN_MS = 60 * 1000;
let _lastReattachAttempt = 0;
function _maybeReattach() {
  if (_streamReady) return;
  const now = Date.now();
  if (now - _lastReattachAttempt < _REATTACH_COOLDOWN_MS) return;
  _lastReattachAttempt = now;
  if (_stream) { try { _stream.end(); } catch {} _stream = null; }
  _stream = _attachStream(logFile());
}

// Serialise writes through a single chained promise so two record() calls
// firing in the same tick can't interleave bytes into a half-line.
function _enqueueWrite(line) {
  _writeQueue = _writeQueue.then(() => new Promise((resolve) => {
    if (!_stream || !_streamReady) {
      _maybeReattach();
      if (!_stream || !_streamReady) return resolve();
    }
    const ok = _stream.write(line, (err) => {
      // Per-write errors are also surfaced here in addition to the stream
      // 'error' listener; either way we just stop persisting and keep the
      // in-memory buffer alive. _maybeReattach() picks up on the next call.
      if (err) _streamReady = false;
      resolve();
    });
    if (!ok) {
      // Backpressure: wait for drain before resolving so we don't pile up
      // unbounded buffers in the WriteStream.
      _stream.once('drain', () => resolve());
    }
  })).catch(() => {});
  return _writeQueue;
}

// Rotate if the file just crossed MAX_FILE_BYTES. Cheap stat call, but we
// only do it every 256 writes to avoid an fs.stat on the hot path.
let _writesSinceRotateCheck = 0;
async function _maybeRotate() {
  if ((++_writesSinceRotateCheck & 0xff) !== 0) return;
  try {
    const stat = await fsp.stat(logFile()).catch(() => null);
    if (!stat || stat.size <= MAX_FILE_BYTES) return;
    // Drain the queue before swapping the file so writes don't land in the
    // archive after the rename.
    await _writeQueue;
    if (_stream) {
      try { _stream.end(); } catch {}
      _stream = null;
      _streamReady = false;
    }
    const archived = path.join(logsDir(), `logs.${Date.now()}.jsonl`);
    await fsp.rename(logFile(), archived).catch(() => {});
    _stream = _attachStream(logFile());
    _streamReady = !!_stream;
    // Note: we deliberately do NOT clear _buffer here — the in-memory log
    // viewer should keep showing recent entries across rotations.
  } catch {}
}

// Fire-and-forget. Safe to call before init() (entries get queued in buffer).
function record(partial) {
  const entry = {
    ts: Date.now(),
    source: partial.source || 'app',
    level: partial.level || 'info',
    event: partial.event || '',
    message: partial.message || '',
    ...(partial.meta && Object.keys(partial.meta).length ? { meta: partial.meta } : {}),
  };
  _buffer.push(entry);
  if (_buffer.length > MAX_BUFFER) _buffer.splice(0, _buffer.length - MAX_BUFFER);
  if (_stream && _streamReady) {
    let line;
    try { line = JSON.stringify(entry) + '\n'; }
    catch { line = JSON.stringify({ ts: entry.ts, source: 'app', level: 'warn', event: 'logs.serialize.error', message: 'log entry could not be serialized' }) + '\n'; }
    _enqueueWrite(line);
    _maybeRotate();
  }
  safeBroadcast('logs:updated', entry);
  return entry;
}

function list(opts = {}) {
  const { limit = 500, source, level, search } = opts;
  let out = _buffer;
  if (source && source !== 'all') out = out.filter((e) => e.source === source);
  if (level && level !== 'all')   out = out.filter((e) => e.level === level);
  if (search) {
    const s = String(search).toLowerCase();
    out = out.filter((e) =>
      (e.message || '').toLowerCase().includes(s) ||
      (e.event   || '').toLowerCase().includes(s) ||
      JSON.stringify(e.meta || {}).toLowerCase().includes(s)
    );
  }
  if (out.length > limit) out = out.slice(-limit);
  return out;
}

async function clear() {
  _buffer = [];
  // Drain any in-flight writes BEFORE we end the stream and unlink, so
  // we don't land bytes into a soon-to-be-deleted file or close-then-write.
  await _writeQueue.catch(() => {});
  if (_stream) {
    await new Promise((resolve) => {
      try { _stream.end(resolve); } catch { resolve(); }
    });
    _stream = null;
    _streamReady = false;
  }
  try { await fsp.unlink(logFile()); } catch {}
  _ready = false;
  _initPromise = null;
  await init();
  safeBroadcast('logs:updated', { ts: Date.now(), source: 'app', level: 'info', event: 'logs.cleared', message: 'Logs cleared' });
}

module.exports = { init, record, list, clear, logFile };
