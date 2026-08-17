// Musical context for a room. Mirrors MusicalState.cs / MusicMode.cs / CodaMood.cs.
//
// Everything in the prototype is snapped to this scale. That is the load-bearing trick
// behind design pillar #1: the player never has to be a musician, because there is no
// wrong note available to them.

export const MODES = Object.freeze({
  ionian:     [0, 2, 4, 5, 7, 9, 11],
  dorian:     [0, 2, 3, 5, 7, 9, 10],
  phrygian:   [0, 1, 3, 5, 7, 8, 10],
  lydian:     [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  aeolian:    [0, 2, 3, 5, 7, 8, 10],
  locrian:    [0, 1, 3, 5, 6, 8, 10],
});

export const MODE_NAMES = Object.keys(MODES);

// GDD §11 — Coda's mood picks the mode.
export const MOOD_TO_MODE = Object.freeze({
  content:    'ionian',
  reflective: 'dorian',
  tense:      'phrygian',
  mysterious: 'lydian',
  confident:  'mixolydian',
  sad:        'aeolian',
  unhinged:   'locrian',
});

export const MOOD_NAMES = Object.keys(MOOD_TO_MODE);

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function midiName(midi) {
  return `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

export class MusicalState {
  constructor({ root = 0, mode = 'ionian', bpm = 120, timeSignature = 4, mood = 'content' } = {}) {
    this.root = root;
    this.mode = mode;
    this.bpm = bpm;
    this.timeSignature = timeSignature;
    this.mood = mood;
  }

  get scaleDegrees() {
    return MODES[this.mode] ?? MODES.ionian;
  }

  // Absolute MIDI note for a scale degree. Degrees outside 0-6 wrap into other octaves,
  // so `getNote(9)` is the third degree an octave up.
  //
  // Octave numbering matches Unity's MusicalState.GetNote: octave 5 -> middle C (60).
  getNote(degreeIndex, octave = 4) {
    const s = this.scaleDegrees;
    const n = s.length;
    const oct = octave + Math.floor(degreeIndex / n);
    const i = ((degreeIndex % n) + n) % n;
    return oct * 12 + this.root + s[i];
  }

  getFreq(degreeIndex, octave = 4) {
    return midiToFreq(this.getNote(degreeIndex, octave));
  }

  setMood(mood) {
    if (!MOOD_TO_MODE[mood]) return;
    this.mood = mood;
    this.mode = MOOD_TO_MODE[mood];
  }

  // Stairs and room-raising switches shift the tonal center (GDD §6.5).
  shiftKey(semitones) {
    this.root = ((this.root + semitones) % 12 + 12) % 12;
  }

  get label() {
    return `${NOTE_NAMES[this.root]} ${this.mode}`;
  }

  toJSON() {
    return {
      root: this.root, mode: this.mode, bpm: this.bpm,
      timeSignature: this.timeSignature, mood: this.mood,
    };
  }
}
