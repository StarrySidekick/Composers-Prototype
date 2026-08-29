# Scoping: a live two-player board game

**This document is not about Composer's Key.** It scopes a separate, smaller project —
a two-player abstract board game, playable on two phones in different places, where a
move made by one player appears on the other's screen within a second.

It lives here because this is where the thinking happened. When the new repo exists,
this file moves there and gets deleted from this one.

---

## The short answer

**Yes, this is buildable with the tooling you already use — plus exactly one new piece.**

Everything you learned building the Composer's Key prototype transfers directly: plain ES
modules, a canvas, touch-first controls, a static site served from a repo root on GitHub
Pages. The game board, the pieces, the tap-to-move interaction, the whole visual layer —
that is the same kind of work you have already done, and none of it needs a build step.

The one thing missing is **a place for the game state to live that is neither her phone
nor yours.**

GitHub Pages hands out files. It cannot remember anything. It has no database, no server
code, no way for your phone to tell hers that you moved a piece. That is not a limitation
you can code around — a static host is *definitionally* a thing that only serves bytes.
So the "new layer to unlock" is real, but it is small, it is free at your scale, and it is
one file's worth of code.

The rest of this document is about what that piece is and how to get there.

---

## What you have vs. what you need

| Piece | Status |
|---|---|
| Static hosting, free, permanent URL | **Have it.** GitHub Pages, same as this repo. |
| Phone-friendly touch UI | **Have it.** The Game Boy shell is proof you can do this. |
| Canvas rendering, sprite baking | **Have it.** Reusable patterns, not reusable code. |
| No-build ES module architecture | **Have it.** |
| Board state, legal moves, win detection | **Need it.** Ordinary code, no infrastructure. |
| Somewhere shared to put the moves | **Need it. This is the new layer.** |
| Both clients noticing a change instantly | **Need it.** Comes free with the above. |

---

## The architecture

```
  Your phone                                          Her phone
 ┌──────────────┐                                   ┌──────────────┐
 │ Game page    │                                   │ Game page    │
 │ (GitHub      │                                   │ (GitHub      │
 │  Pages)      │                                   │  Pages)      │
 └──────┬───────┘                                   └───────┬──────┘
        │  write move                    push update        │
        │  ───────────────►  ┌────────────────┐  ◄───────── │
        │                    │   Firebase     │             │
        │  ◄───────────────  │ Realtime DB    │  ─────────► │
        │     push update    │  /games/{id}   │   write move│
        └────────────────────┴────────────────┴─────────────┘
```

Two static pages, both talking to one small shared document. Neither phone talks to the
other directly; they both talk to the middle and get pushed updates when it changes.

### Why Firebase Realtime Database

Not because it's fashionable — because it is the only option that adds a backend *without
adding a build step*, which is the constraint you actually care about:

```js
// This is the entire dependency story. No npm, no bundler, no node_modules.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js';
import { getDatabase, ref, onValue, push } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js';
```

It ships as ES modules on a CDN. It drops into a plain `<script type="module">` exactly
like your own files do. And its core primitive — "call me whenever this path changes" — is
precisely the one this game needs:

```js
onValue(ref(db, `games/${gameId}/moves`), snap => {
  replayMoves(snap.val());   // her move just landed; redraw
});
```

That listener *is* the multiplayer. There is no polling loop, no refresh button, no
reconnect logic to write. Sub-second in practice.

**Cost: zero, permanently, at your scale.** The free Spark plan caps at 100 simultaneous
connections. You need two. You will not approach any other limit with one game of one
board between two people.

### What gets stored: moves, not the board

This is the single most important design decision in the project, and it is easy to get
wrong.

The tempting model is to store the current board and overwrite it each turn. **Don't.**
Two clients writing a whole board can disagree, clobber each other, and there is no way to
tell which one is right.

Instead store an **append-only list of moves**, and have each client derive the board by
replaying them from the starting position:

```
/games/{gameId}
   ruleset:  "gomoku"
   players:  { black: "tim", white: "her" }
   moves:    [ {n:0, by:"black", to:"d4"},
               {n:1, by:"white", to:"e5"}, ... ]
   chat:     [ ... ]           // optional, and honestly the best part
```

Every good property falls out of this for free:

- **No conflicts.** Appends never collide. A move either lands or it doesn't.
- **Move history and replay.** You already have the whole game recorded.
- **Undo / takeback.** Drop the last move. (You will want this. She will ask for it.)
- **Tiny writes.** A move is ~40 bytes, not a whole board.
- **Trivial debugging.** The database *is* the game log, readable in the Firebase console.

The board is never stored. It is always computed. Treat that as a rule.

### Identity, without a login screen

Do not build accounts. For two people, the game URL *is* the credential:

```
https://you.github.io/game/#g=a7f3c9e1b2d84f60
```

You create a game, you get a link with a random unguessable ID, you text it to her, she
taps it, she's in. Her browser remembers which side she is in `localStorage`. No password,
no email, no login screen, no "forgot password" flow you'd have to build and she'd have to
suffer.

Firebase security rules restrict reads and writes to a known game ID, so the URL is the
secret. Someone would have to guess a 64-bit random string to find your game. For two
people playing a board game, that is the correct amount of security, and anything more is
work you'd be doing for no one.

### One honest caveat

The clients are trusted. Both phones validate moves, but a determined person with the
browser console open could write an illegal move straight to the database. Making that
impossible requires a real server that referees, which is a genuinely bigger project.

For a game between you and your girlfriend, this does not matter. Noting it so it's a
decision you made rather than a hole you didn't see. If the game ever goes public,
*that* is the moment this needs revisiting — not before.

---

