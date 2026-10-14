/* Composer's Key — does your music come in right?
   ---------------------------------------------------------------------
   The music library (tools/music-library.mjs, src/music/, docs/MUSIC.md) reads
   Ableton sets, MIDI files and WAV headers, guesses keys, turns pitches into
   the game's scale degrees and draws sheet music. Every one of those can be
   wrong without a sound: a loop unrolled one beat late, a muted note let in, a
   key signature a sharp short. So this holds each part to an answer worked out
   by hand:

     - MIDI files: what is written reads back exactly (tempo, time and key
       signature, every note), and a hand-made file with running status and
       velocity-0 note-offs reads right
     - Ableton: a hand-made Live 11 style set reads its tempo, time signature,
       track names, drum racks, session clips, and its arrangement played out
       (a looped clip repeated, a clip started part-way into its loop, a
       disabled clip and a muted note left out)
     - degrees: every in-scale note of every key round-trips through
       MusicalState.getNote; a chromatic note snaps to a neighbour, flagged
     - keys: the castle tune in all 84 keys, and three real tunes whose key is
       known (Drunken Sailor in D dorian, Ode to Joy in D, Fur Elise in A minor)
     - notation: every key signature has the right count of sharps or flats,
       every scale is spelled with seven different letters, every bar adds up
     - the tool, end to end, on a fake Desktop: albums of WAVs, Ableton project
       folders with versions and backups, a loose MIDI file. Bounces matched to
       their projects, backups and project samples skipped, an orphan bounce
       flagged, .mid files written that read back with the key, and no absolute
       path in library.json

   Node only, no server: `node test/music.mjs`. The page (music.html) is
   checked by test/writer.mjs.

   What it cannot prove: that a set saved by a real Live reads the same. The
   fixture follows the format as documented and as other parsers read it. Run
   the tool on one real project and compare with Live; if they differ, the
   field names at the top of src/music/ableton.js are where to look.
*/
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { readMidi, writeMidi } from '../src/music/midi-file.js';
import { readLiveSet, clipNotes, arrangementNotes, decodeTimeSig } from '../src/music/ableton.js';
import { detectKey, toDegree, keySignature, toLayerNotes, topLine } from '../src/music/key.js';
import { spell, signatureAlters, pieces, layoutEvents, renderStaff } from '../src/music/notation.js';
import { MusicalState, MODES, MODE_NAMES } from '../src/core/music.js';
import { buildLibrary, cleanTitle, wavInfo, dropOvertones } from '../tools/music-library.mjs';
import { storeZip, crc32 } from '../src/music/zip.js';
import { motifToLayer, motifToSequence, motifFromLayer, motifFromClip, motifPitches, newMotif } from '../src/music/motif.js';
import { Score } from '../src/audio/score.js';

