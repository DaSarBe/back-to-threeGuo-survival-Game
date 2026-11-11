import { G } from './state.js';
import { audio } from './audio.js';
import { ITEMS, ACTORS, ATTENDANTS, ATTENDANT_COST, ATTENDANT_MAX, RECIPES, WEAPONS, GENERAL_COST } from './data.js';
import { world } from './world.js';
import * as SQ from './squad.js';

export const QUESTS = [
  { t: '亂世求生', d: '打開身旁的軍火箱，然後前往東南方的劉備軍營，找劉備談談。', site: 'camp' },
  { t: '討伐黃巾', d: '前往西南方的黃巾營寨，擊殺「大賢良師」張角。可先向劉備招兵買馬，帶兵卒同行。', site: 'turban', boss: 'zhangjiao' },
  { t: '溫酒斬華雄', d: '渡河前往東北方的汜水關，擊殺華雄。途中的聯軍大營，曹操與孫堅也能招兵。關羽、張飛已可招攬。', site: 'sishui', boss: 'huaxiong' },
  { t: '三英戰呂布', d: '前往西北方的虎牢關，擊敗天下第一武將呂布。趙雲、曹操、孫堅已可招攬；建議備妥步槍與震天雷。', site: 'hulao', boss: 'lvbu' },
  { t: '誅殺國賊', d: '殺入東南方的郿塢，誅殺董卓，終結這場亂局。', site: 'meiwu', boss: 'dongzhuo' },
  { t: '亂世軍火商', d: '董卓已死。你可以繼續在這個時代自由求生、狩獵與製造軍火。' },
];

const REWARD = {
  1: () => { G.player.give('coin', 200); return '獲得賞金 200 五銖錢。'; },
  2: () => { G.player.give('coin', 300); G.player.give('iron', 10); return '獲得賞金 300 五銖錢與 10 鐵礦。'; },
  3: () => { G.player.give('coin', 500); G.spawnRedHare(); return '獲得賞金 500 五銖錢。呂布的坐騎「赤兔馬」留在了虎牢關前！'; },
  4: () => { G.player.give('coin', 1000); return ''; },
};

export function advance() {
  const done = G.stage, q = QUESTS[done];
  G.stage++;
  const r = REWARD[done] ? REWARD[done]() : '';
  G.ui.msg(`任務完成：${q.t}。${r}`, 'quest'); G.ui.msg(`新任務：${QUESTS[G.stage].t}`, 'quest');
  audio.play('quest'); G.save();
  if (done === 4) setTimeout(() => G.ui.open('win'), 2500);
}
// 擊殺頭目即推進（提前擊殺也算數）
export function checkQuest() {
  const q = QUESTS[G.stage];
  if (q && q.boss && G.killed[q.boss]) advance();
}


const SAY = {
  guanyu: { idle: '關某觀閣下手中之器，聲若雷霆，百步取人性命……天下竟有此等神兵。', join: '關某願往！酒且斟下，某去便來。' },
  zhangfei: { idle: '喂！你那會噴火的鐵疙瘩借俺老張耍耍？……不借？小氣！', join: '哈哈哈！早就手癢了！燕人張翼德在此，誰敢與我決一死戰！' },
  zhaoyun: { idle: '雲觀先生雖非行伍出身，卻臨危不亂，實乃奇人。', join: '常山趙子龍，願為先生開路！' },
  liubei: { join: '備雖不才，願與先生共赴國難！' },
  caocao: { idle: '「寧教我負天下人」……咳，足下這身本事，可願來我帳下？錢糧兵馬，任你開口。', join: '好！操便與你走這一遭，看看你那「火器」究竟如何了得！' },
  sunjian: { idle: '某乃江東孫文臺。董賊亂政，人人得而誅之！', join: '江東子弟，何懼之有！隨我殺！' },
};
const BYE = { t: '告辭。' };

