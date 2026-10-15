// world.js — 房子、家具、门、容器、路点、角色低模
import * as THREE from 'three';
import { G, rand, pick, clamp } from './state.js';

const COL = {
  wall: 0x8a8074, wallUp: 0x9c8f80, floorWood: 0x6d5236, floorTile: 0x8d9498,
  floorCarpet: 0x5a5f6e, ceil: 0x565049, door: 0x5f4630, trim: 0x3a3129,
  sofa: 0x6e4a3a, sofaDark: 0x5a3b2e, wood: 0x715039, woodDark: 0x4a3526,
  metal: 0x7d8288, fridge: 0xb9beb9, counter: 0x8f9487, bedSheet: 0x9aa3ad,
  bedSheet2: 0x7d6a6a, tv: 0x222428, screenOn: 0x6fa0c8, grass: 0x2c3a26,
  street: 0x2a2a2c, concrete: 0x55565a, night: 0x0a0e18,
};

function mat(c) { return new THREE.MeshLambertMaterial({ color: c }); }
function box(w, h, d, c, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c));
  m.position.set(x, y, z); m.castShadow = false; m.receiveShadow = false; return m;
}

// ---------- 门 ----------
class Door {
  constructor(scene, x, z, w, rotY, opts = {}) {
    this.id = opts.id; this.name = opts.name || '门';
    this.locked = !!opts.locked; this.board = !!opts.board; this.noLockpick = !!opts.noLockpick;
    this.w = w; this.open = false; this.anim = 0; this.baseRot = rotY;
    this.onOpen = opts.onOpen || null; this.onLocked = opts.onLocked || null;
    this.group = new THREE.Group();
    this.group.position.set(x, opts.y || 0, z);
    this.group.rotation.y = rotY;
    this.pivot = new THREE.Group();
    this.pivot.position.set(-w / 2, 0, 0);
    this.panel = box(w, 2.35, 0.09, opts.color || COL.door, w / 2, 1.175, 0);
    this.panel.userData.isDoor = this;
    const knob = box(0.07, 0.07, 0.16, 0xc9a86a, w - 0.28, 1.05, 0);
    this.pivot.add(this.panel, knob);
    this.group.add(this.pivot);
    if (opts.y) this.group.children.forEach(() => {}); // y offset handled by position
    if (opts.y) this.pivot.position.y = 0;
    scene.add(this.group);
    if (this.board) {
      const b1 = box(w * 0.9, 0.28, 0.06, 0x5c4530, 0, 1.5, 0.1);
      const b2 = box(w * 0.9, 0.28, 0.06, 0x5c4530, 0, 0.9, 0.14);
      this.group.add(b1, b2);
    }
  }
  setOpen(o) { if (this.open !== o) { this.open = o; if (o && this.onOpen) this.onOpen(this); } }
  update(dt) { this.anim += ((this.open ? 1 : 0) - this.anim) * Math.min(1, dt * 6); this.pivot.rotation.y = this.anim * -1.9; }
}

// ---------- 房间 ----------
const ROOMS = [
  { id: 'living',  name: '客厅',   f: 0,   x1: -8, x2: -1.5, z1: 0.2, z2: 5 },
  { id: 'hall',    name: '门厅',   f: 0,   x1: -1.5, x2: 1.5, z1: -1, z2: 5 },
  { id: 'study',   name: '书房',   f: 0,   x1: -8, x2: -1.5, z1: -5, z2: 0.2 },
  { id: 'dining',  name: '餐厅',   f: 0,   x1: -1.5, x2: 1.5, z1: -5, z2: -1 },
  { id: 'kitchen', name: '厨房',   f: 0,   x1: 1.5, x2: 8, z1: -1, z2: 5 },
  { id: 'utility', name: '杂物间', f: 0,   x1: 1.5, x2: 8, z1: -5, z2: -1 },
  { id: 'basement',name: '地下室', f: -1,  x1: 1.5, x2: 8, z1: -5, z2: -1 },
  { id: 'uphall',  name: '楼上走廊', f: 1, x1: -1.5, x2: 3, z1: -5, z2: 5 },
  { id: 'myroom',  name: '我的房间', f: 1, x1: -8, x2: -1.5, z1: 0.5, z2: 5 },
  { id: 'parents', name: '父母房间', f: 1, x1: -8, x2: -1.5, z1: -5, z2: 0.5 },
  { id: 'bath',    name: '浴室',   f: 1,   x1: 3, x2: 8, z1: -5, z2: -0.5 },
  { id: 'storage', name: '储物间', f: 1,   x1: 3, x2: 8, z1: -0.5, z2: 5 },
  { id: 'outside', name: '屋外',   f: 0,   x1: -99, x2: 99, z1: 5, z2: 99 },
];

// 主楼梯 x[0.5,1.5] z[0.7,4.6] 南低北高 / 地下室楼梯 x[2.1,3.3] z[-4.2,-1] 北低
function groundY(x, z, curY) {
  // 主楼梯（x[0.5,1.5] z[0.7,4.6]，南低北高）——不论当前高度，都按坡度走，避免穿台阶
  if (x >= 0.5 && x <= 1.5 && z >= 0.7 && z <= 4.6) {
    return clamp((4.6 - z) / (4.6 - 0.7), 0, 1) * 3.2;
  }
  // 地下室楼梯（x[2.1,3.3] z[-4.2,-1]，北低南高，向下）
  if (x >= 2.1 && x <= 3.3 && z >= -4.2 && z <= -1) {
    return clamp((-1 - z) / 3.2, 0, 1) * -2.8;
  }
  if (curY < -1.4) return -2.8;
  if (curY > 1.8) return 3.2;
  return 0;
}

