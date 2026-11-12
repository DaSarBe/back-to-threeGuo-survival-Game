// 名將絕技：同行的名將各有一招，玩家按 Q（手機：★ 絕技鍵）下令發動，各自冷卻
import * as THREE from 'three';
import { G } from './state.js';
import { Actor, fxBurst, fxTracer } from './entities.js';
import { heightAt } from './world.js';
import { audio } from './audio.js';
import { say } from './barks.js';
import { followers } from './squad.js';
import { rnd, lerp, clamp } from './util.js';

export const SKILLS = {
  guanyu: { n: '拖刀斬', cd: 30, d: '衝向敵陣，青龍偃月刀橫掃周圍 7 步內所有敵人', line: '看關某拖刀斬！' },
  zhangfei: { n: '當陽怒吼', cd: 36, d: '一聲暴喝，震懾 16 步內的敵人 4 秒（頭目 1.5 秒）', line: '燕人張翼德在此！誰敢決一死戰！' },
  zhaoyun: { n: '七進七出', cd: 28, d: '在敵陣中來回衝殺，連續突刺 7 次', line: '常山趙子龍，七進七出！' },
  liubei: { n: '仁德激勵', cd: 45, d: '治療附近的友軍與你，並讓友軍 12 秒內攻擊提升 35%', line: '諸君隨我，共扶漢室！' },
  caocao: { n: '虎豹突騎', cd: 60, d: '召來三名虎豹騎助戰 25 秒', line: '虎豹騎，隨我衝陣！' },
  sunjian: { n: '猛虎破陣', cd: 32, d: '躍入敵陣重擊，震倒 6 步內的敵人', line: '江東猛虎，破陣！' },
};
export const skillOf = a => SKILLS[a.id] || null;
export const skillGenerals = () => followers().filter(a => a.def.general && SKILLS[a.id]);

const V = new THREE.Vector3(), V2 = new THREE.Vector3();
const dist = (a, b) => Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
function foes(at, r) { // 範圍內可攻擊的敵人（單挑中的敵將不算）
  const B = G.battle && G.battle.mode === 'duel' ? G.battle.boss : null;
  return G.actors.filter(e => e.alive && e.faction === 'enemy' && e !== B && Math.hypot(e.pos.x - at.x, e.pos.z - at.z) < r)
    .sort((p, q) => Math.hypot(p.pos.x - at.x, p.pos.z - at.z) - Math.hypot(q.pos.x - at.x, q.pos.z - at.z));
}
// 地面衝擊波
function fxRing(x, z, r, color, life = 0.55) {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, heightAt(x, z) + 0.25, z); G.scene.add(m);
  let t = 0;
  G.effects.push({ update(dt) { t += dt; const k = t / life; m.scale.setScalar(0.5 + k * r); m.material.opacity = 0.9 * (1 - k); if (k >= 1) { G.scene.remove(m); m.geometry.dispose(); m.material.dispose(); return false; } return true; } });
}
// 技能演出：期間由技能控制位置與姿勢（Actor.update 會讓出控制）
function seq(a, dur, marks, tick) {
  a.skillBusy = true; a.target = null; a.emo = null;
  let t = 0, i = 0;
  G.effects.push({
    update(dt) {
      if (!a.alive || a.gone) { a.skillBusy = false; a.skillPose = null; return false; }
      t += dt;
      while (i < marks.length && t >= marks[i][0]) marks[i++][1]();
      if (tick) tick(t, dt);
      if (t >= dur) { a.skillBusy = false; a.skillPose = null; a.skillY = 0; return false; }
      return true;
    },
  });
}
function shout(a, s) {
  say(a, `${s.n}！`, 'attack', 2.6);
  G.ui.msg(`⚔ ${a.name}「${s.n}」——${s.line}`, 'quest');
}
function hit(e, n, a, stun = 0) {
  if (!e.alive) return;
  V.set(e.pos.x, e.pos.y + 1.2, e.pos.z); fxBurst(V, 0xffd27a, 10, 5, 0.35, 0.16);
  e.damage(n, a);
  if (stun && e.alive) e.stunT = Math.max(e.stunT || 0, e.def.boss ? stun * 0.35 : stun);
}
const face = (a, x, z) => { a.yaw = Math.atan2(x - a.pos.x, z - a.pos.z); };

