// 開場動畫：現代港口倉庫的軍火交易 → 槍戰爆炸 → 太平道羅盤撕開時空裂縫 → 墜入東漢末年
import * as THREE from 'three';
import { G } from './state.js';
import { bx, cyl, ball, meshOf, rnd, clamp, lerp } from './util.js';
import { humanoid } from './models.js';
import { audio } from './audio.js';
import { updateSky, world } from './world.js';

const PI = Math.PI, END = 50.5;
const $ = id => document.getElementById(id);
const ease = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
let S = null, T = 0, active = false, done = null, fired = 0, vis = [];

// 字幕與字卡時間表（秒）
const CAPS = [
  [5.5, 12.5, '在這一行，沒人問我的名字。他們只叫我——「軍火商」。'],
  [13.2, 17.2, '這回的買家很怪：他不付錢，要拿一件古墓裡挖出來的東西，換我一整櫃軍火。'],
  [17.4, 20.8, '據說，那是東漢末年，張角用來呼風喚雨的太平道法器。'],
  [21.5, 25.5, '然後，有人開了第一槍。'],
  [29.5, 34.6, '爆炸的那一刻，羅盤亮了。藍色的裂縫，把我整個人吞了進去……'],
  [35.5, 38.8, '裂縫裡，手上的槍燙得像火——從那一刻起，彈匣再也打不完。'],
  [39.0, 41.8, '無數圖紙湧進腦海：火藥、槍管、膛線……每一樣，我都會造。'],
  [46.2, 49.6, '睜開眼時，我躺在一片陌生的荒野上。'],
];
const CARDS = [[0.8, 4.6, '西元 2026 年', '港口・私人倉庫・深夜'], [42.5, 46, '中平元年・西元 184 年', '黃巾之亂爆發的那一年']];
const BLUEPRINTS = ['硝石 75 ・ 木炭 15 ・ 硫磺 10', '雙管霰彈槍 ─ 構造圖', '步槍膛線 ─ 四條右旋', '震天雷 ─ 鐵殼＋黑火藥', '地雷 ─ 壓發引信', '彈藥 ─ 紙殼定裝彈'];

