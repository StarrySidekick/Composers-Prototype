// The Director: plays the outline (src/story/outline.js) scene by scene.
//
// Rooms are still played by the Game exactly as before. The Director sits above
// it and decides what is on the stage: a scene that takes the stage (a cutscene, a
// tube run, a boss) or a world, where the Game runs and the Director only listens.
// It listens for four things in a world, and the outline's `triggers` say what each
// one plays:
//
//   enter     Coda arrives in a room                { "on": "enter", "room": id }
//   area      Coda crosses into an area             { "on": "area", "area": id }
//   cross     Coda walks from one room to the next  { "on": "cross", "from": id, "to": id }
//   solved    a puzzle opens a door in a room       { "on": "solved", "room": id }
//   complete  a room's exit (X) is reached          { "on": "complete", "room": id }
//
// plus the room tiles that ask for a scene directly: a story moment (`?`) and a
// character (`C`). That is how the story wraps the castle without changing a single
// room in it: the triggers live in story/acts/castle.json, not in the rooms.
//
// A scene that interrupts a world remembers where Coda was (`story.ret`), and a
// scene whose `then` is "return" puts him back there. Everything is in the save
// (progress.story), so "continue" resumes mid-story.
//
// Only a story started from the title is saved. Jumping in from the Marble or the
// chapter list plays as a player would from that point, with what an earlier
// player would carry, and saves nothing.

import { Outline } from './outline.js';
import { Cue } from './cue.js';
import { World } from '../core/world.js';
import { Score } from '../audio/score.js';
import { Progress } from '../core/progress.js';
import { CardScene, CutsceneScene, SlateScene, ItemScene, CreditsScene, TitleScene, WorldScene, text } from './scenes.js';
import { RhythmScene, BossScene } from './rhythm.js';

export const ENGINES = {
  title: TitleScene, card: CardScene, cutscene: CutsceneScene, slate: SlateScene, world: WorldScene,
  rhythm: RhythmScene, boss: BossScene, item: ItemScene, credits: CreditsScene,
};

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';
const DEV_KEY = 'ck-dev-v1';

export class Director {
  constructor({ game, audio, renderer, dialog, ui = {} }) {
    this.game = game;
    this.audio = audio;
    this.renderer = renderer;
    this.dialog = dialog;
    this.ui = ui;
    this.outline = null;
    this.sketch = null;
    this.worlds = new Map();      // alias -> World
    this.scoreOf = new Map();     // World -> Score
    this.scores = {};             // alias -> score JSON, for cues that borrow a world's tune
    this.scene = null;            // the engine on stage, or a WorldScene
    this.active = false;          // a story is being played (not free play, not the editor)
    this.autoplay = false;        // developer mode: scenes play themselves
    this.speed = 1;               // developer mode: a scene's tempo times this (tests run at 4)
    this.queue = [];              // scenes asked for mid-update (triggers, stages), played one at a time from a world
    this.busy = false;
    this.trans = null;
    this.lastRoom = null;
    this.lastArea = null;
    this.lastFrame = 0;
    try { this.dev = localStorage.getItem(DEV_KEY) === '1' || /[?&]dev\b/.test(location.search); } catch { this.dev = false; }
    this.env = {
      director: this, game, audio, dialog, outline: null, sketch: null, scores: this.scores,
      makeCue: (spec, music) => (spec ? new Cue(spec, music, { scores: this.scores }) : null),
      boil: () => ((game.clock.index % 3) + 3) % 3,
    };
    dialog.onDismiss = () => this.scene?.dismissed?.();
  }

