/* Composer's Key — is every daily board a fair puzzle?
   ---------------------------------------------------------------------
   The daily mode (daily.html, src/daily/, docs/DAILY.md) is ten boards, one a
   day, each a tune to make with one wave from Coda, who stands under the
   bottom-left tile. A board can break without a sound in four ways, and each is
   checked here:

     - it plays the tune before anyone touches it (no puzzle), or the recorded
       solution no longer plays it (no answer). Every touch of the solution goes
       through Board.tap / Board.move, the same calls a finger makes, before the
       wave goes or in flight (`at`), and a touch that does nothing fails by name,
       so a stale solution cannot pass quietly. The solved run must end by
       itself, not round a loop.
     - a handle that does nothing ("tune" on a piece with one state), a board
       that is not 8 x 14, a horn with a loose end or no bell (the castle's horn
       rule holds here too), a day not at its tempo (100, then 5 more a day)
     - a note off the board's scale: every pitch the wave sets off on the way to
       the answer is checked against the day's key, the rule the whole game is
       built on
     - the daily's own pieces and rules doing something other than what they say
       (src/daily/pieces.js, board.js): a string sounds when CROSSED, a wrap
       raises it a step, a slid peg lengthens it and only slides along it, two
       strings side by side stay two, a little instrument plays its one note from
       any side and lets the wave through, drums are never judged, a wrong note
       plays on, a note after the tune fails it, a loop is stopped, and a touch in
       flight changes where the wave goes next time round

   And the solver plays every configuration of the smaller days (src/daily/
   solve.js): each must have an answer, and how many it has is printed. A day
   whose answer needs a touch in flight must have NO answer before the wave
   goes: that proves the touch is needed. The days with pieces to drag anywhere
   are left to the recorded solution.

   Node only, no server: `node test/daily.mjs`. The page itself, by touch, is
   test/daily-touch.mjs.
*/
import { readFileSync } from 'node:fs';
import { Board, applySolution, timedOf, targetOf, handlesOf, cycleOf, bpmOfDay, COLS, ROWS, SOLFEGE, DAILY_LEGEND, MAX_STEPS } from '../src/daily/board.js';
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
  const legend = { ...DEFAULT_LEGEND, ...DAILY_LEGEND, ...(day.legend ?? {}) };
  const unknown = [...new Set(day.layout.join(''))].filter(ch => !(ch in legend));
  ok(`${tag}: every character is in the legend`, !unknown.length, unknown.join(''));
  const b0 = new Board(day);
  ok(`${tag}: no launcher of its own (Coda is always under the bottom-left tile)`, !('launch' in day));
  ok(`${tag}: at ${bpmOfDay(i)} bpm`, day.music.bpm === bpmOfDay(i), `${day.music.bpm}`);
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
  ok(`${tag}: a tune of at least seven notes, named`, target.length >= 7 && !!day.motif.source?.title,
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
  const r = b.simulate(timedOf(day.solution));
  ok(`${tag}: every touch of the solution does something`, touched && !b.missed.length, JSON.stringify(b.missed));
  ok(`${tag}: the solution plays ${names(target)}`, r.verdict.kind === 'solved',
    `${r.verdict.kind}, heard ${names(r.heard.map(h => h.degree))}`);
  ok(`${tag}: and the wave then ends by itself`, !b.looped && r.steps < MAX_STEPS, b.looped ? 'went round a loop' : `${r.steps} steps`);

  const scale = MODES[b.key.mode].map(s => (s + b.key.root) % 12);
  const off = played.filter(o => !scale.includes(((o.midi % 12) + 12) % 12));
  ok(`${tag}: every note on the way is in ${day.motif.key.mode}`, !off.length, off.map(o => `${o.family} ${o.midi}`).join(', '));
  ok(`${tag}: drums are heard and never judged`, r.heard.every(h => h.family !== 'percussion'));

  // ---- the whole space, where it is small enough to play in a test ----
  const n = space(day);
  const inFlight = timedOf(day.solution).length > 0;
  if (n <= SOLVE_UP_TO) {
    const s = solve(day);
    if (inFlight) ok(`${tag}: no setting plays it before the wave goes: the touch in flight is needed`, s.solutions === 0, `${s.solutions}`);
    else ok(`${tag}: the solver finds an answer in ${n} configurations`, s.solutions >= 1, `${s.solutions}`);
    console.log(`       ${s.solutions} of ${s.configs} configurations play it before the wave goes; fewest touches ${s.fewest}`);
  } else console.log(`       ${n} configurations: too many to play here (node tools/daily-solve.mjs ${i + 1})`);
}

