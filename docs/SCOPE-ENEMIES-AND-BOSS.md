# Enemies and a boss: scope

Written 2026-10-03, when Timothy asked to "scope out adding some limited form of
enemy" and "an eventual boss of some kind". This is a scoping document with one
small working prototype attached (the dissonant), not a design that is decided.
Read it as options and a recommendation, and argue with it.

## The constraint that shapes everything

Composer's Key has no combat verb. A is "make a sound", B is "play or strike an
instrument", and every sound is snapped to the room's scale, so the player can
never play a wrong note. Design pillar #1 is that the player does not need to be a
musician. An enemy that has to be shot down, or a health bar that has to be
watched, would bolt a second game onto this one.

So the enemy should be **the thing the music is against**, and defeating it should
be **making music**. The GDD already names it: dissonance (§6.10, the negative
Strumentino). The world's antagonist is the wrong note.

Musical vocabulary that fits (definitions, since they drive the design):

- **Dissonance**: two pitches that clash, that sound unstable and want to move.
- **Consonance**: pitches that sound at rest together.
- **Resolution**: a dissonance moving to a consonance, usually by a step. The
  classic one is the *leading tone* (the seventh note of a major scale, a semitone
  under the tonic) rising to the tonic: ti to do.
- **Call and response**: a phrase played, and a phrase answering it.

## What is built: the dissonant (`src/doodads/enemy.js`, `&`)

The smallest enemy that tests the idea.

| | |
|---|---|
| what it is | a wandering sour note, one tile |
| moves | one tile per beat (`every` beats), on the same clock as the waves; a soft sour tick each step, so you hear it coming |
| paths | `line` (back and forth), `turn` (walks a loop, turning clockwise at walls), `seek` (steps toward Coda) |
| touching it | a sour sting and a shove of about a tile and a half; no health, no death, a short grace period |
| a wave reaching it | it **resolves**: sounds the leading tone soured, then the tonic, and is gone. Any wave works, including one that bounced off a drum or came out of a flute |

It is in **The Discord** (`rooms/discord-01-hall.json`): three dissonants patrol
the last hall, between Coda and the flute that starts the final phrase. They cost
time and position, never progress, which suits a timing game: a shove at the
wrong moment means the reed stops breathing before you reach the door.

`node test/mechanics.mjs` checks that it walks a tile a beat, that a wave resolves
it, and that touching one shoves Coda.

### What it proved, and what it did not

- **Moving things on the beat read well**, because waves already do it. The hop is
  drawn over a sixteenth (renderer), so it looks like a step, not a teleport.
- **Resolving by wave is free of new controls**: A already aims. It also gives the
  wave a second job (clearing a path) without changing what a wave is.
- Not yet known: whether shoving is punishing enough to matter, or too fiddly on a
  phone. Play it and say.

## Options for going further (not built)

Ordered by how much new system each needs. My recommendation is in bold.

1. **Pitch-specific resolution.** A dissonant that only resolves to a wave of the
   right degree (it wants to resolve UP to do, so only a wave that last sounded do
   works). Needs waves to carry the pitch they last played; `SoundWaveState.pitch`
   exists for exactly this and nothing fills it yet except the strumentino. Small.
2. **Sour waves.** A dissonant that a wave passes through comes out soured (like
   the `x` tile), and a sour wave cannot light a fork. Connects to an INTENT gap
   ("dissonance does nothing a puzzle can feel"). Small.
3. **Carriers.** A dissonant that walks into an instrument detunes it (a horn plays
   a semitone off, so a note lock will not take it) until resolved. Puts the enemy
   inside the puzzle instead of beside it. Medium.
4. **Spawner: the cacophony.** A source that emits dissonants on a rhythm until a
   phrase is played at it. Medium.
5. **Echo.** A shadow that repeats Coda's last four moves a bar later, and whose
   touch shoves. Pure movement puzzle; no music logic. Medium, and less on-theme.

**Recommendation: 1 then 2.** Both deepen what already exists (waves and pitch) and
each is under a day. 3 is the most interesting design but wants 1 first.

## A boss: the Unresolved Chord (built 2026-10-04)

**Built** in `src/doodads/boss.js`, in its own room west of the Coda
(`rooms/discord-03-chord.json`), after Timothy asked for one. What shipped differs
from the sketch below in two places, both found by building it:

- **Phase 2 is the swarm** (resolve four seeking dissonants), not a key change; the
  stairs already had their exam in the Stair.
- **Phase 3 is a chord, not three forks.** Three forks with long horns would not fit
  round a 3 x 3 boss. Instead it listens for **three different notes within one
  beat**. Three notes sounding at once means three waves alive at once, which is
  exactly what the Overtones give, and since the three horns are 3, 5 and 7 tiles
  long, the attacks must be staggered (longest first) for the bells to land
  together. `test/mechanics.mjs` proves two waves cannot do it in any order or
  spacing; it first found that the Key's own shot (which sounds the tonic) could be
  the third note, so the chord now ignores it.

The original sketch, for the record:

**The idea.** A large multi-tile figure in an arena, made of a chord that will not
resolve: three dissonant voices stacked. Each phase it **plays a call** (a short
phrase, through the arena's own instruments, so you hear it in the room's key). You
**answer** by playing the response through the arena: horns, a flute, strings.
Each correct answer resolves one voice of the chord, and the arena changes:

| phase | the call | what you have to do | what changes |
|---|---|---|---|
| 1 | three notes, slow | answer with a horn you route yourself | one voice resolves; tempo rises |
| 2 | the call moves to another key | climb or descend stairs to meet it (the Stair's mechanic) | the arena's mode changes from phrygian to dorian |
| 3 | call and dissonants at once | answer while resolving the dissonants it releases (the Hall's mechanic), with three waves at once (the Triad's) | the last voice resolves into the level's motif |

The win is **musical**: the final resolution is the score's motif played whole,
by the arena, in a major key. That is the same payoff the Coda room already gives
on a small scale: solving it turns the room from phrygian to ionian
(`"solved": { "mood": "content" }`).

**Why this shape.** A boss here should be an exam on the level's mechanics, the way
a Zelda dungeon boss uses the dungeon's item. Every phase above is a mechanic the
player has already learned in this level, now under time pressure. Nothing new to
teach in the fight itself.

**What it would need that does not exist:**

- a multi-tile doodad (or a group of tiles acting as one), for the figure
- a "call" component: a note lock that also *plays* a phrase on a schedule (the
  hint phrase already does the playing part; it needs a timer and a reset)
- phases: a small state machine on the room (`onSolved` grew one step of this today)
- the art: one large piece, which is Timothy's to draw

Rough size: two to three days in this harness, most of it the call-and-response
lock and the phase machine. Recommended only after the dissonant has been played
on a phone and judged.

## Porting

The dissonant is a `Doodad` that moves itself in `onBeat`. In Unity that is an
`InstrumentBase` subclass with a beat-driven move coroutine on the `TempoManager`
event, registered on the object layer, using `IWaveInteractable` for the resolve.
Mind the Y axis: `seek` steps toward Coda along the longer axis, and "up" flips.
