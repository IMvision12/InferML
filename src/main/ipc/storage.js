const { ipcMain, app } = require('electron');
const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const os = require('os');
const sidecar = require('../services/python-sidecar');
const pySetup = require('../services/python-setup');
const hfCache = require('../services/hf-cache');
const logs = require('../services/logs');

// Cache root resolution lives in services/hf-cache.js so the per-model
// uninstall flow (huggingface.js) and the storage walker (this file) can't
// drift apart over time.
const _hfCachePaths = hfCache.cachePaths;

// Whitelist a path before recursive delete. Defense-in-depth so a buggy or
// malicious renderer can't ask us to nuke arbitrary disk paths. We allow
// userData (for our own subdirs) plus every plausible HF cache root the
// platform might have used.
function _isSafeToDelete(target) {
  const resolved = path.resolve(target);
  const userData = path.resolve(app.getPath('userData'));
  if (resolved === userData || resolved.startsWith(userData + path.sep)) return true;

  const allowedRoots = [path.join(os.homedir(), '.cache', 'huggingface')];
  if (process.env.HF_HUB_CACHE)   allowedRoots.push(process.env.HF_HUB_CACHE);
  if (process.env.HF_HOME)        allowedRoots.push(process.env.HF_HOME);
  if (process.env.XDG_CACHE_HOME) allowedRoots.push(path.join(process.env.XDG_CACHE_HOME, 'huggingface'));

  for (const root of allowedRoots) {
    const r = path.resolve(root);
    if (resolved === r || resolved.startsWith(r + path.sep)) return true;
  }
  return false;
}

async function _rmTree(target) {
  if (!_isSafeToDelete(target)) {
    throw new Error(`refusing to delete a path outside the safe roots: ${target}`);
  }
  // fs.rm with force avoids ENOENT if the path is already missing.
  await fs.rm(target, { recursive: true, force: true });
}

async function _dirSize(target) {
  let total = 0;
  let files = 0;
  try {
    const stack = [target];
    while (stack.length) {
      const cur = stack.pop();
      let entries;
      try { entries = await fs.readdir(cur, { withFileTypes: true }); } catch { continue; }
      for (const e of entries) {
        const p = path.join(cur, e.name);
        if (e.isDirectory()) stack.push(p);
        else if (e.isFile()) {
          try { const s = await fs.stat(p); total += s.size; files += 1; } catch {}
        }
      }
    }
  } catch {}
  return { bytes: total, files };
}

function register() {
  ipcMain.handle('storage:size', async (_, key) => {
    const userData = app.getPath('userData');
    if (key === 'pyRuntime') {
      const target = path.join(userData, 'py-runtime');
      const { bytes, files } = await _dirSize(target);
      return { ok: true, bytes, files, path: target };
    }
    if (key === 'hfCache') {
      // Sum every active cache path the user has on disk and report a
      // human-readable composite path (the primary one is shown, with a
      // hint when multiple are detected).
      const paths = _hfCachePaths();
      let totalBytes = 0;
      let totalFiles = 0;
      for (const p of paths) {
        const r = await _dirSize(p);
        totalBytes += r.bytes;
        totalFiles += r.files;
      }
      const primary = paths[0] || path.join(userData, 'hf-cache');
      return {
        ok: true,
        bytes: totalBytes,
        files: totalFiles,
        path: primary,
        paths,  // exposed so the renderer can show "+ N other locations" if needed
      };
    }
    return { ok: false, error: `unknown key: ${key}` };
  });

  ipcMain.handle('storage:clearHfCache', async () => {
    try {
      // The Python sidecar holds open handles into hf-cache (downloaded weights
      // are mmapped). Stop it first so file deletion isn't blocked on Windows.
      await sidecar.stop({ graceful: true, timeoutMs: 2500 }).catch(() => {});
      const cleared = [];
      const errors = [];
      for (const p of _hfCachePaths()) {
        try {
          await _rmTree(p);
          cleared.push(p);
        } catch (e) {
          errors.push({ path: p, error: String(e?.message || e) });
        }
      }
      // Recreate the userData/hf-cache dir so HF_HOME stays a valid path on
      // next sidecar start. The ~/.cache/huggingface entry is recreated by
      // huggingface_hub itself on the next download.
      const userDataCache = path.join(app.getPath('userData'), 'hf-cache');
      await fs.mkdir(userDataCache, { recursive: true }).catch(() => {});

      // The installs registry tracks which model_ids the user has downloaded.
      // It's a separate file from the cache itself, so deleting the cache
      // alone leaves orphaned "Installed" badges in the Hub. Reset it too.
      const installsPath = path.join(app.getPath('userData'), 'installs.json');
      await fs.writeFile(installsPath, '{}', 'utf-8').catch(() => {});
      // Notify any open renderer(s) so the Hub re-fetches and the "Installed"
      // badges disappear in the same paint as the cache going to 0 bytes.
      try {
        const { BrowserWindow } = require('electron');
        for (const w of BrowserWindow.getAllWindows()) {
          if (!w.isDestroyed()) w.webContents.send('hf:installsChanged');
        }
      } catch {}

      logs.record({
        source: 'app', event: 'storage.clear',
        message: `Cleared HF cache (${cleared.length} location${cleared.length === 1 ? '' : 's'}) + reset installs.json`,
        meta: { cleared, errors: errors.length ? errors : undefined },
      });
      if (cleared.length === 0 && errors.length > 0) {
        return { ok: false, error: errors.map(e => `${e.path}: ${e.error}`).join('; ') };
      }
      return { ok: true, cleared, errors: errors.length ? errors : undefined };
    } catch (e) {
      const msg = String(e?.message || e);
      logs.record({ source: 'app', level: 'error', event: 'storage.clear.error', message: `Clear HF cache failed: ${msg}` });
      return { ok: false, error: msg };
    }
  });

  ipcMain.handle('storage:clearPyRuntime', async () => {
    try {
      // Stop sidecar AND any uv/pip child processes before deleting. python.exe
      // and DLLs are locked while running on Windows, so the rm would fail.
      await sidecar.stop({ graceful: true, timeoutMs: 2500 }).catch(() => {});
      try { pySetup.killVenvProcesses?.(); } catch {}
      try { pySetup.killActiveChildren?.({ signal: 'SIGTERM' }); } catch {}
      const target = path.join(app.getPath('userData'), 'py-runtime');
      await _rmTree(target);
      logs.record({ source: 'app', event: 'storage.clear', message: 'Cleared Python runtime', meta: { path: target } });
      return { ok: true, path: target };
    } catch (e) {
      const msg = String(e?.message || e);
      logs.record({ source: 'app', level: 'error', event: 'storage.clear.error', message: `Clear Python runtime failed: ${msg}` });
      return { ok: false, error: msg };
    }
  });
}

module.exports = { register };
