// 軍火工坊：建造／升級建築、自動生產、倉庫、派駐侍從、武器改良
import { G } from './state.js';
import { ITEMS, WEAPONS, RECIPES, WS_BUILD, WS_CAP, WS_CYCLE, WS_PRODUCTS, WS_RAW, GUNS, UPGRADES, upgradeCost } from './data.js';
import { SITES, buildWorkshop } from './world.js';
import { audio } from './audio.js';
import { costText, canPay, pay } from './squad.js';
import { price } from './orders.js';

export const WS = G.ws = { built: false, lv: { mill: 0, forge: 0, store: 0 }, store: {}, product: 'shell', t: WS_CYCLE, made: {}, msgT: -999, idleT: -999 };
export function loadWorkshop(o) {
  if (o) { Object.assign(WS, o); WS.lv = { mill: 0, forge: 0, store: 0, ...(o.lv || {}) }; WS.store = o.store || {}; WS.made = {}; }
  buildWorkshop(WS);
}
export function saveWorkshop() { const { built, lv, store, product, t } = WS; return { built, lv, store, product, t }; }

export const cap = () => WS_CAP[WS.lv.store];
export const stored = () => Object.values(WS.store).reduce((a, b) => a + b, 0);
export const has = (k, n = 1) => (WS.store[k] || 0) >= n;
export const workers = () => G.attendants.filter(a => a.ws);
const add = (k, n) => { WS.store[k] = (WS.store[k] || 0) + n; };
const take = (k, n) => { WS.store[k] -= n; if (WS.store[k] <= 0) delete WS.store[k]; };
const itemTxt = o => Object.entries(o).map(([k, n]) => `${ITEMS[k].i}${ITEMS[k].n}×${n}`).join('、');
export const available = () => G.stage >= 1;

// ---------- 建造 ----------
export function buildCost(key) { const b = WS_BUILD[key], lv = key === 'base' ? (WS.built ? 1 : 0) : WS.lv[key]; return lv < b.max ? b.cost[lv] : null; }
const withDisc = c => ({ ...c, coin: price('liubei', c.coin) }); // 工坊在劉備營旁，跟劉備的聲望打折
export function build(key) {
  if (!available()) return '先去劉備軍營，跟劉備談過再說。';
  if (key !== 'base' && !WS.built) return '先蓋好工坊本體。';
  const c = buildCost(key); if (!c) return '已經是最高等級。';
  if (!pay(withDisc(c))) return '錢或材料不夠。';
  if (key === 'base') WS.built = true; else WS.lv[key]++;
  buildWorkshop(WS); audio.play('craft'); audio.play('chop');
  G.ui.msg(key === 'base' ? '🏭 軍火工坊落成！可以升級火藥坊、鐵匠爐、倉庫，也能派侍從來幫忙。' : `🏭 ${WS_BUILD[key].n} 升到 ${WS.lv[key]} 級！`, 'quest');
  G.save(); return null;
}

// ---------- 自動生產（每輪 60 秒） ----------
function produce() {
  const bonus = workers().length, made = {};
  let full = false, idle = [];
  const room = n => { if (stored() + n > cap()) { full = true; return false; } return true; };
  if (WS.lv.mill) {
    let n = WS.lv.mill + bonus, did = 0;
    while (n-- > 0) {
      if (has('saltpeter') && has('sulfur') && has('charcoal') && room(2)) { take('saltpeter', 1); take('sulfur', 1); take('charcoal', 1); add('powder', 3); made.powder = (made.powder || 0) + 3; did++; }
      else if (has('wetPowder', 2) && has('wood') && room(0)) { take('wetPowder', 2); take('wood', 1); add('powder', 2); made.powder = (made.powder || 0) + 2; did++; }
      else if (has('wood', 2) && room(0)) { take('wood', 2); add('charcoal', 2); made.charcoal = (made.charcoal || 0) + 2; did++; }
      else break;
    }
    if (!did) idle.push('火藥坊缺硝石、硫磺或木材');
  }
  if (WS.lv.forge) {
    const r = RECIPES.find(x => x.id === WS.product);
    let n = WS.lv.forge + bonus, did = 0;
    while (n-- > 0) {
      const ok = Object.entries(r.need).every(([k, q]) => has(k, q));
      const gain = Object.values(r.give).reduce((a, b) => a + b, 0) - Object.values(r.need).reduce((a, b) => a + b, 0);
      if (!ok || !room(Math.max(0, gain))) break;
      for (const [k, q] of Object.entries(r.need)) take(k, q);
      for (const [k, q] of Object.entries(r.give)) { add(k, q); made[k] = (made[k] || 0) + q; }
      did++;
    }
    if (!did) idle.push(`鐵匠爐造${ITEMS[WS.product].n}的材料不足`);
  }
  for (const k in made) WS.made[k] = (WS.made[k] || 0) + made[k];
  if (full && G.now - WS.idleT > 180) { WS.idleT = G.now; G.ui.msg('🏭 工坊倉庫滿了，回去取貨或升級倉庫吧。', 'warn'); }
  else if (idle.length && !Object.keys(made).length && G.now - WS.idleT > 240) { WS.idleT = G.now; G.ui.msg(`🏭 工坊停工：${idle.join('；')}。把原料存進工坊倉庫就會自動生產。`, 'warn'); }
  if (Object.keys(WS.made).length && G.now - WS.msgT > 180) { WS.msgT = G.now; G.ui.msg(`🏭 工坊產出：${itemTxt(WS.made)}（存在工坊倉庫）`, 'get'); WS.made = {}; }
}
export function tickWorkshop(dt) {
  if (!WS.built || (!WS.lv.mill && !WS.lv.forge)) return;
  WS.t -= dt;
  if (WS.t <= 0) { WS.t = WS_CYCLE; produce(); }
}

