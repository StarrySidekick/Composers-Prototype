// Placeholder art in Timothy's hand: white line-work on transparency, 51 px.
//
// These stand in for his drawings until he makes them. The rules they follow are in
// .claude/skills/composers-key-art/references/style-card.md, measured and studied
// from his Unity sprites and his site (2026-10-02). In short:
//
//   - Two registers. Brass is a LIVING BRANCH: tube walls with grain inside, twigs
//     that fork into buds, clover flowers hanging off them, the elbow looping into
//     a coil. Made things (forks, mallets, keys, doors, drums, locks) are CRAFTED:
//     symmetric, straight, double strokes, small solid fills, paired scrolls.
//   - Nothing just stops. A stalk ends in a spiral, a twig in two buds, a frame
//     corner in a scroll. Ornament grows OUT of the form, never floats beside it.
//   - Structure 3 px, ornament 2 px, spirals finer (1.5) and open (~1.75 turns).
//
// One function per sprite key, drawn unrotated in a 51 x 51 space with a Pen seeded
// from the key (the same drawing every frame). Connectors are fixed by the protocol:
// tube walls cross the edge on rows 20-22 and 28-30, the string on 24-26.

import { TILE, STROKE } from './protocol.js';
import { Pen, crisp } from './pen.js';
import { linkVariants, hasSide } from './links.js';

const T = TILE;            // 51
const M = T / 2;           // 25.5
const A = 21.5, B = 29.5;  // tube wall centres, 3 px each: rows 20-22 and 28-30, as the Unity tubes
const fine = { width: STROKE.fine, passes: 1 };
const thin = { width: 1.5, passes: 1, wobble: 0.15 };
const crafted = { wobble: 0.12 };      // made things are drawn straighter than living ones

// ---------------------------------------------------------------------------
// Brass: the living branch

function tubeH(p, x0 = 0, x1 = T) { p.line(x0, A, x1, A); p.line(x0, B, x1, B); }

// Grain inside the tube, between the walls: a broken line with a split, the way
// his tubes have a crack of wood running through them.
function grain(p, x0, x1) {
  const y = M;
  p.line(x0, y, x0 + (x1 - x0) * 0.55, y + 0.6, thin);
  p.line(x0 + (x1 - x0) * 0.4, y, x0 + (x1 - x0) * 0.62, y - 1.6, thin);
  p.line(x0 + (x1 - x0) * 0.68, y + 0.4, x1, y - 0.2, thin);
}

// What grows on a horizontal stretch of tube: a twig up off the top wall, a twig
// down off the bottom wall with a clover hanging from it. Kept clear of the edges.
function growth(p, x0, x1, { up = true, down = true, flower = true } = {}) {
  if (up) p.twig(x0 + (x1 - x0) * 0.28, A - 1.5, -Math.PI / 2 - 0.5, 7);
  if (down) {
    const x = x0 + (x1 - x0) * 0.68;
    p.line(x, B + 1.5, x + 3, B + 7, { width: 2, passes: 1, wobble: 0.2 });
    if (flower) p.clover(x + 4.5, B + 10.5);
    else p.curlAt(x + 3, B + 7, Math.PI / 3, 3.5, { dir: -1 });
  }
}

// ┐ — left edge to bottom edge round the bottom-left corner, and above the bend
// the branch loops into a coil with a leaf in it, as his elbow does.
function elbow(p) {
  p.arc(0, T, T - A, -Math.PI / 2, 0);   // outer wall, radius 29.5
  p.arc(0, T, T - B, -Math.PI / 2, 0);   // inner wall, radius 21.5
  // the coil: a loop off the outer wall at the top of the bend
  p.path(t => {
    const a = -Math.PI * 0.75 + t * Math.PI * 1.7;
    return [36 + Math.cos(a) * 8, 13 + Math.sin(a) * 8];
  }, { width: 2, passes: 1, wobble: 0.2 });
  // a leaf inside the coil
  p.path(t => [32 + t * 8, 13 + Math.sin(t * Math.PI) * -2.5], thin);
  p.path(t => [32 + t * 8, 13 + Math.sin(t * Math.PI) * 2.5], thin);
  p.clover(44, 33);
  p.line(41, 26, 43, 30, { width: 1.5, passes: 1, wobble: 0 });
}

// ---------------------------------------------------------------------------
// Small shared pieces

function rays(p, cx, cy, r0, r1, n = 8) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.2;
    p.line(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, cx + Math.cos(a) * r1, cy + Math.sin(a) * r1, fine);
  }
}

