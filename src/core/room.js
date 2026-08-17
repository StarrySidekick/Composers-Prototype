// A room is an ASCII drawing plus a legend. That is the whole authoring format —
// you edit a picture of the room, not a scene graph. Mirrors RoomData.cs for the
// musical attributes; the layout is prototype-only (Unity uses Tilemaps).

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
  'M': { type: 'brass', part: 'mouthpiece', rot: 0 },
  'Y': { type: 'brass', part: 'flare', rot: 0 },
  'V': { type: 'brass', part: 'valve', rot: 0 },

  // strings
  '=': { type: 'string', rot: 0 },   // horizontal string
  'H': { type: 'string', rot: 90 },  // vertical string

  // percussion
  's': { type: 'drum', part: 'snare' },
  'b': { type: 'drum', part: 'bass', rot: 0 },
  'h': { type: 'drum', part: 'hat' },

  // keys
  'k': { type: 'pianokey' },
  'm': { type: 'mallet', rot: 0 },

  // puzzle
  '*': { type: 'lock' },
  'n': { type: 'notelock' },
  'D': { type: 'door' },
  'X': { type: 'exit' },
  'x': { type: 'dissonance' },
  '<': { type: 'keyshift', delta: -1 },
  '>': { type: 'keyshift', delta: 1 },
};

export class Room {
  constructor(json) {
    this.source = json;
    this.id = json.id ?? 'untitled';
    this.name = json.name ?? this.id;
    this.wing = json.wing ?? 'brass';
    this.hint = json.hint ?? '';
    this.music = new MusicalState(json.music ?? {});
    this.legend = { ...DEFAULT_LEGEND, ...(json.legend ?? {}) };
    this.layout = [...(json.layout ?? [])];
    this.overrides = json.overrides ?? [];
    this.maxWaves = json.maxWaves ?? 1;
    this.build();
  }

  build() {
    this.height = this.layout.length;
    this.width = this.layout.reduce((m, r) => Math.max(m, r.length), 0);
    this.tiles = Array.from({ length: this.height }, () => new Array(this.width).fill(null));
    this.list = [];
    this.playerStart = { x: 1, y: 1, facing: 'right' };

    for (let y = 0; y < this.height; y++) {
      const row = this.layout[y];
      for (let x = 0; x < this.width; x++) {
        const ch = row[x] ?? ' ';
        if (ch === '@') {
          this.playerStart = {
            x, y,
            facing: this.source.player?.facing ?? 'right',
          };
          continue;
        }
        const spec = this.legend[ch];
        if (!spec) continue;
        const ov = this.overrides.find(o => o.x === x && o.y === y);
        const d = createDoodad({ ...spec, ...(ov ?? {}) }, x, y);
        if (d) { this.tiles[y][x] = d; this.list.push(d); }
      }
    }

    if (this.source.player && this.source.player.x != null) {
      this.playerStart = { facing: 'right', ...this.source.player };
    }
  }

  inBounds(x, y) { return x >= 0 && y >= 0 && x < this.width && y < this.height; }

  doodadAt(x, y) { return this.inBounds(x, y) ? this.tiles[y][x] : null; }

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

  each(fn) { for (const d of this.list) fn(d); }

  ofGroup(group) { return this.list.filter(d => d.group === group); }

  // Player position is stored in the layout as '@' so the editor round-trips cleanly.
  layoutWith(player) {
    return this.layout.map((row, y) => {
      const chars = row.padEnd(this.width, ' ').split('');
      if (player && player.y === y) chars[player.x] = '@';
      return chars.join('').replace(/\s+$/, '');
    });
  }

  toJSON(player) {
    return {
      id: this.id,
      name: this.name,
      wing: this.wing,
      hint: this.hint || undefined,
      maxWaves: this.maxWaves,
      music: this.music.toJSON(),
      legend: this.source.legend ?? undefined,
      layout: this.layoutWith(player),
    };
  }
}

export function facingDir(name) { return DIR[name] ?? DIR.right; }