  async init() {
    this.outline = await Outline.load();
    this.env.outline = this.outline;
    try { this.sketch = await import('./sketch.js'); } catch (e) { console.warn('[story] sketches missing; drawing boxes', e); }
    this.env.sketch = this.sketch;
    // The page boots into the castle (rooms/world.json). Whichever outline world
    // names that file is it.
    if (this.game.world) {
      const alias = Object.entries(this.outline.worlds).find(([, w]) => w.file === (this.game.world.file ?? 'world.json'))?.[0] ?? 'castle';
      this.adoptWorld(alias, this.game.world, this.game.score);
    }
    // Every world's tune, for cues and charts that borrow one.
    await Promise.all(Object.entries(this.outline.worlds).map(async ([alias, w]) => {
      if (this.scores[alias]) return;
      const json = await fetch(`rooms/${w.file}`).then(r => r.json()).catch(() => null);
      if (json?.score) this.scores[alias] = json.score;
    }));
    return this;
  }

  get story() { return this.game.progress.story; }
  // The world the page booted with (the castle), for free play and the editor.
  get home() { return [...this.worlds.values()][0] ?? this.game.world; }
  get stageScene() { return this.scene?.takesStage ? this.scene : null; }
  hasFlag(f) { return this.story.flags.includes(f); }
  toast(msg) { this.ui.toast?.(msg); }

  setDev(on) {
    this.dev = !!on;
    try { localStorage.setItem(DEV_KEY, on ? '1' : '0'); } catch {}
    document.body.classList.toggle('dev', this.dev);
    this.game.noHurt = this.dev && this.noHurt;
    this.onDevChange?.();
    this.ui.refresh?.();
  }

  // ---- worlds ------------------------------------------------------------------------

  adoptWorld(alias, world, score = null) {
    world.alias = alias;
    this.worlds.set(alias, world);
    if (world.score) this.scores[alias] = world.score;
    if (score) this.scoreOf.set(world, score);
  }

  async ensureWorld(alias) {
    if (this.worlds.has(alias)) return this.worlds.get(alias);
    const def = this.outline.worlds[alias];
    if (!def) throw new Error(`no world "${alias}" in story/outline.json`);
    const w = await World.load('rooms/', def.file);
    if (!w) throw new Error(`could not load rooms/${def.file}`);
    this.adoptWorld(alias, w);
    return w;
  }

  useWorld(w) {
    const g = this.game;
    if (!w || g.world === w) return;
    g.world = w;
    w.onBuild = (room) => g.applyProgress(room);
    if (!this.scoreOf.has(w) && w.score) this.scoreOf.set(w, new Score(w.score));
    g.score = this.scoreOf.get(w) ?? null;
    g.score?.reset();
    g.unlockLayers('start');   // this world's opening layers
    g.areaId = null;
  }

  // Walk Coda into a world, at a room and a tile.
  async goPlace({ world, room, at, x, y, facing }) {
    const g = this.game;
    const w = await this.ensureWorld(world ?? g.world?.alias ?? 'castle');
    this.useWorld(w);
    const r = w.room(room ?? w.start);
    if (!r) throw new Error(`no room "${room}" in world "${w.alias}"`);
    let spot = at ? { x: at[0], y: at[1] } : x != null ? { x, y } : r.playerStart;
    if (!r.isWalkable(spot.x, spot.y)) spot = r.playerStart;
    for (const d of [...g.held]) g.setHeld(d, false);
    g.enterRoom(r, { ...spot, facing: facing ?? spot.facing ?? 'right' });
    if (!g.clock.running) g.clock.start();
    this.story.world = w.alias;
    this.ui.afterJump?.();
    this.roomEntered(r, false);
  }

  // ---- playing scenes ------------------------------------------------------------------

  engineFor(sc) {
    // An idea is only ever a slate: there is nothing yet to play.
    if (sc.status === 'idea' && sc.kind !== 'world' && sc.kind !== 'title') return SlateScene;
    return ENGINES[sc.kind] ?? SlateScene;
  }

