# Composer's Key — Prototyping

> **Read [`INTENT.md`](INTENT.md) first.** It records what this project is for
> and what Timothy wants next, in his own words, dated. Where it disagrees with
> this file about *direction* it is newer and wins; where it disagrees about
> *mechanics* — how the code works, what was decided deliberately, the
> invariants — this file wins.

Fast-iteration browser harness for *Composer's Key* mechanics. Ports back into the Unity
project at `~/Desktop/Development/Unity Games/Composer's Key - 2026`. May also become a
smaller standalone mobile music game.

Canonical design source: `~/Desktop/Composer's Key/Composers Key Design Document.md`
(living GDD, v1.1). When this repo and an older doc disagree, the GDD wins.

## Constraints that matter

- **No build step, no dependencies.** Plain ES modules, Web Audio, canvas. If a change
  would require npm, node_modules, a bundler or a framework, don't make it — the value
  of this repo is that it runs by opening a file server and nothing else.
- **Must work as a GitHub Pages static site from the repo root.** No Actions workflow.
- **Touch-first.** Every input must be reachable from the virtual Game Boy (D-pad, A, B,
  two shoulders, pause). Don't add a mechanic that needs a keyboard.
- **Mirror Unity naming.** `SoundWaveState`, `MusicalState`, `FaceAction`, `onWaveEntered`,
  `measureLength` exist to make porting mechanical. Read `docs/PORTING.md` before renaming
  anything in `src/core/` or `src/doodads/`.

## Gotchas

- **Screen space is +y down; Unity 2D is +y up.** Every CW/CCW rotation is mirrored.
  See the table at the top of `docs/PORTING.md`.
- **Face naming is by direction of travel in local space**, not the edge entered through.
  Changing this silently inverts every authored room.
- Rooms are fetched, so `file://` won't work — `python3 -m http.server 8080`.
- Everything a doodad plays is snapped to the room's scale via `MusicalState.getNote`.
  Never call the audio engine with a raw frequency; go through a scale degree.
- **`SoundWave.step` calls `doodad.receiveWave`, not `onWaveEntered`.** The base class
  runs the busy-check, melee routing and beat hold there first (mirroring the sealed
  `InstrumentBase.OnWaveEntered`). `onWaveEntered` is still what you override.
- **Legend characters collide silently.** `DEFAULT_LEGEND` is an object literal, so a
  repeated character just wins and the earlier doodad loses its slot with no warning.
  Check the existing set before claiming one.
- **A horn's length is traced through open edges** (`BrassTube.traceHorn`), not
  flood-filled by family like `measureLength`. Tubes that touch but aren't joined are
  separate instruments. `edges` in the brass `PARTS` table is what decides that, and it
  is in local space like the face table.
- **Rooms are square, and world rooms are 13 × 13 with doors on the centre line.**
  Walking off an edge enters the neighbour in `rooms/world.json`. Entry doors carry
  `group: "entry"` so a lock can never shut them. Read `docs/WORLD.md` first.
- **Every sound lands on a sixteenth.** Inside a clock event use `ctx.play` (it takes
  the event's time); anything else goes through `ctx.nextGridTime()`. Never pass
  `audio.now` as a `when`. A wave is drawn by `src/render/motion.js`, on its tile at
  the instant its note sounds: don't go back to sliding from the previous tile.
- **Bass, tom and snare are mirrors, and only the head reflects.** The head is a
  line through the tile centre facing one way; a wave meeting the head reflects like
  light (`bounce()`), a wave meeting the back is absorbed by the shell, one moving
  along the head slips past (`meets()` in `percussion.js`). **Eight positions, 45°
  apart**: 0 is `/` facing up-left, as the Unity bass drum is drawn (legs lower
  right), and each step turns it clockwise. The drum type sets the sound and default
  position, never the direction. 45° headings draw from a `.flat` sprite so pixel
  art is only ever turned by 90°.
- **Coda walks freely, like Link in A Link to the Past** (`Game.walk`): held
  directions move him at 5.6 tiles/s with a body narrower than a tile, sticky facing
  on diagonals and a nudge round corners. `player.rx/ry` is where he is; `player.x/y`
  is the tile under his centre, which is all the game logic reads, so firing, B,
  strings and doors still work on tiles. `Game.move(dir)` is the instant one-tile
  step kept for the editor, the tests and recorded solutions. Input sets held
  directions (`setHeld`); never call `move` from input again.
- **The play screen is a square stage between two status bars** (`src/ui/`): the
  stage is sized by `fitStage` to the full width of an upright phone; the old toolbar
  lives in the pause menu (≡ or Esc); the pad and A/B float and can be dragged
  (Menu -> Move controls, kept in localStorage per orientation). `[hidden]` is forced
  to `display: none !important` because a hidden overlay with its own `display` still
  ate every touch. Safari's tap-and-hold is off on the play screen (`user-select`,
  `-webkit-touch-callout`), back on in the editor's fields.
