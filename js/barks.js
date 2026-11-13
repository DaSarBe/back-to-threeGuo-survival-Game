// NPC 台詞：頭頂對話泡泡。閒置、打招呼、發現敵人、出招、受傷、重傷、擊殺、陣亡、士卒之間的閒聊
import * as THREE from 'three';
import { G } from './state.js';
import { world } from './world.js';
import { pick, rnd, clamp } from './util.js';
import { callYou } from './ranks.js';

const FONT = '"Noto Serif TC","PMingLiU","Microsoft JhengHei","PingFang TC",serif';

// ---------- 台詞庫 ----------
// 依兵種（turban／xl／yuan／cao／gun／ally）或角色 id；頭目的 spot／attack／kill 都用 fight
export const LINES = {
  turban: {
    idle: ['蒼天已死，黃天當立……', '大賢良師的符水真能治病？', '聽說官軍又要打過來了。', '肚子好餓，糧草又短了。', '歲在甲子，天下大吉！', '這頭巾戴久了真悶。'],
    night: ['今晚輪我守夜？唉……', '夜裡好冷，生個火吧。'],
    rain: ['下雨了，大賢良師在作法嗎？'],
    spot: ['有人闖營！', '官軍的探子！拿下！', '黃天當立！殺！'],
    attack: ['吃我一刀！', '殺——！', '看招！'],
    hurt: ['啊！', '這是什麼妖術！', '好痛……'],
    low: ['饒、饒命啊！', '撐不住了！'],
    kill: ['哼，不過如此！', '黃天保佑！'],
    die: ['大賢良師……', '呃啊——'],
  },
  xl: {
    idle: ['相國有令，誰敢不從？', '洛陽的酒比西涼的好喝多了。', '呂將軍的赤兔馬，嘖嘖……', '這關口守得固若金湯。', '想念西涼的大草原啊。'],
    night: ['關東那幫諸侯，今晚不會來吧？'],
    spot: ['敵襲！', '關東鼠輩，休走！', '西涼兒郎，上！'],
    attack: ['看刀！', '殺！', '受死吧！'],
    hurt: ['可惡！', '這火器……！'],
    low: ['快去稟報相國！', '頂不住了！'],
    kill: ['西涼鐵騎天下無敵！'],
    die: ['相國……救我……'],
  },
  yuan: {
    idle: ['袁家四世三公，天下誰人能及？', '主公兵多將廣，曹賊必敗。', '烏巢的糧草堆得跟山一樣。', '顏良、文醜二位將軍天下無雙！'],
    spot: ['曹軍細作！', '敵襲！保護糧草！', '拿下此人，重重有賞！'],
    attack: ['殺！', '看槍！'],
    hurt: ['啊！', '這是何物？！'],
    low: ['快撤！'],
    kill: ['河北兒郎豈是好惹的！'],
    die: ['主公……'],
  },
  cao: {
    idle: ['丞相用兵如神。', '這仗打完，就能回許昌了吧。', '虎豹騎的弟兄真威風。', '聽說南方多瘴氣，可得小心。', '北方人坐不慣船啊……'],
    rain: ['這雨下得軍心浮動……'],
    spot: ['什麼人？！', '奉丞相之命，拿下！', '敵襲！'],
    attack: ['殺！', '為了丞相！'],
    hurt: ['唔！', '有埋伏！'],
    low: ['撤！快撤！'],
    kill: ['丞相威武！'],
    die: ['丞相……'],
  },
  gun: {
    idle: ['這火器的威力……嘖嘖。', '黑市那掮客說，這玩意兒叫「槍」。', '火藥可不能受潮。', '裝填好麻煩……'],
    rain: ['下雨了，火藥受潮可就完了！'],
    spot: ['在那裡！開火！', '讓你嚐嚐自己的火器！'],
    attack: ['開火！', '瞄準——放！'],
    hurt: ['可惡！'],
    low: ['火藥……用完了……'],
    kill: ['哈，這火器真好用！'],
    die: ['這……是報應嗎……'],
  },
  ally: {
    idle: ['今天伙食有沒有肉啊？', '劉皇叔仁德，跟著他準沒錯。', '先生的火器真是神兵！', '保家衛國，義不容辭。', '想家了……', '操練完了，腰好酸。'],
    night: ['夜裡風大，小心狼群。', '今晚的月亮真圓。', '換班了沒？眼皮好重……'],
    rain: ['這雨下得真煩……', '先生，火藥記得收好，別淋濕了。'],
    greet: ['先生！', '見過先生！', '先生辛苦了！', '先生一路小心！'],
    spot: ['有敵人！', '保護先生！', '弟兄們，上！'],
    attack: ['殺！', '接招！', '看槍！'],
    hurt: ['唔……還撐得住！', '可惡！'],
    low: ['先生……我快撐不住了！'],
    kill: ['又倒一個！', '痛快！'],
    die: ['先生……保重……'],
    cheer: ['好槍法！', '先生威武！', '漂亮！'],
  },
  // ---- 友軍名將 ----
  liubei: { idle: ['天下蒼生，何時才能安居樂業……', '能得先生相助，實乃天意。', '二弟、三弟又去哪了？'], greet: ['先生來了！', '先生，一路辛苦。'], spot: ['為了大漢，諸位隨我殺敵！'], attack: ['看劍！', '殺！'], hurt: ['我還撐得住！'], kill: ['蒼天有眼。'], cheer: ['先生好身手！'] },
  guanyu: { idle: ['（撫髯）……', '春秋大義，不可不讀。', '大哥待我恩重如山。', '此刀名曰青龍偃月。'], greet: ['先生。', '（關羽微微頷首）'], spot: ['關某在此！', '鼠輩，納命來！'], attack: ['看刀！', '斬！'], hurt: ['區區小傷。'], kill: ['插標賣首之徒。', '不過如此。'], cheer: ['（撫髯而笑）'] },
  zhangfei: { idle: ['誰陪俺喝兩杯？', '俺的蛇矛手癢了！', '大哥就是太心軟！', '酒呢？俺的酒呢？'], greet: ['哈哈，先生來啦！', '先生！來喝一杯！'], spot: ['燕人張翼德在此！', '哇呀呀呀——！'], attack: ['吃俺一矛！', '哇呀呀！'], hurt: ['癢癢而已！'], kill: ['痛快！痛快！', '再來啊！'], cheer: ['哈哈哈！不夠打！'] },
  zhaoyun: { idle: ['主公的安危，雲時刻放在心上。', '槍法一日不練就生疏了。', '這匹白馬跟了我許多年。'], greet: ['先生。', '先生有何吩咐？'], spot: ['常山趙子龍在此！', '賊將休走！'], attack: ['著！', '看槍！'], hurt: ['不礙事。'], kill: ['下一個！'], cheer: ['先生沒事吧？'] },
  caocao: { idle: ['對酒當歌，人生幾何……', '天下英雄，唯使君與操耳。', '先生這火器，可願賣與操？'], greet: ['哈哈，先生來了！'], spot: ['虎豹騎，隨我衝！', '來者何人？'], attack: ['殺！'], hurt: ['哼，有點本事。'], kill: ['擋我者死。'], cheer: ['好！重重有賞！'] },
  sunjian: { idle: ['江東子弟，個個是好漢。', '傳國玉璽……罷了，不提也罷。', '我兒伯符，將來必成大器。'], greet: ['先生！'], spot: ['江東猛虎在此！'], attack: ['殺！'], hurt: ['哈，痛快！'], kill: ['再來！'], cheer: ['江東兒郎，威武！'] },
  mizhu: { idle: ['生意興隆，財源廣進。', '先生要不要看看新貨？', '這年頭，錢越來越不值錢了。'], greet: ['先生，今天想買點什麼？'] },
  broker: { idle: ['好貨不怕沒人買……', '噓——小聲點。'], greet: ['嘿嘿，帶好貨來了嗎？'] },
  // ---- 敵方頭目 ----
  zhangjiao: { idle: ['蒼天已死，黃天當立……', '歲在甲子，天下大吉。'], fight: ['天雷，降！', '黃天在上，妖人受死！', '太平要術，豈是你能懂的！'], hurt: ['你……你這是什麼妖法！'], low: ['黃天……為何棄我……'] },
  huaxiong: { idle: ['關東諸侯，不過土雞瓦狗。'], fight: ['誰敢與我一戰！', '吃我一刀！', '關東無人了嗎？'], hurt: ['哼，有兩下子！'], low: ['不可能……'] },
  lvbu: { idle: ['天下無人能擋我方天畫戟。'], fight: ['人中呂布，馬中赤兔！', '螻蟻也敢擋我？', '受死！'], hurt: ['有意思！'], low: ['我呂奉先……竟會……'] },
  dongzhuo: { idle: ['美酒！美人！哈哈哈！'], fight: ['給我拿下！', '護駕！護駕！', '老夫的命，誰敢取！'], hurt: ['哎喲！痛死老夫了！'], low: ['饒、饒命……老夫有錢！'] },
  yanliang: { fight: ['河北顏良在此！', '鼠輩受死！'], hurt: ['好小子！'], low: ['怎會如此……'] },
  wenchou: { fight: ['看我連珠箭！', '替顏良兄報仇！'], hurt: ['可惡！'], low: ['兄長……我來了……'] },
  chunyuqiong: { idle: ['再來一罈酒！'], fight: ['敵襲？！快、快救火！', '我、我還沒醉！'], hurt: ['哎喲！'], low: ['糧草……燒了……'] },
  xiahouen: { fight: ['青釭劍削鐵如泥！', '丞相的寶劍在此！'], hurt: ['你敢！'], low: ['寶劍……丞相的寶劍……'] },
  caocao_e: { fight: ['寧教我負天下人，休教天下人負我！', '區區火器，能奈我何？'], hurt: ['好個妖人！'], low: ['……撤！'] },
};
// 士卒之間的閒聊（一問一答）
export const PAIRS = {
  ally: [['聽說先生的槍能打百步遠？', '何止，我親眼看他打落一隻鷹！'], ['今晚吃什麼？', '還能吃什麼，又是粟米粥。'], ['你家裡還有誰？', '一個老娘，打完仗就回去孝順她。'], ['張將軍又喝醉了。', '噓，小聲點，被他聽到可不得了。']],
  turban: [['大賢良師說的太平世道，何時來？', '快了快了，殺光官軍就來了。'], ['你的符水喝了沒？', '喝了，可肚子還是痛……']],
  xl: [['相國今晚又開宴了。', '咱們連口熱湯都喝不到。'], ['聽說呂將軍一個人打三個？', '那三個也不簡單啊。']],
  yuan: [['烏巢那邊有淳于將軍守著。', '他那個酒量……我看懸。'], ['主公怎麼還不打曹操？', '謀士們吵了三天還沒吵完。']],
  cao: [['北方的弟兄都暈船了。', '用鐵索把船連起來就穩多了。'], ['丞相說這仗必勝。', '可我總覺得這東南風怪怪的……']],
};

