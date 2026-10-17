// A daily board for a tune, made by search, on the board's own rules (docs/DAILY.md):
// Coda under the bottom-left tile sending the wave up, strings crossed, pegs that
// wind and slide, little instruments with one note, drums that turn it, and a run
// that must end by itself after the tune's last note.
//
//   node tools/daily-forge.mjs motif=tune.json seed=3 bpm=100
//   node tools/daily-forge.mjs day=4 seed=7 winds=3 slides=1     (another board for day 4's tune)
//
// motif=   a motif as the songbook's "Copy motif" gives it (docs/MUSIC.md), saved
//          to a file. day= takes one of daily/days.json instead.
// seed=    a different seed, a different board. Try several; keep the one you like.
// bpm=     the day's tempo (default the motif's)
// turns=   drums on the way that start turned wrong                 (default 2)
// winds=   strings on the way with a peg wound wrong                (default 2)
// slides=  strings on the way with a peg block slid off its length  (default 1)
// tunes=   horn slides and a timpani that start tuned wrong          (default 0)
// trays=   little instruments on the way that start off it          (default 0)
// timed=1  the wave comes back through one drum that must face a new way the
//          second time: a touch in flight, between the two visits
// window=  with timed=1, the least number of steps between those visits: the
//          time a thumb has to make the touch                      (default 0)
// lures=   a piece with the RIGHT next note, the wrong way out of a drum (default 1)
// decoys=  strings and little instruments anywhere else             (default 0)
// decoysolo= how often a lure or decoy is a little instrument       (default 0.35)
// solo=    how often a note is a little instrument, 0 to 1          (default 0.25)
// horn=    how often a note is a horn, 0 to 1                       (default 0.1)
// reuse=   how often a repeated note crosses a piece already there  (default 0.7)
// straight= how often the wave goes straight on to the next note    (default 0.4)
// leadin=  how often it starts up the left edge and turns right     (default 0.7)
// fill=    the least share of the board the road and its instruments must
//          use, 0 to 1; the rest is blocks                         (default 0)
// timpani=1  the last note may be a timpani (it absorbs, so only last)
// unique=0   keep a board with more than one answer, or too big to count
//
// How: it walks a path from Coda, note by note. A note is a string laid ACROSS
// the path (2 to 6 tiles, wraps on its pegs chosen so 7 - length + wraps is the
// degree), a little instrument on the path, a straight horn 7 - degree long (a
// slide making up some of it), or, for a note the board already has straight
// ahead, that piece crossed again. Between notes the wave goes straight on, or a
// drum turns it. After the last note it runs into a block (or off the board),
// so it ends without another sound. Then a lure, then the handles are
// scrambled, each change recorded as the touches that undo it, then every tile
// left over becomes a solid block (Timothy, 2026-10-17: nothing vestigial, red
// herrings sparingly, blocks where no instrument is), and the board is kept
// only if it is not the tune untouched, its scramble played back is, and the
// solver (src/daily/solve.js) finds that answer and no other; with timed=1,
// finds NO answer, since without the touch in flight there is none.
//
// It prints a day for daily/days.json (give it an id, a title and a hint), the
// board, and the solver's count. A trayed instrument can go to any free tile, a
// hundred choices each, so a board with trays is usually too big to count: pass
// unique=0 and check it with node tools/daily-solve.mjs. Flutes with holes are
// not in its vocabulary. Node only.

import { readFileSync } from 'node:fs';
import { Board, applySolution, timedOf, targetOf, CODA, COLS, ROWS } from '../src/daily/board.js';
import { solve } from '../src/daily/solve.js';
import { hornProblems } from '../src/doodads/brass.js';
import { SOLO_VOICES } from '../src/daily/pieces.js';

const A = Object.fromEntries(process.argv.slice(2).map(a => a.split('=')));
const num = (k, d) => Number(A[k] ?? d);
const W = COLS, H = ROWS;
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
  return { at, axis, wa, wb: w - wa, degree };
}

// One string's cells into the board: { kind: 'peg' } at each end, 'taut' between.
function lay(cells, s, extra = {}) {
  const sid = `s${cells.size}`;
  s.at.forEach(([x, y], i) => {
    const end = i === 0 ? 'a' : i === s.at.length - 1 ? 'b' : null;
    cells.set(key(x, y), end
      ? { kind: 'peg', sid, axis: s.axis, wraps: end === 'a' ? s.wa : s.wb, ...extra }
      : { kind: 'taut', sid, axis: s.axis, degree: s.degree, ...extra });
  });
  return sid;
}

