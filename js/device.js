// 傳送門儀器（擊敗董卓後啟動）與前哨營／驛站：存檔、時空傳送、地脈探測、時空郵包、借東風、歸途之門
import * as THREE from 'three';
import { G } from './state.js';
import { SITES, world, heightAt, outposts, siteVisible, setDeviceActive } from './world.js';
import { meshOf, bx, ball, rnd, pick } from './util.js';
import { audio } from './audio.js';
import { ITEMS } from './data.js';
import { joined, akai } from './akai.js';
import { followers } from './squad.js';
import { leakTier } from './blackmarket.js';
import { canDefend, describe, startDefense, defenseActive, defenseLevel } from './defense.js';

export const FEATURES = [
  { id: 'travel', stage: 5, n: '時空傳送', d: '在友軍營區、前哨營、工坊與傳送門之間瞬間移動（前哨營與驛站也能使用）', hint: '擊敗董卓' },
  { id: 'scan', stage: 6, n: '地脈探測', d: '大地圖顯示礦點、草藥，以及敵軍的火銃兵', hint: '擊敗顏良、文醜' },
  { id: 'mail', stage: 7, n: '時空郵包', d: '每天從現代送來一個補給箱，出現在傳送門旁', hint: '火燒烏巢' },
  { id: 'wind', stage: 8, n: '借東風', d: '每天一次：天氣轉晴、颳起東南風 5 分鐘，燃燒彈範圍與傷害提高', hint: '長坂坡守住橋頭' },
  { id: 'home', stage: 9, n: '歸途之門', d: '儀器完全修復：可以選擇回到 2026 年，或留在三國', hint: '赤壁之戰' },
];
export const unlocked = id => G.flags.deviceOn && G.stage >= FEATURES.find(f => f.id === id).stage;
const DV = () => G.flags.device || (G.flags.device = { mailDay: 0, windDay: 0, mail: false });
const DEV = { name: '傳送門儀器', def: { title: '來自未來的控制台' } };

// 主線推進時：啟動儀器、阿凱報告新功能
export function onStageDevice(done) {
  if (done === 4 && !G.flags.deviceOn) {
    G.flags.deviceOn = true; setDeviceActive(true);
    setTimeout(() => {
      G.ui.msg('⚡ 穿越之地的傳送門儀器亮起來了！', 'quest');
      G.ui.msg(joined() ? '阿凱：「儀器……有反應了！給我一點時間研究，我想它能做的不只一件事。」' : '（也許那位穿越者知道這台儀器怎麼用……）', 'say');
    }, 4500);
  }
  const f = FEATURES.find(x => x.stage === done + 1 && x.stage > 5);
  if (f && G.flags.deviceOn) setTimeout(() => G.ui.msg(`阿凱：「我又搞懂儀器的一個功能了——『${f.n}』！${f.d}。」`, 'quest'), 6500);
  if (done === 4) setTimeout(() => G.ui.msg('阿凱：「第一個功能是『時空傳送』，在前哨營、驛站或儀器旁都能用。」', 'say'), 9000);
}
export function deviceStatus() {
  if (!G.flags.deviceOn) return '那台儀器還沒反應。螢幕上的紋路跟我實驗室的共振儀很像……等它亮了我再研究。';
  const next = FEATURES.find(f => G.stage < f.stage);
  return FEATURES.filter(f => G.stage >= f.stage).map(f => `✔ ${f.n}：${f.d}`).join('\n') + (next ? `\n下一個功能「${next.n}」大概要等到${next.hint}之後。` : '\n儀器已經完全修好了。');
}

