// A daily board for a motif, made by search, with the board's own pieces
// (src/daily/pieces.js, 2026-10-16): strings crossed by the wave, pegs that wind
// and slide, little instruments with one note, drums that turn it.
//
//   node tools/daily-forge.mjs motif=my-motif.json seed=3
//   node tools/daily-forge.mjs day=4 seed=7 winds=3 slides=1     (another board for day 4's tune)
//
// motif=   a motif as the songbook's "Copy motif" gives it (docs/MUSIC.md), saved
//          to a file. day= takes one of daily/days.json instead.
// seed=    a different seed, a different board. Try several; keep the one you like.
// turns=   drums on the way that start turned wrong                 (default 2)
// winds=   strings on the way with a peg wound wrong                (default 2)
// slides=  strings on the way with a peg block slid off its length  (default 1)
// trays=   little instruments on the way that start off it          (default 0)
// lures=   a piece with the RIGHT next note, the wrong way out of a drum (default 2)
// decoys=  strings and little instruments anywhere else             (default 3)
// solo=    how often a note is a little instrument, 0 to 1          (default 0.25)
// horn=    how often a note is a horn, 0 to 1                       (default 0.15)
// straight= how often the wave goes straight on to the next note    (default 0.35)
// timpani=1  the last note may be a timpani (it absorbs, so only last)
// unique=0   keep a board with more than one answer, or too big to count
//
// How: it walks a path from Coda, note by note. A note is a string laid ACROSS
// the path (2 to 6 tiles, wraps on its pegs chosen so 7 - length + wraps is the
// degree), a little instrument on the path, or a straight horn 7 - degree long (a
// slide making up some of it). Between notes the wave goes straight on, or a drum
// turns it. Then lures and decoys, then the handles are scrambled, each change
// recorded as the touches that undo it, and the board is kept only if it is not
// the tune untouched, its scramble played back is, and the solver
// (src/daily/solve.js) finds that answer and no other.
//
// It prints a day for daily/days.json (give it an id, a title and a hint), the
// board, and the solver's count. A trayed instrument can go to any free tile, a
// hundred choices each, so a board with trays is usually too big to count: pass
// unique=0 and check it with node tools/daily-solve.mjs. Flutes with holes and
// loops are not in its vocabulary; days 6 and 10 were made by hand. Node only.

import { readFileSync } from 'node:fs';
import { Board, applySolution, targetOf } from '../src/daily/board.js';
import { solve } from '../src/daily/solve.js';
import { hornProblems } from '../src/doodads/brass.js';
import { SOLO_VOICES } from '../src/daily/pieces.js';

const A = Object.fromEntries(process.argv.slice(2).map(a => a.split('=')));
const num = (k, d) => Number(A[k] ?? d);
const W = 8, H = 14;
let motif;
if (A.day) motif = JSON.parse(readFileSync(new URL('../daily/days.json', import.meta.url))).days[Number(A.day) - 1]?.motif;
else if (A.motif) motif = JSON.parse(readFileSync(A.motif, 'utf8'));
if (!motif?.notes?.length) { console.error('Give a motif: motif=file.json (the songbook\'s "Copy motif") or day=N.'); process.exit(2); }
const target = targetOf(motif);

let seed = num('seed', 1);
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = a => a[Math.floor(rnd() * a.length)];
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

const DIRS = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };
const CW = { up: 'right', right: 'down', down: 'left', left: 'up' };
const CCW = { up: 'left', left: 'down', down: 'right', right: 'up' };
// The drum rotation that turns a wave going `in` to `out` (src/doodads/percussion.js).
const ROT = { 'right>up': 0, 'down>left': 0, 'left>up': 90, 'down>right': 90, 'left>down': 180, 'up>right': 180, 'right>down': 270, 'up>left': 270 };
const DIRROT = { right: 0, down: 90, left: 180, up: 270 };
const key = (x, y) => `${x},${y}`;
const inb = (x, y) => x >= 0 && y >= 0 && x < W && y < H;

// A string across tile (cx, cy) on `axis`, of length L, crossed at its j-th tile,
// sounding `degree`: its cells (peg, tiles, peg) and the wraps on each peg. The
// string's note is 7 - L + wraps (pieces.js), so the wraps it needs are
// (degree + L) mod 7, split between two pegs of 0 to 3.
function stringAcross(cx, cy, axis, L, j, degree) {
  const [ax, ay] = axis === 'h' ? [1, 0] : [0, 1];
  const at = [];
  for (let i = -1; i <= L; i++) at.push([cx + ax * (i - j), cy + ay * (i - j)]);
  const w = ((degree + L) % 7 + 7) % 7;
  const wa = int(Math.max(0, w - 3), Math.min(3, w));
  return { at, axis, wa, wb: w - wa };
}