// ---------------------------------------------------------------- 場景
function buildScene() {
  const sc = new THREE.Scene();
  sc.background = new THREE.Color(0x07090f);
  sc.fog = new THREE.Fog(0x07090f, 18, 70);
  sc.add(new THREE.HemisphereLight(0x5a6a8a, 0x1a1410, 0.6));
  const lampA = new THREE.PointLight(0xffb060, 70, 26, 1.6); lampA.position.set(-3, 7.5, 0.5); sc.add(lampA);
  const lampB = new THREE.PointLight(0xffb060, 45, 24, 1.6); lampB.position.set(5, 7.5, -3); sc.add(lampB);
  const police = new THREE.PointLight(0xff2020, 0, 45, 1.3); police.position.set(-2, 3.5, 13); sc.add(police);
  const fx = new THREE.PointLight(0xffa040, 0, 40, 1.5); fx.position.set(-5.5, 2, -0.5); sc.add(fx);
  const head = new THREE.SpotLight(0xfff4d0, 90, 30, 0.5, 0.6, 1.2); head.position.set(4.3, 0.9, 0); head.target.position.set(-3, 0.6, 0); sc.add(head, head.target);

  const p = [];
  p.push(bx(60, 0.2, 60, 0x34363a, 0, -0.1, 0));
  for (let i = -3; i <= 3; i++) p.push(bx(0.15, 0.02, 40, 0xb8a030, i * 6 + 3, 0.01, 0));
  p.push(bx(48, 12, 0.6, 0x3a3e44, 0, 6, -18), bx(0.6, 12, 36, 0x3a3e44, -22, 6, 0), bx(0.6, 12, 36, 0x3a3e44, 22, 6, 0));
  for (let i = -3; i <= 3; i++) p.push(bx(0.4, 0.5, 36, 0x2a2c30, i * 7, 11.5, 0));
  for (let i = -2; i <= 2; i++) p.push(bx(4, 1.6, 0.1, 0x3a5a8a, i * 8, 9, -17.6));
  const cont = (x, y, z, c, d) => { p.push(bx(6, 2.6, 2.4, c, x, y + 1.3, z)); for (let k = -2.7; k <= 2.7; k += 0.45) p.push(bx(0.09, 2.5, 2.46, d, x + k, y + 1.3, z)); };
  cont(-13, 0, -9, 0x8a2a1e, 0x6a2016); cont(-13, 2.6, -9, 0x1e4a7a, 0x163a60); cont(-6, 0, -12, 0x2a6a3a, 0x1e502c);
  cont(13, 0, -8, 0x7a6a2a, 0x5e5020); cont(13, 2.6, -8, 0x8a2a1e, 0x6a2016); cont(12, 0, 9, 0x1e4a7a, 0x163a60);
  // 軍火箱（後方紅條為炸藥）
  for (let i = 0; i < 6; i++) { const x = -5.2 - (i % 3) * 1.25, y = Math.floor(i / 3) * 0.82, z = -0.6 + (i % 2) * 0.2; p.push(bx(1.2, 0.8, 0.85, 0x5a4a2a, x, y + 0.4, z), bx(1.22, 0.14, 0.87, i < 3 ? 0x9a1a1a : 0x3a3a2a, x, y + 0.55, z)); }
  for (let i = 0; i < 4; i++) p.push(bx(1.2, 0.8, 0.85, 0x4a5a3a, -5 - i * 1.3, 0.4, 2.2));
  for (let i = 0; i < 5; i++) p.push(bx(0.06, 0.06, 1.1, 0x1a1a1a, -5.4 + i * 0.18, 0.86, 2.2), bx(0.08, 0.12, 0.25, 0x5a3a1c, -5.4 + i * 0.18, 0.86, 2.6));
  // 交易用木箱與手提箱
  p.push(bx(1.1, 1.0, 0.8, 0x6a5030, 0.2, 0.5, 0), bx(0.72, 0.12, 0.52, 0x151515, 0.2, 1.06, 0), bx(0.72, 0.5, 0.05, 0x151515, 0.2, 1.36, -0.26));
  // 黑色轎車（車頭朝向交易點）
  p.push(bx(4.4, 0.9, 1.9, 0x111216, 6.6, 0.75, 0), bx(2.2, 0.7, 1.7, 0x15161a, 6.9, 1.5, 0), bx(2.0, 0.5, 1.72, 0x1a2a3a, 6.9, 1.55, 0));
  for (const [x, z] of [[5.2, 0.95], [5.2, -0.95], [8.0, 0.95], [8.0, -0.95]]) p.push(cyl(0.38, 0.38, 0.28, 10, 0x0a0a0a, x, 0.38, z, PI / 2));
  sc.add(meshOf(p));
  const hl = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, 0.36), new THREE.MeshBasicMaterial({ color: 0xfff6d8 }));
  for (const z of [0.62, -0.62]) { const m = hl.clone(); m.position.set(4.38, 0.85, z); sc.add(m); }

  // 人物：主角（皮夾克）、買家（西裝墨鏡）、兩名保鑣
  const SK = 0xe0b088;
  const hero = humanoid({ skin: SK, cloth: 0x18181c, pants: 0x2a3550, hat: 'short' }, null); hero.root.position.set(-1.5, 0, 0.1); hero.root.rotation.y = PI / 2; sc.add(hero.root);
  const buyer = humanoid({ skin: SK, cloth: 0x4a4a52, pants: 0x3a3a42, hat: 'short', glasses: true, tie: 0x8a1a1a }, null); buyer.root.position.set(1.9, 0, 0); buyer.root.rotation.y = -PI / 2; sc.add(buyer.root);
  const guards = [[3.6, -1.6, -1.35], [3.5, 1.7, -1.8]].map(([x, z, ry]) => { const h = humanoid({ skin: SK, cloth: 0x141416, pants: 0x141416, hat: 'short', glasses: true }, 'musket'); h.root.position.set(x, 0, z); h.root.rotation.y = ry; sc.add(h.root); return h; });
  // 太平道青銅羅盤
  const art = new THREE.Group(); art.position.set(0.2, 1.16, 0);
  const ap = [cyl(0.24, 0.24, 0.05, 18, 0x8a6a2a, 0, 0, 0), cyl(0.15, 0.15, 0.06, 18, 0x6a5020, 0, 0.01, 0)];
  for (let i = 0; i < 8; i++) { const a = i / 8 * PI * 2; ap.push(bx(0.06, 0.02, 0.02, 0xc8a050, Math.cos(a) * 0.2, 0.035, Math.sin(a) * 0.2, 0, -a)); }
  art.add(meshOf(ap));
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x40d0ff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
  const ringG = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.018, 6, 32), glowMat); ringG.rotation.x = PI / 2; art.add(ringG);
  art.add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), glowMat));
  sc.add(art);
  // 特效：槍口火光、火球、閃電、漩渦
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffe080 })); muzzle.visible = false; sc.add(muzzle);
  const fire = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), new THREE.MeshBasicMaterial({ color: 0xffb040, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); fire.visible = false; fire.position.set(-6, 1, -0.4); sc.add(fire);
  const boltGeo = new THREE.BufferGeometry(); boltGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6 * 7 * 2 * 3), 3));
  const bolts = new THREE.LineSegments(boltGeo, new THREE.LineBasicMaterial({ color: 0xc8f0ff, transparent: true, blending: THREE.AdditiveBlending })); bolts.visible = false; bolts.frustumCulled = false; sc.add(bolts);
  const vortex = new THREE.Group(); vortex.visible = false; sc.add(vortex);
  const vMats = [0x3a7aff, 0x9a4aff, 0x40e0ff].map(c => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  for (let i = 0; i < 3; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06 + i * 0.03, 8, 48), vMats[i]); r.userData.k = 1 - i * 0.22; vortex.add(r); }
  const vDisc = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ color: 0x1a3aaa, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); vortex.add(vDisc);

  // 時空隧道（放在遠處，同一個場景）
  const tunnel = new THREE.Group(); tunnel.position.set(0, 0, -3000); tunnel.visible = false; sc.add(tunnel);
  const rings = [];
  for (let i = 0; i < 26; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.07, 6, 40), vMats[i % 3]); r.position.z = -i * 6; tunnel.add(r); rings.push(r); }
  const sp = new Float32Array(240 * 6);
  for (let i = 0; i < 240; i++) { const a = rnd(PI * 2), r = rnd(1.5, 3.4), z = -rnd(0, 156); sp.set([Math.cos(a) * r, Math.sin(a) * r, z, Math.cos(a) * r, Math.sin(a) * r, z - rnd(2, 6)], i * 6); }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const streaks = new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ color: 0xa8d8ff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending })); streaks.frustumCulled = false; tunnel.add(streaks);
  const gun = meshOf([bx(0.05, 0.06, 0.27, 0x8a8e98, 0, 0, -0.06), bx(0.052, 0.02, 0.2, 0xb0b4be, 0, 0.03, -0.05), bx(0.045, 0.14, 0.065, 0x3a3a40, 0, -0.09, 0.05, 0.22), bx(0.012, 0.018, 0.012, 0xffffff, 0, 0.048, -0.18)]);
  gun.scale.setScalar(3.2); tunnel.add(gun);
  const gunGlow = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.95, 40), new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); tunnel.add(gunGlow);
  return { sc, police, fx, head, lampA, lampB, hero, buyer, guards, art, ringG, glowMat, muzzle, fire, bolts, vortex, vDisc, tunnel, rings, streaks, gun, gunGlow };
}

