// The Unresolved Chord: the first boss. Built from the level's own mechanics, so the
// fight is an exam on what the dungeon taught, the way a Zelda boss uses the
// dungeon's item. Scoped in docs/SCOPE-ENEMIES-AND-BOSS.md.
//
// It stands on 3 x 3 tiles: one `boss` in the middle (it draws the whole figure,
// SPAN in src/art/protocol.js) and eight `bosspart`s around it, solid, swallowing
// waves. It cannot be hurt, only resolved. Three voices, one per phase:
//
//   1  ECHO    it calls a phrase every two bars (sol mi do); play it back to it.
//              The arena has piano keys to walk. Mode: phrygian, tense.
//   2  SWARM   it splits into four dissonants that hunt Coda; resolve all four
//              with waves. Mode: aeolian, sad.
//   3  CHORD   it wants a chord: three DIFFERENT notes sounding within one beat.
//              Three horns of different lengths stand round one spot; three notes
//              at once means three waves in the air at once, so it takes both
//              Overtones, and since the horns are different lengths the attacks
//              have to be staggered, longest first, for the bells to land
//              together. Mode: dorian, reflective.
//
// Then it resolves into the room's own tonic, in ionian: the tune's last
// layer is earned, the figure is gone, and an exit stands where it was. The save
// remembers (its tiles are recorded as taken, the exit as placed).

import { Doodad, defineDoodad, createDoodad } from '../core/doodad.js';

const CALL = [4, 2, 0];                 // sol mi do, the phrase it calls in phase 1
const SPAWNS = [[2, 4], [10, 4], [2, 7], [10, 7]];
const MOODS = { 1: 'tense', 2: 'sad', 3: 'reflective', 4: 'content' };

class Boss extends Doodad {
  constructor(spec, x, y) {
    super(spec, x, y);
    this.family = 'boss';
    this.solid = true;
    this.blocksWave = true;
    this.span = 3;
    this.phase = 1;
    this.heard = 0;          // phase 1: how much of the call has come back
    this.lastPc = null;
    this.lastAt = 0;
    this.notes = [];         // phase 3: { pc, when } of recent notes
    this.spawned = false;
    this.flash = 0;
    this.listen = 'room';
  }

  // Art per voice still sour: boss.3, boss.2, boss.1.
  get spriteKey() { return `boss.${Math.max(1, 4 - this.phase)}`; }
  get spriteRot() { return 0; }
  get voices() { return Math.max(0, 4 - this.phase); }

  // ---- the call ----------------------------------------------------------------

  call(ctx) {
    const t0 = ctx.nextGridTime(4);
    const step = ctx.subInterval * 2;
    CALL.forEach((deg, i) => ctx.audio.play({
      family: 'brass', midi: ctx.room.music.getNote(deg, 3), intensity: 0.8,
      when: t0 + i * step, heard: false, room: ctx.room,
    }));
    ctx.audio.play({ family: 'sour', midi: ctx.room.music.getNote(1, 3), intensity: 0.35, when: t0, heard: false, room: ctx.room });
    this.flash = 1;
  }

  onPlayerInteract(ctx) {
    if (this.phase === 1) { this.call(ctx); ctx.toast('It calls: sol, mi, do. Answer it.'); }
    else if (this.phase === 2) ctx.toast('Resolve the dissonance it broke into.');
    else if (this.phase === 3) ctx.toast('It wants a chord: three different notes at once.');
    return true;
  }

  onWaveEntered(wave, ctx) {
    wave.destroy();
    ctx.play({ family: 'sour', midi: ctx.room.music.getNote(1, 2), intensity: 0.4 });
    this.flash = 0.6;
  }

  onBeat(beat, ctx) {
    if (this.phase === 1 && beat % 8 === 0) this.call(ctx);
    if (this.phase === 2) {
      if (!this.spawned) this.spawn(ctx);
      else if (!ctx.room.list.some(d => d.typeName === 'dissonant')) this.advance(ctx);
    }
  }

  // ---- listening -----------------------------------------------------------------

  hearNote(midi, ctx, opts) {
    const pc = ((midi % 12) + 12) % 12;
    const m = ctx.room.music;
    if (this.phase === 1) {
      // Like a note lock: the phrase in order, repeats collapsed, forgotten after
      // two bars of silence.
      const now = ctx.audio.now;
      if (this.heard && now - this.lastAt > 8 * (ctx.beatInterval ?? 0.5)) { this.heard = 0; this.lastPc = null; }
      this.lastAt = now;
      if (pc === this.lastPc) return;
      this.lastPc = pc;
      const want = (i) => (((m.getNote(CALL[i], 4) - pc) % 12) + 12) % 12 === 0;
      if (want(this.heard)) {
        this.heard++;
        this.flash = 1;
        if (this.heard >= CALL.length) this.advance(ctx);
      } else this.heard = want(0) ? 1 : 0;
      return;
    }
    if (this.phase === 3) {
      if (opts?.key) return;                 // the Key's shot is not an instrument
      const when = opts?.when ?? ctx.audio.now;
      this.notes.push({ pc, when });
      this.notes = this.notes.filter(n => when - n.when < 2);
      // Three different notes within one beat: no more than four sixteenths from
      // first to last, which leaves a human thumb a sixteenth or two to spare.
      const beat = (ctx.subInterval ?? 0.125) * 4.5;
      const near = this.notes.filter(n => Math.abs(n.when - when) <= beat);
      if (new Set(near.map(n => n.pc)).size >= 3) this.advance(ctx);
    }
  }

