// The daily board, drawn. The castle's renderer does the floor, the tiles (real
// art, then placeholders, then each doodad's own drawing), the wave and Coda;
// this adds what a pinball table needs on top of it:
//
//   handles   what a finger may do, drawn on the piece so it is seen before it is
//             tried: a turning arrow (tap turns), a small dial (tap tunes), corner
//             brackets (drag moves). A piece with none of them is fixed.
//   labels    the note each instrument plays, as solfege, asked of the instrument
//             (Board.labels), so the board can be read against the tune.
//   the trail where the last wave went, faint, under the pieces: the table
//             remembers the ball, so a wrong run still teaches something.
//   Coda      under the bottom-left tile, in a row of his own below the board,
//             with a chevron up the way the wave leaves him.
//
// The floor is plain, its mode's tint and nothing else: no staves, no cell grid
// (Timothy, 2026-10-16, twice). White line-work only, like everything else:
// handles in the same ink as the art, the trail the same white, quieter.

import { Renderer } from '../render/renderer.js';
import { PALETTE } from '../render/palette.js';
import { handlesOf } from './board.js';
import { TuningPeg, TautString } from './pieces.js';

export class BoardView extends Renderer {
  constructor(canvas, assets) {
    super(canvas, assets);
    this.showLabels = true;
    this.drag = null;        // { piece, from, at: {px, py}, to } while a finger carries one
    this.marks = [];         // [{x, y, ok}] where the last run's notes sounded
    this.lift = null;        // a peg under a finger, sliding along its string
  }

  // The board fills the width, with one row more under it for Coda.
  resize(room) {
    super.resize({ width: room.width, height: room.height + 1 });
  }

  // The canvas is sized by the page; the tile is whatever fits it.
  draw(board, clock) {
    const { c } = this;
    const room = board.room;
    const s = this.tile;
    const p = PALETTE.wing(room.wing);
    c.clearRect(0, 0, this.viewW ?? 0, this.viewH ?? 0);
    this.clock = clock;
    c.save();
    c.translate(this.ox, this.oy);

    this._floor(room, s);
    this._trail(board, s);

    for (let y = 0; y < room.height; y++) {
      for (let x = 0; x < room.width; x++) {
        const d = room.tiles[y][x];
        if (!d || (this.drag && this.drag.piece === d)) continue;
        c.save();
        c.translate(x * s, y * s);
        if (d instanceof TuningPeg && handlesOf(d).move) this._block(s, this.lift === d);
        this._doodad(d, s, board.ctx, room);
        this._handles(d, s, board);
        c.restore();
      }
    }

    if (this.showLabels) this._labels(board, s);
    this._marks(s);
    this._launcher(board, s, p);
    this._waves({ waves: board.waves, clock }, s, p);
    if (this.drag) this._carry(board, s);
    c.restore();
  }

  // The floor: its mode's tint, and no lines at all.
  _floor(room, s) {
    const c = this.c;
    c.fillStyle = this.floorColour(room);
    c.fillRect(0, 0, room.width * s, room.height * s);
  }

  // The block a sliding peg stands on: a square of line-work, under the peg.
  // Heavier while a finger is sliding it.
  _block(s, held = false) {
    const c = this.c, m = s * 0.12;
    c.save();
    c.fillStyle = '#000000';
    c.strokeStyle = '#ffffff';
    c.lineWidth = Math.max(2, s * (held ? 0.09 : 0.05));
    c.beginPath();
    if (c.roundRect) c.roundRect(m, m, s - 2 * m, s - 2 * m, s * 0.08);
    else c.rect(m, m, s - 2 * m, s - 2 * m);
    c.fill();
    c.stroke();
    c.globalAlpha = 0.6;
    c.lineWidth = Math.max(1, s * 0.03);
    c.beginPath();
    c.moveTo(m * 1.8, s - m * 1.8); c.lineTo(s - m * 1.8, s - m * 1.8); c.lineTo(s - m * 1.8, m * 1.8);
    c.stroke();
    c.restore();
  }

  // ---- handles ---------------------------------------------------------------

  _handles(d, s, board) {
    const h = handlesOf(d);
    if (!h.turn && !h.tune && !h.move) return;
    const c = this.c;
    c.save();
    c.globalAlpha = 0.95;
    c.strokeStyle = '#ffffff';
    c.fillStyle = '#ffffff';
    c.lineCap = 'round';
    c.lineWidth = Math.max(1.5, s * 0.045);
    if (h.move) {
      // Corner brackets: this one lifts out.
      // Outlined in black so they read over the art they frame.
      const k = s * 0.22, m = s * 0.06;
      c.beginPath();
      for (const [x, y, dx, dy] of [[m, m, 1, 1], [s - m, m, -1, 1], [m, s - m, 1, -1], [s - m, s - m, -1, -1]]) {
        c.moveTo(x, y + dy * k); c.lineTo(x, y); c.lineTo(x + dx * k, y);
      }
      const w = c.lineWidth;
      c.strokeStyle = '#000000';
      c.lineWidth = w + Math.max(2, s * 0.05);
      c.stroke();
      c.strokeStyle = '#ffffff';
      c.lineWidth = w * 1.2;
      c.stroke();
      c.lineWidth = w;
    }
    if (h.turn) {
      // A turning arrow in the top right corner, on a black disc so it reads on art.
      const cx = s * 0.8, cy = s * 0.2, r = s * 0.12;
      disc(c, cx, cy, r * 1.55);
      c.beginPath();
      c.arc(cx, cy, r, -Math.PI * 0.9, Math.PI * 0.55);
      c.stroke();
      const ax = cx + r * Math.cos(Math.PI * 0.55), ay = cy + r * Math.sin(Math.PI * 0.55);
      c.beginPath();
      c.moveTo(ax - r * 0.75, ay - r * 0.05);
      c.lineTo(ax, ay);
      c.lineTo(ax + r * 0.15, ay - r * 0.8);
      c.stroke();
    }
    if (h.tune) {
      // A dial in the bottom right: a knob with a pointer. Tap it and it moves on.
      const cx = s * 0.8, cy = s * 0.8, r = s * 0.11;
      disc(c, cx, cy, r * 1.55);
      c.beginPath();
      c.arc(cx, cy, r, 0, Math.PI * 2);
      c.stroke();
      c.beginPath();
      c.moveTo(cx, cy); c.lineTo(cx + r * 0.7, cy - r * 0.7);
      c.stroke();
    }
    c.restore();
  }

