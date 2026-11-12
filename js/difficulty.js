// 難度：簡單／普通／困難（存在各自的存檔裡，遊戲中可在設定更改）
import { G } from './state.js';

export const DIFFS = {
  easy: { n: '簡單', d: '敵人傷害較低、你的火力較強，飽食與水分消耗慢，倒下只損失一成錢', dmgIn: 0.6, dmgOut: 1.3, drain: 0.7, loss: 0.1 },
  normal: { n: '普通', d: '標準的亂世求生體驗', dmgIn: 1, dmgOut: 1, drain: 1, loss: 0.3 },
  hard: { n: '困難', d: '敵人傷害更高、更耐打，飽食與水分消耗快，倒下損失近半數的錢', dmgIn: 1.4, dmgOut: 0.85, drain: 1.25, loss: 0.45 },
};
export const diffId = () => (G.flags && DIFFS[G.flags.diff] ? G.flags.diff : 'normal');
export const diff = () => DIFFS[diffId()];
