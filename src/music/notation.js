// Sheet music, drawn as SVG from notes on the sixteenth grid.
//
// MIDI says when a key went down; notation says what a reader should see. Getting
// from one to the other takes four decisions, made here in this order:
//
//   1. SPELLING. A pitch has more than one name (F# or Gb). The key decides:
//      every scale tone takes the letter the key signature gives it, and a note
//      outside the scale is the tone below raised (in a sharp key) or the tone
//      above lowered (in a flat one).
//   2. RHYTHM. A note four sixteenths long starting on the "and" of a beat is
//      written as two eighths tied over the beat, so the reader can still see
//      where the beats fall. `pieces` cuts every note and rest into values that
//      sit right in the bar (whole, dotted half, half, dotted quarter, quarter,
//      dotted eighth, eighth, sixteenth).
//   3. ACCIDENTALS. Drawn only when a note differs from what the key signature
//      or an earlier note in the same bar already says, and cancelled with a
//      natural.
//   4. LAYOUT. Space by duration, bars packed into lines that fit the width,
//      eighths and sixteenths beamed by the beat.
//
// It draws one staff: a melody, or chords that start together. Parts that
// overlap in other ways are reduced (each chord lasts until the next one
// starts). Full scores of a whole piece are better engraved by MuseScore from
// the .mid files tools/music-library.mjs writes, which carry the key.
//
// Colour is currentColor throughout, so it is white line-work on black in the
// game's palette and follows whatever the page sets.

import { keySignature } from './key.js';

const NAT = [0, 2, 4, 5, 7, 9, 11];                 // C D E F G A B
const LETTERS = 'CDEFGAB';
const SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6];          // F C G D A E B
const FLAT_ORDER = [6, 2, 5, 1, 4, 0, 3];           // B E A D G C F
const PARENT_LETTER = [0, 1, 1, 2, 2, 3, 3, 4, 5, 5, 6, 6];   // C Db D Eb E F F# G Ab A Bb B
// Treble: the bottom line is E4; bass: G2. As diatonic steps (octave * 7 + letter).
const BOTTOM = { treble: 4 * 7 + 2, bass: 2 * 7 + 4 };

// The alteration the key signature puts on each letter.
export function signatureAlters(key) {
  const { sf } = keySignature(key);
  const a = new Array(7).fill(0);
  if (sf > 0) for (let i = 0; i < sf; i++) a[SHARP_ORDER[i]] = 1;
  if (sf < 0) for (let i = 0; i < -sf; i++) a[FLAT_ORDER[i]] = -1;
  return a;
}

// A MIDI note's written name in a key: { letter (0 = C), alter, octave, step }.
export function spell(midi, key) {
  const { sf, parent } = keySignature(key);
  const alters = signatureAlters(key);
  const pcOf = l => (NAT[l] + alters[l] + 12) % 12;
  const pc = ((midi % 12) + 12) % 12;
  // Scale tones: the letters from the parent major's tonic, each with the
  // signature's alteration.
  const ionianDegreeOf = {};
  for (let j = 0; j < 7; j++) {
    const l = (PARENT_LETTER[parent] + j) % 7;
    ionianDegreeOf[pcOf(l)] = l;
  }
  let letter, alter;
  if (pc in ionianDegreeOf) {
    letter = ionianDegreeOf[pc];
    alter = alters[letter];
  } else if (sf >= 0) {
    letter = ionianDegreeOf[(pc + 11) % 12];          // the tone below, raised
    alter = alters[letter] + 1;
  } else {
    letter = ionianDegreeOf[(pc + 1) % 12];           // the tone above, lowered
    alter = alters[letter] - 1;
  }
  const octave = Math.round((midi - NAT[letter] - alter) / 12) - 1;
  return { letter, alter, octave, step: octave * 7 + letter, name: LETTERS[letter] + (['bb', 'b', '', '#', 'x'][alter + 2]) + octave };
}

