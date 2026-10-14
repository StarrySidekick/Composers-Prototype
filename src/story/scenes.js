// The scene engines that are not rooms: a title card, a cutscene, a slate, an item
// held overhead, the credits. Tube runs and bosses live in rhythm.js.
//
// Every scene draws on the same square stage the rooms use, with its words in the
// text box under it (src/ui/dialog.js, sung in the scene's key), and takes the same
// Game Boy inputs: A and B move it on, R skips it (press twice), and in developer
// mode L goes back a shot. Its music is a cue (src/story/cue.js) on the room clock,
// so a scene is on the same sixteenth grid as everything else, and its drawings
// "boil" (redraw with a slightly different hand) on that grid too: the old trick
// that makes a still drawing look alive, kept in time with the music.
//
// The contract every engine keeps, so the Director can drive any of them:
//   enter()             the scene starts
//   tick(ev)            one clock sixteenth (ev from BeatClock.poll)
//   frame(dt)           one animation frame
//   draw(c, w, h)       paint the stage (black already)
//   press(btn)          'a' | 'b' | 'l' | 'r'; return true if it used it
//   hold(dir, on)       a D-pad direction went down or up
//   exit()              the scene is being left
//   finish(result)      the engine calls this when it is done
//   hud()               what the status bars should say
//   devLines()          what developer mode should show on the stage

const SERIF = '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

export const KIND_GLYPH = {
  title: '◎', card: '▭', cutscene: '▶', slate: '□', world: '⌗', rhythm: '≡', boss: '◆', item: '✦', credits: '♪',
};
export const KIND_NAME = {
  title: 'the title', card: 'a title card', cutscene: 'a cutscene', slate: 'a placeholder', world: 'a place to explore',
  rhythm: 'a tube run', boss: 'a boss', item: 'something found', credits: 'the credits',
};

// ---- drawing helpers --------------------------------------------------------

// Sketches are cached as pictures (they are a few hundred wobbly strokes each), three
// hands per sketch, and cycled on the clock's sixteenths. Animated ones redraw.
const cache = new Map();
const scratch = document.createElement('canvas');
export function sketch(env, c, key, x, y, w, h, o = {}) {
  const lib = env.sketch;
  if (!lib) { placeholderBox(c, key, x, y, w, h); return; }
  const seed = o.seed ?? env.boil();
  if (lib.isAnimated?.(key) || o.live) {
    // Faded: drawn whole into a scratch canvas first, so a sketch that sets its
    // own alpha inside cannot undo the fade.
    if (c.globalAlpha < 0.999) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const W = Math.max(1, Math.round(w * dpr)), H = Math.max(1, Math.round(h * dpr));
      if (scratch.width !== W || scratch.height !== H) { scratch.width = W; scratch.height = H; }
      const sc = scratch.getContext('2d');
      sc.setTransform(1, 0, 0, 1, 0, 0); sc.clearRect(0, 0, W, H); sc.scale(dpr, dpr);
      try { lib.drawSketch(sc, key, w, h, { ...o, seed }); } catch (e) { placeholderBox(sc, key, 0, 0, w, h); }
      c.drawImage(scratch, x, y, w, h);
      return;
    }
    c.save(); c.translate(x, y);
    try { lib.drawSketch(c, key, w, h, { ...o, seed }); } catch (e) { placeholderBox(c, key, 0, 0, w, h); }
    c.restore();
    return;
  }
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = Math.max(1, Math.round(w)), H = Math.max(1, Math.round(h));
  // A still sketch ignores the clock, so `t` must not be part of what it is
  // cached as, or every frame would miss.
  const { t: _t, ...still } = o;
  const id = `${key}|${W}x${H}|${seed}|${JSON.stringify(still)}`;
  let cv = cache.get(id);
  if (!cv) {
    cv = document.createElement('canvas');
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    const cc = cv.getContext('2d');
    cc.scale(dpr, dpr);
    try { lib.drawSketch(cc, key, W, H, { ...o, seed }); } catch (e) { placeholderBox(cc, key, 0, 0, W, H); }
    cache.set(id, cv);
    if (cache.size > 90) cache.delete(cache.keys().next().value);
  }
  c.drawImage(cv, x, y, w, h);
}

