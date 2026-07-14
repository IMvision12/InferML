/**
 * Preload for the output viewer window.
 *
 * Deliberately tiny, and deliberately not the app's preload: the viewer renders
 * artifacts produced by whatever program called the local API, so it gets one
 * inbound channel and no way to reach the engine, the filesystem, or settings.
 */
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('viewer', {
  /** Called with each finished result. Returns an unsubscribe function. */
  onOutput: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on('viewer:output', handler);
    return () => ipcRenderer.off('viewer:output', handler);
  },
});
