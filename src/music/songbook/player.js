// Plays a list of notes in time, looping, through the game's AudioEngine.
//
// Web Audio plays a sound at an exact time on its own clock; JavaScript timers
// are late by whatever else the page is doing. So a timer wakes every 25 ms and
// books every note due in the next 120 ms at its exact audio time ("lookahead
// scheduling"). The timer can be late; the notes cannot.
//
// Notes are { step (sixteenths), midi, family, kind?, vel? }. The writer hands it
// notes made from scale degrees (MusicalState.getNote), as the game would; the
// library hands it your recorded pitches, which is the one place a raw pitch is
// played, because that preview is your record, not the game.

const AHEAD = 0.12, TICK = 25;

export class Player {
  constructor(getAudio) {
    this.getAudio = getAudio;
    this.timer = null;
    this.owner = null;
    this.gen = 0;
  }

  get playing() { return !!this.timer; }

  // `owner` says who started it; `onStep(step|null)` and `onStop()` are that
  // owner's, and starting again for someone else stops the last owner first.
  async play(notes, { bpm = 120, steps, loop = true, click = false, startStep = 0, owner = null, onStep = null, onStop = null } = {}) {
    this.stop();
    const gen = this.gen;               // a later play() or stop() cancels this one
    this.owner = owner;
    this.onStep = onStep;
    this.onStop = onStop;
    const audio = await this.getAudio();
    await audio.resume();
    if (gen !== this.gen) return;
    const sixteenth = 60 / bpm / 4;
    const byStep = new Map();
    for (const n of notes) {
      if (!byStep.has(n.step)) byStep.set(n.step, []);
      byStep.get(n.step).push(n);
    }
    const t0 = audio.now + 0.06;
    let next = startStep;           // the next step to book
    const total = steps ?? Math.max(16, ...notes.map(n => n.step + 1));
    this.t0 = t0 - startStep * sixteenth;
    this.sixteenth = sixteenth;
    this.total = total;
    this.loop = loop;
    const book = () => {
      const horizon = audio.now + AHEAD;
      for (;;) {
        const at = this.t0 + next * sixteenth;
        if (at > horizon) break;
        if (!loop && next >= total) { this.stop(); return; }
        const s = next % total;
        if (click && s % 4 === 0) audio.click(at, s % 16 === 0);
        for (const n of byStep.get(s) ?? []) {
          audio.play({ family: n.family ?? 'keys', kind: n.kind ?? null, midi: n.midi, intensity: (n.vel ?? 100) / 127, when: at, heard: false });
        }
        next++;
      }
      this.onStep?.(this.stepAt(audio.now));
    };
    book();
    this.audio = audio;
    this.timer = setInterval(book, TICK);
    const frame = () => {
      if (!this.timer) return;
      this.onStep?.(this.stepAt(audio.now));
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  // The step sounding now, or null before the first.
  stepAt(t) {
    const k = Math.floor((t - this.t0) / this.sixteenth);
    if (k < 0) return null;
    return this.loop ? k % this.total : Math.min(k, this.total - 1);
  }

  stop() {
    this.gen = (this.gen ?? 0) + 1;
    if (!this.timer) return;
    clearInterval(this.timer);
    cancelAnimationFrame(this.raf);
    this.timer = null;
    const { onStep, onStop } = this;
    this.onStep = this.onStop = this.owner = null;
    onStep?.(null);
    onStop?.();
  }
}

// General MIDI drum keys -> the game's kit pieces.
export function drumKind(key) {
  if (key === 35 || key === 36) return 'bass';
  if (key === 38 || key === 40 || key === 37 || key === 39) return 'snare';
  if (key === 42 || key === 44 || key === 46) return 'hat';
  if (key === 49 || key === 51 || key === 52 || key === 55 || key === 57 || key === 59) return 'cymbal';
  if (key >= 41 && key <= 50) return 'tom';
  return 'hat';
}
