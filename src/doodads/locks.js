// Locks open doors. Two kinds, matching GDD §6.4:
//   lock      — lit by any wave. Many valid solutions, so the music varies player to player.
//   notelock  — musically strict: only a specific melody opens it, and the room
//               offers a hint phrase you can listen to and replicate.

import { Doodad, defineDoodad } from '../core/doodad.js';
import { MusicalState, NOTE_NAMES } from '../core/music.js';
import { PALETTE } from '../render/palette.js';

export function checkGroup(group, ctx) {
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
    // A CHORD fork: rings for `sustain` beats after a hit, then goes dark. Put
    // several in one group and the door opens only while they all ring at once,
    // which takes as many waves in the air as there are forks: an Overtone gate.
    this.sustain = Math.max(0, spec.sustain ?? 0);
    if (this.sustain) this.latching = false;
    this.ringing = 0;
    this.glow = 0;
  }

  get spriteKey() { return this.lit ? 'lock.lit' : 'lock'; }

  onWaveEntered(wave, ctx) {
    this.lit = true;
    this.glow = 1;
    this.ringing = this.sustain;
    ctx.play({ family: 'keys', midi: ctx.room.music.getNote(this.degree, 5), intensity: 0.8 });
    checkGroup(this.group, ctx);
    wave.destroy();
  }

  get awake() { return !!(this.sustain && this.lit); }

  onBeat(beat, ctx) {
    if (!this.sustain || !this.lit) return;
    if (--this.ringing > 0) return;
    this.lit = false;
    checkGroup(this.group, ctx);
  }

  // How long a chord fork has left, as ticks under it: state, not art.
  overlay(c, s) {
    if (!this.sustain) return;
    c.fillStyle = '#fff';
    for (let i = 0; i < this.sustain; i++) {
      const on = this.lit && i < this.ringing;
      if (on) c.fillRect(s * (0.3 + i * 0.12), s * 0.9, s * 0.08, s * 0.06);
      else c.fillRect(s * (0.3 + i * 0.12), s * 0.92, s * 0.08, s * 0.02);
    }
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
    // `key`: the phrase is wanted IN THIS KEY (0 = C ... 11 = B, or a name), not in
    // whatever key the room is in. The stairs (< >) move the room's key, so they are
    // how you bring the instruments up or down to meet it. Same degrees, same mode,
    // a different tonic: the lock shows the letter it wants.
    this.key = parseKey(spec.key);
    // `listen: 'world'`: hears notes played in every room, not just its own, for a
    // phrase too long for one room. `patience`: beats of silence before a phrase
    // in progress is forgotten (0 = never), so a long phrase has to be kept going.
    this.listen = spec.listen === 'world' ? 'world' : 'room';
    this.patience = Math.max(0, spec.patience ?? 0);
    this.lastAt = 0;
    this.progress = 0;
    this.lastHeard = null;
    this.glow = 0;
  }

  // The scale the phrase is wanted in: the room's, or the room's mode on the
  // lock's own tonic.
  wanted(ctx) {
    const m = ctx.room.music;
    if (this.key == null) return m;
    return new MusicalState({ root: this.key, mode: m.mode, bpm: m.bpm, mood: m.mood });
  }

  get spriteKey() { return this.lit ? 'notelock.lit' : 'notelock'; }

  // Progress pips belong on top of whatever art the lock ends up with.
  overlay(c, s, ctx) {
    const p = PALETTE.wing(ctx.room.wing);
    if (this.key != null) {
      // The key it wants, in the corner: a letter is a readout, not art.
      c.fillStyle = p.ink;
      c.font = `bold ${Math.round(s * 0.24)}px ui-monospace, monospace`;
      c.textAlign = 'right'; c.textBaseline = 'top';
      c.fillText(NOTE_NAMES[this.key], s * 0.97, s * 0.02);
    }
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
    const now = ctx.audio.now;
    if (this.patience && this.progress && now - this.lastAt > this.patience * (ctx.beatInterval ?? 0.5)) {
      this.progress = 0;
      this.lastHeard = null;
    }
    this.lastAt = now;

    // Collapse immediate repeats. A tube or a string run often sounds the same
    // note several beats running; the lock is listening for a phrase, not a tremolo.
    if (pc === this.lastHeard) return;
    this.lastHeard = pc;

    const scale = this.wanted(ctx);
    const matches = (i) => {
      const want = scale.getNote(this.sequence[i], 4);
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

  // Interact to hear the hint phrase: eighth notes from the next beat, in the
  // room's tempo, so it can be played back against the metronome.
  onPlayerInteract(ctx) {
    const t0 = ctx.nextGridTime?.(4) ?? ctx.audio.now + 0.05;
    const step = ctx.subInterval ? ctx.subInterval * 2 : 0.28;
    const scale = this.wanted(ctx);
    this.sequence.forEach((deg, i) => {
      ctx.audio.play({
        family: 'woodwind',
        midi: scale.getNote(deg, 4),
        intensity: 0.7,
        when: t0 + i * step,
        heard: false,   // a hint, not an answer: no lock may count it
      });
    });
    ctx.toast(this.key != null ? `Hint phrase, in ${NOTE_NAMES[this.key]}.` : 'Hint phrase.');
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

function parseKey(k) {
  if (k == null || k === '') return null;
  if (typeof k === 'number') return ((k % 12) + 12) % 12;
  const i = NOTE_NAMES.indexOf(String(k).toUpperCase().replace('♯', '#'));
  return i >= 0 ? i : null;
}

// The score gate. Lit once the level's tune has grown to `layers` layers (every
// room solved adds one; src/audio/score.js), and from then on it opens its group.
// The gate on the last room: you cannot reach the end with half a tune.
class ScoreLock extends Doodad {
  constructor(spec, x, y) {
    super(spec, x, y);
    this.family = 'puzzle';
    this.isLock = true;
    this.solid = true;
    this.blocksWave = true;
    this.lit = false;
    this.group = spec.group ?? 'a';
    this.need = Math.max(1, spec.layers ?? 6);
  }

  get spriteKey() { return this.lit ? 'scorelock.lit' : 'scorelock'; }

  have(ctx) { return ctx.progress?.layers?.size ?? 0; }

  onBeat(beat, ctx) {
    if (this.lit || this.have(ctx) < this.need) return;
    this.lit = true;
    ctx.toast('The score is whole enough. The gate gives way.');
    checkGroup(this.group, ctx);
  }

  onWaveEntered(wave) { wave.destroy(); }

  onPlayerInteract(ctx) {
    ctx.toast(this.lit ? 'The gate is open.' : `The gate wants ${this.need} layers of the score. You have ${this.have(ctx)}.`);
    return true;
  }

  overlay(c, s, ctx) {
    c.fillStyle = PALETTE.wing(ctx.room.wing).ink;
    c.font = `bold ${Math.round(s * 0.22)}px ui-monospace, monospace`;
    c.textAlign = 'center'; c.textBaseline = 'bottom';
    c.fillText(`${Math.min(this.have(ctx), this.need)}/${this.need}`, s * 0.5, s * 0.99);
  }

  draw(c, s, ctx) {
    const p = PALETTE.wing(ctx.room.wing);
    c.strokeStyle = this.lit ? p.hot : p.accent;
    c.lineWidth = 2;
    c.strokeRect(s * 0.18, s * 0.12, s * 0.64, s * 0.62);
    for (let i = 0; i < 5; i++) {
      c.beginPath(); c.moveTo(s * 0.24, s * (0.22 + i * 0.1)); c.lineTo(s * 0.76, s * (0.22 + i * 0.1)); c.stroke();
    }
    this.overlay(c, s, ctx);
  }
}
defineDoodad('scorelock', ScoreLock);
