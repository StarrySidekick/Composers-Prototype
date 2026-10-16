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

Redesigned on 2026-10-16, after he played it: strings are crossed, not travelled;
pegs wind and slide; little one-note instruments; tap Coda to play; the tune as
sheet music; the days behind a gear. His words are in `INTENT.md`.

`daily.html`, or **daily** on the title screen.

## How it plays

- A board is 8 x 14 tiles, upright, the shape of a phone, as big as the screen
  allows. Coda stands on one tile, facing one way.
- The day's tune is at the top as **sheet music**. Tap it to hear it, in his
  rhythm and tempo; a playhead follows the notes.
- Set the table, then **tap Coda**: one wave leaves him and moves one tile a
  sixteenth, bouncing off drums, across strings, through horns, flutes and the
  little instruments. Each pitched note it sets off lights its note on the
  staff, or greys it out when it is wrong. Every note, in order, solves the day;
  the card says which of his songs the tune came from. Tap Coda while the wave
  runs to stop it.
- A wrong note, a wave that stops early, or one that goes round in circles ends
  the run, and its path stays on the table, faint, so the next try starts from
  what the last one showed.
- The **gear** (top left) holds the ten days, the note names switch and how to
  play. The arrow (top right) resets the table.

### The pieces

The board's own, in `src/daily/pieces.js`. Daily-only: the castle and the Unity
port are untouched.

- **String** (`=` across, `H` up and down): held between two pegs. A wave that
  **crosses** it plucks it and carries on; one running along it slides by
  silently, and no day asks for that. Its note is `7 - length + wraps`, as a
  scale degree, wrapping round the scale: a longer string is lower, and each wrap
  on either peg raises it one step. Its octave comes from its length alone: two
  tiles is a violin, three or four a viola, five or more a cello. A string
  missing a peg is slack and sounds nothing. Two strings side by side are two
  strings.
- **Peg** (`o`): holds one end. Tap one with an arrow to wind it, 0 to 3 wraps,
  then it lets go back to 0; the windings are drawn on it. A peg **on a block**
  (corner brackets) slides along its string's line, never off it and never past
  its partner, and the string is laid again between them: drag it out and the
  string plays lower. A wave that hits a peg stops.
- **Little instruments** (`v` violin, `y` trumpet, `f` flute): one tile, one
  note, any side. A wave through one plays it and goes on. The big instruments
  (horns with slides, flutes with holes, strings you tune) can play several
  notes; these play one. In a box they can be dragged onto the wave's road.
