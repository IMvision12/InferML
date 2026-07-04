const path = require('path');
const fs = require('fs');
const os = require('os');
const { app } = require('electron');
const { paths, readJSON, writeJSON } = require('./storage');
const hfCache = require('./hf-cache');
const sidecar = require('./python-sidecar');

// ─────────────────────────────────────────────────────────────────────────────
// Support filter: model_type whitelist.
//
// Single source of truth lives in python/supported_architectures.json —
// pipeline_tag → [canonical model_type tags]. A repo passes iff its tags
// array contains one of those model_type identifiers for its pipeline_tag.
//
// Why model_type tags (not config.architectures): the HF list API returns
// tags but NOT config.architectures — we'd need a per-model fetch to see
// class names. The model_type tag (e.g. `segformer`, `sam`, `detr`, `qwen3`)
// is transformers' canonical identifier and IS in the list response.
//
// Libraries that don't expose a model_type tag (diffusers stores its pipeline
// in model_index.json) pass on library_name alone.
// ─────────────────────────────────────────────────────────────────────────────

// In dev: <repo>/python/. In packaged: process.resourcesPath/python/ (extraResources).
const PY_DIR = app.isPackaged
  ? path.join(process.resourcesPath, 'python')
  : path.join(__dirname, '..', '..', '..', 'python');
const MATRIX_PATH = path.join(PY_DIR, 'supported_architectures.json');

let TYPES_BY_TASK = {};
let LIBRARY_PASSTHROUGH = new Set();

try {
  const raw = JSON.parse(fs.readFileSync(MATRIX_PATH, 'utf8'));
  for (const [key, value] of Object.entries(raw)) {
    if (key.startsWith('_')) continue;
    if (!Array.isArray(value)) continue;
    TYPES_BY_TASK[key] = new Set(value.map(v => String(v).toLowerCase()));
  }
  const pt = raw._library_passthrough?.libraries || [];
  LIBRARY_PASSTHROUGH = new Set(pt.map(v => String(v).toLowerCase()));
} catch (e) {
  console.warn('[huggingface] failed to load supported_architectures.json:', e.message);
}

// Weight-format tags that mean "this repo ships only in a format our sidecar
// can't load". Orthogonal to model_type: a Llama repo with only .gguf files
// still matches model_type=llama, but the format tag rejects it.
const UNSUPPORTED_FORMAT_TAGS = new Set([
  'gguf', 'ggml', 'llama.cpp',
  'exl2', 'exllama', 'exllamav2',
]);

function _lower(x) { return String(x || '').toLowerCase(); }

// HF's pipeline_tag is a display hint, not a runtime contract. It sometimes
// misclassifies multimodal models (idefics-9b, Emu3-Chat → "text-generation"
// even though they accept image input), and is occasionally null
// (google/long-t5-local-base) or set to a task we don't filter on
// ("any-to-any" for unified gen+understanding models). The model_type tag
// in tags[] is more reliable: it uniquely identifies which adapter we'd use.
// So: prefer model_type-based task inference, fall back to pipeline_tag, then
// to scanning tags[] for a task name.
function resolveTask(m) {
  const tags = (m.tags || []).map(_lower);
  for (const [task, types] of Object.entries(TYPES_BY_TASK)) {
    if (tags.some(t => types.has(t))) return task;
  }
  if (m.pipeline_tag && TYPES_BY_TASK[m.pipeline_tag]) return m.pipeline_tag;
  for (const t of tags) {
    if (TYPES_BY_TASK[t]) return t;
  }
  return null;
}

// Libraries that aren't `transformers` but ship weights transformers can load
// through `trust_remote_code=True`. Same load path as transformers under the
// hood — the library_name is just a vendor label. The model_type whitelist
// still applies, so random repos under these labels still get rejected unless
// their model_type matches a registered family.
//   - ml-fastvlm: Apple's FastVLM uses llava_qwen + custom modeling code
//   - mistral-common: Mistral labels Voxtral repos this way; transformers
//     ships VoxtralForConditionalGeneration which loads them fine
const TRUST_REMOTE_CODE_LIBRARIES = new Set([
  'ml-fastvlm',
  'mistral-common',
]);

