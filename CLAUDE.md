# Composer's Key — Prototyping

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
- **Editor edits mutate the live room; they never reload it.** `Room.setTileChar` /
  `setOverride` rebuild one tile. Reloading would reset every lock and door mid-build.

## Assets

`assets/` holds real art and audio copied from the Unity project — see the tables in
`docs/PORTING.md` and `docs/ASSETS.md` before changing any of it. Rotation, ink colour
and square padding are **baked into the PNGs**, not applied in code, because
`AssetStore` blits a slice verbatim. The horn samples are named an octave low; the
measured pitches live in `src/audio/sampler.js`. All of it is optional — delete
`assets/` and the harness runs on `draw()` and the synth voices.

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

Beyond that, verify in the browser: `window.CK` exposes `{ game, audio,
renderer, assets }`, and `game.update()` can be driven manually in a loop to step the
simulation faster than real time. Raising `game.room.music.bpm` is the quickest way to
fast-forward a wave circuit.

To step a circuit deterministically without waiting on the clock at all, drive the waves
directly and stub the audio engine to record what it was asked to play:

```js
const notes = [];
const real = CK.audio.play.bind(CK.audio);
CK.audio.play = o => { notes.push(o); CK.audio.onNote?.(o.midi, o.family); };
CK.game.setFacing('right'); CK.game.fire();
for (let i = 0; i < 60; i++) {
  CK.game.clock.index++;
  for (const w of CK.game.waves) w.step(CK.game.ctx);
  CK.game.waves = CK.game.waves.filter(w => w.alive);
}
CK.audio.play = real;
```

Re-route `onNote` yourself if you stub `play` — that is the hook the note locks listen on,
and forgetting it makes a working phrase look broken.
