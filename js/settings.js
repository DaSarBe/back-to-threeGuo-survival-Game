// 玩家設定：靈敏度、畫質、音量、手機按鍵大小（存在瀏覽器，與遊戲進度分開）
import { G } from './state.js';

const KEY = 'sanguo-settings-v1';
export const DEFAULTS = { sens: 1, touchSens: 1, quality: 'auto', sfx: 0.8, music: 0.6, btn: 1, layout: null, joyFixed: false }; // layout：自訂按鍵位置與大小（橫向／直向各一份）
export const S = { ...DEFAULTS };
try { Object.assign(S, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { }
G.settings = S;

export function saveSettings() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } }

// 畫質檔位：解析度上限、陰影、可視距離、雨滴數量
export const QUALITY = {
  low: { n: '低', pr: 1, shadows: 0, fog: 0.65, rain: 350 },
  med: { n: '中', pr: 1.5, shadows: 0, fog: 0.85, rain: 700 },
  high: { n: '高', pr: 2, shadows: 2048, fog: 1, rain: 1200 },
};
export const quality = () => QUALITY[S.quality === 'auto' ? (G.touch ? 'med' : 'high') : S.quality];
