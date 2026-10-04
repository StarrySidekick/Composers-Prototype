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

Since 2026-10-03 the world is a small dungeon, not a corridor: eighteen rooms on a
grid, with branches, a shortcut back to the start, and things found in one place
that are needed in another. Rooms sit on the grid like this (`=` and `|` are
doorways; `s` is the shortcut, shut until opened from the far side):

```
             x=-1           x=0            x=1              x=2               x=3
  y=-1                  Reed Loft ==== Flute
                        Overtone 2     Overtone 1
                            s             |
  y=0    Metronome ==== Brass 01 ===== Brass 02 ===== Brass 03 ======== Triad (3 waves; Burin)
         start: B starts the tune             |                 |
  y=1                   Keys 01 ====== Strings 01 ==== Percussion 01     Stand (carry the reed here)
                           |                                               |
  y=2                   Brass 04 ===== Percussion 02 = Brass 05 ========= Stair (a lock in another key)
                                                                           |
  y=3                                  Unresolved === Coda ============= Hall (dissonants, score gate)
                                       Chord (boss)
```

It starts in **the Metronome** (2026-10-04): silence until you press B on it, then
the tune begins on the next beat. Stop it any time and the tune waits where it is.
It ends in **the Unresolved Chord**, the boss, west of the Coda: an echo, a swarm,
a chord (docs/SCOPE-ENEMIES-AND-BOSS.md). The exit appears where it stood.

### Areas and their moods

Rooms belong to an **area**: a run of rooms that share a key, a mode and a tempo.
The music only changes mood at an area's border, so walking from the Atrium into
the Undercroft is audibly walking somewhere sadder. `node test/world.mjs` fails on
a room that drifts from its area.

| area | rooms | key, mode | mood | bpm |
|---|---|---|---|---|
| The Atrium | Metronome, Brass 01, 02, 03 | C ionian | content | 104 |
| The Reed Gallery | Flute, Reed Loft | F lydian | mysterious | 96 |
| The Undercroft | Percussion 01, Strings 01, Keys 01 | A aeolian | sad | 88 |
| The Cloister | Brass 04, Percussion 02, Brass 05 | D dorian | reflective | 100 |
| The Bell Tower | Triad, Stand, Stair | G mixolydian | confident | 100 |
| The Discord | Hall, Coda, Unresolved Chord | E phrygian | tense | 108 |

The floor is tinted by mode (umber, teal, oxblood, violet, gold, night blue,
green), so a new area, or the boss changing key, is seen as well as heard.

The Coda turns content (ionian) when its phrase is played: the room's file says
`"solved": { "mood": "content" }`. The dissonance resolves.

### The score: a motif that grows

`"score"` in world.json is a four-bar tune, written in scale degrees (I vi IV V),
played quietly under everything (`src/audio/score.js`). It starts as one motif in
the first room. Every room you solve adds a **layer** (a bass line, a pulse, horn
calls, a flute's answer, the reed's broken chords, chords, an answering phrase, a
descant, the whole band), until at the boss it is close to a finished piece. It
plays only while the metronome runs.
Because it is in degrees and played through whichever room you are in, it takes on
each area's key and mode: the same tune is content in the Atrium and tense in the
Discord. Its notes are never heard by a lock. The pause menu lists the layers.

The Hall's **score gate** (`$`) opens only with nine layers, so the end needs most
of the dungeon solved, the optional wing included.

### How rooms join

The rule is still the whole system: **walk off a room's edge and you enter the
room in the next grid cell that way**, on the mirrored tile of its far edge. The only
way off an edge is through an opening in the outer wall, which in practice is a door.

- **Exit doors** are doors (`D`) in a group the room's locks open.
- **Entry doors** are `{ "open": true, "group": "entry" }`: always open, never
  shut by a lock.
- **Doors are paired.** A door in an outer wall has a partner in the next room, and
  the two open and shut together (unless the partner is an entry door). A door is a
  wall from both sides until it opens: you cannot walk out through it from either
  room. That is what makes the **shortcut**: Brass 01's north door is in group
  `s`, which has no locks, so it is shut, and it opens the moment the Reed Loft's
  south door does.
- **Waves go through doors.** A wave that leaves through an open edge door carries
  on in the next room, as a wave there (`Game.crossEdge`), quieter, since you hear
  it through the wall. A shut door on the far side stops it. Rooms you are not in
  keep playing: a reed set breathing keeps breathing after you leave.
- **Rooms remember**, now across sessions. `src/core/progress.js` is the save:
  Overtones found, the Burin, the satchel, every pickup taken and instrument
  moved, every door a puzzle opened, the score's layers, the rooms visited. A room
  is rebuilt from its file and the save is replayed on top. **Reset room** starts
  its puzzle over but keeps what you collected or moved, so nothing duplicates.

### What is found where

| find | where | what it does |
|---|---|---|
| Overtone | the Flute (behind the first fork) | the Key sounds 2 waves at once |
| Overtone | the Reed Loft (behind the held door) | 3 at once |
| the Burin | the Triad (needs 3 waves) | L lifts drums and reeds into the satchel, sets them down; R turns the one in hand |
| the reed | the Reed Loft, lifted with the Burin | the Stand needs it, two areas away |

Adding a room: give it a cell and an area in `world.json`, make it 13 × 13 in the
area's key, put a door on the centre of each wall that leads somewhere with a door
in the neighbour's facing wall, record a `solution`, and add it to the `route`.

### Proving it

- `node test/world.mjs`: rooms square, doors matched, areas consistent.
- `node test/solve.mjs`: every room on its own, from a fresh game plus its `with`.
- `node test/route.mjs`: **one game from the start**, walking every tile through
  every doorway, through the `route` in world.json. It checks each room's `with`
  is satisfied when the route gets there, which is how it catches an item gated
  behind itself. On its first run it found a soft-lock.
- `node test/mechanics.mjs`: every gate really is a gate (the Triad cannot be done
  with two waves, the Stand cannot be done without the reed, and so on).

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
| mirror drums (bass, tom, snare) | `rot` in **45° steps**, the head's slant and the way it faces (only the head reflects; the back absorbs): 0 `/` NW, 45 `—` N, 90 `\` NE, 135 `\|` E, 180 `/` SE, 225 `—` S, 270 `\` SW, 315 `\|` W. The 45° positions use a `.flat` drawing turned by 90° steps |
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
