// 阿凱：來自 2031 年的穿越者。不會攻擊也不會被攻擊；戰鬥時半透明躲在一旁；羈絆越高支援越多
import * as THREE from 'three';
import { G } from './state.js';
import { humanoid } from './models.js';
import { world, heightAt, WATER, SITES } from './world.js';
import { audio } from './audio.js';
import { ITEMS } from './data.js';
import { lerp, clamp, rnd, pick, turnTo, makeLabel } from './util.js';
import { say } from './barks.js';

const PI = Math.PI;
// ---------- 羈絆 ----------
const BOND_XP = [0, 20, 50, 90, 140, 200];
export const BOND = [
  null,
  { n: '戰場分析', d: '受傷的敵人頭上顯示血條；大地圖偵測敵兵範圍變大' },
  { n: '現代急救', d: '脫離戰鬥後幫你包紮，生命回復加快 2.5 倍' },
  { n: '防潮塗層', d: '火藥受潮速度減半，自製彈藥啞火率降低 40%' },
  { n: '緊急救援', d: '每天一次，你快倒下時把你拉回來，保留 30 點生命' },
  { n: '科技改良', d: '製作少用 20% 材料、工坊每批有兩成機率不耗原料；解鎖「凱式連發槍」' },
];
export const AK = () => G.flags.akai || (G.flags.akai = { arrived: false, joined: false, xp: 0, chatDay: 0, giftDay: 0, gifts: 0, rescueDay: 0, wait: false });
export const joined = () => !!(G.flags.akai && G.flags.akai.joined);
export function bondLv() { if (!joined()) return 0; const x = AK().xp; let l = 0; for (let i = 1; i < BOND_XP.length; i++) if (x >= BOND_XP[i]) l = i; return l; }
export const hasBond = n => bondLv() >= n;
export const regenMul = () => hasBond(2) ? 2.5 : 1;
export const dampMul = () => hasBond(3) ? 0.5 : 1;
export const misfireMul = () => hasBond(3) ? 0.6 : 1;
export const scanRange = () => hasBond(1) ? 170 : 110;
export const costMul = () => hasBond(5) ? 0.8 : 1;
export const cheaper = n => n >= 2 ? Math.ceil(n * costMul()) : n; // 製作材料（Lv5 少兩成）
export function tryRescue() {
  if (!hasBond(4) || AK().rescueDay === G.day) return false;
  AK().rescueDay = G.day;
  G.ui.msg('阿凱：「撐住！」——他衝上來替你止血，把你從鬼門關拉了回來。（緊急救援，今天已使用）', 'quest');
  audio.play('drink'); return true;
}
export function addBond(n, why = '') {
  if (!joined()) return;
  const before = bondLv(); AK().xp += n; const after = bondLv();
  if (why) G.ui.msg(`🤝 與阿凱的羈絆 +${n}（${why}）`, 'get');
  if (after > before) {
    G.ui.msg(`🤝 與阿凱的羈絆提升到 Lv${after}：${BOND[after].n}——${BOND[after].d}`, 'quest'); audio.play('quest', 0.7);
    if (after >= 5 && !AK().gaveParts) { AK().gaveParts = true; G.player.give('parts', 3, true); G.ui.msg('阿凱：「我畫好連發槍的圖紙了，零件先給你，去製作頁看看！」', 'say'); }
  }
}

