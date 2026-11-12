import * as THREE from 'three';
import { G } from './state.js';
import { mulberry32, clamp, lerp, smoothstep, fbm, bx, cyl, cone, ball, rock, meshOf, MAT, flagTexture, Grid, dist2, angDiff } from './util.js';
import { addFire } from './lights.js';

export const HALF = 500, SEG = 200, CELL = 5, WATER = 0;
const N1 = SEG + 1;
const PI = Math.PI;

export const SITES = {
  spawn: { x: 0, z: 0, r: 12, name: '穿越之地' },
  camp: { x: 50, z: 80, r: 36, name: '劉備軍營' },
  turban: { x: -230, z: 150, r: 40, name: '黃巾營寨' },
  coalition: { x: 230, z: -90, r: 28, name: '聯軍大營' },
  sishui: { x: 300, z: -230, r: 36, name: '汜水關' },
  hulao: { x: -180, z: -300, r: 40, name: '虎牢關' },
  meiwu: { x: 340, z: 290, r: 46, name: '郿塢' },
  workshop: { x: 40, z: 31, r: 13, name: '軍火工坊' },
  // ---- 新章節 ----
  baima: { x: -330, z: -80, r: 34, name: '白馬' },
  yanjin: { x: -300, z: 60, r: 34, name: '延津' },
  wuchao: { x: -40, z: 330, r: 40, name: '烏巢' },
  changban: { x: riverX(-330), z: -330, r: 42, name: '長坂橋', noFlat: true },
  chibi: { x: 252, z: 238, r: 30, name: '赤壁' },
  blackmarket: { x: -90, z: -70, r: 10, name: '黑市' },
};
export const HOSTILE_SITES = ['turban', 'sishui', 'hulao', 'meiwu', 'baima', 'yanjin', 'wuchao', 'changban', 'chibi'];
// ---- 前哨營：每個頭目據點前方的友軍營區（存檔、重生、營火、水井），隨主線推進才出現 ----
const OUTPOST_FOR = [['turban', '黃巾', 1], ['sishui', '汜水', 2], ['hulao', '虎牢', 3], ['meiwu', '郿塢', 4, -Math.PI / 2], ['baima', '白馬', 5], ['wuchao', '烏巢', 6], ['changban', '長坂', 7, Math.PI * 0.25], ['chibi', '赤壁', 8]];
for (const [id, nm, stage, ang] of OUTPOST_FOR) {
  const s = SITES[id], a0 = ang ?? Math.atan2(SITES.camp.z - s.z, SITES.camp.x - s.x);
  let pick = null;
  search: for (const dd of [40, 50, 62, 76, 90]) for (const da of [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.4, -1.4, 1.8, -1.8]) {
    const a = a0 + da, x = s.x + Math.cos(a) * (s.r + dd), z = s.z + Math.sin(a) * (s.r + dd), h = baseHeight(x, z);
    if (h < 1.5 || h > 22 || Math.abs(x - riverX(z)) < 36 || Math.max(Math.abs(x), Math.abs(z)) > 395) continue;
    for (const k in SITES) { const o = SITES[k]; if (dist2(x, z, o.x, o.z) < o.r + 40) continue search; }
    pick = [x, z]; break;
  }
  if (pick) SITES['op_' + id] = { x: pick[0], z: pick[1], r: 11, name: nm + '前哨', outpost: true, stage };
}
// 地圖上只顯示已解鎖的前哨營
export const siteVisible = id => !SITES[id].outpost || G.stage >= SITES[id].stage;
export const outposts = () => Object.keys(SITES).filter(k => SITES[k].outpost);

export function riverX(z) { return 150 + 45 * Math.sin(z / 110) + 20 * Math.sin(z / 37); }
function baseHeight(x, z) {
  let h = 2 + (fbm(x / 170 + 7.3, z / 170 + 3.1, 4) - 0.36) * 30;
  h += (fbm(x / 40 + 20, z / 40 + 9, 2) - 0.5) * 3;
  const d = Math.max(Math.abs(x), Math.abs(z));
  if (d > 410) { const t = (d - 410) / 90; h += t * t * 70; }
  const dr = Math.abs(x - riverX(z));
  if (dr < 26) h = lerp(h, -1.7, smoothstep(26, 7, dr));
  return h;
}
function siteHeight(x, z) {
  let h = baseHeight(x, z);
  for (const k in SITES) {
    const s = SITES[k], d = dist2(x, z, s.x, s.z);
    if (s.noFlat) continue;
    if (d < s.r + 30) h = lerp(h, s.y, 1 - smoothstep(s.r, s.r + 30, d));
  }
  return h;
}

// 線段是否穿過矩形（外擴 pad）
function segBox(ax, az, bx_, bz, e, pad) {
  let t0 = 0, t1 = 1; const dx = bx_ - ax, dz = bz - az;
  for (const [p, d, lo, hi] of [[ax, dx, e.x0 - pad, e.x1 + pad], [az, dz, e.z0 - pad, e.z1 + pad]]) {
    if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) return false; continue; }
    let a = (lo - p) / d, b = (hi - p) / d; if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) return false;
  }
  return true;
}
const heights = new Float32Array(N1 * N1);
export function heightAt(x, z) {
  const fx = clamp((x + HALF) / CELL, 0, SEG - 0.001), fz = clamp((z + HALF) / CELL, 0, SEG - 0.001);
  const ix = Math.floor(fx), iz = Math.floor(fz), u = fx - ix, v = fz - iz;
  const i = iz * N1 + ix;
  let h = lerp(lerp(heights[i], heights[i + 1], u), lerp(heights[i + N1], heights[i + N1 + 1], u), v);
  for (const b of bridges) if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1 && h < b.y) h = b.y; // 橋面可行走
  return h;
}
const bridges = [];
export function inSite(x, z, pad = 0) {
  for (const k in SITES) { const s = SITES[k]; if (dist2(x, z, s.x, s.z) < s.r + pad) return s; }
  return null;
}

