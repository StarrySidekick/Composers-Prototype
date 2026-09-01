// The sound wave — a discrete, beat-stepped entity carrying a small state struct.
// NOT a physics object. Mirrors SoundWave.cs + SoundWaveState.cs.

// Mirrors WaveSource.cs. MeleeStrike is the important one: Asta.StrikeAt spawns a
// wave on the struck tile, offers it to the instrument and destroys it immediately,
// so it never travels. Instruments opt in or out by checking for it.
export const WaveSource = Object.freeze({
  ComposersKey: 'composersKey',
  MeleeStrike:  'meleeStrike',
  Horn:         'horn',
  Woodwind:     'woodwind',
  String:       'string',
  Drum:         'drum',
  Mallet:       'mallet',
  // Harness-only: the brass tee divides a wave and this tags the new branch.
  Split:        'split',
});

// Which source a doodad's own emissions carry, by family.
export const SOURCE_FOR_FAMILY = Object.freeze({
  brass: WaveSource.Horn,
  woodwind: WaveSource.Woodwind,
  strings: WaveSource.String,
  percussion: WaveSource.Drum,
  keys: WaveSource.Mallet,
});

export class SoundWaveState {
  constructor({ pitch = 60, intensity = 1, modulation = 0, source = WaveSource.ComposersKey } = {}) {
    this.pitch = pitch;             // MIDI note. Instruments overwrite from their own tuning.
    this.intensity = intensity;     // 0-1, drives volume
    this.modulation = modulation;   // 0-1, timbre blend
    this.source = source;
    this.tilesTraversed = 0;
  }

  clone() {
    const s = new SoundWaveState(this);
    s.tilesTraversed = this.tilesTraversed;
    return s;
  }

  static get default() { return new SoundWaveState(); }
}

let nextId = 1;

export class SoundWave {
  constructor(x, y, dir, state = SoundWaveState.default) {
    this.id = nextId++;
    this.x = x; this.y = y;
    this.prevX = x; this.prevY = y;
    this.dir = { ...dir };
    this.state = state;
    this.alive = true;
    this.age = 0;
    // Set while an instrument is holding this wave (InstrumentBase.holdBeats).
    this.held = false;
  }

  // Called by doodads from onWaveEntered.
  reflect(newDir) { this.dir = { ...newDir }; }
  pass() { /* continue unchanged — here for parity with the Unity call sites */ }
  destroy() { this.alive = false; }
  applyState(s) { this.state = s; }

  // Advance one tile. `ctx` is the room context handed to doodads.
  step(ctx) {
    if (!this.alive || this.held) return;
    this.prevX = this.x; this.prevY = this.y;
    this.age++;

    const nx = this.x + this.dir.x;
    const ny = this.y + this.dir.y;

    if (!ctx.room.inBounds(nx, ny)) { this.destroy(); return; }

    this.x = nx; this.y = ny;
    this.state.tilesTraversed++;

    const d = ctx.room.doodadAt(nx, ny);
    // receiveWave, not onWaveEntered — the base class runs the hold and
    // melee-strike routing first, exactly as InstrumentBase.OnWaveEntered does
    // before it hands off to ApplyWaveInteraction.
    if (d) d.receiveWave(this, ctx);

    // Safety net for authoring mistakes — a wave that loops forever in a closed
    // tube circuit would otherwise pin the audio engine.
    if (this.age > 512) this.destroy();
  }
}
