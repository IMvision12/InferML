const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('localml', {
  window: {
    minimize: () => ipcRenderer.invoke('window:min'),
    maximize: () => ipcRenderer.invoke('window:max'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMax'),
    onState: (cb) => {
      const l = (_, s) => cb(s);
      ipcRenderer.on('window:state', l);
      return () => ipcRenderer.removeListener('window:state', l);
    },
  },
  keys: {
    save: (provider, key) => ipcRenderer.invoke('keys:save', provider, key),
    get: (provider) => ipcRenderer.invoke('keys:get', provider),
    getActive: () => ipcRenderer.invoke('keys:getActive'),
    setActive: (provider) => ipcRenderer.invoke('keys:setActive', provider),
    mask: (provider) => ipcRenderer.invoke('keys:mask', provider),
    verify: (provider, key) => ipcRenderer.invoke('keys:verify', provider, key),
    listModels: (provider, key) => ipcRenderer.invoke('keys:listModels', provider, key),
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    save: (patch) => ipcRenderer.invoke('settings:save', patch),
  },
  chats: {
    list: () => ipcRenderer.invoke('chats:list'),
    get: (id) => ipcRenderer.invoke('chats:get', id),
    save: (chat) => ipcRenderer.invoke('chats:save', chat),
    patch: (id, patch) => ipcRenderer.invoke('chats:patch', id, patch),
    delete: (id) => ipcRenderer.invoke('chats:delete', id),
    onUpdate: (cb) => {
      const l = () => cb();
      ipcRenderer.on('chats:updated', l);
      return () => ipcRenderer.removeListener('chats:updated', l);
    },
  },
  hw: {
    get: () => ipcRenderer.invoke('hw:get'),
    subscribe: (cb) => {
      const l = (_, data) => cb(data);
      ipcRenderer.on('hw:update', l);
      return () => ipcRenderer.removeListener('hw:update', l);
    },
  },
  hf: {
    search: (q, task) => ipcRenderer.invoke('hf:search', q, task),
    installed: () => ipcRenderer.invoke('hf:installed'),
    markInstalled: (id, meta) => ipcRenderer.invoke('hf:markInstalled', id, meta),
    uninstall: (id) => ipcRenderer.invoke('hf:uninstall', id),
    modelInfo: (id) => ipcRenderer.invoke('hf:modelInfo', id),
    // Access token for gated repos (Llama, Gemma, etc.).
    getToken: () => ipcRenderer.invoke('hf:getToken'),
    hasToken: () => ipcRenderer.invoke('hf:hasToken'),
    setToken: (token) => ipcRenderer.invoke('hf:setToken', token),
    clearToken: () => ipcRenderer.invoke('hf:clearToken'),
    verifyToken: (token) => ipcRenderer.invoke('hf:verifyToken', token),
    onInstallsChanged: (cb) => {
      const l = () => { try { cb(); } catch {} };
      ipcRenderer.on('hf:installsChanged', l);
      return () => ipcRenderer.removeListener('hf:installsChanged', l);
    },
  },
  // One global listener for `chat:event` that dispatches to per-id callback
  // sets. Previously every `send()` attached its own listener, so a renderer
  // that forgot to `dispose()` would leak one listener per chat (and every
  // streamed token would O(N²)-iterate over them). With this design the
  // single listener routes by id, and disposing just removes the entry.
  chat: (() => {
    const _streams = new Map(); // id → Set<callback>
    let _wired = false;
    const _listener = (_, msg) => {
      if (!msg || msg.id == null) return;
      const cbs = _streams.get(msg.id);
      if (!cbs) return;
      for (const cb of cbs) {
        try { cb(msg); } catch {}
      }
    };
    return {
      send: (payload) => {
        if (!_wired) { ipcRenderer.on('chat:event', _listener); _wired = true; }
        const id = payload.id || ('c-' + Math.random().toString(36).slice(2));
        ipcRenderer.send('chat:send', { ...payload, id });
        const listeners = new Set();
        _streams.set(id, listeners);
        return {
          id,
          on: (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
          dispose: () => { listeners.clear(); _streams.delete(id); },
        };
      },
    };
  })(),
  dialog: {
    openImage: () => ipcRenderer.invoke('dialog:openImage'),
    openAudio: () => ipcRenderer.invoke('dialog:openAudio'),
  },
  tasks: {
    run: (payload) => ipcRenderer.invoke('tasks:run', payload),
    status: () => ipcRenderer.invoke('tasks:status'),
    // Synchronous filesystem-only status. Returns runtimeInstalled +
    // accelerator info without spawning Python. Safe to call once at
    // renderer init to seed pyStatus on the first paint.
    statusSync: () => { try { return ipcRenderer.sendSync('tasks:statusSync'); } catch { return null; } },
    setup: (opts) => ipcRenderer.invoke('tasks:setup', opts),
    download: (modelId) => ipcRenderer.invoke('tasks:download', modelId),
    cancelDownload: (modelId) => ipcRenderer.invoke('tasks:cancelDownload', modelId),
    stop: () => ipcRenderer.invoke('tasks:stop'),
    onSetupProgress: (cb) => {
      const l = (_, evt) => cb(evt);
      ipcRenderer.on('tasks:setupProgress', l);
      return () => ipcRenderer.removeListener('tasks:setupProgress', l);
    },
    onDownloadProgress: (cb) => {
      const l = (_, evt) => cb(evt);
      ipcRenderer.on('tasks:downloadProgress', l);
      return () => ipcRenderer.removeListener('tasks:downloadProgress', l);
    },
  },
  app: {
    version: () => ipcRenderer.invoke('app:version'),
    paths: () => ipcRenderer.invoke('app:paths'),
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  },
  storage: {
    size: (key) => ipcRenderer.invoke('storage:size', key),
    clearHfCache:    () => ipcRenderer.invoke('storage:clearHfCache'),
    clearPyRuntime:  () => ipcRenderer.invoke('storage:clearPyRuntime'),
  },
  logs: {
    list:  (opts) => ipcRenderer.invoke('logs:list', opts),
    clear: ()     => ipcRenderer.invoke('logs:clear'),
    path:  ()     => ipcRenderer.invoke('logs:path'),
    view:  ()     => ipcRenderer.invoke('logs:view'),
    onUpdate: (cb) => {
      const l = (_, evt) => cb(evt);
      ipcRenderer.on('logs:updated', l);
      return () => ipcRenderer.removeListener('logs:updated', l);
    },
  },
  updates: {
    check:    (opts) => ipcRenderer.invoke('updates:check', opts),
    download: () => ipcRenderer.invoke('updates:download'),
    install:  () => ipcRenderer.invoke('updates:install'),
    onProgress: (cb) => {
      const l = (_, evt) => cb(evt);
      ipcRenderer.on('updates:downloadProgress', l);
      return () => ipcRenderer.removeListener('updates:downloadProgress', l);
    },
    onDownloaded: (cb) => {
      const l = (_, evt) => cb(evt);
      ipcRenderer.on('updates:downloaded', l);
      return () => ipcRenderer.removeListener('updates:downloaded', l);
    },
    onError: (cb) => {
      const l = (_, evt) => cb(evt);
      ipcRenderer.on('updates:error', l);
      return () => ipcRenderer.removeListener('updates:error', l);
    },
  },
});
