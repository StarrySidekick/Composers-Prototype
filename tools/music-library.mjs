#!/usr/bin/env node
/* Composer's Key — your music, as a library the game can read.
   ---------------------------------------------------------------------
   Run it on the computer that has the music:

     node tools/music-library.mjs ~/Desktop/Albums ~/Music/Ableton [--out library]

   It walks every folder you name and finds:

     - Ableton projects (.als). The real notes: every MIDI clip, in the session
       and in the arrangement, with the set's tempo. A project folder with
       several versions is one piece, read from the newest .als.
     - MIDI files (.mid) that are not inside a project.
     - Audio (.wav, plus .aif/.mp3/.flac/.m4a listed by name). A bounce is
       matched to the project it came from by name ("03 Night Swim.wav" and
       "Night Swim.als"). One with no project has no notes to read: it is
       listed as needing transcription.

   It writes, under --out (default `library/`, which git ignores):

     library.json         every piece: title, album, tempo, the key it guesses,
                          each track and clip as notes on the game's sixteenth grid
     midi/<id>.mid        each piece as a clean MIDI file, with its tempo and the
                          guessed key signature, ready to open in MuseScore for
                          sheet music (File > Open, then File > Export > PDF)

   Then open music.html (served from the repo root) to browse, label and play
   them, and to lift a motif into the game. Or load library.json into the
   private library page on claude.ai, which keeps your labels where a Claude
   session can read them.

   --transcribe: for audio with no project, run Spotify's basic-pitch (an open
   source audio-to-MIDI model) if it is installed (`pip install basic-pitch`, on
   Python 3.11 or older), and read what it hears, overtones filtered out. Expect a
   sketch: it does well on one instrument and gets muddy on a full mix, it merges
   quick repeated notes, and it does not find the tempo (its grid is 120 bpm). The
   notes from a project are always better.

   Nothing here goes in the repo by default: your music is yours, and this
   repo is public. A motif goes into the game when you put it there.

   No dependencies: node's own fs, zlib and child_process.
*/
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readLiveSet, clipNotes, arrangementNotes } from '../src/music/ableton.js';
import { readMidi, writeMidi } from '../src/music/midi-file.js';
import { detectKey, keySignature } from '../src/music/key.js';

const AUDIO = new Set(['.wav', '.wave', '.aif', '.aiff', '.mp3', '.flac', '.m4a', '.ogg']);
const SKIP_DIRS = new Set(['Backup', 'node_modules', '.git', 'Ableton Project Info', '__MACOSX']);

