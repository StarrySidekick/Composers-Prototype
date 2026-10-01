// Placeholder art in the house style: white sketch lines on transparency, 51 px.
//
// These exist so a mechanic can be built and judged before its art is drawn. They are
// not meant to be good — they are meant to be the right *shape*: same grid, same
// line weight, same connectors, same state names as the real thing, so when the real
// drawing arrives it drops into the slot and nothing else changes.
//
// One function per sprite key. Each gets a Pen seeded from its own key and draws in
// a 51×51 space, unrotated (the renderer rotates). Linked keys (`wall.ns`) get the
// variant string as a second argument. Anything not listed here falls through to
// the real sprite or the schematic draw(), so this list can stay incomplete.
//
// Protocol and the reasoning behind every number: docs/ART-PROTOCOL.md.

import { TILE, STROKE } from './protocol.js';
import { Pen, crisp } from './pen.js';
import { linkVariants, hasSide } from './links.js';

const T = TILE;            // 51
const M = T / 2;           // 25.5
const A = 21, B = 30;      // tube wall centres: pixel rows 20-21 and 29-30, the measured connector
const fine = { width: STROKE.fine, passes: 1 };

function tubeH(p, x0 = 0, x1 = T) { p.line(x0, A, x1, A); p.line(x0, B, x1, B); }
function tubeV(p, y0 = 0, y1 = T) { p.line(A, y0, A, y1); p.line(B, y0, B, y1); }

// A few curls hanging off a tube wall, like the vines on the Unity tubing.
function tubeVines(p, x0, x1, y, dir) {
  const n = 1 + Math.floor(p.r() * 2);
  for (let i = 0; i < n; i++) {
    const x = x0 + (x1 - x0) * ((i + 0.5 + (p.r() - 0.5) * 0.5) / n);
    p.line(x, y, x + 2, y + dir * 5, fine);
    p.curl(x + 2, y + dir * 8, 2.6, { dir: dir });
  }
}

// ┐ — left edge to bottom edge, around the bottom-left corner.
function elbow(p) {
  p.arc(0, T, T - A, -Math.PI / 2, 0);  // outer wall, radius 30
  p.arc(0, T, T - B, -Math.PI / 2, 0);  // inner wall, radius 21
}

function rays(p, cx, cy, r0, r1, n = 8) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.2;
    p.line(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, cx + Math.cos(a) * r1, cy + Math.sin(a) * r1, fine);
  }
}