  async play(id, opts = {}) {
    const sc = this.outline.scene(id);
    if (!sc) { console.warn(`[story] no scene "${id}"`); this.toast(`No scene "${id}"`); return; }
    if (sc.kind === 'world') return this.enterPlace(sc, sc);
    const Engine = this.engineFor(sc);
    const engine = new Engine(this.env, sc, opts);
    const g = this.game;
    // Interrupting a world: remember where Coda was, to come back after.
    if (engine.takesStage && !this.stageScene && g.room && (opts.from === 'trigger' || opts.from === 'stage')) {
      this.story.ret = { world: g.world?.alias, room: g.room.id, x: g.player.x, y: g.player.y, facing: g.player.facing };
    }
    this.switchTo(engine, sc);
    for (const f of sc.flags ?? []) if (!this.story.flags.includes(f)) this.story.flags.push(f);
    engine.enter();
    this.save();
  }

  switchTo(engine, sc) {
    this.snapshot();
    this.scene?.exit();
    for (const d of [...this.game.held]) this.game.setHeld(d, false);
    this.scene = engine;
    this.story.scene = sc.id;
    if (!this.story.seen.includes(sc.id)) this.story.seen.push(sc.id);
    this.dialog.music = engine.takesStage ? () => engine.music : null;
    if (engine.takesStage) {
      this.game.clock.setBpm(engine.music.bpm * this.speed);
      if (!this.game.clock.running) this.game.clock.start();
    }
    this.lastFrame = 0;
    this.ui.refresh?.();
  }

  // A world scene, a return, a tube's far end, a stand-in: Coda walks in.
  //
  // `after`: the scene that led here (a pipe that drops you at the gate). Moving
  // the story on from this world then means the scene after THAT one, not the
  // scene after the world, which would loop back over what was just played.
  async enterPlace(place, sc = null, { after = null } = {}) {
    this.busy = true;
    try {
      let wsc = sc?.kind === 'world' ? sc : (this.outline.scene(this.story.worldScene) ?? { id: '(rooms)', kind: 'world', title: 'rooms', status: 'rough' });
      if (after) wsc = { ...wsc, after };
      this.switchTo(new WorldScene(this.env, wsc), wsc);
      this.story.worldScene = wsc.id;
      this.dialog.show('', '');
      await this.goPlace(place);
      this.scene.enter();
      this.save();
    } finally { this.busy = false; }
  }

  // The engine on stage is done. Where next?
  finished(engine, result = {}) {
    if (engine !== this.scene) return;
    const sc = engine.sc;
    if (result.title) return this.toTitle();
    if (result.encore && sc.encore) return this.play(sc.encore, { from: 'flow' });
    if (result.standIn && sc.standIn) {
      return this.enterPlace(sc.standIn, { ...sc, kind: 'world', id: sc.id, standInOf: sc.id });
    }
    // A pipe ridden end to end: remember it for fast travel.
    if (sc.kind === 'rhythm' && sc.ends && !this.story.tubes.includes(sc.id)) this.story.tubes.push(sc.id);
    if (sc.kind === 'rhythm' && sc.ends && engine.opts.travel) {
      const end = engine.opts.reverse ? sc.ends[0] : sc.ends[1];
      this.story.ret = null;
      return this.enterPlace(end);
    }
    // Moving on from a world (developer mode's skip, or a stand-in's "continue
    // the story") means the next scene not yet seen: a world like the Wood holds
    // several story moments, and some will have played already.
    let next;
    if (sc.kind === 'world' && sc.then === undefined) {
      const n = this.nextUnseen(sc.after ?? sc.id);
      next = n ? { scene: n } : null;
    } else next = this.outline.resolveThen(sc);
    if (!next) return this.toTitle();
    if (next.scene) return this.play(next.scene, { from: 'flow' });
    if (next.place) return this.enterPlace(next.place, null, { after: sc.id });
    if (next.title) return this.toTitle();
    if (next.back) {
      const ret = this.story.ret;
      this.story.ret = null;
      if (ret?.room) return this.enterPlace(ret);
      const n = this.outline.next(sc.id);
      return n ? this.play(n, { from: 'flow' }) : this.toTitle();
    }
  }

  nextUnseen(id) {
    let n = this.outline.next(id);
    while (n && this.story.seen.includes(n)) n = this.outline.next(n);
    return n ?? this.outline.next(id);
  }