function isNativelySupported(m) {
  const library = _lower(m.library_name);
  const tags = (m.tags || []).map(_lower);

  // Reject weight formats our sidecar can't load.
  if (tags.some(t => UNSUPPORTED_FORMAT_TAGS.has(t))) return false;

  if (LIBRARY_PASSTHROUGH.has(library)) {
    // diffusers / timm — accept on library_name alone (they use different
    // model_type conventions: diffusers stores its pipeline in model_index.json,
    // timm uses its own arch tags).
    return true;
  } else if (library === 'transformers' || library === '' || TRUST_REMOTE_CODE_LIBRARIES.has(library)) {
    // transformers-native, OR a no-library-name repo (some older uploads),
    // OR a custom-runtime label that loads through trust_remote_code with
    // a transformers-canonical model_type tag (FastVLM). Falls through to
    // the model_type whitelist check below.
  } else {
    // Other runtimes (ultralytics, paddle, keras, exllama, vllm, …) — reject.
    return false;
  }

  // Must have at least one whitelisted model_type tag for this task.
  const task = resolveTask(m);
  if (!task) return false;
  const allowed = TYPES_BY_TASK[task];
  if (!allowed || allowed.size === 0) return false;
  return tags.some(t => allowed.has(t));
}

// ─── HF API fan-out ────────────────────────────────────────────────────────
// HF sorts by downloads so popular models dominate a small `limit`. Bumping
// to 100 per query and merging lets D-FINE / RT-DETR variants (ranked in the
// 30–60 range) surface alongside the mega-popular DETR/YOLOS checkpoints.

async function fetchModelList({ q, task, library, limit = 100 }) {
  const params = new URLSearchParams();
  if (q) params.set('search', q);
  if (task) params.set('pipeline_tag', task);
  if (library) params.set('library', library);
  params.set('limit', String(limit));
  params.set('full', 'true');
  params.set('sort', 'downloads');
  params.set('direction', '-1');
  const url = `https://huggingface.co/api/models?${params.toString()}`;
  const r = await fetch(url);
  if (!r.ok) {
    const err = new Error(`HF API ${r.status}${r.statusText ? ' ' + r.statusText : ''}`);
    err.status = r.status;
    err.url = url;
    throw err;
  }
  return await r.json();
}

async function search(q, task) {
  // Two queries: one transformers-library slice (mostly for future-proofing —
  // HF currently ignores library= when search= is set) plus a broad task-only
  // safety net that catches repos where library_name is missing but tags
  // still identify the runtime. All results pass through isNativelySupported()
  // so the safety net can't leak YOLO/PaddleOCR repos.
  //
  // Historical note: we used to fan out 3 library-specific queries
  // (transformers/diffusers) but HF's search endpoint
  // silently ignores the `library` parameter when `search` or `pipeline_tag`
  // is set — empirically they all return the same top-N. Consolidating
  // avoids 3× the HF API calls per keystroke.
  const queries = [
    { q, task, library: 'transformers', limit: 100 },
  ];
  if (task || q) queries.push({ q, task, limit: 100 });

  const settled = await Promise.allSettled(queries.map(o => fetchModelList(o)));
  const lists = [];
  const errors = [];
  for (const s of settled) {
    if (s.status === 'fulfilled') lists.push(s.value);
    else errors.push(s.reason);
  }
  // If every query failed, surface the error so the UI shows "Error: …"
  // rather than a misleading "No results.".
  if (lists.length === 0 && errors.length > 0) {
    const first = errors[0];
    throw first instanceof Error ? first : new Error(String(first));
  }
  // Some queries failed but at least one succeeded — log the partial failure.
  if (errors.length > 0) {
    console.warn('[hf.search] partial failure:', errors.map(e => e?.message || String(e)).join('; '));
  }

  const byId = new Map();
  for (const list of lists) {
    for (const m of list) {
      const id = m.id || m.modelId;
      if (!id || byId.has(id)) continue;
      if (!isNativelySupported(m)) continue;
      byId.set(id, m);
    }
  }

  const merged = [...byId.values()];
  merged.sort((a, b) => (b.downloads || 0) - (a.downloads || 0));

  const installs = (await readJSON(paths.installsFile(), {})) || {};
  return merged.map(m => {
    const id = m.id || m.modelId;
    const size = estimateSize(m);
    return {
      id,
      path: id,
      nm: id.split('/').pop(),
      author: id.split('/')[0],
      task: resolveTask(m) || task || '',
      library: m.library_name || null,
      tags: Array.isArray(m.tags) ? m.tags : [],
      params: estimateParams(m),
      size: size ? humanBytes(size) : '-',
      dl: humanCompact(m.downloads || 0),
      likes: m.likes || 0,
      desc: (m.cardData?.summary || m.cardData?.description || shortLib(m)) || '',
      license: m.cardData?.license || '',
      hw: sizeToHw(size),
      installed: !!installs[id],
    };
  });
}

