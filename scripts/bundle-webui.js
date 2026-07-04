#!/usr/bin/env node
//
// Bundle the built frontend (and routing data) INTO the Python package so a
// pip/pipx install is fully self-contained and needs no Node at runtime.
//
//   src/renderer/dist/            -> python/server/webui/
//   python/supported_architectures.json -> python/server/_data/
//   python/model_overrides.json (if present) -> python/server/_data/
//
// Run after `npm run build:renderer`. `npm run build` does both.
// `python/server/webui/` and `python/server/_data/` are shipped as package
// data (see pyproject [tool.setuptools.package-data]).

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'src', 'renderer', 'dist');
const WEBUI = path.join(ROOT, 'python', 'server', 'webui');
const DATA = path.join(ROOT, 'python', 'server', '_data');
const PY = path.join(ROOT, 'python');

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function rmrf(p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('[bundle] no built frontend at src/renderer/dist — run `npm run build:renderer` first.');
  process.exit(1);
}

rmrf(WEBUI);
copyDir(DIST, WEBUI);

fs.mkdirSync(DATA, { recursive: true });
for (const name of ['supported_architectures.json', 'model_overrides.json']) {
  const src = path.join(PY, name);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(DATA, name));
}

const count = fs.readdirSync(WEBUI).length;
console.log(`[bundle] copied frontend (${count} top-level entries) → python/server/webui/ and routing data → python/server/_data/`);
