// 儀式演出：章節卷軸卡、戰功簿結算、官職冊封、頭目終結演出（慢動作＋毛筆大字＋朱印）
// 依序排隊播放：等畫面上沒有選單、附近沒在打仗時才出現，不會打斷戰鬥
import { G } from './state.js';
import { audio } from './audio.js';
import { QUESTS } from './quests.js';
import { RANKS, CHAPTERS, rank, rankLv, nextRank, merit, pendingRank, promote, address, closeChapter, addMerit } from './ranks.js';
import { bark } from './barks.js';
import { esc } from './icons.js';

const $ = id => document.getElementById(id);
const queue = [];
let cur = null, waitT = 0, root = null, killEl = null, killT = 0, quietT = 0;

export function initRites() {
  root = document.createElement('div'); root.id = 'rite'; root.className = 'hidden'; document.body.appendChild(root);
  killEl = document.createElement('div'); killEl.id = 'rite-kill'; killEl.className = 'hidden'; document.body.appendChild(killEl);
  root.addEventListener('click', e => { if (cur && cur.skip && !e.target.closest('button')) next(); });
  G.riteNext = () => { if (cur && (cur.skip || cur.canClose)) next(); };
}
export const riteActive = () => !!cur;
export const rite = item => queue.push(item);

// 印章：照傳統讀法排字——四字印由右行讀起、上而下（右上、右下、左上、左下），兩字印直排一行
export function seal(txt, cls = '') {
  const c = [...txt], order = c.length === 4 ? [c[2], c[0], c[3], c[1]] : c;
  return `<span class="seal ${cls} n${c.length}">${order.map(ch => `<i>${esc(ch)}</i>`).join('')}</span>`;
}

// ---------- 播放佇列 ----------
function calm() { // 附近沒有敵人在打你或你的弟兄
  const P = G.player;
  return !G.actors.some(a => a.alive && a.faction === 'enemy' && a.target && !(a.routT > 0) && Math.hypot(a.pos.x - P.pos.x, a.pos.z - P.pos.z) < 32);
}
export function updateRites(dt) {
  if (killT > 0) { killT -= dt; if (killT <= 0) killEl.classList.add('hidden'); }
  if (cur && G.menu !== 'rite') { cur = null; root.className = 'hidden'; root.innerHTML = ''; } // 被別的選單蓋掉時收起，避免卡在畫面上
  if (cur) { if (cur.auto && (cur.t += dt) >= cur.auto) next(); return; }
  if (!G.started) return;
  // 沒有其他儀式排隊時，看看是否該升官（斬將後幾秒內先不檢查，讓戰功簿先出來）
  if (!queue.length && G.now - (G.bossT || -99) > 8 && pendingRank() >= 0 && !G.menu) queue.push({ type: 'promote' });
  if (queue.length && queue[0].now && !G.menu) { show(queue.shift()); return; } // 開場卷軸：動畫一結束立刻展開
  if (!queue.length || G.menu || G.slow || killT > 0) { waitT = 0; return; }
  waitT += dt;
  if (!calm() && waitT < 25) return; // 還在打仗就再等等（最多 25 秒）
  quietT += dt; if (quietT < 0.6) return; quietT = 0;
  show(queue.shift());
}
function open(html, o = {}) {
  cur = { t: 0, ...o };
  G.menu = 'rite'; G.unlockPointer && G.unlockPointer(); document.body.classList.add('menu-open');
  if (G.resetInput) G.resetInput();
  root.innerHTML = html; root.className = 'rite-' + o.kind; void root.offsetWidth; root.classList.add('on');
  const b = root.querySelector('[data-next]');
  if (b) { b.disabled = true; setTimeout(() => { b.disabled = false; if (cur) cur.canClose = true; }, o.lock || 900); b.onclick = () => next(); }
}
function next() {
  const c = cur; if (!c) return;
  cur = null; root.className = 'hidden'; root.innerHTML = '';
  if (G.menu === 'rite') { G.menu = null; document.body.classList.remove('menu-open'); G.lockPointer && G.lockPointer(); }
  if (c.after) c.after();
}
function show(it) {
  if (it.type === 'fn') { it.fn(); return; }
  if (it.type === 'chapter') return showChapter(it.stage);
  if (it.type === 'book') return showBook(it.book);
  if (it.type === 'promote') { const lv = pendingRank(); if (lv >= 0) showPromote(lv); return; }
}

// ---------- 章節卷軸 ----------
function showChapter(stage) {
  const c = CHAPTERS[stage], q = QUESTS[stage]; if (!c || !q) return;
  audio.play('gong', 0.9); setTimeout(() => audio.play('brush', 0.6), 500);
  open(`<div class="scroll"><i class="rod l"></i><div class="paper">
    <div class="no">${c.no}</div><div class="ttl">${esc(q.t)}</div>
    <div class="sub">${c.year}　・　${c.place}</div><div class="quote">「${c.quote}」</div>
  </div><i class="rod r"></i></div><div class="tap">點擊繼續</div>`, { kind: 'chapter', auto: 4.6, skip: true });
}

