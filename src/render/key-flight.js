// The unlock animation: the Composer's Key flies in, spins, and dives into the
// door that just opened.
//
// The key is Timothy's "Note key" from his website (src/vendor/key3d): a music
// note whose head is the bow, whose stem is the shaft and whose flag is three
// teeth. Drawn by the website's own WebGL renderer into a small canvas laid over
// the stage; this file only moves that canvas and turns the model.
//
// Timed in BEATS on the audio clock, like everything else, so it lands on the
// music at any tempo:
//
//   beat 0-1   fly in from below-left, spinning fast, growing
//   beat 1-3   hover in the middle, a pulse on each beat, spin settling
//   beat 3-4   dive into the door, shrinking, and burst there
//
// A rising arpeggio plays underneath, through the room's scale. Anyone who has
// asked for reduced motion gets the arpeggio and no flight.

import { mountModel } from '../vendor/key3d/model-view.js';
import { PRESETS } from '../vendor/key3d/model3d.js';

// The website's key is gold. The game is black and white for now, so the same
// parts are drawn in white and grey. Delete this map to get the gold back.
const MONO = { '#d9a441': '#f2f2f2', '#a8741f': '#8c8c8c' };
export const KEY_MODEL = {
  ...PRESETS.noteKey.model,
  pixel: 3,
  parts: PRESETS.noteKey.model.parts.map(p => ({ ...p, color: MONO[p.color] ?? p.color })),
};

const ARPEGGIO = [0, 2, 4, 7];   // scale degrees, one per beat

export class KeyFlight {
  constructor(host, { game, renderer }) {
    this.host = host;           // positioned element over the stage
    this.game = game;
    this.renderer = renderer;
    this.active = null;
    this.still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  }

  // Called when a door is opened by solving. One flight at a time: two doors
  // opening on the same note get one key.
  play(door) {
    if (this.active) return;
    const g = this.game;
    const clock = g.clock;
    const beat = clock.subInterval * clock.subdivisionsPerBeat;
    const t0 = g.nextGridTime(clock.subdivisionsPerBeat);   // the next beat
    const room = g.room;

    ARPEGGIO.forEach((deg, i) => g.audio.play({
      family: 'keys', midi: room.music.getNote(deg, 5), intensity: 0.7, when: t0 + i * beat,
    }));
    if (this.still) return;

    const cv = document.createElement('canvas');
    cv.className = 'key-flight';
    this.host.appendChild(cv);
    const view = mountModel(cv, KEY_MODEL, { interactive: false, auto: false });
    const burst = document.createElement('div');
    burst.className = 'key-burst';
    this.host.appendChild(burst);

    this.active = { cv, view, burst, door, room, t0, beat };
    const tick = () => {
      if (!this.active) return;
      if (this.frame()) requestAnimationFrame(tick);
      else this.stop();
    };
    requestAnimationFrame(tick);
  }

  // One frame. Returns false when the flight is over.
  frame() {
    const { cv, view, burst, door, room, t0, beat } = this.active;
    const now = this.game.clock.ctx.currentTime;
    const b = (now - t0) / beat;                       // beats since the flight began
    if (this.game.room !== room || b > 4.6) return false;

    const W = this.host.clientWidth, H = this.host.clientHeight;
    const size = Math.min(W, H) * 0.42;
    cv.style.width = cv.style.height = `${size}px`;

    const centre = { x: W / 2, y: H / 2 };
    const r = this.renderer;
    const target = { x: r.ox + (door.x + 0.5) * r.tile, y: r.oy + (door.y + 0.5) * r.tile };
    const start = { x: -size * 0.6, y: H + size * 0.6 };

    let x, y, scale, angle, roll, opacity = 1;
    if (b < 0) {
      opacity = 0; x = start.x; y = start.y; scale = 0.3; angle = 0; roll = 0;
    } else if (b < 1) {
      // In along a curve, overshooting a little, spinning down from very fast.
      const t = easeOutBack(b);
      const c = { x: W * 0.15, y: H * 0.2 };          // the curve's pull point
      x = bez(start.x, c.x, centre.x, t);
      y = bez(start.y, c.y, centre.y, t);
      scale = 0.3 + 0.9 * t;
      angle = 900 * easeOut(b);
      roll = -30 * (1 - b);
    } else if (b < 3) {
      // Hover: a bob, a pulse on every beat, a slow turn.
      const k = b - 1;
      const pulse = Math.exp(-((k % 1) * 7));
      x = centre.x;
      y = centre.y + Math.sin(k * Math.PI) * size * 0.04;
      scale = 1.2 + 0.12 * pulse;
      angle = 900 + 180 * k;
      roll = 0;
    } else {
      // Dive into the door.
      const t = easeIn(Math.min(1, b - 3));
      x = centre.x + (target.x - centre.x) * t;
      y = centre.y + (target.y - centre.y) * t;
      scale = 1.2 * (1 - t) + 0.08;
      angle = 1260 + 540 * t;
      roll = 25 * t;
      opacity = b > 4 ? Math.max(0, 1 - (b - 4) * 3) : 1;
    }

    cv.style.opacity = opacity;
    cv.style.transform =
      `translate(${x - size / 2}px, ${y - size / 2}px) scale(${scale}) rotate(${roll}deg)`;
    view.view.angle = angle;
    view.redraw();

    // The burst: a ring that blooms at the door on beat 4.
    const bt = b - 4;
    if (bt > 0) {
      const ring = r.tile * (1 + bt * 4);
      burst.style.opacity = Math.max(0, 1 - bt * 1.7);
      burst.style.width = burst.style.height = `${ring}px`;
      burst.style.transform = `translate(${target.x - ring / 2}px, ${target.y - ring / 2}px)`;
    }
    return true;
  }

  stop() {
    if (!this.active) return;
    this.active.view.destroy();
    this.active.cv.remove();
    this.active.burst.remove();
    this.active = null;
  }
}

const bez = (a, c, b, t) => (1 - t) * (1 - t) * a + 2 * (1 - t) * t * c + t * t * b;
const easeOut = t => 1 - Math.pow(1 - t, 3);
const easeIn = t => t * t * t;
function easeOutBack(t) { const c = 1.4; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }
