// Tube runs and bosses: notes travel down lanes, and you play them as they land.
//
// The castle's core is a network of brass pipes, and riding one is a linear run
// with its own music: Guitar Hero turned on its side, or upright. Some pipes run
// both ways, and riding one backwards plays its chart backwards: a RETROGRADE, the
// old composer's trick of playing a melody end to beginning (Bach hid them in
// canons). The bosses reuse the same engine, each with a twist that is its
// struggle: chaos shuffles the lanes, judgement narrows the window and comments on
// everything, apathy drains the colour and drags the tempo, fear hides the notes in
// the dark until they are almost on you.
//
// A chart, one bar per string, one character per sixteenth:
//
//   "chart": { "bars": ["L...D...U...R...", "L.L.D---U...R..."], "repeat": 2, "chords": [0, 5, 3, 4] }
//
//   L D U R   the D-pad's left, down, up, right lanes (left to right, like a dance mat)
//   A B       the A and B buttons, for a chart whose `lanes` include "a" or "b"
//   -         hold the note before it this much longer
//   .         rest
//
// Each lane sounds a chord tone (left the root, down the third, up the fifth, right
// the octave), moved to each bar's chord, so any chart is a tune in the scene's key.
// Or take the notes from a world's score layer (`"layer": { "id": "motif" }`) and
// the run plays the castle's own tune. Notes are `heard: false`, always.
//
// Every sound is on the sixteenth grid. A note hit early sounds exactly on its
// sixteenth; one hit late sounds on the next, the way firing the Key does. A missed
// note sounds sour, quietly, which is the game's word for a wrong note.

import { SceneBase, sketch, text } from './scenes.js';
import { rng } from '../art/pen.js';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';
export const DEFAULT_LANES = ['left', 'down', 'up', 'right'];
const LANE_OF_CHAR = { L: 'left', D: 'down', U: 'up', R: 'right', A: 'a', B: 'b' };
const LANE_DEGREE = { left: 0, down: 2, up: 4, right: 7, a: 9, b: 11 };
const ARROW = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };

// Seconds either side of a note's sixteenth. A sixteenth at 100 bpm is 0.15 s.
export const WINDOWS = { perfect: 0.07, good: 0.14 };

export function parseChart(spec = {}, { scores = {}, reverse = false } = {}) {
  const lanes = spec.lanes ?? DEFAULT_LANES;
  const chords = spec.chords ?? [0];
  let notes = [];
  let steps = 16;
  if (spec.bars) {
    const bars = [];
    for (let r = 0; r < (spec.repeat ?? 1); r++) bars.push(...spec.bars);
    steps = bars.length * 16;
    bars.forEach((bar, bi) => {
      const cells = bar.replace(/[\s|]/g, '').slice(0, 16);
      for (let i = 0; i < cells.length; i++) {
        const lane = LANE_OF_CHAR[cells[i]];
        if (!lane || !lanes.includes(lane)) continue;
        let len = 0;
        for (let j = i + 1; j < cells.length && cells[j] === '-'; j++) len = j - i + 1;
        const degree = (spec.degrees?.[lane] ?? LANE_DEGREE[lane]) + chords[bi % chords.length];
        notes.push({ step: bi * 16 + i, lane, len, degree, octave: null });
      }
    });
  } else if (spec.layer) {
    const json = scores[spec.layer.score ?? 'castle'];
    const layer = json?.layers?.find(l => l.id === spec.layer.id);
    const loop = (json?.bars ?? 4) * 16;
    const times = spec.repeat ?? 1;
    steps = loop * times;
    const src = [...(layer?.notes ?? [])].sort((a, b) => a[0] - b[0]);
    const every = spec.every ?? 1;
    for (let r = 0; r < times; r++) {
      src.forEach((n, i) => {
        if (i % every) return;
        const [step, degree, octave] = n;
        const lane = lanes[((degree % lanes.length) + lanes.length) % lanes.length];
        notes.push({ step: r * loop + step, lane, len: 0, degree, octave: octave ?? layer.octave ?? 4 });
      });
    }
  }
  // One note per lane per sixteenth.
  const seen = new Set();
  notes = notes.filter(n => { const k = `${n.step}:${n.lane}`; if (seen.has(k)) return false; seen.add(k); return true; });
  if (reverse) notes = notes.map(n => ({ ...n, step: steps - 1 - (n.step + Math.max(0, n.len - 1)) }));
  notes.sort((a, b) => a.step - b.step || a.lane.localeCompare(b.lane));
  return { lanes, notes, steps };
}

// ---- the run itself -----------------------------------------------------------------

export class RhythmRun {
  constructor(env, { chart, music, family = 'keys', octave = 5, orient = 'vertical', lead = 2,
    reverse = false, mod = null, windows = WINDOWS, seed = 'run' }) {
    this.env = env;
    this.chart = chart;
    this.music = music;
    this.family = family;
    this.octave = octave;
    this.orient = orient;
    this.lead = lead;
    this.reverse = reverse;
    this.mod = mod;
    const tight = mod === 'judge' ? 0.7 : 1;
    this.win = { perfect: windows.perfect * tight, good: windows.good * tight };
    this.start = null;
    this.done = false;
    this.notes = chart.notes.map((n, i) => ({ ...n, i, judged: null, held: false, from: null }));
    const r = rng(seed);
    for (const n of this.notes) n.from = Math.floor(r() * chart.lanes.length);
    this.stats = { perfect: 0, good: 0, miss: 0, total: this.notes.length, combo: 0, best: 0 };
    this.pops = [];
    this.down = new Set();
    this.lastStep = -1;
  }

  get clock() { return this.env.game.clock; }
  get now() { return this.clock.ctx.currentTime; }
  begin(index) { this.start = index; }
  timeOf(n) { return this.clock.timeOf(this.start + n.step); }
  get progress() { return this.start == null ? 0 : Math.max(0, Math.min(1, this.lastStep / this.chart.steps)); }
  get accuracy() { const s = this.stats; return s.total ? (s.perfect + s.good * 0.6) / s.total : 1; }

  tick(ev) {
    if (this.start == null) return;
    const step = ev.index - this.start;
    this.lastStep = step;
    if (this.env.director.autoplay) {
      for (const n of this.notes) if (!n.judged && n.step === step) this.hit(n, 0, ev.time, n.lane);
    }
    // A held long note sounds again every beat it is held, softly.
    for (const n of this.notes) {
      if (n.judged && n.judged !== 'miss' && n.len && n.held) {
        const into = step - n.step;
        if (into > 0 && into < n.len && into % 4 === 0) this.sound(n, ev.time, 0.25);
        if (into >= n.len) n.held = false;
      }
    }
    if (step > this.chart.steps + 4) this.done = true;
  }

  // Misses are decided on the animation frame, against the audio clock.
  frame() {
    if (this.start == null) return;
    const now = this.now;
    for (const n of this.notes) {
      if (n.judged) continue;
      if (now - this.timeOf(n) > this.win.good) this.miss(n);
    }
    this.pops = this.pops.filter(p => now - p.t < 0.6);
  }

  press(lane) {
    this.down.add(lane);
    this.presses = (this.presses ?? 0) + 1;
    if (this.start == null) return false;
    const now = this.now;
    let best = null, bestD = Infinity;
    for (const n of this.notes) {
      if (n.judged) continue;
      if (this.mod !== 'free' && n.lane !== lane) continue;
      const d = now - this.timeOf(n);
      if (Math.abs(d) <= this.win.good && Math.abs(d) < Math.abs(bestD)) { best = n; bestD = d; }
    }
    if (!best) return false;
    const t = this.timeOf(best);
    const when = t >= now + 0.004 ? t : this.clock.timeOf(this.clock.index + 1);
    this.hit(best, bestD, when, lane);
    return true;
  }

  release(lane) {
    this.down.delete(lane);
    for (const n of this.notes) if (n.lane === lane && n.held) n.held = false;
  }

