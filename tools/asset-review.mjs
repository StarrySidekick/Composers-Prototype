/* Build the asset review page: every tile the game can draw, at 51 px, with
   room to leave a note on each one.
   ---------------------------------------------------------------------
   Renders every sprite slot the way the game resolves it (real Unity art,
   recoloured; and the sketch placeholder standing in for it), plus the
   proposal tiles for things the game does not have yet, and writes one
   self-contained HTML page with the pictures embedded.

   The page is published as a claude.ai Artifact. Notes left on it are kept in
   the Artifact's database (collection `notes`: {asset, text, by, at,
   resolved}), which is where a Claude session reads them back to act on.

   Usage (serve the repo root on :8080 first):
     node tools/asset-review.mjs [out.html]

   Like room-report, this is a tool, not part of the site.
*/
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const EXEC = process.env.CHROMIUM || '/opt/pw-browsers/chromium';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8080/';
const out = resolve(process.argv[2] ?? 'asset-review.html');

// What each piece is and does, in a line. Keys not listed get a generated line.
const ABOUT = {
  'brass.straight': 'Straight tubing. Walls cross the edge at rows 20-30, the measured connector.',
  'brass.elbow': 'Elbow, drawn as ┐ (left to bottom). Turned by rot for the other three.',
  'brass.tee': 'Tee ┬. Halves the wave and branches a copy out of the stem.',
  'brass.cross': 'Cross ┼. Two channels pass over each other without joining.',
  'brass.mouthpiece': 'Mouthpiece. Blow it with B. Cup on the left, stem out of the right edge.',
  'brass.flare': 'Bell. Sounds the horn and swallows the wave.',
  'brass.valve': 'Valve. Press B to turn the bend 90°.',
  'brass.slide.0': 'Slide, closed. Each pull adds a tile of length and lowers the horn.',
  'brass.slide.1': 'Slide, out one.', 'brass.slide.2': 'Slide, out two.', 'brass.slide.3': 'Slide, out three.',
  'brass.mute': 'Mute, seated: the wave goes on quieter and buzzier.',
  'brass.mute.open': 'Mute, pulled out of the bell.',
  'string': 'String. Plucked along its length, silent across it. Length sets the instrument.',
  'peg': 'Peg. Turns itself so the stem points at its string.',
  'drum.bass': 'Bass drum. Kicks a wave 90° clockwise (the curl shows which way).',
  'drum.tom': 'Tom. Kicks a wave 90° counter-clockwise.',
  'drum.snare': 'Snare. Sends a wave straight back.',
  'drum.hat': 'Hi-hat. The wave passes through and it ticks.',
  'drum.cymbal': 'Cymbal. Passes the wave and gives a halved wave its energy back.',
  'drum.timpani': 'Kettle drum. Pitched; press B to tune it up the scale. The number is drawn on top.',
  'pianokey': 'Piano key. Played by walking on it. Joins its neighbours into a keyboard.',
  'mallet': 'Mallet. Fires a wave when a key in its group is pressed.',
  'lock': 'Tuning fork lock. Any wave lights it. Unlit is drawn dim.',
  'lock.lit': 'Tuning fork, lit.',
  'notelock': 'Note lock. Wants a phrase; press B to hear it. Progress dots are drawn on top.',
  'notelock.lit': 'Note lock, solved.',
  'door': 'Door. Drawn upright; turns 90° by itself in an east-west wall.',
  'door.open': 'Door, open. Walk through it to the next room.',
  'keyshift.up': 'Stairs up. Raises the room\'s key a semitone.',
  'keyshift.down': 'Stairs down. Lowers the room\'s key a semitone.',
  'exit': 'Exit. The way out of the last room.',
  'dissonance': 'Dissonance. Sours any wave that crosses it.',
  'strumentino': 'Strumentino. A blank instrument; every face is set by hand in the room file.',
  'wall': 'Wall, standing alone. Border only where it meets floor.',
  'wall.inner': 'Inside-corner patch. Drawn for the top-right corner, stamped and rotated into the others.',
  'player': 'Coda. Not a tile; drawn over the floor and flipped to face left.',
  'wave': 'The sound wave. Not a tile; turned to its direction of travel.',
  'block': 'Unity\'s Pushable_Block. Used to fill the wall slot; kept here as its own piece.',
  'woodwind.reed': 'Proposal. Woodwind has no instrument yet. A reed you blow like a mouthpiece that is its own horn.',
  'woodwind.flute': 'Proposal. A flute run: waves along it sound, and each blocked hole lowers the note.',
  'notelock.absolute': 'Proposal. A lock that wants an absolute pitch, so the stairs finally matter.',
  'key.pickup': 'Proposal. The Composer\'s Key from the website, in line work.',
  'floor.staff': 'Proposal. A floor tile with the staff showing through.',
};

