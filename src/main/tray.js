/**
 * System tray / menu bar presence.
 *
 * This is what turns InferML from "an app you launch" into "a service that's
 * there" - the Ollama model. Closing the window hides it; the server, the loaded
 * models, and the OpenAI-compatible API keep running behind the tray icon. Quit
 * is an explicit act, because quitting drops multi-GB models out of memory and
 * kills an API that other processes may be talking to.
 *
 * The menu is rebuilt on demand rather than kept in sync with a live handle, so
 * the status line can't drift from reality.
 */
'use strict';

const { app, Menu, Tray, clipboard, nativeImage } = require('electron');
const path = require('path');

let tray = null;

function iconPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'logo.png')
    : path.join(__dirname, '..', '..', 'assets', 'logo.png');
}

function trayImage() {
  // The source art is 1024x1024; a tray needs ~16-22px. Electron will happily
  // render the full-size image and produce a comically large icon, so resize.
  const img = nativeImage.createFromPath(iconPath());
  if (img.isEmpty()) return img;
  return img.resize({ width: 18, height: 18, quality: 'best' });
}

/**
 * @param {object} o
 * @param {() => void}    o.onOpen    show/focus the main window
 * @param {() => void}    o.onQuit    really quit (stops the sidecar)
 * @param {() => string?} o.getUrl    the server's base URL, or null while booting
 */
function createTray({ onOpen, onQuit, getUrl }) {
  if (tray) return tray;

  tray = new Tray(trayImage());
  tray.setToolTip('InferML');

  const rebuild = () => {
    const url = getUrl();
    const openAtLogin = app.getLoginItemSettings().openAtLogin;

    tray.setContextMenu(Menu.buildFromTemplate([
      {
        label: url ? `InferML - running on ${url.replace('http://', '')}` : 'InferML - starting...',
        enabled: false,
      },
      { type: 'separator' },
      { label: 'Open InferML', click: onOpen },
      {
        label: 'Copy API base URL',
        enabled: !!url,
        click: () => { if (url) clipboard.writeText(`${url}/v1`); },
      },
      { type: 'separator' },
      {
        label: 'Launch at login',
        type: 'checkbox',
        checked: openAtLogin,
        click: (item) => {
          // `--hidden` is read back in main.js: an auto-started InferML warms up
          // in the tray without stealing focus with a window nobody asked for.
          app.setLoginItemSettings({
            openAtLogin: item.checked,
            openAsHidden: true,
            args: ['--hidden'],
          });
          rebuild();
        },
      },
      { type: 'separator' },
      { label: 'Quit InferML', click: onQuit },
    ]));
  };

  rebuild();
  tray.on('double-click', onOpen);
  // Left-click opens on Windows/Linux, where a click isn't expected to just show
  // the menu the way it is on macOS.
  if (process.platform !== 'darwin') tray.on('click', onOpen);

  tray.refresh = rebuild;
  return tray;
}

function destroyTray() {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

module.exports = { createTray, destroyTray };
