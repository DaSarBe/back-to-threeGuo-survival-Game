// 天氣：晴／陰／雨／霧。下雨時黑火藥會受潮，自製槍彈可能啞火；手槍是現代密封子彈，不受影響
import * as THREE from 'three';
import { G } from './state.js';
import { world, SITES } from './world.js';
import { audio } from './audio.js';
import { quality } from './settings.js';
import { rnd, lerp, clamp, dist2 } from './util.js';
import { dampMul, misfireMul } from './akai.js';

export const WEATHERS = {
  clear: { n: '晴', i: '☀️' },
  cloudy: { n: '陰', i: '☁️' },
  rain: { n: '雨', i: '🌧️' },
  fog: { n: '霧', i: '🌫️' },
};
const W = { kind: 'clear', t: 300 }; // 開局頭五分鐘固定晴天
G.weather = W; G.weatherF = 0; G.fogF = 0;

let drops = null, dropN = 0, dropPos = null, wetT = 0, warnT = -99;
const BOX = 22, H = 16;

function buildRain() {
  dropN = quality().rain;
  if (drops) { G.scene.remove(drops); drops.geometry.dispose(); }
  dropPos = new Float32Array(dropN * 6);
  const c = G.camera.position;
  for (let i = 0; i < dropN; i++) setDrop(i, c.x + rnd(-BOX, BOX), c.y + rnd(-4, H), c.z + rnd(-BOX, BOX));
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(dropPos, 3));
  drops = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xb8c8d8, transparent: true, opacity: 0, depthWrite: false }));
  drops.frustumCulled = false; drops.visible = false; G.scene.add(drops);
}
function setDrop(i, x, y, z) { const k = i * 6; dropPos[k] = x; dropPos[k + 1] = y; dropPos[k + 2] = z; dropPos[k + 3] = x + 0.08; dropPos[k + 4] = y + 0.7; dropPos[k + 5] = z + 0.05; }
export function rebuildRain() { if (drops) buildRain(); }

function pickNext() {
  const r = Math.random(), dawn = G.time > 240 && G.time < 480;
  if (dawn && r < 0.3) return 'fog';
  return r < 0.45 ? 'clear' : r < 0.65 ? 'cloudy' : r < 0.88 ? 'rain' : 'fog';
}
function announce(prev, k) {
  if (k === 'rain') G.ui.msg(G.flags.rainTold ? '🌧️ 下雨了，小心火藥受潮。' : '🌧️ 下雨了！自製的黑火藥彈藥會受潮啞火——躲進營地或營火旁。手槍是現代密封子彈，不受影響。', 'warn');
  else if (k === 'fog') G.ui.msg('🌫️ 起霧了，視線變差，敵人也比較難發現你。', 'info');
  else if (prev === 'rain') G.ui.msg('雨停了。到營火旁可以烘乾受潮的火藥。', 'info');
  if (k === 'rain') G.flags.rainTold = true;
}

// 躲雨處：友軍營地內或營火旁
export function nearFire(p, r = 7) { return world.fires.some(f => dist2(f.flame.position.x, f.flame.position.z, p.x, p.z) < r); }
export function sheltered(p) {
  for (const id of ['camp', 'coalition']) { const s = SITES[id]; if (dist2(p.x, p.z, s.x, s.z) < s.r) return true; }
  if (G.ws && G.ws.built && dist2(p.x, p.z, SITES.workshop.x, SITES.workshop.z) < 9) return true; // 工坊棚下
  for (const k in SITES) { const s = SITES[k]; if (s.outpost && G.stage >= s.stage && dist2(p.x, p.z, s.x, s.z) < s.r) return true; } // 前哨營帳下
  return nearFire(p);
}
export const raining = () => W.kind === 'rain' && G.weatherF > 0.5;

export function updateWeather(dt) {
  const P = G.player, cam = G.camera.position;
  if (!drops) buildRain();
  W.t -= dt;
  if (W.t <= 0) { const prev = W.kind; W.kind = pickNext(); W.t = rnd(150, 300); if (W.kind !== prev) announce(prev, W.kind); }
  const wetGoal = W.kind === 'rain' ? 1 : W.kind === 'cloudy' ? 0.4 : 0;
  G.weatherF += clamp(wetGoal - G.weatherF, -dt * 0.12, dt * 0.12);
  G.fogF += clamp((W.kind === 'fog' ? 1 : 0) - G.fogF, -dt * 0.1, dt * 0.1);

  // 雨滴
  const rainK = W.kind === 'rain' || G.weatherF > 0.6 ? clamp((G.weatherF - 0.4) / 0.6, 0, 1) : 0;
  drops.visible = rainK > 0.02;
  if (drops.visible) {
    drops.material.opacity = 0.5 * rainK;
    const n = Math.floor(dropN * rainK), fall = 26 * dt;
    for (let i = 0; i < dropN; i++) {
      const k = i * 6;
      if (i >= n) { dropPos[k + 1] = dropPos[k + 4] = -1e4; continue; }
      let x = dropPos[k], y = dropPos[k + 1] - fall, z = dropPos[k + 2];
      if (y < cam.y - 4 || y < -50) { y = cam.y + H * (0.6 + Math.random() * 0.4); x = cam.x + rnd(-BOX, BOX); z = cam.z + rnd(-BOX, BOX); }
      if (x - cam.x > BOX) x -= BOX * 2; else if (cam.x - x > BOX) x += BOX * 2;
      if (z - cam.z > BOX) z -= BOX * 2; else if (cam.z - z > BOX) z += BOX * 2;
      setDrop(i, x, y, z);
    }
    drops.geometry.attributes.position.needsUpdate = true;
  }
  audio.rain(rainK);

  // 火藥受潮
  if (!P.alive) return;
  const exposed = raining() && !sheltered(P.pos), cloth = P.count('oilcloth') > 0;
  if (exposed) P.damp = Math.min(100, P.damp + dt * (cloth ? 0.7 : 2.2) * dampMul());
  else P.damp = Math.max(0, P.damp - dt * (nearFire(P.pos) ? 6 : 1.2));
  if (exposed && !cloth && P.damp >= 60 && P.count('powder') > 0) {
    wetT += dt;
    if (wetT > 8) {
      wetT = 0; P.take('powder'); P.give('wetPowder');
      if (G.now - warnT > 20) { warnT = G.now; G.ui.msg('背包裡的黑火藥受潮了！到營火旁可以烘乾（製作頁）。油布包能防潮。', 'warn'); }
    }
  } else wetT = 0;
}

// 自製黑火藥彈藥啞火機率（手槍不受影響）
export const misfireChance = () => (G.player.damp / 100) * 0.55 * misfireMul();
export const dudChance = () => (G.player.damp / 100) * 0.6;
export const weatherIcon = () => WEATHERS[W.kind].i;
export const weatherName = () => WEATHERS[W.kind].n;
export function clearWeather() { W.kind = 'clear'; W.t = rnd(150, 300); }
