// 守營戰：在令旗台發起，敵軍分波來攻軍旗；可事先埋地雷、佈置隊伍。守住領賞，等級越高敵人越強
import * as THREE from 'three';
import { G } from './state.js';
import { world, heightAt, SITES } from './world.js';
import { fxBurst } from './entities.js';
import { spawnEnemy } from './chapters.js';
import { audio } from './audio.js';
import { ITEMS } from './data.js';
import { OR } from './orders.js';
import { joined } from './akai.js';
import { rnd, pick, makeLabel } from './util.js';
import { addMerit } from './ranks.js';

const MAX_LV = 5;
const DF = () => G.flags.defense || (G.flags.defense = { lv: 0, day: 0, wins: 0 });
let D = null; // { hub, name, x, z, lv, wave, waves, hp, maxHp, phase, t, foes, awayT, waveT, dir }
const V = new THREE.Vector3();

export const defenseActive = () => !!D;
export const defenseLevel = () => Math.min(MAX_LV, DF().lv + 1);
export function hubPos(id) {
  const n = world.nodeList.find(n => (n.kind === 'outpost' || n.kind === 'station') && n.id === id);
  return n ? [n.x, n.z] : null;
}
function enemyPool() {
  const s = G.stage;
  return s < 2 ? ['turban_blade', 'turban_spear', 'turban_archer', 'turban_blade'] : s < 3 ? ['turban_blade', 'xl_blade', 'xl_spear', 'xl_archer'] : s < 5 ? ['xl_blade', 'xl_spear', 'xl_archer', 'xl_blade', 'xl_cav']
    : s < 7 ? ['yuan_blade', 'yuan_spear', 'yuan_archer', 'yuan_blade', 'yuan_cav'] : ['cao_blade', 'cao_spear', 'cao_archer', 'cao_blade', 'cao_cav'];
}
const wavesFor = lv => [3, 3, 4, 4, 5][lv - 1];
const countFor = (lv, w) => Math.min(11, 3 + w + lv);
export function rewardFor(lv) { return { coin: 100 + lv * 80, rep: 2 + lv }; }

// 能不能開打（回傳原因或 null）
export function canDefend(id) {
  if (D) return '守營戰正在進行中。';
  if (G.stage < 1) return '先投奔劉備，再來守營。';
  if (G.battle) return '正在決戰中。';
  if (DF().day === G.day) return '今天已經打過一場守營戰了，弟兄們需要休整，明天再來。';
  if (!hubPos(id)) return '這裡沒有令旗台。';
  const [x, z] = hubPos(id);
  if (G.actors.some(a => a.alive && a.faction === 'enemy' && Math.hypot(a.pos.x - x, a.pos.z - z) < 45)) return '附近還有敵人，先清乾淨再說。';
  return null;
}
export function describe(id) {
  const lv = defenseLevel(), r = rewardFor(lv);
  return `【守營戰・第 ${lv} 級】\n探子回報：有一股敵軍正朝這裡來，共 ${wavesFor(lv)} 波。\n守住令旗台上的軍旗就算贏——敵兵會和擋路的守軍廝殺，沒人擋就去砍軍旗；頭上標著「破旗手」的會直奔軍旗，要優先解決。\n開戰前有 20 秒可以埋地雷、佈置隊伍（⚑ 原地堅守很好用）。\n獎賞：🪙${r.coin}、劉備聲望 +${r.rep}、補給品` + (lv < MAX_LV ? '；獲勝後下一場更難、獎賞更多。' : '。') + '\n（每天一場；離開太遠、軍旗被毀或你倒下都算失敗。）';
}

