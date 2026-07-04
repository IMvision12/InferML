const { forEachSSELine } = require('./sse');

const CHAT_URL = 'https://api.openai.com/v1/chat/completions';
const MODELS_URL = 'https://api.openai.com/v1/models';

async function verify(key) {
  try {
    const r = await fetch(MODELS_URL, { headers: { authorization: `Bearer ${key}` } });
    if (r.ok) return { ok: true };
    return { ok: false, error: `HTTP ${r.status}` };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

const OPENAI_CHAT_PREFIXES = ['gpt-', 'chatgpt-', 'o1', 'o3', 'o4'];
function isChatModel(id) {
  const s = id.toLowerCase();
  if (!OPENAI_CHAT_PREFIXES.some(p => s.startsWith(p))) return false;
  if (s.includes('audio') || s.includes('realtime') || s.includes('transcribe') ||
      s.includes('tts') || s.includes('embedding') || s.includes('search') ||
      s.includes('image') || s.includes('moderation') || s.includes('whisper')) return false;
  return true;
}

async function listModels(key) {
  try {
    const r = await fetch(MODELS_URL, { headers: { authorization: `Bearer ${key}` } });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      return { ok: false, error: j?.error?.message || `HTTP ${r.status}` };
    }
    const j = await r.json();
    const models = (j.data || [])
      .filter(m => isChatModel(m.id))
      .map(m => ({ id: m.id, name: m.id, created: m.created || 0 }))
      .sort((a, b) => (b.created || 0) - (a.created || 0));
    return { ok: true, models };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

async function stream({ apiKey, model, messages, id, emit }) {
  const body = {
    model: model || 'gpt-4o-mini',
    stream: true,
    messages: messages.map(m => {
      const images = (m.attachments || []).filter(a => a.kind === 'image' && a.dataUrl);
      if (!images.length) return { role: m.role, content: m.text || '' };
      return {
        role: m.role,
        content: [
          { type: 'text', text: m.text || '' },
          ...images.map(a => ({ type: 'image_url', image_url: { url: a.dataUrl } })),
        ],
      };
    }),
  };
  const resp = await fetch(CHAT_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  if (!resp.ok || !resp.body) {
    const t = await resp.text().catch(() => '');
    emit({ id, type: 'error', error: `openai ${resp.status}: ${t.slice(0, 400)}` });
    return;
  }
  await forEachSSELine(resp.body, line => {
    if (!line.startsWith('data:')) return;
    const data = line.slice(5).trim();
    if (!data || data === '[DONE]') return;
    try {
      const j = JSON.parse(data);
      const delta = j.choices?.[0]?.delta?.content;
      if (delta) emit({ id, type: 'delta', text: delta });
    } catch {}
  });
  emit({ id, type: 'done' });
}

module.exports = { verify, listModels, stream };