  toTitle() {
    this.snapshot();
    this.scene?.exit();
    this.scene = new TitleScene(this.env, { id: 'title', kind: 'title', title: 'Title' });
    this.dialog.music = null;
    this.dialog.show('', '');
    this.game.attract = true;
    this.save();
    this.scene.enter();
  }

  // Leave the story altogether: free play, the editor.
  stop() {
    this.scene?.exit();
    this.scene = null;
    this.active = false;
    this.queue = [];
    this.dialog.music = null;
  }

  save() { this.game.save(); }

  // What a scene grants when it plays: an item held overhead, a tool, a flag.
  grant(sc, p = this.game.progress) {
    if (sc.item && !p.story.items.includes(sc.item)) p.story.items.push(sc.item);
    for (const t of [].concat(sc.give ?? [])) p.give(t);
    for (const f of sc.flags ?? []) if (!p.story.flags.includes(f)) p.story.flags.push(f);
    if (p === this.game.progress) this.save();
  }

  withKit(p, w) {
    if (!w) return;
    if (w.waves) p.waves = Math.max(p.waves, w.waves);
    for (const i of w.items ?? []) p.items.add(i);
    for (const f of w.flags ?? []) if (!p.story.flags.includes(f)) p.story.flags.push(f);
    for (const l of w.layers ?? []) p.layers.add(l);
    if (w.metronome) p.metronome = true;
  }

  // What a player arriving at this scene would carry: everything every scene before
  // it grants, plus the scene's own `with`.
  kitFor(id) {
    const p = new Progress();
    for (const sid of this.outline.order) {
      if (sid === id) break;
      const sc = this.outline.scene(sid);
      p.story.seen.push(sid);
      this.grant(sc, p);
      this.withKit(p, sc.with);
    }
    this.withKit(p, this.outline.scene(id)?.with);
    return p;
  }

  // ---- from the title -------------------------------------------------------------------

  resetWorlds() { for (const w of this.worlds.values()) w.forgetAll(); }

  async newGame() {
    const g = this.game;
    Progress.erase();
    g.saving = true;
    g.progress = new Progress();
    g.attract = false;
    g.score?.reset();
    this.resetWorlds();
    g.unlockLayers('start');
    this.active = true;
    this.ui.hideTitle?.();
    await this.play(this.outline.first ?? this.outline.order[1]);
  }

  async continueGame() {
    const saved = Progress.saved();
    if (!saved) return false;
    const g = this.game;
    g.saving = true;
    g.attract = false;
    this.resetWorlds();
    this.active = true;
    this.ui.hideTitle?.();
    const st = saved.story;
    const sc = this.outline.scene(st.scene);
    // In rooms (or a save from before the story existed): back to the room.
    if (!sc || sc.kind === 'world' || sc.kind === 'title') {
      const w = await this.ensureWorld(st.world ?? 'castle');
      this.useWorld(w);
      if (!g.continueGame(saved)) return false;
      const wsc = this.outline.scene(st.worldScene) ?? sc ?? { id: '(rooms)', kind: 'world', title: 'rooms', status: 'rough' };
      this.switchTo(new WorldScene(this.env, wsc), wsc);
      this.scene.enter();
      this.ui.afterJump?.();
      this.roomEntered(g.room, false);
      return true;
    }
    g.progress = saved;
    g.score?.reset();
    await this.play(st.scene, { from: 'continue' });
    return true;
  }

  // From the Marble or the chapter list: play from this scene as a player would,
  // carrying what they would carry. Nothing is saved.
  async jump(id, { save = false, reverse = false } = {}) {
    const g = this.game;
    g.saving = save;
    g.progress = this.kitFor(id);
    g.attract = false;
    g.score?.reset();
    this.resetWorlds();
    g.unlockLayers('start');
    this.active = true;
    this.story.ret = null;
    this.ui.hideTitle?.();
    await this.play(id, { from: 'jump', reverse });
  }

