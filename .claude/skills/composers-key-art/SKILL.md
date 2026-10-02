---
name: composers-key-art
description: Make or redraw Composer's Key tile art (sketch placeholders, proposal tiles, any 51x51 sprite) in Timothy's hand-drawn style — white line-work on black — and check it against his real art by measurement and by eye. Use whenever a doodad needs a placeholder, a placeholder looks wrong or "not like mine", Timothy leaves notes on the asset review page, or new pixel art / sprites / tiles are wanted for this game.
---

# Composer's Key art

You are standing in for Timothy's pen until he draws the real thing. The goal is
not good pixel art in general; it is art that could sit next to his without
looking like it came from somewhere else, on the exact grid his will drop into.

Method adapted from **Pixel Art Studio** by Gamezxz (github.com/Gamezxz/pixel-art-studio,
MIT): draw in code, look at the render, critique against a checklist, fix, repeat;
and study the artist's own files to turn a style into rules. Rewritten here for
this game's pipeline (JavaScript canvas, white line-work, 51 px tiles), which is
not that skill's (Python, coloured shaded sprites).

## Read first

- `docs/ART-PROTOCOL.md` — the grid: 51 x 51, white on transparent, two-value
  alpha, drawn unrotated, connectors at fixed pixels. Non-negotiable.
- `references/style-card.md` — Timothy's style as measured rules. Follow them.
- The review page notes, if there are any: they are his words about specific tiles.
  `ArtifactData` list, collection `notes`, url in `CLAUDE.md` (Asset review).
  Open notes are the brief; do them before anything else.

## The loop

1. **Brief.** Which keys, which states (`door` and `door.open` are two drawings),
   which connectors (`connectorEdges()` in `src/art/protocol.js`), what it must read
   as at 51 px from arm's length. If it has a direction (a drum head, a peg stem),
   decide which way it points at rot 0 and write it in a comment.
2. **Draw** in `src/art/placeholders.js`: one function per key, using the pen
   (`src/art/pen.js`): `line`, `poly`, `box`, `arc`, `circle`, `ellipse`, `curl`,
   `vine`, `path`. `STROKE.main` (3) for structure, `STROKE.fine` (2) for ornament.
   Never draw thinner than 2 unless it is a detail that must stay small.
3. **Look.** `node tools/art-sheet.mjs <out.png> [key-prefix]` and READ the PNG.
   Also look at it in a room (`/tmp` screenshot of the game in sketch mode) when it
   is a piece that joins others: tubes, walls, strings.
4. **Measure.** `node tools/art-style.mjs [key-prefix]`. Coverage, stroke weights
   and mark count against his medians. Numbers do not make art good, but a tile
   far off his numbers will look foreign next to his, every time.
5. **Critique** with `references/checklist.md`, line by line, in writing. End
   with SHIP or FIX and a list. FIX becomes the next edit.
6. **Repeat** from 2. At least two passes before showing anyone.
7. **Prove it still fits.** `node test/art.mjs` (connectors, 51 px, two-value
   alpha). Then rebuild and republish the review page
   (`node tools/asset-review.mjs out.html`, then Artifact publish to the same
   URL) so Timothy sees it where he comments.

## Studying new art from Timothy

When he adds real art (a new PNG in `assets/sprites/`), measure again with
`tools/art-style.mjs` and update `references/style-card.md` if the medians move.
Look at the new tile at 4x and add any rule you can state precisely (what a curl
is attached to, how a line ends, where the weight sits). Rules, not adjectives.

## Hard limits

- Placeholders are generated in code, at load. Never hand-save PNGs into
  `assets/` as placeholders; `assets/` is his real art.
- No colour. The game is black and white; state differences are ink (`STATE_INK`).
- Do not change his art. If his art looks wrong to the mechanics (the mouthpiece
  was drawn backwards), fix it in the manifest (`flipX`) and say so.
