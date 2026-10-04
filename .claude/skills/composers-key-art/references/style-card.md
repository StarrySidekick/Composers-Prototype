# Timothy's hand: the style card

Measured 2026-10-02 from the 12 Unity tiles in `assets/sprites` (Coda, the 2x
piano key and the duplicate lit fork left out), with `tools/art-style.mjs`.
Re-measure when he adds art and update the numbers here.

## The numbers

| measure | his median | what it means |
|---|---|---|
| ink coverage | 17% of the tile | roughly a sixth of the tile is line |
| stroke 3 px | 43% of ink | **his main line is 3 px** |
| stroke 4 px+ | 30% | joins, curls packed tight, filled details |
| stroke 2 px | 21% | lighter ornament |
| stroke 1 px | 6% | almost never |
| separate marks | 2 | **a drawing is one or two connected gestures** |

Exact geometry worth knowing: tube walls are 3 px on rows 20-22 and 28-30 at the
edges; the string is 3 px on rows 24-26.

## Rules that follow

1. **Structure at 3 px, ornament at 2.** Nothing at 1 px unless it must be tiny.
2. **Attach ornament to the form.** His vines, curls and flowers grow out of the
   main line: the tube's vine leaves the tube wall, the fork's curls hang off its
   foot, the drum's legs hold the shell. A curl floating in space is the most
   un-Timothy thing a placeholder can do. Start every curl on a line.
3. **Curls are open spirals, not dots.** At 2 px a spiral smaller than about r=4
   fills in to a blob. Make curls bigger, or fewer, never tiny.
4. **Fill about a sixth of the tile.** Placeholders that cover 10% read thin and
   diagrammatic beside his.
5. **Organic, not geometric.** His lines wobble and taper; his ellipses are not
   true ellipses; the pen's wobble exists for this. Keep it on main strokes.
6. **Hard pixels.** Two-value alpha, no antialiasing (`crisp()` does this).
7. **Readable at a glance, then decorated.** Silhouette first (the drum, the fork,
   the bell), flourish second, and the flourish never hides the silhouette.

## How he draws (studied at 6x, 2026-10-02, plus his site and itch.io page)

Rules from looking, not measuring. Sources: the 15 Unity sprites at 6x; the hand-
drawn buttons on timothyvlangas.com (Games, Music, Mail); the Composer's Key logo
and in-game screenshot on starry-sidekick.itch.io/composers-key.

8. **Two registers.** *Living* things (the brass wing) are branches: tube walls
   with grain running inside, twigs that fork into two buds, clover flowers (four
   small rings) hanging off a twig, and at a bend the branch loops into a coil with
   a leaf in it. *Made* things (fork, mallet, key, door, drum, block) are crafted:
   bilaterally symmetric, straight lines, double strokes for shafts (mallet handle,
   fork stem), small parts SOLID (mallet head, door rails, bell rim), and paired
   scrolls.
9. **Curl trees.** His site's buttons are stems that branch, every branch ending
   in an open spiral. A spiral is always the end of a stalk (`pen.stalk`,
   `pen.curlAt`), never a free-standing glyph.
10. **Nothing just stops.** Stalk -> spiral, twig -> two buds, leg -> bud foot,
    frame corner -> scroll. A plain line end is the exception.
11. **The drum is a tilted oval head on a triangular truss** with short legs; the
    door is a ladder (two solid rails, rungs, a knob); the fork has long tapering
    tines, a V, a double stem and a scroll each side; the peg is a stem into a ring
    with a spiral inside; the wave is flat-in, sharp peaks, flat-out.
12. **Frames are hand-drawn and a little irregular** (the site's button borders),
    with a scroll finishing a corner (the Mail envelope).

## Pixel mechanics learned the hard way

- **A wound-up small spiral fills in.** Under r 4.5 draw a hook (under one turn);
  under 6.5 about 1.3 turns; only bigger ones get his 1.75. `pen.spiral` does this.
- **Odd-width lines must centre on a pixel's middle** (y = 3.5 for 3 px) or the
  hard-pixel threshold turns 3 px into 4. `pen.line` snaps straight strokes; place
  curves with the same parity in mind.
- **Size before style.** Truss struts and feet drawn small enough to "fit" smear
  into a blob; fewer, bigger triangles read.

After this pass (all placeholders redrawn by these rules): coverage 17% (his 17),
3 px strokes 61% (his 43), 4 px+ 19% (his 30), marks 1-2 (his 2).

## Play size (2026-10-04)

Timothy, on his phone: "the slide and some other sprites don't read well as they
are so small". The stage is ~390 px for a 13-tile room, so **a 51 px tile is shown
at about 30 px** (0.59x, nearest neighbour; the renderer caps dpr at 2). Measured:

- 3 px lines survive as ~2 px; **2 px lines become 1 px or vanish**; 1.5 px
  spirals (pen default) are gone. A gap under 3 px closes.
- So the part that carries the meaning is as big as the tile allows, at 3 px or
  solid; details no thinner than 2 px; small curls are dropped rather than shrunk.
  This beats his 2 px median where they conflict (placeholders now 7% 2 px against
  his 21%), and lets a bold instrument sit at 22-29% ink, as his own elbow (23),
  flare (27) and bass drum (29) do.
- A long thin cone or triangle reads as an arrow or a play button at this size.
- Look at every new tile scaled to 30 px nearest neighbour, not only at 3x.
- Bigger-than-a-tile art (the boss, `SPAN` in protocol.js) is drawn at the same
  pixel density on a 153 px canvas; it uses 5 px main lines so it reads as heavier
  than the tiles around it.

## Known gaps in the placeholders (2026-10-02)

- Twigs repeat at the same place on every tile of a run, so a long tube reads as
  wallpaper. His real tubes do too (one sprite), but variation by position would
  need the renderer to pass a seed; not done.
- Clover flowers at 51 px are close to the limit; some read as a smudge.
- Walls are deliberately quieter than his old wall art (that was a pushable block);
  that is Timothy's call, not a style gap.
