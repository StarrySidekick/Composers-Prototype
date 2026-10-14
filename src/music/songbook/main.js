// The songbook page: a library of your music and a motif writer, sharing one
// audio engine (the game's) and one player. songbook.html in this repo and the
// private page on claude.ai (tools/songbook-artifact.html) both boot from here.

import { AudioEngine } from '../../audio/audio-engine.js';
import { MOOD_TO_MODE } from '../../core/music.js';
import { motifFromLayer } from '../motif.js';
import { openStore } from './store.js';
import { Player } from './player.js';
import { createWriter } from './writer.js';
import { createLibrary } from './library.js';
import { h } from './ui.js';

const TAB_KEY = 'ck-songbook-tab';

export async function boot(root) {
  // The audio engine is made on the first press of a play button: browsers only
  // let a page make sound after the person has touched it.
  let audio = null;
  const getAudio = async () => {
    if (!audio) {
      audio = new AudioEngine();
      audio.loadSamples().catch(() => {});      // no samples here: the synth voices play
    }
    return audio;
  };
  const player = new Player(getAudio);
  const store = await openStore();

  const writer = createWriter({ store, player, getAudio });
  const library = createLibrary({ store, player, openInWriter: (motif, note) => { writer.load(motif, note); select('write'); } });

  const tabs = [['write', 'Write', writer.el], ['library', 'Library', library.el]];
  const tabBtns = tabs.map(([id, label]) => h('button', { class: 'tab', role: 'tab', id: 'tab-' + id, 'aria-controls': id === 'write' ? 'writer' : 'library', onclick: () => select(id) }, label));
  function select(id) {
    tabs.forEach(([t, , el], i) => { el.hidden = t !== id; tabBtns[i].setAttribute('aria-selected', String(t === id)); });
    try { localStorage.setItem(TAB_KEY, id); } catch { /* fine */ }
    window.scrollTo({ top: 0 });
  }

  root.replaceChildren(
    h('header', { class: 'mast' },
      h('h1', {}, 'Songbook', h('small', {}, 'Composer’s Key')),
      h('nav', { class: 'tabs', role: 'tablist' }, tabBtns),
      // Served beside the game, a way back to it; on claude.ai there is no game beside it.
      window.claude?.use ? null : h('a', { class: 'back', href: 'index.html' }, '◂ the game'),
      h('div', { class: 'where' }, store.kind === 'db'
        ? 'Your labels and motifs are saved to this private page. A Claude session can read them to put a motif into the game.'
        : 'Labels and motifs are saved in this browser. Copy a motif out to put it in the game.')),
    writer.el, library.el);

  let first = location.hash.slice(1);
  if (!['write', 'library'].includes(first)) { try { first = localStorage.getItem(TAB_KEY) || 'write'; } catch { first = 'write'; } }
  select(['write', 'library'].includes(first) ? first : 'write');

  // Open on something real: the game's own motif, the tune the castle grows from.
  try {
    const w = await (await fetch('rooms/world.json')).json();
    const a = w.areas?.atrium ?? { root: 0, mood: 'content', bpm: 104 };
    const layer = w.score.layers.find(l => l.id === 'motif') ?? w.score.layers[0];
    if (!writer.motif.notes.length) {
      writer.load(motifFromLayer(layer, { bars: w.score.bars, key: { root: a.root, mode: MOOD_TO_MODE[a.mood] }, bpm: a.bpm, name: 'The castle tune: the motif' }));
    }
  } catch { /* the writer starts empty */ }

  window.CK_SONGBOOK = { store, player, writer, library, getAudio };
}
