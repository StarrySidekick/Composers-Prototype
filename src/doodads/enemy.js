// The dissonant: the first, deliberately small, enemy. A scoping prototype for
// docs/SCOPE-ENEMIES-AND-BOSS.md, not a combat system.
//
// The world's enemy is DISSONANCE (GDD §6.10's negative Strumentino), so this is a
// wandering sour note. It moves one tile per beat on the same clock as the waves,
// buzzing as it goes so you can hear it coming. Touching Coda shoves him away with
// a sour sting; there is no health and no death, only lost position and time.
//
// A wave that reaches it RESOLVES it, in the musical sense: it sounds the note a
// semitone off, then slides onto the scale tone, and is gone. Dissonance resolving
// to consonance is the whole idea in one interval.
//
// Paths, all one tile per `every` beats:
//   line   straight on; turn back at anything in the way
//   turn   straight on; at an obstacle turn clockwise and try again (walks a loop)
//   seek   a step toward Coda along the longer axis, the other if that is blocked

import { Doodad, defineDoodad } from '../core/doodad.js';
import { DIR, rotate, rotateCW, reverse } from '../core/direction.js';

const PATHS = ['line', 'turn', 'seek'];

class Dissonant extends Doodad {
  constructor(spec, x, y) {
    super(spec, x, y);
    this.family = 'negative';
    this.solid = false;          // Coda can walk into it, which is how it catches him
    this.blocksWave = true;
    this.walkable = true;
    this.path = PATHS.includes(spec.path) ? spec.path : 'line';
    this.every = Math.max(1, spec.every ?? 1);
    this.heading = rotate(DIR.right, this.rot);
    this.from = null;            // for drawing the hop between tiles
    this.movedAt = 0;
  }

  get spriteKey() { return 'dissonant'; }
  get spriteRot() { return 0; }

  free(room, x, y) {
    return room.inBounds(x, y) && !room.doodadAt(x, y);
  }

  nextStep(ctx) {
    const room = ctx.room;
    const at = (d) => ({ x: this.x + d.x, y: this.y + d.y, d });
    if (this.path === 'seek') {
      const pl = ctx.player;
      const dx = Math.sign(pl.x - this.x), dy = Math.sign(pl.y - this.y);
      const first = Math.abs(pl.x - this.x) >= Math.abs(pl.y - this.y);
      const tries = first ? [{ x: dx, y: 0 }, { x: 0, y: dy }] : [{ x: 0, y: dy }, { x: dx, y: 0 }];
      for (const d of tries) {
        if (!d.x && !d.y) continue;
        const n = at(d);
        if (this.free(room, n.x, n.y)) return n;
      }
      return null;
    }
    const tries = this.path === 'turn'
      ? [this.heading, rotateCW(this.heading), rotateCW(rotateCW(this.heading)), rotateCW(rotateCW(rotateCW(this.heading)))]
      : [this.heading, reverse(this.heading)];
    for (const d of tries) {
      const n = at(d);
      if (this.free(room, n.x, n.y)) return n;
    }
    return null;
  }

  onBeat(beat, ctx) {
    if (beat % this.every) return;
    const n = this.nextStep(ctx);
    if (!n) return;
    this.heading = n.d;
    this.from = { x: this.x, y: this.y };
    this.movedAt = ctx.game?.scheduledTime || ctx.audio.now;
    ctx.room.setDoodad(this.x, this.y, null);
    ctx.room.setDoodad(n.x, n.y, this);
    ctx.play({ family: 'sour', midi: ctx.room.music.getNote(1, 3), intensity: 0.12 });
    // Moved onto a wave: that is a wave reaching it.
    const w = ctx.wavesAt?.(n.x, n.y)[0];
    if (w) { w.destroy(); this.resolve(ctx); return; }
    if (ctx.player.x === n.x && ctx.player.y === n.y) ctx.hurt?.(this);
  }

  onPlayerEnter(ctx) { ctx.hurt?.(this); }

  onWaveEntered(wave, ctx) {
    wave.destroy();
    this.resolve(ctx);
  }

  // Sour, then sweet: the leading tone a semitone under the tonic, then the tonic.
  // Both through the scale (degree 6 is the leading tone in a major mode; the
  // "sour" voice detunes it), so nothing here plays a raw pitch.
  resolve(ctx) {
    ctx.play({ family: 'sour', midi: ctx.room.music.getNote(6, 4), intensity: 0.5 });
    const t = (ctx.game?.scheduledTime || ctx.nextGridTime(1)) + ctx.subInterval * 2;
    ctx.audio.play({ family: 'keys', midi: ctx.room.music.getNote(7, 4), intensity: 0.7, when: t, room: ctx.room, heard: false });
    ctx.room.setDoodad(this.x, this.y, null);
    ctx.toast('Resolved.');
  }

  draw(c, s) {
    const t = performance.now() / 90;
    c.strokeStyle = '#fff';
    c.lineWidth = 2;
    c.beginPath();
    for (let i = 0; i <= 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r = s * (0.26 + (i % 2 ? 0.1 : 0) + Math.sin(t + i) * 0.02);
      c.lineTo(s / 2 + Math.cos(a) * r, s / 2 + Math.sin(a) * r);
    }
    c.closePath(); c.stroke();
    c.beginPath(); c.arc(s * 0.42, s * 0.46, s * 0.04, 0, Math.PI * 2); c.arc(s * 0.58, s * 0.46, s * 0.04, 0, Math.PI * 2);
    c.fillStyle = '#fff'; c.fill();
  }
}
defineDoodad('dissonant', Dissonant);

export const DISSONANT_PATHS = PATHS;