let failed = 0;
const ok = (cond, what, detail = '') => {
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${what}${!cond && detail ? `\n         ${detail}` : ''}`);
  if (!cond) failed++;
};
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;

// ---- MIDI files ----------------------------------------------------------------
console.log('MIDI files');
{
  const notes = [
    { beat: 0, beats: 1, midi: 62, vel: 90 }, { beat: 1, beats: 0.5, midi: 65, vel: 70 },
    { beat: 1.5, beats: 0.25, midi: 69, vel: 100 }, { beat: 1.5, beats: 2, midi: 57, vel: 60 },
    { beat: 3.75, beats: 0.25, midi: 62, vel: 127 }, { beat: 4, beats: 4, midi: 62, vel: 1 },
  ];
  const bytes = writeMidi({ bpm: 92, timeSig: [3, 4], key: { sf: -2, mi: 1 }, title: 'Ünïcode tune', tracks: [
    { name: 'lead', channel: 0, notes }, { name: 'kit', channel: 9, notes: [{ beat: 0, beats: 0.25, midi: 36, vel: 100 }] },
  ] });
  const m = readMidi(bytes);
  ok(m.format === 1 && m.tracks.length === 3, 'type 1, a conductor track and two parts');
  ok(near(m.tempos[0].bpm, 92, 0.01), 'tempo reads back', JSON.stringify(m.tempos));
  ok(m.timeSigs[0].num === 3 && m.timeSigs[0].den === 4, 'time signature reads back');
  ok(m.keySigs[0].sf === -2 && m.keySigs[0].mi === 1, 'key signature reads back (two flats, minor)');
  ok(m.tracks[0].name === 'Ünïcode tune', 'names survive as UTF-8', m.tracks[0].name);
  const back = m.tracks[1].notes;
  const want = [...notes].sort((a, b) => a.beat - b.beat || a.midi - b.midi);
  ok(back.length === notes.length && back.every((n, i) => near(n.beat, want[i].beat) && near(n.beats, want[i].beats) && n.midi === want[i].midi && n.vel === want[i].vel),
    'every note reads back: start, length, key, velocity', JSON.stringify(back));
  ok(m.tracks[2].notes[0].ch === 9 && m.tracks[2].name === 'kit', 'drums keep channel 10');

  // By hand: running status, a note-off written as note-on velocity 0, an
  // unterminated note, a sysex to skip.
  const trk = [
    0x00, 0x90, 60, 100,              // tick 0: on 60
    0x60, 60, 0,                      // 96: off 60, as running-status note-on velocity 0
    0x00, 62, 100,                    // 96: on 62, running status
    0x00, 0xf0, 0x02, 0x7e, 0xf7,     // a sysex, skipped
    0x60, 0x80, 62, 0x40,             // 192: off 62
    0x00, 0x90, 67, 80,               // 192: on 67, never let go
    0x83, 0x60, 0xff, 0x2f, 0x00];    // 672: end of track
  const hand = new Uint8Array([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0, 96, 0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, trk.length, ...trk]);
  const h = readMidi(hand).tracks[0].notes;
  ok(h.length === 3 && near(h[0].beats, 1) && h[1].midi === 62 && near(h[1].beat, 1) && near(h[1].beats, 1) && h[2].midi === 67 && near(h[2].beat, 2) && near(h[2].beats, 5),
    'running status, velocity-0 offs, a note left hanging', JSON.stringify(h));
}

// ---- Ableton -------------------------------------------------------------------
console.log('Ableton sets');
const note = (t, d, v = 100, on = true) => `<MidiNoteEvent Time="${t}" Duration="${d}" Velocity="${v}" VelocityDeviation="0" OffVelocity="64" Probability="1" IsEnabled="${on}" NoteId="1" />`;
const keyTrack = (key, notes) => `<KeyTrack Id="0"><Notes>${notes.join('')}</Notes><MidiKey Value="${key}" /></KeyTrack>`;
function midiClip({ time = 0, start = time, end, loopStart = 0, loopEnd, startRelative = 0, loopOn = true, name = '', disabled = false, keys }) {
  return `<MidiClip Id="0" Time="${time}"><LomId Value="0" /><LomIdView Value="0" /><CurrentStart Value="${start}" /><CurrentEnd Value="${end}" />`
    + `<Loop><LoopStart Value="${loopStart}" /><LoopEnd Value="${loopEnd}" /><StartRelative Value="${startRelative}" /><LoopOn Value="${loopOn}" /><OutMarker Value="${loopEnd}" /><HiddenLoopStart Value="0" /><HiddenLoopEnd Value="4" /></Loop>`
    + `<Name Value="${name}" /><Annotation Value="" /><Color Value="2" /><Disabled Value="${disabled}" />`
    + `<TimeSignature><TimeSignatures><RemoteableTimeSignature Id="0"><Numerator Value="3" /><Denominator Value="4" /><Time Value="0" /></RemoteableTimeSignature></TimeSignatures></TimeSignature>`
    + `<Envelopes><Envelopes /></Envelopes><Notes><KeyTracks>${Object.entries(keys).map(([k, ns]) => keyTrack(k, ns)).join('')}</KeyTracks><PerNoteEventStore><EventLists /></PerNoteEventStore></Notes></MidiClip>`;
}
function midiTrack(name, { session = [], arrangement = [], drums = false } = {}) {
  return `<MidiTrack Id="12"><LomId Value="0" /><Name><EffectiveName Value="${name}" /><UserName Value="" /><Annotation Value="" /></Name>`
    + `<DeviceChain><Mixer><Volume><Manual Value="1" /></Volume></Mixer><MainSequencer><LomId Value="0" />`
    + `<ClipSlotList>${session.map(c => `<ClipSlot Id="0"><LomId Value="0" /><ClipSlot><Value>${c}</Value></ClipSlot></ClipSlot>`).join('')}<ClipSlot Id="1"><ClipSlot><Value /></ClipSlot></ClipSlot></ClipSlotList>`
    + `<ClipTimeable><ArrangerAutomation><Events>${arrangement.join('')}</Events></ArrangerAutomation></ClipTimeable></MainSequencer>`
    + `<DeviceChain><Devices>${drums ? '<DrumGroupDevice Id="0"><Branches><DrumBranch><Name Value="Kick" /></DrumBranch></Branches></DrumGroupDevice>' : '<OriginalSimpler Id="0"><UserName Value="" /></OriginalSimpler>'}</Devices></DeviceChain>`
    + `<FreezeSequencer><ClipSlotList /></FreezeSequencer></DeviceChain></MidiTrack>`;
}
const audioTrack = (name, file) => `<AudioTrack Id="20"><Name><EffectiveName Value="${name}" /><UserName Value="${name}" /></Name><DeviceChain><MainSequencer><Sample><ArrangerAutomation><Events>`
  + `<AudioClip Id="0" Time="0"><Name Value="take" /><SampleRef><FileRef><RelativePathType Value="3" /><RelativePath Value="Samples/Recorded/${file}" /><Path Value="/Users/someone/Music/${file}" /></FileRef></SampleRef></AudioClip>`
  + `</Events></ArrangerAutomation></Sample></MainSequencer></DeviceChain></AudioTrack>`;
function liveSet({ tempo = 120, timeSig = 201, tracks }) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!-- a comment > with a bracket -->\n<Ableton MajorVersion="5" MinorVersion="11.0_433" SchemaChangeCount="3" Creator="Ableton Live 11.3.4" Revision="x">`
    + `<LiveSet><NextPointeeId Value="1" /><OverwriteProtectionNumber Value="2816" /><LomId Value="0" /><Tracks>${tracks.join('')}</Tracks>`
    + `<MasterTrack><Name><EffectiveName Value="Master" /></Name><DeviceChain><Mixer><Tempo><LomId Value="0" /><Manual Value="${tempo}" /><ArrangerAutomation><Events><FloatEvent Time="-63072000" Value="${tempo}" /></Events></ArrangerAutomation></Tempo>`
    + `<TimeSignature><LomId Value="0" /><Manual Value="${timeSig}" /></TimeSignature></Mixer></DeviceChain></MasterTrack>`
    + `<PreHearTrack><Name><EffectiveName Value="Preview" /></Name></PreHearTrack></LiveSet></Ableton>`;
}

