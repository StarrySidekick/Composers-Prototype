// The editor's DOM: tool row, brush palette, tile inspector, asset shelf.
// Everything in here is built from the catalog and the asset store, so adding a
// doodad or a sprite slot never means editing markup.

import { GROUPS, propsFor, specForChar, legendDoc, PLAYER_CHAR } from './catalog.js';
import { renderSpec, spriteKeys, bakeAtlas, bakeSessionSprites } from '../render/sprite-baker.js';
import { NOTE_NAMES } from '../core/music.js';

const TOOLS = [
  { id: 'paint',  label: '✎',  title: 'Paint (drag to draw)' },
  { id: 'rect',   label: '▭',  title: 'Rectangle — drag to fill an area' },
  { id: 'erase',  label: '⌫',  title: 'Erase (or right-click with any tool)' },
  { id: 'rotate', label: '↻',  title: 'Rotate the tile you tap' },
  { id: 'pick',   label: '⊙',  title: 'Pick up the tile you tap as the brush' },
  { id: 'select', label: '☝',  title: 'Select a tile to edit its properties' },
];

const PREVIEW = 34;

export function buildPanel(game, paint, assets, els, { onEdit, toast } = {}) {
  const previews = [];   // { canvas, spec } — redrawn when the wing or sprites change

  // ---- tools --------------------------------------------------------------

  els.tools.innerHTML = '';
  const toolBtns = new Map();
  for (const t of TOOLS) {
    const b = document.createElement('button');
    b.className = 'tool';
    b.textContent = t.label;
    b.title = t.title;
    b.addEventListener('click', () => { paint.setTool(t.id); refreshTools(); });
    els.tools.appendChild(b);
    toolBtns.set(t.id, b);
  }
  const undoBtn = iconButton('↶', 'Undo', () => { paint.undo(); refresh(); });
  const redoBtn = iconButton('↷', 'Redo', () => { paint.redo(); refresh(); });
  els.tools.append(undoBtn, redoBtn);

  function refreshTools() {
    for (const [id, b] of toolBtns) b.classList.toggle('on', paint.state.tool === id);
    undoBtn.disabled = !paint.canUndo;
    redoBtn.disabled = !paint.canRedo;
  }

  // ---- palette ------------------------------------------------------------

  const brushBtns = new Map();
  els.palette.innerHTML = '';
  for (const g of GROUPS) {
    const h = document.createElement('div');
    h.className = 'pal-group';
    h.textContent = g.label;
    els.palette.appendChild(h);

    const row = document.createElement('div');
    row.className = 'pal-row';
    for (const b of g.brushes) {
      const btn = document.createElement('button');
      btn.className = 'brush';
      btn.title = `${b.char}  ${b.label} — ${b.hint}`;

      const cv = document.createElement('canvas');
      cv.width = cv.height = PREVIEW;
      cv.className = 'brush-art';
      btn.appendChild(cv);
      previews.push({ canvas: cv, char: b.char });

      const name = document.createElement('span');
      name.textContent = b.label;
      btn.appendChild(name);

      btn.addEventListener('click', () => { paint.setChar(b.char); refresh(); });
      row.appendChild(btn);
      brushBtns.set(b.char, btn);
    }
    els.palette.appendChild(row);
  }

  function drawPreviews() {
    const wing = game.room?.wing ?? 'brass';
    for (const p of previews) {
      const c = p.canvas.getContext('2d');
      c.clearRect(0, 0, PREVIEW, PREVIEW);
      if (p.char === PLAYER_CHAR) { drawCoda(c, PREVIEW); continue; }
      const spec = specForChar(p.char);
      if (!spec) { drawFloor(c, PREVIEW); continue; }
      renderSpec(c, spec, PREVIEW, wing, assets);
    }
  }

  function refreshPalette() {
    for (const [ch, btn] of brushBtns) btn.classList.toggle('on', paint.state.char === ch);
  }

  // ---- inspector ----------------------------------------------------------

  function refreshInspector() {
    const box = els.inspector;
    box.innerHTML = '';
    const sel = paint.state.selected;
    if (!sel || !game.room.inBounds(sel.x, sel.y)) {
      box.innerHTML = '<p class="muted">Tap a tile to edit it.</p>';
      return;
    }
    const room = game.room;
    const ch = room.charAt(sel.x, sel.y);
    const spec = effectiveSpec(room, sel.x, sel.y);

    const head = document.createElement('div');
    head.className = 'insp-head';
    head.innerHTML = `<code>${escapeHtml(ch)}</code>
      <b>${spec ? escapeHtml(spec.part ? `${spec.type} · ${spec.part}` : spec.type)
                : ch === PLAYER_CHAR ? 'Coda' : 'floor'}</b>
      <span class="muted">${sel.x},${sel.y}</span>`;
    box.appendChild(head);

    if (!spec) return;

    const fields = propsFor(spec.type).filter(f => !f.when || f.when(spec));
    if (!fields.length) { box.insertAdjacentHTML('beforeend', '<p class="muted">No properties.</p>'); return; }

    for (const f of fields) {
      const wrap = document.createElement('label');
      wrap.className = 'insp-field';
      const name = document.createElement('span');
      name.textContent = f.key;
      if (f.hint) name.title = f.hint;
      wrap.appendChild(name);
      wrap.appendChild(fieldInput(f, spec, (v) => {
        paint.setProp(sel.x, sel.y, f.key, v);
        refresh();
      }));
      box.appendChild(wrap);
    }

    if (spec.type === 'notelock') {
      const p = document.createElement('p');
      p.className = 'muted';
      p.textContent = `phrase in ${game.room.music.label}: ${
        (spec.sequence ?? []).map(d => NOTE_NAMES[game.room.music.getNote(d, 4) % 12]).join(' ')}`;
      box.appendChild(p);
    }
  }

  function fieldInput(f, spec, onChange) {
    const v = spec[f.key];
    if (f.type === 'bool') {
      const i = document.createElement('input');
      i.type = 'checkbox';
      i.checked = !!v;
      i.addEventListener('change', () => onChange(i.checked));
      return i;
    }
    if (f.type === 'enum') {
      const s = document.createElement('select');
      s.innerHTML = f.values.map(o => `<option value="${o}">${o}</option>`).join('');
      s.value = v ?? f.values[0];
      s.addEventListener('change', () => onChange(s.value));
      return s;
    }
    if (f.type === 'rot') {
      const s = document.createElement('select');
      s.innerHTML = [0, 90, 180, 270].map(o => `<option value="${o}">${o}°</option>`).join('');
      s.value = String(v ?? 0);
      s.addEventListener('change', () => onChange(Number(s.value)));
      return s;
    }
    if (f.type === 'degrees') {
      const i = document.createElement('input');
      i.type = 'text';
      i.value = (v ?? []).join(' ');
      i.addEventListener('change', () => {
        const arr = i.value.split(/[\s,]+/).map(Number).filter(n => Number.isFinite(n));
        onChange(arr.length ? arr : [0]);
      });
      return i;
    }
    if (f.type === 'int') {
      const i = document.createElement('input');
      i.type = 'number';
      if (f.min != null) i.min = f.min;
      if (f.max != null) i.max = f.max;
      i.value = v ?? 0;
      i.addEventListener('change', () => onChange(clamp(Number(i.value), f.min, f.max)));
      return i;
    }
    const i = document.createElement('input');
    i.type = 'text';
    i.value = v ?? '';
    i.addEventListener('change', () => onChange(i.value || undefined));
    return i;
  }

  // ---- assets -------------------------------------------------------------

  const filePicker = document.createElement('input');
  filePicker.type = 'file';
  filePicker.accept = 'image/*';
  filePicker.style.display = 'none';
  document.body.appendChild(filePicker);
  let pickerKey = null;
  filePicker.addEventListener('change', async () => {
    const f = filePicker.files?.[0];
    if (f && pickerKey) {
      await assets.adopt(pickerKey, f);
      toast?.(`${pickerKey} ← ${f.name}`);
      refresh();
    }
    filePicker.value = '';
  });

  els.assets.innerHTML = `
    <div class="row wrap">
      <label class="inline"><input type="checkbox" id="ed-sprites-on"> use sprites</label>
      <label class="inline">px <input type="number" id="ed-sprite-size" value="32" min="8" max="128" step="8"></label>
    </div>
    <div class="row wrap">
      <button class="chip" id="ed-bake">bake placeholders</button>
      <button class="chip" id="ed-atlas">download atlas</button>
      <button class="chip" id="ed-manifest">copy manifest</button>
      <button class="chip" id="ed-clear-sprites">clear</button>
    </div>
    <div class="dropzone" id="ed-drop">
      drop PNGs here — filenames are matched to slots
      (<code>brass_elbow.png</code> → <code>brass.elbow</code>)
    </div>
    <div class="slots" id="ed-slots"></div>`;

  const spritesOn = els.assets.querySelector('#ed-sprites-on');
  const sizeInput = els.assets.querySelector('#ed-sprite-size');
  const slotsBox = els.assets.querySelector('#ed-slots');
  const drop = els.assets.querySelector('#ed-drop');

  spritesOn.checked = assets.mode !== 'schematic';
  spritesOn.addEventListener('change', () => {
    assets.mode = spritesOn.checked ? 'auto' : 'schematic';
    assets.slices.clear();
    refresh();
  });

  els.assets.querySelector('#ed-bake').addEventListener('click', () => {
    const n = bakeSessionSprites(assets, { size: size(), wing: game.room.wing });
    assets.mode = 'auto';
    spritesOn.checked = true;
    toast?.(`Baked ${n} placeholder tiles.`);
    refresh();
  });

  els.assets.querySelector('#ed-atlas').addEventListener('click', () => {
    const { canvas, manifest, sheetName } = bakeAtlas({ size: size(), wing: game.room.wing });
    canvas.toBlob((blob) => {
      download(blob, `${sheetName}.png`);
      download(new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }),
        'manifest.json');
      toast?.(`Atlas + manifest downloaded — drop both in assets/.`);
    }, 'image/png');
  });

  els.assets.querySelector('#ed-manifest').addEventListener('click', async () => {
    const json = JSON.stringify(assets.exportManifest(), null, 2);
    try { await navigator.clipboard.writeText(json); toast?.('Manifest copied.'); }
    catch { download(new Blob([json], { type: 'application/json' }), 'manifest.json'); }
  });

  els.assets.querySelector('#ed-clear-sprites').addEventListener('click', () => {
    assets.clearSession();
    toast?.('Session sprites cleared.');
    refresh();
  });

  for (const ev of ['dragenter', 'dragover']) {
    drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); });
  }
  for (const ev of ['dragleave', 'drop']) {
    drop.addEventListener(ev, () => drop.classList.remove('over'));
  }
  drop.addEventListener('drop', async (e) => {
    e.preventDefault();
    const files = [...(e.dataTransfer?.files ?? [])];
    if (!files.length) return;
    const { taken, missed } = await assets.adoptMany(files, spriteKeys());
    assets.mode = 'auto';
    spritesOn.checked = true;
    toast?.(`${taken.length} matched${missed.length ? `, ${missed.length} unmatched` : ''}.`);
    refresh();
  });

  function size() { return clamp(Number(sizeInput.value) || 32, 8, 128); }

  function refreshSlots() {
    const keys = spriteKeys();
    slotsBox.innerHTML = '';
    for (const key of keys) {
      const b = document.createElement('button');
      b.className = 'slot' + (assets.get(key) ? ' filled' : '');
      b.textContent = key;
      b.title = assets.get(key) ? 'Replace this sprite' : 'Assign a PNG to this slot';
      b.addEventListener('click', () => { pickerKey = key; filePicker.click(); });
      slotsBox.appendChild(b);
    }
    const filled = keys.filter(k => assets.get(k)).length;
    const head = document.createElement('div');
    head.className = 'muted slots-head';
    head.textContent = `${filled} / ${keys.length} slots filled`;
    slotsBox.prepend(head);
  }

  // ---- characters ---------------------------------------------------------

  els.legendHint.innerHTML = legendDoc()
    .map(([k, v]) => `<div><code>${escapeHtml(k)}</code><span>${escapeHtml(v)}</span></div>`)
    .join('');

  // ---- refresh ------------------------------------------------------------

  function refresh() {
    refreshTools();
    refreshPalette();
    refreshInspector();
    refreshSlots();
    drawPreviews();
  }

  assets.onChange = () => { drawPreviews(); refreshSlots(); };

  return { refresh, drawPreviews };
}