function fillDot(p, x, y, rx, ry = rx, rot = -0.4) {
  const c = p.c;
  c.save(); c.fillStyle = p.ink; c.beginPath();
  c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); c.fill(); c.restore();
}

function note(p, x, y, stem = 14) {
  fillDot(p, x, y, 3.4, 2.5);
  p.line(x + 3, y - 1, x + 3, y - stem, fine);
}

// A pair of scrolls, mirror images, growing out of a point on each side: the
// crafted register's signature (his fork, his block).
// On his fork the scrolls leave the stem sideways and wind back toward it, one
// each side, mirror images; they never cross under the stem.
function scrolls(p, x, y, spread, r = 4.5) {
  p.stalk(x - 1, y, Math.PI - 0.15, spread, r, { dir: -1, bend: 0.15 });
  p.stalk(x + 1, y, 0.15, spread, r, { dir: 1, bend: -0.15 });
}

// ---------------------------------------------------------------------------
// Crafted pieces

// The tuning fork, after his: long tines tapering to points, a V where they meet,
// a double stem, and a scroll on each side of the V.
function fork(p) {
  for (const s of [-1, 1]) {
    const x = M + s * 6;
    p.path(t => [x + s * (1 - t) * 1.5 - s * t * 0.5, 4 + t * 26], { width: 3, passes: 1, wobble: 0.1 });
  }
  p.line(M - 6, 30, M, 36, crafted); p.line(M + 6, 30, M, 36, crafted);
  p.line(M - 1, 36, M - 1, 48, { width: 1.5, ...crafted }); p.line(M + 1.5, 36, M + 1.5, 48, { width: 1.5, ...crafted });
  scrolls(p, M, 38, 8, 5.5);
}

// Piano key, linked into keyboards. A tall key with a notched head and a line
// inside the outline, like his; shared edges get one separator.
function key(p, v = '') {
  const e = hasSide(v, 'e'), w = hasSide(v, 'w');
  const x0 = w ? 0 : 6, x1 = e ? T : 45;
  p.line(x0, 4, x1, 4, crafted);
  p.line(x0, 47, x1, 47, crafted);
  if (!w) p.line(6, 4, 6, 47, crafted);
  if (!e) p.line(45, 4, 45, 47, crafted);
  else p.line(T - 1, 4, T - 1, 47, { ...fine, ...crafted });
  // the inner line and the notches across the head
  const ix0 = w ? 0 : 10, ix1 = e ? T : 41;
  p.line(ix0, 43, ix1, 43, thin);
  for (let x = (w ? 4 : 13); x < (e ? T - 2 : 40); x += 7) p.line(x, 4, x, 8, { width: 2, passes: 1, wobble: 0 });
}

// Wall. Quiet on purpose (Timothy, 2026-10-01): one border, only where the wall
// meets floor, and a scroll growing out of the border into each outside corner.
// Nothing inside, so a mass of wall reads as solid black and the room as an outline.
function wall(p, v = '') {
  const n = hasSide(v, 'n'), e = hasSide(v, 'e'), s = hasSide(v, 's'), w = hasSide(v, 'w');
  const i = 3, o = T - 3;
  const xa = w ? 0 : i, xb = e ? T : o;
  const ya = n ? 0 : i, yb = s ? T : o;
  const edge = { wobble: 0.15 };   // at 3 px more wobble reads as lumps, not a hand
  if (!n) p.line(xa, i, xb, i, edge);
  if (!s) p.line(xa, o, xb, o, edge);
  if (!w) p.line(i, ya, i, yb, edge);
  if (!e) p.line(o, ya, o, yb, edge);
  const r = 6;
  if (!n && !e) p.spiral(o - r, i + r, r, { dir: 1, start: -Math.PI / 2 });
  if (!s && !e) p.spiral(o - r, o - r, r, { dir: 1, start: 0 });
  if (!s && !w) p.spiral(i + r, o - r, r, { dir: 1, start: Math.PI / 2 });
  if (!n && !w) p.spiral(i + r, i + r, r, { dir: 1, start: Math.PI });
}

// The inside-corner patch, authored for the north-east corner and rotated into the
// others by the renderer (innerCorners in links.js): a 3 px L joining two borders.
function wallInner(p) {
  const o = T - 3, i = 3, tiny = { wobble: 0, passes: 1 };
  p.line(o, 0, o, i, tiny);
  p.line(o, i, T, i, tiny);
}

