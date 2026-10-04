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

import { TILE, STROKE, spanOf } from './protocol.js';
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

// A hollow note head, tilted like the solid one.
function noteRing(p, x, y, rx, ry, rot = -0.4) {
  const a0 = p.r() * 6.283;
  p.path(t => {
    const a = a0 + 6.483 * t, ex = Math.cos(a) * rx, ey = Math.sin(a) * ry;
    return [x + ex * Math.cos(rot) - ey * Math.sin(rot), y + ex * Math.sin(rot) + ey * Math.cos(rot)];
  }, { width: 2, wobble: 0 });
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

// Stairs, side on: four 3 px steps on a floor line, and over them the banister,
// drawn as an arrow along the climb (a scroll at its foot, a solid head at the
// end it points to). Redrawn 2026-10-04 for play size: the old thin rail and its
// small curl vanished at ~30 px, and a staircase alone does not say up or down
// (one rising to the right is one falling to the left). Up rises to the right
// and the arrow points up it; down is its mirror and the arrow points down it.
function stairs(p, up) {
  const X = (x) => (up ? x : T - x);
  const pts = [[5, 45], [5, 37], [16, 37], [16, 28], [27, 28], [27, 19], [38, 19], [38, 10], [46, 10], [46, 45]];
  p.poly(pts.map(([x, y]) => [X(x), y]), crafted);
  p.line(X(5), 45, X(46), 45, crafted);
  // the banister arrow, parallel to the climb, above the steps
  const [x0, y0, x1, y1] = [9, 25, 27, 7];
  const ang = Math.atan2(y1 - y0, X(x1) - X(x0));
  if (up) {
    p.line(X(x0), y0, X(x1) - 2, y1 + 2, crafted);
    arrowHead(p, X(x1), y1, ang);
    p.curlAt(X(x0), y0, ang + Math.PI, 4.5, { dir: 1, width: 2 });
  } else {
    p.line(X(x1), y1, X(x0) - 2, y0 - 2, crafted);
    arrowHead(p, X(x0), y0, ang + Math.PI);
    p.curlAt(X(x1), y1, ang, 4.5, { dir: -1, width: 2 });
  }
}

// A solid arrowhead with its point at (x, y), pointing along `ang`.
function arrowHead(p, x, y, ang, len = 9, half = 5.5) {
  const bx = x - Math.cos(ang) * len, by = y - Math.sin(ang) * len;
  const nx = -Math.sin(ang) * half, ny = Math.cos(ang) * half;
  p.fill([[x, y], [bx + nx, by + ny], [bx - nx, by - ny]]);
}

// A framed panel with two beamed notes, after his logo. Redrawn 2026-10-04 for
// play size: the clef curl and 2 px stems were mush at ~30 px, so the clef is
// gone and the two notes fill the frame, heads solid, stems 3 px, a heavy beam.
// The lock's progress pips are drawn over row ~37 (NoteLock.overlay) and its key
// letter in the top-right corner, so the notes keep clear of both.
function noteBox(p) {
  p.box(7, 7, 37, 37, crafted);
  fillDot(p, 18.5, 30, 5.6, 4.2); fillDot(p, 32.5, 27, 5.6, 4.2);
  p.line(23, 29, 23, 14, { width: 3, wobble: 0 });
  p.line(37, 26, 37, 11, { width: 3, wobble: 0 });
  p.fill([[21.5, 12], [38.5, 9], [38.5, 14], [21.5, 17]]);         // the beam, solid
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

// The tom and snare, redrawn 2026-10-04 to read at ~30 px (Timothy: sprites too
// small to read on his phone). Same anatomy as his bass drum and trussDrum, scaled
// up and made bold: a big heavy head (the mirror, the part that matters), a truss
// of 3 px struts to a 3 px back bar (so the back reads as the back), and then one
// mark that says which drum it is: legs with bud feet for the tom, a band of snare
// wire behind the bar for the snare.
function kitDrum(p, ang, { r, ry = r * 0.36, depth, legs = false, snare = false }) {
  const ux = Math.cos(ang), uy = Math.sin(ang);   // along the head
  const nx = -uy, ny = ux;                         // toward the back
  const cx = M - nx * depth * 0.5, cy = M - ny * depth * 0.5;
  const bx = cx + nx * depth, by = cy + ny * depth;
  const start = p.r() * 6;
  p.path(t => {
    const a = start + 6.483 * t;
    const x = Math.cos(a) * r, y = Math.sin(a) * ry;
    return [cx + x * ux - y * uy, cy + x * uy + y * ux];
  }, { width: 3, passes: 1, wobble: 0.2 });
  // a point on the back of the head's rim, k from -1 to 1 along it
  const rim = (k) => { const h = ry * Math.sqrt(Math.max(0, 1 - k * k)); return [cx + ux * r * k + nx * h, cy + uy * r * k + ny * h]; };
  const bar = (k, o = 0) => [bx + ux * r * k + nx * o, by + uy * r * k + ny * o];
  p.line(...rim(-0.85), ...bar(-0.7), { width: 3, ...crafted });
  p.line(...rim(0.85), ...bar(0.7), { width: 3, ...crafted });
  if (snare) {
    // the back is the wire: a zigzag where the tom has its bar
    const pts = [];
    for (let i = 0; i <= 7; i++) { const k = -0.7 + i * 0.2; pts.push(bar(Math.min(k, 0.7), i % 2 ? 3.5 : 0)); }
    p.poly(pts, { width: 3, wobble: 0 });
    return;
  }
  p.line(...bar(-0.7), ...bar(0.7), { width: 3, ...crafted });
  p.line(...rim(-0.25), ...bar(0.7), { width: 2, ...crafted });     // one brace across the truss
  if (legs) for (const k of [-0.5, 0.5]) {
    const [x, y] = bar(k), L = 7;
    p.line(x, y, x + nx * L, y + ny * L, { width: 3, ...crafted });
    p.bud(x + nx * L, y + ny * L, 2.4);
  }
}

// A cymbal or hat plate on a stand with scroll feet.
function stand(p, top, bottom = 45) {
  p.line(M, top, M, bottom - 3, { width: 3, ...crafted });
  for (const s of [-1, 1]) { p.line(M, bottom - 3, M + s * 9, bottom + 1, { width: 3, ...crafted }); p.bud(M + s * 9, bottom + 1, 2.2); }
}

// A cymbal plate seen edge-on: a flat rim line `half` either side of the centre on
// row y, and a dome rising off it `rise` px, upward (dir -1) or downward (dir 1).
// `tilt` turns it about its centre (radians, clockwise on screen).
function plate(p, half, y, rise, dir, tilt = 0) {
  const R = ([x, yy]) => [M + (x - M) * Math.cos(tilt) - (yy - y) * Math.sin(tilt), y + (x - M) * Math.sin(tilt) + (yy - y) * Math.cos(tilt)];
  if (tilt) p.path(t => R([M - half + t * 2 * half, y]), { width: 3, ...crafted });
  else p.line(M - half, y, M + half, y, { width: 3, ...crafted });
  p.path(t => R([M - half + 2 + t * (2 * half - 4), y + dir * Math.sin(t * Math.PI) ** 0.7 * rise]), { width: 3, wobble: 0.1 });
}

// A straight mute lying along the tube, wide end (the cork flange) at x0, centred
// on row cy, the flange `h` either side of it; the cone runs 22 px to a knob.
function mute(p, x0, cy, h) {
  p.fill([[x0, cy - h], [x0 + 4, cy - h], [x0 + 4, cy + h], [x0, cy + h]]);       // the flange
  p.fill([[x0 + 4, cy - h + 2.5], [x0 + 21, cy - 2], [x0 + 21, cy + 2], [x0 + 4, cy + h - 2.5]]);
  fillDot(p, x0 + 22, cy, 2.6, 2.6, 0);                                             // the knob
}

// ---------------------------------------------------------------------------
// Woodwind: the made bore
//
// A flute is crafted, not grown: straight walls, symmetric, no grain, no twigs.
// Its bore is narrower than a brass tube's on purpose (walls on rows 22-24 and
// 27-29, CONNECTOR.flute, against brass 20-22 and 28-30) so a flute never reads
// as a horn. Drawn at rot 0: the bore runs left -> right, the HEAD (where you
// blow) at the left end, the FOOT (open) at the right; a hole opens UP out of the
// top wall, which is where the wave leaves it (FlutePiece.holeDir).
const FA = 23.5, FB = 28.5;     // flute wall centres, 3 px: rows 22-24 and 27-29
const HY = 16.5, HR = 4.5;      // the hole's ring, sitting on the top wall
const HG = 0.62;                // half-angle of the ring's opening into the bore

function boreH(p, x0 = 0, x1 = T) { p.line(x0, FA, x1, FA, crafted); p.line(x0, FB, x1, FB, crafted); }

// A band round the body: one short stroke standing proud of both walls.
function band(p, x) {
  p.line(x, FA - 3, x, FB + 3, { width: 2, ...crafted });
}

// The tone hole: a ring standing on the top wall, open at the bottom into the
// bore (an omega), the wall cut away under it. Open means the wave can leave.
function toneHole(p) {
  const lx = M - Math.sin(HG) * HR, rx = M + Math.sin(HG) * HR, ly = HY + Math.cos(HG) * HR;
  p.line(0, FA, lx - 1.5, FA, crafted); p.line(rx + 1.5, FA, T, FA, crafted);
  p.line(lx - 1.5, FA, lx, ly, { wobble: 0 }); p.line(rx + 1.5, FA, rx, ly, { wobble: 0 });
  p.arc(M, HY, HR, Math.PI / 2 + HG, Math.PI * 2.5 - HG, { wobble: 0.1 });
  p.line(0, FB, T, FB, crafted);
}

// ---------------------------------------------------------------------------
// The score gate

// Clear back to the floor: whatever `fn` draws is erased instead of inked (a
// keyhole in a solid lock, the embouchure in a solid lip plate).
function erase(p, fn) {
  const c = p.c;
  c.save(); c.globalCompositeOperation = 'destination-out'; fn(); c.restore();
}

// A staff in a frame that is music's own: a bracket with hooked ends on the left,
// the closing barline on the right (the gate is the end of the piece). A padlock
// sits on the staff, the lines broken round it. The game writes "n/N" across the
// bottom of this tile (ScoreLock.overlay, rows ~40-50), so the art stops at row 38.
// Lit: the shackle lifts out of the lock and it shines, as lock.lit does.
function scoreGate(p, lit) {
  // the staff runs from the bracket to the barline, broken round the lock
  for (const y of [14, 19, 24, 29, 34]) {
    p.line(8, y, 18, y, { width: 2, wobble: 0 });
    p.line(33, y, 42, y, { width: 2, wobble: 0 });
  }
  p.line(7.5, 12, 7.5, 36, crafted);
  p.stalk(7.5, 12, -Math.PI / 3, 1.5, 4.2, { dir: 1, bend: 0.1, turns: 0.7 });
  p.stalk(7.5, 36, Math.PI / 3, 1.5, 4.2, { dir: -1, bend: -0.1, turns: 0.7 });
  p.line(43, 13, 43, 35, { width: 2, ...crafted });
  // the padlock: a solid body with the keyhole cut out, a shackle over it
  p.fill([[20, 21], [31, 21], [31, 29], [20, 29]]);
  erase(p, () => { fillDot(p, M, 24, 1.7, 1.7, 0); p.fill([[M - 1, 24], [M + 1, 24], [M + 1, 27], [M - 1, 27]]); });
  const lift = lit ? 3.5 : 0;
  p.line(21.5, 21 - lift, 21.5, 16 - lift, { wobble: 0 });
  p.line(29.5, 21, 29.5, 16 - lift, { wobble: 0 });
  p.arc(M, 16 - lift, 4, Math.PI, Math.PI * 2, { wobble: 0.05 });
  if (lit) {
    for (let k = -2; k <= 2; k++) {
      const a = -Math.PI / 2 + k * 0.48;
      p.line(M + Math.cos(a) * 9.5, 15 + Math.sin(a) * 9.5, M + Math.cos(a) * 12.5, 15 + Math.sin(a) * 12.5, fine);
    }
  }
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
  // An elbow with a trumpet piston standing on its knee: the casing sits on the
  // bend's outer wall, a stem rises out of it to a solid finger button. Drawn big
  // (2026-10-04) so the button reads as "press me" at ~30 px; the old 12 x 10 cap
  // was a speck on his phone. The piston turns with the valve, so it also shows
  // which way the bend faces.
  'brass.valve': p => {
    p.arc(0, T, T - A, -Math.PI / 2, 0); p.arc(0, T, T - B, -Math.PI / 2, 0);
    p.box(27.5, 17.5, 15, 15, crafted);                               // the casing
    p.fill([[26, 15.5], [44, 15.5], [44, 19], [26, 19]]);             // its top cap, solid
    p.line(35.5, 15.5, 35.5, 8, { width: 3, ...crafted });            // the stem
    p.fill([[29, 4], [42, 4], [41, 8.5], [30, 8.5]]);                 // the finger button
    p.line(27.5, 32.5, 22.5, 28.5, { width: 3, wobble: 0 });          // seated on the knee
  },
  // A straight mute: a solid cone with a heavy cork flange, tip to the right.
  // Seated, it plugs the bore and stands proud of both walls, so a muted horn
  // reads as stopped at ~30 px; pulled, it hangs above the clear tube on a cord.
  // (Redrawn 2026-10-04: the old one was a sliver inside the bore.)
  'brass.mute': p => {
    tubeH(p); grain(p, 38, 47);
    mute(p, 11, M, 9.5);
  },
  'brass.mute.open': p => {
    tubeH(p); grain(p, 6, 45);
    mute(p, 9, 9.5, 7);
    p.path(t => [33 + t * 5, 9.5 + t * 10 + Math.sin(t * Math.PI) * -3], { width: 2, wobble: 0.1 });   // the cord
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
  // Redrawn 2026-10-04 for play size. The hi-hat is two plates facing each other,
  // the top one domed up and the bottom one domed down, a clear gap between them
  // and the rod through both; the cymbal is ONE wide flat plate with a solid bell.
  // Before, both were thin ellipses that merged into a mushroom at ~30 px.
  'drum.hat': p => {
    plate(p, 15, 14.5, 5, -1);
    plate(p, 15, 20.5, 5, 1);
    p.line(M, 5, M, 13, { width: 3, ...crafted });
    p.bud(M, 5, 2.2);
    stand(p, 22);
  },
  'drum.cymbal': p => {
    plate(p, 20, 15, 5, -1, -0.2);
    fillDot(p, M + 1, 9.5, 4.2, 3, -0.2);               // the bell, solid
    stand(p, 16);
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
  // Lit: it shines, short rays all round the frame (and it is drawn at full ink;
  // the unlit lock is dimmed by STATE_INK).
  'notelock.lit': p => {
    noteBox(p);
    for (let i = 0; i < 4; i++) {
      for (const da of [-0.32, 0.32]) {
        const a = i * Math.PI / 2 + da, r0 = 20.5 / Math.cos(da), r1 = r0 + 4;
        p.line(M + Math.cos(a) * r0, M + Math.sin(a) * r0, M + Math.cos(a) * r1, M + Math.sin(a) * r1, { width: 2.5, wobble: 0 });
      }
    }
  },
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

  // ---- woodwind: made, not grown ----------------------------------------------
  // The head (rot 0: the left end; joins only its right edge): a solid crown
  // closing the bore, a scroll off each end of it; the lip plate on top where you
  // blow, solid with the embouchure cut in it (the wall is whole under it: nothing
  // leaves here, unlike a hole); a band at the joint.
  'flute.head': p => {
    boreH(p, 13, T);
    p.fill([[10, FA - 3.5], [14, FA - 3.5], [14, FB + 3.5], [10, FB + 3.5]]);
    p.stalk(12, FA - 3.5, -Math.PI / 2 - 0.2, 2, 4.8, { dir: -1, bend: 0.1 });
    p.stalk(12, FB + 3.5, Math.PI / 2 + 0.2, 2, 4.8, { dir: 1, bend: -0.1 });
    fillDot(p, 28, FA - 4.6, 7.5, 3.4, 0);
    erase(p, () => fillDot(p, 28, FA - 5, 3.2, 1.4, 0));
    band(p, 43);
  },
  // An open hole: the ring stands on the top wall, open into the bore.
  'flute.hole': p => toneHole(p),
  // Covered: the same ring with its pad seated in it, solid, and the key's arm.
  'flute.covered': p => {
    toneHole(p);
    fillDot(p, M, HY, HR + 1.5, HR + 1.5, 0);
    p.line(M - 5, FA, M + 5, FA, { wobble: 0 });                 // sealed
    p.line(M + HR + 1, HY, 41, HY + 2, { width: 2, ...crafted });
    p.bud(41.5, HY + 2, 2);
  },
  // The foot (joins only its left edge): a band, then the bore left open, its lips
  // rolling back over into a scroll each side.
  'flute.foot': p => {
    boreH(p, 0, 37);
    band(p, 12);
    p.stalk(37, FA, -Math.PI / 4, 2.5, 4.8, { dir: -1, bend: 0.1 });
    p.stalk(37, FB, Math.PI / 4, 2.5, 4.8, { dir: 1, bend: -0.1 });
  },
  // The reed (rot 0: the reed at the left, the bell opening right, where its waves
  // leave). A reed of cane WIDENING to a flat tip (so it never reads as an
  // arrowhead pointing the wrong way), bound with thread into a slim
  // body like the flute's, keys on top, and a modest bell with an oval mouth: a
  // woodwind's bell, smaller than a horn's flare.
  'reed': p => {
    p.fill([[3, 22.5], [10, 24], [10, 27], [3, 28.5]]);                   // the cane
    p.fill([[10, 21.5], [14, 21], [14, 30], [10, 29.5]]);               // thread
    boreH(p, 14, 35);
    band(p, 17.5);
    for (const x of [23, 30]) fillDot(p, x, FA - 3, 2, 1.6, 0);          // keys
    for (const s of [-1, 1]) {
      const y0 = s < 0 ? FA : FB;
      p.path(t => [35 + t * 9, y0 + s * 9 * t ** 2], { width: 3, wobble: 0.08 });
    }
    p.ellipse(44, M + 0.5, 2.5, 11, { width: 3, wobble: 0.05 });
  },

  // ---- things to find ----------------------------------------------------------
  // An Overtone: a note, and above it a smaller, hollow one: its echo, the higher
  // pitch it sounds over its fundamental. The big note's flag ends in a scroll.
  'pickup.overtone': p => {
    fillDot(p, 17.5, 40, 7, 5);
    p.line(23.5, 39, 23.5, 16, crafted);
    p.curlAt(23.5, 16, -Math.PI / 2 + 0.5, 4.5, { dir: 1, width: 2 });
    noteRing(p, 34, 26.5, 5, 3.5);
    p.line(38.5, 25.5, 38.5, 9, crafted);
  },
  // The Burin, cutting. Its handle is a wooden knob (solid, a shine of grain in it)
  // cut flat underneath along the blade, then a solid ferrule, the steel drawn
  // double, and the tip cut at an angle underneath, sitting in the groove it has
  // cut, with the curl of metal it lifts rolling up ahead of it. Drawn in use
  // because, alone, a knob on a stick reads as a match, a drumstick or a magnifier.
  'pickup.burin': p => {
    const ang = 0.8, u = [Math.cos(ang), Math.sin(ang)], o = [15, 16], L = 33, R = 8.5;
    const P = (lx, ly) => [o[0] + lx * u[0] - ly * u[1], o[1] + lx * u[1] + ly * u[0]];
    const cx = 2, cy = -1.5, flat = 3.2, a0 = Math.asin((flat - cy) / R);
    const s0 = Math.PI - a0, s1 = Math.PI * 2 + a0, knob = [];
    for (let i = 0; i <= 30; i++) { const a = s1 - (i / 30) * (s1 - s0); knob.push(P(cx + Math.cos(a) * R, cy + Math.sin(a) * R)); }
    p.fill(knob);
    erase(p, () => p.path(t => { const a = Math.PI * 1.15 + t * 0.85; return P(cx + Math.cos(a) * R * 0.55, cy + Math.sin(a) * R * 0.55); }, { width: 1.6, wobble: 0 }));
    p.fill([P(cx + R - 1.5, -3.4), P(12, -3), P(12, 3), P(cx + R - 1.5, 3.4)]);   // ferrule
    p.line(...P(12, -1), ...P(L - 6, -1), { width: 2, ...crafted });
    p.line(...P(12, 2), ...P(L - 6, 2), { width: 2, ...crafted });
    p.fill([P(L - 6, -2.4), P(L, 2.6), P(L - 6, 3)]);                          // the tip
    const [tx, ty] = P(L, 2.6);
    p.line(tx - 16, ty, tx + 1, ty, { width: 2, wobble: 0.05 });               // the groove
    p.stalk(tx + 0.5, ty - 0.5, -0.15, 3.5, 4.8, { dir: -1, bend: 0.1, width: 2 });
  },

  // ---- dissonance ------------------------------------------------------------------
  // A dissonant: a sour note that walks. The note head is its body, its outline a
  // little jagged; mismatched eyes and a sour zigzag mouth; the stem breaks like the
  // dissonance wave and its flag splinters; two legs with bud feet, mid-stride.
  'dissonant': p => {
    p.path(t => {
      const a = t * 6.483, rr = 1 + (Math.floor(t * 16) % 2 ? 0.09 : -0.04);
      const x = Math.cos(a) * 12 * rr, y = Math.sin(a) * 9 * rr, k = -0.3;
      return [21 + x * Math.cos(k) - y * Math.sin(k), 31 + x * Math.sin(k) + y * Math.cos(k)];
    }, { width: 3, wobble: 0.25 });
    fillDot(p, 16.5, 30.5, 1.8, 2.3, 0); fillDot(p, 24.5, 28.5, 2.5, 3, 0);
    p.poly([[15.5, 36], [18, 34.5], [20.5, 36.5], [23, 34.5], [25.5, 36]], { width: 2, wobble: 0 });
    p.poly([[31, 25.5], [34, 20], [30.5, 15], [34, 10], [32.5, 5]], { width: 3, wobble: 0.1 });
    p.poly([[32.5, 5], [40, 9], [37, 12], [43, 16]], { width: 2, wobble: 0.1 });
    p.line(16, 39.5, 13, 44.5, { width: 2, wobble: 0.1 }); p.bud(13, 45, 2);
    p.line(25, 39, 29, 43.5, { width: 2, wobble: 0.1 }); p.bud(29.5, 44, 2);
  },

  // ---- the score gate ------------------------------------------------------------
  'scorelock': p => scoreGate(p, false),
  'scorelock.lit': p => scoreGate(p, true),

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

// The slide, redrawn 2026-10-04 for play size (Timothy: "the slide ... don't read
// well as they are so small"; a tile is ~30 px on his phone). A trombone slide
// lies ALONGSIDE its horn, so it is drawn that way: a hairpin of two tubes under
// the run, hung from the run by a brace at the left, its crook on the right. The
// outer slide (the crook and its sleeves, drawn heavier) is the part that moves:
// each step pulls it 8 px further right (about 5 px on his phone, against 2 for
// the old U), and the thinner inner tubes show behind it. Closed (0) it is a
// short loop; out 3 it runs the width of the tile.
const SLIDE_Y0 = 37.5, SLIDE_Y1 = 45.5;   // the hairpin's two tubes, 3 px, rows 36-38 and 44-46
function slide(p, ext) {
  tubeH(p); grain(p, 22, 44);
  p.twig(33, A - 1.5, -Math.PI / 2 + 0.4, 7);
  const xc = 18 + ext * 8;                // the crook's centre
  const xo = xc - 9;                      // where the outer slide starts
  // the brace: down from the run's bottom wall, holding both tubes
  p.line(8.5, B + 1, 8.5, SLIDE_Y1 + 1.5, crafted);
  // the inner tubes, fixed, showing more the further it is pulled
  if (xo > 9) for (const y of [SLIDE_Y0, SLIDE_Y1]) p.line(8.5, y, xo, y, crafted);
  // the outer slide: two sleeves, solid, and the crook joining them
  for (const y of [SLIDE_Y0, SLIDE_Y1]) p.fill([[xo, y - 2], [xc, y - 2], [xc, y + 2], [xo, y + 2]]);
  p.arc(xc, (SLIDE_Y0 + SLIDE_Y1) / 2, (SLIDE_Y1 - SLIDE_Y0) / 2, -Math.PI / 2, Math.PI / 2, { width: 4, wobble: 0.05 });
}
for (let ext = 0; ext <= 3; ext++) PLACEHOLDERS[`brass.slide.${ext}`] = p => slide(p, ext);

// Mirror drums. The plain key has the head slanted "/" facing up-left (rot 0, as his
// bass drum is drawn, legs lower right); `.flat` has it level "—" facing up (rot 45,
// then turned in 90° steps). Sizes differ by drum: bass big, tom small, snare wired.
const SLANT = -Math.PI / 4, LEVEL = 0;
Object.assign(PLACEHOLDERS, {
  'drum.bass':       p => trussDrum(p, SLANT, { r: 19, depth: 14 }),
  'drum.bass.flat':  p => trussDrum(p, LEVEL, { r: 19, depth: 14 }),
  'drum.tom':        p => kitDrum(p, SLANT, { r: 16, depth: 12, legs: true }),
  'drum.tom.flat':   p => kitDrum(p, LEVEL, { r: 16, depth: 12, legs: true }),
  'drum.snare':      p => kitDrum(p, SLANT, { r: 19, depth: 10, snare: true }),
  'drum.snare.flat': p => kitDrum(p, LEVEL, { r: 19, depth: 10, snare: true }),
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

// Render one placeholder to a fresh canvas at the native 51 px (or 51 x span for a
// piece bigger than a tile: the boss draws in a 153 px square).
export function drawPlaceholder(key) {
  const fn = PLACEHOLDERS[key];
  if (!fn) return null;
  const cv = document.createElement('canvas');
  cv.width = cv.height = T * spanOf(key);
  const c = cv.getContext('2d');
  fn(new Pen(c, key), key.split('.').slice(1).join('.'));
  return crisp(cv);
}
