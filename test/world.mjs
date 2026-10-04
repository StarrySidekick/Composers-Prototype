/* Composer's Key — do the rooms join up?
   ---------------------------------------------------------------------
   rooms/world.json puts rooms on a grid; a door in a room's outer wall leads to
   the neighbour that way. Three things break that silently: a room that is not
   square (the doors stop lining up), a door that opens onto nothing, and a
   neighbour with no way back in. This checks all three from the files, then
   walks a real player through a door and back.

   Serve the repo root on :8080, then `node test/world.mjs`.
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
  const { World } = await import('./src/core/world.js');
  const { Room } = await import('./src/core/room.js');
  const world = await World.load();
  const out = { rooms: [], problems: [], walk: [] };
  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };

  // Doors on each edge of a room, by direction they lead.
  const edgeDoors = (room) => {
    const doors = { up: [], down: [], left: [], right: [] };
    for (const d of room.list) {
      if (d.typeName !== 'door') continue;
      if (d.y === 0) doors.up.push(d);
      if (d.y === room.height - 1) doors.down.push(d);
      if (d.x === 0) doors.left.push(d);
      if (d.x === room.width - 1) doors.right.push(d);
    }
    return doors;
  };

  // Areas: a run of rooms shares a key, a mode and a tempo, so the music only
  // changes mood at an area's border. A room that drifts from its area's key
  // makes the level's tune jump at a doorway for no reason.
  const MOOD = { content: 'ionian', reflective: 'dorian', tense: 'phrygian', mysterious: 'lydian', confident: 'mixolydian', sad: 'aeolian', unhinged: 'locrian' };
  for (const id of world.at.keys()) {
    const area = world.area(id);
    if (!area) { out.problems.push(`${id} is in no area`); continue; }
    const m = world.json[id].music ?? {};
    const want = { root: area.root, mode: MOOD[area.mood], bpm: area.bpm, mood: area.mood };
    for (const [k, v] of Object.entries(want)) {
      if (v != null && m[k] !== v) out.problems.push(`${id}: ${k} is ${m[k]}, its area (${area.name}) is ${v}`);
    }
  }
  out.areas = Object.keys(world.areas).length;
  out.moods = new Set(Object.values(world.areas).map(a => a.mood)).size;

  for (const id of world.at.keys()) {
    const room = new Room(world.json[id]);
    out.rooms.push({ id, w: room.width, h: room.height });
    if (room.width !== room.height) out.problems.push(`${id} is ${room.width}x${room.height}, not square`);
    const doors = edgeDoors(room);
    for (const dir of Object.keys(DIRS)) {
      const next = world.neighbour(id, dir);
      if (doors[dir].length && !next) out.problems.push(`${id}: a door leads ${dir} to no room`);
      if (!next) continue;
      if (!doors[dir].length) continue;   // neighbours need not connect
      const other = new Room(world.json[next]);
      const back = edgeDoors(other)[OPP[dir]];
      for (const d of doors[dir]) {
        const mx = dir === 'left' ? other.width - 1 : dir === 'right' ? 0 : d.x;
        const my = dir === 'up' ? other.height - 1 : dir === 'down' ? 0 : d.y;
        if (!back.some(b => b.x === mx && b.y === my)) {
          out.problems.push(`${id} -> ${next}: door at ${d.x},${d.y} has no matching door at ${mx},${my}`);
        }
      }
    }
  }

  // Walk it: open brass-01's east door, step through, come back. (Brass 01 by
  // name: the world starts in the metronome's room now.)
  const g = window.CK.game;
  g.world = world;
  g.loadRoom(world.json['brass-01-first-breath']);
  const start = g.room;
  const door = edgeDoors(start).right[0];
  door.setOpen(true, g.ctx);
  g.enterRoom(start, { x: door.x - 1, y: door.y, facing: 'right' });
  g.move('right');                                   // onto the open door
  out.walk.push([g.room.id, g.player.x, g.player.y]);
  g.move('right');                                   // off the edge
  out.walk.push([g.room.id, g.player.x, g.player.y]);
  g.move('left');                                    // back off the west edge
  out.walk.push([g.room.id, g.player.x, g.player.y]);
  out.sameRoomObject = g.room === start;
  out.doorStillOpen = door.open;
  // A shut door is a wall: you cannot walk out through it.
  door.open = false;
  g.enterRoom(start, { x: door.x - 1, y: door.y, facing: 'right' });
  g.move('right');
  out.blocked = [g.room.id, g.player.x, g.player.y];
  return out;
});

const fails = [...r.problems];
const ok = (name, cond, detail = '') =>
  cond ? console.log(`  ok   ${name}`) : fails.push(`${name}${detail ? ' — ' + detail : ''}`);

ok('the world has rooms', r.rooms.length >= 2, `${r.rooms.length}`);
ok('every area has its own mood', r.areas > 1 && r.moods === r.areas, `${r.areas} areas, ${r.moods} moods`);
ok('every world room is the same size', new Set(r.rooms.map(x => x.w)).size === 1,
  r.rooms.map(x => `${x.id} ${x.w}`).join(', '));
ok('walking onto an open edge door stays in the room', r.walk[0][0] === 'brass-01-first-breath' && r.walk[0][1] === 12,
  JSON.stringify(r.walk[0]));
ok('walking off the edge through it enters the neighbour, on the matching door',
  r.walk[1][0] === 'brass-02-crossroads' && r.walk[1][1] === 0 && r.walk[1][2] === 6, JSON.stringify(r.walk[1]));
ok('and back again', r.walk[2][0] === 'brass-01-first-breath' && r.walk[2][1] === 12, JSON.stringify(r.walk[2]));
ok('a room keeps its state when you come back', r.sameRoomObject && r.doorStillOpen);
ok('a shut door cannot be walked through', r.blocked[0] === 'brass-01-first-breath' && r.blocked[1] === 11,
  JSON.stringify(r.blocked));
const realErrors = pageErrors.filter(e => !/Unable to decode audio data/.test(e));
ok('nothing threw on the page', realErrors.length === 0, realErrors.join(' | '));

await browser.close();
if (fails.length) {
  console.log(`\nFAIL (${fails.length})`);
  for (const f of fails) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('PASS');
