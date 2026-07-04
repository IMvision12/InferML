const { ipcMain } = require('electron');
const { paths, readJSON, writeJSON } = require('../services/storage');

function register() {
  ipcMain.handle('settings:get', async () => (await readJSON(paths.settingsFile(), {})) || {});
  ipcMain.handle('settings:save', async (_, patch) => {
    const cur = (await readJSON(paths.settingsFile(), {})) || {};
    const next = { ...cur, ...patch };
    await writeJSON(paths.settingsFile(), next);
    return next;
  });
}

module.exports = { register };
