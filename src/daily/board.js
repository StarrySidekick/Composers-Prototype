// The daily board: one wave, a pinball table of instruments, and a tune to make.
//
// A day is an 8 x 8 room built from the castle's doodads plus the daily's own
// pieces (src/daily/pieces.js), so a drum is the castle's drum and a horn the
// castle's horn. Tiles no instrument needs are solid blocks. Around them:
//
//   Coda          always just below the bottom-left tile (Timothy, 2026-10-16).
//                 Tapping him sends ONE wave up into that tile, on the next
//                 beat, like a plunger.
//   the run       the wave plays whatever it meets, right or wrong, and goes on
//                 until it ends by itself: off the board, into a peg or a
//                 timpani, or round a loop it can only repeat. Then it is
//                 judged: the notes it played must be the tune, all of it, in
//                 order, and nothing more. A finger may touch the board while
//                 the wave is in flight, and some days need it.
//   handles       what a finger may do to a piece, set per tile in the day's
//                 `overrides` as `can`:
//                   turn   tap turns it: a drum by 90 (or `step` degrees), a
//                          peg one more wrap
//                   tune   tap is the piece's own B: a flute hole covers, a slide
//                          pulls out, a timpani walks up the scale, a valve turns
//                   move   drag it to an empty tile. A peg slides along its
//                          string instead, and the string grows or shrinks.
//                 A piece with no `can` is fixed. The page draws the difference.
//   the tune      the day's motif, in scale degrees (src/music/motif.js shape).
//                 Every pitched note the wave sets off is heard in order and
//                 compared with it, by the day's `type` (Timothy, 2026-10-17):
//                   melodic   by degree only: do is do in any octave, because a
//                             string's length sets its octave as well as its note
//                   rhythmic  by time only: each note as far after the first as
//                             the tune's is, in sixteenths
//                   advanced  both
//
// Drums, hats and cymbals keep time; they are not the tune. Percussion is heard
// and never judged, the same way a note lock ignores it.
//
// Pure ES module over src/core, src/doodads and src/music: it runs in node too,
// which is how test/daily.mjs and tools/daily-solve.mjs play every day.

import { Room } from '../core/room.js';
import { DIR, dirName } from '../core/direction.js';
import { SoundWave, SoundWaveState, WaveSource, SOURCE_FOR_FAMILY } from '../core/sound-wave.js';
import { toDegree } from '../music/key.js';
import { spell } from '../music/notation.js';
import '../doodads/index.js';
import { TautString, TuningPeg, Solo } from './pieces.js';

export const COLS = 8;
export const ROWS = 8;
export const KINDS = ['melodic', 'rhythmic', 'advanced'];
export const SOLFEGE = ['do', 're', 'mi', 'fa', 'sol', 'la', 'ti'];
// A safety net: no run lasts longer than this many sixteenths.
export const MAX_STEPS = 512;
// Where Coda stands: off the board, under its bottom-left tile, facing up. A
// board of another height puts him under its own (Board.launch).
export const CODA = { x: 0, y: ROWS };
// Tempo: day 1 at 100, five more each day after.
export const bpmOfDay = (i) => 100 + 5 * i;

// The daily's characters, laid over the castle's legend for every day. `=` and
// `H` mean a string held between pegs here, crossed to play; `o` a tuning peg.
export const DAILY_LEGEND = {
  '=': { type: 'taut', rot: 0 },
  'H': { type: 'taut', rot: 90 },
  'o': { type: 'tuningpeg' },
  'v': { type: 'solo', voice: 'violin' },
  'y': { type: 'solo', voice: 'trumpet' },
  'f': { type: 'solo', voice: 'flute' },
  'Z': { type: 'block' },
};
// Z: a solid block, where no instrument is needed.

const deg7 = d => ((d % 7) + 7) % 7;
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const ACCIDENTAL = ['𝄫', '♭', '', '♯', '𝄪'];
const FACING = [[0, -1, 0], [1, 0, 90], [0, 1, 180], [-1, 0, 270]];

