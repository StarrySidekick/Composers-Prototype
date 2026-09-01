// Drums — bouncy surfaces that redirect waves in open air. Port target: Drum.cs.
// Face interactions are configured in the drum's LOCAL space, so rotating the drum
// changes which world directions map to which face.
//
// The kit, and what each piece is FOR as a puzzle piece:
//   snare    reflect 180° — send it back the way it came
//   bass     kick 90° CW  — the right-hand corner
//   tom      kick 90° CCW — the left-hand corner, so a circuit can turn either way
//   hat      pass through and tick — a metronome you can route a wave across
//   cymbal   pass through and re-energise — restores a wave halved by a tee
//   timpani  pitched, absorbs — the drum that can answer a note lock

import { Doodad, defineDoodad } from '../core/doodad.js';
import { FaceAction } from '../core/direction.js';
import { PALETTE } from '../render/palette.js';

const all = (a) => ({ top: a, bottom: a, left: a, right: a });

const PARTS = {
  snare:   { faces: all(FaceAction.Reflect180),    kind: 'snare',  degree: 3, octave: 4, solid: true  },
  bass:    { faces: all(FaceAction.Redirect90CW),  kind: 'bass',   degree: 0, octave: 2, solid: true  },
  tom:     { faces: all(FaceAction.Redirect90CCW), kind: 'tom',    degree: 2, octave: 3, solid: true  },
  hat:     { faces: all(FaceAction.PassThrough),   kind: 'hat',    degree: 6, octave: 5, solid: false },
  cymbal:  { faces: all(FaceAction.PassThrough),   kind: 'cymbal', degree: 4, octave: 5, solid: false },
  timpani: { faces: all(FaceAction.PlayAndAbsorb), kind: 'timpani', voice: 'timpani',
             degree: 0, octave: 3, solid: true },
};

export const DRUM_PARTS = Object.keys(PARTS);

// The old face tables addressed the drum voice through `modulation`; keep that
// mapping alive for hand-written legend overrides that still set it.
const KIND_MODULATION = { bass: 0, tom: 0.3, snare: 0.5, hat: 1, cymbal: 1, timpani: 0 };

class Drum extends Doodad {
  constructor(spec, x, y) {
    super(spec, x, y);
    this.family = 'percussion';
    this.part = PARTS[spec.part] ? spec.part : 'snare';
    const preset = PARTS[this.part];
    this.faces = { ...preset.faces, ...(spec.faces ?? {}) };
    this.kind = spec.kind ?? preset.kind;
    this.voice = spec.voice ?? preset.voice ?? 'percussion';
    this.drumType = spec.drumType ?? KIND_MODULATION[this.kind] ?? 0.5;
    this.degree = spec.degree ?? preset.degree;
    this.octave = spec.octave ?? preset.octave;
    this.solid = spec.solid ?? preset.solid;
    this.blocksWave = true;
    this.hit = 0;
  }

  strike(intensity, ctx) {
    this.hit = 1;
    ctx.play({
      family: this.voice,
      kind: this.kind,
      midi: ctx.room.music.getNote(this.degree, this.octave),
      intensity,
      modulation: this.drumType,
    });
  }

  onWaveEntered(wave, ctx) {
    const action = this.faces[this.faceFor(wave)];
    if (action !== FaceAction.Block) this.strike(wave.state.intensity, ctx);

    // A cymbal is a sustain, not a hit: it hands the wave back its energy, which is
    // what lets a halved branch off a tee still reach a lock at full intensity.
    if (this.part === 'cymbal' && action === FaceAction.PassThrough) {
      const s = wave.state.clone();
      s.intensity = Math.min(1, s.intensity + 0.4);
      wave.applyState(s);
    }

    this.applyFaceAction(action, wave, ctx);
  }

  onMeleeStrike(wave, ctx) { this.strike(wave.state.intensity, ctx); return true; }

  // Timpani are tuned by hand — press B to walk the drum up the room's scale.
  // Everything else just sounds when you hit it.
  onPlayerInteract(ctx) {
    if (this.part === 'timpani') {
      this.degree = (this.degree + 1) % 7;
      this.strike(0.9, ctx);
      ctx.toast(`Timpani tuned to degree ${this.degree + 1}.`);
      return true;
    }
    this.strike(0.9, ctx);
    return true;
  }

  toJSON() {
    const j = { ...this.spec };
    if (this.part === 'timpani') j.degree = this.degree;
    return j;
  }

  // The tuning readout is not art — it stays on top of a real sprite too.
  overlay(c, s, ctx) {
    if (this.part !== 'timpani') return;
    const p = PALETTE.wing('percussion');
    c.fillStyle = this.hit > 0.05 ? p.ink : p.parchment;
    c.font = `bold ${Math.round(s * 0.3)}px ui-monospace, monospace`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(String(this.degree + 1), s * 0.5, s * 0.52);
  }

  draw(c, s, ctx) {
    const p = PALETTE.wing('percussion');
    const lit = this.hit > 0.05;
    const r = s * (0.34 + this.hit * 0.06);
    c.save();
    c.translate(s / 2, s / 2);
    c.rotate((this.rot * Math.PI) / 180);

    if (this.part === 'cymbal') {
      c.strokeStyle = lit ? p.hot : p.metalHi;
      c.lineWidth = Math.max(1.5, s * 0.05);
      for (let i = 0; i < 3; i++) {
        c.beginPath();
        c.ellipse(0, 0, r * (1 - i * 0.28), r * (0.34 - i * 0.09), 0, 0, Math.PI * 2);
        c.stroke();
      }
      c.beginPath();
      c.moveTo(0, -r * 0.34); c.lineTo(0, r * 0.5);
      c.strokeStyle = p.metal;
      c.stroke();
      c.restore();
      this.hit *= 0.85;
      return;
    }

    c.beginPath();
    c.arc(0, 0, r, 0, Math.PI * 2);
    c.fillStyle = lit ? p.hot : (this.part === 'timpani' ? p.metal : p.skin);
    c.fill();
    c.lineWidth = Math.max(2, s * 0.08);
    c.strokeStyle = this.part === 'timpani' ? p.metalHi : p.metal;
    c.stroke();

    if (this.part === 'bass' || this.part === 'tom') {
      // Arrowheads point the way the drum kicks: bass clockwise, tom counter.
      const cw = this.part === 'bass';
      c.strokeStyle = p.metalHi;
      c.lineWidth = 2;
      c.beginPath();
      c.arc(0, 0, r * 0.55, cw ? -0.9 : 0.9, cw ? 1.6 : -1.6, !cw);
      c.stroke();
      const a = cw ? 1.6 : -1.6;
      const hx = Math.cos(a) * r * 0.55, hy = Math.sin(a) * r * 0.55;
      c.beginPath();
      c.moveTo(hx, hy);
      c.lineTo(hx - r * 0.2, hy - r * 0.1);
      c.moveTo(hx, hy);
      c.lineTo(hx + r * 0.05, hy - r * 0.24);
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
    if (this.part === 'timpani') this.overlay(c, s, ctx);
    this.hit *= 0.85;
  }
}
defineDoodad('drum', Drum);
