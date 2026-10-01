/* Composer's Key — is everything on the beat?
   ---------------------------------------------------------------------
   The game's whole promise is that a sound wave is music: it moves one tile per
   sixteenth note at the room's tempo, and every sound it makes lands on that
   grid. This checks the promise end to end, against a fake audio clock so the
   result is exact and does not depend on how fast the machine is.

   The clock is the AudioContext's own time (BeatClock), so the test swaps in an
   object whose `currentTime` it advances by hand, 1 ms at a time, calling
   game.update() on every tick exactly as requestAnimationFrame would.

   What it checks:
     1. Wave steps are exactly one sixteenth apart at the room's tempo.
     2. Every note the game schedules sits on that sixteenth grid.
     3. What you SEE agrees with what you HEAR: at the instant a wave's note
        sounds on a tile, the wave is drawn on that tile, not a step behind.
     4. Firing is quantised: the Composer's Key sounds on the grid, at most one
        sixteenth (plus the scheduling lookahead) after the press.
     5. A tempo change mid-flight bends the grid without a skip or a stutter.
     6. A note lock's hint phrase is played in the room's tempo, on the grid.

   Serve the repo root on :8080, then `node test/timing.mjs`.
*/
import { chromium } from 'playwright';

const EXEC = process.env.CHROMIUM || '/opt/pw-browsers/chromium';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8080/';

const browser = await chromium.launch({ executablePath: EXEC });
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(String(e)));
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.CK && window.CK.game, null, { timeout: 20000 });

const r = await page.evaluate(async () => {
  const { wavePosition } = await import('./src/render/motion.js');
  const g = window.CK.game, a = window.CK.audio;
  const onGrid = (t, clock) => {
    const k = (t - clock.startTime) / clock.subInterval;
    return Math.abs(k - Math.round(k)) < 1e-6;
  };
  const fake = { currentTime: 10 };
  const notes = [];
  // Grid membership is judged when the note is scheduled: a later tempo change
  // rebases the grid, and a note that was on the old one is still in time.
  a.play = (o) => {
    notes.push({ ...o, at: fake.currentTime, grid: o.when ? onGrid(o.when, g.clock) : false });
    a.onNote?.(o.midi, o.family);
  };
  a.click = () => {};
  Object.defineProperty(a, 'now', { get: () => fake.currentTime, configurable: true });

  const out = {};
  const room = await fetch('rooms/brass-01-first-breath.json').then(r => r.json());
  room.music.bpm = 120;
  g.loadRoom(room);
  g.clock.ctx = fake;
  g.clock.start();
  const clock = g.clock;
  const sub0 = clock.subInterval;          // 0.125 s at 120 bpm

  const steps = [];       // { T, x, y }  — the wave entered (x,y) at audio time T
  const visual = [];      // { T, want, got }
  let lastAge = 0, wave = null;
  const tick = () => {
    fake.currentTime = Math.round((fake.currentTime + 0.001) * 1e6) / 1e6;
    g.update();
    if (wave && wave.age !== lastAge && wave.alive) {
      lastAge = wave.age;
      steps.push({ T: clock.timeOf(clock.index), x: wave.x, y: wave.y, tested: false });
    }
    // On the first tick at or after each step's time, compare the drawing.
    for (const s of steps) {
      if (s.tested || fake.currentTime < s.T - 1e-9) continue;
      s.tested = true;
      if (!wave.alive) continue;
      const p = wavePosition(wave, clock, fake.currentTime);
      visual.push({ T: s.T, want: [s.x, s.y], got: [p.x, p.y] });
    }
  };
  const run = (until) => { while (fake.currentTime < until - 1e-9) tick(); };

  // Fire between grid lines, on purpose.
  run(10.3 + sub0 * 0.4);
  const pressAt = fake.currentTime;
  g.setFacing('right');
  g.fire();
  wave = g.waves[g.waves.length - 1];
  const fireNote = notes[notes.length - 1];
  run(pressAt + 0.5);

  // Tempo change mid-flight.
  g.room.music.bpm = 90;
  run(pressAt + 1.4);

  out.sub0 = sub0;
  out.sub1 = clock.subInterval;
  out.gaps = steps.slice(1).map((s, i) => +(s.T - steps[i].T).toFixed(6));
  out.offGrid = notes.filter(n => n.when && !n.grid).map(n => n.when);
  out.unscheduled = notes.filter(n => !n.when).length;
  out.fire = { pressAt, when: fireNote.when ?? null };
  out.fireOnGrid = fireNote.grid;
  out.visual = visual;
  out.steps = steps.length;
  out.tilesPerSecond = 1 / sub0;

  // Hint phrase: keys room, at its own tempo.
  notes.length = 0;
  const keys = await fetch('rooms/keys-01-keyboard-floor.json').then(r => r.json());
  g.loadRoom(keys);
  g.clock.ctx = fake;
  g.clock.start();
  run(fake.currentTime + 0.237);
  const lock = g.room.list.find(d => d.typeName === 'notelock');
  lock.onPlayerInteract(g.ctx);
  out.hint = notes.map(n => n.when);
  out.hintOnGrid = notes.length > 0 && notes.every(n => n.grid);
  out.hintSpacing = notes.slice(1).map((n, i) => +(n.when - notes[i].when).toFixed(6));
  out.hintSub = g.clock.subInterval;
  return out;
});

