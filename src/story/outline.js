// The outline: the whole game, start to credits, as a list of scenes.
//
// This is the "marble" (docs/MARBLE.md): every moment the finished game will
// have is here, in order, even where nothing is built yet. A scene that is only
// an idea still has a title, a kind, a status and a guess at its minutes, so the
// game can be played end to end as placeholders and its shape seen at a glance.
// Building the game is replacing placeholders with the real thing, scene by scene.
//
// Data lives in story/: outline.json (the cast, the worlds, the acts in order) and
// one file per act in story/acts/ (that act's scenes and triggers). Like rooms, it
// is plain JSON so it can be carved by hand.
//
// A scene:
//
//   { "id": "fall", "kind": "cutscene", "title": "The Fall",
//     "status": "rough", "minutes": 1,
//     "brief": "what the moment is for",
//     "notes": ["open questions"],
//     "then": "landing",          // where it leads (see `resolveThen`)
//     ... kind-specific fields }
//
// Kinds (each has an engine in src/story/scenes.js or rhythm.js):
//   title     the title screen
//   card      an area's title card: name, family, what it is about
//   cutscene  shots of rough drawings with lines of text, in time
//   slate     a placeholder for anything not roughed out yet
//   world     rooms to walk: a world file and a room to start in
//   rhythm    a tube run: notes down lanes, played with the D-pad and A/B
//   boss      a boss: phases, each a rhythm duel with the boss's own twist
//   item      something found, held overhead
//   credits   the bow, and the names
//
// Statuses, from least to most carved:
//   idea         named and placed, nothing to play (always shown as a slate)
//   placeholder  a slate or a stand-in that says what goes here
//   rough        a playable rough draft: sketches, a first chart, first words
//   playable     the real mechanic, unpolished
//   final        done

import { MusicalState } from '../core/music.js';

export const STATUSES = ['idea', 'placeholder', 'rough', 'playable', 'final'];
export const KINDS = ['title', 'card', 'cutscene', 'slate', 'world', 'rhythm', 'boss', 'item', 'credits'];

export class Outline {
  constructor(json, acts) {
    this.json = json;
    this.title = json.title ?? "Composer's Key";
    this.target = json.target ?? { minutes: [180, 300] };
    this.first = json.first ?? null;
    this.cast = json.cast ?? {};
    this.worlds = json.worlds ?? {};
    this.acts = acts;
    this.scenes = new Map();
    this.order = [];
    this.actOfScene = new Map();
    this.triggers = [];
    for (const act of acts) {
      for (const sc of act.scenes ?? []) {
        if (this.scenes.has(sc.id)) console.warn(`[outline] scene id used twice: ${sc.id}`);
        this.scenes.set(sc.id, sc);
        this.order.push(sc.id);
        this.actOfScene.set(sc.id, act);
      }
      for (const t of act.triggers ?? []) this.triggers.push({ ...t, act: act.id });
    }
  }

  static async load(base = 'story/') {
    const json = await fetch(`${base}outline.json`).then(r => r.json());
    const acts = await Promise.all((json.acts ?? []).map(async (a) => {
      const act = a.file ? await fetch(`${base}${a.file}`).then(r => r.json()) : a;
      return { ...act, id: act.id ?? a.id, file: a.file ?? null };
    }));
    return new Outline(json, acts);
  }

  scene(id) { return this.scenes.get(id) ?? null; }
  act(id) { return this.acts.find(a => a.id === id) ?? null; }
  actOf(id) { return this.actOfScene.get(id) ?? null; }

  // The next scene in reading order, for a scene with no `then` of its own.
  next(id) {
    const i = this.order.indexOf(id);
    return i >= 0 && i + 1 < this.order.length ? this.order[i + 1] : null;
  }

  prev(id) {
    const i = this.order.indexOf(id);
    return i > 0 ? this.order[i - 1] : null;
  }

  // A scene's key and tempo: its own `music`, else its act's, else the castle's C.
  musicFor(sc) {
    const act = this.actOf(sc?.id);
    const m = { root: 0, mood: 'content', bpm: 100, ...(act?.music ?? {}), ...(sc?.music ?? {}) };
    const state = new MusicalState({ root: m.root, bpm: m.bpm, timeSignature: m.timeSignature ?? 4 });
    state.setMood(m.mood);
    if (m.mode) state.mode = m.mode;
    return state;
  }

  // Where a scene leads when it ends. Returns one of:
  //   { scene: id }                         play another scene
  //   { place: { world, room, at, facing } } walk into a world
  //   { back: true }                        back where the story was interrupted
  //   { title: true }                       the title screen
  //   null                                  the end of the outline
  resolveThen(sc, then = sc?.then) {
    if (then == null) { const n = this.next(sc?.id); return n ? { scene: n } : null; }
    if (then === 'return') return { back: true };
    if (then === 'title') return { title: true };
    if (typeof then === 'string') return { scene: then };
    if (then.world) return { place: then };
    if (then.scene) return { scene: then.scene };
    return null;
  }

  // Minutes, by act and in all, for the Marble's totals. `built` counts only
  // what is playable or final: how much of the game is carved, not roughed.
  minutes() {
    const out = { total: 0, built: 0, rough: 0, acts: {} };
    for (const act of this.acts) {
      let t = 0, b = 0, r = 0;
      for (const sc of act.scenes ?? []) {
        const m = Number(sc.minutes) || 0;
        t += m;
        if (sc.status === 'playable' || sc.status === 'final') b += m;
        if (sc.status === 'rough') r += m;
      }
      out.acts[act.id] = { total: t, built: b, rough: r };
      out.total += t; out.built += b; out.rough += r;
    }
    return out;
  }

  // Every scene id a scene can lead to, for the checker and the Marble's links.
  links(sc) {
    const out = [];
    const add = (then) => {
      const r = this.resolveThen(sc, then);
      if (r?.scene) out.push(r.scene);
    };
    if (sc.then !== undefined) add(sc.then); else add(null);
    for (const ph of sc.phases ?? []) if (ph.then) add(ph.then);
    return out;
  }

  // Problems an author should hear about: a link to nowhere, a duplicated id, an
  // unknown kind or status. The Marble shows them; test/story.mjs fails on them.
  problems() {
    const out = [];
    const seen = new Set();
    for (const id of this.order) {
      if (seen.has(id)) out.push(`scene id "${id}" is used twice`);
      seen.add(id);
      const sc = this.scene(id);
      if (!KINDS.includes(sc.kind)) out.push(`${id}: unknown kind "${sc.kind}"`);
      if (!STATUSES.includes(sc.status)) out.push(`${id}: unknown status "${sc.status}"`);
      for (const l of this.links(sc)) if (!this.scenes.has(l)) out.push(`${id}: leads to "${l}", which is not a scene`);
      const place = this.resolveThen(sc)?.place ?? (sc.kind === 'world' ? sc : null);
      if (place && place.world && !this.worlds[place.world]) out.push(`${id}: world "${place.world}" is not in outline.worlds`);
      if (sc.who && !this.cast[sc.who]) out.push(`${id}: speaker "${sc.who}" is not in the cast`);
      for (const shot of sc.shots ?? []) {
        if (shot.who && shot.who !== 'narrator' && !this.cast[shot.who]) out.push(`${id}: speaker "${shot.who}" is not in the cast`);
      }
    }
    for (const t of this.triggers) {
      if (!this.scenes.has(t.play)) out.push(`trigger in ${t.act} plays "${t.play}", which is not a scene`);
    }
    return out;
  }
}
