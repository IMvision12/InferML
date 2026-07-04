// Update flow.
//
// "Check" — always uses our manual GitHub Releases API call. Works in dev,
// on every platform, with no electron-updater coupling.
//
// "Download + install" — Windows/Linux only, via electron-updater. We hold
// the user behind a native confirm dialog (asked once), then download with
// progress events streamed to the renderer, then expose an explicit
// "Install & restart" action.
//
// macOS — auto-update needs a signed app and Apple Developer ID. We don't
// have either, so we just inform the user and open the release page in
// their browser for a manual download.

const https = require('https');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { safeBroadcast } = require('./broadcast');

const REPO = 'IMvision12/localml-app';
// The marketing site fronts every download with platform detection, install
// hints, and (for unsigned macOS builds) the right-click → Open instructions.
// We prefer sending users here over the bare GitHub release page so the
// experience is the same whether they hit it from the website nav or from
// the in-app "Open download page" fallback. The `#download` anchor jumps
// straight to the CTA section of the landing page.
const WEBSITE_URL = 'https://imvision12.github.io/localml-app/';
const DOWNLOAD_PAGE_URL = WEBSITE_URL + '#download';
const isMac = process.platform === 'darwin';

// Tiny on-disk state — currently just remembers which version we have a
// pre-downloaded installer for, so reopening the app after a partial
// "downloaded but not yet installed" session can pick up where it left off
// instead of re-downloading the same ~80 MB.
function _stateFile() {
  return path.join(app.getPath('userData'), 'update-state.json');
}
function _readPersistedState() {
  try { return JSON.parse(fs.readFileSync(_stateFile(), 'utf8')) || {}; }
  catch { return {}; }
}
function _writePersistedState(obj) {
  try { fs.writeFileSync(_stateFile(), JSON.stringify(obj || {})); } catch {}
}

// Cache the upstream check for a short window so opening Settings (which
// auto-checks) repeatedly doesn't burn through the unauthenticated GitHub
// API limit (60/hr per IP). The user can force a fresh check by clicking
// "Check for updates" — that path passes `force: true`.
const CHECK_TTL_MS = 10 * 60 * 1000;
let _checkCache = null; // { result, ts }

// ──────────────────────────────────────────────────────────────────────────
// Manual check — works everywhere
// ──────────────────────────────────────────────────────────────────────────

function compareVersions(a, b) {
  const norm = (s) => String(s).replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
  const pa = norm(a);
  const pb = norm(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

function fetchLatestRelease() {
  return new Promise((resolve, reject) => {
    const req = https.get({
      hostname: 'api.github.com',
      path: `/repos/${REPO}/releases/latest`,
      headers: {
        'User-Agent': 'LocalML-UpdateChecker',
        'Accept': 'application/vnd.github+json',
      },
      timeout: 15000,
    }, (res) => {
      if (res.statusCode === 403 && res.headers['x-ratelimit-remaining'] === '0') {
        res.resume();
        const reset = Number(res.headers['x-ratelimit-reset']) || 0;
        const waitSec = reset ? Math.max(0, reset - Math.floor(Date.now() / 1000)) : 60;
        return reject(new Error(`Rate-limited by GitHub. Retry in ${Math.ceil(waitSec / 60)} min.`));
      }
      if (res.statusCode === 404) {
        res.resume();
        return reject(new Error('No releases published yet.'));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`GitHub API ${res.statusCode}`));
      }
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error('Bad response from GitHub')); }
      });
    });
    req.on('error', (e) => reject(new Error(e.code === 'ENOTFOUND' ? 'No internet connection' : e.message)));
    req.on('timeout', () => req.destroy(new Error('Timed out reaching GitHub')));
  });
}

