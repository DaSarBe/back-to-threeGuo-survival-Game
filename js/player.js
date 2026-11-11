import * as THREE from 'three';
import { G } from './state.js';
import { ITEMS, WEAPONS, HOTBAR } from './data.js';
import { world, heightAt, WATER, HALF, SITES } from './world.js';
import { viewModel } from './models.js';
import { audio } from './audio.js';
import { spawnArrow, spawnGrenade, alertEnemies, fxTracer, fxBurst } from './entities.js';
import { clamp, lerp, rnd, turnTo, dist2 } from './util.js';

const PI = Math.PI;
const keys = {}, mouse = { l: false, r: false };
const touch = { mx: 0, mz: 0, fire: false, joyId: null, lookId: null, jx: 0, jy: 0, lx: 0, ly: 0 };
const V = new THREE.Vector3(), D = new THREE.Vector3(), O = new THREE.Vector3(), T = new THREE.Vector3();
let jumpQ = false, eCd = 0, interact = null, interactT = 0, vmCur = null, flashT = 0, muzzle;
const vms = {};

export const player = {
  pos: new THREE.Vector3(), vy: 0, yaw: 0, pitch: 0, onGround: true, alive: true, radius: 0.4, eyeH: 1.68,
  hp: 100, maxHp: 100, hunger: 100, thirst: 100, stamina: 100, armor: 0, canteen: 3,
  inv: {}, owned: { pistol: true }, cur: 'pistol', mags: { pistol: 12, shotgun: 6, rifle: 5 },
  fireCd: 0, reloadT: 0, swingT: 0, meleeT: 0, recoil: 0, shake: 0, aim: 0, mount: null, horse: null,
  kx: 0, kz: 0, sprinting: false, stepT: 0, bob: 0, hurtT: 0, speedNow: 0, hx: 0, hz: 0, throwCd: 0,

  count(it) { return this.inv[it] || 0; },
  give(it, n = 1, announce = false) {
    this.inv[it] = (this.inv[it] || 0) + n;
    if (announce) G.ui.msg(`獲得 ${ITEMS[it].i} ${ITEMS[it].n} ×${n}`, 'get');
    G.ui.dirty = true;
  },
  take(it, n = 1) { if ((this.inv[it] || 0) < n) return false; this.inv[it] -= n; G.ui.dirty = true; return true; },
  giveWeapon(id) {
    if (this.owned[id]) return;
    this.owned[id] = true; G.ui.msg(`獲得兵器：${WEAPONS[id].i} ${WEAPONS[id].n}（按 ${HOTBAR.indexOf(id) + 1} 切換）`, 'quest'); G.ui.dirty = true;
  },
  equip(id) {
    if (!this.owned[id] || this.cur === id) return;
    this.cur = id; this.reloadT = 0; this.fireCd = Math.max(this.fireCd, 0.25); this.swingT = 0; G.ui.dirty = true; audio.play('click');
  },
  cycle(dir) {
    const own = HOTBAR.filter(w => this.owned[w]); const i = own.indexOf(this.cur);
    this.equip(own[(i + dir + own.length) % own.length]);
  },
  shove(vx, vz) { this.kx += vx; this.kz += vz; },

  damage(n, src) {
    if (!this.alive || G.menu) return;
    n *= (1 - this.armor); this.hp -= n; this.hurtT = 6;
    G.ui.hurt(n); audio.play('hurt', 0.8); this.shake = Math.max(this.shake, 0.12);
    if (this.hp <= 0) {
      this.hp = 0; this.alive = false; if (this.mount) this.dismount();
      G.ui.deathBy(src && src.name ? src.name : null);
    }
  },
  respawn() {
    const sp = G.stage >= 1 ? world.spots.respawn : [SITES.spawn.x, SITES.spawn.z];
    this.pos.set(sp[0], heightAt(sp[0], sp[1]), sp[1]);
    this.alive = true; this.hp = 70; this.hunger = Math.max(this.hunger, 50); this.thirst = Math.max(this.thirst, 50);
    const lost = Math.floor(this.count('coin') * 0.3); if (lost) this.inv.coin -= lost;
    this.kx = this.kz = 0; this.vy = 0;
    for (const a of G.actors) if (a.target === this) { a.target = null; a.alert = 0; }
    G.ui.msg(lost ? `你被救回營地，遺失了 ${lost} 枚五銖錢。` : '你在一陣暈眩中醒來……', 'warn'); G.ui.dirty = true;
  },

  // ---- 消耗品 ----
  eat() {
    for (const it of ['cooked', 'ration', 'berry', 'meat']) if (this.count(it) > 0) {
      const d = ITEMS[it]; this.take(it);
      this.hunger = Math.min(100, this.hunger + d.food); if (d.water) this.thirst = Math.min(100, this.thirst + d.water);
      if (d.hp) this.hp = Math.max(1, this.hp + d.hp);
      G.ui.msg(`食用 ${d.n}` + (d.hp ? '（生食傷身，烤熟再吃較好）' : ''), 'info'); audio.play('eat'); return;
    }
    G.ui.msg('沒有食物了！去採野果、打獵，或向糜竺購買乾糧。', 'warn');
  },
  heal() {
    if (this.hp >= this.maxHp) return G.ui.msg('生命已滿。', 'info');
    if (!this.take('medicine')) return G.ui.msg('沒有金瘡藥（2 草藥可製作）。', 'warn');
    this.hp = Math.min(this.maxHp, this.hp + ITEMS.medicine.heal); G.ui.msg('使用金瘡藥，生命恢復。', 'get'); audio.play('drink');
  },
  drink() {
    if (this.canteen <= 0) return G.ui.msg('水囊空了，到河邊或水井裝水。', 'warn');
    this.canteen--; this.thirst = Math.min(100, this.thirst + 40); G.ui.msg(`喝了一口水（水囊剩 ${this.canteen}/3）`, 'info'); audio.play('drink'); G.ui.dirty = true;
  },
  whistle() {
    const h = this.horse;
    if (!h || this.mount) return G.ui.msg(this.mount ? '你已經在馬上了。' : '你還沒有自己的馬。', 'info');
    h.state = 'come'; G.ui.msg(`你吹了聲口哨，${h.name}正朝你奔來。`, 'info'); audio.play('neigh', 0.6);
  },
  throwGrenade() {
    if (this.throwCd > 0) return;
    if (!this.take('grenade')) return G.ui.msg('沒有震天雷（2 黑火藥 + 1 鐵礦）。', 'warn');
    this.throwCd = 0.8; camDir(D); O.copy(G.camera.position).addScaledVector(D, 0.6);
    V.copy(D).multiplyScalar(19); V.y += 5.5; spawnGrenade(O, V); audio.play('swing');
  },

  // ---- 騎馬 ----
  mountHorse(h) {
    if (!h.tamed) { h.tame(); G.ui.msg(`你馴服了這匹${h.name}！`, 'get'); }
    this.mount = h; this.horse = h; h.rider = true; h.state = 'idle'; h.dir = null;
    h.speed = 0; audio.play('neigh', 0.7); G.ui.msg('已上馬：W 前進、Shift 奔馳、E 下馬、X 可吹哨喚馬。', 'info');
  },
  dismount() {
    const h = this.mount; if (!h) return;
    h.rider = false; h.speed = 0; this.mount = null; h.home.x = h.pos.x; h.home.z = h.pos.z;
    this.pos.set(h.pos.x + Math.cos(h.yaw) * 1.4, 0, h.pos.z - Math.sin(h.yaw) * 1.4);
    this.pos.y = heightAt(this.pos.x, this.pos.z);
  },

  // ---- 武器 ----
  reload() {
    const w = WEAPONS[this.cur];
    if (w.type !== 'gun' || this.reloadT > 0 || this.mags[this.cur] >= w.mag) return;
    if (w.ammo && this.count(w.ammo) <= 0) return G.ui.msg(`沒有${ITEMS[w.ammo].n}了，需要製作。`, 'warn');
    this.reloadT = w.reload; audio.play('reload');
  },
  fire() {
    const w = WEAPONS[this.cur];
    if (this.fireCd > 0 || this.reloadT > 0) return;
    if (w.type === 'gun') {
      if (this.mags[this.cur] <= 0) { audio.play('click'); this.fireCd = 0.25; this.reload(); return; }
      this.mags[this.cur]--; this.fireCd = w.rate; G.ui.dirty = true;
      audio.play(this.cur); this.recoil += w.kick; flashT = 0.05;
      camDir(D); O.copy(G.camera.position);
      const spread = w.spread * (this.aim > 0.5 ? 0.35 : 1) * (this.mount && this.mount.speed > 5 ? 2 : 1) + (this.speedNow > 6 ? 0.012 : 0);
      for (let i = 0; i < (w.pellets || 1); i++) this.hitscan(O, D, w, spread);
      alertEnemies(this.pos, 85);
    } else if (w.type === 'melee') {
      this.fireCd = w.rate; this.swingT = 0.32; this.meleeT = 0.13; audio.play('swing');
    } else if (w.type === 'bow') {
      if (!this.take('arrow')) { this.fireCd = 0.4; return G.ui.msg('沒有箭矢了（1 木材 + 1 鐵礦 可製作 6 支）。', 'warn'); }
      this.fireCd = w.rate; this.swingT = 0.25; camDir(D); O.copy(G.camera.position).addScaledVector(D, 0.5);
      V.copy(D).multiplyScalar(58); V.y += 1.2; spawnArrow(O, V, this, w.dmg); audio.play('bow');
    }
  },
  hitscan(o, dir, w, spread) {
    T.set(dir.x + rnd(-spread, spread), dir.y + rnd(-spread, spread), dir.z + rnd(-spread, spread)).normalize();
    const block = world.rayBlock(o, T, w.range);
    let best = null, bt = block;
    for (const a of G.actors) if (a.faction === 'enemy') { const h = a.rayHit(o, T); if (h && h.t < bt) { bt = h.t; best = a; best._head = h.head; } }
    for (const a of G.animals) { const h = a.rayHit(o, T); if (h && h.t < bt) { bt = h.t; best = a; best._head = false; } }
    V.copy(o).addScaledVector(T, bt);
    if (best) {
      const head = best._head; best.damage(w.dmg * (head ? 2 : 1), this);
      G.ui.hitmarker(head, !best.alive); fxBurst(V, 0x9a0a0a, 7, 3, 0.4, 0.12);
    } else if (bt < w.range) fxBurst(V, 0x9a8a6a, 5, 2.5, 0.35, 0.1);
    if (muzzle) fxTracer(muzzle.getWorldPosition(new THREE.Vector3()), V.clone());
  },
  meleeHit() {
    const w = WEAPONS[this.cur]; camDir(D); let n = 0;
    const reach = w.reach + (this.mount ? 0.6 : 0);
    const test = (a) => {
      const dx = a.pos.x - this.pos.x, dz = a.pos.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d > reach + a.radius || Math.abs(a.pos.y - this.pos.y) > 3) return;
      if (d > 0.8 && (dx * D.x + dz * D.z) / d < 0.45) return;
      a.damage(w.dmg * (0.9 + rnd(0.25)) * (this.mount && this.mount.speed > 8 ? 1.5 : 1), this); n++;
      V.set(a.pos.x, a.pos.y + 1.2, a.pos.z); fxBurst(V, 0x9a0a0a, 6, 3, 0.4, 0.12);
    };
    for (const a of G.actors) if (a.alive && a.faction === 'enemy' && n < 3) test(a);
    for (const a of G.animals) if (a.alive && a.kind !== 'horse' && n < 3) test(a);
    if (n) { audio.play('hit'); G.ui.hitmarker(false); this.shake = Math.max(this.shake, 0.06); }
  },
};
function camDir(out) { return G.camera.getWorldDirection(out); }

