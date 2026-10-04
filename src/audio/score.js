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

  // One clock event. Called from Game.update with the event's exact time, so the
  // tune is on the same sixteenth grid as every wave.
  tick(ev, game) {
    if (this.muted || !game.room) return;
    const step = ((ev.index % this.steps) + this.steps) % this.steps;
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