async function listInstalled() {
  return (await readJSON(paths.installsFile(), {})) || {};
}

// Walk the installs registry and drop entries whose snapshot dir is no longer
// on disk. Catches the case where the user wiped the HF cache out-of-band
// (e.g. manually deleted ~/.cache/huggingface or the userData/hf-cache folder)
// — without this, the Hub keeps showing them as "Installed" with phantom
// "Open" buttons that fail when clicked.
//
// Repo layout in the HF cache: <HF_HOME>/hub/models--<owner>--<name>/.
// We check every plausible cache root across all OSes:
//   - userData/hf-cache/hub                  LocalML's HF_HOME target
//   - $HF_HUB_CACHE                          external override (rare)
//   - $HF_HOME/hub                           user-set HF env var
//   - $XDG_CACHE_HOME/huggingface/hub        Linux convention when XDG_CACHE_HOME set
//   - ~/.cache/huggingface/hub               default on Linux/macOS/Windows
//                                            (huggingface_hub uses ~/.cache on
//                                            Windows too, not %APPDATA%)
function _cacheRootsForReconcile() {
  const roots = [];
  roots.push(path.join(app.getPath('userData'), 'hf-cache', 'hub'));
  if (process.env.HF_HUB_CACHE)   roots.push(process.env.HF_HUB_CACHE);
  if (process.env.HF_HOME)        roots.push(path.join(process.env.HF_HOME, 'hub'));
  if (process.env.XDG_CACHE_HOME) roots.push(path.join(process.env.XDG_CACHE_HOME, 'huggingface', 'hub'));
  roots.push(path.join(os.homedir(), '.cache', 'huggingface', 'hub'));
  const seen = new Set();
  return roots.filter((r) => {
    const n = path.resolve(r);
    if (seen.has(n)) return false;
    seen.add(n);
    return true;
  });
}

function _modelRepoDirName(modelId) {
  // owner/name → models--owner--name. HF replaces `/` with `--`, leaves the
  // rest alone. (Repo ids on HF are restricted to alphanumerics, `_`, `-`, `.`.)
  return 'models--' + String(modelId).replace(/\//g, '--');
}

function _modelExistsOnDisk(modelId) {
  const dirName = _modelRepoDirName(modelId);
  for (const root of _cacheRootsForReconcile()) {
    const candidate = path.join(root, dirName);
    try {
      const stat = fs.statSync(candidate);
      if (stat.isDirectory()) {
        // Empty model dirs (e.g. cancelled mid-download) shouldn't count.
        // A real install has at least a `snapshots/` subdir with content.
        const snaps = path.join(candidate, 'snapshots');
        if (fs.existsSync(snaps) && fs.readdirSync(snaps).length > 0) return true;
      }
    } catch {}
  }
  return false;
}

async function reconcileInstalls() {
  const cur = (await readJSON(paths.installsFile(), {})) || {};
  const ids = Object.keys(cur);
  if (ids.length === 0) return { kept: 0, removed: 0 };
  const next = {};
  let removed = 0;
  for (const id of ids) {
    if (_modelExistsOnDisk(id)) {
      next[id] = cur[id];
    } else {
      removed += 1;
    }
  }
  if (removed > 0) {
    await writeJSON(paths.installsFile(), next);
  }
  return { kept: Object.keys(next).length, removed };
}
// Broadcast to every open renderer that installs.json changed. The titlebar
// "N local models" pill, the Hub's Installed list, and the Settings cache row
// all subscribe and re-fetch on this event so a freshly downloaded model
// appears the moment the registry write completes.
function _broadcastInstallsChanged() {
  try {
    const { BrowserWindow } = require('electron');
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.webContents.send('hf:installsChanged');
    }
  } catch {}
}