export const world = {
  colliders: new Grid(8),
  nodes: new Grid(8),      // 可互動資源點
  nodeList: [],
  fires: [], flags: [], enclosures: [], targets: [], burning: [],
  beds: [], spots: {},     // 各據點內的重要位置
  heightAt, inSite,
  isNight: false, dayF: 1,

  addCircle(x, z, r, h = 8) { this.colliders.add({ x, z, r, y: heightAt(x, z), h }, x, z); },
  addBox(x0, z0, x1, z1, h = 10) {
    this.colliders.addBox({ x0, z0, x1, z1, y: heightAt((x0 + x1) / 2, (z0 + z1) / 2), h }, x0, z0, x1, z1);
  },
  // 將圓形物體推出碰撞體
  resolve(pos, rad) {
    this.colliders.query(pos.x, pos.z, rad + 3.5, c => {
      if (c.r !== undefined) {
        const dx = pos.x - c.x, dz = pos.z - c.z, R = c.r + rad, d2 = dx * dx + dz * dz;
        if (d2 < R * R && d2 > 1e-6 && pos.y < c.y + c.h) { const d = Math.sqrt(d2); pos.x = c.x + dx / d * R; pos.z = c.z + dz / d * R; }
      } else if (pos.x > c.x0 - rad && pos.x < c.x1 + rad && pos.z > c.z0 - rad && pos.z < c.z1 + rad && pos.y < c.y + c.h) {
        const a = pos.x - (c.x0 - rad), b = (c.x1 + rad) - pos.x, e = pos.z - (c.z0 - rad), f = (c.z1 + rad) - pos.z;
        const m = Math.min(a, b, e, f);
        if (m === a) pos.x = c.x0 - rad; else if (m === b) pos.x = c.x1 + rad; else if (m === e) pos.z = c.z0 - rad; else pos.z = c.z1 + rad;
      }
    });
  },
  // 射線被地形或障礙物擋住的距離
  rayBlock(o, d, max) {
    let hit = false;
    for (let t = 0.6; t < max; t += (t < 60 ? 1.0 : 2.5)) {
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
      if (y < heightAt(x, z)) return t;
      if (y > 60) return max;
      this.colliders.query(x, z, 0.01, c => {
        if (y > c.y + c.h) return;
        if (c.r !== undefined) { if ((x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r) hit = true; }
        else if (x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1) hit = true;
      });
      if (hit) return t;
    }
    return max;
  },
  // 簡易尋路：需要穿過柵欄、城牆時，回傳應先前往的門口路點
  route(fx, fz, tx, tz, out) {
    out[0] = tx; out[1] = tz;
    for (const e of this.enclosures) {
      if (e.type === 'ring') {
        const df = dist2(fx, fz, e.x, e.z), dt = dist2(tx, tz, e.x, e.z);
        if (df > e.R + 80) continue;
        const inF = df < e.R, inT = dt < e.R, af = Math.atan2(fz - e.z, fx - e.x);
        let r = 0, a = e.ga;
        if (inF !== inT) {
          const d = angDiff(af, e.ga);
          if (inF) r = Math.abs(d) < 0.1 ? e.R + 5 : e.R - 4;
          else if (Math.abs(d) < 0.1) r = e.R - 5;
          else if (Math.abs(d) < 0.55) r = e.R + 5;
          else { r = e.R + 6; a = af + Math.sign(d) * 0.5; }
        } else if (!inF) { // 兩端都在外側：直線是否穿過營寨
          const lx = tx - fx, lz = tz - fz, l2 = lx * lx + lz * lz || 1, t = clamp(((e.x - fx) * lx + (e.z - fz) * lz) / l2, 0, 1);
          if (dist2(fx + lx * t, fz + lz * t, e.x, e.z) < e.R + 1.2) { r = e.R + 6; a = af + (angDiff(af, Math.atan2(tz - e.z, tx - e.x)) < 0 ? -0.5 : 0.5); }
        }
        if (r) { out[0] = e.x + Math.cos(a) * r; out[1] = e.z + Math.sin(a) * r; return out; }
      } else if (e.type === 'wall') {
        const sf = fz - e.z, st = tz - e.z; if (sf * st >= 0) continue;
        const xi = fx + (tx - fx) * (sf / (sf - st)); if (xi < e.x0 - 1 || xi > e.x1 + 1) continue;
        if (Math.abs(xi - e.gx) < e.gw / 2 - 1.3 && Math.abs(fx - e.gx) < e.gw / 2 - 1.3) continue;
        const side = Math.sign(sf);
        out[0] = e.gx; out[1] = e.z + (Math.abs(fx - e.gx) > 1.5 ? side : -side) * (e.T / 2 + 3.5); return out;
      } else {
        const inF = fx > e.x0 && fx < e.x1 && fz > e.z0 && fz < e.z1, inT = tx > e.x0 && tx < e.x1 && tz > e.z0 && tz < e.z1;
        if (inF === inT) {
          if (inF || !segBox(fx, fz, tx, tz, e, 1.2)) continue;
          let best = 1e9; // 兩端都在牆外且被擋住：繞過最近的牆角
          for (const cx of [e.x0 - 7, e.x1 + 7]) for (const cz of [e.z0 - 7, e.z1 + 7]) {
            if (segBox(fx, fz, cx, cz, e, 1)) continue;
            const c = dist2(fx, fz, cx, cz) + dist2(cx, cz, tx, tz) + (segBox(cx, cz, tx, tz, e, 1) ? 80 : 0);
            if (c < best && dist2(fx, fz, cx, cz) > 2) { best = c; out[0] = cx; out[1] = cz; }
          }
          return out;
        }
        const al = Math.abs(fx - e.gx) < 1.5;
        if (inF) { out[0] = e.gx; out[1] = al ? e.z0 - 6 : e.z0 + 6; }
        else if (fz < e.z0 - 2.5) { out[0] = e.gx; out[1] = al ? e.z0 + 6 : e.z0 - 6; }
        else { out[0] = fx < (e.x0 + e.x1) / 2 ? e.x0 - 7 : e.x1 + 7; out[1] = fx > e.x0 - 5 && fx < e.x1 + 5 ? fz : e.z0 - 7; }
        return out;
      }
    }
    return out;
  },
  addNode(n) { this.nodes.add(n, n.x, n.z); this.nodeList.push(n); return n; },
};

// ================= 建造 =================
export function buildWorld(scene) {
  for (const k in SITES) { const s = SITES[k]; s.y = Math.max(baseHeight(s.x, s.z), 3); s.id = k; }
  for (let iz = 0; iz < N1; iz++) for (let ix = 0; ix < N1; ix++)
    heights[iz * N1 + ix] = siteHeight(-HALF + ix * CELL, -HALF + iz * CELL);

  // ---- 地形 ----
  const geo = new THREE.PlaneGeometry(HALF * 2, HALF * 2, SEG, SEG); geo.rotateX(-PI / 2);
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
  const c = new THREE.Color(), c2 = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const ix = i % N1, iz = Math.floor(i / N1), h = heights[i];
    pos.setY(i, h);
    const x = -HALF + ix * CELL, z = -HALF + iz * CELL;
    const hx = heights[iz * N1 + Math.min(SEG, ix + 1)] - heights[iz * N1 + Math.max(0, ix - 1)];
    const hz = heights[Math.min(SEG, iz + 1) * N1 + ix] - heights[Math.max(0, iz - 1) * N1 + ix];
    const slope = Math.hypot(hx, hz) / (2 * CELL);
    const n = fbm(x / 23, z / 23, 3);
    c.set(0x4c7a33).lerp(c2.set(0x7d9442), n);
    if (fbm(x / 60 + 5, z / 60, 2) > 0.62) c.lerp(c2.set(0x9a9050), 0.5);
    if (h < 0.7) c.lerp(c2.set(0xb8a878), smoothstep(0.7, 0.2, h));
    if (h < -0.3) c.lerp(c2.set(0x5a6048), 0.7);
    if (slope > 0.45) c.lerp(c2.set(0x77736a), smoothstep(0.45, 0.8, slope));
    if (h > 24) c.lerp(c2.set(0x8a867e), smoothstep(24, 40, h));
    if (h > 55) c.lerp(c2.set(0xe8e8ee), smoothstep(55, 75, h));
    const s = inSite(x, z, 4);
    if (s) c.lerp(c2.set(0x8a7350), 0.75 * (1 - smoothstep(s.r - 6, s.r + 4, dist2(x, z, s.x, s.z))));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const terrain = new THREE.Mesh(geo, MAT); terrain.receiveShadow = true; scene.add(terrain);

  const water = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, HALF * 2).rotateX(-PI / 2),
    new THREE.MeshLambertMaterial({ color: 0x3f7f9f, transparent: true, opacity: 0.78 }));
  water.position.y = WATER; scene.add(water);

  buildSky(scene);
  buildVegetation(scene);
  buildSites(scene);
  buildNodes(scene);
}