- **Drums** (the castle's bass, tom and snare): mirrors with a head and a shell
  (`percussion.js`). Heard, never judged.
- **Horns, flutes, timpani**: the castle's own, unchanged. A horn's length is its
  note and it sounds at its bell; a flute lets the wave out at the first open
  hole it meets, from either end; a timpani absorbs, so it can only be last.

What a finger may do is drawn on each piece:

| Mark | Touch | Pieces it is used on |
|---|---|---|
| arrow, top right | tap: turn it 90°, or wind a peg | drums, pegs, Coda on day 10 (drag from him to aim) |
| dial, bottom right | tap: the piece's own B | flute holes cover, slides pull out, a timpani walks up the scale |
| corner brackets | drag it | peg blocks along their string; drums and little instruments to an empty tile |
| nothing | tap: hear its note | everything else |

Each string wears its note name beside it, asked of the string itself
(`Board.labels`), so a label can never disagree with the sound. The gear's
**note names** switch turns them off.

### Rules the castle does not have

- **Drums keep time; they are not the tune.** Percussion is heard and never
  judged, the way a note lock ignores it.
- Notes are judged by degree: do is do in any octave, because a string's length
  sets its octave along with its note.

Everything else is the castle's: a day is a `Room`, so every doodad, sprite and
placeholder works on it as in the castle, and every pitch goes through
`MusicalState.getNote`.

## The ten days

| Day | Title | Tune (from) | Key | New | Configurations, solutions, fewest touches |
|---|---|---|---|---|---|
| 1 | Three Strings | mi re do (*Stay Warm*, Out of Bed) | A ionian | cross a string; wind a peg | 64, 1, 3 |
| 2 | Little Instruments | re sol do re (*Toaster Tension*) | F dorian | drag one-note instruments onto the road | 8.6 billion, not counted |
| 3 | Which Way | la sol re ti (*Moonshot*, Reach Back Artifact) | C lydian | turn drums to choose a road | 256, 1, 7 |
| 4 | Stretch | la ti mi ti sol (*Midiphonia (Inverted)*) | G# phrygian | slide a peg block: longer is lower | 864, 1, 5 |
| 5 | Horns | sol mi do re sol (*AM I DEAD ?*, Please Wake Up) | G mixolydian | horns and their slides | 1,024, 1, 10 |
| 6 | Both Ends | sol fa mi re sol re (*Far in The Park - Path 1*) | D dorian | a flute from both ends, a drum to drag | 39,424, 1, 9 |
| 7 | The Harp | mi fa sol la ti la sol (*Beneath Ruins*) | E phrygian | up one side, down the other; a string crossed twice | 9,216, 1, 8 |
| 8 | Brass Section | re mi fa mi fa sol fa (*Raiders Theme*) | G mixolydian | four horns and a box of trumpets | 269 billion, not counted |
| 9 | The Pedal | sol fa do fa ti fa do mi (*Feel Nice*) | A aeolian | one long string crossed three times; a timpani last | 110,432, 1, 6 |
| 10 | Twice Around | re do fa do re do fa do (*Along We Go*) | B locrian | aim Coda; the wave goes round twice | 88,064, 1, 7 |

Every mode once or more, so every floor is a different tint (`MODE_FLOOR`). Days
2 and 8 drag instruments from a box to any free tile, a hundred choices each, so
the solver cannot count them; their recorded solutions are checked, and their
road never changes, so a wrong placement only ever plays a wrong note.

Days 3, 6, 9 and 10 have lures: pieces sitting where a wrong setting sends the
wave, most of them with a note the tune needs. Each was kept only if the day
still had exactly one answer. Days 1, 2, 4 and 7 have one road (no setting turns
the wave), so a piece off it would never be hit; they are sparse on purpose.

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
*Raiders Theme*, *Feel Nice*, *Along We Go*) come from projects with no album.
Their titles are in this public repo, in `daily/days.json` and on the solved
card.

## The calendar

Day 1 is `epoch` in `daily/days.json` (2026-10-15); each day opens one day
later. Every day is open now, marked "open early", because Timothy wants to test
all ten. `daily.html?strict` shows the calendar as a player would get it: later
days dashed and locked. `?day=N` opens a day.

What is remembered, per device (`ck-daily-v1` in localStorage): each day solved,
fewest tries and touches, and that how to play has been seen. Nothing else on
the page touches storage.

## Files

| | |
|---|---|
| `daily.html`, `src/daily/daily.css` | the page |
| `src/daily/main.js` | the page's controller: the days, the tune, touch, play |
| `src/daily/board.js` | the board: what a touch does, the run, the judge. Pure, runs in node |
| `src/daily/pieces.js` | the board's own pieces: string, peg, little instruments. Runs in node |
| `src/daily/view.js` | the castle's renderer plus handles, peg blocks, labels, the trail |
| `src/daily/solve.js` | every configuration of a day, played |
| `daily/days.json` | the ten days |
| `tools/daily-solve.mjs` | prints each day: its board, the run as it stands, the recorded solution, the solver's count. `--trail` draws the wave's path |
| `tools/daily-forge.mjs` | a new board for a motif (below) |

The little instruments' placeholders are `solo.violin`, `solo.trumpet` and
`solo.flute` in `src/art/placeholders.js`; a peg reuses the castle's `peg` art,
turned to point at its string.

`window.DAILY` is the console handle: `DAILY.board`, `DAILY.openDay(i)`,
`DAILY.play()`.

## Making a day

A day in `daily/days.json`:

