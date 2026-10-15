// ui.js — 字幕、提示、物品栏、菜单、保险箱、结局
import { G } from './state.js';
import { ITEMS, PERM } from './items.js';

export function createUI() {
  const el = id => document.getElementById(id);
  const promptEl = el('prompt'), subEl = el('subtitle'), subSp = el('subSpeaker'), subTx = el('subText');
  const invEl = el('inventory'), toastEl = el('toast'), objEl = el('objective'), strikeEl = el('strikes');

  const U = { queue: [], cur: null, noteOpen: false, holdRing: null, onKeypad: null };

  // 按住进度环
  U.setHoldRing = function (v) {
    if (!U.holdRing) {
      const d = document.createElement('div'); d.id = 'holdRing';
      d.innerHTML = '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="17" stroke="rgba(255,255,255,.25)"></circle>' +
        '<circle id="holdArc" cx="20" cy="20" r="17" stroke="#ffd24a" stroke-dasharray="106.8" stroke-dashoffset="106.8"></circle></svg>';
      document.body.appendChild(d); U.holdRing = d;
    }
    const arc = document.getElementById('holdArc');
    if (!arc) return;
    if (v > 0) { U.holdRing.style.display = 'block'; arc.setAttribute('stroke-dashoffset', (106.8 * (1 - v)).toFixed(1)); }
    else U.holdRing.style.display = 'none';
  };

  U.setPrompt = function (html) {
    if (!html) { promptEl.style.display = 'none'; return; }
    promptEl.innerHTML = html; promptEl.style.display = 'block';
  };

  U.say = function (speaker, text, dur) {
    U.queue.push({ speaker, text, dur: dur || 2.6, t: dur || 2.6 });
  };
  U.clearSpeech = function () { U.queue.length = 0; U.cur = null; subEl.style.display = 'none'; G.audio.shutUp(); };
  // 说话：同步显示字幕，语音结束（或超时）自动收起
  U.speak = function (speaker, cn, en, opts = {}) {
    const est = opts.dur || (1.1 + (en ? en.length : cn.length * 2) * 0.058);
    let closed = false;
    const fin = () => { if (closed) return; closed = true; U.endCur(); };
    U.say(speaker, cn, est);
    if (en) G.audio.speak(en, Object.assign({}, opts, { onend: fin }));
    else setTimeout(fin, est * 1000);
    if (opts.onDone) setTimeout(opts.onDone, est * 1000 + 200);
    return est;
  };
  // 强制结束当前这一句（供语音 onend 回调调用）
  U.endCur = function () {
    if (U.cur) { U.cur.t = Math.min(U.cur.t, 0.28); }
    else if (U.queue.length) { const n = U.queue.shift(); n.t = 0.28; U.queue.unshift(n); }
  };
  U.subVisible = function () { return subEl.style.display === 'block'; };

  U.update = function (dt) {
    if (U.cur) {
      U.cur.t -= dt;
      if (U.cur.t <= 0) { U.cur = null; subEl.style.display = 'none'; }
    }
    if (!U.cur && U.queue.length) {
      const n = U.queue.shift();
      n.t = n.dur;
      U.cur = n;
      subSp.textContent = n.speaker ? '【' + n.speaker + '】' : '';
      subTx.textContent = n.text;
      subEl.style.display = 'block';
    } else if (!U.cur) { subEl.style.display = 'none'; }
    if (toastEl._t > 0) {
      toastEl._t -= dt;
      if (toastEl._t <= 0) toastEl.style.opacity = 0;
    }
  };

  U.toast = function (text, dur) {
    toastEl.textContent = text; toastEl.style.opacity = 1; toastEl._t = dur || 3;
  };

  U.updateInventory = function () {
    const counts = {};
    for (const i of G.items.inv) counts[i] = (counts[i] || 0) + 1;
    let html = '';
    for (const k in counts) {
      if (k === 'diary') continue;
      const d = ITEMS[k]; if (!d) continue;
      html += `<div class="slot">${d.name}${counts[k] > 1 ? ' ×' + counts[k] : ''}</div>`;
    }
    const gear = Object.keys(G.save.permGear).filter(k => G.save.permGear[k]);
    for (const k of gear) html += `<div class="slot" style="color:#ffd24a">★ ${PERM[k].name}</div>`;
    invEl.innerHTML = html;
  };

  U.setObjective = function (text) { objEl.textContent = text || ''; };

  U.setStrikes = function (n) {
    const kids = strikeEl.children;
    for (let i = 0; i < kids.length; i++) kids[i].className = 'sk' + (i < n ? ' used' : '');
  };

  // 纸条/笔记
  U.showNote = function (title, body) {
    let n = el('noteOverlay');
    if (!n) {
      n = document.createElement('div'); n.id = 'noteOverlay';
      n.style.cssText = 'position:fixed;inset:0;z-index:45;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;';
      n.innerHTML = `<div style="max-width:560px;background:rgba(24,22,18,.97);border:1px solid #6a5a3a;padding:34px 44px;border-radius:2px;
        font-family:'Microsoft YaHei',sans-serif;color:#e0d8c8;line-height:2;font-size:17px;white-space:pre-wrap;
        box-shadow:0 0 60px rgba(0,0,0,.9)">
        <div id="noteTitle" style="color:#ffd24a;font-size:20px;letter-spacing:3px;margin-bottom:16px;"></div>
        <div id="noteBody"></div>
        <div style="margin-top:24px;color:#8a8070;font-size:13px;text-align:right">【E / 点击】 收起</div></div>`;
      document.body.appendChild(n);
      n.addEventListener('click', () => U.closeNote());
    }
    document.getElementById('noteTitle').textContent = title;
    document.getElementById('noteBody').textContent = body;
    n.style.display = 'flex'; U.noteOpen = true;
  };
  U.closeNote = function () { const n = el('noteOverlay'); if (n) n.style.display = 'none'; U.noteOpen = false; };

  // 保险箱键盘
  U.openKeypad = function (onDone) {
    const kp = el('keypad'); kp.style.display = 'flex';
    let typed = '';
    const disp = el('kpDisplay');
    const upd = () => { disp.textContent = typed.padEnd(4, '＿'); };
    upd();
    const press = (b) => {
      if (b.textContent === '清除') { typed = ''; }
      else if (b.textContent === '确认') { if (typed.length === 4) { close(); onDone(typed); return; } else G.audio.error(); }
      else if (typed.length < 4) { typed += b.textContent; G.audio.beep(900, 0.06); }
      upd();
    };
    const btns = kp.querySelectorAll('.kpGrid button');
    const handler = e => press(e.target);
    btns.forEach(b => b.addEventListener('click', handler));
    function close() { kp.style.display = 'none'; btns.forEach(b => b.removeEventListener('click', handler)); }
    U._closeKeypad = close;
  };
  U.closeKeypad = function () { if (U._closeKeypad) { U._closeKeypad(); U._closeKeypad = null; } };

  // 备忘
  U.showMemo = function (lines) {
    el('memoList').innerHTML = lines; el('memoScreen').style.display = 'flex';
  };
  U.hideMemo = function () { el('memoScreen').style.display = 'none'; };

  // 抉择
  U.choice = function (text, onYes, onNo) {
    const box = el('choiceBox'); box.style.display = 'block';
    el('choiceText').innerHTML = text;
    const y = el('chYes'), n = el('chNo');
    const f1 = () => { box.style.display = 'none'; y.removeEventListener('click', f1); n.removeEventListener('click', f2); onYes && onYes(); };
    const f2 = () => { box.style.display = 'none'; y.removeEventListener('click', f1); n.removeEventListener('click', f2); onNo && onNo(); };
    y.addEventListener('click', f1); n.addEventListener('click', f2);
    U._choiceYes = f1; U._choiceNo = f2;
  };
  U.choiceVisible = () => el('choiceBox').style.display === 'block';

  U.showEnding = function (kind, title, body, stats) {
    el('endVhs').textContent = '⏵ PLAY';
    el('endTitle').textContent = title;
    el('endBody').innerHTML = body;
    el('endStats').innerHTML = stats;
    el('endingScreen').style.display = 'flex';
  };
  // 死亡结算：血红标题 → 小字 → 按钮 → 补充信息，逐段淡入
  U.showDeath = function (body) {
    const ds = el('deathScreen');
    el('deathBody').innerHTML = body || '';
    ds.classList.remove('reveal');
    ds.style.display = 'flex';
    void ds.offsetWidth;                 // 强制重排，保证每次都重新播放淡入
    ds.classList.add('reveal');
  };
  U.hideAllScreens = function () {
    ['endingScreen', 'deathScreen', 'menu', 'pause', 'keypad', 'memoScreen'].forEach(id => el(id).style.display = 'none');
    el('deathScreen').classList.remove('reveal');
  };
  return U;
}
