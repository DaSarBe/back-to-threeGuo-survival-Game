// 新手引導：新遊戲開頭一步一步帶玩家熟悉操作；可隨時跳過，也能從暫停選單重看
import { G } from './state.js';
import { audio } from './audio.js';

const $ = id => document.getElementById(id);
const GATHER = ['wood', 'iron', 'saltpeter', 'sulfur', 'herb', 'berry', 'stone', 'meat'];
// kb／touch：鍵鼠與手機各自的說明；done(s)：完成條件（s 是本步驟的累計資料）
const STEPS = [
  { kb: '用 <kbd>W A S D</kbd> 移動，移動滑鼠轉動視角；按住 <kbd>Shift</kbd> 奔跑', touch: '在<strong>左半螢幕</strong>拖曳移動（推到底就是奔跑），在<strong>右半螢幕</strong>拖曳轉動視角', done: s => s.moved > 7 },
  { kb: '走到旁邊的<strong>軍火箱</strong>前，按 <kbd>E</kbd> 打開', touch: '走到旁邊的<strong>軍火箱</strong>前，點畫面中央出現的<strong>金框提示</strong>打開', done: () => !!G.flags.crate },
  { kb: '按住<kbd>滑鼠左鍵</kbd>開火，<kbd>右鍵</kbd>瞄準，<kbd>R</kbd> 換彈。手槍的備彈無限', touch: '按住<strong>開火</strong>鍵射擊（左右各一顆），按住時也能拖曳瞄準。手槍的備彈無限', done: s => s.shots >= 3 },
  { kb: '靠近<strong>樹木、岩石或草叢</strong>，按 <kbd>E</kbd> 採集材料', touch: '靠近<strong>樹木、岩石或草叢</strong>，點<strong>金框提示</strong>採集材料', done: s => s.gathered },
  { kb: '按 <kbd>Tab</kbd> 打開背包，看看能製作什麼（硝石＋硫磺＋木炭＝黑火藥）', touch: '點右上的<strong>背包</strong>鍵，看看能製作什麼（硝石＋硫磺＋木炭＝黑火藥）', done: s => s.inv },
  { kb: '左下角是生命、飽食、水分、體力。<kbd>F</kbd> 進食、<kbd>Z</kbd> 喝水（到河邊按 E 裝水）', touch: '左上角是生命、飽食、水分、體力。下方快捷列可以<strong>進食、喝水</strong>（到河邊點提示裝水）', done: s => s.t > 9 },
  { kb: '跟著左上角的任務與小地圖上的<strong>金色標記</strong>，前往東南方的<strong>劉備軍營</strong>找劉備', touch: '跟著左上角的任務與小地圖上的<strong>金色標記</strong>，前往東南方的<strong>劉備軍營</strong>找劉備', done: () => G.stage >= 1 },
];
const TUT = () => G.flags.tut || (G.flags.tut = { i: 99 }); // 舊存檔沒有紀錄：視為已完成
let st = null, shown = -1, lastPos = null, lastMag = null, lastCur = null, flashT = 0;

export const tutorActive = () => !!G.started && TUT().i < STEPS.length;
export function startTutorial() { G.flags.tut = { i: 0 }; st = null; shown = -1; }
export function skipTutorial() {
  if (!tutorActive()) return;
  TUT().i = 99; render();
  G.ui.msg('已關閉新手引導。' + (G.touch ? '（暫停選單可以重看）' : '（按 Esc 的暫停選單可以重看）'), 'info');
}
export function toggleTutorial() { if (tutorActive()) skipTutorial(); else { startTutorial(); G.ui.msg('新手引導已重新開始。', 'info'); } syncButton(); }
export function syncButton() { const b = $('btn-tutor'); if (b) b.textContent = tutorActive() ? '關閉新手引導' : '重看新手引導'; }

function render() {
  const box = $('tutor'), i = TUT().i, on = i < STEPS.length;
  box.classList.toggle('hidden', !on);
  if (!on) { shown = -1; return; }
  if (shown === i) return;
  shown = i;
  $('tutor-n').textContent = `${i + 1}/${STEPS.length}`;
  $('tutor-t').innerHTML = G.touch ? STEPS[i].touch : STEPS[i].kb;
  box.classList.remove('done'); void box.offsetWidth; box.classList.add('pop');
}
export function updateTutorial(dt) {
  if (!G.started) return;
  const T = TUT();
  if (T.i >= STEPS.length) { if (shown !== -1) render(); return; }
  if (G.menu === 'intro' || G.menu === 'story' || G.menu === 'cutscene') { $('tutor').classList.add('hidden'); shown = -1; return; }
  const P = G.player;
  const have = () => GATHER.reduce((n, k) => n + P.count(k), 0);
  if (!st) { st = { moved: 0, shots: 0, gathered: false, inv: false, t: 0, base: have() }; lastPos = null; lastMag = null; }
  render();
  if (flashT > 0) { // 完成的打勾動畫
    flashT -= dt;
    if (flashT <= 0) { T.i++; st = null; if (T.i >= STEPS.length) { render(); G.ui.msg('🎓 新手引導完成！其他操作說明可以在開始畫面與暫停選單查看。祝你在亂世中活下去。', 'quest'); } }
    return;
  }
  if (!G.menu) {
    st.t += dt;
    if (lastPos) st.moved += Math.hypot(P.pos.x - lastPos.x, P.pos.z - lastPos.z);
    lastPos = { x: P.pos.x, z: P.pos.z };
    const mag = P.mags[P.cur];
    if (lastCur === P.cur && lastMag !== null && mag < lastMag) st.shots += lastMag - mag;
    lastMag = mag; lastCur = P.cur;
    if (!st.gathered) st.gathered = have() > st.base; // 採到新的材料
  } else if (G.menu === 'inv') st.inv = true;
  if (STEPS[T.i].done(st)) { flashT = 0.9; $('tutor').classList.add('done'); audio.play('pickup', 0.7); }
}
