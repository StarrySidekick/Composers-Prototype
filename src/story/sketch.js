// Rough drawings for the story: cutscene frames, title cards, portraits, bosses,
// items held overhead, the credits. Storyboard sketches in code, in Timothy's line
// language (.claude/skills/composers-key-art/references/style-card.md) scaled up
// from a 51 px tile to a whole stage: white line-work on black, structure heavy and
// ornament fine, every flourish an open spiral growing off the end of a stroke, curl
// trees, vines. No colour, no grey fills; a dim grey ink only for a layer behind.
//
// The contract (src/story/scenes.js is the caller):
//
//   drawSketch(c, key, w, h, o)  draws one sketch into the box (0,0)-(w,h). The caller
//     has translated there and filled the stage black; nothing here fills a
//     background. o.seed picks one of the hands the caller boils between: the same
//     (key, seed) draws the same lines every call, because the pen is seeded from
//     `${key}:${seed}`. The LAYOUT (where the stars are, how a tree branches) comes
//     from a second generator seeded by the key alone, so boiling only wobbles the
//     lines and never moves anything. o.t is time in beats, for the few that move.
//   isAnimated(key)  true when the drawing depends on o.t (the caller redraws those
//     every frame instead of caching them, so they stay under ~250 strokes).
//
// Inside, every sketch draws in DESIGN UNITS: the context is scaled so the shorter
// side of the box is 400 units, and a sketch gets (p, W, H, o) with W, H the box in
// those units. Line weights are in units too (3 main, 2 ornament: 3u and 2u px, as
// the brief asks), never under 1.5 real px (the pen clamps). Wobble is in units, so
// a hand-drawn line bends the same at any size.

import { Pen, rng } from '../art/pen.js';

const DIM = '#7d7d7d';
const TAU = Math.PI * 2, PI = Math.PI;
const MAIN = 3, FINE = 2, HAIR = 1.5;
const { sin, cos, atan2, hypot, min, max, abs, floor } = Math;
const lerp = (a, b, t) => a + (b - a) * t;
const frac = (x) => x - floor(x);
const ease = (t) => t * t * (3 - 2 * t);

// ---------------------------------------------------------------------------
// The pen, at stage size

class SketchPen extends Pen {
  constructor(c, seed, s) {
    super(c, seed, { width: MAIN, wobble: 1.5 });
    this.s = s;          // real px per design unit
    this.k = 1;          // extra scale from push(), so widths stay in design units
    this._ks = [];
  }

  // Every stroke funnels through here: widths and wobble are design units whatever
  // transform a figure is drawn under, and never thinner than 1.5 real px.
  path(fn, o = {}) {
    const k = abs(this.k);
    const wd = max(o.width ?? this.width, 1.5 / this.s);
    let steps = o.steps;
    if (!steps) {
      let len = 0;
      for (let i = 1, [px, py] = fn(0); i <= 40; i++) { const [x, y] = fn(i / 40); len += hypot(x - px, y - py); px = x; py = y; }
      steps = max(6, min(220, Math.ceil(len * k / 3.5)));
    }
    return super.path(fn, { ...o, steps, width: wd / k, wobble: (o.wobble ?? this.wobble) / k });
  }

  spiral(cx, cy, r, o = {}) { return super.spiral(cx, cy, r, { width: FINE, wobble: 0.3, ...o }); }

  push(x, y, rot = 0, sc = 1, flip = false) {
    const c = this.c;
    c.save(); c.translate(x, y); if (rot) c.rotate(rot); c.scale(flip ? -sc : sc, sc);
    this._ks.push(this.k); this.k *= sc;
  }
  pop() { this.c.restore(); this.k = this._ks.pop(); }

  dim(fn) { const ink = this.ink; this.ink = DIM; try { fn(); } finally { this.ink = ink; } }

  // A smooth curve through points (Catmull-Rom), one stroke.
  curve(pts, o = {}) { return this.path(catmull(pts, !!o.closed), o); }

  // A tube: two walls either side of a smooth centreline. `w` is its width, or a
  // function of t (0..1 along it) for a bore that flares.
  tube(pts, w, o = {}) {
    const C = catmull(pts, false), W = typeof w === 'function' ? w : () => w;
    const side = (s) => (t) => {
      const [x, y] = C(t), [x2, y2] = C(min(1, t + 0.003)), [x1, y1] = C(max(0, t - 0.003));
      let nx = -(y2 - y1), ny = x2 - x1; const l = hypot(nx, ny) || 1;
      return [x + nx / l * s * W(t) / 2, y + ny / l * s * W(t) / 2];
    };
    this.path(side(1), o); this.path(side(-1), o);
    return this;
  }

  // A straight-edged polyline as ONE stroke (pen.poly is a stroke per edge).
  pline(pts, o = {}) {
    const P = o.closed ? [...pts, pts[0]] : pts;
    const L = [0];
    for (let i = 1; i < P.length; i++) L.push(L[i - 1] + hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    const tot = L[L.length - 1] || 1;
    return this.path(t => {
      const d = t * tot;
      let i = 1; while (i < L.length - 1 && L[i] < d) i++;
      const u = (d - L[i - 1]) / ((L[i] - L[i - 1]) || 1);
      return [lerp(P[i - 1][0], P[i][0], u), lerp(P[i - 1][1], P[i][1], u)];
    }, { wobble: 0.6, ...o });
  }

  // A stalk that bends and winds into an open spiral, as ONE stroke: the unit of
  // his curl trees (pen.stalk, without the seam). dir 1 winds clockwise on screen.
  tendril(x, y, ang, len, r, { dir = 1, bend = 0.2, turns = 1.6, ...o } = {}) {
    const ex = x + cos(ang) * len, ey = y + sin(ang) * len;
    const mx = (x + ex) / 2 - sin(ang) * len * bend * dir, my = (y + ey) / 2 + cos(ang) * len * bend * dir;
    const ea = len > 0 ? atan2(ey - my, ex - mx) : ang;
    const a0 = dir > 0 ? ea - PI / 2 : ea + PI / 2;
    const cx = ex - cos(a0) * r, cy = ey - sin(a0) * r, shrink = 0.8;
    const Ls = r * turns * TAU * (1 - shrink / 2), f = len / (len + Ls);
    return this.path(t => {
      if (t < f) { const u = t / f; return [(1 - u) ** 2 * x + 2 * (1 - u) * u * mx + u * u * ex, (1 - u) ** 2 * y + 2 * (1 - u) * u * my + u * u * ey]; }
      const u = (t - f) / (1 - f), a = a0 + dir * u * turns * TAU, rr = r * (1 - u * shrink);
      return [cx + cos(a) * rr, cy + sin(a) * rr];
    }, { width: FINE, wobble: 0.8, ...o });
  }

  // An arc that, at its end, keeps going and winds into its own spiral: a cloud's
  // bump, a scroll's lobe.
  arcCurl(cx, cy, r, a0, a1, { turns = 1.2, ...o } = {}) {
    const dir = a1 > a0 ? 1 : -1, La = abs(a1 - a0) * r, Ls = r * 0.5 * turns * TAU * 0.6, f = La / (La + Ls);
    const ex = cx + cos(a1) * r * 0.5, ey = cy + sin(a1) * r * 0.5;   // the spiral's centre, inside the arc
    return this.path(t => {
      if (t < f) { const a = lerp(a0, a1, t / f); return [cx + cos(a) * r, cy + sin(a) * r]; }
      const u = (t - f) / (1 - f), a = a1 + dir * u * turns * TAU, rr = r * 0.5 * (1 - u * 0.8);
      return [ex + cos(a) * rr, ey + sin(a) * rr];
    }, o);
  }

  // A rotated elliptical arc.
  ell(cx, cy, rx, ry, { rot = 0, a0 = 0, a1 = TAU + 0.15, ...o } = {}) {
    const cr = cos(rot), sr = sin(rot);
    return this.path(t => {
      const a = lerp(a0, a1, t), x = cos(a) * rx, y = sin(a) * ry;
      return [cx + x * cr - y * sr, cy + x * sr + y * cr];
    }, o);
  }

  // Many short straight marks in one stroke, unwobbled: stars, rain, hatching.
  marks(segs, { width = FINE, ink } = {}) {
    const c = this.c, k = abs(this.k);
    c.save(); c.strokeStyle = ink ?? this.ink; c.lineCap = 'round';
    c.lineWidth = max(width, 1.5 / this.s) / k;
    c.beginPath();
    for (const [x0, y0, x1, y1] of segs) { c.moveTo(x0, y0); c.lineTo(x1, y1); }
    c.stroke(); c.restore();
    return this;
  }

  // Many small solid dots in one fill: rivets, pebbles, eyes.
  dots(pts, r = 2.5) {
    const c = this.c;
    c.save(); c.fillStyle = this.ink; c.beginPath();
    for (const [x, y, rr] of pts) { c.moveTo(x + (rr ?? r), y); c.arc(x, y, rr ?? r, 0, TAU); }
    c.fill(); c.restore();
    return this;
  }

  // A solid ellipse (eyes, note heads, buds bigger than a bud).
  blob(x, y, rx, ry = rx, rot = 0) {
    const c = this.c;
    c.save(); c.fillStyle = this.ink; c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, TAU); c.fill(); c.restore();
    return this;
  }

  // Floor-coloured fill: lets a figure stand in front of what is behind it.
  mask(pts) {
    const c = this.c;
    c.save(); c.fillStyle = '#000'; c.beginPath();
    pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath(); c.fill(); c.restore();
    return this;
  }
  maskEll(x, y, rx, ry = rx, rot = 0) {
    const c = this.c;
    c.save(); c.fillStyle = '#000'; c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, TAU); c.fill(); c.restore();
    return this;
  }

  // Clip the following strokes to a polygon (half-buried things).
  clip(pts) {
    const c = this.c;
    c.save(); c.beginPath();
    pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath(); c.clip();
    this._ks.push(this.k);
  }
}

// A Catmull-Rom spline through points, as t in 0..1 -> [x, y].
function catmull(pts, closed = false) {
  const n = pts.length;
  const P = (i) => (closed ? pts[((i % n) + n) % n] : pts[max(0, min(n - 1, i))]);
  const segs = closed ? n : n - 1;
  return (t) => {
    const f = min(t * segs, segs - 1e-9), i = floor(f), u = f - i, u2 = u * u, u3 = u2 * u;
    const a = P(i - 1), b = P(i), c = P(i + 1), d = P(i + 2);
    const cr = (A, B, C, D) => 0.5 * (2 * B + (-A + C) * u + (2 * A - 5 * B + 4 * C - D) * u2 + (-A + 3 * B - 3 * C + D) * u3);
    return [cr(a[0], b[0], c[0], d[0]), cr(a[1], b[1], c[1], d[1])];
  };
}

// ---------------------------------------------------------------------------
// Shared pieces: the vocabulary the scenes are drawn from

// A four-pointed glint: one closed stroke.
function sparkle(p, x, y, r, o = {}) {
  const pts = [];
  for (let i = 0; i < 8; i++) { const a = i * PI / 4 - PI / 2, rr = i % 2 ? r * 0.22 : r; pts.push([x + cos(a) * rr, y + sin(a) * rr]); }
  p.pline(pts, { closed: true, width: FINE, wobble: 0.2, ...o });
}

// Stars as small crosses, all in one stroke. `list` is [[x, y, r], ...].
function stars(p, list, o = {}) {
  const segs = [];
  for (const [x, y, r] of list) { segs.push([x - r, y, x + r, y], [x, y - r, x, y + r]); }
  p.marks(segs, { width: FINE, ...o });
}

function scatter(R, n, x0, y0, x1, y1, r0 = 2.5, r1 = 5) {
  const out = [];
  for (let i = 0; i < n; i++) out.push([lerp(x0, x1, R()), lerp(y0, y1, R()), lerp(r0, r1, R())]);
  return out;
}

// A cloud the way he would draw one: a long wisp along the bottom that winds up
// into a spiral at its end, and two bumps on top, the second rolling into a curl.
// s is its half-width; flip mirrors it.
function cloud(p, x, y, s, { flip = false, width = FINE } = {}) {
  const f = flip ? -1 : 1, o = { width, wobble: 0.6 };
  // the base: a long wisp that rolls up into a spiral at its far end
  p.tendril(x - f * s * 1.15, y, flip ? PI + 0.03 : -0.03, s * 2.0, s * 0.2, { dir: -f, bend: -0.04, width, turns: 1.5 });
  // three scallops on top: small, big (rolling into its own curl), medium
  p.arc(x - f * s * 0.72, y, s * 0.3, flip ? 0 : PI, flip ? -PI : TAU, o);
  p.arcCurl(x - f * s * 0.08, y, s * 0.46, flip ? 0.05 : PI - 0.05, flip ? -PI * 1.2 : TAU + 0.2, { ...o, turns: 1.3 });
  p.arc(x + f * s * 0.56, y, s * 0.24, flip ? 0 : PI, flip ? -PI * 0.95 : PI * 1.95, o);
}

// A crescent moon opening to the right, its lower horn running on into a curl.
function moon(p, x, y, R, o = {}) {
  const ta = 1.75;                          // the horns sit at +-100 degrees
  p.arc(x, y, R, -ta, -TAU + ta, { width: MAIN, ...o });
  const d = 0.5 * R, tx = x + R * cos(ta), ty = R * sin(ta);
  const ri = hypot(tx - (x + d), ty), ai = atan2(ty, tx - (x + d));
  p.arc(x + d, y, ri, -ai, -TAU + ai, { width: FINE, ...o });
  p.tendril(tx, y + ty, 0.5, R * 0.35, R * 0.18, { dir: -1, width: FINE });
}

// His curl tree: a trunk that forks, and every branch ends in an open spiral, the
// left ones winding out to the left, the right ones out to the right. Roots curl
// out at the foot so nothing just stops. depth 1 is a sapling (four strokes).
function curlTree(p, x, y, h, { lean = 0, depth = 2, spread = 0.62, trunk = MAIN, twig = FINE, roots = true, R = p.L, flip = false } = {}) {
  const a = -PI / 2 + lean, tl = h * 0.42;
  const bx = x + cos(a) * tl * 0.5 + (R() - 0.5) * h * 0.06, by = y + sin(a) * tl * 0.5;
  const ex = x + cos(a) * tl, ey = y + sin(a) * tl;
  p.curve([[x, y], [bx, by], [ex, ey]], { width: trunk });
  if (roots) {
    p.tendril(x, y - 1, PI - 0.25, h * 0.06, h * 0.035, { dir: 1, width: twig, turns: 1.1 });
    p.tendril(x, y - 1, 0.25, h * 0.06, h * 0.035, { dir: -1, width: twig, turns: 1.1 });
  }
  const branch = (x0, y0, ang, len, d, side) => {
    if (d === 0) {
      p.tendril(x0, y0, ang, len, max(3, len * 0.32), { dir: side, bend: 0.18 * side, width: twig });
      return;
    }
    const L = len * 0.55, x1 = x0 + cos(ang) * L, y1 = y0 + sin(ang) * L;
    p.curve([[x0, y0], [lerp(x0, x1, 0.5) - sin(ang) * L * 0.08 * side, lerp(y0, y1, 0.5) + cos(ang) * L * 0.08 * side], [x1, y1]], { width: d === depth ? trunk * 0.8 : twig });
    const sp = spread * (0.85 + R() * 0.3);
    branch(x1, y1, ang - sp, len * 0.72, d - 1, -1);
    branch(x1, y1, ang + sp, len * 0.72, d - 1, 1);
    if (d === depth && depth >= 2) branch(x1, y1, ang + (R() - 0.5) * 0.2, len * 0.6, 0, flip ? -1 : 1);
  };
  const sp = spread * 1.05;
  branch(ex, ey, a - sp * 0.9, h * 0.42, depth - 1, -1);
  branch(ex, ey, a + sp * 0.9, h * 0.42, depth - 1, 1);
  branch(ex, ey, a + (R() - 0.5) * 0.15, h * 0.5, max(0, depth - 1), flip ? -1 : 1);
}

// A fiddlehead fern: a stalk from the ground winding into a tight spiral.
function fern(p, x, y, h, side = 1) {
  p.tendril(x, y, -PI / 2 + side * 0.35, h, h * 0.28, { dir: side, bend: 0.3 * side, width: FINE, turns: 1.8 });
}

// A wobbly ground line across the whole box at roughly height y.
function groundLine(p, W, y, { amp = 4, n = 7, width = MAIN, R = p.L, x0 = -10, x1 = W + 10 } = {}) {
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push([lerp(x0, x1, i / n), y + (R() - 0.5) * amp * 2]);
  p.curve(pts, { width });
  return pts;
}

// Wavy falling water: a few parallel wavy strokes from (x, y0) down to y1.
function waterfall(p, x, y0, y1, { n = 3, gap = 7, amp = 2.5, width = FINE, phase = 0 } = {}) {
  for (let i = 0; i < n; i++) {
    const xo = x + (i - (n - 1) / 2) * gap;
    p.path(t => [xo + sin(t * 9 + i * 1.7 + phase) * amp * t, lerp(y0, y1, t)], { width, wobble: 0.5 });
  }
}

// Horizontal flowing water: wavy strokes from x0 to x1 at height y.
function ripples(p, x0, x1, y, { n = 2, gap = 8, amp = 2.5, waves = 6, width = FINE, phase = 0 } = {}) {
  for (let i = 0; i < n; i++) {
    const yo = y + i * gap;
    p.path(t => [lerp(x0, x1, t), yo + sin(t * waves * TAU + i * 2 + phase) * amp], { width, wobble: 0.4 });
  }
}

// ---------------------------------------------------------------------------
// The Composer's Key, after his concept sheet: a tall shaft of twisted spindle
// segments; three note bits at the top, each a solid head on the left whose flag
// sweeps across the shaft and rolls into a hook; two side curls at the foot; a
// teardrop pendant with a spiral in it. Local frame: 100 tall, tip at y -100,
// the pendant's bottom at 0, centred on x 0.
function theKey(p, x, y, size, { rot = 0, weight = 1 } = {}) {
  const k = size / 100;
  p.push(x, y, rot, k);
  const wm = MAIN * weight, wf = FINE * weight;
  // the spindle: three lenses, narrow at the tip, fattest at the foot, a twist in each
  const lens = (y0, y1, hw) => {
    p.path(t => [-sin(t * PI) * hw, lerp(y0, y1, t)], { width: wm * 0.85, wobble: 0.3 });
    p.path(t => [sin(t * PI) * hw, lerp(y0, y1, t)], { width: wm * 0.85, wobble: 0.3 });
    p.path(t => [sin(t * PI * 2) * hw * 0.55 * sin(t * PI), lerp(y0 + 2, y1 - 2, t)], { width: wf * 0.7, wobble: 0.2 });
  };
  lens(-101, -73, 2.6);
  lens(-73, -52, 4.6);
  lens(-52, -29, 7.2);
  // the note bits
  for (const [i, ny] of [[0, -95], [1, -84], [2, -73]]) {
    const hx = -23 + i * 0.5, hy = ny + 6;
    p.blob(hx, hy, 6.4, 4.7, -0.45);
    p.tendril(hx + 4.5, hy - 2.5, -0.32, 29, 4.6, { dir: 1, bend: -0.25, width: wm * 0.9, wobble: 0.25, turns: 1.25 });
  }
  // the foot: the two side curls sweep out and down and wind up at their ends
  for (const s of [-1, 1]) {
    p.path(t => [s * (sin(t * PI * 0.5) * 22), -29 + t * 7 - sin(t * PI) * -3], { width: wm * 0.8, wobble: 0.25 });
    p.curlAt(s * 22, -22, s > 0 ? -0.3 : PI + 0.3, 5.5, { dir: s > 0 ? -1 : 1, width: wf, turns: 1.5 });
  }
  // the pendant: a teardrop, point up, a spiral inside
  p.path(t => {
    const a = -PI / 2 + t * TAU, r = 10.5;
    const pinch = 1 + 0.9 * max(0, -sin(a)) ** 3;   // draws the top out to a point
    return [cos(a) * r / pinch, -11 + sin(a) * r * (sin(a) < 0 ? 1.65 : 1)];
  }, { width: wm, wobble: 0.3 });
  p.spiral(1, -9, 5.2, { dir: -1, start: PI * 0.2, width: wf, turns: 1.6 });
  p.pop();
}

