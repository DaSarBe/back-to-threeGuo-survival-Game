// 物品、武器、配方、角色資料

export const ITEMS = {
  coin: { n: '五銖錢', i: '🪙' },
  wood: { n: '木材', i: '🪵' },
  iron: { n: '鐵礦', i: '⛏️' },
  saltpeter: { n: '硝石', i: '🧂' },
  sulfur: { n: '硫磺', i: '🟡' },
  charcoal: { n: '木炭', i: '⚫' },
  powder: { n: '黑火藥', i: '💥' },
  berry: { n: '野果', i: '🍒', food: 12, water: 6 },
  meat: { n: '生肉', i: '🥩', food: 14, hp: -6 },
  cooked: { n: '烤肉', i: '🍖', food: 42 },
  ration: { n: '乾糧', i: '🍘', food: 30 },
  herb: { n: '草藥', i: '🌿' },
  medicine: { n: '金瘡藥', i: '💊', heal: 45 },
  arrow: { n: '箭矢', i: '🏹' },
  shell: { n: '霰彈', i: '🔴' },
  rifleAmmo: { n: '步槍彈', i: '🔸' },
  grenade: { n: '震天雷', i: '💣' },
};

// 快捷列順序
export const HOTBAR = ['pistol', 'dao', 'spear', 'bow', 'shotgun', 'rifle', 'ji'];
export const WEAPONS = {
  pistol: { n: '手槍', i: '🔫', type: 'gun', dmg: 34, mag: 12, rate: 0.17, reload: 1.3, spread: 0.012, range: 160, ammo: null, kick: 0.035, fov: 55 },
  dao: { n: '環首刀', i: '🗡️', type: 'melee', dmg: 48, reach: 2.7, rate: 0.5 },
  spear: { n: '長矛', i: '🔱', type: 'melee', dmg: 60, reach: 3.7, rate: 0.75 },
  bow: { n: '長弓', i: '🏹', type: 'bow', dmg: 65, rate: 0.9, ammo: 'arrow' },
  shotgun: { n: '霰彈槍', i: '💥', type: 'gun', dmg: 17, pellets: 9, mag: 6, rate: 0.75, reload: 2.2, spread: 0.065, range: 45, ammo: 'shell', kick: 0.12, fov: 60 },
  rifle: { n: '步槍', i: '🎯', type: 'gun', dmg: 130, mag: 5, rate: 1.0, reload: 2.3, spread: 0.0015, range: 320, ammo: 'rifleAmmo', kick: 0.09, fov: 20, scope: true },
  ji: { n: '方天畫戟', i: '⚔️', type: 'melee', dmg: 130, reach: 4.0, rate: 0.65 },
};

export const RECIPES = [
  { id: 'charcoal', n: '燒製木炭', d: '將木材悶燒成炭', need: { wood: 2 }, give: { charcoal: 2 } },
  { id: 'powder', n: '調配黑火藥', d: '一硝二磺三木炭', need: { saltpeter: 1, sulfur: 1, charcoal: 1 }, give: { powder: 3 } },
  { id: 'grenade', n: '震天雷（手榴彈）', d: '按 G 投擲，範圍爆炸', need: { powder: 2, iron: 1 }, give: { grenade: 1 } },
  { id: 'shotgun', n: '霰彈槍', d: '近距離毀滅性火力', need: { iron: 8, wood: 4, powder: 3 }, weapon: 'shotgun', bonus: { shell: 12 } },
  { id: 'shell', n: '霰彈 ×6', d: '霰彈槍彈藥', need: { powder: 2, iron: 1 }, give: { shell: 6 } },
  { id: 'rifle', n: '步槍', d: '附瞄準鏡，一槍斃命', need: { iron: 12, wood: 6, powder: 5 }, weapon: 'rifle', bonus: { rifleAmmo: 10 } },
  { id: 'rifleAmmo', n: '步槍彈 ×10', d: '步槍彈藥', need: { powder: 2, iron: 2 }, give: { rifleAmmo: 10 } },
  { id: 'arrow', n: '箭矢 ×6', d: '長弓使用', need: { wood: 1, iron: 1 }, give: { arrow: 6 } },
  { id: 'cooked', n: '烤肉', d: '熟食更能充飢', need: { meat: 1, wood: 1 }, give: { cooked: 1 } },
  { id: 'medicine', n: '金瘡藥', d: '按 H 使用，恢復生命', need: { herb: 2 }, give: { medicine: 1 } },
];

