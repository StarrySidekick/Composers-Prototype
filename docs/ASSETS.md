# Art in the prototype

The prototype draws every tile with canvas calls, and it will keep doing that. Schematic
art is genuinely the right thing for judging a mechanic — you can see a face table at a
glance, and nothing is ever blocked on a drawing existing.

But two jobs want real pictures:

1. **Checking a room still reads once it's dressed.** A tube circuit that is obvious in
   line art can turn into visual soup in painted tiles. Better to find that here.
2. **Getting placeholders into Unity.** A complete, correctly-gridded placeholder set
   for every doodad and every doodad *state*, cut to whatever tile size the Unity
   project wants, is one button.

So there is a sprite layer. It is entirely optional: with no `assets/manifest.json` and
nothing dropped in, the game behaves exactly as it did before.

## How it resolves

Every doodad has a **sprite key** — `Doodad.spriteKey`. The default is
`type` or `type.part`; a doodad whose art changes with its state overrides it:

| key | when |
|---|---|
| `brass.straight`, `brass.elbow`, `brass.tee`, `brass.cross`, … | one per tube part |
| `brass.slide.0` … `brass.slide.3` | the slide, per position |
| `brass.mute` / `brass.mute.open` | mute seated / pulled |
| `drum.bass`, `drum.tom`, `drum.snare`, `drum.hat`, `drum.cymbal`, `drum.timpani` | one per piece of the kit |
| `door` / `door.open` | shut / open |
| `lock` / `lock.lit`, `notelock` / `notelock.lit` | unlit / lit |
| `keyshift.up` / `keyshift.down` | stairs up / down |
| `wall`, `peg`, `string`, `pianokey`, `mallet`, `exit`, `dissonance` | one each |

On every frame the renderer asks the store for `d.spriteKey`. A hit is blitted; a miss
falls through to `d.draw()`. **You never have to fill in the whole set** — a room with a
painted wall and schematic everything-else works fine, which is what makes this useful
during art production rather than only at the end of it.

Two rules for the art itself:

- **Sprites are authored unrotated.** The renderer applies the doodad's `rot`, the same
  way `draw()` does. One elbow sprite covers all four elbows.
- **Readouts are drawn on top.** A piano key's degree and a timpani's tuning come from
  `Doodad.overlay()` and are painted over the sprite, because they are state, not art.

## The manifest

`assets/manifest.json`:

```json
{
  "tileSize": 32,
  "sheets": { "placeholders-brass": { "src": "placeholders-brass.png", "tile": 32 } },
  "sprites": {
    "brass.elbow": { "sheet": "placeholders-brass", "col": 1, "row": 0 },
    "door.open":   { "src": "door_open.png" }
  },
  "unity": {
    "brass.elbow": "Assets/Art/Instruments/Brass/tube_elbow.png"
  }
}
```

- `sheets` — atlases, cut on a fixed square grid.
- `sprites` — a slot is either `{sheet, col, row}` or a standalone `{src}`.
- `unity` — *documentation, not used at runtime*: where each key came from in the Unity
  project, so re-exporting after an art change is a scripted copy rather than an
  archaeology exercise. Fill it in as you fill the slots.

Paths in `src` are relative to `assets/`.

## Generating placeholders

In the editor's **Assets** panel:

- **bake placeholders** — renders every slot from the prototype's own `draw()` calls into
  in-memory images and switches the game over to them. The room should look almost
  identical; anything that *doesn't* is a bug in the sprite path, which is the point.
- **download atlas** — the same set packed into one PNG plus a matching `manifest.json`.
  Drop both into `assets/` and they load on refresh; or take the PNG into Unity as the
  placeholder tile set. The `px` box sets the tile size — match it to the Unity project's
  pixels-per-unit grid before exporting.

The atlas is baked in the current room's **wing** palette, because walls, doors and locks
are wing-tinted. Export one per wing if you need all of them; the filename carries the
wing (`placeholders-brass.png`).

## Bringing real art in from Unity

There is no path from this repo to the Unity project — it is a separate tree — so this is
a copy, and the naming is what keeps it cheap.

1. **Export from Unity.** Sprites, one PNG per slot, square, at the tile size in
   `manifest.json`. Name each file after its key with dots as underscores:
   `brass_elbow.png`, `drum_timpani.png`, `door_open.png`.
2. **Drop the folder** onto the editor's drop zone. Filenames are matched to slots by
   token, so `Brass_Tube_Elbow.png` and `spr_brass_elbow.png` both land on `brass.elbow`.
   Anything unmatched is reported and ignored — click the slot in the list underneath to
   assign it by hand.
3. **Play a room.** This is the whole reason for the round trip.
4. **copy manifest**, paste into `assets/manifest.json`, and copy the PNGs into `assets/`.
   Dropped sprites live only in that tab; the manifest is what makes them survive.
5. Fill in the `unity` map with the source paths while you still remember them.

If a sprite looks rotated wrongly, it was authored rotated — bake it flat. Screen space
here is **+y down**; see [PORTING.md](PORTING.md) before deciding a sprite is "upside
down" in one project or the other.
