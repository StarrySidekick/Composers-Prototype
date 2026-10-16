// The daily board: one wave, a pinball table of instruments, and a tune to make.
//
// A day is an 8 x 14 room (portrait, a phone's shape) built from the castle's
// doodads plus the daily's own pieces (src/daily/pieces.js), so a drum is the
// castle's drum and a horn the castle's horn. Around them:
//
//   the launcher  Coda at one tile, facing one way. Tapping him sends ONE wave
//                 from there, like a plunger. On a day that allows it (`can:
//                 "turn"`), dragging from him aims him.
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
//                 compared with it by degree: do is do in any octave, because a
//                 string's length sets its octave as well as its note.
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
export const ROWS = 14;
export const SOLFEGE = ['do', 're', 'mi', 'fa', 'sol', 'la', 'ti'];
// A wave that has not finished in this many sixteenths is going round in circles.
export const MAX_STEPS = 256;

// The daily's characters, laid over the castle's legend for every day. `=` and
// `H` mean a string held between pegs here, crossed to play; `o` a tuning peg.
export const DAILY_LEGEND = {
  '=': { type: 'taut', rot: 0 },
  'H': { type: 'taut', rot: 90 },
  'o': { type: 'tuningpeg' },
  'v': { type: 'solo', voice: 'violin' },
  'y': { type: 'solo', voice: 'trumpet' },
  'f': { type: 'solo', voice: 'flute' },
};

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
  constructor(day, { audio = null } = {}) {
    this.day = day;
    this.audio = audio;
    this.room = new Room({
      id: day.id, name: day.title, wing: day.wing ?? 'strings',
      music: day.music, legend: { ...DAILY_LEGEND, ...(day.legend ?? {}) }, overrides: day.overrides, layout: day.layout,
    });
    this.key = { root: this.room.music.root, mode: this.room.music.mode };
    this.launch = { x: day.launch.x, y: day.launch.y, dir: { ...(DIR[day.launch.dir] ?? DIR.up) }, can: day.launch.can ?? '' };
    this.target = targetOf(day.motif);
    this.tries = 0;
    this.moves = 0;
    this.onToast = null;
    this.onNote = null;      // (note, index, verdict) each time a tune note is heard
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
    this._wave = null;
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
  // a piece: tapping him is the page's business (play).
  tap(x, y) {
    if (this.running) return null;
    const d = this.pieceAt(x, y);
    if (!d) return null;
    const h = handlesOf(d);
    if (h.turn) {
      if (typeof d.turn === 'function') d.turn();
      else d.rot = (((d.rot ?? 0) + (d.spec.step ?? 90)) % 360 + 360) % 360;
      d.hit = 1; d.flash = 1;
      if (d.typeName === 'drum') d.strike?.(0.5, this.ctx);
      if (d instanceof TuningPeg) this.preview(d);
      this.moves++;
      return 'turn';
    }
    if (h.tune) {
      d.onPlayerInteract(this.ctx);
      this.moves++;
      return 'tune';
    }
    return this.preview(d) ? 'listen' : null;
  }

  // Aim Coda (a day whose launcher can turn). Returns whether he turned.
  aim(dirName_) {
    const dir = DIR[dirName_];
    if (!dir || this.running || !this.launch.can.includes('turn')) return false;
    if (dir.x === this.launch.dir.x && dir.y === this.launch.dir.y) return false;
    this.launch.dir = { ...dir };
    this.moves++;
    return true;
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
    if (!d || !handlesOf(d).move || this.running) return false;
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

  move(from, to) {
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
    this.moves++;
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

  // Play: one wave from Coda. It moves on the next sixteenth.
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
  // sixteenth's time is `this.when()`, so it lands on the grid.
  sound(opts) {
    const w = this._wave;
    const when = this.when?.() ?? 0;
    this.audio?.play({ ...opts, when, heard: false });
    // A tap's own sound (a hole covering, a slide pulled), or percussion: never judged.
    if (!this.running || !w || opts.family === 'percussion' || opts.family === 'sour' || this.verdict) return;
    const note = { midi: opts.midi, family: opts.family, degree: toDegree(opts.midi, this.key).degree, step: this.step, x: w.x, y: w.y };
    const i = this.heard.length;
    this.heard.push(note);
    if (note.degree !== this.target[i]) this.verdict = { kind: 'wrong', at: i, wanted: this.target[i], got: note.degree };
    else if (this.heard.length === this.target.length) this.verdict = { kind: 'solved' };
    this.onNote?.(note, i, this.verdict);
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
    if (!this.room.waves.length) return this.finish({ kind: 'short', at: this.heard.length, wanted: this.target[this.heard.length] });
    if (this.step >= MAX_STEPS) return this.finish({ kind: 'loop', at: this.heard.length });
    return true;
  }

  finish(v = null) {
    if (v && !this.verdict) this.verdict = v;
    this.running = false;
    this.room.waves = [];
    return false;
  }

  // The whole run at once, no clock: for the solver, the tests, and "show me".
  simulate() {
    this.fire();
    while (this.tick());
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
    if (this.launch.can.includes('turn')) out.push({ launcher: true, aim: true, states: 4 });
    return out;
  }
}

// Apply a recorded solution (`daily/days.json` "solution") the way a finger would:
// taps through tap(), drags through move(), Coda aimed through aim(). Returns
// false at the first step that does nothing, so a stale solution fails loudly.
export function applySolution(board, steps = []) {
  for (const s of steps) {
    if (s.tap) {
      const [x, y] = s.tap;
      for (let i = 0; i < (s.times ?? 1); i++) if (!board.tap(x, y)) return false;
    } else if (s.move) {
      const [[fx, fy], [tx, ty]] = s.move;
      if (!board.move({ x: fx, y: fy }, { x: tx, y: ty })) return false;
    } else if (s.aim) {
      if (!board.aim(s.aim)) return false;
    }
  }
  return true;
}
