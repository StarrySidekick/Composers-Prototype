// The SNES sound chip, the parts of it you can hear.
//
// The Super Nintendo's sound is a small computer of its own: a Sony SPC700 CPU
// running the game's music driver, and the S-DSP, which does the actual sound.
// The DSP plays eight voices at once from 64 KB of shared RAM, and five things it
// does give A Link to the Past and Super Metroid their sound:
//
//   1. BRR samples (brr.js). Instruments are short recordings squeezed to 4 bits
//      a sample, so they are short and a little gritty.
//   2. Gaussian interpolation (GAUSS, below). To play a sample at another pitch
//      the chip reads it faster or slower, and it smooths between the samples it
//      reads with a four-point bell-curve filter. That filter cuts the treble: it
//      is most of the soft, warm, slightly muffled SNES sound.
//   3. 32 kHz output, so nothing above 16 kHz exists at all.
//   4. The ADSR envelope (Envelope, below), stepped at fixed rates from a table.
//   5. The echo (echoResponse, below): a delay line up to 240 ms with an 8-tap
//      filter on the way out and feedback. Super Metroid's caverns are mostly this.
//
// Every number and formula here is from the hardware reference "fullsnes" by
// Martin Korth (problemkaputt.de/fullsnes.htm), sections "SNES APU DSP ...".
// The voice runs in the chip's own integer maths, so the rounding is the chip's.

export const RATE = 32000;

