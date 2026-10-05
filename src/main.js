import { AudioEngine } from './audio/audio-engine.js';
import { Renderer } from './render/renderer.js';
import { AssetStore } from './render/assets.js';
import { Game } from './game.js';
import { bindInput } from './input.js';
import { buildEditor } from './editor/index.js';
import { World } from './core/world.js';
import { KeyFlight, KEY_MODEL } from './render/key-flight.js';
import { mountModel } from './vendor/key3d/model-view.js';
import { fitStage } from './ui/layout.js';
import { Hud } from './ui/hud.js';
import { Controls } from './ui/controls.js';
import { refreshMenu } from './ui/menu.js';
import { Score } from './audio/score.js';
import { Progress } from './core/progress.js';
import { ITEMS } from './doodads/pickups.js';
import { Dialog } from './ui/dialog.js';

const $ = (id) => document.getElementById(id);

const audio = new AudioEngine();
const assets = new AssetStore();
const renderer = new Renderer($('stage'), assets);
const game = new Game(audio, renderer);

// Console handle — poke at the sim while it runs: CK.game.room.music.bpm = 160
window.CK = { game, audio, renderer, assets };

let manifest = [];
let editor = null;
let building = false;
const hud = new Hud(game);
let controls = null;
const dialog = new Dialog(game, { box: $('dialog'), head: $('dialog-head'), text: $('room-hint') });