// ---------- 傳送 ----------
function destinations() {
  const d = [{ id: 'camp', n: '劉備軍營', at: [SITES.camp.x + 14, SITES.camp.z - 6] }];
  d.push({ id: 'coalition', n: '聯軍大營', at: [SITES.coalition.x + 4, SITES.coalition.z + 11] });
  if (G.ws && G.ws.built) d.push({ id: 'workshop', n: '軍火工坊', at: [SITES.workshop.x, SITES.workshop.z - 8] });
  d.push({ id: 'spawn', n: '穿越之地（傳送門）', at: [SITES.spawn.x - 6, SITES.spawn.z + 2] });
  for (const id of outposts()) if (siteVisible(id) && world.spots[id]) d.push({ id, n: SITES[id].name, at: [world.spots[id][0] + 3, world.spots[id][1] + 3] });
  return d;
}
function nearEnemy() { const P = G.player; return G.actors.some(a => a.alive && a.faction === 'enemy' && Math.hypot(a.pos.x - P.pos.x, a.pos.z - P.pos.z) < 35); }
function travel(dst) {
  const P = G.player;
  if (defenseActive()) return '守營戰進行中，不能離開！';
  if (nearEnemy()) return '附近有敵人，現在無法傳送！';
  G.ui.close(); G.ui.fade(true); audio.play('whoosh', 0.8);
  setTimeout(() => {
    if (P.mount) P.dismount();
    const [x, z] = dst.at; P.pos.set(x, heightAt(x, z), z); P.vy = 0;
    const near = (o, r = 3) => o.pos.set(x + rnd(-r, r), 0, z + rnd(-r, r));
    if (P.horse) { near(P.horse, 4); P.horse.state = 'idle'; P.horse.home.x = P.horse.pos.x; P.horse.home.z = P.horse.pos.z; }
    for (const a of followers()) near(a, 4);
    for (const a of G.attendants) if (!a.ws && !a.wait) near(a);
    const k = akai(); if (k && joined() && !G.flags.akai.wait) near(k);
    G.ui.fade(false); G.ui.msg(`🌀 傳送到「${dst.n}」。`, 'info');
  }, 650);
  return null;
}
function travelNode(back) {
  return {
    text: '要傳送到哪裡？（隊友、侍從、阿凱與你的馬會一起過去）',
    opts: [...destinations().map(d => ({ t: d.n, fn: () => { const e = travel(d); return e ? { text: e, opts: [{ t: '返回', fn: back }] } : null; } })), { t: '返回', fn: back }],
  };
}

// ---------- 前哨營／驛站 ----------
export function openHub(id) {
  const name = id === 'camp' ? '劉備軍營・驛站' : id === 'coalition' ? '聯軍大營・驛站' : SITES[id].name;
  const hub = { name, def: { title: '友軍營區：存檔・重生・補給' } };
  const node = () => ({
    text: `${name}的弟兄向你行禮。\n在這裡存檔後，戰死會在此地重生。` + (G.flags.respawnAt === id ? '\n（目前的重生點）' : ''),
    opts: [
      { t: '💾 存檔並設為重生點', fn: () => { G.flags.respawnAt = id; G.save(); audio.play('quest', 0.5); return { text: '已存檔。戰死時會在這裡重生。', opts: node().opts }; } },
      ...(unlocked('travel') ? [{ t: '🌀 時空傳送', fn: () => travelNode(node) }] : []),
      ...(G.stage >= 1 ? [{
        t: defenseActive() ? '⚔ 守營戰進行中……' : `⚔ 守營戰（第 ${defenseLevel()} 級）：擊退來襲的敵軍`, dis: defenseActive(), fn: () => {
          const why = canDefend(id);
          if (why) return { text: why, opts: [{ t: '返回', fn: node }] };
          return { text: describe(id), opts: [{ t: '⚔ 開戰！', fn: () => { G.ui.close(); startDefense(id); return null; } }, { t: '再準備一下。', fn: node }] };
        },
      }] : []),
      { t: '🌙 在帳中就寢（夜晚）', fn: () => { G.ui.close(); G.sleep(); return null; } },
      { t: '告辭。' },
    ],
  });
  G.ui.showDialog(hub, node());
}

// ---------- 儀器 ----------
export function openDevice() {
  if (!G.flags.deviceOn) {
    G.ui.showDialog(DEV, { text: '一台半埋在土裡的現代控制台，螢幕一片漆黑，按什麼都沒有反應。' + (joined() ? '\n阿凱：「跟我實驗室的共振儀好像……等它有反應再說。」' : ''), opts: [{ t: '離開。' }] });
    return;
  }
  const node = () => {
    const dv = DV(), opts = [];
    for (const f of FEATURES) {
      if (G.stage < f.stage) { opts.push({ t: `🔒 ${f.n}（${f.hint}後解鎖）`, dis: true }); continue; }
      if (f.id === 'travel') opts.push({ t: '🌀 時空傳送', fn: () => travelNode(node) });
      else if (f.id === 'scan') opts.push({ t: '🛰 地脈探測（已啟用，請看大地圖）', fn: () => ({ text: '大地圖會顯示礦點（鐵、硝石、硫磺）、草藥，以及遠處的敵軍火銃兵。按 M 或點小地圖查看。', opts: node().opts }) });
      else if (f.id === 'mail') opts.push({ t: dv.mail ? '📦 時空郵包（今天的已送達，在傳送門旁）' : '📦 時空郵包（明天會再送來）', dis: true });
      else if (f.id === 'wind') opts.push(dv.windDay === G.day ? { t: '🌬 借東風（今天已使用）', dis: true } : { t: '🌬 借東風：轉晴並颳起東南風 5 分鐘', fn: () => { dv.windDay = G.day; startWind(); return { text: '儀器嗡嗡作響，天空的雲開始往西北飄去——東南風起了！', opts: [{ t: '離開。' }] }; } });
      else if (f.id === 'home') opts.push({ t: '🚪 歸途之門', fn: homeNode });
    }
    opts.push({ t: '離開。' });
    return { text: '儀器的螢幕閃著藍光。\n' + (joined() ? '阿凱：「我能解讀的功能都列在這裡了。」' : '螢幕上的文字是……中文？還有 2031 年的日期。'), opts };
  };
  G.ui.showDialog(DEV, node());
}
function homeNode() {
  return {
    text: '傳送門穩定地旋轉著，門的另一端隱約看得見 2026 年的港口夜景。\n' + (joined() ? '阿凱：「這次……應該能回去了。你要走嗎？」' : '要回去嗎？'),
    opts: [
      { t: '回到 2026 年', fn: () => { G.ui.close(); G.goHome && G.goHome(); return null; } },
      { t: '留在三國', fn: () => { G.flags.stayed = true; return { text: '你關掉了儀器。這個時代，還有很多事要做。' + (joined() ? '\n阿凱：「……我也留下來吧。這裡比研究所有趣多了。」' : ''), opts: [{ t: '離開。' }] }; } },
      { t: '再想想。' },
    ],
  };
}

