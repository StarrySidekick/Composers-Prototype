import { BeatClock } from './core/beat-clock.js';
import { SoundWave, SoundWaveState, WaveSource, SOURCE_FOR_FAMILY } from './core/sound-wave.js';
import { Room, facingDir } from './core/room.js';
import { DIR } from './core/direction.js';
import { arrival } from './core/world.js';

const WALK_SPEED = 5.6;   // tiles a second: Link's 1.5 px a frame, 60 fps, 16 px tiles
const BODY = 0.34;        // half of Coda's footprint, in tiles: fits a one-tile gap
import './doodads/index.js';

export class Game {
  constructor(audio, renderer) {
    this.audio = audio;
    this.renderer = renderer;
    this.clock = new BeatClock(audio.ctx);
    this.waves = [];
    this.lastBeat = 0;
    this.metronome = false;
    this.toasts = [];
    this.noteHistory = [];
    this.onToast = null;
    this.onRoomComplete = null;
    this.onRoomChange = null;   // (room) — the world moved you somewhere new
    this.onDoorOpen = null;     // (door) — a puzzle was solved and opened it
    this.world = null;          // set by main.js when rooms/world.json exists

    // x, y: the tile Coda stands on (all game logic reads these). rx, ry: where Coda
    // actually is, in tiles, between tiles while walking. See walk() below.
    this.player = { x: 1, y: 1, rx: 1, ry: 1, facing: 'right', dir: DIR.right, walking: false, stride: 0 };
    this.held = [];        // directions held right now, oldest first
    this.lastFrame = 0;

    // Every note that sounds is fed to the note locks — that's how a "play the
    // right melody" puzzle hears the room.
    audio.onNote = (midi, family) => {
      this.noteHistory.push({ midi, family, t: audio.now });
      if (this.noteHistory.length > 64) this.noteHistory.shift();
      if (!this.room) return;
      // Note locks listen for melody. Drums and dissonance aren't part of a phrase.
      if (family === 'percussion' || family === 'sour') return;
      for (const d of this.room.list) {
        if (typeof d.hearNote === 'function') d.hearNote(midi, this.ctx);
      }
    };
  }

  // A fresh copy of a room, at its spawn point. Takes the PARSED room, not a path.
  loadRoom(json) {
    const room = new Room(json);
    this.world?.adopt(room);
    this.enterRoom(room, room.playerStart);
    this.clock.start();
    return this.room;
  }

  // Put the player in an already-built room. The clock keeps running across rooms
  // (setBpm rebases without a jump), so the beat never hiccups at a doorway.
  enterRoom(room, at) {
    this.room = room;
    this.waves = [];
    this.player.x = at.x; this.player.y = at.y;
    this.player.rx = at.x; this.player.ry = at.y;
    this.setFacing(at.facing ?? 'right');
    this.clock.setBpm(this.room.music.bpm);
    this.renderer.resize(this.room);
    this.buildContext();
    return this.room;
  }

  // Walked off the edge of the room. If the world has a room that way, go there.
  leaveRoom(dirName) {
    const next = this.world?.neighbour(this.room.id, dirName);
    if (!next) return false;
    const room = this.world.room(next);
    const at = room && arrival(room, this.player.x, this.player.y, dirName);
    if (!at) return false;
    this.enterRoom(room, { ...at, facing: dirName });
    this.onRoomChange?.(room);
    return true;
  }

  reload() {
    if (this.room) this.loadRoom(this.room.source);
  }

  buildContext() {
    const game = this;
    this.ctx = {
      get room() { return game.room; },
      get player() { return game.player; },
      audio: this.audio,
      game,
      // Every sound lands on a sixteenth. Inside a clock event that is the event's
      // own time; anything the player sets off directly (a strike, a key, a door)
      // waits for the next grid line rather than sounding "whenever".
      play: (opts) => this.audio.play({ when: this.soundTime(), ...opts }),
      playDegree: ({ family = 'keys', degree = 0, octave = 5, intensity = 1 }) =>
        this.audio.play({
          family, intensity, when: this.soundTime(),
          midi: this.room.music.getNote(degree, octave),
        }),
      nextGridTime: (every = 1) => this.nextGridTime(every),
      get subInterval() { return game.clock.subInterval; },
      spawnWave: (x, y, dir, state) => this.spawnWave(x, y, dir, state),
      spawnWaveFromDoodad: (d, dir) =>
        this.spawnWave(d.x, d.y, dir, new SoundWaveState({
          source: SOURCE_FOR_FAMILY[d.family] ?? WaveSource.ComposersKey,
        })),
      toast: (msg) => this.toast(msg),
      onDoorOpened: (door) => this.onDoorOpen?.(door),
      onRoomComplete: () => this.onRoomComplete?.(),
    };
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

  // ---- player -------------------------------------------------------------

  setFacing(name) {
    this.player.facing = name;
    this.player.dir = DIR[name] ?? DIR.right;
  }

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

  // A button — fire a sound wave from the Composer's Key.
  fire() {
    const live = this.waves.filter(w => w.alive).length;
    if (live >= this.room.maxWaves) {
      this.toast(`Wave limit (${this.room.maxWaves}) — wait for it to resolve.`);
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
      when: this.nextGridTime(1),
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

  spawnWave(x, y, dir, state = SoundWaveState.default) {
    const w = new SoundWave(x, y, dir, state);
    w.bornAt = this.clock.ctx.currentTime;   // for drawing only; see render/motion.js
    this.waves.push(w);
    return w;
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
    const h = new Set(this.held);
    let vx = (h.has('right') ? 1 : 0) - (h.has('left') ? 1 : 0);
    let vy = (h.has('down') ? 1 : 0) - (h.has('up') ? 1 : 0);
    pl.walking = !!(vx || vy);
    if (!pl.walking) return;
    if (vx && vy) { vx *= Math.SQRT1_2; vy *= Math.SQRT1_2; }
    const step = WALK_SPEED * dt;
    if (vx) this.slide(vx * step, 0);
    if (vy && this.room) this.slide(0, vy * step);
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
  // room counts as open only when the world has a room that way.
  blocks(x, y, dirName) {
    if (!this.room.inBounds(x, y)) return !this.world?.neighbour(this.room.id, dirName);
    return !this.room.canEnter(x, y, DIR[dirName]);
  }

  slide(dx, dy) {
    const pl = this.player;
    const dirName = dx > 0 ? 'right' : dx < 0 ? 'left' : dy > 0 ? 'down' : 'up';
    const before = new Set(this.bodyTiles(pl.rx, pl.ry).map(t => t.join()));
    const nx = pl.rx + dx, ny = pl.ry + dy;
    // Only tiles the body is newly entering can stop it, so a door shutting on you
    // never traps you inside it.
    const hit = this.bodyTiles(nx, ny).some(([x, y]) => !before.has(`${x},${y}`) && this.blocks(x, y, dirName));
    if (!hit) {
      pl.rx = nx; pl.ry = ny;
    } else {
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
        for (const d of this.room.list) { d.onBeat(ev.beat, this.ctx); d.tickHold(ev.beat, this.ctx); }
      }
      for (const w of this.waves) w.step(this.ctx);
      this.waves = this.waves.filter(w => w.alive);
    }
    this.scheduledTime = 0;
  }

  get activeWaves() { return this.waves.filter(w => w.alive).length; }
}
