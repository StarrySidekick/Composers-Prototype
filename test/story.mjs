/* Composer's Key — does the whole game play, start to credits?
   ---------------------------------------------------------------------
   story/ is the marble: every scene the finished game will have, built or not
   (docs/MARBLE.md). Most of it is placeholder, which is the point, and the
   risk with placeholders is that they rot silently: a scene that leads to an
   id that was renamed, a trigger naming a room that does not exist (it just
   never fires), a chart bar one sixteenth short (every note after it lands a
   sixteenth early), a pipe whose far end is inside a wall. None of those throw.

   So this checks, in order:

   1. The outline, from the files: every link, kind, speaker, chart bar, world,
      room, tile, trigger, story tile and character resolves to something real.
   2. The whole story, autoplayed: new game to the title again, every scene in
      reading order, each finishing on its own, every note it plays in its
      scene's scale and unheard by locks.
   3. The Wood, walked for real: the workshop's story tile, the fork rung across
      the brook, the pipe up the cliff and back down (reversed), a character
      talking, the gate into the castle.
   4. The castle's triggers, fired the way a player fires them: walking through
      a doorway (a pipe ride and a title card, queued), a puzzle opening a door
      (a wing's boss chain, then back to the room), a room's exit (the finale).
   5. Saving and continuing mid-story.
   6. A phone: the chapter list, A moving a cutscene on, R twice skipping,
      developer mode and the Marble from the pause menu, the D-pad playing a pipe.

   Serve the repo root on :8080, then `node test/story.mjs`.
*/
import { chromium } from 'playwright';

const EXEC = process.env.CHROMIUM || '/opt/pw-browsers/chromium';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8080/';

const fails = [];
const ok = (name, cond, detail = '') =>
  cond ? console.log(`  ok   ${name}`) : fails.push(`${name}${detail ? ' — ' + detail : ''}`);
const AUDIO_ONLY = /Unable to decode audio data/;

const browser = await chromium.launch({ executablePath: EXEC });
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(String(e)));
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.CK?.director?.outline && window.CK.game?.world, null, { timeout: 20000 });

// Helpers installed in the page: wait for a condition, and walk Coda tile by tile
// (breadth-first over what he can actually enter, so no step goes through a wall).
await page.evaluate(async () => {
  const { DIR } = await import('./src/core/direction.js');
  window.T = {
    sleep: (ms) => new Promise(r => setTimeout(r, ms)),
    async until(fn, ms = 30000) {
      const t = performance.now();
      while (!fn()) { if (performance.now() - t > ms) return false; await T.sleep(40); }
      return true;
    },
    walkTo(x, y) {
      const g = CK.game, room = g.room;
      const key = (a, b) => `${a},${b}`;
      const prev = new Map([[key(g.player.x, g.player.y), null]]);
      const q = [[g.player.x, g.player.y]];
      while (q.length) {
        const [cx, cy] = q.shift();
        if (cx === x && cy === y) break;
        for (const name of ['up', 'down', 'left', 'right']) {
          const d = DIR[name], nx = cx + d.x, ny = cy + d.y;
          if (!room.inBounds(nx, ny) || prev.has(key(nx, ny)) || !room.canEnter(nx, ny, d)) continue;
          prev.set(key(nx, ny), [cx, cy, name]);
          q.push([nx, ny]);
        }
      }
      if (!prev.has(key(x, y))) return false;
      const path = [];
      for (let k = key(x, y); prev.get(k); ) { const [px, py, name] = prev.get(k); path.unshift(name); k = key(px, py); }
      for (const name of path) g.move(name);
      return g.player.x === x && g.player.y === y;
    },
  };
});

// ---- 1. the outline, from the files ------------------------------------------------