// What the tile ACTUALLY is, for display. `specAt` only knows the legend entry plus
// the override, so a timpani painted as a plain `p` looks like it has no octave — while
// the doodad standing there is tuned to 3. Show the live values; writes still go through
// specAt, so touching one field never freezes every default into an override.
function effectiveSpec(room, x, y) {
  const spec = room.specAt(x, y);
  if (!spec) return null;
  const d = room.doodadAt(x, y);
  if (!d) return spec;
  const out = { ...spec };
  for (const f of propsFor(spec.type)) {
    if (out[f.key] === undefined && d[f.key] !== undefined) out[f.key] = d[f.key];
  }
  return out;
}

// ---- helpers --------------------------------------------------------------

function iconButton(label, title, onClick) {
  const b = document.createElement('button');
  b.className = 'tool';
  b.textContent = label;
  b.title = title;
  b.addEventListener('click', onClick);
  return b;
}

function drawFloor(c, s) {
  c.fillStyle = '#e8dcc0';
  c.fillRect(0, 0, s, s);
  c.strokeStyle = '#c3b492';
  c.lineWidth = 1;
  for (let i = 1; i <= 4; i++) {
    c.beginPath(); c.moveTo(0, (i * s) / 5 + 0.5); c.lineTo(s, (i * s) / 5 + 0.5); c.stroke();
  }
}

function drawCoda(c, s) {
  drawFloor(c, s);
  c.beginPath();
  c.moveTo(s * 0.24, s * 0.72);
  c.lineTo(s * 0.24, s * 0.44);
  c.arc(s * 0.5, s * 0.44, s * 0.26, Math.PI, 0);
  c.lineTo(s * 0.76, s * 0.72);
  c.closePath();
  c.fillStyle = 'rgba(238,240,252,0.95)';
  c.fill();
  c.strokeStyle = '#3a3226';
  c.lineWidth = 1.5;
  c.stroke();
  c.fillStyle = '#3a3226';
  for (const dx of [-1, 1]) {
    c.beginPath();
    c.arc(s * 0.5 + dx * s * 0.1, s * 0.42, s * 0.045, 0, Math.PI * 2);
    c.fill();
  }
}

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function clamp(v, min, max) {
  if (!Number.isFinite(v)) v = min ?? 0;
  if (min != null) v = Math.max(min, v);
  if (max != null) v = Math.min(max, v);
  return v;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}
