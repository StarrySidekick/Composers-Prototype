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

// Wall panel. Each side draws a border only if it is NOT joined, so a run of walls
// reads as one mass instead of a row of boxes. With no joins it is a closed panel.
function wall(p, v = '') {
  const n = hasSide(v, 'n'), e = hasSide(v, 'e'), s = hasSide(v, 's'), w = hasSide(v, 'w');
  const i = 3, o = T - 3;
  const xa = w ? 0 : i, xb = e ? T : o;
  const ya = n ? 0 : i, yb = s ? T : o;
  if (!n) p.line(xa, i, xb, i);
  if (!s) p.line(xa, o, xb, o);
  if (!w) p.line(i, ya, i, yb);
  if (!e) p.line(o, ya, o, yb);
  // the ornament: a diamond with four curls, after the Unity block
  p.poly([[M, 15], [36, M], [M, 36], [15, M], [M, 15]], fine);
  p.curl(10, 10, 3.5, { dir: 1 });
  p.curl(41, 41, 3.5, { dir: 1, start: Math.PI });
  p.curl(41, 10, 3.5, { dir: -1, start: Math.PI });
  p.curl(10, 41, 3.5, { dir: -1 });
  // where two walls join, carry a single hatch across the seam so the join is visible
  if (e) p.line(44, M - 4, T, M + 4, fine);
  if (s) p.line(M + 4, 44, M - 4, T, fine);
}

function note(p, x, y) {
  fillDot(p, x, y, 3.6, 2.6);
  p.line(x + 3, y - 1, x + 3, y - 16, fine);
}

export const PLACEHOLDERS = {
  // ---- brass ---------------------------------------------------------------
  'brass.straight': p => { tubeH(p); tubeVines(p, 6, 45, B, 1); },
  'brass.elbow': p => { elbow(p); p.curl(38, 12, 3.4, { dir: 1 }); },
  'brass.tee': p => {
    p.line(0, A, T, A);
    p.line(0, B, A, B); p.line(B, B, T, B);
    p.line(A, B, A, T); p.line(B, B, B, T);
  },
  // A bridge: the horizontal channel passes over, the vertical one ducks under.
  'brass.cross': p => {
    tubeH(p);
    p.line(A, 0, A, A - 3); p.line(B, 0, B, A - 3);
    p.line(A, B + 3, A, T); p.line(B, B + 3, B, T);
    p.arc(M, A - 3, 4.5, Math.PI, 2 * Math.PI, fine);
  },
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
  'brass.valve': p => {
    elbow(p);
    p.box(30, 5, 12, 13);
    p.line(36, 5, 36, 1, fine);
    p.line(32, 1, 40, 1, fine);
  },
  'brass.mute': p => {
    tubeH(p);
    p.poly([[15, 23.5], [36, M], [15, 27.5]], fine);
    p.line(15, 23.5, 15, 27.5, fine);
  },
  'brass.mute.open': p => {
    tubeH(p);
    p.poly([[15, 6], [36, 8], [15, 10]], fine);
    p.line(15, 6, 15, 10, fine);
    p.line(26, 10, 26, 18, { ...fine, wobble: 0.2 });
  },

  // ---- strings -------------------------------------------------------------
  'string': p => { p.line(0, M, T, M, { width: 2, passes: 1, wobble: 0.35 }); },
  'peg': p => {
    p.line(M, 3, M, 17);
    p.circle(M, 29, 10);
    p.curl(M, 29, 6, { dir: 1 });
  },

  // ---- percussion ----------------------------------------------------------
  'drum.bass': p => { p.circle(M, M, 20); p.circle(M, M, 16, fine); rays(p, M, M, 20, 23, 6); },
  'drum.tom': p => { p.circle(M, M, 14); p.circle(M, M, 11, fine); p.line(8, M, 11, M, fine); p.line(40, M, 43, M, fine); },
  'drum.snare': p => {
    p.circle(M, M, 17);
    p.poly([[12, M], [17, 21], [22, 30], [27, 21], [32, 30], [37, 21], [39, M]], fine);
  },
  'drum.hat': p => { p.ellipse(M, 18, 18, 4); p.ellipse(M, 25, 18, 4); p.line(M, 29, M, 47, fine); },
  'drum.cymbal': p => { p.ellipse(M, 20, 21, 6); p.ellipse(M, 18, 4, 2, fine); p.line(M, 26, M, 47, fine); },
  'drum.timpani': p => {
    p.ellipse(M, 16, 19, 6);
    p.path(t => [6 + t * 39, 16 + Math.sin(t * Math.PI) * 20]);
    p.line(14, 32, 10, 47, fine); p.line(37, 32, 41, 47, fine);
  },

  // ---- keys ----------------------------------------------------------------
  'pianokey': p => key(p, ''),
  'mallet': p => { p.line(6, M, 32, M); p.circle(39, M, 7); },

  // ---- puzzle --------------------------------------------------------------
  'lock': p => fork(p),
  'lock.lit': p => { fork(p); rays(p, M, 16, 15, 20, 7); },
  'notelock': p => { p.box(8, 8, 35, 35); note(p, 20, 32); note(p, 31, 29); p.line(23, 16, 34, 13, fine); },
  'notelock.lit': p => {
    p.box(8, 8, 35, 35); note(p, 20, 32); note(p, 31, 29); p.line(23, 16, 34, 13, fine);
    rays(p, M, M, 23, 25, 12);
  },
  'door': p => {
    p.box(11, 3, 29, 45);
    p.line(11, 17, 40, 17, fine); p.line(11, 34, 40, 34, fine);
    p.curl(34, M, 2.8, { dir: 1 });
  },
  'door.open': p => {
    p.line(11, 3, 11, 48); p.line(40, 3, 40, 48);
    p.line(11, 3, 16, 3, fine); p.line(35, 3, 40, 3, fine);
  },
  'keyshift.up': p => {
    p.poly([[8, 44], [8, 34], [20, 34], [20, 23], [32, 23], [32, 12], [44, 12]]);
    p.poly([[36, 34], [42, 28], [48, 34]], fine);
  },
  'keyshift.down': p => {
    p.poly([[8, 12], [20, 12], [20, 23], [32, 23], [32, 34], [44, 34], [44, 44]]);
    p.poly([[4, 26], [10, 32], [16, 26]], fine);
  },
  'exit': p => { p.circle(M, M, 18); note(p, 22, 33); p.curl(30, 15, 3, { dir: 1 }); },
  'dissonance': p => {
    p.line(13, 13, 38, 38, { wobble: 2.2, passes: 3 });
    p.line(38, 13, 13, 38, { wobble: 2.2, passes: 3 });
  },
  // A blank instrument: a box with a notch on each face, since every face is authorable.
  'strumentino': p => {
    p.box(9, 9, 33, 33);
    p.line(M, 9, M, 14, fine); p.line(M, 37, M, 42, fine);
    p.line(9, M, 14, M, fine); p.line(37, M, 42, M, fine);
    p.curl(M, M, 5, { dir: 1 });
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

// The slide gets one drawing per position: a U of tubing pulled further out each time.
for (let ext = 0; ext <= 3; ext++) {
  PLACEHOLDERS[`brass.slide.${ext}`] = p => {
    tubeH(p);
    const y = B + 4 + ext * 4;
    p.line(14, B, 14, y, fine); p.line(37, B, 37, y, fine);
    p.line(14, y, 37, y, fine);
  };
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
