/* Composer's Key — the songbook, on a phone.
   ---------------------------------------------------------------------
   songbook.html is the motif writer and the library (docs/MUSIC.md). This drives
   it the way a thumb would: a 390 x 844 touch screen, real taps on the grid.

     - it opens on something real (the castle's motif), fits the screen with no
       sideways scroll, and nothing threw
     - tapping the grid places and removes notes, on the degree and sixteenth
       tapped, with the length chosen
     - playing sounds every note through the scale (MusicalState.getNote), on
       time, unheard (heard: false, so a lock could never take it), looping
     - changing the mode keeps the degrees and changes the pitches and the key
       signature
     - the exports are what the game reads: a score layer the game's Score
       accepts, a lock phrase, a .mid with the key signature
     - a saved motif survives a reload
     - the library: a piece from tools/music-library.mjs opens, a clip becomes
       a motif in the piece's key, and the game's own tunes open in the writer
     - on claude.ai (a stand-in for the artifact's db and downloads): a library
       file loads into the database a document per piece and per track, labels
       and motifs are written where a Claude session will look, and a .mid is
       handed over zipped (.mid is not a type the page may offer)

   Serve the repo root on :8080, then `node test/writer.mjs`.
*/
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { writeMidi, readMidi } from '../src/music/midi-file.js';
import { buildLibrary } from '../tools/music-library.mjs';

const EXEC = process.env.CHROMIUM || '/opt/pw-browsers/chromium';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8080/';

