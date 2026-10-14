// The Marble: the whole game on one screen, uncarved parts included.
//
// Timothy's words for the idea: the finished experience "encased in marble", so the
// work is chipping it out rather than building from nothing. This view is the
// block of marble: every scene in story/, act by act, each a block as wide as its
// minutes, drawn by how carved it is:
//
//   idea         dashed outline, faint      named and placed, nothing to play
//   placeholder  thin outline               a slate that says what goes here
//   rough        hatched                    a playable rough draft
//   playable     bold outline               the real mechanic, unpolished
//   final        solid white                done
//
// Its totals measure the game against the 3 to 5 hours it is meant to last. Tap a
// block for its brief and notes, and play from there as a player would.
//
// In player mode the same view is the chapter list: only scenes you have seen are
// named, and you can replay from any of them. Nothing replayed is saved.

import { STATUSES } from './outline.js';
import { Progress } from '../core/progress.js';
import { KIND_GLYPH, KIND_NAME, fmtMinutes } from './scenes.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const STATUS_WORD = {
  idea: 'an idea: named and placed, nothing to play yet',
  placeholder: 'a placeholder: a slate or stand-in that says what goes here',
  rough: 'a rough draft: playable, sketched, first words',
  playable: 'playable: the real mechanic, unpolished',
  final: 'final',
};

