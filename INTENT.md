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

**A first piece of "faster to write" exists now, 2026-09-08:**
`node tools/new-room.mjs <id> [wing]` scaffolds a room — the bordered box, the
`rooms/<id>.json` file, and the `manifest.json` line, in one step. That last
part is the one worth naming: `test/rooms.mjs` now also checks that `rooms/`
and `manifest.json` agree on the same file list, because a room saved and
never added to the manifest was invisible to both the harness and the report,
silently, and that is exactly the kind of bug this project keeps finding by
hand. This is authoring-speed for the box a room starts in, not for what goes
in it — placing pieces is still the editor's job and still the slow part.

**Still missing from the loop:** a faster way to *fill* a room once it's
scaffolded, and any way to judge whether one is fun without a person playing
it. The report can say a room is thin; it cannot say a room is boring.

## Something that needs Timothy

**The GDD should come into this repo.** It currently lives at
`~/Desktop/Composer's Key/Composers Key Design Document.md` and is the canonical
design source, which means no unattended session can read the document it is
told to defer to. Dropping a copy in (`docs/` is the natural home) makes the
canon actually reachable.

## Worth knowing

Placeholder assets are fine. **Timothy will be drawing more art over time**, so
do not invest effort in art here; invest it in the harness.