// ---------------------------------------------------------------------------
// Coda, after player.png: a big head under a swept cap that rises at the front into
// a curl, one eye, a ribbed scarf collar, a coat with a placket down to a big round
// clasp, two little round feet. He faces right. Local frame: 100 tall, feet on
// y 0, centred on x 0. The arms are not in the sprite; they come out for poses.
//
//   pose: stand | walk | fall | sit | hold | conduct | bow
//   t (beats) drives walk and conduct; amount (0..1) drives bow.
function coda(p, x, y, size, o = {}) {
  const { pose = 'stand', t = 0, amount = 0, rot = 0, flip = false, weight = 1, centre = false } = o;
  p.push(x, y, rot, size / 100, flip);
  if (centre) p.c.translate(0, 55);
  const c = p.c;
  const W3 = { width: MAIN * 1.15 * weight, wobble: 0.7 };
  const W2 = { width: FINE * 1.1 * weight, wobble: 0.5 };
  const sy = pose === 'sit' ? 7 : 0;           // sitting: everything above the hem sinks
  const walkPh = pose === 'walk' ? t * PI : 0;
  const ws = sin(walkPh);

  // feet (and, sitting, the legs out in front)
  if (pose === 'sit') {
    // sitting on the ground, knees up, feet out in front
    p.pline([[12, -6], [27, -17], [33, -7]], { width: MAIN * 1.1 * weight, wobble: 0.5 });
    p.pline([[18, -5], [35, -14], [42, -6]], { width: MAIN * 1.1 * weight, wobble: 0.5 });
    p.circle(34, -5.5, 5.5, W3); p.circle(44, -5.5, 5.5, W3);
  } else {
    let f1 = [-12, -5.5], f2 = [18, -5.5];
    if (pose === 'walk') { f1 = [-12 - ws * 7, -5.5 - max(0, ws) * 4]; f2 = [18 + ws * 7, -5.5 - max(0, -ws) * 4]; }
    if (pose === 'fall') { f1 = [-17, -2]; f2 = [23, -10]; }
    p.circle(f1[0], f1[1], 5.5, W3); p.circle(f2[0], f2[1], 5.5, W3);
  }

  // A bow tips the body forward about the hem and the head further about the neck.
  const bowA = pose === 'bow' ? amount * 0.72 : 0, bodyA = bowA * 0.5, headA = bowA * 0.5;
  const BP = [2, -12], NP = [4, -42];
  const turn = (P, a) => { c.translate(P[0], P[1]); c.rotate(a); c.translate(-P[0], -P[1]); };
  c.save();
  if (pose === 'walk') c.translate(0, -abs(ws) * 2.5);
  if (bodyA) turn(BP, bodyA);

  // the coat: sides flaring to the hem, the placket down to the big round clasp
  p.line(-18, -34 + sy, -24, -12 + sy, W3); p.line(23, -34 + sy, 27, -12 + sy, W3);
  p.line(-24, -12 + sy, -3.5, -11.5 + sy, W3); p.line(10.5, -11.5 + sy, 27, -12 + sy, W3);
  p.line(0, -33 + sy, 2.5, -15.5 + sy, W2); p.line(7, -33 + sy, 4.8, -15.5 + sy, W2);
  const cy = -9 + sy - (pose === 'sit' ? 5 : 0);
  p.circle(3.5, cy, 6.5, W3); p.blob(3.5, cy, 2.2);
  p.line(15, -22 + sy, 21, -21 + sy, W2);
  // the ribbed scarf collar
  p.curve([[-16, -43 + sy], [-18, -34 + sy], [3, -32 + sy], [23, -34 + sy], [20, -43 + sy], [3, -41.5 + sy]], { closed: true, ...W3 });
  p.marks([[-5, -42 + sy, -6, -33 + sy], [10, -42 + sy, 11, -33 + sy]], { width: FINE * weight });
  // its ends fly out behind him when he moves: a ribbon, forked at the tip
  if (pose === 'fall' || pose === 'walk' || pose === 'conduct') {
    const up = pose === 'fall';
    const a = up ? -PI * 0.6 : PI + 0.25 + (pose === 'walk' ? ws * 0.12 : 0), L = up ? 30 : 24;
    const ex = -16 + cos(a) * L, ey = -39 + sy + sin(a) * L, nx = -sin(a) * 4, ny = cos(a) * 4;
    p.curve([[-16, -41 + sy], [-16 + cos(a) * L * 0.5 + nx, -41 + sy + sin(a) * L * 0.5 + ny * 1.5], [ex + nx, ey + ny]], W2);
    p.curve([[-16, -36 + sy], [-16 + cos(a) * L * 0.5 - nx * 0.5, -36 + sy + sin(a) * L * 0.5], [ex - nx, ey - ny]], W2);
    p.pline([[ex + nx, ey + ny], [ex - cos(a) * 3, ey - sin(a) * 3], [ex - nx, ey - ny]], W2);
  }

  // the head, tipping a little further than the body in a bow
  c.save();
  if (headA) turn(NP, headA);
  const hy = sy;
  p.curve([[20, -78 + hy], [24, -70 + hy], [26, -64.5 + hy], [29.5, -60 + hy], [25.5, -57 + hy], [24.5, -52 + hy], [19, -46 + hy], [9, -42.5 + hy]], W3);
  p.curve([[-13, -43.5 + hy], [-22, -50 + hy], [-26, -60 + hy], [-25, -70 + hy], [-21, -77 + hy]], W3);
  // the cap: puffs at the back, then it sweeps forward and up to a curling tip
  p.curve([[-21, -77 + hy], [-29, -80 + hy], [-29.5, -88 + hy], [-23, -95 + hy], [-12, -98.5 + hy], [2, -99 + hy], [14, -101.5 + hy], [25, -106 + hy], [32, -112 + hy]], W3);
  p.curve([[32, -112 + hy], [31, -102 + hy], [26.5, -92 + hy], [21, -82 + hy], [20, -78 + hy]], W3);
  p.curve([[-22, -81 + hy], [-8, -85 + hy], [8, -86 + hy], [21, -84 + hy]], W2);
  p.spiral(-19, -88 + hy, 5.5, { dir: -1, start: PI * 0.3, width: FINE * weight, turns: 1.3 });
  p.tendril(-2, -90.5 + hy, -0.15, 16, 5, { dir: -1, bend: 0.1, width: FINE * weight, turns: 1.2 });
  // one eye, closed in a bow; a mouth only when he is falling
  if (pose === 'bow' && amount > 0.3) p.arc(14.5, -62 + hy, 4, PI * 0.15, PI * 0.85, W2);
  else p.blob(14.5, -62 + hy, 1.9, 4.2);
  if (pose === 'fall') p.circle(21, -50 + hy, 2.6, W2);
  c.restore();

  // arms, by pose. Shoulders at (-15, -36) behind and (19, -36) in front.
  const hand = (hx, hy2) => p.circle(hx, hy2, 3.6, W2);
  const arm = (S, ex, ey, hx, hy2) => { p.curve([S, [ex, ey], [hx, hy2]], W3); hand(hx, hy2); };
  const SH = [19, -36 + sy], SB = [-15, -36 + sy];
  if (pose === 'hold') {
    arm(SB, -35, -66, -19, -121);
    arm(SH, 38, -66, 22, -123);
  } else if (pose === 'fall') {
    arm(SB, -31, -52, -38, -70);
    arm(SH, 35, -46, 45, -60);
  } else if (pose === 'conduct') {
    // 4/4: beat 1 down, 2 left (across him), 3 right, 4 up. Each beat lands on its
    // point (the ictus) and rebounds a little on the way to the next.
    const pts = [[31, -24], [12, -42], [45, -40], [32, -62]];
    const b = frac(t / 4) * 4, i = floor(b), u = b - i;
    const A = pts[i], B = pts[(i + 1) % 4], e = ease(u);
    const hx = lerp(A[0], B[0], e), hy2 = lerp(A[1], B[1], e) - sin(u * PI) * 7;
    arm(SH, lerp(SH[0], hx, 0.5) + 5, lerp(SH[1], hy2, 0.5) + 4, hx, hy2);
    // the baton points away from the shoulder, tipped up
    const dx = hx - SH[0] + 6, dy = hy2 - SH[1] - 16, d = hypot(dx, dy) || 1;
    p.line(hx + dx / d * 3, hy2 + dy / d * 3, hx + dx / d * 28, hy2 + dy / d * 28, { width: FINE * 1.1 * weight, wobble: 0.2 });
    arm(SB, -22, -28, -16, -21);
  } else if (pose === 'tinker') {
    // at the bench: the front hand out at work with a small driver, the other on the edge
    arm(SH, 33, -30, 41, -46);
    p.line(43, -44, 53, -37, { width: FINE * 1.2 * weight, wobble: 0.2 });
    arm(SB, -20, -27, -15, -19);
  } else if (pose === 'sit') {
    arm(SH, 25, -26 + sy, 31, -19);
    arm(SB, -20, -26 + sy, -17, -14 + sy);
  } else if (pose === 'walk') {
    arm(SH, 22 + ws * 3, -27, 23 - ws * 8, -18);
    arm(SB, -20 - ws * 3, -27, -19 + ws * 8, -18);
  } else if (pose !== 'bow') {
    arm(SH, 25, -28 + sy, 25, -17 + sy);
    arm(SB, -20, -28 + sy, -20, -17 + sy);
  }
  c.restore();
  if (pose === 'bow') {
    // the arms hang straight down from wherever the bow has carried the shoulders
    for (const S of [SH, SB]) {
      const dx = S[0] - BP[0], dy = S[1] - BP[1];
      const ax = BP[0] + dx * cos(bodyA) - dy * sin(bodyA), ay = BP[1] + dx * sin(bodyA) + dy * cos(bodyA);
      p.line(ax, ay, ax + 1, ay + 19, W3); p.circle(ax + 1, ay + 22.5, 3.6, W2);
    }
  }
  p.pop();
}

// A small solid silhouette of Coda (for far shots, the explosion): head and cap,
// coat, feet, arms flung.
function codaSilhouette(p, x, y, size, rot = 0) {
  p.push(x, y, rot, size / 100);
  const c = p.c;
  c.save(); c.fillStyle = p.ink; c.beginPath();
  c.ellipse(0, -62, 25, 22, 0, 0, TAU);
  c.moveTo(-26, -78); c.quadraticCurveTo(0, -112, 34, -112); c.quadraticCurveTo(26, -86, 20, -78); c.closePath();
  c.moveTo(-19, -43); c.lineTo(22, -43); c.lineTo(28, -12); c.lineTo(-25, -12); c.closePath();
  c.moveTo(-6, -6); c.arc(-11, -6, 6, 0, TAU); c.moveTo(24, -6); c.arc(19, -6, 6, 0, TAU);
  c.fill(); c.restore();
  p.line(-16, -36, -40, -66, { width: 7, wobble: 0.5 }); p.line(20, -36, 46, -58, { width: 7, wobble: 0.5 });
  p.pop();
}

// ---------------------------------------------------------------------------
// The castle, ruined (castle-far) or restored (ending), on its cliff. Drawn for a
// 400-unit square with the cliff edge at x ~250; the aqueduct runs off right.
function castleOnCliff(p, W, H, { restored = false, t = 0 } = {}) {
  const top = 282, edge = 268;
  // the clifftop and the overhang, rock hatching dim on its face
  p.curve([[-10, top + 3], [90, top - 3], [190, top + 2], [edge, top]], { width: MAIN * 1.2 });
  p.curve([[edge, top], [259, top + 18], [232, top + 40], [207, top + 68], [192, top + 104], [186, H + 10]], { width: MAIN * 1.2 });
  p.dim(() => {
    const h = [];
    for (const [x, y] of [[30, 312], [86, 300], [136, 318], [60, 350], [120, 368], [160, 344], [25, 385]]) p.arc(x, y + 20, 18, -PI * 0.75, -PI * 0.35, { width: FINE });
  });
  // roots and vines dangling from under the overhang
  for (const [rx, ry, len, s] of [[262, top + 10, 48, 1], [244, top + 28, 74, -1], [226, top + 46, 44, 1], [210, top + 64, 62, -1], [198, top + 88, 34, 1]]) {
    p.tendril(rx, ry, PI / 2 + s * 0.15, len, 7, { dir: s, bend: 0.3 * s, width: FINE });
  }
  p.tendril(244, top + 30, PI / 2 + 0.7, 28, 5, { dir: -1, width: FINE, turns: 1.2 });

  const tower = (x0, x1, y0, yTop, roofH, { broken = false, slits = 2 } = {}) => {
    p.line(x0, y0, x0, yTop, { width: MAIN }); p.line(x1, y0, x1, yTop, { width: MAIN });
    const mx = (x0 + x1) / 2, ov = (x1 - x0) * 0.2;
    if (broken) {
      p.pline([[x0 - ov, yTop], [mx - 6, yTop - roofH * 0.6], [mx - 1, yTop - roofH * 0.42], [mx + 4, yTop - roofH * 0.66], [mx + 9, yTop - roofH * 0.3], [x1 + ov, yTop]], { width: MAIN });
    } else {
      p.curve([[x0 - ov, yTop], [mx - (x1 - x0) * 0.22, yTop - roofH * 0.55], [mx, yTop - roofH]], { width: MAIN });
      p.curve([[x1 + ov, yTop], [mx + (x1 - x0) * 0.22, yTop - roofH * 0.55], [mx, yTop - roofH]], { width: MAIN });
      if (restored) {
        const w = sin(t * PI) * 2.5, fy = yTop - roofH;
        p.line(mx, fy, mx, fy - 22, { width: FINE });
        p.curve([[mx, fy - 22], [mx + 13, fy - 20 + w], [mx + 28, fy - 23 - w], [mx + 16, fy - 15], [mx, fy - 13]], { width: FINE });
      } else {
        p.tendril(mx, yTop - roofH, -PI / 2, 9, 6, { dir: 1, width: FINE, turns: 1.6 });
      }
    }
    p.line(x0 - ov, yTop, x1 + ov, yTop, { width: FINE });
    const segs = [];
    for (let i = 0; i < slits; i++) { const sy2 = yTop + 20 + i * 30; if (sy2 + 11 < y0 - 6) segs.push([mx, sy2, mx, sy2 + 11]); }
    p.marks(segs, { width: MAIN * 1.2 });
  };
  const crenel = (x0, x1, y, h, n) => {
    const pts = [[x0, y]], step = (x1 - x0) / (n * 2);
    for (let i = 0; i < n * 2; i++) { const xa = x0 + i * step, up = i % 2 === 0; pts.push([xa, up ? y - h : y], [xa + step, up ? y - h : y]); }
    pts.push([x1, y]);
    p.pline(pts, { width: FINE });
  };
  tower(92, 114, top, 196, 46, { slits: 2 });
  crenel(114, 138, 236, 7, 2);
  tower(138, 170, top, 120, 70, { slits: 3 });
  // the keep: walls, a steep gable (broken, until it is restored), the rose window
  p.line(170, top, 170, 176, { width: MAIN }); p.line(252, top, 252, 176, { width: MAIN });
  if (restored) p.pline([[165, 178], [211, 126], [257, 178]], { width: MAIN });
  else p.pline([[165, 178], [190, 150], [197, 160], [204, 143], [213, 134], [257, 178]], { width: MAIN });
  p.circle(211, 214, 27, { width: MAIN });
  p.circle(211, 214, 9, { width: FINE });
  const sp = [];
  for (let i = 0; i < 8; i++) { const a = i * PI / 4 + 0.2; sp.push([211 + cos(a) * 9, 214 + sin(a) * 9, 211 + cos(a) * 27, 214 + sin(a) * 27]); }
  p.marks(sp, { width: FINE });
  p.line(199, top, 199, 262, { width: FINE }); p.line(223, top, 223, 262, { width: FINE });
  p.arc(211, 262, 12, PI, TAU, { width: FINE });
  if (!restored) {
    p.pline([[240, 186], [233, 200], [242, 208], [236, 224]], { width: FINE, wobble: 0.3 });
    p.pline([[178, 238], [185, 247], [180, 262]], { width: FINE, wobble: 0.3 });
  }
  // tower B hangs off the edge, its foot a cone corbelled out over the drop
  tower(252, 290, top + 8, 150, 52, { slits: 3, broken: !restored });
  p.line(252, top + 8, 271, top + 50, { width: MAIN }); p.line(290, top + 8, 271, top + 50, { width: MAIN });
  p.tendril(271, top + 50, PI / 2, 9, 5.5, { dir: 1, width: FINE, turns: 1.4 });
  // the aqueduct: a channel carried on tall arches out over the drop
  const y0 = 204, y1 = 218, end = restored ? W + 10 : 372;
  p.line(290, y0, end, y0, { width: MAIN }); p.line(290, y1, restored ? end : end - 8, y1, { width: MAIN });
  const pier = (x) => { p.line(x - 6, y1, x - 6, H + 10, { width: MAIN }); p.line(x + 6, y1, x + 6, H + 10, { width: MAIN }); };
  p.arc(317, y1, 21, PI, 0, { width: MAIN });
  pier(342);
  if (restored) {
    p.arc(368, y1, 20, PI, 0, { width: MAIN }); pier(394);
    ripples(p, 292, W, y0 - 7, { n: 1, amp: 1.8, waves: 10, phase: t * PI });
    waterfall(p, 360, y1 + 4, H + 10, { n: 2, gap: 7, phase: t * 2 });
  } else {
    // broken off: a jagged end, and the water spilling from it
    p.pline([[372, y0], [378, y0 + 5], [369, y0 + 9], [365, y1]], { width: MAIN });
    p.arc(368, y1, 20, PI, PI * 1.55, { width: MAIN });
    waterfall(p, 376, y0 + 3, H + 10, { n: 3, gap: 7 });
    p.tendril(376, y0 + 2, -0.5, 10, 5, { dir: -1, width: FINE, turns: 1.3 });
  }
}

// ---------------------------------------------------------------------------
// Architecture and instruments, shared by the scenes, bosses, items and emblems

// A pointed (gothic) arch: two springers and two arcs meeting at an apex, one stroke.
// (x, yBase) is the middle of its foot, hw its half-width, hs the height of its
// springing line, rise how far the point stands above that.
function gothic(p, x, yBase, hw, hs, rise, o = {}) {
  const ys = yBase - hs;
  for (const k of [-1, 1]) {
    p.curve([[x + k * hw, yBase], [x + k * hw, ys], [x + k * hw * 0.93, ys - rise * 0.42], [x + k * hw * 0.62, ys - rise * 0.79], [x, ys - rise]], { width: MAIN, ...o });
  }
}

// A round arch on two posts, one stroke.
function roundArch(p, x, yBase, hw, hs, o = {}) {
  const ys = yBase - hs;
  p.path(t => {
    const L1 = hs, L2 = PI * hw, tot = 2 * L1 + L2, d = t * tot;
    if (d < L1) return [x - hw, yBase - d];
    if (d < L1 + L2) { const a = PI + (d - L1) / L2 * PI; return [x + cos(a) * hw, ys + sin(a) * hw]; }
    return [x + hw, ys + (d - L1 - L2)];
  }, { width: MAIN, ...o });
}

// A rose window after his: an outer ring, a ring of small rings, spokes to a hub.
function roseWindow(p, x, y, r, { spokes = 12, ring = 10, width = MAIN } = {}) {
  p.circle(x, y, r, { width });
  p.circle(x, y, r * 0.72, { width: FINE });
  p.circle(x, y, r * 0.16, { width: FINE });
  const segs = [];
  for (let i = 0; i < spokes; i++) { const a = i * TAU / spokes; segs.push([x + cos(a) * r * 0.16, y + sin(a) * r * 0.16, x + cos(a) * r * 0.72, y + sin(a) * r * 0.72]); }
  p.marks(segs, { width: FINE });
  p.circle(x, y, r * 0.45, { width: HAIR, wobble: 0.6 });
  const rr = r * 0.12;
  for (let i = 0; i < ring; i++) { const a = i * TAU / ring + 0.3; p.circle(x + cos(a) * r * 0.86, y + sin(a) * r * 0.86, rr, { width: HAIR, wobble: 0.3 }); }
}

// Organ pipes: tall tubes standing on a ledge, each with its mouth (a small V cut)
// and, after the concept art, a spiral on top. One stroke per pipe and one for the
// mouths. `water` runs a wavy line down the middle of each.
function organPipes(p, x0, x1, yBase, hMax, n, { hMin = hMax * 0.55, water = false, phase = 0, curls = true, dry = false } = {}) {
  const step = (x1 - x0) / n, w = step * 0.62, mouths = [];
  for (let i = 0; i < n; i++) {
    const cx = x0 + step * (i + 0.5), k = 1 - abs((i + 0.5) / n - 0.5) * 2;
    const h = lerp(hMin, hMax, k), yt = yBase - h;
    p.pline([[cx - w / 2, yBase], [cx - w / 2, yt], [cx + w / 2, yt], [cx + w / 2, yBase]], { width: FINE * 1.2 });
    const my = yBase - min(26, h * 0.18);
    mouths.push([cx - w * 0.32, my, cx, my - w * 0.35], [cx, my - w * 0.35, cx + w * 0.32, my]);
    if (curls) p.tendril(cx, yt, -PI / 2, w * 0.4, w * 0.36, { dir: i % 2 ? 1 : -1, width: FINE, turns: 1.4 });
    if (water) p.path(u => [cx + sin(u * 10 + i + phase) * w * 0.14, lerp(yt + 6, my - w * 0.5, u)], { width: HAIR, wobble: 0.3 });
    if (dry && i % 3 === 1) p.pline([[cx - w / 2, yt + h * 0.3], [cx - w * 0.1, yt + h * 0.36], [cx + w * 0.15, yt + h * 0.3]], { width: HAIR });
  }
  p.marks(mouths, { width: FINE });
}

// A drum seen from the front and a little above: the head an ellipse, the shell,
// the lower rim, and tension rods in a zigzag round it.
function drum3(p, x, y, rx, ry, h, { rods = 8, width = MAIN, rodW = FINE } = {}) {
  p.ell(x, y, rx, ry, { width });
  p.line(x - rx, y, x - rx, y + h, { width }); p.line(x + rx, y, x + rx, y + h, { width });
  p.ell(x, y + h, rx, ry, { a0: 0, a1: PI, width });
  if (!rods) return;
  const pts = [];
  for (let i = 0; i <= rods; i++) { const a = PI - i * PI / rods; pts.push([x + cos(a) * rx, (i % 2 ? y + h + sin(a) * ry : y + sin(a) * ry)]); }
  p.pline(pts, { width: rodW });
}

// A violin-family body (figure of eight with waist cuts), upright, centred on
// (x, y), length L. f-holes, the bridge, the neck and the scroll come with it.
// `strings` 'taut' | 'slack' | 'none'.
function fiddle(p, x, y, L, { rot = 0, strings = 'taut', neck = 1, width = MAIN } = {}) {
  p.push(x, y, rot, L / 100);
  const pts = [[0, -50], [18, -46], [24, -32], [16, -18], [16, -8], [28, 6], [30, 26], [20, 44], [0, 50], [-20, 44], [-30, 26], [-28, 6], [-16, -8], [-16, -18], [-24, -32], [-18, -46]];
  p.curve(pts, { closed: true, width });
  for (const s of [-1, 1]) p.curve([[s * 9, -10], [s * 12, -2], [s * 8, 8], [s * 11, 16]], { width: FINE * 0.9 });
  p.line(-9, 12, 9, 12, { width: FINE });
  p.pline([[-5, 50], [-4, 38], [4, 38], [5, 50]], { width: FINE });
  // the neck and the scroll, a spiral
  const nt = -50 - 44 * neck;
  p.line(-3.5, -50, -3, nt, { width: FINE * 1.1 }); p.line(3.5, -50, 3, nt, { width: FINE * 1.1 });
  p.spiral(3, nt - 7, 7, { dir: -1, start: PI * 0.6, width: FINE * 1.1, turns: 1.6 });
  if (strings === 'taut') p.marks([[-2.4, nt + 2, -3, 39], [-0.8, nt + 2, -1, 39], [0.8, nt + 2, 1, 39], [2.4, nt + 2, 3, 39]], { width: HAIR * 0.8 });
  else if (strings === 'slack') for (let i = 0; i < 4; i++) { const xo = -2.4 + i * 1.6; p.curve([[xo, nt + 2], [xo + 7 + i * 3, -30 + i * 4], [xo + 12 + i * 4, 10], [xo + 3, 39]], { width: HAIR }); }
  p.pop();
}

// A horn's bell, opening left: the rim an ellipse, the flare closing to a tube that
// runs off right to (x + len). Curls sprout from the flare, after his concept art.
function hornBell(p, x, y, R, len, { curls = 3, width = MAIN } = {}) {
  p.ell(x, y, R * 0.32, R, { width });
  const tw = R * 0.22;
  p.curve([[x + R * 0.06, y - R * 0.98], [x + R * 0.55, y - R * 0.5], [x + R * 1.25, y - tw * 1.2], [x + len, y - tw]], { width });
  p.curve([[x + R * 0.06, y + R * 0.98], [x + R * 0.55, y + R * 0.5], [x + R * 1.25, y + tw * 1.2], [x + len, y + tw]], { width });
  p.spiral(x - R * 0.04, y - R * 0.72, R * 0.14, { dir: 1, width: FINE, turns: 1.4 });
  p.spiral(x - R * 0.04, y + R * 0.72, R * 0.14, { dir: -1, width: FINE, turns: 1.4 });
  for (let i = 0; i < curls; i++) {
    const u = 0.35 + i * 0.22, s = i % 2 ? 1 : -1;
    const bx = x + R * (0.2 + u * 0.9), by = y + s * R * (0.9 - u * 0.7);
    p.tendril(bx, by, s * (PI / 2 - 0.5) + (s < 0 ? -0.2 : 0.2), R * 0.42, R * 0.13, { dir: -s, bend: 0.3, width: FINE });
  }
}