  // ---- note names --------------------------------------------------------------

  _labels(board, s) {
    const c = this.c;
    c.save();
    c.font = `600 ${Math.max(9, Math.round(s * 0.24))}px ui-sans-serif, -apple-system, system-ui, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    // Asked again only when a touch has changed the board.
    if (this._labelsOf !== board || this._labelsAt !== board.moves) {
      this._labels_ = board.labels();
      this._labelsOf = board; this._labelsAt = board.moves;
    }
    for (const l of this._labels_) {
      if (this.drag && this.drag.piece === l.piece) continue;
      // Beside a string, not on it: above a level one, left of an upright one.
      const str = l.piece instanceof TautString;
      const x = l.x * s + (str && l.piece.axis === 'v' ? s * 0.22 : s * 0.3);
      const y = l.y * s + (str && l.piece.axis === 'h' ? s * 0.22 : s * 0.8);
      const w = c.measureText(l.text).width + s * 0.14;
      c.globalAlpha = 0.85;
      c.fillStyle = '#000000';
      roundRect(c, x - w / 2, y - s * 0.15, w, s * 0.3, s * 0.08);
      c.fill();
      c.globalAlpha = 1;
      c.fillStyle = '#ffffff';
      c.fillText(l.text, x, y + 0.5);
    }
    c.restore();
  }

  // Where each note of the last run sounded: a ring if it was right, a cross on
  // the one that was wrong.
  _marks(s) {
    const c = this.c;
    c.save();
    c.strokeStyle = '#ffffff';
    c.lineWidth = Math.max(2, s * 0.06);
    for (const m of this.marks) {
      const x = (m.x + 0.5) * s, y = (m.y + 0.5) * s;
      c.globalAlpha = 0.9;
      if (m.ok) {
        c.beginPath(); c.arc(x, y, s * 0.46, 0, Math.PI * 2); c.stroke();
      } else {
        const k = s * 0.36;
        c.beginPath();
        c.moveTo(x - k, y - k); c.lineTo(x + k, y + k);
        c.moveTo(x + k, y - k); c.lineTo(x - k, y + k);
        c.stroke();
      }
    }
    c.restore();
  }

  // ---- the ball's path -----------------------------------------------------------

  _trail(board, s) {
    if (!board.trail.length) return;
    const c = this.c;
    const byWave = new Map();
    for (const t of board.trail) {
      if (!byWave.has(t.id)) byWave.set(t.id, []);
      byWave.get(t.id).push(t);
    }
    c.save();
    c.strokeStyle = '#ffffff';
    c.globalAlpha = board.running ? 0.22 : 0.35;
    c.lineWidth = Math.max(2, s * 0.07);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.setLineDash([s * 0.04, s * 0.16]);
    for (const pts of byWave.values()) {
      c.beginPath();
      pts.forEach((t, i) => {
        const x = (t.x + 0.5) * s, y = (t.y + 0.5) * s;
        if (i) c.lineTo(x, y); else c.moveTo(x, y);
      });
      c.stroke();
    }
    c.restore();
  }

  // ---- Coda, under the bottom-left tile ------------------------------------------

  _launcher(board, s, p) {
    const { x, y } = board.launch;
    const c = this.c;
    this._player({ player: { x, y, rx: x, ry: y, facing: 'up', side: 'right', walking: false, stride: 0 } }, s, p);
    // The way the wave goes: a chevron at the top of his row, pointing up.
    c.save();
    c.translate((x + 0.5) * s, (y + 0.06) * s);
    c.strokeStyle = '#ffffff';
    c.globalAlpha = board.running ? 0.35 : 0.85;
    c.lineWidth = Math.max(2, s * 0.06);
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(-s * 0.13, s * 0.08); c.lineTo(0, -s * 0.05); c.lineTo(s * 0.13, s * 0.08); c.stroke();
    c.restore();
  }

  // ---- a piece on a finger -----------------------------------------------------

  _carry(board, s) {
    const { piece, at, to, ok } = this.drag;
    const c = this.c;
    if (to) {
      c.save();
      c.strokeStyle = '#ffffff';
      c.globalAlpha = ok ? 0.9 : 0.3;
      c.lineWidth = 2;
      c.setLineDash(ok ? [] : [4, 4]);
      c.strokeRect(to.x * s + 2, to.y * s + 2, s - 4, s - 4);
      c.restore();
    }
    c.save();
    c.translate(at.px - this.ox - s / 2, at.py - this.oy - s * 0.9);
    c.globalAlpha = 0.9;
    this._doodad(piece, s, board.ctx, board.room);
    c.restore();
  }
}

function disc(c, x, y, r) {
  const a = c.globalAlpha;
  c.globalAlpha = a * 0.8;
  c.fillStyle = '#000000';
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  c.globalAlpha = a;
  c.fillStyle = '#ffffff';
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