const CAST = {
  // 關羽：衝向最近的敵人，橫掃一圈
  guanyu(a, s) {
    const f = foes(a.pos, 30); if (!f.length) return '附近沒有敵人。';
    const tg = f[0], sx = a.pos.x, sz = a.pos.z, d = dist(a, tg) || 1, k = Math.max(0, d - 2.6) / d;
    const ex = sx + (tg.pos.x - sx) * k, ez = sz + (tg.pos.z - sz) * k;
    shout(a, s); face(a, tg.pos.x, tg.pos.z); a.skillPose = 'raise'; audio.playAt('swing', 0, 0.9);
    seq(a, 1.25, [
      [0.7, () => {
        a.skillPose = 'sweep'; audio.play('clang', 0.9); audio.play('swing', 1); fxRing(a.pos.x, a.pos.z, 7.5, 0x7dffb0);
        for (const e of foes(a.pos, 7.5)) { hit(e, 260, a, 0.8); const ed = dist(a, e) || 1; e.pos.x += (e.pos.x - a.pos.x) / ed * 2.2; e.pos.z += (e.pos.z - a.pos.z) / ed * 2.2; }
        if (dist(a, G.player) < 30) G.player.shake = Math.max(G.player.shake, 0.18);
      }],
    ], (t, dt) => {
      if (t > 0.35 && t < 0.7) { const u = (t - 0.35) / 0.35; a.pos.x = lerp(sx, ex, u); a.pos.z = lerp(sz, ez, u); }
      if (t > 0.7) a.yaw += 13 * dt; // 掄刀轉身
    });
    return true;
  },
  // 張飛：怒吼震懾
  zhangfei(a, s) {
    const f = foes(a.pos, 16); if (!f.length) return '附近沒有敵人。';
    shout(a, s); face(a, f[0].pos.x, f[0].pos.z); a.skillPose = 'roar';
    seq(a, 1.3, [
      [0.3, () => {
        audio.play('thunder', 0.9); audio.play('horn', 0.7);
        for (const r of [8, 13, 17]) fxRing(a.pos.x, a.pos.z, r, 0xffc040, 0.5 + r * 0.02);
        for (const e of foes(a.pos, 16)) hit(e, 45, a, 4);
        if (dist(a, G.player) < 40) G.player.shake = Math.max(G.player.shake, 0.3);
      }],
    ]);
    return true;
  },
  // 趙雲：連續突刺七次
  zhaoyun(a, s) {
    const f = foes(a.pos, 26); if (!f.length) return '附近沒有敵人。';
    shout(a, s); a.skillPose = 'thrust';
    const marks = [], count = new Map();
    let n = 0;
    for (let i = 0; i < 7; i++) marks.push([0.3 + i * 0.2, () => {
      const c = foes(a.pos, 20).filter(e => (count.get(e) || 0) < 3).sort((p, q) => (count.get(p) || 0) - (count.get(q) || 0) || dist(a, p) - dist(a, q));
      const tg = c[0]; if (!tg) return;
      count.set(tg, (count.get(tg) || 0) + 1); n++;
      V.set(a.pos.x, a.pos.y + 1.2, a.pos.z);
      const side = n % 2 ? 1 : -1, d = dist(a, tg) || 1, nx = (tg.pos.x - a.pos.x) / d, nz = (tg.pos.z - a.pos.z) / d;
      a.pos.x = tg.pos.x + nx * 1.8 + -nz * side * 0.6; a.pos.z = tg.pos.z + nz * 1.8 + nx * side * 0.6; a.pos.y = heightAt(a.pos.x, a.pos.z); // 穿過敵人
      V2.set(a.pos.x, a.pos.y + 1.2, a.pos.z); fxTracer(V, V2, 0xffffff); face(a, tg.pos.x, tg.pos.z);
      audio.play('swing', 0.7); hit(tg, 150, a, 0.4);
    }]);
    seq(a, 0.3 + 7 * 0.2 + 0.25, marks);
    return true;
  },
  // 劉備：治療與激勵
  liubei(a, s) {
    shout(a, s); a.skillPose = 'raise';
    seq(a, 1.2, [
      [0.45, () => {
        audio.play('quest', 0.7); fxRing(a.pos.x, a.pos.z, 20, 0x8aff9a, 0.9);
        const P = G.player;
        for (const o of G.actors) if (o.alive && o.faction === 'ally' && !o.def.noncombat && dist(a, o) < 20) {
          o.hp = Math.min(o.maxHp, o.hp + o.maxHp * 0.4); V.set(o.pos.x, o.pos.y + 1.4, o.pos.z); fxBurst(V, 0x7dffa0, 10, 2.5, 0.7, 0.14);
        }
        if (P.alive && dist(a, P) < 20) { P.hp = Math.min(P.maxHp, P.hp + 35); G.ui.msg('劉備的激勵讓你恢復了 35 點生命；友軍 12 秒內攻擊提升。', 'get'); }
        G.allyBuffT = G.now + 12;
      }],
    ]);
    return true;
  },
  // 曹操：召來虎豹騎
  caocao(a, s) {
    const f = foes(a.pos, 40); if (!f.length) return '附近沒有敵人。';
    shout(a, s); face(a, f[0].pos.x, f[0].pos.z); a.skillPose = 'raise';
    seq(a, 1.0, [
      [0.4, () => {
        audio.play('horn', 0.9); audio.play('neigh', 0.7);
        for (let i = 0; i < 3; i++) {
          const ang = a.yaw + Math.PI + (i - 1) * 0.7, x = a.pos.x + Math.sin(ang) * 7, z = a.pos.z + Math.cos(ang) * 7;
          const c = new Actor('sq_hubao', x, z, { recruited: true }); c.recruited = false; c.follow = false; c.roam = true; c.summonT = 25; c.target = f[i % f.length]; c.alert = 30; summons.push(c);
          V.set(x, heightAt(x, z) + 1, z); fxBurst(V, 0xb8a888, 16, 4, 0.7, 0.3);
        }
      }],
    ]);
    return true;
  },
  // 孫堅：躍入敵陣
  sunjian(a, s) {
    const f = foes(a.pos, 28); if (!f.length) return '附近沒有敵人。';
    const tg = f[0], sx = a.pos.x, sz = a.pos.z, d = dist(a, tg) || 1, k = Math.max(0, d - 1.6) / d;
    const ex = sx + (tg.pos.x - sx) * k, ez = sz + (tg.pos.z - sz) * k;
    shout(a, s); face(a, tg.pos.x, tg.pos.z); a.skillPose = 'raise';
    seq(a, 1.15, [
      [0.75, () => {
        a.skillPose = 'slam'; a.skillY = 0; audio.play('explosion', 0.5); audio.play('clang', 0.8);
        fxRing(a.pos.x, a.pos.z, 6.5, 0xff8a3a); V.set(a.pos.x, a.pos.y + 0.3, a.pos.z); fxBurst(V, 0x9a8a6a, 26, 6, 0.8, 0.28);
        for (const e of foes(a.pos, 6)) hit(e, 200, a, 1.6);
        if (dist(a, G.player) < 30) G.player.shake = Math.max(G.player.shake, 0.22);
      }],
    ], t => {
      if (t > 0.25 && t < 0.75) { const u = (t - 0.25) / 0.5; a.pos.x = lerp(sx, ex, u); a.pos.z = lerp(sz, ez, u); a.skillY = Math.sin(u * Math.PI) * 3.2; }
    });
    return true;
  },
};
const summons = [];

