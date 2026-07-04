const { forEachSSELine } = require('./sse');

const BASE = 'https://generativelanguage.googleapis.com/v1beta';

async function verify(key) {
  try {
    const r = await fetch(`${BASE}/models?key=${encodeURIComponent(key)}`);
    if (r.ok) return { ok: true };
    const j = await r.json().catch(() => ({}));
    return { ok: false, error: j?.error?.message || `HTTP ${r.status}` };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

async function listModels(key) {
  try {
    const r = await fetch(`${BASE}/models?pageSize=200&key=${encodeURIComponent(key)}`);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      return { ok: false, error: j?.error?.message || `HTTP ${r.status}` };
    }
    const j = await r.json();
    const models = (j.models || [])
      .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map(m => ({
        id: (m.name || '').replace(/^models\//, ''),
        name: m.displayName || (m.name || '').replace(/^models\//, ''),
        created: 0,
      }))
      .filter(m => m.id);
    return { ok: true, models };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

async function stream({ apiKey, model, messages, id, emit }) {
  const mdl = model || 'gemini-2.5-flash';
  const url = `${BASE}/models/${encodeURIComponent(mdl)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;
  const body = {
    contents: messages
      .filter(m => m.role !== 'system')
      .map(m => {
        const parts = [];
        for (const a of (m.attachments || [])) {
          if (a.kind === 'image' && a.data) {
            parts.push({ inlineData: { mimeType: a.mediaType || 'image/png', data: a.data } });
          }
        }
        if (m.text) parts.push({ text: m.text });
        return { role: m.role === 'assistant' ? 'model' : 'user', parts };
      }),
  };
  const sys = messages.find(m => m.role === 'system')?.text;
  if (sys) body.systemInstruction = { parts: [{ text: sys }] };

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok || !resp.body) {
    const t = await resp.text().catch(() => '');
    emit({ id, type: 'error', error: `google ${resp.status}: ${t.slice(0, 400)}` });
    return;
  }
  await forEachSSELine(resp.body, line => {
    if (!line.startsWith('data:')) return;
    const data = line.slice(5).trim();
    if (!data) return;
    try {
      const j = JSON.parse(data);
      const parts = j.candidates?.[0]?.content?.parts || [];
      for (const p of parts) if (p.text) emit({ id, type: 'delta', text: p.text });
    } catch {}
  });
  emit({ id, type: 'done' });
}

module.exports = { verify, listModels, stream };
