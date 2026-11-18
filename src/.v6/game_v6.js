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
const Settings = { quality: 'medium', volume: 0.7, debug: false, hints: true, sens: 0.0032, mirror: false, padSens: 2.6 };
/* v6: persistence — localStorage key veynhold_v6 (fails soft when storage is blocked) */
const Store = {
  KEY: 'veynhold_v6', data: { best: {}, seenTutorial: false },
  load() { try { const raw = window.localStorage && localStorage.getItem(this.KEY); if (!raw) return; const d = JSON.parse(raw); this.data = Object.assign(this.data, d); if (!this.data.best) this.data.best = {};
      for (const k of ['quality', 'volume', 'hints', 'sens', 'mirror']) if (d[k] !== undefined) Settings[k] = d[k];
      if (d.accessibility !== undefined) CONFIG.parry.accessibility = !!d.accessibility; } catch (e) {} },
  save() { try { if (!window.localStorage) return; const d = Object.assign({}, this.data, { quality: Settings.quality, volume: Settings.volume, accessibility: !!CONFIG.parry.accessibility, hints: Settings.hints, sens: Settings.sens, mirror: Settings.mirror });
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
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0d12);
scene.fog = new THREE.FogExp2(0x0b0d12, 0.032);
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
}
const Arena = { debris: null, fog: [], pools: [] };
function onResize() { const w = window.innerWidth || 1280, h = window.innerHeight || 720; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }

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
  const R = CONFIG.arena.radius; const statics = []; const sceneAdd = scene.add.bind(scene); const add = m => { if (m.isMesh && !m.userData.keep) statics.push(m); else sceneAdd(m); };
  const floorTex = stoneTex(7, '#3a3733');
  const floor = new THREE.Mesh(new THREE.CircleGeometry(R + 4, 48), M({ color: 0x8a847a, map: floorTex, bumpMap: floorTex, bumpScale: 0.035, roughness: 0.95 }));
  if (floorTex) floorTex.repeat.set(9, 9);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; sceneAdd(floor);
  const outer = new THREE.Mesh(new THREE.RingGeometry(R + 3.5, 70, 32), M({ color: 0x15130f, roughness: 1 })); outer.rotation.x = -Math.PI / 2; outer.position.y = -0.02; sceneAdd(outer);
  const wallTex = stoneTex(19, '#34312d'); const wallMat = M({ color: 0x8c867b, map: wallTex, bumpMap: wallTex, bumpScale: 0.05, roughness: 0.92 });
  // ring wall made of ruined segments of varying height
  const segs = 30; let rs = 3;
  const rnd = () => (rs = (rs * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < segs; i++) {
    const a = i / segs * Math.PI * 2; const h = 1.2 + rnd() * 3.8 * (i % 7 === 0 ? 0.25 : 1); const wseg = (2 * Math.PI * (R + 1.6)) / segs + 0.05;
    const box = new THREE.Mesh(new THREE.BoxGeometry(wseg, h, 1.1), wallMat); box.position.set(Math.sin(a) * (R + 1.6), h / 2, Math.cos(a) * (R + 1.6)); box.rotation.y = a;
    box.castShadow = false; box.receiveShadow = true; add(box);
    if (rnd() < 0.35) { const rb = new THREE.Mesh(new THREE.BoxGeometry(0.7 + rnd(), 0.4 + rnd() * 0.5, 0.6 + rnd()), wallMat); rb.position.set(Math.sin(a + 0.05) * (R + 0.6), 0.25, Math.cos(a + 0.05) * (R + 0.6)); rb.rotation.set(rnd(), rnd() * 3, rnd() * 0.4); add(rb); }
  }
  // pillars (match core collision circles)
  const pilTex = stoneTex(31, '#3c3833'); const pilMat = M({ color: 0x9a9386, map: pilTex, bumpMap: pilTex, bumpScale: 0.05, roughness: 0.9 });
  CONFIG.arena.pillars.forEach((p, i) => {
    const h = 2.5 + ((i * 37) % 5) * 0.9; const col = new THREE.Mesh(new THREE.CylinderGeometry(p.r * 0.85, p.r, h, 10), pilMat);
    col.position.set(p.x, h / 2, p.z); col.castShadow = true; col.receiveShadow = true; add(col);
    const base = new THREE.Mesh(new THREE.BoxGeometry(p.r * 2.4, 0.4, p.r * 2.4), pilMat); base.position.set(p.x, 0.2, p.z); add(base);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(p.r * 0.95, p.r * 0.7, 0.5, 7), pilMat); cap.position.set(p.x + 0.1, h + 0.1, p.z); cap.rotation.set(0.25, 0, 0.2); add(cap);
  });
  // distant ruined keep silhouettes
  const farMat = M({ color: 0x14161c, roughness: 1 });
  [[-8, -38, 6, 26], [10, -42, 8, 34], [26, -30, 5, 18], [-30, -22, 6, 20], [34, 8, 7, 16], [-36, 14, 5, 22], [4, 40, 10, 14]].forEach(([x, z, w, h]) => {
    const t = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), farMat); t.position.set(x, h / 2 - 1, z); add(t);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.75, h * 0.35, 4), farMat); roof.position.set(x, h - 1 + h * 0.17, z); roof.rotation.y = Math.PI / 4; add(roof); });
  const moonDisc = new THREE.Mesh(new THREE.CircleGeometry(3.2, 24), new THREE.MeshBasicMaterial({ color: 0xcfd8ea, fog: false })); arenaMats.push(moonDisc.material);
  moonDisc.position.set(-30, 40, -60); moonDisc.lookAt(0, 0, 0); sceneAdd(moonDisc);
  // torches
  const postMat = M({ color: 0x2a2018, roughness: 1 }); const flameMat = new THREE.MeshBasicMaterial({ color: 0xffa040 }); arenaMats.push(flameMat);
  const glow = glowTex(); const poolMat = new THREE.MeshBasicMaterial({ map: glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }); arenaMats.push(poolMat);
  [[R - 0.6, 0.6], [-R + 0.6, -1.4], [3, R - 0.6], [-2, -R + 0.6]].forEach(([x, z], i) => { const ang = Math.atan2(x, z); const px = Math.sin(ang) * (R - 0.4), pz = Math.cos(ang) * (R - 0.4);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.3, 6), postMat); post.position.set(px, 1.15, pz); add(post);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.12, 0.2, 8), postMat); bowl.position.set(px, 2.35, pz); add(bowl);
    const fl = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 6), flameMat); fl.position.set(px, 2.7, pz); sceneAdd(fl);
    const L = new THREE.PointLight(0xff8a3a, 1.8, 18, 2); L.position.set(px, 2.9, pz); sceneAdd(L);
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), poolMat); pool.rotation.x = -Math.PI / 2; pool.position.set(px * 0.93, 0.03, pz * 0.93); sceneAdd(pool); Arena.pools.push(pool);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); arenaMats.push(halo.material); halo.scale.set(1.6, 1.6, 1); halo.position.set(px, 2.75, pz); sceneAdd(halo);
    torchLights.push({ L, fl, halo, pool, seed: i * 10 }); });
  // decals: blood, moss, scorch (merged into few draw calls)
  const decal = (tex, n, minR, maxR, size, seed) => { const m = M({ map: tex, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }); let ss = seed;
    const rr = () => (ss = (ss * 16807) % 2147483647) / 2147483647; for (let i = 0; i < n; i++) { const a = rr() * Math.PI * 2, d = minR + rr() * (maxR - minR), sz = size * (0.6 + rr() * 0.8);
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(sz, sz), m); pl.rotation.set(-Math.PI / 2, 0, rr() * 6.28); pl.position.set(Math.sin(a) * d, 0.012 + i * 0.0004, Math.cos(a) * d); add(pl); } };
  decal(blotchTex(3, '70,8,6', 9, false), 9, 2, 12, 1.6, 11); decal(blotchTex(8, '45,70,30', 14, true), 14, R - 3, R, 3.2, 23); decal(blotchTex(13, '8,7,6', 8, true), 6, 4, 13, 3, 41);
  // tattered banners on the wall
  const banTex = canvasTex(64, 128, (g, w, h) => { g.fillStyle = '#5a0c10'; g.fillRect(0, 0, w, h); g.fillStyle = '#8e1b1f'; g.fillRect(6, 10, w - 12, 6); g.fillStyle = '#c9a75a'; g.beginPath(); g.arc(w / 2, 48, 12, 0, 7); g.fill(); g.globalCompositeOperation = 'destination-out'; let s = 4; const r = () => (s = (s * 16807) % 2147483647) / 2147483647; for (let x = 0; x < w; x += 4) { g.fillRect(x, h - 10 - r() * 34, 4, 60); } for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(r() * w, 30 + r() * 70, 2 + r() * 5, 0, 7); g.fill(); } });
  const banMat = M({ map: banTex, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1 });
  [0.4, 1.9, 3.5, 5.0].forEach(a => { const b = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.4), banMat); b.position.set(Math.sin(a) * (R + 0.98), 2.6, Math.cos(a) * (R + 0.98)); b.rotation.y = a + Math.PI; add(b); });
  // broken column chunks + fallen arch stones
  [[4.5, 12.5], [-12, -8], [11, -9.5]].forEach(([x, z], i) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.75, 1.6, 10), pilMat); c.position.set(x * 1.12, 0.7, z * 1.12); c.rotation.set(Math.PI / 2, 0, i * 1.3); add(c); });
  // distant spires for a richer skyline
  [[-20, -46, 2.5, 30], [18, -50, 3, 40], [40, -14, 2.5, 26], [-44, 0, 3, 28]].forEach(([x, z, w, h]) => { const t = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.6, w, h, 6), farMat); t.position.set(x, h / 2 - 1, z); add(t);
    const sp = new THREE.Mesh(new THREE.ConeGeometry(w * 0.8, h * 0.5, 6), farMat); sp.position.set(x, h - 1 + h * 0.25, z); add(sp); });
  // instanced debris (count scales with quality tier)
  { const g = new THREE.DodecahedronGeometry(0.16, 0); const im = new THREE.InstancedMesh(g, wallMat, 90); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3(); let ds = 77;
    const rr = () => (ds = (ds * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 90; i++) { let x, z; if (i % 3 === 0) { const p = CONFIG.arena.pillars[i % CONFIG.arena.pillars.length], a = rr() * 6.28; x = p.x + Math.sin(a) * (p.r + 0.3 + rr()); z = p.z + Math.cos(a) * (p.r + 0.3 + rr()); } else { const a = rr() * 6.28, d = R - 0.4 - rr() * 3.2; x = Math.sin(a) * d; z = Math.cos(a) * d; }
      const k = 0.4 + rr() * 1.6; e.set(rr() * 3, rr() * 3, rr() * 3); q.setFromEuler(e); v.set(x, 0.06 * k, z); sc.set(k, k * (0.5 + rr() * 0.5), k); m4.compose(v, q, sc); im.setMatrixAt(i, m4); }
    im.receiveShadow = true; im.castShadow = false; sceneAdd(im); Arena.debris = im; }
  // drifting ground mist (high tier)
  { const ft = fogTex(); for (let i = 0; i < 3; i++) { const m = new THREE.MeshBasicMaterial({ map: ft, transparent: true, depthWrite: false, opacity: 0.55, fog: true }); arenaMats.push(m); const f = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), m);
      f.rotation.x = -Math.PI / 2; f.position.y = 0.25 + i * 0.35; f.userData.spd = 0.004 + i * 0.003; sceneAdd(f); Arena.fog.push(f); } }
  mergeStatics(statics);
}