// ---------- 戰功簿 ----------
const mmss = s => `${Math.floor(s / 60)} 分 ${String(Math.floor(s % 60)).padStart(2, '0')} 秒`;
function showBook(b) {
  const c = CHAPTERS[b.done], q = QUESTS[b.done];
  const row = (k, v, cls = '') => `<div class="r ${cls}"><span>${k}</span><b>${v}</b></div>`;
  audio.play('drum', 0.8);
  setTimeout(() => { if (cur && cur.kind === 'book') { audio.play('stamp', 1); root.classList.add('stamped'); } }, 900);
  open(`<div class="book"><div class="paper">
    <div class="hd"><span class="no">${c.no}</span><span class="ttl">${esc(q.t)}</span><span class="tag">戰功簿</span></div>
    <div class="body"><div class="rows">
      ${row('用時', mmss(b.time))}
      ${row('擊殺', `${b.kills} 人`)}
      ${row('對決', b.duel ? '單挑勝利' : '群戰', b.duel ? 'good' : '')}
      ${row('倒下', b.deaths ? `${b.deaths} 次` : '未曾倒下', b.deaths ? 'bad' : 'good')}
      ${row('陣亡兵卒', b.lost ? `${b.lost} 人` : '無', b.lost ? 'bad' : 'good')}
      ${row('本回戰功', `+${b.merit}`)}
    </div><div class="grade"><span>評定</span>${seal(b.grade, 'big')}</div></div>
    <div class="ft">${b.duel ? '一對一斬將，膽識過人。' : '單挑敵將可以得到更好的評定與專屬兵器。'}</div>
  </div><button data-next class="btn-p">繼續</button></div>`, { kind: 'book', lock: 1300 });
}

// ---------- 官職冊封 ----------
function showPromote(lv) {
  const r = RANKS[lv], prev = rank(), c = CHAPTERS[Math.min(G.stage, CHAPTERS.length - 1)];
  promote(lv);
  const perks = [`日俸 ${r.pay} 錢（每天清晨發放）`];
  if (r.cap) perks.push('隊伍名額 +1');
  if (r.call !== prev.call) perks.push(`弟兄們改稱你為「${r.call}」`);
  audio.play('drumroll', 0.9);
  setTimeout(() => { if (cur && cur.kind === 'promote') { audio.play('stamp', 1); audio.play('gong', 0.7); root.classList.add('stamped'); } }, 1500);
  open(`<div class="decree"><div class="paper">
    <div class="col big">令</div>
    <div class="col">先生以海外神兵助我討賊，屢建奇功，忠勇可嘉。</div>
    <div class="col">今拜為<b>${esc(r.n)}</b></div>
    <div class="col">賜印綬一方，日俸${r.pay}錢。</div>
    <div class="col sign">${c.year.split('（')[0]}　劉備</div>
    ${seal(r.seal, 'stamp')}
  </div><div class="side"><div class="new">官拜　<b>${esc(r.n)}</b></div><div class="d">${esc(r.d)}</div>
    <ul>${perks.map(p => `<li>${esc(p)}</li>`).join('')}</ul>
    <button data-next class="btn-p">領命謝恩</button></div></div>`, {
    kind: 'promote', lock: 1700,
    after: () => { // 附近的弟兄抱拳道賀
      const P = G.player;
      for (const a of G.actors) if (a.alive && a.faction === 'ally' && !a.def.noncombat && Math.hypot(a.pos.x - P.pos.x, a.pos.z - P.pos.z) < 25) { if (a.emote && !a.horse) a.emote('salute'); a.barkCd = 0; }
      const near = G.actors.find(a => a.alive && a.faction === 'ally' && !a.def.noncombat && Math.hypot(a.pos.x - P.pos.x, a.pos.z - P.pos.z) < 25);
      if (near && G.sayLine) G.sayLine(near, `恭喜${address()}！`);
      G.ui.msg(`官拜「${r.n}」。日俸 ${r.pay} 錢${r.cap ? '，隊伍名額 +1' : ''}。`, 'quest');
    },
  });
}

// ---------- 頭目終結演出 ----------
export function killCam(boss, fled) {
  const verb = fled ? '退' : '斬';
  G.slow = { t: 0, hold: 0.9, dur: 1.8 }; G.bossT = G.now;
  audio.play('gong', 1); audio.play('drum', 1);
  killEl.innerHTML = `<div class="kc"><span class="v">${verb}</span><span class="nm">${esc(boss.name)}</span>${seal(fled ? '擊退' : '大捷', 'stamp')}</div>`;
  killEl.className = ''; void killEl.offsetWidth; killEl.classList.add('on');
  setTimeout(() => audio.play('stamp', 0.9), 650);
  killT = 2.6;
  // 附近敵兵潰散，弟兄們歡呼
  const P = G.player;
  for (const a of G.actors) {
    if (!a.alive) continue;
    const d = Math.hypot(a.pos.x - boss.pos.x, a.pos.z - boss.pos.z);
    if (a.faction === 'enemy' && !a.def.boss && d < 45) { a.routT = 9 + Math.random() * 3; a.target = null; a.siege = null; if (Math.random() < 0.35) bark(a, 'rout', 1); }
    else if (a.faction === 'ally' && !a.def.noncombat && Math.hypot(a.pos.x - P.pos.x, a.pos.z - P.pos.z) < 35) { a.cheer = 1.6; if (Math.random() < 0.3) bark(a, 'cheer', 1); }
  }
}

// 主線推進時排入：上一回的戰功簿 → 升官（若有）→（赤壁後）結局 → 新一回的卷軸
export function onStageRites(done, extra) {
  addMerit(20, '完成這一回', true);
  if (done > 0) rite({ type: 'book', book: closeChapter(done) }); else closeChapter(done);
  if (pendingRank() >= 0) rite({ type: 'promote' });
  if (extra) rite({ type: 'fn', fn: extra });
  rite({ type: 'chapter', stage: done + 1 });
}
export { rankLv, nextRank, merit };