// Steps with a banister that ends in a scroll.
function stairs(p, up) {
  const pts = up
    ? [[6, 45], [6, 37], [16, 37], [16, 28], [26, 28], [26, 19], [36, 19], [36, 10], [45, 10]]
    : [[6, 10], [15, 10], [15, 19], [25, 19], [25, 28], [35, 28], [35, 37], [45, 37], [45, 45]];
  p.poly(pts, crafted);
  const rail = up ? [10, 30, 40, 4] : [11, 4, 41, 30];
  p.line(...rail, { width: 2, ...crafted });
  if (up) p.curlAt(10, 30, Math.PI * 0.8, 4, { dir: -1 }); else p.curlAt(41, 30, Math.PI * 0.2, 4, { dir: 1 });
}

// A framed panel with a treble-clef curl and two beamed notes, after his logo.
function noteBox(p) {
  p.box(7, 7, 37, 37, crafted);
  // clef: a stem that rises, loops into a spiral at the bottom
  p.path(t => [15 + Math.sin(t * Math.PI * 2.4) * 3, 11 + t * 22], { width: 2, passes: 1, wobble: 0.1 });
  p.curlAt(15, 33, Math.PI / 2, 4, { dir: 1 });
  note(p, 25, 34, 15); note(p, 35, 31, 15);
  p.fill([[27.5, 19], [38.5, 16], [38.5, 18.5], [27.5, 21.5]]);   // the beam, solid
}

// A drum lying on its side, after his bass drum: the head a heavy tilted oval,
// a triangular truss behind it, two legs with feet. `ang` is the head's line; the
// head faces away from the truss. Only the head reflects in the game (percussion.js),
// so the truss side must always read as the back.
function trussDrum(p, ang, { r = 18, depth = 11, snare = false } = {}) {
  const ux = Math.cos(ang), uy = Math.sin(ang);   // along the head
  const nx = -uy, ny = ux;                         // toward the back (the truss)
  const cx = M - nx * depth * 0.45, cy = M - ny * depth * 0.45;
  const bx = cx + nx * depth, by = cy + ny * depth;
  // the head
  const start = p.r() * 6;
  p.path(t => {
    const a = start + 6.483 * t;
    const x = Math.cos(a) * r, y = Math.sin(a) * r * 0.32;
    return [cx + x * ux - y * uy, cy + x * uy + y * ux];
  }, { width: 3, passes: 1, wobble: 0.2 });
  // the back bar and the truss: zigzag from the head's rim to the bar
  const rim = (k) => [cx + ux * r * k + nx * r * 0.3, cy + uy * r * k + ny * r * 0.3];
  const bar = (k) => [bx + ux * r * k, by + uy * r * k];
  p.line(...bar(-0.85), ...bar(0.85), { width: 2, ...crafted });
  const ks = [-0.75, 0, 0.75];
  for (let i = 0; i < ks.length - 1; i++) {
    p.line(...rim(ks[i]), ...bar(ks[i + 1]), { width: 1.5, ...crafted });
    p.line(...bar(ks[i + 1]), ...rim(ks[i + 1]), { width: 1.5, ...crafted });
  }
  if (snare) {
    const pts = [];
    for (let i = 0; i <= 8; i++) { const k = -0.75 + i * 0.19, o = i % 2 ? 2 : -1; pts.push([bx + ux * r * k + nx * o, by + uy * r * k + ny * o]); }
    p.poly(pts, { width: 1.5, wobble: 0 });
  }
  // legs off the bar, each ending in a bud for a foot
  for (const k of [-0.55, 0.55]) {
    const [x, y] = bar(k);
    p.line(x, y, x + nx * 6, y + ny * 6, { width: 2, ...crafted });
    p.bud(x + nx * 6, y + ny * 6, 1.8);
  }
}

// A cymbal or hat plate on a stand with scroll feet.
function stand(p, top, bottom = 45) {
  p.line(M, top, M, bottom - 3, { width: 2, ...crafted });
  for (const s of [-1, 1]) { p.line(M, bottom - 3, M + s * 8, bottom + 1, { width: 2, ...crafted }); p.bud(M + s * 8, bottom + 1, 1.6); }
}

// ---------------------------------------------------------------------------