// Why attempts were thrown away, printed with verbose=1: the knob to turn next.
const why = {};
const no = (r) => { why[r] = (why[r] ?? 0) + 1; };

// One path that plays the tune and then ends, or null. A depth-first search
// with a budget: each note tries its options in a random order, and a note that
// fits nowhere sends the search back to try the last one another way. The board
// is a Map of tile -> cell, copied at each step so a dead end costs nothing to
// undo.
function walk() {
  const timed = !!num('timed', 0);
  let budget = num('budget', 3000);
  const start = new Map();
  let x = CODA.x, y = CODA.y, dir = 'up';
  // A lead-in: up the left edge a way, then a drum turns the wave right. Without
  // one the first note is on column 0, where no string fits (a peg would be off
  // the board), so a day of strings only always has one.
  const stringsOnly = !num('solo', 0.25) && !num('horn', 0.1);
  if (stringsOnly || rnd() < num('leadin', 0.7)) {
    const up = int(0, H - 2);
    for (let i = 0; i < up; i++) start.set(key(0, H - 1 - i), { kind: 'path' });
    y = H - 1 - up;
    start.set(key(0, y), { kind: 'drum', rot: ROT['up>right'], path: true, din: 'up', dout: 'right', next: 0 });
    dir = 'right';
  }
  const go = (cells, n, x, y, dir, retimed) => {
    if (--budget < 0) return null;
    if (n === target.length) return timed && !retimed ? null : cells;
    let tried = 0;
    for (const o of options(cells, n, x, y, dir, retimed)) {
      if (++tried > 14) break;
      const r = go(o.cells, n + 1, o.x, o.y, o.dir, o.retimed);
      if (r) return r;
    }
    if (n >= target.length - 1 || budget <= 0) no(`path stuck at note ${n + 1}`);
    return null;
  };
  return go(start, 0, x, y, dir, null);
}