async function boot() {
  // Sprites are optional: an empty (or absent) assets/manifest.json just means every
  // tile keeps drawing itself, which is the state this repo ships in.
  await assets.load();

  // Recorded cello/horn/drum from the Unity project. Optional and non-blocking:
  // a failed load just leaves the synth voices in charge.
  const samples = audio.loadSamples().catch(err => console.warn('[samples]', err));

  manifest = await fetch('rooms/manifest.json').then(r => r.json());
  $('room-select').innerHTML = manifest
    .map(r => `<option value="${r.file}">${r.name}</option>`).join('');

  // Rooms joined by doors. Optional: without world.json every room stands alone.
  game.world = await World.load().catch(err => { console.warn('[world]', err); return null; });
  if (game.world) {
    // Every room the world builds gets what the player has done there replayed.
    game.world.onBuild = (room) => game.applyProgress(room);
    if (game.world.score) game.score = new Score(game.world.score);
  }
  game.onRoomChange = (room) => {
    const entry = manifest.find(m => m.file.replace(/\.json$/, '') === room.id);
    if (entry) $('room-select').value = entry.file;
    roomText(room);
    refreshHud();
    editor?.syncFromRoom();
  };

  const startFile = manifest.find(m => m.file === `${game.world?.start}.json`)?.file ?? manifest[0].file;
  $('room-select').value = startFile;
  await loadRoomFile(startFile);
  // The motif plays under the title, once there is sound. `attract` lets the tune
  // play without the metronome running, so the metronome room loaded behind the
  // title does not start (and open its door) on its own; a new game clears it.
  game.unlockLayers('start');
  game.attract = true;

  editor = buildEditor(game, renderer, assets, {
    layoutBox: $('layout'), legendBox: $('legend'), hintBox: $('legend-hint'),
    tools: $('ed-tools'), palette: $('ed-palette'), inspector: $('ed-inspector'),
    assetsBox: $('ed-assets'),
    roomName: $('ed-name'), wing: $('ed-wing'), bpm: $('ed-bpm'), bpmOut: $('ed-bpm-out'),
    root: $('ed-root'), mode: $('ed-mode'), mood: $('ed-mood'), maxWaves: $('ed-waves'),
    width: $('ed-width'), height: $('ed-height'), hint: $('ed-hint'),
    copyBtn: $('ed-copy'), downloadBtn: $('ed-download'),
  }, {
    onReload: refreshHud,
    onHint: (h) => dialog.show(h, roomHead(game.room)),
    toast: showToast,
  });
  editor.syncFromRoom();

  controls = new Controls();
  bindInput(game, {
    dpad: $('dpad'), 'btn-a': $('btn-a'), 'btn-b': $('btn-b'),
    'btn-l': $('btn-l'), 'btn-r': $('btn-r'), stage: $('stage'),
  }, {
    onAction: () => { unlockAudio(); },
    paused: () => !$('menu').hidden || !$('title').hidden,
    arranging: () => controls.arranging,
  });

  // ---- pause menu: everything the old toolbar held ----
  $('menu-btn').addEventListener('click', () => setMenu(true));
  $('menu-resume').addEventListener('click', () => setMenu(false));
  $('menu').addEventListener('click', (e) => { if (e.target === $('menu')) setMenu(false); });
  $('menu-hint').addEventListener('click', () => { setMenu(false); dialog.show(game.room.hint, roomHead(game.room)); });
  $('arrange').addEventListener('click', () => { setMenu(false); controls.setArranging(true); });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('title').hidden) { e.preventDefault(); setMenu($('menu').hidden); }
  });
  $('menu-title').addEventListener('click', () => { setMenu(false); showTitle(); });
  $('music').addEventListener('click', (e) => {
    if (!game.score) return;
    game.score.muted = !game.score.muted;
    e.currentTarget.classList.toggle('on', !game.score.muted);
  });
  bindTitle();
  for (const id of ['reset', 'toggle-editor', 'toggle-build']) {
    $(id).addEventListener('click', () => setMenu(false));
  }

  $('room-select').addEventListener('change', async (e) => {
    await loadRoomFile(e.target.value);
    editor.syncFromRoom();
  });

  $('samples').addEventListener('click', (e) => {
    audio.useSamples = !audio.useSamples;
    e.currentTarget.textContent = audio.useSamples ? 'live' : 'synth';
    e.currentTarget.classList.toggle('on', audio.useSamples);
  });

  $('reset').addEventListener('click', () => { game.reload(); editor.syncFromRoom(); });
  $('metronome').addEventListener('click', (e) => {
    game.metronome = !game.metronome;
    e.currentTarget.classList.toggle('on', game.metronome);
  });
  $('mute').addEventListener('click', (e) => {
    audio.muted = !audio.muted;
    e.currentTarget.classList.toggle('on', audio.muted);
    e.currentTarget.textContent = audio.muted ? 'unmute' : 'mute';
  });

  $('toggle-editor').addEventListener('click', () => {
    const open = document.body.classList.toggle('editing');
    setBuild(open);          // opening the panel is almost always "I want to build"
    renderer.resize(game.room);
  });
  $('toggle-build').addEventListener('click', () => {
    if (!building) document.body.classList.add('editing');
    setBuild(!building);
    renderer.resize(game.room);
  });
  $('ed-mode-build').addEventListener('click', () => setBuild(true));
  $('ed-mode-play').addEventListener('click', () => setBuild(false));

  window.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (k === 'z') { e.preventDefault(); (e.shiftKey ? editor.redo : editor.undo)(); }
    else if (k === 'y') { e.preventDefault(); editor.redo(); }
  });

  const refit = () => fitStage(renderer, game);
  window.addEventListener('resize', refit);
  window.visualViewport?.addEventListener('resize', refit);
  for (const id of ['toggle-editor', 'toggle-build']) $(id).addEventListener('click', () => requestAnimationFrame(refit));
  refit();
  document.addEventListener('pointerdown', unlockAudio, { once: false });

  game.onToast = showToast;
  const flight = new KeyFlight(document.querySelector('.stage-wrap'), { game, renderer });
  game.onDoorOpen = (door) => flight.play(door);
  window.CK.flight = flight;
  // The end of the world (the Coda's X), or the end of a room played on its own.
  game.onRoomComplete = () => {
    const s = game.score;
    if (!game.world?.has(game.room.id) || !s) { showToast('★ Room resolved'); return; }
    const have = s.layers.filter(l => game.progress.layers.has(l.id)).length;
    dialog.show(`The end. The piece is ${have === s.layers.length ? 'whole' : 'nearly whole'}: ${have} of ${s.layers.length} layers of the score, playing together. Thank you for playing.`, 'The Coda');
  };

  // The screen scrolls to the next room, Zelda style; Coda waits for it.
  game.onBeforeRoomChange = (dir) => {
    renderer.beginScroll(dir);
    game.freeze = 0.32;
  };
  // A new area: its name and mood head the room's text when it is shown next.
  game.onAreaChange = (area) => { newArea = area; };
  game.onCollect = (item) => {
    const it = ITEMS[item];
    dialog.show(`You found ${it?.name ?? item}! ${it?.text ?? ''}`, 'Found');
    refreshHud();
  };
  game.onScoreLayer = (layer) => showToast(`♪ The score grows: ${layer.name}`);
  game.onHurt = () => {
    const w = $('stage-wrap');
    w.classList.remove('hurt'); void w.offsetWidth; w.classList.add('hurt');
  };

  setBuild(false);
  requestAnimationFrame(loop);

  await samples;
  $('samples').textContent = audio.sampler.ready ? 'live' : 'synth';
  $('samples').classList.toggle('on', audio.sampler.ready);
  $('samples').disabled = !audio.sampler.ready;
}

