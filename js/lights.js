// 火光：篝火與火把共用一組點光源（只點亮離玩家最近的幾個，手機也有），每個火源另有便宜的光暈與地面暖光
// 另含玩家的戰術手電筒（掛在鏡頭上的聚光燈）
import * as THREE from 'three';
import { G } from './state.js';

const emitters = new Set();
const pool = [];
let assignT = 0, glowTex = null, groundTex = null, flash = null;
const V = new THREE.Vector3();

// 夜晚程度：0＝白天、1＝深夜（下雨天也暗一些）
export const nightK = () => { const w = G.world; if (!w) return 0; return Math.min(1, (1 - (w.dayF ?? 1)) + (G.weatherF || 0) * 0.25); };

function radial(stops, size = 128) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const glowT = () => glowTex || (glowTex = radial([[0, 'rgba(255,220,150,1)'], [0.25, 'rgba(255,160,60,.55)'], [0.6, 'rgba(255,110,30,.14)'], [1, 'rgba(255,90,20,0)']]));
const groundT = () => groundTex || (groundTex = radial([[0, 'rgba(255,170,80,1)'], [0.45, 'rgba(255,120,40,.45)'], [1, 'rgba(255,90,20,0)']], 64));

// 光暈：疊加發光的 sprite
export function makeGlow(size) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowT(), color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0 }));
  s.scale.set(size, size, 1); s.renderOrder = 3; return s;
}
// 地面暖光：貼在地上的放射狀光圈
function makeGround(x, y, z, r) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), new THREE.MeshBasicMaterial({ map: groundT(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0, polygonOffset: true, polygonOffsetFactor: -4 }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, y + 0.06, z); m.renderOrder = 1; return m;
}

export function initLights(scene) {
  const n = G.touch ? 3 : 6; // 光源數固定，避免材質因光源數變動而重新編譯
  for (let i = 0; i < n; i++) { const l = new THREE.PointLight(0xff8a3a, 0, 30, 1.6); l.position.set(0, -500, 0); scene.add(l); pool.push({ l, e: null }); }
}
// 註冊光源：pos() 回傳世界座標；on() 決定是否發光
export function addEmitter(e) { emitters.add(e); return e; }
export function removeEmitter(e) { emitters.delete(e); for (const s of pool) if (s.e === e) s.e = null; }

// 篝火：點光源候選＋光暈＋地面暖光
export function addFire(scene, x, y, z, big) {
  const glow = makeGlow(big ? 4.2 : 3.2); glow.position.set(x, y + 1.0, z); scene.add(glow);
  const ground = makeGround(x, y, z, big ? 9 : 7); scene.add(ground);
  const p = new THREE.Vector3(x, y + 1.6, z), ph = x * 0.37 + z;
  return addEmitter({ fire: true, glow, ground, ph, base: big ? 95 : 65, range: big ? 34 : 26, color: 0xff8a3a, pos: () => p, on: () => true });
}

// 火把（小兵晚上拿在手上）
export function makeTorch() {
  const g = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.75, 5), new THREE.MeshLambertMaterial({ color: 0x5a3a1c }));
  handle.position.y = 0.2; g.add(handle);
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.045, 0.16, 6), new THREE.MeshLambertMaterial({ color: 0x2a1a10 }));
  head.position.y = 0.6; g.add(head);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.34, 6), new THREE.MeshBasicMaterial({ color: 0xffa030, transparent: true, opacity: 0.92, fog: false }));
  flame.position.y = 0.82; g.add(flame);
  const glow = makeGlow(1.5); glow.position.y = 0.85; g.add(glow);
  g.userData = { flame, glow }; return g;
}

export function updateLights(dt) {
  const cam = G.camera.position, nk = nightK(), t = G.now;
  // 每 0.25 秒把點光源分配給最近的火源（已分配且仍在名單內的保持不動，避免閃爍）
  assignT -= dt;
  if (assignT <= 0) {
    assignT = 0.25;
    const list = [];
    for (const e of emitters) { if (e.gone && e.gone()) { removeEmitter(e); continue; } if (!e.on()) continue; const p = e.pos(), d = (p.x - cam.x) ** 2 + (p.z - cam.z) ** 2; if (d < 90 * 90) list.push([e, d * (e.fire ? 0.6 : 1)]); }
    list.sort((a, b) => a[1] - b[1]);
    const want = new Set(list.slice(0, pool.length).map(x => x[0]));
    for (const s of pool) if (s.e && !want.has(s.e)) s.e = null;
    const used = new Set(pool.map(s => s.e).filter(Boolean));
    for (const e of want) if (!used.has(e)) { const s = pool.find(s => !s.e); if (s) { s.e = e; s.l.color.set(e.color); s.l.distance = e.range; } }
  }
  const k = 0.45 + 0.55 * nk; // 白天火光淡一些
  for (const s of pool) {
    const e = s.e;
    if (!e || !e.on()) { s.l.intensity = 0; continue; }
    s.l.position.copy(e.pos());
    s.l.intensity = e.base * k * (0.85 + 0.2 * Math.sin(t * 11 + e.ph) * Math.sin(t * 7.3 + e.ph));
  }
  // 篝火光暈與地面暖光：夜裡更亮，輕微閃動
  for (const e of emitters) {
    if (!e.fire) continue;
    const f = 0.9 + 0.1 * Math.sin(t * 9 + e.ph);
    e.glow.material.opacity = (0.22 + 0.6 * nk) * f;
    e.ground.material.opacity = (0.04 + 0.5 * nk) * f;
  }
  // 手電筒
  if (flash) { const want = G.player && G.player.flash && G.player.alive ? 1 : 0; flash.k += (want - flash.k) * Math.min(1, dt * 14); flash.l.intensity = flash.k * (90 + 160 * nk); }
}

// ---------- 戰術手電筒 ----------
export function initFlashlight(camera) {
  const l = new THREE.SpotLight(0xfff2dc, 0, 70, 0.36, 0.5, 1.15);
  l.position.set(0.08, -0.12, -1.4); const tg = new THREE.Object3D(); tg.position.set(0.04, -0.3, -12); // 燈放在槍口前方，才不會把手上的槍照成一片白
  camera.add(l); camera.add(tg); l.target = tg;
  flash = { l, k: 0 };
}
