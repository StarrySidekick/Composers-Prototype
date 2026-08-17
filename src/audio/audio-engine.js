// Web Audio stand-in for FMOD Studio. One synth voice per Strumentini family.
//
// The point is NOT sonic fidelity — it is that a prototype puzzle should sound like
// music the moment you solve it, so you can judge whether a room is any good.
// In Unity these calls become FMOD event instances with the same parameters.

import { midiToFreq } from '../core/music.js';

export class AudioEngine {
  constructor() {
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.7;

    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 6;
    this.master.connect(comp);
    comp.connect(this.ctx.destination);

    // Cheap sense of a big stone room.
    this.send = this.ctx.createGain();
    this.send.gain.value = 0.22;
    const delay = this.ctx.createDelay(1.0);
    delay.delayTime.value = 0.17;
    const fb = this.ctx.createGain();
    fb.gain.value = 0.34;
    const damp = this.ctx.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 2600;
    this.send.connect(delay);
    delay.connect(damp);
    damp.connect(fb);
    fb.connect(delay);
    damp.connect(this.master);

    this.muted = false;
    this._ksCache = new Map();
    this.onNote = null; // (midi, family) => void — the note-lock listener hooks in here
  }

  async resume() {
    if (this.ctx.state !== 'running') await this.ctx.resume();
  }

  get now() { return this.ctx.currentTime; }

  _out(node, gain = 1, sendAmt = 1) {
    const g = this.ctx.createGain();
    g.gain.value = gain;
    node.connect(g);
    g.connect(this.master);
    if (sendAmt > 0) {
      const s = this.ctx.createGain();
      s.gain.value = sendAmt;
      g.connect(s);
      s.connect(this.send);
    }
    return g;
  }

  // Main entry point. family selects the voice; midi is already snapped to the room's scale.
  play({ family = 'brass', midi = 60, intensity = 1, when = 0, modulation = 0 }) {
    if (this.muted) return;
    const t = Math.max(when || this.now, this.now);
    const freq = midiToFreq(midi);
    const amp = Math.max(0.02, Math.min(1, intensity));

    switch (family) {
      case 'strings':    this._pluck(freq, amp, t); break;
      case 'woodwind':   this._reed(freq, amp, t, modulation); break;
      case 'keys':       this._key(freq, amp, t); break;
      case 'percussion': this._drum(freq, amp, t, modulation); break;
      case 'sour':       this._brass(freq * 1.03, amp, t, 0.9); break;
      case 'brass':
      default:           this._brass(freq, amp, t, modulation); break;
    }

    if (this.onNote) this.onNote(midi, family);
  }

  // ---- voices -------------------------------------------------------------

  _brass(freq, amp, t, modulation = 0) {
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;

    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 1.2;
    lp.frequency.setValueAtTime(freq * 1.5, t);
    lp.frequency.linearRampToValueAtTime(freq * (5 + modulation * 6), t + 0.06);
    lp.frequency.exponentialRampToValueAtTime(Math.max(220, freq * 2), t + 0.5);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(amp * 0.35, t + 0.04);
    env.gain.exponentialRampToValueAtTime(amp * 0.18, t + 0.22);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);