- **Editor edits mutate the live room; they never reload it.** `Room.setTileChar` /
  `setOverride` rebuild one tile. Reloading would reset every lock and door mid-build.

## Assets

**The look is black and white: white line-work on a black floor**, like the Unity
build. The colour wing palettes are parked behind `THEME` in `src/render/palette.js`,
not deleted. Don't reintroduce colour without Timothy asking.

**Making or changing any tile art: use the `composers-key-art` skill**
(`.claude/skills/composers-key-art/`). It holds Timothy's style as measured rules
(main lines 3 px, ornament 2, about 17% ink, ornament attached to the form) and the
draw, look, measure, critique loop, with `tools/art-style.mjs` and `tools/art-sheet.mjs`.

**Read `docs/ART-PROTOCOL.md` before drawing or generating any tile.** 51 × 51 px,
pure white, two-value alpha, unrotated, connectors at fixed pixels. The numbers live
in `src/art/protocol.js`.

`assets/` holds real art and audio copied from the Unity project — see the tables in
`docs/PORTING.md` and `docs/ASSETS.md` before changing any of it. Rotation and square
padding are **baked into the PNGs**; colour is not. `AssetStore` recolours every sprite
to the manifest's `ink` on load (Unity's `SpriteRenderer.color`), and `flipX` mirrors
one (the mouthpiece is drawn backwards). The horn samples are named an octave low; the
measured pitches live in `src/audio/sampler.js`. All of it is optional — delete
`assets/` and the harness runs on sketch placeholders and the synth voices.

Every slot without real art gets a **sketch placeholder** (`src/art/placeholders.js`,
drawn with the seeded pen in `src/art/pen.js`). A new doodad should get one the same
day it gets a class, so art never blocks a mechanic.

**Walls are quiet**: a border only where they meet floor, curls in outside corners,
one `wall.inner` stamp for inside corners. Doors rotate to fit their wall
(`autoRot`). The old busy wall art is Unity's pushable block, now the `block` slot.

**Pegs and doors turn themselves** (`autoRot` in `src/art/links.js`): a peg points
its stem at the string beside it. Add a piece there rather than hand-rotating it in
every room.

**The unlock key** (`src/render/key-flight.js`): when a solved puzzle opens a door
(`Door.setOpen` -> `ctx.onDoorOpened`), Timothy's 3D note-key from his website flies
in, spins and dives into the door, timed in beats. The model and its WebGL renderer
are copied unchanged into `src/vendor/key3d/` from `StarrySidekick/Doppelganger-Website`;
change them there and copy across, never here.

**Asset review**: `node tools/asset-review.mjs out.html` builds the review page
(every tile, real and placeholder, plus `PROPOSALS`). Published as an Artifact with a
`db` capability; Timothy's notes are in its `notes` collection. Read them with
ArtifactData before changing art. The live page:
https://claude.ai/artifact/9WZenE4ds34khFiRf5TR91

**Linked art** (`src/art/links.js`): walls and piano keys ask for a variant spelled by
the neighbours they join, `wall.ns` before `wall`. Visual only: `spriteKey` is
untouched, the renderer composes the linked key. Don't move it into the doodads.

## Adding a doodad

1. New class in `src/doodads/`, extend `Doodad`, call `defineDoodad('type', Cls)`.
2. Import it from `src/doodads/index.js`.
3. Give it a character in `DEFAULT_LEGEND` (`src/core/room.js`).
4. Register it with the editor in `src/editor/catalog.js`: a brush in `GROUPS` (palette,
   character list and sprite slot all come from there) and, if it has authorable
   properties, a row in `PROPS`.
5. Implement `onWaveEntered(wave, ctx)` — it must call `wave.pass()`, `wave.reflect(dir)`
   or `wave.destroy()`. Instruments should route through `applyFaceAction`.
6. If its art changes with its state, override `spriteKey`; if it has a readout rather
   than art (a tuning, a degree), put that in `overlay()` so it survives a real sprite.
   See `docs/ASSETS.md`.
7. Give every key it can return a placeholder in `PLACEHOLDERS`
   (`src/art/placeholders.js`). If it joins neighbours, add its edges to
   `connectorEdges()` so `test/art.mjs` checks them. See `docs/ART-PROTOCOL.md`.
8. Keep `draw()` legible in the mono palette: fills near-black, strokes light.

## Testing

**There is a runner now: `node test/rooms.mjs`** — serve the repo root on :8080
first. It plays every room in the manifest and checks the two things that break
silently in a port like this: a legend character claimed twice (an object
literal just lets the later one win), and a doodad playing a pitch that never
came through the room's scale.

Three things about it worth knowing before you change it:

- **It fires from where a player would stand.** The first version fired from
  the room's spawn point, the wave died on step 0, and every room passed having
  proved nothing. It now walks the grid, stands next to each doodad on every
  side there is room to stand, and fires in — hundreds of shots per room, with
  circuits up to 39 steps. `can actually be played into` and `carries a wave
  further than one tile` exist so that going vacuous again fails loudly instead
  of passing quietly.
