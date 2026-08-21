// The sprite store.
//
// The prototype draws every tile procedurally, and it will keep doing that forever —
// schematic art is genuinely better for judging a mechanic. But two things want real
// pictures: checking that a room still reads once it is dressed, and handing Unity a
// set of placeholder tiles cut to the right grid.
//
// So: every doodad names a sprite key (`brass.elbow`, `door.open`). If the store has
// an image for that key it is blitted; if it doesn't, draw() runs as before. Nothing
// here is required for the game to work — an empty manifest is a valid manifest.

const EXT = /\.(png|webp|gif|jpe?g)$/i;
const NOISE = /^(spr|sprite|tile|tex|img|icon|asset)[-_ ]/i;

export class AssetStore {
  constructor() {
    this.manifest = { tileSize: 32, sheets: {}, sprites: {}, unity: {} };
    this.images = new Map();   // src -> HTMLImageElement
    this.slices = new Map();   // key -> {image, sx, sy, sw, sh} | null
    this.session = new Map();  // key -> {image, ...}  — dropped in this tab, unsaved
    this.mode = 'auto';        // auto | sprites | schematic
    this.onChange = null;
    this.baseUrl = 'assets/';
  }

  // Tolerant on purpose: no assets/ directory is the normal state of this repo.
  async load(url = 'assets/manifest.json') {
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) return this;
      const json = await res.json();
      this.manifest = {
        tileSize: json.tileSize ?? 32,
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

  get enabled() { return this.mode !== 'schematic' && this.spriteCount > 0; }

  // Resolved sprite for a key, or null to fall back to draw().
  get(key) {
    if (!key || this.mode === 'schematic') return null;
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
    }
    this.slices.set(key, slice);
    return slice;
  }

  has(key) { return !!this.get(key); }

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
      image: img, sx: 0, sy: 0, sw: img.width, sh: img.height,
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
    for (const [key, s] of this.session) sprites[key] = { src: s.filename };
    return {
      tileSize: this.manifest.tileSize,
      sheets: this.manifest.sheets,
      sprites,
      unity: this.manifest.unity,
    };
  }
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