// An eye for the dark: an almond with a solid pupil (open) or a lashed arc (shut).
function eye(p, x, y, r, { shut = false, look = 0, rot = 0, width = FINE } = {}) {
  if (shut) {
    p.ell(x, y, r, r * 0.5, { rot, a0: 0.1, a1: PI - 0.1, width });
    return;
  }
  const c = cos(rot), s = sin(rot);
  p.path(t => { const a = t * TAU + 0.1, ex = cos(a) * r, ey = sin(a) * r * 0.48 * (abs(sin(a)) ** 0.35); return [x + ex * c - ey * s, y + ex * s + ey * c]; }, { width, wobble: 0.3 });
  p.blob(x + look * r * 0.35, y, r * 0.26, r * 0.32);
}

// A heartbeat line across a span: flat, a small bump, the spike, flat.
function heartbeat(p, x0, x1, y, amp, beats = 2) {
  const pts = [[x0, y]], span = (x1 - x0) / beats;
  for (let b = 0; b < beats; b++) {
    const a = x0 + b * span;
    pts.push([a + span * 0.3, y], [a + span * 0.36, y - amp * 0.15], [a + span * 0.42, y], [a + span * 0.48, y + amp * 0.25], [a + span * 0.54, y - amp], [a + span * 0.6, y + amp * 0.45], [a + span * 0.66, y], [a + span, y]);
  }
  p.pline(pts, { width: MAIN, wobble: 0.3 });
}

// A hand-drawn rectangle frame with scrolls in its corners, inset `m` from the box.
function ornateFrame(p, W, H, m, { double = true, crest = true, width = MAIN, sprouts = true } = {}) {
  const x0 = m, y0 = m, x1 = W - m, y1 = H - m;
  p.box(x0, y0, x1 - x0, y1 - y0, { width, overshoot: 4, wobble: 1 });
  const g = min(W, H) * 0.028;
  if (double) p.box(x0 + g, y0 + g, x1 - x0 - 2 * g, y1 - y0 - 2 * g, { width: FINE, overshoot: 0, wobble: 0.8 });
  // a scroll grows out of each corner, one along each side, winding back in
  const r = min(W, H) * 0.045, L = min(W, H) * 0.09;
  for (const [cx, cy, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x1, y1, -1, -1], [x0, y1, 1, -1]]) {
    p.tendril(cx, cy, sx > 0 ? 0 : PI, L, r, { dir: sx * sy > 0 ? 1 : -1, bend: 0.12 * sy * sx, width: FINE, turns: 1.6, wobble: 0.4 });
    p.tendril(cx, cy, sy > 0 ? PI / 2 : -PI / 2, L, r, { dir: sx * sy > 0 ? -1 : 1, bend: -0.12 * sy * sx, width: FINE, turns: 1.6, wobble: 0.4 });
    p.blob(cx, cy, g * 0.55);
  }
  if (sprouts) {
    // small sprigs off the outer line, outward into the margin, so the middle stays clear
    const k = min(W, H) * 0.04;
    for (const u of [0.32, 0.68]) {
      p.tendril(lerp(x0, x1, u), y0, -PI / 2 + (u < 0.5 ? -0.5 : 0.5), k * 0.8, k * 0.32, { dir: u < 0.5 ? -1 : 1, width: FINE, turns: 1.3 });
      p.tendril(lerp(x0, x1, u), y1, PI / 2 + (u < 0.5 ? 0.5 : -0.5), k * 0.8, k * 0.32, { dir: u < 0.5 ? 1 : -1, width: FINE, turns: 1.3 });
    }
  }
  if (crest) {
    const cx = W / 2, k = min(W, H) * 0.05;
    p.tendril(cx, y0, -PI / 2 - 0.9, k * 1.2, k * 0.45, { dir: -1, width: FINE, turns: 1.6 });
    p.tendril(cx, y0, -PI / 2 + 0.9, k * 1.2, k * 0.45, { dir: 1, width: FINE, turns: 1.6 });
    p.blob(cx, y0 - k * 0.15, k * 0.22);
  }
}

// A dashed path: `n` pieces with gaps, for the jittery bird and the rubber stamp.
function broken(p, fn, n, gap = 0.3, o = {}) {
  for (let i = 0; i < n; i++) {
    const a = i / n, b = (i + 1 - gap) / n;
    p.path(t => fn(lerp(a, b, t)), o);
  }
}

// A gear: a toothed rim in one stroke, an inner ring, a hub.
function gear(p, x, y, r, n, { width = FINE * 1.2 } = {}) {
  const th = max(3, r * 0.22);
  p.path(t => {
    const a = t * TAU, f = frac(t * n);
    const sh = f < 0.12 ? f / 0.12 : f < 0.45 ? 1 : f < 0.57 ? 1 - (f - 0.45) / 0.12 : 0;
    const rr = r + th * sh;
    return [x + cos(a) * rr, y + sin(a) * rr];
  }, { width, wobble: 0.4, steps: n * 14 });
  p.circle(x, y, r * 0.62, { width: HAIR });
  p.blob(x, y, max(2, r * 0.16));
}

// A polyline with rounded elbows, as t in 0..1 -> [x, y] (elbows are quadratic
// curves, near enough a quarter circle).
function roundPoly(pts, rad) {
  const segs = [];
  let prev = pts[0];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    if (!c) { segs.push(['L', prev, b]); break; }
    const l1 = hypot(b[0] - a[0], b[1] - a[1]), l2 = hypot(c[0] - b[0], c[1] - b[1]);
    const r = min(rad, l1 / 2, l2 / 2);
    const p1 = [b[0] - (b[0] - a[0]) / l1 * r, b[1] - (b[1] - a[1]) / l1 * r];
    const p2 = [b[0] + (c[0] - b[0]) / l2 * r, b[1] + (c[1] - b[1]) / l2 * r];
    segs.push(['L', prev, p1], ['Q', p1, b, p2]);
    prev = p2;
  }
  const len = segs.map(([k, A, B, C]) => (k === 'L' ? hypot(B[0] - A[0], B[1] - A[1]) : hypot(C[0] - A[0], C[1] - A[1]) * 1.15));
  const tot = len.reduce((s, v) => s + v, 0) || 1;
  return (t) => {
    let d = t * tot, i = 0;
    while (i < segs.length - 1 && d > len[i]) { d -= len[i]; i++; }
    const u = min(1, d / (len[i] || 1)), [k, A, B, C] = segs[i];
    if (k === 'L') return [lerp(A[0], B[0], u), lerp(A[1], B[1], u)];
    return [(1 - u) ** 2 * A[0] + 2 * (1 - u) * u * B[0] + u * u * C[0], (1 - u) ** 2 * A[1] + 2 * (1 - u) * u * B[1] + u * u * C[1]];
  };
}

// A run of pipe: floor-black down its length first, so a pipe in front hides the
// one behind it, then its two walls.
function pipe(p, pts, w, rad = 16) {
  const C = roundPoly(pts, rad), c = p.c;
  c.save(); c.strokeStyle = '#000'; c.lineWidth = w + 2; c.lineJoin = 'round'; c.beginPath();
  for (let i = 0; i <= 160; i++) { const [x, y] = C(i / 160); i ? c.lineTo(x, y) : c.moveTo(x, y); }
  c.stroke(); c.restore();
  const side = (s) => (t) => {
    const [x, y] = C(t), [x2, y2] = C(min(1, t + 0.002)), [x1, y1] = C(max(0, t - 0.002));
    let nx = -(y2 - y1), ny = x2 - x1; const l = hypot(nx, ny) || 1;
    return [x + nx / l * s * w / 2, y + ny / l * s * w / 2];
  };
  p.path(side(1), { width: MAIN, wobble: 0.8 }); p.path(side(-1), { width: MAIN, wobble: 0.8 });
}

// A bird far off: a V of two wings, each tip rolling into a curl.
function bird(p, x, y, s) {
  p.tendril(x, y, -PI + 0.45, s, s * 0.28, { dir: -1, bend: -0.25, width: FINE, turns: 1.2 });
  p.tendril(x, y, -0.45, s, s * 0.28, { dir: 1, bend: 0.25, width: FINE, turns: 1.2 });
}

// The water organ's front, after his concept drawing: a pointed arch, the rose
// window, three great spirals, an arcade of round arches, a ledge, the pipes with
// spirals on top. Water runs through it when `water` is set.
function organFront(p, W, H, { water = true, t = 0 } = {}) {
  const cx = W / 2, base = H * 0.985, hw = min(W * 0.43, 172);
  gothic(p, cx, base, hw, H * 0.55, H * 0.42, { width: MAIN * 1.3 });
  gothic(p, cx, base, hw - 10, H * 0.55, H * 0.4, { width: FINE });
  roseWindow(p, cx, H * 0.3, H * 0.17, { spokes: 16, ring: 12 });
  for (const [dx, dy] of [[-0.24, 0.53], [0, 0.56], [0.24, 0.53]]) {
    const x = cx + dx * W, y = H * dy;
    p.circle(x, y, H * 0.065, { width: MAIN });
    p.spiral(x, y, H * 0.05, { dir: dx < 0 ? 1 : -1, start: -PI / 2, width: FINE * 1.2, turns: 2 });
  }
  const ay = H * 0.76;
  for (let i = 0; i < 5; i++) roundArch(p, cx - hw * 0.8 + i * hw * 0.4, ay, hw * 0.15, H * 0.1, { width: FINE * 1.3 });
  p.line(cx - hw, ay + 2, cx + hw, ay + 2, { width: MAIN }); p.line(cx - hw, ay + 12, cx + hw, ay + 12, { width: FINE });
  organPipes(p, cx - hw + 12, cx + hw - 12, base, H * 0.2, 11, { hMin: H * 0.12, water, phase: t * 2 });
  if (water) {
    ripples(p, cx - hw + 6, cx + hw - 6, ay + 7, { n: 1, amp: 1.6, waves: 12, phase: t * PI });
    waterfall(p, cx, H * 0.47, H * 0.53 - H * 0.07, { n: 2, gap: 6, amp: 1.5, phase: t * 2 });
    waterfall(p, cx - W * 0.12, H * 0.44, ay - H * 0.1, { n: 1, amp: 2, phase: t * 2 });
    waterfall(p, cx + W * 0.12, H * 0.44, ay - H * 0.1, { n: 1, amp: 2, phase: t * 2 + 1 });
  }
}

// ---------------------------------------------------------------------------
// For the bosses

// A ring of the whirlwind: jagged (sour) or a smooth open ellipse rolling into a
// curl at its end (resolved).
function whorl(p, x, y, rx, ry, { jag = true, a0 = 0, span = TAU * 0.86, width = MAIN, dir = 1 } = {}) {
  const tri = (u) => { const f = frac(u); return f < 0.5 ? f * 2 : 2 - f * 2; };
  if (jag) {
    p.path(t => { const a = a0 + dir * t * span, k = 1 + 0.16 * (tri(t * 11) - 0.5); return [x + cos(a) * rx * k, y + sin(a) * ry * k]; }, { width, wobble: 0.5, steps: 90 });
    return;
  }
  const a1 = a0 + dir * span;
  p.path(t => { const a = a0 + dir * t * span; return [x + cos(a) * rx, y + sin(a) * ry]; }, { width, wobble: 0.8 });
  const ex = x + cos(a1) * rx, ey = y + sin(a1) * ry, ang = atan2(dir * cos(a1) * ry, -dir * sin(a1) * rx);
  p.curlAt(ex, ey, ang, max(5, ry * 0.5), { dir, width: FINE, turns: 1.5 });
}

// A torn page of music, tilted: staff lines, a note, and one ragged edge; or,
// resolved, a page whose corner rolls over into a curl.
function page(p, x, y, w, h, rot, { torn = true } = {}) {
  p.push(x, y, rot, 1);
  if (torn) {
    p.pline([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2 - 6, -h / 6], [w / 2 + 4, 0], [w / 2 - 5, h / 5], [w / 2 + 3, h / 2], [-w / 2, h / 2]], { closed: true, width: FINE * 1.3 });
  } else {
    p.pline([[w / 2 - 12, -h / 2], [-w / 2, -h / 2], [-w / 2, h / 2], [w / 2, h / 2], [w / 2, -h / 2 + 12]], { width: FINE * 1.3 });
    p.curlAt(w / 2, -h / 2 + 12, -PI / 2 - 0.3, 7, { dir: -1, width: FINE * 1.2, turns: 1.4 });
  }
  const st = [];
  for (let i = 0; i < 4; i++) st.push([-w / 2 + 5, -h / 4 + i * h / 7, w / 2 - 8, -h / 4 + i * h / 7]);
  p.marks(st, { width: HAIR });
  p.blob(-w * 0.1, -h / 4 + 2 * h / 7, 4, 3, -0.4);
  p.pop();
}

// An open mouth with jagged teeth (sour), or a closed smile (resolved).
function mouth(p, x, y, r, open = true) {
  if (!open) { p.arc(x, y - r * 0.6, r, PI * 0.2, PI * 0.8, { width: FINE * 1.4 }); return; }
  p.ell(x, y, r, r * 0.62, { width: FINE * 1.4 });
  const t = [], b = [];
  for (let i = 0; i <= 6; i++) { const u = -0.8 + i * 1.6 / 6, yy = r * 0.62 * Math.sqrt(1 - u * u); t.push([x + u * r, y - yy * (i % 2 ? 0.25 : 0.9)]); b.push([x + u * r, y + yy * (i % 2 ? 0.25 : 0.9)]); }
  p.pline(t, { width: HAIR }); p.pline(b, { width: HAIR });
}

// A small eighth note, for music rising: a solid head, a stem, a flag that curls.
function note(p, x, y, s = 1) {
  p.blob(x, y, 6 * s, 4.5 * s, -0.4);
  p.line(x + 5.2 * s, y - 1, x + 5.2 * s, y - 26 * s, { width: FINE, wobble: 0.2 });
  p.curlAt(x + 5.2 * s, y - 26 * s, 0.6, 5 * s, { dir: 1, width: FINE, turns: 1.2 });
}

// The judge: a tuba bell for a head, rolls of curls down its sides like a wig, a
// tuba's coil on top; the robe; the gavel raised, the scales held out. Resolved,
// it sits, the gavel turned to a baton, the scales level.
function adjudicator(p, W, H, res) {
  const cx = W / 2, hy = res ? H * 0.34 : H * 0.3, sh = res ? H * 0.5 : H * 0.46;
  // the eyes of the critics, in the dark round it
  for (const [x, y, s] of [[0.07, 0.12, 9], [0.92, 0.1, 8], [0.95, 0.66, 10], [0.06, 0.6, 8], [0.84, 0.86, 7], [0.13, 0.86, 9]]) {
    const ex = W * x, ey = H * y;
    eye(p, ex - s * 1.3, ey, s, { shut: res, look: x < 0.5 ? 1 : -1 }); eye(p, ex + s * 1.3, ey, s, { shut: res, look: x < 0.5 ? 1 : -1 });
    if (!res) p.marks([[ex - s * 2.6, ey - s * 1.4, ex - s * 0.4, ey - s * 0.6], [ex + s * 2.6, ey - s * 1.4, ex + s * 0.4, ey - s * 0.6]], { width: FINE });
  }
  // the robe, and, sitting, the chair behind it
  if (res) {
    for (const k of [-1, 1]) { p.line(cx + k * 118, H * 0.98, cx + k * 112, H * 0.32, { width: MAIN }); p.tendril(cx + k * 112, H * 0.32, -PI / 2 - k * 0.4, 14, 9, { dir: -k, width: FINE * 1.3 }); }
    p.curve([[cx - 72, sh], [cx - 96, H * 0.66], [cx - 120, H * 0.72], [cx + 120, H * 0.72], [cx + 96, H * 0.66], [cx + 72, sh]], { width: MAIN * 1.3 });
    p.line(cx - 104, H * 0.72, cx - 110, H * 0.96, { width: MAIN }); p.line(cx + 104, H * 0.72, cx + 110, H * 0.96, { width: MAIN });
    p.curve([[cx - 40, H * 0.72], [cx - 44, H * 0.86], [cx - 30, H * 0.96]], { width: FINE }); p.curve([[cx + 40, H * 0.72], [cx + 44, H * 0.86], [cx + 30, H * 0.96]], { width: FINE });
  } else {
    p.line(cx - 72, sh, cx - 136, H + 6, { width: MAIN * 1.3 }); p.line(cx + 72, sh, cx + 136, H + 6, { width: MAIN * 1.3 });
    for (const dx of [-40, 0, 40]) p.curve([[cx + dx * 0.5, sh + 40], [cx + dx * 0.9, H * 0.7], [cx + dx * 1.3, H + 6]], { width: FINE });
  }
  p.line(cx - 72, sh, cx + 72, sh, { width: MAIN });
  p.box(cx - 13, sh, 11, 30, { width: FINE, overshoot: 0 }); p.box(cx + 2, sh, 11, 30, { width: FINE, overshoot: 0 });
  // the head: a tuba bell, mouth to us, curls down both sides, the coil on top
  // the bell's flare narrowing behind the rim up into the tubing, which coils over
  p.curve([[cx - 56, hy - 38], [cx - 30, hy - 66], [cx - 9, hy - 84]], { width: MAIN });
  p.curve([[cx + 56, hy - 38], [cx + 30, hy - 66], [cx + 9, hy - 84]], { width: MAIN });
  p.tube([[cx, hy - 84], [cx + 6, hy - 102], [cx + 36, hy - 110], [cx + 40, hy - 86], [cx + 62, hy - 74]], 16, { width: FINE * 1.3 });
  p.maskEll(cx, hy, 72, 60);
  p.ell(cx, hy, 72, 60, { width: MAIN * 1.5 });
  p.ell(cx, hy + 4, 58, 47, { width: HAIR });
  for (const k of [-1, 1]) for (let i = 0; i < 3; i++) {
    p.spiral(cx + k * (80 - i * 3), hy + 2 + i * 32, 13, { dir: k, start: k > 0 ? -PI / 2 : -PI / 2, width: FINE * 1.3, turns: 1.6 });
  }
  if (res) {
    p.arc(cx - 22, hy - 4, 10, PI * 0.15, PI * 0.85, { width: FINE * 1.4 }); p.arc(cx + 22, hy - 4, 10, PI * 0.15, PI * 0.85, { width: FINE * 1.4 });
    p.arc(cx, hy + 12, 16, PI * 0.25, PI * 0.75, { width: FINE * 1.4 });
  } else {
    p.marks([[cx - 38, hy - 22, cx - 10, hy - 10], [cx + 38, hy - 22, cx + 10, hy - 10]], { width: MAIN });
    p.blob(cx - 22, hy - 4, 6, 3); p.blob(cx + 22, hy - 4, 6, 3);
    p.path(u => [cx - 20 + u * 40, hy + 26 + sin(u * PI) * -5], { width: FINE * 1.4 });
  }
  if (res) {
    // the gavel has become a baton, held lightly; the scales hang level
    p.curve([[cx - 72, sh + 6], [cx - 108, H * 0.56], [cx - 84, H * 0.62]], { width: MAIN });
    p.circle(cx - 82, H * 0.62, 8, { width: FINE * 1.3 });
    p.line(cx - 78, H * 0.6, cx - 16, H * 0.48, { width: FINE });
    p.curve([[cx + 72, sh + 6], [cx + 110, H * 0.56], [cx + 140, H * 0.58]], { width: MAIN });
    scales(p, cx + 148, H * 0.58, 0);
  } else {
    // the gavel raised high; the scales held out, tipped
    p.curve([[cx - 72, sh + 6], [cx - 130, H * 0.36], [cx - 150, H * 0.22]], { width: MAIN });
    p.circle(cx - 150, H * 0.21, 9, { width: FINE * 1.3 });
    p.line(cx - 154, H * 0.19, cx - 110, H * 0.11, { width: MAIN });
    p.push(cx - 104, H * 0.105, -0.5, 1);
    p.pline([[-12, -18], [12, -18], [12, 18], [-12, 18]], { closed: true, width: MAIN }); p.marks([[-12, -9, 12, -9], [-12, 9, 12, 9]], { width: FINE });
    p.pop();
    p.curve([[cx + 72, sh + 6], [cx + 116, H * 0.48], [cx + 150, H * 0.5]], { width: MAIN });
    scales(p, cx + 156, H * 0.5, 0.28);
  }
}

// Scales held from a hand at (x, y): a stem, a beam tipped by `tip`, two pans.
function scales(p, x, y, tip) {
  p.line(x, y, x, y - 78, { width: FINE * 1.3 });
  p.tendril(x, y - 78, -PI / 2, 6, 6, { dir: 1, width: FINE });
  const L = 46, bx = cos(tip) * L, by = sin(tip) * L, top = y - 70;
  p.line(x - bx, top - by, x + bx, top + by, { width: MAIN });
  for (const k of [-1, 1]) {
    const px = x + k * bx, py = top + k * by;
    p.marks([[px, py, px - 14, py + 44], [px, py, px + 14, py + 44]], { width: HAIR });
    p.arc(px, py + 44, 16, 0, PI, { width: FINE * 1.3 }); p.line(px - 16, py + 44, px + 16, py + 44, { width: FINE });
  }
}

// ---------------------------------------------------------------------------
// Emblems for the title cards

// A round medallion for an area's title card: a ring, beads, sprigs at its foot, a
// glint on top, and the family's instrument inside, drawn by `inner(cx, cy, r)`.
function medallion(p, W, H, inner) {
  const cx = W / 2, cy = H * 0.48, R = min(W, H) * 0.4;
  p.circle(cx, cy, R, { width: MAIN * 1.4 });
  p.circle(cx, cy, R - 14, { width: FINE });
  const beads = [];
  for (let i = 0; i < 28; i++) { const a = i * TAU / 28; beads.push([cx + cos(a) * (R - 7), cy + sin(a) * (R - 7), 2.2]); }
  p.dots(beads);
  p.tendril(cx - 8, cy + R, PI - 0.5, R * 0.3, R * 0.09, { dir: 1, width: FINE * 1.3 });
  p.tendril(cx + 8, cy + R, 0.5, R * 0.3, R * 0.09, { dir: -1, width: FINE * 1.3 });
  sparkle(p, cx, cy - R, R * 0.09);
  inner(cx, cy, R - 24);
}

