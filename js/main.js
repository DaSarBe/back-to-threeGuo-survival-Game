import * as THREE from 'three';
import { G } from './state.js';
import { world, buildWorld, updateSky, updateNodes, heightAt, inSite, SITES, setShadows } from './world.js';
import { S, quality } from './settings.js';
import { updateWeather, rebuildRain, clearWeather } from './weather.js';
import { OR, loadOrders, checkOrders } from './orders.js';
import { loadWorkshop, saveWorkshop, tickWorkshop, openWorkshop, initWorkshopUI, depositFromAttendant, render as renderWorkshop } from './workshop.js';
import { player, updatePlayer, initInput, resetInput } from './player.js';
import { Actor, Animal, updateProjectiles, updatePickups, updateEffects, initFx, updateMines } from './entities.js';
import { ui } from './ui.js';
import { audio } from './audio.js';
import { checkQuest, QUESTS } from './quests.js';
import { spawnRecruit, giveAttendant, reslot, followers, cycleCommand } from './squad.js';
import { syncChapters, updateChapters, restoreBurned, spawnEnemy } from './chapters.js';
import { BM, loadBM, ending } from './blackmarket.js';
import { playIntro, updateIntro, skipIntro } from './intro.js';
import { syncOutposts, setDeviceActive, outposts, siteVisible } from './world.js';
import { spawnAkai, updateAkai, AK, akai, joined, addBond } from './akai.js';
import { updateBarks, say } from './barks.js';
import { initRites, updateRites, killCam, onStageRites, rite } from './rites.js';
import { addMerit, noteKill, noteDeath, noteDuel, tickPlay, rank, CHAPTERS } from './ranks.js';
import { initLights, initFlashlight, updateLights } from './lights.js';
import { commandSkill, updateSkills } from './skills.js';
import { updateDefense, siegeHit, defenseActive } from './defense.js';
import { updateTutorial, startTutorial, skipTutorial } from './tutorial.js';
import { initLayout, applyLayout, openLayoutEditor, cancelLayout } from './layout.js';
import { openHub, openDevice, openMail, updateMail, updateWind, onStageDevice, deviceStatus, homeEnding } from './device.js';
import { playLvbuDeath, playGoHome, updateStory, skipStory } from './story.js';
import { rnd, rndInt, pick, dist2 } from './util.js';
import * as SV from './saves.js';
import { initSlots, openSlots } from './slots.js';

const PI = Math.PI;
const canvas = document.getElementById('game');
let lastT = 0, started = false, basePR = 1, resScale = 1, fpsN = 0, fpsT = 0, resHold = 0;
const timers = { patrol: 40, wolf: 20, sec: 1, save: 45, deer: 10 };
const camps = G.camps = [];

// ------------------------------------------------------------------ 初始化
function init() {
  G.touch = 'ontouchstart' in window && matchMedia('(pointer: coarse)').matches;
  if (G.touch) document.body.classList.add('touch');
  const renderer = G.renderer = new THREE.WebGLRenderer({ canvas, antialias: !G.touch, powerPreference: 'high-performance' });
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = G.scene = new THREE.Scene();
  const camera = G.camera = new THREE.PerspectiveCamera(74, 1, 0.08, 2400); camera.rotation.order = 'YXZ'; scene.add(camera);
  G.world = world; G.player = player; G.ui = ui;
  initLights(scene); initFlashlight(camera);
  buildWorld(scene); initFx(scene); ui.init(); initInput(canvas); initLayout();
  G.openLayoutEditor = openLayoutEditor; G.cancelLayout = cancelLayout;
  G.commandSkill = commandSkill; G.tutorSkip = skipTutorial; G.onSiegeHit = siegeHit;
  initRites(); G.resetInput = resetInput; G.sayLine = (a, t) => say(a, t, 'greet');
  G.applySettings('all'); initWorkshopUI();
  const resize = () => {
    const w = innerWidth, h = innerHeight, asp = w / h;
    renderer.setSize(w, h, false); camera.aspect = asp;
    // 直向螢幕時加大垂直視角，維持足夠的水平視野
    G.baseFov = asp >= 1.3 ? 74 : Math.min(100, 74 + (1.3 - asp) * 38);
    if (!started) camera.fov = G.baseFov; camera.updateProjectionMatrix();
    G.vmK = Math.max(0.5, Math.min(1, asp / 1.4));
    showRotateHint(G.touch && asp < 1);
  };
  addEventListener('resize', resize); addEventListener('orientationchange', () => setTimeout(resize, 250)); resize();

  SV.migrate(); initSlots(); // 存檔槽（舊版單一存檔自動搬到存檔 1）
  document.getElementById('btn-new').onclick = () => { if (SV.anySaved()) openSlots('new', 'start'); else start(null, 1); }; // 全新玩家直接開在存檔 1
  SV.initCloud(); // 在 claude.ai 頁面登入時自動連上雲端並同步
  document.getElementById('loading').textContent = G.touch ? '觸控模式：左半螢幕移動、右半螢幕轉動視角。建議橫向握持。' : '點擊按鈕後，滑鼠將被鎖定以控制視角。';
  requestAnimationFrame(frame);
}

