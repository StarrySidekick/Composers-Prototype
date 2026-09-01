import { BeatClock } from './core/beat-clock.js';
import { SoundWave, SoundWaveState, WaveSource, SOURCE_FOR_FAMILY } from './core/sound-wave.js';
import { Room, facingDir } from './core/room.js';
import { DIR } from './core/direction.js';
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

    this.player = { x: 1, y: 1, rx: 1, ry: 1, facing: 'right', dir: DIR.right };

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

  loadRoom(json) {
    this.room = new Room(json);
    this.waves = [];
    const st = this.room.playerStart;
    this.player.x = st.x; this.player.y = st.y;
    this.player.rx = st.x; this.player.ry = st.y;
    this.setFacing(st.facing ?? 'right');
    this.clock.setBpm(this.room.music.bpm);
    this.clock.start();
    this.renderer.resize(this.room);
    this.buildContext();
    return this.room;
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
      play: (opts) => this.audio.play({ when: this.scheduledTime, ...opts }),
      playDegree: ({ family = 'keys', degree = 0, octave = 5, intensity = 1 }) =>
        this.audio.play({
          family, intensity, when: this.scheduledTime,
          midi: this.room.music.getNote(degree, octave),
        }),
      spawnWave: (x, y, dir, state) => this.spawnWave(x, y, dir, state),
      spawnWaveFromDoodad: (d, dir) =>
        this.spawnWave(d.x, d.y, dir, new SoundWaveState({
          source: SOURCE_FOR_FAMILY[d.family] ?? WaveSource.ComposersKey,
        })),
      toast: (msg) => this.toast(msg),
      onRoomComplete: () => this.onRoomComplete?.(),
    };
  }

  toast(msg) {
    this.toasts.push({ msg, t: performance.now() });
    this.onToast?.(msg);
  }

  // ---- player -------------------------------------------------------------

  setFacing(name) {
    this.player.facing = name;
    this.player.dir = DIR[name] ?? DIR.right;
  }

  move(dirName) {
    const d = DIR[dirName];
    if (!d) return;
    this.setFacing(dirName);
    const nx = this.player.x + d.x;
    const ny = this.player.y + d.y;
    // canEnter, not isWalkable — per-face blocking (IPlayerFaceInteractable) means
    // a tile can be enterable from one side and solid from another.
    if (!this.room.canEnter(nx, ny, d)) return;
    this.player.x = nx; this.player.y = ny;
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
    this.audio.play({
      family: 'woodwind', midi: st.pitch, intensity: 0.35,
      when: this.scheduledTime,
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
    this.waves.push(w);
    return w;
  }

  // ---- loop ---------------------------------------------------------------

  update() {
    if (!this.room) return;
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

    // smooth the player sprite toward its tile
    const k = 0.32;
    this.player.rx += (this.player.x - this.player.rx) * k;
    this.player.ry += (this.player.y - this.player.ry) * k;
  }

  get activeWaves() { return this.waves.filter(w => w.alive).length; }
}
