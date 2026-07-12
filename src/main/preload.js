/**
 * Preload bridge.
 *
 * Runs in both windows the shell ever shows: the local bootstrap page, and the
 * sidecar-served app itself (a preload is bound to the BrowserWindow, not to an
 * origin, so it survives `loadURL` onto http://127.0.0.1). That's what lets the
 * web UI - which is otherwise an ordinary page served over HTTP - reach native
 * capabilities like the auto-updater.
 *
 * `window.inferml` is deliberately NOT defined here. The server serves
 * web-bridge.js, which owns that namespace and would overwrite anything we set.
 * Instead we expose `window.infermlDesktop`, which web-bridge.js detects and
 * delegates to for the handful of things HTTP can't do (see updates.*).
 */
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const on = (channel) => (cb) => {
  const handler = (_evt, payload) => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld('infermlDesktop', {
  isDesktop: true,

  // Consumed by bootstrap.html while the venv is built and the server starts.
  boot: {
    onStatus: on('boot:status'),
    onLog: on('boot:log'),
    onPythonMissing: on('boot:python-missing'),
    onError: on('boot:error'),
    retry: () => ipcRenderer.invoke('boot:retry'),
    openPythonDownload: () => ipcRenderer.invoke('boot:open-python-download'),
  },

  app: {
    paths: () => ipcRenderer.invoke('app:paths'),
    showLogs: () => ipcRenderer.invoke('app:show-logs'),
    showServerLog: () => ipcRenderer.invoke('app:copy-diagnostics'),
    // Ready-to-paste `claude mcp add ...` for this install.
    mcpCommand: () => ipcRenderer.invoke('app:mcp-command'),
  },

  // Replaces the old pipx self-update path. electron-updater pulls installers
  // from GitHub Releases; the renderer's existing Settings UI drives it through
  // web-bridge.js.
  updates: {
    check: (opts) => ipcRenderer.invoke('updates:check', opts || {}),
    download: () => ipcRenderer.invoke('updates:download'),
    install: () => ipcRenderer.invoke('updates:install'),
    onProgress: on('updates:progress'),
    onDownloaded: on('updates:downloaded'),
    onError: on('updates:error'),
  },
});