/* =====================================================================
   PRESENTATION v3 — quality tiers, cloth, impulses, post pulses, cinematics.
   Reads core state / events only; never writes back into the simulation.
   ===================================================================== */
const VISUAL = {
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
  models: 1,            // 1 = skinned GLB characters, 0 = original block rig
  flash: 1,             // hit-flash strength on the skinned models
  stringCue: 1,         // last swing of an enemy string gets a low drum + brighter trail (0 = off)
  glint: 1,             // delayed strikes glint just before release (0 = off)
};
const TIERS = {
  high:   { label: 'High',   pr: 1.25, shadows: true,  shadowMap: 2048, torches: 4, cloth: true,  clothIters: 4, debris: 90, fog: true,  embers: true,  particles: 1 },
  medium: { label: 'Medium', pr: 1.0,  shadows: true,  shadowMap: 1024, torches: 2, cloth: true,  clothIters: 2, debris: 50, fog: false, embers: true,  particles: 0.75 },
  low:    { label: 'Low',    pr: 0.75, shadows: false, shadowMap: 512,  torches: 0, cloth: false, clothIters: 1, debris: 20, fog: false, embers: false, particles: 0.5 },
};
const tier = () => TIERS[Settings.quality] || TIERS.high;

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
    this.mesh = new THREE.Mesh(g, o.material); this.mesh.frustumCulled = false; this.mesh.castShadow = true; scene.add(this.mesh);
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
  slow(dur, scale) { if (VISUAL.slowmo >= 0.999) return; this.t = 0; this.dur = dur; this.scale = Math.max(scale, VISUAL.slowmo); },
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
        if (D.f.isPlayer) { Post.pulse('140,10,8', 0.32 * k); if (k >= 1.6) Cam.kickFov(2); } break; }
      case 'block': case 'guardbreak': { if (D) { D.impulse({ rE: 6, rSx: 4, lE: 4, lean: -3.5, hipY: -0.8, headX: -2 }, e.heavy ? 1.5 : 1); away(A, D, 0.03); if (D.f.isPlayer) Post.pulse('255,190,110', e.heavy ? 0.2 : 0.1); }
        if (A) A.impulse({ wX: -5, rSx: -3, lean: -1.5 }); break; }
      case 'deflect': { if (D) { D.impulse({ wX: -8, wZ: 4, twist: -4, rE: -3, lean: 1.5 }); if (D.f.isPlayer) Post.pulse('255,225,160', e.heavy ? 0.3 : 0.2); }
        if (A) { A.impulse({ rSx: -9, wX: -9, lean: -4, twist: 5, headX: -2 }, e.heavy ? 1.3 : 1); away(D, A, 0.02); } break; }
      case 'mikiri': { if (A) { A.impulse({ lean: -7, headX: -6, hipY: -1.2, rSx: -6 }); away(D, A, 0.06); } if (D) D.impulse({ lean: 4, hipY: -1.5 });
        Post.pulse('255,220,140', 0.4); Cine.slow(0.3, 0.45); break; }
      case 'jumpKick': { if (D) { D.impulse({ lean: -8, headX: -7, hipY: -1, twist: 3 }); away(A, D, 0.08); } Post.pulse('255,207,106', 0.25); break; }
      case 'postureBreak': { const c = G.chars.get(e.f); if (c) { c.impulse({ lean: -6, hipY: -1.6, headX: -5, rSx: 4, lSx: 4 }); c.clothKick(0, 0.03, 0); }
        const f = w.byId(e.f); if (f && f.isPlayer) Post.pulse('160,20,10', 0.55); else { Post.pulse('255,200,90', 0.35); Cine.slow(0.35, 0.5); } break; }
      case 'deathblow': { Cine.slow(1.0, VISUAL.slowmo); Cine.focus(e.d, 1.7); Post.pulse('255,245,230', 0.45); this.pending.push({ at: w.time + 0.45, id: e.d, a: e.a }); break; }
      case 'phase2': { Cine.focus(e.f, 2.2); Post.pulse('180,10,10', 0.6); const c = G.chars.get(e.f); if (c) { FX.flash(c.root.position.clone().setY(1.6), 0xff2a1a, 9); c.clothKick(0, 0.05, 0); } break; }
      case 'dodge': { const c = G.chars.get(e.f); if (c && c.f) c.clothKick(-c.f.dodgeDx * 0.06, 0.01, -c.f.dodgeDz * 0.06); break; }
      case 'jump': { const c = G.chars.get(e.f); if (c) c.clothKick(0, -0.04, 0); break; }
    }
  },
  update(w, G) {   // deathblow payoff lands on the sim's own timeline (respects slow-mo and hit-stop)
    for (let i = this.pending.length - 1; i >= 0; i--) { const p = this.pending[i]; if (w.time < p.at) continue; this.pending.splice(i, 1); const c = G.chars.get(p.id); if (!c) continue;
      const pos = c.root.position.clone().setY(1.2); FX.spark(pos, 46, 1.5, [1, 0.25, 0.15]); FX.flecks(pos, 24); FX.ring(pos, 0xff3020, 11, 0.55); FX.flash(pos, 0xff4030, 8); FX.kick(0.22); Cam.kickFov(-4);
      Post.pulse('120,0,0', 0.7); c.impulse({ lean: 7, headX: 6, hipY: -2 }); const a = G.chars.get(p.a); if (a) a.impulse({ lean: 3, rSx: 4, wX: 5 }); c.clothKick(0, 0.06, 0); }
  },
  clear() { this.pending.length = 0; },
};

