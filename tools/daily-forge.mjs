// A daily board for a motif, made by search: the tool days 7, 8 and 9 came from.
//
//   node tools/daily-forge.mjs motif=my-motif.json seed=3 turns=4 tunes=2 moves=1
//   node tools/daily-forge.mjs day=8 seed=4 horn=0.8      (another board for day 8's tune)
//
// motif=  a motif as the songbook's "Copy motif" gives it (docs/MUSIC.md), saved
//         to a file. day= takes one of daily/days.json instead.
// seed=   a different seed, a different board. Try several; keep the one you like.
// turns=  drums on the way that start turned wrong        (default 4)
// tunes=  slides and a timpani that start tuned wrong       (default 0)
// moves=  drums on the way that start somewhere else        (default 0)
// lures=  strings with the RIGHT next note, the wrong way out of a drum (default 2)
// decoys= strings anywhere else                             (default 3)
// horn=   how often a note is a horn rather than a string, 0 to 1 (default 0.4)
// timpani=1  the last note may be a timpani (absorbs: it can only be last)
//
// How: it walks a path from a launcher, note by note. Each note is a string of
// its length (7 - degree, the castle's rule) or a straight horn of that length
// (a slide makes up some of it), entered along the way the wave is going, then a
// drum turns it, unless a horn's bell carries on straight. Strings never touch
// another string (they would be one string), and a wave may cross a string
// silently. Then lures and decoys, then the handles are scrambled, and the board
// is kept only if it does not play the tune untouched, its scramble played back
// does, and the solver (src/daily/solve.js) finds that one setting and no other.
//
// It prints a day for daily/days.json (give it an id, a title and a hint), the
// board, and the solver's count. Flutes and loops are not in its vocabulary: days
// 4, 6 and 10 were made by hand. Node only.

import { readFileSync } from 'node:fs';
import { Board, applySolution, targetOf } from '../src/daily/board.js';
import { solve } from '../src/daily/solve.js';
import { hornProblems } from '../src/doodads/brass.js';

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
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

const DIRS = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };
const CW = { up: 'right', right: 'down', down: 'left', left: 'up' };
const CCW = { up: 'left', left: 'down', down: 'right', right: 'up' };
// The drum rotation that turns a wave going `in` to `out` (src/doodads/percussion.js).
const ROT = { 'right>up': 0, 'down>left': 0, 'left>up': 90, 'down>right': 90, 'left>down': 180, 'up>right': 180, 'right>down': 270, 'up>left': 270 };
const DIRROT = { right: 0, down: 90, left: 180, up: 270 };
const key = (x, y) => `${x},${y}`;
const inb = (x, y) => x >= 0 && y >= 0 && x < W && y < H;

