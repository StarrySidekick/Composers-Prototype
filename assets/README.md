# assets/

Art and audio for the prototype. **Optional** — with an empty manifest every tile falls
back to a sketch placeholder.

- `manifest.json` — sprite key → image. Format and slot names: [../docs/ASSETS.md](../docs/ASSETS.md).
- `sprites/` — real art from the Unity project. Rotation and square padding are
  **baked into these files**; colour is not (the store recolours to the manifest's
  `ink`). Read [../docs/ART-PROTOCOL.md](../docs/ART-PROTOCOL.md) before drawing a new
  one and [../docs/PORTING.md](../docs/PORTING.md#assets-carried-over-from-unity)
  before re-exporting an old one.
- `audio/` — the recorded cello, horn, bass drum and click, transcoded to AAC. Loaded by
  `src/audio/sampler.js`, which knows the *measured* pitches: the horn files are named
  an octave low.
- `concept/` — concept art. Referenced by nothing and loaded by nothing; it lives here
  so it stays with the rest of the imported art.
- Drop PNGs next to it and reference them by filename.

Slots with no file here are drawn as sketch placeholders, generated in code
(`src/art/placeholders.js`). Nothing needs to go here for the game to look complete.

Keep it small — this is served straight off GitHub Pages with no build step, so every
byte here is a byte the page loads.
