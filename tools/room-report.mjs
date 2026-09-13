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

   Same driving technique as the harness: stand behind every doodad on every
   side there is room to stand, fire in, and step the clock by hand. Nothing is
   waited for.
*/
import { chromium } from 'playwright';

const EXEC = process.env.CHROMIUM || '/opt/pw-browsers/chromium';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8080/';
const STEPS = 60;
const filter = process.argv[2] || '';

const pad = (s, n) => String(s).padEnd(n);
const median = (a) => a.length ? [...a].sort((x, y) => x - y)[a.length >> 1] : 0;
const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const spell = (m) => `${NOTE[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;

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
  const r = await page.evaluate(async ({ file, steps }) => {
    const g = window.CK.game, a = window.CK.audio;
    g.loadRoom(await fetch(`rooms/${file}`).then((x) => x.json()));
    const room = g.room, music = room.music;

    /* Every doodad on the grid, and a wrapper on each one's receiveWave.
       CLAUDE.md is explicit that SoundWave.step calls receiveWave and not
       onWaveEntered — the base class does its busy-check and melee routing
       there first — so this is the seam that sees every arrival, including the
       ones a doodad chooses to ignore. */
    const pieces = [];
    for (let y = 0; y < room.height; y++) {
      for (let x = 0; x < room.width; x++) {
        const d = room.doodadAt(x, y);
        if (d) pieces.push({ x, y, type: d.constructor?.type || 'unknown', d, hits: 0, entered: 0, interacted: 0, notes: 0 });
      }
    }
    let inside = null;
    // Every doer routes through here, so a.play (below) always knows which
    // piece is on the stack regardless of whether the sound came from a wave
    // arriving, Coda walking onto the tile, or Coda pressing B at it.
    const track = (p, key, fn) => {
      p[key]++;
      const was = inside; inside = p;
      try { return fn(); } finally { inside = was; }
    };
    for (const p of pieces) {
      const original = p.d.receiveWave?.bind(p.d);
      if (!original) continue;
      p.d.receiveWave = (...args) => track(p, 'hits', () => original(...args));
    }

    const heard = [];
    const realPlay = a.play.bind(a);
    a.play = (o) => {
      heard.push({ midi: o.midi, family: o.family, from: inside ? pieces.indexOf(inside) : -1 });
      if (inside) inside.notes++;
      a.onNote?.(o.midi, o.family);
    };

    const DIRS = { right: [1, 0], left: [-1, 0], down: [0, 1], up: [0, -1] };
    const travels = [];
    let shots = 0, stands = new Set(), dud = 0;
    for (const p of pieces) {
      for (const [name, [dx, dy]] of Object.entries(DIRS)) {
        const px = p.x - dx, py = p.y - dy;
        if (!room.inBounds(px, py) || room.doodadAt(px, py)) continue;
        g.player.x = px; g.player.y = py; g.setFacing(name);
        g.waves = [];
        const before = heard.length;
        g.fire(); shots++; stands.add(`${px},${py}`);
        let s = 0;
        for (; s < steps && g.waves.length; s++) {
          g.clock.index++;
          for (const w of g.waves) w.step(g.ctx);
          g.waves = g.waves.filter((w) => w.alive);
        }
        travels.push(s);
        if (heard.length === before) dud++;
        g.waves = [];

        /* A wave is one way into a tile. Coda himself is another: walking
           onto it (Game.move -> onPlayerEnter, gated the same way canEnter
           gates a real move — a per-face IPlayerFaceInteractable can open one
           side and not another) and pressing B while facing it (Game.interact
           -> onPlayerInteract, which doesn't care whether the tile is solid).
           Keys & mallets, strings and key-shifts are all walked-on rather than
           wave-struck by design (keys.js's own header comment says so), and
           without this every one of them read as a mute instrument rather
           than as the floor-instrument it actually is. */
        if (room.canEnter(p.x, p.y, g.player.dir)) {
          track(p, 'entered', () => p.d.onPlayerEnter(g.ctx, g.player.dir));
        }
        track(p, 'interacted', () => p.d.onPlayerInteract(g.ctx));
      }
    }
    a.play = realPlay;

    const midis = heard.map((n) => n.midi).filter(Number.isFinite);
    return {
      size: [room.width, room.height],
      scale: music.label || `${music.root} ${music.mode}`,   /* a getter, not a method */
      shots, stands: stands.size, dud,
      travels,
      notes: heard.length,
      distinct: [...new Set(midis)].sort((x, y) => x - y),
      families: [...new Set(heard.map((n) => n.family))].filter(Boolean),
      pieces: pieces.map((p) => ({
        x: p.x, y: p.y, type: p.type,
        hits: p.hits, entered: p.entered, interacted: p.interacted, notes: p.notes,
      })),
    };
  }, { file: entry.file, steps: STEPS });

  /* Walls, doors and exits are geometry. They are doodads, they are most of
     every room, and they are silent by design — so reporting them as findings
     buries the one or two pieces that actually matter under sixty walls. This
     is a display filter and nothing more: it makes no claim about what those
     types do. */
  const STRUCTURAL = new Set(['wall', 'door', 'exit']);
  const parts = r.pieces.filter((p) => !STRUCTURAL.has(p.type));
  const walls = r.pieces.length - parts.length;

  // Reached is any of the three ways in: a wave arrived, Coda walked onto it,
  // or Coda pressed B at it. A piece is only NEVER HIT if none of the three
  // ever landed from anywhere a player can actually stand.
  const reached = (p) => p.hits > 0 || p.entered > 0 || p.interacted > 0;
  const silent = parts.filter((p) => !reached(p));
  const mute = parts.filter((p) => reached(p) && p.notes === 0);
  const busiest = [...parts].sort((a, b) => b.notes - a.notes).slice(0, 3).filter((p) => p.notes);

  console.log(`\n${entry.name}`);
  console.log(`  ${r.size[0]}x${r.size[1]} · ${r.scale} · ${parts.length} pieces (+${walls} wall/door/exit)`);
  console.log(`  ${pad('shots', 12)}${r.shots} from ${r.stands} standable squares · ${r.dud} made no sound`);
  console.log(`  ${pad('circuits', 12)}longest ${Math.max(0, ...r.travels)} · median ${median(r.travels)}`);
  console.log(`  ${pad('pitches', 12)}${r.distinct.length} distinct` +
    (r.distinct.length ? ` (${spell(r.distinct[0])}–${spell(r.distinct[r.distinct.length - 1])})` : '') +
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
