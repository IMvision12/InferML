const windowIPC = require('./window');
const keysIPC = require('./keys');
const settingsIPC = require('./settings');
const chatsIPC = require('./chats');
const hwIPC = require('./hw');
const hfIPC = require('./hf');
const chatIPC = require('./chat');
const dialogIPC = require('./dialog');
const appIPC = require('./app');
const tasksIPC = require('./tasks');
const updatesIPC = require('./updates');
const logsIPC = require('./logs');
const storageIPC = require('./storage');

function registerAll() {
  windowIPC.register();
  keysIPC.register();
  settingsIPC.register();
  chatsIPC.register();
  hwIPC.register();
  hfIPC.register();
  chatIPC.register();
  dialogIPC.register();
  appIPC.register();
  tasksIPC.register();
  updatesIPC.register();
  logsIPC.register();
  storageIPC.register();
}

module.exports = { registerAll, hwIPC };
