// Cardinal directions in SCREEN space: +y is DOWN (row index grows downward).
// Unity's 2D world is +y UP, so the CW/CCW rotation formulas are mirrored there.
// See docs/PORTING.md — this is the single most common porting mistake.

export const DIR = Object.freeze({
  up:    Object.freeze({ x: 0, y: -1 }),
  right: Object.freeze({ x: 1, y:  0 }),
  down:  Object.freeze({ x: 0, y:  1 }),
  left:  Object.freeze({ x: -1, y: 0 }),
});

export const DIR_ORDER = ['up', 'right', 'down', 'left'];

export function dirName(d) {
  for (const n of DIR_ORDER) if (DIR[n].x === d.x && DIR[n].y === d.y) return n;
  return 'right';
}

// Screen space (y down): clockwise on screen is (x, y) -> (-y, x).
export function rotateCW(d)  { return { x: -d.y, y:  d.x }; }
export function rotateCCW(d) { return { x:  d.y, y: -d.x }; }
export function reverse(d)   { return { x: -d.x, y: -d.y }; }

// Rotate a vector by `deg` clockwise on screen. deg must be a multiple of 90.
export function rotate(d, deg) {
  let v = { x: d.x, y: d.y };
  let steps = ((Math.round(deg / 90) % 4) + 4) % 4;
  while (steps-- > 0) v = rotateCW(v);
  return v;
}

// Which local face a wave is interacting with.
//
// CONVENTION (matches BrassTube.cs / Drum.cs in the Unity project):
// the face is named by the wave's DIRECTION OF TRAVEL expressed in the doodad's
// local space — not by the edge it physically entered through. A wave moving
// right through an unrotated straight pipe hits the `right` face.
export function localFace(worldDir, rot = 0) {
  const l = rotate(worldDir, -rot);
  if (l.x === 1)  return 'right';
  if (l.x === -1) return 'left';
  if (l.y === -1) return 'top';
  return 'bottom';
}

export const FACES = ['top', 'right', 'bottom', 'left'];

// What a face does to Coda walking into it. Mirrors PlayerFaceAction.cs — every
// instrument face carries both a wave behaviour and a player behaviour.
export const PlayerFaceAction = Object.freeze({
  Block:       'block',        // Coda cannot enter from this direction
  PassThrough: 'passThrough',  // Coda walks on freely
  PlayNote:    'playNote',     // stepping onto this face sounds a note
});

// What a face does to a wave travelling into it.
export const FaceAction = Object.freeze({
  Block:         'block',          // wave is destroyed
  PassThrough:   'passThrough',    // continues unchanged
  Redirect90CW:  'redirect90CW',
  Redirect90CCW: 'redirect90CCW',
  Reflect180:    'reflect180',
  PlayAndAbsorb: 'playAndAbsorb',  // instrument sounds, wave ends here
  PlayAndPass:   'playAndPass',    // instrument sounds, wave continues
});
