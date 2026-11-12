import { G } from './state.js';
import { ITEMS, WEAPONS, HOTBAR, RECIPES, SHOP_BUY, SHOP_SELL } from './data.js';
import { SITES, riverX, HALF, HOSTILE_SITES } from './world.js';
import { audio } from './audio.js';
import { angDiff } from './util.js';
import { QUESTS, dialogFor, questSite, akaiPending } from './quests.js';
import { siteVisible } from './world.js';
import { hasBond, cheaper } from './akai.js';
import { BM, gunRate } from './blackmarket.js';
import { drawMap, openMap, initMapUI } from './mapview.js';
import { icon, applyIcons, WEAPON_ICON } from './icons.js';
import { resetInput } from './player.js';
import { SQUAD_CMDS } from './data.js';
import { followers, squadUsed, squadCap } from './squad.js';
import * as OD from './orders.js';
import { nearFire, weatherIcon, raining } from './weather.js';
import { S, DEFAULTS, QUALITY, saveSettings } from './settings.js';
import { DIFFS, diffId } from './difficulty.js';
import { skillOf, skillStatus } from './skills.js';
import { defenseHud } from './defense.js';
import { toggleTutorial, syncButton } from './tutorial.js';

const $ = id => document.getElementById(id);
const el = {};
let hitT = 0, mapT = 0, last = {}, bossRef = null;
const MENUS = ['start', 'pause', 'inv', 'dialog', 'shop', 'dead', 'win', 'settings', 'workshop', 'map'];

