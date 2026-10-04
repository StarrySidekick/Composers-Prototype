// The art protocol: the handful of numbers that let a placeholder and a hand-drawn
// tile be swapped for each other without anything else noticing.
//
// Every value here was measured off the Unity art in assets/sprites, not invented.
// The prose version, with the reasoning, is docs/ART-PROTOCOL.md. When the two
// disagree, this file is what the code obeys, so fix the doc.

import { BRASS_EDGES } from '../doodads/brass.js';

// One tile, in source pixels. The renderer scales whatever it is given, so this is
// the authoring grid, not a display size.
export const TILE = 51;

// Ink. The game is white line-work on black; Unity tints per object, so the art
// itself stays pure white and colour is applied at draw time.
export const INK = '#ffffff';
export const INK_DIM = '#7d7d7d';   // an unlit / inactive state of the same drawing
export const FLOOR = '#000000';

// States drawn with the same picture at a different ink, the way Unity would set
// SpriteRenderer.color rather than ship a second PNG. Applied to real art and
// placeholders alike. A manifest entry's own `ink` wins over this.
export const STATE_INK = {
  'lock': INK_DIM,
  'notelock': INK_DIM,
  'scorelock': INK_DIM,
  'door.open': INK_DIM,
};

// Line weight at 51 px. Measured 2026-10-02 over the Unity sprites (stroke width
// at every ink pixel): 3 px is the most common stroke (42%), 4 px+ next (30%),
// 2 px 21%, 1 px barely used (6%). Tube walls are exactly 3 px (rows 20-22 and
// 28-30), the string 3 px (rows 24-26). So: structure 3, ornament 2.
export const STROKE = { main: 3, fine: 2 };

// Where a piece that connects to its neighbour must cross the tile edge, as an
// inclusive pixel span along that edge. Measured from the real art:
//   brass tube walls   y 20..30 on the left/right edges (centre 25)
//   string             y 24..26
//   flute bore walls   y 22..29 (not measured: no Unity flute yet. Chosen
//                      narrower than brass on purpose, so a flute never reads
//                      as a horn; centred on the tile like the string)
// A tube drawn with its walls anywhere else will look broken where it meets the
// next tube, which is the whole reason this table exists.
export const CONNECTOR = {
  brass:  { from: 20, to: 30 },
  string: { from: 24, to: 26 },
  flute:  { from: 22, to: 29 },
};

// A flute is a straight run, head on the left at rot 0 (src/doodads/woodwind.js):
// the head joins only the tile after it, the foot only the one before.
const FLUTE_EDGES = {
  head: ['right'],
  hole: ['left', 'right'],
  covered: ['left', 'right'],
  foot: ['left'],
};

// Edges a sprite key's art must reach, in the sprite's own unrotated space.
// `null` means "no connector rule for this key".
export function connectorEdges(key) {
  const [type, part] = key.split('.');
  if (type === 'brass') {
    if (part === 'slide' || part === 'mute') return BRASS_EDGES[part];
    return BRASS_EDGES[part] ?? null;
  }
  if (type === 'string') return ['left', 'right'];
  if (type === 'flute') return FLUTE_EDGES[part] ?? null;
  return null;
}

export function connectorSpan(key) {
  const type = key.split('.')[0];
  return CONNECTOR[type] ?? null;
}
