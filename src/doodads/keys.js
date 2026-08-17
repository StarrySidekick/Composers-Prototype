// Keys & mallets. Piano keys are WALKED ON, not struck by waves — they drive
// mallets remotely, and mallets are what actually make a sound or launch a wave.
// GDD §6.3, "Keys & Mallets".

import { Doodad, defineDoodad } from '../core/doodad.js';
import { DIR, rotate } from '../core/direction.js';
import { PALETTE } from '../render/palette.js';

class PianoKey extends Doodad {
  constructor(spec, x, y) {
    super(spec, x, y);
    this.family = 'keys';
    this.solid = false;
    this.blocksWave = false;
    this.walkable = true;
    this.degree = spec.degree ?? 0;
    this.octave = spec.octave ?? 5;
    this.press = 0;
  }

  onWaveEntered(wave, ctx) { wave.pass(); } // waves ride over keys, they don't press them

  press_(ctx, intensity = 1) {
    this.press = 1;
    ctx.play({
      family: 'keys',
      midi: ctx.room.music.getNote(this.degree, this.octave),
      intensity,
    });
    // Drive every mallet wired to the same group.
    if (this.group) {
      for (const d of ctx.room.ofGroup(this.group)) {
        if (d !== this && typeof d.trigger === 'function') d.trigger(ctx);
      }
    }
  }

  onPlayerEnter(ctx) { this.press_(ctx, 0.9); }
  onPlayerInteract(ctx) { this.press_(ctx, 1); return true; }

  draw(c, s, ctx) {
    const p = PALETTE.wing('keys');
    const d = this.press * s * 0.06;
    c.fillStyle = this.press > 0.05 ? p.hot : p.key;
    c.fillRect(s * 0.12, s * 0.1 + d, s * 0.76, s * 0.8);
    c.strokeStyle = p.metal;
    c.lineWidth = 1.5;
    c.strokeRect(s * 0.12, s * 0.1 + d, s * 0.76, s * 0.8);
    c.fillStyle = p.ink;
    c.font = `${Math.round(s * 0.26)}px ui-monospace, monospace`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(String(this.degree + 1), s * 0.5, s * 0.52 + d);
    this.press *= 0.86;
  }
}
defineDoodad('pianokey', PianoKey);

// A mallet fires a wave when its group is triggered — the remote arm of a piano key.
class Mallet extends Doodad {
  constructor(spec, x, y) {
    super(spec, x, y);
    this.family = 'keys';
    this.solid = true;
    this.blocksWave = true;
    this.swing = 0;
  }

  get dir() { return rotate(DIR.right, this.rot); }

  trigger(ctx) {
    this.swing = 1;
    ctx.spawnWaveFromDoodad(this, this.dir);
    ctx.play({ family: 'percussion', midi: 76, intensity: 0.35, modulation: 1 });
  }

  onWaveEntered(wave, ctx) { wave.destroy(); }
  onPlayerInteract(ctx) { this.trigger(ctx); return true; }

  draw(c, s, ctx) {
    const p = PALETTE.wing('keys');
    c.save();
    c.translate(s / 2, s / 2);
    c.rotate((this.rot * Math.PI) / 180 + this.swing * 0.5);
    c.strokeStyle = p.wood;
    c.lineWidth = Math.max(2, s * 0.09);
    c.beginPath();
    c.moveTo(-s * 0.28, 0); c.lineTo(s * 0.18, 0);
    c.stroke();
    c.beginPath();
    c.arc(s * 0.26, 0, s * 0.13, 0, Math.PI * 2);
    c.fillStyle = this.swing > 0.05 ? p.hot : p.metalHi;
    c.fill();
    c.restore();
    this.swing *= 0.82;
  }
}
defineDoodad('mallet', Mallet);
