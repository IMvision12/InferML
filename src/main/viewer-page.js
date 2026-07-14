/**
 * Renderer for the output viewer window.
 *
 * Every node here is built with createElement/textContent - never innerHTML.
 * The strings it renders (model ids, labels) come from HuggingFace models and
 * from whatever program called the local API, so none of them are ours to
 * trust, and this page holds base64 artifacts from those same callers.
 *
 * Items are typed by MIME family upstream (python/api/viewer.py), so image,
 * audio and video all land here through the same door and a new media type
 * needs no new branch.
 */
'use strict';

const MAX_CARDS = 20;

const stack = document.getElementById('stack');

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

const pct = (score) => `${(Number(score || 0) * 100).toFixed(1)}%`;

const clock = (ms) =>
  new Date(ms || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** A data URL we can hand to <a download> - the extension follows the MIME. */
function saveLink(item, model) {
  const ext = String(item.mime || '').split('/')[1] || 'bin';
  const stem = String(model || 'output').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
  const a = el('a', 'save', 'Save');
  a.href = item.src;
  a.download = `${stem || 'output'}.${ext}`;
  return a;
}

function renderMedia(item) {
  if (item.type === 'audio' || item.type === 'video') {
    const n = el(item.type === 'audio' ? 'audio' : 'video', 'media');
    n.controls = true;
    n.src = item.src;
    return n;
  }
  // Images: fit the window, click to inspect at natural size inside a scroller
  // rather than growing the card past the viewport.
  const scroller = el('div', 'scroller');
  const img = el('img', 'media');
  img.src = item.src;
  img.alt = 'Model output';
  img.addEventListener('click', () => img.classList.toggle('zoom'));
  scroller.appendChild(img);
  return scroller;
}

function renderBoxes(boxes) {
  const table = el('table', 'rows');
  for (const b of boxes) {
    const row = el('tr');
    row.appendChild(el('td', 'label', String(b.label ?? '')));
    row.appendChild(el('td', 'score', pct(b.score)));
    const box = Array.isArray(b.box) ? b.box : [b.box?.x, b.box?.y, b.box?.w, b.box?.h];
    row.appendChild(el('td', 'box',
      box.every((v) => typeof v === 'number')
        ? box.map((v) => v.toFixed(3)).join('  ')
        : ''));
    table.appendChild(row);
  }
  return table;
}

function renderLabels(labels) {
  const table = el('table', 'rows');
  for (const l of labels) {
    const row = el('tr');
    row.appendChild(el('td', 'label', String(l.label ?? '')));
    const barCell = el('td');
    const bar = el('div', 'bar');
    const fill = el('span');
    fill.style.width = `${Math.max(0, Math.min(1, Number(l.score || 0))) * 100}%`;
    bar.appendChild(fill);
    barCell.appendChild(bar);
    row.appendChild(barCell);
    row.appendChild(el('td', 'score', pct(l.score)));
    table.appendChild(row);
  }
  return table;
}

function renderLegend(legend) {
  const chips = el('div', 'chips');
  for (const e of legend) {
    const chip = el('div', 'chip');
    const swatch = el('span', 'swatch');
    // Colours come from the segmentation adapter, but style.background is a
    // parser, not an evaluator: a bad value is simply ignored.
    swatch.style.background = String(e.color || 'transparent');
    chip.appendChild(swatch);
    chip.appendChild(el('span', null, String(e.label ?? '')));
    chips.appendChild(chip);
  }
  return chips;
}

function renderItem(item, model) {
  switch (item.type) {
    case 'image':
    case 'audio':
    case 'video':
      return renderMedia(item);
    case 'text':
      return el('pre', 'text', item.text || '');
    case 'boxes':
      return item.boxes?.length ? renderBoxes(item.boxes) : null;
    case 'labels':
      return item.labels?.length ? renderLabels(item.labels) : null;
    case 'legend':
      return item.legend?.length ? renderLegend(item.legend) : null;
    case 'vector':
      return el('pre', 'text',
        `${item.dim}-dim vector\n[${(item.sample || []).map((v) => Number(v).toFixed(4)).join(', ')}, …]`);
    case 'file':
      return el('pre', 'text', `${item.mime} (use Save)`);
    default:
      return null;
  }
}

function renderCard(payload) {
  const card = el('div', 'card');

  const head = el('div', 'head');
  head.appendChild(el('span', 'model', String(payload.model || 'model')));
  if (payload.task) head.appendChild(el('span', 'task', String(payload.task)));
  head.appendChild(el('span', 'time', clock(payload.createdAt)));

  const media = payload.items.find((i) => i.src);
  if (media) head.appendChild(saveLink(media, payload.model));
  card.appendChild(head);

  const body = el('div', 'body');
  for (const item of payload.items) {
    const node = renderItem(item, payload.model);
    if (node) body.appendChild(node);
  }
  card.appendChild(body);
  return card;
}

window.viewer.onOutput((payload) => {
  if (!payload || !Array.isArray(payload.items)) return;

  const empty = stack.querySelector('.empty');
  if (empty) empty.remove();

  // Newest first: the result you just triggered is the one you want to look at.
  stack.prepend(renderCard(payload));
  while (stack.children.length > MAX_CARDS) stack.lastElementChild.remove();
  window.scrollTo({ top: 0 });
});
