import * as THREE from 'three';
import { G } from './state.js';
import { ACTORS, ITEMS, WEAPONS, ATTENDANTS } from './data.js';
import { humanoid, quadruped } from './models.js';
import { world, heightAt, WATER } from './world.js';
import { audio } from './audio.js';
import { clamp, lerp, rnd, rndInt, pick, dist2, angDiff, turnTo, raySphere, makeLabel } from './util.js';
import { damageTargets } from './world.js';
import { raining } from './weather.js';
import { bark, idleChatter, say } from './barks.js';
import { diff } from './difficulty.js';
import { makeTorch, addEmitter, nightK } from './lights.js';
const TV = new THREE.Vector3();
// 友軍攻擊加成（劉備的「仁德激勵」）
const allyBuff = a => a.faction === 'ally' && G.now < (G.allyBuffT || 0) ? 1.35 : 1;

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
    const m = this.m = humanoid(o.look || d.look, d.weapon, d.weapon2, this.scale);
    this.seat = 0;
    if (d.mounted) {
      this.horse = quadruped({ kind: 'horse', color: d.horseColor || 0x4a3020, dark: 0x111111, saddle: true, blanket: 0x26262c });
      m.root.add(this.horse.root); this.seat = 0.86; m.inner.position.y = this.seat;
      m.legL.rotation.set(-1.0, 0, -0.5); m.legR.rotation.set(-1.0, 0, 0.5);
    }
    if (d.general || d.boss || o.recruited || d.talk) {
      const l = makeLabel(o.recruited ? d.short : d.name, d.boss ? '#ff6a5a' : o.recruited ? '#bfe4ff' : d.talk ? '#d0a0ff' : '#9af0a0');
      if (o.recruited) { l.material.sizeAttenuation = false; l.scale.set(0.26, 0.065, 1); } // 固定螢幕大小，靠近時不會變巨大
      l.position.y = 2.2 * this.scale + this.seat + 0.25; m.root.add(l);
    }
    this.recruited = !!o.recruited;
    if (o.recruited) this.follow = true;
    if (d.arenaR) this.arena = makeArena(x, z, d.arenaR);
    m.root.position.copy(this.pos); m.root.rotation.y = this.yaw;
    G.scene.add(m.root); G.actors.push(this);
    this.alive = true; this.target = null; this.follow = this.follow || false;
    this.atkT = rnd(1); this.wind = 0; this.windTot = 0.5; this.walkPh = rnd(6); this.curSpeed = 0;
    this.alert = 0; this.wanderT = rnd(1, 5); this.dest = null; this.retT = rnd(0.5);
    this.specialT = 3 + rnd(2); this.charge = 0; this.summoned = 0; this.deathT = 0;
    this.stuckT = 0; this.sideT = 0; this.sideDir = 0; this.farT = 0; this.wp = [0, 0]; this.wpT = 0; this.wpGoal = null;
    // 動作與台詞
    this.emo = null; this.emoT = rnd(2, 8); this.flinch = 0; this.cheer = 0; this.ph0 = rnd(6); this.barkT = rnd(5, 16); this.fightT = rnd(4, 8);
    this.circDir = Math.random() < 0.5 ? 1 : -1; this.circT = rnd(1, 3); this.lowSaid = false; this.lookAt = null;
  }
  get radius() { return (this.horse ? 0.9 : 0.42) * this.scale; }
  // 播放一個動作（閒置小動作、抱拳、吶喊、歡呼…）
  emote(k, dur) {
    const D = { look: 3.2, stretch: 2.2, scratch: 2, yawn: 2.4, beard: 3, flourish: 1.8, sharpen: 4, sit: rnd(9, 16), salute: 1.6, chat: 2.6, warcry: 0.8, cheer: 1.4, torch: 1.3 };
    this.emo = { k, t: 0, dur: dur || D[k] || 2 };
  }
  idleEmote() {
    const d = this.def, night = world.isNight, look = d.look || {};
    let pool;
    if (d.boss) pool = ['look', 'flourish', 'look'];
    else if (d.general) pool = ['look', 'flourish', 'stretch', ...(look.beard ? ['beard', 'beard'] : [])];
    else if (d.talk) pool = ['look', 'stretch', 'scratch'];
    else {
      pool = ['look', 'look', 'stretch', 'scratch', 'sharpen'];
      if (night) pool.push('yawn', 'yawn');
      if (!this.horse && (!this.follow || G.squadCmd === 'hold') && this.homeYaw === undefined) pool.push('sit', night ? 'sit' : 'look');
    }
    if (this.horse) pool = pool.filter(k => k !== 'sit');
    this.emote(pick(pool));
  }
  // ---- 火把：小兵天黑後點起火把，天亮熄掉（各自隔幾秒，不會整齊劃一） ----
  get canTorch() { const d = this.def; return !d.general && !d.boss && !d.ranged && !d.gun && !d.weapon2 && !d.noncombat && !d.talk; }
  updateTorch(dt) {
    const want = nightK() > 0.55 && this.alive;
    if (want !== !!this.torchLit) {
      if (this.torchT == null) this.torchT = this.torch ? rnd(0.5, 6) : rnd(0.2, 4);
      if ((this.torchT -= dt) <= 0) { this.torchT = null; this.setTorch(want); }
    } else this.torchT = null;
    if (this.torchLit && this.m.root.visible) {
      const u = this.torch.userData, t = G.now;
      u.flame.scale.set(1 + 0.15 * Math.sin(t * 17 + this.ph0), 1 + 0.3 * Math.sin(t * 13 + this.ph0 * 2), 1);
      u.glow.material.opacity = (0.35 + 0.45 * nightK()) * (0.9 + 0.1 * Math.sin(t * 9 + this.ph0));
    }
  }
  setTorch(on) {
    if (on && !this.torch) {
      const tr = this.torch = makeTorch(); tr.position.set(0, -0.62, 0.05); tr.rotation.x = 0.8; this.m.armL.add(tr); // 手臂舉到 -0.8 時火把正好朝上
      this.torchEm = addEmitter({ base: 30, range: 15, color: 0xff9a40, ph: this.ph0, pos: () => { tr.getWorldPosition(TV); TV.y += 0.75; return TV; }, on: () => this.torchLit && this.alive && this.m.root.visible, gone: () => !this.alive || !!this.gone });
    }
    if (!this.torch) return;
    this.torchLit = on; this.torch.visible = on;
    if (!this.m.root.visible) return;
    const hp = V.set(this.pos.x, this.pos.y + 1.8 * this.scale + this.seat, this.pos.z);
    if (on) { fxBurst(hp, 0xffb040, 6, 1.5, 0.4, 0.08); if (!this.target && this.curSpeed < 0.5 && !this.emo) this.emote('torch'); }
    else fxBurst(hp, 0x6a6a6a, 6, 1, 0.8, 0.18);
  }

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

  // 決戰圈：玩家在圈內，敵將的護體才會破
  inArena(o) { return this.arena && o && o.alive !== false && d2(o.pos, this.home) < this.arena.R; }
  damage(n, src) {
    if (!this.alive || this.def.noncombat) return false;
    if (this.faction === 'ally' && src === G.player) return false;
    if (this.arena && !this.inArena(G.player)) {
      if (G.now - (this.sparkT || -9) > 0.12) { this.sparkT = G.now; V.set(this.pos.x, this.pos.y + 1.3 * this.scale, this.pos.z); fxBurst(V, 0xffd860, 10, 4, 0.35, 0.16); audio.playAt('clang', d2(this.pos, G.player.pos), 0.6); }
      if (G.now - (this.immT || -9) > 3) { this.immT = G.now; G.ui.msg(`⛨ ${this.name} 護體未破——踏入地上的決戰圈才能傷到他！`, 'warn'); }
      return false;
    }
    if (this.def.boss && src instanceof Actor) n *= 0.4;
    if (src === G.player) n *= diff().dmgOut; // 難度：玩家造成的傷害
    this.hp -= n; this.alert = 12;
    if (this.hp > 0) {
      this.flinch = 0.28; if (this.emo && this.emo.k !== 'warcry') this.emo = null;
      if (!this.lowSaid && this.hp < this.maxHp * (this.def.boss ? 0.25 : 0.3)) { this.lowSaid = true; bark(this, 'low', this.def.boss || this.def.general ? 1 : 0.6); }
      else bark(this, 'hurt', this.def.boss ? 0.25 : 0.3);
    }
    if (src && src !== this && src.alive !== false && (!this.target || src === G.player || Math.random() < 0.3)) {
      if (!(src.faction && src.faction === this.faction)) this.target = src;
    }
    // 呼叫附近同伴
    if (this.faction === 'enemy') for (const a of G.actors) if (a.alive && a.faction === 'enemy' && a !== this && d2(a.pos, this.pos) < 30) { a.alert = Math.max(a.alert, 10); if (!a.target && src) a.target = src; }
    if (this.def.flee && this.hp <= this.maxHp * this.def.flee) { this.die(src, true); return true; } // 曹操：重傷即敗走
    if (this.hp <= 0) this.die(src);
    return true;
  }
  // 被震懾（暈眩搖晃）或施展絕技（姿勢由 skills.js 指定）時的更新
  special(dt) {
    const m = this.m, t = G.now, k = Math.min(1, dt * 14);
    let aLx = 0.15, aRx = 0.15, aLz = 0, aRz = 0, iRx = 0, iRy = 0, iZ = 0;
    if (this.stunT > 0 && !this.skillBusy) {
      this.stunT -= dt; this.wind = 0; this.charge = 0; this.curSpeed = 0;
      iRx = 0.28 + Math.sin(t * 9 + this.ph0) * 0.07; iRy = Math.sin(t * 5 + this.ph0) * 0.3; aLx = aRx = 0.25;
      if ((this.starT = (this.starT || 0) - dt) <= 0) { this.starT = 0.35; V.set(this.pos.x + rnd(-0.3, 0.3), this.pos.y + 2.05 * this.scale + this.seat, this.pos.z + rnd(-0.3, 0.3)); fxBurst(V, 0xffe680, 3, 1.2, 0.4, 0.1); }
      this.pos.y = Math.max(heightAt(this.pos.x, this.pos.z), WATER - 1.1);
    } else {
      switch (this.skillPose) {
        case 'raise': aRx = -2.9; iRx = -0.1; aLx = -0.5; break;
        case 'sweep': aRx = -1.5; aRz = -0.9; aLx = -1.2; aLz = 0.6; iRx = 0.2; break;
        case 'roar': aRx = -0.9; aRz = -1.1; aLx = -0.9; aLz = 1.1; iRx = -0.22; break;
        case 'thrust': aRx = -1.55; aLx = -1.3; aLz = 0.4; iRx = 0.25; iZ = 0.2; break;
        case 'slam': aRx = -0.3; aLx = -0.3; iRx = 0.4; break;
      }
      this.wind = 0; this.curSpeed = 0;
      this.pos.y = Math.max(heightAt(this.pos.x, this.pos.z), WATER - 1.1) + (this.skillY || 0);
    }
    m.armR.rotation.x = lerp(m.armR.rotation.x, aRx, k); m.armR.rotation.z = lerp(m.armR.rotation.z, aRz, k);
    m.armL.rotation.x = lerp(m.armL.rotation.x, aLx, k); m.armL.rotation.z = lerp(m.armL.rotation.z, aLz, k);
    m.inner.rotation.x = lerp(m.inner.rotation.x, iRx, k); m.inner.rotation.y = lerp(m.inner.rotation.y, iRy, k); m.inner.position.z = lerp(m.inner.position.z, iZ, k);
    if (!this.horse) { m.legL.rotation.x = lerp(m.legL.rotation.x, 0, k); m.legR.rotation.x = lerp(m.legR.rotation.x, 0, k); m.inner.position.y = lerp(m.inner.position.y, 0, k); }
    m.root.position.copy(this.pos); m.root.rotation.y = this.yaw;
    if (this.arena) this.arena.mat.opacity = 0.75 + 0.25 * Math.sin(G.now * 3);
  }
  // 是否正在與玩家單挑
  get dueling() { return G.battle && G.battle.mode === 'duel' && G.battle.boss === this; }

  die(src, fled = false) {
    const d = this.def, duel = this.dueling;
    if (d.general && this.faction === 'ally') { // 名將不死，負傷回營
      this.hp = this.maxHp * 0.5; this.follow = false; this.target = null;
      this.pos.set(this.home.x, heightAt(this.home.x, this.home.z), this.home.z);
      G.ui.msg(`${d.name} 負傷，退回營中休養。`, 'warn');
      return;
    }
    this.alive = false; this.target = null; this.emo = null;
    if (this.torch) { this.torchLit = false; this.torch.visible = false; }
    this.m.inner.rotation.set(0, 0, 0); this.m.inner.position.set(0, this.seat, 0); // 倒地前恢復站姿
    if (!fled) bark(this, 'die', d.boss ? 0 : 0.35);
    if (src instanceof Actor && src.alive) { src.cheer = 1.3; bark(src, 'kill', 0.5); }
    else if (src === G.player && this.faction === 'enemy') { // 隊友替你喝采
      const f = G.actors.find(a => a.alive && a.follow && !a.target && d2(a.pos, G.player.pos) < 16);
      if (f) bark(f, 'cheer', 0.2);
    }
    if (this.arena) { G.scene.remove(this.arena.mesh); this.arena = null; }
    if (this.recruited) { this.follow = false; G.ui.msg(`${d.name} 陣亡了。（可再向主公招募）`, 'warn'); }
    if (this.faction === 'enemy') {
      const dr = d.drop;
      if (dr) {
        if (dr.coin) dropItem(this.pos, 'coin', rndInt(dr.coin[0], dr.coin[1]) * (duel ? 2 : 1)); // 單挑勝利賞金加倍
        for (const [it, ch, n] of dr.items || []) if (Math.random() < ch) dropItem(this.pos, it, n || 1);
        if (dr.weapon && Math.random() < dr.weapon[1] && !G.player.owned[dr.weapon[0]]) dropItem(this.pos, 'w:' + dr.weapon[0], 1);
      }
      // 武將專屬兵器：單挑必得，群戰 25%
      if (d.excl) {
        const isW = d.excl.startsWith('w:'), owned = isW ? G.player.owned[d.excl.slice(2)] : G.player.count(d.excl) > 0;
        if (!owned && (duel || Math.random() < 0.25)) dropItem(this.pos, d.excl, 1);
        else if (!owned && !duel) G.ui.msg(`（${d.name}的專屬兵器沒有落下——單挑擊敗必定能奪得。）`, 'info');
      }
      if (duel) G.ui.msg(`⚔ 單挑勝利！你一對一擊敗了${d.name}，賞金加倍！`, 'quest');
      if (d.boss) G.killed[this.id] = true;
      if (fled) {
        G.ui.msg(`${d.name}：「……撤！快撤！」曹操在親兵掩護下敗走了！`, 'quest');
        V.set(this.pos.x, this.pos.y + 1, this.pos.z); fxBurst(V, 0x8a7a5a, 30, 6, 1.2, 0.35);
        G.scene.remove(this.m.root); this.gone = true;
      }
      if (G.onKill) G.onKill(this, src);
    }
  }

  findTarget() {
    const P = G.player; let best = null, bd = 1e9;
    if (this.faction === 'enemy') {
      const see = this.alert > 0 ? 110 : (world.isNight && !P.flash ? 28 : 40) * (this.def.boss ? 1.3 : 1) * (1 - (G.fogF || 0) * 0.4 - (G.weatherF > 0.6 ? 0.15 : 0)); // 霧和雨會縮短敵人視野
      const B = G.battle && G.battle.mode === 'duel' ? G.battle.boss : null;
      if (B && this !== B && B.arena && d2(this.pos, B.home) < B.arena.R + 15) return null; // 單挑時，敵方士卒在旁觀戰
      if (B === this) return P.alive && this.inArena(P) ? P : null;                          // 單挑時，敵將只對付玩家
      const ok = o => !this.arena || this.inArena(o); // 敵將只追擊決戰圈內的對手
      if (this.siegeOnly) return null; // 守營戰的破旗手：只管砍軍旗
      // 守營戰的敵軍只對付擋在面前（13 步內）的守軍，其餘直撲軍旗
      const allyR = this.siege ? 13 : Math.max(see, 32), plyR = this.siege ? 13 : see;
      // 優先攻擊視野內最近的我方兵卒或武將；附近沒有隊友才攻擊玩家
      for (const a of G.actors) if (a.alive && a.faction === 'ally' && !a.def.noncombat && ok(a)) { const d = d2(this.pos, a.pos); if (d < allyR && d < bd) { best = a; bd = d; } }
      if (!best && P.alive && ok(P) && d2(this.pos, P.pos) < plyR) best = P;
    } else {
      const [anchor, range] = this.leash();
      const B = G.battle && G.battle.mode === 'duel' ? G.battle.boss : null;
      for (const a of G.actors) if (a.alive && a.faction === 'enemy') {
        if (B && B.arena && d2(a.pos, B.home) < B.arena.R + 2) continue; // 單挑時友軍不插手
        const d = d2(this.pos, a.pos);
        if (d < bd && (this.follow ? d2(anchor, a.pos) < range : d < 30)) { best = a; bd = d; }
      }
      if (!best) for (const a of G.animals) if (a.alive && a.kind === 'wolf') { const d = d2(this.pos, a.pos); if (d < 16 && d < bd) { best = a; bd = d; } }
    }
    return best;
  }

  // 隨行部隊依指令決定活動範圍：[錨點, 搜敵半徑, 放棄追擊半徑]
  leash() {
    const c = G.squadCmd;
    if (c === 'hold' && G.holdPos) return [G.holdPos, 22, 30];
    if (c === 'attack') return [G.player.pos, 60, 80];
    return [G.player.pos, 34, 46];
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
    if (this.canTorch) this.updateTorch(dt);
    if (this.stunT > 0 || this.skillBusy) { this.special(dt); return; } // 被震懾，或正在施展絕技

    // ---- 目標 ----
    this.retT -= dt;
    const hadTarget = !!this.target;
    if (this.retT <= 0 && !d.noncombat) {
      this.retT = 0.45 + rnd(0.2);
      const t = this.target;
      if (t && (t.alive === false || d2(this.pos, t.pos) > (this.alert > 0 ? 130 : 75))) this.target = null;
      if (this.target && this.arena && !this.inArena(this.target)) this.target = null;
      if (this.siege && this.target && (this.siegeOnly || d2(this.pos, this.target.pos) > 20)) this.target = null; // 守營戰：不追遠處的對手
      if (this.target && G.battle && G.battle.mode === 'duel') {
        const B = G.battle.boss;
        if (this.faction === 'ally' && B.arena && d2(this.target.pos, B.home) < B.arena.R + 2) this.target = null;
        if (this.faction === 'enemy' && this !== B && B.arena && d2(this.pos, B.home) < B.arena.R + 15) this.target = null;
        if (this === B && this.target !== P) this.target = null;
      }
      if (this.target && this.follow) { const [an, , drop] = this.leash(); if (d2(an, this.target.pos) > drop) this.target = null; }
      { const nt = this.findTarget(); if (nt) this.target = nt; } // 每次重新評估目標（敵人會改打靠近的隊友）
      if (!this.roam && !this.follow && this.target && dist2(this.pos.x, this.pos.z, this.home.x, this.home.z) > (this.faction === 'ally' ? 45 : 150)) { this.target = null; this.alert = 0; }
    }
    if (!hadTarget && this.target) { // 發現敵人：吶喊、舉起兵器
      this.emo = null; this.lookAt = null;
      if (!d.ranged && !d.boss && Math.random() < 0.6) this.emote('warcry');
      bark(this, d.boss ? 'fight' : 'spot', d.boss ? 0.6 : 0.5);
    }
    if (this.emo) { const e = this.emo; e.t += dt; if (e.t >= e.dur || (this.target && e.k !== 'warcry')) { this.emo = null; this.emoT = rnd(4, 10); } }

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
        else if (this.atkT <= 0) { this.wind = this.windTot = 0.75; bark(this, 'attack', 0.12); }
      } else {
        if (dist > reach * 0.85 && this.wind <= 0) { goal = tg.pos; speed = d.speed * (dist > 12 ? 1.15 : 1); }
        if (dist < reach && this.atkT <= 0 && this.wind <= 0) { this.wind = this.windTot = d.boss ? 0.42 : 0.5; audio.playAt('swing', dp, 0.6); bark(this, 'attack', 0.15); }
        else if (dist <= reach * 0.85 && this.wind <= 0 && this.atkT > 0.35 && !d.boss && !this.horse) { // 等待出手時繞著對手移步
          this.circT -= dt; if (this.circT <= 0) { this.circT = rnd(1.2, 2.8); this.circDir = -this.circDir; }
          mx = -dz / dist * this.circDir; mz = dx / dist * this.circDir; speed = d.speed * 0.3;
        }
      }
      if (d.boss) { this.fightT -= dt; if (this.fightT <= 0) { this.fightT = rnd(9, 15); bark(this, 'fight', 0.8); } }
      // 攻擊結算
      if (this.wind > 0) {
        this.wind -= dt;
        if (this.wind <= 0) {
          this.atkT = d.cd * (0.85 + rnd(0.3));
          if (d.gun) { // 火銃：直線彈道、傷害高；下雨常常啞火
            V.set(this.pos.x, this.pos.y + 1.45, this.pos.z);
            if (raining() && Math.random() < 0.4) { audio.playAt('click', dp, 0.8); fxBurst(V, 0x8a8a8a, 8, 1.5, 0.8, 0.2); }
            else {
              const ty = tg.pos.y + (tg === P ? P.eyeH * 0.8 : 1.2), L = Math.hypot(dx, ty - V.y, dz) || 1, sp = 140, e = 0.035;
              V2.set(dx / L + rnd(-e, e), (ty - V.y) / L + rnd(-e, e) * 0.6, dz / L + rnd(-e, e)).normalize().multiplyScalar(sp);
              spawnArrow(V, V2, this, d.dmg * allyBuff(this), 'bullet'); audio.playAt('rifle', dp, 0.9); fxBurst(V, 0xffc060, 6, 2, 0.15, 0.15);
            }
          } else if (d.ranged) {
            V.set(this.pos.x, this.pos.y + 1.5 * this.scale, this.pos.z);
            const ty = tg.pos.y + (tg === P ? P.eyeH * 0.75 : 1.1);
            const sp = 40, t = dist / sp, g = 9;
            const err = 0.045;
            V2.set(dx / t, (ty - V.y) / t + 0.5 * g * t, dz / t);
            V2.x += rnd(-1, 1) * sp * err; V2.z += rnd(-1, 1) * sp * err; V2.y += rnd(-1, 1) * sp * err * 0.5;
            spawnArrow(V, V2, this, d.dmg * allyBuff(this)); audio.playAt('bow', dp, 0.8);
          } else if (dist < reach + 0.9) {
            tg.damage(d.dmg * (0.85 + rnd(0.3)) * allyBuff(this), this);
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
        } else if (d.special === 'volley' && dist > 8 && dist < 40) { // 文醜：連珠箭
          this.specialT = 6;
          G.ui.msg(`${d.name}張弓連射！`, 'warn');
          for (let i = 0; i < 5; i++) {
            V.set(this.pos.x, this.pos.y + 1.6 * this.scale, this.pos.z);
            const ty = tg.pos.y + 1.2, sp = 42, t = dist / sp, off = (i - 2) * 0.09, c = Math.cos(off), sn = Math.sin(off);
            const vx = dx / t, vz = dz / t;
            V2.set(vx * c - vz * sn, (ty - V.y) / t + 4.5 * t, vx * sn + vz * c);
            spawnArrow(V, V2, this, d.dmg * 0.5);
          }
          audio.playAt('bow', dp, 1);
        } else if (d.special === 'summon') {
          const step = this.hp < this.maxHp * 0.3 ? 2 : this.hp < this.maxHp * 0.65 ? 1 : 0;
          if (step > this.summoned && this.dueling) { this.summoned = step; G.ui.msg(`${d.name}按住了想上前護駕的親兵——單挑就是單挑。`, 'info'); }
          else if (step > this.summoned) {
            this.summoned = step; G.ui.msg(d.summon.line, 'warn'); audio.play('horn', 0.7);
            for (let i = 0; i < 4; i++) { const a = new Actor(pick(d.summon.units), this.pos.x + rnd(-9, 9), this.pos.z + rnd(-9, 9), { roam: true }); a.alert = 20; a.target = tg; }
          }
          this.specialT = 1;
        }
      }
    } else if (this.siege) { // 守營戰：沒有對手時直撲軍旗
      const sx = this.siege.x - this.pos.x, sz = this.siege.z - this.pos.z, sd = Math.hypot(sx, sz), need = d.ranged ? 16 : 3.2;
      if (sd > need && this.wind <= 0) { goal = this.siege; speed = d.speed; }
      else {
        face = Math.atan2(sx, sz);
        if (this.wind > 0) { this.wind -= dt; if (this.wind <= 0) { this.atkT = d.cd * (0.9 + rnd(0.3)); audio.playAt(d.ranged ? 'bow' : 'chop', dp, 0.7); if (G.onSiegeHit) G.onSiegeHit(this, d.dmg); } }
        else if (this.atkT <= 0) { this.wind = this.windTot = d.ranged ? 0.75 : 0.5; }
      }
    } else if (this.follow && G.squadCmd === 'hold' && G.holdPos) {
      const i = this.slotIdx || 0, a = i * 2.4, r = 1.6 + i * 0.7;
      if (!this.holdGoal || this.holdGoal.src !== G.holdPos) this.holdGoal = { src: G.holdPos, x: G.holdPos.x + Math.cos(a) * r, z: G.holdPos.z + Math.sin(a) * r };
      const hd = dist2(this.pos.x, this.pos.z, this.holdGoal.x, this.holdGoal.z);
      if (hd > 1.2) { goal = this.holdGoal; speed = d.speed * (hd > 10 ? 1.2 : 0.7); }
    } else if (this.follow) {
      const dx = P.pos.x - this.pos.x, dz = P.pos.z - this.pos.z;
      if (dp > 130) { this.pos.set(P.pos.x - 4 + rnd(8), 0, P.pos.z - 4 + rnd(8)); }
      else if (dp > 5 + (this.followSlot || 0)) { goal = P.pos; speed = dp > 11 ? Math.max(d.speed * 1.35, P.mount ? 16 : 8.6) : d.speed * 0.7; }
      else if (dp < 8) face = Math.atan2(dx, dz);
    } else {
      // 無目標：回崗位 / 閒晃
      const hx = this.home.x - this.pos.x, hz = this.home.z - this.pos.z, hd = Math.hypot(hx, hz);
      const still = d.general || d.boss || this.faction === 'ally';
      const chat = this.lookAt && G.now < this.lookAt.until ? Math.atan2(this.lookAt.x - this.pos.x, this.lookAt.z - this.pos.z) : null;
      if (still) {
        if (hd > 1.5) { goal = this.home; speed = d.speed * 0.8; }
        else if (chat !== null) face = chat;
        else if (dp < 10) face = Math.atan2(P.pos.x - this.pos.x, P.pos.z - this.pos.z);
        else if (this.homeYaw !== undefined) face = this.homeYaw;
      } else {
        this.wanderT -= dt;
        if (this.wanderT <= 0) { this.wanderT = rnd(3, 9); const a = rnd(PI * 2), r = rnd(2, this.roam ? 18 : 10); this.dest = { x: this.home.x + Math.cos(a) * r, z: this.home.z + Math.sin(a) * r }; }
        if (this.emo || chat !== null) this.dest = null; // 做小動作或聊天時站著不動
        if (chat !== null) face = chat;
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
    // ---- 閒置：打招呼、小動作、自言自語／閒聊 ----
    if (this.emo && speed > 0.5 && this.emo.k !== 'warcry') this.emo = null;
    if (!tg) {
      if (this.faction === 'ally' && !this.follow && P.alive && dp < 6 && G.now - (this.greetT || -99) > 45) { this.greetT = G.now; if (!this.horse) this.emote('salute'); bark(this, 'greet', 0.75); }
      if (speed === 0 && this.curSpeed < 0.4) {
        if (!this.emo) { this.emoT -= dt; if (this.emoT <= 0) this.idleEmote(); }
        this.barkT -= dt; if (this.barkT <= 0) { this.barkT = rnd(10, 24); idleChatter(this, G.actors); }
      }
    }
    if (this.follow && G.squadCmd !== 'hold' && !tg && dp > 24) { this.farT += dt; if (this.farT > 9) { this.farT = 0; this.pos.set(P.pos.x - Math.sin(P.yaw + PI) * -4 + rnd(-2, 2), 0, P.pos.z - Math.cos(P.yaw + PI) * -4 + rnd(-2, 2)); } } else this.farT = 0;
    if (G.battle && G.battle.mode === 'duel' && this.faction === 'ally' && G.battle.boss.arena) { // 單挑：友軍退到圈外
      const B = G.battle.boss, ax = this.pos.x - B.home.x, az = this.pos.z - B.home.z, ad = Math.hypot(ax, az) || 1, R = B.arena.R + 1.5;
      if (ad < R) { this.pos.x = B.home.x + ax / ad * R; this.pos.z = B.home.z + az / ad * R; }
    }
    if (this.arena) {
      const ax = this.pos.x - this.home.x, az = this.pos.z - this.home.z, ad = Math.hypot(ax, az), R = this.arena.R - 1.5;
      if (ad > R) { this.pos.x = this.home.x + ax / ad * R; this.pos.z = this.home.z + az / ad * R; }
      // 玩家不在圈內時，敵將慢慢回復（每秒 1%）
      if (!this.inArena(P) && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.01 * dt);
      this.arena.mat.opacity = 0.75 + 0.25 * Math.sin(G.now * 3);
    }
    this.curSpeed = lerp(this.curSpeed, speed, Math.min(1, dt * 8));
    this.pos.y = Math.max(heightAt(this.pos.x, this.pos.z), WATER - 1.1);
    if (face !== null) this.yaw = turnTo(this.yaw, face, dt * 7);
    m.root.position.copy(this.pos); m.root.rotation.y = this.yaw;

    // ---- 動畫 ----
    this.walkPh += this.curSpeed * dt * 2.1;
    const sw = Math.sin(this.walkPh) * clamp(this.curSpeed / 4.5, 0, 1) * 0.75, t = G.now;
    // 基本姿勢：走路擺臂
    let aLx = d.weapon2 ? -0.35 - sw * 0.25 : -sw * 0.7, aLz = 0, aRx = -0.35 + sw * 0.25, aRz = 0;
    if (this.torchLit) { aLx = -0.8 + sw * 0.12; aLz = 0.1; } // 舉著火把
    let lLx = sw, lRx = -sw, lz = 0, iRx = 0, iRy = 0, iY = 0, iZ = 0;
    if (tg && !this.horse) { // 對戰架勢：兵器舉在身前、微蹲、重心起伏
      if (d.gun) { aRx = -1.3; aLx = -1.2; aLz = 0.45; }
      else if (d.ranged) { aRx = -0.9; aLx = d.weapon2 ? -0.6 : -0.5; }
      else if (this.curSpeed < 3.5) {
        aRx = -0.85 + Math.sin(t * 5 + this.ph0) * 0.06; if (!d.weapon2) { aLx = -0.75; aLz = 0.35; } else aLx = -0.8;
        lz = 0.07; iRx = 0.08; iY = -0.03 + Math.abs(Math.sin(t * 6 + this.ph0)) * 0.02;
      }
    }
    const e = this.emo;
    if (e && (!tg || e.k === 'warcry')) { // 小動作（淡入淡出）
      const et = e.t, r = Math.min(1, et * 4, (e.dur - et) * 4), mix = (a, b) => a + (b - a) * r;
      switch (e.k) {
        case 'look': iRy = Math.sin(et / e.dur * PI * 2) * 0.7 * r; break;
        case 'stretch': aLx = mix(aLx, -2.9); aRx = mix(aRx, -2.9); aLz = mix(aLz, -0.3); aRz = mix(aRz, 0.3); iRx = mix(iRx, -0.1); break;
        case 'yawn': aLx = mix(aLx, -2.6); aRx = mix(aRx, -2.6); aLz = mix(aLz, -0.55); aRz = mix(aRz, 0.55); iRx = mix(iRx, -0.18); break;
        case 'scratch': aLx = mix(aLx, -2.5 + Math.sin(et * 16) * 0.12); aLz = mix(aLz, 0.6); iRy = mix(iRy, 0.15); break;
        case 'beard': aLx = mix(aLx, -1.75 + Math.sin(et * 3) * 0.12); aLz = mix(aLz, 0.55); iRx = mix(iRx, -0.05); break;
        case 'flourish': aRx = mix(aRx, -1.4 + Math.sin(et * 9) * 1.1); iRy = mix(iRy, Math.sin(et * 9) * 0.25); break;
        case 'sharpen': aRx = mix(aRx, -1.0 + Math.sin(et * 11) * 0.12); aLx = mix(aLx, -1.05); aLz = mix(aLz, 0.5); iRx = mix(iRx, 0.15); break;
        case 'sit': lLx = lRx = mix(lLx, -1.45); lz = mix(lz, 0.12); iY = mix(iY, -0.62); aLx = mix(aLx, -0.5); aRx = mix(aRx, -0.45); break;
        case 'salute': aLx = mix(aLx, -1.5); aLz = mix(aLz, 0.6); aRx = mix(aRx, -1.5); aRz = mix(aRz, -0.6); iRx = mix(iRx, 0.14); break; // 抱拳
        case 'chat': aRx = mix(aRx, -0.9 + Math.sin(et * 5) * 0.35); aRz = mix(aRz, -0.25); iRy = mix(iRy, Math.sin(et * 1.3) * 0.15); break;
        case 'warcry': aRx = mix(aRx, -2.8); iRx = mix(iRx, -0.12); break;
        case 'torch': aLx = mix(aLx, -2.5); aLz = mix(aLz, 0.25); iRy = mix(iRy, 0.2); break; // 點火把：舉高

      }
    }
    if (this.cheer > 0) { this.cheer -= dt; if (!tg) { aRx = -2.9 + Math.sin(t * 14) * 0.15; iRx = -0.06; } } // 擊倒對手後舉起兵器
    if (this.wind > 0) { // 出手
      const p = 1 - this.wind / this.windTot;
      if (d.gun) { aRx = -1.5; aLx = -1.45; aLz = 0.45; }
      else if (d.ranged) { aRx = -1.5; aLx = -1.5; aLz = 0.45; iRy = -0.2; } // 拉弓
      else {
        aRx = p < 0.6 ? lerp(-0.6, -2.8, p / 0.6) : lerp(-2.8, -0.2, (p - 0.6) / 0.4);
        iRy = p < 0.6 ? -0.3 * (p / 0.6) : lerp(-0.3, 0.35, (p - 0.6) / 0.4); // 扭腰揮擊
        if (p > 0.6) { iZ = 0.14; iRx = 0.16; }
        if (d.weapon2) aLx = -1.6;
      }
    }
    if (this.charge > 0) { aRx = -1.3; iRx = 0.22; }
    if (this.flinch > 0) { this.flinch -= dt; const f = Math.max(0, this.flinch / 0.28); iRx -= 0.3 * f; aLx -= 0.6 * f; aLz -= 0.3 * f; } // 受擊後仰
    if (this.hp < this.maxHp * 0.3 && !d.boss && !this.horse && !(e && e.k === 'sit')) iRx += 0.12; // 重傷佝僂

    const k = Math.min(1, dt * 12), kl = Math.min(1, dt * 18);
    m.armR.rotation.x = lerp(m.armR.rotation.x, aRx, Math.min(1, dt * 22)); m.armR.rotation.z = lerp(m.armR.rotation.z, aRz, k);
    m.armL.rotation.x = lerp(m.armL.rotation.x, aLx, Math.min(1, dt * 16)); m.armL.rotation.z = lerp(m.armL.rotation.z, aLz, k);
    m.inner.rotation.x = lerp(m.inner.rotation.x, iRx, k); m.inner.rotation.y = lerp(m.inner.rotation.y, iRy, k); m.inner.position.z = lerp(m.inner.position.z, iZ, k);
    if (this.horse) {
      const l = this.horse.legs; l[0].rotation.x = sw; l[3].rotation.x = sw; l[1].rotation.x = -sw; l[2].rotation.x = -sw;
      m.inner.position.y = this.seat + Math.abs(Math.sin(this.walkPh)) * 0.05 * clamp(this.curSpeed / 4, 0, 1);
    } else {
      m.legL.rotation.x = lerp(m.legL.rotation.x, lLx, kl); m.legR.rotation.x = lerp(m.legR.rotation.x, lRx, kl);
      m.legL.rotation.z = lerp(m.legL.rotation.z, -lz, k); m.legR.rotation.z = lerp(m.legR.rotation.z, lz, k);
      m.inner.position.y = lerp(m.inner.position.y, iY * this.scale, k);
      m.body.position.y = Math.abs(sw) * 0.04 + Math.sin(t * 1.9 + this.ph0) * 0.006; // 走路起伏＋呼吸
    }
  }
}

