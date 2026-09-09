// The room editor.
//
// Two views of the same room, always in sync:
//   • the canvas, which you paint on — that is the one you'll use;
//   • the text view, which is still the storage format and still the fastest way to
//     move a room between machines or read a diff.
//
// Nothing here reloads the room. Edits rebuild the tiles they touch, so the room you
// are standing in keeps its beat, its open doors and its lit locks while you build.

import { DEFAULT_LEGEND } from '../core/room.js';
import { MODE_NAMES, MOOD_NAMES, MOOD_TO_MODE, NOTE_NAMES } from '../core/music.js';
import { createPaintEditor } from './paint.js';
import { buildPanel } from './panel.js';

export function buildEditor(game, renderer, assets, els, hooks = {}) {
  const { layoutBox, legendBox } = els;
  const onReload = hooks.onReload;
  const toast = hooks.toast ?? ((m) => game.toast(m));

  const paint = createPaintEditor(game, renderer, {
    onEdit: () => { syncTextFromRoom(); panel.refresh(); onReload?.(); },
  });

  const panel = buildPanel(game, paint, assets, {
    tools: els.tools, palette: els.palette, inspector: els.inspector,
    assets: els.assetsBox, legendHint: els.hintBox, report: els.reportBox,
  }, { toast, onJump: hooks.onJump });

  // ---- populate the fixed selects ----------------------------------------

  els.mode.innerHTML = MODE_NAMES.map(m => `<option value="${m}">${m}</option>`).join('');
  els.mood.innerHTML = MOOD_NAMES.map(m => `<option value="${m}">${m}</option>`).join('');
  els.root.innerHTML = NOTE_NAMES.map((n, i) => `<option value="${i}">${n}</option>`).join('');
  els.wing.innerHTML = ['brass', 'woodwind', 'strings', 'percussion', 'keys']
    .map(w => `<option value="${w}">${w}</option>`).join('');

  // ---- room fields, applied live -----------------------------------------

  const on = (el, ev, fn) => el?.addEventListener(ev, fn);

  on(els.roomName, 'change', () => { game.room.name = els.roomName.value || game.room.id; onReload?.(); });
  on(els.wing, 'change', () => {
    game.room.wing = els.wing.value;
    panel.drawPreviews();
    onReload?.();
  });
  on(els.root, 'change', () => { game.room.music.root = Number(els.root.value); onReload?.(); });
  on(els.mode, 'change', () => { game.room.music.mode = els.mode.value; onReload?.(); });
  on(els.mood, 'change', () => {
    game.room.music.setMood(els.mood.value);
    els.mode.value = MOOD_TO_MODE[els.mood.value] ?? game.room.music.mode;
    onReload?.();
  });
  on(els.maxWaves, 'change', () => { game.room.maxWaves = Number(els.maxWaves.value) || 1; onReload?.(); });
  on(els.hint, 'input', () => { game.room.hint = els.hint.value; hooks.onHint?.(els.hint.value); });
  on(els.bpm, 'input', () => {
    els.bpmOut.textContent = els.bpm.value;
    game.room.music.bpm = Number(els.bpm.value);
  });

  // ---- size ---------------------------------------------------------------

  const applySize = () => {
    paint.resize(Number(els.width.value), Number(els.height.value));
    syncFromRoom();
  };
  on(els.width, 'change', applySize);
  on(els.height, 'change', applySize);

  // ---- text view ----------------------------------------------------------

  function syncTextFromRoom() {
    layoutBox.value = game.room.layoutWith(game.player).join('\n');
    els.width.value = game.room.width;
    els.height.value = game.room.height;
  }

  function applyLayoutText() {
    const room = game.room;
    paint.begin();
    room.layout = layoutBox.value.split('\n');
    room.build();
    const at = room.playerCharPos();
    if (at) {
      game.player.x = at.x; game.player.y = at.y;
      game.player.rx = at.x; game.player.ry = at.y;
    }
    game.waves = [];
    renderer.resize(room);
    syncTextFromRoom();
    panel.refresh();
    onReload?.();
  }

  function applyLegendText() {
    const room = game.room;
    let legend;
    try { legend = JSON.parse(legendBox.value || '{}'); }
    catch { toast('Legend JSON is invalid — keeping the old one.'); return; }
    paint.begin();
    room.legendExtra = legend;
    room.legend = { ...DEFAULT_LEGEND, ...legend };
    room.build();
    game.waves = [];
    panel.refresh();
    onReload?.();
  }

  let t = null;
  const debounce = (fn) => () => { clearTimeout(t); t = setTimeout(fn, 240); };
  layoutBox.addEventListener('input', debounce(applyLayoutText));
  legendBox.addEventListener('input', debounce(applyLegendText));

  // ---- export -------------------------------------------------------------

  function currentJSON() { return game.room.toJSON(game.player); }

  on(els.copyBtn, 'click', async () => {
    const json = JSON.stringify(currentJSON(), null, 2);
    try { await navigator.clipboard.writeText(json); toast('Room JSON copied.'); }
    catch { toast('Clipboard blocked — use Download instead.'); }
  });

  on(els.downloadBtn, 'click', () => {
    const json = JSON.stringify(currentJSON(), null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${game.room.id}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  // ---- sync ---------------------------------------------------------------

  function syncFromRoom() {
    const room = game.room;
    legendBox.value = Object.keys(room.legendExtra).length
      ? JSON.stringify(room.legendExtra, null, 2) : '{}';
    els.roomName.value = room.name;
    els.wing.value = room.wing;
    els.bpm.value = room.music.bpm;
    els.root.value = room.music.root;
    els.mode.value = room.music.mode;
    els.mood.value = room.music.mood;
    els.maxWaves.value = room.maxWaves;
    els.hint.value = room.hint ?? '';
    els.bpmOut.textContent = `${room.music.bpm}`;
    paint.state.selected = null;
    syncTextFromRoom();
    panel.refresh();
  }

  return {
    syncFromRoom,
    currentJSON,
    paint,
    setMode(m) { paint.setMode(m); panel.refresh(); },
    undo() { paint.undo(); syncFromRoom(); },
    redo() { paint.redo(); syncFromRoom(); },
  };
}
