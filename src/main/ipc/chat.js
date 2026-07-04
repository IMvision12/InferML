const { ipcMain } = require('electron');
const { paths, readJSON } = require('../services/storage');
const { decryptSecret } = require('../services/crypto');
const providers = require('../services/providers');

async function resolveKey(provider) {
  const store = (await readJSON(paths.keysFile(), {})) || {};
  return store[provider] ? decryptSecret(store[provider]) : null;
}

function register() {
  ipcMain.on('chat:send', async (evt, payload) => {
    const { id, provider, model, messages } = payload || {};
    const emit = (msg) => { if (!evt.sender.isDestroyed()) evt.sender.send('chat:event', msg); };
    try {
      const apiKey = await resolveKey(provider);
      if (!apiKey) { emit({ id, type: 'error', error: `no api key stored for ${provider}` }); return; }
      emit({ id, type: 'start' });
      await providers.streamChat(provider, { apiKey, model, messages, id, emit });
    } catch (e) {
      emit({ id, type: 'error', error: String(e.message || e) });
    }
  });
}

module.exports = { register };
