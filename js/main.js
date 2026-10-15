// main.js — 启动、输入、主循环
import * as THREE from 'three';
import { G, clamp } from './state.js';
import { buildWorld } from './world.js';
import { createPlayer } from './player.js';
import { createFather } from './father.js';
import { createAudio } from './audio.js';
import { createDV } from './dv.js';
import { createUI } from './ui.js';
import { createItems, loadSave, persist, PERM } from './items.js';
import { createScares } from './scares.js';
import { createGame } from './game.js';
import { createInteraction } from './interaction.js';
import { createPrologue } from './prologue.js';
import { createTutorial } from './tutorial.js';

const canvas = document.getElementById('game');

function init() {
  // --- 渲染 ---
  G.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  G.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  G.renderer.setSize(innerWidth, innerHeight);
  G.renderer.shadowMap.enabled = false;
  G.scene = new THREE.Scene();
  G.scene.background = new THREE.Color(0x080a10);
  G.scene.fog = new THREE.Fog(0x080a10, 14, 42);
  G.camera = new THREE.PerspectiveCamera(64, innerWidth / innerHeight, 0.05, 160);
  G.camera.rotation.order = 'YXZ';
  G.clock = new THREE.Clock();

  // --- 系统 ---
  loadSave();
  G.world = buildWorld();
  G.audio = createAudio();
  G.items = createItems();
  G.ui = createUI();
  G.dv = createDV();
  G.player = createPlayer();
  G.father = createFather();
  G.scares = createScares();
  G.game = createGame();
  G.interaction = createInteraction();
  G.prologue = createPrologue();
  G.tutorial = createTutorial();
  G.father.init();
  G.world.boyModel.group.visible = false;

  // 菜单镜头：屋外夜景
  G.state = 'menu';
  G.camera.position.set(6, 2.2, 14);
  G.camera.rotation.set(-0.05, Math.PI * 1.08, 0, 'YXZ');
  document.getElementById('loading').style.display = 'none';
  drawGearList();

  bindUI();
  bindInput();

  addEventListener('resize', () => {
    G.renderer.setSize(innerWidth, innerHeight);
    G.camera.aspect = innerWidth / innerHeight; G.camera.updateProjectionMatrix();
  });

  requestAnimationFrame(loop);
}

function drawGearList() {
  const box = document.getElementById('menuGear');
  const owned = Object.keys(PERM).filter(k => G.save.permGear[k]);
  const locked = Object.keys(PERM).filter(k => !G.save.permGear[k]);
  box.innerHTML =
    '<div style="color:#7ee27e;letter-spacing:3px;margin-bottom:8px">■ 已继承的装备</div>' +
    (owned.length ? owned.map(k => `<div class="gi">${PERM[k].name} — ${PERM[k].desc}</div>`).join('')
      : '<div style="color:#666">（还没有。它们在家里某个柜子的最底下。）</div>') +
    (locked.length ? '<div style="color:#555;margin-top:10px">未找到：' + locked.map(k => PERM[k].name).join(' · ') + '</div>' : '') +
    `<div style="color:#555;margin-top:10px">已玩 ${G.save.runs} 局　·　死亡 ${G.save.deaths} 次　·　结局 ${Object.keys(G.save.endings).length}/3</div>`;
  box.style.display = 'none';
}

function bindUI() {
  const el = id => document.getElementById(id);
  el('btnStart').onclick = () => {
    G.audio.init(); G.audio.uiClick();
    el('menu').style.display = 'none';
    G.prologue.start(() => { G.game.startRun(); requestLock(); });
  };
  el('skipBtn').onclick = () => { G.audio.uiClick(); if (G.state === 'prologue') G.prologue.skip(); };
  el('btnHow').onclick = () => { G.audio.uiClick(); const h = el('howBox'); h.style.display = h.style.display === 'none' ? 'block' : 'none'; };
  el('btnGear').onclick = () => { G.audio.uiClick(); const h = el('menuGear'); h.style.display = h.style.display === 'none' ? 'block' : 'none'; };
  el('btnResume').onclick = () => { G.audio.uiClick(); el('pause').style.display = 'none'; G.state = 'play'; requestLock(); };
  el('btnQuit').onclick = () => { G.audio.uiClick(); el('pause').style.display = 'none'; G.state = 'menu'; drawGearList(); el('menu').style.display = 'flex'; };
  el('btnAgain').onclick = () => { G.audio.uiClick(); G.ui.hideAllScreens(); G.dv.blackout(false, 0.4); G.game.startRun(); requestLock(); };
  el('btnTitle').onclick = () => { G.audio.uiClick(); G.ui.hideAllScreens(); G.state = 'menu'; drawGearList(); el('menu').style.display = 'flex'; };
  el('btnRetry').onclick = () => { G.audio.uiClick(); G.ui.hideAllScreens(); G.dv.blackout(false, 0.4); G.game.startRun(); requestLock(); };
  el('btnTitle2').onclick = () => { G.audio.uiClick(); G.ui.hideAllScreens(); G.state = 'menu'; drawGearList(); el('menu').style.display = 'flex'; };
  // 保险箱数字键盘（键盘输入）
  addEventListener('keydown', e => {
    const kp = el('keypad');
    if (kp.style.display === 'flex' && /^[0-9]$/.test(e.key)) {
      const btns = kp.querySelectorAll('.kpGrid button');
      for (const b of btns) if (b.textContent === e.key) { b.click(); break; }
    }
  });
}

