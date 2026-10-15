// items.js — 战利品、临时道具、永久装备（localStorage 跨局继承）
import { G, pick, rand, randi } from './state.js';

const SAVE_KEY = 'homevideo_save_v1';

export const ITEMS = {
  battery:   { name: '备用电池', desc: 'DV 的电池。黑暗里唯一的眼睛。' },
  phoneCord: { name: '电话听筒线', desc: '被父亲扯下来的那根。接上它就能打电话。' },
  screwdriver:{ name: '螺丝刀', desc: '地下室接线盒需要它。' },
  studyKey:  { name: '书房钥匙', desc: '小小的黄铜钥匙，父亲总把它藏起来。' },
  pills:     { name: '安眠药', desc: '母亲的。瓶子里还剩十几片。' },
  frontKey:  { name: '大门钥匙', desc: '终于——通往外面的那把。' },
  diary:     { name: '母亲的日记', desc: '藏在衣柜底板下的那一本。' },
};

export const PERM = {
  lockpick: { name: '开锁工具组', desc: '小时候拆锁用的。可以撬开储物间、被加强的地下室门。' },
  sneakers: { name: '妈妈的旧运动鞋', desc: '脚步声更轻一点，跑得也快一点。' },
  memo:     { name: '备忘涂鸦', desc: '搜过的柜子会被标记，不再浪费时间。' },
  bigbatt:  { name: '大容量电池组', desc: '每局起始电量 +60%，耗电更慢。' },
};

const JUNK = [
  '一堆旧衣服，有股霉味。', '生锈的钥匙扣，配不上任何一把锁。', '空啤酒罐。这周的第三个。',
  '过期的优惠券。妈妈以前会剪这些。', '几枚硬币。你数了数，一共七毛。',
  '橡皮筋和回形针。', '一只不成对的袜子。', '旧电池——没电了。',
  '一本封面撕掉的书。', '干掉的马克笔。', '一张没写字的明信片。',
];

const DEFAULT_SAVE = { permGear: { lockpick: false, sneakers: false, memo: false, bigbatt: false }, runs: 0, deaths: 0, endings: {} };

export function loadSave() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { s = null; }
  if (!s || typeof s !== 'object') s = JSON.parse(JSON.stringify(DEFAULT_SAVE));
  s.permGear = Object.assign({}, DEFAULT_SAVE.permGear, s.permGear || {});
  s.endings = s.endings || {}; s.runs = s.runs || 0; s.deaths = s.deaths || 0;
  G.save = s;
  return s;
}
export function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(G.save)); } catch (e) {} }

