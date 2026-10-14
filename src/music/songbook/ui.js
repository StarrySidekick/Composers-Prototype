// Small DOM helpers for the songbook, and the two things a page does differently
// on claude.ai: handing over a file, and copying text.

import { storeZip } from '../zip.js';

// h('button', { class: 'x', onclick }, 'label', child, ...)
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && k !== 'list' && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : String(kid));
  return el;
}

export function options(select, list, value) {
  select.replaceChildren(...list.map(([v, label]) => h('option', { value: String(v) }, label)));
  if (value != null) select.value = String(value);
  return select;
}

let toastTimer;
export function toast(msg) {
  let el = document.querySelector('.toast');
  if (!el) { el = h('div', { class: 'toast', role: 'status' }); document.body.append(el); }
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
}

// Copy, or failing that, put the text where it can be selected by hand.
export async function copyText(text, show) {
  show?.(text);
  try { await navigator.clipboard.writeText(text); toast('Copied'); return true; }
  catch { toast('Select the text below to copy it'); return false; }
}

// Hand a file over. On claude.ai the page cannot start a download itself and
// only some types are allowed (not .mid), so it is zipped and offered through
// the `downloads` capability; served from the repo, a plain download.
export async function saveFile(name, bytes) {
  const inArtifact = !!window.claude?.use;
  if (inArtifact) {
    const dl = await window.claude.use('downloads').catch(() => null);
    if (!dl) { toast('Saving files is not available here'); return false; }
    try {
      await dl.save({ filename: name.replace(/\.[^.]+$/, '') + '.zip', data: storeZip([{ name, bytes }]) });
      return true;
    } catch (e) {
      if (e?.code !== 'declined') toast('Could not save the file');
      return false;
    }
  }
  const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/midi' }));
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return true;
}

// A two-step delete: the first press asks, the second does it. (confirm() does
// not exist on claude.ai.)
export function confirmButton(label, ask, onYes) {
  const btn = h('button', { class: 'quiet', type: 'button' }, label);
  btn.addEventListener('click', () => {
    const box = h('span', { class: 'confirm' }, ask,
      h('button', { type: 'button', onclick: () => { box.replaceWith(btn); onYes(); } }, 'Yes'),
      h('button', { type: 'button', class: 'quiet', onclick: () => box.replaceWith(btn) }, 'No'));
    btn.replaceWith(box);
  });
  return btn;
}
