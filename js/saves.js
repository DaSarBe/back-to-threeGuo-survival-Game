// 存檔槽與雲端存檔
// ‧ 本機：3 個存檔槽存在瀏覽器 localStorage，舊版的單一存檔會自動搬到存檔 1
// ‧ 雲端：在 claude.ai 的遊戲頁面登入後，進度會同步到玩家自己的私人空間（平台的 db，每位玩家各有一份，連擁有者也看不到）
//   在其他環境（直接開檔案、GitHub Pages）沒有雲端功能，會安靜地退回只存本機
//   同步規則：同一個存檔槽以「最後存檔時間」較新的為準；刪除會留下標記，避免被另一台裝置還原
export const SLOTS = 3;
const OLD_KEY = 'sanguo-arms-dealer-save-v1', META_KEY = 'sanguo-save-meta-v1';
const key = n => `sanguo-save-slot${n}-v1`;
const slotList = () => Array.from({ length: SLOTS }, (_, i) => i + 1);

const meta = () => { try { return JSON.parse(localStorage.getItem(META_KEY) || '{}') || {}; } catch (e) { return {}; } };
const setMeta = m => { try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch (e) { } };

// ---------- 本機 ----------
export function read(n) {
  try { const s = JSON.parse(localStorage.getItem(key(n)) || 'null'); return s && s.v === 1 ? s : null; } catch (e) { return null; }
}
export function write(n, data) {
  try { localStorage.setItem(key(n), JSON.stringify(data)); } catch (e) { return false; }
  const m = meta(); let ch = false;
  if (m.last !== n) { m.last = n; ch = true; }
  if (m.del && m.del[n]) { delete m.del[n]; ch = true; } // 這個槽又有新存檔了，不用再刪
  if (ch) setMeta(m);
  return true;
}
export const isEmpty = n => !read(n);
export const anySaved = () => slotList().some(n => !isEmpty(n));
// 最近一次存檔的槽（依存檔時間）
export function latest() {
  let best = 0, ts = -1;
  for (const n of slotList()) { const s = read(n); if (s && (s.ts || 0) > ts) { best = n; ts = s.ts || 0; } }
  return best;
}
export function firstEmpty() { return slotList().find(isEmpty) || 0; }
// 舊版單一存檔 → 存檔 1（沒有空位就保留不動）
export function migrate() {
  let old = null; try { old = JSON.parse(localStorage.getItem(OLD_KEY) || 'null'); } catch (e) { }
  if (!old || old.v !== 1) return;
  const n = firstEmpty(); if (!n) return;
  if (!old.ts) old.ts = Date.now();
  if (write(n, old)) try { localStorage.removeItem(OLD_KEY); } catch (e) { }
}
export function info(n) {
  const s = read(n); if (!s) return { n, empty: true };
  const m = s.meta || {};
  return { n, empty: false, ts: s.ts || 0, day: m.day || s.day, stage: m.stage ?? s.stage, chap: m.chap || '', title: m.title || '', rank: m.rank || '', play: m.play || 0, diff: m.diff || '' };
}
export function remove(n) {
  try { localStorage.removeItem(key(n)); } catch (e) { }
  const m = meta(); (m.del || (m.del = {}))[n] = Date.now(); setMeta(m); // 雲端留下刪除標記
  if (cloud.ok()) pushDelete(n);
}