// ---------- 名將同行 ----------
const HIRE = {
  guanyu: '關某不為錢帛所動……但軍中糧械短缺，先生肯助一臂之力，關某自當報之以刀。',
  zhangfei: '嘿！俺老張出馬，弟兄們的酒肉糧餉可得備足了！',
  zhaoyun: '雲願追隨先生。只是麾下白馬義從尚缺糧械，望先生周濟。',
  caocao: '操向來賞罰分明——足下要操同行，便拿出相應的軍資來。',
  sunjian: '江東子弟遠道而來，糧草軍械所費不貲。足下若肯資助，孫某便隨你走一遭。',
  liubei: '備本不該向先生開口……但營中將士久戰疲敝，望先生資助軍糧，備即刻點兵同行。',
};
function hireNode(a, note = '') {
  const c = GENERAL_COST[a.id];
  const go = useRes => () => { const err = SQ.hireGeneral(a, useRes); return err ? hireNode(a, err) : { text: SAY[a.id].join || '走！', opts: [...followOpt(a), BYE] }; };
  return {
    text: (note ? `（${note}）\n` : '') + HIRE[a.id] + '\n（招攬只需付一次，之後可隨時同行或回營。）',
    opts: [
      { t: `付 🪙${c.coin}`, dis: !SQ.canPay({ coin: c.coin }), fn: go(false) },
      { t: `付 ${SQ.costText(c.res)}`, dis: !SQ.canPay(c.res), fn: go(true) },
      { t: '返回', fn: () => dialogFor(a) },
    ],
  };
}
function followOpt(a) {
  if (!SAY[a.id] || !SQ.isUnlocked(a.id)) return [];
  if (!SQ.isHired(a.id)) { const c = GENERAL_COST[a.id]; return [{ t: `招攬 ${a.name}（🪙${c.coin} 或 ${SQ.costText(c.res)}）`, fn: () => hireNode(a) }]; }
  if (a.follow) return [{ t: '請回營待命。', fn: () => { SQ.setGeneralFollow(a, false); return { text: '好，若有戰事，隨時來喚。' }; } }];
  return [{
    t: `請隨我出征！（佔 2 名額，目前 ${SQ.squadUsed()}/${SQ.squadCap()}）`, fn: () => {
      const err = SQ.setGeneralFollow(a, true);
      return { text: err ? `（${err}）` : (SAY[a.id].join || '走！') };
    }
  }];
}

// ---------- 招兵買馬 ----------
function recruitNode(lord, note = '') {
  const r = SQ.lordRecruits(lord.id), P = G.player;
  const opts = r.units.map(u => ({
    t: `招募 ${ACTORS[u.id].short}　🪙${u.coin} 或 ${SQ.costText(u.res)}`,
    fn: () => unitNode(lord, u),
  }));
  const sp = r.attendant, A = ATTENDANTS[sp];
  if (!SQ.ownsAttendant(sp) && G.attendants.length < ATTENDANT_MAX)
    opts.push({ t: `僱用侍從：${A.role}${A.name}（${A.desc}）`, fn: () => attendantBuyNode(lord, sp) });
  opts.push({ t: '返回', fn: () => dialogFor(lord) });
  return {
    text: (note ? note + '\n' : '') + `隊伍名額 ${SQ.squadUsed()}/${SQ.squadCap()}　🪙${P.count('coin')}　侍從 ${G.attendants.length}/${ATTENDANT_MAX}\n兵卒陣亡後不會復活，需要重新招募。`,
    opts,
  };
}
function unitNode(lord, u, note = '') {
  const d = ACTORS[u.id], full = SQ.squadUsed() + 1 > SQ.squadCap();
  const go = useRes => () => { const err = SQ.recruit(lord, u, useRes); return err ? unitNode(lord, u, err) : recruitNode(lord, `✔ ${d.name} 已加入隊伍！`); };
  return {
    text: (note ? `（${note}）\n` : '') + `${d.name}　生命 ${d.hp}・攻擊 ${d.dmg}\n${SQ.UNIT_DESC[u.id]}` + (full ? '\n（隊伍已滿：推進主線可帶更多人）' : ''),
    opts: [
      { t: `付 🪙${u.coin}`, dis: full || !SQ.canPay({ coin: u.coin }), fn: go(false) },
      { t: `付 ${SQ.costText(u.res)}`, dis: full || !SQ.canPay(u.res), fn: go(true) },
      { t: '返回', fn: () => recruitNode(lord) },
    ],
  };
}
function attendantBuyNode(lord, sp) {
  const A = ATTENDANTS[sp], C = ATTENDANT_COST;
  const go = useRes => () => { const err = SQ.buyAttendant(sp, useRes); return err ? recruitNode(lord, `（${err}）`) : recruitNode(lord, `✔ ${A.role}${A.name} 會跟著你，定時幫忙採集。`); };
  return {
    text: `${A.role}　${A.name}\n${A.desc}。不會打仗也不會受傷，會跟著你、時不時去採集物資。`,
    opts: [
      { t: `付 🪙${C.coin}`, dis: !SQ.canPay({ coin: C.coin }), fn: go(false) },
      { t: `付 ${SQ.costText(C.res)}`, dis: !SQ.canPay(C.res), fn: go(true) },
      { t: '返回', fn: () => recruitNode(lord) },
    ],
  };
}
function lordOpts(a) {
  const o = [];
  if (SQ.lordRecruits(a.id)) o.push({ t: '招兵買馬', fn: () => recruitNode(a) });
  o.push(...followOpt(a), BYE);
  return o;
}

