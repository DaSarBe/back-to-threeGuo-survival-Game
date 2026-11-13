// 存檔槽與雲端存檔
// ‧ 本機：3 個存檔槽存在瀏覽器 localStorage，舊版的單一存檔會自動搬到存檔 1
// ‧ 雲端：Firebase（Authentication 的 Email／密碼登入 + Cloud Firestore），直接呼叫 REST API，不需要額外載入 SDK
//   每位玩家的存檔放在 users/<uid>/saves/slot1～3，由 Firestore 規則限制只有本人讀寫
//   Firebase 設定填在 js/firebase-config.js；沒填或沒登入就只存本機
//   同步規則：同一個存檔槽以「最後存檔時間」較新的為準；刪除會留下標記，避免被另一台裝置還原
import { G } from './state.js';
import { FIREBASE } from './firebase-config.js';
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

// ---------- 雲端（Firebase REST）----------
const AUTH_KEY = 'sanguo-firebase-auth-v1';
const CLOUD_MAX = 900 * 1024; // Firestore 單一文件上限 1 MiB
export const cloudConfigured = () => !!(FIREBASE && FIREBASE.apiKey && FIREBASE.projectId);
const API = {
  auth: 'https://identitytoolkit.googleapis.com/v1/accounts',
  token: 'https://securetoken.googleapis.com/v1/token',
  fs: () => `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(FIREBASE.projectId)}/databases/(default)/documents`,
};
const cloud = {
  // off 未設定 Firebase | signedout 未登入 | connecting 連線中 | ready 已連線 | syncing 同步中 | error 暫時失敗 | denied Firestore 規則不允許
  state: 'off', auth: null, // auth：{ uid, email, refresh, idToken, exp }
  slot: {}, // 各槽最近一次同步結果：synced / pulled / pushed / err
  retry: 0, dirty: {}, timer: 0, chain: Promise.resolve(), lastOk: 0,
  ok() { return !!this.auth && this.state !== 'denied' && this.state !== 'signedout'; },
};
const listeners = new Set();
export const cloudInfo = () => cloud;
export function onCloud(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function setState(s) { cloud.state = s; for (const f of listeners) try { f(cloud); } catch (e) { } }
export const CLOUD_TEXT = {
  off: '雲端存檔：這個版本沒有設定 Firebase，進度只存在這台裝置。',
  signedout: '雲端存檔：尚未登入。登入後存檔會自動同步，換裝置也能接著玩。',
  connecting: '雲端存檔：連線中……',
  ready: '雲端存檔：已連線，存檔會自動同步到你的帳號。',
  syncing: '雲端存檔：同步中……',
  error: '雲端存檔：暫時連不上，進度先存在這台裝置，稍後會自動再試。',
  denied: '雲端存檔：Firebase 不允許寫入（請檢查 Firestore 安全規則），進度只存在這台裝置。',
};

// ----- 網路：全部走 fetch，逾時 12 秒 -----
class CloudError extends Error { constructor(code, msg) { super(msg || code); this.code = code; } }
async function http(url, opts = {}, ms = 12000) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  let r;
  try { r = await fetch(url, { ...opts, signal: ctl.signal }); } catch (e) { throw new CloudError('unavailable', '連不上 Firebase'); } finally { clearTimeout(t); }
  let body = null; try { body = await r.json(); } catch (e) { }
  if (r.ok) return body;
  const msg = (body && body.error && (body.error.message || body.error.status)) || ('HTTP ' + r.status);
  if (r.status === 404) throw new CloudError('notfound', msg);
  if (r.status === 401) throw new CloudError('auth', msg);
  if (r.status === 403 || /PERMISSION_DENIED/.test(msg)) throw new CloudError('denied', msg);
  if (r.status === 429 || r.status >= 500) throw new CloudError('unavailable', msg);
  throw new CloudError('bad', msg);
}
const post = (url, data) => http(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });

// ----- 登入狀態 -----
const saveAuth = () => { try { if (cloud.auth) localStorage.setItem(AUTH_KEY, JSON.stringify({ uid: cloud.auth.uid, email: cloud.auth.email, refresh: cloud.auth.refresh })); else localStorage.removeItem(AUTH_KEY); } catch (e) { } };
function setAuth(r) { // identitytoolkit 與 securetoken 兩種回傳格式
  const refresh = r.refreshToken || r.refresh_token, idToken = r.idToken || r.id_token, uid = r.localId || r.user_id, exp = Date.now() + (+(r.expiresIn || r.expires_in) || 3600) * 1000;
  cloud.auth = { uid, email: r.email || (cloud.auth && cloud.auth.email) || '', refresh, idToken, exp }; saveAuth();
}
async function token() {
  if (!cloud.auth) throw new CloudError('auth', 'signed out');
  if (Date.now() < cloud.auth.exp - 60000) return cloud.auth.idToken;
  try {
    const r = await http(`${API.token}?key=${encodeURIComponent(FIREBASE.apiKey)}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(cloud.auth.refresh)}` });
    setAuth(r);
  } catch (e) {
    if (e.code === 'bad' || e.code === 'auth') { cloud.auth = null; saveAuth(); setState('signedout'); throw new CloudError('auth', '登入已失效'); } // 登入失效（密碼被改、帳號停用……）要重新登入
    throw e;
  }
  return cloud.auth.idToken;
}
// 登入時的錯誤訊息（給玩家看）
const AUTH_ERR = {
  EMAIL_EXISTS: '這個 Email 已經註冊過了，請改按「登入」。',
  INVALID_LOGIN_CREDENTIALS: 'Email 或密碼不正確。', INVALID_PASSWORD: 'Email 或密碼不正確。', EMAIL_NOT_FOUND: 'Email 或密碼不正確。',
  INVALID_EMAIL: 'Email 格式不正確。', MISSING_EMAIL: '請輸入 Email。', MISSING_PASSWORD: '請輸入密碼。', WEAK_PASSWORD: '密碼至少要 6 個字元。',
  OPERATION_NOT_ALLOWED: 'Firebase 還沒有啟用「電子郵件／密碼」登入方式。', TOO_MANY_ATTEMPTS_TRY_LATER: '嘗試次數太多了，請稍後再試。', USER_DISABLED: '這個帳號已被停用。',
};
const authMsg = e => e.code === 'unavailable' ? '連不上 Firebase，請檢查網路。' : (AUTH_ERR[String(e.message).split(/[ :]/)[0]] || (/API_KEY|CONFIGURATION/.test(e.message) ? '雲端設定有誤（apiKey 或專案）。' : '登入失敗：' + e.message));

// 換了帳號登入時，這台裝置上的存檔屬於上一個帳號：讓玩家決定要清掉還是上傳
function adoptLocal(uid) {
  const m = meta();
  if (m.uid && m.uid !== uid && anySaved()) {
    const wipe = typeof confirm === 'function' && confirm('這台裝置上的存檔屬於另一個帳號。\n按「確定」：清除這台的存檔，改用目前帳號的雲端存檔。\n按「取消」：保留這台的存檔，並上傳到目前帳號。');
    if (wipe) { for (const n of slotList()) try { localStorage.removeItem(key(n)); } catch (e) { } m.del = {}; }
  }
  m.uid = uid; setMeta(m);
}
async function afterSignIn(r) {
  setAuth(r); adoptLocal(cloud.auth.uid); cloud.retry = 0; cloud.slot = {}; setState('ready'); await syncAll();
}
export async function cloudSignIn(email, pass, create = false) {
  if (!cloudConfigured()) return '這個版本沒有設定 Firebase。';
  try { await afterSignIn(await post(`${API.auth}:${create ? 'signUp' : 'signInWithPassword'}?key=${encodeURIComponent(FIREBASE.apiKey)}`, { email: String(email).trim(), password: pass, returnSecureToken: true })); return ''; }
  catch (e) { return authMsg(e); }
}
export async function cloudReset(email) {
  if (!cloudConfigured()) return '這個版本沒有設定 Firebase。';
  try { await post(`${API.auth}:sendOobCode?key=${encodeURIComponent(FIREBASE.apiKey)}`, { requestType: 'PASSWORD_RESET', email: String(email).trim() }); return ''; }
  catch (e) { return authMsg(e); }
}
export async function cloudSignOut() {
  await flushCloud(3000);
  cloud.auth = null; saveAuth(); cloud.slot = {}; cloud.dirty = {}; clearTimeout(cloud.timer); cloud.timer = 0; setState('signedout'); // 本機存檔保留
}
export async function initCloud() {
  if (!cloudConfigured()) return setState('off');
  let st = null; try { st = JSON.parse(localStorage.getItem(AUTH_KEY) || 'null'); } catch (e) { }
  if (!st || !st.refresh || !st.uid) return setState('signedout');
  cloud.auth = { uid: st.uid, email: st.email || '', refresh: st.refresh, idToken: '', exp: 0 };
  setState('connecting');
  try { await token(); } catch (e) { if (cloud.auth) fail(e); return; }
  setState('ready'); syncAll();
}

