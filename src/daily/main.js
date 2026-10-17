// The daily page (daily.html): one board a day, ten days, ten tunes.
//
// docs/DAILY.md has the why. This file is the page: the tune as sheet music on
// top (tap it to hear it), the board under it (tap Coda, under its bottom-left
// tile, to play), the tempo top right, the days and the help behind the gear. The board itself (what a touch does, what the wave
// plays, whether it is the tune) is src/daily/board.js; the page never decides
// any of that on its own.

import { AudioEngine } from '../audio/audio-engine.js';
import { AssetStore } from '../render/assets.js';
import { BeatClock } from '../core/beat-clock.js';
import { motifPitches } from '../music/motif.js';
import { renderStaff } from '../music/notation.js';
import { Board, targetSpans, handlesOf, noteName } from './board.js';
import { TuningPeg } from './pieces.js';
import { BoardView } from './view.js';

const $ = (id) => document.getElementById(id);
const SAVE_KEY = 'ck-daily-v2';             // v2: the 8 x 8 boards (2026-10-17); v1 was the 8 x 14 ones
const SOUND_KEY = 'ck-sound-v1';          // the castle's sound choice, same device
const DEV_KEY = 'ck-dev-v1';              // the castle's developer mode, same device
const DAY_MS = 86400000;
const DRAG_PX = 10;                        // a finger that moves this far is dragging

const audio = new AudioEngine();
const assets = new AssetStore();
const params = new URLSearchParams(location.search);

let DAYS = null;
let index = 0;           // which day is open (0-based)
let board = null;
let view = null;
let clock = null;
let save = loadSave();
let dev = false;         // developer mode: the tempo buttons
let tuneTimers = [];     // the staff's playhead while the tune plays
let toastTimer = 0;

// ---- the calendar ------------------------------------------------------------
//
// Day 1 is the epoch in days.json; each day after opens one day later. For now
// every day is open (Timothy, 2026-10-15: "for testing purposes, we can play all
// 10 levels now"); `?strict` shows the calendar as players would get it.

const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const epochDate = () => { const [y, m, d] = DAYS.epoch.split('-').map(Number); return new Date(y, m - 1, d); };
const dateOf = (i) => new Date(epochDate().getTime() + i * DAY_MS);
const todayIndex = () => Math.round((midnight(new Date()) - epochDate()) / DAY_MS);
const strict = params.has('strict');
const isOpen = (i) => !strict || i <= todayIndex();
const fmtDate = (d, o = { weekday: 'short', month: 'short', day: 'numeric' }) => d.toLocaleDateString(undefined, o);

function loadSave() {
  try { const s = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}'); return s.days ? s : { days: {} }; }
  catch { return { days: {} }; }
}
function writeSave() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* private mode: fine */ }
}

// ---- boot -----------------------------------------------------------------------

export async function boot() {
  DAYS = await fetch('daily/days.json', { cache: 'no-cache' }).then(r => r.json());
  await assets.load();
  audio.loadSamples().catch(err => console.warn('[samples]', err));
  try { const s = localStorage.getItem(SOUND_KEY); if (s && s !== 'live') audio.setSound(s); } catch {}
  view = new BoardView($('d-board'), assets);
  clock = new BeatClock(audio.ctx);

  const want = Number(params.get('day'));
  const today = Math.max(0, Math.min(DAYS.days.length - 1, todayIndex()));
  openDay(want >= 1 && want <= DAYS.days.length ? want - 1 : today);

  bindBoard();
  $('d-staff').addEventListener('click', listen);
  $('d-reset').addEventListener('click', () => openDay(index, { keepTries: true }));
  $('d-menu-btn').addEventListener('click', () => { renderDays(); $('d-menu').hidden = false; });
  $('d-menu-close').addEventListener('click', () => { $('d-menu').hidden = true; });
  $('d-menu').addEventListener('click', (e) => { if (e.target === $('d-menu')) $('d-menu').hidden = true; });
  $('d-howto-open').addEventListener('click', () => { $('d-menu').hidden = true; $('d-howto').hidden = false; });
  $('d-howto-close').addEventListener('click', () => { $('d-howto').hidden = true; });
  $('d-names').addEventListener('change', (e) => { view.showLabels = e.target.checked; });
  try { dev = localStorage.getItem(DEV_KEY) === '1' || params.has('dev'); } catch { dev = params.has('dev'); }
  setDev(dev);
  $('d-dev').addEventListener('change', (e) => setDev(e.target.checked, true));
  $('d-slower').addEventListener('click', () => setBpm(board.room.music.bpm - 10));
  $('d-faster').addEventListener('click', () => setBpm(board.room.music.bpm + 10));
  $('d-done-next').addEventListener('click', () => { $('d-done').hidden = true; openDay(Math.min(index + 1, DAYS.days.length - 1)); });
  $('d-done-hear').addEventListener('click', listen);
  $('d-done-close').addEventListener('click', () => { $('d-done').hidden = true; });
  window.addEventListener('resize', fit);
  document.addEventListener('pointerdown', () => audio.resume(), { capture: true });

  // The first time on this device, how to play, before anything else.
  if (!save.seenHelp) {
    $('d-howto').hidden = false;
    save.seenHelp = true;
    writeSave();
  }

  // Console and test handle, like window.CK in the castle.
  window.DAILY = { get board() { return board; }, get index() { return index; }, openDay, play, listen, audio, view, get days() { return DAYS; } };
  requestAnimationFrame(frame);
}

