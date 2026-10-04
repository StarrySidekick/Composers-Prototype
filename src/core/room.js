// A room is an ASCII drawing plus a legend. That is still the storage format — but
// since the visual editor landed you rarely type it: you paint tiles and the drawing
// is written for you. Mirrors RoomData.cs for the musical attributes; the layout is
// prototype-only (Unity uses Tilemaps), including every edit helper at the bottom.

import { MusicalState } from './music.js';
import { createDoodad } from './doodad.js';
import { DIR } from './direction.js';

// Characters available in every room without declaring them. Rooms can override
// any of these, and add their own.
export const DEFAULT_LEGEND = {
  '.': null,
  ' ': null,
  '#': { type: 'wall' },
  'o': { type: 'peg' },

  // brass — direction of travel, unrotated
  '-': { type: 'brass', part: 'straight', rot: 0 },
  '|': { type: 'brass', part: 'straight', rot: 90 },
  '7': { type: 'brass', part: 'elbow', rot: 0 },    // ┐  left + bottom
  'J': { type: 'brass', part: 'elbow', rot: 90 },   // ┘  top + left
  'L': { type: 'brass', part: 'elbow', rot: 180 },  // └  right + top
  'F': { type: 'brass', part: 'elbow', rot: 270 },  // ┌  bottom + right
  'T': { type: 'brass', part: 'tee', rot: 0 },      // ┬  left-right, branches down
  '+': { type: 'brass', part: 'cross', rot: 0 },    // ┼  two channels, no mixing
  'M': { type: 'brass', part: 'mouthpiece', rot: 0 },
  'Y': { type: 'brass', part: 'flare', rot: 0 },
  'V': { type: 'brass', part: 'valve', rot: 0 },
  'S': { type: 'brass', part: 'slide', rot: 0 },
  'u': { type: 'brass', part: 'mute', rot: 0 },

  // strings
  '=': { type: 'string', rot: 0 },   // horizontal string
  'H': { type: 'string', rot: 90 },  // vertical string

  // percussion
  // bass, tom, snare are mirrors: their default heads are / \ and — (see percussion.js)
  's': { type: 'drum', part: 'snare', rot: 45 },
  'b': { type: 'drum', part: 'bass', rot: 0 },
  'h': { type: 'drum', part: 'hat' },
  't': { type: 'drum', part: 'tom', rot: 90 },
  'p': { type: 'drum', part: 'timpani' },
  'c': { type: 'drum', part: 'cymbal' },

  // keys
  'k': { type: 'pianokey' },
  'm': { type: 'mallet', rot: 0 },

  // blank-slate per-face instrument (Strumentino.cs). Every face passes waves and
  // blocks Coda until the room overrides it — see the editor's character list.
  'i': { type: 'strumentino' },

  // woodwind (src/doodads/woodwind.js). A flute is a straight run, head on the
  // left at rot 0: Q then q holes then d. The reed's bell faces right at rot 0.
  'Q': { type: 'flute', part: 'head', rot: 0 },
  'q': { type: 'flute', part: 'hole', rot: 0 },
  'd': { type: 'flute', part: 'foot', rot: 0 },
  'r': { type: 'reed', rot: 0 },

  // things to find (src/doodads/pickups.js)
  'O': { type: 'pickup', item: 'overtone' },
  '!': { type: 'pickup', item: 'burin' },

  // the first enemy (src/doodads/enemy.js)
  '&': { type: 'dissonant', rot: 0, path: 'line' },

  // puzzle
  '*': { type: 'lock' },
  '%': { type: 'lock', sustain: 2 },     // a chord fork: rings 2 beats, then dark
  '$': { type: 'scorelock', layers: 6 }, // opens once the score has 6 layers
  'n': { type: 'notelock' },
  'D': { type: 'door' },
  'X': { type: 'exit' },
  'x': { type: 'dissonance' },
  '<': { type: 'keyshift', delta: -1 },
  '>': { type: 'keyshift', delta: 1 },
  '^': { type: 'keyshift', delta: 1, climb: true, rot: 0 },   // a stair: up raises, down lowers
};

export const EMPTY_CHAR = '.';
export const PLAYER_CHAR = '@';

