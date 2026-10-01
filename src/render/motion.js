// Where a wave is drawn, as a function of the audio clock.
//
// The rule: a wave is drawn ON a tile at the exact audio time its step into that
// tile is scheduled, which is when that tile's note sounds. Between steps it
// glides toward the next tile along its current direction.
//
// That is a prediction, but a safe one: whatever a tile does to a wave (bend it,
// eat it) happens when the wave ENTERS the tile, so the motion into the next tile
// is always along `dir`. The old version slid from the previous tile instead, so
// the picture arrived one sixteenth after the sound.
//
// Separate from the renderer so test/timing.mjs can ask the same question the
// screen does: "at audio time `now`, where is this wave?"

export function wavePosition(w, clock, now = clock.ctx.currentTime) {
  if (w.held) return { x: w.x, y: w.y, phase: 0 };
  const T = clock.timeOf(clock.index);
  const next = T + clock.subInterval;
  // A wave fired between grid lines starts from where it was born, not from the
  // last grid line, or it would jump forward on the frame it appears.
  const from = Math.max(T, w.bornAt ?? -Infinity);
  const p = next > from ? Math.max(0, Math.min(1, (now - from) / (next - from))) : 0;
  return { x: w.x + w.dir.x * p, y: w.y + w.dir.y * p, phase: p };
}
