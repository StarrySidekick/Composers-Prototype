// What the editor knows about each doodad: which character paints it, what to call
// it, and which properties the inspector should offer.
//
// This is the single place to register a new doodad with the editor — the palette,
// the inspector and the character list all read from here. (The character itself
// still lives in DEFAULT_LEGEND, in src/core/room.js, because rooms are loaded
// without the editor.)

import { DEFAULT_LEGEND } from '../core/room.js';
import { BRASS_PARTS } from '../doodads/brass.js';
import { DRUM_PARTS } from '../doodads/percussion.js';

export const ERASE_CHAR = '.';
export const PLAYER_CHAR = '@';

// Palette layout. Order is the order you see them in.
export const GROUPS = [
  {
    id: 'basics', label: 'Basics', brushes: [
      { char: '@', label: 'Coda', hint: 'start position — only one per room' },
      { char: '.', label: 'floor', hint: 'parchment floor / eraser' },
      { char: '#', label: 'wall', hint: 'blocks Coda and destroys waves' },
      { char: 'D', label: 'door', hint: 'opens when every lock in its group is lit' },
      { char: 'X', label: 'exit', hint: 'walk here to resolve the room' },
      { char: '<', label: 'key −', hint: 'stepping here lowers the room a semitone' },
      { char: '>', label: 'key +', hint: 'stepping here raises the room a semitone' },
      { char: 'x', label: 'dissonance', hint: 'negative Strumentino — sours a wave' },
    ],
  },
  {
    id: 'brass', label: 'Brass — horns & tubing', brushes: [
      { char: 'M', label: 'mouthpiece', hint: 'face it, press B to blow a wave into the horn' },
      { char: '-', label: 'tube ─', hint: 'straight tubing' },
      { char: '|', label: 'tube │', hint: 'straight tubing, vertical' },
      { char: '7', label: 'elbow ┐', hint: 'left ↔ bottom' },
      { char: 'J', label: 'elbow ┘', hint: 'top ↔ left' },
      { char: 'L', label: 'elbow └', hint: 'right ↔ top' },
      { char: 'F', label: 'elbow ┌', hint: 'bottom ↔ right' },
      { char: 'T', label: 'tee ┬', hint: 'halves the wave and branches out of the stem' },
      { char: '+', label: 'cross ┼', hint: 'two channels crossing, no mixing' },
      { char: 'V', label: 'valve', hint: 'press B to rotate the flow 90°' },
      { char: 'S', label: 'slide', hint: 'press B to pull it out — lengthens the horn, lowers it' },
      { char: 'u', label: 'mute', hint: 'press B to seat/pull — quieter, buzzier' },
      { char: 'Y', label: 'bell', hint: 'sounds the horn and swallows the wave' },
    ],
  },
  {
    id: 'percussion', label: 'Percussion — the kit', brushes: [
      { char: 'b', label: 'bass drum', hint: 'a mirror, head / facing up-left; the back absorbs. Rotate in 45° steps' },
      { char: 't', label: 'tom', hint: 'a mirror, head \\ facing up-right; the back absorbs' },
      { char: 's', label: 'snare', hint: 'a mirror, head — facing up: straight back, or edge-on and past' },
      { char: 'h', label: 'hi-hat', hint: 'passes through and ticks' },
      { char: 'c', label: 'cymbal', hint: 'passes through and re-energises a halved wave' },
      { char: 'p', label: 'timpani', hint: 'pitched, absorbs — press B to retune' },
    ],
  },
  {
    id: 'strings', label: 'Strings', brushes: [
      { char: '=', label: 'string ─', hint: 'plucked along its length, silent across it' },
      { char: 'H', label: 'string │', hint: 'plucked along its length, silent across it' },
      { char: 'o', label: 'peg', hint: 'anchors a string run and absorbs waves' },
    ],
  },
  {
    id: 'keys', label: 'Keys', brushes: [
      { char: 'k', label: 'piano key', hint: 'walk on it; wire it to mallets with a group' },
      { char: 'm', label: 'mallet', hint: 'fires a wave when its group is triggered' },
    ],
  },
  {
    id: 'puzzle', label: 'Locks', brushes: [
      { char: 'i', label: 'strumentino', hint: 'blank per-face instrument — set faces / playerFaces in the legend' },
      { char: '*', label: 'lock', hint: 'lit by any wave' },
      { char: 'n', label: 'note lock', hint: 'wants a phrase — press B to hear it' },
    ],
  },
];

// Properties the inspector offers, by doodad type.
// `when` hides a field that doesn't apply to the current part.
export const PROPS = {
  wall: [],
  peg: [],
  exit: [],
  dissonance: [],
  brass: [
    { key: 'part', type: 'enum', values: BRASS_PARTS },
    { key: 'rot', type: 'rot' },
    { key: 'extend', type: 'int', min: 0, max: 3, when: s => s.part === 'slide',
      hint: 'slide position, in tiles of extra horn' },
    { key: 'muted', type: 'bool', when: s => s.part === 'mute' },
  ],
  string: [{ key: 'rot', type: 'rot' }],
  drum: [
    { key: 'part', type: 'enum', values: DRUM_PARTS },
    { key: 'rot', type: 'rot', step: 45, hint: 'head and the way it faces: 0 / NW, 45 — N, 90 \\ NE, 135 | E, 180 / SE, 225 — S, 270 \\ SW, 315 | W', when: s => ['bass', 'tom', 'snare'].includes(s.part) },
    { key: 'degree', type: 'int', min: 0, max: 6, hint: 'scale degree, 0 = tonic' },
    { key: 'octave', type: 'int', min: 1, max: 7 },
    { key: 'solid', type: 'bool', hint: 'off lets Coda walk over it' },
  ],
  pianokey: [
    { key: 'degree', type: 'int', min: 0, max: 6 },
    { key: 'octave', type: 'int', min: 1, max: 7 },
    { key: 'group', type: 'text', hint: 'mallets in this group swing when the key is pressed' },
  ],
  mallet: [
    { key: 'rot', type: 'rot', hint: 'the direction it fires' },
    { key: 'group', type: 'text' },
  ],
  lock: [
    { key: 'group', type: 'text', hint: 'doors in this group open when every lock is lit' },
    { key: 'degree', type: 'int', min: 0, max: 6 },
    { key: 'latching', type: 'bool', hint: 'stays lit once hit' },
  ],
  notelock: [
    { key: 'group', type: 'text' },
    { key: 'sequence', type: 'degrees', hint: 'scale degrees, in order — e.g. 0 2 4' },
  ],
  door: [
    { key: 'group', type: 'text' },
    { key: 'open', type: 'bool', hint: 'starts open' },
  ],
  keyshift: [
    { key: 'delta', type: 'int', min: -12, max: 12, hint: 'semitones' },
  ],
};

export function propsFor(type) { return PROPS[type] ?? []; }

export function specForChar(ch) {
  const s = DEFAULT_LEGEND[ch];
  return s ? { ...s } : null;
}

export function brushForChar(ch) {
  for (const g of GROUPS) {
    const b = g.brushes.find(x => x.char === ch);
    if (b) return { ...b, group: g.id };
  }
  return null;
}

export function allBrushes() { return GROUPS.flatMap(g => g.brushes.map(b => ({ ...b, group: g.id }))); }

// The character list, generated from the palette so it can never drift from it.
export function legendDoc() {
  return allBrushes().map(b => [b.char, `${b.label} — ${b.hint}`]);
}
