import * as THREE from 'three';
import { G } from './state.js';
import { ACTORS, ITEMS, WEAPONS } from './data.js';
import { humanoid, quadruped } from './models.js';
import { world, heightAt, WATER } from './world.js';
import { audio } from './audio.js';
import { clamp, lerp, rnd, rndInt, pick, dist2, angDiff, turnTo, raySphere, makeLabel } from './util.js';

const PI = Math.PI;
const V = new THREE.Vector3(), V2 = new THREE.Vector3();
const d2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// =====================================================================
//  人形角色（士兵 / 名將 / 頭目）
// =====================================================================
export class Actor {
  constructor(id, x, z, o = {}) {
    const d = this.def = ACTORS[id];
    this.id = id; this.faction = d.faction; this.name = d.name;
    this.maxHp = this.hp = d.hp;
    this.pos = new THREE.Vector3(x, heightAt(x, z), z);
    this.home = { x, z }; this.yaw = o.yaw ?? rnd(PI * 2);
    this.scale = d.scale || 1; this.roam = !!o.roam; this.group = o.group || null;
    const m = this.m = humanoid(d.look, d.weapon, d.weapon2, this.scale);
    this.seat = 0;
    if (d.mounted) {
      this.horse = quadruped({ kind: 'horse', color: d.horseColor || 0x4a3020, dark: 0x111111, saddle: true, blanket: 0x26262c });
      m.root.add(this.horse.root); this.seat = 0.86; m.inner.position.y = this.seat;
      m.legL.rotation.set(-1.0, 0, -0.5); m.legR.rotation.set(-1.0, 0, 0.5);
    }
    if (d.general || d.boss) {
      const l = makeLabel(d.name, d.boss ? '#ff6a5a' : '#9af0a0');
      l.position.y = 2.2 * this.scale + this.seat + 0.25; m.root.add(l);
    }
    m.root.position.copy(this.pos); m.root.rotation.y = this.yaw;
    G.scene.add(m.root); G.actors.push(this);
    this.alive = true; this.target = null; this.follow = false;
    this.atkT = rnd(1); this.wind = 0; this.windTot = 0.5; this.walkPh = rnd(6); this.curSpeed = 0;
    this.alert = 0; this.wanderT = rnd(1, 5); this.dest = null; this.retT = rnd(0.5);
    this.specialT = 3 + rnd(2); this.charge = 0; this.summoned = 0; this.deathT = 0;
    this.stuckT = 0; this.sideT = 0; this.sideDir = 0; this.farT = 0; this.wp = [0, 0]; this.wpT = 0; this.wpGoal = null;
  }
  get radius() { return (this.horse ? 0.9 : 0.42) * this.scale; }

  rayHit(o, d) {
    if (!this.alive) return null;
    const s = this.scale, p = this.pos, y = p.y + this.seat;
    let best = -1, head = false, t;
    t = raySphere(o.x, o.y, o.z, d.x, d.y, d.z, p.x, y + 1.64 * s, p.z, 0.25 * s); if (t >= 0) { best = t; head = true; }
    t = raySphere(o.x, o.y, o.z, d.x, d.y, d.z, p.x, y + 1.1 * s, p.z, 0.47 * s); if (t >= 0 && (best < 0 || t < best - 0.3)) { best = t; head = false; }
    t = raySphere(o.x, o.y, o.z, d.x, d.y, d.z, p.x, y + 0.45 * s, p.z, 0.37 * s); if (t >= 0 && (best < 0 || t < best)) { best = t; head = false; }
    if (this.horse) { t = raySphere(o.x, o.y, o.z, d.x, d.y, d.z, p.x, p.y + 1.15, p.z, 0.9); if (t >= 0 && (best < 0 || t < best)) { best = t; head = false; } }
    return best >= 0 ? { t: best, head } : null;
  }

  damage(n, src) {
    if (!this.alive || this.def.noncombat) return;
    if (this.faction === 'ally' && src === G.player) return;
    if (this.def.boss && src instanceof Actor) n *= 0.4;
    this.hp -= n; this.alert = 12;
    if (src && src !== this && src.alive !== false && (!this.target || src === G.player || Math.random() < 0.3)) {
      if (!(src.faction && src.faction === this.faction)) this.target = src;
    }
    // 呼叫附近同伴
    if (this.faction === 'enemy') for (const a of G.actors) if (a.alive && a.faction === 'enemy' && a !== this && d2(a.pos, this.pos) < 30) { a.alert = Math.max(a.alert, 10); if (!a.target && src) a.target = src; }
    if (this.hp <= 0) this.die(src);
  }