// The tune as the board judges it: the motif's top line, in order, by degree.
export function targetOf(motif) {
  const tops = new Map();
  for (const [step, , degree] of motif.notes) if (!tops.has(step) || degree > tops.get(step)) tops.set(step, degree);
  return [...tops.entries()].sort((a, b) => a[0] - b[0]).map(([, d]) => deg7(d));
}

// Where each note of the tune starts and how long it lasts, in the same order:
// what the page lights on the staff as the wave plays.
export function targetSpans(motif) {
  const tops = new Map();
  for (const [step, len, degree] of motif.notes) if (!tops.has(step) || degree > tops.get(step)[1]) tops.set(step, [len, degree]);
  return [...tops.entries()].sort((a, b) => a[0] - b[0]).map(([from, [len]]) => ({ from, to: from + len }));
}

// What a finger may do to a doodad: its `can`, as a set.
export function handlesOf(d) {
  const can = String(d?.spec?.can ?? '').split(/[\s,]+/).filter(Boolean);
  return { turn: can.includes('turn'), tune: can.includes('tune'), move: can.includes('move') };
}

// How many taps bring a piece back to where it started: the size of its state.
export function cycleOf(d) {
  const h = handlesOf(d);
  if (h.turn) return d instanceof TuningPeg ? 4 : 360 / (d.spec.step ?? 90);
  if (!h.tune) return 1;
  if (d.typeName === 'flute') return d.part === 'hole' ? 2 : 1;
  if (d.typeName === 'drum' && d.part === 'timpani') return 7;
  if (d.typeName === 'brass') return { slide: 4, valve: 4, mute: 2 }[d.part] ?? 1;
  return 1;
}

// A note's written name in a key: "C♯", "B♭".
export function noteName(midi, key) {
  const s = spell(midi, key);
  return LETTERS[s.letter] + ACCIDENTAL[s.alter + 2];
}

export class Board {
  // `day` is one entry of daily/days.json. `audio` is optional: without it the
  // board is silent and runs as fast as it is stepped (the tests, the solver).
  // `quick` ends a run at its first wrong or extra note, for the solver, which
  // only needs to know whether a setting plays the tune.
  constructor(day, { audio = null, quick = false } = {}) {
    this.day = day;
    this.audio = audio;
    this.quick = quick;
    this.room = new Room({
      id: day.id, name: day.title, wing: day.wing ?? 'strings',
      music: day.music, legend: { ...DAILY_LEGEND, ...(day.legend ?? {}) }, overrides: day.overrides, layout: day.layout,
    });
    this.key = { root: this.room.music.root, mode: this.room.music.mode };
    this.launch = { x: 0, y: this.room.height, dir: { ...DIR.up } };
    this.kind = KINDS.includes(day.type) ? day.type : 'melodic';
    this.target = targetOf(day.motif);
    this.onsets = targetSpans(day.motif).map(t => t.from);
    this.tries = 0;
    this.moves = 0;
    this.onToast = null;
    this.onNote = null;      // (note, index, right) each time the wave plays a note
    this.when = null;        // () => audio time of the sixteenth being stepped
    this.idle();
    this.ctx = this.makeContext();
    this.settle();
  }

  // Nothing in the air: what the board is between runs.
  idle() {
    this.running = false;
    this.room.waves = [];
    this.step = 0;
    this.heard = [];
    this.verdict = null;
    this.trail = [];
    this.looped = false;
    this._wave = null;
    this._seen = new Set();
  }

  // Pegs face the string they hold (the art's stem points at it).
  settle() {
    for (const d of this.room.list) {
      if (!(d instanceof TuningPeg)) continue;
      d._facing = 0;
      for (const [dx, dy, rot] of FACING) {
        const n = this.room.doodadAt(d.x + dx, d.y + dy);
        if (n instanceof TautString && (n.axis === 'h') === (dy === 0)) { d._facing = rot; break; }
      }
    }
  }

  get waves() { return this.room.waves; }

