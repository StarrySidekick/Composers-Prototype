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
     { "at": [x, y], "face": "up", "do": "lift" }            L: into the satchel (burin)
     { "at": [x, y], "face": "up", "do": "place" }           L: set the held one down
     { "at": [x, y], "do": "turn", "times": 2 }              R: turn the held one
     { ..., "wait": 4 }                  sixteenths to run after the step (default 64)
     { "room": "other-id", "at": ..., ... }  a step taken in another world room
     "why": "..."                                           what the step is for

   A room that needs something found elsewhere says so beside its solution:

     "with": { "waves": 3, "items": ["burin"], "layers": 9,
               "satchel": [{ "name": "reed", "spec": { "type": "reed", "rot": 0 } }] }

   Each room here is solved from a fresh game plus its `with`. That the world
   hands you those things in time is test/route.mjs's job.

   `at` has to be somewhere the player can WALK to from where they were, with
   the doors as they are at that moment; the test checks that rather than
   teleporting through walls, so a step that only works by cheating fails.
   After each step the simulation runs four bars (or `wait` sixteenths), so
   every wave resolves. A door held open only by a ringing chord fork is
   expected to shut again and is not counted as an exit.

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
  const { Progress } = await import('./src/core/progress.js');
  const g = window.CK.game, a = window.CK.audio;
  // Same rule as the real engine for what the room hears (see AudioEngine.heard).
  a.play = (o) => { if (a.heard?.(o) ?? true) a.onNote?.(o.midi, o.family, o); };
  a.click = () => {};
  g.saving = false;
  if (g.score) g.score.muted = true;
  const world = g.world;
  const out = [];

  // A fresh game, plus whatever the room says it needs from elsewhere.
  const fresh = (json) => {
    const p = new Progress();
    const w = json.with ?? {};
    if (w.waves) p.waves = w.waves;
    for (const i of w.items ?? []) p.items.add(i);
    for (const e of w.satchel ?? []) p.carry(JSON.parse(JSON.stringify(e)));
    for (let i = 0; i < (w.layers ?? 0); i++) p.layers.add(`given-${i}`);
    g.progress = p;
    world.forgetAll();
  };

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
  // The game's own loop, one sixteenth at a time, without the wall clock.
  const run = (subs) => {
    for (let i = 0; i < subs; i++) {
      const index = ++g.clock.index;
      const ev = { index, isBeat: index % 4 === 0, beat: Math.floor(index / 4) };
      if (ev.isBeat) for (const d of [...g.room.list]) { d.onBeat(ev.beat, g.ctx); d.tickHold(ev.beat, g.ctx); }
      g.stepWaves(ev);
    }
  };
  // "resolve": what a player does against dissonants. Stand at the step's spot and,
  // each sixteenth, if a wave is free, fire at any dissonant in a clear straight
  // line; until none are left (after giving the boss a beat to release them).
  const resolveAll = (limit = 600) => {
    for (let i = 0; i < limit; i++) {
      const ds = g.room.list.filter(d => d.typeName === 'dissonant');
      if (!ds.length && i > 8) return true;
      if (g.keyWaves < g.waveAllowance) {
        for (const d of ds) {
          const dx = Math.sign(d.x - g.player.x), dy = Math.sign(d.y - g.player.y);
          if ((dx && dy) || (!dx && !dy)) continue;
          let x = g.player.x + dx, y = g.player.y + dy, clear = true;
          while (x !== d.x || y !== d.y) { const t = g.room.doodadAt(x, y); if (t && t.blocksWave) { clear = false; break; } x += dx; y += dy; }
          if (!clear) continue;
          g.setFacing(dx > 0 ? 'right' : dx < 0 ? 'left' : dy > 0 ? 'down' : 'up');
          g.fire();
          break;
        }
      }
      run(1);
    }
    return false;
  };

  // This room's exits: doors its own locks open and keep open. Not entry doors;
  // not a shortcut whose locks are in another room (it opens from there, paired
  // with its partner); and not a door a ringing chord fork only holds open for a
  // few beats, unless it latches.
  const exitsOf = (room) => room.list.filter(d => {
    if (d.typeName !== 'door' || d.group === 'entry') return false;
    const locks = room.ofGroup(d.group).filter(l => l.isLock);
    if (!locks.length) return false;
    return d.latch || !locks.some(l => l.sustain);
  });

  // No free solves: asking a note lock for its hint (B) must not open anything.
  // It used to: the hint phrase was played through the same speakers the locks
  // listen to, so a lock heard its own answer and opened the door.
  const cheats = [];
  for (const id of world.at.keys()) {
    fresh(world.json[id]);
    g.loadRoom(world.json[id]);
    const locks = g.room.list.filter(d => d.typeName === 'notelock');
    for (const lock of locks) { lock.onPlayerInteract(g.ctx); run(64); }
    const opened = g.room.list.filter(d => d.typeName === 'door' && d.group !== 'entry' && d.open);
    const lit = locks.filter(l => l.lit);
    if (locks.length && (opened.length || lit.length)) {
      cheats.push(`${id}: pressing B on the note lock ${lit.length ? 'lit it' : ''}${opened.length ? ' and opened the door' : ''}`);
    }
  }

  for (const id of world.at.keys()) {
    const json = world.json[id];
    const r = { id, steps: 0, problems: [] };
    out.push(r);
    if (!json.solution?.length) { r.problems.push('no solution recorded'); continue; }
    fresh(json);
    g.loadRoom(json);
    const home = g.room;
    // A world room is entered through a door; start where the spawn is.
    let pos = { x: g.player.x, y: g.player.y };
    for (const [i, step] of json.solution.entries()) {
      const room = step.room ? world.room(step.room) : home;
      if (!room) { r.problems.push(`step ${i + 1}: no room ${step.room}`); break; }
      const [x, y] = step.at;
      // Within a room every step must be walkable from the last. A step in
      // another room is a jump; test/route.mjs walks those for real.
      if (room === g.room && !reachable(room, pos).has(`${x},${y}`)) {
        r.problems.push(`step ${i + 1}: cannot walk to ${x},${y} from ${pos.x},${pos.y}`);
        break;
      }
      g.enterRoom(room, { x, y, facing: step.face ?? step.move ?? g.player.facing });
      if (step.move) g.move(step.move);
      for (let t = 0; t < (step.times ?? 1); t++) {
        if (step.do === 'fire') g.fire();
        else if (step.do === 'interact') g.interact();
        else if (step.do === 'lift' || step.do === 'place') {
          if (!g.shoulderL()) r.problems.push(`step ${i + 1}: could not ${step.do} at ${x},${y} facing ${g.player.facing}`);
        } else if (step.do === 'turn') g.shoulderR();
        else if (step.do === 'resolve') { if (!resolveAll()) r.problems.push(`step ${i + 1}: dissonants still standing`); }
        run(step.wait != null && step.times > 1 ? 1 : 2);
      }
      run(step.wait ?? 64);
      pos = { x: g.player.x, y: g.player.y };
      r.steps++;
    }
    if (g.room !== home) g.enterRoom(home, pos);
    const exits = exitsOf(home);
    r.exits = exits.length;
    const shut = exits.filter(d => !d.open);
    // A room may end at an exit (X) instead of a door: the boss leaves one.
    if (!exits.length && !home.list.some(d => d.typeName === 'exit')) r.problems.push('no exit door to open');
    if (shut.length) r.problems.push(`still shut after the solution: ${shut.map(d => `${d.x},${d.y}`).join(' ')}`);
    // And then can the player get out? Walk to the exit door, or to an X.
    const goal = home.list.find(d => d.typeName === 'exit') ?? exits[0];
    if (goal && !shut.length && !reachable(home, pos).has(`${goal.x},${goal.y}`)) {
      r.problems.push(`the exit at ${goal.x},${goal.y} is open but cannot be walked to`);
    }
  }
  return { rooms: out, cheats };
});

const fails = [...results.cheats];
for (const r of results.rooms) {
  if (r.problems.length) fails.push(...r.problems.map(p => `${r.id}: ${p}`));
  else console.log(`  ok   ${r.id} — solved in ${r.steps} step${r.steps === 1 ? '' : 's'}`);
}
if (results.rooms.length < 2) fails.push(`only ${results.rooms.length} world rooms found`);
const realErrors = pageErrors.filter(e => !/Unable to decode audio data/.test(e));
if (realErrors.length) fails.push(`page threw: ${realErrors.join(' | ')}`);

await browser.close();
if (fails.length) {
  console.log(`\nFAIL (${fails.length})`);
  for (const f of fails) console.log(`  - ${f}`);
  process.exit(1);
}
console.log(`\nPASS — all ${results.rooms.length} world rooms can be finished, none for free`);
