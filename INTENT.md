# Intent

What this is for, and what to build next. Recorded **2026-09-06** from Timothy's
own answers to a direct set of questions, so this is *stated* intent rather than
intent inferred from the code.

**Read this before choosing what to build.** Where it disagrees with the rest of
the docs about **direction**, this file is newer and wins. Where it disagrees
about **mechanics** — how the code works, what was decided deliberately, the
invariants — the other docs win, always.

When something here is done, or turns out to be wrong, **edit it**. A stale
intent file is worse than no intent file.

## What it is for

Still what it says it is: a fast-iteration harness for *Composer's Key*
mechanics, which **port back into the Unity project**. That has not changed.

A phone-native version of the game is a real future branch, but it comes **after
there is a solid prototype testing environment**, and it will be its own repo.

## What is next

**A strong pipeline for testing new features, so that what feels good can be
ported to Unity.** In Timothy's words, that is the shape of the work: try
something here, judge it honestly, and move it across when it earns it.

Which means **improving the loop is as valuable as adding a mechanic.** Anything
that makes it faster to author a room, play it, and tell whether it is any good
is directly on the path.

Named specifically: **he wants to make a bunch of levels and test them.** A
better editor, a level format that is quicker to write by hand, a way to see at
a glance whether a room actually plays — all of that serves the thing he
actually wants to sit down and do.

**The third of those exists now**: `node tools/room-report.mjs`, written
2026-09-06. `test/rooms.mjs` says whether a room is broken; this says what a room
*does* — its pitch range, how far its circuits run, which piece carries it, and
the piece no shot from anywhere a player can stand can reach. Nothing in it
passes or fails, on purpose.

It found one thing on its first honest run worth an answer: **Keys 01 produces
two distinct pitches, and all six of its piano keys are reached without
sounding.** Possibly correct, possibly not, and nothing else in the repo would
have said so.

**Still missing from the loop:** a faster way to *write* a room, and any way to
judge whether one is fun without a person playing it. The report can say a room
is thin; it cannot say a room is boring.

## Art, recorded 2026-10-01

Stated by Timothy, so this overrides the older "do not invest effort in art here"
line below where they disagree:

- **Parity with the Unity game's look.** The game is almost entirely black and white:
  sketchy white line-work. The parchment, gold and per-wing colours the prototype had
  were never the real look and are now parked. Colour may come later; not yet.
- **Placeholders that look like his art**, so mechanics can be built before the
  hand-drawn art exists. The art is the bottleneck because it is drawn by hand.
  Done as a protocol (`docs/ART-PROTOCOL.md`) plus a generator that obeys it.
- **Tiles are 51 × 51 px** for now. He may draw at other sizes later; the protocol
  keeps the number in one place (`TILE` in `src/art/protocol.js`).
- **Tile rules**: pieces that join should change texture to show it. Done for walls
  and piano keys (16-case autotiling). Not done: inside corners (the 47-case set), and
  any family beyond those two.

Later the same day, also stated:

- **Rooms are square.** Easy, and mobile friendly. Done: 13 × 13 for every world room.
- **Quieter walls** that still join and still look like his line-work. Done.
- **Doors lead to rooms**: solve the puzzle, a door opens, walk through, you are in
  the next room up, down, left or right. Done (`rooms/world.json`, `docs/WORLD.md`).
  Not a door that "does something": a way from one room to the next.
- **Position and rotation should be understood**, not guessed. Written down in
  `docs/WORLD.md`; doors and wall corners now rotate themselves.
- **Everything in time.** The wave must really travel at the BPM and every sound be
  synchronised. Checked by `test/timing.mjs`, which found and fixed three faults.

Later again (same day): use the 3D key from his website as an unlock animation
(done, `src/render/key-flight.js`); make more rooms (three, a new bottom row);
fix sprites that do not turn to their instrument, e.g. pegs (done, they face
their string); make 51 x 51 assets and a page to review and comment on every one
(done: https://claude.ai/artifact/9WZenE4ds34khFiRf5TR91, notes in its `notes`
collection).