// ---------- 侍從 ----------
const DIRS = ['北', '東北', '東', '東南', '南', '西南', '西', '西北'];
export function dirWord(dx, dz) { const a = Math.atan2(dx, -dz); return DIRS[(Math.round(a / (Math.PI / 4)) + 8) % 8]; }
function scanResources() {
  const P = G.player, best = {};
  for (const n of world.nodeList) {
    if (!n.item || n.stock <= 0) continue;
    const d = Math.hypot(n.x - P.pos.x, n.z - P.pos.z);
    if (d < 220 && (!best[n.item] || d < best[n.item].d)) best[n.item] = { d, n };
  }
  const lines = ['iron', 'saltpeter', 'sulfur', 'herb', 'berry'].map(k => {
    const b = best[k]; const it = ITEMS[k];
    return b ? `${it.i}${it.n}：${dirWord(b.n.x - P.pos.x, b.n.z - P.pos.z)}方約 ${Math.round(b.d)} 步` : `${it.i}${it.n}：附近沒看到`;
  });
  return '我四下看了看——\n' + lines.join('\n') + '\n（樹木到處都有，木材不缺。）';
}
function nextHint() {
  const P = G.player, q = QUESTS[G.stage], tips = [];
  tips.push(`主線：${q.d}`);
  if (G.stage >= 1 && SQ.followers().length === 0) tips.push('身邊沒有兵卒——可以向劉備招兵買馬。');
  if (!P.owned.shotgun && !P.owned.rifle) tips.push('黑火藥要硝石、硫磺、木炭（木材燒成），有了就能做霰彈槍。');
  if (P.hunger < 40) tips.push('您肚子餓了，記得吃點東西。');
  if (P.thirst < 40) tips.push('您口渴了，河邊或營中水井都能喝水。');
  if (G.world.isNight) tips.push('天黑了，狼群和賊兵會出沒，回營歇息比較安全。');
  if (G.stage >= 1 && q.boss) tips.push('敵將身邊有護體，得踏進地上的決戰圈才傷得到他。');
  return tips.join('\n');
}
function craftable() {
  const ok = RECIPES.filter(r => !(r.weapon && G.player.owned[r.weapon]) && Object.entries(r.need).every(([k, n]) => G.player.count(k) >= n));
  return ok.length ? '以您現在的材料，可以做：\n' + ok.map(r => '・' + r.n).join('\n') + '\n（打開背包的「製作」頁就能做。）' : '現在的材料還不夠做任何東西。\n要我去多撿些木材、礦石嗎？';
}
const FOCUS = [['wood', '木材'], ['ore', '礦石'], ['herb', '草藥和野果'], [null, '什麼都撿']];
function attendantDialog(a) {
  const n = a.carried;
  const back = text => ({ text, opts: attendantOpts(a) });
  return {
    text: (n ? `我身上帶了 ${n}/${a.cap} 件東西，隨時可以交給您。` : `我還沒撿到東西，再等等。`) + (a.wait ? '\n（目前在這裡留守採集）' : ''),
    opts: attendantOpts(a, back),
  };
}
function attendantOpts(a, back = text => ({ text, opts: attendantOpts(a) })) {
  const o = [];
  if (a.carried) o.push({ t: '把東西給我。', fn: () => back('都給您了：' + a.handOver().join('、')) });
  o.push({ t: '附近有什麼資源？', fn: () => back(scanResources()) });
  o.push({ t: '接下來該做什麼？', fn: () => back(nextHint()) });
  o.push({ t: '我現在能做什麼？', fn: () => back(craftable()) });
  o.push({
    t: `專門去撿……（目前：${(FOCUS.find(f => f[0] === a.focus) || FOCUS[3])[1]}）`, fn: () => ({
      text: '要我專門撿哪一種？',
      opts: FOCUS.map(([k, label]) => ({ t: label, fn: () => { a.focus = k; return back(`好，我會專心撿${label === '什麼都撿' ? '各種東西' : label}。`); } })),
    })
  });
  o.push(a.wait ? { t: '跟著我。', fn: () => { a.wait = false; return back('是！'); } }
    : { t: '留在這裡採集，等我回來。', fn: () => { a.wait = true; a.waitPos = { x: a.pos.x, z: a.pos.z }; return back('好，我就在這附近撿東西。'); } });
  o.push(BYE);
  return o;
}