// The DSP's 512-entry interpolation table, from the chip's ROM. For each of 256
// positions between two samples, four weights (entries i, 0FFh-i, 100h+i and
// 1FFh-i) that sum to 7FFh..801h, about 2048, so the result keeps its level.
export const GAUSS = new Int16Array([
  0x000, 0x000, 0x000, 0x000, 0x000, 0x000, 0x000, 0x000, 0x000, 0x000, 0x000, 0x000, 0x000, 0x000, 0x000, 0x000,
  0x001, 0x001, 0x001, 0x001, 0x001, 0x001, 0x001, 0x001, 0x001, 0x001, 0x001, 0x002, 0x002, 0x002, 0x002, 0x002,
  0x002, 0x002, 0x003, 0x003, 0x003, 0x003, 0x003, 0x004, 0x004, 0x004, 0x004, 0x004, 0x005, 0x005, 0x005, 0x005,
  0x006, 0x006, 0x006, 0x006, 0x007, 0x007, 0x007, 0x008, 0x008, 0x008, 0x009, 0x009, 0x009, 0x00a, 0x00a, 0x00a,
  0x00b, 0x00b, 0x00b, 0x00c, 0x00c, 0x00d, 0x00d, 0x00e, 0x00e, 0x00f, 0x00f, 0x00f, 0x010, 0x010, 0x011, 0x011,
  0x012, 0x013, 0x013, 0x014, 0x014, 0x015, 0x015, 0x016, 0x017, 0x017, 0x018, 0x018, 0x019, 0x01a, 0x01b, 0x01b,
  0x01c, 0x01d, 0x01d, 0x01e, 0x01f, 0x020, 0x020, 0x021, 0x022, 0x023, 0x024, 0x024, 0x025, 0x026, 0x027, 0x028,
  0x029, 0x02a, 0x02b, 0x02c, 0x02d, 0x02e, 0x02f, 0x030, 0x031, 0x032, 0x033, 0x034, 0x035, 0x036, 0x037, 0x038,
  0x03a, 0x03b, 0x03c, 0x03d, 0x03e, 0x040, 0x041, 0x042, 0x043, 0x045, 0x046, 0x047, 0x049, 0x04a, 0x04c, 0x04d,
  0x04e, 0x050, 0x051, 0x053, 0x054, 0x056, 0x057, 0x059, 0x05a, 0x05c, 0x05e, 0x05f, 0x061, 0x063, 0x064, 0x066,
  0x068, 0x06a, 0x06b, 0x06d, 0x06f, 0x071, 0x073, 0x075, 0x076, 0x078, 0x07a, 0x07c, 0x07e, 0x080, 0x082, 0x084,
  0x086, 0x089, 0x08b, 0x08d, 0x08f, 0x091, 0x093, 0x096, 0x098, 0x09a, 0x09c, 0x09f, 0x0a1, 0x0a3, 0x0a6, 0x0a8,
  0x0ab, 0x0ad, 0x0af, 0x0b2, 0x0b4, 0x0b7, 0x0ba, 0x0bc, 0x0bf, 0x0c1, 0x0c4, 0x0c7, 0x0c9, 0x0cc, 0x0cf, 0x0d2,
  0x0d4, 0x0d7, 0x0da, 0x0dd, 0x0e0, 0x0e3, 0x0e6, 0x0e9, 0x0ec, 0x0ef, 0x0f2, 0x0f5, 0x0f8, 0x0fb, 0x0fe, 0x101,
  0x104, 0x107, 0x10b, 0x10e, 0x111, 0x114, 0x118, 0x11b, 0x11e, 0x122, 0x125, 0x129, 0x12c, 0x130, 0x133, 0x137,
  0x13a, 0x13e, 0x141, 0x145, 0x148, 0x14c, 0x150, 0x153, 0x157, 0x15b, 0x15f, 0x162, 0x166, 0x16a, 0x16e, 0x172,
  0x176, 0x17a, 0x17d, 0x181, 0x185, 0x189, 0x18d, 0x191, 0x195, 0x19a, 0x19e, 0x1a2, 0x1a6, 0x1aa, 0x1ae, 0x1b2,
  0x1b7, 0x1bb, 0x1bf, 0x1c3, 0x1c8, 0x1cc, 0x1d0, 0x1d5, 0x1d9, 0x1dd, 0x1e2, 0x1e6, 0x1eb, 0x1ef, 0x1f3, 0x1f8,
  0x1fc, 0x201, 0x205, 0x20a, 0x20f, 0x213, 0x218, 0x21c, 0x221, 0x226, 0x22a, 0x22f, 0x233, 0x238, 0x23d, 0x241,
  0x246, 0x24b, 0x250, 0x254, 0x259, 0x25e, 0x263, 0x267, 0x26c, 0x271, 0x276, 0x27b, 0x280, 0x284, 0x289, 0x28e,
  0x293, 0x298, 0x29d, 0x2a2, 0x2a6, 0x2ab, 0x2b0, 0x2b5, 0x2ba, 0x2bf, 0x2c4, 0x2c9, 0x2ce, 0x2d3, 0x2d8, 0x2dc,
  0x2e1, 0x2e6, 0x2eb, 0x2f0, 0x2f5, 0x2fa, 0x2ff, 0x304, 0x309, 0x30e, 0x313, 0x318, 0x31d, 0x322, 0x326, 0x32b,
  0x330, 0x335, 0x33a, 0x33f, 0x344, 0x349, 0x34e, 0x353, 0x357, 0x35c, 0x361, 0x366, 0x36b, 0x370, 0x374, 0x379,
  0x37e, 0x383, 0x388, 0x38c, 0x391, 0x396, 0x39b, 0x39f, 0x3a4, 0x3a9, 0x3ad, 0x3b2, 0x3b7, 0x3bb, 0x3c0, 0x3c5,
  0x3c9, 0x3ce, 0x3d2, 0x3d7, 0x3dc, 0x3e0, 0x3e5, 0x3e9, 0x3ed, 0x3f2, 0x3f6, 0x3fb, 0x3ff, 0x403, 0x408, 0x40c,
  0x410, 0x415, 0x419, 0x41d, 0x421, 0x425, 0x42a, 0x42e, 0x432, 0x436, 0x43a, 0x43e, 0x442, 0x446, 0x44a, 0x44e,
  0x452, 0x455, 0x459, 0x45d, 0x461, 0x465, 0x468, 0x46c, 0x470, 0x473, 0x477, 0x47a, 0x47e, 0x481, 0x485, 0x488,
  0x48c, 0x48f, 0x492, 0x496, 0x499, 0x49c, 0x49f, 0x4a2, 0x4a6, 0x4a9, 0x4ac, 0x4af, 0x4b2, 0x4b5, 0x4b7, 0x4ba,
  0x4bd, 0x4c0, 0x4c3, 0x4c5, 0x4c8, 0x4cb, 0x4cd, 0x4d0, 0x4d2, 0x4d5, 0x4d7, 0x4d9, 0x4dc, 0x4de, 0x4e0, 0x4e3,
  0x4e5, 0x4e7, 0x4e9, 0x4eb, 0x4ed, 0x4ef, 0x4f1, 0x4f3, 0x4f5, 0x4f6, 0x4f8, 0x4fa, 0x4fb, 0x4fd, 0x4ff, 0x500,
  0x502, 0x503, 0x504, 0x506, 0x507, 0x508, 0x50a, 0x50b, 0x50c, 0x50d, 0x50e, 0x50f, 0x510, 0x511, 0x511, 0x512,
  0x513, 0x514, 0x514, 0x515, 0x516, 0x516, 0x517, 0x517, 0x517, 0x518, 0x518, 0x518, 0x518, 0x518, 0x519, 0x519,
]);