  hit(n, delta, when, lane) {
    n.judged = Math.abs(delta) <= this.win.perfect ? 'perfect' : 'good';
    n.held = n.len > 0;
    n.playedLane = lane;
    this.stats[n.judged]++;
    this.stats.combo++;
    this.stats.best = Math.max(this.stats.best, this.stats.combo);
    this.sound(n, when, 0.75, lane);
    this.pops.push({ lane: n.lane, word: this.word(n.judged), t: this.now, good: true });
    this.onHit?.(n);
  }

  miss(n) {
    n.judged = 'miss';
    this.stats.miss++;
    this.stats.combo = 0;
    this.env.audio.play({ family: 'sour', midi: this.music.getNote(n.degree, this.octave - 1), intensity: 0.18, when: this.clock.timeOf(this.clock.index + 1), heard: false });
    this.pops.push({ lane: n.lane, word: this.word('miss'), t: this.now, good: false });
    this.onMiss?.(n);
  }

  // In a free phase the note you chose is the note that sounds: your lane's tone.
  sound(n, when, gain, lane = n.lane) {
    const degree = this.mod === 'free' ? LANE_DEGREE[lane] + (n.degree - LANE_DEGREE[n.lane]) : n.degree;
    const midi = this.music.getNote(degree, n.octave ?? this.octave);
    this.env.audio.play({ family: this.family, midi, intensity: gain, when, heard: false });
    const hist = this.env.game.noteHistory;
    hist.push({ midi, family: this.family, t: when });
    if (hist.length > 64) hist.shift();
  }

  word(j) {
    if (this.mod === 'judge') return { perfect: 'acceptable.', good: 'sloppy.', miss: 'wrong.' }[j];
    if (this.mod === 'free') return { perfect: 'yours.', good: 'yours.', miss: '' }[j];
    return { perfect: '♪', good: 'ok', miss: 'sour' }[j];
  }

  // ---- drawing --------------------------------------------------------------------

  laneRect(box) {
    const n = this.chart.lanes.length;
    const vertical = this.orient === 'vertical';
    const along = vertical ? box.h : box.w, across = vertical ? box.w : box.h;
    const size = Math.min(across / n, vertical ? 86 : 64);
    const start = (vertical ? box.x : box.y) + (across - size * n) / 2;
    // Notes come out of the far end of the pipe toward you: down an upright pipe
    // to a line near the bottom, right to left along a sideways one. Ridden
    // backwards, they come the other way.
    const flip = vertical ? this.reverse : !this.reverse;
    const hit = flip ? 0.16 : 0.84;
    const near = (vertical ? box.y : box.x) + along * hit;
    const far = (vertical ? box.y : box.x) + along * (flip ? 0.98 : 0.02);
    return { n, vertical, size, start, near, far };
  }

