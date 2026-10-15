// prologue.js — 序章：黑屏 → 摄像机开机 → 男孩对着镜头自我介绍 → 楼下椅子响 → 切带子
import * as THREE from 'three';
import { G, clamp } from './state.js';

const LINES = [
  ['Hey guys... it\'s me again. Sorry the camera\'s shaking.', '大家好……又是我。抱歉，机器有点晃。'],
  ['I thought I\'d finally do a proper intro. I\'m Sammy. I\'m fifteen. This is my house.', '这次我想正经做个自我介绍。我叫 Sammy，十五岁。这是我家。'],
  ['It used to be mom\'s house too. She... she died last spring.', '以前也是妈妈的家。她……去年春天走了。'],
  ['Dad\'s been drinking since then. Every night. He doesn\'t like me out of my room.', '从那以后爸爸天天喝酒。他不许我离开房间。'],
  ['He locks the door. From the outside. Every single night.', '他把门锁上。从外面。每天晚上。'],
  ['So tonight I\'m getting out. I\'m recording this so somebody knows I tried.', '所以今晚我要逃出去。我录下这些，是想有人知道——我试过。'],
  ['Okay. Um... smile?', '好……呃……笑一个？'],
];

export function createPrologue() {
  const P = { active: false, t: 0, step: 0, done: null, boyShown: false, lineIdx: 0, lineT: 0 };

  const camPos = new THREE.Vector3(-4.9, 4.74, 4.62);
  const boyPos = new THREE.Vector3(-4.95, 3.2, 3.75);

  P.start = function (onDone) {
    P.active = true; P.t = 0; P.step = 0; P.done = onDone; P.lineIdx = 0; P.lineT = 0;
    P._scraped = false; P._looked = false;
    G.state = 'prologue';
    G.ui.clearSpeech();
    const sb = document.getElementById('skipBtn'); if (sb) sb.style.display = 'block';
    const boy = G.world.boyModel.group;
    boy.visible = false;
    boy.position.copy(boyPos);
    boy.rotation.y = 0;                      // 面向 +z（镜头方向）
    G.world.boyModel.head.rotation.x = 0.02;
    document.getElementById('hud').style.display = 'none';
    G.dv.blackout(true, 0);
    G.ui.setPrompt(''); G.ui.setObjective('');
    // 点亮书桌台灯照亮男孩的脸
    G.world.lights.myroomDesk.intensity = 1.0;
    const fill = new THREE.PointLight(0xffd9a0, 0.55, 7); fill.position.set(-5.0, 4.4, 4.3); G.scene.add(fill);
    P.fillLight = fill;
    G.father.forceSit();
  };

  function skip() {
    if (!P.active) return;
    P.active = false;
    G.audio.shutUp();
    G.ui.clearSpeech();
    const sb = document.getElementById('skipBtn'); if (sb) sb.style.display = 'none';
    G.world.boyModel.group.visible = false;
    if (P.fillLight) { G.scene.remove(P.fillLight); P.fillLight = null; }
    G.world.lights.myroomDesk.intensity = 0;
    document.getElementById('hud').style.display = '';
    const cb = P.done; P.done = null;
    if (cb) cb();
  }
  P.skip = skip;

  function nextLine() {
    if (P.lineIdx >= LINES.length) return false;
    const [en, cn] = LINES[P.lineIdx];
    P.lineIdx++;
    const est = 1.25 + en.length * 0.058;      // 估算语音时长
    G.ui.say('男孩', cn, est + 0.8);
    let ended = false;
    // 语音真正说完 → 立刻收起字幕并推进下一句（字幕与声音同步）
    G.audio.speak(en, {
      pitch: 1.32, rate: 1.0, vol: 0.95,
      onend: () => {
        if (!P.active || ended) return;
        ended = true; G.ui.endCur();
        P.lineT = Math.min(P.lineT, 0.55);
      }
    });
    P.lineT = est + 1.0;                       // 兜底：TTS 不可用时按估算推进
    return true;
  }

  P.update = function (dt, t) {
    if (!P.active) return;
    P.t += dt;

    // 摄像机：手持感 + 缓慢推近
    const boy = G.world.boyModel.group;
    const push = clamp(P.t * 0.035, 0, 0.42);
    const sway = Math.sin(P.t * 1.3) * 0.012 + Math.sin(P.t * 0.62) * 0.008;
    const swayY = Math.sin(P.t * 1.05 + 0.7) * 0.010;
    const cam = G.camera;
    cam.position.set(camPos.x + sway * 0.5, camPos.y + swayY, camPos.z - push * 0.6);
    const headY = boyPos.y + 1.52;
    const target = new THREE.Vector3(boyPos.x + Math.sin(P.t * 0.5) * 0.03, headY + Math.sin(P.t * 0.8) * 0.015, boyPos.z);
    cam.lookAt(target);
    cam.rotation.z = Math.sin(P.t * 0.9) * 0.006;

    // 男孩的小动作
    if (boy.visible) {
      const b = G.world.boyModel;
      b.head.rotation.y = Math.sin(P.t * 0.7) * 0.07;
      b.head.rotation.x = 0.02 + Math.sin(P.t * 1.1) * 0.02;
      b.torso.rotation.x = Math.sin(P.t * 0.9) * 0.012;
      b.armL.rotation.x = Math.sin(P.t * 0.8) * 0.05;
      b.armR.rotation.x = Math.sin(P.t * 0.8 + 0.5) * 0.05;
      boy.position.y = boyPos.y + Math.sin(P.t * 1.4) * 0.006;
    }

    switch (P.step) {
      case 0: // 黑屏
        if (P.t > 1.3) {
          P.step = 1; P.t = 0;
          G.dv.blackout(false, 0.12);
          G.dv.flash(0.55, 0.25);
          G.dv.focusHunt(1100);
          G.audio.staticBurst(0.45, 0.28);
          G.audio.beep(1500, 0.14);
          boy.visible = true;
          document.getElementById('hud').style.display = '';
          G.audio.tvSet(true);
        }
        break;
      case 1: // 开机对焦
        if (P.t > 1.9) { P.step = 2; P.t = 0; nextLine(); }
        break;
      case 2: // 自我介绍
        P.lineT -= dt;
        if (P.lineT <= 0) {
          if (!nextLine()) { P.step = 3; P.t = 0; }
        }
        break;
      case 3: // 楼下的椅子
        if (P.t > 0.1 && !P._scraped) {
          P._scraped = true;
          G.audio.chairScrape(new THREE.Vector3(-5.3, 0.4, 1.6));
          G.audio.tvSet(false);
          G.world.tvOn = false;
        }
        if (P.t > 1.0 && !P._looked) {
          P._looked = true;
          G.world.boyModel.head.rotation.x = 0.5;   // 低头看向门口
          G.audio.speak('That\'s him. I gotta go.', { pitch: 1.3, rate: 1.15, onend: () => { if (P.active) G.ui.endCur(); } });
          G.ui.say('男孩', '他来了。我得走了。', 2.8);
        }
        if (P.t > 3.4) {
          P.step = 4; P.t = 0;
          G.dv.static(0.85, 0.8);
          G.audio.staticBurst(0.9, 0.35);
          G.audio.shutUp();
          setTimeout(() => { if (P.active) { boy.visible = false; G.dv.blackout(true, 0.3); } }, 500);
        }
        break;
      case 4: // 切带子
        if (P.t > 1.6) { skip(); }
        break;
    }
    P._t = P.t;
  };

  return P;
}
