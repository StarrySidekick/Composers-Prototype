# Composer's Key — Prototyping

A browser harness for prototyping *Composer's Key* mechanics fast, then porting the ones
that survive into the Unity project. No build step, no dependencies, no engine — open a
page, paint a room, hear it immediately.

It doubles as the seed for a smaller, self-contained, mobile-friendly music game if one
of these prototypes turns out to want its own life.

## Run it
A regression harness lives at `test/rooms.mjs` — serve the root, then
`node test/rooms.mjs`. It plays every room in the manifest, checks that no
legend character is claimed twice, that nothing plays a pitch outside its
room's scale, and that `rooms/` and `manifest.json` list exactly the same
files — a room saved to one and not the other is otherwise invisible to every
tool here. See CLAUDE.md for what it does and does not prove.


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
| Ctrl/⌘ Z | undo an edit (Ctrl ⇧ Z / Ctrl Y to redo) |

On touch, the same six inputs are the on-screen Game Boy at the bottom. Everything is
designed touch-first, per GDD §9 — nothing here can be authored that a phone can't play.

## Author

`node tools/new-room.mjs <id> [wing]` scaffolds one — a bordered box with a
spawn and an exit, filed in `rooms/` and added to `rooms/manifest.json` in the
same step, so the two can't drift the way a hand edit can. It plays (firing at
all sounds Coda's own casting note) but there is nothing IN it yet; that's
what the editor is for.

Hit **build**. Pick a piece out of the palette, draw it onto the room, and play it — the
room never reloads, so it keeps its tempo, its open doors and its lit locks while you
build in it.

| Tool | |
|---|---|
| ✎ paint | drag to draw. Right-click (or Ctrl-click) erases with any tool selected |
| ▭ rect | drag out a filled rectangle — walls and floors in one gesture |
| ⌫ erase | back to floor |
| ↻ rotate | tap a tile to turn it 90° |
| ⊙ pick | tap a tile to load it into the brush |
| ☝ select | tap a tile to edit it without painting over it |

Tap any tile and the **Tile** panel offers exactly the properties that tile has — a
lock's group, a mallet's direction, a kettle drum's tuning, the degrees a note lock wants.
Those become per-tile `overrides` in the room JSON, so the ASCII drawing stays readable
instead of sprouting a new legend character for every variation. Where a character
already means the thing you asked for — a rotated elbow is a `J` — the editor uses it.

**build** / **play** switches between painting on the canvas and driving Coda around it;
the panel stays open either way. **width** / **height** resize the room in place.

A room is still an ASCII drawing plus a legend, and *Layout as text* at the bottom of the
panel is still the fastest way to move one between machines or read a diff:

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

Both views are live and always in sync. **copy** / **.json** gets the room out; drop the
file in `rooms/` and add a line to `rooms/manifest.json` to keep it.

The full character list is in the editor panel under *Characters*. Legend entries can be
overridden or added per room, so a room can define `"1"` as a piano key tuned to a
particular degree without touching the defaults.

## Art

Every tile draws itself with canvas calls and always will — but each one also names a
sprite key, and if the sprite store has an image for that key it is used instead. With no
`assets/manifest.json` (the state this repo ships in) nothing changes.

The editor's **Assets** panel bakes the prototype's own line art into a complete
placeholder set, packs it into an atlas PNG at whatever tile size you ask for, and takes
dropped PNGs — a folder of Unity exports lands in the right slots by filename. See
[docs/ASSETS.md](docs/ASSETS.md).

## What's modelled

Faithful to the GDD and to the Unity architecture, deliberately:

- **Beat-stepped sound waves.** One tile per subdivision, carrying a `SoundWaveState`
  (pitch, intensity, modulation, source, tilesTraversed). Not a physics object.
- **Everything is a doodad.** Walls, doors, locks and instruments share one tile
  architecture, so the prefab system that makes a wall makes an oboe.
- **Face-action instruments.** Every routing tile is a table of four local-space faces —
  block, pass, redirect 90° CW/CCW, reflect, play-and-absorb — rotated into the world.
  Same table as `BrassTube.cs` and `Drum.cs`.
- **Horns you can build and detune.** Straight, elbow, tee, cross, mouthpiece, bell, plus
  a **valve** (B rotates the flow), a **slide** (B pulls it out — more horn, lower note)
  and a **mute** (B seats it — quieter, buzzier, and the horn it feeds sounds muted).
- **A kit, not a drum.** Bass drum kicks a wave 90° clockwise, tom counter-clockwise,
  snare reflects it, hi-hat passes it and ticks, cymbal passes it and hands back the
  energy a tee took, timpani is pitched, absorbs, and retunes with B — the one piece of
  percussion a note lock will listen to.
- **Tubing knows what it's joined to.** A horn's length is traced through open edges, not
  flood-filled by adjacency, so two runs that merely touch stay two instruments with two
  pitches. A cross is a bridge, not a join: it carries a wave over and lengthens nothing.
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
src/render/         canvas renderer, wing palettes, sprite store, placeholder baker
src/editor/         the room editor — catalog, canvas painting, panel
rooms/*.json        the rooms, plus manifest.json
assets/             sprites, if there are any — optional
docs/PORTING.md     how each piece maps back to the Unity project
docs/ASSETS.md      the sprite pipeline, both directions
```

`window.CK` exposes `{ game, audio, renderer, assets }` in the console for poking at a
running simulation: `CK.game.room.music.bpm = 160`.

## Publishing

GitHub Pages serves this as-is from the repo root — no build, no Actions workflow.
Push, then in **Settings → Pages** choose *Deploy from a branch*, branch `main`, folder
`/ (root)`. `.nojekyll` is present so `src/` and underscore paths are served untouched.

## Porting back to Unity

See [docs/PORTING.md](docs/PORTING.md). Naming was chosen to make this mechanical:
`SoundWaveState`, `MusicalState`, `FaceAction`, `measureLength`, `onWaveEntered` all
correspond one-to-one. Everything under `src/editor/` is prototype-only and should not
be ported. The one real trap is the Y axis — screen space here is +y down,
Unity 2D is +y up, which mirrors every CW/CCW rotation.