// 決戰圈：沿地形起伏的發光圍幕（疊加發光，下亮上淡；不依賴逐像素透明度，手機 GPU 也穩定）
let arenaTex = null;
function arenaTexture() {
  if (arenaTex) return arenaTex;
  const c = document.createElement('canvas'); c.width = 4; c.height = 64; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 64);
  gr.addColorStop(0, '#000'); gr.addColorStop(0.55, '#5a2a08'); gr.addColorStop(1, '#ffc860'); // 疊加發光：黑色＝不發光
  g.fillStyle = gr; g.fillRect(0, 0, 4, 64);
  arenaTex = new THREE.CanvasTexture(c); arenaTex.colorSpace = THREE.SRGBColorSpace; return arenaTex;
}
function arenaBand(cx, cz, R, y0, y1, mat) {
  const N = 96, pos = [], uv = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const a = i / N * PI * 2, x = cx + Math.cos(a) * R, z = cz + Math.sin(a) * R, y = heightAt(x, z);
    pos.push(x, y + y0, z, x, y + y1, z);
    uv.push(i / N, 0, i / N, 1);
    if (i < N) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.renderOrder = 2; return m;
}
function makeArena(cx, cz, R) {
  const mat = new THREE.MeshBasicMaterial({ map: arenaTexture(), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false, fog: false });
  const stripe = new THREE.MeshBasicMaterial({ color: 0xff9a20, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false, fog: false });
  const mesh = new THREE.Group();
  mesh.add(arenaBand(cx, cz, R, -0.2, 1.9, mat), arenaBand(cx, cz, R, -0.15, 0.32, stripe)); // 發光圍幕 + 白天也看得清楚的地面色帶
  G.scene.add(mesh);
  return { R, mesh, mat };
}