  // Developer mode's buttons.
  skip() { if (this.scene && !this.scene.ended) this.scene.finish({ skipped: true }); }
  restart() { if (this.story.scene) this.play(this.story.scene, { from: 'jump' }); }
  back() { const p = this.outline.prev(this.story.scene); if (p) this.play(p, { from: 'jump' }); }

  // ---- what happens in the rooms ----------------------------------------------------------

  roomEntered(room, walked) {
    if (!room) return;
    const prev = this.lastRoom;
    this.lastRoom = room.id;
    const area = this.game.world?.area(room.id)?.id ?? null;
    const newArea = area !== this.lastArea;
    this.lastArea = area;
    if (walked && prev && prev !== room.id) this.fire({ on: 'cross', from: prev, to: room.id });
    if (newArea && area) this.fire({ on: 'area', area });
    this.fire({ on: 'enter', room: room.id });
  }

  onRoomSolved(room) { this.fire({ on: 'solved', room: room.id }); }

  // The room's exit was reached. True if the story took it.
  onRoomComplete() { return this.fire({ on: 'complete', room: this.game.room?.id }); }

  // Every trigger the event matches is queued (walking into the Flute room is both
  // a pipe ride and the Ramparts' card), and they play one after another, each
  // coming back to the room before the next begins.
  fire(ev) {
    if (!this.active) return false;
    let took = false;
    for (const t of this.outline.triggers) {
      if (t.on !== ev.on) continue;
      if (t.room && t.room !== ev.room) continue;
      if (t.area && t.area !== ev.area) continue;
      if (t.from && t.from !== ev.from) continue;
      if (t.to && t.to !== ev.to) continue;
      if (t.needs && !this.hasFlag(t.needs)) continue;
      if (!t.repeat && this.story.seen.includes(t.play)) continue;
      if (this.queue.some(q => q.id === t.play)) continue;
      this.queue.push({ id: t.play, from: 'trigger' });
      took = true;
    }
    return took;
  }

  onStage(d) {
    if (!d.scene) { this.toast('A story moment with no scene set (editor: Tile → scene).'); return; }
    if (d.needs && !this.hasFlag(d.needs) && !this.dev) { this.toast(d.sealed); return; }
    const seen = this.story.seen.includes(d.scene);
    if (seen && d.once && !d.again) { if (d.after) this.dialog.show(d.after, ''); return; }
    const id = seen && d.again ? d.again : d.scene;
    const sc = this.outline.scene(id);
    if (!sc) { this.toast(`No scene "${id}" in story/.`); return; }
    this.queue.push({ id, from: 'stage', reverse: d.reverse, travel: !!sc.ends });
  }

  // A character: their next line, picked by what the story has done so far.
  onTalk(npc) {
    const who = this.outline.cast[npc.who];
    if (!who) { this.dialog.show(`(${npc.who} is not in the cast yet: story/outline.json)`, npc.who); return; }
    const lines = (who.lines ?? []).filter(l => typeof l === 'string'
      || ((!l.if || this.hasFlag(l.if)) && (!l.unless || !this.hasFlag(l.unless))))
      .map(l => (typeof l === 'string' ? l : l.text));
    if (!lines.length) return;
    const line = lines[Math.min(npc.said, lines.length - 1)];
    npc.said = Math.min(npc.said + 1, lines.length - 1);
    this.dialog.show(line, who.name);
  }

  // Ride a pipe from the pause menu: forward to its far end, or back.
  ride(id, reverse) { this.queue.push({ id, from: 'menu', travel: true, reverse }); }

  // ---- input -----------------------------------------------------------------------------
  //
  // The input layer (src/input.js) talks to this instead of the Game: on a scene
  // that takes the stage, buttons go to the scene; in a world, straight through.

