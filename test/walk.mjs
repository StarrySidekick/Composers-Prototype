/* Composer's Key — does Coda walk like Link?
   ---------------------------------------------------------------------
   Movement is free, not tile by tile (Game.walk): held directions move Coda at
   Link's speed, walls stop him, a near-miss at a gap nudges him into it, the tile
   under his centre is the one he is on, and walking out through an open door takes
   him to the next room. Driven with exact time steps, so it is deterministic.

   Serve the repo root on :8080, then `node test/walk.mjs`.
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
  const g = window.CK.game, a = window.CK.audio, out = {};
  const played = [];
  a.play = (o) => { played.push(o.family); };
  const json = (id) => g.world.json[id];
  const hold = (dirs, secs) => {
    for (const d of [...g.held]) g.setHeld(d, false);
    for (const d of dirs) g.setHeld(d, true);
    for (let t = 0; t < secs; t += 1 / 60) g.walk(1 / 60);
    for (const d of dirs) g.setHeld(d, false);
  };
  const at = (x, y, facing = 'right') => g.enterRoom(g.room, { x, y, facing });

  // Speed: one second of walking right in open floor.
  g.loadRoom(json('brass-01-first-breath'));
  at(1, 8);
  hold(['right'], 1);
  out.speed = g.player.rx - 1;

  // A wall stops him: walk left into the west wall from tile (2, 8).
  at(2, 8);
  hold(['left'], 1);
  // His body is narrower than a tile (half-width 0.34), so he stops with his edge
  // on the wall: centre at 1.34, rx about 0.84. Anywhere from there to just short
  // of the tile's middle is "stopped by the wall"; into tile 0 is a failure.
  out.wallStop = g.player.rx;

  // Sticky facing: hold right, then add up; still facing right.
  at(3, 10);
  g.setHeld('right', true); g.setHeld('up', true);
  out.facingDiagonal = g.player.facing;
  g.setHeld('right', false);
  out.facingAfter = g.player.facing;     // right released: turn to up
  g.setHeld('up', false);

  // Corner nudge: a little off the door's row, walking right through the open door.
  const door = g.room.list.find(d => d.typeName === 'door');
  door.setOpen(true, g.ctx);
  at(9, 6); g.player.ry = 6.3;           // 0.3 of a tile low
  hold(['right'], 1.2);
  out.throughDoor = [g.room.id, g.player.x, g.player.y];

  // A string plucks when you walk onto it (Strings 01: strings at column 4).
  g.loadRoom(json('strings-01-quiet-room'));
  played.length = 0;
  at(3, 3);
  hold(['right'], 0.3);
  out.plucked = played.includes('strings');
  out.played = played.slice();
  return out;
});

const fails = [];
const ok = (name, cond, detail = '') =>
  cond ? console.log(`  ok   ${name}`) : fails.push(`${name}${detail ? ' — ' + detail : ''}`);

ok('walks at about Link\'s speed (5.6 tiles/s)', Math.abs(r.speed - 5.6) < 0.15, `${r.speed.toFixed(2)} tiles/s`);
ok('a wall stops him, body edge against it', r.wallStop >= 0.83 && r.wallStop < 0.95, `rx ${r.wallStop.toFixed(2)}`);
ok('holding a diagonal keeps the way he faced', r.facingDiagonal === 'right', r.facingDiagonal);
ok('letting go of that turns him to the other', r.facingAfter === 'up', r.facingAfter);
ok('a near-miss is nudged through the door into the next room',
  r.throughDoor[0] === 'brass-02-crossroads', JSON.stringify(r.throughDoor));
ok('walking over a string plucks it', r.plucked, `heard ${JSON.stringify(r.played)}`);
const realErrors = pageErrors.filter(e => !/Unable to decode audio data/.test(e));
ok('nothing threw on the page', realErrors.length === 0, realErrors.join(' | '));

await browser.close();
if (fails.length) {
  console.log(`\nFAIL (${fails.length})`);
  for (const f of fails) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('PASS');
