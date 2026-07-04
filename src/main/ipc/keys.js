const { ipcMain } = require('electron');
const { paths, readJSON, writeJSON } = require('../services/storage');
const { encryptSecret, decryptSecret } = require('../services/crypto');
const providers = require('../services/providers');

async function readStore()  { return (await readJSON(paths.keysFile(), {})) || {}; }
async function writeStore(s) { return writeJSON(paths.keysFile(), s); }

function register() {
  ipcMain.handle('keys:save', async (_, provider, key) => {
    const store = await readStore();
    store[provider] = encryptSecret(key);
    store.__active = provider;
    await writeStore(store);
    return true;
  });
  ipcMain.handle('keys:get', async (_, provider) => {
    const store = await readStore();
    return store[provider] ? decryptSecret(store[provider]) : null;
  });
  ipcMain.handle('keys:getActive', async () => (await readStore()).__active || null);
  ipcMain.handle('keys:setActive', async (_, provider) => {
    const store = await readStore();
    if (!store[provider]) return false;
    store.__active = provider;
    await writeStore(store);
    return true;
  });
  ipcMain.handle('keys:mask', async (_, provider) => {
    const store = await readStore();
    const plain = store[provider] ? decryptSecret(store[provider]) : null;
    if (!plain) return null;
    return plain.slice(0, 6) + '…' + plain.slice(-4);
  });
  ipcMain.handle('keys:verify', (_, provider, key) => providers.verifyKey(provider, key));
  ipcMain.handle('keys:listModels', (_, provider, key) => providers.listModels(provider, key));
}

module.exports = { register };
