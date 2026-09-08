/* Composer's Key — scaffold a new room.
   ---------------------------------------------------------------------
   INTENT.md names the two things still missing from the loop: a faster way
   to write a room, and a way to judge whether one is fun. This is the first
   of those, and it is deliberately small — it does not design a room, it
   removes the two bits of typing that are pure friction every time:

     1. The bordered-box JSON skeleton (legend already covers # and @ and X;
        there is nothing to invent here, only to retype).
     2. The manifest.json line. This is the one that actually costs rooms:
        test/rooms.mjs and tools/room-report.mjs both only ever see what is
        in the manifest, so a room saved straight to rooms/ and forgotten
        there is not broken — it is invisible, to every tool that would have
        told you it was broken. (See the "manifest against the folder" check
        this pairs with, added the same day.)

   It writes the file and updates the manifest in one step so those two
   things cannot drift apart the way a hand edit can.

     node tools/new-room.mjs <id> [wing]

   <id> becomes both the room's `id` and its filename (rooms/<id>.json), so
   the two can never disagree — every existing room already keeps that
   invariant, this just enforces it. Kebab-case, matching every id already in
   rooms/: e.g. brass-04-the-long-way.

   [wing] is optional and is guessed from <id>'s first segment when left off
   (brass-04-... guesses brass); it only changes which palette paints the
   walls; the room plays identically under any wing. Pass one of
   brass | woodwind | strings | percussion | keys to override the guess.

   The room this writes is a bare box — four walls, a spawn, an exit, nothing
   in between. It already PASSES test/rooms.mjs, because firing at all plays
   Coda's own casting note regardless of what the wave hits — so a green run
   proves only that the box is well-formed, not that there is a room here
   yet. `node tools/room-report.mjs <id>` says the honest version: 0 pieces,
   1 pitch. Open the editor, hit build, and put something in it.
*/
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PALETTE } from '../src/render/palette.js';

const ROOMS_DIR = fileURLToPath(new URL('../rooms/', import.meta.url));

const [, , idArg, wingArg] = process.argv;
if (!idArg) {
  console.error('usage: node tools/new-room.mjs <id> [wing]');
  console.error(`  wing is one of: ${PALETTE.wings.join(', ')} (guessed from <id> if left off)`);
  process.exit(1);
}

if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(idArg)) {
  console.error(`"${idArg}" isn't kebab-case — every room id in rooms/ is lowercase words joined`);
  console.error('by hyphens (brass-04-the-long-way). Rename it to that shape and try again.');
  process.exit(1);
}

const guessedWing = PALETTE.wings.includes(idArg.split('-')[0]) ? idArg.split('-')[0] : 'brass';
const wing = wingArg ?? guessedWing;
if (!PALETTE.wings.includes(wing)) {
  console.error(`"${wing}" isn't a wing. Pick one of: ${PALETTE.wings.join(', ')}`);
  process.exit(1);
}

const file = `${idArg}.json`;
const roomPath = ROOMS_DIR + file;
if (existsSync(roomPath)) {
  console.error(`rooms/${file} already exists — pick a different id, or edit that room directly.`);
  process.exit(1);
}

const manifestPath = ROOMS_DIR + 'manifest.json';
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (manifest.some((e) => e.file === file)) {
  console.error(`manifest.json already lists ${file} — pick a different id.`);
  process.exit(1);
}

// "brass-04-the-long-way" -> "Brass 04 — The Long Way", matching the shape
// every hand-written room name already uses. A number as the second segment
// gets the em dash; anything else is just title-cased, which is what
// "sandbox" -> "Sandbox" wants.
const titleCase = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());
const segs = idArg.split('-');
const name = /^\d+$/.test(segs[1] ?? '')
  ? `${titleCase(segs[0])} ${segs[1]} — ${titleCase(segs.slice(2).join(' '))}`
  : titleCase(segs.join(' '));

const room = {
  id: idArg,
  name,
  wing,
  hint: '',
  maxWaves: 1,
  music: { root: 0, mode: 'ionian', bpm: 104, timeSignature: 4, mood: 'content' },
  layout: [
    '#############',
    '#...........#',
    '#.@.........#',
    '#...........#',
    '#...........#',
    '#...........#',
    '#...........#',
    '#..........X#',
    '#############'
  ]
};
writeFileSync(roomPath, JSON.stringify(room, null, 2) + '\n');

// Append and re-pad the whole manifest, rather than just tacking a line on —
// the file column is hand-aligned and a new entry longer than every existing
// one would otherwise leave the list ragged from this point on.
manifest.push({ file, name });
const openers = manifest.map((e) => `  { "file": "${e.file}",`);
const col = Math.max(...openers.map((s) => s.length)) + 1;
const rebuilt = manifest.map((e, i) => openers[i].padEnd(col) + `"name": "${e.name}" }`);
writeFileSync(manifestPath, '[\n' + rebuilt.join(',\n') + '\n]\n');

console.log(`wrote rooms/${file}`);
console.log(`added "${name}" to rooms/manifest.json`);
console.log(`\nit's a bare box — test/rooms.mjs will pass on the casting note alone.`);
console.log(`node tools/room-report.mjs ${idArg} says the honest version. Open the editor and build.`);
