// Composer's Key — the room sweep, in one place.
//
// This used to be written twice: once inline inside tools/room-report.mjs's
// page.evaluate() callback, and (as of this file) a second time for the
// in-editor Report panel. Two implementations of "stand behind every doodad
// and fire in" is exactly the kind of drift CLAUDE.md warns about elsewhere
// in this project — a fix to one would silently stop applying to the other,
// and the CLI tool and the editor would start disagreeing about what a room
// does. So there is one sweep, here, and both callers use it: the node tool
// imports it with a dynamic import() *inside the page* (it already has one
// open for test/rooms.mjs's technique), and the editor imports it directly.
//
// `sweepRoom(room)` takes a room that nothing else is looking at. It never
// touches Game, the shared AudioEngine, or audio.onNote — it builds its own
// tiny ctx and its own wave list, so a run can never light a lock, open a
// door or otherwise mutate a room anyone is actually standing in. That
// matters here more than it did for the CLI tool: the editor calls this on
// the room being actively built, without reloading it (CLAUDE.md: "editor
// edits mutate the live room; they never reload it" — a sweep that leaked
// into the live room's locks would be exactly that kind of reload by
// accident). Hand it `room.toJSON(player)` and it is fully isolated.

import { Room } from './room.js';
import { SoundWave, SoundWaveState, WaveSource, SOURCE_FOR_FAMILY } from './sound-wave.js';

const STEPS = 60;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// Walls, doors and exits are geometry, not instruments — they are most of
// every room and silent by design, so findings about them bury the piece
// that actually matters. Both callers filter on this.
export const STRUCTURAL = new Set(['wall', 'door', 'exit']);

// A ctx scoped to one shadow room. Mirrors Game.buildContext() and the
// family filter Game's own audio.onNote applies (percussion and dissonance
// aren't part of a melody a note lock listens for) — see game.js if this
// ever needs to grow a field; `ctx.player` is a stub, kept only because a
// couple of onPlayerInteract handlers read it and it costs nothing to have.
function shadowCtx(room, waves, onPlay) {
  const ctx = {
    room,
    player: { x: 0, y: 0, dir: { x: 1, y: 0 }, facing: 'right' },
    audio: { now: 0 },
    play(o) {
      onPlay(o);
      if (o.family === 'percussion' || o.family === 'sour') return;
      for (const d of room.list) if (typeof d.hearNote === 'function') d.hearNote(o.midi, ctx);
    },
    playDegree({ family = 'keys', degree = 0, octave = 5 } = {}) {
      ctx.play({ family, midi: room.music.getNote(degree, octave) });
    },
    spawnWave(x, y, dir, state) {
      const w = new SoundWave(x, y, dir, state);
      waves.push(w);
      return w;
    },
    spawnWaveFromDoodad(d, dir) {
      return ctx.spawnWave(d.x, d.y, dir, new SoundWaveState({
        source: SOURCE_FOR_FAMILY[d.family] ?? WaveSource.ComposersKey,
      }));
    },
    toast() {},
    onRoomComplete() {},
  };
  return ctx;
}

// Fire from where a player would stand — the trap test/rooms.mjs already
// hit once (firing from the spawn point proved nothing). Stand next to every
// doodad on every side there is room to stand, fire in, and record what
// happened: how many times each piece's receiveWave ran, and how many notes
// sounded while control was inside it.
export function sweepRoom(room) {
  const pieces = [];
  for (let y = 0; y < room.height; y++) {
    for (let x = 0; x < room.width; x++) {
      const d = room.doodadAt(x, y);
      if (d) pieces.push({ x, y, type: d.constructor?.type || 'unknown', d, hits: 0, notes: 0 });
    }
  }

  // Wrap each piece's receiveWave (not onWaveEntered — SoundWave.step calls
  // receiveWave, and the base class's busy-check and melee routing happen
  // there first) so every arrival is seen, including ones a doodad ignores.
  let inside = null;
  for (const p of pieces) {
    const original = p.d.receiveWave?.bind(p.d);
    if (!original) continue;
    p.d.receiveWave = (...args) => {
      p.hits++;
      const was = inside; inside = p;
      try { return original(...args); } finally { inside = was; }
    };
  }

  const waves = [];
  const heard = [];
  const ctx = shadowCtx(room, waves, (o) => {
    heard.push(o);
    if (inside) inside.notes++;
  });

  const travels = [];
  let shots = 0, dud = 0;
  const stands = new Set();
  for (const p of pieces) {
    for (const [dx, dy] of DIRS) {
      const px = p.x - dx, py = p.y - dy;
      if (!room.inBounds(px, py) || room.doodadAt(px, py)) continue;

      waves.length = 0;
      const before = heard.length;
      const st = SoundWaveState.default;
      st.pitch = room.music.getNote(0, 4);
      ctx.spawnWave(px, py, { x: dx, y: dy }, st);
      ctx.play({ family: 'woodwind', midi: st.pitch, intensity: 0.35 });
      shots++;
      stands.add(`${px},${py}`);

      let s = 0;
      for (; s < STEPS && waves.length; s++) {
        for (const w of waves) w.step(ctx);
        for (let i = waves.length - 1; i >= 0; i--) if (!waves[i].alive) waves.splice(i, 1);
      }
      travels.push(s);
      if (heard.length === before) dud++;
    }
  }

  const midis = heard.map((n) => n.midi).filter(Number.isFinite);
  return {
    size: [room.width, room.height],
    scale: room.music.label || `${room.music.root} ${room.music.mode}`,
    shots, stands: stands.size, dud, travels,
    notes: heard.length,
    distinct: [...new Set(midis)].sort((a, b) => a - b),
    families: [...new Set(heard.map((n) => n.family))].filter(Boolean),
    pieces: pieces.map((p) => ({ x: p.x, y: p.y, type: p.type, hits: p.hits, notes: p.notes })),
  };
}

const median = (a) => (a.length ? [...a].sort((x, y) => x - y)[a.length >> 1] : 0);

// The two findings worth reading, plus the numbers that back them. Nothing
// here passes or fails — see tools/room-report.mjs's own header comment for
// why, which is a decision about the whole tool and not just its printing.
export function summarize(r) {
  const parts = r.pieces.filter((p) => !STRUCTURAL.has(p.type));
  const walls = r.pieces.length - parts.length;
  const silent = parts.filter((p) => p.hits === 0);
  const mute = parts.filter((p) => p.hits > 0 && p.notes === 0);
  const busiest = [...parts].sort((a, b) => b.notes - a.notes).slice(0, 3).filter((p) => p.notes);
  return {
    ...r, parts, walls, silent, mute, busiest,
    longest: Math.max(0, ...r.travels), median: median(r.travels),
  };
}

// What both callers actually reach for: a room's JSON in, a summarized
// report out. `new Room(json)` builds fresh doodad instances that belong to
// nobody else — that freshness is what makes this safe to run on a room
// someone is mid-edit on.
export function analyzeRoomJSON(json) {
  return summarize(sweepRoom(new Room(json)));
}
