// Horns / tubes. Modular tubing: straight, elbow, tee, valve, mouthpiece, flare.
// Port target: BrassTube.cs — same face-action table, same "direction of travel in
// local space" face-naming convention.

import { Doodad, defineDoodad } from '../core/doodad.js';
import { FaceAction, rotateCW, rotateCCW } from '../core/direction.js';
import { PALETTE } from '../render/palette.js';

const B = FaceAction.Block;

// Face tables are in LOCAL space; rotate the doodad to orient it in the world.
const PARTS = {
  straight:   { top: B, bottom: B, left: FaceAction.PassThrough, right: FaceAction.PassThrough },
  // elbow at rot 0 joins the LEFT edge to the BOTTOM edge (a "┐").
  // A wave travelling local-right entered from the left; CW turns it downward.
  // Its reverse — travelling local-up out of the bottom — is the `top` face.
  elbow:      { top: FaceAction.Redirect90CCW, bottom: B, left: B, right: FaceAction.Redirect90CW },
  tee:        { top: B, bottom: B, left: 'split', right: 'split' },
  mouthpiece: { top: B, bottom: B, left: B, right: FaceAction.PassThrough },
  flare:      { top: B, bottom: B, left: FaceAction.PlayAndAbsorb, right: FaceAction.PlayAndAbsorb },
  valve:      { top: FaceAction.Redirect90CCW, bottom: B, left: B, right: FaceAction.Redirect90CW },
};

class BrassTube extends Doodad {
  constructor(spec, x, y) {
    super(spec, x, y);
    this.family = 'brass';
    this.part = spec.part ?? 'straight';
    this.faces = { ...(PARTS[this.part] ?? PARTS.straight), ...(spec.faces ?? {}) };
    this.solid = true;        // Coda can't walk through tubing
    this.blocksWave = true;   // every wave that reaches the tile resolves here
    this.isMouthpiece = this.part === 'mouthpiece';
    this.flash = 0;
  }

  // Longer connected tube = lower note. Every pitch is snapped to the room's scale,
  // so there is no such thing as a wrong-sounding tube.
  pitchFor(ctx) {
    const len = this.measureLength(ctx.room, false);
    const degree = Math.max(0, 7 - Math.min(len, 8));
    return ctx.room.music.getNote(degree, 4);
  }

  playNote(wave, ctx) {
    this.flash = 1;
    ctx.play({
      family: 'brass',
      midi: this.pitchFor(ctx),
      intensity: wave?.state.intensity ?? 1,
      modulation: wave?.state.modulation ?? 0,
    });
  }

  onWaveEntered(wave, ctx) {
    const action = this.faces[this.faceFor(wave)];

    if (action === 'split') {
      // T tube: divides the wave, adds an output (demo inventory).
      this.flash = 1;
      const s = wave.state.clone();
      s.intensity = Math.max(0.15, s.intensity * 0.5);
      wave.applyState(s);

      const branch = s.clone();
      ctx.spawnWave(this.x, this.y, rotateCW(wave.dir), branch);
      this.playNote(wave, ctx);
      wave.pass();
      return;
    }

    if (action === FaceAction.PassThrough || action === FaceAction.Redirect90CW ||
        action === FaceAction.Redirect90CCW) {
      this.flash = 0.6;
    }

    this.applyFaceAction(action, wave, ctx, (w, c) => this.playNote(w, c));
  }

  onPlayerInteract(ctx) {
    if (this.part === 'valve') {
      // Valve: compress it to change the direction of the flow of sound.
      this.rot = (this.rot + 90) % 360;
      ctx.play({ family: 'percussion', midi: 70, intensity: 0.4, modulation: 1 });
      ctx.toast('Valve compressed.');
      return true;
    }
    if (!this.isMouthpiece) return false;
    // Blowing the mouthpiece launches a wave into the tube.
    this.flash = 1;
    ctx.spawnWaveFromDoodad(this, ctx.player.dir);
    return true;
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
        c.moveTo(0, s / 2); c.lineTo(s, s / 2);
        break;
      case 'elbow':
      case 'valve':
        c.moveTo(0, s / 2); c.lineTo(s / 2, s / 2); c.lineTo(s / 2, s);
        break;
      case 'tee':
        c.moveTo(0, s / 2); c.lineTo(s, s / 2); c.moveTo(s / 2, s / 2); c.lineTo(s / 2, s);
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
    c.restore();
    this.flash *= 0.86;
  }
}
defineDoodad('brass', BrassTube);