// ---------------------------------------------------------------- 畫面疊加（字幕、字卡、閃光、眨眼）
let capKey = null, cardKey = null;
function overlay(t) {
  const c = CAPS.find(([a, b]) => t >= a && t < b);
  const el = $('intro-cap');
  if (c) {
    const n = Math.floor((t - c[0]) * 22); // 打字效果
    el.textContent = c[2].slice(0, Math.min(c[2].length, n + 1)); el.classList.add('show');
  } else el.classList.remove('show');
  const k = CARDS.find(([a, b]) => t >= a && t < b);
  if ((k && k[2]) !== cardKey) { cardKey = k && k[2]; if (k) { $('intro-card1').textContent = k[2]; $('intro-card2').textContent = k[3]; } $('intro-card').classList.toggle('show', !!k); }
}
function flash(color, a) { const f = $('intro-flash'); f.style.background = color; f.style.opacity = a; }
function eyes(closed) { const v = clamp(closed, 0, 1) * 50; $('intro-eyes').style.setProperty('--e', v + 'vh'); }
function blueprint(i) {
  const d = document.createElement('div'); d.className = 'bp'; d.textContent = BLUEPRINTS[i % BLUEPRINTS.length];
  d.style.left = rnd(8, 62) + 'vw'; d.style.top = rnd(18, 68) + 'vh'; $('intro-bp').appendChild(d);
  setTimeout(() => d.remove(), 2600);
}

