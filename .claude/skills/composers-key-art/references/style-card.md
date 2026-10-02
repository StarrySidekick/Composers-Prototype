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

## Known gaps in the placeholders (2026-10-02)

- Small curls (wall corners, the tube's flowers) still close up into dots.
- Some ornament floats instead of growing from a line (the tee's tendrils, the
  mute's curl). `tools/art-style.mjs` lists the worst offenders by mark count.
- Walls are deliberately quieter than his old wall art (that was a pushable block);
  that is Timothy's call, not a style gap.
