/* Composer's Key — can every room actually be solved?
   ---------------------------------------------------------------------
   test/rooms.mjs proves a room plays and stays in key; tools/room-report.mjs
   says whether every piece can be reached. Neither proves the one thing a
   player needs: that the door opens. This does, by replaying each room's
   recorded `solution` and checking every exit door is open at the end.

   A solution is a list of steps, written in the room file next to the layout:

     { "at": [x, y], "face": "down", "do": "fire" }        stand, face, press A
     { "at": [x, y], "face": "left", "do": "interact", "times": 2 }   press B twice
     { "at": [x, y], "move": "right" }                      stand, then walk one tile
     "why": "..."                                           what the step is for

   `at` has to be somewhere the player can WALK to from where they were, with
   the doors as they are at that moment; the test checks that rather than
   teleporting through walls, so a step that only works by cheating fails.
   After each step the simulation runs four bars, so every wave resolves.

   Every room in rooms/world.json must have a solution. A room without one
   fails, because an unproven room is how a world becomes unfinishable.

   Serve the repo root on :8080, then `node test/solve.mjs`.
*/
import { chromium } from 'playwright';

const EXEC = process.env.CHROMIUM || '/opt/pw-browsers/chromium';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8080/';

const browser = await chromium.launch({ executablePath: EXEC });
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(String(e)));
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.CK && window.CK.game?.world, null, { timeout: 20000 });

const results = await page.evaluate(async () => {
  const { DIR } = await import('./src/core/direction.js');
  const g = window.CK.game, a = window.CK.audio;
  a.play = (o) => a.onNote?.(o.midi, o.family);
  a.click = () => {};
  const world = g.world;
  const out = [];

  // Where can the player walk to from here, right now?
  const reachable = (room, from) => {
    const seen = new Set([`${from.x},${from.y}`]);
    const q = [from];
    while (q.length) {
      const c = q.shift();
      for (const [name, d] of Object.entries(DIR)) {
        const x = c.x + d.x, y = c.y + d.y;
        const k = `${x},${y}`;
        if (seen.has(k) || !room.canEnter(x, y, d)) continue;
        seen.add(k); q.push({ x, y });
      }
    }
    return seen;
  };
  const run = (subs) => {
    for (let i = 0; i < subs; i++) {
      g.clock.index++;
      if (g.clock.index % 4 === 0) {
        const beat = g.clock.index / 4;
        for (const d of g.room.list) { d.onBeat(beat, g.ctx); d.tickHold(beat, g.ctx); }
      }
      for (const w of g.waves) w.step(g.ctx);
      g.waves = g.waves.filter(w => w.alive);
    }
  };

  for (const id of world.at.keys()) {
    const json = world.json[id];
    const r = { id, steps: 0, problems: [] };
    out.push(r);
    if (!json.solution?.length) { r.problems.push('no solution recorded'); continue; }
    g.loadRoom(json);
    // A world room is entered through a door; start where the spawn is.
    let pos = { x: g.player.x, y: g.player.y };
    for (const [i, step] of json.solution.entries()) {
      const [x, y] = step.at;
      if (!reachable(g.room, pos).has(`${x},${y}`)) {
        r.problems.push(`step ${i + 1}: cannot walk to ${x},${y} from ${pos.x},${pos.y}`);
        break;
      }
      g.enterRoom(g.room, { x, y, facing: step.face ?? step.move ?? g.player.facing });
      if (step.move) g.move(step.move);
      for (let t = 0; t < (step.times ?? 1); t++) {
        if (step.do === 'fire') g.fire();
        else if (step.do === 'interact') g.interact();
        run(2);
      }
      run(64);
      pos = { x: g.player.x, y: g.player.y };
      r.steps++;
    }
    const exits = g.room.list.filter(d => d.typeName === 'door' && d.group !== 'entry');
    r.exits = exits.length;
    const shut = exits.filter(d => !d.open);
    if (!exits.length) r.problems.push('no exit door to open');
    if (shut.length) r.problems.push(`still shut after the solution: ${shut.map(d => `${d.x},${d.y}`).join(' ')}`);
    // And then can the player get out? Walk to the exit door, or to an X.
    const goal = g.room.list.find(d => d.typeName === 'exit') ?? exits[0];
    if (goal && !shut.length && !reachable(g.room, pos).has(`${goal.x},${goal.y}`)) {
      r.problems.push(`the exit at ${goal.x},${goal.y} is open but cannot be walked to`);
    }
  }
  return out;
});

const fails = [];
for (const r of results) {
  if (r.problems.length) fails.push(...r.problems.map(p => `${r.id}: ${p}`));
  else console.log(`  ok   ${r.id} — solved in ${r.steps} step${r.steps === 1 ? '' : 's'}`);
}
if (results.length < 2) fails.push(`only ${results.length} world rooms found`);
const realErrors = pageErrors.filter(e => !/Unable to decode audio data/.test(e));
if (realErrors.length) fails.push(`page threw: ${realErrors.join(' | ')}`);

await browser.close();
if (fails.length) {
  console.log(`\nFAIL (${fails.length})`);
  for (const f of fails) console.log(`  - ${f}`);
  process.exit(1);
}
console.log(`\nPASS — all ${results.length} world rooms can be finished`);
