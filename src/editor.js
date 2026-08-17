// The room editor. You draw the room as text and it reloads live. This is the
// whole point of the prototype: the distance between "idea for a puzzle" and
// "playing that puzzle" should be about fifteen seconds.

import { DEFAULT_LEGEND } from './core/room.js';
import { MODE_NAMES, MOOD_NAMES, NOTE_NAMES } from './core/music.js';

const LEGEND_DOC = [
  ['@', 'Coda (start position)'],
  ['#', 'wall'],
  ['. or space', 'parchment floor'],
  ['- |', 'brass straight tube (horizontal / vertical)'],
  ['7 J L F', 'brass elbow  ┐ ┘ └ ┌'],
  ['T', 'brass tee — splits the wave, branch exits downward'],
  ['M', 'brass mouthpiece — face it and press B to blow'],
  ['Y', 'brass flare — sounds the tube and absorbs the wave'],
  ['V', 'valve — press B to rotate it 90°'],
  ['= H', 'string segment (horizontal / vertical)'],
  ['o', 'peg — anchors a string run, absorbs waves'],
  ['s b h', 'drum: snare (reflect) / bass (90° kick) / hat (pass + tick)'],
  ['k', 'piano key — walk on it, or wire it to mallets with a group'],
  ['m', 'mallet — fires a wave when its group is triggered'],
  ['*', 'lock — lit by any wave'],
  ['n', 'note lock — press B to hear the hint phrase'],
  ['D', 'door — opens when every lock in its group is lit'],
  ['X', 'exit — walk here to resolve the room'],
  ['x', 'dissonance (negative Strumentino)'],
  ['< >', 'key shift down / up'],
];

export function buildEditor(game, els, onReload) {
  const { layoutBox, legendBox, hintBox } = els;

  function syncFromRoom() {
    const room = game.room;
    layoutBox.value = room.layoutWith(game.player).join('\n');
    legendBox.value = room.source.legend ? JSON.stringify(room.source.legend, null, 2) : '{}';
    els.roomName.value = room.name;
    els.wing.value = room.wing;
    els.bpm.value = room.music.bpm;
    els.root.value = room.music.root;
    els.mode.value = room.music.mode;
    els.mood.value = room.music.mood;
    els.maxWaves.value = room.maxWaves;
    els.bpmOut.textContent = `${room.music.bpm}`;
    updateHint();
  }

  function updateHint() {
    hintBox.innerHTML = LEGEND_DOC
      .map(([k, v]) => `<div><code>${k.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code><span>${v}</span></div>`)
      .join('');
  }

  function currentJSON() {
    let legend;
    try { legend = JSON.parse(legendBox.value || '{}'); }
    catch (e) { game.toast('Legend JSON is invalid — keeping the old one.'); legend = game.room.source.legend ?? {}; }

    return {
      id: game.room.id,
      name: els.roomName.value || game.room.id,
      wing: els.wing.value,
      maxWaves: Number(els.maxWaves.value) || 1,
      music: {
        root: Number(els.root.value),
        mode: els.mode.value,
        bpm: Number(els.bpm.value),
        timeSignature: game.room.music.timeSignature,
        mood: els.mood.value,
      },
      legend: Object.keys(legend).length ? legend : undefined,
      layout: layoutBox.value.split('\n'),
    };
  }

  function apply() {
    game.loadRoom(currentJSON());
    onReload?.();
  }

  // Live-apply on edit, debounced — typing a tube into the box plays it immediately.
  let t = null;
  const live = () => { clearTimeout(t); t = setTimeout(apply, 220); };
  layoutBox.addEventListener('input', live);
  legendBox.addEventListener('input', live);

  for (const el of [els.roomName, els.wing, els.mode, els.mood, els.root, els.maxWaves]) {
    el.addEventListener('change', apply);
  }
  els.bpm.addEventListener('input', () => {
    els.bpmOut.textContent = els.bpm.value;
    game.room.music.bpm = Number(els.bpm.value);
  });

  els.copyBtn.addEventListener('click', async () => {
    const json = JSON.stringify(currentJSON(), null, 2);
    try {
      await navigator.clipboard.writeText(json);
      game.toast('Room JSON copied.');
    } catch {
      game.toast('Clipboard blocked — use Download instead.');
    }
  });

  els.downloadBtn.addEventListener('click', () => {
    const json = JSON.stringify(currentJSON(), null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${game.room.id}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  // Populate selects
  els.mode.innerHTML = MODE_NAMES.map(m => `<option value="${m}">${m}</option>`).join('');
  els.mood.innerHTML = MOOD_NAMES.map(m => `<option value="${m}">${m}</option>`).join('');
  els.root.innerHTML = NOTE_NAMES.map((n, i) => `<option value="${i}">${n}</option>`).join('');
  els.wing.innerHTML = ['brass', 'woodwind', 'strings', 'percussion', 'keys']
    .map(w => `<option value="${w}">${w}</option>`).join('');

  return { syncFromRoom, apply, currentJSON };
}

export { DEFAULT_LEGEND };
