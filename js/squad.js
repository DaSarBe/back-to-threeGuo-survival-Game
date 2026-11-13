// 招兵買馬、隊伍名額、名將解鎖、侍從
import { G } from './state.js';
import { ACTORS, ITEMS, RECRUITS, SQUAD_CAP, ATTENDANT_MAX, ATTENDANT_COST, ATTENDANTS, UNLOCK, SQUAD_CMDS, GENERAL_COST } from './data.js';
import { Actor, Attendant } from './entities.js';
import { audio } from './audio.js';
import { rnd } from './util.js';
import { price, repTier } from './orders.js';
import { rankCap } from './ranks.js';

// 名將招攬費依哪位主公的聲望打折
export const LORD_OF = { guanyu: 'liubei', zhangfei: 'liubei', zhaoyun: 'liubei', liubei: 'liubei', caocao: 'caocao', sunjian: 'sunjian' };

export const UNIT_DESC = {
  sq_spear: '長槍及遠，攻守均衡',
  sq_blade: '腳程快、出手快',
  sq_archer: '在後方放箭支援',
  sq_cav: '騎馬衝陣，血厚攻高',
  sq_shield: '持盾，極為耐打',
  sq_baier: '劉備親衛精銳，攻守俱佳',
  sq_hubao: '曹軍最精銳的重騎兵',
  sq_danyang: '江東精兵，持盾極為耐打',
};

export const squadCap = () => SQUAD_CAP[Math.min(G.stage, SQUAD_CAP.length - 1)] + rankCap(); // 官職也會增加名額
export const followers = () => G.actors.filter(a => a.alive && a.follow);
export const squadUsed = () => followers().reduce((n, a) => n + (a.def.general ? 2 : 1), 0);
export const isUnlocked = id => !UNLOCK[id] || !!G.killed[UNLOCK[id]];
export const unlockHint = id => `擊敗${ACTORS[UNLOCK[id]].name}之後，才能招攬他同行。`;
export const isHired = id => !GENERAL_COST[id] || !!(G.flags.hired && G.flags.hired[id]);
export function hireGeneral(a, useRes) {
  const c = GENERAL_COST[a.id];
  if (!isUnlocked(a.id)) return unlockHint(a.id);
  if (!pay(useRes ? c.res : { coin: price(LORD_OF[a.id], c.coin) })) return '錢或資源不夠。';
  (G.flags.hired || (G.flags.hired = {}))[a.id] = true;
  audio.play('quest'); G.ui.msg(`🤝 ${a.name} 已被招攬！之後隨時可以邀他同行。`, 'quest'); G.save();
  return null;
}

export const costText = c => Object.entries(c).map(([k, n]) => k === 'coin' ? `🪙${n}` : `${ITEMS[k].i}${ITEMS[k].n}${n}`).join(' ');
export const canPay = c => Object.entries(c).every(([k, n]) => G.player.count(k) >= n);
export function pay(c) { if (!canPay(c)) return false; for (const [k, n] of Object.entries(c)) G.player.take(k, n); return true; }

// 依序重排跟隨位置，讓隊伍散開不擠成一團
export function reslot() { followers().forEach((a, i) => { a.slotIdx = i; a.followSlot = (i % 4) * 1.3; a.holdGoal = null; }); }

export function spawnRecruit(id, x, z, hpRatio = 1) {
  const a = new Actor(id, x + rnd(-2, 2), z + rnd(-2, 2), { recruited: true });
  a.hp = a.maxHp * hpRatio; reslot(); return a;
}
export function recruit(lord, u, useRes) {
  if (squadUsed() + 1 > squadCap()) return '隊伍已滿。推進主線可以帶更多人。';
  if (u.elite && !repTier(lord.id).elite) return '與這位主公的聲望不足（需「摯友」）。';
  if (!pay(useRes ? u.res : { coin: price(lord.id, u.coin) })) return '錢或資源不夠。';
  spawnRecruit(u.id, lord.pos.x, lord.pos.z);
  audio.play('horn', 0.4); G.ui.dirty = true;
  return null;
}
export function setGeneralFollow(a, on) {
  if (on && squadUsed() + 2 > squadCap()) return `隊伍名額不足（名將佔 2 名額，目前 ${squadUsed()}/${squadCap()}）。`;
  a.follow = on; a.target = null; reslot(); if (on) audio.play('horn', 0.5);
  return null;
}

export function giveAttendant(spec, x, z, o = {}) {
  const P = G.player;
  return new Attendant(spec, x ?? P.pos.x + 2, z ?? P.pos.z + 2, o);
}
export const ownsAttendant = spec => G.attendants.some(a => a.spec === spec);
export function buyAttendant(spec, useRes, lordId) {
  if (G.attendants.length >= ATTENDANT_MAX) return `侍從最多 ${ATTENDANT_MAX} 位。`;
  if (ownsAttendant(spec)) return '你已經有這位侍從了。';
  if (!pay(useRes ? ATTENDANT_COST.res : { coin: price(lordId, ATTENDANT_COST.coin) })) return '錢或資源不夠。';
  giveAttendant(spec); audio.play('coin');
  G.ui.msg(`${ATTENDANTS[spec].role} ${ATTENDANTS[spec].name} 加入了！`, 'get');
  return null;
}

export function cycleCommand() {
  const i = SQUAD_CMDS.findIndex(c => c.id === G.squadCmd), c = SQUAD_CMDS[(i + 1) % SQUAD_CMDS.length];
  G.squadCmd = c.id;
  G.holdPos = c.id === 'hold' ? { x: G.player.pos.x, z: G.player.pos.z } : null;
  for (const a of followers()) { a.holdGoal = null; if (c.id !== 'attack') a.target = null; }
  const n = followers().length;
  G.ui.msg(`隊伍指令：${c.n}` + (n ? '' : '（目前沒有隨行部隊）') + (c.id === 'hold' ? '——部隊會守在這個位置' : c.id === 'attack' ? '——部隊會主動追擊附近敵人' : ''), 'info');
  audio.play('click'); G.ui.dirty = true;
}

export function lordRecruits(id) { const r = RECRUITS[id]; return r && G.stage >= r.stage ? r : null; }
