// Drums — bouncy surfaces that redirect waves in open air. Port target: Drum.cs.
// Face interactions are configured in the drum's LOCAL space, so rotating the drum
// changes which world directions map to which face.

import { Doodad, defineDoodad } from '../core/doodad.js';
import { FaceAction, rotateCW, rotateCCW, reverse } from '../core/direction.js';
import { PALETTE } from '../render/palette.js';

const PARTS = {
  // Snare reflects the wave straight back at you.
  snare: {
    faces: { top: FaceAction.Reflect180, bottom: FaceAction.Reflect180,
             left: FaceAction.Reflect180, right: FaceAction.Reflect180 },
    drumType: 0.5, degree: 3, octave: 4, solid: true,
  },
  // Bass drum kicks the wave 90°.
  bass: {
    faces: { top: FaceAction.Redirect90CW, bottom: FaceAction.Redirect90CW,
             left: FaceAction.Redirect90CW, right: FaceAction.Redirect90CW },
    drumType: 0, degree: 0, octave: 2, solid: true,
  },
  // Hat passes the wave through but ticks — a metronome you can route through.
  hat: {
    faces: { top: FaceAction.PassThrough, bottom: FaceAction.PassThrough,
             left: FaceAction.PassThrough, right: FaceAction.PassThrough },
    drumType: 1, degree: 6, octave: 5, solid: false,
  },
};

class Drum extends Doodad {
  constructor(spec, x, y) {
    super(spec, x, y);
    this.family = 'percussion';
    this.part = spec.part ?? 'snare';
    const preset = PARTS[this.part] ?? PARTS.snare;
    this.faces = { ...preset.faces, ...(spec.faces ?? {}) };
    this.drumType = spec.drumType ?? preset.drumType;
    this.degree = spec.degree ?? preset.degree;
    this.octave = spec.octave ?? preset.octave;
    this.solid = spec.solid ?? preset.solid;
    this.blocksWave = true;
    this.hit = 0;
  }

  strike(intensity, ctx) {
    this.hit = 1;
    ctx.play({
      family: 'percussion',
      midi: ctx.room.music.getNote(this.degree, this.octave),
      intensity,
      modulation: this.drumType,
    });
  }

  onWaveEntered(wave, ctx) {
    const action = this.faces[this.faceFor(wave)];
    if (action !== FaceAction.Block) this.strike(wave.state.intensity, ctx);
    this.applyFaceAction(action, wave, ctx);
  }

  onPlayerInteract(ctx) { this.strike(0.9, ctx); return true; }

  draw(c, s, ctx) {
    const p = PALETTE.wing('percussion');
    const r = s * (0.34 + this.hit * 0.06);
    c.save();
    c.translate(s / 2, s / 2);
    c.rotate((this.rot * Math.PI) / 180);
    c.beginPath();
    c.arc(0, 0, r, 0, Math.PI * 2);
    c.fillStyle = this.hit > 0.05 ? p.hot : p.skin;
    c.fill();
    c.lineWidth = Math.max(2, s * 0.08);
    c.strokeStyle = p.metal;
    c.stroke();
    if (this.part === 'bass') {
      c.strokeStyle = p.metalHi;
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(-r * 0.5, 0); c.lineTo(r * 0.5, 0);
      c.lineTo(r * 0.15, -r * 0.3); c.moveTo(r * 0.5, 0); c.lineTo(r * 0.15, r * 0.3);
      c.stroke();
    }
    if (this.part === 'hat') {
      c.strokeStyle = p.metalHi;
      c.lineWidth = 1.5;
      c.beginPath();
      c.ellipse(0, 0, r, r * 0.35, 0, 0, Math.PI * 2);
      c.stroke();
    }
    c.restore();
    this.hit *= 0.85;
  }
}
defineDoodad('drum', Drum);
