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
sheet music; the days behind a gear. Then again the same day: Coda always under
the bottom-left tile; a wrong note plays on and the run is judged when it ends;
touches while the wave flies; the tempo shown; no lines on the floor; strings
loud enough to hear; ten longer, well-known public-domain tunes. And on
2026-10-17: 8 x 8 boards, edge to edge, with solid blocks where no instrument
is and red herrings only now and then; three kinds of puzzle (melodic,
rhythmic, advanced), each with its own sheet music; notes green when right and
red when wrong; the cell grid back, with nothing inside a cell. His words are
in `INTENT.md`.

`daily.html`, or **daily** on the title screen.

## How it plays

- A board is 8 x 8 tiles, as wide as the screen, edge to edge. Every tile is
  an instrument, a piece the wave needs (a drum, a peg), the road itself, or a
  **solid block** (`Z`, Unity's block art): nothing is there for show, and a
  red herring is rare. Coda always stands just below the bottom-left tile;
  tapping him sends the wave up into it, on the next beat.
- Each day is one of three **kinds of puzzle** (`type`), and its sheet music
  says which:

  | Kind | Judged on | The music at the top |
  |---|---|---|
  | melodic | which notes, in order | noteheads only: no lengths, no stems, no bars |
  | rhythmic | when they come, in sixteenths after the first | one line, every note on it: rhythm, no pitch |
  | advanced | both | the whole score |

  The ten days now are all melodic. Tap the music to hear the tune, in its own
  rhythm at the day's tempo; a playhead follows the notes.
- Set the table, then **tap Coda**: one wave leaves him and moves one tile a
  sixteenth, bouncing off drums, across strings, through horns, flutes and the
  little instruments. It plays everything it meets, **right or wrong**, and goes
  on until it ends by itself: off the board, into a peg or a timpani, or round a
  loop it could only repeat (then it is stopped). Each note turns the staff's
  note **green** where it is right and **red** where it is not (the only
  colour on the page, Timothy's ask).
- Then it is judged: the notes it played must be the tune, all of it, in order,
  and **nothing more**. A board must let the wave go quiet after the last note.
  The card says where the tune came from. Tap Coda while the wave runs to stop
  it sooner.
- **The board can be touched while the wave flies.** Turn a drum after the wave
  has passed it and it goes a new way when it comes back; day 10 needs exactly
  that. The wave's path stays on the table, faint, so the next try starts from
  what the last one showed.
- The **gear** (top left) holds the ten days, the note names switch, developer
  mode and how to play. Top right: the **tempo** (day 1 at 100 bpm, five more a
  day) and the reset arrow. In developer mode (`ck-dev-v1`, shared with the
  castle, or `?dev`) the tempo gets ten slower and ten faster; that holds until
  another day opens.

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
  strings. It is always the synth's plucked voice (`sampled: false`): the
  recorded cello is bowed and swells in a third of a second late, and the
  higher strings were out of its reach anyway.
- **Peg** (`o`): holds one end. Tap one with an arrow to wind it, 0 to 3 wraps,
  then it lets go back to 0; the windings are drawn on it. A peg **on a block**
  (corner brackets) slides along its string's line under the finger, a tile at
  a time, never off it and never past its partner, and the string is laid again
  at every tile, so it stays fastened: drag it out and the string plays lower.
  A wave that hits a peg stops.
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
| arrow, top right | tap: turn it 90°, or wind a peg | drums, pegs |
| dial, bottom right | tap: the piece's own B | flute holes cover, slides pull out, a timpani walks up the scale |
| corner brackets | drag it | peg blocks along their string; drums and little instruments to an empty tile |

All of it works while the wave is in flight too.
| nothing | tap: hear its note | everything else |

Each string wears its note name beside it, asked of the string itself
(`Board.labels`), so a label can never disagree with the sound. The gear's
**note names** switch turns them off.

### Rules the castle does not have

- **Drums keep time; they are not the tune.** Percussion is heard and never
  judged, the way a note lock ignores it.
- Notes are judged by the day's kind (`Board.isRight`). By pitch, by degree:
  do is do in any octave, because a string's length sets its octave along with
  its note. By time, against the run's own first note: the wave's step count
  between notes must equal the tune's gaps in sixteenths, so a rhythmic board
  is made by spacing its instruments. A wrong time is told as "came 2
  sixteenths early".
- **A run is judged when it ends, on everything it played** (`Board.judge`):
  `wrong` names the first note out of place, `short` the note that never came,
  `long` the notes after the tune's last. The solver's runs are `quick`: they
  stop at the first wrong note, since it only needs a yes or no.
- **A block stops the wave, without a sound**, like the board's edge: most
  boards end the run that way, on the tile after the last note.
- **A loop is stopped** the moment every wave stands where it stood before,
  going the same way, with no touch since: nothing on the board changes by
  itself, so it could only repeat. A touch clears that memory, since it may
  open a way out. A wave an instrument is holding till the beat is not counted.

Everything else is the castle's: a day is a `Room`, so every doodad, sprite and
placeholder works on it as in the castle, and every pitch goes through
`MusicalState.getNote`.

## The ten days

All melodic, on 8 x 8.

| Day | Title | Tune | Key | bpm | New | Configurations, solutions, fewest touches |
|---|---|---|---|---|---|---|
| 1 | Mary Had a Little Lamb | mi re do re mi mi mi | C ionian | 100 | cross strings; wind a peg | 16, 1, 3 |
| 2 | Frère Jacques | do re mi do do re mi do | F ionian | 105 | drag little instruments onto the road | 133, 4, 2 |
| 3 | Symphony No. 5 | sol sol sol mi fa fa fa re | C aeolian | 110 | turn drums to choose the road | 64, 1, 4 |
| 4 | Row, Row, Row Your Boat | do do do re mi mi re mi fa sol | D ionian | 115 | slide a peg block: longer is lower | 48, 1, 4 |
| 5 | Jingle Bells | mi mi mi mi mi mi mi sol do re mi | G ionian | 120 | horns and their slides | 256, 1, 7 |
| 6 | Happy Birthday | sol sol la sol do ti sol sol la sol re do | F ionian | 125 | all of it on one board; it starts below do | 512, 1, 10 |
| 7 | London Bridge | sol la sol fa mi fa sol re mi fa mi fa sol | B♭ ionian | 130 | an instrument and a peg block out of place | 3,520, 1, 8 |
| 8 | Twinkle, Twinkle | do do sol sol la la sol fa fa mi mi re re do | A ionian | 135 | fourteen notes on 64 tiles | 4,096, 1, 10 |
| 9 | God Rest Ye Merry | E E B B A G F♯ E D E F♯ G A B | E aeolian | 140 | ends on a timpani to tune | 14,336, 1, 14 |
| 10 | Ode to Joy | mi mi fa sol sol fa mi re do do re mi mi re re | D ionian | 145 | a drum turned in flight | 1,280, none before the wave goes, 8 with the turn |

Fifteen notes fit in 64 tiles because the road crosses the same string more
than once and the little instruments take one tile each. Day 2's four answers
differ only in which tile along one stretch of road an instrument lands on.
Day 10 has no answer before the wave goes: the wave passes the drum at (6,3) on
step 11 and comes back on step 41, and the drum must be turned twice in
between (about three seconds at 145 bpm). The test proves both: no setting
plays it before, and the turn in flight does.

### The tunes, for now

Timothy, 2026-10-16: *"the motifs should be longer and maybe for now mirror
famous public domain songs."* Ten melodies everyone knows, seven to fifteen
notes, every one in the public domain (traditional, or written before 1900;
*Happy Birthday*'s melody is from 1893, *Good Morning to All*, and its US claim
was struck down in 2016). Each is a motif in the songbook's shape
(`src/music/motif.js`) with `source.title`, `composer` and `year`; the card
names them. Picked so that no note falls outside the key: every pitch on the
board goes through the scale, so a tune that needs a sharp the mode does not
have (Für Elise, Greensleeves) cannot be played on it. The tunes from his own
songbook (2026-10-15) are in git history and come back when he wants them.

### How the boards were made

By `tools/daily-forge.mjs` (below), three seeds a day at `fill=0.55` (the
road and its instruments cover at least 55% of the board) with one lure at
most, then picked from the rendered boards: an instrument the wave never meets
counted against a board, touches rising day by day. Day 10 was forged again
with `window=20` for a fair time to make its turn. They are searched, not
composed. The solver says each is fair, not that it is good.

## The calendar

Day 1 is `epoch` in `daily/days.json` (2026-10-15); each day opens one day
later. Every day is open now, marked "open early", because Timothy wants to test
all ten. `daily.html?strict` shows the calendar as a player would get it: later
days dashed and locked. `?day=N` opens a day.

What is remembered, per device (`ck-daily-v2` in localStorage; v1 was the
8 x 14 boards): each day solved, by its `id`, fewest tries and touches, and that
how to play has been seen.
Developer mode is the castle's own `ck-dev-v1`. Nothing else on the page
touches storage. The ids changed with the tunes (`mary`, `ode-to-joy`), so a
day solved on the old boards does not show as solved on the new one.

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
`DAILY.play()`, `DAILY.days`.

## Making a day

A day in `daily/days.json`:

```json
{
  "id": "a-tune", "title": "…", "hint": "one line, shown when the day opens", "type": "melodic",
  "music": { "root": 9, "mode": "ionian", "bpm": 150 },
  "motif": { "…": "a songbook motif: key, bpm, bars, family, octave, notes, source" },
  "layout": ["8 rows of 8 characters: the castle's legend plus = H o v y f Z"],
  "overrides": [{ "x": 7, "y": 10, "wraps": 1, "can": "turn" }, { "x": 5, "y": 11, "degree": 4, "can": "move" }],
  "solution": [{ "move": [[5, 11], [3, 11]] }, { "tap": [7, 10], "times": 2 }, { "tap": [3, 1], "times": 2, "at": 28 }]
}
```

No launcher: Coda is always under the bottom-left tile, so the wave's first
tile is (0,7), going up. `type` is `melodic`, `rhythmic` or `advanced`. `can` is `turn`, `tune`, `move`, or two of them. A
peg's override carries its `wraps`; a little instrument's carries its `degree`.
A drum's `step` (default 90) turns it by 45 instead. `music` should be the
motif's key, and its `bpm` 100 plus 5 per day (`bpmOfDay`). The motif's
`octave` is the game's: 5 puts do at middle C. The recorded `solution` is
replayed by the test through the same calls a finger makes; moves come first,
so a tap names the tile a piece ends up on. A touch with `at` is made in
flight, once the wave has taken that many steps.

By hand: draw it, then `node tools/daily-solve.mjs N --trail` until the board
as it stands is wrong, the solution is right, and the count of solutions is
what you want. Every string needs a peg at each end, and every horn a
mouthpiece and a bell (`hornProblems`). No string can cross column 0 (its left
peg would be off the board), so the wave's first note is a little instrument
or a horn on that column, or a drum turns it first.

By search: copy a motif from the songbook (**Copy motif**), save it to a file,
and

```bash
node tools/daily-forge.mjs motif=my-motif.json seed=1 bpm=150 turns=2 winds=2 slides=1
node tools/daily-forge.mjs motif=my-motif.json seed=1 timed=1 verbose=1
```

It searches for a road from Coda that plays the motif, depth first with a
budget, backing up a note when the next one fits nowhere: strings across the
road, little instruments on it, straight horns, a piece already on the board
crossed again for a repeated note, drums to turn it, and a block (or the edge)
on the tile after the last note. Then a lure, the handles scrambled (`turns`,
`winds`, `slides`, `tunes`, `trays`), every tile left over made a block, and it
keeps the board only if the solver finds exactly one answer (`unique=0` to keep
more). `fill=` is the least share of the board the road and its instruments
must use. `timed=1` makes the road come back through one drum that must face a
new way the second time, and keeps the board only if NO answer exists before
the wave goes; `window=` is the least number of steps between the two visits.
`verbose=1` prints why attempts were thrown away. It makes melodic boards; a
rhythmic one needs its instruments spaced to the rhythm, which it does not do
yet. Try seeds; keep the one you like; give
it an id, a title and a hint. It knows nothing of flutes with holes.

## Checks

- `node test/daily.mjs` (node only): every day is 8 x 8, uses the legend, is a
  kind of puzzle, has no launcher of its own, runs at its tempo, has horns that
  obey the horn rule and a tune of seven notes or more; every handle does
  something; untouched it is not the tune; its recorded solution, touch by
  touch, in flight too, is, and the wave then ends by itself; every note on the
  way is in the day's scale; drums are never judged; the solver finds an answer
  on every day, and none before the wave goes on the day that needs a touch in
  flight. And the pieces and rules on small tables: Coda's wave goes up into
  the bottom-left tile; a crossed string plays and a violin its note; a wrap
  raises a string a step; a slid peg lays a longer string and will not leave
  its line; two strings side by side are two notes; a little instrument plays
  from the side and lets the wave through; a block stops the wave without a
  sound; a wrong note plays on; a note after the tune fails it; a quick run
  stops at its first wrong note; melodic ignores time, rhythmic ignores pitch
  and says how early, advanced wants both; a drum turned in flight sends the
  wave a new way; a loop is stopped. And the staff: the score has stems, the
  melodic staff has the notes and no lengths, the rhythmic one every head on
  one line with no clef, right green and wrong red. Proved by injection: stop
  runs at the first wrong note and ignore touches in flight (8 checks fail);
  let the rhythm judge ignore time, draw stems on the melodic staff, or let a
  block pass the wave (each fails by name).
- `node test/daily-touch.mjs` (serve on :8080): a 390 x 844 phone with real
  touch events. How to play on the first visit only; nothing covers the gear,
  the tempo, the reset, the music or Coda under the bottom-left tile; the board
  runs edge to edge; the floor's pixels show the grid at a tile's edge and one
  colour inside it; day 1's staff has seven notes and no stems, a wrong run
  turns notes red and the answer turns all seven green; a tap winds a peg and
  turns a drum; a fixed string plays unheard and costs no touch; day 1 solved
  by touch names *Mary Had a Little Lamb*; tapping the music plays the tune
  unheard; the tempo reads 100 and 110, and developer mode adds ten faster and
  slower; a peg block under a finger has its string fastened to it before the
  finger lets go, and one slide is one touch; a finger turns day 10's drum in
  flight and solves it; a plucked string renders within 6 dB of a horn in
  every register; the title screen links here. Proved by injection: a line
  through the middle of every tile, a board rounded down off the screen's
  edges, the old quiet pluck, and taps refused while the wave runs each fail by
  name.

## What it does not know yet

- Whether it is fun. The solver says each board is fair, not that it is good.
  Play them.
- No rhythmic or advanced day yet. The board judges them and the staff draws
  them; the forge cannot yet space instruments to a rhythm, and whether drums
  count as notes in a rhythmic day is his call.
- The pitch rule for strings (`7 - length + wraps`, octave by length) is a guess
  at what he described; see `INTENT.md`.
- Whether "nothing after the last note" is too strict. It is what "replicate the
  tune" means; on 8 x 8 a block after the last note makes it easy to build.
- Whether a turn in flight is fair at 145 bpm. Day 10 gives about three
  seconds; developer mode can slow it.
- No share text, streaks or a real daily rollover past day 10.
- Not ported: a daily mode is not part of the Unity game. If it earns a place,
  `src/daily/board.js` and `pieces.js` are the parts that would port; the rest is
  the page.
