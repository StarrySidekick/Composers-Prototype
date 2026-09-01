// The real recorded instruments from the Unity project (Assets/Sounds), transcoded
// to AAC/m4a so the whole set is 276 KB instead of 7.6 MB of float WAV.
//
// PITCH CAUTION: the source files are misnamed by an octave for the horn. Every
// file was analysed by autocorrelation rather than trusting the filename:
//
//   Cello/C2.wav .. C3.wav  ->  MIDI 36..48  (C2..C3)   — name is correct
//   Horn/C2.wav  .. C3.wav  ->  MIDI 48..60  (C3..C4)   — name is an octave low
//
// Each bank is one chromatic octave, so anything outside it is played by
// resampling the nearest neighbour. Past MAX_STRETCH semitones that stops
// sounding like the instrument, and the caller falls back to the synth voice.

const BASE = 'assets/audio/';
const MAX_STRETCH = 15; // semitones either way before the synth takes over

// file stem -> measured MIDI pitch.
const CHROMATIC = ['c2', 'cs', 'd', 'ds', 'e', 'f', 'fs', 'g', 'gs', 'a', 'as', 'b', 'c3'];

function octaveMap(startMidi) {
  const m = {};
  CHROMATIC.forEach((stem, i) => { m[stem] = startMidi + i; });
  return m;
}

export const BANKS = {
  cello: { dir: 'cello', notes: octaveMap(36) },  // C2..C3
  horn:  { dir: 'horn',  notes: octaveMap(48) },  // C3..C4  (files say C2..C3)
};

export const ONESHOTS = {
  'bass-drum': 'perc/bass-drum.m4a',
  'click':     'perc/click.m4a',
};

export class Sampler {
  constructor(audioCtx) {
    this.ctx = audioCtx;
    this.banks = new Map();   // bank name -> [{ midi, buffer }] sorted by midi
    this.oneshots = new Map();
    this.ready = false;
    this.loading = null;
  }

  // Idempotent: several call sites may ask for samples before the first load
  // finishes, and they should all await the same fetch.
  load() {
    if (this.loading) return this.loading;
    this.loading = this._load();
    return this.loading;
  }

  async _load() {
    const jobs = [];

    for (const [name, { dir, notes }] of Object.entries(BANKS)) {
      const list = [];
      this.banks.set(name, list);
      for (const [stem, midi] of Object.entries(notes)) {
        jobs.push(this._decode(`${BASE}${dir}/${stem}.m4a`)
          .then(buf => { if (buf) list.push({ midi, buffer: buf }); }));
      }
    }

    for (const [name, path] of Object.entries(ONESHOTS)) {
      jobs.push(this._decode(BASE + path)
        .then(buf => { if (buf) this.oneshots.set(name, buf); }));
    }

    await Promise.all(jobs);
    for (const list of this.banks.values()) list.sort((a, b) => a.midi - b.midi);

    this.ready = [...this.banks.values()].some(l => l.length > 0);
    if (!this.ready) console.warn('[sampler] no samples decoded — synth voices only');
    return this;
  }

  async _decode(url) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      const bytes = await res.arrayBuffer();
      // Safari still wants the callback form, so wrap rather than await directly.
      return await new Promise((resolve, reject) =>
        this.ctx.decodeAudioData(bytes, resolve, reject));
    } catch (err) {
      console.warn('[sampler]', url, err.message ?? err);
      return null;
    }
  }

  // Nearest sample by semitone distance. Exact matches play at rate 1.
  nearest(bank, midi) {
    const list = this.banks.get(bank);
    if (!list || !list.length) return null;
    let best = list[0];
    for (const s of list) {
      if (Math.abs(s.midi - midi) < Math.abs(best.midi - midi)) best = s;
    }
    return Math.abs(best.midi - midi) > MAX_STRETCH ? null : best;
  }

  // Returns the started source node, or null if this note can't be sampled —
  // null is the caller's signal to use the synth voice instead.
  play(bank, midi, { gain = 1, when = 0, destination = null } = {}) {
    const s = this.nearest(bank, midi);
    if (!s) return null;

    const src = this.ctx.createBufferSource();
    src.buffer = s.buffer;
    src.playbackRate.value = Math.pow(2, (midi - s.midi) / 12);

    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(g);
    g.connect(destination ?? this.ctx.destination);
    src.start(Math.max(when || this.ctx.currentTime, this.ctx.currentTime));
    return { source: src, out: g };
  }

  playOneShot(name, { gain = 1, when = 0, rate = 1, destination = null } = {}) {
    const buf = this.oneshots.get(name);
    if (!buf) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(g);
    g.connect(destination ?? this.ctx.destination);
    src.start(Math.max(when || this.ctx.currentTime, this.ctx.currentTime));
    return { source: src, out: g };
  }
}
