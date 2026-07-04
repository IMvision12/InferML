// Shared HF cache resolution + per-model deletion.
//
// The Hub stores a model's weights under `<cacheRoot>/[hub/]models--<owner>--<name>/`.
// "<cacheRoot>" itself can live in any of several places depending on env
// vars + OS conventions, so both the Settings → Storage size walker and the
// Hub → Uninstall flow need to agree on which roots to scan and what subdir
// to look for inside each.
//
// Putting the logic here means there's exactly one source of truth — if a
// future Electron upgrade or HF env-var convention changes, we update it once.

const path = require('path');
const os = require('os');
const fs = require('fs/promises');
const fsSync = require('fs');
const { app } = require('electron');

// Every plausible HF cache root, in priority order:
//   1. <userData>/hf-cache/                LocalML's HF_HOME target
//   2. $HF_HUB_CACHE                       explicit override (if set in shell)
//   3. $HF_HOME/hub                        HF env var; HF_HOME wins over defaults
//   4. $XDG_CACHE_HOME/huggingface         Linux convention when XDG_CACHE_HOME set
//   5. ~/.cache/huggingface                Python-tooling default — used on macOS,
//                                          Linux without XDG, AND Windows (yes,
//                                          huggingface_hub puts the cache under
//                                          ~/.cache on Windows too, not %APPDATA%)
function cachePaths() {
  const candidates = [];
  candidates.push(path.join(app.getPath('userData'), 'hf-cache'));
  if (process.env.HF_HUB_CACHE) candidates.push(process.env.HF_HUB_CACHE);
  if (process.env.HF_HOME)      candidates.push(path.join(process.env.HF_HOME, 'hub'));
  if (process.env.XDG_CACHE_HOME) candidates.push(path.join(process.env.XDG_CACHE_HOME, 'huggingface'));
  candidates.push(path.join(os.homedir(), '.cache', 'huggingface'));
  const seen = new Set();
  return candidates.filter((p) => {
    if (!p) return false;
    const norm = path.resolve(p);
    if (seen.has(norm)) return false;
    seen.add(norm);
    try { return fsSync.existsSync(norm); } catch { return false; }
  });
}

// HF model ids are `owner/repo`. Both segments allow alphanumerics, dots,
// dashes, underscores. Anything else is an attempted abuse — backslashes,
// `..`, drive letters, etc. would let a malicious id escape the cache root
// when joined with path.join (path.join normalizes `\` on Windows). Reject
// at the boundary so deleteModel + modelDirName can never mishandle it.
const MODEL_ID_RE = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/;
function isValidModelId(id) {
  return typeof id === 'string' && id.length > 0 && id.length <= 200 && MODEL_ID_RE.test(id);
}

// Convert a HF model id ("owner/name") into the cache directory name HF uses
// ("models--owner--name"). Caller MUST have validated `id` via isValidModelId
// first — this function trusts its input and is not itself a sanitizer.
function modelDirName(id) {
  if (!id) return null;
  const safe = String(id).trim().replace(/^\/+|\/+$/g, '');
  if (!safe) return null;
  return 'models--' + safe.replace(/\//g, '--');
}

// All on-disk dirs that could contain a model's snapshots/blobs/refs across
// every cache root. Each root is checked at both `<root>/<dir>` (when the
// root is already the hub/) and `<root>/hub/<dir>` (when the root is the
// parent of hub/, e.g. <userData>/hf-cache or ~/.cache/huggingface).
//
// Defense-in-depth: after path.join we re-resolve and check that the result
// is still a descendant of the cache root. path.join normalizes `..` and
// backslash separators, so a malformed dirname could theoretically traverse
// out of the root even if isValidModelId was bypassed — this guard makes
// that impossible.
function modelCacheDirsForId(id) {
  if (!isValidModelId(id)) return [];
  const dir = modelDirName(id);
  if (!dir) return [];
  const out = [];
  for (const root of cachePaths()) {
    const rootAbs = path.resolve(root);
    const candidates = [path.join(root, dir), path.join(root, 'hub', dir)];
    for (const c of candidates) {
      const abs = path.resolve(c);
      if (abs !== rootAbs && !abs.startsWith(rootAbs + path.sep)) continue;
      if (fsSync.existsSync(abs)) out.push(abs);
    }
  }
  return out;
}

// rm -rf every cache subdir for this model id. Returns { removed, errors }.
// Best-effort: a permission denial on one location does not abort the
// others — the caller can still surface a partial-success state if needed.
// Rejects invalid ids at the boundary (returns an empty result + one error)
// so an XSS-injected call from the renderer can't traverse out of the cache.
async function deleteModel(id) {
  if (!isValidModelId(id)) {
    return { removed: [], errors: [{ path: String(id), error: 'invalid model id' }] };
  }
  const dirs = modelCacheDirsForId(id);
  const removed = [];
  const errors = [];
  for (const d of dirs) {
    try {
      await fs.rm(d, { recursive: true, force: true });
      removed.push(d);
    } catch (e) {
      errors.push({ path: d, error: String(e?.message || e) });
    }
  }
  return { removed, errors };
}

module.exports = { cachePaths, modelDirName, modelCacheDirsForId, deleteModel, isValidModelId };