function openDay(i, { keepTries = false } = {}) {
  stopTune();
  const tries = keepTries && board ? board.tries : 0;
  index = i;
  const day = DAYS.days[i];
  board = new Board(day, { audio });
  board.tries = tries;
  board.onNote = () => renderTune();
  board.onToast = (m) => say(m);
  view.marks = [];
  $('d-done').hidden = true;
  $('d-menu').hidden = true;
  $('d-locked').hidden = isOpen(i);
  history.replaceState(null, '', `?day=${i + 1}${strict ? '&strict' : ''}`);
  const today = todayIndex();
  $('d-when').textContent = `Day ${i + 1}${i === today ? ' · today' : ''}`;
  $('d-title').textContent = day.title;
  renderBpm();
  renderTune();
  say(day.hint, 6000);
  fit();
}

// ---- the tempo, top right ---------------------------------------------------------
//
// Each day has its own (day 1 at 100, five more a day). Developer mode adds ten
// slower and ten faster; that holds until another day is opened.

function setDev(on, remember = false) {
  dev = on;
  $('d-dev').checked = on;
  document.body.classList.toggle('dev', on);
  if (remember) try { localStorage.setItem(DEV_KEY, on ? '1' : '0'); } catch {}
}

function setBpm(bpm) {
  board.room.music.bpm = Math.max(40, Math.min(300, bpm));
  clock?.setBpm(board.room.music.bpm);
  renderBpm();
}

function renderBpm() { $('d-bpm-n').textContent = String(board.room.music.bpm); }

// ---- the days, behind the gear ---------------------------------------------------

function renderDays() {
  const grid = $('d-days');
  grid.innerHTML = '';
  const today = todayIndex();
  DAYS.days.forEach((day, i) => {
    const b = document.createElement('button');
    b.className = 'd-day';
    const n = document.createElement('b'); n.textContent = String(i + 1);
    const d = document.createElement('small'); d.textContent = fmtDate(dateOf(i), { month: 'short', day: 'numeric' });
    b.append(n, d);
    b.title = `Day ${i + 1}: ${day.title}, ${fmtDate(dateOf(i))}${i > today && !strict ? ' (open early)' : ''}`;
    if (i === index) b.classList.add('on');
    if (i === today) b.classList.add('today');
    if (save.days[day.id]?.solved) b.classList.add('solved');
    if (!isOpen(i)) b.classList.add('later');
    b.addEventListener('click', () => openDay(i));
    grid.appendChild(b);
  });
}

// ---- the tune: sheet music, lit as it is played ------------------------------------

// The staff, drawn for the day's kind of puzzle (Timothy, 2026-10-17): a
// melodic day shows the notes without their lengths, a rhythmic day the rhythm
// without pitch, an advanced day the whole score. Each note the wave has played
// turns green where it is right and red where it is not; the playhead lights
// the notes while the tune plays.
const SHOW = { melodic: 'pitch', rhythmic: 'rhythm', advanced: 'full' };
function renderTune(playStep = null) {
  const m = DAYS.days[index].motif;
  const spans = targetSpans(m);
  const marks = [];
  board.heard.forEach((h, i) => {
    const s = spans[i];
    if (s) marks.push({ ...s, cls: board.isRight(i) ? 'ok' : 'bad' });
  });
  const width = Math.max(240, Math.min(588, $('d-staff').clientWidth - 12 || 360));
  try {
    $('d-staff').innerHTML = renderStaff({ notes: motifPitches(m), bars: m.bars, key: m.key, width, playStep, marks, show: SHOW[board.kind] });
  } catch (err) { $('d-staff').innerHTML = ''; console.warn('[staff]', err); }
}

