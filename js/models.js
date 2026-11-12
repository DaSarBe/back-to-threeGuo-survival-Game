import * as THREE from 'three';
import { bx, cyl, cone, ball, meshOf, MAT, merge } from './util.js';

const STEEL = 0xc8ccd4, WOODC = 0x6a4a2a, GOLD = 0xd4af37, DARK = 0x1c1c1c;
const PI = Math.PI;

// ---------- 兵器（刃朝 +Y，握把在原點） ----------
export function weaponParts(kind) {
  const p = [];
  switch (kind) {
    case 'dao': // 環首刀：直刃、單面開鋒、柄尾有環
      p.push(bx(0.04, 0.24, 0.04, 0x3a2a1a, 0, 0, 0));
      p.push(part_torus(0.05, 0.012, GOLD, 0, -0.17, 0));
      p.push(bx(0.09, 0.025, 0.05, GOLD, 0, 0.13, 0));
      p.push(bx(0.012, 0.85, 0.055, STEEL, 0, 0.57, 0));
      p.push(bx(0.012, 0.08, 0.035, STEEL, 0, 1.03, -0.01, 0.5));
      break;
    case 'sword': // 漢劍
      p.push(bx(0.035, 0.22, 0.035, 0x5a1a1a, 0, 0, 0));
      p.push(bx(0.04, 0.05, 0.04, GOLD, 0, -0.13, 0));
      p.push(bx(0.16, 0.03, 0.05, GOLD, 0, 0.12, 0));
      p.push(bx(0.045, 0.9, 0.012, STEEL, 0, 0.58, 0));
      p.push(cone(0.03, 0.1, 4, STEEL, 0, 1.08, 0));
      break;
    case 'spear':
      p.push(cyl(0.025, 0.025, 2.5, 6, WOODC, 0, 0.5, 0));
      p.push(cone(0.05, 0.3, 4, STEEL, 0, 1.9, 0));
      p.push(cone(0.08, 0.16, 6, 0xc02020, 0, 1.68, 0, PI));
      break;
    case 'snake': // 丈八蛇矛
      p.push(cyl(0.028, 0.028, 2.6, 6, 0x2a1a1a, 0, 0.5, 0));
      for (let i = 0; i < 5; i++) p.push(bx(0.014, 0.13, 0.07, STEEL, 0, 1.86 + i * 0.11, (i % 2 ? 0.035 : -0.035), (i % 2 ? -0.5 : 0.5)));
      p.push(cone(0.04, 0.16, 4, STEEL, 0, 2.46, 0));
      p.push(cone(0.08, 0.14, 6, 0x202020, 0, 1.74, 0, PI));
      break;
    case 'guandao': // 青龍偃月刀
      p.push(cyl(0.03, 0.03, 2.3, 6, 0x4a2a1a, 0, 0.45, 0));
      p.push(cyl(0.045, 0.045, 0.1, 6, GOLD, 0, 1.6, 0));
      p.push(bx(0.02, 0.62, 0.2, STEEL, 0, 1.95, 0.06));
      p.push(bx(0.02, 0.3, 0.16, STEEL, 0, 2.3, 0.0, -0.45));
      p.push(bx(0.022, 0.5, 0.04, 0x1f7a4a, 0, 1.92, -0.05));
      p.push(cone(0.04, 0.14, 4, STEEL, 0, -0.76, 0, PI));
      break;
    case 'ji': // 方天畫戟
      p.push(cyl(0.03, 0.03, 2.5, 6, 0x5a1a1a, 0, 0.5, 0));
      p.push(cone(0.05, 0.42, 4, STEEL, 0, 1.96, 0));
      for (const s of [-1, 1]) {
        p.push(bx(0.016, 0.34, 0.07, STEEL, 0, 1.66, s * 0.17));
        p.push(bx(0.016, 0.05, 0.14, STEEL, 0, 1.58, s * 0.09));
        p.push(bx(0.016, 0.05, 0.14, STEEL, 0, 1.74, s * 0.09));
      }
      p.push(cone(0.09, 0.18, 6, 0xc02020, 0, 1.42, 0, PI));
      p.push(cyl(0.04, 0.04, 0.08, 6, GOLD, 0, 1.5, 0));
      break;
    case 'bow': {
      const g = new THREE.TorusGeometry(0.62, 0.02, 4, 12, PI * 0.8);
      g.rotateZ(-PI * 0.4); g.rotateY(-PI / 2); // 弧面落在 YZ 平面，凸向 +Z
      p.push(colorize(g, 0x5a3a1a, 0, 0, -0.5));
      p.push(bx(0.008, 1.16, 0.008, 0xddddcc, 0, 0, -0.31));
      break;
    }
    case 'shield': // 圓盾（持於左臂）
      p.push(cyl(0.34, 0.34, 0.05, 10, 0x7a1a14, 0, 0.1, 0));
      p.push(cyl(0.36, 0.36, 0.03, 10, 0xd4af37, 0, 0.08, 0));
      p.push(ball(0.07, 0xd4af37, 0, 0.14, 0));
      break;
    case 'musket': // 火銃（敵軍仿造的火器）
      p.push(bx(0.06, 0.5, 0.08, 0x5a3a1c, 0, -0.05, 0.02));
      p.push(cyl(0.022, 0.022, 1.15, 6, 0x2a2a2e, 0, 0.75, 0.04));
      p.push(bx(0.05, 0.1, 0.06, 0x3a3a40, 0, 0.2, 0.06));
      break;
    case 'qixing': case 'qinggang': case 'yitian': { // 寶劍：七星（金）、青釭（青）、倚天（白）
      const blade = kind === 'qinggang' ? 0x8ad0e0 : kind === 'yitian' ? 0xf0f0f8 : 0xd8d8e0;
      const guard = kind === 'qixing' ? GOLD : kind === 'qinggang' ? 0x2a6a7a : 0x8a8a9a;
      p.push(bx(0.035, 0.24, 0.035, 0x2a1a10, 0, 0, 0), bx(0.05, 0.05, 0.05, guard, 0, -0.14, 0), bx(0.18, 0.035, 0.06, guard, 0, 0.13, 0));
      p.push(bx(0.05, 0.98, 0.012, blade, 0, 0.63, 0), cone(0.035, 0.12, 4, blade, 0, 1.18, 0));
      if (kind === 'qixing') for (let i = 0; i < 7; i++) p.push(bx(0.016, 0.016, 0.016, 0xffe060, 0, 0.25 + i * 0.12, 0.008));
      break;
    }
    case 'tbow': {
      const g = new THREE.TorusGeometry(0.66, 0.026, 4, 12, PI * 0.8);
      g.rotateZ(-PI * 0.4); g.rotateY(-PI / 2);
      p.push(colorize(g, 0x3a3a40, 0, 0, -0.52), bx(0.009, 1.24, 0.009, 0xddddcc, 0, 0, -0.33), bx(0.06, 0.16, 0.06, 0x8a1a1a, 0, 0, 0.12));
      break;
    }
    case 'staff': // 九節杖
      p.push(cyl(0.03, 0.03, 2.1, 6, 0x6a5a2a, 0, 0.4, 0));
      for (let i = 0; i < 4; i++) p.push(cyl(0.045, 0.045, 0.05, 6, GOLD, 0, 0.9 + i * 0.16, 0));
      p.push(ball(0.09, 0xf0e060, 0, 1.52, 0));
      break;
  }
  return p;
}
function colorize(g, color, x, y, z) {
  const gg = g.index ? g.toNonIndexed() : g;
  gg.translate(x, y, z);
  const n = gg.attributes.position.count, c = new Float32Array(n * 3), col = new THREE.Color(color);
  for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
  gg.setAttribute('color', new THREE.BufferAttribute(c, 3));
  gg.deleteAttribute('uv');
  return gg;
}
function part_torus(r, t, color, x, y, z) {
  const g = new THREE.TorusGeometry(r, t, 4, 8); g.rotateY(PI / 2);
  return colorize(g, color, x, y, z);
}
export function weaponModel(kind) {
  const p = weaponParts(kind);
  return p.length ? meshOf(p) : null;
}