  makeContext() {
    const board = this;
    const room = this.room;
    return {
      room,
      // Coda is the launcher: anything that asks which way he faces is told the
      // launcher's way (a mouthpiece blown with B, in the castle).
      get player() { return { x: board.launch.x, y: board.launch.y, dir: board.launch.dir, facing: dirName(board.launch.dir) }; },
      progress: null,
      here: true,
      audio: this.audio,
      play: (opts) => this.sound(opts),
      playDegree: ({ family = 'keys', degree = 0, octave = 5, intensity = 1 }) =>
        this.sound({ family, intensity, midi: room.music.getNote(degree, octave) }),
      nextGridTime: () => this.when?.() ?? this.audio?.now ?? 0,
      get subInterval() { return 60 / room.music.bpm / 4; },
      get beatInterval() { return 60 / room.music.bpm; },
      spawnWave: (x, y, dir, state) => this.spawn(x, y, dir, state),
      spawnWaveFromDoodad: (d, dir) => this.spawn(d.x, d.y, dir, new SoundWaveState({ source: SOURCE_FOR_FAMILY[d.family] ?? WaveSource.ComposersKey })),
      toast: (m) => this.onToast?.(m),
      onDoorOpened() {}, onDoorChanged() {}, onRoomComplete() {},
      collect() {}, hurt() {}, stage() {}, talk() {},
      wavesAt: (x, y) => room.waves.filter(w => w.alive && w.x === x && w.y === y),
    };
  }

  spawn(x, y, dir, state = SoundWaveState.default) {
    const w = new SoundWave(x, y, dir, state);
    w.bornAt = this.audio?.now ?? 0;
    this.room.waves.push(w);
    return w;
  }

  // ---- what a finger does ----------------------------------------------------

  pieceAt(x, y) { return this.room.doodadAt(x, y); }

  isLauncher(x, y) { return x === this.launch.x && y === this.launch.y; }

  // A tap on a piece: turn it, tune it, or (a fixed instrument) hear what it
  // plays. Returns what happened: 'turn' | 'tune' | 'listen' | null. Coda is not
  // a piece: tapping him is the page's business (play). Allowed while the wave
  // is in flight: turning a drum behind it sends it elsewhere next time round.
  tap(x, y) {
    const d = this.pieceAt(x, y);
    if (!d) return null;
    const h = handlesOf(d);
    if (h.turn) {
      if (typeof d.turn === 'function') d.turn();
      else d.rot = (((d.rot ?? 0) + (d.spec.step ?? 90)) % 360 + 360) % 360;
      d.hit = 1; d.flash = 1;
      if (d.typeName === 'drum') d.strike?.(0.5, this.ctx);
      if (d instanceof TuningPeg) this.preview(d);
      this.touched();
      return 'turn';
    }
    if (h.tune) {
      d.onPlayerInteract(this.ctx);
      this.touched();
      return 'tune';
    }
    return this.preview(d) ? 'listen' : null;
  }

  // A touch that changed the board. Counted, and it means a wave going round
  // may now go somewhere new, so its loop is no longer known to repeat.
  touched() {
    this.moves++;
    this._seen.clear();
  }

  // A peg's string and the peg at its other end, if it holds one.
  strung(peg) {
    const s = peg instanceof TuningPeg ? peg.string(this.room) : null;
    if (!s) return null;
    const run = s.run(this.room);
    const other = run.ends.find(e => e !== peg);
    return other instanceof TuningPeg ? { string: s, run, other } : null;
  }

