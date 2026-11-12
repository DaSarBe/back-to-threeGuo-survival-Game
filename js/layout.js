// 手機按鍵配置：每顆按鍵（含兵器列、小地圖、互動提示、搖桿）都能拖曳移動、調整大小；橫向與直向各存一份
import { G } from './state.js';
import { S, saveSettings } from './settings.js';
import { clamp } from './util.js';

const $ = id => document.getElementById(id);
export const ITEMS = [
  ['t-fire', '開火（右）'], ['t-fire2', '開火（左）'], ['t-aim', '瞄準'], ['t-jump', '跳躍'], ['t-r', '換彈'],
  ['tq-eat', '進食'], ['tq-drink', '喝水'], ['tq-heal', '金瘡藥'], ['tq-throw', '投擲'], ['q-cycle', '切換投擲物'], ['tq-whistle', '喚馬'], ['tq-cmd', '隊伍指令'],
  ['t-m', '背包'], ['t-p', '暫停'], ['hotbar', '兵器列'], ['ammo', '彈藥資訊'], ['prompt', '互動提示'], ['minimap', '小地圖'], ['joy', '移動搖桿'],
];
const NAME = Object.fromEntries(ITEMS);
const JOY_DEF = { land: { x: 0.2, y: 0.75, s: 1 }, port: { x: 0.38, y: 0.72, s: 1 } };
export const orient = () => innerWidth > innerHeight ? 'land' : 'port';
const layoutFor = o => (S.layout && S.layout[o]) || null;

// ---------- 套用 ----------
function place(el, v) {
  el.style.left = v.x * 100 + '%'; el.style.top = v.y * 100 + '%'; el.style.right = el.style.bottom = 'auto';
  el.style.transform = `translate(-50%,-50%) scale(${v.s})`;
}
function clear(el) { el.style.left = el.style.top = el.style.right = el.style.bottom = el.style.transform = ''; }
function joyFixed() { return !!S.joyFixed; }
function applyTo(L, fixed) {
  document.body.classList.toggle('custom-layout', !!L);
  document.body.classList.toggle('joy-fixed', fixed);
  for (const [id] of ITEMS) {
    const el = $(id); if (!el) continue;
    if (id === 'joy') {
      if (fixed) { place(el, (L && L.joy) || JOY_DEF[orient()]); el.style.display = ''; $('joyknob').style.transform = ''; }
      else if (el.dataset.fixed) clear(el);
      el.dataset.fixed = fixed ? '1' : '';
      continue;
    }
    const v = L && L[id];
    if (v) place(el, v); else clear(el);
  }
  placeHint(L && L.minimap);
}
function placeHint(custom) { // 小地圖右下角的放大圖示跟著小地圖
  const h = $('minimap-hint'); if (!h) return;
  if (!custom) { h.style.left = h.style.top = h.style.right = ''; return; }
  const r = $('minimap').getBoundingClientRect();
  h.style.right = 'auto'; h.style.left = r.right - r.width * 0.15 - 10 + 'px'; h.style.top = r.bottom - r.height * 0.15 - 10 + 'px';
}
export function applyLayout() { if (!ed) applyTo(layoutFor(orient()), joyFixed()); }

