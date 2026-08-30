// The debug strip — a testing surface for understanding what the sim is doing,
// not a game feature. Nothing in here ports to Unity; it is the prototype-side
// equivalent of an inspector window.
//
// Three readouts plus a transport:
//   transport  pause / step one subdivision / step one beat / time-scale
//   waves      every live SoundWaveState, updated live
//   notes      what the audio engine was actually asked to play (the same feed
//              the note locks listen on)
//   locks      each lock's truth: what a note lock wants vs. what it has heard

import { midiName, NOTE_NAMES } from './core/music.js';

const SPEEDS = [0.25, 0.5, 1, 2, 4];

export function buildDebug(game, renderer, els) {
  const { panel, toggleBtn } = els;

  panel.innerHTML = `
    <div class="dbg-transport">
      <button id="dbg-pause" class="chip" title="Pause the beat clock (P)">⏸ pause</button>
      <button id="dbg-step" class="chip" title="Step one subdivision (.)">step ¹⁄₄</button>
      <button id="dbg-step-beat" class="chip" title="Step one full beat">step beat</button>
      <label class="dbg-speed">speed
        <select id="dbg-speed">
          ${SPEEDS.map(s => `<option value="${s}" ${s === 1 ? 'selected' : ''}>${s}×</option>`).join('')}
        </select>
      </label>
      <span id="dbg-clock" class="dbg-clock"></span>
    </div>
    <div class="dbg-cols">
      <div class="dbg-col"><h3>waves</h3><pre id="dbg-waves"></pre></div>
      <div class="dbg-col"><h3>notes heard</h3><pre id="dbg-notes"></pre></div>
      <div class="dbg-col"><h3>locks</h3><pre id="dbg-locks"></pre></div>
    </div>`;

  const $ = (id) => panel.querySelector(`#${id}`);
  const pauseBtn = $('dbg-pause');

  let open = false;

  function setOpen(on) {
    open = !!on;
    panel.hidden = !open;
    toggleBtn.classList.toggle('on', open);
    renderer.debug = open;
    // Closing the panel hands the sim back at real time — nothing frozen or
    // fast-forwarded behind a control surface that is no longer visible.
    if (!open) {
      if (game.paused) setPaused(false);
      game.clock.setRate(1);
      $('dbg-speed').value = '1';
    }
  }

  function setPaused(on) {
    game.setPaused(on);
    pauseBtn.classList.toggle('on', game.paused);
    pauseBtn.textContent = game.paused ? '▶ play' : '⏸ pause';
  }

  toggleBtn.addEventListener('click', () => setOpen(!open));
  pauseBtn.addEventListener('click', () => setPaused(!game.paused));
  $('dbg-step').addEventListener('click', () => { if (!game.paused) setPaused(true); game.stepOnce(); });
  $('dbg-step-beat').addEventListener('click', () => {
    if (!game.paused) setPaused(true);
    do { game.stepOnce(); } while (game.clock.index % game.clock.subdivisionsPerBeat !== 0);
  });
  $('dbg-speed').addEventListener('change', (e) => game.clock.setRate(parseFloat(e.target.value)));

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
    if (e.ctrlKey || e.metaKey) return;
    if (e.key === 'p' || e.key === 'P') { if (!open) setOpen(true); setPaused(!game.paused); }
    else if (e.key === '.' && open) { if (!game.paused) setPaused(true); game.stepOnce(); }
  });

  // ---- readouts -----------------------------------------------------------

  const pc = (midi) => NOTE_NAMES[((midi % 12) + 12) % 12];
  const arrow = (d) => d.y < 0 ? '↑' : d.y > 0 ? '↓' : d.x < 0 ? '←' : '→';

  function wavesText() {
    if (!game.waves.length) return '—';
    return game.waves.map(w =>
      `#${w.id} (${w.x},${w.y})${arrow(w.dir)} ${midiName(w.state.pitch).padEnd(4)} ` +
      `i=${w.state.intensity.toFixed(2)} m=${w.state.modulation.toFixed(2)} ` +
      `${w.state.source} t=${w.state.tilesTraversed}`
    ).join('\n');
  }

  function notesText() {
    const h = game.noteHistory;
    if (!h.length) return '—';
    return h.slice(-14).reverse().map(n => {
      const mute = n.family === 'percussion' || n.family === 'sour' ? '  (locks deaf)' : '';
      return `${midiName(n.midi).padEnd(4)} ${n.family}${mute}`;
    }).join('\n');
  }

  function locksText() {
    const locks = game.room.list.filter(d => d.isLock);
    if (!locks.length) return '—';
    return locks.map(d => {
      const state = d.lit ? '● lit' : '○';
      if (d.sequence) {
        const wants = d.sequence.map((deg, i) => {
          const name = pc(game.room.music.getNote(deg, 4));
          return i < d.progress ? `[${name}]` : name;
        }).join(' ');
        return `♫ (${d.x},${d.y}) ${d.group}: ${wants} ${state}`;
      }
      return `◉ (${d.x},${d.y}) ${d.group}: ${state}`;
    }).join('\n');
  }

  let lastRefresh = 0;
  function update(now = performance.now()) {
    if (!open) return;
    const c = game.clock;
    $('dbg-clock').textContent =
      `bar ${Math.floor(c.index / c.subdivisionsPerBeat / game.room.music.timeSignature) + 1} · ` +
      `beat ${(Math.floor(c.index / c.subdivisionsPerBeat) % game.room.music.timeSignature) + 1} · ` +
      `sub ${(c.index % c.subdivisionsPerBeat + c.subdivisionsPerBeat) % c.subdivisionsPerBeat + 1}`;
    if (now - lastRefresh < 120 && !game.paused) return; // the pre-formatted text churns; 8 Hz is plenty
    lastRefresh = now;
    $('dbg-waves').textContent = wavesText();
    $('dbg-notes').textContent = notesText();
    $('dbg-locks').textContent = locksText();
  }

  setOpen(false);
  return { update, setOpen };
}
