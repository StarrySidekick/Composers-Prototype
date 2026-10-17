/* Composer's Key — can a thumb play the daily board?
   ---------------------------------------------------------------------
   test/daily.mjs proves every board by calling Board.tap and Board.move. This
   proves a finger reaches them: a 390 x 844 phone, real touch events (Chrome's
   Input.dispatchTouchEvent) at the centre of each tile and button as it is laid
   out, the way test/controls.mjs holds the castle's.

     - the first visit opens how to play; after that a day opens on the board
     - nothing covers the gear, the tempo, the reset, the music or Coda, who
       stands under the bottom-left tile; the board runs edge to edge
     - the floor has the grid along the tiles' edges and nothing inside a tile
     - a melodic day's staff shows the notes without lengths; a wrong run turns
       notes red and the right one green
     - tapping a peg winds it; tapping a drum turns it; a fixed string plays its
       note unheard and costs no touch
     - tapping Coda plays: day 1 solved by touch lights the staff and shows the
       card naming the song
     - tapping the music plays the tune, unheard, at the day's tempo
     - the tempo reads 100 on day 1, 110 on day 3; developer mode adds ten
       slower and ten faster
     - the gear opens the ten days, and a day opens from there
     - a finger slides a peg block along its string, and the string is laid
       again under the finger, tile by tile, before the finger lets go
     - a finger turns a drum while the wave is in flight, in time, and that is
       what solves day 10
     - a string, plucked, is about as loud as a horn
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

// The centre of a board tile on the screen (row 8 is Coda's, under the board).
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
const tapTile = async (x, y, times = 1) => { const t = await tile(x, y); for (let i = 0; i < times; i++) await tap(t.x, t.y); };
const press = async (sel) => { const p = await probe(sel); await tap(p.x, p.y); };
const solution = () => page.evaluate(() => window.DAILY.days.days[window.DAILY.index].solution);

// ---- day 1: wind, play, solve ----------------------------------------------------
console.log('day 1 by touch');
await open(1);
ok('the first visit opens how to play', await page.evaluate(() => !document.getElementById('d-howto').hidden));
await press('#d-howto-close');
for (const sel of ['#d-menu-btn', '#d-bpm', '#d-reset', '#d-staff']) {
  const p = await probe(sel);
  ok(`${sel} is on screen and nothing covers it`, p.visible && !p.covered, `covered by ${p.by}`);
}
const coda = await page.evaluate(() => window.DAILY.board.launch);
ok('Coda stands under the bottom-left tile', coda.x === 0 && coda.y === 8, JSON.stringify(coda));
const edge = await page.evaluate(() => { const r = document.getElementById('d-board').getBoundingClientRect(); return { left: r.left, right: r.right, vw: innerWidth }; });
ok('the board runs edge to edge', Math.abs(edge.left) < 1 && Math.abs(edge.right - edge.vw) < 1, JSON.stringify(edge));
const cp = await tile(coda.x, coda.y);
const codaHit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.id, [cp.x, cp.y]);
ok('nothing covers Coda', codaHit === 'd-board', codaHit);
ok('there is no play button and no listen button', !(await page.$('#d-play')) && !(await page.$('#d-listen')));

// The floor: the grid along the tiles' edges, and inside a tile one colour.
// Two empty tiles side by side: a line down their shared edge, nothing across
// either of them, at a quarter and half way down. Measured on day 1 emptied,
// since a real board is too full of blocks to have two empty tiles side by side.
await page.evaluate(() => {
  const d = window.DAILY.days.days[0];
  window.__saved = { layout: d.layout, overrides: d.overrides };
  d.layout = d.layout.map(r => '.'.repeat(r.length)); d.overrides = [];
  window.DAILY.openDay(0);
});
await page.waitForTimeout(300);
const floor = await page.evaluate(() => {
  const { board, view } = window.DAILY;
  const cv = document.getElementById('d-board');
  const c = cv.getContext('2d');
  const k = cv.width / cv.getBoundingClientRect().width;
  const px = (u) => Math.round((view.ox + u * view.tile) * k);
  const py = (v) => Math.round((view.oy + v * view.tile) * k);
  const rgb = (d, i) => `${d[i]},${d[i + 1]},${d[i + 2]}`;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 7; x++) {
    if (board.pieceAt(x, y) || board.pieceAt(x + 1, y)) continue;
    const inside = new Set();
    for (const v of [y + 0.25, y + 0.5]) {
      for (const u0 of [x, x + 1]) {
        const row = c.getImageData(px(u0 + 0.15), py(v), px(u0 + 0.85) - px(u0 + 0.15), 1).data;
        for (let i = 0; i < row.length; i += 4) inside.add(rgb(row, i));
      }
    }
    for (const u of [x + 0.25, x + 0.5]) {
      const col = c.getImageData(px(u), py(y + 0.15), 1, py(y + 0.85) - py(y + 0.15)).data;
      for (let i = 0; i < col.length; i += 4) inside.add(rgb(col, i));
    }
    const line = c.getImageData(px(x + 1), py(y + 0.5), 1, 1).data;
    return { at: [x, y], inside: [...inside], line: rgb(line, 0) };
  }
  return null;
});
ok('inside a tile the floor is one colour: nothing runs through it', floor && floor.inside.length === 1, JSON.stringify(floor));
ok('and the grid runs along the tiles\' edges', floor && floor.line !== floor.inside[0], JSON.stringify(floor));
await page.evaluate(() => { Object.assign(window.DAILY.days.days[0], window.__saved); window.DAILY.openDay(0); });

const staffStems = await page.evaluate(() => document.querySelectorAll('#d-staff line.st').length);
const staffHeads = await page.evaluate(() => document.querySelectorAll('#d-staff ellipse').length);
ok('a melodic day\'s staff: seven notes, no stems', staffHeads === 7 && staffStems === 0, `${staffHeads} heads, ${staffStems} stems`);

// As it stands the board is wrong: a run turns the staff's notes red where they
// are wrong (and green where right).
await page.evaluate(() => { window.DAILY.board.room.music.bpm = 900; });
await tap((await tile(0, 8)).x, (await tile(0, 8)).y);
await page.waitForFunction(() => !window.DAILY.board.running && window.DAILY.board.verdict, null, { timeout: 8000 }).catch(() => {});
const red = await page.evaluate(() => [...document.querySelectorAll('#d-staff ellipse')].filter(e => getComputedStyle(e).fill === 'rgb(248, 81, 73)').length);
ok('a wrong run turns its wrong notes red', red > 0, `${red} red`);
await page.evaluate(() => { window.DAILY.openDay(0); window.played = []; });

ok('the tempo reads 100 on day 1', await page.textContent('#d-bpm-n') === '100');
ok('the tempo buttons are hidden out of developer mode', await page.evaluate(() => getComputedStyle(document.getElementById('d-faster')).display === 'none'));

const sol1 = await solution();
const [px, py] = sol1[0].tap;
const wraps = (x, y) => page.evaluate(([x, y]) => window.DAILY.board.pieceAt(x, y)?.wraps, [x, y]);
const w0 = await wraps(px, py);
await tapTile(px, py);
ok('a tap on a peg with an arrow winds it one turn', await wraps(px, py) === (w0 + 1) % 4, `${w0} -> ${await wraps(px, py)}`);

const str = await page.evaluate(() => { const s = window.DAILY.board.room.list.find(d => d.typeName === 'taut'); return [s.x, s.y]; });
await page.evaluate(() => { window.played.length = 0; });
await tapTile(...str);
const heard = await page.evaluate(() => ({ played: window.played, moves: window.DAILY.board.moves }));
ok('a tap on a fixed string plays its note, unheard', heard.played.length === 1 && heard.played[0].family === 'strings' && !heard.played[0].heard, JSON.stringify(heard.played));
ok('and does not count as a touch', heard.moves === 1, `${heard.moves}`);

// The rest of the answer, by touch.
for (const [i, t] of sol1.entries()) await tapTile(...t.tap, i === 0 ? t.times - 1 : t.times);
// Tap Coda, at a tempo a test can wait for.
await page.evaluate(() => { window.DAILY.board.room.music.bpm = 900; window.played.length = 0; });
await tap(cp.x, cp.y);
await page.waitForFunction(() => !window.DAILY.board.running && window.DAILY.board.verdict, null, { timeout: 8000 }).catch(() => {});
const v = await page.evaluate(() => window.DAILY.board.verdict);
ok('a tap on Coda sends the wave, and it plays Mary Had a Little Lamb', v?.kind === 'solved', JSON.stringify(v));
const green = await page.evaluate(() => [...document.querySelectorAll('#d-staff ellipse')].filter(e => getComputedStyle(e).fill === 'rgb(63, 185, 80)').length);
ok('the staff turns every note the wave played green', green === 7, `${green} green`);
await page.waitForSelector('#d-done:not([hidden])', { timeout: 3000 }).catch(() => {});
const card = await page.evaluate(() => ({ shown: !document.getElementById('d-done').hidden, text: document.getElementById('d-done-from').textContent }));
ok('the solved card names the song', card.shown && /Mary Had a Little Lamb/.test(card.text), JSON.stringify(card));
const notes = await page.evaluate(() => window.played.filter(p => p.family !== 'percussion'));
ok('the run\'s notes reach the speaker unheard by anything else', notes.length === 7 && notes.every(n => !n.heard), JSON.stringify(notes));
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ck-daily-v2') || '{}'));
ok('the day is remembered as solved', saved.days?.mary?.solved === true, JSON.stringify(saved));
await press('#d-done-close');

// ---- the music: tap it to hear it -----------------------------------------------------
await page.evaluate(() => { window.played.length = 0; });
await press('#d-staff');
const tune = await page.evaluate(() => window.played);
ok('a tap on the music plays the tune, unheard', tune.length === 7 && tune.every(n => !n.heard), JSON.stringify(tune));

// ---- the gear: the days, and developer mode ---------------------------------------------
await press('#d-menu-btn');
ok('the gear opens the days', await page.evaluate(() => !document.getElementById('d-menu').hidden && document.querySelectorAll('#d-days .d-day').length === 10));
await press('#d-dev');
await press('#d-days .d-day:nth-child(3)');
ok('a day opens from there', await page.evaluate(() => window.DAILY.index === 2 && document.getElementById('d-menu').hidden));

// ---- day 3: the tempo, and a drum turns --------------------------------------------------
console.log('day 3 by touch');
ok('after the first visit, a day opens straight onto the board', await page.evaluate(() => document.getElementById('d-howto').hidden));
ok('the tempo reads 110 on day 3', await page.textContent('#d-bpm-n') === '110');
await press('#d-faster');
const faster = await page.evaluate(() => [document.getElementById('d-bpm-n').textContent, window.DAILY.board.room.music.bpm]);
await press('#d-slower'); await press('#d-slower');
const slower = await page.evaluate(() => [document.getElementById('d-bpm-n').textContent, window.DAILY.board.room.music.bpm]);
ok('developer mode: ten faster, then ten slower, and the board follows', faster.join() === '120,120' && slower.join() === '100,100', `${faster} / ${slower}`);

// Day 3's answer is all drums turned.
const drum = (await solution()).find(t => t.tap);
const rot = (x, y) => page.evaluate(([x, y]) => window.DAILY.board.pieceAt(x, y)?.rot, [x, y]);
const r0 = await rot(...drum.tap);
await tapTile(...drum.tap);
ok('a tap on a drum with an arrow turns it', await rot(...drum.tap) === (r0 + 90) % 360, `${r0} -> ${await rot(...drum.tap)}`);

// ---- day 4: a peg block slides along its string, fastened to it --------------------------
console.log('day 4 by touch');
await open(4);
const slide = (await solution()).find(t => t.move);
const [[fx, fy], [tx, ty]] = slide.move;
const a = await tile(fx, fy), b = await tile(tx, ty);
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y }] });
for (let i = 1; i <= 8; i++) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a.x + (b.x - a.x) * i / 8, y: a.y + (b.y - a.y) * i / 8 }] });
  await page.waitForTimeout(16);
}
// Before the finger lets go: the peg is already there, and its string reaches it.
const mid = await page.evaluate(([tx, ty]) => {
  const board = window.DAILY.board;
  const peg = board.pieceAt(tx, ty);
  const held = peg && board.strung(peg);
  return { peg: peg?.typeName, strung: !!held, tiles: held?.run.tiles.length };
}, [tx, ty]);
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await page.waitForTimeout(60);
ok('a peg block under a finger slides along its string, and the string stays fastened to it', mid.peg === 'tuningpeg' && mid.strung, JSON.stringify(mid));
ok('one slide is one touch', await page.evaluate(() => window.DAILY.board.moves) === 1);

// ---- day 10: a drum turned in flight -----------------------------------------------------
console.log('day 10 by touch');
await open(10);
const sol10 = await solution();
const timed = sol10.find(t => t.at != null);
// Everything before the wave goes (that is day 4's business), then Coda, then
// the drum, by finger, once the wave has gone past it.
await page.evaluate(async () => {
  const { applySolution } = await import('./src/daily/board.js');
  applySolution(window.DAILY.board, window.DAILY.days.days[9].solution);
  window.DAILY.board.room.music.bpm = 100;
});
const c10 = await tile(0, 8);
await tap(c10.x, c10.y);
await page.waitForFunction((at) => window.DAILY.board.step >= at, timed.at, { timeout: 15000 }).catch(() => {});
const inFlight = await page.evaluate(() => window.DAILY.board.running);
await tapTile(...timed.tap, timed.times);
await page.waitForFunction(() => !window.DAILY.board.running, null, { timeout: 20000 }).catch(() => {});
const v10 = await page.evaluate(() => ({ verdict: window.DAILY.board.verdict, heard: window.DAILY.board.heard.length }));
ok('a finger turns a drum while the wave is in flight, and it solves Ode to Joy', inFlight && v10.verdict?.kind === 'solved', JSON.stringify(v10));

// ---- a string is as loud as a horn -------------------------------------------------------
// Rendered offline through the real engine: the loudness of the first 300 ms.
const loud = await page.evaluate(async () => {
  const { AudioEngine } = await import('./src/audio/audio-engine.js');
  const music = window.DAILY.board.room.music;
  const rms = async (o) => {
    const sr = 44100, off = new OfflineAudioContext(1, sr, sr);
    const Real = window.AudioContext; window.AudioContext = function () { return off; };
    let e; try { e = new AudioEngine(); } finally { window.AudioContext = Real; }
    e.setSound('synth');
    e.play({ ...o, intensity: 1, when: 0.05, heard: false });
    const d = (await off.startRendering()).getChannelData(0);
    let sq = 0; const a = Math.round(0.05 * sr), z = Math.round(0.35 * sr);
    for (let i = a; i < z; i++) sq += d[i] * d[i];
    return Math.sqrt(sq / (z - a));
  };
  const out = {};
  for (const oct of [3, 4, 5]) out[`strings ${oct}`] = await rms({ family: 'strings', midi: music.getNote(2, oct), sampled: false });
  out.brass = await rms({ family: 'brass', midi: music.getNote(2, 4) });
  return out;
});
const db = (x) => 20 * Math.log10(x / loud.brass);
ok('a string, plucked, is within 6 dB of a horn in every register', ['strings 3', 'strings 4', 'strings 5'].every(k => Math.abs(db(loud[k])) <= 6),
  Object.entries(loud).map(([k, x]) => `${k} ${db(x).toFixed(1)} dB`).join(', '));

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
