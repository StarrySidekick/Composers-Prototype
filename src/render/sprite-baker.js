// Sprite slots, and the atlas exporter.
//
// spriteSlots() is the list of every picture the game can ask for, derived from the
// legend (so a new doodad gets a slot the moment it gets a character), plus every
// linked variant a tile rule can produce (`wall.ns`, `pianokey.ew`).
//
// bakeAtlas() packs a set into one PNG plus a matching manifest, cut to whatever
// tile size you ask for. Its main use now is getting the sketch placeholders into
// Unity as a complete, correctly-gridded set before the real art exists.
//
// Real Unity exports land in exactly the same slots — see docs/ASSETS.md.

import { DEFAULT_LEGEND } from '../core/room.js';
import { createDoodad } from '../core/doodad.js';
import { PALETTE } from './palette.js';
import { LINKS, linkVariants } from '../art/links.js';
import { TILE } from '../art/protocol.js';
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
  // Linked variants share their base slot's spec; only the art differs.
  for (const slot of [...slots]) {
    if (!LINKS[slot.spec.type] || slot.key !== slot.spec.type) continue;
    for (const v of linkVariants(slot.spec.type)) {
      slots.push({ ...slot, key: `${slot.key}.${v}`, linkOf: slot.key });
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
export function renderSpec(c, spec, size = 32, wing = 'brass', assets = null, state = null, key = null) {
  const d = createDoodad(spec, 0, 0);
  if (!d) return false;
  if (state) Object.assign(d, state);
  d.flash = d.hit = d.press = d.swing = d.vibrate = 0;
  const ctx = fakeContext(wing);
  const sprite = assets?.resolve([key, d.spriteKey]);
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

// Bake one slot into its own canvas at `size` px, from whatever `assets` resolves
// for it in its current mode (or draw() if nothing). Sprites are authored unrotated.
export function bakeSlot(slot, size = TILE, wing = 'brass', assets = null) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  renderSpec(cv.getContext('2d'), { ...slot.spec, rot: 0 }, size, wing, assets, slot.state, slot.key);
  return cv;
}

// The whole set, packed left-to-right into one atlas. With `mode: 'sketch'` it is
// the placeholder set; with 'real' it is what the game shows today.
export function bakeAtlas({ size = TILE, wing = 'brass', columns = 8, assets = null, mode = 'sketch' } = {}) {
  const slots = spriteSlots();
  const cols = Math.min(columns, Math.max(1, slots.length));
  const rows = Math.ceil(slots.length / cols);
  const cv = document.createElement('canvas');
  cv.width = cols * size;
  cv.height = rows * size;
  const c = cv.getContext('2d');
  c.imageSmoothingEnabled = false;

  const was = assets?.mode;
  if (assets) assets.mode = mode;
  const sheetName = `${mode === 'sketch' ? 'placeholders' : 'tiles'}-${size}`;
  const sprites = {};
  try {
    slots.forEach((slot, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      c.drawImage(bakeSlot(slot, size, wing, assets), col * size, row * size);
      sprites[slot.key] = { sheet: sheetName, col, row };
    });
  } finally {
    if (assets) assets.mode = was;
  }

  const manifest = {
    tileSize: size,
    sheets: { [sheetName]: { src: `${sheetName}.png`, tile: size } },
    sprites,
    unity: Object.fromEntries(slots.map(s => [s.key, ''])),
  };
  return { canvas: cv, manifest, slots, cols, rows, sheetName };
}

// draw() only ever reaches for ctx.room.wing; give it that and nothing else.
function fakeContext(wing) {
  const w = PALETTE.wings.includes(wing) ? wing : 'brass';
  return { room: { wing: w, music: null }, play() {}, toast() {} };
}