const A = await page.evaluate(async () => {
  const d = CK.director, o = d.outline;
  const { ENGINES } = await import('./src/story/director.js');
  const { parseChart } = await import('./src/story/rhythm.js');
  const { World } = await import('./src/core/world.js');
  const out = { problems: o.problems(), scenes: o.order.length, minutes: o.minutes(), kinds: [], charts: [], worldProblems: [], places: [], triggers: [], stages: [], npcs: [], notes: 0, rooms: 0 };
  for (const id of o.order) { const sc = o.scene(id); if (!ENGINES[sc.kind]) out.kinds.push(`${id}: ${sc.kind}`); }

  // Charts: every bar exactly sixteen sixteenths, only lane letters its lanes have.
  const LANE = { L: 'left', D: 'down', U: 'up', R: 'right', A: 'a', B: 'b' };
  const charts = [];
  for (const id of o.order) {
    const sc = o.scene(id);
    if (sc.kind === 'rhythm') charts.push([id, sc.chart]);
    for (const [i, ph] of (sc.phases ?? []).entries()) charts.push([`${id} phase ${i + 1}`, ph.chart]);
  }
  for (const [name, ch] of charts) {
    if (!ch) { out.charts.push(`${name}: no chart`); continue; }
    const lanes = ch.lanes ?? ['left', 'down', 'up', 'right'];
    for (const [bi, bar] of (ch.bars ?? []).entries()) {
      const cells = bar.replace(/[\s|]/g, '');
      if (cells.length !== 16) out.charts.push(`${name}: bar ${bi + 1} is ${cells.length} sixteenths, not 16`);
      for (const c of cells) {
        if (c === '.' || c === '-') continue;
        if (!LANE[c]) out.charts.push(`${name}: "${c}" is not a lane letter`);
        else if (!lanes.includes(LANE[c])) out.charts.push(`${name}: "${c}" is not one of its lanes (${lanes.join(' ')})`);
      }
    }
    if (ch.layer && !d.scores[ch.layer.score ?? 'castle']?.layers?.some(l => l.id === ch.layer.id)) out.charts.push(`${name}: no score layer "${ch.layer.id}"`);
    const parsed = parseChart(ch, { scores: d.scores });
    if (!parsed.notes.length) out.charts.push(`${name}: no notes`);
    out.notes += parsed.notes.length;
  }

  // Worlds: square rooms all one size, every edge door meeting a door back.
  const worlds = {};
  for (const [alias, def] of Object.entries(o.worlds)) worlds[alias] = await World.load('rooms/', def.file);
  const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
  const edgeDoors = (room) => {
    const e = { up: [], down: [], left: [], right: [] };
    for (const x of room.list) {
      if (x.typeName !== 'door') continue;
      if (x.y === 0) e.up.push(x); if (x.y === room.height - 1) e.down.push(x);
      if (x.x === 0) e.left.push(x); if (x.x === room.width - 1) e.right.push(x);
    }
    return e;
  };
  for (const [alias, w] of Object.entries(worlds)) {
    if (!w) { out.worldProblems.push(`${alias}: did not load`); continue; }
    const sizes = new Set();
    for (const id of w.at.keys()) {
      const room = w.room(id);
      out.rooms++;
      sizes.add(`${room.width}x${room.height}`);
      if (room.width !== room.height) out.worldProblems.push(`${alias}/${id} is not square`);
      const doors = edgeDoors(room);
      for (const [dir, list] of Object.entries(doors)) {
        if (!list.length) continue;
        const nid = w.neighbour(id, dir);
        if (!nid) { out.worldProblems.push(`${alias}/${id}: a door ${dir} opens onto nothing`); continue; }
        const back = edgeDoors(w.room(nid))[OPP[dir]];
        for (const x of list) {
          const along = dir === 'up' || dir === 'down' ? x.x : x.y;
          if (!back.some(b => (dir === 'up' || dir === 'down' ? b.x : b.y) === along)) out.worldProblems.push(`${alias}/${id}: its ${dir} door has no door back in ${nid}`);
        }
      }
    }
    if (sizes.size > 1) out.worldProblems.push(`${alias}: rooms of different sizes (${[...sizes].join(', ')})`);
  }

  // Places: every room a scene sends Coda to exists, and the tile is walkable.
  const places = [];
  for (const id of o.order) {
    const sc = o.scene(id);
    if (sc.kind === 'world') places.push([id, sc]);
    const t = o.resolveThen(sc);
    if (t?.place) places.push([`${id} (then)`, t.place]);
    for (const [i, e] of (sc.ends ?? []).entries()) places.push([`${id} (end ${i + 1})`, e]);
    if (sc.standIn) places.push([`${id} (stand-in)`, sc.standIn]);
    for (const r of sc.standInRooms ?? []) places.push([`${id} (stand-in room)`, { world: sc.world ?? 'castle', room: r }]);
  }
  for (const [name, p] of places) {
    const w = worlds[p.world];
    const room = w?.room(p.room);
    if (!room) { out.places.push(`${name}: no room "${p.room}" in world "${p.world}"`); continue; }
    if (p.at && !room.isWalkable(p.at[0], p.at[1])) out.places.push(`${name}: ${p.room} (${p.at}) is not walkable`);
  }

  // Triggers: a trigger naming a room that is in no world simply never fires.
  const worldOf = (id) => Object.entries(worlds).find(([, w]) => w?.has(id))?.[0];
  for (const t of o.triggers) {
    for (const k of ['room', 'from', 'to']) if (t[k] && !worldOf(t[k])) out.triggers.push(`${t.play}: ${k} "${t[k]}" is in no world`);
    if (t.area && !Object.values(worlds).some(w => w?.areas[t.area])) out.triggers.push(`${t.play}: area "${t.area}" is in no world`);
    if (t.on === 'cross') {
      const w = worlds[worldOf(t.from)];
      const dir = ['up', 'down', 'left', 'right'].find(dd => w?.neighbour(t.from, dd) === t.to);
      if (!dir) out.triggers.push(`${t.play}: ${t.from} and ${t.to} are not next to each other`);
      else if (!edgeDoors(w.room(t.from))[dir].length) out.triggers.push(`${t.play}: no door from ${t.from} into ${t.to}`);
    }
  }

  // Story tiles and characters in every room of every world.
  for (const [alias, w] of Object.entries(worlds)) {
    for (const id of w?.at.keys() ?? []) {
      for (const x of w.room(id).list) {
        if (x.typeName === 'stage') {
          if (!x.scene) out.stages.push(`${alias}/${id} (${x.x},${x.y}): no scene`);
          for (const k of ['scene', 'again']) if (x[k] && !o.scene(x[k])) out.stages.push(`${alias}/${id} (${x.x},${x.y}): ${k} "${x[k]}" is not a scene`);
        }
        if (x.typeName === 'npc') {
          const c = o.cast[x.who];
          if (!c) out.npcs.push(`${alias}/${id}: "${x.who}" is not in the cast`);
          else if (!c.lines?.length) out.npcs.push(`${alias}/${id}: ${c.name} has nothing to say`);
        }
      }
    }
  }
  return out;
});