const EMBLEMS = {
  wood: (p, cx, cy, r) => curlTree(p, cx, cy + r * 0.82, r * 1.55, { depth: 2, trunk: MAIN * 1.3, R: rng('emblem.wood') }),
  woodwind: (p, cx, cy, r) => {
    p.push(cx, cy, -0.6, 1);
    p.tube([[-r * 0.9, 0], [r * 0.9, 0]], 22, { width: MAIN * 1.2 });
    p.line(-r * 0.9, -11, -r * 0.9, 11, { width: MAIN }); p.line(r * 0.9, -11, r * 0.9, 11, { width: MAIN });
    p.ell(-r * 0.6, -3, 12, 6, { width: FINE * 1.2 });
    const d = []; for (let i = 0; i < 5; i++) d.push([-r * 0.15 + i * r * 0.18, 0, 4]);
    p.dots(d);
    p.pop();
    // its breath, curling away from the far end
    p.tendril(cx + cos(-0.6) * r * 0.9, cy + sin(-0.6) * r * 0.9 + 18, 0.6, r * 0.25, r * 0.12, { dir: 1, width: FINE * 1.3 });
    p.tendril(cx - r * 0.2, cy + r * 0.5, 0.1, r * 0.5, r * 0.14, { dir: -1, width: FINE * 1.3 });
  },
  brass: (p, cx, cy, r) => {
    hornBell(p, cx - r * 0.72, cy + r * 0.08, r * 0.55, r * 0.9, { curls: 2, width: MAIN * 1.2 });
    p.tube([[cx + r * 0.18, cy + r * 0.08], [cx + r * 0.5, cy + r * 0.04], [cx + r * 0.6, cy - r * 0.32], [cx + r * 0.25, cy - r * 0.5], [cx, cy - r * 0.3], [cx + r * 0.3, cy - r * 0.18], [cx + r * 0.7, cy - r * 0.2]], r * 0.12, { width: FINE * 1.3 });
    p.line(cx + r * 0.76, cy - r * 0.3, cx + r * 0.76, cy - r * 0.1, { width: MAIN * 1.4 });
  },
  strings: (p, cx, cy, r) => {
    fiddle(p, cx - r * 0.05, cy + r * 0.18, r * 1.05, { rot: 0.32, strings: 'taut', neck: 0.7, width: MAIN * 1.2 });
    p.line(cx - r * 0.8, cy + r * 0.3, cx + r * 0.75, cy - r * 0.6, { width: FINE * 1.4 });
    p.spiral(cx - r * 0.72, cy + r * 0.34, 8, { dir: 1, width: FINE * 1.2 });
  },
  percussion: (p, cx, cy, r) => {
    drum3(p, cx, cy, r * 0.62, r * 0.2, r * 0.56, { width: MAIN * 1.3, rods: 8 });
    for (const k of [-1, 1]) { p.line(cx + k * r * 0.7, cy - r * 0.72, cx - k * r * 0.12, cy - r * 0.06, { width: MAIN }); p.blob(cx + k * r * 0.72, cy - r * 0.74, 7); }
  },
  organ: (p, cx, cy, r) => {
    organPipes(p, cx - r * 0.78, cx + r * 0.78, cy + r * 0.62, r * 1.3, 7, { hMin: r * 0.7 });
    p.line(cx - r * 0.86, cy + r * 0.62, cx + r * 0.86, cy + r * 0.62, { width: MAIN * 1.2 });
  },
  keys: (p, cx, cy, r) => {
    const x0 = cx - r * 0.68, x1 = cx + r * 0.68, y0 = cy - r * 0.34, y1 = cy + r * 0.38, n = 7, kw = (x1 - x0) / n;
    p.box(x0, y0, x1 - x0, y1 - y0, { width: MAIN * 1.2, overshoot: 2 });
    const sep = []; for (let i = 1; i < n; i++) sep.push([x0 + i * kw, y0, x0 + i * kw, y1]);
    p.marks(sep, { width: FINE });
    for (const i of [1, 2, 4, 5, 6]) { const x = x0 + i * kw; p.fill([[x - kw * 0.3, y0], [x + kw * 0.3, y0], [x + kw * 0.3, y0 + (y1 - y0) * 0.58], [x - kw * 0.3, y0 + (y1 - y0) * 0.58]]); }
    p.tendril(x1, y0, -PI / 2 + 0.3, r * 0.3, r * 0.12, { dir: 1, width: FINE * 1.3 });
    p.tendril(x0, y0, -PI / 2 - 0.3, r * 0.3, r * 0.12, { dir: -1, width: FINE * 1.3 });
  },
};

// ---------------------------------------------------------------------------
// The sketches