// Cut a span of `len` sixteenths starting at `p` (in its bar) into written values.
const VALUES = [16, 12, 8, 6, 4, 3, 2, 1];
function fits(p, d, bar) {
  if (p + d > bar) return false;
  switch (d) {
    case 16: return p === 0;
    case 12: return p === 0 || (bar === 16 && p === 4);
    case 8: case 6: case 4: return p % 4 === 0;
    case 3: return p % 4 === 0 || p % 4 === 1;
    case 2: return p % 2 === 0;
    default: return true;
  }
}
export function pieces(p, len, bar = 16) {
  const out = [];
  while (len > 0) {
    const d = VALUES.find(v => v <= len && fits(p, v, bar)) ?? 1;
    out.push(d);
    p += d; len -= d;
  }
  return out;
}

// The events of a bar line, before drawing: chords and rests in written values.
export function layoutEvents(notes, { bars, beatsPerBar = 4 } = {}) {
  const bar = beatsPerBar * 4;
  const total = bars * bar;
  const byStart = new Map();
  for (const n of notes) {
    if (n.start < 0 || n.start >= total) continue;
    if (!byStart.has(n.start)) byStart.set(n.start, []);
    byStart.get(n.start).push(n);
  }
  const starts = [...byStart.keys()].sort((a, b) => a - b);
  const spans = [];                    // [start, end, notes|null]
  let t = 0;
  starts.forEach((s, i) => {
    if (s > t) spans.push([t, s, null]);
    const group = byStart.get(s);
    const next = i + 1 < starts.length ? starts[i + 1] : total;
    const end = Math.min(next, total, s + Math.max(...group.map(n => Math.max(1, n.len ?? 1))));
    spans.push([s, end, group]);
    t = end;
  });
  if (t < total) spans.push([t, total, null]);

  const events = [];
  for (const [s, e, group] of spans) {
    let at = s;
    while (at < e) {
      const b = Math.floor(at / bar), p = at - b * bar;
      const chunk = Math.min(e, (b + 1) * bar) - at;
      for (const d of pieces(p, chunk, bar)) {
        events.push({ start: at, bar: Math.floor(at / bar), p: at - Math.floor(at / bar) * bar, d, rest: !group, notes: group, tieNext: false });
        at += d;
      }
    }
    if (group) for (let i = events.length - 1; i > 0 && events[i - 1].notes === group; i--) events[i - 1].tieNext = true;
  }
  return events;
}

// ---- drawing ---------------------------------------------------------------

const S = 10;                 // space between staff lines, px
const HALF = S / 2;

