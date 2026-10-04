// The square stage, as big as the screen allows.
//
// The stage is always square (rooms are square), so its size is one number: the
// smaller of the play column's width and the height left after the two status bars
// and, on an upright phone, room for the controls underneath. On an upright phone
// that makes it exactly the screen's width, edge to edge. Written to the CSS
// variable --stage, which the stage and both status bars read.

const TOUCH = window.matchMedia('(max-width: 860px), (pointer: coarse)');
const CONTROLS_ROOM = 220;   // px kept under the stage for the pad and shoulders, upright phones only

export function fitStage(renderer, game) {
  const play = document.getElementById('play');
  const top = document.getElementById('hud-top').offsetHeight;
  const bottom = document.getElementById('hud-bottom').offsetHeight;
  const help = document.querySelector('.keys-help');
  // The text box's slot under the bottom bar is always kept, so the stage does
  // not jump when a message comes and goes.
  const slot = document.getElementById('dialog-slot');
  const slotH = slot ? slot.offsetHeight + 6 : 0;
  const helpH = help && help.offsetParent ? help.offsetHeight + 8 : 0;
  const upright = window.innerHeight > window.innerWidth;
  const reserve = TOUCH.matches && upright ? CONTROLS_ROOM : 0;
  const cs = getComputedStyle(play);
  const padTop = parseFloat(cs.paddingTop) || 0;
  const w = play.clientWidth;
  const h = play.clientHeight - padTop - top - bottom - slotH - helpH - reserve;
  const size = Math.max(160, Math.floor(Math.min(w, h)));
  document.documentElement.style.setProperty('--stage', `${size}px`);
  if (game.room) renderer.resize(game.room);
  return size;
}

export const isTouch = () => TOUCH.matches;
