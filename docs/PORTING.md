# Porting prototypes back to Unity

The prototype mirrors the architecture in
`~/Desktop/Development/Unity Games/Composer's Key - 2026/Assets/Scripts` on purpose.
When a mechanic proves out here, porting should be transcription, not redesign.

## The one real trap: the Y axis

Screen space in the prototype is **+y down** (a row index). Unity 2D is **+y up**.
Every rotation formula flips:

| | prototype (y down) | Unity (y up) |
|---|---|---|
| rotate CW  | `(x, y) -> (-y,  x)` | `(x, y) -> ( y, -x)` |
| rotate CCW | `(x, y) -> ( y, -x)` | `(x, y) -> (-y,  x)` |
| "up"       | `(0, -1)` | `(0, 1)` |

A tube circuit that turns correctly here will turn the wrong way in Unity if you copy
the vector maths literally. Copy the *intent* (`Redirect90CW`), not the arithmetic.

## File-by-file correspondence

| Prototype | Unity |
|---|---|
| `src/core/sound-wave.js` — `SoundWaveState` | `Core/SoundWaveState.cs` |
| `src/core/sound-wave.js` — `SoundWave` | `Sound Wave.cs` (`MoveRoutine`) |
| `src/core/music.js` — `MusicalState`, `MODES` | `Core/MusicalState.cs`, `Core/MusicMode.cs` |
| `src/core/music.js` — `MOOD_TO_MODE` | `Core/CodaMood.cs` + GDD §11 table |
| `src/core/beat-clock.js` | `Tempo Manager.cs` |
| `src/core/doodad.js` | `Core/IWaveInteractable.cs`, `Instruments/StrumentoComponent.cs` |
| `src/core/direction.js` — `FaceAction` | `Core/FaceAction.cs` |
| `src/doodads/brass.js` | `Instruments/BrassTube.cs` |
| `src/doodads/strings.js` | `String.cs`, `Peg.cs` |
| `src/doodads/percussion.js` | `Drum.cs` (`FaceInteraction`) |
| `src/doodads/keys.js` | `Piano Key.cs` |
| `src/doodads/locks.js` | `Locks/LockBase.cs`, `Locks/NoteLock.cs`, `Locks/PuzzleDoor.cs` |
| `src/audio/audio-engine.js` | FMOD Studio events |
| room JSON `music` block | `Core/RoomData.cs` |
| `src/render/assets.js`, `src/render/sprite-baker.js` | nothing — Unity has its own sprites; see [ASSETS.md](ASSETS.md) |
| `src/editor/` | nothing — prototype-only authoring |

## Written here first — reconcile before porting

These were designed in the prototype and have no Unity counterpart yet, or differ from
what `BrassTube.cs` / `Drum.cs` currently do. Read them as proposals with a working
implementation attached, not as transcriptions.

**A tee branches through its stem.** The branch direction is `rotate(DIR.down, rot)` — the
stem of the "┬" — not "clockwise from the wave's heading". Those agree only for an
unrotated tee entered from the left; every other case the old rule sent the branch out of
a closed wall. In Unity: `transform.TransformDirection(Vector3.down)` (mind the Y flip:
the stem of a "┬" points **down the screen**, which is `Vector3.down` in the prototype and
`Vector3.up`'s opposite in Unity — take the intent, not the vector).

**A horn's length is traced, not flood-filled.** `BrassTube.traceHorn` walks only between
tubes whose facing edges are both open (`PARTS[part].edges`, local space, rotated like the
face table). `Doodad.measureLength` — adjacency by family, which strings still use — merges
any two runs that happen to touch, so a dense room of tubing collapsed into one very low
instrument. The pitch rule is otherwise unchanged: `degree = 7 - length`, snapped to the
room's scale.

The one deliberate change to that rule: the degree is **no longer clamped at 0**. Negative
degrees wrap into lower octaves (`MusicalState.GetNote` already handles this), floored at
−14. Without it every horn past seven tiles sounded the same tonic, which made a slide on
a long circuit inaudible.

**New tube parts.** `cross` (two channels, passes both, and has *no* open edges — a bridge
is not a join, so it lengthens neither horn), `slide` (0–3 tiles of extra length, B cycles
it, contributes `1 + extend` to the trace), `mute` (B seats/pulls; when seated it halves a
wave's intensity, pushes its modulation up, and every horn it belongs to plays muted).

**The kit.** `Drum` gained `tom` (redirect 90° CCW — the mirror of the bass drum, so a
circuit can turn either way), `cymbal` (passes and returns `+0.4` intensity, which is what
lets a tee-halved branch still reach a lock) and `timpani` (pitched, `PlayAndAbsorb`, B
walks it up the room's scale). Drum voices are now selected by a `kind` string rather than
by overloading `modulation`; the old modulation mapping still resolves for face tables
written by hand.

**Timpani are melodic.** `Game`'s `onNote` hook excludes `percussion` and `sour` from what
note locks hear. The timpani plays on family `timpani` precisely so that it is *not*
excluded — it is the one piece of the kit that can answer a phrase.

## Conventions carried over verbatim

**Face naming.** A face is named by the wave's *direction of travel in the doodad's local
space*, not the edge it entered through — a wave moving right through an unrotated
straight pipe hits the `right` face. This matches `BrassTube.GetFaceAction` and
`Drum.ApplyWaveInteraction`, which both use `InverseTransformDirection` then pick by the
largest component. Keep it; changing it silently inverts every authored room.

**Default wave resolution.** A blocking tile with no handler destroys the wave; a
non-blocking tile is traversed. Same as `MoveRoutine`'s `interactable == null` branch.

**Octave numbering.** `getNote(degree, octave)` is `octave*12 + root + scaleDegree`, so
octave 5 is middle C (60) — identical to `MusicalState.GetNote`.

**String length thresholds.** 1–2 tiles violin (oct 5), 3–4 viola (4), 5–6 cello (3),
7+ bass (2). Straight from `String.cs`.

**Karplus-Strong decay.** The per-pluck decay is solved so every pitch reaches −60 dB in
the same wall-clock time, because decay is applied once per delay-line cycle rather than
per sample. The prototype renders this into an `AudioBuffer`; Unity does it in
`OnAudioFilterRead`. Same constants (`TargetRingSeconds = 0.7`, `MaxRingSeconds = 2`).

## What deliberately differs

- **Audio.** Web Audio synths stand in for FMOD. Timbre is throwaway; pitch, timing and
  which-instrument-fired-when are the parts worth trusting.
- **Rooms.** ASCII + legend instead of Unity Tilemaps. This is the whole speed advantage
  and should *not* be ported — export the room's shape, rebuild it as a scene.
- **Event channels.** The prototype calls methods directly instead of routing through
  `ScriptableObject` event channels. Add the indirection on the Unity side.
- **Wave interpolation.** Rendering lerps between tiles using the clock phase; Unity does
  it in the move coroutine. Cosmetic either way.

## Suggested workflow

1. Prototype the mechanic here until the *room* is fun, not just the mechanic.
2. Write down the face table / pitch rule / lock condition that made it work.
3. Port the rule into the matching Unity class. Rebuild the room as a scene by hand.
4. Keep the prototype room file — it's the regression test for "did it still feel right".
