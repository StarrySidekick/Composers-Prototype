import { BeatClock } from './core/beat-clock.js';
import { SoundWave, SoundWaveState, WaveSource, SOURCE_FOR_FAMILY } from './core/sound-wave.js';
import { Room } from './core/room.js';
import { DIR, dirName } from './core/direction.js';
import { arrival, mirror } from './core/world.js';
import { createDoodad } from './core/doodad.js';
import { Progress } from './core/progress.js';

const WALK_SPEED = 5.6;   // tiles a second: Link's 1.5 px a frame, 60 fps, 16 px tiles
const BODY = 0.34;        // half of Coda's footprint, in tiles: fits a one-tile gap
const THROUGH_WALL = 0.3; // how loud a room next door sounds, through its open door
import './doodads/index.js';

export class Game {
  constructor(audio, renderer) {
    this.audio = audio;
    this.renderer = renderer;
    this.clock = new BeatClock(audio.ctx);
    this.lastBeat = 0;
    this.metronome = false;
    this.toasts = [];
    this.noteHistory = [];
    this.onToast = null;
    this.onRoomComplete = null;
    this.onRoomChange = null;   // (room) — the world moved you somewhere new
    this.onBeforeRoomChange = null; // (dirName) — about to: the screen can scroll
    this.onAreaChange = null;   // (area) — crossed into a run of rooms with a new mood
    this.onDoorOpen = null;     // (door) — a puzzle was solved and opened it, here
    this.onCollect = null;      // (item) — picked something up
    this.onScoreLayer = null;   // (layer) — the level's tune grew
    this.onHurt = null;         // () — a dissonant caught Coda
    this.world = null;          // set by main.js when rooms/world.json exists
    this.score = null;          // the level's tune (src/audio/score.js), from the world
    this.progress = new Progress();   // what Coda carries; see src/core/progress.js
    // Only a game started from the title (new or continue) is saved. Booting the
    // page, free play, the editor and the tests never touch the save.
    this.saving = false;
    this.areaId = null;
    this.freeze = 0;            // seconds of no walking left, while the screen scrolls
    this.hurtUntil = 0;
    this._ctx = new WeakMap();  // room -> its context

    // x, y: the tile Coda stands on (all game logic reads these). rx, ry: where Coda
    // actually is, in tiles, between tiles while walking. See walk() below.
    this.player = { x: 1, y: 1, rx: 1, ry: 1, facing: 'right', dir: DIR.right, walking: false, stride: 0 };
    this.held = [];        // directions held right now, oldest first
    this.lastFrame = 0;

    // Every note that sounds is fed to the note locks — that's how a "play the
    // right melody" puzzle hears the room. A note is heard by the locks of the room
    // it was played in, and by any lock that listens to the whole world (a long
    // phrase that runs through several rooms; see locks.js).
    audio.onNote = (midi, family, opts) => {
      const room = opts?.room ?? this.room;
      if (room === this.room) {
        this.noteHistory.push({ midi, family, t: audio.now });
        if (this.noteHistory.length > 64) this.noteHistory.shift();
      }
      if (!room) return;
      // Note locks listen for melody. Drums and dissonance aren't part of a phrase.
      if (family === 'percussion' || family === 'sour') return;
      for (const r of this.liveRooms()) {
        for (const d of r.list) {
          if (typeof d.hearNote !== 'function') continue;
          if (r === room || d.listen === 'world') d.hearNote(midi, this.ctxFor(r));
        }
      }
    };
  }

  // Waves live in the room they are in (Room.waves). `game.waves` is the current
  // room's, which is all the renderer, the editor and the tests ever wanted.
  get waves() { return this.room?.waves ?? []; }
  set waves(v) { if (this.room) this.room.waves = v; }

  // Every room that is built: the current one, and in a world every room visited.
  liveRooms() {
    const rooms = this.world ? this.world.live() : [];
    if (this.room && !rooms.includes(this.room)) rooms.push(this.room);
    return rooms;
  }

  // A fresh copy of a room, at its spawn point. Takes the PARSED room, not a path.
  // What the player has done there (collected, lifted, placed) is replayed on top;
  // `doors: false` starts the puzzle over (reset), `true` keeps it solved.
  loadRoom(json, { doors = true } = {}) {
    // A fresh start: no wave anywhere is still in the air.
    for (const r of this.liveRooms()) r.waves = [];
    this.freeze = 0;
    const room = new Room(json);
    this.applyProgress(room, { doors });
    this.world?.adopt(room);
    this.enterRoom(room, room.playerStart);
    this.clock.start();
    return this.room;
  }