// Tap the music: the tune in its own rhythm, at the board's tempo, with a
// playhead across the staff.
function listen() {
  stopTune();
  audio.resume();
  const m = DAYS.days[index].motif;
  const sub = 60 / board.room.music.bpm / 4;
  const t0 = audio.now + 0.12;
  for (const n of motifPitches(m)) {
    audio.play({ family: m.family === 'timpani' ? 'keys' : m.family, midi: n.midi, intensity: 0.85, when: t0 + n.start * sub, heard: false });
  }
  const steps = m.bars * 16;
  const lead = (t0 - audio.now) * 1000;
  for (let s = 0; s <= steps; s++) {
    tuneTimers.push(setTimeout(() => renderTune(s < steps ? s : null), lead + s * sub * 1000));
  }
}

function stopTune() {
  if (tuneTimers.length && board) renderTune();
  tuneTimers.forEach(clearTimeout);
  tuneTimers = [];
}

// ---- play: tap Coda -------------------------------------------------------------

function play() {
  if (board.running) { board.stop(); finished(); return; }
  audio.resume();
  stopTune();
  view.marks = [];
  clock.setBpm(board.room.music.bpm);
  clock.start();
  board.when = () => audio.now;
  board.fire();
  renderTune();
  say('');
}

const named = (degree) => noteName(board.room.music.getNote(degree, 4), board.key);

function finished() {
  const v = board.verdict;
  const day = DAYS.days[index];
  for (const [i, h] of board.heard.entries()) {
    view.marks.push({ x: h.x, y: h.y, ok: board.isRight(i) });
  }
  renderTune();
  if (v?.kind === 'solved') {
    const prev = save.days[day.id];
    save.days[day.id] = {
      solved: true,
      tries: prev?.solved ? Math.min(prev.tries, board.tries) : board.tries,
      moves: prev?.solved ? Math.min(prev.moves, board.moves) : board.moves,
      at: new Date().toISOString(),
    };
    writeSave();
    say('That is the tune.', 3000);
    setTimeout(showDone, 700);
    return;
  }
  const n = board.heard.length;
  const circles = board.looped ? ' Then it went round in circles.' : '';
  const when = (off) => `${Math.abs(off)} ${Math.abs(off) === 1 ? 'sixteenth' : 'sixteenths'} ${off > 0 ? 'late' : 'early'}`;
  if (v?.kind === 'wrong' && board.kind !== 'melodic' && v.off && (board.kind === 'rhythmic' || v.got === v.wanted)) say(`Note ${v.at + 1} came ${when(v.off)}.${circles}`);
  else if (v?.kind === 'wrong') say(`Note ${v.at + 1} was ${named(v.got)}; the tune wants ${named(v.wanted)}.${circles}`);
  else if (v?.kind === 'short') say((n ? `The wave played ${n} of ${board.target.length} notes. Next comes ${named(v.wanted)}.` : `The wave played nothing. The tune starts on ${named(board.target[0])}.`) + circles);
  else if (v?.kind === 'long') say(`That was the whole tune, then ${v.extra} more ${v.extra === 1 ? 'note' : 'notes'}. The wave should stop after the last one.`);
  else if (v?.kind === 'stopped') say('Stopped.', 1500);
}

function showDone() {
  const day = DAYS.days[index];
  const src = day.motif.source ?? {};
  $('d-done-title').textContent = `Day ${index + 1}: ${day.title}`;
  $('d-done-stats').textContent = `${board.tries} ${board.tries === 1 ? 'try' : 'tries'} · ${board.moves} ${board.moves === 1 ? 'touch' : 'touches'}`;
  const from = $('d-done-from');
  from.innerHTML = '';
  from.append('The tune is from ');
  const b = document.createElement('b'); b.textContent = src.title ?? 'your songbook'; from.append(b);
  if (src.composer) from.append(`, ${src.composer}`);
  if (src.album) from.append(`, on ${src.album}`);
  from.append(src.track ? ` (the ${src.track} line).` : '.');
  $('d-done-next').hidden = index >= DAYS.days.length - 1;
  $('d-done').hidden = false;
}

// ---- touch ----------------------------------------------------------------------------
//
// One finger, any time, the wave in flight or not. On Coda: a tap plays, or
// stops the wave. On a piece: a tap turns, winds or tunes it (or plays its note).
// A finger that moves more than a few pixels from a movable piece takes it:
//   a peg on a block slides along its string's line as the finger goes, tile
//     by tile, and the string is laid again each tile, so it stays fastened;
//   anything else rides above the finger and lands on the tile under it.
// Pointer events, so a mouse does the same.

