const { app, ipcMain, shell } = require('electron');
const { paths } = require('../services/storage');

function register() {
  ipcMain.handle('app:version', () => app.getVersion());
  ipcMain.handle('app:paths',   () => ({ userData: paths.userDataDir() }));
  ipcMain.handle('shell:openExternal', async (_, url) => {
    if (typeof url === 'string' && /^https?:\/\//.test(url)) shell.openExternal(url);
  });
}

module.exports = { register };
