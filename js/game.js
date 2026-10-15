// game.js — 局面生命周期、交互逻辑、三条结局线、roguelike 循环
import * as THREE from 'three';
import { G, rand, pick, clamp } from './state.js';
import { ITEMS, PERM, persist } from './items.js';

const BOY = '男孩';

export function createGame() {
  const g = {};
  const tmp = new THREE.Vector3();

  // ---------------- 开局 ----------------
  g.startRun = function () {
    const w = G.world;
    w.reset();
    G.run = {
      t: 0, strikes: 0, progress: 0, leaving: false, leftRoom: false,
      phoneAttached: false, phoneFixed: false, calling: false, policeTimer: 0,
      junctionFixed: false, safeOpen: false, sawCard: false, sawBill: false,
      diaryFound: false, whiskeyDosed: false, fatherDrank: false, fatherAsleep: false,
      drinkT: 0, sleepT: 0, frontOpen: false, ending: null,
      code: '', deathMonth: 3, deathDay: 14, momName: 'Margaret Parker',
      searchedCount: 0, phase: 0, frozen: 0, cutT: 0, cutKind: null,
    };
    // 保险箱密码 = 母亲忌日 MMDD
    G.run.deathMonth = 1 + Math.floor(Math.random() * 12);
    G.run.deathDay = 1 + Math.floor(Math.random() * 28);
    G.run.code = String(G.run.deathMonth).padStart(2, '0') + String(G.run.deathDay).padStart(2, '0');
    G.save.runs++; persist();

    G.items.inv.length = 0;
    G.items.rollRun(w, G.run);
    G.father.reset(true); G.father.setPhase(0); G.father.speedMul = 1;
    G.scares.reset();
    G.dv.reset(G.save.runs);
    G.ui.setStrikes(0); G.ui.updateInventory(); G.ui.hideAllScreens();
    G.ui.closeNote && G.ui.closeNote();

    G.player.teleport(-4.7, 3.2, 3.2, Math.PI * 0.55);
    G.dv.blackout(false, 0.8);
    G.state = 'play';
    G.ui.setObjective('离开房间：慢慢转动门锁（长按 E）');
    G.ui.toast('这是一盘新的带子。');
    if (G.tutorial) G.tutorial.reset();
    setTimeout(() => {
      G.ui.say(BOY, '（他把我锁在里面了。门锁很旧……慢慢转，能弄开。）', 4.5);
    }, 1200);
  };

  // ---------------- 备忘 ----------------
  g.memoLines = function () {
    const r = G.run; if (!r) return '';
    const L = [];
    if (G.tutorial) L.push(G.tutorial.memoExtra());
    L.push(r.leftRoom ? '<div class="done">离开房间</div>' : '<div>离开房间：转动门锁</div>');
    if (r.leftRoom) {
      L.push(r.sawCard ? '<div class="done">找到书房钥匙，打开书房</div>' : '<div>找钥匙：厨房/沙发/电话桌/餐边柜</div>');
      if (r.sawCard) L.push(r.safeOpen ? '<div class="done">保险箱已打开（密码：母亲的日子）</div>' : '<div>保险箱密码 = 母亲忌日 MMDD（讣告卡）</div>');
      if (r.phoneAttached || r.junctionFixed) L.push(`<div${' ' + (r.phoneAttached ? 'class="done"' : '')}>听筒线</div>`);
      L.push(r.junctionFixed ? '<div class="done">地下室接线盒（螺丝刀）</div>' : '<div>修电话：地下室接线盒 + 螺丝刀</div>');
    }
    if (r.diaryFound) L.push('<div style="color:#ffb0b0">……母亲说：他不会停手的。你自己走。</div>');
    if (r.calling) L.push('<div style="color:#7ee27e">撑住：警察还有 ' + Math.ceil(r.policeTimer) + ' 秒</div>');
    return L.join('');
  };

  function refreshObj() {
    const r = G.run;
    if (!r) return;
    let t = '';
    if (r.ending) t = '';
    else if (r.calling) t = '警察还有 ' + Math.ceil(r.policeTimer) + ' 秒。别被发现。';
    else if (r.frontOpen) t = '大门开了。走出去。';
    else if (r.fatherAsleep) t = '他睡着了……';
    else if (!r.leftRoom) t = '离开房间：慢慢转动门锁（长按 E）';
    else if (r.safeOpen) t = '拿到大门钥匙了。去前门。';
    else if (r.sawCard && !r.safeOpen) t = '保险箱密码 = 母亲的忌日（MMDD）';
    else if (r.junctionFixed && r.phoneAttached) t = '电话修好了。拿起听筒拨打 911。';
    else t = '搜刮柜子：钥匙 / 听筒线 / 螺丝刀 / 电池';
    G.ui.setObjective(t);
  }

  function addProgress(n) { if (G.run) { G.run.progress += n; } refreshObj(); }

  // ---------------- 门 ----------------
  g.doorHold = function (d) {
    if (d.board || !d.locked) return 0;
    if (d.id === 'myroom') return G.save.permGear.lockpick ? 1.5 : 3.6;
    if (d.id === 'front') return G.items.has('frontKey') ? 2.0 : 0;
    if (d.id === 'study') return 0;
    if (d.id === 'storage') return G.save.permGear.lockpick ? 4.0 : 0;
    if (d.id === 'basement') return G.save.permGear.lockpick ? 4.0 : 0;
    return 0;
  };

  g.doorPrompt = function (d) {
    if (d.board) return '后门被木板钉死了 — 出不去';
    if (d.locked) {
      if (d.id === 'myroom') return G.save.permGear.lockpick ? '【长按E】 用开锁工具拨开旧锁（又快又安静）' : '【长按E】 慢慢转动旧锁（会很响）';
      if (d.id === 'study') return G.items.has('studyKey') ? '【E】 用钥匙打开书房门' : '【E】 书房门锁着（需要钥匙）';
      if (d.id === 'front') return G.items.has('frontKey') ? '【长按E】 用钥匙打开大门' : '【E】 大门被反锁了（需要钥匙）';
      if (d.id === 'storage') return G.save.permGear.lockpick ? '【长按E】 撬开储物间的锁' : '【E】 储物间锁着（需要开锁工具）';
      if (d.id === 'basement') return G.save.permGear.lockpick ? '【长按E】 撬开挂锁' : '【E】 门被从外面挂了锁';
    }
    return d.open ? '【E】 关门' : '【E】 开门';
  };

  g.useDoor = function (d) {
    const p = d.group.position.clone();
    if (d.board) { G.audio.doorLocked(p); G.ui.toast('木板钉死了。撬不开。'); return; }
    if (d.locked) {
      if (d.id === 'myroom') {
        d.locked = false; d.setOpen(true);
        G.audio.doorCreak(p); G.emitNoise(p, G.save.permGear.lockpick ? 4 : 9, 'door');
        if (!G.run.leftRoom) { G.run.leftRoom = true; addProgress(1); }
        G.ui.toast(G.save.permGear.lockpick ? '锁开了。一点声音都没有。' : '锁开了。门轴响得要命。');
      } else if (d.id === 'study') {
        if (G.items.has('studyKey')) {
          d.locked = false; d.setOpen(true); G.audio.doorCreak(p); G.emitNoise(p, 7, 'door');
          G.ui.toast('书房开了。'); addProgress(1);
        } else { G.audio.doorLocked(p); G.ui.toast('锁着的。父亲把钥匙藏起来了。'); }
      } else if (d.id === 'front') {
        if (G.items.has('frontKey')) {
          d.locked = false; d.setOpen(true); G.audio.doorCreak(p); G.emitNoise(p, 10, 'door');
          G.run.frontOpen = true; addProgress(1);
          G.ui.say(BOY, '……开了。真的开了。', 3); G.ui.toast('大门开了。走出去。');
        } else { G.audio.doorLocked(p); G.ui.toast('大门被反锁了。'); }
      } else if (d.id === 'storage') {
        if (G.save.permGear.lockpick) {
          d.locked = false; d.setOpen(true); G.audio.doorCreak(p); G.emitNoise(p, 6, 'door');
          G.ui.toast('撬开了。里面是被没收的东西。');
        } else { G.audio.doorLocked(p); G.ui.toast('储物间锁着。（需要开锁工具）'); }
      } else if (d.id === 'basement') {
        if (G.save.permGear.lockpick) {
          d.locked = false; d.setOpen(true); G.audio.doorCreak(p); G.emitNoise(p, 6, 'door');
        } else { G.audio.doorLocked(p); G.ui.toast('挂锁。他第二次抓到我之后加的。'); }
      }
      return;
    }
    d.setOpen(!d.open);
    G.audio.doorCreak(p); G.emitNoise(p, 6.5, 'door');
  };

  g.frontDoorOpened = function () { if (G.run) G.run.frontOpen = true; refreshObj(); };

  // ---------------- 搜刮 ----------------
  g.searchContainer = function (id) {
    const c = G.world.containers.find(x => x.id === id);
    if (!c) return;
    const pos = c.mesh.position.clone();
    G.audio.drawer(pos);
    G.emitNoise(pos, 6.5, 'search');
    const res = G.items.search(c);
    G.run.searchedCount++;
    if (res.text) G.ui.toast(res.text, 3.4);
    if (res.note) G.ui.showNote(res.note[0], res.note[1]);
    if (res.item === 'card') { G.run.sawCard = true; addProgress(1); }
    if (res.item === 'bill') G.run.sawBill = true;
    if (res.item === 'diary') {
      G.run.diaryFound = true; addProgress(1);
      G.ui.say(BOY, '“他不会停手的。请你自己走。走。”', 4.5);
    }
    if (res.item === 'battery') G.dv.addBattery(70);
    refreshObj();
  };

  // ---------------- 电话 / 接线盒 ----------------
  g.phonePrompt = function () {
    const r = G.run;
    if (r.calling) return '【E】 …警察在路上';
    if (!G.items.has('phoneCord') && !r.phoneAttached) return '【E】 电话机（听筒线被扯断了）';
    if (!r.phoneAttached) return '【E】 接上听筒线';
    if (!r.junctionFixed) return '【E】 拿起听筒（只有杂音）';
    return '【长按E】 拨打 911';
  };
  g.usePhone = function (holdDone) {
    const r = G.run;
    const pos = G.world.meshes.phone.position.clone();
    if (r.calling) { G.ui.toast('别挂……再撑一会。'); return; }
    if (!r.phoneAttached) {
      if (!G.items.has('phoneCord')) { G.audio.error(); G.ui.toast('听筒线被扯断了。父亲把它藏起来了。'); return; }
      if (!holdDone) return;
      G.items.remove('phoneCord'); r.phoneAttached = true;
      G.world.meshes.phoneCoil.visible = true;
      G.audio.glassClink(pos); G.ui.toast('听筒线接上了。'); addProgress(1); refreshObj();
      return;
    }
    if (!r.junctionFixed) { G.audio.staticBurst(0.5, 0.16); G.ui.toast('只有杂音……电话线在地下室被剪断了。'); return; }
    if (!holdDone) return;
    startCall();
  };

  g.junctionPrompt = function () {
    if (G.run.junctionFixed) return '【E】 电话线已经接好了';
    return G.items.has('screwdriver') ? '【长按E】 打开接线盒，把电话线接回去' : '【E】 接线盒（被螺丝拧死了，需要螺丝刀）';
  };
  g.useJunction = function (holdDone) {
    const r = G.run;
    const pos = G.world.meshes.junction.position.clone();
    if (r.junctionFixed) { G.ui.toast('已经接好了。'); return; }
    if (!G.items.has('screwdriver')) { G.audio.error(); G.ui.toast('需要螺丝刀。'); return; }
    if (!holdDone) return;
    r.junctionFixed = true; G.items.remove('screwdriver');
    G.audio.beep(600, 0.1); G.audio.drawer(pos); G.emitNoise(pos, 7, 'fix');
    G.ui.toast('电话线接好了。去门厅拿听筒。'); addProgress(1); refreshObj();
  };

  function startCall() {
    const r = G.run; if (r.calling) return;
    r.calling = true; r.policeTimer = 78;
    G.audio.stopDial();
    G.father.setPhase(2); G.father.speedMul = 1.2;
    G.father.target = G.world.meshes.phone.position.clone();
    G.father.node = G.world.nodeById.hallFront;
    G.father.goto(G.world.nodeById.hallFront); G.father.state = 'investigate';
    refreshObj();
    G.ui.say(BOY, '……喂？喂，求求你……', 3);
    setTimeout(() => { G.audio.beep(880, 0.1); G.audio.beep(880, 0.1); }, 400);
    setTimeout(() => { G.audio.beep(880, 0.1); G.audio.beep(880, 0.1); }, 900);
    setTimeout(() => {
      G.audio.speak('Nine one one, what is your emergency?', { pitch: 1.15, rate: 1.0 });
      G.ui.say('接线员', '这里是911，请问发生了什么？', 3.4);
    }, 1900);
    setTimeout(() => {
      G.audio.speak('Please... my dad, he\'s hurting me. Fourteen Maple Street. Please hurry.', { pitch: 1.35, rate: 1.05 });
      G.ui.say(BOY, '求求你……我爸，他要打死我。枫树街14号。快点来。', 4.5);
    }, 5600);
    setTimeout(() => {
      G.audio.speak('Stay calm. Officers are on the way. Can you hide somewhere safe?', { pitch: 1.15, rate: 1.0 });
      G.ui.say('接线员', '保持冷静，警官已经在路上。你能先藏起来吗？', 4);
    }, 9400);
    G.ui.toast('拨通了。撑到警察来。', 4);
  }

  // ---------------- 保险箱 ----------------
  g.safePrompt = function () { return G.run.safeOpen ? '保险箱已经空了' : '【E】 输入四位数字密码'; };
  g.useSafe = function () {
    if (G.run.safeOpen) { G.ui.toast('里面什么都没有了。'); return; }
    G.state = 'play';
    G.ui.openKeypad(code => {
      if (code === G.run.code) {
        G.run.safeOpen = true; G.run.frontOpen = false;
        const s = G.world.meshes.safe;
        const open = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.06), new THREE.MeshLambertMaterial({ color: 0x2a2d33 }));
        open.position.set(0.4, 0.38, 0.36); open.rotation.y = -1.2; s.add(open);
        G.audio.beep(1200, 0.12); G.audio.doorCreak(s.position);
        G.emitNoise(s.position, 5, 'safe');
        G.items.add('frontKey');
        G.ui.say(BOY, '咔哒——开了。里面躺着大门的钥匙。', 4);
        addProgress(2); refreshObj();
      } else {
        G.audio.error(); G.ui.toast('不对。'); G.emitNoise(G.world.meshes.safe.position, 5, 'safe');
      }
    });
  };

  // ---------------- 隐藏结局：威士忌 ----------------
  g.whiskeyPrompt = function () {
    const r = G.run;
    if (r.whiskeyDosed) return '【E】 酒里已经下过药了。等他喝。';
    if (!r.diaryFound) return '【E】 父亲的威士忌';
    if (!G.items.has('pills')) return '【E】 威士忌（你想起了母亲的日记……）';
    return '【长按E】 把药碾碎，倒进他的酒里';
  };
  g.useWhiskey = function (holdDone) {
    const r = G.run;
    const pos = G.world.meshes.whiskey.position.clone();
    if (r.whiskeyDosed) { G.ui.toast('等他喝。'); return; }
    if (!r.diaryFound) { G.ui.toast('父亲每晚都要喝这个。'); return; }
    if (!G.items.has('pills')) { G.ui.toast('你需要点什么……让他停下来。'); return; }
    if (!holdDone) return;
    G.items.remove('pills'); r.whiskeyDosed = true;
    G.audio.glassClink(pos); G.ui.toast('药碾碎了，混进酒里。现在只能等。');
    G.ui.say(BOY, '“他不会停手的。”……那就让他停下来。', 4.5);
    addProgress(2); refreshObj();
  };

  // ---------------- 躲藏 ----------------
  g.toggleHide = function (mesh, camPos, camY) {
    const p = G.player;
    if (p.hidden === mesh) {
      p.exitHidden(); G.audio.cabinet(mesh.position); G.emitNoise(mesh.position, 3, 'hide');
      G.dv.focusHunt(500); return;
    }
    p.setHidden(mesh, camPos, camY);
    G.audio.cabinet(mesh.position); G.emitNoise(mesh.position, 3.5, 'hide');
    G.dv.focusHunt(500);
    // 他要是看着你躲进去的——他就会来拉开柜门
    if (G.father.state === 'chase' || (G.father.state === 'search' && Math.random() < 0.5)) {
      G.father.searchSpot = G.world.hideSpots.find(s => s.mesh === mesh);
      if (G.father.searchSpot) { G.father.goto(mesh.position); G.father.state = 'gotoSpot'; }
    }
  };

  g.onTVToggle = function (on) {
    if (!on && G.father.room().id === 'living') G.father.tvTrip = true;
  };

  // ---------------- 被抓 / 三振出局 ----------------
  g.onCaught = function (fromHide) {
    const r = G.run;
    if (!r || r.ending || r.frozen > 0) return;
    r.strikes++;
    G.ui.setStrikes(r.strikes);
    G.audio.sting(); G.audio.shutUp();
    G.dv.glitch(1.0, 1.1);
    G.player.shake = 1.2;
    G.father.state = 'drag';

    if (r.strikes >= 3) {
      G.state = 'dead';
      setTimeout(() => {
        G.dv.static(0.85); G.dv.blackout(true, 0.4);
        G.audio.staticBurst(1.2, 0.4);
        setTimeout(() => {
          G.save.deaths++; persist();
          const gear = Object.keys(G.save.permGear).filter(k => G.save.permGear[k]).length;
          G.audio.setTension(0); G.audio.shutUp(); G.audio.deathDrone();
          G.dv.blackout(false, 0.8);
          // 血红标题「逃出失败」→ 小字「你被父亲杀死了」→ 按钮，逐段淡入
          G.ui.showDeath(
            '摄像机在走廊里翻滚，最后停在他的鞋上。<br>' +
            '画面里有电视的蓝光，和你自己的呼吸声。<br><br>' +
            `继承装备 <span style="color:#ffd24a">${gear}</span> 件　·　已玩 ${G.save.runs} 局　·　死亡 ${G.save.deaths} 次`);
          document.exitPointerLock && document.exitPointerLock();
        }, 1500);
      }, 900);
      return;
    }

    // 拖回房间
    r.frozen = 2.2;
    G.dv.blackout(true, 0.25);
    G.audio.doorSlam(G.player.pos.clone());

    if (r.strikes === 1) {
      const lost = G.items.confiscate();
      // 没收的东西被扔进储物间
      const boxes = ['stoBox1', 'stoBox2'];
      let bi = 0;
      for (const it of lost) {
        if (it === 'diary') continue;
        const c = G.world.containers.find(x => x.id === boxes[bi]);
        if (c && !c.pendingItem && bi < boxes.length) { c.pendingItem = it; bi++; }
      }
    } else if (r.strikes === 2) {
      G.world.doors.basement.locked = true;
      G.father.speedMul = 1.22; G.father.angryExtra = 1;
      // 把还没找到的听筒线挪个地方
      const c = G.world.containers.find(x => x.pendingItem === 'phoneCord');
      if (c) {
        c.pendingItem = null;
        const pool = G.world.containers.filter(x => !x.pendingItem && !x.searched && x.room !== 'storage');
        if (pool.length) pool[Math.floor(Math.random() * pool.length)].pendingItem = 'phoneCord';
      }
    }

    setTimeout(() => {
      if (!G.run) return;
      G.player.teleport(-4.7, 3.2, 3.2, Math.PI * 0.55);
      G.world.doors.myroom.locked = true; G.world.doors.myroom.open = false; G.world.doors.myroom.anim = 0;
      G.father.reset(true); G.father.setPhase(r.strikes >= 2 ? 2 : 1);
      G.dv.blackout(false, 1.0);
      G.dv.focusHunt(900);
      if (r.strikes === 1) {
        G.audio.speak('Back in your room. Don\'t make me say it twice.', { pitch: 0.55, rate: 0.85 });
        G.ui.say('父亲', '滚回你房间去。别让我说第二遍。', 4);
        G.ui.toast('他把你的东西扔进储物间，锁起来了。', 4);
      } else {
        G.audio.speak('That\'s twice. Next time I won\'t be gentle.', { pitch: 0.5, rate: 0.8 });
        G.ui.say('父亲', '第二次了。下次我不会客气。', 4.5);
        G.ui.toast('他加强了防范：地下室挂了锁，巡逻更快了。', 5);
      }
      r.frozen = 0;
    }, 1600);
  };

  // ---------------- 与睡着的父亲互动 ----------------
  g.useFather = function () {
    if (!G.run.fatherAsleep) return;
    G.ui.choice('他睡着了。手里的酒瓶还没放下。<br><br>你举起摄像机，对准他的脸。<br>手指停在那个红色的 REC 键上。',
      () => g.ending('kill'),
      () => { G.ui.toast('你放下了摄像机。'); });
  };

  // ---------------- 结局 ----------------
  g.ending = function (kind) {
    const r = G.run;
    if (!r || r.ending) return;
    r.ending = kind; r.cutT = 0; r.cutKind = kind;
    G.state = 'ending';
    G.audio.shutUp(); G.audio.setTension(0);
    G.ui.setPrompt(''); G.ui.setObjective('');
    document.exitPointerLock && document.exitPointerLock();
    G.save.endings[kind] = true; persist();

    if (kind === 'front') {
      G.audio.staticBurst(0.4, 0.2);
      setTimeout(() => {
        G.audio.speak('I\'m out. I\'m actually out.', { pitch: 1.35, rate: 1.0 });
        G.ui.say(BOY, '我出来了。我真的出来了。', 5);
      }, 1800);
    } else if (kind === 'police') {
      G.audio.siren(true);
      G.audio.knock(new THREE.Vector3(0, 1.2, 4.9), 4);
      setTimeout(() => {
        G.audio.speak('Police! Open up!', { pitch: 0.7, rate: 1.0 });
        G.ui.say('警察', '警察！开门！', 4);
      }, 1200);
      g.policeLights = true;
    } else if (kind === 'kill') {
      G.dv.glitch(1, 0.8); G.audio.staticBurst(1.4, 0.35);
      setTimeout(() => {
        G.audio.speak('I\'m not afraid of you anymore.', { pitch: 1.2, rate: 0.85 });
        G.ui.say(BOY, '我不再怕你了。', 5);
      }, 1200);
    }
    setTimeout(() => g.showEndingScreen(kind), 7000);
  };

  g.showEndingScreen = function (kind) {
    const mm = Math.floor(G.run.t / 60), ss = Math.floor(G.run.t % 60);
    const stats = `用时 ${mm} 分 ${String(ss).padStart(2, '0')} 秒　·　搜过 ${G.run.searchedCount} 个柜子　·　被抓 ${G.run.strikes} 次<br>` +
      `结局达成：${Object.keys(G.save.endings).filter(k => G.save.endings[k]).length} / 3　·　永久装备 ${Object.keys(G.save.permGear).filter(k => G.save.permGear[k]).length} 件`;
    const data = {
      front: {
        title: '结 局 一 · 门',
        body: '你推开纱门，赤脚踩在湿冷的草坪上。<br>' +
          '摄像机一路晃着，录下你的喘息、街灯、和远处狗叫。<br><br>' +
          '你在街角蹲下来，把镜头转过来对准自己。<br>' +
          '<span style="color:#7ee27e">“我出来了。”</span><br><br>' +
          '<span style="color:#777">——带子到此为止。</span>',
      },
      police: {
        title: '结 局 二 · 911',
        body: '红蓝的光透过窗户，在天花板上转了一圈，又一圈。<br>' +
          '有人砸门，喊着 <span style="color:#9df">“POLICE! OPEN UP!”</span>。<br><br>' +
          '你坐在楼梯上抱着膝盖，摄像机还开着。<br>' +
          '客厅里传来他的咆哮，然后是玻璃碎掉的声音。<br>' +
          '有人把毯子披在你肩上，说：<span style="color:#7ee27e">“你安全了。”</span><br><br>' +
          '<span style="color:#777">——带子到此为止。</span>',
      },
      kill: {
        title: '结 局 三 · 停止录制',
        body: '你走过去。他睡得很沉，酒瓶还攥在手里。<br>' +
          '你从来没有见过他这么安静的样子。<br><br>' +
          '你举起摄像机，对准他的脸，手指停在 REC 键上。<br>' +
          '<span style="color:#f99">“我不再怕你了。”</span><br><br>' +
          '画面暗下去。时间戳跳了整整三分钟。<br>' +
          '那三分钟里发生了什么，这盘带子不会说。<br><br>' +
          '<span style="color:#777">——带子到此为止。</span>',
      },
    }[kind];
    G.audio.rewind();
    G.dv.blackout(false, 1.2);
    G.ui.showEnding(kind, data.title, data.body, stats);
  };

  // ---------------- 每帧 ----------------
  g.update = function (dt, t) {
    const r = G.run;
    if (!r) return;

    if (G.state === 'ending' && r.cutKind) {
      updateCutscene(dt, r.cutKind);
      return;
    }
    if (G.state !== 'play') return;

    r.t += dt;
    if (r.frozen > 0) r.frozen -= dt;

    // 阶段
    let ph = 0;
    if (r.progress >= 2 || r.strikes >= 1) ph = 1;
    if (r.progress >= 4 || r.strikes >= 2 || r.calling) ph = 2;
    if (ph !== r.phase) {
      r.phase = ph; G.father.setPhase(ph);
      if (ph === 1) G.ui.toast('楼下的电视声停了。', 3.5);
      if (ph === 2) G.ui.toast('他在找你。整栋房子都在响。', 4);
    }

    // 紧张度 → 心跳
    const fd = Math.hypot(G.father.pos.x - G.player.pos.x, G.father.pos.z - G.player.pos.z);
    let tension = clamp(1 - fd / 12, 0, 1);
    if (G.father.state === 'chase') tension = 1;
    if (G.player.hidden) tension *= 0.6;
    G.audio.setTension(tension);

    // 警察倒计时
    if (r.calling && r.policeTimer > 0) {
      r.policeTimer -= dt;
      if (r.policeTimer < 46 && !r.sirenOn) { r.sirenOn = true; G.audio.siren(true); }
      if (r.policeTimer % 15 < dt) {
        G.ui.say(BOY, '还有 ' + Math.ceil(r.policeTimer) + ' 秒……别让他看见我。', 2.6);
      }
      if (r.policeTimer <= 0) g.ending('police');
      refreshObj();
    }

    // 隐藏结局流程
    if (r.whiskeyDosed && !r.fatherDrank) {
      if (G.father.state === 'sit') {
        r.drinkT += dt;
        if (r.drinkT > 2.5) {
          r.fatherDrank = true; r.drinkT = 0;
          G.audio.glug(G.father.pos.clone()); G.father.say('drink');
          G.ui.toast('他在喝酒。', 3);
        }
      }
    } else if (r.fatherDrank && !r.fatherAsleep) {
      r.sleepT += dt;
      if (r.sleepT > 24) {
        r.fatherAsleep = true; G.father.sleep();
        G.ui.toast('楼下的电视声停了。他睡着了。', 5);
        G.ui.say(BOY, '……他睡着了。我从来没见过他这么安静。', 4.5);
        refreshObj();
      }
    }
    // 睡着的父亲：靠近可互动
    if (r.fatherAsleep) {
      const d = Math.hypot(G.player.pos.x - G.father.pos.x, G.player.pos.z - G.father.pos.z);
      g.fatherFocus = d < 2.4 && Math.abs(G.player.pos.y - G.father.pos.y) < 2.2;
      if (g.fatherFocus) G.ui.setPrompt('【E】 他睡着了。从未见过他这样安静。');
    }

    // 前门结局：走出去
    if (r.frontOpen && G.player.pos.z > 6.4 && G.state === 'play') g.ending('front');
  };

  // 结局小过场
  function updateCutscene(dt, kind) {
    const r = G.run; r.cutT += dt;
    if (kind === 'front') {
      // 自动跑向街道
      const p = G.player;
      p.pos.lerp(tmp.set(0, 0, 13), Math.min(1, dt * 0.42));
      const gy = G.world.groundY(p.pos.x, p.pos.z, p.pos.y);
      p.pos.y += (gy - p.pos.y) * Math.min(1, dt * 8);
      p.yaw = Math.PI; p.pitch = -0.06;
      G.camera.position.set(p.pos.x, p.pos.y + 1.55 + Math.sin(r.cutT * 9) * 0.04, p.pos.z);
      G.camera.rotation.set(p.pitch, p.yaw, Math.sin(r.cutT * 1.7) * 0.01, 'YXZ');
      if (r.cutT > 4.5 && !r.faded) {
        r.faded = true; G.dv.flash(0.9, 1.2);
      }
    } else if (kind === 'police') {
      // 红蓝灯光
      const c = Math.sin(r.cutT * 7) > 0 ? 0xff2222 : 0x2244ff;
      for (const k in G.world.meshes) {
        if (k.indexOf('win_') === 0) G.world.meshes[k].material.color.setHex(c);
      }
      const p = G.player;
      G.camera.position.set(p.pos.x, p.pos.y + 1.55, p.pos.z);
      G.camera.rotation.set(p.pitch, p.yaw, 0, 'YXZ');
    } else if (kind === 'kill') {
      G.player.pitch += dt * 0.05;
      G.camera.position.set(G.player.pos.x, G.player.pos.y + G.player.eyeY, G.player.pos.z);
      G.camera.rotation.set(G.player.pitch, G.player.yaw, 0, 'YXZ');
      if (r.cutT > 2 && !r.blacked) { r.blacked = true; G.dv.blackout(true, 1.6); }
    }
  }

  return g;
}
