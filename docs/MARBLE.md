# The Marble

Written 2026-10-13, when Timothy asked for the whole game to exist as placeholders:

> "the finished kind of experience almost encased in marble, and then we can start
> chipping away at it ... plotting out the entire game as a series of placeholders
> with the ability to sort of jump to different parts of the game or kind of enter a
> developer mode that allows me to see the game with more detail ... but overall, be
> able to jump back into an experience of, of like experiencing the game like a player."

So the prototype now holds **every moment the finished game will have**, in order,
start to credits, whether or not it is built. New game plays all of it: the fall,
the Wood, the workshop, the castle and its four wings, the water organ, the bow, the
encore. Where something is not made yet, a placeholder stands in its place and says
what goes there. Building the game is replacing placeholders with real things, one
at a time, without ever losing sight of the whole.

Code: `src/story/`. Data: `story/`. Test: `node test/story.mjs`.

## Playing it

| as | how | what you get |
|---|---|---|
| a player | title → **new game** | the whole game, in order, saved as you go |
| a player, again | title or pause menu → **chapters** | every scene you have reached; replay from any (not saved) |
| a developer | pause menu → **developer mode** (or the `` ` `` key, or `?dev` in the address) | a strip of tools across the top, scene ids on the stage, the Marble |

Developer mode is remembered per device. Its strip:

- **where you are**: the scene's id, its kind, and how carved it is.
- **◀ ⟲ ▶**: the previous scene, restart this one, skip to the next. In a world,
  skip goes to the next scene you have not seen.
- **auto**: scenes play themselves. Cutscenes move on, pipes and bosses hit every
  note. Use it to watch a whole act go by.
- **☰**: the Marble (below).
- **⋯**: grant everything (four waves, the Burin, every story item and flag), open
  every door in this room, no shoves, double tempo, the editor, the story's flags,
  and back to player mode.

Inputs are the Game Boy's, everywhere: in a scene, A and B move it on, R twice skips
it (once in developer mode), and in developer mode L goes back a shot. A pipe or a
boss plays on the D-pad (and A and B, when a chart uses them). The pause menu pauses
a scene.

## The Marble view

Every scene as a block, act by act. A block is as wide as its minutes, and drawn by
how carved it is:

| status | drawn | means |
|---|---|---|
| idea | dashed, faint | named and placed; nothing to play (it plays as a slate) |
| placeholder | thin outline | a slate or a stand-in that says what goes here |
| rough | hatched | a playable rough draft: sketches, a first chart, first words |
| playable | bold outline | the real mechanic, unpolished |
| final | solid white | done |

The bar along the top is the game's length against the 3 to 5 hours it is meant to
be: solid for carved (playable and final), hatched for rough, dashed for the rest.
Tap a block for its brief, its notes (open questions), the rooms it uses, what plays
it and where it leads, and **play from here**. Playing from a scene gives you what a
player arriving there would carry (every item, flag and Overtone the scenes before
it grant, plus the scene's own `with`), and saves nothing.

"Loose ends" at the bottom lists anything in `story/` that points at nothing.

## The game, as outlined

About four hours ten minutes, 46 scenes. Statuses are as of this writing; the
Marble always has the current numbers.

| act | what | minutes | stands in today |
|---|---|---|---|
| Prologue: the fall | cold open: the fall, the crash, the Key | 3 | rough cutscenes |
| I: The Wood | overture: try things; Fermata; your burnt workshop (the explosion, in flashback); the first pipe up the cliff; Da Capo at the gate | 29 | five new rooms (`rooms/wood.json`), a Conductor's Key slate |
| II: The Castle | the Atrium, where the wings meet | 8 | the Metronome and Brass 01 to 03 |
| The Ramparts | woodwinds · the chaos of life · the Squall | 39 | the Flute, the Reed Loft |
| The Core | brass · judgment · the Adjudicator · the Patchwork Horn | 44 | Brass 01 to 05 |
| The Tower | strings · apathy · the Slack | 44 | the Triad, the Stand, the Stair, Strings 01 |
| The Basement | percussion · fear of the past · the Echo | 44 | Percussion 01 and 02, Keys 01 |
| The Heart | the Discord, the Unresolved Chord, the water organ, the ending, the bow | 31 | the Discord's three rooms (built) |
| Encore | the secret grand piano | 7 | rough |

Each wing has the same shape: a pipe ride the first time you walk in, its title
card (with its character's first line), its rooms, its instrument, its boss, and
what the boss leaves behind.

## How the story wraps the castle without touching it

The castle today is the prototype dungeon in `rooms/world.json`, played whole. Not
one of its rooms was edited for the story. Instead each act file has **triggers**,
and the Director (`src/story/director.js`) listens for them:

```json
"triggers": [
  { "on": "cross", "from": "brass-02-crossroads", "to": "woodwind-01-flute", "play": "tube-updraft" },
  { "on": "area", "area": "gallery", "play": "ramparts-card" },
  { "on": "solved", "room": "woodwind-02-reed", "play": "ramparts-instrument" }
]
```

| on | fires when |
|---|---|
| `enter` | Coda arrives in `room` |
| `area` | Coda crosses into `area` (an area of the world file) |
| `cross` | Coda walks from `from` into `to` |
| `solved` | a puzzle opens a door in `room` |
| `complete` | `room`'s exit (X) is reached |

Each fires once (once its scene has been seen), unless it says `"repeat": true`.
`needs` names a story flag that must be set. When one event matches several
triggers, they queue and play one after another, each returning to the room.

A scene that interrupts a room remembers where Coda was, and a scene whose `then`
is `"return"` puts him back there. That is how a wing's chain works: `solved` plays
the instrument, which leads to the boss, which leads to the aftermath, whose
`"then": "return"` puts you back in the room you solved.

The Wood is different: its rooms are new and made for the story, so it uses
**story tiles** in the rooms themselves (below).

## The pieces

### Story tiles, in any room (`src/doodads/story.js`)

| char | piece | |
|---|---|---|
| `?` | story moment | step on it and its `scene` plays. `look`: mark, gate, workshop, tube, sign, door. A `sign` is read with B. `reverse` rides a pipe backwards. `needs` a flag. `once`: plays once, then says `after`. `again`: once seen, plays this scene instead (the gate's cutscene once, then straight in) |
| `C` | character | B talks; a wave makes them hum. `who` is a cast name |
| `A` | tree | solid; a wave rustles and stops |
| `~` | water | Coda cannot cross; waves can |

All four are in the editor's palette under "Story", with their properties in the
Tile panel.

### Characters (`cast` in `story/outline.json`)

```json
"fermata": { "name": "Fermata", "role": "...",
  "lines": [ "Ohhhh. Hellooo.", { "text": "You found your workshop.", "if": "workshop" } ] }
```

Each B gives the next line, staying on the last. A line with `if` needs a story
flag; one with `unless` is skipped once the flag is set. Every name in the cast is a
placeholder (Fermata, Da Capo, Staccato, Tutti, Lento, Pianissimo, the Organist),
each a musical term with its meaning in its `role`.

### Scenes (`story/acts/*.json`)

Every scene has `id`, `kind`, `title`, `status`, `minutes`, `brief`, and may have
`notes`, `then`, `flags` (story flags it sets), `with` (a kit for jumping in),
`music` (`root`, `mood`, `bpm`, over its act's) and `cue` (its music).

`then`: a scene id; `"return"` (back where the story was interrupted); `"title"`;
or a place `{ "world": "wood", "room": "wood-gate", "at": [4, 11] }`. Missing means
the next scene in reading order.

**card**: `name`, `family`, `theme`, `emblem` (wood, woodwind, brass, strings,
percussion, organ, keys), and an optional first line `say` from `who`.

**cutscene**: `shots`, each:

```json
{ "draw": "castle-far", "beats": 8,
  "cam": { "from": [0.5, 0.75, 1.7], "to": [0.5, 0.45, 1] },
  "layers": [{ "draw": "coda", "o": { "pose": "sit" }, "box": [0.4, 0.5, 0.2, 0.3], "to": [0.4, 0.45] }],
  "fx": "boom", "cue": "tense", "hit": [[0, 0, 2, "timpani"]],
  "say": "Up close, it is mostly holes.", "who": "narrator" }
```

`draw` is a sketch; `cam` is a centre and a zoom, eased over the shot; `layers` are
figures over it, moving from `box` to `to`; `fx` is fade-in, fade-out, flash, shake
or boom; `hit` is one-off notes `[sixteenth, degree, octave, family, kind]`. A shot
with `say` waits for A; one without moves on after its `beats`. `who` is a cast name
(their portrait shows), `narrator`, or `game` (the game itself, which knows it is a
game).

**slate**: what plays for anything with status `idea`, or a scene with no content
yet. Shows the title, the minutes and NOT YET CARVED; `say` (or the brief) is spoken
by the game. `slateOf` is the kind it stands for. `standIn: { world, room, at }`
lets B drop you into the rooms that stand in for it today.

**item**: `name`, `draw` (an `item.*` sketch), `say`. `item` is a story item
remembered in the save, `give` is a real tool (`overtone`, `burin`).

**rhythm** (a pipe):

```json
{ "orient": "vertical", "family": "keys", "cue": "wonder",
  "chart": { "chords": [0, 1, 0, 4], "bars": ["L.......L.......", "L...D...U...R---"] },
  "ends": [{ "world": "wood", "room": "wood-brook", "at": [1, 2], "label": "the Brook" },
           { "world": "wood", "room": "wood-gate", "at": [4, 11], "label": "the Cliff Gate" }] }
```

One string per bar, one character per sixteenth (exactly sixteen; the test
counts): `L D U R` the D-pad lanes, `A B` the buttons (if `lanes` includes them),
`-` holds the note before it, `.` rests. Each lane sounds a chord tone (left the
root, down the third, up the fifth, right the octave), moved by `chords` bar by bar,
so any chart is a tune in the scene's key. Or `"layer": { "id": "motif" }` takes the
notes of a castle score layer (`every` thins it, `repeat` loops it), so the pipe
plays the castle's own tune. `ends` makes it a fast-travel route: ridden once, it is
listed in the pause menu, and riding it backwards plays the chart backwards (a
retrograde: the melody played end to beginning, an old composer's device).

Every sound lands on the sixteenth grid. A note hit early sounds exactly on its
sixteenth; one hit late sounds on the next, the way firing the Key is quantised. A
missed note sounds sour. There is no failing a run yet.

**boss**: `name`, `draw` (a `boss.*` sketch; drawn calm when resolved), `intro`,
`resolve`, `resolvedMood` (the mode it turns to when overcome: its struggle
resolving, musically), `resolvedBpm`, and `phases`, each a chart with a `say`, an
optional `bpm`, `cue`, `family` and a `mod`, the boss's struggle as a twist:

| mod | the boss | does |
|---|---|---|
| `scatter` | the Squall (chaos) | notes start in the wrong lane and settle at the last moment |
| `judge` | the Adjudicator (judgment) | a tighter window, and a verdict on every note |
| `free` | the Adjudicator's last phase | any lane counts, and the note you choose is the one that sounds |
| `fade` | the Slack (apathy) | grey notes, sagging lanes; the tempo drags each phase |
| `dark` | the Echo (fear of the past) | notes hidden until they are almost on you; its phases repeat |

The water organ (`heart-organ`) is a boss with no enemy: five phases, each a layer of
the castle score in a wing's instrument, then all of it.

**credits**: Coda conducts the whole score (every layer) for `bars`, cuts off,
bows, and the `lines` roll (`# ` a heading, `- ` small print). `encore` is the scene
A plays when the audience will not stop clapping.

**world**: `world` (a name from `outline.worlds`), `room`, `at`. `standInRooms` lists
the rooms standing in for it, for the Marble.

## Carving: turning a placeholder into the thing

- **A slate into something playable**: give the scene its real `kind` and content
  (shots, a chart, phases) and move its `status` from `idea` to `rough`. Nothing
  else changes; whatever led to it still leads to it.
- **A rough boss into a room boss**: build the room (the Unresolved Chord,
  `src/doodads/boss.js`, is the model), put it in a world, and make the boss scene a
  `world` scene, or keep the scene as the boss's intro and let the room's exit
  trigger (`complete`) play what comes after.
- **A wing's stand-in rooms into its own rooms**: author them (the editor, or
  `rooms/*.json`), put them in a world file of their own (`rooms/wood.json` is the
  pattern) with an entry in `outline.worlds`, point the wing's `-rooms` scene at it,
  and move its triggers to the new rooms. `node test/story.mjs` checks that every
  trigger names a real room and doorway.
- **A sketch into Timothy's drawing**: not built yet. Today every scene drawing is
  code in `src/story/sketch.js` (rough, hand-drawn-looking, white on black, after
  his concept art and his Coda). The natural next step is the AssetStore looking
  for a real image under the sketch's key first, the way tiles already do.
- **A new scene**: add it to an act's `scenes` where it belongs in reading order,
  with a `status` and `minutes`, and make something lead to it (a `then`, a trigger,
  a story tile). The Marble shows it at once; "loose ends" says if nothing does.

## Music

Every scene has a key (its act's `music`, its own over that) and plays a **cue**
(`src/story/cue.js`): a short loop in scale degrees, like a score layer, on the
clock's sixteenths. Presets: hush, wonder, fall, tense, gate, musicbox, wind,
march, slow, heartbeat, organ, fanfare, resolve, applause, silence. Or a custom
`{ "bars", "layers" }`, or `{ "score": "castle", "layers": "all" }` to borrow a
world's tune. The text box sings in the scene's key. Every note a scene plays is
`heard: false`, so nothing in the story can answer a lock; `test/story.mjs` checks
every one, and that each is in its scene's scale.

The Wood has its own tune (`rooms/wood.json`, `"always": true`, so it plays without
the metronome): an overture in F lydian, whose raised fourth is the sound of wonder.
It gains a layer, the brook, when you open the pipe.

## Saving

`progress.story` holds the scene, the world, the scenes seen, story flags and items,
pipes ridden, and where to return. Continue resumes mid-story, in a room or a
scene. As before, only a game started from the title saves.

## Porting

Prototype-only, like the editor. In Unity: the outline is a list of ScriptableObjects
(one per scene), the Director a scene-flow manager, a cutscene a Timeline, a pipe and
a boss their own scenes, a trigger a volume or an event on the room, a story tile a
trigger volume. The chart notation and the cue notation port as data.

## Proving it

`node test/story.mjs` (serve the root first): every link, chart, world, place,
trigger, story tile and character resolves; new game reaches every scene in order
and comes back to the title, each scene finishing on its own, every note in key and
unheard; the Wood walked for real (the workshop, the fork across the water, the pipe
both ways, Da Capo, the gate); the castle's triggers fired the way a player fires
them; saving and continuing; and a phone driving it by touch. Proved by injection:
a bar fifteen sixteenths long, a trigger naming a misspelled room, a scene leading
to a missing id, and cue notes made audible to locks each fail by name.
