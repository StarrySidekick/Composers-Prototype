/* Composer's Key — is every daily board a fair puzzle?
   ---------------------------------------------------------------------
   The daily mode (daily.html, src/daily/, docs/DAILY.md) is ten boards, one a
   day, each a tune of Timothy's to make with one wave. A board can break
   without a sound in four ways, and each is checked here:

     - it plays the tune before anyone touches it (no puzzle), or the recorded
       solution no longer plays it (no answer). Every touch of the solution goes
       through Board.tap / Board.move, the same calls a finger makes, and a touch
       that does nothing fails by name, so a stale solution cannot pass quietly.
     - a handle that does nothing ("tune" on a piece with one state), a launcher
       on top of a piece, a board that is not 8 x 14, a horn with a loose end or
       no bell (the castle's horn rule holds here too)
     - a note off the board's scale: every pitch the wave sets off on the way to
       the answer is checked against the day's key, the rule the whole game is
       built on
     - the two rules the board adds to the castle: a wave running along a string
       is ONE held note, not a pluck per tile; drums keep time and are never
       judged

   And the solver plays every configuration of the smaller days (src/daily/
   solve.js): each must have an answer, and how many it has is printed. The
   bigger days are left to `node tools/daily-solve.mjs`, which is for reading.

   Node only, no server: `node test/daily.mjs`. The page itself, by touch, is
   test/daily-touch.mjs.
*/
import { readFileSync } from 'node:fs';
import { Board, applySolution, targetOf, handlesOf, cycleOf, COLS, ROWS, SOLFEGE } from '../src/daily/board.js';
import { solve, space } from '../src/daily/solve.js';
import { hornProblems } from '../src/doodads/brass.js';
import { DEFAULT_LEGEND } from '../src/core/room.js';
import { MODES } from '../src/core/music.js';

const DAYS = JSON.parse(readFileSync(new URL('../daily/days.json', import.meta.url)));
const fails = [];
const ok = (name, cond, detail = '') =>
  cond ? console.log(`  ok   ${name}`) : fails.push(`${name}${detail ? ' — ' + detail : ''}`);
const names = ds => ds.map(d => SOLFEGE[d]).join(' ');
const SOLVE_UP_TO = 250000;

console.log('the calendar');
ok('ten days', DAYS.days.length === 10, `${DAYS.days.length}`);
ok('every day has its own id', new Set(DAYS.days.map(d => d.id)).size === DAYS.days.length);
ok('the epoch is a date', /^\d{4}-\d{2}-\d{2}$/.test(DAYS.epoch) && !isNaN(new Date(DAYS.epoch)), DAYS.epoch);

for (const [i, day] of DAYS.days.entries()) {
  const tag = `day ${i + 1} (${day.title})`;
  console.log(`\n${tag}`);

  // ---- the board as drawn ----
  ok(`${tag}: ${ROWS} rows of ${COLS}`, day.layout.length === ROWS && day.layout.every(r => r.length === COLS),
    day.layout.map(r => r.length).join(','));
  const legend = { ...DEFAULT_LEGEND, ...(day.legend ?? {}) };
  const unknown = [...new Set(day.layout.join(''))].filter(ch => !(ch in legend));
  ok(`${tag}: every character is in the legend`, !unknown.length, unknown.join(''));
  const b0 = new Board(day);
  ok(`${tag}: the launcher stands on empty floor`, b0.room.inBounds(b0.launch.x, b0.launch.y) && !b0.pieceAt(b0.launch.x, b0.launch.y),
    `${b0.launch.x},${b0.launch.y}`);
  const horns = hornProblems(b0.room);
  ok(`${tag}: every horn runs mouthpiece to bell`, !horns.length, horns.join('; '));
  for (const o of day.overrides ?? []) {
    if (!o.can) continue;
    const d = b0.pieceAt(o.x, o.y);
    ok(`${tag}: "${o.can}" at ${o.x},${o.y} is on a piece and does something`,
      !!d && (handlesOf(d).move || cycleOf(d) > 1), d ? `${d.typeName}${d.part ? '.' + d.part : ''}` : 'nothing there');
  }

  // ---- the tune ----
  const target = targetOf(day.motif);
  ok(`${tag}: a tune of at least three notes, from Timothy's music`, target.length >= 3 && !!day.motif.source?.title,
    `${names(target)} from ${day.motif.source?.title}`);
  ok(`${tag}: the board is in the tune's key`, day.music.root === day.motif.key.root && day.music.mode === day.motif.key.mode);

  // ---- untouched, and solved ----
  const as = new Board(day).simulate();
  ok(`${tag}: as it stands it is not the tune`, as.verdict.kind !== 'solved', `it plays ${names(as.heard.map(h => h.degree))}`);

  const b = new Board(day);
  const played = [];
  const real = b.sound.bind(b);
  b.sound = (o) => { if (b.running) played.push(o); return real(o); };
  const touched = applySolution(b, day.solution);
  ok(`${tag}: every touch of the solution does something`, touched);
  const r = b.simulate();
  ok(`${tag}: the solution plays ${names(target)}`, r.verdict.kind === 'solved',
    `${r.verdict.kind}, heard ${names(r.heard.map(h => h.degree))}`);

  const scale = MODES[b.key.mode].map(s => (s + b.key.root) % 12);
  const off = played.filter(o => !scale.includes(((o.midi % 12) + 12) % 12));
  ok(`${tag}: every note on the way is in ${day.motif.key.mode}`, !off.length, off.map(o => `${o.family} ${o.midi}`).join(', '));
  ok(`${tag}: drums are heard and never judged`, r.heard.every(h => h.family !== 'percussion'));

  // ---- the whole space, where it is small enough to play in a test ----
  const n = space(day);
  if (n <= SOLVE_UP_TO) {
    const s = solve(day);
    ok(`${tag}: the solver finds an answer in ${n} configurations`, s.solutions >= 1, `${s.solutions}`);
    console.log(`       ${s.solutions} of ${s.configs} configurations play it; fewest touches ${s.fewest}`);
  } else console.log(`       ${n} configurations: too many to play here (node tools/daily-solve.mjs ${i + 1})`);
}

// ---- the two rules the board adds ----
console.log('\nthe rules');
{
  // Day 1's first string is five tiles of mi. Along it, one note.
  const b = new Board(DAYS.days[0]);
  b.fire();
  while (b.running && b.step < 8) b.tick();
  const mis = b.heard.filter(h => SOLFEGE[h.degree] === 'mi');
  ok('a wave along a five-tile string plays one note, not five', mis.length === 1, `${mis.length}`);

  // The same string again after a drum is a new note: a pedal can be played.
  const day = {
    ...DAYS.days[0], id: 'rule', overrides: [],
    layout: ['........', '........', '........', '........', '........', '........', '........',
      '.s......', '.H......', '.H......', '.H......', '.H......', '.H......', '........'],
    solution: [],
  };
  const pedal = new Board({ ...day, overrides: [{ x: 1, y: 7, rot: 225 }] });   // a flat head facing down: straight back
  pedal.fire();
  while (pedal.running && pedal.step < 20) pedal.tick();
  ok('back along the same string after a drum is a second note', pedal.heard.length === 2 && pedal.heard[0].degree === pedal.heard[1].degree,
    names(pedal.heard.map(h => h.degree)));
}

if (fails.length) {
  console.log(`\nFAIL (${fails.length})`);
  for (const f of fails) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('\nPASS');
