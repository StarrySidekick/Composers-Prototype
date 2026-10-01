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
// Inside corners are handled separately, without the 47-drawing "blob" set: one
// extra drawing, `wall.inner`, is stamped on top in whichever corner needs it,
// rotated into place. See innerCorners().

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
//   inner:  also patch inside corners (see innerCorners below)
export const LINKS = {
  wall:     { joins: ['wall', 'door'], axes: 'cardinal', border: true, inner: true },
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

// Inside corners.
//
// Picture an L of wall around a floor tile. The wall tile in the crook of the L
// is joined on two sides, so by the 16-case rule it draws no border at all, but
// its diagonal neighbour is floor, and the two borders arriving from either side
// stop just short of each other. A 3 px gap, every inside corner, every room.
//
// Fixing it inside the 16 would mean 47 drawings. Instead: one small drawing,
// `wall.inner`, authored for the TOP-RIGHT (north-east) corner, stamped on top and
// rotated to whichever corners need it. Rotation is clockwise in screen space
// (+y down), the same convention as every other sprite here:
//
//     ne -> 0     se -> 90     sw -> 180     nw -> 270
//
// Returns the rotations needed for this tile, or [] for none.
const DIAGONALS = [
  ['ne', 1, -1, 'n', 'e', 0],
  ['se', 1, 1, 's', 'e', 90],
  ['sw', -1, 1, 's', 'w', 180],
  ['nw', -1, -1, 'n', 'w', 270],
];

export function innerCorners(d, room) {
  const rule = LINKS[d.typeName];
  if (!rule?.inner || !room) return [];
  const joined = (dx, dy) => {
    const x = d.x + dx, y = d.y + dy;
    if (!room.inBounds(x, y)) return rule.border;
    const n = room.doodadAt(x, y);
    return !!n && rule.joins.includes(n.typeName);
  };
  const side = { n: joined(0, -1), e: joined(1, 0), s: joined(0, 1), w: joined(-1, 0) };
  const out = [];
  for (const [, dx, dy, a, b, rot] of DIAGONALS) {
    if (side[a] && side[b] && !joined(dx, dy)) out.push(rot);
  }
  return out;
}

// Rotation for art that should turn to fit its surroundings rather than being
// rotated by hand in the room file. A door is drawn upright (a gap in a wall that
// runs north-south). Set into a wall that runs east-west, it turns 90.
// An explicit `rot` in the room always wins.
export function autoRot(d, room) {
  if (d.spec?.rot != null || !room) return d.spriteRot;
  if (d.typeName !== 'door') return d.spriteRot;
  const wallish = (dx, dy) => {
    const x = d.x + dx, y = d.y + dy;
    if (!room.inBounds(x, y)) return true;
    return room.doodadAt(x, y)?.typeName === 'wall';
  };
  const ew = wallish(-1, 0) && wallish(1, 0);
  const ns = wallish(0, -1) && wallish(0, 1);
  return ew && !ns ? 90 : 0;
}
