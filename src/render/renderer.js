// Canvas renderer. Deliberately schematic — this is a mechanics harness, not the
// hand-drawn game. The one piece of real art direction carried over is the
// parchment floor with visible staves (GDD §10), because the endgame sheet-music
// system depends on the player having seen it the whole time.

import { PALETTE } from './palette.js';
import { DIR } from '../core/direction.js';
import { midiName } from '../core/music.js';

export class Renderer {
  constructor(canvas, assets = null) {
    this.canvas = canvas;
    this.c = canvas.getContext('2d');
    this.tile = 40;
    this.ox = 0; this.oy = 0;
    this.assets = assets;
    // Set by the editor: where the brush is hovering, what is selected, whether the
    // grid should be loud. Null when playing.
    this.edit = null;
    // Debug overlay: per-wave state labels. Toggled by the debug panel.
    this.debug = false;
  }

  resize(room) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.c.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.tile = Math.max(
      12,
      Math.floor(Math.min(rect.width / room.width, rect.height / room.height))
    );
    this.ox = Math.floor((rect.width - this.tile * room.width) / 2);
    this.oy = Math.floor((rect.height - this.tile * room.height) / 2);
    this.viewW = rect.width;
    this.viewH = rect.height;
  }

  draw(game) {
    const { c } = this;
    const room = game.room;
    const s = this.tile;
    const p = PALETTE.wing(room.wing);

    c.clearRect(0, 0, this.viewW ?? 0, this.viewH ?? 0);
    c.save();
    c.translate(this.ox, this.oy);

    this._floor(room, s, p);

    // doodads
    for (let y = 0; y < room.height; y++) {
      for (let x = 0; x < room.width; x++) {
        const d = room.tiles[y][x];
        if (!d) continue;
        c.save();
        c.translate(x * s, y * s);
        this._doodad(d, s, game.ctx);
        c.restore();
      }
    }

    this._waves(game, s, p);
    this._player(game, s, p);
    this._beatPulse(game, s, p);
    if (this.edit?.active) this._editOverlay(room, s, p);

    c.restore();
  }

  // A tile draws itself unless the asset store has a picture of it. The sprite is
  // authored unrotated, so the renderer applies `rot` the same way draw() would.
  _doodad(d, s, ctx) {
    const sprite = this.assets?.get(d.spriteKey);
    const c = this.c;
    if (!sprite) { d.draw(c, s, ctx); return; }
    c.imageSmoothingEnabled = false;
    const rot = d.spriteRot;
    if (rot) {
      c.save();
      c.translate(s / 2, s / 2);
      c.rotate((rot * Math.PI) / 180);
      c.drawImage(sprite.image, sprite.sx, sprite.sy, sprite.sw, sprite.sh, -s / 2, -s / 2, s, s);
      c.restore();
    } else {
      c.drawImage(sprite.image, sprite.sx, sprite.sy, sprite.sw, sprite.sh, 0, 0, s, s);
    }
    c.imageSmoothingEnabled = true;
    d.overlay(c, s, ctx);
  }

  _floor(room, s, p) {
    const c = this.c;
    c.fillStyle = p.parchment;
    c.fillRect(0, 0, room.width * s, room.height * s);

    // staff lines — the floor is paper
    c.strokeStyle = p.staff;
    c.lineWidth = 1;
    c.globalAlpha = 0.55;
    for (let y = 0; y < room.height; y++) {
      for (let i = 1; i <= 4; i++) {
        const yy = y * s + (i * s) / 5;
        c.beginPath();
        c.moveTo(0, yy + 0.5);
        c.lineTo(room.width * s, yy + 0.5);
        c.stroke();
      }
    }
    c.globalAlpha = 1;

    // tile grid
    c.strokeStyle = 'rgba(58,50,38,0.10)';
    for (let x = 0; x <= room.width; x++) {
      c.beginPath(); c.moveTo(x * s + 0.5, 0); c.lineTo(x * s + 0.5, room.height * s); c.stroke();
    }
    for (let y = 0; y <= room.height; y++) {
      c.beginPath(); c.moveTo(0, y * s + 0.5); c.lineTo(room.width * s, y * s + 0.5); c.stroke();
    }
  }

  _waves(game, s, p) {
    const c = this.c;
    const t = game.clock.phase;
    for (const w of game.waves) {
      if (!w.alive) continue;
      const x = (w.prevX + (w.x - w.prevX) * t + 0.5) * s;
      const y = (w.prevY + (w.y - w.prevY) * t + 0.5) * s;
      const r = s * (0.18 + 0.16 * Math.sin(t * Math.PI));
      const a = 0.35 + 0.65 * w.state.intensity;

      c.save();
      c.translate(x, y);
      c.globalAlpha = a;
      c.strokeStyle = w.state.modulation > 0.5 ? '#8b3a52' : p.hot;
      c.lineWidth = Math.max(2, s * 0.09);
      c.beginPath();
      c.arc(0, 0, r, 0, Math.PI * 2);
      c.stroke();
      c.globalAlpha = a * 0.5;
      c.beginPath();
      c.arc(0, 0, r * 1.8, 0, Math.PI * 2);
      c.lineWidth = 1.5;
      c.stroke();

      if (this.debug) this._waveLabel(w, s, p);
      c.restore();
    }
    c.globalAlpha = 1;
  }

  // Debug: the wave's SoundWaveState, pinned to the wave. Pitch as a note name,
  // intensity and modulation as bars would be unreadable at this size — numbers win.
  _waveLabel(w, s, p) {
    const c = this.c;
    c.globalAlpha = 1;

    // heading arrow
    c.strokeStyle = '#ffffff';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(w.dir.x * s * 0.45, w.dir.y * s * 0.45);
    c.stroke();

    const text = `${midiName(w.state.pitch)} i${w.state.intensity.toFixed(2)} m${w.state.modulation.toFixed(2)}`;
    c.font = `${Math.max(9, Math.round(s * 0.24))}px ui-monospace, monospace`;
    c.textAlign = 'center';
    const wd = c.measureText(text).width + 6;
    const yy = -s * 0.5;
    c.fillStyle = 'rgba(24,20,14,0.85)';
    c.fillRect(-wd / 2, yy - s * 0.28, wd, s * 0.32);
    c.fillStyle = '#ffd97a';
    c.fillText(text, 0, yy - s * 0.04);
  }

  _player(game, s, p) {
    const c = this.c;
    const pl = game.player;
    const x = (pl.rx + 0.5) * s;
    const y = (pl.ry + 0.5) * s;
    const bob = Math.sin(performance.now() / 380) * s * 0.03;

    c.save();
    c.translate(x, y + bob);

    // ghost body
    c.beginPath();
    c.moveTo(-s * 0.26, s * 0.22);
    c.lineTo(-s * 0.26, -s * 0.06);
    c.arc(0, -s * 0.06, s * 0.26, Math.PI, 0);
    c.lineTo(s * 0.26, s * 0.22);
    for (let i = 0; i < 3; i++) {
      c.quadraticCurveTo(
        s * (0.26 - 0.087 - i * 0.174), s * 0.32,
        s * (0.26 - 0.174 - i * 0.174), s * 0.22
      );
    }
    c.closePath();
    c.fillStyle = 'rgba(238,240,252,0.92)';
    c.fill();
    c.strokeStyle = p.ink;
    c.lineWidth = 1.5;
    c.stroke();

    // eyes look where he faces
    const d = DIR[pl.facing];
    c.fillStyle = p.ink;
    for (const sx of [-1, 1]) {
      c.beginPath();
      c.arc(sx * s * 0.1 + d.x * s * 0.05, -s * 0.09 + d.y * s * 0.04, s * 0.045, 0, Math.PI * 2);
      c.fill();
    }

    // the Composer's Key — a baton, held toward the facing direction
    c.strokeStyle = p.metalHi;
    c.lineWidth = Math.max(2, s * 0.07);
    c.beginPath();
    c.moveTo(d.x * s * 0.18, d.y * s * 0.18);
    c.lineTo(d.x * s * 0.44, d.y * s * 0.44);
    c.stroke();
    c.restore();
  }

  // Build mode: a legible grid, the hovered cell, and the selected cell.
  _editOverlay(room, s, p) {
    const c = this.c;
    const { hover, selected, erasing, rect } = this.edit;

    c.save();
    c.strokeStyle = 'rgba(217,164,65,0.20)';
    c.lineWidth = 1;
    for (let x = 0; x <= room.width; x++) {
      c.beginPath(); c.moveTo(x * s + 0.5, 0); c.lineTo(x * s + 0.5, room.height * s); c.stroke();
    }
    for (let y = 0; y <= room.height; y++) {
      c.beginPath(); c.moveTo(0, y * s + 0.5); c.lineTo(room.width * s, y * s + 0.5); c.stroke();
    }

    if (selected && room.inBounds(selected.x, selected.y)) {
      c.strokeStyle = '#ffd97a';
      c.lineWidth = 2;
      c.setLineDash([4, 3]);
      c.strokeRect(selected.x * s + 1, selected.y * s + 1, s - 2, s - 2);
      c.setLineDash([]);
    }

    if (rect && rect.a && rect.b) {
      const x0 = Math.min(rect.a.x, rect.b.x), x1 = Math.max(rect.a.x, rect.b.x);
      const y0 = Math.min(rect.a.y, rect.b.y), y1 = Math.max(rect.a.y, rect.b.y);
      c.fillStyle = 'rgba(255,217,122,0.18)';
      c.fillRect(x0 * s, y0 * s, (x1 - x0 + 1) * s, (y1 - y0 + 1) * s);
      c.strokeStyle = '#ffd97a';
      c.lineWidth = 2;
      c.strokeRect(x0 * s + 1, y0 * s + 1, (x1 - x0 + 1) * s - 2, (y1 - y0 + 1) * s - 2);
    }

    if (hover && room.inBounds(hover.x, hover.y)) {
      c.fillStyle = erasing ? 'rgba(180,70,70,0.22)' : 'rgba(255,217,122,0.22)';
      c.fillRect(hover.x * s, hover.y * s, s, s);
      c.strokeStyle = erasing ? '#c05a5a' : '#ffd97a';
      c.lineWidth = 2;
      c.strokeRect(hover.x * s + 1, hover.y * s + 1, s - 2, s - 2);
    }
    c.restore();
  }

  _beatPulse(game, s, p) {
    // A quiet downbeat tick in the corner so tempo is visible while authoring.
    const c = this.c;
    const beat = game.lastBeat % game.room.music.timeSignature;
    const r = game.room;
    for (let i = 0; i < r.music.timeSignature; i++) {
      c.beginPath();
      c.arc(8 + i * 12, 10, i === beat ? 4.5 : 3, 0, Math.PI * 2);
      c.fillStyle = i === beat ? p.hot : 'rgba(58,50,38,0.25)';
      c.fill();
    }
  }

  // Screen -> tile, for click-to-paint in the editor.
  pick(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: Math.floor((clientX - rect.left - this.ox) / this.tile),
      y: Math.floor((clientY - rect.top - this.oy) / this.tile),
    };
  }
}