export function renderStaff({ notes = [], bars = 1, key = { root: 0, mode: 'ionian' }, clef = null,
  width = 360, beatsPerBar = 4, playStep = null, title = '', marks = null } = {}) {
  const bar = beatsPerBar * 4;
  if (!clef) {
    const ms = notes.map(n => n.midi).sort((a, b) => a - b);
    clef = ms.length && ms[Math.floor(ms.length / 2)] < 60 ? 'bass' : 'treble';
  }
  const bottom = BOTTOM[clef];
  const alters = signatureAlters(key);
  const { sf } = keySignature(key);

  const events = layoutEvents(notes, { bars, beatsPerBar });
  // Spell, place and mark accidentals bar by bar.
  let barState = null, curBar = -1, held = null;
  for (const ev of events) {
    if (ev.bar !== curBar) { curBar = ev.bar; barState = new Map(); }
    if (ev.rest) { held = null; continue; }
    ev.heads = ev.notes.map(n => {
      const sp = spell(n.midi, key);
      // A tied note carries its accidental, even over a bar line; the next
      // untied one in the new bar has to say it again.
      if (held?.has(n.midi)) return { midi: n.midi, pos: sp.step - bottom, acc: null };
      const current = barState.has(sp.step) ? barState.get(sp.step) : alters[sp.letter];
      barState.set(sp.step, sp.alter);
      return { midi: n.midi, pos: sp.step - bottom, acc: sp.alter !== current ? sp.alter : null };
    }).sort((a, b) => a.pos - b.pos);
    held = ev.tieNext ? new Set(ev.notes.map(n => n.midi)) : null;
  }

  // Widths: room for the value, plus an accidental or a dot.
  for (const ev of events) {
    const accW = ev.heads?.some(h => h.acc != null) ? 9 : 0;
    const dot = [3, 6, 12].includes(ev.d) ? 5 : 0;
    ev.w = Math.max(15, 9 + 5.2 * Math.sqrt(ev.d * 4)) + accW + dot;
    ev.accW = accW;
  }
  const barW = Array.from({ length: bars }, (_, b) => events.filter(e => e.bar === b).reduce((a, e) => a + e.w, 0) + 12);

  const clefW = 44, keyW = Math.abs(sf) * 8 + (sf ? 4 : 0), timeW = 18;
  const lines = [];
  let cur = [], used = 0;
  for (let b = 0; b < bars; b++) {
    const head = clefW + keyW + (lines.length === 0 ? timeW : 0) + 6;
    if (cur.length && head + used + barW[b] > width - 2) { lines.push(cur); cur = []; used = 0; }
    cur.push(b); used += barW[b];
  }
  if (cur.length) lines.push(cur);

  const topPad = title ? 22 : 0;
  const lineH = 9 * S;                         // staff plus room for ledgers and stems
  const firstTop = topPad + 3.2 * S;
  const height = topPad + lines.length * lineH + 2.4 * S;
  const parts = [];
  if (title) parts.push(`<text x="2" y="14" class="t" font-size="13">${esc(title)}</text>`);

  const beams = [];
  lines.forEach((lineBars, li) => {
    const top = firstTop + li * lineH;          // y of the top line
    const yOf = pos => top + (8 - pos) * HALF;
    // Staff lines.
    for (let i = 0; i < 5; i++) parts.push(`<line x1="0" x2="${width}" y1="${top + i * S}" y2="${top + i * S}" class="sl"/>`);
    parts.push(`<line x1="0.5" x2="0.5" y1="${top}" y2="${top + 4 * S}" class="bl"/>`);
    let x = 4;
    parts.push(clef === 'treble' ? trebleClef(x + 13, yOf(2)) : bassClef(x + 5, yOf(6)));
    x += clefW;
    // Key signature.
    for (let i = 0; i < Math.abs(sf); i++) {
      const letter = sf > 0 ? SHARP_ORDER[i] : FLAT_ORDER[i];
      const pos = sigPos(letter, sf > 0, clef);
      parts.push(accidental(sf > 0 ? 1 : -1, x + i * 8 + 3, yOf(pos)));
    }
    x += keyW;
    if (li === 0) {
      parts.push(`<text x="${x + 7}" y="${top + 2 * S - 1}" class="ts">${beatsPerBar}</text><text x="${x + 7}" y="${top + 4 * S - 1}" class="ts">4</text>`);
      x += timeW;
    }
    x += 6;
    const natural = lineBars.reduce((a, b) => a + barW[b], 0);
    const isLast = li === lines.length - 1;
    let stretch = (width - 2 - x) / natural;
    if (isLast && lines.length > 1) stretch = Math.min(stretch, 1.5);
    if (lines.length === 1) stretch = Math.max(1, stretch);

    for (const b of lineBars) {
      const evs = events.filter(e => e.bar === b);
      for (const ev of evs) {
        ev.x = x + ev.accW + 6;
        ev.top = top; ev.yOf = yOf; ev.line = li;
        x += ev.w * stretch;
      }
      x += 12 * stretch;
      parts.push(`<line x1="${x - 6 * stretch}" x2="${x - 6 * stretch}" y1="${top}" y2="${top + 4 * S}" class="bl"/>`);
    }
    // The last bar of the piece ends in a double bar.
    if (isLast) {
      const xe = x - 6 * stretch;
      parts.push(`<line x1="${xe - 4}" x2="${xe - 4}" y1="${top}" y2="${top + 4 * S}" class="bl"/><line x1="${xe}" x2="${xe}" y1="${top}" y2="${top + 4 * S}" class="bl" stroke-width="3"/>`);
    }
  });

  // Beam groups: notes shorter than a quarter, in the same beat, side by side.
  let group = [];
  const flush = () => { if (group.length > 1) beams.push(group); else if (group.length === 1) group[0].flag = true; group = []; };
  for (const ev of events) {
    if (ev.rest || ev.d >= 4) { flush(); continue; }
    const g = group[group.length - 1];
    if (g && (Math.floor(g.p / 4) !== Math.floor(ev.p / 4) || g.bar !== ev.bar || g.line !== ev.line)) flush();
    group.push(ev);
  }
  flush();
  for (const g of beams) {
    const avg = g.flatMap(e => e.heads.map(h => h.pos)).reduce((a, b, _, arr) => a + b / arr.length, 0);
    const up = avg < 4;
    const ys = g.flatMap(e => e.heads.map(h => e.yOf(h.pos)));
    const beamY = up ? Math.min(...ys) - 3.2 * S : Math.max(...ys) + 3.2 * S;
    for (const e of g) { e.up = up; e.stemTo = beamY; }
  }

  // Notes, rests, stems, dots, ties.
  events.forEach((ev, i) => {
    const on = playStep != null && playStep >= ev.start && playStep < ev.start + ev.d;
    // `marks`: [{ from, to, cls }] in sixteenths, a class for every event that
    // starts inside the span (the daily board lights the notes the wave has
    // played, 'on', and dims a wrong one, 'no').
    const mark = marks?.find(m => ev.start >= m.from && ev.start < m.to);
    const cls = on ? ' on' : mark ? ` ${mark.cls}` : '';
    if (ev.rest) { parts.push(rest(ev.d, ev.x + 2, ev.top, cls)); return; }
    const up = ev.up ?? (ev.heads.reduce((a, h) => a + h.pos, 0) / ev.heads.length < 4);
    const hollow = ev.d >= 8;
    const ys = ev.heads.map(h => ev.yOf(h.pos));
    // Ledger lines.
    const lo = Math.min(...ev.heads.map(h => h.pos)), hi = Math.max(...ev.heads.map(h => h.pos));
    for (let p = -2; p >= lo; p -= 2) parts.push(`<line x1="${ev.x - 8}" x2="${ev.x + 8}" y1="${ev.yOf(p)}" y2="${ev.yOf(p)}" class="sl"/>`);
    for (let p = 10; p <= hi; p += 2) parts.push(`<line x1="${ev.x - 8}" x2="${ev.x + 8}" y1="${ev.yOf(p)}" y2="${ev.yOf(p)}" class="sl"/>`);
    // Heads: a second apart pushes one to the other side of the stem.
    let prev = null;
    ev.heads.forEach((h, k) => {
      let hx = ev.x;
      if (prev && h.pos - prev.pos === 1 && !prev.shifted) { hx += up ? 11 : -11; h.shifted = true; }
      prev = h;
      parts.push(head(hx, ys[k], hollow, cls));
      if (h.acc != null) parts.push(accidental(h.acc, ev.x - 14, ys[k]));
      if ([3, 6, 12].includes(ev.d)) {
        const dy = h.pos % 2 === 0 ? -HALF : 0;      // a dot sits in a space
        parts.push(`<circle cx="${ev.x + 10}" cy="${ys[k] + dy}" r="1.8" class="f${cls}"/>`);
      }
    });
    // Stem.
    if (ev.d < 16) {
      const sx = up ? ev.x + 5.3 : ev.x - 5.3;
      const from = up ? Math.max(...ys) : Math.min(...ys);
      const to = ev.stemTo ?? (up ? Math.min(...ys) - 3.4 * S : Math.max(...ys) + 3.4 * S);
      parts.push(`<line x1="${sx}" x2="${sx}" y1="${from}" y2="${to}" class="st${cls}"/>`);
      if (ev.flag) parts.push(flags(ev.d, sx, to, up, cls));
    }
    // Tie to the next event's same note.
    if (ev.tieNext) {
      const nx = events[i + 1];
      if (nx) for (const h of ev.heads) {
        const y = ev.yOf(h.pos) + (up ? 7 : -7);
        const x1 = ev.x + 4, x2 = nx.line === ev.line ? nx.x - 4 : width - 2;
        const bend = up ? 6 : -6;
        parts.push(`<path d="M${x1} ${y} Q${(x1 + x2) / 2} ${y + bend} ${x2} ${y}" class="tie"/>`);
        if (nx.line !== ev.line) {
          const y2 = nx.yOf(h.pos) + (up ? 7 : -7);
          parts.push(`<path d="M${nx.x - 16} ${y2} Q${nx.x - 10} ${y2 + bend} ${nx.x - 4} ${y2}" class="tie"/>`);
        }
      }
    }
  });
  for (const g of beams) {
    const up = g[0].up, y = g[0].stemTo;
    const xs = g.map(e => up ? e.x + 5.3 : e.x - 5.3);
    const t = up ? 0 : -4.2;
    parts.push(`<rect x="${xs[0] - 0.6}" y="${y + t}" width="${xs[xs.length - 1] - xs[0] + 1.2}" height="4.2" class="f"/>`);
    // Second beams over runs of sixteenths; a lone one gets a stub.
    const y2 = up ? y + 7 : y - 7;
    g.forEach((e, k) => {
      if (e.d !== 1) return;
      const nb = g[k + 1]?.d === 1;
      const pb = g[k - 1]?.d === 1;
      if (nb) parts.push(`<rect x="${xs[k] - 0.6}" y="${y2 + t}" width="${xs[k + 1] - xs[k] + 1.2}" height="4.2" class="f"/>`);
      else if (!pb) {
        const dir = k === 0 ? 1 : -1;
        const x0 = dir > 0 ? xs[k] : xs[k] - 8;
        parts.push(`<rect x="${x0 - 0.6}" y="${y2 + t}" width="9.2" height="4.2" class="f"/>`);
      }
    });
  }

  const style = `<style>.sl{stroke:currentColor;stroke-width:1;opacity:.75}.bl{stroke:currentColor;stroke-width:1.2}.st{stroke:currentColor;stroke-width:1.3}.f{fill:currentColor}.o{fill:none;stroke:currentColor;stroke-width:1.6}.tie{fill:none;stroke:currentColor;stroke-width:1.3}.cl{fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}.ts{fill:currentColor;font:bold 19px Georgia,'Times New Roman',serif;text-anchor:middle}.t{fill:currentColor;font-family:inherit}.on{fill:var(--hot,#fff);stroke:var(--hot,#fff);filter:drop-shadow(0 0 3px currentColor)}.no{opacity:.3}</style>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${esc(title || 'staff')}">${style}${parts.join('')}</svg>`;
}

