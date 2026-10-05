// BRR, the SNES's sample format ("Bit Rate Reduction"). fullsnes, "BRR Samples".
//
// Sixteen samples go into 9 bytes: a header, then sixteen 4-bit numbers. A 4-bit
// number can only say -8..7, so the header says two things about them:
//
//   shift   how far to scale each one up (0..12): a loud block uses a big shift
//           and loses its fine detail, a quiet one keeps it
//   filter  what to add to it (0..3): a guess at the next sample from the last
//           two. Filter 0 guesses nothing; 1..3 extrapolate, so for a smooth wave
//           the 4 bits only have to carry the small error in the guess.
//
// That is roughly 3.6:1 against 16-bit audio, and it costs a little hiss and grit,
// which is part of the sound. The header's low two bits mark the last block, and
// whether the voice then jumps back to the loop block or stops.
//
// Samples here are the chip's 15-bit values, -4000h..3FFFh.

export const BLOCK = 16;   // samples per block
const FLAG_END = 1, FLAG_LOOP = 2;

// One sample out of one nibble, given the two before it. The exact integer
// formulas from fullsnes, including what happens when a value overflows.
export function decodeSample(nib, shift, filter, p1, p2) {
  let s = shift <= 12 ? (nib << shift) >> 1 : ((nib >> 3) << 12) >> 1;
  if (filter === 1) s += p1 + ((-p1) >> 4);
  else if (filter === 2) s += p1 * 2 + ((-p1 * 3) >> 5) - p2 + (p2 >> 4);
  else if (filter === 3) s += p1 * 2 + ((-p1 * 13) >> 6) - p2 + ((p2 * 3) >> 4);
  s = Math.max(-0x8000, Math.min(0x7FFF, s));      // clamp to 16 bits
  return (s << 17) >> 17;                          // then keep 15: overflow wraps
}

// Encode 15-bit samples. `loopStart` (a multiple of 16, or -1 for a one-shot) is
// where the voice jumps back to after the last block.
//
// For every block it tries all four filters and all thirteen shifts, decoding
// each try exactly as the chip will, and keeps the one that comes back closest.
// The first block and the loop block are held to filter 0, because a filter
// leans on the two samples before it, and on a jump those are not the ones the
// encoder saw.
export function encodeBRR(samples, loopStart = -1) {
  const n = Math.ceil(samples.length / BLOCK) * BLOCK;
  const blocks = n / BLOCK;
  const loopBlock = loopStart < 0 ? -1 : loopStart / BLOCK;
  if (loopStart >= 0 && loopStart % BLOCK) throw new Error('BRR loop must start on a 16-sample block');
  const bytes = new Uint8Array(blocks * 9);
  const nibs = new Int8Array(BLOCK), best = new Int8Array(BLOCK);
  let p1 = 0, p2 = 0;
  for (let b = 0; b < blocks; b++) {
    let bestErr = Infinity, bestF = 0, bestS = 0, b1 = 0, b2 = 0;
    const filters = b === 0 || b === loopBlock ? 1 : 4;
    for (let f = 0; f < filters; f++) {
      for (let shift = 0; shift <= 12; shift++) {
        let q1 = p1, q2 = p2, err = 0;
        for (let k = 0; k < BLOCK && err < bestErr; k++) {
          const x = samples[b * BLOCK + k] ?? 0;
          const guess = decodeSample(0, shift, f, q1, q2);
          const nib = Math.max(-8, Math.min(7, Math.round(((x - guess) * 2) / (1 << shift))));
          const y = decodeSample(nib, shift, f, q1, q2);
          err += (y - x) * (y - x);
          nibs[k] = nib;
          q2 = q1; q1 = y;
        }
        if (err < bestErr) { bestErr = err; bestF = f; bestS = shift; b1 = q1; b2 = q2; best.set(nibs); }
      }
    }
    const last = b === blocks - 1;
    const o = b * 9;
    bytes[o] = (bestS << 4) | (bestF << 2) | (last ? FLAG_END | (loopBlock >= 0 ? FLAG_LOOP : 0) : 0);
    for (let k = 0; k < BLOCK; k += 2) bytes[o + 1 + k / 2] = ((best[k] & 0xF) << 4) | (best[k + 1] & 0xF);
    p1 = b1; p2 = b2;
  }
  return { brr: bytes, loopBlock };
}

// A reader that plays a sample the way a voice does: block by block, carrying the
// filter's two samples across blocks (and across the jump back to the loop), and
// returning null once a one-shot has played its last block.
export function reader({ brr, loopBlock }) {
  const blocks = brr.length / 9;
  const buf = new Int16Array(BLOCK);
  let block = 0, pos = BLOCK, p1 = 0, p2 = 0, flags = 0, done = false;
  const load = () => {
    const o = block * 9, head = brr[o];
    const shift = head >> 4, filter = (head >> 2) & 3;
    flags = head & 3;
    for (let k = 0; k < BLOCK; k++) {
      const byte = brr[o + 1 + (k >> 1)];
      const nib = ((k & 1 ? byte << 4 : byte) << 24) >> 28;   // sign-extend the 4 bits
      const s = decodeSample(nib, shift, filter, p1, p2);
      buf[k] = s; p2 = p1; p1 = s;
    }
    pos = 0;
  };
  load();
  return {
    next() {
      if (done) return null;
      if (pos === BLOCK) {
        if (flags & FLAG_END) {
          if (!(flags & FLAG_LOOP) || loopBlock < 0) { done = true; return null; }
          block = loopBlock;
        } else block = Math.min(block + 1, blocks - 1);
        load();
      }
      return buf[pos++];
    },
  };
}

// Decode a whole sample once through (no looping), for tests and measuring.
export function decodeBRR(sample) {
  const r = reader({ ...sample, loopBlock: -1 }), out = [];
  for (let s = r.next(); s !== null; s = r.next()) out.push(s);
  return Int16Array.from(out);
}
