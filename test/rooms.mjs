/* Composer's Key — the regression harness the notes kept describing.
   ---------------------------------------------------------------------
   CLAUDE.md said "There's no test runner. Verify in the browser", and then
   handed over the exact recipe for one: stub `audio.play` to record what it
   was asked for, step the waves by hand, and drive the clock rather than
   waiting on it. This is that recipe, over every room in the manifest.

   Why it exists: this repo is a port, and the two things most likely to break
   it are silent. A legend character claimed twice just wins, and the earlier
   doodad loses its slot with no warning. A doodad handed a raw frequency plays
   perfectly and is out of key. Neither raises an error; both surface as a room
   that sounds wrong, weeks later, with nothing to point at.

   **It fires from where a player would stand.** The first version of this file
   fired from the room's spawn point, the wave died on step 0, and every room
   "passed" having proved nothing — the vacuous-test trap, hit first time. So
   it now walks the grid, stands next to every doodad on each side there is
   room to stand, and fires into it. Brass 01 goes from 4 notes and 0 travel to
   88 shots and waves eight tiles long. If a change makes these counts collapse,
   the harness has stopped testing and that is the finding.

   Everything is driven, nothing is waited for: `clock.index++` plus
   `wave.step()` advances the simulation deterministically. Raising bpm was the
   old trick and still left the result at the mercy of a timer.

   Serve the repo root on :8080, then `node test/rooms.mjs`.
*/
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const EXEC = process.env.CHROMIUM || '/opt/pw-browsers/chromium';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8080/';
const STEPS = 60;

const fails = [];
const ok = (name, cond, detail = '') =>
  cond ? console.log(`  ok   ${name}`) : fails.push(`${name}${detail ? ' — ' + detail : ''}`);

/* --- the legend, read from source ---------------------------------------
   `DEFAULT_LEGEND` is an object literal, so by the time the module is loaded a
   repeated character has already quietly won. The source text is the only
   place the collision is still visible. */
const roomSrc = readFileSync(new URL('../src/core/room.js', import.meta.url), 'utf8');
const open = roomSrc.indexOf('DEFAULT_LEGEND = {');
const block = roomSrc.slice(open, roomSrc.indexOf('\n};', open));
const claimed = [...block.matchAll(/^\s*'((?:[^'\\]|\\.)+)'\s*:/gm)].map(m => m[1]);
ok('the legend has entries to check', claimed.length > 10, `${claimed.length}`);
const dupes = [...new Set(claimed.filter((c, i) => claimed.indexOf(c) !== i))];
ok('no legend character is claimed twice', dupes.length === 0,
   dupes.length ? `'${dupes.join("', '")}' claimed more than once` : '');

const browser = await chromium.launch({ executablePath: EXEC });
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(String(e)));
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.CK && window.CK.game, null, { timeout: 20000 });

const manifest = await page.evaluate(() => fetch('rooms/manifest.json').then(r => r.json()));
ok('the manifest lists rooms', manifest.length > 0, `${manifest.length}`);