function placeholderBox(c, key, x, y, w, h) {
  c.save();
  c.strokeStyle = '#7d7d7d'; c.setLineDash([6, 6]); c.lineWidth = 2;
  c.strokeRect(x + 4, y + 4, w - 8, h - 8);
  c.setLineDash([]);
  c.fillStyle = '#7d7d7d'; c.font = `12px ${MONO}`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(key, x + w / 2, y + h / 2);
  c.restore();
}

// Wrapped text on the stage. Returns the height used.
export function text(c, str, x, y, { size = 16, font = SERIF, align = 'center', color = '#fff', max = 0, lead = 1.3, weight = '', italic = false, spacing = 0, upper = false } = {}) {
  if (!str) return 0;
  c.save();
  c.fillStyle = color;
  c.font = `${italic ? 'italic ' : ''}${weight} ${size}px ${font}`;
  c.textAlign = align; c.textBaseline = 'top';
  if (spacing && 'letterSpacing' in c) c.letterSpacing = `${spacing}px`;
  const s = upper ? String(str).toUpperCase() : String(str);
  const lines = [];
  for (const para of s.split('\n')) {
    if (!max) { lines.push(para); continue; }
    let line = '';
    for (const word of para.split(' ')) {
      const t = line ? `${line} ${word}` : word;
      if (c.measureText(t).width > max && line) { lines.push(line); line = word; } else line = t;
    }
    lines.push(line);
  }
  lines.forEach((l, i) => c.fillText(l, x, y + i * size * lead));
  c.restore();
  return lines.length * size * lead;
}

const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
const clamp01 = (k) => Math.max(0, Math.min(1, k));
const lerp = (a, b, k) => a + (b - a) * k;

// ---- the base ---------------------------------------------------------------

export class SceneBase {
  constructor(env, sc, opts = {}) {
    this.env = env;
    this.sc = sc;
    this.opts = opts;
    this.music = env.outline.musicFor(sc);
    this.cue = env.makeCue(sc.cue ?? this.defaultCue, this.music);
    this.startIndex = null;
    this.ended = false;
    this.skipArmed = 0;
  }

  get defaultCue() { return 'hush'; }
  get takesStage() { return true; }
  get dev() { return this.env.director.dev; }
  get auto() { return this.env.director.autoplay; }

  // Beats since the scene started, smooth, from the audio clock.
  get beats() {
    const clock = this.env.game.clock;
    if (this.startIndex == null) return 0;
    return Math.max(0, (clock.ctx.currentTime - clock.timeOf(this.startIndex)) / clock.beatInterval);
  }

  enter() {}
  exit() {}

  tick(ev) {
    if (this.startIndex == null) this.startIndex = ev.index;
    this.cue?.tick(ev, this.env.audio);
    this.onTick(ev);
  }
  onTick() {}
  frame() {}
  draw() {}
  hold() {}

  // R twice skips anything; in developer mode once is enough.
  press(btn) {
    if (btn === 'r') {
      const now = performance.now();
      if (this.dev || now - this.skipArmed < 2500) { this.finish({ skipped: true }); return true; }
      this.skipArmed = now;
      this.env.director.toast('R again to skip');
      return true;
    }
    return this.onPress(btn);
  }
  onPress() { return false; }

  finish(result = {}) {
    if (this.ended) return;
    this.ended = true;
    this.env.director.finished(this, result);
  }

  say(textStr, who = null) {
    const cast = this.env.outline.cast;
    const head = who === 'narrator' || !who ? '' : who === 'game' ? (cast.game?.name ?? 'the game') : (cast[who]?.name ?? who);
    this.env.dialog.show(textStr, head);
  }

