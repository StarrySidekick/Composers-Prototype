/* Composer's Key — can a thumb play the daily board?
   ---------------------------------------------------------------------
   test/daily.mjs proves every board by calling Board.tap and Board.move. This
   proves a finger reaches them: a 390 x 844 phone, real touch events
   (Chrome's Input.dispatchTouchEvent) at the centre of each tile and button as
   it is laid out, the same way test/controls.mjs holds the castle's buttons.

     - nothing covers play, listen, reset, or the day strip
     - a tap on a drum with an arrow turns it; a tap on a slide pulls it
     - a finger that drags a drum with corners carries it to the tile under it
     - a tap on a fixed instrument plays its note and is never judged
     - day 1 solved by touch shows the card that names the song
     - listen plays the tune unheard; the title screen links here

   Serve the repo root on :8080, then `node test/daily-touch.mjs`.
*/
import { chromium } from 'playwright';

const EXEC = process.env.CHROMIUM || '/opt/pw-browsers/chromium';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8080/';

const browser = await chromium.launch({ executablePath: EXEC });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(String(e)));
const cdp = await page.context().newCDPSession(page);
const fails = [];
const ok = (name, cond, detail = '') =>
  cond ? console.log(`  ok   ${name}`) : fails.push(`${name}${detail ? ' — ' + detail : ''}`);

const open = async (day) => {
  await page.goto(`${BASE}daily.html?day=${day}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.DAILY?.board);
  // Every note the page asks for, written down (the sound itself is not the point).
  await page.evaluate(() => {
    window.played = [];
    window.DAILY.audio.play = (o) => { window.played.push({ family: o.family, midi: o.midi, heard: o.heard !== false }); };
  });
};

// The centre of a board tile on the screen.
const tile = (x, y) => page.evaluate(([x, y]) => {
  const v = window.DAILY.view;
  const r = document.getElementById('d-board').getBoundingClientRect();
  return { x: r.left + v.ox + (x + 0.5) * v.tile, y: r.top + v.oy + (y + 0.5) * v.tile, s: v.tile };
}, [x, y]);

const probe = (sel) => page.evaluate((sel) => {
  const el = document.querySelector(sel);
  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const hit = document.elementFromPoint(x, y);
  return { x, y, visible: r.width > 0 && r.height > 0, covered: !(hit && (hit === el || el.contains(hit))), by: hit ? `${hit.tagName.toLowerCase()}#${hit.id}` : 'nothing' };
}, sel);

const tap = async (x, y) => {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await page.waitForTimeout(40);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(60);
};

const drag = async (a, b) => {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y }] });
  for (let i = 1; i <= 8; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a.x + (b.x - a.x) * i / 8, y: a.y + (b.y - a.y) * i / 8 }] });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(60);
};

const press = async (sel) => { const p = await probe(sel); await tap(p.x, p.y); };

// ---- day 1: turn, play, solve -------------------------------------------------
console.log('day 1 by touch');
await open(1);
ok('the first visit opens how to play', await page.evaluate(() => !document.getElementById('d-howto').hidden));
await press('#d-howto-close');
for (const sel of ['#d-play', '#d-listen', '#d-reset', '#d-help', '#d-days .d-day:nth-child(10)']) {
  const p = await probe(sel);
  ok(`${sel} is on screen and nothing covers it`, p.visible && !p.covered, `covered by ${p.by}`);
}
ok('ten days in the strip', await page.$$eval('#d-days .d-day', els => els.length) === 10);

const rot = (x, y) => page.evaluate(([x, y]) => window.DAILY.board.pieceAt(x, y)?.rot, [x, y]);
let t = await tile(1, 0);
const before = await rot(1, 0);
await tap(t.x, t.y);
ok('a tap on a drum with an arrow turns it', await rot(1, 0) === (before + 90) % 360, `${before} -> ${await rot(1, 0)}`);
t = await tile(3, 13);
await tap(t.x, t.y);

// A fixed string: its note, unheard, and no run started.
await page.evaluate(() => { window.played.length = 0; });
t = await tile(5, 9);
await tap(t.x, t.y);
const heard = await page.evaluate(() => ({ played: window.played, running: window.DAILY.board.running, moves: window.DAILY.board.moves }));
ok('a tap on a fixed string plays its note, unheard', heard.played.length === 1 && heard.played[0].family === 'strings' && !heard.played[0].heard, JSON.stringify(heard.played));
ok('and does not count as a touch', heard.moves === 2, `${heard.moves}`);

