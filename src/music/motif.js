// A motif: a few bars written in scale degrees, the game's own musical unit.
//
//   { id, name, key: { root, mode }, bpm, bars, family, octave,
//     notes: [[step, length, degree], ...],      // sixteenths; degree from `octave`
//     source: { piece, title, track, clip } }    // where it was lifted from, if anywhere
//
// Degrees, not pitches, so the same motif is bright in ionian and dark in
// phrygian, and moves with the stairs: exactly how a score layer behaves. Lengths
// are kept for the sheet music and the .mid; the game plays each note's start
// (a score layer has no lengths), so exports drop them.
//
// From here a motif becomes any of the game's musical things:
//   motifToLayer     a layer of a world's score (rooms/world.json "score")
//   motifToCue       a scene's cue (story/acts/*.json "cue", src/story/cue.js)
//   motifToSequence  a note lock's phrase ("sequence" in a room's overrides)
//   motifToMidi      a .mid with the key signature, for MuseScore

import { MusicalState } from '../core/music.js';
import { toDegree, keySignature, topLine } from './key.js';
import { writeMidi } from './midi-file.js';

export const FAMILIES = ['keys', 'strings', 'brass', 'woodwind', 'voice', 'timpani'];

export function newMotif(over = {}) {
  return {
    id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: 'untitled motif', key: { root: 0, mode: 'ionian' }, bpm: 110, bars: 2,
    family: 'keys', octave: 5, notes: [], source: null, ...over,
  };
}

export function motifState(m) {
  return new MusicalState({ root: m.key.root, mode: m.key.mode, bpm: m.bpm });
}

// Every note as a pitch: through the scale, never around it.
export function motifPitches(m) {
  const s = motifState(m);
  return m.notes.map(([step, len, degree]) => ({ start: step, len, step, midi: s.getNote(degree, m.octave), degree }));
}

const slug = s => (s || 'motif').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'motif';
const byTime = m => [...m.notes].sort((a, b) => a[0] - b[0] || b[2] - a[2]);

export function motifToLayer(m) {
  return {
    id: slug(m.name), name: m.name, by: 'start', family: m.family, octave: m.octave,
    notes: byTime(m).map(([s, , d]) => [s, d]),
  };
}

export function motifToCue(m) {
  const { family, octave, notes } = motifToLayer(m);
  return { bars: m.bars, layers: [{ family, octave, notes }] };
}

// A note lock hears pitch classes, one note at a time, and ignores a note that
// repeats the last (src/doodads/locks.js hearNote). So its phrase is the top
// line, folded into one octave, with repeats taken out.
export function motifToSequence(m) {
  const tops = new Map();
  for (const [s, , d] of m.notes) if (!tops.has(s) || d > tops.get(s)) tops.set(s, d);
  const degrees = [...tops.entries()].sort((a, b) => a[0] - b[0]).map(([, d]) => ((d % 7) + 7) % 7);
  const sequence = degrees.filter((d, i) => i === 0 || d !== degrees[i - 1]);
  return { sequence, collapsed: degrees.length - sequence.length };
}

export function motifToMidi(m) {
  const notes = motifPitches(m).map(n => ({ beat: n.start / 4, beats: n.len / 4, midi: n.midi, vel: 96 }));
  return writeMidi({ bpm: m.bpm, key: keySignature(m.key), title: m.name, tracks: [{ name: `${m.name} (${m.family})`, notes }] });
}

// A score layer or cue layer, back into a motif. A layer has no lengths: each
// note lasts until the next starts, at most a half note.
export function motifFromLayer(layer, { bars = 4, key = { root: 0, mode: 'ionian' }, bpm = 110, name } = {}) {
  const steps = bars * 16;
  const octave = layer.octave ?? 4;
  const pts = (layer.notes ?? []).map(([s, d, o]) => [((s % steps) + steps) % steps, d + 7 * ((o ?? octave) - octave)]);
  const starts = [...new Set(pts.map(p => p[0]))].sort((a, b) => a - b);
  const notes = pts.map(([s, d]) => {
    const next = starts.find(x => x > s) ?? steps;
    return [s, Math.max(1, Math.min(8, next - s)), d];
  });
  return newMotif({ name: name ?? layer.name ?? layer.id ?? 'layer', key, bpm, bars, family: FAMILIES.includes(layer.family) ? layer.family : 'keys', octave, notes });
}

// A clip of your music, into a motif in its piece's key. Pitches outside the
// scale are snapped (and counted); with `top`, only the highest note of each
// onset is kept, which is usually the tune. Notes beyond the writer's range
// (from two below the tonic to two octaves up) are dropped and counted.
export function motifFromClip(clip, { key, bpm = 110, fromBar = 0, bars = 4, top = true, name = 'from a clip', family = 'keys', source = null } = {}) {
  const from = fromBar * 16, steps = bars * 16;
  let notes = clip.notes
    .filter(([s]) => s >= from && s < from + steps)
    .map(([s, len, midi]) => ({ beat: (s - from) / 4, beats: len / 4, midi, s: s - from, len }));
  if (top) notes = topLine(notes);
  const degs = notes.map(n => ({ ...n, ...toDegree(n.midi, key) }));
  // The register: the octave that keeps the most notes in the grid.
  let best = 5, bestIn = -1;
  for (let o = 2; o <= 7; o++) {
    const inside = degs.filter(n => { const d = n.degree + 7 * (n.octave - o); return d >= -2 && d <= 14; }).length;
    if (inside > bestIn) { best = o; bestIn = inside; }
  }
  const kept = [], dropped = [];
  for (const n of degs) {
    const d = n.degree + 7 * (n.octave - best);
    if (d < -2 || d > 14) { dropped.push(n); continue; }
    kept.push([n.s, Math.max(1, Math.min(n.len, steps - n.s)), d]);
  }
  return {
    motif: newMotif({ name, key: { root: key.root, mode: key.mode }, bpm: Math.round(bpm), bars, family, octave: best, notes: kept, source }),
    snapped: degs.filter(n => !n.exact).length,
    dropped: dropped.length,
  };
}