  die(src) {
    const d = this.def;
    if (d.general && this.faction === 'ally') { // 名將不死，負傷回營
      this.hp = this.maxHp * 0.5; this.follow = false; this.target = null;
      this.pos.set(this.home.x, heightAt(this.home.x, this.home.z), this.home.z);
      G.ui.msg(`${d.name} 負傷，退回營中休養。`, 'warn');
      return;
    }
    this.alive = false; this.target = null;
    if (this.faction === 'enemy') {
      const dr = d.drop;
      if (dr) {
        if (dr.coin) dropItem(this.pos, 'coin', rndInt(dr.coin[0], dr.coin[1]));
        for (const [it, ch, n] of dr.items || []) if (Math.random() < ch) dropItem(this.pos, it, n || 1);
        if (dr.weapon && Math.random() < dr.weapon[1] && !G.player.owned[dr.weapon[0]]) dropItem(this.pos, 'w:' + dr.weapon[0], 1);
      }
      if (d.boss) G.killed[this.id] = true;
      if (G.onKill) G.onKill(this, src);
    }
  }

  findTarget() {
    const P = G.player; let best = null, bd = 1e9;
    if (this.faction === 'enemy') {
      const see = this.alert > 0 ? 110 : (world.isNight ? 28 : 40) * (this.def.boss ? 1.3 : 1);
      if (P.alive) { const d = d2(this.pos, P.pos); if (d < see) { best = P; bd = d * 0.8; } }
      for (const a of G.actors) if (a.alive && a.faction === 'ally' && !a.def.noncombat) { const d = d2(this.pos, a.pos); if (d < 32 && d < bd) { best = a; bd = d; } }
    } else {
      const P_ = this.follow ? P.pos : this.pos;
      for (const a of G.actors) if (a.alive && a.faction === 'enemy') {
        const d = d2(this.pos, a.pos); if (d < bd && (d < 30 || (this.follow && d2(P_, a.pos) < 34))) { best = a; bd = d; }
      }
      if (!best) for (const a of G.animals) if (a.alive && a.kind === 'wolf') { const d = d2(this.pos, a.pos); if (d < 16 && d < bd) { best = a; bd = d; } }
    }
    return best;
  }

