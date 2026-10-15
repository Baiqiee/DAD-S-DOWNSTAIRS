// dv.js — DV 录像机滤镜：电量、时间戳、噪点、夜视、故障
import { G, clamp, rand } from './state.js';

export function createDV() {
  const D = {
    battery: 100, capacity: 100, drain: 0.16, nv: false, nvDrain: 4,
    t: 0, seconds: 21 * 3600 + 47 * 60, glitchT: 0, grainT: 0, dead: false,
  };
  const cv = document.getElementById('grain');
  const ctx = cv.getContext('2d');
  const staticCv = document.getElementById('staticCv');
  const sctx = staticCv.getContext('2d');
  const grainWrap = document.getElementById('grainWrap');
  const staticEl = document.getElementById('staticOverlay');
  const flashEl = document.getElementById('flash');
  const blackout = document.getElementById('blackout');
  const batFill = document.getElementById('batteryFill');
  const batPct = document.getElementById('batteryPct');
  const dvDate = document.getElementById('dvDate');
  const dvTime = document.getElementById('dvTime');
  const recDot = document.getElementById('recDot');
  const tape = document.getElementById('tapeName');
  const focusBox = document.getElementById('focusBox');

  function sizeCanvas() {
    cv.width = 220; cv.height = 130;
    staticCv.width = 300; staticCv.height = 180;
  }
  sizeCanvas(); window.addEventListener('resize', sizeCanvas);

  const img = ctx.createImageData(cv.width, cv.height);
  const simg = sctx.createImageData(staticCv.width, staticCv.height);

  D.reset = function (runIndex) {
    D.battery = 100; D.dead = false; D.nv = false;
    document.body.classList.remove('nightvision');
    D.drain = G.save.permGear.bigbatt ? 0.10 : 0.16;
    D.seconds = 21 * 3600 + 47 * 60;
    tape.textContent = 'TAPE ' + String(runIndex).padStart(2, '0');
    blackout.className = 'hide';
  };

  D.toggleNV = function () {
    if (D.battery <= 0) { G.ui.toast('电池没电了。'); return; }
    D.nv = !D.nv;
    document.body.classList.toggle('nightvision', D.nv);
    G.audio.beep(D.nv ? 1200 : 700, 0.08);
  };

  D.addBattery = function (n) {
    D.battery = clamp(D.battery + n, 0, 100);
    D.dead = false; G.ui.toast('换上了新电池。');
  };

  D.glitch = function (amount, dur) {
    D.glitchT = Math.max(D.glitchT, dur || 0.25);
    D.glitchAmt = amount || 0.5;
  };
  D.focusHunt = function (dur) {
    document.body.classList.add('dvblur');
    focusBox.classList.add('on');
    setTimeout(() => { document.body.classList.remove('dvblur'); focusBox.classList.remove('on'); }, (dur || 900));
  };
  D.flash = function (v, dur) {
    flashEl.style.transition = 'none'; flashEl.style.opacity = v;
    setTimeout(() => { flashEl.style.transition = 'opacity ' + (dur || 0.35) + 's'; flashEl.style.opacity = 0; }, 30);
  };
  D.blackout = function (on, dur) {
    blackout.style.transition = 'opacity ' + (dur === undefined ? 0.5 : dur) + 's';
    blackout.className = on ? 'show' : 'hide';
  };
  D.static = function (opacity, dur) {
    staticEl.style.transition = 'opacity .1s'; staticEl.style.opacity = opacity;
    if (dur) setTimeout(() => { staticEl.style.opacity = 0; }, dur * 1000);
  };

  D.update = function (dt, t) {
    D.t += dt;
    if (G.state === 'play') {
      D.seconds += dt;
      const drain = (D.nv ? D.drain * D.nvDrain : D.drain);
      D.battery = clamp(D.battery - drain * dt, 0, 100);
      if (D.battery <= 0 && !D.dead) {
        D.dead = true; D.nv = false; document.body.classList.remove('nightvision');
        G.ui.toast('电池耗尽了……画面开始崩坏。');
      }
    }
    // HUD
    batFill.style.width = (D.battery) + '%';
    batFill.style.background = D.battery < 25 ? '#ff5555' : '#e8e8e8';
    batPct.textContent = Math.round(D.battery) + '%';
    const hh = Math.floor(D.seconds / 3600) % 24, mm = Math.floor(D.seconds / 60) % 60, ss = Math.floor(D.seconds) % 60;
    const ampm = hh >= 12 ? 'PM' : 'AM';
    const h12 = hh % 12 === 0 ? 12 : hh % 12;
    dvTime.textContent = `${h12}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')} ${ampm}`;
    dvDate.textContent = 'OCT.16 2003';
    recDot.style.visibility = (Math.floor(t * 1.8) % 2) ? 'visible' : 'hidden';

    // 噪点
    D.grainT += dt;
    if (D.grainT > 0.07) {
      D.grainT = 0;
      const d = img.data;
      const dark = 1 - D.battery / 100;
      for (let i = 0; i < d.length; i += 4) {
        const n = Math.random() * 255;
        d[i] = d[i + 1] = d[i + 2] = n;
        d[i + 3] = 26 + dark * 90 + (D.dead ? 60 : 0);
      }
      ctx.putImageData(img, 0, 0);
      grainWrap.style.opacity = (0.35 + dark * 0.5).toFixed(2);
      // 坏带条纹
      if (Math.random() < 0.05 + dark * 0.15) {
        ctx.fillStyle = 'rgba(255,255,255,' + (0.05 + Math.random() * 0.12) + ')';
        ctx.fillRect(0, Math.random() * cv.height, cv.width, 2 + Math.random() * 4);
      }
    }
    // 故障/雪花
    if (D.glitchT > 0) {
      D.glitchT -= dt;
      const d = simg.data;
      for (let i = 0; i < d.length; i += 4) {
        const n = Math.random() * 255;
        d[i] = d[i + 1] = d[i + 2] = n; d[i + 3] = 200;
      }
      sctx.putImageData(simg, 0, 0);
      staticEl.style.opacity = (D.glitchAmt * clamp(D.glitchT / 0.25, 0, 1)).toFixed(2);
      const g = G.camera;
      if (g) g.rotation.z = (Math.random() - 0.5) * 0.03 * D.glitchAmt;
    } else if (staticEl.style.opacity !== '0') {
      staticEl.style.opacity = 0;
      if (G.camera) G.camera.rotation.z = 0;
    }
    // 死带：极暗
    if (D.dead) {
      const f = 0.35 - Math.sin(t * 30) * 0.05;
      document.getElementById('game').style.filter = `brightness(${f}) contrast(1.3) saturate(0.5)`;
    } else if (!D.nv) {
      document.getElementById('game').style.filter = '';
    }
  };

  return D;
}