  // ---- phases ---------------------------------------------------------------------

  spawn(ctx) {
    this.spawned = true;
    for (const [x, y] of SPAWNS) {
      if (ctx.room.doodadAt(x, y)) continue;
      const d = createDoodad({ type: 'dissonant', path: 'seek', every: 2 }, x, y);
      if (d) ctx.room.setDoodad(x, y, d);
    }
    ctx.toast('The chord splits into dissonance!');
  }

  advance(ctx) {
    this.phase++;
    this.flash = 1;
    this.heard = 0;
    this.notes = [];
    ctx.room.music.setMood(MOODS[this.phase]);
    // A voice resolves: the chord it was, settling a step, in the new mode.
    const t0 = ctx.nextGridTime(2), step = ctx.subInterval * 2;
    [0, 2, 4, 7].forEach((deg, i) => ctx.audio.play({
      family: 'keys', midi: ctx.room.music.getNote(deg, 4), intensity: 0.6, when: t0 + i * step, heard: false, room: ctx.room,
    }));
    if (this.phase === 2) ctx.toast('One voice resolves. The others fight.');
    if (this.phase === 3) ctx.toast('Two voices left in one. It wants a chord: three notes at once.');
    if (this.phase >= 4) this.resolve(ctx);
  }

  // The last voice resolves: the figure goes, an exit stands where it was.
  resolve(ctx) {
    const room = ctx.room, p = ctx.progress;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = this.x + dx, y = this.y + dy;
      room.setDoodad(x, y, null);
      p?.emptied(room.id, x, y);
    }
    const exit = createDoodad({ type: 'exit' }, this.x, this.y);
    room.setDoodad(this.x, this.y, exit);
    p?.put(room.id, this.x, this.y, { type: 'exit' });
    ctx.game?.unlockLayers?.(room.id);
    ctx.game?.save?.();
    ctx.toast('The chord resolves.');
  }

  // ---- drawing (until there is art: three stacked heads, sour or calm) ----------

  draw(c, s) {
    const S = s * 3;
    c.save();
    c.translate(-s, -s);
    c.strokeStyle = '#fff';
    c.fillStyle = '#fff';
    c.lineWidth = Math.max(2, s * 0.08);
    c.beginPath(); c.moveTo(S * 0.68, S * 0.9); c.lineTo(S * 0.68, S * 0.08); c.stroke();
    for (let i = 0; i < 3; i++) {
      const sour = i >= this.phase - 1;            // the bottom voice resolves first
      const cy = S * (0.78 - i * 0.25), cx = S * 0.5;
      c.beginPath();
      if (sour) {
        for (let k = 0; k <= 10; k++) {
          const a = (k / 10) * Math.PI * 2, r = (k % 2 ? 0.15 : 0.12) * S;
          c.lineTo(cx + Math.cos(a) * r * 1.3, cy + Math.sin(a) * r * 0.85);
        }
      } else c.ellipse(cx, cy, S * 0.16, S * 0.1, -0.35, 0, Math.PI * 2);
      c.closePath(); c.stroke();
      c.fillRect(cx - S * 0.06, cy - S * 0.03, S * 0.025, S * 0.025);
      c.fillRect(cx + S * 0.03, cy - S * 0.03, S * 0.03, S * 0.03);
    }
    c.restore();
    this.flash *= 0.9;
  }
}
defineDoodad('boss', Boss);

// The rest of the figure: solid, swallowing waves, nothing to draw (the boss
// draws over it). B on any part speaks to the boss.
class BossPart extends Doodad {
  constructor(spec, x, y) {
    super(spec, x, y);
    this.family = 'boss';
    this.solid = true;
    this.blocksWave = true;
  }
  get spriteKey() { return 'bosspart'; }
  boss(room) { return room.list.find(d => d.typeName === 'boss'); }
  onWaveEntered(wave, ctx) { const b = this.boss(ctx.room); if (b) b.onWaveEntered(wave, ctx); else wave.destroy(); }
  onPlayerInteract(ctx) { return this.boss(ctx.room)?.onPlayerInteract(ctx) ?? false; }
  draw() {}
}
defineDoodad('bosspart', BossPart);

export { CALL as BOSS_CALL, SPAWNS as BOSS_SPAWNS };