  hud() {
    const act = this.env.outline.actOf(this.sc.id);
    const actName = (act?.name ?? '').replace(/^Act [IVXL]+:\s*/, '');
    return { name: this.sc.title ?? this.sc.id, music: this.music, act: actName, kind: this.sc.kind };
  }

  devLines() { return []; }

  // The small "A next · R skip" line in the stage's corner.
  hint(c, w, h, str) {
    text(c, str, w - 10, h - 20, { size: 11, font: MONO, align: 'right', color: '#7d7d7d' });
  }
}

// ---- title card ---------------------------------------------------------------
//
// An area's name, its instrument family, and what it is about: the way a Zelda
// dungeon names itself on entry, with the struggle it stands for underneath.

export class CardScene extends SceneBase {
  get defaultCue() { return 'gate'; }
  enter() { if (this.sc.say) this.say(this.sc.say, this.sc.who); }
  onTick() {
    const beats = this.sc.beats ?? 10;
    if (this.beats >= beats && (this.auto || !this.sc.say)) this.finish();
  }
  onPress(btn) { if ((btn === 'a' || btn === 'b') && this.beats > 1) { this.finish(); return true; } return false; }

  draw(c, w, h) {
    const k = clamp01(this.beats / 2);
    c.save();
    c.globalAlpha = ease(k);
    sketch(this.env, c, 'frame', 0, 0, w, h);
    const em = this.sc.emblem ? `emblem.${this.sc.emblem}` : null;
    const s = w * 0.3;
    if (em) sketch(this.env, c, em, (w - s) / 2, h * 0.12, s, s);
    let y = h * 0.47;
    y += text(c, this.sc.name ?? this.sc.title, w / 2, y, { size: Math.round(w * 0.072), spacing: w * 0.008, upper: true, max: w * 0.8 });
    y += h * 0.02;
    if (this.sc.family) y += text(c, this.sc.family, w / 2, y, { size: Math.round(w * 0.034), font: MONO, color: '#9a9a9a', spacing: 3, upper: true });
    y += h * 0.035;
    sketch(this.env, c, 'divider', w * 0.25, y, w * 0.5, h * 0.05);
    y += h * 0.07;
    if (this.sc.theme) text(c, this.sc.theme, w / 2, y, { size: Math.round(w * 0.05), italic: true, max: w * 0.75 });
    c.restore();
    if (this.beats > 1) this.hint(c, w, h, 'A continue');
  }
}

// ---- cutscene -----------------------------------------------------------------
//
// Shots, each a rough drawing (a sketch from src/story/sketch.js) with optional
// figures laid over it, a camera move, an effect, and a line of text. A shot with a
// line waits for A (or a tap on the text box); one without moves on after its beats.
//
//   { "draw": "castle-far", "beats": 8, "cam": { "from": [0.5,0.5,1], "to": [0.5,0.4,1.3] },
//     "layers": [{ "draw": "coda", "o": { "pose": "sit" }, "box": [0.4,0.5,0.2,0.3], "to": [0.4,0.45] }],
//     "fx": "boom", "say": "...", "who": "fermata", "cue": "tense", "hit": [[0, 0, 2, "timpani"]] }

export class CutsceneScene extends SceneBase {
  get defaultCue() { return 'hush'; }

  enter() {
    this.shots = this.sc.shots?.length ? this.sc.shots : [{ draw: 'frame', say: this.sc.brief ?? this.sc.title }];
    this.i = -1;
    this.next();
  }

  get shot() { return this.shots[this.i]; }

  next(dir = 1) {
    this.i += dir;
    if (this.i < 0) this.i = 0;
    if (this.i >= this.shots.length) { this.finish(); return; }
    const sh = this.shot;
    this.shotAt = this.beats;
    this.waiting = !!sh.say;
    this.textDone = false;
    if (sh.cue) this.cue = this.env.makeCue(sh.cue, this.music);
    if (sh.say) this.say(sh.say, sh.who); else this.env.dialog.show('', '');
    if (sh.hit) this.pendingHits = sh.hit.map(([s, degree, octave = 3, family = 'timpani', kind = null]) => ({ s, degree, octave, family, kind }));
    else this.pendingHits = null;
    this.hitBase = null;
  }

