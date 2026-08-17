import { AudioEngine } from './audio/audio-engine.js';
import { Renderer } from './render/renderer.js';
import { Game } from './game.js';
import { bindInput } from './input.js';
import { buildEditor } from './editor.js';

const $ = (id) => document.getElementById(id);

const audio = new AudioEngine();
const renderer = new Renderer($('stage'));
const game = new Game(audio, renderer);

// Console handle — poke at the sim while it runs: CK.game.room.music.bpm = 160
window.CK = { game, audio, renderer };

let manifest = [];
let editor = null;

async function boot() {
  manifest = await fetch('rooms/manifest.json').then(r => r.json());
  $('room-select').innerHTML = manifest
    .map(r => `<option value="${r.file}">${r.name}</option>`).join('');

  await loadRoomFile(manifest[0].file);

  editor = buildEditor(game, {
    layoutBox: $('layout'), legendBox: $('legend'), hintBox: $('legend-hint'),
    roomName: $('ed-name'), wing: $('ed-wing'), bpm: $('ed-bpm'), bpmOut: $('ed-bpm-out'),
    root: $('ed-root'), mode: $('ed-mode'), mood: $('ed-mood'), maxWaves: $('ed-waves'),
    copyBtn: $('ed-copy'), downloadBtn: $('ed-download'),
  }, refreshHud);
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
    document.body.classList.toggle('editing');
    renderer.resize(game.room);
  });

  window.addEventListener('resize', () => renderer.resize(game.room));
  document.addEventListener('pointerdown', unlockAudio, { once: false });

  game.onToast = showToast;
  game.onRoomComplete = () => showToast('★ Room resolved');

  requestAnimationFrame(loop);
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