// 直向時提示橫放；遊戲中只顯示幾秒，不遮擋畫面
let hintTimer = 0;
function showRotateHint(on) {
  const h = document.getElementById('rotate-hint'); clearTimeout(hintTimer);
  h.classList.toggle('hidden', !on);
  if (on && started) hintTimer = setTimeout(() => h.classList.add('hidden'), 4000);
}

function start(save, slot) {
  audio.init();
  G.slot = slot || SV.firstEmpty() || 1; // 之後的自動存檔都寫到這個槽
  if (G.touch) { // 手機：嘗試全螢幕並鎖定橫向（不支援的瀏覽器會自動略過）
    try {
      const el = document.documentElement, rf = el.requestFullscreen || el.webkitRequestFullscreen;
      const p = rf ? rf.call(el, { navigationUI: 'hide' }) : null;
      const lockLand = () => { try { const o = screen.orientation; if (o && o.lock) o.lock('landscape').catch(() => { }); } catch (e) { } };
      if (p && p.then) p.then(lockLand).catch(() => { }); else lockLand();
    } catch (e) { }
  }
  const P = player, s = SITES.spawn;
  P.pos.set(s.x, heightAt(s.x, s.z + 2), s.z + 2); P.yaw = Math.atan2(-50, -80);
  if (save) {
    G.stage = save.stage; G.killed = save.killed || {}; G.day = save.day; G.time = save.time; G.flags = save.flags || {};
    const p = save.p;
    P.pos.set(p.x, heightAt(p.x, p.z), p.z); P.yaw = p.yaw;
    Object.assign(P, { hp: p.hp, hunger: p.hunger, thirst: p.thirst, inv: p.inv, owned: p.owned, mags: p.mags, armor: p.armor, canteen: p.canteen, cur: p.cur, damp: p.damp || 0 });
    loadOrders(save.orders); P.upg = p.upg || {}; P.statsChanged();
  }
  else { G.flags.diff = S.diff || 'normal'; startTutorial(); } // 新遊戲：套用選好的難度、開啟新手引導
  loadWorkshop(save && save.ws);
  populate();
  if (save && save.p.horse) { const h = spawnHorse(P.pos.x + 3, P.pos.z + 2, save.p.horse === 'red'); h.tame(); P.horse = h; }
  if (save) { // 還原隨行部隊與侍從
    const around = i => { const ang = P.yaw + Math.PI + (i - 1.5) * 0.6; return [P.pos.x - Math.sin(ang) * -6, P.pos.z - Math.cos(ang) * -6]; }; // 身後散開
    let i = 0;
    for (const [id, r] of save.squad || []) { const [x, z] = around(i++); spawnRecruit(id, x, z, r); }
    for (const id of save.gens || []) { const a = G.actors.find(x => x.id === id); if (a) { const [x, z] = around(i++); a.follow = true; a.pos.set(x, 0, z); (G.flags.hired || (G.flags.hired = {}))[id] = true; } } // 舊存檔已同行的名將視為已招攬
    reslot();
    if (save.att) for (const o of save.att) { const wp = o.ws && o.waitPos; giveAttendant(o.spec, wp ? wp.x : P.pos.x + rnd(-2, 2), wp ? wp.z : P.pos.z + rnd(-2, 2), o); }
    else if (G.stage >= 1) giveAttendant('all'); // 舊存檔：補發劉備贈送的侍從
    if (save.cmd === 'attack') G.squadCmd = 'attack';
  }
  if (G.flags.crate) for (const n of world.nodeList) if (n.kind === 'crate') n.stock = 0;
  if (G.flags.redHare && !(save && save.p.horse === 'red')) G.spawnRedHare();
  if (save) loadBM(save.bm);
  restoreBurned(); syncChapters(); outpostGuards(syncOutposts());
  if (G.flags.deviceOn) setDeviceActive(true);
  if (G.flags.akai && G.flags.akai.arrived) { // 還原阿凱：已同行就在身邊，否則在傳送門前等你
    const pr = world.portal.position, a = G.flags.akai;
    if (a.joined && !a.wait) spawnAkai(P.pos.x + 2, P.pos.z + 2); else spawnAkai(pr.x + 0.5, pr.z + 2.5);
  }
  started = true; G.started = true; showRotateHint(G.touch && innerWidth < innerHeight);
  document.getElementById('hud').classList.remove('hidden');
  if (G.touch) document.getElementById('touch').classList.remove('hidden');
  ui.close(); ui.dirty = true; // 在點擊「開始」的當下鎖定滑鼠
  if (!save) playIntro(afterIntro); // 新遊戲先播開場動畫
  else ui.msg(`讀取進度：第 ${G.day} 日。`, 'info');
}
function afterIntro() {
  ui.dirty = true;
  rite({ type: 'chapter', stage: G.stage, now: true });
  ui.msg('……頭好痛。這裡是哪裡？手機沒有訊號，四周只有荒野。', 'say');
  setTimeout(() => ui.msg('身旁有一只跟你一起掉下來的軍火箱，先打開看看。', 'say'), 3500);
  if (!G.touch && !document.pointerLockElement) ui.msg('點一下畫面，開始操控視角。', 'info');
}

