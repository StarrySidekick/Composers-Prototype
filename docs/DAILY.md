# The daily board

Asked for on 2026-10-15: *"a fun break from Composer's Key ... in the same PWA ...
a daily mode that utilizes the mobile screen ... like a fun little pinball game
... an 8 by 14 grid that has little instrumentini on it, and certain instruments
respond to tapping and dragging, and your goal is to create the tune or replicate
the motif that's playing ... take ... about 10 suitable motifs from my collection
... you shoot the wave from one position ... you have to rotate or click things in
order to create the melody ... still using the tile-based sprites ... with
modifications to show what can be rotated and what can't ... 10 levels of
progressing difficulty that represent kind of 10 days of play ... for testing
purposes, we can play all 10 levels now."*

`daily.html`, or **daily** on the title screen.

## How it plays

- A board is 8 x 14 tiles, upright, the shape of a phone. Coda stands at one
  tile, facing one way: the launcher.
- **Listen** plays the day's tune as Timothy wrote it (his rhythm, his tempo).
  The chips above the board are its notes, in solfege; on a tall screen the
  staff shows it too.
- Set the table, then **play**: one wave leaves the launcher and moves one tile a
  sixteenth, bouncing off drums, through strings and horns and flutes. Every
  pitched note it sets off lights the next chip, or crosses it out. Get every
  note, in order, and the day is solved; the card says which of his songs the
  tune came from.
- A wrong note, a wave that stops early, or one that goes round in circles ends
  the run, and its path stays on the table, faint, so the next try starts from
  what the last one showed.

What a finger may do is drawn on each piece:

| Mark | Touch | Pieces it is used on |
|---|---|---|
| arrow, top right | tap: turn it 90° | drums (the launcher on day 10) |
| dial, bottom right | tap: the piece's own B | flute holes cover, slides pull out, a timpani walks up the scale |
| corner brackets | drag it to an empty tile | drums |
| nothing | tap: hear its note | everything else |

Each instrument wears the note it would play, asked of the instrument itself
(`Board.labels`), so a label can never disagree with the sound. **?** turns the
names off.

### Two rules the castle does not need

- **A wave running along a string is one held note**, not a pluck per tile. Same
  wave, same pitch, the very next sixteenth: still sounding. Back along the same
  string after a drum is a new note.
- **Drums keep time; they are not the tune.** Percussion is heard and never
  judged, the way a note lock ignores it.

Notes are judged by degree: do is do in any octave, because a string's length
sets its octave along with its note (`StringSegment`, violin to bass).

Everything else is the castle's own mechanics, unchanged: drums are mirrors with
a head and a shell (`percussion.js`), a string sounds only along its length, a
horn's length is its note and it sounds at its bell, a flute lets the wave out
at the first open hole it meets (from either end), a timpani absorbs. A day is a
`Room`, so every doodad, sprite and placeholder works on it as it does in the
castle, and every pitch goes through `MusicalState.getNote`.

## The ten days

| Day | Title | Tune (from) | Key | New | Configurations, solutions, fewest touches |
|---|---|---|---|---|---|
| 1 | Three Strings | mi re do (*Stay Warm*, Out of Bed) | A ionian | tap a drum to turn it | 16, 1, 2 |
| 2 | Across the Grain | re sol do re (*Toaster Tension*) | F dorian | a string crossed is silent | 256, 1, 5 |
| 3 | Two Horns | la sol re ti (*Moonshot*, Reach Back Artifact) | C lydian | horns; tap a slide | 64, 1, 5 |
| 4 | The First Open Hole | la ti mi ti sol (*Midiphonia (Inverted)*) | G# phrygian | the flute, both ends | 64, 4, 5 |
| 5 | Pick It Up | sol mi do re sol (*AM I DEAD ?*, Please Wake Up) | G mixolydian | drag a drum | 1,344, 1, 3 |
| 6 | Both Ends | sol fa mi re sol re (*Far in The Park - Path 1*) | D dorian | flute from the foot, with turns and a drag | 40,960, 1, 6 |
| 7 | Down from the Ruins | mi fa sol la ti la sol (*Beneath Ruins*) | E phrygian | lures: the right note on the wrong road | 75,776, 1, 9 |
| 8 | Brass Section | re mi fa mi fa sol fa (*Raiders Theme*) | G mixolydian | horns bell to mouthpiece | 4,096, 1, 13 |
| 9 | Everything Feels Nice | sol fa do fa ti fa do mi (*Feel Nice*) | A aeolian | all of it; a timpani to tune | 2,121,728, 1, 14 |
| 10 | Twice Around | re do fa do re do fa do (*Along We Go*) | B locrian | the launcher turns; the wave goes round twice | 19,456, 1, 10 |

Every mode once or more, so every floor is a different tint (`MODE_FLOOR`).
Day 4 has four answers on purpose: two of its holes never matter, and finding
out which is the lesson.

### The tunes, and how they were picked

