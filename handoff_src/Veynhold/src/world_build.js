/* =====================================================================
   VEYNHOLD — REGION BUILDER (presentation + collision data). Builds a region from src/data/region_*.js.
   Pure scenery: never touches the combat core. Static meshes are merged per 32 m chunk per material
   (few draw calls, chunk-level frustum + distance culling); doors, lanterns, torches and pickups stay dynamic.
   ===================================================================== */
(function () {
'use strict';
const G = window.VEYN_GAME; if (!G || !G.P1) return;
const P1 = G.P1, THREE = window.THREE, scene = G.scene;
const A = window.VEYN_ADV = window.VEYN_ADV || {};
const HEADLESS = !!window.__VEYN_HEADLESS;
const RNG = P1.V7RNG;
const CHUNK = 32;

/* ---------- materials (built once, reused across region loads) ---------- */
let MATS = null;
function groundTex(seed, o) {   // packed earth / mud / bone dust: colour + height -> normal map
  const S = o.size || 256, c = P1.V7Tex.canvas(S, S), h = P1.V7Tex.canvas(S, S, true); if (!c || !h) return { map: null, normal: null };
  const r = RNG(seed), g = c.g, hg = h.g; g.fillStyle = o.base; g.fillRect(0, 0, S, S); hg.fillStyle = '#808080'; hg.fillRect(0, 0, S, S);
  for (let i = 0; i < (o.blobs || 90); i++) { const x = r() * S, y = r() * S, rad = 6 + r() * 34, v = r(); const col = o.tones[(r() * o.tones.length) | 0];
    for (const [ox, oy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) { const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad); gr.addColorStop(0, col.replace('A', (0.18 + v * 0.25).toFixed(2))); gr.addColorStop(1, col.replace('A', '0'));
      g.fillStyle = gr; g.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2); const hv = 100 + v * 80 | 0, hr = hg.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad); hr.addColorStop(0, `rgba(${hv},${hv},${hv},0.5)`); hr.addColorStop(1, `rgba(${hv},${hv},${hv},0)`); hg.fillStyle = hr; hg.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2); } }
  for (let i = 0; i < (o.pebbles || 260); i++) { const x = r() * S, y = r() * S, s = 1 + r() * (o.pebbleSize || 3), v = 40 + r() * 70 | 0; g.fillStyle = `rgba(${v},${v - 4},${v - 8},0.8)`; g.beginPath(); g.ellipse(x, y, s, s * (0.6 + r() * 0.4), r() * 3, 0, 6.3); g.fill();
    hg.fillStyle = '#d0d0d0'; hg.beginPath(); hg.ellipse(x, y, s, s * 0.8, 0, 0, 6.3); hg.fill(); }
  if (o.ruts) for (let k = 0; k < o.ruts; k++) { const y0 = r() * S; g.strokeStyle = 'rgba(10,8,6,0.35)'; hg.strokeStyle = 'rgba(30,30,30,0.7)'; g.lineWidth = hg.lineWidth = 3 + r() * 4; g.beginPath(); hg.beginPath(); g.moveTo(0, y0); hg.moveTo(0, y0); for (let x = 0; x <= S; x += 16) { const y = y0 + Math.sin(x * 0.03 + k) * 6; g.lineTo(x, y); hg.lineTo(x, y); } g.stroke(); hg.stroke(); }
  if (o.bones) for (let i = 0; i < o.bones; i++) { const x = r() * S, y = r() * S, l = 4 + r() * 10, a = r() * 3.14; g.strokeStyle = 'rgba(190,180,160,0.55)'; g.lineWidth = 1.5 + r(); g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
  if (o.wet) for (let i = 0; i < o.wet; i++) { const x = r() * S, y = r() * S, rad = 8 + r() * 24; const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, 'rgba(0,0,0,0.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
  const map = P1.V7Tex.tex(c.cv), normal = P1.V7Tex.normalFrom(h.cv, o.normalK || 2.0); return { map, normal };
}
function plankTex(seed) { const c = P1.V7Tex.canvas(128, 128); if (!c) return null; const g = c.g, r = RNG(seed); g.fillStyle = '#3a2c20'; g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 16) { const v = 40 + r() * 24 | 0; g.fillStyle = `rgb(${v + 14},${v + 4},${v - 6})`; g.fillRect(0, y + 1, 128, 14); for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(0,0,0,${0.1 + r() * 0.2})`; g.fillRect(r() * 128, y + 2 + r() * 12, 8 + r() * 30, 1); }
    g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(0, y, 128, 1); const k = r() * 128; g.fillRect(k, y, 1, 16); g.fillStyle = 'rgba(20,16,12,0.8)'; g.beginPath(); g.arc(k + 4, y + 8, 1.2, 0, 6.3); g.fill(); }
  return P1.V7Tex.tex(c.cv); }
function surf(o, set, nK, floor) { const m = new THREE.MeshStandardMaterial(o); if (set && set.normal && !HEADLESS) { m.normalMap = set.normal; m.normalScale = new THREE.Vector2(nK, nK);
    if (floor) { m.userData.normalHi = set.normal; m.userData.nK = nK; return m; }   // floors: normal map only where the tier asks for it (A.applyTier)
    m.userData.normal = set.normal; m.userData.nK = nK; const VM = G.V7 && G.V7.V7Mats; if (VM) VM.surfaces.push(m); } return m; }   // perf: registered with the v7 tier switch, so Low drops normal maps
function mats() {
  if (MATS) return MATS; const T = P1.V7Tex;
  const ashlar = T.masonry(19, { size: 256, base: [58, 55, 51], gap: '#0d0c0b', vary: 22, bw: [40, 72], bh: [26, 36], gapPx: 2, cracks: 14, moss: 30, normalK: 2.6 });
  const flag = T.masonry(7, { size: 512, base: [60, 58, 55], gap: '#121110', vary: 26, bw: [70, 150], bh: [56, 96], gapPx: 3, cracks: 26, moss: 60, wet: 22, normalK: 3.0 });
  const cell = T.masonry(23, { size: 256, base: [44, 43, 42], gap: '#0a0a09', vary: 14, bw: [40, 60], bh: [40, 60], gapPx: 2, cracks: 18, moss: 10, wet: 30, normalK: 2.4 });
  const bonew = T.masonry(41, { size: 256, base: [92, 86, 74], gap: '#1a1612', vary: 18, bw: [14, 26], bh: [10, 16], gapPx: 2, cracks: 8, moss: 4, normalK: 2.8 });
  const earthw = T.masonry(53, { size: 256, base: [44, 36, 29], gap: '#120e0b', vary: 20, bw: [60, 120], bh: [40, 80], gapPx: 5, cracks: 30, moss: 40, normalK: 3.2 });
  const mud = groundTex(5, { base: '#2a231c', tones: ['rgba(20,16,12,A)', 'rgba(52,44,34,A)', 'rgba(36,40,28,A)'], blobs: 110, pebbles: 200, wet: 30, ruts: 0 });
  const dirt = groundTex(9, { base: '#332b22', tones: ['rgba(24,20,15,A)', 'rgba(62,52,40,A)', 'rgba(40,44,30,A)'], blobs: 120, pebbles: 320, ruts: 3, wet: 14 });
  const bone = groundTex(13, { base: '#3a352d', tones: ['rgba(80,74,62,A)', 'rgba(24,20,16,A)'], blobs: 90, pebbles: 180, bones: 120, pebbleSize: 2 });
  const rep = (set, n) => { if (set.map) set.map.repeat.set(n, n); if (set.normal) set.normal.repeat.set(n, n); if (set.height) set.height.repeat.set(n, n); return set; };
  const plank = plankTex(3);
  MATS = {
    stone: surf({ color: 0x9a9286, map: ashlar.map, roughness: 0.92 }, ashlar, 0.9), bone: surf({ color: 0xb0a690, map: bonew.map, roughness: 0.95 }, bonew, 0.9), earth: surf({ color: 0x8a7a68, map: earthw.map, roughness: 1 }, earthw, 1.1),
    flag: surf({ color: 0x5f5a53, map: flag.map, roughness: 0.86 }, flag, 0.9, true), cell: surf({ color: 0x55524e, map: cell.map, roughness: 0.8 }, cell, 0.8, true),
    mud: surf({ color: 0x9a8a78, map: mud.map, roughness: 0.95 }, mud, 1.0, true), dirt: surf({ color: 0x9c8c78, map: dirt.map, roughness: 1 }, dirt, 1.0, true), bonef: surf({ color: 0xa09684, map: bone.map, roughness: 1 }, bone, 1.0, true),
    wood: new THREE.MeshStandardMaterial({ color: 0x8a7462, map: plank, roughness: 0.95 }), darkwood: new THREE.MeshStandardMaterial({ color: 0x2a1f17, roughness: 1 }),
    iron: new THREE.MeshStandardMaterial({ color: 0x1e1f22, roughness: 0.5, metalness: 0.75 }), rust: new THREE.MeshStandardMaterial({ color: 0x3a2a20, roughness: 0.8, metalness: 0.4 }),
    cloth: new THREE.MeshStandardMaterial({ color: 0x4b4236, roughness: 1, side: THREE.DoubleSide }), redcloth: new THREE.MeshStandardMaterial({ color: 0x4a0d10, roughness: 1, side: THREE.DoubleSide }),
    shroud: new THREE.MeshStandardMaterial({ color: 0x0f0d0b, roughness: 1 }), rope: new THREE.MeshStandardMaterial({ color: 0x5c4a32, roughness: 1 }),
    rock: new THREE.MeshStandardMaterial({ color: 0x24252a, roughness: 1, flatShading: true }), far: new THREE.MeshStandardMaterial({ color: 0x141820, roughness: 1 }),
    bark: new THREE.MeshStandardMaterial({ color: 0x1c1712, roughness: 1 }), pine: new THREE.MeshStandardMaterial({ color: 0x141c16, roughness: 1, flatShading: true }),
    skull: new THREE.MeshStandardMaterial({ color: 0xb8ae98, roughness: 0.9 }), wax: new THREE.MeshStandardMaterial({ color: 0xd8ccb0, roughness: 0.7 }),
    flame: new THREE.MeshBasicMaterial({ color: 0xffb060, toneMapped: false }), ember: new THREE.MeshBasicMaterial({ color: 0xff6a20, toneMapped: false }),
    glowPool: new THREE.MeshBasicMaterial({ map: P1.glowTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    fog: new THREE.MeshBasicMaterial({ color: 0x9aa6c0, transparent: true, opacity: 0.0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false }),
    blood: new THREE.MeshStandardMaterial({ map: bloodTex(61), color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 }),
    moss: new THREE.MeshStandardMaterial({ map: P1.blotchTex(8, '45,70,30', 14, true), transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }),
  };
  MATS.texScale = { stone: 3.2, bone: 2.2, earth: 4, flag: 7, cell: 3.5, mud: 6, dirt: 8, bonef: 5 };
  MATS.wallrock = new THREE.MeshStandardMaterial({ color: 0x2c2722, roughness: 1, flatShading: true });   // earthy, darker than the free-standing rock so the stones read as part of the wall
  MATS.farsil = new THREE.MeshBasicMaterial({ color: 0x07090d, fog: false }); MATS.farsil.userData.noCull = true;   // unlit horizon silhouettes: dark masses against the sky (no pale moonlit / fogged facets), never chunk-culled so they cannot pop
  MATS.ringIron = new THREE.MeshStandardMaterial({ color: 0x080706, roughness: 0.85, metalness: 0.3 });   // inlaid floor ring (colour is linear: the old 0x1e1f22 iron read as a pale white band)
  MATS.bone.emissive = new THREE.Color(0x3a3327); MATS.bone.emissiveMap = MATS.bone.map;   // ossuary walls: a little bounce light so the moon-shadowed side is not a black void
  MATS.banner = new THREE.MeshStandardMaterial({ map: P1.V7Tex.banner(), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1 });
  // chunk G2: the Block's ring-wall banners sway like the duel arena's (GM banMat). Defined before the _twin loop so its Low twin keeps alphaTest / side (no black rectangles).
  MATS.bannerSway = MATS.banner.clone(); MATS.bannerSway.name = 'bannerSway'; MATS.bannerSway.onBeforeCompile = sh => { const U = P1.V7U; sh.uniforms.uTime = U.time; sh.uniforms.uWind = U.wind;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uWind;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n{ float sw = 1.0 - uv.y; float ph = position.x * 0.7 + position.z * 0.5; transformed += normalize(objectNormal) * (sin(uTime * 2.2 + position.y * 2.4 + ph) * 0.16 + sin(uTime * 3.9 + position.y * 5.0 + ph) * 0.05) * sw * sw * uWind; transformed.y += sin(uTime * 1.7 + ph) * 0.03 * sw * uWind; }'); };
  for (const k of ['mud', 'dirt', 'flag', 'cell', 'bonef']) MATS[k].userData.floor = true;   // drawn after walls / props so early depth rejects hidden ground pixels
  // perf (Low): per-vertex Lambert twins of every lit scenery material. At roughness 0.8-1 with no torch lights the PBR shading adds little
  // besides cost; on CPU / weak-GPU raster the fragment shader is the frame. Swapped in and out by A.lowShading().
  const MOONLIT = new THREE.Color(0.86, 0.93, 1.18);   // stands in for the cool moon / rim sheen the PBR specular gave
  MATS._twin = new Map(); for (const k in MATS) { const m = MATS[k]; if (!m || !m.isMeshStandardMaterial) continue;
    const t = new THREE.MeshLambertMaterial({ color: m.color.clone().multiplyScalar(m.metalness > 0.5 ? 3.4 : m.map ? 2.5 : 1.7).multiply(MOONLIT), map: m.map, transparent: m.transparent, opacity: m.opacity, depthWrite: m.depthWrite, side: m.side, alphaTest: m.alphaTest, blending: m.blending,
      polygonOffset: m.polygonOffset, polygonOffsetFactor: m.polygonOffsetFactor, emissive: m.emissive, emissiveMap: m.emissiveMap }); t.userData = m.userData; t.name = (m.name || k) + '_low'; MATS._twin.set(m, t); MATS._twin.set(t, m); }
  { const st = MATS._twin.get(MATS.shroud); if (st) st.color.setHex(0x2a241d); }   // chunk G2: Low shrouds (models failed only) read as dark wrapped cloth, not pale grey-blue logs
  if (!P1.tier().normalMaps) for (const k in MATS) { const m = MATS[k]; if (m && m.userData && m.userData.normal) { m.normalMap = null; m.needsUpdate = true; } }   // first load on Low
  photoMats(MATS);   // chunk F: Poly Haven photo surfaces on the PBR materials (Medium / High); the Lambert twins (Low) keep the procedural canvases
  return MATS;
}

/* dried-blood decal (repair chunk A): dark maroon stain, irregular noisy outline, soft layered falloff, darker dried rim, a few satellite
   blots and fine splatter dots. Everything stays inside a circle well short of the canvas edge, so no square edges ever show. Low alpha, no bright red. */
function bloodTex(seed) {
  const S = 256, c = P1.V7Tex.canvas(S, S); if (!c) return null; const g = c.g, r = RNG(seed || 61), C = S / 2;
  const blob = (cx, cy, R, k, layers, a0, rgb) => { const ph = [], am = []; for (let i = 0; i < 6; i++) { ph.push(r() * 6.28); am.push((0.16 + r() * 0.2) / (1 + i * 0.55)); }
    const rad = t => { let v = 1; for (let i = 0; i < 6; i++) v += am[i] * Math.sin((i + 2) * t + ph[i]); return R * v * k; };
    for (let L = 0; L < layers; L++) { const s = 1 - L / layers * 0.75; g.fillStyle = `rgba(${rgb},${a0})`; g.beginPath();
      for (let i = 0; i <= 72; i++) { const t = i / 72 * Math.PI * 2, rr = rad(t) * s; i ? g.lineTo(cx + Math.cos(t) * rr, cy + Math.sin(t) * rr) : g.moveTo(cx + Math.cos(t) * rr, cy + Math.sin(t) * rr); } g.closePath(); g.fill(); }
    return rad; };
  if ('filter' in g) g.filter = 'blur(2px)';
  const rad = blob(C, C, 62, 1, 9, 0.075, '46,10,10');                                   // main stain: alpha builds towards the centre (soft falloff)
  g.strokeStyle = 'rgba(26,6,7,0.22)'; g.lineWidth = 3; g.beginPath(); for (let i = 0; i <= 72; i++) { const t = i / 72 * Math.PI * 2, rr = rad(t) * 0.96; i ? g.lineTo(C + Math.cos(t) * rr, C + Math.sin(t) * rr) : g.moveTo(C + Math.cos(t) * rr, C + Math.sin(t) * rr); } g.closePath(); g.stroke();   // dried rim
  for (let i = 0; i < 4; i++) { const a = r() * 6.28, d = 60 + r() * 22; blob(C + Math.cos(a) * d, C + Math.sin(a) * d, 7 + r() * 9, 1, 5, 0.1, '40,9,9'); }   // satellite blots
  if ('filter' in g) g.filter = 'none';
  for (let i = 0; i < 26; i++) { const a = r() * 6.28, d = 66 + r() * 44, x = C + Math.cos(a) * d, y = C + Math.sin(a) * d, s = 0.8 + r() * 2.2;   // splatter dots (all within r = 112 px)
    g.fillStyle = `rgba(${36 + (r() * 14 | 0)},8,9,${(0.3 + r() * 0.3).toFixed(2)})`; g.beginPath(); g.ellipse(x, y, s, s * (0.6 + r() * 0.4), a, 0, 6.3); g.fill(); }
  const mask = g.createRadialGradient(C, C, S * 0.36, C, C, S * 0.48); mask.addColorStop(0, 'rgba(0,0,0,1)'); mask.addColorStop(1, 'rgba(0,0,0,0)');   // guarantee: fades to nothing before the edge
  g.globalCompositeOperation = 'destination-in'; g.fillStyle = mask; g.fillRect(0, 0, S, S); g.globalCompositeOperation = 'source-over';
  const t = P1.V7Tex.tex(c.cv); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}
/* =====================================================================
   CHUNK F — downloaded CC0 assets (docs/LICENSES.md): Poly Haven 1K surfaces and Quaternius Fantasy Props.
   - Photo textures replace map / normal on the PBR scenery materials only. Low renders the Lambert twins, which keep the
     procedural canvases, so Low costs exactly what it did. Repeat = the procedural texScale over the photo's real tile size,
     so a wall tile reads as the same physical size as before (walls 3.2 m procedural vs ~2 m per photo tile, etc.).
   - Props: one GLB (cart, barrel, crate, cage, chain), parsed once at page start. Every placement is a plain static mesh with
     the two shared trim-sheet materials (qWood, qMetal), so the chunk merge bakes all copies of a prop in a 32 m chunk into one
     draw per material (the merge is our instancing). Until the GLB is parsed (or in the headless test page) the original
     procedural prop is built instead, with the SAME colliders, so collision never depends on which mesh drew.
   ===================================================================== */
const FASSETS = /*F_ASSETS*/{};
/* chunk F placements (kept here, not in the region file, so parallel edits to region data merge cleanly). Checked against patrols,
   spawn points, pickups and stairs by the region assert + the Phase 1 playthrough. */
const F_PROPS = { execution: [
  // Gallows Yard: carts of the condemned either side of the gallows, a hanging cage by the west crates, chains at the gallows foot
  { t: 'cart', x: -14.5, z: -39, rot: 0.35 }, { t: 'cart', x: 14, z: -31.5, rot: -0.5 },
  { t: 'hangcage', x: -15.6, z: -46.6, rot: 0 }, { t: 'chains', x: -13.9, z: -44.9 }, { t: 'chains', x: 3.4, z: -41.6 },
  // Gaol: stores at the corridor ends, chains by the broken cell
  { t: 'crates', x: -24.6, z: -35.9, n: 2 }, { t: 'barrels', x: -55.05, z: -36.05, n: 2 }, { t: 'chains', x: -42.2, z: -36.2 },
  // Muster Field: barrels by the muster desk
  { t: 'barrels', x: -28, z: -2.5, n: 2 },
] };
const QP = { ready: false, parts: {} };   // prop name -> [{ geo (float, node transform baked, centred on x/z, base at y = 0), mat: 'qWood' | 'qMetal' }]
function b64buf(b64) { const bin = atob(b64), n = bin.length, u = new Uint8Array(n); for (let i = 0; i < n; i++) u[i] = bin.charCodeAt(i); return u.buffer; }
function floatGeo(g, mtx) {   // KHR_mesh_quantization attributes -> plain Float32 (mergeGeos reads raw values), node transform baked in
  const out = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'uv']) { const a = g.attributes[k]; if (!a) continue; const n = a.count, sz = a.itemSize, f = new Float32Array(n * sz), arr = a.array, nz = a.normalized, isI = a.isInterleavedBufferAttribute;
    const div = !nz ? 1 : arr instanceof Int8Array ? 127 : arr instanceof Uint8Array ? 255 : arr instanceof Int16Array ? 32767 : arr instanceof Uint16Array ? 65535 : 1;
    for (let i = 0; i < n; i++) for (let c = 0; c < sz; c++) { const v = isI ? (c === 0 ? a.getX(i) : c === 1 ? a.getY(i) : a.getZ(i)) : arr[i * sz + c]; f[i * sz + c] = div === 1 ? v : Math.max(v / div, -1); }
    out.setAttribute(k, new THREE.BufferAttribute(f, sz)); }
  if (g.index) out.setIndex(new THREE.BufferAttribute(g.index.array.slice ? g.index.array.slice() : g.index.array, 1));
  out.applyMatrix4(mtx); if (out.attributes.normal) { const N = out.attributes.normal; for (let i = 0; i < N.count; i++) { _fv.fromBufferAttribute(N, i).normalize(); N.setXYZ(i, _fv.x, _fv.y, _fv.z); } }
  return out; }
const _fv = new THREE.Vector3();
function loadProps() {
  if (QP.started || HEADLESS || !FASSETS.props || !THREE.GLTFLoader) return; QP.started = true;
  try { new THREE.GLTFLoader().parse(b64buf(FASSETS.props), '', gl => {
    gl.scene.updateMatrixWorld(true); const box = new THREE.Box3();
    gl.scene.traverse(o => { if (!o.isMesh) return; let node = o; while (node.parent && node.parent !== gl.scene && !QNAMES.includes(node.name)) node = node.parent; const name = QNAMES.find(n => node.name.indexOf(n) === 0) || node.name;
      const mats = Array.isArray(o.material) ? o.material : [o.material]; const g = floatGeo(o.geometry, o.matrixWorld);
      (QP.parts[name] = QP.parts[name] || []).push({ geo: g, mat: /Metal/.test(mats[0].name) ? 'qMetal' : 'qWood', src: mats[0] }); });
    for (const name in QP.parts) { box.makeEmpty(); for (const p of QP.parts[name]) { p.geo.computeBoundingBox(); box.union(p.geo.boundingBox); }
      const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2; for (const p of QP.parts[name]) { p.geo.translate(-cx, -box.min.y, -cz); p.geo.computeBoundingSphere(); }
      QP.parts[name].size = [box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z]; }
    const M = mats(); for (const name in QP.parts) for (const p of QP.parts[name]) { const m = M[p.mat]; if (!m.map && p.src.map) { m.map = p.src.map; m.map.anisotropy = 2; m.needsUpdate = true; const t = M._twin.get(m); if (t) { t.map = m.map; t.color.copy(m.color).multiplyScalar(p.mat === 'qMetal' ? 1.9 : 1.6); t.needsUpdate = true; } } }
    QP.ready = true; }, e => console.warn('[Veynhold] props GLB failed', e)); } catch (e) { console.warn('[Veynhold] props GLB failed', e); }
}
const QNAMES = ['Stall_Cart_Empty', 'Barrel', 'Crate_Wooden', 'Cage_Small', 'Chain_Coil'];
/* photo surfaces: [material, texture key, repeat, tint, normal strength] */
function photoMats(M) {
  M.qWood = M.qWood || new THREE.MeshStandardMaterial({ color: 0x8c7a68, roughness: 0.92, metalness: 0 }); M.qMetal = M.qMetal || new THREE.MeshStandardMaterial({ color: 0x7a7470, roughness: 0.7, metalness: 0.35 });
  for (const k of ['qWood', 'qMetal']) { M[k].name = k; if (!M._twin.has(M[k])) { const m = M[k], t = new THREE.MeshLambertMaterial({ color: m.color.clone().multiplyScalar(1.7) }); t.name = k + '_low'; t.userData = m.userData; M._twin.set(m, t); M._twin.set(t, m); } }
  loadProps();
  if (HEADLESS || !FASSETS.tex) return;
  const SETS = [
    // material   photo set              repeat (procedural texScale / photo tile metres)   tint (texture x colour)   normal k
    // tints: per channel, (procedural colour x canvas base, linear) x 1.6 / the photo's mean linear albedo, so each surface keeps the old moonlit
    // brightness and hue (the photos are 4-10x brighter than the dark procedural canvases; the first pass washed the yard out)
    ['stone', 'castle_wall_slates', 3.2 / 2.2, 0x272932, 1.0], ['flag', 'medieval_blocks_02', 7 / 2.4, 0x151616, 1.0], ['cell', 'medieval_blocks_02', 3.5 / 2.4, 0x0b0c0c, 0.9],
    ['mud', 'brown_mud_leaves_01', 6 / 3.0, 0x322a2b, 1.0], ['dirt', 'brown_mud_leaves_01', 8 / 3.0, 0x493c3b, 1.0],
    ['wood', 'rough_wood', 2.4, 0x3f2617, 0.8], ['rust', 'rusty_metal_02', 1.5, 0x8a6a58, 0], ['iron', 'rusty_metal_02', 1.0, 0x3a3634, 0],
  ];
  const cache = {};
  const img = (key, cb) => { const src = FASSETS.tex[key]; if (!src) return; if (cache[key]) { if (cache[key].done) cb(cache[key].im); else cache[key].q.push(cb); return; }
    const c = cache[key] = { q: [cb], done: false, im: new Image() }; c.im.onload = () => { c.done = true; c.q.forEach(f => f(c.im)); }; c.im.onerror = () => console.warn('[Veynhold] texture failed', key); c.im.src = 'data:image/jpeg;base64,' + src; };
  const tex = (im, rep, srgb) => { const t = new THREE.Texture(im); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.encoding = srgb ? THREE.sRGBEncoding : THREE.LinearEncoding; t.anisotropy = 4; t.needsUpdate = true; return t; };
  for (const [k, set, rep, tint, nK] of SETS) { const m = M[k]; if (!m) continue;
    img(set + '_diff', im => { m.map = tex(im, rep, true); m.color.setHex(tint); if (m.emissiveMap) m.emissiveMap = m.map; m.needsUpdate = true; });
    if (nK > 0) img(set + '_nor', im => { const n = tex(im, rep, false), u = m.userData; if (u.normalHi !== undefined || u.floor) { u.normalHi = n; if (m.normalMap) m.normalMap = n; } else { u.normal = n; const VM = G.V7 && G.V7.V7Mats; if (VM && VM.surfaces.indexOf(m) < 0) VM.surfaces.push(m); m.normalMap = P1.tier().normalMaps ? n : null; }
      u.nK = nK; if (m.normalMap) m.normalScale.set(nK, nK); m.needsUpdate = true; }); }
}
A.QP = QP;

/* ---------- geometry helpers ---------- */
function boxGeo(w, h, d, ts) {   // box with world-scaled UVs (texture tiles every ts metres)
  const g = new THREE.BoxGeometry(w, h, d); if (!ts) return g; const uv = g.attributes.uv; const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, uv.getX(k) * dims[f][0] / ts, uv.getY(k) * dims[f][1] / ts); } return g;
}
function planeGeo(w, d, ts) { const g = new THREE.PlaneGeometry(w, d); if (ts) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / ts, uv.getY(i) * d / ts); } return g; }

/* =====================================================================
   GROUND — walkable height field (repair step 1). Pure world layer: the core sim stays 2D (x, z); y is
   presentation + traversal rules. Height = the stair ramp containing (x, z), else the highest platform containing it, else 0.
   Ledges: every stair end / platform edge where the height across it changes by more than LEDGE (0.6 m) becomes a collision
   segment, so you cannot walk down or up a drop except by stairs and ramps; stairs with rails get side segments.
   ===================================================================== */
const LEDGE = 0.6, PIECE = 0.25, PROBE = 0.12;
function compileGround(R) {
  const E = R.elevation || {}, stairs = (E.stairs || []).map(s => Object.assign({ axis: 'z' }, s)), plats = E.platforms || [];
  const inStair = (s, x, z) => x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1;
  const stairY = (s, x, z) => { const u = s.axis === 'x' ? (x - s.x0) / (s.x1 - s.x0) : (z - s.z0) / (s.z1 - s.z0); return s.y0 + (s.y1 - s.y0) * (u < 0 ? 0 : u > 1 ? 1 : u); };
  const inPlat = (p, x, z) => p.rect ? x >= p.rect[0] && x <= p.rect[2] && z >= p.rect[1] && z <= p.rect[3] : (x - p.circle[0]) ** 2 + (z - p.circle[1]) ** 2 <= p.circle[2] * p.circle[2];
  function y(x, z, skip) {
    for (let i = 0; i < stairs.length; i++) { const s = stairs[i]; if (s !== skip && inStair(s, x, z)) return stairY(s, x, z); }
    let b = 0; for (let i = 0; i < plats.length; i++) { const p = plats[i]; if (p !== skip && p.y > b && inPlat(p, x, z)) b = p.y; } return b; }
  // ledge segments: sample an outline in PIECE-long bits; a bit is a ledge where the height just inside and just outside differ by > LEDGE
  function outline(ax, az, bx, bz, ox, oz, out) { const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / PIECE)); let run = null;
    for (let i = 0; i < n; i++) { const t0 = i / n, t1 = (i + 1) / n, tm = (t0 + t1) / 2, mx = ax + (bx - ax) * tm, mz = az + (bz - az) * tm;
      const hin = y(mx - ox * PROBE, mz - oz * PROBE), hout = y(mx + ox * PROBE, mz + oz * PROBE), on = Math.abs(hin - hout) > LEDGE;
      if (on) { if (!run) run = { t0, h: 0 }; run.t1 = t1; run.h = Math.max(run.h, hin, hout); } else if (run) { out.push(seg(run)); run = null; } }
    if (run) out.push(seg(run));
    function seg(r) { return { ax: ax + (bx - ax) * r.t0, az: az + (bz - az) * r.t0, bx: ax + (bx - ax) * r.t1, bz: az + (bz - az) * r.t1, h: r.h }; } }
  function ledges() { const out = [];
    const rect = (x0, z0, x1, z1) => { outline(x0, z0, x1, z0, 0, -1, out); outline(x1, z0, x1, z1, 1, 0, out); outline(x1, z1, x0, z1, 0, 1, out); outline(x0, z1, x0, z0, -1, 0, out); };
    for (const p of plats) { if (p.rect) rect(...p.rect); else { const [cx, cz, r] = p.circle, n = Math.ceil(Math.PI * 2 * r / 1.0);   /* ~1 m chords (sagitta < 1 cm at r = 15), each sampled in PIECE bits */
        for (let i = 0; i < n; i++) { const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2, am = (a0 + a1) / 2; outline(cx + Math.sin(a0) * r, cz + Math.cos(a0) * r, cx + Math.sin(a1) * r, cz + Math.cos(a1) * r, Math.sin(am), Math.cos(am), out); } } }
    for (const s of stairs) { if (s.axis === 'x') { outline(s.x0, s.z0, s.x0, s.z1, -1, 0, out); outline(s.x1, s.z1, s.x1, s.z0, 1, 0, out); } else { outline(s.x1, s.z0, s.x0, s.z0, 0, -1, out); outline(s.x0, s.z1, s.x1, s.z1, 0, 1, out); }   // the two ends
      if (s.rails !== false) { const top = Math.max(s.y0, s.y1); if (s.axis === 'x') { out.push({ ax: s.x0, az: s.z0, bx: s.x1, bz: s.z0, h: top, rail: s.id }, { ax: s.x0, az: s.z1, bx: s.x1, bz: s.z1, h: top, rail: s.id }); }
        else { out.push({ ax: s.x0, az: s.z0, bx: s.x0, bz: s.z1, h: top, rail: s.id }, { ax: s.x1, az: s.z0, bx: s.x1, bz: s.z1, h: top, rail: s.id }); } } }
    return out; }
  const G = { stairs, plats, decks: E.decks || [], y: (x, z) => y(x, z), yExcept: y, ledges, LEDGE, has: stairs.length + plats.length > 0 };
  return G;
}
A.compileGround = compileGround; A.LEDGE = LEDGE;

/* =====================================================================
   CORPSES (repair chunk A) — the rigged GLB characters, cloned, posed lying down ONCE at load (bones rotated, never animated),
   CPU-skinned into static geometry, tinted per corpse through vertex colours, then merged into one mesh per material.
   Ground contact: every baked body is snapped so its lowest vertex rests 1 cm into the ground; a soft contact shadow sits under it.
   Fallback (models not loaded, headless, or past the tier's posed-corpse budget): a low-poly wrapped shroud.
   ===================================================================== */
const CORPSE_KEYS = ['duelist', 'brother'];   // the two lighter, human-scale bodies (the Wanderer is the hero's own look; the Warden / King are boss silhouettes)
const CORPSE_SKIP = { Blade: 1, Edge: 1, PhaseII_Cracks: 1, ScarfTail: 1, Cape: 1 };   // capes: rigid cloth-sim slabs when baked
/* poses: relative Euler [x, y, z] per bone in the rig frame (x < 0 swings a limb forward, knee x > 0 bends; see POSES in game.js).
   lay: whole-body rotation that puts the posed figure on the ground (prone = face down). */
const CORPSE_POSES = {
  prone: { lay: [Math.PI / 2, 0, 0], b: { Hips: [0, 0, 0.06], Spine: [0, 0.1, 0], Neck: [0, 0.5, 0], Head: [-0.15, 0.7, 0.2],
    LeftArm: [-2.7, 0, 0.35], LeftForeArm: [-0.5, 0, 0], RightArm: [0.15, 0, -0.3], RightForeArm: [-0.25, 0, 0],
    LeftUpLeg: [0.02, 0, 0.14], LeftLeg: [0, 0, 0], RightUpLeg: [0.02, 0.3, -0.1], RightLeg: [0.02, 0, 0], LeftFoot: [0.3, 0, 0], RightFoot: [0.2, 0, 0.3] } },
  supine: { lay: [-Math.PI / 2, 0, 0], b: { Spine: [0, -0.05, 0], Neck: [0, 0.35, 0.1], Head: [0.05, 0.55, 0.25],
    LeftArm: [0.15, 0, 0.75], LeftForeArm: [-0.12, 0, 0], RightArm: [0.18, 0, -0.45], RightForeArm: [-0.15, 0, 0],
    LeftUpLeg: [-0.3, 0.2, 0.32], LeftLeg: [0.55, 0, 0], RightUpLeg: [0, 0, -0.1], RightLeg: [0.08, 0, 0], LeftFoot: [-0.4, 0, 0], RightFoot: [-0.7, 0, 0.3] } },
  side: { lay: [0, 0, Math.PI / 2], b: { Hips: [0.1, 0, 0], Spine: [0.25, 0, 0], Spine1: [0.2, 0, 0], Neck: [0.2, 0, 0], Head: [0.25, 0, 0.2],
    LeftArm: [-1.2, 0, 0.1], LeftForeArm: [-1.1, 0, 0], RightArm: [-0.9, 0, -0.1], RightForeArm: [-0.9, 0, 0],
    LeftUpLeg: [-1.0, 0, 0.05], LeftLeg: [1.2, 0, 0], RightUpLeg: [-0.6, 0, -0.05], RightLeg: [0.9, 0, 0] } },
  slump: { lay: [0, 0, 0], wall: true, b: { Hips: [-0.3, 0, 0.04], Spine: [0.12, 0, 0], Spine1: [0.12, 0.1, 0], Neck: [0.35, 0, 0.1], Head: [0.45, 0.3, 0.35],
    LeftArm: [0.05, 0, 0.32], LeftForeArm: [-0.25, 0, 0], RightArm: [-0.75, 0, -0.12], RightForeArm: [-0.55, 0, 0],
    LeftUpLeg: [-1.38, 0.2, 0.16], LeftLeg: [0, 0, 0], RightUpLeg: [-1.9, 0, -0.15], RightLeg: [1.6, 0, 0], LeftFoot: [-0.35, 0, 0], RightFoot: [0.1, 0, 0] } },
  huddle: { lay: [0, 0, 0], b: { Hips: [-0.15, 0, 0], Spine: [0.4, 0, 0], Spine1: [0.35, 0, 0], Neck: [0.3, 0, 0], Head: [0.5, 0.2, 0.1],
    LeftArm: [0.15, 0, 0.18], LeftForeArm: [-0.45, 0, 0], RightArm: [0.1, 0, -0.18], RightForeArm: [-0.5, 0, 0],
    LeftUpLeg: [-2.0, 0, 0.1], LeftLeg: [2.2, 0, 0], RightUpLeg: [-2.0, 0, -0.1], RightLeg: [2.2, 0, 0] } },
};
/* dull, undyed, sun-faded cloth: linen, mud brown, ash grey, faded ochre, moss, old blue */
const CORPSE_TINTS = [[0.62, 0.56, 0.47], [0.42, 0.33, 0.25], [0.45, 0.45, 0.46], [0.62, 0.5, 0.3], [0.36, 0.4, 0.3], [0.33, 0.37, 0.45], [0.5, 0.36, 0.33], [0.3, 0.27, 0.24]];
const CORPSE = { cache: new Map(), mats: new Map(), shadowMat: null };
const _cq = new THREE.Quaternion(), _cq2 = new THREE.Quaternion(), _ce = new THREE.Euler(), _cv = new THREE.Vector3(), _cv2 = new THREE.Vector3(), _cm = new THREE.Matrix4(), _cn = new THREE.Matrix3();
const comp = (a, i, k) => k === 0 ? a.getX(i) : k === 1 ? a.getY(i) : k === 2 ? a.getZ(i) : a.getW(i);
function corpseReady() { const VM = window.VEYN_MODELS; return !!(VM && THREE.SkeletonUtils && CORPSE_KEYS.some(k => VM.has(k))); }
/* bake one template in one pose -> { parts: [{ name, pos, nor, uv, idx }], box } in the lay frame, lowest vertex at y = 0, centred in x/z
   (slump: back at z = 0, legs towards +z). Cached per (template, pose); instances only transform these arrays. */
function bakeCorpse(key, poseName) {
  const ck = key + '|' + poseName; if (CORPSE.cache.has(ck)) return CORPSE.cache.get(ck);
  const T = window.VEYN_MODELS.templates[key]; if (!T) return null; const P = CORPSE_POSES[poseName];
  const root = THREE.SkeletonUtils.clone(T.scene); const byName = {}, order = [];
  root.traverse(o => { if (o.isBone) byName[o.name] = o; });
  const walk = b => { if (b.isBone) order.push(b); b.children.forEach(walk); }; walk(root);
  // rest correction (same as the live Model): the GLB binds in a T-pose; drivers assume arms hanging
  const rz = (n, a) => { const b = byName[n]; if (b) b.quaternion.premultiply(_cq.setFromAxisAngle(_cv.set(0, 0, 1), a)); }; rz('LeftArm', -Math.PI / 2); rz('RightArm', Math.PI / 2);
  const K = new Map(), Qm = new Map(), Dabs = new Map(), par = new Map();
  for (const b of order) { const p = b.parent && b.parent.isBone ? b.parent : null; par.set(b, p); const q = (p ? K.get(p).clone() : new THREE.Quaternion()).multiply(b.quaternion); K.set(b, q); }
  for (const b of order) { const p = par.get(b), rel = P.b[b.name]; const d = (p ? Dabs.get(p).clone() : new THREE.Quaternion()); if (rel) d.multiply(_cq.setFromEuler(_ce.set(rel[0], rel[1], rel[2], 'XYZ'))); Dabs.set(b, d);
    const qm = d.clone().multiply(K.get(b)); Qm.set(b, qm); b.quaternion.copy(p ? _cq2.copy(Qm.get(p)).invert().multiply(qm) : qm); }
  root.rotation.set(P.lay[0], P.lay[1], P.lay[2]); root.updateMatrixWorld(true);
  const parts = []; let minY = 1e9, minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  root.traverse(o => { if (!o.isMesh || !o.visible) return; const mn = o.material && o.material.name; if (CORPSE_SKIP[mn] || CORPSE_SKIP[o.name]) return; let skipped = false; for (let a = o.parent; a; a = a.parent) if (CORPSE_SKIP[a.name]) skipped = true; if (skipped) return;
    const g = o.geometry, Pa = g.attributes.position, Na = g.attributes.normal, Ua = g.attributes.uv, n = Pa.count, pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    const skin = o.isSkinnedMesh && g.attributes.skinIndex ? o : null; let bm = null;
    if (skin) { skin.skeleton.bones.forEach(b => b.updateMatrixWorld(true)); bm = skin.skeleton.bones.map((b, i) => new THREE.Matrix4().multiplyMatrices(skin.bindMatrixInverse, _cm.multiplyMatrices(b.matrixWorld, skin.skeleton.boneInverses[i]).multiply(skin.bindMatrix))); }
    const W = o.matrixWorld, SI = skin && g.attributes.skinIndex, SW = skin && g.attributes.skinWeight, acc = new THREE.Matrix4();
    for (let i = 0; i < n; i++) { _cv.fromBufferAttribute(Pa, i); _cv2.set(0, 0, 0); if (Na) _cv2.fromBufferAttribute(Na, i);
      if (skin) { const e = acc.elements; e.fill(0); for (let k = 0; k < 4; k++) { const w = comp(SW, i, k); if (!w) continue; const be = bm[comp(SI, i, k)].elements; for (let j = 0; j < 16; j++) e[j] += be[j] * w; }
        _cv.applyMatrix4(acc); _cn.setFromMatrix4(acc); _cv2.applyMatrix3(_cn); }
      _cv.applyMatrix4(W); _cn.getNormalMatrix(W); _cv2.applyMatrix3(_cn).normalize();
      pos[i * 3] = _cv.x; pos[i * 3 + 1] = _cv.y; pos[i * 3 + 2] = _cv.z; nor[i * 3] = _cv2.x; nor[i * 3 + 1] = _cv2.y; nor[i * 3 + 2] = _cv2.z; if (Ua) { uv[i * 2] = Ua.getX(i); uv[i * 2 + 1] = Ua.getY(i); }
      if (_cv.y < minY) minY = _cv.y; if (_cv.x < minX) minX = _cv.x; if (_cv.x > maxX) maxX = _cv.x; if (_cv.z < minZ) minZ = _cv.z; if (_cv.z > maxZ) maxZ = _cv.z; }
    const idx = g.index ? Uint32Array.from(g.index.array) : Uint32Array.from({ length: n }, (_, i) => i);
    parts.push({ name: mn || 'Body', src: o.material, pos, nor, uv, idx }); });
  const ox = (minX + maxX) / 2, oz = P.wall ? minZ : (minZ + maxZ) / 2;
  for (const p of parts) for (let i = 0; i < p.pos.length; i += 3) { p.pos[i] -= ox; p.pos[i + 1] -= minY; p.pos[i + 2] -= oz; }
  const res = { parts, box: { w: maxX - minX, d: maxZ - minZ, z0: minZ - oz, z1: maxZ - oz } }; CORPSE.cache.set(ck, res); return res;
}
/* one shared material per (template, material name): the GLB's texture with vertex colours on (cloth tint / skin pallor); a Lambert twin for Low */
function corpseMat(key, part) {
  const mk = key + '|' + part.name; let m = CORPSE.mats.get(mk); if (m) return m; const s = part.src || {};
  const metal = /Armor|Trim/.test(part.name);
  m = new THREE.MeshStandardMaterial({ map: s.map || null, color: 0xffffff, vertexColors: true, roughness: metal ? 0.6 : 0.97, metalness: metal ? 0.45 : 0 }); m.name = 'corpse_' + part.name;
  const M = mats(); if (M._twin) { const t = new THREE.MeshLambertMaterial({ map: m.map, color: new THREE.Color(1.5, 1.55, 1.75), vertexColors: true }); t.name = m.name + '_low'; M._twin.set(m, t); M._twin.set(t, m); }
  CORPSE.mats.set(mk, m); return m;
}
function corpseShadowMat() {   // soft elliptical contact shadow (ground contact without AO passes)
  if (CORPSE.shadowMat) return CORPSE.shadowMat; const c = P1.V7Tex.canvas(64, 64); let map = null;
  if (c) { const g = c.g, gr = g.createRadialGradient(32, 32, 0, 32, 32, 31); gr.addColorStop(0, 'rgba(0,0,0,0.62)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.32)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); map = P1.V7Tex.tex(c.cv); }
  CORPSE.shadowMat = new THREE.MeshBasicMaterial({ map, color: 0xffffff, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, opacity: map ? 1 : 0 }); return CORPSE.shadowMat;
}

/* chunk A2: the posted writ of execution (256x320 canvas: heading, a column of scrawled lines, a name struck through, the red seal) */
let WRIT_MAT = null;
function writMat() {
  if (WRIT_MAT) return WRIT_MAT; const c = P1.V7Tex && P1.V7Tex.canvas(256, 320); let map = null;
  if (c) { const g = c.g, rr = RNG(9); g.fillStyle = '#cfc2a2'; g.fillRect(0, 0, 256, 320);
    for (let i = 0; i < 900; i++) { g.fillStyle = 'rgba(90,70,40,' + (rr() * 0.08) + ')'; g.fillRect(rr() * 256, rr() * 320, 2 + rr() * 6, 1 + rr() * 3); }   // foxing
    const edge = g.createRadialGradient(128, 160, 90, 128, 160, 200); edge.addColorStop(0, 'rgba(60,40,20,0)'); edge.addColorStop(1, 'rgba(60,40,20,0.45)'); g.fillStyle = edge; g.fillRect(0, 0, 256, 320);
    g.fillStyle = '#2a1d14'; g.textAlign = 'center'; g.font = 'bold 22px serif'; g.fillText('BY ORDER OF', 128, 38); g.font = 'bold 30px serif'; g.fillText('THE KING', 128, 72);
    g.font = 'italic 17px serif'; g.fillText('a Writ of Execution', 128, 98); g.fillRect(40, 108, 176, 2);
    for (let i = 0; i < 9; i++) { const y = 130 + i * 15, w = 150 + rr() * 40; g.globalAlpha = 0.75; for (let x = 128 - w / 2; x < 128 + w / 2;) { const sw = 6 + rr() * 22; g.fillRect(x, y + (rr() - 0.5) * 2, sw, 2.2); x += sw + 3 + rr() * 4; } }
    g.globalAlpha = 1; g.strokeStyle = '#3a1a10'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(60, 192); g.lineTo(196, 186); g.stroke();   // a name struck through
    g.font = 'bold 18px serif'; g.fillText('HANGED AT DAWN', 128, 278);
    g.fillStyle = '#7a1414'; g.beginPath(); g.arc(196, 292, 17, 0, Math.PI * 2); g.fill(); g.fillStyle = '#5a0c0c'; g.beginPath(); g.arc(196, 292, 9, 0, Math.PI * 2); g.fill();
    map = P1.V7Tex.tex(c.cv); map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping; }
  WRIT_MAT = new THREE.MeshStandardMaterial({ map, color: map ? 0xffffff : 0xcfc2a2, roughness: 0.95, side: THREE.DoubleSide }); WRIT_MAT.name = 'writ'; lowTwin(WRIT_MAT, 1.5); return WRIT_MAT;
}
let DRESS_MAT = null;
/* Low tier swaps Standard -> Lambert twins (A.lowShading); the chunk A2 materials register theirs the same way (moonlit boost, as mats() does) */
function lowTwin(m, k) { const tw = mats()._twin; if (!tw || tw.has(m)) return m; const t = new THREE.MeshLambertMaterial({ color: m.color.clone().multiplyScalar(k).multiply(new THREE.Color(0.86, 0.93, 1.18)), map: m.map, vertexColors: m.vertexColors, side: m.side });
  t.name = m.name + '_low'; tw.set(m, t); tw.set(t, m); return m; }
function dressMat() { if (!DRESS_MAT) { DRESS_MAT = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.95, side: THREE.DoubleSide }); DRESS_MAT.name = 'dress'; lowTwin(DRESS_MAT, 1.9); } return DRESS_MAT; }
let CROW_MAT = null;
function crowMat() { if (!CROW_MAT) { CROW_MAT = new THREE.MeshStandardMaterial({ color: 0x121216, roughness: 0.55, metalness: 0.1 }); CROW_MAT.name = 'crow'; lowTwin(CROW_MAT, 1.7); } return CROW_MAT; }
/* chunk A2: a perched crow, ~0.4 m, one merged mesh; origin at its feet, facing +z */
let CROW_GEO = null;
function crowGeo() {
  if (CROW_GEO) return CROW_GEO; const items = [], add = (geo, x, y, z, rx, ry, rz, sx, sy, sz) => { const o = new THREE.Object3D(); o.position.set(x, y, z); o.rotation.set(rx || 0, ry || 0, rz || 0); o.scale.set(sx || 1, sy || 1, sz || 1); o.updateMatrix(); items.push({ geo, m: o.matrix.clone() }); };
  add(new THREE.SphereGeometry(0.1, 8, 6), 0, 0.15, 0, -0.35, 0, 0, 0.82, 0.85, 1.55);          // body, tail-down posture
  add(new THREE.SphereGeometry(0.058, 8, 6), 0, 0.27, 0.11);                                     // head
  add(new THREE.ConeGeometry(0.022, 0.085, 6), 0, 0.262, 0.2, Math.PI / 2 + 0.15, 0, 0);          // beak
  add(new THREE.BoxGeometry(0.1, 0.012, 0.17), 0, 0.09, -0.19, -0.75, 0, 0);                       // tail
  for (const s of [-1, 1]) { add(new THREE.BoxGeometry(0.02, 0.09, 0.22), s * 0.075, 0.16, -0.05, -0.4, 0, s * 0.08);   // folded wings
    add(new THREE.CylinderGeometry(0.007, 0.007, 0.08, 3), s * 0.03, 0.035, 0.0); }                // legs
  CROW_GEO = A.mergeGeos(items); return CROW_GEO;
}

class Builder {
  constructor(region) { this.R = region; this.M = mats(); this.statics = []; this.dyn = new THREE.Group(); this.dyn.name = 'regionDyn'; this.segs = []; this.circles = []; this.torches = []; this.meshes = []; this.rnd = RNG(1234);
    this.ground = compileGround(region); this.gy0 = 0; }
  S(mesh) { this.statics.push(mesh); return mesh; }
  mesh(geo, mat, x, y, z, ry, statik) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y + this.gy0, z);   /* gy0: ground height under the prop being built (0 for walls / floors) */ if (ry) m.rotation.y = ry; m.castShadow = true; m.receiveShadow = true; if (statik !== false) this.S(m); else this.dyn.add(m); return m; }
  seg(ax, az, bx, bz, o) { const s = Object.assign({ ax, az, bx, bz, t: 0.4, h: 5, low: false, cam: true, sight: true, on: true }, o || {}); this.segs.push(s); return s; }
  circle(x, z, r, o) { const c = Object.assign({ x, z, r, h: 3, cam: true, sight: true, on: true }, o || {}); this.circles.push(c); return c; }
  boxCollider(x, z, w, d, ry, o) { const c = Math.cos(ry || 0), s = Math.sin(ry || 0), hw = w / 2, hd = d / 2; const P = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([u, v]) => [x + u * c + v * s, z - u * s + v * c]);
    for (let i = 0; i < 4; i++) this.seg(P[i][0], P[i][1], P[(i + 1) % 4][0], P[(i + 1) % 4][1], Object.assign({ t: 0.05 }, o || {})); }
  build() {
    const R = this.R;
    this.floors(); for (const w of R.walls) this.wall(w); this.elevation();
    this.lowB = !!G.Settings && G.Settings.quality === 'low';   // chunk F: a region built on Low gets exactly the base scenery (procedural props, no dressing props)
    for (const p of R.props.concat(this.lowB ? [] : F_PROPS[R.id] || [])) { const f = this['p_' + p.t]; if (!f) continue; this.gy0 = p.ground === false ? 0 : this.ground.y(p.x, p.z); f.call(this, p); this.gy0 = 0; }
    this.buildCorpses(); this.unsnag(); this.outer(); return this;
  }
  /* ---- elevation: ledge / rail colliders (generated from the region data) + step, stringer, rail and deck meshes ---- */
  elevation() {
    const G = this.ground, M = this.M; if (!G.has) return;
    for (const l of G.ledges()) this.seg(l.ax, l.az, l.bx, l.bz, { t: 0.12, h: l.h, cam: false, sight: false, low: false, ledge: !l.rail, rail: !!l.rail });
    for (const s of G.stairs) { const n = s.risers || Math.max(1, Math.round(Math.abs(s.y1 - s.y0) / 0.2)), lo = Math.min(s.y0, s.y1), hi = Math.max(s.y0, s.y1), r = (hi - lo) / n, up = s.y1 >= s.y0;
      const ax = s.axis === 'x', L = ax ? s.x1 - s.x0 : s.z1 - s.z0, W = ax ? s.z1 - s.z0 : s.x1 - s.x0, cxs = (s.x0 + s.x1) / 2, czs = (s.z0 + s.z1) / 2, tr = L / n, mat = M[s.mat] || M.stone, ts = M.texScale[s.mat] || 2;
      s.rise = r; s.tread = tr;
      for (let k = 0; k < n; k++) { const top = lo + (k + 1) * r, a0 = up ? k * tr : L - (k + 1) * tr, mid = (ax ? s.x0 : s.z0) + a0 + tr / 2;   // tread k (counted from the low end), solid down to y = 0
        const g = ax ? boxGeo(tr + 0.004, top, W, ts) : boxGeo(W, top, tr + 0.004, ts); const m = this.mesh(g, mat, ax ? mid : cxs, top / 2, ax ? czs : mid, 0); m.castShadow = true;
        const nose = this.mesh(ax ? boxGeo(0.05, 0.035, W) : boxGeo(W, 0.035, 0.05), M.darkwood, ax ? (up ? mid - tr / 2 + 0.02 : mid + tr / 2 - 0.02) : cxs, top - 0.018, ax ? czs : (up ? mid - tr / 2 + 0.02 : mid + tr / 2 - 0.02), 0); nose.castShadow = false; }   // dark nosing line: every step reads at night
      if (s.stringer) { const slope = Math.atan2(hi - lo, L), hyp = Math.hypot(L, hi - lo);   // free-standing stair: sloped cheek boards, posts and a hand rail on both sides
        for (const sd of [-1, 1]) { const off = sd * (W / 2 + 0.06), px = ax ? cxs : cxs + off, pz = ax ? czs + off : czs;
          const ch = this.mesh(ax ? boxGeo(hyp, 0.34, 0.1, 1) : boxGeo(0.1, 0.34, hyp, 1), M[s.stringer] || M.darkwood, px, (lo + hi) / 2 + 0.05, pz, 0); if (ax) ch.rotation.z = up ? slope : -slope; else ch.rotation.x = up ? -slope : slope;
          const hr = this.mesh(ax ? boxGeo(hyp, 0.07, 0.07) : boxGeo(0.07, 0.07, hyp), M[s.stringer] || M.darkwood, px, (lo + hi) / 2 + 0.95, pz, 0); if (ax) hr.rotation.z = ch.rotation.z; else hr.rotation.x = ch.rotation.x;
          const np = Math.max(2, Math.round(L / 0.8)); for (let i = 0; i <= np; i++) { const u = i / np, yb = lo + (hi - lo) * (up ? u : 1 - u), along = (ax ? s.x0 : s.z0) + L * u;
            this.mesh(boxGeo(0.08, 0.95, 0.08), M[s.stringer] || M.darkwood, ax ? along : px, yb + 0.47, ax ? pz : along, 0); } } } }
    for (const p of G.plats) { if (!p.deck || !p.rect) continue; const [x0, z0, x1, z1] = p.rect, mat = M[p.deck] || M.stone; this.mesh(boxGeo(x1 - x0, p.y, z1 - z0, M.texScale[p.deck] || 3), mat, (x0 + x1) / 2, p.y / 2, (z0 + z1) / 2, 0).castShadow = false; }
    for (const d of G.decks) { const [x0, z0, x1, z1] = d.rect, mat = M[d.mat] || M.flag; const m = new THREE.Mesh(planeGeo(x1 - x0, z1 - z0, M.texScale[d.mat] || 6), mat); m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, d.y + 0.004, (z0 + z1) / 2); m.receiveShadow = true; this.S(m); }
  }
  /* ---- snag pass: a thin decorative post standing closer to a wall than a body can pass leaves a pocket the player catches on;
     those posts lose their collider (the wall already stops you there) ---- */
  unsnag() { const walls = this.segs.filter(s => !s.ledge && !s.rail && !s.low && s.t >= 0.3); let removed = 0;
    this.circles = this.circles.filter(c => { if (!c.deco) return true; for (const w of walls) { const ex = w.bx - w.ax, ez = w.bz - w.az, L2 = ex * ex + ez * ez || 1e-6; let t = ((c.x - w.ax) * ex + (c.z - w.az) * ez) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const gap = Math.hypot(c.x - (w.ax + ex * t), c.z - (w.az + ez * t)) - w.t - c.r; if (gap < 1.0) { removed++; return false; } } return true; });
    this.unsnagged = removed; }
  /* ---- floors: one plane per zone rect (circle for round zones) + a dark base that fills every gap ---- */
  floors() {
    const M = this.M, B = this.R.bounds, TS = M.texScale;
    const base = new THREE.Mesh(planeGeo(B.x1 - B.x0 + 160, B.z1 - B.z0 + 160, 8), M.mud); base.rotation.x = -Math.PI / 2; base.position.set((B.x0 + B.x1) / 2, -0.03, (B.z0 + B.z1) / 2); base.receiveShadow = true; base.renderOrder = 2; this.dyn.add(base); this.base = base;
    for (const z of this.R.zones) { if (z.nofloor) continue; const mat = M[z.floor === 'bone' ? 'bonef' : z.floor] || M.dirt, ts = TS[z.floor === 'bone' ? 'bonef' : z.floor] || 6, zy = z.y || 0;
      for (const r of z.rects || []) { const [x0, z0, x1, z1] = r; const g = planeGeo(x1 - x0, z1 - z0, ts); const m = new THREE.Mesh(g, mat); m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, zy + 0.002, (z0 + z1) / 2); m.receiveShadow = true; m.castShadow = false; this.S(m); }
      if (z.circle) { const [cx, cz, cr] = z.circle; const g = new THREE.CircleGeometry(cr + (zy ? 0.3 : 0.6), 40); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * cr * 2 / ts, uv.getY(i) * cr * 2 / ts);
        const m = new THREE.Mesh(g, mat); m.rotation.x = -Math.PI / 2; m.position.set(cx, zy + 0.008, cz); m.receiveShadow = true; this.S(m);   // 8 mm over the rect floors it overlaps (was 1 mm: z-fought at range)
        const ring = new THREE.Mesh(new THREE.RingGeometry(cr * 0.42, cr * 0.47, 40), M.ringIron); ring.rotation.x = -Math.PI / 2; ring.position.set(cx, zy + 0.014, cz); this.S(ring); } }
    // decals: old blood near the gallows / block, moss along the walls
    const dec = (mat, x, z, s, k) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s), mat); m.rotation.set(-Math.PI / 2, 0, k); m.position.set(x, this.ground.y(x, z) + 0.012 + this.rnd() * 0.004, z); m.receiveShadow = true; m.castShadow = false; this.S(m); };
    [[0.2, -36.4, 1.7], [-2.6, -39.6, 1.1], [1.9, 47.4, 1.8], [-2.4, 52.6, 1.2], [-1.4, -69.2, 1.3], [-42.4, -25.4, 1.1]].forEach(([x, z, s], i) => dec(this.M.blood, x, z, s, i * 1.7));   // chunk A: fewer, smaller stains
    for (let i = 0; i < 40; i++) { const w = this.R.walls[(i * 7) % this.R.walls.length]; const t = this.rnd(); dec(this.M.moss, w[0] + (w[2] - w[0]) * t + (this.rnd() - 0.5), w[1] + (w[3] - w[1]) * t + (this.rnd() - 0.5), 2 + this.rnd() * 2, this.rnd() * 6); }
  }
  /* ---- walls ---- */
  wall(w) {
    const [ax, az, bx, bz, style, h0] = w, M = this.M, dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz), ry = Math.atan2(-dz, dx), mx = (ax + bx) / 2, mz = (az + bz) / 2, ux = dx / L, uz = dz / L, nx = -uz, nz = ux, r = this.rnd;
    if (L < 0.01) return;
    if (style === 'low') { this.seg(ax, az, bx, bz, { t: 0.35, h: 0.9, low: true, cam: false, sight: false });
      const n = Math.max(2, Math.round(L / 1.1)); for (let i = 0; i < n; i++) { const t = (i + 0.5) / n, x = ax + dx * t, z = az + dz * t, k = r();
        const bh = 0.4 + r() * 0.5; const g = k < 0.5 ? boxGeo(0.9 + r() * 0.5, bh, 0.6 + r() * 0.4, 1.5) : new THREE.CylinderGeometry(0.16, 0.18, 1.6 + r(), 6); const m = this.mesh(g, k < 0.5 ? M.stone : M.darkwood, x + nx * (r() - 0.5) * 0.3, k < 0.5 ? bh / 2 - 0.03 : 0.25, z + nz * (r() - 0.5) * 0.3, ry + r() * 0.6);
        if (k >= 0.5) { m.rotation.z = Math.PI / 2; m.rotation.x = (r() - 0.5) * 0.4; m.position.y = 0.2 + r() * 0.4; } } return; }
    if (style === 'bars') { this.seg(ax, az, bx, bz, { t: 0.08, h: h0, cam: false, sight: false });
      const n = Math.max(2, Math.round(L / 0.22)); const geo = new THREE.CylinderGeometry(0.025, 0.025, h0, 5);
      for (let i = 0; i <= n; i++) { const t = i / n; this.mesh(geo.clone(), M.iron, ax + dx * t, h0 / 2, az + dz * t, 0); }
      for (const y of [0.15, 1.2, h0 - 0.1]) this.mesh(boxGeo(L, 0.06, 0.06), M.iron, mx, y, mz, ry); return; }
    if (style === 'palisade') { this.seg(ax, az, bx, bz, { t: 0.35, h: h0 });
      const n = Math.round(L / 0.36); const lg = new THREE.CylinderGeometry(0.16, 0.19, 1, 6), tip = new THREE.ConeGeometry(0.17, 0.5, 6);
      for (let i = 0; i <= n; i++) { const t = i / n, hh = h0 - 0.4 + r() * 0.8, x = ax + dx * t + nx * (r() - 0.5) * 0.08, z = az + dz * t + nz * (r() - 0.5) * 0.08; const lgm = this.mesh(lg.clone(), M.darkwood, x, hh / 2, z, 0); lgm.scale.y = hh; lgm.rotation.z = (r() - 0.5) * 0.05; this.mesh(tip.clone(), M.darkwood, x, hh + 0.25, z, 0); }
      for (const y of [1.1, h0 - 1]) this.mesh(boxGeo(L, 0.18, 0.12, 2), M.wood, mx + nx * 0.22, y, mz + nz * 0.22, ry); return; }
    if (style === 'cliff') { this.seg(ax, az, bx, bz, { t: 0.8, h: h0 }); const n = Math.max(2, Math.round(L / 2.5));
      const walk = (x, z) => this.R.zones.some(zn => (zn.rects || []).some(q => x >= q[0] && x <= q[2] && z >= q[1] && z <= q[3]) || (zn.circle && Math.hypot(x - zn.circle[0], z - zn.circle[1]) < zn.circle[2]));
      const far = walk(mx + nx * 1.5, mz + nz * 1.5) ? -1 : 1;   // the side away from the walkable zone
      for (let i = 0; i < n; i++) { const t = (i + 0.5) / n, s = 2 + r() * 2.2, k = far * (s * 0.85 + r() * 0.3); r(); const m = this.mesh(new THREE.DodecahedronGeometry(s, 0), M.rock, ax + dx * t + nx * k, s * 0.7, az + dz * t + nz * k, r() * 6); m.scale.set(1, 1.4 + r() * 1.2, 1); } return; }
    // solid masonry: stone / bone / earth
    const mat = M[style] || M.stone, ts = M.texScale[style] || 3.2, T = style === 'earth' ? 1.4 : 0.9;
    this.seg(ax, az, bx, bz, { t: T / 2, h: h0 });
    const hv = h0 + (style === 'earth' ? (r() - 0.5) * 0.8 : 0);
    this.mesh(boxGeo(L + T * 0.98, hv, T, ts), mat, mx, hv / 2, mz, ry);
    if (style === 'stone') {   // crenellations (some knocked out), plinth, buttresses
      const nm = Math.floor(L / 1.4); for (let i = 0; i < nm; i++) { if (r() < 0.22) continue; const t = (i + 0.5) / nm; this.mesh(boxGeo(0.7, 0.6, T + 0.08, ts), mat, ax + dx * t, hv + 0.3, az + dz * t, ry); }
      this.mesh(boxGeo(L + T, 0.35, T + 0.3, ts), mat, mx, 0.17, mz, ry);
      const nb = Math.floor(L / 7); for (let i = 1; i <= nb; i++) { const t = i / (nb + 1); for (const sd of [-1, 1]) { const bh = hv * (0.55 + r() * 0.25); this.mesh(boxGeo(0.8, bh, 0.5, ts), mat, ax + dx * t + nx * sd * (T / 2 + 0.22), bh / 2, az + dz * t + nz * sd * (T / 2 + 0.22), ry); } }
    } else if (style === 'earth') { const n = Math.floor(L / 1.8); for (let i = 0; i < n; i++) { const t = 0.04 + 0.92 * (i + 0.2 + r() * 0.6) / n, s = 0.4 + r() * 0.8, sd = r() < 0.5 ? 1 : -1, off = T / 2 - s * (0.5 + r() * 0.2);   // stones set into a wall face (flattened along the wall normal)
        const y = Math.max(s * 0.35, Math.min(hv - s * 1.05, s * 0.35 + r() * hv * 0.75));   /* top stays under the wall crest */ const m = this.mesh(new THREE.DodecahedronGeometry(s, 0), M.wallrock, ax + dx * t + nx * sd * off, y, az + dz * t + nz * sd * off, ry + (r() - 0.5) * 0.6); m.scale.set(1, 0.75 + r() * 0.3, 0.6); }
      const nr = Math.floor(L / 3); for (let i = 0; i < nr; i++) { const t = r(); const c = this.mesh(new THREE.CylinderGeometry(0.03, 0.06, 1.5 + r() * 1.5, 4), M.bark, ax + dx * t + nx * (T / 2 + 0.05) * (r() < 0.5 ? 1 : -1), hv - 0.6 - r(), az + dz * t + nz * (T / 2 + 0.05), 0); c.rotation.z = (r() - 0.5) * 1.2; }
    } else if (style === 'bone') { const n = Math.floor(L / 0.7); const sk = new THREE.SphereGeometry(0.16, 7, 5); for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; for (const sd of [-1, 1]) { if (r() < 0.45) continue; const y = 0.6 + r() * (hv - 1.2); const m = this.mesh(sk.clone(), M.skull, ax + dx * t + nx * sd * (T / 2 - 0.03), y, az + dz * t + nz * sd * (T / 2 - 0.03), ry); m.scale.set(1.05, 1.1, 0.7); /* chunk WORLD: set into the face (was a whole ball 16 cm proud) */ m.castShadow = false; } } }
  }
  /* ---- the world beyond the walls: silhouettes, ridgelines of rock, distant towers ---- */
  outer() {
    const M = this.M, B = this.R.bounds, r = this.rnd;
    for (let i = 0; i < 46; i++) { const side = i % 4, t = r(); let x, z; if (side === 0) { x = B.x0 + (B.x1 - B.x0) * t; z = B.z0 - 6 - r() * 20; } else if (side === 1) { x = B.x0 + (B.x1 - B.x0) * t; z = B.z1 + 6 + r() * 20; } else if (side === 2) { x = B.x0 - 6 - r() * 20; z = B.z0 + (B.z1 - B.z0) * t; } else { x = B.x1 + 6 + r() * 20; z = B.z0 + (B.z1 - B.z0) * t; }
      const s = 6 + r() * 8; const m = this.mesh(new THREE.DodecahedronGeometry(s, 0), M.farsil, x, s * 0.15, z, r() * 6); m.scale.set(1.6, 0.7 + r() * 0.9, 1.6); m.castShadow = false; }
    [[-40, -96, 7, 30], [30, -100, 9, 38], [-80, -20, 8, 26], [84, 10, 7, 30], [-70, 60, 9, 22], [60, 70, 6, 34], [0, 120, 12, 18]].forEach(([x, z, w, h]) => { this.mesh(boxGeo(w, h, w), M.farsil, x, h / 2 - 1, z, 0.3).castShadow = false; this.mesh(new THREE.ConeGeometry(w * 0.75, h * 0.35, 4), M.farsil, x, h - 1 + h * 0.17, z, Math.PI / 4).castShadow = false; });
  }
  /* ---------------- props ---------------- */
  torchAt(x, y, z, o) { const M = this.M; y += this.gy0; const fl = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.48, 6), M.flame); fl.position.set(x, y + 0.3, z); this.dyn.add(fl);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: P1.glowTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffb070 })); halo.scale.set(1.6, 1.6, 1); halo.position.set(x, y + 0.35, z); this.dyn.add(halo);
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), M.glowPool); pool.rotation.x = -Math.PI / 2; pool.position.set(x, this.gy0 + 0.03, z); this.dyn.add(pool);
    const t = { x, y: y + 0.5, z, fl, halo, pool, seed: this.torches.length * 7.3, on: !(o && o.off), lantern: o && o.lantern }; this.torches.push(t); if (!t.on) { fl.visible = halo.visible = pool.visible = false; } return t; }
  p_torch(p) { const M = this.M; this.mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.2, 6), M.darkwood, p.x, 1.1, p.z); this.mesh(new THREE.CylinderGeometry(0.2, 0.11, 0.2, 8), M.iron, p.x, 2.25, p.z); this.torchAt(p.x, 2.25, p.z); this.circle(p.x, p.z, 0.2, { cam: false, sight: false, deco: true }); }
  p_brazier(p) { const M = this.M; this.mesh(new THREE.CylinderGeometry(0.55, 0.35, 0.6, 10), M.iron, p.x, 0.75, p.z); for (let i = 0; i < 3; i++) { const a = i * 2.09; const l = this.mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 4), M.iron, p.x + Math.sin(a) * 0.32, 0.4, p.z + Math.cos(a) * 0.32); l.rotation.z = 0.2; }
    for (let i = 0; i < 5; i++) this.mesh(new THREE.DodecahedronGeometry(0.12, 0), M.ember, p.x + (this.rnd() - 0.5) * 0.5, 1.05, p.z + (this.rnd() - 0.5) * 0.5, 0).castShadow = false;
    const t = this.torchAt(p.x, 0.95, p.z); t.fl.scale.set(2.2, 1.8, 2.2); t.halo.scale.set(3, 3, 1); t.big = true; this.circle(p.x, p.z, 0.6, { h: 1.1, sight: false }); }   // chunk WORLD: collider = the 1.05 m brazier (was h 3: blocked sight + the deathblow camera like a pillar)
  p_gallows(p) { const M = this.M, x = p.x, z = p.z; this.mesh(boxGeo(12.3, 1.6, 5.3, 2), M.wood, x, 0.8, z);   // deck = the 'gallows' platform in region elevation (walkable at 1.6 m, ledges generated)
    for (const sx of [-5.6, -1.9, 1.9, 5.6]) for (const sz of [-2.2, 2.2]) this.mesh(boxGeo(0.25, 1.6, 0.25), M.darkwood, x + sx, 0.8, z + sz);
    for (const sx of [-5.4, 0, 5.4]) { this.mesh(boxGeo(0.35, 5.2, 0.35), M.darkwood, x + sx, 1.6 + 2.6, z + 0.5); this.circle(x + sx, z + 0.5, 0.3, { h: 6.8, cam: false, sight: false }); }   // uprights (round colliders)
    this.mesh(boxGeo(11.6, 0.35, 0.4), M.darkwood, x, 6.6, z + 0.5);
    for (const sx of [-4.6, -3.2, -1.5, 1.2, 2.8, 4.4]) { const len = 1.2 + this.rnd() * 0.6; this.mesh(new THREE.CylinderGeometry(0.025, 0.025, len, 4), M.rope, x + sx, 6.45 - len / 2, z + 0.5);
      const loop = this.mesh(new THREE.TorusGeometry(0.16, 0.025, 4, 10), M.rope, x + sx, 6.45 - len - 0.12, z + 0.5); loop.rotation.y = this.rnd(); }
    { const sx = -1.5; this.mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 4), M.rope, x + sx + 0.4, 6.2, z + 0.5); }   // the broken rope
    // steps: built from the region elevation ('gallows_steps': 8 risers of 0.20 m, 3.0 m wide, rails)
    for (const sx of [-3, 3]) this.mesh(boxGeo(1.4, 0.05, 1.4), M.darkwood, x + sx, 1.62, z + 0.5);   // trapdoors
  }
  p_stand(p) { const M = this.M, x = p.x, z = p.z; this.mesh(boxGeo(10, 2.4, 5, 3), M.stone, x, 1.2, z); this.boxCollider(x, z, 10.2, 5.2, 0, { h: 2.4 });
    this.mesh(boxGeo(1.2, 2.2, 0.9), M.darkwood, x, 3.5, z + 0.8); this.mesh(boxGeo(1.4, 0.3, 1.2), M.redcloth, x, 2.55, z + 0.8);   // the empty chair
    for (const sx of [-4.6, 4.6]) this.mesh(boxGeo(0.3, 4, 0.3), M.darkwood, x + sx, 4.4, z - 2.2); const can = this.mesh(new THREE.PlaneGeometry(9.4, 2.6), M.redcloth, x, 6.2, z - 1.1); can.rotation.x = -1.1; can.castShadow = true; }
  p_block_small(p) { const M = this.M; this.mesh(new THREE.CylinderGeometry(0.5, 0.55, 0.7, 10), M.wood, p.x, 0.35, p.z); this.circle(p.x, p.z, 0.55, { h: 0.7, cam: false }); }
  p_greatblock(p) { const M = this.M; this.mesh(new THREE.CylinderGeometry(1.1, 1.2, 0.9, 12), M.wood, p.x, 0.45, p.z); this.mesh(new THREE.CylinderGeometry(1.6, 1.7, 0.2, 14), M.stone, p.x, 0.1, p.z); this.circle(p.x, p.z, 1.2, { h: 0.9, cam: false, sight: false });
  }   // chunk G2: the flat iron "axe" on a pole is gone (it read as a black flag mid-cutscene; Odran plants his own blade)
  /* chunk G2: tattered banners hung on the inner face of the Block's ring wall, facing the centre. One merged mesh (one draw call), swaying in the
     vertex shader (Low twin: static, same tattered alpha cut). Angles keep clear of the north (behind Odran) and the south opening. */
  p_wallbanners(p) { const N = 24, step = Math.PI * 2 / N, R = p.r || 15, T = 0.9, inner = R * Math.cos(step / 2) - T / 2, items = [];
    for (const a of p.a) { const am = (Math.floor(a / step) + 0.5) * step, rr = inner / Math.cos(a - am) - 0.3;   // 0.3 m off the wall face (the sway stays clear of the stone)
      const o = new THREE.Object3D(); o.position.set(p.x + Math.sin(a) * rr, this.gy0 + 3.3, p.z + Math.cos(a) * rr); o.rotation.y = am + Math.PI; o.updateMatrix(); items.push({ geo: new THREE.PlaneGeometry(1.1, 2.6, 1, 8), m: o.matrix.clone() }); }
    const m = new THREE.Mesh(mergeGeos(items), this.M.bannerSway); m.name = 'wallBanners'; m.castShadow = false; m.receiveShadow = false; m.matrixAutoUpdate = false; m.updateMatrix(); this.dyn.add(m); }
  /* chunk F: place a Quaternius prop (static, merged per chunk per trim material); false until the props GLB is parsed */
  q(name, x, y, z, ry, sc) { const P = !this.lowB && QP.ready && QP.parts[name]; if (!P) return false; const M = this.M;
    for (const part of P) { const m = this.mesh(part.geo, M[part.mat], x, y, z, ry); if (typeof sc === 'number') m.scale.setScalar(sc); else if (sc) m.scale.set(sc[0], sc[1], sc[2]); } return true; }
  /* merge A+F: chunk F's cart mesh (Quaternius stall cart, bed ~0.95 m; procedural fallback bed 1.2 m) carrying chunk A's corpse. The bed height is
     recorded in this.cartBedY so the region's sword pickup (model.bed) rests on the same bed. Carts without a corpse keep F's two shrouds. */
  p_cart(p) { const M = this.M, x = p.x, z = p.z, ry = p.rot || 0, quat = this.q('Stall_Cart_Empty', x, 0, z, ry + Math.PI / 2, 1.15), bed = quat ? 0.95 : 1.2; this.cartBedY = bed;
    if (quat) this.boxCollider(x, z, 1.35, 3.55, ry, { h: 1.2, cam: false });   // chunk F: 3.5 m long along the cart's local z, 1.2 m wide. Collider = that footprint.
    else { this.mesh(boxGeo(1.8, 0.7, 3.2, 1.5), M.wood, x, 0.85, z, ry); for (const s of [-1, 1]) { const wh = this.mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.12, 12), M.darkwood, x + Math.cos(ry) * s * 1.0, 0.55, z - Math.sin(ry) * s * 1.0, ry); wh.rotation.z = Math.PI / 2; wh.rotation.y = ry; }
      const sh = this.mesh(boxGeo(0.12, 0.12, 2.2), M.darkwood, x + Math.sin(ry) * 2.4, 0.5, z + Math.cos(ry) * 2.4, ry); sh.rotation.x = 0.25; this.boxCollider(x, z, 2.0, 3.4, ry, { h: 1.2, cam: false }); }   // chunk F: the procedural cart's own footprint (1.8 x 3.2 box)
    this.keepOut(x, z, 2.2);
    if (p.corpse) { this.p_corpse({ x: x - Math.cos(ry) * 0.2, z: z + Math.sin(ry) * 0.2, y: this.gy0 + bed, rot: ry, pose: 'supine', prio: 1, noShadow: true }); return; }   // chunk A: a body on the cart bed (chunk A2: the sword now stands in the mud beside the cart)
    for (let i = 0; i < 2; i++) { const b = this.mesh(new THREE.CylinderGeometry(0.22, 0.24, 1.6, 7), M.shroud, x + Math.cos(ry) * (i - 0.5) * 0.5 + Math.sin(ry) * 0.5, bed + 0.23, z - Math.sin(ry) * (i - 0.5) * 0.5 + Math.cos(ry) * 0.5, ry); b.rotation.x = Math.PI / 2; } }
  /* ---- corpses: requests are gathered while props build (p_bodies / p_corpse / p_cart / p_gibbets), placed and baked at the end ---- */
  keepOut(x, z, r) { (this.keep || (this.keep = [])).push({ x, z, r }); }
  corpseFits(x, z, ry, box, placed) {
    const hw = box.w / 2 + 0.12, z0 = box.z0 - 0.1, z1 = box.z1 + 0.1, c = Math.cos(ry), s = Math.sin(ry), pts = [];
    for (const u of [-hw, 0, hw]) for (const v of [z0, (z0 + z1) / 2, z1]) pts.push([x + u * c + v * s, z - u * s + v * c]);
    for (const [px, pz] of pts) {
      if (!this.R.zones.some(zn => (zn.rects || []).some(q => px >= q[0] + 0.95 && px <= q[2] - 0.95 && pz >= q[1] + 0.95 && pz <= q[3] - 0.95))) return false;
      for (const k of this.keep || []) if (Math.hypot(px - k.x, pz - k.z) < k.r) return false;
      for (const q of placed) for (const [qx, qz] of q) if (Math.hypot(px - qx, pz - qz) < 0.55) return false; }
    placed.push(pts); return true;
  }
  buildCorpses() {
    const reqs = this.corpses || []; if (!reqs.length) return; const R = this.R;
    if (this.keep0) this.keep = this.keep0.slice(); else this.keep0 = (this.keep || []).slice();   // chunk G2: re-runnable (Region.rebuildCorpses) without piling up keep-outs
    if (R.spawn) this.keepOut(R.spawn.x, R.spawn.z, 1.4); for (const n of R.npcs || []) this.keepOut(n.x, n.z, 1.4); for (const l of R.lanterns || []) this.keepOut(l.x, l.z, 1.3);
    for (const k of R.pickups || []) this.keepOut(k.x, k.z, 0.9); for (const e of R.enemies || []) if (e.x !== undefined) this.keepOut(e.x, e.z, 1.0);
    const T = P1.tier(), budget = T.label === 'Low' ? 9 : 14, can = corpseReady(), r = RNG(77), M = this.M;
    const keys = can ? CORPSE_KEYS.filter(k => window.VEYN_MODELS.has(k)) : [];
    const DEF = { w: 0.62, d: 1.85, z0: -0.92, z1: 0.92 }, LYING = ['prone', 'supine', 'side', 'prone', 'supine', 'side'];
    const items = [], placed = []; let gi = 0, ti = 0;
    // fixed corpses first (cart, walls, gallows, gibbets), then the scattered groups
    const misfit = [];
    for (const q of reqs.filter(q => !q.group)) { const it = Object.assign({ key: keys.length ? keys[(gi++) % keys.length] : null, tint: CORPSE_TINTS[(ti++) % CORPSE_TINTS.length] }, q); items.push(it);
      if (q.check) { let box = DEF; try { const bk = it.key && !CORPSE.failed ? bakeCorpse(it.key, it.pose) : null; if (bk) box = bk.box; } catch (e) { CORPSE.failed = true; }   // chunk G2: placed pit bodies pass the same fit test as scattered ones
        if (!this.corpseFits(it.x, it.z, it.ry, box, placed)) misfit.push([it.x, it.z]); } }
    for (const q of reqs.filter(q => q.group)) for (let i = 0; i < q.n; i++) {
      const pose = LYING[(gi + i) % LYING.length], key = keys.length ? keys[(gi + i) % keys.length] : null; let baked = null; try { baked = key && !CORPSE.failed ? bakeCorpse(key, pose) : null; } catch (e) { CORPSE.failed = true; } const box = baked ? baked.box : DEF;
      for (let tries = 0; tries < 80; tries++) { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * q.r, x = q.x + Math.sin(a) * d, z = q.z + Math.cos(a) * d, ry = r() * Math.PI * 2;
        if (this.corpseFits(x, z, ry, box, placed)) { items.push({ x, z, ry, pose, key, tint: CORPSE_TINTS[(ti++) % CORPSE_TINTS.length], prio: q.prio || 5 }); break; } } }
    gi += 1; items.sort((a, b) => (a.prio || 0) - (b.prio || 0));
    const acc = new Map(), shadow = { pos: [], uv: [], idx: [] }; let posed = 0, fall = 0, tris = 0;
    for (const it of items) {
      let baked = null; if (it.key && posed < budget) { try { baked = bakeCorpse(it.key, it.pose); } catch (e) { console.warn('[Veynhold] corpse bake failed, using shroud', e && e.message); CORPSE.failed = true; } }
      const gy = it.y !== undefined ? it.y : this.ground.y(it.x, it.z), sc = it.scale || 1, c = Math.cos(it.ry), s = Math.sin(it.ry);
      if (!baked) { this.corpseFallback(it, gy); fall++; continue; }
      posed++;
      for (const p of baked.parts) {
        const mat = corpseMat(it.key, p); let A = acc.get(mat); if (!A) acc.set(mat, A = { pos: [], nor: [], uv: [], col: [], idx: [], n: 0 });
        const col = /Cloth|Cape|Scarf/.test(p.name) ? it.tint : p.name === 'Skin' ? [0.66, 0.64, 0.63] : /Armor|Trim/.test(p.name) ? [0.5, 0.48, 0.46] : [1, 1, 1];
        const base = A.n, P = p.pos, N = p.nor;
        for (let i = 0; i < P.length; i += 3) { const lx = P[i] * sc, ly = P[i + 1] * sc - 0.012, lz = P[i + 2] * sc;   // 12 mm into the mud: no hovering, no visible sinking
          A.pos.push(it.x + lx * c + lz * s, gy + ly, it.z - lx * s + lz * c); A.nor.push(N[i] * c + N[i + 2] * s, N[i + 1], -N[i] * s + N[i + 2] * c); A.col.push(col[0], col[1], col[2]); }
        for (let i = 0; i < p.uv.length; i++) A.uv.push(p.uv[i]); for (let i = 0; i < p.idx.length; i++) A.idx.push(p.idx[i] + base); A.n += P.length / 3; tris += p.idx.length / 3; }
      if (!it.noShadow) { const b = baked.box, hw = b.w * sc / 2 + 0.22, z0 = b.z0 * sc - 0.2, z1 = b.z1 * sc + 0.2, v = shadow.pos.length / 3;   // contact shadow quad under the body
        for (const [u, w, tu, tv] of [[-hw, z0, 0, 0], [hw, z0, 1, 0], [hw, z1, 1, 1], [-hw, z1, 0, 1]]) { shadow.pos.push(it.x + u * c + w * s, gy + 0.016, it.z - u * s + w * c); shadow.uv.push(tu, tv); }
        shadow.idx.push(v, v + 2, v + 1, v, v + 3, v + 2); }
    }
    const freeze = m => { m.matrixAutoUpdate = false; m.updateMatrix(); m.updateMatrixWorld(true); this.dyn.add(m); return m; };
    for (const [mat, A] of acc) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(A.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(A.nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(A.uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(A.col, 3)); g.setIndex(A.n > 65535 ? new THREE.Uint32BufferAttribute(A.idx, 1) : new THREE.Uint16BufferAttribute(A.idx, 1)); g.computeBoundingSphere();
      const m = freeze(new THREE.Mesh(g, mat)); m.castShadow = true; m.receiveShadow = true; m.name = 'corpses'; }
    if (shadow.idx.length) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(shadow.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(shadow.pos.map((_, i) => i % 3 === 1 ? 1 : 0), 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(shadow.uv, 2)); g.setIndex(shadow.idx); g.computeBoundingSphere(); const m = freeze(new THREE.Mesh(g, corpseShadowMat())); m.renderOrder = 3; m.name = 'corpseShadows'; }
    if (this.shrouds && this.shrouds.length) { const m = freeze(new THREE.Mesh(mergeGeos(this.shrouds), this.M.shroud)); m.castShadow = true; m.receiveShadow = true; m.name = 'corpseShrouds'; this.shrouds = null; }   // chunk G2: one mesh, removable on rebuild
    this.corpseInfo = { requests: items.length, posed, fallback: fall, tris, draws: acc.size + (shadow.idx.length ? 1 : 0) + (fall ? 1 : 0), budget, models: can, misfit };
  }
  /* cheap fallback: a wrapped shroud (lathe), lying or sitting; merged with the statics */
  corpseFallback(it, gy) {
    const pts = [[0.001, 0], [0.08, 0.03], [0.11, 0.3], [0.14, 0.65], [0.19, 0.98], [0.22, 1.25], [0.19, 1.42], [0.11, 1.5], [0.125, 1.6], [0.12, 1.72], [0.07, 1.8], [0.001, 1.83]].map(([r, y]) => new THREE.Vector2(r, y));
    const g = new THREE.LatheGeometry(pts, 7), sit = it.pose === 'slump' || it.pose === 'huddle', sc = it.scale || 1;
    if (sit) { g.scale(sc * 0.95, sc * 0.62, sc * 0.95); g.rotateX(-0.35); } else { g.rotateX(Math.PI / 2); g.scale(sc, sc * 0.72, sc); g.translate(0, 0, -0.9 * sc); }
    g.rotateY(it.ry); g.computeBoundingBox(); const bb = g.boundingBox; g.translate(0, -bb.min.y - 0.01, 0);
    let ox = 0, oz = 0; if (sit && it.pose === 'slump') { ox = Math.sin(it.ry) * 0.25; oz = Math.cos(it.ry) * 0.25; }
    const o = new THREE.Object3D(); o.position.set(it.x + ox, gy, it.z + oz); o.updateMatrix(); (this.shrouds || (this.shrouds = [])).push({ geo: g, m: o.matrix.clone() });   // chunk G2: gathered, merged into one dyn mesh
  }
  p_bodies(p) { (this.corpses || (this.corpses = [])).push({ group: true, x: p.x, z: p.z, n: p.n, r: p.r, prio: p.prio || 5 }); }
  p_corpse(p) { (this.corpses || (this.corpses = [])).push({ x: p.x, z: p.z, ry: p.rot || 0, pose: p.pose || 'prone', y: p.y, scale: p.scale, prio: p.prio || 2, noShadow: p.noShadow, check: p.check }); if (p.keep) this.keepOut(p.x, p.z, p.keep); }
  p_graves(p) { const M = this.M, r = this.rnd; for (let i = 0; i < p.n; i++) { const x = p.x + (i % 3) * 1.6, z = p.z + Math.floor(i / 3) * 1.8; const s = this.mesh(boxGeo(0.12, 1 + r() * 0.4, 0.12), M.darkwood, x, 0.5, z, 0); s.rotation.z = (r() - 0.5) * 0.3; const th = s.rotation.z, bar = this.mesh(boxGeo(0.6, 0.1, 0.1), M.darkwood, x - Math.sin(th) * 0.35, 0.5 + Math.cos(th) * 0.35, z, 0); bar.rotation.z = th;   // chunk WORLD: the crossbar leans with its post (it stayed level and slid off the tilted ones)
      (this.graveBars || (this.graveBars = [])).push({ x: x - Math.sin(th) * 0.35, y: this.gy0 + 0.5 + Math.cos(th) * 0.35 + 0.05, z, th });
      const m = this.mesh(boxGeo(0.9, 0.25, 1.6, 2), M.mud, x, 0.1, z - 0.9, 0); m.castShadow = false; this.keepOut(x, z - 0.9, 0.9); this.keepOut(x, z, 0.4); this.circle(x, z, 0.12, { h: 1.2, cam: false, sight: false, deco: true }); } }   // chunk WORLD: marker collider
  p_shovel(p) { const M = this.M; const s = this.mesh(boxGeo(0.05, 1.4, 0.05), M.darkwood, p.x, 0.75, p.z, 0); s.rotation.z = 0.25; this.mesh(boxGeo(0.25, 0.32, 0.03), M.iron, p.x - 0.2, 0.1, p.z, 0); this.keepOut(p.x - 0.1, p.z, 0.6); }
  p_lamp(p) { const M = this.M; this.mesh(new THREE.CylinderGeometry(0.03, 0.04, 1.3, 5), M.iron, p.x, 0.65, p.z); this.mesh(boxGeo(0.2, 0.28, 0.2), M.iron, p.x, 1.4, p.z); this.torchAt(p.x, 1.1, p.z).fl.scale.set(0.5, 0.5, 0.5); this.keepOut(p.x, p.z, 0.5); }
  p_deadtree(p) { const M = this.M, r = RNG((p.x * 13 + p.z * 7) | 0 || 3), up = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion();
    const br = (p0, dir, len, rad, depth) => { const p1 = p0.clone().addScaledVector(dir, len); const c = this.mesh(new THREE.CylinderGeometry(rad * 0.68, rad, len, 5, 1), M.bark, 0, 0, 0); c.position.copy(p0).add(p1).multiplyScalar(0.5); c.quaternion.copy(q.setFromUnitVectors(up, dir));
      if (depth <= 0) return; for (let k = 0; k < 2 + (r() < 0.3 ? 1 : 0); k++) { const d = dir.clone(); d.applyAxisAngle(new THREE.Vector3(r() - 0.5, 0, r() - 0.5).normalize(), 0.35 + r() * 0.6); d.y += 0.1; d.normalize(); br(p1, d, len * (0.62 + r() * 0.2), rad * 0.62, depth - 1); } };
    br(new THREE.Vector3(p.x, -0.2, p.z), new THREE.Vector3((r() - 0.5) * 0.2, 1, (r() - 0.5) * 0.2).normalize(), (p.h || 7) * 0.38, 0.22 + (p.h || 7) * 0.012, 4); this.circle(p.x, p.z, 0.35); this.keepOut(p.x, p.z, 1.0); }
  p_pines(p) { const M = this.M, r = this.rnd; for (let i = 0; i < p.n; i++) { const x = p.x + (r() - 0.5) * p.r * 2.4, z = p.z + (r() - 0.5) * p.r, h = 9 + r() * 9; this.mesh(new THREE.CylinderGeometry(0.2, 0.3, h * 0.4, 5), M.bark, x, h * 0.2, z).castShadow = false;
      for (let k = 0; k < 3; k++) this.mesh(new THREE.ConeGeometry(h * (0.28 - k * 0.06), h * 0.42, 6), M.pine, x, h * (0.35 + k * 0.2), z, r() * 3).castShadow = false; } }
  p_crates(p) { const M = this.M, r = this.rnd; for (let i = 0; i < p.n; i++) { const s = 0.7 + r() * 0.4, x = p.x + (i % 2) * 1.1 + (r() - 0.5) * 0.2, z = p.z + Math.floor(i / 2) * 1.1, y = s / 2 + (i === p.n - 1 && p.n > 2 ? 0 : 0), ry = r() * 0.5;
      if (!this.q('Crate_Wooden', x, 0, z, ry, s / 0.9)) this.mesh(boxGeo(s, s, s, 1), M.wood, x, y, z, ry); this.circle(x, z, s * 0.6, { h: s, cam: false }); } }   // chunk F: Quaternius crate (0.9 m) scaled to the same size
  p_barrels(p) { const M = this.M, r = this.rnd; for (let i = 0; i < p.n; i++) { const x = p.x + (i % 3) * 0.9, z = p.z + Math.floor(i / 3) * 0.9, ry = r();
      if (!this.q('Barrel', x, 0, z, ry, 1.1)) { this.mesh(new THREE.CylinderGeometry(0.38, 0.34, 1, 10), M.wood, x, 0.5, z, ry); this.mesh(new THREE.TorusGeometry(0.38, 0.025, 4, 12), M.iron, x, 0.75, z, 0).rotation.x = Math.PI / 2; } this.circle(x, z, 0.42, { h: 1, cam: false }); } }   // chunk F: Quaternius barrel, 0.77 x 1.0 m
  /* chunk F: a gibbet post with a hanging iron cage (Gallows Yard). Post + arm are scenery wood; the cage is the Quaternius Cage_Small x2.1
     (1.8 m wide, 1.6 m tall) on a rope, its floor 0.7 m up, so it blocks like the solid thing it looks like. */
  p_hangcage(p) { const M = this.M, x = p.x, z = p.z, ry = p.rot || 0, ax = x + Math.cos(ry) * 1.7, az = z - Math.sin(ry) * 1.7;
    this.mesh(boxGeo(0.28, 4.4, 0.28, 2), M.darkwood, x, 2.2, z); const arm = this.mesh(boxGeo(2.1, 0.2, 0.2), M.darkwood, (x + ax) / 2 + Math.cos(ry) * 0.1, 4.25, (z + az) / 2 - Math.sin(ry) * 0.1, ry);
    const br = this.mesh(boxGeo(0.12, 1.1, 0.12), M.darkwood, x + Math.cos(ry) * 0.42, 3.8, z - Math.sin(ry) * 0.42, ry); br.rotation.z = -0.78;
    const top = 0.7 + 1.62; this.mesh(new THREE.CylinderGeometry(0.025, 0.025, 4.15 - top, 4), M.rope, ax, (4.15 + top) / 2, az);
    if (!this.q('Cage_Small', ax, 0.7, az, ry + 0.3, 2.1)) { for (let i = 0; i < 10; i++) { const a = i / 10 * 6.28; this.mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.6, 4), M.iron, ax + Math.sin(a) * 0.85, 1.5, az + Math.cos(a) * 0.85); }
      for (const y of [0.72, 2.3]) this.mesh(new THREE.TorusGeometry(0.85, 0.03, 4, 14), M.iron, ax, y, az).rotation.x = Math.PI / 2; }
    this.circle(x, z, 0.3, { h: 4.4, cam: false, sight: false }); this.circle(ax, az, 0.95, { h: 2.4, cam: false, sight: false }); }
  /* chunk F: chain coils dropped on the ground (9 cm high: walked over, so no collider) */
  p_chains(p) { const r = this.rnd; for (let i = 0; i < (p.n || 1); i++) { const x = p.x + (r() - 0.5) * 1.2 * (i ? 1 : 0), z = p.z + (r() - 0.5) * 1.2 * (i ? 1 : 0), ry = r() * 6.28;
      if (!this.q('Chain_Coil', x, 0.01, z, ry, 1.3)) for (let k = 0; k < 3; k++) this.mesh(new THREE.TorusGeometry(0.14, 0.03, 4, 8), this.M.iron, x + (k - 1) * 0.2, 0.03, z, 0).rotation.x = Math.PI / 2; } }
  p_tent(p) { const M = this.M, x = p.x, z = p.z, ry = p.rot || 0; const g = new THREE.CylinderGeometry(0.01, 2.6, 3, 4, 1, true); const m = this.mesh(g, M.cloth, x, 1.5, z, ry + Math.PI / 4); m.scale.set(1.3, 1, 1); this.mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.6, 5), M.darkwood, x, 1.8, z); this.circle(x, z, 2.4, { h: 3 }); }
  p_desk(p) { const M = this.M; this.mesh(boxGeo(1.6, 0.9, 0.8, 1), M.wood, p.x, 0.45, p.z); this.mesh(boxGeo(0.4, 0.02, 0.3), M.wax, p.x - 0.3, 0.91, p.z); this.circle(p.x, p.z, 0.8, { h: 0.9, cam: false }); }
  p_rack(p) { const M = this.M; for (const sx of [-1.05, 1.05]) this.mesh(boxGeo(0.12, 1.5, 0.3), M.darkwood, p.x + sx, 0.75, p.z);   /* chunk WORLD: end posts (the rails used to hang in the air) */ this.mesh(boxGeo(2, 0.12, 0.3), M.darkwood, p.x, 1.4, p.z); this.mesh(boxGeo(2, 0.12, 0.3), M.darkwood, p.x, 0.3, p.z); for (let i = 0; i < 5; i++) { const s = this.mesh(boxGeo(0.05, 1.6, 0.05), M.iron, p.x - 0.8 + i * 0.4, 0.9, p.z, 0); s.rotation.z = 0.08; } this.circle(p.x, p.z, 0.8, { h: 1.5, cam: false }); }
  p_dummy(p) { const M = this.M; this.mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.9, 6), M.darkwood, p.x, 0.95, p.z); this.mesh(boxGeo(1.2, 0.12, 0.12), M.darkwood, p.x, 1.5, p.z); this.mesh(new THREE.SphereGeometry(0.22, 7, 5), M.shroud, p.x, 2.05, p.z); this.mesh(new THREE.CylinderGeometry(0.28, 0.25, 0.7, 7), M.shroud, p.x, 1.35, p.z); this.circle(p.x, p.z, 0.35, { cam: false }); }
  p_cage(p) { const M = this.M, x = p.x, z = p.z; this.mesh(boxGeo(0.3, 6, 0.3), M.darkwood, x - 2, 3, z + 1.6); this.mesh(boxGeo(2.6, 0.3, 0.3), M.darkwood, x - 0.8, 5.9, z + 1.6);
    const n = 12; for (let i = 0; i < n; i++) { if (i >= 8 && i <= 10) continue; const a = i / n * 6.28; this.mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.2, 4), M.iron, x + Math.sin(a) * 0.75, 1.15, z + Math.cos(a) * 0.75); }
    for (const y of [0.05, 2.25]) this.mesh(new THREE.TorusGeometry(0.75, 0.035, 4, 16), M.iron, x, y, z).rotation.x = Math.PI / 2; this.mesh(new THREE.CylinderGeometry(0.02, 0.02, 3.6, 4), M.iron, x, 4.1, z);
    /* chunk G3: a hinged door on the west side (bars 8-10), hung on bar 11 (north-west); a dynamic group so the Cage scene can swing it (rotation.y 0 -> 2.3 = open, folded back to the north) */
    const ring = i => [Math.sin(i / n * 6.28) * 0.75, Math.cos(i / n * 6.28) * 0.75], hp = ring(11), piv = new THREE.Group(); piv.position.set(x + hp[0], this.gy0 || 0, z + hp[1]);
    const add = (geo, px, py, pz, ry) => { const m = new THREE.Mesh(geo, M.iron); m.position.set(px, py, pz); if (ry !== undefined) m.rotation.y = ry; m.castShadow = true; piv.add(m); };
    for (let i = 8; i <= 10; i++) { const q = ring(i); add(new THREE.CylinderGeometry(0.022, 0.022, 2.14, 4), q[0] - hp[0], 1.15, q[1] - hp[1]); }
    for (let i = 7; i <= 10; i++) { const a = ring(i), b = ring(i + 1), mx = (a[0] + b[0]) / 2 - hp[0], mz = (a[1] + b[1]) / 2 - hp[1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), ry = Math.atan2(-(b[1] - a[1]), b[0] - a[0]);
      for (const y of [0.4, 1.9]) add(new THREE.BoxGeometry(L, 0.06, 0.03), mx, y, mz, ry); }
    { const q = ring(7.2); add(new THREE.BoxGeometry(0.08, 0.16, 0.08), q[0] - hp[0], 1.15, q[1] - hp[1]); }   // the lock plate on the free edge
    A.mergeChildren(piv); this.dyn.add(piv);
    this.cageObj = { x, z, door: piv }; this.circle(x, z, 0.85, { h: 2.4, cam: false, sight: false }); }
  p_wagon(p) { const M = this.M, x = p.x, z = p.z, ry = p.rot || 0; this.mesh(boxGeo(3.4, 0.6, 1.6, 1.5), M.wood, x, 0.75, z, ry); for (const s of [-1, 1]) for (const f of [-1, 1]) { const wh = this.mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.1, 10), M.darkwood, x + Math.cos(ry) * f * 1.2 - Math.sin(ry) * s * 0.85, 0.45, z - Math.sin(ry) * f * 1.2 - Math.cos(ry) * s * 0.85, 0); wh.rotation.set(Math.PI / 2, 0, -ry); }
    this.mesh(boxGeo(0.7, 0.6, 0.7, 1), M.wood, x, 1.35, z, ry + 0.3); this.boxCollider(x, z, 3.4, 1.7, ry, { h: 1.05, low: true, cam: false, sight: false }); }   // chunk WORLD: wagons had no collider (walked through); low = vault it with Space, as the pen hint says
  p_gibbets(p) { const M = this.M; this.mesh(boxGeo(0.25, 5, 0.25), M.darkwood, p.x, 2.5, p.z); this.mesh(boxGeo(2, 0.2, 0.2), M.darkwood, p.x + 0.9, 4.9, p.z); const b = this.mesh(new THREE.CylinderGeometry(0.4, 0.35, 1.6, 8, 1, true), M.iron, p.x + 1.6, 3.4, p.z); b.material = M.iron;
    this.mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.03, 8), M.iron, p.x + 1.6, 2.615, p.z);   // floor plate of the cage
    if (!this.lowB) this.p_corpse({ x: p.x + 1.6, z: p.z, y: this.gy0 + 2.63, rot: Math.PI / 2, pose: 'huddle', scale: 0.78, prio: 6, noShadow: true }); this.circle(p.x, p.z, 0.3); }
  p_leverhouse(p) { const M = this.M; this.mesh(boxGeo(2.4, 3.2, 2.2, 3), M.stone, p.x + 1.2, 1.6, p.z + 0.3); this.boxCollider(p.x + 1.2, p.z + 0.3, 2.4, 2.2, 0, { h: 3.2 }); this.mesh(boxGeo(2.8, 0.2, 2.6), M.darkwood, p.x + 1.2, 3.3, p.z + 0.3); }
  p_banner(p) { const b = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 4, 1, 6), this.M.banner); b.position.set(p.x, 4.4, p.z); b.rotation.y = p.rot || 0; b.castShadow = true; this.S(b); }
  p_rubble(p) { const M = this.M, r = this.rnd; for (let i = 0; i < 10; i++) this.mesh(new THREE.DodecahedronGeometry(0.2 + r() * 0.4, 0), M.stone, p.x + (r() - 0.5) * 2.5, 0.15, p.z + (r() - 0.5) * 4, r() * 6); }
  p_tower(p) { const M = this.M, h = p.h || 12; this.mesh(boxGeo(3.6, h, 3.6, 3.2), M.stone, p.x, h / 2, p.z); for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; this.mesh(boxGeo(0.8, 0.8, 0.8, 3.2), M.stone, p.x + Math.sin(a) * 1.5, h + 0.4, p.z + Math.cos(a) * 1.5); }
    const win = this.mesh(boxGeo(0.4, 0.9, 3.7), new THREE.MeshBasicMaterial({ color: 0x1a0d06 }), p.x, h * 0.7, p.z); win.castShadow = false; this.circle(p.x, p.z, 2.3, { h }); }
  p_cellstuff(p) { const M = this.M; this.mesh(boxGeo(1.6, 0.4, 0.8, 1), M.wood, p.x, 0.2, p.z - 1); this.mesh(new THREE.CylinderGeometry(0.2, 0.18, 0.35, 8), M.iron, p.x + 1, 0.17, p.z + 0.5); for (let i = 0; i < 3; i++) this.mesh(new THREE.TorusGeometry(0.1, 0.02, 4, 8), M.iron, p.x - 1.2, 1.4 - i * 0.25, p.z - 2.4); }
  p_brokenbars(p) { const M = this.M; for (let i = 0; i < 4; i++) { const b = this.mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.4, 4), M.iron, p.x + (i - 1.5) * 0.4, 0.1, p.z - 0.6 - i * 0.2); b.rotation.z = Math.PI / 2; b.rotation.y = i; } }
  p_bonepile(p) { const M = this.M, r = this.rnd; const mh = 0.55, mound = this.mesh(new THREE.SphereGeometry(1.5, 14, 5, 0, Math.PI * 2, 0, Math.PI / 2), M.bonef, p.x, -0.02, p.z, 0); mound.scale.y = mh / 1.5; mound.castShadow = false;   // chunk WORLD: a mound of bone dust under the pile
    for (let i = 0; i < 26; i++) { const a = r() * 6.28, d = r() * 1.5, y = (1.5 - d) * 0.6 * r(); void y; const sy = mh * Math.sqrt(Math.max(0, 1 - (d / 1.5) ** 2)); this.mesh(new THREE.SphereGeometry(0.15, 6, 4), M.skull, p.x + Math.sin(a) * d, sy + 0.06, p.z + Math.cos(a) * d, 0).castShadow = false; }   // skulls rest on the mound surface (half sunk)
    for (let i = 0; i < 14; i++) { const bx = p.x + (r() - 0.5) * 2.4, bz = p.z + (r() - 0.5) * 2.4, bd = Math.hypot(bx - p.x, bz - p.z), c = this.mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 4), M.skull, bx, mh * Math.sqrt(Math.max(0, 1 - (Math.min(bd, 1.5) / 1.5) ** 2)) + 0.02, bz, 0); c.rotation.z = Math.PI / 2; c.rotation.y = r() * 6; c.castShadow = false; } this.circle(p.x, p.z, 1.3, { h: 1, cam: false }); }
  p_candles(p) { const M = this.M, r = this.rnd, sp = p.s || 1.4, y0 = p.y || 0; for (let i = 0; i < 9; i++) { const x = p.x + (r() - 0.5) * sp, z = p.z + (r() - 0.5) * sp, h = 0.15 + r() * 0.35; this.mesh(new THREE.CylinderGeometry(0.04, 0.045, h, 6), M.wax, x, y0 + h / 2, z, 0).castShadow = false; this.mesh(new THREE.ConeGeometry(0.025, 0.07, 4), M.flame, x, y0 + h + 0.04, z, 0).castShadow = false; }   // chunk WORLD: p.s spread, p.y base height
    const t = this.torchAt(p.x, y0, p.z); t.fl.visible = false; t.halo.scale.set(2.4, 2.4, 1); t.halo.position.y = 0.5; t.candle = true; }
  p_altar(p) { const M = this.M; this.mesh(boxGeo(1.4, 1, 2.2, 1.5), M.stone, p.x, 0.5, p.z); this.mesh(boxGeo(1.6, 0.08, 2.4), M.redcloth, p.x, 1.02, p.z); this.boxCollider(p.x, p.z, 1.5, 2.3, 0, { h: 1, cam: false }); }
  p_belltower(p) { const M = this.M; this.mesh(boxGeo(4, 18, 4, 2.2), M.bone, p.x, 9, p.z); this.mesh(new THREE.ConeGeometry(3.2, 5, 4), M.far, p.x, 20.5, p.z, Math.PI / 4); const bell = this.mesh(new THREE.CylinderGeometry(0.5, 1, 1.4, 10, 1, true), M.rust, p.x, 15.5, p.z - 2.1); bell.material = M.rust; }
  p_skullwall(p) { const M = this.M; for (let i = 0; i < 60; i++) { const row = Math.floor(i / 15); this.mesh(new THREE.SphereGeometry(0.16, 6, 4), M.skull, p.x + (i % 15 - 7) * 0.4 + (row % 2) * 0.2, 0.15 + row * 0.29, p.z + (p.off !== undefined ? p.off : 0.1), 0).castShadow = false; } }   // chunk WORLD: stacked from the ground against the wall face (rows floated 0.34 m up, 9 cm proud of the stone)
  p_statue(p) { const M = this.M; this.mesh(boxGeo(1.6, 1.4, 1.6, 2), M.stone, p.x, 0.7, p.z); const b = this.mesh(new THREE.CylinderGeometry(0.45, 0.6, 3, 8), M.stone, p.x, 2.9, p.z); this.mesh(new THREE.SphereGeometry(0.35, 8, 6), M.stone, p.x, 4.7, p.z); /* chunk G2: the 3.4 m iron bar beside it read as a pole in the cutscene */ this.circle(p.x, p.z, 1.1, { h: 4 }); }
  p_notice(p) { const M = this.M, x = p.x, z = p.z, ry = p.rot || 0, sx = Math.sin(ry), cz = Math.cos(ry);   /* chunk C: a stake driven into the mud with a posted order (the Gaol Key clue) */
    const paper = M._paper || (M._paper = new THREE.MeshStandardMaterial({ color: 0xd8c8a0, roughness: 1, metalness: 0, emissive: 0x1a140a }));
    this.mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.5, 5), M.darkwood, x, 0.75, z, ry); this.mesh(boxGeo(0.62, 0.46, 0.05), M.wood, x + sx * 0.06, 1.25, z + cz * 0.06, ry);
    const sh = this.mesh(new THREE.PlaneGeometry(0.42, 0.32), paper, x + sx * 0.09, 1.25, z + cz * 0.09, ry); sh.rotation.z = 0.06; sh.castShadow = false; this.circle(x, z, 0.12, { h: 1.5, cam: false, sight: false, deco: true }); }
  p_papers(p) { const M = this.M; this.mesh(boxGeo(0.9, 0.8, 0.6, 1), M.wood, p.x, 0.4, p.z + 0.4); this.circle(p.x, p.z + 0.4, 0.5, { h: 0.8, cam: false }); }
  p_greatgate(p) { const M = this.M; for (const s of [-1, 1]) this.mesh(boxGeo(2.2, 11, 2.2, 3.2), M.stone, p.x + s * 5, 5.5, p.z); this.mesh(boxGeo(12, 2.2, 2.4, 3.2), M.stone, p.x, 10.4, p.z); }
  /* ---- chunk A2: story set dressing for the Corpse Pit and the Gallows Yard. Everything static is baked into the merged statics
     (existing materials, so it rides the chunk draw calls already there); the writ adds one small canvas material, each crow one mesh. ---- */
  dressGroup(x, z, ry, build, tilt) {   // build a small object in a local frame, then queue each part (world matrix + its material's colour) for the per-set bake
    const g = new THREE.Group(); build(g); g.position.set(x, this.ground.y(x, z), z); g.rotation.set(tilt ? tilt[0] : 0, ry || 0, tilt ? tilt[1] : 0); g.updateMatrixWorld(true);
    const q = this.dressQ || (this.dressQ = []); for (const c of g.children) q.push({ geo: c.geometry, m: c.matrixWorld.clone(), mat: c.material }); this.dressN = (this.dressN || 0) + g.children.length; }
  /* one draw call per set: every queued part is merged into a single vertex-coloured mesh (untextured, no shadow casting); the writ's paper keeps its canvas material */
  dressFlush(name) { const q = this.dressQ || []; this.dressQ = []; if (!q.length) return;
    const plain = q.filter(it => it.mat !== WRIT_MAT), paper = q.filter(it => it.mat === WRIT_MAT), cols = [];
    for (const it of plain) { const c = it.mat.color || new THREE.Color(0x808080), k = it.mat.map ? 0.62 : 1; for (let i = 0; i < it.geo.attributes.position.count; i++) cols.push(c.r * k, c.g * k, c.b * k); }
    const geo = A.mergeGeos(plain.map(it => ({ geo: it.geo, m: it.m }))); geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const add = (g, mat) => { const m = new THREE.Mesh(g, mat); m.name = 'dress_' + name; m.castShadow = false; m.receiveShadow = true; m.matrixAutoUpdate = false; m.updateMatrix(); this.dyn.add(m); return m; };
    add(geo, dressMat()); if (paper.length) add(A.mergeGeos(paper.map(it => ({ geo: it.geo, m: it.m }))), WRIT_MAT); }
  dpart(g, geo, mat, x, y, z, rx, ry, rz, cast) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx || 0, ry || 0, rz || 0); m.castShadow = !!cast; g.add(m); return m; }
  /* spent rope: a cut noose lying slack (loop + tail + frayed end) */
  dressRope(g, pts, r) { const up = new THREE.Vector3(0, 1, 0), a = new THREE.Vector3(), b = new THREE.Vector3();   // a slack rope through a polyline (joints overlap: no gaps)
    for (let i = 0; i < pts.length - 1; i++) { a.set(pts[i][0], r, pts[i][1]); b.set(pts[i + 1][0], r, pts[i + 1][1]); const L = a.distanceTo(b) + r * 1.5, m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, 5), this.M.rope);
      m.position.copy(a).add(b).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(up, b.clone().sub(a).normalize()); g.add(m); } }
  /* spent rope: a cut noose lying slack (loop, knot, a wandering tail, a frayed end) */
  dressNoose(x, z, ry) { const M = this.M; this.dressGroup(x, z, ry, g => { this.dpart(g, new THREE.TorusGeometry(0.17, 0.03, 4, 12), M.rope, 0, 0.03, 0, Math.PI / 2, 0, 0);
      this.dpart(g, new THREE.CylinderGeometry(0.042, 0.042, 0.17, 6), M.rope, 0.24, 0.042, 0, 0, 0, Math.PI / 2);   // the knot
      this.dressRope(g, [[0.3, 0], [0.62, 0.1], [0.95, 0.06], [1.22, -0.12], [1.45, -0.16]], 0.026);
      this.dpart(g, new THREE.ConeGeometry(0.045, 0.1, 5), M.rope, 1.5, 0.03, -0.17, 0, 0, -Math.PI / 2); }); }   // frayed end
  dressCoil(x, z) { const M = this.M; this.dressGroup(x, z, 0, g => { for (let k = 0; k < 4; k++) this.dpart(g, new THREE.TorusGeometry(0.24 - k * 0.012, 0.028, 4, 12), M.rope, (k % 2) * 0.02, 0.028 + k * 0.05, 0, Math.PI / 2, 0, 0);
      this.dpart(g, new THREE.CylinderGeometry(0.024, 0.024, 0.6, 4), M.rope, 0.45, 0.025, 0.12, 0, 0.4, Math.PI / 2); }); }
  dressStool(x, z, ry) { const M = this.M; this.dressGroup(x, z, ry, g => {   // a three-legged stool knocked onto its side (the drop)
      this.dpart(g, new THREE.CylinderGeometry(0.21, 0.21, 0.06, 10), M.wood, 0, 0.21, 0.24, Math.PI / 2 + 0.08, 0, 0, true);
      for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2 + 0.3, lx = Math.cos(a) * 0.13, ly = 0.21 + Math.sin(a) * 0.13; const l = this.dpart(g, new THREE.CylinderGeometry(0.022, 0.026, 0.46, 5), M.darkwood, lx * 1.25, ly + (ly - 0.21) * 0.25, 0.0, Math.PI / 2, 0, 0, true); l.rotation.z = -(lx) * 0.6; } }); }
  dressBoot(x, z, ry, side) { const M = this.M; this.dressGroup(x, z, ry, g => { this.dpart(g, A.boxGeo(0.11, 0.07, 0.27), M.darkwood, 0, 0.035, 0.03); this.dpart(g, new THREE.CylinderGeometry(0.06, 0.065, 0.2, 7), M.darkwood, 0, 0.14, -0.06); }, side ? [0, Math.PI / 2] : null); }
  dressHat(x, z, ry) { const M = this.M; this.dressGroup(x, z, ry, g => { this.dpart(g, new THREE.CylinderGeometry(0.2, 0.21, 0.02, 12), M.cloth, 0, 0.012, 0); this.dpart(g, new THREE.CylinderGeometry(0.1, 0.12, 0.12, 10), M.cloth, 0.02, 0.07, 0, 0, 0, 0.12); }, [0.1, -0.08]); }
  dressBundle(x, z, ry) { const M = this.M; this.dressGroup(x, z, ry, g => { const b = this.dpart(g, new THREE.SphereGeometry(0.2, 8, 6), M.cloth, 0, 0.11, 0); b.scale.set(1.15, 0.6, 0.9); const k = this.dpart(g, new THREE.SphereGeometry(0.06, 6, 4), M.cloth, 0.02, 0.22, 0); k.scale.set(1.3, 0.8, 1);
      this.dpart(g, new THREE.CylinderGeometry(0.012, 0.012, 0.3, 4), M.rope, 0.05, 0.2, 0.0, 0.2, 0, 1.2); }); }
  dressCup(x, z, ry) { const M = this.M; this.dressGroup(x, z, ry, g => { this.dpart(g, new THREE.CylinderGeometry(0.045, 0.04, 0.1, 8, 1, true), M.iron, 0, 0.045, 0, Math.PI / 2, 0, 0); }); }
  dressBucket(x, z, ry) { const M = this.M; this.dressGroup(x, z, ry, g => {   // a tipped bucket of lime and its spill
      this.dpart(g, new THREE.CylinderGeometry(0.2, 0.16, 0.36, 9, 1, true), M.wood, 0, 0.19, 0, Math.PI / 2 - 0.12, 0, 0, true); this.dpart(g, new THREE.TorusGeometry(0.19, 0.012, 3, 10), M.iron, 0, 0.19, 0.1, 0, 0, 0);
      const sp = this.dpart(g, new THREE.CircleGeometry(0.42, 9), M.wax, 0, 0.012, 0.42, -Math.PI / 2, 0, 0); sp.scale.set(1, 1.5, 1); }); }
  dressWrit(x, z, ry) { const M = this.M;   // a notice post with the posted writ of execution (and a torn older one)
    this.dressGroup(x, z, ry, g => { this.dpart(g, A.boxGeo(0.11, 2.15, 0.11), M.darkwood, 0, 1.06, 0, 0, 0, 0.02, true); this.dpart(g, A.boxGeo(0.86, 0.72, 0.05, 1.5), M.wood, 0, 1.62, -0.07, 0, 0, 0, true);
      this.dpart(g, A.boxGeo(0.95, 0.06, 0.12), M.darkwood, 0, 2.02, -0.06);   // drip cap
      const w = this.dpart(g, new THREE.PlaneGeometry(0.46, 0.6), writMat(), -0.12, 1.6, -0.1, 0, Math.PI, 0.03); w.castShadow = false;
      const t = this.dpart(g, new THREE.PlaneGeometry(0.2, 0.24), M.wax, 0.26, 1.72, -0.098, 0, Math.PI, -0.12); t.castShadow = false;
      for (const [nx, ny] of [[-0.12, 1.88], [0.26, 1.82]]) this.dpart(g, new THREE.SphereGeometry(0.013, 4, 3), M.iron, nx, ny, -0.11); });   // nails
    this.circle(x, z, 0.14, { h: 2.2, cam: false, sight: false, deco: true }); }
  crowAt(x, y, z, ry, o) { const m = new THREE.Mesh(crowGeo(), crowMat()); m.position.set(x, y, z); m.rotation.y = ry || 0; m.castShadow = false; m.receiveShadow = false; this.dyn.add(m);
    (this.crows || (this.crows = [])).push(Object.assign({ m, x, y, z, ry: ry || 0, ph: x * 1.7 + z, look: ry || 0, t: 0, fly: -1, scare: 3.2 }, o || {})); return m; }
  p_dress(p) {
    const r = RNG(p.seed || 31);
    if (p.set === 'gallows') {   // the Long Gallows at (0,-36): deck y 1.6, x -6.15..6.15, z -38.65..-33.35, nooses on z -35.5, steps x -1.5..1.5 in front
      this.dressStool(2.55, -36.2, 0.4);                 // kicked over under the noose
      this.dressStool(-4.35, -34.6, 2.1);
      this.dressCoil(-0.4, -34.3);                       // spare rope on the deck
      this.dressNoose(-2.4, -40.2, 0.35); this.dressNoose(3.3, -39.5, 2.6);   // cut down and dropped in the yard
      this.dressBoot(-3.15, -35.9, 0.7, true);            // a boot left on the drop
      this.dressBoot(-4.7, -40.6, 1.9, false); this.dressBoot(-4.35, -41.0, 2.6, true);
      this.dressHat(4.5, -40.4, 0.8); this.dressBundle(5.6, -39.6, 0.2); this.dressCup(-0.9, -37.9, 1.1); this.dressCup(2.3, -42.2, 0.3);
      this.dressWrit(-2.55, -41.75, -0.12);
      this.crowAt(4.9, 6.79, -35.5, -1.9, { bob: 1 });    // on the gallows beam
    } else if (p.set === 'pit') {   // the Corpse Pit: what the dead came with
      this.dressNoose(3.0, -75.9, 0.9); this.dressNoose(-4.6, -64.4, 2.2);
      this.dressBoot(-3.2, -76.6, 0.4, true); this.dressBoot(6.6, -66.9, 1.4, false);
      this.dressHat(-7.3, -62.9, 2.0); this.dressBundle(7.0, -76.6, 1.0); this.dressCup(1.9, -76.9, 0.4);
      this.dressBucket(-7.6, -71.6, 1.2);
      for (const [x, z, rr] of [[3.0, -75.9, 1.2], [-4.6, -64.4, 1.2], [-3.2, -76.6, 0.5], [6.6, -66.9, 0.5], [-7.3, -62.9, 0.5], [7.0, -76.6, 0.6], [1.9, -76.9, 0.4], [-7.6, -71.6, 0.8]]) this.keepOut(x, z, rr);
      { const gb = this.graveBars && this.graveBars[1], cx = gb ? gb.x + Math.cos(gb.th) * 0.15 : -4.25, cy = gb ? gb.y + Math.sin(gb.th) * 0.15 - 0.02 : this.ground.y(-4.4, -75) + 0.93; this.crowAt(cx, cy, -75, 0.9, { bob: 1 }); }   // chunk WORLD: perched on the (now leaning) crossbar   // on a grave marker's crossbar
    }
    this.dressFlush(p.set); void r; }
}
A.Corpses = { ready: corpseReady, bake: bakeCorpse, mat: corpseMat, POSES: CORPSE_POSES, KEYS: CORPSE_KEYS, cache: CORPSE.cache };   // debug / tests
A.Builder = Builder; A.mats = mats; A.boxGeo = boxGeo; A.CHUNK = CHUNK;
loadProps();   // chunk F: parse the props GLB at page start, long before New Journey builds the region

/* geometry merge: [{ geo, m (Matrix4) }] -> one indexed BufferGeometry (position / normal / uv), geometries disposed */
const _v = new THREE.Vector3(), _nm = new THREE.Matrix3();
function mergeGeos(items) {
  let nv = 0, ni = 0; for (const { geo: g } of items) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni); let vo = 0, io = 0;
  for (const { geo: g, m: mw } of items) { const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv; _nm.getNormalMatrix(mw);
    for (let i = 0; i < P.count; i++) { _v.fromBufferAttribute(P, i).applyMatrix4(mw); pos[(vo + i) * 3] = _v.x; pos[(vo + i) * 3 + 1] = _v.y; pos[(vo + i) * 3 + 2] = _v.z; if (N) { _v.fromBufferAttribute(N, i).applyMatrix3(_nm).normalize(); nor[(vo + i) * 3] = _v.x; nor[(vo + i) * 3 + 1] = _v.y; nor[(vo + i) * 3 + 2] = _v.z; } if (U) { uv[(vo + i) * 2] = U.getX(i); uv[(vo + i) * 2 + 1] = U.getY(i); } }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx[io++] = g.index.getX(i) + vo; else for (let i = 0; i < P.count; i++) idx[io++] = i + vo; vo += P.count; g.dispose(); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(new THREE.BufferAttribute(idx, 1)); geo.computeBoundingSphere(); return geo;
}
A.mergeGeos = mergeGeos;
/* perf: bake a group's direct Mesh children into one mesh per material (portcullis bars, door leaves + bands, lantern posts).
   The parent keeps its transform, so gates still swing / rise as one piece. Children listed in `keep` are left alone. */
A.mergeChildren = function (parent, keep) {
  const by = new Map(); for (const c of parent.children.slice()) { if (!c.isMesh || c.isSkinnedMesh || (keep && keep.includes(c))) continue; c.updateMatrix(); if (!by.has(c.material)) by.set(c.material, []); by.get(c.material).push(c); }
  for (const [mat, list] of by) { if (list.length < 2) continue; let cast = false; for (const c of list) { cast = cast || c.castShadow; parent.remove(c); }
    const m = new THREE.Mesh(mergeGeos(list.map(c => ({ geo: c.geometry, m: c.matrix }))), mat); m.castShadow = cast; m.receiveShadow = true; parent.add(m); }
  return parent;
};

/* merge statics per chunk per material (+ shadow flag); returns { root, chunks:[{mesh,x,z,r}] }.
   perf: small pieces (bounding radius under 0.45 m: skulls, pebbles, candles, chains) never cast shadows, and casters / non-casters
   merge separately so the shadow pass only redraws the geometry that actually throws a visible shadow. */
A.mergeChunks = function (statics) {
  const groups = new Map();
  for (const m of statics) { m.updateMatrixWorld(true); const g = m.geometry; if (!g.boundingSphere) g.computeBoundingSphere();
    const cast = m.castShadow && g.boundingSphere.radius * m.matrixWorld.getMaxScaleOnAxis() >= 0.45;
    const key = Math.floor(m.position.x / CHUNK) + ',' + Math.floor(m.position.z / CHUNK); const mk = key + '|' + m.material.uuid + '|' + (cast ? 1 : 0); if (!groups.has(mk)) groups.set(mk, { key, mat: m.material, cast, list: [] }); groups.get(mk).list.push(m); }
  const root = new THREE.Group(); root.name = 'regionStatic'; const chunks = [];
  for (const { mat, cast, list } of groups.values()) {
    const geo = mergeGeos(list.map(m => ({ geo: m.geometry, m: m.matrixWorld }))); const c = geo.boundingSphere.center.clone(), r = geo.boundingSphere.radius;
    geo.translate(-c.x, -c.y, -c.z); geo.computeBoundingSphere();   // mesh sits at its own centre, so the renderer can sort chunks front to back
    const mm = new THREE.Mesh(geo, mat); mm.position.copy(c); mm.receiveShadow = true; mm.castShadow = cast; mm.matrixAutoUpdate = false; mm.updateMatrix(); if (mat.userData.floor) mm.renderOrder = 1; root.add(mm);
    chunks.push({ mesh: mm, x: c.x, z: c.z, r: mat.userData.noCull ? 1e5 : r });
  }
  return { root, chunks };
};
})();
