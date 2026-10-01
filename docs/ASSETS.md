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

So there is a sprite layer, with two sources: real art from Unity, and generated sketch
placeholders for everything not drawn yet. Delete `assets/` and the game still runs, on
placeholders.

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

On every frame the renderer asks the store for the linked key (if the tile has a link
rule) and then `d.spriteKey`. A hit is blitted; a miss falls through to `d.draw()`.
**You never have to fill in the whole set** — a room with a painted wall and
placeholder everything-else works fine, which is what makes this useful
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

## Placeholders

Every slot without real art gets a **sketch placeholder**: generated white line-work in
the house style, at 51 px, obeying the same connector rules as the real art. They are
live (drawn on load, nothing on disk) and the rules for them, and for hand-drawn art,
are in [ART-PROTOCOL.md](ART-PROTOCOL.md). That page also covers **linked art**: walls
and piano keys ask for a variant such as `wall.ns` before the plain `wall`.

In the editor's **Assets** panel:

- **art: real / sketch / schematic** — which picture wins. See ART-PROTOCOL.md.
- **download sketch atlas** — every placeholder, linked variants included, packed into one
  PNG plus a matching `manifest.json`, at the size in the `px` box. For Unity.
- Or `node tools/export-placeholders.mjs` for one PNG per slot.

The slot list marks real art bright and placeholder-only slots dashed.

## Manifest extras

- `ink` (top level, and per sprite) — the colour the art is recoloured to on load,
  using only its alpha. Default white. `"none"` blits the file as-is.
- `flipX` (per sprite) — mirror it. Used for the mouthpiece, which is drawn backwards.

## What is in assets/ right now

The Unity project's own art, filling 13 of the slots — brass straight/elbow/mouthpiece/
flare, string, peg, wall, door, drum.bass, mallet, pianokey, lock and lock.lit — plus two
keys that are not tiles: `player` and `wave`. Everything else is on placeholders.

Those PNGs are **not** byte-copies of `Assets/Sprites`; the reasoning is in
[PORTING.md](PORTING.md#assets-carried-over-from-unity). Before re-exporting anything:

- The tube art is drawn vertical in Unity and has been turned 90° here. The mouthpiece
  and flare are drawn horizontal and have *not*.
- The files carry an old brown ink. It is ignored: the store recolours everything to
  `ink`. New exports should be plain white.
- The mouthpiece is mirrored by `flipX`. If you fix it in Unity and re-export, drop the flag.

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