async function markInstalled(id, meta) {
  const cur = (await readJSON(paths.installsFile(), {})) || {};
  cur[id] = { ...(meta || {}), installedAt: Date.now() };
  await writeJSON(paths.installsFile(), cur);
  _broadcastInstallsChanged();
  return true;
}
async function uninstall(id) {
  const cur = (await readJSON(paths.installsFile(), {})) || {};
  delete cur[id];
  await writeJSON(paths.installsFile(), cur);
  // ALSO delete the model's cache dirs from disk. Without this, the Settings
  // → Storage row keeps showing the old GB count even after the user has
  // removed every model from the Hub. The Python sidecar may hold mmap
  // handles into the snapshot files, so stop it first on Windows where
  // open files block deletion.
  let cacheResult = { removed: [], errors: [] };
  try {
    if (sidecar.isRunning && sidecar.isRunning()) {
      try { await sidecar.stop({ graceful: true, timeoutMs: 2500 }); } catch {}
    }
    cacheResult = await hfCache.deleteModel(id);
  } catch (e) {
    cacheResult = { removed: [], errors: [{ path: id, error: String(e?.message || e) }] };
  }
  _broadcastInstallsChanged();
  return { ok: true, removed: cacheResult.removed, errors: cacheResult.errors };
}

async function modelInfo(id) {
  // HF repo ids are `owner/name` — encode each segment but preserve the slash.
  const safeId = String(id).split('/').map(encodeURIComponent).join('/');
  try {
    const r = await fetch(`https://huggingface.co/api/models/${safeId}?blobs=true`);
    if (!r.ok) return { id, size: null, bytes: 0, status: r.status };
    const m = await r.json();
    // `usedStorage` from HF is the total of every file in the repo — for repos
    // that ship the same weights in 4 formats (safetensors + bin + msgpack +
    // h5) plus an onnx/ folder, it's wildly inflated vs. what we actually
    // fetch. Always go through the per-format picker when siblings are
    // present.
    const bytes = estimateSize(m) || (Array.isArray(m.siblings) ? 0 : (m.usedStorage || 0));
    return { id, bytes, size: bytes ? humanBytes(bytes) : null, hw: sizeToHw(bytes) };
  } catch {
    return { id, size: null, bytes: 0 };
  }
}

function estimateParams(m) {
  const tags = m.tags || [];
  const t = tags.find(x => /\b(\d+(?:\.\d+)?[bmk])\b/i.test(x));
  if (t) {
    const match = t.match(/(\d+(?:\.\d+)?[bmk])/i);
    if (match) return match[1].toUpperCase();
  }
  const m2 = (m.id || '').toLowerCase().match(/(\d+(?:\.\d+)?)\s*b\b/);
  return m2 ? m2[1] + 'B' : '';
}

// Order matches what the Python sidecar's snapshot_download will fetch — keep
// these two in sync (see python/runner.py `_pick_weight_format`).
const WEIGHT_FORMAT_ORDER = ['safetensors', 'bin', 'pt', 'ckpt', 'msgpack', 'h5', 'onnx', 'ot'];
const WEIGHT_EXT_RX = /\.(safetensors|bin|pt|ckpt|msgpack|h5|onnx|ot)$/i;

// Pick a single weight format and return only its files. Repos like
// openai/whisper-small ship the same weights as safetensors + bin + msgpack +
// onnx + the original .pt — summing them all reports 5.8 GB for a 967 MB
// model. We only download (and display) one format.
function estimateSize(m) {
  const sibs = Array.isArray(m.siblings) ? m.siblings : [];
  if (!sibs.length) return m.usedStorage || 0;

  const groups = {};
  for (const s of sibs) {
    const match = (s.rfilename || '').toLowerCase().match(WEIGHT_EXT_RX);
    if (!match || !s.size) continue;
    (groups[match[1]] = groups[match[1]] || []).push(s);
  }
  for (const ext of WEIGHT_FORMAT_ORDER) {
    if (groups[ext]?.length) {
      return groups[ext].reduce((a, s) => a + (s.size || 0), 0);
    }
  }
  // No recognized weight files — repo might be config-only or unusual layout.
  return m.usedStorage || 0;
}
function sizeToHw(bytes) {
  if (!bytes) return 'ok';
  return (bytes / (1024 ** 3)) > 20 ? 'warn' : 'ok';
}
function shortLib(m) {
  const tags = m.tags || [];
  const libs = ['transformers', 'diffusers', 'peft'];
  const lib = libs.find(l => tags.includes(l));
  return lib ? `${lib} · ${m.pipeline_tag || ''}` : (m.pipeline_tag || '');
}
function humanBytes(b) {
  if (!b) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0, n = b;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}
function humanCompact(n) {
  if (!n) return '0';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(0) + 'k';
  return String(n);
}

module.exports = { search, listInstalled, markInstalled, uninstall, modelInfo, reconcileInstalls };