// ---------- 人形 ----------
export function humanoid(look, weapon, weapon2, scale = 1) {
  const root = new THREE.Group(); root.rotation.order = 'YXZ';
  const inner = new THREE.Group(); inner.scale.setScalar(scale); root.add(inner);
  const skin = look.skin || 0xf0c8a0, cloth = look.cloth, pants = look.pants || 0x3a3530;
  const hair = 0x151515;
  const w = look.fat ? 0.8 : 0.55, dp = look.fat ? 0.56 : 0.3;
  const b = [];
  b.push(bx(w, 0.65, dp, cloth, 0, 1.125, 0));
  b.push(bx(w + 0.03, 0.34, dp + 0.03, cloth, 0, 0.72, 0)); // 下襬
  b.push(bx(w + 0.06, 0.07, dp + 0.06, look.armor ? GOLD : 0x2a1a10, 0, 0.87, 0));
  if (look.armor !== undefined) {
    b.push(bx(w + 0.05, 0.46, dp + 0.05, look.armor, 0, 1.2, 0));
    for (const s of [-1, 1]) b.push(bx(0.22, 0.1, dp + 0.08, look.armor, s * (w / 2 + 0.09), 1.44, 0));
    for (let i = 0; i < 3; i++) b.push(bx(w + 0.07, 0.02, dp + 0.07, 0x101010, 0, 1.06 + i * 0.13, 0));
  }
  // 頭
  b.push(bx(0.3, 0.32, 0.3, skin, 0, 1.62, 0));
  b.push(bx(0.05, 0.035, 0.02, DARK, -0.075, 1.66, 0.151));
  b.push(bx(0.05, 0.035, 0.02, DARK, 0.075, 1.66, 0.151));
  b.push(bx(0.32, 0.26, 0.05, hair, 0, 1.64, -0.15));
  const hc = look.hatColor || hair;
  switch (look.hat) {
    case 'turban':
      b.push(bx(0.34, 0.12, 0.34, hc, 0, 1.77, 0));
      b.push(bx(0.08, 0.2, 0.04, hc, 0.1, 1.66, -0.19, 0.2));
      b.push(bx(0.12, 0.1, 0.12, hair, 0, 1.87, 0));
      break;
    case 'helmet': case 'feather':
      b.push(bx(0.35, 0.17, 0.35, hc, 0, 1.79, 0));
      b.push(bx(0.37, 0.2, 0.06, hc, 0, 1.62, -0.18));
      b.push(cone(0.06, 0.2, 6, look.crest || 0xb02020, 0, 1.97, 0));
      if (look.hat === 'feather') for (const s of [-1, 1]) { // 雉雞翎
        b.push(bx(0.03, 0.95, 0.03, 0xb03020, s * 0.14, 2.28, -0.22, -0.55, 0, s * -0.25));
        b.push(bx(0.035, 0.2, 0.035, 0xf0e0c0, s * 0.245, 2.66, -0.46, -0.55, 0, s * -0.25));
      }
      break;
    case 'crown':
      b.push(bx(0.32, 0.06, 0.32, hair, 0, 1.8, 0));
      b.push(bx(0.2, 0.14, 0.2, hc, 0, 1.89, 0));
      b.push(bx(0.36, 0.02, 0.5, hc, 0, 1.97, 0));
      break;
    case 'cap':
      b.push(bx(0.34, 0.14, 0.34, hc, 0, 1.8, 0));
      b.push(bx(0.2, 0.16, 0.2, hc, 0, 1.9, -0.06));
      b.push(bx(0.3, 0.3, 0.04, hc, 0, 1.6, -0.19));
      break;
    case 'guan':
      b.push(bx(0.32, 0.06, 0.32, hair, 0, 1.8, 0));
      b.push(bx(0.16, 0.18, 0.22, hc, 0, 1.9, -0.02));
      b.push(bx(0.4, 0.015, 0.02, hc, 0, 1.9, 0));
      break;
    case 'short': // 現代短髮（開場動畫用）
      b.push(bx(0.33, 0.09, 0.33, hair, 0, 1.8, 0));
      break;
    default: // 髮髻
      b.push(bx(0.32, 0.06, 0.32, hair, 0, 1.8, 0));
      b.push(bx(0.11, 0.13, 0.11, hair, 0, 1.88, -0.03));
  }
  if (look.glasses) b.push(bx(0.27, 0.06, 0.03, 0x0a0a0a, 0, 1.66, 0.155));
  if (look.tie) { b.push(bx(0.16, 0.5, 0.02, 0xe8e8e8, 0, 1.2, look.fat ? 0.29 : 0.16)); b.push(bx(0.05, 0.4, 0.025, look.tie, 0, 1.18, look.fat ? 0.3 : 0.17)); }
  const bc = look.beardColor || hair;
  if (look.beard === 'long') { b.push(bx(0.22, 0.14, 0.06, bc, 0, 1.5, 0.16)); b.push(bx(0.16, 0.4, 0.05, bc, 0, 1.28, 0.2)); }
  else if (look.beard === 'bushy') { b.push(bx(0.34, 0.18, 0.1, bc, 0, 1.5, 0.13)); b.push(bx(0.06, 0.2, 0.3, bc, -0.16, 1.56, 0)); b.push(bx(0.06, 0.2, 0.3, bc, 0.16, 1.56, 0)); }
  else if (look.beard === 'short') { b.push(bx(0.2, 0.09, 0.05, bc, 0, 1.49, 0.155)); b.push(bx(0.06, 0.12, 0.04, bc, 0, 1.42, 0.16)); }
  if (look.cape !== undefined) b.push(bx(w + 0.12, 1.05, 0.04, look.cape, 0, 0.95, -dp / 2 - 0.09, 0.13));
  const body = meshOf(b, true); inner.add(body);

  const mkArm = (s) => {
    const m = meshOf([bx(0.16, 0.66, 0.16, look.armor !== undefined ? look.armor : cloth, 0, -0.3, 0), bx(0.12, 0.12, 0.12, skin, 0, -0.66, 0)], true);
    m.position.set(s * (w / 2 + 0.09), 1.42, 0); inner.add(m); return m;
  };
  const mkLeg = (s) => {
    const m = meshOf([bx(0.22, 0.66, 0.22, pants, 0, -0.33, 0), bx(0.23, 0.16, 0.3, 0x1a1410, 0, -0.72, 0.03)], true);
    m.position.set(s * 0.14, 0.8, 0); inner.add(m); return m;
  };
  const armL = mkArm(-1), armR = mkArm(1), legL = mkLeg(-1), legR = mkLeg(1);
  let wm = null;
  if (weapon) { wm = weaponModel(weapon); wm.position.set(0, -0.66, 0.03); wm.rotation.x = PI / 2; armR.add(wm); }
  if (weapon2) { const w2 = weaponModel(weapon2); w2.position.set(0, -0.66, 0.03); w2.rotation.x = PI / 2; armL.add(w2); }
  armR.rotation.x = -0.35; armL.rotation.x = weapon2 ? -0.35 : 0;
  return { root, inner, body, armL, armR, legL, legR, weapon: wm };
}

