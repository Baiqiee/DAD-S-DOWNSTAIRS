// player.js — 第一人称移动、碰撞、噪音、躲藏
import * as THREE from 'three';
import { G, clamp } from './state.js';

const R = 0.3;               // 身体半径
const SAFE_R = 0.18;         // 合法性检查用的收缩半径（比 R 小，避免误判）
const EYE = 1.55, EYE_CROUCH = 0.95;
const FALLBACK = { x: -4.7, y: 3.2, z: 3.2 };   // 出生点，最后的兜底

export function createPlayer() {
  const p = {
    pos: new THREE.Vector3(-4.7, 3.2, 2.6),
    yaw: Math.PI * 0.5, pitch: -0.04,
    lastSafe: new THREE.Vector3(-4.7, 3.2, 3.2),
    crouch: false, sneak: false, running: false,
    hidden: null, hiddenYaw: 0, hiddenEntry: null,
    stepAcc: 0, bob: 0, bobT: 0, swayT: 0,
    eyeY: EYE, shake: 0, lastFootLoud: 0,
  };

  const tmpF = new THREE.Vector3(), tmpR = new THREE.Vector3();

  function fwdVec(out) { return out.set(-Math.sin(p.yaw), 0, -Math.cos(p.yaw)); }
  function rightVec(out) { return out.set(Math.cos(p.yaw), 0, -Math.sin(p.yaw)); }

  // 碰撞：把 pos 推出所有重叠的 AABB
  function collide() {
    const cols = G.world.colliders;
    for (let iter = 0; iter < 3; iter++) {
      let hit = false;
      const feet = p.pos.y;
      for (const c of cols) {
        if (c.y2 < feet + 0.3 || c.y1 > feet + 1.5) continue;
        const cx = clamp(p.pos.x, c.x1, c.x2), cz = clamp(p.pos.z, c.z1, c.z2);
        const dx = p.pos.x - cx, dz = p.pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 > R * R) continue;
        hit = true;
        if (d2 > 1e-8) {                      // 圆形推出
          const d = Math.sqrt(d2), push = (R - d);
          p.pos.x += (dx / d) * push; p.pos.z += (dz / d) * push;
        } else {                              // 圆心在盒内：沿最小穿透轴推出
          const left = Math.abs(p.pos.x - c.x1), right = Math.abs(c.x2 - p.pos.x);
          const up = Math.abs(p.pos.z - c.z1), down = Math.abs(c.z2 - p.pos.z);
          const m = Math.min(left, right, up, down);
          if (m === left) p.pos.x = c.x1 - R;
          else if (m === right) p.pos.x = c.x2 + R;
          else if (m === up) p.pos.z = c.z1 - R;
          else p.pos.z = c.z2 + R;
        }
      }
      if (!hit) break;
    }
  }

  // 某个坐标是否处在碰撞体里（用于寻找安全的“出来”落点）
  function blockedAt(x, z, y, rad) {
    const rr = (rad || R + 0.05);
    for (const c of G.world.colliders) {
      if (c.y2 < y + 0.3 || c.y1 > y + 1.5) continue;
      const cx = clamp(x, c.x1, c.x2), cz = clamp(z, c.z1, c.z2);
      const dx = x - cx, dz = z - cz;
      if (dx * dx + dz * dz < rr * rr) return true;
    }
    return false;
  }

  // ============ 安全网：判断一个坐标是不是「合法站立点」 ============
  // 合法 = ①在世界硬边界内 ②没有卡进任何碰撞体 ③处在房子房间矩形内（或屋外院子）
  function validStand(x, z, y) {
    if (!isFinite(x) || !isFinite(z) || !isFinite(y)) return false;
    if (x < -30 || x > 30 || z < -30 || z > 60) return false;
    if (blockedAt(x, z, y, SAFE_R)) return false;
    const f = y < -1.4 ? -1 : (y > 1.8 ? 1 : 0);
    let inHouse = false;
    for (const r of G.world.rooms) {
      if (r.id === 'outside') continue;
      if (r.f === f && x >= r.x1 && x <= r.x2 && z >= r.z1 && z <= r.z2) { inHouse = true; break; }
    }
    if (!inHouse) {
      // 屋外：只有前院/街道（地面层、穿过大门往北）合法
      if (!(f === 0 && z > 4.85 && z < 40 && x > -25 && x < 25)) return false;
      // 外墙厚度带内，只允许走大门门洞，别的地方一律视为穿墙
      if (z < 5.15 && Math.abs(x) > 0.5) return false;
    }
    return true;
  }
  p.validStand = validStand;
  p.collide = collide;

  // 把玩家拉回最后一个合法位置（绝不允许穿模到房子外面）
  function enforceInside() {
    if (validStand(p.pos.x, p.pos.z, p.pos.y)) { p.lastSafe.copy(p.pos); return true; }
    if (validStand(p.lastSafe.x, p.lastSafe.z, p.lastSafe.y)) p.pos.copy(p.lastSafe);
    else p.pos.set(FALLBACK.x, FALLBACK.y, FALLBACK.z);
    return false;
  }
  p.enforceInside = enforceInside;

  p.setHidden = (mesh, camPos, camY) => {
    p.hidden = mesh; p.hiddenPos = camPos.clone(); p.hiddenY = camY;
    p.hiddenYaw = p.yaw;
    // 记住进来时站的位置；若该点不合法，就用藏身点预设的安全出口
    p.hiddenEntry = validStand(p.pos.x, p.pos.z, p.pos.y) ? p.pos.clone() : null;
  };

  p.exitHidden = () => {
    if (!p.hidden) return;
    const m = p.hidden;
    const e = p.hiddenEntry;
    const spot = G.world.hideSpots.find(s => s.mesh === m);
    let y = e ? e.y : m.position.y;
    const gx = m.position.x, gz = m.position.z;

    // 候选落点：①进来时的位置 ②该藏身点预设的安全出口 ③以藏身点为中心的螺旋搜索
    const cand = [];
    if (e) cand.push([e.x, e.z]);
    if (spot && spot.exit) cand.push([spot.exit.x, spot.exit.z]);
    for (let rad = 0.9; rad <= 2.5; rad += 0.3) {
      for (let a = 0; a < 16; a++) {
        const th = a * Math.PI / 8;
        cand.push([gx + Math.cos(th) * rad, gz + Math.sin(th) * rad]);
      }
    }
    // 排序：越接近“进来时的位置”越优先，保留原路退出的手感
    const rx = e ? e.x : gx, rz = e ? e.z : gz;
    cand.sort((A, B) => ((A[0] - rx) ** 2 + (A[1] - rz) ** 2) - ((B[0] - rx) ** 2 + (B[1] - rz) ** 2));

    let best = null;
    for (const [x, z] of cand) {
      if (validStand(x, z, y)) { best = [x, z]; break; }
    }
    if (!best) {                       // 兜底：上一个安全点 → 出生点
      if (validStand(p.lastSafe.x, p.lastSafe.z, p.lastSafe.y)) { best = [p.lastSafe.x, p.lastSafe.z]; y = p.lastSafe.y; }
      else { best = [FALLBACK.x, FALLBACK.z]; y = FALLBACK.y; }
    }

    p.pos.set(best[0], y, best[1]);
    p.hidden = null; p.hiddenEntry = null;
    p.crouch = false;
    collide();
    if (!validStand(p.pos.x, p.pos.z, p.pos.y)) p.pos.copy(p.lastSafe);
    p.lastSafe.copy(p.pos);
  };

  p.teleport = (x, y, z, yaw) => {
    p.pos.set(x, y, z); if (yaw !== undefined) p.yaw = yaw; p.pitch = 0;
    p.hidden = null; p.hiddenEntry = null; p.crouch = false;
    p.lastSafe.copy(p.pos);
  };

  p.update = function (dt, t) {
    const cam = G.camera;
    const sens = 0.0021;
    p.yaw -= G.input.mouseDX * sens;
    p.pitch = clamp(p.pitch - G.input.mouseDY * sens, -1.25, 1.25);
    G.input.mouseDX = 0; G.input.mouseDY = 0;
    p.swayT += dt;

    const k = G.input.keys;

    if (p.hidden) {
      // 躲藏：镜头固定在藏身处，只能小幅张望
      p.yaw = clamp(p.yaw, p.hiddenYaw - 1.15, p.hiddenYaw + 1.15);
      cam.position.copy(p.hiddenPos); cam.position.y = p.hiddenY;
      cam.rotation.set(p.pitch, p.yaw, 0, 'YXZ');
      p.eyeY = EYE_CROUCH;
      return;
    }

    p.running = !!(k.ShiftLeft || k.ShiftRight);
    p.sneak = p.running;                       // 兼容旧字段
    p.crouch = !!(k.KeyC || k.ControlLeft);
    const targetEye = p.crouch ? EYE_CROUCH : EYE;
    p.eyeY += (targetEye - p.eyeY) * Math.min(1, dt * 9);

    // 默认走路；按住 Shift 跑步（快、很响）；按 C 蹲行（慢、最安静）
    let speed = p.running ? 3.45 : (p.crouch ? 1.25 : 2.3);
    if (G.save.permGear.sneakers) speed *= 1.12;

    const fw = (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0);
    const sd = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0);
    fwdVec(tmpF); rightVec(tmpR);
    const move = new THREE.Vector3();
    move.addScaledVector(tmpF, fw).addScaledVector(tmpR, sd);
    const moving = move.lengthSq() > 0.001;
    if (moving) { move.normalize().multiplyScalar(speed * dt); p.pos.add(move); }

    // 地面高度（楼梯）
    const gy = G.world.groundY(p.pos.x, p.pos.z, p.pos.y);
    if (Math.abs(gy - p.pos.y) < 3.6) p.pos.y += (gy - p.pos.y) * Math.min(1, dt * 14);
    p.pos.x = clamp(p.pos.x, -25, 25); p.pos.z = clamp(p.pos.z, -30, 30);
    collide();
    // 安全网：collide 没能把人推回屋里（被夹在缝里/穿墙）时，退回上一个合法位置
    enforceInside();

    // 脚步声 & 噪音
    if (moving) {
      const stepLen = p.running ? 0.72 : (p.crouch ? 0.9 : 0.66);
      p.stepAcc += speed * dt;
      p.bobT += dt * speed * (p.running ? 5.4 : (p.crouch ? 2.6 : 4.2));
      if (p.stepAcc >= stepLen) {
        p.stepAcc = 0;
        // 跑步很响，走路中等，蹲行几乎没声
        let loud = p.running ? 13.5 : (p.crouch ? 2.4 : 6.5);
        if (G.save.permGear.sneakers) loud *= 0.66;
        G.audio.footstep(!p.running);
        G.emitNoise(p.pos, loud, 'step');
        p.lastFootLoud = loud;
      }
      p.bob = Math.sin(p.bobT) * (p.running ? 0.042 : (p.crouch ? 0.008 : 0.022));
    } else { p.bob *= 0.9; p.stepAcc = 0; }

    // 手持DV的自然摇晃
    const sway = Math.sin(p.swayT * 1.15) * 0.0075 + Math.sin(p.swayT * 0.47) * 0.004;
    const swayP = Math.sin(p.swayT * 0.9 + 1.3) * 0.005;
    const sh = p.shake > 0 ? p.shake : 0;
    if (p.shake > 0) p.shake = Math.max(0, p.shake - dt * 2.2);

    cam.position.set(p.pos.x + (Math.random() - 0.5) * sh * 0.1,
      p.pos.y + p.eyeY + p.bob + (Math.random() - 0.5) * sh * 0.1,
      p.pos.z + (Math.random() - 0.5) * sh * 0.1);
    cam.rotation.set(p.pitch + swayP + (Math.random() - 0.5) * sh * 0.06,
      p.yaw + sway + (Math.random() - 0.5) * sh * 0.06, 0, 'YXZ');
  };

  return p;
}