function fillDot(p, x, y, rx, ry = rx, rot = -0.4) {
  const c = p.c;
  c.save();
  c.fillStyle = p.ink;
  c.beginPath();
  c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

// A tuning fork: the Unity lock is one.
function fork(p) {
  p.line(M, 47, M, 31);
  p.line(19, 31, 32, 31);
  p.line(19, 31, 19, 6);
  p.line(32, 31, 32, 6);
  p.curl(17, 40, 4, { dir: -1, start: 0 });
  p.curl(34, 40, 4, { dir: 1, start: Math.PI });
}

// Linked keyboard key. Shared edges get one separator, drawn by the tile on the left.
function key(p, v = '') {
  const e = hasSide(v, 'e'), w = hasSide(v, 'w');
  const x0 = w ? 0 : 6, x1 = e ? T : 45;
  p.line(x0, 4, x1, 4);
  p.line(x0, 47, x1, 47);
  if (!w) p.line(6, 4, 6, 47);
  if (!e) p.line(45, 4, 45, 47);
  else p.line(T - 1, 4, T - 1, 47, fine);
}

// Wall. Quiet on purpose: one border, only where the wall meets floor (the sides
// that are NOT joined), and a curl tucked into each outside corner. Nothing
// inside, so a mass of wall reads as solid black and the room as a clean outline.
// The border sits 3 px in from the edge; joined sides run it right to the edge so
// it continues unbroken into the next tile.
function wall(p, v = '') {
  const n = hasSide(v, 'n'), e = hasSide(v, 'e'), s = hasSide(v, 's'), w = hasSide(v, 'w');
  const i = 3, o = T - 3;
  const xa = w ? 0 : i, xb = e ? T : o;
  const ya = n ? 0 : i, yb = s ? T : o;
  const edge = { wobble: 0.35 };
  if (!n) p.line(xa, i, xb, i, edge);
  if (!s) p.line(xa, o, xb, o, edge);
  if (!w) p.line(i, ya, i, yb, edge);
  if (!e) p.line(o, ya, o, yb, edge);
  // outside corners: both meeting sides face floor
  const k = 8;
  if (!n && !e) p.curl(o - k, i + k, 3.2, { dir: 1, start: -Math.PI / 2 });
  if (!s && !e) p.curl(o - k, o - k, 3.2, { dir: 1, start: 0 });
  if (!s && !w) p.curl(i + k, o - k, 3.2, { dir: 1, start: Math.PI / 2 });
  if (!n && !w) p.curl(i + k, i + k, 3.2, { dir: 1, start: Math.PI });
}

// The inside-corner patch, authored for the north-east corner and rotated by the
// renderer into the others (see innerCorners in links.js). It joins the border
// coming down from the north neighbour (x = 48) to the one coming in from the east
// neighbour (y = 3): a 3 px L, no more.
function wallInner(p) {
  const o = T - 3, i = 3, tiny = { wobble: 0, passes: 1 };
  p.line(o, 0, o, i, tiny);
  p.line(o, i, T, i, tiny);
}

function note(p, x, y) {
  fillDot(p, x, y, 3.6, 2.6);
  p.line(x + 3, y - 1, x + 3, y - 16, fine);
}

export const PLACEHOLDERS = {
  // ---- brass ---------------------------------------------------------------
  'brass.elbow': p => { elbow(p); p.curl(38, 12, 3.4, { dir: 1 }); },
  // Cup on the left (where you blow), stem out of the right edge — see PARTS.edges.
  'brass.mouthpiece': p => {
    tubeH(p, 24, T);
    p.line(24, A, 12, 12); p.line(24, B, 12, 39);
    p.line(12, 12, 12, 39);
    p.curl(7, 25.5, 3.5, { dir: 1 });
  },
  // Throat on the left edge, bell opening to the right.
  'brass.flare': p => {
    tubeH(p, 0, 22);
    p.path(t => [22 + t * 24, A - t * t * 15]);
    p.path(t => [22 + t * 24, B + t * t * 15]);
    p.ellipse(46, M, 2.5, 18, fine);
    p.vine(4, B + 2, 18, 42, { curls: 1 });
  },

  // ---- strings -------------------------------------------------------------
  'string': p => { p.line(0, M, T, M, { width: 2, passes: 1, wobble: 0.35 }); },
  'peg': p => {
    p.line(M, 3, M, 17);
    p.circle(M, 29, 10);
    p.curl(M, 29, 6, { dir: 1 });
  },

  // ---- percussion ----------------------------------------------------------

  // ---- keys ----------------------------------------------------------------
  'pianokey': p => key(p, ''),

  // ---- puzzle --------------------------------------------------------------
  'lock': p => fork(p),
  'lock.lit': p => { fork(p); rays(p, M, 16, 15, 20, 7); },
  // Drawn upright: a gap in a wall that runs north-south, so the wall above and
  // below meet its top and bottom. The renderer turns it 90 in an east-west wall.
  // Lintel and sill span the wall's width (x 3..48) so they meet its borders.
  'door': p => {
    p.line(3, 2, 48, 2); p.line(3, 49, 48, 49);
    p.line(14, 2, 14, 49); p.line(37, 2, 37, 49);
    p.line(14, M, 37, M, fine);
    p.curl(31, 33, 2.8, { dir: 1 });
  },
  'door.open': p => {
    p.line(3, 2, 48, 2); p.line(3, 49, 48, 49);
    p.line(14, 2, 7, 12, fine);   // the leaf, swung open
  },

  // ---- not tiles -----------------------------------------------------------
  'wave': p => {
    p.path(t => [6 + t * 39, M + Math.sin(t * Math.PI * 3) * 10 * Math.sin(t * Math.PI)], { width: 2 });
  },
};

// Linked families: generated, one per variant.
const LINKED = { wall, pianokey: key };
for (const [type, fn] of Object.entries(LINKED)) {
  PLACEHOLDERS[type] = p => fn(p, '');
  for (const v of linkVariants(type)) PLACEHOLDERS[`${type}.${v}`] = p => fn(p, v);
}
PLACEHOLDERS['wall.inner'] = wallInner;

// The slide gets one drawing per position: a U of tubing pulled further out each time.
for (let ext = 0; ext <= 3; ext++) {
  PLACEHOLDERS[`brass.slide.${ext}`] = p => {
    tubeH(p);
    const y = B + 4 + ext * 4;
    p.line(14, B, 14, y, fine); p.line(37, B, 37, y, fine);
    p.line(14, y, 37, y, fine);
  };
}

// ---------------------------------------------------------------------------
// Second pass, 2026-10-01: in more of Timothy's hand.
//
// The first placeholders were diagrams. These borrow the vocabulary of the real
// Unity art: tubing wound with vines that end in curls and small flowers, drums
// drawn from the side like the bass drum, and a curl wherever a line would
// otherwise just stop. Connectors are unchanged (tube walls at rows 20-21 and
// 29-30), so they still join the real tubes.
//
// Some carry information as well as style: the bass drum and the tom each wear
// a curl that turns the way they kick a wave (clockwise, counter-clockwise).

// A small flower: four petals round a point, like the ones on the Unity vines.
function flower(p, x, y, r = 1.6) {
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    p.circle(x + Math.cos(a) * r, y + Math.sin(a) * r, 1.1, { width: 1, wobble: 0 });
  }
}

