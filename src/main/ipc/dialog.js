const { BrowserWindow, dialog, ipcMain } = require('electron');
const { readAttachment } = require('../services/attachments');

function mainWindow() { return BrowserWindow.getAllWindows()[0] || null; }

function register() {
  ipcMain.handle('dialog:openImage', async () => {
    const win = mainWindow();
    if (!win) return null;
    const r = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    return readAttachment(r.filePaths[0], 'image');
  });
  ipcMain.handle('dialog:openAudio', async () => {
    const win = mainWindow();
    if (!win) return null;
    const r = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'm4a', 'ogg', 'flac', 'webm'] }],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    return readAttachment(r.filePaths[0], 'audio');
  });
}

module.exports = { register };