console.log('\noutline');
ok('the outline has no loose ends', A.problems.length === 0, A.problems.slice(0, 5).join('; '));
ok('it is a whole game, not a sketch of one', A.scenes >= 40, `${A.scenes} scenes`);
ok('every scene kind has an engine', A.kinds.length === 0, A.kinds.join('; '));
const [lo, hi] = [180, 300];
ok(`it is 3 to 5 hours long (${Math.round(A.minutes.total)} minutes)`, A.minutes.total >= lo && A.minutes.total <= hi);
ok('every chart bar is sixteen sixteenths of real lanes', A.charts.length === 0, A.charts.slice(0, 5).join('; '));
ok('the charts are worth playing', A.notes > 400, `${A.notes} notes`);
ok('every world joins up (square rooms, doors back)', A.worldProblems.length === 0, A.worldProblems.slice(0, 5).join('; '));
ok('every place a scene sends Coda exists and is walkable', A.places.length === 0, A.places.slice(0, 5).join('; '));
ok('every trigger names real rooms, areas and doorways', A.triggers.length === 0, A.triggers.slice(0, 5).join('; '));
ok('every story tile plays a real scene', A.stages.length === 0, A.stages.join('; '));
ok('every character is in the cast and has lines', A.npcs.length === 0, A.npcs.join('; '));
ok('the worlds were actually read', A.rooms >= 20, `${A.rooms} rooms`);

