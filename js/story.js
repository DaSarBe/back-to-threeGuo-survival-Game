// 劇情動畫（在遊戲世界中播放）：呂布陣亡 → 阿凱穿越登場；歸途之門
import * as THREE from 'three';
import { G } from './state.js';
import { world, heightAt, SITES, updateSky } from './world.js';
import { weaponModel } from './models.js';
import { audio } from './audio.js';
import { clamp, lerp } from './util.js';
import { spawnAkai, AK } from './akai.js';

const PI = Math.PI, $ = id => document.getElementById(id);
const ease = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
const M4 = new THREE.Matrix4(), UP = new THREE.Vector3(0, 1, 0), V = new THREE.Vector3(), L = new THREE.Vector3();
let cur = null, vis = [];

function look(eye, target) { const c = G.camera; c.position.copy(eye); c.quaternion.setFromRotationMatrix(M4.lookAt(eye, target, UP)); }
function cap(text) { const el = $('intro-cap'); if (text) { if (el.dataset.t !== text) { el.dataset.t = text; el.textContent = text; } el.classList.add('show'); } else { el.classList.remove('show'); el.dataset.t = ''; } }
function card(a, b) { $('intro-card').classList.toggle('show', !!a); if (a) { $('intro-card1').textContent = a; $('intro-card2').textContent = b || ''; } }
function flash(color, a) { const f = $('intro-flash'); f.style.background = color; f.style.opacity = a; }
function timed(list, t) { const c = list.find(([a, b]) => t >= a && t < b); return c ? c[2] : null; }

function play(s) {
  cur = { ...s, t: 0 };
  vis = G.camera.children.map(c => [c, c.visible]); for (const c of G.camera.children) c.visible = false;
  G.ui.prompt(null); G.menu = 'story'; document.body.classList.add('intro-on'); $('intro').classList.remove('hidden');
  $('intro-eyes').style.setProperty('--e', '0vh'); $('intro-bp').innerHTML = ''; flash('#000', 0); cap(null); card(null);
}
function end() {
  const s = cur; if (!s) return; cur = null;
  for (const [c, v] of vis) c.visible = v;
  cap(null); card(null); flash('#000', 0);
  $('intro').classList.add('hidden'); document.body.classList.remove('intro-on');
  if (G.menu === 'story') G.menu = null;
  if (s.cleanup) s.cleanup();
  if (s.done) s.done();
}
export const storyActive = () => !!cur;
export function skipStory() { if (cur) { if (cur.skip) cur.skip(); end(); } }
export function updateStory(dt) {
  if (!cur) return;
  cur.t += dt; cur.update(cur.t, dt);
  updateSky(dt, G.camera.position); G.camera.updateMatrixWorld();
  if (cur && cur.t >= cur.dur) end();
}

// ---------------------------------------------------------------- 呂布陣亡 → 阿凱登場
export function playLvbuDeath(lvbu) {
  const m = lvbu.m, p = lvbu.pos.clone(), yaw = lvbu.yaw;
  const ji = weaponModel('ji'); ji.position.set(p.x + Math.sin(yaw + 0.9) * 1.6, heightAt(p.x, p.z) - 0.4, p.z + Math.cos(yaw + 0.9) * 1.6); ji.rotation.z = 0.12; G.scene.add(ji); // 方天畫戟插在地上
  const portal = world.portal, pp = portal.position.clone();
  let ak = null;
  const CAPS = [
    [0.4, 3.0, '呂布：「……天下……無雙……竟……」'],
    [10.2, 12.2, '阿凱：「……好痛……這、這裡是哪裡？實驗室呢？」'],
    [12.4, 14.4, '阿凱：「共振儀……我明明只是按了啟動……」'],
    [14.6, 17.2, '阿凱：「有人嗎——！有沒有人聽得到！拜託，誰來幫幫我！」'],
  ];
  const finish = () => {
    m.root.rotation.x = -PI / 2; m.inner.position.y = lvbu.seat || 0; lvbu.deathT = 1;
    if (!ak) ak = spawnAkai(pp.x + 0.5, pp.z + 2.5);
    ak.pos.set(pp.x + 0.5, heightAt(pp.x, pp.z + 2.5), pp.z + 2.5); ak.m.root.rotation.x = 0; ak.yaw = Math.PI * 0.2;
    portal.scale.setScalar(1);
    const a = AK(); a.arrived = true; G.save();
  };
  play({
    dur: 18,
    skip: finish,
    done: () => {
      finish();
      G.ui.msg('★ 新目標：前往穿越之地的傳送門，找到剛穿越過來的人。', 'quest'); audio.play('quest', 0.7);
    },
    update(t, dt) {
      cap(timed(CAPS, t)); card(t > 4.8 && t < 7.4 ? '與此同時——' : null, '穿越之地');
      if (t < 4.4) { // 呂布跪地、倒下；赤兔悲鳴
        const a = t * 0.18 + yaw + 2.2, r = 6.5 - t * 0.4;
        look(V.set(p.x + Math.sin(a) * r, p.y + 2.2 - t * 0.15, p.z + Math.cos(a) * r), L.set(p.x, p.y + 1.2, p.z));
        const kneel = ease(seg(t, 0.2, 1.4)), fall = ease(seg(t, 2.6, 3.6));
        m.inner.position.y = (lvbu.seat || 0) - kneel * 0.55; m.legL.rotation.x = -kneel * 1.5; m.legR.rotation.x = kneel * 0.3;
        m.armR.rotation.x = -0.35 - kneel * 0.6; m.root.rotation.x = -fall * PI / 2;
        if (t > 1.6 && t < 1.6 + dt) audio.play('neigh', 1);
        flash('#000', seg(t, 3.7, 4.4));
      } else if (t < 7.6) { // 字卡
        flash('#000', 1);
        look(V.set(pp.x + 2, pp.y + 1.4, pp.z + 9), L.copy(pp));
      } else { // 穿越之地：傳送門暴走，阿凱摔出來
        flash('#000', Math.max(0, 1 - (t - 7.6) * 1.5) + seg(t, 17.3, 18));
        const k = ease(seg(t, 7.6, 17));
        look(V.set(pp.x + 2.5 - k * 1.2, pp.y + 0.6 - k * 0.4, pp.z + 9.5 - k * 3), L.set(pp.x, pp.y - 1, pp.z + 1.5));
        const surge = t > 8 && t < 9.6 ? 1 + Math.sin((t - 8) * 18) * 0.25 + (t - 8) * 0.4 : 1;
        portal.scale.setScalar(surge); portal.rotation.z += dt * (t < 9.6 ? 12 : 1);
        if (t > 8 && t < 8 + dt) audio.play('thunder', 0.9);
        if (t >= 9.0 && !ak) { ak = spawnAkai(pp.x, pp.z + 0.6); flash('#bfe8ff', 0.9); audio.play('whoosh', 1); }
        if (t > 9.0 && t < 9.2) flash('#bfe8ff', 0.9 - (t - 9) * 4);
        if (ak) {
          const gy = heightAt(pp.x, pp.z + 2.5), fall = ease(seg(t, 9.0, 9.6)), up = ease(seg(t, 10.4, 11.4));
          ak.pos.set(pp.x + 0.5 * fall, lerp(pp.y, gy, fall), lerp(pp.z + 0.6, pp.z + 2.5, fall));
          ak.m.root.position.copy(ak.pos); ak.m.root.rotation.x = -PI / 2 * (1 - up) * fall;
          ak.m.root.rotation.y = up >= 1 ? PI + Math.sin((t - 11.4) * 1.3) * 1.1 : PI;
          ak.m.armR.rotation.x = t > 14.6 ? -2.6 + Math.sin(t * 9) * 0.3 : -0.3; ak.m.armL.rotation.x = t > 14.6 ? -2.6 - Math.sin(t * 9) * 0.3 : -0.3;
        }
      }
    },
  });
}

