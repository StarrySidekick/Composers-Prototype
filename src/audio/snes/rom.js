// The sample ROM: every instrument the SNES sound plays, as BRR samples.
//
// A real SNES game shipped a handful of short recordings: an attack, then a few
// cycles of the steady tone that loop for as long as the note is held, all of it
// squeezed into what was left of the 64 KB sound RAM after the driver and the echo
// buffer. These are built the same way, except that the "recordings" are made
// here, from harmonics and a seeded noise source, so they are ours to ship and the
// same on every load. Each is then BRR-encoded (brr.js) and from then on is only
// ever heard through the chip's decoder, interpolation and envelope (dsp.js).
//
// Why a loop has to be a whole number of cycles AND a multiple of 16 samples:
// BRR loops jump in whole 16-sample blocks, and a loop that is not a whole
// number of waveform cycles clicks at the seam. A 64-sample cycle at 32 kHz is
// 500 Hz, so every looped sample here is built on a 64- or 128-sample cycle and
// knows the frequency it sounds at when played at pitch 1000h.

import { encodeBRR, BLOCK } from './brr.js';
import { RATE } from './dsp.js';

const TAU = Math.PI * 2;
const PEAK = 0x3C00;          // a little under 15-bit full scale, room for BRR to overshoot

// A small seeded random source (mulberry32), so noise is the same every time.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296 * 2 - 1;
  };
}

// Sum of harmonics, `cycle` samples per period, for `length` samples. amp(n, t)
// is harmonic n's amplitude at time t (seconds), so a timbre can change over the
// attack. Integer harmonics of an integer cycle line up at every cycle boundary,
// which is what makes the loop seamless.
function harmonics(cycle, length, count, amp, rate = RATE) {
  const out = new Float32Array(length);
  for (let n = 1; n <= count && n < cycle / 2; n++) {
    for (let i = 0; i < length; i++) out[i] += amp(n, i / rate) * Math.sin((TAU * n * i) / cycle);
  }
  return out;
}

function normalise(x, peak = PEAK) {
  let m = 0;
  for (const v of x) m = Math.max(m, Math.abs(v));
  return Int16Array.from(x, v => Math.round((v / (m || 1)) * peak));
}

// Attack then loop: `attack` cycles once, then the last `loop` cycles repeat. The
// timbre stops changing where the loop starts, so the loop is the same cycle over.
function looped(cycle, attackCycles, loopCycles, count, amp, extra = null) {
  const length = cycle * (attackCycles + loopCycles);
  const settle = (cycle * attackCycles) / RATE;
  const x = harmonics(cycle, length, count, (n, t) => amp(n, Math.min(t, settle)));
  if (extra) extra(x);
  return { pcm: normalise(x), loopStart: cycle * attackCycles, freq: RATE / cycle };
}

// ---- the instruments ---------------------------------------------------------

// A horn. A bright, slightly nasal spectrum, with the "blat" of a brass attack:
// the upper harmonics arrive over the first 30 ms.
function horn() {
  const target = n => (1 / n ** 0.8) * (1 + 0.9 * Math.exp(-(((n - 4) / 2.2) ** 2))) * (n > 12 ? Math.exp(-(n - 12) / 4) : 1);
  const A = 0.032;  // seconds of attack
  return looped(64, 16, 1, 31, (n, t) => target(n) * Math.exp(-(n - 1) * 0.55 * Math.max(0, 1 - t / A) ** 2));
}

// A harp, for the plucked strings. The spectrum of a string plucked near one end
// (sin(n pi p) / n^2), each harmonic dying faster the higher it is, so the pluck
// is bright for an instant and then round. The envelope does the long fade.
function harp() {
  const p = 0.17;
  return looped(64, 48, 1, 24, (n, t) => (Math.abs(Math.sin(n * Math.PI * p)) / n ** 1.6) * Math.exp(-t * 6 * (n - 1) ** 1.3));
}

// A flute (the Key's own voice, the flutes and the reeds): nearly a sine, a
// little second and third harmonic, and a breath of noise on the attack.
function flute() {
  const noise = rng(7);
  return looped(64, 24, 1, 6, (n, t) => [1, 0.22, 0.1, 0.04, 0.02, 0.01][n - 1] * (n === 2 ? 1 + 1.5 * Math.exp(-t / 0.012) : 1), (x) => {
    // The chiff: noise, smoothed, fading to nothing before the loop begins.
    let lp = 0;
    const end = 64 * 20;
    for (let i = 0; i < end; i++) {
      lp += 0.35 * (noise() - lp);
      x[i] += 0.5 * lp * (1 - i / end) ** 2;
    }
  });
}

// A piano-ish key: bright at the hammer, mellowing fast, plus a click.
function piano() {
  const noise = rng(11);
  return looped(64, 32, 1, 20, (n, t) => (1 / n ** 1.1) * Math.exp(-t * 28 * (n - 1)), (x) => {
    for (let i = 0; i < 48; i++) x[i] += 0.25 * noise() * (1 - i / 48);
  });
}

// "Ah": a single cycle with its strength in the second and third harmonics, the
// little sung syllable the text box speaks in. Just a loop, no attack.
function ah() {
  return looped(64, 0, 1, 8, n => [0.55, 1, 0.7, 0.28, 0.14, 0.08, 0.05, 0.03][n - 1]);
}