// ---------- 借東風 ----------
export function startWind() {
  G.eastWind = 300; G.weather.kind = 'clear'; G.weather.t = 320; audio.play('whoosh', 1);
  G.ui.msg('🌬 東南風起！5 分鐘內燃燒彈範圍與傷害提高，雨也停了。', 'quest');
}

// ---------- 時空郵包 ----------
let mailMesh = null, mailNode = null;
function placeMail() {
  if (mailMesh) return;
  const x = SITES.spawn.x - 2.5, z = SITES.spawn.z - 7.5, y = heightAt(x, z);
  mailMesh = meshOf([bx(0.9, 0.6, 0.6, 0x6a6e78, 0, 0.3, 0), bx(0.94, 0.08, 0.64, 0x40d8ff, 0, 0.62, 0), bx(0.08, 0.62, 0.64, 0x40d8ff, 0, 0.31, 0)]);
  mailMesh.position.set(x, y, z); G.scene.add(mailMesh);
  if (mailNode) mailNode.stock = 1; else mailNode = world.addNode({ kind: 'mail', x, z, stock: 1 });
}
export function updateMail() {
  if (!unlocked('mail')) return;
  const dv = DV();
  if (dv.mailDay !== G.day) { dv.mailDay = G.day; dv.mail = true; G.ui.msg('📦 時空郵包送達穿越之地的傳送門旁！', 'get'); }
  if (dv.mail) placeMail();
}
export function openMail(n) {
  const dv = DV(); if (!dv.mail) return;
  dv.mail = false; n.stock = 0; if (mailMesh) { G.scene.remove(mailMesh); mailMesh = null; }
  const P = G.player, got = [];
  const give = (k, a) => { P.give(k, a); got.push(`${ITEMS[k].i}${ITEMS[k].n}×${a}`); };
  give(pick(['rifleAmmo', 'shell']), 10 + Math.floor(rnd(0, 11)));
  give('medicine', 1 + (Math.random() < 0.5 ? 1 : 0));
  give('parts', Math.random() < 0.6 ? 1 : 2);
  if (Math.random() < 0.5) give('ration', 3);
  audio.play('craft');
  G.ui.msg('📦 郵包裡是：' + got.join('、') + (Math.random() < 0.3 ? '。箱底還有一張字條：「撐住。——2031」' : '。'), 'get');
  G.save();
}
export function updateWind(dt) { if (G.eastWind > 0) { G.eastWind -= dt; if (G.eastWind <= 0) G.ui.msg('東南風漸漸停了。', 'info'); } }

// ---------- 結局文字（歸途） ----------
export function homeEnding() {
  const t = leakTier(), ak = joined() ? (G.flags.akai.xp >= 140 ? 'with' : 'stay') : 'none';
  const leak = ['你帶走的只有一把手槍，和一段沒人會相信的記憶。', '但你知道，有些軍火留在了那個時代，戰場上的火銃聲不會因你離開而停止。', '你賣出的火器已散布各方——那個時代的戰爭，因你而更加殘酷。'][t];
  const kai = { with: '阿凱和你一起穿過了門。他說，回去要先寫一篇沒人會信的論文。', stay: '阿凱留了下來。他說，想親眼看看這個時代會走向哪裡。', none: '' }[ak];
  return { title: '歸途', text: `傳送門的光吞沒了你。<br>再睜開眼時，是 2026 年港口的夜風，遠處響著警笛。<br><br>${leak}<br>${kai}` };
}