// One path that plays the tune, or null.
function lay(launch) {
  const cells = new Map([[key(launch.x, launch.y), { kind: 'launch' }]]);
  let runs = 0, { x, y, dir } = launch;
  const nearString = (tx, ty, run) => Object.values(DIRS).some(([dx, dy]) => { const c = cells.get(key(tx + dx, ty + dy)); return c?.kind === 'string' && c.run !== run; });
  const passable = (tx, ty, d) => {
    if (!inb(tx, ty)) return false;
    const c = cells.get(key(tx, ty));
    if (!c || c.kind === 'path' || c.kind === 'launch') return true;
    return c.kind === 'string' && c.axis !== (d === 'up' || d === 'down' ? 'v' : 'h');   // across it: silent
  };
  for (let n = 0; n < target.length; n++) {
    const d = target[n], L = 7 - d, last = n === target.length - 1;
    const kinds = shuffle(rnd() < num('horn', 0.4) ? ['horn', 'string'] : ['string', 'horn']);
    if (last && num('timpani', 0)) kinds.unshift('timpani');
    let ok = false;
    outer: for (const k of shuffle([0, 0, 1, 1, 2])) {
      for (const kind of kinds) {
        const [dx, dy] = DIRS[dir];
        let tx = x, ty = y, good = true;
        const trav = [], piece = [];
        for (let i = 0; i < k && good; i++) { tx += dx; ty += dy; good = passable(tx, ty, dir); trav.push([tx, ty]); }
        if (!good) continue;
        if (kind === 'string') {
          const run = ++runs;
          for (let i = 0; i < L && good; i++) {
            tx += dx; ty += dy;
            good = inb(tx, ty) && !cells.has(key(tx, ty)) && !nearString(tx, ty, run);
            piece.push([tx, ty, { kind: 'string', run, axis: dy ? 'v' : 'h' }]);
          }
        } else if (kind === 'horn') {
          if (L < 2) continue;
          const slide = L >= 3 && rnd() < 0.75;
          const P = slide ? Math.max(3, L - Math.floor(rnd() * 4)) : L;
          const sAt = 1 + Math.floor(rnd() * (P - 2));
          for (let i = 0; i < P && good; i++) {
            tx += dx; ty += dy;
            good = inb(tx, ty) && !cells.has(key(tx, ty));
            const part = i === 0 ? 'mouthpiece' : i === P - 1 ? 'flare' : slide && i === sAt ? 'slide' : 'straight';
            piece.push([tx, ty, { kind: 'brass', part, rot: part === 'straight' ? (dy ? 90 : 0) : DIRROT[dir], ...(part === 'slide' ? { extend: L - P } : {}) }]);
          }
        } else {
          tx += dx; ty += dy;
          good = inb(tx, ty) && !cells.has(key(tx, ty));
          piece.push([tx, ty, { kind: 'timpani', degree: d }]);
        }
        if (!good) continue;
        const commit = () => {
          for (const [a, b] of trav) if (!cells.has(key(a, b))) cells.set(key(a, b), { kind: 'path' });
          for (const [a, b, c] of piece) cells.set(key(a, b), c);
        };
        if (last) { commit(); ok = true; break outer; }
        const ex = tx + dx, ey = ty + dy;
        if (!inb(ex, ey)) continue;
        if (kind === 'horn' && rnd() < 0.3 && !cells.has(key(ex, ey))) { commit(); x = tx; y = ty; ok = true; break outer; }
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

// Strings off the path: lures (the other way out of a drum, the right next note)
// or decoys (anywhere).
function strings(cells, n, lure) {
  const drums = shuffle([...cells.entries()].filter(([, c]) => c.kind === 'drum' && c.path && c.next < target.length));
  for (let tries = 0; n > 0 && tries < 400; tries++) {
    let x0, y0, dx, dy, L;
    if (lure) {
      if (!drums.length) return;
      const [k, c] = drums.pop();
      [x0, y0] = k.split(',').map(Number);
      [dx, dy] = DIRS[c.dout === CW[c.din] ? CCW[c.din] : CW[c.din]];
      L = 7 - target[c.next];
      const gap = Math.floor(rnd() * 3);
      x0 += dx * (gap + 1); y0 += dy * (gap + 1);
    } else {
      [dx, dy] = rnd() < 0.5 ? [0, 1] : [1, 0];
      L = 1 + Math.floor(rnd() * 6);
      x0 = Math.floor(rnd() * W); y0 = Math.floor(rnd() * H);
    }
    const tiles = [];
    let good = true;
    for (let j = 0; j < L && good; j++) {
      const x = x0 + dx * j, y = y0 + dy * j;
      good = inb(x, y) && !cells.has(key(x, y)) && !Object.values(DIRS).some(([ax, ay]) => cells.get(key(x + ax, y + ay))?.kind === 'string');
      tiles.push([x, y]);
    }
    if (!good) continue;
    for (const [x, y] of tiles) cells.set(key(x, y), { kind: 'string', run: 9000 + tries, axis: dy ? 'v' : 'h' });
    n--;
  }
}

const CH = { mouthpiece: 'M', flare: 'Y', slide: 'S' };
function toDay(cells, launch, solution = []) {
  const rows = Array.from({ length: H }, () => Array(W).fill('.'));
  const overrides = [];
  for (const [k, c] of cells) {
    const [x, y] = k.split(',').map(Number);
    const can = c.can ? { can: c.can } : {};
    if (c.kind === 'string') rows[y][x] = c.axis === 'v' ? 'H' : '=';
    if (c.kind === 'drum') { rows[y][x] = c.part ??= pick(['b', 'b', 't', 's']); overrides.push({ x, y, rot: c.rot, ...can }); }
    if (c.kind === 'brass') {
      rows[y][x] = c.part === 'straight' ? (c.rot === 90 ? '|' : '-') : CH[c.part];
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

const turns = num('turns', 4), tunes = num('tunes', 0), moves = num('moves', 0);
let found = null;
for (let a = 0; a < num('tries', 6000) && !found; a++) {
  const r0 = rnd();
  const launch = r0 < 0.6 ? { x: Math.floor(rnd() * W), y: H - 1, dir: 'up' }
    : r0 < 0.8 ? { x: 0, y: Math.floor(rnd() * H), dir: 'right' } : { x: W - 1, y: Math.floor(rnd() * H), dir: 'left' };
  const cells = lay(launch);
  if (!cells || !plays(toDay(cells, launch))) continue;
  strings(cells, num('lures', 2), true);
  strings(cells, num('decoys', 3), false);
  if (!plays(toDay(cells, launch))) continue;

  // Scramble: each change is recorded as the touches that undo it.
  const solution = [];
  const drums = shuffle([...cells.entries()].filter(([, c]) => c.kind === 'drum' && c.path));
  const tunable = shuffle([...cells.entries()].filter(([, c]) => c.part === 'slide' || c.kind === 'timpani'));
  if (drums.length < turns + moves || tunable.length < tunes) continue;
  for (const [k, c] of drums.slice(0, turns)) {
    const taps = 1 + Math.floor(rnd() * 2);
    c.can = 'turn';
    c.rot = ((c.rot - taps * 90) % 360 + 360) % 360;
    solution.push({ tap: k.split(',').map(Number), times: taps });
  }
  for (const [k, c] of tunable.slice(0, tunes)) {
    const states = c.kind === 'timpani' ? 7 : 4;
    const taps = 1 + Math.floor(rnd() * (states - 1));
    c.can = 'tune';
    if (c.kind === 'timpani') c.degree = ((c.degree - taps) % 7 + 7) % 7;
    else c.extend = ((c.extend - taps) % 4 + 4) % 4;
    solution.push({ tap: k.split(',').map(Number), times: taps });
  }
  const free = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!cells.has(key(x, y))) free.push([x, y]);
  for (const [k, c] of drums.slice(turns, turns + moves)) {
    const [fx, fy] = free.splice(Math.floor(rnd() * free.length), 1)[0];
    cells.delete(k);
    cells.set(key(fx, fy), { ...c, can: 'move' });
    solution.unshift({ move: [[fx, fy], k.split(',').map(Number)] });
  }
  const day = toDay(cells, launch, solution);
  if (plays(day) || !plays(day, solution)) continue;
  const s = solve(day, { max: num('max', 3e6) });
  if (!s.tooBig && s.solutions === 1) found = { day, s };
}
if (!found) { console.error('No board found. Try another seed, fewer handles, or more tries=.'); process.exit(1); }
const { day, s } = found;
console.log(JSON.stringify(day, null, 1));
console.error(day.layout.map((r, i) => `${String(i).padStart(3)} ${r.split('').join(' ')}${i === day.launch.y ? `   <- launcher at x=${day.launch.x}, facing ${day.launch.dir}` : ''}`).join('\n'));
console.error(`${s.configs} configurations, ${s.solutions} plays the tune, fewest touches ${s.fewest}`);