  draw(c, box) {
    const g = this.laneRect(box);
    const lanes = this.chart.lanes;
    const ink = this.mod === 'fade' ? '#8a8a8a' : '#fff';
    const now = this.now;
    const span = this.lead * this.clock.beatInterval;
    const across = (i) => g.start + g.size * (i + 0.5);
    const pt = (i, along) => (g.vertical ? [across(i), along] : [along, across(i)]);
    c.save();
    c.lineCap = 'round';
    // lane walls: a pipe for each lane, slack and wavering when apathy has them
    c.strokeStyle = this.mod === 'fade' ? '#555' : '#666';
    c.lineWidth = 1.5;
    for (let i = 0; i <= g.n; i++) {
      const a = g.start + g.size * i;
      c.beginPath();
      const steps = 24;
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        const al = g.far + (g.near - g.far) * t;
        const sag = this.mod === 'fade' ? Math.sin(t * Math.PI) * g.size * 0.12 * Math.sin(now * 1.3 + i) : 0;
        const [x, y] = g.vertical ? [a + sag, al] : [al, a + sag];
        k ? c.lineTo(x, y) : c.moveTo(x, y);
      }
      c.stroke();
    }
    // the hit line, and each lane's target
    for (let i = 0; i < g.n; i++) {
      const [x, y] = pt(i, g.near);
      const lit = this.down.has(lanes[i]);
      this.glyph(c, lanes[i], x, y, g.size * 0.36, lit ? '#fff' : '#9a9a9a', lit, true);
    }
    // the dark: only a pool of light round the hit line
    const reveal = this.mod === 'dark' ? 0.4 : 1.2;
    for (const n of this.notes) {
      const t = this.timeOf(n);
      const pos = (t - now) / span;               // 1 at the far end, 0 at the hit line
      const tail = n.len ? (t + n.len * this.clock.subInterval - now) / span : pos;
      if (tail < -0.15 || pos > 1.05) continue;
      if (n.judged && n.judged !== 'miss' && !(n.len && n.held)) continue;
      let li = lanes.indexOf(n.lane);
      let alpha = n.judged === 'miss' ? 0.25 : 1;
      if (this.mod === 'dark') alpha *= Math.max(0, Math.min(1, (reveal - pos) / 0.12));
      if (alpha <= 0.01) continue;
      // chaos: notes start in the wrong lane and settle before they land
      let laneAt = li;
      if (this.mod === 'scatter') {
        const k = Math.max(0, Math.min(1, (pos - 0.38) / 0.25));
        laneAt = li + (n.from - li) * k + Math.sin(now * 7 + n.i) * 0.18 * k;
      }
      const alongAt = (p) => g.near + (g.far - g.near) * Math.max(0, p);
      const a0 = alongAt(Math.max(0, pos));
      const [x, y] = g.vertical ? [g.start + g.size * (laneAt + 0.5), a0] : [a0, g.start + g.size * (laneAt + 0.5)];
      c.globalAlpha = alpha;
      if (n.len) {
        const a1 = alongAt(Math.min(1.05, tail));
        c.strokeStyle = ink; c.lineWidth = g.size * 0.14;
        c.beginPath();
        if (g.vertical) { c.moveTo(x, a0); c.lineTo(x, a1); } else { c.moveTo(a0, y); c.lineTo(a1, y); }
        c.stroke();
      }
      this.glyph(c, n.lane, x, y, g.size * 0.32, ink, true, false);
      c.globalAlpha = 1;
    }
    // judgement words, rising off the hit line
    for (const p of this.pops) {
      const li = lanes.indexOf(p.lane);
      const k = (now - p.t) / 0.6;
      const [x, y] = pt(li, g.near);
      const off = g.size * (0.55 + k * 0.6) * (g.near < g.far ? 1 : -1);
      c.globalAlpha = 1 - k;
      text(c, p.word, g.vertical ? x : x + off, g.vertical ? y + off - 8 : y - 8, { size: Math.round(g.size * 0.26), font: MONO, color: p.good ? '#fff' : '#8a8a8a' });
    }
    c.globalAlpha = 1;
    c.restore();
  }

  // A lane's mark: a chevron for a direction, a ring with its letter for A or B.
  glyph(c, lane, x, y, r, ink, fill, target) {
    c.save();
    c.strokeStyle = ink; c.fillStyle = ink; c.lineWidth = target ? 2 : 3;
    c.lineJoin = 'round'; c.lineCap = 'round';
    if (ARROW[lane]) {
      const [dx, dy] = ARROW[lane];
      const px = -dy, py = dx;
      c.beginPath();
      c.moveTo(x + dx * r, y + dy * r);
      c.lineTo(x - dx * r * 0.2 + px * r * 0.85, y - dy * r * 0.2 + py * r * 0.85);
      c.lineTo(x - dx * r * 0.2 - px * r * 0.85, y - dy * r * 0.2 - py * r * 0.85);
      c.closePath();
      if (fill && !target) c.fill(); else c.stroke();
      if (fill && target) { c.globalAlpha = 0.35; c.fill(); }
    } else {
      c.beginPath(); c.arc(x, y, r * 0.8, 0, Math.PI * 2);
      if (fill && !target) c.fill(); else c.stroke();
      c.fillStyle = fill && !target ? '#000' : ink;
      c.font = `700 ${Math.round(r)}px ${MONO}`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.globalAlpha = 1;
      c.fillText(lane.toUpperCase(), x, y + 1);
    }
    c.restore();
  }
}