// One string's cells into the board: { kind: 'peg' } at each end, 'taut' between.
function lay(cells, s, extra = {}) {
  const sid = `s${cells.size}`;
  s.at.forEach(([x, y], i) => {
    const end = i === 0 ? 'a' : i === s.at.length - 1 ? 'b' : null;
    cells.set(key(x, y), end
      ? { kind: 'peg', sid, axis: s.axis, wraps: end === 'a' ? s.wa : s.wb, ...extra }
      : { kind: 'taut', sid, axis: s.axis, ...extra });
  });
  return sid;
}

// One path that plays the tune, or null.
function walk(launch) {
  const cells = new Map([[key(launch.x, launch.y), { kind: 'launch' }]]);
  const free = (tx, ty) => inb(tx, ty) && !cells.has(key(tx, ty));
  const open = (tx, ty) => inb(tx, ty) && (!cells.has(key(tx, ty)) || cells.get(key(tx, ty)).kind === 'path');
  let { x, y, dir } = launch;
  for (let n = 0; n < target.length; n++) {
    const d = target[n], last = n === target.length - 1;
    const r = rnd();
    const first = r < num('solo', 0.25) ? 'solo' : r < num('solo', 0.25) + num('horn', 0.15) ? 'horn' : 'string';
    const kinds = [first, ...shuffle(['string', 'solo', 'horn'].filter(k => k !== first))];
    if (last && num('timpani', 0)) kinds.unshift('timpani');
    let ok = false;
    outer: for (const k of shuffle([0, 0, 1, 1, 2])) {
      for (const kind of kinds) {
        const [dx, dy] = DIRS[dir];
        let tx = x, ty = y, good = true;
        const trav = [], put = [];
        let str = null;
        for (let i = 0; i < k && good; i++) { tx += dx; ty += dy; good = open(tx, ty); trav.push([tx, ty]); }
        if (!good) continue;
        if (kind === 'string') {
          tx += dx; ty += dy;
          const L = int(2, 6);
          str = stringAcross(tx, ty, dy ? 'h' : 'v', L, int(0, L - 1), d);
          if (!str.at.every(([a, b]) => free(a, b))) continue;
        } else if (kind === 'solo') {
          tx += dx; ty += dy;
          if (!free(tx, ty)) continue;
          put.push([tx, ty, { kind: 'solo', voice: pick(SOLO_VOICES), degree: d, path: true }]);
        } else if (kind === 'horn') {
          const L = 7 - d;
          if (L < 2) continue;
          const slide = L >= 3 && rnd() < 0.75;
          const P = slide ? Math.max(3, L - int(0, 3)) : L;
          const sAt = int(1, P - 2);
          for (let i = 0; i < P && good; i++) {
            tx += dx; ty += dy;
            good = free(tx, ty);
            const part = i === 0 ? 'mouthpiece' : i === P - 1 ? 'flare' : slide && i === sAt ? 'slide' : 'straight';
            put.push([tx, ty, { kind: 'brass', part, rot: part === 'straight' ? (dy ? 90 : 0) : DIRROT[dir], ...(part === 'slide' ? { extend: L - P } : {}) }]);
          }
          if (!good) continue;
        } else {
          tx += dx; ty += dy;
          if (!free(tx, ty)) continue;
          put.push([tx, ty, { kind: 'timpani', degree: d }]);
        }
        const commit = () => {
          for (const [a, b] of trav) if (!cells.has(key(a, b))) cells.set(key(a, b), { kind: 'path' });
          if (str) lay(cells, str, { path: true });
          for (const [a, b, c] of put) cells.set(key(a, b), c);
        };
        if (last) { commit(); ok = true; break outer; }
        const ex = tx + dx, ey = ty + dy;
        if (!inb(ex, ey)) continue;
        // Straight on to the next note (a harp), or out of a horn's bell.
        if (rnd() < num('straight', 0.35) && open(ex, ey)) { commit(); x = tx; y = ty; ok = true; break outer; }
        const turn = rnd() < 0.5 ? CW[dir] : CCW[dir];
        for (const out of [turn, turn === CW[dir] ? CCW[dir] : CW[dir]]) {
          const rot = ROT[`${dir}>${out}`];
          const c = cells.get(key(ex, ey));
          if (c && !(c.kind === 'drum' && c.rot === rot)) continue;
          if (!inb(ex + DIRS[out][0], ey + DIRS[out][1])) continue;
          commit();
          if (!c) cells.set(key(ex, ey), { kind: 'drum', rot, path: true, din: dir, dout: out, next: n + 1 });
          x = ex; y = ey; dir = out; ok = true; break outer;
        }
      }
    }
    if (!ok) return null;
  }
  return cells;
}

