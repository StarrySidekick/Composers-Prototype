# assets/

Sprites for the prototype. **Optional** — with an empty manifest every tile draws itself,
which is how this repo ships.

- `manifest.json` — sprite key → image. Format and slot names: [../docs/ASSETS.md](../docs/ASSETS.md).
- Drop PNGs next to it and reference them by filename.

Fastest way to fill this directory: open the editor, **Assets → download atlas**, and put
the two downloaded files here.

Keep it small — this is served straight off GitHub Pages with no build step, so every
byte here is a byte the page loads.