// ---------- 阿凱本人 ----------
const AK_LINES = {
  idle: ['這裡的空氣好乾淨，沒有 PM2.5。', '我在算傳送門的共振頻率……', '要是有手機訊號就好了。', '這個時代的人力氣好大。', '你的槍保養得真好。'],
  night: ['這個時代的星空好美……', '不知道研究所的人有沒有在找我。'],
  fight: ['我、我先躲一下！', '小心！我幫你盯著！', '別管我，我不會被打到！'],
};
let A = null, bars = new Map();
const LOOK = { skin: 0xe8bc94, cloth: 0xe8e8ee, pants: 0x2a3550, hat: 'short', glasses: true };
class Akai {
  constructor(x, z) {
    this.id = 'akai'; this.name = '阿凱'; this.def = { title: '來自 2031 年的穿越者・工程師', noncombat: true };
    this.pos = new THREE.Vector3(x, heightAt(x, z), z); this.yaw = 0; this.walkPh = 0; this.curSpeed = 0; this.op = 1; this.wp = [0, 0]; this.wpT = 0; this.stuckT = 0; this.alive = true;
    const m = this.m = humanoid(LOOK, null, null, 0.95);
    this.mats = [];
    m.root.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; this.mats.push(o.material); } });
    const l = this.label = makeLabel('阿凱', '#7ae0ff'); l.material.sizeAttenuation = false; l.scale.set(0.26, 0.065, 1); l.position.y = 2.1; m.root.add(l);
    m.root.position.copy(this.pos); G.scene.add(m.root);
    this.lostT = 0; this.shout = 0; this.bubbleY = 2.5; this.chatT = rnd(30, 50); this.wasDanger = false;
  }
  get radius() { return 0.38; }
  setOpacity(v) { if (Math.abs(v - this.op) < 0.005) return; this.op = v; for (const mt of this.mats) mt.opacity = v; this.label.material.opacity = Math.max(0.35, v); }
  update(dt) {
    const P = G.player, ak = AK(), m = this.m, dp = Math.hypot(this.pos.x - P.pos.x, this.pos.z - P.pos.z);
    let goal = null, speed = 0, face = null;
    if (!ak.joined) { // 迷茫地在傳送門前張望，偶爾喊人
      this.lostT += dt; face = Math.sin(this.lostT * 0.7) * 1.4 + PI;
      if (dp < 45 && G.now - this.shout > 25) { this.shout = G.now; G.ui.msg(pick(['阿凱：「喂——！那邊的人！你聽得懂我說話嗎？」', '阿凱：「拜託，有人能告訴我這是哪裡嗎？」', '阿凱：「你……你身上那是槍？！等等，別走！」']), 'say'); }
    } else if (ak.wait) {
      if (dp < 8) face = Math.atan2(P.pos.x - this.pos.x, P.pos.z - this.pos.z);
    } else if (dp > 70) { this.pos.set(P.pos.x - Math.sin(P.yaw) * -3 + rnd(-1, 1), 0, P.pos.z - Math.cos(P.yaw) * -3 + rnd(-1, 1)); }
    else if (dp > 5) { goal = P.pos; speed = dp > 14 ? (P.mount ? 15 : 8.8) : 4.6; }
    else face = Math.atan2(P.pos.x - this.pos.x, P.pos.z - this.pos.z);
    if (goal) {
      this.wpT -= dt; if (this.wpT <= 0) { this.wpT = 0.3; world.route(this.pos.x, this.pos.z, goal.x, goal.z, this.wp); }
      let mx = this.wp[0] - this.pos.x, mz = this.wp[1] - this.pos.z; const l = Math.hypot(mx, mz) || 1; mx /= l; mz /= l;
      if (heightAt(this.pos.x, this.pos.z) < WATER - 0.2) speed *= 0.55;
      const ox = this.pos.x, oz = this.pos.z; this.pos.x += mx * speed * dt; this.pos.z += mz * speed * dt; world.resolve(this.pos, this.radius);
      if (Math.hypot(this.pos.x - ox, this.pos.z - oz) < speed * dt * 0.3) { this.stuckT += dt; if (this.stuckT > 2.5) { this.stuckT = 0; this.pos.x += mx * 2.5; this.pos.z += mz * 2.5; } } else this.stuckT = 0;
      face = Math.atan2(mx, mz);
    }
    const px = this.pos.x - P.pos.x, pz = this.pos.z - P.pos.z, pd = Math.hypot(px, pz);
    if (pd < 1 && pd > 1e-3) { this.pos.x = P.pos.x + px / pd; this.pos.z = P.pos.z + pz / pd; }
    this.curSpeed = lerp(this.curSpeed, goal ? speed : 0, Math.min(1, dt * 8));
    this.pos.y = Math.max(heightAt(this.pos.x, this.pos.z), WATER - 1.1);
    if (face !== null) this.yaw = turnTo(this.yaw, face, dt * 6);
    m.root.position.copy(this.pos); m.root.rotation.y = this.yaw; m.root.visible = dp < 240;
    this.walkPh += this.curSpeed * dt * 2.1;
    const sw = Math.sin(this.walkPh) * clamp(this.curSpeed / 4.5, 0, 1) * 0.75;
    m.legL.rotation.x = sw; m.legR.rotation.x = -sw; m.armL.rotation.x = -sw * 0.7; m.armR.rotation.x = sw * 0.7;
    if (!ak.joined) m.armR.rotation.x = -0.4 + Math.sin(this.lostT * 2) * 0.3;
    // 戰鬥中半透明躲在一旁
    const danger = !!G.battle || G.actors.some(a => a.alive && a.faction === 'enemy' && a.target && Math.hypot(a.pos.x - P.pos.x, a.pos.z - P.pos.z) < 30);
    this.setOpacity(lerp(this.op, danger ? 0.25 : 1, Math.min(1, dt * 4)));
    if (ak.joined && dp < 14) { // 頭頂台詞
      if (danger && !this.wasDanger && G.now > (this.fearCd || 0)) { this.fearCd = G.now + 25; say(this, pick(AK_LINES.fight)); }
      else if (!danger && !goal && (this.chatT -= dt) <= 0) { this.chatT = rnd(45, 80); say(this, pick(world.isNight && Math.random() < 0.5 ? AK_LINES.night : AK_LINES.idle)); }
    }
    this.wasDanger = danger;
    // 一起冒險的時間也會累積羈絆
    if (ak.joined && dp < 30) { this.timeT = (this.timeT || 0) + dt; if (this.timeT > 90) { this.timeT = 0; addBond(1); } }
  }
}
export const akai = () => A;
export function spawnAkai(x, z) {
  if (A) { G.scene.remove(A.m.root); }
  A = new Akai(x, z); G.akaiRef = A; return A;
}
export function updateAkai(dt) {
  if (A) A.update(dt);
  updateBars();
}