// 玩家下令：依序讓準備好的名將出招（一次一位）
export function commandSkill() {
  const gens = skillGenerals();
  if (!gens.length) { G.ui.msg('沒有同行的名將。招攬關羽、張飛等名將同行後，才能下令發動絕技。', 'info'); return false; }
  const ready = gens.filter(a => (a.skillCd || 0) <= 0 && !a.skillBusy && !(a.stunT > 0));
  if (!ready.length) { G.ui.msg('名將絕技冷卻中：' + gens.map(a => `${a.name} ${Math.ceil(a.skillCd || 0)} 秒`).join('、'), 'info'); return false; }
  let why = '';
  for (const a of ready) {
    const s = SKILLS[a.id], r = CAST[a.id](a, s);
    if (r === true) { a.skillCd = s.cd; G.ui.dirty = true; return true; }
    why = r;
  }
  G.ui.msg(why || '現在無法發動。', 'info');
  return false;
}
export function updateSkills(dt) {
  for (const a of G.actors) if (a.skillCd > 0) { a.skillCd -= dt; if (a.skillCd <= 0 && a.follow && a.alive) { a.skillCd = 0; G.ui.dirty = true; } }
  for (let i = summons.length - 1; i >= 0; i--) { // 召來的援軍時間到就退場
    const c = summons[i]; c.summonT -= dt;
    if (!c.alive) { summons.splice(i, 1); continue; }
    if (c.summonT <= 0) {
      V.set(c.pos.x, c.pos.y + 1, c.pos.z); fxBurst(V, 0xb8a888, 18, 4, 0.7, 0.3);
      c.alive = false; c.gone = true; G.scene.remove(c.m.root); summons.splice(i, 1);
    }
  }
  // 第一次有名將同行時提示
  if (!G.flags.skillTip && skillGenerals().length) { G.flags.skillTip = true; G.ui.msg(G.touch ? '💡 名將同行時，點快捷列的 ★ 絕技鍵可以下令他發動絕技（各有冷卻）。' : '💡 名將同行時，按 Q 可以下令他發動絕技（各有冷卻）。', 'quest'); }
}
// HUD／手機按鍵用：目前可用的絕技數與最短冷卻
export function skillStatus() {
  const gens = skillGenerals(); if (!gens.length) return null;
  const ready = gens.filter(a => (a.skillCd || 0) <= 0).length;
  return { n: gens.length, ready, wait: ready ? 0 : Math.ceil(Math.min(...gens.map(a => a.skillCd || 0))) };
}
