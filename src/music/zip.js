// A .zip with its files stored as they are (no compression): the smallest
// container a browser can hand over when it may not hand over a .mid itself.
// The private songbook on claude.ai can only offer files from a short list of
// types, and .zip is on it; MIDI files are tiny, so storing beats deflating.
//
// The format (PKWARE APPNOTE): for each file a local header and its bytes, then a
// central directory listing them, then an end record pointing at the directory.

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function storeZip(files) {
  const enc = new TextEncoder();
  const parts = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const data = f.bytes instanceof Uint8Array ? f.bytes : enc.encode(String(f.bytes));
    const crc = crc32(data);
    const local = header(0x04034b50, [20, 0x0800, 0, 0, 0x21], crc, data.length, name.length);
    parts.push(local, name, data);
    central.push({ name, crc, size: data.length, offset });
    offset += local.length + name.length + data.length;
  }
  const dirStart = offset;
  for (const c of central) {
    const d = new Uint8Array(46);
    const v = new DataView(d.buffer);
    v.setUint32(0, 0x02014b50, true); v.setUint16(4, 20, true); v.setUint16(6, 20, true);
    v.setUint16(8, 0x0800, true); v.setUint16(10, 0, true); v.setUint16(12, 0, true); v.setUint16(14, 0x21, true);
    v.setUint32(16, c.crc, true); v.setUint32(20, c.size, true); v.setUint32(24, c.size, true);
    v.setUint16(28, c.name.length, true); v.setUint32(42, c.offset, true);
    parts.push(d, c.name);
    offset += 46 + c.name.length;
  }
  const end = new Uint8Array(22);
  const v = new DataView(end.buffer);
  v.setUint32(0, 0x06054b50, true);
  v.setUint16(8, files.length, true); v.setUint16(10, files.length, true);
  v.setUint32(12, offset - dirStart, true); v.setUint32(16, dirStart, true);
  parts.push(end);
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let p = 0;
  for (const part of parts) { out.set(part, p); p += part.length; }
  return out;
}

// version 20, flags (UTF-8 names), method 0 (stored), a fixed time and date.
function header(sig, [version, flags, method, time, date], crc, size, nameLen) {
  const d = new Uint8Array(30);
  const v = new DataView(d.buffer);
  v.setUint32(0, sig, true); v.setUint16(4, version, true); v.setUint16(6, flags, true); v.setUint16(8, method, true);
  v.setUint16(10, time, true); v.setUint16(12, date, true);
  v.setUint32(14, crc, true); v.setUint32(18, size, true); v.setUint32(22, size, true);
  v.setUint16(26, nameLen, true);
  return d;
}