// ---------- 四足動物 ----------
export function quadruped(o) {
  const root = new THREE.Group(); root.rotation.order = 'YXZ';
  const inner = new THREE.Group(); inner.scale.setScalar(o.scale || 1); root.add(inner);
  const c = o.color, d = o.dark;
  const b = [];
  b.push(bx(0.62, 0.66, 1.7, c, 0, 1.22, 0));
  if (o.kind === 'wolf') {
    b.push(bx(0.34, 0.4, 0.5, c, 0, 1.4, 1.0, 0.2));
    b.push(bx(0.34, 0.36, 0.5, c, 0, 1.45, 1.35));
    b.push(bx(0.2, 0.2, 0.36, d, 0, 1.38, 1.7));
    for (const s of [-1, 1]) b.push(cone(0.08, 0.22, 4, d, s * 0.12, 1.72, 1.2));
    b.push(bx(0.16, 0.16, 0.9, d, 0, 1.2, -1.2, 0.5));
  } else {
    b.push(bx(0.3, 0.85, 0.38, c, 0, 1.72, 0.88, 0.6));
    b.push(bx(0.26, 0.32, 0.62, c, 0, 2.08, 1.3, 0.35));
    b.push(bx(0.2, 0.2, 0.2, d, 0, 1.98, 1.58, 0.35));
    for (const s of [-1, 1]) b.push(cone(0.05, 0.16, 4, c, s * 0.09, 2.3, 1.12));
    if (o.kind === 'deer') {
      for (const s of [-1, 1]) { b.push(bx(0.03, 0.5, 0.03, 0xd8c8a0, s * 0.12, 2.5, 1.1, 0, 0, s * -0.4)); b.push(bx(0.03, 0.25, 0.03, 0xd8c8a0, s * 0.24, 2.6, 1.16, 0.6, 0, s * -0.4)); }
      b.push(bx(0.14, 0.2, 0.14, 0xf0f0e8, 0, 1.4, -0.9));
    } else {
      b.push(bx(0.08, 0.8, 0.26, d, 0, 1.86, 0.72, 0.6));  // 鬃毛
      b.push(bx(0.13, 0.85, 0.13, d, 0, 1.0, -0.95, -0.25)); // 尾
      if (o.saddle) {
        b.push(bx(0.66, 0.06, 0.9, o.blanket || 0x8a1a1a, 0, 1.57, -0.05));
        b.push(bx(0.5, 0.12, 0.55, 0x4a2a14, 0, 1.63, -0.05));
        b.push(bx(0.5, 0.14, 0.08, 0x4a2a14, 0, 1.7, 0.22));
        b.push(bx(0.5, 0.14, 0.08, 0x4a2a14, 0, 1.7, -0.32));
      }
    }
  }
  const body = meshOf(b, true); inner.add(body);
  const legs = [];
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const m = meshOf([bx(0.16, 0.82, 0.16, c, 0, -0.41, 0), bx(0.17, 0.12, 0.18, d, 0, -0.87, 0)], true);
    m.position.set(sx * 0.21, 0.93, sz * 0.62); inner.add(m); legs.push(m);
  }
  return { root, inner, body, legs };
}

