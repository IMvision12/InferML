const { BrowserWindow, ipcMain } = require('electron');

function mainWindow() { return BrowserWindow.getAllWindows()[0] || null; }

function register() {
  ipcMain.handle('window:min', () => mainWindow()?.minimize());
  ipcMain.handle('window:max', () => {
    const w = mainWindow();
    if (!w) return;
    if (w.isMaximized()) w.unmaximize(); else w.maximize();
  });
  ipcMain.handle('window:close', () => mainWindow()?.close());
  ipcMain.handle('window:isMax', () => !!mainWindow()?.isMaximized());
}

module.exports = { register };
