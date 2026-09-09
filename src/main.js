import { AudioEngine } from './audio/audio-engine.js';
import { Renderer } from './render/renderer.js';
import { AssetStore } from './render/assets.js';
import { Game } from './game.js';
import { bindInput } from './input.js';
import { buildEditor } from './editor/index.js';

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

  await loadRoomFile(manifest[0].file);

  editor = buildEditor(game, renderer, assets, {
    layoutBox: $('layout'), legendBox: $('legend'), hintBox: $('legend-hint'),
    tools: $('ed-tools'), palette: $('ed-palette'), inspector: $('ed-inspector'),
    assetsBox: $('ed-assets'), reportBox: $('ed-report'),
    roomName: $('ed-name'), wing: $('ed-wing'), bpm: $('ed-bpm'), bpmOut: $('ed-bpm-out'),
    root: $('ed-root'), mode: $('ed-mode'), mood: $('ed-mood'), maxWaves: $('ed-waves'),
    width: $('ed-width'), height: $('ed-height'), hint: $('ed-hint'),
    copyBtn: $('ed-copy'), downloadBtn: $('ed-download'),
  }, {
    onReload: refreshHud,
    onHint: (h) => { $('room-hint').textContent = h; },
    toast: showToast,
    // A Report finding is a tile the room-report tool always had to be told
    // about by hand; here you can just go to it. Switches into build mode
    // (a jump is always "I want to go fix this") and selects the tile, which
    // also makes the Tile panel above show that piece's own properties.
    onJump: (x, y) => { setBuild(true); editor?.paint.select(x, y); },
  });
  editor.syncFromRoom();

  bindInput(game, {
    'pad-up': $('pad-up'), 'pad-down': $('pad-down'),
    'pad-left': $('pad-left'), 'pad-right': $('pad-right'),
    'btn-a': $('btn-a'), 'btn-b': $('btn-b'),
  }, { onAction: unlockAudio });

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

  window.addEventListener('resize', () => renderer.resize(game.room));
  document.addEventListener('pointerdown', unlockAudio, { once: false });

  game.onToast = showToast;
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
  $('room-hint').textContent = game.room.hint ?? '';
  refreshHud();
}

async function unlockAudio() {
  await audio.resume();
  if (!game.clock.running) game.clock.start();
}

function refreshHud() {
  const m = game.room.music;
  $('hud-key').textContent = m.label;
  $('hud-tempo').textContent = `${Math.round(m.bpm)} bpm · ${m.timeSignature}/4`;
  $('hud-mood').textContent = m.mood;
}

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
  $('hud-waves').textContent = '◉'.repeat(game.activeWaves).padEnd(game.room.maxWaves, '○');
  refreshHudLight();
  requestAnimationFrame(loop);
}

let lastKey = '';
function refreshHudLight() {
  const m = game.room.music;
  const k = `${m.label}|${m.bpm}|${m.mood}`;
  if (k !== lastKey) { lastKey = k; refreshHud(); }
}

boot().catch(err => {
  document.body.insertAdjacentHTML('afterbegin',
    `<pre class="fatal">Failed to boot: ${err.message}
Rooms are loaded with fetch(), so this needs a local server —
run:  python3 -m http.server 8080   then open http://localhost:8080</pre>`);
  console.error(err);
});