// ---- 天空與光照 ----
let sky, skyMat, sun, hemi, sunDisc, moonDisc, stars;
function buildSky(scene) {
  skyMat = new THREE.ShaderMaterial({
    uniforms: { top: { value: new THREE.Color() }, bot: { value: new THREE.Color() } },
    vertexShader: 'varying vec3 vp;void main(){vp=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'uniform vec3 top;uniform vec3 bot;varying vec3 vp;void main(){float h=normalize(vp).y;gl_FragColor=vec4(mix(bot,top,pow(max(h,0.),.55)),1.);\n#include <colorspace_fragment>\n}',
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 24, 12), skyMat); sky.frustumCulled = false; scene.add(sky);
  hemi = new THREE.HemisphereLight(0xcfe4ff, 0x4a4030, 1); scene.add(hemi);
  sun = new THREE.DirectionalLight(0xfff0d8, 2); scene.add(sun); scene.add(sun.target);
  { const sc = sun.shadow.camera; sc.left = -55; sc.right = 55; sc.top = 55; sc.bottom = -55; sc.near = 10; sc.far = 320; }
  sun.shadow.bias = -0.0015; sun.shadow.normalBias = 0.05;
  const disc = (color, size) => { const m = new THREE.Mesh(new THREE.CircleGeometry(size, 20), new THREE.MeshBasicMaterial({ color, fog: false, depthWrite: false })); scene.add(m); return m; };
  sunDisc = disc(0xfff2c0, 38); moonDisc = disc(0xe4ecff, 26);
  const sp = new Float32Array(900 * 3), r = mulberry32(99);
  for (let i = 0; i < 900; i++) {
    const a = r() * PI * 2, e = Math.asin(r() * 0.98 + 0.02);
    sp[i * 3] = Math.cos(a) * Math.cos(e) * 950; sp[i * 3 + 1] = Math.sin(e) * 950; sp[i * 3 + 2] = Math.sin(a) * Math.cos(e) * 950;
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, fog: false, depthWrite: false }));
  stars.frustumCulled = false; scene.add(stars);
  scene.fog = new THREE.Fog(0xbfd8ee, 90, 560);
}
const C = (h) => new THREE.Color(h);
const cTopD = C(0x3878d0), cTopN = C(0x04060e), cBotD = C(0xc4dcf0), cBotN = C(0x0c1424), cDusk = C(0xf08a48), cTmp = C(0);
const sunDir = new THREE.Vector3();
// 畫質設定：開關太陽陰影（size = 0 代表關閉）
export function setShadows(size) {
  const on = size > 0;
  if (sun.castShadow === on && (!on || sun.shadow.mapSize.x === size)) return;
  sun.castShadow = on;
  if (on) { sun.shadow.mapSize.set(size, size); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  G.renderer.shadowMap.enabled = on;
  G.scene.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.needsUpdate = true); });
}
const cRain = new THREE.Color(0x7a8490), cRainN = new THREE.Color(0x10141a);
export function updateSky(dt, camPos) {
  const a = (G.time / 1440 - 0.25) * PI * 2, sh = Math.sin(a);
  sunDir.set(Math.cos(a), sh, 0.4).normalize();
  const dayF = smoothstep(-0.12, 0.22, sh), dusk = clamp(1 - Math.abs(sh) / 0.32, 0, 1) * 0.75;
  world.dayF = dayF; world.isNight = G.time < 300 || G.time > 1170;
  skyMat.uniforms.top.value.copy(cTopN).lerp(cTopD, dayF);
  const bot = skyMat.uniforms.bot.value.copy(cBotN).lerp(cBotD, dayF).lerp(cDusk, dusk * smoothstep(-0.3, 0, sh));
  // 天氣：陰雨讓天空變灰、霧氣變濃
  const wet = G.weatherF || 0, fogW = G.fogF || 0;
  if (wet > 0) { const c = cTmp.copy(cRainN).lerp(cRain, dayF); bot.lerp(c, wet * 0.8); skyMat.uniforms.top.value.lerp(c, wet * 0.75); }
  G.scene.fog.color.copy(bot);
  const fs = G.fogScale || 1, thick = 1 - Math.max(wet * 0.45, fogW * 0.78);
  G.scene.fog.near = lerp(45, 90, dayF) * thick; G.scene.fog.far = lerp(300, 560, dayF) * fs * thick;
  sky.position.copy(camPos); stars.position.copy(camPos);
  stars.material.opacity = (1 - dayF) * (1 - wet) * (1 - fogW);
  hemi.intensity = lerp(0.42, 1.15, dayF) * (1 - wet * 0.3);
  hemi.color.copy(cTmp.set(0x6078b0)).lerp(cBotD, dayF);
  if (sh > -0.08) { sun.color.set(0xfff0d8).lerp(cDusk, dusk); sun.intensity = 2.4 * smoothstep(-0.08, 0.2, sh) * (1 - wet * 0.65); sun.position.copy(camPos).addScaledVector(sunDir, 160); }
  else { sun.color.set(0x8aa4e0); sun.intensity = 0.5; sun.position.copy(camPos).addScaledVector(sunDir, -160); }
  sun.target.position.copy(camPos);
  sunDisc.position.copy(camPos).addScaledVector(sunDir, 900); sunDisc.lookAt(camPos); sunDisc.visible = moonDisc.visible = wet < 0.5 && fogW < 0.6;
  moonDisc.position.copy(camPos).addScaledVector(sunDir, -900); moonDisc.lookAt(camPos);
  const t = G.now;
  for (const f of world.fires) f.flame.scale.y = 1 + 0.25 * Math.sin(t * 13 + f.ph);
  for (const f of world.flags) f.rotation.y = f.userData.ry + Math.sin(t * 1.6 + f.userData.ph) * 0.25;
  if (world.portal) { world.portal.rotation.z += dt * 0.8; world.portal.material.opacity = 0.55 + 0.25 * Math.sin(t * 3); }
  for (const b of world.burning) { b.t -= dt; for (const f of b.fl) f.scale.y = (0.8 + 0.4 * Math.sin(t * 11 + f.userData.ph)) * Math.min(1, b.t / 4); if (b.t <= 0) { G.scene.remove(b.grp); } }
  world.burning = world.burning.filter(b => b.t > 0);
}

// ---- 植被 ----
function buildVegetation(scene) {
  const r = mulberry32(2024);
  const trunks = [], cones = [], balls = [], rocks = [];
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), E = new THREE.Euler();
  const push = (arr, x, y, z, sx, sy, sz, color, ry = 0) => { Q.setFromEuler(E.set(0, ry, 0)); arr.push({ m: M.compose(P.set(x, y, z), Q, S.set(sx, sy, sz)).clone(), c: color }); };
  const ok = (x, z, pad = 8) => { const h = heightAt(x, z); return h > 0.8 && h < 30 && !inSite(x, z, pad) && Math.abs(x) < 470 && Math.abs(z) < 470; };
  let tries = 0, count = 0;
  while (count < 1000 && tries++ < 20000) {
    const x = (r() - 0.5) * 940, z = (r() - 0.5) * 940;
    if (!ok(x, z)) continue;
    const dens = fbm(x / 95 + 50, z / 95 + 50, 3);
    if (dens < 0.5 && r() > 0.1) continue;
    const y = heightAt(x, z), s = 0.8 + r() * 0.8, pine = y > 9 || r() < 0.35;
    push(trunks, x, y + 1.6 * s, z, s, s, s, 0x5a4028);
    if (pine) { push(cones, x, y + 5.2 * s, z, s, s, s, r() < 0.5 ? 0x2a5a30 : 0x346a34, r() * 6); }
    else { push(balls, x, y + 4.6 * s, z, s * (0.9 + r() * 0.3), s * 0.85, s, r() < 0.5 ? 0x3f7a2e : 0x55882e, r() * 6); }
    world.addCircle(x, z, 0.45 * s, 7);
    world.addNode({ kind: 'tree', x, z, stock: 3, last: 0 });
    count++;
  }
  // 竹林
  for (let i = 0; i < 26; i++) {
    const x = (r() - 0.5) * 800, z = (r() - 0.5) * 800;
    if (!ok(x, z, 14)) continue;
    for (let j = 0; j < 16; j++) {
      const bx_ = x + (r() - 0.5) * 9, bz = z + (r() - 0.5) * 9, y = heightAt(bx_, bz), s = 0.8 + r() * 0.5;
      push(trunks, bx_, y + 3.2 * s, bz, 0.32, 2 * s, 0.32, 0x7aa040);
      push(cones, bx_, y + 6.6 * s, bz, 0.4, 0.4, 0.4, 0x8ab84a, r() * 6);
    }
    world.addNode({ kind: 'tree', bamboo: true, x, z, stock: 3, last: 0 });
  }
  // 岩石
  for (let i = 0; i < 260; i++) {
    const x = (r() - 0.5) * 940, z = (r() - 0.5) * 940;
    if (!ok(x, z, 4)) continue;
    const s = 0.4 + r() * r() * 2.6;
    push(rocks, x, heightAt(x, z) + s * 0.3, z, s, s * 0.7, s * (0.7 + r() * 0.6), r() < 0.5 ? 0x7a766e : 0x8a8478, r() * 6);
    if (s > 0.9) world.addCircle(x, z, s * 0.85, s);
  }
  const inst = (geo, arr, shadow) => {
    const m = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial(), arr.length);
    const cc = new THREE.Color();
    arr.forEach((o, i) => { m.setMatrixAt(i, o.m); m.setColorAt(i, cc.set(o.c)); });
    m.castShadow = shadow; m.receiveShadow = false; m.frustumCulled = false; scene.add(m);
  };
  inst(new THREE.CylinderGeometry(0.2, 0.32, 3.2, 6), trunks, true);
  inst(new THREE.ConeGeometry(2.0, 5.6, 7), cones, true);
  inst(new THREE.IcosahedronGeometry(2.4, 1), balls, true);
  inst(new THREE.DodecahedronGeometry(1, 0), rocks, false);
}

// ---- 資源點 ----
const ORE = { iron: [0x6a4a3a, 0xa8562a, '鐵礦'], saltpeter: [0xe8e8e0, 0xffffff, '硝石'], sulfur: [0xd8c020, 0xf0e050, '硫磺'] };
function buildNodes(scene) {
  const r = mulberry32(777);
  const mk = (kind, item, x, z) => {
    const y = heightAt(x, z); let mesh;
    if (kind === 'ore') {
      const [c1, c2] = ORE[item];
      mesh = meshOf([rock(0.7, c1, 0, 0.35, 0), rock(0.45, c2, 0.55, 0.25, 0.2), rock(0.4, c2, -0.4, 0.2, 0.45), rock(0.3, c1, 0.1, 0.75, -0.1)], true);
    } else if (kind === 'bush') {
      const p = [ball(0.75, 0x3a6a2a, 0, 0.5, 0), ball(0.55, 0x44762e, 0.5, 0.4, 0.2)];
      for (let i = 0; i < 7; i++) p.push(ball(0.08, 0xc8202a, (r() - 0.5) * 1.3, 0.4 + r() * 0.7, (r() - 0.5) * 1.3));
      mesh = meshOf(p);
    } else {
      const p = [];
      for (let i = 0; i < 5; i++) { const a = i * 1.26; p.push(bx(0.05, 0.5, 0.16, 0x4a8a3a, Math.cos(a) * 0.14, 0.25, Math.sin(a) * 0.14, 0.3, a)); }
      p.push(ball(0.1, 0xb060d0, 0, 0.58, 0)); p.push(ball(0.07, 0xd080e0, 0.15, 0.48, 0.1));
      mesh = meshOf(p);
    }
    mesh.position.set(x, y, z); mesh.rotation.y = r() * 6; scene.add(mesh);
    world.addNode({ kind, item, x, z, mesh, stock: kind === 'ore' ? 4 : 1, max: kind === 'ore' ? 4 : 1, respawn: 0 });
    if (kind === 'ore') world.addCircle(x, z, 0.7, 1);
  };
  const scatter = (kind, item, n, cx = 0, cz = 0, rad = 460, minR = 0) => {
    let t = 0, k = 0;
    while (k < n && t++ < n * 40) {
      const a = r() * PI * 2, d = minR + r() * (rad - minR), x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      const h = heightAt(x, z);
      if (h < 0.9 || h > 28 || inSite(x, z, 3) || Math.abs(x) > 465 || Math.abs(z) > 465) continue;
      mk(kind, item, x, z); k++;
    }
  };
  // 出生點附近保證有基本資源
  for (const it of ['iron', 'saltpeter', 'sulfur']) { scatter('ore', it, 3, 20, 30, 70, 22); scatter('ore', it, 30); }
  scatter('bush', 'berry', 6, 20, 30, 60, 15); scatter('bush', 'berry', 60);
  scatter('herb', 'herb', 5, 20, 30, 60, 15); scatter('herb', 'herb', 50);
}

