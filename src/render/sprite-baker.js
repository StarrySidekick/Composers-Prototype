// Placeholder art generator.
//
// Every tile the prototype knows how to draw can be baked into a fixed-size canvas
// and packed into an atlas PNG. Two uses:
//
//   1. It is the fastest way to get a complete, correctly-gridded placeholder set
//      into the Unity project — one PNG plus a manifest, cut to the tile size you
//      ask for, with every doodad state (open door, lit lock, slide positions).
//   2. It proves the sprite path works before any real art exists: turn sprites on
//      with an empty assets/ directory and the game renders from baked images
//      instead of live draw() calls, so a missing-art bug shows up here, not later.
//
// Real Unity exports land in exactly the same slots — see docs/ASSETS.md.

import { DEFAULT_LEGEND } from '../core/room.js';
import { createDoodad } from '../core/doodad.js';
import { PALETTE } from './palette.js';
import '../doodads/index.js';

// States a doodad has that its sprite key distinguishes. Anything not listed bakes
// once, in its resting state.
const VARIANTS = {
  'door':        [{}, { open: true }],
  'lock':        [{}, { lit: true }],
  'notelock':    [{}, { lit: true }],
  'brass.mute':  [{ muted: true }, { muted: false }],
  'brass.slide': [{ extend: 0 }, { extend: 1 }, { extend: 2 }, { extend: 3 }],
};

// Every sprite slot the game can ask for: { key, spec, state }.
// Derived from the legend so a new doodad gets a slot the moment it gets a character.
export function spriteSlots() {
  const slots = [];
  const seen = new Set();
  for (const spec of Object.values(DEFAULT_LEGEND)) {
    if (!spec) continue;
    const base = { ...spec, rot: 0 };
    const id = `${base.type}|${base.part ?? ''}`;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const state of VARIANTS[trimKey(id)] ?? [{}]) {
      const d = createDoodad(base, 0, 0);
      if (!d) continue;
      Object.assign(d, state);
      slots.push({ key: d.spriteKey, spec: base, state });
    }
  }
  // Distinct specs can still resolve to one key (both keyshift characters do not, but
  // a future pair might); last one wins and the list stays unique.
  const byKey = new Map(slots.map(s => [s.key, s]));
  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
}

function trimKey(id) { return id.endsWith('|') ? id.slice(0, -1) : id.replace('|', '.'); }

export function spriteKeys() { return spriteSlots().map(s => s.key); }

// Draw one spec into a 2d context at (0,0), size px square — sprite if the store has
// one, procedural otherwise. Shared by the palette previews and the baker so a brush
// button always looks like the tile it paints.
export function renderSpec(c, spec, size = 32, wing = 'brass', assets = null, state = null) {
  const d = createDoodad(spec, 0, 0);
  if (!d) return false;
  if (state) Object.assign(d, state);
  d.flash = d.hit = d.press = d.swing = d.vibrate = 0;
  const ctx = fakeContext(wing);
  const sprite = assets?.get(d.spriteKey);
  c.save();
  if (sprite) {
    c.imageSmoothingEnabled = false;
    c.translate(size / 2, size / 2);
    c.rotate((d.spriteRot * Math.PI) / 180);
    c.drawImage(sprite.image, sprite.sx, sprite.sy, sprite.sw, sprite.sh,
      -size / 2, -size / 2, size, size);
    c.translate(-size / 2, -size / 2);
    d.overlay(c, size, ctx);
  } else {
    d.draw(c, size, ctx);
  }
  c.restore();
  return true;
}

// Bake one slot into its own canvas at `size` px. `wing` picks the palette for the
// tiles that are wing-tinted (walls, doors, locks).
export function bakeSlot(slot, size = 32, wing = 'brass') {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  // Sprites are authored unrotated; the renderer spins them.
  renderSpec(cv.getContext('2d'), { ...slot.spec, rot: 0 }, size, wing, null, slot.state);
  return cv;
}

// The whole set, packed left-to-right into one atlas.
export function bakeAtlas({ size = 32, wing = 'brass', columns = 8 } = {}) {
  const slots = spriteSlots();
  const cols = Math.min(columns, Math.max(1, slots.length));
  const rows = Math.ceil(slots.length / cols);
  const cv = document.createElement('canvas');
  cv.width = cols * size;
  cv.height = rows * size;
  const c = cv.getContext('2d');
  c.imageSmoothingEnabled = false;

  const sheetName = `placeholders-${wing}`;
  const sprites = {};
  slots.forEach((slot, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    c.drawImage(bakeSlot(slot, size, wing), col * size, row * size);
    sprites[slot.key] = { sheet: sheetName, col, row };
  });

  const manifest = {
    tileSize: size,
    sheets: { [sheetName]: { src: `${sheetName}.png`, tile: size } },
    sprites,
    unity: Object.fromEntries(slots.map(s => [s.key, ''])),
  };
  return { canvas: cv, manifest, slots, cols, rows, sheetName };
}

// A live, in-memory sprite set for the whole game with no files involved. Handy for
// "does anything break when this renders from images?" — and it is what the editor's
// *bake placeholders* button loads.
export function bakeSessionSprites(store, { size = 32, wing = 'brass' } = {}) {
  const slots = spriteSlots();
  store.clearSession();
  for (const slot of slots) {
    const cv = bakeSlot(slot, size, wing);
    store.session.set(slot.key, {
      image: cv, sx: 0, sy: 0, sw: size, sh: size,
      filename: `${slot.key.replace(/\./g, '_')}.png`, baked: true,
    });
  }
  store.onChange?.();
  return slots.length;
}

// draw() only ever reaches for ctx.room.wing; give it that and nothing else.
function fakeContext(wing) {
  const w = PALETTE.wings.includes(wing) ? wing : 'brass';
  return { room: { wing: w, music: null }, play() {}, toast() {} };
}
