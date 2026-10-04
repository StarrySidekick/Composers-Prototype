/* Composer's Key — can the whole world be finished, in one go?
   ---------------------------------------------------------------------
   test/solve.mjs proves each room on its own, handing a room whatever its
   `with` says it needs (three waves, the burin, a reed in the satchel). That
   leaves the question a metroidvania lives or dies on: does the world actually
   hand you those things, in an order you can reach them? A gate that needs an
   item found behind itself is the classic way to ship an unfinishable game.

   This plays one game from the start, with one save, through the `route` in
   rooms/world.json:

     "route": [
       "brass-01-first-breath",                     walk there, play its solution
       { "room": "woodwind-02-reed",                walk there, play these steps
         "steps": [{ "at": [1, 2], "face": "right", "do": "lift" }] },
       ...
     ]

   Nothing teleports. Between steps Coda WALKS, one tile at a time through
   Game.move, along a path found through the rooms as they are right now: doors
   shut or open, stairs that shift the key, every doorway between rooms. So a
   route that only works by walking through a shut door fails, and so does one
   that reaches a room before the thing it needs exists.

   Before each room's own solution it checks the save holds what the room's
   `with` asks for. At the end: every room visited, every room's exits open, the
   last room's end reached, and the score whole.

   Serve the repo root on :8080, then `node test/route.mjs`.
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

const r = await page.evaluate(async () => {
  const { DIR } = await import('./src/core/direction.js');
  const { Progress } = await import('./src/core/progress.js');
  const { arrival } = await import('./src/core/world.js');
  const g = window.CK.game, a = window.CK.audio, world = g.world;
  a.play = (o) => { if (a.heard?.(o) ?? true) a.onNote?.(o.midi, o.family, o); };
  a.click = () => {};
  g.saving = false;
  if (g.score) g.score.muted = true;
  const out = { log: [], problems: [], walked: 0 };
  let finished = false;
  g.onRoomComplete = () => { finished = true; };

  // A new game, by hand (newGame() would write a save).
  g.progress = new Progress();
  world.forgetAll();
  g.unlockLayers('start');
  const start = world.room(world.start);
  g.enterRoom(start, start.playerStart);

  const run = (subs) => {
    for (let i = 0; i < subs; i++) {
      const index = ++g.clock.index;
      const ev = { index, isBeat: index % 4 === 0, beat: Math.floor(index / 4) };
      if (ev.isBeat) for (const d of [...g.room.list]) { d.onBeat(ev.beat, g.ctx); d.tickHold(ev.beat, g.ctx); }
      g.stepWaves(ev);
    }
  };

  // Shortest walk, through rooms, to (room, x, y), by the same rules Game.move
  // uses. A dissonant's tile is avoided: walking into one shoves you.
  const path = (toRoom, tx, ty) => {
    const key = (id, x, y) => `${id}:${x},${y}`;
    const from = { id: g.room.id, x: g.player.x, y: g.player.y };
    const prev = new Map([[key(from.id, from.x, from.y), null]]);
    const q = [from];
    while (q.length) {
      const c = q.shift();
      if (c.id === toRoom && (tx == null || (c.x === tx && c.y === ty))) {
        const dirs = [];
        for (let k = key(c.id, c.x, c.y); prev.get(k); k = prev.get(k).k) dirs.unshift(prev.get(k));
        return dirs;
      }
      const room = world.room(c.id);
      for (const [name, d] of Object.entries(DIR)) {
        let n = null;
        const x = c.x + d.x, y = c.y + d.y;
        if (room.inBounds(x, y)) {
          const t = room.doodadAt(x, y);
          if (room.canEnter(x, y, d) && t?.typeName !== 'dissonant') n = { id: c.id, x, y };
        } else {
          const nid = world.neighbour(c.id, name);
          const next = nid && world.room(nid);
          const at = next && arrival(next, c.x, c.y, name, [room.width, room.height]);
          if (at) n = { id: nid, x: at.x, y: at.y };
        }
        if (!n) continue;
        const k = key(n.id, n.x, n.y);
        if (prev.has(k)) continue;
        prev.set(k, { k: key(c.id, c.x, c.y), dir: name, to: n });
        q.push(n);
      }
    }
    return null;
  };

  const walk = (toRoom, tx, ty, why) => {
    const p = path(toRoom, tx, ty);
    if (!p) { out.problems.push(`cannot walk to ${toRoom}${tx != null ? ` ${tx},${ty}` : ''} from ${g.room.id} ${g.player.x},${g.player.y} (${why})`); return false; }
    for (const s of p) {
      g.move(s.dir);
      out.walked++;
      if (g.room.id !== s.to.id || g.player.x !== s.to.x || g.player.y !== s.to.y) {
        out.problems.push(`walking ${s.dir} toward ${toRoom} ended at ${g.room.id} ${g.player.x},${g.player.y}, not ${s.to.id} ${s.to.x},${s.to.y}`);
        return false;
      }
    }
    return true;
  };

  const has = (want = {}) => {
    const p = g.progress, miss = [];
    if (want.waves && p.waves < want.waves) miss.push(`${want.waves} waves (has ${p.waves})`);
    for (const i of want.items ?? []) if (!p.has(i)) miss.push(i);
    for (const e of want.satchel ?? []) if (!p.satchel.some(s => s.spec.type === e.spec.type)) miss.push(`a ${e.name} in the satchel`);
    if (want.layers && p.layers.size < want.layers) miss.push(`${want.layers} score layers (has ${p.layers.size})`);
    return miss;
  };

  const play = (roomId, steps) => {
    for (const [i, step] of steps.entries()) {
      if (step.room && step.room !== roomId) { out.problems.push(`${roomId}: route steps must stay in their room (step ${i + 1})`); return false; }
      const [x, y] = step.at;
      if (!walk(roomId, x, y, `step ${i + 1}`)) return false;
      if (step.face) g.setFacing(step.face);
      if (step.move) g.move(step.move);
      for (let t = 0; t < (step.times ?? 1); t++) {
        if (step.do === 'fire') g.fire();
        else if (step.do === 'interact') g.interact();
        else if (step.do === 'lift' || step.do === 'place') {
          if (!g.shoulderL()) { out.problems.push(`${roomId} step ${i + 1}: could not ${step.do}`); return false; }
        } else if (step.do === 'turn') g.shoulderR();
        run(2);
      }
      run(step.wait ?? 64);
    }
    return true;
  };

  const visited = new Set();
  for (const entry of world.route) {
    const id = typeof entry === 'string' ? entry : entry.room;
    const json = world.json[id];
    if (!json) { out.problems.push(`route names an unknown room: ${id}`); break; }
    if (!walk(id, null, null, 'to the room')) break;
    visited.add(id);
    let steps = typeof entry === 'string' || entry.steps === 'solution' ? json.solution : entry.steps;
    if (typeof entry === 'string' || entry.steps === 'solution') {
      const miss = has(json.with);
      if (miss.length) { out.problems.push(`${id}: reached without ${miss.join(', ')}`); break; }
    }
    const before = { waves: g.progress.waves, items: [...g.progress.items], layers: g.progress.layers.size, bag: g.progress.satchel.length };
    if (!play(id, steps)) break;
    out.log.push(`${id}: waves ${before.waves}->${g.progress.waves}, layers ${before.layers}->${g.progress.layers.size}, satchel ${before.bag}->${g.progress.satchel.length}${g.progress.items.size > before.items.length ? `, found ${[...g.progress.items].filter(i => !before.items.includes(i)).join(' ')}` : ''}`);
  }

  out.unvisited = [...world.at.keys()].filter(id => !visited.has(id));
  out.finished = finished;
  out.layers = g.progress.layers.size;
  out.allLayers = g.score?.layers.length ?? 0;
  out.shut = [];
  for (const id of world.at.keys()) {
    const room = world.room(id);
    for (const d of room.list) {
      if (d.typeName !== 'door' || d.group === 'entry' || d.open) continue;
      const locks = room.ofGroup(d.group).filter(l => l.isLock);
      if (!locks.length) continue;                       // a shortcut, opened from its partner
      if (!d.latch && locks.some(l => l.sustain)) continue;   // held only while a fork rings
      out.shut.push(`${id} ${d.x},${d.y}`);
    }
  }
  return out;
});

for (const l of r.log) console.log(`  ok   ${l}`);
const fails = [...r.problems];
const ok = (name, cond, detail = '') =>
  cond ? console.log(`  ok   ${name}`) : fails.push(`${name}${detail ? ' — ' + detail : ''}`);
ok('every world room is on the route', r.unvisited.length === 0, r.unvisited.join(', '));
ok('every room\'s exits are open at the end', r.shut.length === 0, r.shut.join(', '));
ok('the last room\'s end is reached', r.finished);
ok('the score is whole', r.layers === r.allLayers && r.allLayers > 0, `${r.layers} of ${r.allLayers}`);
ok('Coda walked it, tile by tile', r.walked > 200, `${r.walked} tiles`);
const realErrors = pageErrors.filter(e => !/Unable to decode audio data/.test(e));
ok('nothing threw on the page', realErrors.length === 0, realErrors.join(' | '));

await browser.close();
if (fails.length) {
  console.log(`\nFAIL (${fails.length})`);
  for (const f of fails) console.log(`  - ${f}`);
  process.exit(1);
}
console.log(`\nPASS — the world can be finished from the start, ${r.walked} tiles on foot`);