  get shotBeats() { return this.beats - (this.shotAt ?? 0); }

  onTick(ev) {
    // One-off sounds a shot asked for (a thud, a bell), on its sixteenths.
    if (this.pendingHits) {
      if (this.hitBase == null) this.hitBase = ev.index;
      for (const hit of this.pendingHits) {
        if (hit.done || ev.index - this.hitBase < hit.s) continue;
        hit.done = true;
        this.env.audio.play({ family: hit.family, kind: hit.kind, midi: this.music.getNote(hit.degree, hit.octave), intensity: 0.8, when: ev.time, heard: false });
      }
    }
    const sh = this.shot;
    if (!sh) return;
    const beats = sh.beats ?? (sh.say ? 6 : 4);
    if (!this.env.dialog.typing) this.textDone = true;
    if (!sh.say && this.shotBeats >= beats) this.next();
    else if (sh.say && this.auto && this.textDone && this.shotBeats >= Math.min(beats, 3)) this.next();
    else if (sh.say && sh.auto && this.textDone && this.shotBeats >= beats) this.next();
  }

  onPress(btn) {
    if (btn === 'l' && this.dev) { this.next(-1); return true; }
    if (btn !== 'a' && btn !== 'b') return false;
    if (this.env.dialog.typing) { this.env.dialog.finish(); return true; }
    this.next();
    return true;
  }

  // The text box was tapped away: same as A.
  dismissed() { if (this.shot?.say && !this.env.dialog.typing) this.next(); }

  draw(c, w, h) {
    const sh = this.shot;
    if (!sh) return;
    const beats = sh.beats ?? (sh.say ? 6 : 4);
    const k = ease(clamp01(this.shotBeats / Math.max(1, beats)));
    c.save();
    // The camera: a centre and a zoom, eased across the shot.
    const from = sh.cam?.from ?? [0.5, 0.5, 1], to = sh.cam?.to ?? from;
    const cx = lerp(from[0], to[0], k), cy = lerp(from[1], to[1], k), z = lerp(from[2] ?? 1, to[2] ?? 1, k);
    let sx = 0, sy = 0;
    if ((sh.fx === 'shake' || sh.fx === 'boom') && this.shotBeats < 2) {
      const a = (2 - this.shotBeats) * w * 0.012;
      sx = (Math.random() - 0.5) * a; sy = (Math.random() - 0.5) * a;
    }
    c.translate(w / 2 + sx, h / 2 + sy); c.scale(z, z); c.translate(-cx * w, -cy * h);
    if (sh.draw) sketch(this.env, c, sh.draw, 0, 0, w, h, { ...(sh.o ?? {}), t: this.shotBeats });
    for (const L of sh.layers ?? []) {
      const b = L.box ?? [0.35, 0.35, 0.3, 0.3];
      const at = L.to ? [lerp(b[0], L.to[0], k), lerp(b[1], L.to[1], k)] : [b[0], b[1]];
      sketch(this.env, c, L.draw, at[0] * w, at[1] * h, b[2] * w, b[3] * h, { ...(L.o ?? {}), t: this.shotBeats });
    }
    c.restore();
    // A portrait in the corner when a character speaks.
    if (sh.who && sh.who !== 'narrator') {
      const s = w * 0.26;
      c.save();
      c.fillStyle = '#000'; c.fillRect(8, h - s - 8, s, s);
      c.strokeStyle = '#fff'; c.lineWidth = 2; c.strokeRect(8, h - s - 8, s, s);
      sketch(this.env, c, `portrait.${sh.who}`, 10, h - s - 6, s - 4, s - 4, { t: this.shotBeats });
      c.restore();
    }
    if (sh.fx === 'flash' || sh.fx === 'boom') {
      const a = clamp01(1 - this.shotBeats / 1.5);
      if (a > 0) { c.fillStyle = `rgba(255,255,255,${a})`; c.fillRect(0, 0, w, h); }
    }
    if (sh.fx === 'fade-in') { const a = clamp01(1 - this.shotBeats / 2); if (a > 0) { c.fillStyle = `rgba(0,0,0,${a})`; c.fillRect(0, 0, w, h); } }
    if (sh.fx === 'fade-out') { const a = clamp01((this.shotBeats - beats + 2) / 2); if (a > 0) { c.fillStyle = `rgba(0,0,0,${a})`; c.fillRect(0, 0, w, h); } }
    if (sh.caption) {
      c.fillStyle = 'rgba(0,0,0,0.7)'; c.fillRect(0, h * 0.06, w, w * 0.08);
      text(c, sh.caption, w / 2, h * 0.075, { size: Math.round(w * 0.04), italic: true });
    }
    this.hint(c, w, h, sh.say ? 'A next · R skip' : 'R skip');
  }