// ------------------------------------------------------------------ 佈置角色
function general(id, xz, face) { const a = new Actor(id, xz[0], xz[1]); if (face) a.homeYaw = a.yaw = Math.atan2(face[0] - xz[0], face[1] - xz[1]); return a; }
function spawnHorse(x, z, red, tamed) {
  return red ? new Animal('horse', x, z, { color: 0xa8281a, name: '赤兔馬', maxSpeed: 21, scale: 1.1, label: '赤兔馬' })
    : new Animal('horse', x, z, { tamed, blanket: 0x2f6b3a });
}
function landNear(cx, cz, rmin, rmax, pad = 6) {
  for (let i = 0; i < 30; i++) {
    const a = rnd(PI * 2), d = rnd(rmin, rmax), x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d, h = heightAt(x, z);
    if (h > 0.6 && h < 26 && !inSite(x, z, pad) && Math.abs(x) < 460 && Math.abs(z) < 460) return [x, z];
  }
  return null;
}
function garrison(boss, list) {
  const camp = { boss, members: list.map(([id, x, z]) => ({ id, x, z, actor: null })) };
  if (!G.killed[boss]) for (const m of camp.members) m.actor = m.id === boss ? new Actor(m.id, m.x, m.z) : spawnEnemy(m.id, m.x, m.z);
  camps.push(camp);
}
const ring = (cx, cz, n, r0, r1, types, a0 = 0, a1 = PI * 2) => Array.from({ length: n }, (_, i) => { const a = a0 + (a1 - a0) * (i + rnd(0.6)) / n, r = rnd(r0, r1); return [pick(types), cx + Math.cos(a) * r, cz + Math.sin(a) * r]; });

function populate() {
  const sp = world.spots, S = SITES, c = [S.camp.x, S.camp.z];
  // 劉備軍營
  general('liubei', sp.liubei, c); general('guanyu', sp.guanyu, c); general('zhangfei', sp.zhangfei, c); general('zhaoyun', sp.zhaoyun, c);
  general('mizhu', sp.mizhu, [sp.mizhu[0], sp.mizhu[1] - 5]);
  const g = sp.campGate;
  for (const [dx, dz] of [[3, 2], [-3, -2], [8, 14], [-14, 6], [-9, 20], [14, -10], [-16, -4], [4, -8]]) {
    const near = Math.abs(dx) === 3, x = near ? g[0] + dx : c[0] + dx, z = near ? g[1] + dz : c[1] + dz;
    const a = new Actor('ally_soldier', x, z); a.homeYaw = a.yaw = Math.atan2(S.spawn.x - x, S.spawn.z - z);
  }
  for (let i = 0; i < 3; i++) spawnHorse(sp.stable[0] - 3 + i * 3, sp.stable[1], false, true);
  // 聯軍大營
  const co = [S.coalition.x, S.coalition.z];
  general('caocao', sp.caocao, [co[0], co[1] + 10]); general('sunjian', sp.sunjian, [co[0], co[1] + 10]);
  for (const [dx, dz] of [[-12, 8], [12, 8], [-4, 16], [5, 17], [-20, -2], [20, -3]]) { const a = new Actor('co_soldier', co[0] + dx, co[1] + dz); a.homeYaw = a.yaw = 0; }
  for (let i = 0; i < 2; i++) spawnHorse(sp.coHorse[0] + i * 3, sp.coHorse[1], false, true);
  general('broker', sp.broker, [SITES.blackmarket.x + 3, SITES.blackmarket.z + 2]); // 黑市掮客

  // 敵營
  const T3 = ['turban_blade', 'turban_spear', 'turban_archer', 'turban_blade'], X3 = ['xl_blade', 'xl_spear', 'xl_archer', 'xl_blade'];
  let s = S.turban;
  garrison('zhangjiao', [['zhangjiao', ...sp.zhangjiao], ...ring(s.x, s.z, 9, 8, 17, T3), ...ring(s.x, s.z, 6, 20, 30, T3)]);
  for (const id of ['sishui', 'hulao']) {
    s = S[id]; const [bx, bz] = sp[id], hard = id === 'hulao';
    garrison(hard ? 'lvbu' : 'huaxiong', [[hard ? 'lvbu' : 'huaxiong', bx, bz], ...ring(bx, bz + 4, hard ? 13 : 10, 6, 20, X3, 0.1, PI - 0.1), ['xl_cav', bx - 18, bz + 14], ['xl_cav', bx + 18, bz + 14], ...(hard ? [['xl_cav', bx, bz + 24]] : [])]);
  }
  s = S.meiwu;
  garrison('dongzhuo', [['dongzhuo', ...sp.dongzhuo], ...ring(s.x, s.z - 6, 14, 7, 24, X3), ...ring(sp.meiwuGate[0], sp.meiwuGate[1], 4, 2, 7, X3), ['xl_cav', sp.meiwuGate[0] - 10, sp.meiwuGate[1] - 6], ['xl_cav', sp.meiwuGate[0] + 10, sp.meiwuGate[1] - 6]]);

  // 野生動物
  for (let i = 0; i < 7; i++) { const p = landNear(rnd(-350, 350), rnd(-350, 350), 0, 60, 30); if (p) spawnHorse(p[0], p[1], false, false); }
  const p0 = landNear(-25, -30, 0, 14); if (p0) spawnHorse(p0[0], p0[1], false, false); // 出生點附近必有一匹野馬
  for (let i = 0; i < 14; i++) spawnDeer();
}
function spawnDeer(far) {
  const P = player, p = far ? landNear(P.pos.x, P.pos.z, 130, 220, 25) : landNear(rnd(-380, 380), rnd(-380, 380), 0, 50, 25);
  if (p) new Animal('deer', p[0], p[1]);
}

