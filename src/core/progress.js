// What Coda carries from room to room, and what the world remembers he did.
//
// One object, saved to this browser's storage, so "continue" on the title screen
// picks up where you left off. Prototype-only in its storage (Unity will want a
// save system of its own), but the shape ports as-is:
//
//   waves      how many of the Key's own waves can sound at once. Starts at 1;
//              every Overtone found adds one (an overtone is the extra pitch a
//              string sounds above its fundamental, so: more voices from one key).
//   items      tools found: 'burin' (lift instruments into the satchel)
//   satchel    instruments being carried, as the specs they were built from
//   taken      "room:x,y" tiles emptied for good: pickups collected, instruments lifted
//   placed     instruments set down, { room, x, y, spec }
//   opened     "room:x,y" doors a puzzle has opened, so solved rooms stay solved
//   layers     score layers earned (see src/audio/score.js)
//   visited    rooms entered, for the map
//
// Rooms are rebuilt from their JSON; `apply(room)` replays the remembered changes
// on top. That one function is what keeps a collected pickup from coming back
// and a lifted drum from being in two places at once.

const KEY = 'ck-save-v1';
const MAX_WAVES = 4;

export class Progress {
  constructor(json = null) {
    this.reset();
    if (json) this.load(json);
  }

  reset() {
    this.waves = 1;
    this.items = new Set();
    this.satchel = [];
    this.selected = 0;
    this.taken = new Set();
    this.placed = [];
    this.opened = new Set();
    this.layers = new Set();
    this.visited = new Set();
    this.room = null;          // where to continue from
    this.at = null;            // and where in it: { x, y, facing }
    this.free = false;         // free play: every tool, no saving
    return this;
  }

  // Free play: every tool, so any room can be played on its own from the menu.
  grantAll() {
    this.waves = 3;
    this.items.add('burin');
    this.free = true;
    return this;
  }

  has(item) { return this.items.has(item); }

  give(item) {
    if (item === 'overtone') { this.waves = Math.min(MAX_WAVES, this.waves + 1); return; }
    this.items.add(item);
  }

  // ---- the satchel ----------------------------------------------------------

  get held() { return this.satchel[this.selected] ?? null; }

  carry(entry) {
    this.satchel.push(entry);
    this.selected = this.satchel.length - 1;
  }

  // Take the selected instrument out of the satchel.
  takeOut() {
    const e = this.satchel.splice(this.selected, 1)[0] ?? null;
    this.selected = Math.max(0, Math.min(this.selected, this.satchel.length - 1));
    return e;
  }

  select(i) { if (this.satchel.length) this.selected = ((i % this.satchel.length) + this.satchel.length) % this.satchel.length; }

  // ---- what the rooms remember ----------------------------------------------

  static tile(roomId, x, y) { return `${roomId}:${x},${y}`; }

  // A tile was emptied: a pickup collected or an instrument lifted. An instrument
  // that was itself placed by the player just stops being placed.
  emptied(roomId, x, y) {
    const i = this.placed.findIndex(p => p.room === roomId && p.x === x && p.y === y);
    if (i >= 0) { this.placed.splice(i, 1); return; }
    this.taken.add(Progress.tile(roomId, x, y));
  }

  put(roomId, x, y, spec) { this.placed.push({ room: roomId, x, y, spec }); }

  doorOpened(roomId, x, y, open) {
    const k = Progress.tile(roomId, x, y);
    if (open) this.opened.add(k); else this.opened.delete(k);
  }

  // Replay remembered changes onto a freshly built room. `doors: false` is the
  // "reset room" case: the puzzle starts over, but what you collected or moved
  // stays collected or moved.
  apply(room, { doors = true, create } = {}) {
    for (const k of this.taken) {
      const [id, xy] = k.split(':');
      if (id !== room.id) continue;
      const [x, y] = xy.split(',').map(Number);
      room.setDoodad(x, y, null);
    }
    for (const p of this.placed) {
      if (p.room !== room.id || !create) continue;
      room.setDoodad(p.x, p.y, create(p.spec, p.x, p.y));
    }
    if (!doors) {
      for (const k of [...this.opened]) if (k.startsWith(`${room.id}:`)) this.opened.delete(k);
      return room;
    }
    const lit = new Set();
    for (const d of room.list) {
      if (d.typeName !== 'door' || d.open) continue;
      if (!this.opened.has(Progress.tile(room.id, d.x, d.y))) continue;
      d.open = true;            // quietly: no chime, no key flight
      if (d.group) lit.add(d.group);
    }
    // The locks that opened those doors were lit; show them lit.
    for (const d of room.list) if (d.isLock && lit.has(d.group)) d.lit = true;
    return room;
  }

  // ---- storage --------------------------------------------------------------

  toJSON() {
    return {
      waves: this.waves, items: [...this.items], satchel: this.satchel, selected: this.selected,
      taken: [...this.taken], placed: this.placed, opened: [...this.opened],
      layers: [...this.layers], visited: [...this.visited], room: this.room, at: this.at,
    };
  }

  load(j) {
    this.waves = j.waves ?? 1;
    this.items = new Set(j.items ?? []);
    this.satchel = j.satchel ?? [];
    this.selected = j.selected ?? 0;
    this.taken = new Set(j.taken ?? []);
    this.placed = j.placed ?? [];
    this.opened = new Set(j.opened ?? []);
    this.layers = new Set(j.layers ?? []);
    this.visited = new Set(j.visited ?? []);
    this.room = j.room ?? null;
    this.at = j.at ?? null;
    return this;
  }

  save() {
    if (this.free) return;
    try { localStorage.setItem(KEY, JSON.stringify(this.toJSON())); } catch {}
  }

  static saved() {
    try {
      const j = JSON.parse(localStorage.getItem(KEY));
      return j && j.room ? new Progress(j) : null;
    } catch { return null; }
  }

  static erase() { try { localStorage.removeItem(KEY); } catch {} }
}