  update(dt) {
    const m = this.m, P = G.player, d = this.def;
    if (!this.alive) {
      this.deathT += dt;
      m.root.rotation.x = -Math.min(1, this.deathT * 3.2) * PI / 2;
      m.root.position.y = this.pos.y + 0.15 - Math.max(0, this.deathT - 7) * 0.5;
      if (this.deathT > 10) { G.scene.remove(m.root); this.gone = true; }
      return;
    }
    const dp = d2(this.pos, P.pos);
    if (dp > 240 && !this.follow) { m.root.visible = false; return; }
    m.root.visible = true;
    if (dp > 180 && !this.follow && !this.target) return;

    this.atkT -= dt; this.alert -= dt; this.specialT -= dt;
    if (this.faction === 'ally' && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.012 * dt);

    // ---- 目標 ----
    this.retT -= dt;
    if (this.retT <= 0 && !d.noncombat) {
      this.retT = 0.45 + rnd(0.2);
      const t = this.target;
      if (t && (t.alive === false || d2(this.pos, t.pos) > (this.alert > 0 ? 130 : 75))) this.target = null;
      if (!this.target || this.target !== P || this.faction === 'ally') { const nt = this.findTarget(); if (nt) this.target = nt; }
      if (!this.roam && !this.follow && this.target && dist2(this.pos.x, this.pos.z, this.home.x, this.home.z) > (this.faction === 'ally' ? 45 : 150)) { this.target = null; this.alert = 0; }
    }

    let mx = 0, mz = 0, speed = 0, face = null, goal = null;
    const tg = this.target;
    if (tg) {
      const dx = tg.pos.x - this.pos.x, dz = tg.pos.z - this.pos.z, dist = Math.hypot(dx, dz) || 0.001;
      const reach = (d.reach || 2.3) * (this.scale > 1 ? 1.05 : 1) + (tg.radius || 0.4);
      face = Math.atan2(dx, dz);
      if (this.charge > 0) { // 呂布衝鋒
        this.charge -= dt; mx = this.chargeDir.x; mz = this.chargeDir.z; speed = 21; face = Math.atan2(mx, mz);
        if (!this.chargeHit && dist < 2.8) { this.chargeHit = true; tg.damage(d.dmg * 1.3, this); audio.playAt('hit', dp, 1); if (tg === P) P.shove(mx * 9, mz * 9); }
      } else if (d.ranged) {
        if (this.wind > 0) { /* 拉弓中 */ }
        else if (dist > 30) { goal = tg.pos; speed = d.speed; }
        else if (dist < 7) { mx = -dx / dist; mz = -dz / dist; speed = d.speed * 0.8; }
        else if (this.atkT <= 0) { this.wind = this.windTot = 0.75; }
      } else {
        if (dist > reach * 0.85 && this.wind <= 0) { goal = tg.pos; speed = d.speed * (dist > 12 ? 1.15 : 1); }
        if (dist < reach && this.atkT <= 0 && this.wind <= 0) { this.wind = this.windTot = d.boss ? 0.42 : 0.5; audio.playAt('swing', dp, 0.6); }
      }
      // 攻擊結算
      if (this.wind > 0) {
        this.wind -= dt;
        if (this.wind <= 0) {
          this.atkT = d.cd * (0.85 + rnd(0.3));
          if (d.ranged) {
            V.set(this.pos.x, this.pos.y + 1.5 * this.scale, this.pos.z);
            const ty = tg.pos.y + (tg === P ? P.eyeH * 0.75 : 1.1);
            const sp = 40, t = dist / sp, g = 9;
            const err = 0.045;
            V2.set(dx / t, (ty - V.y) / t + 0.5 * g * t, dz / t);
            V2.x += rnd(-1, 1) * sp * err; V2.z += rnd(-1, 1) * sp * err; V2.y += rnd(-1, 1) * sp * err * 0.5;
            spawnArrow(V, V2, this, d.dmg); audio.playAt('bow', dp, 0.8);
          } else if (dist < reach + 0.9) {
            tg.damage(d.dmg * (0.85 + rnd(0.3)), this);
            audio.playAt(tg === P ? 'hit' : 'clang', dp, 0.9);
          }
        }
      }
      // 特殊技
      if (d.special && this.specialT <= 0) {
        if (d.special === 'lightning' && dist < 50) {
          this.specialT = this.hp < this.maxHp * 0.5 ? 3 : 4.5;
          spawnLightning(tg.pos, this);
          if (this.hp < this.maxHp * 0.5) for (let i = 0; i < 2; i++) spawnLightning(V.set(tg.pos.x + rnd(-7, 7), 0, tg.pos.z + rnd(-7, 7)), this);
        } else if (d.special === 'charge' && dist > 9 && dist < 34) {
          this.specialT = 5.5; this.charge = 0.95; this.chargeHit = false; this.chargeDir = { x: dx / dist, z: dz / dist };
          audio.playAt('neigh', dp, 0.7);
        } else if (d.special === 'summon') {
          const step = this.hp < this.maxHp * 0.3 ? 2 : this.hp < this.maxHp * 0.65 ? 1 : 0;
          if (step > this.summoned) {
            this.summoned = step; G.ui.msg('董卓：「來人！護駕！給我殺了這妖人！」', 'warn'); audio.play('horn', 0.7);
            for (let i = 0; i < 4; i++) { const a = new Actor(pick(['xl_blade', 'xl_spear', 'xl_blade', 'xl_archer']), this.pos.x + rnd(-9, 9), this.pos.z + rnd(-9, 9), { roam: true }); a.alert = 20; a.target = tg; }
          }
          this.specialT = 1;
        }
      }
    } else if (this.follow) {
      const dx = P.pos.x - this.pos.x, dz = P.pos.z - this.pos.z;
      if (dp > 130) { this.pos.set(P.pos.x - 4 + rnd(8), 0, P.pos.z - 4 + rnd(8)); }
      else if (dp > 5 + (this.followSlot || 0)) { goal = P.pos; speed = dp > 11 ? Math.max(d.speed * 1.35, P.mount ? 16 : 8.6) : d.speed * 0.7; }
      else if (dp < 8) face = Math.atan2(dx, dz);
    } else {
      // 無目標：回崗位 / 閒晃
      const hx = this.home.x - this.pos.x, hz = this.home.z - this.pos.z, hd = Math.hypot(hx, hz);
      const still = d.general || d.boss || this.faction === 'ally';
      if (still) {
        if (hd > 1.5) { goal = this.home; speed = d.speed * 0.8; }
        else if (dp < 10) face = Math.atan2(P.pos.x - this.pos.x, P.pos.z - this.pos.z);
        else if (this.homeYaw !== undefined) face = this.homeYaw;
      } else {
        this.wanderT -= dt;
        if (this.wanderT <= 0) { this.wanderT = rnd(3, 9); const a = rnd(PI * 2), r = rnd(2, this.roam ? 18 : 10); this.dest = { x: this.home.x + Math.cos(a) * r, z: this.home.z + Math.sin(a) * r }; }
        if (this.dest) {
          const ex = this.dest.x - this.pos.x, ez = this.dest.z - this.pos.z, ed = Math.hypot(ex, ez);
          if (ed > 1) { goal = this.dest; speed = d.speed * (hd > 30 ? 0.9 : 0.35); } else this.dest = null;
        }
      }
    }

    // ---- 移動 ----
    if (goal) {
      this.wpT -= dt;
      if (this.wpT <= 0 || this.wpGoal !== goal) { this.wpT = 0.25; this.wpGoal = goal; world.route(this.pos.x, this.pos.z, goal.x, goal.z, this.wp); }
      const wx = this.wp[0] - this.pos.x, wz = this.wp[1] - this.pos.z, wl = Math.hypot(wx, wz) || 1;
      mx = wx / wl; mz = wz / wl;
      if (this.wp[0] !== goal.x || this.wp[1] !== goal.z) face = Math.atan2(mx, mz);
    }
    if (speed > 0) {
      const wy = heightAt(this.pos.x, this.pos.z);
      if (wy < WATER - 0.2) speed *= 0.55;
      // 被柵欄或城牆卡住時，沿著障礙側移尋路
      if (this.sideT > 0) { this.sideT -= dt; const sx = -mz * this.sideDir, sz = mx * this.sideDir; mx = mx * 0.2 + sx; mz = mz * 0.2 + sz; const l = Math.hypot(mx, mz); mx /= l; mz /= l; }
      const ox = this.pos.x, oz = this.pos.z;
      this.pos.x += mx * speed * dt; this.pos.z += mz * speed * dt;
      if (face === null || !tg) face = Math.atan2(mx, mz);
      world.resolve(this.pos, this.radius);
      if (Math.hypot(this.pos.x - ox, this.pos.z - oz) < speed * dt * 0.35) {
        this.stuckT += dt;
        if (this.stuckT > 0.45) { this.stuckT = 0; this.sideDir = this.sideT > 0 ? -this.sideDir : (this.sideDir || (Math.random() < 0.5 ? 1 : -1)); this.sideT = 2.2; }
      } else this.stuckT = Math.max(0, this.stuckT - dt);
    }
    if (this.follow && !tg && dp > 24) { this.farT += dt; if (this.farT > 9) { this.farT = 0; this.pos.set(P.pos.x - Math.sin(P.yaw + PI) * -4 + rnd(-2, 2), 0, P.pos.z - Math.cos(P.yaw + PI) * -4 + rnd(-2, 2)); } } else this.farT = 0;
    this.curSpeed = lerp(this.curSpeed, speed, Math.min(1, dt * 8));
    this.pos.y = Math.max(heightAt(this.pos.x, this.pos.z), WATER - 1.1);
    if (face !== null) this.yaw = turnTo(this.yaw, face, dt * 7);
    m.root.position.copy(this.pos); m.root.rotation.y = this.yaw;

    // ---- 動畫 ----
    this.walkPh += this.curSpeed * dt * 2.1;
    const sw = Math.sin(this.walkPh) * clamp(this.curSpeed / 4.5, 0, 1) * 0.75;
    if (this.horse) {
      const l = this.horse.legs; l[0].rotation.x = sw; l[3].rotation.x = sw; l[1].rotation.x = -sw; l[2].rotation.x = -sw;
      m.inner.position.y = this.seat + Math.abs(Math.sin(this.walkPh)) * 0.05 * clamp(this.curSpeed / 4, 0, 1);
    } else { m.legL.rotation.x = sw; m.legR.rotation.x = -sw; m.body.position.y = Math.abs(sw) * 0.04; }
    if (!d.weapon2) m.armL.rotation.x = -sw * 0.7;
    let ar = -0.35 + sw * 0.25;
    if (this.wind > 0) {
      const p = 1 - this.wind / this.windTot;
      ar = d.ranged ? -1.5 : (p < 0.6 ? lerp(-0.35, -2.8, p / 0.6) : lerp(-2.8, -0.2, (p - 0.6) / 0.4));
    }
    m.armR.rotation.x = lerp(m.armR.rotation.x, ar, Math.min(1, dt * 22));
    if (d.weapon2) m.armL.rotation.x = lerp(m.armL.rotation.x, this.wind > 0 ? -1.6 : -0.35 - sw * 0.25, Math.min(1, dt * 16));
  }
}