export function groupOf(a) {
  const id = a.id;
  if (LINES[id]) return id;
  if (id === 'en_gun') return 'gun';
  for (const p of ['turban', 'xl', 'yuan', 'cao']) if (id.startsWith(p + '_')) return p;
  if (a.faction === 'ally') return 'ally';
  return null;
}
const FIGHT = { spot: 1, attack: 1, kill: 1 };
const ROUT = ['主將死了！快逃啊！', '敗了……敗了！', '撤！快撤！', '饒命啊！', '跑啊——！'];
function linesFor(a, kind) {
  if (kind === 'rout') return a.faction === 'enemy' ? ROUT : null;
  const g = groupOf(a); if (!g) return null;
  const own = LINES[g], base = a.faction === 'ally' && g !== 'ally' ? LINES.ally : null;
  if (own[kind]) return own[kind];
  if (FIGHT[kind] && own.fight) return own.fight;
  if (base && base[kind] && kind !== 'idle' && kind !== 'greet') return base[kind]; // 名將沒寫的情境用士卒台詞
  return null;
}

// ---------- 泡泡 ----------
const texCache = new Map();
function bubbleTex(text, col) {
  const key = text + col; if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas'), g = c.getContext('2d'), fs = 30;
  g.font = `bold ${fs}px ${FONT}`;
  const tw = Math.ceil(g.measureText(text).width), w = Math.min(640, tw + 40), h = 76, bh = 60;
  c.width = w; c.height = h;
  g.font = `bold ${fs}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  const r = 18;
  g.beginPath(); g.moveTo(r + 2, 2); g.arcTo(w - 2, 2, w - 2, bh, r); g.arcTo(w - 2, bh, 2, bh, r);
  g.lineTo(w / 2 + 10, bh); g.lineTo(w / 2, h - 2); g.lineTo(w / 2 - 10, bh); // 尾巴
  g.arcTo(2, bh, 2, 2, r); g.arcTo(2, 2, w - 2, 2, r); g.closePath();
  g.fillStyle = 'rgba(252,246,230,.94)'; g.fill(); g.lineWidth = 4; g.strokeStyle = col; g.stroke();
  g.fillStyle = '#2a1a0a'; g.fillText(text, w / 2, bh / 2 + 2, w - 24);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const o = { tex, aspect: w / h }; texCache.set(key, o);
  if (texCache.size > 160) { const k = texCache.keys().next().value; texCache.get(k).tex.dispose(); texCache.delete(k); }
  return o;
}
const active = [], pending = [], MAX = 4;
const COMBAT = k => !(k === 'idle' || k === 'greet' || k === 'chat');
function colorOf(a) { return a.def.boss ? '#c0281a' : a.def.general ? '#c8961e' : a.faction === 'ally' ? '#3a8a3a' : a.faction === 'enemy' ? '#a83a2a' : '#7a4ab0'; }
function removeAt(i) { const b = active[i]; G.scene.remove(b.sp); b.sp.material.dispose(); active.splice(i, 1); }

// 優先順序：頭目 > 名將 > 戰鬥台詞 > 閒聊；泡泡滿了就擠掉優先順序較低（同級則較舊）的
const prioOf = (a, combat) => a.def.boss ? 3 : a.def.general ? 2 : combat ? 1 : 0;
export function say(a, text, kind = 'idle', dur) {
  if (!a || !text || !G.scene) return false;
  const combat = COMBAT(kind), prio = prioOf(a, combat);
  for (let i = active.length - 1; i >= 0; i--) if (active[i].a === a) removeAt(i);
  if (active.length >= MAX) {
    let vi = -1; for (let i = 0; i < active.length; i++) if (active[i].prio <= prio && (vi < 0 || active[i].prio < active[vi].prio)) vi = i; // 同級時擠掉最舊的
    if (vi < 0) return false; removeAt(vi);
  }
  if (a.faction === 'ally') text = callYou(text); // 友軍依官職稱呼你（先生／司馬／都尉／將軍）
  const { tex, aspect } = bubbleTex(text, colorOf(a));
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 }));
  sp.material.sizeAttenuation = false; sp.center.set(0.5, 0); sp.renderOrder = 5;
  G.scene.add(sp);
  const lift = a.bubbleY || (a.def.general || a.def.boss || a.recruited || a.def.talk ? 2.75 : 2.15) * (a.scale || 1) + (a.seat || 0);
  active.push({ sp, a, t: 0, dur: dur || clamp(1.4 + text.length * 0.13, 2, 4.5), combat, prio, lift, aspect });
  return true;
}
// 泡泡在螢幕上固定約 32～40 像素高（不論距離、手機或電腦）
const bubblePx = () => clamp(innerHeight * 0.07, 32, 40);
function bubbleScale() { return bubblePx() / (innerHeight / 2) * Math.tan((G.camera.fov * Math.PI / 180) / 2); }
const PV = new THREE.Vector3();
// 依情境說一句：chance 機率、自帶冷卻、太遠就不說
export function bark(a, kind, chance = 1) {
  if (!a || (!a.alive && kind !== 'die') || G.menu || G.cutscene) return false;
  if (Math.random() > chance) return false;
  const combat = COMBAT(kind);
  if (G.now < (a.barkCd || 0) && kind !== 'die' && kind !== 'low') return false;
  const P = G.player, dp = Math.hypot(a.pos.x - P.pos.x, a.pos.z - P.pos.z);
  if (dp > (combat ? 45 : 26)) return false;
  let pool = linesFor(a, kind); if (!pool) return false;
  if (kind === 'idle') { const g = LINES[groupOf(a)]; if (world.isNight && g.night && Math.random() < 0.5) pool = g.night; else if (G.weather && G.weather.kind === 'rain' && g.rain && Math.random() < 0.6) pool = g.rain; }
  const text = pick(pool);
  if (!say(a, text, kind)) return false;
  a.barkCd = G.now + (combat ? rnd(3.5, 6) : rnd(12, 20));
  if (a.def.boss && (kind === 'spot' || kind === 'attack' || kind === 'low' || kind === 'fight') && G.now - (a.logT || -99) > 10) { a.logT = G.now; G.ui.msg(`${a.name}：「${text}」`, 'say'); }
  return true;
}
// 閒置時：一般自言自語，附近有同袍時改成一問一答
export function idleChatter(a, actors) {
  const g = groupOf(a), pairs = PAIRS[g];
  if (pairs && !a.follow && Math.random() < 0.45) {
    const b = actors.find(o => o !== a && o.alive && !o.target && !o.follow && groupOf(o) === g && Math.hypot(o.pos.x - a.pos.x, o.pos.z - a.pos.z) < 7);
    if (b && G.now >= (b.barkCd || 0)) {
      const [q, r] = pick(pairs), P = G.player;
      if (Math.hypot(a.pos.x - P.pos.x, a.pos.z - P.pos.z) > 26 || !say(a, q, 'chat')) return;
      a.barkCd = b.barkCd = G.now + rnd(18, 28);
      a.lookAt = { x: b.pos.x, z: b.pos.z, until: G.now + 7 }; b.lookAt = { x: a.pos.x, z: a.pos.z, until: G.now + 7 };
      a.emote && a.emote('chat'); pending.push({ t: 2.6, a: b, text: r });
      return;
    }
  }
  if (bark(a, 'idle', 0.8) && a.emote && !a.emo) a.emote('chat');
}
export function updateBarks(dt) {
  const show = !G.menu || G.menu === 'dialog', h = bubbleScale(), ph = bubblePx(), placed = [];
  for (let i = pending.length - 1; i >= 0; i--) {
    const p = pending[i]; p.t -= dt;
    if (p.t <= 0) { pending.splice(i, 1); if (p.a.alive && !p.a.target && say(p.a, p.text, 'chat') && p.a.emote && !p.a.emo) p.a.emote('chat'); }
  }
  for (let i = active.length - 1; i >= 0; i--) {
    const b = active[i], a = b.a; b.t += dt;
    if (b.t >= b.dur || a.gone || (!a.alive && b.t > 1.8)) { removeAt(i); continue; }
    b.sp.visible = show && a.m.root.visible;
    b.sp.position.set(a.pos.x, a.alive ? a.pos.y + b.lift : a.pos.y + 0.9, a.pos.z);
    b.sp.material.opacity = Math.min(1, b.t * 6, (b.dur - b.t) * 3);
    b.sp.scale.set(h * b.aspect, h, 1);
    // 螢幕上重疊時往上疊
    if (!b.sp.visible) continue;
    PV.copy(b.sp.position).project(G.camera); if (PV.z > 1) continue;
    const x = (PV.x + 1) / 2 * innerWidth, y = (1 - PV.y) / 2 * innerHeight, pw = ph * b.aspect;
    let lv = 0; while (lv < 3 && placed.some(r => Math.abs(r.x - x) < (r.w + pw) / 2 && Math.abs(r.y - (y - lv * ph * 1.05)) < ph)) lv++;
    placed.push({ x, y: y - lv * ph * 1.05, w: pw }); b.sp.center.y = -lv * 1.05;
  }
}
export function clearBarks() { while (active.length) removeAt(0); pending.length = 0; }
export const activeBubbles = () => // 測試用：目前顯示中的泡泡
   active.map(b => b.a.name + '：' + b.sp.material.map.image.width);
