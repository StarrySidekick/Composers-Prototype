/* Composer's Key — can a thumb press every button?
   ---------------------------------------------------------------------
   Every other test drives the game by calling it (g.fire(), g.shoulderL()),
   which proves the game works and says nothing about the buttons on the screen.
   That gap shipped a bug: on 2026-10-04 the L and R shoulders were drawn, lit up
   when they had something to do (the HUD reads the game), and were never wired
   to it. On a phone you could not lift anything with the burin. Q on a keyboard
   worked, and every test passed.

   So this one is a phone: a 390 x 844 touch screen, real touch events sent
   through the browser (Chrome DevTools' Input.dispatchTouchEvent), at the middle
   of each button as it is laid out. For each it checks two things:

     - nothing covers it: the element at its centre is the button itself (a
       hidden overlay that still eats touches has happened here before)
     - pressing it does its job: A fires, B plays what you face, L lifts and
       sets down, R turns what you carry, the D-pad walks

   Serve the repo root on :8080, then `node test/controls.mjs`.
*/
import { chromium } from 'playwright';

const EXEC = process.env.CHROMIUM || '/opt/pw-browsers/chromium';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8080/';

const browser = await chromium.launch({ executablePath: EXEC });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(String(e)));
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.CK && window.CK.game?.world, null, { timeout: 20000 });
const cdp = await page.context().newCDPSession(page);

// Into the Triad on free play (every tool, three waves), standing in the alcove
// over the hi-hat that waits below the burin.
await page.tap('#title-free');
await page.selectOption('#title-room', 'tower-01-triad.json');
await page.tap('#title-free-go');
await page.waitForTimeout(300);
await page.evaluate(() => {
  const g = window.CK.game, a = window.CK.audio;
  window.played = [];
  a.play = (o) => { window.played.push(o.family); };
  g.enterRoom(g.room, { x: 11, y: 2, facing: 'down' });
});

// The centre of an element, and what a finger there would actually touch.
const probe = (sel) => page.evaluate((sel) => {
  const el = document.querySelector(sel);
  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const hit = document.elementFromPoint(x, y);
  return { x, y, visible: r.width > 0 && r.height > 0, covered: !(hit && (hit === el || el.contains(hit))), by: hit ? `${hit.tagName.toLowerCase()}#${hit.id}.${hit.className}` : 'nothing' };
}, sel);

const touch = async (x, y, holdMs = 60) => {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await page.waitForTimeout(holdMs);
  const during = await page.evaluate(() => [...window.CK.game.held]);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(40);
  return during;
};

const state = () => page.evaluate(() => {
  const g = window.CK.game, h = g.progress.held;
  return { held: h?.name ?? null, rot: h?.spec.rot ?? null, bag: g.progress.satchel.length, waves: g.keyWaves, played: [...window.played], hat: g.room.doodadAt(11, 3)?.typeName ?? null };
});

const fails = [];
const ok = (name, cond, detail = '') =>
  cond ? console.log(`  ok   ${name}`) : fails.push(`${name}${detail ? ' — ' + detail : ''}`);

for (const sel of ['#btn-a', '#btn-b', '#btn-l', '#btn-r', '#dpad .right', '#menu-btn']) {
  const p = await probe(sel);
  ok(`${sel} is on screen and nothing covers it`, p.visible && !p.covered, `covered by ${p.by}`);
}

const l = await probe('#btn-l');
await touch(l.x, l.y);
let s = await state();
ok('L lifts the hi-hat into the satchel', s.held === 'hi-hat' && s.hat === null, JSON.stringify(s));

const r = await probe('#btn-r');
await touch(r.x, r.y);
s = await state();
ok('R turns what you carry', s.rot === 90, JSON.stringify(s));

await touch(l.x, l.y);
s = await state();
ok('L sets it down again', s.bag === 0 && s.hat === 'drum', JSON.stringify(s));

const b = await probe('#btn-b');
await page.evaluate(() => { window.played.length = 0; });
await touch(b.x, b.y);
s = await state();
ok('B plays what you face (the hi-hat)', s.played.includes('percussion'), JSON.stringify(s.played));

await page.evaluate(() => window.CK.game.enterRoom(window.CK.game.room, { x: 6, y: 10, facing: 'up' }));
const a = await probe('#btn-a');
await touch(a.x, a.y);
s = await state();
ok('A fires a wave', s.waves === 1, JSON.stringify(s));

const right = await probe('#dpad .right');
const held = await touch(right.x, right.y, 120);
ok('the D-pad walks while it is held', held.includes('right'), JSON.stringify(held));
const after = await page.evaluate(() => [...window.CK.game.held]);
ok('and stops when it is let go', after.length === 0, JSON.stringify(after));

const realErrors = pageErrors.filter(e => !/Unable to decode audio data/.test(e));
ok('nothing threw on the page', realErrors.length === 0, realErrors.join(' | '));

await browser.close();
if (fails.length) {
  console.log(`\nFAIL (${fails.length})`);
  for (const f of fails) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('PASS');