// =====================================================================
//  動物：馬 / 鹿 / 狼
// =====================================================================
const HORSE_COLORS = [0x6a4428, 0x3a2a1c, 0x8a6a48, 0xc8c0b0, 0x2a2420];
export class Animal {
  constructor(kind, x, z, o = {}) {
    this.kind = kind; this.pos = new THREE.Vector3(x, heightAt(x, z), z); this.home = { x, z };
    this.yaw = rnd(PI * 2); this.alive = true; this.speed = 0; this.ph = rnd(6); this.t = rnd(3); this.dir = null;
    this.tamed = !!o.tamed; this.name = o.name || (kind === 'horse' ? '戰馬' : kind === 'deer' ? '野鹿' : '野狼');
    this.maxSpeed = o.maxSpeed || 15; this.state = 'idle'; this.biteT = 0; this.fleeT = 0;
    let cfg;
    if (kind === 'horse') { cfg = { kind, color: o.color ?? pick(HORSE_COLORS), dark: 0x15110e, saddle: this.tamed, blanket: o.blanket, scale: o.scale || 1 }; this.hp = 9999; }
    else if (kind === 'deer') { cfg = { kind, color: 0xa87a48, dark: 0x4a3420, scale: 0.7 }; this.hp = 45; }
    else { cfg = { kind, color: 0x6a6a70, dark: 0x3a3a40, scale: 0.55 }; this.hp = 55; }
    this.scale = cfg.scale; this.cfg = cfg;
    this.m = quadruped(cfg); this.m.root.position.copy(this.pos);
    if (o.label) { const l = makeLabel(o.label, '#ffd24a'); l.position.y = 2.9; this.m.root.add(l); }
    G.scene.add(this.m.root); G.animals.push(this);
  }
  get radius() { return 0.8 * this.scale; }
  // 馴服後加上馬鞍
  tame() {
    if (this.tamed) return; this.tamed = true;
    const old = this.m.root; G.scene.remove(old);
    this.cfg.saddle = true; this.m = quadruped(this.cfg); G.scene.add(this.m.root);
  }
  rayHit(o, d) {
    if (!this.alive || this.kind === 'horse') return null;
    const s = this.scale, t = raySphere(o.x, o.y, o.z, d.x, d.y, d.z, this.pos.x, this.pos.y + 1.25 * s, this.pos.z, 0.95 * s);
    return t >= 0 ? { t, head: false } : null;
  }
  damage(n, src) {
    if (!this.alive || this.kind === 'horse') return;
    this.hp -= n; this.fleeT = 6;
    if (this.hp <= 0) {
      this.alive = false; this.deathT = 0;
      dropItem(this.pos, 'meat', this.kind === 'deer' ? rndInt(2, 3) : 1);
    }
  }
  update(dt) {
    const m = this.m, P = G.player;
    if (!this.alive) {
      this.deathT += dt; m.root.rotation.z = Math.min(1, this.deathT * 3) * PI / 2;
      if (this.deathT > 8) { G.scene.remove(m.root); this.gone = true; }
      return;
    }
    const dp = d2(this.pos, P.pos);
    if (dp > 240 && this.state !== 'come') { m.root.visible = false; if (this.kind === 'wolf' && !world.isNight) { G.scene.remove(m.root); this.gone = true; } return; }
    m.root.visible = true;
    let mx = 0, mz = 0, sp = 0;
    if (this.rider) { sp = this.speed; }
    else if (this.kind === 'horse') {
      if (this.state === 'come') {
        if (dp < 4.5) this.state = 'idle';
        else { mx = (P.pos.x - this.pos.x) / dp; mz = (P.pos.z - this.pos.z) / dp; sp = 14; if (dp > 200) this.pos.set(P.pos.x + 30, 0, P.pos.z + 30); }
      } else if (!this.tamed) this.wander(dt, 2.2, 22);
      if (this.dir) { mx = this.dir.x; mz = this.dir.z; sp = this.dir.s; }
    } else if (this.kind === 'deer') {
      if (dp < (P.sprinting || P.mount ? 26 : 15)) this.fleeT = 4;
      if (this.fleeT > 0) { this.fleeT -= dt; mx = (this.pos.x - P.pos.x) / dp; mz = (this.pos.z - P.pos.z) / dp; sp = 10.5; this.home.x = this.pos.x; this.home.z = this.pos.z; }
      else { this.wander(dt, 1.6, 30); if (this.dir) { mx = this.dir.x; mz = this.dir.z; sp = this.dir.s; } }
    } else { // 狼
      this.biteT -= dt;
      if (!world.isNight && dp > 60) { mx = (this.pos.x - P.pos.x) / dp; mz = (this.pos.z - P.pos.z) / dp; sp = 8; }
      else if (P.alive && dp < 45) {
        if (dp > 1.7) { mx = (P.pos.x - this.pos.x) / dp; mz = (P.pos.z - this.pos.z) / dp; sp = 8.8; }
        if (dp < 2.1 && this.biteT <= 0) { this.biteT = 1.2; P.damage(9, this); audio.play('hit', 0.6); }
      } else { this.wander(dt, 2.5, 30); if (this.dir) { mx = this.dir.x; mz = this.dir.z; sp = this.dir.s; } }
    }
    if (!this.rider) {
      if (sp > 0) {
        if (heightAt(this.pos.x, this.pos.z) < WATER - 0.3) sp *= 0.55;
        this.pos.x += mx * sp * dt; this.pos.z += mz * sp * dt;
        this.yaw = turnTo(this.yaw, Math.atan2(mx, mz), dt * 6);
        world.resolve(this.pos, this.radius);
      }
      this.speed = lerp(this.speed, sp, Math.min(1, dt * 6));
      this.pos.y = Math.max(heightAt(this.pos.x, this.pos.z), WATER - 1.2);
    }
    m.root.position.copy(this.pos); m.root.rotation.y = this.yaw;
    this.ph += this.speed * dt * (this.kind === 'horse' ? 1.3 : 2.2);
    const sw = Math.sin(this.ph) * clamp(this.speed / 5, 0, 1) * 0.7, l = m.legs;
    l[0].rotation.x = sw; l[3].rotation.x = sw; l[1].rotation.x = -sw; l[2].rotation.x = -sw;
    m.body.position.y = Math.abs(Math.sin(this.ph)) * 0.06 * clamp(this.speed / 8, 0, 1);
  }
  wander(dt, speed, range) {
    this.t -= dt;
    if (this.t <= 0) {
      this.t = rnd(3, 9);
      if (Math.random() < 0.45) this.dir = null;
      else {
        let a = rnd(PI * 2);
        if (dist2(this.pos.x, this.pos.z, this.home.x, this.home.z) > range) a = Math.atan2(this.home.z - this.pos.z, this.home.x - this.pos.x);
        this.dir = { x: Math.cos(a), z: Math.sin(a), s: speed };
      }
    }
  }
}

