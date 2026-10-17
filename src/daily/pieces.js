// Pieces only the daily board has (Timothy, 2026-10-16):
//
//   "a string would be hit perpendicular, and be adjustable in pitch by its
//    length, and the peg on each end, when rotated, tightens or loosens the
//    string. So it's the length plus how many wraps are on the string that
//    define pitch. There are also just little violins that play a set note. If
//    a peg is on a movable block then you can drag the block and therefore
//    adjust length."
//
// So, unlike the castle's string (src/doodads/strings.js, after Unity's
// String.cs, which sounds when a wave runs ALONG it):
//
//   TautString  one tile of a string held between two pegs. A wave CROSSING it
//               plucks it and carries on; one running along it is silent. Its
//               note is the whole string's: 7 - length + wraps, as a scale
//               degree, so a longer string is lower and each wrap on either peg
//               raises it a step. The octave comes from the length alone, violin
//               to cello. A string missing a peg is slack and sounds nothing.
//   TuningPeg   holds one end. Tap it to wind it (wraps 0 to 3, then it lets
//               go back to 0). On a block it can be dragged along its string,
//               which lengthens or shortens it (Board.move lays the new string).
//               A wave that hits a peg stops there.
//   Solo        a little single-tile instrument with a set note: a violin, a
//               trumpet or a flute. A wave passing through plays it, from any
//               side. The big instruments (horns, flutes with holes, strings
//               you tune) can play several notes; these play one.
//
// Daily-only on purpose: the castle and the Unity port are untouched. Their
// characters live in DAILY_LEGEND (src/daily/board.js), not DEFAULT_LEGEND.

import { Doodad, defineDoodad } from '../core/doodad.js';
import { PALETTE } from '../render/palette.js';

// Length decides the register, violin to cello, as String.cs does but a step
// higher at the long end: a twelve-tile string here would otherwise sound near
// 40 Hz, below anything a phone speaker plays.
function octaveForLength(len) {
  if (len <= 2) return 5;   // violin
  if (len <= 4) return 4;   // viola
  return 3;                 // cello, however long
}

const SIDES = [[0, -1], [1, 0], [0, 1], [-1, 0]];

export class TautString extends Doodad {
  constructor(spec, x, y) {
    super(spec, x, y);
    this.family = 'strings';
    this.axis = (Math.round((spec.rot ?? 0) / 90) % 2) ? 'v' : 'h';
    this.solid = false;
    this.blocksWave = false;
    this.walkable = true;
    this.vibrate = 0;
  }

  get spriteKey() { return 'string'; }
  get spriteRot() { return this.axis === 'v' ? 90 : 0; }

  // The whole string this tile belongs to: its tiles along the axis, and what
  // holds each end. Along the axis only, so two strings side by side stay two.
  run(room) {
    const [dx, dy] = this.axis === 'h' ? [1, 0] : [0, 1];
    const same = d => d instanceof TautString && d.axis === this.axis;
    let a = this, b = this;
    const tiles = [this];
    for (let n = room.doodadAt(a.x - dx, a.y - dy); same(n); n = room.doodadAt(a.x - dx, a.y - dy)) { a = n; tiles.unshift(n); }
    for (let n = room.doodadAt(b.x + dx, b.y + dy); same(n); n = room.doodadAt(b.x + dx, b.y + dy)) { b = n; tiles.push(n); }
    const ends = [room.doodadAt(a.x - dx, a.y - dy), room.doodadAt(b.x + dx, b.y + dy)];
    return { tiles, ends, pegs: ends.filter(e => e instanceof TuningPeg) };
  }

  // The string's note as { degree, octave }, or null when it is slack.
  note(room) {
    const { tiles, pegs } = this.run(room);
    if (pegs.length < 2) return null;
    const wraps = pegs.reduce((s, p) => s + p.wraps, 0);
    // The note's name from length and wraps; its octave from length alone.
    const degree = (((7 - tiles.length + wraps) % 7) + 7) % 7;
    return { degree, octave: octaveForLength(tiles.length), length: tiles.length, wraps };
  }

  pluck(intensity, ctx) {
    const n = this.note(ctx.room);
    if (!n) return false;
    for (const t of this.run(ctx.room).tiles) t.vibrate = 1;
    // Plucked, always: the recorded cello is bowed and swells in late.
    ctx.play({ family: 'strings', midi: ctx.room.music.getNote(n.degree, n.octave), intensity, sampled: false });
    return true;
  }

  // Across: plucked. Along: slides by. Either way the wave goes on.
  onWaveEntered(wave, ctx) {
    const across = this.axis === 'h' ? wave.dir.y !== 0 : wave.dir.x !== 0;
    if (across) this.pluck(wave.state.intensity, ctx);
    wave.pass();
  }

  // A plucked string shivers, over the art as well as without it.
  overlay(c, s) {
    if (this.vibrate < 0.05) return;
    const wob = Math.sin(performance.now() / 35) * this.vibrate * s * 0.12;
    c.save();
    c.translate(s / 2, s / 2);
    if (this.axis === 'v') c.rotate(Math.PI / 2);
    c.strokeStyle = '#ffffff';
    c.globalAlpha = 0.9;
    c.lineWidth = Math.max(2, s * 0.06);
    c.beginPath();
    c.moveTo(-s / 2, 0);
    c.quadraticCurveTo(0, wob, s / 2, 0);
    c.stroke();
    c.restore();
    this.vibrate *= 0.9;
  }

