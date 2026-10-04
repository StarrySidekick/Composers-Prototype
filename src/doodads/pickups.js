// Things to find. Walk over one and it is yours for the rest of the game
// (src/core/progress.js remembers, so it never comes back).
//
//   overtone   the Key can sound one more wave at once. An overtone is the higher
//              pitch a vibrating string or column of air sounds above its
//              fundamental: more voices out of one instrument.
//   burin      an engraver's tool, the one that cut music into printing plates. With
//              it Coda can cut certain instruments free (drums, the reed), carry
//              them in the satchel, and set them down elsewhere (L to lift or place,
//              R to turn the one in hand).

import { Doodad, defineDoodad } from '../core/doodad.js';

export const ITEMS = {
  overtone: {
    name: 'an Overtone',
    text: 'The Key can sound one more wave at once.',
  },
  burin: {
    name: 'the Burin',
    text: 'An engraver\'s tool, for cutting instruments free. Face a drum or a reed and press L (Q on a keyboard): it goes into your satchel. L again sets it down in front of you; R (Tab) turns it in your hand. The L button says when it can. Try the hi-hat just below you.',
  },
};

class Pickup extends Doodad {
  constructor(spec, x, y) {
    super(spec, x, y);
    this.family = 'item';
    this.item = ITEMS[spec.item] ? spec.item : 'overtone';
    this.solid = false;
    this.blocksWave = false;
    this.walkable = true;
    this.bob = Math.random() * 6;
  }

  get spriteKey() { return `pickup.${this.item}`; }

  onWaveEntered(wave) { wave.pass(); }

  onPlayerEnter(ctx) { ctx.collect?.(this, this.item); }

  draw(c, s) {
    const t = performance.now() / 300 + this.bob;
    const y = s * 0.5 + Math.sin(t) * s * 0.04;
    c.strokeStyle = '#fff';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(s * 0.5, y - s * 0.28); c.lineTo(s * 0.74, y);
    c.lineTo(s * 0.5, y + s * 0.28); c.lineTo(s * 0.26, y);
    c.closePath(); c.stroke();
    c.fillStyle = '#fff';
    c.font = `bold ${Math.round(s * 0.26)}px ui-monospace, monospace`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(this.item === 'burin' ? 'B' : '+', s * 0.5, y + 1);
  }
}
defineDoodad('pickup', Pickup);
