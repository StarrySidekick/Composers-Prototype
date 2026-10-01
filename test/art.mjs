/* Composer's Key — the art protocol, checked.
   ---------------------------------------------------------------------
   docs/ART-PROTOCOL.md says where a piece's lines must cross the tile edge so
   it joins its neighbour. This holds every sprite to that, real and placeholder.

   Why it exists: the first time it was written down, measuring the Unity art
   turned up a mouthpiece drawn mirror-image. Its stem left through the LEFT
   edge while the mechanics join a mouthpiece on the RIGHT, so every horn in
   the game looked disconnected at its first joint and nothing said so. That
   is a silent fault, the same kind test/rooms.mjs exists for, so it gets the
   same treatment: a check that fails loudly.

   What it checks, per sprite key that has a connector rule:
     - every edge the mechanics join has ink on it
     - that ink sits inside the measured span (with 1 px of slack, it is hand-drawn)
   And for every placeholder: it is the tile size and strictly two-colour.

   It does not check edges that are NOT joined. A flare's bell may touch the
   right edge without being a connector, and that is fine.

   Serve the repo root on :8080, then `node test/art.mjs`.
*/
import { chromium } from 'playwright';

const EXEC = process.env.CHROMIUM || '/opt/pw-browsers/chromium';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8080/';

const browser = await chromium.launch({ executablePath: EXEC });
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(String(e)));
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.CK && window.CK.assets, null, { timeout: 20000 });

const report = await page.evaluate(async () => {
  const { connectorEdges, connectorSpan, TILE } = await import('./src/art/protocol.js');
  const { placeholderKeys } = await import('./src/art/placeholders.js');
  const store = window.CK.assets;
  const out = { checked: 0, fails: [], placeholders: 0 };

  // Opaque pixels along one edge of a slice, scaled to the tile grid.
  function edgeInk(slice, edge) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = TILE;
    const c = cv.getContext('2d');
    c.imageSmoothingEnabled = false;
    c.drawImage(slice.image, slice.sx, slice.sy, slice.sw, slice.sh, 0, 0, TILE, TILE);
    const d = c.getImageData(0, 0, TILE, TILE).data;
    const hits = [];
    for (let i = 0; i < TILE; i++) {
      const [x, y] = { left: [0, i], right: [TILE - 1, i], top: [i, 0], bottom: [i, TILE - 1] }[edge];
      if (d[(y * TILE + x) * 4 + 3] > 127) hits.push(i);
    }
    return hits;
  }

  const keys = new Set([...placeholderKeys(), ...Object.keys(store.manifest.sprites)]);
  for (const key of keys) {
    const edges = connectorEdges(key);
    const span = connectorSpan(key);
    if (!edges || !span) continue;
    for (const [layer, slice] of [['real', store.real(key)], ['placeholder', store.draft(key)]]) {
      if (!slice) continue;
      out.checked++;
      for (const edge of edges) {
        const ink = edgeInk(slice, edge);
        if (!ink.length) {
          out.fails.push(`${key} (${layer}): no ink on its ${edge} edge, but the mechanics join it there`);
        } else if (ink[0] < span.from - 1 || ink[ink.length - 1] > span.to + 1) {
          out.fails.push(`${key} (${layer}): ${edge} edge ink spans ${ink[0]}..${ink[ink.length - 1]}, protocol says ${span.from}..${span.to}`);
        }
      }
    }
  }

  for (const key of placeholderKeys()) {
    const s = store.draft(key);
    if (!s) { out.fails.push(`${key}: placeholder failed to draw`); continue; }
    out.placeholders++;
    if (s.sw !== TILE || s.sh !== TILE) out.fails.push(`${key}: placeholder is ${s.sw}x${s.sh}, not ${TILE}`);
    const d = s.image.getContext('2d').getImageData(0, 0, s.sw, s.sh).data;
    for (let i = 3; i < d.length; i += 4) {
      if (d[i] !== 0 && d[i] !== 255) { out.fails.push(`${key}: placeholder has soft alpha (${d[i]})`); break; }
    }
  }
  return out;
});

const fails = [...report.fails];
const ok = (name, cond, detail = '') =>
  cond ? console.log(`  ok   ${name}`) : fails.push(`${name}${detail ? ' — ' + detail : ''}`);

// Guard against going vacuous: if the rules stop matching anything, say so.
ok('connector rules matched some sprites', report.checked >= 10, `${report.checked} checked`);
ok('placeholders exist to check', report.placeholders >= 40, `${report.placeholders}`);
// Headless Chromium cannot decode the real samples; same filter as test/rooms.mjs.
const realErrors = pageErrors.filter(e => !/Unable to decode audio data/.test(e));
ok('nothing threw on the page', realErrors.length === 0, realErrors.join(' | '));

await browser.close();
console.log(`\n${report.checked} connector checks, ${report.placeholders} placeholders`);
if (fails.length) {
  console.log(`\nFAIL (${fails.length})`);
  for (const f of fails) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('PASS');