// =====================================================================
//  投射物
// =====================================================================
const arrowGeo = new THREE.BoxGeometry(0.035, 0.035, 0.95), arrowMat = new THREE.MeshBasicMaterial({ color: 0x4a3a20 });
const grenGeo = new THREE.IcosahedronGeometry(0.11, 0), grenMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
export function spawnArrow(pos, vel, owner, dmg) {
  const mesh = new THREE.Mesh(arrowGeo, arrowMat); mesh.position.copy(pos); G.scene.add(mesh);
  G.projectiles.push({ type: 'arrow', pos: pos.clone(), vel: vel.clone(), owner, dmg, life: 5, mesh });
}
export function spawnGrenade(pos, vel) {
  const mesh = new THREE.Mesh(grenGeo, grenMat); mesh.position.copy(pos); G.scene.add(mesh);
  G.projectiles.push({ type: 'grenade', pos: pos.clone(), vel: vel.clone(), life: 2.3, mesh });
}
function hitsBody(p, t, r, top) { return Math.hypot(p.x - t.pos.x, p.z - t.pos.z) < r && p.y > t.pos.y - 0.1 && p.y < t.pos.y + top; }
export function updateProjectiles(dt) {
  const P = G.player;
  for (const p of G.projectiles) {
    p.life -= dt;
    if (p.type === 'arrow') {
      p.vel.y -= 9 * dt;
      const sp = p.vel.length(), step = sp * dt;
      V.copy(p.vel).multiplyScalar(1 / sp);
      let dead = p.life <= 0 || world.rayBlock(p.pos, V, step + 0.6) < step + 0.6;
      p.pos.addScaledVector(p.vel, dt);
      const fromPlayer = p.owner === P, enemyShot = !fromPlayer && p.owner.faction === 'enemy';
      if (!dead) {
        if (enemyShot && P.alive && hitsBody(p.pos, P, P.mount ? 0.9 : 0.5, P.eyeH + 0.2)) { P.damage(p.dmg, p.owner); dead = true; }
        if (!dead) for (const a of G.actors) {
          if (!a.alive || a === p.owner || (a.faction === 'enemy') === enemyShot || a.def.noncombat) continue;
          if (hitsBody(p.pos, a, a.radius + 0.25, 1.95 * a.scale + a.seat)) {
            const head = p.pos.y > a.pos.y + a.seat + 1.48 * a.scale;
            a.damage(p.dmg * (head ? 2 : 1), p.owner); dead = true;
            if (fromPlayer) G.ui.hitmarker(head); fxBurst(p.pos, 0x8a0a0a, 6, 2.5, 0.4);
            break;
          }
        }
        if (!dead && fromPlayer) for (const a of G.animals) if (a.alive && a.kind !== 'horse' && hitsBody(p.pos, a, 1.0 * a.scale + 0.2, 2 * a.scale)) { a.damage(p.dmg, P); G.ui.hitmarker(); dead = true; break; }
      }
      p.mesh.position.copy(p.pos); p.mesh.lookAt(V.copy(p.pos).add(p.vel));
      if (dead) p.gone = true;
    } else {
      p.vel.y -= 18 * dt; p.pos.addScaledVector(p.vel, dt);
      const gy = heightAt(p.pos.x, p.pos.z) + 0.1;
      if (p.pos.y < gy) { p.pos.y = gy; p.vel.y *= -0.35; p.vel.x *= 0.55; p.vel.z *= 0.55; }
      const bx = p.pos.x, bz = p.pos.z; world.resolve(p.pos, 0.15);
      if (bx !== p.pos.x || bz !== p.pos.z) { p.vel.x *= -0.3; p.vel.z *= -0.3; }
      p.mesh.position.copy(p.pos); p.mesh.rotation.x += dt * 9;
      if (p.life <= 0) { p.gone = true; explode(p.pos, 8.5, 230, true); }
    }
    if (p.gone) G.scene.remove(p.mesh);
  }
  G.projectiles = G.projectiles.filter(p => !p.gone);
}