export function buildWorld() {
  const scene = G.scene;
  const world = {
    colliders: [],       // {x1,x2,z1,z2,y1,y2}
    doors: {},
    containers: [],
    hideSpots: [],
    rooms: ROOMS,
    interactables: [],   // {mesh, getPrompt(), use(holdDone)}
    blockers: [],        // 视线阻挡 mesh 列表
    lights: {},
    meshes: {},
    doorList: [],
  };

  const addCol = (x1, x2, z1, z2, y1, y2) => world.colliders.push({ x1: Math.min(x1,x2), x2: Math.max(x1,x2), z1: Math.min(z1,z2), z2: Math.max(z1,z2), y1, y2 });

  // ============ 楼板 ============
  const mkFloor = (x1, x2, z1, z2, y, c, th = 0.2) => {
    const f = box(x2 - x1, th, z2 - z1, c, (x1+x2)/2, y - th/2, (z1+z2)/2);
    scene.add(f); world.blockers.push(f); return f;
  };
  // 一层地面（在地下室楼梯口 x[2.1,3.3] z[-4.2,-1] 留洞，否则会穿楼板）
  mkFloor(-8, 2.1, -5, 5, 0, COL.floorWood);
  mkFloor(3.3, 8, -5, 5, 0, COL.floorWood);
  mkFloor(2.1, 3.3, -5, -4.2, 0, COL.floorWood);
  mkFloor(2.1, 3.3, -1, 5, 0, COL.floorWood);
  // 地毯：客厅/门厅
  scene.add(box(6, 0.04, 4.4, 0x4e4438, -4.7, 0.02, 2.6));
  scene.add(box(2.6, 0.04, 5.6, COL.floorCarpet, 0, 0.02, 2));
  // 二层楼板（楼梯洞 x[0.5,1.5] z[0.7,4.6]）
  mkFloor(-8, 0.5, 0.7, 5, 3.2, COL.floorWood);
  mkFloor(1.5, 3, -5, 5, 3.2, COL.floorWood);
  mkFloor(-1.5, 3, -5, 0.7, 3.2, COL.floorWood);
  mkFloor(-8, -1.5, -5, 0.5, 3.2, COL.floorWood);
  mkFloor(3, 8, -5, 5, 3.2, COL.floorWood);
  mkFloor(1.5, 3, 0.7, 5, 3.2, COL.floorWood);
  // 地下室楼板（一层地面即其顶），地下室地面
  mkFloor(1.5, 8, -5, -1, -2.8, 0x4a4a4c);
  // 天花板（避让楼梯洞 x[0.5,1.5] z[0.7,4.6]，否则楼梯被封死）
  scene.add(box(8.5, 0.2, 4.3, COL.ceil, -3.75, 3.1, 2.85));
  scene.add(box(6.5, 0.2, 4.3, COL.ceil, 4.75, 3.1, 2.85));
  scene.add(box(16, 0.2, 5.7, COL.ceil, 0, 3.1, -2.15));
  scene.add(box(16, 0.2, 10, COL.ceil, 0, 6.1, 0));
  scene.add(box(6.5, 0.2, 4, 0x3c3c3e, 4.75, -0.35, -3));   // 地下室顶

  // ============ 墙体 ============
  const H0 = 3.1, HUP = 2.9;
  const wall = (x1, z1, x2, z2, y0, h, c = COL.wall, th = 0.22) => {
    const w = Math.abs(x2 - x1) || th, d = Math.abs(z2 - z1) || th;
    const m = box(Math.max(w, th), h, Math.max(d, th), c, (x1+x2)/2, y0 + h/2, (z1+z2)/2);
    scene.add(m); world.blockers.push(m);
    addCol((x1+x2)/2 - Math.max(w,th)/2, (x1+x2)/2 + Math.max(w,th)/2, (z1+z2)/2 - Math.max(d,th)/2, (z1+z2)/2 + Math.max(d,th)/2, y0, y0 + h);
    return m;
  };
  const W = COL.wall;
  // --- 一层外墙 ---
  wall(-8, 5, -0.62, 5, 0, H0); wall(0.62, 5, 8, 5, 0, H0);
  wall(-8, -5, 8, -5, 0, H0);
  wall(-8, -5, -8, 5, 0, H0);
  wall(8, -5, 8, 2.5, 0, H0); wall(8, 3.7, 8, 5, 0, H0); // 后门缺口(钉死)
  // --- 一层内墙 ---
  wall(-1.5, 0.2, -1.5, 2.0, 0, H0); wall(-1.5, 3.6, -1.5, 5, 0, H0);      // 客厅|门厅 拱形
  wall(-8, 0.2, -5.8, 0.2, 0, H0); wall(-4.6, 0.2, -1.5, 0.2, 0, H0);      // 客厅|书房（门缺口）
  wall(-1.5, -1, -0.5, -1, 0, H0);                                          // 门厅|餐厅 部分墙
  wall(1.5, -1, 1.5, 5, 0, H0);                                             // 门厅/楼梯|厨房
  wall(1.5, -5, 1.5, -3.4, 0, H0); wall(1.5, -1.6, 1.5, -1, 0, H0);        // 餐厅|厨房 拱
  wall(1.5, -1, 2.1, -1, 0, H0); wall(3.3, -1, 8, -1, 0, H0);              // 厨房|杂物间（地下室门缺口）
  // --- 二层内墙 ---
  const U = COL.wallUp;
  wall(-1.5, 0.5, -1.5, 3.0, 3.2, HUP, U); wall(-1.5, 4.1, -1.5, 5, 3.2, HUP, U);  // 走廊|我的房间
  wall(-8, 0.5, -1.5, 0.5, 3.2, HUP, U);
  wall(-1.5, -5, -1.5, -3.4, 3.2, HUP, U); wall(-1.5, -2.3, -1.5, 0.5, 3.2, HUP, U); // 走廊|父母
  wall(3, -5, 3, -3.4, 3.2, HUP, U); wall(3, -2.3, 3, 2.4, 3.2, HUP, U); wall(3, 3.5, 3, 5, 3.2, HUP, U); // 浴/储|走廊
  wall(3, -0.5, 8, -0.5, 3.2, HUP, U);                                             // 浴|储
  wall(-8, -5, -8, 5, 3.2, HUP, U); wall(-8, 5, 8, 5, 3.2, HUP, U); wall(-8, -5, 8, -5, 3.2, HUP, U); wall(8, -5, 8, 5, 3.2, HUP, U);
  // --- 楼梯踏步 ---
  for (let i = 0; i < 16; i++) {
    const z = 4.6 - (i + 0.5) * (3.9 / 16);
    const y = ((4.6 - z) / 3.9) * 3.2;
    const s = box(1.0, 0.22, 3.9/16 + 0.02, COL.woodDark, 1.0, y - 0.11, z);
    scene.add(s); world.blockers.push(s);
  }
  scene.add(box(0.12, 3.4, 0.12, COL.trim, 0.56, 1.7, 4.65)); // 楼梯扶手柱
  for (let i = 0; i < 14; i++) { // 地下室踏步
    const z = -1 - (i + 0.5) * (3.2 / 14);
    const y = ((-1 - z) / 3.2) * -2.8;
    const s = box(1.2, 0.2, 3.2/14 + 0.02, 0x3c3c40, 2.7, y - 0.1, z);
    scene.add(s); world.blockers.push(s);
  }
  // 楼梯洞围栏
  const rail = (x1,z1,x2,z2) => { const r = box(Math.abs(x2-x1)||0.08, 0.9, Math.abs(z2-z1)||0.08, COL.trim, (x1+x2)/2, 3.65, (z1+z2)/2); scene.add(r); addCol(x1,x2,z1,z2,3.2,4.1); world.blockers.push(r); };
  // 注意：z=0.7 一侧是楼梯顶端出口，不能装栏杆，否则人和父亲都会穿栏杆
  rail(0.5, 0.7, 0.5, 4.6); rail(1.5, 0.7, 1.5, 4.6);
  // 地下室楼梯井壁（防从地下室钻进去）
  wall(2.1, -5, 3.3, -5, -2.8, 2.5, 0x55555a); wall(2.1, -4.2, 2.1, -1, -2.8, 2.5, 0x55555a); wall(3.3, -4.2, 3.3, -1, -2.8, 2.5, 0x55555a);
  addCol(2.1, 3.3, -4.2, -1, -2.8, -0.3);

  // ============ 门 ============
  const mkDoor = (id, x, z, w, rot, opts) => { const d = new Door(scene, x, z, w, rot, opts); world.doors[id] = d; world.doorList.push(d); return d; };
  mkDoor('front', 0, 4.94, 1.1, 0, { id: 'front', name: '大门', locked: true, noLockpick: true,
    onOpen: () => G.game && G.game.frontDoorOpened() });
  mkDoor('back', 8.06, 3.1, 1.1, Math.PI/2, { id: 'back', name: '后门', board: true });
  mkDoor('study', -5.2, 0.2, 1.15, 0, { id: 'study', name: '书房门', locked: true });
  mkDoor('myroom', -1.5, 3.55, 1.05, Math.PI/2, { id: 'myroom', name: '我的房门', locked: true });
  mkDoor('parents', -1.5, -2.85, 1.05, Math.PI/2, { id: 'parents', name: '父母房门' });
  mkDoor('bath', 3, -2.85, 1.05, Math.PI/2, { id: 'bath', name: '浴室门' });
  mkDoor('storage', 3, 2.95, 1.05, Math.PI/2, { id: 'storage', name: '储物间门', locked: true });
  mkDoor('basement', 2.7, -1, 1.15, 0, { id: 'basement', name: '地下室门' });

  // ============ 窗户（夜色发光片） ============
  const mkWin = (x, y, z, w, h, rot = 0) => {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rot;
    g.add(box(w + 0.24, h + 0.24, 0.1, COL.trim, 0, 0, 0));
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: 0x1c2b4a }));
    glass.position.z = 0.06; g.add(glass);
    g.add(box(0.05, h, 0.12, COL.trim, 0, 0, 0.05));
    g.add(box(w, 0.05, 0.12, COL.trim, 0, 0, 0.05));
    scene.add(g); world.meshes['win_' + x + '_' + z] = glass;
    // 窗外微光
    const l = new THREE.PointLight(0x3a5a8c, 0.35, 5); l.position.set(x, y, z + (rot === 0 ? 1.2 : 0)); scene.add(l);
    return g;
  };
  mkWin(-4.5, 1.8, 4.95, 1.6, 1.3); mkWin(-6.8, 1.8, 4.95, 1.4, 1.3);
  mkWin(0, 1.9, 4.95, 0.9, 1.1); mkWin(-8.06, 1.8, -2.5, 1.5, 1.3, Math.PI/2);
  mkWin(6.5, 1.8, -4.95, 1.4, 1.2); mkWin(-3, 1.8, -4.95, 1.2, 1.2);
  mkWin(-4.5, 5.0, 4.95, 1.5, 1.2); mkWin(-6.8, 5.0, -4.95, 1.4, 1.2);
  mkWin(6.5, 5.0, -4.95, 1.2, 1.2); mkWin(6.8, 5.0, 4.95, 1.4, 1.2);

  // ============ 容器 & 家具 ============
  const addContainer = (id, name, mesh, room, type = 'normal') => {
    world.containers.push({ id, name, mesh, room, type, searched: false, pendingItem: null });
  };
  const interact = (mesh, getPrompt, use, opts = {}) => {
    const it = { mesh, getPrompt, use, hold: opts.hold || 0, holdPrompt: opts.holdPrompt };
    mesh.traverse(o => { if (o.isMesh) o.userData.interactable = it; });
    mesh.userData.interactable = it;
    world.interactables.push(it); return it;
  };

  // ---- 我的房间 ----
  {
    const bed = new THREE.Group(); bed.position.set(-6.6, 3.2, 2.2);
    bed.add(box(2.0, 0.4, 3.4, COL.woodDark, 0, 0.3, 0), box(1.9, 0.22, 3.2, COL.bedSheet, 0, 0.58, 0),
      box(1.9, 0.5, 0.7, 0xd8dce2, 0, 0.75, -1.15), box(2.0, 1.1, 0.18, COL.woodDark, 0, 0.7, -1.7));
    scene.add(bed); world.meshes.bed = bed;
    addCol(-7.6, -5.6, 0.5, 3.9, 3.2, 4.2);
    interact(bed, () => G.player.hidden === bed ? '【E】 从床底爬出来' : '【E】 钻到床底下 (躲藏)',
      () => G.game.toggleHide(bed, new THREE.Vector3(-6.6, 3.42, 2.2), 0.42));
    // 出口锚点：藏在里面时，从这里出来（必须落在空地上，且离墙/家具足够远）
    world.hideSpots.push({ mesh: bed, room: 'myroom', exit: { x: -5.0, z: 2.2 } });

    const desk = new THREE.Group(); desk.position.set(-3.0, 3.2, 4.4);
    desk.add(box(1.8, 0.1, 0.8, COL.wood, 0, 0.75, 0), box(0.12, 0.75, 0.7, COL.woodDark, -0.8, 0.37, 0),
      box(0.12, 0.75, 0.7, COL.woodDark, 0.8, 0.37, 0), box(0.7, 0.5, 0.6, COL.woodDark, 0.5, 0.3, 0));
    const cam = box(0.3, 0.2, 0.42, 0x2a2a2e, -0.4, 0.9, 0); desk.add(cam);
    const lamp = box(0.12, 0.5, 0.12, 0x333, 0.6, 1.05, -0.1); desk.add(lamp);
    const lampHead = box(0.3, 0.16, 0.2, 0xd9c27e, 0.6, 1.32, -0.05); desk.add(lampHead);
    const dl = new THREE.PointLight(0xffd9a0, 0.25, 7); dl.position.set(-3.0 + 0.6, 4.55, 4.35); scene.add(dl);
    world.lights.myroomDesk = dl;
    scene.add(desk);
    addCol(-3.9, -2.1, 4.0, 4.8, 3.2, 4.1);
    addContainer('deskDrawer', '书桌抽屉', desk, 'myroom');
    interact(desk, () => containerPrompt('deskDrawer'), () => G.game.searchContainer('deskDrawer'));

    const wardrobe = new THREE.Group(); wardrobe.position.set(-7.2, 3.2, 4.1);
    wardrobe.add(box(1.6, 2.2, 0.7, COL.woodDark, 0, 1.1, 0), box(0.75, 2.0, 0.06, COL.wood, -0.38, 1.1, 0.36),
      box(0.75, 2.0, 0.06, COL.wood, 0.38, 1.1, 0.36));
    scene.add(wardrobe); world.meshes.myWardrobe = wardrobe;
    // 一直封到北墙内表面：杜绝玩家挤进衣柜与墙之间 0.44m 的窄缝（半径 0.3 挤不进去却会被挤进去）
    addCol(-8, -6.4, 3.7, 4.89, 3.2, 5.4);
    interact(wardrobe, () => G.player.hidden === wardrobe ? '【E】 拉开柜门出来' : '【E】 躲进衣柜 (躲藏)',
      () => G.game.toggleHide(wardrobe, new THREE.Vector3(-7.2, 3.5, 4.1), 1.1));
    world.hideSpots.push({ mesh: wardrobe, room: 'myroom', exit: { x: -5.9, z: 4.3 } });

    const toy = box(1.0, 0.6, 0.7, 0x7a4a8a, -2.2, 3.5, 0.9); scene.add(toy);
    addCol(-2.7, -1.7, 0.55, 1.25, 3.2, 3.8);
    addContainer('toyBox', '玩具箱', toy, 'myroom');
    interact(toy, () => containerPrompt('toyBox'), () => G.game.searchContainer('toyBox'));
    // 海报
    const poster = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.3), new THREE.MeshLambertMaterial({ color: 0x4a6a8a }));
    poster.position.set(-4.5, 4.6, 4.88); poster.rotation.y = Math.PI; scene.add(poster);
    const poster2 = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.0), new THREE.MeshLambertMaterial({ color: 0x8a5a4a }));
    poster2.position.set(-2.6, 4.5, 4.88); poster2.rotation.y = Math.PI; scene.add(poster2);
  }

  // ---- 父母房间 ----
  {
    const bed = new THREE.Group(); bed.position.set(-5.2, 3.2, -1.6);
    bed.add(box(2.6, 0.42, 2.6, COL.woodDark, 0, 0.32, 0), box(2.5, 0.24, 2.4, COL.bedSheet2, 0, 0.6, 0.1),
      box(1.1, 0.4, 0.6, 0xcfd4da, -0.6, 0.78, -0.95), box(2.6, 1.2, 0.2, COL.woodDark, 0, 0.8, -1.35));
    scene.add(bed); addCol(-6.5, -3.9, -2.9, -0.3, 3.2, 4.2);
    const wardrobe = new THREE.Group(); wardrobe.position.set(-7.2, 3.2, -3.8);
    wardrobe.add(box(2.0, 2.3, 0.75, 0x3d2e22, 0, 1.15, 0), box(0.95, 2.1, 0.06, 0x59422e, -0.48, 1.1, 0.39),
      box(0.95, 2.1, 0.06, 0x59422e, 0.48, 1.1, 0.39));
    scene.add(wardrobe); world.meshes.parentsWardrobe = wardrobe;
    // 封到南墙内表面，杜绝挤进衣柜背后
    addCol(-8.2, -6.2, -4.89, -3.4, 3.2, 5.5);
    addContainer('pWardrobe', '母亲的衣柜', wardrobe, 'parents', 'wardrobe');
    interact(wardrobe, () => containerPrompt('pWardrobe', '翻找衣柜'), () => G.game.searchContainer('pWardrobe'));
    world.hideSpots.push({ mesh: wardrobe, room: 'parents', exit: { x: -7.2, z: -2.8 } });

    const dresser = new THREE.Group(); dresser.position.set(-2.6, 3.2, -4.4);
    dresser.add(box(1.5, 1.0, 0.55, COL.woodDark, 0, 0.5, 0), box(1.4, 0.06, 0.05, COL.trim, 0, 0.68, 0.29), box(1.4, 0.06, 0.05, COL.trim, 0, 0.34, 0.29));
    const frame = box(0.42, 0.52, 0.04, 0xc9b26a, -0.3, 1.32, 0); dresser.add(frame);
    scene.add(dresser); addCol(-3.35, -1.85, -4.68, -4.12, 3.2, 4.2);
    addContainer('dresser', '五斗柜', dresser, 'parents');
    interact(dresser, () => containerPrompt('dresser'), () => G.game.searchContainer('dresser'));
    interact(frame, () => '【E】 看看照片',
      () => G.ui.showNote('照片', '相框里是全家的合影。妈妈笑得很温柔，\n爸爸的手搭在你的肩上——你记得那时有多疼。\n照片右下角写着：『我们的小家 · 1996.04』'));
    world.meshes.photoFrame = frame;
  }

  // ---- 浴室 ----
  {
    const sink = new THREE.Group(); sink.position.set(4.2, 3.2, -4.5);
    sink.add(box(0.9, 0.2, 0.55, 0xd8dce0, 0, 0.85, 0), box(0.7, 0.7, 0.45, COL.trim, 0, 0.35, 0));
    const mirror = box(0.8, 0.9, 0.05, 0x9db6c8, 0, 1.75, -0.32); sink.add(mirror);
    scene.add(sink); addCol(3.75, 4.65, -4.78, -4.22, 3.2, 4.2);
    const cab = new THREE.Group(); cab.position.set(5.8, 3.2, -4.6);
    cab.add(box(0.7, 0.6, 0.35, 0xd0d4d8, 0, 1.6, 0), box(0.66, 0.56, 0.04, 0xb0c4d0, 0, 1.6, 0.19));
    scene.add(cab); world.meshes.medCab = cab;
    addContainer('medCab', '药柜', cab, 'bath', 'med');
    interact(cab, () => containerPrompt('medCab', '打开药柜'), () => G.game.searchContainer('medCab'));
    const tub = new THREE.Group(); tub.position.set(6.9, 3.2, -1.8);
    tub.add(box(1.7, 0.55, 0.85, 0xe0e4e8, 0, 0.28, 0)); scene.add(tub);
    addCol(6.05, 7.75, -2.22, -1.38, 3.2, 3.8);
    const toilet = new THREE.Group(); toilet.position.set(3.7, 3.2, -2.2);
    toilet.add(box(0.5, 0.42, 0.6, 0xe0e4e8, 0, 0.21, 0), box(0.46, 0.6, 0.2, 0xe0e4e8, 0, 0.5, -0.24));
    scene.add(toilet); addCol(3.45, 3.95, -2.5, -1.9, 3.2, 3.9);
    const bl = new THREE.PointLight(0xcfe8ff, 0.0, 6); bl.position.set(5.5, 5.2, -2.7); scene.add(bl);
    world.lights.bath = bl;
  }

  // ---- 储物间（锁） ----
  {
    const bl = new THREE.PointLight(0xffe8c8, 0.0, 7); bl.position.set(5.5, 5.3, 2.2); scene.add(bl);
    world.lights.storage = bl;
    const b1 = box(1.1, 1.0, 1.1, 0x7a6248, 4.2, 3.7, 3.8); scene.add(b1); addCol(3.65, 4.75, 3.25, 4.35, 3.2, 4.2);
    addContainer('stoBox1', '纸箱', b1, 'storage', 'perm');
    interact(b1, () => containerPrompt('stoBox1'), () => G.game.searchContainer('stoBox1'));
    const b2 = box(0.9, 0.7, 0.9, 0x6a5a48, 6.6, 3.55, 1.2); scene.add(b2); addCol(6.15, 7.05, 0.75, 1.65, 3.2, 3.9);
    addContainer('stoBox2', '旧纸箱', b2, 'storage', 'perm');
    interact(b2, () => containerPrompt('stoBox2'), () => G.game.searchContainer('stoBox2'));
    scene.add(box(1.6, 1.8, 0.5, 0x4a4a52, 7.6, 4.1, -0.1)); // 旧柜
  }

  // ---- 楼上走廊 ----
  {
    const table = new THREE.Group(); table.position.set(-0.9, 3.2, -4.3);
    table.add(box(0.8, 0.08, 0.5, COL.wood, 0, 0.72, 0), box(0.7, 0.35, 0.4, COL.woodDark, 0, 0.35, 0.1));
    scene.add(table); addCol(-1.3, -0.5, -4.55, -4.05, 3.2, 4.0);
    addContainer('hallTable', '走廊小桌', table, 'uphall');
    interact(table, () => containerPrompt('hallTable'), () => G.game.searchContainer('hallTable'));
    const closet = new THREE.Group(); closet.position.set(-1.2, 3.2, 0.1);
    closet.add(box(1.1, 2.2, 0.6, COL.woodDark, 0, 1.1, 0), box(0.5, 2.0, 0.05, COL.wood, -0.27, 1.1, 0.31), box(0.5, 2.0, 0.05, COL.wood, 0.27, 1.1, 0.31));
    scene.add(closet); world.hideSpots.push({ mesh: closet, room: 'uphall', exit: { x: -0.15, z: 0.1 } });
    interact(closet, () => G.player.hidden === closet ? '【E】 出来' : '【E】 躲进壁柜 (躲藏)',
      () => G.game.toggleHide(closet, new THREE.Vector3(-1.2, 3.55, 0.1), 1.1));
    addCol(-1.75, -0.65, -0.2, 0.4, 3.2, 5.4);
    const bl = new THREE.PointLight(0xffd9a0, 0.5, 9); bl.position.set(0.5, 5.5, 0); scene.add(bl);
    world.lights.uphall = bl;
  }

  // ---- 客厅 ----
  {
    const sofa = new THREE.Group(); sofa.position.set(-4.5, 0, 3.8);
    sofa.add(box(2.8, 0.55, 1.0, COL.sofa, 0, 0.32, 0), box(2.8, 0.65, 0.28, COL.sofaDark, 0, 0.75, -0.42),
      box(0.28, 0.5, 1.0, COL.sofaDark, -1.32, 0.6, 0), box(0.28, 0.5, 1.0, COL.sofaDark, 1.32, 0.6, 0),
      box(1.2, 0.18, 0.8, 0x7a5648, -0.6, 0.62, 0.05), box(1.2, 0.18, 0.8, 0x7a5648, 0.6, 0.62, 0.05));
    scene.add(sofa); world.meshes.sofa = sofa;
    addCol(-5.9, -3.1, 3.3, 4.3, 0, 1.1);
    addContainer('sofa', '沙发垫下', sofa, 'living', 'perm');
    interact(sofa, () => containerPrompt('sofa', '翻开沙发垫'), () => G.game.searchContainer('sofa'));

    const chair = new THREE.Group(); chair.position.set(-5.3, 0, 1.6); // 父亲的专座
    chair.add(box(1.1, 0.5, 1.0, 0x5a3626, 0, 0.3, 0), box(1.1, 1.1, 0.25, 0x4e2f22, 0, 0.95, -0.4),
      box(0.25, 0.35, 1.0, 0x4e2f22, -0.55, 0.55, 0), box(0.25, 0.35, 1.0, 0x4e2f22, 0.55, 0.55, 0));
    scene.add(chair); world.meshes.armchair = chair;
    addCol(-5.85, -4.75, 1.1, 2.1, 0, 1.5);

    const tv = new THREE.Group(); tv.position.set(-7.5, 0, 3.2);
    tv.add(box(1.6, 0.5, 0.7, 0x3a2e24, 0, 0.25, 0));
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.35, 0.75),
      new THREE.MeshBasicMaterial({ color: 0x0a0c10 }));
    screen.position.set(0, 1.05, 0.36); tv.add(screen);
    tv.add(box(1.5, 1.1, 0.6, COL.tv, 0, 1.05, 0));
    screen.position.z = 0.31; screen.position.y = 1.05;
    scene.add(tv); world.meshes.tv = tv; world.meshes.tvScreen = screen;
    addCol(-8.2, -6.8, 2.7, 3.7, 0, 1.7);
    const tvLight = new THREE.PointLight(0x88b8e8, 0.9, 8); tvLight.position.set(-6.9, 1.4, 3.2); scene.add(tvLight);
    world.lights.tv = tvLight;
    interact(tv, () => world.tvOn ? '【E】 关掉电视' : '【E】 打开电视',
      () => { world.tvOn = !world.tvOn; G.audio.tvSet(world.tvOn); G.emitNoise(new THREE.Vector3(-7.3, 1.5, 3.2), 6, 'tv'); G.game.onTVToggle(world.tvOn); });
    world.tvOn = true;

    const ctable = new THREE.Group(); ctable.position.set(-4.6, 0, 2.2);
    ctable.add(box(1.4, 0.08, 0.8, COL.wood, 0, 0.45, 0), box(0.1, 0.45, 0.1, COL.woodDark, -0.6, 0.22, -0.3),
      box(0.1, 0.45, 0.1, COL.woodDark, 0.6, 0.22, -0.3), box(0.1, 0.45, 0.1, COL.woodDark, -0.6, 0.22, 0.3), box(0.1, 0.45, 0.1, COL.woodDark, 0.6, 0.22, 0.3));
    scene.add(ctable); addCol(-5.3, -3.9, 1.8, 2.6, 0, 0.6);
    addContainer('ctable', '茶几抽屉', ctable, 'living');
    interact(ctable, () => containerPrompt('ctable'), () => G.game.searchContainer('ctable'));

    const shelf = box(0.4, 2.0, 1.6, 0x4e3b2a, -7.7, 1.0, 0.6); scene.add(shelf);
    addCol(-7.9, -7.5, -0.2, 1.4, 0, 2.0);
    addContainer('bookshelf', '客厅书架', shelf, 'living');
    interact(shelf, () => containerPrompt('bookshelf'), () => G.game.searchContainer('bookshelf'));

    const lamp = new THREE.Group(); lamp.position.set(-1.9, 0, 4.4);
    lamp.add(box(0.3, 0.06, 0.3, COL.trim, 0, 0.03, 0), box(0.05, 1.5, 0.05, COL.trim, 0, 0.75, 0), box(0.4, 0.45, 0.4, 0xe8d9a8, 0, 1.55, 0));
    scene.add(lamp);
    const ll = new THREE.PointLight(0xffd9a0, 0.85, 10); ll.position.set(-1.9, 1.6, 4.4); scene.add(ll);
    world.lights.livingLamp = ll;
  }

  // ---- 门厅 ----
  {
    const ptable = new THREE.Group(); ptable.position.set(-1.1, 0, 4.4);
    ptable.add(box(0.7, 0.08, 0.5, COL.wood, 0, 0.78, 0), box(0.08, 0.78, 0.08, COL.woodDark, -0.28, 0.39, -0.18),
      box(0.08, 0.78, 0.08, COL.woodDark, 0.28, 0.39, -0.18), box(0.08, 0.78, 0.08, COL.woodDark, -0.28, 0.39, 0.18),
      box(0.08, 0.78, 0.08, COL.woodDark, 0.28, 0.39, 0.18), box(0.55, 0.3, 0.4, COL.woodDark, 0, 0.25, 0));
    scene.add(ptable); addCol(-1.45, -0.75, 4.15, 4.65, 0, 0.9);
    // 电话
    const phone = new THREE.Group(); phone.position.set(-1.1, 0.82, 4.4);
    phone.add(box(0.26, 0.1, 0.2, 0x30302e, 0, 0.05, 0), box(0.1, 0.14, 0.1, 0x26262a, 0.05, 0.14, 0.03));
    const coil = box(0.04, 0.02, 0.3, 0x555, -0.14, 0.1, 0.02); phone.add(coil);
    scene.add(phone); world.meshes.phone = phone; world.meshes.phoneCoil = coil;
    interact(phone, () => G.game.phonePrompt(), () => G.game.usePhone());
    addContainer('phoneTable', '电话桌抽屉', ptable, 'hall');
    interact(ptable, () => containerPrompt('phoneTable'), () => G.game.searchContainer('phoneTable'));
    const hl = new THREE.PointLight(0xffe8c0, 0.45, 8); hl.position.set(0, 2.4, 3.5); scene.add(hl);
    world.lights.hall = hl;
  }

  // ---- 书房 ----
  {
    const desk = new THREE.Group(); desk.position.set(-6.4, 0, -3.6);
    desk.add(box(2.0, 0.09, 1.0, COL.wood, 0, 0.75, 0), box(0.14, 0.75, 0.9, COL.woodDark, -0.9, 0.37, 0), box(0.14, 0.75, 0.9, COL.woodDark, 0.9, 0.37, 0),
      box(0.8, 0.55, 0.9, COL.woodDark, 0.6, 0.3, 0));
    scene.add(desk); addCol(-7.4, -5.4, -4.1, -3.1, 0, 0.9);
    addContainer('studyDesk', '书房书桌', desk, 'study', 'clue');
    interact(desk, () => containerPrompt('studyDesk'), () => G.game.searchContainer('studyDesk'));
    const dl = new THREE.PointLight(0xffd9a0, 0.75, 8); dl.position.set(-6.4, 1.5, -3.4); scene.add(dl);
    world.lights.study = dl;

    const fcab = new THREE.Group(); fcab.position.set(-2.2, 0, -4.4);
    fcab.add(box(0.9, 1.4, 0.55, 0x55504a, 0, 0.7, 0), box(0.8, 0.04, 0.04, 0x777, 0, 1.0, 0.29), box(0.8, 0.04, 0.04, 0x777, 0, 0.6, 0.29));
    scene.add(fcab); addCol(-2.65, -1.75, -4.68, -4.12, 0, 1.4);
    addContainer('filing', '档案柜', fcab, 'study', 'clue');
    interact(fcab, () => containerPrompt('filing'), () => G.game.searchContainer('filing'));

    const shelf = box(0.4, 2.2, 1.8, 0x4e3b2a, -7.7, 1.1, -1.6); scene.add(shelf);
    addCol(-7.9, -7.5, -2.5, -0.7, 0, 2.2);
    addContainer('studyShelf', '书房书架', shelf, 'study');
    interact(shelf, () => containerPrompt('studyShelf'), () => G.game.searchContainer('studyShelf'));

    // 保险箱
    const safe = new THREE.Group(); safe.position.set(-6.8, 0, -0.6);
    safe.add(box(0.75, 0.75, 0.7, 0x3a3d44, 0, 0.38, 0));
    const keypadM = box(0.16, 0.2, 0.05, 0x1c1e22, 0.24, 0.45, 0.36); safe.add(keypadM);
    const handle = box(0.06, 0.28, 0.06, 0xc9a86a, -0.05, 0.38, 0.37); safe.add(handle);
    scene.add(safe); world.meshes.safe = safe;
    addCol(-7.2, -6.4, -0.95, -0.25, 0, 0.8);
    interact(safe, () => G.game.safePrompt(), () => G.game.useSafe());
  }

  // ---- 餐厅 ----
  {
    const table = new THREE.Group(); table.position.set(0, 0, -3);
    table.add(box(2.2, 0.1, 1.2, COL.wood, 0, 0.75, 0), box(0.15, 0.75, 0.15, COL.woodDark, -0.9, 0.37, -0.45),
      box(0.15, 0.75, 0.15, COL.woodDark, 0.9, 0.37, -0.45), box(0.15, 0.75, 0.15, COL.woodDark, -0.9, 0.37, 0.45),
      box(0.15, 0.75, 0.15, COL.woodDark, 0.9, 0.37, 0.45));
    for (const [cx, cz] of [[-0.7, -1.05], [0, -1.05], [0.7, -1.05], [-0.7, 1.05], [0.7, 1.05]]) {
      table.add(box(0.45, 0.5, 0.45, COL.woodDark, cx, 0.25, cz));
      table.add(box(0.45, 0.55, 0.07, COL.wood, cx, 0.85, cz + 0.22));
    }
    scene.add(table); addCol(-1.2, 1.2, -3.65, -2.35, 0, 0.9);
    const cabinet = new THREE.Group(); cabinet.position.set(0.6, 0, -4.6);
    cabinet.add(box(1.6, 1.9, 0.5, 0x54402c, 0, 0.95, 0), box(1.5, 1.0, 0.05, 0x8a9aa8, 0, 1.2, 0.26));
    scene.add(cabinet); addCol(-0.2, 1.4, -4.85, -4.35, 0, 1.9);
    addContainer('china', '餐边柜', cabinet, 'dining');
    interact(cabinet, () => containerPrompt('china'), () => G.game.searchContainer('china'));
    const pl = new THREE.PointLight(0xffe0b0, 0.5, 8); pl.position.set(0, 2.3, -3); scene.add(pl);
    world.lights.dining = pl;
  }

  // ---- 厨房 ----
  {
    const counterM = (x, z, w, d, rot = 0) => {
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot;
      g.add(box(w, 0.12, d, 0xb8bdb2, 0, 0.88, 0), box(w, 0.8, d - 0.08, 0x6e7466, 0, 0.44, 0.04));
      scene.add(g); addCol(x - w/2, x + w/2, z - d/2, z + d/2, 0, 1.0); return g;
    };
    counterM(6.1, -0.55, 3.6, 0.85); counterM(7.55, 1.6, 0.85, 3.4); counterM(3.0, -0.55, 1.6, 0.85);
    const c1 = box(0.9, 0.7, 0.7, 0x5e6456, 5.0, 0.35, -0.5); scene.add(c1);
    addContainer('kDrawer1', '厨房抽屉', c1, 'kitchen');
    interact(c1, () => containerPrompt('kDrawer1'), () => G.game.searchContainer('kDrawer1'));
    const c2 = box(0.9, 0.7, 0.7, 0x5e6456, 7.0, 0.35, 0.4); scene.add(c2);
    addContainer('kDrawer2', '橱柜', c2, 'kitchen');
    interact(c2, () => containerPrompt('kDrawer2'), () => G.game.searchContainer('kDrawer2'));
    const lc = new THREE.Group(); lc.position.set(3.4, 0, 2.6);
    lc.add(box(1.4, 0.7, 1.0, 0x5e6456, 0, 0.2, 0), box(1.44, 0.06, 1.04, 0x777d6e, 0, 0.58, 0));
    scene.add(lc); addCol(2.7, 4.1, 2.1, 3.1, 0, 0.62);
    addContainer('lowerCab', '底柜', lc, 'kitchen');
    interact(lc, () => containerPrompt('lowerCab'), () => G.game.searchContainer('lowerCab'));

    const fridge = new THREE.Group(); fridge.position.set(2.3, 0, -0.55);
    fridge.add(box(0.95, 2.0, 0.85, COL.fridge, 0, 1.0, 0), box(0.06, 0.7, 0.06, 0x999, 0.38, 1.3, 0.44));
    scene.add(fridge); world.meshes.fridge = fridge;
    addCol(1.82, 2.78, -0.98, -0.12, 0, 2.0);
    addContainer('fridge', '冰箱', fridge, 'kitchen');
    interact(fridge, () => containerPrompt('fridge', '打开冰箱'), () => G.game.searchContainer('fridge'));

    const stove = box(0.9, 0.9, 0.85, 0x44464c, 4.2, 0.45, -0.55); scene.add(stove);
    addCol(3.75, 4.65, -0.98, -0.12, 0, 0.9);

    // 威士忌
    const whiskey = new THREE.Group(); whiskey.position.set(6.0, 0.94, -0.55);
    whiskey.add(box(0.16, 0.36, 0.16, 0x6a3d1e, 0, 0.18, 0), box(0.06, 0.12, 0.06, 0x6a3d1e, 0, 0.42, 0));
    whiskey.add(box(0.14, 0.1, 0.14, 0x8a5a2e, 0, 0.07, 0));
    scene.add(whiskey); world.meshes.whiskey = whiskey;
    interact(whiskey, () => G.game.whiskeyPrompt(), () => G.game.useWhiskey());

    const kl = new THREE.PointLight(0xd8f0e8, 0.7, 10); kl.position.set(5, 2.5, 1.5); scene.add(kl);
    world.lights.kitchen = kl;
    const ktable = new THREE.Group(); ktable.position.set(5.4, 0, 3.2);
    ktable.add(box(1.5, 0.08, 1.0, COL.wood, 0, 0.72, 0), box(0.1, 0.72, 0.1, COL.woodDark, -0.65, 0.36, -0.4),
      box(0.1, 0.72, 0.1, COL.woodDark, 0.65, 0.36, -0.4), box(0.1, 0.72, 0.1, COL.woodDark, -0.65, 0.36, 0.4), box(0.1, 0.72, 0.1, COL.woodDark, 0.65, 0.36, 0.4));
    scene.add(ktable); addCol(4.65, 6.15, 2.7, 3.7, 0, 0.8);
  }

  // ---- 杂物间 ----
  {
    const washer = new THREE.Group(); washer.position.set(7.4, 0, -3.6);
    washer.add(box(0.8, 1.0, 0.8, 0xc8ccd0, 0, 0.5, 0), box(0.5, 0.5, 0.06, 0x8ab0c8, 0, 0.55, 0.42));
    scene.add(washer); addCol(7.0, 7.8, -4.0, -3.2, 0, 1.0);
    const dryer = new THREE.Group(); dryer.position.set(7.4, 0, -2.4);
    dryer.add(box(0.8, 1.0, 0.8, 0xb8bcc0, 0, 0.5, 0), box(0.5, 0.5, 0.06, 0x98b8c8, 0, 0.55, 0.42));
    scene.add(dryer); addCol(7.0, 7.8, -2.8, -2.0, 0, 1.0);
    const shelf = new THREE.Group(); shelf.position.set(4.8, 0, -4.5);
    shelf.add(box(2.4, 0.06, 0.5, 0x6a5a44, 0, 1.3, 0), box(2.4, 0.06, 0.5, 0x6a5a44, 0, 0.7, 0), box(0.08, 1.4, 0.5, 0x5a4a38, -1.16, 0.7, 0), box(0.08, 1.4, 0.5, 0x5a4a38, 1.16, 0.7, 0));
    const box1 = box(0.5, 0.4, 0.4, 0x8a7a5c, -0.6, 1.53, 0); shelf.add(box1);
    const jar = box(0.2, 0.3, 0.2, 0x7a9a7a, 0.5, 1.38, 0); shelf.add(jar);
    scene.add(shelf); addCol(3.6, 6.0, -4.75, -4.25, 0, 1.6);
    addContainer('uShelf', '杂物架', shelf, 'utility');
    interact(shelf, () => containerPrompt('uShelf'), () => G.game.searchContainer('uShelf'));
    const basket = new THREE.Group(); basket.position.set(2.1, 0, -3.9);
    basket.add(box(0.7, 0.55, 0.55, 0x9aa3ad, 0, 0.28, 0));
    scene.add(basket); addCol(1.75, 2.45, -4.18, -3.62, 0, 0.6);
    addContainer('basket', '洗衣篮', basket, 'utility');
    interact(basket, () => containerPrompt('basket', '翻洗衣篮'), () => G.game.searchContainer('basket'));
  }

  // ---- 地下室 ----
  {
    const bl = new THREE.PointLight(0xffe8c0, 0.55, 10); bl.position.set(5, -1.6, -2.6); scene.add(bl);
    world.lights.basement = bl;
    const wire = box(0.04, 0.04, 0.8, 0x222, 5, -0.5, -2.6); scene.add(wire); world.meshes.basementWire = wire;
    // 接线盒
    const jbox = new THREE.Group(); jbox.position.set(7.6, -2.8, -4.5);
    jbox.add(box(0.5, 0.6, 0.25, 0x7a7e84, 0, 1.35, 0), box(0.4, 0.2, 0.1, 0x3a3e44, 0, 1.35, 0.15));
    scene.add(jbox); world.meshes.junction = jbox;
    addCol(7.35, 7.85, -4.68, -4.32, -2.8, -1.8);
    interact(jbox, () => G.game.junctionPrompt(), () => G.game.useJunction());
    // 工作台
    const bench = new THREE.Group(); bench.position.set(4.6, -2.8, -4.4);
    bench.add(box(2.4, 0.1, 0.8, 0x6a5238, 0, 0.85, 0), box(0.12, 0.85, 0.7, 0x4a3826, -1.1, 0.42, 0), box(0.12, 0.85, 0.7, 0x4a3826, 1.1, 0.42, 0));
    const toolbox = box(0.6, 0.35, 0.35, 0xa8422a, 0.3, 1.08, 0); bench.add(toolbox);
    scene.add(bench); addCol(3.4, 5.8, -4.8, -4.0, -2.8, -1.9);
    addContainer('toolbox', '工具箱', bench, 'basement', 'perm');
    interact(bench, () => containerPrompt('toolbox', '打开工具箱'), () => G.game.searchContainer('toolbox'));
    const bshelf = new THREE.Group(); bshelf.position.set(2.4, -2.8, -2.0);
    bshelf.add(box(0.7, 2.0, 0.5, 0x554433, 0, 1.0, 0), box(0.66, 0.05, 0.46, 0x6a5a44, 0, 0.6, 0.02), box(0.66, 0.05, 0.46, 0x6a5a44, 0, 1.2, 0.02), box(0.66, 0.05, 0.46, 0x6a5a44, 0, 1.8, 0.02));
    scene.add(bshelf); addCol(2.05, 2.75, -2.25, -1.75, -2.8, -0.8);
    addContainer('bShelf1', '地下室架子', bshelf, 'basement');
    interact(bshelf, () => containerPrompt('bShelf1'), () => G.game.searchContainer('bShelf1'));
    const bshelf2 = new THREE.Group(); bshelf2.position.set(5.8, -2.8, -1.4);
    bshelf2.add(box(2.0, 1.6, 0.5, 0x4e4436, 0, 0.8, 0), box(1.9, 0.05, 0.46, 0x6a5a44, 0, 0.9, 0.02), box(1.9, 0.05, 0.46, 0x6a5a44, 0, 1.4, 0.02));
    scene.add(bshelf2); addCol(4.8, 6.8, -1.65, -1.15, -2.8, -1.2);
    addContainer('bShelf2', '储物架', bshelf2, 'basement');
    interact(bshelf2, () => containerPrompt('bShelf2'), () => G.game.searchContainer('bShelf2'));
    // 楼梯井墙已建；洗衣区氛围
    scene.add(box(0.9, 1.2, 0.9, 0x5a5e62, 6.8, -2.2, -2.2)); addCol(6.35, 7.25, -2.65, -1.75, -2.8, -1.6);
  }

  // ============ 室外 ============
  {
    const ground = box(80, 0.2, 80, COL.grass, 0, -0.12, 10); scene.add(ground);
    scene.add(box(16, 0.24, 1.2, 0x4a4038, 0, 0.0, 5.8)); // 门廊
    scene.add(box(0.18, 2.6, 0.18, COL.trim, -1.2, 1.3, 6.2), box(0.18, 2.6, 0.18, COL.trim, 1.2, 1.3, 6.2));
    scene.add(box(2.8, 0.24, 2.8, 0x3e3630, 0, 2.6, 6.4)); // 门廊顶
    scene.add(box(14, 0.1, 2.2, COL.concrete, 0, 0.02, 8.1)); // 人行道
    scene.add(box(60, 0.14, 5, COL.street, 0, 0.03, 12.6)); // 街道
    const dash = new THREE.MeshBasicMaterial({ color: 0x8a8a70 });
    for (let i = -8; i <= 8; i++) { const d = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.16), dash); d.rotation.x = -Math.PI/2; d.position.set(i * 2.2, 0.11, 12.6); scene.add(d); }
    // 邮箱
    const mb = new THREE.Group(); mb.position.set(2.2, 0, 8.6);
    mb.add(box(0.1, 1.0, 0.1, COL.trim, 0, 0.5, 0), box(0.35, 0.3, 0.55, 0x7a3a2a, 0, 1.1, 0));
    scene.add(mb);
    interact(mb, () => '【E】 看看信箱', () => G.ui.showNote('信箱', '几封没有拆的信。最上面一封的地址写着：\n“14 Maple St. — 收件人：S. Parker”'));
    // 树
    const tree = (x, z) => { scene.add(box(0.5, 2.4, 0.5, 0x3a2e20, x, 1.2, z)); scene.add(box(2.4, 2.6, 2.4, 0x22301e, x, 3.4, z)); };
    tree(-12, 7); tree(12, 8.5); tree(-14, -3); tree(14, -6);
    // 邻居房子剪影
    const nb = (x, z, c) => { scene.add(box(8, 5, 7, c, x, 2.5, z)); scene.add(box(8.6, 2.2, 7.6, 0x1c1a18, x, 6, z));
      const win = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.9), new THREE.MeshBasicMaterial({ color: 0x6a5a30 }));
      win.position.set(x, 2.4, z - 3.56); scene.add(win); };
    nb(-16, 12, 0x2e2a28); nb(17, 11, 0x2a2624);
    // 路灯
    scene.add(box(0.14, 5, 0.14, 0x33363a, 5, 2.5, 9.6));
    const streetL = new THREE.PointLight(0xffc878, 1.1, 22); streetL.position.set(5, 5.1, 9.6); scene.add(streetL);
    world.lights.street = streetL;
    scene.add(box(0.5, 0.16, 0.5, 0xffe8b0, 5, 5.05, 9.6));
    // 篱笆
    for (let i = -10; i <= 10; i += 1.2) { scene.add(box(0.12, 1.4, 0.12, 0x4a4034, i, 0.7, -8.5)); scene.add(box(0.12, 1.4, 0.12, 0x4a4034, i, 0.7, 20)); }
  }

  // ============ 灯光总控 ============
  // 门的交互注册（在 interact 定义之后）
  for (const d of world.doorList) {
    interact(d.panel, () => G.game.doorPrompt(d), () => G.game.useDoor(d), { hold: () => G.game.doorHold(d) });
  }
  scene.add(new THREE.AmbientLight(0x2a3044, 1.05));
  const moon = new THREE.DirectionalLight(0x4a5e8c, 0.28); moon.position.set(-12, 18, 14); scene.add(moon);

  // ============ 角色低模 ============
  world.fatherModel = makeFather();
  world.boyModel = makeBoy();
  scene.add(world.fatherModel.group, world.boyModel.group);

  // ============ 巡逻路点图 ============
  const N = (id, x, z, room, y = null) => ({ id, x, z, room, y, links: [] });
  const nodes = [
    N('armchair', -4.9, 2.5, 'living'), N('livingC', -4.7, 3.8, 'living'), N('tvFront', -6.6, 3.2, 'living'),
    N('livingS', -2.8, 4.3, 'living'), N('livingN', -4.5, 0.8, 'living'), N('studyDoorIn', -5.2, -0.6, 'study'),
    N('studyC', -5.5, -3, 'study'), N('studyDesk', -6.4, -2.7, 'study'),
    N('hallFront', -0.6, 3.8, 'hall'), N('hallC', -0.6, 1.2, 'hall'), N('hallN', 0, -1.8, 'hall'),
    N('diningC', 0, -3, 'dining'), N('diningArch', 2.2, -2.5, 'dining'),
    N('kitchenC', 4.6, 1.2, 'kitchen'), N('fridge', 3.0, 0.6, 'kitchen'), N('kitchenN', 5.0, 0.2, 'kitchen'),
    N('backDoor', 6.9, 4.2, 'kitchen'), N('basementDoorTop', 2.7, -0.4, 'kitchen'),
    N('bsMid', 2.7, -2.6, 'basement', -1.4), N('bsBottom', 2.7, -4.0, 'basement', -2.8),
    N('basementC', 4.6, -2.6, 'basement', -2.8), N('bench', 4.6, -3.8, 'basement', -2.8), N('bShelf', 5.8, -2.2, 'basement', -2.8),
    N('utilityC', 5.0, -3.4, 'utility'), N('uArch', 2.2, -3.4, 'utility'),
    // 楼梯顶端落在楼梯口北侧（z<0.7）的实心地板上，避免穿过西侧栏杆
    N('stairB', 1.0, 4.4, 'hall'), N('stairM', 1.0, 2.6, 'hall', 1.6), N('stairT', 0.8, 0.35, 'uphall', 3.2),
    N('uphallS', 0.4, 4.2, 'uphall', 3.2), N('uphallC', -0.4, 1.0, 'uphall', 3.2), N('uphallN', 0, -3.4, 'uphall', 3.2),
    N('myroomDoor', -0.9, 3.5, 'uphall', 3.2), N('myroomC', -4.7, 2.8, 'myroom', 3.2), N('myBed', -5.6, 2.2, 'myroom', 3.2),
    N('parentsDoor', -0.9, -2.85, 'uphall', 3.2), N('parentsC', -4.7, -2.0, 'parents', 3.2),
    N('bathDoor', 2.4, -2.85, 'uphall', 3.2), N('bathC', 5.0, -2.7, 'bath', 3.2),
    N('storageDoor', 2.4, 3.0, 'uphall', 3.2), N('storageC', 5.0, 2.6, 'storage', 3.2),
  ];
  const E = (a, b) => { const A = nodes.find(n => n.id === a), B = nodes.find(n => n.id === b); if (A && B) { A.links.push(B); B.links.push(A); } };
  E('armchair','livingC'); E('livingC','tvFront'); E('livingC','livingS'); E('livingS','hallFront'); E('livingC','livingN');
  E('tvFront','livingN'); E('livingN','studyDoorIn'); E('studyDoorIn','studyC'); E('studyC','studyDesk');
  E('hallFront','hallC'); E('hallC','hallN'); E('hallN','diningC'); E('diningC','diningArch'); E('livingN','hallC');
  E('diningArch','kitchenN'); E('kitchenN','kitchenC'); E('kitchenC','fridge'); E('kitchenC','backDoor');
  E('kitchenN','basementDoorTop'); E('basementDoorTop','bsMid'); E('bsMid','bsBottom'); E('bsBottom','basementC');
  E('basementC','bench'); E('basementC','bShelf'); E('diningC','uArch'); E('uArch','utilityC'); E('utilityC','basementC');
  E('hallFront','stairB'); E('stairB','stairM'); E('stairM','stairT'); E('stairT','uphallC'); E('uphallS','uphallC');
  E('uphallC','uphallN'); E('uphallC','myroomDoor'); E('myroomDoor','myroomC'); E('myroomC','myBed');
  E('uphallN','parentsDoor'); E('parentsDoor','parentsC'); E('uphallN','bathDoor'); E('bathDoor','bathC');
  E('uphallC','storageDoor'); E('storageDoor','storageC'); E('hallC','stairB');
  world.nodes = nodes;
  world.nodeById = Object.fromEntries(nodes.map(n => [n.id, n]));

  world.groundY = groundY;
  world.roomAt = (x, z, y) => {
    for (const r of ROOMS) if (r.id !== 'outside' && x >= r.x1 && x <= r.x2 && z >= r.z1 && z <= r.z2) {
      const f = y < -1.4 ? -1 : y > 1.8 ? 1 : 0;
      if (r.f === f) return r;
    }
    if (z > 5) return ROOMS.find(r => r.id === 'outside');
    return ROOMS[0];
  };
  world.doorAtGap = (roomA, roomB) => null;

  // 视线检测
  const raycaster = new THREE.Raycaster();
  world.lineBlocked = (from, to) => {
    const dir = new THREE.Vector3().subVectors(to, from);
    const d = dir.length(); if (d < 0.01) return false;
    dir.normalize();
    raycaster.set(from, dir); raycaster.far = d - 0.05;
    const hits = raycaster.intersectObjects(world.blockers, false);
    return hits.length > 0;
  };

  world.update = (dt, t) => {
    for (const d of world.doorList) d.update(dt);
    if (world.tvOn) {
      world.lights.tv.intensity = 0.7 + Math.sin(t * 13.0) * 0.25 + Math.sin(t * 31.7) * 0.15;
      world.meshes.tvScreen.material.color.setHex(0x6fa0c8).offsetHSL(0, 0, Math.sin(t * 9) * 0.08);
    } else { world.lights.tv.intensity = 0; world.meshes.tvScreen.material.color.setHex(0x0a0c10); }
    world.lights.basement.intensity = 0.5 + (Math.sin(t * 7.3) > 0.93 ? -0.35 : 0) + Math.sin(t * 0.7) * 0.05;
  };

  world.reset = () => {
    for (const c of world.containers) { c.searched = false; c.pendingItem = null; }
    for (const d of Object.values(world.doors)) { d.open = false; d.anim = 0; }
    world.doors.study.locked = true; world.doors.storage.locked = true;
    world.doors.front.locked = true; world.doors.myroom.locked = true; world.doors.basement.locked = false;
    world.tvOn = true;
    world.meshes.safeOpen = false;
    if (world.meshes.safe.children.length > 3) world.meshes.safe.remove(world.meshes.safe.children[3]);
    world.meshes.phoneCoil.visible = false;
  };

  return world;
}

