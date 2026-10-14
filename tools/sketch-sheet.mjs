/* A contact sheet of the story sketches (src/story/sketch.js), for LOOKING at.
   Each sketch is drawn on black in a labelled 360 x 360 cell, about the size of
   the stage on a phone: animated ones at a few beat times, bosses calm and not,
   Coda in every pose, the tube both ways. Prints each cell's stroke count and
   draw time, because the animated ones redraw every frame on a phone.
   Usage (serve the repo root on :8080):
     node tools/sketch-sheet.mjs out.png [prefix[,prefix...]]   (COLS=3 for a narrower sheet)
*/
import { chromium } from 'playwright';
import fs from 'fs';

const EXEC = process.env.CHROMIUM || '/opt/pw-browsers/chromium';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8080/';
const out = process.argv[2];
const only = (process.argv[3] ?? '').split(',').filter(Boolean);
const COLS = +(process.env.COLS || 5);
if (!out) { console.error('usage: node tools/sketch-sheet.mjs out.png [key-prefix]'); process.exit(1); }

const b = await chromium.launch({ executablePath: EXEC });
const p = await b.newPage({ viewport: { width: 1400, height: 1000 } });
p.on('pageerror', (e) => { if (!/decode audio data/.test(e.message)) console.error('page error:', e.message); });
await p.goto(BASE); await p.waitForTimeout(800);
const res = await p.evaluate(async ([only, COLS]) => {
  const lib = await import('./src/story/sketch.js');
  const { Pen } = await import('./src/art/pen.js');
  // count strokes: every pen stroke ends in Pen.prototype.path
  let strokes = 0;
  const real = Pen.prototype.path;
  Pen.prototype.path = function (...a) { strokes++; return real.apply(this, a); };

  const cells = [];
  for (const key of lib.sketchKeys()) {
    if (only.length && !only.some((o) => key.startsWith(o))) continue;
    const add = (o, label, w = 360, h = 360) => cells.push({ key, o, label: label ?? key, w, h });
    if (key === 'coda') {
      for (const pose of ['stand', 'walk', 'fall', 'sit', 'hold']) add({ pose }, `coda ${pose}`);
      add({ pose: 'walk', t: 0.5 }, 'coda walk t.5');
      for (const t of [0, 1, 2, 3, 3.5]) add({ pose: 'conduct', t }, `coda conduct t${t}`);
      for (const amount of [0.5, 1]) add({ pose: 'bow', amount }, `coda bow ${amount}`);
      add({ pose: 'hold' }, 'coda hold (tall box)', 260, 360);
    } else if (key === 'tube') {
      for (const orient of ['vertical', 'horizontal']) for (const t of [0, 0.5]) add({ orient, t }, `tube ${orient} t${t}`);
    } else if (key.startsWith('boss.')) {
      add({ resolved: false }, key); add({ resolved: true }, `${key} resolved`);
    } else if (key === 'divider') {
      add({}, 'divider (360x60)', 360, 60);
    } else if (key === 'stamp') {
      add({}, 'stamp (360x110)', 360, 110);
    } else if (key === 'frame') {
      add({}, 'frame'); add({}, 'frame (360x200)', 360, 200);
    } else if (key.startsWith('emblem.')) {
      add({}, key, 360, 288);
    } else if (lib.isAnimated(key)) {
      add({ t: 0 }, `${key} t0`); add({ t: 1.5 }, `${key} t1.5`);
    } else {
      add({}, key);
    }
  }
  add2: {
    // the unknown-key fallback, so it is seen to work
    if (!only.length) cells.push({ key: 'no.such.key', o: {}, label: 'unknown key', w: 360, h: 360 });
  }
  const C = COLS, S = 372, LH = 18;
  const cv = document.createElement('canvas');
  cv.width = C * S; cv.height = Math.ceil(cells.length / C) * (S + LH);
  const c = cv.getContext('2d');
  c.fillStyle = '#111'; c.fillRect(0, 0, cv.width, cv.height);
  const stats = [];
  cells.forEach((cell, i) => {
    const x = (i % C) * S + 6, y = Math.floor(i / C) * (S + LH) + 4;
    c.fillStyle = '#000'; c.fillRect(x, y, 360, 360);
    c.save(); c.translate(x + (360 - cell.w) / 2, y + (360 - cell.h) / 2);
    c.fillStyle = '#000'; c.fillRect(0, 0, cell.w, cell.h);
    strokes = 0;
    const t0 = performance.now();
    lib.drawSketch(c, cell.key, cell.w, cell.h, { seed: 0, ...cell.o });
    const ms = performance.now() - t0;
    c.restore();
    if (cell.w !== 360 || cell.h !== 360) { c.strokeStyle = '#333'; c.strokeRect(x + (360 - cell.w) / 2 - 0.5, y + (360 - cell.h) / 2 - 0.5, cell.w + 1, cell.h + 1); }
    c.fillStyle = '#999'; c.font = '12px monospace';
    c.fillText(`${cell.label}  ·  ${strokes} strokes`, x, y + 360 + 13);
    stats.push({ label: cell.label, strokes, ms: +ms.toFixed(1), animated: lib.isAnimated(cell.key) });
  });
  Pen.prototype.path = real;
  return { url: cv.toDataURL(), stats };
}, [only, COLS]);
fs.writeFileSync(out, Buffer.from(res.url.split(',')[1], 'base64'));
for (const s of res.stats) console.log(`${s.animated ? '*' : ' '} ${s.label.padEnd(34)} ${String(s.strokes).padStart(4)} strokes ${String(s.ms).padStart(6)} ms`);
await b.close();