function modalOpen() {
  const el = id => document.getElementById(id);
  return G.ui.noteOpen || el('keypad').style.display === 'flex' ||
    el('memoScreen').style.display === 'flex' || G.ui.choiceVisible() ||
    (el('endingScreen').style.display === 'flex') || (el('deathScreen').style.display === 'flex');
}

function requestLock() {
  if (G.state === 'play' || G.state === 'ending') canvas.requestPointerLock && canvas.requestPointerLock();
  if (!G.input.everLocked && !G._lockHinted) {
    G._lockHinted = true;
    setTimeout(() => {
      if (!document.pointerLockElement && G.state === 'play')
        G.ui.toast('提示：鼠标无法锁定时，按住左键拖拽即可转动视角', 5);
    }, 1500);
  }
}

function bindInput() {
  const keys = G.input.keys;
  addEventListener('keydown', e => {
    keys[e.code] = true;
    if (e.code === 'Tab') { e.preventDefault(); toggleMemo(); return; }
    if (e.code === 'Enter' && G.state === 'prologue') { G.prologue.skip(); return; }
    if (e.code === 'Escape') {
      if (G.state === 'play') {
        G.state = 'pause'; document.getElementById('pause').style.display = 'flex';
        document.exitPointerLock && document.exitPointerLock();
      } else if (G.state === 'pause') {
        document.getElementById('pause').style.display = 'none'; G.state = 'play'; requestLock();
      }
      return;
    }
    if (G.state !== 'play') return;
    if (e.code === 'KeyE') {
      if (G.ui.noteOpen) { G.ui.closeNote(); return; }
      if (G.ui.choiceVisible()) { document.getElementById('chYes').click(); return; }
      if (G.game.fatherFocus) { G.game.useFather(); return; }
      G.interaction.press();
    }
    if (e.code === 'KeyQ') { if (G.ui.choiceVisible()) document.getElementById('chNo').click(); }
    if (e.code === 'KeyF') G.dv.toggleNV();
    if (e.code === 'KeyR') {
      if (G.items.has('battery')) { G.items.remove('battery'); G.dv.addBattery(80); G.audio.pickup(); }
      else G.ui.toast('没有备用电池。');
    }
  });
  addEventListener('keyup', e => { keys[e.code] = false; if (e.code === 'KeyE') G.interaction.release(); });

  // 鼠标：优先指针锁定；若锁定不可用（例如内嵌预览窗口），退化为按住左键拖拽转视角
  let dragging = false, lastMX = 0, lastMY = 0;
  canvas.addEventListener('mousedown', e => {
    if (document.pointerLockElement === canvas) return;
    dragging = true; lastMX = e.clientX; lastMY = e.clientY;
  });
  addEventListener('mouseup', () => { dragging = false; });
  addEventListener('mouseleave', () => { dragging = false; });
  addEventListener('mousemove', e => {
    if (document.pointerLockElement === canvas) {
      G.input.mouseDX += e.movementX; G.input.mouseDY += e.movementY;
    } else if (dragging) {
      G.input.mouseDX += (e.clientX - lastMX);
      G.input.mouseDY += (e.clientY - lastMY);
      lastMX = e.clientX; lastMY = e.clientY;
    }
  });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('click', () => {
    G.audio.init();
    if ((G.state === 'play' || G.state === 'ending') && document.pointerLockElement !== canvas) requestLock();
  });
  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === canvas;
    G.input.locked = locked;
    if (locked) G.input.everLocked = true;
    // 只有「曾经锁定过、现在丢了」才算暂停；从未锁定成功（内嵌环境）不暂停
    if (!locked && G.input.everLocked && G.state === 'play') {
      G.state = 'pause'; document.getElementById('pause').style.display = 'flex';
    }
  });
}

function toggleMemo() {
  const m = document.getElementById('memoScreen');
  if (m.style.display === 'flex') { m.style.display = 'none'; return; }
  m.style.display = 'flex';
  document.getElementById('memoList').innerHTML = G.game.memoLines() || '<div>……什么都还没想明白。</div>';
}

let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  let dt = Math.min((now - last) / 1000, 0.05); last = now;
  const t = G.clock.getElapsedTime();
  const modal = modalOpen();

  if (G.state === 'menu') {
    // 屋外缓慢移动的空镜
    G.camera.position.set(6 + Math.sin(t * 0.09) * 3.2, 2.1 + Math.sin(t * 0.13) * 0.25, 14 + Math.cos(t * 0.07) * 1.6);
    G.camera.rotation.set(-0.04, Math.PI * 1.06 + Math.sin(t * 0.05) * 0.08, 0, 'YXZ');
  } else if (G.state === 'prologue') {
    G.prologue.update(dt, t);
    G.world.update(dt, t);
    G.father.update(dt, t);
  } else if (G.state === 'play' || G.state === 'ending') {
    if (!modal) {
      if (G.state === 'play' && (!G.run || G.run.frozen <= 0)) G.player.update(dt, t);
      else if (G.state === 'play') G.player.update(dt * 0.001, t);
      G.father.update(dt, t);
      G.scares.update(dt);
      if (G.state === 'play') G.interaction.update(dt);
      G.world.update(dt, t);
    }
    G.game.update(dt, t);
  } else if (G.state === 'pause' || G.state === 'dead') {
    G.world.update(dt * 0.2, t);
  }

  G.dv.update(dt, t);
  G.ui.update(dt);
  G.tutorial.update(dt);
  G.audio.update(dt);
  G.renderer.render(G.scene, G.camera);
}

init();
