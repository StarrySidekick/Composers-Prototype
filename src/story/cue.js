// Music for the scenes that are not rooms: a title card, a cutscene, a tube run.
//
// A cue is a short loop written in SCALE DEGREES, in the same notation as a score
// layer ([sixteenth, degree, octave?, kind?]), and played through the scene's own
// key on the clock's sixteenths. So the same cue is wonder in F lydian and dread in
// E phrygian, and nothing a scene plays can be out of key or off the grid. Every
// note is `heard: false`: background music must never answer a lock.
//
// A scene names a cue by preset (`"cue": "wonder"`), writes its own
// (`"cue": { "bars": 1, "layers": [...] }`), or borrows a world's score
// (`"cue": { "score": "castle", "layers": "all" }`), which is how the credits play
// the whole tune with every layer the dungeon added: the finished piece.
//
// Prototype stand-in for FMOD events, like src/audio/score.js.

import { Score } from '../audio/score.js';
import { rng } from '../art/pen.js';

const L = (family, octave, notes, extra = {}) => ({ family, octave, notes, ...extra });

// Seeded scatter, for cues that should sound loose but be the same every time.
function scatter(seed, count, steps, degrees) {
  const r = rng(seed);
  return Array.from({ length: count }, () => [Math.floor(r() * steps), degrees[Math.floor(r() * degrees.length)]]);
}

export const CUES = {
  // Almost nothing: a low note a bar, a high one answering. Under talking.
  hush: { bars: 2, layers: [
    L('keys', 3, [[0, 0], [16, 4]], { gain: 0.5 }),
    L('keys', 5, [[8, 4], [12, 2], [24, 1], [28, 0]], { gain: 0.35 }),
  ] },
  // Lydian's raised fourth is the sound of wonder (film uses it for flight and
  // magic). A rising arpeggio that never quite lands.
  wonder: { bars: 2, layers: [
    L('keys', 4, [[0, 0], [2, 4], [4, 7], [6, 10], [8, 11], [10, 10], [12, 7], [14, 4],
                  [16, 1], [18, 5], [20, 8], [22, 10], [24, 12], [26, 10], [28, 8], [30, 5]], { gain: 0.45 }),
    L('strings', 3, [[0, 0], [16, 4]], { gain: 0.5 }),
  ] },
  // Falling: a scale tumbling down a sixteenth at a time, a wind holding above.
  fall: { bars: 2, layers: [
    L('keys', 4, Array.from({ length: 32 }, (_, i) => [i, 21 - (i % 16) - Math.floor(i / 16) * 2]), { gain: 0.35 }),
    L('woodwind', 5, [[0, 4], [16, 3]], { gain: 0.3 }),
  ] },
  // Something is wrong: the root and the note above it, back and forth.
  tense: { bars: 1, layers: [
    L('strings', 3, [[0, 0], [2, 1], [4, 0], [6, 1], [8, 0], [10, 1], [12, 0], [14, 1]], { gain: 0.45 }),
    L('voice', 5, [[0, 4], [10, 5]], { gain: 0.25 }),
  ] },
  // The castle gate: slow, low, a bell at the top of the bar.
  gate: { bars: 2, layers: [
    L('timpani', 3, [[0, 0], [16, 4]], { gain: 0.6 }),
    L('keys', 5, [[0, 7], [16, 6], [24, 4]], { gain: 0.35 }),
  ] },
  // The workshop: a music box, a little out of reach.
  musicbox: { bars: 2, layers: [
    L('keys', 6, [[0, 0], [3, 2], [6, 4], [8, 7], [12, 4], [16, 5], [19, 4], [22, 2], [24, 1], [28, 6]], { gain: 0.3 }),
  ] },
  // Each wing's colour, for its card and its tube run.
  wind: { bars: 1, layers: [
    L('woodwind', 5, scatter('wind', 7, 16, [0, 2, 4, 5, 7, 9]), { gain: 0.35 }),
    L('strings', 3, [[0, 0], [8, 3]], { gain: 0.4 }),
  ] },
  march: { bars: 1, layers: [
    L('brass', 3, [[0, 0], [4, 0], [6, 4], [8, 0], [12, 4]], { gain: 0.45 }),
    L('percussion', 4, [[4, 0, 4, 'snare'], [12, 0, 4, 'snare']], { gain: 0.35 }),
  ] },
  slow: { bars: 2, layers: [
    L('strings', 4, [[0, 4], [8, 3], [16, 2], [24, 0]], { gain: 0.45 }),
    L('strings', 2, [[0, 0], [16, -2]], { gain: 0.4 }),
  ] },
  heartbeat: { bars: 1, layers: [
    L('percussion', 3, [[0, 0, 3, 'bass'], [3, 0, 3, 'bass']], { gain: 0.6 }),
    L('voice', 4, [[8, 1]], { gain: 0.15 }),
  ] },
  organ: { bars: 2, layers: [
    L('keys', 3, [[0, 0], [0, 4], [16, 3], [16, 5]], { gain: 0.45 }),
    L('woodwind', 5, [[0, 7], [8, 9], [16, 8], [24, 11]], { gain: 0.3 }),
  ] },
  // Once through, not looped: what plays when something is found.
  fanfare: { bars: 1, once: true, layers: [
    L('brass', 4, [[0, 0], [2, 2], [4, 4], [6, 7], [8, 0, 5], [8, 4, 5], [8, 7, 5]], { gain: 0.6 }),
  ] },
  // A dissonance resolving: the leading tone up to home, and the chord.
  resolve: { bars: 1, once: true, layers: [
    L('strings', 4, [[0, 6], [4, 7], [4, 9], [4, 11]], { gain: 0.6 }),
    L('keys', 3, [[4, 0]], { gain: 0.5 }),
  ] },
  // Applause, as near as a scale-snapped engine can get: soft snares scattered.
  applause: { bars: 1, layers: [
    L('percussion', 4, scatter('applause', 14, 16, [0]).map(([s]) => [s, 0, 4, 'snare']), { gain: 0.18 }),
  ] },
  silence: { bars: 1, layers: [] },
};