// =====================================================================
//  互動
// =====================================================================
function findInteract() {
  const P = player, fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
  if (P.mount) return { label: '下馬', act: () => P.dismount() };
  let best = null, bs = 1e9;
  const consider = (x, z, maxD, label, act) => {
    const dx = x - P.pos.x, dz = z - P.pos.z, d = Math.hypot(dx, dz);
    if (d > maxD) return;
    const dot = d < 0.6 ? 1 : (dx * fx + dz * fz) / d;
    if (dot < 0.25) return;
    const s = d + (1 - dot) * 3; if (s < bs) { bs = s; best = { label, act }; }
  };
  for (const a of G.actors) if (a.alive && a.def.general && a.faction === 'ally') consider(a.pos.x, a.pos.z, 3.6, `與 ${a.name} 交談`, () => G.ui.talk(a));
  for (const h of G.animals) if (h.kind === 'horse' && h.alive) consider(h.pos.x, h.pos.z, 3.4, h.tamed ? `騎乘 ${h.name}` : `馴服並騎乘 ${h.name}`, () => P.mountHorse(h));
  world.nodes.query(P.pos.x, P.pos.z, 3.6, n => {
    if (n.kind === 'tree') consider(n.x, n.z, n.bamboo ? 5 : 2.6, n.bamboo ? '砍伐竹子' : '砍伐樹木', () => gather(n));
    else if (n.kind === 'crate') { if (n.stock > 0) consider(n.x, n.z, 3, '打開軍火箱', () => G.openCrate(n)); }
    else if (n.kind === 'bed') consider(n.x, n.z, 3, '在臥榻休息', () => G.sleep());
    else if (n.kind === 'well') consider(n.x, n.z, 3, '打水飲用', () => drinkWater());
    else if (n.stock > 0) consider(n.x, n.z, 2.8, `採集 ${ITEMS[n.item].n}`, () => gather(n));
  });
  if (!best) {
    const wx = P.pos.x + fx * 1.6, wz = P.pos.z + fz * 1.6;
    if (heightAt(wx, wz) < WATER - 0.1 || heightAt(P.pos.x, P.pos.z) < WATER) best = { label: '飲水並裝滿水囊', act: drinkWater };
  }
  return best;
}
function drinkWater() {
  player.thirst = 100; player.canteen = 3; audio.play('drink'); G.ui.msg('你喝飽了水，並裝滿了水囊（按 Z 飲用）。', 'info'); G.ui.dirty = true;
}
function gather(n) {
  const P = player;
  if (n.kind === 'tree') {
    n.stock = Math.min(3, n.stock + Math.floor((G.now - n.last) / 45));
    if (n.stock <= 0) return G.ui.msg('這裡暫時砍不出木材了，換一處吧。', 'info');
    n.stock--; n.last = G.now; P.give('wood', 1, true); audio.play('chop');
  } else {
    n.stock--; P.give(n.item, n.kind === 'ore' ? 1 : (n.item === 'berry' ? 3 : 1), true); audio.play(n.kind === 'ore' ? 'chop' : 'pickup');
    if (n.stock <= 0) { n.mesh.visible = false; n.respawn = 220; }
  }
  P.swingT = 0.2;
}
function pressInteract() { if (eCd <= 0 && interact) { eCd = 0.3; interact.act(); interactT = 0; } }

