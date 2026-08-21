import { Doodad, defineDoodad } from '../core/doodad.js';
import { PALETTE } from '../render/palette.js';

class Wall extends Doodad {
  constructor(spec, x, y) {
    super(spec, x, y);
    this.solid = true;
    this.blocksWave = true;
  }
  draw(c, s, ctx) {
    const p = PALETTE.wing(ctx.room.wing);
    c.fillStyle = p.wall;
    c.fillRect(0, 0, s, s);
    c.fillStyle = p.wallEdge;
    c.fillRect(0, 0, s, Math.max(2, s * 0.12));
    // wrought-iron cobble suggestion
    c.strokeStyle = p.wallLine;
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(0, s * 0.5); c.lineTo(s, s * 0.5);
    c.moveTo(s * 0.5, s * 0.5); c.lineTo(s * 0.5, s);
    c.stroke();
  }
}
defineDoodad('wall', Wall);

class Door extends Doodad {
  constructor(spec, x, y) {
    super(spec, x, y);
    this.open = !!spec.open;
    this.group = spec.group ?? 'a';
  }
  get solid() { return !this.open; }
  set solid(_) {}
  get blocksWave() { return !this.open; }
  set blocksWave(_) {}

  get spriteKey() { return this.open ? 'door.open' : 'door'; }

  onWaveEntered(wave, ctx) {
    if (this.open) wave.pass(); else wave.destroy();
  }

  setOpen(v, ctx) {
    if (this.open === v) return;
    this.open = v;
    if (v) {
      ctx.playDegree({ family: 'keys', degree: 4, octave: 5, intensity: 0.8 });
      ctx.toast(`A door opens.`);
    }
  }

  draw(c, s, ctx) {
    const p = PALETTE.wing(ctx.room.wing);
    c.fillStyle = this.open ? p.doorOpen : p.door;
    c.fillRect(s * 0.06, s * 0.06, s * 0.88, s * 0.88);
    c.strokeStyle = p.accent;
    c.lineWidth = 2;
    c.strokeRect(s * 0.06, s * 0.06, s * 0.88, s * 0.88);
    if (!this.open) {
      c.beginPath();
      c.arc(s * 0.72, s * 0.5, s * 0.07, 0, Math.PI * 2);
      c.fillStyle = p.accent;
      c.fill();
    }
  }
}
defineDoodad('door', Door);

// Stairs / raised rooms literally raise or lower the key (GDD §6.5).
class KeyShift extends Doodad {
  constructor(spec, x, y) {
    super(spec, x, y);
    this.solid = false;
    this.blocksWave = false;
    this.walkable = true;
    this.delta = spec.delta ?? 1;
  }
  get spriteKey() { return this.delta > 0 ? 'keyshift.up' : 'keyshift.down'; }
  onWaveEntered(wave, ctx) { wave.pass(); }
  onPlayerEnter(ctx) {
    ctx.room.music.shiftKey(this.delta);
    ctx.toast(`Key ${this.delta > 0 ? 'raised' : 'lowered'} — now ${ctx.room.music.label}`);
    ctx.playDegree({ family: 'keys', degree: 0, octave: 5, intensity: 0.5 });
  }
  draw(c, s, ctx) {
    const p = PALETTE.wing(ctx.room.wing);
    c.strokeStyle = p.accent;
    c.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const t = s * (0.28 + i * 0.2);
      c.beginPath(); c.moveTo(s * 0.2, t); c.lineTo(s * 0.8, t); c.stroke();
    }
    c.fillStyle = p.accent;
    c.font = `bold ${Math.round(s * 0.3)}px ui-monospace, monospace`;
    c.textAlign = 'center';
    c.fillText(this.delta > 0 ? '▲' : '▼', s * 0.5, s * 0.24);
  }
}
defineDoodad('keyshift', KeyShift);

class Exit extends Doodad {
  constructor(spec, x, y) {
    super(spec, x, y);
    this.solid = false;
    this.blocksWave = false;
    this.walkable = true;
  }
  onWaveEntered(wave, ctx) { wave.pass(); }
  onPlayerEnter(ctx) {
    ctx.toast('Room resolved. ♪');
    ctx.onRoomComplete?.();
  }
  draw(c, s, ctx) {
    const p = PALETTE.wing(ctx.room.wing);
    c.strokeStyle = p.accent;
    c.lineWidth = 2;
    c.beginPath();
    c.arc(s * 0.5, s * 0.5, s * 0.3, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = p.accent;
    c.font = `bold ${Math.round(s * 0.4)}px ui-monospace, monospace`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('♪', s * 0.5, s * 0.54);
  }
}
defineDoodad('exit', Exit);

// Negative Strumentino (GDD §6.10) — injects dissonance rather than dealing damage.
class Dissonance extends Doodad {
  constructor(spec, x, y) {
    super(spec, x, y);
    this.solid = false;
    this.blocksWave = false;
    this.family = 'negative';
  }
  onWaveEntered(wave, ctx) {
    const s = wave.state.clone();
    s.intensity = Math.max(0.15, s.intensity * 0.6);
    s.modulation = 1;
    wave.applyState(s);
    ctx.play({ family: 'sour', midi: ctx.room.music.getNote(1, 4), intensity: 0.5 });
    wave.pass();
  }
  draw(c, s) {
    c.strokeStyle = '#8b3a52';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(s * 0.25, s * 0.25); c.lineTo(s * 0.75, s * 0.75);
    c.moveTo(s * 0.75, s * 0.25); c.lineTo(s * 0.25, s * 0.75);
    c.stroke();
  }
}
defineDoodad('dissonance', Dissonance);