// Envelope and noise rates: samples (at 32 kHz) between one step and the next.
// Rate 0 never steps. fullsnes, "ADSR/Gain (and Noise) Rates".
export const RATES = [
  0, 2048, 1536, 1280, 1024, 768, 640, 512, 384, 320, 256, 192, 160, 128, 96, 80,
  64, 48, 40, 32, 24, 20, 16, 12, 10, 8, 6, 5, 4, 3, 2, 1,
];

// The pitch register for a frequency: 1000h plays a sample at 32 kHz, one sample
// in per sample out. Fourteen bits, so 3FFFh (about four times faster, two octaves
// up) is the ceiling, and low notes land on a coarser grid of pitches.
export function pitchFor(freq, sampleFreq) {
  return Math.max(1, Math.min(0x3FFF, Math.round((0x1000 * freq) / sampleFreq)));
}

// ADSR. The level is 11 bits (0..7FFh) and moves one step at a time, at a rate
// from RATES. Attack climbs in straight steps of 32 (or jumps 1024 at the fastest
// setting); decay and sustain fall by 1/256 of the level each step, which is an
// exponential fade; release falls 8 every sample, so any note is gone 256 samples
// (8 ms) after key-off. That short release is why SNES notes stop sharply and the
// echo carries the tail.
//
//   ar 0..15  attack, rate ar*2+1       (15 = instant, 12 = 16 ms, 9 = 64 ms)
//   dr 0..7   decay,  rate dr*2+16      (each step down by 1/256; 3 = time constant 128 ms)
//   sl 0..7   sustain level: decay stops at (sl+1)/8 of full
//   sr 0..31  sustain rate, same fall as decay (0 = hold for ever)
export class Envelope {
  constructor({ ar = 15, dr = 7, sl = 7, sr = 0 } = {}) {
    this.ar = ar; this.dr = dr; this.sl = sl; this.sr = sr;
    this.keyOn();
  }

  keyOn() { this.level = 0; this.phase = 'attack'; this.tick = 0; }
  keyOff() { this.phase = 'release'; }

  // One sample. Returns the level to multiply this sample by.
  step() {
    if (this.phase === 'release') {
      this.level = Math.max(0, this.level - 8);
      return this.level;
    }
    const attack = this.phase === 'attack';
    const rate = attack ? this.ar * 2 + 1 : this.phase === 'decay' ? this.dr * 2 + 16 : this.sr;
    const period = RATES[rate];
    if (period && ++this.tick >= period) {
      this.tick = 0;
      if (attack) this.level += rate === 31 ? 1024 : 32;
      else this.level -= ((this.level - 1) >> 8) + 1;
      this.level = Math.max(0, Math.min(0x7FF, this.level));
    }
    if (attack && this.level >= 0x7E0) { this.phase = 'decay'; this.tick = 0; }
    else if (this.phase === 'decay' && this.level <= (this.sl + 1) * 0x100) { this.phase = 'sustain'; this.tick = 0; }
    return this.level;
  }
}

// Four-point Gaussian interpolation of the four newest 15-bit samples at position
// i (0..255) between them. fullsnes, "4-Point Gaussian Interpolation".
export function gauss(i, oldest, older, old, newest) {
  let out = (GAUSS[0xFF - i] * oldest) >> 10;
  out += (GAUSS[0x1FF - i] * older) >> 10;
  out += (GAUSS[0x100 + i] * old) >> 10;
  out = (out << 16) >> 16;                          // the chip lets this addition wrap
  out += (GAUSS[i] * newest) >> 10;
  out = Math.max(-0x8000, Math.min(0x7FFF, out));   // and saturates this one
  return out >> 1;
}