export async function buildLibrary(roots, { out = 'library', transcribe = false, log = console.log, now = new Date() } = {}) {
  const files = [];
  for (const root of roots) walk(path.resolve(root), path.basename(path.resolve(root)), files);

  // Ableton project folders: any folder holding an .als. Audio inside one (its
  // Samples, its recordings) belongs to the project, not to an album.
  const alsByDir = new Map();
  for (const f of files) if (f.ext === '.als') {
    if (!alsByDir.has(f.dir)) alsByDir.set(f.dir, []);
    alsByDir.get(f.dir).push(f);
  }
  const projectDirs = [...alsByDir.keys()];
  const inProject = f => projectDirs.some(d => f.abs.startsWith(d + path.sep));

  const pieces = [];
  const problems = [];

  for (const [dir, sets] of alsByDir) {
    sets.sort((a, b) => b.mtime - a.mtime);
    const newest = sets[0];
    try {
      const xml = zlib.gunzipSync(fs.readFileSync(newest.abs)).toString('utf8');
      const set = readLiveSet(xml);
      pieces.push(pieceFromLiveSet(set, newest, sets.slice(1)));
    } catch (e) {
      problems.push(`${newest.rel}: ${e.message}`);
    }
  }

  for (const f of files) if ((f.ext === '.mid' || f.ext === '.midi') && !inProject(f)) {
    try { pieces.push(pieceFromMidi(readMidi(fs.readFileSync(f.abs)), f, 'midi')); }
    catch (e) { problems.push(`${f.rel}: ${e.message}`); }
  }

  // Audio: attach each bounce to the piece it is a bounce of, by name.
  const audio = files.filter(f => AUDIO.has(f.ext) && !inProject(f));
  const unmatched = [];
  for (const f of audio) {
    const info = { path: f.rel, ...(f.ext === '.wav' || f.ext === '.wave' ? wavInfo(f.abs) : {}) };
    const name = norm(cleanTitle(f.base));
    const match = pieces.find(p => p.kind !== 'audio' && name.length >= 3 && (norm(p.title) === name));
    if (match) {
      match.audio.push(info);
      if (!match.album) { match.album = albumOf(f); match.trackNo = trackNo(f.base); }
    } else unmatched.push([f, info]);
  }
  // Looser second pass: one name inside the other ("Night Swim (master)").
  for (let i = unmatched.length - 1; i >= 0; i--) {
    const [f, info] = unmatched[i];
    const name = norm(cleanTitle(f.base));
    const match = pieces.find(p => p.kind !== 'audio' && !p.audio.length && name.length >= 4 && norm(p.title).length >= 4
      && (name.includes(norm(p.title)) || norm(p.title).includes(name)));
    if (match) {
      match.audio.push(info);
      if (!match.album) { match.album = albumOf(f); match.trackNo = trackNo(f.base); }
      unmatched.splice(i, 1);
    }
  }
  for (const [f, info] of unmatched) {
    const piece = {
      id: idFor(f.rel), title: cleanTitle(f.base), album: albumOf(f), trackNo: trackNo(f.base),
      kind: 'audio', source: { path: f.rel, modified: new Date(f.mtime).toISOString() },
      audio: [info], bpm: null, timeSig: [4, 4], key: null, tracks: [], needs: 'transcription',
    };
    if (transcribe && (f.ext === '.wav' || f.ext === '.wave' || f.ext === '.mp3' || f.ext === '.flac' || f.ext === '.aif' || f.ext === '.aiff')) {
      const mid = basicPitch(f.abs, path.join(out, 'transcribed'), log);
      if (mid) {
        const raw = readMidi(fs.readFileSync(mid));
        let removed = 0;
        for (const tr of raw.tracks) { const kept = dropOvertones(tr.notes); removed += tr.notes.length - kept.length; tr.notes = kept; }
        const t = pieceFromMidi(raw, f, 'transcribed');
        Object.assign(piece, { tracks: t.tracks, key: t.key, bpm: null, needs: 'checking', transcribed: true, overtonesRemoved: removed });
      }
    }
    pieces.push(piece);
  }

  for (const p of pieces) p.stats = stats(p);
  pieces.sort((a, b) => (a.album || '~').localeCompare(b.album || '~') || (a.trackNo ?? 999) - (b.trackNo ?? 999) || a.title.localeCompare(b.title));

  // Write it all.
  fs.mkdirSync(path.join(out, 'midi'), { recursive: true });
  for (const p of pieces) {
    const bytes = pieceMidi(p);
    if (!bytes) continue;
    p.midiFile = `midi/${p.id}.mid`;
    fs.writeFileSync(path.join(out, p.midiFile), bytes);
  }
  const library = { version: 1, made: now.toISOString(), roots: roots.map(r => path.basename(path.resolve(r))), pieces, problems };
  fs.writeFileSync(path.join(out, 'library.json'), JSON.stringify(library));
  report(library, out, log);
  return library;
}

// ---- pieces ----------------------------------------------------------------

