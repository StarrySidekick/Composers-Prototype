// The story's pieces: the tiles that join the rooms to everything around them.
//
//   stage   `?`  a story moment. Step on it (or face it and press B, if it is a
//                sign) and the Director plays a scene from story/: a cutscene, a
//                tube run, a boss. With no Director (a test, a bare room) it does
//                nothing. `scene` names the scene, `look` picks the drawing
//                (mark, gate, workshop, tube, sign, door), `reverse` plays a tube
//                run backwards (the way back down a fast-travel pipe), `needs`
//                is a story flag that must be set first, else it says `sealed`.
//                `once`: after its scene has been seen it only says `after`;
//                `again`: after its scene has been seen it plays this one instead
//                (the castle gate's cutscene once, then straight in).
//   npc     `C`  a character. B talks to them; a wave reaching them makes them
//                hum a note of the room's scale and passes on. Who they are and
//                what they say lives in story/outline.json (`cast`), so a line
//                can change without touching a room.
//   tree    `A`  a curl tree, for the Wood. Solid, and a wave that reaches it
//                rustles and stops, like a wall that is alive.
//   water   `~`  a brook or an aqueduct. Coda cannot cross it; sound can, so a
//                wave fired over water rings what is on the far bank.
//
// None of these are Unity classes yet. The stage maps onto a trigger volume that
// loads a Timeline or a scene; the npc onto whatever dialogue system the Unity
// project grows. See docs/MARBLE.md.

import { Doodad, defineDoodad } from '../core/doodad.js';

export const STAGE_LOOKS = ['mark', 'gate', 'workshop', 'tube', 'sign', 'door'];

class Stage extends Doodad {
  constructor(spec, x, y) {
    super(spec, x, y);
    this.family = 'story';
    this.scene = spec.scene ?? null;
    this.look = STAGE_LOOKS.includes(spec.look) ? spec.look : 'mark';
    this.reverse = !!spec.reverse;
    this.needs = spec.needs ?? null;
    this.sealed = spec.sealed ?? 'It will not open yet.';
    this.once = !!spec.once;
    this.after = spec.after ?? null;
    this.again = spec.again ?? null;
    // A sign is read with B and stands in the way like a post; everything else
    // is a place you walk into.
    this.on = spec.on ?? (this.look === 'sign' ? 'interact' : 'enter');
    this.solid = this.on === 'interact';
    this.walkable = !this.solid;
    this.blocksWave = false;
  }

  get spriteKey() { return `stage.${this.look}`; }
  get spriteRot() { return this.look === 'tube' ? this.rot : 0; }

  onWaveEntered(wave) { wave.pass(); }

  onPlayerEnter(ctx) { if (this.on === 'enter') ctx.stage?.(this); }

  onPlayerInteract(ctx) {
    if (this.on !== 'interact') return false;
    ctx.stage?.(this);
    return true;
  }

  draw(c, s) {
    c.strokeStyle = '#fff';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(s / 2, s / 2, s * 0.3, 0, Math.PI * 1.7);
    c.stroke();
    c.fillStyle = '#fff';
    c.font = `bold ${Math.round(s * 0.3)}px ui-monospace, monospace`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(this.look === 'tube' ? '◎' : '?', s / 2, s / 2 + 1);
  }
}
defineDoodad('stage', Stage);

class Npc extends Doodad {
  constructor(spec, x, y) {
    super(spec, x, y);
    this.family = 'story';
    this.who = spec.who ?? 'fermata';
    this.degree = spec.degree ?? 4;
    this.solid = true;
    this.blocksWave = false;
    this.said = 0;            // which line is next; the Director advances it
  }

  get spriteKey() { return `npc.${this.who}`; }
  get spriteRot() { return 0; }

  // A character hums the note a wave brings them, in the room's scale, and lets
  // it carry on. Unheard by locks: a character must never solve a puzzle by
  // accident (a puzzle that wants them to will say so).
  onWaveEntered(wave, ctx) {
    ctx.play?.({ family: 'voice', midi: ctx.room.music.getNote(this.degree, 5), intensity: 0.35, heard: false });
    wave.pass();
  }

  onPlayerInteract(ctx) {
    ctx.talk?.(this);
    return true;
  }

  draw(c, s) {
    c.strokeStyle = '#fff';
    c.lineWidth = 2;
    c.beginPath(); c.arc(s / 2, s * 0.36, s * 0.16, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.moveTo(s * 0.3, s * 0.9); c.lineTo(s / 2, s * 0.52); c.lineTo(s * 0.7, s * 0.9); c.stroke();
  }
}
defineDoodad('npc', Npc);

class Tree extends Doodad {
  constructor(spec, x, y) {
    super(spec, x, y);
    this.family = 'structure';
    this.solid = true;
    this.blocksWave = true;
  }

  get spriteRot() { return 0; }

  // A wave into the leaves: a soft rustle (a hat, barely), and it is spent.
  onWaveEntered(wave, ctx) {
    ctx.play?.({ family: 'percussion', kind: 'hat', midi: ctx.room.music.getNote(0, 6), intensity: 0.12, heard: false });
    wave.destroy();
  }

  draw(c, s) {
    c.strokeStyle = '#fff';
    c.lineWidth = 2;
    c.beginPath(); c.moveTo(s / 2, s * 0.92); c.lineTo(s / 2, s * 0.5); c.stroke();
    c.beginPath(); c.arc(s / 2, s * 0.36, s * 0.24, 0, Math.PI * 2); c.stroke();
  }
}
defineDoodad('tree', Tree);

class Water extends Doodad {
  constructor(spec, x, y) {
    super(spec, x, y);
    this.family = 'structure';
    this.solid = true;        // Coda cannot wade it
    this.blocksWave = false;  // sound carries over water
  }

  get spriteRot() { return this.rot; }

  onWaveEntered(wave) { wave.pass(); }

  draw(c, s) {
    c.strokeStyle = '#fff';
    c.lineWidth = 2;
    for (const y of [0.35, 0.65]) {
      c.beginPath();
      for (let i = 0; i <= 8; i++) {
        const x = (i / 8) * s, yy = s * y + Math.sin(i * 1.6) * s * 0.06;
        i ? c.lineTo(x, yy) : c.moveTo(x, yy);
      }
      c.stroke();
    }
  }
}
defineDoodad('water', Water);