export function dialogFor(a) {
  const P = G.player, s = G.stage;
  if (a.id === 'attendant') return attendantDialog(a);
  switch (a.id) {
    case 'mizhu':
      return { text: '在下糜竺，世代經商。足下也是生意人？妙極！\n你那「震天雷」若肯割愛，在下願出高價收購。', opts: [{ t: '看看貨物。', fn: () => 'shop' }, BYE] };
    case 'liubei':
      if (s === 0) return {
        text: '這位壯士衣著奇特，莫非是異域之人？\n方才遠處傳來雷霆之聲，可是出自你手中之物？', opts: [{
          t: '我來自一千八百年後，是個……賣兵器的。', fn: () => ({
            text: '一千八百年後？！……備雖難以盡信，但觀足下氣度不凡，必非常人。\n如今黃巾作亂，生靈塗炭。足下若願相助，備感激不盡！\n營中臥榻、水井任君取用，子仲（糜竺）處可交易物資。',
            opts: [{
              t: '成交。先說好，我的軍火可不便宜。', fn: () => {
                P.give('coin', 60, true); P.give('ration', 3, true); advance();
                if (!SQ.ownsAttendant('all')) SQ.giveAttendant('all', a.pos.x + 1.5, a.pos.z - 2, { first: true });
                return {
                  text: '哈哈，足下真乃妙人！\n營中小廝阿福手腳勤快，就讓他跟著你打點雜務——撿柴採藥都行，有事儘管問他。\n張角盤踞在西南方的黃巾營寨。你可在我這裡招兵買馬，帶些弟兄同去。',
                  opts: [{ t: '招兵買馬', fn: () => recruitNode(a) }, BYE],
                };
              }
            }]
          })
        }]
      };
      return {
        text: s === 1 ? '張角盤踞在西南方的黃巾營寨，善使妖術落雷——見地上金光，速速避開！\n雲長、翼德正在操練兵馬，等你立下戰功，他們自會傾力相助。'
          : s === 2 ? '董卓廢立天子、禍亂朝綱，十八路諸侯已起兵討伐。\n其部將華雄扼守東北方的汜水關。雲長、翼德已摩拳擦掌，你可招攬他們同去。'
            : s === 3 ? '呂布號稱「人中呂布，馬中赤兔」，天下無雙。\n雲長、翼德、子龍都可招攬同行，讓天下人看看何謂「三英戰呂布」！'
              : s === 4 ? '董卓老賊龜縮於東南方的郿塢。誅殺此賊，天下可定！備亦願親自隨你出征——只是營中糧餉吃緊。'
                : '先生大恩，備沒齒難忘。這亂世，願與先生同行。',
        opts: lordOpts(a),
      };
    default: {
      const say = SAY[a.id]; if (!say) return { text: '……' };
      if (s < 1) return { text: '大哥正在中軍帳前，有事請先與他商議。' };
      const lord = a.id === 'caocao' || a.id === 'sunjian';
      if (lord && s < 2) return { text: say.idle + '\n（待黃巾平定、諸侯會盟討董之後，他才會出兵。）' };
      const locked = !SQ.isUnlocked(a.id) ? `\n（${SQ.unlockHint(a.id)}）` : '';
      return { text: (a.follow ? '何事？' : say.idle) + locked, opts: lord ? lordOpts(a) : [...followOpt(a), BYE] };
    }
  }
}
