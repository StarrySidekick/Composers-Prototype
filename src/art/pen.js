// A pen that draws like a person instead of like a vector program.
//
// Three tricks, all cheap:
//
// 1. Wobble. A straight line is split into short segments and each point is pushed
//    sideways by a slow, smooth noise, so it bends the way a hand does rather than
//    jittering the way a random number does.
// 2. An optional second pass (passes: 2), gone over slightly off, the way a sketch
//    is. Off by default: at 51 px it reads as stair-step notches, not as a hand.
// 3. Hard pixels. The Unity art is two-colour: every pixel is fully white or fully
//    clear. `crisp()` thresholds the canvas afterwards so a placeholder has the
//    same hard-edged pixel look instead of soft antialiasing.
//
// Everything is seeded from the sprite key, so `wall.ns` is the same drawing on
// every frame and every reload. An unseeded sketch would shimmer.

import { INK, STROKE } from './protocol.js';

// Small fast seeded RNG (mulberry32). Same seed, same sequence, forever.
export function rng(seed) {
  let a = typeof seed === 'string' ? hash(seed) : seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export class Pen {
  constructor(c, seed, { ink = INK, width = STROKE.main, wobble = 0.55, passes = 1 } = {}) {
    this.c = c;
    this.r = rng(seed);
    this.ink = ink;
    this.width = width;
    this.wobble = wobble;
    this.passes = passes;
  }

  // A smooth sideways offset along a stroke: two sine waves with random phase.
  _noise() {
    const p1 = this.r() * 6.283, p2 = this.r() * 6.283;
    const f1 = 1 + this.r() * 1.5, f2 = 2.5 + this.r() * 2;
    return (t) => Math.sin(t * f1 * 3.1416 + p1) * 0.65 + Math.sin(t * f2 * 3.1416 + p2) * 0.35;
  }

  // Stroke a path given as a function t∈[0,1] -> [x, y]. Everything else is built on
  // this, so curves wobble exactly like lines do.
  path(fn, { width = this.width, wobble = this.wobble, passes = this.passes, steps = 0 } = {}) {
    const c = this.c;
    // Segment count from the real arc length, sampled: a closed circle starts and
    // ends on the same point, so end-to-end distance would say "zero" and draw a hexagon.
    let len = 0;
    for (let i = 1, [px, py] = fn(0); i <= 16; i++) {
      const [x, y] = fn(i / 16); len += Math.hypot(x - px, y - py); px = x; py = y;
    }
    const n = steps || Math.max(6, Math.ceil(len / 2.5));
    c.save();
    c.strokeStyle = this.ink;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    for (let pass = 0; pass < passes; pass++) {
      const nz = this._noise();
      const amp = wobble * (pass ? 0.8 : 1);
      const off = pass ? (this.r() - 0.5) * 0.9 : 0;
      c.lineWidth = pass ? Math.max(1, width * 0.6) : width;
      c.beginPath();
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const [x, y] = fn(t);
        // normal from a small step along the curve
        const [x2, y2] = fn(Math.min(1, t + 0.01));
        const [x1, y1] = fn(Math.max(0, t - 0.01));
        let nx = -(y2 - y1), ny = x2 - x1;
        const len = Math.hypot(nx, ny) || 1;
        nx /= len; ny /= len;
        // taper the wobble to zero at the ends so connectors land exactly
        const taper = Math.sin(t * Math.PI);
        const d = nz(t) * amp * taper + off * taper;
        const px = x + nx * d, py = y + ny * d;
        i ? c.lineTo(px, py) : c.moveTo(px, py);
      }
      c.stroke();
    }
    c.restore();
    return this;
  }

  line(x0, y0, x1, y1, o) {
    return this.path(t => [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t], o);
  }

  // Polyline through points.
  poly(pts, o) {
    for (let i = 1; i < pts.length; i++) this.line(...pts[i - 1], ...pts[i], o);
    return this;
  }

  // Rectangle as four separate strokes that overshoot their corners a touch, which
  // is what makes a hand-drawn box read as hand-drawn.
  box(x, y, w, h, o = {}) {
    const k = o.overshoot ?? 1;
    const sides = o.sides ?? 'nesw';
    if (sides.includes('n')) this.line(x - k, y, x + w + k, y, o);
    if (sides.includes('s')) this.line(x - k, y + h, x + w + k, y + h, o);
    if (sides.includes('w')) this.line(x, y - k, x, y + h + k, o);
    if (sides.includes('e')) this.line(x + w, y - k, x + w, y + h + k, o);
    return this;
  }

  arc(cx, cy, r, a0, a1, o) {
    return this.path(t => {
      const a = a0 + (a1 - a0) * t;
      return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    }, o);
  }

  // Not quite closed: a real circle drawn by hand overlaps or gaps where it ends.
  circle(cx, cy, r, o) {
    const a = this.r() * 6.283;
    return this.arc(cx, cy, r, a, a + 6.283 + 0.25, o);
  }

  ellipse(cx, cy, rx, ry, o) {
    const a = this.r() * 6.283;
    return this.path(t => {
      const th = a + (6.283 + 0.2) * t;
      return [cx + Math.cos(th) * rx, cy + Math.sin(th) * ry];
    }, o);
  }

  // The flourish all over the Unity art: a spiral that winds inward.
  // dir = 1 clockwise, -1 counter-clockwise (screen space, +y down).
  // Below about r=3 at 51 px there is no room for the gap between turns and it
  // fills in to a blob, so small curls get fewer turns rather than a smaller spiral.
  curl(cx, cy, r, { turns = r < 4 ? 1.05 : 1.5, dir = 1, start = 0, ...o } = {}) {
    return this.path(t => {
      const a = start + dir * t * turns * 6.283;
      const rr = r * (1 - t * 0.7);
      return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr];
    }, { width: 1, passes: 1, wobble: 0.15, ...o });
  }

  // A short vine: a line that sprouts curls along its length.
  vine(x0, y0, x1, y1, { curls = 2, size = 3.2, ...o } = {}) {
    this.line(x0, y0, x1, y1, { width: STROKE.fine, passes: 1, ...o });
    for (let i = 0; i < curls; i++) {
      const t = (i + 0.5 + (this.r() - 0.5) * 0.4) / curls;
      const side = i % 2 ? 1 : -1;
      const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
      const nx = (-dy / len) * side, ny = (dx / len) * side;
      this.curl(x0 + dx * t + nx * size, y0 + dy * t + ny * size, size,
        { dir: side, start: Math.atan2(-ny, -nx) });
    }
    return this;
  }
}

// Threshold alpha so every pixel is fully on or fully off, matching the Unity art.
export function crisp(cv, cut = 110) {
  const c = cv.getContext('2d');
  const img = c.getImageData(0, 0, cv.width, cv.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const on = d[i + 3] >= cut;
    d[i] = d[i + 1] = d[i + 2] = 255;
    d[i + 3] = on ? 255 : 0;
  }
  c.putImageData(img, 0, 0);
  return cv;
}
