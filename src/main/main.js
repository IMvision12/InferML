const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Single-instance lock. Without this, double-clicking the app icon while
// it's already running spawns a second main process — which then races the
// userData migration below against the running instance's open file handles.
// On POSIX that race can corrupt the user's data dir.
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

// Focus the existing window if a user tried to launch a second instance.
app.on('second-instance', () => {
  const wins = BrowserWindow.getAllWindows();
  if (wins.length) {
    const w = wins[0];
    if (w.isMinimized()) w.restore();
    w.focus();
  }
});

// One-time migration: rename the legacy `chatlm/` userData dir to the new
// `LocalML/` name that Electron now uses (productName changed in package.json).
// Must run before anything else that reads app.getPath('userData'). Gated on
// the single-instance lock above so a concurrent launch can't race against
// the running instance's open file handles.
(function migrateLegacyUserData() {
  try {
    let base;
    if (process.platform === 'win32') base = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    else if (process.platform === 'darwin') base = path.join(os.homedir(), 'Library', 'Application Support');
    else base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
    const legacy = path.join(base, 'chatlm');
    const current = path.join(base, 'LocalML');
    if (fs.existsSync(legacy) && !fs.existsSync(current)) {
      fs.renameSync(legacy, current);
      console.log(`[localml] migrated userData: ${legacy} -> ${current}`);
    }
  } catch (e) {
    console.warn('[localml] userData migration failed:', e.message);
  }
})();

const { ensureDataDirs } = require('./services/storage');
const { registerAll, hwIPC } = require('./ipc');
const sidecar = require('./services/python-sidecar');
const logs = require('./services/logs');
const pySetup = require('./services/python-setup');

// Packaged builds load the pre-compiled renderer (no Babel Standalone). Dev
// mode loads the source HTML so JSX edits hot-reload via Babel in the
// browser. Dropping Babel from cold start cuts ~3 s of black screen on
// Windows down to under ~500 ms.
const RENDERER_HTML = app.isPackaged
  ? path.join(__dirname, '..', 'renderer', 'dist', 'index.html')
  : path.join(__dirname, '..', 'renderer', 'index.html');
const PRELOAD = path.join(__dirname, 'preload.js');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 880,
    minHeight: 560,
    frame: false,
    backgroundColor: '#0b0c0e',
    show: false,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  mainWindow.loadFile(RENDERER_HTML);
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
  const sendState = (maximized) => {
    // webContents can outlive its window briefly during teardown, and a window
    // can outlive its webContents during a hard reload. Check both.
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const wc = mainWindow.webContents;
    if (!wc || wc.isDestroyed()) return;
    try { wc.send('window:state', { maximized }); } catch {}
  };
  mainWindow.on('maximize',   () => sendState(true));
  mainWindow.on('unmaximize', () => sendState(false));
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Defense-in-depth: the renderer must NEVER navigate away from index.html.
  // setWindowOpenHandler covers `target=_blank` clicks, but bare <a href> tags
  // (which marked may emit from LLM-supplied markdown) trigger an in-place
  // navigation that replaces the renderer with attacker-controlled content
  // — preload would still be attached, so the page could call window.localml.*
  // IPC. Block all top-frame nav and route external URLs through the browser.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const currentUrl = mainWindow.webContents.getURL();
    if (url === currentUrl) return; // page reloads (devtools, F5) — allow
    event.preventDefault();
    if (/^https?:/i.test(url)) {
      try { shell.openExternal(url); } catch {}
    }
  });
  mainWindow.webContents.on('before-input-event', (_, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') {
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
    } else if (input.key === 'Escape' && mainWindow.isFullScreen()) {
      mainWindow.setFullScreen(false);
    }
  });
}