function sigPos(letter, sharp, clef) {
  // Treble positions (from the bottom line): sharps F C G D A E B, flats B E A D G C F.
  const trebleSharp = { 3: 8, 0: 5, 4: 9, 1: 6, 5: 3, 2: 7, 6: 4 };
  const trebleFlat = { 6: 4, 2: 7, 5: 3, 1: 6, 4: 2, 0: 5, 3: 1 };
  const p = (sharp ? trebleSharp : trebleFlat)[letter];
  return clef === 'bass' ? p - 2 : p;
}

function head(x, y, hollow, cls) {
  if (hollow) return `<ellipse cx="${x}" cy="${y}" rx="5.2" ry="3.6" transform="rotate(-22 ${x} ${y})" class="o${cls}"/>`;
  return `<ellipse cx="${x}" cy="${y}" rx="5.6" ry="3.9" transform="rotate(-22 ${x} ${y})" class="f${cls}"/>`;
}

function accidental(alter, x, y) {
  if (alter === 1) return `<g class="st"><line x1="${x - 2}" x2="${x - 2}" y1="${y - 12}" y2="${y + 10}"/><line x1="${x + 2}" x2="${x + 2}" y1="${y - 10}" y2="${y + 12}"/></g>`
    + `<path d="M${x - 5} ${y - 2} L${x + 5} ${y - 5} L${x + 5} ${y - 2.6} L${x - 5} ${y + 0.4}Z M${x - 5} ${y + 5} L${x + 5} ${y + 2} L${x + 5} ${y + 4.4} L${x - 5} ${y + 7.4}Z" class="f"/>`;
  if (alter === -1) return `<path d="M${x - 3} ${y - 14} L${x - 3} ${y + 5} C${x + 5} ${y + 0} ${x + 5} ${y - 6} ${x - 3} ${y - 2}" class="o"/>`;
  if (alter === 0) return `<path d="M${x - 3} ${y - 12} L${x - 3} ${y + 4} L${x + 3} ${y + 2} M${x + 3} ${y + 12} L${x + 3} ${y - 4} L${x - 3} ${y - 2}" class="o"/>`;
  if (alter === 2) return `<path d="M${x - 4} ${y - 4} L${x + 4} ${y + 4} M${x + 4} ${y - 4} L${x - 4} ${y + 4}" class="o"/>`;
  return `<path d="M${x - 6} ${y - 14} L${x - 6} ${y + 5} C${x + 1} ${y} ${x + 1} ${y - 6} ${x - 6} ${y - 2} M${x} ${y - 14} L${x} ${y + 5} C${x + 7} ${y} ${x + 7} ${y - 6} ${x} ${y - 2}" class="o"/>`;
}

