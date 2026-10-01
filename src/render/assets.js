// The sprite store.
//
// The prototype can always draw every tile procedurally (draw()), but there are two
// better sources of a picture, and the store decides between them:
//
//   real         PNGs from the Unity project, listed in assets/manifest.json
//   placeholder  generated sketch art in the house style (src/art/placeholders.js),
//                for every slot nobody has drawn yet
//
// Lookup takes a list of keys, most specific first (`wall.ns`, then `wall`), so a
// linked tile falls back to its plain drawing. `mode` picks the order:
//
//   real       real > placeholder > draw()     the default: show what exists
//   sketch     placeholder > real > draw()     the whole room in placeholders
//   schematic  draw() only                     the mechanics view
//
// Colour is applied here, not baked into files: the art is white line-work and a
// manifest entry may carry an `ink` (tint) and `flipX`, the same way Unity sets a
// SpriteRenderer's colour and flip.

import { INK, STATE_INK } from '../art/protocol.js';
import { drawPlaceholder, PLACEHOLDERS } from '../art/placeholders.js';

const EXT = /\.(png|webp|gif|jpe?g)$/i;
const NOISE = /^(spr|sprite|tile|tex|img|icon|asset)[-_ ]/i;
export const MODES = ['real', 'sketch', 'schematic'];

export class AssetStore {
  constructor() {
    this.manifest = { tileSize: 51, ink: INK, sheets: {}, sprites: {}, unity: {} };
    this.images = new Map();   // src -> HTMLImageElement
    this.slices = new Map();   // key -> slice | null       (real art)
    this.drafts = new Map();   // key -> slice | null       (placeholders)
    this.session = new Map();  // key -> {image, ...}  — dropped in this tab, unsaved
    this.mode = 'real';
    this.onChange = null;
    this.baseUrl = 'assets/';
  }

