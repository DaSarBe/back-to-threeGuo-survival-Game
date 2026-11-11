// 天下輿圖：地形底圖、據點、任務目標、隊伍與附近敵兵；可拖曳平移、縮放
import { G } from './state.js';
import { SITES, HALF, HOSTILE_SITES, heightAt, inSite } from './world.js';
import { QUESTS, questSite } from './quests.js';
import { allBurned } from './chapters.js';

const $ = id => document.getElementById(id);
// 敵營對應的頭目（頭目倒下即視為已平定）
const SITE_BOSS = { turban: 'zhangjiao', sishui: 'huaxiong', hulao: 'lvbu', meiwu: 'dongzhuo', baima: 'yanliang', yanjin: 'wenchou', wuchao: 'chunyuqiong', changban: 'xiahouen', chibi: 'caocao_e' };
const cleared = id => G.killed[SITE_BOSS[id]] || (id === 'wuchao' && allBurned('wuchao'));

// ---------- 地形底圖（第一次開啟時算一次） ----------
let terrain = null;
const TN = 512;
function buildTerrain() {
  const c = document.createElement('canvas'); c.width = c.height = TN;
  const g = c.getContext('2d'), img = g.createImageData(TN, TN), d = img.data, step = HALF * 2 / TN;
  const H = new Float32Array(TN * TN);
  for (let j = 0; j < TN; j++) for (let i = 0; i < TN; i++) H[j * TN + i] = heightAt(-HALF + (i + 0.5) * step, -HALF + (j + 0.5) * step);
  for (let j = 0; j < TN; j++) for (let i = 0; i < TN; i++) {
    const h = H[j * TN + i], x = -HALF + (i + 0.5) * step, z = -HALF + (j + 0.5) * step;
    let r, gr, b;
    if (h < 0) { const t = Math.min(1, -h / 1.8); r = 70 - 20 * t; gr = 128 - 20 * t; b = 160 - 10 * t; }     // 江河
    else if (h < 0.8) { r = 190; gr = 176; b = 128; }                                                       // 河灘
    else if (h < 24) { const t = h / 24; r = 82 + 40 * t; gr = 120 + 14 * t; b = 58 + 20 * t; }               // 平原
    else if (h < 50) { const t = (h - 24) / 26; r = 122 + 20 * t; gr = 128 + 6 * t; b = 104 + 20 * t; }       // 山地
    else { r = 220; gr = 222; b = 228; }                                                                    // 雪頂
    if (h >= 0 && inSite(x, z, -2)) { r = r * 0.6 + 150 * 0.4; gr = gr * 0.6 + 120 * 0.4; b = b * 0.6 + 82 * 0.4; } // 據點夯土
    // 山影：西北方光源
    const hw = H[j * TN + Math.max(0, i - 1)], hn = H[Math.max(0, j - 1) * TN + i];
    const shade = Math.max(-0.35, Math.min(0.35, ((h - hw) + (h - hn)) * 0.06));
    const k = 1 + shade, o = (j * TN + i) * 4;
    d[o] = Math.min(255, r * k); d[o + 1] = Math.min(255, gr * k); d[o + 2] = Math.min(255, b * k); d[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

// ---------- 繪製 ----------
export function drawMap(canvas, v, t = 0) {
  if (!terrain) terrain = buildTerrain();
  const g = canvas.getContext('2d'), S = canvas.width, dpr = canvas.width / (canvas.clientWidth || canvas.width);
  const span = HALF * 2 / v.zoom, k = S / span, X = x => S / 2 + (x - v.cx) * k, Z = z => S / 2 + (z - v.cz) * k;
  const P = G.player;
  g.fillStyle = '#1a140e'; g.fillRect(0, 0, S, S);
  const tp = TN / (HALF * 2);
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(terrain, (v.cx - span / 2 + HALF) * tp, (v.cz - span / 2 + HALF) * tp, span * tp, span * tp, 0, 0, S, S);
  // 格線（每 100 步）
  g.strokeStyle = 'rgba(255,240,200,.08)'; g.lineWidth = 1 * dpr;
  for (let w = -HALF; w <= HALF; w += 100) { g.beginPath(); g.moveTo(X(w), 0); g.lineTo(X(w), S); g.moveTo(0, Z(w)); g.lineTo(S, Z(w)); g.stroke(); }
  const fs = Math.max(11, Math.min(18, 11 + v.zoom * 2)) * dpr;
  const q = QUESTS[G.stage], qs = questSite(q);
  // 據點
  for (const id in SITES) {
    const s = SITES[id], x = X(s.x), z = Z(s.z), r = Math.max(6 * dpr, s.r * k);
    const hostile = HOSTILE_SITES.includes(id), done = hostile && cleared(id);
    const col = id === 'blackmarket' ? '#b070e0' : id === 'workshop' ? '#e0a040' : !hostile ? '#5ac86a' : done ? '#9a9a8a' : '#e0503a';
    g.globalAlpha = 0.28; g.fillStyle = col; g.beginPath(); g.arc(x, z, r, 0, 7); g.fill();
    g.globalAlpha = 1; g.strokeStyle = col; g.lineWidth = 2 * dpr; g.stroke();
    if (id === qs) { // 任務目標：金色脈動光環
      const pr = r + (8 + 4 * Math.sin(t * 4)) * dpr;
      g.strokeStyle = '#ffd24a'; g.lineWidth = 3 * dpr; g.beginPath(); g.arc(x, z, pr, 0, 7); g.stroke();
    }
    const mark = hostile ? (done ? '✔' : '⚔') : id === 'workshop' ? '🏭' : id === 'blackmarket' ? '◆' : id === 'spawn' ? '✧' : '⛺';
    g.font = `bold ${fs}px "Noto Serif TC","PMingLiU","Microsoft JhengHei",serif`; g.textAlign = 'center'; g.textBaseline = 'bottom';
    g.lineWidth = 4 * dpr; g.strokeStyle = 'rgba(0,0,0,.75)';
    const label = `${mark} ${s.name}`;
    g.strokeText(label, x, z - r - 3 * dpr); g.fillStyle = id === qs ? '#ffd24a' : '#f4e8c8'; g.fillText(label, x, z - r - 3 * dpr);
  }
  // 單位
  const dot = (o, col, rad) => { const x = X(o.pos.x), z = Z(o.pos.z); if (x < -10 || z < -10 || x > S + 10 || z > S + 10) return; g.fillStyle = col; g.beginPath(); g.arc(x, z, rad * dpr, 0, 7); g.fill(); g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 1 * dpr; g.stroke(); };
  for (const a of G.actors) {
    if (!a.alive) continue;
    const near = Math.hypot(a.pos.x - P.pos.x, a.pos.z - P.pos.z) < 110;
    if (a.follow) dot(a, '#7af08a', a.def.general ? 4.5 : 3.2);
    else if (a.faction === 'enemy' && near) dot(a, a.def.boss ? '#ff2a1a' : '#e8553a', a.def.boss ? 5 : 3);
  }
  for (const a of G.attendants) dot(a, '#ffe08a', 3.5);
  if (P.horse && !P.mount) dot(P.horse, '#d4a050', 4);
  // 玩家箭頭
  g.save(); g.translate(X(P.pos.x), Z(P.pos.z)); g.rotate(-P.yaw); g.scale(dpr, dpr);
  g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(0, -12); g.lineTo(8, 9); g.lineTo(0, 4); g.lineTo(-8, 9); g.closePath(); g.fill(); g.stroke(); g.restore();
  // 指北
  g.font = `bold ${16 * dpr}px serif`; g.textAlign = 'center'; g.textBaseline = 'top'; g.lineWidth = 4 * dpr; g.strokeStyle = 'rgba(0,0,0,.7)';
  g.strokeText('▲北', 30 * dpr, 10 * dpr); g.fillStyle = '#f4e8c8'; g.fillText('▲北', 30 * dpr, 10 * dpr);
}

// ---------- 全螢幕地圖 ----------
const view = { cx: 0, cz: 0, zoom: 1 };
let raf = 0;
const clampView = () => { view.zoom = Math.max(1, Math.min(6, view.zoom)); const lim = HALF - HALF / view.zoom; view.cx = Math.max(-lim, Math.min(lim, view.cx)); view.cz = Math.max(-lim, Math.min(lim, view.cz)); };
function fit() {
  const c = $('worldmap'), w = $('map-wrap'), s = Math.floor(Math.min(w.clientWidth, w.clientHeight)), dpr = Math.min(2, devicePixelRatio || 1);
  c.style.width = c.style.height = s + 'px'; c.width = c.height = Math.round(s * dpr);
}
function loop(t) {
  if (G.menu !== 'map') { raf = 0; return; }
  drawMap($('worldmap'), view, t / 1000);
  const P = G.player; $('map-pos').textContent = `座標 ${Math.round(P.pos.x)}, ${Math.round(P.pos.z)}　縮放 ×${view.zoom.toFixed(1)}`;
  raf = requestAnimationFrame(loop);
}
export function openMap() {
  if (!G.started) return;
  G.ui.open('map');
  const P = G.player; view.zoom = 2.2; view.cx = P.pos.x; view.cz = P.pos.z; clampView();
  requestAnimationFrame(() => { fit(); if (!raf) raf = requestAnimationFrame(loop); });
}
function zoomAt(f, px, py) { // 以畫面上某點為中心縮放
  const c = $('worldmap'), r = c.getBoundingClientRect(), span = HALF * 2 / view.zoom;
  const wx = view.cx + ((px - r.left) / r.width - 0.5) * span, wz = view.cz + ((py - r.top) / r.height - 0.5) * span;
  view.zoom *= f; clampView();
  const span2 = HALF * 2 / view.zoom;
  view.cx = wx - ((px - r.left) / r.width - 0.5) * span2; view.cz = wz - ((py - r.top) / r.height - 0.5) * span2; clampView();
}
export function initMapUI() {
  const c = $('worldmap'), ptrs = new Map();
  let pinch = 0;
  c.addEventListener('pointerdown', e => { c.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); pinch = 0; });
  c.addEventListener('pointermove', e => {
    const p = ptrs.get(e.pointerId); if (!p) return;
    const r = c.getBoundingClientRect(), span = HALF * 2 / view.zoom;
    if (ptrs.size === 1) { view.cx -= (e.clientX - p.x) / r.width * span; view.cz -= (e.clientY - p.y) / r.height * span; clampView(); }
    p.x = e.clientX; p.y = e.clientY;
    if (ptrs.size === 2) { // 雙指縮放
      const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch) zoomAt(d / pinch, (a.x + b.x) / 2, (a.y + b.y) / 2);
      pinch = d;
    }
  });
  const up = e => { ptrs.delete(e.pointerId); pinch = 0; };
  c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
  c.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.deltaY < 0 ? 1.2 : 1 / 1.2, e.clientX, e.clientY); }, { passive: false });
  const center = () => { const r = c.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  $('map-zin').onclick = () => zoomAt(1.4, ...center());
  $('map-zout').onclick = () => zoomAt(1 / 1.4, ...center());
  $('map-me').onclick = () => { view.cx = G.player.pos.x; view.cz = G.player.pos.z; clampView(); };
  $('map-all').onclick = () => { view.zoom = 1; view.cx = view.cz = 0; };
  $('minimap').addEventListener('click', () => { if (!G.menu) openMap(); }); // 滑鼠未鎖定時可直接點小地圖
  addEventListener('resize', () => { if (G.menu === 'map') fit(); });
}
