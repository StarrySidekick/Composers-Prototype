// Ableton Live Sets (.als), read for their MIDI.
//
// An .als file is gzipped XML. Unzip it (node: zlib.gunzipSync; a browser:
// DecompressionStream('gzip')) and hand the text to readLiveSet. Almost every
// value is an attribute (`<Tempo><Manual Value="92" />`), so this is a small
// tag scanner, not an XML library: one pass, a stack of element names, and only
// the parts that hold music are kept. A set can unzip to tens of megabytes of
// device state; building a tree of it would be most of the work for none of the
// music.
//
// What is read, by where it sits:
//
//   Ableton[Creator]                       "Ableton Live 11.3.4"
//   LiveSet > Tracks > MidiTrack | AudioTrack | GroupTrack | ReturnTrack
//     > Name > EffectiveName[Value]        the track's name as Live shows it
//     ... DrumGroupDevice                  a Drum Rack: its keys are drums, not pitches
//     ... MidiClip[Time]                   under ClipSlotList: a session clip;
//                                          anywhere else: an arrangement clip
//       > CurrentStart, CurrentEnd         where it sits in the arrangement (beats)
//       > Loop > LoopStart, LoopEnd, StartRelative, LoopOn
//       > Name[Value], Disabled[Value]
//       > Notes > KeyTracks > KeyTrack
//         > Notes > MidiNoteEvent[Time Duration Velocity IsEnabled]   clip time, beats
//         > MidiKey[Value]                 the key every note in this KeyTrack plays
//     ... AudioClip ... FileRef > Path | RelativePath   which audio it plays
//   MasterTrack | MainTrack (Live 12) ... Tempo > Manual[Value]
//                                    ... TimeSignature > Manual[Value]  (99 log2 den + num - 1)
//
// Checked against hand-made sets in test/music.mjs, not against a set saved by
// Live: none was in reach when this was written. If a real set reads wrong, the
// field names above are where to look.

const TRACK_TYPES = new Set(['MidiTrack', 'AudioTrack', 'GroupTrack', 'ReturnTrack']);
const MASTER = new Set(['MasterTrack', 'MainTrack']);

export function readLiveSet(xml) {
  const set = { creator: '', tempo: null, timeSig: null, tracks: [] };
  const stack = [];            // element names, root first
  let track = null, trackDepth = -1;
  let clip = null, clipDepth = -1;
  let keyTrack = null;
  let audioClip = null;
  let masterDepth = -1;

  const re = /<(\/?)([A-Za-z_][\w.-]*)([^>]*?)(\/?)>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>/g;
  let m;
  while ((m = re.exec(xml))) {
    const [, closing, name, attrText, selfClose] = m;
    if (!name) continue;                 // a comment or the declaration
    if (closing) { close(name); continue; }
    const depth = stack.length;
    const parent = stack[depth - 1];
    open(name, depth, parent, attrText);
    if (selfClose) close(name, true); else stack.push(name);
  }
  return set;

  function open(name, depth, parent, attrText) {
    if (name === 'Ableton') { set.creator = attr(attrText, 'Creator') ?? ''; return; }

    if (MASTER.has(name) && parent === 'LiveSet') { masterDepth = depth; return; }
    if (masterDepth >= 0 && !track) {
      if (name === 'Manual' && parent === 'Tempo' && set.tempo == null) set.tempo = num(attrText);
      if (name === 'Manual' && parent === 'TimeSignature' && set.timeSig == null) set.timeSig = decodeTimeSig(num(attrText));
      return;
    }

    if (TRACK_TYPES.has(name) && parent === 'Tracks') {
      track = { type: name, name: '', drums: false, clips: [], audio: [] };
      trackDepth = depth;
      return;
    }
    if (!track) return;

    if (name === 'EffectiveName' && parent === 'Name' && depth === trackDepth + 2) track.name = attr(attrText, 'Value') ?? '';
    else if (name === 'DrumGroupDevice') track.drums = true;
    else if (name === 'AudioClip') audioClip = { depth, file: '' };
    else if (audioClip && parent === 'FileRef' && (name === 'Path' || name === 'RelativePath' || name === 'Name')) {
      // Live 11 and later write a Path; Live 9 and 10 a relative path and a Name.
      const v = attr(attrText, 'Value');
      if (v && (name === 'Path' || !audioClip.file)) audioClip.file = v;
    } else if (name === 'MidiClip' && !clip) {
      const where = stack.includes('ClipSlotList') ? 'session'
        : stack.includes('TakeLanes') ? 'take'
        : stack.includes('FreezeSequencer') ? 'freeze' : 'arrangement';
      clip = { where, time: num(attrText, 'Time') ?? 0, name: '', disabled: false,
               start: null, end: null, loopStart: 0, loopEnd: 0, startRelative: 0, loopOn: false,
               num: null, den: null, notes: [] };
      clipDepth = depth;
    } else if (clip) {
      const d = depth - clipDepth;
      if (d === 1 && name === 'CurrentStart') clip.start = num(attrText);
      else if (d === 1 && name === 'CurrentEnd') clip.end = num(attrText);
      else if (d === 1 && name === 'Name') clip.name = attr(attrText, 'Value') ?? '';
      else if (d === 1 && name === 'Disabled') clip.disabled = attr(attrText, 'Value') === 'true';
      else if (d === 2 && parent === 'Loop') {
        if (name === 'LoopStart') clip.loopStart = num(attrText);
        else if (name === 'LoopEnd') clip.loopEnd = num(attrText);
        else if (name === 'StartRelative') clip.startRelative = num(attrText);
        else if (name === 'LoopOn') clip.loopOn = attr(attrText, 'Value') === 'true';
      }
      else if (name === 'KeyTrack') keyTrack = { key: null, notes: [] };
      else if (keyTrack && name === 'MidiKey' && parent === 'KeyTrack') keyTrack.key = num(attrText);
      else if (keyTrack && name === 'MidiNoteEvent') {
        if (attr(attrText, 'IsEnabled') === 'false') return;      // a muted note
        keyTrack.notes.push({ beat: num(attrText, 'Time'), beats: num(attrText, 'Duration'), vel: num(attrText, 'Velocity') ?? 100 });
      }
      else if (name === 'Numerator' && parent === 'RemoteableTimeSignature' && clip.num == null) clip.num = num(attrText);
      else if (name === 'Denominator' && parent === 'RemoteableTimeSignature' && clip.den == null) clip.den = num(attrText);
    }
  }

  function close(name, selfClosed = false) {
    if (!selfClosed) stack.pop();
    const depth = stack.length;
    if (name === 'KeyTrack' && keyTrack && clip) {
      if (keyTrack.key != null) for (const n of keyTrack.notes) clip.notes.push({ ...n, midi: keyTrack.key });
      keyTrack = null;
    } else if (name === 'MidiClip' && clip && depth === clipDepth) {
      clip.notes.sort((a, b) => a.beat - b.beat || a.midi - b.midi);
      if (clip.loopEnd <= clip.loopStart) clip.loopEnd = Math.max(clip.loopStart + 4, ...clip.notes.map(n => n.beat + n.beats));
      if (clip.start == null) clip.start = clip.time;
      if (clip.end == null) clip.end = clip.start + (clip.loopEnd - clip.loopStart);
      clip.timeSig = clip.num ? [clip.num, clip.den ?? 4] : null;
      delete clip.num; delete clip.den;
      track.clips.push(clip);
      clip = null;
    } else if (name === 'AudioClip' && audioClip && depth === audioClip.depth) {
      track.audio.push(audioClip.file);
      audioClip = null;
    } else if (track && TRACK_TYPES.has(name) && depth === trackDepth) {
      set.tracks.push(track);
      track = null;
    } else if (MASTER.has(name) && depth === masterDepth) {
      masterDepth = -1;
    }
  }
}

