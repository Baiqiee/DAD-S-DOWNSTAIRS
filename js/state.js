// state.js — 全局游戏上下文
export const G = {
  // three core
  scene: null, camera: null, renderer: null, clock: null,
  // systems
  world: null, player: null, father: null, dv: null, ui: null, audio: null, scares: null, game: null,
  // flow
  state: 'loading',   // loading / menu / prologue / play / pause / keypad / memo / choice / caught / ending / dead
  input: { keys:{}, mouseDX:0, mouseDY:0, locked:false },
  run: null,          // 本局数据（game.js 每次 startRun 重建）
  save: null,         // 永久存档（localStorage）
};

// 发出噪音：pos=THREE.Vector3, loud=可听半径(米)
G.emitNoise = function (pos, loud, kind = 'step') {
  if (G.father && G.state === 'play') G.father.hear(pos, loud, kind);
};

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const rand = (a, b) => a + Math.random() * (b - a);
export const randi = (a, b) => Math.floor(rand(a, b + 1));
export const pick = arr => arr[Math.floor(Math.random() * arr.length)];
export const dist2D = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