app.whenReady().then(async () => {
  // Critical path — get the window on screen ASAP. Anything that doesn't
  // gate the renderer running is moved off this await chain.
  await ensureDataDirs();
  registerAll();        // sync — IPC handlers must exist before renderer can call them
  createWindow();       // sync — kicks off async renderer load in parallel with the rest
  hwIPC.startPolling();

  // Logs init reads up to ~5 MB of jsonl tail and opens the write stream.
  // Don't block first paint on it: list() returns the in-memory buffer
  // (initialised empty) before init completes, so early IPC reads just see
  // an empty log for the first few ms — fine.
  logs.init().then(() => {
    logs.record({ source: 'app', event: 'app.start', message: `LocalML v${app.getVersion()} started · ${process.platform} ${process.arch}` });
  }).catch(() => {});

  // Reconcile installs.json against the on-disk HF cache. Drops orphan
  // entries (model_ids that the registry says are installed but whose
  // weights aren't actually on disk anymore — e.g. user manually deleted
  // ~/.cache/huggingface, or wiped userData/hf-cache out of band). Without
  // this, the Hub keeps showing phantom "Installed" badges.
  // Off the critical path: don't block first paint on filesystem walks.
  setImmediate(() => {
    require('./services/huggingface').reconcileInstalls()
      .then((r) => {
        if (r.removed > 0) {
          logs.record({ source: 'app', event: 'installs.reconcile', message: `Pruned ${r.removed} orphan install record${r.removed === 1 ? '' : 's'} (${r.kept} kept)` });
          // Tell any open renderer to refetch so the Hub updates.
          for (const w of BrowserWindow.getAllWindows()) {
            if (!w.isDestroyed()) w.webContents.send('hf:installsChanged');
          }
        }
      })
      .catch(() => {});
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Heavy-app behavior on macOS: when the user closes the last window, free the
// Python sidecar (potentially several GB of model + torch RAM) so an idle
// "still in the Dock" state doesn't pin huge memory. The Electron shell
// itself stays warm in the Dock for the standard macOS convention; clicking
// the icon re-opens the window via `app.on('activate')` and the sidecar
// respawns lazily on the next inference.
app.on('window-all-closed', async () => {
  hwIPC.stopPolling();
  if (process.platform !== 'darwin') {
    app.quit();
    return;
  }
  try { await sidecar.stop({ graceful: true, timeoutMs: 2000 }); } catch {}
});

// Give the Python sidecar AND any in-flight python-setup children a chance
// to shut down cleanly before exit. Without tracking setup children, Cmd+Q
// during a first-launch install leaves orphaned `tar` / `uv` processes and
// a half-installed runtime that fails the next isReady() probe permanently.
let shuttingDown = false;
app.on('before-quit', async (e) => {
  if (shuttingDown) return;
  const sidecarRunning = sidecar.isRunning() || sidecar.isStarting?.();
  const setupBusy = pySetup.hasActiveChildren?.();
  if (!sidecarRunning && !setupBusy) return;
  shuttingDown = true;
  e.preventDefault();
  try { pySetup.killActiveChildren?.({ signal: 'SIGTERM' }); } catch {}
  try { await sidecar.stop({ graceful: true, timeoutMs: 2000 }); } catch {}
  app.quit();
});

// Catch SIGINT/SIGTERM for clean shutdown when launched from a terminal.
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    try { pySetup.killActiveChildren?.({ signal: 'SIGTERM' }); } catch {}
    try { await sidecar.stop({ graceful: true, timeoutMs: 2000 }); } catch {}
    app.quit();
  });
}

// Last-resort: don't let an unhandled promise take the whole app down.
process.on('unhandledRejection', (reason) => {
  console.error('[main] unhandledRejection:', reason);
  try { logs.record({ source: 'app', level: 'error', event: 'main.unhandledRejection', message: `Unhandled promise rejection: ${String(reason?.message || reason)}` }); } catch {}
});
process.on('uncaughtException', (err) => {
  console.error('[main] uncaughtException:', err);
  try { logs.record({ source: 'app', level: 'error', event: 'main.uncaughtException', message: `Uncaught exception: ${String(err?.message || err)}` }); } catch {}
});
