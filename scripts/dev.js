#!/usr/bin/env node
// Launch Electron with DevTools auto-open and main-process debugger enabled.
const { spawn } = require('child_process');
const path = require('path');

const electron = require('electron');
const projectRoot = path.resolve(__dirname, '..');

const child = spawn(electron, [projectRoot, '--inspect=5858'], {
  stdio: 'inherit',
  env: { ...process.env, CHATLM_DEV: '1', ELECTRON_ENABLE_LOGGING: '1' },
});

child.on('close', (code) => process.exit(code ?? 0));