// ---- a tube run ------------------------------------------------------------------------

export class RhythmScene extends SceneBase {
  get defaultCue() { return 'march'; }

  enter() {
    const reverse = !!this.opts.reverse;
    const chart = parseChart(this.sc.chart ?? {}, { scores: this.env.scores, reverse });
    this.run = new RhythmRun(this.env, {
      chart, music: this.music, family: this.sc.family ?? 'keys', octave: this.sc.octave ?? 5,
      orient: this.sc.orient ?? 'vertical', lead: this.sc.lead ?? 2, reverse, mod: this.sc.mod ?? null, seed: this.sc.id,
    });
    this.state = 'ready';
    this.say(this.sc.say ?? (reverse ? `${this.sc.title}, the other way.` : this.sc.title), this.sc.who ?? null);
  }

  onTick(ev) {
    if (this.state === 'ready') {
      // A bar's count-in, starting on the next downbeat.
      let i = ev.index + 1;
      while (i % 16) i++;
      this.run.begin(i + 16);
      this.countFrom = i;
      this.state = 'run';
    }
    if (this.state === 'run') {
      const into = ev.index - this.countFrom;
      if (into >= 0 && into < 16 && ev.isBeat) this.env.audio.click(ev.time, into === 0);
      this.run.tick(ev);
      if (this.run.done) { this.state = 'results'; this.at = this.beats; this.cue = this.env.makeCue('resolve', this.music); }
    } else if (this.state === 'results' && this.auto && this.beats - this.at > 3) this.finish(this.result());
  }

  frame() { this.run?.frame(); }

  hold(dir, on) {
    if (this.state !== 'run') return;
    if (on) this.run.press(dir); else this.run.release(dir);
  }

  onPress(btn) {
    if (this.state === 'results' && (btn === 'a' || btn === 'b')) { this.finish(this.result()); return true; }
    if (this.state === 'run' && this.run.chart.lanes.includes(btn)) { this.run.press(btn); return true; }
    return false;
  }

  result() { return { accuracy: this.run.accuracy, stats: this.run.stats }; }

  draw(c, w, h) {
    const vertical = this.run.orient === 'vertical';
    c.save(); c.globalAlpha = 0.22;
    sketch(this.env, c, 'tube', 0, 0, w, h, { orient: vertical ? 'vertical' : 'horizontal', t: this.beats * (this.run.reverse ? -1 : 1) });
    c.restore();
    this.run.draw(c, { x: w * 0.06, y: h * 0.06, w: w * 0.88, h: h * 0.88 });
    // Coda rides the pipe beside the hit line, bobbing on each note played.
    const g = this.run.laneRect({ x: w * 0.06, y: h * 0.06, w: w * 0.88, h: h * 0.88 });
    const bob = Math.sin(this.beats * Math.PI) * 3;
    // Coda: beside the lanes if there is room, else tucked past the hit line.
    const s = w * 0.11;
    const margin = g.start;
    if (vertical && margin > s + 6) sketch(this.env, c, 'coda', margin - s - 4, g.near - s * 0.6 + bob, s, s * 1.2, { pose: 'fall', t: this.beats * 0.25, live: true });
    else if (vertical) {
      const y = this.run.reverse ? h * 0.01 : g.near + g.size * 0.42;
      sketch(this.env, c, 'coda', w / 2 - s * 0.4, y + bob * 0.5, s * 0.8, s * 0.95, { pose: 'fall', t: this.beats * 0.25, live: true });
    } else sketch(this.env, c, 'coda', g.near - s / 2 + bob, h * 0.01, s, s * 1.2, { pose: 'walk', t: this.beats, live: true });
    // progress along the pipe
    c.fillStyle = '#fff';
    c.fillRect(0, h - 3, w * this.run.progress, 3);
    if (this.state === 'results') {
      const s2 = this.run.stats;
      c.fillStyle = 'rgba(0,0,0,0.8)'; c.fillRect(w * 0.12, h * 0.3, w * 0.76, h * 0.36);
      c.strokeStyle = '#fff'; c.lineWidth = 2; c.strokeRect(w * 0.12, h * 0.3, w * 0.76, h * 0.36);
      text(c, this.sc.endTitle ?? 'Out of the pipe', w / 2, h * 0.34, { size: Math.round(w * 0.05) });
      text(c, `${Math.round(this.run.accuracy * 100)}% in tune`, w / 2, h * 0.43, { size: Math.round(w * 0.065) });
      text(c, `♪ ${s2.perfect}   ok ${s2.good}   sour ${s2.miss}   best run ${s2.best}`, w / 2, h * 0.54, { size: Math.round(w * 0.032), font: MONO, color: '#bdbdbd' });
      this.hint(c, w, h, 'A continue');
    } else {
      this.hint(c, w, h, `${this.run.chart.lanes.map(l => ({ left: '◀', down: '▼', up: '▲', right: '▶', a: 'A', b: 'B' }[l])).join(' ')} · R skip`);
    }
  }

