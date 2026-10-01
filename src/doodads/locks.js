// Locks open doors. Two kinds, matching GDD §6.4:
//   lock      — lit by any wave. Many valid solutions, so the music varies player to player.
//   notelock  — musically strict: only a specific melody opens it, and the room
//               offers a hint phrase you can listen to and replicate.

import { Doodad, defineDoodad } from '../core/doodad.js';
import { PALETTE } from '../render/palette.js';

function checkGroup(group, ctx) {
  if (!group) return;
  const members = ctx.room.ofGroup(group);
  const locks = members.filter(d => d.isLock);
  if (!locks.length) return;
  const allLit = locks.every(l => l.lit);
  for (const d of members) {
    if (typeof d.setOpen === 'function') d.setOpen(allLit, ctx);
  }
}

class TriggerLock extends Doodad {
  constructor(spec, x, y) {
    super(spec, x, y);
    this.family = 'puzzle';
    this.isLock = true;
    this.solid = true;
    this.blocksWave = true;
    this.lit = false;
    this.group = spec.group ?? 'a';
    this.degree = spec.degree ?? 4;
    this.latching = spec.latching !== false; // stays lit once hit
    this.glow = 0;
  }

  get spriteKey() { return this.lit ? 'lock.lit' : 'lock'; }

  onWaveEntered(wave, ctx) {
    this.lit = true;
    this.glow = 1;
    ctx.play({ family: 'keys', midi: ctx.room.music.getNote(this.degree, 5), intensity: 0.8 });
    checkGroup(this.group, ctx);
    wave.destroy();
  }

  reset(ctx) {
    if (this.latching) return;
    this.lit = false;
    checkGroup(this.group, ctx);
  }

  draw(c, s, ctx) {
    const p = PALETTE.wing(ctx.room.wing);
    c.fillStyle = this.lit ? p.hot : p.stone;
    c.beginPath();
    c.arc(s * 0.5, s * 0.5, s * 0.3, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = p.accent;
    c.lineWidth = 2;
    c.stroke();
    if (this.glow > 0.02) {
      c.globalAlpha = this.glow * 0.5;
      c.beginPath();
      c.arc(s * 0.5, s * 0.5, s * (0.3 + (1 - this.glow) * 0.35), 0, Math.PI * 2);
      c.strokeStyle = p.hot;
      c.stroke();
      c.globalAlpha = 1;
    }
    this.glow *= 0.9;
  }
}
defineDoodad('lock', TriggerLock);

class NoteLock extends Doodad {
  constructor(spec, x, y) {
    super(spec, x, y);
    this.family = 'puzzle';
    this.isLock = true;
    this.solid = true;
    this.blocksWave = true;
    this.lit = false;
    this.group = spec.group ?? 'a';
    // Scale degrees, in order. Degree 0 is the tonic of the room's current key.
    this.sequence = spec.sequence ?? [0, 2, 4];
    this.progress = 0;
    this.lastHeard = null;
    this.glow = 0;
  }

  get spriteKey() { return this.lit ? 'notelock.lit' : 'notelock'; }

  // Progress pips belong on top of whatever art the lock ends up with.
  overlay(c, s, ctx) {
    const p = PALETTE.wing(ctx.room.wing);
    const n = this.sequence.length;
    for (let i = 0; i < n; i++) {
      // heard = filled, still wanted = an empty ring, so it reads without colour
      c.beginPath();
      c.arc(s * (0.28 + (i * 0.44) / Math.max(1, n - 1)), s * 0.72, s * 0.05, 0, Math.PI * 2);
      if (i < this.progress) { c.fillStyle = p.hot; c.fill(); }
      else { c.strokeStyle = p.ink; c.lineWidth = 1; c.stroke(); }
    }
  }

  // The game feeds every melodic note here (see Game's audio.onNote hook).
  hearNote(midi, ctx) {
    if (this.lit) return;
    const pc = ((midi % 12) + 12) % 12;

    // Collapse immediate repeats. A tube or a string run often sounds the same
    // note several beats running; the lock is listening for a phrase, not a tremolo.
    if (pc === this.lastHeard) return;
    this.lastHeard = pc;

    const matches = (i) => {
      const want = ctx.room.music.getNote(this.sequence[i], 4);
      return ((pc - want) % 12 + 12) % 12 === 0;
    };

    if (matches(this.progress)) {
      this.progress++;
      this.glow = 1;
      if (this.progress >= this.sequence.length) {
        this.lit = true;
        ctx.toast('The phrase resolves. ♪');
        checkGroup(this.group, ctx);
      }
    } else {
      // A wrong note restarts the phrase — but it might itself be a valid opening.
      this.progress = matches(0) ? 1 : 0;
    }
  }

  // Interact to hear the hint phrase.
  onPlayerInteract(ctx) {
    const t0 = ctx.audio.now + 0.05;
    this.sequence.forEach((deg, i) => {
      ctx.audio.play({
        family: 'woodwind',
        midi: ctx.room.music.getNote(deg, 4),
        intensity: 0.7,
        when: t0 + i * 0.28,
      });
    });
    ctx.toast('Hint phrase.');
    return true;
  }

  onWaveEntered(wave, ctx) { wave.destroy(); }

  draw(c, s, ctx) {
    const p = PALETTE.wing(ctx.room.wing);
    c.fillStyle = this.lit ? p.hot : p.stone;
    c.fillRect(s * 0.14, s * 0.14, s * 0.72, s * 0.72);
    c.strokeStyle = p.accent;
    c.lineWidth = 2;
    c.strokeRect(s * 0.14, s * 0.14, s * 0.72, s * 0.72);
    c.fillStyle = p.ink;
    c.font = `${Math.round(s * 0.34)}px ui-monospace, monospace`;
    c.textAlign = 'center';
    c.fillText('♫', s * 0.5, s * 0.52);
    this.overlay(c, s, ctx);
    this.glow *= 0.9;
  }
}
defineDoodad('notelock', NoteLock);
