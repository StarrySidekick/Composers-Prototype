// The daily days, played by the solver: for authoring them, not for passing them.
//
//   node tools/daily-solve.mjs            every day
//   node tools/daily-solve.mjs 3          day 3 only
//   node tools/daily-solve.mjs 3 --trail  and draw where the wave went, untouched and solved
//
// For each day: the board, the tune, what the board plays as it stands (it must
// not be the tune), what the recorded solution plays (it must be; a touch with
// `at` is made in flight, after that many steps), and the whole space of
// touches made before the wave goes: how many configurations, how many play the
// tune, and the fewest touches that do. A day that needs a touch in flight
// should show none. One solution in a big space is a hard day; many in a
// small one is an easy day. test/daily.mjs fails on the first two; the numbers
// are for reading. Node only, no server.

import { readFileSync } from 'node:fs';
import { Board, applySolution, timedOf, SOLFEGE, handlesOf } from '../src/daily/board.js';
import { solve, space } from '../src/daily/solve.js';

const DAYS = JSON.parse(readFileSync(new URL('../daily/days.json', import.meta.url)));
const only = process.argv.slice(2).filter(a => /^\d+$/.test(a)).map(Number);
const trail = process.argv.includes('--trail');
const names = d => d.map(x => SOLFEGE[x]).join(' ');

// The board as text, from the pieces as they are now (a slid peg moves its
// string, so the layout as written is not enough). Handles after each piece:
// T turn, t tune, m move, M move and turn. A dot on a floor tile: the wave went
// there. Coda is under the bottom-left tile, so the row under the board is his.
const GLYPH = { taut: d => (d.axis === 'h' ? '=' : 'H'), tuningpeg: () => 'o', solo: d => ({ violin: 'v', trumpet: 'y', flute: 'f' }[d.voice]) };
function draw(board, path = null) {
  const seen = new Set((path ?? []).map(p => `${p.x},${p.y}`));
  const rows = [];
  for (let y = 0; y < board.room.height; y++) {
    let row = '';
    for (let x = 0; x < board.room.width; x++) {
      const d = board.pieceAt(x, y);
      let ch;
      if (!d) ch = seen.has(`${x},${y}`) ? '· ' : '. ';
      else {
        const h = handlesOf(d);
        const mark = h.move ? (h.turn ? 'M' : 'm') : h.turn ? 'T' : h.tune ? 't' : (seen.has(`${x},${y}`) ? '·' : ' ');
        const g = GLYPH[d.typeName]?.(d) ?? (d.typeName === 'drum' && d.mirror ? ['/', '-', '\\', '|'][(d.rot / 45) % 4] : board.room.layout[y][x]);
        ch = g + mark;
      }
      row += ch + ' ';
    }
    rows.push(`   ${String(y).padStart(2)} ${row}`);
  }
  rows.push('      @  (Coda, sending the wave up)');
  return rows.join('\n');
}

for (const [i, day] of DAYS.days.entries()) {
  const n = i + 1;
  if (only.length && !only.includes(n)) continue;
  const b0 = new Board(day);
  console.log(`\nDay ${n}: ${day.title}  (${day.music.bpm} bpm, ${['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][b0.key.root]} ${b0.key.mode})`);
  console.log(`  tune: ${names(b0.target)}   from "${day.motif.source?.title}"`);
  console.log(`  handles: ${b0.handles().map(h => `${h.piece.typeName}${h.piece.part ? '.' + h.piece.part : ''}@${h.piece.x},${h.piece.y}[${['turn', 'tune', 'move'].filter(k => h[k]).join('+')}]`).join('  ')}`);
  const as = b0.simulate();
  console.log(`  as it stands: ${as.verdict.kind}${b0.looped ? ' (went round a loop)' : ''}, heard ${names(as.heard.map(h => h.degree)) || 'nothing'} (${as.steps} steps)`);
  if (trail) console.log(draw(new Board(day), as.trail));
  const b1 = new Board(day);
  const ok = applySolution(b1, day.solution);
  const sol = b1.simulate(timedOf(day.solution));
  const say = s => (s.tap ? `tap ${s.tap}${s.times > 1 ? ' x' + s.times : ''}` : `move ${s.move[0]}->${s.move[1]}`) + (s.at != null ? ` in flight at step ${s.at}` : '');
  console.log(`  solution (${(day.solution ?? []).map(say).join(', ') || 'none'}): ${ok && !b1.missed.length ? '' : 'A TOUCH DID NOTHING, '}${sol.verdict.kind}, heard ${names(sol.heard.map(h => h.degree))} (${sol.steps} steps)`);
  if (trail) { const b2 = new Board(day); applySolution(b2, day.solution); console.log(draw(b2, b2.simulate(timedOf(day.solution)).trail)); }
  const t0 = Date.now();
  const size = space(day);
  if (size > 3e6) { console.log(`  space: ${size} configurations, too many to play`); continue; }
  const r = solve(day);
  if (r.tooBig) console.log(`  space: ${r.configs} configurations, too many to play`);
  else console.log(`  space: ${r.configs} configurations, ${r.solutions} play the tune, fewest touches ${r.fewest}  [${Date.now() - t0} ms]` +
    (r.best.length ? `\n  e.g. ${r.best.slice(0, 3).map(t => t.map(say).join(', ')).join('  |  ')}` : ''));
}