// Pieces off the path: lures (the other way out of a drum, with the right next
// note) or decoys (anywhere, any note). Each is a string or a little instrument.
function scatter(cells, n, lure) {
  const free = (tx, ty) => inb(tx, ty) && !cells.has(key(tx, ty));
  const drums = shuffle([...cells.entries()].filter(([, c]) => c.kind === 'drum' && c.path && c.next < target.length));
  for (let tries = 0; n > 0 && tries < 400; tries++) {
    let cx, cy, axis, degree;
    if (lure) {
      if (!drums.length) return;
      const [k, c] = drums.pop();
      const [x0, y0] = k.split(',').map(Number);
      const wrong = c.dout === CW[c.din] ? CCW[c.din] : CW[c.din];
      const [dx, dy] = DIRS[wrong];
      const gap = int(1, 3);
      cx = x0 + dx * gap; cy = y0 + dy * gap;
      axis = dy ? 'h' : 'v';
      degree = target[c.next];
    } else {
      cx = int(0, W - 1); cy = int(0, H - 1);
      axis = rnd() < 0.5 ? 'h' : 'v';
      degree = int(0, 6);
    }
    if (rnd() < 0.35) {
      if (!free(cx, cy)) continue;
      cells.set(key(cx, cy), { kind: 'solo', voice: pick(SOLO_VOICES), degree });
    } else {
      const L = int(2, 6);
      const s = stringAcross(cx, cy, axis, L, int(0, L - 1), degree);
      if (!s.at.every(([a, b]) => free(a, b))) continue;
      lay(cells, s);
    }
    n--;
  }
}

const SOLO_CH = { violin: 'v', trumpet: 'y', flute: 'f' };
const BRASS_CH = { mouthpiece: 'M', flare: 'Y', slide: 'S' };
function toDay(cells, launch, solution = []) {
  const rows = Array.from({ length: H }, () => Array(W).fill('.'));
  const overrides = [];
  for (const [k, c] of cells) {
    const [x, y] = k.split(',').map(Number);
    const can = c.can ? { can: c.can } : {};
    if (c.kind === 'taut') rows[y][x] = c.axis === 'v' ? 'H' : '=';
    if (c.kind === 'peg') { rows[y][x] = 'o'; overrides.push({ x, y, wraps: c.wraps, ...can }); }
    if (c.kind === 'solo') { rows[y][x] = SOLO_CH[c.voice]; overrides.push({ x, y, degree: c.degree, ...can }); }
    if (c.kind === 'drum') { rows[y][x] = c.part ??= pick(['b', 'b', 't', 's']); overrides.push({ x, y, rot: c.rot, ...can }); }
    if (c.kind === 'brass') {
      rows[y][x] = c.part === 'straight' ? (c.rot === 90 ? '|' : '-') : BRASS_CH[c.part];
      if (c.part !== 'straight') overrides.push({ x, y, rot: c.rot, ...(c.extend != null ? { extend: c.extend } : {}), ...can });
    }
    if (c.kind === 'timpani') { rows[y][x] = 'p'; overrides.push({ x, y, degree: c.degree, ...can }); }
  }
  overrides.sort((a, b) => a.y - b.y || a.x - b.x);
  return {
    id: 'day-NN', title: '', hint: '',
    music: { root: motif.key.root, mode: motif.key.mode, bpm: 108 }, motif,
    launch: { x: launch.x, y: launch.y, dir: launch.dir }, layout: rows.map(r => r.join('')), overrides, solution,
  };
}

const plays = (day, touches = []) => { const b = new Board(day); applySolution(b, touches); b.simulate(); return b.solved && !hornProblems(b.room).length; };

// Slide one end of a string along its axis by `by` tiles (out is positive) and
// relay its tiles: what a peg block does under a finger. Returns the peg's new
// tile, or null when the string would leave the board, hit something, or vanish.
function slide(cells, sid, end, by) {
  const mine = [...cells.entries()].filter(([, c]) => c.sid === sid).map(([k, c]) => [...k.split(',').map(Number), c]);
  const pegs = mine.filter(([, , c]) => c.kind === 'peg');
  const axis = pegs[0][2].axis;
  const along = ([x, y]) => axis === 'h' ? x : y;
  pegs.sort((p, q) => along(p) - along(q));
  const [lo, hi] = pegs;
  const moving = end === 'a' ? lo : hi, other = end === 'a' ? hi : lo;
  const sign = end === 'a' ? -1 : 1;
  const [ax, ay] = axis === 'h' ? [1, 0] : [0, 1];
  const to = [moving[0] + ax * sign * by, moving[1] + ay * sign * by];
  const len = Math.abs(along(to) - along(other)) - 1;
  if (len < 1 || !inb(...to)) return null;
  const span = [];
  const [a, b] = along(to) < along(other) ? [to, other] : [other, to];
  for (let i = 1; i <= len; i++) span.push([a[0] + ax * i, a[1] + ay * i]);
  const ours = new Set(mine.map(([x, y]) => key(x, y)));
  if (![to, ...span].every(([x, y]) => inb(x, y) && (!cells.has(key(x, y)) || ours.has(key(x, y))))) return null;
  const path = moving[2].path, peg = moving[2];
  for (const [x, y, c] of mine) if (c.kind === 'taut' || c === peg) cells.delete(key(x, y));
  cells.set(key(...to), peg);
  for (const [x, y] of span) cells.set(key(x, y), { kind: 'taut', sid, axis, ...(path ? { path } : {}) });
  return to;
}