export const SHOP_BUY = [
  { item: 'ration', n: 1, price: 12 },
  { item: 'medicine', n: 1, price: 40 },
  { item: 'arrow', n: 10, price: 20 },
  { item: 'iron', n: 1, price: 22 },
  { item: 'saltpeter', n: 1, price: 28 },
  { item: 'sulfur', n: 1, price: 28 },
  { weapon: 'dao', price: 60 },
  { weapon: 'spear', price: 70 },
  { weapon: 'bow', price: 80 },
  { armor: 0.25, n: '皮甲（減傷 25%）', price: 150 },
  { armor: 0.45, n: '鐵札甲（減傷 45%）', price: 420 },
];
export const SHOP_SELL = [
  { item: 'grenade', price: 60 },
  { item: 'powder', price: 12 },
  { item: 'shell', price: 5 },
  { item: 'rifleAmmo', price: 6 },
  { item: 'iron', price: 8 },
  { item: 'wood', price: 2 },
  { item: 'meat', price: 5 },
  { item: 'herb', price: 5 },
  { item: 'berry', price: 2 },
];

const SKIN = 0xe0b088;
const turbanLook = { cloth: 0x8a7a4a, pants: 0x4a4030, hat: 'turban', hatColor: 0xe8b818 };
const xlLook = { cloth: 0x3a3a44, armor: 0x26262c, pants: 0x25252a, hat: 'helmet', hatColor: 0x26262c, crest: 0x8b1a1a };
const turbanDrop = { coin: [2, 8], items: [['ration', 0.22], ['herb', 0.12], ['berry', 0.15]] };
const xlDrop = { coin: [6, 16], items: [['ration', 0.25], ['iron', 0.3], ['medicine', 0.08]] };

