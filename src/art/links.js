// Tile rules: art that changes to show it has joined its neighbours.
//
// This is what Unity calls a Rule Tile and most engines call autotiling. A tile
// looks at its four neighbours, writes down which ones it "joins", and picks the
// drawing for that combination. Four neighbours, each joined or not, is 2^4 = 16
// combinations, so a fully linked family is 16 drawings.
//
// Two decisions, both made so it ports cleanly:
//
// - It is purely visual. Doodad.spriteKey is untouched; the renderer asks for the
//   linked key first and falls back to the plain one. A room plays identically
//   whether or not any linked art exists.
// - The variant is spelled with letters, not a bitmask number: `wall.ns` is a wall
//   joined above and below. Same 16 cases as the usual N=1 E=2 S=4 W=8 mask, but a
//   filename says what it is without a lookup table.
//
// It does not do inner corners. That needs the 8-neighbour "blob" set (47 drawings)
// and is not worth the hand-drawing until the 16 have been lived with.

const SIDES = [
  ['n', 0, -1],
  ['e', 1, 0],
  ['s', 0, 1],
  ['w', -1, 0],
];

// type -> rule.
//   joins:  types this one links to
//   axes:   'cardinal' (all four sides) or 'row' (east/west only)
//   border: does the edge of the room count as a neighbour? For walls, yes: the
//           outer wall should not draw a seam against nothing.
export const LINKS = {
  wall:     { joins: ['wall', 'door'], axes: 'cardinal', border: true },
  pianokey: { joins: ['pianokey'],     axes: 'row',      border: false },
};

// The linked sprite key for a doodad in a room, or null if it has no rule or no
// neighbours. `wall` with nothing around it is just `wall`.
export function linkKey(d, room) {
  const rule = LINKS[d.typeName];
  if (!rule || !room) return null;
  const sides = linkSides(rule, (dx, dy) => {
    const x = d.x + dx, y = d.y + dy;
    if (!room.inBounds(x, y)) return rule.border;
    const n = room.doodadAt(x, y);
    return !!n && rule.joins.includes(n.typeName);
  });
  return sides ? `${d.spriteKey}.${sides}` : null;
}

export function linkSides(rule, joined) {
  let out = '';
  for (const [s, dx, dy] of SIDES) {
    if (rule.axes === 'row' && dy !== 0) continue;
    if (joined(dx, dy)) out += s;
  }
  return out;
}

// Every linked key a family can produce, for baking and for the editor's slot list.
export function linkVariants(type) {
  const rule = LINKS[type];
  if (!rule) return [];
  const sides = rule.axes === 'row' ? ['e', 'w'] : ['n', 'e', 's', 'w'];
  const out = [];
  for (let m = 1; m < 1 << sides.length; m++) {
    out.push(sides.filter((_, i) => m & (1 << i)).join(''));
  }
  // Keep n,e,s,w order inside each name so `ew` never appears as `we`.
  return out.map(v => SIDES.map(([s]) => s).filter(s => v.includes(s)).join(''));
}

export function hasSide(variant, side) { return variant.includes(side); }
