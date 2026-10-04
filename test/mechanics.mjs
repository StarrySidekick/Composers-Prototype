/* Composer's Key — do the new mechanics do what they say, and do the gates hold?
   ---------------------------------------------------------------------
   test/solve.mjs and test/route.mjs prove every room CAN be finished. A gate
   that can also be finished without the thing it gates passes both and is
   still broken: an Overtone you never needed, a stair that does not matter.
   This checks the other direction, room by room, and pins each new mechanic.

     the Triad        cannot be done with 1 or 2 waves in the air, whatever the order
     the Stand        nothing but a breathing reed holds its door long enough to walk to
     the Reed Loft    the reed holds the door long enough; one shot would not
     the Stair        the lock refuses mi re do in G and in A#, takes it in A
     the Coda         its own instruments cannot finish the phrase; next door's can
     the Hall         the score gate stays shut one layer short
     plus             flute fingering, reed breaths, dissonants, stairs, the burin,
                      the satchel and the save, waves through doors, paired doors,
                      the wave allowance, and the score staying in key and unheard

   Serve the repo root on :8080, then `node test/mechanics.mjs`.
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
  const g = window.CK.game, a = window.CK.audio, world = g.world;
  const played = [];
  a.play = (o) => { played.push(o); if (a.heard?.(o) ?? true) a.onNote?.(o.midi, o.family, o); };
  a.click = () => {};
  g.saving = false;
  const out = {};
  const WALK = 5.6;   // tiles a second, Game.walk

  const fresh = (id, give = {}) => {
    const p = new Progress();
    Object.assign(p, { waves: give.waves ?? 1 });
    for (const i of give.items ?? []) p.items.add(i);
    for (const e of give.satchel ?? []) p.carry(JSON.parse(JSON.stringify(e)));
    for (let i = 0; i < (give.layers ?? 0); i++) p.layers.add(`given-${i}`);
    g.progress = p;
    world.forgetAll();
    g.loadRoom(world.json[id]);
    if (g.score) g.score.muted = true;
    return g.room;
  };
  const at = (x, y, face = 'right') => g.enterRoom(g.room, { x, y, facing: face });
  const run = (subs, each) => {
    for (let i = 0; i < subs; i++) {
      const index = ++g.clock.index;
      const ev = { index, isBeat: index % 4 === 0, beat: Math.floor(index / 4) };
      if (ev.isBeat) for (const d of [...g.room.list]) { d.onBeat(ev.beat, g.ctx); d.tickHold(ev.beat, g.ctx); }
      g.stepWaves(ev);
      each?.(i);
    }
  };
  const door = (room, x, y) => room.doodadAt(x, y);
  // Walking distance in tiles, every door treated as open. Coda walks freely,
  // diagonals included, so this is the shortest 8-way path (a diagonal costs
  // 1.41, and only where both tiles beside it are open, as a body cannot squeeze
  // between two corners): an honest lower bound on the time a run takes.
  const tiles = (room, from, to) => {
    const free = (x, y) => {
      if (!room.inBounds(x, y)) return false;
      const t = room.doodadAt(x, y);
      return !t || t.typeName === 'door' || !t.solid;
    };
    const dist = new Map([[`${from.x},${from.y}`, 0]]);
    const open = [{ ...from, d: 0 }];
    while (open.length) {
      open.sort((p, q) => p.d - q.d);
      const c = open.shift();
      if (c.d > dist.get(`${c.x},${c.y}`)) continue;
      if (c.x === to.x && c.y === to.y) return c.d;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        if (!dx && !dy) continue;
        const x = c.x + dx, y = c.y + dy;
        if (!free(x, y)) continue;
        if (dx && dy && (!free(c.x + dx, c.y) || !free(c.x, c.y + dy))) continue;
        const d = c.d + (dx && dy ? Math.SQRT2 : 1);
        if (d < (dist.get(`${x},${y}`) ?? Infinity)) { dist.set(`${x},${y}`, d); open.push({ x, y, d }); }
      }
    }
    return Infinity;
  };
  // How long (seconds) a door stays open from now, sixteenth by sixteenth.
  const openWindow = (d, subs = 160) => {
    let first = null, last = null;
    run(subs, (i) => { if (d.open) { if (first == null) first = i; last = i; } });
    const s = g.clock.subInterval;
    return first == null ? null : { from: first * s, to: (last + 1) * s };
  };

  // ---- the Triad: three waves at once, or nothing ------------------------------
  const TRIAD = 'tower-01-triad';
  const shots = { up: 'up', left: 'left', right: 'right' };
  const triad = (waves, order) => {
    const room = fresh(TRIAD, { waves });
    at(6, 10, order[0]);
    const exit = door(room, 6, 12);
    let next = 0;
    // Fire each shot the first sixteenth the allowance lets it, two sixteenths
    // apart at best (a fast thumb), then watch.
    let opened = false;
    for (let i = 0; i < 200 && !opened; i++) {
      if (next < order.length && i % 2 === 0) {
        g.setFacing(order[next]);
        if (g.keyWaves < g.waveAllowance) { g.fire(); next++; }
      }
      run(1);
      opened = exit.open;
    }
    return opened;
  };
  const orders = [['up', 'left', 'right'], ['up', 'right', 'left'], ['left', 'up', 'right'], ['left', 'right', 'up'], ['right', 'up', 'left'], ['right', 'left', 'up']];
  // The same, blowing the three mouthpieces with B instead of firing: a breath
  // is Coda's wave too, or the Overtones would not be needed at all.
  const blow = (waves, order) => {
    const room = fresh(TRIAD, { waves });
    at(6, 10, order[0]);
    const exit = door(room, 6, 12);
    let next = 0;
    for (let i = 0; i < 200 && !exit.open; i++) {
      if (next < order.length && i % 2 === 0) { g.setFacing(order[next]); const n = g.keyWaves; g.interact(); if (g.keyWaves > n) next++; }
      run(1);
    }
    return exit.open;
  };
  out.triad = {
    blowThree: blow(3, ['up', 'left', 'right']),
    blowTwo: orders.filter(o => blow(2, o)).map(o => o.join('-')),
    three: triad(3, ['up', 'left', 'right']),
    two: orders.filter(o => triad(2, o)).map(o => o.join('-')),
    one: orders.filter(o => triad(1, o)).map(o => o.join('-')),
  };

  // ---- the Stand: only a breathing reed holds the gate long enough -----------
  const STAND = 'tower-02-carry';
  const reed = { name: 'reed', spec: { type: 'reed', rot: 90, breath: 8 } };
  {
    let room = fresh(STAND, { waves: 3, items: ['burin'], satchel: [reed] });
    at(1, 3, 'right'); g.shoulderL(); g.interact();
    const gate = door(room, 4, 9);
    const w = openWindow(gate);
    const walk = tiles(room, { x: 1, y: 3 }, { x: 4, y: 9 }) / WALK;
    out.stand = { reed: w, walk };
    // The best without a reed: a bass drum on the stand turning three quick shots
    // down the slot (a wave going right, off a head slanted "\" facing up-right).
    room = fresh(STAND, { waves: 3, items: ['burin'], satchel: [{ name: 'bass drum', spec: { type: 'drum', part: 'bass', rot: 270 } }] });
    at(1, 3, 'right'); g.shoulderL();
    let fired = 0, first = null, last = null;
    const gate2 = door(room, 4, 9);
    run(160, (i) => {
      if (i % 2 === 0 && fired < 3) { g.fire(); fired++; }
      if (gate2.open) { if (first == null) first = i; last = i; }
    });
    out.stand.drum = first == null ? null : { from: first * g.clock.subInterval, to: (last + 1) * g.clock.subInterval };
    // And a shot straight up the slot from anywhere Coda can stand: none exists.
    let reach = 0;
    room = fresh(STAND, { waves: 1 });
    for (let y = 0; y < room.height; y++) for (let x = 0; x < room.width; x++) {
      if (room.doodadAt(x, y)) continue;
      for (const face of Object.keys(DIR)) {
        g.loadRoom(world.json[STAND]); at(x, y, face); g.fire(); run(24);
        if (g.room.doodadAt(2, 11).lit) reach++;
      }
    }
    out.stand.directShots = reach;
  }

  // ---- the Reed Loft: the reed's window covers the run ---------------------------
  {
    const room = fresh('woodwind-02-reed');
    at(1, 2, 'right'); g.interact();
    const w = openWindow(door(room, 6, 8));
    out.loft = { reed: w, walk: tiles(room, { x: 1, y: 2 }, { x: 6, y: 8 }) / WALK };
  }

  // ---- the Stair: the same keys, three keys of the room ------------------------
  const STAIR = 'tower-03-stair';
  const stair = (steps) => {
    const room = fresh(STAIR);
    at(5, 4, 'right');
    for (let i = 0; i < steps; i++) { g.move('right'); }
    const key = room.music.root;
    at(10, 5); g.move('down'); run(2); g.move('left'); run(2); g.move('left'); run(2);
    return { key, lit: room.list.find(d => d.typeName === 'notelock').lit };
  };
  out.stair = {
    G: (() => { const room = fresh(STAIR); at(10, 5); g.move('down'); g.move('left'); g.move('left'); return room.list.find(d => d.typeName === 'notelock').lit; })(),
    A: stair(2),
  };
  {
    // The three-step stair: A sharp on the dais, and the lock says no.
    const room = fresh(STAIR);
    at(4, 8, 'right'); g.move('right'); g.move('right'); g.move('right'); g.move('right');
    out.stair.Asharp = { key: room.music.root, lit: false };
    at(10, 5); g.move('down'); g.move('left'); g.move('left');
    out.stair.Asharp.lit = room.list.find(d => d.typeName === 'notelock').lit;
    // Coming back down the same three steps lowers it again.
    at(8, 8, 'left'); g.move('left'); g.move('left'); g.move('left'); g.move('left');
    out.stair.downAgain = room.music.root;
  }

  // ---- the Coda and the Hall ------------------------------------------------------
  {
    let room = fresh('discord-02-coda', { layers: 9 });
    at(12, 6, 'left'); g.fire(); run(64);
    out.coda = { alone: room.list.find(d => d.typeName === 'notelock').lit };
    room = fresh('discord-01-hall', { layers: 8 });
    run(16);
    out.hall = { eight: door(room, 0, 6).open };
    room = fresh('discord-01-hall', { layers: 9 });
    run(16);
    out.hall.nine = door(room, 0, 6).open;
    // ...and with the gate open, the Hall's flute finishes the Coda's phrase.
    at(5, 6, 'left'); g.interact(); run(64);
    const coda = world.room('discord-02-coda');
    out.coda.fromNextDoor = coda.list.find(d => d.typeName === 'notelock').lit;
    out.coda.moodAfter = coda.music.mood;
  }

  // ---- the bell lets the wave out ------------------------------------------------------
  {
    const room = fresh('brass-05-slide');
    played.length = 0;
    at(1, 2, 'right'); g.interact(); run(8);
    out.bell = { out: g.waves.some(w => w.alive && w.y === 2 && w.x > 6), brass: played.filter(p => p.family === 'brass').length };
  }

  // ---- the flute -------------------------------------------------------------------
  {
    const room = fresh('woodwind-01-flute');
    played.length = 0;
    at(1, 9, 'right'); g.interact(); run(3);
    const w1 = g.waves.find(w => w.alive);
    const first = { midi: played.find(p => p.family === 'woodwind')?.midi, dir: w1 ? [w1.dir.x, w1.dir.y] : null };
    run(64);
    for (const x of [3, 4, 5]) room.doodadAt(x, 9).covered = true;
    played.length = 0;
    at(1, 9, 'right'); g.interact(); run(6);
    const w2 = g.waves.find(w => w.alive);
    const foot = { midi: played.find(p => p.family === 'woodwind')?.midi, dir: w2 ? [w2.dir.x, w2.dir.y] : null };
    out.flute = {
      firstHole: first, foot,
      want: { firstHole: room.music.getNote(5, 5), foot: room.music.getNote(2, 5) },
    };
  }

  // ---- the reed --------------------------------------------------------------------
  {
    const room = fresh('woodwind-02-reed');
    played.length = 0;
    at(1, 2, 'right'); g.interact(); run(40);
    const breaths = played.filter(p => p.family === 'woodwind').length;
    const r2 = fresh('woodwind-02-reed');
    played.length = 0;
    const weak = new (g.waves.constructor === Array ? Object : Object)();
    const { SoundWaveState } = await import('./src/core/sound-wave.js');
    const st = new SoundWaveState({ intensity: 0.4 });
    g.spawnWave(1, 2, DIR.right, st);
    run(40);
    out.reed = { breaths, weakBreaths: played.filter(p => p.family === 'woodwind').length, spec: r2.doodadAt(2, 2).breath };
  }

  // ---- dissonants -------------------------------------------------------------------
  {
    const room = fresh('discord-01-hall', { waves: 3 });
    const d = room.list.find(x => x.typeName === 'dissonant' && x.path === 'line' && x.heading.y === 0 && x.y === 9);
    const x0 = d.x;
    run(4);
    out.dissonant = { moved: d.x - x0 };
    // A wave down its row resolves it.
    at(1, 9, 'right'); g.fire(); run(16);
    out.dissonant.resolved = !room.list.includes(d);
    // Touching one shoves Coda.
    const e = room.list.find(x => x.typeName === 'dissonant');
    g.hurtUntil = 0;
    g.player.x = e.x - 1; g.player.y = e.y; g.player.rx = e.x - 1; g.player.ry = e.y;
    const before = g.player.rx;
    g.hurt(e);
    out.dissonant.shoved = before - g.player.rx;
  }

  // ---- the burin, the satchel, and what the world remembers -----------------------
  {
    // In the Triad's alcove: the L button offers to lift the hi-hat once you hold
    // the burin, offers to set it down once you carry it, and R offers to turn it.
    let room = fresh('tower-01-triad', { items: ['burin'] });
    at(11, 2, 'down');
    const hints = [g.shoulderHint()];
    g.shoulderL();                           // the hat is in the satchel; floor in front now
    hints.push(g.shoulderHint());
    out.hints = hints.map(h => `${h.l}/${h.r}`);
    room = fresh('woodwind-02-reed');
    at(1, 2, 'right');
    out.hints.push((() => { const h = g.shoulderHint(); return `${h.l}/${h.r}`; })());
    out.burin = { without: g.shoulderL() };
    g.progress.items.add('burin');
    out.burin.with = g.shoulderL();
    out.burin.carrying = g.progress.held?.name;
    // Rebuilt from its file, the room does not grow a second reed.
    world.forgetAll();
    room = world.room('woodwind-02-reed');
    out.burin.reedBack = room.doodadAt(2, 2)?.typeName ?? null;
    // Put it down somewhere else; rebuilt, it is there and nowhere else.
    g.enterRoom(room, { x: 5, y: 5, facing: 'right' });
    g.shoulderR();
    out.burin.placed = g.shoulderL();
    world.forgetAll();
    room = world.room('woodwind-02-reed');
    out.burin.afterRebuild = { at6_5: room.doodadAt(6, 5)?.typeName ?? null, rot: room.doodadAt(6, 5)?.rot, reeds: room.list.filter(d => d.typeName === 'reed').length };
    // An Overtone collected stays collected.
    room = fresh('woodwind-01-flute');
    at(10, 3, 'up'); door(room, 10, 4).open = true; g.move('up');
    const waves = g.progress.waves;
    world.forgetAll();
    out.burin.overtone = { waves, back: world.room('woodwind-01-flute').doodadAt(10, 2)?.typeName ?? null };
    // And the save round-trips.
    const saved = JSON.parse(JSON.stringify(g.progress.toJSON()));
    const back = new Progress(saved);
    out.burin.save = JSON.stringify(back.toJSON()) === JSON.stringify(saved);
    // Continue puts you back in the saved room, on the saved tile.
    const cont = new Progress(); cont.room = 'brass-02-crossroads'; cont.at = { x: 3, y: 4, facing: 'down' };
    g.continueGame(new Progress(JSON.parse(JSON.stringify(cont.toJSON()))));
    g.saving = false; Progress.erase();
    out.burin.continued = [g.room.id, g.player.x, g.player.y, g.player.facing];
  }

  // ---- waves through doors, and paired doors ----------------------------------------
  {
    let room = fresh('brass-02-crossroads');
    // Brass 01's east door is open once it is solved; a shut one would stop the
    // wave on the far side, as a shut door is a wall from both sides.
    world.room('brass-01-first-breath').doodadAt(12, 6).open = true;
    at(1, 6, 'left'); g.fire(); run(4);
    const b01 = world.room('brass-01-first-breath');
    out.through = { inNext: b01.waves.filter(w => w.alive).length, here: room.waves.filter(w => w.alive).length };
    run(8);
    // ...and lights Brass 01's fork, which nothing in Brass 02 could reach.
    out.through.litNextDoor = b01.doodadAt(7, 6).lit;
    room = fresh('woodwind-02-reed');
    const north = world.room('brass-01-first-breath').doodadAt(6, 0);
    out.paired = { before: north.open };
    at(5, 10, 'right'); g.fire(); run(16);
    out.paired.after = north.open;
  }

  // ---- the wave allowance ------------------------------------------------------------
  {
    const room = fresh('brass-01-first-breath');
    at(2, 8, 'right');
    g.fire(); g.fire();
    const one = g.keyWaves;
    g.progress.give('overtone');
    g.fire();
    out.allowance = { one, afterOvertone: g.keyWaves };
    room.maxWaves = 1;
    g.fire();
    out.allowance.capped = g.keyWaves;
  }

  // ---- stairs, directionally ---------------------------------------------------------
  {
    const room = fresh('tower-03-stair');
    const k0 = room.music.root;
    at(5, 4, 'right'); g.move('right');
    const up = room.music.root;
    at(6, 3, 'down');
    const s = room.doodadAt(6, 4);
    s.onPlayerEnter(g.ctx, DIR.down);
    const across = room.music.root;
    at(7, 4, 'left'); g.move('left');
    out.stairs = { up: (up - k0 + 12) % 12, across: (across - up + 12) % 12, down: (room.music.root - k0 + 12) % 12 };
  }

  // ---- the boss: each phase only gives way to its real answer ------------------------
  {
    const BOSS = 'discord-03-chord';
    let room = fresh(BOSS, { waves: 3 });
    const boss = () => room.list.find(d => d.typeName === 'boss');
    const b0 = boss();
    // Waves do not hurt it.
    at(9, 6, 'left'); g.fire(); run(16);
    const hurt = b0.phase;
    // The wrong phrase (do mi sol, the call backwards) does nothing...
    for (const x of [4, 6, 8]) { at(x, 3, 'up'); g.move('up'); run(2); }
    const wrong = b0.phase;
    run(40);
    // ...the call (sol mi do) resolves the first voice and releases the swarm.
    for (const x of [8, 6, 4]) { at(x, 3, 'up'); g.move('up'); run(2); }
    run(8);
    const swarm = room.list.filter(d => d.typeName === 'dissonant').length;
    out.boss = { hurt, wrong, echo: b0.phase, swarm, mood2: room.music.mood };
    // Phase three, the chord, with N waves in the air: fire into the three horns
    // in an order, a sixteenth or two apart, as fast as the allowance lets.
    const chord = (waves, order, gap = 2) => {
      room = fresh(BOSS, { waves });
      const b = boss();
      b.phase = 3; b.spawned = true;
      at(6, 10, order[0]);
      let next = 0;
      for (let i = 0; i < 160 && b.phase === 3; i++) {
        if (next < order.length && i % gap === 0) { g.setFacing(order[next]); const n = g.keyWaves; g.fire(); if (g.keyWaves > n) next++; }
        run(1);
      }
      return b.phase > 3;
    };
    const orders = [['right', 'up', 'left'], ['right', 'left', 'up'], ['up', 'right', 'left'], ['up', 'left', 'right'], ['left', 'up', 'right'], ['left', 'right', 'up']];
    out.boss.chordThree = chord(3, ['right', 'up', 'left']);
    out.boss.chordTwo = orders.filter(o => chord(2, o, 1) || chord(2, o, 2)).map(o => o.join('-'));
    // Won: the figure is gone, an exit stands there, the room is content, the
    // tune's last layer is earned, and a rebuilt room remembers.
    chord(3, ['right', 'up', 'left']);
    const won = { exit: room.doodadAt(6, 6)?.typeName, parts: room.list.filter(d => d.typeName === 'bosspart' || d.typeName === 'boss').length, mood: room.music.mood, finale: g.progress.layers.has('finale') };
    world.forgetAll();
    const again = world.room(BOSS);
    won.rebuilt = { exit: again.doodadAt(6, 6)?.typeName, boss: again.list.some(d => d.typeName === 'boss') };
    out.boss.won = won;
  }

  // ---- the metronome: no tune until it runs; stopping it pauses the tune in place ----
  {
    const room = fresh('atrium-00-metronome');
    g.score.muted = false;
    g.score.reset();
    g.unlockLayers('start');                 // a new game has the motif
    const tick = (n) => {
      const before = played.length;
      for (let i = 0; i < n; i++) {
        const index = ++g.clock.index;
        const ev = { index, time: g.clock.timeOf(index), isBeat: index % 4 === 0, beat: Math.floor(index / 4) };
        if (ev.isBeat) for (const d of [...g.room.list]) d.onBeat(ev.beat, g.ctx);
        g.score.tick(ev, g);
      }
      return played.slice(before).filter(p => p.family !== 'percussion' || p.kind);
    };
    const exit = door(room, 12, 6);
    const silent = tick(64).filter(p => p.heard === false && p.family === 'keys').length;
    at(6, 6, 'up'); g.interact();
    const on = g.progress.metronome;
    const first = tick(8).filter(p => p.family === 'keys');
    const posAfterStart = g.score.pos;
    const firstOnBeat = first.length > 0 && (() => {
      const k = (first[0].when - g.clock.startTime) / g.clock.subInterval;
      return Math.round(k) % 4 === 0;
    })();
    const playedOn = tick(24).filter(p => p.family === 'keys').length;
    const pos = g.score.pos;
    at(6, 6, 'up'); g.interact();
    const pausedNotes = tick(64).filter(p => p.family === 'keys').length;
    const posPaused = g.score.pos;
    at(6, 6, 'up'); g.interact();
    tick(8);
    out.metronome = {
      silent, on, firstOnBeat, playedOn, pausedNotes, held: posPaused === pos,
      resumed: g.score.pos > pos && g.score.pos <= pos + 8, doorOpen: exit.open,
      ticks: played.filter(p => p.click).length,
    };
    g.score.muted = true;
  }

  // ---- the score: in key, unheard, growing ---------------------------------------------
  {
    const room = fresh('brass-01-first-breath');
    g.score.muted = false;
    g.score.reset();
    g.progress.metronome = true;
    for (const l of g.score.layers) g.progress.layers.add(l.id);
    played.length = 0;
    const heardBefore = g.noteHistory.length;
    for (let i = 0; i < g.score.steps; i++) {
      const index = ++g.clock.index;
      g.score.tick({ index, time: g.clock.timeOf(index), isBeat: index % 4 === 0 }, g);
    }
    const legal = new Set();
    for (let o = 0; o <= 9; o++) for (let d = -14; d <= 21; d++) legal.add(room.music.getNote(d, o));
    out.score = {
      notes: played.length,
      offScale: played.filter(p => p.family !== 'percussion' && !legal.has(p.midi)).length,
      heard: played.filter(p => p.heard !== false).length,
      staff: g.noteHistory.length - heardBefore,
      layers: g.score.layers.length,
    };
    g.score.muted = true;
    // Opening a door in a room with a layer earns it.
    fresh('brass-02-crossroads');
    const had = g.progress.layers.has('bass');
    at(2, 2, 'right'); g.fire(); run(64);
    out.score.earned = !had && g.progress.layers.has('bass');
  }
  return out;
});

const fails = [];
const ok = (name, cond, detail = '') =>
  cond ? console.log(`  ok   ${name}`) : fails.push(`${name}${detail ? ' — ' + detail : ''}`);
const s = (v) => JSON.stringify(v);

ok('the Triad opens with three waves in the air', r.triad.three);
ok('the Triad cannot be opened with two, in any order', r.triad.two.length === 0, r.triad.two.join(', '));
ok('or with one', r.triad.one.length === 0, r.triad.one.join(', '));
ok('blowing the three mouthpieces (B) opens it with three waves', r.triad.blowThree);
ok('but not with two: a breath is Coda\'s wave too', r.triad.blowTwo.length === 0, r.triad.blowTwo.join(', '));
ok('a bell lets the wave out after it sounds', r.bell.out, s(r.bell));

ok('the Stand: a breathing reed holds the gate until Coda can walk there',
  r.stand.reed && r.stand.reed.to > r.stand.walk + 0.25, `${s(r.stand.reed)}, walk ${r.stand.walk.toFixed(2)} s`);
ok('the Stand: the drum really is the best other way (it opens the gate at all)', !!r.stand.drum, s(r.stand.drum));
ok('the Stand: a drum and three quick shots shut it before he arrives',
  !r.stand.drum || r.stand.drum.to < r.stand.walk, `${s(r.stand.drum)}, walk ${r.stand.walk.toFixed(2)} s`);
ok('the Stand: no shot from anywhere Coda can stand reaches the fork', r.stand.directShots === 0, `${r.stand.directShots}`);
ok('the Reed Loft: the reed holds the chamber door until Coda can walk there',
  r.loft.reed && r.loft.reed.to > r.loft.walk + 0.25, `${s(r.loft.reed)}, walk ${r.loft.walk.toFixed(2)} s`);

ok('the Stair: mi re do in G does not open it', r.stair.G === false);
ok('the Stair: two steps up is A, and it opens', r.stair.A.key === 9 && r.stair.A.lit, s(r.stair.A));
ok('the Stair: three steps up is A sharp, and it does not', r.stair.Asharp.key === 10 && !r.stair.Asharp.lit, s(r.stair.Asharp));
ok('the Stair: walking back down lowers the room again', r.stair.downAgain === 7, `${r.stair.downAgain}`);
ok('stairs: up raises, across does nothing, down lowers', r.stairs.up === 1 && r.stairs.across === 0 && r.stairs.down === 0, s(r.stairs));

ok('the Coda cannot finish its phrase alone', r.coda.alone === false);
ok('the Hall\'s flute finishes it through the door', r.coda.fromNextDoor === true);
ok('and the Coda turns content when it resolves', r.coda.moodAfter === 'content', r.coda.moodAfter);
ok('the Hall\'s gate stays shut one layer short', r.hall.eight === false);
ok('and opens at nine', r.hall.nine === true);

ok('flute, all holes open: la, out of the first hole (up)', r.flute.firstHole.midi === r.flute.want.firstHole && s(r.flute.firstHole.dir) === s([0, -1]), s(r.flute));
ok('flute, all covered: mi, out of the foot (right)', r.flute.foot.midi === r.flute.want.foot && s(r.flute.foot.dir) === s([1, 0]), s(r.flute));
ok('the reed breathes as many times as it has breath', r.reed.breaths === r.reed.spec, s(r.reed));
ok('a weak wave gives it one breath', r.reed.weakBreaths === 1, s(r.reed));

ok('a dissonant walks a tile a beat', Math.abs(r.dissonant.moved) === 1, s(r.dissonant));
ok('a wave resolves it', r.dissonant.resolved);
ok('touching one shoves Coda back', r.dissonant.shoved > 0.9, s(r.dissonant));

ok('L says "lift" facing the hi-hat, then "set" and R "turn" while carrying, and nothing without the burin',
  s(r.hints) === s(['lift/null', 'set/turn', 'null/null']), s(r.hints));
ok('nothing lifts without the burin', r.burin.without === false);
ok('with it, the reed goes into the satchel', r.burin.with === true && r.burin.carrying === 'reed', s(r.burin));
ok('a rebuilt room does not grow the lifted reed back', r.burin.reedBack === null, s(r.burin));
ok('set down elsewhere, turned, it stays there after a rebuild, once',
  r.burin.placed && r.burin.afterRebuild.at6_5 === 'reed' && r.burin.afterRebuild.rot === 90 && r.burin.afterRebuild.reeds === 1, s(r.burin.afterRebuild));
ok('an Overtone raises the allowance and does not come back', r.burin.overtone.waves === 2 && r.burin.overtone.back === null, s(r.burin.overtone));
ok('the save round-trips', r.burin.save);
ok('continue puts you back where you were', s(r.burin.continued) === s(['brass-02-crossroads', 3, 4, 'down']), s(r.burin.continued));

ok('a wave out of an open door carries on in the next room', r.through.inNext === 1 && r.through.here === 0, s(r.through));
ok('and keeps going there, far enough to light that room\'s fork', r.through.litNextDoor === true, s(r.through));
ok('a shortcut opens on both sides at once', r.paired.before === false && r.paired.after === true, s(r.paired));

ok('one wave at a time to start', r.allowance.one === 1, s(r.allowance));
ok('an Overtone makes it two', r.allowance.afterOvertone === 2, s(r.allowance));
ok('a room can cap it', r.allowance.capped === 2, s(r.allowance));

ok('the boss cannot be hurt by a wave', r.boss.hurt === 1, s(r.boss));
ok('the boss ignores the wrong phrase', r.boss.wrong === 1, s(r.boss));
ok('the echo (sol mi do) resolves its first voice and releases four dissonants', r.boss.echo === 2 && r.boss.swarm === 4 && r.boss.mood2 === 'sad', s(r.boss));
ok('the chord, longest horn first, three waves: the last voice resolves', r.boss.chordThree, s(r.boss));
ok('the chord cannot be played with two waves, in any order or spacing', r.boss.chordTwo.length === 0, r.boss.chordTwo.join(', '));
ok('won: gone, an exit where it stood, content, the last layer earned', r.boss.won.exit === 'exit' && r.boss.won.parts === 0 && r.boss.won.mood === 'content' && r.boss.won.finale, s(r.boss.won));
ok('and a rebuilt room remembers', r.boss.won.rebuilt.exit === 'exit' && !r.boss.won.rebuilt.boss, s(r.boss.won.rebuilt));
ok('the tune is silent until the metronome starts', r.metronome.silent === 0, s(r.metronome));
ok('B on the metronome starts it, and the tune with it, on a beat', r.metronome.on && r.metronome.playedOn > 0 && r.metronome.firstOnBeat, s(r.metronome));
ok('stopping it pauses the tune where it is', r.metronome.pausedNotes === 0 && r.metronome.held, s(r.metronome));
ok('starting it again carries on from there', r.metronome.resumed, s(r.metronome));
ok('and its door stays open, latched', r.metronome.doorOpen, s(r.metronome));
ok('the score plays', r.score.notes > 60, `${r.score.notes} notes`);
ok('every score note is in the room\'s scale', r.score.offScale === 0, `${r.score.offScale} off`);
ok('no lock can hear the score', r.score.heard === 0 && r.score.staff === 0, s(r.score));
ok('solving a room earns its layer', r.score.earned);

const realErrors = pageErrors.filter(e => !/Unable to decode audio data/.test(e));
ok('nothing threw on the page', realErrors.length === 0, realErrors.join(' | '));
await browser.close();
if (fails.length) {
  console.log(`\nFAIL (${fails.length})`);
  for (const f of fails) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('PASS');