export function explode(pos, radius, dmg, byPlayer) {
  const P = G.player, dp = pos.distanceTo(P.pos);
  for (const a of G.actors) {
    if (!a.alive || (byPlayer && a.faction === 'ally')) continue;
    const d = a.pos.distanceTo(pos); if (d < radius) a.damage(dmg * Math.pow(1 - d / radius, 0.6), byPlayer ? P : null);
  }
  for (const a of G.animals) if (a.alive) { const d = a.pos.distanceTo(pos); if (d < radius) a.damage(dmg * (1 - d / radius), P); }
  if (dp < radius) P.damage(dmg * 0.35 * (1 - dp / radius), null);
  alertEnemies(pos, 100);
  audio.playAt('explosion', dp * 0.5, 1.2);
  fxFireball(pos, radius * 0.55); fxFlash(pos, 0xffa040, 900, 0.35);
  fxBurst(pos, 0xffb040, 40, 12, 0.9, 0.3); fxBurst(pos, 0x3a3028, 30, 7, 1.3, 0.35);
  if (dp < 30) P.shake = Math.max(P.shake, 0.5 * (1 - dp / 30));
}
export function alertEnemies(pos, range) {
  for (const a of G.actors) if (a.alive && a.faction === 'enemy' && d2(a.pos, pos) < range) a.alert = Math.max(a.alert, 8);
  for (const a of G.animals) if (a.alive && a.kind === 'deer' && d2(a.pos, pos) < range * 0.7) a.fleeT = 6;
}

