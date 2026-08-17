// Wing palettes. Not the final art — placeholders that keep the four wings
// readable at a glance while prototyping. GDD §10: brass = gold metal,
// woodwind = black wood, strings = brown wood, percussion = mixed.

const BASE = {
  parchment:  '#e8dcc0',
  parchment2: '#ddcfae',
  staff:      '#c3b492',
  ink:        '#3a3226',
  stone:      '#8b8069',
  accent:     '#6b5b3e',
  wood:       '#7a5433',
  key:        '#f3ecd8',
  skin:       '#d9c6a3',
};

const WINGS = {
  brass: {
    ...BASE,
    metal: '#b8862b', metalHi: '#e0b44e', hot: '#ffd97a',
    wall: '#5d5342', wallEdge: '#6f6350', wallLine: '#4a4234',
    door: '#8a6a2e', doorOpen: '#c9b98a',
    accent: '#b8862b',
  },
  woodwind: {
    ...BASE,
    metal: '#3a3630', metalHi: '#6e6558', hot: '#a7d08c',
    wall: '#3f4a3c', wallEdge: '#4d5a48', wallLine: '#333c31',
    door: '#4c5a44', doorOpen: '#9fb392',
    accent: '#7fa46a',
  },
  strings: {
    ...BASE,
    metal: '#8a5a32', metalHi: '#c08a52', hot: '#f0b878',
    wall: '#584434', wallEdge: '#6a5340', wallLine: '#463629',
    door: '#7a5433', doorOpen: '#c2a682',
    accent: '#a1683a',
  },
  percussion: {
    ...BASE,
    metal: '#6b6b74', metalHi: '#9a9aa6', hot: '#cfd2ff',
    wall: '#4a4750', wallEdge: '#5a5763', wallLine: '#3b3942',
    door: '#5c5866', doorOpen: '#a8a4b4',
    accent: '#8b86a0',
  },
  keys: {
    ...BASE,
    metal: '#4a4238', metalHi: '#b9ab8e', hot: '#ffe9a8',
    wall: '#514738', wallEdge: '#635744', wallLine: '#40382c',
    door: '#6b5b3e', doorOpen: '#c3b492',
    accent: '#8a7550',
  },
};

export const PALETTE = {
  base: BASE,
  wing(name) { return WINGS[name] ?? WINGS.brass; },
  wings: Object.keys(WINGS),
};
