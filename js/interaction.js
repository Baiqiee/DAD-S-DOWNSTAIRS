// interaction.js — 射线交互（开门 / 翻柜 / 电话 / 保险箱 …）
import * as THREE from 'three';
import { G } from './state.js';

const REACH = 2.7;

export function createInteraction() {
  const ray = new THREE.Raycaster();
  const center = new THREE.Vector2(0, 0);
  const sys = {
    current: null, hold: 0, holdTarget: 0, holding: false,
  };

  function findTarget() {
    ray.setFromCamera(center, G.camera);
    ray.far = REACH;
    const hits = ray.intersectObjects(G.scene.children, true);
    for (const h of hits) {
      let o = h.object;
      while (o) { if (o.userData && o.userData.interactable) return { it: o.userData.interactable, dist: h.distance }; o = o.parent; }
    }
    return null;
  }

  // 支持动态 hold（函数形式，供门/保险箱按状态变化）
  const holdOf = (it) => (typeof it.hold === 'function' ? it.hold() : (it.hold || 0));

  sys.update = function (dt) {
    if (G.state !== 'play') { G.ui.setPrompt(''); sys.current = null; sys.holding = false; return; }
    if (G.player.hidden) {
      const it = G.world.interactables.find(i => i.mesh === G.player.hidden);
      if (it) { sys.current = it; G.ui.setPrompt(it.getPrompt()); } else G.ui.setPrompt('');
      return;
    }
    const t = findTarget();
    const it = t ? t.it : null;
    if (it !== sys.current) { sys.current = it; sys.hold = 0; sys.holding = false; G.ui.setHoldRing(0); }
    if (!it) { G.ui.setPrompt(''); sys.hold = 0; sys.holding = false; G.ui.setHoldRing(0); return; }
    const txt = it.getPrompt();
    G.ui.setPrompt(txt);
    if (holdOf(it) > 0) {
      if (sys.holding) {
        sys.hold += dt;
        G.ui.setHoldRing(Math.min(1, sys.hold / holdOf(it)));
        if (sys.hold >= holdOf(it)) { sys.hold = 0; sys.holding = false; G.ui.setHoldRing(0); it.use(true); }
      }
    }
  };

  sys.press = function () {
    if (!sys.current || G.state !== 'play') return;
    if (holdOf(sys.current) > 0) { sys.holding = true; sys.hold = 0; }
    else sys.current.use(false);
  };
  sys.release = function () {
    if (sys.holding) { sys.holding = false; sys.hold = 0; G.ui.setHoldRing(0); }
  };
  sys.currentItem = () => sys.current;
  return sys;
}