  draw(c, s) {
    c.save();
    c.translate(s / 2, s / 2);
    if (this.axis === 'v') c.rotate(Math.PI / 2);
    c.strokeStyle = PALETTE.wing('strings').metal;
    c.lineWidth = Math.max(1.5, s * 0.06);
    c.beginPath(); c.moveTo(-s / 2, 0); c.lineTo(s / 2, 0); c.stroke();
    c.restore();
    this.overlay(c, s);
  }
}
defineDoodad('taut', TautString);

export class TuningPeg extends Doodad {
  constructor(spec, x, y) {
    super(spec, x, y);
    this.family = 'strings-anchor';
    this.solid = true;
    this.blocksWave = true;
    this.wraps = ((spec.wraps ?? 0) % 4 + 4) % 4;
    this.hit = 0;
  }

  // The string this peg holds: the string tile beside it whose axis points here.
  string(room) {
    for (const [dx, dy] of SIDES) {
      const n = room.doodadAt(this.x + dx, this.y + dy);
      if (n instanceof TautString && (n.axis === 'h') === (dy === 0)) return n;
    }
    return null;
  }

  // The castle's peg art points its stem up; turned so it points at the string.
  get spriteKey() { return 'peg'; }
  get spriteRot() { return this._facing ?? 0; }

  // Wind it one more turn, or let it go back to none.
  turn() { this.wraps = (this.wraps + 1) % 4; this.hit = 1; }

  onWaveEntered(wave) { wave.destroy(); }

  // The wraps, drawn as windings on the string side of the peg: state, not art.
  overlay(c, s) {
    if (!this.wraps) return;
    c.save();
    c.translate(s / 2, s / 2);
    c.rotate(((this._facing ?? 0) * Math.PI) / 180);
    c.strokeStyle = '#ffffff';
    c.lineCap = 'round';
    c.lineWidth = Math.max(1.5, s * 0.05);
    for (let i = 0; i < this.wraps; i++) {
      const y = -s * (0.2 + i * 0.1);
      c.beginPath(); c.moveTo(-s * 0.13, y + s * 0.04); c.lineTo(s * 0.13, y - s * 0.04); c.stroke();
    }
    c.restore();
  }

  draw(c, s, ctx) {
    const p = PALETTE.wing('strings');
    c.fillStyle = p.wood;
    c.beginPath(); c.arc(s * 0.5, s * 0.5, s * 0.22, 0, Math.PI * 2); c.fill();
    c.strokeStyle = p.metalHi;
    c.lineWidth = 2;
    c.stroke();
    this.overlay(c, s, ctx);
  }
}
defineDoodad('tuningpeg', TuningPeg);

// The little instruments: one tile, one note, any side.
const VOICES = {
  violin:  { family: 'strings',  octave: 5 },
  trumpet: { family: 'brass',    octave: 4 },
  flute:   { family: 'woodwind', octave: 5 },
};
export const SOLO_VOICES = Object.keys(VOICES);

export class Solo extends Doodad {
  constructor(spec, x, y) {
    super(spec, x, y);
    this.voice = VOICES[spec.voice] ? spec.voice : 'violin';
    this.family = VOICES[this.voice].family;
    this.degree = spec.degree ?? 0;
    this.octave = spec.octave ?? VOICES[this.voice].octave;
    this.solid = true;
    this.blocksWave = true;
    this.flash = 0;
  }

  get spriteKey() { return `solo.${this.voice}`; }
  get spriteRot() { return 0; }

  sound(ctx, intensity = 1) {
    this.flash = 1;
    ctx.play({ family: this.family, midi: ctx.room.music.getNote(this.degree, this.octave), intensity });
  }

  onWaveEntered(wave, ctx) {
    this.sound(ctx, wave.state.intensity);
    wave.pass();
  }

  draw(c, s) {
    c.strokeStyle = this.flash > 0.05 ? '#ffffff' : PALETTE.wing('strings').metalHi;
    c.lineWidth = 2;
    c.strokeRect(s * 0.2, s * 0.2, s * 0.6, s * 0.6);
    this.flash *= 0.86;
  }
}
defineDoodad('solo', Solo);

// A solid block: fills a tile no instrument needs (Timothy, 2026-10-17: "use
// solid block textures in places where there aren't any instruments"). A wave
// that meets one stops there, silently. Drawn with the castle's `block` art,
// Unity's pushable block.
export class Block extends Doodad {
  constructor(spec, x, y) {
    super(spec, x, y);
    this.solid = true;
    this.blocksWave = true;
  }
  get spriteKey() { return 'block'; }
  onWaveEntered(wave) { wave.destroy(); }
  draw(c, s) {
    c.fillStyle = '#1c1c1c';
    c.fillRect(1, 1, s - 2, s - 2);
    c.strokeStyle = '#ffffff';
    c.lineWidth = 2;
    c.strokeRect(s * 0.1, s * 0.1, s * 0.8, s * 0.8);
  }
}
defineDoodad('block', Block);
