// 存檔槽選單：讀取、開始新遊戲、存檔／另存、刪除，以及雲端同步狀態；標題頁的「繼續遊戲」與返回標題頁
import { G } from './state.js';
import { SLOTS, info, read, remove, anySaved, latest, cloudInfo, onCloud, CLOUD_TEXT, syncAll, flushCloud, cloudSignIn, cloudSignOut, cloudReset } from './saves.js';
import { icon, esc } from './icons.js';

const $ = id => document.getElementById(id);
let mode = 'load', from = 'start', armed = null, armT = 0;
const t0 = Date.now();

const SUB = {
  load: '選擇要讀取的存檔。',
  new: '選一個存檔槽開始新遊戲；已經有存檔的槽會被覆蓋。',
  save: '把目前的進度存到這個槽，之後的自動存檔也會存在這裡。',
};
const TITLE = { load: '存檔槽', new: '開始新遊戲', save: '存檔槽・另存' };
const SHORT = { off: '雲端存檔：未啟用（進度存在這台裝置）', signedout: '雲端存檔：尚未登入（到「存檔槽」登入後自動同步）', connecting: '雲端存檔：連線中……', ready: '雲端存檔：已連線', syncing: '雲端存檔：同步中……', error: '雲端存檔：暫時連不上，稍後自動重試', denied: '雲端存檔：Firebase 不允許寫入，進度只存在這台裝置' };

