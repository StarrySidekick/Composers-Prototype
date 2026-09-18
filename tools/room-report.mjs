/* Composer's Key — what a room actually DOES when you play it.
   ---------------------------------------------------------------------
   `test/rooms.mjs` answers "is this room broken". This answers "is this room
   any good", which is the question you have when you are making a lot of them
   and it is the one nothing here could answer before.

   It is deliberately NOT a test. Nothing passes or fails, nothing exits 1, and
   every number is a thing to look at rather than a threshold to satisfy. A
   room can be a fine room and score badly on any line below.

   The one finding it exists for is the SILENT DOODAD: something you placed
   that no shot from anywhere a player can stand ever reaches. That is almost
   always a mistake — a wall in the way, a face pointing wrong, an island the
   waves cannot get to — and it is invisible in the editor, because the piece
   is right there on the grid looking placed.

     python3 -m http.server 8080          # from the repo root
     node tools/room-report.mjs           # every room in the manifest
     node tools/room-report.mjs brass-01  # just the ones whose name matches

   The sweep itself — stand behind every doodad on every side there is room to
   stand, fire in, step the clock by hand — lives in src/core/analyze.js now,
   not here. It is imported with a dynamic import() *inside the page* this
   script already has open, rather than re-derived a second time: the editor's
   Report panel needs the identical sweep, and two copies of "how a room gets
   driven" is exactly the kind of thing that quietly stops agreeing with
   itself. This file is left holding what's actually specific to a terminal:
   the browser launch, the manifest walk, and turning the summary into text.
*/
import { chromium } from 'playwright';
// src/core/music.js touches no browser global, so this one is a plain Node
// import rather than the in-page dynamic one above — it used to reimplement
// the same pitch-spelling formula as its own local `spell()`, which is the
// exact kind of second copy this file's own header comment warns about.
import { midiName } from '../src/core/music.js';

const EXEC = process.env.CHROMIUM || '/opt/pw-browsers/chromium';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8080/';
const filter = process.argv[2] || '';

const pad = (s, n) => String(s).padEnd(n);

const browser = await chromium.launch({ executablePath: EXEC });
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.CK && window.CK.game, null, { timeout: 20000 });

const manifest = (await page.evaluate(() => fetch('rooms/manifest.json').then((r) => r.json())))
  .filter((e) => !filter || e.file.includes(filter) || e.name.toLowerCase().includes(filter.toLowerCase()));

if (!manifest.length) {
  console.error(`nothing in the manifest matches "${filter}"`);
  await browser.close();
  process.exit(1);
}

for (const entry of manifest) {
  const r = await page.evaluate(async ({ file }) => {
    const { analyzeRoomJSON } = await import('./src/core/analyze.js');
    const json = await fetch(`rooms/${file}`).then((x) => x.json());
    return analyzeRoomJSON(json);
  }, { file: entry.file });

  const { parts, walls, silent, mute, busiest } = r;

  console.log(`\n${entry.name}`);
  console.log(`  ${r.size[0]}x${r.size[1]} · ${r.scale} · ${parts.length} pieces (+${walls} wall/door/exit)`);
  console.log(`  ${pad('shots', 12)}${r.shots} from ${r.stands} standable squares · ${r.dud} made no sound`);
  console.log(`  ${pad('circuits', 12)}longest ${r.longest} · median ${r.median}`);
  console.log(`  ${pad('pitches', 12)}${r.distinct.length} distinct` +
    (r.distinct.length ? ` (${midiName(r.distinct[0])}–${midiName(r.distinct[r.distinct.length - 1])})` : '') +
    ` · ${r.notes} notes heard`);
  console.log(`  ${pad('families', 12)}${r.families.join(', ') || '—'}`);
  if (busiest.length) {
    console.log(`  ${pad('busiest', 12)}` +
      busiest.map((p) => `${p.type}@${p.x},${p.y} ×${p.notes}`).join(' · '));
  }

  /* The two findings worth acting on, and they mean different things.
     Never reached is usually a level-design mistake. Reached but never sounding
     is usually correct — a mirror, a wall, a switch — so it is reported
     separately rather than lumped in as a problem. */
  /* Grouped by type, because twenty brass tubes listed by coordinate is a wall
     of text that says one thing. The count is the finding; the coordinates only
     matter once you have decided to go and look. */
  const where = (list) => {
    const by = new Map();
    for (const p of list) (by.get(p.type) || by.set(p.type, []).get(p.type)).push(`${p.x},${p.y}`);
    return [...by].map(([t, at]) =>
      at.length > 4 ? `${t} ×${at.length}` : `${t}@${at.join(' @')}`).join(' · ');
  };
  if (silent.length) {
    console.log(`  ${pad('NEVER HIT', 12)}${where(silent)}`);
    console.log(`  ${pad('', 12)}↑ no shot from anywhere a player can stand reaches these`);
  }
  if (mute.length) {
    console.log(`  ${pad('mute', 12)}${where(mute)}`);
    console.log(`  ${pad('', 12)}↑ reached, but sounded nothing. A lock or a peg doing that is`);
    console.log(`  ${pad('', 12)}  correct; an instrument doing it is worth a look.`);
  }
  if (!silent.length && !mute.length) console.log(`  ${pad('', 12)}every piece is reachable and sounds`);
}

const AUDIO_ONLY = /Unable to decode audio data/;
const real = pageErrors.filter((e) => !AUDIO_ONLY.test(e));
if (real.length) console.log(`\n  page errors: ${real.slice(0, 3).join(' | ')}`);

console.log('\nNothing here passes or fails. NEVER HIT is the line to read first.');
console.log('Attribution note: a note played on a later beat hold, rather than inside');
console.log('receiveWave, is counted in the totals but not against its doodad.');
await browser.close();
