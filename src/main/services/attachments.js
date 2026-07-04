const fs = require('fs/promises');
const path = require('path');

const MIME = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
  mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', ogg: 'audio/ogg', flac: 'audio/flac', webm: 'audio/webm',
};

async function readAttachment(filePath, kind) {
  const buf = await fs.readFile(filePath);
  const ext = path.extname(filePath).toLowerCase().replace('.', '') || 'bin';
  const mediaType = MIME[ext] || (kind === 'image' ? 'image/png' : 'application/octet-stream');
  const data = buf.toString('base64');
  return {
    kind,
    path: filePath,
    name: path.basename(filePath),
    mediaType,
    size: buf.length,
    data,
    dataUrl: `data:${mediaType};base64,${data}`,
  };
}

module.exports = { readAttachment };
