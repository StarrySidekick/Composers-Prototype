// The SNES sound: the game's notes played through an emulated SNES sound chip.
//
// How a note gets from AudioEngine.play to the speaker:
//
//   1. Pick the patch for its family (rom.js PATCHES) and work out the chip's
//      pitch register for its frequency (dsp.js pitchFor).
//   2. Render the note once, exactly as one of the chip's voices would: decode the
//      BRR sample, interpolate it at that pitch, apply the ADSR, key off after the
//      patch's hold (dsp.js renderVoice). The result is a 32 kHz buffer, cached by
//      patch and pitch, so a tune's repeated notes cost nothing after the first.
//   3. Hand it to Web Audio at the note's time. Web Audio resamples the 32 kHz
//      buffer to the device's rate, which is the chip's DAC: nothing above 16 kHz.
//   4. Eight voices, like the chip. A ninth note takes the voice of the oldest one
//      still sounding, which is cut with the chip's 8 ms release.
//   5. Everything (bar the hi-hat and the metronome) also goes to the echo: a
//      ConvolverNode holding the chip's echo as an impulse response (dsp.js
//      echoResponse). Two settings, ECHO below.

import { RATE, renderVoice, pitchFor, echoResponse } from './dsp.js';
import { reader } from './brr.js';
import { buildRom, PATCHES } from './rom.js';
import { midiToFreq } from '../../core/music.js';

export const VOICES = 8;
const CACHE = 160;     // rendered notes kept: a few rooms' worth of scales

// Two echoes, the chip's registers as numbers (see echoResponse in dsp.js).
//   room: short and light, a stone room. In the spirit of A Link to the Past.
//   cave: longer, more feedback, and a filter that dulls every repeat further,
//         so it sinks into a dark wash. In the spirit of Super Metroid.
// Not either game's actual settings: tune these by ear.
export const ECHO = {
  room: { edl: 4, efb: 0x30, evol: 0x24, fir: [0x0C, 0x21, 0x2B, 0x2B, 0x13, 0xFE, 0xF3, 0xF9] },
  cave: { edl: 8, efb: 0x58, evol: 0x34, fir: [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x10] },
};

// Which patch a sound plays: the family, or for percussion the piece of the kit
// (the same mapping as AudioEngine._drum).
export function patchFor(family, kind, modulation = 0) {
  if (family === 'percussion') {
    const k = kind ?? (modulation < 0.25 ? 'bass' : modulation < 0.75 ? 'snare' : 'hat');
    return PATCHES[k] ? k : 'snare';
  }
  if (family === 'sour') return 'brass';
  return PATCHES[family] ? family : 'brass';
}

export class SnesSound {
  constructor(ctx, destination) {
    this.ctx = ctx;
    this.rom = buildRom();
    this.cache = new Map();
    this.voices = [];               // { src, gain, start, end }

    this.out = ctx.createGain();     // the main volume
    this.out.gain.value = 0.9;
    this.out.connect(destination);
    this.send = ctx.createGain();    // what goes to the echo (the chip's EON)
    this.destination = destination;
    this.echo = null;
    this.setEcho('room');
  }

  // A new ConvolverNode per change rather than a new buffer in the old one: some
  // older Safaris let a convolver's buffer be set only once.
  setEcho(name) {
    const regs = ECHO[name] ?? ECHO.room;
    this.echoName = ECHO[name] ? name : 'room';
    const echo = this.ctx.createConvolver();
    echo.normalize = false;
    echo.buffer = this._buffer(echoResponse(regs), RATE / this.ctx.sampleRate, this.ctx.sampleRate);
    if (this.echo) { this.send.disconnect(this.echo); this.echo.disconnect(); }
    this.send.connect(echo);
    echo.connect(this.destination);
    this.echo = echo;
  }

