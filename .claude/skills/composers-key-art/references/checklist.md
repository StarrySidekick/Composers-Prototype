# Critique checklist

Answer every line in writing for every pass, from the contact sheet at 3x and the
game in sketch mode. Finish with SHIP or FIX (and the list).

## Reads as the thing
- [ ] At 1x (51 px) the subject is recognisable: a horn bell, a fork, a drum.
- [ ] Its silhouette survives without the ornament.
- [ ] If it has a direction (drum head, peg stem, mouthpiece cup, mallet head),
      the direction at rot 0 is obvious and matches the comment and the mechanics.
- [ ] Each state reads as a change of the same object (open vs shut, lit vs unlit).

## In his hand (references/style-card.md)
- [ ] Main lines 3 px, ornament 2 px, nothing at 1 px without a reason.
- [ ] Coverage near his (around 17%); not a thin diagram.
- [ ] Ornament grows out of the form; no floating curls; marks close to his (~2).
- [ ] Curls are open spirals, not filled dots.
- [ ] Lines wobble a little; nothing is ruler-straight except where joining.

## Fits the grid (docs/ART-PROTOCOL.md)
- [ ] 51 x 51, white, two-value alpha (`test/art.mjs` passes).
- [ ] Connectors land exactly: tubes rows 20-22 / 28-30, strings 24-26.
- [ ] Joined pieces read as one run in a room (look at it in a room, not alone).
- [ ] Nothing important within 2 px of an edge that is not a connector.

## In the game
- [ ] Next to his real art in the same room, it does not look like it came from
      another game.
- [ ] Overlays (a timpani's number, a lock's dots) still read on top of it.

Verdict: SHIP / FIX (list)