// A vine wound along a horizontal stretch of tubing, on the bottom wall.
function tubeVine(p, x0, x1, { flowers = 1 } = {}) {
  p.path(t => [x0 + (x1 - x0) * t, B + 2 + Math.sin(t * Math.PI * 2.2) * 2.2], { width: 1, wobble: 0.2 });
  const n = 2;
  for (let i = 0; i < n; i++) {
    const x = x0 + (x1 - x0) * ((i + 0.6) / (n + 0.2));
    p.curl(x, B + 7, 2.8, { dir: i % 2 ? 1 : -1, start: -Math.PI / 2 });
  }
  for (let i = 0; i < flowers; i++) flower(p, x0 + (x1 - x0) * 0.35 + i * 9, B + 6);
  // a tendril over the top wall too
  p.line(x0 + 8, A, x0 + 6, A - 5, { width: 1, wobble: 0 });
  p.curl(x0 + 6, A - 8, 2.4, { dir: 1, start: Math.PI / 2 });
}

// A drum seen from the side: top head as an ellipse, the shell, the bottom rim.
function drumSide(p, cx, top, w, h) {
  p.ellipse(cx, top, w, w * 0.32);
  p.line(cx - w, top, cx - w, top + h);
  p.line(cx + w, top, cx + w, top + h);
  p.path(t => [cx - w + 2 * w * t, top + h + Math.sin(t * Math.PI) * w * 0.32]);
}

// Which way a drum turns a wave, worn as a curl with an arrowhead.
function turnCurl(p, cx, cy, dir) {
  const a0 = -Math.PI / 2, a1 = a0 + dir * Math.PI * 1.3;
  p.arc(cx, cy, 5, a0, a1, { width: 1, wobble: 0 });
  const ex = cx + Math.cos(a1) * 5, ey = cy + Math.sin(a1) * 5;
  const tx = -Math.sin(a1) * dir, ty = Math.cos(a1) * dir;   // travel direction
  p.line(ex, ey, ex - tx * 3 + ty * 2, ey - ty * 3 - tx * 2, { width: 1, wobble: 0 });
  p.line(ex, ey, ex - tx * 3 - ty * 2, ey - ty * 3 + tx * 2, { width: 1, wobble: 0 });
}

function stairs(p, up) {
  const pts = up
    ? [[7, 44], [7, 36], [17, 36], [17, 27], [27, 27], [27, 18], [37, 18], [37, 9], [44, 9]]
    : [[7, 9], [14, 9], [14, 18], [24, 18], [24, 27], [34, 27], [34, 36], [44, 36], [44, 44]];
  p.poly(pts);
  // the banister, ending in a curl
  const rail = up ? [[9, 31], [39, 4]] : [[12, 4], [42, 31]];
  p.line(...rail[0], ...rail[1], { width: 1 });
  p.curl(...(up ? [9, 34] : [42, 34]), 3, { dir: up ? -1 : 1 });
}

function noteBox(p) {
  p.box(7, 7, 37, 37);
  // a clef-like curl down the left, two beamed notes on the right
  p.path(t => [16 + Math.sin(t * Math.PI * 3) * 3, 12 + t * 26], { width: 1 });
  p.curl(16, 33, 3, { dir: 1 });
  note(p, 26, 33); note(p, 35, 30);
  p.line(29, 17, 38, 14, { width: 1 });
}

