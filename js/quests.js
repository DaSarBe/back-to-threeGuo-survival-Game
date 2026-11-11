import { G } from './state.js';
import { audio } from './audio.js';

export const QUESTS = [
  { t: '亂世求生', d: '打開身旁的軍火箱，然後前往東南方的劉備軍營，找劉備談談。', site: 'camp' },
  { t: '討伐黃巾', d: '前往西南方的黃巾營寨，擊殺「大賢良師」張角。可邀關羽、張飛、趙雲同行。', site: 'turban', boss: 'zhangjiao' },
  { t: '溫酒斬華雄', d: '渡河前往東北方的汜水關，擊殺華雄。途中的聯軍大營有曹操與孫堅。', site: 'sishui', boss: 'huaxiong' },
  { t: '三英戰呂布', d: '前往西北方的虎牢關，擊敗天下第一武將呂布。建議備妥步槍、震天雷，並帶上劉關張。', site: 'hulao', boss: 'lvbu' },
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

function followOpts(a) {
  const n = G.actors.filter(x => x.follow && x.alive).length;
  if (a.follow) return [{ t: '請回營待命。', fn: () => { a.follow = false; return { text: '好，若有戰事，隨時來喚。' }; } }, { t: '繼續前進！' }];
  return [{
    t: '請隨我出征！', fn: () => {
      if (n >= 3) return { text: '兵貴精不貴多，你身邊已有三位同行了。' };
      a.follow = true; a.followSlot = n * 1.6; audio.play('horn', 0.5);
      return { text: SAY[a.id].join || '走！' };
    }
  }, { t: '告辭。' }];
}

const SAY = {
  guanyu: { idle: '關某觀閣下手中之器，聲若雷霆，百步取人性命……天下竟有此等神兵。', join: '關某願往！酒且斟下，某去便來。' },
  zhangfei: { idle: '喂！你那會噴火的鐵疙瘩借俺老張耍耍？……不借？小氣！', join: '哈哈哈！早就手癢了！燕人張翼德在此，誰敢與我決一死戰！' },
  zhaoyun: { idle: '雲觀先生雖非行伍出身，卻臨危不亂，實乃奇人。', join: '常山趙子龍，願為先生開路！' },
  liubei: { join: '備雖不才，願與先生共赴國難！' },
  caocao: { idle: '「寧教我負天下人」……咳，足下這身本事，可願來我帳下？錢糧兵馬，任你開口。', join: '好！操便與你走這一遭，看看你那「火器」究竟如何了得！' },
  sunjian: { idle: '某乃江東孫文臺。董賊亂政，人人得而誅之！', join: '江東子弟，何懼之有！隨我殺！' },
};

export function dialogFor(a) {
  const P = G.player, s = G.stage;
  switch (a.id) {
    case 'mizhu':
      return { text: '在下糜竺，世代經商。足下也是生意人？妙極！\n你那「震天雷」若肯割愛，在下願出高價收購。', opts: [{ t: '看看貨物。', fn: () => 'shop' }, { t: '告辭。' }] };
    case 'liubei':
      if (s === 0) return {
        text: '這位壯士衣著奇特，莫非是異域之人？\n方才遠處傳來雷霆之聲，可是出自你手中之物？', opts: [{
          t: '我來自一千八百年後，是個……賣兵器的。', fn: () => ({
            text: '一千八百年後？！……備雖難以盡信，但觀足下氣度不凡，必非常人。\n如今黃巾作亂，生靈塗炭。足下若願相助，備感激不盡！\n營中臥榻、水井任君取用，子仲（糜竺）處可交易物資。',
            opts: [{ t: '成交。先說好，我的軍火可不便宜。', fn: () => { P.give('coin', 60, true); P.give('ration', 3, true); advance(); return { text: '哈哈，足下真乃妙人！\n張角盤踞在西南方的黃巾營寨，妖術了得，千萬小心。\n雲長、翼德、子龍皆萬人敵，可邀他們同行。' }; } }]
          })
        }]
      };
      if (s === 1) return { text: '張角盤踞在西南方的黃巾營寨，善使妖術落雷——見地上金光，速速避開！\n雲長、翼德、子龍皆可與你同行。', opts: [{ t: '我這就去。' }] };
      if (s === 2) return { text: '董卓廢立天子、禍亂朝綱，十八路諸侯已起兵討伐。\n其部將華雄扼守東北方的汜水關，連斬聯軍數將。足下的「火器」，正是破敵良機。', opts: [{ t: '交給我。' }] };
      if (s >= 3) return { text: s === 3 ? '呂布號稱「人中呂布，馬中赤兔」，天下無雙。\n備願與雲長、翼德同往——讓天下人看看何謂「三英戰呂布」！' : s === 4 ? '董卓老賊龜縮於東南方的郿塢。誅殺此賊，天下可定！' : '先生大恩，備沒齒難忘。這亂世，願與先生同行。', opts: followOpts(a) };
      break;
    default: {
      const say = SAY[a.id]; if (!say) return { text: '……' };
      if (s < 1) return { text: '大哥正在中軍帳前，有事請先與他商議。' };
      if ((a.id === 'caocao' || a.id === 'sunjian') && s < 2) return { text: say.idle + '\n（待黃巾平定、諸侯會盟討董之後，他才會出兵。）' };
      return { text: a.follow ? '何事？' : say.idle, opts: followOpts(a) };
    }
  }
  return { text: '……' };
}
