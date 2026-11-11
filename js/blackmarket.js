// 軍火外流：把軍火賣給黑市，錢多但敵軍會出現火銃兵，也影響結局
import { G } from './state.js';
import { ITEMS, turbanLook, xlLook, yuanLook, caoLook } from './data.js';
import { audio } from './audio.js';

export const BM = G.bm = { leak: 0, deals: 0, blueprint: false, warned: false };
export function loadBM(o) { if (o) Object.assign(BM, o); }

// 黑市收購價約是糜竺的兩倍
export const BM_PRICE = { grenade: 120, mine: 90, firebomb: 50, shell: 10, rifleAmmo: 12, powder: 25 };
export const BLUEPRINT = { coin: 1500, leak: 1500, stage: 2 };

// 外流越多，敵軍裡的火銃兵越多（最多 35%）
export const gunRate = () => BM.leak < 200 ? 0 : Math.min(0.35, 0.05 + BM.leak / 4000);
export const leakTier = () => BM.leak >= 1000 || BM.blueprint ? 2 : BM.leak >= 200 ? 1 : 0;
export const buyer = () => G.stage < 4 ? '董卓' : G.stage < 7 ? '袁紹' : '曹操';
// 火銃兵外觀跟著當時的敵軍
export const enemyLook = () => G.stage < 2 ? turbanLook : G.stage < 5 ? xlLook : G.stage < 7 ? yuanLook : caoLook;
// 依外流程度把部分敵兵換成火銃兵
export const pickEnemy = id => Math.random() < gunRate() ? 'en_gun' : id;

function afterLeak(before) {
  const t0 = before >= 1000 ? 2 : before >= 200 ? 1 : 0, t1 = leakTier();
  if (t1 > t0) G.ui.msg(t1 === 1 ? '⚠ 傳聞敵軍中開始出現仿製的火銃……' : '⚠ 敵軍已大量裝備火銃，戰場變得更加凶險。', 'warn');
  G.orders.rep.liubei = Math.max(0, G.orders.rep.liubei - 2); // 劉備風聞此事，關係變差
}
export function sellAll(item) {
  const P = G.player, n = P.count(item); if (!n) return null;
  const v = n * BM_PRICE[item], before = BM.leak;
  P.take(item, n); P.give('coin', v); BM.leak += v; BM.deals++;
  audio.play('coin'); afterLeak(before); G.save();
  return `賣出 ${ITEMS[item].i}${ITEMS[item].n}×${n}，得 🪙${v}`;
}
export function sellBlueprint() {
  if (BM.blueprint) return null;
  const before = BM.leak;
  BM.blueprint = true; BM.leak += BLUEPRINT.leak; BM.deals++;
  G.player.give('coin', BLUEPRINT.coin); G.orders.rep.liubei = Math.max(0, G.orders.rep.liubei - 15);
  audio.play('coin'); afterLeak(before); G.save();
  return `你把火器圖紙交了出去，得 🪙${BLUEPRINT.coin}。`;
}

// 結局依外流程度而定
export function ending() {
  const t = leakTier();
  if (t === 0) return { title: '天下三分', text: '曹操敗走赤壁，天下三分之勢已成。<br>你的火器始終只握在義軍手中——<br>亂世因此少流了許多血，百姓口耳相傳著「雷霆異人」的故事。<br><br>史書不會記載你的名字，但這個時代記得你。' };
  if (t === 1) return { title: '天下三分', text: '曹操敗走赤壁，天下三分之勢已成。<br>只是戰場上偶爾響起的火銃聲提醒著你：<br>有些軍火，終究流到了不該去的地方。<br><br>你賺到了錢，也欠下了一筆說不清的帳。' };
  return { title: '火器亂世', text: '曹操敗走赤壁，然而天下並未因此太平。<br>你賣出的火器已散布各方，諸侯爭相仿製——<br>往後的戰爭，比你來時更加殘酷。<br><br>你成了這個時代最富有的軍火商，<br>也成了這場浩劫的源頭。' };
}
