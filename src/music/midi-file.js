// Standard MIDI Files, read and written by hand: no library, so it runs in the
// browser and in node alike (tools/music-library.mjs).
//
// A MIDI file is a PERFORMANCE, not a score: "key 60 went down at tick 960 and
// came up at tick 1440". There are no note values, no key, no bar lines unless a
// meta event says so. Notation is a reading of it (src/music/notation.js), and
// so is a key (src/music/key.js).
//
// The layout, from the spec:
//   MThd  format, track count, division (ticks per quarter note)
//   MTrk  events, each a delta time (a variable-length number) and a message.
//         Messages may leave out their status byte if it repeats ("running status").
//         Meta events (FF type length data) carry tempo, time and key signatures,
//         and names; they are how a sequencer writes down what MIDI cannot play.

// Read a file into notes in beats (quarter notes). Every note keeps its channel;
// channel 10 (index 9) is drums by General MIDI convention.
export function readMidi(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let p = 0;
  const u32 = () => { const v = (b[p] << 24 | b[p + 1] << 16 | b[p + 2] << 8 | b[p + 3]) >>> 0; p += 4; return v; };
  const u16 = () => { const v = b[p] << 8 | b[p + 1]; p += 2; return v; };
  const tag = () => String.fromCharCode(b[p++], b[p++], b[p++], b[p++]);
  const vlq = () => { let v = 0, c; do { c = b[p++]; v = v * 128 + (c & 0x7f); } while (c & 0x80 && p < b.length); return v; };

  if (tag() !== 'MThd') throw new Error('not a MIDI file (no MThd)');
  const hlen = u32();
  const format = u16(), ntracks = u16(), division = u16();
  p = 8 + hlen;
  // SMPTE timing (top bit set) counts frames, not beats. Rare in music made in a
  // DAW; read it as if it were 480 ticks a beat and say so.
  const smpte = (division & 0x8000) !== 0;
  const ppq = smpte ? 480 : division;

  const tempos = [], timeSigs = [], keySigs = [], tracks = [];
  for (let t = 0; t < ntracks && p < b.length; t++) {
    const kind = tag();
    const len = u32();
    const end = p + len;
    if (kind !== 'MTrk') { p = end; continue; }
    const track = { name: '', notes: [], program: null };
    const open = new Map();           // "ch:key" -> [{ tick, vel }], first in first out
    let tick = 0, status = 0;
    while (p < end) {
      tick += vlq();
      let s = b[p];
      if (s & 0x80) p++; else s = status;   // running status
      if (s === 0xff) {
        const type = b[p++];
        const l = vlq();
        const d = b.subarray(p, p + l);
        p += l;
        if (type === 0x51 && l === 3) tempos.push({ tick, bpm: 60e6 / (d[0] << 16 | d[1] << 8 | d[2]) });
        else if (type === 0x58 && l >= 2) timeSigs.push({ tick, num: d[0], den: 2 ** d[1] });
        else if (type === 0x59 && l === 2) keySigs.push({ tick, sf: (d[0] << 24) >> 24, mi: d[1] });
        else if (type === 0x03 && !track.name) track.name = text(d);
        else if (type === 0x2f) break;
        continue;
      }
      if (s === 0xf0 || s === 0xf7) { const l = vlq(); p += l; continue; }
      status = s;
      const hi = s & 0xf0, ch = s & 0x0f;
      if (hi === 0xc0 || hi === 0xd0) { const v = b[p++]; if (hi === 0xc0 && track.program == null) track.program = v; continue; }
      const k = b[p++], v = b[p++];
      if (hi === 0x90 && v > 0) {
        const id = ch + ':' + k;
        if (!open.has(id)) open.set(id, []);
        open.get(id).push({ tick, vel: v });
      } else if (hi === 0x80 || hi === 0x90) {
        const q = open.get(ch + ':' + k);
        const on = q?.shift();
        if (on) track.notes.push({ beat: on.tick / ppq, beats: Math.max(1, tick - on.tick) / ppq, midi: k, vel: on.vel, ch });
      }
    }
    // A note never let go of lasts to the end of its track.
    for (const [id, q] of open) for (const on of q) {
      const [ch, k] = id.split(':').map(Number);
      track.notes.push({ beat: on.tick / ppq, beats: Math.max(1, tick - on.tick) / ppq, midi: k, vel: on.vel, ch });
    }
    track.notes.sort((x, y) => x.beat - y.beat || x.midi - y.midi);
    p = end;
    tracks.push(track);
  }
  return { format, ppq, smpte, tracks, tempos, timeSigs, keySigs };
}

function text(d) {
  let s = '';
  for (const c of d) s += String.fromCharCode(c);
  try { return decodeURIComponent(escape(s)); } catch { return s; }   // UTF-8 if it is
}

// Write a type 1 file: a conductor track (tempo, time and key signature) and one
// track per part. `key` is { sf, mi }: sharps (+) or flats (-), and 1 for minor.
// The key signature is what lets notation software (MuseScore) spell the notes
// the way the music means them, F# rather than Gb.
export function writeMidi({ bpm = 120, timeSig = [4, 4], key = null, title = '', tracks = [], ppq = 480 }) {
  const out = [];
  const chunk = (id, body) => { out.push(...ascii(id), ...be32(body.length), ...body); };

  const conductor = [];
  const meta = (type, data) => conductor.push(0, 0xff, type, ...vlqBytes(data.length), ...data);
  if (title) meta(0x03, utf8(title));
  const us = Math.round(60e6 / bpm);
  meta(0x51, [us >> 16 & 0xff, us >> 8 & 0xff, us & 0xff]);
  meta(0x58, [timeSig[0], Math.round(Math.log2(timeSig[1])), 24, 8]);
  if (key) meta(0x59, [key.sf & 0xff, key.mi ? 1 : 0]);
  conductor.push(0, 0xff, 0x2f, 0);

  const header = [0, 1, 0, tracks.length + 1, ppq >> 8, ppq & 0xff];
  chunk('MThd', header);
  chunk('MTrk', conductor);

  tracks.forEach((tr, i) => {
    const ch = tr.channel ?? (i >= 9 ? i + 1 : i) % 16;     // skip channel 10 unless asked
    const ev = [];
    for (const n of tr.notes) {
      const on = Math.round(n.beat * ppq), off = Math.max(on + 1, Math.round((n.beat + n.beats) * ppq));
      ev.push([on, 1, 0x90 | ch, n.midi, Math.max(1, Math.min(127, n.vel ?? 96))]);
      ev.push([off, 0, 0x80 | ch, n.midi, 64]);
    }
    // Offs before ons at the same tick, so a repeated note is struck again.
    ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const body = [];
    if (tr.name) body.push(0, 0xff, 0x03, ...vlqBytes(utf8(tr.name).length), ...utf8(tr.name));
    if (tr.program != null) body.push(0, 0xc0 | ch, tr.program & 0x7f);
    let last = 0;
    for (const [t, , s, k, v] of ev) { body.push(...vlqBytes(t - last), s, k, v); last = t; }
    body.push(0, 0xff, 0x2f, 0);
    chunk('MTrk', body);
  });
  return new Uint8Array(out);
}

function vlqBytes(v) {
  const bytes = [v & 0x7f];
  while ((v = Math.floor(v / 128)) > 0) bytes.unshift((v & 0x7f) | 0x80);
  return bytes;
}
const be32 = v => [v >>> 24 & 0xff, v >>> 16 & 0xff, v >>> 8 & 0xff, v & 0xff];
const ascii = s => [...s].map(c => c.charCodeAt(0));
const utf8 = s => [...new TextEncoder().encode(s)];
