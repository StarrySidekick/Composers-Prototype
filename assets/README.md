# assets/

Sprites for the prototype. **Optional** — with an empty manifest every tile draws itself,
which is how this repo ships.

- `manifest.json` — sprite key → image. Format and slot names: [../docs/ASSETS.md](../docs/ASSETS.md).
- `sprites/` — real art from the Unity project, filling 13 of the 34 slots. Rotation,
  ink colour and square padding are **baked into these files**; read
  [../docs/PORTING.md](../docs/PORTING.md#assets-carried-over-from-unity) before
  re-exporting any of them.
- `audio/` — the recorded cello, horn, bass drum and click, transcoded to AAC. Loaded by
  `src/audio/sampler.js`, which knows the *measured* pitches: the horn files are named
  an octave low.
- `concept/` — concept art. Referenced by nothing and loaded by nothing; it lives here
  so it stays with the rest of the imported art.
- Drop PNGs next to it and reference them by filename.

Fastest way to fill this directory: open the editor, **Assets → download atlas**, and put
the two downloaded files here.

Keep it small — this is served straight off GitHub Pages with no build step, so every
byte here is a byte the page loads.