// ---------------------------------------------------------------- 時間軸
const V = new THREE.Vector3(), L = new THREE.Vector3(), Q = new THREE.Quaternion(), M4 = new THREE.Matrix4(), UP = new THREE.Vector3(0, 1, 0);
const EV = [
  [0.3, () => audio.play('hum', 1)], [4.8, () => audio.play('hum', 1)], [10, () => audio.play('hum', 0.8)],
  [21.0, () => audio.play('siren', 0.9)], [22.2, () => shoot(0)], [22.9, () => shoot(1)], [23.4, () => shoot(0)], [24.1, () => audio.play('pistol', 0.9)], [24.6, () => shoot(1)], [25.3, () => shoot(0)],
  [26.8, () => { audio.play('explosion', 1.2); audio.play('explosion', 0.8); S.shake = 1.2; }],
  [29.4, () => audio.play('thunder', 0.9)], [31, () => audio.play('thunder', 0.7)], [33.2, () => audio.play('whoosh', 1)],
  [35, () => audio.play('whoosh', 0.8)], [39.1, () => blueprint(0)], [39.6, () => blueprint(1)], [40.1, () => blueprint(2)], [40.6, () => blueprint(3)], [41.0, () => blueprint(4)], [41.4, () => blueprint(5)],
  [42.0, () => { $('intro-bp').innerHTML = ''; }], [42.2, () => audio.play('quest', 0.8)],
];
function shoot(i) { const g = S.guards[i]; g.armR.rotation.x = -1.55; S.muzzleT = 0.06; S.muzzleAt = i; audio.play('rifle', 0.8); S.shake = Math.max(S.shake, 0.25); }

function look(cam, eye, target) { cam.position.copy(eye); cam.quaternion.setFromRotationMatrix(M4.lookAt(eye, target, UP)); }
function updateBolts(c, r0, r1) {
  const a = S.bolts.geometry.attributes.position.array; let k = 0;
  for (let b = 0; b < 6; b++) {
    const th = rnd(PI * 2), ph = rnd(-0.6, 1.0), R = rnd(r0, r1);
    let px = c.x, py = c.y, pz = c.z;
    for (let s = 1; s <= 7; s++) {
      const f = s / 7, nx = c.x + Math.cos(th) * Math.cos(ph) * R * f + rnd(-0.25, 0.25), ny = c.y + Math.sin(ph) * R * f + rnd(-0.25, 0.25), nz = c.z + Math.sin(th) * Math.cos(ph) * R * f + rnd(-0.25, 0.25);
      a[k++] = px; a[k++] = py; a[k++] = pz; a[k++] = nx; a[k++] = ny; a[k++] = nz; px = nx; py = ny; pz = nz;
    }
  }
  S.bolts.geometry.attributes.position.needsUpdate = true;
}

