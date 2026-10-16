// Every way a day can be set, played: how many play the tune, and the fewest
// touches that does it. A board only a solver can finish, or one that a random
// tap finishes, both show up here as numbers.
//
// Brute force on purpose. A configuration is a list of touches (drags first, then
// taps, then aiming Coda) applied to a fresh Board exactly as a finger applies
// them, so the solver and the page cannot disagree about what a touch does. Each
// run stops at the first wrong note, which is where nearly every configuration
// ends.

import { Board } from './board.js';

const AIMS = ['up', 'right', 'down', 'left'];

// The choices for one handle: a tap count, where a movable piece goes (any tile
// Board.canMove allows, so a peg only slides along its string), or Coda's aim.
function choices(board, h) {
  if (h.launcher) return AIMS.map(aim => ({ aim }));
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
    const b = new Board(day);
    const touches = [];
    const moves = [], taps = [];
    for (const [h, c] of picks) {
      if (h.launcher) { if (b.launch.dir.x !== (c.aim === 'right' ? 1 : c.aim === 'left' ? -1 : 0) || b.launch.dir.y !== (c.aim === 'down' ? 1 : c.aim === 'up' ? -1 : 0)) taps.push({ aim: c.aim }); continue; }
      let { x, y } = h.piece;
      if (c.to) { moves.push({ move: [[x, y], c.to] }); [x, y] = c.to; }
      if (c.taps) taps.push({ tap: [x, y], times: c.taps });
    }
    for (const t of moves) if (!b.move({ x: t.move[0][0], y: t.move[0][1] }, { x: t.move[1][0], y: t.move[1][1] })) return;
    for (const t of taps) {
      if (t.aim) b.aim(t.aim);
      else for (let i = 0; i < t.times; i++) b.tap(t.tap[0], t.tap[1]);
    }
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
