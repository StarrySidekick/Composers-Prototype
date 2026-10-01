// Drums — bouncy surfaces that redirect waves in open air. Port target: Drum.cs.
// Face interactions are configured in the drum's LOCAL space, so rotating the drum
// changes which world directions map to which face.
//
// Bass, tom and snare are MIRRORS (2026-10-01, Timothy: "drums should reflect
// like a mirror... it depends on the position and the rotation of the drum"). The
// drum head is a line through the tile centre and a wave bounces off it the way
// light does, angle in = angle out:
//
//   head slanted to the wave (\ or /)  ->  turns 90°
//   head square-on (| to a sideways wave)  ->  straight back
//   head edge-on (parallel to the wave)  ->  slips past, silent
//
// Drums turn in 45° steps. At rot 0 the head runs like "/", which is how the
// Unity bass drum is drawn (its oval head runs lower-left to upper-right); each 45°
// turns it clockwise: 0 "/", 45 "—", 90 "\", 135 "|". Both faces reflect.
// Which drum it is now decides the SOUND and the default slant, not the direction.
//
// The rest of the kit:
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
export const MIRROR_PARTS = ['bass', 'tom', 'snare'];

// The head's direction, as a unit vector in screen space (+y down), for a rot.
export function headLine(rot) {
  const a = ((rot - 45) * Math.PI) / 180;
  return { x: Math.cos(a), y: Math.sin(a) };
}

// Bounce a direction off the head: d' = 2(d·u)u - d, the reflection of d about the
// line u. With the head at a multiple of 45° and d one of the four directions, the
// answer is always one of the four directions too, so it is rounded clean.
// Porting: Unity's Vector2.Reflect(d, n) takes the head's NORMAL n, not its line,
// and Unity is +y up, so the slants mirror (see docs/PORTING.md).
export function bounce(dir, rot) {
  const u = headLine(rot);
  const k = dir.x * u.x + dir.y * u.y;
  return { x: Math.round(2 * k * u.x - dir.x), y: Math.round(2 * k * u.y - dir.y) };
}

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
    // A face table given in the room file still wins: that is the hand-authored
    // Strumentino-style override, and it predates mirrors.
    this.mirror = MIRROR_PARTS.includes(this.part) && !spec.faces;
    this.rot = ((Math.round((spec.rot ?? 0) / 45) * 45) % 360 + 360) % 360;
  }

  // A head at a 45° step (— or |) gets its own drawing, `drum.bass.flat`, drawn
  // with the head level ("—") and turned in 90° steps, so pixel art is never rotated
  // by 45° (which smears it). The diagonal heads use the plain key.
  get flat() { return this.mirror && this.rot % 90 === 45; }
  get spriteKey() { return this.flat ? `drum.${this.part}.flat` : `drum.${this.part}`; }
  get spriteRot() { return this.flat ? this.rot - 45 : this.rot; }

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
    if (this.mirror) {
      const out = bounce(wave.dir, this.rot);
      if (out.x === wave.dir.x && out.y === wave.dir.y) { wave.pass(); return; }  // edge-on
      this.strike(wave.state.intensity, ctx);
      wave.reflect(out);
      return;
    }
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

    if (this.mirror) {
      // The head: the mirror line. Already turned by rot above, so at 0 it is "/".
      c.strokeStyle = p.metalHi;
      c.lineWidth = Math.max(2, s * 0.08);
      c.beginPath();
      c.moveTo(-r * 0.75, r * 0.75); c.lineTo(r * 0.75, -r * 0.75);
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