// Night Swim, in D dorian: a session clip, an arrangement with a looped clip, a
// clip started a beat into its loop, a disabled clip, a muted note, a drum rack.
const D = 62;
const nightSwim = liveSet({ tempo: 92, timeSig: 200, tracks: [
  midiTrack('Rhodes &quot;lead&quot; &amp; co', {
    session: [midiClip({ name: 'idea', end: 4, loopEnd: 4, keys: { [D]: [note(0, 1), note(3, 1)], [D + 3]: [note(1, 0.5)], [D + 7]: [note(2, 1), note(1.5, 0.5, 100, false)], [D + 10]: [note(5, 1)] } })],
    arrangement: [
      // At beat 8, 12 beats long, looping beats 0-4: plays its loop three times.
      midiClip({ time: 8, end: 20, loopEnd: 4, name: 'verse', keys: { [D]: [note(0, 1)], [D + 7]: [note(2, 2)] } }),
      // At beat 24, 6 beats long, starting 2 beats into a 4-beat loop.
      midiClip({ time: 24, end: 30, loopEnd: 4, startRelative: 2, name: 'turn', keys: { [D + 5]: [note(0, 1)], [D + 9]: [note(2, 1)] } }),
      // Switched off in the arrangement.
      midiClip({ time: 40, end: 44, loopEnd: 4, name: 'off', disabled: true, keys: { [D + 1]: [note(0, 4)] } }),
      // Loop off: plays from LoopStart for the clip's length, cut at its edge.
      midiClip({ time: 32, end: 34, loopStart: 4, loopEnd: 8, loopOn: false, name: 'tail', keys: { [D - 12]: [note(4, 1), note(5, 3)], [D]: [note(7, 1)] } }),
    ],
  }),
  midiTrack('Kit', { drums: true, arrangement: [midiClip({ time: 0, end: 4, loopEnd: 4, keys: { 36: [note(0, 0.25), note(1, 0.25), note(2, 0.25), note(3, 0.25)], 37: [note(1, 0.25)] } })] }),
  audioTrack('Vox', 'vox take 3.wav'),
] });
{
  const set = readLiveSet(nightSwim);
  ok(set.creator === 'Ableton Live 11.3.4' && set.tempo === 92, 'creator and tempo', JSON.stringify({ c: set.creator, t: set.tempo }));
  ok(JSON.stringify(set.timeSig) === '[3,4]' && JSON.stringify(decodeTimeSig(201)) === '[4,4]' && JSON.stringify(decodeTimeSig(302)) === '[6,8]',
    "time signature decoded from Live's single number (200 = 3/4, 201 = 4/4, 302 = 6/8)");
  ok(set.tracks.length === 3 && set.tracks[0].name === 'Rhodes "lead" & co' && set.tracks[2].type === 'AudioTrack',
    'tracks and their names, entities decoded', set.tracks.map(t => t.name).join(' | '));
  ok(set.tracks[1].drums && !set.tracks[0].drums, 'a Drum Rack marks its track as drums');
  ok(set.tracks[2].audio[0] === '/Users/someone/Music/vox take 3.wav', 'an audio clip names its file');
  const lead = set.tracks[0];
  ok(lead.clips.filter(c => c.where === 'session').length === 1 && lead.clips.filter(c => c.where === 'arrangement').length === 4,
    'session clips and arrangement clips told apart');
  const idea = clipNotes(lead.clips.find(c => c.name === 'idea'));
  ok(idea.notes.length === 4 && idea.notes.map(n => n.midi).join() === [D, D + 3, D + 7, D].join(),
    'a clip keeps its notes in its loop, the muted one left out', JSON.stringify(idea.notes));
  ok(lead.clips[0].timeSig?.join('/') === '3/4', "a clip's own time signature");
  const arr = arrangementNotes(lead).map(n => `${n.beat}:${n.midi - D}:${n.beats}`);
  const want = ['8:0:1', '10:7:2', '12:0:1', '14:7:2', '16:0:1', '18:7:2',   // verse x3
    '24:9:1', '26:5:1', '28:9:1',                                            // turn: from beat 2 of its loop
    '32:-12:1', '33:-12:1'];                                                // tail: loop off, cut at its end
  ok(JSON.stringify(arr) === JSON.stringify(want), 'the arrangement played out: loops repeated, offset start, loop off, disabled clip silent',
    `got  ${arr.join(' ')}\n         want ${want.join(' ')}`);
}