// =====================================================================
//  每幀更新
// =====================================================================
export function updatePlayer(dt) {
  const P = player, cam = G.camera;
  if (!P.alive) return;
  eCd -= dt; P.fireCd -= dt; P.throwCd -= dt; P.hurtT -= dt;

  // ---- 輸入 ----
  let ix = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0) + touch.mx, iz = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0) + touch.mz;
  const il = Math.hypot(ix, iz); if (il > 1) { ix /= il; iz /= il; }
  const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
  const wantSprint = (keys.ShiftLeft || keys.ShiftRight || (G.touch && il > 0.92)) && iz > 0.1;
  const wading = heightAt(P.pos.x, P.pos.z) < WATER - 0.35;

  if (P.mount) {
    const h = P.mount; let target = 0;
    if (il > 0.1) {
      const wx = fx * iz + rx * ix, wz = fz * iz + rz * ix;
      h.yaw = turnTo(h.yaw, Math.atan2(wx, wz), dt * 2.8);
      target = wantSprint ? h.maxSpeed : 7.5;
    }
    if (wading) target *= 0.5;
    h.speed = lerp(h.speed, target, Math.min(1, dt * (target > h.speed ? 1.6 : 3)));
    h.pos.x += Math.sin(h.yaw) * h.speed * dt + P.kx * dt; h.pos.z += Math.cos(h.yaw) * h.speed * dt + P.kz * dt;
    world.resolve(h.pos, 0.85);
    h.pos.x = clamp(h.pos.x, -HALF + 25, HALF - 25); h.pos.z = clamp(h.pos.z, -HALF + 25, HALF - 25);
    h.pos.y = Math.max(heightAt(h.pos.x, h.pos.z), WATER - 1.2);
    P.pos.copy(h.pos); P.speedNow = h.speed; P.sprinting = h.speed > 9; P.onGround = true;
    P.stepT -= dt * h.speed; if (P.stepT <= 0 && h.speed > 1) { P.stepT = 2.6; audio.play('hoof', 0.5); }
    P.eyeH = lerp(P.eyeH, 2.5, Math.min(1, dt * 8));
  } else {
    P.sprinting = wantSprint && P.stamina > 1 && !wading;
    let sp = P.sprinting ? 8.4 : 5.2;
    if (wading) sp *= 0.55; if (P.aim > 0.5) sp *= 0.6;
    if (P.hunger <= 0 || P.thirst <= 0) sp *= 0.8;
    const tx = (fx * iz + rx * ix) * sp, tz = (fz * iz + rz * ix) * sp;
    const acc = Math.min(1, dt * (P.onGround ? 12 : 3));
    P.hx = lerp(P.hx, tx, acc); P.hz = lerp(P.hz, tz, acc);
    P.pos.x += (P.hx + P.kx) * dt; P.pos.z += (P.hz + P.kz) * dt;
    if (jumpQ && P.onGround) { P.vy = 6.6; P.onGround = false; }
    P.vy -= 20 * dt; P.pos.y += P.vy * dt;
    world.resolve(P.pos, P.radius);
    P.pos.x = clamp(P.pos.x, -HALF + 25, HALF - 25); P.pos.z = clamp(P.pos.z, -HALF + 25, HALF - 25);
    const gy = Math.max(heightAt(P.pos.x, P.pos.z), WATER - 1.25);
    if (P.pos.y <= gy) { P.pos.y = gy; P.vy = 0; P.onGround = true; } else if (P.pos.y > gy + 0.3) P.onGround = false;
    P.speedNow = Math.hypot(P.hx, P.hz);
    if (P.sprinting) P.stamina = Math.max(0, P.stamina - 14 * dt); else P.stamina = Math.min(100, P.stamina + (il > 0.1 ? 9 : 18) * dt);
    if (P.onGround && P.speedNow > 1) { P.bob += P.speedNow * dt * 1.5; P.stepT -= P.speedNow * dt; if (P.stepT <= 0) { P.stepT = 2.6; audio.play('step', wading ? 1.4 : 0.8); } }
    P.eyeH = lerp(P.eyeH, 1.68, Math.min(1, dt * 8));
  }
  jumpQ = false;
  P.kx *= Math.max(0, 1 - dt * 5); P.kz *= Math.max(0, 1 - dt * 5);

  // ---- 求生數值 ----
  const drain = P.sprinting && !P.mount ? 1.6 : 1;
  P.hunger = Math.max(0, P.hunger - dt * 100 / 840 * drain); P.thirst = Math.max(0, P.thirst - dt * 100 / 600 * drain);
  if (P.hunger <= 0 || P.thirst <= 0) { P.hp -= dt * 1.4; if (P.hp <= 0) { P.hp = 0; P.alive = false; if (P.mount) P.dismount(); G.ui.deathBy(P.thirst <= 0 ? '乾渴' : '飢餓'); return; } }
  else if (P.hurtT <= 0 && P.hp < P.maxHp && P.hunger > 35 && P.thirst > 35) P.hp = Math.min(P.maxHp, P.hp + dt * 1.3);

  // ---- 武器 ----
  const w = WEAPONS[P.cur];
  if (P.reloadT > 0) {
    P.reloadT -= dt;
    if (P.reloadT <= 0) {
      const need = w.mag - P.mags[P.cur], n = w.ammo ? Math.min(need, P.count(w.ammo)) : need;
      if (w.ammo) P.inv[w.ammo] -= n; P.mags[P.cur] += n; G.ui.dirty = true;
    }
  }
  if ((mouse.l || touch.fire) && !G.menu) P.fire();
  if (P.meleeT > 0) { P.meleeT -= dt; if (P.meleeT <= 0) P.meleeHit(); }
  P.aim = lerp(P.aim, (mouse.r && w.type === 'gun' && P.reloadT <= 0) ? 1 : 0, Math.min(1, dt * 12));
  P.recoil = lerp(P.recoil, 0, Math.min(1, dt * 9)); P.shake = Math.max(0, P.shake - dt * 1.2);
  if (keys.KeyE) pressInteract();

  // ---- 鏡頭 ----
  const bobY = P.mount ? Math.abs(Math.sin(P.mount.ph)) * 0.09 * clamp(P.mount.speed / 8, 0, 1) : Math.sin(P.bob * 2) * 0.035 * clamp(P.speedNow / 5, 0, 1);
  cam.position.set(P.pos.x + rnd(-1, 1) * P.shake, P.pos.y + P.eyeH + bobY + rnd(-1, 1) * P.shake, P.pos.z + rnd(-1, 1) * P.shake);
  cam.rotation.set(P.pitch + P.recoil, P.yaw, 0);
  const fov = lerp(74, w.fov || 74, P.aim) + (P.sprinting ? 4 : 0);
  if (Math.abs(cam.fov - fov) > 0.05) { cam.fov = lerp(cam.fov, fov, Math.min(1, dt * 14)); cam.updateProjectionMatrix(); }

  updateViewModel(dt, w);
  interactT -= dt; if (interactT <= 0) { interactT = 0.12; interact = findInteract(); G.ui.prompt(interact ? interact.label : null); }
}

