// 全域遊戲狀態（各模組共用）
export const G = {
  scene: null, camera: null, renderer: null,
  world: null, player: null, ui: null,
  actors: [], animals: [], attendants: [], mines: [],
  squadCmd: 'follow', holdPos: null, cutscene: null, projectiles: [], pickups: [], effects: [],
  time: 8 * 60,      // 一天中的分鐘數 0..1440
  day: 1,
  now: 0,            // 遊戲累計秒數
  stage: 0,          // 主線進度
  killed: {},        // 已擊殺的頭目
  flags: {},
  menu: 'start',     // 目前開啟的選單（null = 遊戲進行中）
  touch: false,
};