// ---- degrees ---------------------------------------------------------------------
console.log('Scale degrees');
{
  let bad = 0, snapsFar = 0, inexact = 0;
  for (const mode of MODE_NAMES) for (let root = 0; root < 12; root++) {
    const m = new MusicalState({ root, mode });
    const pcs = new Set(MODES[mode].map(i => (root + i) % 12));
    for (let midi = 24; midi <= 108; midi++) {
      const d = toDegree(midi, { root, mode });
      const back = m.getNote(d.degree, d.octave);
      if (pcs.has(midi % 12)) { if (!d.exact || back !== midi) bad++; }
      else { if (d.exact) bad++; if (Math.abs(back - midi) !== 1) snapsFar++; inexact++; }
    }
  }
  ok(bad === 0, 'every in-scale note round-trips through MusicalState.getNote, in all 84 keys', `${bad} wrong`);
  ok(inexact > 0 && snapsFar === 0, 'a note outside the scale snaps a semitone to a neighbour and is flagged');
  const l = toLayerNotes([{ beat: 0, midi: 62 }, { beat: 1.02, midi: 66 }, { beat: 1.5, midi: 69 }], { root: 2, mode: 'dorian' });
  ok(JSON.stringify(l.notes) === '[[0,0,5],[4,2,5],[6,4,5]]' && l.snapped === 1 && l.offGrid > 0,
    'to the layer format: [sixteenth, degree, octave], F# in D dorian snapped and counted', JSON.stringify(l));
  const top = topLine([{ beat: 0, midi: 60 }, { beat: 0, midi: 67 }, { beat: 0, midi: 64 }, { beat: 1, midi: 62 }]);
  ok(top.map(n => n.midi).join() === '67,62', 'the top line takes the highest note of each onset');
}

