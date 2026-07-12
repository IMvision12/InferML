/**
 * One-time migration from the pipx/web-app data directory.
 *
 * Before the desktop app, the server picked its own data directory via
 * platformdirs. The shell now pins it to Electron's userData (see
 * sidecar.js/INFERML_DATA_DIR), and on Windows and Linux those are NOT the same
 * place - so a user upgrading from the old install would silently lose their
 * chats, settings, HF token, and install list.
 *
 *   platformdirs                         Electron userData
 *   win32   %LOCALAPPDATA%\InferML\InferML   %APPDATA%\InferML
 *   linux   ~/.local/share/InferML           ~/.config/InferML
 *   darwin  ~/Library/Application Support/InferML   (identical - no-op)
 *
 * Copies, never moves: if anything here is wrong, the old data is still there.
 * Runs only when the new location has no settings of its own, so it can never
 * clobber newer state.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const ITEMS = ['settings.json', 'installs.json', 'hf-token.json', 'chats'];

/** Where the pre-desktop server kept its data, per platformdirs. */
function legacyDataDir() {
  const home = os.homedir();
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    return path.join(local, 'InferML', 'InferML');
  }
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'InferML');
  }
  const xdg = process.env.XDG_DATA_HOME || path.join(home, '.local', 'share');
  return path.join(xdg, 'InferML');
}

function copyInto(src, dst) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    for (const entry of fs.readdirSync(src)) copyInto(path.join(src, entry), path.join(dst, entry));
  } else {
    fs.copyFileSync(src, dst);
  }
}

/**
 * Bring old data forward if this looks like a fresh desktop install sitting on
 * top of an old pipx one. Returns a list of what was migrated (possibly empty).
 */
function migrateLegacyData(userData) {
  const legacy = legacyDataDir();
  const moved = [];
  try {
    if (path.resolve(legacy) === path.resolve(userData)) return moved;  // macOS
    if (!fs.existsSync(legacy)) return moved;
    // Already-configured target: leave it strictly alone.
    if (fs.existsSync(path.join(userData, 'settings.json'))) return moved;

    for (const name of ITEMS) {
      const src = path.join(legacy, name);
      const dst = path.join(userData, name);
      if (!fs.existsSync(src) || fs.existsSync(dst)) continue;
      copyInto(src, dst);
      moved.push(name);
    }
  } catch {
    return moved;  // Never block startup over a best-effort copy.
  }
  return moved;
}

module.exports = { migrateLegacyData, legacyDataDir };
