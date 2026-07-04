const { ipcMain } = require('electron');
const fs = require('fs/promises');
const { paths, readJSON, writeJSON } = require('../services/storage');
const { safeBroadcast: broadcast } = require('../services/broadcast');

// A chat id is what we splice into a filesystem path. Reject anything that
// could escape `<userData>/chats/` or shadow a config file. The renderer
// produces ids like "c-abc123" via Math.random — this allow-list happily
// accepts those and refuses traversal payloads, hidden files, and oversized
// strings.
function isValidChatId(id) {
  if (typeof id !== 'string') return false;
  if (id.length === 0 || id.length > 200) return false;
  if (id.includes('/') || id.includes('\\')) return false;
  if (id.includes('..') || id.startsWith('.')) return false;
  return true;
}

// Fields the renderer must NEVER be allowed to set via patch. `id` is part of
// the file path so changing it desyncs the chat. `createdAt` is meant to be
// immutable history. Anything else is renderer-owned.
const PROTECTED_PATCH_FIELDS = new Set(['id', 'createdAt']);

// Fields owned by metadata flows (kebab menu — Pin) that a stale full-chat
// save coming from the chat workspace must NOT clobber. Without this, racing
// a `chats:patch({pinned:true})` against an in-flight `chats:save(done)`
// from the workspace silently un-pins the chat as soon as the inference
// finishes (the workspace's save uses state captured before the patch ran).
const METADATA_FIELDS = ['pinned'];

function register() {
  ipcMain.handle('chats:list', async () => {
    try {
      const files = await fs.readdir(paths.chatsDir());
      const out = [];
      for (const f of files) {
        if (!f.endsWith('.json')) continue;
        const c = await readJSON(paths.chatFile(f.replace(/\.json$/, '')), null);
        if (c) out.push({
          id: c.id, title: c.title, sub: c.sub, tag: c.tag,
          kind: c.kind || 'chat',
          modelId: c.modelId || c.model || null,
          model: c.model || c.modelId || null,
          task: c.task || null,
          workspace: c.workspace,
          turns: (c.messages || []).length,
          runs: (c.runs || []).length,
          updatedAt: c.updatedAt || 0, createdAt: c.createdAt || 0,
          running: !!c.running,
          pinned: !!c.pinned,
        });
      }
      // Pinned chats first, then by updatedAt desc. Pinning doesn't bump
      // updatedAt (see chats:patch below) so a pinned-then-unpinned chat
      // returns to its original time slot rather than jumping to top.
      out.sort((a, b) => {
        if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
        return (b.updatedAt || 0) - (a.updatedAt || 0);
      });
      return out;
    } catch { return []; }
  });
  ipcMain.handle('chats:get', (_, id) => {
    if (!isValidChatId(id)) return null;
    return readJSON(paths.chatFile(id), null);
  });
  ipcMain.handle('chats:save', async (_, chat) => {
    if (!chat || !isValidChatId(chat.id)) throw new Error('chat.id required');
    // Read what's on disk so concurrent metadata-only writes (chats:patch
    // setting `pinned`) survive a full save coming back from the chat
    // workspace with stale state. `chat` from the renderer wins for the
    // fields it actually owns; metadata fields are pulled from disk unless
    // the renderer explicitly set them.
    const existing = (await readJSON(paths.chatFile(chat.id), null)) || {};
    const merged = { ...existing, ...chat };
    for (const k of METADATA_FIELDS) {
      if (!(k in chat) && (k in existing)) merged[k] = existing[k];
    }
    merged.updatedAt = Date.now();
    if (!merged.createdAt) merged.createdAt = merged.updatedAt;
    await writeJSON(paths.chatFile(chat.id), merged);
    broadcast('chats:updated');
    return true;
  });
  // Partial update — useful for pin/rename so we don't have to round-trip
  // the full chat JSON. Caller decides whether to bump `updatedAt`: omit it
  // for pin/unpin (so the chat keeps its time slot when unpinned), include
  // it explicitly for rename (so the edit shows up as recent activity).
  ipcMain.handle('chats:patch', async (_, id, patch) => {
    if (!isValidChatId(id)) throw new Error('invalid chat id');
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      throw new Error('patch must be an object');
    }
    const chat = await readJSON(paths.chatFile(id), null);
    if (!chat) return false;
    // Strip protected fields so a malicious / buggy renderer can't relabel
    // a chat's id (which would desync the JSON's `id` field from its filename
    // — and, with no validation downstream, would let the renderer aim
    // subsequent operations at unrelated files).
    for (const [k, v] of Object.entries(patch)) {
      if (PROTECTED_PATCH_FIELDS.has(k)) continue;
      chat[k] = v;
    }
    await writeJSON(paths.chatFile(id), chat);
    broadcast('chats:updated');
    return true;
  });
  ipcMain.handle('chats:delete', async (_, id) => {
    if (!isValidChatId(id)) return false;
    try { await fs.unlink(paths.chatFile(id)); } catch {}
    broadcast('chats:updated');
    return true;
  });
}

module.exports = { register };