export class Cue {
  // `scores`: { worldAlias: scoreJson }, for a cue that borrows a world's tune.
  constructor(spec, music, { scores = {} } = {}) {
    this.music = music;
    this.score = null;
    if (typeof spec === 'string') spec = CUES[spec] ?? CUES.hush;
    if (spec?.score) {
      const json = scores[spec.score];
      if (json) {
        this.score = new Score(json);
        const ids = spec.layers === 'all' || !spec.layers ? this.score.layers.map(l => l.id) : spec.layers;
        this.fake = { progress: { layers: new Set(ids), metronome: true }, attract: true, room: { music } };
      }
      spec = { bars: 1, layers: [] };
    }
    this.spec = spec ?? CUES.hush;
    this.steps = (this.spec.bars ?? 1) * 16;
    this.once = !!this.spec.once;
    this.pos = 0;
    this.waiting = true;       // starts on a beat, like the score
    this.gain = 1;
    this.byStep = new Map();
    for (const layer of this.spec.layers ?? []) {
      for (const [step, degree, octave, kind] of layer.notes ?? []) {
        const s = ((step % this.steps) + this.steps) % this.steps;
        if (!this.byStep.has(s)) this.byStep.set(s, []);
        this.byStep.get(s).push({ layer, degree, octave: octave ?? layer.octave ?? 4, kind: kind ?? layer.kind ?? null });
      }
    }
  }

  // Bar position of the cue right now, for a scene that wants to move with it.
  get bar() { return Math.floor(this.pos / 16); }

  tick(ev, audio) {
    if (this.score) {
      this.fake.audio = audio;
      this.fake.room.music = this.music;
      this.score.volume = 0.32 * this.gain;
      this.score.tick(ev, this.fake);
      return;
    }
    if (this.waiting) { if (!ev.isBeat) return; this.waiting = false; }
    if (this.once && this.pos >= this.steps) return;
    const step = this.pos % this.steps;
    this.pos++;
    for (const n of this.byStep.get(step) ?? []) {
      audio.play({
        family: n.layer.family ?? 'keys', kind: n.kind,
        midi: this.music.getNote(n.degree, n.octave),
        intensity: (n.layer.gain ?? 1) * 0.5 * this.gain,
        when: ev.time, heard: false,
      });
    }
  }
}