function flags(d, x, y, up, cls) {
  const n = d === 1 ? 2 : 1;
  let s = '';
  for (let i = 0; i < n; i++) {
    const y0 = up ? y + i * 7 : y - i * 7;
    s += up
      ? `<path d="M${x} ${y0} C${x + 2} ${y0 + 6} ${x + 9} ${y0 + 8} ${x + 7} ${y0 + 17}" class="o${cls}"/>`
      : `<path d="M${x} ${y0} C${x + 2} ${y0 - 6} ${x + 9} ${y0 - 8} ${x + 7} ${y0 - 17}" class="o${cls}"/>`;
  }
  return s;
}

function rest(d, x, top, cls) {
  const mid = top + 2 * S;
  const dot = [3, 6, 12].includes(d) ? `<circle cx="${x + 12}" cy="${mid - HALF}" r="1.8" class="f"/>` : '';
  if (d === 16) return `<rect x="${x - 2}" y="${top + S}" width="12" height="5" class="f${cls}"/>`;
  if (d >= 8) return `<rect x="${x - 2}" y="${mid - 5}" width="12" height="5" class="f${cls}"/>` + dot;
  if (d >= 4) return `<path d="M${x + 1} ${mid - 14} L${x + 7} ${mid - 6} L${x + 2} ${mid} L${x + 8} ${mid + 8} C${x + 2} ${mid + 5} ${x} ${mid + 9} ${x + 4} ${mid + 14}" class="cl${cls}" stroke-width="2.4"/>` + dot;
  const one = (yy) => `<circle cx="${x + 1}" cy="${yy}" r="2.6" class="f${cls}"/><path d="M${x + 1} ${yy + 1} Q${x + 6} ${yy + 2} ${x + 9} ${yy - 3}" class="o"/>`;
  let s = `<line x1="${x + 9}" x2="${x + 3}" y1="${mid - 7}" y2="${mid + (d === 1 ? 12 : 8)}" class="st"/>` + one(mid - 5);
  if (d === 1) s += one(mid + 2);
  return s + dot;
}

