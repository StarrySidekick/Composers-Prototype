// The daily board: one wave, a pinball table of instruments, and a tune to make.
//
// A day is an 8 x 14 room (portrait, a phone's shape) built from the same legend
// and doodads as the castle, so a drum is the castle's drum, a horn the castle's
// horn. What is new is around them:
//
//   the launcher  Coda at one tile, facing one way. Play sends ONE wave from
//                 there, like a plunger; nothing else moves on its own.
//   handles       what a finger may do to a piece, set per tile in the day's
//                 `overrides` as `can`:
//                   turn   tap turns it (a drum by 90, or `step` degrees)
//                   tune   tap is the piece's own B: a flute hole covers, a slide
//                          pulls out, a timpani walks up the scale, a valve turns
//                   move   drag it to any empty floor tile
//                 A piece with no `can` is fixed. The page draws the difference.
//   the tune      the day's motif, in scale degrees (src/music/motif.js shape).
//                 Every pitched note the wave sets off is heard in order and
//                 compared with it by degree: do is do in any octave, because a
//                 string's length sets its octave as well as its note.
//
// Two rules the castle does not need:
//
//   - A wave running ALONG one string is one held note, not a pluck per tile.
//     Same wave, same pitch, on the very next sixteenth: it is still sounding.
//     Back along the same string after a drum is a new note (the drum's hit is in
//     between), and that is how a pedal note is played.
//   - Drums, hats and cymbals keep time; they are not the tune. Percussion is
//     heard and never judged, the same way a note lock ignores it.
//
// Pure ES module over src/core and src/doodads: it runs in node too, which is how
// test/daily.mjs and tools/daily-solve.mjs play every day without a browser.

import { Room } from '../core/room.js';
import { DIR, dirName, rotate } from '../core/direction.js';
import { SoundWave, SoundWaveState, WaveSource, SOURCE_FOR_FAMILY } from '../core/sound-wave.js';
import { toDegree } from '../music/key.js';
import '../doodads/index.js';

export const COLS = 8;
export const ROWS = 14;
export const SOLFEGE = ['do', 're', 'mi', 'fa', 'sol', 'la', 'ti'];
// A wave that has not finished in this many sixteenths is going round in circles.
export const MAX_STEPS = 256;

const deg7 = d => ((d % 7) + 7) % 7;

// The tune as the board judges it: the motif's top line, in order, by degree.
export function targetOf(motif) {
  const tops = new Map();
  for (const [step, , degree] of motif.notes) if (!tops.has(step) || degree > tops.get(step)) tops.set(step, degree);
  return [...tops.entries()].sort((a, b) => a[0] - b[0]).map(([, d]) => deg7(d));
}

// What a finger may do to a doodad: its `can`, as a set.
export function handlesOf(d) {
  const can = String(d?.spec?.can ?? '').split(/[\s,]+/).filter(Boolean);
  return { turn: can.includes('turn'), tune: can.includes('tune'), move: can.includes('move') };
}

// How many taps bring a piece back to where it started: the size of its state.
export function cycleOf(d) {
  const h = handlesOf(d);
  if (h.turn) return 360 / (d.spec.step ?? 90);
  if (!h.tune) return 1;
  if (d.typeName === 'flute') return d.part === 'hole' ? 2 : 1;
  if (d.typeName === 'drum' && d.part === 'timpani') return 7;
  if (d.typeName === 'brass') return { slide: 4, valve: 4, mute: 2 }[d.part] ?? 1;
  return 1;
}

