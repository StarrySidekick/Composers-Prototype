import { AudioEngine } from './audio/audio-engine.js';
import { Renderer } from './render/renderer.js';
import { AssetStore } from './render/assets.js';
import { Game } from './game.js';
import { bindInput } from './input.js';
import { buildEditor } from './editor/index.js';
import { World } from './core/world.js';
import { KeyFlight } from './render/key-flight.js';
import { fitStage } from './ui/layout.js';
import { Hud } from './ui/hud.js';
import { Controls } from './ui/controls.js';

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
  game.onRoomChange = (room) => {
    const entry = manifest.find(m => m.file.replace(/\.json$/, '') === room.id);
    if (entry) $('room-select').value = entry.file;
    showHint(room.hint);
    refreshHud();
    editor?.syncFromRoom();
  };

  const startFile = manifest.find(m => m.file === `${game.world?.start}.json`)?.file ?? manifest[0].file;
  $('room-select').value = startFile;
  await loadRoomFile(startFile);

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
    onHint: (h) => { $('room-hint').textContent = h; },
    toast: showToast,
  });
  editor.syncFromRoom();

  controls = new Controls();
  bindInput(game, {
    dpad: $('dpad'), 'btn-a': $('btn-a'), 'btn-b': $('btn-b'), stage: $('stage'),
  }, {
    onAction: () => { unlockAudio(); dismissHint(); },
    paused: () => !$('menu').hidden,
    arranging: () => controls.arranging,
  });

  // ---- pause menu: everything the old toolbar held ----
  $('menu-btn').addEventListener('click', () => setMenu(true));
  $('menu-resume').addEventListener('click', () => setMenu(false));
  $('menu').addEventListener('click', (e) => { if (e.target === $('menu')) setMenu(false); });
  $('menu-hint').addEventListener('click', () => { setMenu(false); showHint(game.room.hint, true); });
  $('arrange').addEventListener('click', () => { setMenu(false); controls.setArranging(true); });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); setMenu($('menu').hidden); }
  });
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
  game.onRoomComplete = () => showToast('★ Room resolved');

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
  showHint(game.room.hint);
  refreshHud();
}

// The room's hint, in a text box over the stage. It steps aside once you start
// playing (or after a while), and the menu can bring it back.
let hintTimer = null, hintShownAt = 0;
function showHint(text, sticky = false) {
  const box = $('dialog');
  $('room-hint').textContent = text ?? '';
  box.hidden = !text;
  box.classList.remove('fade');
  hintShownAt = performance.now();
  clearTimeout(hintTimer);
  if (text) hintTimer = setTimeout(() => dismissHint(true), sticky ? 12000 : 9000);
}
function dismissHint(force = false) {
  const box = $('dialog');
  if (box.hidden || box.classList.contains('fade')) return;
  if (!force && performance.now() - hintShownAt < 1500) return;   // let it be read
  box.classList.add('fade');
  setTimeout(() => { if (box.classList.contains('fade')) box.hidden = true; }, 400);
}

function setMenu(open) {
  $('menu').hidden = !open;
  if (open) for (const d of [...game.held]) game.setHeld(d, false);
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
  requestAnimationFrame(loop);
}

boot().catch(err => {
  document.body.insertAdjacentHTML('afterbegin',
    `<pre class="fatal">Failed to boot: ${err.message}
Rooms are loaded with fetch(), so this needs a local server —
run:  python3 -m http.server 8080   then open http://localhost:8080</pre>`);
  console.error(err);
});