// ---- 建築零件 ----
function addStatic(scene, parts, x, y, z, ry = 0, shadow = true) {
  const m = meshOf(parts, shadow); m.position.set(x, y, z); m.rotation.y = ry; m.receiveShadow = true; scene.add(m); return m;
}
function tent(scene, x, z, color, s = 1, ry = 0) {
  const y = heightAt(x, z);
  addStatic(scene, [cone(3.2 * s, 3.3 * s, 4, color, 0, 1.65 * s, 0, 0, PI / 4), cyl(0.06, 0.06, 0.9, 5, 0x4a3a2a, 0, 3.6 * s, 0),
  bx(1.1 * s, 1.7 * s, 0.1, 0x1a1410, 0, 0.85 * s, 1.72 * s, -0.42)], x, y, z, ry);
  world.addCircle(x, z, 2.3 * s, 3);
}
function campfire(scene, x, z, big = false) {
  const y = heightAt(x, z), p = [];
  for (let i = 0; i < 5; i++) { const a = i * 1.257; p.push(cyl(0.09, 0.09, 1.1, 5, 0x3a2414, Math.cos(a) * 0.25, 0.25, Math.sin(a) * 0.25, 0.9, -a)); }
  for (let i = 0; i < 8; i++) { const a = i * 0.785; p.push(rock(0.2, 0x6a6660, Math.cos(a) * 0.75, 0.1, Math.sin(a) * 0.75)); }
  addStatic(scene, p, x, y, z, 0, false);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.3, 6), new THREE.MeshBasicMaterial({ color: 0xffa030, transparent: true, opacity: 0.9, fog: false }));
  flame.position.set(x, y + 0.85, z); scene.add(flame);
  const em = addFire(scene, x, y, z, big); // 光源由 lights.js 統一分配（只點亮最近的幾個），另有光暈與地面暖光
  world.fires.push({ light: null, flame, em, ph: x });
  world.addCircle(x, z, 0.8, 1);
}
function flag(scene, x, z, ch, bg, fg, hgt = 7) {
  const y = heightAt(x, z);
  addStatic(scene, [cyl(0.07, 0.09, hgt, 6, 0x4a3a2a, 0, hgt / 2, 0), ball(0.14, 0xd4af37, 0, hgt + 0.1, 0)], x, y, z);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 2.3).translate(0.9, 0, 0), new THREE.MeshLambertMaterial({ map: flagTexture(ch, bg, fg), side: THREE.DoubleSide }));
  m.position.set(x, y + hgt - 1.3, z); m.userData = { ry: (x * 7 + z) % 6, ph: x }; scene.add(m); world.flags.push(m);
  world.addCircle(x, z, 0.25, 6);
}
function palisade(scene, cx, cz, R, gateAng, gateW = 0.22, color = 0x6a4a2a) {
  const p = [], n = Math.floor(2 * PI * R / 1.0), y0 = heightAt(cx, cz);
  world.enclosures.push({ type: 'ring', x: cx, z: cz, R, ga: gateAng });
  for (let i = 0; i < n; i++) {
    const a = i / n * PI * 2;
    let da = Math.abs(((a - gateAng + PI * 3) % (PI * 2)) - PI);
    if (da < gateW) continue;
    const x = cx + Math.cos(a) * R, z = cz + Math.sin(a) * R, y = heightAt(x, z) - y0, h = 2.9 + (i % 3) * 0.15;
    p.push(cyl(0.2, 0.24, h, 5, color, x - cx, y + h / 2 - 0.2, z - cz));
    p.push(cone(0.2, 0.4, 5, color, x - cx, y + h, z - cz));
    world.addCircle(x, z, 0.55, 3.2);
  }
  addStatic(scene, p, cx, y0, cz);
}
function tower(scene, x, z) {
  const y = heightAt(x, z), p = [];
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.push(cyl(0.14, 0.16, 7, 5, 0x5a4028, a * 1.2, 3.5, b * 1.2));
  p.push(bx(3.2, 0.2, 3.2, 0x6a4a2a, 0, 6, 0));
  for (const [a, b, w, d] of [[0, 1.55, 3.2, 0.1], [0, -1.55, 3.2, 0.1], [1.55, 0, 0.1, 3.2], [-1.55, 0, 0.1, 3.2]]) p.push(bx(w, 0.9, d, 0x6a4a2a, a, 6.55, b));
  p.push(cone(2.8, 1.5, 4, 0x3a3a40, 0, 8.6, 0, 0, PI / 4));
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.push(cyl(0.08, 0.08, 1.9, 5, 0x5a4028, a * 1.4, 7, b * 1.4));
  addStatic(scene, p, x, y, z); world.addCircle(x, z, 1.9, 8);
}
// 中式屋頂
function roofParts(w, d, y, color = 0x34343c) {
  return [bx(w + 1.6, 0.35, d + 1.6, color, 0, y, 0), part4(w, d, y + 1.3, color), bx(w * 0.7, 0.3, 0.4, 0x24242a, 0, y + 2.45, 0)];
}
function part4(w, d, y, color) { const g = new THREE.ConeGeometry(0.72, 2.3, 4); g.rotateY(PI / 4); g.scale(w + 1.2, 1, d + 1.2); return colorGeo(g, color, 0, y, 0); }
function colorGeo(g, color, x, y, z) {
  const gg = g.index ? g.toNonIndexed() : g; gg.translate(x, y, z); gg.computeVertexNormals();
  const n = gg.attributes.position.count, c = new Float32Array(n * 3), col = new THREE.Color(color);
  for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
  gg.setAttribute('color', new THREE.BufferAttribute(c, 3)); return gg;
}
// 東西向城牆，中央有門洞
function gateWall(scene, cx, cz, L, H, T, gw, name, face = 1) {
  if (face > 0) world.enclosures.push({ type: 'wall', z: cz, x0: cx - L / 2, x1: cx + L / 2, gx: cx, gw, T });
  const y = heightAt(cx, cz), p = [], WALL = 0x8a8474, half = L / 2;
  const side = (L - gw) / 2;
  for (const s of [-1, 1]) {
    p.push(bx(side, H, T, WALL, s * (gw / 2 + side / 2), H / 2, 0));
    world.addBox(cx + (s < 0 ? -half : gw / 2), cz - T / 2, cx + (s < 0 ? -gw / 2 : half), cz + T / 2, H);
    for (let i = 0; i < side / 2.4; i++) p.push(bx(1.2, 0.9, T + 0.2, 0x7a7466, s * (gw / 2 + 1 + i * 2.4), H + 0.45, 0));
  }
  p.push(bx(gw, H - 5.5, T, WALL, 0, 5.5 + (H - 5.5) / 2, 0));
  p.push(bx(gw + 1.2, 0.5, T + 0.4, 0x5a1a1a, 0, 5.4, 0));
  // 城樓
  p.push(bx(13, 4, T + 2, 0x8b1a1a, 0, H + 2, 0));
  for (const s of [-1, 1]) for (const f of [-1, 1]) p.push(cyl(0.3, 0.3, 4, 6, 0x5a1010, s * 6.3, H + 2, f * (T / 2 + 0.9)));
  p.push(...roofParts(13, T + 2, H + 4.2));
  addStatic(scene, p, cx, y, cz);
  // 匾額
  const pl = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 1.6), new THREE.MeshBasicMaterial({ map: plaque(name) }));
  pl.position.set(cx, y + H - 1.2, cz + face * (T / 2 + 0.06)); if (face < 0) pl.rotation.y = PI; scene.add(pl);
}
function plaque(text) {
  const c = document.createElement('canvas'); c.width = 384; c.height = 112; const g = c.getContext('2d');
  g.fillStyle = '#1a2a4a'; g.fillRect(0, 0, 384, 112); g.strokeStyle = '#d4af37'; g.lineWidth = 8; g.strokeRect(4, 4, 376, 104);
  g.font = 'bold 72px "Noto Serif TC","PMingLiU","Microsoft JhengHei",serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#d4af37'; g.fillText(text, 192, 60);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function wallBox(scene, x0, z0, x1, z1, H) {
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, y = heightAt(cx, cz);
  addStatic(scene, [bx(x1 - x0, H, z1 - z0, 0x8a8474, 0, H / 2, 0), bx(x1 - x0 + 0.3, 0.5, z1 - z0 + 0.3, 0x6a6458, 0, H + 0.25, 0)], cx, y, cz);
  world.addBox(x0, z0, x1, z1, H);
}

// ---- 可燒毀的目標（烏巢糧倉、赤壁戰船）：只怕火攻與爆炸 ----
const charMat = new THREE.MeshLambertMaterial({ vertexColors: true, color: 0x3a3430 });
const burnMat = new THREE.MeshBasicMaterial({ color: 0xff8a20, transparent: true, opacity: 0.9, fog: false, depthWrite: false });
const burnGeo = new THREE.ConeGeometry(0.7, 2.6, 5);
export function damageTargets(x, z, radius, amount) {
  let n = 0;
  for (const t of world.targets) {
    if (t.burned || dist2(x, z, t.x, t.z) > radius + t.r) continue;
    t.hp -= amount;
    if (t.hp <= 0) {
      t.burned = true; n++;
      t.mesh.material = charMat;
      const grp = new THREE.Group(), fl = [];
      for (let i = 0; i < 6; i++) {
        const f = new THREE.Mesh(burnGeo, burnMat), a = i / 6 * PI * 2, r = t.r * 0.5;
        f.position.set(t.x + Math.cos(a) * r, t.y + t.fy + Math.random(), t.z + Math.sin(a) * r * (t.kind === 'ship' ? 2.4 : 1));
        f.userData.ph = Math.random() * 6; grp.add(f); fl.push(f);
      }
      G.scene.add(grp); world.burning.push({ grp, fl, t: 40 });
      if (world.onBurn) world.onBurn(t);
      if (t.kind === 'ship') { // 鐵索連環：火勢延燒到相鄰戰船
        const nb = world.targets.filter(o => o.kind === 'ship' && !o.burned && dist2(o.x, o.z, t.x, t.z) < 14);
        setTimeout(() => { for (const o of nb) damageTargets(o.x, o.z, 0.5, 70); }, 2500);
      }
    }
  }
  return n;
}
function target(kind, id, mesh, x, z, r, hp, fy) { world.targets.push({ kind, id, mesh, x, z, y: heightAt(x, z), r, hp, max: hp, fy, burned: false }); }

// ---- 前哨營（解鎖時才搭建） ----
const builtOp = new Set();
export function syncOutposts() {
  const scene = G.scene, out = [];
  for (const id of outposts()) {
    const s = SITES[id];
    if (builtOp.has(id) || G.stage < s.stage) continue;
    builtOp.add(id); out.push(id);
    const cx = s.x, cz = s.z, ga = Math.atan2(SITES.camp.z - cz, SITES.camp.x - cx);
    tent(scene, cx + Math.cos(ga + 1.6) * 6, cz + Math.sin(ga + 1.6) * 6, 0x2f6b3a, 0.9, -ga);
    tent(scene, cx + Math.cos(ga - 1.6) * 6, cz + Math.sin(ga - 1.6) * 6, 0xb8a888, 0.85, -ga + PI);
    flag(scene, cx + Math.cos(ga + PI) * 4, cz + Math.sin(ga + PI) * 4, '劉', '#1f6b35', '#f4e8b0', 7);
    campfire(scene, cx, cz);
    const wx = cx + Math.cos(ga) * 5, wz = cz + Math.sin(ga) * 5, wy = heightAt(wx, wz);
    addStatic(scene, [cyl(0.8, 0.9, 0.8, 10, 0x8a867e, 0, 0.4, 0), cyl(0.65, 0.65, 0.1, 10, 0x2a5a7a, 0, 0.72, 0)], wx, wy, wz);
    world.addCircle(wx, wz, 1, 1); world.addNode({ kind: 'well', x: wx, z: wz, stock: 1 });
    // 軍帳前的令旗台：存檔、傳送
    const tx = cx + Math.cos(ga + PI * 0.5) * 2.4, tz = cz + Math.sin(ga + PI * 0.5) * 2.4, ty = heightAt(tx, tz);
    addStatic(scene, [bx(1.4, 0.8, 0.8, 0x5a3a1c, 0, 0.4, 0), bx(0.5, 0.06, 0.4, 0xe8dcc0, 0, 0.83, 0), cyl(0.03, 0.03, 1.4, 4, 0x3a2a1a, 0.5, 1.5, 0), bx(0.4, 0.3, 0.02, 0xc8201a, 0.7, 2.0, 0)], tx, ty, tz, -ga);
    world.addCircle(tx, tz, 0.8, 1); world.addNode({ kind: 'outpost', id, x: tx, z: tz, stock: 1 });
    world.spots[id] = [cx, cz];
  }
  return out; // 新搭建的前哨營（讓 main 派駐守衛）
}
// 傳送門旁的儀器：擊敗董卓前是暗的
export function setDeviceActive(on) {
  if (!world.device) return;
  world.device.screen.material.color.set(on ? 0x40d8ff : 0x1a2228);
  world.device.light.visible = on && !G.touch;
}

// ---- 新章節據點 ----
function enemyCamp(scene, id, tentColor, chars, flagBg) {
  const s = SITES[id], cx = s.x, cz = s.z, ga = Math.atan2(SITES.camp.z - cz, SITES.camp.x - cx);
  palisade(scene, cx, cz, s.r - 3, ga, 0.26, 0x5a4a30);
  for (let i = 0; i < 6; i++) { const a = ga + 1 + i / 6 * 4.3; tent(scene, cx + Math.cos(a) * (s.r - 12), cz + Math.sin(a) * (s.r - 12), tentColor, 0.95, -a + PI / 2); }
  flag(scene, cx - 4, cz - 4, chars[0], flagBg, '#f4e8b0', 9); flag(scene, cx + 4, cz - 4, chars[1], flagBg, '#f4e8b0', 9);
  campfire(scene, cx + 8, cz + 6); campfire(scene, cx - 8, cz + 7);
  tower(scene, cx + Math.cos(ga + 0.4) * (s.r - 3), cz + Math.sin(ga + 0.4) * (s.r - 3));
  world.spots[id] = [cx, cz];
}
function buildChapterSites(scene) {
  const S = SITES, sp = world.spots;
  enemyCamp(scene, 'baima', 0x9a8040, '袁顏', '#6a5020');
  enemyCamp(scene, 'yanjin', 0x9a8040, '袁文', '#6a5020');
  { // 烏巢糧倉
    const s = S.wuchao, cx = s.x, cz = s.z, ga = Math.atan2(S.camp.z - cz, S.camp.x - cx);
    palisade(scene, cx, cz, 37, ga, 0.24, 0x5a4a30);
    flag(scene, cx - 4, cz - 3, '袁', '#6a5020', '#f4e8b0', 9); flag(scene, cx + 4, cz - 3, '糧', '#6a5020', '#f4e8b0', 9);
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * PI * 2 + 0.3, x = cx + Math.cos(a) * 19, z = cz + Math.sin(a) * 19, y = heightAt(x, z);
      const p = [cyl(2.3, 2.5, 2.6, 10, 0xb89a60, 0, 1.3, 0), cone(2.9, 2.2, 10, 0xc8a850, 0, 3.7, 0), cyl(0.12, 0.12, 0.6, 5, 0x5a4020, 0, 5, 0)];
      for (let k = 0; k < 4; k++) p.push(bx(0.9, 0.5, 0.6, 0xd8c890, 2.8, 0.25 + (k >> 1) * 0.5, -0.5 + (k & 1)));
      const m = meshOf(p, true); m.position.set(x, y, z); scene.add(m);
      world.addCircle(x, z, 2.5, 4); target('granary', 'wuchao', m, x, z, 2.6, 100, 3);
    }
    tent(scene, cx + 6, cz + 6, 0x9a8040, 1.2, 0.4); tent(scene, cx - 7, cz + 5, 0x9a8040, 1, -0.4);
    campfire(scene, cx, cz + 2, true);
    sp.wuchao = [cx, cz - 3];
  }
  { // 長坂橋：橫跨江面的木橋（橋面可行走）
    const s = S.changban, z = s.z, rx = s.x, x0 = rx - 30, x1 = rx + 30, y = 1.5, W = 4.4;
    bridges.push({ x0, x1, z0: z - W / 2, z1: z + W / 2, y });
    const p = [bx(x1 - x0, 0.3, W, 0x6a4a2a, 0, 0, 0)];
    for (let i = 0; i <= 12; i++) { const px = -30 + i * 5; p.push(cyl(0.16, 0.18, 4, 6, 0x4a3420, px, -2, -W / 2 + 0.2), cyl(0.16, 0.18, 4, 6, 0x4a3420, px, -2, W / 2 - 0.2), cyl(0.06, 0.06, 1, 5, 0x5a3a20, px, 0.6, -W / 2 + 0.1), cyl(0.06, 0.06, 1, 5, 0x5a3a20, px, 0.6, W / 2 - 0.1)); }
    p.push(bx(x1 - x0, 0.1, 0.1, 0x5a3a20, 0, 1.05, -W / 2 + 0.1), bx(x1 - x0, 0.1, 0.1, 0x5a3a20, 0, 1.05, W / 2 - 0.1));
    addStatic(scene, p, rx, y - 0.15, z);
    const hx = x1 + 6, hy = heightAt(hx, z + 6);
    addStatic(scene, [bx(1.4, 2.2, 0.4, 0x8a8478, 0, 1.1, 0), bx(1.6, 0.2, 0.6, 0x6a6458, 0, 2.3, 0)], hx, hy, z + 6);
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.36), new THREE.MeshBasicMaterial({ map: plaque('長坂橋') })); pl.position.set(hx, hy + 1.6, z + 5.78); pl.rotation.y = PI; scene.add(pl);
    sp.changbanHold = [x1 + 8, z]; sp.changbanWest = [x0 - 45, z]; sp.xiahouen = [x0 - 6, z];
  }
  { // 赤壁：曹軍江畔大營
    const s = S.chibi, cx = s.x, cz = s.z;
    for (const [dx, dz, ry] of [[10, -10, 0.8], [12, 8, -0.8], [-2, 14, 3], [16, 0, -1.5]]) tent(scene, cx + dx, cz + dz, 0x2a3f8a, 1.1, ry);
    flag(scene, cx - 6, cz - 6, '曹', '#2a3f8a', '#f4e8b0', 10); flag(scene, cx - 6, cz + 6, '漢', '#8b1a1a', '#f4e8b0', 10);
    campfire(scene, cx + 4, cz, true); tower(scene, cx + 18, cz - 16);
    sp.caocaoE = [cx, cz];
  }
  { // 黑市：營帳、燈籠、貨箱
    const s = S.blackmarket, cx = s.x, cz = s.z;
    tent(scene, cx + 3, cz + 2, 0x2a2228, 1.1, 0.6);
    const y = heightAt(cx - 2, cz - 1);
    addStatic(scene, [bx(0.8, 0.8, 0.8, 0x5a4020, 0, 0.4, 0), bx(0.8, 0.8, 0.8, 0x4a3418, 0.9, 0.4, 0.2), bx(0.7, 0.7, 0.7, 0x5a4020, 0.4, 1.15, 0.1), cyl(0.05, 0.05, 2.4, 5, 0x3a2a1a, -0.9, 1.2, 0), ball(0.22, 0xd8402a, -0.9, 2.3, 0.25)], cx - 2, y, cz - 1);
    world.addCircle(cx - 1.6, cz - 1, 1.2, 1);
    sp.broker = [cx - 1, cz - 3];
  }
}
// 赤壁戰船：第八章才出現，以鐵索相連
export function buildShips() {
  if (world.targets.some(t => t.kind === 'ship')) return;
  const scene = G.scene, zs = [214, 226, 238, 250, 262];
  for (const z of zs) {
    const x = riverX(z);
    const p = [bx(3.6, 1.6, 9.5, 0x5a3a1c, 0, 0.3, 0), bx(3.2, 0.2, 8.6, 0x7a5a32, 0, 1.15, 0), cone(1.8, 2.2, 4, 0x5a3a1c, 0, 0.3, 5.4, PI / 2, PI / 4), bx(2.4, 1.4, 2.4, 0x6a4a2a, 0, 1.9, -2.8)];
    p.push(cyl(0.16, 0.2, 8, 6, 0x4a3420, 0, 5.1, 0.6), bx(0.08, 4.4, 3.4, 0xd8d0b8, 0.15, 5.6, 0.6), bx(0.1, 0.9, 1.2, 0x2a3f8a, 0.2, 8.6, 0.6));
    if (z !== zs[zs.length - 1]) p.push(cyl(0.06, 0.06, 3, 4, 0x2a2a2e, 1.2, 0.9, 6.2, PI / 2), cyl(0.06, 0.06, 3, 4, 0x2a2a2e, -1.2, 0.9, 6.2, PI / 2));
    const m = meshOf(p, true); m.position.set(x, WATER - 0.2, z); scene.add(m);
    world.targets.push({ kind: 'ship', id: 'chibi', mesh: m, x, z, y: WATER, r: 5, hp: 100, max: 100, fy: 1.2, burned: false });
  }
}