export const ui = {
  dirty: true,
  init() {
    for (const id of ['hud', 'vignette', 'scope', 'hit', 'clock', 'quest-t', 'quest-d', 'quest-dist', 'minimap', 'followers', 'boss', 'boss-name', 'boss-fill', 'msgs', 'prompt',
      'b-hp', 'b-hunger', 'b-thirst', 'b-stamina', 'b-damp', 'st-damp', 'quest-orders', 'hotbar', 'ammo-n', 'ammo-w', 'quick', 'compass-in', 'fade', 'touch']) el[id] = $(id);
    document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => ui.close());
    document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => ui.tab(b.dataset.tab));
    $('btn-respawn').onclick = () => { G.player.respawn(); ui.close(); };
    $('btn-music').onclick = () => ui.msg(audio.toggleMusic() ? '配樂：開' : '配樂：關', 'info');
    $('btn-save').onclick = () => { G.save(); ui.msg('已存檔。', 'info'); };
    $('btn-intro').onclick = () => G.replayIntro();
    $('btn-tutor').onclick = () => { toggleTutorial(); ui.close(); };
    this.renderDiff();
    initMapUI(); applyIcons();
    addEventListener('resize', () => { ui.dirty = true; }); // 轉向時重算快捷列格子大小
    $('tab-map').insertAdjacentHTML('afterbegin', '<p class="dim" style="margin:0 0 6px">提示：點右上角小地圖（電腦按 M）可開啟能縮放的大地圖。</p>');
    document.querySelectorAll('[data-settings]').forEach(b => b.onclick = () => ui.openSettings());
    $('settings-back').onclick = () => ui.closeSettings();
    for (const [ch, a] of [['北', 0], ['東', -Math.PI / 2], ['南', Math.PI], ['西', Math.PI / 2]]) { // yaw：面向該方位時的鏡頭角
      const s = document.createElement('span'); s.textContent = ch; s.dataset.a = a; el['compass-in'].appendChild(s);
    }
    const q = document.createElement('span'); q.textContent = '◆'; q.className = 'q'; el['compass-in'].appendChild(q); el.qmark = q;
  },

  // ---------- 選單 ----------
  open(name) {
    if (G.menu === name) return;
    for (const m of MENUS) $('menu-' + m).classList.toggle('hidden', m !== name);
    G.menu = name; resetInput(); G.unlockPointer && G.unlockPointer(); document.body.classList.add('menu-open');
    if (name === 'inv') this.tab(this.curTab || 'craft');
    if (name === 'pause') syncButton();
    if (name === 'shop') this.renderShop();
  },
  close() {
    for (const m of MENUS) $('menu-' + m).classList.add('hidden');
    G.menu = null; G.lockPointer && G.lockPointer(); document.body.classList.remove('menu-open');
  },
  escape() { if (G.menu === 'layout') G.cancelLayout(); else if (G.menu === 'settings') this.closeSettings(); else if (['pause', 'inv', 'shop', 'dialog', 'win', 'workshop', 'map'].includes(G.menu)) this.close(); },
  openMap() { openMap(); },
  // 開始畫面：新遊戲的難度
  renderDiff() {
    const seg = $('diff-seg'); seg.innerHTML = '';
    if (!DIFFS[S.diff]) S.diff = 'normal';
    for (const k in DIFFS) {
      const b = document.createElement('button'); b.textContent = DIFFS[k].n; b.className = S.diff === k ? 'on' : '';
      b.onclick = () => { S.diff = k; saveSettings(); this.renderDiff(); };
      seg.appendChild(b);
    }
    $('diff-desc').textContent = DIFFS[S.diff].d;
  },
  // ---------- 設定 ----------
  openSettings() { this.settingsFrom = G.menu || 'pause'; this.open('settings'); this.renderSettings(); },
  closeSettings() { this.open(this.settingsFrom === 'start' ? 'start' : 'pause'); },
  renderSettings() {
    const box = $('settings-body'); box.innerHTML = '';
    const slider = (key, label, min, max, step, fmt) => {
      const r = document.createElement('div'); r.className = 'set-row';
      r.innerHTML = `<label>${label}</label><input type="range" min="${min}" max="${max}" step="${step}" value="${S[key]}"><span>${fmt(S[key])}</span>`;
      const inp = r.querySelector('input'), out = r.querySelector('span');
      inp.oninput = () => { S[key] = +inp.value; out.textContent = fmt(S[key]); saveSettings(); G.applySettings(key); };
      box.appendChild(r);
    };
    const pct = v => Math.round(v * 100) + '%', mul = v => v.toFixed(2) + '×';
    if (G.touch) slider('touchSens', '觸控靈敏度', 0.3, 2.5, 0.05, mul); else slider('sens', '滑鼠靈敏度', 0.3, 2.5, 0.05, mul);
    const q = document.createElement('div'); q.className = 'set-row';
    q.innerHTML = '<label>畫質</label><div class="seg"></div>';
    for (const [k, n] of [['auto', '自動'], ...Object.entries(QUALITY).map(([k, v]) => [k, v.n])]) {
      const b = document.createElement('button'); b.textContent = n; b.className = S.quality === k ? 'on' : '';
      b.onclick = () => { S.quality = k; saveSettings(); G.applySettings('quality'); this.renderSettings(); };
      q.querySelector('.seg').appendChild(b);
    }
    box.appendChild(q);
    if (G.started) { // 目前這份存檔的難度
      const dr = document.createElement('div'); dr.className = 'set-row';
      dr.innerHTML = '<label>難度</label><div class="seg"></div>';
      for (const k in DIFFS) {
        const b = document.createElement('button'); b.textContent = DIFFS[k].n; b.className = diffId() === k ? 'on' : '';
        b.onclick = () => { G.flags.diff = k; G.save(); this.renderSettings(); };
        dr.querySelector('.seg').appendChild(b);
      }
      box.appendChild(dr);
    }
    slider('sfx', '音效音量', 0, 1, 0.05, pct);
    slider('music', '配樂音量', 0, 1, 0.05, pct);
    if (G.touch) {
      slider('btn', '按鍵大小', 0.8, 1.3, 0.05, pct);
      const lr = document.createElement('div'); lr.className = 'set-row';
      const L = S.layout || {}, tag = [L.land && '橫向', L.port && '直向'].filter(Boolean).join('、');
      lr.innerHTML = `<label>按鍵配置</label><button class="set-wide">自訂每顆按鍵的位置與大小</button><span>${tag ? '已自訂' + tag : '預設'}</span>`;
      lr.querySelector('button').onclick = () => G.openLayoutEditor(() => { this.open('settings'); this.renderSettings(); });
      box.appendChild(lr);
    }
    const hint = document.createElement('p'); hint.className = 'dim';
    hint.textContent = (G.started ? `難度「${DIFFS[diffId()].n}」：${DIFFS[diffId()].d}。` : '') + '畫質「自動」：電腦預設高、手機預設中。低畫質關閉陰影並縮短可視距離，最省電。';
    box.appendChild(hint);
    const rs = document.createElement('button'); rs.textContent = '恢復預設'; rs.onclick = () => { Object.assign(S, DEFAULTS); saveSettings(); G.applySettings('all'); this.renderSettings(); };
    box.appendChild(rs);
  },
  tab(t) {
    this.curTab = t;
    document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    for (const k of ['craft', 'bag', 'orders', 'map']) $('tab-' + k).classList.toggle('hidden', k !== t);
    if (t === 'craft') this.renderCraft(); else if (t === 'bag') this.renderBag(); else if (t === 'orders') this.renderOrders(); else this.renderMap();
  },
  renderCraft() {
    const P = G.player, box = $('tab-craft'); box.innerHTML = '';
    for (const r of RECIPES) {
      if (r.req === 'akai5' && !hasBond(5)) { const row = document.createElement('div'); row.className = 'row'; row.innerHTML = `<div class="nm"><b>🔒 ${r.n}</b><span>與阿凱的羈絆達到 Lv5 後解鎖</span></div>`; box.appendChild(row); continue; }
      const owned = (r.weapon && P.owned[r.weapon]) || (r.once && P.count(r.once) > 0);
      let ok = !owned;
      const nd = Object.fromEntries(Object.entries(r.need).map(([it, n]) => [it, cheaper(n)])); // 阿凱羈絆 Lv5：少用兩成材料
      let need = Object.entries(nd).map(([it, n]) => { const have = P.count(it); if (have < n) ok = false; return `<span class="${have < n ? 'lack' : ''}">${ITEMS[it].i}${ITEMS[it].n} ${have}/${n}</span>`; }).join('　');
      if (r.near === 'fire') { const f = nearFire(P.pos, 8); if (!f) ok = false; need += `　<span class="${f ? '' : 'lack'}">🔥營火旁</span>`; }
      const row = document.createElement('div'); row.className = 'row';
      const desc = G.touch ? r.d.replace('按 G ', '點 💣 ').replace('按 H ', '點 💊 ') : r.d;
      row.innerHTML = `<div class="nm"><b>${r.n}</b><span>${desc}</span><div class="need">${need}</div></div>`;
      const b = document.createElement('button'); b.textContent = owned ? '已擁有' : '製作'; b.disabled = !ok;
      b.onclick = () => {
        for (const [it, n] of Object.entries(nd)) P.take(it, n);
        if (r.give) for (const [it, n] of Object.entries(r.give)) P.give(it, n);
        if (r.weapon) { P.giveWeapon(r.weapon); for (const [it, n] of Object.entries(r.bonus || {})) P.give(it, n); }
        audio.play('craft'); ui.msg(`製作完成：${r.n}`, 'get'); this.renderCraft();
      };
      row.appendChild(b); box.appendChild(row);
    }
  },
  renderOrders() {
    const box = $('tab-orders'), P = G.player, A = OD.OR.active;
    let h = `<h3>進行中的訂單 ${A.length}/${OD.MAX_ACTIVE}</h3>`;
    h += A.length ? A.map(o => { const have = P.count(o.item), late = o.due <= G.day; return `<div class="row"><div class="nm"><b>${OD.ISSUERS[o.from].n}</b><span class="${late ? 'lack' : ''}">第 ${o.due} 日前${o.due < G.day ? '（已逾期）' : late ? '（今天到期！）' : ''}</span><div class="need"><span class="${have < o.qty ? 'lack' : ''}">${ITEMS[o.item].i}${ITEMS[o.item].n} ${have}/${o.qty}</span>　🪙${o.reward}　聲望 +${o.rep}</div></div></div>`; }).join('')
      : '<p class="dim">目前沒有訂單。找劉備、糜竺交談可以接單（擊敗張角後曹操、孫堅也會下單）。</p>';
    h += '<h3>聲望</h3><div class="grid">';
    for (const id in OD.ISSUERS) { const t = OD.repTier(id); h += `<div class="cell">${OD.ISSUERS[id].n}<b>${t.n}</b><br><span class="dim">${OD.OR.rep[id]} 點${t.disc < 1 ? `・${t.disc * 10} 折` : ''}${t.elite && id !== 'mizhu' ? '・可招精銳' : ''}</span></div>`; }
    h += '</div><p class="dim">準時交貨提升聲望：15 點「信賴」9 折、35 點「摯友」8 折並可招募精銳兵種。逾期扣 6 點。</p>';
    if (BM.leak) h += `<h3>軍火外流</h3><p class="dim">賣給黑市的軍火：🪙${BM.leak}${BM.blueprint ? '（含火器圖紙）' : ''}　敵軍火銃兵出現率 ${Math.round(gunRate() * 100)}%。外流越多，結局越黑暗。</p>`;
    box.innerHTML = h;
  },
  renderBag() {
    const P = G.player, box = $('tab-bag');
    let h = `<h3>兵器</h3><div class="grid">`;
    for (const w of HOTBAR) if (P.owned[w]) h += `<div class="cell">${icon(WEAPON_ICON(w))} ${WEAPONS[w].n}</div>`;
    h += `</div><h3>物品　<span class="dim">水囊 ${P.canteen}/3　護甲減傷 ${Math.round(P.armor * 100)}%</span></h3><div class="grid">`;
    let any = false;
    for (const it in ITEMS) if (P.count(it) > 0) {
      any = true; const d = ITEMS[it];
      h += `<div class="cell">${d.i} ${d.n}<b>${P.count(it)}</b>${d.food ? `<button data-use="${it}">食用</button>` : d.heal ? `<button data-use="${it}">使用</button>` : ''}</div>`;
    }
    box.innerHTML = h + (any ? '' : '<p class="dim">背包空空如也。</p>') + '</div>';
    box.querySelectorAll('[data-use]').forEach(b => b.onclick = () => {
      const it = b.dataset.use, d = ITEMS[it];
      if (d.heal) P.heal(); else if (P.take(it)) { P.hunger = Math.min(100, P.hunger + d.food); if (d.water) P.thirst = Math.min(100, P.thirst + d.water); if (d.hp) P.hp = Math.max(1, P.hp + d.hp); audio.play('eat'); }
      this.renderBag();
    });
  },
  renderMap() { drawMap($('bigmap'), { cx: 0, cz: 0, zoom: 1 }); }, // 背包地圖頁：全圖
  renderShop() {
    const P = G.player; $('shop-coin').textContent = `🪙 ${P.count('coin')} 五銖錢`;
    const buy = $('shop-buy'), sell = $('shop-sell'); buy.innerHTML = sell.innerHTML = '';
    const row = (html, label, ok, fn) => {
      const r = document.createElement('div'); r.className = 'row'; r.innerHTML = `<div class="nm">${html}</div>`;
      const b = document.createElement('button'); b.textContent = label; b.disabled = !ok; b.onclick = () => { fn(); audio.play('coin'); this.renderShop(); }; r.appendChild(b); return r;
    };
    for (const s of SHOP_BUY) {
      let name, owned = false; const price = OD.price('mizhu', s.price);
      if (s.once) owned = P.count(s.item) > 0;
      if (s.item) name = `${ITEMS[s.item].i} ${ITEMS[s.item].n}${s.n > 1 ? ' ×' + s.n : ''}`;
      else if (s.weapon) { name = `${WEAPONS[s.weapon].i} ${WEAPONS[s.weapon].n}`; owned = P.owned[s.weapon]; }
      else { name = '🛡️ ' + s.n; owned = P.armor >= s.armor; }
      buy.appendChild(row(`<b>${name}</b>`, owned ? '已擁有' : `🪙${price}`, !owned && P.count('coin') >= price, () => {
        P.take('coin', price);
        if (s.item) P.give(s.item, s.n); else if (s.weapon) P.giveWeapon(s.weapon); else { P.armor = s.armor; ui.msg(`穿上了${s.n}`, 'get'); }
      }));
    }
    for (const s of SHOP_SELL) {
      const n = P.count(s.item); if (!n) continue;
      sell.appendChild(row(`<b>${ITEMS[s.item].i} ${ITEMS[s.item].n}</b><span>持有 ${n}</span>`, `賣 🪙${s.price}`, true, () => { P.take(s.item); P.give('coin', s.price); }));
    }
    if (!sell.children.length) sell.innerHTML = '<p class="dim">沒有可出售的貨物。<br>震天雷（手榴彈）每枚可賣 60 錢。</p>';
  },

  // ---------- 對話 ----------
  talk(actor) { this.showDialog(actor, dialogFor(actor)); },
  showDialog(actor, node) {
    if (!node) return this.close();
    this.open('dialog');
    $('dlg-name').textContent = actor.name; $('dlg-title').textContent = actor.def.title || '';
    $('dlg-text').textContent = node.text;
    const box = $('dlg-opts'); box.innerHTML = '';
    for (const o of node.opts || [{ t: '告辭' }]) {
      const b = document.createElement('button'); b.textContent = '▸ ' + o.t; b.disabled = !!o.dis;
      b.onclick = () => { const next = o.fn ? o.fn() : null; if (next === 'shop') ui.open('shop'); else if (G.menu === 'dialog') ui.showDialog(actor, next); };
      box.appendChild(b);
    }
  },

  // ---------- 即時訊息 ----------
  msg(text, cls = 'info') {
    const d = document.createElement('div'); d.className = cls; d.textContent = text; el.msgs.appendChild(d);
    while (el.msgs.children.length > (G.touch ? 3 : 6)) el.msgs.firstChild.remove();
    setTimeout(() => { d.style.opacity = 0; setTimeout(() => d.remove(), 700); }, cls === 'quest' || cls === 'say' ? 8000 : 4500);
  },
  prompt(label) {
    if (last.prompt === label) return; last.prompt = label;
    el.prompt.classList.toggle('hidden', !label);
    if (label) el.prompt.innerHTML = G.touch ? label : `<kbd>E</kbd> ${label}`;
  },
  hurt(n) { el.vignette.style.opacity = Math.min(0.85, 0.25 + n / 40); clearTimeout(this._ht); this._ht = setTimeout(() => el.vignette.style.opacity = 0, 260); },
  hitmarker(head, kill) { el.hit.style.opacity = 1; el.hit.classList.toggle('head', !!head || !!kill); hitT = 0.18; },
  scope(on) { if (last.scope !== on) { last.scope = on; el.scope.style.display = on ? 'block' : 'none'; $('cross').style.display = on ? 'none' : 'block'; } },
  deathBy(name) {
    $('dead-text').textContent = name ? `你死於「${name}」之手。亂世無情，但你的故事還沒結束。` : '亂世無情，但你的故事還沒結束。';
    this.open('dead');
  },
  fade(on) { el.fade.style.opacity = on ? 1 : 0; },
  cine(on, boss) {
    document.body.classList.toggle('cine', on);
    if (on) {
      $('cine-name').textContent = boss.name; $('cine-title').textContent = boss.def.title; $('cine-line').textContent = '';
      $('cine-card').classList.remove('show'); $('cine-line').classList.remove('show');
    }
  },
  cineStep(card, line) {
    $('cine-card').classList.toggle('show', card); const l = $('cine-line');
    if (line && !l.classList.contains('show')) { l.textContent = line; l.classList.add('show'); } else if (!line) l.classList.remove('show');
  },

  // ---------- 每幀 HUD ----------
  update(dt) {
    const P = G.player;
    const bar = (id, v) => { const w = Math.round(v); if (last[id] !== w) { last[id] = w; el[id].style.width = w + '%'; el[id].classList.toggle('low', w < 25); } };
    bar('b-hp', P.hp / P.maxHp * 100); bar('b-hunger', P.hunger); bar('b-thirst', P.thirst); bar('b-stamina', P.stamina);
    const showDamp = P.damp > 0.5 || raining();
    if (last.showDamp !== showDamp) { last.showDamp = showDamp; el['st-damp'].classList.toggle('hidden', !showDamp); }
    if (showDamp) { const w = Math.round(P.damp); if (last.damp !== w) { last.damp = w; el['b-damp'].style.width = w + '%'; el['b-damp'].classList.toggle('low', w > 60); } }
    const oa = OD.OR.active, ok = oa.length ? `📜 訂單 ${oa.length} 張・最近第 ${Math.min(...oa.map(o => o.due))} 日` : '';
    if (last.ok !== ok) { last.ok = ok; el['quest-orders'].textContent = ok; }
    if (hitT > 0) { hitT -= dt; if (hitT <= 0) el.hit.style.opacity = 0; }
    const hh = Math.floor(G.time / 60), mm = Math.floor(G.time % 60 / 10) * 10, ck = `第 ${G.day} 日　${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}　${G.weather.kind !== 'clear' ? weatherIcon() : hh >= 5 && hh < 19 ? '☀️' : '🌙'}` + (G.eastWind > 0 ? `　🌬 東南風 ${Math.floor(G.eastWind / 60)}:${String(Math.floor(G.eastWind % 60)).padStart(2, '0')}` : '');
    if (last.ck !== ck) { last.ck = ck; el.clock.textContent = ck; }

    if (this.dirty || P.reloadT > 0 !== last.rl) {
      this.dirty = false; last.rl = P.reloadT > 0;
      const w = WEAPONS[P.cur];
      const own = HOTBAR.filter(id => P.owned[id]);
      if (G.touch) { // 手機：兵器多時縮小格子，避免擋到右側按鍵
        const land = innerWidth > innerHeight, avail = land ? innerWidth - 260 * (G.settings.btn || 1) - 16 : innerWidth - 16;
        el.hotbar.style.setProperty('--slot', Math.max(22, Math.min(42, Math.floor(avail / own.length) - 3)) + 'px');
      }
      el.hotbar.innerHTML = own.map((id, i) => `<div class="slot ${P.cur === id ? 'on' : ''}" data-slot="${id}"><small>${i < 10 ? (i + 1) % 10 : ''}</small>${icon(WEAPON_ICON(id))}<em>${WEAPONS[id].n}</em></div>`).join(''); // 只顯示已擁有的兵器
      el['ammo-w'].innerHTML = icon(WEAPON_ICON(P.cur)) + ' ' + w.n + (P.reloadT > 0 ? '　換彈中…' : '');
      el['ammo-n'].innerHTML = w.type === 'gun' ? `${P.mags[P.cur]} <small>/ ${w.ammo ? P.count(w.ammo) : '∞'}</small>` : w.type === 'bow' ? `${P.count('arrow')} <small>箭</small>` : '';
      const food = P.count('cooked') + P.count('ration') + P.count('berry') + P.count('meat');
      if (G.touch) {
        $('q-cmd').textContent = SQUAD_CMDS.find(c => c.id === G.squadCmd).s; $('q-food').textContent = food; $('q-water').textContent = P.canteen; $('q-med').textContent = P.count('medicine');
        if (P.count(P.thrown) <= 0) { const o = P.ownedThrowables(); if (o.length) P.thrown = o[0]; }
        $('q-throw-i').innerHTML = icon(P.thrown); $('q-gren').textContent = P.count(P.thrown);
        $('q-cycle').classList.toggle('hidden', P.ownedThrowables().length < 2);
      }
      el.quick.innerHTML = `${icon('grenade')} ${P.count('grenade')} <kbd>G</kbd>　${icon('firebomb')} ${P.count('firebomb')} <kbd>T</kbd>　${icon('mine')} ${P.count('mine')} <kbd>B</kbd><br>${icon('food')} ${food} <kbd>F</kbd>　${icon('water')} ${P.canteen}/3 <kbd>Z</kbd>　${icon('medicine')} ${P.count('medicine')} <kbd>H</kbd><br><span class="coin">${icon('coin')} ${P.count('coin')}</span>`;
    }

    // 任務與羅盤
    const q = QUESTS[G.stage];
    const qk = G.stage + (akaiPending() ? 'A' : '');
    if (last.stage !== qk) { last.stage = qk; el['quest-t'].textContent = akaiPending() ? '【穿越者】' : '【' + q.t + '】'; el['quest-d'].textContent = akaiPending() ? '傳送門突然有人摔了出來！前往穿越之地，找到那位穿越者。' : q.d; }
    let qa = null;
    const qs = questSite(q);
    if (qs) {
      const s = SITES[qs], dx = s.x - P.pos.x, dz = s.z - P.pos.z, d = Math.round(Math.hypot(dx, dz) / 5) * 5;
      const txt = `▸ ${s.name}　${d} 步` + (G.objText ? `　${G.objText}` : '');
      if (last.qd !== txt) { last.qd = txt; el['quest-dist'].textContent = txt; }
      qa = Math.atan2(-dx, -dz);
    } else if (last.qd !== '') { last.qd = ''; el['quest-dist'].textContent = ''; }
    const cw = el['compass-in'].clientWidth || 300;
    for (const s of el['compass-in'].children) {
      const a = s === el.qmark ? qa : +s.dataset.a;
      if (a === null) { s.style.display = 'none'; continue; }
      const d = angDiff(a, P.yaw); // 目標在視線右側時為正
      s.style.display = Math.abs(d) < 1.2 ? 'block' : 'none'; s.style.left = (cw / 2 + d * cw / 2.2) + 'px';
    }

    mapT -= dt;
    if (mapT <= 0) { mapT = 0.12; this.drawMini(); this.drawSide(); }
  },
  drawSide() {
    const P = G.player;
    // 頭目血條
    let boss = null, bd = 80;
    for (const a of G.actors) if (a.alive && a.def.boss) { const d = Math.hypot(a.pos.x - P.pos.x, a.pos.z - P.pos.z); if (d < bd) { bd = d; boss = a; } }
    const shield = boss && boss.arena && !boss.inArena(P);
    const dh = defenseHud();
    if (dh) { // 守營戰：頭目血條改顯示軍旗耐久
      if (bossRef !== 'defense') { bossRef = 'defense'; last.shield = null; el.boss.classList.remove('hidden', 'shield'); el.boss.classList.add('flag'); }
      if (last.dh !== dh.text) { last.dh = dh.text; el['boss-name'].textContent = dh.text; }
      el['boss-fill'].style.width = dh.k * 100 + '%';
    } else if (bossRef === 'defense') { bossRef = null; last.dh = ''; el.boss.classList.remove('flag'); el.boss.classList.add('hidden'); }
    else if (boss !== bossRef || shield !== last.shield) {
      bossRef = boss; last.shield = shield; el.boss.classList.toggle('hidden', !boss); el.boss.classList.toggle('shield', !!shield);
      if (boss) el['boss-name'].textContent = `${boss.name}　${boss.def.title}` + (shield ? '　⛨護體' : '');
    }
    if (boss && !dh) el['boss-fill'].style.width = Math.max(0, boss.hp / boss.maxHp * 100) + '%';
    // 隊伍：名將逐一列出，兵卒依兵種合併
    const f = followers(), gens = f.filter(a => a.def.general), groups = {};
    for (const a of f) if (!a.def.general) { const g = groups[a.id] || (groups[a.id] = { n: 0, hp: 0, name: a.def.short }); g.n++; g.hp += a.hp / a.maxHp; }
    const cmd = SQUAD_CMDS.find(c => c.id === G.squadCmd);
    const rows = [];
    if (f.length) rows.push(`<div class="cmd">⚑ ${cmd.n}　${squadUsed()}/${squadCap()}</div>`);
    const sk = a => { const s = skillOf(a); if (!s) return ''; const c = Math.ceil(a.skillCd || 0); return c > 0 ? `<span class="sk cd">${s.n} ${c}s</span>` : `<span class="sk">★${s.n}</span>`; };
    for (const a of gens) rows.push(`<div>⚔️ ${a.name}${sk(a)}<span class="bar"><div style="width:${a.hp / a.maxHp * 100}%"></div></span></div>`);
    for (const k in groups) { const g = groups[k]; rows.push(`<div>🛡️ ${g.name} ×${g.n}<span class="bar"><div style="width:${g.hp / g.n * 100}%"></div></span></div>`); }
    for (const a of G.attendants) rows.push(`<div class="att">🧺 ${a.name} ${a.carried}/${a.cap}${a.wait ? '（留守）' : ''}</div>`);
    if (G.touch) { // 手機：濃縮成三行，避免擋到右側按鍵
      rows.length = 0;
      if (f.length) rows.push(`<div class="cmd">⚑${cmd.n} ${squadUsed()}/${squadCap()}</div>`, `<div>${[...gens.map(a => '⚔️' + a.name), ...Object.values(groups).map(g => `🛡️${g.name}×${g.n}`)].join(' ')}</div>`);
      if (G.attendants.length) rows.push(`<div class="att">🧺${G.attendants.map(a => a.name + ' ' + a.carried).join('　')}</div>`);
    }
    const key = rows.join('');
    if (last.fol !== key) { last.fol = key; el.followers.innerHTML = key; }
    if (G.touch) { // 名將絕技鍵：有名將同行才出現，角標顯示可用數或冷卻秒數
      const ss = skillStatus(), b = $('tq-skill'), k2 = ss ? (ss.ready ? 'r' + ss.ready : 'c' + ss.wait) : '';
      if (last.sk !== k2 && G.menu !== 'layout') { last.sk = k2; b.classList.toggle('hidden', !ss); b.classList.toggle('cd', !!ss && !ss.ready); $('q-skill').textContent = ss ? (ss.ready ? '★' : ss.wait) : ''; }
    }
  },
  drawMini() {
    const c = el.minimap, g = c.getContext('2d'), S = 150, R = 110, k = S / (R * 2), P = G.player;
    const X = x => S / 2 + (x - P.pos.x) * k, Z = z => S / 2 + (z - P.pos.z) * k;
    g.fillStyle = G.world.isNight ? '#1c2418' : '#3a4a2a'; g.fillRect(0, 0, S, S);
    g.strokeStyle = '#3f7f9f'; g.lineWidth = 26 * k * 2; g.beginPath();
    for (let z = P.pos.z - R - 10; z <= P.pos.z + R + 10; z += 8) g.lineTo(X(riverX(z)), Z(z)); g.stroke();
    g.font = 'bold 11px serif'; g.textAlign = 'center';
    const q = QUESTS[G.stage];
    for (const id in SITES) {
      if (!siteVisible(id)) continue;
      const s = SITES[id]; let x = X(s.x), z = Z(s.z); const isQ = questSite(q) === id;
      const dx = x - S / 2, dz = z - S / 2, d = Math.hypot(dx, dz);
      if (d > S / 2 - 8) { if (!isQ) continue; x = S / 2 + dx / d * (S / 2 - 9); z = S / 2 + dz / d * (S / 2 - 9); }
      else { g.fillStyle = 'rgba(138,115,80,.6)'; g.beginPath(); g.arc(x, z, s.r * k, 0, 7); g.fill(); }
      g.fillStyle = isQ ? '#ffd24a' : '#f4e8c8'; g.fillText(isQ && d > S / 2 - 8 ? '◆' : s.name, x, z + 4);
    }
    const dot = (o, col, r) => { const x = X(o.pos.x), z = Z(o.pos.z); if (Math.hypot(x - S / 2, z - S / 2) > S / 2) return; g.fillStyle = col; g.beginPath(); g.arc(x, z, r, 0, 7); g.fill(); };
    for (const a of G.animals) if (a.alive) { if (a.kind === 'horse') dot(a, a === P.horse ? '#ffd24a' : '#b08a5a', 2.5); else if (a.kind === 'wolf') dot(a, '#d070d0', 2); }
    for (const a of G.attendants) dot(a, '#ffe08a', 2.2);
    for (const a of G.actors) if (a.alive) dot(a, a.faction === 'enemy' ? (a.def.boss ? '#ff2a1a' : '#e8553a') : (a.def.general ? '#7af08a' : '#4aa85a'), a.def.boss || a.def.general ? 3.5 : 2.2);
    g.save(); g.translate(S / 2, S / 2); g.rotate(-P.yaw);
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, -7); g.lineTo(5, 5); g.lineTo(0, 2); g.lineTo(-5, 5); g.fill(); g.restore();
  },
};
