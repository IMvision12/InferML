const { app } = require('electron');
const path = require('path');
const fs = require('fs/promises');

const paths = {
  userDataDir: () => app.getPath('userData'),
  chatsDir:    () => path.join(app.getPath('userData'), 'chats'),
  keysFile:    () => path.join(app.getPath('userData'), 'keys.json'),
  settingsFile:() => path.join(app.getPath('userData'), 'settings.json'),
  installsFile:() => path.join(app.getPath('userData'), 'installs.json'),
  hfTokenFile: () => path.join(app.getPath('userData'), 'hf-token.json'),
  chatFile:    (id) => path.join(app.getPath('userData'), 'chats', `${id}.json`),
};

async function readJSON(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch { return fallback; }
}

async function writeJSON(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(data, null, 2));
  await fs.rename(tmp, file);
}

async function ensureDataDirs() {
  await fs.mkdir(paths.chatsDir(), { recursive: true });
}

module.exports = { paths, readJSON, writeJSON, ensureDataDirs };