Object.assign(PLACEHOLDERS, {
  'brass.straight': p => { tubeH(p); tubeVine(p, 7, 44); },
  'brass.tee': p => {
    p.line(0, A, T, A);
    p.line(0, B, A, B); p.line(B, B, T, B);
    p.line(A, B, A, T); p.line(B, B, B, T);
    p.line(36, A, 40, A - 6, { width: 1 }); p.curl(40, A - 9, 2.6, { dir: 1, start: Math.PI / 2 });
    flower(p, 9, A - 6);
  },
  // A bridge: the horizontal channel passes over, the vertical ducks under with a
  // curl either side, so it reads as "over" and not as a junction.
  'brass.cross': p => {
    tubeH(p);
    p.line(A, 0, A, A - 4); p.line(B, 0, B, A - 4);
    p.line(A, B + 4, A, T); p.line(B, B + 4, B, T);
    p.curl(A - 4, A - 5, 2.4, { dir: -1 }); p.curl(B + 4, B + 5, 2.4, { dir: 1 });
  },
  // An elbow with a piston on top: press it (B) and the bend turns.
  'brass.valve': p => {
    elbow(p);
    p.box(29, 6, 13, 11, { width: 2, overshoot: 0 });
    p.line(35.5, 6, 35.5, 2, { width: 1 });
    p.ellipse(35.5, 2, 4, 1.4, { width: 1 });
    p.curl(42, 26, 3, { dir: 1, start: Math.PI });
  },
  'brass.mute': p => {
    tubeH(p);
    p.poly([[14, 23.5], [34, 25.5], [14, 27.5]], { width: 1, wobble: 0 });
    p.ellipse(14, 25.5, 1.2, 2.2, { width: 1, wobble: 0 });
    p.curl(38, 13, 3, { dir: 1 }); p.line(38, 16, 34, 20, { width: 1 });
  },
  'brass.mute.open': p => {
    tubeH(p);
    p.poly([[14, 4], [34, 7], [14, 10]], { width: 1, wobble: 0 });
    p.line(24, 11, 24, 19, { width: 1 });
    p.curl(38, 39, 3, { dir: -1 });
  },

  // ---- percussion, from the side -------------------------------------------
  'drum.bass': p => {
    p.circle(M, M, 19); p.circle(M, M, 15, { width: 1 });
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + 0.3; p.line(M + Math.cos(a) * 19, M + Math.sin(a) * 19, M + Math.cos(a) * 22, M + Math.sin(a) * 22, { width: 1, wobble: 0 }); }
    turnCurl(p, M, M, 1);
  },
  'drum.tom': p => { drumSide(p, M, 16, 15, 18); turnCurl(p, M, 16, -1); p.curl(9, 40, 3, { dir: -1 }); },
  'drum.snare': p => {
    drumSide(p, M, 18, 17, 13);
    p.poly([[10, 26], [14, 30], [18, 26], [22, 30], [26, 26], [30, 30], [34, 26], [38, 30], [41, 27]], { width: 1, wobble: 0 });
    p.line(9, 9, 19, 15, { width: 1 }); p.line(42, 9, 32, 15, { width: 1 });   // crossed sticks
  },
  'drum.hat': p => {
    p.ellipse(M, 14, 17, 3.5); p.ellipse(M, 20, 17, 3.5);
    p.line(M, 23, M, 44, { width: 1 });
    p.curl(M - 7, 46, 3, { dir: -1 }); p.curl(M + 7, 46, 3, { dir: 1 });
  },
  'drum.cymbal': p => {
    p.path(t => [6 + t * 39, 20 - Math.sin(t * Math.PI) * 6]);
    p.path(t => [6 + t * 39, 20 + Math.sin(t * Math.PI) * 2]);
    p.ellipse(M, 14, 3, 1.4, { width: 1, wobble: 0 });
    p.line(M, 22, M, 45, { width: 1 });
    p.curl(M + 7, 46, 3, { dir: 1 }); p.curl(M - 7, 46, 3, { dir: -1 });
  },
  'drum.timpani': p => {
    p.ellipse(M, 15, 19, 5.5);
    p.path(t => [6.5 + t * 38, 15 + Math.sin(t * Math.PI) * 19]);
    p.line(14, 31, 11, 46, { width: 1 }); p.line(37, 31, 40, 46, { width: 1 });
    p.curl(9, 47, 2.6, { dir: -1 }); p.curl(42, 47, 2.6, { dir: 1 });
  },
  'mallet': p => { p.line(5, M, 31, M); p.circle(38, M, 7); p.curl(38, M, 3.4, { dir: 1 }); p.curl(5, M + 4, 2.4, { dir: -1 }); },

  // ---- puzzle --------------------------------------------------------------
  'notelock': p => noteBox(p),
  'notelock.lit': p => { noteBox(p); rays(p, M, M, 22, 25, 12); },
  // An archway with a note in it: the way out of the last room.
  'exit': p => {
    p.line(10, 46, 10, 20); p.line(41, 46, 41, 20);
    p.arc(M, 20, 15.5, Math.PI, 2 * Math.PI);
    p.line(6, 46, 45, 46);
    note(p, 22, 36); p.curl(31, 22, 3, { dir: 1 });
  },
  'keyshift.up': p => stairs(p, true),
  'keyshift.down': p => stairs(p, false),
  'dissonance': p => {
    p.poly([[8, 30], [14, 18], [19, 33], [25, 15], [31, 36], [37, 17], [43, 30]], { width: 2, wobble: 1.4 });
    p.line(14, 18, 12, 13, { width: 1 }); p.line(25, 15, 26, 9, { width: 1 }); p.line(37, 17, 40, 12, { width: 1 });
  },
  // A blank instrument: every face is authorable, so a notch on each face.
  'strumentino': p => {
    p.box(9, 9, 33, 33);
    p.line(M, 9, M, 15, { width: 1 }); p.line(M, 36, M, 42, { width: 1 });
    p.line(9, M, 15, M, { width: 1 }); p.line(36, M, 42, M, { width: 1 });
    p.curl(M, M, 6, { dir: 1 });
  },
});

