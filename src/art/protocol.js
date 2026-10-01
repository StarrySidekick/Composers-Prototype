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
  'door.open': INK_DIM,
};

// Line weight at 51 px. Measured: the Unity tube walls and wall border run 2 px,
// the fine curls 1 px.
export const STROKE = { main: 2, fine: 1.2 };

// Where a piece that connects to its neighbour must cross the tile edge, as an
// inclusive pixel span along that edge. Measured from the real art:
//   brass tube walls   y 20..30 on the left/right edges (centre 25)
//   string             y 24..26
// A tube drawn with its walls anywhere else will look broken where it meets the
// next tube, which is the whole reason this table exists.
export const CONNECTOR = {
  brass:  { from: 20, to: 30 },
  string: { from: 24, to: 26 },
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
  return null;
}

export function connectorSpan(key) {
  const type = key.split('.')[0];
  return CONNECTOR[type] ?? null;
}
