// Input. The control model is the virtual Game Boy from GDD §9: D-pad, A, B,
// two shoulders, pause. Keyboard maps onto exactly the same model, so nothing
// can be authored on desktop that a touch player can't do.

const KEYMAP = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right',
  W: 'up', S: 'down', A: 'left', D: 'right',
};

export function bindInput(game, els, hooks = {}) {
  const held = new Set();
  let repeatTimer = null;

  function press(dir) {
    game.move(dir);
    hooks.onAction?.();
  }

  function startRepeat(dir) {
    press(dir);
    clearInterval(repeatTimer);
    repeatTimer = setInterval(() => { if (held.has(dir)) press(dir); }, 150);
  }

  function stopRepeat(dir) {
    held.delete(dir);
    if (!held.size) { clearInterval(repeatTimer); repeatTimer = null; }
  }

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
    const dir = KEYMAP[e.key];
    if (dir) {
      e.preventDefault();
      if (!held.has(dir)) { held.add(dir); startRepeat(dir); }
      return;
    }
    switch (e.key) {
      case ' ': case 'Enter':
        e.preventDefault(); game.fire(); hooks.onAction?.(); break;
      case 'e': case 'E': case 'f': case 'F':
        game.interact(); hooks.onAction?.(); break;
      case 'r': case 'R':
        game.reload(); hooks.onAction?.(); break;
      case 'm': case 'M':
        game.metronome = !game.metronome; game.toast(`Metronome ${game.metronome ? 'on' : 'off'}`); break;
      case 'Escape':
        hooks.onPause?.(); break;
    }
  });

  window.addEventListener('keyup', (e) => {
    const dir = KEYMAP[e.key];
    if (dir) stopRepeat(dir);
  });

  // Touch / mouse — on-screen Game Boy
  const bind = (el, down, up) => {
    if (!el) return;
    const d = (e) => { e.preventDefault(); down(); };
    const u = (e) => { e.preventDefault(); up?.(); };
    el.addEventListener('pointerdown', d);
    el.addEventListener('pointerup', u);
    el.addEventListener('pointercancel', u);
    el.addEventListener('pointerleave', u);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  };

  for (const dir of ['up', 'down', 'left', 'right']) {
    bind(els[`pad-${dir}`],
      () => { if (!held.has(dir)) { held.add(dir); startRepeat(dir); } },
      () => stopRepeat(dir));
  }
  bind(els['btn-a'], () => { game.fire(); hooks.onAction?.(); });
  bind(els['btn-b'], () => { game.interact(); hooks.onAction?.(); });

  return { held };
}
