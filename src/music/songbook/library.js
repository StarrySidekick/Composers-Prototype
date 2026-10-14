// The library: everything you have made, as tools/music-library.mjs found it,
// with what you say about each piece kept beside it (status, tags, notes, and the
// key, when the guess is wrong). Plus the game's own tunes, so there is always
// something to open.

import { NOTE_NAMES, MODE_NAMES, MOOD_TO_MODE } from '../../core/music.js';
import { describe, MODE_MOOD, keySignature, topLine } from '../key.js';
import { renderStaff } from '../notation.js';
import { writeMidi } from '../midi-file.js';
import { motifFromClip, motifFromLayer, motifState } from '../motif.js';
import { drumKind } from './player.js';
import { h, options, toast, copyText, saveFile } from './ui.js';

export const STATUSES = [
  ['new', 'new'], ['listened', 'listened'], ['candidate', 'motif candidate'], ['in-game', 'in the game'], ['not-for-game', 'not for the game'],
];
const COMMAND = 'node tools/music-library.mjs ~/Desktop/Albums ~/Music/Ableton';

export function createLibrary({ store, player, openInWriter }) {
  let lib = null, labels = {}, filter = 'all', query = '';
  let open = null;                                    // id of the expanded piece
  const tracksCache = new Map();

  const search = h('input', { id: 'l-search', type: 'search', placeholder: 'Search titles, albums, tags', 'aria-label': 'Search' });
  const which = options(h('select', { id: 'l-filter', 'aria-label': 'Show' }),
    [['all', 'everything'], ...STATUSES, ['needs', 'no notes yet']], 'all');
  const file = h('input', { type: 'file', accept: '.json,application/json', id: 'l-file', hidden: true });
  const loadBtn = h('button', { type: 'button', id: 'l-load', onclick: () => file.click() }, 'Load library.json');
  const progress = h('div', { class: 'progress', hidden: true }, h('i'));
  const summary = h('div', { class: 'caption', id: 'l-summary' });
  const body = h('div', { id: 'l-body', style: 'display:grid;gap:14px' });
  const game = h('div', { id: 'l-game', style: 'display:grid;gap:6px' });

  const el = h('section', { id: 'library', style: 'display:grid;gap:12px' },
    h('div', { class: 'row' }, h('label', { class: 'field grow' }, 'Find', search), h('label', { class: 'field' }, 'Show', which), loadBtn, file),
    progress, summary, body,
    h('div', { class: 'section-head' }, h('h2', {}, 'In the game'), h('span', { class: 'count' }, 'the tunes already in Composer’s Key')),
    game);

  search.addEventListener('input', () => { query = search.value.trim().toLowerCase(); renderList(); });
  which.addEventListener('change', () => { filter = which.value; renderList(); });
  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    file.value = '';
    if (!f) return;
    let parsed;
    try { parsed = JSON.parse(await f.text()); } catch { toast('That file is not JSON. Pick library/library.json.'); return; }
    if (!Array.isArray(parsed?.pieces)) { toast('That is not a library. Pick library/library.json.'); return; }
    progress.hidden = false;
    try {
      const r = await store.importLibrary(parsed, (done, total) => { progress.firstChild.style.width = `${Math.round(100 * done / total)}%`; });
      toast(`${r.pieces} pieces loaded${r.failed ? `, ${r.failed} writes failed` : ''}, kept ${r.kept}`);
    } catch (e) {
      toast(e?.code === 'quota_exceeded' ? 'This page is full. Load a smaller library.' : 'Could not load it.');
    }
    progress.hidden = true;
    tracksCache.clear();
    await refresh();
  });

  async function refresh() {
    try { lib = await store.library(); } catch { lib = null; }
    try { labels = await store.labels(); } catch { labels = {}; }
    renderList();
  }

  const labelOf = id => labels[id] ?? {};
  const statusOf = p => labelOf(p.id).status ?? 'new';
  const keyOf = p => labelOf(p.id).key ? describe(labelOf(p.id).key) : p.key;

  function matches(p) {
    if (filter === 'needs' ? p.needs !== 'transcription' : filter !== 'all' && statusOf(p) !== filter) return false;
    if (!query) return true;
    const l = labelOf(p.id);
    return [p.title, p.album, ...(l.tags ?? []), l.notes].some(s => s && String(s).toLowerCase().includes(query));
  }

  function renderList() {
    if (!lib?.pieces?.length) {
      summary.replaceChildren();
      body.replaceChildren(h('div', { class: 'empty' },
        h('b', {}, 'Your music goes here.'),
        h('span', {}, 'On the computer with your albums and Ableton projects, in this repo, run:'),
        h('pre', { class: 'code' }, COMMAND),
        h('span', {}, 'It reads every project’s MIDI clips, matches each bounce to its project, guesses keys, and writes library/library.json. Then press ', h('b', {}, 'Load library.json'), ' and pick it.'),
        h('div', { class: 'row' }, h('button', { type: 'button', onclick: () => copyText(COMMAND) }, 'Copy the command'))));
      return;
    }
    const shown = lib.pieces.filter(matches);
    const counts = Object.fromEntries(STATUSES.map(([k]) => [k, lib.pieces.filter(p => statusOf(p) === k).length]));
    summary.replaceChildren(
      h('b', {}, `${lib.pieces.length} pieces`),
      h('span', {}, `${counts.candidate} candidates`), h('span', {}, `${counts['in-game']} in the game`),
      h('span', {}, `${lib.pieces.filter(p => p.needs === 'transcription').length} with no notes yet`),
      h('span', {}, lib.made ? `read ${new Date(lib.made).toLocaleDateString()}` : null),
      h('span', {}, store.where));
    const albums = new Map();
    for (const p of shown) {
      const a = p.album || (p.kind === 'ableton' ? 'Projects without an album' : p.kind === 'midi' ? 'MIDI files' : 'Other audio');
      if (!albums.has(a)) albums.set(a, []);
      albums.get(a).push(p);
    }
    body.replaceChildren(...(shown.length ? [...albums].map(([a, ps]) => h('div', {},
      h('div', { class: 'section-head' }, h('h2', {}, a), h('span', { class: 'count' }, `${ps.length}`)),
      h('div', { class: 'list' }, ps.map(pieceRow)))) : [h('p', { class: 'empty' }, 'Nothing matches.')]));
  }

  function pieceRow(p) {
    const k = keyOf(p);
    const st = statusOf(p);
    const detail = h('div', { class: 'detail', hidden: open !== p.id });
    const head = h('button', { class: 'head', type: 'button', 'aria-expanded': String(open === p.id) },
      h('span', { class: 'title' }, p.trackNo ? `${p.trackNo}. ${p.title}` : p.title),
      h('span', { class: 'pill ' + (st === 'in-game' ? 'in-game' : st === 'candidate' ? 'candidate' : p.needs === 'transcription' ? 'needs' : '') },
        p.needs === 'transcription' && st === 'new' ? 'audio only' : (STATUSES.find(s => s[0] === st)?.[1] ?? st)),
      h('span', { class: 'meta' },
        k ? h('span', {}, `${k.label} · ${k.mood}`) : null,
        p.bpm ? h('span', {}, `♩ = ${Math.round(p.bpm)}`) : null,
        p.stats?.seconds ? h('span', {}, clock(p.stats.seconds)) : null,
        p.stats ? h('span', {}, `${p.stats.notes} notes`) : null,
        (labelOf(p.id).tags ?? []).length ? h('span', {}, labelOf(p.id).tags.map(t => '#' + t).join(' ')) : null));
    head.addEventListener('click', async () => {
      open = open === p.id ? null : p.id;
      head.setAttribute('aria-expanded', String(open === p.id));
      detail.hidden = open !== p.id;
      if (open === p.id) await fillDetail(p, detail);
    });
    if (open === p.id) fillDetail(p, detail);
    return h('div', { class: 'item', id: 'piece-' + p.id }, head, detail);
  }

  async function fillDetail(p, detail) {
    detail.replaceChildren(h('span', { class: 'caption' }, 'Reading…'));
    let tracks = tracksCache.get(p.id);
    if (!tracks) {
      try { tracks = await store.pieceTracks(p.id); } catch { tracks = []; }
      tracksCache.set(p.id, tracks);
    }
    const l = { status: 'new', tags: [], notes: '', key: null, ...labelOf(p.id) };
    const k = keyOf(p);

    // What the importer found.
    const facts = h('dl', { class: 'facts' },
      dt('key', k ? [`${k.label} (${k.mood})`, l.key ? ' · set by you' : p.key ? ` · a guess: ${Math.round(p.key.fit * 100)}% of the notes in it${p.key.alternatives?.length ? `, or ${p.key.alternatives[0].label}` : ''}` : ''] : 'no notes to tell'),
      dt('tempo', p.bpm ? `♩ = ${p.bpm}, ${(p.timeSig ?? [4, 4]).join('/')}` : null),
      dt('from', p.source?.path),
      dt('saved in', p.source?.creator || null),
      dt('versions', p.source?.versions?.length ? p.source.versions.join(', ') : null),
      dt('audio', p.audio?.length ? p.audio.map(a => `${a.path}${a.seconds ? ` (${clock(a.seconds)})` : ''}`).join('; ') : null),
      dt('needs', p.needs === 'transcription' ? 'There is no project to read notes from. Find its Ableton set, or run the tool with --transcribe (basic-pitch).' : p.needs === 'checking' ? 'Transcribed from audio: check it by ear.' : null));

    // What you say about it.
    const status = options(h('select', { id: 'l-status' }), STATUSES, l.status);
    const kroot = options(h('select', { id: 'l-root', 'aria-label': 'Key' }), [['', 'as guessed'], ...NOTE_NAMES.map((n, i) => [i, n])], l.key ? l.key.root : '');
    const kmode = options(h('select', { id: 'l-mode', 'aria-label': 'Mode' }), MODE_NAMES.map(m => [m, `${m} · ${MODE_MOOD[m]}`]), (l.key ?? p.key)?.mode ?? 'ionian');
    const tags = h('input', { id: 'l-tags', type: 'text', value: (l.tags ?? []).join(', '), placeholder: 'boss, wood, lullaby' });
    const notes = h('textarea', { id: 'l-notes', placeholder: 'What it is, where it might go in the game' }, l.notes ?? '');
    const savedNote = h('span', { class: 'caption' });
    let timer;
    const persist = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const next = {
          status: status.value,
          tags: tags.value.split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean),
          notes: notes.value,
          key: kroot.value === '' ? null : { root: +kroot.value, mode: kmode.value },
        };
        try { await store.setLabel(p.id, next); labels[p.id] = next; savedNote.textContent = `saved · ${store.where}`; }
        catch { savedNote.textContent = 'not saved: try again'; }
      }, 400);
    };
    for (const x of [status, kroot, kmode]) x.addEventListener('change', persist);
    for (const x of [tags, notes]) x.addEventListener('input', persist);

    // Its tracks and clips.
    const fromBar = h('input', { type: 'number', min: 1, value: 1, id: 'l-from', inputmode: 'numeric', style: 'width:5em' });
    const topOnly = h('input', { type: 'checkbox', id: 'l-top', checked: true });
    const sheet = h('div', { class: 'sheet', hidden: true });
    let selected = null;
    const show = (clip, row) => {
      selected = { clip, row };
      for (const r of detail.querySelectorAll('.clip')) r.classList.toggle('selected', r === row);
      drawSheet();
    };
    const drawSheet = () => {
      if (!selected) return;
      const key = keyOf(p) ?? { root: 0, mode: 'ionian' };
      const start = (Math.max(1, +fromBar.value || 1) - 1) * 16;
      let ns = selected.clip.notes.filter(([s]) => s >= start && s < start + 64)
        .map(([s, len, midi]) => ({ start: s - start, len, midi, beat: (s - start) / 4 }));
      if (topOnly.checked) ns = topLine(ns);
      sheet.hidden = false;
      sheet.innerHTML = renderStaff({ notes: ns, bars: 4, key, width: Math.max(240, sheet.clientWidth - 16 || 320), title: `${p.title}, bars ${start / 16 + 1} to ${start / 16 + 4}${topOnly.checked ? ', top line' : ''}` });
    };
    fromBar.addEventListener('change', drawSheet);
    topOnly.addEventListener('change', drawSheet);

    const play = (clip, drums, btn) => {
      if (player.playing && player.owner === btn) { player.stop(); return; }
      const ns = clip.notes.map(([s, , midi, vel]) => drums
        ? { step: s, midi: 60, family: 'percussion', kind: drumKind(midi), vel }
        : { step: s, midi, family: 'keys', vel });
      player.play(ns, { bpm: p.bpm ?? 120, steps: Math.max(16, Math.ceil((clip.beats ?? 4) * 4)), loop: true, owner: btn,
        onStop: () => { btn.textContent = '▶'; } });
      btn.textContent = '■';
    };
    const use = (clip, t, label) => {
      const key = keyOf(p) ?? { root: 0, mode: 'ionian' };
      const { motif, snapped, dropped } = motifFromClip(clip, {
        key, bpm: p.bpm ?? 110, fromBar: Math.max(1, +fromBar.value || 1) - 1, bars: 4, top: topOnly.checked,
        name: `${p.title}: ${label}`, source: { piece: p.id, title: p.title, track: t.name, clip: label },
      });
      if (!motif.notes.length) { toast('No notes in those four bars. Change “from bar”.'); return; }
      openInWriter(motif, [snapped ? `${snapped} note${snapped > 1 ? 's' : ''} bent into ${key.label ?? 'the key'}` : null, dropped ? `${dropped} out of range left out` : null].filter(Boolean).join(', ') || `Opened in ${key.label ?? 'its key'}`);
    };
    const rows = new Map();
    const clipRow = (t, clip, label) => {
      const btn = h('button', { type: 'button', 'aria-label': `Play ${label}` }, '▶');
      const row = h('div', { class: 'clip' },
        btn,
        h('span', { class: 'what' },
          h('span', { class: 'name' }, label),
          h('span', { class: 'n' }, `${clip.bars} bar${clip.bars > 1 ? 's' : ''} · ${clip.notes.length} notes${clip.poly > 1 ? ' · chords' : ''}${clip.uses > 1 ? ` · used ${clip.uses}×` : ''}${clip.offGrid > 0.15 ? ' · loose or triplet timing' : ''}`)),
        t.drums ? null : h('span', { class: 'acts' },
          h('button', { type: 'button', onclick: () => show(clip, row) }, 'Sheet'),
          h('button', { type: 'button', onclick: () => use(clip, t, label) }, 'Use as motif')));
      btn.addEventListener('click', () => play(clip, t.drums, btn));
      rows.set(clip, row);
      return row;
    };
    const trackEls = tracks.map(t => h('div', { class: 'track' },
      h('h4', {}, t.name, t.drums ? h('span', { class: 'pill' }, 'drums') : null, t.type === 'audio' ? h('span', { class: 'pill' }, 'audio') : null,
        t.trimmed ? h('span', { class: 'pill needs' }, 'trimmed to fit') : null),
      t.type === 'audio' ? h('span', { class: 'caption' }, `${t.audioClips} audio clip${t.audioClips === 1 ? '' : 's'}${t.audioFiles?.length ? `: ${t.audioFiles.join(', ')}` : ''}. Recorded sound has no notes to read.`) : null,
      t.arrangement?.notes.length ? clipRow(t, t.arrangement, 'the whole arrangement') : null,
      t.clips.map((c, i) => clipRow(t, c, c.name || `${c.where} clip ${i + 1}`))));

    const midiBtn = h('button', { type: 'button', onclick: () => {
      const parts = tracks.filter(t => (t.arrangement ?? t.clips[0])?.notes.length).map((t, i) => ({
        name: t.name, channel: t.drums ? 9 : i % 9,
        notes: (t.arrangement ?? t.clips[0]).notes.map(([s, len, midi, vel]) => ({ beat: s / 4, beats: len / 4, midi, vel })),
      }));
      if (!parts.length) { toast('No notes to save'); return; }
      saveFile(`${p.title}.mid`, writeMidi({ bpm: p.bpm ?? 120, timeSig: p.timeSig, key: k ? keySignature(k) : null, title: p.title, tracks: parts }));
    } }, 'Save .mid for sheet music');

    detail.replaceChildren(
      facts,
      h('div', { class: 'row' },
        h('label', { class: 'field' }, 'Status', status),
        h('label', { class: 'field' }, 'Key', h('span', { class: 'row', style: 'gap:4px' }, kroot, kmode)),
        h('label', { class: 'field grow' }, 'Tags', tags)),
      h('label', { class: 'field' }, 'Notes', notes), savedNote,
      tracks.length ? h('div', { class: 'row' },
        h('label', { class: 'field' }, 'From bar', fromBar),
        h('label', { class: 'field', style: 'flex-direction:row;display:flex;gap:6px;align-items:center' }, topOnly, 'top line only'),
        midiBtn) : null,
      sheet,
      h('div', { class: 'tracks' }, trackEls));
    const firstMelodic = tracks.find(t => !t.drums && (t.clips[0] || t.arrangement));
    if (firstMelodic) {
      const clip = firstMelodic.clips[0] ?? firstMelodic.arrangement;
      show(clip, rows.get(clip));
    }
  }

  // ---- the game's own music ----
  async function renderGame() {
    const sources = [['rooms/world.json', 'The castle tune', 'atrium'], ['rooms/wood.json', 'The Wood', 'wood']];
    const blocks = [];
    for (const [url, title, area] of sources) {
      let w;
      try { w = await (await fetch(url)).json(); } catch { continue; }
      const a = w.areas?.[area] ?? { root: 0, mood: 'content', bpm: 110 };
      const key = { root: a.root ?? 0, mode: MOOD_TO_MODE[a.mood] ?? 'ionian' };
      const score = w.score;
      if (!score?.layers?.length) continue;
      const k = describe(key);
      const playLayers = (layers, btn) => {
        if (player.playing && player.owner === btn) { player.stop(); return; }
        const s = motifState({ key });
        const ns = layers.flatMap(l => l.notes.map(([st, d, o, kind]) => l.family === 'percussion'
          ? { step: st, midi: 60, family: 'percussion', kind: kind ?? 'hat' }
          : { step: st, midi: s.getNote(d, o ?? l.octave ?? 4), family: l.family ?? 'keys', vel: 90 * (l.gain ?? 1) }));
        player.play(ns, { bpm: a.bpm ?? 110, steps: (score.bars ?? 4) * 16, loop: true, owner: btn, onStop: () => { btn.textContent = '▶'; } });
        btn.textContent = '■';
      };
      const allBtn = h('button', { type: 'button', 'aria-label': `Play ${title}` }, '▶');
      allBtn.addEventListener('click', () => playLayers(score.layers, allBtn));
      blocks.push(h('div', { class: 'track' },
        h('h4', {}, title, h('span', { class: 'caption' }, `${k.label} · ${k.mood} · ♩ = ${a.bpm} · ${score.bars} bars · ${score.layers.length} layers`)),
        h('div', { class: 'clip' }, allBtn, h('span', { class: 'what' }, h('span', { class: 'name' }, 'every layer together'), h('span', { class: 'n' }, 'the finished piece'))),
        score.layers.map(l => {
          const btn = h('button', { type: 'button', 'aria-label': `Play ${l.name}` }, '▶');
          btn.addEventListener('click', () => playLayers([l], btn));
          return h('div', { class: 'clip' }, btn,
            h('span', { class: 'what' },
              h('span', { class: 'name' }, l.name ?? l.id),
              h('span', { class: 'n' }, `${l.family} · ${l.notes.length} notes · ${l.by === 'start' ? 'from the start' : `earned in ${l.by}`}`)),
            l.family === 'percussion' ? null : h('span', { class: 'acts' },
              h('button', { type: 'button', onclick: () => openInWriter(motifFromLayer(l, { bars: score.bars, key, bpm: a.bpm, name: `${title}: ${l.name ?? l.id}` }), `Opened in ${k.label}`) }, 'Open in writer')));
        })));
    }
    game.replaceChildren(...blocks);
  }

  refresh();
  renderGame();
  return { el, refresh };
}

const dt = (label, value) => value == null || value === '' ? null : [h('dt', {}, label), h('dd', {}, value)];
const clock = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