// ---------- Lv1 戰場分析：敵人血條 ----------
const barBg = new THREE.SpriteMaterial({ color: 0x1a0a08, depthTest: false, transparent: true, opacity: 0.85 });
const barFg = new THREE.SpriteMaterial({ color: 0xe8452a, depthTest: false }), barBoss = new THREE.SpriteMaterial({ color: 0xffb030, depthTest: false });
function updateBars() {
  const on = hasBond(1), P = G.player;
  for (const [a, b] of bars) if (!on || !a.alive || a.gone) { a.m.root.remove(b.bg, b.fg); bars.delete(a); }
  if (!on) return;
  for (const a of G.actors) {
    if (!a.alive || a.faction !== 'enemy') continue;
    const near = Math.hypot(a.pos.x - P.pos.x, a.pos.z - P.pos.z) < 45 && (a.hp < a.maxHp || a.def.boss);
    let b = bars.get(a);
    if (!near) { if (b) { b.bg.visible = b.fg.visible = false; } continue; }
    if (!b) {
      const bg = new THREE.Sprite(barBg), fg = new THREE.Sprite(a.def.boss ? barBoss : barFg);
      for (const s of [bg, fg]) { s.material.sizeAttenuation = false; s.center.set(0, 0.5); s.position.y = 2.35 * a.scale + a.seat + (a.def.boss ? 0.45 : 0); s.renderOrder = 5; }
      bg.scale.set(0.12, 0.012, 1); a.m.root.add(bg, fg); b = { bg, fg }; bars.set(a, b);
    }
    b.bg.visible = b.fg.visible = true;
    b.fg.scale.set(0.12 * clamp(a.hp / a.maxHp, 0, 1), 0.009, 1);
  }
}