// Redrawn in the second pass (more of Timothy's hand), for the "new today" filter.
const REDRAWN = new Set(['brass.straight', 'brass.tee', 'brass.cross', 'brass.valve', 'brass.mute',
  'brass.mute.open', 'drum.tom', 'drum.snare', 'drum.hat', 'drum.cymbal', 'drum.timpani', 'drum.bass',
  'mallet', 'notelock', 'notelock.lit', 'exit', 'keyshift.up', 'keyshift.down', 'dissonance', 'strumentino']);

const browser = await chromium.launch({ executablePath: EXEC });
const page = await browser.newPage();
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.CK && window.CK.assets, null, { timeout: 20000 });

const assets = await page.evaluate(async () => {
  const { spriteSlots } = await import('./src/render/sprite-baker.js');
  const { proposalKeys, drawProposal } = await import('./src/art/placeholders.js');
  const store = window.CK.assets;
  const url = (slice) => {
    if (!slice) return null;
    const cv = document.createElement('canvas');
    cv.width = slice.sw; cv.height = slice.sh;
    cv.getContext('2d').drawImage(slice.image, slice.sx, slice.sy, slice.sw, slice.sh, 0, 0, slice.sw, slice.sh);
    return cv.toDataURL('image/png');
  };
  const keys = [...spriteSlots().map(s => s.key), 'player', 'wave', 'block'];
  const out = keys.map(key => ({ key, real: url(store.real(key)), sketch: url(store.draft(key)) }));
  for (const key of proposalKeys()) out.push({ key, proposal: true, sketch: drawProposal(key).toDataURL('image/png') });
  return out;
});
await browser.close();

const SIDES = { n: 'north', e: 'east', s: 'south', w: 'west' };
for (const a of assets) {
  const m = a.key.match(/^(wall|pianokey)\.([nesw]+)$/);
  a.about = ABOUT[a.key] ?? (m ? `${m[1] === 'wall' ? 'Wall' : 'Piano key'} joined on the ${[...m[2]].map(c => SIDES[c]).join(', ')}.` : '');
  a.redrawn = REDRAWN.has(a.key);
  a.group = a.proposal ? 'proposals'
    : /^wall/.test(a.key) || a.key === 'block' ? 'walls'
    : /^(door|lock|notelock|keyshift|exit|dissonance|strumentino)/.test(a.key) ? 'puzzle'
    : /^(pianokey|mallet)/.test(a.key) ? 'keys'
    : /^(string|peg)/.test(a.key) ? 'strings'
    : /^drum/.test(a.key) ? 'percussion'
    : /^brass/.test(a.key) ? 'brass' : 'characters';
}

const template = (await import('node:fs')).readFileSync(new URL('./asset-review.template.html', import.meta.url), 'utf8');
const html = template
  .replace('/*__ASSETS__*/[]', JSON.stringify(assets))
  .replace('__GENERATED__', new Date().toISOString().slice(0, 10));
writeFileSync(out, html);
console.log(`${assets.length} assets -> ${out} (${Math.round(html.length / 1024)} KB)`);