  // Can this piece go there? Empty floor, on the board, not Coda. A peg that
  // holds a string only slides along it, to anywhere that leaves at least one
  // tile of string and lays it over nothing but floor.
  canMove(from, to) {
    const d = this.pieceAt(from.x, from.y);
    if (!d || !handlesOf(d).move) return false;
    if (from.x === to.x && from.y === to.y) return false;
    if (!this.room.inBounds(to.x, to.y) || this.isLauncher(to.x, to.y)) return false;
    const held = this.strung(d);
    if (!held) return !this.pieceAt(to.x, to.y);
    const { string, run, other } = held;
    const h = string.axis === 'h';
    if (h ? to.y !== d.y : to.x !== d.x) return false;
    const side = h ? Math.sign(d.x - other.x) : Math.sign(d.y - other.y);
    const dist = h ? (to.x - other.x) * side : (to.y - other.y) * side;
    if (dist < 2) return false;
    const mine = new Set(run.tiles);
    for (let k = 1; k <= dist; k++) {
      const x = h ? other.x + side * k : to.x, y = h ? to.y : other.y + side * k;
      const t = this.pieceAt(x, y);
      if ((t && t !== d && !mine.has(t)) || this.isLauncher(x, y)) return false;
    }
    return true;
  }

  // `count`: false for each tile of one drag after the first, so a peg slid
  // three tiles under one finger is one touch.
  move(from, to, { count = true } = {}) {
    if (!this.canMove(from, to)) return false;
    const d = this.pieceAt(from.x, from.y);
    const held = this.strung(d);
    if (held) for (const t of held.run.tiles) this.room.setDoodad(t.x, t.y, null);
    this.room.setDoodad(from.x, from.y, null);
    this.room.setDoodad(to.x, to.y, d);
    if (held) {
      // Lay the string again, peg to peg.
      const { string, other } = held;
      const h = string.axis === 'h';
      const n = h ? Math.abs(to.x - other.x) : Math.abs(to.y - other.y);
      const sx = h ? Math.sign(to.x - other.x) : 0, sy = h ? 0 : Math.sign(to.y - other.y);
      for (let k = 1; k < n; k++) {
        const t = new TautString({ type: 'taut', rot: h ? 0 : 90 }, other.x + sx * k, other.y + sy * k);
        this.room.setDoodad(t.x, t.y, t);
      }
    }
    this.settle();
    if (count) this.touched(); else this._seen.clear();
    return true;
  }

  // ---- what each instrument would play ----------------------------------------
  //
  // Asked of the instrument itself, by letting it sound into a context that only
  // writes the note down. A label can never disagree with the sound that way.

  // `anyTube`: a horn answers from any of its tiles (a tap), not only its bell
  // (a label, which belongs where the horn sounds). A peg answers for its string.
  noteOf(d, { anyTube = false } = {}) {
    let note = null;
    const keep = new Map(this.room.list.map(o => [o, [o.flash, o.vibrate, o.hit, o.press]]));
    const ctx = { ...this.ctx, play: (o) => { note ??= o; } };
    if (d instanceof TautString) d.pluck(1, ctx);
    else if (d instanceof TuningPeg) d.string(this.room)?.pluck(1, ctx);
    else if (d instanceof Solo) d.sound(ctx);
    else if (d.typeName === 'brass' && (d.part === 'flare' || anyTube)) d.playNote(null, ctx);
    else if (d.typeName === 'flute' && (d.part === 'hole' || d.part === 'foot')) d.sound(null, ctx);
    else if (d.typeName === 'drum' && d.part === 'timpani') d.strike(1, ctx);
    else if (d.typeName === 'reed') ctx.play({ family: 'woodwind', midi: this.room.music.getNote(d.degree, d.octave) });
    for (const [o, [f, v, h, p]] of keep) { o.flash = f; o.vibrate = v; o.hit = h; o.press = p; }
    if (!note) return null;
    return { ...note, degree: toDegree(note.midi, this.key).degree, name: noteName(note.midi, this.key) };
  }

  // Tap a fixed instrument: hear it. Not part of a run, so never judged. A drum
  // that only keeps time just thumps.
  preview(d) {
    if (d.typeName === 'drum' && d.part !== 'timpani') { d.strike(0.6, this.ctx); return true; }
    const n = this.noteOf(d, { anyTube: true });
    if (!n || !this.audio) return !!n;
    this.audio.play({ ...n, intensity: 0.8, heard: false });
    if (d instanceof TautString || d instanceof TuningPeg) {
      const s = d instanceof TuningPeg ? d.string(this.room) : d;
      for (const t of s?.run(this.room).tiles ?? []) t.vibrate = 1;
    } else if (d.typeName === 'brass') {
      const horn = d.traceHorn(this.room).tiles;
      for (const t of this.room.list) if (t.typeName === 'brass' && horn.has(`${t.x},${t.y}`)) t.flash = 1;
    } else { d.flash = 1; d.hit = 1; }
    return true;
  }

