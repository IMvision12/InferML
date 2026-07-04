const { ipcMain } = require('electron');
const hf = require('../services/huggingface');
const hfAuth = require('../services/hf-auth');
const hfCache = require('../services/hf-cache');
const sidecar = require('../services/python-sidecar');
const logs = require('../services/logs');

// Validate any model id that flows from the renderer to disk-touching code.
// Without this, an XSS injection (or future renderer-side bug) could call
// these IPCs with `..\..\foo` style paths that path.join normalizes into a
// traversal — see hf-cache.js for the full rationale.
function _rejectIfInvalidId(id) {
  if (!hfCache.isValidModelId(id)) {
    return { ok: false, error: 'Invalid model id' };
  }
  return null;
}

function register() {
  ipcMain.handle('hf:search', async (_, q, task) => {
    try {
      const res = await hf.search(q, task);
      const count = Array.isArray(res?.items) ? res.items.length : (Array.isArray(res) ? res.length : 0);
      logs.record({ source: 'hf', event: 'hf.search', message: `Searched "${q || ''}"${task ? ` · ${task}` : ''} · ${count} hits`, meta: { query: q, task, count } });
      return res;
    } catch (e) {
      const error = String(e.message || e);
      logs.record({ source: 'hf', level: 'error', event: 'hf.search.error', message: `Search failed: ${error}`, meta: { query: q, task } });
      return { error };
    }
  });
  ipcMain.handle('hf:installed',     ()          => hf.listInstalled());
  ipcMain.handle('hf:markInstalled', (_, id, m)  => {
    const rej = _rejectIfInvalidId(id);
    if (rej) return rej;
    logs.record({ source: 'hf', event: 'hf.installed', message: `Marked installed · ${id}`, meta: { modelId: id } });
    return hf.markInstalled(id, m);
  });
  ipcMain.handle('hf:uninstall',     (_, id)     => {
    const rej = _rejectIfInvalidId(id);
    if (rej) return rej;
    logs.record({ source: 'hf', level: 'warn', event: 'hf.uninstall', message: `Uninstalled · ${id}`, meta: { modelId: id } });
    return hf.uninstall(id);
  });
  ipcMain.handle('hf:modelInfo',     (_, id)     => {
    const rej = _rejectIfInvalidId(id);
    if (rej) return { id, size: null, bytes: 0, error: rej.error };
    return hf.modelInfo(id);
  });

  // HF token management. Changing the token restarts the sidecar so the new
  // HF_TOKEN env var takes effect on the next inference / download.
  ipcMain.handle('hf:getToken',     async ()          => hfAuth.getMaskedToken());
  ipcMain.handle('hf:hasToken',     async ()          => !!(await hfAuth.getToken()));
  ipcMain.handle('hf:setToken',     async (_, token)  => {
    await hfAuth.setToken(token);
    try { await sidecar.stop({ graceful: true, timeoutMs: 1500 }); } catch {}
    logs.record({ source: 'hf', event: 'hf.token.set', message: 'HF token saved · sidecar restarted' });
    return { ok: true };
  });
  ipcMain.handle('hf:clearToken',   async ()          => {
    await hfAuth.clearToken();
    try { await sidecar.stop({ graceful: true, timeoutMs: 1500 }); } catch {}
    logs.record({ source: 'hf', level: 'warn', event: 'hf.token.clear', message: 'HF token cleared' });
    return { ok: true };
  });
  ipcMain.handle('hf:verifyToken',  async (_, token)  => hfAuth.verifyToken(token));
}

module.exports = { register };