// Play, at a tempo a test can wait for.
await page.evaluate(() => { window.DAILY.board.room.music.bpm = 900; window.played.length = 0; });
await press('#d-play');
await page.waitForFunction(() => !window.DAILY.board.running, null, { timeout: 8000 });
const v = await page.evaluate(() => window.DAILY.board.verdict);
ok('play sends the wave and it plays mi re do', v?.kind === 'solved', JSON.stringify(v));
await page.waitForSelector('#d-done:not([hidden])', { timeout: 3000 }).catch(() => {});
const card = await page.evaluate(() => ({ shown: !document.getElementById('d-done').hidden, text: document.getElementById('d-done-from').textContent }));
ok('the solved card names the song', card.shown && /Stay Warm/.test(card.text), JSON.stringify(card));
const notes = await page.evaluate(() => window.played.filter(p => p.family !== 'percussion'));
ok('the run\'s notes reach the speaker unheard by anything else', notes.length === 3 && notes.every(n => !n.heard), JSON.stringify(notes));
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ck-daily-v1') || '{}'));
ok('the day is remembered as solved', saved.days?.['day-01']?.solved === true, JSON.stringify(saved));
await press('#d-done-close');

// ---- listen ---------------------------------------------------------------------
await page.evaluate(() => { window.played.length = 0; });
await press('#d-listen');
const tune = await page.evaluate(() => window.played);
ok('listen plays the tune, unheard', tune.length === 3 && tune.every(n => !n.heard), JSON.stringify(tune));

// ---- day 3: a slide is tuned by a tap --------------------------------------------
console.log('day 3 by touch');
await open(3);
ok('after that, a day opens straight onto the board', await page.evaluate(() => document.getElementById('d-howto').hidden));
const ext = () => page.evaluate(() => window.DAILY.board.pieceAt(3, 10).extend);
const e0 = await ext();
t = await tile(3, 10);
await tap(t.x, t.y);
ok('a tap on a slide with a dial pulls it out', await ext() === (e0 + 1) % 4, `${e0} -> ${await ext()}`);

// ---- day 5: a drum is dragged into place -----------------------------------------
console.log('day 5 by touch');
await open(5);
const from = await tile(4, 12);
const to = await tile(7, 9);
// The piece rides above the finger (so the finger does not hide it), and lands
// on the tile under the piece: a finger most of a tile below the target.
await drag(from, { x: to.x, y: to.y + to.s * 0.7 });
const where = await page.evaluate(() => ({ old: window.DAILY.board.pieceAt(4, 12)?.typeName ?? null, now: window.DAILY.board.pieceAt(7, 9)?.typeName ?? null }));
ok('a drum with corners is carried by a finger to its tile', where.old === null && where.now === 'drum', JSON.stringify(where));
// A tap on it is not a drag: it does not move.
t = await tile(7, 9);
await tap(t.x, t.y);
ok('a tap on a drum that can only move leaves it where it is', await page.evaluate(() => window.DAILY.board.pieceAt(7, 9)?.typeName) === 'drum');

// ---- the strip opens another day ----------------------------------------------------
await press('#d-days .d-day:nth-child(2)');
ok('a day in the strip opens it', await page.evaluate(() => window.DAILY.index) === 1);

// ---- the way in, from the title screen --------------------------------------------
console.log('the title screen');
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.CK?.game?.world, null, { timeout: 20000 });
const chip = await probe('#title-daily');
ok('the title screen has a daily chip and nothing covers it', chip.visible && !chip.covered, `covered by ${chip.by}`);
ok('it leads to the daily board', await page.$eval('#title-daily', a => a.getAttribute('href')) === 'daily.html');

const realErrors = pageErrors.filter(e => !/Unable to decode audio data/.test(e));
ok('nothing threw on the page', realErrors.length === 0, realErrors.join(' | '));

await browser.close();
if (fails.length) {
  console.log(`\nFAIL (${fails.length})`);
  for (const f of fails) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('PASS');