export class Marble {
  constructor(director, { onClose, onPlay } = {}) {
    this.d = director;
    this.onClose = onClose;
    this.onPlay = onPlay;
    this.dev = false;
    this.selected = null;
    $('marble-close').addEventListener('click', () => this.close());
    $('marble').addEventListener('click', (e) => { if (e.target === $('marble')) this.close(); });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.isOpen) { e.stopPropagation(); this.close(); } }, true);
  }

  get isOpen() { return !$('marble').hidden; }

  open({ dev = this.d.dev } = {}) {
    this.dev = dev;
    this.selected = this.dev ? (this.d.story.scene ?? null) : null;
    this.saved = Progress.saved();
    this.render();
    $('marble').hidden = false;
    // Open where you are.
    $('marble-acts').querySelector('.blk.here')?.scrollIntoView({ block: 'center' });
  }

  close() {
    $('marble').hidden = true;
    this.onClose?.();
  }

  // Seen in this game, or in the saved one (a replay carries only a kit).
  seen(id) { return this.d.story.seen.includes(id) || !!this.saved?.story?.seen?.includes(id); }

  render() {
    const o = this.d.outline;
    const m = o.minutes();
    const dev = this.dev;
    $('marble').classList.toggle('player', !dev);
    $('marble-title').textContent = dev ? 'The Marble' : 'Chapters';
    const [lo, hi] = o.target.minutes ?? [180, 300];
    $('marble-sub').textContent = dev
      ? `${o.title}: ${o.order.length} scenes, about ${fmtMinutes(m.total)} (aim ${fmtMinutes(lo)} to ${fmtMinutes(hi)}). ${fmtMinutes(m.built)} carved, ${fmtMinutes(m.rough)} roughed out.`
      : 'Every chapter you have reached. Replay from any of them (nothing replayed is saved).';

    // The target: how long the game is now, against how long it should be.
    const tgt = $('marble-target');
    tgt.hidden = !dev;
    if (dev) {
      const max = Math.max(hi * 1.15, m.total * 1.05);
      const pct = (v) => `${(v / max) * 100}%`;
      tgt.innerHTML = `
        <div class="mt-bar">
          <span class="mt-band" style="left:${pct(lo)};width:${pct(hi - lo)}" title="the target: 3 to 5 hours"></span>
          <span class="mt-fill built" style="width:${pct(m.built)}"></span>
          <span class="mt-fill rough" style="left:${pct(m.built)};width:${pct(m.rough)}"></span>
          <span class="mt-fill rest" style="left:${pct(m.built + m.rough)};width:${pct(m.total - m.built - m.rough)}"></span>
          <span class="mt-mark" style="left:${pct(m.total)}"></span>
        </div>
        <div class="mt-scale"><span>0</span><span style="left:${pct(lo)}">3h</span><span style="left:${pct(hi)}">5h</span></div>`;
      $('marble-legend').innerHTML = STATUSES.map(s => `<span class="blk st-${s}" title="${esc(STATUS_WORD[s])}">${s}</span>`).join('')
        + `<span class="legend-kinds">${Object.entries(KIND_GLYPH).map(([k, g]) => `<span title="${esc(KIND_NAME[k])}">${g} ${k}</span>`).join(' ')}</span>`;
    } else $('marble-legend').innerHTML = '';

    // The acts, each a row of blocks.
    const acts = $('marble-acts');
    acts.innerHTML = '';
    for (const act of o.acts) {
      const sec = document.createElement('section');
      sec.className = 'm-act';
      const am = m.acts[act.id];
      const anySeen = (act.scenes ?? []).some(sc => this.seen(sc.id));
      sec.innerHTML = `<h3>${esc(dev || anySeen ? act.name : '· · ·')}${act.subtitle && (dev || anySeen) ? ` <small>${esc(act.subtitle)}</small>` : ''}${dev ? `<span class="m-min">${fmtMinutes(am.total)}</span>` : ''}</h3>`;
      if (dev && act.brief) sec.insertAdjacentHTML('beforeend', `<p class="m-brief">${esc(act.brief)}</p>`);
      const row = document.createElement('div');
      row.className = 'm-row';
      for (const sc of act.scenes ?? []) {
        const known = dev || this.seen(sc.id);
        const b = document.createElement('button');
        b.className = `blk st-${dev ? sc.status : known ? 'seen' : 'unseen'} k-${sc.kind}${this.selected === sc.id ? ' on' : ''}${this.d.story.scene === sc.id ? ' here' : ''}`;
        const mins = Number(sc.minutes) || 0;
        b.style.flexBasis = `${Math.round(30 + Math.sqrt(mins) * 34)}px`;
        b.innerHTML = known ? `<i>${KIND_GLYPH[sc.kind] ?? '?'}</i><span>${esc(sc.title ?? sc.id)}</span>${dev && mins >= 3 ? `<em>${fmtMinutes(mins)}</em>` : ''}` : '<span>· · ·</span>';
        b.disabled = !known;
        b.title = known ? `${sc.title} (${sc.kind}${dev ? `, ${sc.status}, ${fmtMinutes(mins)}` : ''})` : 'not reached yet';
        b.addEventListener('click', () => { this.selected = sc.id; this.render(); this.detail(); });
        row.appendChild(b);
      }
      sec.appendChild(row);
      acts.appendChild(sec);
    }

    const probs = dev ? o.problems() : [];
    $('marble-problems').innerHTML = probs.length ? `<h3>Loose ends</h3><ul>${probs.map(p => `<li>${esc(p)}</li>`).join('')}</ul>` : '';
    this.detail();
  }

  detail() {
    const box = $('marble-detail');
    const sc = this.selected && this.d.outline.scene(this.selected);
    if (!sc) { box.hidden = true; return; }
    box.hidden = false;
    const dev = this.dev;
    const act = this.d.outline.actOf(sc.id);
    const leads = this.d.outline.links(sc).map(id => this.d.outline.scene(id)?.title ?? id);
    const trig = this.d.outline.triggers.filter(t => t.play === sc.id)
      .map(t => `${t.on}${t.room ? ` ${t.room}` : ''}${t.area ? ` area ${t.area}` : ''}${t.from ? ` ${t.from} → ${t.to}` : ''}`);
    const stand = sc.standIn ?? (sc.kind === 'world' ? sc : null);
    box.innerHTML = `
      <h3>${esc(sc.title ?? sc.id)}</h3>
      <p class="md-meta">${esc(KIND_NAME[sc.kind] ?? sc.kind)}${dev ? ` · <b class="st-word st-${sc.status}">${esc(sc.status)}</b> · ${fmtMinutes(sc.minutes)} · <code>${esc(sc.id)}</code>` : ''} · ${esc(act?.name ?? '')}</p>
      ${dev && sc.brief ? `<p>${esc(sc.brief)}</p>` : ''}
      ${dev && sc.notes?.length ? `<ul class="md-notes">${sc.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
      ${dev && stand?.room ? `<p class="md-small">rooms: <code>${esc(stand.world ?? 'castle')}/${esc(stand.room)}</code>${sc.standInRooms ? `, stand-ins: ${sc.standInRooms.map(esc).join(', ')}` : ''}</p>` : ''}
      ${dev && trig.length ? `<p class="md-small">played when: ${trig.map(esc).join('; ')}</p>` : ''}
      ${dev && leads.length ? `<p class="md-small">leads to: ${leads.map(esc).join(', ')}${sc.then === 'return' ? ' (back to where it interrupted)' : ''}</p>` : ''}
      <div class="md-actions">
        <button class="chip primary" data-act="play">play from here</button>
        ${dev && sc.kind === 'rhythm' && sc.ends ? '<button class="chip" data-act="reverse">ride it backwards</button>' : ''}
      </div>`;
    box.querySelector('[data-act="play"]').addEventListener('click', () => { this.close(); this.onPlay?.(sc.id, {}); });
    box.querySelector('[data-act="reverse"]')?.addEventListener('click', () => { this.close(); this.onPlay?.(sc.id, { reverse: true }); });
  }
}
