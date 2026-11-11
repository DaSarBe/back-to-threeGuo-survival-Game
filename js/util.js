import * as THREE from 'three';

export function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const rnd = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
export const rndInt = (a, b) => Math.floor(rnd(a, b + 1));
export const pick = arr => arr[Math.floor(Math.random() * arr.length)];
export const dist2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

export function angDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
export function turnTo(cur, target, maxStep) {
  const d = angDiff(cur, target);
  return cur + clamp(d, -maxStep, maxStep);
}

function hash2(ix, iz) {
  let h = Math.imul(ix, 374761393) + Math.imul(iz, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
export function fbm(x, z, oct = 4) {
  let s = 0, amp = 0.5, tot = 0;
  for (let i = 0; i < oct; i++) { s += vnoise(x, z) * amp; tot += amp; amp *= 0.5; x *= 2.03; z *= 2.03; }
  return s / tot;
}

// ---------- 幾何合併（頂點色） ----------
const _m = new THREE.Matrix4(), _e = new THREE.Euler(), _c = new THREE.Color();
export function part(geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  _m.makeRotationFromEuler(_e.set(rx, ry, rz)); _m.setPosition(x, y, z);
  g.applyMatrix4(_m);
  const n = g.attributes.position.count, c = new Float32Array(n * 3);
  _c.set(color);
  for (let i = 0; i < n; i++) { c[i * 3] = _c.r; c[i * 3 + 1] = _c.g; c[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
export const bx = (w, h, d, color, ...t) => part(new THREE.BoxGeometry(w, h, d), color, ...t);
export const cyl = (rt, rb, h, seg, color, ...t) => part(new THREE.CylinderGeometry(rt, rb, h, seg), color, ...t);
export const cone = (r, h, seg, color, ...t) => part(new THREE.ConeGeometry(r, h, seg), color, ...t);
export const ball = (r, color, ...t) => part(new THREE.IcosahedronGeometry(r, 1), color, ...t);
export const rock = (r, color, ...t) => part(new THREE.DodecahedronGeometry(r, 0), color, ...t);

export function merge(parts) {
  let n = 0;
  for (const p of parts) n += p.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const p of parts) {
    pos.set(p.attributes.position.array, o);
    nor.set(p.attributes.normal.array, o);
    col.set(p.attributes.color.array, o);
    o += p.attributes.position.count * 3;
    p.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
export const MAT = new THREE.MeshLambertMaterial({ vertexColors: true });
export function meshOf(parts, shadow = false) {
  const m = new THREE.Mesh(merge(parts), MAT);
  m.castShadow = shadow;
  return m;
}

// ---------- 文字貼圖 ----------
const FONT = '"Noto Serif TC","PMingLiU","Microsoft JhengHei","PingFang TC",serif';
export function makeLabel(text, color = '#fff') {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = 'bold 40px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,.85)'; g.strokeText(text, 128, 34);
  g.fillStyle = color; g.fillText(text, 128, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
  s.scale.set(2.6, 0.65, 1);
  return s;
}
export function flagTexture(ch, bg, fg) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 176;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 128, 176);
  g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(6, 6, 116, 164);
  g.font = 'bold 96px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = fg; g.fillText(ch, 64, 92);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------- 空間格 ----------
export class Grid {
  constructor(cell) { this.c = cell; this.m = new Map(); }
  _k(ix, iz) { return ix * 100003 + iz; }
  add(o, x, z) {
    const k = this._k(Math.floor(x / this.c), Math.floor(z / this.c));
    let a = this.m.get(k); if (!a) this.m.set(k, a = []);
    a.push(o);
  }
  addBox(o, x0, z0, x1, z1) {
    for (let ix = Math.floor(x0 / this.c); ix <= Math.floor(x1 / this.c); ix++)
      for (let iz = Math.floor(z0 / this.c); iz <= Math.floor(z1 / this.c); iz++) {
        const k = this._k(ix, iz);
        let a = this.m.get(k); if (!a) this.m.set(k, a = []);
        a.push(o);
      }
  }
  query(x, z, r, cb) {
    const c = this.c;
    for (let ix = Math.floor((x - r) / c); ix <= Math.floor((x + r) / c); ix++)
      for (let iz = Math.floor((z - r) / c); iz <= Math.floor((z + r) / c); iz++) {
        const a = this.m.get(this._k(ix, iz));
        if (a) for (let i = 0; i < a.length; i++) cb(a[i]);
      }
  }
}

// 射線 vs 球
export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = cx - ox, ly = cy - oy, lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca < 0) return -1;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  if (d2 > r * r) return -1;
  return tca - Math.sqrt(r * r - d2);
}