Then (same day): **drums reflect like a mirror**, "reflects light, so it depends on
the position and the rotation of the drum itself." Done: bass, tom and snare bounce
waves off their head by real reflection, in 45° steps. Percussion 01 and 02 were
re-slanted to suit, and their recorded solutions prove it. Then: **the back of the
drum absorbs the wave**, "that's kind of the behavior it has in the actual
composer's key game." Done: only the head reflects, so a drum has eight positions.

2026-10-02, on the play screen: remove Safari's tap-and-hold select (done); the
square stage pushed to the edges of the screen (done: full width on an upright
phone); classic top and bottom status bars "like Zelda or Doom" (done: room, key,
tempo with beat lights, waves above; forks lit, a staff of the last notes heard,
mood below; the old toolbar is in a pause menu); controls movable to fit his hands
(done: drag, resize, remembered); and Coda moving "like Link in A Link to the Past,
similar speed and feel" with a walking animation (done: free movement at Link's
speed, sticky diagonals, corner nudging; the walk is a hop and lean per step, since
Coda's art is a single drawing. Real walk frames would replace it; that is art).

2026-10-02: "download like a pixel art skill ... to get a little bit better at making
placeholder art and replicating my style." Searched; the one real fit was Pixel Art
Studio (Gamezxz, MIT): its method (draw in code, look, critique, fix; study the
artist) is adapted into `.claude/skills/composers-key-art`. Studying his sprites
found his main line is 3 px where placeholders were 2, and his ornament grows from
the form where placeholders floated; both fixed and measured.

**Gaps found, with what could fill them** (proposals; nothing here is decided):

- ~~Woodwind has no instrument at all.~~ Done 2026-10-03: flute and reed.
- ~~The stairs mean nothing to a puzzle.~~ Done 2026-10-03: stairs climb, and a
  note lock can want its phrase in another key (`key`), so where you stand matters.
- **Dissonance does nothing a puzzle can feel.** It sours a wave, and every lock
  still accepts the sour wave. Proposal: note locks reject soured notes, or a sour
  wave cannot light a fork.
- **The strumentino and hi-hat have no puzzle yet**: the strumentino is a blank
  per-face instrument; the hi-hat only ticks. Brass 05 / Percussion 02 use the
  hat as a metronome, nothing more.
- **Art**: 41 slots are still on placeholders. Real art exists for 15.

Still open on art: the rest of the Unity sprite folder has not been brought across,
because this repo cannot see it. Copying `Assets/Sprites` (or a listing of it) into the
repo is the next step for parity.

## 2026-10-03: the dungeon pass

Asked for by Timothy, in one list. What was done with each, and what is a guess
he should check:

- **Interconnected rooms, like a Zelda dungeon or a metroidvania.** Done: sixteen
  rooms, branches, a shortcut back to the start (doors are paired, so it opens from
  the far side), backtracking for a reed found two areas earlier, a map in the
  pause menu. `docs/WORLD.md`. `node test/route.mjs` plays it start to finish.
- **Woodwinds with unique mechanics.** Done: the **flute** (the fingering picks the
  note AND the way the wave leaves: it goes out the first open hole) and the
  **reed** (keeps breathing: a wave a beat for several beats). Two rooms teach them.
- **Start menu and pause menu.** Done: title screen with continue / new game / free
  play / editor (the room plays behind it, the 3D key spins); the pause menu has
  the map, the satchel, the score's layers, and the old toolbar under "workshop".
- **Upgrades for more waves at once.** Done: **Overtones**, two in the woodwind
  wing. The Triad needs three waves in the air at once; `test/mechanics.mjs` proves
  two cannot do it in any order.
- **Collect instruments, place them later; the burin.** Done: the **Burin** (in
  the Triad) lets L lift drums and reeds into the satchel and set them down, R
  turns the one in hand. The Stand needs the reed from the Reed Loft.
- **Playing a piece continuously over multiple rooms.** Done two ways, a guess at
  what was meant: waves **carry on through open doors** into the next room, and a
  lock can **listen to the whole world** with a patience in beats. The Coda's lock
  wants la-sol-mi-do: la is played by a flute next door, and the same wave walks
  on through the doorway to play sol, mi and do. If he meant something else (a
  piece you perform room by room, against a timer?) it is a small change.
- **Raising or lowering the key as a puzzle.** Done: stairs now **climb** (up
  raises, down lowers, as a raised dais should), and a note lock can want its
  phrase **in another key**. The Stair: the lock wants A, the room is in G, there
  are a two-step and a three-step stair.