let failed = 0;
const ok = (cond, what, detail = '') => {
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${what}${!cond && detail ? `\n         ${detail}` : ''}`);
  if (!cond) failed++;
};

// A small library, made by the real tool from a fake folder.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ck-writer-'));
const tune = [62, 65, 69, 67, 65, 64, 62, 60, 62].map((m, i) => ({ beat: i / 2, beats: 0.5, midi: m, vel: 90 }));
fs.mkdirSync(path.join(tmp, 'Albums/Test Album'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'Albums/Test Album/01 Tide Song.mid'), writeMidi({ bpm: 96, tracks: [{ name: 'Flute', notes: tune }] }));
// Two parts, so there is a piece whose whole arrangement is more than one track.
const bassline = [38, 38, 45, 43].map((m, i) => ({ beat: i, beats: 1, midi: m, vel: 80 }));
fs.writeFileSync(path.join(tmp, 'Albums/Test Album/02 Duet.mid'), writeMidi({ bpm: 96, tracks: [{ name: 'Flute', notes: tune }, { name: 'Cello', notes: bassline }] }));
const library = await buildLibrary([path.join(tmp, 'Albums')], { out: path.join(tmp, 'out'), log: () => {} });
const libraryText = fs.readFileSync(path.join(tmp, 'out/library.json'), 'utf8');

const browser = await chromium.launch({ executablePath: EXEC });
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 };

async function openPage(ctx, { artifact = false } = {}) {
  const page = await ctx.newPage();
  const errors = [];
  // Headless Chromium cannot decode the real samples (the other tests filter the
  // same message); anything else counts.
  page.on('pageerror', e => { if (!/Unable to decode audio data/.test(String(e))) errors.push(String(e)); });
  await page.route('**/library/library.json', r => artifact ? r.fulfill({ status: 404, body: '' }) : r.fulfill({ contentType: 'application/json', body: libraryText }));
  if (artifact) await page.addInitScript(fakeClaude);
  await page.goto(BASE + 'songbook.html', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.CK_SONGBOOK?.writer.motif.notes.length > 0, null, { timeout: 15000 });
  // Record what the engine is asked to play instead of playing it.
  await page.evaluate(async () => {
    const audio = await window.CK_SONGBOOK.getAudio();
    window.played = [];
    audio.play = o => window.played.push({ ...o, at: audio.now });
    audio.click = () => {};
    audio.resume = async () => {};
  });
  return { page, errors };
}

const tapCell = async (page, degree, col) => {
  // A thumb can only tap what is on the screen.
  await page.evaluate(() => {
    const a = document.querySelector('#writer .area');
    a.closest('.grid-wrap').scrollLeft = 0;
    window.scrollTo(0, a.getBoundingClientRect().top + window.scrollY - 8);
  });
  const box = await page.locator('#writer .area').boundingBox();
  await page.touchscreen.tap(box.x + col * 20 + 10, box.y + (14 - degree) * 22 + 11);
};

// ---- the writer ------------------------------------------------------------------
console.log('The writer');
{
  const ctx = await browser.newContext(phone);
  const { page, errors } = await openPage(ctx);
  const first = await page.evaluate(() => ({ name: window.CK_SONGBOOK.writer.motif.name, notes: window.CK_SONGBOOK.writer.motif.notes.length, svg: !!document.querySelector('#w-sheet svg'), wide: document.documentElement.scrollWidth }));
  ok(first.name.includes('castle') && first.notes === 18 && first.svg, 'opens on the castle motif, as sheet music', JSON.stringify(first));
  ok(first.wide <= 390, 'fits a 390 px phone: no sideways scroll', `scrollWidth ${first.wide}`);

  // Clear, then tap do, mi, sol in eighths, and a quarter re.
  await page.getByRole('button', { name: 'Clear' }).click();
  await page.getByRole('button', { name: 'Yes' }).click();
  ok(await page.evaluate(() => window.CK_SONGBOOK.writer.motif.notes.length) === 0, 'Clear asks first, then clears');
  await page.selectOption('#w-bars', '1');
  await tapCell(page, 0, 0);
  await tapCell(page, 2, 2);
  await tapCell(page, 4, 4);
  await page.getByRole('button', { name: 'quarter notes' }).tap();
  await tapCell(page, 1, 8);
  await tapCell(page, 7, 12);
  await tapCell(page, 7, 13);                          // inside that note: removes it
  const notes = await page.evaluate(() => window.CK_SONGBOOK.writer.motif.notes);
  ok(JSON.stringify(notes) === '[[0,2,0],[2,2,2],[4,2,4],[8,4,1]]', 'taps place notes on the degree and sixteenth tapped, the chosen length; a tap on a note removes it', JSON.stringify(notes));
  const heads = await page.locator('#w-sheet svg ellipse').count();
  ok(heads === 4, 'the staff shows the four notes', `${heads} note heads`);

  // Play: every note through the scale, on the sixteenth grid, unheard.
  await page.evaluate(() => { window.played = []; });
  await page.locator('#w-play').tap();
  await page.waitForTimeout(3000);              // one bar at 104 bpm is 2.3 s: hear it come round
  await page.locator('#w-play').tap();
  const r = await page.evaluate(async () => {
    const { MusicalState } = await import('./src/core/music.js');
    const m = window.CK_SONGBOOK.writer.motif;
    const s = new MusicalState({ root: m.key.root, mode: m.key.mode });
    const want = m.notes.map(([, , d]) => s.getNote(d, m.octave));
    const six = 60 / m.bpm / 4;
    const p = window.played.filter(o => o.family !== 'percussion');
    const t0 = p[0]?.when;
    return { midis: p.map(o => o.midi), want, unheard: p.every(o => o.heard === false),
      onGrid: p.every(o => Math.abs(((o.when - t0) / six) - Math.round((o.when - t0) / six)) < 1e-6), loops: p.length > 4, playing: window.CK_SONGBOOK.player.playing };
  });
  ok(JSON.stringify(r.midis.slice(0, 4)) === JSON.stringify(r.want), 'Play sounds each note as getNote(degree, octave)', `${r.midis} vs ${r.want}`);
  ok(r.unheard && r.onGrid, 'every note unheard by locks, every note on the sixteenth grid');
  ok(r.loops && !r.playing, 'it loops, and Stop stops it');

  // A new mode: same degrees, new pitches, new key signature.
  const flatsBefore = await page.locator('#w-sheet svg path.o').count();
  await page.selectOption('#w-mode', 'phrygian');
  const after = await page.evaluate(() => ({ notes: window.CK_SONGBOOK.writer.motif.notes, cap: document.getElementById('w-caption').textContent }));
  const flatsAfter = await page.locator('#w-sheet svg path.o').count();
  ok(JSON.stringify(after.notes) === JSON.stringify(notes) && after.cap.includes('phrygian') && after.cap.includes('tense'), 'phrygian keeps the degrees and says its mood', after.cap);
  ok(flatsAfter - flatsBefore === 4, 'C phrygian is written with four flats', `${flatsAfter - flatsBefore} more flat-shaped paths`);

  // Exports.
  await page.getByRole('button', { name: 'Copy as score layer' }).tap();
  const layer = JSON.parse(await page.locator('#w-out').textContent());
  const accepted = await page.evaluate(async l => {
    const { Score } = await import('./src/audio/score.js');
    const s = new Score({ bars: 1, layers: [l] });
    return [...s.layer(l.id).byStep.keys()].sort((a, b) => a - b).join();
  }, layer);
  ok(layer.by === 'start' && layer.family === 'keys' && JSON.stringify(layer.notes) === '[[0,0],[2,2],[4,4],[8,1]]' && accepted === '0,2,4,8',
    "the score layer is the game's format, and the game's Score takes it", JSON.stringify(layer));
  await page.locator('#w-lock').tap();
  ok((await page.locator('#w-out').textContent()) === '"sequence": [0,2,4,1]', 'the lock phrase is the degrees in order', await page.locator('#w-out').textContent());
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#w-mid').tap()]);
  const mid = readMidi(fs.readFileSync(await download.path()));
  ok(mid.keySigs[0]?.sf === -4 && mid.tracks[1].notes.length === 4 && download.suggestedFilename().endsWith('.mid'),
    'Save .mid hands over a MIDI file with the key signature (C phrygian: four flats)', JSON.stringify(mid.keySigs));

  // Save, reload, still there.
  await page.fill('#w-name', 'test motif');
  await page.locator('#w-save').tap();
  await page.waitForTimeout(200);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.CK_SONGBOOK?.writer);
  await page.waitForTimeout(300);
  const savedNames = await page.locator('#w-saved .title').allTextContents();
  ok(savedNames.includes('test motif'), 'a saved motif is still there after a reload', JSON.stringify(savedNames));
  ok(!errors.length, 'nothing threw', errors.join('\n'));
  await ctx.close();
}

// ---- the library ------------------------------------------------------------------
console.log('The library');
{
  const ctx = await browser.newContext(phone);
  const { page, errors } = await openPage(ctx);
  await page.locator('#tab-library').tap();
  await page.waitForSelector('#library .item .head');
  const titles = await page.locator('#library .item .title').allTextContents();
  ok(titles.includes('1. Tide Song'), 'the piece from the library shows, with its track number', JSON.stringify(titles));
  await page.locator('#library .item .head').first().tap();
  await page.waitForSelector('#library .detail .clip');
  const keyText = await page.locator('#library .detail .facts').textContent();
  ok(keyText.includes(library.pieces[0].key.label), `its key is shown (${library.pieces[0].key.label})`);
  ok(await page.locator('#library .detail .sheet svg').count() === 1, 'its first clip is drawn as sheet music');
  await page.getByRole('button', { name: 'Use as motif' }).first().tap();
  const m = await page.evaluate(() => window.CK_SONGBOOK.writer.motif);
  const s = await page.evaluate(async m => {
    const { MusicalState } = await import('./src/core/music.js');
    const st = new MusicalState({ root: m.key.root, mode: m.key.mode });
    return m.notes.map(([, , d]) => st.getNote(d, m.octave));
  }, m);
  ok(await page.locator('#writer').isVisible() && m.name.includes('Tide Song') && JSON.stringify(s) === JSON.stringify(tune.map(n => n.midi)),
    'Use as motif opens the clip in the writer, every note the same pitch, now as degrees of its key', `${s} vs ${tune.map(n => n.midi)}`);
  await page.locator('#tab-library').tap();
  await page.getByRole('button', { name: 'Open in writer' }).nth(1).tap();
  const bass = await page.evaluate(() => window.CK_SONGBOOK.writer.motif);
  ok(bass.name.includes('bass') && bass.family === 'strings' && bass.notes.length === 8, "the game's own layers open in the writer", JSON.stringify({ n: bass.name, f: bass.family, c: bass.notes.length }));
  ok(await page.evaluate(() => document.documentElement.scrollWidth) <= 390, 'the library fits the phone too');

  // The whole piece: every arranged track at once, not one part at a time.
  // (Open in writer, above, left the writer showing; come back before looking.)
  await page.locator('#tab-library').tap();
  await page.waitForSelector('#library .detail .clip', { state: 'visible' });
  ok(await page.locator('#library .detail .track').filter({ hasText: 'The whole piece' }).count() === 0,
    'a one-track piece is its own whole piece, so no extra row');
  await page.locator('#l-search').fill('Duet');      // find it the way a thumb would
  await page.locator('#library .item .head').first().tap();
  await page.waitForSelector('#library .detail .clip', { state: 'visible' });
  const whole = page.locator('#library .detail .track').filter({ hasText: 'The whole piece' });
  const wholeText = await whole.count() ? (await whole.first().innerText()).replace(/\s+/g, ' ') : '(no row)';
  ok(wholeText.includes('2 tracks') && wholeText.includes(`${tune.length + bassline.length} notes`),
    'two tracks play together, every note of both', wholeText);
  const sounded = await page.evaluate(async () => {
    const played = [];
    const audio = await window.CK_SONGBOOK.getAudio();
    const real = audio.play.bind(audio);
    audio.play = o => { played.push(o.midi); return real(o); };
    document.querySelector('#library .detail .track').querySelector('button').click();
    await new Promise(r => setTimeout(r, 900));
    audio.play = real;
    return played;
  });
  ok(sounded.some(m => tune.map(n => n.midi).includes(m)) && sounded.some(m => bassline.map(n => n.midi).includes(m)),
    'pressing it sounds notes from both tracks, not just the first', JSON.stringify(sounded));

  ok(!errors.length, 'nothing threw', errors.join('\n'));
  await ctx.close();
}

// ---- as the private page on claude.ai ---------------------------------------------------
console.log('As the private page (a stand-in for the artifact runtime)');
{
  const ctx = await browser.newContext(phone);
  const { page, errors } = await openPage(ctx, { artifact: true });
  ok(await page.evaluate(() => window.CK_SONGBOOK.store.kind) === 'db', 'it finds the database and uses it');
  await page.locator('#tab-library').tap();
  await page.setInputFiles('#l-file', { name: 'library.json', mimeType: 'application/json', buffer: Buffer.from(libraryText) });
  await page.waitForSelector('#library .item .head', { timeout: 10000 });
  const paths = await page.evaluate(() => [...window.fakeDb.keys()].sort());
  const id = library.pieces[0].id;
  ok(paths.includes(`pieces/${id}`) && paths.includes(`notes/${id}~0`) && paths.includes('meta/library'),
    'the library goes in as a document per piece and per track', paths.join(' '));
  const head = await page.evaluate(i => window.fakeDb.get(`pieces/${i}`), id);
  ok(!head.tracks && head.trackNames?.[0]?.name === 'Flute', "a piece's document leaves its notes to the track documents");
  // By name, not by position: read back from the database the pieces come in
  // document-id order, which is not the order the library file is in.
  await page.locator('#library .item').filter({ hasText: library.pieces[0].title }).locator('.head').first().tap();
  await page.waitForSelector('#l-status');
  await page.selectOption('#l-status', 'candidate');
  await page.fill('#l-tags', 'wood, #lullaby');
  await page.waitForTimeout(700);
  const label = await page.evaluate(i => window.fakeDb.get(`labels/${i}`), id);
  ok(label?.status === 'candidate' && JSON.stringify(label.tags) === '["wood","lullaby"]', 'labels are written to labels/<piece>', JSON.stringify(label));
  await page.getByRole('button', { name: 'Use as motif' }).first().tap();
  await page.locator('#w-save').tap();
  await page.waitForTimeout(300);
  const motifs = await page.evaluate(() => [...window.fakeDb.entries()].filter(([k]) => k.startsWith('motifs/')).map(([, v]) => v));
  ok(motifs.length === 1 && motifs[0].source?.piece === id && motifs[0].notes.length === tune.length, 'a saved motif is written to motifs/<id>, with where it came from');
  await page.locator('#w-mid').tap();
  await page.waitForTimeout(300);
  const saved = await page.evaluate(() => window.fakeSaves.map(s => ({ name: s.filename, head: Array.from(s.data.slice(0, 4)), text: new TextDecoder().decode(s.data.slice(30, 30 + 40)) })));
  ok(saved.length === 1 && saved[0].name.endsWith('.zip') && saved[0].head.join() === '80,75,3,4' && saved[0].text.includes('.mid'),
    'Save .mid is handed over as a .zip holding the .mid', JSON.stringify(saved));
  ok(!errors.length, 'nothing threw', errors.join('\n'));
  await ctx.close();
}

await browser.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(failed ? `\n${failed} FAILED` : '\nPASS');
process.exit(failed ? 1 : 0);

// The artifact runtime's db and downloads, as far as the songbook uses them.
function fakeClaude() {
  const store = new Map();
  window.fakeDb = store;
  window.fakeSaves = [];
  const clone = v => JSON.parse(JSON.stringify(v));
  const snap = (path) => ({ id: path.split('/').pop(), exists: store.has(path), data: () => store.has(path) ? clone(store.get(path)) : undefined });
  const doc = path => ({ id: path.split('/').pop(), path,
    get: async () => snap(path), set: async d => { store.set(path, clone(d)); }, delete: async () => { store.delete(path); } });
  const collection = path => {
    const q = { path, limit: () => q, doc: id => doc(`${path}/${id}`),
      get: async () => {
        const docs = [...store.keys()].filter(k => k.startsWith(path + '/') && !k.slice(path.length + 1).includes('/')).sort().map(snap);
        return { docs, size: docs.length, empty: !docs.length };
      } };
    return q;
  };
  const db = { doc, collection };
  const downloads = { save: async ({ filename, data }) => { window.fakeSaves.push({ filename, data }); } };
  window.claude = { use: async name => name === 'db' ? db : name === 'downloads' ? downloads : null };
}