export class Board {
  // `day` is one entry of daily/days.json. `audio` is optional: without it the
  // board is silent and runs as fast as it is stepped (the tests, the solver).
  constructor(day, { audio = null } = {}) {
    this.day = day;
    this.audio = audio;
    this.room = new Room({
      id: day.id, name: day.title, wing: day.wing ?? 'brass',
      music: day.music, legend: day.legend, overrides: day.overrides, layout: day.layout,
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
  }

  // Nothing in the air: what the board is between runs.
  idle() {
    this.running = false;
    this.room.waves = [];
    this.step = 0;
    this.heard = [];
    this.verdict = null;
    this.trail = [];
    this._sounding = new Map();
    this._wave = null;
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

  // A tap: turn it, tune it, or (a fixed instrument) hear what it plays. Returns
  // what happened, for the page and the tests: 'turn' | 'tune' | 'listen' | null.
  tap(x, y) {
    if (this.running) return null;
    if (this.isLauncher(x, y)) {
      if (!this.launch.can.includes('turn')) return null;
      this.launch.dir = rotate(this.launch.dir, 90);
      this.moves++;
      return 'turn';
    }
    const d = this.pieceAt(x, y);
    if (!d) return null;
    const h = handlesOf(d);
    if (h.turn) {
      d.rot = (((d.rot ?? 0) + (d.spec.step ?? 90)) % 360 + 360) % 360;
      d.hit = 1; d.flash = 1;
      if (d.typeName === 'drum') d.strike?.(0.5, this.ctx);
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

  // Can this piece go there? Empty floor, on the board, not the launcher.
  canMove(from, to) {
    const d = this.pieceAt(from.x, from.y);
    if (!d || !handlesOf(d).move || this.running) return false;
    if (from.x === to.x && from.y === to.y) return false;
    if (!this.room.inBounds(to.x, to.y) || this.isLauncher(to.x, to.y)) return false;
    return !this.pieceAt(to.x, to.y);
  }

  move(from, to) {
    if (!this.canMove(from, to)) return false;
    const d = this.pieceAt(from.x, from.y);
    this.room.setDoodad(from.x, from.y, null);
    this.room.setDoodad(to.x, to.y, d);
    this.moves++;
    return true;
  }

  // ---- what each instrument would play ----------------------------------------
  //
  // Asked of the instrument itself, by letting it sound into a context that only
  // writes the note down. A label can never disagree with the sound that way.

  // `anyTube`: a horn answers from any of its tiles (a tap), not only its bell
  // (a label, which belongs where the horn sounds).
  noteOf(d, { anyTube = false } = {}) {
    let note = null;
    const keep = new Map(this.room.list.map(o => [o, [o.flash, o.vibrate, o.hit, o.press]]));
    const ctx = { ...this.ctx, play: (o) => { note ??= o; } };
    if (d.typeName === 'string') d.pluck(1, ctx);
    else if (d.typeName === 'brass' && (d.part === 'flare' || anyTube)) d.playNote(null, ctx);
    else if (d.typeName === 'flute' && (d.part === 'hole' || d.part === 'foot')) d.sound(null, ctx);
    else if (d.typeName === 'drum' && d.part === 'timpani') d.strike(1, ctx);
    else if (d.typeName === 'reed') ctx.play({ family: 'woodwind', midi: this.room.music.getNote(d.degree, d.octave) });
    for (const [o, [f, v, h, p]] of keep) { o.flash = f; o.vibrate = v; o.hit = h; o.press = p; }
    if (!note) return null;
    return { ...note, degree: toDegree(note.midi, this.key).degree };
  }

  // Tap a fixed instrument: hear it. Not part of a run, so never judged. A drum
  // that only keeps time just thumps.
  preview(d) {
    if (d.typeName === 'drum' && d.part !== 'timpani') { d.strike(0.6, this.ctx); return true; }
    const n = this.noteOf(d, { anyTube: true });
    if (!n || !this.audio) return !!n;
    this.audio.play({ ...n, intensity: 0.8, heard: false });
    if (d.typeName === 'string') d.vibrate = 1;
    else if (d.typeName === 'brass') {
      const horn = d.traceHorn(this.room).tiles;
      for (const t of this.room.list) if (t.typeName === 'brass' && horn.has(`${t.x},${t.y}`)) t.flash = 1;
    } else { d.flash = 1; d.hit = 1; }
    return true;
  }

  // The note name to print on each instrument: one per string (at the middle of
  // its run), one per horn (on its bell), one per flute hole and foot, timpani.
  labels() {
    const out = [];
    const seen = new Set();
    for (const d of this.room.list) {
      if (seen.has(d)) continue;
      if (d.typeName === 'string') {
        const run = this.run(d);
        run.forEach(t => seen.add(t));
        const mid = run.sort((a, b) => a.y - b.y || a.x - b.x)[Math.floor((run.length - 1) / 2)];
        const n = this.noteOf(d);
        if (n) out.push({ x: mid.x, y: mid.y, degree: n.degree, text: SOLFEGE[n.degree], piece: d });
        continue;
      }
      const n = this.noteOf(d);
      if (n) out.push({ x: d.x, y: d.y, degree: n.degree, text: SOLFEGE[n.degree], piece: d });
    }
    return out;
  }

  // The tiles of one string, the way StringSegment.measureLength counts them.
  run(d) {
    const out = [], seen = new Set(), stack = [d];
    while (stack.length) {
      const t = stack.pop();
      if (!t || t.typeName !== 'string' || seen.has(t)) continue;
      seen.add(t); out.push(t);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) stack.push(this.room.doodadAt(t.x + dx, t.y + dy));
    }
    return out;
  }

  // ---- a run -----------------------------------------------------------------

  // Play: one wave from the launcher. It moves on the next sixteenth.
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

  // Everything the wave plays comes through here, from inside its step. The
  // sixteenth's time is `this.when()`, so it lands on the grid.
  sound(opts) {
    const w = this._wave;
    const when = this.when?.() ?? 0;
    if (!this.running || !w) {
      // A tap's own sound (a hole covering, a slide pulled): heard, never judged.
      this.audio?.play({ ...opts, when, heard: false });
      return;
    }
    const pitched = opts.family !== 'percussion' && opts.family !== 'sour';
    if (pitched) {
      // Still running along the same string (or the same anything): one held note.
      const k = `${w.id}:${opts.family}:${opts.midi}`;
      const held = this._sounding.get(k) === this.step - 1;
      this._sounding.set(k, this.step);
      if (held) return;
    }
    this.audio?.play({ ...opts, when, heard: false });
    if (!pitched || this.verdict) return;
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

  // ---- the state a finger can change, for the solver and the save ------------

  // Every piece a finger can change, with how many states it has.
  handles() {
    const out = [];
    for (const d of this.room.list) {
      const h = handlesOf(d);
      if (h.turn || h.tune || h.move) out.push({ piece: d, ...h, states: cycleOf(d) });
    }
    if (this.launch.can.includes('turn')) out.push({ launcher: true, turn: true, states: 4 });
    return out;
  }
}

// Apply a recorded solution (`daily/days.json` "solution") the way a finger would:
// taps through tap(), drags through move(). Returns false at the first step that
// does nothing, so a stale solution fails loudly instead of passing quietly.
export function applySolution(board, steps = []) {
  for (const s of steps) {
    if (s.tap) {
      const [x, y] = s.tap;
      for (let i = 0; i < (s.times ?? 1); i++) if (!board.tap(x, y)) return false;
    } else if (s.move) {
      const [[fx, fy], [tx, ty]] = s.move;
      if (!board.move({ x: fx, y: fy }, { x: tx, y: ty })) return false;
    }
  }
  return true;
}