  devLines() {
    const s = this.run?.stats;
    return s ? [`${this.state}${this.run.reverse ? ' (reverse)' : ''} · step ${this.run.lastStep}/${this.run.chart.steps} · ♪${s.perfect} ok${s.good} sour${s.miss} · ±${Math.round(this.run.win.good * 1000)}ms`] : [];
  }
}

// ---- a boss --------------------------------------------------------------------------------
//
// The boss speaks, then each phase is a run with the boss's twist, the boss drawn
// above the lanes. When the last phase is over it RESOLVES: its drawing turns from
// jagged to curled and the scene's mode turns from its struggle (locrian, phrygian,
// aeolian) to something at rest. There is no failing a phase yet (a note for the
// design: should there be?). Accuracy only fills the meter.
//
//   { "kind": "boss", "name": "The Squall", "draw": "boss.squall", "music": { "mood": "unhinged" },
//     "resolvedMood": "mysterious", "intro": "...", "resolve": "...",
//     "phases": [{ "say": "...", "mod": "scatter", "chart": { ... }, "bpm": 96, "cue": "wind" }] }

export class BossScene extends SceneBase {
  get defaultCue() { return 'tense'; }

  enter() {
    this.phases = this.sc.phases?.length ? this.sc.phases : [{ chart: { bars: ['L...D...U...R...'] } }];
    this.pi = -1;
    this.state = 'intro';
    this.meter = 0;
    this.resolved = false;
    this.speak(this.sc.intro ?? `${this.sc.name ?? this.sc.title} blocks the way.`);
  }

  speak(str) { this.env.dialog.show(str, this.sc.name ?? this.sc.title); }

  get phase() { return this.phases[this.pi]; }

  nextPhase() {
    this.pi++;
    if (this.pi >= this.phases.length) { this.resolve(); return; }
    const ph = this.phase;
    if (ph.bpm) this.music.bpm = ph.bpm;
    if (ph.cue) this.cue = this.env.makeCue(ph.cue, this.music);
    const chart = parseChart(ph.chart ?? {}, { scores: this.env.scores });
    this.run = new RhythmRun(this.env, {
      chart, music: this.music, family: ph.family ?? this.sc.family ?? 'keys', octave: ph.octave ?? 5,
      orient: 'vertical', lead: ph.lead ?? 2, mod: ph.mod ?? null, seed: `${this.sc.id}:${this.pi}`,
    });
    this.state = 'say';
    this.at = this.beats;
    this.speak(ph.say ?? `Phase ${this.pi + 1}.`);
  }

  resolve() {
    this.state = 'resolve';
    this.at = this.beats;
    this.resolved = true;
    if (this.sc.resolvedMood) this.music.setMood(this.sc.resolvedMood);
    if (this.sc.resolvedBpm) this.music.bpm = this.sc.resolvedBpm;
    this.cue = this.env.makeCue('resolve', this.music);
    this.later = this.env.makeCue(this.sc.resolvedCue ?? 'hush', this.music);
    this.speak(this.sc.resolve ?? 'It resolves.');
  }

