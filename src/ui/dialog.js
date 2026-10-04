// The text box, the way an old game does it: below the play area (never over it),
// typed out a word at a time, each word a little sung syllable, and it stays
// until you tap it. A tap while it is still typing finishes the line; a tap after
// closes it. The pause menu's "show hint" brings it back.
//
// The words are in time and in tune. A word lands on a sixteenth of the room's
// clock, like every other sound in the game; a long word takes two, and the end of
// a sentence rests for an eighth. Each word sings a tone of the chord the level's tune
// is on right now (src/audio/score.js), climbing through it as a sentence goes,
// resting on the root at a full stop and lifting at a question mark. So the box
// speaks in the room's key and mode: content in the Atrium, tense in the Discord.
// All of it `heard: false`: the box must never answer a lock.

const ARPEGGIO = [0, 1, 2, 1, 2, 3, 2, 1];   // indices into the chord tones below

export class Dialog {
  constructor(game, { box, head, text }) {
    this.game = game;
    this.box = box;
    this.head = head;
    this.text = text;
    this.words = [];     // { text, due, at, shown, sounded, tone }
    this.typing = false;
    box.addEventListener('pointerdown', (e) => { e.preventDefault(); this.tap(); });
  }

  get open() { return !this.box.hidden; }

  // Show a message. `head` is the small line above it (room, area, mood).
  show(text, head = '') {
    this.head.textContent = head;
    this.head.hidden = !head;
    this.text.textContent = '';
    this.box.scrollTop = 0;
    this.box.hidden = !text && !head;
    this.box.classList.remove('done');
    if (!text) { this.words = []; this.typing = false; return; }
    const parts = text.split(/\s+/).filter(Boolean);
    const clock = this.game.clock;
    // The first word on the next eighth, so the line starts on the grid with a breath.
    let due = clock.index + 2 + ((clock.index + 2) % 2);
    let k = 0;   // word in sentence
    this.words = parts.map((w) => {
      const end = /[.!:;]$/.test(w), ask = /\?$/.test(w);
      const word = { text: w, due, end, ask, k, shown: false, sounded: false };
      due += w.replace(/[^\w']/g, '').length > 9 ? 2 : 1;
      if (end || ask) { due += 2; k = 0; } else k++;
      return word;
    });
    this.started = performance.now();
    // No sound until the first tap starts the clock: this message types out on
    // the wall clock instead, silently, even if the clock starts halfway through.
    this.wall = !clock.running;
    this.typing = true;
    this.spans = this.words.map((w, i) => {
      const s = document.createElement('span');
      s.textContent = (i ? ' ' : '') + w.text;
      s.style.visibility = 'hidden';
      this.text.appendChild(s);
      return s;
    });
  }

  // A long message scrolls with the typing, so the newest word is always in view.
  follow(i) {
    const s = this.spans[i], b = this.box;
    const bottom = s.offsetTop + s.offsetHeight + 8;
    if (bottom > b.scrollTop + b.clientHeight) b.scrollTop = bottom - b.clientHeight;
  }

  tap() {
    if (this.typing) { this.finish(); return; }
    this.dismiss();
  }

  finish() {
    for (const [i, w] of this.words.entries()) { w.shown = w.sounded = true; this.spans[i].style.visibility = ''; }
    this.typing = false;
    this.box.classList.add('done');
  }

  dismiss() {
    this.finish();
    this.box.hidden = true;
  }

  // The tone a word sings: a scale degree, from the chord the tune is on.
  tone(w) {
    const root = this.game.score?.chordAt?.(w.due) ?? 0;
    const tones = [root, root + 2, root + 4, root + 7];
    if (w.end) return root + 7;                    // a full stop comes home
    if (w.ask) return root + 9;                    // a question lifts
    return tones[ARPEGGIO[w.k % ARPEGGIO.length]];
  }

  // Every animation frame. Words are scheduled a sixteenth ahead on the audio
  // clock and shown at the moment they sound. Before the clock is running (no
  // tap yet, so no sound allowed) they simply type out on the wall clock.
  frame() {
    if (!this.typing) return;
    const g = this.game, clock = g.clock;
    const now = clock.ctx.currentTime;
    const room = g.room;
    let left = 0;
    for (const [i, w] of this.words.entries()) {
      if (w.shown) continue;
      left++;
      // A room reloaded under us restarts the clock: re-base what is left.
      if (!this.wall && w.due - clock.index > 64) {
        const shift = w.due - (clock.index + 2);
        for (const v of this.words) if (!v.sounded) v.due -= shift;
      }
      if (this.wall || !clock.running) {
        if ((performance.now() - this.started) / 1000 >= i * 0.12) { w.shown = true; this.spans[i].style.visibility = ''; this.follow(i); }
        continue;
      }
      if (!w.sounded && w.due <= clock.index + 1) {
        w.sounded = true;
        // A word whose sixteenth has already passed (a slow frame) sounds on the
        // next one rather than late and off the grid.
        w.at = clock.timeOf(Math.max(w.due, clock.index + 1));
        if (room) g.audio.play({
          family: 'voice', midi: room.music.getNote(this.tone(w), 5),
          intensity: 0.22, when: w.at, heard: false, room,
        });
      }
      if (w.sounded && now >= w.at - 0.01) { w.shown = true; this.spans[i].style.visibility = ''; this.follow(i); }
    }
    if (!left) { this.typing = false; this.box.classList.add('done'); }
  }
}