  // The note to print on each instrument: one per string (on its middle tile),
  // one per horn (on its bell), one per flute hole and foot, little instruments,
  // timpani.
  labels() {
    const out = [];
    const seen = new Set();
    for (const d of this.room.list) {
      if (seen.has(d) || d instanceof TuningPeg) continue;
      let at = d;
      if (d instanceof TautString) {
        const tiles = d.run(this.room).tiles;
        tiles.forEach(t => seen.add(t));
        at = tiles[Math.floor((tiles.length - 1) / 2)];
      }
      const n = this.noteOf(d);
      if (n) out.push({ x: at.x, y: at.y, degree: n.degree, text: n.name, solfege: SOLFEGE[n.degree], piece: d });
    }
    return out;
  }

  // ---- a run -----------------------------------------------------------------

  // Play: one wave from Coda, up into the bottom-left tile on the next step.
  fire() {
    this.idle();
    this.running = true;
    this.tries++;
    const st = new SoundWaveState({ source: WaveSource.ComposersKey });
    st.pitch = this.room.music.getNote(0, 4);
    this.spawn(this.launch.x, this.launch.y, this.launch.dir, st);
    this.trail.push({ id: this.room.waves[0].id, x: this.launch.x, y: this.launch.y, step: 0 });
    this.audio?.play({ family: 'percussion', kind: 'hat', midi: 84, intensity: 0.35, when: this.when?.() ?? 0, heard: false });
  }

  // Stop a run where it is (Coda tapped again).
  stop() {
    if (!this.running) return;
    this.finish({ kind: 'stopped', at: this.heard.length });
  }

  // Everything the wave plays comes through here, from inside its step. The
  // sixteenth's time is `this.when()`, so it lands on the grid. Every pitched
  // note is written down, right or wrong; the run is judged when it ends.
  sound(opts) {
    const w = this._wave;
    const when = this.when?.() ?? 0;
    this.audio?.play({ ...opts, when, heard: false });
    // A tap's own sound (a hole covering, a slide pulled), or percussion: never judged.
    if (!this.running || !w || opts.family === 'percussion' || opts.family === 'sour') return;
    const note = { midi: opts.midi, family: opts.family, degree: toDegree(opts.midi, this.key).degree, step: this.step, x: w.x, y: w.y };
    const i = this.heard.length;
    this.heard.push(note);
    const right = this.isRight(i);
    if (this.quick && !right) this.verdict = this.judge();
    this.onNote?.(note, i, right);
  }

  // Is the i-th note the wave played the tune's i-th, by the day's type? Pitch
  // by degree; time as sixteenths after the run's first note, against the
  // tune's own.
  isRight(i) {
    const h = this.heard[i];
    if (!h || i >= this.target.length) return false;
    const pitch = h.degree === this.target[i];
    const time = h.step - this.heard[0].step === this.onsets[i] - this.onsets[0];
    return this.kind === 'melodic' ? pitch : this.kind === 'rhythmic' ? time : pitch && time;
  }

  // How many sixteenths late (positive) or early the i-th note came, against the tune.
  offBy(i) {
    const h = this.heard[i];
    return h ? (h.step - this.heard[0].step) - (this.onsets[i] - this.onsets[0]) : 0;
  }