export const SKETCHES = {
  // ---- scenes ----------------------------------------------------------------
  'sky': (p, W, H, o) => {
    const R = p.L;
    moon(p, W * 0.74, H * 0.24, 46);
    stars(p, scatter(R, 26, 10, 10, W - 10, H * 0.72, 2.5, 5).filter(([x, y]) => hypot(x - W * 0.74, y - H * 0.24) > 70));
    sparkle(p, W * 0.2, H * 0.16, 11); sparkle(p, W * 0.52, H * 0.1, 8); sparkle(p, W * 0.9, H * 0.55, 7);
    // clouds drift right, the far ones dim and slower
    const t = o.t ?? 0, span = W + 260;
    const cl = [[0.12, 0.44, 40, 3, true], [0.62, 0.64, 34, 2.2, true], [0.28, 0.82, 72, 5, false], [0.86, 0.95, 84, 6.5, false]];
    for (const [fx, fy, s, v, far] of cl) {
      const x = ((fx * span + t * v) % span + span) % span - 130;
      if (far) p.dim(() => cloud(p, x, H * fy, s)); else cloud(p, x, H * fy, s, { width: MAIN });
    }
  },

  'fall': (p, W, H, o) => {
    const t = o.t ?? 0, R = p.L;
    // speed lines and clouds stream upward past him
    const segs = [];
    for (let i = 0; i < 14; i++) {
      const x = 20 + R() * (W - 40), len = 30 + R() * 60, y = (((R() * (H + 200) - t * 90) % (H + 200)) + H + 200) % (H + 200) - 100;
      segs.push([x, y, x, y + len]);
    }
    p.dim(() => p.marks(segs, { width: FINE }));
    for (const [fx, fy, s, f] of [[0.18, 0.2, 40, false], [0.82, 0.55, 46, true], [0.25, 0.95, 52, false]]) {
      const y = ((fy * (H + 240) - t * 60) % (H + 240) + H + 240) % (H + 240) - 120;
      cloud(p, W * fx, y, s, { flip: f });
    }
    coda(p, W * 0.36, H * 0.48, 175, { pose: 'fall', rot: t * PI / 2, centre: true, weight: 1.2 });
    const ka = 0.35 + sin(t * PI / 2) * 0.12;
    theKey(p, W * 0.74, H * 0.7, 190, { rot: ka, weight: 1.3 });
    const g = 9 + abs(sin(t * PI)) * 7;
    sparkle(p, W * 0.74 + sin(ka) * 150, H * 0.7 - cos(ka) * 150, g);
    sparkle(p, W * 0.66, H * 0.36, g * 0.6);
  },

  'castle-far': (p, W, H, o) => {
    const R = p.L;
    p.dim(() => {
      stars(p, scatter(R, 12, 10, 10, W - 10, 140, 2, 4));
      cloud(p, W * 0.7, 78, 40);
    });
    moon(p, 66, 72, 30);
    castleOnCliff(p, W, H, { restored: false });
    curlTree(p, 22, 284, 104, { depth: 2, trunk: MAIN, roots: false });
    curlTree(p, 64, 282, 74, { depth: 1, trunk: FINE * 1.3, roots: false });
    curlTree(p, -6, 286, 70, { depth: 1, trunk: FINE * 1.3, roots: false });
  },

  'crash': (p, W, H) => {
    const R = p.L, cx = W / 2, cy = H * 0.72, rx = min(W * 0.4, 158), ry = 42;
    p.dim(() => {
      groundLine(p, W, H * 0.47, { amp: 3, width: FINE });
      for (let i = 0; i < 6; i++) curlTree(p, 28 + i * (W - 56) / 5, H * 0.47, 50 + R() * 24, { depth: 1, roots: false, trunk: FINE, lean: (i - 2.5) * 0.07 });
      p.path(t => [cx + 20 + sin(t * 7) * 10 * t, lerp(cy - 20, H * 0.12, t)], { width: FINE, wobble: 2 });
    });
    // the trees nearest the impact are bent outward, away from it
    curlTree(p, cx - rx - 16, cy - 2, 200, { lean: -0.62, depth: 2 });
    curlTree(p, cx + rx + 16, cy - 2, 210, { lean: 0.62, depth: 2, flip: true });
    curlTree(p, cx - rx * 0.52, cy - ry - 14, 112, { lean: -0.42, depth: 2, roots: false });
    curlTree(p, cx + rx * 0.56, cy - ry - 16, 106, { lean: 0.45, depth: 2, flip: true, roots: false });
    // impact lines thrown out from the rim
    const segs = [];
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU + R() * 0.15, r0 = 1.12 + R() * 0.08, r1 = r0 + 0.18 + R() * 0.22;
      segs.push([cx + cos(a) * rx * r0, cy + sin(a) * ry * r0 * 1.3, cx + cos(a) * rx * r1, cy + sin(a) * ry * r1 * 1.4]);
    }
    p.marks(segs, { width: FINE });
    // the crater: a lumpy rim, the far wall inside it
    const rim = [];
    for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU, k = 1 + (R() - 0.5) * 0.12; rim.push([cx + cos(a) * rx * k, cy + sin(a) * ry * k]); }
    p.curve(rim, { closed: true, width: MAIN * 1.2 });
    p.ell(cx, cy + 6, rx * 0.74, ry * 0.58, { a0: PI + 0.15, a1: TAU - 0.15, width: FINE });
    // dust rolling up off the rim in curls
    for (const [dx, s, h] of [[-0.86, -1, 46], [-0.4, 1, 34], [0.42, -1, 38], [0.88, 1, 50]]) {
      p.tendril(cx + dx * rx, cy - ry * 0.55 * (1 - abs(dx) * 0.5), -PI / 2 + s * 0.35, h, h * 0.28, { dir: s, bend: 0.3 * s, width: FINE });
    }
    // Coda flat on his back in the middle of it, seeing stars
    coda(p, cx + 14, cy - 6, 118, { pose: 'fall', rot: -PI / 2 + 0.12, centre: true });
    sparkle(p, cx - 78, cy - 58, 10); sparkle(p, cx - 44, cy - 76, 7); sparkle(p, cx - 100, cy - 30, 6);
  },

  'wood': (p, W, H) => {
    const hz = H * 0.56;
    p.dim(() => {
      for (const [x, h] of [[24, 60], [70, 74], [118, 56], [272, 64], [318, 78], [372, 58]]) curlTree(p, x * W / 400, hz, h, { depth: 1, roots: false, trunk: FINE });
    });
    // the path winds away into the trees
    p.curve([[W * 0.24, H + 6], [W * 0.37, H * 0.85], [W * 0.43, H * 0.73], [W * 0.38, H * 0.64], [W * 0.47, hz + 2]], { width: MAIN });
    p.curve([[W * 0.8, H + 6], [W * 0.65, H * 0.85], [W * 0.59, H * 0.73], [W * 0.6, H * 0.64], [W * 0.53, hz + 2]], { width: MAIN });
    // middle-distance trees either side of it
    curlTree(p, W * 0.25, H * 0.68, 132, { depth: 2 });
    curlTree(p, W * 0.77, H * 0.66, 142, { depth: 2, flip: true });
    // the big trees that frame the clearing
    curlTree(p, W * 0.06, H + 4, 400, { depth: 2, lean: 0.12, trunk: MAIN * 1.5, spread: 0.7 });
    curlTree(p, W * 0.95, H + 4, 370, { depth: 2, lean: -0.12, flip: true, trunk: MAIN * 1.5, spread: 0.7 });
    // ferns, fiddleheads unrolling by the path
    for (const [x, y, h, s] of [[0.19, 0.87, 30, -1], [0.23, 0.9, 22, 1], [0.29, 0.98, 38, -1], [0.85, 0.91, 30, 1], [0.8, 0.94, 22, -1], [0.9, 0.99, 36, 1], [0.5, 0.62, 16, -1], [0.52, 0.63, 12, 1]]) fern(p, W * x, H * y, h, s);
    const grass = [];
    for (const [x, y] of [[0.34, 0.95], [0.66, 0.8], [0.12, 0.74], [0.9, 0.76], [0.45, 0.7]]) grass.push([W * x, H * y, W * x - 3, H * y - 9], [W * x + 3, H * y, W * x + 5, H * y - 8]);
    p.marks(grass, { width: FINE });
  },

  'key-found': (p, W, H) => {
    const R = p.L, gy = H * 0.64;
    const ground = [[-10, gy + 4], [W * 0.18, gy - 3], [W * 0.36, gy + 3], [W * 0.5, gy - 5], [W * 0.66, gy + 1], [W * 0.84, gy - 2], [W + 10, gy + 3]];
    const kx = W * 0.3, ky = H * 0.98, kr = 0.2, ks = H * 0.86, k = ks / 100;
    const KP = (lx, ly) => [kx + (lx * cos(kr) - ly * sin(kr)) * k, ky + (lx * sin(kr) + ly * cos(kr)) * k];
    // the Key, the top of it out of the earth, leaning toward the hand
    p.clip([[-10, -10], [W + 10, -10], ...ground.slice().reverse()]);
    theKey(p, kx, ky, ks, { rot: kr, weight: 1.6 });
    p.pop();
    p.curve(ground, { width: MAIN * 1.3 });
    // earth heaped where it went in, pebbles and roots below
    const [ex, ey] = KP(0, -44);
    p.arc(ex - 26, gy + 1, 16, PI * 1.1, PI * 1.9, { width: FINE * 1.2 });
    p.arc(ex + 28, gy, 14, PI * 1.1, PI * 1.9, { width: FINE * 1.2 });
    p.dim(() => {
      for (const [x, y, r] of scatter(R, 9, 20, gy + 26, W - 20, H - 14, 4, 9)) p.ell(x, y, r, r * 0.6, { width: FINE, wobble: 0.5 });
      p.tendril(W * 0.6, gy + 6, PI * 0.6, 70, 10, { dir: 1, width: FINE });
      p.tendril(W * 0.12, gy + 4, PI * 0.35, 56, 8, { dir: -1, width: FINE });
    });
    // grass curls along the ground line
    for (const [x, s] of [[0.1, -1], [0.14, 1], [0.6, -1], [0.92, 1]]) p.tendril(W * x, gy - 1, -PI / 2 + s * 0.4, 18, 5, { dir: s, width: FINE, turns: 1.2 });
    // it glints
    for (const [lx, ly, r] of [[-30, -96, 15], [14, -80, 10], [-14, -60, 8]]) { const [sx, sy] = KP(lx, ly); sparkle(p, sx, sy, r); }
    // a small hand reaches in from the edge: a coat cuff, the fingers out toward it
    const hx = W * 0.77, hy = H * 0.36;
    p.line(W + 6, hy - 22, hx + 44, hy - 18, { width: MAIN }); p.line(W + 6, hy + 26, hx + 44, hy + 22, { width: MAIN });
    p.curve([[hx + 44, hy - 24], [hx + 38, hy], [hx + 44, hy + 27]], { width: MAIN });
    p.curve([[hx + 36, hy - 21], [hx + 31, hy], [hx + 36, hy + 24]], { width: MAIN });
    p.curve([[hx + 32, hy - 17], [hx + 14, hy - 18], [hx, hy - 14], [hx - 16, hy - 12], [hx - 21, hy - 7], [hx - 16, hy - 3], [hx, hy - 4]], { width: MAIN });
    p.curve([[hx + 2, hy - 4], [hx - 18, hy], [hx - 22, hy + 5], [hx - 17, hy + 9], [hx + 1, hy + 6]], { width: MAIN });
    p.curve([[hx + 3, hy + 6], [hx - 12, hy + 11], [hx - 14, hy + 16], [hx - 8, hy + 18], [hx + 8, hy + 16], [hx + 32, hy + 18]], { width: MAIN });
    p.curve([[hx + 12, hy - 15], [hx + 4, hy - 26], [hx - 4, hy - 30], [hx - 8, hy - 26], [hx + 1, hy - 16]], { width: MAIN });
  },

  'workshop-ruin': (p, W, H) => {
    const R = p.L, fl = H * 0.74;
    // the room: floor, the back wall's corners, its top broken open to the sky
    p.line(-10, fl, W + 10, fl, { width: MAIN });
    p.line(W * 0.08, fl, W * 0.08, H * 0.3, { width: MAIN }); p.line(W * 0.92, fl, W * 0.92, H * 0.36, { width: MAIN });
    p.pline([[W * 0.08, H * 0.3], [W * 0.17, H * 0.25], [W * 0.22, H * 0.33], [W * 0.3, H * 0.22], [W * 0.4, H * 0.3], [W * 0.47, H * 0.18], [W * 0.55, H * 0.27], [W * 0.66, H * 0.2], [W * 0.74, H * 0.31], [W * 0.84, H * 0.26], [W * 0.92, H * 0.36]], { width: MAIN });
    p.dim(() => {
      stars(p, [[W * 0.3, H * 0.1, 4], [W * 0.52, H * 0.06, 3], [W * 0.7, H * 0.12, 4], [W * 0.86, H * 0.08, 3], [W * 0.14, H * 0.12, 3]]);
      p.pline([[W * 0.2, H * 0.4], [W * 0.24, H * 0.46], [W * 0.21, H * 0.52], [W * 0.25, H * 0.6]], { width: FINE });
      p.pline([[W * 0.8, H * 0.4], [W * 0.77, H * 0.47], [W * 0.81, H * 0.55]], { width: FINE });
    });
    moon(p, W * 0.6, H * 0.09, 14);
    // the broken window, its arch and its panes cracked
    roundArch(p, W * 0.73, H * 0.58, 30, 48, { width: FINE * 1.2 });
    p.pline([[W * 0.73 - 30, H * 0.47], [W * 0.73 - 8, H * 0.44], [W * 0.73 + 4, H * 0.5], [W * 0.73 + 30, H * 0.46]], { width: FINE });
    p.line(W * 0.73, H * 0.58, W * 0.73, H * 0.5, { width: FINE });
    // the workbench, still standing
    const bx0 = W * 0.26, bx1 = W * 0.66, by = H * 0.6;
    p.line(bx0 - 6, by, bx1 + 6, by, { width: MAIN }); p.line(bx0 - 6, by + 10, bx1 + 6, by + 10, { width: MAIN });
    p.marks([[bx0, by + 10, bx0 - 4, fl], [bx1, by + 10, bx1 + 4, fl], [bx0 + 14, by + 10, bx0 + 16, fl - 8], [bx1 - 14, by + 10, bx1 - 14, fl - 8]], { width: MAIN });
    p.line(bx0 + 2, fl - 26, bx1 - 2, fl - 26, { width: FINE });
    p.box(bx0 - 2, by - 18, 22, 18, { width: FINE });
    p.tendril(bx0 + 9, by - 18, -PI / 2, 10, 5, { dir: 1, width: FINE });
    // the roof beams that came down across it
    p.tube([[W * 0.02, H * 0.12], [W * 0.62, by - 7]], 15, { width: MAIN });
    p.tube([[W * 1.02, H * 0.26], [W * 0.84, H * 0.4]], 13, { width: MAIN });
    p.pline([[W * 0.835, H * 0.38], [W * 0.825, H * 0.41], [W * 0.84, H * 0.43], [W * 0.85, H * 0.415]], { width: FINE });
    p.tube([[W * 0.56, H * 0.97], [W * 0.98, H * 0.9]], 12, { width: MAIN });
    // what is left of the instruments, scattered on the floor
    hornBell(p, W * 0.12, H * 0.86, 22, 50, { curls: 0, width: FINE * 1.2 });
    p.ell(W * 0.8, H * 0.86, 34, 11, { width: FINE * 1.2 }); p.pline([[W * 0.8 - 20, H * 0.86], [W * 0.8 - 6, H * 0.84], [W * 0.8 + 2, H * 0.875], [W * 0.8 + 18, H * 0.85]], { width: FINE });
    fiddle(p, W * 0.47, H * 0.88, 52, { rot: 1.3, strings: 'slack', neck: 0.6, width: FINE * 1.2 });
    gear(p, W * 0.3, H * 0.93, 14, 9);
    gear(p, W * 0.62, H * 0.82, 10, 7);
    // and smoke still curling up off it
    p.tendril(W * 0.5, by - 2, -PI / 2 - 0.2, 60, 12, { dir: -1, bend: 0.3, width: FINE });
    p.tendril(W * 0.15, H * 0.82, -PI / 2 + 0.2, 70, 14, { dir: 1, bend: -0.3, width: FINE });
  },

  'workshop-before': (p, W, H) => {
    const fl = H * 0.8;
    // the room, whole: floor, walls, a rafter
    p.line(-10, fl, W + 10, fl, { width: MAIN });
    p.line(W * 0.04, fl, W * 0.04, H * 0.06, { width: MAIN }); p.line(W * 0.96, fl, W * 0.96, H * 0.06, { width: MAIN });
    p.line(-10, H * 0.06, W + 10, H * 0.06, { width: MAIN });
    // the window over his shoulder, curtains swagged back, a star or two
    const wx = W * 0.22, wy = H * 0.36;
    roundArch(p, wx, wy, 30, 46, { width: FINE * 1.3 });
    p.line(wx - 30, wy, wx + 30, wy, { width: FINE * 1.3 }); p.line(wx, wy, wx, wy - 76, { width: FINE });
    p.dim(() => stars(p, [[wx - 14, wy - 50, 3], [wx + 14, wy - 30, 3]]));
    for (const k of [-1, 1]) p.curve([[wx + k * 36, H * 0.1], [wx + k * 28, H * 0.22], [wx + k * 38, H * 0.27], [wx + k * 40, wy + 4]], { width: FINE });
    // shelves on scrolled brackets on the far wall, instruments along them
    for (const y of [H * 0.26, H * 0.44]) {
      p.line(W * 0.5, y, W * 0.92, y, { width: MAIN });
      p.tendril(W * 0.52, y + 2, PI / 2 + 0.2, 14, 6, { dir: 1, width: FINE });
      p.tendril(W * 0.9, y + 2, PI / 2 - 0.2, 14, 6, { dir: -1, width: FINE });
    }
    hornBell(p, W * 0.55, H * 0.19, 24, 52, { curls: 1, width: FINE * 1.3 });
    fiddle(p, W * 0.84, H * 0.175, 56, { rot: 0.15, strings: 'none', width: FINE * 1.2 });
    fiddle(p, W * 0.58, H * 0.36, 52, { rot: -0.3, strings: 'none', width: FINE * 1.2 });
    drum3(p, W * 0.74, H * 0.395, 22, 7, 18, { width: FINE * 1.3, rodW: HAIR, rods: 6 });
    hornBell(p, W * 0.84, H * 0.405, 14, 28, { curls: 0, width: FINE * 1.2 });
    // the lamp, hung from the rafter, glowing over the bench
    const lx = W * 0.6, ly = H * 0.53;
    p.line(lx, H * 0.06, lx, ly - 14, { width: FINE });
    p.arc(lx, ly - 2, 15, PI, TAU, { width: MAIN }); p.line(lx - 16, ly - 2, lx + 16, ly - 2, { width: FINE });
    p.ell(lx, ly + 5, 6, 8, { width: FINE });
    p.dim(() => { const r = []; for (let i = 0; i < 7; i++) { const a = PI * 0.1 + i * PI * 0.8 / 6; r.push([lx + cos(a) * 22, ly + 5 + sin(a) * 22, lx + cos(a) * 32, ly + 5 + sin(a) * 32]); } p.marks(r, { width: FINE }); });
    // the bench, the Key on it, and Coda at work
    const bx0 = W * 0.42, bx1 = W * 0.94, by = H * 0.66;
    p.line(bx0, by, bx1, by, { width: MAIN }); p.line(bx0, by + 9, bx1, by + 9, { width: MAIN });
    p.marks([[bx0 + 8, by + 9, bx0 + 6, fl], [bx1 - 8, by + 9, bx1 - 6, fl], [bx0 + 22, by + 9, bx0 + 22, fl - 8], [bx1 - 22, by + 9, bx1 - 22, fl - 8]], { width: MAIN });
    p.line(bx0 + 8, fl - 22, bx1 - 8, fl - 22, { width: FINE });
    theKey(p, W * 0.72, by - 6, 104, { rot: PI / 2, weight: 1.1 });
    sparkle(p, W * 0.69, by - 34, 9);
    p.line(W * 0.84, by - 3, W * 0.91, by - 3, { width: MAIN }); p.fill([[W * 0.895, by - 9], [W * 0.915, by - 9], [W * 0.915, by + 1], [W * 0.895, by + 1]]);
    coda(p, W * 0.3, fl, 140, { pose: 'tinker' });
  },

  'explosion': (p, W, H) => {
    const R = p.L, cx = W * 0.5, cy = H * 0.8;
    // radial lines out to the edges
    const segs = [];
    for (let i = 0; i < 20; i++) { const a = -PI + i * PI / 19 + (R() - 0.5) * 0.1; segs.push([cx + cos(a) * 150, cy + sin(a) * 130, cx + cos(a) * 320, cy + sin(a) * 300]); }
    p.dim(() => p.marks(segs, { width: FINE }));
    // the burst: a jagged star, a second inside it
    const star = (r0, r1, n, rot) => { const pts = []; for (let i = 0; i < n * 2; i++) { const a = rot + i * PI / n, r = (i % 2 ? r0 : r1) * (0.85 + R() * 0.3); pts.push([cx + cos(a) * r, cy + sin(a) * r * 0.85]); } return pts; };
    p.pline(star(62, 130, 9, -PI / 2), { closed: true, width: MAIN * 1.2 });
    p.pline(star(30, 66, 7, -PI / 2 + 0.2), { closed: true, width: FINE });
    // the bench at the heart of it, legs kicked out
    p.line(cx - 50, cy - 4, cx + 50, cy + 2, { width: MAIN });
    p.marks([[cx - 42, cy, cx - 62, cy + 40], [cx + 42, cy + 2, cx + 64, cy + 38]], { width: MAIN });
    // debris flung out in spirals: curls, a gear, a bell, planks
    for (const [a, len, s] of [[-2.7, 120, -1], [-2.2, 150, 1], [-1.75, 140, -1], [-1.3, 160, 1], [-0.85, 140, -1], [-0.45, 120, 1], [-3.0, 90, 1], [-0.1, 96, -1]]) {
      const x0 = cx + cos(a) * 70, y0 = cy + sin(a) * 60;
      p.tendril(x0, y0, a, len, 10 + R() * 6, { dir: s, bend: 0.25 * s, width: FINE });
    }
    gear(p, cx - 128, cy - 168, 13, 8);
    hornBell(p, cx + 112, cy - 196, 16, 30, { curls: 0, width: FINE });
    p.tube([[cx - 160, cy - 60], [cx - 128, cy - 84]], 8, { width: FINE });
    p.tube([[cx + 150, cy - 90], [cx + 176, cy - 60]], 8, { width: FINE });
    cloud(p, cx - 120, cy + 34, 48);
    cloud(p, cx + 120, cy + 40, 54, { flip: true });
    // and Coda, flung high, a small dark shape against it all
    const fx = W * 0.6, fy = H * 0.2;
    codaSilhouette(p, fx, fy, 64, 0.5);
    p.marks([[fx - 34, fy + 30, fx - 52, fy + 64], [fx - 20, fy + 38, fx - 32, fy + 74], [fx - 46, fy + 18, fx - 68, fy + 48]], { width: FINE });
  },

  'castle-gate': (p, W, H) => {
    const cx = W / 2, base = H * 0.86;
    // the steps
    p.line(W * 0.18, base, W * 0.82, base, { width: MAIN });
    p.line(W * 0.12, base + 18, W * 0.88, base + 18, { width: MAIN });
    p.line(W * 0.06, base + 36, W * 0.94, base + 36, { width: MAIN });
    p.marks([[W * 0.18, base, W * 0.12, base + 18], [W * 0.82, base, W * 0.88, base + 18], [W * 0.12, base + 18, W * 0.06, base + 36], [W * 0.88, base + 18, W * 0.94, base + 36]], { width: FINE });
    // stone round about, dim
    p.dim(() => {
      const b = [];
      for (const [x, y] of [[0.05, 0.3], [0.12, 0.45], [0.04, 0.6], [0.1, 0.75], [0.88, 0.62], [0.95, 0.47], [0.9, 0.78], [0.96, 0.32]]) b.push([W * x - 14, H * y, W * x + 14, H * y], [W * x, H * y, W * x, H * y + 14]);
      p.marks(b, { width: FINE });
    });
    // the arch: an outer and an inner pointed arch, voussoirs between
    const oh = 140, ih = 106;
    gothic(p, cx, base, oh, 160, 140, { width: MAIN * 1.2 });
    gothic(p, cx, base, ih, 150, 108, { width: MAIN });
    const vs = [];
    for (let i = 1; i < 8; i++) {
      const u = i / 8, a = u * PI / 2;
      for (const k of [-1, 1]) {
        const ox = cx + k * oh * cos(a) ** 0.8, oy = base - 160 - 140 * sin(a);
        const ix = cx + k * ih * cos(a) ** 0.8, iy = base - 150 - 108 * sin(a);
        vs.push([ox, oy, ix, iy]);
      }
    }
    p.marks(vs, { width: FINE });
    // the doors: the seam, the iron straps that end in great scrolls, two rings
    p.line(cx, base - 256, cx, base, { width: MAIN });
    for (const y of [base - 150, base - 60]) {
      p.tendril(cx - ih + 4, y, 0, ih * 0.62, 16, { dir: -1, bend: 0.04, width: MAIN });
      p.tendril(cx + ih - 4, y, PI, ih * 0.62, 16, { dir: 1, bend: 0.04, width: MAIN });
      p.tendril(cx - ih * 0.62, y, -PI / 2 + 0.4, 26, 8, { dir: 1, width: FINE });
      p.tendril(cx + ih * 0.62, y, -PI / 2 - 0.4, 26, 8, { dir: -1, width: FINE });
    }
    p.circle(cx - 14, base - 100, 10, { width: FINE * 1.2 }); p.circle(cx + 14, base - 100, 10, { width: FINE * 1.2 });
    p.dots([[cx - 14, base - 111, 3], [cx + 14, base - 111, 3]]);
    // a vine up the left of the arch
    const vine = [[cx - oh - 6, base], [cx - oh - 10, base - 80], [cx - oh + 2, base - 170], [cx - oh * 0.75, base - 240], [cx - oh * 0.4, base - 285]];
    p.curve(vine, { width: FINE * 1.2 });
    for (const [i, s] of [[0, -1], [1, 1], [2, -1], [3, 1]]) {
      const [x, y] = catmull(vine)(0.15 + i * 0.22);
      p.tendril(x, y, s < 0 ? PI + 0.6 : -0.3, 20, 7, { dir: s < 0 ? -1 : 1, width: FINE });
    }
    // the lantern on its scrolled bracket
    const lx = W * 0.86, ly = H * 0.42;
    p.tendril(W * 0.98, ly - 56, PI, W * 0.12, 8, { dir: -1, bend: -0.1, width: FINE * 1.3 });
    p.line(lx, ly - 52, lx, ly - 30, { width: FINE });
    p.pline([[lx - 14, ly - 18], [lx, ly - 32], [lx + 14, ly - 18]], { width: FINE * 1.2 });
    p.box(lx - 11, ly - 18, 22, 28, { width: FINE * 1.2, overshoot: 0 });
    p.marks([[lx, ly - 18, lx, ly + 10]], { width: HAIR });
    p.pline([[lx - 8, ly + 10], [lx, ly + 18], [lx + 8, ly + 10]], { width: FINE });
    p.blob(lx, ly - 3, 3, 5);
    p.dim(() => { const r = []; for (let i = 0; i < 8; i++) { const a = i * TAU / 8 + 0.2; r.push([lx + cos(a) * 24, ly - 4 + sin(a) * 26, lx + cos(a) * 34, ly - 4 + sin(a) * 36]); } p.marks(r, { width: FINE }); });
  },

  'castle-hall': (p, W, H) => {
    const R = p.L, cx = W / 2;
    // the far wall: the rose window high up, a door under it
    roseWindow(p, cx, H * 0.27, 46, { spokes: 10, ring: 8 });
    roundArch(p, cx, H * 0.66, 16, 40, { width: FINE });
    // the arcade, both sides, arches getting smaller toward the far wall
    for (const [x, base, hw, hs, rise] of [[0.14, 0.97, 44, 210, 86], [0.29, 0.82, 26, 140, 52], [0.37, 0.73, 16, 96, 34]]) {
      for (const k of [-1, 1]) gothic(p, cx + k * (cx - W * x), H * base, hw, hs, rise, { width: MAIN * (x < 0.2 ? 1.2 : 1) });
    }
    p.dim(() => {
      p.line(W * 0.2, H * 0.97, W * 0.4, H * 0.71, { width: FINE }); p.line(W * 0.8, H * 0.97, W * 0.6, H * 0.71, { width: FINE });
      p.line(W * 0.4, H * 0.71, W * 0.6, H * 0.71, { width: FINE });
    });
    // the floor broken through in front, cracks running from the hole
    const hole = [[cx - 52, H * 0.88], [cx - 30, H * 0.84], [cx - 8, H * 0.865], [cx + 14, H * 0.835], [cx + 44, H * 0.87], [cx + 34, H * 0.92], [cx + 6, H * 0.905], [cx - 22, H * 0.935]];
    p.pline(hole, { closed: true, width: MAIN });
    p.pline([[cx + 44, H * 0.87], [cx + 62, H * 0.86], [cx + 70, H * 0.9], [cx + 92, H * 0.89]], { width: FINE });
    p.pline([[cx - 52, H * 0.88], [cx - 70, H * 0.9], [cx - 82, H * 0.87], [cx - 104, H * 0.92]], { width: FINE });
    p.pline([[cx - 30, H * 0.84], [cx - 36, H * 0.8], [cx - 28, H * 0.77]], { width: FINE });
    // vines hanging from the near arches
    for (const [x, len, s] of [[0.09, 70, 1], [0.19, 46, -1], [0.81, 60, 1], [0.92, 84, -1]]) {
      p.tendril(W * x, H * 0.3, PI / 2 + s * 0.08, len, 8, { dir: s, bend: 0.2 * s, width: FINE });
    }
    // water trickling down from a crack, into a pool
    p.pline([[W * 0.72, H * 0.24], [W * 0.7, H * 0.28], [W * 0.73, H * 0.31]], { width: FINE });
    waterfall(p, W * 0.73, H * 0.31, H * 0.78, { n: 2, gap: 5, amp: 2 });
    p.ell(W * 0.73, H * 0.8, 26, 6, { width: FINE }); p.ell(W * 0.73, H * 0.8, 14, 3, { width: HAIR });
  },

  'ramparts': (p, W, H) => {
    const R = p.L;
    // wind across the sky, every gust ending in a curl
    for (const [y, x0, len, s] of [[0.1, -0.05, 0.5, 1], [0.22, 0.42, 0.44, -1], [0.34, 0.05, 0.36, 1], [0.44, 0.6, 0.3, -1]]) {
      p.tendril(W * x0, H * y, 0.02, W * len, 10, { dir: s, bend: 0.05 * s, width: FINE });
    }
    cloud(p, W * 0.24, H * 0.27, 44);
    p.dim(() => {
      cloud(p, W * 0.86, H * 0.08, 34);
      // a far tower along the wall
      const tx = W * 0.86;
      p.line(tx - 18, H * 0.6, tx - 18, H * 0.3, { width: FINE }); p.line(tx + 18, H * 0.6, tx + 18, H * 0.3, { width: FINE });
      p.pline([[tx - 22, H * 0.3], [tx - 22, H * 0.27], [tx - 12, H * 0.27], [tx - 12, H * 0.3], [tx - 4, H * 0.3], [tx - 4, H * 0.27], [tx + 4, H * 0.27], [tx + 4, H * 0.3], [tx + 12, H * 0.3], [tx + 12, H * 0.27], [tx + 22, H * 0.27], [tx + 22, H * 0.3]], { width: FINE });
    });
    // the battlements, big at the left and running away to the right
    const y = (x) => H * 0.62 + (x / W) * H * 0.06, pts = [[-10, y(-10)]];
    let x = -10, merlon = null;
    for (let i = 0; x < W + 10; i++) {
      const s = lerp(46, 24, x / W), up = i % 2 === 0;
      if (up && i === 6) merlon = [x + s / 2, y(x) - s * 0.8];
      pts.push([x, y(x) - (up ? s * 0.8 : 0)], [x + s, y(x + s) - (up ? s * 0.8 : 0)]);
      x += s;
    }
    p.pline(pts, { width: MAIN * 1.3 });
    p.line(-10, y(-10) + 20, W + 10, y(W + 10) + 14, { width: MAIN });
    p.dim(() => p.marks([[20, y(20) + 48, 100, y(100) + 48], [150, y(150) + 42, 230, y(230) + 42], [270, y(270) + 54, 350, y(350) + 54], [60, y(60) + 84, 140, y(140) + 84], [200, y(200) + 80, 290, y(290) + 80], [320, y(320) + 92, 400, y(400) + 92]], { width: FINE }));
    // a pole on a merlon, its swallow-tailed pennant streaming out in the wind
    const [px, py] = merlon, top = H * 0.2;
    p.line(px, py, px, top - 4, { width: MAIN });
    p.blob(px, top - 7, 4.5);
    const fl = [[px, top], [px + 50, top + 6], [px + 100, top - 2], [px + 150, top + 8]];
    const fb = [[px, top + 36], [px + 50, top + 40], [px + 100, top + 30], [px + 150, top + 34]];
    p.curve(fl, { width: FINE * 1.3 }); p.curve(fb, { width: FINE * 1.3 });
    p.pline([[px + 150, top + 8], [px + 122, top + 21], [px + 150, top + 34]], { width: FINE * 1.3 });
    p.curve([[px + 20, top + 12], [px + 60, top + 18], [px + 100, top + 14]], { width: HAIR });
    // reeds in the foreground, bending with it, cattails on some
    for (let i = 0; i < 8; i++) {
      const x0 = W * (0.03 + i * 0.05) + (R() - 0.5) * 6, h = H * (0.36 + R() * 0.16), bend = 34 + R() * 26;
      const tip = [x0 + bend, H - h], mid = [x0 + bend * 0.2, H - h * 0.55];
      p.curve([[x0, H + 6], mid, tip], { width: FINE * 1.2 });
      const a = atan2(tip[1] - mid[1], tip[0] - mid[0]);
      if (i % 3 !== 1) p.ell(tip[0] - cos(a) * 12, tip[1] - sin(a) * 12, 13, 4.5, { rot: a, width: FINE * 1.2 });
      else p.tendril(tip[0], tip[1], a, 6, 6, { dir: 1, width: FINE });
    }
    for (const x0 of [0.08, 0.3]) p.curve([[W * x0, H + 6], [W * x0 + 20, H * 0.8], [W * x0 + 62, H * 0.74]], { width: FINE });
  },

  'core': (p, W, H) => {
    // brass running everywhere: runs with rounded elbows, each masking what is behind
    const run = (pts, w) => pipe(p, pts, w, 18);
    run([[-20, H * 0.82], [W * 0.32, H * 0.82], [W * 0.32, H * 0.4], [W + 20, H * 0.4]], 22);
    run([[-20, H * 0.57], [W * 0.6, H * 0.57], [W * 0.6, H + 20]], 30);
    run([[-20, H * 0.22], [W + 20, H * 0.22]], 26);
    run([[W * 0.8, -20], [W * 0.8, H + 20]], 22);
    run([[W + 20, H * 0.76], [W * 0.9, H * 0.76], [W * 0.9, H + 20]], 16);
    // bands where the lengths join
    p.marks([[W * 0.12, H * 0.22 - 15, W * 0.12, H * 0.22 + 15], [W * 0.14, H * 0.22 - 15, W * 0.14, H * 0.22 + 15],
      [W * 0.8 - 13, H * 0.1, W * 0.8 + 13, H * 0.1], [W * 0.8 - 13, H * 0.12, W * 0.8 + 13, H * 0.12],
      [W * 0.16, H * 0.57 - 17, W * 0.16, H * 0.57 + 17], [W * 0.6 - 17, H * 0.82, W * 0.6 + 17, H * 0.82]], { width: FINE });
    // valve wheels standing on the pipes
    for (const [x, y] of [[W * 0.46, H * 0.22 - 13], [W * 0.18, H * 0.57 - 15]]) {
      p.line(x, y, x, y - 16, { width: MAIN });
      p.circle(x, y - 30, 15, { width: MAIN });
      p.marks([[x - 15, y - 30, x + 15, y - 30], [x, y - 45, x, y - 15]], { width: FINE });
      p.blob(x, y - 30, 3.5);
    }
    // a gauge on the upright
    p.circle(W * 0.8, H * 0.5, 17, { width: MAIN }); p.line(W * 0.8, H * 0.5, W * 0.8 + 10, H * 0.5 - 8, { width: FINE }); p.blob(W * 0.8, H * 0.5, 2.5);
    // gears turning in the gaps
    gear(p, W * 0.13, H * 0.39, 34, 14);
    gear(p, W * 0.255, H * 0.3, 18, 9);
    gear(p, W * 0.46, H * 0.72, 26, 12);
    gear(p, W * 0.13, H * 0.69, 22, 11);
    run([[W * 0.08, H + 20], [W * 0.08, H * 0.92], [W * 0.24, H * 0.92], [W * 0.24, H + 20]], 14);
    p.circle(W * 0.16, H * 0.92 - 22, 10, { width: FINE * 1.2 }); p.line(W * 0.16, H * 0.92 - 7, W * 0.16, H * 0.92 - 12, { width: FINE });
    // rivets, and the brass is alive: a couple of curls growing off it
    p.dots([[W * 0.05, H * 0.22 - 9], [W * 0.25, H * 0.22 - 9], [W * 0.65, H * 0.22 - 9], [W * 0.94, H * 0.22 - 9], [W * 0.05, H * 0.57 - 11], [W * 0.4, H * 0.57 - 11], [W * 0.8 - 7, H * 0.3], [W * 0.8 - 7, H * 0.68]], 2.5);
    p.tendril(W * 0.7, H * 0.4 - 11, -PI / 2 - 0.3, 26, 8, { dir: -1, width: FINE });
    p.tendril(W * 0.6 + 15, H * 0.92, 0.3, 22, 7, { dir: -1, width: FINE });
    p.tendril(W * 0.32 - 11, H * 0.64, PI + 0.3, 20, 6, { dir: 1, width: FINE });
  },

  'tower': (p, W, H) => {
    const cx = W * 0.5;
    // the tower wall, its stones curving round us, the newel up the middle
    p.curve([[W * 0.05, H + 6], [W * 0.04, H * 0.5], [W * 0.06, -6]], { width: MAIN });
    p.curve([[W * 0.95, H + 6], [W * 0.96, H * 0.5], [W * 0.94, -6]], { width: MAIN });
    p.dim(() => { for (const y of [0.18, 0.5, 0.82]) p.path(u => [lerp(W * 0.05, W * 0.95, u), H * y + sin(u * PI) * 18], { width: FINE }); });
    p.line(cx - 8, H + 6, cx - 8, -6, { width: FINE * 1.3 }); p.line(cx + 8, H + 6, cx + 8, -6, { width: FINE * 1.3 });
    // the stair winds up round it: treads, the underside, balusters and a rail;
    // the half nearest us white, the far half dim
    const R0 = W * 0.4, rise = H * 0.46, t0 = -PI * 0.15, t1 = PI * 3.15;
    const at = (th, dy = 0) => [cx + cos(th) * R0, H * 1.02 - (th - t0) / TAU * rise + sin(th) * 30 + dy];
    const front = (th) => sin(th) > 0;
    // split at the turning points so each piece is wholly near or far
    const cuts = [t0]; for (let k = 0; k * PI < t1; k++) if (k * PI > t0) cuts.push(k * PI); cuts.push(t1);
    for (let i = 0; i < cuts.length - 1; i++) {
      const a = cuts[i], b = cuts[i + 1], near = front((a + b) / 2);
      const draw = () => {
        p.path(u => at(lerp(a, b, u)), { width: near ? MAIN : FINE });
        p.path(u => at(lerp(a, b, u), 16), { width: near ? FINE * 1.2 : HAIR });
        p.path(u => at(lerp(a, b, u), -34), { width: near ? MAIN : FINE });
      };
      near ? draw() : p.dim(draw);
    }
    const tn = [], tf = [], bn = [], bf = [];
    for (let th = t0 + 0.2; th < t1; th += 0.36) {
      const [x, y] = at(th), ix = cx + cos(th) * 8;
      (front(th) ? tn : tf).push([ix, y - 1, x, y]);
      (front(th) ? bn : bf).push([x, y, x, y - 34]);
    }
    p.marks(tn, { width: FINE }); p.marks(bn, { width: FINE * 0.8 });
    p.dim(() => { p.marks(tf, { width: FINE }); p.marks(bf, { width: HAIR }); });
    const [rx, ry] = at(t0, -34);
    p.tendril(rx, ry, PI * 0.45, 14, 9, { dir: 1, width: FINE * 1.2 });
    // strings strung across like a harp, from a scrolled neck high on the wall
    const neck = [[W * 0.94, H * 0.16], [W * 0.78, H * 0.07], [W * 0.6, H * 0.08]];
    p.curve(neck, { width: MAIN });
    p.tendril(W * 0.6, H * 0.08, PI - 0.2, 8, 9, { dir: -1, width: FINE });
    const nc = catmull(neck), str = [], pegs = [];
    for (let i = 1; i <= 6; i++) { const [x0, y0] = nc(i / 7), y1 = H * 0.28 + i * 9; str.push([x0, y0, cx + 8, y1]); pegs.push([x0, y0, 3], [cx + 10, y1, 2.5]); }
    p.marks(str, { width: HAIR });
    p.dots(pegs);
    // a high narrow window, light falling from it
    gothic(p, W * 0.2, H * 0.32, 10, 74, 20, { width: FINE * 1.3 });
    p.dim(() => p.marks([[W * 0.21, H * 0.32, W * 0.4, H * 0.62], [W * 0.19, H * 0.32, W * 0.32, H * 0.66], [W * 0.2, H * 0.32, W * 0.25, H * 0.6]], { width: FINE }));
  },

  'basement': (p, W, H) => {
    const fl = H * 0.82;
    p.dim(() => {
      // vaults, ribs, the floor, the drums waiting in the dark
      for (const x of [0.15, 0.5, 0.85]) roundArch(p, W * x, fl, W * 0.17, H * 0.35, { width: FINE * 1.2 });
      p.curve([[W * -0.02, H * 0.05], [W * 0.15, H * 0.28], [W * 0.32, H * 0.05]], { width: FINE });
      p.curve([[W * 0.68, H * 0.05], [W * 0.85, H * 0.28], [W * 1.02, H * 0.05]], { width: FINE });
      p.line(-10, fl, W + 10, fl, { width: FINE });
      drum3(p, W * 0.16, H * 0.7, 46, 14, 40, { width: FINE * 1.2, rods: 6, rodW: HAIR });
      drum3(p, W * 0.85, H * 0.72, 40, 12, 34, { width: FINE * 1.2, rods: 6, rodW: HAIR });
      drum3(p, W * 0.7, H * 0.6, 22, 7, 22, { width: FINE, rods: 4, rodW: HAIR });
    });
    // one lantern, and the circle of floor it lights
    const lx = W * 0.47, ly = H * 0.34;
    p.line(lx, -6, lx, ly - 30, { width: FINE });
    p.pline([[lx - 13, ly - 18], [lx, ly - 31], [lx + 13, ly - 18]], { width: FINE * 1.2 });
    p.box(lx - 10, ly - 18, 20, 26, { width: FINE * 1.2, overshoot: 0 });
    p.blob(lx, ly - 4, 3, 5);
    p.tendril(lx, ly + 8, PI / 2, 4, 4, { dir: 1, width: FINE, turns: 1.2 });
    const r = [];
    for (let i = 0; i < 10; i++) { const a = PI * 0.15 + i * PI * 0.7 / 9; r.push([lx + cos(a) * 26, ly + sin(a) * 26, lx + cos(a) * 40, ly + sin(a) * 40]); }
    p.marks(r, { width: FINE });
    p.ell(lx, fl + 2, 120, 26, { width: FINE * 1.2, wobble: 1 });
    drum3(p, lx + 18, fl - 46, 36, 11, 34, { width: MAIN, rods: 6 });
    // and eyes, watching from where the light does not reach
    for (const [x, y, s] of [[0.08, 0.3, 7], [0.92, 0.22, 8], [0.88, 0.46, 6], [0.1, 0.52, 6], [0.3, 0.12, 5]]) {
      eye(p, W * x - s * 1.4, H * y, s); eye(p, W * x + s * 1.4, H * y, s);
    }
  },

  'heart': (p, W, H) => organFront(p, W, H, { water: true }),

  'tube': (p, W, H, o) => {
    const t = o.t ?? 0, vert = o.orient !== 'horizontal';
    const vp = vert ? [W / 2, H * 0.08] : [W * 0.92, H / 2];
    const near = vert ? [W / 2, H * 0.95] : [W * 0.06, H / 2];
    const R0 = max(W, H) * 0.7, N = 9, dz = 0.62, ph = frac(t * 0.5);
    const ring = (z) => { const k = 1 / z; return [vp[0] + (near[0] - vp[0]) * k, vp[1] + (near[1] - vp[1]) * k, R0 * k, k]; };
    // seams running the length of the pipe, into the distance
    const seams = [];
    for (let i = 0; i < 10; i++) {
      const a = i * TAU / 10 + 0.31, [x0, y0, r0] = ring(0.85), [x1, y1, r1] = ring(1 + (N + 1) * dz);
      seams.push([x0 + cos(a) * r0, y0 + sin(a) * r0, x1 + cos(a) * r1, y1 + sin(a) * r1]);
    }
    p.dim(() => p.marks(seams, { width: FINE }));
    p.dim(() => p.circle(...ring(1 + (N + 1) * dz).slice(0, 3), { width: FINE }));
    // the joints come at you: a flange ring with its rivets, one after another
    for (let i = N - 1; i >= 0; i--) {
      const z = 1 + (i + 1 - ph) * dz, [x, y, r, k] = ring(z), far = z > 4.2;
      const draw = () => {
        p.circle(x, y, r, { width: max(FINE, MAIN * 2.2 * k) });
        const [x2, y2, r2] = ring(z + 0.08);
        p.circle(x2, y2, r2, { width: max(HAIR, FINE * 1.5 * k) });
        const dots = [];
        for (let j = 0; j < 12; j++) { const a = j * TAU / 12; dots.push([x + cos(a) * r * 0.955, y + sin(a) * r * 0.955]); }
        p.dots(dots, max(1.2, 6 * k));
      };
      far ? p.dim(draw) : draw();
    }
  },

  'hall': (p, W, H) => {
    const cx = W / 2, stage = H * 0.8;
    // a dim arch behind the stage
    p.dim(() => {
      roundArch(p, cx, stage - 8, W * 0.3, H * 0.42, { width: FINE });
      roseWindow(p, cx, H * 0.3, 30, { spokes: 8, ring: 6, width: FINE });
    });
    // the valance: swags across the top, a tassel at every join
    const n = 4, sw = W / n, sag = H * 0.09;
    for (let i = 0; i < n; i++) p.path(u => [i * sw + u * sw, H * 0.04 + sin(u * PI) * sag], { width: MAIN });
    for (let i = 0; i < n; i++) p.path(u => [i * sw + u * sw, H * 0.04 + sin(u * PI) * sag * 0.55], { width: FINE });
    p.line(-10, H * 0.04, W + 10, H * 0.04, { width: MAIN });
    const tas = [];
    for (let i = 1; i < n; i++) {
      const x = i * sw, y = H * 0.04;
      p.line(x, y, x, y + 18, { width: FINE });
      p.ell(x, y + 24, 4, 6, { width: FINE });
      tas.push([x - 4, y + 30, x - 5, y + 40], [x, y + 30, x, y + 42], [x + 4, y + 30, x + 5, y + 40]);
    }
    p.marks(tas, { width: HAIR });
    // the side curtains, gathered at tie-backs
    for (const k of [-1, 1]) {
      const ex = k < 0 ? 0 : W;
      for (const [w0, w1] of [[0.02, 0.06], [0.09, 0.1], [0.16, 0.12]]) {
        const x0 = ex - k * W * w0, x1 = ex - k * W * w1;
        p.curve([[x0, H * 0.04], [x0 - k * 4, H * 0.3], [ex - k * W * 0.07, H * 0.5], [x1, H * 0.66], [x1 + k * 6, stage]], { width: FINE * 1.2 });
      }
      p.ell(ex - k * W * 0.08, H * 0.5, W * 0.05, 5, { width: FINE });
      p.tendril(ex - k * W * 0.13, H * 0.5, PI / 2, 14, 5, { dir: -k, width: FINE });
    }
    // the stage: its floor, its edge, the footlights
    p.dim(() => p.line(W * 0.18, H * 0.66, W * 0.82, H * 0.66, { width: FINE }));
    p.path(u => [lerp(-10, W + 10, u), stage + sin(u * PI) * 10], { width: MAIN });
    const fl = [];
    for (let i = 1; i < 10; i++) {
      const x = i * W / 10, y = stage + sin(i / 10 * PI) * 10;
      p.arc(x, y, 6, PI, TAU, { width: FINE });
      fl.push([x, y - 9, x, y - 14], [x - 7, y - 7, x - 10, y - 11], [x + 7, y - 7, x + 10, y - 11]);
    }
    p.dim(() => p.marks(fl, { width: HAIR }));
    // the podium, empty, centre stage: its top is where the conductor stands
    const py = H * 0.75;
    p.line(cx - 42, py, cx + 42, py, { width: MAIN });
    p.line(cx - 40, py, cx - 44, stage + 8, { width: MAIN }); p.line(cx + 40, py, cx + 44, stage + 8, { width: MAIN });
    p.tendril(cx - 20, py + 14, PI, 6, 6, { dir: -1, width: FINE }); p.tendril(cx + 20, py + 14, 0, 6, 6, { dir: 1, width: FINE });
    p.curve([[cx - 38, py], [cx - 40, py - 26], [cx - 16, py - 34], [cx + 4, py - 30]], { width: FINE });
    // the audience: rows of heads
    for (const [y, r, off] of [[H * 0.9, 12, 0.3], [H * 0.955, 15, 0], [H * 1.02, 19, 0.5]]) {
      const gap = r * 3.1, n2 = Math.ceil(W / gap) + 1;
      // a line of shoulders, and a head over each pair of them
      p.path(u => { const x = -gap + u * (n2 + 1) * gap, ph2 = frac(x / gap + off); return [x, y - sin(ph2 * PI) ** 0.5 * r * 0.55]; }, { width: MAIN, steps: n2 * 14 });
      for (let i = 0; i <= n2; i++) p.circle((i + 0.5 - off) * gap, y - r * 1.55, r * 0.95, { width: MAIN, wobble: 0.6 });
    }
  },

  'ending': (p, W, H) => {
    // dawn: the sun up behind, its rays winding into curls; birds
    const sx = W * 0.2, sy = H * 0.28;
    p.circle(sx, sy, 32, { width: MAIN });
    for (let i = 0; i < 10; i++) {
      const a = -PI + i * PI / 9 + 0.1 * (i % 2), s = i % 2 ? 1 : -1;
      p.tendril(sx + cos(a) * 42, sy + sin(a) * 42, a, 26 + (i % 2) * 14, 6, { dir: s, bend: 0.1 * s, width: FINE });
    }
    p.dim(() => { cloud(p, W * 0.56, H * 0.12, 44); cloud(p, W * 0.1, H * 0.5, 34, { flip: true }); });
    for (const [x, y, s] of [[0.48, 0.24, 12], [0.56, 0.2, 9], [0.62, 0.27, 10], [0.7, 0.12, 7]]) bird(p, W * x, H * y, s);
    castleOnCliff(p, W, H, { restored: true });
    curlTree(p, 22, 284, 104, { depth: 2, trunk: MAIN, roots: false });
    curlTree(p, 64, 282, 74, { depth: 1, trunk: FINE * 1.3, roots: false });
  },

  // ---- bosses: big and readable; o.resolved is the calm form after it is overcome,
  // its jagged lines turned to curls --------------------------------------------
  // The Squall, the chaos of life (woodwind): a whirlwind of reeds, flutes, torn
  // music and open mouths.
  'boss.squall': (p, W, H, o) => {
    const res = !!o.resolved, cx = W / 2, N = 7;
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1), y = lerp(H * 0.16, H * (res ? 0.8 : 0.86), u), rx = lerp(W * 0.42, 22, u ** 0.85), ry = rx * (res ? 0.2 : 0.26);
      const x = cx + sin(i * 1.3) * (res ? 8 : 26) * (1 - u * 0.4);
      whorl(p, x, y, rx, ry, { jag: !res, a0: i * 0.9, span: TAU * (res ? 0.8 : 0.9), width: i < 2 ? MAIN * 1.3 : MAIN, dir: i % 2 ? 1 : -1 });
    }
    if (res) p.tendril(cx, H * 0.84, PI / 2, 26, 9, { dir: 1, width: FINE * 1.3 });
    else p.pline([[cx - 14, H * 0.86], [cx - 4, H * 0.92], [cx - 12, H * 0.95], [cx + 2, H * 0.99]], { width: MAIN });
    // what it has caught up: pages, flutes, reeds; and its mouths
    page(p, W * 0.16, H * 0.3, 54, 40, res ? -0.15 : -0.5, { torn: !res });
    page(p, W * 0.84, H * 0.42, 50, 38, res ? 0.12 : 0.6, { torn: !res });
    page(p, W * 0.22, H * 0.66, 44, 34, res ? 0.1 : 0.4, { torn: !res });
    const flute = (x, y, len, rot) => {
      p.push(x, y, rot, 1);
      p.tube([[-len / 2, 0], [len / 2, 0]], 9, { width: FINE * 1.3 });
      p.dots([[-len * 0.2, 0, 2], [0, 0, 2], [len * 0.15, 0, 2], [len * 0.3, 0, 2]]);
      p.pop();
    };
    flute(W * 0.68, H * 0.18, 100, res ? 0 : 0.35);
    flute(W * 0.76, H * 0.7, 80, res ? 0.05 : -0.7);
    if (res) { note(p, W * 0.66, H * 0.12, 0.9); note(p, W * 0.84, H * 0.62, 0.8); note(p, W * 0.4, H * 0.06, 0.8); }
    for (const [x, y, a] of [[0.36, 0.08, 0.9], [0.9, 0.24, -0.6], [0.1, 0.48, 1.3]]) {
      const ex = W * x, ey = H * y, ra = res ? 0.1 : a;
      p.line(ex - cos(ra) * 26, ey - sin(ra) * 26, ex + cos(ra) * 26, ey + sin(ra) * 26, { width: FINE * 1.2 });
      p.fill([[ex + cos(ra) * 26, ey + sin(ra) * 26 - 3], [ex + cos(ra) * 36, ey + sin(ra) * 36], [ex + cos(ra) * 26, ey + sin(ra) * 26 + 3]]);
    }
    for (const [x, y, r] of [[0.4, 0.22, 17], [0.64, 0.36, 15], [0.44, 0.52, 14], [0.58, 0.68, 11]]) mouth(p, W * x, H * y, r, !res);
  },

  // The Adjudicator, judgment (brass).
  'boss.adjudicator': (p, W, H, o) => adjudicator(p, W, H, !!o.resolved),

  // Slack, apathy (strings): a hunched figure draped in slack strings over a cello;
  // resolved, it stands, the strings taut and singing.
  'boss.slack': (p, W, H, o) => {
    if (!o.resolved) {
      // strings hanging slack from everything, sagging to the floor
      for (const [x0, y0, x1, sag] of [[0.2, 0.3, 0.06, 0.5], [0.3, 0.22, 0.14, 0.62], [0.42, 0.18, 0.3, 0.7], [0.54, 0.24, 0.46, 0.66], [0.62, 0.3, 0.9, 0.6], [0.36, 0.26, 0.58, 0.82]]) {
        p.curve([[W * x0, H * y0], [lerp(W * x0, W * x1, 0.4), H * sag], [lerp(W * x0, W * x1, 0.75), H * (sag + 0.12)], [W * x1, H * 0.98]], { width: FINE });
      }
      // the hunched figure: a long bowed back, the head hanging, an arm hanging
      p.curve([[W * 0.08, H + 6], [W * 0.14, H * 0.5], [W * 0.3, H * 0.2], [W * 0.5, H * 0.16], [W * 0.62, H * 0.24], [W * 0.66, H * 0.34]], { width: MAIN * 1.5 });
      p.curve([[W * 0.66, H * 0.34], [W * 0.72, H * 0.4], [W * 0.7, H * 0.5], [W * 0.62, H * 0.52], [W * 0.56, H * 0.46], [W * 0.58, H * 0.38]], { width: MAIN * 1.3 });
      p.arc(W * 0.64, H * 0.43, 9, PI * 0.1, PI * 0.9, { width: FINE * 1.4 });
      p.path(u => [W * 0.6 + u * 24, H * 0.49 + sin(u * PI) * -4 + u * 3], { width: FINE * 1.3 });
      p.curve([[W * 0.46, H * 0.3], [W * 0.5, H * 0.5], [W * 0.5, H * 0.72], [W * 0.46, H * 0.8]], { width: MAIN });
      p.curve([[W * 0.46, H * 0.8], [W * 0.43, H * 0.85], [W * 0.47, H * 0.88], [W * 0.5, H * 0.82]], { width: FINE * 1.3 });
      p.curve([[W * 0.3, H * 0.6], [W * 0.38, H * 0.9], [W * 0.36, H + 6]], { width: FINE });
      // drips off it, everything running down
      for (const [x, y] of [[0.12, 0.7], [0.2, 0.42], [0.66, 0.56]]) p.ell(W * x, H * y, 3.5, 7, { width: FINE });
      // the cello slumped against it, its strings gone slack
      fiddle(p, W * 0.76, H * 0.72, 230, { rot: 0.42, strings: 'slack', neck: 0.6, width: MAIN });
      return;
    }
    // resolved: strings drawn tight behind, like a harp; it stands up straight
    p.marks([0.14, 0.24, 0.34, 0.66, 0.76, 0.86].map((x) => [W * x, H * 0.06, W * x, H * 0.96]), { width: HAIR });
    p.line(W * 0.1, H * 0.06, W * 0.9, H * 0.06, { width: FINE }); p.line(W * 0.1, H * 0.96, W * 0.9, H * 0.96, { width: FINE });
    const fx = W * 0.4;
    p.circle(fx, H * 0.18, 38, { width: MAIN * 1.4 });
    p.blob(fx - 13, H * 0.17, 3.5, 5); p.blob(fx + 13, H * 0.17, 3.5, 5);
    p.arc(fx, H * 0.18, 16, PI * 0.25, PI * 0.75, { width: FINE * 1.4 });
    p.curve([[fx - 30, H * 0.26], [fx - 52, H * 0.5], [fx - 64, H * 0.8], [fx - 70, H + 6]], { width: MAIN * 1.4 });
    p.curve([[fx + 30, H * 0.26], [fx + 46, H * 0.42], [fx + 58, H * 0.7], [fx + 70, H + 6]], { width: MAIN * 1.4 });
    p.curve([[fx - 20, H * 0.5], [fx - 26, H * 0.75], [fx - 30, H + 6]], { width: FINE });
    p.curve([[fx + 30, H * 0.32], [fx + 64, H * 0.4], [W * 0.62, H * 0.3]], { width: MAIN }); p.circle(W * 0.63, H * 0.29, 8, { width: FINE * 1.3 });
    fiddle(p, W * 0.62, H * 0.7, 250, { rot: 0.04, strings: 'taut', neck: 0.6, width: MAIN });
    // and singing: the strings ring, notes rise
    p.marks([[W * 0.57, H * 0.58, W * 0.55, H * 0.6], [W * 0.57, H * 0.62, W * 0.55, H * 0.64], [W * 0.67, H * 0.58, W * 0.69, H * 0.6], [W * 0.67, H * 0.62, W * 0.69, H * 0.64]], { width: FINE });
    note(p, W * 0.78, H * 0.34); note(p, W * 0.86, H * 0.2, 0.85); note(p, W * 0.74, H * 0.12, 0.7);
  },

  // The Echo, trauma and the fear of the past (percussion): a great drum in shadow,
  // eyes all over it, ghost copies of itself behind; resolved, one steady drum,
  // its eyes closed, a heartbeat running through.
  'boss.echo': (p, W, H, o) => {
    const res = !!o.resolved, cx = W / 2, dy = H * 0.34, rx = W * 0.32, ry = rx * 0.3, dh = H * 0.42;
    if (!res) {
      p.dim(() => {
        drum3(p, cx - 54, dy - 34, rx * 0.92, ry * 0.92, dh * 0.92, { width: FINE * 1.2, rodW: HAIR });
        drum3(p, cx + 60, dy - 48, rx * 0.86, ry * 0.86, dh * 0.86, { width: FINE * 1.2, rodW: HAIR });
        eye(p, cx - 54 - rx * 0.8, dy + 30, 9, { look: -1 }); eye(p, cx + 60 + rx * 0.78, dy + 10, 9, { look: 1 });
      });
      p.maskEll(cx, dy, rx + 6, ry + 6); p.mask([[cx - rx - 6, dy], [cx + rx + 6, dy], [cx + rx + 6, dy + dh], [cx - rx - 6, dy + dh]]); p.maskEll(cx, dy + dh, rx + 6, ry + 6);
    }
    drum3(p, cx, dy, rx, ry, dh, { width: MAIN * 1.4, rods: 10 });
    p.ell(cx, dy, rx * 0.86, ry * 0.8, { width: HAIR });
    const eyes = [[-0.55, 0.3, 15, 0.1], [0.05, 0.22, 20, -0.05], [0.6, 0.38, 13, 0.15], [-0.25, 0.62, 12, -0.1], [0.35, 0.7, 16, 0.08], [-0.68, 0.78, 10, 0]];
    for (const [ex, ey, r, rot] of (res ? eyes.slice(0, 3) : eyes)) eye(p, cx + ex * rx, dy + ey * dh, r, { shut: res, rot, look: ex < 0 ? -1 : 1 });
    if (res) {
      heartbeat(p, -10, W + 10, dy + dh * 0.72, 46, 2);
      p.line(cx - 60, dy - 40, cx - 14, dy - 4, { width: MAIN }); p.blob(cx - 64, dy - 44, 7);
      p.line(cx + 60, dy - 40, cx + 14, dy - 4, { width: MAIN }); p.blob(cx + 64, dy - 44, 7);
    } else {
      // the shadow it throws, longer than it is
      p.dim(() => { p.ell(cx + 20, dy + dh + 34, rx * 1.4, ry * 0.7, { a0: 0.2, a1: PI - 0.2, width: FINE }); p.ell(cx + 30, dy + dh + 46, rx * 1.2, ry * 0.5, { a0: 0.3, a1: PI - 0.3, width: HAIR }); });
    }
  },

  // The Grand, the secret encore (a grand piano): the lid a jaw, hammers for teeth,
  // the keys a grin; resolved, the lid open and gentle, a curl of music rising.
  'boss.grand': (p, W, H, o) => {
    const res = !!o.resolved;
    // legs, curling into claws (or feet), and the lyre of pedals
    for (const [x, s] of [[0.18, -1], [0.82, 1], [0.5, 1]]) {
      const lx = W * x, top = H * 0.76;
      p.curve([[lx, top], [lx + s * 6, H * 0.86], [lx - s * 2, H * 0.93]], { width: MAIN * 1.3 });
      p.tendril(lx - s * 2, H * 0.93, PI / 2 + s * 0.6, 8, 8, { dir: -s, width: FINE * 1.3 });
    }
    p.pline([[W * 0.46, H * 0.76], [W * 0.46, H * 0.84], [W * 0.54, H * 0.84], [W * 0.54, H * 0.76]], { width: FINE });
    // the case under the keys
    p.curve([[W * 0.1, H * 0.6], [W * 0.1, H * 0.76], [W * 0.5, H * 0.78], [W * 0.9, H * 0.76], [W * 0.9, H * 0.6]], { width: MAIN * 1.3 });
    // the keyboard: a grin, or, calm, straight
    const top = (u) => H * (res ? 0.6 : 0.58 + sin(u * PI) * 0.08), bot = (u) => top(u) + H * 0.09;
    p.path(u => [lerp(W * 0.13, W * 0.87, u), top(u)], { width: MAIN });
    p.path(u => [lerp(W * 0.13, W * 0.87, u), bot(u)], { width: MAIN });
    const sep = [], blk = [];
    for (let i = 0; i <= 16; i++) { const u = i / 16, x = lerp(W * 0.13, W * 0.87, u); sep.push([x, top(u), x, bot(u)]); }
    p.marks(sep, { width: FINE });
    for (let i = 0; i < 16; i++) {
      if ([2, 6, 9, 13].includes(i % 16)) continue;
      const u = (i + 1) / 16, x = lerp(W * 0.13, W * 0.87, u);
      p.fill([[x - 4, top(u)], [x + 4, top(u)], [x + 4, top(u) + H * 0.05], [x - 4, top(u) + H * 0.05]]);
    }
    if (!res) {
      // the lid flung up like a jaw; hammers for teeth along it and under it; eyes
      const jaw = [[W * 0.08, H * 0.5], [W * 0.5, H * 0.46], [W * 0.92, H * 0.48]];
      p.curve([[W * 0.08, H * 0.5], [W * 0.22, H * 0.14], [W * 0.6, H * 0.04], [W * 0.92, H * 0.1], [W * 0.92, H * 0.48]], { width: MAIN * 1.5 });
      p.curve(jaw, { width: MAIN });
      const jc = catmull(jaw), teeth = [], low = [];
      for (let i = 0; i <= 14; i++) { const [x, y] = jc(i / 14); teeth.push([x, y], [x + W * 0.03, y + (i % 2 ? 26 : 34)]); }
      p.pline(teeth.slice(0, -1), { width: FINE * 1.3 });
      for (let i = 0; i <= 12; i++) { const x = lerp(W * 0.14, W * 0.86, i / 12), u = i / 12; low.push([x, top(u) - (i % 2 ? 18 : 2)]); }
      p.pline(low, { width: FINE * 1.3 });
      for (const [x, y, k] of [[0.42, 0.26, -1], [0.66, 0.24, 1]]) {
        eye(p, W * x, H * y, 16, { look: -k * 0.5 });
        p.line(W * x - 22, H * y - (k < 0 ? 12 : 22), W * x + 22, H * y - (k < 0 ? 22 : 12), { width: MAIN });
      }
    } else {
      // the lid propped open, as a piano's is, and music curling up out of it
      p.line(W * 0.1, H * 0.6, W * 0.9, H * 0.6, { width: MAIN });
      p.pline([[W * 0.1, H * 0.56], [W * 0.46, H * 0.2], [W * 0.92, H * 0.5]], { closed: false, width: MAIN * 1.4 });
      p.line(W * 0.1, H * 0.56, W * 0.92, H * 0.5, { width: FINE });
      p.line(W * 0.62, H * 0.54, W * 0.56, H * 0.32, { width: FINE * 1.3 });
      const rise = [[W * 0.5, H * 0.5], [W * 0.42, H * 0.36], [W * 0.52, H * 0.2], [W * 0.68, H * 0.16]];
      p.curve(rise, { width: FINE * 1.4 });
      p.curlAt(W * 0.68, H * 0.16, -0.1, 18, { dir: 1, width: FINE * 1.4, turns: 1.6 });
      const rc = catmull(rise);
      for (const u of [0.3, 0.62, 0.9]) { const [x, y] = rc(u); note(p, x + 8, y - 2, 0.9); }
    }
  },

  // The water organ, the finale's partner rather than an enemy: dry and cracked,
  // then, resolved, water running through every pipe.
  'boss.organ': (p, W, H, o) => {
    const res = !!o.resolved, cx = W / 2, base = H * 0.84, t = 0;
    gothic(p, cx, base, W * 0.46, H * 0.5, H * 0.3, { width: MAIN * 1.4 });
    roseWindow(p, cx, H * 0.16, H * 0.09, { spokes: 10, ring: 8 });
    const n = 13, x0 = W * 0.08, x1 = W * 0.92, step = (x1 - x0) / n;
    organPipes(p, x0, x1, base, H * 0.6, n, { hMin: H * 0.3, water: res, dry: !res, phase: t * 2 });
    p.line(-10, base, W + 10, base, { width: MAIN * 1.2 }); p.line(-10, base + 10, W + 10, base + 10, { width: FINE });
    if (res) {
      // fountains playing off the tallest pipes, the channel running full
      for (const i of [3, 5, 6, 7, 9]) {
        const x = x0 + step * (i + 0.5), k = 1 - abs((i + 0.5) / n - 0.5) * 2, yt = base - lerp(H * 0.3, H * 0.6, k);
        p.tendril(x, yt - 16, -PI / 2 + (i - 6) * 0.25, 26, 7, { dir: i < 6 ? -1 : 1, width: FINE });
      }
      ripples(p, -10, W + 10, base + 26, { n: 2, gap: 12, amp: 3, waves: 9, phase: t * PI });
      p.dots([[W * 0.3, H * 0.1, 3], [W * 0.7, H * 0.12, 3], [W * 0.2, H * 0.2, 2.5], [W * 0.8, H * 0.22, 2.5]]);
    } else {
      // the channel empty, broken, dim
      p.dim(() => {
        p.line(W * 0.02, base + 30, W * 0.34, base + 30, { width: FINE });
        p.line(W * 0.42, base + 30, W * 0.7, base + 30, { width: FINE });
        p.line(W * 0.78, base + 30, W * 0.98, base + 30, { width: FINE });
      });
      p.pline([[cx - 20, base - H * 0.62], [cx - 6, base - H * 0.56], [cx - 14, base - H * 0.5]], { width: FINE });
    }
  },

  // ---- figures -----------------------------------------------------------------
  // Coda fills the box, feet on its bottom edge. Raised arms ('hold') reach the top
  // of the box, so the item scene can set its prize just above it.
  'coda': (p, W, H, o) => {
    const pose = o.pose ?? 'stand';
    const tall = pose === 'hold' ? 122 : pose === 'fall' ? 125 : 115;
    const wide = pose === 'sit' ? 82 : pose === 'fall' ? 95 : pose === 'bow' ? 80 : 72;
    const size = min(H * 0.97 * 100 / tall, W * 0.96 * 100 / (wide * 2));
    const cx = W / 2 - (pose === 'sit' ? size * 0.08 : pose === 'bow' ? size * 0.14 * (o.amount ?? 0) : 0);
    if (pose === 'fall') coda(p, cx, H / 2, size, { ...o, pose, rot: (o.t ?? 0) * PI / 2, centre: true, weight: 1.3 });
    else coda(p, cx, H - H * 0.015, size, { ...o, pose, weight: 1.3 });
  },
  'key': (p, W, H) => theKey(p, W / 2, H * 0.97, min(H * 0.94, W * 1.5), { weight: 1.2 }),

  // ---- portraits: busts for the text box, filling the box ------------------------
  // Fermata, an owl who holds every word too long: one brow is a fermata.
  'portrait.fermata': (p, W, H) => {
    const cx = W / 2, ey = H * 0.4, ex = 54;
    p.curve([[cx, H * 0.12], [cx + 96, H * 0.17], [cx + 130, H * 0.42], [cx + 118, H * 0.76], [cx + 70, H * 1.02], [cx - 70, H * 1.02], [cx - 118, H * 0.76], [cx - 130, H * 0.42], [cx - 96, H * 0.17]], { closed: true, width: MAIN * 1.4 });
    // ear tufts
    p.tendril(cx - 92, H * 0.18, -PI / 2 - 0.5, 34, 11, { dir: -1, width: MAIN });
    p.tendril(cx + 92, H * 0.18, -PI / 2 + 0.5, 34, 11, { dir: 1, width: MAIN });
    // the facial disc round each eye, meeting at the beak
    p.arc(cx - ex, ey, 60, PI * 0.45, PI * 1.12, { width: FINE });
    p.arc(cx + ex, ey, 60, -PI * 0.12, PI * 0.55, { width: FINE });
    // the eyes: big, round, staring
    for (const k of [-1, 1]) {
      p.circle(cx + k * ex, ey, 40, { width: MAIN * 1.2 });
      p.circle(cx + k * ex, ey, 22, { width: FINE });
      p.blob(cx + k * ex + 3, ey + 2, 14);
      p.maskEll(cx + k * ex - 3, ey - 4, 4.5);
    }
    // the left brow is a fermata: an arch with its dot, held over the eye
    p.ell(cx - ex, ey - 46, 52, 38, { a0: PI + 0.05, a1: TAU - 0.05, width: MAIN * 1.6 });
    p.blob(cx - ex - 51, ey - 47, 4); p.blob(cx - ex + 51, ey - 47, 4);
    p.blob(cx - ex, ey - 62, 7);
    // the right a plain feathered brow
    p.tendril(cx + ex - 30, ey - 48, -0.25, 56, 9, { dir: 1, bend: -0.15, width: MAIN });
    // the beak
    p.fill([[cx - 11, ey + 8], [cx + 11, ey + 8], [cx, ey + 38]]);
    // chest feathers in rows of scallops, folded wings, a branch to sit on
    for (const [y, w] of [[0.68, 70], [0.77, 82], [0.86, 88]]) {
      const n = 5;
      p.path(u => { const x = cx - w + u * 2 * w, ph = frac(u * n); return [x, H * y + sin(ph * PI) * 10]; }, { width: FINE, steps: 80 });
    }
    for (const k of [-1, 1]) {
      p.curve([[cx + k * 112, H * 0.5], [cx + k * 102, H * 0.72], [cx + k * 76, H * 0.94]], { width: FINE * 1.3 });
      p.marks([[cx + k * 104, H * 0.7, cx + k * 116, H * 0.76], [cx + k * 96, H * 0.8, cx + k * 108, H * 0.86]], { width: FINE });
    }
    p.line(-10, H * 0.97, W + 10, H * 0.95, { width: MAIN });
    p.tendril(W * 0.9, H * 0.95, -0.4, 22, 9, { dir: -1, width: FINE });
  },

  // Da Capo, the old caretaker: a hood, a long beard in spirals, a lantern, keys.
  'portrait.dacapo': (p, W, H) => {
    const cx = W * 0.5, fy = H * 0.36;
    // the hood
    p.curve([[cx - 132, H + 6], [cx - 124, H * 0.46], [cx - 96, H * 0.14], [cx, H * 0.04], [cx + 96, H * 0.14], [cx + 124, H * 0.46], [cx + 132, H + 6]], { width: MAIN * 1.3 });
    p.curve([[cx - 92, H * 0.62], [cx - 84, H * 0.28], [cx, H * 0.12], [cx + 84, H * 0.28], [cx + 92, H * 0.62]], { width: FINE });
    // brows like hedges, kind closed eyes, a long nose
    p.tendril(cx - 14, fy - 30, PI + 0.2, 34, 8, { dir: -1, width: MAIN });
    p.tendril(cx + 14, fy - 30, -0.2, 34, 8, { dir: 1, width: MAIN });
    p.arc(cx - 30, fy - 10, 11, PI * 0.15, PI * 0.85, { width: FINE * 1.3 });
    p.arc(cx + 30, fy - 10, 11, PI * 0.15, PI * 0.85, { width: FINE * 1.3 });
    p.marks([[cx - 46, fy - 8, cx - 52, fy - 13], [cx - 46, fy - 3, cx - 53, fy - 2], [cx + 46, fy - 8, cx + 52, fy - 13], [cx + 46, fy - 3, cx + 53, fy - 2]], { width: HAIR });
    p.curve([[cx - 2, fy - 18], [cx + 4, fy + 8], [cx + 12, fy + 24], [cx + 2, fy + 32], [cx - 8, fy + 28]], { width: MAIN });
    // the moustache, then the beard falling in spirals
    p.tendril(cx - 4, fy + 36, PI - 0.1, 40, 10, { dir: 1, bend: -0.25, width: MAIN });
    p.tendril(cx + 4, fy + 36, 0.1, 40, 10, { dir: -1, bend: 0.25, width: MAIN });
    for (const [dx, len, s] of [[-58, 120, -1], [-38, 170, 1], [-16, 200, -1], [6, 210, 1], [28, 180, -1], [50, 140, 1], [66, 96, -1]]) {
      p.tendril(cx + dx * 0.9, fy + 40 + abs(dx) * 0.2, PI / 2 + dx * 0.004, len * 0.9, 12, { dir: s, bend: 0.12 * s, width: FINE * 1.3 });
    }
    // the lantern, held up on the left
    const lx = W * 0.14, ly = H * 0.62;
    p.curve([[lx - 18, ly - 64], [lx - 6, ly - 76], [lx + 10, ly - 70], [lx + 6, ly - 58], [lx - 14, ly - 56]], { width: MAIN });
    p.circle(lx, ly - 50, 6, { width: FINE });
    p.pline([[lx - 16, ly - 30], [lx, ly - 44], [lx + 16, ly - 30]], { width: FINE * 1.3 });
    p.box(lx - 13, ly - 30, 26, 36, { width: FINE * 1.3, overshoot: 0 });
    p.marks([[lx, ly - 30, lx, ly + 6]], { width: HAIR });
    p.blob(lx, ly - 10, 4, 7);
    p.pline([[lx - 10, ly + 6], [lx, ly + 16], [lx + 10, ly + 6]], { width: FINE });
    p.dim(() => { const r = []; for (let i = 0; i < 9; i++) { const a = i * TAU / 9; r.push([lx + cos(a) * 30, ly - 12 + sin(a) * 34, lx + cos(a) * 42, ly - 12 + sin(a) * 46]); } p.marks(r, { width: FINE }); });
    // the ring of keys at his belt, on the right
    const kx = W * 0.85, ky = H * 0.8;
    p.circle(kx, ky, 22, { width: MAIN });
    for (const [a, len] of [[0.55, 46], [1.1, 54], [1.65, 44], [2.2, 50]]) {
      const x0 = kx + cos(a) * 22, y0 = ky + sin(a) * 22, x1 = x0 + cos(a) * len * 0.3, y1 = y0 + len;
      p.circle(x0 + cos(a) * 5, y0 + sin(a) * 5, 5, { width: FINE });
      p.line(x0 + cos(a) * 10, y0 + 8, x1, y1, { width: FINE * 1.2 });
      p.pline([[x1, y1 - 8], [x1 + 8, y1 - 8], [x1 + 8, y1 - 2], [x1, y1 - 2]], { width: FINE });
    }
  },

  // Staccato, a jittery little bird, drawn in short broken strokes.
  'portrait.staccato': (p, W, H) => {
    const cx = W * 0.47, cy = H * 0.56, r = 96;
    const o = { width: MAIN * 1.2, wobble: 0.6 };
    broken(p, t => { const a = t * TAU; return [cx + cos(a) * r * 1.05, cy + sin(a) * r * 0.95]; }, 13, 0.32, o);
    // a big startled eye, an open beak, a tuft standing straight up
    broken(p, t => { const a = t * TAU; return [cx + 40 + cos(a) * 24, cy - 32 + sin(a) * 24]; }, 5, 0.25, { width: FINE * 1.3 });
    p.blob(cx + 44, cy - 32, 10);
    p.maskEll(cx + 40, cy - 37, 3);
    p.marks([[cx + 96, cy - 30, cx + 142, cy - 22], [cx + 96, cy - 14, cx + 136, cy - 6], [cx + 142, cy - 22, cx + 126, cy - 20]], { width: MAIN });
    p.marks([[cx - 6, cy - r + 4, cx - 14, cy - r - 30], [cx + 6, cy - r + 2, cx + 6, cy - r - 34], [cx + 18, cy - r + 6, cx + 28, cy - r - 26]], { width: MAIN });
    // a wing of dashes, a spiky tail, thin legs
    broken(p, t => [cx - 60 + t * 90, cy + 8 + sin(t * PI) * 30], 4, 0.3, { width: FINE * 1.3 });
    p.marks([[cx - 30, cy + 22, cx - 8, cy + 40], [cx - 4, cy + 26, cx + 12, cy + 42]], { width: FINE });
    p.marks([[cx - r, cy + 10, cx - r - 52, cy - 14], [cx - r + 2, cy + 22, cx - r - 56, cy + 14], [cx - r + 4, cy + 34, cx - r - 46, cy + 42]], { width: MAIN });
    p.marks([[cx - 22, cy + r - 2, cx - 26, H * 0.97], [cx + 22, cy + r - 2, cx + 24, H * 0.97], [cx - 26, H * 0.97, cx - 40, H * 0.99], [cx - 26, H * 0.97, cx - 14, H * 0.995], [cx + 24, H * 0.97, cx + 10, H * 0.99], [cx + 24, H * 0.97, cx + 38, H * 0.995]], { width: FINE });
    // trembling all over: ticks round it, and three staccato dots over its head
    const ticks = [];
    for (const a of [-2.6, -2.2, -0.9, -0.5, 0.4, 2.5, 2.9]) {
      const x = cx + cos(a) * (r + 24), y = cy + sin(a) * (r + 22);
      ticks.push([x, y, x + cos(a) * 14, y + sin(a) * 14], [x + sin(a) * 7, y - cos(a) * 7, x + sin(a) * 7 + cos(a) * 10, y - cos(a) * 7 + sin(a) * 10]);
    }
    p.marks(ticks, { width: FINE });
    p.dots([[cx - 30, H * 0.1, 6], [cx, H * 0.06, 6], [cx + 30, H * 0.1, 6]]);
  },

  // Tutti, a brass automaton: a horn bell for a face, valve buttons down its chest.
  'portrait.tutti': (p, W, H) => {
    const cx = W * 0.46, by = H * 0.33;
    // the chest, the shoulders, rivets round the plate
    p.curve([[cx - 104, H + 6], [cx - 112, H * 0.76], [cx - 70, H * 0.64], [cx + 10, H * 0.62], [cx + 90, H * 0.64], [cx + 128, H * 0.76], [cx + 120, H + 6]], { width: MAIN * 1.3 });
    p.arc(cx - 128, H * 0.82, 44, PI * 1.05, PI * 1.55, { width: MAIN });
    p.arc(cx + 148, H * 0.82, 44, -PI * 0.55, -PI * 0.05, { width: MAIN });
    const rv = [];
    for (let i = 0; i < 7; i++) { const u = i / 6; rv.push([cx - 86 + u * 192, H * 0.7 - sin(u * PI) * 10]); }
    p.dots(rv, 3.2);
    // valve buttons down the chest: cap, stem, casing
    for (const y of [0.75, 0.85, 0.95]) {
      const yy = H * y, x = cx + 10;
      p.blob(x, yy - 12, 13, 5.5);
      p.line(x - 4, yy - 7, x - 4, yy, { width: FINE }); p.line(x + 4, yy - 7, x + 4, yy, { width: FINE });
      p.ell(x, yy + 3, 15, 6, { width: FINE * 1.3 });
    }
    // the face is a horn's bell, turned to us: the rim, the flare running back
    // into tubing that coils down into the chest
    p.curve([[cx + 52, by - 84], [cx + 112, by - 42], [cx + 150, by - 14], [cx + 196, by - 10]], { width: MAIN * 1.2 });
    p.curve([[cx + 52, by + 84], [cx + 112, by + 42], [cx + 150, by + 14], [cx + 196, by + 10]], { width: MAIN * 1.2 });
    p.tube([[cx + 196, by], [cx + 176, by + 70], [cx + 110, by + 104], [cx + 40, H * 0.6]], 18, { width: FINE * 1.3 });
    p.maskEll(cx, by, 76, 92, -0.08);
    p.ell(cx, by, 76, 92, { rot: -0.08, width: MAIN * 1.6 });
    p.ell(cx, by, 66, 82, { rot: -0.08, width: HAIR });
    p.ell(cx + 10, by + 4, 26, 30, { width: MAIN });
    p.ell(cx + 13, by + 5, 10, 12, { width: FINE });
    p.spiral(cx - 4, by - 68, 8, { dir: 1, width: FINE, turns: 1.5 });
    p.spiral(cx - 4, by + 68, 8, { dir: -1, width: FINE, turns: 1.5 });
    // two lit eyes in the flare
    for (const [x, y] of [[-38, -28], [44, -30]]) { p.circle(cx + x, by + y, 12, { width: FINE * 1.3 }); p.blob(cx + x, by + y, 5.5); }
    // curls sprouting off the flare, as off his horn
    p.tendril(cx + 110, by - 42, -PI * 0.4, 34, 10, { dir: 1, width: FINE * 1.3 });
    p.tendril(cx + 132, by + 26, PI * 0.35, 30, 9, { dir: -1, width: FINE * 1.3 });
  },

  // Lento, a tall slow drooping ghost, holding a cello.
  'portrait.lento': (p, W, H) => {
    const gx = W * 0.4, gy = H * 0.24;
    // the sheet: a dome of a head tipped over, sides falling away, ragged at the hem
    p.curve([[gx - 130, H + 6], [gx - 112, H * 0.6], [gx - 74, gy + 30], [gx - 56, gy - 50], [gx + 10, gy - 74], [gx + 62, gy - 44], [gx + 74, gy + 20], [gx + 70, H * 0.48]], { width: MAIN * 1.3 });
    p.tendril(gx - 130, H * 0.94, PI * 0.6, 14, 8, { dir: 1, width: FINE });
    // drooping eyes and a long sad mouth
    for (const [x, a] of [[gx - 30, 0.35], [gx + 30, -0.35]]) {
      p.ell(x, gy + 4, 13, 6, { rot: a, a0: 0, a1: PI, width: FINE * 1.3 });
      p.blob(x + (a > 0 ? -3 : 3), gy + 10, 3.5, 6, a);
    }
    p.path(u => [gx - 26 + u * 52, gy + 50 - sin(u * PI) * 9 + u * 4], { width: FINE * 1.3 });
    // a teardrop sliding down
    p.ell(gx - 36, gy + 32, 3.5, 6, { width: FINE });
    // the cello, held upright against it
    fiddle(p, W * 0.66, H * 0.78, 250, { rot: 0.12, strings: 'taut', neck: 0.55, width: MAIN });
    // a long drooping arm over the cello's neck, the hand hanging limp
    p.curve([[gx + 66, H * 0.42], [gx + 100, H * 0.36], [W * 0.66, H * 0.38], [W * 0.72, H * 0.44]], { width: MAIN });
    p.curve([[gx + 66, H * 0.48], [gx + 102, H * 0.43], [W * 0.66, H * 0.45], [W * 0.7, H * 0.5]], { width: FINE });
    p.curve([[W * 0.72, H * 0.44], [W * 0.75, H * 0.52], [W * 0.72, H * 0.56], [W * 0.7, H * 0.5]], { width: FINE * 1.3 });
  },

  // Pianissimo, a tiny moth, very small in the frame, as if it were whispering.
  'portrait.pianissimo': (p, W, H) => {
    const cx = W / 2, cy = H * 0.56, s = 0.9;
    for (const k of [-1, 1]) {
      p.curve([[cx + k * 3, cy - 4], [cx + k * 22 * s, cy - 24 * s], [cx + k * 40 * s, cy - 20 * s], [cx + k * 36 * s, cy - 2], [cx + k * 4, cy + 2]], { width: FINE * 1.2 });
      p.curve([[cx + k * 3, cy + 2], [cx + k * 24 * s, cy + 6], [cx + k * 26 * s, cy + 20 * s], [cx + k * 6, cy + 14 * s]], { width: FINE * 1.2 });
      p.spiral(cx + k * 22 * s, cy - 12 * s, 5, { dir: k, width: HAIR, turns: 1.4 });
      p.tendril(cx + k * 2, cy - 12, -PI / 2 + k * 0.5, 14, 4, { dir: k, width: HAIR, turns: 1.3 });
    }
    p.ell(cx, cy + 2, 3, 12, { width: FINE });
    // its wings barely stirring the dark
    p.dim(() => {
      for (const k of [-1, 1]) for (const r of [54, 68]) p.arc(cx, cy, r, k < 0 ? PI * 0.9 : -PI * 0.1, k < 0 ? PI * 1.1 : PI * 0.1, { width: HAIR });
    });
  },

  // The organist: a figure made of flowing water.
  'portrait.organist': (p, W, H) => {
    const cx = W / 2;
    // half-width of the figure at height y: head, neck, shoulders falling away
    const hw = (y) => {
      const v = y / H;
      if (v < 0.5) return 22 + 56 * sin(((v - 0.12) / 0.38) * PI) ** 0.7 * (v > 0.12 ? 1 : 0);
      if (v < 0.6) return lerp(22, 44, (v - 0.5) / 0.1);
      return lerp(44, 180, min(1, (v - 0.6) / 0.3) ** 0.7);
    };
    // the outline: one flowing stream down each side, the head's crown between
    for (const k of [-1, 1]) p.path(u => { const y = lerp(H * 0.2, H + 6, u); return [cx + k * hw(y) + sin(y * 0.05) * 2, y]; }, { width: MAIN * 1.2, wobble: 0.6, steps: 120 });
    p.arc(cx, H * 0.27, 66, PI * 1.08, PI * 1.92, { width: MAIN * 1.2 });
    // streams running down through it, starting and stopping like water does
    for (const [i, a, b] of [[-0.66, 0.2, 0.62], [-0.33, 0.16, 0.46], [0, 0.42, 1.0], [0.33, 0.18, 0.5], [0.66, 0.22, 0.66], [-0.5, 0.64, 1.0], [0.5, 0.6, 1.0], [-0.82, 0.7, 1.0], [0.82, 0.68, 1.0]]) {
      p.path(u => { const y = lerp(H * a, H * b + 6, u); return [cx + i * hw(y) + sin(y * 0.06 + i * 3) * 4, y]; }, { width: FINE, wobble: 0.6, steps: 80 });
    }
    // a fountain playing off the crown of its head, drops falling
    for (const k of [-1, 0, 1]) p.tendril(cx, H * 0.15, -PI / 2 + k * 0.7, 40, 9, { dir: k < 0 ? -1 : 1, bend: 0.3 * (k || 1), width: FINE });
    p.dots([[cx - 50, H * 0.12, 3], [cx + 54, H * 0.1, 3], [cx - 64, H * 0.22, 2.5], [cx + 68, H * 0.2, 2.5]]);
    // eyes shut and calm, eddies where the shoulders turn, drops flung off
    p.arc(cx - 26, H * 0.34, 9, PI * 0.15, PI * 0.85, { width: FINE * 1.4 }); p.arc(cx + 26, H * 0.34, 9, PI * 0.15, PI * 0.85, { width: FINE * 1.4 });
    p.tendril(cx - 92, H * 0.68, PI * 0.8, 20, 12, { dir: 1, width: FINE * 1.3 });
    p.tendril(cx + 92, H * 0.68, PI * 0.2, 20, 12, { dir: -1, width: FINE * 1.3 });
    for (const [x, y] of [[cx - 150, H * 0.84], [cx + 150, H * 0.82], [cx - 124, H * 0.96]]) p.ell(x, y, 3.5, 6, { width: FINE });
  },

  // The game itself, speaking: an ornate empty frame, a curl blinking in it like a cursor.
  'portrait.game': (p, W, H, o) => {
    ornateFrame(p, W, H, min(W, H) * 0.09, { crest: true });
    // last, so the frame's lines are the same whether or not it is lit
    if (frac(o.t ?? 0) < 0.5) {
      const x = W / 2, y = H * 0.66, h = min(W, H) * 0.3;
      p.tendril(x, y, -PI / 2, h * 0.7, h * 0.16, { dir: 1, bend: 0.05, width: MAIN * 1.6 });
      p.line(x - 12, y, x + 12, y, { width: MAIN * 1.6 });
    }
  },

  // Coda, face and shoulders.
  'portrait.coda': (p, W, H) => {
    const S = H * 1.17;
    coda(p, W / 2 - S * 0.02, H * 0.04 + S * 1.12, S, { pose: 'stand', weight: 1.7 });
  },

  // ---- items: one object, centred, for the frame where Coda holds it up ---------
  'item.key': (p, W, H) => theKey(p, W / 2, H * 0.97, min(H * 0.94, W * 1.5), { weight: 1.2 }),

  // The Patchwork Horn: his bell, with extra tubing, a valve and a mouthpiece
  // clipped on, and patches stitched over it.
  'item.horn': (p, W, H) => {
    const cx = W / 2, cy = H * 0.56, bx = cx - 130, R = 96, tw = R * 0.22;
    hornBell(p, bx, cy, R, 150, { curls: 3, width: MAIN * 1.4 });
    // the tube runs on, loops up over itself, through a valve, to the mouthpiece
    p.tube([[bx + 150, cy], [cx + 70, cy], [cx + 120, cy - 30], [cx + 110, cy - 96], [cx + 50, cy - 110], [cx + 20, cy - 70], [cx + 60, cy - 50]], tw * 1.4, { width: MAIN });
    p.box(cx + 60, cy - 72, 30, 46, { width: MAIN, overshoot: 0 });
    p.line(cx + 75, cy - 72, cx + 75, cy - 96, { width: MAIN });
    p.blob(cx + 75, cy - 100, 13, 5);
    p.tube([[cx + 90, cy - 50], [cx + 150, cy - 52]], tw * 1.1, { width: MAIN });
    p.pline([[cx + 150, cy - 64], [cx + 166, cy - 58], [cx + 166, cy - 46], [cx + 150, cy - 40]], { width: MAIN });
    p.line(cx + 168, cy - 70, cx + 168, cy - 34, { width: MAIN * 1.6 });
    // patches, stitched
    for (const [x, y, w, h, a] of [[bx + 56, cy - 40, 30, 24, 0.3], [bx + 90, cy + 34, 24, 20, -0.2]]) {
      p.push(x, y, a, 1);
      p.pline([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]], { closed: true, width: FINE * 1.2 });
      const st = [];
      for (let i = 0; i < 4; i++) { const u = -w / 2 + (i + 0.5) * w / 4; st.push([u, -h / 2 - 3, u, -h / 2 + 3], [u, h / 2 - 3, u, h / 2 + 3]); }
      p.marks(st, { width: HAIR });
      p.pop();
    }
    p.marks([[cx + 30, cy - 26, cx + 30, cy - 12], [cx + 36, cy - 26, cx + 36, cy - 12]], { width: FINE });
  },

  // The Weathervane Flute: a flute, and standing on it a weathervane's arrow.
  'item.vane': (p, W, H) => {
    const cx = W / 2, fy = H * 0.74, L = W * 0.8;
    p.tube([[cx - L / 2, fy], [cx + L / 2, fy]], 24, { width: MAIN * 1.3 });
    p.line(cx - L / 2, fy - 12, cx - L / 2, fy + 12, { width: MAIN }); p.line(cx + L / 2, fy - 12, cx + L / 2, fy + 12, { width: MAIN });
    p.ell(cx - L * 0.36, fy - 4, 14, 7, { width: FINE * 1.3 }); p.blob(cx - L * 0.36, fy - 4, 5, 2.5);
    const holes = [];
    for (let i = 0; i < 6; i++) holes.push([cx - L * 0.06 + i * L * 0.075, fy, 4.2]);
    p.dots(holes);
    p.marks([[cx - L * 0.22, fy - 12, cx - L * 0.22, fy + 12], [cx + L * 0.38, fy - 12, cx + L * 0.38, fy + 12]], { width: FINE });
    // the vane: a rod, the cardinal arms, the arrow turning on top
    const top = H * 0.2;
    p.line(cx, fy - 12, cx, top, { width: MAIN });
    p.blob(cx, fy - 40, 6);
    const ay = H * 0.46;
    p.line(cx - 60, ay, cx + 60, ay, { width: FINE * 1.3 });
    p.tendril(cx - 60, ay, PI, 6, 8, { dir: -1, width: FINE * 1.3 }); p.tendril(cx + 60, ay, 0, 6, 8, { dir: 1, width: FINE * 1.3 });
    p.line(cx - 34, ay + 18, cx + 34, ay - 18, { width: FINE });
    const arY = top + 14;
    p.line(cx - 112, arY, cx + 104, arY, { width: MAIN * 1.2 });
    p.fill([[cx + 128, arY], [cx + 98, arY - 15], [cx + 104, arY], [cx + 98, arY + 15]]);
    for (const k of [-1, 1]) { p.line(cx - 112, arY, cx - 132, arY + k * 20, { width: FINE * 1.3 }); p.line(cx - 96, arY, cx - 116, arY + k * 20, { width: FINE * 1.3 }); }
    p.tendril(cx - 20, arY, -PI / 2 - 0.3, 26, 9, { dir: -1, width: FINE * 1.3 });
    p.tendril(cx + 20, arY, -PI / 2 + 0.3, 22, 8, { dir: 1, width: FINE * 1.3 });
    p.blob(cx, top - 4, 6);
  },

  // The Tuning Bow: a violin bow, its frog a spiral.
  'item.bow': (p, W, H) => {
    const a = [W * 0.2, H * 0.8], b = [W * 0.9, H * 0.1];
    const ang = atan2(b[1] - a[1], b[0] - a[0]), ux = cos(ang), uy = sin(ang), nx = -uy, ny = ux;
    const P = (u, v) => [a[0] + ux * u + nx * v, a[1] + uy * u + ny * v], L = hypot(b[0] - a[0], b[1] - a[1]);
    // the stick, bowed a little toward the hair, and the hair, straight, below it
    p.curve([P(0, 0), P(L * 0.5, 7), P(L, 0)], { width: MAIN * 1.5 });
    p.line(...P(58, 40), ...P(L - 8, 24), { width: FINE * 1.2 });
    // the head at the tip, hatchet-shaped
    p.pline([P(L, 0), P(L + 6, 12), P(L - 2, 26), P(L - 12, 24)], { width: MAIN * 1.3 });
    // the frog: a block under the stick with a great spiral on its face
    p.pline([P(10, 2), P(4, 46), P(62, 48), P(66, 2)], { width: MAIN * 1.3 });
    const [fx, fy] = P(34, 26);
    p.spiral(fx, fy, 15, { dir: 1, width: FINE * 1.4, turns: 1.9 });
    // the screw at the end, and a curl off it
    p.line(...P(0, 0), ...P(-20, 0), { width: MAIN * 2.4 });
    p.tendril(...P(-20, 0), ang + PI - 0.7, 22, 9, { dir: -1, width: FINE * 1.3 });
    sparkle(p, ...P(L * 0.72, -36), 13);
  },

  // The Heartbeat Drum: a small hand drum, a heart curled on its head.
  'item.drum': (p, W, H) => {
    const cx = W / 2, cy = H * 0.42, rx = W * 0.36, ry = rx * 0.42, h = H * 0.2;
    drum3(p, cx, cy, rx, ry, h, { width: MAIN * 1.4, rods: 0 });
    p.ell(cx, cy, rx * 0.9, ry * 0.86, { width: HAIR });
    // the heart on its head: two lobes from a point, each winding in to a spiral
    const by = cy + ry * 0.55;
    p.tendril(cx, by, -PI / 2 - 0.75, ry * 1.05, ry * 0.3, { dir: 1, bend: -0.45, width: MAIN, turns: 1.5 });
    p.tendril(cx, by, -PI / 2 + 0.75, ry * 1.05, ry * 0.3, { dir: -1, bend: -0.45, width: MAIN, turns: 1.5 });
    // and a heartbeat running round its shell, laced top and bottom
    heartbeat(p, cx - rx + 4, cx + rx - 4, cy + ry + h * 0.45, h * 0.55, 1);
    const lace = [];
    for (let i = 1; i < 12; i++) { const a = PI - i * PI / 12; lace.push([cx + cos(a) * rx, cy + sin(a) * ry, cx + cos(a) * rx, cy + sin(a) * ry + 7], [cx + cos(a) * rx, cy + h + sin(a) * ry, cx + cos(a) * rx, cy + h + sin(a) * ry - 7]); }
    p.marks(lace, { width: FINE });
  },

  // The workshop: a little workbench, a hammer on it, a curl of smoke.
  'item.workshop': (p, W, H) => {
    const x0 = W * 0.16, x1 = W * 0.84, ty = H * 0.56;
    p.line(x0 - 10, ty, x1 + 10, ty, { width: MAIN * 1.3 }); p.line(x0 - 10, ty + 16, x1 + 10, ty + 16, { width: MAIN * 1.3 });
    p.line(x0 - 10, ty, x0 - 10, ty + 16, { width: MAIN }); p.line(x1 + 10, ty, x1 + 10, ty + 16, { width: MAIN });
    p.marks([[x0 + 6, ty + 16, x0, H * 0.92], [x1 - 6, ty + 16, x1, H * 0.92], [x0 + 26, ty + 16, x0 + 24, H * 0.86], [x1 - 26, ty + 16, x1 - 24, H * 0.86]], { width: MAIN * 1.3 });
    p.line(x0 + 4, H * 0.8, x1 - 4, H * 0.8, { width: FINE * 1.3 });
    p.tendril(x0, H * 0.92, PI - 0.3, 8, 6, { dir: 1, width: FINE }); p.tendril(x1, H * 0.92, 0.3, 8, 6, { dir: -1, width: FINE });
    // the vise at one end
    p.box(x0 - 2, ty - 34, 34, 34, { width: MAIN, overshoot: 0 });
    p.line(x0 - 26, ty - 18, x0 - 2, ty - 18, { width: FINE * 1.3 }); p.blob(x0 - 28, ty - 18, 5);
    // the hammer, lying on the bench
    p.line(W * 0.36, ty - 9, W * 0.62, ty - 12, { width: MAIN * 1.6 });
    p.pline([[W * 0.62, ty - 34], [W * 0.68, ty - 35], [W * 0.69, ty - 2], [W * 0.63, ty - 1]], { closed: true, width: MAIN * 1.3 });
    p.marks([[W * 0.62, ty - 26, W * 0.68, ty - 27]], { width: FINE });
    // a candle, and the curl of smoke going up
    p.box(W * 0.78 - 7, ty - 26, 14, 26, { width: FINE * 1.3, overshoot: 0 });
    p.blob(W * 0.78, ty - 33, 3.5, 6);
    p.tendril(W * 0.78, ty - 42, -PI / 2 + 0.2, H * 0.3, 24, { dir: -1, bend: 0.35, width: FINE * 1.3 });
  },

  // The Burin: a mushroom handle and a slanted blade.
  'item.burin': (p, W, H) => {
    p.push(W * 0.52, H * 0.5, 0.62, min(W, H) / 400);
    // the handle: a mushroom cap, cut flat on the side that rides the plate
    p.curve([[-92, -10], [-110, -44], [-150, -58], [-186, -34], [-196, 2], [-182, 28]], { width: MAIN * 1.5 });
    p.pline([[-182, 28], [-104, 28], [-92, 10]], { width: MAIN * 1.5 });
    p.arc(-150, -10, 26, PI * 1.05, PI * 1.5, { width: FINE * 1.2 });
    p.marks([[-170, 20, -112, 20]], { width: HAIR });
    // the neck and ferrule
    p.box(-92, -14, 26, 28, { width: MAIN, overshoot: 0 });
    p.marks([[-80, -14, -80, 14]], { width: FINE });
    // the steel, drawn double, and its tip cut on the slant
    p.line(-66, -7, 116, -7, { width: MAIN }); p.line(-66, 8, 150, 8, { width: MAIN });
    p.line(116, -7, 150, 8, { width: MAIN });
    // the curl of metal it lifts
    p.tendril(150, 8, -0.6, 14, 10, { dir: -1, width: FINE * 1.4 });
    p.pop();
    sparkle(p, W * 0.82, H * 0.7, 12);
  },

  // An Overtone: a tuning fork, three arcs rising off it.
  'item.overtone': (p, W, H) => {
    const cx = W / 2, top = H * 0.36, bend = H * 0.66;
    for (const k of [-1, 1]) p.line(cx + k * 22, top, cx + k * 22, bend - 22, { width: MAIN * 1.5 });
    p.arc(cx, bend - 22, 22, 0, PI, { width: MAIN * 1.5 });
    p.line(cx, bend, cx, H * 0.9, { width: MAIN * 1.5 });
    p.blob(cx, H * 0.92, 9);
    p.tendril(cx, H * 0.78, PI - 0.4, 22, 9, { dir: 1, width: FINE * 1.3 });
    p.tendril(cx, H * 0.78, 0.4, 22, 9, { dir: -1, width: FINE * 1.3 });
    for (let i = 0; i < 3; i++) p.arc(cx, top - 6, 40 + i * 30, -PI * 0.78, -PI * 0.22, { width: MAIN * (1.2 - i * 0.15) });
  },

  // ---- ornament ------------------------------------------------------------------
  // A border inset from the box, scrolls in its corners and sprigs off its sides;
  // the middle is left clear for words.
  'frame': (p, W, H) => ornateFrame(p, W, H, min(W, H) * 0.05, { crest: true }),

  // A rough rubber stamp, double bordered, a little crooked, empty inside: the
  // caller writes in it. Weights go by the box, since a stamp is bold at any size.
  'stamp': (p, W, H) => {
    const R = p.L, ow = H * 0.065, iw = H * 0.032;
    p.push(W / 2, H / 2, -0.035, 1);
    const box = (hw, hh, n, w) => {
      const side = (x0, y0, x1, y1) => broken(p, t => [lerp(x0, x1, t), lerp(y0, y1, t)], n, 0.04 + R() * 0.06, { width: w, wobble: H * 0.006 });
      side(-hw, -hh, hw, -hh); side(hw, -hh, hw, hh); side(hw, hh, -hw, hh); side(-hw, hh, -hw, -hh);
    };
    box(W * 0.47, H * 0.42, 4, ow);
    box(W * 0.47 - H * 0.13, H * 0.42 - H * 0.13, 3, iw);
    p.pop();
  },

  // A flourish across the box: a centre knot, lines running out, curls at the ends.
  'divider': (p, W, H) => {
    const cx = W / 2, cy = H / 2, k = min(H, W * 0.12), w1 = max(1.5 / p.s, k * 0.05), w2 = max(1.5 / p.s, k * 0.035);
    const L = W * 0.46;
    for (const s of [-1, 1]) {
      p.path(t => [cx + s * lerp(k * 0.3, L, t), cy + sin(t * PI * 2) * k * 0.05 * s], { width: w1 });
      p.curlAt(cx + s * L, cy, s > 0 ? 0 : PI, k * 0.22, { dir: s > 0 ? -1 : 1, width: w1, turns: 1.6 });
      p.tendril(cx + s * L * 0.55, cy, s > 0 ? -0.6 : PI + 0.6, k * 0.3, k * 0.13, { dir: s > 0 ? 1 : -1, width: w2 });
      p.tendril(cx + s * L * 0.55, cy, s > 0 ? 0.6 : PI - 0.6, k * 0.3, k * 0.13, { dir: s > 0 ? -1 : 1, width: w2 });
    }
    // the knot: a lozenge with a scroll above and below
    p.pline([[cx - k * 0.3, cy], [cx, cy - k * 0.16], [cx + k * 0.3, cy], [cx, cy + k * 0.16]], { closed: true, width: w1 });
    p.tendril(cx, cy - k * 0.16, -PI / 2, k * 0.12, k * 0.12, { dir: 1, width: w2 });
    p.tendril(cx, cy + k * 0.16, PI / 2, k * 0.12, k * 0.12, { dir: 1, width: w2 });
  },
};

