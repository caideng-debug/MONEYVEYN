/* =====================================================================
   VEYNHOLD — PRESENTATION LAYER (Three.js rendering, input, audio, HUD)
   Reads the pure combat core (VEYN_CORE); never decides combat outcomes.
   ===================================================================== */
(function () {
'use strict';
const $ = id => document.getElementById(id);
function fatal(msg) { const e = $('err'); e.style.display = 'flex'; e.innerHTML = msg; }
if (typeof THREE === 'undefined') { fatal('Three.js failed to load, so the game cannot start.<br>Reload the page; if it keeps happening, the file may be damaged.'); return; }
const CORE = window.VEYN_CORE; const { CONFIG, ATTACKS, World, atkPhase, angNorm, clamp } = CORE;
const HEADLESS = !!window.__VEYN_HEADLESS;

/* ---------------- settings (persisted in localStorage when available) ---------------- */
const Settings = { quality: 'medium', volume: 0.7, debug: false, hints: true, sens: 0.0032, mirror: false, padSens: 2.6, hitStyle: 'ink', intros: true };   // v8: intros (boss intro cinematics on/off)   // v7: hitStyle 'ink' (stylized, default) | 'blood'
/* v8: persistence — localStorage key veynhold_v8; first load migrates veynhold_v7 (else v6), old keys left in place (fails soft when storage is blocked) */
const Store = {
  KEY: 'veynhold_v8', OLD_KEYS: ['veynhold_v7', 'veynhold_v6'], VERSION: 8, data: { best: {}, seenTutorial: false },
  load() { try { if (!window.localStorage) return; let raw = localStorage.getItem(this.KEY), from = null;
      if (!raw) for (const k of this.OLD_KEYS) { raw = localStorage.getItem(k); if (raw) { from = k; break; } }
      if (!raw) return; const d = JSON.parse(raw); this.data = Object.assign(this.data, d); if (!this.data.best) this.data.best = {}; if (from) { this.data.migratedFrom = from; this.data.v = this.VERSION; }
      for (const k of ['quality', 'volume', 'hints', 'sens', 'mirror', 'hitStyle', 'intros']) if (d[k] !== undefined) Settings[k] = d[k];
      if (from) setTimeout(() => this.save(), 0);
      if (d.accessibility !== undefined) CONFIG.parry.accessibility = !!d.accessibility; } catch (e) {} },
  save() { try { if (!window.localStorage) return; const d = Object.assign({}, this.data, { v: this.VERSION, intros: Settings.intros !== false, hitStyle: Settings.hitStyle, quality: Settings.quality, volume: Settings.volume, accessibility: !!CONFIG.parry.accessibility, hints: Settings.hints, sens: Settings.sens, mirror: Settings.mirror });
      localStorage.setItem(this.KEY, JSON.stringify(d)); } catch (e) {} },
};
Store.load();

/* =====================================================================
   AUDIO — Web Audio synthesis, created on first gesture
   ===================================================================== */
class AudioSys {
  constructor() { this.ctx = null; this.master = null; this.noise = null; this.out = null; this.wet = null; this.vol = 1; this.muted = false; }
  ensure() {
    try {
      if (!this.ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; this.ctx = new AC();
        this.master = this.ctx.createGain(); this.master.gain.value = Settings.volume; this.master.connect(this.ctx.destination);
        const len = this.ctx.sampleRate; const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate); const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; this.noise = buf; this.ambient(); this.initBus(); }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch (e) { this.ctx = null; }
  }
  setVolume(v) { Settings.volume = v; if (this.master && !this.muted) this.master.gain.value = v; }
  // v6: mute while the tab is hidden
  mute(on) { this.muted = on; if (!this.master) return; const t = this.ctx.currentTime; this.master.gain.cancelScheduledValues(t); this.master.gain.setTargetAtTime(on ? 0 : Settings.volume, t, 0.05); }
  // v6: a small reverb send for stingers + a combat drone bed driven by pressure
  initBus() { const c = this.ctx; try {
      const len = Math.floor(c.sampleRate * 1.8), ir = c.createBuffer(2, len, c.sampleRate);
      for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
      this.rev = c.createConvolver(); this.rev.buffer = ir; this.revG = c.createGain(); this.revG.gain.value = 0.5; this.rev.connect(this.revG); this.revG.connect(this.master);
      this.bedF = c.createBiquadFilter(); this.bedF.type = 'lowpass'; this.bedF.frequency.value = 160; this.bedF.Q.value = 3; this.bedG = c.createGain(); this.bedG.gain.value = 0;
      for (const [f, d] of [[55, -6], [55.4, 5], [82.4, 0]]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = d; o.connect(this.bedF); o.start(); }
      const pulse = c.createOscillator(); pulse.frequency.value = 0.9; const pg = c.createGain(); pg.gain.value = 60; pulse.connect(pg); pg.connect(this.bedF.frequency); pulse.start();
      this.bedF.connect(this.bedG); this.bedG.connect(this.master); this.bedG.connect(this.rev);
    } catch (e) { this.rev = null; } }
  bed(intensity) { if (!this.bedG) return; const t = this.ctx.currentTime, k = clamp(intensity, 0, 1);
    this.bedG.gain.setTargetAtTime(k <= 0 ? 0 : 0.025 + 0.085 * k, t, 0.35); this.bedF.frequency.setTargetAtTime(140 + 720 * k * k, t, 0.4); }
  dest() { return this.out || this.master; }
  /* v8: music intensity layers over the drone bed — war drums (tempo + weight follow pressure) and a tremolo string pad (high pressure / Phase II) */
  drum(when, accent, vol) { if (!this.ok) return; const c = this.ctx, o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(accent ? 64 : 52, when); o.frequency.exponentialRampToValueAtTime(34, when + 0.32);
    g.gain.setValueAtTime(0.0001, when); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.32 * vol), when + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, when + 0.45); o.connect(g); g.connect(this.master); o.start(when); o.stop(when + 0.5);
    const s = c.createBufferSource(); s.buffer = this.noise; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420; const g2 = c.createGain(); g2.gain.setValueAtTime(0.0001, when); g2.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.12 * vol), when + 0.005); g2.gain.exponentialRampToValueAtTime(0.0001, when + 0.12);
    s.connect(f); f.connect(g2); g2.connect(this.master); s.start(when, Math.random() * 0.5); s.stop(when + 0.15); }
  music(k, o) { if (!this.ok || !this.bedG) return; o = o || {}; const c = this.ctx, now = c.currentTime, q = o.quiet ? 0 : clamp(k, 0, 1.4);
    if (!this.strG) { try { this.strF = c.createBiquadFilter(); this.strF.type = 'bandpass'; this.strF.frequency.value = 700; this.strF.Q.value = 0.8; this.strG = c.createGain(); this.strG.gain.value = 0; const trem = c.createGain(); trem.gain.value = 1; const lfo = c.createOscillator(); lfo.frequency.value = 6.5; const lg = c.createGain(); lg.gain.value = 0.35; lfo.connect(lg); lg.connect(trem.gain); lfo.start();
        for (const [f, d] of [[146.8, -7], [147.2, 6], [220, 0], [174.6, 3]]) { const os = c.createOscillator(); os.type = 'sawtooth'; os.frequency.value = f; os.detune.value = d; os.connect(this.strF); os.start(); this.strO = (this.strO || []).concat(os); }
        this.strF.connect(trem); trem.connect(this.strG); this.strG.connect(this.master); if (this.rev) this.strG.connect(this.rev); this.nextBeat = now + 0.1; this.beatN = 0; } catch (e) { this.strG = null; return; } }
    const sw = o.phase2 ? 0.03 + 0.03 * Math.min(1, q) : Math.max(0, q - 0.62) * 0.07; this.strG.gain.setTargetAtTime(o.quiet ? 0 : sw, now, 0.6);
    if (this.strO && o.phase2 !== this.strP2) { this.strP2 = o.phase2; const sh = o.phase2 ? 0.94387 : 1; this.strO.forEach((os, i) => os.frequency.setTargetAtTime([146.8, 147.2, 220, 174.6][i] * (i === 3 ? sh : 1), now, 0.8)); }
    if (q > 0.42) { const bpm = 66 + 42 * Math.min(1, q), beat = 60 / bpm; if (this.nextBeat < now) this.nextBeat = now + 0.02;
      while (this.nextBeat < now + 0.12) { const accent = this.beatN % 4 === 0, v = Math.min(1, (q - 0.42) * 1.8) * (accent ? 1 : this.beatN % 2 ? 0.45 : 0.7); if (this.beatN % 8 !== 7 || q > 0.85) this.drum(this.nextBeat, accent, v); this.nextBeat += beat; this.beatN++; } }
    else this.nextBeat = now + 0.05; }
  get ok() { return this.ctx && this.ctx.state === 'running'; }
  env(g, t, a, peak, dec) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); }
  nz(dur, type, freq, q, peak, dec, delay, sweepTo) { if (!this.ok) return; const c = this.ctx, t = c.currentTime + (delay || 0);
    const s = c.createBufferSource(); s.buffer = this.noise; const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    f.Q.value = q; const g = c.createGain(); this.env(g, t, 0.004, peak * this.vol, dec); s.connect(f); f.connect(g); g.connect(this.dest()); if (this.wet && this.rev) g.connect(this.rev); s.start(t, Math.random() * 0.5); s.stop(t + dur + dec + 0.05); }
  tone(freq, dur, type, peak, delay, slideTo) { if (!this.ok) return; const c = this.ctx, t = c.currentTime + (delay || 0);
    const o = c.createOscillator(); o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t); if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = c.createGain(); this.env(g, t, 0.003, peak * this.vol, dur); o.connect(g); g.connect(this.dest()); if (this.wet && this.rev) g.connect(this.rev); o.start(t); o.stop(t + dur + 0.05); }
  ambient() { const c = this.ctx; const s = c.createBufferSource(); s.buffer = this.noise; s.loop = true; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380;
    const g = c.createGain(); g.gain.value = 0.035; s.connect(f); f.connect(g); g.connect(this.master); s.start();
    const lfo = c.createOscillator(); lfo.frequency.value = 0.07; const lg = c.createGain(); lg.gain.value = 160; lfo.connect(lg); lg.connect(f.frequency); lfo.start(); }
  play(name, o) {
    o = o || {}; if (!this.ok) return;
    this.vol = o.vol === undefined ? 1 : o.vol; this.wet = !!o.wet || ['perfect', 'break', 'deathblow', 'phase', 'win', 'death'].includes(name); this.out = null;
    if (o.pan && this.ctx.createStereoPanner) { const pn = this.ctx.createStereoPanner(); pn.pan.value = clamp(o.pan, -1, 1); pn.connect(this.master); this.out = pn; }
    this.sw(name, o); this.out = null; this.wet = null; this.vol = 1;
  }
  sw(name, o) {
    switch (name) {
      case 'whoosh': this.nz(0.18, 'bandpass', o.heavy ? 500 : 900, 1.2, o.heavy ? 0.22 : 0.14, 0.16, 0, o.heavy ? 1400 : 2600); break;
      case 'deflect': { const b = o.heavy ? 0.82 : 1; [1180, 2470, 3720, 5150, 6900].forEach((f, i) => this.tone(f * b * (0.98 + Math.random() * 0.04), 0.6 - i * 0.07, 'sine', 0.24 / (i + 1), 0)); this.nz(0.025, 'highpass', 3500, 0.7, 0.6, 0.04); this.tone(320 * b, 0.1, 'triangle', 0.2); break; }
      case 'block': this.nz(0.08, 'lowpass', 900, 1, 0.45, 0.12); this.tone(210, 0.12, 'square', 0.08); this.tone(640, 0.18, 'triangle', 0.07); break;
      case 'hit': this.nz(0.07, 'bandpass', 1300, 0.9, 0.38, 0.1); this.tone(95, 0.16, 'sine', 0.35, 0, 55); if (o.heavy) this.tone(60, 0.3, 'sine', 0.4, 0, 35); break;
      case 'break': this.tone(70, 0.7, 'sawtooth', 0.22, 0, 38); this.nz(0.25, 'lowpass', 600, 1, 0.5, 0.4); this.tone(1900, 0.6, 'sine', 0.08); break;
      case 'danger': this.tone(196, 0.35, 'sawtooth', 0.12); this.tone(207, 0.35, 'sawtooth', 0.12); this.tone(880, 0.2, 'square', 0.05, 0.02); break;
      case 'deathblow': this.nz(0.4, 'bandpass', 400, 0.8, 0.5, 0.5, 0, 3000); this.tone(55, 0.9, 'sine', 0.5, 0.05, 30); this.tone(1400, 0.7, 'sine', 0.1, 0.05); break;
      case 'phase': this.tone(55, 2.2, 'sawtooth', 0.22, 0, 110); this.tone(82, 2.2, 'sawtooth', 0.16, 0.1, 165); this.nz(1.8, 'bandpass', 200, 0.6, 0.25, 1.2, 0, 1800); break;
      case 'dodge': this.nz(0.12, 'bandpass', 700, 1, 0.12, 0.12, 0, 300); break;
      case 'jump': this.nz(0.1, 'lowpass', 500, 1, 0.12, 0.1); break;
      case 'guardUp': this.nz(0.05, 'bandpass', o.spam ? 900 : 1800, 1.4, o.spam ? 0.05 : 0.09, 0.05, 0, o.spam ? 600 : 3200); this.tone(o.spam ? 260 : 520, 0.05, 'triangle', o.spam ? 0.03 : 0.05); break;
      case 'mikiri': this.tone(70, 0.35, 'sine', 0.45, 0, 40); this.nz(0.06, 'lowpass', 700, 1, 0.5, 0.15); [1600, 3300, 5100].forEach((f, i) => this.tone(f, 0.4 - i * 0.08, 'sine', 0.12 / (i + 1), 0.02)); break;
      case 'kick': this.tone(85, 0.25, 'sine', 0.45, 0, 45); this.nz(0.08, 'lowpass', 500, 1, 0.45, 0.12); break;
      case 'feint': this.tone(1500, 0.08, 'triangle', 0.05); break;
      case 'ui': this.tone(660, 0.07, 'triangle', 0.08); break;
      case 'win': [392, 494, 587, 784].forEach((f, i) => this.tone(f, 0.9, 'triangle', 0.1, i * 0.12)); break;
      case 'death': this.tone(110, 1.6, 'sawtooth', 0.2, 0, 40); break;
      case 'step': this.nz(0.03, 'lowpass', 300, 1, 0.05, 0.05); break;
      case 'glint': this.tone(3400, 0.18, 'sine', 0.06); this.tone(5100, 0.12, 'sine', 0.035, 0.015); break;
      case 'cue': this.tone(62, 0.28, 'sine', 0.22, 0, 48); this.nz(0.05, 'lowpass', 260, 1, 0.08, 0.1); break;
      case 'finisher': this.nz(0.22, 'bandpass', 700, 1, 0.2, 0.2, 0, 2800); this.tone(140, 0.22, 'triangle', 0.08, 0, 260); break;
      case 'wave': this.nz(0.7, 'bandpass', 300, 0.8, 0.28, 0.5, 0, 1600); this.tone(90, 0.6, 'sawtooth', 0.1, 0, 160); break;
      case 'chip': this.tone(180, 0.2, 'sawtooth', 0.08, 0, 90); this.nz(0.06, 'highpass', 2500, 1, 0.1, 0.08); break;
      case 'branch': this.tone(740, 0.06, 'square', 0.025); break;
      case 'perfect': [1568, 2093, 2637, 3136].forEach((f, i) => this.tone(f, 0.9 - i * 0.12, 'sine', 0.11 / (i + 1), i * 0.012)); this.tone(98, 0.4, 'sine', 0.3, 0, 60); break;
      case 'late': this.tone(880, 0.18, 'triangle', 0.05); break;
      case 'deathSting': [220, 261.6, 329.6].forEach((f, i) => this.tone(f, 2.2, 'triangle', 0.06, 0.3 + i * 0.02, f * 0.5)); break;
      case 'phaseSting': [110, 130.8, 164.8, 220].forEach((f, i) => this.tone(f, 2.6, 'sawtooth', 0.05, 0.6 + i * 0.15)); this.nz(0.5, 'bandpass', 900, 0.7, 0.2, 1.4, 1.6, 5000); break;
      case 'execSting': this.tone(41, 1.4, 'sine', 0.4, 0.4, 30); [196, 233, 294].forEach((f, i) => this.tone(f, 1.2, 'triangle', 0.05, 0.45 + i * 0.03)); break;
      case 'introSting': this.drum(this.ctx.currentTime + 0.05, 1, 0.9); this.drum(this.ctx.currentTime + 0.85, 1, 0.7); [98, 146.8, 196].forEach((f, i) => this.tone(f, 2.6, 'sawtooth', 0.035, 0.1 + i * 0.05)); this.nz(1.6, 'bandpass', 300, 0.7, 0.12, 1.5, 0.2, 1200); break;
      case 'victorySting': [196, 246.9, 293.7, 392].forEach((f, i) => this.tone(f, 2.8, 'triangle', 0.045, 0.05 + i * 0.16)); this.tone(98, 3.2, 'sine', 0.12, 0); [1568, 2349].forEach((f, i) => this.tone(f, 2.2, 'sine', 0.02, 0.7 + i * 0.25)); break;
    }
  }
}
const audio = new AudioSys();

/* =====================================================================
   RENDERER + SCENE
   ===================================================================== */
const canvas = $('c');
let renderer;
try {
  if (HEADLESS) throw new Error('headless');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
} catch (e) {
  if (!HEADLESS) { fatal('WebGL is not available in this browser, so the 3D view cannot start.'); }
  renderer = { domElement: canvas, shadowMap: {}, setPixelRatio() {}, setSize() {}, render() {}, info: { render: { calls: 0, triangles: 0 } }, outputEncoding: 0 };
}
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;   // v7: filmic tone mapping (exposure lives in VISUAL.exposure)
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0f131b);
scene.fog = new THREE.FogExp2(0x0f131b, 0.026);
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 140);

function applyQuality() {
  const T = tier();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, T.pr));
  renderer.shadowMap.enabled = T.shadows; renderer.shadowMap.type = T.shadowMap >= 2048 ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  if (moon) { moon.castShadow = T.shadows; if (moon.shadow.mapSize.x !== T.shadowMap) { moon.shadow.mapSize.set(T.shadowMap, T.shadowMap); if (moon.shadow.map) { moon.shadow.map.dispose(); moon.shadow.map = null; } } }
  if (embers) embers.points.visible = T.embers;
  torchLights.forEach((t, i) => { t.L.visible = i < T.torches; });
  hemi.intensity = T.torches ? 0.5 : 0.72;                       // low tier: no torch lights, lift the fill instead
  if (Arena.debris) Arena.debris.count = T.debris; Arena.fog.forEach(f => f.visible = T.fog);
  scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
  for (const b of ['qualBtn', 'qualBtn2']) $(b).textContent = 'Quality: ' + T.label;
  v7ApplyTier(T);
}
const Arena = { debris: null, fog: [], pools: [] };
function V8Wet() { if (HEADLESS || typeof document === 'undefined') return null; try { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); if (!g) return null; let s = 77; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    g.fillStyle = 'rgb(225,225,225)'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 70; i++) { const x = r() * 256, y = r() * 256, rad = 8 + r() * 46, gr = g.createRadialGradient(x, y, 0, x, y, rad); const v = 135 + r() * 60; gr.addColorStop(0, `rgba(${v},${v},${v},0.8)`); gr.addColorStop(1, `rgba(${v},${v},${v},0)`); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
    g.strokeStyle = 'rgba(150,150,150,0.45)'; g.lineWidth = 2; for (let i = 0; i < 40; i++) { g.beginPath(); const x = r() * 256, y = r() * 256; g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 60, y + r() * 70); g.stroke(); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; } catch (e) { return null; } }
function onResize() { const w = window.innerWidth || 1280, h = window.innerHeight || 720; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); Ash.scale(); }

/* ---- canvas textures ---- */
function canvasTex(w, h, draw, rep) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext && cv.getContext('2d');
  if (!g) return null; draw(g, w, h); const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; if (rep) t.repeat.set(rep, rep); t.encoding = THREE.sRGBEncoding; return t;
}
function stoneTex(seed, base) {
  return canvasTex(256, 256, (g, w, h) => {
    let s = seed; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) { const v = 30 + r() * 40 | 0; g.fillStyle = `rgba(${v},${v - 2},${v - 6},${0.18 + r() * 0.2})`; g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3); }
    g.strokeStyle = 'rgba(5,5,6,.85)'; g.lineWidth = 2;
    for (let y = 0; y < h; y += 42) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); const off = (y / 42 % 2) * 32;
      for (let x = off; x < w + 64; x += 64 + (r() * 10 | 0)) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 42); g.stroke(); } }
    for (let i = 0; i < 14; i++) { g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 1; g.beginPath(); let x = r() * w, y = r() * h; g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (r() - .5) * 30; y += (r() - .5) * 30; g.lineTo(x, y); } g.stroke(); }
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(40,60,35,${r() * 0.25})`; g.beginPath(); g.arc(r() * w, r() * h, 2 + r() * 8, 0, 7); g.fill(); }
  });
}
/* radial / blotch decal textures */
function blotchTex(seed, rgb, blobs, soft) { return canvasTex(128, 128, (g, w, h) => { let s = seed; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < blobs; i++) { const x = w / 2 + (r() - 0.5) * w * 0.55, y = h / 2 + (r() - 0.5) * h * 0.55, rad = 6 + r() * (soft ? 40 : 18); const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, `rgba(${rgb},${soft ? 0.5 : 0.85})`); gr.addColorStop(soft ? 1 : 0.7, `rgba(${rgb},${soft ? 0 : 0.6})`); gr.addColorStop(1, `rgba(${rgb},0)`); g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill(); } }); }
function glowTex() { return canvasTex(64, 64, (g, w, h) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,170,90,0.55)'); gr.addColorStop(0.5, 'rgba(255,120,50,0.18)'); gr.addColorStop(1, 'rgba(255,100,40,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }); }
function fogTex() { return canvasTex(256, 256, (g, w, h) => { let s = 9; const r = () => (s = (s * 16807) % 2147483647) / 2147483647; for (let i = 0; i < 60; i++) { const x = r() * w, y = r() * h, rad = 20 + r() * 60; const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, 'rgba(150,160,180,0.10)'); gr.addColorStop(1, 'rgba(150,160,180,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); } }); }
let SHARED_TEX = null;
function sharedTex() { if (SHARED_TEX) return SHARED_TEX;
  const weave = canvasTex(64, 64, (g, w, h) => { g.fillStyle = '#808080'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 2) { g.fillStyle = y % 4 ? '#8c8c8c' : '#6e6e6e'; g.fillRect(0, y, w, 1); } for (let x = 0; x < w; x += 3) { g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(x, 0, 1, h); } }, 3);
  const scratch = canvasTex(128, 128, (g, w, h) => { let s = 5; const r = () => (s = (s * 16807) % 2147483647) / 2147483647; g.fillStyle = '#6a6a6a'; g.fillRect(0, 0, w, h); for (let i = 0; i < 220; i++) { const v = 90 + r() * 120 | 0; g.strokeStyle = `rgb(${v},${v},${v})`; g.lineWidth = 0.5 + r(); g.beginPath(); const x = r() * w, y = r() * h; g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 22, y + (r() - 0.5) * 8); g.stroke(); } }, 2);
  if (weave) weave.encoding = THREE.LinearEncoding; if (scratch) scratch.encoding = THREE.LinearEncoding;
  return (SHARED_TEX = { weave, scratch }); }

/* ---- lights ---- */
const hemi = new THREE.HemisphereLight(0x6d7a99, 0x1a1410, 0.5); scene.add(hemi);
const rim = new THREE.DirectionalLight(0x8fa8ff, 0.55); scene.add(rim); scene.add(rim.target);   // cool rim light, kept behind the fighters relative to the camera
const moon = new THREE.DirectionalLight(0x9fb3d9, 0.75); moon.position.set(-14, 26, -10);
moon.shadow.mapSize.set(1024, 1024); const sc = moon.shadow.camera; sc.left = -18; sc.right = 18; sc.top = 18; sc.bottom = -18; sc.near = 5; sc.far = 70; moon.shadow.bias = -0.0015;
scene.add(moon); scene.add(moon.target);
const torchLights = [];

/* ---- arena ---- */
const arenaMats = [];
function M(o) { const m = new THREE.MeshStandardMaterial(o); arenaMats.push(m); return m; }
function mergeStatics(list) {
  const byMat = new Map(); for (const m of list) { if (!byMat.has(m.material)) byMat.set(m.material, []); byMat.get(m.material).push(m); }
  for (const [mat, meshes] of byMat) {
    let nv = 0, ni = 0; for (const m of meshes) { const g = m.geometry; nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = new Uint32Array(ni); let vo = 0, io = 0;
    const v = new THREE.Vector3(), nm = new THREE.Matrix3();
    for (const m of meshes) { m.updateMatrix(); const g = m.geometry, P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv; nm.getNormalMatrix(m.matrix);
      for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(m.matrix); pos.set([v.x, v.y, v.z], (vo + i) * 3); v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nor.set([v.x, v.y, v.z], (vo + i) * 3); if (U) uv.set([U.getX(i), U.getY(i)], (vo + i) * 2); }
      if (g.index) for (let i = 0; i < g.index.count; i++) idx[io++] = g.index.getX(i) + vo; else for (let i = 0; i < P.count; i++) idx[io++] = i + vo;
      vo += P.count; g.dispose(); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(new THREE.BufferAttribute(idx, 1));
    const mm = new THREE.Mesh(geo, mat); mm.receiveShadow = true; mm.castShadow = meshes.some(x => x.castShadow); scene.add(mm);
  }
}
function buildArena() {
  /* v7: ruined castle courtyard. Everything new sits outside the combat radius; collision (core pillars + radius) is unchanged. */
  const R = CONFIG.arena.radius; const statics = []; const sceneAdd = scene.add.bind(scene); const add = m => { if (m.isMesh && !m.userData.keep) statics.push(m); else sceneAdd(m); };
  const surf = (o, set, nK, bK) => { const m = M(o); m.userData.normal = set.normal; m.userData.height = set.height; m.userData.nK = nK; m.userData.bK = bK; m.bumpMap = set.height; m.bumpScale = bK; V7Mats.surfaces.push(m); return m; };
  // flagstone floor (colour + height + generated normal map), wet patches and moss in the joints
  const floorSet = V7Tex.masonry(7, { size: 512, base: [62, 60, 58], gap: '#121110', vary: 26, bw: [70, 150], bh: [56, 96], gapPx: 3, cracks: 26, moss: 70, wet: 18, normalK: 3.0 });
  if (floorSet.map) { [floorSet.map, floorSet.normal, floorSet.height].forEach(t => t && t.repeat.set(6, 6)); }
  const floor = new THREE.Mesh(new THREE.CircleGeometry(R + 4, 64), surf({ color: 0x5f5a53, map: floorSet.map, roughness: 0.86, metalness: 0 }, floorSet, 0.9, 0.04));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; sceneAdd(floor);
  // v8: wet-ground specular — a roughness map with damp streaks and wet joints (Medium/High; Low keeps the flat v7 roughness)
  Arena.floorMat = floor.material; Arena.wetMap = V8Wet(); if (Arena.wetMap) Arena.wetMap.repeat.set(3, 3);
  const outer = new THREE.Mesh(new THREE.RingGeometry(R + 3.5, 75, 40), M({ color: 0x15130f, roughness: 1 })); outer.rotation.x = -Math.PI / 2; outer.position.y = -0.02; sceneAdd(outer);
  // ashlar walls
  const wallSet = V7Tex.masonry(19, { size: 256, base: [58, 55, 51], gap: '#0d0c0b', vary: 22, bw: [40, 72], bh: [26, 36], gapPx: 2, cracks: 14, moss: 26, normalK: 2.6 });
  if (wallSet.map) [wallSet.map, wallSet.normal, wallSet.height].forEach(t => t && t.repeat.set(1.5, 1.5));
  const wallMat = surf({ color: 0x9a9286, map: wallSet.map, roughness: 0.9 }, wallSet, 1.0, 0.05);
  let rs = 3; const rnd = () => (rs = (rs * 16807) % 2147483647) / 2147483647;
  const GATE = 0, STAIRS = -Math.PI / 2, gap = (a, c, w) => Math.abs(angNorm(a - c)) < w;
  const segs = 36, WR = R + 1.6;
  for (let i = 0; i < segs; i++) {
    const a = i / segs * Math.PI * 2; if (gap(a, GATE, 0.2) || gap(a, STAIRS, 0.12)) continue;
    const breach = i % 9 === 4; const h = breach ? 0.8 + rnd() * 0.7 : 3.2 + rnd() * 2.6; const wseg = (2 * Math.PI * WR) / segs + 0.06;
    const box = new THREE.Mesh(new THREE.BoxGeometry(wseg, h, 1.2), wallMat); box.position.set(Math.sin(a) * WR, h / 2, Math.cos(a) * WR); box.rotation.y = a; box.receiveShadow = true; add(box);
    if (!breach) { // crenellations, some knocked out
      const nm = 3; for (let k = 0; k < nm; k++) { if (rnd() < 0.3) continue; const off = (k - (nm - 1) / 2) * wseg / nm; const mer = new THREE.Mesh(new THREE.BoxGeometry(wseg / nm * 0.55, 0.55, 1.25), wallMat);
        mer.position.set(Math.sin(a) * WR + Math.cos(a) * off, h + 0.27, Math.cos(a) * WR - Math.sin(a) * off); mer.rotation.y = a; add(mer); }
      const cap = new THREE.Mesh(new THREE.BoxGeometry(wseg + 0.02, 0.18, 1.45), wallMat); cap.position.set(Math.sin(a) * WR, h - 0.05, Math.cos(a) * WR); cap.rotation.y = a; add(cap); }
    if (rnd() < 0.45) { const rb = new THREE.Mesh(new THREE.BoxGeometry(0.7 + rnd(), 0.4 + rnd() * 0.5, 0.6 + rnd()), wallMat); rb.position.set(Math.sin(a + 0.05) * (R + 0.6), 0.25, Math.cos(a + 0.05) * (R + 0.6)); rb.rotation.set(rnd(), rnd() * 3, rnd() * 0.4); add(rb); }
  }
  // gate: two towers, a broken arch, hanging portcullis teeth
  { const gx = Math.sin(GATE), gz = Math.cos(GATE), px = Math.cos(GATE), pz = -Math.sin(GATE), D = R + 2.0;
    for (const s of [-1, 1]) { const t = new THREE.Mesh(new THREE.BoxGeometry(2.8, 10.5, 2.8), wallMat); t.position.set(gx * D + px * s * 3.6, 5.25, gz * D + pz * s * 3.6); t.rotation.y = GATE; add(t);
      for (let k = 0; k < 4; k++) { if (s > 0 && k === 1) continue; const m = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.7, 0.62), wallMat); const ox = (k % 2 ? 1 : -1) * 1.1, oz = (k < 2 ? 1 : -1) * 1.1;
        m.position.set(t.position.x + px * ox + gx * oz, 10.85, t.position.z + pz * ox + gz * oz); m.rotation.y = GATE; add(m); } }
    const arch = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.42, 6, 14, Math.PI), wallMat); arch.position.set(gx * D, 4.4, gz * D); arch.rotation.y = GATE; add(arch);
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(4.6, 2.2, 1.6), wallMat); lintel.position.set(gx * D, 7.6, gz * D); lintel.rotation.y = GATE; add(lintel);
    const iron = M({ color: 0x1b1c1f, roughness: 0.55, metalness: 0.7 });
    for (let k = -4; k <= 4; k++) { const len = 1.2 + Math.abs(Math.sin(k * 2.7)) * 1.6; const bar = new THREE.Mesh(new THREE.BoxGeometry(0.09, len, 0.09), iron); bar.position.set(gx * (D + 0.2) + px * k * 0.48, 6.6 - Math.cos(k / 4 * 1.3) * 1.6 - len / 2 + 0.4, gz * (D + 0.2) + pz * k * 0.48); bar.rotation.y = GATE; add(bar); }
    for (let k = 0; k < 3; k++) { const bar = new THREE.Mesh(new THREE.BoxGeometry(0.09, 2.6, 0.09), iron); bar.position.set(gx * (D + 0.9) + px * (k - 1) * 0.9, 0.06, gz * (D + 0.9) + pz * (k - 1) * 0.9); bar.rotation.set(Math.PI / 2, GATE + k * 0.5, 0); add(bar); }
  }
  // stairs up to a broken terrace beyond the west wall
  { const sx = Math.sin(STAIRS), sz = Math.cos(STAIRS), qx = Math.cos(STAIRS), qz = -Math.sin(STAIRS);
    for (let k = 0; k < 8; k++) { const d = R + 0.9 + k * 0.42, h = 0.24 * (k + 1); const st = new THREE.Mesh(new THREE.BoxGeometry(3.4 - (k % 3 === 2 ? 0.3 : 0), h, 0.46), wallMat); st.position.set(sx * d + qx * (k % 3 === 2 ? 0.15 : 0), h / 2, sz * d); st.rotation.y = STAIRS; add(st); }
    const land = new THREE.Mesh(new THREE.BoxGeometry(6.5, 2.0, 4.2), wallMat); land.position.set(sx * (R + 6.3), 1.0, sz * (R + 6.3)); land.rotation.y = STAIRS; add(land);
    for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(1.2, 4.6 + s * 0.9, 1.4), wallMat); p.position.set(sx * WR + qx * s * 2.3, (4.6 + s * 0.9) / 2, sz * WR + qz * s * 2.3); p.rotation.y = STAIRS; add(p); }
    const brk = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 2.6, 8), wallMat); brk.position.set(sx * (R + 6.8) + qx * 1.8, 3.3, sz * (R + 6.8) + qz * 1.8); add(brk);
  }
  // pillars (match core collision circles)
  const pilSet = V7Tex.masonry(31, { size: 256, base: [64, 60, 55], gap: '#100f0e', vary: 18, bw: [256, 256], bh: [30, 44], gapPx: 2, cracks: 18, moss: 20, normalK: 2.4 });
  const pilMat = surf({ color: 0xa39c90, map: pilSet.map, roughness: 0.88 }, pilSet, 1.0, 0.05);
  CONFIG.arena.pillars.forEach((p, i) => {
    const h = 2.5 + ((i * 37) % 5) * 0.9; const col = new THREE.Mesh(new THREE.CylinderGeometry(p.r * 0.85, p.r, h, 12), pilMat);
    col.position.set(p.x, h / 2, p.z); col.castShadow = true; col.receiveShadow = true; add(col);
    const base = new THREE.Mesh(new THREE.BoxGeometry(p.r * 2.4, 0.4, p.r * 2.4), pilMat); base.position.set(p.x, 0.2, p.z); add(base);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(p.r * 0.95, p.r * 0.7, 0.5, 7), pilMat); cap.position.set(p.x + 0.1, h + 0.1, p.z); cap.rotation.set(0.25, 0, 0.2); add(cap);
  });
  // distant ruined keep silhouettes + spires (fogged into the ridge haze)
  const farMat = M({ color: 0x161a22, roughness: 1 });
  [[-8, -40, 6, 26], [10, -44, 8, 34], [26, -32, 5, 18], [-30, -24, 6, 20], [36, 8, 7, 16], [-38, 14, 5, 22], [-14, 42, 9, 18], [20, 46, 6, 28]].forEach(([x, z, w, h]) => {
    const t = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), farMat); t.position.set(x, h / 2 - 1, z); add(t);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.75, h * 0.35, 4), farMat); roof.position.set(x, h - 1 + h * 0.17, z); roof.rotation.y = Math.PI / 4; add(roof); });
  [[-20, -48, 2.5, 30], [18, -52, 3, 40], [42, -14, 2.5, 26], [-46, 0, 3, 28], [6, 52, 2.6, 36]].forEach(([x, z, w, h]) => { const t = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.6, w, h, 6), farMat); t.position.set(x, h / 2 - 1, z); add(t);
    const sp = new THREE.Mesh(new THREE.ConeGeometry(w * 0.8, h * 0.5, 6), farMat); sp.position.set(x, h - 1 + h * 0.25, z); add(sp); });
  // dead trees (procedural branches, merged into one draw call)
  { const bark = M({ color: 0x1c1712, roughness: 1 }); const up = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion();
    const tree = (x, z, h, seed) => { const r = V7RNG(seed); const br = (p0, dir, len, rad, depth) => { const p1 = p0.clone().addScaledVector(dir, len);
        const cyl = new THREE.Mesh(new THREE.CylinderGeometry(rad * 0.68, rad, len, 5, 1), bark); cyl.position.copy(p0).add(p1).multiplyScalar(0.5); cyl.quaternion.copy(q.setFromUnitVectors(up, dir)); add(cyl);
        if (depth <= 0) return; const kids = depth > 2 ? 2 + (r() < 0.35 ? 1 : 0) : 2;
        for (let k = 0; k < kids; k++) { const d = dir.clone(); const ax = new THREE.Vector3(r() - 0.5, 0, r() - 0.5).normalize(); d.applyAxisAngle(ax, 0.35 + r() * 0.65); d.y += 0.12 - (depth < 2 ? 0.25 : 0); d.normalize(); br(p1, d, len * (0.62 + r() * 0.2), rad * 0.62, depth - 1); } };
      br(new THREE.Vector3(x, -0.2, z), new THREE.Vector3((r() - 0.5) * 0.25, 1, (r() - 0.5) * 0.25).normalize(), h * 0.38, 0.2 + h * 0.012, 4); };
    [[R + 6.8, STAIRS - 0.12, 7.5, 3], [R + 3.0, 2.2, 6, 5], [R + 2.9, -2.6, 5.5, 8], [R + 9, 0.75, 9, 13], [R + 10, -0.9, 8, 17], [R + 8, 3.3, 7, 21]].forEach(([d, a, h, s]) => tree(Math.sin(a) * d, Math.cos(a) * d, h, s)); }
  // torches (light count follows the quality tier)
  const postMat = M({ color: 0x2a2018, roughness: 1 }); const flameMat = new THREE.MeshBasicMaterial({ color: 0xffb060, toneMapped: false }); arenaMats.push(flameMat);
  const glow = glowTex(); const poolMat = new THREE.MeshBasicMaterial({ map: glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }); arenaMats.push(poolMat);
  [[R - 0.6, 0.6], [-R + 0.6, -1.4], [3, R - 0.6], [-2, -R + 0.6]].forEach(([x, z], i) => { const ang = Math.atan2(x, z); const px = Math.sin(ang) * (R - 0.4), pz = Math.cos(ang) * (R - 0.4);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.3, 6), postMat); post.position.set(px, 1.15, pz); add(post);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.12, 0.2, 8), postMat); bowl.position.set(px, 2.35, pz); add(bowl);
    const fl = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 6), flameMat); fl.position.set(px, 2.7, pz); sceneAdd(fl);
    const L = new THREE.PointLight(0xff8a3a, 1.8, 18, 2); L.position.set(px, 2.9, pz); sceneAdd(L);
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), poolMat); pool.rotation.x = -Math.PI / 2; pool.position.set(px * 0.93, 0.03, pz * 0.93); sceneAdd(pool); Arena.pools.push(pool);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); arenaMats.push(halo.material); halo.scale.set(1.6, 1.6, 1); halo.position.set(px, 2.75, pz); sceneAdd(halo);
    torchLights.push({ L, fl, halo, pool, seed: i * 10 }); });
  // decals: old blood, moss, scorch (merged into few draw calls)
  const decal = (tex, n, minR, maxR, size, seed) => { const m = M({ map: tex, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }); let ss = seed;
    const rr = () => (ss = (ss * 16807) % 2147483647) / 2147483647; for (let i = 0; i < n; i++) { const a = rr() * Math.PI * 2, d = minR + rr() * (maxR - minR), sz = size * (0.6 + rr() * 0.8);
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(sz, sz), m); pl.rotation.set(-Math.PI / 2, 0, rr() * 6.28); pl.position.set(Math.sin(a) * d, 0.012 + i * 0.0004, Math.cos(a) * d); add(pl); } };
  decal(blotchTex(3, '60,8,8', 9, false), 7, 2, 12, 1.4, 11); decal(blotchTex(8, '45,70,30', 14, true), 18, R - 3, R + 1, 3.4, 23); decal(blotchTex(13, '8,7,6', 8, true), 6, 4, 13, 3, 41);
  // wet puddles: near-mirror patches that catch torch light and the moon (env reflection on Medium/High)
  { const pt = V7Tex.puddle(); const pm = M({ color: 0x07080b, roughness: 0.2, metalness: 0.0, alphaMap: pt, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2.5 });
    v7Steel(pm, 1.1); let ss = 101; const rr = () => (ss = (ss * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 9; i++) { const a = rr() * Math.PI * 2, d = 3 + rr() * (R - 3.5), sz = 2.2 + rr() * 2.6; const pl = new THREE.Mesh(new THREE.PlaneGeometry(sz, sz * (0.6 + rr() * 0.5)), pm); pl.rotation.set(-Math.PI / 2, 0, rr() * 6.28); pl.position.set(Math.sin(a) * d, 0.02 + i * 0.0003, Math.cos(a) * d); add(pl); } }
  // tattered banners swaying in the wind (vertex shader; merged)
  { const banMat = M({ map: V7Tex.banner(), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1 });
    banMat.onBeforeCompile = sh => { sh.uniforms.uTime = V7U.time; sh.uniforms.uWind = V7U.wind; sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uWind;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n{ float sw = 1.0 - uv.y; float ph = position.x * 0.7 + position.z * 0.5; transformed += normalize(objectNormal) * (sin(uTime * 2.2 + position.y * 2.4 + ph) * 0.16 + sin(uTime * 3.9 + position.y * 5.0 + ph) * 0.05) * sw * sw * uWind; transformed.y += sin(uTime * 1.7 + ph) * 0.03 * sw * uWind; }'); };
    const ban = (x, z, ry, w, h, y) => { const b = new THREE.Mesh(new THREE.PlaneGeometry(w, h, 1, 8), banMat); b.position.set(x, y, z); b.rotation.y = ry; add(b); };
    [0.6, 1.9, 2.6, 3.5, 4.3, 5.0].forEach(a => ban(Math.sin(a) * (R + 0.95), Math.cos(a) * (R + 0.95), a + Math.PI, 1.1, 2.6, 2.7));
    { const gx = Math.sin(GATE), gz = Math.cos(GATE), px = Math.cos(GATE), pz = -Math.sin(GATE), D = R + 0.55; for (const s of [-1, 1]) ban(gx * D + px * s * 3.6, gz * D + pz * s * 3.6, GATE + Math.PI, 1.4, 4.4, 5.6); } }
  // broken column chunks + fallen arch stones
  [[4.5, 12.5], [-12, -8], [11, -9.5]].forEach(([x, z], i) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.75, 1.6, 10), pilMat); c.position.set(x * 1.12, 0.7, z * 1.12); c.rotation.set(Math.PI / 2, 0, i * 1.3); add(c); });
  // instanced debris (count scales with quality tier)
  { const g = new THREE.DodecahedronGeometry(0.16, 0); const im = new THREE.InstancedMesh(g, wallMat, 90); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3(); let ds = 77;
    const rr = () => (ds = (ds * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 90; i++) { let x, z; if (i % 3 === 0) { const p = CONFIG.arena.pillars[i % CONFIG.arena.pillars.length], a = rr() * 6.28; x = p.x + Math.sin(a) * (p.r + 0.3 + rr()); z = p.z + Math.cos(a) * (p.r + 0.3 + rr()); } else { const a = rr() * 6.28, d = R - 0.4 - rr() * 3.2; x = Math.sin(a) * d; z = Math.cos(a) * d; }
      const k = 0.4 + rr() * 1.6; e.set(rr() * 3, rr() * 3, rr() * 3); q.setFromEuler(e); v.set(x, 0.06 * k, z); sc.set(k, k * (0.5 + rr() * 0.5), k); m4.compose(v, q, sc); im.setMatrixAt(i, m4); }
    im.receiveShadow = true; im.castShadow = false; sceneAdd(im); Arena.debris = im; }
  // drifting ground mist layers (high tier)
  { const ft = fogTex(); for (let i = 0; i < 3; i++) { const m = new THREE.MeshBasicMaterial({ map: ft, transparent: true, depthWrite: false, opacity: 0.5, fog: true }); arenaMats.push(m); const f = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), m);
      f.rotation.x = -Math.PI / 2; f.position.y = 0.25 + i * 0.35; f.userData.spd = 0.004 + i * 0.003; sceneAdd(f); Arena.fog.push(f); } }
  mergeStatics(statics);
}

/* =====================================================================
   PRESENTATION v3 — quality tiers, cloth, impulses, post pulses, cinematics.
   Reads core state / events only; never writes back into the simulation.
   ===================================================================== */
const ANIM_ON = () => !!(window.VEYN_ANIM && window.VEYN_ANIM.ready);
const VISUAL = {
  clips: 1,             // v8: Quaternius sword-combo clips on attacks (0 = v7 procedural poses)
  clipLoco: 1,          // v8: clip locomotion blend (0 = v7 procedural gait)
  footLock: 1,          // v8: foot-speed time warp (support foot moves at body speed)
  breath: 1,            // breathing / sway amount
  impulse: 1,           // strength of physical hit / block / deflect impulses on the rig
  clothStiff: 0.9,      // 0..1 constraint stiffness of capes and scarves
  clothDrag: 0.03,      // velocity damping per cloth step (acts like air drag)
  slowmo: 0.32,         // time scale during deathblow / break cinematics (1 = off)
  vignette: 1,          // strength of screen-edge pulses
  combatFrame: 1,       // how much the camera reframes for threats (0 = off)
  trail: 1,             // sword trail brightness
  torch: 1,             // torch light strength
  lockAngle: 0.17,      // lock-on camera orbits this far off the duel line so both fighters read (rad)
  closeSwing: 0.32,     // v8: extra orbit (rad per 2 m closer than 3.4 m) so the player never hides a close foe
  models: 1,            // 1 = skinned GLB characters, 0 = original block rig
  flash: 1,             // hit-flash strength on the skinned models
  stringCue: 1,         // last swing of an enemy string gets a low drum + brighter trail (0 = off)
  glint: 1,             // delayed strikes glint just before release (0 = off)
  // v7 look (all live in the Tune panel)
  exposure: 0.92,       // ACES filmic exposure
  bloom: 1,             // bloom strength (Medium/High only)
  bloomThreshold: 0.74, // brightness where bloom starts (tone-mapped 0..1)
  postVignette: 0.85,   // post-pass vignette (Low keeps the old CSS vignette)
  grain: 0.035,         // film grain amount (Medium/High)
  grade: 1,             // cold moonlit colour grade mix
  rim: 1,               // rim / fresnel light on fighters
  punch: 1,             // screen punch on deflects / breaks (Medium/High)
  flashFx: 1,           // full-screen flash on perfect deflects / breaks (Medium/High)
  wind: 1,              // banner sway + ash drift
  inkSize: 1,           // ink / blood splash size
  edgeFlash: 1,         // emissive flash along the sword edge on a perfect deflect
  letterbox: 1,         // cinematic bars during deathblows (0/1)
  cineOrbit: 1,         // deathblow camera orbit speed
  ambient: 1,           // hemisphere fill
  moonLight: 1,         // moon key light
  fogDensity: 0.022,    // distance fog
  // v8 look
  lut: 0.85,            // per-phase colour-grade LUT mix (Medium/High)
  mist: 0.55,           // depth-based ground mist (High)
  godRays: 0.55,        // moon god rays (High)
  dof: 1,               // cinematic depth of field during intros / deathblows (High)
  shimmer: 1,           // torch heat shimmer (High)
  wrap: 1,              // wrap / subsurface lighting on skin and cloth (Medium/High)
  contactAO: 1,         // soft contact shadows under feet (all tiers)
  camPull: 1,           // combat camera pulls out for big attacks
  camImpulse: 1,        // directional camera impulse per hit weight
};
const TIERS = {
  high:   { label: 'High',   pr: 1.25, shadows: true,  shadowMap: 2048, torches: 4, cloth: true,  clothIters: 4, debris: 90, fog: true,  embers: true,  particles: 1,
            post: true,  bloom: 2, grain: true,  sky: true,  ridges: 3, ash: 420, fogSprites: 12, normalMaps: true,  env: true,  inkSprites: 12, inkStains: 16,
            lut: true, depthFx: true, godRays: true, dof: true, shimmer: true, wrap: true, wetFloor: true, torchEmbers: 28, shadowBox: 11, contactAO: 2 },
  medium: { label: 'Medium', pr: 1.0,  shadows: true,  shadowMap: 1024, torches: 2, cloth: true,  clothIters: 2, debris: 50, fog: false, embers: true,  particles: 0.75,
            post: true,  bloom: 1, grain: true,  sky: true,  ridges: 2, ash: 180, fogSprites: 6,  normalMaps: true,  env: true,  inkSprites: 8,  inkStains: 10,
            lut: true, depthFx: false, godRays: false, dof: false, shimmer: false, wrap: true, wetFloor: true, torchEmbers: 14, shadowBox: 18, contactAO: 2 },
  // Low = v6 cost: direct render (no extra pass, CSS vignette), bump not normal maps, no env reflections, no ash/fog sprites, one ridge
  low:    { label: 'Low',    pr: 0.75, shadows: false, shadowMap: 512,  torches: 0, cloth: false, clothIters: 1, debris: 20, fog: false, embers: false, particles: 0.5,
            post: false, bloom: 0, grain: false, sky: false, ridges: 1, ash: 0,   fogSprites: 0,  normalMaps: false, env: false, inkSprites: 4,  inkStains: 5,
            lut: false, depthFx: false, godRays: false, dof: false, shimmer: false, wrap: false, wetFloor: false, torchEmbers: 0, shadowBox: 18, contactAO: 2 },
};
const tier = () => TIERS[Settings.quality] || TIERS.high;

/* =====================================================================
   v7 — VISUAL OVERHAUL (presentation only; the combat core is untouched)
   Tone mapping + one combined post pass, castle-courtyard arena, sky/ridges/moon,
   ash + fog, rim light, steel reflections, boss silhouettes, deflect/break/deathblow VFX,
   ink-splash hits. Every effect reads its Low / Medium / High setting from TIERS (V7 keys).
   ===================================================================== */
const GLR = !HEADLESS && !!(renderer && typeof renderer.setRenderTarget === "function" && typeof renderer.getContext === "function");
const V7RNG = seed => { let s = (seed | 0) % 2147483647 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; };
const BLOOD_FOG = new THREE.Color(0x2a0707), COLD_FOG = new THREE.Color(0x0f131b);

/* ---------- procedural textures ---------- */
const V7Tex = {
  cache: {},
  canvas(w, h) { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext && cv.getContext('2d'); return g ? { cv, g } : null; },
  tex(cv, rep, linear) { const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; if (rep) t.repeat.set(rep, rep); t.encoding = linear ? THREE.LinearEncoding : THREE.sRGBEncoding; t.anisotropy = 2; return t; },
  normalFrom(hcv, strength) {   // Sobel height -> tangent-space normal map (OpenGL convention, canvas y down = -v)
    const w = hcv.width, h = hcv.height, src = hcv.getContext('2d').getImageData(0, 0, w, h).data; const o = this.canvas(w, h); if (!o) return null;
    const img = o.g.createImageData(w, h), d = img.data, H = (x, y) => src[((((y + h) % h) * w) + ((x + w) % w)) * 4] / 255;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const du = (H(x + 1, y) - H(x - 1, y)) * strength, dv = (H(x, y - 1) - H(x, y + 1)) * strength; const l = Math.sqrt(du * du + dv * dv + 1), i = (y * w + x) * 4;
      d[i] = (-du / l * 0.5 + 0.5) * 255; d[i + 1] = (-dv / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255; }
    o.g.putImageData(img, 0, 0); return this.tex(o.cv, 0, true);
  },
  /* masonry / flagstone generator: colour + height drawn with the same random layout */
  masonry(seed, o) {
    const S = o.size || 256, c = this.canvas(S, S), hh = this.canvas(S, S); if (!c || !hh) return { map: null, normal: null, height: null };
    const r = V7RNG(seed), g = c.g, hg = hh.g; g.fillStyle = o.gap; g.fillRect(0, 0, S, S); hg.fillStyle = '#141414'; hg.fillRect(0, 0, S, S);
    const [bwMin, bwMax] = o.bw, [bhMin, bhMax] = o.bh; const gap = o.gapPx || 3; const base = o.base;
    for (let y = 0; y < S;) { const rh = Math.round(bhMin + r() * (bhMax - bhMin)), rowH = Math.min(rh, S - y) < bhMin * 0.6 ? S - y : rh; let x = -Math.round(r() * bwMax);
      while (x < S) { const bw = Math.round(bwMin + r() * (bwMax - bwMin)); const v = (r() - 0.5) * o.vary, tone = (k, dv) => Math.max(0, Math.min(255, k + dv | 0));
        const col = `rgb(${tone(base[0], v + (r() - 0.5) * 6)},${tone(base[1], v)},${tone(base[2], v - 2)})`;
        const draw = (gg, ox) => { gg.fillRect(ox + x + gap, y + gap, bw - gap * 2, rowH - gap * 2); };
        for (const ox of [0, S, -S]) { g.fillStyle = col; draw(g, ox); const hv = 150 + r() * 50 | 0; hg.fillStyle = `rgb(${hv},${hv},${hv})`; draw(hg, ox);
          hg.fillStyle = `rgb(${hv + 25},${hv + 25},${hv + 25})`; hg.fillRect(ox + x + gap + 3, y + gap + 3, bw - gap * 2 - 6, rowH - gap * 2 - 6); }
        // worn edge highlight + soot
        g.fillStyle = 'rgba(255,255,255,0.04)'; g.fillRect(x + gap, y + gap, bw - gap * 2, 2); g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x + gap, y + rowH - gap - 3, bw - gap * 2, 3);
        x += bw; }
      y += rowH; }
    // speckle grain, chips, cracks
    for (let i = 0; i < S * S / 22; i++) { const vv = r() * 255 | 0, a = 0.05 + r() * 0.12, px = r() * S, py = r() * S, sz = 1 + r() * 2; g.fillStyle = `rgba(${vv},${vv},${vv},${a})`; g.fillRect(px, py, sz, sz); hg.fillStyle = `rgba(${vv},${vv},${vv},${a * 0.8})`; hg.fillRect(px, py, sz, sz); }
    for (let i = 0; i < (o.cracks || 12); i++) { let x = r() * S, y = r() * S; g.strokeStyle = 'rgba(0,0,0,0.55)'; hg.strokeStyle = 'rgba(0,0,0,0.8)'; g.lineWidth = hg.lineWidth = 1 + r();
      g.beginPath(); hg.beginPath(); g.moveTo(x, y); hg.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 26; y += (r() - 0.5) * 26; g.lineTo(x, y); hg.lineTo(x, y); } g.stroke(); hg.stroke(); }
    if (o.moss) for (let i = 0; i < o.moss; i++) { const x = r() * S, y = r() * S, rad = 3 + r() * 14; const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, `rgba(48,66,34,${0.35 + r() * 0.3})`); gr.addColorStop(1, 'rgba(40,58,30,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill(); }
    if (o.wet) for (let i = 0; i < o.wet; i++) { const x = r() * S, y = r() * S, rad = 10 + r() * 30; const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, 'rgba(0,0,0,0.22)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill(); }
    const rep = o.rep || 1; const map = this.tex(c.cv, rep), height = this.tex(hh.cv, rep, true), normal = this.normalFrom(hh.cv, o.normalK || 2.2); if (normal) normal.repeat.set(rep, rep);
    return { map, normal, height };
  },
  radial(key, stops, size) { if (this.cache[key] !== undefined) return this.cache[key]; const S = size || 64, c = this.canvas(S, S); if (!c) return (this.cache[key] = null);
    const gr = c.g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2); stops.forEach(([p, col]) => gr.addColorStop(p, col)); c.g.fillStyle = gr; c.g.fillRect(0, 0, S, S);
    const t = this.tex(c.cv); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return (this.cache[key] = t); },
  dot() { return this.radial('dot', [[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,0.75)'], [1, 'rgba(255,255,255,0)']], 32); },
  glare() { return this.radial('glare', [[0, 'rgba(255,255,255,1)'], [0.12, 'rgba(255,250,235,0.9)'], [0.35, 'rgba(255,220,170,0.25)'], [1, 'rgba(255,200,150,0)']], 128); },
  halo() { return this.radial('halo', [[0, 'rgba(255,255,255,0.55)'], [0.25, 'rgba(255,255,255,0.18)'], [1, 'rgba(255,255,255,0)']], 128); },
  puff() { if (this.cache.puff !== undefined) return this.cache.puff; const c = this.canvas(128, 128); if (!c) return (this.cache.puff = null); const r = V7RNG(31);
    for (let i = 0; i < 26; i++) { const x = 64 + (r() - 0.5) * 60, y = 64 + (r() - 0.5) * 34, rad = 16 + r() * 30; const gr = c.g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, 'rgba(255,255,255,0.16)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.g.fillStyle = gr; c.g.fillRect(0, 0, 128, 128); }
    const t = this.tex(c.cv); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return (this.cache.puff = t); },
  moon() { if (this.cache.moon !== undefined) return this.cache.moon; const c = this.canvas(128, 128); if (!c) return (this.cache.moon = null); const g = c.g, r = V7RNG(5);
    const gr = g.createRadialGradient(54, 50, 4, 64, 64, 62); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.85, '#e9edf5'); gr.addColorStop(1, '#c4cbd8'); g.fillStyle = gr; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill();
    for (let i = 0; i < 14; i++) { const x = 30 + r() * 68, y = 30 + r() * 68, rad = 5 + r() * 16; const m = g.createRadialGradient(x, y, 0, x, y, rad); m.addColorStop(0, 'rgba(120,128,145,0.45)'); m.addColorStop(1, 'rgba(120,128,145,0)'); g.fillStyle = m; g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill(); }
    const t = this.tex(c.cv); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return (this.cache.moon = t); },
  splat(kind, seed) { const key = 'splat' + kind + seed; if (this.cache[key] !== undefined) return this.cache[key]; const c = this.canvas(128, 128); if (!c) return (this.cache[key] = null); const g = c.g, r = V7RNG(seed);
    const rim = kind === 'blood' ? 'rgba(150,12,16,' : 'rgba(92,10,18,', core = kind === 'blood' ? 'rgba(96,4,8,' : 'rgba(10,5,8,';
    const blob = (col, scale) => { for (let i = 0; i < 9; i++) { const a = r() * 6.28, d = r() * 18 * scale, x = 64 + Math.cos(a) * d, y = 64 + Math.sin(a) * d, rad = (8 + r() * 14) * scale; g.fillStyle = col + '1)'; g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill(); }
      for (let i = 0; i < 16; i++) { const a = r() * 6.28, d = (26 + r() * 30) * scale, x = 64 + Math.cos(a) * d, y = 64 + Math.sin(a) * d; g.fillStyle = col + (0.6 + r() * 0.4) + ')'; g.beginPath(); g.arc(x, y, (1.2 + r() * 4) * scale, 0, 7); g.fill();
        g.strokeStyle = col + '0.8)'; g.lineWidth = (1 + r() * 2.5) * scale; g.beginPath(); g.moveTo(64 + Math.cos(a) * d * 0.4, 64 + Math.sin(a) * d * 0.4); g.lineTo(x, y); g.stroke(); } };
    blob(rim, 1.05); r(); blob(core, 0.82);
    const t = this.tex(c.cv); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return (this.cache[key] = t); },
  cape() { if (this.cache.cape !== undefined) return this.cache.cape; const c = this.canvas(64, 128); if (!c) return (this.cache.cape = null); const g = c.g, r = V7RNG(12);
    g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, 64, 128);
    for (let x = 0; x < 64; x++) { const f = 0.5 + 0.5 * Math.sin(x / 64 * Math.PI * 5 + Math.sin(x * 0.3) * 0.4); const v = 70 + f * 90 | 0; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x, 0, 1, 128); }   // vertical folds
    for (let y = 0; y < 128; y += 2) { g.fillStyle = 'rgba(0,0,0,0.10)'; g.fillRect(0, y, 64, 1); }
    const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.45)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 128);
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(0, 4, 64, 3);
    for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.2})`; g.fillRect(r() * 64, r() * 128, 1, 1 + r() * 4); }
    g.globalCompositeOperation = 'destination-out'; for (let x = 0; x < 64; x += 3) g.fillRect(x, 128 - 4 - r() * r() * 30, 3, 40); for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(r() * 64, 60 + r() * 50, 1.5 + r() * 3, 0, 7); g.fill(); }
    const t = this.tex(c.cv); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return (this.cache.cape = t); },
  puddle() { const c = this.canvas(128, 128); if (!c) return null; const g = c.g, r = V7RNG(17); g.fillStyle = '#000'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 9; i++) { const x = 64 + (r() - 0.5) * 50, y = 64 + (r() - 0.5) * 40, rad = 14 + r() * 22; const gr = g.createRadialGradient(x, y, rad * 0.4, x, y, rad); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill(); }
    const t = this.tex(c.cv, 0, true); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t; },
  banner() { const c = this.canvas(64, 160); if (!c) return null; const g = c.g, r = V7RNG(4);
    const gr = g.createLinearGradient(0, 0, 0, 160); gr.addColorStop(0, '#5e0c11'); gr.addColorStop(1, '#3a0609'); g.fillStyle = gr; g.fillRect(0, 0, 64, 160);
    g.fillStyle = '#9a7a3c'; g.fillRect(4, 8, 56, 3); g.fillRect(4, 14, 56, 1);
    g.strokeStyle = '#c9a75a'; g.fillStyle = '#c9a75a'; g.lineWidth = 3; g.beginPath(); g.moveTo(32, 34); g.lineTo(32, 92); g.stroke();       // sigil: sword through a broken circle
    g.beginPath(); g.moveTo(22, 46); g.lineTo(42, 46); g.stroke(); g.lineWidth = 2.5; g.beginPath(); g.arc(32, 62, 15, -1.1, 3.6); g.stroke();
    for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.18})`; g.fillRect(r() * 64, r() * 160, 1, 2 + r() * 3); }
    g.globalCompositeOperation = 'destination-out'; for (let x = 0; x < 64; x += 4) g.fillRect(x, 160 - 12 - r() * 42, 4, 70); for (let i = 0; i < 8; i++) { g.beginPath(); g.arc(r() * 64, 30 + r() * 100, 2 + r() * 5, 0, 7); g.fill(); }
    return this.tex(c.cv); },
};

/* ---------- shared uniforms + material helpers ---------- */
const V7U = { time: { value: 0 }, wind: { value: 1 }, rim: { value: 0.55 }, blood: { value: 0 }, wrapK: { value: 1 } };
const V8_WRAP_CHUNK = THREE.ShaderChunk.lights_physical_pars_fragment.replace(
  'reflectedLight.directDiffuse += ( 1.0 - clearcoatDHR ) * irradiance * BRDF_Diffuse_Lambert( material.diffuseColor );',
  '{ float wk = uWrap * uWrapK; float nl = dot( geometry.normal, directLight.direction ); float wNL = saturate( ( nl + wk ) / ( 1.0 + wk ) ); vec3 wIrr = wNL * directLight.color;\n' +
  ' #ifndef PHYSICALLY_CORRECT_LIGHTS\n wIrr *= PI;\n #endif\n vec3 sss = uSSS * uWrapK * max( wNL - saturate( nl ), 0.0 ) * directLight.color * 2.0;' +
  ' reflectedLight.directDiffuse += ( 1.0 - clearcoatDHR ) * ( wIrr + sss ) * BRDF_Diffuse_Lambert( material.diffuseColor ); }');
const V7Mats = { surfaces: [], steel: [], env: null };
/* rim / fresnel light on fighters: a cool moonlit edge added to emissive (one dot product per pixel) */
function v7Rim(m, color) {
  if (!m || m.userData.v7rim || !m.isMeshStandardMaterial) return; m.userData.v7rim = { value: new THREE.Color(color || 0x8ea6dd) };
  const ru = m.userData.v7rim; const prev = m.onBeforeCompile;
  // v8: wrap diffuse + subsurface tint (skin / cloth read soft, steel stays hard); strength per tier through uWrapK
  const nm = m.name || '', wrapAmt = /Skin/.test(nm) ? 0.55 : /Cloth|Cape|Scarf|Sash/.test(nm) ? 0.32 : /Armor|Trim|Blade|Edge/.test(nm) ? 0.0 : 0.18;
  const sss = /Skin/.test(nm) ? new THREE.Color(0.55, 0.16, 0.1) : new THREE.Color(0.12, 0.08, 0.1); m.userData.wrap = { value: wrapAmt }; m.userData.sss = { value: sss };
  m.onBeforeCompile = function (sh) { sh.uniforms.uRimCol = ru; sh.uniforms.uRimK = V7U.rim; sh.uniforms.uWrap = m.userData.wrap; sh.uniforms.uSSS = m.userData.sss; sh.uniforms.uWrapK = V7U.wrapK;
    sh.fragmentShader = sh.fragmentShader.replace('#include <lights_physical_pars_fragment>', V8_WRAP_CHUNK)
      .replace('#include <common>', '#include <common>\nuniform vec3 uRimCol; uniform float uRimK; uniform float uWrap; uniform vec3 uSSS; uniform float uWrapK;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n{ float rimF = 1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0); totalEmissiveRadiance += uRimCol * (rimF * rimF * rimF) * uRimK; }'); };
  m.needsUpdate = true;
}
function v7Steel(m, envK, rough) { if (!m || V7Mats.steel.indexOf(m) >= 0) return; m.userData.envK = envK; if (rough !== undefined) m.roughness = Math.min(m.roughness, rough); V7Mats.steel.push(m); v7ApplyEnv(m); }
function v7ApplyEnv(m) { const on = !!(tier().env && V7Mats.env); const want = on ? V7Mats.env : null; if (m.envMap !== want) { m.envMap = want; m.envMapIntensity = m.userData.envK || 1; m.needsUpdate = true; } }
function v7Unsteel(list) { for (const m of list) { const i = V7Mats.steel.indexOf(m); if (i >= 0) V7Mats.steel.splice(i, 1); } }

/* ---------- environment map for steel (PMREM from a tiny procedural moonlit sky; Medium/High) ---------- */
function v7BuildEnv() {
  if (!GLR || !THREE.PMREMGenerator) return;
  try {
    const es = new THREE.Scene(); const g = new THREE.SphereGeometry(10, 24, 12); const col = new Float32Array(g.attributes.position.count * 3); const v = new THREE.Vector3();
    for (let i = 0; i < g.attributes.position.count; i++) { v.fromBufferAttribute(g.attributes.position, i).normalize(); const t = Math.max(0, v.y), lo = Math.max(0, -v.y);
      col[i * 3] = 0.05 + 0.10 * (1 - t) - 0.04 * lo; col[i * 3 + 1] = 0.06 + 0.12 * (1 - t) - 0.04 * lo; col[i * 3 + 2] = 0.09 + 0.18 * (1 - t) - 0.05 * lo; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    es.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    const moonB = new THREE.Mesh(new THREE.SphereGeometry(1.1, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 5.2, 6) })); moonB.position.set(2.2, 3.0, 8.4); es.add(moonB);
    for (const [x, z] of [[8, 2], [-8, -3], [3, -8], [-2, 8]]) { const t = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.3, 0.45) })); t.position.set(x, 0.6, z); es.add(t); }
    const pm = new THREE.PMREMGenerator(renderer); V7Mats.env = pm.fromScene(es, 0.03).texture; pm.dispose();
    es.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  } catch (e) { console.warn('[Veynhold] env map failed', e); V7Mats.env = null; }
}

/* ---------- sky dome, mountain ridges, stars, moon (all raw display-space colours) ---------- */
const Sky = {
  group: new THREE.Group(), dome: null, ridges: [], stars: null, moonDisc: null, moonHalo: null, moonDir: new THREE.Vector3(0.28, 0.30, 0.91).normalize(),
  build() {
    const domeMat = new THREE.ShaderMaterial({ depthWrite: false, side: THREE.BackSide, fog: false,
      uniforms: { uTop: { value: new THREE.Color(0x05070c) }, uHor: { value: new THREE.Color(0x26303f) }, uMoonDir: { value: this.moonDir }, uMoonCol: { value: new THREE.Color(0x9fb4d8) }, uBlood: V7U.blood },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 uTop, uHor, uMoonCol, uMoonDir; uniform float uBlood; varying vec3 vDir; void main(){ vec3 d = normalize(vDir); float h = d.y;' +
        ' vec3 top = mix(uTop, vec3(0.06,0.008,0.01), uBlood), hor = mix(uHor, vec3(0.30,0.05,0.04), uBlood), mc = mix(uMoonCol, vec3(1.0,0.22,0.14), uBlood);' +
        ' vec3 c = mix(hor, top, smoothstep(-0.02, 0.6, h)); c = mix(c, hor * 0.55, smoothstep(0.0, -0.25, h)); float m = max(dot(d, normalize(uMoonDir)), 0.0); c += mc * (pow(m, 6.0) * 0.20 + pow(m, 40.0) * 0.35);' +
        ' gl_FragColor = vec4(c, 1.0); }' });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(118, 32, 16), domeMat); this.dome.renderOrder = -10; this.dome.frustumCulled = false; this.group.add(this.dome);
    // three layered ridges: far (pale, tall) -> near (dark, low); haze fades their feet into the horizon
    const L = [[112, 20, 34, 0x2a3443, 0.0, 11], [92, 12, 22, 0x1a212c, 0.35, 23], [74, 7, 13, 0x0e1219, 0.7, 37]];
    L.forEach(([rad, hMin, hMax, col, near, seed], li) => { const N = 160, r = V7RNG(seed), ph = [r() * 6, r() * 6, r() * 6, r() * 6]; const pos = [], hh = [], idx = [];
      for (let i = 0; i <= N; i++) { const a = i / N * Math.PI * 2; let n = 0.5 + 0.28 * Math.sin(a * 3 + ph[0]) + 0.16 * Math.sin(a * 7 + ph[1]) + 0.08 * Math.sin(a * 17 + ph[2]); n += 0.12 * Math.abs(Math.sin(a * 11 + ph[3])) - 0.06;
        const top = hMin + (hMax - hMin) * Math.max(0, Math.min(1, n)); const x = Math.sin(a) * rad, z = Math.cos(a) * rad; pos.push(x, -8, z, x, top, z); hh.push(0, 1); if (i < N) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); } }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('hgt', new THREE.Float32BufferAttribute(hh, 1)); g.setIndex(idx);
      const m = new THREE.ShaderMaterial({ side: THREE.DoubleSide, fog: false, depthWrite: true, uniforms: { uCol: { value: new THREE.Color(col) }, uHaze: { value: new THREE.Color(0x26303f) }, uNear: { value: near }, uBlood: V7U.blood },
        vertexShader: 'attribute float hgt; varying float vH; void main(){ vH = hgt; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform vec3 uCol, uHaze; uniform float uNear, uBlood; varying float vH; void main(){ vec3 haze = mix(uHaze, vec3(0.30,0.05,0.04), uBlood); vec3 col = mix(uCol, uCol * vec3(1.6,0.45,0.4), uBlood * 0.8);' +
          ' vec3 c = mix(haze * 0.85, col, smoothstep(0.0, 0.75 - uNear * 0.3, vH)); c += (1.0 - vH) * 0.0; gl_FragColor = vec4(c, 1.0); }' });
      const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = -9 + li; mesh.userData.layer = li; this.group.add(mesh); this.ridges.push(mesh); });
    // stars
    { const n = 360, p = new Float32Array(n * 3), r = V7RNG(71); for (let i = 0; i < n; i++) { const a = r() * 6.283, y = 0.12 + r() * 0.88, s = Math.sqrt(1 - y * y); p[i * 3] = Math.cos(a) * s * 105; p[i * 3 + 1] = y * 105; p[i * 3 + 2] = Math.sin(a) * s * 105; }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
      this.stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0x9aa6c0, size: 1.4, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8, depthWrite: false, map: V7Tex.dot(), toneMapped: false }));
      this.stars.frustumCulled = false; this.stars.renderOrder = -8; this.group.add(this.stars); }
    // moon disc + halo (bright enough to feed bloom)
    this.moonDisc = new THREE.Mesh(new THREE.CircleGeometry(4.6, 32), new THREE.MeshBasicMaterial({ map: V7Tex.moon(), color: 0xe6ecf8, fog: false, toneMapped: false, transparent: true, depthWrite: false }));
    this.moonDisc.position.copy(this.moonDir).multiplyScalar(100); this.moonDisc.lookAt(0, 0, 0); this.moonDisc.renderOrder = -7; this.group.add(this.moonDisc);
    this.moonHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: V7Tex.halo(), color: 0x9fb2d6, fog: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.moonHalo.scale.set(46, 46, 1); this.moonHalo.position.copy(this.moonDir).multiplyScalar(99); this.moonHalo.renderOrder = -6; this.group.add(this.moonHalo);
    scene.add(this.group);
  },
  apply(T) { if (!this.dome) return; this.dome.visible = T.sky; this.stars.visible = T.sky; this.ridges[0].visible = T.ridges >= 1; this.ridges[1].visible = T.ridges >= 2; this.ridges[2].visible = T.ridges >= 3; },
  update() { this.group.position.copy(camera.position); },
};

/* ---------- GPU ash (falling) — animated entirely in the vertex shader, zero CPU per frame ---------- */
const Ash = {
  pts: null, n: 0,
  build() { const N = 420, p = new Float32Array(N * 3), s = new Float32Array(N * 4), r = V7RNG(97);
    for (let i = 0; i < N; i++) { p[i * 3] = (r() - 0.5) * 40; p[i * 3 + 1] = r() * 12; p[i * 3 + 2] = (r() - 0.5) * 40; s[i * 4] = r(); s[i * 4 + 1] = r(); s[i * 4 + 2] = r(); s[i * 4 + 3] = r(); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('seed', new THREE.BufferAttribute(s, 4)); g.setDrawRange(0, 0);
    const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fog: false, uniforms: { uTime: V7U.time, uWind: V7U.wind, uBlood: V7U.blood, uScale: { value: 300 } },
      vertexShader: 'attribute vec4 seed; uniform float uTime, uWind, uScale; varying float vA; varying float vS; void main(){ vec3 p = position; float t = uTime;' +
        ' float fall = 0.35 + seed.x * 0.45; p.y = 12.0 - mod(12.0 - position.y + t * fall, 12.0);' +
        ' p.x += sin(t * (0.4 + seed.y * 0.6) + seed.z * 6.283) * 0.9 + t * 0.35 * uWind; p.z += cos(t * (0.3 + seed.w * 0.5) + seed.x * 6.283) * 0.7 + t * 0.12 * uWind;' +
        ' p.x = mod(p.x + 20.0, 40.0) - 20.0; p.z = mod(p.z + 20.0, 40.0) - 20.0;' +
        ' vA = smoothstep(0.0, 1.5, p.y) * smoothstep(12.0, 9.5, p.y); vS = seed.w; vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_PointSize = clamp(uScale * (0.035 + seed.z * 0.045) / -mv.z, 1.0, 6.0); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform float uBlood; varying float vA; varying float vS; void main(){ vec2 c = gl_PointCoord - 0.5; float d = dot(c, c); if (d > 0.25) discard;' +
        ' vec3 col = mix(vec3(0.52, 0.53, 0.56), vec3(0.62, 0.30, 0.27), uBlood) * (0.7 + vS * 0.5); gl_FragColor = vec4(col, vA * (1.0 - d * 4.0) * 0.55); }' });
    this.pts = new THREE.Points(g, m); this.pts.frustumCulled = false; scene.add(this.pts); },
  apply(T) { if (!this.pts) return; this.n = T.ash; this.pts.geometry.setDrawRange(0, T.ash); this.pts.visible = T.ash > 0; },
  scale() { if (this.pts) this.pts.material.uniforms.uScale.value = (window.innerHeight || 720) * 0.45; },
};

/* ---------- v8: embers rising from each torch (vertex-shader animated, zero CPU per frame; Medium 14 / High 28 per torch) ---------- */
const TorchEmbers = {
  pts: null, per: 28,
  build() { if (!torchLights.length) return; const N = this.per * torchLights.length, p = new Float32Array(N * 3), sd = new Float32Array(N * 4), r = V7RNG(313);
    for (let t = 0; t < torchLights.length; t++) { const L = torchLights[t].fl.position; for (let i = 0; i < this.per; i++) { const k = t * this.per + i; p[k * 3] = L.x; p[k * 3 + 1] = L.y + 0.1; p[k * 3 + 2] = L.z; sd[k * 4] = r(); sd[k * 4 + 1] = r(); sd[k * 4 + 2] = r(); sd[k * 4 + 3] = r(); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('seed', new THREE.BufferAttribute(sd, 4));
    const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, uniforms: { uTime: V7U.time, uWind: V7U.wind, uScale: { value: 300 } },
      vertexShader: 'attribute vec4 seed; uniform float uTime, uWind, uScale; varying float vA; void main(){ float life = 1.6 + seed.x * 1.4; float t = mod(uTime * (0.8 + seed.y * 0.5) + seed.z * life, life); float u = t / life; vec3 p = position;' +
        ' p.y += t * (0.55 + seed.w * 0.6); p.x += sin(t * (2.0 + seed.x * 3.0) + seed.y * 6.283) * 0.12 * (0.3 + u) + t * 0.18 * uWind; p.z += cos(t * (1.7 + seed.w * 2.5) + seed.z * 6.283) * 0.12 * (0.3 + u);' +
        ' vA = smoothstep(0.0, 0.08, u) * (1.0 - u) * (0.6 + 0.4 * sin(uTime * 23.0 + seed.x * 40.0)); vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_PointSize = clamp(uScale * (0.018 + seed.w * 0.02) / -mv.z, 1.0, 4.0); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float d = dot(c, c); if (d > 0.25) discard; gl_FragColor = vec4(vec3(1.0, 0.55, 0.18) * 1.6, vA * (1.0 - d * 4.0)); }' });
    this.pts = new THREE.Points(g, m); this.pts.frustumCulled = false; this.pts.visible = false; scene.add(this.pts); },
  apply(T) { if (!this.pts) return; const n = T.torchEmbers || 0, used = Math.min(T.torches || 0, torchLights.length); this.pts.visible = n > 0 && used > 0;
    // draw only the first n of each torch's block is not contiguous, so draw whole blocks: per-torch count = per (High) or every torch half (Medium)
    this.pts.geometry.setDrawRange(0, n >= this.per ? this.per * used : Math.ceil(this.per * used * n / this.per)); this.pts.material.uniforms.uScale.value = (window.innerHeight || 720) * 0.45; },
};

/* ---------- drifting fog sprites (billboards), tinted blood-red in King Phase II ---------- */
const FogBank = {
  list: [], cold: new THREE.Color(0x3c475b), blood: new THREE.Color(0x6a120e),
  build() { const r = V7RNG(55), tx = V7Tex.puff(); for (let i = 0; i < 14; i++) { const m = new THREE.SpriteMaterial({ map: tx, color: this.cold, transparent: true, depthWrite: false, opacity: 0.0, fog: false });
      const s = new THREE.Sprite(m); const sz = 9 + r() * 9; s.scale.set(sz * 1.6, sz * 0.55, 1); s.userData = { a: r() * 6.283, rad: 7 + r() * 13, y: 0.5 + r() * 1.2, spd: (0.012 + r() * 0.02) * (r() < 0.5 ? -1 : 1), op: 0.07 + r() * 0.08, ph: r() * 6 };
      s.visible = false; scene.add(s); this.list.push(s); } },
  apply(T) { this.list.forEach((s, i) => s.visible = i < T.fogSprites); },
  update(dt, now) { const bk = V7U.blood.value; for (const s of this.list) { if (!s.visible) continue; const u = s.userData; u.a += u.spd * dt; s.position.set(Math.sin(u.a) * u.rad, u.y + Math.sin(now * 0.3 + u.ph) * 0.15, Math.cos(u.a) * u.rad);
      s.material.color.copy(this.cold).lerp(this.blood, bk); s.material.opacity = u.op * (1 + bk * 0.6); } },
};

/* ---------- atmosphere: cold moonlight -> blood moon (King Phase II) ---------- */
const Atmos = {
  k: 0, fogCold: COLD_FOG.clone(), moonCold: new THREE.Color(0xa7b9de), moonBlood: new THREE.Color(0xd0473c), hemiCold: new THREE.Color(0x6f7d9e), hemiBlood: new THREE.Color(0x8a3c3a),
  discCold: new THREE.Color(0xe6ecf8), discBlood: new THREE.Color(0xff3a26), haloCold: new THREE.Color(0x9fb2d6), haloBlood: new THREE.Color(0xff2a14), tmp: new THREE.Color(),
  target() { const w = Game.world; if (!w) return 0; for (const e of w.enemies()) if (e.profile && e.profile.look === 'king' && (e.phase === 2 || (e.state === 'transition' && e.stateT > 0.6))) return 1; return 0; },
  update(dt) { const t = this.target(); this.k += (t - this.k) * Math.min(1, dt * (t > this.k ? 0.9 : 2.5)); const k = this.k; V7U.blood.value = k;
    scene.fog.color.copy(this.fogCold).lerp(BLOOD_FOG, k); scene.fog.density = VISUAL.fogDensity * (1 + k * 0.35); scene.background.copy(scene.fog.color);
    moon.color.copy(this.moonCold).lerp(this.moonBlood, k); hemi.color.copy(this.hemiCold).lerp(this.hemiBlood, k * 0.7);
    if (Sky.moonDisc) { Sky.moonDisc.material.color.copy(this.discCold).lerp(this.discBlood, k); Sky.moonHalo.material.color.copy(this.haloCold).lerp(this.haloBlood, k); Sky.moonHalo.material.opacity = 0.75 + k * 0.4; } },
};

/* ---------- one combined post pass: scene -> RT, half-res bloom (Med/High), vignette + grain + grade + punch/flash ----------
   v8: per-phase colour-grade LUTs (Med/High), and on High a depth texture drives ground mist (depth fog), moon god rays
   (quarter-res radial blur of the sky), torch heat shimmer and cinematic depth-of-field. Low still renders direct (no post). */
const LUT = {   // 16^3 colour cubes packed as 256x16 strips, generated procedurally (no files)
  make(fn) { const N = 16, d = new Uint8Array(N * N * N * 4);
    for (let b = 0; b < N; b++) for (let g = 0; g < N; g++) for (let r = 0; r < N; r++) { const o = (g * N * N + b * N + r) * 4, c = fn(r / (N - 1), g / (N - 1), b / (N - 1)); d[o] = Math.round(clamp(c[0], 0, 1) * 255); d[o + 1] = Math.round(clamp(c[1], 0, 1) * 255); d[o + 2] = Math.round(clamp(c[2], 0, 1) * 255); d[o + 3] = 255; }
    const t = new THREE.DataTexture(d, N * N, N, THREE.RGBAFormat); t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true; return t; },
  grade(o) { return (r, g, b) => { const l = 0.299 * r + 0.587 * g + 0.114 * b; let c = [r, g, b];
      c = c.map((v, i) => v + (o.lift[i]) * (1 - v) * (1 - v) * 0.5);                                    // lift (shadow tint)
      c = c.map((v, i) => Math.pow(Math.max(0, v), o.gamma[i]));                                           // gamma (mid tint)
      c = c.map((v, i) => v * o.gain[i]);                                                                  // gain (highlight tint)
      const l2 = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]; c = c.map(v => l2 + (v - l2) * o.sat);           // saturation
      const sh = Math.max(0, 1 - l * 2.2), hi = Math.max(0, l * 1.6 - 0.6); c = c.map((v, i) => v + o.shadow[i] * sh * 0.06 + o.high[i] * hi * 0.05);   // split tone
      c = c.map(v => { v = clamp(v, 0, 1); return v + (v * v * (3 - 2 * v) - v) * o.contrast; }); return c; }; },
  init() { if (this.cold) return;
    this.cold = this.make(this.grade({ lift: [-0.02, 0.0, 0.05], gamma: [1.03, 1.0, 0.95], gain: [1.0, 1.0, 1.04], sat: 0.86, shadow: [-0.4, 0.1, 0.9], high: [0.6, 0.45, 0.15], contrast: 0.16 }));
    this.blood = this.make(this.grade({ lift: [0.02, -0.01, 0.0], gamma: [0.98, 1.04, 1.04], gain: [0.98, 0.96, 0.96], sat: 0.78, shadow: [0.35, -0.1, 0.05], high: [0.7, 0.45, 0.25], contrast: 0.24 }));
    this.cine = this.make(this.grade({ lift: [0.0, -0.01, 0.0], gamma: [1.0, 1.02, 1.05], gain: [1.05, 1.0, 0.95], sat: 0.6, shadow: [0.1, 0.1, 0.4], high: [0.8, 0.55, 0.2], contrast: 0.28 })); },
};
const PostFX = {
  ready: false, rt: null, bA: null, bB: null, bC: null, bD: null, gA: null, gB: null, dA: null, dB: null, w: 0, h: 0, punchA: 0, flashA: 0, flashCol: new THREE.Color(1, 0.9, 0.7), desatT: 0, desatDur: 0, sz: new THREE.Vector2(),
  depthOK: false, dof: 0, dofFocus: 6, cine: 0, torches: [], _v: new THREE.Vector3(), moonScr: new THREE.Vector3(),
  init() {
    if (!GLR) return;
    try {
      LUT.init();
      const mk = () => { const t = new THREE.WebGLRenderTarget(4, 4, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, depthBuffer: false, stencilBuffer: false }); t.texture.generateMipmaps = false; return t; };
      this.rt = new THREE.WebGLRenderTarget(4, 4, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, depthBuffer: true, stencilBuffer: false });
      this.rt.texture.encoding = THREE.sRGBEncoding; this.rt.texture.generateMipmaps = false;   // shaders write tone-mapped sRGB (8-bit precision where the eye needs it)
      try { const caps = renderer.capabilities; if (caps.isWebGL2 || renderer.extensions.get('WEBGL_depth_texture')) { this.rt.depthTexture = new THREE.DepthTexture(4, 4); this.rt.depthTexture.type = THREE.UnsignedIntType; this.depthOK = true; } } catch (e) { this.depthOK = false; }
      this.bA = mk(); this.bB = mk(); this.bC = mk(); this.bD = mk(); this.gA = mk(); this.gB = mk(); this.dA = mk(); this.dB = mk();
      const vs = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
      this.bright = new THREE.ShaderMaterial({ depthTest: false, depthWrite: false, uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uTh: { value: 0.72 }, uKnee: { value: 0.22 } }, vertexShader: vs,
        fragmentShader: 'uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uTh, uKnee; varying vec2 vUv; vec3 s(vec2 o){ vec3 c = texture2D(tSrc, vUv + o * uTexel).rgb; float l = max(c.r, max(c.g, c.b)); return c * smoothstep(uTh, uTh + uKnee, l); }' +
          ' void main(){ vec3 c = (s(vec2(-1.0,-1.0)) + s(vec2(1.0,-1.0)) + s(vec2(-1.0,1.0)) + s(vec2(1.0,1.0))) * 0.25; gl_FragColor = vec4(c, 1.0); }' });
      this.blur = new THREE.ShaderMaterial({ depthTest: false, depthWrite: false, uniforms: { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } }, vertexShader: vs,
        fragmentShader: 'uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv; void main(){ vec3 c = texture2D(tSrc, vUv).rgb * 0.227027;' +
          ' c += (texture2D(tSrc, vUv + uDir * 1.3846153846).rgb + texture2D(tSrc, vUv - uDir * 1.3846153846).rgb) * 0.3162162162;' +
          ' c += (texture2D(tSrc, vUv + uDir * 3.2307692308).rgb + texture2D(tSrc, vUv - uDir * 3.2307692308).rgb) * 0.0702702703; gl_FragColor = vec4(c, 1.0); }' });
      // v8 god rays: sky mask (far depth, bright) marched toward the moon's screen position (24 taps, quarter res)
      this.god = new THREE.ShaderMaterial({ depthTest: false, depthWrite: false, uniforms: { tScene: { value: null }, tDepth: { value: null }, uSun: { value: new THREE.Vector2(0.5, 0.7) }, uDecay: { value: 0.955 } }, vertexShader: vs,
        fragmentShader: 'uniform sampler2D tScene, tDepth; uniform vec2 uSun; uniform float uDecay; varying vec2 vUv;' +
          ' void main(){ vec2 d = (uSun - vUv) / 24.0; vec2 uv = vUv; float w = 1.0; vec3 acc = vec3(0.0);' +
          ' for (int i = 0; i < 24; i++) { uv += d; float sky = step(0.99995, texture2D(tDepth, uv).r); vec3 c = texture2D(tScene, uv).rgb; float l = max(c.r, max(c.g, c.b)); acc += c * smoothstep(0.18, 0.7, l) * sky * w; w *= uDecay; }' +
          ' gl_FragColor = vec4(acc / 24.0, 1.0); }' });
      const compFrag = [
          'uniform sampler2D tScene, tBloom, tBloom2, tLutA, tLutB, tLutC, tDepth, tGod, tDof; uniform float uBloom, uBloom2, uVig, uGrain, uTime, uGrade, uPunch, uFlash, uSat, uBlood, uAspect, uLut, uCine, uGodK, uDof, uFocus, uMist, uNear, uFar;',
          'uniform vec3 uFlashCol, uMistCol; uniform vec4 uTorch[4]; uniform mat4 uInvProj, uCamWorld; varying vec2 vUv;',
          'float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }',
          '#ifdef USE_LUT',
          'vec3 lut(sampler2D t, vec3 c){ c = clamp(c, 0.0, 1.0) * 15.0; float b = floor(c.b); float f = c.b - b; vec2 uv0 = vec2((b * 16.0 + c.r + 0.5) / 256.0, (c.g + 0.5) / 16.0); vec2 uv1 = uv0 + vec2(min(1.0, 15.0 - b) * 16.0 / 256.0, 0.0);',
          '  return mix(texture2D(t, uv0).rgb, texture2D(t, uv1).rgb, f); }',
          '#endif',
          '#ifdef USE_DEPTH',
          'float linZ(float d){ float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }',
          'vec3 worldAt(vec2 uv, float d){ vec4 v = uInvProj * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); v /= v.w; return (uCamWorld * v).xyz; }',
          '#endif',
          'void main(){ vec2 c = vUv - 0.5; vec2 uv = 0.5 + c * (1.0 - uPunch);',
          '#ifdef USE_SHIMMER',
          ' for (int i = 0; i < 4; i++) { vec4 T = uTorch[i]; if (T.w > 0.0) { vec2 q = (uv - T.xy) * vec2(uAspect, 1.0) / T.z; float m = exp(-dot(q * vec2(1.6, 0.7), q * vec2(1.6, 0.7)) * 2.5) * step(-0.25, q.y);',
          '   uv.x += sin(uv.y * 160.0 - uTime * 9.0 + float(i) * 2.0) * 0.0016 * m * T.w; uv.y += cos(uv.x * 140.0 + uTime * 7.0) * 0.0012 * m * T.w; } }',
          '#endif',
          ' vec3 col = texture2D(tScene, uv).rgb;',
          ' if (uPunch > 0.002) { col.r = texture2D(tScene, uv + c * uPunch * 0.6).r; col.b = texture2D(tScene, uv - c * uPunch * 0.6).b; }',
          '#ifdef USE_DEPTH',
          ' float dz = texture2D(tDepth, uv).r; float lz = linZ(dz);',
          ' if (uDof > 0.001) { float coc = clamp(abs(lz - uFocus) / max(0.5, uFocus * 0.55) - 0.25, 0.0, 1.0); col = mix(col, texture2D(tDof, uv).rgb, coc * uDof); }',
          ' if (dz < 0.99995) { vec3 wp = worldAt(uv, dz); float hf = exp(-max(wp.y, 0.0) * 0.55); float df = 1.0 - exp(-max(lz - 4.0, 0.0) * 0.035); col = mix(col, uMistCol, clamp(df * hf * uMist, 0.0, 0.6)); }',
          '#endif',
          ' col += texture2D(tBloom, uv).rgb * uBloom + texture2D(tBloom2, uv).rgb * uBloom2;',
          '#ifdef USE_GOD',
          ' col += texture2D(tGod, uv).rgb * uGodK;',
          '#endif',
          ' float l = dot(col, vec3(0.299, 0.587, 0.114));',
          ' vec3 g = col * mix(vec3(0.86, 0.95, 1.14), vec3(1.05, 1.0, 0.94), smoothstep(0.05, 0.75, l));',
          ' g = mix(g, g * vec3(1.18, 0.8, 0.76) + vec3(0.02, 0.0, 0.0), uBlood * 0.55);',
          ' g = clamp(g, 0.0, 1.0); g = mix(g, g * g * (3.0 - 2.0 * g), 0.22);',
          '#ifdef USE_LUT',
          ' vec3 lg = mix(lut(tLutA, g), lut(tLutB, g), uBlood); lg = mix(lg, lut(tLutC, g), uCine); g = mix(g, lg, uLut);',
          '#endif',
          ' float gl = dot(g, vec3(0.299, 0.587, 0.114));',
          ' g = mix(vec3(gl) * vec3(0.95, 0.97, 1.05), g, uSat);',
          ' col = mix(col, g, uGrade);',
          ' vec2 vc = c * vec2(uAspect, 1.0) * 0.82; float v = smoothstep(0.95, 0.28, length(vc)); col *= mix(1.0, v * 0.92 + 0.08, uVig);',
          ' col += uFlashCol * uFlash * (1.0 - smoothstep(0.0, 0.75, length(c)));',
          ' col += (hash(vUv * 917.0 + fract(uTime * 7.31)) - 0.5) * uGrain;',
          ' gl_FragColor = vec4(col, 1.0); }'].join('\n');
      const mkComp = defines => new THREE.ShaderMaterial({ depthTest: false, depthWrite: false, defines, uniforms: {
          tScene: { value: null }, tBloom: { value: null }, tBloom2: { value: null }, uBloom: { value: 0 }, uBloom2: { value: 0 }, uVig: { value: 1 }, uGrain: { value: 0.04 }, uTime: { value: 0 }, uGrade: { value: 1 },
          uPunch: { value: 0 }, uFlash: { value: 0 }, uFlashCol: { value: new THREE.Color() }, uSat: { value: 1 }, uBlood: V7U.blood, uAspect: { value: 1.6 },
          tLutA: { value: LUT.cold }, tLutB: { value: LUT.blood }, tLutC: { value: LUT.cine }, uLut: { value: 0.85 }, uCine: { value: 0 },
          tDepth: { value: null }, tGod: { value: null }, tDof: { value: null }, uGodK: { value: 0 }, uDof: { value: 0 }, uFocus: { value: 6 }, uMist: { value: 0.5 }, uMistCol: { value: new THREE.Color(0x232b38) },
          uNear: { value: 0.1 }, uFar: { value: 140 }, uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() },
          uTorch: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] } }, vertexShader: vs, fragmentShader: compFrag });
      this.comp = mkComp({ USE_LUT: 1 });                                                                       // Medium
      this.compHi = this.depthOK ? mkComp({ USE_LUT: 1, USE_DEPTH: 1, USE_GOD: 1, USE_SHIMMER: 1 }) : this.comp;  // High
      this.compLo = mkComp({});                                                                                    // fallback (no LUT)
      this.scene = new THREE.Scene(); this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1); this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.comp); this.quad.frustumCulled = false; this.scene.add(this.quad);
      this.ready = true;
    } catch (e) { console.warn('[Veynhold] post init failed', e); this.ready = false; }
  },
  size() { renderer.getDrawingBufferSize(this.sz); const w = Math.max(4, this.sz.x | 0), h = Math.max(4, this.sz.y | 0); if (w === this.w && h === this.h) return; this.w = w; this.h = h;
    this.rt.setSize(w, h); if (this.rt.depthTexture) { this.rt.depthTexture.image.width = w; this.rt.depthTexture.image.height = h; }
    const hw = Math.max(2, w >> 1), hh = Math.max(2, h >> 1), qw = Math.max(2, w >> 2), qh = Math.max(2, h >> 2); this.bA.setSize(hw, hh); this.bB.setSize(hw, hh); this.bC.setSize(qw, qh); this.bD.setSize(qw, qh);
    this.gA.setSize(qw, qh); this.gB.setSize(qw, qh); this.dA.setSize(qw, qh); this.dB.setSize(qw, qh); },
  pass(mat, target) { this.quad.material = mat; renderer.setRenderTarget(target); renderer.render(this.scene, this.cam); },
  punch(a) { this.punchA = Math.min(0.05, this.punchA + a * VISUAL.punch); },
  flash(rgb, a) { if (a * VISUAL.flashFx >= this.flashA) { this.flashCol.setRGB(rgb[0], rgb[1], rgb[2]); this.flashA = Math.min(0.9, a * VISUAL.flashFx); } },
  desat(dur, floor) { this.desatT = 0; this.desatDur = dur; this.desatFloor = floor === undefined ? 0.25 : floor; },
  decay(dt) { this.punchA *= Math.exp(-dt * 16); if (this.punchA < 1e-4) this.punchA = 0; this.flashA *= Math.exp(-dt * 7); if (this.desatDur > 0) { this.desatT += dt; if (this.desatT >= this.desatDur) this.desatDur = 0; } },
  sat() { if (this.desatDur <= 0) return 1; const u = this.desatT / this.desatDur; const f = this.desatFloor === undefined ? 0.25 : this.desatFloor; return f + (1 - f) * (u < 0.65 ? 0 : (u - 0.65) / 0.35); },
  render(T, now) {
    this.size(); const hi = !!(T.depthFx && this.depthOK), mat = hi ? this.compHi : T.lut ? this.comp : this.compLo, C = mat.uniforms; renderer.setRenderTarget(this.rt); renderer.render(scene, camera);
    const lv = T.bloom; C.uBloom.value = 0; C.uBloom2.value = 0;
    if (lv > 0 && VISUAL.bloom > 0) {
      this.bright.uniforms.tSrc.value = this.rt.texture; this.bright.uniforms.uTexel.value.set(1 / this.w, 1 / this.h); this.bright.uniforms.uTh.value = VISUAL.bloomThreshold; this.pass(this.bright, this.bA);
      const hw = this.bA.width, hh = this.bA.height; this.blur.uniforms.tSrc.value = this.bA.texture; this.blur.uniforms.uDir.value.set(1 / hw, 0); this.pass(this.blur, this.bB);
      this.blur.uniforms.tSrc.value = this.bB.texture; this.blur.uniforms.uDir.value.set(0, 1 / hh); this.pass(this.blur, this.bA); C.uBloom.value = 0.55 * VISUAL.bloom;
      if (lv > 1) { const qw = this.bC.width, qh = this.bC.height; this.blur.uniforms.tSrc.value = this.bA.texture; this.blur.uniforms.uDir.value.set(1.5 / qw, 0); this.pass(this.blur, this.bD);
        this.blur.uniforms.tSrc.value = this.bD.texture; this.blur.uniforms.uDir.value.set(0, 1.5 / qh); this.pass(this.blur, this.bC); C.uBloom2.value = 0.45 * VISUAL.bloom; }
    }
    if (hi) {
      C.tDepth.value = this.rt.depthTexture; C.uNear.value = camera.near; C.uFar.value = camera.far; C.uInvProj.value.copy(camera.projectionMatrixInverse); C.uCamWorld.value.copy(camera.matrixWorld);
      C.uMist.value = VISUAL.mist; C.uMistCol.value.setRGB(0.12 + 0.12 * V7U.blood.value, 0.15 - 0.08 * V7U.blood.value, 0.21 - 0.12 * V7U.blood.value);
      // god rays from the moon when it is on screen
      const mv = this.moonScr.copy(Sky.moonDir).multiplyScalar(100).add(camera.position).project(camera); const onS = mv.z < 1 && Math.abs(mv.x) < 1.6 && Math.abs(mv.y) < 1.6;
      const gk = onS ? VISUAL.godRays * clamp(1.6 - Math.max(Math.abs(mv.x), Math.abs(mv.y)), 0, 1) : 0; C.uGodK.value = gk * (1 + V7U.blood.value * 0.6);
      if (gk > 0.01) { this.god.uniforms.tScene.value = this.rt.texture; this.god.uniforms.tDepth.value = this.rt.depthTexture; this.god.uniforms.uSun.value.set(mv.x * 0.5 + 0.5, mv.y * 0.5 + 0.5); this.pass(this.god, this.gA);
        this.blur.uniforms.tSrc.value = this.gA.texture; this.blur.uniforms.uDir.value.set(1 / this.gA.width, 1 / this.gA.height); this.pass(this.blur, this.gB); C.tGod.value = this.gB.texture; }
      // cinematic depth of field (intros / deathblows only): quarter-res blurred copy, mixed by circle of confusion
      C.uDof.value = this.dof * VISUAL.dof; C.uFocus.value = this.dofFocus;
      if (C.uDof.value > 0.01) { const qw = this.dA.width, qh = this.dA.height; this.blur.uniforms.tSrc.value = this.rt.texture; this.blur.uniforms.uDir.value.set(2 / qw, 0); this.pass(this.blur, this.dB);
        this.blur.uniforms.tSrc.value = this.dB.texture; this.blur.uniforms.uDir.value.set(0, 2 / qh); this.pass(this.blur, this.dA); this.blur.uniforms.tSrc.value = this.dA.texture; this.blur.uniforms.uDir.value.set(1.5 / qw, 1.5 / qh); this.pass(this.blur, this.dB); C.tDof.value = this.dB.texture; }
      // torch heat shimmer
      for (let i = 0; i < 4; i++) { const u = C.uTorch.value[i], t = torchLights[i]; u.set(0, 0, 1, 0); if (!t || !T.shimmer) continue; this._v.copy(t.fl.position); this._v.y += 0.45; const d = this._v.distanceTo(camera.position); this._v.project(camera);
        if (this._v.z < 1 && Math.abs(this._v.x) < 1.2 && Math.abs(this._v.y) < 1.2 && d < 26) u.set(this._v.x * 0.5 + 0.5, this._v.y * 0.5 + 0.5, clamp(1.6 / d, 0.04, 0.4), clamp(1.4 - d / 22, 0, 1) * VISUAL.shimmer); }
    }
    C.uLut.value = T.lut ? VISUAL.lut : 0; C.uCine.value = this.cine;
    C.tScene.value = this.rt.texture; C.tBloom.value = this.bA.texture; C.tBloom2.value = this.bC.texture; C.uVig.value = VISUAL.postVignette; C.uGrain.value = T.grain ? VISUAL.grain : 0; C.uTime.value = now; C.uGrade.value = VISUAL.grade;
    C.uPunch.value = this.punchA; C.uFlash.value = this.flashA; C.uFlashCol.value.copy(this.flashCol); C.uSat.value = this.sat(); C.uAspect.value = this.w / this.h;
    this.quad.material = mat; renderer.setRenderTarget(null); renderer.render(this.scene, this.cam);
  },
};

/* ---------- combat VFX: streak sparks, glare sprites, ink splashes, ground stains, letterbox ---------- */
class Streaks {
  constructor(n) { this.n = n; this.pos = new Float32Array(n * 6); this.col = new Float32Array(n * 6); this.p = new Float32Array(n * 3); this.v = new Float32Array(n * 3); this.life = new Float32Array(n); this.max = new Float32Array(n); this.c = new Float32Array(n * 3); this.cursor = 0;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(this.col, 3)); this.geo = g;
    this.lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })); this.lines.frustumCulled = false; scene.add(this.lines); this.alive = 0; }
  burst(pos, n, speed, rgb, dirX, dirZ) { n = Math.ceil(n * tier().particles); for (let k = 0; k < n; k++) { const i = this.cursor; this.cursor = (this.cursor + 1) % this.n; const a = Math.random() * 6.283, el = -0.15 + Math.random() * 1.1, sp = (3 + Math.random() * 6) * speed;
      let vx = Math.cos(a) * Math.cos(el) * sp, vz = Math.sin(a) * Math.cos(el) * sp; if (dirX !== undefined) { vx += dirX * sp * 0.6; vz += dirZ * sp * 0.6; }
      this.p.set([pos.x, pos.y, pos.z], i * 3); this.v.set([vx, Math.sin(el) * sp + 1.2, vz], i * 3); this.life[i] = this.max[i] = 0.18 + Math.random() * 0.3; this.c.set(rgb, i * 3); } this.alive = 0.6; }
  update(dt) { if (this.alive <= 0) return; this.alive -= dt; const P = this.p, V = this.v, O = this.pos, C = this.col;
    for (let i = 0; i < this.n; i++) { const j = i * 3, o = i * 6; if (this.life[i] <= 0) { if (O[o + 1] > -50) { for (let q = 0; q < 6; q++) { O[o + q] = -100; C[o + q] = 0; } } continue; }
      this.life[i] -= dt; V[j + 1] -= 14 * dt; P[j] += V[j] * dt; P[j + 1] += V[j + 1] * dt; P[j + 2] += V[j + 2] * dt; const k = Math.max(0, this.life[i] / this.max[i]), tl = 0.035 + 0.02 * k;
      O[o] = P[j]; O[o + 1] = P[j + 1]; O[o + 2] = P[j + 2]; O[o + 3] = P[j] - V[j] * tl; O[o + 4] = P[j + 1] - V[j + 1] * tl; O[o + 5] = P[j + 2] - V[j + 2] * tl;
      C[o] = this.c[j] * k * 1.6; C[o + 1] = this.c[j + 1] * k * 1.6; C[o + 2] = this.c[j + 2] * k * 1.6; C[o + 3] = C[o + 4] = C[o + 5] = 0; }
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.color.needsUpdate = true; }
  clear() { this.life.fill(0); this.pos.fill(-100); this.col.fill(0); this.alive = 0.05; }
}
const VFX = {
  streaks: null, glares: [], inks: [], stains: [], stainCursor: 0, inkCursor: 0,
  init() { this.streaks = new Streaks(160);
    for (let i = 0; i < 5; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: V7Tex.glare(), color: 0xffffff, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, toneMapped: false })); s.visible = false; s.renderOrder = 20; scene.add(s); this.glares.push({ s, t: 0, dur: 0.2, size: 1 }); }
    for (let i = 0; i < 12; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: null, transparent: true, depthWrite: false })); s.visible = false; s.renderOrder = 5; scene.add(s); this.inks.push({ s, t: 0, dur: 0.5, size: 1 }); }
    const sg = new THREE.PlaneGeometry(1, 1); sg.rotateX(-Math.PI / 2);
    for (let i = 0; i < 16; i++) { const m = new THREE.MeshBasicMaterial({ map: null, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, opacity: 0 }); const pl = new THREE.Mesh(sg, m); pl.visible = false; scene.add(pl); this.stains.push({ m: pl, t: 0, life: 9 }); } },
  glare(pos, rgb, size, dur) { const g = this.glares.find(q => !q.s.visible) || this.glares[0]; g.s.visible = true; g.s.position.copy(pos); g.s.material.color.setRGB(rgb[0], rgb[1], rgb[2]); g.t = 0; g.dur = dur || 0.22; g.size = size; },
  splash(pos, heavy, side) { const T = tier(), kind = Settings.hitStyle === 'blood' ? 'blood' : 'ink'; const n = heavy ? 2 : 1;
    for (let k = 0; k < n; k++) { const pool = this.inks.slice(0, T.inkSprites); const q = pool.find(x => !x.s.visible) || pool[this.inkCursor++ % pool.length]; if (!q) return;
      q.s.material.map = V7Tex.splat(kind, 3 + ((Math.random() * 3) | 0)); q.s.material.needsUpdate = true; q.s.material.rotation = Math.random() * 6.283; q.s.material.opacity = 1; q.s.visible = true;
      q.s.position.set(pos.x + (Math.random() - 0.5) * 0.25 + (side || 0) * 0.15, pos.y + (Math.random() - 0.3) * 0.25, pos.z + (Math.random() - 0.5) * 0.25); q.t = 0; q.dur = heavy ? 0.65 : 0.5; q.size = (heavy ? 1.25 : 0.85) * VISUAL.inkSize * (k ? 0.7 : 1); } },
  stain(x, z, size) { const T = tier(); if (!T.inkStains) return; const pool = this.stains.slice(0, T.inkStains); const q = pool[this.stainCursor++ % pool.length]; const kind = Settings.hitStyle === 'blood' ? 'blood' : 'ink';
    q.m.material.map = V7Tex.splat(kind, 6 + ((Math.random() * 3) | 0)); q.m.material.needsUpdate = true; q.m.visible = true; q.t = 0; const s = (size || 1) * (0.8 + Math.random() * 0.6) * VISUAL.inkSize; q.m.scale.set(s, 1, s); q.m.rotation.y = Math.random() * 6.283;
    q.m.position.set(x + (Math.random() - 0.5) * 0.6, 0.016 + (this.stainCursor % 16) * 0.0006, z + (Math.random() - 0.5) * 0.6); },
  update(dt) { if (this.streaks) this.streaks.update(dt);
    for (const g of this.glares) if (g.s.visible) { g.t += dt; const u = g.t / g.dur; if (u >= 1) { g.s.visible = false; continue; } const s = g.size * (0.6 + 0.6 * Math.sqrt(u)); g.s.scale.set(s * 1.6, s, 1); g.s.material.opacity = (1 - u) * (1 - u); }
    for (const q of this.inks) if (q.s.visible) { q.t += dt; const u = q.t / q.dur; if (u >= 1) { q.s.visible = false; continue; } const s = q.size * (0.35 + 0.65 * Math.min(1, u * 5)); q.s.scale.set(s, s, 1); q.s.material.opacity = u < 0.5 ? 1 : 1 - (u - 0.5) / 0.5; q.s.position.y -= dt * 0.25; }
    for (const q of this.stains) if (q.m.visible) { q.t += dt; const u = q.t / q.life; if (u >= 1) { q.m.visible = false; continue; } q.m.material.opacity = (u < 0.03 ? u / 0.03 : 1) * (u > 0.7 ? 1 - (u - 0.7) / 0.3 : 1) * 0.85; } },
  clear() { if (this.streaks) this.streaks.clear(); this.glares.forEach(g => g.s.visible = false); this.inks.forEach(q => q.s.visible = false); this.stains.forEach(q => q.m.visible = false); PostFX.punchA = PostFX.flashA = 0; PostFX.desatDur = 0; Letterbox.set(false); },
};
const Letterbox = { on: false, t: 0, set(on, dur) { if (!VISUAL.letterbox && on) return; this.on = on; this.t = dur || 0; const el = $('lbox'); if (el) el.classList.toggle('on', on); }, update(dt) { if (this.on && this.t > 0) { this.t -= dt; if (this.t <= 0) this.set(false); } } };

/* ---------- boss name card ---------- */
const EPITHETS = { duelist: 'Sworn fencer of the western gate', warden: 'Keeper of the breach, iron to the bone', brother: 'He smiles behind the mask', king: 'Last oath of Veynhold', trainer: 'A memory of every blade you have faced' };
const NameCard = {   // JS-driven so it plays the same at any frame rate (and in headless tests)
  t: 0, on: false,
  show(name, epithet, boss) { const el = $('nameCard'); if (!el) return; $('ncName').textContent = name; $('ncEpi').textContent = epithet || ''; el.classList.toggle('boss', !!boss); el.classList.add('show'); this.t = 0; this.on = true; this.update(0); },
  hide() { const el = $('nameCard'); this.on = false; if (el) { el.classList.remove('show'); el.style.opacity = 0; } },
  update(dt) { if (!this.on) return; this.t += Math.min(dt, 0.05); const t = this.t, el = $('nameCard'); if (!el) return;
    const a = t < 0.45 ? t / 0.45 : t < 2.7 ? 1 : Math.max(0, 1 - (t - 2.7) / 0.7); el.style.opacity = a.toFixed(3);
    const k = Math.max(0, 1 - t / 0.6); $('ncName').style.letterSpacing = (0.42 + 0.45 * k * k).toFixed(3) + 'em'; el.style.filter = k > 0.01 ? 'blur(' + (5 * k * k).toFixed(2) + 'px)' : 'none';
    for (const r of el.querySelectorAll('.ncRule')) r.style.width = Math.min(80, 15 + t / 0.7 * 65).toFixed(1) + '%';
    if (t > 3.4) this.hide(); },
};


/* =====================================================================
   v8 — CINEMATICS. Presentation clock only: nothing here advances, pauses or edits the combat sim.
   Boss intro (sim held at tick 0 until it ends or any input skips it; the skipping input is NOT consumed),
   final-deathblow finisher cameras per boss, victory title card, death fade, camera impulses, DOF / letterbox weights.
   ===================================================================== */
const _cv = new THREE.Vector3(), _cv2 = new THREE.Vector3(), _cv3 = new THREE.Vector3();
const easeIO = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const Fade = { a: 0, to: 0, rate: 1.5, col: '0,0,0', last: -1,
  set(to, rate, col) { this.to = to; this.rate = rate || 1.5; if (col) this.col = col; },
  update(dt) { this.a += clamp(this.to - this.a, -this.rate * dt, this.rate * dt); const el = $('fade'); if (!el) return; if (Math.abs(this.a - this.last) > 0.003) { el.style.opacity = this.a.toFixed(3); el.style.background = `rgb(${this.col})`; this.last = this.a; } },
  clear() { this.a = this.to = 0; this.update(0); } };
const TitleCard = { t: 0, on: false, dur: 3.4,
  show(text, sub, kind) { const el = $('vcard'); if (!el) return; $('vcTitle').textContent = text; $('vcSub').textContent = sub || ''; el.className = 'show ' + (kind || ''); this.t = 0; this.on = true; this.update(0); },
  hide() { this.on = false; const el = $('vcard'); if (el) { el.className = ''; el.style.opacity = 0; } },
  update(dt) { if (!this.on) return; this.t += Math.min(dt, 0.05); const t = this.t, el = $('vcard'); if (!el) return; const a = t < 0.6 ? t / 0.6 : t < this.dur - 0.6 ? 1 : Math.max(0, (this.dur - t) / 0.6);
    el.style.opacity = a.toFixed(3); const k = Math.max(0, 1 - t / 0.9); $('vcTitle').style.letterSpacing = (0.3 + 0.35 * k * k).toFixed(3) + 'em'; el.style.filter = k > 0.01 ? 'blur(' + (4 * k * k).toFixed(2) + 'px)' : 'none';
    for (const r of el.querySelectorAll('.vcRule')) r.style.width = Math.min(70, 10 + t / 0.9 * 60).toFixed(1) + '%'; if (t > this.dur) this.hide(); } };
const INTRO_TRACKS = {
  duelist: [[0, null], [0.55, 'highGuard'], [1.25, 'highGuard'], [1.7, 'chiburi'], [2.35, 'chiburi'], [3.0, null]],                 // salute, then a flick of the blade
  warden:  [[0, null], [0.65, 'overheadHeavy_w'], [1.25, 'overheadHeavy_s'], [2.1, 'overheadHeavy_s'], [2.9, null]],                  // heaves the greatsword and plants it
  brother: [[0, 'kneelDown'], [0.7, 'kneelDown'], [1.35, 'riseHalf'], [2.0, 'bladeDrag'], [2.8, null]],                                 // rises from a crouch, blade dragging
  king:    [[0, null], [0.6, 'bladeDrag'], [1.35, 'highGuard'], [2.1, 'chiburi'], [3.0, null]],                                          // draws across, raises, flicks
};
const Intro = {
  enabled: !HEADLESS, active: false, t: 0, dur: 3.3, boss: null, out: 0, outDur: 0.55, card: null, pos: new THREE.Vector3(), look: new THREE.Vector3(), skipped: false, fov: 44,
  start(boss, card) { this.active = true; this.t = 0; this.out = 0; this.boss = boss; this.card = card; this.skipped = false; Letterbox.set(true, 0); audio.play('introSting'); },
  skip() { if (!this.active) return; this.skipped = true; this.end(); },
  end() { if (!this.active) return; this.active = false; this.out = this.outDur; Letterbox.set(false); if (this.card && !NameCard.on) NameCard.show(this.card[0], this.card[1], this.card[2]); this.card = null;
  },
  update(dt) { if (this.active) { this.t += dt; if (this.card && this.t > 0.55) { NameCard.show(this.card[0], this.card[1], this.card[2]); this.card = null; } if (this.t >= this.dur) this.end(); }
    else if (this.out > 0) this.out = Math.max(0, this.out - dt); },
  weight() { return this.active ? 1 : this.out > 0 ? easeIO(this.out / this.outDur) : 0; },
  camera(alpha) { const b = this.boss, w = Game.world; if (!b || !w) return false; const P = w.player, ls = (LOOKS[b.profile && b.profile.look] || LOOKS.duelist).scale;
    const bx = b.x, bz = b.z; let dx = P.x - bx, dz = P.z - bz; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l; const sx = dz, sz = -dx;
    const u = easeIO(clamp(this.t / this.dur, 0, 1)), arc = Math.sin(u * Math.PI) * 0.8;
    const p0x = bx + dx * 8.5 + sx * 3.6, p0z = bz + dz * 8.5 + sz * 3.6, p0y = 3.2, p1x = bx + dx * 3.3 + sx * 1.25, p1z = bz + dz * 3.3 + sz * 1.25, p1y = 1.45 * ls;
    this.pos.set(p0x + (p1x - p0x) * u + sx * arc, p0y + (p1y - p0y) * u, p0z + (p1z - p0z) * u + sz * arc);
    this.look.set(bx, (1.0 + 0.42 * u) * ls, bz); return true; },
};
const FINALE_CAMS = {   // per-boss finisher camera. t 0..1, M = midpoint, u = attacker->victim, s = side, V victim, A attacker; -u is the attacker's side
  duelist(t, M, ux, uz, sx, sz, V, pos, look) { const e = easeIO(t), a = 1.05 - 0.8 * e, r = 3.4 - 0.7 * e; pos.set(M.x + (sx * Math.cos(a) - ux * Math.sin(a)) * r, 1.3 - 0.1 * e, M.z + (sz * Math.cos(a) - uz * Math.sin(a)) * r); look.set(M.x + (V.x - M.x) * 0.6 * e, 1.25, M.z + (V.z - M.z) * 0.6 * e); },   // slow side orbit onto the heart pierce
  warden(t, M, ux, uz, sx, sz, V, pos, look) { const e = easeIO(t), r = 3.0 - 0.7 * e; pos.set(M.x + sx * r + ux * 0.5, 0.34 + 0.1 * e, M.z + sz * r + uz * 0.5); look.set(M.x + (V.x - M.x) * 0.5, 1.55 - 0.25 * e, M.z + (V.z - M.z) * 0.5); },   // worm's-eye push-in on the crown splitter
  brother(t, M, ux, uz, sx, sz, V, pos, look) { const e = easeIO(t), a = -0.9 + 2.3 * e, r = 3.1; pos.set(M.x + (sx * Math.cos(a) - ux * Math.sin(a)) * r, 1.5 - 0.2 * e, M.z + (sz * Math.cos(a) - uz * Math.sin(a)) * r); look.set(M.x, 1.15, M.z); },   // whip-pan through the turning cut
  king(t, M, ux, uz, sx, sz, V, pos, look, A) { const e = easeIO(t); const p0x = A.x - ux * 3.4 + sx * 0.8, p0z = A.z - uz * 3.4 + sz * 0.8, p1x = M.x + sx * 3.2 + ux * 0.4, p1z = M.z + sz * 3.2 + uz * 0.4;   // crane down from behind the Wanderer to a low profile under the blood moon
    pos.set(p0x + (p1x - p0x) * e, 4.4 - 3.45 * e, p0z + (p1z - p0z) * e); look.set(M.x + (V.x - M.x) * (0.3 + 0.4 * e), 1.0 + 0.35 * e, M.z + (V.z - M.z) * (0.3 + 0.4 * e)); },
};
const Finale = {
  active: false, t: 0, dur: 2.7, look: 'duelist', a: null, v: null, pos: new THREE.Vector3(), lk: new THREE.Vector3(), M: new THREE.Vector3(),
  start(att, vic) { this.active = true; this.t = 0; this.a = att; this.v = vic; this.look = (vic.profile && vic.profile.look) || 'duelist'; Letterbox.set(true, this.dur); Cine.slow(1.8, 0.22); PostFX.desat(2.2, 0.5); },
  update(dt) { if (!this.active) return; this.t += dt; if (this.t >= this.dur) this.active = false; },
  weight() { if (!this.active) return 0; const t = this.t; return t < 0.25 ? easeIO(t / 0.25) : t > this.dur - 0.55 ? easeIO(Math.max(0, (this.dur - t) / 0.55)) : 1; },
  camera() { const A = this.a, V = this.v; if (!A || !V) return false; let ux = V.x - A.x, uz = V.z - A.z; const l = Math.hypot(ux, uz) || 1; ux /= l; uz /= l; this.M.set((A.x + V.x) / 2, 0, (A.z + V.z) / 2);
    (FINALE_CAMS[this.look] || FINALE_CAMS.duelist)(clamp(this.t / this.dur, 0, 1), this.M, ux, uz, uz, -ux, V, this.pos, this.lk, A); return true; },
};
const VICTORY_TITLES = { king: ['THE OATH IS ENDED', "The King's First Blade has fallen"], default: ['OATHBREAKER SLAIN', ''] };
const Victory = {
  active: false, t: 0, total: 4.8, shown: false, game: null,
  start(game) { this.active = true; this.t = 0; this.shown = false; this.game = game; },
  finish() { if (!this.active) return; this.active = false; TitleCard.hide(); if (this.game) this.game.endEncounter(true); },
  update(dt) { if (!this.active) return; this.t += dt; const G = this.game;
    if (!G || G.state !== 'playing') { this.active = false; return; }
    if (this.t > 1.0) Fade.set(0.5, 0.9, '6,5,8');
    if (!this.shown && this.t > 1.25) { this.shown = true; const last = G.stage >= ENCOUNTERS[G.enc].length - 1, foe = (G.world && G.world.enemies().length === 0 && G.world.fighters.find(f => !f.isPlayer && f.profile)) || null;
      const lk = foe && foe.profile ? foe.profile.look : ''; const T = G.enc === 'practice' ? null : !last ? ['FOE VANQUISHED', 'The gauntlet continues'] : (VICTORY_TITLES[lk] || VICTORY_TITLES.default);
      if (T) { TitleCard.show(T[0], T[1] || ENC_NAMES[G.enc] || '', 'win'); audio.play('victorySting'); } }
    if (this.t >= this.total) this.finish(); },
};
const Death = {
  active: false, t: 0, total: 2.1, game: null,
  start(game) { this.active = true; this.t = 0; this.game = game; Fade.set(0.62, 0.45, '22,3,3'); Cine.slow(1.2, 0.45); PostFX.desat(1.8); },
  update(dt) { if (!this.active) return; this.t += dt; const G = this.game; if (!G || G.state !== 'playing') { this.active = false; return; } if (this.t >= this.total) { this.active = false; G.endEncounter(false); } },
};
/* directional camera impulse (critically damped spring), scaled by attack weight */
const CamFX = { off: new THREE.Vector3(), vel: new THREE.Vector3(), bigK: 0, bigV: { v: 0 },
  kick(dx, dz, k) { const l = Math.hypot(dx, dz) || 1; k *= VISUAL.camImpulse; this.vel.x += dx / l * k * 9; this.vel.z += dz / l * k * 9; this.vel.y -= k * 3.5; },
  update(dt) { const w = 16, kk = w * w, c = 2 * w; this.vel.addScaledVector(this.off, -kk * dt).multiplyScalar(Math.max(0, 1 - c * dt)); this.off.addScaledVector(this.vel, dt); if (this.off.lengthSq() > 0.25) this.off.setLength(0.5); },
  clear() { this.off.set(0, 0, 0); this.vel.set(0, 0, 0); this.bigK = 0; this.bigV.v = 0; } };
const Cinema = {
  update(dt) { Intro.update(dt); Finale.update(dt); Victory.update(dt); Death.update(dt); Fade.update(dt); TitleCard.update(dt); CamFX.update(dt);
    const T = tier(), iw = Intro.weight(), fw = Finale.weight(), cw = Cine.cam ? Math.min(1, Cine.camT / 0.3) * (Cine.camDur > 0 ? clamp((Cine.camDur - Cine.camT) / 0.4, 0, 1) : 0) : 0;
    const cineOn = Intro.active || Finale.active || (Victory.active && Victory.t > 0.9); if (cineOn !== this.cineOn) { this.cineOn = cineOn; document.body.classList.toggle('cine', cineOn); }
    const nc = $('nameCard'); if (nc) nc.classList.toggle('intro', Intro.active || Intro.out > 0);
    PostFX.dof = T.dof ? Math.max(iw, fw, cw * 0.7) : 0; const vc = Victory.active ? clamp((Victory.t - 0.8) / 1.0, 0, 1) : 0; PostFX.cine = Math.max(fw * 0.6, vc * 0.85); },
  /* after Cam.update: blend the gameplay camera toward the intro / finisher camera */
  camera(alpha) { let w = 0, pos = null, look = null, fov = 0;
    const iw = Intro.weight(); if (iw > 0 && Intro.camera(alpha)) { w = iw; pos = Intro.pos; look = Intro.look; fov = Intro.fov; }
    const fw = Finale.weight(); if (fw > 0 && Finale.camera()) { w = fw; pos = Finale.pos; look = Finale.lk; fov = 48; }
    if (w > 0.001) { camera.position.lerp(pos, w); _cv.copy(Cam.lookAt).lerp(look, w); camera.lookAt(_cv); const f = camera.fov + (fov - camera.fov) * w; if (Math.abs(camera.fov - f) > 0.01) { camera.fov = f; camera.updateProjectionMatrix(); }
      PostFX.dofFocus = camera.position.distanceTo(look); }
    else if (Cine.cam && Game.world) { const sub = Game.world.byId(Cine.cam); if (sub) PostFX.dofFocus = Math.hypot(sub.x - camera.position.x, sub.z - camera.position.z); }
    if (CamFX.off.lengthSq() > 1e-7) camera.position.add(CamFX.off); },
  anyInput() { if (Intro.active) Intro.skip(); if (Victory.active && Victory.t > 0.5) Victory.finish(); },
  clear() { this.cineOn = false; if (document.body) document.body.classList.remove('cine'); Intro.active = false; Intro.out = 0; Finale.active = false; Victory.active = false; Death.active = false; Fade.clear(); TitleCard.hide(); CamFX.clear(); PostFX.dof = 0; PostFX.cine = 0; },
};

/* ---------- character dressing: rim, steel, distinct boss silhouettes ---------- */
const V7Geo = {};
const v7g = (k, f) => V7Geo[k] || (V7Geo[k] = f());
function v7Mount(model, bone) { const b = model.byName[bone]; if (!b || !model.K.get(b)) return null; const g = new THREE.Group(); g.quaternion.copy(model.K.get(b)).invert(); b.add(g); return g; }
const V7_EXTRAS = {
  duelist(c, M, mat) { const h = v7Mount(M, 'HeadTop_End'); if (!h) return; const felt = mat(0x2a1d16, { roughness: 0.95 }), plume = mat(0x8e1a1c, { roughness: 0.9, side: THREE.DoubleSide });
    const brim = new THREE.Mesh(v7g('brim', () => new THREE.CylinderGeometry(0.3, 0.32, 0.025, 20)), felt); brim.position.set(0, -0.06, 0.01); brim.rotation.set(-0.12, 0, 0.1); h.add(brim);
    const crown = new THREE.Mesh(v7g('hatc', () => new THREE.CylinderGeometry(0.13, 0.15, 0.13, 14)), felt); crown.position.set(0, 0.0, 0); crown.rotation.copy(brim.rotation); h.add(crown);
    const pl = new THREE.Mesh(v7g('plume', () => { const g = new THREE.ConeGeometry(0.05, 0.62, 6); g.translate(0, 0.31, 0); return g; }), plume); pl.position.set(-0.1, 0.0, -0.04); pl.rotation.set(-1.05, 0.2, 0.55); h.add(pl);
    const pl2 = pl.clone(); pl2.scale.setScalar(0.7); pl2.rotation.set(-1.25, -0.2, 0.75); h.add(pl2); },
  warden(c, M, mat) { const steel = mat(0x5f646c, { roughness: 0.38, metalness: 0.85 }), dark = mat(0x23252a, { roughness: 0.6, metalness: 0.6 }); c.v7steel.push(steel, dark);
    for (const [bone, sx] of [['LeftArm', 1], ['RightArm', -1]]) { const m = v7Mount(M, bone); if (!m) continue;
      const pa = new THREE.Mesh(v7g('paul', () => new THREE.SphereGeometry(0.22, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55)), steel); pa.scale.set(1.25, 0.9, 1.15); pa.position.set(sx * 0.03, 0.04, 0); m.add(pa);
      for (let i = 0; i < 3; i++) { const sp = new THREE.Mesh(v7g('spike', () => new THREE.ConeGeometry(0.035, 0.24, 5)), dark); sp.position.set(sx * (0.06 + i * 0.07), 0.17 - i * 0.03, -0.04 + i * 0.05); sp.rotation.set(0, 0, -sx * (0.35 + i * 0.25)); m.add(sp); } }
    const h = v7Mount(M, 'HeadTop_End'); if (h) for (const sx of [1, -1]) { const horn = new THREE.Mesh(v7g('horn', () => { const g = new THREE.ConeGeometry(0.05, 0.42, 6); g.translate(0, 0.21, 0); return g; }), dark); horn.position.set(sx * 0.13, -0.08, 0); horn.rotation.set(0.25, 0, -sx * 0.95); h.add(horn); } },
  brother(c, M, mat) { const h = v7Mount(M, 'Head'); if (!h) return; const bone = mat(0xcfc6b4, { roughness: 0.55, emissive: 0x15120e }), cloth = mat(0x18201a, { roughness: 1, side: THREE.DoubleSide }), voidm = mat(0x000000, { roughness: 1 });
    const mask = new THREE.Mesh(v7g('mask', () => new THREE.SphereGeometry(0.105, 14, 10, -1.2, 2.4, 0.35, 1.6)), bone); mask.position.set(0, 0.1, 0.035); mask.scale.set(1, 1.15, 1); h.add(mask);
    for (const sx of [1, -1]) { const eye = new THREE.Mesh(v7g('eye', () => new THREE.BoxGeometry(0.04, 0.012, 0.02)), voidm); eye.position.set(sx * 0.038, 0.13, 0.135); eye.rotation.z = sx * 0.3; h.add(eye); }
    const hood = new THREE.Mesh(v7g('hood', () => { const g = new THREE.ConeGeometry(0.17, 0.5, 8, 1, true); g.translate(0, 0.25, 0); return g; }), cloth); hood.position.set(0, 0.12, -0.05); hood.rotation.x = -0.55; h.add(hood); },
  king(c, M, mat) { const h = v7Mount(M, 'HeadTop_End'); const gold = mat(0x8a6a2c, { roughness: 0.32, metalness: 0.9 }); c.v7steel.push(gold);
    if (h) { for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; const sp = new THREE.Mesh(v7g('kspike', () => { const g = new THREE.ConeGeometry(0.028, 0.34, 4); g.translate(0, 0.17, 0); return g; }), gold); const tall = i === 0 ? 1.35 : 1;
        sp.position.set(Math.sin(a) * 0.11, -0.06, Math.cos(a) * 0.11); sp.scale.set(1, tall, 1); sp.rotation.set(Math.cos(a) * 0.22, 0, -Math.sin(a) * 0.22); h.add(sp); }
      const haloM = new THREE.MeshBasicMaterial({ color: 0xd8c08a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }); c.v7mats.push(haloM); c.v7halo = haloM;
      const halo = new THREE.Mesh(v7g('khalo', () => new THREE.TorusGeometry(0.34, 0.012, 6, 40)), haloM); halo.position.set(0, -0.05, -0.2); h.add(halo); c.v7haloMesh = halo;
      const halo2 = new THREE.Mesh(v7g('khalo2', () => new THREE.TorusGeometry(0.27, 0.006, 4, 40)), haloM); halo2.position.set(0, -0.05, -0.21); h.add(halo2); }
    const sp = v7Mount(M, 'Spine1'); if (sp) { const fur = mat(0x1a1012, { roughness: 1 }); const collar = new THREE.Mesh(v7g('collar', () => new THREE.TorusGeometry(0.2, 0.085, 8, 18)), fur); collar.rotation.x = Math.PI / 2; collar.position.set(0, 0.3, -0.02); collar.scale.set(1.25, 1, 1); sp.add(collar); } },
};
function v7Dress(c) {
  for (const x of (c.v7extras || [])) if (x.parent) x.parent.remove(x); c.v7extras = []; (c.v7mats || []).forEach(m => m.dispose()); v7Unsteel(c.v7steel || []); c.v7mats = []; c.v7steel = []; c.v7halo = null; c.v7haloMesh = null;
  const rimCol = c.f.isPlayer ? 0x9db5e6 : 0x8ea0cc;
  const mats = c.model ? c.model.mats : c.mats; for (const m of mats) { if (/^(Blade|Edge|PhaseII_Cracks)$/.test(m.name)) continue; v7Rim(m, rimCol); }
  if (c.clothCape) v7Rim(c.clothCape.mesh.material, rimCol); if (c.clothScarf) v7Rim(c.clothScarf.mesh.material, rimCol); if (c.clothSash) v7Rim(c.clothSash.mesh.material, rimCol);
  if (c.model) { const byN = c.model.matByName; (byN.Blade || []).forEach(m => { v7Steel(m, 1.5, 0.16); c.v7steel.push(m); }); (byN.Edge || []).forEach(m => { v7Steel(m, 1.0); c.v7steel.push(m); });
    (byN.Armor || []).forEach(m => { v7Steel(m, 0.7, 0.4); c.v7steel.push(m); }); (byN.Trim || []).forEach(m => { if (m.metalness > 0.5) { v7Steel(m, 0.6); c.v7steel.push(m); } }); }
  else { v7Steel(c.bladeMat, 1.5, 0.16); c.v7steel.push(c.bladeMat); }
  const mk = (color, o) => { const m = new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.7, metalness: 0.1 }, o || {})); v7Rim(m, rimCol); c.v7mats.push(m); return m; };
  const f = c.model && V7_EXTRAS[c.lookKey]; if (f) { const before = new Set(); c.model.root.traverse(o => before.add(o)); f(c, c.model, mk);
    c.model.root.traverse(o => { if (!before.has(o) && o.parent && before.has(o.parent)) c.v7extras.push(o); if (o.isMesh && !before.has(o)) { o.castShadow = true; o.frustumCulled = false; } }); }
  for (const m of c.v7steel) v7Steel(m, m.userData.envK || 0.7);
  c.v7rimCol = rimCol;
}

/* ---------- tier application for every v7 effect ---------- */
function v7ApplyTier(T) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = VISUAL.exposure;
  Sky.apply(T); Ash.apply(T); FogBank.apply(T);
  for (const m of V7Mats.surfaces) { const u = m.userData; const wantN = T.normalMaps && u.normal ? u.normal : null, wantB = wantN ? null : (u.height || null);
    if (m.normalMap !== wantN || m.bumpMap !== wantB) { m.normalMap = wantN; m.bumpMap = wantB; if (wantN) m.normalScale.set(u.nK || 1, u.nK || 1); m.bumpScale = u.bK || 0.03; m.needsUpdate = true; } }
  for (const m of V7Mats.steel) v7ApplyEnv(m);
  const vg = $('vign'); if (vg) vg.style.display = T.post && PostFX.ready ? 'none' : 'block';
  hemi.intensity = (T.torches ? 0.46 : 0.7) * VISUAL.ambient; moon.intensity = 1.15 * VISUAL.moonLight; rim.intensity = 0.95;
  // v8 tiers
  V7U.wrapK.value = T.wrap ? VISUAL.wrap : 0;
  { const sc = moon.shadow.camera, b = T.shadowBox || 18; if (sc.right !== b) { sc.left = -b; sc.right = b; sc.top = b; sc.bottom = -b; sc.updateProjectionMatrix(); } moon.shadow.normalBias = T.shadowBox < 14 ? 0.015 : 0; }
  if (Arena.floorMat) { const want = T.wetFloor && Arena.wetMap ? Arena.wetMap : null; if (Arena.floorMat.roughnessMap !== want) { Arena.floorMat.roughnessMap = want; Arena.floorMat.roughness = want ? 0.97 : 0.86; Arena.floorMat.needsUpdate = true; } const wantEnv = want && T.env && V7Mats.env ? V7Mats.env : null; if (Arena.floorMat.envMap !== wantEnv) { Arena.floorMat.envMap = wantEnv; Arena.floorMat.needsUpdate = true; } Arena.floorMat.envMapIntensity = 0.12; }   // v8 fix: stepping down to Low also clears the floor reflection (it used to stay on after Medium/High)
  TorchEmbers.apply(T);
}
function v7Update(dt, now) { V7U.time.value = now; V7U.wind.value = VISUAL.wind; V7U.rim.value = 0.42 * VISUAL.rim; renderer.toneMappingExposure = VISUAL.exposure;
  Atmos.update(dt); Sky.update(); FogBank.update(dt, now); VFX.update(dt); Letterbox.update(dt); PostFX.decay(dt); NameCard.update(dt);
  // King: rim + halo follow Phase II
  for (const c of Game.chars.values()) { const bk = c.look.crimson ? V7U.blood.value : 0; if (c.v7halo) { c.v7halo.color.setRGB(0.85 + 0.15 * bk, 0.75 - 0.65 * bk, 0.54 - 0.5 * bk); if (c.v7haloMesh) c.v7haloMesh.rotation.z = now * (0.2 + bk * 0.8); }
    if (c.look.crimson && c.model) for (const m of c.model.mats) if (m.userData.v7rim) m.userData.v7rim.value.setHex(c.v7rimCol || 0x8ea0cc).lerp(new THREE.Color(1, 0.12, 0.06), bk * 0.9);
    if (c.edgeFlash > 0) c.edgeFlash = Math.max(0, c.edgeFlash - dt * 3.2); }
}
function v7Render(now) { const T = tier(); if (PostFX.ready && T.post) PostFX.render(T, now); else { if (GLR) renderer.setRenderTarget(null); renderer.render(scene, camera); } }


/* ---------- Verlet cloth strip (capes, scarves): pinned top row, distance constraints, body push-out ---------- */
class ClothStrip {
  constructor(o) {
    this.cols = o.cols; this.rows = o.rows; this.w = o.width; this.len = o.length; this.anchorObj = o.anchor; this.anchors = o.anchors; this.n = this.cols * this.rows;
    this.p = new Float32Array(this.n * 3); this.q = new Float32Array(this.n * 3); this.acc = 0; this.ready = false; this.push = o.push || 0.14;
    this.dx = this.cols > 1 ? this.w / (this.cols - 1) : 0; this.dy = this.len / (this.rows - 1);
    const g = new THREE.BufferGeometry(); this.pos = new Float32Array(this.n * 3); g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    const uv = new Float32Array(this.n * 2), idx = [];
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) { const i = r * this.cols + c; uv[i * 2] = c / Math.max(1, this.cols - 1); uv[i * 2 + 1] = 1 - r / (this.rows - 1);
      if (r < this.rows - 1 && c < this.cols - 1) idx.push(i, i + this.cols, i + 1, i + 1, i + this.cols, i + this.cols + 1); }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx); this.geo = g;
    this.mesh = new THREE.Mesh(g, o.material); this.mesh.frustumCulled = false; this.mesh.castShadow = true; this.mesh.receiveShadow = true; scene.add(this.mesh);
    this.tmp = new THREE.Vector3();
  }
  anchor(c, out) { const a = this.anchors[c]; out.set(a[0], a[1], a[2]); return out.applyMatrix4(this.anchorObj.matrixWorld); }
  reset() { for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) { this.anchor(c, this.tmp); const i = (r * this.cols + c) * 3; this.p[i] = this.q[i] = this.tmp.x; this.p[i + 1] = this.q[i + 1] = this.tmp.y - r * this.dy; this.p[i + 2] = this.q[i + 2] = this.tmp.z; } this.ready = true; }
  kick(x, y, z) { for (let i = this.cols; i < this.n; i++) { const k = (i / this.cols | 0) / (this.rows - 1); this.q[i * 3] -= x * k; this.q[i * 3 + 1] -= y * k; this.q[i * 3 + 2] -= z * k; } }
  update(dt, hipsW, fwdX, fwdZ, now) {
    if (!this.ready) this.reset();
    this.anchor(0, this.tmp); if (Math.abs(this.tmp.x - this.p[0]) + Math.abs(this.tmp.z - this.p[2]) > 3) this.reset();      // teleport (restart)
    this.acc += Math.min(dt, 0.05); const h = 1 / 60, iters = tier().clothIters, P = this.p, Q = this.q, stiff = VISUAL.clothStiff, drag = 1 - VISUAL.clothDrag;
    const wind = 0.6 + Math.sin(now * 0.7) * 0.4 + Math.sin(now * 2.3) * 0.2;
    while (this.acc >= h) { this.acc -= h;
      for (let i = this.cols; i < this.n; i++) { const j = i * 3; const vx = (P[j] - Q[j]) * drag, vy = (P[j + 1] - Q[j + 1]) * drag, vz = (P[j + 2] - Q[j + 2]) * drag;
        Q[j] = P[j]; Q[j + 1] = P[j + 1]; Q[j + 2] = P[j + 2]; P[j] += vx + 0.35 * wind * h * h; P[j + 1] += vy - 9.8 * h * h; P[j + 2] += vz + 0.2 * wind * h * h; }
      for (let c = 0; c < this.cols; c++) { this.anchor(c, this.tmp); const j = c * 3; P[j] = Q[j] = this.tmp.x; P[j + 1] = Q[j + 1] = this.tmp.y; P[j + 2] = Q[j + 2] = this.tmp.z; }
      for (let it = 0; it < iters; it++) {
        for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) { const i = r * this.cols + c;
          if (c < this.cols - 1) this.solve(i, i + 1, this.dx, stiff, r === 0); if (r < this.rows - 1) this.solve(i, i + this.cols, this.dy, stiff, r === 0); }
        // keep cloth behind the body: half-space behind the hips plus a little bulge
        for (let i = this.cols; i < this.n; i++) { const j = i * 3, d = (P[j] - hipsW.x) * fwdX + (P[j + 2] - hipsW.z) * fwdZ; if (d > -this.push) { const k = d + this.push; P[j] -= fwdX * k; P[j + 2] -= fwdZ * k; }
          if (P[j + 1] < 0.03) P[j + 1] = 0.03; }
      }
    }
    this.pos.set(P); this.geo.attributes.position.needsUpdate = true; this.geo.computeVertexNormals(); this.geo.computeBoundingSphere();
  }
  solve(a, b, rest, k, pinA) { const P = this.p, ja = a * 3, jb = b * 3; const dx = P[jb] - P[ja], dy = P[jb + 1] - P[ja + 1], dz = P[jb + 2] - P[ja + 2]; const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
    const diff = (d - rest) / d * k; if (pinA && a < this.cols) { P[jb] -= dx * diff; P[jb + 1] -= dy * diff; P[jb + 2] -= dz * diff; return; }
    P[ja] += dx * diff * 0.5; P[ja + 1] += dy * diff * 0.5; P[ja + 2] += dz * diff * 0.5; P[jb] -= dx * diff * 0.5; P[jb + 1] -= dy * diff * 0.5; P[jb + 2] -= dz * diff * 0.5; }
  setVisible(v) { this.mesh.visible = v; if (v) this.ready = false; }
  dispose() { scene.remove(this.mesh); this.geo.dispose(); }
}

/* ---------- screen-edge pulses (DOM, nearly free) ---------- */
const Post = {
  a: 0, col: '0,0,0', last: -1,
  pulse(rgb, strength) { if (strength * VISUAL.vignette >= this.a) { this.col = rgb; this.a = Math.min(1, strength * VISUAL.vignette); } },
  update(dt) { this.a *= Math.exp(-dt * 4.5); const el = $('pulse'); if (!el) return; const a = this.a < 0.01 ? 0 : this.a;
    if (Math.abs(a - this.last) > 0.005 || (a === 0 && this.last !== 0)) { el.style.opacity = a.toFixed(3); el.style.background = `radial-gradient(ellipse at center, rgba(${this.col},0) 45%, rgba(${this.col},0.85) 100%)`; this.last = a; } },
  clear() { this.a = 0; this.update(0); },
};

/* ---------- cinematic beats: presentation time scale + camera override (sim stays fixed-tick and deterministic) ---------- */
const Cine = {
  t: 0, dur: 0, scale: 1, cam: null, camT: 0, camDur: 0,
  slow(dur, scale) { if (VISUAL.slowmo >= 0.999) return; this.t = 0; this.dur = dur; this.scale = Math.max(scale, Math.min(VISUAL.slowmo, 0.22)); },
  focus(fighterId, dur) { this.cam = fighterId; this.camT = 0; this.camDur = dur; },
  timeScale(dt) { if (this.dur <= 0) return 1; this.t += dt; const u = this.t / this.dur; if (u >= 1) { this.dur = 0; return 1; } return this.scale + (1 - this.scale) * (u < 0.6 ? 0 : (u - 0.6) / 0.4); },
  camWeight(dt) { if (!this.cam) return 0; this.camT += dt; const u = this.camT / this.camDur; if (u >= 1) { this.cam = null; return 0; } return Math.sin(Math.min(1, u) * Math.PI) ** 0.6; },
  clear() { this.dur = 0; this.cam = null; },
};

/* ---------- event-driven juice: impulses, cloth, pulses, cinematics (presentation only) ---------- */
const Juice = {
  pending: [],
  onEvent(e, w, G) {
    const A = e.a && G.chars.get(e.a), D = e.d && G.chars.get(e.d);
    const away = (from, to, k) => { if (!from || !to) return; const dx = to.f.x - from.f.x, dz = to.f.z - from.f.z, l = Math.hypot(dx, dz) || 1; to.clothKick(dx / l * k, 0.01 * k, dz / l * k); };
    switch (e.type) {
      case 'hit': { if (!D) break; const k = e.finisher ? 1.8 : e.dmg >= 22 ? 1.6 : e.dmg >= 14 ? 1 : 0.6, sgn = e.dir === 'L' ? 1 : e.dir === 'R' ? -1 : 0;
        D.impulse({ headX: -4.5 * k, lean: -3 * k, twist: 5 * sgn * k, side: 3 * sgn * k, hipY: -0.6 * k, rSx: 2 * k, lSx: 2 * k }); away(A, D, 0.05 * k);
        if (A) A.impulse({ rE: 2.5, wX: 3, twist: -1.5 });                               // the blade bites, then follows through
        if (D.f.isPlayer) { Post.pulse('140,10,8', 0.32 * k); if (k >= 1.6) Cam.kickFov(2); }
        if (A) CamFX.kick(D.f.x - A.f.x, D.f.z - A.f.z, (D.f.isPlayer || A.f.isPlayer ? 1 : 0.4) * (e.finisher ? 0.15 : e.heavy || e.dmg >= 22 ? 0.11 : 0.05)); break; }
      case 'block': case 'guardbreak': { if (D) { D.impulse({ rE: 6, rSx: 4, lE: 4, lean: -3.5, hipY: -0.8, headX: -2 }, e.heavy ? 1.5 : 1); away(A, D, 0.03); if (D.f.isPlayer) Post.pulse('255,190,110', e.heavy ? 0.2 : 0.1); }
        if (A) A.impulse({ wX: -5, rSx: -3, lean: -1.5 }); break; }
      case 'deflect': { if (D) { D.impulse({ wX: -8, wZ: 4, twist: -4, rE: -3, lean: 1.5 }); if (D.f.isPlayer) Post.pulse('255,225,160', e.heavy ? 0.3 : 0.2); }
        if (A && D) CamFX.kick(D.f.x - A.f.x, D.f.z - A.f.z, e.heavy ? 0.07 : 0.04);
        if (A) { A.impulse({ rSx: -9, wX: -9, lean: -4, twist: 5, headX: -2 }, e.heavy ? 1.3 : 1); away(D, A, 0.02); } break; }
      case 'mikiri': { if (A) { A.impulse({ lean: -7, headX: -6, hipY: -1.2, rSx: -6 }); away(D, A, 0.06); } if (D) D.impulse({ lean: 4, hipY: -1.5 });
        Post.pulse('255,220,140', 0.4); Cine.slow(0.3, 0.45); break; }
      case 'jumpKick': { if (D) { D.impulse({ lean: -8, headX: -7, hipY: -1, twist: 3 }); away(A, D, 0.08); } Post.pulse('255,207,106', 0.25); break; }
      case 'postureBreak': { const c = G.chars.get(e.f); if (c) { c.impulse({ lean: -6, hipY: -1.6, headX: -5, rSx: 4, lSx: 4 }); c.clothKick(0, 0.03, 0); const pf = w.player; if (pf && c.f !== pf) CamFX.kick(c.f.x - pf.x, c.f.z - pf.z, 0.12); }
        const f = w.byId(e.f); if (f && f.isPlayer) Post.pulse('160,20,10', 0.55); else { Post.pulse('255,200,90', 0.35); Cine.slow(0.35, 0.5); } break; }
      case 'deathblow': { const vic = w.byId(e.d), att = w.byId(e.a), final = vic && !vic.isPlayer && vic.marks <= 1 && w.enemies().filter(x => x !== vic && !x.dead).length === 0 && !(w.training) && Game.enc !== 'practice';
        if (final && att) { Finale.start(att, vic); Cine.focus(e.d, Finale.dur); } else { Cine.slow(1.0, VISUAL.slowmo); Cine.focus(e.d, 1.7); Letterbox.set(true, 2.0); PostFX.desat(1.6); }
        Post.pulse('255,245,230', 0.45); this.pending.push({ at: w.time + 0.45, id: e.d, a: e.a }); if (vic && att) CamFX.kick(vic.x - att.x, vic.z - att.z, 0.2); break; }
      case 'phase2': { Cine.focus(e.f, 2.2); Post.pulse('180,10,10', 0.6); const c = G.chars.get(e.f); if (c) { FX.flash(c.root.position.clone().setY(1.6), 0xff2a1a, 9); c.clothKick(0, 0.05, 0); } break; }
      case 'dodge': { const c = G.chars.get(e.f); if (c && c.f) c.clothKick(-c.f.dodgeDx * 0.06, 0.01, -c.f.dodgeDz * 0.06); break; }
      case 'jump': { const c = G.chars.get(e.f); if (c) c.clothKick(0, -0.04, 0); break; }
    }
  },
  update(w, G) {   // deathblow payoff lands on the sim's own timeline (respects slow-mo and hit-stop)
    for (let i = this.pending.length - 1; i >= 0; i--) { const p = this.pending[i]; if (w.time < p.at) continue; this.pending.splice(i, 1); const c = G.chars.get(p.id); if (!c) continue;
      const pos = c.root.position.clone().setY(1.2); FX.spark(pos, 46, 1.5, [1, 0.25, 0.15]); FX.flecks(pos, 24); VFX.splash(pos, true, 0); VFX.splash(pos.clone().setY(1.45), true, 1); VFX.stain(pos.x, pos.z, 1.8); VFX.glare(pos, [1, 0.3, 0.2], 3.6, 0.3); PostFX.punch(0.025); FX.ring(pos, 0xff3020, 11, 0.55); FX.flash(pos, 0xff4030, 8); FX.kick(0.22); Cam.kickFov(-4);
      Post.pulse('120,0,0', 0.7); c.impulse({ lean: 7, headX: 6, hipY: -2 }); const a = G.chars.get(p.a); if (a) a.impulse({ lean: 3, rSx: 4, wX: 5 }); c.clothKick(0, 0.06, 0); }
  },
  clear() { this.pending.length = 0; },
};

/* =====================================================================
   CHARACTER — procedural rig + pose library
   ===================================================================== */
const LOOKS = {
  player:  { scale: 1.0, cloth: 0x252a33, armor: 0x5b5f66, trim: 0x8b1a1a, skin: 0xb08a72, helm: 'hood', blade: 0.98, bladeW: 0.045, cape: 0x1d2027, scarf: 0x8b1a1a },
  duelist: { scale: 1.0, cloth: 0x4a3626, armor: 0x7c7f84, trim: 0x6b5233, skin: 0xa07a62, helm: 'kettle', blade: 1.0, bladeW: 0.05, sash: 0x7a1a18 },
  warden:  { scale: 1.22, cloth: 0x3a3a3e, armor: 0x6f737a, trim: 0x3d3d40, skin: 0x8d8d8d, helm: 'great', blade: 1.45, bladeW: 0.11, bulky: true, cape: 0x2a2c30 },
  brother: { scale: 0.98, cloth: 0x1f2a22, armor: 0x3c4038, trim: 0x55603d, skin: 0x9e7c66, helm: 'cowl', blade: 0.95, bladeW: 0.04, curved: true, cape: 0x18201a },
  king:    { scale: 1.06, cloth: 0x4a0f12, armor: 0x24272d, trim: 0x8e1b1f, skin: 0x8f8f8f, helm: 'crown', blade: 1.15, bladeW: 0.055, cape: 0x5a0c10, crimson: true },
};
const P0 = { yaw: 0, hipY: 0, lean: 0, side: 0, twist: 0, headX: 0, rSx: 0, rSy: 0, rSz: 0, rE: 0, wX: 0, wZ: 0, lSx: 0, lSy: 0, lSz: 0, lE: 0, lLeg: 0, rLeg: 0, lKnee: 0, rKnee: 0, legSpread: 0 };
const POSES = {
  ready:   { hipY: -0.06, lean: 0.12, twist: 0.25, rSx: -0.55, rSy: 0.25, rSz: -0.12, rE: -0.95, wX: -0.85, lSx: -0.7, lSy: -0.55, lSz: 0.2, lE: -1.05, lLeg: -0.25, rLeg: 0.2, lKnee: 0.35, rKnee: 0.3, legSpread: 0.12 },
  guard:   { hipY: -0.12, lean: 0.18, twist: -0.1, rSx: -1.05, rSy: 0.65, rSz: -0.2, rE: -1.1, wX: -0.55, wZ: 0.9, lSx: -0.95, lSy: -0.7, lE: -1.2, lLeg: -0.3, rLeg: 0.25, lKnee: 0.45, rKnee: 0.4, legSpread: 0.15 },
  parry:   { hipY: -0.1, lean: 0.1, twist: -0.35, rSx: -1.2, rSy: 0.8, rSz: -0.25, rE: -1.05, wX: -1.15, wZ: 0.8, lSx: -0.9, lSy: -0.7, lE: -1.2, lLeg: -0.35, rLeg: 0.3, lKnee: 0.4, rKnee: 0.35, legSpread: 0.15 },
  // windup / strike pairs per attack style
  overhead_w: { hipY: -0.02, lean: -0.15, twist: 0.35, rSx: -2.8, rSy: 0.2, rE: -0.55, wX: -0.65, lSx: -2.2, lSy: -0.5, lE: -0.9, lLeg: -0.4, rLeg: 0.35, lKnee: 0.25, rKnee: 0.25 },
  overhead_s: { hipY: -0.2, lean: 0.5, twist: -0.1, rSx: -1.25, rSy: 0.15, rE: -0.15, wX: -0.25, lSx: -0.9, lSy: -0.4, lE: -0.6, lLeg: -0.65, rLeg: 0.45, lKnee: 0.7, rKnee: 0.25 },
  overheadHeavy_w: { hipY: 0.02, lean: -0.3, twist: 0.6, rSx: -3.0, rSy: 0.4, rE: -0.8, wX: -0.8, lSx: -2.6, lSy: -0.3, lE: -1.0, lLeg: -0.2, rLeg: 0.5, lKnee: 0.15, rKnee: 0.45 },
  overheadHeavy_s: { hipY: -0.32, lean: 0.7, twist: -0.2, rSx: -0.95, rSy: 0.1, rE: -0.05, wX: -0.1, lSx: -0.8, lSy: -0.4, lE: -0.4, lLeg: -0.9, rLeg: 0.6, lKnee: 1.0, rKnee: 0.35 },
  sideR_w: { hipY: -0.08, lean: 0.05, twist: -0.8, rSx: -0.25, rSy: -0.55, rSz: -1.45, rE: -0.45, wX: -0.2, lSx: -0.4, lSy: -0.2, lE: -0.6, lLeg: -0.3, rLeg: 0.35, lKnee: 0.3, rKnee: 0.3 },
  sideR_s: { hipY: -0.14, lean: 0.25, twist: 0.7, rSx: -0.3, rSy: 2.35, rSz: -1.35, rE: -0.15, wX: -0.1, lSx: -0.2, lSy: 0.3, lE: -0.4, lLeg: -0.55, rLeg: 0.35, lKnee: 0.5, rKnee: 0.25 },
  sideL_w: { hipY: -0.08, lean: 0.05, twist: 0.75, rSx: -0.35, rSy: 2.45, rSz: -1.3, rE: -0.6, wX: -0.2, lSx: -0.3, lSy: 0.2, lE: -0.6, lLeg: -0.3, rLeg: 0.3, lKnee: 0.3, rKnee: 0.3 },
  sideL_s: { hipY: -0.14, lean: 0.25, twist: -0.75, rSx: -0.3, rSy: -0.5, rSz: -1.4, rE: -0.15, wX: -0.1, lSx: -0.5, lSy: -0.4, lE: -0.6, lLeg: -0.55, rLeg: 0.4, lKnee: 0.5, rKnee: 0.25 },
  thrust_w: { hipY: -0.15, lean: -0.05, twist: 0.7, rSx: 0.35, rSy: 0.1, rSz: -0.15, rE: -1.9, wX: 0.15, lSx: -1.0, lSy: -0.4, lE: -0.4, lLeg: -0.2, rLeg: 0.55, lKnee: 0.35, rKnee: 0.45 },
  thrust_s: { hipY: -0.28, lean: 0.55, twist: -0.25, rSx: -1.55, rSy: 0.05, rSz: -0.05, rE: -0.05, wX: 0.0, lSx: 0.5, lSy: 0.2, lE: -0.3, lLeg: -0.95, rLeg: 0.7, lKnee: 0.9, rKnee: 0.1 },
  sweep_w: { hipY: -0.32, lean: 0.25, twist: -0.9, rSx: 0.2, rSy: -0.6, rSz: -1.05, rE: -0.3, wX: 0.1, lSx: -0.5, lE: -0.6, lLeg: -0.7, rLeg: 0.45, lKnee: 1.1, rKnee: 0.7, legSpread: 0.25 },
  sweep_s: { hipY: -0.42, lean: 0.45, twist: 0.85, rSx: 0.3, rSy: 2.4, rSz: -0.95, rE: -0.1, wX: 0.15, lSx: -0.2, lSy: 0.4, lE: -0.3, lLeg: -0.9, rLeg: 0.55, lKnee: 1.3, rKnee: 0.8, legSpread: 0.3 },
  grab_w: { hipY: -0.1, lean: -0.1, twist: 0.2, rSx: 0.4, rSz: -0.5, rE: -0.6, wX: 0.6, lSx: 0.2, lSz: 0.8, lE: -0.8, lLeg: -0.3, rLeg: 0.4, lKnee: 0.3, rKnee: 0.4 },
  grab_s: { hipY: -0.2, lean: 0.6, twist: 0, rSx: -1.45, rSy: -0.35, rE: -0.2, wX: 0.9, lSx: -1.45, lSy: 0.35, lE: -0.2, lLeg: -0.8, rLeg: 0.5, lKnee: 0.8, rKnee: 0.2 },
  hit:     { hipY: -0.05, lean: -0.45, twist: 0.3, headX: -0.4, rSx: -0.2, rSz: -0.5, rE: -0.6, wX: -0.4, lSx: -0.3, lSz: 0.6, lE: -0.4, lLeg: 0.3, rLeg: -0.2, lKnee: 0.2, rKnee: 0.5 },
  recoil:  { hipY: -0.08, lean: -0.3, twist: 0.6, headX: -0.25, rSx: -2.3, rSy: -0.6, rSz: -0.6, rE: -0.3, wX: -0.6, lSx: -0.4, lSz: 0.5, lE: -0.5, lLeg: 0.35, rLeg: -0.25, lKnee: 0.25, rKnee: 0.45 },
  broken:  { hipY: -0.48, lean: 0.75, twist: 0.1, headX: 0.5, rSx: -0.15, rSz: -0.25, rE: -0.2, wX: 0.4, lSx: -0.4, lSz: 0.2, lE: -0.6, lLeg: -1.45, rLeg: 0.15, lKnee: 1.6, rKnee: 2.0, legSpread: 0.1 },
  dodge:   { hipY: -0.38, lean: 0.55, twist: 0, headX: 0.2, rSx: -0.4, rSz: -0.4, rE: -1.0, wX: -0.2, lSx: -0.5, lSz: 0.4, lE: -1.0, lLeg: -0.9, rLeg: 0.7, lKnee: 1.2, rKnee: 0.9 },
  jump:    { hipY: 0.0, lean: 0.2, rSx: -1.3, rSz: -0.4, rE: -0.9, wX: -0.6, lSx: -1.0, lSz: 0.5, lE: -0.8, lLeg: -1.1, rLeg: -0.4, lKnee: 1.6, rKnee: 1.5 },
  exec:    { hipY: -0.35, lean: 0.65, twist: -0.2, rSx: -1.5, rSy: 0.05, rE: 0, wX: 0, lSx: -1.2, lSy: -0.3, lE: -0.2, lLeg: -1.0, rLeg: 0.7, lKnee: 1.0, rKnee: 0.15 },
  execW:   { hipY: -0.1, lean: -0.1, twist: 0.6, rSx: 0.4, rSy: 0.1, rE: -1.9, wX: 0.15, lSx: -1.1, lE: -0.4, lLeg: -0.3, rLeg: 0.5, lKnee: 0.3, rKnee: 0.4 },
  kneelDown: { hipY: -0.55, lean: 1.0, headX: 0.8, rSx: 0.1, rSz: -0.3, rE: -0.1, wX: 0.4, lSx: 0.2, lSz: 0.2, lE: -0.1, lLeg: -1.5, rLeg: 0.1, lKnee: 1.7, rKnee: 2.1 },
  transition: { hipY: -0.5, lean: 0.4, headX: 0.6, rSx: -0.4, rSz: -0.2, rE: -0.6, wX: 0.9, lSx: -0.2, lSz: 0.3, lE: -0.5, lLeg: -1.4, rLeg: 0.1, lKnee: 1.6, rKnee: 1.9 },
  highGuard: { hipY: -0.1, lean: 0.1, twist: 0.4, rSx: -2.5, rSy: 0.3, rSz: -0.3, rE: -0.9, wX: -0.4, lSx: -2.2, lSy: -0.6, lE: -1.2, lLeg: -0.35, rLeg: 0.3, lKnee: 0.4, rKnee: 0.35, legSpread: 0.15 },
  dead:    { hipY: -0.55, lean: 1.0, headX: 0.6, rSx: 0.3, rSz: -0.6, lSx: 0.3, lSz: 0.6, lLeg: -1.5, rLeg: -1.2, lKnee: 1.8, rKnee: 1.6 },
};

Object.assign(POSES, {
  hitF:     POSES.hit,
  hitL:     { hipY: -0.06, lean: -0.25, side: 0.35, twist: -0.5, headX: -0.3, rSx: -0.3, rSz: -0.6, rE: -0.7, wX: -0.4, lSx: -0.2, lSz: 0.7, lE: -0.4, lLeg: 0.25, rLeg: -0.15, lKnee: 0.2, rKnee: 0.45 },
  hitR:     { hipY: -0.06, lean: -0.25, side: -0.35, twist: 0.5, headX: -0.3, rSx: -0.4, rSz: -0.2, rE: -0.9, wX: -0.4, lSx: -0.3, lSz: 0.3, lE: -0.6, lLeg: -0.15, rLeg: 0.25, lKnee: 0.45, rKnee: 0.2 },
  hitB:     { hipY: -0.2, lean: -0.6, headX: -0.5, twist: 0.2, rSx: 0.2, rSz: -0.9, rE: -0.3, wX: 0.3, lSx: 0.3, lSz: 0.9, lE: -0.2, lLeg: 0.5, rLeg: -0.4, lKnee: 0.6, rKnee: 0.7 },
  blockHit: { hipY: -0.22, lean: -0.2, twist: -0.05, rSx: -0.85, rSy: 0.6, rSz: -0.15, rE: -1.35, wX: -0.45, wZ: 0.9, lSx: -0.8, lSy: -0.7, lE: -1.4, lLeg: -0.1, rLeg: 0.45, lKnee: 0.55, rKnee: 0.6, legSpread: 0.18 },
  parrySnap:{ hipY: -0.12, lean: 0.22, twist: -0.5, rSx: -1.2, rSy: 0.95, rSz: -0.25, rE: -1.1, wX: -1.25, wZ: 0.75, lSx: -0.9, lSy: -0.8, lE: -1.2, lLeg: -0.45, rLeg: 0.35, lKnee: 0.45, rKnee: 0.4, legSpread: 0.16 },
  deflected:{ hipY: -0.08, lean: -0.32, twist: 0.5, headX: -0.2, rSx: -2.0, rSy: -0.3, rSz: -0.6, rE: -0.4, wX: -0.8, lSx: -0.5, lSz: 0.5, lE: -0.6, lLeg: 0.25, rLeg: -0.2, lKnee: 0.3, rKnee: 0.5 },
  mikiri:   { hipY: -0.4, lean: 0.5, twist: 0.1, rSx: -0.6, rSz: -0.4, rE: -0.6, wX: -0.4, lSx: -0.5, lSz: 0.6, lE: -0.4, lLeg: -1.1, rLeg: 0.6, lKnee: 0.4, rKnee: 1.2 },
  kick:     { hipY: 0.05, lean: -0.35, rSx: -0.8, rSz: -0.6, rE: -0.6, wX: -0.4, lSx: -0.4, lSz: 0.8, lE: -0.5, lLeg: -1.6, rLeg: 0.3, lKnee: 0.1, rKnee: 0.9 },
});
for (const k in POSES) POSES[k] = Object.assign({}, P0, POSES[k]);
const KEYS = Object.keys(P0);
const ARM_KEYS = ['rSx', 'rSy', 'rSz', 'rE', 'wX', 'wZ', 'twist', 'lean'];
const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const easeOut = t => 1 - (1 - t) * (1 - t) * (1 - t);
const easeOutExpo = t => t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
const easeInQuad = t => t * t;
const settle = k => 1 - Math.exp(-6 * k) * Math.cos(7.5 * k);          // damped spring: tiny overshoot, then rest
function lerpPose(out, a, b, t) { for (const k of KEYS) out[k] = a[k] + (b[k] - a[k]) * t; return out; }
// 5-key families: anticipation -> windup -> strike -> overshoot -> follow-through (then a damped settle to guard)
const FAMILY = {};
for (const st of ['overhead', 'overheadHeavy', 'sideR', 'sideL', 'thrust', 'sweep', 'grab']) {
  const W = POSES[st + '_w'], S = POSES[st + '_s'], R = POSES.ready;
  const Ant = lerpPose({}, R, W, 0.3); Ant.lean -= 0.1; Ant.hipY -= 0.05; Ant.twist -= (W.twist - R.twist) * 0.15;   // small counter-move before the coil
  const O = Object.assign({}, S); for (const k of ARM_KEYS) O[k] = S[k] + (S[k] - W[k]) * 0.14;
  O.hipY = S.hipY - 0.04;
  const F = lerpPose({}, O, R, 0.35); F.lean = O.lean * 0.7;
  FAMILY[st] = { A: Ant, W, S, O, F };
}
const visT = (f, t, alpha, dt) => f.frozen ? t : Math.max(0, t - (1 - alpha) * dt);
/* ===== v5 animation set: new attack families, reactions, deathblows, stances ===== */
const NEWPOSES = {
  spin_w:      { hipY: -0.12, lean: 0.15, twist: 1.0, rSx: -0.5, rSy: -0.6, rSz: -1.4, rE: -0.5, wX: -0.2, lSx: -0.4, lSz: 0.5, lE: -0.7, lLeg: -0.4, rLeg: 0.35, lKnee: 0.5, rKnee: 0.4, legSpread: 0.2 },
  spin_s:      { hipY: -0.2, lean: 0.25, twist: -0.3, rSx: -0.3, rSy: 1.6, rSz: -1.45, rE: -0.1, wX: -0.1, lSx: -0.3, lSz: 0.9, lE: -0.3, lLeg: -0.5, rLeg: 0.4, lKnee: 0.6, rKnee: 0.4, legSpread: 0.25 },
  rising_w:    { hipY: -0.35, lean: 0.45, twist: 0.6, rSx: 0.45, rSy: -0.2, rSz: -0.4, rE: -0.3, wX: 0.5, lSx: -0.6, lSz: 0.3, lE: -0.9, lLeg: -0.8, rLeg: 0.5, lKnee: 1.1, rKnee: 0.7, legSpread: 0.2 },
  rising_s:    { hipY: 0.02, lean: -0.25, twist: -0.35, headX: -0.3, rSx: -2.9, rSy: 0.3, rSz: -0.2, rE: -0.2, wX: -0.6, lSx: -1.8, lSz: 0.2, lE: -0.5, lLeg: -0.3, rLeg: 0.4, lKnee: 0.1, rKnee: 0.2 },
  dashCut_w:   { hipY: -0.3, lean: 0.5, twist: 0.5, rSx: -0.2, rSy: -0.4, rSz: -1.2, rE: -0.6, wX: -0.1, lSx: -0.4, lE: -0.8, lLeg: -0.8, rLeg: 0.6, lKnee: 0.9, rKnee: 0.6 },
  dashCut_s:   { hipY: -0.3, lean: 0.5, twist: -0.6, rSx: -0.3, rSy: 2.2, rSz: -1.3, rE: -0.1, wX: -0.1, lSx: -0.2, lSz: 0.5, lE: -0.4, lLeg: -0.9, rLeg: 0.6, lKnee: 0.9, rKnee: 0.3 },
  runThrust_w: { hipY: -0.2, lean: 0.35, twist: 0.8, rSx: 0.4, rSy: 0.2, rE: -2.0, wX: 0.2, lSx: -1.1, lSy: -0.3, lE: -0.6, lLeg: -0.6, rLeg: 0.6, lKnee: 0.6, rKnee: 0.6 },
  runThrust_s: { hipY: -0.38, lean: 0.75, twist: -0.3, rSx: -1.6, rE: -0.02, lSx: 0.7, lSz: 0.4, lE: -0.2, lLeg: -1.2, rLeg: 0.9, lKnee: 1.0, rKnee: 0.05, legSpread: 0.05 },
  plunge_w:    { hipY: 0.05, lean: -0.2, twist: 0.2, headX: -0.2, rSx: -3.0, rSy: 0.2, rE: -0.9, wX: -1.1, lSx: -2.7, lE: -1.1, lLeg: -1.2, rLeg: -0.3, lKnee: 1.6, rKnee: 1.2 },
  plunge_s:    { hipY: -0.45, lean: 0.8, headX: 0.3, rSx: -0.7, rE: -0.05, wX: 0.25, lSx: -0.6, lE: -0.3, lLeg: -1.3, rLeg: 0.5, lKnee: 1.6, rKnee: 1.2 },
  riposte_w:   { hipY: -0.15, lean: -0.05, twist: 0.9, rSx: 0.3, rSy: 0.1, rSz: -0.3, rE: -1.8, wX: 0.1, lSx: -0.9, lSz: 0.4, lE: -0.5, lLeg: -0.3, rLeg: 0.6, lKnee: 0.4, rKnee: 0.5 },
  riposte_s:   { hipY: -0.32, lean: 0.7, twist: -0.4, rSx: -1.5, rSy: -0.1, rE: -0.02, wX: 0.05, lSx: 0.6, lSz: 0.5, lE: -0.2, lLeg: -1.0, rLeg: 0.8, lKnee: 0.95, rKnee: 0.1 },
  wave_w:      { hipY: -0.25, lean: 0.1, twist: -1.1, rSx: -0.2, rSy: -0.7, rSz: -1.5, rE: -0.4, wX: -0.3, lSx: -1.4, lSy: 0.4, lE: -0.3, lLeg: -0.5, rLeg: 0.5, lKnee: 0.7, rKnee: 0.5, legSpread: 0.3 },
  wave_s:      { hipY: -0.3, lean: 0.45, twist: 1.0, rSx: -0.25, rSy: 2.6, rSz: -1.4, rE: -0.05, wX: -0.05, lSx: -0.3, lSy: -0.6, lSz: 0.8, lE: -0.2, lLeg: -0.8, rLeg: 0.6, lKnee: 0.9, rKnee: 0.3, legSpread: 0.3 },
  // reactions
  hitF2:    { hipY: -0.05, lean: -0.4, twist: -0.35, headX: -0.35, rSx: -0.3, rSz: -0.3, rE: -0.8, wX: -0.3, lSx: -0.4, lSz: 0.7, lE: -0.3, lLeg: 0.25, rLeg: -0.25, lKnee: 0.45, rKnee: 0.25 },
  stumble:  { hipY: -0.25, lean: -0.55, side: 0.25, twist: 0.6, headX: -0.5, rSx: 0.3, rSz: -0.9, rE: -0.3, wX: 0.4, lSx: 0.2, lSz: 1.0, lE: -0.3, lLeg: 0.55, rLeg: -0.45, lKnee: 0.4, rKnee: 0.8 },
  // deathblows (executioner)
  execHighW:   { hipY: -0.05, lean: -0.2, twist: 0.1, headX: -0.2, rSx: -3.0, rSy: 0.1, rE: -0.6, wX: -1.3, lSx: -2.8, lSy: -0.2, lE: -0.8, lLeg: -0.5, rLeg: 0.3, lKnee: 0.3, rKnee: 0.3 },
  execHighS:   { hipY: -0.5, lean: 0.9, headX: 0.3, rSx: -1.0, rE: -0.1, wX: 0.5, lSx: -0.9, lE: -0.2, lLeg: -1.3, rLeg: 0.8, lKnee: 1.5, rKnee: 0.3 },
  execSideW:   { hipY: -0.2, lean: 0.3, twist: -0.9, rSx: -0.25, rSy: -0.6, rSz: -1.45, rE: -0.45, wX: -0.2, lSx: -0.4, lSy: -0.2, lE: -0.6, lLeg: -0.5, rLeg: 0.4, lKnee: 0.6, rKnee: 0.4 },
  execSideS:   { hipY: -0.28, lean: 0.4, twist: 0.8, rSx: -0.3, rSy: 2.5, rSz: -1.35, rE: -0.05, wX: -0.1, lSx: -0.2, lSy: 0.4, lE: -0.4, lLeg: -0.7, rLeg: 0.4, lKnee: 0.7, rKnee: 0.3 },
  spinThrough: { yaw: 2.4, hipY: -0.25, lean: 0.35, twist: 0.9, rSx: -0.2, rSy: 2.0, rSz: -1.3, rE: -0.05, wX: -0.1, lSx: -0.3, lSz: 0.7, lE: -0.3, lLeg: -0.7, rLeg: 0.5, lKnee: 0.8, rKnee: 0.4 },
  execPull:    { hipY: -0.15, lean: -0.1, twist: 0.4, rSx: -0.6, rE: -1.2, wX: -0.6, lSx: -0.4, lSz: 0.3, lE: -0.6, lLeg: 0.2, rLeg: -0.1, lKnee: 0.3, rKnee: 0.4 },
  chiburi:     { hipY: -0.08, lean: 0.05, twist: -0.3, rSx: -0.25, rSy: -0.8, rSz: -1.1, rE: -0.2, wX: 0.4, lSx: -0.3, lSz: 0.2, lE: -0.6, lLeg: -0.2, rLeg: 0.2, lKnee: 0.2, rKnee: 0.2 },
  // deathblows (victim)
  pierced:  { hipY: -0.15, lean: -0.5, headX: -0.7, rSx: 0.3, rSz: -1.2, rE: -0.2, wX: 0.6, lSx: 0.3, lSz: 1.2, lE: -0.2, lLeg: 0.2, rLeg: -0.1, lKnee: 0.5, rKnee: 0.5 },
  crushed:  { hipY: -0.55, lean: 0.6, headX: 0.7, rSx: 0.2, rSz: -0.5, wX: 0.5, lSx: 0.2, lSz: 0.5, lLeg: -1.3, rLeg: 0.2, lKnee: 1.9, rKnee: 2.1, legSpread: 0.2 },
  cutSpin:  { hipY: -0.2, lean: -0.2, side: 0.5, twist: 1.1, headX: -0.4, rSx: 0.2, rSz: -1.3, wX: 0.5, lSx: 0.4, lSz: 1.3, lLeg: 0.3, rLeg: -0.3, lKnee: 0.5, rKnee: 0.9 },
  kneelPlant: { hipY: -0.5, lean: 0.45, headX: 0.6, rSx: -0.9, rSy: 0.1, rE: -0.5, wX: 1.0, lSx: 0.1, lSz: 0.25, lE: -0.4, lLeg: -1.5, rLeg: 0.2, lKnee: 1.6, rKnee: 2.1 },
  // King phase II awakening
  riseHalf:  { hipY: -0.3, lean: 0.3, headX: 0.2, rSx: -0.5, rE: -0.4, wX: 1.2, lSx: -0.3, lSz: 0.4, lE: -0.5, lLeg: -0.9, rLeg: 0.3, lKnee: 1.1, rKnee: 0.9 },
  bladeDrag: { hipY: -0.2, lean: 0.2, twist: -0.8, headX: 0.1, rSx: 0.4, rSy: -0.6, rSz: -0.6, rE: -0.2, wX: 0.9, lSx: -1.1, lSy: 0.6, lE: -1.6, lLeg: -0.5, rLeg: 0.4, lKnee: 0.6, rKnee: 0.5 },
  roar:      { hipY: -0.05, lean: -0.45, headX: -0.6, twist: 0.1, rSx: 0.2, rSz: -1.1, rE: -0.2, wX: 0.8, lSx: 0.2, lSz: 1.2, lE: -0.3, lLeg: -0.3, rLeg: 0.3, lKnee: 0.3, rKnee: 0.3, legSpread: 0.2 },
};
for (const k in NEWPOSES) POSES[k] = Object.assign({}, P0, NEWPOSES[k]);
/* per-character combat stances: each fighter reads differently at rest */
const STANCE_DEF = {
  player:  {},
  duelist: { hipY: -0.05, lean: 0.05, twist: -0.45, rSx: -1.2, rSy: 0.35, rSz: -0.1, rE: -0.7, wX: -1.05, lSx: -0.2, lSy: 0, lSz: 0.5, lE: -0.4, lLeg: -0.3, rLeg: 0.25, lKnee: 0.35, rKnee: 0.25, legSpread: 0.2 },
  warden:  { hipY: -0.1, lean: 0.2, twist: 0.15, headX: 0.1, rSx: -0.35, rSy: 0.2, rSz: -0.1, rE: -0.6, wX: -0.3, lSx: -0.5, lSy: -0.5, lSz: 0.1, lE: -0.9, lLeg: -0.2, rLeg: 0.2, lKnee: 0.4, rKnee: 0.4, legSpread: 0.22 },
  brother: { hipY: -0.2, lean: 0.35, twist: 0.35, rSx: -0.2, rSy: -0.4, rSz: -0.5, rE: -0.8, wX: 0.6, lSx: -0.9, lSy: -0.2, lSz: 0.3, lE: -1.3, lLeg: -0.35, rLeg: 0.3, lKnee: 0.7, rKnee: 0.6, legSpread: 0.14 },
  king:    { hipY: -0.03, lean: 0.02, twist: 0.1, rSx: -0.9, rSy: 0.4, rSz: -0.1, rE: -1.0, wX: -0.9, lSx: -0.3, lSy: 0, lSz: 0.15, lE: -0.5, lLeg: -0.2, rLeg: 0.18, lKnee: 0.25, rKnee: 0.2, legSpread: 0.08 },
  king2:   { hipY: -0.28, lean: 0.45, twist: 0.55, headX: -0.15, rSx: 0.35, rSy: -0.3, rSz: -0.6, rE: -0.3, wX: 0.9, lSx: -1.3, lSy: -0.3, lSz: 0, lE: -0.4, lLeg: -0.45, rLeg: 0.35, lKnee: 0.8, rKnee: 0.5, legSpread: 0.2 },
};
const STANCES = {}; for (const k in STANCE_DEF) STANCES[k] = Object.assign({}, POSES.ready, STANCE_DEF[k]);
const stanceKey = (look, f) => look === 'king' && f.phase === 2 ? 'king2' : (STANCES[look] ? look : 'player');
/* personality: how big each character's windups read (warden heaves, brother snaps) */
const PERSONA = { player: 1, duelist: 1, warden: 1.15, brother: 0.92, king: 1.05, king2: 1.12 };
const ALL_STYLES = ['overhead', 'overheadHeavy', 'sideR', 'sideL', 'thrust', 'sweep', 'grab', 'spin', 'rising', 'dashCut', 'runThrust', 'plunge', 'riposte', 'wave'];
/* family = anticipation, windup, strike, overshoot, follow-through — built against the fighter's own stance; kind shapes the follow-through */
const FAM_CACHE = {};
function famFor(sk, style, kind) {
  const key = sk + '|' + style + '|' + kind; if (FAM_CACHE[key]) return FAM_CACHE[key];
  const R = STANCES[sk] || POSES.ready, W0 = POSES[style + '_w'], S = POSES[style + '_s'], amp = (PERSONA[sk] || 1) * (kind === 'danger' ? 1.12 : 1);
  const W = Object.assign({}, W0); for (const k of ARM_KEYS) W[k] = R[k] + (W0[k] - R[k]) * amp; W.hipY = W0.hipY - (kind === 'danger' ? 0.05 : 0);
  const Ant = lerpPose({}, R, W, kind === 'danger' ? 0.4 : 0.3); Ant.lean -= kind === 'heavy' || kind === 'danger' ? 0.16 : 0.1; Ant.hipY -= 0.05; Ant.twist -= (W.twist - R.twist) * 0.15;
  const over = kind === 'heavy' ? 0.26 : kind === 'danger' ? 0.2 : 0.14;
  const O = Object.assign({}, S); for (const k of ARM_KEYS) O[k] = S[k] + (S[k] - W[k]) * over; O.hipY = S.hipY - (kind === 'heavy' ? 0.08 : 0.04);
  const F = lerpPose({}, O, R, kind === 'heavy' ? 0.22 : 0.35); F.lean = O.lean * (kind === 'heavy' ? 0.85 : 0.7);
  return (FAM_CACHE[key] = { A: Ant, W, S, O, F, R });
}
const kindOf = d => d.danger ? 'danger' : (d.heavy || d.finisher) ? 'heavy' : 'light';
/* keyframe tracks: [time, poseName | null (= own stance)] sampled with smoothstep between keys */
const TRACKS = {
  exec_duelist: [[0, 'execW'], [0.38, 'exec'], [0.8, 'exec'], [1.02, 'execPull'], [1.3, null]],
  exec_warden:  [[0, 'execHighW'], [0.42, 'execHighS'], [0.9, 'execHighS'], [1.15, 'chiburi'], [1.3, null]],
  exec_brother: [[0, 'execSideW'], [0.3, 'execSideS'], [0.62, 'spinThrough'], [0.98, 'spinThrough'], [1.3, null]],
  exec_king1:   [[0, 'kick'], [0.22, 'execW'], [0.5, 'exec'], [0.9, 'exec'], [1.1, 'execPull'], [1.3, null]],
  exec_kingF:   [[0, 'execHighW'], [0.45, 'overheadHeavy_s'], [0.95, 'overheadHeavy_s'], [1.2, 'chiburi'], [1.3, null]],
  vic_duelist:  [[0, 'broken'], [0.38, 'pierced'], [0.75, 'pierced'], [1.1, 'kneelDown'], [1.3, 'kneelDown']],
  vic_warden:   [[0, 'broken'], [0.42, 'crushed'], [1.3, 'crushed']],
  vic_brother:  [[0, 'broken'], [0.3, 'cutSpin'], [0.7, 'cutSpin'], [1.3, 'dead']],
  vic_king1:    [[0, 'broken'], [0.5, 'pierced'], [0.85, 'kneelPlant'], [1.3, 'kneelPlant']],
  vic_kingF:    [[0, 'broken'], [0.45, 'crushed'], [1.0, 'kneelDown'], [1.3, 'kneelDown']],
  awaken:       [[0, 'kneelPlant'], [0.6, 'kneelPlant'], [1.1, 'riseHalf'], [1.5, 'bladeDrag'], [1.85, 'roar'], [2.4, 'king2']],
  flourish:     [[0, null], [0.3, 'chiburi'], [0.65, 'chiburi'], [1.15, null]],
};
const smooth01 = t => t * t * (3 - 2 * t);
function sampleTrack(out, tr, t, stance) {
  const P = n => n === null ? stance : (STANCES[n] || POSES[n]);
  if (t <= tr[0][0]) return lerpPose(out, P(tr[0][1]), P(tr[0][1]), 1);
  for (let i = 0; i < tr.length - 1; i++) { const a = tr[i], b = tr[i + 1]; if (t <= b[0]) return lerpPose(out, P(a[1]), P(b[1]), smooth01((t - a[0]) / Math.max(1e-4, b[0] - a[0]))); }
  const l = tr[tr.length - 1]; return lerpPose(out, P(l[1]), P(l[1]), 1);
}
const DEATH_FALL = { player: [-1.35, 0], duelist: [-1.35, 0], warden: [1.25, 0], brother: [-0.3, 1.3], king: [1.2, 0] };
let V8_AO = null; function V8AOTex() { if (V8_AO) return V8_AO; V8_AO = canvasTex(64, 64, (g, w, h) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }); if (V8_AO) V8_AO.wrapS = V8_AO.wrapT = THREE.ClampToEdgeWrapping; return V8_AO; }
const hash01 = n => { let h = (n * 2654435761) >>> 0; h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; return (h >>> 0) / 4294967296; };


class Character {
  constructor(fighter, lookKey) {
    this.f = fighter; this.lookKey = lookKey; this.look = LOOKS[lookKey]; this.mats = []; this.geos = []; this.model = null; this.prevSt = fighter.state; this.prevReactT = fighter.reactT;
    this.sEntry = Object.assign({}, POSES.ready); this.sKey = ''; this.baseP = Object.assign({}, POSES.ready); this.strain = 0; this.lowHp = 0; this.aggr = 0; this.atkVar = 0; this.flourishT = -1; this.glinted = false; this.auraAcc = 0;
    this.root = new THREE.Group(); this.pose = Object.assign({}, POSES.ready); this.vel = Object.assign({}, P0); this.target = Object.assign({}, P0);
    this.entry = Object.assign({}, POSES.ready); this.atkId = -1; this.walk = 0; this.amp = 0; this.lf = 0; this.ls = 0; this.accF = 0; this.accS = 0;
    this.deathT = 0; this.lastStepSign = 0; this.glow = 0; this.visFacing = fighter.facing; this.prevVis = fighter.facing; this.off = Object.assign({}, P0); this.offV = Object.assign({}, P0); this.exert = 0; this.hipsW = new THREE.Vector3(); this.trailKey = -1;
    this.build(); scene.add(this.root);
    this.tipW = new THREE.Vector3(); this.baseW = new THREE.Vector3(); this.trail = new Trail(this.look.crimson ? 0xff4030 : 0xdfe8ff);
    this.oldTip = this.tip; this.oldBase = this.bladeBase; this.oldBladeMat = this.bladeMat; this.syncModel(); if (!this.v7mats) v7Dress(this);
  }
  /* swap between the skinned GLB model and the original block rig (both driven by the same pose rig) */
  syncModel() {
    const want = VISUAL.models >= 0.5 && !!window.VEYN_MODELS && VEYN_MODELS.has(this.lookKey);
    if (want === !!this.model) return;
    if (want) {
      let m; try { m = new VEYN_MODELS.Model(this.lookKey, { rig: this.rig, hips: this.hips, torso: this.torso, head: this.head, lSh: this.lSh, lEl: this.lEl, lHand: this.lHand, rSh: this.rSh, rEl: this.rEl, rHand: this.rHand, wrist: this.wrist, lLeg: this.lLeg, lKnee: this.lKnee, rLeg: this.rLeg, rKnee: this.rKnee, lFoot: this.lFoot, rFoot: this.rFoot }, { scale: this.look.scale, hideCape: !!this.look.cape, hideScarf: !!this.look.scarf }); }
      catch (e) { console.warn('[Veynhold] model attach failed', e); VISUAL.models = 0; return; }
      this.hidden = []; const capeRoot = this.cape; const keep = o => { for (let q = o; q; q = q.parent) if (q === capeRoot || q === m.root) return true; return false; };
      this.rig.traverse(o => { if (o.isMesh && o.visible && !keep(o)) { o.visible = false; this.hidden.push(o); } });
      this.model = m; m.update(); this.tip = m.tip; this.bladeBase = m.base; this.bladeMat = (m.bladeMats || []).find(x => x.name === 'Blade') || this.oldBladeMat;
    } else {
      this.model.dispose(); this.model = null; (this.hidden || []).forEach(o => o.visible = true); this.hidden = [];
      this.tip = this.oldTip; this.bladeBase = this.oldBase; this.bladeMat = this.oldBladeMat;
    }
    v7Dress(this);   // v7: rim light, steel reflections, boss silhouette pieces
  }
  mat(color, o) { const m = new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.6, metalness: 0.2 }, o || {})); this.mats.push(m); return m; }
  mesh(geo, mat, parent, x, y, z) { this.geos.push(geo); const m = new THREE.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); m.castShadow = true; parent.add(m); return m; }
  build() {
    const L = this.look, s = L.scale, bulk = L.bulky ? 1.35 : 1;
    const ST = sharedTex(), cloth = this.mat(L.cloth, { roughness: 0.92, metalness: 0, bumpMap: ST.weave, bumpScale: 0.012 }), armor = this.mat(L.armor, { roughness: 0.5, metalness: 0.55, roughnessMap: ST.scratch, bumpMap: ST.scratch, bumpScale: 0.006 }), trim = this.mat(L.trim, { roughness: 0.7 }),
      skin = this.mat(L.skin, { roughness: 0.8, metalness: 0 }), dark = this.mat(0x15161a, { roughness: 0.8 });
    this.bladeMat = this.mat(0xd8dde5, { roughness: 0.25, metalness: 0.55, emissive: 0x000000 });
    const R = this.root; const rig = new THREE.Group(); rig.scale.setScalar(s); R.add(rig); this.rig = rig;
    const hips = new THREE.Group(); hips.position.y = 0.95; rig.add(hips); this.hips = hips;
    this.mesh(new THREE.BoxGeometry(0.36 * bulk, 0.2, 0.24 * bulk), cloth, hips, 0, 0, 0);
    // legs
    const leg = (side) => { const thigh = new THREE.Group(); thigh.position.set(side * 0.12 * bulk, -0.04, 0); hips.add(thigh);
      this.mesh(new THREE.BoxGeometry(0.15 * bulk, 0.46, 0.17 * bulk), cloth, thigh, 0, -0.23, 0);
      const knee = new THREE.Group(); knee.position.y = -0.46; thigh.add(knee);
      this.mesh(new THREE.BoxGeometry(0.13 * bulk, 0.44, 0.15 * bulk), armor, knee, 0, -0.22, 0);
      this.mesh(new THREE.BoxGeometry(0.14 * bulk, 0.08, 0.26 * bulk), dark, knee, 0, -0.45, 0.05); return { thigh, knee }; };
    const lL = leg(1), rL = leg(-1); this.lLeg = lL.thigh; this.lKnee = lL.knee; this.rLeg = rL.thigh; this.rKnee = rL.knee;
    this.lFoot = new THREE.Group(); this.lFoot.position.y = -0.45; this.lKnee.add(this.lFoot); this.rFoot = new THREE.Group(); this.rFoot.position.y = -0.45; this.rKnee.add(this.rFoot);   // v8: ankle joints for clip feet
    // torso
    const torso = new THREE.Group(); torso.position.y = 0.08; hips.add(torso); this.torso = torso;
    this.mesh(new THREE.BoxGeometry(0.42 * bulk, 0.5, 0.25 * bulk), L.bulky || L.helm === 'crown' ? armor : cloth, torso, 0, 0.3, 0);
    this.mesh(new THREE.BoxGeometry(0.46 * bulk, 0.22, 0.28 * bulk), armor, torso, 0, 0.45, 0); // breastplate / pauldron band
    if (L.trim) this.mesh(new THREE.BoxGeometry(0.2, 0.42, 0.02), trim, torso, 0, 0.18, 0.14 * bulk);
    if (L.bulky) { this.mesh(new THREE.SphereGeometry(0.16, 8, 6), armor, torso, 0.3 * bulk, 0.52, 0); this.mesh(new THREE.SphereGeometry(0.16, 8, 6), armor, torso, -0.3 * bulk, 0.52, 0); }
    if (L.helm === 'crown') { this.mesh(new THREE.BoxGeometry(0.34, 0.6, 0.02), trim, torso, 0, 0.0, 0.15); this.mesh(new THREE.SphereGeometry(0.12, 8, 6), armor, torso, 0.27, 0.55, 0); this.mesh(new THREE.SphereGeometry(0.12, 8, 6), armor, torso, -0.27, 0.55, 0); }
    if (L.scarf) this.mesh(new THREE.TorusGeometry(0.12, 0.05, 6, 10), this.mat(L.scarf, { roughness: 0.9 }), torso, 0, 0.6, 0).rotation.x = Math.PI / 2;
    // cape
    if (L.cape) { const cg = new THREE.PlaneGeometry(0.5 * bulk, 0.95, 1, 4); this.geos.push(cg); const cm = this.mat(L.cape, { side: THREE.DoubleSide, roughness: 1, metalness: 0, map: V7Tex.cape(), alphaTest: 0.45 });   // v7: woven, folded, tattered cape
      const cape = new THREE.Mesh(cg, cm); cape.position.set(0, 0.12, -0.16 * bulk); cape.castShadow = true; const pivot = new THREE.Group(); pivot.position.set(0, 0.58, 0); torso.add(pivot); cape.position.y = -0.47; pivot.add(cape); this.cape = pivot;
      const cw = 0.42 * bulk, an = []; for (let c = 0; c < 5; c++) { const u = -1 + c / 2; an.push([u * cw / 2, 0.58 - Math.abs(u) * 0.03, -0.17 * bulk + u * u * 0.1 * bulk]); }   // v7: 5 columns wrapped round the shoulders
      this.clothCape = new ClothStrip({ cols: 5, rows: 7, width: cw * L.scale, length: 0.95 * L.scale, anchor: torso, anchors: an, material: cm, push: 0.16 * bulk * L.scale }); }
    if (L.sash) { const sm = this.mat(L.sash, { side: THREE.DoubleSide, roughness: 0.9, metalness: 0 }); this.clothSash = new ClothStrip({ cols: 2, rows: 6, width: 0.12, length: 0.78, anchor: hips, anchors: [[0.17, 0.02, -0.02], [0.2, -0.02, -0.12]], material: sm, push: 0.1 }); }   // v7: duelist sash (verlet)
    if (L.scarf) { const sm = this.mat(L.scarf, { side: THREE.DoubleSide, roughness: 0.9 }); this.clothScarf = new ClothStrip({ cols: 2, rows: 5, width: 0.09, length: 0.62, anchor: torso, anchors: [[0.02, 0.6, -0.12], [0.11, 0.6, -0.1]], material: sm, push: 0.12 }); }
    // head
    const head = new THREE.Group(); head.position.y = 0.66; torso.add(head); this.head = head;
    this.mesh(new THREE.SphereGeometry(0.12, 10, 8), skin, head, 0, 0.1, 0);
    switch (L.helm) {
      case 'hood': this.mesh(new THREE.ConeGeometry(0.17, 0.36, 8), cloth, head, 0, 0.2, -0.02); this.mesh(new THREE.BoxGeometry(0.2, 0.06, 0.02), dark, head, 0, 0.1, 0.12); break;
      case 'kettle': this.mesh(new THREE.SphereGeometry(0.14, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), armor, head, 0, 0.13, 0); this.mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.02, 14), armor, head, 0, 0.13, 0); break;
      case 'great': this.mesh(new THREE.BoxGeometry(0.28, 0.32, 0.29), armor, head, 0, 0.12, 0); this.mesh(new THREE.BoxGeometry(0.22, 0.025, 0.02), dark, head, 0, 0.15, 0.15); this.mesh(new THREE.BoxGeometry(0.03, 0.14, 0.02), dark, head, 0, 0.07, 0.15); break;
      case 'cowl': this.mesh(new THREE.ConeGeometry(0.18, 0.42, 7), cloth, head, 0, 0.2, -0.03); this.mesh(new THREE.BoxGeometry(0.22, 0.12, 0.05), dark, head, 0, 0.06, 0.1); break;
      case 'crown': this.mesh(new THREE.CylinderGeometry(0.15, 0.14, 0.3, 10), armor, head, 0, 0.13, 0); this.mesh(new THREE.BoxGeometry(0.2, 0.025, 0.02), this.mat(0x000000, { emissive: 0x550000 }), head, 0, 0.15, 0.145);
        for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; const sp = this.mesh(new THREE.ConeGeometry(0.025, 0.12, 4), trim, head, Math.sin(a) * 0.12, 0.33, Math.cos(a) * 0.12); } break;
    }
    // arms
    const arm = (side) => { const sh = new THREE.Group(); sh.position.set(side * 0.27 * bulk, 0.55, 0); torso.add(sh);
      this.mesh(new THREE.BoxGeometry(0.11 * bulk, 0.3, 0.12 * bulk), side > 0 ? cloth : cloth, sh, 0, -0.15, 0);
      this.mesh(new THREE.SphereGeometry(0.09 * bulk, 8, 6), armor, sh, 0, 0, 0);
      const el = new THREE.Group(); el.position.y = -0.3; sh.add(el); this.mesh(new THREE.BoxGeometry(0.1 * bulk, 0.28, 0.11 * bulk), armor, el, 0, -0.14, 0);
      const hand = new THREE.Group(); hand.position.y = -0.29; el.add(hand); this.mesh(new THREE.BoxGeometry(0.09, 0.09, 0.09), dark, hand, 0, 0, 0); return { sh, el, hand }; };
    const la = arm(1), ra = arm(-1); this.lSh = la.sh; this.lEl = la.el; this.rSh = ra.sh; this.rEl = ra.el; this.lHand = la.hand; this.rHand = ra.hand;
    // sword: blade continues along the hand's -Y axis, wrist rotations aim it
    const wrist = new THREE.Group(); ra.hand.add(wrist); this.wrist = wrist;
    this.mesh(new THREE.BoxGeometry(0.035, 0.22, 0.035), dark, wrist, 0, 0.06, 0);  // grip (extends behind hand)
    this.mesh(new THREE.BoxGeometry(L.bladeW * 3.2, 0.03, 0.06), trim, wrist, 0, -0.05, 0); // guard
    const bl = L.blade;
    if (L.curved) { const b1 = this.mesh(new THREE.BoxGeometry(L.bladeW, bl * 0.55, 0.012), this.bladeMat, wrist, 0, -0.06 - bl * 0.275, 0); const seg = new THREE.Group(); seg.position.y = -0.06 - bl * 0.55; seg.rotation.z = 0.0; seg.rotation.x = 0.18; wrist.add(seg); this.mesh(new THREE.BoxGeometry(L.bladeW, bl * 0.47, 0.012), this.bladeMat, seg, 0, -bl * 0.235, 0); this.tip = new THREE.Object3D(); this.tip.position.y = -bl * 0.47; seg.add(this.tip); }
    else { this.mesh(new THREE.BoxGeometry(L.bladeW, bl, 0.014), this.bladeMat, wrist, 0, -0.06 - bl / 2, 0); this.tip = new THREE.Object3D(); this.tip.position.y = -0.06 - bl; wrist.add(this.tip); }
    this.bladeBase = new THREE.Object3D(); this.bladeBase.position.y = -0.1; wrist.add(this.bladeBase);
    if (L.crimson) { this.crimsonLight = null; }
    // blob shadow (cheap, used in low quality)
    const sg = new THREE.PlaneGeometry(1.25 * s * bulk, 1.25 * s * bulk); this.geos.push(sg); const sm = new THREE.MeshBasicMaterial({ color: 0x000000, map: V8AOTex(), transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }); this.mats.push(sm);   // v8: soft AO blob
    this.blob = new THREE.Mesh(sg, sm); this.blob.rotation.x = -Math.PI / 2; this.blob.position.y = 0.012; R.add(this.blob);
    this.feetAO = []; for (let k = 0; k < 2; k++) { const fm = new THREE.MeshBasicMaterial({ color: 0x000000, map: V8AOTex(), transparent: true, opacity: 0.0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -5 }); this.mats.push(fm);
      const fg = new THREE.PlaneGeometry(0.34 * s * bulk, 0.48 * s * bulk); this.geos.push(fg); const f = new THREE.Mesh(fg, fm); f.rotation.x = -Math.PI / 2; f.position.y = 0.014; f.renderOrder = 2; scene.add(f); this.feetAO.push(f); }
  }

  /* physical impulses on an additive spring layer (works on top of direct attack poses too) */
  impulse(o, k) { k = (k === undefined ? 1 : k) * VISUAL.impulse; for (const key in o) this.offV[key] += o[key] * k; }
  clothKick(x, y, z) { if (this.clothSash) this.clothSash.kick(x * 1.2, y, z * 1.2); if (this.clothCape) this.clothCape.kick(x, y, z); if (this.clothScarf) this.clothScarf.kick(x * 1.3, y, z * 1.3); }
  /* returns spring stiffness (omega) or 0 when the pose is driven directly */
  computeTarget(alpha, dt) {
    const f = this.f, T = this.target, st = f.state, vlt = visT(f, f.lt, alpha, dt);
    const sk = stanceKey(this.lookKey, f), stance = STANCES[sk];
    // state-entry snapshot: every directly-driven state blends in from wherever the body was (no snaps on cancels)
    const sA = f.atk ? f.atk.id : -1; if (st !== this.sKeyS || sA !== this.sKeyA) { this.sKeyS = st; this.sKeyA = sA; Object.assign(this.sEntry, this.pose); }   // v6: no per-frame string
    const vst = visT(f, f.stateT, alpha, dt);
    const blendIn = (dur) => { const b = Math.min(1, vst / dur); if (b < 1) lerpPose(T, this.sEntry, T, smooth01(b)); };
    // ---- living stance: posture pressure, low health, AI tempo mode (smoothed so nothing pops)
    const strainT = clamp((f.posture / f.postureMax - 0.45) / 0.45, 0, 1), lowT = clamp((0.35 - f.hp / f.maxHp) / 0.35, 0, 1) * (f.dead ? 0 : 1);
    const mode = f.brain ? f.brain.mode : '', modeT = mode === 'pressure' ? 1 : mode === 'patient' ? -1 : 0, ks = 1 - Math.exp(-dt * 3);
    this.strain += (strainT - this.strain) * ks; this.lowHp += (lowT - this.lowHp) * ks; this.aggr += (modeT - this.aggr) * ks;
    const base = this.baseP; Object.assign(base, stance);
    { const sN = this.strain, l = this.lowHp, a = this.aggr;
      base.hipY += -0.08 * sN - 0.03 * l - 0.03 * Math.max(0, a) + 0.02 * Math.max(0, -a); base.lean += 0.15 * sN + 0.08 * l + 0.08 * a; base.headX += 0.12 * sN + 0.06 * l;
      base.rSx += 0.35 * sN - 0.12 * Math.max(0, a); base.wX += 0.25 * sN; base.rE += 0.2 * sN; base.side += 0.07 * l; base.lSz += 0.35 * l; }
    if (st === 'attack' && f.atk) {
      const a = f.atk, d = a.def, kind = kindOf(d), Fm = famFor(sk, d.style, kind), vt = visT(f, a.t, alpha, dt);
      if (a.id !== this.atkId) { this.atkId = a.id; Object.assign(this.entry, this.pose); this.atkVar = hash01(a.id) * 2 - 1; this.glinted = false; }
      const su = a.su, ac = a.ac, rc = a.rc; let recU = 0;
      if (vt < su) {
        const reach = (a.hold > 0 || d.delayed) ? Math.min(su, a.baseSu * 0.85) : su, antEnd = Math.min(reach * 0.32, kind === 'danger' ? 0.2 : 0.16);
        if (vt < antEnd) lerpPose(T, base, Fm.A, ease(vt / antEnd));
        else if (vt < reach) lerpPose(T, Fm.A, Fm.W, ease(easeInQuad((vt - antEnd) / Math.max(0.001, reach - antEnd)) * 0.6 + ((vt - antEnd) / Math.max(0.001, reach - antEnd)) * 0.4));
        else { lerpPose(T, Fm.W, Fm.W, 1); const tr = Math.sin(vt * 38) * 0.02; T.rSx += tr; T.lean -= 0.06; T.wX += tr; }   // held windup: visible tremble
      } else if (vt < su + ac) { const u = (vt - su) / ac; if (u < 0.6) lerpPose(T, Fm.W, Fm.S, easeOutExpo(u / 0.6)); else lerpPose(T, Fm.S, Fm.O, easeOut((u - 0.6) / 0.4)); }
      else { const u = Math.min(1, (vt - su - ac) / rc); recU = u; const hold = kind === 'heavy' ? 0.42 : kind === 'danger' ? 0.36 : 0.3;
        if (u < hold) lerpPose(T, Fm.O, Fm.F, easeOut(u / hold)); else lerpPose(T, Fm.F, base, settle((u - hold) / (1 - hold))); }
      // spinning finisher: the whole body turns through the cut (a full turn lands exactly where it began)
      if (d.style === 'spin') T.yaw = vt < su ? 0.35 * ease(Math.min(1, vt / su)) : vt < su + ac ? 0.35 - (Math.PI * 2 + 0.35) * easeOut((vt - su) / ac) : 0;
      if (d.style === 'wave' && f.phase === 2) { T.lean += 0.05; }
      // swing-to-swing variety: no two cuts in a string look identical
      const v = this.atkVar * (1 - recU); T.twist += v * 0.1; T.lean += v * 0.05; T.rSy += v * 0.08; T.hipY += Math.abs(v) * -0.02;
      // deflected mid-string: blade bounces
      if (f.reactKind === 'deflected' && vlt - f.reactT < 0.25) { const k = 1 - (vlt - f.reactT) / 0.25; lerpPose(T, T, POSES.deflected, k * 0.75); }
      // blend in from wherever the body was when the swing began — longer for chained swings, but always done before the strike
      const bd = clamp(su * 0.8, 0.06, 0.16), b = Math.min(1, vt / bd); if (b < 1) lerpPose(T, this.entry, T, smooth01(b));
      return 0;
    }
    this.atkId = -1;
    let tgt = base, w = 18;
    const sinceGuard = vlt - f.guardStart, sinceReact = vlt - f.reactT;
    switch (st) {
      case 'guard': tgt = POSES.guard; w = 34; break;
      case 'hit': { const heavyHit = f.hitHeavy || f.hitStreak >= 3; tgt = heavyHit ? (f.hitStreak >= 3 ? POSES.stumble : POSES.hitB) : f.hitDir === 'L' ? POSES.hitL : f.hitDir === 'R' ? POSES.hitR : (f.hitStreak % 2 ? POSES.hitF : POSES.hitF2);
        w = heavyHit ? 22 : 34 + Math.min(2, f.hitStreak) * 4; break; }
      case 'recoil': tgt = POSES.recoil; w = 30; break;
      case 'broken': tgt = POSES.broken; w = 13; break;
      case 'dodge': { const k = clamp((vst - 0.16) / 0.2, 0, 1); lerpPose(T, POSES.dodge, base, easeOut(k));
        const lf = Math.sin(f.facing) * f.dodgeDx + Math.cos(f.facing) * f.dodgeDz, ls = Math.cos(f.facing) * f.dodgeDx - Math.sin(f.facing) * f.dodgeDz;
        T.lean = T.lean * (lf >= 0 ? 1 : -0.5); T.side += -ls * 0.45 * (1 - k); blendIn(0.1); return 0; }
      case 'jump': tgt = (f.kickT > 0 && vlt - f.kickT < 0.35) ? POSES.kick : POSES.jump; w = 26; break;
      case 'mikiri': tgt = POSES.mikiri; w = 40; break;
      case 'deathblowExec': { sampleTrack(T, TRACKS['exec_' + this.execVariant()] || TRACKS.exec_duelist, vst, base); blendIn(0.08); return 0; }
      case 'deathblowed': { sampleTrack(T, TRACKS['vic_' + this.victimVariant()] || TRACKS.vic_duelist, vst, base); blendIn(0.08); return 0; }
      case 'transition': { sampleTrack(T, TRACKS.awaken, vst, base); blendIn(0.15); return 0; }
      case 'dead': tgt = POSES.dead; w = 9; break;
    }
    if (Intro.active && Intro.boss === f && (st === 'idle' || st === 'move')) { sampleTrack(T, INTRO_TRACKS[this.lookKey] || INTRO_TRACKS.duelist, Intro.t, base); return 0; }   // v8: boss intro flourish
    if (st === 'idle' || st === 'move' || st === 'guard') {
      if (sinceGuard >= 0 && sinceGuard < 0.13) { tgt = POSES.parry; w = 60; }                       // guard raise snaps up on the first frame
      if (f.reactKind === 'deflect' && sinceReact < 0.17) { tgt = POSES.parrySnap; w = 60; }
      else if (f.reactKind === 'block' && sinceReact < 0.15) { tgt = POSES.blockHit; w = 45; }
      // blood-flick flourish after a kill
      if (this.flourishT >= 0 && st !== 'guard' && tgt === base) { this.flourishT += dt; if (this.flourishT > 1.15) this.flourishT = -1; else { sampleTrack(T, TRACKS.flourish, this.flourishT, base); return 22; } }
    }
    lerpPose(T, tgt, tgt, 1);
    return w;
  }
  /* ===== v8: clip layer. Attack clips are pinned to the core's strike tick; locomotion is a phase-synced 2D blend.
     Everything here is presentation: it reads the fighter, never writes it. ===== */
  clipLayer(dt, alpha, now, turnV) {
    const A = window.VEYN_ANIM, f = this.f, M = this.model; this.yawScale = 1; this.clipW = 0; this.locoW = 0;
    if (!ANIM_ON() || VISUAL.clips < 0.5) { if (M) { M.handLocal = null; M.footW = 0; } return; }
    if (!this.cl) { const J = A.J.length; this.cl = { buf: new Float32Array(J * 4), acc: new Float32Array(J * 4), tmp: new Float32Array(J * 4), idle0: new Float32Array(J * 4),
        groups: A.J.map(n => this[n]), proc: A.J.map(() => new THREE.Quaternion()), q: new THREE.Quaternion(), q2: new THREE.Quaternion(), e: new THREE.Euler(), yq: new THREE.Quaternion(), Y: new THREE.Vector3(0, 1, 0),
        w: {}, move: 0, phase: 0, back: false, yaw: 0, lastPh: 0, atkKey: '', atkT: -1, turnW: 0, W0u1: new THREE.Quaternion().fromArray(A.W0.u1), W0u2: new THREE.Quaternion().fromArray(A.W0.u2), wq: new THREE.Quaternion(), procW: new THREE.Quaternion(), hand: new THREE.Quaternion() };
      A.sample(A.clips.idle, 0, this.cl.idle0, true); }
    const C = this.cl, G = C.groups, J = G.length, st = f.state, I = A.J;
    for (let j = 0; j < J; j++) C.proc[j].copy(G[j].quaternion);
    C.procW.copy(this.wrist.quaternion); const procHipsY = this.hips.position.y;
    const setQ = (j, src, w) => { if (w <= 0) return; C.q.fromArray(src, j * 4); if (w >= 1) G[j].quaternion.copy(C.q); else G[j].quaternion.slerp(C.q, w); };
    let wA = 0, wArm = 0, wLeg = 0, W0 = C.W0u2;
    // ---------------- attack layer ----------------
    C.atkKey = ''; C.atkT = -1;
    if (st === 'attack' && f.atk) {
      const a = f.atk, sk = stanceKey(this.lookKey, f), clip = A.clipFor(sk, a.def);
      if (clip) {
        const vt = visT(f, a.t, alpha, dt), vlt = visT(f, f.lt, alpha, dt), m = A.attackTime(clip, a, vt), hy = A.sample(clip, m.t, C.buf, false);
        C.atkKey = clip.key; C.atkT = m.t; C.atkHold = m.hold;
        const bd = clamp(a.su * 0.8, 0.06, 0.16); let w = smooth01(Math.min(1, vt / bd));
        if (m.rec !== undefined) w *= 1 - smooth01(clamp((m.rec - 0.42) / 0.58, 0, 1));                                   // settle back into the character's own stance
        if (f.reactKind === 'deflected' && vlt - f.reactT < 0.25 && vlt >= f.reactT) w *= 1 - (1 - (vlt - f.reactT) / 0.25) * 0.75;   // blade bounce reads through the clip
        w *= (A.FEEL[sk] || 1) * VISUAL.clips; wA = clamp(w, 0, 1); W0 = clip.wrist === 'u1' ? C.W0u1 : C.W0u2;
        for (let j = 0; j < J; j++) setQ(j, C.buf, wA);
        this.hips.position.y = procHipsY + (0.95 + hy - procHipsY) * wA + this.off.hipY * wA * 0.5;
        if (m.hold) { C.e.set(Math.sin(vt * 38) * 0.03, 0, Math.sin(vt * 31) * 0.02); this.rEl.quaternion.multiply(C.q.setFromEuler(C.e)); }   // held windup: visible tremble
        if (a.def.style === 'spin') this.yawScale = 1 - wA;                                                              // the clip spins the body itself
        wArm = wA; wLeg = wA;
      }
    }
    // ---------------- locomotion layer ----------------
    const loco = st === 'idle' || st === 'move' || st === 'guard';
    if (loco && VISUAL.clipLoco >= 0.5) {
      const sc = this.look.scale, v = Math.hypot(this.lf, this.ls) / sc;
      const mT = clamp((v - 0.12) / 0.7, 0, 1); C.move += (mT - C.move) * (1 - Math.exp(-dt * (mT > C.move ? 10 : 7)));
      const theta = Math.atan2(this.ls, this.lf);
      // turn in place: small side-steps whose cadence follows the turn rate
      const turning = v < 0.4 && Math.abs(turnV) > 1.2; C.turnW += ((turning ? Math.min(0.75, Math.abs(turnV) * 0.18) : 0) - C.turnW) * (1 - Math.exp(-dt * 10));
      C.guarded = st === 'guard' || st === 'idle'; const res = A.locoWeights(C, v, theta, C.move, C.turnW, turnV, dt, C.w);
      C.yaw += (res.yaw - C.yaw) * (1 - Math.exp(-dt * 9));
      const wsum = 1 - C.w.idle; wLeg = Math.max(wLeg, wsum); this.locoW = wsum;
      if (wsum > 0.001) {
        const dom = C.turnW > C.move ? (turnV > 0 ? 'walkSL' : 'walkSR') : res.key, wp = A.warpOf(dom, Math.max(v, 0.05));
        let rate = C.turnW > C.move ? Math.abs(turnV) * 0.16 : wp.rate;
        if (C.turnW <= C.move && VISUAL.footLock > 0) {   // foot-speed time warp: the support foot travels exactly at body speed while it is down
          const sr = A.supportRate(A.clips[dom], C.phase, wp.k), g = (dom.endsWith('B') ? 1 : -1) * sr.dz;
          if (g > 0.15 * A.clips[dom].stride && sr.low < 0.06) rate = clamp(v / g, wp.rate * 0.35, wp.rate * 2.6) * VISUAL.footLock + wp.rate * (1 - VISUAL.footLock); }
        C.phase = (C.phase + rate * dt) % 1;
        let first = true, hy = 0;
        for (const key in C.w) { const wk = C.w[key] / wsum; if (key === 'idle' || wk <= 0.0005) continue; const clip = A.clips[key], t = ((C.phase + (clip.phase0 || 0)) % 1) * clip.dur;
          let h = A.sample(clip, t, C.tmp, true); const k = key === dom ? wp.k : A.warpOf(key, Math.max(v, 0.05)).k;
          if (Math.abs(k - 1) > 1e-3) { const l0 = A.lowestSole(C.tmp); A.warpLegs(C.tmp, k); h += l0 - A.lowestSole(C.tmp); }   // stride warp, re-grounded
          hy += h * wk; A.accumulate(C.acc, C.tmp, wk, first); first = false; }
        A.finish(C.acc);
        const iH = 0, iT = 1; C.yq.setFromAxisAngle(C.Y, C.yaw * (1 - Math.min(1, C.turnW * 2)));
        C.q.fromArray(C.acc, iH * 4).premultiply(C.yq); const hipsNew = C.q2.copy(C.proc[iH]).slerp(C.q, wsum);
        const torsoWorld = C.wq.copy(C.proc[iH]).multiply(C.proc[iT]);                                                // keep the upper body's facing / lean
        G[iH].quaternion.copy(hipsNew); G[iT].quaternion.copy(hipsNew).invert().multiply(torsoWorld);
        for (let j = 9; j < J; j++) setQ(j, C.acc, wsum);                                                            // legs + feet
        this.hips.position.y = procHipsY + (0.95 + hy - procHipsY) * wsum;
        if (C.guarded) { for (let j = 0; j < J; j++) G[j].quaternion.toArray(C.tmp, j * 4); const low = A.lowestSole(C.tmp); this.hips.position.y = -0.03 - low; }   // standing / guarding: sole stays on the floor through blends
        // footsteps on contact (phase 0 = left foot down, 0.5 = right)
        const ph = C.phase, crossed = (C.lastPh < 0.5 && ph >= 0.5) || ph < C.lastPh; C.lastPh = ph;
        if (crossed && wsum > 0.35) { if (f.isPlayer) audio.play('step'); else { const d = Math.hypot(f.x - camera.position.x, f.z - camera.position.z); if (d < 14) audio.play('step', { pan: panOf(f.x, f.z), vol: (f.profile.look === 'warden' ? 1.8 : 1) * clamp(1.4 - d / 12, 0.2, 1) }); } }
        // unlocked jog / sprint: arms swing with the run (blade carried low in the fist)
        wArm = f.isPlayer && !f.lockId && st === 'move' ? clamp((v - 2.6) / 2.2, 0, 1) * 0.8 * C.move : 0;
        if (wArm > 0) { for (let j = 3; j <= 8; j++) setQ(j, C.acc, wArm); W0 = C.W0u1; }
      }
      // idle: Quaternius idle breathing as an additive on hips / torso / head over the character's own stance
      const iw = (1 - C.move) * (st === 'idle' ? 0.9 : 0.5) * VISUAL.breath;
      if (iw > 0.01) { A.sample(A.clips.idle, now % A.clips.idle.dur, C.tmp, true);
        for (const j of [1, 2]) { C.q.fromArray(C.idle0, j * 4).invert().premultiply(C.q2.fromArray(C.tmp, j * 4)); C.q2.identity().slerp(C.q, iw); G[j].quaternion.multiply(C.q2); } }
    } else { C.move *= Math.exp(-dt * 8); }
    // ---------------- wrist / grip + additive impulses over clip-driven joints ----------------
    if (wArm > 0) { this.wrist.quaternion.copy(C.procW).slerp(W0, wArm); if (M) { M.handLocal = C.hand.copy(C.procW).slerp(C.wq.identity(), wArm); } }
    else if (M) M.handLocal = null;
    if (M) M.footW = wLeg;
    if (wA > 0) { const o = this.off, e = C.e, q = C.q, k = wA;
      const add = (g, x, y, z) => { if (Math.abs(x) + Math.abs(y) + Math.abs(z) < 1e-4) return; e.set(x * k, y * k, z * k); g.quaternion.multiply(q.setFromEuler(e)); };
      add(this.torso, o.lean, o.twist, o.side); add(this.head, o.headX, 0, 0); add(this.rSh, o.rSx, o.rSy, o.rSz); add(this.rEl, o.rE, 0, 0); add(this.wrist, o.wX, 0, o.wZ);
      add(this.lSh, o.lSx, -o.lSy, -o.lSz); add(this.lEl, o.lE, 0, 0); add(this.lLeg, o.lLeg, 0, 0); add(this.rLeg, o.rLeg, 0, 0); add(this.lKnee, o.lKnee, 0, 0); add(this.rKnee, o.rKnee, 0, 0); }
    this.clipW = wA;
  }
  execVariant() { const w = Game.world; const v = w && w.fighters.find(e => e.state === 'deathblowed'); if (!v) return 'duelist'; const lk = v.profile && v.profile.look;
    if (lk === 'king') return v.marks > 1 ? 'king1' : 'kingF'; return lk || 'duelist'; }
  victimVariant() { const lk = this.lookKey; if (lk === 'king') return this.f.marks > 1 ? 'king1' : 'kingF'; return lk; }
  update(dt, alpha, now) {
    const f = this.f, p = this.pose, T = this.target, V = this.vel;
    const omega = this.computeTarget(alpha, dt);
    if (omega <= 0) { for (const k of KEYS) { V[k] = clamp((T[k] - p[k]) / Math.max(dt, 1e-4) * 0.3, -12, 12); p[k] = T[k]; } V.yaw = 0; }
    else { // critically-damped-ish spring per joint (sub-stepped for stability) — intentional, crisp motion, never mush
      const n = Math.max(1, Math.ceil(dt * omega / 0.45)), h = dt / n, kk = omega * omega, c = 2 * 0.86 * omega;
      for (let s = 0; s < n; s++) for (const k of KEYS) { V[k] += (kk * (T[k] - p[k]) - c * V[k]) * h; p[k] += V[k] * h; }
    }
    // ---- continuous locomotion overlay driven by interpolated velocity (no foot sliding)
    const pvx = f.pvx === undefined ? f.vx : f.pvx, pvz = f.pvz === undefined ? f.vz : f.pvz;   // v8: no NaN before the first sim tick
    const vx = pvx + (f.vx - pvx) * alpha, vz = pvz + (f.vz - pvz) * alpha;
    const loco = f.state === 'move' || f.state === 'guard' || f.state === 'idle';
    const sf = Math.sin(f.facing), cf = Math.cos(f.facing);
    const lfT = loco ? vx * sf + vz * cf : 0, lsT = loco ? vx * cf - vz * sf : 0;
    const ke = 1 - Math.exp(-dt * 14); this.lf += (lfT - this.lf) * ke; this.ls += (lsT - this.ls) * ke;
    const speed = Math.hypot(this.lf, this.ls);
    const stride = 1.15 + speed * 0.11;                                       // metres per full step cycle
    this.walk += speed * dt / stride * Math.PI * 2;
    const turnV = dt > 0 ? angNorm(f.facing - this.prevVis) / dt : 0; this.prevVis = f.facing; let turnAmp = 0;
    if (speed < 0.5 && Math.abs(turnV) > 1.2 && (f.state === 'idle' || f.state === 'guard')) { this.walk += Math.min(6, Math.abs(turnV)) * dt * 1.4; turnAmp = 0.4; }   // turn-in-place shuffle
    this.amp += (Math.max(turnAmp, clamp(speed / 3.2, 0, 1)) - this.amp) * (1 - Math.exp(-dt * 10));
    const ax = f.ax || 0, az = f.az || 0; const aF = loco ? ax * sf + az * cf : 0, aS = loco ? ax * cf - az * sf : 0;
    this.accF += (aF - this.accF) * (1 - Math.exp(-dt * 10)); this.accS += (aS - this.accS) * (1 - Math.exp(-dt * 10));
    const amp = this.amp, sw = Math.sin(this.walk), cw = Math.cos(this.walk);
    const fw = speed > 0.05 ? this.lf / speed : 1, sd = speed > 0.05 ? this.ls / speed : 0;
    let lLeg = p.lLeg, rLeg = p.rLeg, lKnee = p.lKnee, rKnee = p.rKnee, lSide = 0, rSide = 0, hipBob = 0, lean = p.lean, side = p.side;
    const clipLoco = ANIM_ON() && VISUAL.clipLoco >= 0.5;
    if (amp > 0.01 && !clipLoco) {
      lLeg = lLeg * (1 - amp) + (-sw * 0.72 * fw) * amp; rLeg = rLeg * (1 - amp) + (sw * 0.72 * fw) * amp;
      lSide = sw * 0.32 * sd * amp; rSide = -sw * 0.32 * sd * amp;
      lKnee = lKnee * (1 - amp) + (Math.max(0, cw) * 0.95 + 0.1) * amp; rKnee = rKnee * (1 - amp) + (Math.max(0, -cw) * 0.95 + 0.1) * amp;
      hipBob = Math.abs(cw) * 0.045 * amp; lean += Math.max(0, this.lf) * 0.025;
      const sign = sw >= 0 ? 1 : -1; if (sign !== this.lastStepSign) { this.lastStepSign = sign; if (f.isPlayer && amp > 0.35) audio.play('step'); else if (!f.isPlayer && amp > 0.5) { const d = Math.hypot(f.x - camera.position.x, f.z - camera.position.z); if (d < 14) audio.play('step', { pan: panOf(f.x, f.z), vol: (f.profile.look === 'warden' ? 1.8 : 1) * clamp(1.4 - d / 12, 0.2, 1) }); } }
    }
    lean += clamp(this.accF * 0.016, -0.28, 0.22); side += clamp(-this.accS * 0.013, -0.2, 0.2);          // start-up lean, stop skid, strafe tilt
    const idleW = f.state === 'idle' ? 1 : f.state === 'guard' ? 0.6 : 0.35;
    const busy = f.state === 'attack' || f.state === 'dodge' || f.state === 'hit' || f.state === 'jump' || f.state === 'broken';
    this.exert = clamp(this.exert + (busy ? dt * 0.35 : -dt * 0.12), 0, 1);
    this.breathPh = (this.breathPh || f.id) + dt * (1.6 + this.exert * 1.8);
    const bAmp = VISUAL.breath * (1 + this.exert * 1.4), br = Math.sin(this.breathPh) * idleW * bAmp, sway = Math.sin(now * 1.1 + f.id * 2) * idleW * VISUAL.breath;   // breathing (faster when winded) + weight sway
    lean += br * 0.018; const armBr = br * 0.03;
    // additive impulse layer: underdamped spring back to rest
    { const w0 = 24, c = 2 * 0.42 * w0, kk = w0 * w0, n = Math.max(1, Math.ceil(dt * w0 / 0.4)), hh = dt / n; const O = this.off, OV = this.offV;
      for (let s2 = 0; s2 < n; s2++) for (const k of KEYS) { OV[k] += (-kk * O[k] - c * OV[k]) * hh; O[k] += OV[k] * hh; } }
    for (const k of KEYS) p[k] += this.off[k];
    lean += this.off.lean; side += this.off.side; lLeg += this.off.lLeg; rLeg += this.off.rLeg; lKnee += this.off.lKnee; rKnee += this.off.rKnee;
    // ---- apply to joints
    let shud = 0; if (f.frozen) shud = Math.sin(now * 90) * 0.012;                                          // hit-stop shudder
    // v6: ground contact — crouched stances and kneels pin the lowest foot/knee to the floor instead of sinking through it
    let lift = 0; { const grounded = f.state !== 'jump' && f.state !== 'dead' && !(f.state === 'attack' && f.atk && f.atk.def.style === 'plunge') && this.deathT <= 0;
      if (grounded) { const hy = 0.95 + p.hipY + hipBob - 0.04, cs = Math.cos(p.legSpread), kl = hy - 0.46 * Math.cos(lLeg) * cs, kr = hy - 0.46 * Math.cos(rLeg) * cs;
        const fl = kl - 0.45 * Math.cos(lLeg + lKnee) * cs, fr = kr - 0.45 * Math.cos(rLeg + rKnee) * cs, lo = Math.min(fl, fr, kl - 0.06, kr - 0.06);
        lift = clamp(-lo, -0.04, 0.32); } }
    this.hips.position.set(shud, 0.95 + p.hipY + hipBob + br * 0.008 + lift, 0);
    this.torso.rotation.set(lean, p.twist + sway * 0.035, side);
    this.head.rotation.set(p.headX - lean * 0.5 - br * 0.03, -p.twist * 0.6, -side * 0.5);
    this.rSh.rotation.set(p.rSx + armBr, p.rSy, p.rSz - br * 0.035); this.rEl.rotation.set(p.rE, 0, 0); this.wrist.rotation.set(p.wX, 0, p.wZ);
    this.lSh.rotation.set(p.lSx + armBr, -p.lSy, -p.lSz + br * 0.035); this.lEl.rotation.set(p.lE, 0, 0);
    this.lLeg.rotation.set(lLeg, 0, p.legSpread + lSide); this.rLeg.rotation.set(rLeg, 0, -p.legSpread + rSide);
    this.lKnee.rotation.set(lKnee, 0, 0); this.rKnee.rotation.set(rKnee, 0, 0);
    if (this.lFoot) { this.lFoot.quaternion.set(0, 0, 0, 1); this.rFoot.quaternion.set(0, 0, 0, 1); }
    this.clipLayer(dt, alpha, now, turnV);   // v8: Quaternius clips (attacks re-timed to the core, locomotion blend) layered over the pose rig
    if (this.cape) this.cape.rotation.x = 0.15 + Math.min(0.9, speed * 0.12) + Math.sin(now * 3 + f.id) * 0.05 - lean * 0.6;
    for (const k of KEYS) p[k] -= this.off[k];
    // ---- skinned model: copy the rig's joints, then reaction flashes / perilous eyes / Phase II cracks
    this.syncModel();
    if (this.model) {
      const M = this.model; M.update();
      if (f.state !== this.prevSt) {
        if (f.state === 'hit') M.hit(f.isPlayer ? 0xff3a2a : 0xff6a48, f.hitHeavy ? 1 : 0.75);
        else if (f.state === 'broken') M.hit(0xffc860, 0.9);
        else if (f.state === 'deathblowed') M.hit(0xfff4e0, 1);
      }
      if (f.reactT !== this.prevReactT && (f.state === 'idle' || f.state === 'move' || f.state === 'guard' || f.state === 'attack')) {
        if (f.reactKind === 'deflect') M.hit(0xffd890, 0.4); else if (f.reactKind === 'block') M.hit(0xbfd4ff, 0.22); else if (f.reactKind === 'deflected') M.hit(0xffb070, 0.3);
      }
      M.eyes = f.isPlayer ? 0 : this.glow;
      M.effects(dt, now, { flashScale: VISUAL.flash, phase2: !!this.look.crimson && (f.phase === 2 || (f.state === 'transition' && f.stateT > 0.6)) });
    }
    this.prevSt = f.state; this.prevReactT = f.reactT;
    // ---- root: interpolate position AND facing between sim ticks
    const x = f.px + (f.x - f.px) * alpha, z = f.pz + (f.z - f.pz) * alpha;
    this.visFacing = f.pfacing + angNorm(f.facing - f.pfacing) * alpha;
    let y = 0; if (f.state === 'jump') { const J = CONFIG.jump, u = clamp(visT(f, f.stateT, alpha, dt) / J.dur, 0, 1); y = Math.sin(u * Math.PI) * J.height; }
    if (f.state === 'attack' && f.atk && f.atk.def.style === 'plunge' && f.airY) { const a = f.atk, vt = visT(f, a.t, alpha, dt); y = f.airY * (1 - easeInQuad(clamp(vt / Math.max(0.05, a.su + a.ac * 0.5), 0, 1))); }
    this.root.position.set(x, y, z); this.root.rotation.y = this.visFacing + p.yaw * (this.yawScale === undefined ? 1 : this.yawScale) + this.off.yaw;
    this.blob.position.y = 0.012 - y; this.blob.scale.setScalar(1 - y * 0.4); this.blob.material.opacity = 0.55 * (VISUAL.contactAO > 0 ? 1 : 0.65);
    // v8: foot contact shadows follow each foot and darken as it nears the floor
    if (this.feetAO) { const on = tier().contactAO >= 2 && VISUAL.contactAO > 0 && this.deathT < 0.5; this.root.updateMatrixWorld(true);
      for (let k = 0; k < 2; k++) { const fa = this.feetAO[k]; fa.visible = on; if (!on) continue; const src = this.model ? this.model.byName[k ? 'RightFoot' : 'LeftFoot'] : (k ? this.rFoot : this.lFoot);
        if (!src) { fa.visible = false; continue; } src.getWorldPosition(this._fv || (this._fv = new THREE.Vector3())); const hgt = this._fv.y - 0.085 * this.look.scale;
        fa.position.set(this._fv.x, 0.014, this._fv.z); fa.rotation.z = -this.visFacing; fa.material.opacity = 0.42 * clamp(1 - hgt / 0.28, 0, 1) * VISUAL.contactAO; } }
    if (f.state === 'dead' || (f.state === 'deathblowed' && f.marks <= 1 && f.stateT > 0.7)) this.deathT = Math.min(1, this.deathT + dt * 1.2); else this.deathT = 0;
    { const fall = DEATH_FALL[this.lookKey] || DEATH_FALL.player, de = ease(this.deathT); this.rig.rotation.x = fall[0] * de; this.rig.rotation.z = fall[1] * de; this.rig.position.y = -de * 0.3; }
    // delayed strikes: a cold glint on the blade the instant before release (feints never glint)
    if (VISUAL.glint && f.state === 'attack' && f.atk && f.atk.def.delayed && !this.glinted) { const a = f.atk, vt = visT(f, a.t, alpha, dt); if (vt >= a.su - 0.16 && vt < a.su) { this.glinted = true; this.glintNow = true; } }
    // phase II crimson aura
    if (this.look.crimson && f.phase === 2 && !f.dead && tier().particles > 0.4) { this.auraAcc += dt * 26 * tier().particles; while (this.auraAcc >= 1) { this.auraAcc--; const r = Math.random() * 0.45, an = Math.random() * 6.28;
      FX.sparks.spawn(x + Math.cos(an) * r, 0.2 + Math.random() * 1.6 * this.look.scale, z + Math.sin(an) * r, (Math.random() - 0.5) * 0.4, 0.6 + Math.random() * 0.8, (Math.random() - 0.5) * 0.4, 0.6 + Math.random() * 0.5, 0.9, 0.08, 0.04, -0.4); } }
    // ---- blade glow: perilous telegraph (red) / phase II crimson
    const danger = f.state === 'attack' && f.atk && f.atk.def.danger && atkPhase(f.atk) === 'startup';
    this.glow += ((danger ? 1 : 0) - this.glow) * Math.min(1, dt * 12);
    const e = this.bladeMat.emissive; if (danger || this.glow > 0.02) e.setRGB(0.9 * this.glow, 0.05 * this.glow, 0.02 * this.glow); else if (this.look.crimson && f.phase === 2) e.setRGB(0.45, 0.02, 0.02); else e.setRGB(0.07, 0.075, 0.09);
    if (this.edgeFlash > 0) { const k = this.edgeFlash * this.edgeFlash * VISUAL.edgeFlash; e.r += 1.6 * k; e.g += 1.75 * k; e.b += 2.0 * k; }   // v7: white-hot edge on a perfect deflect
    // ---- trail
    this.root.updateMatrixWorld(true); this.tip.getWorldPosition(this.tipW); this.bladeBase.getWorldPosition(this.baseW);
    let on = false; if (f.state === 'attack' && f.atk && !f.atk.def.feintAt) { const a = f.atk, vt = visT(f, a.t, alpha, dt); on = vt > a.su - 0.05 && vt < a.su + a.ac + 0.07; }
    if (on && f.atk.id !== this.trailKey) { this.trailKey = f.atk.id; const d = f.atk.def; this.trail.color.setHex(d.danger ? 0xff5a2a : (this.look.crimson && f.phase === 2) ? 0xff2a24 : f.isPlayer ? 0xdfe8ff : 0xfff1d6); this.trail.boost = d.finisher ? 1.6 : d.heavy ? 1.35 : f.atk.last && VISUAL.stringCue ? 1.25 : 1; if (d.finisher) this.trail.color.setHex(0xffe6b0); }
    this.trail.push(this.baseW, this.tipW, on);
    if (this.glintNow) { this.glintNow = false; FX.spark(this.tipW, 6, 0.35, [1, 1, 1]); FX.ring(this.tipW, 0xffffff, 2.2, 0.16); audio.play('glint'); }
    // cloth
    const useCloth = tier().cloth; if (this.cape) this.cape.visible = !(useCloth && this.clothCape);
    for (const cs of [this.clothCape, this.clothScarf, this.clothSash]) { if (!cs) continue; if (cs.mesh.visible !== useCloth) cs.setVisible(useCloth); if (useCloth) { this.hips.getWorldPosition(this.hipsW); cs.update(dt, this.hipsW, Math.sin(this.visFacing), Math.cos(this.visFacing), now); } }
  }
  dispose() { if (this.model) { this.model.dispose(); this.model = null; } scene.remove(this.root); (this.feetAO || []).forEach(f => scene.remove(f)); this.geos.forEach(g => g.dispose()); this.mats.forEach(m => m.dispose()); this.trail.dispose(); if (this.clothCape) this.clothCape.dispose(); if (this.clothScarf) this.clothScarf.dispose(); if (this.clothSash) this.clothSash.dispose(); (this.v7mats || []).forEach(m => m.dispose()); v7Unsteel(this.v7steel || []); }
}

/* ---------------- sword trail: dense ring buffer, sub-frame arc interpolation, tapered + faded ---------------- */
class Trail {
  constructor(color) { this.N = 36; this.raw = new Float32Array(this.N * 6); this.pos = new Float32Array(this.N * 2 * 3); this.col = new Float32Array(this.N * 2 * 3); this.color = new THREE.Color(color);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const idx = []; for (let i = 0; i < this.N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } g.setIndex(idx);
    this.geo = g; this.mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 1, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.visible = false; scene.add(this.mesh); this.op = 0; this.has = false;
    this.pb = new THREE.Vector3(); this.pt = new THREE.Vector3(); this.d0 = new THREE.Vector3(); this.d1 = new THREE.Vector3(); this.tb = new THREE.Vector3(); this.tt = new THREE.Vector3(); }
  sample(bx, by, bz, tx, ty, tz) { const r = this.raw; r.copyWithin(6, 0, (this.N - 1) * 6); r[0] = bx; r[1] = by; r[2] = bz; r[3] = tx; r[4] = ty; r[5] = tz; }
  push(base, tip, on) {
    if (!this.has) { for (let i = 0; i < this.N; i++) this.sample(base.x, base.y, base.z, tip.x, tip.y, tip.z); this.pb.copy(base); this.pt.copy(tip); this.has = true; }
    if (on) { // insert interpolated samples along the arc (slerp the blade direction around the moving hilt)
      const SUB = 4; this.d0.subVectors(this.pt, this.pb); const l0 = this.d0.length(); this.d1.subVectors(tip, base); const l1 = this.d1.length(); this.d0.normalize(); this.d1.normalize();
      const dot = clamp(this.d0.dot(this.d1), -1, 1), om = Math.acos(dot), so = Math.sin(om);
      for (let s = 1; s <= SUB; s++) { const u = s / SUB; this.tb.lerpVectors(this.pb, base, u);
        if (so > 1e-3) { const a = Math.sin((1 - u) * om) / so, b = Math.sin(u * om) / so; this.tt.set(this.d0.x * a + this.d1.x * b, this.d0.y * a + this.d1.y * b, this.d0.z * a + this.d1.z * b); } else this.tt.lerpVectors(this.d0, this.d1, u);
        this.tt.normalize().multiplyScalar(l0 + (l1 - l0) * u).add(this.tb); this.sample(this.tb.x, this.tb.y, this.tb.z, this.tt.x, this.tt.y, this.tt.z); }
    } else this.sample(base.x, base.y, base.z, tip.x, tip.y, tip.z);
    this.pb.copy(base); this.pt.copy(tip);
    this.op += ((on ? 1 : 0) - this.op) * (on ? 0.7 : 0.2); this.mesh.visible = this.op > 0.02; if (!this.mesh.visible) return;
    const r = this.raw, P = this.pos, C = this.col, ib = 0.3 * this.op * VISUAL.trail * (this.boost || 1), cr = this.color.r * ib, cg = this.color.g * ib, cb = this.color.b * ib;
    for (let i = 0; i < this.N; i++) { const age = i / (this.N - 1), k = (1 - age) * (1 - age), tap = 0.5 + age * 0.4, j = i * 6;   // v7: trail covers the outer blade only (reads as an arc)
      P[j] = r[j] + (r[j + 3] - r[j]) * tap; P[j + 1] = r[j + 1] + (r[j + 4] - r[j + 1]) * tap; P[j + 2] = r[j + 2] + (r[j + 5] - r[j + 2]) * tap; P[j + 3] = r[j + 3]; P[j + 4] = r[j + 4]; P[j + 5] = r[j + 5];
      C[j] = cr * k * 0.06; C[j + 1] = cg * k * 0.06; C[j + 2] = cb * k * 0.06; C[j + 3] = cr * k; C[j + 4] = cg * k; C[j + 5] = cb * k; }   // v7: hilt side fades out so trails read as an edge, not a slab
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.color.needsUpdate = true; }
  dispose() { scene.remove(this.mesh); this.geo.dispose(); this.mat.dispose(); }
}

/* =====================================================================
   EFFECTS — pooled particles, flash rings, embers, camera impulses
   ===================================================================== */
class Particles {
  constructor(n, size, additive) { this.n = n; this.pos = new Float32Array(n * 3); this.col = new Float32Array(n * 3); this.vel = new Float32Array(n * 3); this.life = new Float32Array(n); this.max = new Float32Array(n); this.grav = new Float32Array(n);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.base = new Float32Array(n * 3);
    this.mat = new THREE.PointsMaterial({ size: size * 1.6, map: V7Tex.dot(), vertexColors: true, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, sizeAttenuation: true, toneMapped: !additive });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false; this.geo = g; scene.add(this.points); this.cursor = 0;
    for (let i = 0; i < n; i++) this.pos[i * 3 + 1] = -100; }
  spawn(x, y, z, vx, vy, vz, life, r, gcol, b, grav) { const i = this.cursor; this.cursor = (this.cursor + 1) % this.n; const j = i * 3;
    this.pos[j] = x; this.pos[j + 1] = y; this.pos[j + 2] = z; this.vel[j] = vx; this.vel[j + 1] = vy; this.vel[j + 2] = vz; this.life[i] = life; this.max[i] = life;
    this.base[j] = r; this.base[j + 1] = gcol; this.base[j + 2] = b; this.grav[i] = grav === undefined ? 9 : grav; }
  update(dt) { const p = this.pos, v = this.vel, c = this.col;
    for (let i = 0; i < this.n; i++) { if (this.life[i] <= 0) { if (p[i * 3 + 1] > -50) { p[i * 3 + 1] = -100; } continue; }
      const j = i * 3; this.life[i] -= dt; v[j + 1] -= this.grav[i] * dt; v[j] *= 0.985; v[j + 2] *= 0.985;
      p[j] += v[j] * dt; p[j + 1] += v[j + 1] * dt; p[j + 2] += v[j + 2] * dt; if (p[j + 1] < 0.02) { p[j + 1] = 0.02; v[j + 1] *= -0.3; }
      const k = Math.max(0, this.life[i] / this.max[i]); c[j] = this.base[j] * k; c[j + 1] = this.base[j + 1] * k; c[j + 2] = this.base[j + 2] * k; }
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.color.needsUpdate = true; }
  clear() { this.life.fill(0); for (let i = 0; i < this.n; i++) this.pos[i * 3 + 1] = -100; }
}
const FX = {
  sparks: null, dust: null, rings: [], shake: 0, shakeT: 0, impulse: new THREE.Vector3(),
  init() { this.light = new THREE.PointLight(0xffd9a0, 0, 7, 2); this.light.position.set(0, -10, 0); scene.add(this.light); this.sparks = new Particles(160, 0.09, true); this.dust = new Particles(90, 0.07, false);
    for (let i = 0; i < 4; i++) { const g = new THREE.RingGeometry(0.2, 0.28, 24); const m = new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
      const r = new THREE.Mesh(g, m); r.visible = false; scene.add(r); this.rings.push({ m: r, t: 0, dur: 0.3, s: 1 }); } },
  spark(pos, n, strength, color) { n = Math.ceil(n * tier().particles); const [r, g, b] = color || [1, 0.75, 0.35];
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, el = Math.random() * 1.2 - 0.2, sp = (2 + Math.random() * 5) * strength;
      this.sparks.spawn(pos.x, pos.y, pos.z, Math.cos(a) * Math.cos(el) * sp, Math.sin(el) * sp + 1.5, Math.sin(a) * Math.cos(el) * sp, 0.25 + Math.random() * 0.35, r, g, b, 12); } },
  flecks(pos, n) { n = Math.ceil(n * tier().particles); for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, sp = 1 + Math.random() * 3; this.dust.spawn(pos.x, pos.y, pos.z, Math.cos(a) * sp, 1 + Math.random() * 2, Math.sin(a) * sp, 0.5 + Math.random() * 0.4, 0.45, 0.05, 0.05, 9); } },
  puff(x, z, n) { for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, sp = 0.5 + Math.random() * 1.5; this.dust.spawn(x, 0.1, z, Math.cos(a) * sp, 0.3 + Math.random() * 0.6, Math.sin(a) * sp, 0.6 + Math.random() * 0.4, 0.35, 0.32, 0.28, 0.5); } },
  ring(pos, color, scale, dur) { const r = this.rings.find(r => !r.m.visible) || this.rings[0]; r.m.visible = true; r.t = 0; r.dur = dur || 0.3; r.s = scale || 6; r.m.material.color.setHex(color); r.m.position.copy(pos); },
  kick(amount) { Cam.addTrauma(amount * 3.2); },
  flash(pos, color, power) { if (!this.light) return; this.light.position.copy(pos); this.light.color.setHex(color); this.light.intensity = power; },
  update(dt) { this.sparks.update(dt); this.dust.update(dt);
    for (const r of this.rings) if (r.m.visible) { r.t += dt; const k = r.t / r.dur; if (k >= 1) { r.m.visible = false; continue; } r.m.scale.setScalar(1 + k * r.s); r.m.material.opacity = (1 - k) * (1 - k) * 0.6; r.m.lookAt(camera.position); }
    if (this.light) this.light.intensity *= Math.exp(-dt * 22); },
  clear() { this.sparks.clear(); this.dust.clear(); this.rings.forEach(r => r.m.visible = false); Cam.trauma = 0; Cam.fovKick = 0; Cine.clear(); Juice.clear(); Post.clear(); if (this.light) this.light.intensity = 0; },
};
let embers = null;
function initEmbers() { const n = 70; const pos = new Float32Array(n * 3), seed = new Float32Array(n); for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - .5) * 34; pos[i * 3 + 1] = Math.random() * 7; pos[i * 3 + 2] = (Math.random() - .5) * 34; seed[i] = Math.random() * 100; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ color: 0xff9a50, size: 0.11, map: V7Tex.dot(), transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; scene.add(pts); embers = { points: pts, pos, seed, g };
}
function updateEmbers(dt, now) { if (!embers || !embers.points.visible) return; const p = embers.pos; for (let i = 0; i < p.length / 3; i++) { p[i * 3 + 1] += dt * (0.25 + (embers.seed[i] % 1) * 0.4); p[i * 3] += Math.sin(now * 0.7 + embers.seed[i]) * dt * 0.3; if (p[i * 3 + 1] > 8) p[i * 3 + 1] = 0; } embers.g.attributes.position.needsUpdate = true; }

/* =====================================================================
   CAMERA RIG — critically damped springs, smooth lock transitions,
   smooth-noise shake (trauma²), FOV kick, hit-stop hold
   ===================================================================== */
function smoothDamp(cur, target, velObj, key, smoothTime, dt) {      // Unity-style critically damped spring
  smoothTime = Math.max(0.0001, smoothTime); const omega = 2 / smoothTime, x = omega * dt, exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = cur - target, temp = (velObj[key] + omega * change) * dt; velObj[key] = (velObj[key] - omega * temp) * exp; return target + (change + temp) * exp;
}
const Cam = {
  yaw: 0, pitch: 0.28, curDist: 5.4, look: new THREE.Vector3(), lookSm: new THREE.Vector3(), lookAt: new THREE.Vector3(), pos: new THREE.Vector3(), vel: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, d: 0 },
  trauma: 0, fovKick: 0, time: 0, hold: 0,
  addTrauma(a) { this.trauma = Math.min(1, this.trauma + a * CONFIG.camera.trauma); },
  kickFov(a) { this.fovKick = clamp(this.fovKick + a, -8, 10); },
  update(dt, player, target, alpha, playerChar) {
    const CC = CONFIG.camera; this.time += dt;
    const px = player.px + (player.x - player.px) * alpha, pz = player.pz + (player.z - player.pz) * alpha;
    const holdK = player.frozen ? 4 : 1;                                                   // tiny camera hold during the player's hit-stop
    if (target) { const tx = target.px + (target.x - target.px) * alpha, tz = target.pz + (target.z - target.pz) * alpha;
      const dd = Math.hypot(tx - px, tz - pz), want = Math.atan2(tx - px, tz - pz) + VISUAL.lockAngle + VISUAL.closeSwing * clamp(3.4 - dd, 0, 2) * 0.5; /* v8: wider orbit up close */ this.yaw = this.yaw + angNorm(smoothDamp(0, angNorm(want - this.yaw), this.vel, 'yaw', CC.lockYawTime * holdK, dt));
      const d = Math.hypot(tx - px, tz - pz); this.look.set(px + (tx - px) * 0.35, 1.35, pz + (tz - pz) * 0.35);
      // combat-aware framing: pull back to keep a distant foe in frame, lean in on a perilous wind-up
      const cf = VISUAL.combatFrame; this.frameDist = Math.max(0, d - 3.4) * 0.3 * cf;
      // v8: big swings (heavy / perilous / finisher, either side) pull the camera out and widen the lens so both fighters stay in frame
      const big = f => f && f.state === 'attack' && f.atk && (f.atk.def.heavy || f.atk.def.danger || f.atk.def.finisher || f.atk.def.projectile) && atkPhase(f.atk) !== 'recovery';
      CamFX.bigK = smoothDamp(CamFX.bigK, big(target) || big(player) ? 1 : 0, CamFX.bigV, 'v', 0.28, dt); this.frameDist += 0.9 * CamFX.bigK * VISUAL.camPull * cf;
      this.pitch = smoothDamp(this.pitch, clamp(0.22 + Math.max(0, 3 - d) * 0.04, -0.2, 0.9), this.vel, 'pitch', 0.35, dt);
    } else { this.vel.yaw = 0; this.look.set(px, 1.55, pz); this.frameDist = 0; }
    // cinematic focus (deathblow / phase change): swing toward the subject, closer and lower
    const cw = Cine.camWeight(dt); let cineDist = 0;
    if (cw > 0 && Game.world) { const sub = Game.world.byId(Cine.cam); if (sub) { const sx = sub.px + (sub.x - sub.px) * alpha, sz = sub.pz + (sub.z - sub.pz) * alpha;
      this.look.x += (sx - this.look.x) * 0.5 * cw; this.look.z += (sz - this.look.z) * 0.5 * cw; this.look.y += (1.25 - this.look.y) * cw; this.yaw += 0.75 * VISUAL.cineOrbit * dt * cw; this.pitch += (0.04 - this.pitch) * Math.min(1, dt * 3) * cw; cineDist = -2.3 * cw; } }
    this.pitch = clamp(this.pitch, -0.25, 1.05);
    const baseD = clamp(CC.dist + (this.frameDist || 0) + cineDist, 2.4, 9); let want = baseD; const R = CONFIG.arena.radius + 0.9;
    for (let d = baseD; d > 1.4; d -= 0.25) { const cx = this.look.x - Math.sin(this.yaw) * Math.cos(this.pitch) * d, cz = this.look.z - Math.cos(this.yaw) * Math.cos(this.pitch) * d;
      let clear = Math.hypot(cx, cz) < R; for (const p of CONFIG.arena.pillars) if (Math.hypot(cx - p.x, cz - p.z) < p.r + 0.45) { clear = false; break; } want = d; if (clear) break; }
    this.curDist = smoothDamp(this.curDist, want, this.vel, 'd', want < this.curDist ? 0.06 : 0.35, dt);
    const ft = CC.followTime * holdK;
    this.lookSm.x = smoothDamp(this.lookSm.x, this.look.x, this.vel, 'x', ft, dt); this.lookSm.y = smoothDamp(this.lookSm.y, this.look.y, this.vel, 'y', ft * 1.6, dt); this.lookSm.z = smoothDamp(this.lookSm.z, this.look.z, this.vel, 'z', ft, dt);
    const cd = this.curDist, sh = CC.shoulder * Math.min(1, cd / CC.dist) * (1 - cw * 0.6), rx = -Math.cos(this.yaw) * sh, rz = Math.sin(this.yaw) * sh;
    this.pos.set(this.lookSm.x - Math.sin(this.yaw) * Math.cos(this.pitch) * cd + rx, this.lookSm.y + Math.sin(this.pitch) * cd + 0.2, this.lookSm.z - Math.cos(this.yaw) * Math.cos(this.pitch) * cd + rz);
    this.lookAt.set(this.lookSm.x + rx * 0.55, this.lookSm.y, this.lookSm.z + rz * 0.55);
    // smooth noise shake: trauma² × summed sines (no per-frame random jitter)
    this.trauma = Math.max(0, this.trauma - CC.shakeDecay * dt); const s = this.trauma * this.trauma, t = this.time;
    const nx = Math.sin(t * 37.1) * 0.5 + Math.sin(t * 61.7 + 1.3) * 0.3 + Math.sin(t * 97.3 + 2.1) * 0.2;
    const ny = Math.sin(t * 41.3 + 0.7) * 0.5 + Math.sin(t * 67.9 + 2.9) * 0.3 + Math.sin(t * 89.1 + 0.4) * 0.2;
    const nr = Math.sin(t * 29.7 + 1.9) * 0.6 + Math.sin(t * 53.3) * 0.4;
    camera.position.set(this.pos.x + nx * s * 0.22, this.pos.y + ny * s * 0.18, this.pos.z);
    camera.lookAt(this.lookAt); camera.rotateZ(nr * s * 0.035 + 0.05 * cw * VISUAL.cineOrbit);   // v7: slight dutch angle in cinematics
    this.fovKick *= Math.exp(-dt * 7); const fov = CC.fov + this.fovKick * CC.fovKick / 5 + 4 * CamFX.bigK * VISUAL.camPull;
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
  },
};

/* =====================================================================
   INPUT — listeners registered exactly once at boot
   ===================================================================== */
const Input = {
  keys: {}, pressed: {}, lmbDown: false, lmbT: 0, rmb: false, drag: false, lastX: 0, lastY: 0, locked: false, mdx: 0, mdy: 0, wheel: 0,
  init() {
    const block = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Backquote', 'KeyF'];
    window.addEventListener('keydown', e => { if (block.includes(e.code)) e.preventDefault(); if (!e.repeat) this.pressed[e.code] = true; this.keys[e.code] = true; audio.ensure(); Game.onKey(e.code, e.repeat); });
    window.addEventListener('keyup', e => { this.keys[e.code] = false; });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('contextmenu', e => { if (Game.state === 'playing') e.preventDefault(); });
    canvas.addEventListener('mousedown', e => { e.preventDefault(); audio.ensure(); canvas.focus(); if (Game.state === 'playing') Cinema.anyInput();
      if (Game.state === 'playing' && !this.locked) { try { const r = canvas.requestPointerLock && canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (err) {} }
      this.drag = true; this.lastX = e.clientX; this.lastY = e.clientY;
      if (e.button === 0) { this.lmbDown = true; this.lmbT = performance.now(); }
      if (e.button === 2) { this.rmb = true; this.pressed.RMB = true; } });
    window.addEventListener('mouseup', e => { if (e.button === 0 && this.lmbDown) { this.lmbDown = false; const held = (performance.now() - this.lmbT) / 1000; this.pressed[held >= CONFIG.heavy.chargeHold ? 'LMB_CHARGED' : 'LMB'] = true; }
      if (e.button === 2) this.rmb = false; this.drag = false; });
    window.addEventListener('mousemove', e => { if (this.locked) { this.mdx += e.movementX || 0; this.mdy += e.movementY || 0; }
      else if (this.drag) { this.mdx += e.clientX - this.lastX; this.mdy += e.clientY - this.lastY; this.lastX = e.clientX; this.lastY = e.clientY; } });
    canvas.addEventListener('wheel', e => { e.preventDefault(); this.wheel += Math.sign(e.deltaY); }, { passive: false });
    document.addEventListener('pointerlockchange', () => { const was = this.locked; this.locked = document.pointerLockElement === canvas; if (was && !this.locked && Game.state === 'playing') Game.pause(); });
    window.addEventListener('blur', () => { this.clear(); if (Game.state === 'playing') Game.pause(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { this.clear(); if (Game.state === 'playing') Game.pause(); } });
    window.addEventListener('resize', onResize);
  },
  take(c) { const v = this.pressed[c]; this.pressed[c] = false; return !!v; },
  clear() { this.keys = {}; this.pressed = {}; this.lmbDown = false; this.rmb = false; this.drag = false; this.mdx = this.mdy = 0; this.wheel = 0; },
};

/* =====================================================================
   HUD
   ===================================================================== */
const HUD = {
  flashT: 0, lagP: 1, lagT: 1, proj: new THREE.Vector3(),
  flash(text, color, size) { const el = $('flash'); el.textContent = text; el.style.color = color; el.style.fontSize = (size || 44) + 'px'; el.style.opacity = 1; this.flashT = 0.8; },
  place(el, pos, show) { if (!show) { el.style.display = 'none'; return; } this.proj.copy(pos).project(camera); if (this.proj.z > 1) { el.style.display = 'none'; return; }
    el.style.display = 'block'; el.style.left = ((this.proj.x + 1) / 2 * window.innerWidth) + 'px'; el.style.top = ((1 - this.proj.y) / 2 * window.innerHeight) + 'px'; },
  breakFlash(isPlayer) { const el = $(isPlayer ? 'pPostBar' : 'tPostBar'); if (!el) return; el.classList.remove('broke'); void el.offsetWidth; el.classList.add('broke'); },   // v7
  postureClass(el, k) { el.classList.toggle('hot', k > 0.6 && k <= 0.85); el.classList.toggle('crit', k > 0.85); },
  update(dt, w, target) {
    const p = w.player; this.flashT -= dt; if (this.flashT < 0.35) $('flash').style.opacity = Math.max(0, this.flashT / 0.35);
    const hp = p.hp / p.maxHp; $('pHp').style.width = hp * 100 + '%'; this.lagP += (hp - this.lagP) * Math.min(1, dt * (hp < this.lagP ? 1.5 : 10)); $('pHpLag').style.width = this.lagP * 100 + '%';
    const pk = p.posture / p.postureMax; $('pPost').style.width = pk * 100 + '%'; this.postureClass($('pPostBar'), pk);
    { const a = p.state === 'attack' && p.atk ? p.atk.def.key : ''; const n = /^p_l[1-4]$/.test(a) ? +a[3] : 0, fin = a === 'p_lh' || a === 'p_l4' || a === 'p_ripo';
      const txt = a === 'p_lh' ? 'RISING' : a === 'p_ripo' ? 'RIPOSTE' : a === 'p_air' ? 'PLUNGE' : a === 'p_run' ? 'RUNNING THRUST' : a === 'p_dash' ? 'DASH CUT' : n ? '◆'.repeat(n) + '◇'.repeat(Math.max(0, CONFIG.combo.lightChain - n)) : '';
      if (txt !== this.chainTxt) { this.chainTxt = txt; const el = $('chain'); if (txt) el.textContent = txt; el.style.opacity = txt ? 1 : 0; el.classList.toggle('fin', fin); } }
    const t = target || w.enemies()[0] || null; const ht = $('hudTarget');
    if (t) { ht.style.display = 'block'; $('tName').textContent = t.name; const th = t.hp / t.maxHp; $('tHp').style.width = th * 100 + '%'; if (this.lagTid !== t.id) { this.lagT = th; this.lagTid = t.id; }
      this.lagT += (th - this.lagT) * Math.min(1, dt * (th < this.lagT ? 1.5 : 10)); $('tHpLag').style.width = this.lagT * 100 + '%';
      const tk = t.posture / t.postureMax; $('tPost').style.width = tk * 100 + '%'; this.postureClass($('tPostBar'), tk);
      const marks = t.profile.marks; let html = ''; for (let i = 0; i < marks; i++) html += '<b class="' + (i >= t.marks ? 'spent' : '') + '"></b>'; if ($('tMarks').innerHTML !== html) $('tMarks').innerHTML = html;
      $('tPhase').textContent = t.profile.boss ? (t.phase === 2 ? 'PHASE II' : 'PHASE I') : ''; }
    else ht.style.display = 'none';
    const lockT = w.lockTarget(p); const chars = Game.chars;
    const lc = lockT && chars.get(lockT.id); this.place($('reticle'), lc ? lc.root.position.clone().setY(1.25 * lc.look.scale) : this.proj, !!lc);
    // danger glyph over any enemy winding up a perilous attack
    let dz = null; for (const e of w.enemies()) if (e.state === 'attack' && e.atk && e.atk.def.danger && atkPhase(e.atk) === 'startup') { dz = chars.get(e.id); break; }
    this.place($('danger'), dz ? dz.root.position.clone().setY(2.35 * dz.look.scale) : this.proj, !!dz);
    if (dz) { const t = dz.f.atk.def.type; $('dangerLbl').textContent = CONFIG.parry.accessibility ? (t === 'sweep' ? 'JUMP' : t === 'grab' ? 'DODGE' : 'STEP IN / DEFLECT') : ''; }
    const db = w.deathblowCandidate(p) || w.enemies().find(e => e.deathblowable); const dc = db && chars.get(db.id);
    this.place($('dbDot'), dc ? dc.root.position.clone().setY(1.2 * dc.look.scale) : this.proj, !!dc); this.place($('dbHint'), dc ? dc.root.position.clone().setY(1.2 * dc.look.scale) : this.proj, !!(dc && w.deathblowCandidate(p)));
    const ch = $('chargeRing'); if (Input.lmbDown && Game.state === 'playing') { const k = Math.min(1, (performance.now() - Input.lmbT) / 1000 / CONFIG.heavy.chargeHold); ch.style.display = k > 0.25 ? 'block' : 'none'; ch.firstChild.style.width = k * 100 + '%'; ch.firstChild.style.background = k >= 1 ? '#ff7a3d' : '#f0d68a'; } else ch.style.display = 'none';
  },
};

/* =====================================================================
   GAME FLOW
   ===================================================================== */
/* ---------- Crimson Arc: travelling blood-wave visuals (reads core projectiles; never writes) ---------- */
const Projectiles = {
  live: new Map(), geo: null, warn: new Map(),
  mk() { if (!this.geo) { this.geo = new THREE.RingGeometry(0.75, 1.15, 22, 1, Math.PI * 0.08, Math.PI * 0.84); }
    const m = new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const g = new THREE.Group(); const a = new THREE.Mesh(this.geo, m); const b = new THREE.Mesh(this.geo, m.clone()); b.scale.setScalar(0.82); b.material.color.setHex(0xff5a30); b.material.opacity = 0.5; g.add(a); g.add(b); scene.add(g); return g; },
  spawn(e) { const g = this.mk(); g.rotation.y = e.dir; g.position.set(e.x, 0, e.z); this.live.set(e.id, { g, t: 0, end: -1 }); },
  end(e) { const L = this.live.get(e.id); if (!L) return; L.end = 0; const pos = new THREE.Vector3(e.x, 0.9, e.z);
    if (e.how === 'deflect') { FX.spark(pos, 26, 1.1, [1, 0.5, 0.3]); FX.ring(pos, 0xff6a40, 8, 0.3); } else FX.spark(pos, 14, 0.7, [1, 0.15, 0.08]); },
  // v6: ground warning — a crimson lane flares under the wave's path 0.3 s before it is released
  warnMesh() { const g = new THREE.PlaneGeometry(1.6, 7); g.translate(0, 3.6, 0); g.rotateX(-Math.PI / 2); const m = new THREE.MeshBasicMaterial({ color: 0xff2010, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const mesh = new THREE.Mesh(g, m); mesh.position.y = 0.03; scene.add(mesh); return mesh; },
  update(w, alpha, dt) {
    for (const f of w.fighters) { const a = f.atk; let W = this.warn.get(f.id); const lead = a && a.def.projectile && f.state === 'attack' ? a.su - a.t : -1;
      if (lead > 0 && lead <= 0.3) { if (!W) { W = this.warnMesh(); this.warn.set(f.id, W); } W.visible = true; W.position.x = f.x; W.position.z = f.z; W.rotation.y = f.facing; W.material.opacity = 0.18 + 0.5 * (1 - lead / 0.3) * (0.75 + 0.25 * Math.sin(lead * 90)); }
      else if (W && W.visible) { W.material.opacity *= 0.8; if (W.material.opacity < 0.01) W.visible = false; } }
    for (const [id, L] of this.live) {
      const pr = w.projectiles.find(q => q.id === id);
      if (pr && !pr.dead) { const back = (1 - alpha) * CONFIG.sim.dt; L.g.position.set(pr.x - pr.vx * back, 0.05, pr.z - pr.vz * back); L.t += dt;
        const sc = 0.6 + Math.min(1, L.t * 6) * 0.6; L.g.scale.set(sc * 1.3, sc, sc); L.g.children[0].material.opacity = 0.85 + Math.sin(L.t * 40) * 0.1;
        if (Math.random() < tier().particles) FX.sparks.spawn(L.g.position.x + (Math.random() - 0.5) * 1.4, 0.2 + Math.random() * 1.0, L.g.position.z, (Math.random() - 0.5) * 0.6, 0.8, (Math.random() - 0.5) * 0.6, 0.35, 1, 0.12, 0.05, -1); }
      else { if (L.end < 0) L.end = 0; L.end += dt; const k = 1 - L.end / 0.18; if (k <= 0) { scene.remove(L.g); L.g.children.forEach(c => c.material.dispose()); this.live.delete(id); continue; } L.g.children.forEach(c => c.material.opacity *= 0.7); L.g.scale.multiplyScalar(1.04); }
    } },
  clear() { for (const L of this.live.values()) { scene.remove(L.g); L.g.children.forEach(c => c.material.dispose()); } this.live.clear(); for (const W of this.warn.values()) { scene.remove(W); W.geometry.dispose(); W.material.dispose(); } this.warn.clear(); },
};
/* v6: stereo position of a world point relative to the camera (-1 left … 1 right) */
const _panV = new THREE.Vector3();
function panOf(x, z) { _panV.set(x - camera.position.x, 0, z - camera.position.z); const rx = Math.cos(Cam.yaw), rz = -Math.sin(Cam.yaw); const l = Math.hypot(_panV.x, _panV.z) || 1; return clamp((_panV.x * -rx + _panV.z * -rz) / l, -1, 1) * 0.7; }
/* v6: coach — short reactive lines in practice and in the first fight */
const Coach = {
  on: false, t: 0, last: '', soft: 0,
  say(text, hold) { if (!this.on) return; const el = $('coach'); if (!el) return; el.textContent = text; el.style.opacity = 1; this.t = hold || 1.8; this.last = text; },
  update(dt) { if (this.t > 0) { this.t -= dt; if (this.t <= 0) { const el = $('coach'); if (el) el.style.opacity = 0; } } },
  onEvent(e, w) {
    if (!this.on) return; const pl = w.player; const toPl = e.d === pl.id, byPl = e.a === pl.id;
    switch (e.type) {
      case 'earlyParry': this.say('Too early — wait for the blade'); break;
      case 'deflect': if (toPl) this.say(e.quality === 'perfect' ? 'Perfect — right on the strike' : e.quality === 'late' ? 'Late — caught in the grace frames' : 'Good — press a hair later for Perfect'); else if (byPl) this.say('Deflected — your swing was read. Mix in a pause'); break;
      case 'block': if (toPl) this.say('Tap, don\u2019t hold — holding only blocks'); break;
      case 'guardbreak': if (toPl) this.say('Guard broken — deflect to keep posture'); break;
      case 'hit': if (toPl) { const t = ATTACKS[e.key] ? ATTACKS[e.key].type : ''; this.say(t === 'thrust' ? 'Thrust: deflect, or dodge INTO it (Counterstep)' : t === 'sweep' ? 'Sweep: jump (C), then attack mid-air' : t === 'grab' ? 'Grab: can\u2019t be blocked — dodge it' : ATTACKS[e.key] && ATTACKS[e.key].projectile ? 'Crimson Arc: deflect, jump, or dodge through' : 'Tap guard as the blade lands'); } break;
      case 'danger': this.say({ thrust: '危 Thrust — deflect or step into it', sweep: '危 Sweep — jump!', grab: '危 Grab — dodge!' }[e.atype] || '危 Perilous', 1.0); break;
      case 'jumped': this.say('Now attack in the air to trample'); break;
      case 'jumpKick': this.say('Trampled!'); break;
      case 'mikiri': this.say('Counterstep!'); break;
      case 'grabWhiff': this.say('Slipped the grab — punish!'); break;
      case 'postureBreak': if (e.f !== pl.id) this.say('Posture broken — E to deathblow', 2.2); else this.say('Your posture broke — deflect more, block less'); break;
      case 'trainerReset': this.say('The Shade stands again'); break;
    }
  },
};
/* v6: gamepad (standard mapping) — feeds the same intent path as keyboard */
const Pad = {
  prev: [], held: {}, lx: 0, ly: 0, rx: 0, ry: 0, xT: 0, connected: false, DZ: 0.18,
  dz(v) { return Math.abs(v) < this.DZ ? 0 : (v - Math.sign(v) * this.DZ) / (1 - this.DZ); },
  poll() { let gp = null; try { const list = navigator.getGamepads ? navigator.getGamepads() : []; for (const g of list) if (g && g.connected) { gp = g; break; } } catch (e) {}
    this.connected = !!gp; if (!gp) { this.lx = this.ly = this.rx = this.ry = 0; this.held = {}; return; }
    const b = i => !!(gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.5)), edge = i => b(i) && !this.prev[i];
    this.lx = this.dz(gp.axes[0] || 0); this.ly = this.dz(gp.axes[1] || 0); this.rx = this.dz(gp.axes[2] || 0); this.ry = this.dz(gp.axes[3] || 0);
    const P = Input.pressed; if (Game.state === 'playing') { for (let i = 0; i < gp.buttons.length; i++) if (edge(i)) { Cinema.anyInput(); break; } if (Intro.active && Math.hypot(this.lx, this.ly) > 0.5) Cinema.anyInput(); }
    if (edge(0)) P.KeyJ = true; if (edge(1)) P.Space = true; if (edge(6)) P.KeyC = true; if (edge(3)) P.KeyE = true; if (edge(4) || edge(11)) P.KeyQ = true;
    if (edge(5) || edge(7)) P.KeyF = true; if (edge(15)) { P.Tab = true; } if (edge(14)) { Input.wheel = -1; }
    if (edge(2)) this.xT = performance.now(); if (!b(2) && this.prev[2]) P[(performance.now() - this.xT) / 1000 >= CONFIG.heavy.chargeHold ? 'LMB_CHARGED' : 'KeyK'] = true;
    if (edge(9)) Game.onKey(Game.state === 'title' ? 'Enter' : 'Escape', false); if (edge(8)) Game.onKey('KeyR', false);
    this.held.guard = b(5) || b(7); this.held.sprint = b(10) || Math.hypot(this.lx, this.ly) > 0.95 && b(1);
    for (let i = 0; i < gp.buttons.length; i++) this.prev[i] = b(i); },
};
/* v6: adaptive quality — one automatic step down per session if the frame rate stays low */
const Perf = {
  acc: 0, n: 0, playT: 0, stepped: false,
  update(dt, playing) { if (!playing) { this.acc = this.n = 0; return; } this.playT += dt; if (this.playT < 4 || this.stepped || Settings.quality === 'low') return; this.acc += dt; this.n++;
    if (this.acc >= 2) { const fps = this.n / this.acc; this.acc = this.n = 0; if (fps < 40) { this.stepped = true; Settings.quality = Settings.quality === 'high' ? 'medium' : 'low'; applyQuality(); onResize(); Store.save(); toast('Quality lowered for performance (' + fps.toFixed(0) + ' fps)'); } } },
};
function toast(msg) { const el = $('toast'); if (!el) return; el.textContent = msg; el.style.opacity = 1; clearTimeout(toast.t); toast.t = setTimeout(() => el.style.opacity = 0, 3200); }
/* v6: grade — damage taken dominates, perfect share and clean execution lift it */
function gradeOf(s, win) { if (!win) return '—'; const defl = s.perfect + s.good + s.late, ps = defl ? s.perfect / defl : 0;
  const score = 100 - s.hitsTaken * 9 - s.earlyParries * 2 + ps * 20 + Math.min(10, s.mikiri * 3 + s.jumpKicks * 2); return score >= 95 ? 'S' : score >= 80 ? 'A' : score >= 60 ? 'B' : 'C'; }
const GRADE_RANK = { S: 4, A: 3, B: 2, C: 1, '—': 0 };
const fmtT = t => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
/* v6: practice against any foe — the Shade borrows its look and moveset */
function shadeOf(foe) {
  const T = CORE.PROFILES.trainer; if (!foe || foe === 'trainer' || !CORE.PROFILES[foe]) return T; const P = CORE.PROFILES[foe];
  const keys = []; const add = c => c.c.forEach(st => { const k = CORE.stepOf(st).k; if (!keys.includes(k)) keys.push(k); });
  P.combos.forEach(add); if (P.phase2) P.phase2.combos.forEach(add);
  return Object.assign({}, T, { name: 'Shade of ' + P.name.replace(/^The /, ''), look: P.look, lesson: keys.map(k => [k]), perilous: keys.filter(k => ATTACKS[k].danger || ATTACKS[k].projectile).map(k => [k]) });
}
const ENC_NAMES = { practice: 'Practice Dummy', duelist: 'The Duelist', warden: 'The Iron Warden', brother: 'The False Brother', pair: 'Two Oathbreakers', duowarden: 'Blade and Wall', king: "The King's First Blade", gauntlet: 'Gauntlet' };
const ENCOUNTERS = { duelist: [['duelist']], warden: [['warden']], brother: [['brother']], king: [['king']], pair: [['duelist', 'brother']], duowarden: [['duelist', 'warden']], practice: [['trainer']], gauntlet: [['duelist'], ['warden'], ['brother'], ['king']] };
const Game = {
  state: 'title', world: null, chars: new Map(), enc: 'duelist', stage: 0, t0: 0, lastFrame: 0, fps: 60, fpsAcc: 0, fpsN: 0, selfTests: null, frameCount: 0,
  overlay(id) { for (const o of ['title', 'pause', 'dead', 'win', 'tut']) $(o).classList.toggle('show', o === id); },
  showHud(on) { $('hudPlayer').style.display = on ? 'block' : 'none'; $('hints').style.display = on && Settings.hints ? 'block' : 'none'; if (!on) { $('hudTarget').style.display = 'none'; ['reticle', 'danger', 'dbDot', 'dbHint', 'chargeRing'].forEach(i => $(i).style.display = 'none'); } },
  start(enc, foe) { this.enc = enc; this.stage = 0; this.practiceFoe = enc === 'practice' ? (foe || null) : null; this.begin(); },
  practiceThis() { const list = ENCOUNTERS[this.enc] && ENCOUNTERS[this.enc][this.stage]; const foe = this.enc === 'practice' ? this.practiceFoe : list && list[list.length - 1]; this.start('practice', foe); },
  updatePracticeHud() { const T = this.training || {}, on = v => v ? '<b>on</b>' : 'off';
    $('practice').innerHTML = `PRACTICE — ${this.practiceFoe ? ENC_NAMES[this.practiceFoe] || this.practiceFoe : 'Training Shade'}<br>1 perilous only: ${on(T.perilous)}<br>2 Shade holds guard: ${on(T.guard)}<br>3 pause swings: ${on(T.paused)}<br>4 cadence: ${(T.cadence || 2.4).toFixed(1)} s`; },
  begin() {
    // full teardown: no duplicated fighters, meshes, particles or listeners
    for (const c of this.chars.values()) c.dispose(); this.chars.clear(); FX.clear(); VFX.clear(); Input.clear(); Debug.reset(); Projectiles.clear(); this.chipTaught = false;
    const w = new World((Date.now() & 0xffff) + 1); this.world = w;
    const p = w.addPlayer(0, -6); p.facing = 0;
    const list = ENCOUNTERS[this.enc][this.stage], practice = this.enc === 'practice';
    list.forEach((k, i) => { const e = w.addEnemy(k, (i - (list.length - 1) / 2) * 4, practice ? -2 : 5); e.facing = Math.PI; if (practice) { e.profile = shadeOf(this.practiceFoe); e.name = e.profile.name; } });
    if (practice) { w.training = this.training = this.training || { perilous: false, guard: false, paused: false, cadence: 2.4 }; }
    if (Settings.mirror && !practice) { p.maxHp = p.hp = Math.round(p.maxHp * 0.8); p.postureMax = Math.round(p.postureMax * 0.8); }   // v6: Mirror challenge
    // v6: soft tutorial — the first Duelist fight starts slower and coached, without blocking input
    this.softT = 0; Coach.on = practice; Coach.t = 0; $('coach').style.opacity = 0;
    if (!practice && this.enc === 'duelist' && this.stage === 0 && !Store.data.seenTutorial) { this.softT = 20; Coach.on = true; for (const e of w.enemies()) e.tempoMult = 1.25; setTimeout(() => Coach.say('Tap F (or right mouse) as the blade lands', 3), 900); }
    if (practice) setTimeout(() => Coach.say('Watch the Shade. Tap F as each blade lands', 3), 900);
    $('practice').style.display = practice ? 'block' : 'none'; this.updatePracticeHud(); Perf.playT = 0; audio.bed(0);
    for (const f of w.fighters) this.chars.set(f.id, new Character(f, f.isPlayer ? 'player' : f.profile.look));
    for (const b of document.querySelectorAll('[data-enc]')) b.blur();
    Cam.yaw = 0; Cam.pitch = 0.28; Cam.lookSm.set(0, 1.5, -6); Cam.curDist = CONFIG.camera.dist; for (const k in Cam.vel) Cam.vel[k] = 0; Cam.trauma = 0; Cam.fovKick = 0;
    p.lockId = null; this.t0 = 0; HUD.lagP = 1; HUD.lagT = 1; HUD.lagTid = -1;
    this.state = 'playing'; this.overlay(null); this.showHud(true);
    const names = list.map(k => CORE.PROFILES[k].name).join(' & '); const prof = CORE.PROFILES[list[0]] || {};   // v7: boss name card
    const card = [practice ? (this.practiceFoe ? 'Shade of ' + (ENC_NAMES[this.practiceFoe] || this.practiceFoe) : names) : names, list.length > 1 ? ENC_NAMES[this.enc] : practice ? EPITHETS.trainer : EPITHETS[(prof.look || list[0])] || '', !!prof.boss];
    // v8: boss intro (~3 s, skippable by any input, which still reaches the game) on a fresh entry; restarts go straight in
    Cinema.clear(); NameCard.hide();
    if (Intro.enabled && Settings.intros !== false && !practice && !this.restarting) Intro.start(w.enemies()[w.enemies().length - 1], card); else NameCard.show(card[0], card[1], card[2]);
    canvas.focus();
  },
  pause() { if (this.state !== 'playing') return; this.state = 'paused'; Input.clear(); this.overlay('pause'); audio.bed(0);
    { const n = ENCOUNTERS[this.enc].length; $('pauseInfo').textContent = (ENC_NAMES[this.enc] || this.enc) + (n > 1 ? ' — foe ' + (this.stage + 1) + ' of ' + n : '') + (Settings.mirror && this.enc !== 'practice' ? ' · Mirror' : ''); } try { if (document.exitPointerLock && Input.locked) document.exitPointerLock(); } catch (e) {} },
  resume() { if (this.state !== 'paused') return; this.state = 'playing'; this.overlay(null); this.lastFrame = performance.now(); canvas.focus(); },
  quit() { for (const c of this.chars.values()) c.dispose(); this.chars.clear(); Projectiles.clear(); this.world = null; Coach.on = false; $('coach').style.opacity = 0; $('practice').style.display = 'none'; audio.bed(0); this.refreshBest(); FX.clear(); VFX.clear(); NameCard.hide(); Cinema.clear(); this.state = 'title'; this.showHud(false); this.overlay('title'); try { if (document.exitPointerLock) document.exitPointerLock(); } catch (e) {} },
  restart() { if (!this.world && this.state === 'title') return; this.restarting = true; try { this.begin(); } finally { this.restarting = false; } },
  onKey(code, repeat) {
    if (!repeat && this.state === 'playing' && (Intro.active || Victory.active)) { const wasIntro = Intro.active; Cinema.anyInput(); if (wasIntro && (code === 'Escape' || code === 'KeyP')) return; }   // v8: skip, never consume
    if (repeat) return;
    if (code === 'Escape' || code === 'KeyP') { if (this.state === 'playing') this.pause(); else if (this.state === 'paused') this.resume(); else if (this.state === 'tut') this.closeTut(); return; }
    if (code === 'KeyR' && ['playing', 'paused', 'dead', 'victory'].includes(this.state)) { this.restart(); return; }
    if (code === 'KeyH') { Settings.hints = !Settings.hints; $('hints').style.display = Settings.hints && this.state === 'playing' ? 'block' : 'none'; Store.save(); }
    if (code === 'Enter' && this.state === 'title') { audio.ensure(); this.start('practice'); return; }
    if (this.enc === 'practice' && this.world && this.training && ['Digit1', 'Digit2', 'Digit3', 'Digit4'].includes(code)) { const T = this.training;
      if (code === 'Digit1') T.perilous = !T.perilous; if (code === 'Digit2') T.guard = !T.guard; if (code === 'Digit3') T.paused = !T.paused; if (code === 'Digit4') T.cadence = T.cadence >= 3.4 ? 1.6 : +(T.cadence + 0.6).toFixed(1);
      for (const e of this.world.enemies()) if (e.brain) e.brain.lessonI = -1; this.updatePracticeHud(); audio.play('ui'); }
    if (code === 'Backquote') this.toggleDebug();
    if (code === 'KeyT' && (Settings.debug || this.state === 'paused')) Tune.toggle();
  },
  toggleDebug() { Settings.debug = !Settings.debug; $('debug').style.display = Settings.debug ? 'block' : 'none'; $('dbgBtn').textContent = 'Debug: ' + (Settings.debug ? 'On' : 'Off'); Debug.setVisible(Settings.debug); },
  openTut() { this.tutReturn = this.state; this.state = 'tut'; this.overlay('tut'); },
  closeTut() { this.state = this.tutReturn || 'title'; this.overlay(this.state === 'paused' ? 'pause' : this.state === 'title' ? 'title' : null); },
  gatherIntent(dt) {
    const w = this.world, p = w.player, I = p.intent, K = Input.keys;
    // camera
    const ak = (K.ArrowLeft ? 1 : 0) - (K.ArrowRight ? 1 : 0), pk = (K.ArrowUp ? 1 : 0) - (K.ArrowDown ? 1 : 0);
    Cam.yaw += ak * dt * 2.4 - Input.mdx * Settings.sens - Pad.rx * dt * Settings.padSens; Cam.pitch += -pk * dt * 1.4 + Input.mdy * Settings.sens * 0.8 + Pad.ry * dt * Settings.padSens * 0.55; Input.mdx = Input.mdy = 0;
    // movement relative to camera yaw
    const fwd = clamp((K.KeyW ? 1 : 0) - (K.KeyS ? 1 : 0) - Pad.ly, -1, 1), str = clamp((K.KeyD ? 1 : 0) - (K.KeyA ? 1 : 0) + Pad.lx, -1, 1);
    const sy = Math.sin(Cam.yaw), cy = Math.cos(Cam.yaw);
    let mx = sy * fwd - cy * str, mz = cy * fwd + sy * str; const m = Math.hypot(mx, mz); if (m > 1) { mx /= m; mz /= m; }
    I.mx = mx; I.mz = mz; I.sprint = !!(K.ShiftLeft || K.ShiftRight || Pad.held.sprint);
    I.guard = !!(K.KeyF || Input.rmb || Pad.held.guard);
    if (Input.take('KeyF') || Input.take('RMB')) I.parry = true;   // feedback comes from the core's guardRaise event, so it is never false
    if (Input.take('KeyJ') || Input.take('LMB')) I.light = true;
    if (Input.take('KeyK')) I.heavy = true;
    if (Input.take('LMB_CHARGED')) I.charged = true;
    if (Input.take('Space')) I.dodge = true;
    if (Input.take('KeyC')) I.jump = true;
    if (Input.take('KeyE')) I.deathblow = true;
    if (Input.take('KeyQ')) { if (p.lockId) p.lockId = null; else { const t = this.pickTarget(p, 0); if (t) p.lockId = t.id; } }
    if (Input.take('Tab') || Input.wheel) { const dir = Input.wheel || 1; Input.wheel = 0; if (p.lockId) { const t = this.pickTarget(p, dir); if (t) p.lockId = t.id; } }
  },
  pickTarget(p, cycle) {
    const es = this.world.enemies(); if (!es.length) return null;
    if (cycle && p.lockId) { const i = es.findIndex(e => e.id === p.lockId); return es[(i + (cycle > 0 ? 1 : es.length - 1)) % es.length]; }
    let best = null, bs = 1e9; for (const e of es) { const d = Math.hypot(e.x - p.x, e.z - p.z); const ang = Math.abs(angNorm(Math.atan2(e.x - p.x, e.z - p.z) - Cam.yaw)); const s = d + ang * 6; if (d < 30 && s < bs) { bs = s; best = e; } } return best;
  },
  handleEvents() {
    const w = this.world; const evs = w.events; if (!evs.length) return;
    for (const e of evs) {
      Juice.onEvent(e, w, this); Coach.onEvent(e, w);
      const A = e.a && this.chars.get(e.a), D = e.d && this.chars.get(e.d);
      const contact = () => { const v = new THREE.Vector3(); if (A && D) { v.copy(A.tipW).add(D.tipW).multiplyScalar(0.5); if (v.y < 0.6) v.y = 1.2; } else v.set(e.x || 0, 1.3, e.z || 0); return v; };
      switch (e.type) {
        case 'attackStart': { const c = this.chars.get(e.f); if (c) setTimeout(() => audio.play(e.finisher ? 'finisher' : 'whoosh', { heavy: ATTACKS[e.key].heavy }), Math.max(0, e.su * 1000 - 40));
          if (e.last && VISUAL.stringCue && c && !c.f.isPlayer) audio.play('cue'); break; }
        case 'finisherStart': break;
        case 'projectile': { audio.play('wave'); Projectiles.spawn(e); break; }
        case 'projectileEnd': { Projectiles.end(e); break; }
        case 'crimsonChip': { const c = this.chars.get(e.d); audio.play('chip'); if (c) FX.spark(c.root.position.clone().setY(1.2), 12, 0.6, [1, 0.1, 0.05]); Post.pulse('120,0,0', 0.25);
          if (!this.chipTaught) { this.chipTaught = true; HUD.flash('BLOCKING CHIPS HEALTH — DEFLECT THE ARC', '#ff5a4a', 22); Coach.on = true; Coach.say('In Phase II, blocking chips your health — deflect', 3); setTimeout(() => { if (Game.enc !== 'practice' && Game.softT <= 0) Coach.on = false; }, 3200); } break; }
        case 'guardRaise': { const f = w.byId(e.f); if (f && f.isPlayer) audio.play('guardUp', { spam: e.spam }); break; }
        case 'guardDropped': Debug.note('guard press expired in buffer'); break;
        case 'branch': { Debug.note('branch: ' + e.why + ' → ' + e.to); const c = this.chars.get(e.f); if (c && c.model) c.model.eyeFlash = 1; audio.play('branch'); break; }
        case 'mikiri': { const pos = contact(); audio.play('mikiri'); FX.spark(pos, 26, 1.0, [1, 0.8, 0.5]); FX.ring(pos, 0xffffff, 9, 0.35); FX.flash(pos, 0xfff0d0, 6); FX.kick(0.16); Cam.kickFov(-3); HUD.flash('COUNTERSTEP', '#f6e2a8', 40); break; }
        case 'jumpKick': { const c = this.chars.get(e.d); audio.play('kick'); if (c) FX.ring(c.root.position.clone().setY(1.2), 0xffcf6a, 7, 0.3); FX.kick(0.12); HUD.flash('TRAMPLED', '#ffcf6a', 34); break; }
        case 'grabWhiff': audio.play('whoosh', { heavy: true }); HUD.flash('SLIPPED', '#9fc6ff', 26); break;
        case 'danger': audio.play('danger'); break;
        case 'feint': audio.play('feint'); break;
        case 'deflect': { const pos = contact(); audio.play('deflect', { heavy: e.heavy, pan: panOf(e.x, e.z), vol: e.quality === 'late' ? 0.7 : 1 }); FX.spark(pos, 44, 1.35, [1, 0.85, 0.5]); FX.ring(pos, 0xffe0a0, 7, 0.22); FX.flash(pos, 0xffd9a0, e.heavy ? 7 : 5); FX.kick(e.heavy ? 0.13 : 0.09); Cam.kickFov(-2.5);
          const pl = w.byId(e.d), perfect = e.quality === 'perfect';   // v7: streak sparks, glare, screen punch, edge flash
          VFX.streaks.burst(pos, perfect ? 44 : 26, perfect ? 1.25 : 1, perfect ? [1, 0.95, 0.85] : [1, 0.75, 0.4]); VFX.glare(pos, perfect ? [1, 0.97, 0.9] : [1, 0.85, 0.6], perfect ? 3.4 : 2.2, perfect ? 0.26 : 0.18);
          PostFX.punch(perfect ? 0.022 : 0.011); if (perfect) PostFX.flash([1, 0.9, 0.7], 0.22); if (D) D.edgeFlash = perfect ? 1 : 0.55;
          if (pl && pl.isPlayer) { if (e.quality === 'perfect') { HUD.flash('PERFECT', '#ffffff', 52); audio.play('perfect', { pan: panOf(e.x, e.z) }); FX.ring(pos, 0xffffff, 6.5, 0.26); FX.spark(pos, 22, 1.5, [1, 1, 0.9]); Cam.kickFov(-3.5); Post.pulse('255,215,120', 0.32); }
            else if (e.quality === 'late') { HUD.flash('LATE', '#b7a780', 34); audio.play('late'); } else HUD.flash('DEFLECT', '#f6e2a8'); } else HUD.flash('DEFLECTED', '#ff9b7a', 30); break; }
        case 'block': { const pos = contact(); audio.play('block', { pan: panOf(e.x, e.z) }); FX.spark(pos, 10, 0.6, [0.9, 0.6, 0.3]); VFX.streaks.burst(pos, 8, 0.6, [0.9, 0.55, 0.25]); FX.kick(e.heavy ? 0.08 : 0.04); if (w.byId(e.d).isPlayer) HUD.flash('BLOCKED', '#b9ae98', 26); break; }
        case 'guardbreak': { audio.play('block'); audio.play('break'); FX.kick(0.15); HUD.flash('GUARD BROKEN', '#ff6a3d', 34); break; }
        case 'hit': { const pos = contact(); if (D) pos.copy(D.root.position).setY(1.25 * D.look.scale); audio.play('hit', { heavy: e.heavy || e.finisher, pan: panOf(e.x, e.z) }); FX.flecks(pos, e.heavy ? 14 : 8); FX.kick(e.finisher ? 0.16 : e.heavy ? 0.12 : 0.05); if (e.heavy || e.finisher) Cam.kickFov(3);
          VFX.splash(pos, e.heavy || e.finisher, e.dir === 'L' ? -1 : e.dir === 'R' ? 1 : 0); if (D) VFX.stain(D.root.position.x, D.root.position.z, e.heavy ? 1.2 : 0.8); if (e.heavy || e.finisher) PostFX.punch(0.008);
          if (e.finisher) { FX.ring(pos, 0xffd890, 8, 0.3); FX.spark(pos, 18, 1.0, [1, 0.85, 0.55]); FX.flash(pos, 0xffe0b0, 5); } break; }
        case 'postureBreak': { const c = this.chars.get(e.f); audio.play('break'); if (c) { const pos = c.root.position.clone().setY(1.3); FX.ring(pos, 0xffb030, 9, 0.45); FX.spark(pos, 20, 0.8, [1, 0.7, 0.2]);
            VFX.glare(pos, [1, 0.8, 0.35], 4.2, 0.35); VFX.streaks.burst(pos, 30, 1.1, [1, 0.7, 0.25]); } FX.kick(0.18); PostFX.punch(0.02); PostFX.flash(w.byId(e.f).isPlayer ? [0.8, 0.12, 0.08] : [1, 0.78, 0.35], 0.32); HUD.breakFlash(w.byId(e.f).isPlayer);
          const f = w.byId(e.f); HUD.flash(f.isPlayer ? 'POSTURE BROKEN' : 'POSTURE BROKEN', f.isPlayer ? '#ff5a3a' : '#ffcf6a', 36); break; }
        case 'dodged': if (w.byId(e.f).isPlayer) HUD.flash('EVADED', '#9fc6ff', 22); break;
        case 'jumped': HUD.flash('EVADED', '#9fc6ff', 22); break;
        case 'dodge': { const f = w.byId(e.f); audio.play('dodge'); FX.puff(f.x, f.z, 6); if (f.isPlayer) Cam.kickFov(2.2); break; }
        case 'jump': audio.play('jump'); break;
        case 'deathblow': { audio.play('deathblow'); audio.play('execSting'); HUD.flash('DEATHBLOW', '#ff3b30', 48); break; }
        case 'phase2': { audio.play('phase'); audio.play('phaseSting'); FX.kick(0.25); HUD.flash('THE BLADE UNSHEATHES HIS RESOLVE', '#ff4a3a', 24); const c = this.chars.get(e.f); if (c) FX.ring(c.root.position.clone().setY(1.2), 0xff2a1a, 12, 0.9); break; }
        case 'enemyDead': { const pc = this.chars.get(w.player.id); if (pc) pc.flourishT = 0; break; }
        case 'death': audio.play('death'); break;
        case 'gameover': if (e.win) Victory.start(this); else Death.start(this); break;   // v8: presentation-timed victory card / death fade (skippable)
        case 'earlyParry': Debug.note('early deflect (outside window)'); break;
        case 'watchdog': Debug.note('watchdog reset ' + e.s); break;
      }
    }
    evs.length = 0;
  },
  endEncounter(win) {
    if (this.state !== 'playing' || !this.world || !this.world.over) return;
    const p = this.world.player, s = p.stats, t = this.world.time;
    // v6: post-fight breakdown, grade, personal best
    const g = gradeOf(s, win), bk = this.enc + (Settings.mirror ? '_mirror' : ''), lastStage = this.stage >= ENCOUNTERS[this.enc].length - 1;
    let pb = ''; if (win && lastStage) { const B = Store.data.best[bk]; const better = !B || t < B.time || GRADE_RANK[g] > GRADE_RANK[B.grade];
      if (better) { Store.data.best[bk] = { time: B ? Math.min(B.time, t) : t, deflects: s.deflects, grade: B && GRADE_RANK[B.grade] > GRADE_RANK[g] ? B.grade : g }; pb = '<div class="flavor">New personal best</div>'; } }
    if (this.enc === 'duelist') Store.data.seenTutorial = true; Store.save();
    const row = (a, b) => `<tr><td>${a}</td><td>${b}</td></tr>`;
    const line = (win ? `<div class="grade">${g}</div>` : '') + pb + '<table>' + row('Time', fmtT(t)) + row('Deflects — perfect / good / late', `${s.perfect} / ${s.good} / ${s.late}`) + row('Blocks', s.blocks) +
      row('Hits taken · damage', `${s.hitsTaken} · ${Math.round(s.dmgTaken)}`) + row('Early presses', s.earlyParries) + row('Counterstep · Trample', `${s.mikiri} · ${s.jumpKicks}`) + row('Deathblows', s.deathblows) + '</table>';
    $('practiceBtn').style.display = $('practiceBtn2').style.display = this.enc === 'practice' ? 'none' : 'inline-block'; audio.bed(0);
    if (!win) audio.play('deathSting');
    this.showHud(false); try { if (document.exitPointerLock) document.exitPointerLock(); } catch (e) {}
    if (win) { this.state = 'victory'; audio.play('win'); $('winStats').innerHTML = line; const more = this.stage < ENCOUNTERS[this.enc].length - 1; $('nextBtn').style.display = more ? 'block' : 'none';
      $('winTitle').textContent = more ? 'FOE VANQUISHED' : 'VICTORY'; this.overlay('win'); }
    else { this.state = 'dead'; $('deadStats').innerHTML = line; this.overlay('dead'); }
  },
  refreshBest() { document.querySelectorAll('[data-enc]').forEach(b => { let el = b.querySelector('.best'); const B = Store.data.best[b.dataset.enc + (Settings.mirror ? '_mirror' : '')];
      if (!el) { el = document.createElement('span'); el.className = 'best'; b.appendChild(el); } el.textContent = B ? 'Best ' + fmtT(B.time) + ' · ' + B.grade + (Settings.mirror ? ' (mirror)' : '') : ''; }); },
  next() { if (this.stage < ENCOUNTERS[this.enc].length - 1) { this.stage++; this.begin(); } },
  frame(now) {
    const rawDt = (now - (this.lastFrame || now)) / 1000, dt = rawDt > 0 ? Math.min(0.1, rawDt) : 0; this.lastFrame = now;   // v8: a clock that steps backwards gives dt 0, never a negative step into the springs this.frameCount++;
    this.fpsAcc += dt; this.fpsN++; if (this.fpsAcc > 0.5) { this.fps = this.fpsN / this.fpsAcc; this.fpsAcc = 0; this.fpsN = 0; }
    const secs = now / 1000; let alpha = 1;
    Pad.poll(); Coach.update(dt); Perf.update(dt, this.state === 'playing');
    if (this.world && this.state === 'playing' && Intro.active) { audio.music(0.12, { quiet: true }); }   // v8: the sim waits at tick 0 while the intro plays
    else if (this.world && this.state === 'playing') {
      if (this.softT > 0) { this.softT -= dt; if (this.softT <= 0) { for (const e of this.world.enemies()) e.tempoMult = 1; Coach.on = false; Store.data.seenTutorial = true; Store.save(); } }
      { const w = this.world, p = w.player, es = w.enemies(); let k = 0.25 + 0.35 * (p.posture / p.postureMax) + 0.15 * Math.max(0, es.length - 1); for (const e of es) { if (e.phase === 2) k += 0.3; if (e.state === 'attack' && Math.hypot(e.x - p.x, e.z - p.z) < 5) k += 0.12; } const kk = this.enc === 'practice' ? k * 0.4 : k; audio.bed(Finale.active || Victory.active ? 0 : kk); audio.music(kk, { phase2: es.some(e => e.phase === 2), quiet: Finale.active || Victory.active || Death.active }); }
      this.gatherIntent(dt);
      const p = this.world.player; if (p.lockId) { const t = this.world.byId(p.lockId); if (!t || t.dead || Math.hypot(t.x - p.x, t.z - p.z) > 24) p.lockId = null; }
      this.world.advance(dt * Cine.timeScale(dt)); alpha = this.world.acc / CONFIG.sim.dt;
      this.handleEvents(); Juice.update(this.world, this);
    }
    if (this.world) {
      for (const c of this.chars.values()) c.update(dt, alpha, secs);
      Projectiles.update(this.world, alpha, dt, secs);
      const p = this.world.player; Cam.update(dt, p, this.world.lockTarget(p), alpha); Cinema.camera(alpha);
      Tune.update();
      if (this.state === 'playing') HUD.update(dt, this.world, this.world.lockTarget(p));
      if (Settings.debug) Debug.update(this.world);
    } else { Cam.yaw += dt * 0.05; const ty = Cam.yaw * 0.6 + 2.5; camera.position.set(Math.sin(ty) * 9.5, 2.1, Math.cos(ty) * 9.5 - 2); camera.lookAt(Math.sin(ty + 2.6) * 6, 3.4, Math.cos(ty + 2.6) * 6 + 4); }   // v7: low cinematic title orbit
    FX.update(dt); updateEmbers(dt, secs); Post.update(dt);
    for (const t of torchLights) { const n = Math.sin(secs * 13 + t.seed) * 0.5 + Math.sin(secs * 23.7 + t.seed * 1.7) * 0.3 + Math.sin(secs * 41.3 + t.seed * 0.3) * 0.2, fl = (1 + n * 0.14) * VISUAL.torch;
      t.L.intensity = 2.6 * fl; t.fl.scale.set(1, 0.9 + n * 0.18, 1); if (t.halo) t.halo.material.opacity = 0.75 * fl; if (t.pool) t.pool.material.opacity = Math.min(1, 0.8 * fl); }
    for (const f of Arena.fog) if (f.visible && f.material.map) { f.material.map.offset.x += f.userData.spd * dt; f.material.map.offset.y += f.userData.spd * 0.6 * dt; }
    if (this.world) { const p = this.world.player; moon.position.set(p.x + 17, 24, p.z + 13); moon.target.position.set(p.x, 0, p.z);
      const fx = p.x - camera.position.x, fz = p.z - camera.position.z, fl = Math.hypot(fx, fz) || 1; rim.position.set(p.x + fx / fl * 12, 7, p.z + fz / fl * 12); rim.target.position.set(p.x, 1, p.z); }
    else { moon.position.set(17, 24, 13); moon.target.position.set(0, 0, 0); }
    Cinema.update(dt); v7Update(dt, secs); if (!this.skipRender) v7Render(secs);
  },
};

/* =====================================================================
   DEBUG OVERLAY + LIVE TUNING PANEL
   ===================================================================== */
const Debug = {
  notes: [], rings: new Map(), group: new THREE.Group(),
  reset() { for (const r of this.rings.values()) { this.group.remove(r); r.geometry.dispose(); r.material.dispose(); } this.rings.clear(); this.notes.length = 0; },
  note(s) { this.notes.push(s); if (this.notes.length > 5) this.notes.shift(); },
  setVisible(v) { this.group.visible = v; if (v && !this.group.parent) scene.add(this.group); if (v && !Game.selfTests) runTests(); $('dbgTools').style.display = v ? 'block' : 'none'; },
  ring(id, color) { let r = this.rings.get(id); if (!r) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(33 * 3), 3)); r = new THREE.Line(g, new THREE.LineBasicMaterial({ color })); r.frustumCulled = false; this.group.add(r); this.rings.set(id, r); } return r; },
  setRing(r, x, z, rad, a0, a1) { const p = r.geometry.attributes.position.array; for (let i = 0; i <= 32; i++) { const a = a0 + (a1 - a0) * i / 32; p[i * 3] = x + Math.sin(a) * rad; p[i * 3 + 1] = 0.05; p[i * 3 + 2] = z + Math.cos(a) * rad; } r.geometry.attributes.position.needsUpdate = true; },
  update(w) {
    const lines = [], p = w.player, P = CONFIG.parry;
    lines.push(`FPS ${Game.fps.toFixed(0)}  tick ${w.tick}  sim ${w.time.toFixed(2)}s  player hit-stop ${p.freeze}  draw calls ${renderer.info.render.calls}`);
    const st = Game.selfTests; lines.push(st ? `Self-tests: ${st.filter(t => t.pass).length}/${st.length} passed` + (st.some(t => !t.pass) ? '  FAIL: ' + st.filter(t => !t.pass).map(t => t.name).join('; ') : '') : 'Self-tests: running…');
    const fmt = f => `${f.name.padEnd(22)} ${f.state.padEnd(13)} t=${f.stateT.toFixed(2)} hp=${f.hp.toFixed(0)}/${f.maxHp} post=${f.posture.toFixed(0)}/${f.postureMax}` + (f.atk ? ` atk=${f.atk.def.key}[${atkPhase(f.atk)} ${f.atk.t.toFixed(2)}/${f.atk.su.toFixed(2)}${f.atk.jit ? ' jit ' + (f.atk.jit * 100).toFixed(0) + '%' : ''}${f.atk.hold ? ' hold ' + f.atk.hold.toFixed(2) : ''}]` : '');
    lines.push(fmt(p)); const ld = p.lastDefense;
    lines.push(`  last defense: ${ld ? ld.result + (ld.quality ? ' [' + ld.quality + ']' : '') + ' (' + ld.key + ')  ' + (ld.offset !== undefined && Math.abs(ld.offset) < 5 ? 'pressed ' + Math.abs(ld.offset * 1000).toFixed(0) + 'ms ' + (ld.offset <= 0 ? 'before' : 'after') + ' strike' : '') : '—'}   window ${(p.guardWin * 1000).toFixed(0)}ms${CONFIG.parry.accessibility ? ' (large)' : ''}  deflects ${p.stats.deflects} (late ${p.stats.lateDeflects})`);
    let incoming = null;
    for (const e of w.enemies()) { lines.push(fmt(e)); if (e.brain) lines.push(`  AI: ${e.brain.state} [${e.brain.mode}] — ${e.brain.reason}  string ${e.comboCount}${e.comboQueue.length ? '+' + e.comboQueue.length : ''} token=${w.token === e.id} wd=${e.brain.watchdogResets}`);
      if (e.atk && atkPhase(e.atk) === 'startup' && !e.atk.def.feintAt) incoming = e; }
    const H = w.habits; lines.push(`Habits(14s): early=${H.count('parry_early', w.time)} guard=${H.count('parry', w.time)} light=${H.count('light', w.time)} heavy=${H.count('heavy', w.time)} dodge=${H.count('dodge', w.time)} retreat=${H.count('retreat', w.time)}`);
    let bar = '';
    if (incoming) { const a = incoming.atk, tti = a.su - a.t, win = parryWindowNow() * a.def.parryMod;
      lines.push(`Incoming ${a.def.key} (${a.def.type}) strike in ${(tti * 1000).toFixed(0)}ms  ${tti <= win && tti >= -P.lateGrace ? '>>> DEFLECT NOW <<<' : ''}`);
      const span = 1.0, zx = (1 - win / span) * 100, zw = (win + P.lateGrace) / span * 100, mx = clamp(1 - tti / span, 0, 1.1) * 100;
      bar = `<div id="pbar"><span style="left:${zx}%;width:${zw}%;background:#2f8f3a"></span><span style="left:${100}%;width:1px;background:#ff0"></span><span style="left:${Math.min(100, mx)}%;width:2px;background:#fff"></span></div>`; }
    lines.push(...this.notes.map(n => '· ' + n));
    $('dbgText').innerHTML = lines.join('\n').replace(/&/g, '&amp;').replace(/</g, '&lt;') + bar;
    for (const f of w.fighters) { const r = this.ring('b' + f.id, f.isPlayer ? 0x4fc3f7 : 0xffeb3b); this.setRing(r, f.x, f.z, f.radius, 0, Math.PI * 2); r.visible = !f.dead;
      const a = this.ring('a' + f.id, 0xff3b30); if (f.atk && !f.dead) { const d = f.atk.def, h = d.arc * Math.PI / 360; this.setRing(a, f.x, f.z, d.range, f.facing - h, f.facing + h); a.material.color.setHex(atkPhase(f.atk) === 'active' ? 0xff1a1a : 0x884444); a.visible = true; } else a.visible = false;
      if (f.isPlayer) { const g = this.ring('g' + f.id, 0x66ff88), hh = P.deflectArc * Math.PI / 360; this.setRing(g, f.x, f.z, 1.1, f.facing - hh, f.facing + hh); g.visible = true; } }
  },
};
const parryWindowNow = () => CORE.parryWindow();
function runTests() { setTimeout(() => { try { Game.selfTests = CORE.runSelfTests(); const n = Game.selfTests.filter(t => t.pass).length; console.log('[Veynhold] self-tests ' + n + '/' + Game.selfTests.length); } catch (e) { Game.selfTests = [{ name: 'self-tests crashed: ' + e.message, pass: false }]; } }, 30); }

/* live tuning: every slider writes straight into CONFIG (the sim reads CONFIG every tick) */
const Tune = {
  defs: [
    ['Deflect window (s)', 'parry.window', 0.08, 0.35, 0.01], ['Late grace (s)', 'parry.lateGrace', 0, 0.12, 0.005], ['Guard buffer (s)', 'parry.guardBuffer', 0, 0.3, 0.01],
    ['Ground accel', 'player.accel', 8, 70, 1], ['Ground decel', 'player.decel', 8, 80, 1], ['Turn rate (slow)', 'player.turnRateSlow', 6, 30, 0.5],
    ['Dodge distance', 'dodge.dist', 1.5, 5, 0.1], ['Camera follow (s)', 'camera.followTime', 0.02, 0.3, 0.01], ['Lock-on turn (s)', 'camera.lockYawTime', 0.05, 0.5, 0.01],
    ['Hit-stop scale', 'parry.hitStopScale', 0, 2, 0.05], ['Shake amount', 'camera.trauma', 0, 2, 0.05], ['FOV kick', 'camera.fovKick', 0, 12, 0.5],
    ['Enemy timing jitter', 'ai.jitterScale', 0, 2, 0.05], ['Enemy branch chance', 'ai.branchChance', 0, 1, 0.05],
    ['— Visuals: impulse strength', 'visual.impulse', 0, 2.5, 0.05], ['Breathing / sway', 'visual.breath', 0, 2.5, 0.05], ['Cloth stiffness', 'visual.clothStiff', 0.3, 1, 0.02], ['Cloth drag', 'visual.clothDrag', 0, 0.3, 0.01],
    ['Cinematic slow-mo (1 = off)', 'visual.slowmo', 0.15, 1, 0.01], ['Screen-edge pulses', 'visual.vignette', 0, 2, 0.05], ['Camera combat framing', 'visual.combatFrame', 0, 2, 0.05],
    ['Trail brightness', 'visual.trail', 0, 2, 0.05], ['Torch light', 'visual.torch', 0, 2, 0.05], ['Lock-on camera angle', 'visual.lockAngle', -0.5, 0.5, 0.01],
    ['Skinned models (0 = block rig)', 'visual.models', 0, 1, 1], ['Hit flash', 'visual.flash', 0, 2, 0.05], ['String-end cue (0/1)', 'visual.stringCue', 0, 1, 1], ['Delayed-strike glint (0/1)', 'visual.glint', 0, 1, 1],
    ['— v7 look: exposure', 'visual.exposure', 0.4, 2.2, 0.05], ['Bloom (Med/High)', 'visual.bloom', 0, 2.5, 0.05], ['Bloom threshold', 'visual.bloomThreshold', 0.3, 0.98, 0.01],
    ['Vignette (post)', 'visual.postVignette', 0, 1.5, 0.05], ['Film grain', 'visual.grain', 0, 0.15, 0.005], ['Colour grade', 'visual.grade', 0, 1, 0.05], ['Rim light', 'visual.rim', 0, 3, 0.05],
    ['Screen punch', 'visual.punch', 0, 2, 0.05], ['Screen flash', 'visual.flashFx', 0, 2, 0.05], ['Sword edge flash', 'visual.edgeFlash', 0, 2, 0.05], ['Wind (banners, ash)', 'visual.wind', 0, 3, 0.05],
    ['Ink / blood size', 'visual.inkSize', 0.3, 2, 0.05], ['Deathblow letterbox (0/1)', 'visual.letterbox', 0, 1, 1], ['Deathblow camera orbit', 'visual.cineOrbit', 0, 2.5, 0.05],
    ['Ambient fill', 'visual.ambient', 0.3, 2, 0.05], ['Moonlight', 'visual.moonLight', 0, 2.5, 0.05], ['Fog density', 'visual.fogDensity', 0, 0.08, 0.002],
    ['Perfect window (s)', 'parry.perfectWindow', 0.01, 0.1, 0.005], ['Light chain length', 'combo.lightChain', 2, 4, 1], ['Riposte window (s)', 'combo.riposteWindow', 0, 1.2, 0.05], ['Phase II block chip', '__chip', 0, 0.5, 0.01] ],
  defaults: {}, built: false,
  root(path) { return path.startsWith('visual.') ? { visual: VISUAL } : path === '__chip' ? { __chip: null } : CONFIG; },
  get(path) { if (path === '__chip') return CORE.PROFILES.king.phase2.blockChip; return path.split('.').reduce((o, k) => o[k], this.root(path)); },
  set(path, v) { if (path === '__chip') { CORE.PROFILES.king.phase2.blockChip = v; return; } const ks = path.split('.'), last = ks.pop(); ks.reduce((o, k) => o[k], this.root(path))[last] = v; },
  build() { const el = $('tuneRows'); let html = '';
    this.defs.forEach(([label, path, mn, mx, st], i) => { this.defaults[path] = this.get(path); html += `<label>${label}<input type="range" data-i="${i}" min="${mn}" max="${mx}" step="${st}" value="${this.get(path)}"><b id="tv${i}">${this.get(path)}</b></label>`; });
    el.innerHTML = html; el.querySelectorAll('input').forEach(inp => inp.addEventListener('input', () => { const d = this.defs[+inp.dataset.i]; this.set(d[1], parseFloat(inp.value)); $('tv' + inp.dataset.i).textContent = inp.value; }));
    $('tuneReset').onclick = () => { for (const p in this.defaults) this.set(p, this.defaults[p]); this.sync(); };
    $('tuneLarge').onchange = e => setAccessibility(e.target.checked); this.built = true; },
  sync() { this.defs.forEach(([, path], i) => { const inp = document.querySelector(`#tuneRows input[data-i="${i}"]`); if (inp) { inp.value = this.get(path); $('tv' + i).textContent = this.get(path); } }); $('tuneLarge').checked = CONFIG.parry.accessibility; },
  toggle() { if (!this.built) this.build(); const el = $('tune'); const show = el.style.display !== 'block'; el.style.display = show ? 'block' : 'none'; if (show) this.sync(); },
  update() {},
};
function setAccessibility(on, noSave) { CONFIG.parry.accessibility = on; if (!noSave) Store.save(); $('accBtn').textContent = 'Large deflect window: ' + (on ? 'On' : 'Off'); if ($('tuneLarge')) $('tuneLarge').checked = on; }

/* =====================================================================
   BOOT
   ===================================================================== */
function bindUI() {
  document.querySelectorAll('[data-enc]').forEach(b => b.addEventListener('click', () => { audio.ensure(); audio.play('ui'); Game.start(b.dataset.enc); }));
  const q = () => { Settings.quality = { high: 'medium', medium: 'low', low: 'high' }[Settings.quality] || 'high'; applyQuality(); onResize(); Store.save(); };
  $('qualBtn').onclick = q; $('qualBtn2').onclick = q;
  const vol = e => { audio.ensure(); audio.setVolume(e.target.value / 100); $('vol').value = $('vol2').value = e.target.value; Store.save(); };
  $('vol').value = $('vol2').value = Math.round(Settings.volume * 100);
  $('mirrorChk').checked = !!Settings.mirror; $('mirrorChk').onchange = e => { Settings.mirror = e.target.checked; Store.save(); Game.refreshBest(); };
  $('practiceBtn').onclick = $('practiceBtn2').onclick = () => Game.practiceThis();
  $('vol').oninput = vol; $('vol2').oninput = vol;
  $('tutBtn').onclick = () => Game.openTut(); $('tutBtn2').onclick = () => Game.openTut(); $('tutClose').onclick = () => Game.closeTut();
  $('resumeBtn').onclick = () => Game.resume(); $('restartBtn').onclick = () => Game.restart(); $('retryBtn').onclick = () => Game.restart(); $('againBtn').onclick = () => Game.restart();
  $('quitBtn').onclick = $('quitBtn2').onclick = $('quitBtn3').onclick = () => Game.quit(); $('nextBtn').onclick = () => Game.next();
  $('dbgBtn').onclick = () => Game.toggleDebug(); $('tuneBtn').onclick = () => Tune.toggle(); $('tuneBtn2').onclick = () => Tune.toggle(); $('tuneClose').onclick = () => Tune.toggle();
  $('accBtn').onclick = () => setAccessibility(!CONFIG.parry.accessibility);
  const hitLbl = () => { for (const b of ['hitBtn', 'hitBtn2']) if ($(b)) $(b).textContent = 'Hits: ' + (Settings.hitStyle === 'blood' ? 'Blood' : 'Ink (stylized)'); };   // v7
  const hit = () => { Settings.hitStyle = Settings.hitStyle === 'blood' ? 'ink' : 'blood'; hitLbl(); Store.save(); }; if ($('hitBtn')) $('hitBtn').onclick = hit; if ($('hitBtn2')) $('hitBtn2').onclick = hit; hitLbl();
  const introLbl = () => { for (const b of ['introBtn', 'introBtn2']) if ($(b)) $(b).textContent = 'Boss intros: ' + (Settings.intros !== false ? 'On' : 'Off'); };   // v8
  const intro = () => { Settings.intros = Settings.intros === false; introLbl(); Store.save(); }; for (const b of ['introBtn', 'introBtn2']) if ($(b)) $(b).onclick = intro; introLbl();
}
v7BuildEnv(); Sky.build(); buildArena(); TorchEmbers.build(); FX.init(); VFX.init(); Ash.build(); FogBank.build(); PostFX.init(); initEmbers(); Input.init(); bindUI(); applyQuality(); onResize(); setAccessibility(CONFIG.parry.accessibility, true); Game.refreshBest();
document.addEventListener('visibilitychange', () => audio.mute(document.hidden));
if (window.VEYN_MODELS && (!HEADLESS || window.__VEYN_TEX_STUB)) { if (HEADLESS) window.__VEYN_TEX_STUB(THREE); VEYN_MODELS.load(ok => { const st = VEYN_MODELS.status(); console.log('[Veynhold] models ' + st.ready + '/' + st.total + (st.failed ? ' (' + st.failed + ')' : '')); }); }
runTests();
function loop(now) { try { Game.frame(now); } catch (e) { console.error(e); if (!Game.crashed) { Game.crashed = true; Debug.note('frame error: ' + e.message); } } requestAnimationFrame(loop); }
requestAnimationFrame(loop);
window.VEYN_GAME = { V8: { Intro, Finale, Victory, Death, Cinema, CamFX, Fade, TitleCard, LUT, TorchEmbers, INTRO_TRACKS, FINALE_CAMS }, Intro, renderer, V7: { Sky, Ash, FogBank, Atmos, PostFX, VFX, Letterbox, NameCard, V7Mats, V7U, v7ApplyTier }, TIERS_V6: TIERS, Store, Coach, Pad, Perf, gradeOf, shadeOf, panOf, Projectiles, STANCES, TRACKS, famFor, Game, Cam, Input, Settings, FX, POSES, FAMILY, Character, scene, camera, Tune, VISUAL, Cine, Post, Juice, Arena, TIERS, applyQuality };
})();