function pieceFromLiveSet(set, file, older) {
  const bpm = set.tempo ?? 120;
  const tracks = [];
  for (const t of set.tracks) {
    if (t.type !== 'MidiTrack' && t.type !== 'AudioTrack') continue;
    const drums = t.drums || /\b(drum|kit|kick|snare|hat|hh|perc|clap|808 kit)/i.test(t.name);
    // Each idea once: an arrangement often places the same clip twenty times.
    const seen = new Map();
    const clips = [];
    for (const c of t.clips) {
      if (c.where !== 'session' && c.where !== 'arrangement') continue;
      const { beats, notes } = clipNotes(c);
      const g = grid(notes, beats);
      if (!g.notes.length) continue;
      const sig = g.beats + ':' + JSON.stringify(g.notes);
      if (seen.has(sig)) { seen.get(sig).uses++; continue; }
      const clip = { name: c.name, where: c.where, at: c.where === 'arrangement' ? c.start : null, uses: 1, ...g };
      seen.set(sig, clip);
      clips.push(clip);
    }
    const arr = arrangementNotes(t);
    const end = Math.max(0, ...t.clips.filter(c => c.where === 'arrangement').map(c => c.end));
    if (!clips.length && !t.audio.length) continue;
    tracks.push({
      name: t.name || (t.type === 'AudioTrack' ? 'Audio' : 'MIDI'),
      type: t.type === 'AudioTrack' ? 'audio' : 'midi',
      drums,
      audioClips: t.audio.length,
      audioFiles: [...new Set(t.audio.map(a => path.basename(a)))].slice(0, 20),
      clips,
      arrangement: arr.length ? grid(arr, end) : null,
    });
  }
  return {
    id: idFor(file.rel),
    title: cleanTitle(file.base),
    album: '', trackNo: null,
    kind: 'ableton',
    source: {
      path: file.rel, modified: new Date(file.mtime).toISOString(), creator: set.creator,
      versions: older.map(f => f.base),
    },
    audio: [],
    bpm: round(bpm, 2),
    timeSig: set.timeSig ?? [4, 4],
    key: keyOf(tracks),
    tracks,
    needs: tracks.some(t => t.type === 'midi') ? null : 'transcription',
  };
}

function pieceFromMidi(mid, file, kind) {
  const bpm = mid.tempos[0]?.bpm ?? 120;
  const end = Math.max(0, ...mid.tracks.flatMap(t => t.notes.map(n => n.beat + n.beats)));
  const tracks = mid.tracks.filter(t => t.notes.length).map((t, i) => {
    const drums = t.notes.every(n => n.ch === 9);
    const g = grid(t.notes, end);
    return { name: t.name || `Track ${i + 1}`, type: 'midi', drums, audioClips: 0, audioFiles: [], clips: [], arrangement: g };
  });
  return {
    id: idFor(file.rel), title: cleanTitle(file.base), album: kind === 'midi' ? albumOf(file) : '', trackNo: trackNo(file.base),
    kind, source: { path: file.rel, modified: new Date(file.mtime).toISOString() },
    audio: [], bpm: round(bpm, 2),
    timeSig: mid.timeSigs[0] ? [mid.timeSigs[0].num, mid.timeSigs[0].den] : [4, 4],
    key: keyOf(tracks), tracks, needs: null,
  };
}

// Notes in beats -> [sixteenth, length in sixteenths, midi, velocity], the
// game's grid. How far off the grid they sat is kept: a lot means triplets,
// swing or a loose take, and the quantised notes are an approximation of it.
function grid(notes, beats) {
  let off = 0, poly = 0;
  const out = notes.map(n => {
    const s = n.beat * 4;
    off += Math.abs(s - Math.round(s));
    return [Math.round(s), Math.max(1, Math.round(n.beats * 4)), n.midi, Math.round(n.vel ?? 100)];
  });
  const at = new Map();
  for (const [s] of out) at.set(s, (at.get(s) ?? 0) + 1);
  for (const v of at.values()) poly = Math.max(poly, v);
  return {
    beats: round(beats, 3),
    bars: Math.max(1, Math.ceil(beats / 4)),
    notes: out,
    offGrid: notes.length ? round(off / notes.length, 3) : 0,
    poly,
  };
}