  devLines() { return [`shot ${this.i + 1}/${this.shots.length} · ${this.shot?.draw ?? '—'} · ${this.shotBeats.toFixed(1)} beats`]; }
}

// ---- slate: the placeholder ------------------------------------------------------
//
// Anything not roughed out yet is a slate: what goes here, how long it should take,
// stamped NOT YET CARVED. Voiced by the game itself, which knows it is unfinished
// (Undertale knew it was a game too). A slate standing in for rooms can offer to
// drop you into the rooms that stand in for them now: B.

export class SlateScene extends SceneBase {
  get defaultCue() { return 'hush'; }
  enter() {
    const words = this.sc.say ?? this.sc.brief ?? `${this.sc.title}. Not carved yet.`;
    this.say(words, 'game');
  }
  onTick() { if (this.auto && !this.env.dialog.typing && this.beats > 4) this.finish(); }
  onPress(btn) {
    if (this.env.dialog.typing && (btn === 'a' || btn === 'b')) { this.env.dialog.finish(); return true; }
    if (btn === 'a') { this.finish(); return true; }
    if (btn === 'b' && this.sc.standIn) { this.finish({ standIn: true }); return true; }
    return false;
  }
  dismissed() {}

  draw(c, w, h) {
    sketch(this.env, c, 'frame', 0, 0, w, h);
    const s = w * 0.4;
    c.save(); c.globalAlpha = 0.55;
    sketch(this.env, c, this.sc.draw ?? (this.sc.emblem ? `emblem.${this.sc.emblem}` : 'divider'), (w - s) / 2, h * 0.08, s, s * 0.8);
    c.restore();
    let y = h * 0.44;
    y += text(c, KIND_NAME[this.sc.slateOf ?? this.sc.kind] ?? 'a moment', w / 2, y, { size: Math.round(w * 0.03), font: MONO, color: '#9a9a9a', spacing: 3, upper: true });
    y += h * 0.012;
    y += text(c, this.sc.title, w / 2, y, { size: Math.round(w * 0.058), max: w * 0.8, lead: 1.15 });
    if (this.sc.minutes) y += h * 0.012 + text(c, `about ${fmtMinutes(this.sc.minutes)} here`, w / 2, y + h * 0.012, { size: Math.round(w * 0.035), italic: true, color: '#bdbdbd' });
    // The stamp, at an angle, under whatever the title took.
    const sy = Math.min(h * 0.86, Math.max(h * 0.76, y + h * 0.1));
    c.save();
    c.translate(w * 0.5, sy); c.rotate(-0.1);
    sketch(this.env, c, 'stamp', -w * 0.3, -h * 0.06, w * 0.6, h * 0.12);
    text(c, 'NOT YET CARVED', 0, -h * 0.022, { size: Math.round(w * 0.045), font: MONO, weight: '700', spacing: 2 });
    c.restore();
    this.hint(c, w, h, this.sc.standIn ? 'A continue · B play the stand-in rooms' : 'A continue');
  }
}