  applyProgress(room, opts = {}) {
    this.progress.apply(room, { ...opts, create: (spec, x, y) => createDoodad(spec, x, y) });
    if (room.list.some(d => d.typeName === 'door' && d.open && this.progress.opened.has(`${room.id}:${d.x},${d.y}`))) this.solved(room);
  }

  // A room may change once solved: `"solved": { "mood": "content" }` in its file.
  // The Coda's dissonance resolves into a major key when its phrase is played.
  solved(room) {
    const s = room.source.solved;
    if (!s || room.wasSolved) return;
    room.wasSolved = true;
    if (s.mood) room.music.setMood(s.mood);
  }

  // Put the player in an already-built room. The clock keeps running across rooms
  // (setBpm rebases without a jump), so the beat never hiccups at a doorway.
  enterRoom(room, at) {
    this.room = room;
    this.player.x = at.x; this.player.y = at.y;
    this.player.rx = at.x; this.player.ry = at.y;
    this.setFacing(at.facing ?? 'right');
    this.clock.setBpm(this.room.music.bpm);
    this.renderer.resize(this.room);
    this.buildContext();
    this.progress.visited.add(room.id);
    if (this.world?.has(room.id)) {
      this.progress.room = room.id;
      this.progress.at = { x: at.x, y: at.y, facing: this.player.facing };
      this.save();
    }
    const area = this.world?.area(room.id) ?? null;
    if ((area?.id ?? null) !== this.areaId) {
      this.areaId = area?.id ?? null;
      if (area) this.onAreaChange?.(area);
    }
    return this.room;
  }

  // Walked off the edge of the room. If the world has a room that way, go there.
  leaveRoom(dirName) {
    const next = this.world?.neighbour(this.room.id, dirName);
    if (!next) return false;
    const room = this.world.room(next);
    const at = room && arrival(room, this.player.x, this.player.y, dirName, [this.room.width, this.room.height]);
    if (!at) return false;
    this.onBeforeRoomChange?.(dirName);
    this.enterRoom(room, { ...at, facing: dirName });
    this.onRoomChange?.(room);
    return true;
  }

  reload() {
    if (this.room) this.loadRoom(this.room.source, { doors: false });
  }

  // ---- starting, saving, continuing ----------------------------------------

  save() { if (this.saving) this.progress.save(); }

  // A new game: nothing found, every room as authored, at the world's start.
  newGame() {
    this.saving = true;
    this.progress = new Progress();
    this.world?.forgetAll();
    this.unlockLayers('start');
    this.areaId = null;
    const id = this.world?.start;
    const room = id && this.world.room(id);
    if (room) this.enterRoom(room, room.playerStart);
    this.clock.start();
    this.save();
  }

  // Back to a saved game, in the room you were last in.
  continueGame(saved) {
    this.saving = true;
    this.progress = saved;
    this.world?.forgetAll();
    this.areaId = null;
    const room = this.world?.room(saved.room) ?? this.world?.room(this.world.start);
    if (!room) return false;
    const at = saved.at && room.isWalkable(saved.at.x, saved.at.y) ? saved.at : room.playerStart;
    this.enterRoom(room, at);
    this.clock.start();
    return true;
  }

  // Free play: any room from the menu, with every tool, nothing saved.
  freePlay(json) {
    this.saving = false;
    this.progress = new Progress().grantAll();
    this.world?.forgetAll();
    this.areaId = null;
    return this.loadRoom(json);
  }

  // Score layers whose `by` names this trigger: 'start', or a room id whose first
  // door has just opened.
  unlockLayers(by) {
    if (!this.score) return;
    for (const layer of this.score.layers) {
      if (layer.by !== by || this.progress.layers.has(layer.id)) continue;
      this.progress.layers.add(layer.id);
      if (by !== 'start') this.onScoreLayer?.(layer);
    }
  }

  // ---- contexts: what a doodad is handed --------------------------------------
  //
  // One per room, cached. Most of the time only the current room's is used, but a
  // wave that has gone through a door into the next room plays there with that
  // room's context: its scale, its locks, and quieter, since you hear it through
  // the wall.

  buildContext() { this.ctx = this.ctxFor(this.room); }

