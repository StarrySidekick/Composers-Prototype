// Horns / tubes. Modular tubing: straight, elbow, tee, cross, valve, slide, mute,
// mouthpiece, flare. Port target: BrassTube.cs — same face-action table, same
// "direction of travel in local space" face-naming convention.
//
// Two things a tube knows that a wall doesn't:
//   1. its OPEN EDGES, which is how a run of tubing works out that it is one horn
//      rather than several that happen to touch;
//   2. its LENGTH, which is its pitch. Longer horn, lower note — a slide pulled out
//      lengthens the run exactly as it does on a trombone.

import { Doodad, defineDoodad } from '../core/doodad.js';
import { FaceAction, DIR, dirName, rotate } from '../core/direction.js';
import { PALETTE } from '../render/palette.js';

const B = FaceAction.Block;
const P = FaceAction.PassThrough;

// Face tables are in LOCAL space; rotate the doodad to orient it in the world.
// `edges` are the tile EDGES the tubing is open at, also local — that is what
// decides whether the neighbour is part of the same horn.
const PARTS = {
  straight: {
    faces: { top: B, bottom: B, left: P, right: P },
    edges: ['left', 'right'],
  },
  // elbow at rot 0 joins the LEFT edge to the BOTTOM edge (a "┐").
  // A wave travelling local-right entered from the left; CW turns it downward.
  // Its reverse — travelling local-up out of the bottom — is the `top` face.
  elbow: {
    faces: { top: FaceAction.Redirect90CCW, bottom: B, left: B, right: FaceAction.Redirect90CW },
    edges: ['left', 'bottom'],
  },
  // "┬" — a through channel plus a stem out of the bottom. The branch always leaves
  // through the stem, whichever way the wave was going when it arrived.
  tee: {
    faces: { top: B, bottom: B, left: 'split', right: 'split' },
    edges: ['left', 'right', 'bottom'],
  },
  // "┼" — two independent channels. Waves cross without meeting, which is the only
  // way to get a circuit past itself without a tee's halving.
  //
  // It has NO open edges on purpose: a crossing is a bridge, not a join. It carries a
  // wave over and adds nothing to the length of either horn, so the two runs it
  // crosses stay two instruments with two pitches.
  cross: {
    faces: { top: P, bottom: P, left: P, right: P },
    edges: [],
  },
  mouthpiece: {
    faces: { top: B, bottom: B, left: B, right: P },
    edges: ['right'],
  },
  // The bell. Sounds the horn and swallows the wave. Only its throat (left) is
  // tubing — the mouth is open air, so it terminates the run.
  flare: {
    faces: { top: B, bottom: B, left: FaceAction.PlayAndAbsorb, right: FaceAction.PlayAndAbsorb },
    edges: ['left'],
  },
  // Compress it to change the direction of the flow of sound.
  valve: {
    faces: { top: FaceAction.Redirect90CCW, bottom: B, left: B, right: FaceAction.Redirect90CW },
    edges: ['left', 'bottom'],
  },
  // Trombone slide: straight tubing whose length you can pull out. Every position
  // adds a tile of length to the whole run, so it detunes the horn downward.
  slide: {
    faces: { top: B, bottom: B, left: P, right: P },
    edges: ['left', 'right'],
  },
  // A mute in the tube: the wave keeps going but arrives quieter and buzzier, and
  // the horn it feeds sounds muted.
  mute: {
    faces: { top: B, bottom: B, left: 'mute', right: 'mute' },
    edges: ['left', 'right'],
  },
};

export const BRASS_PARTS = Object.keys(PARTS);

// Edges are named like faces (top/right/bottom/left) but mean the tile EDGE, not a
// direction of travel — hence the translation from direction.js's up/down naming.
const EDGE_DIR = { top: DIR.up, right: DIR.right, bottom: DIR.down, left: DIR.left };
const EDGE_OF_DIR = { up: 'top', right: 'right', down: 'bottom', left: 'left' };
const OPPOSITE = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

class BrassTube extends Doodad {
  constructor(spec, x, y) {
    super(spec, x, y);
    this.family = 'brass';
    this.part = PARTS[spec.part] ? spec.part : 'straight';
    const preset = PARTS[this.part];
    this.faces = { ...preset.faces, ...(spec.faces ?? {}) };
    this.localEdges = spec.edges ?? preset.edges;
    this.solid = true;        // Coda can't walk through tubing
    this.blocksWave = true;   // every wave that reaches the tile resolves here
    this.isMouthpiece = this.part === 'mouthpiece';
    this.extend = clampExtend(spec.extend ?? 0);      // slide position, in tiles
    this.muted = this.part === 'mute' ? (spec.muted !== false) : false;
    this.flash = 0;
  }

  get spriteKey() {
    if (this.part === 'slide') return `brass.slide.${this.extend}`;
    if (this.part === 'mute') return this.muted ? 'brass.mute' : 'brass.mute.open';
    return `brass.${this.part}`;
  }

