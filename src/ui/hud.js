// The status bars above and below the stage, after Zelda and Doom: what the room
// is, its key and tempo with a light on every beat, how many waves you have, how
// many forks are lit, the room's mood, and a little staff of the last notes heard.
//
// Read every frame from the game; nothing here changes the game.

const $ = (id) => document.getElementById(id);
const LETTER = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];   // pitch class -> C D E F G A B
const SHARP = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0];

export class Hud {
  constructor(game) {
    this.game = game;
    this.beatsEl = $('hud-beats');
    this.staff = $('hud-staff');
    this.lastKey = '';
    this.lastBeat = -1;
    this.beatCount = 0;
  }

  // Slow-changing text: call when the room changes, and cheaply every frame.
  refresh(force = false) {
    const g = this.game, r = g.room;
    if (!r) return;
    const m = r.music;
    const key = `${r.id}|${m.label}|${m.bpm}|${m.mood}|${m.timeSignature}`;
    if (!force && key === this.lastKey) return;
    this.lastKey = key;
    $('hud-room').textContent = r.name;
    $('hud-key').textContent = m.label;
    $('hud-tempo').textContent = `${Math.round(m.bpm)} bpm`;
    $('hud-mood').textContent = m.mood;
    if (this.beatCount !== m.timeSignature) {
      this.beatCount = m.timeSignature;
      this.beatsEl.innerHTML = Array.from({ length: m.timeSignature }, (_, i) =>
        `<i class="${i === 0 ? 'down' : ''}"></i>`).join('');
    }
  }

  frame() {
    const g = this.game, r = g.room;
    if (!r) return;
    this.refresh();

    // Beat lights from the audio clock, so they flash with what you hear.
    const c = g.clock;
    const k = Math.floor((c.ctx.currentTime - c.startTime) / c.subInterval);
    const beat = Math.floor(k / c.subdivisionsPerBeat) % r.music.timeSignature;
    if (beat !== this.lastBeat) {
      this.lastBeat = beat;
      [...this.beatsEl.children].forEach((el, i) => el.classList.toggle('on', i === beat));
    }

    const allow = g.waveAllowance;
    $('hud-waves').textContent = '◉'.repeat(Math.min(allow, g.activeWaves)).padEnd(allow, '○');
    // The satchel: what is in hand (L sets it down, R turns it), and how many more.
    const pr = g.progress, held = pr.held;
    $('hud-bag-label').textContent = pr.has('burin') ? 'satchel ✎' : 'satchel';
    $('hud-bag').textContent = held
      ? `${held.name}${held.spec.rot ? ` ${held.spec.rot}°` : ''}${pr.satchel.length > 1 ? ` +${pr.satchel.length - 1}` : ''}`
      : '—';
    const locks = r.list.filter(d => d.isLock);
    $('hud-locks').textContent = locks.length ? locks.map(l => (l.lit ? '◆' : '◇')).join('') : '—';
    this.drawStaff();
  }

  // Five lines, the last eight melodic notes as heads, fading with age.
  drawStaff() {
    const cv = this.staff, c = cv.getContext('2d');
    const W = cv.width, H = cv.height, gap = 4, bottom = H - 5;
    c.clearRect(0, 0, W, H);
    c.fillStyle = '#5a5a5a';
    for (let i = 0; i < 5; i++) c.fillRect(0, bottom - i * gap, W, 1);
    const now = this.game.audio.now;
    const notes = this.game.noteHistory.filter(n => n.family !== 'percussion' && n.family !== 'sour').slice(-8);
    notes.forEach((n, i) => {
      const age = now - n.t;
      if (age < 0) return;                       // scheduled, not sounded yet
      const pc = ((n.midi % 12) + 12) % 12;
      const step = (Math.floor(n.midi / 12) - 1) * 7 + LETTER[pc] - (4 * 7 + 2);   // E4 = bottom line
      const y = Math.max(1, Math.min(H - 2, bottom - step * (gap / 2)));
      const x = 8 + i * ((W - 14) / 7);
      c.globalAlpha = Math.max(0.25, 1 - age / 6);
      c.fillStyle = '#fff';
      c.beginPath(); c.ellipse(x, y, 2.6, 1.9, -0.4, 0, Math.PI * 2); c.fill();
      if (SHARP[pc]) c.fillRect(x - 6, y - 2, 1, 4);
    });
    c.globalAlpha = 1;
  }
}