  ctxFor(room) {
    if (!room) return null;
    if (this._ctx.has(room)) return this._ctx.get(room);
    const game = this;
    const here = () => room === game.room;
    const quiet = (o) => (here() ? o : { ...o, intensity: (o.intensity ?? 1) * THROUGH_WALL });
    const ctx = {
      room,
      get player() { return game.player; },
      get progress() { return game.progress; },
      get here() { return here(); },
      audio: this.audio,
      game,
      // Every sound lands on a sixteenth. Inside a clock event that is the event's
      // own time; anything the player sets off directly (a strike, a key, a door)
      // waits for the next grid line rather than sounding "whenever".
      play: (opts) => this.audio.play({ when: this.soundTime(), room, ...quiet(opts) }),
      playDegree: ({ family = 'keys', degree = 0, octave = 5, intensity = 1 }) =>
        this.audio.play(quiet({
          family, intensity, when: this.soundTime(), room,
          midi: room.music.getNote(degree, octave),
        })),
      nextGridTime: (every = 1) => this.nextGridTime(every),
      get subInterval() { return game.clock.subInterval; },
      get beatInterval() { return game.clock.beatInterval; },
      spawnWave: (x, y, dir, state) => this.spawnWave(x, y, dir, state, room),
      spawnWaveFromDoodad: (d, dir) =>
        this.spawnWave(d.x, d.y, dir, new SoundWaveState({
          source: SOURCE_FOR_FAMILY[d.family] ?? WaveSource.ComposersKey,
        }), room),
      // A wave stepped off this room's edge, through an open door.
      crossEdge: (wave, x, y) => this.crossEdge(wave, room, x, y),
      toast: (msg) => { if (here()) this.toast(msg); },
      onDoorOpened: (door) => this.doorChanged(door, room, true),
      onDoorChanged: (door, open) => { if (!open) this.doorChanged(door, room, false); },
      onRoomComplete: () => this.onRoomComplete?.(),
      collect: (d, item) => this.collect(d, item, room),
      hurt: (by) => { if (here()) this.hurt(by); },
      wavesAt: (x, y) => room.waves.filter(w => w.alive && w.x === x && w.y === y),
    };
    this._ctx.set(room, ctx);
    return ctx;
  }

  // The next grid line at or after now that is a multiple of `every` sixteenths
  // (1 = next sixteenth, 4 = next beat). Never one already simulated.
  nextGridTime(every = 1) {
    let i = this.clock.index + 1;
    while (((i % every) + every) % every) i++;
    return this.clock.timeOf(i);
  }

  soundTime() { return this.scheduledTime || this.nextGridTime(1); }

  toast(msg) {
    this.toasts.push({ msg, t: performance.now() });
    this.onToast?.(msg);
  }

  // ---- doors, remembered and paired ---------------------------------------------
  //
  // A door a puzzle opens stays open in the save. A door in a room's outer wall
  // has a partner in the next room (the world joins them edge to edge), and the
  // two open and shut together, unless the partner is an always-open entry door.
  // That is what makes a shortcut: a door shut on both sides until a lock deep in
  // the dungeon opens it, and then open from the start of the dungeon too.

  doorChanged(door, room, open) {
    if (door.group !== 'entry') this.progress.doorOpened(room.id, door.x, door.y, open);
    const partner = this.partnerDoor(door, room);
    if (partner && partner.door.group !== 'entry' && partner.door.open !== open) {
      partner.door.open = open;
      this.progress.doorOpened(partner.room.id, partner.door.x, partner.door.y, open);
    }
    if (!open) return;
    this.solved(room);
    this.unlockLayers(room.id);
    this.save();
    if (room === this.room) this.onDoorOpen?.(door);
    else this.toast('Somewhere nearby, a door opens.');
  }

  partnerDoor(door, room) {
    if (!this.world) return null;
    const edge = door.y === 0 ? 'up' : door.y === room.height - 1 ? 'down'
      : door.x === 0 ? 'left' : door.x === room.width - 1 ? 'right' : null;
    if (!edge) return null;
    const id = this.world.neighbour(room.id, edge);
    const other = id && this.world.room(id);
    if (!other) return null;
    const m = mirror(other, door.x, door.y, edge);
    const d = other.doodadAt(m.x, m.y);
    return d?.typeName === 'door' ? { room: other, door: d } : null;
  }