// ------------------------------------------------------------------ 遊戲掛鉤
G.spawnRedHare = () => { G.flags.redHare = true; const s = world.spots.hulao; spawnHorse(s[0] + 6, s[1] + 16, true); };
G.openCrate = (n) => {
  n.stock = 0; G.flags.crate = true; audio.play('craft');
  ui.msg('軍火箱裡是你原本要交貨的「樣品」，還有幾包軍用口糧。', 'say');
  for (const [it, k] of [['grenade', 3], ['powder', 4], ['iron', 4], ['ration', 3], ['medicine', 2]]) player.give(it, k, true);
};
G.sleep = () => {
  if (!(G.time >= 1080 || G.time < 300)) return ui.msg('天色尚早，還不想睡（酉時 18:00 後可就寢）。', 'info');
  for (const a of G.actors) if (a.alive && a.faction === 'enemy' && dist2(a.pos.x, a.pos.z, player.pos.x, player.pos.z) < 60) return ui.msg('附近有敵人，無法安心入睡！', 'warn');
  ui.fade(true);
  setTimeout(() => {
    if (G.time >= 1080) G.day++; G.time = 360;
    clearWeather(); player.damp = 0;
    player.hp = Math.min(player.maxHp, player.hp + 60); player.hunger = Math.max(15, player.hunger - 18); player.thirst = Math.max(15, player.thirst - 18);
    onDawn(); ui.fade(false); ui.msg(`一夜無事。第 ${G.day} 日清晨，進度已儲存。`, 'get'); G.save();
  }, 800);
};
const UNLOCK_MSG = {
  zhangjiao: '關羽、張飛可以招攬了！回劉備軍營找他們。',
  huaxiong: '趙雲、曹操、孫堅可以招攬了！（演義中華雄是關羽溫酒所斬——這回你搶先了一步。）',
  lvbu: '劉備願意親自隨你出征——到軍營招攬他吧！',
  yanliang: '（演義中顏良是關羽在白馬陣前所斬——這回換你立了頭功。）',
};
function outpostGuards(ids, n = 2) { // 前哨營派兩名守衛（黎明時補足陣亡的守衛）
  for (const id of ids) {
    const [cx, cz] = world.spots[id], have = G.actors.filter(a => a.alive && a.outpost === id).length;
    for (const k of [-1, 1].slice(0, Math.max(0, n - have))) { const g = new Actor('ally_soldier', cx + k * 3, cz + 4); g.outpost = id; g.homeYaw = g.yaw = Math.atan2(SITES.camp.x - cx, SITES.camp.z - cz) + PI; }
  }
}
G.onKill = (a, src) => {
  const P = player, byP = src === P, byAlly = src && src.faction === 'ally';
  if (byP || byAlly) noteKill(byP);
  if (a.def.boss) {
    const duel = G.battle && G.battle.mode === 'duel' && G.battle.boss === a;
    killCam(a, !!a.def.flee); // 慢動作＋「斬　某某」＋朱印，附近敵兵潰散
    addMerit(30, `${a.def.flee ? '擊退' : '斬殺'}${a.name}`, true);
    if (duel) { noteDuel(); addMerit(20, '單挑勝利', true); }
  }
  if (a.id === 'lvbu' && !AK().arrived) rite({ type: 'fn', fn: () => playLvbuDeath(a) }); // 呂布陣亡動畫 → 阿凱登場
  if (a.def.boss) {
    ui.msg(`${a.name} 已被擊敗！`, 'quest'); audio.play('horn', 0.8); checkQuest();
    if (UNLOCK_MSG[a.id]) setTimeout(() => ui.msg('🔓 ' + UNLOCK_MSG[a.id], 'quest'), 1800);
  }
};
G.cycleCommand = cycleCommand;
G.skipIntro = skipIntro;
// 暫停選單：重看開場動畫，看完回到遊戲
G.startGame = start;
G.replayIntro = () => { ui.close(); playIntro(() => ui.msg('回到亂世。', 'info')); };
G.checkQuest = checkQuest;
// 主線推進：生成新章節敵營；赤壁之後顯示結局
G.onStage = done => {
  syncChapters(); outpostGuards(syncOutposts()); onStageDevice(done);
  if (joined()) addBond(25, '一起完成主線');
  if (done >= 0 && SITES['op_' + ['turban', 'sishui', 'hulao', 'meiwu', 'baima', 'wuchao', 'changban', 'chibi'][done]]) setTimeout(() => ui.msg('⛺ 下一個頭目據點前方設立了友軍前哨營，可在那裡存檔、重生。', 'info'), 5200);
  if (done === 0) setTimeout(() => ui.msg('🚩 營區的令旗台除了存檔，還能發起「守營戰」：擊退來襲的敵軍領取獎賞。', 'info'), 9000);
  if (done === 4) setTimeout(() => ui.msg('董卓伏誅，然而天下並未太平——袁紹已在北方起兵。', 'quest'), 2500);
  onStageRites(done, done === 8 ? () => { const e = ending(); document.getElementById('win-title').textContent = e.title; document.getElementById('win-story').innerHTML = e.text; ui.open('win'); } : null);
};
G.openWorkshop = openWorkshop;
G.openHub = openHub; G.openDevice = openDevice; G.openMail = openMail; G.deviceStatus = deviceStatus; G.skipStory = skipStory;
G.goHome = () => playGoHome(() => {
  const e = homeEnding(); document.getElementById('win-title').textContent = e.title; document.getElementById('win-story').innerHTML = e.text;
  document.getElementById('btn-title').classList.remove('hidden'); document.querySelector('#menu-win [data-close]').textContent = '……睜開眼，原來還在亂世？（繼續遊玩）'; ui.open('win');
});
G.wsDeposit = depositFromAttendant;
// 玩家倒下被救回營地：隨行部隊與侍從一起撤回
G.onRespawn = () => {
  const P = player; noteDeath();
  if (G.squadCmd === 'hold') { G.squadCmd = 'follow'; G.holdPos = null; }
  for (const a of followers()) { a.target = null; a.pos.set(P.pos.x + rnd(-4, 4), 0, P.pos.z + rnd(-4, 4)); }
  for (const a of G.attendants) { if (a.ws) continue; a.wait = false; a.state = 'idle'; a.node = null; a.pos.set(P.pos.x + rnd(-2, 2), 0, P.pos.z + rnd(-2, 2)); }
  if (followers().length) ui.msg('隨行部隊護送你撤回了營地。', 'info');
};
// 存到目前的存檔槽（G.slot）。opts.now：立刻上傳雲端（手動存檔、返回標題、切到背景時）。回傳是否存成功
G.save = opts => {
  const P = player; if (!started || !P.alive || !G.slot) return false;
  const q = QUESTS[G.stage], ch = CHAPTERS[Math.min(G.stage, CHAPTERS.length - 1)];
  const d = { v: 1, ts: Date.now(), stage: G.stage, killed: G.killed, day: G.day, time: G.time, flags: G.flags, p: { x: P.pos.x, z: P.pos.z, yaw: P.yaw, hp: P.hp, hunger: P.hunger, thirst: P.thirst, inv: P.inv, owned: P.owned, mags: P.mags, armor: P.armor, canteen: P.canteen, cur: P.cur, damp: Math.round(P.damp), upg: P.upg, horse: P.horse ? (P.horse.name === '赤兔馬' ? 'red' : 'yes') : null },
    squad: followers().filter(a => a.recruited).map(a => [a.id, +(a.hp / a.maxHp).toFixed(2)]),
    gens: followers().filter(a => a.def.general).map(a => a.id),
    att: G.attendants.map(a => ({ spec: a.spec, inv: a.inv, focus: a.focus, wait: a.wait, waitPos: a.waitPos, ws: !!a.ws })),
    cmd: G.squadCmd, orders: OR, ws: saveWorkshop(), bm: BM,
    meta: { stage: G.stage, day: G.day, chap: ch ? ch.no : '', title: q ? q.t : '', rank: rank().n, play: Math.round((G.flags.rank && G.flags.rank.play) || 0), diff: G.flags.diff || '' } }; // meta：存檔槽畫面上的摘要
  if (!SV.write(G.slot, d)) { if (!G.saveWarned) { G.saveWarned = true; ui.msg('存檔失敗：瀏覽器的儲存空間不足或被禁用。', 'warn'); } return false; }
  SV.cloudSaved(G.slot, !!(opts && opts.now));
  return true;
};
// 另存到指定的存檔槽，之後的自動存檔也寫到那裡
G.saveTo = n => {
  const prev = G.slot; G.slot = n;
  if (!G.save({ now: true })) { G.slot = prev; ui.msg('目前無法存檔。', 'warn'); return false; }
  ui.msg(`已存到「存檔 ${n}」。之後的自動存檔也會存在這裡。`, 'info'); G.pauseLine && G.pauseLine(); return true;
};

