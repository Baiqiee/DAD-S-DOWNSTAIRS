// scares.js — 突发脚本惊吓（严格尊重父亲的真实位置，杜绝自相矛盾）
import * as THREE from 'three';
import { G, rand, pick, randi } from './state.js';

export function createScares() {
  const S = { cd: rand(22, 38), used: {}, last: '' };

  const POOL = [
    {
      id: 'tvMute',
      cond: () => G.world.tvOn && G.father.room().id === 'living',
      run: () => {
        G.audio.tvSet(false);
        G.dv.glitch(0.18, 0.3);
        setTimeout(() => { if (G.world.tvOn) G.audio.tvSet(true); }, 2200);
      },
    },
    {
      id: 'phoneRing', once: true,
      cond: () => !G.run.phoneFixed && G.father.room().id !== 'hall',
      run: () => G.audio.phoneRing(new THREE.Vector3(-1.1, 1.0, 4.4), randi(2, 4)),
    },
    {
      id: 'lullaby',
      cond: () => G.father.room().id !== 'parents',
      run: () => G.audio.musicBox(new THREE.Vector3(-7.2, 3.6, -3.8), 5),
    },
    {
      id: 'fridgeThud', once: true,
      cond: () => G.father.room().id !== 'kitchen' && G.world.roomAt(G.player.pos.x, G.player.pos.z, G.player.pos.y).id !== 'kitchen',
      run: () => { G.audio.doorSlam(new THREE.Vector3(2.3, 0.8, -0.55)); G.emitNoise(new THREE.Vector3(2.3, 0, -0.55), 7, 'thud'); },
    },
    {
      id: 'above',
      cond: () => G.player.pos.y < 1.6 && G.father.pos.y > 1.6,
      run: () => {
        for (let i = 0; i < 5; i++) setTimeout(() => G.audio.stairsCreak(new THREE.Vector3(G.player.pos.x + rand(-1.5, 1.5), 3.3, G.player.pos.z + rand(-1.5, 1.5))), i * 420);
      },
    },
    {
      id: 'below',
      cond: () => G.player.pos.y > 1.6 && G.father.pos.y < 1.6,
      run: () => {
        for (let i = 0; i < 4; i++) setTimeout(() => G.audio.creakFloor(new THREE.Vector3(G.player.pos.x + rand(-1.5, 1.5), 0, G.player.pos.z + rand(-1.5, 1.5))), i * 480);
      },
    },
    {
      id: 'whisper', once: true,
      cond: () => G.father.room().id !== G.world.roomAt(G.player.pos.x, G.player.pos.z, G.player.pos.y).id,
      run: () => {
        G.audio.speak('Sammy...', { pitch: 1.5, rate: 0.7, vol: 0.5 });
        G.player.shake = 0.8;
      },
    },
    {
      id: 'chairScrape', once: true,
      cond: () => G.father.room().id !== 'living' && G.world.roomAt(G.player.pos.x, G.player.pos.z, G.player.pos.y).id !== 'living',
      run: () => G.audio.chairScrape(new THREE.Vector3(-5.3, 0.4, 1.6)),
    },
    {
      id: 'upstairsSlam', once: true,
      cond: () => G.father.pos.y < 1.6 && G.player.pos.y < 1.6,
      run: () => { G.audio.doorSlam(new THREE.Vector3(-1.5, 4.4, 3.5)); G.emitNoise(new THREE.Vector3(-1.5, 3.2, 3.5), 9, 'slam'); },
    },
    {
      id: 'windowKnock', once: true,
      cond: () => true,
      run: () => {
        const p = G.player.pos.clone();
        p.z += p.z > 0 ? 4 : -4; p.y += 1.8;
        G.audio.knock(p, 2); G.player.shake = 0.5;
      },
    },
    {
      id: 'breathe',
      cond: () => G.father.room().id === G.world.roomAt(G.player.pos.x, G.player.pos.z, G.player.pos.y).id && G.father.state !== 'chase',
      run: () => { G.audio.breath(0.9); G.player.shake = 0.4; },
    },
  ];

  S.update = function (dt) {
    if (G.state !== 'play' || !G.run || G.run.ending) return;
    S.cd -= dt;
    if (S.cd > 0) return;
    S.cd = rand(24, 46);
    const f = G.father;
    if (f.state === 'chase') return;
    const valid = POOL.filter(s => !(s.once && S.used[s.id]) && s.id !== S.last && s.cond());
    if (!valid.length) return;
    const s = pick(valid);
    S.last = s.id; if (s.once) S.used[s.id] = true;
    s.run();
  };

  S.reset = function () { S.cd = rand(22, 38); S.used = {}; S.last = ''; };
  return S;
}