  // Local edges rotated into the world.
  get worldEdges() {
    return this.localEdges.map(e => EDGE_OF_DIR[dirName(rotate(EDGE_DIR[e], this.rot))]);
  }

  hasEdge(name) { return this.worldEdges.includes(name); }

  // The stem of a tee, in world space.
  get branchDir() { return rotate(DIR.down, this.rot); }

  // How much length this tile contributes to its horn.
  get lengthContribution() { return 1 + (this.part === 'slide' ? this.extend : 0); }

  // Flood fill along tubing that is actually JOINED — two tubes only belong to the
  // same horn if their facing edges are both open. Adjacent-but-unconnected runs stay
  // separate instruments, which is what makes a dense room of tubing readable.
  traceHorn(room) {
    const seen = new Set();
    const stack = [this];
    let length = 0;
    let muted = false;
    while (stack.length) {
      const d = stack.pop();
      const k = `${d.x},${d.y}`;
      if (seen.has(k)) continue;
      seen.add(k);
      length += d.lengthContribution;
      if (d.part === 'mute' && d.muted) muted = true;
      for (const edge of d.worldEdges) {
        const v = EDGE_DIR[edge];
        const n = room.doodadAt(d.x + v.x, d.y + v.y);
        if (!n || n.family !== 'brass') continue;
        if (!n.hasEdge(OPPOSITE[edge])) continue;
        if (!seen.has(`${n.x},${n.y}`)) stack.push(n);
      }
    }
    return { length, muted, tiles: seen };
  }

  // Longer connected horn = lower note. Every pitch is snapped to the room's scale,
  // so there is no such thing as a wrong-sounding tube.
  //
  // The degree is allowed to go negative — getNote wraps that into lower octaves, so
  // a horn does not stop getting lower once it passes seven tiles. Without that, every
  // long circuit sounded the same tonic and a slide on one was inaudible. The floor is
  // two octaves down, which is about where a tuba stops being a pitch.
  degreeFor(length) { return Math.max(-14, 7 - length); }

  pitchFor(ctx) {
    return ctx.room.music.getNote(this.degreeFor(this.traceHorn(ctx.room).length), 4);
  }

  playNote(wave, ctx) {
    this.flash = 1;
    const horn = this.traceHorn(ctx.room);
    ctx.play({
      family: 'brass',
      midi: ctx.room.music.getNote(this.degreeFor(horn.length), 4),
      intensity: (wave?.state.intensity ?? 1) * (horn.muted ? 0.55 : 1),
      modulation: horn.muted ? 1 : (wave?.state.modulation ?? 0),
    });
  }

  onWaveEntered(wave, ctx) {
    const action = this.faces[this.faceFor(wave)];

    if (action === 'split') {
      // T tube: divides the wave and adds an output. The branch leaves through the
      // stem, so a rotated tee branches the way it looks like it should.
      this.flash = 1;
      const s = wave.state.clone();
      s.intensity = Math.max(0.15, s.intensity * 0.5);
      wave.applyState(s);

      ctx.spawnWave(this.x, this.y, this.branchDir, s.clone());
      this.playNote(wave, ctx);
      wave.pass();
      return;
    }

    if (action === 'mute') {
      this.flash = 0.6;
      if (this.muted) {
        const s = wave.state.clone();
        s.intensity = Math.max(0.12, s.intensity * 0.6);
        s.modulation = Math.min(1, s.modulation + 0.5);
        wave.applyState(s);
        ctx.play({ family: 'brass', midi: this.pitchFor(ctx), intensity: 0.14, modulation: 1 });
      }
      wave.pass();
      return;
    }

    if (action === P || action === FaceAction.Redirect90CW || action === FaceAction.Redirect90CCW) {
      this.flash = 0.6;
    }

    this.applyFaceAction(action, wave, ctx, (w, c) => this.playNote(w, c));
  }

  onPlayerInteract(ctx) {
    if (this.part === 'valve') {
      // Valve: compress it to change the direction of the flow of sound.
      this.rot = (this.rot + 90) % 360;
      ctx.play({ family: 'percussion', kind: 'hat', midi: 70, intensity: 0.4 });
      ctx.toast('Valve compressed.');
      return true;
    }
    if (this.part === 'slide') {
      // Pull the slide. Longer horn, lower horn — audition it as you go.
      this.extend = clampExtend((this.extend + 1) % 4);
      ctx.play({ family: 'brass', midi: this.pitchFor(ctx), intensity: 0.5, modulation: 0.2 });
      ctx.toast(`Slide ${this.extend === 0 ? 'closed' : `out ${this.extend}`}.`);
      return true;
    }
    if (this.part === 'mute') {
      this.muted = !this.muted;
      ctx.play({ family: 'percussion', kind: 'tom', midi: 58, intensity: 0.35 });
      ctx.toast(this.muted ? 'Mute seated.' : 'Mute pulled.');
      return true;
    }
    if (!this.isMouthpiece) return false;
    // Blowing the mouthpiece launches a wave into the tube.
    this.flash = 1;
    ctx.spawnWaveFromDoodad(this, ctx.player.dir);
    return true;
  }

