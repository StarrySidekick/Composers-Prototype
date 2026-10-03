// Woodwinds. New here (2026-10-03); no Unity counterpart yet, so read this as a
// proposal with a working implementation attached (docs/PORTING.md).
//
// Brass is plumbing: a horn routes a wave through its tubing and its LENGTH is its
// pitch, sounded once at the bell. Woodwinds do two things brass cannot:
//
//   FLUTE  the fingering picks the note AND the way out. A flute is a straight
//          bore: a head you blow, holes along it, a foot. A wave runs down the bore
//          and leaves through the FIRST OPEN HOLE it meets, sounding that hole's
//          note; that is roughly what a real flute does (the first open tone hole
//          ends the air column). Cover holes with B and the wave goes further down,
//          lower, and out somewhere else. All covered, it plays the lowest note
//          and leaves through the foot.
//
//   REED   it keeps breathing. A wave (or B) sets the reed going: it sounds and
//          sends a wave out of its bell, then again on every beat for `breath`
//          beats. One shot becomes a short train of waves, which can hold a
//          door open long enough to walk through. A weak wave (halved by a tee)
//          has not got the air: one breath only. A reed can be lifted with the
//          burin and carried to where it is needed.

import { Doodad, defineDoodad } from '../core/doodad.js';
import { DIR, localFace, rotate } from '../core/direction.js';
import { PALETTE } from '../render/palette.js';

// ---- the flute ---------------------------------------------------------------
//
// Local space, like a brass straight: the bore runs left -> right, the head at the
// left end, the foot at the right. A hole opens on the TOP side (local up). Rotate
// the whole flute with `rot`; every tile of one flute shares a rotation.

const FLUTE_PARTS = ['head', 'hole', 'foot'];

class FlutePiece extends Doodad {
  constructor(spec, x, y) {
    super(spec, x, y);
    this.family = 'woodwind';
    this.part = FLUTE_PARTS.includes(spec.part) ? spec.part : 'hole';
    this.covered = !!spec.covered;   // holes only
    this.octave = spec.octave ?? 5;  // a flute sits high
    this.solid = true;
    this.blocksWave = true;
    this.flash = 0;
  }

  get spriteKey() {
    if (this.part === 'hole') return this.covered ? 'flute.covered' : 'flute.hole';
    return `flute.${this.part}`;
  }

  get alongDir() { return rotate(DIR.right, this.rot); }   // head -> foot
  get holeDir() { return rotate(DIR.up, this.rot); }       // out of a hole

  // Is the neighbour `back` steps toward the head part of the same flute?
  sameFlute(d) { return d && d.typeName === 'flute' && d.rot === this.rot; }

  // Tiles from the head to here, inclusive: the length of the air column when the
  // wave leaves here. A flute without a head counts from its first tile.
  columnLength(room) {
    const back = rotate(DIR.left, this.rot);
    let n = 1, d = this;
    while (d.part !== 'head') {
      const prev = room.doodadAt(d.x + back.x, d.y + back.y);
      if (!this.sameFlute(prev)) break;
      d = prev; n++;
    }
    return n;
  }

  // Longer column, lower note, snapped to the scale like everything else. A head,
  // three holes and a foot play la sol fa mi from the first hole to the foot.
  degreeFor(length) { return 7 - length; }

  sound(wave, ctx) {
    this.flash = 1;
    ctx.play({
      family: 'woodwind',
      midi: ctx.room.music.getNote(this.degreeFor(this.columnLength(ctx.room)), this.octave),
      intensity: wave?.state.intensity ?? 1,
    });
  }

  onWaveEntered(wave, ctx) {
    const face = localFace(wave.dir, this.rot);
    const alongBore = face === 'left' || face === 'right';
    if (!alongBore) { wave.destroy(); return; }          // into the side of the bore
    if (this.part === 'head') {
      // Blown in from behind runs down the bore; coming back up, it is swallowed.
      if (face === 'right') { this.flash = 0.6; wave.pass(); } else wave.destroy();
      return;
    }
    if (this.part === 'hole' && !this.covered) {
      // The first open hole: sound here and leave through it.
      this.sound(wave, ctx);
      wave.reflect(this.holeDir);
      return;
    }
    if (this.part === 'foot' && face === 'right') {
      this.sound(wave, ctx);                               // every hole covered
      wave.pass();
      return;
    }
    this.flash = Math.max(this.flash, 0.4);
    wave.pass();                                           // a covered hole: through
  }