function updateViewModel(dt, w) {
  const P = player;
  if (vmCur !== P.cur) {
    for (const k in vms) vms[k].visible = false;
    if (!vms[P.cur]) { vms[P.cur] = viewModel(P.cur); G.camera.add(vms[P.cur]); }
    vms[P.cur].visible = true; vmCur = P.cur;
    if (!muzzle) { muzzle = new THREE.Object3D(); G.camera.add(muzzle); muzzle.light = new THREE.PointLight(0xffc060, 0, 14); muzzle.add(muzzle.light); }
  }
  const m = vms[P.cur], t = G.now, sway = Math.sin(P.bob) * 0.012 * clamp(P.speedNow / 5, 0, 1);
  if (w.type === 'gun') {
    const a = P.aim, rl = P.reloadT > 0 ? Math.sin(Math.min(1, (w.reload - P.reloadT) / w.reload) * PI) : 0;
    const adsY = P.cur === 'pistol' ? -0.062 : P.cur === 'shotgun' ? -0.07 : -0.1;
    m.position.set(lerp(0.23, 0, a) + sway, lerp(-0.21, adsY, a) - rl * 0.18 + Math.abs(sway) * 0.5, lerp(-0.62, -0.5, a) + P.recoil * 0.9);
    m.rotation.set(P.recoil * 2.2 - rl * 0.9, 0, rl * 0.3);
    m.scale.setScalar(0.8);
    m.visible = !(w.scope && a > 0.85);
    G.ui.scope(w.scope && a > 0.85);
    muzzle.position.set(m.position.x, m.position.y + 0.02, m.position.z - (P.cur === 'pistol' ? 0.22 : 0.9));
  } else {
    G.ui.scope(false);
    const s = P.swingT > 0 ? 1 - P.swingT / 0.32 : 0, k = Math.sin(s * PI);
    if (P.swingT > 0) P.swingT -= dt;
    if (P.cur === 'bow') { m.position.set(0.26 - k * 0.1, -0.2, -0.6 + k * 0.1); m.rotation.set(0, PI, 0.12); }
    else if (P.cur === 'dao') { m.position.set(0.36 - k * 0.4 + sway, -0.42 + k * 0.1, -0.55); m.rotation.set(-0.4 - k * 1.3, 0.2, -0.25 + k * 1.0); }
    else { m.position.set(0.32 + sway, -0.5, -0.1 - k * 0.9); m.rotation.set(-1.32 - k * 0.12, 0.08, -0.05); }
  }
  flashT -= dt; muzzle.light.intensity = flashT > 0 ? 60 : 0;
}

