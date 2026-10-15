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

## 2026-10-05: Conductor's Key becomes the overworld (NOT STARTED: needs his laptop)

Timothy, in his words: *"i have game i was working on called conducter's key, and
the repo might exist i think is actually within a visual studio code session or my
laptop, but i was coding it on an esp32 p4 dev kit. i want to see if we can take the
gameplay of that game and make it what its like to navigate the overworld of
composer's key. the dungeons are like the game is now, more room to room and focus
puzzles where you don't move like snake."*

So the game gets **two modes of moving**:

- **The overworld plays like Conductor's Key.** From his words it moves like Snake:
  you keep going and steer, presumably on the beat. Read the code to find out what
  it really does before designing anything.
- **Dungeons stay as they are now**: room to room, Coda walking freely, focused
  puzzles. The world in `rooms/world.json` becomes one dungeon among several.
- A dungeon entrance on the overworld switches mode; leaving switches back. The
  save (`src/core/progress.js`), Overtones, satchel and the growing score carry
  across both.

**Where the code is:** not on GitHub. On 2026-10-05 none of his repos, cloud
sessions or Google Drive had it. It is a local folder on his laptop, written for a
Waveshare ESP32-P4 dev kit, so it is C/C++ (Arduino core or ESP-IDF, probably
LVGL for the screen) with a `platformio.ini` or `CMakeLists.txt` at its top.

**For the session that has his laptop:**

1. Find the Conductor's Key folder. Ask him where it is if it is not obvious; do not
   guess between projects (Magitiles, also ESP32-P4, is a different one).
2. Push it to a new **private** GitHub repo (he agreed to this), e.g.
   `StarrySidekick/conductors-key`, so cloud sessions can read it too.
3. Read it for the **rules**, not to copy the C: what the player controls, how
   movement and the beat relate, what is on the grid, how you win or lose, what
   the music does. Write them down in `docs/OVERWORLD.md` in this repo, with the
   file and function each rule came from.
4. Propose in that doc how they become the overworld here, and what changes or
   stays (touch-first controls, the sixteenth grid, the save). Ask him before
   building: it is a big change in how the game feels.

Every constraint in CLAUDE.md still holds for the port: no build step, touch-first
(the snake has to steer from the on-screen pad), every sound on a sixteenth and
through a scale degree.

## 2026-10-13: the whole game, encased in marble

Timothy asked to scope the game's large strokes, not as a document but as the game
itself: *"plotting out the entire game as a series of placeholders with the ability
to sort of jump to different parts of the game or kind of enter a developer mode
that allows me to see the game with more detail ... but overall, be able to jump
back into an experience of, of like experiencing the game like a player ... this
philosophy of carving something out of marble instead of building it out of
nothing."* What he described, in his words, is recorded in `story/outline.json`
(the pitch, the cast) and the act files.

Done (`docs/MARBLE.md` has all of it):

- **The whole game as scenes** (`story/`): prologue (falling from the sky, the
  crash, the Key), the Wood (open, no boss, the workshop that exploded and why you
  were falling, the first pipe), the castle on the cliff, four wings each with its
  struggle as a boss (the Ramparts / woodwinds / chaos of life; the Core / brass /
  judgment; the Tower / strings / apathy; the Basement / percussion / fear of the
  past), the water organ at the heart, an ending, the credits as a conductor's bow,
  and the secret piano boss as an encore. 46 scenes, about 4h10, inside his 3 to 5
  hours. Each has a status and minutes, so the Marble view shows how much is carved.
- **New game plays all of it.** Real rooms where they exist (the prototype dungeon
  stands in for the castle, unchanged; the story wraps it with triggers), rough
  drafts where they do not (cutscenes of code sketches, title cards, tube runs and
  bosses on a rhythm engine), and slates that say what goes there where even a rough
  draft would be a guess.
- **Tube runs**: Guitar Hero in a pipe, upright or sideways, played on the D-pad
  (and A/B), one the first time you walk between certain wings, the gentlest one up
  the Wood's cliff. Ridden once, a pipe is fast travel from the pause menu, and
  riding it backwards plays its chart backwards.
- **Developer mode** and **the Marble** (jump anywhere, as a player would arrive
  there), **chapters** for a player, characters who talk in sung text (placeholder
  names: Fermata, Da Capo, Staccato, Tutti, Lento, Pianissimo, the Organist),
  self-aware lines from the game itself, the workshop unlocking the editor.

Guesses he should check (all marked in the outline):

- **Every boss is a rhythm duel for now**, each with its struggle as the twist
  (chaos scatters the lanes; judgment narrows the window and passes verdicts, then
  lets you play any note; apathy greys and slows; fear hides the notes, then repeats
  itself until you know it). The real bosses may be rooms, like the Unresolved Chord.
- **Three of the four wing instruments are invented** (a weathervane flute, a tuning
  bow, a heartbeat drum) and shown as idea slates. Only his brass horn is his; it is
  a placeholder item.
- **Which castle rooms stand in for which wing** is a best fit from the existing
  areas (the Reed Gallery for the Ramparts, the Bell Tower for the Tower, the
  Undercroft for the Basement, the Atrium and Cloister for the Core).
- **The secret piano is reached after the credits** (an encore), not hidden in the
  Basement. Either works with the outline.
