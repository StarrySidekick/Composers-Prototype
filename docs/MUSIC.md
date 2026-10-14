# Your music, in the game

Asked for on 2026-10-14: *"take all of the music that I've made ... the WAV files
in the albums folder on my desktop ... the MIDI files from the Ableton projects
... label them and create like a little artifacted list ... eventually create
sheet music ... and a very easy to use sheet music creation thing to write
little motifs and melodies that can eventually be used for the game."*

Three pieces, one pipeline:

```
your Mac                          the songbook                       the game
--------                          ------------                       --------
Albums/*.wav  ─┐                  Library: every piece, labelled     score layers
Ableton/*.als ─┼─ music-library ─▶ Writer: motifs in scale degrees ─▶ scene cues
loose *.mid  ─┘   (library.json,  (sheet music, playback,            lock phrases
                   midi/*.mid)     exports)
```

## 1. Read your music: `tools/music-library.mjs`

Run it on the computer that has the music, from this repo:

```bash
node tools/music-library.mjs ~/Desktop/Albums ~/Desktop/Songs
```

Name every folder that holds albums or projects. On this Mac those two are the
ones: `Albums` holds the bounces, `Songs` holds the projects, an album to a
numbered folder. Not `~/Music/Ableton` — that is Live's factory packs, 134 sets
of someone else's demo content. It writes `library/` (which git
ignores: your music is yours, and this repo is public):

- `library/library.json`: every piece with its tracks and clips as notes on the
  game's sixteenth grid, tempo, time signature, and a guessed key.
- `library/midi/<piece>.mid`: each piece as a clean MIDI file carrying its tempo
  and the guessed key signature.

What it reads, and why:

- **Ableton sets (.als) are the real thing.** An .als file is gzipped XML; every
  MIDI clip is in it, note by note. The tool reads session clips (each idea once,
  however many times the arrangement uses it) and the arrangement played out
  (loops repeated, clips started part-way into a loop, switched-off clips and
  muted notes left out). A project folder with several saves is one piece, read
  from the newest; Live's `Backup/` folder is skipped. Drum Racks are marked as
  drums and kept out of the key guess.
- **Audio tracks have no notes.** A sung line or a recorded guitar is sound, not
  MIDI: the library lists the audio files a track plays and says so.
- **A WAV is matched to its project by name.** `03 Night Swim (Master).wav`
  finds `Night Swim.als`; track numbers, "master", "final", "v2" and backup
  stamps are ignored. A WAV with no project is listed as *audio only*.