const turns = num('turns', 2), winds = num('winds', 2), slides = num('slides', 1), trays = num('trays', 0);
let found = null;
for (let a = 0; a < num('tries', 6000) && !found; a++) {
  const r0 = rnd();
  const launch = r0 < 0.6 ? { x: int(0, W - 1), y: H - 1, dir: 'up' }
    : r0 < 0.8 ? { x: 0, y: int(0, H - 1), dir: 'right' } : { x: W - 1, y: int(0, H - 1), dir: 'left' };
  const cells = walk(launch);
  if (!cells || !plays(toDay(cells, launch))) continue;
  scatter(cells, num('lures', 2), true);
  scatter(cells, num('decoys', 3), false);
  if (!plays(toDay(cells, launch))) continue;

  // Scramble: each change is recorded as the touches that undo it. Moves come
  // first in the answer, so a tap names the tile a piece ends up on.
  const moves = [], taps = [];
  const drums = shuffle([...cells.entries()].filter(([, c]) => c.kind === 'drum' && c.path));
  const strs = shuffle([...new Set([...cells.values()].filter(c => c.kind === 'peg' && c.path).map(c => c.sid))]);
  const solos = shuffle([...cells.entries()].filter(([, c]) => c.kind === 'solo' && c.path));
  if (drums.length < turns || strs.length < winds + slides || solos.length < trays) continue;
  for (const [k, c] of drums.slice(0, turns)) {
    const t = int(1, 3);
    c.can = 'turn';
    c.rot = ((c.rot - t * 90) % 360 + 360) % 360;
    taps.push({ tap: k.split(',').map(Number), times: t });
  }
  for (const sid of strs.slice(0, winds)) {
    const [k, c] = pick([...cells.entries()].filter(([, c]) => c.sid === sid && c.kind === 'peg'));
    const t = int(1, 3);
    c.can = 'turn';
    c.wraps = ((c.wraps - t) % 4 + 4) % 4;
    taps.push({ tap: k.split(',').map(Number), times: t });
  }
  let stuck = false;
  for (const sid of strs.slice(winds, winds + slides)) {
    const end = pick(['a', 'b']);
    const home = [...cells.entries()].filter(([, c]) => c.sid === sid && c.kind === 'peg');
    let to = null;
    for (const by of shuffle([-2, -1, 1, 2, 3])) if ((to = slide(cells, sid, end, by))) break;
    if (!to) { stuck = true; break; }
    const peg = cells.get(key(...to));
    peg.can = 'move';
    const from = home.find(([, c]) => c === peg)[0].split(',').map(Number);
    moves.push({ move: [to, from] });
  }
  if (stuck) continue;
  const empty = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!cells.has(key(x, y))) empty.push([x, y]);
  for (const [k, c] of solos.slice(0, trays)) {
    const [fx, fy] = empty.splice(int(0, empty.length - 1), 1)[0];
    cells.delete(k);
    cells.set(key(fx, fy), { ...c, can: 'move' });
    moves.push({ move: [[fx, fy], k.split(',').map(Number)] });
  }
  const solution = [...moves, ...taps];
  const day = toDay(cells, launch, solution);
  if (plays(day) || !plays(day, solution)) continue;
  if (num('unique', 1)) {
    const s = solve(day, { max: num('max', 3e6) });
    if (s.tooBig || s.solutions !== 1) continue;
    found = { day, s };
  } else found = { day, s: null };
}
if (!found) { console.error('No board found. Try another seed, fewer handles, or more tries=.'); process.exit(1); }
const { day, s } = found;
console.log(JSON.stringify(day, null, 1));
console.error(day.layout.map((r, i) => `${String(i).padStart(3)} ${r.split('').join(' ')}${i === day.launch.y ? `   <- Coda at x=${day.launch.x}, facing ${day.launch.dir}` : ''}`).join('\n'));
console.error(s ? `${s.configs} configurations, ${s.solutions} plays the tune, fewest touches ${s.fewest}` : 'not counted (unique=0): check it with node tools/daily-solve.mjs');
