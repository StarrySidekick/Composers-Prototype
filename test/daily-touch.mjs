/* Composer's Key — can a thumb play the daily board?
   ---------------------------------------------------------------------
   test/daily.mjs proves every board by calling Board.tap, Board.move and
   Board.aim. This proves a finger reaches them: a 390 x 844 phone, real touch
   events (Chrome's Input.dispatchTouchEvent) at the centre of each tile and
   button as it is laid out, the way test/controls.mjs holds the castle's.

     - the first visit opens how to play; after that a day opens on the board
     - nothing covers the gear, the reset, the music or Coda
     - tapping a peg winds it; tapping a drum turns it; a fixed string plays its
       note unheard and costs no touch
     - tapping Coda plays: day 1 solved by touch shows the card naming the song
     - tapping the music plays the tune, unheard, and lights the staff
     - the gear opens the ten days, and a day opens from there
     - a finger slides a peg block along its string, and its string follows
     - a finger dragged from Coda aims him (day 10)
     - the title screen links here

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
const state = () => page.evaluate(() => window.DAILY.board);

// ---- day 1: wind, play, solve ----------------------------------------------------
console.log('day 1 by touch');
await open(1);
ok('the first visit opens how to play', await page.evaluate(() => !document.getElementById('d-howto').hidden));
await press('#d-howto-close');
for (const sel of ['#d-menu-btn', '#d-reset', '#d-staff']) {
  const p = await probe(sel);
  ok(`${sel} is on screen and nothing covers it`, p.visible && !p.covered, `covered by ${p.by}`);
}
const coda = await page.evaluate(() => window.DAILY.board.launch);
const cp = await tile(coda.x, coda.y);
const codaHit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.id, [cp.x, cp.y]);
ok('nothing covers Coda', codaHit === 'd-board', codaHit);
ok('there is no play button and no listen button', !(await page.$('#d-play')) && !(await page.$('#d-listen')));

const wraps = (x, y) => page.evaluate(([x, y]) => window.DAILY.board.pieceAt(x, y)?.wraps, [x, y]);
const w0 = await wraps(7, 10);
let t = await tile(7, 10);
await tap(t.x, t.y);
ok('a tap on a peg with an arrow winds it one turn', await wraps(7, 10) === (w0 + 1) % 4, `${w0} -> ${await wraps(7, 10)}`);

await page.evaluate(() => { window.played.length = 0; });
t = await tile(4, 6);
await tap(t.x, t.y);
const heard = await page.evaluate(() => ({ played: window.played, running: window.DAILY.board.running, moves: window.DAILY.board.moves }));
ok('a tap on a fixed string plays its note, unheard', heard.played.length === 1 && heard.played[0].family === 'strings' && !heard.played[0].heard, JSON.stringify(heard.played));
ok('and does not count as a touch', heard.moves === 1, `${heard.moves}`);

for (const [x, y] of [[7, 6], [7, 3]]) { t = await tile(x, y); await tap(t.x, t.y); }
// Tap Coda, at a tempo a test can wait for.
await page.evaluate(() => { window.DAILY.board.room.music.bpm = 900; window.played.length = 0; });
await tap(cp.x, cp.y);
await page.waitForFunction(() => !window.DAILY.board.running && window.DAILY.board.verdict, null, { timeout: 8000 }).catch(() => {});
const v = await page.evaluate(() => window.DAILY.board.verdict);
ok('a tap on Coda sends the wave, and it plays mi re do', v?.kind === 'solved', JSON.stringify(v));
const lit = await page.evaluate(() => document.querySelectorAll('#d-staff .on').length);
ok('the staff lights the notes the wave played', lit >= 3, `${lit} marks`);
await page.waitForSelector('#d-done:not([hidden])', { timeout: 3000 }).catch(() => {});
const card = await page.evaluate(() => ({ shown: !document.getElementById('d-done').hidden, text: document.getElementById('d-done-from').textContent }));
ok('the solved card names the song', card.shown && /Stay Warm/.test(card.text), JSON.stringify(card));
const notes = await page.evaluate(() => window.played.filter(p => p.family !== 'percussion'));
ok('the run\'s notes reach the speaker unheard by anything else', notes.length === 3 && notes.every(n => !n.heard), JSON.stringify(notes));
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ck-daily-v1') || '{}'));
ok('the day is remembered as solved', saved.days?.['day-01']?.solved === true, JSON.stringify(saved));
await press('#d-done-close');

// ---- the music: tap it to hear it -----------------------------------------------------
await page.evaluate(() => { window.played.length = 0; });
await press('#d-staff');
const tune = await page.evaluate(() => window.played);
ok('a tap on the music plays the tune, unheard', tune.length === 3 && tune.every(n => !n.heard), JSON.stringify(tune));

// ---- the gear: the days -------------------------------------------------------------
await press('#d-menu-btn');
ok('the gear opens the days', await page.evaluate(() => !document.getElementById('d-menu').hidden && document.querySelectorAll('#d-days .d-day').length === 10));
await press('#d-days .d-day:nth-child(3)');
ok('a day opens from there', await page.evaluate(() => window.DAILY.index === 2 && document.getElementById('d-menu').hidden));

// ---- day 3: a drum turns ----------------------------------------------------------------
console.log('day 3 by touch');
ok('after the first visit, a day opens straight onto the board', await page.evaluate(() => document.getElementById('d-howto').hidden));
const rot = (x, y) => page.evaluate(([x, y]) => window.DAILY.board.pieceAt(x, y)?.rot, [x, y]);
const r0 = await rot(3, 9);
t = await tile(3, 9);
await tap(t.x, t.y);
ok('a tap on a drum with an arrow turns it', await rot(3, 9) === (r0 + 90) % 360, `${r0} -> ${await rot(3, 9)}`);

// ---- day 4: a peg block slides along its string -----------------------------------------
console.log('day 4 by touch');
await open(4);
const from = await tile(5, 11);
const to = await tile(3, 11);
// The piece rides above the finger (so the finger does not hide it), and lands
// on the tile under the piece: a finger most of a tile below the target.
await drag(from, { x: to.x, y: to.y + to.s * 0.7 });
const row = await page.evaluate(() => [...Array(8)].map((_, x) => ({ taut: '=', tuningpeg: 'o' })[window.DAILY.board.pieceAt(x, 11)?.typeName] ?? '.').join(''));
ok('a finger slides a peg block along its string, and the string follows', row === 'o==o....', row);
t = await tile(3, 11);
await tap(t.x, t.y);
ok('a tap on a block that only slides leaves it where it is', await page.evaluate(() => window.DAILY.board.pieceAt(3, 11)?.typeName) === 'tuningpeg');

// ---- day 10: Coda aimed by a drag ---------------------------------------------------------
console.log('day 10 by touch');
await open(10);
const c10 = await page.evaluate(() => window.DAILY.board.launch);
const a = await tile(c10.x, c10.y);
await drag(a, { x: a.x, y: a.y - a.s * 1.5 });
const aimed = await page.evaluate(() => ({ ...window.DAILY.board.launch.dir, running: window.DAILY.board.running }));
ok('a finger dragged up from Coda aims him up, and does not play', aimed.x === 0 && aimed.y === -1 && !aimed.running, JSON.stringify(aimed));

// ---- the way in, from the title screen ----------------------------------------------------
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