// ---------------------------------------------------------------- 歸途之門
// 門內的 2026 港口夜景（畫在 canvas 上）
function harborTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, 256); sky.addColorStop(0, '#050a1e'); sky.addColorStop(0.62, '#1b2a55'); sky.addColorStop(0.63, '#0a1226'); sky.addColorStop(1, '#16264a');
  g.fillStyle = sky; g.fillRect(0, 0, 256, 256);
  let x = 0; const r = (a, b) => a + Math.random() * (b - a);
  while (x < 256) { // 天際線與亮著的窗
    const w = r(12, 26), h = r(30, 95), top = 160 - h; g.fillStyle = '#070b18'; g.fillRect(x, top, w, h);
    for (let wy = top + 4; wy < 156; wy += 6) for (let wx = x + 2; wx < x + w - 3; wx += 5) if (Math.random() < 0.35) { g.fillStyle = Math.random() < 0.8 ? '#ffd56a' : '#9fe8ff'; g.fillRect(wx, wy, 2, 3); }
    x += w + r(0, 4);
  }
  g.strokeStyle = '#0b1020'; g.lineWidth = 3; // 港口起重機
  for (const cx of [40, 200]) { g.beginPath(); g.moveTo(cx, 160); g.lineTo(cx, 70); g.lineTo(cx + 46, 70); g.moveTo(cx, 82); g.lineTo(cx + 30, 70); g.stroke(); g.fillStyle = '#ff3030'; g.fillRect(cx - 1, 66, 3, 3); }
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(255,214,120,${r(0.15, 0.5)})`; g.fillRect(r(0, 256), r(166, 250), r(6, 22), 1.5); } // 水面倒影
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export function playGoHome(done) {
  const portal = world.portal, pp = portal.position.clone();
  const disc = new THREE.Mesh(new THREE.CircleGeometry(2.12, 48), new THREE.MeshBasicMaterial({ map: harborTexture(), transparent: true, opacity: 0, depthWrite: false, fog: false, side: THREE.DoubleSide }));
  disc.position.copy(pp); G.scene.add(disc);
  play({
    dur: 7, done,
    update(t, dt) {
      const k = ease(seg(t, 0, 6)), sc = 1 + k * 0.7;
      look(V.set(pp.x + 1.2 - k * 1.2, pp.y + 0.3 - k * 0.3, pp.z + 9 - k * 6.4), L.copy(pp));
      portal.rotation.z += dt * (2 + t * 3); portal.scale.setScalar(sc);
      disc.scale.setScalar(sc); disc.material.opacity = clamp(0.15 + t * 0.35, 0, 1);
      if (t > 0.2 && t < 0.2 + dt) audio.play('whoosh', 1);
      if (t > 3.2 && t < 3.2 + dt) audio.play('siren', 0.5);
      cap(t > 1 && t < 5 ? '門的另一端，是 2026 年的夜風。' : null);
      flash('#e8f6ff', seg(t, 5, 6.6));
    },
    cleanup() { G.scene.remove(disc); disc.geometry.dispose(); disc.material.map.dispose(); disc.material.dispose(); portal.scale.setScalar(1); },
  });
}
