// The motif writer: tap notes onto a grid of scale degrees, see them as sheet
// music, hear them through the game's instruments, and take them into the game.
//
// The grid's rows are DEGREES of the chosen key, not piano keys: do, re, mi up
// two octaves, and a la and ti below. So there is no wrong note to tap, the same
// rule the game is built on (CLAUDE.md, "Everything a doodad plays is snapped to
// the room's scale"). Change the key or the mode and the tune keeps its shape
// and takes on the new colour, as it would crossing into another area.

import { MODE_NAMES, NOTE_NAMES } from '../../core/music.js';
import { AudioEngine } from '../../audio/audio-engine.js';
import { MODE_MOOD } from '../key.js';
import { renderStaff, spell } from '../notation.js';
import { FAMILIES, newMotif, motifState, motifPitches, motifToLayer, motifToCue, motifToSequence, motifToMidi } from '../motif.js';
import { h, options, toast, copyText, saveFile, confirmButton } from './ui.js';

const SOLFEGE = ['do', 're', 'mi', 'fa', 'sol', 'la', 'ti'];
const TOP = 14, BOTTOM = -2;                 // degrees shown, high to low
const ROWS = TOP - BOTTOM + 1;
const CW = 20, CH = 22, LABW = 54;           // cell width and height, label column
const PENS = [[1, '16th', '♬'], [2, '8th', '♪'], [4, 'quarter', '♩'], [8, 'half', '𝅗𝅥']];