// ---- keys ------------------------------------------------------------------------
console.log('Keys');
{
  const w = JSON.parse(fs.readFileSync(new URL('../rooms/world.json', import.meta.url)));
  const layers = w.score.layers.filter(l => l.family !== 'percussion');
  let right = 0;
  for (const mode of MODE_NAMES) for (let root = 0; root < 12; root++) {
    const m = new MusicalState({ root, mode });
    const notes = layers.flatMap(l => l.notes.map(([s, d, o]) => ({ beat: s / 4, beats: 0.5, midi: m.getNote(d, o ?? l.octave ?? 4) })));
    const k = detectKey(notes);
    if (k.root === root && k.mode === mode) right++;
  }
  ok(right === 84, `the castle tune, played in each of the 84 keys, is heard in that key (${right}/84)`);
  const N = { C4: 60, 'C#4': 61, D4: 62, 'D#4': 63, E4: 64, F4: 65, 'F#4': 66, G4: 67, 'G#4': 68, A4: 69, B4: 71, C5: 72, D5: 74, 'D#5': 75, E5: 76 };
  const mk = s => { let t = 0; return s.split(' ').map(x => { const [n, d] = x.split(':'); const r = { beat: t, beats: +d, midi: N[n] }; t += +d; return r; }); };
  const tunes = [
    ['Drunken Sailor', 'D dorian', 'A4:.5 A4:.25 A4:.25 A4:.5 A4:.25 A4:.25 A4:.5 D4:.5 F4:.5 A4:.5 G4:.5 G4:.25 G4:.25 G4:.5 G4:.25 G4:.25 G4:.5 C4:.5 E4:.5 G4:.5 A4:.5 A4:.25 A4:.25 A4:.5 A4:.25 A4:.25 A4:.5 B4:.5 C5:.5 D5:.5 C5:.5 A4:.5 G4:.5 E4:.5 D4:1 D4:1'],
    ['Ode to Joy', 'D ionian', 'F#4:1 F#4:1 G4:1 A4:1 A4:1 G4:1 F#4:1 E4:1 D4:1 D4:1 E4:1 F#4:1 F#4:1.5 E4:.5 E4:2 F#4:1 F#4:1 G4:1 A4:1 A4:1 G4:1 F#4:1 E4:1 D4:1 D4:1 E4:1 F#4:1 E4:1.5 D4:.5 D4:2'],
    ['Fur Elise', 'A aeolian', 'E5:.25 D#5:.25 E5:.25 D#5:.25 E5:.25 B4:.25 D5:.25 C5:.25 A4:.5 C4:.25 E4:.25 A4:.25 B4:.5 E4:.25 G#4:.25 B4:.25 C5:.5 E4:.25 E5:.25 D#5:.25 E5:.25 D#5:.25 E5:.25 B4:.25 D5:.25 C5:.25 A4:.5 C4:.25 E4:.25 A4:.25 B4:.5 E4:.25 C5:.25 B4:.25 A4:1'],
  ];
  for (const [name, want, s] of tunes) {
    const k = detectKey(mk(s));
    ok(k.label === want, `${name} is heard in ${want}`, `heard ${k.label}, then ${k.alternatives.map(a => a.label).join(', ')}`);
  }
  ok(detectKey([]) === null, 'no notes, no key');
}