    osc.connect(lp); lp.connect(env);
    this._out(env, 1, 0.9);
    osc.start(t); osc.stop(t + 0.8);
  }

  _reed(freq, amp, t, modulation = 0) {
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = freq;

    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(freq * 2.2, t);
    lp.frequency.linearRampToValueAtTime(freq * 4, t + 0.12);
    lp.Q.value = 3;

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(amp * 0.22, t + 0.09);
    env.gain.setValueAtTime(amp * 0.22, t + 0.3);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);

    // breath
    const noise = this.ctx.createBufferSource();
    noise.buffer = this._noiseBuffer();
    const nf = this.ctx.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = freq * 3;
    nf.Q.value = 1;
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(amp * 0.06, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);

    osc.connect(lp); lp.connect(env);
    noise.connect(nf); nf.connect(ng); ng.connect(env);
    this._out(env, 1, 0.8);
    osc.start(t); osc.stop(t + 0.75);
    noise.start(t); noise.stop(t + 0.3);
  }

  // Karplus-Strong, rendered offline into a buffer. Same algorithm and the same
  // constant-ring-time decay solve as String.cs in the Unity project.
  _pluck(freq, amp, t) {
    const buf = this._ksBuffer(freq);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = amp * 0.55;
    src.connect(g);
    this._out(g, 1, 1.0);
    src.start(t);
  }

  _ksBuffer(freq) {
    const key = Math.round(freq * 4);
    if (this._ksCache.has(key)) return this._ksCache.get(key);

    const sr = this.ctx.sampleRate;
    const ring = 0.7;          // TargetRingSeconds
    const maxRing = 2.0;       // MaxRingSeconds
    const n = Math.max(8, Math.round(sr / freq));
    const total = Math.round(sr * maxRing);
    const buf = this.ctx.createBuffer(1, total, sr);
    const out = buf.getChannelData(0);

    const line = new Float32Array(n);
    for (let i = 0; i < n; i++) line[i] = Math.random() * 2 - 1;
    // Pre-smooth so the first cycle reads as a pluck, not a burst of static.
    for (let p = 0; p < 4; p++)
      for (let i = 0; i < n; i++) line[i] = 0.5 * (line[i] + line[(i + 1) % n]);

    // Decay is applied once per delay-line cycle, so solve for -60dB in `ring` seconds
    // regardless of buffer length — otherwise low notes ring far longer than high ones.
    const cycles = (sr * ring) / n;
    const decay = Math.pow(0.001, 1 / cycles);

    let idx = 0;
    for (let i = 0; i < total; i++) {
      const cur = line[idx];
      out[i] = cur;
      line[idx] = 0.5 * (cur + line[(idx + 1) % n]) * decay;
      idx = (idx + 1) % n;
    }

    if (this._ksCache.size > 96) this._ksCache.clear();
    this._ksCache.set(key, buf);
    return buf;
  }

  _key(freq, amp, t) {
    // 2-op FM — bright attack, fast decay. Piano-adjacent without a sample library.
    const carrier = this.ctx.createOscillator();
    carrier.type = 'sine';
    carrier.frequency.value = freq;

    const mod = this.ctx.createOscillator();
    mod.type = 'sine';
    mod.frequency.value = freq * 3;

    const modGain = this.ctx.createGain();
    modGain.gain.setValueAtTime(freq * 3.5, t);
    modGain.gain.exponentialRampToValueAtTime(freq * 0.2, t + 0.25);
    mod.connect(modGain);
    modGain.connect(carrier.frequency);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(amp * 0.4, t + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);

    carrier.connect(env);
    this._out(env, 1, 0.7);
    carrier.start(t); carrier.stop(t + 1.2);
    mod.start(t); mod.stop(t + 1.2);
  }

  // modulation doubles as drum selector: 0 = bass, 0.5 = snare, 1 = hat
  _drum(freq, amp, t, modulation = 0) {
    const kind = modulation < 0.25 ? 'bass' : modulation < 0.75 ? 'snare' : 'hat';
    const env = this.ctx.createGain();

    if (kind === 'bass') {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(Math.max(90, freq), t);
      osc.frequency.exponentialRampToValueAtTime(Math.max(38, freq * 0.35), t + 0.13);
      env.gain.setValueAtTime(amp * 0.85, t);
      env.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      osc.connect(env);
      osc.start(t); osc.stop(t + 0.4);
    } else {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this._noiseBuffer();
      const bp = this.ctx.createBiquadFilter();
      bp.type = kind === 'snare' ? 'bandpass' : 'highpass';
      bp.frequency.value = kind === 'snare' ? 1900 : 7000;
      bp.Q.value = kind === 'snare' ? 0.8 : 1;
      const dur = kind === 'snare' ? 0.19 : 0.055;
      env.gain.setValueAtTime(amp * (kind === 'snare' ? 0.4 : 0.24), t);
      env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      noise.connect(bp); bp.connect(env);
      noise.start(t); noise.stop(t + dur + 0.05);

      if (kind === 'snare') {
        const body = this.ctx.createOscillator();
        body.type = 'triangle';
        body.frequency.setValueAtTime(freq, t);
        const bg = this.ctx.createGain();
        bg.gain.setValueAtTime(amp * 0.2, t);
        bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
        body.connect(bg);
        this._out(bg, 1, 0.5);
        body.start(t); body.stop(t + 0.15);
      }
    }

    this._out(env, 1, 0.6);
  }

  // Metronome tick — the BeatClock made audible while you author a room.
  click(t, accent = false) {
    if (this.muted) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = accent ? 1600 : 1050;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(accent ? 0.05 : 0.028, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t); osc.stop(t + 0.05);
  }

  _noiseBuffer() {
    if (!this._noise) {
      const sr = this.ctx.sampleRate;
      const b = this.ctx.createBuffer(1, sr, sr);
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this._noise = b;
    }
    return this._noise;
  }
}
