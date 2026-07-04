async function forEachSSELine(stream, onLine) {
  const reader = stream.getReader();
  const dec = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split(/\r?\n/);
    buf = lines.pop() || '';
    for (const line of lines) onLine(line);
  }
  if (buf) onLine(buf);
}

module.exports = { forEachSSELine };
