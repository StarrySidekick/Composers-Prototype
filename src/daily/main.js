// The daily page (daily.html): one board a day, ten days, Timothy's own tunes.
//
// docs/DAILY.md has the why. This file is the page: the day strip, the tune you
// are making, the board and the three buttons. The board itself (what a touch
// does, what the wave plays, whether it is the tune) is src/daily/board.js, and
// the page never decides any of that on its own.

import { AudioEngine } from '../audio/audio-engine.js';
import { AssetStore } from '../render/assets.js';
import { BeatClock } from '../core/beat-clock.js';
import { motifPitches } from '../music/motif.js';
import { renderStaff } from '../music/notation.js';
import { NOTE_NAMES } from '../core/music.js';
import { Board, SOLFEGE, handlesOf } from './board.js';
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
let playingTune = [];    // timers of the "listen" playback

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
const fmtDate = (d) => d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

function loadSave() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY) || '{}').days ? JSON.parse(localStorage.getItem(SAVE_KEY)) : { days: {} }; }
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
  $('d-play').addEventListener('click', play);
  $('d-listen').addEventListener('click', listen);
  $('d-reset').addEventListener('click', () => openDay(index, { keepTries: true }));
  $('d-help').addEventListener('click', () => { $('d-howto').hidden = !$('d-howto').hidden; });
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
  board.onNote = onNote;
  board.onToast = (m) => say(m);
  view.marks = [];
  $('d-play').disabled = false;
  $('d-done').hidden = true;
  $('d-locked').hidden = isOpen(i);
  history.replaceState(null, '', `?day=${i + 1}${strict ? '&strict' : ''}`);
  renderDays();
  renderTune();
  say(day.hint);
  fit();
}

// ---- the strip of days ------------------------------------------------------------

function renderDays() {
  const strip = $('d-days');
  strip.innerHTML = '';
  const today = todayIndex();
  DAYS.days.forEach((day, i) => {
    const b = document.createElement('button');
    b.className = 'd-day';
    b.textContent = String(i + 1);
    b.title = `Day ${i + 1}: ${fmtDate(dateOf(i))}`;
    if (i === index) b.classList.add('on');
    if (i === today) b.classList.add('today');
    if (save.days[day.id]?.solved) b.classList.add('solved');
    if (!isOpen(i)) b.classList.add('later');
    b.addEventListener('click', () => openDay(i));
    strip.appendChild(b);
  });
  const day = DAYS.days[index];
  const when = index === today ? 'today' : index > today ? `opens ${fmtDate(dateOf(index))}` : fmtDate(dateOf(index));
  $('d-when').textContent = `Day ${index + 1} · ${when}${index > today && !strict ? ' (open early)' : ''}`;
  $('d-title').textContent = day.title;
}

// ---- the tune ---------------------------------------------------------------------

function renderTune() {
  const day = DAYS.days[index];
  const m = day.motif;
  $('d-key').textContent = `${NOTE_NAMES[m.key.root]} ${m.key.mode}`;
  const chips = $('d-notes');
  chips.innerHTML = '';
  board.target.forEach((deg) => {
    const s = document.createElement('span');
    s.className = 'd-note';
    s.textContent = SOLFEGE[deg];
    chips.appendChild(s);
  });
  try {
    $('d-staff').innerHTML = renderStaff({ notes: motifPitches(m), bars: m.bars, key: m.key, width: Math.min(340, window.innerWidth - 32) });
  } catch (err) { $('d-staff').innerHTML = ''; console.warn('[staff]', err); }
}

function chip(i) { return $('d-notes').children[i]; }

function resetChips() {
  for (const c of $('d-notes').children) { c.className = 'd-note'; c.dataset.got = ''; }
}

// A note the wave played: light its chip, or mark it wrong.
function onNote(note, i, verdict) {
  const c = chip(i);
  const wrong = verdict?.kind === 'wrong' && verdict.at === i;
  view.marks.push({ x: note.x, y: note.y, ok: !wrong });
  if (!c) return;
  if (wrong) { c.classList.add('wrong'); c.dataset.got = SOLFEGE[note.degree]; }
  else c.classList.add('hit');
}

// "Listen": the tune as he wrote it, his rhythm, his tempo, on the grid.
function listen() {
  stopTune();
  audio.resume();
  const m = DAYS.days[index].motif;
  const sub = 60 / Math.max(70, Math.min(170, m.bpm)) / 4;
  const t0 = audio.now + 0.12;
  const notes = motifPitches(m);
  const tops = board.target.map(() => null);
  const starts = [...new Set(notes.map(n => n.start))].sort((a, b) => a - b);
  for (const n of notes) {
    audio.play({ family: m.family === 'timpani' ? 'keys' : m.family, midi: n.midi, intensity: 0.85, when: t0 + n.start * sub, heard: false });
  }
  starts.forEach((s, i) => {
    tops[i] = setTimeout(() => {
      const c = chip(i);
      if (!c) return;
      c.classList.add('sing');
      setTimeout(() => c.classList.remove('sing'), Math.max(120, sub * 1000 * 2));
    }, (t0 - audio.now + s * sub) * 1000);
  });
  playingTune = tops;
}