// ------------------------------------------------------------------ 導演：巡邏、夜襲、狼群、重生
function enemyTypes() {
  const s = G.stage;
  return s < 2 ? ['turban_blade', 'turban_spear', 'turban_archer', 'turban_blade'] : s < 3 ? ['turban_blade', 'xl_blade', 'xl_spear', 'xl_archer'] : s < 5 ? ['xl_blade', 'xl_spear', 'xl_archer', 'xl_blade', 'xl_cav']
    : s < 7 ? ['yuan_blade', 'yuan_spear', 'yuan_archer', 'yuan_blade', 'yuan_cav'] : ['cao_blade', 'cao_spear', 'cao_archer', 'cao_blade', 'cao_cav'];
}
function spawnGroup(n, rmin, rmax, hunt) {
  const P = player, p = landNear(P.pos.x, P.pos.z, rmin, rmax); if (!p) return false;
  const types = enemyTypes();
  for (let i = 0; i < n; i++) { const a = spawnEnemy(pick(types), p[0] + rnd(-5, 5), p[1] + rnd(-5, 5), { roam: true }); if (hunt) { a.alert = 40; a.target = P; } }
  return true;
}
function onDawn() {
  const P = player;
  const r = rank(); if (r.pay > 0) { P.give('coin', r.pay); ui.msg(`領到日俸 ${r.pay} 錢（官職：${r.n}）。`, 'get'); }
  for (const c of camps) {
    if (G.killed[c.boss] || dist2(P.pos.x, P.pos.z, c.members[0].x, c.members[0].z) < 170) continue;
    for (const m of c.members) if (m.actor && !m.actor.alive && !m.actor.def.boss) m.actor = spawnEnemy(m.id, m.x, m.z);
  }
  // 陣亡的友軍士卒補員
  const allies = G.actors.filter(a => a.alive && a.id === 'ally_soldier' && !a.outpost).length;
  for (let i = allies; i < 8; i++) new Actor('ally_soldier', SITES.camp.x + rnd(-15, 15), SITES.camp.z + rnd(-15, 10));
  outpostGuards(outposts().filter(id => siteVisible(id) && world.spots[id]));
}
function director(dt) {
  const P = player, prev = G.time;
  G.time += dt * 2; // 一日 = 現實 12 分鐘
  if (G.time >= 1440) { G.time -= 1440; G.day++; }
  const cross = t => prev < t && G.time >= t;
  if (cross(300)) { onDawn(); ui.msg(`第 ${G.day} 日，天亮了。`, 'info'); }
  if (cross(1170)) { ui.msg('夜幕降臨……狼群與賊兵開始出沒，回營地或生起戒心。', 'warn'); audio.play('wolf', 0.7); }
  if (cross(1275) && G.stage >= 1 && !defenseActive() && !outposts().some(id => siteVisible(id) && dist2(P.pos.x, P.pos.z, SITES[id].x, SITES[id].z) < 45)) { // 前哨營是安全區，不會有夜襲
    const n = Math.min(3 + G.day, 9);
    if (spawnGroup(n, 55, 75, true)) { ui.msg('⚠ 號角聲響起——有賊兵趁夜來襲！', 'warn'); audio.play('horn'); }
  }
  const nearOutpost = outposts().some(id => siteVisible(id) && dist2(P.pos.x, P.pos.z, SITES[id].x, SITES[id].z) < 45);
  const nearCamp = nearOutpost || dist2(P.pos.x, P.pos.z, SITES.camp.x, SITES.camp.z) < 90 || dist2(P.pos.x, P.pos.z, SITES.coalition.x, SITES.coalition.z) < 70 || dist2(P.pos.x, P.pos.z, 0, 0) < 45 && G.stage === 0;
  timers.patrol -= dt;
  if (timers.patrol <= 0) {
    timers.patrol = rnd(55, 95);
    const near = G.actors.filter(a => a.alive && a.faction === 'enemy' && dist2(a.pos.x, a.pos.z, P.pos.x, P.pos.z) < 130).length;
    if (!nearCamp && near < 5 && !defenseActive()) spawnGroup(rndInt(2, G.stage >= 2 ? 4 : 3), 75, 100, false);
  }
  timers.wolf -= dt;
  if (timers.wolf <= 0) {
    timers.wolf = rnd(40, 70);
    if (world.isNight && !nearCamp && G.animals.filter(a => a.alive && a.kind === 'wolf').length < 4) {
      const p = landNear(P.pos.x, P.pos.z, 50, 70);
      if (p) { for (let i = 0; i < rndInt(2, 3); i++) new Animal('wolf', p[0] + rnd(-4, 4), p[1] + rnd(-4, 4)); audio.play('wolf', 0.6); }
    }
  }
  timers.deer -= dt;
  if (timers.deer <= 0) { timers.deer = 30; if (G.animals.filter(a => a.alive && a.kind === 'deer').length < 12) spawnDeer(true); }
  timers.sec -= dt;
  if (timers.sec <= 0) {
    timers.sec = 1; checkQuest(); checkOrders(); updateMail();
    for (const id of outposts()) { // 抵達前哨營即設為重生點
      if (!siteVisible(id) || G.flags.respawnAt === id) continue;
      if (dist2(P.pos.x, P.pos.z, SITES[id].x, SITES[id].z) < 14) { G.flags.respawnAt = id; ui.msg(`⛺ 抵達${SITES[id].name}，戰死將在此重生（令旗台可存檔、傳送）。`, 'info'); G.save(); }
    }
    for (const a of G.actors) if (a.roam && a.alive && !a.target && dist2(a.pos.x, a.pos.z, P.pos.x, P.pos.z) > 280) { G.scene.remove(a.m.root); a.gone = true; a.alive = false; }
    G.actors = G.actors.filter(a => !a.gone); G.animals = G.animals.filter(a => !a.gone);
  }
  timers.save -= dt; if (timers.save <= 0) { timers.save = 45; G.save(); }
}
function separate() {
  const P = player, list = G.actors.filter(a => a.alive && a.m.root.visible && Math.abs(a.pos.x - P.pos.x) < 120 && Math.abs(a.pos.z - P.pos.z) < 120);
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j], dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, r = (a.radius + b.radius) * 0.95, d2 = dx * dx + dz * dz;
      if (d2 < r * r && d2 > 1e-4) { const d = Math.sqrt(d2), k = (r - d) / d * 0.5; if (!a.def.noncombat) { a.pos.x -= dx * k; a.pos.z -= dz * k; } if (!b.def.noncombat) { b.pos.x += dx * k; b.pos.z += dz * k; } }
    }
    const dx = a.pos.x - P.pos.x, dz = a.pos.z - P.pos.z, r = a.radius + (P.mount ? 0.9 : 0.4), d2 = dx * dx + dz * dz;
    if (d2 < r * r && d2 > 1e-4) {
      const d = Math.sqrt(d2), k = (r - d) / d;
      if (a.def.noncombat || a.def.boss) { if (!P.mount) { P.pos.x -= dx * k; P.pos.z -= dz * k; } } else { a.pos.x += dx * k; a.pos.z += dz * k; }
    }
  }
}