From the songbook's private database (`pieces` and `notes`, read with
ArtifactData on 2026-10-15; `labels` and `motifs` were still empty).
Twenty-three lead lines (mostly tracks called Lead, Melody, Motifs, Flute or
Solo, no drum rack) were read; covers and remixes of other people's music were
left out. Kept: openings that stay in the piece's own key with no note the
scale had to bend, three to eight notes long, between them every mode, from
several albums and the unfinished projects. Each is the songbook's motif shape
(`src/music/motif.js`) with its `source`, so the songbook can open it.

Six of the ten (*Toaster Tension*, *Midiphonia (Inverted)*, *Beneath Ruins*,
*Raiders Theme*, *Feel Nice*, *Along We Go*) come from projects with no album. Their titles are now in
this public repo, in `daily/days.json` and on the solved card.

## The calendar

Day 1 is `epoch` in `daily/days.json` (2026-10-15); each day opens one day
later. Every day is open now, marked "open early", because Timothy wants to test
all ten. `daily.html?strict` shows the calendar as a player would get it: later
days dashed and locked. `?day=N` opens a day.

What is remembered, per device (`ck-daily-v1` in localStorage): each day solved,
fewest tries and touches. Nothing else on the page touches storage.

## Files

| | |
|---|---|
| `daily.html`, `src/daily/daily.css` | the page |
| `src/daily/main.js` | the page's controller: day strip, tune, touch, play |
| `src/daily/board.js` | the board: what a touch does, the run, the judge. Pure, runs in node |
| `src/daily/view.js` | the castle's renderer plus handles, labels, the trail |
| `src/daily/solve.js` | every configuration of a day, played |
| `daily/days.json` | the ten days |
| `tools/daily-solve.mjs` | prints each day: its board, the run as it stands, the recorded solution, the solver's count. `--trail` draws the wave's path |
| `tools/daily-forge.mjs` | a new board for a motif (below) |

`window.DAILY` is the console handle: `DAILY.board`, `DAILY.openDay(i)`,
`DAILY.play()`.

## Making a day

A day in `daily/days.json`:

```json
{
  "id": "day-11", "title": "…", "hint": "one line, under the board",
  "music": { "root": 9, "mode": "ionian", "bpm": 104 },
  "motif": { "…": "a songbook motif: key, bpm, bars, family, octave, notes, source" },
  "launch": { "x": 1, "y": 13, "dir": "up", "can": "turn (optional)" },
  "layout": ["14 rows of 8 characters, the castle's legend"],
  "overrides": [{ "x": 1, "y": 0, "rot": 90, "can": "turn" }],
  "solution": [{ "tap": [1, 0], "times": 1 }, { "move": [[4, 12], [7, 9]] }]
}
```

`can` is `turn`, `tune`, `move`, or `move turn`. A drum's `step` (default 90)
turns it by 45 instead. `music` should be the motif's key. The recorded
`solution` is replayed by the test through the same calls a finger makes.

By hand: draw it, then `node tools/daily-solve.mjs N --trail` until the board
as it stands is wrong, the solution is right, and the count of solutions is
what you want. Strings must not touch another string (orthogonally adjacent
strings are one string, `measureLength`), and every horn needs a mouthpiece
and a bell (`hornProblems`).

By search: copy a motif from the songbook (**Copy motif**), save it to a file,
and

```bash
node tools/daily-forge.mjs motif=my-motif.json seed=1 turns=4 tunes=2 moves=1
```

It lays a path of strings and straight horns that plays the motif, adds lures
and decoys, scrambles the handles, and keeps the board only if the solver finds
exactly one answer. Try seeds; keep the one you like; give it an id, a title
and a hint. Days 7, 8 and 9 came from an earlier draft of it (the same seeds do
not make them again). It knows nothing of flutes or loops: days 4, 6 and 10 are
by hand, and so are 1, 2, 3 and 5.

## Checks

- `node test/daily.mjs` (node only): every day is 8 x 14, uses the legend, has a
  launcher on empty floor and horns that obey the horn rule; every handle does
  something; untouched it is not the tune; its recorded solution, touch by
  touch, is; every note on the way is in the day's scale; drums are never
  judged; the solver finds an answer on every day small enough to play in a
  test (all but day 9); and the two new rules. Proved by injection: let a string
  pluck on every tile and it fails 18 checks ("heard mi mi").
- `node test/daily-touch.mjs` (serve on :8080): a 390 x 844 phone with real
  touch events. The first visit opens how to play (then never again on that
  device); nothing covers the buttons or the strip; a tap turns a drum and
  pulls a slide; a fixed string plays its note unheard and costs no touch; a
  finger drags a drum onto the tile under the piece; day 1 solved by touch
  shows the card naming *Stay Warm* and is remembered; listen plays the tune
  unheard; the title screen links here. Proved by injection: drop the drag's
  lift above the finger and it fails at the drag.

## What it does not know yet

- Whether it is fun. The solver says each board is fair, not that it is good;
  days 7 to 9 are searched, not composed, and read like it. Play them.
- The wave's rhythm is the path's, not the tune's: the notes must be right, the
  timing is whatever the distances make it. A star for matching his rhythm too
  would be a natural next step, and would make the levels much harder to write.
- No share text, streaks or a real daily rollover past day 10.
- Not ported: a daily mode is not part of the Unity game. If it earns a place,
  `src/daily/board.js` is the part that would port; the rest is the page.