// ----- Firestore 文件：users/<uid>/saves/slot<n>，欄位 { v, ts, json, deleted? } -----
const docUrl = n => `${API.fs()}/users/${encodeURIComponent(cloud.auth.uid)}/saves/slot${n}`;
async function authed(url, opts = {}) { const t = await token(); return http(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: 'Bearer ' + t } }); }
async function docGet(n) {
  let d; try { d = await authed(docUrl(n)); } catch (e) { if (e.code === 'notfound') return null; throw e; }
  const f = (d && d.fields) || {};
  return { ts: +(f.ts && f.ts.integerValue) || 0, json: f.json ? f.json.stringValue : '', deleted: !!(f.deleted && f.deleted.booleanValue) };
}
const docSet = (n, o) => authed(docUrl(n), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: {
  v: { integerValue: '1' }, ts: { integerValue: String(o.ts) },
  ...(o.deleted ? { deleted: { booleanValue: true } } : { json: { stringValue: o.json } }) } }) }); // PATCH 不帶 updateMask＝整份取代
const docDel = n => authed(docUrl(n), { method: 'DELETE' });

async function pushDoc(n, s) {
  const json = JSON.stringify(s);
  if (json.length * 1.1 > CLOUD_MAX) { cloud.slot[n] = 'err'; return false; } // 太大就只存本機
  await docSet(n, { ts: s.ts || Date.now(), json });
  cloud.slot[n] = 'pushed'; cloud.lastOk = Date.now(); return true;
}
function pushDelete(n) {
  const ts = (meta().del || {})[n] || Date.now();
  return enqueue(async () => {
    try { await docSet(n, { ts, deleted: true }); const m = meta(); if (m.del) { delete m.del[n]; setMeta(m); } cloud.slot[n] = 'synced'; }
    catch (e) { fail(e); }
  });
}
// 同一份文件一次只寫一筆：全部排進同一條佇列
const enqueue = fn => (cloud.chain = cloud.chain.then(fn, fn));
function fail(e) {
  const c = e && e.code;
  if (c === 'denied') { setState('denied'); return; }
  if (c === 'auth') { if (!cloud.auth) setState('signedout'); return; }
  setState('error');
  if (cloud.retry++ < 4) setTimeout(() => { if (cloud.state === 'error') syncAll(); }, 20000 + Math.random() * 10000);
}

// 全部對一次：雲端較新就拉下來，本機較新就推上去
export function syncAll() {
  if (!cloud.auth) return Promise.resolve();
  return enqueue(async () => {
    if (!cloud.auth) return;
    setState('syncing');
    try {
      for (const n of slotList()) {
        if (G.started && G.slot === n) continue; // 正在玩的槽不被雲端覆蓋，由自動存檔上傳
        const c = await docGet(n), l = read(n), pend = (meta().del || {})[n];
        if (pend && (!c || pend >= c.ts)) { await docSet(n, { ts: pend, deleted: true }); const m = meta(); delete m.del[n]; setMeta(m); cloud.slot[n] = 'synced'; continue; }
        if (c && c.deleted) { // 另一台裝置刪了這個槽
          if (l && (l.ts || 0) > c.ts) await pushDoc(n, l); // 但這裡之後又有新存檔
          else { if (l) try { localStorage.removeItem(key(n)); } catch (e) { } cloud.slot[n] = 'synced'; }
          continue;
        }
        const ct = c && c.json ? c.ts : 0, lt = l ? l.ts || 0 : 0;
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
export const flushCloud = (ms = 4000) => Promise.race([flush().then(() => cloud.chain), new Promise(r => setTimeout(r, ms))]);