// ---- 2. the whole story, autoplayed ---------------------------------------------------

const B = await page.evaluate(async () => {
  const d = CK.director, a = CK.audio;
  await a.resume();
  const visited = [], stuck = [];
  const notes = { checked: 0, heard: new Set(), off: new Set() };
  const real = a.play.bind(a);
  a.play = (o) => {
    const s = d.stageScene;
    if (s) {
      notes.checked++;
      if (o.heard !== false) notes.heard.add(`${s.sc.id}:${o.family}`);
      let inKey = false;
      for (let oct = 0; oct <= 9 && !inKey; oct++) for (let deg = -14; deg <= 28 && !inKey; deg++) if (s.music.getNote(deg, oct) === o.midi) inKey = true;
      if (!inKey) notes.off.add(`${s.sc.id}:${o.family}@${o.midi}`);
    }
    return real(o);
  };
  d.autoplay = true; d.speed = 8;
  await d.newGame();
  let last = null, since = performance.now();
  const t0 = performance.now();
  while (performance.now() - t0 < 300000) {
    await T.sleep(60);
    const id = d.story.scene, sc = d.scene;
    if (id !== last) { visited.push(id); last = id; since = performance.now(); }
    if (sc?.sc.kind === 'title' && visited.length > 2) { visited.push('title'); break; }
    if (sc && sc.sc.kind === 'world' && !d.busy && !d.queue.length) { d.skip(); continue; }
    if (performance.now() - since > 30000) { stuck.push(id); d.skip(); since = performance.now(); }
  }
  a.play = real;
  d.autoplay = false; d.speed = 1;
  return { visited, stuck, order: d.outline.order, notes: { checked: notes.checked, heard: [...notes.heard], off: [...notes.off] }, secs: Math.round((performance.now() - t0) / 1000) };
});

console.log(`\nthe whole story, autoplayed (${B.secs}s)`);
const missed = B.order.filter(id => id !== 'title' && !B.visited.includes(id));
ok('new game reaches every scene and comes back to the title', missed.length === 0 && B.visited.at(-1) === 'title', missed.length ? `never reached: ${missed.join(', ')}` : `ended at ${B.visited.at(-1)}`);
// First visits only: a world scene comes round again each time a scene hands
// Coda back to its rooms.
const firsts = B.visited.filter((id, i) => B.visited.indexOf(id) === i && id !== 'title');
const outOfOrder = firsts.filter((id, i) => i && B.order.indexOf(firsts[i - 1]) > B.order.indexOf(id));
ok('in reading order', outOfOrder.length === 0, outOfOrder.join(', '));
ok('every scene finishes by itself (none hangs)', B.stuck.length === 0, B.stuck.join(', '));
ok('scenes play music', B.notes.checked > 300, `${B.notes.checked} notes`);
ok('nothing a scene plays is heard by a lock', B.notes.heard.length === 0, B.notes.heard.slice(0, 5).join(', '));
ok('everything a scene plays is in its own key', B.notes.off.length === 0, B.notes.off.slice(0, 5).join(', '));

// ---- 3. the Wood, walked ------------------------------------------------------------------

