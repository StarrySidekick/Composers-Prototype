// The metronome. The level's tune (src/audio/score.js) does not play until it is
// wound: press B on it and the motif starts on the next beat, press B again and the
// tune stops where it is and waits, to carry on from there when it is started
// again. It ticks while it runs, a click on every beat, the downbeat louder, and
// its arm swings from side to side in time.
//
// Whether it is running is the save's (progress.metronome), not the tile's, so
// it is one metronome for the whole world: stop it here and the tune stops in
// every room. It is also a lock: the first time it starts it opens its group's
// doors (latch them, or stopping it shuts them again).

import { Doodad, defineDoodad } from '../core/doodad.js';
import { checkGroup } from './locks.js';

class Metronome extends Doodad {
  constructor(spec, x, y) {
    super(spec, x, y);
    this.family = 'puzzle';
    this.isLock = true;
    this.solid = true;
    this.blocksWave = true;
    this.group = spec.group ?? 'a';
    this.lit = false;        // running; synced from the save on every beat
    this.swing = 0;          // which way the arm is out: 0 left, 1 right
  }

  get spriteKey() { return this.lit ? (this.swing ? 'metronome.right' : 'metronome.left') : 'metronome'; }
  get spriteRot() { return 0; }

  set(on, ctx) {
    if (ctx.progress) ctx.progress.metronome = on;
    this.lit = on;
    checkGroup(this.group, ctx);
  }

  onPlayerInteract(ctx) {
    const on = !ctx.progress?.metronome;
    this.set(on, ctx);
    ctx.audio.click(ctx.nextGridTime(1), true);
    ctx.toast(on ? 'The metronome is going. The tune begins on the beat.' : 'The metronome stops. The tune waits where it is.');
    ctx.game?.save?.();
    return true;
  }

  // Waves do not wind it; they stop here.
  onWaveEntered(wave) { wave.destroy(); }

  onBeat(beat, ctx) {
    const on = !!ctx.progress?.metronome;
    if (on !== this.lit) { this.lit = on; checkGroup(this.group, ctx); }
    if (!on) return;
    this.swing = beat % 2;
    ctx.audio.click(ctx.game?.scheduledTime || ctx.nextGridTime(1), beat % (ctx.room.music.timeSignature || 4) === 0);
  }

  draw(c, s) {
    c.strokeStyle = '#fff';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(s * 0.32, s * 0.9); c.lineTo(s * 0.42, s * 0.12); c.lineTo(s * 0.58, s * 0.12); c.lineTo(s * 0.68, s * 0.9); c.closePath();
    c.stroke();
    const a = this.lit ? (this.swing ? 0.45 : -0.45) : 0;
    c.beginPath();
    c.moveTo(s * 0.5, s * 0.8);
    c.lineTo(s * 0.5 + Math.sin(a) * s * 0.55, s * 0.8 - Math.cos(a) * s * 0.55);
    c.stroke();
  }
}
defineDoodad('metronome', Metronome);
