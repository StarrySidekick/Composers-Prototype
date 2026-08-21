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
- **A horn's length is traced through open edges** (`BrassTube.traceHorn`), not
  flood-filled by family like `measureLength`. Tubes that touch but aren't joined are
  separate instruments. `edges` in the brass `PARTS` table is what decides that, and it
  is in local space like the face table.
- **Editor edits mutate the live room; they never reload it.** `Room.setTileChar` /
  `setOverride` rebuild one tile. Reloading would reset every lock and door mid-build.

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

There's no test runner. Verify in the browser: `window.CK` exposes `{ game, audio,
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
