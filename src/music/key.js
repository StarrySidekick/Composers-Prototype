// From pitches to the game's scale degrees, and the guess that makes it possible.
//
// The game never plays a pitch: it plays a degree of the room's scale
// (MusicalState.getNote). So music brought in from outside has to be heard as
// degrees, and that needs a key: which note is home (the tonic, degree 0) and
// which seven notes make the scale (the mode).
//
// The key is a GUESS. C ionian and A aeolian are the same seven notes; only
// which one the music leans on tells them apart. So the guess scores every key
// (12 tonics x 7 modes) by how well the time spent on each pitch class matches
// a template: a lot on the tonic, then the fifth, then the third, some on the
// other scale tones, little outside. That is the Krumhansl-Schmuckler idea,
// stretched from major and minor to the seven modes. It reports how sure it is,
// and a person can always overrule it (the library page keeps the override).

import { MODES, MODE_NAMES, MOOD_TO_MODE, NOTE_NAMES, MusicalState } from '../core/music.js';

export const MODE_MOOD = Object.fromEntries(Object.entries(MOOD_TO_MODE).map(([mood, mode]) => [mode, mood]));

// Template weights by role. The tonic is home, the fifth its strongest support,
// the third says major or minor; the remaining scale tones are colour.
const W_TONIC = 6, W_FIFTH = 4.8, W_THIRD = 4.2, W_SCALE = 3.4, W_OUT = 1.6;

function template(root, mode) {
  const t = new Array(12).fill(W_OUT);
  const s = MODES[mode];
  s.forEach((iv, i) => {
    t[(root + iv) % 12] = i === 0 ? W_TONIC : i === 4 ? W_FIFTH : i === 2 ? W_THIRD : W_SCALE;
  });
  return t;
}

