# key3d

The low-poly key and its WebGL renderer, copied **unchanged** from Timothy's
website repo, `StarrySidekick/Doppelganger-Website`:

| here | there |
|---|---|
| `model3d.js` | `src/lib/model3d.js` |
| `model-view.js` | `src/lib/model-view.js` |

Copied at commit `48f1a8a` (2026-09-28). Both files are plain ES modules with no
library and no build, which is why they can live here without breaking this
repo's no-dependency rule. Do not edit them here: change them in the website and
copy them across again, so the two keys never drift apart.

What uses them: `src/render/key-flight.js`, the unlock animation.