// =====================================================================
//  輸入事件
// =====================================================================
export function initInput(canvas) {
  const P = player;
  const lock = () => { if (!G.touch && !G.noLock && document.pointerLockElement !== canvas) { try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => { }); } catch (e) { } } };
  G.lockPointer = lock;
  G.unlockPointer = () => { if (document.pointerLockElement) document.exitPointerLock(); };
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement !== canvas) { mouse.l = mouse.r = false; if (!G.menu && !G.touch && !G.noLock) G.ui.open('pause'); }
  });
  document.addEventListener('pointerlockerror', () => { G.noLock = true; if (!G.menu) G.ui.msg('無法鎖定滑鼠：請按住滑鼠右鍵拖曳來轉動視角。', 'warn'); });
  const look = (dx, dy, s) => { P.yaw -= dx * s; P.pitch = clamp(P.pitch - dy * s, -1.5, 1.5); };
  document.addEventListener('mousemove', e => {
    if (G.menu) return;
    const sens = 0.0022 * lerp(1, (WEAPONS[P.cur].fov || 74) / 74, P.aim);
    if (document.pointerLockElement === canvas) look(e.movementX, e.movementY, sens);
    else if (G.noLock && (e.buttons & 2)) look(e.movementX, e.movementY, sens * 1.5);
  });
  canvas.addEventListener('mousedown', e => {
    if (G.menu) return;
    audio.init();
    if (!G.noLock && !G.touch && document.pointerLockElement !== canvas) { lock(); return; }
    if (e.button === 0) mouse.l = true; else if (e.button === 2) mouse.r = true;
  });
  document.addEventListener('mouseup', e => { if (e.button === 0) mouse.l = false; else if (e.button === 2) mouse.r = false; });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('wheel', e => { if (!G.menu) P.cycle(e.deltaY > 0 ? 1 : -1); }, { passive: true });
  document.addEventListener('keydown', e => {
    if (e.code === 'Tab') e.preventDefault();
    if (G.menu) {
      if ((e.code === 'Escape' || e.code === 'Tab' || e.code === 'KeyC') && !e.repeat) G.ui.escape();
      return;
    }
    if (e.repeat) return;
    keys[e.code] = true;
    if (e.code.startsWith('Digit')) { const i = +e.code.slice(5) - 1; if (HOTBAR[i]) { if (P.owned[HOTBAR[i]]) P.equip(HOTBAR[i]); else G.ui.msg(`尚未取得 ${WEAPONS[HOTBAR[i]].n}。`, 'info'); } }
    else act({ KeyE: 'interact', Space: 'jump', KeyR: 'reload', KeyG: 'grenade', KeyF: 'eat', KeyH: 'heal', KeyZ: 'drink', KeyX: 'whistle', Tab: 'menu', KeyC: 'menu', KeyI: 'menu', KeyM: 'music', Escape: 'pause', KeyP: 'pause' }[e.code]);
  });
  document.addEventListener('keyup', e => { keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouse.l = mouse.r = false; });

  // ---- 觸控 ----
  const joy = document.getElementById('joy'), knob = document.getElementById('joyknob');
  const tstart = e => {
    if (G.menu) return; audio.init();
    for (const t of e.changedTouches) {
      const el = t.target.closest && t.target.closest('[data-act]');
      if (el) {
        const a = el.dataset.act;
        if (a === 'fire') { touch.fire = true; touch.fireId = t.identifier; touch.lx = t.clientX; touch.ly = t.clientY; }
        else if (a === 'aim') mouse.r = !mouse.r; else act(a);
        continue;
      }
      if (t.clientX < innerWidth * 0.4 && touch.joyId === null) {
        touch.joyId = t.identifier; touch.jx = t.clientX; touch.jy = t.clientY;
        joy.style.display = 'block'; joy.style.left = t.clientX - 60 + 'px'; joy.style.top = t.clientY - 60 + 'px'; knob.style.transform = '';
      } else if (touch.lookId === null) { touch.lookId = t.identifier; touch.lx = t.clientX; touch.ly = t.clientY; }
    }
    e.preventDefault();
  };
  const tmove = e => {
    for (const t of e.changedTouches) {
      if (t.identifier === touch.joyId) {
        let dx = t.clientX - touch.jx, dy = t.clientY - touch.jy; const d = Math.hypot(dx, dy), m = 55;
        if (d > m) { dx *= m / d; dy *= m / d; }
        touch.mx = dx / m; touch.mz = -dy / m; knob.style.transform = `translate(${dx}px,${dy}px)`;
      } else if (t.identifier === touch.lookId || t.identifier === touch.fireId) {
        if (!G.menu) look(t.clientX - touch.lx, t.clientY - touch.ly, 0.0055 * lerp(1, 0.4, P.aim));
        touch.lx = t.clientX; touch.ly = t.clientY;
      }
    }
    e.preventDefault();
  };
  const tend = e => {
    for (const t of e.changedTouches) {
      if (t.identifier === touch.joyId) { touch.joyId = null; touch.mx = touch.mz = 0; joy.style.display = 'none'; }
      if (t.identifier === touch.lookId) touch.lookId = null;
      if (t.identifier === touch.fireId) { touch.fireId = null; touch.fire = false; }
    }
  };
  const layer = document.getElementById('touch');
  for (const el of [canvas, layer]) {
    el.addEventListener('touchstart', tstart, { passive: false }); el.addEventListener('touchmove', tmove, { passive: false });
    el.addEventListener('touchend', tend); el.addEventListener('touchcancel', tend);
  }
}
function act(a) {
  const P = player; if (!a) return;
  switch (a) {
    case 'jump': jumpQ = true; break;
    case 'reload': P.reload(); break;
    case 'grenade': P.throwGrenade(); break;
    case 'eat': P.eat(); break;
    case 'heal': P.heal(); break;
    case 'drink': P.drink(); break;
    case 'whistle': P.whistle(); break;
    case 'interact': pressInteract(); break;
    case 'next': P.cycle(1); break;
    case 'menu': G.ui.open('inv'); break;
    case 'pause': G.ui.open('pause'); break;
    case 'music': G.ui.msg(audio.toggleMusic() ? '配樂：開' : '配樂：關', 'info'); break;
  }
}
export function resetInput() { for (const k in keys) keys[k] = false; mouse.l = mouse.r = false; touch.fire = false; touch.mx = touch.mz = 0; }