// ---- notation ----------------------------------------------------------------------
console.log('Notation');
{
  const SF = { 0: 0, 7: 1, 2: 2, 9: 3, 4: 4, 11: 5, 6: 6, 5: -1, 10: -2, 3: -3, 8: -4, 1: -5 };
  let sigBad = 0, letterBad = 0, alterBad = 0;
  for (const mode of MODE_NAMES) for (let root = 0; root < 12; root++) {
    const key = { root, mode };
    const { sf, parent } = keySignature(key);
    if (sf !== SF[parent]) sigBad++;
    const alters = signatureAlters(key);
    if (alters.filter(a => a !== 0).length !== Math.abs(sf)) sigBad++;
    const m = new MusicalState(key);
    const spelled = [0, 1, 2, 3, 4, 5, 6].map(d => spell(m.getNote(d, 5), key));
    if (new Set(spelled.map(s => s.letter)).size !== 7) letterBad++;
    if (spelled.some(s => s.alter !== alters[s.letter])) alterBad++;
    // The written name sounds the pitch it names.
    for (let d = 0; d < 7; d++) {
      const s = spelled[d], midi = m.getNote(d, 5);
      if ((s.octave + 1) * 12 + [0, 2, 4, 5, 7, 9, 11][s.letter] + s.alter !== midi) alterBad++;
    }
  }
  ok(sigBad === 0, 'every key has its signature: the count of sharps or flats of its parent major');
  ok(letterBad === 0, 'every scale is spelled with seven different letters (no A and A#)');
  ok(alterBad === 0, 'every scale tone takes the alteration the signature gives it, and names its pitch');
  ok(spell(70, { root: 0, mode: 'ionian' }).name === 'A#4' && spell(70, { root: 5, mode: 'ionian' }).name === 'Bb4' && spell(66, { root: 0, mode: 'ionian' }).name === 'F#4',
    'a chromatic note is raised in a sharp key and lowered in a flat one');
  const cases = [[0, 16, '16'], [0, 12, '12'], [2, 4, '2,2'], [1, 3, '3'], [4, 8, '8'], [6, 10, '2,8'], [0, 5, '4,1'], [3, 6, '1,4,1'], [0, 7, '6,1']];
  const wrong = cases.filter(([p, len, want]) => pieces(p, len).join() !== want).map(([p, len, want]) => `${p}+${len}: ${pieces(p, len).join()} not ${want}`);
  ok(!wrong.length, 'rhythms are cut where a reader expects the beat', wrong.join('; '));
  const rnd = (seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647)(7);
  let sums = 0, ties = 0;
  for (let k = 0; k < 200; k++) {
    const notes = [];
    for (let s = 0; s < 32; s += 1 + Math.floor(rnd() * 5)) notes.push({ start: s, len: 1 + Math.floor(rnd() * 12), midi: 55 + Math.floor(rnd() * 24) });
    const evs = layoutEvents(notes, { bars: 2 });
    for (const b of [0, 1]) if (evs.filter(e => e.bar === b).reduce((a, e) => a + e.d, 0) !== 16) sums++;
    if (evs.some(e => e.tieNext && e.rest)) ties++;
  }
  ok(sums === 0 && ties === 0, 'every bar of 200 random lines adds up to four beats, and rests are never tied');
  const svg = renderStaff({ notes: [{ start: 0, len: 3, midi: 61 }, { start: 3, len: 1, midi: 62 }, { start: 4, len: 12, midi: 50 }], bars: 2, key: { root: 2, mode: 'dorian' }, title: '<x>' });
  ok(svg.startsWith('<svg') && !/NaN|undefined/.test(svg) && svg.includes('&lt;x&gt;'), 'the staff draws as SVG with no NaN, and escapes its title');
}

// ---- motifs and the game's formats ------------------------------------------------------
console.log('Motifs');
{
  const w = JSON.parse(fs.readFileSync(new URL('../rooms/world.json', import.meta.url)));
  const motifLayer = w.score.layers.find(l => l.id === 'motif');
  const m = motifFromLayer(motifLayer, { bars: 4, key: { root: 0, mode: 'ionian' } });
  const back = motifToLayer({ ...m, name: 'motif' });
  ok(JSON.stringify(back.notes) === JSON.stringify(motifLayer.notes.map(([s, d]) => [s, d])) && back.octave === motifLayer.octave && back.family === motifLayer.family,
    "the castle's motif goes into the writer and comes back out the same layer");
  const sc = new Score({ bars: 4, layers: [back] });
  ok(sc.layer('motif').byStep.size === motifLayer.notes.length, "the game's Score reads the exported layer");
  const seq = motifToSequence(newMotif({ notes: [[0, 2, 0], [0, 2, 4], [2, 2, 4], [4, 2, 9], [6, 2, -1]] }));
  ok(JSON.stringify(seq.sequence) === '[4,2,6]' && seq.collapsed === 1, 'a lock phrase: top line, folded into an octave, repeats taken out (a lock ignores a repeat)', JSON.stringify(seq));
  const clip = { notes: [[0, 4, 62, 90], [0, 4, 50, 90], [4, 2, 66, 90], [6, 2, 69, 90], [70, 2, 62, 90]] };
  const r = motifFromClip(clip, { key: { root: 2, mode: 'dorian' }, bars: 4 });
  ok(r.motif.notes.length === 3 && r.snapped === 1 && motifPitches(r.motif).map(n => n.midi).join() === '62,65,69',
    'a clip becomes a motif: the top line, F# bent to F in D dorian, the bar past the end left out', JSON.stringify(r));
}

