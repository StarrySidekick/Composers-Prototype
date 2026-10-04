// The level's tune. It starts as one motif looping in the first room, and every
// room you solve adds a layer to it (a bass line, a pulse, a counter-melody,
// chords...) until by the end of the level it is close to a finished piece.
//
// Written in SCALE DEGREES, never pitches, and played through whichever room you
// are standing in. So the same tune is in C ionian in one area and D dorian in the
// next: crossing into a new area changes its key, its mode and its tempo, which is
// what gives an area its mood. And raising the key on the stairs raises the tune.
//
// The data lives in rooms/world.json under "score":
//
//   "score": {
//     "bars": 4,                 // the loop, in bars of four beats
//     "volume": 0.3,             // under the room's own sounds
//     "layers": [
//       { "id": "motif", "name": "the motif", "by": "start",
//         "family": "keys", "octave": 5,
//         "notes": [[0, 0], [4, 2], [8, 4]] }      // [sixteenth, degree, octave?, kind?]
//     ]
//   }
//
// `by` is what earns the layer: "start", or a room id, earned the first time a
// puzzle opens a door in that room (Game.doorChanged). Its notes are played with
// `heard: false`: background music must never answer a note lock.
//
// Prototype stand-in for what will be FMOD in Unity: layered stems of one cue,
// with a parameter per earned layer.

export class Score {
  constructor(json) {
    this.bars = json.bars ?? 4;
    this.steps = this.bars * 16;
    this.volume = json.volume ?? 0.3;
    this.muted = false;
    // The chord under each bar, as scale degrees (I vi IV V). The text box sings
    // its words from these, so dialogue is in the same harmony as the tune.
    this.chords = json.chords ?? [0, 5, 3, 4];
    // Where the tune is, in sixteenths. It only moves while it plays: the
    // metronome (src/doodads/metronome.js) stops it and it waits there, and it
    // always starts again on a beat.
    this.reset();
    this.layers = (json.layers ?? []).map(l => {
      const byStep = new Map();
      for (const n of l.notes ?? []) {
        const [step, degree, octave, kind] = n;
        const s = ((step % this.steps) + this.steps) % this.steps;
        if (!byStep.has(s)) byStep.set(s, []);
        byStep.get(s).push({ degree, octave: octave ?? l.octave ?? 4, kind: kind ?? l.kind ?? null });
      }
      return { ...l, byStep };
    });
  }

  layer(id) { return this.layers.find(l => l.id === id) ?? null; }

  reset() { this.pos = 0; this.waiting = true; this.lastIndex = null; }

  // Is it playing? Only with the metronome going (progress.metronome), or under
  // the title screen (game.attract), and the pause menu's music switch on.
  playing(game) { return !this.muted && !!(game.progress?.metronome || game.attract) && !!game.room; }

  // The chord root (a scale degree) sounding at clock sixteenth `index`.
  chordAt(index) {
    const at = this.lastIndex == null || this.waiting ? index : this.pos + (index - this.lastIndex - 1);
    const bar = Math.floor((((at % this.steps) + this.steps) % this.steps) / 16);
    return this.chords[bar % this.chords.length] ?? 0;
  }

  // One clock event. Called from Game.update with the event's exact time, so the
  // tune is on the same sixteenth grid as every wave.
  tick(ev, game) {
    if (!this.playing(game)) { this.waiting = true; return; }
    if (this.waiting) {
      if (!ev.isBeat) return;          // start, or carry on, on a beat
      this.waiting = false;
    }
    this.lastIndex = ev.index;
    const step = this.pos % this.steps;
    this.pos++;
    const m = game.room.music;
    for (const layer of this.layers) {
      if (!game.progress.layers.has(layer.id)) continue;
      const notes = layer.byStep.get(step);
      if (!notes) continue;
      for (const n of notes) {
        game.audio.play({
          family: layer.family ?? 'keys',
          kind: n.kind,
          midi: m.getNote(n.degree, n.octave),
          intensity: (layer.gain ?? 1) * this.volume,
          when: ev.time,
          heard: false,
          room: game.room,
        });
      }
    }
  }
}
