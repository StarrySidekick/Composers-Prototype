# Art protocol

How to make a tile, hand-drawn or generated, so it drops into a slot and nothing
else has to change. Written 2026-10-01. The numbers live in code at
`src/art/protocol.js`; when this page and that file disagree, the file is what
the game obeys, so fix this page.

The point: **art should never block a mechanic.** A new mechanic gets a sketch
placeholder the same day it gets a class. The placeholder is the right size, the
right weight, joins its neighbours in the right place and has every state named.
When the real drawing exists it replaces the placeholder file-for-file and the
room does not notice.

## The look

The game is black and white for now: **white line-work on a black floor.** Colour
is not in the files. Unity tints each object with `SpriteRenderer.color`, and the
prototype does the same at load time (`ink` in the manifest, `STATE_INK` in
code), so a drawing stays pure white and any colour decision stays reversible.

The old colour theme (parchment floor, gold brass, per-wing palettes) is parked,
not deleted: `THEME` at the top of `src/render/palette.js`.

## The file

| | |
|---|---|
| Size | **51 × 51 px**, square. One tile. |
| Colour | Pure white `#ffffff` on fully transparent. |
| Alpha | Two values only: 0 or 255. No antialiasing. The Unity art is like this; the placeholders are thresholded to match (`crisp()` in `src/art/pen.js`). |
| Line weight | 2 px for structure (tube walls, borders), 1 px for ornament (curls, vines). |
| Orientation | Drawn **unrotated**. The game rotates it. One elbow drawing covers all four elbows. |
| Name | The sprite key with dots as underscores: `brass.elbow` → `brass_elbow.png`. |

If the drawing changes with state, each state is its own file:
`door.png` / `door_open.png`, `lock.png` / `lock_lit.png`. A state that is only a
different colour of the same picture (an unlit lock is a dimmer lock) does not
need a second file; `STATE_INK` handles it.

## Connectors: where a piece meets its neighbour

This is the rule that matters most and the one that is easiest to get wrong by
eye. **A piece that joins the next tile must cross the tile edge at the same
pixels every time**, or a run of tubes looks broken at every joint.

Measured from the Unity art:

| family | crosses the edge at | meaning |
|---|---|---|
| brass tube | rows **20 to 30** | wall lines at 20-21 and 29-30, bore between |
| string | rows **24 to 26** | one 2-3 px line through the middle |

Which edges a piece crosses is set by the mechanics, not the art: `edges` in the
brass `PARTS` table (`src/doodads/brass.js`). An unrotated straight crosses left
and right; an elbow crosses left and bottom (a "┐"); a mouthpiece crosses only
the right; a flare only the left.

`node test/art.mjs` checks every sprite against this, real and placeholder. It
exists because measuring the art for this page found the mouthpiece drawn
mirror-image: its stem left through the left edge while the mechanics join it on
the right. It is fixed with `"flipX": true` in the manifest rather than by editing
the PNG. **Worth fixing in Unity too.**

## Tile rules (linked art)

Some families change their drawing to show that they have joined their
neighbours, so a wall run reads as one mass and a row of piano keys as one
keyboard. This is autotiling; Unity's version is a Rule Tile.

A tile looks at its four neighbours and spells the joined ones in `n e s w`
order. That string goes on the end of its key:

| key | joined |
|---|---|
| `wall` | nothing (a free-standing block) |
| `wall.ew` | east and west (the middle of a horizontal run) |
| `wall.ns` | north and south |
| `wall.nes` | north, east, south (a T) |
| `wall.nesw` | all four (deep inside a wall mass) |

Four neighbours, each joined or not, is 2⁴ = 16 cases: `wall` plus 15 suffixed
keys. It is the same set as the usual bitmask (N=1, E=2, S=4, W=8), spelled in
letters so a filename says what it is.

The rules are in `src/art/links.js`:

| family | joins to | sides | room edge counts as joined? |
|---|---|---|---|
| `wall` | wall, door | all four | yes, so outer walls have no seam against nothing |
| `pianokey` | pianokey | east, west | no |

To draw a linked family, draw **the border only on sides that are not joined**,
and run the joined sides all the way to the tile edge. Where two keys join, the
left-hand key draws the shared separator so it is not drawn twice.

You do **not** need all 16 before any of it shows. Lookup falls back: the game
asks for `wall.ns`, then `wall`. Draw the plain one first, then the variants as
they become worth it. Linking is visual only; no mechanic reads it.

**Inside corners** (the crook of an L of wall, where the floor is diagonal) are not
in the 16. Instead of the 47-drawing set that would need, there is one extra
drawing, `wall.inner`, authored for the **north-east** corner. The game stamps it on
top, rotated to each corner that needs it (NE 0, SE 90, SW 180, NW 270). For the
quiet wall it is a 3 px L joining the border coming down from the north neighbour
to the one coming in from the east.

### The wall, as drawn now

Quiet on purpose. One 2 px border, **only on the sides that face floor**, set 3 px in
from the edge; joined sides run the border right to the tile edge so it continues
into the next tile. A curl is tucked into each **outside** corner. Nothing inside: a
thick wall reads as solid black and the room as a clean outline.

The old busy wall (`Pushable_Block - Copy.png` in Unity) was a pushable block, not a
wall. It is kept in the manifest as `block` and no longer fills the `wall` slot.

### Doors

Drawn upright, as a gap in a wall that runs north-south: a lintel at the top and a
sill at the bottom spanning x 3 to 48 so they meet the wall's border, and the door
leaf between. The game turns it 90 in an east-west wall. See [WORLD.md](WORLD.md)
for rotation and position in full.

## Which picture wins

Three sources, one order, chosen in the editor's Assets panel:

| mode | order | use it to |
|---|---|---|
| **real** (default) | your art, then placeholder, then schematic | see the game as it is |
| **sketch** | placeholder, then your art, then schematic | see a room entirely in placeholders, e.g. to judge a new mechanic's art in context |
| **schematic** | no art | judge mechanics only |

Within a source, the linked key is tried before the plain one. In **real** mode,
your plain `wall.png` beats a placeholder `wall.ns`: real art is never hidden by
a placeholder.

## Making a placeholder for a new mechanic

1. Give the doodad its `spriteKey` (and one per state), per CLAUDE.md.
2. Add a function to `PLACEHOLDERS` in `src/art/placeholders.js` under that key.
   It gets a `Pen` seeded from the key and draws in a 51 × 51 space.
3. If it joins neighbours, add its edges to `connectorEdges()` in
   `src/art/protocol.js` so `test/art.mjs` holds it to the connector rule.
4. If it should link visually, add a rule to `LINKS` and draw it as a function of
   the variant string, like `wall()` and `key()` do.

The pen (`src/art/pen.js`) has the vocabulary of the Unity art: wobbling `line`,
`box` with overshooting corners, `circle` that does not quite close, `curl` (the
spiral flourish), and `vine` (a line that sprouts curls). Seeded, so a
placeholder is the same drawing on every frame and every reload.

## Getting placeholders into Unity

- **One sheet:** editor → Assets → **download sketch atlas**. PNG plus manifest,
  at the size in the `px` box (51 by default).
- **One file per slot:** `node tools/export-placeholders.mjs [outDir]`, with the
  repo served on :8080. Names follow the protocol, so when a real drawing is done
  it replaces the placeholder under the same filename.

## Getting real art back in

Unchanged from [ASSETS.md](ASSETS.md): drop PNGs on the editor's drop zone
(filenames are matched to slots, `wall_ns.png` lands on `wall.ns`), play a room,
then copy the manifest and the files into `assets/`. Then run `node test/art.mjs`.
