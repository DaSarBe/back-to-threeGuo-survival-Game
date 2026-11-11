// 以 WebAudio 即時合成所有音效與配樂（無外部音檔）
let ctx = null, master = null, musicGain = null, sfxGain = null, noiseBuf = null, rainSrc = null, rainGain = null;
let vol = { sfx: 0.8, music: 0.6 };
let musicOn = true, musicTimer = null, noteIdx = 4;

function tone(type, f0, f1, dur, vol, delay = 0, dest = sfxGain) {
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, vol, ftype, f0, f1, delay = 0) {
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = ftype;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  s.connect(f); f.connect(g); g.connect(sfxGain);
  s.start(t, Math.random() * 0.5, dur + 0.05);
}

const SOUNDS = {
  pistol(v) { noise(0.14, 0.9 * v, 'bandpass', 2200, 300); tone('sine', 170, 50, 0.12, 0.7 * v); },
  shotgun(v) { noise(0.35, 1.1 * v, 'lowpass', 2600, 150); tone('sine', 120, 35, 0.25, 0.9 * v); },
  rifle(v) { noise(0.09, 1.0 * v, 'highpass', 1500, 600); noise(0.5, 0.6 * v, 'lowpass', 1800, 120); tone('sine', 200, 40, 0.18, 0.8 * v); },
  click(v) { tone('square', 1400, 900, 0.03, 0.15 * v); },
  reload(v) { tone('square', 900, 500, 0.04, 0.15 * v); tone('square', 1300, 800, 0.04, 0.18 * v, 0.25); noise(0.06, 0.2 * v, 'highpass', 3000, 2000, 0.5); },
  swing(v) { noise(0.18, 0.35 * v, 'bandpass', 500, 1800); },
  hit(v) { tone('sine', 140, 55, 0.12, 0.6 * v); noise(0.08, 0.3 * v, 'lowpass', 900, 200); },
  clang(v) { tone('square', 820, 780, 0.14, 0.12 * v); tone('square', 1260, 1200, 0.18, 0.1 * v); },
  explosion(v) { noise(1.1, 1.4 * v, 'lowpass', 1200, 50); tone('sine', 90, 25, 0.7, 1.0 * v); },
  pickup(v) { tone('sine', 660, 990, 0.09, 0.22 * v); },
  hurt(v) { tone('sawtooth', 220, 110, 0.18, 0.3 * v); },
  bow(v) { tone('triangle', 320, 140, 0.16, 0.4 * v); noise(0.1, 0.15 * v, 'highpass', 2500, 1500); },
  thunder(v) { noise(0.12, 1.0 * v, 'highpass', 3000, 800); noise(1.2, 0.9 * v, 'lowpass', 900, 60, 0.05); },
  step(v) { noise(0.06, 0.12 * v, 'lowpass', 500, 150); },
  hoof(v) { tone('sine', 110, 60, 0.06, 0.35 * v); noise(0.04, 0.1 * v, 'lowpass', 700, 300); },
  neigh(v) { tone('sawtooth', 900, 500, 0.5, 0.12 * v); tone('sawtooth', 1200, 650, 0.45, 0.08 * v, 0.05); },
  eat(v) { noise(0.07, 0.2 * v, 'bandpass', 900, 600); noise(0.07, 0.2 * v, 'bandpass', 800, 500, 0.15); },
  drink(v) { tone('sine', 300, 500, 0.1, 0.2 * v); tone('sine', 320, 540, 0.1, 0.2 * v, 0.18); },
  craft(v) { tone('square', 500, 500, 0.05, 0.12 * v); tone('square', 750, 750, 0.05, 0.12 * v, 0.08); tone('square', 1000, 1000, 0.08, 0.12 * v, 0.16); },
  chop(v) { noise(0.08, 0.45 * v, 'bandpass', 700, 300); tone('sine', 180, 90, 0.07, 0.3 * v); },
  coin(v) { tone('triangle', 1600, 1600, 0.06, 0.15 * v); tone('triangle', 2100, 2100, 0.1, 0.15 * v, 0.06); },
  quest(v) { [293.66, 349.23, 440, 587.33].forEach((f, i) => tone('triangle', f, f, 0.5, 0.22 * v, i * 0.13)); },
  horn(v) { tone('sawtooth', 110, 112, 1.6, 0.25 * v); tone('sawtooth', 165, 166, 1.6, 0.14 * v, 0.1); },
  siren(v) { for (let i = 0; i < 3; i++) { tone('sawtooth', 650, 950, 0.45, 0.07 * v, i * 0.9); tone('sawtooth', 950, 650, 0.45, 0.07 * v, i * 0.9 + 0.45); } },
  whoosh(v) { noise(1.6, 0.6 * v, 'bandpass', 300, 3000); tone('sine', 80, 400, 1.5, 0.3 * v); },
  hum(v) { tone('sine', 55, 55, 2.5, 0.12 * v); tone('sine', 82, 82, 2.5, 0.06 * v); },
  wolf(v) { tone('sine', 380, 620, 0.7, 0.14 * v); tone('sine', 620, 400, 0.8, 0.14 * v, 0.7); },
};

