// 軍火訂單與聲望：主公與糜竺會下訂單，準時交貨得錢與聲望，逾期扣聲望
import { G } from './state.js';
import { ITEMS } from './data.js';
import { audio } from './audio.js';
import { rnd, rndInt, pick } from './util.js';

export const ISSUERS = { liubei: { n: '劉備', stage: 1 }, mizhu: { n: '糜竺', stage: 1 }, caocao: { n: '曹操', stage: 2 }, sunjian: { n: '孫堅', stage: 2 } };
const VALUE = { arrow: 3, shell: 8, rifleAmmo: 9, grenade: 70, medicine: 45, powder: 15, cooked: 12 };
const POOL = {
  liubei: [['arrow', 12, 24], ['shell', 6, 12], ['grenade', 1, 3], ['medicine', 2, 3], ['cooked', 3, 6]],
  caocao: [['rifleAmmo', 10, 20], ['grenade', 2, 4], ['shell', 12, 18]],
  sunjian: [['grenade', 2, 4], ['shell', 12, 18], ['powder', 6, 10]],
  mizhu: [['powder', 5, 10], ['grenade', 1, 3], ['cooked', 4, 6], ['medicine', 2, 4]],
};
const LINES = {
  liubei: '軍中弟兄缺{item}，先生可否代為籌措？',
  caocao: '操要一批{item}，價錢好說——但誤了期，休怪操翻臉。',
  sunjian: '江東兒郎要{item}，越快越好！',
  mizhu: '有位大主顧想買{item}，在下居中牽線，利潤分你大頭。',
};

export const OR = G.orders = { active: [], offers: {}, rep: { liubei: 0, caocao: 0, sunjian: 0, mizhu: 0 }, next: 1 };
export function loadOrders(o) { if (o) { Object.assign(OR, o); OR.rep = { liubei: 0, caocao: 0, sunjian: 0, mizhu: 0, ...(o.rep || {}) }; } }

// 聲望等級：信賴 9 折、摯友 8 折並可招募精銳
export function repTier(id) {
  const r = OR.rep[id] || 0;
  return r >= 35 ? { n: '摯友', disc: 0.8, elite: true } : r >= 15 ? { n: '信賴', disc: 0.9 } : { n: '普通', disc: 1 };
}
export const price = (id, coin) => Math.round(coin * repTier(id).disc);
export const MAX_ACTIVE = 3;

const fmt = o => `${ITEMS[o.item].i}${ITEMS[o.item].n} ×${o.qty}`;
export const orderText = o => `${fmt(o)}　🪙${o.reward}・第 ${o.due} 日前`;

export function offerFor(id) {
  if (!ISSUERS[id] || G.stage < ISSUERS[id].stage) return null;
  if (id === 'caocao' && G.flags.caoHostile) return null; // 長坂坡之後曹操成了敵人
  let f = OR.offers[id];
  if (!f || f.day !== G.day) {
    const [item, a, b] = pick(POOL[id]), qty = rndInt(a, b);
    const reward = Math.round(VALUE[item] * qty * (1.6 + G.stage * 0.12) / 5) * 5;
    f = OR.offers[id] = { day: G.day, order: { id: OR.next++, from: id, item, qty, reward, rep: qty * VALUE[item] > 150 ? 12 : 10, due: G.day + (qty * VALUE[item] > 150 ? 3 : 2) } };
  }
  return f.order;
}
export const offerLine = o => LINES[o.from].replace('{item}', fmt(o));

export function accept(id) {
  const o = offerFor(id);
  if (!o) return '目前沒有訂單。';
  if (OR.active.length >= MAX_ACTIVE) return `同時最多接 ${MAX_ACTIVE} 張訂單。`;
  OR.active.push(o); OR.offers[id].order = null; G.ui.dirty = true; audio.play('click');
  return null;
}
export const deliverable = id => OR.active.filter(o => o.from === id && G.player.count(o.item) >= o.qty);
export function deliver(id) {
  const done = deliverable(id), P = G.player;
  for (const o of done) {
    P.take(o.item, o.qty); P.give('coin', o.reward);
    const before = repTier(id).n; OR.rep[id] += o.rep; const after = repTier(id).n;
    G.ui.msg(`📜 交貨完成：${fmt(o)}，獲得 🪙${o.reward}，${ISSUERS[id].n}聲望 +${o.rep}`, 'get');
    if (after !== before) G.ui.msg(`🤝 與${ISSUERS[id].n}的關係提升為「${after}」！` + (after === '摯友' ? (id === 'mizhu' ? '商攤 8 折。' : '可招募精銳兵種，招兵 8 折。') : (id === 'mizhu' ? '商攤 9 折。' : '招兵 9 折。')), 'quest');
  }
  OR.active = OR.active.filter(o => !done.includes(o));
  if (done.length) { audio.play('coin'); G.ui.dirty = true; G.save(); }
  return done;
}
// 每秒檢查逾期
export function checkOrders() {
  const late = OR.active.filter(o => G.day > o.due);
  for (const o of late) {
    OR.rep[o.from] = Math.max(0, OR.rep[o.from] - 6);
    G.ui.msg(`📜 訂單逾期：${ISSUERS[o.from].n}的 ${fmt(o)}，聲望 -6`, 'warn');
  }
  if (late.length) { OR.active = OR.active.filter(o => !late.includes(o)); G.ui.dirty = true; }
}
