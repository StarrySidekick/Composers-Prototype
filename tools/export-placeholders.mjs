/* Write every sketch placeholder to disk as its own PNG, for Unity.
   ---------------------------------------------------------------------
   The editor's "download sketch atlas" gives one packed sheet. This gives one
   file per slot instead, named the way docs/ASSETS.md says Unity exports should
   be named (`brass_elbow.png`, `wall_ns.png`), so the same folder can go into
   Unity as placeholders and, later, the real drawings can replace them file for
   file under the same names.

   Usage (serve the repo root on :8080 first):
     node tools/export-placeholders.mjs [outDir] [--px 51] [--only wall]

   Defaults to ./placeholder-export at 51 px. Like room-report, this is a tool,
   not part of the site: it needs Playwright and that is fine here.
*/
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

const EXEC = process.env.CHROMIUM || '/opt/pw-browsers/chromium';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8080/';

const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = args.indexOf(name);
  if (i < 0) return dflt;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const px = Number(flag('--px', 51));
const only = flag('--only', '');
const outDir = resolve(args[0] ?? 'placeholder-export');

const browser = await chromium.launch({ executablePath: EXEC });
const page = await browser.newPage();
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.CK && window.CK.assets, null, { timeout: 20000 });

const files = await page.evaluate(async ({ px, only }) => {
  const { placeholderKeys, drawPlaceholder } = await import('./src/art/placeholders.js');
  const out = [];
  for (const key of placeholderKeys()) {
    if (only && !key.startsWith(only)) continue;
    const src = drawPlaceholder(key);
    const cv = document.createElement('canvas');
    cv.width = cv.height = px;
    const c = cv.getContext('2d');
    c.imageSmoothingEnabled = false;   // nearest-neighbour: keep the hard pixels
    c.drawImage(src, 0, 0, px, px);
    out.push({ name: `${key.replace(/\./g, '_')}.png`, data: cv.toDataURL('image/png').split(',')[1] });
  }
  return out;
}, { px, only });

await browser.close();
mkdirSync(outDir, { recursive: true });
for (const f of files) writeFileSync(join(outDir, f.name), Buffer.from(f.data, 'base64'));
console.log(`${files.length} placeholders at ${px}px -> ${outDir}`);
