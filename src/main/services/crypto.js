const { safeStorage } = require('electron');

function encryptSecret(plain) {
  if (safeStorage.isEncryptionAvailable()) {
    return 'enc:' + safeStorage.encryptString(plain).toString('base64');
  }
  return 'plain:' + Buffer.from(plain).toString('base64');
}

function decryptSecret(v) {
  if (!v) return null;
  if (v.startsWith('enc:')) {
    try { return safeStorage.decryptString(Buffer.from(v.slice(4), 'base64')); }
    catch { return null; }
  }
  if (v.startsWith('plain:')) return Buffer.from(v.slice(6), 'base64').toString();
  return null;
}

module.exports = { encryptSecret, decryptSecret };