let totalShots = 0;
for (const entry of manifest) {
  const r = await page.evaluate(async ({ file, steps }) => {
    const out = { threw: null, shots: 0, notes: 0, maxTravel: 0, offScale: [], nonFinite: 0 };
    const g = window.CK.game, a = window.CK.audio;
    try {
      // loadRoom takes the parsed room, not a path. Handing it a string builds
      // an empty 1x1 room that fires nothing and fails nothing.
      g.loadRoom(await fetch(`rooms/${file}`).then(r => r.json()));
    } catch (e) { out.threw = 'load: ' + e.message; return out; }

    const room = g.room, music = room.music;
    out.size = [room.width, room.height];
    // Every tubing structure is a horn: a mouthpiece to send a wave in, a bell at
    // every open end (Timothy, 2026-10-04). See hornProblems in brass.js.
    const { hornProblems } = await import('./src/doodads/brass.js');
    out.horns = hornProblems(room);
    out.scale = { root: music.root, mode: music.mode };

    /* Every pitch this room's scale can name, across every octave anything
       here plays in. A note outside it did not come through getNote().

       Note what this does and does not prove. The legal set is built from the
       room's own MusicalState, so it catches a doodad that BYPASSED the scale
       — the "never call the audio engine with a raw frequency" rule — and it
       is blind to getNote itself being wrong, because a shifted scale shifts
       both sides together. Verified by injection both ways: a semitone added
       inside brass.js fails five rooms by name and correctly leaves the two
       with no brass passing; the same semitone added inside getNote passes,
       which is the honest limit of the check. */
    const legal = new Set();
    for (let oct = 0; oct <= 9; oct++)
      for (let d = -14; d <= 21; d++) legal.add(music.getNote(d, oct));

    // Record instead of playing. `onNote` is re-routed by hand: it is the hook
    // the note locks listen on, and forgetting it makes a working phrase look
    // broken.
    const heard = [];
    const real = a.play.bind(a);
    a.play = (o) => { heard.push(o); a.onNote?.(o.midi, o.family); };

    // Every room's waves, not just this one's: a shot out through an open door
    // carries on into the next room (Game.crossEdge) and would still count
    // against the wave limit for the next shot.
    const clearWaves = () => { for (const r of g.liveRooms()) r.waves = []; };
    const DIRS = { right: [1, 0], left: [-1, 0], down: [0, 1], up: [0, -1] };
    try {
      for (let y = 0; y < room.height; y++) for (let x = 0; x < room.width; x++) {
        if (!room.doodadAt(x, y)) continue;
        for (const [name, [dx, dy]] of Object.entries(DIRS)) {
          const px = x - dx, py = y - dy;                 // stand behind it, facing in
          if (!room.inBounds(px, py) || room.doodadAt(px, py)) continue;
          g.player.x = px; g.player.y = py; g.setFacing(name);
          clearWaves(); g.fire(); out.shots++;
          let s = 0;
          for (; s < steps && g.waves.length; s++) {
            g.clock.index++;
            for (const w of g.waves) w.step(g.ctx);
            g.waves = g.waves.filter(w => w.alive);
          }
          if (s > out.maxTravel) out.maxTravel = s;
          clearWaves();
        }
      }
    } catch (e) { out.threw = 'step: ' + e.message; }
    a.play = real;

    out.notes = heard.length;
    out.nonFinite = heard.filter(n => !Number.isFinite(n.midi)).length;
    out.offScale = [...new Set(heard.filter(n => Number.isFinite(n.midi) && !legal.has(n.midi))
                                   .map(n => `${n.family}@${n.midi}`))];
    return out;
  }, { file: entry.file, steps: STEPS });

  const tag = entry.file.replace('.json', '');
  ok(`${tag} loads and survives every shot`, !r.threw, r.threw || '');
  if (r.threw) continue;
  totalShots += r.shots;
  // A room nothing can be fired into is a room this harness is not testing.
  ok(`${tag} can actually be played into`, r.shots > 0 && r.notes > 0,
     `${r.shots} shots, ${r.notes} notes`);
  ok(`${tag} carries a wave further than one tile`, r.maxTravel > 1, `${r.maxTravel} steps`);
  ok(`${tag} plays only notes in its own scale (${r.scale.mode})`, r.offScale.length === 0,
     r.offScale.length ? `${r.offScale.slice(0, 5).join(', ')}` : '');
  ok(`${tag} plays no NaN pitch`, r.nonFinite === 0, r.nonFinite ? `${r.nonFinite}` : '');
  ok(`${tag} has no loose horn (a mouthpiece in, a bell at every end)`, r.horns.length === 0, r.horns.join('; '));
  console.log(`       ${r.size[0]}x${r.size[1]} · ${r.shots} shots · ${r.notes} notes · longest circuit ${r.maxTravel}`);
}

ok('the rooms are worth testing', totalShots > 50, `${totalShots} shots across the manifest`);

/* Headless Chromium has no audio backend, so decoding the real samples fails
   here and nowhere else. It is filtered by exact message rather than by
   ignoring page errors wholesale — anything else still fails the run. */
const AUDIO_ONLY = /Unable to decode audio data/;
const real = pageErrors.filter(e => !AUDIO_ONLY.test(e));
if (pageErrors.length !== real.length) {
  console.log(`\n  note  ${pageErrors.length - real.length} audio-decode errors ignored — headless has no audio backend`);
}
ok('nothing else threw on the page', real.length === 0, real.slice(0, 2).join(' | '));

await browser.close();
if (fails.length) { console.error('\nFAIL\n' + fails.map(f => '  ✕ ' + f).join('\n')); process.exit(1); }
console.log('\nevery room plays, in key');