export function createWriter({ store, player, getAudio }) {
  let m = newMotif();
  let pen = 2;
  let click = false;
  let cursor = { row: TOP, col: 0 };
  let saved = [];
  let playStep = null;

  // ---- controls ----
  const name = h('input', { id: 'w-name', type: 'text', value: m.name, 'aria-label': 'Motif name', maxlength: 60 });
  const root = options(h('select', { id: 'w-root' }), NOTE_NAMES.map((n, i) => [i, n]));
  const mode = options(h('select', { id: 'w-mode' }), MODE_NAMES.map(n => [n, `${n} · ${MODE_MOOD[n]}`]));
  const bpm = h('input', { id: 'w-bpm', type: 'number', min: 40, max: 240, step: 1, inputmode: 'numeric' });
  const bars = options(h('select', { id: 'w-bars' }), [[1, '1'], [2, '2'], [4, '4'], [8, '8']]);
  const family = options(h('select', { id: 'w-family' }), FAMILIES.map(f => [f, f]));
  const octave = options(h('select', { id: 'w-octave' }), [2, 3, 4, 5, 6].map(o => [o, String(o)]));
  const sound = options(h('select', { id: 'w-sound' }), AudioEngine.SOUNDS.map(s => [s, s]), 'live');

  const playBtn = h('button', { class: 'primary', type: 'button', id: 'w-play' }, 'Play');
  const clickBtn = h('button', { type: 'button', 'aria-pressed': 'false', id: 'w-click' }, 'Click');
  const penSeg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Note length' },
    PENS.map(([len, label, glyph]) => h('button', { type: 'button', 'data-len': len, 'aria-pressed': String(len === pen), title: label, 'aria-label': `${label} notes` },
      h('span', { class: 'note-glyph' }, glyph), ' ', label)));

  const sheet = h('div', { class: 'sheet', id: 'w-sheet' });
  const caption = h('div', { class: 'caption', id: 'w-caption' });
  const labels = h('div', { class: 'labels', style: `position:sticky;left:0;z-index:2;width:${LABW}px;flex:none` });
  const area = h('div', { class: 'area', tabindex: '0', role: 'grid', 'aria-label': 'Notes: rows are scale degrees, columns sixteenths. Arrow keys move, Space places or removes a note.', style: 'position:relative;flex:none;outline-offset:-2px' });
  const gridWrap = h('div', { class: 'grid-wrap' }, h('div', { class: 'grid', style: 'display:flex' }, labels, area));
  const out = h('pre', { class: 'code', id: 'w-out', hidden: true });
  const outHead = h('div', { class: 'out-head', hidden: true });
  const savedList = h('div', { class: 'list', id: 'w-saved' });
  const savedCount = h('span', { class: 'count' });

  const el = h('section', { id: 'writer', class: 'writer', style: 'display:grid;gap:12px' },
    h('div', { class: 'row' },
      h('label', { class: 'field grow' }, 'Motif', name),
      h('button', { type: 'button', id: 'w-save', onclick: save }, 'Save'),
      h('button', { type: 'button', class: 'quiet', onclick: () => load(newMotif({ key: { ...m.key }, bpm: m.bpm, family: m.family, octave: m.octave })) }, 'New')),
    h('div', { class: 'row' },
      h('label', { class: 'field' }, 'Key', root),
      h('label', { class: 'field' }, 'Mode · mood', mode),
      h('label', { class: 'field' }, 'Tempo', bpm),
      h('label', { class: 'field' }, 'Bars', bars),
      h('label', { class: 'field' }, 'Voice', family),
      h('label', { class: 'field' }, 'Octave', octave),
      h('label', { class: 'field' }, 'Sound', sound)),
    sheet, caption,
    h('div', { class: 'row' }, playBtn, clickBtn, penSeg,
      confirmButton('Clear', 'Clear every note?', () => { m.notes = []; render(); })),
    gridWrap,
    h('div', { class: 'row' },
      h('button', { type: 'button', id: 'w-layer', onclick: () => give('score layer', JSON.stringify(motifToLayer(m))) }, 'Copy as score layer'),
      h('button', { type: 'button', onclick: () => give('cue', JSON.stringify(motifToCue(m))) }, 'Copy as cue'),
      h('button', { type: 'button', id: 'w-lock', onclick: () => {
        const { sequence, collapsed } = motifToSequence(m);
        give(`lock phrase${collapsed ? ` (${collapsed} repeated note${collapsed > 1 ? 's' : ''} taken out: a lock does not hear a repeat)` : ''}`, `"sequence": ${JSON.stringify(sequence)}`);
      } }, 'Copy as lock phrase'),
      h('button', { type: 'button', onclick: () => give('motif, for Claude or another songbook', JSON.stringify(m)) }, 'Copy motif'),
      h('button', { type: 'button', id: 'w-mid', onclick: () => saveFile(fileName(m.name) + '.mid', motifToMidi(m)) }, 'Save .mid')),
    outHead, out,
    h('div', { class: 'section-head' }, h('h2', {}, 'Saved motifs'), savedCount),
    savedList);

  // ---- wiring ----
  const settings = () => {
    m.key = { root: +root.value, mode: mode.value };
    m.bpm = Math.max(40, Math.min(240, Math.round(+bpm.value || 110)));
    m.bars = +bars.value;
    m.family = family.value;
    m.octave = +octave.value;
    if (player.playing) play();
    render();
  };
  for (const s of [root, mode, bars, family, octave]) s.addEventListener('change', settings);
  bpm.addEventListener('change', settings);
  name.addEventListener('input', () => { m.name = name.value.trim() || 'untitled motif'; renderCaption(); });
  sound.addEventListener('change', async () => { (await getAudio()).setSound(sound.value); });
  playBtn.addEventListener('click', () => player.playing && player.owner === 'writer' ? player.stop() : play());
  clickBtn.addEventListener('click', () => {
    click = !click;
    clickBtn.setAttribute('aria-pressed', String(click));
    if (player.playing && player.owner === 'writer') play();
  });
  penSeg.addEventListener('click', e => {
    const b = e.target.closest('button[data-len]');
    if (!b) return;
    pen = +b.dataset.len;
    for (const x of penSeg.children) x.setAttribute('aria-pressed', String(x === b));
  });
  area.addEventListener('click', e => {
    const r = area.getBoundingClientRect();
    const col = Math.floor((e.clientX - r.left) / CW), row = Math.floor((e.clientY - r.top) / CH);
    if (col < 0 || col >= steps() || row < 0 || row >= ROWS) return;
    cursor = { row: TOP - row, col };
    toggle(TOP - row, col);
  });
  area.addEventListener('keydown', e => {
    const k = e.key;
    if (k === 'ArrowUp') cursor.row = Math.min(TOP, cursor.row + 1);
    else if (k === 'ArrowDown') cursor.row = Math.max(BOTTOM, cursor.row - 1);
    else if (k === 'ArrowRight') cursor.col = Math.min(steps() - 1, cursor.col + 1);
    else if (k === 'ArrowLeft') cursor.col = Math.max(0, cursor.col - 1);
    else if (k === ' ' || k === 'Enter') toggle(cursor.row, cursor.col);
    else return;
    e.preventDefault();
    renderGrid();
  });
  const stepUI = s => {
    if (s === playStep) return;
    playStep = s;
    renderStaff_();
    for (const n of area.querySelectorAll('.note')) n.classList.toggle('on', s != null && s >= +n.dataset.s && s < +n.dataset.s + +n.dataset.len);
    const ph = area.querySelector('.playhead');
    if (ph) { ph.hidden = s == null; ph.style.left = (s ?? 0) * CW + 'px'; }
  };
  new ResizeObserver(() => renderStaff_()).observe(sheet);

  function steps() { return m.bars * 16; }
  function visible() { return m.notes.filter(n => n[0] < steps()); }

  function toggle(degree, col) {
    const hit = m.notes.findIndex(([s, len, d]) => d === degree && col >= s && col < s + len);
    if (hit >= 0) { m.notes.splice(hit, 1); render(); return; }
    const nextSame = m.notes.filter(([s, , d]) => d === degree && s > col).map(n => n[0]);
    const len = Math.max(1, Math.min(pen, steps() - col, ...nextSame.map(s => s - col)));
    m.notes.push([col, len, degree]);
    m.notes.sort((a, b) => a[0] - b[0] || a[2] - b[2]);
    audition(degree);
    render();
  }

  async function audition(degree) {
    const audio = await getAudio();
    await audio.resume();
    // Outside the game there is no beat to land on, so it sounds at once.
    audio.play({ family: m.family, midi: motifState(m).getNote(degree, m.octave), intensity: 0.8, when: 0, heard: false });
  }

  function play() {
    const notes = motifPitches({ ...m, notes: visible() }).map(n => ({ step: n.step, midi: n.midi, family: m.family }));
    player.play(notes, { bpm: m.bpm, steps: steps(), loop: true, click, owner: 'writer', onStep: stepUI, onStop: () => { playBtn.textContent = 'Play'; } });
    playBtn.textContent = 'Stop';
  }

  function give(what, text) {
    outHead.replaceChildren(h('span', {}, `Copied ${what}:`));
    outHead.hidden = false;
    copyText(text, t => { out.textContent = t; out.hidden = false; });
  }

  async function save() {
    m.name = name.value.trim() || 'untitled motif';
    try { await store.saveMotif(structuredClone(m)); toast(`Saved “${m.name}”`); }
    catch { toast('Could not save. Copy the motif instead.'); }
    refreshSaved();
  }

  async function refreshSaved() {
    try { saved = await store.motifs(); } catch { saved = []; }
    savedCount.textContent = saved.length ? `${saved.length} · ${store.where}` : store.where;
    savedList.replaceChildren(...(saved.length ? saved.map(s => h('div', { class: 'item' },
      h('div', { class: 'head', style: 'display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:center;padding:8px 2px' },
        h('span', { class: 'title' }, s.name),
        h('button', { type: 'button', onclick: () => { load(structuredClone(s)); el.scrollIntoView({ behavior: 'smooth' }); } }, 'Open'),
        confirmButton('Delete', 'Delete it?', async () => { await store.deleteMotif(s.id); refreshSaved(); }),
        h('span', { class: 'meta' }, `${NOTE_NAMES[s.key.root]} ${s.key.mode} · ${s.bars} bar${s.bars > 1 ? 's' : ''} · ${s.notes.length} notes · ${s.family}${s.source?.title ? ` · from ${s.source.title}` : ''}`)))) :
      [h('p', { class: 'empty inline' }, 'Nothing saved yet. Write a motif above and press ', h('b', {}, 'Save'), '.')]));
  }

  // ---- drawing ----
  function render() {
    renderStaff_();
    renderCaption();
    renderGrid();
  }

  function renderStaff_() {
    const w = Math.max(240, Math.floor(sheet.clientWidth - 16));
    sheet.innerHTML = renderStaff({ notes: motifPitches({ ...m, notes: visible() }), bars: m.bars, key: m.key, width: w, playStep });
  }

  function renderCaption() {
    const sig = spell(motifState(m).getNote(0, 5), m.key);
    caption.replaceChildren(...[
      h('b', {}, `${sig.name.replace(/\d+$/, '').replace('#', '♯').replace(/b$/, '♭')} ${m.key.mode}`),
      h('span', {}, MODE_MOOD[m.key.mode]),
      h('span', {}, h('span', { class: 'note-glyph' }, '♩'), ` = ${m.bpm}`),
      h('span', {}, `${m.bars} bar${m.bars > 1 ? 's' : ''}`),
      h('span', {}, `${visible().length} notes`),
      h('span', {}, m.family),
      m.source?.title ? h('span', {}, `from ${m.source.title}`) : null].filter(Boolean));
  }

  function renderGrid() {
    const n = steps();
    const s = motifState(m);
    labels.replaceChildren(...Array.from({ length: ROWS }, (_, r) => {
      const d = TOP - r;
      const deg = ((d % 7) + 7) % 7;
      const nm = spell(s.getNote(d, m.octave), m.key).name.replace(/\d+$/, '');
      return h('div', { class: 'rowlab' + (deg === 0 ? ' tonic' : ''), style: `height:${CH}px` }, h('b', {}, SOLFEGE[deg]), nm);
    }));
    area.style.width = n * CW + 'px';
    area.style.height = ROWS * CH + 'px';
    area.style.backgroundImage = [
      `repeating-linear-gradient(to right, #5a5a5a 0 1px, transparent 1px ${16 * CW}px)`,
      `repeating-linear-gradient(to right, #2c2c2c 0 1px, transparent 1px ${4 * CW}px)`,
      `repeating-linear-gradient(to right, #181818 0 1px, transparent 1px ${CW}px)`,
      `repeating-linear-gradient(to bottom, transparent 0 ${CH - 1}px, #1c1c1c ${CH - 1}px ${CH}px)`,
    ].join(',');
    const kids = [];
    // The home rows, so a tune can always find do.
    for (let d = TOP; d >= BOTTOM; d--) if (((d % 7) + 7) % 7 === 0) {
      kids.push(h('div', { style: `position:absolute;left:0;right:0;top:${(TOP - d) * CH}px;height:${CH}px;background:#ffffff0d;pointer-events:none` }));
    }
    for (const [st, len, d] of visible()) {
      if (d > TOP || d < BOTTOM) continue;
      kids.push(h('div', { class: 'note', 'data-s': st, 'data-len': len,
        style: `left:${st * CW + 1}px;top:${(TOP - d) * CH + 3}px;width:${Math.min(len, n - st) * CW - 2}px;height:${CH - 6}px` }));
    }
    kids.push(h('div', { class: 'cursor', style: `position:absolute;pointer-events:none;left:${cursor.col * CW}px;top:${(TOP - cursor.row) * CH}px;width:${CW}px;height:${CH}px;box-shadow:inset 0 0 0 1px #8f8f8f;opacity:${document.activeElement === area ? 1 : 0}` }));
    kids.push(h('div', { class: 'playhead', hidden: playStep == null, style: `position:absolute;top:0;bottom:0;width:${CW}px;left:${(playStep ?? 0) * CW}px;background:#ffffff14;pointer-events:none` }));
    area.replaceChildren(...kids);
  }
  area.addEventListener('focus', () => renderGrid());
  area.addEventListener('blur', () => renderGrid());

  function load(motif, note) {
    if (player.playing && player.owner === 'writer') player.stop();
    m = motif;
    name.value = m.name;
    root.value = String(m.key.root);
    mode.value = m.key.mode;
    bpm.value = String(m.bpm);
    if (![1, 2, 4, 8].includes(m.bars)) m.bars = m.bars > 4 ? 8 : m.bars > 2 ? 4 : 2;
    bars.value = String(m.bars);
    family.value = m.family;
    if (![2, 3, 4, 5, 6].includes(m.octave)) m.octave = Math.max(2, Math.min(6, m.octave));
    octave.value = String(m.octave);
    playStep = null;
    render();
    // Start the grid where the tune is.
    const first = Math.min(...visible().map(n => n[0]), 0);
    gridWrap.scrollLeft = Math.max(0, first * CW - 40);
    if (note) toast(note);
  }

  load(m);
  refreshSaved();
  return { el, load, get motif() { return m; } };
}

const fileName = s => (s || 'motif').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, ' ') || 'motif';