export const PLACEHOLDERS = {
  // ---- brass: the living branch -----------------------------------------
  'brass.straight': p => { tubeH(p); grain(p, 6, 45); growth(p, 4, 47); },
  'brass.elbow': p => elbow(p),
  'brass.tee': p => {
    p.line(0, A, T, A);
    p.line(0, B, A, B); p.line(B, B, T, B);
    p.line(A, B, A, T); p.line(B, B, B, T);
    grain(p, 4, 18); grain(p, 33, 47);
    p.twig(37, A - 1.5, -Math.PI / 2 + 0.4, 7);
    p.line(B + 1.5, 40, 38, 43, { width: 2, passes: 1, wobble: 0.2 }); p.clover(41, 45.5);
  },
  // A bridge: the horizontal channel passes over, the vertical ducks under, its
  // walls stopping short with a scroll either side so it reads as "under".
  'brass.cross': p => {
    tubeH(p); grain(p, 6, 16); grain(p, 35, 45);
    p.line(A, 0, A, A - 4); p.line(B, 0, B, A - 4);
    p.line(A, B + 4, A, T); p.line(B, B + 4, B, T);
    p.curlAt(A, A - 4, Math.PI / 2 + 0.6, 3, { dir: 1 });
    p.curlAt(B, B + 4, -Math.PI / 2 + 0.6, 3, { dir: 1 });
  },
  // His mouthpiece: a cup like a trapezoid with a heavy rim bar on the left (where
  // you blow), the stem out of the right edge, fleur curls in the cup.
  'brass.mouthpiece': p => {
    tubeH(p, 26, T); grain(p, 30, 46);
    p.fill([[5, 6], [10, 6], [10, 45], [5, 45]]);          // rim bar, solid
    p.line(10, 8, 26, A, crafted); p.line(10, 43, 26, B, crafted);
    p.spiral(17, M, 5.5, { dir: 1, start: Math.PI });
    p.twig(36, A - 1.5, -Math.PI / 2 - 0.3, 6);
  },
  // His bell: the throat from the left edge, a straight-sided cone to a tall rim,
  // branch lines radiating inside, a twig with a bud above.
  'brass.flare': p => {
    tubeH(p, 0, 20); grain(p, 3, 18);
    p.line(20, A, 42, 5, crafted); p.line(20, B, 42, 46, crafted);
    p.fill([[42, 4], [46, 6], [46, 45], [42, 47]]);         // the rim, solid
    for (const [y0, y1] of [[24, 12], [26, 26], [28, 39]]) p.line(24, y0, 38, y1, thin);
    p.twig(10, A - 1.5, -Math.PI / 2 - 0.4, 7);
  },
  'brass.valve': p => {
    p.arc(0, T, T - A, -Math.PI / 2, 0); p.arc(0, T, T - B, -Math.PI / 2, 0);
    // the piston: a cap with a solid button on a stem, scroll at its side
    p.box(30, 8, 12, 10, crafted);
    p.line(36, 8, 36, 4, { width: 2, ...crafted });
    p.fill([[32, 1], [40, 1], [40, 4], [32, 4]]);
    p.curlAt(42, 13, 0, 3.2, { dir: 1 });
    p.clover(44, 37);
  },
  'brass.mute': p => {
    tubeH(p); grain(p, 34, 46);
    p.fill([[12, 24], [30, 25.5], [12, 27]]);                // the cone, seated, solid
    p.line(12, 23, 12, 28, { width: 2, wobble: 0 });
    growth(p, 4, 47, { down: false });
  },
  'brass.mute.open': p => {
    tubeH(p); grain(p, 6, 45);
    p.fill([[12, 5], [30, 7.5], [12, 10]]);                  // lifted out above
    p.line(21, 10, 21, 18, { width: 1.5, wobble: 0.1 });
    p.curlAt(21, 18, Math.PI / 2, 2.5, { dir: 1 });
  },

  // ---- strings ------------------------------------------------------------
  'string': p => { p.line(0, M, T, M, { width: 3, passes: 1, wobble: 0.35 }); },
  // His peg: a stem down from the string side to a ring with a spiral in it.
  'peg': p => {
    p.line(M, 1, M, 17, { width: 3, ...crafted });
    p.circle(M, 29, 11, { width: 3, wobble: 0.15 });
    p.spiral(M, 29, 7, { dir: 1, start: -Math.PI / 2, width: 2 });
  },

  // ---- percussion ------------------------------------------------------------
  'drum.hat': p => {
    p.ellipse(M, 13, 17, 3.2, crafted); p.ellipse(M, 19, 17, 3.2, crafted);
    p.line(M, 9, M, 11, { width: 2 });
    stand(p, 22);
  },
  'drum.cymbal': p => {
    p.path(t => [7 + t * 37, 17 - Math.sin(t * Math.PI) * 6], crafted);
    p.path(t => [7 + t * 37, 17 + Math.sin(t * Math.PI) * 2], crafted);
    p.fill([[M - 3, 12], [M + 3, 12], [M + 2, 9], [M - 2, 9]]);
    stand(p, 19);
  },
  // A kettle: bowl, rim, three legs with scroll feet; the tuning number is drawn on top.
  'drum.timpani': p => {
    p.ellipse(M, 14, 19, 5, { width: 3, wobble: 0.15 });
    p.path(t => [6.5 + t * 38, 14 + Math.sin(t * Math.PI) * 18], crafted);
    for (const [x0, x1, d] of [[13, 9, -1], [38, 42, 1]]) {
      p.line(x0, 28, x1, 43, { width: 2, ...crafted });
      p.bud(x1, 44, 1.8);
    }
  },
  'pianokey': p => key(p, ''),
  // His mallet: a double-line handle and a solid square head with corner ticks.
  'mallet': p => {
    p.line(4, M - 1.5, 30, M - 1.5, { width: 2, ...crafted });
    p.line(4, M + 1.5, 30, M + 1.5, { width: 2, ...crafted });
    p.fill([[31, 18], [44, 18], [44, 33], [31, 33]]);
    for (const [x, y] of [[30, 17], [45, 17], [30, 34], [45, 34]]) p.bud(x, y, 1.3);
    p.curlAt(4, M + 1.5, Math.PI / 2 + 0.3, 3, { dir: -1 });
  },

  // ---- puzzle --------------------------------------------------------------
  'lock': p => fork(p),
  'lock.lit': p => { fork(p); rays(p, M, 14, 13, 18, 7); },
  'notelock': p => noteBox(p),
  'notelock.lit': p => { noteBox(p); rays(p, M, M, 22, 25, 12); },
  // His door is a ladder: two solid rails, rungs, a knob on the right. Drawn upright,
  // turned 90 by the renderer in an east-west wall. The rails meet the wall borders.
  'door': p => {
    p.fill([[13, 0], [17, 0], [17, T], [13, T]]); p.fill([[34, 0], [38, 0], [38, T], [34, T]]);
    for (let y = 6; y < T; y += 8) p.line(17, y, 34, y, { width: 3, wobble: 0.1 });
    p.bud(40.5, 30, 2.6);
  },
  // Open: the ladder is gone, the rails stay as a frame, a scroll at each end.
  'door.open': p => {
    p.fill([[13, 0], [17, 0], [17, 8], [13, 8]]); p.fill([[34, 0], [38, 0], [38, 8], [34, 8]]);
    p.fill([[13, 43], [17, 43], [17, T], [13, T]]); p.fill([[34, 43], [38, 43], [38, T], [34, T]]);
  },
  'keyshift.up': p => stairs(p, true),
  'keyshift.down': p => stairs(p, false),
  // The way out: an arch, crafted and symmetric, a note inside, scroll feet.
  'exit': p => {
    p.line(11, 44, 11, 20, crafted); p.line(40, 44, 40, 20, crafted);
    p.arc(M, 20, 14.5, Math.PI, 2 * Math.PI, crafted);
    p.line(5, 45, 46, 45, { width: 3, ...crafted });
    note(p, 23, 36, 13); p.curlAt(26, 23, -Math.PI / 2, 3, { dir: 1 });
  },
  // Sour: his sound wave, broken: flat in, jagged, splinters off the peaks.
  'dissonance': p => {
    p.poly([[3, 27], [11, 27], [15, 13], [20, 38], [25, 9], [30, 41], [35, 16], [40, 27], [48, 27]], { width: 3, wobble: 0.3 });
    p.line(15, 13, 12, 7, thin); p.line(25, 9, 28, 3, thin); p.line(30, 41, 27, 47, thin);
  },
  // A blank instrument: a crafted box with a triangle pointing in from each face
  // (every face is authorable), after the four triangles in his block.
  'strumentino': p => {
    p.box(7, 7, 37, 37, crafted);
    p.fill([[M - 4, 10], [M + 4, 10], [M, 15]]); p.fill([[M - 4, 41], [M + 4, 41], [M, 36]]);
    p.fill([[10, M - 4], [10, M + 4], [15, M]]); p.fill([[41, M - 4], [41, M + 4], [36, M]]);
    p.spiral(M, M, 6, { dir: 1, width: 2 });
  },

  // ---- not tiles -------------------------------------------------------------
  // His wave: flat lead-in, sharp peaks, flat lead-out.
  'wave': p => {
    p.poly([[3, 26], [12, 26], [15, 12], [20, 40], [25, 18], [30, 33], [34, 20], [38, 26], [48, 26]], { width: 3, wobble: 0.15 });
  },
};