// ---------------------------------------------------------------------------
// Proposals: art for things the game does not have yet. Nothing asks for these
// keys, so they never appear in a room; they exist to be looked at and argued
// about in the asset review, next to the real thing.
export const PROPOSALS = {
  // Woodwind has no instrument at all. A reed: blow into it and it sounds the
  // room's root, like a mouthpiece that is its own horn.
  'woodwind.reed': p => {
    p.line(4, A, 34, A); p.line(4, B, 34, B);
    p.poly([[34, A], [46, 23], [46, 28], [34, B]], { width: 1, wobble: 0 });
    p.curl(10, 12, 3, { dir: 1 }); flower(p, 22, 38);
  },
  // A flute run: holes along the top. Waves passing along it sound, and each
  // covered hole (a block on it) lowers the note.
  'woodwind.flute': p => {
    tubeH(p);
    for (const x of [11, 20, 29, 38]) p.circle(x, 25.5, 2, { width: 1, wobble: 0 });
    p.curl(44, 12, 2.6, { dir: 1 });
  },
  // A lock that wants an ABSOLUTE pitch, not a scale degree, so the stairs
  // (key + / key -) matter to it. Marked by a sharp sign.
  'notelock.absolute': p => {
    noteBox(p);
    p.line(36, 9, 34, 21, { width: 1 }); p.line(40, 9, 38, 21, { width: 1 });
    p.line(32, 13, 42, 12, { width: 1 }); p.line(32, 17, 42, 16, { width: 1 });
  },
  // The Composer's Key itself, in line work: the note-key from the website.
  'key.pickup': p => {
    p.ellipse(18, 37, 7.5, 5.2);
    p.line(25, 35, 25, 7);
    p.line(25, 9, 34, 9); p.line(25, 14, 32, 14); p.line(25, 19, 35, 19);
    p.curl(12, 37, 2.6, { dir: 1 });
  },
  // A floor tile with the staff showing through, for rooms that want it.
  'floor.staff': p => {
    for (let i = 1; i <= 5; i++) p.line(0, 8 * i, T, 8 * i, { width: 1, wobble: 0 });
  },
};

export function proposalKeys() { return Object.keys(PROPOSALS).sort(); }

export function drawProposal(key) {
  const fn = PROPOSALS[key];
  if (!fn) return null;
  const cv = document.createElement('canvas');
  cv.width = cv.height = T;
  fn(new Pen(cv.getContext('2d'), key));
  return crisp(cv);
}

export function placeholderKeys() { return Object.keys(PLACEHOLDERS).sort(); }

// Render one placeholder to a fresh canvas at the native 51 px.
export function drawPlaceholder(key) {
  const fn = PLACEHOLDERS[key];
  if (!fn) return null;
  const cv = document.createElement('canvas');
  cv.width = cv.height = T;
  const c = cv.getContext('2d');
  fn(new Pen(c, key), key.split('.').slice(1).join('.'));
  return crisp(cv);
}