function stopTune() { playingTune.forEach(clearTimeout); playingTune = []; }

// ---- play ---------------------------------------------------------------------------

function play() {
  if (board.running) return;
  audio.resume();
  stopTune();
  resetChips();
  view.marks = [];
  clock.setBpm(board.room.music.bpm);
  clock.start();
  board.when = () => audio.now;
  board.fire();
  $('d-play').disabled = true;
  say('…');
}

function finished() {
  $('d-play').disabled = false;
  const v = board.verdict;
  const day = DAYS.days[index];
  if (v.kind === 'solved') {
    const prev = save.days[day.id];
    save.days[day.id] = {
      solved: true,
      tries: prev?.solved ? Math.min(prev.tries, board.tries) : board.tries,
      moves: prev?.solved ? Math.min(prev.moves, board.moves) : board.moves,
      at: new Date().toISOString(),
    };
    writeSave();
    renderDays();
    say('That is the tune.');
    setTimeout(showDone, 700);
    return;
  }
  const n = board.heard.length;
  if (v.kind === 'wrong') say(`The wave played ${SOLFEGE[v.got]} where the tune wants ${SOLFEGE[v.wanted]}.`);
  else if (v.kind === 'short') say(n ? `The wave stopped after ${n} of ${board.target.length} notes. Next comes ${SOLFEGE[v.wanted]}.` : `The wave played nothing. The tune starts on ${SOLFEGE[board.target[0]]}.`);
  else say('The wave went round in circles.');
}

function showDone() {
  const day = DAYS.days[index];
  const src = day.motif.source ?? {};
  $('d-done-title').textContent = `Day ${index + 1}: ${day.title}`;
  $('d-done-stats').textContent = `${board.tries} ${board.tries === 1 ? 'try' : 'tries'} · ${board.moves} ${board.moves === 1 ? 'touch' : 'touches'}`;
  $('d-done-from').innerHTML = '';
  const from = $('d-done-from');
  from.append('The tune is from ');
  const b = document.createElement('b'); b.textContent = src.title ?? 'your songbook'; from.append(b);
  if (src.album) from.append(`, on ${src.album}`);
  from.append(src.track ? ` (the ${src.track} line).` : '.');
  $('d-done-next').hidden = index >= DAYS.days.length - 1;
  $('d-done').hidden = false;
}

// ---- touch ----------------------------------------------------------------------------
//
// One finger: a tap turns or tunes what it lands on (or plays its note); a finger
// that moves more than a few pixels from a movable piece carries it, and lets go
// over the tile it should land on. Pointer events, so a mouse does the same.

function bindBoard() {
  const cv = $('d-board');
  let down = null;
  const tileAt = (e) => view.pick(e.clientX, e.clientY);
  const local = (e) => { const r = cv.getBoundingClientRect(); return { px: e.clientX - r.left, py: e.clientY - r.top }; };

  cv.addEventListener('pointerdown', (e) => {
    if (board.running) return;
    cv.setPointerCapture?.(e.pointerId);
    const t = tileAt(e);
    const piece = board.pieceAt(t.x, t.y);
    down = { t, piece, x: e.clientX, y: e.clientY, movable: !!piece && handlesOf(piece).move };
    e.preventDefault();
  });
  cv.addEventListener('pointermove', (e) => {
    if (!down) return;
    if (!view.drag && down.movable && Math.hypot(e.clientX - down.x, e.clientY - down.y) > DRAG_PX) {
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
    if (view.drag) {
      const { to, ok } = view.drag;
      view.drag = null;
      if (ok && board.move(down.t, to)) {
        clearRun();
        board.pieceAt(to.x, to.y)?.strike?.(0.35, board.ctx);
      }
    } else if (e.type === 'pointerup') {
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
  view.marks = [];
  resetChips();
}

// ---- layout and the frame loop -------------------------------------------------------------

// The board takes all the width it can, and the height left by the bars.
function fit() {
  const wrap = $('d-stage');
  const cv = $('d-board');
  const used = [...document.querySelectorAll('.d-fixed')].reduce((h, el) => h + el.offsetHeight, 0);
  const availH = window.innerHeight - used - 8;
  const availW = Math.min(wrap.clientWidth || window.innerWidth, 560);
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

function say(text) { $('d-hint').textContent = text || ''; }