- **`game.loadRoom` takes the parsed room, not a path.** Hand it a string and
  you get an empty 1×1 room that fires nothing and fails nothing. That was the
  cause of the vacuous first version.
- **The scale check catches a doodad bypassing the scale, not a broken scale.**
  The legal set is built from the room's own `MusicalState`, so a fault inside
  `getNote` shifts both sides together and passes. Proved by injection both
  ways. If you want the other half, it wants pinning a couple of rooms'
  expected pitches to literals.

Headless Chromium cannot decode the real samples, so it filters that one error
by exact message and still fails on anything else.

### And the art check

`node test/art.mjs` (same server) holds every sprite, real and placeholder, to the
connector rule in `docs/ART-PROTOCOL.md`, and every placeholder to 51 px and
two-value alpha. It was written because measuring the art found the mouthpiece drawn
mirror-image, which nothing else noticed. Proved by injection: drop the mouthpiece's
`flipX` and it fails naming the edge.

### And timing, and the world

`node test/timing.mjs` drives the game on a fake audio clock, 1 ms per tick, and
checks that waves step every sixteenth, every note is on that grid, a wave is drawn
on a tile when its note sounds, firing is quantised, tempo changes do not skip, and
a hint phrase keeps the room's tempo. It caught three real faults on its first run.
Proved by injection: restore the old drawing code and it fails "7/7 late".

`node test/world.mjs` checks every world room is square and the same size, every
edge door leads to a room with a matching door back, and walks a player through a
door and back (state kept, shut doors block).

### And walking

`node test/walk.mjs` drives `Game.walk` with exact time steps: Link's speed, walls
stop him at his body's edge, sticky facing on a diagonal, the corner nudge carries a
near-miss through a door into the next room, and walking over a string plucks it.
Proved by injection: let walls stop nothing and it fails at the wall.

### And can every room be finished

`node test/solve.mjs` replays the `solution` recorded in each world room (stand
here, face there, fire or press B or walk) and checks every exit door is open at
the end and walkable to. Each step's spot must be WALKABLE from the last one, so
a solution cannot cheat through a wall. **Every world room needs a solution**; a
new room without one fails. Proved by injection: turn Brass 04's valve once
instead of twice and it fails naming the shut door.

### And a report, for when you are making rooms rather than fixing them

`node tools/room-report.mjs` (same server, optional name filter) answers the
other question: not "is this room broken" but **"is this room any good"**. It
drives the rooms the same way and prints, per room, the pitches it can produce,
how far its circuits run, which piece carries it, and the two lines worth
reading:

- **NEVER HIT** — a piece no shot from anywhere a player can stand ever reaches.
  Nearly always a level-design mistake, and invisible in the editor, because the
  piece is sitting right there looking placed.
- **mute** — reached, but sounded nothing. Correct for a lock, a peg or a
  keyshift; a question for an instrument.

**Nothing in it passes or fails**, on purpose. It is a thing to read while
authoring, and a room can be a good room and score badly on any line.

Two things about it: walls, doors and exits are filtered out of the findings as
a display choice, since sixty walls bury the one piece that matters; and a note
played on a later beat hold rather than inside `receiveWave` counts in the
totals but is not attributed to its doodad. It needs Playwright like the
harness does, and like the harness it is not part of the site — the no-build,
no-dependency rule is about what ships, and `tools/` does not.

It asked one question that now has an answer: Keys 01's piano keys are reached
by waves but sound nothing. Correct: `PianoKey.onWaveEntered` passes the wave on,
and a key is played by walking on it (`onPlayerEnter`). The recorded solution
plays mi-re-do on them that way.

Beyond that, verify in the browser: `window.CK` exposes `{ game, audio,
renderer, assets }`, and `game.update()` can be driven manually in a loop to step the
simulation faster than real time. Raising `game.room.music.bpm` is the quickest way to
fast-forward a wave circuit.

To step a circuit deterministically without waiting on the clock at all, drive the waves
directly and stub the audio engine to record what it was asked to play:

```js
const notes = [];
const real = CK.audio.play.bind(CK.audio);
CK.audio.play = o => { notes.push(o); if (CK.audio.heard(o)) CK.audio.onNote?.(o.midi, o.family); };
CK.game.setFacing('right'); CK.game.fire();
for (let i = 0; i < 60; i++) {
  CK.game.clock.index++;
  for (const w of CK.game.waves) w.step(CK.game.ctx);
  CK.game.waves = CK.game.waves.filter(w => w.alive);
}
CK.audio.play = real;
```

Re-route `onNote` yourself if you stub `play` — that is the hook the note locks listen on,
and forgetting it makes a working phrase look broken. Gate it on `CK.audio.heard(o)`:
a note lock's hint phrase is played with `heard: false`, because until 2026-10-02 the
lock heard its own hint and opened the door when you pressed B on it.
`test/solve.mjs` now checks no room can be solved that way.