// ---------- 第一人稱武器模型（鏡頭空間，前方為 -Z） ----------
const SLEEVE = 0x2b3a55, HAND = 0x2c2c30; // 戰術手套
export function viewModel(kind) {
  const p = [];
  const hand = () => { p.push(bx(0.09, 0.1, 0.12, HAND, 0, -0.1, 0.06)); p.push(bx(0.12, 0.12, 0.5, SLEEVE, 0.02, -0.15, 0.36, -0.15)); };
  switch (kind) {
    case 'pistol':
      p.push(bx(0.05, 0.06, 0.27, 0x4a4c54, 0, 0, -0.06));
      p.push(bx(0.052, 0.02, 0.2, 0x6a6c76, 0, 0.03, -0.05));
      p.push(bx(0.045, 0.14, 0.065, 0x2a2a2e, 0, -0.09, 0.05, 0.22));
      p.push(bx(0.01, 0.018, 0.012, 0xdddddd, 0, 0.048, -0.18));
      p.push(bx(0.03, 0.018, 0.012, 0x111111, 0, 0.048, 0.06));
      hand();
      break;
    case 'shotgun':
      for (const s of [-1, 1]) p.push(cyl(0.02, 0.02, 0.78, 8, 0x2a2a2e, s * 0.021, 0.01, -0.42, PI / 2));
      p.push(bx(0.07, 0.08, 0.22, 0x3a3a3e, 0, 0, 0.02));
      p.push(bx(0.065, 0.06, 0.26, 0x5a3a1c, 0, -0.035, -0.3));
      p.push(bx(0.06, 0.1, 0.36, 0x5a3a1c, 0, -0.04, 0.3, -0.12));
      hand();
      break;
    case 'rifle':
      p.push(cyl(0.014, 0.014, 0.9, 8, 0x25262a, 0, 0.012, -0.5, PI / 2));
      p.push(bx(0.055, 0.07, 0.6, 0x5a3a1c, 0, -0.03, -0.1));
      p.push(bx(0.05, 0.05, 0.2, 0x303236, 0, 0.02, 0.05));
      p.push(bx(0.055, 0.11, 0.38, 0x5a3a1c, 0, -0.05, 0.36, -0.12));
      p.push(cyl(0.025, 0.025, 0.3, 8, 0x111114, 0, 0.085, -0.02, PI / 2));
      p.push(cyl(0.032, 0.025, 0.05, 8, 0x111114, 0, 0.085, -0.19, PI / 2));
      p.push(bx(0.02, 0.04, 0.02, 0x111114, 0, 0.05, -0.08));
      p.push(bx(0.02, 0.04, 0.02, 0x111114, 0, 0.05, 0.06));
      hand();
      break;
    case 'smg': // 凱式特製步槍：短槍管、直彈匣、槍口制退器
      p.push(cyl(0.017, 0.017, 0.5, 8, 0x25262a, 0, 0.012, -0.36, PI / 2), cyl(0.026, 0.026, 0.08, 8, 0x1a1a1e, 0, 0.012, -0.62, PI / 2));
      p.push(bx(0.06, 0.08, 0.42, 0x3a3c44, 0, -0.01, -0.02), bx(0.05, 0.2, 0.06, 0x1a1a1e, 0, -0.14, -0.1, 0.15), bx(0.05, 0.12, 0.06, 0x2a2a2e, 0, -0.1, 0.12, 0.25));
      p.push(bx(0.045, 0.07, 0.26, 0x5a3a1c, 0, -0.03, 0.3), bx(0.02, 0.04, 0.12, 0x40d8ff, 0, 0.05, -0.05));
      hand();
      break;
    case 'grenade':
      p.push(ball(0.06, 0x2a2a2a, 0, 0, 0));
      break;
    default: { // 冷兵器
      const g = new THREE.Group();
      const m = weaponModel(kind); g.add(m);
      const h = meshOf([bx(0.09, 0.12, 0.1, HAND, 0, 0, 0.02), bx(0.12, 0.5, 0.12, SLEEVE, 0.02, -0.3, 0.1, -0.3)]);
      g.add(h);
      g.userData.cold = true;
      return g;
    }
  }
  const g = new THREE.Group(); g.add(new THREE.Mesh(merge(p), MAT));
  return g;
}