for (const [k, fn] of Object.entries(EMBLEMS)) SKETCHES[`emblem.${k}`] = (p, W, H) => medallion(p, W, H, (cx, cy, r) => fn(p, cx, cy, r));

export function sketchKeys() { return Object.keys(SKETCHES).sort(); }

const ANIMATED = new Set(['sky', 'fall', 'tube', 'coda', 'portrait.game']);
export function isAnimated(key) { return ANIMATED.has(key); }

export function drawSketch(c, key, w, h, o = {}) {
  const fn = SKETCHES[key];
  if (!fn || !(w > 0) || !(h > 0)) { missing(c, key, w, h); return; }
  const s = min(w, h) / 400;
  c.save();
  try {
    // keep to the box: a cloud drifting off the edge must not draw on the stage
    // beside it (animated sketches are drawn straight onto the stage)
    c.beginPath(); c.rect(0, 0, w, h); c.clip();
    c.scale(s, s);
    const p = new SketchPen(c, `${key}:${o.seed ?? 0}`, s);
    p.L = rng(`${key}:layout`);
    fn(p, w / s, h / s, { t: 0, ...o });
  } catch (e) {
    c.restore(); c.save();
    missing(c, `${key} (${e && e.message})`, w, h);
  } finally {
    c.restore();
  }
}

// Unknown key: a dashed box with the name in it, never a throw.
function missing(c, key, w, h) {
  if (!(w > 0) || !(h > 0)) return;
  c.save();
  c.strokeStyle = DIM; c.lineWidth = 2; c.setLineDash([6, 6]);
  c.strokeRect(4, 4, max(0, w - 8), max(0, h - 8));
  c.setLineDash([]);
  c.fillStyle = DIM; c.font = `${Math.max(10, Math.min(16, w / 14))}px ui-monospace, monospace`;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(String(key), w / 2, h / 2, w - 12);
  c.restore();
}