// ---------- 編輯器 ----------
let ed = null; // { o, work, def, sel, fixed, isDefault, restore, back, pointers, drag, pinch, barPos }
function measure(id) {
  const el = $(id), r = el.getBoundingClientRect();
  return { x: +((r.left + r.width / 2) / innerWidth).toFixed(4), y: +((r.top + r.height / 2) / innerHeight).toFixed(4), s: 1 };
}
export function openLayoutEditor(back) {
  const o = orient(), body = document.body;
  const restore = {
    hud: $('hud').classList.contains('hidden'), touch: $('touch').classList.contains('hidden'),
    cycle: $('q-cycle').classList.contains('hidden'), prompt: $('prompt').classList.contains('hidden'), promptHtml: $('prompt').innerHTML,
    hotbar: $('hotbar').innerHTML,
  };
  document.querySelectorAll('.menu').forEach(m => m.classList.add('hidden')); body.classList.remove('menu-open');
  for (const id of ['hud', 'touch', 'q-cycle', 'prompt', 'layout-bar']) $(id).classList.remove('hidden');
  $('prompt').textContent = '互動提示（範例）';
  if (!$('hotbar').children.length) $('hotbar').innerHTML = '<div class="slot on"></div><div class="slot"></div><div class="slot"></div>';
  G.menu = 'layout'; body.classList.add('layout-edit');
  // 先量出預設位置
  applyTo(null, false);
  const def = {}; for (const [id] of ITEMS) if (id !== 'joy') def[id] = measure(id);
  def.joy = { ...JOY_DEF[o] };
  const saved = layoutFor(o);
  const work = {}; for (const [id] of ITEMS) work[id] = { ...((saved && saved[id]) || def[id]) };
  ed = { o, work, def, sel: null, fixed: joyFixed(), isDefault: !saved, restore, back, pointers: new Map(), drag: null, pinch: null, barPos: 0 };
  applyTo(work, ed.fixed);
  $('lb-orient').textContent = o === 'land' ? '目前編輯：橫向' : '目前編輯：直向';
  syncBar(); select(null); avoid(null);
}
// 工具列自動避開：放在擋住最少按鍵的位置（選取中的按鍵權重最高）
const POS = ['top', 'mid', 'bot'];
function overlap(a, b) { return Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)); }
function avoid(sel) {
  const bar = $('layout-bar'), rects = ITEMS.filter(([id]) => id !== 'joy' || ed.fixed).map(([id]) => [$(id).getBoundingClientRect(), id === sel ? 50 : 1]);
  if (sel) { const r = bar.getBoundingClientRect(); if (!overlap(r, $(sel).getBoundingClientRect())) return; }
  let best = ed.barPos, bestA = Infinity;
  for (let i = 0; i < 3; i++) {
    bar.dataset.pos = POS[i]; const r = bar.getBoundingClientRect();
    const a = rects.reduce((s, [q, w]) => s + overlap(r, q) * w, 0);
    if (a < bestA - 1) { bestA = a; best = i; }
  }
  ed.barPos = best; syncBar();
}
function syncBar() {
  $('lb-joy').textContent = ed.fixed ? '搖桿：固定' : '搖桿：浮動';
  $('layout-bar').dataset.pos = POS[ed.barPos];
}
function select(id) {
  if (ed.sel) $(ed.sel).classList.remove('lb-sel');
  ed.sel = id && (id !== 'joy' || ed.fixed) ? id : null;
  const has = !!ed.sel;
  if (has) $(ed.sel).classList.add('lb-sel');
  $('lb-name').textContent = has ? `已選取：${NAME[ed.sel]}` : '先點選一個按鍵';
  const sz = $('lb-size'); sz.disabled = !has; sz.value = has ? ed.work[ed.sel].s : 1;
  $('lb-pct').textContent = has ? Math.round(ed.work[ed.sel].s * 100) + '%' : '';
  document.querySelectorAll('#layout-bar [data-lb="minus"],#layout-bar [data-lb="plus"],#layout-bar [data-lb="resetone"]').forEach(b => b.disabled = !has);
}
function update(id) { ed.isDefault = false; place($(id), ed.work[id]); if (id === 'minimap') placeHint(true); if (id === ed.sel) { $('lb-size').value = ed.work[id].s; $('lb-pct').textContent = Math.round(ed.work[id].s * 100) + '%'; } }
function setScale(id, s) { ed.work[id].s = +clamp(s, 0.5, 2).toFixed(2); update(id); }
function finish(save) {
  const { restore: R, back, o, work, fixed, isDefault } = ed;
  if (save) {
    S.layout = { ...(S.layout || {}) };
    if (isDefault) delete S.layout[o]; else S.layout[o] = work;
    S.joyFixed = fixed; saveSettings();
  }
  if (ed.sel) $(ed.sel).classList.remove('lb-sel');
  ed = null;
  document.body.classList.remove('layout-edit', 'lb-dragging'); $('layout-bar').classList.add('hidden');
  $('hud').classList.toggle('hidden', R.hud); $('touch').classList.toggle('hidden', R.touch); $('q-cycle').classList.toggle('hidden', R.cycle);
  $('prompt').classList.toggle('hidden', R.prompt); $('prompt').innerHTML = R.promptHtml; $('hotbar').innerHTML = R.hotbar;
  if (!$('joy').dataset.fixed) $('joy').style.display = '';
  applyLayout();
  G.menu = null; if (G.ui) G.ui.dirty = true;
  if (back) back(save);
}
function onBar(k) {
  if (!ed) return;
  const id = ed.sel;
  if (k === 'minus' && id) setScale(id, ed.work[id].s - 0.1);
  else if (k === 'plus' && id) setScale(id, ed.work[id].s + 0.1);
  else if (k === 'resetone' && id) { ed.work[id] = { ...ed.def[id] }; update(id); }
  else if (k === 'resetall') { for (const [i] of ITEMS) ed.work[i] = { ...ed.def[i] }; ed.fixed = false; applyTo(ed.work, false); ed.isDefault = true; syncBar(); select(null); }
  else if (k === 'joy') { ed.fixed = !ed.fixed; ed.isDefault = false; applyTo(ed.work, ed.fixed); syncBar(); select(ed.fixed ? 'joy' : null); }
  else if (k === 'move') { ed.barPos = (ed.barPos + 1) % 3; syncBar(); }
  if (k === 'resetone' || k === 'resetall' || k === 'joy') avoid(ed.sel);
  else if (k === 'cancel') finish(false);
  else if (k === 'done') finish(true);
}

