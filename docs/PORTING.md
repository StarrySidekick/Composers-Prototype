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
| `assets/sprites/*.png` | `Assets/Sprites` | rotation, square padding (and a brown ink, now overridden) — see below |
| `assets/audio/{cello,horn}/*.m4a` | `Assets/Sounds/{Cello,Horn}` | 32-bit float WAV → AAC 96 kbps (7.6 MB → 276 KB) |
| `assets/audio/perc/*.m4a` | `Assets/Sounds/Bass Drum.wav`, `Click.wav` | same |
| `assets/concept/*.png` | `Assets/Sprites/Untitled_Artwork*` | nothing — concept art, referenced by no slot |

Two transforms are baked into the sprite files rather than carried in code; colour
and one mirror are applied at load time instead, the way Unity does them:

- **Rotation.** The tube art is drawn *vertical* at rest — `Tube Straight.png` connects
  top+bottom and `Tube Elbow.png` is a "┌" — while `assets/` is authored unrotated and
  the renderer applies `spriteRot`. The straight, elbow and string are turned 90° CW
  once, on disk, so `brass.straight` connects left+right and `brass.elbow` is the "┐"
  that `PARTS.elbow.edges` describes. The mouthpiece and flare are already horizontal
  in the source and are not turned.
- **The mouthpiece is mirrored, in code.** Measured 2026-10-01: its stem crosses the
  *left* edge, but `PARTS.mouthpiece.edges` is `['right']`, so every horn looked cut at
  its first joint. The earlier note here said it already matched; it did not. Fixed
  with `"flipX": true` in the manifest, and `node test/art.mjs` now fails if it
  regresses. Check `Mouthpiece.png` against `BrassTube` in Unity too.
- **Colour, at load time.** The source is white line-work, which Unity tints per object
  with `SpriteRenderer.color`. These files were baked in a brown ink (`#3a3226`) back
  when the floor was parchment, and `lock_lit.png` in orange. Since 2026-10-01 the
  prototype is black and white like the Unity build, and `AssetStore` recolours every
  sprite to the manifest's `ink` (white) on load, using only its alpha. So the brown
  in the files is dead and harmless; the shapes are what is used. Re-exports should
  be plain white, per [ART-PROTOCOL.md](ART-PROTOCOL.md).
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

## Written here 2026-10-03: the dungeon pass

All new, none in Unity yet. Each line is the rule that made it work, in the form
it should be ported.

**Woodwinds (`src/doodads/woodwind.js`).**
- *Flute*: a straight run of `flute` tiles sharing one `rot`, head at local left,
  foot at local right, holes open on local top. A wave moving along the bore
  leaves through the **first open hole** it meets: it sounds there and is
  redirected out of the hole (`rotate(up, rot)`); a covered hole passes it on; the
  foot sounds and passes it on (all covered). Pitch: `degree = 7 - n`, `n` = tiles
  from the head to the sounding tile inclusive, octave 5. B on a hole toggles
  `covered`; B on the head launches a wave down the bore. Waves into the side of
  the bore are destroyed; a wave travelling back up into the head is swallowed.
- *Reed*: one tile, bell at local right. Any wave entering (from any side) is
  destroyed and starts it **breathing**: it sounds `degree`/`octave` and emits a
  wave out of the bell at once, then once per beat until `breath` breaths are
  spent. A wave of intensity under 0.6 gives one breath only. A wave arriving while
  it breathes is just absorbed (no restart). Portable (see the satchel).

**Progress (`src/core/progress.js`).** The save: `waves` (1 + Overtones, max 4),
`items`, `satchel`, `taken` / `placed` tile edits, `opened` doors, score `layers`,
`visited`. Rooms rebuild from their data and replay these. In Unity this is a
save system plus per-scene persistent state; keep the "rebuild then replay" shape,
it is what stops duplicates.

**Wave allowance.** Only the Key's own waves count (`source === ComposersKey`); an
instrument's waves (a blown horn, a mallet, a reed) do not. A room's `maxWaves`, if
set, overrides the found allowance (free play, or a deliberate cap).

**The satchel (L / R).** With the burin, L on a `portable` doodad (drums, reeds)
removes it and stores its spec (with its current `rot`); L on empty floor in front
places the held one (never in the outer wall, never on a wave). R turns the held
spec by 45° for a mirror drum, 90° otherwise. The GDD's two shoulders, finally used.

**Chord forks.** A trigger lock with `sustain: n` is lit for `n` beat boundaries
after each hit, then goes dark and re-checks its group. A door with `latch: true`
stays open once opened. Unlatched doors in a sustain group are "held" doors.

**Stairs that climb.** A keyshift with `climb: true` applies `delta` times the dot
product of Coda's move direction with its up direction (`rotate(up, rot)`): up the
stair raises, down lowers, across does nothing. Mind the Y axis.

**Note locks: `key`, `listen`, `patience`.** `key` builds the target scale from
the room's mode on the lock's own tonic, so the same degrees are wanted in another
key. `listen: 'world'` hears notes from every room. `patience` (beats) forgets a
half-played phrase after that much silence, measured lazily on the next note.

**Score gate.** A lock lit once the save holds `layers` score layers; checked on the beat.

**Doors in the outer wall are paired** with the matching door next door; they open
and shut together unless the partner is an entry door. Walking off an edge needs
the far door open, so a door is a wall from both sides. A wave stepping off an edge
through an open door is re-spawned on the far door tile and resolved against it in
the same sixteenth (`Game.crossEdge`); the room it is in keeps simulating while
Coda is elsewhere. In Unity, rooms are scenes: this needs either adjacent scenes
loaded additively or a per-room simulation that runs off-screen.

**The score (`src/audio/score.js`).** Layers of `[sixteenth, degree, octave?,
kind?]` over a fixed loop, each earned by `by` (start, or a room's first opened
door), played through the current room's `MusicalState` so it follows key, mode and
tempo, and never heard by a lock. In FMOD: one event with stems, a parameter per
layer, and the key and mode applied by playing the stems from MIDI through the
room's scale (or by authoring per-mode stems).

**The dissonant (`src/doodads/enemy.js`).** See
[SCOPE-ENEMIES-AND-BOSS.md](SCOPE-ENEMIES-AND-BOSS.md).

## Mirror drums: new here, port this

Since 2026-10-01 the bass drum, tom and snare are **mirrors**, not face tables: the
head is a line through the tile centre at `rot` (45° steps; 0 is `/`) and a wave's
direction reflects off it, `d' = 2(d·u)u - d` with `u` along the head. Unity's
`Vector2.Reflect(d, n)` does the same sum given the head's **normal** `n`. Mind the
Y axis: a head that is `/` on screen here (`u = (1, -1)`) is `/` in Unity with
`u = (1, 1)`, because Unity's y points up. Copy the slant you see, not the vector.
**Only the head reflects**: the head faces one way (up-left at rot 0, the side away
from the Unity drum's legs), a wave moving against that facing bounces, one moving
with it hits the shell and is destroyed, as in the Unity game. In Unity terms: bounce
when `Vector2.Dot(dir, headNormal) < 0`, absorb when `> 0`, pass when `0`.
A room-file `faces` table on a drum still overrides the mirror, for old rooms.

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