function bindBoard() {
  const cv = $('d-board');
  let down = null;
  const local = (e) => { const r = cv.getBoundingClientRect(); return { px: e.clientX - r.left, py: e.clientY - r.top }; };

  cv.addEventListener('pointerdown', (e) => {
    cv.setPointerCapture?.(e.pointerId);
    const t = view.pick(e.clientX, e.clientY);
    const coda = board.isLauncher(t.x, t.y);
    const piece = coda ? null : board.pieceAt(t.x, t.y);
    const movable = !!piece && handlesOf(piece).move;
    const held = movable && piece instanceof TuningPeg ? board.strung(piece) : null;
    down = { t, piece, coda, x: e.clientX, y: e.clientY, movable, axis: held?.string.axis ?? null, slid: false };
    e.preventDefault();
  });
  cv.addEventListener('pointermove', (e) => {
    if (!down || !down.movable) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    if (!down.dragging && Math.hypot(dx, dy) <= DRAG_PX) return;
    down.dragging = true;
    const s = view.tile;
    if (down.axis) {
      // A peg: follow the finger along the string's line, one tile at a time.
      const at = view.pick(e.clientX, e.clientY);
      const want = down.axis === 'h' ? at.x : at.y;
      for (let guard = 0; guard < 16; guard++) {
        const cur = down.axis === 'h' ? down.t.x : down.t.y;
        if (cur === want) break;
        const step = Math.sign(want - cur);
        const to = down.axis === 'h' ? { x: down.t.x + step, y: down.t.y } : { x: down.t.x, y: down.t.y + step };
        if (!board.move(down.t, to, { count: !down.slid })) break;
        down.t = to;
        if (!down.slid && !board.running) clearRun();
        down.slid = true;
      }
      view.lift = down.piece;
    } else {
      if (!view.drag) view.drag = { piece: down.piece, from: down.t, at: local(e), to: null, ok: false };
      view.drag.at = local(e);
      // The piece rides above the finger, so the tile it lands on is the one under it.
      const to = view.pick(e.clientX, e.clientY - s * 0.4);
      view.drag.to = board.room.inBounds(to.x, to.y) ? to : null;
      view.drag.ok = !!view.drag.to && board.canMove(down.t, view.drag.to);
    }
    e.preventDefault();
  });
  const up = (e) => {
    if (!down) return;
    view.lift = null;
    if (down.coda) {
      if (e.type === 'pointerup') play();
    } else if (down.slid) {
      board.preview(down.piece);
    } else if (view.drag) {
      const { to, ok } = view.drag;
      view.drag = null;
      if (ok && board.move(down.t, to)) {
        if (!board.running) clearRun();
        const p = board.pieceAt(to.x, to.y);
        if (p) board.preview(p);
      }
    } else if (e.type === 'pointerup' && !down.dragging) {
      const what = board.tap(down.t.x, down.t.y);
      if ((what === 'turn' || what === 'tune') && !board.running) clearRun();
    }
    down = null;
  };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
}

// The board changed: the last run's trail and marks no longer describe it.
function clearRun() {
  board.trail = [];
  board.heard = [];
  board.verdict = null;
  view.marks = [];
  renderTune();
}

// ---- layout and the frame loop -------------------------------------------------------------

// The board runs edge to edge (Timothy, 2026-10-17), as tall as that makes it,
// with one row more under it for Coda; the height left by the bar and the tune
// only limits it on a short screen.
function fit() {
  const wrap = $('d-stage');
  const cv = $('d-board');
  const used = [...document.querySelectorAll('.d-fixed')].reduce((h, el) => h + el.offsetHeight, 0);
  const availH = window.innerHeight - used - 4;
  const availW = Math.min(wrap.clientWidth || window.innerWidth, 600);
  const rows = board.room.height + 1;
  const tile = Math.max(24, Math.min(availW / board.room.width, availH / rows));
  cv.style.width = `${tile * board.room.width}px`;
  cv.style.height = `${tile * rows}px`;
  view.resize(board.room);
}

function frame() {
  if (board.running) {
    for (const ev of clock.poll()) {
      board.when = () => ev.time;
      if (!board.tick()) { finished(); break; }
    }
  }
  view.draw(board, clock);
  requestAnimationFrame(frame);
}

// A line over the bottom of the board. With `ms`, it goes after that long.
function say(text, ms = 0) {
  const t = $('d-toast');
  clearTimeout(toastTimer);
  t.textContent = text || '';
  t.classList.toggle('on', !!text);
  if (text && ms) toastTimer = setTimeout(() => t.classList.remove('on'), ms);
}
