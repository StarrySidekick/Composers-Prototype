# Composer's Key — Prototyping

A browser harness for prototyping *Composer's Key* mechanics fast, then porting the ones
that survive into the Unity project. No build step, no dependencies, no engine — open a
page, draw a room as text, hear it immediately.

It doubles as the seed for a smaller, self-contained, mobile-friendly music game if one
of these prototypes turns out to want its own life.

## Run it

Rooms are loaded with `fetch`, so it needs a server (any server):

```bash
python3 -m http.server 8080
```

Then open <http://localhost:8080>. On GitHub Pages it just works — see *Publishing* below.

## Play

| Input | Action |
|---|---|
| WASD / arrows | move and face |
| Space | **A** — fire a sound wave from the Composer's Key |
| E or F | **B** — interact / melee strike the tile you're facing |
| R | reset the room |
| M | metronome |

On touch, the same six inputs are the on-screen Game Boy at the bottom. Everything is
designed touch-first, per GDD §9 — nothing here can be authored that a phone can't play.

## Author

Hit **editor**. A room is an ASCII drawing plus a legend:

```json
{
  "id": "brass-01",
  "wing": "brass",
  "music": { "root": 0, "mode": "ionian", "bpm": 104, "timeSignature": 4, "mood": "content" },
  "layout": [
    "#############",
    "#.@......-Y.#",
    "#......*....#",
    "######D######",
    "#.....X.....#",
    "#############"
  ]
}
```

Type into the layout box and the room reloads live — the loop from "idea for a puzzle" to
"playing that puzzle" is a few seconds. **copy JSON** / **download .json** gets it out;
drop the file in `rooms/` and add a line to `rooms/manifest.json` to keep it.

The full character list is in the editor panel under *Characters*. Legend entries can be
overridden or added per room, so a room can define `"1"` as a piano key tuned to a
particular degree without touching the defaults.

## What's modelled

Faithful to the GDD and to the Unity architecture, deliberately:

- **Beat-stepped sound waves.** One tile per subdivision, carrying a `SoundWaveState`
  (pitch, intensity, modulation, source, tilesTraversed). Not a physics object.
- **Everything is a doodad.** Walls, doors, locks and instruments share one tile
  architecture, so the prefab system that makes a wall makes an oboe.
- **Face-action instruments.** Every routing tile is a table of four local-space faces —
  block, pass, redirect 90° CW/CCW, reflect, play-and-absorb — rotated into the world.
  Same table as `BrassTube.cs` and `Drum.cs`.
- **Musical state per room.** Key, mode, tempo, time signature, mood. Every pitch anything
  plays is snapped to the room's scale, which is why solving a room sounds like music
  without the player knowing any.
- **Length-based pitch.** Longer tube = lower note. String runs pick violin / viola /
  cello / bass by tile count, same thresholds as `String.cs`.
- **Locks with many solutions, and locks with one.** A trigger lock accepts any wave; a
  note lock wants a specific phrase and will play you the hint.
- **Mode ↔ mood mapping** from GDD §11, live in the editor.

Not modelled yet: the four area instruments, fabric-bending, sheet-music scooping, the
Strumentini inventory, bosses. Those come when there's something to test.

## Layout

```
index.html          shell + virtual Game Boy
src/core/           beat clock, musical state, sound wave, room, doodad base, directions
src/doodads/        brass, strings, percussion, keys, locks, structure
src/audio/          Web Audio synths — the FMOD stand-in
src/render/         canvas renderer + wing palettes
src/editor.js       live ASCII room editor
rooms/*.json        the rooms, plus manifest.json
docs/PORTING.md     how each piece maps back to the Unity project
```

`window.CK` exposes `{ game, audio, renderer }` in the console for poking at a running
simulation: `CK.game.room.music.bpm = 160`.

## Publishing

GitHub Pages serves this as-is from the repo root — no build, no Actions workflow.
Push, then in **Settings → Pages** choose *Deploy from a branch*, branch `main`, folder
`/ (root)`. `.nojekyll` is present so `src/` and underscore paths are served untouched.

## Porting back to Unity

See [docs/PORTING.md](docs/PORTING.md). Naming was chosen to make this mechanical:
`SoundWaveState`, `MusicalState`, `FaceAction`, `measureLength`, `onWaveEntered` all
correspond one-to-one. The one real trap is the Y axis — screen space here is +y down,
Unity 2D is +y up, which mirrors every CW/CCW rotation.