// 五聲音階（宮商角徵羽）
const SCALE = [146.83, 174.61, 196, 220, 261.63, 293.66, 349.23, 392, 440, 523.25, 587.33];
function musicTick() {
  if (!ctx || !musicOn || ctx.state !== 'running') return;
  if (Math.random() < 0.72) {
    noteIdx = Math.max(0, Math.min(SCALE.length - 1, noteIdx + Math.floor(Math.random() * 5) - 2));
    const f = SCALE[noteIdx];
    tone('triangle', f * 1.012, f, 1.6, 0.16, 0, musicGain);
    tone('sine', f * 2, f * 2, 0.5, 0.04, 0, musicGain);
    if (Math.random() < 0.25) tone('triangle', SCALE[Math.max(0, noteIdx - 2)], SCALE[Math.max(0, noteIdx - 2)], 1.2, 0.1, 0.22, musicGain);
  }
  if (Math.random() < 0.12) tone('sine', 73.4, 73.4, 3.5, 0.12, 0, musicGain);
}

export const audio = {
  init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
    musicGain = ctx.createGain(); musicGain.gain.value = vol.music; musicGain.connect(master);
    sfxGain = ctx.createGain(); sfxGain.gain.value = vol.sfx; sfxGain.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    musicTimer = setInterval(musicTick, 480);
  },
  play(name, vol = 1) {
    if (!ctx || ctx.state !== 'running' || vol <= 0.01) return;
    const f = SOUNDS[name]; if (f) f(Math.min(1.2, vol));
  },
  // 依距離衰減
  playAt(name, dist, vol = 1) { this.play(name, vol * Math.max(0, 1 - dist / 70)); },
  toggleMusic() { musicOn = !musicOn; if (musicGain) musicGain.gain.value = musicOn ? vol.music : 0; return musicOn; },
  setVolumes(sfx, music) {
    vol = { sfx, music };
    if (sfxGain) sfxGain.gain.value = sfx;
    if (musicGain) musicGain.gain.value = musicOn ? music : 0;
  },
  // 雨聲：持續的濾波雜訊，強度 0..1
  rain(level) {
    if (!ctx) return;
    if (!rainSrc) {
      rainSrc = ctx.createBufferSource(); rainSrc.buffer = noiseBuf; rainSrc.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 0.4;
      rainGain = ctx.createGain(); rainGain.gain.value = 0;
      rainSrc.connect(f); f.connect(rainGain); rainGain.connect(sfxGain); rainSrc.start();
    }
    rainGain.gain.setTargetAtTime(level * 0.35, ctx.currentTime, 0.5);
  },
};