// ---------- 容器提示语 ----------
function containerPrompt(id, verb) {
  const c = G.world.containers.find(c => c.id === id);
  if (!c) return '';
  if (c.searched) return G.save.permGear.memo ? '【已搜过】' : '';
  return `【E】 ${verb || '翻找'}${c.name}`;
}

// ---------- 父亲低模 ----------
export function makeFather() {
  const g = new THREE.Group();
  const skin = 0xb08a68, shirt = 0x4a4e44, pants = 0x3a3d42;
  const torso = box(0.72, 0.78, 0.44, shirt, 0, 1.18, 0);
  const belly = box(0.66, 0.4, 0.5, shirt, 0, 0.92, 0.04);
  const head = box(0.34, 0.38, 0.36, skin, 0, 1.78, 0);
  const hair = box(0.36, 0.12, 0.38, 0x3a3230, 0, 1.98, 0);
  const eyeL = box(0.05, 0.05, 0.02, 0x111, -0.08, 1.82, 0.19); const eyeR = box(0.05, 0.05, 0.02, 0x111, 0.08, 1.82, 0.19);
  const mouth = box(0.16, 0.03, 0.02, 0x5a3028, 0, 1.68, 0.19);
  const armL = new THREE.Group(); armL.position.set(-0.42, 1.5, 0);
  armL.add(box(0.16, 0.62, 0.18, shirt, 0, -0.3, 0), box(0.14, 0.12, 0.15, skin, 0, -0.66, 0));
  const armR = new THREE.Group(); armR.position.set(0.42, 1.5, 0);
  armR.add(box(0.16, 0.62, 0.18, shirt, 0, -0.3, 0), box(0.14, 0.12, 0.15, skin, 0, -0.66, 0));
  const bottle = box(0.09, 0.24, 0.09, 0x6a3d1e, 0, -0.78, 0.06); armR.add(bottle);
  const legL = new THREE.Group(); legL.position.set(-0.18, 0.78, 0);
  legL.add(box(0.22, 0.72, 0.24, pants, 0, -0.36, 0), box(0.24, 0.1, 0.32, 0x24262a, 0, -0.74, 0.04));
  const legR = new THREE.Group(); legR.position.set(0.18, 0.78, 0);
  legR.add(box(0.22, 0.72, 0.24, pants, 0, -0.36, 0), box(0.24, 0.1, 0.32, 0x24262a, 0, -0.74, 0.04));
  g.add(torso, belly, head, hair, eyeL, eyeR, mouth, armL, armR, legL, legR);
  return { group: g, armL, armR, legL, legR, head, torso, bottle };
}