  onTick(ev) {
    if (this.state === 'resolve' && this.beats - this.at > 4 && this.later) { this.cue = this.later; this.later = null; }
    if (this.state === 'intro' && this.auto && this.beats > 2) this.nextPhase();
    else if (this.state === 'say' && this.auto && this.beats - this.at > 2) this.startRun(ev);
    else if (this.state === 'run') {
      const into = ev.index - this.countFrom;
      if (into >= 0 && into < 16 && ev.isBeat) this.env.audio.click(ev.time, into === 0);
      this.run.tick(ev);
      if (this.run.done) {
        this.meter += this.run.accuracy / this.phases.length;
        this.nextPhase();
      }
    } else if (this.state === 'resolve' && this.auto && this.beats - this.at > 4) this.finish({ meter: this.meter });
    if (this.state === 'say' && this.wantRun) { this.wantRun = false; this.startRun(ev); }
  }

  startRun(ev) {
    let i = ev.index + 1;
    while (i % 16) i++;
    this.run.begin(i + 16);
    this.countFrom = i;
    this.state = 'run';
    this.env.dialog.show('', '');
  }

  frame() { if (this.state === 'run') this.run.frame(); }

  hold(dir, on) {
    if (this.state !== 'run') return;
    if (on) this.run.press(dir); else this.run.release(dir);
  }

  onPress(btn) {
    const typing = this.env.dialog.typing;
    if ((btn === 'a' || btn === 'b') && typing && this.state !== 'run') { this.env.dialog.finish(); return true; }
    if (this.state === 'intro' && btn === 'a') { this.nextPhase(); return true; }
    if (this.state === 'say' && btn === 'a') { this.wantRun = true; return true; }
    if (this.state === 'resolve' && btn === 'a' && this.beats - this.at > 1) { this.finish({ meter: this.meter }); return true; }
    if (this.state === 'run' && this.run.chart.lanes.includes(btn)) { this.run.press(btn); return true; }
    if (btn === 'l' && this.dev && this.state === 'run') { this.run.done = true; return true; }
    return false;
  }

  dismissed() {
    if (this.state === 'intro') this.nextPhase();
    else if (this.state === 'say') this.wantRun = true;
    else if (this.state === 'resolve' && this.beats - this.at > 1) this.finish({ meter: this.meter });
  }

  draw(c, w, h) {
    const running = this.state === 'run';
    const bw = running ? w * 0.5 : w * 0.78;
    const bh = running ? h * 0.36 : h * 0.72;
    const sway = Math.sin(this.beats * Math.PI / 2) * (this.resolved ? 1 : 4);
    sketch(this.env, c, this.sc.draw ?? 'boss.squall', (w - bw) / 2 + sway, running ? h * 0.01 : h * 0.08, bw, bh, { resolved: this.resolved, t: this.beats });
    // the meter: how far the struggle has resolved, as forks lit
    const n = Math.max(3, this.phases.length * 2);
    const lit = Math.round(this.meter * n);
    text(c, Array.from({ length: n }, (_, i) => (i < lit ? '◆' : '◇')).join(' '), w / 2, 6, { size: Math.round(w * 0.03), font: MONO });
    if (running) this.run.draw(c, { x: w * 0.06, y: h * 0.36, w: w * 0.88, h: h * 0.62 });
    if (this.state === 'say') text(c, `${this.pi + 1} / ${this.phases.length}`, w / 2, h * 0.82, { size: Math.round(w * 0.035), font: MONO, color: '#9a9a9a' });
    this.hint(c, w, h, running ? 'D-pad · R skip' : 'A');
  }

  devLines() {
    const s = this.run?.stats;
    return [`${this.state} · phase ${this.pi + 1}/${this.phases.length}${this.phase?.mod ? ` (${this.phase.mod})` : ''} · meter ${(this.meter * 100).toFixed(0)}%${s ? ` · ♪${s.perfect} ok${s.good} sour${s.miss}` : ''}`, 'L ends the phase'];
  }
}
