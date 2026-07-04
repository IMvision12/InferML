// HuggingFace token storage + verification.
//
// The token is stored in userData/hf-token.json as { token }. When set, it's
// injected as the HF_TOKEN environment variable when we spawn the Python
// sidecar; huggingface_hub + transformers both auto-pick it up from there.
// Changing the token requires a sidecar restart (handled by the caller).

const { paths, readJSON, writeJSON } = require('./storage');
const fs = require('fs/promises');

async function getToken() {
  const data = await readJSON(paths.hfTokenFile(), null);
  return (data && data.token) || null;
}

async function setToken(token) {
  const trimmed = String(token || '').trim();
  if (!trimmed) throw new Error('Token is empty');
  await writeJSON(paths.hfTokenFile(), { token: trimmed, savedAt: Date.now() });
  return true;
}

async function clearToken() {
  try { await fs.unlink(paths.hfTokenFile()); } catch {}
  return true;
}

// Mask for display: hf_ABCDEFGH…XYZW
function maskToken(token) {
  if (!token) return '';
  const s = String(token);
  if (s.length <= 10) return '••••••';
  return `${s.slice(0, 7)}…${s.slice(-4)}`;
}

async function getMaskedToken() {
  const t = await getToken();
  return t ? maskToken(t) : null;
}

// Hit HF's whoami endpoint to verify the token is valid. Returns
// { ok: true, user: { name, email, orgs } } on success, { ok: false, error }
// otherwise. Doesn't leak the token in logs.
async function verifyToken(token) {
  const t = String(token || '').trim();
  if (!t) return { ok: false, error: 'Token is empty' };
  try {
    const r = await fetch('https://huggingface.co/api/whoami-v2', {
      headers: { Authorization: `Bearer ${t}` },
    });
    if (r.status === 401) return { ok: false, error: 'Invalid token (401 Unauthorized)' };
    if (!r.ok) return { ok: false, error: `HF API returned ${r.status}` };
    const data = await r.json();
    return {
      ok: true,
      user: {
        name: data.name || data.fullname || 'unknown',
        email: data.email || null,
        orgs: Array.isArray(data.orgs) ? data.orgs.map(o => o.name).filter(Boolean) : [],
      },
    };
  } catch (e) {
    return { ok: false, error: `network error: ${e.message || e}` };
  }
}

module.exports = { getToken, setToken, clearToken, maskToken, getMaskedToken, verifyToken };
