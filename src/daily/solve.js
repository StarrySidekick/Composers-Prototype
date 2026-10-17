// Every way a day can be set, played: how many play the tune, and the fewest
// touches that does it. A board only a solver can finish, or one that a random
// tap finishes, both show up here as numbers.
//
// Brute force on purpose. A configuration is a list of touches (drags first, then
// taps) applied to a fresh Board exactly as a finger applies them, so the solver
// and the page cannot disagree about what a touch does. Each run is a quick one
// (Board `quick`): it stops at the first wrong note, which is where nearly every
// configuration ends, where a real run plays on to the end.
//
// Touches before the wave goes, only. A day that needs a touch in flight shows
// up here as no answer at all, which is how its test proves the touch is needed.

import { Board } from './board.js';

// The choices for one handle: a tap count, or where a movable piece goes (any
// tile Board.canMove allows, so a peg only slides along its string).
function choices(board, h) {
  const taps = Array.from({ length: h.states }, (_, i) => i);
  if (!h.move) return taps.map(n => ({ taps: n }));
  const from = { x: h.piece.x, y: h.piece.y };
  const out = [];
  for (let y = 0; y < board.room.height; y++) {
    for (let x = 0; x < board.room.width; x++) {
      const home = x === from.x && y === from.y;
      if (!home && !board.canMove(from, { x, y })) continue;
      for (const n of (h.turn || h.tune ? taps : [0])) out.push({ to: home ? null : [x, y], taps: n });
    }
  }
  return out;
}

export function space(day) {
  const b = new Board(day);
  return b.handles().reduce((n, h) => n * choices(b, h).length, 1);
}

// { configs, solutions, best: touches[] | null, fewest } over the whole space,
// or `{ tooBig }` past `max` configurations. A drag that cannot happen once the
// other pieces have moved (two pieces sent to one tile) is not a configuration.
export function solve(day, { max = 3e6, keep = 5 } = {}) {
  const probe = new Board(day);
  const hs = probe.handles();
  const options = hs.map(h => choices(probe, h));
  const total = options.reduce((n, o) => n * o.length, 1);
  if (total > max) return { tooBig: true, configs: total };

  let configs = 0, solutions = 0, fewest = Infinity;
  const best = [];

  const play = (picks) => {
    const b = new Board(day, { quick: true });
    const touches = [];
    const moves = [], taps = [];
    for (const [h, c] of picks) {
      let { x, y } = h.piece;
      if (c.to) { moves.push({ move: [[x, y], c.to] }); [x, y] = c.to; }
      if (c.taps) taps.push({ tap: [x, y], times: c.taps });
    }
    for (const t of moves) if (!b.move({ x: t.move[0][0], y: t.move[0][1] }, { x: t.move[1][0], y: t.move[1][1] })) return;
    for (const t of taps) for (let i = 0; i < t.times; i++) b.tap(t.tap[0], t.tap[1]);
    touches.push(...moves, ...taps);
    configs++;
    b.simulate();
    if (!b.solved) return;
    solutions++;
    const cost = touches.reduce((s, t) => s + (t.tap ? t.times : 1), 0);
    if (cost < fewest) { fewest = cost; best.length = 0; }
    if (cost === fewest && best.length < keep) best.push(touches);
  };

  const walk = (i, picks) => {
    if (i === hs.length) { play(picks); return; }
    for (const c of options[i]) walk(i + 1, [...picks, [hs[i], c]]);
  };
  walk(0, []);
  return { configs, solutions, fewest: solutions ? fewest : null, best };
}