// The noise generator: a 15-bit shift register, one for the whole chip, stepped
// at a rate from RATES. On the hardware the rate is global (the FLG register), so
// every voice playing noise plays the same noise; and noise skips the Gaussian.
export class Noise {
  constructor(rate) { this.rate = rate; this.u = 0x4000; this.tick = 0; }
  step() {
    const period = RATES[this.rate];
    if (period && ++this.tick >= period) {
      this.tick = 0;
      const u = this.u;
      this.u = ((u >> 1) & 0x3FFF) | (((u ^ (u >> 1)) & 1) << 14);
    }
    return (this.u << 17) >> 17;                    // as a signed 15-bit level
  }
}

// One voice playing one note, as the chip would: decode BRR blocks as it goes,
// interpolate at the pitch, multiply by the envelope; key off after hold samples.
// Returns the note at 32 kHz as floats (15-bit full scale = 1), trimmed where it
// has died away.
//
//   sample    { brr, loopBlock } from brr.js (loopBlock -1: plays once and ends)
//   pitch     the pitch register (pitchFor), or
//   noise     a rate: play the noise generator instead of a sample
//   vibrato   { delay, rate, depth } in seconds, Hz and semitones. Not the chip:
//             the music driver did vibrato by rewriting the pitch register as the
//             note played, and so does this, once a millisecond.
export function renderVoice({ sample = null, pitch = 0x1000, noise = null, adsr, hold, vibrato = null, decode }) {
  const env = new Envelope(adsr);
  const max = hold + 300;
  const out = new Float32Array(max);
  const lfsr = noise != null ? new Noise(noise) : null;
  const src = sample && decode(sample);
  let h0 = 0, h1 = 0, h2 = 0, h3 = 0;
  let counter = 0, p = pitch, ended = false, n = max;
  for (let t = 0; t < max; t++) {
    if (t === hold) env.keyOff();
    if (vibrato && (t & 31) === 0) {
      const s = t / RATE - vibrato.delay;
      const depth = s <= 0 ? 0 : vibrato.depth * Math.min(1, s / 0.15);
      p = Math.max(1, Math.min(0x3FFF, Math.round(pitch * 2 ** (depth * Math.sin(2 * Math.PI * vibrato.rate * s) / 12))));
    }
    const level = env.step();
    const v = lfsr ? lfsr.step() : gauss((counter >> 4) & 0xFF, h0, h1, h2, h3);
    out[t] = ((v * level) >> 11) / 0x4000;
    if (!lfsr) {
      counter += p;
      while (counter >= 0x1000) {
        counter -= 0x1000;
        h0 = h1; h1 = h2; h2 = h3;
        const next = src.next();
        if (next === null) { ended = true; break; }
        h3 = next;
      }
    }
    // A one-shot sample's last block says "end and mute": the envelope drops to 0.
    if (ended || (env.phase === 'release' && level === 0)) { n = t + 1; break; }
  }
  return out.subarray(0, n);
}

// The echo, as an impulse response: what one click sent to the echo comes back as.
// fullsnes, "Echo Registers":
//
//   edl   delay, in 16 ms steps (1..15, so up to 240 ms)
//   efb   feedback, -128..127 (/128): how much of each echo goes round again
//   evol  echo volume, -128..127 (/128): how loud the echoes are in the mix
//   fir   eight signed taps, summing to about 128 for unity. The echo passes
//         through it every time round, so a lowpass makes each repeat duller.
//
// The echo is linear, so this response, convolved with everything sent to it, is
// the echo (the chip's rounding of the faint tail aside). Returns 32 kHz floats.
export function echoResponse({ edl, efb, evol, fir }, seconds = 4) {
  const delay = Math.max(1, edl) * 512;
  const n = Math.round(seconds * RATE);
  const out = new Float32Array(n);
  const ring = new Float32Array(delay);
  const hist = new Float32Array(8);
  const taps = fir.map(b => (b << 24) >> 24);
  let idx = 0, last = 0;
  for (let t = 0; t < n; t++) {
    for (let k = 0; k < 7; k++) hist[k] = hist[k + 1];
    hist[7] = ring[idx];                            // written delay samples ago
    let sum = 0;
    for (let k = 0; k < 8; k++) sum += hist[k] * taps[k];   // taps[0] meets the oldest
    sum /= 128;
    out[t] = (sum * evol) / 128;
    ring[idx] = (t === 0 ? 1 : 0) + (sum * efb) / 128;
    idx = (idx + 1) % delay;
    if (Math.abs(out[t]) > 1e-4) last = t;
  }
  return out.subarray(0, Math.min(n, last + 1));
}
