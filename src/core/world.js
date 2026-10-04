// The world: rooms on a grid, joined by doors in their outer walls.
//
// rooms/world.json gives every room a cell, `at: [x, y]`. Walk off a room's edge
// and you enter the room in the next cell that way, arriving on the matching
// edge: leave east from row 6, arrive on the west edge at row 6. Every world room
// is 13 x 13 with its doors on the centre line, so the doors meet.
//
// Rooms are kept once built, so a solved room stays solved when you come back.
// Prototype-only, like the editor: Unity loads rooms as scenes and will want its
// own version of this, but the grid and the arrival rule port as-is.
//
// Grid space matches the room grid: +x right, +y DOWN. Unity 2D is +y up, so a
// room that is "south" here is at y - 1 there.

import { Room } from './room.js';

const STEP = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

export class World {
  constructor(json, roomJson) {
    this.start = json.start;
    this.cells = new Map();   // "x,y" -> id
    this.at = new Map();      // id -> [x, y]
    this.json = roomJson;     // id -> parsed room file
    this.rooms = new Map();   // id -> live Room
    // Areas: runs of rooms that share a key, a mode and a tempo, so the music
    // only changes mood when you cross into a new one (docs/WORLD.md).
    this.areas = json.areas ?? {};
    this.areaOf = new Map();  // id -> area id
    // The level's tune, which grows a layer per solved room (src/audio/score.js).
    this.score = json.score ?? null;
    // The order the whole world can be finished in, replayed by test/route.mjs.
    this.route = json.route ?? [];
    // Called on every room this builds, before anyone sees it: the game replays
    // what the player has done there (src/core/progress.js).
    this.onBuild = null;
    for (const [id, r] of Object.entries(json.rooms)) {
      this.cells.set(`${r.at[0]},${r.at[1]}`, id);
      this.at.set(id, r.at);
      if (r.area) this.areaOf.set(id, r.area);
    }
  }

  area(id) {
    const a = this.areaOf.get(id);
    return a ? { id: a, ...this.areas[a] } : null;
  }

  // Fetch world.json and every room in it up front, so walking between rooms is
  // instant and never waits on the network mid-step.
  static async load(base = 'rooms/') {
    const res = await fetch(`${base}world.json`);
    if (!res.ok) return null;
    const json = await res.json();
    const roomJson = {};
    await Promise.all(Object.entries(json.rooms).map(async ([id, r]) => {
      roomJson[id] = await fetch(`${base}${r.file}`).then(x => x.json());
    }));
    return new World(json, roomJson);
  }

  has(id) { return this.at.has(id); }

  neighbour(id, dir) {
    const at = this.at.get(id);
    const s = STEP[dir];
    if (!at || !s) return null;
    return this.cells.get(`${at[0] + s[0]},${at[1] + s[1]}`) ?? null;
  }

  // The live room for an id, built on first visit.
  room(id) {
    if (!this.rooms.has(id)) {
      const json = this.json[id];
      if (!json) return null;
      const room = new Room(json);
      this.onBuild?.(room);
      this.rooms.set(id, room);
    }
    return this.rooms.get(id);
  }

  // Built rooms only. The game steps waves in all of them, since a wave can
  // leave through a door and keep playing next door.
  live() { return [...this.rooms.values()]; }

  // Start over: every room is rebuilt from its file on the next visit.
  forgetAll() { this.rooms.clear(); }

  // A room loaded some other way (the room picker, reset) becomes the live copy.
  adopt(room) { if (this.has(room.id)) this.rooms.set(room.id, room); }

  forget(id) { this.rooms.delete(id); }
}

// Where to stand on arrival after leaving `from` at (x, y) heading `dir`: the
// mirrored tile on the opposite edge, or, only when the two rooms are different
// sizes, the nearest open tile along that edge. Same-size rooms (every world room)
// need the matching door open: a door shut on the far side is shut on this side
// too, which is what makes a one-way shortcut work.
export function arrival(room, x, y, dir, fromSize = null) {
  const W = room.width, H = room.height;
  if (fromSize && fromSize[0] === W && fromSize[1] === H) {
    const m = mirror(room, x, y, dir);
    return room.isWalkable(m.x, m.y) ? m : null;
  }
  let ax, ay;
  if (dir === 'right') { ax = 0; ay = y; }
  else if (dir === 'left') { ax = W - 1; ay = y; }
  else if (dir === 'down') { ax = x; ay = 0; }
  else { ax = x; ay = H - 1; }
  ax = Math.max(0, Math.min(W - 1, ax));
  ay = Math.max(0, Math.min(H - 1, ay));
  const along = dir === 'left' || dir === 'right' ? [0, 1] : [1, 0];
  const len = along[0] ? W : H;
  for (let o = 0; o < len; o++) {
    for (const sgn of o ? [1, -1] : [1]) {
      const tx = ax + along[0] * o * sgn, ty = ay + along[1] * o * sgn;
      if (room.isWalkable(tx, ty)) return { x: tx, y: ty };
    }
  }
  return null;
}

// The tile on the far side of an edge: leave east from row 6, arrive at column 0,
// row 6. Used for Coda and for waves alike.
export function mirror(room, x, y, dir) {
  if (dir === 'right') return { x: 0, y };
  if (dir === 'left') return { x: room.width - 1, y };
  if (dir === 'down') return { x, y: 0 };
  return { x, y: room.height - 1 };
}