  router() {
    const g = this.game, d = this;
    const on = () => d.stageScene;
    return {
      get held() { return g.held; },
      setHeld(dir, down) {
        const s = on();
        if (s) { s.hold(dir, down); if (!down) g.setHeld(dir, false); } else g.setHeld(dir, down);
      },
      fire() { const s = on(); if (s) s.press('a'); else g.fire(); },
      interact() { const s = on(); if (s) s.press('b'); else g.interact(); },
      shoulderL() { const s = on(); if (s) s.press('l'); else g.shoulderL(); },
      shoulderR() { const s = on(); if (s) s.press('r'); else g.shoulderR(); },
      reload() { if (!on()) g.reload(); },
      get metronome() { return g.metronome; },
      set metronome(v) { g.metronome = v; },
      toast(m) { g.toast(m); },
    };
  }

  // ---- every frame ------------------------------------------------------------------------

  // Returns true when a scene has the stage (the Game should not update).
  update() {
    if (this.queue.length && !this.busy && !this.stageScene) {
      const p = this.queue.shift();
      this.play(p.id, p);
    }
    const s = this.stageScene;
    if (!s) return false;
    const clock = this.game.clock;
    clock.setBpm(s.music.bpm * this.speed);
    for (const ev of clock.poll()) { if (this.scene !== s) break; s.tick(ev); }
    const now = performance.now();
    const dt = this.lastFrame ? Math.min(0.05, (now - this.lastFrame) / 1000) : 0;
    this.lastFrame = now;
    if (this.scene === s) s.frame(dt);
    return true;
  }

  draw() {
    const r = this.renderer, c = r.c;
    const w = r.viewW ?? 0, h = r.viewH ?? 0;
    const s = this.stageScene;
    if (s) {
      c.save();
      c.fillStyle = '#000';
      c.fillRect(0, 0, w, h);
      s.draw(c, w, h);
      c.restore();
    }
    this.drawTransition(c, w, h);
    if (this.dev && this.scene) this.drawDev(c, w, h);
  }

  // An iris: the last frame of the old scene, with a hole opening on the new one.
  snapshot() {
    const cv = this.renderer.canvas;
    if (!cv.width || !cv.height) return;
    const snap = document.createElement('canvas');
    snap.width = cv.width; snap.height = cv.height;
    snap.getContext('2d').drawImage(cv, 0, 0);
    this.trans = { snap, t0: performance.now(), ms: 520 };
  }

  drawTransition(c, w, h) {
    const t = this.trans;
    if (!t) return;
    const k = (performance.now() - t.t0) / t.ms;
    if (k >= 1) { this.trans = null; return; }
    const e = k * k * (3 - 2 * k);
    const R = Math.hypot(w, h) / 2 * e;
    c.save();
    c.beginPath();
    c.rect(0, 0, w, h);
    c.arc(w / 2, h / 2, R, 0, Math.PI * 2, true);
    c.clip('evenodd');
    c.drawImage(t.snap, 0, 0, w, h);
    c.strokeStyle = '#fff'; c.lineWidth = 2;
    c.beginPath(); c.arc(w / 2, h / 2, R, 0, Math.PI * 2); c.stroke();
    c.restore();
  }

  // Developer mode's corner: which scene, what kind, how carved, and the engine's own
  // numbers (the shot, the step, the hits).
  drawDev(c, w) {
    const sc = this.scene.sc ?? {};
    const lines = [`${sc.id} · ${sc.kind} · ${sc.status ?? '?'}${this.autoplay ? ' · AUTO' : ''}`, ...(this.scene.devLines?.() ?? [])];
    c.save();
    c.font = `11px ${MONO}`;
    const wd = Math.min(w - 8, Math.max(...lines.map(l => c.measureText(l).width)) + 12);
    c.fillStyle = 'rgba(0,0,0,0.78)';
    c.fillRect(4, 4, wd, lines.length * 14 + 6);
    c.strokeStyle = '#fff'; c.setLineDash([3, 3]); c.lineWidth = 1;
    c.strokeRect(4.5, 4.5, wd - 1, lines.length * 14 + 5);
    c.restore();
    lines.forEach((l, i) => text(c, l, 10, 8 + i * 14, { size: 11, font: MONO, align: 'left', color: i ? '#bdbdbd' : '#fff' }));
  }

  hud() { return this.stageScene?.hud() ?? null; }
}