// =====================================================================
//  侍從：不會攻擊、不會受傷，定時替玩家採集物資
// =====================================================================
// 侍從的台詞
const ATT_LINES = {
  go: { tree: ['我去砍點柴！', '那邊有木材！'], ore: ['我去挖礦！', '那塊石頭看起來有鐵！'], herb: ['我去採藥！', '那邊有草藥！'], berry: ['那裡有野果！'], any: ['我去撿點東西！'] },
  done: ['採到了！', '搞定！', '嘿咻——好重。'],
  idle: ['先生，要不要歇會兒？', '這附近好像有草藥。', '我腳好痠……', '先生的火器好厲害！', '今天天氣不錯呢。'],
  night: ['天黑了，我有點怕……', '先生，晚上別走太遠。'],
  fear: ['哇！打起來了！', '先生小心！', '別、別過來！', '我躲遠一點……'],
};
export class Attendant {
  constructor(spec, x, z, o = {}) {
    const d = ATTENDANTS[spec];
    this.id = 'attendant'; this.spec = spec; this.name = d.name; this.faction = 'ally';
    this.def = { title: `${d.role}・${d.desc}`, noncombat: true };
    this.pos = new THREE.Vector3(x, heightAt(x, z), z); this.yaw = 0;
    this.inv = o.inv || {}; this.focus = o.focus || null; this.wait = !!o.wait; this.ws = !!o.ws; this.cap = 10;
    this.state = 'idle'; this.node = null; this.t = o.first ? 12 : rnd(20, 35); this.walkPh = 0; this.curSpeed = 0;
    this.stuckT = 0; this.wp = [0, 0]; this.wpT = 0; this.alive = true;
    this.bubbleY = 2.6; this.fearT = rnd(0.6); this.scared = false; this.chatT = rnd(20, 40);
    this.waitPos = o.waitPos || { x, z };
    const m = this.m = humanoid(d.look, null, null, 0.92);
    const l = makeLabel(d.name, '#ffe08a'); l.material.sizeAttenuation = false; l.scale.set(0.26, 0.065, 1); l.position.y = 2.15; m.root.add(l);
    m.root.position.copy(this.pos); G.scene.add(m.root); G.attendants.push(this);
  }
  get radius() { return 0.38; }
  get carried() { let n = 0; for (const k in this.inv) n += this.inv[k]; return n; }
  kinds() { // 依專長或玩家指定，決定要採哪些資源點
    const f = this.focus || this.spec;
    return f === 'wood' ? ['tree'] : f === 'ore' ? ['ore'] : f === 'herb' ? ['herb', 'bush'] : ['tree', 'ore', 'herb', 'bush'];
  }
  pickNode() {
    const P = G.player, c = this.wait ? this.waitPos : P.pos, ks = this.kinds();
    let best = null, bs = 1e9;
    world.nodes.query(c.x, c.z, 32, n => {
      if (!ks.includes(n.kind)) return;
      if (n.kind === 'tree') { if (Math.min(3, n.stock + Math.floor((G.now - n.last) / 45)) <= 0) return; }
      else if (n.stock <= 0) return;
      const dc = dist2(n.x, n.z, c.x, c.z); if (dc > 32) return;
      const sc = dc + rnd(6) + (n.kind === 'ore' && !this.focus && this.spec === 'all' ? -4 : 0);
      if (sc < bs) { bs = sc; best = n; }
    });
    return best;
  }
  harvest(n) {
    const bonus = (this.focus || this.spec) !== 'all' && this.spec !== 'all' && this.kinds().includes(n.kind) ? 2 : 1;
    let item, k = bonus;
    if (n.kind === 'tree') {
      n.stock = Math.min(3, n.stock + Math.floor((G.now - n.last) / 45)); if (n.stock <= 0) return null;
      n.stock--; n.last = G.now; item = 'wood';
    } else {
      if (n.stock <= 0) return null;
      n.stock--; item = n.item; if (n.item === 'berry') k = 2 * bonus;
      if (n.stock <= 0) { n.mesh.visible = false; n.respawn = 220; }
    }
    k = Math.min(k, this.cap - this.carried); if (k <= 0) return null;
    this.inv[item] = (this.inv[item] || 0) + k;
    return [item, k];
  }
  handOver() {
    const got = [];
    for (const k in this.inv) if (this.inv[k] > 0) { G.player.give(k, this.inv[k]); got.push(`${ITEMS[k].i}${ITEMS[k].n}×${this.inv[k]}`); }
    this.inv = {}; return got;
  }
  update(dt) {
    const P = G.player, m = this.m, dp = d2(this.pos, P.pos);
    let goal = null, speed = 0, face = null;
    this.t -= dt;
    if (this.state === 'idle') {
      const home = this.wait ? this.waitPos : null;
      if (!this.wait) {
        if (dp > 70) { this.pos.set(P.pos.x - Math.sin(P.yaw) * 3 + rnd(-1, 1), 0, P.pos.z - Math.cos(P.yaw) * 3 + rnd(-1, 1)); }
        else if (dp > 4.5) { goal = P.pos; speed = dp > 14 ? (P.mount ? 15 : 8.8) : 4.5; }
        else face = Math.atan2(P.pos.x - this.pos.x, P.pos.z - this.pos.z);
      } else if (dist2(this.pos.x, this.pos.z, home.x, home.z) > 1.2) { goal = home; speed = 4.5; }
      if (this.t <= 0) {
        this.t = rnd(25, 40);
        if (this.carried >= this.cap) { if (!this.fullMsg) { this.fullMsg = true; G.ui.msg(`${this.name}：「我身上裝滿了，找我拿東西吧！」`, 'say'); } }
        else if (!P.mount || this.wait) {
          const n = this.pickNode();
          if (n) {
            this.node = n; this.state = 'go'; this.goT = 0;
            if (dp < 25 && Math.random() < 0.5) { const g = ATT_LINES.go; say(this, pick(n.kind === 'tree' ? g.tree : n.kind === 'ore' ? g.ore : n.item === 'herb' ? g.herb : n.item === 'berry' ? g.berry : g.any)); }
          }
        }
      }
      if (!goal && dp < 12 && (this.chatT -= dt) <= 0) { this.chatT = rnd(30, 55); say(this, pick(world.isNight && Math.random() < 0.5 ? ATT_LINES.night : ATT_LINES.idle)); }
    } else if (this.state === 'go') {
      const n = this.node, nd = dist2(this.pos.x, this.pos.z, n.x, n.z);
      this.goT += dt;
      if (!this.wait && dp > 50) this.state = 'idle';
      else if (nd < (n.kind === 'tree' ? 1.8 : 1.6)) { this.state = 'work'; this.workT = 2.2; }
      else { goal = n; speed = 5.5; if (this.goT > 14) { this.pos.set(n.x + 1.2, 0, n.z + 1.2); } }
    } else if (this.state === 'work') {
      face = Math.atan2(this.node.x - this.pos.x, this.node.z - this.pos.z);
      this.workT -= dt;
      if (Math.floor(this.workT * 2.5) !== Math.floor((this.workT + dt) * 2.5)) audio.playAt('chop', dp, 0.5);
      if (this.workT <= 0) {
        const r = this.harvest(this.node); this.node = null; this.state = 'idle';
        if (r && this.ws && G.wsDeposit) { G.wsDeposit(this); this.fullMsg = false; } // 派駐工坊：直接存進工坊倉庫
        else if (r) { this.fullMsg = false; if (dp < 25 && Math.random() < 0.5) say(this, pick(ATT_LINES.done)); G.ui.msg(`${this.name} 採到 ${ITEMS[r[0]].i}${ITEMS[r[0]].n} ×${r[1]}（身上 ${this.carried}/${this.cap}，找他交談可領取）`, 'get'); }
      }
    }
    if (goal && speed > 0) {
      this.wpT -= dt;
      if (this.wpT <= 0) { this.wpT = 0.3; world.route(this.pos.x, this.pos.z, goal.x, goal.z, this.wp); }
      let mx = this.wp[0] - this.pos.x, mz = this.wp[1] - this.pos.z; const l = Math.hypot(mx, mz) || 1; mx /= l; mz /= l;
      if (heightAt(this.pos.x, this.pos.z) < WATER - 0.2) speed *= 0.55;
      const ox = this.pos.x, oz = this.pos.z;
      this.pos.x += mx * speed * dt; this.pos.z += mz * speed * dt;
      world.resolve(this.pos, this.radius);
      if (Math.hypot(this.pos.x - ox, this.pos.z - oz) < speed * dt * 0.3) { this.stuckT += dt; if (this.stuckT > 2.5) { this.stuckT = 0; this.pos.x += mx * 2.5 + rnd(-1, 1); this.pos.z += mz * 2.5 + rnd(-1, 1); } }
      else this.stuckT = 0;
      face = Math.atan2(mx, mz);
    }
    // 不要擋住玩家
    const px = this.pos.x - P.pos.x, pz = this.pos.z - P.pos.z, pd = Math.hypot(px, pz);
    if (pd < 1 && pd > 1e-3) { this.pos.x = P.pos.x + px / pd; this.pos.z = P.pos.z + pz / pd; }
    if (this.ws) { m.root.visible = dp < 240; }
    this.curSpeed = lerp(this.curSpeed, goal ? speed : 0, Math.min(1, dt * 8));
    this.pos.y = Math.max(heightAt(this.pos.x, this.pos.z), WATER - 1.1);
    if (face !== null) this.yaw = turnTo(this.yaw, face, dt * 7);
    m.root.visible = dp < 240;
    m.root.position.copy(this.pos); m.root.rotation.y = this.yaw;
    // 附近開打時抱頭（站著時蹲下發抖）
    this.fearT -= dt;
    if (this.fearT <= 0) {
      this.fearT = 0.6;
      const was = this.scared;
      this.scared = !this.ws && G.actors.some(a => a.alive && a.faction === 'enemy' && a.target && Math.hypot(a.pos.x - this.pos.x, a.pos.z - this.pos.z) < 20);
      if (this.scared && !was && dp < 30 && G.now > (this.fearCd || 0)) { this.fearCd = G.now + rnd(12, 20); say(this, pick(ATT_LINES.fear)); }
    }
    this.walkPh += this.curSpeed * dt * 2.1;
    const sw = Math.sin(this.walkPh) * clamp(this.curSpeed / 4.5, 0, 1) * 0.75, k = Math.min(1, dt * 12);
    let aLx = -sw * 0.7, aRx = this.state === 'work' ? -1.2 - Math.sin(G.now * 12) * 0.9 : sw * 0.7, az = 0, lx = 0, iY = 0;
    if (this.scared && this.state !== 'work') { aLx = aRx = -2.7 + Math.sin(G.now * 20) * 0.06; az = 0.45; if (this.curSpeed < 0.5) { lx = -0.9; iY = -0.28; } }
    m.legL.rotation.x = lerp(m.legL.rotation.x, sw + lx, Math.min(1, dt * 18)); m.legR.rotation.x = lerp(m.legR.rotation.x, -sw + lx, Math.min(1, dt * 18));
    m.armL.rotation.x = lerp(m.armL.rotation.x, aLx, Math.min(1, dt * 16)); m.armR.rotation.x = this.state === 'work' ? aRx : lerp(m.armR.rotation.x, aRx, Math.min(1, dt * 16));
    m.armL.rotation.z = lerp(m.armL.rotation.z, az, k); m.armR.rotation.z = lerp(m.armR.rotation.z, -az, k);
    m.inner.position.y = lerp(m.inner.position.y, iY * 0.92, k);
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
        if (dp < 4.5) {
          this.state = 'idle';
          if (this.autoMount && P.alive && !P.mount && P.horse === this) { P.mountHorse(this); G.ui.msg(`${this.name}奔到你身邊，你翻身上馬。`, 'get'); }
          this.autoMount = false;
        }
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
const bulletGeo = new THREE.BoxGeometry(0.05, 0.05, 1.4), bulletMat = new THREE.MeshBasicMaterial({ color: 0xffe0a0, fog: false });
export function spawnArrow(pos, vel, owner, dmg, type = 'arrow') {
  const mesh = new THREE.Mesh(type === 'bullet' ? bulletGeo : arrowGeo, type === 'bullet' ? bulletMat : arrowMat); mesh.position.copy(pos); G.scene.add(mesh);
  G.projectiles.push({ type, pos: pos.clone(), vel: vel.clone(), owner, dmg, life: type === 'bullet' ? 2 : 5, mesh });
}
const fireMat = new THREE.MeshLambertMaterial({ color: 0x8a3a1a });
export function spawnGrenade(pos, vel, dud = false, kind = 'boom') {
  const mesh = new THREE.Mesh(grenGeo, kind === 'fire' ? fireMat : grenMat); mesh.position.copy(pos); G.scene.add(mesh);
  // 燃燒彈落地就碎、起火；震天雷依引信時間爆炸
  G.projectiles.push({ type: 'grenade', pos: pos.clone(), vel: vel.clone(), life: kind === 'fire' ? 4 : 2.3, mesh, dud, kind });
}
// 掃掠碰撞：檢查這一幀飛過的整段路徑，快速的子彈才不會穿過目標
const P0 = new THREE.Vector3();
function hitsBody(p, t, r, top) {
  const ax = P0.x, ay = P0.y, az = P0.z, dx = p.x - ax, dy = p.y - ay, dz = p.z - az, L2 = dx * dx + dz * dz;
  const k = L2 > 1e-6 ? clamp(((t.pos.x - ax) * dx + (t.pos.z - az) * dz) / L2, 0, 1) : 1;
  const x = ax + dx * k, y = ay + dy * k, z = az + dz * k;
  if (Math.hypot(x - t.pos.x, z - t.pos.z) >= r || y <= t.pos.y - 0.1 || y >= t.pos.y + top) return false;
  p.set(x, y, z); return true;
}
export function updateProjectiles(dt) {
  const P = G.player;
  for (const p of G.projectiles) {
    p.life -= dt;
    if (p.type === 'arrow' || p.type === 'bullet') {
      if (p.type === 'arrow') p.vel.y -= 9 * dt;
      const sp = p.vel.length(), step = sp * dt;
      V.copy(p.vel).multiplyScalar(1 / sp);
      let dead = p.life <= 0 || world.rayBlock(p.pos, V, step + 0.6) < step + 0.6;
      P0.copy(p.pos); p.pos.addScaledVector(p.vel, dt);
      const fromPlayer = p.owner === P, enemyShot = !fromPlayer && p.owner.faction === 'enemy';
      if (!dead) {
        if (enemyShot && P.alive && hitsBody(p.pos, P, P.mount ? 0.9 : 0.5, P.eyeH + 0.2)) { P.damage(p.dmg, p.owner); dead = true; }
        if (!dead) for (const a of G.actors) {
          if (!a.alive || a === p.owner || (a.faction === 'enemy') === enemyShot || a.def.noncombat) continue;
          if (hitsBody(p.pos, a, a.radius + 0.25, 1.95 * a.scale + a.seat)) {
            const head = p.pos.y > a.pos.y + a.seat + 1.48 * a.scale;
            const hit = a.damage(p.dmg * (head ? 2 : 1), p.owner); dead = true;
            if (hit !== false) { if (fromPlayer) G.ui.hitmarker(head); fxBurst(p.pos, 0x8a0a0a, 6, 2.5, 0.4); }
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
      if (p.pos.y < gy) { p.pos.y = gy; p.vel.y *= -0.35; p.vel.x *= 0.55; p.vel.z *= 0.55; if (p.kind === 'fire') p.life = 0; }
      const bx = p.pos.x, bz = p.pos.z; world.resolve(p.pos, 0.15);
      if (bx !== p.pos.x || bz !== p.pos.z) { p.vel.x *= -0.3; p.vel.z *= -0.3; }
      p.mesh.position.copy(p.pos); p.mesh.rotation.x += dt * 9;
      if (p.life <= 0) {
        p.gone = true;
        if (p.dud) { fxBurst(p.pos, 0x8a8a8a, 18, 2.5, 1.2, 0.3); audio.playAt('swing', d2(p.pos, G.player.pos), 0.6); G.ui.msg(p.kind === 'fire' ? '💨 燃燒彈受潮，沒燒起來……' : '💨 震天雷受潮，只冒了陣煙沒炸開……', 'warn'); }
        else if (p.kind === 'fire') fireZone(p.pos);
        else explode(p.pos, 8.5, 230, true);
      }
    }
    if (p.gone) G.scene.remove(p.mesh);
  }
  G.projectiles = G.projectiles.filter(p => !p.gone);
}

export function explode(pos, radius, dmg, byPlayer) {
  const P = G.player, dp = pos.distanceTo(P.pos);
  damageTargets(pos.x, pos.z, radius, 60);
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
// 燃燒彈：地面起火，持續灼燒範圍內的敵人（雨天燒得短）
const flameGeo = new THREE.ConeGeometry(0.45, 1.4, 5);
export function fireZone(at) {
  const wind = G.eastWind > 0, R = wind ? 7 : 5, x = at.x, z = at.z, wet = G.weatherF > 0.6 && !wind, dur = wet ? 3.5 : 7; // 東南風：火勢更大
  const grp = new THREE.Group(), mat = new THREE.MeshBasicMaterial({ color: 0xff8a20, transparent: true, opacity: 0.85, fog: false, depthWrite: false });
  const fl = [];
  for (let i = 0; i < 14; i++) {
    const a = rnd(PI * 2), r = Math.sqrt(Math.random()) * R * 0.9, fx = x + Math.cos(a) * r, fz = z + Math.sin(a) * r;
    const m = new THREE.Mesh(flameGeo, mat); m.position.set(fx, heightAt(fx, fz) + 0.6, fz); m.userData.ph = rnd(6); grp.add(m); fl.push(m);
  }
  G.scene.add(grp); V.set(x, heightAt(x, z), z);
  audio.playAt('explosion', d2(V, G.player.pos), 0.5); fxFlash(V, 0xff7a20, 600, 0.6);
  alertEnemies(V, 60);
  let t = 0, tick = 0;
  G.effects.push({
    update(dt) {
      t += dt; tick -= dt;
      const k = t < dur - 1 ? 1 : Math.max(0, dur - t);
      for (const m of fl) m.scale.set(k, k * (0.8 + 0.35 * Math.sin(G.now * 12 + m.userData.ph)), k);
      if (tick <= 0) {
        tick = 0.5;
        const P = G.player;
        for (const a of G.actors) if (a.alive && a.faction === 'enemy' && Math.hypot(a.pos.x - x, a.pos.z - z) < R) a.damage(wind ? 15 : 10, P);
        for (const a of G.animals) if (a.alive && a.kind !== 'horse' && Math.hypot(a.pos.x - x, a.pos.z - z) < R) a.damage(10, P);
        if (P.alive && Math.hypot(P.pos.x - x, P.pos.z - z) < R) P.damage(4, null);
        damageTargets(x, z, R, wind ? 12 : 8);
        if (Math.random() < 0.5) fxBurst(V.set(x + rnd(-R, R) * 0.6, heightAt(x, z) + 0.5, z + rnd(-R, R) * 0.6), 0x4a3a30, 5, 2, 1.2, 0.3);
      }
      if (t >= dur) { G.scene.remove(grp); mat.dispose(); return false; }
      return true;
    }
  });
}

// 地雷：敵人或野狼靠近就爆炸，最多同時 6 顆
const mineGeo = new THREE.CylinderGeometry(0.32, 0.38, 0.14, 10), mineMat = new THREE.MeshLambertMaterial({ color: 0x3a3428 });
export function placeMine(x, z) {
  if (G.mines.length >= 6) return false;
  const m = new THREE.Mesh(mineGeo, mineMat); m.position.set(x, heightAt(x, z) + 0.03, z); G.scene.add(m);
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff2a1a, fog: false })); led.position.y = 0.09; m.add(led);
  G.mines.push({ x, z, mesh: m, led, arm: 1.5 });
  G.ui.msg('🔘 地雷已埋下，1.5 秒後啟動。友軍與你不會觸發。', 'info');
  return true;
}
export function updateMines(dt) {
  for (const mn of G.mines) {
    if (mn.arm > 0) { mn.arm -= dt; mn.led.visible = Math.sin(G.now * 20) > 0; continue; }
    mn.led.visible = Math.sin(G.now * 4) > 0.6;
    let hit = false;
    for (const a of G.actors) if (a.alive && a.faction === 'enemy' && Math.hypot(a.pos.x - mn.x, a.pos.z - mn.z) < 2.2 + (a.horse ? 0.6 : 0)) { hit = true; break; }
    if (!hit) for (const a of G.animals) if (a.alive && a.kind === 'wolf' && Math.hypot(a.pos.x - mn.x, a.pos.z - mn.z) < 2) { hit = true; break; }
    if (hit) { mn.gone = true; G.scene.remove(mn.mesh); explode(V.set(mn.x, heightAt(mn.x, mn.z) + 0.3, mn.z), 6.5, 200, true); }
  }
  G.mines = G.mines.filter(m => !m.gone);
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
        if (owner === P) { for (const a of G.actors) if (a.alive && a.faction === 'enemy' && d2(a.pos, V) < 3.6) a.damage(55, P); } // 九節杖引雷
        else {
          if (P.alive && d2(V, P.pos) < 3.6 && Math.abs(P.pos.y - y) < 4) P.damage(32, owner);
          for (const a of G.actors) if (a.alive && a.faction === 'ally' && d2(a.pos, V) < 3.6) a.damage(60, owner);
        }
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