console.log('Zip');
{
  ok(crc32(new TextEncoder().encode('123456789')) === 0xcbf43926, 'CRC-32 of "123456789" is CBF43926, the standard check value');
  const z = storeZip([{ name: 'a.mid', bytes: new Uint8Array([1, 2, 3]) }, { name: 'é.txt', bytes: 'hi' }]);
  const v = new DataView(z.buffer);
  const end = z.length - 22;
  ok(v.getUint32(0, true) === 0x04034b50 && v.getUint32(end, true) === 0x06054b50 && v.getUint16(end + 10, true) === 2
    && v.getUint32(v.getUint32(end + 16, true), true) === 0x02014b50, 'a zip: local headers, a central directory where the end record says, two entries');
}

// ---- the tool, end to end ------------------------------------------------------------
console.log('The importer, on a fake Desktop');
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ck-music-'));
  const put = (rel, data, mtime) => {
    const f = path.join(tmp, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, data);
    if (mtime) fs.utimesSync(f, mtime, mtime);
  };
  const wav = seconds => {
    const rate = 8000, ch = 2, bits = 16, data = rate * ch * bits / 8 * seconds;
    const b = Buffer.alloc(44 + 4 + 8 + data);
    b.write('RIFF', 0); b.writeUInt32LE(b.length - 8, 4); b.write('WAVE', 8);
    b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(ch, 22); b.writeUInt32LE(rate, 24);
    b.writeUInt32LE(rate * ch * bits / 8, 28); b.writeUInt16LE(ch * bits / 8, 32); b.writeUInt16LE(bits, 34);
    b.write('LIST', 36); b.writeUInt32LE(4, 40); b.write('INFO', 44);           // a chunk to step over
    b.write('data', 48); b.writeUInt32LE(data, 52);
    return b;
  };
  const gz = s => zlib.gzipSync(Buffer.from(s, 'utf8'));
  const lantern = liveSet({ tempo: 140, tracks: [midiTrack('Bells', { arrangement: [midiClip({ time: 0, end: 8, loopEnd: 8, keys: { 60: [note(0, 1), note(7, 1)], 64: [note(1, 1)], 67: [note(2, 2)], 65: [note(4, 1)], 62: [note(5, 1)], 71: [note(6, 0.5)] } })] })] });
  const old = new Date('2023-01-01'), mid = new Date('2024-01-01'), now = new Date('2025-01-01');
  put('Desktop/Albums/Night Songs/01 Night Swim.wav', wav(2));
  put('Desktop/Albums/Night Songs/02 Lantern (Master).wav', wav(1));
  put('Desktop/Albums/Night Songs/03 Orphan Tune.wav', wav(1));
  put('Desktop/Albums/Night Songs/cover.jpg', 'not music');
  put('Music/Ableton/Night Swim Project/Night Swim.als', gz(nightSwim), now);
  put('Music/Ableton/Night Swim Project/Night Swim v1.als', gz(liveSet({ tempo: 80, tracks: [] })), old);
  put('Music/Ableton/Night Swim Project/Backup/Night Swim [2024-06-01 101010].als', gz(liveSet({ tempo: 60, tracks: [] })), mid);
  put('Music/Ableton/Night Swim Project/Samples/Recorded/vox take 3.wav', wav(1));
  put('Music/Ableton/Lantern Project/Lantern.als', gz(lantern), now);
  put('Music/Ableton/Broken Project/Broken.als', 'not gzip at all');
  put('Music/Sketches/motif idea.mid', writeMidi({ bpm: 100, tracks: [{ name: 'idea', notes: [57, 60, 64, 62, 60, 57].map((m, i) => ({ beat: i / 2, beats: 0.5, midi: m })) }] }));
  const out = path.join(tmp, 'library');
  const logs = [];
  const lib = await buildLibrary([path.join(tmp, 'Desktop/Albums'), path.join(tmp, 'Music')], { out, log: s => logs.push(s) });
  const by = t => lib.pieces.find(p => p.title === t);
  ok(lib.pieces.length === 4 && ['Night Swim', 'Lantern', 'motif idea', 'Orphan Tune'].every(by),
    'four pieces: two projects, a MIDI sketch, an orphan bounce', lib.pieces.map(p => p.title).join(' | '));
  const ns = by('Night Swim');
  ok(ns.bpm === 92 && ns.source.versions.join() === 'Night Swim v1' && ns.source.creator.includes('Live 11'),
    'a project is read from its newest set; older versions listed, the Backup folder skipped', JSON.stringify(ns.source));
  ok(ns.audio.length === 1 && ns.audio[0].path === 'Albums/Night Songs/01 Night Swim.wav' && ns.audio[0].seconds === 2 && ns.album === 'Night Songs' && ns.trackNo === 1,
    'its bounce found by name, with its length from the WAV header, album and track number', JSON.stringify(ns.audio));
  ok(by('Lantern').audio[0]?.path.endsWith('02 Lantern (Master).wav'), '"02 Lantern (Master)" matched to "Lantern"');
  ok(!lib.pieces.some(p => p.audio.some(a => a.path.includes('vox take'))), "a project's own samples are not taken for album tracks");
  ok(by('Orphan Tune').needs === 'transcription' && by('Orphan Tune').tracks.length === 0, 'a bounce with no project is flagged as needing transcription');
  ok(ns.key?.label === 'D dorian', `Night Swim's key heard as D dorian, drums left out (${ns.key?.label})`);
  ok(by('Lantern').key?.label === 'C ionian' && by('motif idea').key?.root === 9, 'Lantern in C, the sketch on A', `${by('Lantern').key?.label}, ${by('motif idea').key?.label}`);
  const lead = ns.tracks.find(t => t.name.startsWith('Rhodes'));
  ok(lead.clips.length === 5 && lead.clips.find(c => c.name === 'idea').notes.map(n => n.slice(0, 3).join(':')).join(' ') === `0:4:${D} 4:2:${D + 3} 8:4:${D + 7} 12:4:${D}`,
    'clips on the sixteenth grid: [step, length, midi, velocity]', JSON.stringify(lead.clips.map(c => c.name)));
  ok(lead.arrangement.notes.length === 11 && ns.tracks.find(t => t.name === 'Kit').drums && ns.tracks.find(t => t.name === 'Vox').audioFiles[0] === 'vox take 3.wav',
    'the arrangement, the kit flagged as drums, the vocal named as audio');
  ok(lib.problems.length === 1 && lib.problems[0].includes('Broken.als'), 'an unreadable set is reported, not fatal', JSON.stringify(lib.problems));
  const text = fs.readFileSync(path.join(out, 'library.json'), 'utf8');
  ok(!text.includes(tmp) && !text.includes('/Users/'), 'no absolute path in library.json (paths start at the folder you named)');
  const m = readMidi(fs.readFileSync(path.join(out, ns.midiFile)));
  ok(near(m.tempos[0].bpm, 92, 0.01) && m.keySigs[0].sf === 0 && m.timeSigs[0].num === 3, 'its .mid carries tempo, 3/4 and the key signature (D dorian: none)');
  ok(m.tracks.some(t => t.name === 'Kit' && t.notes.every(n => n.ch === 9)) && m.tracks.find(t => t.name.startsWith('Rhodes')).notes.length === 11,
    'drums on channel 10, every arranged note written');
  ok(logs.some(l => l.includes('MuseScore')), 'it says how to get sheet music out');
  ok(cleanTitle('03 - Night Swim (Master v2)') === 'Night Swim' && cleanTitle('Song [2021-03-01 101010]') === 'Song' && cleanTitle('1999') === '1999',
    'titles cleaned of track numbers, mastering words and backup stamps');
  ok(wavInfo(path.join(tmp, 'Desktop/Albums/Night Songs/cover.jpg')).seconds === undefined, 'a file that is not a WAV gives no length');
  // What basic-pitch really gave for a synthesised A (2026-10-14): the A, and a
  // quiet C# two octaves and a third up, its fifth harmonic.
  const heard = [{ beat: 0.023, midi: 69, vel: 102 }, { beat: 0.023, midi: 97, vel: 53 }, { beat: 2.486, midi: 62, vel: 96 }, { beat: 2.486, midi: 90, vel: 45 },
    { beat: 4, midi: 60, vel: 80 }, { beat: 4, midi: 72, vel: 90 }];
  ok(dropOvertones(heard).map(n => n.midi).join() === '69,62,60,72', "a transcription's overtones are dropped; an octave played louder than its root is kept");
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(failed ? `\n${failed} FAILED` : '\nPASS');
process.exit(failed ? 1 : 0);