// 動態解析度：掉幀時自動降低渲染解析度，流暢後再慢慢調回
function adaptResolution(t) {
  fpsN++; if (!fpsT) fpsT = t;
  if (t - fpsT < 1500) return;
  const fps = fpsN * 1000 / (t - fpsT); fpsN = 0; fpsT = t; resHold--;
  let s = resScale;
  if (fps < 40 && s > 0.55) { s = Math.max(0.55, s - 0.15); resHold = 8; }
  else if (fps > 57 && s < 1 && resHold <= 0) s = Math.min(1, s + 0.1);
  if (s !== resScale) { resScale = s; G.renderer.setPixelRatio(basePR * s); G.renderer.setSize(innerWidth, innerHeight, false); }
}

// ------------------------------------------------------------------ 開戰動畫
const M4 = new THREE.Matrix4(), UP = new THREE.Vector3(0, 1, 0), QA = new THREE.Quaternion(), QB = new THREE.Quaternion();
const ease = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
const lookQ = (eye, target, out) => out.setFromRotationMatrix(M4.lookAt(eye, target, UP));
let askT = 0;
function checkArena(dt) {
  const P = player;
  // 進行中的戰鬥：敵將倒下或玩家離開決戰圈太久就結束
  const B = G.battle;
  if (B) {
    if (!B.boss.alive) G.battle = null;
    else if (!P.alive || !B.boss.inArena(P)) { B.out = (B.out || 0) + dt; if (B.out > 4 || !P.alive) { if (B.mode === 'duel') ui.msg(`你退出了與${B.boss.name}的單挑。`, 'warn'); G.battle = null; askT = G.now + 3; } }
    else B.out = 0;
    return;
  }
  if (!P.alive) return;
  for (const a of G.actors) {
    if (!a.alive || !a.arena || !a.inArena(P)) continue;
    if (!G.flags['intro_' + a.id]) { startCutscene(a); return; }
    if (G.now > askT) { askBattle(a); return; }
  }
}
// 單挑或群戰
function askBattle(boss) {
  const n = followers().length;
  ui.showDialog(boss, {
    text: `${boss.name}橫刀立馬，目光如炬。\n要與他一對一單挑，還是率眾群戰？` + (n ? `\n（目前有 ${n} 名隨行部隊）` : ''),
    opts: [
      { t: '⚔ 單挑——隊友退到圈外觀戰；勝利賞金加倍，必定奪得專屬兵器', fn: () => { startBattle(boss, 'duel'); return null; } },
      { t: '🛡 群戰——率領部隊一起上（專屬兵器 25% 機率掉落）', fn: () => { startBattle(boss, 'group'); return null; } },
    ],
  });
}
function startBattle(boss, mode) {
  G.battle = { boss, mode, out: 0 };
  boss.alert = 30; boss.target = player; boss.atkT = 1;
  ui.msg(mode === 'duel' ? `⚔ 與${boss.name}單挑！隊友不會插手，敵兵也在旁觀戰。離開決戰圈就算退出。` : `🛡 與${boss.name}群戰！在決戰圈內才能傷到他。`, 'quest');
  if (mode === 'duel') audio.play('clang', 0.8);
}
function startCutscene(boss) {
  G.flags['intro_' + boss.id] = true;
  const cam = G.camera, P = player, s = boss.scale;
  const dx = P.pos.x - boss.pos.x, dz = P.pos.z - boss.pos.z, d = Math.hypot(dx, dz) || 1, fx = dx / d, fz = dz / d;
  boss.yaw = Math.atan2(dx, dz); boss.m.root.rotation.y = boss.yaw; boss.wind = 0;
  const yb = boss.pos.y + boss.seat;
  const mk = (dist, side, h) => { const x = boss.pos.x + fx * dist - fz * side, z = boss.pos.z + fz * dist + fx * side; return new THREE.Vector3(x, Math.max(yb + h * s, heightAt(x, z) + 1), z); };
  G.cutscene = {
    boss, t: 0, p0: cam.position.clone(), q0: cam.quaternion.clone(),
    a: mk(9, 3.5, 3.2), b: mk(3.4 * s, 1.0, 1.75), look: new THREE.Vector3(boss.pos.x, yb + 1.5 * s, boss.pos.z), horn: false, vis: [],
  };
  for (const c of cam.children) { G.cutscene.vis.push([c, c.visible]); c.visible = false; }
  resetInput(); G.menu = 'cutscene'; ui.cine(true, boss); ui.prompt(null);
}
function updateCutscene(dt) {
  const c = G.cutscene, cam = G.camera, b = c.boss, t = (c.t += dt);
  if (t < 1.0) { const k = ease(t); cam.position.lerpVectors(c.p0, c.a, k); lookQ(c.a, c.look, QA); cam.quaternion.slerpQuaternions(c.q0, QA, k); }
  else if (t < 3.8) { cam.position.lerpVectors(c.a, c.b, ease((t - 1) / 2.8)); lookQ(cam.position, c.look, cam.quaternion); }
  else { const k = ease((t - 3.8) / 0.8); cam.position.lerpVectors(c.b, c.p0, k); lookQ(c.b, c.look, QA); cam.quaternion.slerpQuaternions(QA, c.q0, k); }
  if (t > 1.1 && !c.horn) { c.horn = true; audio.play('horn', 0.9); }
  // 敵將舉起兵器
  const raise = t > 1.4 && t < 3.4 ? -2.7 : -0.35;
  b.m.armR.rotation.x += (raise - b.m.armR.rotation.x) * Math.min(1, dt * 6);
  if (t > 1.4 && t < 1.4 + dt) audio.play('clang', 0.6);
  ui.cineStep(t > 1.1 && t < 4.0, t > 1.7 && t < 4.0 ? b.def.line : null);
  if (t >= 4.6) endCutscene();
}
function endCutscene() {
  const c = G.cutscene; if (!c) return;
  for (const [o, v] of c.vis) o.visible = v;
  G.cutscene = null; G.menu = null; ui.cine(false);
  askBattle(c.boss);
}
G.skipCutscene = () => endCutscene();