const C = await page.evaluate(async () => {
  const d = CK.director, g = CK.game;
  const out = { steps: [] };
  const step = (name, cond, detail = '') => out.steps.push([name, !!cond, detail]);
  const where = () => `${g.world?.alias}/${g.room?.id} (${g.player.x},${g.player.y})`;
  const settled = () => !d.stageScene && !d.busy && !d.queue.length;
  d.autoplay = true; d.speed = 8;
  await d.jump('wood');
  step('the Wood starts at the crash site', g.room.id === 'wood-crash', where());
  T.walkTo(12, 6); g.move('right');
  step('east into the Glade', g.room.id === 'wood-glade', where());
  T.walkTo(6, 0); g.move('up');
  step('north into the burnt workshop', g.room.id === 'wood-workshop', where());
  T.walkTo(6, 4);
  await T.until(() => d.story.seen.includes('workshop-get') && settled());
  step('the workbench plays the flashback, then the workshop is yours', d.story.flags.includes('workshop') && d.story.items.includes('workshop'), JSON.stringify(d.story.flags));
  step('and you are back at the workbench', g.room.id === 'wood-workshop' && g.player.x === 6 && g.player.y === 4, where());
  T.walkTo(6, 12); g.move('down');
  T.walkTo(12, 6); g.move('right');
  step('east to the brook', g.room.id === 'wood-brook', where());
  const door = g.room.doodadAt(3, 2);
  step('the pipe is shut behind a door', door?.typeName === 'door' && !door.open);
  T.walkTo(4, 2); g.setFacing('right'); g.fire();
  await T.until(() => door.open, 8000);
  step('a wave across the water rings the far fork and opens it', door.open);
  step('and the brook joins the overture', g.progress.layers.has('wood-brook'));
  T.walkTo(2, 2);
  await T.until(() => d.story.tubes.includes('tube-brook') && settled() && g.room.id === 'wood-gate');
  step('the pipe carries you up the cliff to the gate', g.room.id === 'wood-gate', where());
  T.walkTo(3, 11);
  await T.until(() => settled() && g.room.id === 'wood-brook', 30000);
  step('and back down again, backwards', g.room.id === 'wood-brook' && g.player.x === 1 && g.player.y === 2, where());
  T.walkTo(2, 2);
  await T.until(() => settled() && g.room.id === 'wood-gate');
  T.walkTo(3, 6); g.setFacing('up'); g.interact();
  step('Da Capo talks', document.getElementById('dialog-head').textContent === 'Da Capo', document.getElementById('dialog-head').textContent);
  T.walkTo(6, 1);
  await T.until(() => d.story.seen.includes('castle-card') && settled() && g.world?.alias === 'castle', 40000);
  step('the gate leads into the castle, at the metronome', g.world.alias === 'castle' && g.room.id === 'atrium-00-metronome', where());
  d.autoplay = false; d.speed = 1;
  return out;
});
console.log('\nthe Wood, walked');
for (const [name, cond, detail] of C.steps) ok(name, cond, detail);

// ---- 4. the castle's triggers -----------------------------------------------------------------

