// father.js — 父亲 AI：巡逻 + 听声辨位 + 视线 + 阶段演进 + 追捕/搜柜
import * as THREE from 'three';
import { G, clamp, rand, pick, randi } from './state.js';

const PHASE = [
  { name: '慵懒', speed: 1.15, chase: 2.55, sight: 8.0, hearMul: 0.75, checkHide: 0.06, patrolGap: [6, 11] },
  { name: '起疑', speed: 1.95, chase: 3.05, sight: 11.5, hearMul: 1.0, checkHide: 0.28, patrolGap: [3, 6] },
  { name: '暴怒', speed: 2.9, chase: 3.45, sight: 14.5, hearMul: 1.25, checkHide: 0.62, patrolGap: [1.5, 3.5] },
];

const LINES = {
  sit: ['Boy! Get back in that room!', 'You better be asleep in there.', 'Stop wandering around, I hear you.'],
  patrol1: ['I know you\'re out of that room.', 'Where the hell are you...', 'You think you\'re clever, don\'t you.'],
  patrol2: ['Come out. Now.', 'Every door in this house is mine.', 'You can\'t leave. You hear me? You can\'t.'],
  hear: ['What was that?', 'I heard something.', '...boy?'],
  chase: ['GET BACK HERE!', 'You little shit, come here!', 'I\'m going to break your legs.'],
  search: ['Where are you hiding...', 'Come out, come out, wherever you are.', 'I\'ll find you. I always do.'],
  tv: ['Who turned off my goddamn TV?!', 'Don\'t touch my things.'],
  lose: ['...where did you go?', 'Fine. Hide. You\'ll come out eventually.'],
  drink: ['Another one...', 'Pour me a glass, would ya... nobody listens to me anymore.'],
};

