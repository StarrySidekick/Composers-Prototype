// The BeatClock. Mirrors TempoManager.cs, but driven by AudioContext.currentTime
// instead of frame time so that wave stepping and note scheduling never drift apart.
//
// Waves advance one tile per SUBDIVISION, not per beat (TempoManager.cs divides the
// beat by 4 for its subdivisionInterval; same here).

const LOOKAHEAD = 0.035; // seconds — schedule audio slightly ahead of the wall clock

export class BeatClock {
  constructor(audioCtx, { bpm = 120, subdivisionsPerBeat = 4 } = {}) {
    this.ctx = audioCtx;
    this.bpm = bpm;
    this.subdivisionsPerBeat = subdivisionsPerBeat;
    this.startTime = audioCtx.currentTime;
    this.index = -1; // last fired subdivision
    this.running = false;
  }

  get beatInterval() { return 60 / this.bpm; }
  get subInterval()  { return this.beatInterval / this.subdivisionsPerBeat; }

  start() {
    this.startTime = this.ctx.currentTime;
    this.index = -1;
    this.running = true;
  }

  stop() { this.running = false; }

  setBpm(bpm) {
    if (!bpm || bpm === this.bpm) return;
    // Rebase so the current subdivision keeps its position — no jump on tempo change.
    const anchor = this.timeOf(this.index);
    this.bpm = bpm;
    this.startTime = anchor - this.index * this.subInterval;
  }

  timeOf(index) { return this.startTime + index * this.subInterval; }

  // Returns the subdivisions that have come due since the last call.
  poll() {
    if (!this.running) return [];
    const now = this.ctx.currentTime + LOOKAHEAD;

    // A backgrounded tab stops requestAnimationFrame. Without this the clock would
    // return on the next frame and fire the whole backlog at once — waves teleport
    // and every queued note lands in the same millisecond. Drop the backlog instead.
    if (now - this.timeOf(this.index) > 1) {
      this.startTime = now - this.index * this.subInterval;
    }

    const events = [];
    while (this.timeOf(this.index + 1) <= now) {
      this.index++;
      events.push({
        index: this.index,
        time: this.timeOf(this.index),
        beat: Math.floor(this.index / this.subdivisionsPerBeat),
        isBeat: this.index % this.subdivisionsPerBeat === 0,
        beatInBar: Math.floor(this.index / this.subdivisionsPerBeat) % 4,
      });
      if (events.length > 32) break; // tab was backgrounded; don't fast-forward forever
    }
    return events;
  }

  // 0..1 through the current subdivision — used to interpolate wave positions between tiles.
  get phase() {
    const t = (this.ctx.currentTime - this.timeOf(this.index)) / this.subInterval;
    return Math.max(0, Math.min(1, t));
  }
}
