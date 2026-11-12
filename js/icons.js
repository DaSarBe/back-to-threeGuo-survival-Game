// 遊戲內圖示：統一的金色線條風格（24×24，currentColor 著色），取代各平台長相不一的 emoji
// class="f" 的形狀會帶淡淡的填色
const SWORD = (deco = '') => `<path class="f" d="M6.6 17.4 18.2 5.8l2.3-1.2-1.2 2.3L7.7 18.5z"/><path d="M4.6 15.4l4 4M5.4 18.6l-2 2"/><circle cx="2.9" cy="21.1" r=".9"/>${deco}`;
const ICONS = {
  // ---------- 操作 ----------
  fire: '<path class="f" d="M12 2.6l2.1 5 5.2-1.7-2.5 4.8 4.5 3-5.5.7.6 5.5-4.4-3.3-4.4 3.3.6-5.5-5.5-.7 4.5-3-2.5-4.8 5.2 1.7z"/><circle cx="12" cy="12.2" r="2.2" fill="currentColor"/>',
  aim: '<circle class="f" cx="12" cy="12" r="8.4"/><circle cx="12" cy="12" r="3.2"/><path d="M12 2v5.4M12 16.6V22M2 12h5.4M16.6 12H22"/>',
  jump: '<path d="M6 12.5 12 6.5l6 6M6 17.5l6-6 6 6"/><path d="M4 21h16" opacity=".5"/>',
  reload: '<path d="M19.6 13.2A7.8 7.8 0 1 1 17.4 6.4"/><path d="M19.8 3.4v4.4h-4.4"/><rect class="f" x="10" y="8.6" width="4" height="7.2" rx=".8"/><path d="M10.8 11h2.4"/>',
  food: '<path class="f" d="M3.6 12.4h16.8a8.4 7.4 0 0 1-16.8 0z"/><path d="M6.4 12.4a5.6 4 0 0 1 11.2 0"/><path d="M14.6 2.6l-3.4 7.6M19 3.6l-5.4 6.6"/><path d="M9.4 20.2h5.2"/>',
  water: '<path d="M12 2.6v2.2M10.2 4.8h3.6"/><path class="f" d="M12 5.6c-1.9 0-2.9 1.2-2.9 2.7 0 1.2.6 1.9 1.3 2.4-2.5.9-4.4 2.9-4.4 5.6 0 3 2.7 4.8 6 4.8s6-1.8 6-4.8c0-2.7-1.9-4.7-4.4-5.6.7-.5 1.3-1.2 1.3-2.4 0-1.5-1-2.7-2.9-2.7z"/><path d="M9.8 10.6c1.4.4 3 .4 4.4 0" opacity=".7"/>',
  medicine: '<path d="M9 2.8h6v3H9z"/><path class="f" d="M8.2 5.8h7.6l1.4 3v10.4a2 2 0 0 1-2 2H8.8a2 2 0 0 1-2-2V8.8z"/><path d="M12 11v6.4M8.8 14.2h6.4"/>',
  grenade: '<circle class="f" cx="10.8" cy="14.2" r="6.8"/><path d="M14.6 8.6l1.8-2.2"/><path d="M16.4 6.4c1-1.3 2.4-1.5 3.4-.6"/><path d="M20.6 2.4v1.6M22 3.6h-1.6M21.6 2.6l-1 1" opacity=".9"/><path d="M7.4 12.4a3.9 3.9 0 0 1 2.4-2.8" opacity=".7"/>',
  firebomb: '<path class="f" d="M12 2.6c1.2 3.1 5.4 4.6 5.4 9.8a5.4 5.4 0 0 1-10.8 0c0-2.6 1.3-4.1 2.5-5.4.2 1.7 1.1 2.9 2.4 3.2-1.1-3.1-.6-5.5.5-7.6z"/><path d="M12 13.4c.9 1 1.8 1.9 1.8 3.3a1.8 1.8 0 0 1-3.6 0c0-1.2.9-2 1.8-3.3z" fill="currentColor"/>',
  mine: '<path class="f" d="M4 15.2c0 1.8 3.6 3.2 8 3.2s8-1.4 8-3.2v1.6c0 1.8-3.6 3.2-8 3.2s-8-1.4-8-3.2z"/><ellipse cx="12" cy="15.2" rx="8" ry="3.2"/><path d="M12 12V8.4M8.8 12.4 7.4 10M15.2 12.4 16.6 10"/><circle cx="12" cy="7.2" r="1.3" fill="currentColor"/>',
  skill: '<path class="f" d="M12 2.4l2.3 6.1 6.5.3-5.1 4 1.8 6.3L12 15.5l-5.5 3.6 1.8-6.3-5.1-4 6.5-.3z"/><path d="M12 8.2v4.2M9.9 10.3h4.2"/><path d="M4 21.4h16" opacity=".5"/>',
  cycle: '<path d="M4.4 11.4A7.6 7.6 0 0 1 17.6 6.6L19.6 8.6"/><path d="M19.8 4.2v4.4h-4.4"/><path d="M19.6 12.6A7.6 7.6 0 0 1 6.4 17.4L4.4 15.4"/><path d="M4.2 19.8v-4.4h4.4"/>',
  horse: '<path class="f" d="M8 21v-5C6 14.5 5.2 12 5.6 9.5 6.2 5.8 9 3.4 12.6 3.2l1-1.4 1 1.7c2.4.7 4 2.5 4.8 4.9l1.2 3.6c.2.8-.4 1.6-1.2 1.6h-1.8c-.8 0-1.4-.6-1.8-1.2l-1-1.4c-.6 1.6-1.4 3.2-1.2 5L14 21z"/><circle cx="15" cy="7" r=".9" fill="currentColor"/><path d="M10.2 4.6c-1.6 1-2.6 2.8-2.7 4.8M9 5.8c-1 .5-1.7 1.4-2 2.4" opacity=".7"/>',
  flag: '<path d="M6 21.4V2.8"/><path class="f" d="M6 3.8h11.6L15 7.6l2.6 3.8H6z"/>',
  bag: '<path d="M8.8 3.4h6.4l-1.6 3.2h-3.2z"/><path class="f" d="M10.4 6.6C6 8.2 3.9 12.2 4.4 15.8c.4 3 3.4 5 7.6 5s7.2-2 7.6-5c.5-3.6-1.6-7.6-6-9.2"/><path d="M9 11.4h6M12 11.4v3.4"/>',
  pause: '<path d="M8.6 5v14M15.4 5v14" stroke-width="3"/>',
  map: '<path class="f" d="M3.6 6.2l5.2-2 6.4 2 5.2-2v13.6l-5.2 2-6.4-2-5.2 2z"/><path d="M8.8 4.2v13.6M15.2 6.2v13.6"/>',
  expand: '<path d="M14 4h6v6M10 20H4v-6M20 4l-6.5 6.5M4 20l6.5-6.5"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path class="f" d="M12 2.6l1.6 2.4 2.8-.6.6 2.8 2.4 1.6-1.2 2.6 1.2 2.6-2.4 1.6-.6 2.8-2.8-.6L12 21.4l-1.6-2.4-2.8.6-.6-2.8-2.4-1.6 1.2-2.6-1.2-2.6 2.4-1.6.6-2.8 2.8.6z"/>',
  film: '<rect class="f" x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9.2v5.6l4.6-2.8z" fill="currentColor"/><path d="M3 8.6h2.4M3 15.4h2.4M18.6 8.6H21M18.6 15.4H21"/>',
  craft: '<path class="f" d="M13.4 3.4l4.8 4.8-2.8 2.8-4.8-4.8z"/><path d="M12.2 8.6 3.8 17a1.7 1.7 0 0 0 2.4 2.4l8.4-8.4"/><path d="M16 3l2 2" opacity=".6"/>',
  scroll: '<path class="f" d="M6 4h11a2 2 0 0 1 2 2v12.4a1.6 1.6 0 0 1-3.2 0V7.6H5.6"/><path d="M6 4a1.8 1.8 0 0 0-1.8 1.8V7.6H8V5.8A1.8 1.8 0 0 0 6 4zM15.8 20H7.4a1.8 1.8 0 0 1-1.8-1.8V7.6"/><path d="M8.8 11h4.4M8.8 14h4.4" opacity=".8"/>',
  target: '<circle cx="12" cy="12" r="7.6"/><circle cx="12" cy="12" r="2" fill="currentColor"/><path d="M12 2v3.4M12 18.6V22M2 12h3.4M18.6 12H22"/>',
  play: '<path class="f" d="M8 5.2v13.6L19 12z"/>',
  save: '<path class="f" d="M6 3.6h12v16.8l-6-3.6-6 3.6z"/><path d="M9 9.6l2.2 2.2L15.4 7.6"/>',
  music: '<path d="M9 18V5.6l10-2V16"/><circle class="f" cx="6.6" cy="18" r="2.4"/><circle class="f" cx="16.6" cy="16" r="2.4"/>',
  // ---------- 狀態 ----------
  heart: '<path class="f" d="M12 20.4S3.4 15.2 3.4 9.2A4.6 4.6 0 0 1 12 6.8a4.6 4.6 0 0 1 8.6 2.4c0 6-8.6 11.2-8.6 11.2z"/>',
  bolt: '<path class="f" d="M13.4 2.6 5.4 13.4h5.4l-1.2 8 8-10.8h-5.4z"/>',
  drop: '<path class="f" d="M12 2.8s6.4 7 6.4 11.6a6.4 6.4 0 0 1-12.8 0C5.6 9.8 12 2.8 12 2.8z"/><path d="M9 14.6a3 3 0 0 0 2.4 3" opacity=".7"/>',
  damp: '<path class="f" d="M7 14.4h10.6a3.8 3.8 0 0 0 .4-7.6 5.6 5.6 0 0 0-10.8 1.4A3.1 3.1 0 0 0 7 14.4z"/><path d="M8.4 17.4l-1 2.4M12.4 17.4l-1 2.4M16.4 17.4l-1 2.4"/>',
  coin: '<circle class="f" cx="12" cy="12" r="8.6"/><rect x="9.4" y="9.4" width="5.2" height="5.2"/><path d="M12 4.6v2.6M12 16.8v2.6" opacity=".6"/>',
  // ---------- 兵器 ----------
  'w-pistol': '<path class="f" d="M2.6 7.2h17.6v4.2H2.6z"/><path class="f" d="M14.4 11.4h5l1.2 8h-4.8z"/><path d="M14.4 11.4c0 2.4-1.2 3.6-3.2 3.6M3.8 7.2V6M19 7.2V6M5 9.2h7" /><path d="M16.2 13.6h2.4M16.6 15.8h2.4" opacity=".6"/>',
  'w-dao': '<path class="f" d="M6.4 17.6 18 6l2.6-1.6-1.2 2.4L7.8 19z"/><path d="M4.6 15.8l3.6 3.6M5.6 18.4l-1.6 1.6"/><circle cx="3.2" cy="20.8" r="1.4"/>',
  'w-spear': '<path d="M3.6 20.4 15.4 8.6"/><path class="f" d="M14.4 9.6l1.8-5.6 4.2-.4-.4 4.2z"/><path d="M13.8 10.2l-2.2-.2M13.8 10.2l.2 2.2"/>',
  'w-bow': '<path d="M4.6 3.6C13 4.4 19.6 11 20.4 19.4"/><path d="M4.6 3.6 20.4 19.4" opacity=".7"/><path d="M3 21 16.6 7.4"/><path class="f" d="M16.6 7.4l-.6 3 3.6-3.6-3 .6z"/><path d="M3 21l1.6-.2M3 21l.2-1.6"/>',
  'w-shotgun': '<path d="M2 8.4h12.6M2 11h12.6"/><path class="f" d="M14.6 7.2h3.2l4.2 2.6-1 5.2-4.2-2h-2.2z"/><path d="M13.6 12.6v2.6"/>',
  'w-rifle': '<path d="M1.6 11.4h13"/><path class="f" d="M14 10.2h3.8l4.4 2.2-1 4.2-4.2-2.2H14z"/><rect class="f" x="6.4" y="6.4" width="6.4" height="2.6" rx="1"/><path d="M8 9v2.4M11.2 9v2.4M14.2 13v2.4"/>',
  'w-ji': '<path d="M3.6 20.4 16.6 7.4"/><path class="f" d="M16.4 7.6l1.4-4.2 3-.4-.4 3z"/><path d="M13.4 5.2c-1.9.9-2.4 3.2-.9 4.6M18.8 10.6c-.9 1.9-3.2 2.4-4.6.9"/><path d="M11.6 12.4l-1.4-1 .4 1.8z" fill="currentColor"/>',
  'w-guandao': '<path d="M3.6 20.4 14.2 9.8"/><path class="f" d="M14.2 9.8c.8-3.2 3-5.6 6.4-6.4-.4 3.4-2 6.4-5.2 8.2z"/><path d="M12.4 11.6l1.6 1.6"/>',
  'w-staff': '<path d="M4.4 19.6 15.4 8.6"/><circle class="f" cx="17.6" cy="6.4" r="2.8"/><path d="M7.4 15.6l1 1M10.2 12.8l1 1M13 10l1 1"/>',
  'w-qixing': SWORD('<circle cx="10.4" cy="13.6" r=".6" fill="currentColor"/><circle cx="12.6" cy="11.4" r=".6" fill="currentColor"/><circle cx="14.8" cy="9.2" r=".6" fill="currentColor"/><circle cx="17" cy="7" r=".6" fill="currentColor"/>'),
  'w-qinggang': SWORD('<path d="M3 21c-.2 1.4.4 2 1.4 2M3 21c-1.4.2-2 .8-1.8 1.8" opacity=".8"/>'),
  'w-yitian': SWORD('<path class="f" d="M5.2 14.4l4.4 4.4-1.6.8-3.6-3.6z"/>'),
  'w-smg': '<path d="M2 10.6h5"/><path class="f" d="M7 8.6h11.4l3 2.2-1 3.6-3.4-1.6H7z"/><path class="f" d="M9.4 12.8h2.4l-.6 6.4H9z"/><path d="M13.6 12.8l.8 3M15.6 8.6V7.2"/><path d="M10 10.4h5" opacity=".7"/>',
  wind: '<path d="M3 8.4h11a2.6 2.6 0 1 0-2.6-2.6M3 12.4h15a2.6 2.6 0 1 1-2.6 2.6M3 16.4h7"/>',
  device: '<rect class="f" x="3.6" y="9" width="16.8" height="10" rx="1.6"/><path d="M6.4 9 8 4.6h8L17.6 9M8 13h8M8 16h5"/>',
  'w-tbow': '<path class="f" d="M4.6 3.6C13 4.4 19.6 11 20.4 19.4l-1.6.2C18 12 12 6 4.4 5.2z"/><path d="M4.6 3.6 3 2.6M20.4 19.4l1 1.6"/><path d="M4.5 4.4 19.6 19.5" opacity=".6"/><path d="M3 21 15.4 8.6"/><path class="f" d="M15.4 8.6l-.6 3 3.6-3.6-3 .6z"/>',

  // ---------- 物品 ----------
  wood: '<rect class="f" x="2.6" y="9.2" width="15.4" height="6.4" rx="3.2" transform="rotate(-24 10.3 12.4)"/><ellipse cx="17.4" cy="8.9" rx="2.3" ry="3.2" transform="rotate(-24 17.4 8.9)"/><path d="M17.4 8.9h.01"/><path d="M6.6 16.4l2.6-1.2M9.8 11.6l2.4-1" opacity=".6"/>',
  iron: '<path class="f" d="M3.6 15.8 7.2 7.4l6.2-2.8 6.4 4.6 1 7-6.6 3.8-7.8-1.4z"/><path d="M8.8 10.4l2.8 1.6M14.2 8.6l1.6 3.2M11 16l3-.8" stroke-width="2.4" opacity=".9"/>',
  saltpeter: '<path class="f" d="M6.8 20.2 4.6 11l3.2-5.6L11 11l-1.2 9.2z"/><path class="f" d="M11.6 20.2l1-11.6L16.4 4l3.2 6-1.8 10.2z"/><path d="M3.4 20.6h17.2"/>',
  sulfur: '<path class="f" d="M5.2 14.6c-1.6-3 .4-6.6 3.8-6.8.8-2.2 4.2-2.8 5.8-.8 3.4-.2 5.2 3.6 3.4 6.2 1 2.6-1 5.2-3.8 4.6-1.8 1.8-5 1.6-6.2-.4-2.4.4-4.2-1.2-3-2.8z"/><circle cx="10" cy="12" r=".7" fill="currentColor"/><circle cx="14.4" cy="13.8" r=".7" fill="currentColor"/>',
  charcoal: '<path class="f" d="M3.4 17.6 6.8 11l5.2.8 2 6.4-6.6 2z"/><path class="f" d="M11.8 11.8l4-5.6 4.8 3.2-1 7.4-5.8 1.4z"/><path d="M7.4 14.4l2.2 1.4M15.4 10l1.6 2.4" opacity=".55"/>',
  powder: '<path class="f" d="M7 4.6h10l1.4 7.4L17 19.4H7L5.6 12z"/><path d="M6.2 8.6h11.6M6.2 15.4h11.6"/><path d="M12 4.6c0-1.4 1.2-2 2.6-1.6"/>',
  wetPowder: '<path class="f" d="M5.4 5.4h9l1.2 6.6-1.2 6.6h-9L4.2 12z"/><path d="M4.8 9h10.2M4.8 15h10.2"/><path class="f" d="M19 9.6c1 1.6 2 2.8 2 4a2 2 0 0 1-4 0c0-1.2 1-2.4 2-4z"/>',
  oilcloth: '<path class="f" d="M6.2 9.6h11.6l1.4 8.6a2 2 0 0 1-2 2.2H6.8a2 2 0 0 1-2-2.2z"/><path d="M8.6 9.6 7.4 5.2h9.2l-1.2 4.4M9.4 13.4h5.2"/>',
  baojia: '<path class="f" d="M7 4l5 2 5-2 3.2 3.4-1.8 3.4V20H5.6v-9.2L3.8 7.4z"/><path d="M9 10.2h6M9 13.6h6M9 17h6"/>',
  parts: '<circle class="f" cx="12" cy="12" r="5.4"/><circle cx="12" cy="12" r="1.9"/><path d="M12 3.2v3.2M12 17.6v3.2M3.2 12h3.2M17.6 12h3.2M5.8 5.8l2.2 2.2M16 16l2.2 2.2M5.8 18.2 8 16M16 8l2.2-2.2"/>',
  berry: '<circle class="f" cx="8.2" cy="15.2" r="3.4"/><circle class="f" cx="15.6" cy="15.8" r="3.4"/><circle class="f" cx="12" cy="10.2" r="3"/><path d="M12 7.2c0-2 1.4-3.6 3.6-4.2"/>',
  meat: '<path class="f" d="M4.8 12.6c0-4.2 4-7.4 8.6-7.4 3.8 0 6.4 3 6.4 6.2 0 4.6-4.4 8-9 8-3.4 0-6-2.8-6-6.8z"/><path class="f" d="M10.4 11.4c1-1.4 3.2-1.6 4.2 0s-.2 3.4-2.1 3.4-3-1.8-2.1-3.4z"/>',
  cooked: '<path class="f" d="M9.6 14.4c-2.6-2.6-2.4-7 .6-9.2 2.8-2 6.8-1.2 8.6 1.8 1.8 3 .6 6.8-2.6 8.2-2.2 1-4.6.8-6.6-.8z"/><path d="M9.8 14.2 6 18M4.6 16.4a1.6 1.6 0 1 0 1.6 2.6 1.6 1.6 0 1 0 2.4 1.6"/>',
  ration: '<path class="f" d="M4 15.4c0-4.4 3.6-8 8-8s8 3.6 8 8v1.8H4z"/><path d="M2.8 17.2h18.4M9 11.4l1 1.4M13.6 10.6l.8 1.6"/>',
  herb: '<path d="M12 21V9.4"/><path class="f" d="M12 13.2C8 13.2 5.4 10.4 5.4 6.8c4 0 6.6 2.6 6.6 6.4z"/><path class="f" d="M12 10.6c0-3.6 2.6-6.4 6.6-6.4 0 3.6-2.6 6.4-6.6 6.4z"/><path class="f" d="M12 16.8c2.8 0 5-2 5-4.8-2.8 0-5 2-5 4.8z"/>',
  arrow: '<path d="M4.4 19.6 18.4 5.6"/><path class="f" d="M14.6 4.4l5.2-.2-.2 5.2z"/><path d="M4.4 19.6l.4-3.8M4.4 19.6l3.8-.4M6.6 17.4l.3-3M6.6 17.4l3-.3"/>',
  shell: '<rect class="f" x="8" y="3.4" width="8" height="12.4" rx="1.4"/><rect x="7.2" y="15.8" width="9.6" height="4.6" rx=".8"/><path d="M8 7.6h8"/>',
  rifleAmmo: '<path class="f" d="M9.4 9.4c0-3.4 1.2-5.8 2.6-6.6 1.4.8 2.6 3.2 2.6 6.6v10H9.4z"/><path d="M9.4 12.4h5.2M8.4 19.4h7.2v1.8H8.4z"/>',
  // ---------- 狀態／訊息 ----------
  'fire-s': '<path class="f" d="M12 3c1 3.4 5.4 5 5.4 10a5.4 5.4 0 0 1-10.8 0c0-2.6 1.4-4 2.6-5.4.2 1.8 1 2.8 2.4 3.2-1-3-.6-5.6.4-7.8z"/>',
  lock: '<rect class="f" x="5" y="10.4" width="14" height="10" rx="1.8"/><path d="M8 10.4V7.6a4 4 0 0 1 8 0v2.8M12 14.2v2.6"/>',
  unlock: '<rect class="f" x="5" y="10.4" width="14" height="10" rx="1.8"/><path d="M8 10.4V7.6a4 4 0 0 1 7.6-1.7M12 14.2v2.6"/>',
  flashlight: '<rect class="f" x="2.6" y="9.6" width="8.6" height="4.8" rx="1.2"/><path class="f" d="M11.2 9.6 14.6 7.4v9.2l-3.4-2.2z"/><path d="M5 9.6v4.8M17.4 8.6l3.6-1.8M17.8 12h3.8M17.4 15.4l3.6 1.8"/>',
  sword: SWORD(),
  trophy: '<path class="f" d="M7.4 4h9.2v4.8a4.6 4.6 0 0 1-9.2 0z"/><path d="M7.4 6H4.6a2.8 2.8 0 0 0 2.8 4M16.6 6h2.8a2.8 2.8 0 0 1-2.8 4M12 13.4v3.4M8.6 20.4h6.8l-.8-3.6H9.4z"/>',
  warn: '<path class="f" d="M12 3.4l9.4 16.4H2.6z"/><path d="M12 9.4v4.8"/><circle cx="12" cy="17" r=".5" fill="currentColor"/>',
  tip: '<path class="f" d="M12 3.2a6 6 0 0 1 3.6 10.8c-.8.6-1.2 1.4-1.2 2.4H9.6c0-1-.4-1.8-1.2-2.4A6 6 0 0 1 12 3.2z"/><path d="M9.6 18.6h4.8M10.4 21h3.2"/>',
  box: '<path class="f" d="M3.6 8.4 12 4.4l8.4 4v8.4L12 20.8l-8.4-4z"/><path d="M3.6 8.4 12 12.6l8.4-4.2M12 12.6v8.2M7.8 6.4l8.4 4.2"/>',
  tent: '<path class="f" d="M3 19.6 12 4.6l9 15z"/><path d="M12 4.6v15M9.2 19.6 12 14.6l2.8 5M2 19.6h20"/>',
  bond: '<rect class="f" x="2.4" y="8.6" width="11.4" height="6.8" rx="3.4"/><rect x="10.2" y="8.6" width="11.4" height="6.8" rx="3.4"/>',
  star: '<path class="f" d="M12 3.2l2.6 5.6 6.1.6-4.6 4.1 1.3 6-5.4-3.1-5.4 3.1 1.3-6L3.3 9.4l6.1-.6z"/>',
  check: '<path d="M4.6 12.6l4.6 4.6L19.4 7"/>',
  cross: '<path d="M6 6l12 12M18 6 6 18"/>',
  portal: '<ellipse class="f" cx="12" cy="12" rx="6.4" ry="8.6"/><path d="M12 7.6c2 0 3.2 2 3.2 4.4S14 16.4 12 16.4"/>',
  moon: '<path class="f" d="M15.4 3.6a8.4 8.4 0 1 0 4.8 12.8 7 7 0 0 1-4.8-12.8z"/>',
  sun: '<circle class="f" cx="12" cy="12" r="4.4"/><path d="M12 2.6v2.6M12 18.8v2.6M2.6 12h2.6M18.8 12h2.6M5.4 5.4l1.8 1.8M16.8 16.8l1.8 1.8M5.4 18.6l1.8-1.8M16.8 7.2l1.8-1.8"/>',
  scan: '<circle cx="12" cy="12" r="8.4"/><circle cx="12" cy="12" r="4.4" opacity=".6"/><path d="M12 12l6-6"/><circle cx="15.6" cy="9.4" r="1" fill="currentColor"/>',
  door: '<path class="f" d="M6 21V4.4l9-1.4v18"/><path d="M4 21h16M15 3v18M12 12v1.6"/>',
  shield: '<path class="f" d="M12 3.2 19 6v5.6c0 4.6-3 7.8-7 9.2-4-1.4-7-4.6-7-9.2V6z"/>',
  rain: '<path class="f" d="M7 14.6a4 4 0 0 1 .6-8 5.4 5.4 0 0 1 10.2 1.6 3.2 3.2 0 0 1-.4 6.4z"/><path d="M8.4 17.4l-1 2.6M12.4 17.4l-1 2.6M16.4 17.4l-1 2.6"/>',
  cloud: '<path class="f" d="M7 17.4a4.4 4.4 0 0 1 .6-8.8 5.8 5.8 0 0 1 11 1.8 3.6 3.6 0 0 1-.4 7z"/>',
  fog: '<path d="M4 8h16M2.6 12h14.6M6 16h15.4M4 20h10" />',
  soldier: '<path class="f" d="M5 14.4a7 7 0 0 1 14 0z"/><path d="M3.4 14.4h17.2M12 7.4V4M10 4h4M8.4 17.4h7.2l-1 3.2H9.4z"/>',
  basket: '<path class="f" d="M4 10.4h16l-2 9.4H6z"/><path d="M7.6 10.4c0-3 2-5.4 4.4-5.4s4.4 2.4 4.4 5.4M8.8 13.4l.6 3.6M12 13.4v3.6M15.2 13.4l-.6 3.6"/>',
  puff: '<circle class="f" cx="8" cy="14.2" r="3.6"/><circle class="f" cx="14.6" cy="12.8" r="4.2"/><circle class="f" cx="11.8" cy="8" r="3"/>',
  quest: '<path class="f" d="M5.4 3.6h13.2v16.8l-6.6-3.6-6.6 3.6z"/><path d="M9 8.4h6M9 11.8h4"/>',
};
export const WEAPON_ICON = id => 'w-' + id;
export function icon(name, cls = '') {
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}
// 把頁面上 data-icon 的元素換成圖示（保留原本的文字標籤在後面）
export function applyIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach(el => {
    if (el.dataset.iconDone) return;
    el.dataset.iconDone = 1;
    const label = el.dataset.label ? `<span class="lb">${el.dataset.label}</span>` : '';
    const keep = [...el.children].filter(c => c.tagName === 'B' || c.id); // 保留數字角標等子元素
    el.innerHTML = icon(el.dataset.icon) + label;
    keep.forEach(c => el.appendChild(c));
  });
}
export const ICON_NAMES = Object.keys(ICONS);