const fails = [];
const ok = (name, cond, detail = '') =>
  cond ? console.log(`  ok   ${name}`) : fails.push(`${name}${detail ? ' — ' + detail : ''}`);

ok('the wave actually travelled', r.steps >= 5, `${r.steps} steps`);
ok('wave steps are exactly one sixteenth apart',
  r.gaps.every(g => Math.abs(g - r.sub0) < 1e-6 || Math.abs(g - r.sub1) < 1e-6),
  `gaps ${[...new Set(r.gaps)].join(', ')}; want ${r.sub0} then ${r.sub1}`);
ok('a tempo change re-spaces the steps', r.gaps.some(g => Math.abs(g - r.sub1) < 1e-6),
  `no gap of ${r.sub1}`);
ok('every scheduled note is on the sixteenth grid', r.offGrid.length === 0,
  `${r.offGrid.length} off grid`);
ok('no note plays "whenever" (unscheduled)', r.unscheduled === 0, `${r.unscheduled} unscheduled`);
ok('firing sounds on the grid', r.fireOnGrid, `fire note at ${r.fire.when}, pressed ${r.fire.pressAt}`);
ok('firing is not late by more than a sixteenth (+ lookahead)',
  r.fire.when > r.fire.pressAt && r.fire.when - r.fire.pressAt <= r.sub0 + 0.04 + 1e-6,
  `${r.fire.when == null ? 'unscheduled' : ((r.fire.when - r.fire.pressAt) * 1000).toFixed(0) + ' ms'}`);
const lag = r.visual.filter(v => Math.hypot(v.got[0] - v.want[0], v.got[1] - v.want[1]) > 0.05);
ok('the wave is drawn on a tile when its note sounds there', r.visual.length >= 5 && lag.length === 0,
  lag.length ? `${lag.length}/${r.visual.length} late, e.g. at ${lag[0].T}s want x=${lag[0].want[0]} drawn x=${lag[0].got[0].toFixed(2)}` : `${r.visual.length} checked`);
ok('the hint phrase is on the grid', r.hintOnGrid, `at ${r.hint.join(', ')}`);
ok('the hint phrase is spaced in the room tempo',
  r.hintSpacing.length > 0 && r.hintSpacing.every(s => Math.abs(s / r.hintSub - Math.round(s / r.hintSub)) < 1e-6),
  `spacing ${r.hintSpacing.join(', ')} vs sixteenth ${r.hintSub}`);
const realErrors = pageErrors.filter(e => !/Unable to decode audio data/.test(e));
ok('nothing threw on the page', realErrors.length === 0, realErrors.join(' | '));

await browser.close();
console.log(`\nwave speed at 120 bpm: ${r.tilesPerSecond} tiles/s (one per sixteenth)`);
if (fails.length) {
  console.log(`\nFAIL (${fails.length})`);
  for (const f of fails) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('PASS');