// Linked families: generated, one per variant.
const LINKED = { wall, pianokey: key };
for (const [type, fn] of Object.entries(LINKED)) {
  PLACEHOLDERS[type] = p => fn(p, '');
  for (const v of linkVariants(type)) PLACEHOLDERS[`${type}.${v}`] = p => fn(p, v);
}
PLACEHOLDERS['wall.inner'] = wallInner;

// The slide: a U of tubing hanging under the run, pulled further out each step,
// its crook ending in a scroll.
for (let ext = 0; ext <= 3; ext++) {
  PLACEHOLDERS[`brass.slide.${ext}`] = p => {
    tubeH(p); grain(p, 18, 33);
    const y = B + 6 + ext * 4;
    p.line(13, B + 1.5, 13, y, { width: 2, ...crafted }); p.line(38, B + 1.5, 38, y, { width: 2, ...crafted });
    p.path(t => [13 + t * 25, y + Math.sin(t * Math.PI) * 3], { width: 2, ...crafted });
    p.twig(30, A - 1.5, -Math.PI / 2 + 0.4, 6);
  };
}

// Mirror drums. The plain key has the head slanted "/" facing up-left (rot 0, as his
// bass drum is drawn, legs lower right); `.flat` has it level "—" facing up (rot 45,
// then turned in 90° steps). Sizes differ by drum: bass big, tom small, snare wired.
const SLANT = -Math.PI / 4, LEVEL = 0;
Object.assign(PLACEHOLDERS, {
  'drum.bass':       p => trussDrum(p, SLANT, { r: 19, depth: 14 }),
  'drum.bass.flat':  p => trussDrum(p, LEVEL, { r: 19, depth: 14 }),
  'drum.tom':        p => trussDrum(p, SLANT, { r: 14, depth: 12 }),
  'drum.tom.flat':   p => trussDrum(p, LEVEL, { r: 14, depth: 12 }),
  'drum.snare':      p => trussDrum(p, SLANT, { r: 17, depth: 11, snare: true }),
  'drum.snare.flat': p => trussDrum(p, LEVEL, { r: 17, depth: 11, snare: true }),
});