// ---------- 對話 ----------
const CHAT = [
  '我好想念珍珠奶茶……這裡連糖都很珍貴。',
  '照史書，曹操會在官渡打敗袁紹。不過這個世界好像跟史書不太一樣——畢竟多了你。',
  '你知道嗎？「五銖錢」從漢武帝一直用到唐朝，算是史上最長壽的貨幣之一。',
  '我在研究所的時候，每天的工作就是盯著那幾片羅盤碎片……沒想到會親眼看到完整的。',
  '這裡的星空好亮。2031 年的城市，晚上已經看不到銀河了。',
  '你的黑火藥配方是對的，硝七五、炭十五、硫十。不過顆粒化之後燃燒會更穩定喔。',
  '張飛的嗓門比我想像的還大……我耳朵到現在還在響。',
  '如果有一天傳送門能用了，你會回去嗎？……我還沒想好。',
  '這裡的人看我的眼光都怪怪的，大概是因為眼鏡吧。',
  '我算過了，從這裡走到虎牢關大概要……算了，你有馬。',
];
function back(a, text) { return { text, opts: akaiOpts(a) }; }
function akaiOpts(a) {
  const ak = AK(), o = [];
  o.push(ak.chatDay === G.day ? { t: '聊聊天（今天聊過了）', dis: true } : { t: '聊聊天', fn: () => { ak.chatDay = G.day; addBond(10, '聊天'); return back(a, pick(CHAT)); } });
  o.push({ t: `送他東西（今天還能送 ${Math.max(0, 3 - (ak.giftDay === G.day ? ak.gifts : 0))} 次）`, fn: () => giftNode(a) });
  o.push({ t: '你能幫我什麼？', fn: () => back(a, abilityText()) });
  o.push({ t: '傳送門儀器研究得怎樣？', fn: () => back(a, G.deviceStatus ? G.deviceStatus() : '……') });
  o.push(ak.wait ? { t: '跟著我。', fn: () => { ak.wait = false; return back(a, '好，走吧！'); } } : { t: '在這裡等我。', fn: () => { ak.wait = true; return back(a, '我就在這附近研究一下，你忙完再來找我。'); } });
  o.push({ t: '告辭。' });
  return o;
}
function giftNode(a) {
  const ak = AK(); if (ak.giftDay !== G.day) { ak.giftDay = G.day; ak.gifts = 0; }
  const GIFT = { cooked: [8, '烤肉！你怎麼知道我快餓死了！'], ration: [5, '乾糧……謝了，雖然有點硬。'], berry: [2, '野果？酸酸甜甜的，不錯。'] };
  const opts = Object.keys(GIFT).filter(k => G.player.count(k) > 0).map(k => ({
    t: `送 ${ITEMS[k].i}${ITEMS[k].n}（持有 ${G.player.count(k)}）`, dis: ak.gifts >= 3,
    fn: () => { G.player.take(k); ak.gifts++; addBond(GIFT[k][0], '送禮'); return back(a, GIFT[k][1]); },
  }));
  if (!opts.length) return back(a, '（你身上沒有可以送的食物。阿凱最喜歡烤肉。）');
  opts.push({ t: '返回', fn: () => akaiDialog(a) });
  return { text: ak.gifts >= 3 ? '今天收夠多了，謝謝你。' : '（阿凱最喜歡烤肉，其次是乾糧和野果。）', opts };
}
function abilityText() {
  const lv = bondLv(), x = AK().xp, nx = BOND_XP[lv + 1];
  return `羈絆 Lv${lv}（${x}${nx ? '/' + nx : ''}）\n` + BOND.slice(1).map((b, i) => `${i + 1 <= lv ? '✔' : '🔒'} Lv${i + 1} ${b.n}：${b.d}`).join('\n') + '\n（聊天、送禮、一起完成主線、一起冒險都能提升羈絆。）';
}
export function akaiDialog(a) {
  const ak = AK();
  if (!ak.joined) return {
    text: '（他抓著頭四下張望，看到你時愣住了）\n……你、你聽得懂我說話？你這身打扮……你也是現代人？！',
    opts: [{ t: '我也是從現代穿越來的。', fn: meet2 }, { t: '你是誰？', fn: meet2 }],
  };
  return back(a, `${pick(['有什麼事嗎？', '我在想儀器的事……你說吧。', '嗨！今天要去哪？'])}　（羈絆 Lv${bondLv()}）`);
}
function meet2() {
  return {
    text: '太好了……我叫林凱，叫我阿凱就好。\n我是 2031 年一間研究所的工程師，負責分析五年前港口倉庫爆炸案找到的青銅羅盤碎片。\n我只是啟動共振儀做例行測試——眨個眼，就站在這道門前了。',
    opts: [{ t: '港口倉庫……爆炸？', fn: () => ({
      text: '等等……你的槍、你的穿著……\n你該不會就是新聞上那個在爆炸中失蹤的軍火商吧？！那件案子到現在都沒破。',
      opts: [{ t: '……就是我。', fn: meet4 }, { t: '我不知道你在說什麼。', fn: meet4 }],
    }) }],
  };
}
function meet4() {
  return {
    text: '（他深吸一口氣）我不會打仗，也不想拖累你。\n但我懂科技——可以幫你分析戰場、做現代急救、改良火藥……\n說不定，還能弄懂這道傳送門，跟旁邊那台奇怪的儀器。讓我跟著你吧！',
    opts: [
      { t: '好，一起走。', fn: () => {
        const ak = AK(); ak.joined = true; ak.xp = Math.max(ak.xp, 10); audio.play('quest', 0.7); G.save();
        G.ui.msg('阿凱加入了！他不會打仗也不會受傷，戰鬥時會躲在一旁。找他聊天、送禮能提升羈絆，解鎖更多支援。', 'quest');
        return { text: '謝謝你！我會盡全力幫忙的。\n對了——戰鬥的時候我會躲遠一點，別擔心我。', opts: [{ t: '走吧。' }] };
      } },
      { t: '你先在這裡等一下。', fn: () => ({ text: '……好，我哪也不去。你一定要回來啊！', opts: [{ t: '告辭。' }] }) },
    ],
  };
}
