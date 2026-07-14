/**
 * Where the app's mark lives, for everything that needs to draw it.
 *
 * The file is `assets/logo.png` in the repo and `resources/logo.png` once
 * packaged (electron-builder copies it there), so nothing can just hardcode a
 * path - hence one helper, used by the tray and by every window.
 *
 * Windows also need this explicitly. `electron-builder.yml` sets `win.icon`,
 * which stamps the icon onto the built .exe, so a packaged app looks right - but
 * that does nothing under `npm start`, where the executable is Electron's own.
 * A BrowserWindow with no `icon` shows Electron's default atom in the title bar
 * and the taskbar, which is what made the app look like someone else's.
 */
'use strict';

const { app, nativeImage } = require('electron');
const path = require('path');

/** Absolute path to the logo, in dev and in a packaged app. */
function iconPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'logo.png')
    : path.join(__dirname, '..', '..', 'assets', 'logo.png');
}

/**
 * The logo as a nativeImage, or null if it could not be read.
 *
 * Null rather than an empty image on purpose: passing an empty nativeImage as a
 * window `icon` is worse than passing nothing, because it overrides the default
 * with a blank square.
 */
function appIcon() {
  const img = nativeImage.createFromPath(iconPath());
  return img.isEmpty() ? null : img;
}

module.exports = { iconPath, appIcon };