// ---------- 雲端 ----------
const CLOUD_MAX = 230 * 1024; // 平台單一文件上限 256 KiB
const cloud = {
  state: 'off', // off 不可用 | connecting 連線中 | ready 已連線 | syncing 同步中 | error 暫時失敗 | denied 沒有寫入權限
  slot: {}, // 各槽最近一次同步結果：synced / pulled / pushed / err
  api: null, retry: 0, dirty: {}, timer: 0, chain: Promise.resolve(), lastOk: 0,
  ok() { return !!this.api && this.state !== 'denied'; },
};
const listeners = new Set();
export const cloudInfo = () => cloud;
export function onCloud(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function setState(s) { cloud.state = s; for (const f of listeners) try { f(cloud); } catch (e) { } }
export const CLOUD_TEXT = {
  off: '雲端存檔：目前不可用。在 claude.ai 的遊戲頁面登入後會自動啟用；現在的進度只存在這台裝置。',
  connecting: '雲端存檔：連線中……',
  ready: '雲端存檔：已連線，存檔會自動同步到你的私人雲端空間。',
  syncing: '雲端存檔：同步中……',
  error: '雲端存檔：暫時連不上，進度先存在這台裝置，稍後會自動再試。',
  denied: '雲端存檔：這個帳號沒有寫入權限（需要「貢獻者」以上的分享權限），進度只存在這台裝置。',
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
const within = (p, ms) => Promise.race([Promise.resolve(p), sleep(ms).then(() => null)]);
const code = e => (e && e.code) || '';
const ref = n => cloud.api.db.collection('data/users/' + cloud.api.uid).doc('slot' + n);

// 連上雲端：沒有平台環境、未登入或沒有授權都會回 null（不是錯誤）
async function connect() {
  const c = window.claude; if (!c || !c.use) return null;
  try {
    const [db, user] = [await within(c.use('db'), 10000), await within(c.use('user'), 10000)];
    if (!db || !user || !user.id) return null;
    const uid = await within(user.id(), 6000); if (!uid) return null;
    return { db, uid: String(uid) };
  } catch (e) { return null; }
}
export async function initCloud() {
  if (cloud.api) return;
  for (let i = 0; i < 16 && !(window.claude && window.claude.use); i++) await sleep(150); // 平台環境的注入可能晚幾百毫秒
  if (!(window.claude && window.claude.use)) return; // 不在 claude.ai 頁面：維持 off，什麼都不做
  setState('connecting');
  cloud.api = await connect();
  if (!cloud.api) return setState('off');
  setState('ready'); syncAll();
}

// 文件格式：{ v, ts, meta, json（整份存檔的字串）}；刪除標記：{ v, ts, deleted: true }
async function pushDoc(n, s) {
  const json = JSON.stringify(s);
  if (json.length * 1.1 > CLOUD_MAX) { cloud.slot[n] = 'err'; return false; } // 太大就只存本機
  await ref(n).set({ v: 1, ts: s.ts || Date.now(), meta: s.meta || null, json });
  cloud.slot[n] = 'pushed'; cloud.lastOk = Date.now(); return true;
}
function pushDelete(n) {
  const ts = (meta().del || {})[n] || Date.now();
  return enqueue(async () => {
    try { await ref(n).set({ v: 1, ts, deleted: true }); const m = meta(); if (m.del) { delete m.del[n]; setMeta(m); } cloud.slot[n] = 'synced'; }
    catch (e) { fail(e); }
  });
}
// 同一份文件一次只寫一筆：全部排進同一條佇列
const enqueue = fn => (cloud.chain = cloud.chain.then(fn, fn));
function fail(e) {
  const c = code(e);
  if (c === 'invalid_argument' || c === 'not_granted' || c === 'revoked') { setState('denied'); return; }
  setState('error');
  if (cloud.retry++ < 4) setTimeout(() => { if (cloud.state === 'error') syncAll(); }, 20000 + Math.random() * 10000);
}

// 全部對一次：雲端較新就拉下來，本機較新就推上去
export function syncAll() {
  if (!cloud.api) return Promise.resolve();
  return enqueue(async () => {
    setState('syncing');
    try {
      for (const n of slotList()) {
        const snap = await ref(n).get(), c = snap.exists ? snap.data() : null, l = read(n), pend = (meta().del || {})[n];
        if (pend && (!c || pend >= (c.ts || 0))) { await ref(n).set({ v: 1, ts: pend, deleted: true }); const m = meta(); delete m.del[n]; setMeta(m); cloud.slot[n] = 'synced'; continue; }
        if (c && c.deleted) { // 另一台裝置刪了這個槽
          if (l && (l.ts || 0) > (c.ts || 0)) await pushDoc(n, l); // 但這裡之後又有新存檔
          else { if (l) try { localStorage.removeItem(key(n)); } catch (e) { } cloud.slot[n] = 'synced'; }
          continue;
        }
        const ct = c && c.json ? c.ts || 0 : 0, lt = l ? l.ts || 0 : 0;
        if (c && c.json && ct > lt) {
          let d = null; try { d = JSON.parse(c.json); } catch (e) { }
          if (d && d.v === 1) { d.ts = ct; try { localStorage.setItem(key(n), JSON.stringify(d)); } catch (e) { } cloud.slot[n] = 'pulled'; continue; }
        }
        if (l && lt > ct) await pushDoc(n, l); else cloud.slot[n] = 'synced';
      }
      cloud.retry = 0; cloud.lastOk = Date.now(); setState('ready');
    } catch (e) { fail(e); }
  });
}

// 存檔後排程上傳：一般存檔合併成每 15 秒最多一次；手動存檔或返回標題時 now = true 立刻傳
export function cloudSaved(n, now = false) {
  if (!cloud.ok()) return;
  cloud.dirty[n] = true;
  if (now) return flush();
  if (!cloud.timer) cloud.timer = setTimeout(flush, 15000);
}
export function flush() {
  clearTimeout(cloud.timer); cloud.timer = 0;
  const todo = Object.keys(cloud.dirty); cloud.dirty = {};
  if (!todo.length || !cloud.ok()) return Promise.resolve();
  return enqueue(async () => {
    try {
      for (const n of todo) { const s = read(+n); if (s) await pushDoc(+n, s); }
      setState('ready'); cloud.retry = 0;
    } catch (e) { for (const n of todo) cloud.dirty[n] = true; fail(e); }
  });
}
// 返回標題前等上傳完（最多等 ms 毫秒）
export const flushCloud = (ms = 4000) => within(flush().then(() => cloud.chain), ms);
