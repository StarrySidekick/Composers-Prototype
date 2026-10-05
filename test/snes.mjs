/* Composer's Key — is the SNES sound really the SNES?
   ---------------------------------------------------------------------
   The SNES setting (src/audio/snes/) emulates the chip's sound path from its
   hardware reference. Nothing else checks it, and an emulation goes wrong
   without a sound: a filter constant off by one, a table entry mistyped, a
   sample built an octave out. A note would still play, just not the chip's
   note, or not the note at all. So this holds it to the reference and to pitch:

     - the BRR decoder gives fullsnes's exact numbers, overflow included
     - the Gaussian table is the chip's (every four weights sum to 7FFh..801h)
       and interpolating a ramp gives a ramp (weights the right way round)
     - the envelope's attack, release and sustain take the chip's times
     - the noise generator runs the full 32767 states before repeating
     - the echo comes back after exactly its delay, dies away, and the cave
       rings longer than the room
     - the ROM's samples survive BRR and the lot fits in 64 KB of sound RAM
     - every instrument plays the note it is asked for, within 10 cents
     - in the game: every family goes through the chip, note locks still hear
       it, eight voices and no more, and the menu switch cycles and is kept

   Serve the repo root on :8080, then `node test/snes.mjs`.
*/
import { chromium } from 'playwright';

const EXEC = process.env.CHROMIUM || '/opt/pw-browsers/chromium';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8080/';

const browser = await chromium.launch({ executablePath: EXEC });
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(String(e)));
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.CK && window.CK.game?.world, null, { timeout: 20000 });

