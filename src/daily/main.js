// The daily page (daily.html): one board a day, ten days, Timothy's own tunes.
//
// docs/DAILY.md has the why. This file is the page: the tune as sheet music on
// top (tap it to hear it), the board under it (tap Coda to play), the days and
// the help behind the gear. The board itself (what a touch does, what the wave
// plays, whether it is the tune) is src/daily/board.js; the page never decides
// any of that on its own.

import { AudioEngine } from '../audio/audio-engine.js';
import { AssetStore } from '../render/assets.js';
import { BeatClock } from '../core/beat-clock.js';
import { motifPitches } from '../music/motif.js';
import { renderStaff } from '../music/notation.js';
import { Board, targetSpans, handlesOf, noteName } from './board.js';
import { BoardView } from './view.js';

const $ = (id) => document.getElementById(id);
const SAVE_KEY = 'ck-daily-v1';
const SOUND_KEY = 'ck-sound-v1';          // the castle's sound choice, same device
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
  renderTune();
  say(day.hint, 6000);
  fit();
}

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

// The staff, with the notes the wave has played lit ('on') and a wrong one dimmed
// ('no'), or the playhead while the tune plays.
function renderTune(playStep = null) {
  const m = DAYS.days[index].motif;
  const spans = targetSpans(m);
  const marks = [];
  board.heard.forEach((h, i) => {
    const s = spans[i];
    if (!s) return;
    const wrong = board.verdict?.kind === 'wrong' && board.verdict.at === i;
    marks.push({ ...s, cls: wrong ? 'no' : 'on' });
  });
  const width = Math.max(240, Math.min(588, $('d-staff').clientWidth - 12 || 360));
  try {
    $('d-staff').innerHTML = renderStaff({ notes: motifPitches(m), bars: m.bars, key: m.key, width, playStep, marks });
  } catch (err) { $('d-staff').innerHTML = ''; console.warn('[staff]', err); }
}

// Tap the music: the tune as he wrote it, his rhythm, his tempo, on the grid,
// with a playhead across the staff.
function listen() {
  stopTune();
  audio.resume();
  const m = DAYS.days[index].motif;
  const sub = 60 / Math.max(70, Math.min(170, m.bpm)) / 4;
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
    view.marks.push({ x: h.x, y: h.y, ok: !(v?.kind === 'wrong' && v.at === i) });
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
  if (v?.kind === 'wrong') say(`The wave played ${named(v.got)} where the tune wants ${named(v.wanted)}.`);
  else if (v?.kind === 'short') say(n ? `The wave stopped after ${n} of ${board.target.length} notes. Next comes ${named(v.wanted)}.` : `The wave played nothing. The tune starts on ${named(board.target[0])}.`);
  else if (v?.kind === 'stopped') say('Stopped.', 1500);
  else say('The wave went round in circles.');
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
  if (src.album) from.append(`, on ${src.album}`);
  from.append(src.track ? ` (the ${src.track} line).` : '.');
  $('d-done-next').hidden = index >= DAYS.days.length - 1;
  $('d-done').hidden = false;
}

// ---- touch ----------------------------------------------------------------------------
//
// One finger. On Coda: a tap plays (or stops); on a day that lets him turn, a drag
// aims him. On a piece: a tap turns, winds or tunes it (or plays its note); a
// finger that moves more than a few pixels from a movable piece carries it and
// lets go over the tile it should land on. Pointer events, so a mouse does the same.

function bindBoard() {
  const cv = $('d-board');
  let down = null;
  const local = (e) => { const r = cv.getBoundingClientRect(); return { px: e.clientX - r.left, py: e.clientY - r.top }; };

  cv.addEventListener('pointerdown', (e) => {
    cv.setPointerCapture?.(e.pointerId);
    const t = view.pick(e.clientX, e.clientY);
    const coda = board.isLauncher(t.x, t.y);
    const piece = coda ? null : board.pieceAt(t.x, t.y);
    down = { t, piece, coda, x: e.clientX, y: e.clientY, movable: !board.running && !!piece && handlesOf(piece).move };
    e.preventDefault();
  });
  cv.addEventListener('pointermove', (e) => {
    if (!down) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    const far = Math.hypot(dx, dy) > DRAG_PX * 2;
    if (down.coda && far && !board.running && board.launch.can.includes('turn')) {
      down.aim = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      view.aiming = down.aim;
    }
    if (!view.drag && down.movable && Math.hypot(dx, dy) > DRAG_PX) {
      view.drag = { piece: down.piece, from: down.t, at: local(e), to: null, ok: false };
    }
    if (view.drag) {
      view.drag.at = local(e);
      // The piece rides above the finger, so the tile it lands on is the one under it.
      const s = view.tile;
      const to = view.pick(e.clientX, e.clientY - s * 0.4);
      view.drag.to = board.room.inBounds(to.x, to.y) ? to : null;
      view.drag.ok = !!view.drag.to && board.canMove(down.t, view.drag.to);
    }
    e.preventDefault();
  });
  const up = (e) => {
    if (!down) return;
    view.aiming = null;
    if (down.coda) {
      if (down.aim) { if (board.aim(down.aim)) clearRun(); }
      else if (e.type === 'pointerup') play();
    } else if (view.drag) {
      const { to, ok } = view.drag;
      view.drag = null;
      if (ok && board.move(down.t, to)) {
        clearRun();
        const p = board.pieceAt(to.x, to.y);
        if (p) board.preview(p);
      }
    } else if (e.type === 'pointerup' && !board.running) {
      const what = board.tap(down.t.x, down.t.y);
      if (what === 'turn' || what === 'tune') clearRun();
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

// The board takes all the width it can, and the height left by the bar and the tune.
function fit() {
  const wrap = $('d-stage');
  const cv = $('d-board');
  const used = [...document.querySelectorAll('.d-fixed')].reduce((h, el) => h + el.offsetHeight, 0);
  const availH = window.innerHeight - used - 4;
  const availW = Math.min(wrap.clientWidth || window.innerWidth, 600);
  const tile = Math.max(24, Math.floor(Math.min(availW / board.room.width, availH / board.room.height)));
  cv.style.width = `${tile * board.room.width}px`;
  cv.style.height = `${tile * board.room.height}px`;
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