// Every way note n can be played from here, one at a time, in a random order:
// the piece, then where the wave goes after it. Each comes with its own copy of
// the board.
function* options(cells, n, x, y, dir, retimed) {
  const d = target[n], last = n === target.length - 1;
  const free = (tx, ty) => inb(tx, ty) && !cells.has(key(tx, ty));
  const open = (tx, ty) => inb(tx, ty) && (!cells.has(key(tx, ty)) || cells.get(key(tx, ty)).kind === 'path');
  // A quiet end after the last note: off the board, into a peg, or into a
  // block laid on the next tile.
  const lane = (tx, ty, dd) => {
    const [dx, dy] = DIRS[dd];
    const nx = tx + dx, ny = ty + dy;
    if (!inb(nx, ny)) return [];
    const c = cells.get(key(nx, ny));
    if (!c) return [[nx, ny]];
    return c.kind === 'peg' || c.kind === 'block' ? [] : null;
  };
  const r = rnd();
  const first = r < num('solo', 0.25) ? 'solo' : r < num('solo', 0.25) + num('horn', 0.1) ? 'horn' : 'string';
  // A kind set to 0 is never used, not even when the others do not fit.
  const allowed = ['string', 'solo', 'horn'].filter(k => k === 'string' || num(k, k === 'solo' ? 0.25 : 0.1) > 0);
  const kinds = [first, ...shuffle(allowed.filter(k => k !== first))];
  if (rnd() < num('reuse', 0.7)) kinds.unshift('reuse'); else kinds.push('reuse');
  if (last && num('timpani', 0)) kinds.unshift('timpani');
  const [dx, dy] = DIRS[dir];
  for (const k of shuffle([0, 0, 1, 1, 2, 3])) {
    for (const kind of kinds) {
      let tx = x, ty = y, good = true;
      const trav = [], put = [];
      let str = null;
      for (let i = 0; i < k && good; i++) { tx += dx; ty += dy; good = open(tx, ty); trav.push([tx, ty]); }
      if (!good) continue;
      if (kind === 'reuse') {
        // A piece already on the board, straight ahead, with this note: cross it again.
        tx += dx; ty += dy;
        const c = cells.get(key(tx, ty));
        const across = dy ? 'h' : 'v';
        if (!c || !((c.kind === 'taut' && c.axis === across && c.degree === d) || (c.kind === 'solo' && c.degree === d))) continue;
      } else if (kind === 'string') {
        tx += dx; ty += dy;
        // A few lengths and offsets: a string needs a whole free line.
        for (let t = 0; t < 6 && !str; t++) {
          const L = int(2, 6);
          const s = stringAcross(tx, ty, dy ? 'h' : 'v', L, int(0, L - 1), d);
          if (s.at.every(([a, b]) => free(a, b))) str = s;
        }
        if (!str) continue;
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
      const laid = () => {
        const c2 = new Map(cells);
        for (const [a, b] of trav) if (!c2.has(key(a, b))) c2.set(key(a, b), { kind: 'path' });
        if (str) lay(c2, str, { path: true });
        for (const [a, b, c] of put) c2.set(key(a, b), c);
        return c2;
      };
      if (last) {
        // The tile ahead of the last piece, never the piece itself (a string
        // lies across the way, a horn behind its bell).
        const out = kind === 'timpani' ? [] : lane(tx, ty, dir);
        if (!out) continue;
        const c2 = laid();
        for (const [a, b] of out) if (!c2.has(key(a, b))) c2.set(key(a, b), { kind: 'block', stop: true });
        yield { cells: c2, x: tx, y: ty, dir, retimed };
        continue;
      }
      const ex = tx + dx, ey = ty + dy;
      if (!inb(ex, ey)) continue;
      const ways = [];
      // Straight on to the next note (a harp), or out of a horn's bell.
      if (open(ex, ey)) ways.push('straight');
      ways.push(...shuffle([CW[dir], CCW[dir]]));
      if (ways[0] === 'straight' && rnd() > num('straight', 0.4)) ways.push(ways.shift());
      for (const out of ways) {
        if (out === 'straight') { yield { cells: laid(), x: tx, y: ty, dir, retimed }; continue; }
        const rot = ROT[`${dir}>${out}`];
        const c = cells.get(key(ex, ey));
        const again = c?.kind === 'drum' && c.rot !== rot && num('timed', 0) && !retimed && !c.retimed;
        if (c && !(c.kind === 'drum' && c.rot === rot) && !again) continue;
        if (!inb(ex + DIRS[out][0], ey + DIRS[out][1])) continue;
        const c2 = laid();
        if (again) c2.set(key(ex, ey), { ...c, retimed: true, rot2: rot });
        else if (!c) c2.set(key(ex, ey), { kind: 'drum', rot, path: true, din: dir, dout: out, next: n + 1 });
        yield { cells: c2, x: ex, y: ey, dir: out, retimed: again ? key(ex, ey) : retimed };
      }
    }
  }
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
      degree = rnd() < 0.7 ? pick(target) : int(0, 6);
    }
    if (rnd() < num('decoysolo', 0.35)) {
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
function toDay(cells, solution = []) {
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
    if (c.kind === 'block') rows[y][x] = 'Z';
  }
  overrides.sort((a, b) => a.y - b.y || a.x - b.x);
  return {
    id: 'day-NN', title: '', hint: '',
    music: { root: motif.key.root, mode: motif.key.mode, bpm: num('bpm', motif.bpm ?? 100) }, motif,
    layout: rows.map(r => r.join('')), overrides, solution,
  };
}

const plays = (day, touches = []) => {
  const b = new Board(day);
  if (!applySolution(b, touches)) return false;
  b.simulate(timedOf(touches));
  return b.solved && !b.missed.length && !hornProblems(b.room).length;
};

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
  const [a] = along(to) < along(other) ? [to, other] : [other, to];
  for (let i = 1; i <= len; i++) span.push([a[0] + ax * i, a[1] + ay * i]);
  const ours = new Set(mine.map(([x, y]) => key(x, y)));
  if (![to, ...span].every(([x, y]) => inb(x, y) && (!cells.has(key(x, y)) || ours.has(key(x, y))))) return null;
  const peg = moving[2], keep = mine.find(([, , c]) => c.kind === 'taut')?.[2] ?? {};
  for (const [x, y, c] of mine) if (c.kind === 'taut' || c === peg) cells.delete(key(x, y));
  cells.set(key(...to), peg);
  for (const [x, y] of span) cells.set(key(x, y), { kind: 'taut', sid, axis, ...(keep.path ? { path: true } : {}) });
  return to;
}

// The steps at which the wave first and second stands on a tile, as the board
// stands (no touches in flight).
function visits(day, touches, at) {
  const b = new Board(day);
  applySolution(b, touches);
  b.simulate();
  return b.trail.filter(t => key(t.x, t.y) === at).map(t => t.step);
}