```json
{
  "id": "day-11", "title": "…", "hint": "one line, shown when the day opens",
  "music": { "root": 9, "mode": "ionian", "bpm": 104 },
  "motif": { "…": "a songbook motif: key, bpm, bars, family, octave, notes, source" },
  "launch": { "x": 1, "y": 13, "dir": "up", "can": "turn (optional: aim by dragging)" },
  "layout": ["14 rows of 8 characters: the castle's legend plus = H o v y f"],
  "overrides": [{ "x": 7, "y": 10, "wraps": 1, "can": "turn" }, { "x": 5, "y": 11, "degree": 4, "can": "move" }],
  "solution": [{ "move": [[5, 11], [3, 11]] }, { "tap": [7, 10], "times": 2 }, { "aim": "up" }]
}
```

`can` is `turn`, `tune`, `move`, or two of them. A peg's override carries its
`wraps`; a little instrument's carries its `degree`. A drum's `step` (default
90) turns it by 45 instead. `music` should be the motif's key. The recorded
`solution` is replayed by the test through the same calls a finger makes; moves
come first, so a tap names the tile a piece ends up on.

By hand: draw it, then `node tools/daily-solve.mjs N --trail` until the board
as it stands is wrong, the solution is right, and the count of solutions is
what you want. Every string needs a peg at each end, and every horn a
mouthpiece and a bell (`hornProblems`).

By search: copy a motif from the songbook (**Copy motif**), save it to a file,
and

```bash
node tools/daily-forge.mjs motif=my-motif.json seed=1 turns=2 winds=2 slides=1
```

It lays a path that plays the motif (strings across it, little instruments on
it, straight horns, drums to turn it), adds lures and decoys, scrambles the
handles, and keeps the board only if the solver finds exactly one answer. Try
seeds; keep the one you like; give it an id, a title and a hint. `trays=1` puts
a little instrument in a box, which makes the board too big to count (add
`unique=0`). It knows nothing of flutes with holes or loops. The ten days were
drawn by hand and checked with the solver; the forge came after.

## Checks

- `node test/daily.mjs` (node only): every day is 8 x 14, uses the legend, has
  Coda on empty floor and horns that obey the horn rule; every handle does
  something; untouched it is not the tune; its recorded solution, touch by
  touch, is; every note on the way is in the day's scale; drums are never
  judged; the solver finds an answer on every day small enough to play in a
  test. And the pieces on a small table of their own: a crossed string plays and
  a violin its note; a wrap raises a string a step; a slid peg lays a longer
  string that plays lower, and will not leave its line or pass its partner; two
  strings side by side are two notes; a little instrument plays from the side
  and lets the wave through; a drum is never judged.
- `node test/daily-touch.mjs` (serve on :8080): a 390 x 844 phone with real
  touch events. The first visit opens how to play (then never again on that
  device); nothing covers the gear, the reset, the music or Coda; there is no
  play or listen button; a tap winds a peg and turns a drum; a fixed string
  plays its note unheard and costs no touch; tapping Coda plays, and day 1
  solved by touch lights the staff, shows the card naming *Stay Warm* and is
  remembered; tapping the music plays the tune unheard; the gear opens the days;
  a finger slides a peg block along its string; a finger dragged from Coda aims
  him; the title screen links here. Proved by injection: make a tap on Coda do
  nothing and drop the drag's lift above the finger, and it fails 8 checks by
  name.

## What it does not know yet

- Whether it is fun. The solver says each board is fair, not that it is good.
  Play them.
- The wave's rhythm is the path's, not the tune's: the notes must be right, the
  timing is whatever the distances make it. A star for matching his rhythm too
  would be a natural next step, and would make the levels much harder to write.
- The pitch rule for strings (`7 - length + wraps`, octave by length) is a guess
  at what he described; see `INTENT.md`.
- No share text, streaks or a real daily rollover past day 10.
- Not ported: a daily mode is not part of the Unity game. If it earns a place,
  `src/daily/board.js` and `pieces.js` are the parts that would port; the rest is
  the page.
