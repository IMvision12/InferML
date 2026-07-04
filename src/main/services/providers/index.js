const anthropic = require('./anthropic');
const openai = require('./openai');
const google = require('./google');

const registry = { anthropic, openai, google };

function get(provider) { return registry[provider] || null; }

async function verifyKey(provider, key) {
  const p = get(provider);
  if (!p) return { ok: false, error: 'unknown provider' };
  return p.verify(key);
}

async function listModels(provider, key) {
  const p = get(provider);
  if (!p || !p.listModels) return { ok: false, error: 'unknown provider' };
  return p.listModels(key);
}

async function streamChat(provider, opts) {
  const p = get(provider);
  if (!p) {
    opts.emit({ id: opts.id, type: 'error', error: `unsupported provider ${provider}` });
    return;
  }
  return p.stream(opts);
}

module.exports = { verifyKey, listModels, streamChat, get };