// ---------- 倉庫 ----------
export function depositRaw() {
  const P = G.player, moved = {};
  for (const k of WS_RAW) {
    const n = Math.min(P.count(k), cap() - stored()); if (n <= 0) continue;
    P.take(k, n); add(k, n); moved[k] = n;
  }
  return Object.keys(moved).length ? `存入：${itemTxt(moved)}` : (stored() >= cap() ? '倉庫已滿。' : '身上沒有可存的原料。');
}
export function depositItem(k, n) { const P = G.player; n = Math.min(n, P.count(k), cap() - stored()); if (n > 0) { P.take(k, n); add(k, n); } return n; }
export function withdraw(k, n = Infinity) { n = Math.min(n, WS.store[k] || 0); if (n > 0) { take(k, n); G.player.give(k, n); } return n; }
export function withdrawProducts() {
  const got = {};
  for (const k of ['powder', ...WS_PRODUCTS]) { const n = withdraw(k); if (n) got[k] = n; }
  return Object.keys(got).length ? `取出：${itemTxt(got)}` : '倉庫裡還沒有成品。';
}
// 侍從派駐工坊：採集到的東西直接進倉庫
export function depositFromAttendant(a) {
  for (const k in a.inv) { const n = Math.min(a.inv[k], cap() - stored()); if (n > 0) { add(k, n); a.inv[k] -= n; } if (a.inv[k] <= 0) delete a.inv[k]; }
}
export function assign(a, on) {
  const s = SITES.workshop;
  a.ws = on; a.wait = on; a.state = 'idle'; a.node = null;
  if (on) { const i = workers().indexOf(a); a.waitPos = { x: s.x - 2 + i * 2, z: s.z - 4.5 }; if (Math.hypot(a.pos.x - s.x, a.pos.z - s.z) > 80) a.pos.set(a.waitPos.x, 0, a.waitPos.z); }
}

// ---------- 武器改良 ----------
export const upLevel = (gun, track) => (G.player.upg[gun] && G.player.upg[gun][track]) || 0;
export function upgrade(gun, track) {
  const P = G.player, lv = upLevel(gun, track);
  if (!P.owned[gun]) return '還沒有這把槍。';
  if (lv >= 2) return '已經改良到最高級。';
  if (WS.lv.forge < lv + 1) return `需要鐵匠爐 ${lv + 1} 級。`;
  if (!pay(withDisc(upgradeCost(gun, lv)))) return '錢或材料不夠。';
  (P.upg[gun] || (P.upg[gun] = {}))[track] = lv + 1;
  P.statsChanged(); audio.play('craft'); audio.play('reload');
  G.ui.msg(`🔧 ${WEAPONS[gun].n}：${UPGRADES[track].n[gun]} 升到 ${lv + 1} 級！`, 'get');
  G.save(); return null;
}