// Live stores the master time signature as one number: 99 * log2(denominator)
// + numerator - 1. 4/4 is 201, 3/4 is 200, 6/8 is 302.
export function decodeTimeSig(v) {
  if (v == null || !Number.isFinite(v)) return null;
  const den = 2 ** Math.floor(v / 99), numr = (v % 99) + 1;
  return [numr, den];
}

// A clip's own notes: what is inside its loop (or between its markers), in beats
// from the loop's start. This is the idea as written, before the arrangement
// repeats it.
export function clipNotes(clip) {
  const len = clip.loopEnd - clip.loopStart;
  return {
    beats: len,
    notes: clip.notes
      .filter(n => n.beat >= clip.loopStart - 1e-6 && n.beat < clip.loopEnd - 1e-6)
      .map(n => ({ ...n, beat: n.beat - clip.loopStart, beats: Math.min(n.beats, clip.loopEnd - n.beat) })),
  };
}

// A track's arrangement, played out: every enabled arrangement clip at its place,
// its loop repeated for as long as the clip runs. This is the piece as heard.
//
// The model: the clip starts playing at LoopStart + StartRelative in its own
// time; with the loop on, reaching LoopEnd jumps back to LoopStart. With it off
// it just plays on. Notes are cut at the clip's right edge.
export function arrangementNotes(track) {
  const out = [];
  for (const c of track.clips) {
    if (c.where !== 'arrangement' || c.disabled) continue;
    const length = c.end - c.start;
    if (!(length > 0)) continue;
    const s0 = c.loopStart + c.startRelative;
    const span = c.loopEnd - c.loopStart;
    const place = (n, p) => {
      if (p < -1e-6 || p >= length - 1e-6) return;
      out.push({ beat: c.start + p, beats: Math.min(n.beats, length - p), midi: n.midi, vel: n.vel });
    };
    if (c.loopOn && span > 0) {
      for (const n of c.notes) if (n.beat >= s0 - 1e-6 && n.beat < c.loopEnd - 1e-6) place(n, n.beat - s0);
      const first = c.loopEnd - s0;
      for (let k = 0; first + k * span < length; k++) {
        for (const n of c.notes) if (n.beat >= c.loopStart - 1e-6 && n.beat < c.loopEnd - 1e-6) place(n, first + k * span + (n.beat - c.loopStart));
      }
    } else {
      for (const n of c.notes) place(n, n.beat - s0);
    }
  }
  return out.sort((a, b) => a.beat - b.beat || a.midi - b.midi);
}

function attr(text, key) {
  const m = new RegExp('(?:^|\\s)' + key + '="([^"]*)"').exec(text);
  return m ? decode(m[1]) : null;
}
function num(text, key = 'Value') {
  const v = attr(text, key);
  return v == null ? null : Number(v);
}
function decode(s) {
  return s.indexOf('&') < 0 ? s : s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}