- **Areas with a mode that reflects a mood.** Done: six areas, each one key, mode
  and tempo, with a title card on entry. The Coda turns from phrygian to ionian
  when it is solved.
- **A motif that loops and grows through the level.** Done: a four-bar tune in
  scale degrees, a layer added per solved room (ten), played in each area's key and
  mode. The score gate before the end wants nine. The tune itself is a first draft
  composed blind (no one has listened to it yet): judge it by ear.
- **Smoother movement, with the waves still on the beat.** Coda already walked
  freely like Link (2026-10-02). Added: the Zelda screen scroll between rooms, and
  dissonants hop between tiles instead of jumping.
- **Scope a limited enemy.** Prototyped: the **dissonant**, a sour note that walks
  on the beat, shoves Coda, and is resolved by any wave. Scope and options in
  `docs/SCOPE-ENEMIES-AND-BOSS.md`.
- **Scope a boss.** Written, not built: the Unresolved Chord, a call-and-response
  exam on the level's mechanics, in the same doc.

Judgement calls worth his eye: the timing windows of the two "set it breathing and
run" rooms on a real phone; whether the dissonant's shove is too soft; the tune.

## 2026-10-04: after playing it

Timothy played the dungeon and asked for eight things. What was done:

- **Every tubing structure has a mouthpiece and ends in bells.** Done: the rule is
  checked on every room (`test/rooms.mjs`); seven rooms were rebuilt to it. Bells now
  let the wave out after they sound, so horns still feed forks.
- **He could not work out how to scoop instruments with the burin.** The L and R
  buttons now say what they would do ("lift", "set", "turn") and glow when they can;
  the burin's message says L (and Q); a hi-hat waits right below the burin to try.
- **The hint box covered the play area.** It now sits under the stage, above the
  controls, and stays until tapped.
- **It should type like a game, each word a sound in the mode and song.** Done: a
  word per sixteenth, each sung on a tone of the tune's current chord, in the room's
  key and mode; a full stop comes home to the root.
- **A boss.** Done: the Unresolved Chord, west of the Coda. Echo its call, resolve
  its swarm, answer it with a three-note chord. Judge whether phase three's timing
  (longest horn first, a beat to land all three) is fun or fiddly on a phone.
- **The slide and other sprites read badly small.** Placeholders redrawn bolder for
  play size (his real art untouched).
- **A metronome room: on starts the motif loop, off pauses it.** Done, as the first
  room of the world: the tune is silent until it runs.
- **Tint the background by mode.** Done: a near-black floor per mode.

## 2026-10-05: the SNES sound

Timothy asked: *"what's your ability to get sound fonts from retro games and use them
here, i specifically want the link to the past and super metroid sound font"*. The
soundfonts that circulate are Nintendo's samples ripped from the games, and this repo
is public, so they cannot go in it. Offered instead: an SNES-style engine with our own
instruments, a bring-your-own-soundfont loader kept on his device, or both. He chose
*"snes style sound engine to start"*.

Done: an emulated SNES sound chip (`src/audio/snes/`, `docs/SNES-SOUND.md`) as two
settings of the pause menu's sound switch, **snes room** (A Link to the Past in
spirit) and **snes cave** (Super Metroid in spirit). Our own instruments, made from
harmonics and BRR-encoded; the chip's interpolation, envelope, noise and echo from
the hardware reference; eight voices.

Needs his ears: every instrument and both echoes were tuned by measurement, not by
listening (the numbers are in `rom.js` and `ECHO`). "To start" suggests the
bring-your-own-soundfont loader may come next; it would keep a file he supplies in
his browser only, never in the repo.

## Something that needs Timothy

**The GDD should come into this repo.** It currently lives at
`~/Desktop/Composer's Key/Composers Key Design Document.md` and is the canonical
design source, which means no unattended session can read the document it is
told to defer to. Dropping a copy in (`docs/` is the natural home) makes the
canon actually reachable.

## Worth knowing

Placeholder assets are fine. **Timothy will be drawing more art over time.** Do
not hand-polish art here; invest in the pipeline that carries his art in and stands
in for it until it exists (see the 2026-10-01 section above).
