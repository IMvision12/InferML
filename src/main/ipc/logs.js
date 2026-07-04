const { ipcMain, shell } = require('electron');
const { spawn } = require('child_process');
const logs = require('../services/logs');

function register() {
  ipcMain.handle('logs:list',  (_, opts) => logs.list(opts || {}));
  ipcMain.handle('logs:clear', ()         => logs.clear());
  ipcMain.handle('logs:path',  ()         => logs.logFile());

  // Open the log file in a plain-text editor — without going through the
  // OS file-association prompt that .jsonl tends to trigger.
  //   Windows: notepad.exe
  //   macOS:   `open -e <file>` → TextEdit
  //   Linux:   xdg-open (best-effort; falls back to the user's default)
  ipcMain.handle('logs:view',  async () => {
    const file = logs.logFile();
    try {
      if (process.platform === 'win32') {
        spawn('notepad.exe', [file], { detached: true, stdio: 'ignore' }).unref();
        return { ok: true };
      }
      if (process.platform === 'darwin') {
        spawn('open', ['-e', file], { detached: true, stdio: 'ignore' }).unref();
        return { ok: true };
      }
      // Linux. Probe each candidate by spawning it and listening for an
      // `error` (ENOENT) — that's the only reliable signal that the binary
      // is missing. A 50ms "no error means success" heuristic was used
      // previously and shadowed the fallback chain when xdg-open spawned
      // successfully but the user's MIME default wasn't a real editor.
      const tryLinuxEditor = (cmd, args) => new Promise((resolve) => {
        let p;
        try { p = spawn(cmd, args, { detached: true, stdio: 'ignore' }); }
        catch { return resolve(false); }
        let resolved = false;
        const done = (ok) => { if (!resolved) { resolved = true; resolve(ok); } };
        p.on('error', () => done(false));
        p.on('spawn', () => { p.unref(); done(true); });
        // Safety net in case neither event fires (very unusual on Linux).
        setTimeout(() => done(true), 250);
      });
      for (const [cmd, args] of [
        ['xdg-open', [file]],
        ['gedit',    [file]],
        ['kate',     [file]],
        ['gnome-text-editor', [file]],
      ]) {
        if (await tryLinuxEditor(cmd, args)) return { ok: true };
      }
      const err = await shell.openPath(file);
      if (err) return { ok: false, error: err };
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  });
}

module.exports = { register };
