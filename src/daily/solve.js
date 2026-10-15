// Every way a day can be set, played: how many play the tune, and the fewest
// touches that does it. A board only a solver can finish, or one that a random
// tap finishes, both show up here as numbers.
//
// Brute force on purpose. A configuration is a list of touches (drags first, then
// taps) applied to a fresh Board exactly as a finger applies them, so the solver
// and the page cannot disagree about what a touch does. Each run stops at the
// first wrong note, which is where nearly every configuration ends.

import { Board, handlesOf } from './board.js';

// The choices for one handle. A tap count, and for a piece that moves, where to.
function choices(board, h, taken) {
  const taps = Array.from({ length: h.states }, (_, i) => i);
  if (!h.move) return taps.map(n => ({ taps: n }));
  const out = [];
  const { x: hx, y: hy } = h.piece;
  for (let y = 0; y < board.room.height; y++) {
    for (let x = 0; x < board.room.width; x++) {
      const home = x === hx && y === hy;
      if (!home && (board.pieceAt(x, y) || board.isLauncher(x, y) || taken.has(`${x},${y}`))) continue;
      for (const n of (h.turn ? taps : [0])) out.push({ to: home ? null : [x, y], taps: n });
    }
  }
  return out;
}

export function space(day) {
  const b = new Board(day);
  let n = 1;
  for (const h of b.handles()) n *= choices(b, h, new Set()).length;
  return n;
}

// { configs, solutions, best: touches[] | null, fewest } over the whole space,
// or `{ tooBig }` past `max` configurations.
export function solve(day, { max = 3e6, keep = 5 } = {}) {
  const probe = new Board(day);
  const hs = probe.handles();
  const total = space(day);
  if (total > max) return { tooBig: true, configs: total };

  let configs = 0, solutions = 0, fewest = Infinity;
  const best = [];
  const moved = new Set();

  const play = (picks) => {
    configs++;
    const b = new Board(day);
    const touches = [];
    for (const [h, c] of picks) {
      if (h.launcher) { if (c.taps) touches.push({ tap: [b.launch.x, b.launch.y], times: c.taps }); continue; }
      let { x, y } = h.piece;
      if (c.to) { touches.push({ move: [[x, y], c.to] }); [x, y] = c.to; }
      if (c.taps) touches.push({ tap: [x, y], times: c.taps });
    }
    for (const t of touches) if (t.move) b.move({ x: t.move[0][0], y: t.move[0][1] }, { x: t.move[1][0], y: t.move[1][1] });
    for (const t of touches) if (t.tap) for (let i = 0; i < t.times; i++) b.tap(t.tap[0], t.tap[1]);
    if (!b.simulate().verdict || !b.solved) return;
    solutions++;
    const cost = touches.reduce((s, t) => s + (t.move ? 1 : t.times), 0);
    if (cost < fewest) { fewest = cost; best.length = 0; }
    if (cost === fewest && best.length < keep) best.push(touches);
  };

  const walk = (i, picks) => {
    if (i === hs.length) { play(picks); return; }
    const h = hs[i];
    for (const c of choices(probe, h, moved)) {
      const k = c.to ? `${c.to[0]},${c.to[1]}` : null;
      if (k) moved.add(k);
      walk(i + 1, [...picks, [h, c]]);
      if (k) moved.delete(k);
    }
  };
  walk(0, []);
  return { configs, solutions, fewest: solutions ? fewest : null, best };
}

export { handlesOf };