  // A 32 kHz float signal as an AudioBuffer. Notes keep their 32 kHz (Web Audio
  // resamples on playback); the echo's impulse has to be at the context's own
  // rate for a ConvolverNode, so it is resampled here (linearly, and scaled so its
  // level is unchanged: it has nothing above 16 kHz to alias).
  _buffer(x, scale = 1, rate = RATE) {
    if (rate === RATE) {
      const b = this.ctx.createBuffer(1, Math.max(1, x.length), RATE);
      b.copyToChannel(x, 0);
      return b;
    }
    const n = Math.max(1, Math.round((x.length * rate) / RATE));
    const b = this.ctx.createBuffer(1, n, rate);
    const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) {
      const p = (i * RATE) / rate, j = Math.floor(p), f = p - j;
      d[i] = ((x[j] ?? 0) * (1 - f) + (x[j + 1] ?? 0) * f) * scale;
    }
    return b;
  }

  // The rendered note for a patch at a pitch register, made once and kept. A
  // harp note is about 140 KB of floats, so the cache keeps the CACHE most recently
  // played (a Map remembers insertion order: re-inserting a hit moves it last).
  note(name, pitch) {
    const key = `${name}:${pitch}`;
    let b = this.cache.get(key);
    if (b) { this.cache.delete(key); this.cache.set(key, b); }
    else {
      const p = PATCHES[name];
      const pcm = renderVoice({
        sample: p.sample ? this.rom.samples[p.sample] : null,
        noise: p.noise ?? null,
        pitch, adsr: p.adsr, vibrato: p.vibrato ?? null,
        hold: Math.round(p.hold * RATE),
        decode: reader,
      });
      b = this._buffer(pcm);
      if (this.cache.size >= CACHE) this.cache.delete(this.cache.keys().next().value);
      this.cache.set(key, b);
    }
    return b;
  }

  // The pitch register a patch plays a note at.
  pitchOf(name, midi, detune = 1) {
    const p = PATCHES[name];
    const freq = midiToFreq(midi) * detune;
    if (p.noise != null) return 0x1000;
    if (p.pitch) {
      if (!p.track) return p.pitch;
      const [lo, hi] = p.track;   // a tom follows the note a little, within reason
      return Math.round(p.pitch * Math.max(lo, Math.min(hi, freq / 196)));
    }
    return pitchFor(freq, this.rom.samples[p.sample].freq);
  }

  // Take a voice for a note from t to end: a free one, or the oldest.
  _voice(t, end) {
    let v = this.voices.find(v => v.end <= t);
    if (!v && this.voices.length < VOICES) { v = {}; this.voices.push(v); }
    if (!v) {
      v = this.voices.reduce((a, b) => (b.start < a.start ? b : a));
      const at = Math.max(t, v.start);
      v.gain.gain.setValueAtTime(v.gain.gain.value, at);
      v.gain.gain.linearRampToValueAtTime(0, at + 0.008);
      v.src.stop(at + 0.008);
      v.stolen = (v.stolen ?? 0) + 1;
    }
    v.start = t; v.end = end;
    return v;
  }

  // Returns false when it cannot play this (the engine then uses its synth voice).
  play({ family, midi, amp = 1, t, kind = null, modulation = 0 }) {
    const name = patchFor(family, kind, modulation);
    const p = PATCHES[name];
    const pitch = this.pitchOf(name, midi, family === 'sour' ? 1.03 : 1);
    this.start(this.note(name, pitch), p, amp, t);
    return true;
  }

  start(buffer, patch, amp, t) {
    const v = this._voice(t, t + buffer.duration);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const g = this.ctx.createGain();
    g.gain.value = patch.vol * amp;
    src.connect(g);
    g.connect(this.out);
    if (patch.echo !== false) g.connect(this.send);
    src.start(t);
    v.src = src; v.gain = g;
    return v;
  }

  // The metronome's tick, a little higher on the downbeat.
  click(t, accent = false) {
    const p = PATCHES.blip;
    this.start(this.note('blip', accent ? 0x1999 : 0x10CD), p, accent ? 1.3 : 0.8, t);
  }

  // How many voices are sounding at time t (for tests).
  busy(t) { return this.voices.filter(v => v.start <= t && v.end > t).length; }
}
