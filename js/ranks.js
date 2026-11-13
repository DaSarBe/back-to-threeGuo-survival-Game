// 官職與戰功：殺敵、斬將、單挑、完成章節、守營、交貨都會累積戰功，達到門檻就由劉備冊封新官職
// 每章另記一份戰功簿（用時、擊殺、單挑、倒下、陣亡兵卒），章節結束時結算評定
import { G } from './state.js';

export const RANKS = [
  { n: '白身', seal: '白身', pay: 0, call: '先生', d: '一介平民，以火器助劉備討賊。' },
  { n: '鄉勇隊正', seal: '鄉勇隊正', need: 40, pay: 20, call: '先生', d: '統領鄉勇一隊，初露頭角。' },
  { n: '軍司馬', seal: '軍司馬印', need: 120, pay: 40, cap: 1, call: '司馬', d: '掌一軍兵馬調度。' },
  { n: '別部司馬', seal: '別部司馬', need: 240, pay: 60, call: '司馬', d: '另領一部，可自行出征。' },
  { n: '騎都尉', seal: '騎都尉印', need: 400, pay: 80, cap: 1, call: '都尉', d: '統率騎兵，位比校尉。' },
  { n: '中郎將', seal: '中郎將印', need: 580, pay: 110, call: '將軍', d: '宿衛統兵之將，名動一方。' },
  { n: '偏將軍', seal: '偏將軍印', need: 800, pay: 140, cap: 1, call: '將軍', d: '位列將軍，獨當一面。' },
  { n: '蕩寇將軍', seal: '蕩寇將軍', need: 1100, pay: 180, call: '將軍', d: '掃蕩寇賊，威震天下。' },
];
// 每一回（章節）的卷軸資料：與主線 QUESTS 的索引相同
export const CHAPTERS = [
  { no: '第一回', year: '中平元年（西元 184 年）', place: '穿越之地', quote: '天下大勢，分久必合，合久必分。' },
  { no: '第二回', year: '中平元年（西元 184 年）', place: '黃巾營寨', quote: '蒼天已死，黃天當立；歲在甲子，天下大吉。' },
  { no: '第三回', year: '初平元年（西元 190 年）', place: '汜水關', quote: '威鎮乾坤第一功，轅門畫鼓響鼕鼕。' },
  { no: '第四回', year: '初平元年（西元 190 年）', place: '虎牢關', quote: '人中呂布，馬中赤兔。' },
  { no: '第五回', year: '初平三年（西元 192 年）', place: '郿塢', quote: '國賊不除，天下難安。' },
  { no: '第六回', year: '建安五年（西元 200 年）', place: '白馬・延津', quote: '袁紹舉兵南下，曹操屯兵官渡以拒之。' },
  { no: '第七回', year: '建安五年（西元 200 年）', place: '烏巢', quote: '一把火，燒盡河北十萬大軍的糧草。' },
  { no: '第八回', year: '建安十三年（西元 208 年）', place: '長坂', quote: '一聲好似轟雷震，獨退曹家百萬兵。' },
  { no: '第九回', year: '建安十三年（西元 208 年）', place: '赤壁', quote: '大江東去，浪淘盡，千古風流人物。' },
  { no: '終章', year: '建安十三年之後', place: '天下', quote: '三分天下之勢已成，亂世還在繼續。' },
];

const R = () => G.flags.rank || (G.flags.rank = initRank());
// 舊存檔沒有戰功紀錄：依目前進度估算，直接給對應官職（不補放冊封儀式）
function initRank() {
  const bosses = Object.keys(G.killed || {}).length, merit = (G.stage || 0) * 45 + bosses * 30;
  let lv = 0; for (let i = 1; i < RANKS.length; i++) if (merit >= RANKS[i].need) lv = i;
  return { merit, lv, play: 0 };
}
export const rankLv = () => R().lv;
export const rank = () => RANKS[R().lv];
export const merit = () => Math.floor(R().merit);
export const nextRank = () => RANKS[R().lv + 1] || null;
export const rankCap = () => RANKS.slice(1, R().lv + 1).reduce((n, r) => n + (r.cap || 0), 0); // 官職帶來的隊伍名額
export const address = () => rank().call; // 友軍怎麼稱呼你
export const callYou = t => (address() === '先生' || !t) ? t : String(t).replace(/先生/g, address());

let gainT = 0, gainBuf = 0, gainWhy = '';
// 增加戰功；big：值得在訊息列提示的大功
export function addMerit(n, why = '', big = false) {
  R().merit += n; C().merit += n;
  if (big && G.ui) G.ui.msg(`戰功 +${Math.round(n)}${why ? `（${why}）` : ''}`, 'get');
  if (G.ui) G.ui.dirty = true;
}
// 是否該升官（回傳新官職索引或 -1）
export function pendingRank() { const r = R(), nx = RANKS[r.lv + 1]; return nx && r.merit >= nx.need ? r.lv + 1 : -1; }
export function promote(lv) { R().lv = lv; if (G.ui) G.ui.dirty = true; if (G.save) G.save(); }

// ---------- 章節戰功簿 ----------
const C = () => G.flags.chap || (G.flags.chap = freshChap());
function freshChap() { return { stage: G.stage || 0, start: R().play || 0, kills: 0, deaths: 0, lost: 0, duel: false, excl: false, merit: 0 }; }
export const chap = C;
export function tickPlay(dt) { R().play = (R().play || 0) + dt; }
export function noteKill(byPlayer) { C().kills++; addMerit(byPlayer ? 1 : 0.5); }
export function noteDeath() { C().deaths++; }
export function noteLost() { C().lost++; }
export function noteDuel() { C().duel = true; }
export function noteExcl() { C().excl = true; }
// 結算這一回，回傳戰功簿並開新的一頁
export function closeChapter(done) {
  const c = C(), time = Math.max(0, (R().play || 0) - c.start);
  let score = 0;
  score += c.duel ? 3 : 1;
  score += c.deaths === 0 ? 2 : c.deaths === 1 ? 1 : 0;
  score += c.lost === 0 ? 1 : 0;
  score += c.kills >= 25 ? 2 : c.kills >= 10 ? 1 : 0;
  const grade = score >= 7 ? '甲上' : score >= 5 ? '甲等' : score >= 3 ? '乙等' : '丙等';
  const book = { done, time, kills: c.kills, deaths: c.deaths, lost: c.lost, duel: c.duel, excl: c.excl, merit: Math.round(c.merit), grade };
  G.flags.chap = freshChap();
  return book;
}