// ---- 軍火工坊：依建造等級重建模型 ----
let wsGroup = null, wsSign = null;
const wsCol = new Set();
function wsCollide(key, fn) { if (!wsCol.has(key)) { wsCol.add(key); fn(); } }
export function buildWorkshop(st) {
  const scene = G.scene, s = SITES.workshop, cx = s.x, cz = s.z, y = heightAt(cx, cz);
  if (wsGroup) { scene.remove(wsGroup); wsGroup.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
  wsGroup = new THREE.Group(); scene.add(wsGroup);
  const add = (parts, x, z, ry = 0) => { const m = meshOf(parts, true); m.position.set(cx + x, y, cz + z); m.rotation.y = ry; m.receiveShadow = true; wsGroup.add(m); };
  const W = 0x6a4a2a, DK = 0x4a3420, ROOF = 0x5a3a24, STONE = 0x7a766e;
  // 四角木樁與麻繩
  const stake = [];
  for (const [a, b] of [[-10, -10], [10, -10], [-10, 10], [10, 10]]) stake.push(cyl(0.1, 0.12, 1.4, 5, DK, a, 0.7, b));
  add(stake, 0, 0);
  if (!wsSign) {
    wsSign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.76), new THREE.MeshBasicMaterial({ map: plaque(st.built ? '軍火工坊' : '工坊預定地') }));
    scene.add(wsSign);
  } else wsSign.material.map = plaque(st.built ? '軍火工坊' : '工坊預定地');
  add([cyl(0.08, 0.08, 2.6, 5, DK, -1.1, 1.3, 0), cyl(0.08, 0.08, 2.6, 5, DK, 1.1, 1.3, 0)], 0, -10.5);
  wsSign.position.set(cx, y + 2.1, cz - 10.45); wsSign.rotation.y = PI;
  if (!st.built) return;
  // 工坊主棚：屋頂、工作台、鐵砧
  const shed = [];
  for (const [a, b] of [[-3.2, -2.6], [3.2, -2.6], [-3.2, 2.6], [3.2, 2.6]]) shed.push(cyl(0.14, 0.16, 3.2, 6, W, a, 1.6, b));
  shed.push(bx(7.6, 0.2, 6.4, ROOF, 0, 3.3, 0, 0.12), bx(2.4, 0.9, 1, 0x5a3a1c, 0, 0.45, 1.4), bx(0.5, 0.5, 0.5, 0x2a2a2e, 1.6, 0.25, -1), bx(0.7, 0.18, 0.35, 0x3a3a40, 1.6, 0.6, -1));
  shed.push(bx(0.5, 0.12, 0.2, 0x25262a, -0.4, 0.96, 1.4), bx(0.3, 0.3, 0.3, 0xc8a050, 0.6, 1.05, 1.4));
  add(shed, 0, 0);
  wsCollide('shed', () => { world.addBox(cx - 1.2, cz + 0.9, cx + 1.2, cz + 1.9, 1); for (const [a, b] of [[-3.2, -2.6], [3.2, -2.6], [-3.2, 2.6], [3.2, 2.6]]) world.addCircle(cx + a, cz + b, 0.25, 3); });
  wsCollide('fire', () => campfire(scene, cx + 6, cz + 6.5));
  const L = st.lv;
  if (L.mill) { // 火藥坊：小屋＋火藥桶
    const p = [bx(3.2, 2.4, 3, 0x8a7a5a, 0, 1.2, 0), cone(2.8, 1.4, 4, ROOF, 0, 3.1, 0, 0, PI / 4), bx(1, 1.6, 0.1, 0x2a1a10, 0, 0.8, 1.52)];
    for (let i = 0; i < L.mill * 2; i++) p.push(cyl(0.32, 0.36, 0.8, 8, 0x5a3a1c, 2.1 + (i % 2) * 0.75, 0.4, -1 + Math.floor(i / 2) * 0.8), cyl(0.34, 0.34, 0.06, 8, 0x2a2a2e, 2.1 + (i % 2) * 0.75, 0.62, -1 + Math.floor(i / 2) * 0.8));
    add(p, -6.2, 4.5);
    wsCollide('mill', () => world.addBox(cx - 7.8, cz + 3, cx - 4.6, cz + 6, 3));
  }
  if (L.forge) { // 鐵匠爐：石爐＋煙囪（等級越高煙囪越高）
    const h = 2.6 + L.forge * 0.8;
    const p = [bx(2.2, 1.5, 2, STONE, 0, 0.75, 0), bx(1, 0.7, 0.1, 0xff7a20, 0, 0.75, 1.01), cyl(0.38, 0.45, h, 8, STONE, 0.5, 1.5 + h / 2, -0.5), bx(1.2, 0.8, 0.8, 0x2a2a2e, -1.8, 0.4, 0.6)];
    for (let i = 0; i < L.forge; i++) p.push(bx(0.6, 0.12, 0.25, 0x3a3a40, -1.8, 0.86 + i * 0.13, 0.6));
    add(p, 6.2, -3.5);
    wsCollide('forge', () => world.addBox(cx + 5.1, cz - 4.5, cx + 7.3, cz - 2.5, 2));
  }
  if (L.store) { // 倉庫：木屋＋木箱
    const p = [bx(4.2, 2.8, 3.4, 0x7a5a3a, 0, 1.4, 0), bx(4.6, 0.25, 3.8, ROOF, 0, 2.95, 0), bx(1.4, 2, 0.1, 0x3a2414, 0, 1, 1.71)];
    for (let i = 0; i < L.store * 2; i++) p.push(bx(0.8, 0.8, 0.8, 0x8a6a3a, 2.7, 0.4 + Math.floor(i / 2) * 0.8, -1 + (i % 2) * 0.9));
    add(p, -6.2, -4.5);
    wsCollide('store', () => world.addBox(cx - 8.3, cz - 6.2, cx - 4.1, cz - 2.8, 3));
  }
}