  // ---- waves through doors ---------------------------------------------------
  //
  // A wave that leaves through an open door in the outer wall does not stop: it
  // carries on into the next room, arriving on the matching tile of the far
  // edge, which is that room's door. So one shot can play a horn here and a
  // string next door, and light a lock you cannot walk to.

  crossEdge(wave, room, x, y) {
    if (!this.world) return false;
    const dir = x < 0 ? 'left' : x >= room.width ? 'right' : y < 0 ? 'up' : 'down';
    const id = this.world.neighbour(room.id, dir);
    const next = id && this.world.room(id);
    if (!next) return false;
    const m = mirror(next, wave.x, wave.y, dir);
    const w = this.spawnWave(m.x, m.y, wave.dir, wave.state, next);
    w.age = wave.age;
    w.skipIndex = this.clock.index;           // it has had its step for this sixteenth
    const d = next.doodadAt(m.x, m.y);
    if (d) d.receiveWave(w, this.ctxFor(next));
    return true;
  }

  // ---- player -------------------------------------------------------------

  setFacing(name) {
    this.player.facing = name;
    this.player.dir = DIR[name] ?? DIR.right;
  }

  // The tile Coda faces.
  get front() { return { x: this.player.x + this.player.dir.x, y: this.player.y + this.player.dir.y }; }

  // One tile, instantly. Used by the editor, the tests and the recorded solutions;
  // the player walks with setHeld/walk instead.
  move(dirName) {
    const d = DIR[dirName];
    if (!d) return;
    this.setFacing(dirName);
    const nx = this.player.x + d.x;
    const ny = this.player.y + d.y;
    // Off the edge: only possible through an opening in the outer wall, which in
    // practice means an open door. That is how you leave a room.
    if (!this.room.inBounds(nx, ny)) { this.leaveRoom(dirName); return; }
    // canEnter, not isWalkable — per-face blocking (IPlayerFaceInteractable) means
    // a tile can be enterable from one side and solid from another.
    if (!this.room.canEnter(nx, ny, d)) return;
    this.player.x = nx; this.player.y = ny;
    this.player.rx = nx; this.player.ry = ny;
    const t = this.room.doodadAt(nx, ny);
    if (t) t.onPlayerEnter(this.ctx, d);
  }

  // How many of the Key's own waves may sound at once: what the room says, if it
  // says (free-play rooms, and any room that caps you on purpose), else one plus
  // an Overtone for each found.
  get waveAllowance() { return this.room?.maxWaves ?? this.progress.waves; }

  // The Key's own waves, in every room. Waves an instrument makes (a horn blown
  // with B, a mallet, a reed breathing) are the room's, not yours, and do not count.
  get keyWaves() {
    let n = 0;
    for (const r of this.liveRooms()) for (const w of r.waves) if (w.alive && w.state.source === WaveSource.ComposersKey) n++;
    return n;
  }

  // A button — fire a sound wave from the Composer's Key.
  fire() {
    const max = this.waveAllowance;
    if (this.keyWaves >= max) {
      this.toast(max === 1 ? 'One wave at a time. Find an Overtone to sound more.' : `Wave limit (${max}): wait for one to resolve.`);
      return;
    }
    const st = SoundWaveState.default;
    st.pitch = this.room.music.getNote(0, 4);
    this.spawnWave(this.player.x, this.player.y, this.player.dir, st);
    // Quantised: the shot sounds on the next sixteenth, which is exactly when the
    // wave reaches its first tile. Up to one sixteenth of delay, in exchange for
    // every shot being in time.
    this.audio.play({
      family: 'woodwind', midi: st.pitch, intensity: 0.35,
      when: this.nextGridTime(1), room: this.room,
    });
  }

  // B button. Same priority order as PlayerController: IPlayerInteractable first,
  // then the melee strike — Asta.StrikeAt spawns a wave on the target tile tagged
  // WaveSource.MeleeStrike, offers it to the instrument and destroys it. The wave
  // never travels; instruments opt in by handling that source.
  interact() {
    const tx = this.player.x + this.player.dir.x;
    const ty = this.player.y + this.player.dir.y;

    const d = this.room.doodadAt(tx, ty);
    if (d && d.onPlayerInteract(this.ctx)) return;
    if (d && this.strikeAt(d, this.player.dir)) return;

    const under = this.room.doodadAt(this.player.x, this.player.y);
    if (under && under.onPlayerInteract(this.ctx)) return;
    if (under) this.strikeAt(under, this.player.dir);
  }

