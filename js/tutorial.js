// tutorial.js — 新手引导：分步目标 + 操作提示条 + 目标方位指示箭头
import * as THREE from 'three';
import { G, clamp } from './state.js';

const STEPS = [
  {
    id: 'lock',
    text: '门被他从外面锁上了。走到门前，<b>长按 E</b> 慢慢转动旧锁——会很响，但这是唯一的路。',
    done: r => r.leftRoom,
  },
  {
    id: 'search',
    text: '屋里的<b>柜子、抽屉、桌子、箱子</b>都能翻。走到跟前<b>按 E</b> 搜刮，会发出声音，他听得见。',
    done: r => r.searchedCount >= 1,
  },
  {
    id: 'move',
    text: '默认是走路。<b>按住 Shift 跑步</b>（快，但非常响）；<b>按 C 蹲下</b>（慢，几乎没声音）。他靠声音找你。',
    done: (r, T) => (T.flags.ran && T.flags.crouched) || T.stepT > 28,
  },
  {
    id: 'route',
    text: '逃出去有三条路：<br>① <b>大门线</b>：找书房钥匙 → 保险箱（密码是母亲的忌日）→ 大门钥匙<br>' +
      '② <b>电话线</b>：找到听筒线接上 + 用螺丝刀修好地下室接线盒 → 拨打 911<br>③ 某个柜子的最深处……',
    done: r => r.sawCard || r.phoneAttached || r.junctionFixed || r.diaryFound,
  },
  {
    id: 'hide',
    text: '他开始找你了。躲进<b>衣柜 / 床底 / 壁柜</b>（按 E 进去，再按 E 出来），等他走开。',
    done: (r, T) => T.flags.hid || T.stepT > 30,
  },
  {
    id: 'battery',
    text: '电池在掉。<b>F</b> 开夜视看得更清但更耗电，<b>R</b> 换备用电池，<b>Tab</b> 看备忘和进度。',
    done: (r, T) => T.stepT > 12,
  },
];

export function createTutorial() {
  const T = { steps: STEPS, idx: 0, stepT: 0, flags: {}, hintT: 0, doneAll: false };
  const el = id => document.getElementById(id);
  const v = new THREE.Vector3();

  T.reset = function () {
    T.idx = 0; T.stepT = 0; T.flags = {}; T.doneAll = false;
    T.hintT = G.save.runs <= 2 ? 40 : 16;      // 前几天多提示一会
    el('guideBox').style.display = 'block';
    el('keyhint').style.display = 'block';
    el('keyhint').innerHTML =
      '<b>WASD</b> 移动　<b>鼠标</b>（或按住左键拖拽）视角　<b>E</b> 互动/长按　' +
      '<b>Shift</b> 跑　<b>C</b> 蹲　<b>F</b> 夜视　<b>R</b> 换电池　<b>Tab</b> 备忘';
    paint();
  };

  T.hide = function () {
    el('guideBox').style.display = 'none';
    el('keyhint').style.display = 'none';
    el('navArrow').style.display = 'none';
  };

  function paint() {
    if (T.doneAll) { el('guideBox').style.display = 'none'; return; }
    const s = STEPS[T.idx];
    el('guideStep').innerHTML = s ? s.text : '';
  }

  // 当前目标物（用于方位箭头）
  function navTarget() {
    const r = G.run; if (!r || !G.world) return null;
    const w = G.world;
    if (r.ending || r.calling || r.fatherAsleep) return null;
    if (!r.leftRoom) return w.doors.myroom.group.position;
    if (G.items.has('frontKey')) return w.doors.front.group.position;
    if (r.junctionFixed && r.phoneAttached) return w.meshes.phone.position;
    if (G.items.has('screwdriver') && !r.junctionFixed) return w.meshes.junction.position;
    if (r.sawCard && !r.safeOpen) return w.meshes.safe.position;
    if (G.items.has('studyKey')) return w.doors.study.locked ? w.doors.study.group.position : w.meshes.safe.position;
    // 默认：指向最近的、还没搜过的容器
    let best = null, bd = 1e9;
    for (const c of w.containers) {
      if (c.searched) continue;
      const d = c.mesh.position.distanceTo(G.player.pos);
      if (d < bd) { bd = d; best = c.mesh.position; }
    }
    return best;
  }

  function updateNav() {
    const box = el('navArrow');
    const tgt = navTarget();
    if (!tgt || !G.camera) { box.style.display = 'none'; return; }
    v.set(tgt.x, tgt.y + 1.0, tgt.z);
    const dist = v.distanceTo(G.camera.position);
    v.project(G.camera);
    const behind = v.z > 1;
    let sx = (v.x * 0.5 + 0.5) * innerWidth;
    let sy = (-v.y * 0.5 + 0.5) * innerHeight;
    if (behind) { sx = innerWidth - sx; sy = innerHeight - sy; }
    const cx = innerWidth / 2, cy = innerHeight / 2;
    if (!behind && dist < 2.2) { box.style.display = 'none'; return; }
    let dx = sx - cx, dy = sy - cy;
    const len = Math.hypot(dx, dy) || 1;
    const maxR = Math.min(innerWidth, innerHeight) * 0.40;
    const k = Math.min(len, maxR) / len;
    box.style.display = 'block';
    box.style.left = (cx + dx * k) + 'px';
    box.style.top = (cy + dy * k) + 'px';
    el('navArrowGlyph').style.transform = 'rotate(' + (Math.atan2(dy, dx) * 180 / Math.PI + 90) + 'deg)';
    el('navDist').textContent = dist.toFixed(1) + 'm';
  }

  T.update = function (dt) {
    if (G.state !== 'play' || !G.run) { T.hide(); return; }
    if (G.ui && (G.ui.noteOpen || G.ui.choiceVisible())) { el('navArrow').style.display = 'none'; return; }

    // 操作提示条
    if (T.hintT > 0) {
      T.hintT -= dt;
      if (T.hintT <= 0) el('keyhint').style.display = 'none';
    }

    // 玩家行为标记（用于判断引导步骤是否做到过）
    const p = G.player;
    const moving = !!(G.input.keys.KeyW || G.input.keys.KeyS || G.input.keys.KeyA || G.input.keys.KeyD);
    if (p.running && moving) T.flags.ran = true;
    if (p.crouch && moving) T.flags.crouched = true;
    if (p.hidden) T.flags.hid = true;

    // 分步引导
    T.stepT += dt;
    if (!T.doneAll) {
      const s = STEPS[T.idx];
      if (s && s.done(G.run, T)) {
        T.idx++; T.stepT = 0;
        if (T.idx >= STEPS.length) { T.doneAll = true; el('guideBox').style.display = 'none'; }
        else { paint(); G.ui.toast('✔ ' + ['锁开了', '搜到东西了', '记住：跑得快=被听见', '路找到了', '会躲了', ''][T.idx - 1] || '好', 2.6); }
      }
    }

    updateNav();
  };

  // 备忘里也列一遍引导
  T.memoExtra = function () {
    if (T.doneAll || !STEPS[T.idx]) return '';
    return '<div class="done" style="color:#ffd24a">■ 引导：' + STEPS[T.idx].text.replace(/<br>/g, '　') + '</div>';
  };

  return T;
}