- **Audio only, transcribed: `--transcribe`.** Runs Spotify's
  [basic-pitch](https://github.com/spotify/basic-pitch) on each orphan WAV and
  reads what it hears. Install it with `python3.11 -m pip install basic-pitch`:
  on Python 3.13 it fails to build (it pins an old numpy). Tried on 2026-10-14
  with a synthesised Drunken Sailor: every pitch right once its overtones were
  filtered out (it heard each A's fifth harmonic, a quiet C♯, as a note, which
  turned D dorian into D ionian until the tool learned to drop them), but quick
  repeated notes merged (30 of 36 notes) and it does not find the tempo (its
  grid is always 120 bpm). That was one clean instrument. A full mix is worse:
  every note brings overtones, and drums smear across everything. The notes from
  a project are always better; find the project first.

Paths in `library.json` start at the folder you named, never at your home
folder, so the file can go to the private page without saying where you keep
things.

## 2. The songbook: `songbook.html`

Served with the game (`python3 -m http.server 8080`, then
<http://localhost:8080/songbook.html>, or the title screen's **songbook** chip).
Two tabs.

**Library.** Every piece by album: its key and mood, tempo, length, status. Open
one to see where it came from, play any clip or the whole arrangement, see four
bars as sheet music, and say what it is: a status (new, listened, motif
candidate, in the game, not for the game), tags, notes, and **the key, when the
guess is wrong**. Served from the repo on your Mac it reads `library/library.json`
by itself; anywhere else, **Load library.json**.

**Write.** The motif writer. The grid's rows are scale degrees, not piano keys:
do, re, mi up two octaves and la, ti below, so every tap is in the key, the same
rule the game is built on. The staff above draws what you tap as sheet music
while you tap it. Change the mode and the tune keeps its shape and changes its
colour, as it does crossing into another area of the castle.

**Use as motif** on any clip in the library opens it in the writer, in its
piece's key, top line only by default (the tune, not the chords). Notes outside
the scale are bent to the nearest scale tone and counted, because the game has
no way to play them.

### Where a motif goes in the game

| Export | What it is | Where it goes |
|---|---|---|
| Copy as score layer | `{id, name, by, family, octave, notes: [[step, degree]]}` | `rooms/world.json` → `score.layers`. Set `by` to the room id that earns it. |
| Copy as cue | `{bars, layers: [...]}` | a scene's `cue` in `story/acts/*.json` |
| Copy as lock phrase | `"sequence": [degrees]` | a note lock's override in a room. Repeats are taken out: a lock ignores a note that repeats the last one. |
| Copy motif | the whole motif | paste it to Claude, or keep it |
| Save .mid | MIDI with the key signature | MuseScore, for real sheet music |

The game plays each note's **start**; a score layer has no lengths. Lengths are
kept for the staff and the .mid.

## 3. Sheet music

Two routes, on purpose:

- **Short things (motifs, four bars of a clip):** drawn in the page by
  `src/music/notation.js`, from scratch, as SVG in the game's line-work. It
  spells notes by the key (F♯ in D major, G♭ in E♭ minor), cuts rhythms so the
  beats stay visible (an eighth that crosses a beat becomes two tied
  sixteenths), beams by the beat, and only prints an accidental the key
  signature has not already said.
- **Whole pieces:** open `library/midi/<piece>.mid` in
  [MuseScore](https://musescore.org) (free), then File → Export → PDF. MuseScore
  is a real engraver (voices, page layout, parts), and the .mid tells it the key
  so it spells your notes right. Rebuilding that here would be months for a
  worse result.

MIDI is a performance, not a score: it says when a key went down and came up,
nothing about note values, bars or spelling. Every route from MIDI to notation is
a reading of it: quantising (snapping to a grid), choosing a key, splitting
voices. That is why a loose or swung take reads as busier notation than you
played, and why the library flags clips with *loose or triplet timing*.

## 4. The key guess

`src/music/key.js` scores all 84 keys (12 tonics × 7 modes) against the time
spent on each pitch class: home gets the most, then the fifth, then the third,
other scale tones some, notes outside little (Krumhansl and Schmuckler's idea,
stretched to the seven modes). The last note and the bass count extra, because a
tune can sit on its fifth for bars and still end at home. Ties between modes
that the notes cannot separate go to the commoner mode.

C ionian and A aeolian are the same seven notes; only emphasis tells them apart,
so the guess can be wrong in an honest way. The library shows the runner-up and
lets you set the key by hand; that override is what every motif from that piece
uses. `test/music.mjs` holds the guess to the castle tune in all 84 keys and to
three tunes whose keys are known.

## 5. The private page on claude.ai

The songbook is also published as a private Artifact (only you can open it):
https://claude.ai/artifact/4dDMySzsr1bXnqSyFZSsCt

There it keeps the library, your labels and your motifs in the page's own
database instead of one browser's storage, so they are on your phone and your
Mac alike, and **a Claude session can read them** (`ArtifactData`, collections
`pieces`, `notes`, `labels`, `motifs`) to put a motif into a room. You load
`library.json` into it once (Library → Load library.json); load it again after
running the tool on new music. On claude.ai a page may not hand over a .mid, so
**Save .mid** gives a .zip with the .mid inside.

### Republishing the private page

`tools/songbook-artifact.html` is the page; it is published at the artifact's
root with its modules beside it, so its paths are the repo root's.
`node tools/songbook-files.mjs` prints the `files` map (every module
`src/music/songbook/main.js` imports, the stylesheet, the two scores). Publish to
the URL above with capabilities `{ db: {}, downloads: true }`. Artifacts do not
serve .m4a, so the recorded cello and horn stay behind: on claude.ai the
"live" sound is the synth voices, and the SNES settings work as everywhere.

## Checks

- `node test/music.mjs` (no server): MIDI files both ways, a hand-made Live set,
  degrees in all 84 keys, the key guess, spelling, rhythms, the zip, and the
  tool end to end on a fake Desktop.
- `node test/writer.mjs` (serve the root on :8080): the songbook on a 390 × 844
  touch screen, and as the private page with a stand-in for its database.

**Real sets, since 2026-10-14.** The doubt above — the reader had only ever seen
hand-made sets — is settled for Live 11. The first import read 254 projects off
`Albums` and `Songs` with no file it could not open, and one of them, *Prelude*
(Live 11.0.6, 7 MIDI tracks and an audio track), was checked tag by tag against
its own XML: 7 `MidiTrack` and 1 `AudioTrack` in the file, 7 and 1 read; 67
`MidiClip`, 67 read; all 6732 `MidiNoteEvent` parsed, none dropped. Of those,
3425 sit inside the clip markers and are what the tool plays and exports — the
rest are notes trimmed off a clip's edges, which Live keeps in the file and does
not sound. Clip names came through as Live shows them, and the tempo matched the
set's `<Manual Value="144" />`.

**Still not proved:** that Live *displays* what the tool reads. The check above
is against the file, not against Live's own window — Live was never opened. A
tempo that looks wrong is worth one look at the set before blaming the tool:
seven pieces came in outside 40–220 bpm and all seven were real, two of them
sets genuinely saved at Live's 999 maximum. If a clip does land in the wrong
place, the field names at the top of `src/music/ableton.js` are where to look.