// ---------- 彩色圖示：物品與訊息用，一眼就能分辨 ----------
export const ICON_COLOR = {
  coin: '#f2c84a', wood: '#c88a4a', iron: '#b4bec8', saltpeter: '#e8f0f4', sulfur: '#f2d43a', charcoal: '#9a9a9a', powder: '#e8704a', wetPowder: '#8ab8d8',
  oilcloth: '#d0a868', baojia: '#e0b84a', parts: '#6ad8ff', berry: '#f05a6a', meat: '#f08070', cooked: '#e0984a', ration: '#ecd6a4', herb: '#7ad06a',
  medicine: '#ff8a8a', arrow: '#e0c890', shell: '#f06a4a', rifleAmmo: '#f0c050', grenade: '#c8c8c8', firebomb: '#ff8a3a', mine: '#c0b088',
  'fire-s': '#ff8a3a', flashlight: '#fff0c0', warn: '#ffb070', tip: '#ffe680', box: '#6ad8ff', tent: '#e0b878', bond: '#ff9ab8', star: '#ffd24a',
  check: '#7dff9a', cross: '#ff7a60', portal: '#6ad8ff', moon: '#d8e0ff', sun: '#ffd24a', scan: '#6ad8ff', door: '#6ad8ff', shield: '#a8bcff',
  rain: '#8ac8ff', cloud: '#c8d0d8', fog: '#c8d0d8', wind: '#c8f0ff', soldier: '#9ad09a', basket: '#e0b878', puff: '#b8b8b8', trophy: '#ffd24a',
  lock: '#c8b890', unlock: '#ffd24a', horse: '#d8a070', bolt: '#c8f06a', heart: '#ff6a5a', sword: '#ffd24a', flag: '#ffd24a', save: '#9ad0ff', device: '#6ad8ff', target: '#ffb070', quest: '#ffd24a',
};
export const cicon = (name, cls = '') => icon(name, cls).replace('<svg ', `<svg style="color:${ICON_COLOR[name] || 'inherit'}" `);
// 物品：圖示＋名稱（＋數量）
export const itemTag = (k, n, items) => `<span class="it">${cicon(k)}${items[k].n}${n != null ? ` ×${n}` : ''}</span>`;
// 文字中的 emoji 換成同風格的圖示（各平台 emoji 長相不一，換掉後整體更一致）
const EMOJI = {
  '🪙': 'coin', '🪵': 'wood', '⛏️': 'iron', '⛏': 'iron', '🧂': 'saltpeter', '🟡': 'sulfur', '⚫': 'charcoal', '💥': 'powder', '🧯': 'wetPowder', '👝': 'oilcloth', '🥋': 'baojia',
  '⚙️': 'parts', '⚙': 'parts', '🍒': 'berry', '🥩': 'meat', '🍖': 'cooked', '🍘': 'ration', '🌿': 'herb', '💊': 'medicine', '🏹': 'arrow', '🔴': 'shell', '🔸': 'rifleAmmo',
  '💣': 'grenade', '🔥': 'fire-s', '🔘': 'mine', '⚔️': 'sword', '⚔': 'sword', '🏆': 'trophy', '⚠️': 'warn', '⚠': 'warn', '🚩': 'flag', '💡': 'tip', '📦': 'box', '🌬️': 'wind', '🌬': 'wind',
  '⛺': 'tent', '🔦': 'flashlight', '🤝': 'bond', '🔒': 'lock', '🔓': 'unlock', '💾': 'save', '🌀': 'portal', '🌙': 'moon', '☀️': 'sun', '☀': 'sun', '🛰️': 'scan', '🛰': 'scan', '🚪': 'door',
  '⛨': 'shield', '💨': 'puff', '🌧️': 'rain', '🌧': 'rain', '☁️': 'cloud', '☁': 'cloud', '🌫️': 'fog', '🌫': 'fog', '⚡': 'bolt', '🐴': 'horse', '🛡️': 'shield', '🛡': 'shield', '🧺': 'basket',
  '🎓': 'tip', '✔': 'check', '✖': 'cross', '★': 'star', '🎯': 'target', '🔫': 'w-pistol', '🗡️': 'w-dao', '🔱': 'w-spear', '🍶': 'water', '💧': 'water', '🎒': 'bag', '⚑': 'flag', '🏭': 'craft', '📜': 'scroll',
};
const EMO_RE = new RegExp(Object.keys(EMOJI).sort((a, b) => b.length - a.length).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
export const iconize = html => html.replace(EMO_RE, m => cicon(EMOJI[m])).replace(/️/g, '');
export const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
export const iconText = t => iconize(esc(t));