  // One sixteenth. Returns true while the run goes on.
  tick() {
    if (!this.running) return false;
    this.step++;
    if (this.step % 4 === 0) {
      const beat = this.step / 4;
      for (const d of [...this.room.list]) { d.onBeat(beat, this.ctx); d.tickHold(beat, this.ctx); }
    }
    for (const w of [...this.room.waves]) {
      if (!w.alive) continue;
      this._wave = w;
      w.step(this.ctx);
      this._wave = null;
      this.trail.push({ id: w.id, x: w.x, y: w.y, step: this.step, alive: w.alive });
    }
    this.room.waves = this.room.waves.filter(w => w.alive);
    if (this.verdict) return this.finish();
    if (!this.room.waves.length || this.step >= MAX_STEPS) return this.finish();
    // Round a loop: every wave where it was before, going the same way, with no
    // touch since. Nothing on the board changes by itself, so it would only go
    // round again forever, playing what it just played. A wave an instrument is
    // holding till the beat sits still on purpose, so none is checked then.
    if (this.room.waves.some(w => w.held)) return true;
    const at = this.room.waves.map(w => `${w.x},${w.y},${w.dir.x},${w.dir.y}`).sort().join('|');
    if (this._seen.has(at)) { this.looped = true; return this.finish(); }
    this._seen.add(at);
    return true;
  }

  finish(v = null) {
    this.verdict = v ?? this.verdict ?? this.judge();
    this.running = false;
    this.room.waves = [];
    return false;
  }

  // The notes the wave played against the tune: all of it, in order, nothing
  // more. The first note out of place names what went wrong: its pitch, and
  // (`off`) how many sixteenths early or late it came.
  judge() {
    const t = this.target, h = this.heard;
    for (let i = 0; i < Math.min(t.length, h.length); i++) {
      if (!this.isRight(i)) return { kind: 'wrong', at: i, wanted: t[i], got: h[i].degree, off: this.offBy(i) };
    }
    if (h.length < t.length) return { kind: 'short', at: h.length, wanted: t[h.length] };
    if (h.length > t.length) return { kind: 'long', at: t.length, got: h[t.length].degree, extra: h.length - t.length };
    return { kind: 'solved' };
  }

  // The whole run at once, no clock: for the solver, the tests, and "show me".
  // `timed` are touches made in flight, each `at` a step: it happens once the
  // wave has taken that many steps. One that does nothing is written down in
  // `this.missed`, so a stale solution fails by name.
  simulate(timed = []) {
    this.fire();
    this.missed = [];
    const due = [...timed].sort((a, b) => a.at - b.at);
    do {
      while (due.length && due[0].at <= this.step) {
        const t = due.shift();
        if (!touch(this, t)) this.missed.push(t);
      }
    } while (this.tick());
    this.missed.push(...due);
    return { verdict: this.verdict, heard: this.heard, steps: this.step, trail: this.trail };
  }

  get solved() { return this.verdict?.kind === 'solved'; }

  // ---- the state a finger can change, for the solver ----------------------------

  // Every piece a finger can change, with how many states it has.
  handles() {
    const out = [];
    for (const d of this.room.list) {
      const h = handlesOf(d);
      if (h.turn || h.tune || h.move) out.push({ piece: d, ...h, states: cycleOf(d) });
    }
    return out;
  }
}

// One recorded touch, the way a finger makes it: a tap (some number of times)
// through tap(), a drag through move(). Returns false when it does nothing.
function touch(board, s) {
  if (s.tap) {
    const [x, y] = s.tap;
    for (let i = 0; i < (s.times ?? 1); i++) if (!board.tap(x, y)) return false;
    return true;
  }
  if (s.move) {
    const [[fx, fy], [tx, ty]] = s.move;
    return board.move({ x: fx, y: fy }, { x: tx, y: ty });
  }
  return false;
}

// Apply a recorded solution (`daily/days.json` "solution") the way a finger
// would, before the wave goes: taps through tap(), drags through move(). Touches
// with an `at` are made in flight: pass them to simulate() (`timedOf`). Returns
// false at the first touch that does nothing, so a stale solution fails loudly.
export function applySolution(board, steps = []) {
  for (const s of steps) if (s.at == null && !touch(board, s)) return false;
  return true;
}

export const timedOf = (steps = []) => steps.filter(s => s.at != null);
