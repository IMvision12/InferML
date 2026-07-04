const { BrowserWindow, ipcMain } = require('electron');
const { sampleHw } = require('../services/systeminfo');
const { safeBroadcast } = require('../services/broadcast');

const POLL_MS = 2500;
let timer = null;

function register() {
  ipcMain.handle('hw:get', () => sampleHw());
}

function startPolling() {
  stopPolling();
  timer = setInterval(async () => {
    if (!BrowserWindow.getAllWindows().length) return;
    let hw;
    try { hw = await sampleHw(); }
    catch { return; }
    safeBroadcast('hw:update', hw);
  }, POLL_MS);
}

function stopPolling() {
  if (timer) { clearInterval(timer); timer = null; }
}

module.exports = { register, startPolling, stopPolling };