  // Tolerant on purpose: no assets/ directory is a valid state of this repo.
  async load(url = 'assets/manifest.json') {
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) return this;
      const json = await res.json();
      this.manifest = {
        tileSize: json.tileSize ?? 51,
        ink: json.ink ?? INK,
        sheets: json.sheets ?? {},
        sprites: json.sprites ?? {},
        unity: json.unity ?? {},
      };
      this.baseUrl = url.replace(/[^/]*$/, '');
      const srcs = new Set();
      for (const s of Object.values(this.manifest.sheets)) if (s.src) srcs.add(s.src);
      for (const s of Object.values(this.manifest.sprites)) if (s.src) srcs.add(s.src);
      await Promise.all([...srcs].map(src => this._image(this.baseUrl + src, src)));
      this.slices.clear();
    } catch (err) {
      console.warn('Asset manifest not loaded:', err.message);
    }
    this.onChange?.();
    return this;
  }

  _image(url, key = url) {
    if (this.images.has(key)) return Promise.resolve(this.images.get(key));
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => { this.images.set(key, img); resolve(img); };
      img.onerror = () => { console.warn(`Sprite sheet missing: ${url}`); resolve(null); };
      img.src = url;
    });
  }

  get spriteCount() { return this.session.size + Object.keys(this.manifest.sprites).length; }

  get enabled() { return this.mode !== 'schematic'; }

  // Best picture for the first key in `keys` that has one, or null for draw().
  resolve(keys) {
    if (this.mode === 'schematic') return null;
    const list = (Array.isArray(keys) ? keys : [keys]).filter(Boolean);
    const order = this.mode === 'sketch' ? ['draft', 'real'] : ['real', 'draft'];
    for (const layer of order) {
      for (const k of list) {
        const s = layer === 'real' ? this.real(k) : this.draft(k);
        if (s) return s;
      }
    }
    return null;
  }

  // Kept for callers that only have one key.
  get(key) { return this.resolve([key]); }
  has(key) { return !!this.get(key); }

  // Real art only: a dropped file, or the manifest.
  real(key) {
    if (!key) return null;
    if (this.session.has(key)) return this.session.get(key);
    if (this.slices.has(key)) return this.slices.get(key);

    const spec = this.manifest.sprites[key];
    let slice = null;
    if (spec) {
      if (spec.src) {
        const img = this.images.get(spec.src);
        if (img) slice = { image: img, sx: 0, sy: 0, sw: img.width, sh: img.height };
      } else if (spec.sheet) {
        const sheet = this.manifest.sheets[spec.sheet];
        const img = sheet && this.images.get(sheet.src);
        if (img) {
          const t = sheet.tile ?? this.manifest.tileSize;
          slice = { image: img, sx: (spec.col ?? 0) * t, sy: (spec.row ?? 0) * t, sw: t, sh: t };
        }
      }
      if (slice) slice = prepare(slice, spec.ink ?? STATE_INK[key] ?? this.manifest.ink, !!spec.flipX);
    }
    this.slices.set(key, slice);
    return slice;
  }

  // Placeholder only. Generated once per key, then cached.
  draft(key) {
    if (!key || !PLACEHOLDERS[key]) return null;
    if (this.drafts.has(key)) return this.drafts.get(key);
    let slice = null;
    try {
      const cv = drawPlaceholder(key);
      if (cv) slice = prepare({ image: cv, sx: 0, sy: 0, sw: cv.width, sh: cv.height }, STATE_INK[key] ?? INK, false);
      if (slice) slice.draft = true;
    } catch (err) {
      console.warn(`Placeholder ${key} failed:`, err.message);
    }
    this.drafts.set(key, slice);
    return slice;
  }

  // A PNG dropped onto the editor. Session-only — `exportManifest` writes down where
  // it should live so it can be committed properly.
  async adopt(key, file) {
    const url = URL.createObjectURL(file);
    const img = await new Promise((resolve) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => resolve(null);
      i.src = url;
    });
    if (!img) { URL.revokeObjectURL(url); return false; }
    const old = this.session.get(key);
    if (old?.objectUrl) URL.revokeObjectURL(old.objectUrl);
    this.session.set(key, {
      ...prepare({ image: img, sx: 0, sy: 0, sw: img.width, sh: img.height },
        STATE_INK[key] ?? this.manifest.ink, false),
      objectUrl: url, filename: file.name ?? `${key}.png`,
    });
    this.onChange?.();
    return true;
  }

  // Drop a whole folder of Unity exports and let the filenames find their own slots.
  async adoptMany(files, knownKeys) {
    const taken = [];
    const missed = [];
    for (const f of files) {
      if (!EXT.test(f.name ?? '')) continue;
      const key = matchKey(f.name, knownKeys);
      if (!key) { missed.push(f.name); continue; }
      if (await this.adopt(key, f)) taken.push({ key, file: f.name });
    }
    return { taken, missed };
  }

  clearSession() {
    for (const s of this.session.values()) if (s.objectUrl) URL.revokeObjectURL(s.objectUrl);
    this.session.clear();
    this.onChange?.();
  }

  // The manifest to save into assets/manifest.json once the PNGs are copied in.
  exportManifest() {
    const sprites = { ...this.manifest.sprites };
    for (const [key, s] of this.session) if (!s.baked) sprites[key] = { src: s.filename };
    return {
      tileSize: this.manifest.tileSize,
      ink: this.manifest.ink,
      sheets: this.manifest.sheets,
      sprites,
      unity: this.manifest.unity,
    };
  }
}

// Recolour a slice to `ink` (keeping its alpha) and optionally mirror it, into a
// canvas of its own so the draw loop stays a plain drawImage. Same idea as Unity's
// SpriteRenderer.color: multiply white line-work by a colour.
function prepare(slice, ink, flipX) {
  if ((!ink || ink.toLowerCase() === 'none') && !flipX) return slice;
  const cv = document.createElement('canvas');
  cv.width = slice.sw; cv.height = slice.sh;
  const c = cv.getContext('2d');
  if (flipX) { c.translate(cv.width, 0); c.scale(-1, 1); }
  c.drawImage(slice.image, slice.sx, slice.sy, slice.sw, slice.sh, 0, 0, slice.sw, slice.sh);
  if (ink && ink.toLowerCase() !== 'none') {
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = ink;
    c.fillRect(0, 0, cv.width, cv.height);
  }
  return { image: cv, sx: 0, sy: 0, sw: cv.width, sh: cv.height, source: slice };
}

// "Brass_Tube_Straight.png" -> tokens {brass, tube, straight}; the key whose own
// tokens are all present wins, longest key first so `brass.mute.open` beats `brass.mute`.
export function matchKey(filename, knownKeys = []) {
  const tokens = new Set(tokenise(filename));
  let best = null, bestScore = 0;
  for (const key of knownKeys) {
    const kt = tokenise(key);
    if (!kt.length || !kt.every(t => tokens.has(t))) continue;
    if (kt.length > bestScore) { best = key; bestScore = kt.length; }
  }
  return best;
}

function tokenise(s) {
  return String(s)
    .replace(EXT, '')
    .replace(NOISE, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}
