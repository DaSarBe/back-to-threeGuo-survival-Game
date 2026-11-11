// 新章節：官渡（白馬、延津、烏巢）、長坂坡、赤壁。依主線進度生成敵營與事件
import { G } from './state.js';
import { SITES, world, buildShips, heightAt } from './world.js';
import { Actor } from './entities.js';
import { audio } from './audio.js';
import { pickEnemy, enemyLook } from './blackmarket.js';
import { followers } from './squad.js';
import { rnd, pick } from './util.js';

const PI = Math.PI;
const Y3 = ['yuan_blade', 'yuan_spear', 'yuan_archer', 'yuan_blade'], C3 = ['cao_blade', 'cao_spear', 'cao_archer', 'cao_blade'];
const ring = (cx, cz, n, r0, r1, types) => Array.from({ length: n }, (_, i) => { const a = (i + rnd(0.6)) / n * PI * 2, r = rnd(r0, r1); return [pick(types), cx + Math.cos(a) * r, cz + Math.sin(a) * r]; });
export function spawnEnemy(id, x, z, o = {}) {
  const def = pickEnemy(id);
  return new Actor(def, x, z, def === 'en_gun' ? { ...o, look: enemyLook() } : o);
}
// 駐軍：與 main 的 G.camps 相同格式，天亮時會補員
function garrison(boss, list) {
  const camp = { boss, members: list.map(([id, x, z]) => ({ id, x, z, actor: null })) };
  if (!G.killed[boss]) for (const m of camp.members) m.actor = m.id === boss ? new Actor(m.id, m.x, m.z) : spawnEnemy(m.id, m.x, m.z);
  G.camps.push(camp);
}

const spawned = {};
// 依目前進度生成該出現的敵營（讀檔時、主線推進時都會呼叫）
export function syncChapters() {
  const s = G.stage, sp = world.spots;
  if (s >= 5 && !spawned.guandu) {
    spawned.guandu = true;
    for (const [boss, id, cav] of [['yanliang', 'baima', 2], ['wenchou', 'yanjin', 2]]) {
      const [cx, cz] = sp[id];
      garrison(boss, [[boss, cx, cz + 2], ...ring(cx, cz, 8, 6, 16, Y3), ...ring(cx, cz, 5, 19, 26, Y3), ...Array.from({ length: cav }, (_, i) => ['yuan_cav', cx + (i ? 14 : -14), cz - 12])]);
    }
  }
  if (s >= 6 && !spawned.wuchao) {
    spawned.wuchao = true;
    const [cx, cz] = sp.wuchao;
    garrison('chunyuqiong', [['chunyuqiong', cx, cz + 3], ...ring(cx, cz, 10, 8, 28, Y3), ['yuan_cav', cx - 20, cz - 16], ['yuan_cav', cx + 20, cz - 16]]);
  }
  if (s >= 7 && !spawned.cao) { spawned.cao = true; caoTurns(); }
  if (s >= 7 && G.flags.changbanDone && !G.killed.xiahouen && !spawned.xiahouen) spawnXiahouen();
  if (s >= 8 && !spawned.chibi) {
    spawned.chibi = true;
    buildShips();
    const [cx, cz] = sp.caocaoE;
    garrison('caocao_e', [...ring(cx, cz, 10, 6, 22, C3), ['cao_cav', cx + 16, cz + 14], ['cao_cav', cx + 16, cz - 14]]);
    for (const t of world.targets) if (t.kind === 'ship' && G.flags['ship' + Math.round(t.z)]) burnSaved(t);
    if (allBurned('chibi') && !G.killed.caocao_e) spawnCaocao();
  }
}
function burnSaved(t) { t.hp = 0; t.burned = true; t.mesh.visible = false; }

// 長坂坡：曹操與你反目
function caoTurns() {
  G.flags.caoHostile = true;
  const c = G.actors.find(a => a.id === 'caocao' && a.faction === 'ally');
  if (c) {
    if (c.follow) G.ui.msg('曹操：「天下英雄，唯使君與操耳……可惜了。」曹操率部離你而去。', 'warn');
    G.scene.remove(c.m.root); c.alive = false; c.gone = true; c.follow = false;
  }
  G.orders.active = G.orders.active.filter(o => o.from !== 'caocao');
}

