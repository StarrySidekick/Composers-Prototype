/* Composer's Key — hear the sound settings without a phone
   ---------------------------------------------------------------------
   Renders the level's whole tune (every score layer) through each sound setting
   to a WAV file, with the real engine (AudioEngine, the SNES chip, its echo) on
   an OfflineAudioContext, so what you hear is exactly what the game plays. Then a
   short showcase: each instrument family up a scale, then the drums.

     node tools/sound-demo.mjs [out-dir] [room-id]

   Serve the repo root on :8080 first. Writes out-dir/<setting>.wav (default
   out/). 'live' is skipped: headless Chromium cannot decode the recordings.
   Like the other tools it uses Playwright and is not part of the site.
*/
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const EXEC = process.env.CHROMIUM || '/opt/pw-browsers/chromium';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8080/';
const OUT = process.argv[2] || 'out';
const ROOM = process.argv[3] || 'atrium-00-metronome';

const browser = await chromium.launch({ executablePath: EXEC });
const page = await browser.newPage();
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.CK && window.CK.game?.world, null, { timeout: 20000 });
mkdirSync(OUT, { recursive: true });

for (const sound of ['synth', 'snes room', 'snes cave']) {
  const b64 = await page.evaluate(async ({ sound, roomId }) => {
    const { AudioEngine } = await import('./src/audio/audio-engine.js');
    const { Score } = await import('./src/audio/score.js');
    const world = window.CK.game.world, room = world.room(roomId);
    const sr = 44100;
    const sixteenth = 60 / room.music.bpm / 4;
    const score = new Score(world.score);
    const scoreSteps = score.steps;                       // every bar of the tune once
    const showSteps = 7 * 8 + 6 * 4;                      // seven families, then the kit
    const seconds = (scoreSteps + showSteps + 32) * sixteenth;
    const offline = new OfflineAudioContext(1, Math.ceil(seconds * sr), sr);

    // The engine makes its own AudioContext; for this one, hand it the offline one.
    const Real = window.AudioContext;
    window.AudioContext = function () { return offline; };
    let engine;
    try { engine = new AudioEngine(); } finally { window.AudioContext = Real; }
    engine.setSound(sound);

    // The tune, by its own Score class, every layer in.
    const game = { progress: { metronome: true, layers: new Set(score.layers.map(l => l.id)) }, attract: false, room, audio: engine };
    let i = 0;
    for (; i < scoreSteps + 4; i++) score.tick({ index: i, isBeat: i % 4 === 0, time: 0.05 + i * sixteenth }, game);

    // Then each family up the room's scale, an eighth a note, then the drums.
    let t = 0.05 + (i + 8) * sixteenth;
    for (const family of ['woodwind', 'brass', 'strings', 'keys', 'timpani', 'voice', 'sour']) {
      for (let d = 0; d < 8; d++) {
        engine.play({ family, midi: room.music.getNote(d, family === 'timpani' ? 3 : 4), when: t, heard: false, intensity: 0.8 });
        t += sixteenth;
      }
    }
    for (const kind of ['bass', 'snare', 'hat', 'tom', 'cymbal', 'bass']) {
      engine.play({ family: 'percussion', kind, midi: room.music.getNote(0, 3), when: t, heard: false });
      t += sixteenth * 4;
    }

    const out = (await offline.startRendering()).getChannelData(0);
    // 16-bit PCM WAV.
    const bytes = new Uint8Array(44 + out.length * 2);
    const v = new DataView(bytes.buffer);
    const str = (o, s) => [...s].forEach((c, k) => v.setUint8(o + k, c.charCodeAt(0)));
    str(0, 'RIFF'); v.setUint32(4, 36 + out.length * 2, true); str(8, 'WAVEfmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    str(36, 'data'); v.setUint32(40, out.length * 2, true);
    for (let k = 0; k < out.length; k++) v.setInt16(44 + k * 2, Math.max(-1, Math.min(1, out[k])) * 32767, true);
    let s = '';
    for (let k = 0; k < bytes.length; k += 0x8000) s += String.fromCharCode(...bytes.subarray(k, k + 0x8000));
    return btoa(s);
  }, { sound, roomId: ROOM });
  const file = `${OUT}/${sound.replace(' ', '-')}.wav`;
  writeFileSync(file, Buffer.from(b64, 'base64'));
  console.log(`  wrote ${file}`);
}
await browser.close();