export class Room {
  constructor(json) {
    this.source = json;
    this.id = json.id ?? 'untitled';
    this.name = json.name ?? this.id;
    this.wing = json.wing ?? 'brass';
    this.hint = json.hint ?? '';
    this.music = new MusicalState(json.music ?? {});
    this.legendExtra = { ...(json.legend ?? {}) };
    this.legend = { ...DEFAULT_LEGEND, ...this.legendExtra };
    this.layout = [...(json.layout ?? [])];
    this.overrides = (json.overrides ?? []).map(o => ({ ...o }));
    // A room may cap (or, in free play, set) how many of the Key's waves can sound
    // at once. Null, the usual case in the world, means "whatever Coda has found":
    // one, plus one per Overtone (src/core/progress.js).
    this.maxWaves = json.maxWaves ?? null;
    // Waves travelling in this room. Each room keeps its own, because a wave can go
    // out through an open door and carry on next door while you are elsewhere.
    this.waves = [];
    this.build();
  }

  build() {
    this.height = Math.max(1, this.layout.length);
    this.width = Math.max(1, this.layout.reduce((m, r) => Math.max(m, r.length), 0));
    // Normalise to a full rectangle so every edit op can assume layout[y][x] exists.
    this.layout = Array.from({ length: this.height },
      (_, y) => (this.layout[y] ?? '').padEnd(this.width, EMPTY_CHAR));

    this.tiles = Array.from({ length: this.height }, () => new Array(this.width).fill(null));
    this.list = [];
    this.playerStart = { x: 1, y: 1, facing: this.source.player?.facing ?? 'right' };

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) this.buildTile(x, y);
    }

    if (this.source.player && this.source.player.x != null) {
      this.playerStart = { facing: 'right', ...this.source.player };
    }
  }

  // Instantiate the doodad for one cell from its character + any per-tile override.
  buildTile(x, y) {
    const ch = this.layout[y][x];
    if (ch === PLAYER_CHAR) {
      this.playerStart = { x, y, facing: this.playerStart?.facing ?? 'right' };
      this.setDoodad(x, y, null);
      return null;
    }
    const spec = this.legend[ch];
    if (!spec) { this.setDoodad(x, y, null); return null; }
    const ov = this.overrideAt(x, y);
    const d = createDoodad({ ...spec, ...stripXY(ov) }, x, y);
    this.setDoodad(x, y, d ?? null);
    return d;
  }

  inBounds(x, y) { return x >= 0 && y >= 0 && x < this.width && y < this.height; }

  doodadAt(x, y) { return this.inBounds(x, y) ? this.tiles[y][x] : null; }

  charAt(x, y) { return this.inBounds(x, y) ? this.layout[y][x] : EMPTY_CHAR; }

  setDoodad(x, y, d) {
    if (!this.inBounds(x, y)) return;
    const old = this.tiles[y][x];
    if (old) this.list.splice(this.list.indexOf(old), 1);
    this.tiles[y][x] = d;
    if (d) { d.x = x; d.y = y; this.list.push(d); }
  }

  isWalkable(x, y) {
    if (!this.inBounds(x, y)) return false;
    const d = this.doodadAt(x, y);
    return !d || !d.solid;
  }

  // IPlayerFaceInteractable.CanPlayerEnterFrom — a doodad can be solid from one
  // side and open from another, which is what makes a per-face Strumentino work.
  // Doodads without the hook fall back to the plain solid flag.
  canEnter(x, y, dir) {
    if (!this.inBounds(x, y)) return false;
    const d = this.doodadAt(x, y);
    if (!d) return true;
    if (typeof d.canPlayerEnterFrom === 'function') return d.canPlayerEnterFrom(dir);
    return !d.solid;
  }

  each(fn) { for (const d of this.list) fn(d); }

  ofGroup(group) { return this.list.filter(d => d.group === group); }

  // ---- editing (prototype-only; do NOT port — Unity authors rooms as scenes) ----

  overrideAt(x, y) { return this.overrides.find(o => o.x === x && o.y === y) ?? null; }

  playerCharPos() {
    for (let y = 0; y < this.height; y++) {
      const x = this.layout[y].indexOf(PLAYER_CHAR);
      if (x >= 0) return { x, y };
    }
    return null;
  }

  // Paint one character. Returns the doodad now on that tile (or null).
  setTileChar(x, y, ch) {
    if (!this.inBounds(x, y)) return null;
    const row = this.layout[y];
    this.layout[y] = row.slice(0, x) + ch + row.slice(x + 1);
    // An override describes a tweak to the thing that was on this tile. Painting
    // replaces the thing, so the tweak goes with it — otherwise a lock's group or a
    // slide's extension would silently land on whatever you paint next.
    this.clearOverride(x, y);
    return this.buildTile(x, y);
  }

  // Per-tile property tweaks live in `overrides`, keyed by position, and are merged
  // over the legend spec at build time. This is how the inspector edits a tile
  // without inventing a new legend character for every variation.
  setOverride(x, y, props) {
    if (!this.inBounds(x, y)) return null;
    let ov = this.overrideAt(x, y);
    if (!ov) { ov = { x, y }; this.overrides.push(ov); }
    Object.assign(ov, props);
    for (const k of Object.keys(ov)) if (ov[k] === undefined) delete ov[k];
    // An override that says nothing is just noise in the JSON.
    if (Object.keys(ov).length <= 2) this.clearOverride(x, y);
    return this.buildTile(x, y);
  }

  clearOverride(x, y) {
    const i = this.overrides.findIndex(o => o.x === x && o.y === y);
    if (i >= 0) this.overrides.splice(i, 1);
  }

  // The full spec a tile resolves to — legend entry plus override. Feeds the inspector.
  specAt(x, y) {
    const ch = this.charAt(x, y);
    const base = this.legend[ch];
    if (!base) return null;
    return { ...base, ...stripXY(this.overrideAt(x, y)) };
  }

  setLegendEntry(ch, spec) {
    if (spec) { this.legend[ch] = spec; this.legendExtra[ch] = spec; }
    else { delete this.legendExtra[ch]; this.legend[ch] = DEFAULT_LEGEND[ch] ?? null; }
  }

  // The first character in the legend whose spec matches `spec` exactly on the keys
  // `spec` declares. Lets the editor paint a rotated elbow as 'J' instead of '7' plus
  // an override — the ASCII stays readable.
  charFor(spec) {
    const keys = Object.keys(spec).filter(k => k !== 'x' && k !== 'y');
    for (const [ch, s] of Object.entries(this.legend)) {
      if (!s || s.type !== spec.type) continue;
      const sKeys = Object.keys(s);
      if (sKeys.length !== keys.length) continue;
      if (keys.every(k => (s[k] ?? null) === (spec[k] ?? null))) return ch;
    }
    return null;
  }

  resize(w, h) {
    w = Math.max(3, Math.min(64, Math.round(w)));
    h = Math.max(3, Math.min(64, Math.round(h)));
    const start = this.playerStart;
    this.layout = Array.from({ length: h },
      (_, y) => (this.layout[y] ?? '').padEnd(w, EMPTY_CHAR).slice(0, w));
    this.overrides = this.overrides.filter(o => o.x < w && o.y < h);
    this.build();
    // build() re-reads '@' from the layout; if it fell off the edge, put it back.
    if (!this.playerCharPos() && start) {
      const x = Math.max(0, Math.min(start.x, w - 2));
      const y = Math.max(0, Math.min(start.y, h - 2));
      this.setTileChar(x, y, PLAYER_CHAR);
      this.playerStart = { x, y, facing: start.facing };
    }
  }

  // Player position is stored in the layout as '@' so the editor round-trips cleanly.
  layoutWith(player) {
    return this.layout.map((row, y) => {
      const chars = row.padEnd(this.width, EMPTY_CHAR).split('');
      for (let x = 0; x < chars.length; x++) if (chars[x] === PLAYER_CHAR) chars[x] = EMPTY_CHAR;
      if (player && player.y === y && player.x < chars.length) chars[player.x] = PLAYER_CHAR;
      return chars.join('');
    });
  }

  toJSON(player) {
    return {
      id: this.id,
      name: this.name,
      wing: this.wing,
      hint: this.hint || undefined,
      maxWaves: this.maxWaves ?? undefined,
      music: this.music.toJSON(),
      legend: Object.keys(this.legendExtra).length ? this.legendExtra : undefined,
      overrides: this.overrides.length ? this.overrides.map(o => ({ ...o })) : undefined,
      player: player ? { facing: player.facing } : undefined,
      layout: this.layoutWith(player),
      // The known way through, replayed by test/solve.mjs. Kept as authored.
      solution: this.source.solution,
    };
  }
}

function stripXY(o) {
  if (!o) return {};
  const { x, y, ...rest } = o;
  return rest;
}

export function facingDir(name) { return DIR[name] ?? DIR.right; }