// ---- the daily's own pieces and rules -----------------------------------------
console.log('\nthe pieces');
{
  // A small table. Coda's wave goes up into (0,13); a drum at (0,12) turns it
  // right along row 12. A string up column 3 (pegs at rows 10 and 13, two tiles:
  // la in C), a violin on do at (5,12).
  const table = (rows) => Array.from({ length: 14 }, (_, y) => rows[y] ?? '........');
  const base = {
    id: 'rule', title: 'rule', music: { root: 0, mode: 'ionian', bpm: 100 },
    motif: { key: { root: 0, mode: 'ionian' }, notes: [[0, 1, 5], [1, 1, 0]] },
    layout: table({ 10: '...o....', 11: '...H....', 12: 'b..H.v..', 13: '...o....' }),
    overrides: [{ x: 0, y: 12, rot: 180 }, { x: 3, y: 10, can: 'turn move' }, { x: 5, y: 12, degree: 0 }],
  };
  const heard = (b, timed) => { b.simulate(timed); return names(b.heard.map(h => h.degree)); };
  {
    const b = new Board(base);
    b.simulate();
    ok('Coda\'s wave goes up into the bottom-left tile first', b.trail[1]?.x === 0 && b.trail[1]?.y === 13 && b.trail[0].y === 14, JSON.stringify(b.trail.slice(0, 2)));
  }
  ok('a wave crossing a string plays it, and a violin its one note', heard(new Board(base)) === 'la do', heard(new Board(base)));
  ok('that is the tune, and a drum on the way is heard and never judged', new Board(base).simulate().verdict.kind === 'solved');

  let b = new Board(base);
  b.tap(3, 10);
  ok('one wrap on either peg raises the string a step', heard(b) === 'ti do', heard(b));

  b = new Board(base);
  const slid = b.move({ x: 3, y: 10 }, { x: 3, y: 8 });
  const col = [...Array(14)].map((_, y) => ({ taut: '=', tuningpeg: 'o' })[b.pieceAt(3, y)?.typeName] ?? '.').join('');
  ok('a peg slid along its string lays a longer string, and it plays lower', slid && col === '........o====o' && heard(b) === 'fa do', `${col} ${heard(b)}`);
  b = new Board(base);
  ok('a peg will not leave its string\'s line, nor pass its partner', !b.move({ x: 3, y: 10 }, { x: 4, y: 10 }) && !b.move({ x: 3, y: 10 }, { x: 3, y: 12 }) && !b.move({ x: 3, y: 10 }, { x: 3, y: 13 }));

  // Two strings side by side stay two: columns 3 and 4, crossed one after the other.
  const pair = new Board({ ...base, layout: table({ 10: '...oo...', 11: '...HH...', 12: 'b..HH...', 13: '...oo...' }), overrides: [{ x: 0, y: 12, rot: 180 }, { x: 4, y: 10, wraps: 1 }] });
  ok('two strings side by side are two strings, two notes', heard(pair) === 'la ti', heard(pair));

  // A little instrument from the side, and the wave goes on through it to the
  // string beyond.
  const side = new Board({ ...base, layout: table({ 10: '......o.', 11: '......H.', 12: 'b..v..H.', 13: '......o.' }), overrides: [{ x: 0, y: 12, rot: 180 }, { x: 3, y: 12, degree: 2 }] });
  ok('a little instrument plays its note from the side and lets the wave through', heard(side) === 'mi la', heard(side));

  // A wrong note plays on: the run is judged when the wave stops, on everything.
  b = new Board(base);
  b.tap(3, 10); b.tap(3, 10);
  ok('a wrong note plays, and the wave goes on to the next', heard(b) === 'do do' && b.verdict.kind === 'wrong' && b.verdict.at === 0, `${heard(b)} ${JSON.stringify(b.verdict)}`);
  const longer = new Board({ ...base, motif: { ...base.motif, notes: [[0, 1, 5]] } });
  ok('a note after the tune\'s last one fails it', heard(longer) === 'la do' && longer.verdict.kind === 'long', JSON.stringify(longer.verdict));
  const quick = new Board(base, { quick: true });
  quick.tap(3, 10); quick.tap(3, 10);
  ok('a quick run (the solver\'s) stops at its first wrong note', heard(quick) === 'do', heard(quick));

  // Round and round: up column 0, right on row 10, up column 4, left on row 7
  // over a violin, down column 0 to the first drum again. As set, that drum's
  // back faces the wave coming down and stops it. Turned three times while the
  // wave is away, it sends it right again, over the string a second time and
  // up column 4, where the wave stood just after the touch: from there it can
  // only repeat, so it is stopped.
  const loop = {
    ...base,
    layout: table({ 7: 'b.v.b...', 9: '..o.....', 10: 'b.H.b...', 11: '..o.....' }),
    overrides: [{ x: 0, y: 7, rot: 180 }, { x: 2, y: 7, degree: 0 }, { x: 4, y: 7, rot: 270 },
      { x: 0, y: 10, rot: 180, can: 'turn' }, { x: 4, y: 10, rot: 0 }],
    motif: { key: { root: 0, mode: 'ionian' }, notes: [[0, 1, 6], [1, 1, 0], [2, 1, 6]] },
  };
  b = new Board(loop);
  ok('as set, the wave goes round once and the first drum\'s back stops it', heard(b) === 'ti do' && !b.looped, `${heard(b)} looped ${b.looped}`);
  b = new Board(loop);
  const t = heard(b, [{ tap: [0, 10], times: 3, at: 8 }]);
  ok('a drum turned while the wave is away sends it a new way when it comes back', t === 'ti do ti', t);
  ok('and a wave that can only go round again is stopped, and judged on what it played', b.looped && b.verdict.kind === 'solved', `${b.looped} ${JSON.stringify(b.verdict)}`);
}

if (fails.length) {
  console.log(`\nFAIL (${fails.length})`);
  for (const f of fails) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('\nPASS');