const D = await page.evaluate(async () => {
  const d = CK.director, g = CK.game;
  const out = { steps: [] };
  const step = (name, cond, detail = '') => out.steps.push([name, !!cond, detail]);
  const settled = () => !d.stageScene && !d.busy && !d.queue.length;
  d.autoplay = true; d.speed = 8;
  await d.jump('castle');
  const w = g.world;
  // Through Brass 02's north door into the Flute: a crossing and a new area at once.
  const b2 = w.room('brass-02-crossroads'), flute = w.room('woodwind-01-flute');
  for (const x of [...b2.list, ...flute.list]) if (x.typeName === 'door') x.open = true;
  g.enterRoom(b2, { x: 6, y: 1, facing: 'up' });
  d.roomEntered(b2, false);
  const before = d.story.seen.length;
  g.move('up'); g.move('up');
  await T.until(() => d.story.seen.includes('ramparts-card') && settled());
  const played = d.story.seen.slice(before);
  step('walking onto the Ramparts rides the Updraft, then shows the card', played.join(',') === 'tube-updraft,ramparts-card', played.join(', '));
  step('and leaves you where you walked in', g.room.id === 'woodwind-01-flute' && g.player.y === 12, `${g.room.id} (${g.player.x},${g.player.y})`);
  // A puzzle opening the Reed Loft's door: the wing's instrument, boss and aftermath.
  const reed = w.room('woodwind-02-reed');
  g.enterRoom(reed, reed.playerStart);
  d.roomEntered(reed, false);
  const shut = reed.list.find(x => x.typeName === 'door' && !x.open && x.group !== 'entry');
  shut.setOpen(true, g.ctxFor(reed));
  await T.until(() => d.story.seen.includes('ramparts-after') && settled(), 60000);
  step('solving the Reed Loft plays the Ramparts\' instrument, boss and aftermath', ['ramparts-instrument', 'ramparts-boss', 'ramparts-after'].every(id => d.story.seen.includes(id)));
  step('the wing is marked done', d.story.flags.includes('ramparts'));
  step('and you are back in the Reed Loft', g.room.id === 'woodwind-02-reed', g.room.id);
  // The Unresolved Chord's exit: the finale.
  const chord = w.room('discord-03-chord');
  g.enterRoom(chord, chord.playerStart);
  d.roomEntered(chord, false);
  g.ctxFor(chord).onRoomComplete();
  await T.until(() => d.story.scene === 'heart-organ', 10000);
  step('the Unresolved Chord\'s exit starts the water organ', d.story.scene === 'heart-organ', d.story.scene);
  d.stop();
  d.autoplay = false; d.speed = 1;
  return out;
});
console.log('\nthe castle\'s triggers');
for (const [name, cond, detail] of D.steps) ok(name, cond, detail);

// ---- 5. saving and continuing ---------------------------------------------------------------

await page.evaluate(async () => {
  const d = CK.director;
  d.autoplay = true; d.speed = 8;
  await d.newGame();
  await T.until(() => d.scene?.sc.id === 'wood' && !d.busy, 60000);
  d.autoplay = false; d.speed = 1;
});
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ck-save-v1') ?? 'null'));
console.log('\nsaving');
ok('a story started from the title saves where it is', saved?.story?.scene === 'wood' && saved?.story?.world === 'wood' && saved?.room === 'wood-crash', JSON.stringify(saved?.story?.scene));
ok('and what it has seen', saved?.story?.seen?.includes('key-get'));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForFunction(() => window.CK?.director?.outline && window.CK.game?.world, null, { timeout: 20000 });
const label = await page.textContent('#title-continue');
ok('the title offers to continue', /continue/.test(label) && !(await page.isDisabled('#title-continue')), label);
await page.click('#title-continue');
await page.waitForFunction(() => window.CK.game.world?.alias === 'wood' && !window.CK.director.busy, null, { timeout: 10000 }).catch(() => {});
const cont = await page.evaluate(() => ({ world: CK.game.world?.alias, room: CK.game.room?.id, scene: CK.director.story.scene }));
ok('continue puts you back in the Wood', cont.world === 'wood' && cont.room === 'wood-crash' && cont.scene === 'wood', JSON.stringify(cont));
await page.evaluate(() => localStorage.clear());

// ---- 6. a phone ---------------------------------------------------------------------------------

const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
phone.on('pageerror', e => pageErrors.push(String(e)));
await phone.goto(BASE, { waitUntil: 'networkidle' });
await phone.waitForFunction(() => window.CK?.director?.outline && window.CK.game?.world, null, { timeout: 20000 });
const cdp = await phone.context().newCDPSession(phone);
const centre = (sel) => phone.evaluate((sel) => {
  const el = document.querySelector(sel);
  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const hit = document.elementFromPoint(x, y);
  return { x, y, visible: r.width > 0 && r.height > 0, covered: !(hit && (hit === el || el.contains(hit))), by: hit ? `${hit.tagName.toLowerCase()}#${hit.id}` : 'nothing' };
}, sel);
const touch = async (sel, holdMs = 60) => {
  const c = await centre(sel);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: c.x, y: c.y }] });
  await phone.waitForTimeout(holdMs);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await phone.waitForTimeout(80);
  return c;
};
const S = () => phone.evaluate(() => ({ scene: CK.director.story.scene, shot: CK.director.scene?.i ?? null, dev: CK.director.dev, presses: CK.director.scene?.run?.presses ?? 0 }));