// ---------- 可燒毀目標 ----------
export const burnedCount = id => world.targets.filter(t => t.id === id && t.burned).length;
export const totalTargets = id => world.targets.filter(t => t.id === id).length;
export const allBurned = id => totalTargets(id) > 0 && burnedCount(id) === totalTargets(id);
world.onBurn = t => {
  G.flags[(t.kind === 'ship' ? 'ship' : 'gran') + Math.round(t.z)] = true;
  audio.play('explosion', 0.5);
  const id = t.id, n = burnedCount(id), N = totalTargets(id);
  G.ui.msg(t.kind === 'ship' ? `🔥 戰船起火！（${n}/${N}）鐵索相連，火勢延燒！` : `🔥 糧倉燒起來了！（${n}/${N}）`, 'get');
  if (id === 'chibi' && n === N && !G.killed.caocao_e) setTimeout(spawnCaocao, 1500);
  if (id === 'wuchao' && n === N) { G.ui.msg('烏巢糧草盡毀！袁紹大軍軍心潰散。', 'quest'); G.checkQuest && G.checkQuest(); }
};
// 讀檔時恢復已燒毀的糧倉
export function restoreBurned() {
  for (const t of world.targets) if (t.kind === 'granary' && G.flags['gran' + Math.round(t.z)]) burnSaved(t);
}
function spawnCaocao() {
  if (spawned.caocaoE || G.killed.caocao_e) return;
  spawned.caocaoE = true;
  const [cx, cz] = world.spots.caocaoE;
  new Actor('caocao_e', cx, cz);
  G.ui.msg('曹操：「……東南風？！天亡我也！」曹操親自率虎豹騎殺出！', 'quest'); audio.play('horn');
}
function spawnXiahouen() {
  spawned.xiahouen = true;
  const [x, z] = world.spots.xiahouen;
  new Actor('xiahouen', x, z);
  for (let i = 0; i < 4; i++) spawnEnemy(pick(C3), x - 8 + rnd(-4, 4), z + rnd(-8, 8), { roam: true });
}

// ---------- 長坂橋守橋 ----------
let defend = null, hintT = {};
const DEF_TIME = 75;
export function updateChapters(dt) {
  const P = G.player, sp = world.spots;
  G.objText = null;
  // 接近目標時給一次提示
  const near = (id, r) => Math.hypot(P.pos.x - SITES[id].x, P.pos.z - SITES[id].z) < r;
  if (G.stage === 6 && near('wuchao', 70) && !hintT.wuchao) { hintT.wuchao = 1; G.ui.msg('烏巢糧倉只怕火——用燃燒彈或震天雷把糧倉全部燒掉！', 'quest'); }
  if (G.stage === 8 && near('chibi', 80) && !hintT.chibi) { hintT.chibi = 1; G.ui.msg('曹軍戰船以鐵索相連停在江上——把燃燒彈或震天雷丟到船邊，火攻連環船！', 'quest'); }
  if (G.stage === 6) G.objText = `🔥 糧倉 ${burnedCount('wuchao')}/${totalTargets('wuchao')}`;
  if (G.stage === 8 && !allBurned('chibi')) G.objText = `🔥 戰船 ${burnedCount('chibi')}/${totalTargets('chibi')}`;

  if (G.stage !== 7 || G.flags.changbanDone) { defend = null; return; }
  const [hx, hz] = sp.changbanHold, dh = Math.hypot(P.pos.x - hx, P.pos.z - hz);
  if (!defend) {
    if (P.alive && dh < 22) {
      defend = { t: DEF_TIME, wave: 0, waveT: 2 };
      G.ui.msg('🛡 守住長坂橋頭 75 秒！曹軍要過橋了！', 'quest'); audio.play('horn');
      if (followers().some(a => a.id === 'zhangfei')) G.ui.msg('張飛橫矛立馬：「燕人張翼德在此！誰敢與我決一死戰！」', 'say');
    } else G.objText = '前往長坂橋東側橋頭';
    return;
  }
  if (!P.alive || dh > 55) { defend = null; G.ui.msg('守橋失敗——回到橋頭重新布防吧。', 'warn'); return; }
  defend.t -= dt; defend.waveT -= dt;
  G.objText = `🛡 守橋：剩 ${Math.ceil(defend.t)} 秒`;
  const alive = G.actors.filter(a => a.alive && a.faction === 'enemy' && Math.hypot(a.pos.x - hx, a.pos.z - hz) < 120).length;
  if (defend.waveT <= 0 && defend.t > 8 && alive < 16) { // 場上敵兵太多時暫緩下一波，避免手機卡頓
    defend.waveT = 11; defend.wave++;
    const [wx, wz] = sp.changbanWest, n = Math.min(4 + defend.wave, 8);
    for (let i = 0; i < n; i++) { const a = spawnEnemy(defend.wave > 3 && i === 0 ? 'cao_cav' : pick(C3), wx + rnd(-6, 6), wz + rnd(-14, 14), { roam: true }); a.alert = 60; a.target = P; }
  }
  if (defend.t <= 0) {
    defend = null; G.flags.changbanDone = true;
    G.ui.msg('橋頭守住了！曹軍大將夏侯恩率親兵殺到——擊敗他！', 'quest'); audio.play('horn');
    spawnXiahouen(); G.save();
  }
}
