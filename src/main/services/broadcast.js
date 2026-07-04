// Single-line "send to every alive renderer" helper.
// Centralised so we don't have to remember to check both `isDestroyed()`
// and `webContents.isDestroyed()` at every call site, and so any synchronous
// throw from `webContents.send` (rare but real on hard reloads / window
// teardowns) is caught instead of becoming an unhandledRejection that kills
// the IPC handler that triggered it.

const { BrowserWindow } = require('electron');

function safeBroadcast(channel, payload) {
  let windows;
  try { windows = BrowserWindow.getAllWindows(); }
  catch { return; }
  for (const w of windows) {
    if (!w || w.isDestroyed()) continue;
    const wc = w.webContents;
    if (!wc || wc.isDestroyed()) continue;
    try { wc.send(channel, payload); } catch {}
  }
}

module.exports = { safeBroadcast };