  // Asta.StrikeAt. Returns whether the instrument took the strike.
  strikeAt(doodad, dir) {
    const st = new SoundWaveState({ source: WaveSource.MeleeStrike });
    st.pitch = this.room.music.getNote(0, 4);
    const wave = new SoundWave(doodad.x, doodad.y, dir, st);
    const took = doodad.onMeleeStrike(wave, this.ctx) !== false;
    wave.destroy();   // silently — no travel, no destroy event
    return took;
  }

  spawnWave(x, y, dir, state = SoundWaveState.default, room = this.room) {
    const w = new SoundWave(x, y, dir, state);
    w.bornAt = this.clock.ctx.currentTime;   // for drawing only; see render/motion.js
    room.waves.push(w);
    return w;
  }

  // ---- things found ----------------------------------------------------------

  // A pickup was walked over. Overtones raise the wave allowance; the burin lets
  // Coda lift instruments. Either way the tile is empty for good.
  collect(d, item, room = this.room) {
    this.progress.give(item);
    this.progress.emptied(room.id, d.x, d.y);
    room.setDoodad(d.x, d.y, null);
    const t0 = this.nextGridTime(2), step = this.clock.subInterval * 2;
    [0, 2, 4, 7].forEach((deg, i) => this.audio.play({
      family: 'keys', midi: room.music.getNote(deg, 5), intensity: 0.6, when: t0 + i * step, heard: false,
    }));
    this.save();
    this.onCollect?.(item);
  }

  // ---- the satchel: lift and place, with the burin ------------------------------
  //
  // L shoulder. Facing an instrument that can be carried (drums, the reed) it goes
  // into the satchel; facing empty floor it comes out again, in front of you. A
  // burin is an engraver's tool, the one that cut music into printing plates: with
  // it, Coda can cut an instrument free of the floor and set it down elsewhere.

  shoulderL() {
    const { x, y } = this.front;
    const d = this.room.doodadAt(x, y);
    if (d) return this.lift(d);
    return this.place();
  }

  lift(d) {
    if (!d?.portable) { this.toast(d ? 'That is fixed to the floor.' : 'Nothing to lift.'); return false; }
    if (!this.progress.has('burin')) { this.toast('It will not budge. Something could cut it free.'); return false; }
    const spec = { ...d.toJSON(), rot: d.rot };
    delete spec.x; delete spec.y;
    this.room.setDoodad(d.x, d.y, null);
    this.progress.emptied(this.room.id, d.x, d.y);
    this.progress.carry({ spec, name: d.carryName ?? d.typeName });
    this.ctx.play({ family: 'keys', midi: this.room.music.getNote(4, 5), intensity: 0.4, heard: false });
    this.toast(`Lifted the ${d.carryName ?? d.typeName}.`);
    this.save();
    return true;
  }

  place() {
    const held = this.progress.held;
    if (!held) { this.toast(this.progress.has('burin') ? 'The satchel is empty.' : 'Nothing to lift.'); return false; }
    const { x, y } = this.front;
    const r = this.room;
    // Never into the outer wall (doors live there), onto a wave, or onto anything.
    const inside = x > 0 && y > 0 && x < r.width - 1 && y < r.height - 1;
    if (!inside || r.doodadAt(x, y) || r.waves.some(w => w.alive && w.x === x && w.y === y)) {
      this.toast('No room to set it down there.');
      return false;
    }
    const d = createDoodad(held.spec, x, y);
    if (!d) return false;
    r.setDoodad(x, y, d);
    this.progress.takeOut();
    this.progress.put(r.id, x, y, held.spec);
    this.ctx.play({ family: 'keys', midi: r.music.getNote(0, 5), intensity: 0.4, heard: false });
    this.toast(`Set down the ${held.name}.`);
    this.save();
    return true;
  }

  // R shoulder: turn the instrument in your hand, so it goes down facing a new way.
  // Drums turn in their eighth-turns, everything else in quarters.
  shoulderR() {
    const held = this.progress.held;
    if (!held) return false;
    const step = held.spec.type === 'drum' && ['bass', 'tom', 'snare'].includes(held.spec.part) ? 45 : 90;
    held.spec.rot = (((held.spec.rot ?? 0) + step) % 360 + 360) % 360;
    this.toast(`${held.name} turned to ${held.spec.rot}°.`);
    this.save();
    return true;
  }

  // ---- dissonants ------------------------------------------------------------------