const turns = num('turns', 2), winds = num('winds', 2), slides = num('slides', 1), trays = num('trays', 0), tunes = num('tunes', 0);
let found = null;
for (let a = 0; a < num('tries', 6000) && !found; a++) {
  const cells = walk();
  if (!cells) continue;
  // The retimed drum faces its first way; the touch in flight turns it the second.
  const again = [...cells.entries()].find(([, c]) => c.retimed);
  if (!again && !plays(toDay(cells))) { no('path does not play it'); continue; }
  scatter(cells, num('lures', 1), true);
  scatter(cells, num('decoys', 0), false);

  // Scramble: each change is recorded as the touches that undo it. Moves come
  // first in the answer, so a tap names the tile a piece ends up on.
  const moves = [], taps = [];
  const drums = shuffle([...cells.entries()].filter(([, c]) => c.kind === 'drum' && c.path && !c.retimed));
  const strs = shuffle([...new Set([...cells.values()].filter(c => c.kind === 'peg' && c.path).map(c => c.sid))]);
  const solos = shuffle([...cells.entries()].filter(([, c]) => c.kind === 'solo' && c.path));
  const tunable = shuffle([...cells.entries()].filter(([, c]) => c.part === 'slide' || c.kind === 'timpani'));
  if (drums.length < turns || strs.length < winds + slides || solos.length < trays || tunable.length < tunes) { no('too few pieces for the handles'); continue; }
  for (const [k, c] of tunable.slice(0, tunes)) {
    const states = c.kind === 'timpani' ? 7 : 4;
    const t = int(1, states - 1);
    c.can = 'tune';
    if (c.kind === 'timpani') c.degree = ((c.degree - t) % 7 + 7) % 7;
    else c.extend = ((c.extend - t) % 4 + 4) % 4;
    taps.push({ tap: k.split(',').map(Number), times: t });
  }
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
    // The string has to reach back home: keep its way clear of blocks.
    const [sx, sy] = [Math.sign(from[0] - to[0]), Math.sign(from[1] - to[1])];
    for (let x = to[0] + sx, y = to[1] + sy; x !== from[0] + sx || y !== from[1] + sy; x += sx, y += sy) {
      if (!cells.has(key(x, y))) cells.set(key(x, y), { kind: 'path', keep: true });
    }
  }
  if (stuck) { no('no room to slide a peg'); continue; }
  const empty = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!cells.has(key(x, y))) empty.push([x, y]);
  for (const [k, c] of solos.slice(0, trays)) {
    const [fx, fy] = empty.splice(int(0, empty.length - 1), 1)[0];
    cells.set(k, { kind: 'path' });          // its place on the road stays open
    cells.set(key(fx, fy), { ...c, can: 'move' });
    moves.push({ move: [[fx, fy], k.split(',').map(Number)] });
  }
  // Everything left over is a block.
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!cells.has(key(x, y))) cells.set(key(x, y), { kind: 'block' });
  const used = [...cells.values()].filter(c => c.kind !== 'block').length / (W * H);
  if (used < num('fill', 0)) { no('too much of the board left as blocks'); continue; }
  const solution = [...moves, ...taps];
  if (again) {
    const [k, c] = again;
    c.can = 'turn';
    const v = visits(toDay(cells), solution, k);
    if (v.length < 2) { no('timed drum not visited twice'); continue; }
    if (v[1] - v[0] < num('window', 0)) { no('too little time between the visits'); continue; }
    solution.push({ tap: k.split(',').map(Number), times: ((c.rot2 - c.rot) / 90 % 4 + 4) % 4, at: Math.floor((v[0] + v[1]) / 2) });
  }
  const day = toDay(cells, solution);
  if (plays(day)) { no('plays untouched'); continue; }
  if (!plays(day, solution)) { no('scramble does not play back'); continue; }
  if (num('unique', 1)) {
    const s = solve(day, { max: num('max', 3e6) });
    if (s.tooBig) { no('too big to count'); continue; }
    if (s.solutions !== (again ? 0 : 1)) { no(`${s.solutions} answers`); continue; }
    found = { day, s };
  } else found = { day, s: null };
}
if (num('verbose', 0) || !found) console.error(Object.entries(why).map(([k, v]) => `  ${v} x ${k}`).join('\n'));
if (!found) { console.error('No board found. Try another seed, fewer handles, or more tries=.'); process.exit(1); }
const { day, s } = found;
console.log(JSON.stringify(day, null, 1));
console.error(day.layout.map((r, i) => `${String(i).padStart(3)} ${r.split('').join(' ')}`).join('\n') + '\n    ^ Coda');
console.error(s ? `${s.configs} configurations, ${s.solutions} play the tune before the wave goes${day.solution.some(t => t.at != null) ? ' (none should: it needs the touch in flight)' : ''}, fewest touches ${s.fewest}` : 'not counted (unique=0): check it with node tools/daily-solve.mjs');
