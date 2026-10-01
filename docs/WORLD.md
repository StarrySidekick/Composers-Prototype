# Rooms, the world, position, rotation, time

Written 2026-10-01. How rooms join, where things sit, which way they face, and
how everything stays on the beat. Code is the authority for each section; it is
named at the top of each.

## Rooms are square

Every room is square, and **every room in the world is 13 × 13**: an 11 × 11 floor
inside a one-tile wall. Thirteen is odd, so each wall has a true centre tile
(index 6), and that is where its doors go. The editor's size box sets both sides at
once. The sandbox is 18 × 18 and is not in the world.

## The world (`rooms/world.json`, `src/core/world.js`)

Rooms sit on a grid:

```
            x=0                 x=1                 x=2
  y=0   Brass 01   ──────▶  Brass 02   ──────▶  Brass 03
                                                    │
  y=1   Keys 01    ◀──────  Strings 01 ◀──────  Percussion 01
           │
  y=2   Brass 04   ──────▶  Percussion 02 ───▶  Brass 05 (ends at X)
        The Valve           Left and Right      The Slide
```

The bottom row (2026-10-01) exists to teach the pieces no room used: the valve,
the tom and hi-hat, and the slide played as an instrument. Brass 05's lock wants
mi-re-do, the same phrase as Keys 01, played this time by pulling the slide.

Every world room carries a `solution`; `node test/solve.mjs` replays them all.

The rule is the whole system: **walk off a room's edge and you enter the room in the
next grid cell that way**, on the matching tile of its opposite edge. Leave east from
row 6, arrive on the west edge at row 6. The only way off an edge is through an
opening in the outer wall, which in practice is a door, so a shut door is a wall and
an open one is a way out.

- **Exit doors** are ordinary doors (`D`) in group `a`: the room's locks open them.
- **Entry doors** (the way back) are the same `D` with an override
  `{ "open": true, "group": "entry" }`. The group matters: `checkGroup` sets every
  door in a group to "all locks lit", so an entry door left in group `a` would be
  shut again by a non-latching lock. A group with no locks in it is never touched.
- **Rooms remember.** A room is built once and kept, so a solved room stays solved
  when you walk back. Picking a room from the menu, or **reset**, builds it fresh.
- The last room, Brass 05, ends at an `X` exit.

Adding a room: give it a cell in `world.json`, make it 13 × 13, and put a door on the
centre of each wall that leads somewhere, with an entry door on the facing wall of
the neighbour. `node test/world.mjs` fails on a door that leads nowhere or has no
matching door on the other side.

Grid coordinates are screen space, **+y down**: `[0, 1]` is south of `[0, 0]`. In
Unity, flip it.

## Position (`src/render/renderer.js`)

- A tile at `(x, y)` occupies pixels `x*s .. x*s + s` and `y*s .. y*s + s`, where `s`
  is the on-screen tile size. Origin top-left, +x right, +y down.
- Art is 51 px and is scaled to `s` with nearest-neighbour, so pixels stay hard.
- Things that move between tiles (Coda, waves) are positioned by their tile plus a
  fraction, drawn about the tile centre.

## Rotation

- Art is drawn **unrotated** and turned about the **tile centre**.
- `rot` is degrees **clockwise on screen**: 0, 90, 180, 270.
- Unity's z-rotation is counter-clockwise with +y up. Same picture, same turn on
  screen, but the formulas flip; see the Y-axis table in [PORTING.md](PORTING.md).

Three places choose a rotation:

| what | rotation comes from |
|---|---|
| most pieces (tubes, mallets, strings) | `rot` in the room file, via the legend (`7` is an elbow at 0, `J` at 90) |
| doors | **automatic** (`autoRot` in `src/art/links.js`): drawn upright for a north-south wall, turned 90 when set into an east-west wall. A `rot` in the room file still wins |
| mirror drums (bass, tom, snare) | `rot` in **45° steps**, the slant of the head: 0 `/`, 45 `—`, 90 `\`, 135 `|`. The 45° slants use a `.flat` drawing turned by 90° steps |
| wall inside corners | **automatic**: one `wall.inner` drawing, authored for the north-east corner, stamped at 0 / 90 / 180 / 270 for NE / SE / SW / NW |

## Time (`src/core/beat-clock.js`, `src/render/motion.js`)

The clock is the audio hardware's clock (`AudioContext.currentTime`), never frame
time, so a slow frame cannot push the music late.

- **A wave moves one tile per sixteenth note.** At 120 BPM a beat is 0.5 s, a
  sixteenth is 0.125 s, so a wave covers 8 tiles a second. At 90 BPM, 6.
- **Every sound lands on a sixteenth.** Sounds made by the simulation are scheduled
  at their step's exact time. Sounds the player sets off directly (firing, a strike,
  a door) wait for the next sixteenth. Firing is therefore up to one sixteenth late,
  in exchange for always being in time.
- **What you see matches what you hear.** A wave is drawn exactly on a tile at the
  moment that tile's note sounds, then glides toward the next tile.
- **Changing tempo bends the grid without a jump**, and walking between rooms of
  different tempo keeps the beat running instead of restarting it.
- A note lock's hint phrase is eighth notes from the next beat, in the room's tempo.

`node test/timing.mjs` checks all of this against a fake clock it advances by hand,
1 ms at a time. Before these fixes it caught three faults: waves were drawn one tile
behind their sound, firing sounded whenever you pressed, and the hint phrase used a
fixed 0.28 s spacing in every room.
