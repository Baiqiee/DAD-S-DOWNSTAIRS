// audio.js — 全程序化音效（WebAudio 合成，无外部素材）+ 英文语音
import { G, clamp, rand } from './state.js';

export function createAudio() {
  const A = {
    ctx: null, master: null, ready: false, muted: false,
    loops: {}, voices: [], tension: 0, hbT: 0,
  };

  A.init = function () {
    if (A.ready) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    A.ctx = new AC();
    A.master = A.ctx.createGain(); A.master.gain.value = 0.75; A.master.connect(A.ctx.destination);
    A.ready = true;
    // 语音列表
    if ('speechSynthesis' in window) {
      const load = () => { A.voices = speechSynthesis.getVoices() || []; };
      load(); speechSynthesis.onvoiceschanged = load;
    }
  };

  // ---------- 基础工具 ----------
  function now() { return A.ctx.currentTime; }
  let noiseBuf = null;
  function getNoise() {
    if (noiseBuf) return noiseBuf;
    const len = A.ctx.sampleRate * 2;
    noiseBuf = A.ctx.createBuffer(1, len, A.ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    return noiseBuf;
  }
  function chain(nodes) { for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]); }

  // 距离衰减 + 声像
  function atten(pos, maxD) {
    if (!pos || !G.player) return 1;
    const d = Math.hypot(pos.x - G.player.pos.x, (pos.y - G.player.pos.y) * 0.6, pos.z - G.player.pos.z);
    const f = clamp(1 - d / (maxD || 13), 0, 1);
    return f * f;
  }
  function outNode(pos, maxD) {
    const g = A.ctx.createGain();
    let head = g;
    if (pos && A.ctx.createStereoPanner && G.player) {
      const p = A.ctx.createStereoPanner();
      p.pan.value = clamp((pos.x - G.player.pos.x) / 7, -1, 1);
      g.connect(p); head = p;
    }
    head.connect(A.master);
    return { node: g, k: atten(pos, maxD) };
  }

  function tone(freq, dur, type, vol, pos, slideTo, delay, maxD) {
    if (!A.ready || A.muted) return null;
    const o2 = outNode(pos, maxD);
    const v = Math.max(0.0001, vol * o2.k);
    const t0 = now() + (delay || 0);
    const o = A.ctx.createOscillator(); o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    const g = A.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(v, t0 + Math.min(0.02, dur * 0.25));
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
    o.connect(g); g.connect(o2.node);
    o.start(t0); o.stop(t0 + dur + 0.06);
    return o;
  }

  function noise(dur, freq, q, vol, pos, type, delay, maxD) {
    if (!A.ready || A.muted) return null;
    const o2 = outNode(pos, maxD);
    const v = Math.max(0.0001, vol * o2.k);
    const t0 = now() + (delay || 0);
    const s = A.ctx.createBufferSource(); s.buffer = getNoise(); s.loop = true;
    const f = A.ctx.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q || 1;
    const g = A.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(v, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
    s.connect(f); f.connect(g); g.connect(o2.node);
    s.start(t0); s.stop(t0 + dur + 0.06);
    return { src: s, filt: f, gain: g };
  }

  // ---------- 具体音效 ----------
  A.footstep = (quiet) => {
    noise(quiet ? 0.07 : 0.11, quiet ? 240 : 420, 1.6, quiet ? 0.09 : 0.24, null, 'bandpass');
    tone(quiet ? 70 : 95, 0.07, 'sine', quiet ? 0.05 : 0.11);
    if (Math.random() < 0.22) tone(rand(180, 320), 0.25, 'triangle', 0.05, null, rand(120, 200)); // 地板吱呀
  };
  A.creakFloor = (pos) => { tone(rand(160, 300), 0.5, 'sawtooth', 0.13, pos, rand(90, 140)); };
  A.doorCreak = (pos) => {
    const p = pos || (G.player ? G.player.pos : null);
    tone(rand(95, 130), 1.0, 'sawtooth', 0.13, p, rand(150, 220));
    noise(0.9, 900, 0.8, 0.07, p, 'bandpass');
  };
  A.doorSlam = (pos) => {
    noise(0.5, 120, 0.7, 0.6, pos, 'lowpass');
    tone(60, 0.4, 'sine', 0.5, pos, 35);
  };
  A.doorLocked = (pos) => { noise(0.12, 1800, 3, 0.16, pos, 'bandpass'); noise(0.09, 900, 3, 0.12, pos, 'bandpass', 0.14); };
  A.drawer = (pos) => { noise(0.3, 700, 1.2, 0.16, pos, 'bandpass'); tone(90, 0.12, 'sine', 0.1, pos); };
  A.cabinet = (pos) => { noise(0.35, 500, 1.4, 0.14, pos, 'bandpass'); };
  A.pickup = () => { tone(660, 0.09, 'square', 0.1); tone(990, 0.12, 'square', 0.08, null, null, 0.09); };
  A.uiClick = () => { tone(520, 0.05, 'square', 0.07); };
  A.error = () => { tone(180, 0.16, 'square', 0.12, null, 110); };
  A.glassClink = (pos) => { tone(1400, 0.16, 'sine', 0.12, pos, 1100); noise(0.1, 3000, 4, 0.06, pos); };
  A.chairScrape = (pos) => { noise(0.7, 300, 0.9, 0.3, pos, 'bandpass'); tone(120, 0.6, 'sawtooth', 0.12, pos, 70); };
  A.glug = (pos) => { for (let i = 0; i < 5; i++) tone(rand(150, 220), 0.09, 'sine', 0.14, pos, rand(90, 130), i * 0.17); };
  A.knock = (pos, n) => { for (let i = 0; i < (n || 3); i++) { noise(0.09, 220, 1, 0.45, pos, 'lowpass', i * 0.36); tone(70, 0.12, 'sine', 0.3, pos, 45, i * 0.36); } };
  A.stairsCreak = (pos) => { tone(rand(120, 200), 0.35, 'sawtooth', 0.1, pos, rand(80, 130)); };

  A.staticBurst = (dur, vol) => {
    if (!A.ready) return;
    const s = A.ctx.createBufferSource(); s.buffer = getNoise(); s.loop = true;
    const f = A.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 900;
    const g = A.ctx.createGain(); g.gain.value = (vol || 0.35);
    const t0 = now();
    for (let i = 0; i < dur * 8; i++) g.gain.setValueAtTime((vol || 0.35) * rand(0.4, 1.0), t0 + i * 0.12);
    g.gain.setValueAtTime(0, t0 + dur);
    chain([s, f, g, A.master]); s.start(t0); s.stop(t0 + dur + 0.1);
  };
  // 死亡结算：低频嗡鸣 + 三下缓慢的心跳
  A.deathDrone = () => {
    if (!A.ready || A.muted) return;
    tone(31, 10, 'sine', 0.075, null, 26, 0.1);
    for (let i = 0; i < 3; i++) {
      tone(54, 0.42, 'sine', 0.20, null, 34, 0.5 + i * 1.55);
      tone(42, 0.62, 'sine', 0.14, null, 30, 0.78 + i * 1.55);
    }
  };

  A.sting = () => {
    if (!A.ready) return;
    tone(48, 0.9, 'sine', 0.85, null, 28);
    noise(0.7, 220, 0.6, 0.5, null, 'lowpass');
    tone(900, 0.35, 'sawtooth', 0.18, null, 90);
    A.staticBurst(0.5, 0.3);
  };
  A.phoneRing = (pos, times) => {
    const n = times || 4;
    for (let i = 0; i < n; i++) {
      tone(480, 0.35, 'sine', 0.22, pos, null, i * 1.0);
      tone(620, 0.35, 'sine', 0.2, pos, null, i * 1.0);
      tone(480, 0.35, 'sine', 0.2, pos, null, i * 1.0 + 0.4);
      tone(620, 0.35, 'sine', 0.18, pos, null, i * 1.0 + 0.4);
    }
  };
  A.dialTone = () => {
    if (!A.ready) return;
    const o1 = A.ctx.createOscillator(), o2 = A.ctx.createOscillator(), g = A.ctx.createGain();
    o1.frequency.value = 350; o2.frequency.value = 440; o1.type = o2.type = 'sine';
    g.gain.value = 0.16; chain([o1, g]); o2.connect(g); g.connect(A.master);
    o1.start(); o2.start();
    A._dial = { o1, o2, g };
  };
  A.stopDial = () => { if (A._dial) { try { A._dial.o1.stop(); A._dial.o2.stop(); } catch (e) {} A._dial = null; } };
  A.beep = (f, d) => tone(f || 880, d || 0.12, 'square', 0.14);

  A.siren = (on) => {
    if (on && !A.loops.siren) {
      const o = A.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 620;
      const lfo = A.ctx.createOscillator(); lfo.frequency.value = 0.55;
      const lg = A.ctx.createGain(); lg.gain.value = 260;
      lfo.connect(lg); lg.connect(o.frequency);
      const f = A.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1800;
      const g = A.ctx.createGain(); g.gain.value = 0.0;
      chain([o, f, g, A.master]); o.start(); lfo.start();
      g.gain.linearRampToValueAtTime(0.2, now() + 3);
      A.loops.siren = { o, lfo, g };
    } else if (!on && A.loops.siren) {
      const s = A.loops.siren;
      try { s.g.gain.linearRampToValueAtTime(0, now() + 1.2); setTimeout(() => { try { s.o.stop(); s.lfo.stop(); } catch (e) {} }, 1400); } catch (e) {}
      A.loops.siren = null;
    }
  };

  A.musicBox = (pos, dur) => {
    const notes = [523, 587, 659, 587, 523, 466, 523];
    for (let i = 0; i < notes.length; i++) {
      tone(notes[i], 0.6, 'sine', 0.09, pos, null, i * 0.55);
      tone(notes[i] * 2, 0.4, 'sine', 0.03, pos, null, i * 0.55);
    }
  };

  A.tvSet = (on) => {
    if (!A.ready) return;
    if (on && !A.loops.tv) {
      const s = A.ctx.createBufferSource(); s.buffer = getNoise(); s.loop = true;
      const f = A.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.8;
      const g = A.ctx.createGain(); g.gain.value = 0;
      chain([s, f, g, A.master]); s.start();
      A.loops.tv = { s, g, f };
    } else if (!on && A.loops.tv) {
      const t = A.loops.tv; t.g.gain.linearRampToValueAtTime(0, now() + 0.2);
      setTimeout(() => { try { t.s.stop(); } catch (e) {} }, 400); A.loops.tv = null;
    }
  };
  A.snore = (on, pos) => {
    if (!A.ready) return;
    if (on && !A.loops.snore) {
      const s = A.ctx.createBufferSource(); s.buffer = getNoise(); s.loop = true;
      const f = A.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 260;
      const g = A.ctx.createGain(); g.gain.value = 0;
      chain([s, f, g, A.master]); s.start();
      A.loops.snore = { s, g, pos };
    } else if (!on && A.loops.snore) {
      const t = A.loops.snore; t.g.gain.linearRampToValueAtTime(0, now() + 0.3);
      setTimeout(() => { try { t.s.stop(); } catch (e) {} }, 500); A.loops.snore = null;
    }
  };

  A.breath = (intensity) => {
    noise(0.55, 700, 0.9, 0.06 + intensity * 0.07, null, 'bandpass');
  };

  A.setTension = (v) => { A.tension = v; };

  A.update = function (dt) {
    if (!A.ready) return;
    // 电视声（位置感）
    if (A.loops.tv && G.world && G.world.meshes.tv) {
      const p = G.world.meshes.tv.position;
      const v = 0.5 * atten({ x: p.x, y: 1.2, z: p.z }, 16);
      A.loops.tv.g.gain.value = v * (0.85 + Math.random() * 0.3);
    }
    if (A.loops.snore) {
      const p = A.loops.snore.pos;
      const t = now() % 4;
      const env = (t < 2 ? Math.sin(t / 2 * Math.PI) : 0);
      A.loops.snore.g.gain.value = 0.5 * atten(p, 12) * env * 0.9;
    }
    // 心跳
    if (A.tension > 0.02) {
      A.hbT -= dt * (0.75 + A.tension * 1.5);
      if (A.hbT <= 0) {
        A.hbT = 1;
        tone(52, 0.16, 'sine', 0.16 + A.tension * 0.3, null, 34);
        tone(50, 0.13, 'sine', 0.1 + A.tension * 0.2, null, 32, 0.19);
      }
    }
  };

  A.rewind = () => {
    if (!A.ready) return;
    for (let i = 0; i < 6; i++) tone(300 + i * 120, 0.06, 'sawtooth', 0.09, null, 200 + i * 90, i * 0.07);
    A.staticBurst(0.6, 0.22);
  };

  // ---------- 语音（英文 TTS） ----------
  A.speak = function (text, opts = {}) {
    if (!('speechSynthesis' in window) || A.muted) { if (opts.onend) setTimeout(opts.onend, (text.length * 45)); return null; }
    try {
      const u = new SpeechSynthesisUtterance(text);
      const vs = A.voices.length ? A.voices : (speechSynthesis.getVoices ? speechSynthesis.getVoices() : []);
      if (vs.length === 0) {
        // 无可用语音（如某些无头环境），仅按文本长度模拟时长
        if (opts.onend) setTimeout(opts.onend, text.length * 50 + 200);
        return null;
      }
      const v = vs.find(v => /en[-_]US/i.test(v.lang)) || vs.find(v => /^en/i.test(v.lang));
      if (v) u.voice = v;
      u.rate = opts.rate || 1; u.pitch = opts.pitch || 1; u.volume = opts.vol === undefined ? 0.95 : opts.vol;
      if (opts.onend) u.onend = opts.onend;
      speechSynthesis.speak(u);
      return u;
    } catch (e) { if (opts.onend) setTimeout(opts.onend, 400); return null; }
  };
  A.shutUp = () => { try { if ('speechSynthesis' in window) speechSynthesis.cancel(); } catch (e) {} };

  return A;
}