function setBuild(on) {
  building = !!on;
  document.body.classList.toggle('building', building);
  $('toggle-build').classList.toggle('on', building);
  $('ed-mode-build').classList.toggle('on', building);
  $('ed-mode-play').classList.toggle('on', !building);
  editor?.setMode(building ? 'build' : 'play');
}

async function loadRoomFile(file) {
  const json = await fetch(`rooms/${file}`).then(r => r.json());
  game.loadRoom(json);
  roomText(game.room);
  refreshHud();
}

// The room's text in the box under the stage (src/ui/dialog.js): a head line
// with the room's name, and the area's name and mood the first time you are in
// it; then the hint, typed out in time. It stays until tapped away.
let newArea = null;
function roomHead(room) {
  if (!room) return '';
  const area = newArea;
  newArea = null;
  return area ? `${area.name} · ${area.mood} · ${room.music.label}  —  ${room.name}` : room.name;
}
function roomText(room) { dialog.show(room?.hint ?? '', roomHead(room)); }

function setMenu(open) {
  $('menu').hidden = !open;
  if (open) {
    for (const d of [...game.held]) game.setHeld(d, false);
    refreshMenu(game);
  }
}

// ---- the title screen -------------------------------------------------------
//
// Continue (if this browser has a save), a new game, free play (any room, every
// tool, nothing saved), or straight into the editor. The room plays on behind it.

let titleKey = null;
function showTitle() {
  const saved = Progress.saved();
  $('title-continue').disabled = !saved;
  $('title-continue').textContent = saved ? `continue — ${roomName(saved.room)}` : 'continue';
  $('title-free-box').hidden = true;
  $('title').hidden = false;
  for (const d of [...game.held]) game.setHeld(d, false);
  if (!titleKey) titleKey = mountModel($('title-key'), { ...KEY_MODEL, spin: 36 }, { interactive: false, auto: true });
}

function hideTitle() {
  $('title').hidden = true;
  titleKey?.destroy?.();
  titleKey = null;
}

function roomName(id) {
  const json = game.world?.json[id];
  return json?.name ?? id ?? '';
}

function bindTitle() {
  $('title-room').innerHTML = manifest.map(r => `<option value="${r.file}">${r.name}</option>`).join('');
  $('title-continue').addEventListener('click', async () => {
    await unlockAudio();
    const saved = Progress.saved();
    if (!saved || !game.continueGame(saved)) return;
    hideTitle(); afterJump();
  });
  $('title-new').addEventListener('click', async () => {
    await unlockAudio();
    Progress.erase();
    game.newGame();
    hideTitle(); afterJump();
  });
  $('title-free').addEventListener('click', () => {
    $('title-room').value = $('room-select').value;
    $('title-free-box').hidden = !$('title-free-box').hidden;
  });
  $('title-free-go').addEventListener('click', async () => {
    await unlockAudio();
    const file = $('title-room').value;
    game.freePlay(await fetch(`rooms/${file}`).then(r => r.json()));
    $('room-select').value = file;
    hideTitle(); afterJump();
  });
  $('title-editor').addEventListener('click', async () => {
    await unlockAudio();
    game.saving = false;
    game.progress = new Progress().grantAll();
    hideTitle(); afterJump();
    document.body.classList.add('editing');
    setBuild(true);
    requestAnimationFrame(() => fitStage(renderer, game));
  });
  window.addEventListener('keydown', (e) => {
    if ($('title').hidden || e.target instanceof HTMLSelectElement) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      ($('title-continue').disabled ? $('title-new') : $('title-continue')).click();
    }
  });
  showTitle();
}

// After the title (or a menu) put you somewhere: sync everything that shows the room.
function afterJump() {
  const room = game.room;
  const entry = manifest.find(m => m.file.replace(/\.json$/, '') === room.id);
  if (entry) $('room-select').value = entry.file;
  editor?.syncFromRoom();
  newArea = game.world?.area(room.id) ?? null;
  roomText(room);
  refreshHud();
  fitStage(renderer, game);
}

async function unlockAudio() {
  await audio.resume();
  if (!game.clock.running) game.clock.start();
}

function refreshHud() { hud.refresh(true); }

let toastTimer = null;
function showToast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1900);
}

function loop() {
  game.update();
  renderer.draw(game);
  hud.frame();
  dialog.frame();
  requestAnimationFrame(loop);
}

boot().catch(err => {
  document.body.insertAdjacentHTML('afterbegin',
    `<pre class="fatal">Failed to boot: ${err.message}
Rooms are loaded with fetch(), so this needs a local server —
run:  python3 -m http.server 8080   then open http://localhost:8080</pre>`);
  console.error(err);
});