// ---------------------------------------------------------------------------
// Proposals: art for things the game does not have yet. Nothing asks for these
// keys, so they never appear in a room; they exist to be argued about in the asset
// review, next to the real thing.
export const PROPOSALS = {
  // Woodwind has no instrument. A reed: blow it like a mouthpiece that is its own
  // horn. Living register, like the brass.
  'woodwind.reed': p => {
    p.line(4, A, 32, A); p.line(4, B, 32, B); grain(p, 7, 30);
    p.fill([[32, A - 1.5], [46, 23.5], [46, 27.5], [32, B + 1.5]]);
    p.twig(14, A - 1.5, -Math.PI / 2 - 0.4, 7);
    p.line(22, B + 1.5, 25, B + 7, { width: 2, passes: 1 }); p.clover(26.5, B + 10.5);
  },
  // A flute run: holes along it; each covered hole (a block on it) lowers the note.
  'woodwind.flute': p => {
    tubeH(p);
    for (const x of [11, 20, 29, 38]) p.circle(x, M, 2.2, { width: 1.5, wobble: 0 });
    p.twig(44, A - 1.5, -Math.PI / 2 + 0.3, 6);
  },
  // A lock that wants an ABSOLUTE pitch, so the stairs matter. Marked by a sharp.
  'notelock.absolute': p => {
    noteBox(p);
    p.line(37, 9, 35, 21, { width: 1.5 }); p.line(41, 9, 39, 21, { width: 1.5 });
    p.line(33, 13, 43, 12, { width: 1.5 }); p.line(33, 17, 43, 16, { width: 1.5 });
  },
  // The Composer's Key itself, in line work: the note-key from his website.
  'key.pickup': p => {
    p.ellipse(18, 37, 7.5, 5.2, { width: 3 });
    p.line(25, 35, 25, 7, { width: 3 });
    p.fill([[25, 8], [35, 8], [35, 11], [25, 11]]);
    p.fill([[25, 14], [32, 14], [32, 17], [25, 17]]);
    p.fill([[25, 20], [36, 20], [36, 23], [25, 23]]);
    p.curlAt(12, 39, Math.PI * 0.9, 3, { dir: 1 });
  },
  // A floor tile with the staff showing through.
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