console.log('\na phone');
await touch('#title-chapters');
ok('chapters open from the title', await phone.isVisible('#marble') && (await phone.textContent('#marble-title')) === 'Chapters');
await touch('#marble-close');
await touch('#title-new');
await phone.waitForTimeout(400);
let s = await S();
ok('new game opens on the fall', s.scene === 'fall', s.scene);
await phone.evaluate(() => { CK.director.speed = 6; });
await phone.waitForFunction(() => CK.director.scene?.i >= 2, null, { timeout: 15000 }).catch(() => {});
await phone.evaluate(() => { CK.director.speed = 1; });
const shotBefore = (await S()).shot;
for (let i = 0; i < 3; i++) await touch('#btn-a');
s = await S();
ok('A moves a cutscene on', s.scene !== 'fall' || s.shot > shotBefore, `shot ${shotBefore} -> ${s.shot}, ${s.scene}`);
const beforeSkip = s.scene;
await touch('#btn-r'); await touch('#btn-r');
await phone.waitForTimeout(300);
s = await S();
ok('R twice skips a scene', s.scene !== beforeSkip, `${beforeSkip} -> ${s.scene}`);
await touch('#menu-btn');
const devBtn = await centre('#menu-dev');
ok('developer mode is a button a thumb can reach in the pause menu', devBtn.visible && !devBtn.covered, devBtn.by);
await touch('#menu-dev');
await touch('#menu-resume');
s = await S();
ok('developer mode turns on', s.dev && await phone.isVisible('#dev-bar'));
const menuBtn = await centre('#menu-btn');
ok('the dev bar leaves the menu button reachable', menuBtn.visible && !menuBtn.covered, menuBtn.by);
for (const sel of ['#dev-skip', '#dev-marble', '#dev-auto']) {
  const c = await centre(sel);
  ok(`${sel} is reachable`, c.visible && !c.covered, c.by);
}
await touch('#dev-marble');
const blocks = await phone.evaluate(() => document.querySelectorAll('#marble-acts .blk').length);
const total = await phone.evaluate(() => CK.director.outline.order.length);
ok('the Marble shows every scene', blocks === total, `${blocks} of ${total}`);
await phone.evaluate(() => [...document.querySelectorAll('#marble-acts .blk')].find(b => b.title.startsWith('The Brook Pipe')).scrollIntoView());
await phone.evaluate(() => [...document.querySelectorAll('#marble-acts .blk')].find(b => b.title.startsWith('The Brook Pipe')).click());
await phone.waitForTimeout(100);
await phone.evaluate(() => document.querySelector('#marble-detail [data-act="play"]').scrollIntoView());
await touch('#marble-detail [data-act="play"]');
await phone.waitForFunction(() => CK.director.story.scene === 'tube-brook' && CK.director.scene?.state === 'run', null, { timeout: 10000 }).catch(() => {});
s = await S();
ok('a block in the Marble plays from there', s.scene === 'tube-brook', s.scene);
for (const arm of ['.left', '.down', '.up', '.right']) await touch(`#dpad ${arm}`, 50);
s = await S();
ok('the D-pad plays the pipe\'s lanes', s.presses >= 4, `${s.presses} presses`);
await touch('#dev-more');
await touch('#dev-off');
s = await S();
ok('player mode hides it all again', !s.dev && !(await phone.isVisible('#dev-bar')));

const real = pageErrors.filter(e => !AUDIO_ONLY.test(e));
ok('nothing threw on the page', real.length === 0, real.slice(0, 3).join(' | '));

await browser.close();
if (fails.length) { console.error('\nFAIL\n' + fails.map(f => '  ✕ ' + f).join('\n')); process.exit(1); }
console.log('\nthe whole game plays, start to credits');