const r = await page.evaluate(async () => {
  const { decodeSample, decodeBRR } = await import('./src/audio/snes/brr.js');
  const { GAUSS, Envelope, Noise, renderVoice, echoResponse, RATE } = await import('./src/audio/snes/dsp.js');
  const { buildRom, PATCHES } = await import('./src/audio/snes/rom.js');
  const { SnesSound, ECHO, VOICES } = await import('./src/audio/snes/index.js');
  const out = {};

  // fullsnes "BRR Samples", worked by hand: shift/filter, then the 15-bit wrap.
  out.vectors = [
    [decodeSample(7, 12, 0, 0, 0), 14336],          // (7 << 12) >> 1
    [decodeSample(0, 0, 1, 1000, 0), 937],          // 1000 + (-1000 >> 4)
    [decodeSample(0, 0, 2, 1000, 500), 1437],       // 2000 + (-3000 >> 5) - 500 + (500 >> 4)
    [decodeSample(0, 0, 3, 1000, 500), 1389],       // 2000 + (-13000 >> 6) - 500 + (1500 >> 4)
    [decodeSample(7, 12, 1, 0x3000, 0), -6912],     // 25856 overflows 15 bits and wraps
    [decodeSample(-1, 13, 0, 0, 0), -2048],         // shift 13 acts as 12 with nibble >> 3
  ].filter(([got, want]) => got !== want);

  // The Gauss table.
  const sums = [];
  for (let i = 0; i < 256; i++) sums.push(GAUSS[i] + GAUSS[0xFF - i] + GAUSS[0x100 + i] + GAUSS[0x1FF - i]);
  out.gaussSums = [Math.min(...sums), Math.max(...sums)];
  out.gaussRising = GAUSS.every((v, i) => i === 0 || i === 256 || v >= GAUSS[i - 1]);

  // A ramp, interpolated slowly at an odd pitch (so every position between two
  // samples comes up), should come out a ramp. Weights the wrong way round slide
  // back at each sample boundary. (Steep enough that the table's rounding, a few
  // units, cannot pass for a fall.)
  let v = 0;
  const ramp = renderVoice({
    sample: {}, decode: () => ({ next: () => (v += 400) }),
    pitch: 0x123, adsr: { ar: 15, dr: 0, sl: 7, sr: 0 }, hold: 500,
  });
  let falls = 0;
  for (let i = 60; i < 490; i++) if (ramp[i] < ramp[i - 1]) falls++;
  out.rampFalls = falls;

  // Envelope times, in samples at 32 kHz.
  const until = (e, cond, max = 100000) => { let t = 0; while (!cond(e) && t < max) { e.step(); t++; } return t; };
  out.attack15 = until(new Envelope({ ar: 15 }), e => e.phase !== 'attack');
  out.attack10 = until(new Envelope({ ar: 10 }), e => e.phase !== 'attack');     // 63 steps of 20
  const rel = new Envelope({ ar: 15, sl: 7 }); until(rel, e => e.phase !== 'attack'); rel.keyOff();
  out.release = until(rel, e => e.level === 0);
  const sus = new Envelope({ ar: 15, dr: 7, sl: 3, sr: 0 }); for (let i = 0; i < 6000; i++) sus.step();
  out.sustain = { phase: sus.phase, level: sus.level };

  // The noise generator's period.
  const nz = new Noise(31), start = nz.u;
  let period = 0;
  do { nz.step(); period++; } while (nz.u !== start && period < 40000);
  out.noisePeriod = period;

  // The echo.
  out.echo = {};
  for (const [name, regs] of Object.entries(ECHO)) {
    const ir = echoResponse(regs);
    const first = ir.findIndex(x => Math.abs(x) > 1e-9);
    const energy = (a, b) => { let s = 0; for (let i = a; i < Math.min(b, ir.length); i++) s += ir[i] * ir[i]; return s; };
    out.echo[name] = {
      first, delay: regs.edl * 512, seconds: ir.length / RATE,
      late: energy(RATE * 0.5, RATE * 4),
      decays: energy(0, RATE * 0.25) > energy(RATE * 0.25, RATE * 0.5) && energy(RATE * 0.25, RATE * 0.5) > energy(RATE * 0.5, RATE * 0.75),
    };
  }

  // The ROM: what each sample loses to BRR, and the 64 KB budget it shares with
  // the driver (call it 16 KB) and the echo buffer (2 KB per 16 ms of delay).
  const rom = buildRom();
  out.romSize = rom.size;
  out.ramUsed = rom.size + 16384 + Math.max(...Object.values(ECHO).map(e => e.edl)) * 2048;
  out.snr = {};
  for (const [name, s] of Object.entries(rom.samples)) {
    const y = decodeBRR(s);
    let e = 0, p = 0;
    for (let i = 0; i < s.pcm.length; i++) { e += (y[i] - s.pcm[i]) ** 2; p += s.pcm[i] ** 2; }
    out.snr[name] = 10 * Math.log10(p / e);
  }

  // Pitch: every pitched patch, rendered exactly as the game plays it, measured
  // by autocorrelation on the steady tone, once the sample has reached its loop
  // (the attack can be mostly noise: a timpani's is a felt thump). The shortest
  // lag that correlates nearly as well as the best one is the period, so a note
  // an octave out shows.
  const ctx = new OfflineAudioContext(1, 1, 44100);
  const chip = new SnesSound(ctx, ctx.destination);
  const pitchOf = (x, want, steady) => {
    const maxLag = Math.ceil((2.2 * RATE) / want);   // room to find an octave down
    const a = Math.ceil(Math.max(0.02 * RATE, steady)), n = Math.min(1600, x.length - a - maxLag);
    const ac = (lag) => { let s = 0, e0 = 0, e1 = 0; for (let i = a; i < a + n; i++) { s += x[i] * x[i + lag]; e0 += x[i] * x[i]; e1 += x[i + lag] * x[i + lag]; } return s / Math.sqrt(e0 * e1 || 1); };
    const lags = [];
    for (let lag = 16; lag < maxLag; lag++) lags.push(ac(lag));
    // Past the first dip (a slow wave still looks like itself a few samples on).
    const dip = Math.max(1, lags.findIndex(c => c < 0.3));
    const best = Math.max(...lags.slice(dip));
    const k = lags.findIndex((c, i) => i > dip && c >= 0.9 * best && c >= lags[i - 1] && c >= (lags[i + 1] ?? -1));
    const y0 = lags[k - 1] ?? lags[k], y1 = lags[k], y2 = lags[k + 1] ?? lags[k];
    const shift = (y0 - y2) / (2 * (y0 - 2 * y1 + y2) || 1);
    return RATE / (k + 16 + shift);
  };
  out.pitch = [];
  const notes = { brass: [48, 60, 72], strings: [48, 60, 72], woodwind: [60, 72, 84], keys: [48, 60, 72], voice: [72, 79], timpani: [36, 43, 48] };
  for (const [name, midis] of Object.entries(notes)) {
    for (const midi of midis) {
      const pitch = chip.pitchOf(name, midi);
      const buf = chip.note(name, pitch);
      const want = 440 * 2 ** ((midi - 69) / 12);
      const steady = (chip.rom.samples[PATCHES[name].sample].loopBlock * 16 * 0x1000) / pitch;
      const hz = pitchOf(buf.getChannelData(0), want, steady);
      out.pitch.push({ name, midi, cents: Math.round(1200 * Math.log2(hz / want)) });
    }
  }

  // In the game's engine.
  const a = window.CK.audio, heard = [];
  const realOnNote = a.onNote;
  a.onNote = (midi, family) => heard.push(family);
  a.setSound('snes room');
  const fams = ['brass', 'strings', 'woodwind', 'keys', 'voice', 'timpani', 'sour', 'percussion'];
  const before = a.snes.voices.length;
  for (const [i, family] of fams.entries()) a.play({ family, midi: 60, when: a.now + 1 + i, room: window.CK.game.room });
  out.allThroughChip = a.snes.voices.length > before && heard.length === fams.length;
  out.heard = heard.join(' ');
  heard.length = 0;
  a.play({ family: 'keys', midi: 60, when: a.now + 9, heard: false });
  out.unheardStaysUnheard = heard.length === 0;

  // Twelve notes at once: eight sound, four take a voice from an older one.
  const t = a.now + 20;
  const stolenBefore = a.snes.voices.reduce((s, v) => s + (v.stolen ?? 0), 0);
  for (let i = 0; i < 12; i++) a.play({ family: 'keys', midi: 60 + i, when: t, heard: false });
  out.busy = a.snes.busy(t + 0.01);
  out.voices = a.snes.voices.length;
  out.stolen = a.snes.voices.reduce((s, v) => s + (v.stolen ?? 0), 0) - stolenBefore;
  out.VOICES = VOICES;

  a.setSound('snes cave');
  out.cave = a.snes.echoName;
  const count = a.snes.voices.reduce((s, v) => s + (v.src ? 1 : 0), 0);
  a.setSound('synth');
  a.play({ family: 'brass', midi: 60, when: a.now + 30, heard: false });
  out.offMeansOff = !a.snesOn && a.snes.voices.reduce((s, v) => s + (v.src ? 1 : 0), 0) === count;
  a.onNote = realOnNote;
  out.patches = Object.keys(PATCHES);
  return out;
});