- **Nothing fails**: missed notes sound sour, phases end regardless. Whether a pipe
  or a boss can be failed is an open question in the notes.
- The Wood is five 13 x 13 rooms; it probably wants to be bigger and freer, and may
  move like Conductor's Key (still waiting on that code; a slate marks the spot).

## 2026-10-14: his own music, in the game

Timothy, in his words: *"I want to take all of the music that I've made ... I have
all of these WAV files in my, in the albums folder on my desktop ... I also have
the MIDI files from the Ableton projects themselves ... inject all the music I've
made in the past into Composer's Key in some way ... label them and create like a
little artifacted list of various things so that I can kind of keep tabs on it ...
eventually be able to use that to create like sheet music ... and then also maybe
a way to like build like a little very easy to use sheet music creation thing to
write little motifs and melodies that can eventually be used for the game."*

Done (`docs/MUSIC.md` has all of it):

- **An importer for his Mac**, `tools/music-library.mjs`: reads every Ableton
  project's MIDI (session clips and the arrangement played out), loose .mid files,
  and WAV headers; matches bounces to projects by name; guesses each piece's key
  and mode; writes `library/library.json` and a clean `.mid` per piece with the key
  signature. `library/` is git-ignored: the repo is public and the music is his.
- **The songbook** (`songbook.html`, a chip on the title screen and in the pause
  menu's workshop): the library, labelled (status, tags, notes, the key when the
  guess is wrong), playable, four bars of any clip as sheet music; and a motif
  writer whose grid is scale degrees, drawing sheet music as you tap, exporting a
  score layer, a cue, a lock phrase or a .mid. Any clip of his opens in it.
- **The "artifacted list"**: the same page as his private Artifact, keeping labels
  and motifs in its database so they follow him across devices and a Claude
  session can read them to put a motif into a room.
- **Sheet music**: drawn in the page for motifs; for whole pieces, the `.mid` files
  open in MuseScore with the right key signature.

What a cloud session could not do, and what needs him:

- **Run the importer.** His Desktop is not in reach of a cloud session. Run it once
  on the Mac, then load `library/library.json` into the private page.
- **Check one real project.** The Ableton reader is tested against hand-made sets
  that follow the format, not against a set saved by Live. Compare one piece with
  Live; the field names are listed at the top of `src/music/ableton.js`.
- **Audio-only pieces** have no notes until transcribed (`--transcribe`, Spotify's
  basic-pitch, a sketch at best on a full mix) or until their project is found.
- **Judge the key guesses by ear**, and correct them in the library; the correction
  is what every motif from that piece uses.

## 2026-10-15: a daily board, a break from the castle

Timothy, in his words: *"a fun break from Composer's Key ... in the same PWA ...
a daily mode ... almost more like a fun little pinball game where you've got ...
an 8 by 14 grid that has little instrumentini on it, and certain instruments
respond to tapping and dragging, and your goal is to create the tune or replicate
the motif that's playing ... about 10 suitable motifs from my collection ... you
shoot the wave from one position ... and you have to rotate or click things in
order to create the melody ... still using the tile-based sprites ...
modifications to show what can be rotated and what can't ... 10 levels of
progressing difficulty that represent kind of 10 days of play ... for testing
purposes, we can play all 10 levels now."* CLAUDE.md already said this repo "may
also become a smaller standalone mobile music game"; this is the first thing in
it built for that rather than for Unity, and it lives in this repo because he
asked for it in the same app.

Done (`docs/DAILY.md` has all of it): `daily.html`, ten days, each a motif lifted
from his songbook database (six projects with no album, four from Out of Bed,
Reach Back Artifact, Please Wake Up and Far in The Park), every mode once or
more. The castle's own drums, strings, horns, flutes and timpani on an 8 x 14
board; arrows, dials and corner brackets show what turns, tunes and moves.
Days 1 to 6 each teach one thing; 7 to 9 combine them and were made by search
(`tools/daily-forge.mjs`), 10 is a loop the wave goes round twice. A solver
proves every day has its answer, and all but day 4 exactly one.

Guesses he should check:

- **Notes are judged by degree, not octave**, and **only the notes, not the
  rhythm**: the wave's timing is its path's. Matching his rhythm too is the
  obvious next difficulty, and much harder to author.
- **A wave along one string is one held note.** The castle plucks every tile;
  the board would have been unsolvable to the ear without the change. It lives
  only in `src/daily/board.js`.
- Days 7 to 9 are searched, not composed. They are fair; whether they are fun
  needs his thumbs.
- Six song titles from projects with no album are now public in this repo.

## Something that needs Timothy

**The GDD should come into this repo.** It currently lives at
`~/Desktop/Composer's Key/Composers Key Design Document.md` and is the canonical
design source, which means no unattended session can read the document it is
told to defer to. Dropping a copy in (`docs/` is the natural home) makes the
canon actually reachable.

## Worth knowing

**Open bug, found 2026-10-05, not fixed (he has not said):** with the pause menu's
**mute** on, note locks hear nothing, so no note-lock room can be solved muted.
`AudioEngine.play` returns on `muted` before it calls `onNote`. The fix is to call
`onNote` (for heard notes) before returning.

Placeholder assets are fine. **Timothy will be drawing more art over time.** Do
not hand-polish art here; invest in the pipeline that carries his art in and stands
in for it until it exists (see the 2026-10-01 section above).