export function fmtMinutes(m) {
  m = Number(m) || 0;
  if (m < 1) return `${Math.round(m * 60)} seconds`;
  if (m < 60) return `${Math.round(m)} minute${Math.round(m) === 1 ? '' : 's'}`;
  const h = Math.floor(m / 60), r = Math.round(m % 60);
  return `${h}h${r ? String(r).padStart(2, '0') : ''}`;
}

// ---- item: held overhead ------------------------------------------------------------
//
// Zelda's item get: Coda holds it up, rays behind, a fanfare once through. `item`
// is a story item (remembered in the save); `give` is a real tool the rooms read
// ('overtone', 'burin'); `flags` are story flags.

export class ItemScene extends SceneBase {
  get defaultCue() { return 'fanfare'; }
  enter() {
    this.env.director.grant(this.sc);
    this.say(this.sc.say ?? `You found ${this.sc.name ?? this.sc.title}!`, this.sc.who ?? null);
  }
  onTick() { if (this.auto && !this.env.dialog.typing && this.beats > 4) this.finish(); }
  onPress(btn) {
    if (btn !== 'a' && btn !== 'b') return false;
    if (this.env.dialog.typing) { this.env.dialog.finish(); return true; }
    if (this.beats > 1) this.finish();
    return true;
  }
  dismissed() { if (this.beats > 1) this.finish(); }

  draw(c, w, h) {
    // rays, turning slowly
    c.save();
    c.translate(w / 2, h * 0.36);
    c.rotate(this.beats * 0.08);
    c.strokeStyle = '#fff'; c.lineWidth = 2;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const down = Math.sin(a + this.beats * 0.08);
      if (down > 0.55) continue;           // none fall across Coda below
      const r0 = w * 0.16, r1 = w * (i % 2 ? 0.3 : 0.4);
      c.beginPath(); c.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); c.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); c.stroke();
    }
    c.restore();
    const lift = Math.min(1, this.beats / 1.5);
    const s = w * 0.26;
    sketch(this.env, c, this.sc.draw ?? 'item.key', (w - s) / 2, h * 0.36 - s / 2 - (1 - lift) * h * 0.1, s, s);
    sketch(this.env, c, 'coda', w * 0.32, h * 0.5, w * 0.36, h * 0.44, { pose: 'hold', t: this.beats });
    text(c, this.sc.name ?? this.sc.title, w / 2, h * 0.06, { size: Math.round(w * 0.05), upper: true, spacing: 2, max: w * 0.9 });
    this.hint(c, w, h, 'A continue');
  }
}

// ---- credits: the bow -------------------------------------------------------------
//
// Coda conducts the whole tune, every layer the castle gave it, in a concert hall.
// The last bar: a cut-off, a breath of silence, a deep bow, applause; then the names
// roll. If `encore` is set, the audience will not stop clapping: A plays it.

export class CreditsScene extends SceneBase {
  get defaultCue() { return { score: 'castle', layers: 'all' }; }

  enter() {
    this.performBeats = (this.sc.bars ?? 8) * 4;
    this.phase = 'perform';
    this.lines = this.sc.lines ?? [];
    this.scroll = 0;
    this.speed = 1;
    this.applause = null;
    this.reprise = null;
    this.env.dialog.show('', '');
  }

  onTick(ev) {
    const b = this.beats;
    if (this.phase === 'perform' && b >= this.performBeats) { this.phase = 'cutoff'; this.cue = null; this.at = b; }
    else if (this.phase === 'cutoff' && b - this.at >= 2) {
      this.phase = 'bow'; this.at = b;
      this.applause = this.env.makeCue('applause', this.music);
      this.env.audio.play({ family: 'timpani', midi: this.music.getNote(0, 2), intensity: 0.4, when: ev.time, heard: false });
    } else if (this.phase === 'bow' && b - this.at >= 6) {
      this.phase = 'roll'; this.at = b;
      this.reprise = this.env.makeCue({ score: 'castle', layers: ['motif'] }, this.music);
    } else if (this.phase === 'roll' && this.scroll > this.rollLength + 40) {
      this.phase = 'end'; this.at = b;
      if (this.sc.encore) this.say(this.sc.encoreSay ?? 'The audience will not stop clapping.', 'game');
      else if (this.auto) this.finish();
    } else if (this.phase === 'end' && this.auto && b - this.at > 4) {
      this.finish(this.sc.encore ? { encore: true } : {});
    }
    if (this.applause && (this.phase === 'bow' || this.phase === 'end' || (this.phase === 'roll' && b - this.at < 6))) {
      this.applause.gain = this.phase === 'roll' ? Math.max(0, 1 - (b - this.at) / 6) : 1;
      this.applause.tick(ev, this.env.audio);
    }
    this.reprise?.tick(ev, this.env.audio);
  }

