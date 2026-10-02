// Input. The control model is the virtual Game Boy from GDD §9: D-pad, A, B,
// two shoulders, pause. Keyboard maps onto exactly the same model, so nothing
// can be authored on desktop that a touch player can't do.
//
// Directions are HELD, not pressed: the game walks Coda while a direction is
// down (Game.setHeld / Game.walk), the way A Link to the Past does.

const KEYMAP = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right',
  W: 'up', S: 'down', A: 'left', D: 'right',
};

export function bindInput(game, els, hooks = {}) {
  const typing = (e) => e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement
    || e.target instanceof HTMLSelectElement;

  window.addEventListener('keydown', (e) => {
    if (typing(e) || hooks.paused?.()) return;
    const dir = KEYMAP[e.key];
    if (dir) {
      e.preventDefault();
      if (!e.repeat) { game.setHeld(dir, true); hooks.onAction?.(); }
      return;
    }
    switch (e.key) {
      case ' ': case 'Enter':
        e.preventDefault(); if (!e.repeat) { game.fire(); hooks.onAction?.(); } break;
      case 'e': case 'E': case 'f': case 'F':
        if (!e.repeat) { game.interact(); hooks.onAction?.(); } break;
      case 'r': case 'R':
        game.reload(); hooks.onAction?.(); break;
      case 'm': case 'M':
        game.metronome = !game.metronome; game.toast(`Metronome ${game.metronome ? 'on' : 'off'}`); break;
    }
  });
  window.addEventListener('keyup', (e) => {
    const dir = KEYMAP[e.key];
    if (dir) game.setHeld(dir, false);
  });
  // Letting go of everything when the window loses focus stops Coda walking on
  // forever after a cmd-tab with a key down.
  window.addEventListener('blur', () => { for (const d of [...game.held]) game.setHeld(d, false); });

  // ---- the D-pad: one pad, read by where the thumb is ----------------------
  //
  // A real D-pad rocks under your thumb, so you can roll from right to up-right to
  // up without lifting. Reading the angle from the pad's centre gives the same:
  // eight sectors, the diagonals holding two directions. A small dead zone in the
  // middle means resting a thumb there does nothing.
  const pad = els.dpad;
  let padPointer = null;
  const padDirs = new Set();
  const setPad = (next) => {
    for (const d of [...padDirs]) if (!next.has(d)) { padDirs.delete(d); game.setHeld(d, false); }
    for (const d of next) if (!padDirs.has(d)) { padDirs.add(d); game.setHeld(d, true); }
    for (const d of ['up', 'down', 'left', 'right']) pad?.classList.toggle(`is-${d}`, padDirs.has(d));
  };
  const readPad = (e) => {
    const r = pad.getBoundingClientRect();
    const x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height / 2);
    if (Math.hypot(x, y) < r.width * 0.12) return new Set();
    const a = Math.atan2(y, x) * 180 / Math.PI;            // 0 = right, 90 = down
    const sector = ((Math.round(a / 45) % 8) + 8) % 8;
    return new Set([['right'], ['right', 'down'], ['down'], ['down', 'left'],
      ['left'], ['left', 'up'], ['up'], ['up', 'right']][sector]);
  };
  if (pad) {
    pad.addEventListener('pointerdown', (e) => {
      if (hooks.arranging?.()) return;
      e.preventDefault();
      padPointer = e.pointerId;
      pad.setPointerCapture(e.pointerId);
      setPad(readPad(e));
      hooks.onAction?.();
    });
    pad.addEventListener('pointermove', (e) => { if (e.pointerId === padPointer) setPad(readPad(e)); });
    const end = (e) => { if (e.pointerId === padPointer) { padPointer = null; setPad(new Set()); } };
    pad.addEventListener('pointerup', end);
    pad.addEventListener('pointercancel', end);
  }

  // ---- A and B --------------------------------------------------------------
  const button = (el, act) => {
    if (!el) return;
    el.addEventListener('pointerdown', (e) => {
      if (hooks.arranging?.()) return;
      e.preventDefault();
      el.classList.add('is-down');
      act(); hooks.onAction?.();
    });
    const up = () => el.classList.remove('is-down');
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', up);
  };
  button(els['btn-a'], () => game.fire());
  button(els['btn-b'], () => game.interact());

  // Nothing on the play screen should open Safari's long-press menu.
  for (const el of [pad, els['btn-a'], els['btn-b'], els.stage]) {
    el?.addEventListener('contextmenu', (e) => e.preventDefault());
  }
}