  toJSON() {
    const j = { ...this.spec };
    if (this.part === 'slide') j.extend = this.extend;
    return j;
  }

  draw(c, s, ctx) {
    const p = PALETTE.wing('brass');
    c.save();
    c.translate(s / 2, s / 2);
    c.rotate((this.rot * Math.PI) / 180);
    c.translate(-s / 2, -s / 2);

    const w = s * 0.42;
    const lit = this.flash > 0.02;
    c.strokeStyle = lit ? p.hot : p.metal;
    c.lineWidth = w;
    c.lineCap = 'butt';

    c.beginPath();
    switch (this.part) {
      case 'straight':
      case 'mouthpiece':
      case 'slide':
      case 'mute':
        c.moveTo(0, s / 2); c.lineTo(s, s / 2);
        break;
      case 'elbow':
      case 'valve':
        c.moveTo(0, s / 2); c.lineTo(s / 2, s / 2); c.lineTo(s / 2, s);
        break;
      case 'tee':
        c.moveTo(0, s / 2); c.lineTo(s, s / 2); c.moveTo(s / 2, s / 2); c.lineTo(s / 2, s);
        break;
      case 'cross':
        c.moveTo(0, s / 2); c.lineTo(s, s / 2); c.moveTo(s / 2, 0); c.lineTo(s / 2, s);
        break;
      case 'flare':
        c.moveTo(0, s / 2); c.lineTo(s * 0.55, s / 2);
        break;
    }
    c.stroke();

    c.strokeStyle = p.metalHi;
    c.lineWidth = 1.5;
    if (this.part === 'flare') {
      c.beginPath();
      c.moveTo(s * 0.55, s * 0.12);
      c.lineTo(s * 0.95, s * 0.32);
      c.lineTo(s * 0.95, s * 0.68);
      c.lineTo(s * 0.55, s * 0.88);
      c.closePath();
      c.fillStyle = lit ? p.hot : p.metal;
      c.fill(); c.stroke();
    }
    if (this.part === 'mouthpiece') {
      c.beginPath();
      c.arc(s * 0.14, s * 0.5, s * 0.2, 0, Math.PI * 2);
      c.fillStyle = lit ? p.hot : p.metalHi;
      c.fill();
    }
    if (this.part === 'valve') {
      c.beginPath();
      c.arc(s * 0.5, s * 0.5, s * 0.14, 0, Math.PI * 2);
      c.fillStyle = p.accent;
      c.fill();
    }
    if (this.part === 'cross') {
      // A visible bridge so it reads as "over/under", not "junction".
      c.strokeStyle = p.parchment;
      c.lineWidth = Math.max(1.5, s * 0.05);
      c.beginPath();
      c.moveTo(s * 0.5 - w * 0.5, s * 0.34); c.lineTo(s * 0.5 + w * 0.5, s * 0.34);
      c.moveTo(s * 0.5 - w * 0.5, s * 0.66); c.lineTo(s * 0.5 + w * 0.5, s * 0.66);
      c.stroke();
    }
    if (this.part === 'slide') {
      // The U of the slide, drawn further out the more it is pulled.
      const out = s * (0.16 + this.extend * 0.2);
      c.strokeStyle = lit ? p.hot : p.metalHi;
      c.lineWidth = Math.max(2, s * 0.11);
      c.beginPath();
      c.moveTo(s * 0.5, s * 0.32); c.lineTo(s * 0.5 + out, s * 0.32);
      c.moveTo(s * 0.5, s * 0.68); c.lineTo(s * 0.5 + out, s * 0.68);
      c.moveTo(s * 0.5 + out, s * 0.32); c.lineTo(s * 0.5 + out, s * 0.68);
      c.stroke();
    }
    if (this.part === 'mute') {
      c.beginPath();
      c.moveTo(s * 0.38, s * 0.5 - w * 0.55);
      c.lineTo(s * 0.72, s * 0.5 - w * 0.2);
      c.lineTo(s * 0.72, s * 0.5 + w * 0.2);
      c.lineTo(s * 0.38, s * 0.5 + w * 0.55);
      c.closePath();
      c.fillStyle = this.muted ? p.wood : p.parchment2;
      c.fill();
      c.strokeStyle = p.ink;
      c.lineWidth = 1.5;
      c.stroke();
    }
    c.restore();
    this.flash *= 0.86;
  }
}
defineDoodad('brass', BrassTube);

function clampExtend(v) { return Math.max(0, Math.min(3, Math.round(Number(v) || 0))); }
