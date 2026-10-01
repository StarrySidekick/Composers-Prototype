// Painting rooms on the canvas.
//
// The room is still stored as ASCII — that has not changed and shouldn't, it is what
// makes a room diffable and pasteable. What changed is that you no longer have to
// type it. Every edit here writes the character for you and rebuilds just that tile,
// so placing a tube is instant and the room you are standing in never reloads.
//
// Per-tile tweaks (a lock's group, a timpani's tuning) become entries in the room's
// `overrides` array rather than new legend characters, so the drawing stays readable.

import { DEFAULT_LEGEND, PLAYER_CHAR, EMPTY_CHAR } from '../core/room.js';


const HISTORY_LIMIT = 60;

export function createPaintEditor(game, renderer, { onEdit } = {}) {
  const state = {
    mode: 'play',       // play | build
    tool: 'paint',      // paint | erase | rect | rotate | pick | select
    char: '#',
    selected: null,
    hover: null,
  };

  const undoStack = [];
  const redoStack = [];
  let stroke = null;    // { last: 'x,y', anchor: {x,y} } while the pointer is down

  const room = () => game.room;

  // ---- history ------------------------------------------------------------

  function snapshot() {
    const r = room();
    return {
      layout: [...r.layout],
      overrides: r.overrides.map(o => ({ ...o })),
      legendExtra: { ...r.legendExtra },
      player: { x: game.player.x, y: game.player.y, facing: game.player.facing },
    };
  }

  function restore(s) {
    const r = room();
    r.layout = [...s.layout];
    r.overrides = s.overrides.map(o => ({ ...o }));
    r.legendExtra = { ...s.legendExtra };
    r.legend = { ...DEFAULT_LEGEND, ...r.legendExtra };
    r.build();
    game.waves = [];
    movePlayer(s.player.x, s.player.y);
    game.setFacing(s.player.facing);
    renderer.resize(r);
  }

  function begin() {
    undoStack.push(snapshot());
    if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
    redoStack.length = 0;
  }

  function undo() {
    if (!undoStack.length) return false;
    const now = snapshot();
    restore(undoStack.pop());
    redoStack.push(now);
    changed();
    return true;
  }

  function redo() {
    if (!redoStack.length) return false;
    const now = snapshot();
    restore(redoStack.pop());
    undoStack.push(now);
    changed();
    return true;
  }

  function changed() { onEdit?.(); }

  // ---- tile operations ----------------------------------------------------

  function movePlayer(x, y) {
    game.player.x = x; game.player.y = y;
    game.player.rx = x; game.player.ry = y;
  }

  function placePlayer(x, y) {
    const r = room();
    const old = r.playerCharPos();
    if (old) r.setTileChar(old.x, old.y, EMPTY_CHAR);
    r.setTileChar(x, y, PLAYER_CHAR);
    r.playerStart = { x, y, facing: game.player.facing };
    movePlayer(x, y);
  }

  function paintAt(x, y, ch = state.char) {
    const r = room();
    if (!r.inBounds(x, y)) return;
    if (ch === PLAYER_CHAR) { placePlayer(x, y); }
    else {
      // Painting over Coda would leave the room without a start, so move him aside
      // rather than deleting him.
      if (r.charAt(x, y) === PLAYER_CHAR) return;
      r.setTileChar(x, y, ch);
    }
    game.waves = [];
    state.selected = { x, y };
  }

  function eraseAt(x, y) { paintAt(x, y, EMPTY_CHAR); }

  function pickAt(x, y) {
    const ch = room().charAt(x, y);
    state.char = ch === PLAYER_CHAR ? PLAYER_CHAR : ch;
    state.selected = { x, y };
  }

  function rectAt(x0, y0, x1, y1, ch = state.char) {
    const r = room();
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
        if (!r.inBounds(x, y) || r.charAt(x, y) === PLAYER_CHAR) continue;
        r.setTileChar(x, y, ch);
      }
    }
    game.waves = [];
  }

  // Rotate in place. If a legend character already means "this doodad, rotated",
  // use it — an elbow should stay a `J`, not become a `7` with an override.
  function rotateAt(x, y) {
    const r = room();
    const spec = r.specAt(x, y);
    if (!spec) return;
    // Mirror drums turn in 45° steps (the head has four slants); everything else 90°.
    const step = spec.type === 'drum' && ['bass', 'tom', 'snare'].includes(spec.part) ? 45 : 90;
    applySpec(x, y, { ...spec, rot: (((spec.rot ?? 0) + step) % 360) });
  }

  // Write a full spec back to a tile the cheapest way it can be expressed.
  function applySpec(x, y, spec) {
    const r = room();
    const ch = r.charFor(spec);
    if (ch) {
      r.clearOverride(x, y);
      r.setTileChar(x, y, ch);
      return;
    }
    const base = r.legend[r.charAt(x, y)] ?? {};
    const props = {};
    for (const k of new Set([...Object.keys(spec), ...Object.keys(base)])) {
      if (k === 'type') continue;
      props[k] = eq(spec[k], base[k]) ? undefined : spec[k];
    }
    r.setOverride(x, y, props);
  }

  function setProp(x, y, key, value) {
    const spec = room().specAt(x, y);
    if (!spec) return;
    begin();
    applySpec(x, y, { ...spec, [key]: value });
    game.waves = [];
    changed();
  }

  function resize(w, h) {
    begin();
    room().resize(w, h);
    const r = room();
    movePlayer(Math.min(game.player.x, r.width - 1), Math.min(game.player.y, r.height - 1));
    if (state.selected && !r.inBounds(state.selected.x, state.selected.y)) state.selected = null;
    game.waves = [];
    renderer.resize(r);
    changed();
  }

  // ---- pointer ------------------------------------------------------------

  function act(x, y, erasing) {
    if (erasing) { eraseAt(x, y); return; }
    switch (state.tool) {
      case 'erase':  eraseAt(x, y); break;
      case 'pick':   pickAt(x, y); break;
      case 'rotate': rotateAt(x, y); break;
      case 'select': state.selected = { x, y }; break;
      case 'rect':   break;             // resolved on pointerup
      default:       paintAt(x, y); break;
    }
  }

  const canvas = renderer.canvas;

  canvas.addEventListener('contextmenu', (e) => { if (state.mode === 'build') e.preventDefault(); });

  canvas.addEventListener('pointerdown', (e) => {
    if (state.mode !== 'build') return;
    e.preventDefault();
    const { x, y } = renderer.pick(e.clientX, e.clientY);
    if (!room().inBounds(x, y)) return;
    const erasing = e.button === 2 || e.ctrlKey;
    canvas.setPointerCapture(e.pointerId);
    begin();
    stroke = { last: `${x},${y}`, anchor: { x, y }, erasing };
    if (state.tool === 'rect') { state.hover = { x, y }; syncOverlay(); return; }
    act(x, y, erasing);
    changed();
  });

  canvas.addEventListener('pointermove', (e) => {
    if (state.mode !== 'build') return;
    const { x, y } = renderer.pick(e.clientX, e.clientY);
    state.hover = room().inBounds(x, y) ? { x, y } : null;
    syncOverlay();
    if (!stroke || state.tool === 'rect') return;
    const k = `${x},${y}`;
    if (k === stroke.last || !room().inBounds(x, y)) return;
    stroke.last = k;
    act(x, y, stroke.erasing);
    changed();
  });

  const finish = (e) => {
    if (!stroke) return;
    if (state.tool === 'rect') {
      const { x, y } = renderer.pick(e.clientX, e.clientY);
      const a = stroke.anchor;
      if (room().inBounds(x, y)) {
        rectAt(a.x, a.y, x, y, stroke.erasing ? EMPTY_CHAR : state.char);
        state.selected = { x, y };
      }
    }
    stroke = null;
    changed();
  };
  canvas.addEventListener('pointerup', finish);
  canvas.addEventListener('pointercancel', () => { stroke = null; });
  canvas.addEventListener('pointerleave', () => { state.hover = null; syncOverlay(); });

  function syncOverlay() {
    renderer.edit = state.mode === 'build' ? {
      active: true,
      hover: state.hover,
      selected: state.selected,
      erasing: state.tool === 'erase',
      rect: stroke && state.tool === 'rect' ? { a: stroke.anchor, b: state.hover } : null,
    } : null;
  }

  // ---- api ----------------------------------------------------------------

  return {
    state,
    setMode(m) { state.mode = m; if (m !== 'build') state.hover = null; syncOverlay(); },
    setTool(t) { state.tool = t; syncOverlay(); },
    setChar(ch) { state.char = ch; if (state.tool === 'pick') state.tool = 'paint'; },
    select(x, y) { state.selected = room().inBounds(x, y) ? { x, y } : null; syncOverlay(); },
    setProp, resize, undo, redo, rotateAt, applySpec,
    get canUndo() { return undoStack.length > 0; },
    get canRedo() { return redoStack.length > 0; },
    syncOverlay,
    begin,
  };
}

function eq(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => v === b[i]);
  return (a ?? null) === (b ?? null);
}