// Everything the project holds counts: the arrangement, and the session clips
// beside it, which are often where the notes that tell two modes apart live.
function keyOf(tracks) {
  const notes = [];
  for (const t of tracks) {
    if (t.drums) continue;
    const src = [...t.clips.filter(c => c.where !== 'arrangement'), t.arrangement].filter(Boolean);
    let at = 0;
    for (const c of src) {
      for (const [s, len, midi] of c.notes) notes.push({ beat: at + s / 4, beats: len / 4, midi });
      at += c.beats;                    // one after another, the arrangement last: how it ends is a clue
    }
  }
  return detectKey(notes);
}

function stats(p) {
  let notes = 0, clips = 0;
  for (const t of p.tracks) {
    clips += t.clips.length;
    notes += t.arrangement ? t.arrangement.notes.length : t.clips.reduce((a, c) => a + c.notes.length, 0);
  }
  return {
    tracks: p.tracks.filter(t => t.type === 'midi').length,
    audioTracks: p.tracks.filter(t => t.type === 'audio').length,
    clips, notes,
    seconds: p.audio[0]?.seconds ?? null,
  };
}

// The whole piece as a MIDI file: the arrangement of every track (or its first
// clip if it has no arrangement), drums on channel 10, the key signature from
// the guess.
function pieceMidi(p) {
  const tracks = [];
  let ch = 0;
  for (const t of p.tracks) {
    const src = t.arrangement ?? t.clips[0];
    if (!src?.notes.length) continue;
    const channel = t.drums ? 9 : (ch === 9 ? ++ch : ch);
    if (!t.drums) ch = (ch + 1) % 16;
    tracks.push({ name: t.name, channel, notes: src.notes.map(([s, len, midi, vel]) => ({ beat: s / 4, beats: len / 4, midi, vel })) });
  }
  if (!tracks.length) return null;
  return writeMidi({ bpm: p.bpm ?? 120, timeSig: p.timeSig, key: p.key ? keySignature(p.key) : null, title: p.title, tracks });
}

// ---- files -------------------------------------------------------------------