## What to actually build

### Don't build chess

You can already play chess together on a dozen free apps that are better than what you'd
write. The thing that makes this worth doing is that it is *yours* — a game that only the
two of you play, with your art, your jokes, and a rule you invented because it was funny
at 1am.

So: build a small original or public-domain abstract, not a reimplementation of something
you can already download.

### Build the plumbing with the dumbest possible game first

This is the sequencing advice that matters most. Every hard problem in this project is in
the **sync**, not the **rules**. So prove the sync with rules so simple they cannot be
wrong, then swap the real game in behind them.

**Gomoku** (five in a row on a grid) is ideal for this: a move is "place a stone at x,y,"
validation is "is that square empty," win detection is four short loops. Perhaps 80 lines
total. If that game works on two phones in two locations, you are done with the hard part —
the rest is game design, which is the fun part.

### Then the real game

Structure the code so the ruleset is a swappable module — `src/rules/gomoku.js`,
`src/rules/whatever.js`, each exporting the same handful of functions
(`initialBoard`, `legalMoves`, `applyMove`, `winner`). The board renderer and the sync
layer don't care which one is loaded. That way "let's try a different game" is an
afternoon, not a rewrite, and you get to keep the old ones.

Public-domain abstracts worth stealing from, all tiny to implement and genuinely deep:

- **Brandubh** — 7×7 Norse tafl. Asymmetric: one of you defends a king, the other hunts
  it. Different roles for the two of you is a real advantage for a couple's game.
- **Game of the Amazons** — queens that move and then shoot a square dead. Astonishing
  depth from about fifteen lines of rules.
- **Konane** — Hawaiian checkers. Capture by jumping; whoever can't move loses.

Avoid reimplementing games still in print (Onitama, Hive, Quoridor) if you might ever
publish this. Fine for the two of you privately; a problem the day it becomes public.

### The feature that will matter more than the game

Put a **message field next to the board.** Two or three taps of canned reactions, or a
free text line — stored in the same document, appearing instantly, same mechanism as
moves and roughly ten extra lines of code.

You are not really building a game. You are building a reason to be in the same small
room for twenty minutes. The board is the excuse. Budget for the chat accordingly.

---

## Phases

| Phase | What it is | Done when | Rough size |
|---|---|---|---|
| **0** | Firebase project, security rules, a page with a 5×5 grid and no game. Tap a square, it lights up on both phones. | You tap on your phone; it lights up on hers. | One evening |
| **1** | Gomoku. Turns, legal moves, win detection, "your turn" state, the game-link flow. | You finish a real game on two phones in two places. | 1–2 sessions |
| **2** | Ruleset made swappable; the real game built behind it. Board art. | It looks like something you made on purpose. | 2–4 sessions |
| **3** | Presence dot ("she's online"), move history, takeback, rematch, the message field. | It feels considerate rather than functional. | 1–2 sessions |
| **4** | *Optional.* Install-to-home-screen (PWA) + push notifications for "your turn." | You get a ping across the day. | Its own project — see below |

**Phase 0 is the real milestone.** Everything genuinely new to you is in Phase 0. Once a
tap on your phone lights a square on hers, the remaining work is ordinary game code of the
kind you have already written.

### On Phase 4

Web push on iOS requires the page be installed to the home screen first, and the setup is
finicky in ways that have nothing to do with your game. Since you said you'll both be
online at the same time, **skip it.** If the game sticks and you find yourselves wanting
day-long correspondence play, revisit it then as a deliberate project.

---

## What only you can do

Three things need your hands and your accounts:

1. **Create the Firebase project** at console.firebase.google.com — free, no credit card
   on the Spark plan. Enable Realtime Database. Copy the config object it gives you.
2. **Create the new GitHub repo** and turn on Pages (Settings → Pages → deploy from
   `main`, root).
3. **Give me access to the new repo** — this session is scoped to
   `composers-prototype` only, so I can't push to a repo that doesn't exist yet.

On the Firebase config keys: they are *meant* to be public and live in your client-side
code. They identify the project; they don't authorize anything. Security comes from the
database rules, not from hiding the keys. This trips people up constantly — you are not
making a mistake by committing them.

---

## Alternatives I considered and rejected

| Approach | Why not |
|---|---|
| **WebRTC peer-to-peer** (PeerJS) | No database at all, which is elegant. But it still needs a signaling server to introduce the phones, the free public one is unreliable, and mobile networks behind carrier NAT break it often enough to ruin an evening. Wrong trade for a turn-based game with no latency pressure. |
| **Supabase** | Genuinely good and equally CDN-friendly. Firebase's Realtime Database is a marginally better fit for one small always-synced document, and its free tier has no pause-on-inactivity behavior to think about. Close call; either would work. |
| **Cloudflare Worker + Durable Object** | The most "correct" answer, and it'd let you make the server authoritative later. But it's a deploy pipeline, a CLI and a config file — it breaks the open-a-file-and-it-runs property that makes this fun. Revisit only if the game goes public. |
| **Pass a state-encoded link back and forth** | Zero infrastructure, genuinely clever, works over plain text messages. Ruled out because you specifically want it to feel *live*, and this is the opposite of live. Worth remembering as a fallback. |
| **Building it inside this repo** | Conflicts with the no-dependency rule and muddies the Unity porting story. It deserves its own repo and its own name. |

---

## Open questions for later

- **Which game after Gomoku?** Doesn't block Phases 0–1 at all. Decide once you've felt
  the sync working.
- **What is it called?** Affects the repo name, so worth a thought before Phase 0.
- **Does she want to help design it?** Worth asking. A game the two of you designed
  together is a different and better object than a game you built and handed over.