export function updateIntro(dt) {
  if (!active) return;
  T += dt;
  const t = T, cam = G.camera;
  while (fired < EV.length && EV[fired][0] <= t) EV[fired++][1]();
  overlay(t);
  S.shake = Math.max(0, (S.shake || 0) - dt * 1.4);
  S.ringG.material.opacity = 0.45 + 0.3 * Math.sin(t * 4);
  // 保鑣射擊後手臂放下、槍口火光
  if (S.muzzleT > 0) { S.muzzleT -= dt; const g = S.guards[S.muzzleAt]; g.armR.getWorldPosition(V); S.muzzle.position.set(V.x - 1.0, V.y - 0.05, V.z); S.muzzle.visible = true; S.fx.position.copy(S.muzzle.position); S.fx.color.set(0xffd080); S.fx.intensity = 60; }
  else { S.muzzle.visible = false; if (t < 26.5) S.fx.intensity = 0; }
  for (const g of S.guards) g.armR.rotation.x += (-0.35 - g.armR.rotation.x) * Math.min(1, dt * 1.5);

  if (t < 42) { // ---------- 倉庫與隧道（開場場景）
    G.renderScene = S.sc;
    S.police.intensity = t > 20.8 && t < 35 ? 70 * (Math.sin(t * 9) > 0 ? 1 : 0.15) : 0;
    S.police.color.set(Math.sin(t * 4.5) > 0 ? 0xff2020 : 0x2040ff);
    if (t < 5) { look(cam, V.set(-14, 3.2, 10), L.set(0, 1.4, 0)); flash('#000', 1 - seg(t, 4.2, 5)); }
    else if (t < 13) { const k = ease(seg(t, 5, 13)); look(cam, V.set(lerp(-14, -6.5, k), lerp(3.2, 2.3, k), lerp(10, 5.5, k)), L.set(0.5, 1.3, 0)); flash('#000', 0); }
    else if (t < 21) { const k = ease(seg(t, 13, 21)); look(cam, V.set(lerp(-1.1, -0.55, k), lerp(1.95, 1.55, k), lerp(1.7, 0.85, k)), L.set(0.2, 1.15, 0)); S.buyer.armR.rotation.x = -0.35 - 0.6 * Math.sin(seg(t, 14, 17) * PI); }
    else if (t < 26.5) { look(cam, V.set(-3.4, 2.0, 1.6), L.set(3, 1.4, -0.2)); S.hero.armR.rotation.x = t > 23.8 ? -1.5 : -0.35; }
    else if (t < 29.2) { // 流彈引爆炸藥箱
      look(cam, V.set(-10, 4, 9), L.set(-5.5, 1, -0.4));
      const k = seg(t, 26.8, 29.2);
      S.fire.visible = t >= 26.8; S.fire.scale.setScalar(0.5 + ease(k) * 7); S.fire.material.opacity = 1 - k * 0.8; S.fire.material.color.set(k < 0.3 ? 0xffe8a0 : 0xff6a20);
      S.fx.color.set(0xff8030); S.fx.position.set(-6, 2, -0.4); S.fx.intensity = t >= 26.8 ? 400 * (1 - k) : 0;
      flash('#fff', t >= 26.8 ? Math.max(0, 1 - (t - 26.8) * 2) : 0);
    } else if (t < 35) { // 羅盤發光、閃電、漩渦張開
      S.fire.visible = false; flash('#fff', 0);
      const k = seg(t, 29.2, 33.4), push = ease(seg(t, 33.4, 35));
      S.art.position.y = 1.16 + ease(k) * 1.3; S.art.rotation.y += dt * (2 + k * 14); S.art.rotation.x = k * 1.2;
      const c = S.art.position;
      S.bolts.visible = true; if (Math.floor(t * 16) !== S.bf) { S.bf = Math.floor(t * 16); updateBolts(c, 1, 2 + k * 3); }
      S.vortex.visible = t > 30.4; S.vortex.position.copy(c); S.vortex.lookAt(cam.position);
      const vr = ease(seg(t, 30.4, 34)) * 6 + 0.2;
      S.vortex.children.forEach((r, i) => { r.scale.setScalar(vr * (r.userData.k || 1)); r.rotation.z += dt * (1.5 + i); });
      S.fx.color.set(0x60a0ff); S.fx.position.copy(c); S.fx.intensity = 80 + k * 200;
      const eye = V.set(lerp(-2.6, c.x, push), lerp(1.8, c.y, push), lerp(3.6, c.z + 0.3, push));
      look(cam, eye, L.copy(c)); flash('#bfe8ff', push * 0.9);
    } else { // 時空隧道
      S.bolts.visible = false; S.vortex.visible = false; S.tunnel.visible = true;
      flash('#bfe8ff', Math.max(0, 0.9 - (t - 35) * 1.5) + seg(t, 41.4, 42) * 1);
      const z = -(t - 35) * 18, tp = S.tunnel.position;
      cam.position.set(tp.x + Math.sin(t * 1.3) * 0.3, tp.y + Math.cos(t * 1.1) * 0.3, tp.z + z);
      cam.quaternion.setFromAxisAngle(V.set(0, 0, 1), t * 0.35);
      for (const r of S.rings) { if (tp.z + r.position.z > cam.position.z + 2) r.position.z -= 156; r.rotation.z += dt * 0.5; }
      S.gun.position.set(0, 0, z - 4); S.gun.rotation.set(0.3 * Math.sin(t), t * 1.4, 0.2);
      S.gunGlow.position.copy(S.gun.position); S.gunGlow.rotation.z = t; S.gunGlow.scale.setScalar(1 + 0.12 * Math.sin(t * 8)); S.gunGlow.material.opacity = 0.35 + 0.25 * Math.sin(t * 8);
      S.fx.color.set(0xd8ecff); S.fx.position.set(tp.x + 1, tp.y + 1.5, tp.z + z - 2.5); S.fx.intensity = 60;
    }
    if (S.shake > 0) cam.position.add(V.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(S.shake * 0.12));
  } else { // ---------- 降落到東漢的荒野（遊戲世界）
    G.renderScene = null;
    const P = G.player, k = ease(seg(t, 42, 47.5));
    const ex = P.pos.x, ey = P.pos.y + P.eyeH, ez = P.pos.z;
    const pr = world.portal ? world.portal.position : L.set(ex - 5, ey, ez - 4);
    const eye = V.set(lerp(ex + 40, ex, k), lerp(ey + 130, ey, k), lerp(ez + 90, ez, k));
    if (k < 1) look(cam, eye, L.copy(pr).lerp(V.clone().set(ex - Math.sin(P.yaw) * 10, ey + P.pitch * 10, ez - Math.cos(P.yaw) * 10), k));
    else { cam.position.copy(eye); cam.rotation.set(P.pitch, P.yaw, 0); }
    updateSky(dt, cam.position);
    flash('#bfe8ff', Math.max(0, 1 - (t - 42) * 1.2));
    // 眨眼：47.6 閉上、49 睜一半、49.4 閉、50 睜開
    eyes(t < 47.6 ? seg(t, 46.8, 47.6) : t < 48.6 ? 1 : t < 49.0 ? 1 - seg(t, 48.6, 49.0) * 0.6 : t < 49.4 ? 0.4 + seg(t, 49.0, 49.4) * 0.6 : 1 - seg(t, 49.6, 50.3));
  }
  cam.updateMatrixWorld(); // 相機掛在主場景下，渲染開場場景時要手動更新矩陣
  if (t >= END) finish();
}

// ---------------------------------------------------------------- 開始／結束
export function playIntro(cb) {
  if (!S) S = buildScene();
  T = 0; fired = 0; done = cb; active = true; capKey = cardKey = null;
  S.art.position.set(0.2, 1.16, 0); S.art.rotation.set(0, 0, 0); S.tunnel.visible = false; S.vortex.visible = false; S.fire.visible = false; S.bolts.visible = false;
  for (const r of S.rings) r.position.z = -S.rings.indexOf(r) * 6;
  vis = G.camera.children.map(c => [c, c.visible]); for (const c of G.camera.children) c.visible = false;
  G.menu = 'intro'; document.body.classList.add('intro-on'); $('intro').classList.remove('hidden');
  flash('#000', 1); eyes(0); $('intro-bp').innerHTML = '';
}
function finish() {
  if (!active) return;
  active = false; G.renderScene = null;
  for (const [c, v] of vis) c.visible = v;
  $('intro').classList.add('hidden'); document.body.classList.remove('intro-on');
  if (G.menu === 'intro') G.menu = null; // 不要蓋掉其他已開啟的選單
  const cb = done; done = null; if (cb) cb();
}
export const introActive = () => active;
export function skipIntro() { if (active) finish(); }
export const introTime = () => T;