function walk(abs, rel, out) {
  let entries;
  try { entries = fs.readdirSync(abs, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const a = path.join(abs, e.name), r = path.join(rel, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(a, r, out); continue; }
    const ext = path.extname(e.name).toLowerCase();
    if (ext !== '.als' && ext !== '.mid' && ext !== '.midi' && !AUDIO.has(ext)) continue;
    let st; try { st = fs.statSync(a); } catch { continue; }
    out.push({ abs: a, rel: r.split(path.sep).join('/'), dir: abs, ext, base: path.basename(e.name, path.extname(e.name)), mtime: st.mtimeMs, size: st.size });
  }
}

// A WAV's header: RIFF, then chunks; "fmt " has the format, "data" the length.
export function wavInfo(file) {
  try {
    const fd = fs.openSync(file, 'r');
    const head = Buffer.alloc(65536);
    const n = fs.readSync(fd, head, 0, head.length, 0);
    const size = fs.fstatSync(fd).size;
    fs.closeSync(fd);
    if (n < 12 || head.toString('ascii', 0, 4) !== 'RIFF' || head.toString('ascii', 8, 12) !== 'WAVE') return {};
    let p = 12, fmt = null, dataLen = null;
    while (p + 8 <= n) {
      const id = head.toString('ascii', p, p + 4), len = head.readUInt32LE(p + 4);
      if (id === 'fmt ') fmt = { channels: head.readUInt16LE(p + 10), rate: head.readUInt32LE(p + 12), byteRate: head.readUInt32LE(p + 16), bits: head.readUInt16LE(p + 22) };
      if (id === 'data') { dataLen = Math.min(len, size - p - 8); break; }
      p += 8 + len + (len & 1);
    }
    if (!fmt) return {};
    return { seconds: dataLen != null && fmt.byteRate ? round(dataLen / fmt.byteRate, 2) : null, rate: fmt.rate, channels: fmt.channels, bits: fmt.bits };
  } catch { return {}; }
}

function basicPitch(file, outDir, log) {
  fs.mkdirSync(outDir, { recursive: true });
  const stem = path.basename(file, path.extname(file));
  const mid = path.join(outDir, `${stem}_basic_pitch.mid`);
  if (fs.existsSync(mid)) return mid;
  try {
    log(`  transcribing ${path.basename(file)} ...`);
    execFileSync('basic-pitch', [outDir, file], { stdio: 'ignore' });
    return fs.existsSync(mid) ? mid : null;
  } catch {
    log('  basic-pitch is not installed or failed (pip install basic-pitch); skipping transcription');
    return null;
  }
}

// A transcriber hears a note's overtones as notes of their own: a bright A brings
// a quiet C# two octaves and a third up (its fifth harmonic), and that false C#
// is enough to turn D dorian into D ionian. So a note that starts with a louder
// note exactly a harmonic below it (2nd to 6th, and the 8th) is taken for an
// overtone and dropped. Only for transcriptions: in a project an octave is meant.
const HARMONICS = [12, 19, 24, 28, 31, 36];
export function dropOvertones(notes) {
  return notes.filter(n => !notes.some(f => f !== n && HARMONICS.includes(n.midi - f.midi)
    && Math.abs(f.beat - n.beat) <= 0.25 && (f.vel ?? 100) > (n.vel ?? 100)));
}

// "03 - Night Swim (Master v2)" -> "Night Swim"
export function cleanTitle(base) {
  return base
    .replace(/\[[^\]]*\]/g, ' ')                              // Live backup stamps
    .replace(/^\s*\d{1,3}\s*[-_.)]?\s+/, '')                    // track number
    .replace(/[(_-]*\b(master(ed)?|final|mix(down)?|bounce|export|render|v\d+|version \d+|\d{4}-\d\d-\d\d)\b\)?/gi, ' ')
    .replace(/[_]+/g, ' ')
    .replace(/\(\s*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || base;
}
const norm = s => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');
const trackNo = base => { const m = /^\s*(\d{1,3})\b/.exec(base); return m ? +m[1] : null; };
function albumOf(f) {
  const parts = f.rel.split('/');
  return parts.length > 2 ? parts[parts.length - 2] : '';
}
const idFor = rel => {
  const slug = norm(cleanTitle(path.basename(rel, path.extname(rel)))).slice(0, 24) || 'piece';
  return slug + '-' + crypto.createHash('sha1').update(rel).digest('hex').slice(0, 6);
};
const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;

function report(lib, out, log) {
  const by = k => lib.pieces.filter(p => p.kind === k).length;
  const audio = lib.pieces.reduce((a, p) => a + p.audio.length, 0);
  log(`\n${lib.pieces.length} pieces in ${out}/library.json`);
  log(`  ${by('ableton')} Ableton projects, ${by('midi')} MIDI files, ${audio} audio files`);
  log(`  ${lib.pieces.filter(p => p.kind !== 'audio' && p.audio.length).length} projects matched to a bounce`);
  log(`  ${lib.pieces.filter(p => p.needs === 'transcription').length} with no notes (audio only: --transcribe, or find the project)`);
  for (const p of lib.pieces) {
    const k = p.key ? `${p.key.label} (${p.key.mood})` : '-';
    log(`  ${(p.album ? p.album + ' / ' : '') + p.title}`.padEnd(48) + ` ${String(p.bpm ?? '').padStart(6)} bpm  ${k}  ${p.stats.notes} notes${p.needs ? '  [' + p.needs + ']' : ''}`);
  }
  for (const pr of lib.problems) log(`  could not read ${pr}`);
  log(`\nSheet music: open any of ${out}/midi/*.mid in MuseScore (free), then export a PDF.`);
}

// ---- command line ------------------------------------------------------------

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('music-library.mjs')) {
  const args = process.argv.slice(2);
  const roots = [], opts = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out') opts.out = args[++i];
    else if (args[i] === '--transcribe') opts.transcribe = true;
    else roots.push(args[i]);
  }
  if (!roots.length) {
    console.log('usage: node tools/music-library.mjs <folder> [<folder> ...] [--out library] [--transcribe]');
    process.exit(1);
  }
  await buildLibrary(roots, opts);
}