// 張角妖術：落雷
const ringGeo = new THREE.RingGeometry(2.9, 3.5, 24).rotateX(-PI / 2);
const boltGeo = new THREE.CylinderGeometry(0.25, 0.5, 60, 5).translate(0, 30, 0);
export function spawnLightning(at, owner) {
  const x = at.x, z = at.z, y = heightAt(x, z) + 0.15;
  const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffe040, transparent: true, opacity: 0.2, fog: false, depthWrite: false }));
  ring.position.set(x, y, z); G.scene.add(ring);
  let t = 0, bolt = null;
  G.effects.push({
    update(dt) {
      t += dt;
      if (t < 1.15) { ring.material.opacity = 0.25 + 0.6 * (t / 1.15); ring.scale.setScalar(1.25 - 0.25 * t / 1.15); return true; }
      if (!bolt) {
        bolt = new THREE.Mesh(boltGeo, new THREE.MeshBasicMaterial({ color: 0xfff8c0, fog: false })); bolt.position.set(x, y, z); G.scene.add(bolt);
        const P = G.player; V.set(x, y, z);
        audio.playAt('thunder', d2(V, P.pos) * 0.4, 1); fxFlash(V, 0xfff0a0, 1500, 0.3); fxBurst(V, 0xffe060, 20, 8, 0.5, 0.25);
        if (P.alive && d2(V, P.pos) < 3.6 && Math.abs(P.pos.y - y) < 4) P.damage(32, owner);
        for (const a of G.actors) if (a.alive && a.faction === 'ally' && d2(a.pos, V) < 3.6) a.damage(60, owner);
      }
      if (t > 1.4) { G.scene.remove(ring); G.scene.remove(bolt); ring.material.dispose(); return false; }
      return true;
    }
  });
}

