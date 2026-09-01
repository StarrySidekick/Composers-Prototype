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

## Assets carried over from Unity

Copied out of `Assets/` in the Unity project, not authored here. The `unity` block in
`assets/manifest.json` records where each slot came from, so re-exporting after an art
change is a scripted copy rather than archaeology.

| Prototype | Unity source | Baked in |
|---|---|---|
| `assets/sprites/*.png` | `Assets/Sprites` | rotation, ink colour, square padding — see below |
| `assets/audio/{cello,horn}/*.m4a` | `Assets/Sounds/{Cello,Horn}` | 32-bit float WAV → AAC 96 kbps (7.6 MB → 276 KB) |
| `assets/audio/perc/*.m4a` | `Assets/Sounds/Bass Drum.wav`, `Click.wav` | same |
| `assets/concept/*.png` | `Assets/Sprites/Untitled_Artwork*` | nothing — concept art, referenced by no slot |

Three transforms are baked into the sprite files rather than carried in code, because
`AssetStore` blits a slice verbatim and that is the right contract to keep:

- **Rotation.** The tube art is drawn *vertical* at rest — `Tube Straight.png` connects
  top+bottom and `Tube Elbow.png` is a "┌" — while `assets/` is authored unrotated and
  the renderer applies `spriteRot`. The straight, elbow and string are turned 90° CW
  once, on disk, so `brass.straight` connects left+right and `brass.elbow` is the "┐"
  that `PARTS.elbow.edges` describes. **The mouthpiece and flare are already horizontal
  in the source and must not be turned** — their cup and bell already match
  `edges: ['right']` and `edges: ['left']`.
- **Colour.** The source is white line-work on transparency, which Unity tints per
  object with `SpriteRenderer.color`. The store blits untinted, so white would be
  invisible on parchment: the ink (`#3a3226`) is baked in, and `lock.lit` is a second
  bake of the same fork in `#c8791a`. The cost is that sprites no longer follow the
  wing palettes the way `draw()` does.
- **Squareness.** `Key.png` is 51×102 and `ProtoPlayer.png` is 100×140. The store blits
  into a square tile, so both are padded to square rather than squashed.

**The horn samples are misnamed by an octave.** Every file was pitch-detected by
autocorrelation rather than trusted: `Cello/C2..C3` really is MIDI 36–48, but
`Horn/C2..C3` is MIDI **48–60**. `src/audio/sampler.js` encodes the measured pitches.
Fix the names on the Unity side and that table has to move with them.

13 of the 34 sprite slots are filled — the ones there is art for. The rest fall through
to `draw()`, which is the designed behaviour, not a gap to rush. `player` and `wave` are
extra keys outside `spriteSlots()`; the store resolves any key, but the editor's
drop-zone matcher only offers the enumerated ones.

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

**Melee strike.** `Asta.StrikeAt` spawns a wave on the struck tile tagged
`WaveSource.MeleeStrike`, offers it to the instrument, then destroys it — it never
travels. `Game.strikeAt` does the same. Instruments opt in by overriding
`onMeleeStrike`; the base declines, because in Unity a wall implements no interface at
all. `BrassTube` takes a strike only on the mouthpiece tile *and* only on a face that
isn't `Block` — every other tube tile has non-Block faces purely to route real waves,
so the face action alone can't identify the mouthpiece.

**Sealed wave entry.** `SoundWave.step` calls `doodad.receiveWave`, never
`onWaveEntered` — the base runs the busy-check, melee routing and beat hold first,
exactly as `InstrumentBase.OnWaveEntered` does before handing off to
`ApplyWaveInteraction`. `onWaveEntered` stays the doodad extension point, so the
subclasses did not need Unity's `ApplyWaveInteraction` rename.

**Wave hold.** `holdBeats > 0` parks an incoming wave for N beats before resolving it,
and an instrument that is already holding destroys the next wave to arrive. Ticked from
`Game.update` via `tickHold`, kept separate from `onBeat` so a subclass overriding
`onBeat` can never strand a held wave.

**Player face actions.** `canPlayerEnterFrom(dir)` mirrors
`IPlayerFaceInteractable.CanPlayerEnterFrom` and uses the *same* face-naming rule as
waves: moving right consults the `right` face, matching
`Strumentino.GetPlayerFaceAction`. `Room.canEnter` consults it and falls back to the
plain `solid` flag for doodads without the hook.

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