// The clefs, drawn as pen strokes in the game's line-work rather than set from a
// music font (no font to load, and none the phone is sure to have).
function trebleClef(x, gy) {
  const s = S;
  const P = (dx, dy) => `${(x + dx * s).toFixed(1)} ${(gy + dy * s).toFixed(1)}`;
  // From the inside of the curl round the G line, out round the belly, up the
  // diagonal to the top loop, then the spine straight down to the hook.
  return `<path class="cl" d="M${P(0.7, 0.2)} C${P(0.6, -0.7)} ${P(-1.0, -0.7)} ${P(-1.0, 0.3)}`
    + ` C${P(-1.0, 1.5)} ${P(1.5, 1.6)} ${P(1.6, 0.1)}`
    + ` C${P(1.7, -1.2)} ${P(0.4, -1.7)} ${P(-0.5, -2.0)}`
    + ` C${P(-1.7, -2.6)} ${P(1.3, -3.9)} ${P(1.0, -5.0)}`
    + ` C${P(0.8, -5.8)} ${P(-0.5, -5.0)} ${P(-0.2, -3.8)}`
    + ` L${P(0.6, 2.3)} C${P(0.7, 3.1)} ${P(-0.4, 3.3)} ${P(-0.8, 2.7)}"/>`
    + `<circle cx="${x - 0.55 * s}" cy="${gy + 2.45 * s}" r="2.7" class="f"/>`;
}
function bassClef(x, fy) {
  const s = S;
  return `<circle cx="${x}" cy="${fy}" r="3" class="f"/>`
    + `<path class="cl" d="M${x - 2} ${fy} C${x - 1} ${fy - 1.3 * s} ${x + 2.4 * s} ${fy - 1.4 * s} ${x + 2.5 * s} ${fy + 0.2 * s} C${x + 2.6 * s} ${fy + 1.8 * s} ${x + 1.2 * s} ${fy + 2.8 * s} ${x - 0.5 * s} ${fy + 3.3 * s}"/>`
    + `<circle cx="${x + 3.2 * s}" cy="${fy - HALF}" r="1.7" class="f"/><circle cx="${x + 3.2 * s}" cy="${fy + HALF}" r="1.7" class="f"/>`;
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