export const ACTORS = {
  // ---- 黃巾軍 ----
  turban_blade: { name: '黃巾賊', faction: 'enemy', hp: 70, speed: 4.6, dmg: 9, reach: 2.3, cd: 1.3, weapon: 'dao', look: turbanLook, drop: { ...turbanDrop, weapon: ['dao', 0.15] } },
  turban_spear: { name: '黃巾槍兵', faction: 'enemy', hp: 75, speed: 4.4, dmg: 11, reach: 3.0, cd: 1.5, weapon: 'spear', look: turbanLook, drop: { ...turbanDrop, weapon: ['spear', 0.15] } },
  turban_archer: { name: '黃巾弓手', faction: 'enemy', hp: 55, speed: 4.4, dmg: 9, ranged: true, cd: 2.4, weapon: 'bow', look: turbanLook, drop: { ...turbanDrop, items: [['arrow', 0.7, 4], ['ration', 0.2]], weapon: ['bow', 0.2] } },
  // ---- 董卓西涼軍 ----
  xl_blade: { name: '西涼刀兵', faction: 'enemy', hp: 120, speed: 5.0, dmg: 15, reach: 2.4, cd: 1.2, weapon: 'dao', look: xlLook, drop: { ...xlDrop, weapon: ['dao', 0.2] } },
  xl_spear: { name: '西涼槍兵', faction: 'enemy', hp: 130, speed: 4.8, dmg: 17, reach: 3.1, cd: 1.4, weapon: 'spear', look: xlLook, drop: { ...xlDrop, weapon: ['spear', 0.2] } },
  xl_archer: { name: '西涼弓手', faction: 'enemy', hp: 90, speed: 4.8, dmg: 13, ranged: true, cd: 2.1, weapon: 'bow', look: xlLook, drop: { ...xlDrop, items: [['arrow', 0.8, 5]], weapon: ['bow', 0.25] } },
  xl_cav: { name: '西涼鐵騎', faction: 'enemy', hp: 210, speed: 9.5, dmg: 22, reach: 3.3, cd: 1.6, weapon: 'spear', mounted: true, horseColor: 0x2a2420, look: xlLook, drop: { coin: [12, 25], items: [['iron', 0.5, 2], ['meat', 0.6, 2]] } },
  // ---- 友軍士卒 ----
  ally_soldier: { name: '劉備軍士卒', faction: 'ally', hp: 180, speed: 5.0, dmg: 18, reach: 3.0, cd: 1.3, weapon: 'spear', look: { cloth: 0x2f6b3a, armor: 0x2a4a30, pants: 0x30302a, hat: 'helmet', hatColor: 0x3a4a3a, crest: 0x2f8b3a } },
  co_soldier: { name: '聯軍士卒', faction: 'ally', hp: 180, speed: 5.0, dmg: 18, reach: 2.4, cd: 1.2, weapon: 'dao', look: { cloth: 0x2a3f7a, armor: 0x25305a, pants: 0x25252a, hat: 'helmet', hatColor: 0x30354a, crest: 0x3050b0 } },
  // ---- 可招募的兵卒（跟隨玩家，陣亡即消失） ----
  sq_spear: { name: '劉軍槍兵', short: '槍兵', faction: 'ally', squad: true, hp: 170, speed: 5.2, dmg: 17, reach: 3.0, cd: 1.3, weapon: 'spear', look: { cloth: 0x2f6b3a, armor: 0x2a4a30, pants: 0x30302a, hat: 'helmet', hatColor: 0x3a4a3a, crest: 0x2f8b3a } },
  sq_blade: { name: '劉軍刀兵', short: '刀兵', faction: 'ally', squad: true, hp: 150, speed: 5.6, dmg: 16, reach: 2.4, cd: 1.0, weapon: 'dao', look: { cloth: 0x3a7a45, pants: 0x30302a, hat: 'turban', hatColor: 0x2a5a30 } },
  sq_archer: { name: '曹軍弓弩手', short: '弓弩手', faction: 'ally', squad: true, hp: 115, speed: 5.0, dmg: 17, ranged: true, cd: 1.9, weapon: 'bow', look: { cloth: 0x2a3f7a, pants: 0x25252a, hat: 'turban', hatColor: 0x1a2a5a } },
  sq_cav: { name: '曹軍騎兵', short: '騎兵', faction: 'ally', squad: true, hp: 250, speed: 9.5, dmg: 23, reach: 3.3, cd: 1.4, weapon: 'spear', mounted: true, horseColor: 0x3a2a1c, look: { cloth: 0x2a3f7a, armor: 0x25305a, pants: 0x25252a, hat: 'helmet', hatColor: 0x30354a, crest: 0x3050b0 } },
  sq_shield: { name: '孫軍刀盾兵', short: '刀盾兵', faction: 'ally', squad: true, hp: 320, speed: 4.8, dmg: 15, reach: 2.4, cd: 1.1, weapon: 'dao', weapon2: 'shield', look: { cloth: 0xa82a20, armor: 0x7a1a14, pants: 0x3a1a14, hat: 'helmet', hatColor: 0x5a1a14, crest: 0xc8201a } },
  // ---- 名將（友方） ----
  liubei: { name: '劉備', title: '字玄德・漢室宗親', general: true, faction: 'ally', hp: 1400, speed: 5.6, dmg: 40, reach: 2.6, cd: 0.9, weapon: 'sword', weapon2: 'sword', scale: 1.08, look: { cloth: 0x2f7a45, armor: 0xb8963a, pants: 0x2a2a2a, hat: 'crown', hatColor: 0xd4af37, beard: 'short', cape: 0x1f5a30 } },
  guanyu: { name: '關羽', title: '字雲長・美髯公', general: true, faction: 'ally', hp: 2200, speed: 5.8, dmg: 62, reach: 3.6, cd: 1.1, weapon: 'guandao', scale: 1.2, look: { skin: 0xb5483a, cloth: 0x1f6b35, armor: 0x1a5a2c, pants: 0x1a3a22, hat: 'cap', hatColor: 0x1a5a2c, beard: 'long', cape: 0x145025 } },
  zhangfei: { name: '張飛', title: '字翼德・萬人敵', general: true, faction: 'ally', hp: 2200, speed: 5.8, dmg: 58, reach: 3.7, cd: 1.0, weapon: 'snake', scale: 1.18, look: { skin: 0x8a5a3c, cloth: 0x2a2a30, armor: 0x18181c, pants: 0x1a1a1a, hat: 'topknot', beard: 'bushy', cape: 0x5a1a1a } },
  zhaoyun: { name: '趙雲', title: '字子龍・常山趙子龍', general: true, faction: 'ally', hp: 1900, speed: 6.6, dmg: 54, reach: 3.5, cd: 0.85, weapon: 'spear', scale: 1.12, look: { cloth: 0xe8e8ee, armor: 0xc8ccd6, pants: 0xb0b4c0, hat: 'helmet', hatColor: 0xd0d4de, crest: 0xffffff, cape: 0xf4f4f8 } },
  caocao: { name: '曹操', title: '字孟德・驍騎校尉', general: true, faction: 'ally', hp: 1500, speed: 5.6, dmg: 44, reach: 2.6, cd: 0.9, weapon: 'sword', scale: 1.05, look: { cloth: 0x7a1f24, armor: 0x2a2a3a, pants: 0x1a1a22, hat: 'guan', hatColor: 0x18181c, beard: 'short', cape: 0x2a3f8a } },
  sunjian: { name: '孫堅', title: '字文臺・江東猛虎', general: true, faction: 'ally', hp: 1800, speed: 6.0, dmg: 52, reach: 2.6, cd: 0.95, weapon: 'dao', scale: 1.15, look: { cloth: 0xa82a20, armor: 0x7a1a14, pants: 0x3a1a14, hat: 'turban', hatColor: 0xc8201a, beard: 'short', cape: 0x8a1a14 } },
  mizhu: { name: '糜竺', title: '字子仲・徐州富商', general: true, noncombat: true, faction: 'ally', hp: 9999, speed: 3, dmg: 0, reach: 2, cd: 9, weapon: null, look: { cloth: 0x7a5a2a, pants: 0x3a2a1a, hat: 'guan', hatColor: 0x2a1a10, beard: 'short' } },
  // ---- 頭目 ----
  zhangjiao: { name: '張角', title: '大賢良師・天公將軍', boss: true, arenaR: 30, line: '蒼天已死，黃天當立！\n歲在甲子，天下大吉！', faction: 'enemy', hp: 900, speed: 3.6, dmg: 22, reach: 2.8, cd: 1.6, weapon: 'staff', special: 'lightning', scale: 1.12, look: { cloth: 0xd8b830, pants: 0x8a7a30, hat: 'turban', hatColor: 0xf0d020, beard: 'long', beardColor: 0x9a9a9a, cape: 0xb89820 }, drop: { coin: [150, 200], items: [['medicine', 1, 3], ['saltpeter', 1, 6], ['sulfur', 1, 6]] } },
  huaxiong: { name: '華雄', title: '董卓麾下驍將', boss: true, arenaR: 32, line: '又來一個送死的？\n某家刀下，已斬聯軍四將！', faction: 'enemy', hp: 1500, speed: 5.6, dmg: 30, reach: 3.5, cd: 1.3, weapon: 'guandao', scale: 1.22, look: { cloth: 0x4a2a2a, armor: 0x3a3a40, pants: 0x25252a, hat: 'helmet', hatColor: 0x3a3a40, crest: 0xb02020, beard: 'bushy', cape: 0x5a1010 }, drop: { coin: [220, 280], items: [['medicine', 1, 3], ['iron', 1, 10], ['powder', 1, 6]] } },
  lvbu: { name: '呂布', title: '字奉先・人中呂布', boss: true, arenaR: 36, line: '哼，就憑你？\n吾乃九原呂奉先——誰敢接我一戟！', faction: 'enemy', hp: 3800, speed: 7.0, dmg: 36, reach: 3.9, cd: 1.0, weapon: 'ji', special: 'charge', scale: 1.3, look: { cloth: 0x8a1a1a, armor: 0x2a2a30, pants: 0x1a1a1a, hat: 'feather', hatColor: 0xd4af37, cape: 0xa81818 }, drop: { coin: [400, 500], items: [['medicine', 1, 4]], weapon: ['ji', 1] } },
  dongzhuo: { name: '董卓', title: '字仲穎・竊國太師', boss: true, arenaR: 30, line: '區區妖人，也敢壞老夫大事？\n左右，給我拿下！', faction: 'enemy', hp: 2200, speed: 3.4, dmg: 30, reach: 2.8, cd: 1.4, weapon: 'sword', special: 'summon', scale: 1.25, look: { cloth: 0x4a1a5a, armor: 0x2a1a30, pants: 0x1a1a1a, hat: 'crown', hatColor: 0xd4af37, beard: 'bushy', fat: true, cape: 0x3a1040 }, drop: { coin: [600, 800], items: [['medicine', 1, 5]] } },
};

