// The pause menu's live parts: the map, the satchel, the score. Redrawn each time
// the menu opens; reads the game, and changes it only when you pick which carried
// instrument is in hand.

import { ITEMS } from '../doodads/pickups.js';

const $ = (id) => document.getElementById(id);

export function refreshMenu(game) {
  const room = game.room;
  const area = game.world?.area(room?.id);
  $('menu-where').textContent = [room?.name, area?.name].filter(Boolean).join(' · ');
  drawMap($('menu-map'), game);
  satchel(game);
  score(game);
}

// The world as Zelda draws a dungeon map: a box per room you have been in, a
// stub for every doorway out of it, the room you are in filled. Rooms you have not
// been in are not shown; a doorway leading to one is, so you can see where is left.
function drawMap(cv, game) {
  const c = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
  const world = game.world;
  if (!world) {
    c.fillStyle = '#8f8f8f'; c.font = '12px ui-monospace, monospace';
    c.fillText('This room stands alone.', 12, 22);
    return;
  }
  const cells = [...world.at.entries()];
  const xs = cells.map(([, a]) => a[0]), ys = cells.map(([, a]) => a[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const cols = x1 - x0 + 1, rows = y1 - y0 + 1;
  const cell = Math.floor(Math.min((W - 16) / cols, (H - 16) / rows));
  const ox = Math.floor((W - cell * cols) / 2), oy = Math.floor((H - cell * rows) / 2);
  const box = cell * 0.62, pad = (cell - box) / 2;
  const seen = game.progress.visited;

  for (const [id, [ax, ay]] of cells) {
    if (!seen.has(id) && id !== game.room?.id) continue;
    const x = ox + (ax - x0) * cell + pad, y = oy + (ay - y0) * cell + pad;
    const here = id === game.room?.id;
    c.strokeStyle = '#fff'; c.lineWidth = 2;
    c.strokeRect(x + 1, y + 1, box - 2, box - 2);
    if (here) { c.fillStyle = '#fff'; c.fillRect(x + box * 0.3, y + box * 0.3, box * 0.4, box * 0.4); }
    // Doorways: a stub on each wall with a door in it, solid if it is open now.
    const r = world.rooms.get(id);
    const json = world.json[id];
    const doors = r ? r.list.filter(d => d.typeName === 'door') : [];
    const W2 = r?.width ?? json.layout[0].length, H2 = r?.height ?? json.layout.length;
    const stub = (dx, dy, open) => {
      c.strokeStyle = open ? '#fff' : '#7d7d7d';
      c.lineWidth = open ? 3 : 1.5;
      c.beginPath();
      const cx = x + box / 2, cy = y + box / 2;
      c.moveTo(cx + dx * box / 2, cy + dy * box / 2);
      c.lineTo(cx + dx * (box / 2 + pad), cy + dy * (box / 2 + pad));
      c.stroke();
    };
    for (const d of doors) {
      if (d.y === 0) stub(0, -1, d.open);
      else if (d.y === H2 - 1) stub(0, 1, d.open);
      else if (d.x === 0) stub(-1, 0, d.open);
      else if (d.x === W2 - 1) stub(1, 0, d.open);
    }
    // Something left to find here: a dot in the corner.
    if (r && r.list.some(d => d.typeName === 'pickup')) {
      c.fillStyle = '#fff'; c.beginPath(); c.arc(x + box - 6, y + 6, 2.5, 0, Math.PI * 2); c.fill();
    }
  }
  if (area(game)) {
    c.fillStyle = '#8f8f8f'; c.font = '10px ui-monospace, monospace';
    c.fillText(area(game), 6, H - 6);
  }
}

const area = (game) => {
  const a = game.world?.area(game.room?.id);
  return a ? `${a.name} — ${a.mood}` : '';
};

function satchel(game) {
  const p = game.progress;
  $('menu-waves').textContent = `${game.waveAllowance} wave${game.waveAllowance === 1 ? '' : 's'} at once`;
  $('menu-items').innerHTML = [...p.items].map(i =>
    `<span class="item-tag" title="${ITEMS[i]?.text ?? ''}">${ITEMS[i]?.name ?? i}</span>`).join('');
  const box = $('menu-satchel');
  box.innerHTML = '';
  if (!p.satchel.length) {
    box.innerHTML = `<span class="muted">${p.has('burin') ? 'Empty. Face a drum or a reed and press L.' : ''}</span>`;
    return;
  }
  p.satchel.forEach((e, i) => {
    const b = document.createElement('button');
    b.className = `chip${i === p.selected ? ' on' : ''}`;
    b.textContent = `${e.name}${e.spec.rot ? ` ${e.spec.rot}°` : ''}`;
    b.title = 'Hold this one: L sets it down';
    b.addEventListener('click', () => { p.select(i); satchel(game); });
    box.appendChild(b);
  });
}

function score(game) {
  const s = game.score;
  const box = $('menu-score');
  if (!s) { box.innerHTML = '<span class="muted">No tune in this world.</span>'; $('menu-score-count').textContent = ''; return; }
  const have = s.layers.filter(l => game.progress.layers.has(l.id)).length;
  $('menu-score-count').textContent = `${have} of ${s.layers.length}`;
  box.innerHTML = s.layers.map(l => {
    const on = game.progress.layers.has(l.id);
    return `<span class="${on ? 'on' : ''}">${on ? l.name : '· · ·'}</span>`;
  }).join('');
}