  // A dissonant reached Coda: a sour sting and a shove away from it. No health, no
  // death; it costs you position and time, which in a timing puzzle is plenty.
  hurt(by) {
    const now = performance.now();
    if (now < this.hurtUntil) return;
    this.hurtUntil = now + 900;
    const pl = this.player;
    let dx = pl.rx - by.x, dy = pl.ry - by.y;
    if (!dx && !dy) { dx = -pl.dir.x; dy = -pl.dir.y; }
    const horizontal = Math.abs(dx) >= Math.abs(dy);
    const push = horizontal ? (dx < 0 ? -1 : 1) : (dy < 0 ? -1 : 1);
    for (let i = 0; i < 12; i++) {
      if (horizontal) this.slide(push * 0.125, 0, true); else this.slide(0, push * 0.125, true);
    }
    this.audio.play({ family: 'sour', midi: this.room.music.getNote(1, 4), intensity: 0.7, when: this.nextGridTime(1), heard: false });
    this.onHurt?.();
  }

  // ---- walking, after A Link to the Past ---------------------------------
  //
  // Coda moves freely while a direction is held, not tile by tile. The numbers are
  // Link's: he walks about 1.5 px a frame at 60 fps on 16 px tiles, which is
  // 5.6 tiles a second, and he is a little narrower than a tile so he fits through
  // a one-tile gap. Three things give it the feel:
  //
  // - Facing is sticky. Holding two directions (a diagonal) keeps the way you were
  //   already facing, as Link does; you only turn when that direction is let go.
  // - Corner nudging. Walk into the edge of a gap and you are slid sideways into it
  //   instead of stopping dead, so doorways do not need pixel-perfect lining up.
  // - The tile you stand on is simply the one under your centre. Crossing into a
  //   new one triggers it (a string plucks, a key plays, stairs shift the key).

  setHeld(dir, on) {
    this.held = this.held.filter(d => d !== dir);
    if (on) this.held.push(dir);
    // A press turns you to face it at once, even standing still, unless you are
    // already holding the way you face: then it is a diagonal and you keep facing.
    if (on && !this.held.slice(0, -1).includes(this.player.facing)) this.setFacing(dir);
    if (!on && !this.held.includes(this.player.facing) && this.held.length) {
      this.setFacing(this.held[this.held.length - 1]);
    }
  }

  walk(dt) {
    const pl = this.player;
    // Game time, not the wall clock, so a test stepping time by hand sees the same.
    if (this.freeze > 0) { this.freeze = Math.max(0, this.freeze - dt); pl.walking = false; return; }
    const h = new Set(this.held);
    let vx = (h.has('right') ? 1 : 0) - (h.has('left') ? 1 : 0);
    let vy = (h.has('down') ? 1 : 0) - (h.has('up') ? 1 : 0);
    pl.walking = !!(vx || vy);
    if (!pl.walking) return;
    if (vx && vy) { vx *= Math.SQRT1_2; vy *= Math.SQRT1_2; }
    const step = WALK_SPEED * dt;
    const room = this.room;
    if (vx) this.slide(vx * step, 0);
    if (vy && this.room === room) this.slide(0, vy * step);
    pl.stride += step;
  }

  // Tiles Coda's body overlaps at (rx, ry). His centre is (rx + 0.5, ry + 0.5).
  bodyTiles(rx, ry) {
    const out = [];
    const x0 = Math.floor(rx + 0.5 - BODY), x1 = Math.floor(rx + 0.5 + BODY - 1e-6);
    const y0 = Math.floor(ry + 0.5 - BODY), y1 = Math.floor(ry + 0.5 + BODY - 1e-6);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push([x, y]);
    return out;
  }

  // Can Coda's body move into this tile, travelling `dirName`? Off the edge of the
  // room counts as open only when the world has a room that way and its matching
  // door is open: a door shut on the far side cannot be walked through from this one.
  blocks(x, y, dirName) {
    if (!this.room.inBounds(x, y)) {
      const id = this.world?.neighbour(this.room.id, dirName);
      if (!id) return true;
      const next = this.world.room(id);
      if (!next) return true;
      if (next.width !== this.room.width || next.height !== this.room.height) return false;
      const m = mirror(next, x, y, dirName);
      return !next.isWalkable(m.x, m.y);
    }
    return !this.room.canEnter(x, y, DIR[dirName]);
  }