export function createFather() {
  const f = {
    group: null, pos: new THREE.Vector3(-4.9, 0, 2.5), yaw: 0,
    state: 'sit', phase: 0, path: [], node: null, target: null,
    speed: 0, speedMul: 1, walkT: 0, stuckT: 0,
    lastSeen: new THREE.Vector3(), loseT: 0, seeT: 0,
    voiceCD: 0, stateT: 0, patrolT: 0, searchSpot: null,
    asleep: false, drinking: false, angryExtra: 0, tvTrip: false,
    searchRoom: null, visited: {}, lastRoom: 'living',
  };

  const tmp = new THREE.Vector3();

  f.init = function () {
    f.group = G.world.fatherModel.group;
    f.node = G.world.nodeById.armchair;
    f.pos.set(f.node.x, 0, f.node.z);
    f.yaw = Math.PI * 0.15;
    f.reset(true);
  };

  f.reset = function (hard) {
    f.state = 'sit'; f.phase = 0; f.path = []; f.asleep = false; f.drinking = false;
    f.angryExtra = 0; f.tvTrip = false; f.visited = {}; f.patrolT = rand(3, 6);
    f.node = G.world.nodeById.armchair;
    f.pos.set(-4.9, 0, 2.5); f.yaw = Math.PI * 0.15;
    if (hard) f.lastRoom = 'living';
  };

  f.setPhase = function (p) { f.phase = clamp(p, 0, 2); };
  f.cfg = () => PHASE[f.phase];

  f.room = () => G.world.roomAt(f.pos.x, f.pos.z, f.pos.y);

  // ---------- 路径 ----------
  function nearestNode(p) {
    let best = null, bd = 1e9;
    for (const n of G.world.nodes) {
      const dy = Math.abs((n.y === null ? 0 : n.y) - p.y);
      const d = Math.hypot(n.x - p.x, n.z - p.z) + dy * 2.5;
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }
  function bfs(from, to, forbid) {
    if (from === to) return [to];
    const prev = new Map(); const q = [from]; prev.set(from, null);
    while (q.length) {
      const cur = q.shift();
      if (cur === to) break;
      for (const nx of cur.links) {
        if (prev.has(nx)) continue;
        if (forbid && forbid(nx)) continue;
        prev.set(nx, cur); q.push(nx);
      }
    }
    if (!prev.has(to)) return null;
    const path = []; let c = to;
    while (c) { path.unshift(c); c = prev.get(c); }
    return path;
  }
  f.goto = function (nodeOrPos, forbid) {
    const target = nodeOrPos.links ? nodeOrPos : nearestNode(nodeOrPos);
    const from = f.node || nearestNode(f.pos);
    const p = bfs(from, target, forbid);
    if (p && p.length) { f.path = p.slice(1); return true; }
    return false;
  };
  f.gotoRoom = function (roomId, avoidRoom) {
    const cands = G.world.nodes.filter(n => n.room === roomId && (!avoidRoom || n.room !== avoidRoom));
    if (!cands.length) return false;
    return f.goto(pick(cands));
  };

  // ---------- 感知 ----------
  f.canSee = function () {
    const p = G.player;
    if (p.hidden) return false;
    const d = Math.hypot(p.pos.x - f.pos.x, p.pos.z - f.pos.z);
    const dy = Math.abs(p.pos.y - f.pos.y);
    if (dy > 2.6 || d > f.cfg().sight) return false;
    // 视野角度
    const fx = Math.sin(f.yaw), fz = Math.cos(f.yaw);
    const dx = (p.pos.x - f.pos.x) / (d + 0.001), dz = (p.pos.z - f.pos.z) / (d + 0.001);
    const dot = fx * dz + fz * dx;      // 与朝向点积
    if (dot < 0.32 && d > 3.5) return false;  // 背后 & 不近
    // 遮挡
    const a = new THREE.Vector3(f.pos.x, f.pos.y + 1.7, f.pos.z);
    const b = new THREE.Vector3(p.pos.x, p.pos.y + 1.5, p.pos.z);
    if (G.world.lineBlocked(a, b)) return false;
    let range = 1;
    if (p.crouch) range *= 0.62;
    if (p.running) range *= 1.2;    // 跑步更容易被看到
    const roomLight = G.world.roomAt(p.pos.x, p.pos.z, p.pos.y);
    if (['parents', 'bath', 'storage', 'basement'].indexOf(roomLight.id) >= 0) range *= 0.72;
    return d <= f.cfg().sight * range;
  };

  f.hear = function (pos, loud, kind) {
    if (f.asleep || G.state !== 'play') return;
    const d = Math.hypot(pos.x - f.pos.x, pos.z - f.pos.z) + Math.abs(pos.y - f.pos.y) * 1.2;
    const r = loud * f.cfg().hearMul * (f.phase === 0 ? 0.85 : 1);
    if (d > r) return;
    if (f.state === 'chase') return;
    const p = new THREE.Vector3(pos.x, pos.y, pos.z);
    f.target = p; f.lastNoiseKind = kind;
    if (f.state !== 'investigate' || Math.random() < 0.6) {
      f.node = nearestNode(f.pos);
      const n = nearestNode(p);
      if (f.goto(n)) { f.state = 'investigate'; f.stateT = 0; f.say('hear'); }
    }
  };

  f.say = function (key) {
    if (f.voiceCD > 0 || G.state !== 'play') return;
    const arr = LINES[key]; if (!arr) return;
    const en = pick(arr);
    const cn = {
      sit: ['小子！滚回你房间去！', '你最好已经睡下了。', '别在屋里乱晃，我听得见。'],
      patrol1: ['我知道你不在房间里了。', '你到底躲哪儿去了……', '你觉得自己挺聪明，是吧。'],
      patrol2: ['出来。现在。', '这栋房子里每一扇门都是我的。', '你走不掉。听见没有？你走不掉。'],
      hear: ['什么声音？', '我听见了。', '……小子？'],
      chase: ['给我滚回来！', '你这个小杂种，给我过来！', '我要打断你的腿。'],
      search: ['你藏哪儿了……', '出来吧，出来吧，我找到你了。', '我会找到你的。一直都是。'],
      tv: ['谁他妈关了我的电视？！', '别碰我的东西。'],
      lose: ['……跑哪儿去了？', '行，躲着吧。你总会出来的。'],
      drink: ['再来一杯……', '给我倒一杯啊……这个家没一个听我说话的。'],
    }[key] || [''];
    f.voiceCD = rand(9, 16);
    G.audio.speak(en, { pitch: 0.55, rate: 0.88, vol: 0.9 });
    G.ui.say('父亲', pick(cn), 3.2);
  };

  // ---------- 状态机 ----------
  function startPatrol() {
    const cfg = f.cfg();
    let target = null;
    if (f.phase === 0) {
      const r = Math.random();
      if (r < 0.5) target = G.world.nodeById.armchair;
      else if (r < 0.72) target = G.world.nodeById.fridge;
      else if (r < 0.88) target = G.world.nodeById.livingC;
      else target = G.world.nodeById.hallFront;
    } else if (f.phase === 1) {
      const rooms = ['living', 'kitchen', 'hall', 'dining', 'uphall', 'study', 'myroom'];
      const r = pick(rooms);
      if (!f.gotoRoom(r)) f.goto(G.world.nodeById.livingC);
      return;
    } else {
      // 系统性搜屋：优先没去过的房间
      const rooms = ['living', 'kitchen', 'dining', 'study', 'hall', 'utility', 'basement', 'uphall', 'myroom', 'parents', 'bath', 'storage'];
      const un = rooms.filter(r => !f.visited[r]);
      const r = un.length ? pick(un) : pick(rooms);
      f.visited[r] = true; f.searchRoom = r;
      if (!f.gotoRoom(r)) f.goto(G.world.nodeById.livingC);
      return;
    }
    if (target && f.goto(target)) { f.state = 'patrol'; f.stateT = 0; }
    else { f.state = 'patrol'; f.patrolT = rand(1, 2); }
  }

  function moveAlong(dt) {
    const cfg = f.cfg();
    let sp = (f.state === 'chase' ? cfg.chase : cfg.speed) * f.speedMul;
    if (f.path.length) {
      const n = f.path[0];
      const tx = n.x, tz = n.z, ty = (n.y === null ? G.world.groundY(n.x, n.z, f.pos.y) : n.y);
      const dx = tx - f.pos.x, dz = tz - f.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.36) {
        f.node = n; f.path.shift(); f.segNode = null;
        if (!f.path.length) { f.stateT = 0; arrive(); }
        return;
      }
      // 记录这一段路的起点高度，沿路段线性插值——上/下楼梯时脚会踩在台阶上，不会穿模
      if (f.segNode !== n) { f.segNode = n; f.segY0 = f.pos.y; f.segLen = Math.max(0.001, d); }
      const step = Math.min(sp * dt, d);
      f.pos.x += dx / d * step; f.pos.z += dz / d * step;
      const prog = clamp(1 - Math.hypot(tx - f.pos.x, tz - f.pos.z) / f.segLen, 0, 1);
      const wantY = f.segY0 + (ty - f.segY0) * prog;
      f.pos.y += (wantY - f.pos.y) * Math.min(1, dt * 12);
      if (Math.abs(f.pos.y - wantY) > 0.9) f.pos.y = wantY;
      const want = Math.atan2(dx, dz);
      let diff = ((want - f.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      f.yaw += diff * Math.min(1, dt * 6);
      f.walkT += dt * sp * 2.4;
      f.stuckT = 0;
      // 父亲脚下偶尔的地板声
      if (Math.random() < dt * 0.35) {
        G.audio.footstep(false);
        if (f.state === 'chase') G.emitNoise(f.pos, 0, 'none');
      }
      openDoorsNear();
    } else { arrive(); }
  }

  function openDoorsNear() {
    for (const id in G.world.doors) {
      const d = G.world.doors[id];
      if (d.open || d.board) continue;
      const dd = Math.hypot(d.group.position.x - f.pos.x, d.group.position.z - f.pos.z);
      if (dd < 1.9) {
        if (d.locked && id !== 'study' && id !== 'myroom') continue;
        if (d.locked && (id === 'study' || id === 'myroom')) d.locked = false; // 他有钥匙
        d.setOpen(true); G.audio.doorCreak(d.group.position);
        G.emitNoise(d.group.position, 5, 'door');
      }
    }
  }

  function arrive() {
    const cfg = f.cfg();
    if (f.state === 'investigate') {
      f.state = 'look'; f.stateT = 0;
    } else if (f.state === 'patrol') {
      f.state = 'look'; f.stateT = 0; f.patrolT = rand(cfg.patrolGap[0], cfg.patrolGap[1]);
      const r = f.room().id;
      if (r === 'living' && f.phase === 0 && G.world.tvOn && Math.random() < 0.7) { f.state = 'sit'; f.stateT = 0; }
    } else if (f.state === 'chase') {
      f.state = 'search'; f.stateT = 0; f.say('lose');
      // 在附近房间搜索藏身点
      const rm = f.room().id;
      const spots = G.world.hideSpots.filter(s => s.room === rm);
      if (spots.length && Math.random() < cfg.checkHide) { f.searchSpot = pick(spots); f.goto(nearestNode(f.searchSpot.mesh.position)); f.state = 'checkHide'; }
    } else if (f.state === 'checkHide') {
      f.searchSpot = null; f.state = 'search'; f.stateT = 0;
    } else if (f.state === 'gotoSpot') {
      f.state = 'openSpot'; f.stateT = 0;
      G.audio.cabinet(f.pos);
    }
  }

  f.update = function (dt, t) {
    if (!f.group) return;
    f.voiceCD = Math.max(0, f.voiceCD - dt);
    f.stateT += dt;

    if (f.asleep) { updateModel(dt, 0); return; }

    // 视线
    const sees = f.canSee();
    if (sees) {
      f.seeT += dt;
      if (f.state !== 'chase') {
        f.state = 'chase'; f.stateT = 0; f.loseT = 0; f.say('chase');
        G.audio.sting(); G.dv.glitch(0.35); G.ui.toast('他看见你了！');
      }
      f.lastSeen.set(G.player.pos.x, G.player.pos.y, G.player.pos.z);
      f.loseT = 0;
    } else {
      f.seeT = 0;
      if (f.state === 'chase') {
        f.loseT += dt;
        if (f.loseT > 4.5) { f.state = 'search'; f.stateT = 0; f.say('lose'); f.loseT = 0; }
      }
    }

    switch (f.state) {
      case 'sit': {
        // 父亲的专座
        tmp.set(-5.3, 0, 1.6); f.pos.lerp(tmp, Math.min(1, dt * 3));
        const want = Math.atan2(-7.5 - (-5.3), 3.2 - 1.6);
        f.yaw += (((want - f.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * Math.min(1, dt * 4);
        if (f.phase >= 1 && f.stateT > rand(8, 14)) { f.state = 'look'; f.stateT = 0; f.patrolT = 0.5; }
        if (!G.world.tvOn && !f.tvTrip) { f.tvTrip = true; f.say('tv'); f.node = nearestNode(f.pos); f.goto(G.world.nodeById.tvFront); f.state = 'patrol'; f.stateT = 0; f.patrolT = 0; f.angryExtra += 1; }
        break;
      }
      case 'look': {
        // 原地张望
        f.yaw += dt * (Math.sin(t * 0.9) * 0.5);
        if (f.stateT > (f.phase === 0 ? rand(3, 6) : rand(2, 4))) {
          if (f.patrolT > 0) { f.patrolT -= 1; f.state = 'look'; f.stateT = 0; }
          else { f.node = nearestNode(f.pos); startPatrol(); }
        }
        break;
      }
      case 'patrol': case 'investigate': {
        moveAlong(dt);
        if (f.state === 'patrol' && Math.random() < dt * 0.06) f.say(f.phase >= 2 ? 'patrol2' : 'patrol1');
        break;
      }
      case 'chase': {
        if (f.path.length === 0 || Math.random() < dt * 0.5) {
          const n = nearestNode(f.lastSeen);
          const p = bfs(nearestNode(f.pos), n, null);
          if (p) f.path = p.slice(1);
        }
        moveAlong(dt);
        // 抓到？
        const d = Math.hypot(G.player.pos.x - f.pos.x, G.player.pos.z - f.pos.z);
        if (!G.player.hidden && d < 1.15 && Math.abs(G.player.pos.y - f.pos.y) < 2.2) {
          G.game.onCaught();
          return;
        }
        break;
      }
      case 'search': {
        if (f.path.length) { moveAlong(dt); break; }
        f.yaw += dt * 0.7;
        if (f.stateT > rand(2.5, 5)) {
          const rm = f.room().id;
          const spots = G.world.hideSpots.filter(s => s.room === rm);
          if (spots.length && Math.random() < f.cfg().checkHide) {
            f.searchSpot = pick(spots); f.state = 'gotoSpot';
            f.goto(nearestNode(f.searchSpot.mesh.position));
          } else {
            const n = pick(G.world.nodes.filter(x => x.room === rm)) || G.world.nodeById.livingC;
            f.goto(n); f.state = 'patrol'; f.stateT = 0;
          }
          f.stateT = 0;
        }
        if (Math.random() < dt * 0.08) f.say('search');
        break;
      }
      case 'gotoSpot': moveAlong(dt); break;
      case 'checkHide': {
        // 到达藏身点，拉开柜门
        const s = f.searchSpot;
        if (!s) { f.state = 'search'; break; }
        const d = Math.hypot(s.mesh.position.x - f.pos.x, s.mesh.position.z - f.pos.z);
        if (d > 1.4) { moveAlong(dt); break; }
        f.yaw = Math.atan2(s.mesh.position.x - f.pos.x, s.mesh.position.z - f.pos.z);
        if (f.stateT > 0.8) {
          G.audio.cabinet(s.mesh.position);
          if (G.player.hidden === s.mesh) { G.ui.toast('他拉开柜门……'); G.game.onCaught(true); return; }
          f.searchSpot = null; f.state = 'search'; f.stateT = 0;
        }
        break;
      }
      case 'openSpot': {
        const s = f.searchSpot;
        if (s && G.player.hidden === s.mesh) { G.game.onCaught(true); return; }
        f.state = 'search'; f.stateT = 0; break;
      }
      case 'drag': break;
    }

    // 房间变化记录
    const r = f.room();
    if (r && r.id !== f.lastRoom) {
      f.lastRoom = r.id;
      if (f.state === 'chase') {} else f.visited[r.id] = true;
    }
    if (f.state === 'patrol' && f.node && f.node.id === 'tvFront' && f.tvTrip) {
      G.world.tvOn = true; G.audio.tvSet(true); f.tvTrip = false;
    }

    updateModel(dt, f.path.length ? (f.state === 'chase' ? f.cfg().chase : f.cfg().speed) : 0);
  };

  // ---------- 模型动画 ----------
  function updateModel(dt, spd) {
    const m = G.world.fatherModel;
    const g = f.group;
    g.position.set(f.pos.x, f.pos.y, f.pos.z);
    g.rotation.y = f.yaw;
    const sitting = (f.state === 'sit');
    const sleeping = f.asleep;
    if (sitting || sleeping) {
      g.position.y = f.pos.y - 0.18;
      m.legL.rotation.x = -1.35; m.legR.rotation.x = -1.35;
      m.torso.rotation.x = sleeping ? 0.35 : 0.12;
      if (sleeping) { m.head.rotation.x = 0.5; m.armL.rotation.x = 0.5; m.armR.rotation.x = 0.5; }
      else { m.head.rotation.x = 0.05; m.armL.rotation.x = -0.2; m.armR.rotation.x = -0.6; }
      m.armR.children[1] && (m.armR.children[1].position.y = -0.66);
    } else {
      g.position.y = f.pos.y;
      const sw = Math.sin(f.walkT) * clamp(spd * 0.42, 0, 0.9);
      m.legL.rotation.x = sw; m.legR.rotation.x = -sw;
      m.armL.rotation.x = -sw * 0.8; m.armR.rotation.x = sw * 0.8;
      m.torso.rotation.x = 0; m.head.rotation.x = 0;
      g.position.y += Math.abs(Math.sin(f.walkT)) * 0.02;
    }
    // 酒瓶
    if (m.bottle) m.bottle.visible = !f.asleep;
  }

  f.forceSit = () => { f.state = 'sit'; f.stateT = 0; f.path = []; };
  f.sleep = () => {
    f.asleep = true; f.state = 'sit'; f.path = [];
    f.pos.set(-5.3, 0, 1.6); f.yaw = Math.atan2(-2.2, 1.6);
    G.audio.snore(true, new THREE.Vector3(-5.3, 0, 1.6));
    G.audio.tvSet(false); G.world.tvOn = false;
  };
  f.wakeCheck = () => {};

  return f;
}
