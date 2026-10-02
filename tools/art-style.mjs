/* How close are the placeholders to Timothy's hand? Measured, not eyeballed.
   ---------------------------------------------------------------------
   For every tile with ink, at 51 px: ink coverage, the stroke width at each ink
   pixel (the shorter of its horizontal and vertical runs), and how many separate
   marks it is made of. Prints the medians for the real Unity art and for the
   placeholders side by side, then the placeholders furthest from the real art.

   The numbers that matter (docs and targets in .claude/skills/composers-key-art):
     coverage        his ~17%       too low reads thin and fiddly
     3 px strokes    his ~42%       his main line weight
     separate marks  his ~2         his curls grow out of the main form

   Usage (serve the repo root on :8080 first):
     node tools/art-style.mjs [key-prefix]
*/
import { chromium } from 'playwright';

const EXEC = process.env.CHROMIUM || '/opt/pw-browsers/chromium';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8080/';
const only = process.argv[2] ?? '';

const browser = await chromium.launch({ executablePath: EXEC });
const page = await browser.newPage();
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.CK && window.CK.assets, null, { timeout: 20000 });

const rows = await page.evaluate(async (only) => {
  const { placeholderKeys } = await import('./src/art/placeholders.js');
  const store = window.CK.assets;
  const N = 51;
  function measure(slice) {
    const cv = document.createElement('canvas'); cv.width = cv.height = N;
    const c = cv.getContext('2d'); c.imageSmoothingEnabled = false;
    c.drawImage(slice.image, slice.sx, slice.sy, slice.sw, slice.sh, 0, 0, N, N);
    const d = c.getImageData(0, 0, N, N).data;
    const on = (x, y) => x >= 0 && y >= 0 && x < N && y < N && d[(y * N + x) * 4 + 3] > 127;
    let ink = 0; const th = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (!on(x, y)) continue;
      ink++;
      const run = (dx, dy) => { let n = 1; for (const s of [1, -1]) for (let i = 1; on(x + dx * i * s, y + dy * i * s); i++) n++; return n; };
      th.push(Math.min(run(1, 0), run(0, 1)));
    }
    if (!ink) return null;
    const seen = new Set(); let marks = 0;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (!on(x, y) || seen.has(y * N + x)) continue;
      marks++; const st = [[x, y]]; seen.add(y * N + x);
      while (st.length) {
        const [cx, cy] = st.pop();
        for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
          if (on(nx, ny) && !seen.has(ny * N + nx)) { seen.add(ny * N + nx); st.push([nx, ny]); }
        }
      }
    }
    const pct = (f) => Math.round(th.filter(f).length / th.length * 100);
    return { cov: Math.round(ink / (N * N) * 100), t2: pct(t => t === 2), t3: pct(t => t === 3), t4: pct(t => t >= 4), t1: pct(t => t === 1), marks };
  }
  const out = [];
  const realKeys = Object.keys(store.manifest.sprites).filter(k => !['player', 'pianokey', 'lock.lit'].includes(k));
  for (const k of realKeys) { const m = store.real(k) && measure(store.real(k)); if (m) out.push({ who: 'yours', key: k, ...m }); }
  for (const k of placeholderKeys()) {
    if (only && !k.startsWith(only)) continue;
    const s = store.draft(k); const m = s && measure(s); if (m) out.push({ who: 'mine', key: k, ...m });
  }
  return out;
}, only);
await browser.close();

const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const line = (who) => {
  const R = rows.filter(r => r.who === who);
  return `${who.padEnd(6)} n=${String(R.length).padStart(2)}  coverage ${String(med(R.map(r => r.cov))).padStart(3)}%   stroke 1px ${String(med(R.map(r => r.t1))).padStart(3)}%  2px ${String(med(R.map(r => r.t2))).padStart(3)}%  3px ${String(med(R.map(r => r.t3))).padStart(3)}%  4+px ${String(med(R.map(r => r.t4))).padStart(3)}%   marks ${med(R.map(r => r.marks))}`;
};
console.log(line('yours'));
console.log(line('mine'));
const ref = rows.filter(r => r.who === 'yours');
const target = { cov: med(ref.map(r => r.cov)), t3: med(ref.map(r => r.t3)), marks: med(ref.map(r => r.marks)) };
const far = rows.filter(r => r.who === 'mine')
  .map(r => ({ ...r, off: Math.abs(r.cov - target.cov) / 10 + Math.abs(r.t3 - target.t3) / 25 + Math.max(0, r.marks - target.marks - 2) / 3 }))
  .sort((a, b) => b.off - a.off).slice(0, 8);
console.log('\nfurthest from his hand:');
for (const r of far) console.log(`  ${r.key.padEnd(20)} coverage ${r.cov}%  3px ${r.t3}%  marks ${r.marks}`);
