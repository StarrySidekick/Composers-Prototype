// Strings. A run of string tiles between two pegs. Port target: String.cs + Peg.cs.
//
// Local X is "along the string" — a wave travelling that way plucks it.
// Local Y is "crossing the string" — the wave passes through silently, the way
// walking past a harp doesn't sound it.

import { Doodad, defineDoodad } from '../core/doodad.js';
import { PALETTE } from '../render/palette.js';

// Length decides the instrument, exactly as in String.cs.
function octaveForLength(len) {
  if (len <= 2) return 5; // violin
  if (len <= 4) return 4; // viola
  if (len <= 6) return 3; // cello
  return 2;               // bass
}

class StringSegment extends Doodad {
  constructor(spec, x, y) {
    super(spec, x, y);
    this.family = 'strings';
    this.solid = false;       // Coda can walk over a string and pluck it with his feet
    this.blocksWave = false;
    this.walkable = true;
    this.vibrate = 0;
  }

  pluck(intensity, ctx) {
    const len = this.measureLength(ctx.room, true);
    const degree = Math.max(0, 7 - Math.min(len, 8));
    this.vibrate = 1;
    // Ring the whole run, not just this tile — it's one string.
    ctx.room.each(d => { if (d.family === 'strings' && d.typeName === 'string') d.vibrate = Math.max(d.vibrate, 0.8); });
    ctx.play({
      family: 'strings',
      midi: ctx.room.music.getNote(degree, octaveForLength(len)),
      intensity,
    });
  }

  onWaveEntered(wave, ctx) {
    const face = this.faceFor(wave);
    const along = face === 'left' || face === 'right';
    if (along) this.pluck(wave.state.intensity, ctx);
    wave.pass(); // continues through either way
  }

  // Strumming works from any tile, any face — this is Coda deliberately plucking.
  onPlayerInteract(ctx) { this.pluck(1, ctx); return true; }

  onPlayerEnter(ctx) { this.pluck(0.45, ctx); }

  draw(c, s, ctx) {
    const p = PALETTE.wing('strings');
    c.save();
    c.translate(s / 2, s / 2);
    c.rotate((this.rot * Math.PI) / 180);
    const wobble = Math.sin(performance.now() / 40) * this.vibrate * s * 0.09;
    c.strokeStyle = this.vibrate > 0.05 ? p.hot : p.metal;
    c.lineWidth = Math.max(1.5, s * 0.06);
    c.beginPath();
    c.moveTo(-s / 2, 0);
    c.quadraticCurveTo(0, wobble, s / 2, 0);
    c.stroke();
    c.restore();
    this.vibrate *= 0.9;
  }
}
defineDoodad('string', StringSegment);

// Anchors terminate a string run. They never play — the BFS naturally stops here
// because a peg isn't a string segment.
class Peg extends Doodad {
  constructor(spec, x, y) {
    super(spec, x, y);
    this.family = 'strings-anchor';
    this.solid = true;
    this.blocksWave = true;
  }
  onWaveEntered(wave, ctx) { wave.destroy(); }
  draw(c, s) {
    const p = PALETTE.wing('strings');
    c.fillStyle = p.wood;
    c.beginPath();
    c.arc(s * 0.5, s * 0.5, s * 0.24, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = p.metalHi;
    c.lineWidth = 2;
    c.stroke();
  }
}
defineDoodad('peg', Peg);