// ---------- 男孩低模（序章用） ----------
export function makeBoy() {
  const g = new THREE.Group();
  const skin = 0xd2a888, shirt = 0x5a8ab8, pants = 0x4e5464;
  const torso = box(0.46, 0.56, 0.3, shirt, 0, 1.05, 0);
  const head = box(0.3, 0.32, 0.3, skin, 0, 1.5, 0);
  const hair = box(0.32, 0.14, 0.32, 0x6a4a2c, 0, 1.7, -0.02);
  const eyeL = box(0.045, 0.045, 0.02, 0x182838, -0.07, 1.54, 0.16);
  const eyeR = box(0.045, 0.045, 0.02, 0x182838, 0.07, 1.54, 0.16);
  const smile = box(0.1, 0.025, 0.02, 0x8a5a4a, 0, 1.42, 0.16);
  const armL = new THREE.Group(); armL.position.set(-0.29, 1.3, 0); armL.add(box(0.11, 0.5, 0.13, shirt, 0, -0.24, 0), box(0.1, 0.1, 0.11, skin, 0, -0.52, 0));
  const armR = new THREE.Group(); armR.position.set(0.29, 1.3, 0); armR.add(box(0.11, 0.5, 0.13, shirt, 0, -0.24, 0), box(0.1, 0.1, 0.11, skin, 0, -0.52, 0));
  const legL = new THREE.Group(); legL.position.set(-0.12, 0.78, 0); legL.add(box(0.15, 0.74, 0.17, pants, 0, -0.37, 0), box(0.17, 0.09, 0.26, 0xd8dce2, 0, -0.76, 0.04));
  const legR = new THREE.Group(); legR.position.set(0.12, 0.78, 0); legR.add(box(0.15, 0.74, 0.17, pants, 0, -0.37, 0), box(0.17, 0.09, 0.26, 0xd8dce2, 0, -0.76, 0.04));
  g.add(torso, head, hair, eyeL, eyeR, smile, armL, armR, legL, legR);
  return { group: g, armL, armR, legL, legR, head, torso, smile };
}
