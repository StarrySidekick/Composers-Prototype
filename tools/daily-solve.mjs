// The daily days, played by the solver: for authoring them, not for passing them.
//
//   node tools/daily-solve.mjs            every day
//   node tools/daily-solve.mjs 3          day 3 only
//   node tools/daily-solve.mjs 3 --trail  and draw where the wave went, untouched and solved
//
// For each day: the board, the tune, what the board plays as it stands (it must
// not be the tune), what the recorded solution plays (it must be), and the whole
// space of touches: how many configurations, how many play the tune, and the
// fewest touches that do. One solution in a big space is a hard day; many in a
// small one is an easy day. test/daily.mjs fails on the first two; the numbers
// are for reading. Node only, no server.

import { readFileSync } from 'node:fs';
import { Board, applySolution, SOLFEGE, handlesOf } from '../src/daily/board.js';
import { solve, space } from '../src/daily/solve.js';

const DAYS = JSON.parse(readFileSync(new URL('../daily/days.json', import.meta.url)));
const only = process.argv.slice(2).filter(a => /^\d+$/.test(a)).map(Number);
const trail = process.argv.includes('--trail');
const names = d => d.map(x => SOLFEGE[x]).join(' ');
const ARROW = { up: '^', down: 'v', left: '<', right: '>' };

function draw(board, path = null) {
  const seen = new Map();
  for (const p of path ?? []) seen.set(`${p.x},${p.y}`, (seen.get(`${p.x},${p.y}`) ?? 0) + 1);
  const rows = [];
  for (let y = 0; y < board.room.height; y++) {
    let row = '';
    for (let x = 0; x < board.room.width; x++) {
      const d = board.pieceAt(x, y);
      let ch = board.room.layout[y][x];
      if (board.isLauncher(x, y)) ch = '@';
      if (d) {
        const h = handlesOf(d);
        const mark = h.move ? (h.turn ? 'M' : 'm') : h.turn ? 'T' : h.tune ? 't' : ' ';
        ch = (d.typeName === 'drum' && d.mirror ? ['/', '-', '\\', '|'][(d.rot / 45) % 4] : ch) + mark;
      } else ch += seen.has(`${x},${y}`) ? '·' : ' ';
      if (!d && ch[0] === '.') ch = (seen.has(`${x},${y}`) ? '·' : '.') + ' ';
      row += ch.padEnd(2) + ' ';
    }
    rows.push(`   ${String(y).padStart(2)} ${row}`);
  }
  return rows.join('\n');
}

for (const [i, day] of DAYS.days.entries()) {
  const n = i + 1;
  if (only.length && !only.includes(n)) continue;
  const b0 = new Board(day);
  console.log(`\nDay ${n}: ${day.title}  (${day.music.bpm} bpm, ${['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][b0.key.root]} ${b0.key.mode})`);
  console.log(`  tune: ${names(b0.target)}   from "${day.motif.source?.title}"`);
  console.log(`  handles: ${b0.handles().map(h => h.launcher ? 'launcher' : `${h.piece.typeName}${h.piece.part ? '.' + h.piece.part : ''}@${h.piece.x},${h.piece.y}[${['turn', 'tune', 'move'].filter(k => h[k]).join('+')}]`).join('  ')}`);
  const as = b0.simulate();
  console.log(`  as it stands: ${as.verdict.kind}, heard ${names(as.heard.map(h => h.degree)) || 'nothing'} (${as.steps} steps)`);
  if (trail) console.log(draw(new Board(day), as.trail));
  const b1 = new Board(day);
  const ok = applySolution(b1, day.solution);
  const sol = b1.simulate();
  console.log(`  solution (${(day.solution ?? []).map(s => s.tap ? `tap ${s.tap}${s.times > 1 ? ' x' + s.times : ''}` : `move ${s.move[0]}->${s.move[1]}`).join(', ') || 'none'}): ${ok ? '' : 'A TOUCH DID NOTHING, '}${sol.verdict.kind}, heard ${names(sol.heard.map(h => h.degree))} (${sol.steps} steps)`);
  if (trail) { const b2 = new Board(day); applySolution(b2, day.solution); console.log(draw(b2, b2.simulate().trail)); }
  const t0 = Date.now();
  const r = solve(day);
  if (r.tooBig) console.log(`  space: ${r.configs} configurations, too many to play`);
  else console.log(`  space: ${r.configs} configurations, ${r.solutions} play the tune, fewest touches ${r.fewest}  [${Date.now() - t0} ms]` +
    (r.best.length ? `\n  e.g. ${r.best.slice(0, 3).map(t => t.map(s => s.tap ? `tap ${s.tap}${s.times > 1 ? ' x' + s.times : ''}` : `move ${s.move[0]}->${s.move[1]}`).join(', ')).join('  |  ')}` : ''));
}
void space;