// =====================================================================
//  特效
// =====================================================================
export function fxTracer(a, b, color = 0xffe8a0) {
  const g = new THREE.BufferGeometry().setFromPoints([a, b]);
  const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.7, fog: false }));
  G.scene.add(l); let t = 0.06;
  G.effects.push({ update(dt) { t -= dt; if (t <= 0) { G.scene.remove(l); g.dispose(); l.material.dispose(); return false; } return true; } });
}
export function fxBurst(pos, color, n, speed, life, size = 0.14) {
  const p = new Float32Array(n * 3), v = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    p[i * 3] = pos.x; p[i * 3 + 1] = pos.y; p[i * 3 + 2] = pos.z;
    const a = rnd(PI * 2), e = rnd(-0.3, 1.4), s = speed * rnd(0.3, 1);
    v[i * 3] = Math.cos(a) * Math.cos(e) * s; v[i * 3 + 1] = Math.sin(e) * s; v[i * 3 + 2] = Math.sin(a) * Math.cos(e) * s;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const mat = new THREE.PointsMaterial({ color, size, transparent: true, depthWrite: false });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false; G.scene.add(pts);
  let t = 0;
  G.effects.push({
    update(dt) {
      t += dt; if (t > life) { G.scene.remove(pts); g.dispose(); mat.dispose(); return false; }
      for (let i = 0; i < n; i++) { v[i * 3 + 1] -= 12 * dt; p[i * 3] += v[i * 3] * dt; p[i * 3 + 1] += v[i * 3 + 1] * dt; p[i * 3 + 2] += v[i * 3 + 2] * dt; }
      g.attributes.position.needsUpdate = true; mat.opacity = 1 - t / life; return true;
    }
  });
}
// 閃光用固定的光源池：光源數量不變，戰鬥中就不會觸發著色器重新編譯而卡頓
const flashPool = [];
export function initFx(scene) {
  for (let i = 0; i < (G.touch ? 1 : 2); i++) { const l = new THREE.PointLight(0xffffff, 0, 60, 1.6); l.userData.busy = false; scene.add(l); flashPool.push(l); }
}
export function fxFlash(pos, color, intensity, life) {
  const l = flashPool.find(x => !x.userData.busy); if (!l) return;
  l.userData.busy = true; l.color.set(color); l.position.copy(pos); l.position.y += 1.5;
  let t = 0;
  G.effects.push({ update(dt) { t += dt; l.intensity = intensity * Math.max(0, 1 - t / life); if (t > life) { l.intensity = 0; l.userData.busy = false; return false; } return true; } });
}
const fbGeo = new THREE.IcosahedronGeometry(1, 2);
export function fxFireball(pos, r) {
  const mat = new THREE.MeshBasicMaterial({ color: 0xffb040, transparent: true, opacity: 0.95, fog: false, depthWrite: false });
  const m = new THREE.Mesh(fbGeo, mat); m.position.copy(pos); G.scene.add(m); let t = 0;
  G.effects.push({ update(dt) { t += dt; const k = t / 0.45; m.scale.setScalar(r * (0.3 + k * 0.9)); mat.opacity = 0.95 * (1 - k); mat.color.setHex(k < 0.4 ? 0xffe090 : 0xff6a20); if (k >= 1) { G.scene.remove(m); mat.dispose(); return false; } return true; } });
}

// =====================================================================
//  掉落物
// =====================================================================
const iconTex = {};
function iconTexture(ch) {
  if (iconTex[ch]) return iconTex[ch];
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  g.beginPath(); g.arc(32, 32, 30, 0, PI * 2); g.fillStyle = 'rgba(20,16,10,.75)'; g.fill(); g.strokeStyle = '#d4af37'; g.lineWidth = 3; g.stroke();
  g.font = '36px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, 32, 35);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return iconTex[ch] = t;
}
export function dropItem(pos, item, n) {
  const isW = item.startsWith('w:'), def = isW ? WEAPONS[item.slice(2)] : ITEMS[item];
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: iconTexture(def.i), transparent: true, depthWrite: false }));
  s.scale.setScalar(0.6);
  const x = pos.x + rnd(-1.1, 1.1), z = pos.z + rnd(-1.1, 1.1);
  s.position.set(x, heightAt(x, z) + 0.6, z); G.scene.add(s);
  G.pickups.push({ item, n, mesh: s, y: s.position.y, life: 240, ph: rnd(6) });
}
export function updatePickups(dt) {
  const P = G.player;
  for (const p of G.pickups) {
    p.life -= dt; p.mesh.position.y = p.y + Math.sin(G.now * 3 + p.ph) * 0.12;
    const d = Math.hypot(p.mesh.position.x - P.pos.x, p.mesh.position.z - P.pos.z);
    if (P.alive && d < 2.3 && Math.abs(p.y - P.pos.y) < 3.5) {
      if (p.item.startsWith('w:')) P.giveWeapon(p.item.slice(2)); else P.give(p.item, p.n, true);
      audio.play(p.item === 'coin' ? 'coin' : 'pickup'); p.gone = true;
    }
    if (p.life <= 0) p.gone = true;
    if (p.gone) { G.scene.remove(p.mesh); p.mesh.material.dispose(); }
  }
  G.pickups = G.pickups.filter(p => !p.gone);
}
export function updateEffects(dt) { G.effects = G.effects.filter(e => e.update(dt)); }