  // `shove`: pushed by something rather than walking, so it never leaves the room.
  slide(dx, dy, shove = false) {
    const pl = this.player;
    const dirName = dx > 0 ? 'right' : dx < 0 ? 'left' : dy > 0 ? 'down' : 'up';
    const before = new Set(this.bodyTiles(pl.rx, pl.ry).map(t => t.join()));
    const nx = pl.rx + dx, ny = pl.ry + dy;
    const stop = (x, y) => (shove && !this.room.inBounds(x, y)) || this.blocks(x, y, dirName);
    // Only tiles the body is newly entering can stop it, so a door shutting on you
    // never traps you inside it.
    const hit = this.bodyTiles(nx, ny).some(([x, y]) => !before.has(`${x},${y}`) && stop(x, y));
    if (!hit) {
      pl.rx = nx; pl.ry = ny;
    } else if (!shove) {
      // Corner nudge: if the lane your centre is in is open ahead, ease toward it.
      const along = Math.abs(dx || dy);
      if (dx) {
        const lane = Math.round(pl.ry), ahead = Math.floor(pl.rx + 0.5 + Math.sign(dx) * (BODY + along));
        if (lane !== pl.ry && !this.blocks(ahead, lane, dirName)) pl.ry += Math.sign(lane - pl.ry) * Math.min(along, Math.abs(lane - pl.ry));
      } else {
        const lane = Math.round(pl.rx), ahead = Math.floor(pl.ry + 0.5 + Math.sign(dy) * (BODY + along));
        if (lane !== pl.rx && !this.blocks(lane, ahead, dirName)) pl.rx += Math.sign(lane - pl.rx) * Math.min(along, Math.abs(lane - pl.rx));
      }
    }
    this.settleTile(dirName);
  }

  // Which tile Coda is on is decided by his centre. Leaving the room through an
  // open door happens when the centre crosses the edge.
  settleTile(dirName) {
    const pl = this.player;
    const tx = Math.floor(pl.rx + 0.5), ty = Math.floor(pl.ry + 0.5);
    if (!this.room.inBounds(tx, ty)) {
      const from = { x: pl.x, y: pl.y };
      if (this.leaveRoom(dirName)) return;
      pl.rx = from.x; pl.ry = from.y;   // no room that way after all: stay put
      return;
    }
    if (tx === pl.x && ty === pl.y) return;
    pl.x = tx; pl.y = ty;
    this.room.doodadAt(tx, ty)?.onPlayerEnter(this.ctx, DIR[dirName]);
  }

  // ---- loop ---------------------------------------------------------------

  update() {
    if (!this.room) return;
    const now = performance.now();
    const dt = this.lastFrame ? Math.min(0.05, (now - this.lastFrame) / 1000) : 0;
    this.lastFrame = now;
    this.walk(dt);
    this.clock.setBpm(this.room.music.bpm);

    for (const ev of this.clock.poll()) {
      this.scheduledTime = ev.time;
      if (ev.isBeat) {
        this.lastBeat = ev.beat;
        if (this.metronome) this.audio.click(ev.time, ev.beat % this.room.music.timeSignature === 0);
        // A copy: a dissonant moves itself on the beat, which edits the list.
        for (const d of [...this.room.list]) { d.onBeat(ev.beat, this.ctx); d.tickHold(ev.beat, this.ctx); }
      }
      this.score?.tick(ev, this);
      this.stepWaves(ev);
    }
    this.scheduledTime = 0;
  }

  // One sixteenth for every wave, in every room that has any. Rooms you are not in
  // still play: a wave you sent through a door keeps going after you leave.
  stepWaves(ev) {
    for (const room of this.liveRooms()) {
      const ctx = this.ctxFor(room);
      // Away from Coda a room only needs the beat for what is in motion: a held
      // wave, a reed still breathing, a chord fork still ringing.
      if (room !== this.room && ev.isBeat) {
        for (const d of [...room.list]) {
          if (d.awake) d.onBeat(ev.beat, ctx);
          if (d.holding) d.tickHold(ev.beat, ctx);
        }
      }
      if (!room.waves.length) continue;
      for (const w of room.waves) if (w.skipIndex !== ev.index) w.step(ctx);
      room.waves = room.waves.filter(w => w.alive);
    }
  }

  get activeWaves() { return this.keyWaves; }

  // Which way a direction vector points, by name. Handy for the console.
  static dirName(d) { return dirName(d); }
}