/* =====================================================================
   CHARACTER — procedural rig + pose library
   ===================================================================== */
const LOOKS = {
  player:  { scale: 1.0, cloth: 0x252a33, armor: 0x5b5f66, trim: 0x8b1a1a, skin: 0xb08a72, helm: 'hood', blade: 0.98, bladeW: 0.045, cape: 0x1d2027, scarf: 0x8b1a1a },
  duelist: { scale: 1.0, cloth: 0x4a3626, armor: 0x7c7f84, trim: 0x6b5233, skin: 0xa07a62, helm: 'kettle', blade: 1.0, bladeW: 0.05 },
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
    this.oldTip = this.tip; this.oldBase = this.bladeBase; this.oldBladeMat = this.bladeMat; this.syncModel();
  }
  /* swap between the skinned GLB model and the original block rig (both driven by the same pose rig) */
  syncModel() {
    const want = VISUAL.models >= 0.5 && !!window.VEYN_MODELS && VEYN_MODELS.has(this.lookKey);
    if (want === !!this.model) return;
    if (want) {
      let m; try { m = new VEYN_MODELS.Model(this.lookKey, { rig: this.rig, hips: this.hips, torso: this.torso, head: this.head, lSh: this.lSh, lEl: this.lEl, lHand: this.lHand, rSh: this.rSh, rEl: this.rEl, rHand: this.rHand, wrist: this.wrist, lLeg: this.lLeg, lKnee: this.lKnee, rLeg: this.rLeg, rKnee: this.rKnee }, { scale: this.look.scale, hideCape: !!this.look.cape, hideScarf: !!this.look.scarf }); }
      catch (e) { console.warn('[Veynhold] model attach failed', e); VISUAL.models = 0; return; }
      this.hidden = []; const capeRoot = this.cape; const keep = o => { for (let q = o; q; q = q.parent) if (q === capeRoot || q === m.root) return true; return false; };
      this.rig.traverse(o => { if (o.isMesh && o.visible && !keep(o)) { o.visible = false; this.hidden.push(o); } });
      this.model = m; m.update(); this.tip = m.tip; this.bladeBase = m.base; this.bladeMat = (m.bladeMats || []).find(x => x.name === 'Blade') || this.oldBladeMat;
    } else {
      this.model.dispose(); this.model = null; (this.hidden || []).forEach(o => o.visible = true); this.hidden = [];
      this.tip = this.oldTip; this.bladeBase = this.oldBase; this.bladeMat = this.oldBladeMat;
    }
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
    // torso
    const torso = new THREE.Group(); torso.position.y = 0.08; hips.add(torso); this.torso = torso;
    this.mesh(new THREE.BoxGeometry(0.42 * bulk, 0.5, 0.25 * bulk), L.bulky || L.helm === 'crown' ? armor : cloth, torso, 0, 0.3, 0);
    this.mesh(new THREE.BoxGeometry(0.46 * bulk, 0.22, 0.28 * bulk), armor, torso, 0, 0.45, 0); // breastplate / pauldron band
    if (L.trim) this.mesh(new THREE.BoxGeometry(0.2, 0.42, 0.02), trim, torso, 0, 0.18, 0.14 * bulk);
    if (L.bulky) { this.mesh(new THREE.SphereGeometry(0.16, 8, 6), armor, torso, 0.3 * bulk, 0.52, 0); this.mesh(new THREE.SphereGeometry(0.16, 8, 6), armor, torso, -0.3 * bulk, 0.52, 0); }
    if (L.helm === 'crown') { this.mesh(new THREE.BoxGeometry(0.34, 0.6, 0.02), trim, torso, 0, 0.0, 0.15); this.mesh(new THREE.SphereGeometry(0.12, 8, 6), armor, torso, 0.27, 0.55, 0); this.mesh(new THREE.SphereGeometry(0.12, 8, 6), armor, torso, -0.27, 0.55, 0); }
    if (L.scarf) this.mesh(new THREE.TorusGeometry(0.12, 0.05, 6, 10), this.mat(L.scarf, { roughness: 0.9 }), torso, 0, 0.6, 0).rotation.x = Math.PI / 2;
    // cape
    if (L.cape) { const cg = new THREE.PlaneGeometry(0.5 * bulk, 0.95, 1, 4); this.geos.push(cg); const cm = this.mat(L.cape, { side: THREE.DoubleSide, roughness: 1 });
      const cape = new THREE.Mesh(cg, cm); cape.position.set(0, 0.12, -0.16 * bulk); cape.castShadow = true; const pivot = new THREE.Group(); pivot.position.set(0, 0.58, 0); torso.add(pivot); cape.position.y = -0.47; pivot.add(cape); this.cape = pivot;
      const cw = 0.5 * bulk, an = []; for (let c = 0; c < 4; c++) an.push([-cw / 2 + cw * c / 3, 0.58, -0.17 * bulk]);
      this.clothCape = new ClothStrip({ cols: 4, rows: 7, width: cw * L.scale, length: 0.95 * L.scale, anchor: torso, anchors: an, material: cm, push: 0.16 * bulk * L.scale }); }
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
    const sg = new THREE.CircleGeometry(0.5 * s * bulk, 12); this.geos.push(sg); const sm = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }); this.mats.push(sm);
    this.blob = new THREE.Mesh(sg, sm); this.blob.rotation.x = -Math.PI / 2; this.blob.position.y = 0.01; R.add(this.blob);
  }

  /* physical impulses on an additive spring layer (works on top of direct attack poses too) */
  impulse(o, k) { k = (k === undefined ? 1 : k) * VISUAL.impulse; for (const key in o) this.offV[key] += o[key] * k; }
  clothKick(x, y, z) { if (this.clothCape) this.clothCape.kick(x, y, z); if (this.clothScarf) this.clothScarf.kick(x * 1.3, y, z * 1.3); }
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
    const vx = f.pvx + (f.vx - f.pvx) * alpha, vz = f.pvz + (f.vz - f.pvz) * alpha;
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
    if (amp > 0.01) {
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
    this.root.position.set(x, y, z); this.root.rotation.y = this.visFacing + p.yaw + this.off.yaw;
    this.blob.position.y = 0.01 - y; this.blob.scale.setScalar(1 - y * 0.4);
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
    // ---- trail
    this.root.updateMatrixWorld(true); this.tip.getWorldPosition(this.tipW); this.bladeBase.getWorldPosition(this.baseW);
    let on = false; if (f.state === 'attack' && f.atk && !f.atk.def.feintAt) { const a = f.atk, vt = visT(f, a.t, alpha, dt); on = vt > a.su - 0.05 && vt < a.su + a.ac + 0.07; }
    if (on && f.atk.id !== this.trailKey) { this.trailKey = f.atk.id; const d = f.atk.def; this.trail.color.setHex(d.danger ? 0xff5a2a : (this.look.crimson && f.phase === 2) ? 0xff2a24 : f.isPlayer ? 0xdfe8ff : 0xfff1d6); this.trail.boost = d.finisher ? 1.6 : d.heavy ? 1.35 : f.atk.last && VISUAL.stringCue ? 1.25 : 1; if (d.finisher) this.trail.color.setHex(0xffe6b0); }
    this.trail.push(this.baseW, this.tipW, on);
    if (this.glintNow) { this.glintNow = false; FX.spark(this.tipW, 6, 0.35, [1, 1, 1]); FX.ring(this.tipW, 0xffffff, 2.2, 0.16); audio.play('glint'); }
    // cloth
    const useCloth = tier().cloth; if (this.cape) this.cape.visible = !(useCloth && this.clothCape);
    for (const cs of [this.clothCape, this.clothScarf]) { if (!cs) continue; if (cs.mesh.visible !== useCloth) cs.setVisible(useCloth); if (useCloth) { this.hips.getWorldPosition(this.hipsW); cs.update(dt, this.hipsW, Math.sin(this.visFacing), Math.cos(this.visFacing), now); } }
  }
  dispose() { if (this.model) { this.model.dispose(); this.model = null; } scene.remove(this.root); this.geos.forEach(g => g.dispose()); this.mats.forEach(m => m.dispose()); this.trail.dispose(); if (this.clothCape) this.clothCape.dispose(); if (this.clothScarf) this.clothScarf.dispose(); }
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
    const r = this.raw, P = this.pos, C = this.col, ib = 0.55 * this.op * VISUAL.trail * (this.boost || 1), cr = this.color.r * ib, cg = this.color.g * ib, cb = this.color.b * ib;
    for (let i = 0; i < this.N; i++) { const age = i / (this.N - 1), k = (1 - age) * (1 - age), tap = age * 0.7, j = i * 6;
      P[j] = r[j] + (r[j + 3] - r[j]) * tap; P[j + 1] = r[j + 1] + (r[j + 4] - r[j + 1]) * tap; P[j + 2] = r[j + 2] + (r[j + 5] - r[j + 2]) * tap; P[j + 3] = r[j + 3]; P[j + 4] = r[j + 4]; P[j + 5] = r[j + 5];
      C[j] = cr * k * 0.4; C[j + 1] = cg * k * 0.4; C[j + 2] = cb * k * 0.4; C[j + 3] = cr * k; C[j + 4] = cg * k; C[j + 5] = cb * k; }
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
    this.mat = new THREE.PointsMaterial({ size, vertexColors: true, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, sizeAttenuation: true });
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
    for (const r of this.rings) if (r.m.visible) { r.t += dt; const k = r.t / r.dur; if (k >= 1) { r.m.visible = false; continue; } r.m.scale.setScalar(1 + k * r.s); r.m.material.opacity = (1 - k) * 0.9; r.m.lookAt(camera.position); }
    if (this.light) this.light.intensity *= Math.exp(-dt * 22); },
  clear() { this.sparks.clear(); this.dust.clear(); this.rings.forEach(r => r.m.visible = false); Cam.trauma = 0; Cam.fovKick = 0; Cine.clear(); Juice.clear(); Post.clear(); if (this.light) this.light.intensity = 0; },
};
let embers = null;
function initEmbers() { const n = 70; const pos = new Float32Array(n * 3), seed = new Float32Array(n); for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - .5) * 34; pos[i * 3 + 1] = Math.random() * 7; pos[i * 3 + 2] = (Math.random() - .5) * 34; seed[i] = Math.random() * 100; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ color: 0xff9a50, size: 0.06, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending });
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
      const want = Math.atan2(tx - px, tz - pz) + VISUAL.lockAngle; this.yaw = this.yaw + angNorm(smoothDamp(0, angNorm(want - this.yaw), this.vel, 'yaw', CC.lockYawTime * holdK, dt));
      const d = Math.hypot(tx - px, tz - pz); this.look.set(px + (tx - px) * 0.35, 1.35, pz + (tz - pz) * 0.35);
      // combat-aware framing: pull back to keep a distant foe in frame, lean in on a perilous wind-up
      const cf = VISUAL.combatFrame; this.frameDist = Math.max(0, d - 4) * 0.22 * cf;
      if (target.state === 'attack' && target.atk && target.atk.def.danger && atkPhase(target.atk) === 'startup') { this.look.x += (tx - px) * 0.08 * cf; this.look.z += (tz - pz) * 0.08 * cf; this.frameDist -= 0.35 * cf; }
      this.pitch = smoothDamp(this.pitch, clamp(0.22 + Math.max(0, 3 - d) * 0.04, -0.2, 0.9), this.vel, 'pitch', 0.35, dt);
    } else { this.vel.yaw = 0; this.look.set(px, 1.55, pz); this.frameDist = 0; }
    // cinematic focus (deathblow / phase change): swing toward the subject, closer and lower
    const cw = Cine.camWeight(dt); let cineDist = 0;
    if (cw > 0 && Game.world) { const sub = Game.world.byId(Cine.cam); if (sub) { const sx = sub.px + (sub.x - sub.px) * alpha, sz = sub.pz + (sub.z - sub.pz) * alpha;
      this.look.x += (sx - this.look.x) * 0.5 * cw; this.look.z += (sz - this.look.z) * 0.5 * cw; this.look.y += (1.25 - this.look.y) * cw; this.yaw += 0.55 * dt * cw; this.pitch += (0.1 - this.pitch) * Math.min(1, dt * 3) * cw; cineDist = -2.0 * cw; } }
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
    camera.lookAt(this.lookAt); camera.rotateZ(nr * s * 0.035);
    this.fovKick *= Math.exp(-dt * 7); const fov = CC.fov + this.fovKick * CC.fovKick / 5;
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
    canvas.addEventListener('mousedown', e => { e.preventDefault(); audio.ensure(); canvas.focus();
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
    const P = Input.pressed;
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
    for (const c of this.chars.values()) c.dispose(); this.chars.clear(); FX.clear(); Input.clear(); Debug.reset(); Projectiles.clear(); this.chipTaught = false;
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
    const names = list.map(k => CORE.PROFILES[k].name).join(' & '); HUD.flash(names.toUpperCase(), '#e6d8bb', 30);
    canvas.focus();
  },
  pause() { if (this.state !== 'playing') return; this.state = 'paused'; Input.clear(); this.overlay('pause'); audio.bed(0);
    { const n = ENCOUNTERS[this.enc].length; $('pauseInfo').textContent = (ENC_NAMES[this.enc] || this.enc) + (n > 1 ? ' — foe ' + (this.stage + 1) + ' of ' + n : '') + (Settings.mirror && this.enc !== 'practice' ? ' · Mirror' : ''); } try { if (document.exitPointerLock && Input.locked) document.exitPointerLock(); } catch (e) {} },
  resume() { if (this.state !== 'paused') return; this.state = 'playing'; this.overlay(null); this.lastFrame = performance.now(); canvas.focus(); },
  quit() { for (const c of this.chars.values()) c.dispose(); this.chars.clear(); Projectiles.clear(); this.world = null; Coach.on = false; $('coach').style.opacity = 0; $('practice').style.display = 'none'; audio.bed(0); this.refreshBest(); FX.clear(); this.state = 'title'; this.showHud(false); this.overlay('title'); try { if (document.exitPointerLock) document.exitPointerLock(); } catch (e) {} },
  restart() { if (!this.world && this.state === 'title') return; this.begin(); },
  onKey(code, repeat) {
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
        case 'deflect': { const pos = contact(); audio.play('deflect', { heavy: e.heavy, pan: panOf(e.x, e.z), vol: e.quality === 'late' ? 0.7 : 1 }); FX.spark(pos, 34, 1.2, [1, 0.85, 0.5]); FX.ring(pos, 0xffe0a0, 7, 0.22); FX.flash(pos, 0xffd9a0, e.heavy ? 7 : 5); FX.kick(e.heavy ? 0.13 : 0.09); Cam.kickFov(-2.5);
          const pl = w.byId(e.d);
          if (pl && pl.isPlayer) { if (e.quality === 'perfect') { HUD.flash('PERFECT', '#ffffff', 52); audio.play('perfect', { pan: panOf(e.x, e.z) }); FX.ring(pos, 0xffffff, 11, 0.32); FX.spark(pos, 22, 1.5, [1, 1, 0.9]); Cam.kickFov(-3.5); Post.pulse('255,215,120', 0.32); }
            else if (e.quality === 'late') { HUD.flash('LATE', '#b7a780', 34); audio.play('late'); } else HUD.flash('DEFLECT', '#f6e2a8'); } else HUD.flash('DEFLECTED', '#ff9b7a', 30); break; }
        case 'block': { const pos = contact(); audio.play('block', { pan: panOf(e.x, e.z) }); FX.spark(pos, 10, 0.6, [0.9, 0.6, 0.3]); FX.kick(e.heavy ? 0.08 : 0.04); if (w.byId(e.d).isPlayer) HUD.flash('BLOCKED', '#b9ae98', 26); break; }
        case 'guardbreak': { audio.play('block'); audio.play('break'); FX.kick(0.15); HUD.flash('GUARD BROKEN', '#ff6a3d', 34); break; }
        case 'hit': { const pos = contact(); if (D) pos.copy(D.root.position).setY(1.25 * D.look.scale); audio.play('hit', { heavy: e.heavy || e.finisher, pan: panOf(e.x, e.z) }); FX.flecks(pos, e.heavy ? 14 : 8); FX.kick(e.finisher ? 0.16 : e.heavy ? 0.12 : 0.05); if (e.heavy || e.finisher) Cam.kickFov(3);
          if (e.finisher) { FX.ring(pos, 0xffd890, 8, 0.3); FX.spark(pos, 18, 1.0, [1, 0.85, 0.55]); FX.flash(pos, 0xffe0b0, 5); } break; }
        case 'postureBreak': { const c = this.chars.get(e.f); audio.play('break'); if (c) { const pos = c.root.position.clone().setY(1.3); FX.ring(pos, 0xffb030, 9, 0.45); FX.spark(pos, 20, 0.8, [1, 0.7, 0.2]); } FX.kick(0.18);
          const f = w.byId(e.f); HUD.flash(f.isPlayer ? 'POSTURE BROKEN' : 'POSTURE BROKEN', f.isPlayer ? '#ff5a3a' : '#ffcf6a', 36); break; }
        case 'dodged': if (w.byId(e.f).isPlayer) HUD.flash('EVADED', '#9fc6ff', 22); break;
        case 'jumped': HUD.flash('EVADED', '#9fc6ff', 22); break;
        case 'dodge': { const f = w.byId(e.f); audio.play('dodge'); FX.puff(f.x, f.z, 6); if (f.isPlayer) Cam.kickFov(2.2); break; }
        case 'jump': audio.play('jump'); break;
        case 'deathblow': { audio.play('deathblow'); audio.play('execSting'); HUD.flash('DEATHBLOW', '#ff3b30', 48); break; }
        case 'phase2': { audio.play('phase'); audio.play('phaseSting'); FX.kick(0.25); HUD.flash('THE BLADE UNSHEATHES HIS RESOLVE', '#ff4a3a', 24); const c = this.chars.get(e.f); if (c) FX.ring(c.root.position.clone().setY(1.2), 0xff2a1a, 12, 0.9); break; }
        case 'enemyDead': { const pc = this.chars.get(w.player.id); if (pc) pc.flourishT = 0; break; }
        case 'death': audio.play('death'); break;
        case 'gameover': setTimeout(() => this.endEncounter(e.win), e.win ? 1400 : 1600); break;
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
    const dt = Math.min(0.1, (now - (this.lastFrame || now)) / 1000); this.lastFrame = now; this.frameCount++;
    this.fpsAcc += dt; this.fpsN++; if (this.fpsAcc > 0.5) { this.fps = this.fpsN / this.fpsAcc; this.fpsAcc = 0; this.fpsN = 0; }
    const secs = now / 1000; let alpha = 1;
    Pad.poll(); Coach.update(dt); Perf.update(dt, this.state === 'playing');
    if (this.world && this.state === 'playing') {
      if (this.softT > 0) { this.softT -= dt; if (this.softT <= 0) { for (const e of this.world.enemies()) e.tempoMult = 1; Coach.on = false; Store.data.seenTutorial = true; Store.save(); } }
      { const w = this.world, p = w.player, es = w.enemies(); let k = 0.25 + 0.35 * (p.posture / p.postureMax) + 0.15 * Math.max(0, es.length - 1); for (const e of es) { if (e.phase === 2) k += 0.3; if (e.state === 'attack' && Math.hypot(e.x - p.x, e.z - p.z) < 5) k += 0.12; } audio.bed(this.enc === 'practice' ? k * 0.4 : k); }
      this.gatherIntent(dt);
      const p = this.world.player; if (p.lockId) { const t = this.world.byId(p.lockId); if (!t || t.dead || Math.hypot(t.x - p.x, t.z - p.z) > 24) p.lockId = null; }
      this.world.advance(dt * Cine.timeScale(dt)); alpha = this.world.acc / CONFIG.sim.dt;
      this.handleEvents(); Juice.update(this.world, this);
    }
    if (this.world) {
      for (const c of this.chars.values()) c.update(dt, alpha, secs);
      Projectiles.update(this.world, alpha, dt, secs);
      const p = this.world.player; Cam.update(dt, p, this.world.lockTarget(p), alpha);
      Tune.update();
      if (this.state === 'playing') HUD.update(dt, this.world, this.world.lockTarget(p));
      if (Settings.debug) Debug.update(this.world);
    } else { Cam.yaw += dt * 0.08; camera.position.set(Math.sin(Cam.yaw) * 14, 5, Math.cos(Cam.yaw) * 14); camera.lookAt(0, 1.5, 0); }
    FX.update(dt); updateEmbers(dt, secs); Post.update(dt);
    for (const t of torchLights) { const n = Math.sin(secs * 13 + t.seed) * 0.5 + Math.sin(secs * 23.7 + t.seed * 1.7) * 0.3 + Math.sin(secs * 41.3 + t.seed * 0.3) * 0.2, fl = (1 + n * 0.14) * VISUAL.torch;
      t.L.intensity = 1.8 * fl; t.fl.scale.set(1, 0.9 + n * 0.18, 1); if (t.halo) t.halo.material.opacity = 0.75 * fl; if (t.pool) t.pool.material.opacity = Math.min(1, 0.8 * fl); }
    for (const f of Arena.fog) if (f.visible && f.material.map) { f.material.map.offset.x += f.userData.spd * dt; f.material.map.offset.y += f.userData.spd * 0.6 * dt; }
    if (this.world) { const p = this.world.player; moon.position.set(p.x - 14, 26, p.z - 10); moon.target.position.set(p.x, 0, p.z);
      const fx = p.x - camera.position.x, fz = p.z - camera.position.z, fl = Math.hypot(fx, fz) || 1; rim.position.set(p.x + fx / fl * 12, 7, p.z + fz / fl * 12); rim.target.position.set(p.x, 1, p.z); }
    renderer.render(scene, camera);
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
}
buildArena(); FX.init(); initEmbers(); Input.init(); bindUI(); applyQuality(); onResize(); setAccessibility(CONFIG.parry.accessibility, true); Game.refreshBest();
document.addEventListener('visibilitychange', () => audio.mute(document.hidden));
if (window.VEYN_MODELS && (!HEADLESS || window.__VEYN_TEX_STUB)) { if (HEADLESS) window.__VEYN_TEX_STUB(THREE); VEYN_MODELS.load(ok => { const st = VEYN_MODELS.status(); console.log('[Veynhold] models ' + st.ready + '/' + st.total + (st.failed ? ' (' + st.failed + ')' : '')); }); }
runTests();
function loop(now) { try { Game.frame(now); } catch (e) { console.error(e); if (!Game.crashed) { Game.crashed = true; Debug.note('frame error: ' + e.message); } } requestAnimationFrame(loop); }
requestAnimationFrame(loop);
window.VEYN_GAME = { TIERS_V6: TIERS, Store, Coach, Pad, Perf, gradeOf, shadeOf, panOf, Projectiles, STANCES, TRACKS, famFor, Game, Cam, Input, Settings, FX, POSES, FAMILY, Character, scene, camera, Tune, VISUAL, Cine, Post, Juice, Arena, TIERS, applyQuality };
})();