// ---------- 拖曳／捏合 ----------
function down(e) {
  if (!ed) return;
  if (e.target.closest('#layout-bar')) return;
  e.preventDefault();
  if (e.isPrimary) ed.pointers.clear(); // 第一根手指按下時清掉殘留的觸點
  ed.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ed.pointers.size === 1) {
    const el = e.target.closest('[data-ename]');
    const id = el && el.id;
    select(id || null);
    if (ed.sel) { const v = ed.work[ed.sel]; ed.drag = { pid: e.pointerId, ox: e.clientX - v.x * innerWidth, oy: e.clientY - v.y * innerHeight }; document.body.classList.add('lb-dragging'); }
  } else if (ed.pointers.size === 2 && ed.sel) {
    const [a, b] = [...ed.pointers.values()];
    ed.pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, s0: ed.work[ed.sel].s }; ed.drag = null; document.body.classList.add('lb-dragging');
  }
}
function move(e) {
  if (!ed || !ed.pointers.has(e.pointerId)) return;
  e.preventDefault();
  ed.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ed.pinch && ed.pointers.size >= 2 && ed.sel) {
    const [a, b] = [...ed.pointers.values()];
    setScale(ed.sel, ed.pinch.s0 * Math.hypot(a.x - b.x, a.y - b.y) / ed.pinch.d0);
  } else if (ed.drag && ed.drag.pid === e.pointerId && ed.sel) {
    const v = ed.work[ed.sel];
    v.x = +clamp((e.clientX - ed.drag.ox) / innerWidth, 0.02, 0.98).toFixed(4);
    v.y = +clamp((e.clientY - ed.drag.oy) / innerHeight, 0.02, 0.98).toFixed(4);
    update(ed.sel);
  }
}
function up(e) {
  if (!ed) return;
  ed.pointers.delete(e.pointerId);
  if (ed.pointers.size < 2) ed.pinch = null;
  if (ed.drag && ed.drag.pid === e.pointerId) ed.drag = null;
  if (!ed.drag && !ed.pinch && document.body.classList.contains('lb-dragging')) { document.body.classList.remove('lb-dragging'); if (ed.sel) avoid(ed.sel); }
}

export function initLayout() {
  for (const [id, n] of ITEMS) { const el = $(id); if (el) el.dataset.ename = n; }
  document.addEventListener('pointerdown', down, { capture: true, passive: false });
  document.addEventListener('pointermove', move, { capture: true, passive: false });
  document.addEventListener('pointerup', up, true); document.addEventListener('pointercancel', up, true);
  document.querySelectorAll('#layout-bar [data-lb]').forEach(b => b.addEventListener('click', () => onBar(b.dataset.lb)));
  $('lb-size').addEventListener('input', () => { if (ed && ed.sel) setScale(ed.sel, +$('lb-size').value); });
  addEventListener('resize', () => setTimeout(applyLayout, 60));
  applyLayout();
}
export const editingLayout = () => !!ed;
export function cancelLayout() { if (ed) finish(false); }