// ---- 各據點 ----
function buildSites(scene) {
  const S = SITES, sp = world.spots;

  // == 穿越之地 ==
  {
    const s = S.spawn, y = s.y;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.12, 8, 32), new THREE.MeshBasicMaterial({ color: 0x60c8ff, transparent: true, opacity: 0.7, fog: false }));
    ring.position.set(s.x - 5, y + 2.6, s.z - 4); scene.add(ring); world.portal = ring;
    if (!G.touch) { const pl = new THREE.PointLight(0x60c8ff, 30, 20); pl.position.copy(ring.position); scene.add(pl); }
    addStatic(scene, [bx(1.3, 0.8, 0.8, 0x3a4a2a, 0, 0.4, 0), bx(1.34, 0.08, 0.84, 0x2a3a1a, 0, 0.82, 0), bx(0.5, 0.25, 0.02, 0xd8d8d0, 0, 0.45, 0.41)], s.x + 3, y, s.z - 3, 0.4);
    world.addCircle(s.x + 3, s.z - 3, 0.8, 1);
    world.addNode({ kind: 'crate', x: s.x + 3, z: s.z - 3, stock: 1 });
    // 傳送門儀器（半埋在土裡的現代控制台）
    const dx = s.x - 8.4, dz = s.z - 1.4, dy = heightAt(dx, dz);
    addStatic(scene, [bx(1.2, 1.0, 0.8, 0x4a4e58, 0, 0.5, 0), bx(1.3, 0.12, 0.9, 0x2a2c32, 0, 1.06, 0), bx(1.1, 0.5, 0.1, 0x2a2c32, 0, 1.35, -0.3, -0.5), cyl(0.05, 0.05, 2.2, 5, 0x1a1a1a, 0.7, 0.2, 0.6, 0, 0, PI / 2.4), bx(0.3, 0.3, 0.3, 0x6a6e78, -0.6, 0.15, 0.5)], dx, dy, dz, 0.6);
    const holder = new THREE.Object3D(); holder.position.set(dx, dy, dz); holder.rotation.y = 0.6; scene.add(holder);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.36), new THREE.MeshBasicMaterial({ color: 0x1a2228 }));
    screen.position.set(0, 1.37, -0.235); screen.rotation.x = -0.5; holder.add(screen);
    const dl = new THREE.PointLight(0x40d8ff, 12, 8); dl.position.set(0, 1.9, 0.4); dl.visible = false; holder.add(dl);
    world.device = { screen, light: dl, x: dx, z: dz };
    world.addCircle(dx, dz, 0.9, 1.4); world.addNode({ kind: 'device', x: dx, z: dz + 0.6, stock: 1 });
  }

  // == 劉備軍營 ==
  {
    const s = S.camp, cx = s.x, cz = s.z;
    const ga = Math.atan2(S.spawn.z - cz, S.spawn.x - cx);
    palisade(scene, cx, cz, 33, ga);
    const gx = cx + Math.cos(ga) * 33, gz = cz + Math.sin(ga) * 33, px = -Math.sin(ga), pz = Math.cos(ga);
    tower(scene, gx + px * 9, gz + pz * 9); tower(scene, gx - px * 9, gz - pz * 9);
    flag(scene, gx + px * 5, gz + pz * 5, '劉', '#1f6b35', '#f4e8b0'); flag(scene, gx - px * 5, gz - pz * 5, '漢', '#8b1a1a', '#f4e8b0');
    campfire(scene, cx, cz, true);
    tent(scene, cx + 2, cz + 20, 0x2f6b3a, 1.7, PI);          // 中軍大帳
    flag(scene, cx - 5, cz + 15, '劉', '#1f6b35', '#f4e8b0', 9);
    for (const [dx, dz, ry] of [[-20, 8, 1.2], [-22, -6, 1.6], [20, 12, -1.2], [-12, 22, 2.4], [16, 22, -2.6]]) tent(scene, cx + dx, cz + dz, 0xb8a888, 1, ry);
    // 玩家營帳與臥榻
    const bxp = cx + 21, bzp = cz - 4, by = heightAt(bxp, bzp);
    addStatic(scene, [bx(1.1, 0.35, 2.2, 0x5a3a1c, 0, 0.2, 0), bx(1.0, 0.12, 1.5, 0x8a2a2a, 0, 0.43, 0.3), bx(0.8, 0.14, 0.4, 0xe0d8c0, 0, 0.45, -0.8)], bxp, by, bzp, 0.3);
    const cp = [];
    for (const [a, b] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) cp.push(cyl(0.08, 0.08, 2.6, 5, 0x5a4028, a, 1.3, b));
    cp.push(cone(3, 1.2, 4, 0x3a5a8a, 0, 3.2, 0, 0, PI / 4));
    addStatic(scene, cp, bxp, by, bzp, 0.3);
    world.addNode({ kind: 'bed', x: bxp, z: bzp, stock: 1 });
    // 水井
    const wx = cx - 1, wz = cz - 21, wy = heightAt(wx, wz);
    addStatic(scene, [cyl(1, 1.1, 0.9, 10, 0x8a867e, 0, 0.45, 0), cyl(0.8, 0.8, 0.1, 10, 0x2a5a7a, 0, 0.8, 0), cyl(0.07, 0.07, 2.4, 5, 0x5a4028, -0.9, 1.2, 0), cyl(0.07, 0.07, 2.4, 5, 0x5a4028, 0.9, 1.2, 0), bx(2.2, 0.12, 0.5, 0x5a4028, 0, 2.4, 0)], wx, wy, wz);
    world.addCircle(wx, wz, 1.2, 1); world.addNode({ kind: 'well', x: wx, z: wz, stock: 1 });
    // 商攤
    const mx = cx + 10, mz = cz - 16, my = heightAt(mx, mz);
    addStatic(scene, [bx(3.2, 0.9, 1.1, 0x6a4a2a, 0, 0.45, 0), bx(3.6, 0.1, 2.4, 0xa83a2a, 0, 2.7, 0.3, 0.15),
    cyl(0.07, 0.07, 2.7, 5, 0x5a4028, -1.6, 1.35, -0.6), cyl(0.07, 0.07, 2.7, 5, 0x5a4028, 1.6, 1.35, -0.6), cyl(0.07, 0.07, 2.4, 5, 0x5a4028, -1.6, 1.2, 1.2), cyl(0.07, 0.07, 2.4, 5, 0x5a4028, 1.6, 1.2, 1.2),
    bx(0.4, 0.3, 0.4, 0xc8a050, -1, 1.05, 0), bx(0.5, 0.2, 0.4, 0x8a3a2a, 0, 1.0, 0), ball(0.2, 0xd8c890, 1, 1.05, 0)], mx, my, mz, 0);
    world.addBox(mx - 1.6, mz - 0.55, mx + 1.6, mz + 0.55, 1);
    // 馬廄
    const hx = cx - 20, hz = cz + 14 - 30, hy = heightAt(hx, hz), hp = [];
    for (const [a, b] of [[-4, -2], [4, -2], [-4, 2], [4, 2], [0, -2], [0, 2]]) hp.push(cyl(0.12, 0.12, 3, 5, 0x5a4028, a, 1.5, b));
    hp.push(bx(9, 0.2, 5.2, 0x6a5a3a, 0, 3.1, 0, 0.08)); hp.push(bx(8, 0.12, 0.12, 0x5a4028, 0, 1.1, -2));
    addStatic(scene, hp, hx, hy, hz);
    world.addNode({ kind: 'station', id: 'camp', x: cx + 14, z: cz - 9, stock: 1 });
    addStatic(scene, [bx(1.4, 0.8, 0.8, 0x5a3a1c, 0, 0.4, 0), bx(0.5, 0.06, 0.4, 0xe8dcc0, 0, 0.83, 0), cyl(0.03, 0.03, 1.4, 4, 0x3a2a1a, 0.5, 1.5, 0), bx(0.4, 0.3, 0.02, 0x1f6b35, 0.7, 2.0, 0)], cx + 14, heightAt(cx + 14, cz - 9), cz - 9);
    world.addCircle(cx + 14, cz - 9, 0.8, 1);
    Object.assign(sp, {
      liubei: [cx + 2, cz + 13], guanyu: [cx - 3, cz + 12], zhangfei: [cx + 7, cz + 12], zhaoyun: [cx + 12, cz + 4],
      mizhu: [mx, mz - 1.6], stable: [hx, hz], respawn: [cx + 18, cz - 6], campGate: [gx, gz],
    });
  }

  // == 黃巾營寨 ==
  {
    const s = S.turban, cx = s.x, cz = s.z;
    const ga = Math.atan2(S.spawn.z - cz, S.spawn.x - cx);
    palisade(scene, cx, cz, 36, ga, 0.3, 0x5a4a30);
    const y = heightAt(cx, cz);
    // 祭壇
    addStatic(scene, [cyl(6, 6.6, 0.6, 12, 0x8a8068, 0, 0.3, 0), cyl(4, 4.4, 0.6, 12, 0x9a9078, 0, 0.9, 0), bx(1.6, 1, 1, 0x6a4a2a, 0, 1.7, -2), cyl(0.3, 0.2, 0.5, 8, 0xd4af37, 0, 2.45, -2)], cx, y, cz);
    flag(scene, cx - 5, cz - 5, '黃', '#e8b818', '#3a2a10', 9); flag(scene, cx + 5, cz - 5, '天', '#e8b818', '#3a2a10', 9);
    for (let i = 0; i < 9; i++) { const a = i / 9 * PI * 2 + 0.4; tent(scene, cx + Math.cos(a) * 24, cz + Math.sin(a) * 24, 0xc8a838, 0.9 + (i % 3) * 0.1, -a + PI / 2); }
    campfire(scene, cx + 10, cz + 8); campfire(scene, cx - 11, cz + 7);
    tower(scene, cx + Math.cos(ga + 0.45) * 33, cz + Math.sin(ga + 0.45) * 33);
    sp.zhangjiao = [cx, cz + 2];
  }

  // == 聯軍大營 ==
  {
    const s = S.coalition, cx = s.x, cz = s.z;
    campfire(scene, cx, cz, true);
    tent(scene, cx - 9, cz - 12, 0x2a3f8a, 1.4, 0.5); tent(scene, cx + 10, cz - 11, 0xa82a20, 1.4, -0.5);
    flag(scene, cx - 5, cz - 6, '曹', '#2a3f8a', '#f4e8b0', 8); flag(scene, cx + 6, cz - 6, '孫', '#a82a20', '#f4e8b0', 8);
    for (const [dx, dz, ry] of [[-18, 4, 1.4], [18, 5, -1.4], [-12, 16, 2.2], [12, 17, -2.2]]) tent(scene, cx + dx, cz + dz, 0xb8a888, 1, ry);
    tower(scene, cx + 20, cz - 18);
    world.addNode({ kind: 'station', id: 'coalition', x: cx + 4, z: cz + 8, stock: 1 });
    addStatic(scene, [bx(1.4, 0.8, 0.8, 0x5a3a1c, 0, 0.4, 0), bx(0.5, 0.06, 0.4, 0xe8dcc0, 0, 0.83, 0)], cx + 4, heightAt(cx + 4, cz + 8), cz + 8);
    world.addCircle(cx + 4, cz + 8, 0.8, 1);
    Object.assign(sp, { caocao: [cx - 6, cz - 4], sunjian: [cx + 6, cz - 4], coHorse: [cx - 18, cz - 8] });
  }

  // == 汜水關 / 虎牢關 ==
  for (const [id, ch, bg] of [['sishui', '董', '#26262c'], ['hulao', '呂', '#8a1a1a']]) {
    const s = S[id], cx = s.x, cz = s.z;
    gateWall(scene, cx, cz, 84, id === 'hulao' ? 13 : 11, 6, 9, s.name);
    flag(scene, cx - 9, cz + 6, ch, bg, '#f4e8b0', 9); flag(scene, cx + 9, cz + 6, '董', '#26262c', '#f4e8b0', 9);
    campfire(scene, cx - 14, cz + 16); campfire(scene, cx + 14, cz + 16);
    tent(scene, cx - 22, cz + 24, 0x3a3a44, 1, 2); tent(scene, cx + 22, cz + 24, 0x3a3a44, 1, -2);
    tower(scene, cx - 30, cz + 10); tower(scene, cx + 30, cz + 10);
    sp[id] = [cx, cz + 14];
  }

  // == 郿塢 ==
  {
    const s = S.meiwu, cx = s.x, cz = s.z, R = 36, T = 3.5, H = 9;
    wallBox(scene, cx - R, cz + R - T, cx + R, cz + R, H);
    wallBox(scene, cx - R, cz - R + T, cx - R + T, cz + R - T, H);
    wallBox(scene, cx + R - T, cz - R + T, cx + R, cz + R - T, H);
    gateWall(scene, cx, cz - R + T / 2, R * 2, H, T, 9, s.name, -1);
    world.enclosures.push({ type: 'box', x0: cx - R, x1: cx + R, z0: cz - R, z1: cz + R, gx: cx });
    // 門朝 -Z：匾額在 +Z 側（內側），外側另立旗
    flag(scene, cx - 8, cz - R - 4, '董', '#4a1a5a', '#f4e8b0', 9); flag(scene, cx + 8, cz - R - 4, '董', '#4a1a5a', '#f4e8b0', 9);
    // 大殿
    const y = heightAt(cx, cz + 16), p = [];
    p.push(bx(26, 1, 15, 0x9a9484, 0, 0.5, 0)); p.push(bx(8, 0.5, 3, 0x9a9484, 0, 0.25, -8.5));
    p.push(bx(22, 6, 11, 0x9a2a22, 0, 4, 0)); p.push(bx(4, 4.4, 0.3, 0x2a1a10, 0, 3.2, -5.5));
    for (let i = -3; i <= 3; i++) p.push(cyl(0.4, 0.4, 6, 8, 0x6a1010, i * 3.6, 4, -6.3));
    p.push(...roofParts(24, 13, 7.2));
    p.push(bx(16, 0.3, 8, 0x34343c, 0, 9.9, 0));
    addStatic(scene, p, cx, y, cz + 16);
    world.addBox(cx - 13, cz + 16 - 7.5, cx + 13, cz + 16 + 7.5, 10);
    campfire(scene, cx - 12, cz - 6, true); campfire(scene, cx + 12, cz - 6, true);
    for (const [dx, dz] of [[-24, -20], [24, -20], [-25, 4], [25, 4]]) tent(scene, cx + dx, cz + dz, 0x4a2a5a, 1, dx > 0 ? -1.5 : 1.5);
    sp.dongzhuo = [cx, cz + 3]; sp.meiwuGate = [cx, cz - R - 8];
  }
  buildChapterSites(scene);
  { // 工坊預定地：互動點
    const s = S.workshop; world.addNode({ kind: 'workshop', x: s.x, z: s.z - 4, stock: 1 });
  }
}

// 資源重生
export function updateNodes(dt) {
  for (const n of world.nodeList) {
    if (n.respawn > 0) { n.respawn -= dt; if (n.respawn <= 0) { n.stock = n.max; if (n.mesh) n.mesh.visible = true; } }
  }
}