  frame(dt) { if (this.phase === 'roll') this.scroll += dt * 34 * this.speed * (this.auto ? 12 : 1); }

  onPress(btn) {
    if (this.phase === 'end') {
      if (btn === 'a') { this.finish(this.sc.encore ? { encore: true } : {}); return true; }
      if (btn === 'b') { this.finish({ title: true }); return true; }
    }
    if (btn === 'a' || btn === 'b') { this.speed = this.speed > 1 ? 1 : 5; return true; }
    return false;
  }

  draw(c, w, h) {
    const b = this.beats;
    const dim = this.phase === 'roll' || this.phase === 'end';
    c.save();
    if (dim) c.globalAlpha = 0.35;
    sketch(this.env, c, 'hall', 0, 0, w, h);
    let pose = 'conduct', amount = 0;
    if (this.phase === 'cutoff') pose = 'conduct';
    if (this.phase === 'bow') { pose = 'bow'; const k = (b - this.at) / 6; amount = k < 0.2 ? k / 0.2 : k < 0.7 ? 1 : Math.max(0, 1 - (k - 0.7) / 0.3); }
    if (dim) pose = 'stand';
    sketch(this.env, c, 'coda', w * 0.39, h * 0.46, w * 0.22, h * 0.3, { pose, amount, t: this.phase === 'cutoff' ? 0 : b, live: true });
    c.restore();
    if (dim) {
      const lineH = Math.round(w * 0.045);
      let y = h + 10 - this.scroll;
      const start = y;
      for (const l of this.lines) {
        const big = l.startsWith('# '), small = l.startsWith('- ');
        const str = l.replace(/^[#-] /, '');
        const size = big ? Math.round(w * 0.06) : small ? Math.round(w * 0.032) : Math.round(w * 0.04);
        // Drawn even off screen (the canvas clips it): its height is what moves the next line down.
        const used = text(c, str, w / 2, y, { size, upper: big, spacing: big ? 3 : 0, color: small ? '#a0a0a0' : '#fff', max: w * 0.85, italic: small }) || size;
        y += used + (big ? lineH * 0.6 : lineH * 0.25);
      }
      this.rollLength = y - start;
    }
    if (this.phase === 'end') this.hint(c, w, h, this.sc.encore ? 'A encore · B bow out' : 'A');
    else if (this.phase === 'roll') this.hint(c, w, h, 'A faster · R skip');
  }

  devLines() { return [`${this.phase} · beat ${this.beats.toFixed(1)}/${this.performBeats}`]; }
}

// ---- title and world: scenes that hand the screen back -----------------------------

export class TitleScene extends SceneBase {
  get takesStage() { return false; }
  get defaultCue() { return 'silence'; }
  enter() { this.env.director.ui.showTitle?.(); }
}

// Rooms. The Director walks Coda into the world and the room the scene names, and
// the game runs as it always has; the scene ends when a story moment, a trigger or
// the room's own ending says so (or developer mode skips it).
export class WorldScene extends SceneBase {
  get takesStage() { return false; }
  get defaultCue() { return 'silence'; }
  hud() { return null; }
  devLines() {
    const g = this.env.game, r = g.room;
    return r ? [`${r.id} · tile ${g.player.x},${g.player.y} facing ${g.player.facing} · waves ${g.keyWaves}/${g.waveAllowance}`] : [];
  }
}