function corr(a, b) {
  const n = a.length;
  const ma = a.reduce((x, y) => x + y, 0) / n, mb = b.reduce((x, y) => x + y, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; num += x * y; da += x * x; db += y * y; }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

// Time on each pitch class. A note counts for its length, but no more than a bar
// (a held pad should not outvote the tune), and low notes count half again: a
// bass line says where home is more plainly than anything above it.
export function pitchHistogram(notes) {
  const h = new Array(12).fill(0);
  for (const n of notes) {
    const len = Math.min(n.beats ?? 1, 4);
    h[((n.midi % 12) + 12) % 12] += len * (n.midi < 52 ? 1.5 : 1);
  }
  return h;
}

// When two modes fit equally (a tune that never plays the note that tells D
// ionian from D mixolydian), the commoner one wins. Tiny next to a real
// difference in fit.
const PRIOR = { ionian: 6, aeolian: 5, dorian: 4, mixolydian: 3, lydian: 2, phrygian: 1, locrian: 0 };

// notes: [{ beat, midi, beats }]. Drums should be left out by the caller.
export function detectKey(notes) {
  const raw = pitchHistogram(notes);
  const total = raw.reduce((a, b) => a + b, 0);
  if (!total) return null;
  const h = [...raw];
  // Where a tune ends is the strongest single clue to home: a melody can sit on
  // its fifth for bars (Drunken Sailor hammers A and is in D) and still come home
  // at the end. The lowest note of the last onset gets a share, the first a
  // smaller one.
  const byTime = [...notes].sort((a, b) => (a.beat ?? 0) - (b.beat ?? 0) || a.midi - b.midi);
  const lastAt = byTime[byTime.length - 1].beat ?? 0;
  const last = byTime.find(n => (n.beat ?? 0) === lastAt);
  h[((last.midi % 12) + 12) % 12] += total * 0.12;
  h[((byTime[0].midi % 12) + 12) % 12] += total * 0.05;
  const ranked = [];
  for (let root = 0; root < 12; root++) for (const mode of MODE_NAMES) {
    ranked.push({ root, mode, score: corr(h, template(root, mode)) + PRIOR[mode] * 1e-4 });
  }
  ranked.sort((a, b) => b.score - a.score);
  const best = ranked[0];
  const inScale = new Set(MODES[best.mode].map(iv => (best.root + iv) % 12));
  const fit = raw.reduce((a, v, pc) => a + (inScale.has(pc) ? v : 0), 0) / total;
  return describe({
    root: best.root, mode: best.mode,
    fit: round(fit),
    // How far ahead of the runner-up. Small means "could as well be": a tune that
    // sits on its fifth can read as the mode a fifth up.
    margin: round(best.score - ranked[1].score),
    alternatives: ranked.slice(1, 4).map(k => describe({ root: k.root, mode: k.mode })),
  });
}

export function describe(k) {
  return { ...k, label: `${NOTE_NAMES[k.root]} ${k.mode}`, mood: MODE_MOOD[k.mode] };
}

const round = v => Math.round(v * 1000) / 1000;

// A MIDI note as a degree of the key, the inverse of MusicalState.getNote:
//   getNote(degree, octave) = octave * 12 + root + MODES[mode][degree]
// A note outside the scale (a chromatic passing note, a borrowed chord) has no
// degree. It is snapped to the nearest scale tone, the lower one on a tie, and
// marked inexact, because the game cannot play it: there is no wrong note
// available to the player, and that includes this one.
export function toDegree(midi, { root, mode }) {
  const s = MODES[mode] ?? MODES.ionian;
  const rel = midi - root;
  let octave = Math.floor(rel / 12);
  const within = rel - octave * 12;
  let degree = s.indexOf(within);
  if (degree >= 0) return { degree, octave, exact: true };
  let best = 0, bestD = 99;
  for (let i = 0; i <= s.length; i++) {
    const iv = i === s.length ? 12 : s[i];
    const d = Math.abs(iv - within);
    if (d < bestD) { best = i; bestD = d; }        // strict: the lower wins a tie
  }
  if (best === s.length) { best = 0; octave += 1; }
  return { degree: best, octave, exact: false };
}

// Notes in beats -> the game's notation: [sixteenth, degree, octave] on a grid of
// sixteenths. Returns how many notes had to be snapped to the scale and how far
// the timing sat off the grid (0 = dead on, 0.5 = every note halfway between),
// which is what triplets or a loose performance look like here.
export function toLayerNotes(notes, key, { from = 0, steps = Infinity } = {}) {
  const out = [];
  let snapped = 0, off = 0;
  for (const n of notes) {
    const s = n.beat * 4;
    const q = Math.round(s);
    off += Math.abs(s - q);
    const step = q - from;
    if (step < 0 || step >= steps) continue;
    const d = toDegree(n.midi, key);
    if (!d.exact) snapped++;
    out.push([step, d.degree, d.octave]);
  }
  return { notes: out, snapped, offGrid: notes.length ? round(off / notes.length) : 0 };
}

// The tune on top: at each onset, the highest note. Good enough to pull a
// melody out of chords for a motif; not a voice separator.
export function topLine(notes) {
  const byStart = new Map();
  for (const n of notes) {
    const k = Math.round(n.beat * 4);
    const cur = byStart.get(k);
    if (!cur || n.midi > cur.midi) byStart.set(k, n);
  }
  return [...byStart.values()].sort((a, b) => a.beat - b.beat);
}

// The key signature that writes this key: the mode's parent major scale. D
// dorian is C major's notes from D, so it has C major's signature (none).
// sf: sharps (+) or flats (-), as a MIDI key signature meta event wants it.
const MODE_OFFSET = { ionian: 0, dorian: 2, phrygian: 4, lydian: 5, mixolydian: 7, aeolian: 9, locrian: 11 };
const MAJOR_SF = [0, -5, 2, -3, 4, -1, 6, 1, -4, 3, -2, 5];   // C Db D Eb E F F# G Ab A Bb B
export function keySignature({ root, mode }) {
  const parent = ((root - (MODE_OFFSET[mode] ?? 0)) % 12 + 12) % 12;
  return { sf: MAJOR_SF[parent], mi: mode === 'aeolian' ? 1 : 0, parent };
}

export function stateFor({ root, mode }, bpm = 120) {
  return new MusicalState({ root, mode, bpm, mood: MODE_MOOD[mode] ?? 'content' });
}
