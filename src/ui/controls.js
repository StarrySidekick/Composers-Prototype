// The on-screen pad and buttons, movable to fit your hands.
//
// Each cluster (the D-pad, the A/B pair) is fixed-position and remembers where you
// put it and how big, as fractions of the screen, in this browser's storage. Menu
// -> Move controls switches to arranging: drag either cluster, and the size slider
// scales whichever you touched last. Upright and sideways are remembered apart,
// since a phone held each way wants the pad somewhere different.

const KEY = 'ck-controls-v1';
const $ = (id) => document.getElementById(id);

function defaults(orient) {
  const W = innerWidth, H = innerHeight;
  if (orient === 'wide') {
    return {
      pad: { x: 0.03, y: 0.5 - 75 / H, s: 1 }, face: { x: 1 - (190 / W) - 0.03, y: 0.5 - 50 / H, s: 1 },
      l: { x: 0.03 + 30 / W, y: 0.5 - 140 / H, s: 1 }, r: { x: 1 - (120 / W) - 0.03, y: 0.5 - 115 / H, s: 1 },
    };
  }
  return {
    pad: { x: 12 / W, y: 1 - 166 / H, s: 1 }, face: { x: 1 - 188 / W, y: 1 - 128 / H, s: 1 },
    l: { x: 40 / W, y: 1 - 214 / H, s: 1 }, r: { x: 1 - 112 / W, y: 1 - 214 / H, s: 1 },
  };
}

export class Controls {
  constructor() {
    this.els = { pad: $('cluster-pad'), face: $('cluster-face'), l: $('cluster-l'), r: $('cluster-r') };
    this.arranging = false;
    this.selected = 'pad';
    try { this.saved = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { this.saved = {}; }
    this.bindDrag();
    $('arrange-size').addEventListener('input', (e) => {
      this.place()[this.selected].s = Number(e.target.value);
      this.apply(); this.save();
    });
    $('arrange-reset').addEventListener('click', () => { delete this.saved[this.orient]; this.apply(); this.save(); this.syncSize(); });
    $('arrange-done').addEventListener('click', () => this.setArranging(false));
    addEventListener('resize', () => this.apply());
    this.apply();
  }

  get orient() { return innerWidth > innerHeight ? 'wide' : 'tall'; }
  place() {
    if (!this.saved[this.orient]) this.saved[this.orient] = defaults(this.orient);
    // A layout saved before a cluster existed (the shoulders came later) gets its
    // default spot for the new one, and keeps where you put the rest.
    const p = this.saved[this.orient], d = defaults(this.orient);
    for (const k of Object.keys(this.els)) p[k] ??= d[k];
    return p;
  }
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.saved)); } catch {} }

  apply() {
    const p = this.place();
    for (const [name, el] of Object.entries(this.els)) {
      const q = p[name];
      const w = el.offsetWidth * q.s, h = el.offsetHeight * q.s;
      // keep it on screen whatever the screen did since
      q.x = Math.min(Math.max(q.x, 0), Math.max(0, 1 - w / innerWidth));
      q.y = Math.min(Math.max(q.y, 0), Math.max(0, 1 - h / innerHeight));
      el.style.transformOrigin = '0 0';
      el.style.transform = `translate(${q.x * innerWidth}px, ${q.y * innerHeight}px) scale(${q.s})`;
    }
  }

  syncSize() { $('arrange-size').value = String(this.place()[this.selected].s); }

  setArranging(on) {
    this.arranging = on;
    document.body.classList.toggle('arranging', on);
    $('arrange-bar').hidden = !on;
    if (on) this.syncSize();
  }

  bindDrag() {
    for (const [name, el] of Object.entries(this.els)) {
      let drag = null;
      el.addEventListener('pointerdown', (e) => {
        if (!this.arranging) return;
        e.preventDefault();
        this.selected = name; this.syncSize();
        const q = this.place()[name];
        drag = { id: e.pointerId, dx: e.clientX - q.x * innerWidth, dy: e.clientY - q.y * innerHeight };
        el.setPointerCapture(e.pointerId);
      });
      el.addEventListener('pointermove', (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        const q = this.place()[name];
        q.x = (e.clientX - drag.dx) / innerWidth;
        q.y = (e.clientY - drag.dy) / innerHeight;
        this.apply();
      });
      const end = (e) => { if (drag && e.pointerId === drag.id) { drag = null; this.save(); } };
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
    }
  }
}