const fmtPlay = s => { const m = Math.floor(s / 60); return m < 1 ? '不到 1 分鐘' : m < 60 ? `${m} 分鐘` : `${Math.floor(m / 60)} 小時 ${m % 60} 分`; };
const fmtTs = ts => { if (!ts) return ''; const d = new Date(ts), p = n => String(n).padStart(2, '0'); return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`; };
const cloudOn = () => { const c = cloudInfo(); return !!c.auth && c.state !== 'denied' && c.state !== 'signedout'; };
const blocked = () => { const c = cloudInfo(); return (c.state === 'connecting' || c.state === 'syncing') && Date.now() - t0 < 6000; }; // 剛開機時等一下雲端同步，避免先讀到舊進度

// ---------- 標題頁 ----------
export function refreshTitle() {
  const b = $('btn-continue'), n = latest(), c = cloudInfo();
  if (b) {
    b.classList.toggle('hidden', !n);
    if (n) {
      const s = info(n), lb = blocked() ? '同步雲端存檔中……' : `存檔 ${n}・第 ${s.day} 日${s.chap ? '・' + s.chap : ''}`;
      b.innerHTML = `繼續遊戲<small>${esc(lb)}</small>`; b.disabled = blocked();
    }
  }
  const t = $('cloud-title'); if (t) t.innerHTML = `${icon('cloud')}${SHORT[c.state] || ''}`;
  const sl = $('btn-slots'); if (sl) sl.disabled = false;
}

// ---------- 存檔槽選單 ----------
export function openSlots(m, origin) {
  const mm = $('cloud-msg'); if (mm) mm.textContent = '';
  mode = m; from = origin || (G.started ? 'pause' : 'start'); disarm();
  G.ui.open('slots'); render();
}
function disarm() { armed = null; clearTimeout(armT); }
function arm(k) { armed = k; clearTimeout(armT); armT = setTimeout(() => { armed = null; if (G.menu === 'slots') render(); }, 3000); render(); }

function cloudBadge(n, s) {
  const c = cloudInfo();
  if (!c.auth) return `<span class="cl off">${icon('cloud')}${c.state === 'signedout' ? '未登入雲端，僅存這台裝置' : '僅存這台裝置'}</span>`;
  if (c.state === 'denied') return `<span class="cl warn">${icon('cloud')}Firebase 不允許寫入</span>`;
  const r = c.slot[n];
  if (r === 'err') return `<span class="cl warn">${icon('cloud')}同步失敗（存檔太大或網路問題）</span>`;
  if (r === 'pulled') return `<span class="cl ok">${icon('cloud')}已從雲端更新</span>`;
  if (r === 'synced' || r === 'pushed') return `<span class="cl ok">${icon('cloud')}已同步到雲端</span>`;
  return `<span class="cl off">${icon('cloud')}等待同步</span>`;
}
function render() {
  const box = $('slots-list'), c = cloudInfo(); box.innerHTML = '';
  $('slots-title').textContent = TITLE[mode]; $('slots-sub').textContent = SUB[mode];
  for (let n = 1; n <= SLOTS; n++) {
    const s = info(n), cur = G.started && G.slot === n;
    const row = document.createElement('div'); row.className = 'svslot' + (s.empty ? ' empty' : '') + (cur ? ' cur' : '');
    const main = s.empty ? `<b>（空的存檔槽）</b>` :
      `<b>第 ${s.day} 日${s.chap ? `　${esc(s.chap)}・${esc(s.title)}` : ''}</b><div class="sub">${s.rank ? `官職 ${esc(s.rank)}　` : ''}遊玩 ${fmtPlay(s.play)}　存檔於 ${fmtTs(s.ts)}</div>`;
    row.innerHTML = `<div class="no">${n}<small>${cur ? '目前' : '存檔'}</small></div><div class="main">${main}${s.empty ? '' : cloudBadge(n, s)}</div><div class="acts"></div>`;
    const acts = row.querySelector('.acts');
    const btn = (label, fn, cls = '') => { const b = document.createElement('button'); b.innerHTML = label; if (cls) b.className = cls; b.onclick = fn; acts.appendChild(b); return b; };
    if (mode === 'load') {
      if (!s.empty) {
        btn('讀取', () => { disarm(); const sv = read(n); if (sv) G.startGame(sv, n); });
        armed === 'del' + n ? btn('確定刪除？', () => { disarm(); remove(n); render(); refreshTitle(); }, 'warn') : btn('刪除', () => arm('del' + n), 'ghost');
      }
    } else if (mode === 'new') {
      if (s.empty || armed === 'new' + n) btn(s.empty ? '在此開始' : '確定覆蓋？', () => { disarm(); G.startGame(null, n); }, s.empty ? '' : 'warn');
      else btn('在此開始', () => arm('new' + n));
    } else { // save
      if (s.empty || cur) btn(cur ? '存檔' : '存到這裡', () => { if (G.saveTo(n)) { disarm(); render(); } });
      else if (armed === 'sv' + n) btn('確定覆蓋？', () => { if (G.saveTo(n)) { disarm(); render(); } }, 'warn');
      else btn('存到這裡', () => arm('sv' + n));
    }
    box.appendChild(row);
  }
  updateCloudLine();
}
function updateCloudLine() {
  const c = cloudInfo(), el = $('cloud-state'); if (!el) return;
  const who = c.auth && c.auth.email ? `（${esc(c.auth.email)}）` : '';
  el.innerHTML = `${icon('cloud')}${esc(CLOUD_TEXT[c.state] || '')}${who}${c.lastOk && c.auth && c.state !== 'denied' ? `（上次同步 ${fmtTs(c.lastOk)}）` : ''}`;
  const busy = c.state === 'syncing' || c.state === 'connecting';
  $('cloud-form').classList.toggle('hidden', c.state !== 'signedout');
  $('cloud-sync').classList.toggle('hidden', !c.auth || c.state === 'denied' || c.state === 'signedout'); $('cloud-sync').disabled = busy;
  $('cloud-logout').classList.toggle('hidden', !c.auth || c.state === 'signedout');
}
export function pauseLine() {
  const el = $('pause-slot'); if (!el) return;
  el.textContent = G.slot ? `進度存在「存檔 ${G.slot}」${cloudOn() ? '，並自動同步到雲端' : '（這台裝置）'}。` : '進度會自動儲存。';
}

// ---------- 返回標題頁 ----------
// 先存檔、等雲端上傳完（最多 4 秒），再重新載入頁面回到標題畫面
let leaving = false;
async function toTitle() {
  if (leaving) return; leaving = true;
  if (G.started) { G.save({ now: true }); G.ui.msg('存檔中，即將返回標題頁……', 'info'); }
  await flushCloud(4000);
  location.reload();
}

export function initSlots() {
  G.toTitle = toTitle; G.pauseLine = pauseLine; G.cloudOn = cloudOn; G.slotsBack = () => { disarm(); G.ui.open(from); };
  const confirmBtn = (id, label) => {
    const b = $(id); if (!b) return; let t = 0, orig = b.innerHTML;
    b.onclick = () => {
      if (b.dataset.armed) { clearTimeout(t); return toTitle(); }
      b.dataset.armed = 1; b.innerHTML = label; b.classList.add('warn');
      t = setTimeout(() => { delete b.dataset.armed; b.innerHTML = orig; b.classList.remove('warn'); }, 3000);
    };
  };
  confirmBtn('btn-home', '確定返回？會先自動存檔'); confirmBtn('btn-home2', '確定返回標題頁？');
  $('btn-title').onclick = toTitle;
  $('btn-slots').onclick = () => openSlots('load', 'start');
  $('btn-slots2').onclick = () => openSlots('save', 'pause');
  $('slots-back').onclick = () => G.slotsBack();
  const msg = (t, cls = '') => { const m = $('cloud-msg'); m.textContent = t; m.className = 'cloud-line ' + cls; };
  let busy = false;
  const auth = async create => {
    if (busy) return; const email = $('cloud-email').value.trim(), pass = $('cloud-pass').value;
    if (!email || !pass) return msg('請輸入 Email 和密碼。', 'warn');
    busy = true; msg(create ? '註冊中……' : '登入中……');
    const err = await cloudSignIn(email, pass, create); busy = false;
    if (err) return msg(err, 'warn');
    $('cloud-pass').value = ''; msg(create ? '註冊成功，已登入。' : '登入成功。', 'ok'); render(); refreshTitle();
  };
  $('cloud-form').onsubmit = e => { e.preventDefault(); auth(false); };
  $('cloud-signup').onclick = () => auth(true);
  $('cloud-forgot').onclick = async () => {
    const email = $('cloud-email').value.trim(); if (!email) return msg('先在上面輸入 Email，再按「忘記密碼」。', 'warn');
    const err = await cloudReset(email); msg(err || '已寄出重設密碼的信，請到信箱查看。', err ? 'warn' : 'ok');
  };
  $('cloud-logout').onclick = async () => { await cloudSignOut(); msg('已登出。這台裝置上的存檔還在。'); render(); refreshTitle(); };
  $('cloud-sync').onclick = () => { syncAll().then(() => { if (G.menu === 'slots') render(); refreshTitle(); }); };
  onCloud(() => { refreshTitle(); if (G.menu === 'slots') render(); });
  $('btn-continue').onclick = () => { const n = latest(), sv = n && read(n); if (sv) G.startGame(sv, n); };
  addEventListener('visibilitychange', () => { if (document.hidden && G.started) { G.save({ now: true }); } }); // 切到背景時立刻存檔並上傳
  setTimeout(refreshTitle, 6100);
  refreshTitle();
}