// ---------- 招兵買馬 ----------
// 每個兵種可用錢或資源招募；stage = 主線推進到第幾階段才開放
export const RECRUITS = {
  liubei: { stage: 1, units: [
    { id: 'sq_spear', coin: 40, res: { ration: 2, iron: 2 } },
    { id: 'sq_blade', coin: 35, res: { ration: 2, wood: 3 } },
  ], attendant: 'wood' },
  caocao: { stage: 2, units: [
    { id: 'sq_archer', coin: 60, res: { ration: 2, arrow: 10 } },
    { id: 'sq_cav', coin: 130, res: { ration: 3, iron: 5, meat: 2 } },
  ], attendant: 'ore' },
  sunjian: { stage: 2, units: [
    { id: 'sq_shield', coin: 70, res: { ration: 2, iron: 3, wood: 3 } },
  ], attendant: 'herb' },
};
// 隊伍名額：兵卒佔 1、名將佔 2；隨主線推進增加
export const SQUAD_CAP = [0, 3, 4, 5, 6, 8];
export const ATTENDANT_MAX = 3;
export const ATTENDANT_COST = { coin: 300, res: { wood: 10, iron: 10, ration: 5 } };
export const ATTENDANTS = {
  all: { name: '阿福', role: '小廝', desc: '什麼都撿', look: { cloth: 0x8a7a5a, pants: 0x4a3a2a, hat: 'default' } },
  wood: { name: '石頭', role: '樵夫', desc: '專門砍柴，一次帶回兩份木材', look: { cloth: 0x6a5a3a, pants: 0x3a3020, hat: 'turban', hatColor: 0x5a4a2a } },
  ore: { name: '老鐵', role: '礦工', desc: '專門採礦，一次帶回兩份礦石', look: { cloth: 0x4a4a50, pants: 0x2a2a2e, hat: 'turban', hatColor: 0x3a3a3a, beard: 'short' } },
  herb: { name: '小青', role: '藥童', desc: '專門採藥摘果，一次帶回兩份', look: { cloth: 0x4a8a6a, pants: 0x2a4a3a, hat: 'default' } },
};
// 名將解鎖條件（擊敗哪位頭目後願意同行）
export const UNLOCK = { guanyu: 'zhangjiao', zhangfei: 'zhangjiao', zhaoyun: 'huaxiong', caocao: 'huaxiong', sunjian: 'huaxiong', liubei: 'lvbu' };
// 名將招攬費（劇情解鎖後付一次，之後可隨時同行）
export const GENERAL_COST = {
  guanyu: { coin: 300, res: { ration: 8, iron: 8, powder: 4 } },
  zhangfei: { coin: 300, res: { ration: 8, iron: 8, powder: 4 } },
  zhaoyun: { coin: 400, res: { ration: 10, iron: 10, powder: 6 } },
  caocao: { coin: 450, res: { ration: 10, iron: 12, powder: 6 } },
  sunjian: { coin: 450, res: { ration: 10, iron: 12, powder: 6 } },
  liubei: { coin: 600, res: { ration: 12, iron: 15, powder: 8 } },
};
export const SQUAD_CMDS = [
  { id: 'follow', n: '跟隨', s: '跟' },
  { id: 'hold', n: '原地堅守', s: '守' },
  { id: 'attack', n: '自由攻擊', s: '攻' },
];