// ------------------------------------------------------------------ 套用設定
G.applySettings = (key = 'all') => {
  const all = key === 'all';
  if (all || key === 'sfx' || key === 'music') audio.setVolumes(S.sfx, S.music);
  if (all || key === 'btn') { document.body.style.setProperty('--bs', S.btn); ui.dirty = true; }
  if (all || key === 'layout') applyLayout();
  if (all || key === 'quality') {
    const q = quality();
    basePR = Math.min(devicePixelRatio || 1, q.pr); resScale = 1; resHold = 0;
    G.renderer.setPixelRatio(basePR); G.renderer.setSize(innerWidth, innerHeight, false);
    setShadows(q.shadows); G.fogScale = q.fog; rebuildRain();
  }
};

// ------------------------------------------------------------------ 主迴圈
function frame(t) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (t - lastT) / 1000 || 0.016); lastT = t;
  if (G.slow) { // 頭目終結：先慢動作，再漸漸恢復正常速度
    const s = G.slow; s.t += dt;
    const k = s.t < s.hold ? 0.2 : Math.min(1, 0.2 + (s.t - s.hold) / (s.dur - s.hold) * 0.8);
    if (s.t >= s.dur) G.slow = null; else dt *= k;
  }
  const cam = G.camera;
  if (!started) { // 標題畫面：環繞軍營
    const a = t / 9000, s = SITES.camp;
    cam.position.set(s.x + Math.cos(a) * 70, s.y + 26, s.z + Math.sin(a) * 70); cam.lookAt(s.x, s.y + 4, s.z);
    G.now += dt; updateSky(dt, cam.position); updateLights(dt);
  } else if (!G.menu) {
    G.now += dt;
    director(dt);
    updateWeather(dt); tickWorkshop(dt); updateChapters(dt);
    updatePlayer(dt);
    for (const a of G.actors) a.update(dt);
    for (const a of G.animals) a.update(dt);
    for (const a of G.attendants) a.update(dt);
    updateAkai(dt); updateWind(dt); updateSkills(dt); updateDefense(dt); updateLights(dt); tickPlay(dt);
    separate();
    checkArena(dt);
    updateProjectiles(dt); updatePickups(dt); updateEffects(dt); updateNodes(dt); updateMines(dt);
    updateSky(dt, cam.position);
    ui.update(dt);
    adaptResolution(t);
  } else if (G.menu === 'story') {
    updateStory(dt);
  } else if (G.menu === 'intro') {
    updateIntro(dt);
  } else if (G.menu === 'cutscene') {
    updateCutscene(dt); updateSky(dt, cam.position);
  }
  if (started) { updateBarks(G.menu ? 0 : dt); updateTutorial(dt); updateRites(dt); } // 選單開著時泡泡暫停並隱藏
  G.renderer.render(G.renderScene || G.scene, cam);
}

window.__G = G;
init();
