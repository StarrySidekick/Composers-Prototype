// The blank-slate single-tile instrument. Port target: Strumentino.cs — the prefab
// every new Strumentino in the Unity project is duplicated from.
//
// Each face carries two independent behaviours: one for a sound wave entering it
// (FaceAction) and one for Coda walking into it (PlayerFaceAction). That pairing
// is the whole mechanic — a tile can pass waves but block Coda, or the reverse.
//
// Registration layer, as in InstrumentBase:
//   object — blocks Coda unless a player face says otherwise (tubes, drums)
//   floor  — Coda walks over it and step events still fire (piano keys, plates)

import { Doodad, defineDoodad } from '../core/doodad.js';
import { FaceAction, PlayerFaceAction, localFace } from '../core/direction.js';
import { PALETTE } from '../render/palette.js';

const ALL = ['top', 'right', 'bottom', 'left'];

function faceTable(spec, fallback) {
  const t = {};
  for (const f of ALL) t[f] = spec?.[f] ?? fallback;
  return t;
}

class Strumentino extends Doodad {
  constructor(spec, x, y) {
    super(spec, x, y);
    this.family = spec.family ?? 'brass';

    this.faces = faceTable(spec.faces, FaceAction.PassThrough);
    this.playerFaces = faceTable(spec.playerFaces, PlayerFaceAction.Block);

    // Unity stores a fixed MIDI note; here it is a scale degree, because every
    // pitch in this harness is snapped to the room's key via MusicalState.getNote.
    this.useWavePitch = spec.useWavePitch !== false;
    this.degree = spec.degree ?? 0;
    this.octave = spec.octave ?? 4;

    const layer = spec.layer ?? 'object';
    this.solid = layer !== 'floor';
    this.walkable = !this.solid;
    this.blocksWave = true;
    this.flash = 0;
  }

  // One slot for the blank tile; its face configuration is a readout, not art,
  // so it is painted by overlay() on top of whatever sprite lands here.
  get spriteKey() { return 'strumentino'; }

  pitchFor(wave, ctx) {
    if (this.useWavePitch && wave?.state?.pitch != null) return wave.state.pitch;
    return ctx.room.music.getNote(this.degree, this.octave);
  }

  playNote(wave, ctx) {
    this.flash = 1;
    const midi = this.pitchFor(wave, ctx);
    if (wave) {
      const s = wave.state.clone();
      s.pitch = midi;
      wave.applyState(s);
    }
    ctx.play({ family: this.family, midi, intensity: wave?.state.intensity ?? 1 });
  }

  onWaveEntered(wave, ctx) {
    const action = this.faces[this.faceFor(wave)];
    if (action !== FaceAction.Block) this.flash = Math.max(this.flash, 0.6);
    this.applyFaceAction(action, wave, ctx, (w, c) => this.playNote(w, c));
  }

  onMeleeStrike(wave, ctx) {
    if (this.faces[this.faceFor(wave)] === FaceAction.Block) return false;
    this.playNote(wave, ctx);
    return true;
  }

  // ── IPlayerFaceInteractable ────────────────────────────────────────────

  canPlayerEnterFrom(dir) {
    return this.playerFaces[localFace(dir, this.rot)] !== PlayerFaceAction.Block;
  }

  onPlayerEnter(ctx, dir) {
    if (!dir) return;
    if (this.playerFaces[localFace(dir, this.rot)] === PlayerFaceAction.PlayNote) {
      this.playNote(null, ctx);
    }
  }

  // ── art ────────────────────────────────────────────────────────────────

  // Which faces do what. State, not art — so it is drawn over a sprite as well as
  // by draw(), the same way a timpani's tuning is.
  overlay(c, s, ctx) {
    const p = PALETTE.wing(ctx.room.wing);
    const at = { top: [0.5, 0.16], right: [0.84, 0.5], bottom: [0.5, 0.84], left: [0.16, 0.5] };
    for (const f of ALL) {
      const a = this.faces[f];
      if (a === FaceAction.Block) continue;
      const [fx, fy] = at[f];
      c.beginPath();
      c.arc(s * fx, s * fy, s * 0.06, 0, Math.PI * 2);
      c.fillStyle = (a === FaceAction.PlayAndAbsorb || a === FaceAction.PlayAndPass)
        ? p.hot : p.accent;
      c.fill();
    }
    this.flash *= 0.86;
  }

  draw(c, s, ctx) {
    const p = PALETTE.wing(ctx.room.wing);
    c.fillStyle = this.flash > 0.02 ? p.hot : p.stone;
    c.fillRect(s * 0.14, s * 0.14, s * 0.72, s * 0.72);
    c.strokeStyle = p.metal;
    c.lineWidth = 2;
    c.strokeRect(s * 0.14, s * 0.14, s * 0.72, s * 0.72);
    this.overlay(c, s, ctx);
  }
}
defineDoodad('strumentino', Strumentino);