// A timpani: a round, dark tone (a 128-sample cycle, so 250 Hz) under a felt thump.
function timpani() {
  const noise = rng(23);
  return looped(128, 8, 1, 6, n => [1, 0.45, 0.22, 0.12, 0.06, 0.03][n - 1], (x) => {
    let lp = 0;
    for (let i = 0; i < 640; i++) { lp += 0.08 * (noise() - lp); x[i] += 2.2 * lp * (1 - i / 640) ** 2; }
  });
}

// A metronome tick: a 32-sample cycle (1 kHz), nearly pure.
function blip() {
  return looped(32, 0, 1, 3, n => [1, 0, 0.2][n - 1]);
}

// The drums are one-shots and stored at 16 kHz, half the chip's rate, to save
// RAM, the way SNES games often did: played at pitch 800h they come out at the
// right speed, and the interpolation smooths over the missing half.
const HALF = RATE / 2;

function oneShot(seconds, fill) {
  const x = new Float32Array(Math.ceil((seconds * HALF) / BLOCK) * BLOCK);
  fill(x, HALF);
  return { pcm: normalise(x), loopStart: -1, freq: null };
}

function kick() {
  const noise = rng(31);
  return oneShot(0.32, (x, r) => {
    let ph = 0;
    for (let i = 0; i < x.length; i++) {
      const t = i / r;
      ph += (TAU * (48 + 120 * Math.exp(-t / 0.028))) / r;
      x[i] = Math.sin(ph) * Math.exp(-t / 0.11) + (i < 40 ? 0.4 * noise() * (1 - i / 40) : 0);
    }
  });
}

function tom() {
  return oneShot(0.26, (x, r) => {
    let ph = 0;
    for (let i = 0; i < x.length; i++) {
      const t = i / r;
      ph += (TAU * (150 + 70 * Math.exp(-t / 0.04))) / r;
      x[i] = Math.sin(ph) * Math.exp(-t / 0.09);
    }
  });
}

function snare() {
  const noise = rng(41);
  return oneShot(0.2, (x, r) => {
    let lp = 0, hp = 0;
    for (let i = 0; i < x.length; i++) {
      const t = i / r;
      const n = noise();
      lp += 0.5 * (n - lp);
      hp = n - lp;                                   // a crude band: no rumble, no fizz
      x[i] = 0.8 * (0.6 * lp + 0.5 * hp) * Math.exp(-t / 0.055) + 0.5 * Math.sin(TAU * 185 * t) * Math.exp(-t / 0.035);
    }
  });
}

const SOURCES = { horn, harp, flute, piano, ah, timpani, blip, kick, tom, snare };

// Build and encode the lot. About 20 KB of BRR: it would fit in a real SNES.
export function buildRom() {
  const samples = {};
  let size = 0;
  for (const [name, make] of Object.entries(SOURCES)) {
    const { pcm, loopStart, freq } = make();
    const brr = encodeBRR(pcm, loopStart);
    samples[name] = { ...brr, freq, pcm };
    size += brr.brr.length;
  }
  return { samples, size };
}

// The noise generator's rate, for the hi-hat and the cymbal. One for the whole
// chip, on the hardware (fullsnes, FLG): 1Eh steps it at 16 kHz.
export const NOISE_RATE = 0x1E;

// What each sound plays: which sample (or the noise generator), its envelope
// (see Envelope in dsp.js), how long the key is held, and its volume. `pitch` is a
// fixed pitch register for the drums; everything else follows the note.
// `echo: false` keeps a voice out of the echo (the chip's EON register).
export const PATCHES = {
  brass:    { sample: 'horn',    adsr: { ar: 12, dr: 4, sl: 5, sr: 12 }, hold: 0.42, vol: 0.42 },
  strings:  { sample: 'harp',    adsr: { ar: 15, dr: 3, sl: 1, sr: 15 }, hold: 1.1,  vol: 0.6 },
  woodwind: { sample: 'flute',   adsr: { ar: 11, dr: 5, sl: 6, sr: 14 }, hold: 0.45, vol: 0.4,
              vibrato: { delay: 0.12, rate: 5.5, depth: 0.18 } },
  keys:     { sample: 'piano',   adsr: { ar: 15, dr: 3, sl: 3, sr: 16 }, hold: 0.9,  vol: 0.45 },
  voice:    { sample: 'ah',      adsr: { ar: 14, dr: 6, sl: 0, sr: 20 }, hold: 0.11, vol: 0.5 },
  timpani:  { sample: 'timpani', adsr: { ar: 15, dr: 2, sl: 2, sr: 14 }, hold: 0.9,  vol: 0.6 },
  bass:     { sample: 'kick',  pitch: 0x800, adsr: { ar: 15, dr: 0, sl: 7, sr: 0 }, hold: 0.4, vol: 0.85 },
  tom:      { sample: 'tom',   pitch: 0x800, adsr: { ar: 15, dr: 0, sl: 7, sr: 0 }, hold: 0.3, vol: 0.65, track: [0.75, 1.35] },
  snare:    { sample: 'snare', pitch: 0x800, adsr: { ar: 15, dr: 0, sl: 7, sr: 0 }, hold: 0.25, vol: 0.5 },
  hat:      { noise: NOISE_RATE, adsr: { ar: 15, dr: 7, sl: 0, sr: 25 }, hold: 0.05, vol: 0.16, echo: false },
  cymbal:   { noise: NOISE_RATE, adsr: { ar: 15, dr: 4, sl: 2, sr: 13 }, hold: 1.3,  vol: 0.12 },
  blip:     { sample: 'blip',    adsr: { ar: 15, dr: 7, sl: 0, sr: 28 }, hold: 0.03, vol: 0.2, echo: false },
};