// =====================================================================
//  工坊介面
// =====================================================================
const $ = id => document.getElementById(id);
let tab = 'build', note = '';
export function openWorkshop() { G.ui.open('workshop'); if (!WS.built) tab = 'build'; render(); }
export function initWorkshopUI() {
  document.querySelectorAll('[data-wtab]').forEach(b => b.onclick = () => { tab = b.dataset.wtab; note = ''; render(); });
}
function btn(label, ok, fn) {
  const b = document.createElement('button'); b.textContent = label; b.disabled = !ok;
  b.onclick = () => { const r = fn(); note = r || ''; render(); }; return b;
}
function row(html, ...buttons) { const r = document.createElement('div'); r.className = 'row'; r.innerHTML = `<div class="nm">${html}</div>`; buttons.forEach(b => r.appendChild(b)); return r; }
const need = c => Object.entries(c).map(([k, n]) => { const have = G.player.count(k); return `<span class="${have < n ? 'lack' : ''}">${k === 'coin' ? '🪙' : ITEMS[k].i}${k === 'coin' ? '' : ITEMS[k].n} ${n}</span>`; }).join('　');

export function render() {
  if (G.menu !== 'workshop') return;
  document.querySelectorAll('[data-wtab]').forEach(b => { b.classList.toggle('on', b.dataset.wtab === tab); b.disabled = !WS.built && b.dataset.wtab !== 'build'; });
  $('ws-status').textContent = WS.built ? `倉庫 ${stored()}/${cap()}　🪙${G.player.count('coin')}` + ((WS.lv.mill || WS.lv.forge) ? `　下一輪 ${Math.ceil(WS.t)} 秒` : '') : `🪙${G.player.count('coin')}`;
  const box = $('ws-body'); box.innerHTML = '';
  if (note) { const p = document.createElement('p'); p.className = 'ws-note'; p.textContent = note; box.appendChild(p); }
  const h = (t) => { const e = document.createElement('h3'); e.textContent = t; box.appendChild(e); };
  if (tab === 'build') {
    if (!available()) { box.insertAdjacentHTML('beforeend', '<p class="dim">這塊空地屬於劉備軍營。先去軍營找劉備談談吧。</p>'); return; }
    for (const key of ['base', 'mill', 'forge', 'store']) {
      const b = WS_BUILD[key], lv = key === 'base' ? (WS.built ? 1 : 0) : WS.lv[key], c = buildCost(key);
      if (key !== 'base' && !WS.built) continue;
      const dc = c && withDisc(c);
      box.appendChild(row(`<b>${b.n}</b><span>${key === 'base' ? (WS.built ? '已落成' : '尚未建造') : `${lv}/${b.max} 級`}</span><div class="need">${b.d}${dc ? '<br>' + need(dc) : ''}</div>`,
        btn(!c ? '已滿級' : lv ? '升級' : '建造', !!c && canPay(dc), () => build(key))));
    }
    if (WS.built) box.insertAdjacentHTML('beforeend', `<p class="dim">倉庫容量：${WS_CAP.join(' → ')}。派駐工坊的侍從每人讓火藥坊與鐵匠爐每輪多做一批。工坊旁有營火，可在這裡烘乾火藥；下雨時工坊也能躲雨。</p>`);
  } else if (tab === 'prod') {
    const bonus = workers().length;
    h(`火藥坊（${WS.lv.mill} 級）`);
    box.insertAdjacentHTML('beforeend', WS.lv.mill ? `<p class="dim">每輪最多 ${WS.lv.mill + bonus} 批：有硝石＋硫磺＋木炭就配成黑火藥（每批 3 份），木炭不夠就先把木材燒成炭，也會把受潮火藥烘乾。</p>` : '<p class="dim">尚未建造。</p>');
    h(`鐵匠爐（${WS.lv.forge} 級）`);
    if (!WS.lv.forge) box.insertAdjacentHTML('beforeend', '<p class="dim">尚未建造。</p>');
    else {
      box.insertAdjacentHTML('beforeend', `<p class="dim">每輪最多 ${WS.lv.forge + bonus} 批，選擇要自動生產的項目：</p>`);
      for (const id of WS_PRODUCTS) {
        const r = RECIPES.find(x => x.id === id), ok = Object.entries(r.need).every(([k, q]) => has(k, q));
        box.appendChild(row(`<b>${WS.product === id ? '▶ ' : ''}${r.n}</b><div class="need">${Object.entries(r.need).map(([k, q]) => `<span class="${has(k, q) ? '' : 'lack'}">${ITEMS[k].i}${ITEMS[k].n} ${WS.store[k] || 0}/${q}</span>`).join('　')}${ok ? '' : '（倉庫材料不足）'}</div>`,
          btn(WS.product === id ? '生產中' : '改做這個', WS.product !== id, () => { WS.product = id; return `鐵匠爐改為生產：${r.n}`; })));
      }
    }
  } else if (tab === 'store') {
    box.appendChild(row(`<b>原料一鍵存入</b><div class="need">硝石、硫磺、木炭、受潮火藥、鐵礦、生肉、木材（倉庫快滿時先存珍貴的）</div>`, btn('全部存入', true, depositRaw)));
    box.appendChild(row(`<b>成品一鍵取出</b><div class="need">黑火藥與所有彈藥、爆裂物</div>`, btn('全部取出', true, withdrawProducts)));
    h(`倉庫內容（${stored()}/${cap()}）・存放的火藥不會受潮`);
    const ks = Object.keys(WS.store);
    if (!ks.length) box.insertAdjacentHTML('beforeend', '<p class="dim">倉庫是空的。</p>');
    const grid = document.createElement('div'); grid.className = 'grid'; box.appendChild(grid);
    for (const k of ks) {
      const c = document.createElement('div'); c.className = 'cell'; c.innerHTML = `${ITEMS[k].i} ${ITEMS[k].n}<b>${WS.store[k]}</b>`;
      c.appendChild(btn('取出', true, () => { withdraw(k); return ''; })); grid.appendChild(c);
    }
    const own = Object.keys(G.player.inv).filter(k => G.player.count(k) > 0 && k !== 'coin' && !ITEMS[k].key);
    if (own.length) {
      h('從背包存入');
      const g2 = document.createElement('div'); g2.className = 'grid'; box.appendChild(g2);
      for (const k of own) { const c = document.createElement('div'); c.className = 'cell'; c.innerHTML = `${ITEMS[k].i} ${ITEMS[k].n}<b>${G.player.count(k)}</b>`; c.appendChild(btn('存入', stored() < cap(), () => { depositItem(k, Infinity); return ''; })); g2.appendChild(c); }
    }
  } else if (tab === 'upg') {
    box.insertAdjacentHTML('beforeend', `<p class="dim">改良上限＝鐵匠爐等級（目前 ${WS.lv.forge} 級，最多改良 2 級）。改良效果永久保留。</p>`);
    for (const gun of GUNS) {
      if (!G.player.owned[gun]) continue;
      h(`${WEAPONS[gun].i} ${WEAPONS[gun].n}`);
      for (const track of ['mag', 'acc', 'dmg']) {
        const U = UPGRADES[track], lv = upLevel(gun, track), c = lv < 2 ? withDisc(upgradeCost(gun, lv)) : null;
        const eff = track === 'mag' ? `彈匣 ${lv ? U.lv[lv - 1][gun] : WEAPONS[gun].mag}${c ? ' → ' + U.lv[lv][gun] : ''}` : track === 'acc' ? `散布 ×${lv ? U.mult[lv - 1] : 1}${c ? ' → ×' + U.mult[lv] : ''}` : `傷害 ×${lv ? U.mult[lv - 1] : 1}${c ? ' → ×' + U.mult[lv] : ''}`;
        const forgeOk = WS.lv.forge >= lv + 1;
        box.appendChild(row(`<b>${U.n[gun]}</b><span>${lv}/2 級・${eff}</span><div class="need">${c ? need(c) + (forgeOk ? '' : `　<span class="lack">需鐵匠爐 ${lv + 1} 級</span>`) : '已滿級'}</div>`,
          btn(c ? '改良' : '已滿級', !!c && forgeOk && canPay(c), () => upgrade(gun, track))));
      }
    }
    if (!GUNS.some(g => G.player.owned[g])) box.insertAdjacentHTML('beforeend', '<p class="dim">沒有可改良的槍。</p>');
  } else if (tab === 'crew') {
    box.insertAdjacentHTML('beforeend', '<p class="dim">派駐工坊的侍從會留在工坊附近採集，採到的東西直接存進倉庫；每人也讓火藥坊與鐵匠爐每輪多做一批。</p>');
    if (!G.attendants.length) box.insertAdjacentHTML('beforeend', '<p class="dim">你還沒有侍從。</p>');
    for (const a of G.attendants) {
      box.appendChild(row(`<b>${a.name}</b><span>${a.def.title}</span><div class="need">${a.ws ? '🏭 派駐工坊中' : '跟隨你行動'}</div>`,
        btn(a.ws ? '叫回身邊' : '派駐工坊', true, () => { assign(a, !a.ws); return a.ws ? `${a.name} 前往工坊幫忙。` : `${a.name} 回到你身邊。`; })));
    }
  }
}
