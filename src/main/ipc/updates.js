const { ipcMain } = require('electron');
const updates = require('../services/updates');

function register() {
  ipcMain.handle('updates:check',    (_, opts) => updates.check(opts));
  ipcMain.handle('updates:download', () => updates.downloadUpdate());
  ipcMain.handle('updates:install',  () => updates.installUpdate());
}

module.exports = { register };
