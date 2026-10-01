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

Still open on art: the rest of the Unity sprite folder has not been brought across,
because this repo cannot see it. Copying `Assets/Sprites` (or a listing of it) into the
repo is the next step for parity.

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
