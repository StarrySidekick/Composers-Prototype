// Developer mode: the game with its workings showing.
//
// Off, the game is the game: no ids, no statuses, nothing that says "prototype"
// except the placeholders themselves. On (the pause menu's last button, the `
// key, or ?dev in the address), a strip of tools sits over the top of the screen:
//
//   where you are     the scene's id, kind and how carved it is
//   ◀ ⟲ ▶            previous scene, restart this one, skip to the next
//   auto              scenes play themselves: cutscenes advance, tube runs and
//                     bosses hit every note, so a whole act can be watched
//   ☰                 the Marble: the whole game, every scene, jump anywhere
//   ⋯                 cheats: grant everything, open this room's doors, no
//                     shoves, double tempo, the editor, the story's flags
//
// and the stage's corner shows what the engine on it is doing (the shot, the
// step, the hits). Remembered per device.

const $ = (id) => document.getElementById(id);

export class Dev {
  constructor(director, game, { marble, openEditor, refresh } = {}) {
    this.d = director;
    this.game = game;
    this.marble = marble;
    this.openEditor = openEditor;
    this.refresh = refresh;
    this.lastWhere = '';
    director.onDevChange = () => this.sync();
    this.bind();
    this.sync();
  }

  bind() {
    const d = this.d, g = this.game;
    $('dev-back').addEventListener('click', () => d.back());
    $('dev-restart').addEventListener('click', () => d.restart());
    $('dev-skip').addEventListener('click', () => d.skip());
    $('dev-auto').addEventListener('click', () => { d.autoplay = !d.autoplay; this.sync(); });
    $('dev-marble').addEventListener('click', () => this.marble.open({ dev: true }));
    $('dev-more').addEventListener('click', () => { $('dev-more-box').hidden = !$('dev-more-box').hidden; });
    $('dev-grant').addEventListener('click', () => {
      const p = g.progress;
      p.waves = 4; p.items.add('burin'); p.metronome = true;
      for (const id of d.outline.order) {
        const sc = d.outline.scene(id);
        if (sc.kind === 'item' || sc.flags) d.grant(sc);
      }
      g.toast('Everything granted: four waves, the Burin, every story item and flag.');
      this.refresh?.();
    });
    $('dev-solve').addEventListener('click', () => {
      if (!g.room || d.stageScene) return;
      let n = 0;
      for (const door of g.room.list) if (door.typeName === 'door' && !door.open) { door.setOpen(true, g.ctx); n++; }
      g.toast(n ? `${n} door${n === 1 ? '' : 's'} opened.` : 'No shut doors here.');
    });
    $('dev-hurt').addEventListener('click', () => {
      d.noHurt = !d.noHurt; g.noHurt = d.noHurt; this.sync();
    });
    // Scenes run at the Director's speed; a room's tempo is the room's own.
    $('dev-fast').addEventListener('click', () => {
      d.fast = !d.fast;
      d.speed = d.fast ? 2 : 1;
      if (g.room && !d.stageScene) g.room.music.bpm = d.fast ? g.room.music.bpm * 2 : g.room.music.bpm / 2;
      this.sync();
    });
    $('dev-editor').addEventListener('click', () => this.openEditor?.());
    $('dev-flags').addEventListener('click', () => {
      const box = $('dev-flags-box');
      box.hidden = !box.hidden;
      if (!box.hidden) box.textContent = JSON.stringify({ ...d.story, seen: `${d.story.seen.length} scenes` }, null, 1);
    });
    $('dev-off').addEventListener('click', () => d.setDev(false));
    window.addEventListener('keydown', (e) => {
      if (e.key !== '`' || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      d.setDev(!d.dev);
    });
  }

  sync() {
    const d = this.d;
    $('dev-bar').hidden = !d.dev;
    document.body.classList.toggle('dev', d.dev);
    $('dev-auto').classList.toggle('on', !!d.autoplay);
    $('dev-hurt').classList.toggle('on', !!d.noHurt);
    $('dev-fast').classList.toggle('on', !!d.fast);
    $('menu-dev').classList.toggle('on', d.dev);
    $('menu-dev').textContent = d.dev ? 'player mode' : 'developer mode';
    if (!d.dev) $('dev-more-box').hidden = true;
  }

  frame() {
    if (!this.d.dev) return;
    const sc = this.d.scene?.sc;
    const g = this.game;
    const where = sc ? `${sc.id} · ${sc.kind} · ${sc.status ?? '?'}${sc.kind === 'world' && g.room ? ` · ${g.room.id}` : ''}` : g.room ? `${g.room.id} (no story)` : '—';
    if (where !== this.lastWhere) { this.lastWhere = where; $('dev-where').textContent = where; }
  }
}