function pickAssetForPlatform(release) {
  if (!release || !Array.isArray(release.assets)) return null;
  const isExe = a => /\.exe$/i.test(a.name);
  const isDmg = a => /\.dmg$/i.test(a.name);
  const isImg = a => /\.AppImage$/i.test(a.name);
  if (process.platform === 'win32') return release.assets.find(isExe) || null;
  if (process.platform === 'linux') return release.assets.find(isImg) || null;
  if (process.platform === 'darwin') {
    const arm = release.assets.find(a => isDmg(a) && /arm64|aarch64/i.test(a.name));
    return arm || release.assets.find(isDmg) || null;
  }
  return null;
}

async function check(opts = {}) {
  const { force = false } = opts;
  const current = app.getVersion();
  // Cached fast-path: opening Settings 3× in 30s shouldn't hit GitHub 3×.
  if (!force && _checkCache && (Date.now() - _checkCache.ts) < CHECK_TTL_MS) {
    return _checkCache.result;
  }
  try {
    const release = await fetchLatestRelease();
    const latest = release.tag_name || '';
    const cmp = compareVersions(latest, current);
    const asset = pickAssetForPlatform(release);

    // If a newer version has shipped since we last marked one as
    // "downloaded", invalidate that state so the user doesn't get an older
    // installer applied when they next click "Install & restart".
    if (_downloadedVersion && compareVersions(latest, _downloadedVersion) > 0) {
      _downloadedVersion = null;
      _writePersistedState({ downloadedVersion: null });
    }

    const result = {
      ok: true,
      hasUpdate: cmp > 0,
      currentVersion: current,
      latestVersion: latest,
      // releaseUrl points at the GitHub release page (raw changelog + asset
      // list). Kept for anywhere the user wants the technical release notes.
      releaseUrl: release.html_url || `https://github.com/${REPO}/releases/latest`,
      // downloadPageUrl is what the renderer should use for the user-facing
      // "Open download page" button — it takes the user to the marketing
      // site's download CTA, which auto-detects their OS and shows install
      // instructions. On unsigned macOS this is the entire update path.
      downloadPageUrl: DOWNLOAD_PAGE_URL,
      releaseNotes: release.body || '',
      downloadUrl: asset?.browser_download_url || null,
      assetName: asset?.name || null,
      // Tell the renderer whether it can use the in-app updater on this
      // platform. Mac falls back to "open browser" since we don't sign.
      // We ALSO require the platform-specific asset to actually be present
      // in the release — otherwise the auto-update flow would 404 on
      // download (common during a partial-publish window). Without an
      // asset, the renderer falls back to "Open download page".
      canAutoUpdate: !isMac && app.isPackaged && !!asset,
      platform: process.platform,
    };
    _checkCache = { result, ts: Date.now() };
    return result;
  } catch (e) {
    const error = String(e.message || e);
    try { require('./logs').record({ source: 'app', level: 'warn', event: 'update.check.error', message: `Update check failed: ${error}` }); } catch {}
    const result = {
      ok: false,
      currentVersion: current,
      error,
    };
    // Cache failures briefly too — same rationale, no need to thrash on
    // network blips. Force-refresh skips this on user click.
    _checkCache = { result, ts: Date.now() };
    return result;
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Auto-update flow (Win/Linux, via electron-updater)
// ──────────────────────────────────────────────────────────────────────────

let _autoUpdater = null;
let _listenersWired = false;
let _downloadInFlight = false;
// Hydrate _downloadedVersion from disk so a user who downloaded an update
// then closed the app without clicking "Install & restart" can apply the
// cached installer on next launch instead of re-downloading.
let _downloadedVersion = (() => {
  try { return _readPersistedState().downloadedVersion || null; } catch { return null; }
})();

function getAutoUpdater() {
  if (_autoUpdater) return _autoUpdater;
  try {
    _autoUpdater = require('electron-updater').autoUpdater;
    _autoUpdater.autoDownload = false;
    _autoUpdater.autoInstallOnAppQuit = false;
  } catch (e) {
    return null;
  }
  return _autoUpdater;
}

// Use the shared safe-broadcast helper. (The previous local implementation
// didn't check `webContents.isDestroyed()`, which races on hard reloads.)
const broadcast = safeBroadcast;

function wireListenersOnce(updater) {
  if (_listenersWired) return;
  _listenersWired = true;

  updater.on('download-progress', (p) => {
    broadcast('updates:downloadProgress', {
      percent: Math.max(0, Math.min(100, p.percent || 0)),
      transferred: p.transferred || 0,
      total: p.total || 0,
      bps: p.bytesPerSecond || 0,
    });
  });
  updater.on('update-downloaded', (info) => {
    _downloadInFlight = false;
    _downloadedVersion = info?.version || null;
    // Persist so a relaunch picks up the cached installer instead of
    // re-downloading. electron-updater keeps the .exe on disk regardless;
    // we just have to remember it across restarts.
    _writePersistedState({ downloadedVersion: _downloadedVersion });
    broadcast('updates:downloaded', { version: _downloadedVersion });
  });
  updater.on('error', (err) => {
    _downloadInFlight = false;
    broadcast('updates:error', { error: String(err?.message || err) });
  });
}

// Renderer entrypoint: kick off the electron-updater download. The themed
// confirmation modal lives in the renderer (settings.jsx) — by the time the
// renderer calls this, the user has already confirmed via our own UI, so
// no second confirm dialog here.
async function downloadUpdate() {
  if (isMac) {
    return { ok: false, error: 'Auto-update is not supported on macOS in this build. Please download the new version from the website.' };
  }
  if (!app.isPackaged) {
    return { ok: false, error: 'In-app updates only run from a packaged build.' };
  }
  if (_downloadInFlight) {
    return { ok: false, error: 'A download is already in progress.' };
  }
  if (_downloadedVersion) {
    return { ok: true, alreadyDownloaded: true, version: _downloadedVersion };
  }

  // Make sure there's actually an update to download. The renderer also checks
  // before showing the confirm modal, but we re-verify here in case the cache
  // expired between the modal opening and the user clicking Download.
  const info = await check();
  if (!info.ok) return { ok: false, error: info.error || 'Could not check for updates.' };
  if (!info.hasUpdate) return { ok: false, error: 'You are already on the latest version.' };

  const updater = getAutoUpdater();
  if (!updater) return { ok: false, error: 'electron-updater is not installed.' };
  wireListenersOnce(updater);

  _downloadInFlight = true;
  try {
    // checkForUpdates() populates updater's internal state (feed URL,
    // version, file list) so downloadUpdate() knows what to fetch.
    await updater.checkForUpdates();
    await updater.downloadUpdate();
    return { ok: true };
  } catch (e) {
    _downloadInFlight = false;
    return { ok: false, error: String(e?.message || e) };
  }
}

// Quit and install the already-downloaded update. The user reaches this
// only after they've explicitly clicked "Install & restart" in the UI, so
// no second confirm dialog — the click is the confirmation.
function installUpdate() {
  if (isMac) return { ok: false, error: 'Not supported on macOS.' };
  if (!_downloadedVersion) return { ok: false, error: 'No update has been downloaded yet.' };
  const updater = getAutoUpdater();
  if (!updater) return { ok: false, error: 'electron-updater is not installed.' };
  // Defer so the IPC reply makes it back to the renderer before we quit.
  // quitAndInstall(isSilent=true, isForceRunAfter=true) skips the NSIS
  // wizard entirely (matches the oneClick:true config in package.json) so
  // the user sees the app's themed "Installing update" overlay instead of
  // a Windows-native installer dialog.
  setImmediate(() => {
    try { updater.quitAndInstall(true, true); }
    catch (e) { broadcast('updates:error', { error: String(e?.message || e) }); }
  });
  return { ok: true };
}

module.exports = { check, downloadUpdate, installUpdate, compareVersions };