export function createItems() {
  const api = {
    inv: [],
    has: id => api.inv.indexOf(id) >= 0,
    add(id, silent) {
      if (api.has(id) && id !== 'battery') return false;
      api.inv.push(id);
      if (!silent) {
        const d = ITEMS[id] || PERM[id];
        G.ui.toast('捡到：' + (d ? d.name : id));
        G.audio.pickup();
        if (d && d.desc) G.ui.say('男孩', d.name + ' — ' + d.desc, 2.4);
      }
      G.ui.updateInventory();
      return true;
    },
    remove(id) { const i = api.inv.indexOf(id); if (i >= 0) api.inv.splice(i, 1); G.ui.updateInventory(); },
    count(id) { return api.inv.filter(x => x === id).length; },
    confiscate() {
      const lost = api.inv.slice();
      api.inv.length = 0; G.ui.updateInventory();
      return lost;
    },

    // 每局开始时：给容器塞东西
    rollRun(world, run) {
      const C = id => world.containers.find(c => c.id === id);
      for (const c of world.containers) { c.searched = false; c.pendingItem = null; c.special = null; }

      // 固定线索
      C('studyDesk').pendingItem = 'card';          // 讣告卡 → 保险箱密码
      C('filing').pendingItem = 'bill';             // 账单 → 密码旁证
      C('medCab').pendingItem = 'pills';
      C('pWardrobe').pendingItem = 'junk';
      C('pWardrobe').special = 'loose';             // 二次翻找 → 日记

      // 关键道具随机埋点
      const pickFrom = (list) => {
        const free = list.filter(id => C(id) && !C(id).pendingItem);
        return free.length ? pick(free) : null;
      };
      const k1 = pickFrom(['kDrawer1', 'ctable', 'phoneTable', 'china']);
      if (k1) C(k1).pendingItem = 'studyKey';
      const k2 = pickFrom(['sofa', 'dresser', 'uShelf', 'bShelf2', 'fridge']);
      if (k2) C(k2).pendingItem = 'phoneCord';
      const k3 = pickFrom(['toolbox', 'lowerCab', 'uShelf', 'stoBox1', 'studyShelf']);
      if (k3) C(k3).pendingItem = 'screwdriver';

      // 散落电池
      const all = world.containers.map(c => c.id).filter(id => { const c = C(id); return c && !c.pendingItem; });
      const nBat = randi(3, 5);
      for (let i = 0; i < nBat && all.length; i++) {
        const idx = Math.floor(Math.random() * all.length);
        C(all[idx]).pendingItem = 'battery'; all.splice(idx, 1);
      }

      // 永久装备：一局最多掉一件没拥有的
      const unowned = Object.keys(PERM).filter(k => !G.save.permGear[k]);
      if (unowned.length && Math.random() < 0.55) {
        const permContainers = ['toolbox', 'sofa', 'pWardrobe', 'stoBox2', 'bShelf1'];
        const avail = permContainers.filter(id => { const c = C(id); return c && !c.pendingItem && (id !== 'stoBox2' || G.save.permGear.lockpick); });
        if (avail.length) C(pick(avail)).pendingItem = 'perm:' + pick(unowned);
      }
    },

    // 搜索容器 → 返回展示文本
    search(c) {
      const out = { text: '', note: null, item: null };
      if (c.searched && !c.special) {
        out.text = G.save.permGear.memo ? '这个已经搜过了。' : '翻了一遍，什么都没有了。';
        return out;
      }
      const p = c.pendingItem;
      if (p === 'card') {
        out.item = 'card';
        out.note = ['讣告卡', `「${run().momName}\n1966 – 2003.${run().deathMonth}.${run().deathDay}\n永远在我们心里。」\n\n卡片背面是父亲的字：「保险箱：她的日子。」`];
        out.text = '抽屉最里面压着一张讣告卡。';
      } else if (p === 'bill') {
        out.item = 'bill';
        out.note = ['电费单', '过期未缴。账单底下父亲写着一行小字：\n「再不开门，我就把整栋房子锁死。」'];
        out.text = '一叠账单。';
      } else if (p && p.indexOf('perm:') === 0) {
        const gid = p.slice(5);
        G.save.permGear[gid] = true; persist();
        out.note = ['★ 永久装备', PERM[gid].name + '\n' + PERM[gid].desc + '\n\n（它会跟着你到下一盘带子里。）'];
        out.text = '压在最底下的东西……';
        out.item = 'perm';
      } else if (p === 'pills') {
        api.add('pills'); out.item = 'pills';
        out.text = '母亲的安眠药。瓶身上落了一层灰。';
        out.note = ['安眠药', '「每晚一片，睡个好觉。」\n你记得妈妈再也睡不着之后，是爸爸开始吃这些的。'];
      } else if (p && ITEMS[p]) {
        api.add(p); out.item = p;
        out.text = { battery: '一节备用电池。', phoneCord: '被扯断的电话听筒线！', screwdriver: '一把螺丝刀。',
          studyKey: '一把黄铜小钥匙——书房门用的。', frontKey: '', diary: '母亲的字迹。' }[p] || '找到了点东西。';
      } else {
        out.text = pick(JUNK);
        if (Math.random() < 0.16) { api.add('battery'); out.item = 'battery'; out.text += ' 底下压着一节电池。'; }
      }
      c.pendingItem = null; c.searched = true;
      if (c.special === 'loose' && !run().diaryFound) {
        c.searched = false; c.special = 'loose2';
        out.text += '\n（衣柜底板好像是松的……再翻一次？）';
      } else if (c.special === 'loose2') {
        c.special = null; c.searched = true;
        run().diaryFound = true; api.add('diary'); out.item = 'diary';
        out.text = '底板下面藏着一本日记。';
        out.note = ['母亲的日记', '最后一页的字迹抖得厉害：\n「他不会停手的。警察不会来，亲戚不会来。\n如果有人看到这行字——请你自己走。走。」'];
      }
      return out;
    },
  };
  function run() { return G.run; }
  return api;
}