const fails = [];
const ok = (name, cond, detail = '') =>
  cond ? console.log(`  ok   ${name}`) : fails.push(`${name}${detail ? ' — ' + detail : ''}`);

ok('the BRR decoder gives fullsnes\'s numbers, overflow and all', r.vectors.length === 0, JSON.stringify(r.vectors));
ok('every four Gauss weights sum to 7FFh..801h', r.gaussSums[0] >= 0x7FF && r.gaussSums[1] <= 0x801, r.gaussSums.map(x => x.toString(16)).join('..'));
ok('each half of the Gauss table rises (a bell curve)', r.gaussRising);
ok('interpolating a ramp gives a ramp', r.rampFalls === 0, `${r.rampFalls} steps went down`);
ok('attack 15 is two samples', r.attack15 === 2, r.attack15);
ok('attack 10 is 63 steps of 20 samples', r.attack10 === 1260, r.attack10);
ok('release takes 256 samples (8 ms) from full', r.release === 256, r.release);
ok('decay stops at the sustain level and holds', r.sustain.phase === 'sustain' && r.sustain.level <= 0x400 && r.sustain.level > 0x300, JSON.stringify(r.sustain));
ok('the noise runs all 32767 states before it repeats', r.noisePeriod === 32767, r.noisePeriod);
for (const [name, e] of Object.entries(r.echo)) {
  ok(`the ${name} echo comes back after exactly its delay`, e.first === e.delay, `${e.first} samples, not ${e.delay}`);
  ok(`the ${name} echo dies away`, e.decays && e.seconds < 4, JSON.stringify(e));
}
ok('the cave rings longer than the room', r.echo.cave.late > r.echo.room.late * 4, `${r.echo.cave.late} vs ${r.echo.room.late}`);
for (const [name, db] of Object.entries(r.snr)) ok(`${name} survives BRR (${db.toFixed(1)} dB)`, db >= 20);
ok(`the ROM fits a real SNES: ${r.romSize} bytes, ${r.ramUsed} of 65536 with driver and echo`, r.ramUsed <= 65536);
const off = r.pitch.filter(p => Math.abs(p.cents) > 10);
ok(`every instrument plays its note (${r.pitch.length} notes within 10 cents)`, off.length === 0, off.map(p => `${p.name} ${p.midi}: ${p.cents} cents`).join(', '));
ok('every family goes through the chip, and locks hear it', r.allThroughChip, r.heard);
ok('a note played heard: false stays unheard', r.unheardStaysUnheard);
ok(`eight voices and no more (12 at once: ${r.busy} sound, ${r.stolen} taken over)`, r.busy === 8 && r.voices === 8 && r.stolen === 4 && r.VOICES === 8);
ok('snes cave uses the cave echo', r.cave === 'cave');
ok('switched off, nothing goes through the chip', r.offMeansOff);

// The pause menu's switch: cycles (no 'live' without the recordings) and is kept.
const cycle = [];
for (let i = 0; i < 4; i++) {
  cycle.push(await page.evaluate(() => { document.getElementById('samples').click(); return [window.CK.audio.sound, document.getElementById('samples').textContent]; }));
}
ok('the sound switch cycles synth, snes room, snes cave', cycle.map(c => c[0]).join(',') === 'snes room,snes cave,synth,snes room' && cycle.every(([s, label]) => s === label), JSON.stringify(cycle));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForFunction(() => window.CK && window.CK.game?.world, null, { timeout: 20000 });
const kept = await page.evaluate(() => window.CK.audio.sound);
await page.evaluate(() => localStorage.removeItem('ck-sound-v1'));
ok('and the choice is kept on this device', kept === 'snes room', kept);

const realErrors = pageErrors.filter(e => !/Unable to decode audio data/.test(e));
ok('nothing threw on the page', realErrors.length === 0, realErrors.join(' | '));

await browser.close();
if (fails.length) {
  console.log(`\nFAIL (${fails.length})`);
  for (const f of fails) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('PASS');
