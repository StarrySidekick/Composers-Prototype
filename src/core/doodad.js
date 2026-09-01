// A doodad is "the object on this tile". Walls are doodads. Doors are doodads.
// Instruments (Strumentini) are doodads. Keeping everything uniform is what makes
// the tile-prefab system that produces a wall also produce an oboe (GDD §6.1).

import { FaceAction, localFace, rotate, rotateCW, rotateCCW, reverse } from './direction.js';
import { WaveSource } from './sound-wave.js';

const registry = new Map();

export function defineDoodad(type, cls) {
  cls.type = type;
  registry.set(type, cls);
}

export function createDoodad(spec, x, y) {
  const Cls = registry.get(spec.type);
  if (!Cls) {
    console.warn(`Unknown doodad type "${spec.type}" at ${x},${y}`);
    return null;
  }
  return new Cls(spec, x, y);
}

export function doodadTypes() { return [...registry.keys()]; }

export class Doodad {
  constructor(spec = {}, x = 0, y = 0) {
    this.spec = spec;
    this.x = x; this.y = y;
    this.rot = spec.rot ?? 0;
    this.group = spec.group ?? null;
    this.family = 'structure';   // brass | strings | woodwind | percussion | keys | structure
    this.solid = true;           // blocks the player
    this.blocksWave = true;      // a wave that reaches this tile resolves here
    this.walkable = false;

    // InstrumentBase.holdBeats — park an incoming wave for N beats before
    // resolving it, so a puzzle can be timed against the metronome. 0 = immediate.
    this.holdBeats = spec.holdBeats ?? 0;
    this._heldWave = null;
    this._holdLeft = 0;
  }

  get typeName() { return this.constructor.type; }

  // Which sprite this tile wants from the AssetStore. Sub-classes that look different
  // in different states (an open door, a lit lock) override it. If the store has no
  // image under that key — the normal case — the renderer calls draw() instead.
  get spriteKey() { return this.part ? `${this.typeName}.${this.part}` : this.typeName; }

  // Sprites are authored unrotated and rotated by the renderer, the same way draw()
  // rotates itself. A doodad whose art shouldn't spin returns 0.
  get spriteRot() { return this.rot; }

  // The sealed entry point, matching InstrumentBase.OnWaveEntered: busy-check,
  // melee routing and the beat hold all happen here, and only then does the
  // subclass's onWaveEntered run. SoundWave.step calls this — never override it.
  receiveWave(wave, ctx) {
    if (this._heldWave) { wave.destroy(); return; }   // an instrument mid-hold eats the next wave

    if (wave.state.source === WaveSource.MeleeStrike) {
      this.onMeleeStrike(wave, ctx);
      return;
    }

    if (this.holdBeats <= 0) { this.onWaveEntered(wave, ctx); return; }

    this._heldWave = wave;
    this._holdLeft = this.holdBeats;
    wave.held = true;
  }

  // Ticked once per beat by Game.update, separately from onBeat so that a
  // subclass overriding onBeat can never accidentally strand a held wave.
  tickHold(beat, ctx) {
    if (!this._heldWave) return;
    if (--this._holdLeft > 0) return;
    const w = this._heldWave;
    this._heldWave = null;
    w.held = false;
    if (w.alive) this.onWaveEntered(w, ctx);
  }

  get holding() { return !!this._heldWave; }

  // Default matches SoundWave.MoveRoutine: an unhandled blocking tile eats the wave,
  // a non-blocking tile is traversed.
  onWaveEntered(wave, ctx) {
    if (this.blocksWave) wave.destroy();
  }

  // Asta.StrikeAt handed this tile a non-travelling wave. In Unity only
  // InstrumentBase subclasses see this at all — a wall implements no interface —
  // so here the default is to decline and let the strike fall through to the tile
  // Coda is standing on. Instruments opt in by overriding.
  onMeleeStrike(wave, ctx) { return false; }

  // B button / melee strike, from the tile Coda is facing.
  onPlayerInteract(ctx) { return false; }

  // Player walked onto this tile (only reachable when !solid).
  onPlayerEnter(ctx) {}

  onBeat(beat, ctx) {}

  // Resolve a FaceAction against a wave. Shared by every face-configured instrument.
  applyFaceAction(action, wave, ctx, onPlay) {
    switch (action) {
      case FaceAction.PassThrough:
        wave.pass(); break;
      case FaceAction.Redirect90CW:
        wave.reflect(rotateCW(wave.dir)); break;
      case FaceAction.Redirect90CCW:
        wave.reflect(rotateCCW(wave.dir)); break;
      case FaceAction.Reflect180:
        wave.reflect(reverse(wave.dir)); break;
      case FaceAction.PlayAndPass:
        onPlay?.(wave, ctx); wave.pass(); break;
      case FaceAction.PlayAndAbsorb:
        onPlay?.(wave, ctx); wave.destroy(); break;
      case FaceAction.Block:
      default:
        wave.destroy(); break;
    }
  }

  faceFor(wave) { return localFace(wave.dir, this.rot); }

  // Flood fill across orthogonally adjacent doodads of the same family and type,
  // giving an instrument its length. Longer construction = lower pitch.
  measureLength(room, matchType = true) {
    const seen = new Set();
    const stack = [[this.x, this.y]];
    let count = 0;
    while (stack.length) {
      const [x, y] = stack.pop();
      const k = `${x},${y}`;
      if (seen.has(k)) continue;
      const d = room.doodadAt(x, y);
      if (!d || d.family !== this.family) continue;
      if (matchType && d.typeName !== this.typeName) continue;
      seen.add(k);
      count++;
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    return count;
  }

  // Drawn on top of the sprite when one exists, and by draw() when one doesn't —
  // readouts that a picture can't carry, like a timpani's tuning or a key's degree.
  overlay(c, s, ctx) {}

  // Sub-classes override. `c` is translated so (0,0) is the tile's top-left corner.
  draw(c, s, ctx) {
    c.fillStyle = '#4a4038';
    c.fillRect(0, 0, s, s);
  }

  toJSON() { return { ...this.spec }; }
}

export { FaceAction, rotate };