  // B: blow the head (a wave down the bore), or cover / uncover a hole.
  onPlayerInteract(ctx) {
    if (this.part === 'head') {
      this.flash = 1;
      ctx.spawnWaveFromDoodad(this, this.alongDir);
      return true;
    }
    if (this.part === 'hole') {
      this.covered = !this.covered;
      ctx.play({ family: 'percussion', kind: 'hat', midi: 72, intensity: 0.25 });
      ctx.toast(this.covered ? 'Hole covered.' : 'Hole open.');
      return true;
    }
    return false;
  }

  toJSON() {
    const j = { ...this.spec };
    if (this.part === 'hole') j.covered = this.covered;
    return j;
  }

  draw(c, s, ctx) {
    const p = PALETTE.wing('woodwind');
    c.save();
    c.translate(s / 2, s / 2);
    c.rotate((this.rot * Math.PI) / 180);
    c.translate(-s / 2, -s / 2);
    c.strokeStyle = this.flash > 0.05 ? p.hot : p.metal;
    c.lineWidth = 2;
    c.strokeRect(this.part === 'head' ? s * 0.2 : 0, s * 0.36, this.part === 'foot' ? s * 0.8 : s, s * 0.28);
    if (this.part === 'hole') {
      c.beginPath();
      c.arc(s * 0.5, s * 0.5, s * 0.09, 0, Math.PI * 2);
      if (this.covered) { c.fillStyle = p.metalHi; c.fill(); } else c.stroke();
    }
    if (this.part === 'head') {
      c.beginPath(); c.ellipse(s * 0.42, s * 0.5, s * 0.08, s * 0.05, 0, 0, Math.PI * 2); c.stroke();
    }
    c.restore();
    this.flash *= 0.86;
  }
}
defineDoodad('flute', FlutePiece);

export const FLUTE_PART_NAMES = FLUTE_PARTS;

// ---- the reed ----------------------------------------------------------------
//
// One tile. Its bell faces local right (rotate with `rot`); that is where its
// waves go. Any wave arriving sets it breathing, from any side.

class Reed extends Doodad {
  constructor(spec, x, y) {
    super(spec, x, y);
    this.family = 'woodwind';
    this.degree = spec.degree ?? 0;
    this.octave = spec.octave ?? 4;
    this.breath = Math.max(1, spec.breath ?? 4);
    this.solid = true;
    this.blocksWave = true;
    this.portable = spec.portable !== false;
    this.carryName = 'reed';
    this.left = 0;        // breaths still to come
    this.flash = 0;
  }

  get bellDir() { return rotate(DIR.right, this.rot); }

  // Needs the beat even when Coda is in another room: a reed set going keeps
  // going (Game.stepWaves).
  get awake() { return this.left > 0; }

  breathe(ctx) {
    this.flash = 1;
    ctx.play({ family: 'woodwind', midi: ctx.room.music.getNote(this.degree, this.octave), intensity: 0.8 });
    ctx.spawnWaveFromDoodad(this, this.bellDir);
  }

  start(breaths, ctx) {
    if (this.left > 0) return;          // already breathing: the wave just ends here
    this.left = breaths - 1;
    this.breathe(ctx);
  }

  onWaveEntered(wave, ctx) {
    const strong = wave.state.intensity >= 0.6;
    wave.destroy();
    this.start(strong ? this.breath : 1, ctx);
  }

  onBeat(beat, ctx) {
    if (this.left <= 0) return;
    this.left--;
    this.breathe(ctx);
  }

  onPlayerInteract(ctx) { this.start(this.breath, ctx); return true; }

  // Breaths left, as pips: state, not art.
  overlay(c, s) {
    if (this.left <= 0) return;
    c.fillStyle = '#fff';
    for (let i = 0; i < this.left; i++) c.fillRect(s * (0.2 + i * 0.12), s * 0.86, s * 0.07, s * 0.07);
  }

  draw(c, s, ctx) {
    const p = PALETTE.wing('woodwind');
    c.save();
    c.translate(s / 2, s / 2);
    c.rotate((this.rot * Math.PI) / 180);
    c.strokeStyle = this.flash > 0.05 ? p.hot : p.metal;
    c.lineWidth = 2;
    c.strokeRect(-s * 0.36, -s * 0.12, s * 0.5, s * 0.24);
    c.beginPath();
    c.moveTo(s * 0.14, -s * 0.12); c.lineTo(s * 0.42, -s * 0.28);
    c.lineTo(s * 0.42, s * 0.28); c.lineTo(s * 0.14, s * 0.12);
    c.stroke();
    c.restore();
    this.overlay(c, s, ctx);
    this.flash *= 0.86;
  }
}
defineDoodad('reed', Reed);
