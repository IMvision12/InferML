const { ipcMain } = require('electron');
const sidecar = require('../services/python-sidecar');
const setup = require('../services/python-setup');
const logs = require('../services/logs');

function fmtBytes(n) {
  if (!n || n < 0) return '';
  const u = ['B','KB','MB','GB','TB'];
  let i = 0; let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${u[i]}`;
}

// Track the in-flight inference (if any) and whether `tasks:stop` was just
// called. The run handler reads `_stopRequested` in its catch path so it can
// distinguish "sidecar died because user clicked Stop" (warn-level
// `run.cancelled`) from "sidecar died because something genuinely broke"
// (error-level `run.error`). The shape mirrors what we want in the log.
let _runInflight = null;   // { task, model, t0 } | null
let _stopRequested = false;

function register() {
  ipcMain.handle('tasks:status', async () => {
    const s = await setup.status();
    return { ...s, sidecarRunning: sidecar.isRunning() };
  });

  // Synchronous companion: returns the same shape as tasks:status but skips
  // the torch-import probe, so it answers in microseconds. Used by the
  // renderer at module init (via ipcRenderer.sendSync) so pyStatus is
  // populated on the very first paint — no Hardware-screen flash, no
  // "Checking runtime…" indicator on Welcome → Get started.
  ipcMain.on('tasks:statusSync', (event) => {
    try {
      const s = setup.statusSync();
      event.returnValue = { ...s, sidecarRunning: sidecar.isRunning() };
    } catch {
      event.returnValue = { ready: false, runtimeInstalled: false };
    }
  });

  ipcMain.handle('tasks:setup', async (event, opts) => {
    const webContents = event.sender;
    const setupOpts = (opts && typeof opts === 'object') ? opts : {};
    const accel = setupOpts.accelerator || 'auto';
    logs.record({ source: 'setup', event: 'setup.start', message: `Python runtime setup · accelerator=${accel}` });
    const t0 = Date.now();
    try {
      await sidecar.stop({ graceful: true, timeoutMs: 2000 });
      const py = await setup.setup(setupOpts, (evt) => {
        if (webContents && !webContents.isDestroyed()) {
          webContents.send('tasks:setupProgress', evt);
        }
      });
      logs.record({ source: 'setup', event: 'setup.done', message: `Setup complete in ${((Date.now()-t0)/1000).toFixed(1)}s`, meta: { accelerator: accel } });
      return { ok: true, python: py };
    } catch (e) {
      const error = String(e?.message || e);
      logs.record({ source: 'setup', level: 'error', event: 'setup.error', message: `Setup failed: ${error}`, meta: { accelerator: accel } });
      return { ok: false, error };
    }
  });

  ipcMain.handle('tasks:run', async (_, payload) => {
    try {
      const ready = await setup.isReady();
      if (!ready) return { ok: false, error: 'Python runtime not ready. Click the python chip in the titlebar to install.' };
      const py = setup.venvPython();
      const task  = payload?.task  || 'unknown';
      const model = payload?.model || payload?.modelId || 'unknown';
      logs.record({ source: 'inference', event: 'run.start', message: `${task} · ${model}`, meta: { task, model } });
      const t0 = Date.now();
      _runInflight = { task, model, t0 };
      _stopRequested = false;
      try {
        const output = await sidecar.run(py, payload || {});
        const ms = Date.now() - t0;
        logs.record({ source: 'inference', event: 'run.done', message: `${task} · ${model} · ${(ms/1000).toFixed(2)}s`, meta: { task, model, durationMs: ms } });
        return { ok: true, output };
      } catch (e) {
        const ms = Date.now() - t0;
        const raw = String(e?.message || e);
        // User clicked Stop while this run was in flight. The sidecar was
        // killed, which surfaces here as an exception — but it isn't a real
        // failure, so log at WARN with a dedicated event so log-readers can
        // tell the difference at a glance.
        if (_stopRequested) {
          logs.record({
            source: 'inference', level: 'warn', event: 'run.cancelled',
            message: `${task} · ${model} stopped by user after ${(ms/1000).toFixed(2)}s`,
            meta: { task, model, durationMs: ms },
          });
          return { ok: false, error: 'Stopped by user', cancelled: true };
        }
        // Genuine failure. Full error goes to the log file. The renderer only
        // shows a generic message + a "View logs" button so the user isn't
        // faced with a multi-line traceback in the workspace.
        logs.record({ source: 'inference', level: 'error', event: 'run.error', message: `${task} · ${model} failed: ${raw}`, meta: { task, model, durationMs: ms } });
        return { ok: false, error: 'Inference failed. See logs for details.' };
      } finally {
        _runInflight = null;
        _stopRequested = false;
      }
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  });

  ipcMain.handle('tasks:download', async (event, modelId) => {
    // HF model ids are `owner/repo`; both sides allow alphanumerics,
    // dots, hyphens and underscores. Reject anything else so a malformed
    // id can't slip into shell-style strings further down the pipeline.
    if (typeof modelId !== 'string' || modelId.length === 0 || modelId.length > 200) {
      return { ok: false, error: 'Invalid model id' };
    }
    if (!/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(modelId)) {
      return { ok: false, error: 'Invalid model id (expected owner/repo)' };
    }
    try {
      const ready = await setup.isReady();
      if (!ready) return { ok: false, error: 'Python runtime not ready.' };
      const py = setup.venvPython();
      const webContents = event.sender;
      logs.record({ source: 'download', event: 'download.start', message: `Downloading ${modelId}`, meta: { modelId } });
      const t0 = Date.now();
      let lastMilestone = 0;
      try {
        const info = await sidecar.download(py, modelId, {
          onProgress: (evt) => {
            if (webContents && !webContents.isDestroyed()) {
              webContents.send('tasks:downloadProgress', { modelId, ...evt });
            }
            // Log at 25/50/75% so the user can see steady progress in the
            // log without flooding it with every event. We compare against
            // a high-water mark instead of `>=` so brief regressions in the
            // reported percent (which happen on resumable HF uploads) don't
            // re-fire an already-logged milestone.
            const pct = typeof evt?.percent === 'number'
              ? evt.percent
              : (evt?.totalBytes ? (evt.transferred / evt.totalBytes) * 100 : 0);
            const milestone = Math.floor(pct / 25) * 25;
            if (milestone > lastMilestone && milestone > 0 && milestone < 100) {
              lastMilestone = milestone;
              logs.record({ source: 'download', event: 'download.progress', message: `Downloading ${modelId} · ${milestone}%`, meta: { modelId, percent: milestone } });
            }
          },
        });
        const ms = Date.now() - t0;
        const sizeStr = info?.totalBytes ? ` · ${fmtBytes(info.totalBytes)}` : '';
        logs.record({ source: 'download', event: 'download.done', message: `Downloaded ${modelId}${sizeStr} in ${(ms/1000).toFixed(1)}s`, meta: { modelId, durationMs: ms, bytes: info?.totalBytes } });
        return { ok: true, info };
      } catch (e) {
        const error = String(e?.message || e);
        logs.record({ source: 'download', level: 'error', event: 'download.error', message: `Download ${modelId} failed: ${error}`, meta: { modelId } });
        return { ok: false, error };
      }
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  });

  ipcMain.handle('tasks:cancelDownload', async (_, modelId) => {
    try {
      const res = await sidecar.cancelDownload(modelId);
      logs.record({ source: 'download', level: 'warn', event: 'download.cancel', message: `Cancelled download · ${modelId}`, meta: { modelId } });
      return { ok: true, ...res };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  });

  ipcMain.handle('tasks:stop', async () => {
    // Snapshot the in-flight run BEFORE stopping the sidecar, since the
    // sidecar exit will trigger the run's catch path and clear _runInflight
    // via the `finally` block. We need the task/model/elapsed for the log.
    const inflight = _runInflight;
    _stopRequested = !!inflight;
    logs.record({
      source: 'inference', level: 'warn', event: 'inference.stop.request',
      message: inflight
        ? `User requested stop · ${inflight.task} · ${inflight.model}`
        : 'User requested sidecar stop (no inference in flight)',
      meta: inflight ? { task: inflight.task, model: inflight.model } : {},
    });
    await sidecar.stop({ graceful: true, timeoutMs: 2000 });
    if (inflight) {
      const ms = Date.now() - inflight.t0;
      logs.record({
        source: 'inference', level: 'warn', event: 'inference.stop',
        message: `Stopped ${inflight.task} · ${inflight.model} after ${(ms/1000).toFixed(2)}s`,
        meta: { task: inflight.task, model: inflight.model, durationMs: ms },
      });
    } else {
      logs.record({ source: 'app', event: 'sidecar.stop', message: 'Python sidecar stopped' });
    }
    return { ok: true };
  });
}

module.exports = { register };