export function startDefense(id) {
  const why = canDefend(id); if (why) { G.ui.msg(why, 'warn'); return false; }
  const [x, z] = hubPos(id), lv = defenseLevel();
  const name = id === 'camp' ? '劉備軍營' : id === 'coalition' ? '聯軍大營' : SITES[id].name;
  D = { hub: id, name, x, z, lv, wave: 0, waves: wavesFor(lv), maxHp: 500 + lv * 100, hp: 500 + lv * 100, phase: 'prep', t: 20, foes: [], awayT: 0, waveT: 0, dir: rnd(Math.PI * 2), hitT: -9 };
  DF().day = G.day;
  audio.play('horn', 0.9);
  G.ui.msg(`⚔ 守營戰開始！敵軍 20 秒後抵達${name}——趁現在埋地雷、佈置隊伍。`, 'quest');
  return true;
}
function spawnPoint(dir) {
  for (let i = 0; i < 24; i++) {
    const a = dir + rnd(-0.35, 0.35) + (i > 12 ? rnd(-1.2, 1.2) : 0), d = rnd(48, 62), x = D.x + Math.cos(a) * d, z = D.z + Math.sin(a) * d, h = heightAt(x, z);
    if (h > 0.6 && h < 28 && Math.abs(x) < 470 && Math.abs(z) < 470) return [x, z];
  }
  return [D.x + Math.cos(dir) * 40, D.z + Math.sin(dir) * 40];
}
function spawnWave() {
  D.wave++; D.phase = 'fight'; D.waveT = 0;
  const n = countFor(D.lv, D.wave), pool = enemyPool(), last = D.wave === D.waves, fresh = [];
  const dirs = D.wave >= 3 || D.lv >= 3 ? [D.dir, D.dir + Math.PI * rnd(0.6, 1.4)] : [D.dir + (D.wave - 1) * rnd(0.5, 1.2)]; // 後面幾波兩面夾擊
  for (let i = 0; i < n; i++) {
    const [px, pz] = spawnPoint(dirs[i % dirs.length]);
    const a = spawnEnemy(pick(pool), px + rnd(-4, 4), pz + rnd(-4, 4), { roam: true });
    a.alert = 9999; a.siege = { x: D.x, z: D.z }; D.foes.push(a); fresh.push(a);
  }
  // 每三人有一名破旗手（至少一名）：不理守軍，直奔軍旗
  const melee = fresh.filter(a => !a.def.ranged);
  for (const a of melee.slice(0, Math.max(1, Math.floor(n / 3)))) {
    a.siegeOnly = true; a.name = '破旗手';
    const l = makeLabel('破旗手', '#ffb040'); l.material.sizeAttenuation = false; l.scale.set(0.2, 0.05, 1); l.position.y = 2.2 * a.scale + a.seat + 0.2; a.m.root.add(l);
  }
  if (last) { // 最後一波由先鋒大將帶隊
    const [px, pz] = spawnPoint(dirs[0]), id = pool.find(t => t.endsWith('_cav')) || pool[0];
    const a = spawnEnemy(id, px, pz, { roam: true });
    a.maxHp = a.hp = a.def.hp * (2 + D.lv * 0.4); a.name = '敵軍先鋒'; a.alert = 9999; a.siege = { x: D.x, z: D.z }; a.vanguard = true;
    const l = makeLabel('敵軍先鋒', '#ff6a5a'); l.position.y = 2.2 * a.scale + a.seat + 0.3; a.m.root.add(l);
    D.foes.push(a);
  }
  audio.play('horn', 0.8);
  G.ui.msg(last ? `⚠ 最後一波！敵軍先鋒親自帶隊殺來了！（第 ${D.wave}/${D.waves} 波）` : `⚠ 第 ${D.wave}/${D.waves} 波敵軍來襲！`, 'warn');
}
function clearFoes(list) { for (const a of list) if (a.alive) { V.set(a.pos.x, a.pos.y + 1, a.pos.z); fxBurst(V, 0x8a7a5a, 12, 4, 0.8, 0.3); a.alive = false; a.gone = true; G.scene.remove(a.m.root); } }
function finish(win, why) {
  const d = D; D = null; G.ui.dirty = true;
  if (!win) {
    clearFoes(d.foes); // 敵軍得手後撤走
    audio.play('hurt', 0.6);
    G.ui.msg(`✖ 守營失敗：${why}敵軍揚長而去。（明天可以再挑戰）`, 'warn');
    return;
  }
  const P = G.player, r = rewardFor(d.lv), got = [`🪙${r.coin}`];
  P.give('coin', r.coin);
  const give = (k, n) => { P.give(k, n); got.push(`${ITEMS[k].i}${ITEMS[k].n}×${n}`); };
  give('medicine', 1 + (d.lv >= 3 ? 1 : 0)); give('ration', 2 + d.lv);
  give(P.owned.rifle ? 'rifleAmmo' : P.owned.shotgun ? 'shell' : 'arrow', 8 + d.lv * 4);
  if (d.lv >= 2) give('powder', d.lv);
  if (joined() && d.lv >= 3) give('parts', 1);
  OR.rep.liubei = (OR.rep.liubei || 0) + r.rep;
  addMerit(10 + d.lv * 5, '守營成功', true);
  const st = DF(); st.wins++; if (st.lv < MAX_LV - 1 && d.lv > st.lv) st.lv = d.lv;
  audio.play('quest');
  G.ui.msg(`🏆 守營成功！${d.name}的軍旗屹立不倒（剩 ${Math.ceil(d.hp / d.maxHp * 100)}%）。`, 'quest');
  G.ui.msg(`獎賞：${got.join('、')}，劉備聲望 +${r.rep}。` + (d.lv < MAX_LV ? `下一場是第 ${Math.min(MAX_LV, d.lv + 1)} 級。` : ''), 'get');
  G.save();
}
// 敵人砍軍旗（由 Actor 的守營 AI 呼叫）
export function siegeHit(a, dmg) {
  if (!D || D.phase !== 'fight') return;
  D.hp -= dmg * 0.6;
  V.set(D.x, heightAt(D.x, D.z) + 1.4, D.z); fxBurst(V, 0xc8a060, 8, 3, 0.5, 0.16);
  if (G.now - D.hitT > 6) { D.hitT = G.now; G.ui.msg(`⚠ 軍旗正遭到攻擊！（剩 ${Math.max(0, Math.ceil(D.hp / D.maxHp * 100))}%）`, 'warn'); }
}
export function updateDefense(dt) {
  if (!D) return;
  const P = G.player;
  if (!P.alive) return finish(false, '你倒下了，');
  if (D.hp <= 0) return finish(false, '軍旗被砍倒了，');
  const away = Math.hypot(P.pos.x - D.x, P.pos.z - D.z);
  if (away > 85) { D.awayT += dt; if (D.awayT > 8) return finish(false, '你離開了營地，'); if (D.awayT - dt <= 0) G.ui.msg('⚠ 你離營地太遠了！快回去，否則視同棄守。', 'warn'); } else D.awayT = 0;
  if (D.phase === 'prep') {
    const before = Math.ceil(D.t); D.t -= dt;
    if (Math.ceil(D.t) !== before && D.t > 0 && D.t <= 3) audio.play('click', 0.5);
    if (D.t <= 0) spawnWave();
    return;
  }
  D.waveT += dt;
  D.foes = D.foes.filter(a => a.alive);
  // 卡在遠處太久的敵人拉近一點，避免拖戲
  if (D.waveT > 70) for (const a of D.foes) if (!a.target && Math.hypot(a.pos.x - D.x, a.pos.z - D.z) > 40) { const an = rnd(Math.PI * 2); a.pos.set(D.x + Math.cos(an) * 22, 0, D.z + Math.sin(an) * 22); }
  if (!D.foes.length) {
    if (D.wave >= D.waves) return finish(true);
    D.phase = 'prep'; D.t = 12; D.hp = Math.min(D.maxHp, D.hp + D.maxHp * 0.1);
    audio.play('pickup');
    G.ui.msg(`第 ${D.wave} 波擊退！下一波 12 秒後抵達。（弟兄們趁空檔修補了軍旗）`, 'quest');
  }
}
// HUD（借用頭目血條）：軍旗耐久與波數
export function defenseHud() {
  if (!D) return null;
  const txt = D.phase === 'prep' ? `守營戰　${D.wave ? `第 ${D.wave + 1}/${D.waves} 波` : '敵軍'} ${Math.ceil(D.t)} 秒後抵達` : `守營戰　第 ${D.wave}/${D.waves} 波　敵軍剩 ${D.foes.filter(a => a.alive).length}`;
  return { text: `🚩 ${txt}`, k: Math.max(0, D.hp / D.maxHp) };
}
export function defensePos() { return D ? { x: D.x, z: D.z } : null; }
