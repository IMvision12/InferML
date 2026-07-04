const { forEachSSELine } = require('./sse');

const API_URL = 'https://api.anthropic.com/v1/messages';
const MODELS_URL = 'https://api.anthropic.com/v1/models';
const API_VERSION = '2023-06-01';

async function verify(key) {
  try {
    const r = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': API_VERSION,
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4,
        messages: [{ role: 'user', content: 'ping' }],
      }),
    });
    if (r.ok) return { ok: true };
    const j = await r.json().catch(() => ({}));
    return { ok: false, error: j?.error?.message || `HTTP ${r.status}` };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

async function listModels(key) {
  try {
    const r = await fetch(`${MODELS_URL}?limit=1000`, {
      headers: { 'x-api-key': key, 'anthropic-version': API_VERSION },
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      return { ok: false, error: j?.error?.message || `HTTP ${r.status}` };
    }
    const j = await r.json();
    const models = (j.data || [])
      .map(m => ({ id: m.id, name: m.display_name || m.id, created: m.created_at || null }))
      .sort((a, b) => (b.created || '').localeCompare(a.created || ''));
    return { ok: true, models };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

function buildContent(m) {
  const atts = (m.attachments || []).filter(a => a.kind === 'image' && a.data);
  if (!atts.length) return m.text || '';
  const parts = atts.map(a => ({
    type: 'image',
    source: { type: 'base64', media_type: a.mediaType || 'image/png', data: a.data },
  }));
  parts.push({ type: 'text', text: m.text || '' });
  return parts;
}

async function stream({ apiKey, model, messages, id, emit }) {
  const sys = messages.find(m => m.role === 'system')?.text || undefined;
  const body = {
    model: model || 'claude-sonnet-4-6',
    max_tokens: 2048,
    stream: true,
    messages: messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: buildContent(m) })),
  };
  if (sys) body.system = sys;

  const resp = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': API_VERSION,
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok || !resp.body) {
    const t = await resp.text().catch(() => '');
    emit({ id, type: 'error', error: `anthropic ${resp.status}: ${t.slice(0, 400)}` });
    return;
  }
  await forEachSSELine(resp.body, line => {
    if (!line.startsWith('data:')) return;
    const data = line.slice(5).trim();
    if (!data) return;
    try {
      const j = JSON.parse(data);
      if (j.type === 'content_block_delta' && j.delta?.type === 'text_delta') {
        emit({ id, type: 'delta', text: j.delta.text });
      } else if (j.type === 'message_stop') {
        emit({ id, type: 'done' });
      } else if (j.type === 'error') {
        emit({ id, type: 'error', error: j.error?.message || 'anthropic error' });
      }
    } catch {}
  });
  emit({ id, type: 'done' });
}

module.exports = { verify, listModels, stream };
