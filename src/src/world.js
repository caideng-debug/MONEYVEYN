/* =====================================================================
   VEYNHOLD — WORLD MODE (Phase 1): exploration, encounters, RPG systems, persistence.
   Layers on top of the v8 game without touching the combat core:
   - the region's fights run in ONE core World; CONFIG.arena is widened while world mode is active (restored on quit)
     and walls are applied after each core step (instance-level wrap; core.js is byte-identical).
   - field enemies are new PROFILES built from existing core attacks (src/data/content.js), so every deflect window,
     posture value and perilous rule is the locked v8 behaviour.
   - everything a designer adds (regions, foes, NPCs, dialogue, quests, items, upgrades) lives in src/data/*.
   ===================================================================== */
(function () {
'use strict';
const G = window.VEYN_GAME, CORE = window.VEYN_CORE, D = window.VEYN_DATA, A = window.VEYN_ADV;
if (!G || !CORE || !D || !A || !A.Builder || !G.P1) { console.warn('[Veynhold] world mode unavailable'); return; }
const THREE = window.THREE, P1 = G.P1, UI = A.UI, $ = id => document.getElementById(id);
const { Game, Cam, Input, Settings, scene, camera, Character, Store, FX, Arena, VISUAL } = G;
const { audio, HUD, toast, tier, Fade, NameCard, Coach } = P1;
const { CONFIG, PROFILES, World, angNorm, clamp } = CORE;
const HEADLESS = !!window.__VEYN_HEADLESS;
const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

/* ---------- bestiary: additive registration into the core's profile table ---------- */
Object.assign(PROFILES, D.BESTIARY); Object.assign(PROFILES, D.namedFoes(PROFILES));
const TINTS = {   // per-archetype colour multipliers on the cloned GLB materials (texture * colour)
  gaoler: { Cloth: 0xa08c74, Trim: 0x7a5a36, Cape: 0x8a7a66 }, jailer: { Cloth: 0x9c9890, Cape: 0x8c8880, Trim: 0x8a8a7a }, brute: { Armor: 0x9a8270, Cape: 0x6a5a4a, Cloth: 0x8a7a6a },
  sergeant: { Trim: 0xb02a22, Cloth: 0xc0a088, Armor: 0xb0b0b8 }, tamsin: { Cloth: 0xb09070, Cape: 0x8a7458, Trim: 0x6a5a40, Armor: 0x7a6a58 }, ilsabet: { Cloth: 0x8a98aa, Trim: 0x9aa0a8, Armor: 0xa0a4ac },
};
/* chunk F: Quaternius bodies (Medium / High; Low keeps the GLBs above). Gaolers and the sergeant wear the peasant outfit, the cowled jailers the
   hooded ranger, Tamsin and Ilsabet the female peasant; one texture per outfit, so variants are colour multipliers on the 'Cloth' slot. */
const TINTS_Q = {
  gaoler: { Cloth: 0x6e6a64, Hair: 0x4a3a2e, Skin: 0xc8b4a4 }, sergeant: { Cloth: 0x8a5a4e, Hair: 0x3a2e26, Skin: 0xc8b0a0 }, jailer: { Cloth: 0x4a484c, Hair: 0x2a2420, Skin: 0xc0aca0 },
  tamsin: { Cloth: 0x8c7658, Hair: 0x6a5a4a, Skin: 0xd4bcac }, ilsabet: { Cloth: 0x76849c, Hair: 0x3a2a20, Skin: 0xdcc4b4 },   // darker than the first pass: the bare texture read too bright against the moonlit yard
  player: { Cloth: 0x5e5a56, Hair: 0x2e221c, Skin: 0xd8c0b0 },   // chunk H3: Wren — darker, weathered, cooler than the two women (not black: Low has no env light on her)
};
/* chunk H3: Tamsin (long hair) and Ilsabet (buns) wear the female head; Wren is the hooded qwren body in world mode. Low keeps the old GLBs for the foes but
   not for these three: they are the only female characters, and the male duelist / brother GLBs made them read as men (cost: see docs/chunk_H3.md). */
const Q_LOW = { qpeasantF: 1, qpeasantFT: 1, qwren: 1 };
if (window.VEYN_MODELS) VEYN_MODELS.pick = c => { if (!A.active) return null; let k = c._qk;
  if (k === undefined) { const f = c.f; k = c._qk = f.isPlayer ? 'qwren' : f.team === 1 ? (f.profile === PROFILES.gaoler || f.profile === PROFILES.sergeant ? 'qpeasant' : f.profile === PROFILES.jailer ? 'qranger' : null)
    : f.team === 2 && /^Tamsin/.test(f.name || '') ? 'qpeasantFT' : f.team === 2 && /^Ilsabet/.test(f.name || '') ? 'qpeasantF' : null; }
  return k && (Settings.quality !== 'low' || Q_LOW[k]) ? k : null; };
/* chunk H3: the Quaternius skin textures are a bright 'Light' tone; under the moon + rim + wrap lighting their faces crossed the bloom threshold in close-ups
   and glowed (not the brazier: with every point light off the face stayed as bright; with bloom off it dropped 186 -> 144/255 mean luminance on Wren's portrait).
   Q_SKIN darkens every Quaternius skin on top of its tint, so faces sit under the bloom threshold again. */
const Q_SKIN = { qpeasant: 0.7, qranger: 0.7 }, Q_SKIN_F = 0.8;   // the male head (bald scalp under the moon) reads brighter than the female one
function tint(c, key) { if (!c || !c.model || c._tint === key) return; const T = (c.model.q ? TINTS_Q : TINTS)[key]; c._tint = key; if (!T) return; for (const m of c.model.mats) if (T[m.name] !== undefined && m.color) { m.color.multiply(new THREE.Color(T[m.name])); if (c.model.q && m.name === 'Skin') m.color.multiplyScalar(Q_SKIN[c.model.key] || Q_SKIN_F); } }

/* =====================================================================
   SAVE — versioned schema, backup slot, migration, corrupt/outdated handling. Never throws to the page.
   ===================================================================== */
const Save = {
  KEY: 'veynhold_save', BAK: 'veynhold_save_bak', SCHEMA: 1, data: null, problem: null,
  fresh() { let v8 = null; try { v8 = localStorage.getItem('veynhold_v8'); } catch (e) {}
    return { game: 'veynhold', schema: this.SCHEMA, created: Date.now(), updated: Date.now(), playTime: 0, deaths: 0, kills: 0, region: 'execution', lantern: null, lit: [],
      flags: { combat_tutorial_seen: !!(Store.data && Store.data.seenTutorial) }, quests: {}, inv: { draught: 3 }, weapons: [], equip: { weapon: null }, upgrades: [], defeated: {}, opened: {}, collected: {}, lore: {}, zones: {}, hints: {},
      chapter: 1, chapterDone: false, importedFrom: v8 ? 'veynhold_v8' : null }; },
  validate(d) { return !!d && typeof d === 'object' && d.game === 'veynhold' && typeof d.schema === 'number' && !!d.flags && typeof d.flags === 'object' && !!d.quests && !!d.inv && Array.isArray(d.upgrades) && !!d.defeated && !!d.opened && !!d.collected && Array.isArray(d.lit); },
  migrate(d) {
    if (!d || typeof d !== 'object') throw new Error('not an object');
    if (d.schema === undefined && d.v !== undefined) d.schema = 0;              // pre-release prototype format { v:0, ... }
    if (typeof d.schema !== 'number') throw new Error('no schema');
    if (d.schema > this.SCHEMA) { const e = new Error('newer'); e.newer = true; throw e; }
    if (d.schema < 1) {   // 0 -> 1: items{} -> inv{}, lanternId -> lantern, litLanterns -> lit; game tag added
      d.game = 'veynhold'; d.inv = Object.assign({ draught: 3 }, d.items || {}); delete d.items; if (d.lanternId) { d.lantern = d.lanternId; delete d.lanternId; }
      d.lit = d.litLanterns || (d.lantern ? [d.lantern] : []); delete d.litLanterns; d.upgrades = d.upgrades || []; d.schema = 1; d.migratedFrom = 0; }
    const f = this.fresh(); for (const k in f) if (d[k] === undefined) d[k] = f[k];   // forward-fill new keys (keeps old saves loadable as the schema grows)
    return d;
  },
  read(key) { let raw = null; try { raw = localStorage.getItem(key); } catch (e) { return { none: true, blocked: true }; } if (raw == null) return { none: true };
    try { const d = this.migrate(JSON.parse(raw)); if (!this.validate(d)) throw new Error('invalid structure'); return { d }; } catch (e) { return { err: e.message, newer: !!e.newer, raw }; } },
  /* status: none | ok | restored | corrupt | newer */
  load() { const m = this.read(this.KEY); if (m.d) { this.data = m.d; return 'ok'; } if (m.none) { this.data = null; return 'none'; }
    if (m.newer) { this.problem = 'newer'; this.data = null; return 'newer'; }
    const b = this.read(this.BAK); try { localStorage.setItem('veynhold_save_corrupt', m.raw || ''); } catch (e) {}
    if (b.d) { this.data = b.d; this.write(true); this.problem = 'restored'; return 'restored'; }
    this.problem = 'corrupt'; this.data = null; return 'corrupt'; },
  exists() { const m = this.read(this.KEY); return !!m.d; },
  write(skipBackup) { if (!this.data) return false; this.data.updated = Date.now(); try { const s = JSON.stringify(this.data);
      if (!skipBackup) { const prev = localStorage.getItem(this.KEY); if (prev) { try { const pd = JSON.parse(prev); if (this.validate(pd)) localStorage.setItem(this.BAK, prev); } catch (e) {} } }
      localStorage.setItem(this.KEY, s); return true; } catch (e) { if (!Save._warned) { Save._warned = true; toast('Could not save (storage blocked or full)'); } return false; } },
  wipe() { try { localStorage.removeItem(this.KEY); localStorage.removeItem(this.BAK); } catch (e) {} this.data = null; },
};
const S = () => Save.data;

/* ---------- conditions, inventory, quests, actions ---------- */
const Inv = {
  count(id) { const d = S(); if (!d) return 0; if (D.WEAPONS[id]) return d.weapons.includes(id) ? 1 : 0; return d.inv[id] || 0; },
  give(id, n) { const d = S(); if (D.WEAPONS[id]) { if (!d.weapons.includes(id)) d.weapons.push(id); if (!d.equip.weapon) d.equip.weapon = id; return; } d.inv[id] = (d.inv[id] || 0) + (n || 1); },
  take(id, n) { const d = S(); d.inv[id] = Math.max(0, (d.inv[id] || 0) - (n || 1)); if (!d.inv[id]) delete d.inv[id]; },
  draughtMax() { return 3 + (S().upgrades.includes('vessel') ? 1 : 0); },
};
const Cond = {
  test(str) { if (!str) return true; return str.split('&').every(t => this.one(t.trim())); },
  one(t) { let neg = false; if (t[0] === '!') { neg = true; t = t.slice(1); } const i = t.indexOf(':'), k = t.slice(0, i), rest = t.slice(i + 1); let v = false; const d = S();
    if (k === 'flag') v = !!d.flags[rest]; else if (k === 'has') { const [it, n] = rest.split(':'); v = Inv.count(it) >= (n ? +n : 1); } else if (k === 'up') v = d.upgrades.includes(rest); else if (k === 'dead') v = !!d.defeated[rest];
    else if (k === 'q') { const m = rest.match(/^(\w+)(>=|<=|==|<|>)(-?\d+)$/); if (m) { const st = Quests.stage(m[1]), n = +m[3]; v = st !== null && ({ '>=': st >= n, '<=': st <= n, '==': st === n, '<': st < n, '>': st > n })[m[2]]; } }
    return neg ? !v : v; },
};
const Quests = {
  stage(id) { const q = S().quests[id]; return q ? q.stage : null; },
  set(id, stage, mode) { const d = S(), Q = D.QUESTS[id]; if (!Q) return; const q = d.quests[id]; const cur = q ? q.stage : null;
    if (mode === 'max' && cur !== null && cur >= stage) return; if (cur === stage) return;
    if (id === 'crane' && cur !== null && cur >= 2 && stage < 2) return;   // resolved quests never reopen
    d.quests[id] = { stage, log: (q ? q.log : []).concat([stage]).slice(-12), t: Date.now() };
    const last = stage >= Q.stages.length - 1 || (id === 'crane' && stage >= 2);
    if (A.active) { toast((cur === null ? 'New quest: ' : last ? 'Quest complete: ' : 'Quest updated: ') + Q.name); audio.play('ui'); }
    A.refreshObjective(); Save.write(); },
  sync() { const d = S(); if (!d) return;
    const tags = ['name_pell', 'name_ilke', 'name_jory'].filter(t => d.collected['tag_' + t.slice(5)]).length; const n = this.stage('names'); if (n !== null && n < 3) this.set('names', Math.min(3, tags), 'max');
    const c = this.stage('crane'); if (c === 0 && Inv.count('cagekey')) this.set('crane', 1); },
};
function act(list) { for (const a of list || []) { const [k, x, y, z] = a; const d = S();
  switch (k) {
    case 'flag': d.flags[x] = true; break; case 'unflag': delete d.flags[x]; break;
    case 'quest': Quests.set(x, y, z); break;
    case 'give': Inv.give(x, y); toast('Received: ' + ((D.ITEMS[x] || D.WEAPONS[x] || {}).name || x)); audio.play('ui'); Quests.sync(); break;
    case 'take': Inv.take(x, y); break;
    case 'upgrade': A.grantUpgrade(x); break;
    case 'open': A.openGate(x); break; case 'card': UI.area(x, y); break; case 'toast': toast(x); break;
    case 'scene': if (A.Scenes) A.Scenes.queue(x); break;   // chunk G3: a dialogue cutscene (src/world_scenes.js) starts once the text box has closed
    case 'lore': d.lore[x] = true; break; case 'sfx': A.sfx(x); break; case 'heal': if (Game.world) { const p = Game.world.player; p.hp = p.maxHp; } break; case 'save': Save.write(); break;
  } } Quests.sync(); }

/* =====================================================================
   REGION RUNTIME — scenery, colliders (spatial hash), line of sight, camera clearance, nav field
   ===================================================================== */
/* =====================================================================
   CHUNK A PROPS — the Vigil Lantern (iron cage, glass panes, post + bracket, kindled / unkindled light, a few embers)
   and the visible sword pickup (blade, crossguard, grip, pommel, metal, glint). Built once per region load; animated cheaply.
   ===================================================================== */
/* chunk G2: Lambert twin for a world-layer material, registered in mats()._twin so A.lowShading swaps it on Low (explicit colour, no moonlit tint) */
function lowTwinItem(m, hex, k, em) { const tw = A.mats()._twin; if (!tw || tw.has(m)) return m; const t = new THREE.MeshLambertMaterial({ color: new THREE.Color(hex).multiplyScalar(k), vertexColors: m.vertexColors, map: m.map || null, emissive: em || 0 });
  t.name = (m.name || 'item') + '_low'; tw.set(m, t); tw.set(t, m); return m; }
/* chunk G2: merge [{ geo, m, col }] into one geometry with a per-part vertex colour (position / normal / color, indexed) */
function mergeColored(parts) { let nv = 0, ni = 0; for (const p of parts) { const g = p.geo; nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3), idx = new (nv > 65535 ? Uint32Array : Uint16Array)(ni), v = new THREE.Vector3(), nm = new THREE.Matrix3(); let vo = 0, io = 0;
  for (const p of parts) { const g = p.geo, P = g.attributes.position, N = g.attributes.normal; nm.getNormalMatrix(p.m);
    for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(p.m); pos.set([v.x, v.y, v.z], (vo + i) * 3); v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nor.set([v.x, v.y, v.z], (vo + i) * 3); col.set(p.col, (vo + i) * 3); }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx[io++] = g.index.getX(i) + vo; else for (let i = 0; i < P.count; i++) idx[io++] = i + vo; vo += P.count; g.dispose(); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setIndex(new THREE.BufferAttribute(idx, 1)); geo.computeBoundingSphere(); return geo; }
const PropFX = {
  mats: null,
  M() { if (this.mats) return this.mats; const glow = P1.glowTex();
    const steel = new THREE.MeshStandardMaterial({ color: 0xc4ccd6, metalness: 0.55, roughness: 0.3, emissive: 0x161a20 }); steel.userData.envK = 1.2;   // half-metal + a faint sheen: full metal with no env reads black at night
    const star = P1.V7Tex.canvas(64, 64); let starMap = null;
    if (star) { const g = star.g; const gr = g.createRadialGradient(32, 32, 0, 32, 32, 30); gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.18, 'rgba(230,238,255,0.35)'); gr.addColorStop(1, 'rgba(200,215,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      g.globalCompositeOperation = 'lighter'; for (const [w, h] of [[30, 1.6], [1.6, 30]]) { const l = g.createRadialGradient(32, 32, 0, 32, 32, 30); l.addColorStop(0, 'rgba(255,255,255,0.9)'); l.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = l; g.fillRect(32 - w, 32 - h, w * 2, h * 2); }
      starMap = P1.V7Tex.tex(star.cv); }
    this.mats = { glow, steel, darkSteel: new THREE.MeshStandardMaterial({ color: 0x5a544c, metalness: 0.5, roughness: 0.45, emissive: 0x0c0b0a }), leather: new THREE.MeshStandardMaterial({ color: 0x3b2618, roughness: 0.85 }),
      brass: new THREE.MeshStandardMaterial({ color: 0x6e5530, metalness: 0.8, roughness: 0.4 }), starMap };
    // chunk G2: Lambert twins for Low (A.lowShading): these were Standard with no env there, and the sword read near-black
    const Mm = this.mats; lowTwinItem(Mm.steel, 0xc4ccd6, 1.05, 0x161a20); lowTwinItem(Mm.darkSteel, 0x5a544c, 1.6, 0x0c0b0a); lowTwinItem(Mm.leather, 0x3b2618, 1.7); lowTwinItem(Mm.brass, 0x6e5530, 1.8);
    // chunk G2: one vertex-coloured material for every small pickup (name-tag, tithe, flask, pouch, scroll): one draw call per item
    Mm.item = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.55, metalness: 0.25, emissive: 0x0d0c0a }); Mm.item.name = 'pickupItem'; lowTwinItem(Mm.item, 0xffffff, 2.0, 0x0d0c0a);   // palette is dark like the scenery's (photo floors are ~0.05 albedo); Low twins brighten like mats()'s
    return this.mats; },
  /* chunk G2: metal that has no env map to reflect (Low / Medium without env) is kept half-metal so it never reads black */
  metalTune() { const M = this.M(), env = !!tier().env; M.steel.metalness = env ? 0.55 : 0.45; M.darkSteel.metalness = env ? 0.5 : 0.4; M.brass.metalness = env ? 0.8 : 0.45; },
  /* chunk G2: a small pickup as one vertex-coloured mesh + a faint glint. kinds: tag | tithe | key | flask | pouch | scroll.
     Same contract as sword(): { root, glint, halo } (halo null: no second sprite). def: { kind, x, z, y?, ry?, scale? } */
  item(def, gy) { const M = this.M(), parts = [], C = new THREE.Color();
    const add = (geo, hex, x, y, z, rx, ry, rz, sx, sy, sz) => { const o = new THREE.Object3D(); o.position.set(x, y, z); o.rotation.set(rx || 0, ry || 0, rz || 0); if (sx) o.scale.set(sx, sy || sx, sz || sx); o.updateMatrix(); parts.push({ geo, m: o.matrix.clone(), col: C.setHex(hex).toArray() }); };
    const k = def.kind; let gl = 0.12, sc = def.scale || 1, glSize = 0.28;
    if (k === 'tag') { sc *= 1.6;   // a tin name-tag on a twine cord, dropped on a scrap of linen (reads from ~5 m)
      add(new THREE.PlaneGeometry(0.28, 0.22), 0x100e0b, 0, 0.004, 0, -Math.PI / 2, 0.15);                            // linen scrap
      add(new THREE.BoxGeometry(0.11, 0.004, 0.04), 0x4e4b44, 0.01, 0.009, 0.0, 0, 0.1);                             // tin strip
      add(new THREE.CylinderGeometry(0.007, 0.007, 0.002, 8), 0x141210, -0.032, 0.0115, -0.003);                     // punched hole
      add(new THREE.TorusGeometry(0.035, 0.0035, 4, 12), 0x2e2618, -0.07, 0.009, -0.012, -Math.PI / 2, 0, 0, 1, 0.75, 1);   // cord loop
      add(new THREE.CylinderGeometry(0.003, 0.003, 0.09, 4), 0x2e2618, -0.1, 0.008, 0.04, Math.PI / 2, 0, 0.6);       // loose cord end
      for (let i = 0; i < 4; i++) add(new THREE.BoxGeometry(0.012, 0.0012, 0.002), 0x14120f, -0.01 + i * 0.016, 0.0112, 0.004);   // scratched letters
      gl = 0.05; }
    else if (k === 'tithe') {   // an iron offering dish heaped with coins, a short chain hanging off the altar edge
      add(new THREE.CylinderGeometry(0.15, 0.12, 0.04, 12), 0x161412, 0, 0.02, 0); add(new THREE.CylinderGeometry(0.13, 0.13, 0.004, 12), 0x0b0a09, 0, 0.041, 0);
      const cp = [[0, 0, 0], [0.05, 0.01, 0.2], [-0.04, 0.03, -0.4], [0.02, -0.05, 0.7], [-0.06, -0.03, 1.1], [0.07, -0.05, 2.0], [0.0, 0.06, 2.6]];
      cp.forEach(([x, z, r], i) => add(new THREE.CylinderGeometry(0.022, 0.022, 0.004, 8), i % 3 ? 0x5a3c0c : 0x46300a, x, 0.046 + (i < 3 ? i * 0.0045 : 0.002), z, r * 0.15, 0, r * 0.12));
      for (let i = 0; i < 4; i++) add(new THREE.TorusGeometry(0.014, 0.004, 3, 8), 0x141210, 0.16 + i * 0.022, 0.03 - i * 0.004, 0.0, 0, i % 2 ? Math.PI / 2 : 0, 0);
      glSize = 0.36; gl = 0.1; }
    else if (k === 'flask') {   // the Lantern Draught: a squat amber bottle with a cork
      const pts = [[0.001, 0], [0.05, 0.004], [0.058, 0.04], [0.05, 0.085], [0.02, 0.11], [0.017, 0.14], [0.021, 0.15], [0.001, 0.152]].map(([r, y]) => new THREE.Vector2(r, y));
      add(new THREE.LatheGeometry(pts, 8), 0x8a5a20, 0, 0, 0); add(new THREE.CylinderGeometry(0.016, 0.014, 0.025, 6), 0x6a4a2a, 0, 0.16, 0); }
    else if (k === 'pouch') {   // a coin pouch: squashed leather ball + drawstring
      add(new THREE.SphereGeometry(0.075, 8, 6), 0x4a3020, 0, 0.05, 0, 0, 0, 0, 1, 0.7, 1); add(new THREE.TorusGeometry(0.03, 0.006, 4, 10), 0x9a8050, 0, 0.1, 0, Math.PI / 2); add(new THREE.ConeGeometry(0.03, 0.04, 6), 0x4a3020, 0, 0.12, 0); }
    else if (k === 'scroll') {   // a rolled writ with a red wax seal
      add(new THREE.CylinderGeometry(0.03, 0.03, 0.26, 8), 0xcfc2a2, 0, 0.03, 0, 0, 0, Math.PI / 2); add(new THREE.CylinderGeometry(0.018, 0.018, 0.006, 8), 0x8a1a14, 0, 0.03, 0.03, Math.PI / 2); }
    const root = new THREE.Group(); let mesh;
    if (k === 'key') { mesh = Keys.makeMesh(1.3); mesh.rotation.x = Math.PI / 2; mesh.position.y = 0.012; }
    else { mesh = new THREE.Mesh(mergeColored(parts), M.item); mesh.castShadow = false; mesh.receiveShadow = true; mesh.scale.setScalar(sc); }
    root.add(mesh); root.position.set(def.x, gy + (def.y || 0), def.z); root.rotation.y = def.ry || 0;
    const glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: M.starMap || M.glow, color: 0xfff0d0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: gl })); glint.scale.set(glSize, glSize, 1); glint.position.y = 0.05; root.add(glint);
    root.userData.item = k; root.updateMatrixWorld(true); mesh.matrixAutoUpdate = false; mesh.updateMatrix();
    return { root, glint, halo: null, mesh }; },
  /* blade: diamond cross-section, tapering to a point (flat-shaded facets catch the moon) */
  bladeGeo(L, w, t) { const rows = [[0, 1], [L * 0.8, 0.86], [L, 0.0]], pos = [];
    const ring = (y, k) => [[w / 2 * k, y, 0], [0, y, t / 2 * Math.max(k, 0.2)], [-w / 2 * k, y, 0], [0, y, -t / 2 * Math.max(k, 0.2)]];
    for (let i = 0; i < rows.length - 1; i++) { const a = ring(rows[i][0], rows[i][1]), b = ring(rows[i + 1][0], rows[i + 1][1]); for (let k = 0; k < 4; k++) { const k2 = (k + 1) % 4; pos.push(...a[k], ...b[k], ...b[k2], ...a[k], ...b[k2], ...a[k2]); } }
    const a = ring(0, 1); pos.push(...a[0], ...a[2], ...a[1], ...a[0], ...a[3], ...a[2]);   // base cap
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); return g; },
  sword(def, gy) {   // a longsword along +y (guard at 0), laid flat (or stood upright with def.upright)
    const M = this.M(), grp = new THREE.Group(), add = (geo, mat, x, y, z, rx, rz) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); if (rx) m.rotation.x = rx; if (rz) m.rotation.z = rz; m.castShadow = true; grp.add(m); return m; };
    add(this.bladeGeo(0.84, 0.052, 0.009), M.steel, 0, 0.012, 0);
    add(new THREE.BoxGeometry(0.03, 0.06, 0.012), M.steel, 0, 0.03, 0);                                      // ricasso
    add(new THREE.BoxGeometry(0.25, 0.028, 0.03), M.darkSteel, 0, 0, 0);                                      // crossguard
    for (const s of [-1, 1]) add(new THREE.SphereGeometry(0.019, 8, 6), M.darkSteel, s * 0.13, -0.006, 0);    // quillon knobs
    add(new THREE.CylinderGeometry(0.0155, 0.017, 0.19, 8), M.leather, 0, -0.11, 0);                          // grip
    for (const y of [-0.04, -0.11, -0.18]) add(new THREE.CylinderGeometry(0.018, 0.018, 0.008, 8), M.brass, 0, y, 0);   // grip wire bands
    add(new THREE.CylinderGeometry(0.032, 0.032, 0.022, 12), M.darkSteel, 0, -0.232, 0, Math.PI / 2);        // wheel pommel
    A.mergeChildren(grp);
    const glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: M.starMap || M.glow, color: 0xdfe8ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.3 })); glint.scale.set(0.4, 0.4, 1);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: M.glow, color: 0x8fa6d8, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.22 })); halo.scale.set(1.1, 1.1, 1);
    const root = new THREE.Group(); root.add(grp);
    if (def.upright) { grp.rotation.z = Math.PI; grp.position.y = 0.66; grp.rotation.x = def.tilt !== undefined ? def.tilt : 0.08; grp.scale.setScalar(def.scale || 1); root.position.set(def.x, gy, def.z);   // point-down, ~15 cm of blade in the mud
      const mound = new THREE.Mesh(new THREE.CircleGeometry(0.17, 8), A.mats().dirt); mound.rotation.x = -Math.PI / 2; mound.position.set(0, 0.012, -0.17 * Math.sin(grp.rotation.x) * 1.1); mound.scale.set(1, 0.6, 1); root.add(mound); }
    else { grp.rotation.x = -Math.PI / 2 + 0.012; grp.position.y = 0.014; root.position.set(def.x, (def.y !== undefined ? def.y : 0) + gy, def.z); }   // lies on its guard; the tip rests on the boards
    root.rotation.y = def.ry || 0; root.add(glint); root.add(halo);
    const tipLocal = def.upright ? new THREE.Vector3(0, 0.66 - 0.16 * Math.cos(grp.rotation.x), -0.16 * Math.sin(grp.rotation.x)) : new THREE.Vector3(0, 0.03, -0.5); glint.position.copy(tipLocal); halo.position.copy(tipLocal).setY(tipLocal.y + (def.upright ? -0.12 : 0.05)); if (def.upright) halo.scale.set(1.3, 1.3, 1);
    root.userData.sword = true;
    root.updateMatrixWorld(true); grp.traverse(o => { if (o.isMesh) { o.matrixAutoUpdate = false; o.updateMatrix(); } });
    this.metalTune(); const VM = P1.V7Mats; if (VM && VM.env && tier().env && !M.steel.envMap) { M.steel.envMap = VM.env; M.steel.envMapIntensity = 1.2; M.darkSteel.envMap = VM.env; M.steel.needsUpdate = M.darkSteel.needsUpdate = true; }
    return { root, glint, halo }; },
  /* the Vigil Lantern: stone plinth, iron post with collar and finial, a braced bracket arm, a hexagonal iron cage with glass panes,
     roof cap and hanging ring, a candle stub inside. Returns the parts the lit / unlit states drive. */
  lantern(grp, M) {
    const add = (geo, mat, x, y, z, ry, rz) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); if (ry) m.rotation.y = ry; if (rz) m.rotation.z = rz; m.castShadow = true; grp.add(m); return m; };
    add(A.boxGeo(1.1, 0.5, 1.1, 2), M.stone, 0, 0.25, 0).receiveShadow = true;
    add(A.boxGeo(0.7, 0.14, 0.7, 2), M.stone, 0, 0.57, 0);
    add(new THREE.CylinderGeometry(0.13, 0.16, 0.16, 8), M.iron, 0, 0.72, 0);                    // collar
    add(new THREE.CylinderGeometry(0.055, 0.075, 2.5, 8), M.iron, 0, 1.95, 0);                   // post
    add(new THREE.CylinderGeometry(0.085, 0.085, 0.06, 8), M.iron, 0, 2.9, 0);                    // cap ring
    add(new THREE.SphereGeometry(0.075, 8, 6), M.iron, 0, 3.27, 0); add(new THREE.ConeGeometry(0.05, 0.16, 8), M.iron, 0, 3.4, 0);   // finial
    add(new THREE.CylinderGeometry(0.06, 0.06, 0.32, 8), M.iron, 0, 3.08, 0);
    add(new THREE.BoxGeometry(0.72, 0.05, 0.05), M.iron, 0.34, 3.0, 0);                           // bracket arm
    const brace = add(new THREE.BoxGeometry(0.5, 0.035, 0.035), M.iron, 0.2, 2.82, 0, 0, 0.72);   // diagonal brace
    void brace; const curl = add(new THREE.TorusGeometry(0.07, 0.012, 4, 10, Math.PI * 1.5), M.iron, 0.44, 2.93, 0); curl.rotation.z = 0.6;   // scroll
    add(new THREE.ConeGeometry(0.03, 0.06, 6), M.iron, 0.7, 3.0, 0, 0, -Math.PI / 2);            // arm tip
    for (let k = 0; k < 2; k++) { const ch = add(new THREE.TorusGeometry(0.032, 0.008, 4, 8), M.iron, 0.62, 2.93 - k * 0.05, 0); ch.rotation.y = k * Math.PI / 2; }   // hanging links
    const cx = 0.62, cy = 2.5, H = 0.44, Rr = 0.19;
    add(new THREE.CylinderGeometry(0.035, 0.035, 0.05, 8), M.iron, cx, cy + H / 2 + 0.2, 0);    // vent chimney
    add(new THREE.ConeGeometry(0.25, 0.17, 6), M.iron, cx, cy + H / 2 + 0.1, 0, Math.PI / 6);    // roof
    add(new THREE.CylinderGeometry(Rr + 0.025, Rr + 0.025, 0.03, 6), M.iron, cx, cy + H / 2, 0, Math.PI / 6);   // top frame
    add(new THREE.CylinderGeometry(Rr + 0.02, Rr - 0.02, 0.05, 6), M.iron, cx, cy - H / 2, 0, Math.PI / 6);     // base tray
    add(new THREE.ConeGeometry(0.06, 0.1, 6), M.iron, cx, cy - H / 2 - 0.075, 0, 0).rotation.x = Math.PI;      // drip finial
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; add(new THREE.CylinderGeometry(0.011, 0.011, H, 4), M.iron, cx + Math.cos(a) * Rr, cy, Math.sin(a) * Rr); }   // corner bars
    for (let k = 0; k < 6; k++) { const a = (k + 0.5) / 6 * Math.PI * 2, ap = Rr * Math.cos(Math.PI / 6) - 0.003; const m = add(new THREE.BoxGeometry(0.008, 0.008, Rr * 0.98), M.iron, cx + Math.cos(a) * ap, cy + 0.02, Math.sin(a) * ap); m.rotation.y = -a; }   // mid rails
    add(new THREE.CylinderGeometry(0.035, 0.038, 0.12, 8), M.wax, cx, cy - H / 2 + 0.085, 0).castShadow = false;   // candle stub
    // glass: six panes merged into one mesh with a per-lantern material (lit: warm glow; unlit: cold, dark)
    const panes = []; for (let k = 0; k < 6; k++) { const a = (k + 0.5) / 6 * Math.PI * 2, ap = Rr * Math.cos(Math.PI / 6) - 0.006; const p = new THREE.PlaneGeometry(Rr * 0.98, H - 0.02); const mm = new THREE.Matrix4().makeRotationY(-a + Math.PI / 2).setPosition(cx + Math.cos(a) * ap, cy, Math.sin(a) * ap); panes.push({ geo: p, m: mm }); }
    const gm = new THREE.MeshStandardMaterial({ color: 0x8a7a64, emissive: 0x000000, transparent: true, opacity: 0.32, roughness: 0.12, metalness: 0.1, depthWrite: false, side: THREE.DoubleSide }); gm._own = true;
    const glass = new THREE.Mesh(A.mergeGeos(panes), gm); glass.renderOrder = 4; glass.castShadow = false; grp.add(glass);
    return { glass, cx, cy };
  },
};
const CELL = 8;
const hkey = (i, j) => (i + 512) * 1024 + (j + 512);   // numeric spatial-hash key (no string building in the hot path)
const Region = {
  data: null, root: null, dyn: null, chunks: [], segs: [], circles: [], torches: [], hash: new Map(), lights: [], ground: null,
  /* walkable ground height at (x, z) (stairs, ramps, platforms; 0 elsewhere). The core stays 2D; this is the world layer's y. */
  groundY(x, z) { const G = Region.ground; return G ? G.y(x, z) : 0; },
  gates: {}, levers: {}, lanterns: {}, pickups: {}, notes: {}, npcs: {}, nav: null, glowMat: null,
  load(id) {
    const R = this.data = D.REGIONS[id]; const t0 = performance.now();
    const B = new A.Builder(R).build(); const merged = A.mergeChunks(B.statics);
    this.root = merged.root; this.chunks = merged.chunks; this.dyn = B.dyn; this.segs = B.segs; this.circles = B.circles; this.torches = B.torches; this.cage = B.cageObj;
    this.ground = B.ground; this.unsnagged = B.unsnagged || 0; this.corpseInfo = B.corpseInfo || null; this.cartBedY = B.cartBedY;   // merge A+F: the corpse cart's bed height (F's mesh 0.95 m / fallback 1.2 m)
    this.crows = B.crows || []; this.dressInfo = { parts: B.dressN || 0, crows: this.crows.length };   // chunk A2 set dressing
    scene.add(this.root); scene.add(this.dyn);
    // pooled torch lights (count follows the quality tier; they hop to the nearest flames)
    this.lights = []; for (let i = 0; i < 4; i++) { const L = new THREE.PointLight(0xff8a3a, 2.2, 17, 2); L.position.set(0, -50, 0); L.visible = i < (tier().torches || 0); this.dyn.add(L); this.lights.push({ L, t: null }); }
    this.buildDynamic(); this.rehash(); this.buildNav();
    B.statics = []; this._B = B; this._cWait = !!(this.corpseInfo && !this.corpseInfo.models && window.VEYN_MODELS && !HEADLESS); this._cWaitT = 0; this._cWaitN = 0;   // chunk G2: GLBs still parsing -> rebake the corpses when they land
    this.buildMs = performance.now() - t0; return this;
  },
  unload() { if (!this.root) return; const kill = o => { o.traverse(n => { if (n.geometry) n.geometry.dispose(); if (n.material && n.material.map && n.material.map.isCanvasTexture && n.material._own) n.material.map.dispose(); }); scene.remove(o); };
    kill(this.root); kill(this.dyn); for (const k in this.npcs) { const n = this.npcs[k]; if (n.c) n.c.dispose(); }
    this.root = this.dyn = null; this.ground = null; this.chunks = []; this.segs = []; this.circles = []; this.torches = []; this.hash.clear(); this.gates = {}; this.levers = {}; this.lanterns = {}; this.pickups = {}; this.notes = {}; this.npcs = {}; this.data = null; },
  /* chunk G2: re-run the corpse bake with the saved requests (character GLBs finished loading after the region was built): the shroud stand-ins become posed bodies */
  rebuildCorpses() { const B = this._B; if (!B || !this.dyn) return false; const old = this.dyn.children.filter(o => o.name === 'corpses' || o.name === 'corpseShadows' || o.name === 'corpseShrouds');
    for (const o of old) { this.dyn.remove(o); if (o.geometry) o.geometry.dispose(); } B.dyn = this.dyn; B.buildCorpses(); this.corpseInfo = B.corpseInfo || null; A._tierApplied = null; return true; },   // next applyTier swaps Low twins + shadow flags
  rehash() { this.hash.clear(); const add = (o, x0, z0, x1, z1) => { for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) { const k = hkey(i, j); let a = this.hash.get(k); if (!a) this.hash.set(k, a = []); a.push(o); } };
    for (const s of this.segs) add(s, Math.min(s.ax, s.bx) - s.t - 1, Math.min(s.az, s.bz) - s.t - 1, Math.max(s.ax, s.bx) + s.t + 1, Math.max(s.az, s.bz) + s.t + 1);
    for (const c of this.circles) add(c, c.x - c.r - 1, c.z - c.r - 1, c.x + c.r + 1, c.z + c.r + 1); },
  _near: [], _stamp: 0,
  near(x0, z0, x1, z1) {   // perf: no per-call Set / key strings; returns a reused array (consume it before the next call)
    const out = this._near; out.length = 0; const st = ++this._stamp; const H = this.hash;
    for (let i = Math.floor(Math.min(x0, x1) / CELL), i1 = Math.floor(Math.max(x0, x1) / CELL); i <= i1; i++) for (let j = Math.floor(Math.min(z0, z1) / CELL), j1 = Math.floor(Math.max(z0, z1) / CELL); j <= j1; j++) {
      const a = H.get(hkey(i, j)); if (a) for (let k = 0; k < a.length; k++) { const o = a[k]; if (o._ns !== st) { o._ns = st; out.push(o); } } } return out; },
  /* push a circle (x,z,r) out of every active collider; low walls are skipped while airborne */
  collide(f, airborne) {
    for (let pass = 0; pass < 2; pass++) for (const o of this.near(f.x - 2, f.z - 2, f.x + 2, f.z + 2)) { if (!o.on) continue;
      if (o.r !== undefined) { const dx = f.x - o.x, dz = f.z - o.z, d = Math.hypot(dx, dz) || 1e-4, m = o.r + f.radius; if (d < m) { f.x = o.x + dx / d * m; f.z = o.z + dz / d * m; } continue; }
      if (o.low && airborne) continue;
      const ex = o.bx - o.ax, ez = o.bz - o.az, L2 = ex * ex + ez * ez || 1e-6; let t = ((f.x - o.ax) * ex + (f.z - o.az) * ez) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const cx = o.ax + ex * t, cz = o.az + ez * t, dx = f.x - cx, dz = f.z - cz, d = Math.hypot(dx, dz), m = o.t + f.radius;
      if (d < m) { if (d < 1e-4) { const nx = -ez, nz = ex, l = Math.hypot(nx, nz) || 1; f.x = cx + nx / l * m; f.z = cz + nz / l * m; } else { f.x = cx + dx / d * m; f.z = cz + dz / d * m; } } } },
  blocked(x0, z0, x1, z1, kind) {   // kind: 'sight' | 'cam'
    for (const o of this.near(x0, z0, x1, z1)) { if (!o.on || !o[kind]) continue; if (kind === 'cam' && o.h < 1.8) continue;
      if (o.r !== undefined) { const ex = x1 - x0, ez = z1 - z0, L2 = ex * ex + ez * ez || 1e-6; let t = ((o.x - x0) * ex + (o.z - z0) * ez) / L2; t = clamp(t, 0, 1); if (dist(x0 + ex * t, z0 + ez * t, o.x, o.z) < o.r * 0.8) return true; continue; }
      if (segX(x0, z0, x1, z1, o.ax, o.az, o.bx, o.bz)) return true; } return false; },
  los(ax, az, bx, bz) { return !this.blocked(ax, az, bx, bz, 'sight'); },
  camClear(lx, lz, cx, cz) { if (this.blocked(lx, lz, cx, cz, 'cam')) return false; for (const o of this.near(cx - 1, cz - 1, cx + 1, cz + 1)) { if (!o.on || !o.cam || o.h < 1.8) continue;
      if (o.r !== undefined) { if (dist(cx, cz, o.x, o.z) < o.r + 0.3) return false; continue; } const ex = o.bx - o.ax, ez = o.bz - o.az, L2 = ex * ex + ez * ez || 1e-6; const t = clamp(((cx - o.ax) * ex + (cz - o.az) * ez) / L2, 0, 1); if (dist(cx, cz, o.ax + ex * t, o.az + ez * t) < o.t + 0.3) return false; } return true; },
  /* G4: camera spring arm. Distance along the unit ray (px,pz)+(dx,dz)*t, t <= L, before a sphere of radius rad touches a camera
     collider (same filter as camClear: on, cam, h >= 1.8). Analytic ray-vs-capsule / ray-vs-circle, no allocation. A collider the
     pivot already overlaps is ignored (the ray can only leave it). */
  camArm(px, pz, dx, dz, L, rad) { let best = L; const ex0 = px + dx * L, ez0 = pz + dz * L;
    const circ = (cx, cz, R) => { const mx = px - cx, mz = pz - cz, b = mx * dx + mz * dz, c = mx * mx + mz * mz - R * R; if (c <= 0) return; const disc = b * b - c; if (disc < 0) return; const t = -b - Math.sqrt(disc); if (t >= 0 && t < best) best = t; };
    for (const o of this.near(Math.min(px, ex0) - 1, Math.min(pz, ez0) - 1, Math.max(px, ex0) + 1, Math.max(pz, ez0) + 1)) { if (!o.on || !o.cam || o.h < 1.8) continue;
      if (o.r !== undefined) { circ(o.x, o.z, o.r + rad); continue; }
      const R = o.t + rad, sx = o.bx - o.ax, sz = o.bz - o.az, len = Math.hypot(sx, sz) || 1e-6, ux = sx / len, uz = sz / len;
      { const k = clamp((px - o.ax) * ux + (pz - o.az) * uz, 0, len); if (dist(px, pz, o.ax + ux * k, o.az + uz * k) < R) continue; }
      circ(o.ax, o.az, R); circ(o.bx, o.bz, R);
      const nx = -uz, nz = ux, dn = dx * nx + dz * nz; if (Math.abs(dn) < 1e-9) continue;
      for (let sd = -1; sd <= 1; sd += 2) { const t = ((o.ax + nx * R * sd - px) * nx + (o.az + nz * R * sd - pz) * nz) / dn; if (t < 0 || t >= best) continue;
        const k = (px + dx * t - o.ax) * ux + (pz + dz * t - o.az) * uz; if (k >= 0 && k <= len) best = t; } }
    return best; },
  zoneAt(x, z) { for (const zn of this.data.zones) { if (zn.circle) { if (dist(x, z, zn.circle[0], zn.circle[1]) < zn.circle[2]) return zn; } for (const r of zn.rects || []) if (x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3]) return zn; } return null; },
  /* nav field: 1 m grid, BFS distance from a target; enemies that lose sight of you follow it around corners */
  buildNav() { const B = this.data.bounds, W = Math.ceil(B.x1 - B.x0), H = Math.ceil(B.z1 - B.z0); const blk = new Uint8Array(W * H);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const x = B.x0 + i + 0.5, z = B.z0 + j + 0.5; let b = false; const probe = { x, z, radius: 0.5 };
      for (const o of this.near(x - 1, z - 1, x + 1, z + 1)) { if (!o.on) continue; if (o.r !== undefined) { if (dist(x, z, o.x, o.z) < o.r + 0.45) { b = true; break; } continue; }
        const ex = o.bx - o.ax, ez = o.bz - o.az, L2 = ex * ex + ez * ez || 1e-6, t = clamp(((x - o.ax) * ex + (z - o.az) * ez) / L2, 0, 1); if (dist(x, z, o.ax + ex * t, o.az + ez * t) < o.t + 0.5) { b = true; break; } }
      blk[j * W + i] = b ? 1 : 0; void probe; }
    this.nav = { W, H, x0: B.x0, z0: B.z0, blk, dist: new Int32Array(W * H), tx: -1, tz: -1, t: -9 }; },
  navField(x, z, now) { const N = this.nav; if (!N) return null; const ti = Math.floor(x - N.x0), tj = Math.floor(z - N.z0); if (ti === N.tx && tj === N.tz && now - N.t < 0.5) return N;
    N.tx = ti; N.tz = tj; N.t = now; const { W, H, blk } = N, Dd = N.dist; Dd.fill(-1); if (ti < 0 || tj < 0 || ti >= W || tj >= H) return N;
    const q = N.q || (N.q = new Int32Array(W * H)); let h = 0, t = 0; q[t++] = tj * W + ti; Dd[tj * W + ti] = 0;
    while (h < t) { const c = q[h++], ci = c % W, cj = (c / W) | 0, dv = Dd[c] + 1; for (let k = 0; k < 4; k++) { const ni = ci + (k === 0 ? 1 : k === 1 ? -1 : 0), nj = cj + (k === 2 ? 1 : k === 3 ? -1 : 0); if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue; const n = nj * W + ni; if (Dd[n] >= 0 || blk[n]) continue; Dd[n] = dv; q[t++] = n; } }
    return N; },
  navDir(x, z, N) { if (!N) return null; const i = Math.floor(x - N.x0), j = Math.floor(z - N.z0); let best = null, bv = 1e9;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= N.W || nj >= N.H) continue; const v = N.dist[nj * N.W + ni]; if (v < 0) continue; const vv = v + (di && dj ? 0.4 : 0); if (vv < bv) { bv = vv; best = [N.x0 + ni + 0.5, N.z0 + nj + 0.5]; } }
    if (!best) return null; const dx = best[0] - x, dz = best[1] - z, l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; },
  reachable(ax, az, bx, bz) { const N = this.navField(bx, bz, -99 - Math.random()); const i = Math.floor(ax - N.x0), j = Math.floor(az - N.z0); return N.dist[j * N.W + i] >= 0; },

  /* ---------- dynamic objects: gates, levers, lanterns, pickups, notes, NPC slots ---------- */
  buildDynamic() {
    const R = this.data, M = A.mats(), dyn = this.dyn; const glow = P1.glowTex();
    const gy = (x, z) => this.groundY(x, z);
    const wisp = (x, z, col) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: col || 0xffd890, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); s.scale.set(0.9, 0.9, 1); s.position.set(x, gy(x, z) + 0.7, z); dyn.add(s);
      const c = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); c.scale.set(0.22, 0.22, 1); c.position.set(x, gy(x, z) + 0.7, z); dyn.add(c); return [s, c]; };
    for (const g of R.gates) { const ax = g.a[0], az = g.a[1], bx = g.b[0], bz = g.b[1], L = dist(ax, az, bx, bz), ry = Math.atan2(-(bz - az), bx - ax), mx = (ax + bx) / 2, mz = (az + bz) / 2;
      const grp = new THREE.Group(); grp.position.set(mx, gy(mx, mz), mz); grp.rotation.y = ry; dyn.add(grp); const seg = { ax, az, bx, bz, t: 0.3, h: g.kind === 'fog' ? 6 : 8, low: false, cam: g.kind !== 'fog' && g.kind !== 'portcullis', sight: g.kind !== 'portcullis' && g.kind !== 'fog' && g.kind !== 'iron', on: true, gate: g.id };
      this.segs.push(seg); const st = { def: g, seg, grp, parts: [], open: false, anim: 0, target: 0, mx, mz, L };   // target 0: a closed gate's anim was NaN (gate leaves / bars invisible)
      if (g.kind === 'portcullis') { const pc = new THREE.Group(); for (let i = 0; i <= Math.round(L / 0.3); i++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 5.2, 5), M.iron); b.position.set(-L / 2 + i * L / Math.round(L / 0.3), 2.6, 0); b.castShadow = true; pc.add(b); const sp = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.25, 4), M.iron); sp.position.set(b.position.x, -0.05, 0); sp.rotation.x = Math.PI; pc.add(sp); }
          for (const y of [0.8, 2.2, 3.6, 4.9]) { const h = new THREE.Mesh(new THREE.BoxGeometry(L, 0.08, 0.08), M.iron); h.position.y = y; pc.add(h); } A.mergeChildren(pc); grp.add(pc); st.parts.push(pc);
          const arch = new THREE.Mesh(A.boxGeo(L + 1.4, 1.6, 1.6, 3.2), M.stone); arch.position.y = 6.2; grp.add(arch); }
      else if (g.kind === 'door' || g.kind === 'great') { const H = g.kind === 'great' ? 9 : 4.2, n = 2; for (let s = 0; s < n; s++) { const piv = new THREE.Group(); piv.position.set(s ? L / 2 : -L / 2, 0, 0); const leaf = new THREE.Mesh(A.boxGeo(L / 2 - 0.05, H, 0.22, 1.5), M.wood); leaf.position.set((s ? -1 : 1) * (L / 4), H / 2, 0); leaf.castShadow = true; piv.add(leaf);
            for (const y of [0.6, H / 2, H - 0.6]) { const band = new THREE.Mesh(new THREE.BoxGeometry(L / 2, 0.14, 0.26), M.iron); band.position.set(leaf.position.x, y, 0); piv.add(band); } A.mergeChildren(piv); grp.add(piv); st.parts.push(piv); }
          if (g.kind === 'door') { const lin = new THREE.Mesh(A.boxGeo(L + 1, 1.2, 1.2, 3.2), M.stone); lin.position.y = H + 0.6; grp.add(lin); } }
      else if (g.kind === 'iron') { const piv = new THREE.Group(); piv.position.set(-L / 2, 0, 0); for (let i = 0; i <= 10; i++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 3.4, 5), M.rust); b.position.set(0.1 + i * (L - 0.2) / 10, 1.7, 0); piv.add(b); }
          for (const y of [0.4, 1.7, 3.2]) { const h = new THREE.Mesh(new THREE.BoxGeometry(L, 0.07, 0.07), M.rust); h.position.set(L / 2, y, 0); piv.add(h); } A.mergeChildren(piv); grp.add(piv); st.parts.push(piv); }
      else if (g.kind === 'fog') { const m = M.fog.clone(); m._own = true; const pl = new THREE.Mesh(new THREE.PlaneGeometry(L, 5, 1, 1), m); pl.position.y = 2.5; grp.add(pl); st.parts.push(pl); st.fogMat = m; }
      this.gates[g.id] = st;
      const saved = S().opened[g.id]; if (g.startOpen || saved) this.setGate(g.id, true, true); }
    for (const l of R.levers) { const grp = new THREE.Group(); grp.position.set(l.x, gy(l.x, l.z), l.z); grp.rotation.y = l.rot || 0; dyn.add(grp); const base = new THREE.Mesh(A.boxGeo(0.6, 0.9, 0.5), M.stone); base.position.y = 0.45; grp.add(base);
      const piv = new THREE.Group(); piv.position.y = 0.9; grp.add(piv); const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 5), M.iron); stick.position.y = 0.5; piv.add(stick); const knob = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), M.darkwood); knob.position.y = 1.0; piv.add(knob); piv.rotation.x = -0.7;
      this.levers[l.id] = { def: l, piv, pulled: false }; this.circles.push({ x: l.x, z: l.z, r: 0.4, h: 1, cam: false, sight: false, on: true }); if (S().opened[l.opens]) { this.levers[l.id].pulled = true; piv.rotation.x = 0.7; } }
    for (const l of R.lanterns) { const ly = gy(l.x, l.z), grp = new THREE.Group(); grp.position.set(l.x, ly, l.z); dyn.add(grp);
      const parts = PropFX.lantern(grp, M), cx = parts.cx, cy = parts.cy;
      const emberMat = M.ember.clone(); emberMat._own = true; const ember = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), emberMat); ember.position.set(cx, cy - 0.07, 0); grp.add(ember);
      A.mergeChildren(grp, [ember, parts.glass]); grp.traverse(o => { if (o.isMesh) { o.matrixAutoUpdate = false; o.updateMatrix(); } });
      const coal = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xff4a14, opacity: 0.4 })); coal.scale.set(0.7, 0.7, 1); coal.position.set(l.x + cx, ly + cy - 0.06, l.z); dyn.add(coal);
      const tor = { x: l.x + cx, y: ly + cy - 0.05, z: l.z, seed: Math.random() * 9, lantern: l.id, on: false };
      const fl = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.15, 6), M.flame); fl.position.set(tor.x, ly + cy - 0.02, tor.z); dyn.add(fl); const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffb860 })); halo.scale.set(1.9, 1.9, 1); halo.position.set(tor.x, ly + cy, tor.z); dyn.add(halo);
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), M.glowPool); pool.rotation.x = -Math.PI / 2; pool.position.set(l.x + 0.3, ly + 0.035, l.z); dyn.add(pool); Object.assign(tor, { fl, halo, pool }); this.torches.push(tor);
      const embers = []; for (let k = 0; k < 5; k++) { const e = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffa040, opacity: 0 })); e.scale.set(0.07, 0.07, 1); e.visible = false; dyn.add(e); embers.push({ s: e, t: k / 5, life: 1.4 + Math.random() * 0.8, dx: 0, dz: 0 }); }
      this.circles.push({ x: l.x, z: l.z, r: 0.6, h: 2.6, cam: false, sight: false, on: true });
      const st = { def: l, tor, ember, emberMat, coal, glass: parts.glass, embers, top: new THREE.Vector3(l.x + cx, ly + cy + 0.34, l.z) }; this.lanterns[l.id] = st; this.setLantern(l.id, S().lit.includes(l.id)); }
    for (const p of R.pickups) { if (S().collected[p.id]) continue;   // taken pickups are never rebuilt (reload keeps the sword gone)
      if (p.model && p.model.kind === 'sword') { const sm = p.model.bed && this.cartBedY !== undefined ? Object.assign({}, p.model, { y: this.cartBedY }) : p.model, sw = PropFX.sword(sm, gy(sm.x, sm.z));   // merge A+F: a sword on the cart rests on the cart bed actually built
      dyn.add(sw.root); this.pickups[p.id] = { def: p, s: sw.halo, c: sw.glint, model: sw.root, y0: 0, ph: Math.random() * 6 }; continue; }
      if (p.model) { const mx = p.model.x !== undefined ? p.model.x : p.x, mz = p.model.z !== undefined ? p.model.z : p.z, it = PropFX.item(Object.assign({}, p.model, { x: mx, z: mz }), gy(mx, mz));   // chunk G2: a real mesh, not a glow
        dyn.add(it.root); this.pickups[p.id] = { def: p, s: it.halo, c: it.glint, model: it.root, y0: 0, ph: Math.random() * 6, item: true }; continue; }
      const [s, c] = wisp(p.x, p.z, p.upgrade ? 0xff8a50 : p.weapon ? 0xcfe0ff : 0xffd890); s.scale.set(0.45, 0.45, 1); s.material.opacity = 0.35; this.pickups[p.id] = { def: p, s, c, y0: gy(p.x, p.z) + 0.7, ph: Math.random() * 6 }; }   // last-resort fallback only (every region pickup has a model)
    for (const n of R.notes) { const [s, c] = wisp(n.x, n.z, 0xb8c8e8); s.scale.set(0.35, 0.35, 1); c.scale.set(0.1, 0.1, 1); c.material.opacity = 0.4; /* chunk G2: fainter */ this.notes[n.id] = { def: n, s, c, y0: gy(n.x, n.z) + 1.0, ph: Math.random() * 6 }; }
    for (const n of R.npcs) this.npcs[n.id] = { def: n, c: null, f: null };
  },
  setLantern(id, lit) { const st = this.lanterns[id]; if (!st) return; st.lit = lit; st.tor.on = lit; st.tor.fl.visible = st.tor.halo.visible = st.tor.pool.visible = lit; st.ember.visible = st.coal.visible = !lit;
    const gm = st.glass.material; gm.color.setHex(lit ? 0xc9a070 : 0x6f6a66); gm.opacity = lit ? 0.42 : 0.26; if (!lit) gm.emissive.setRGB(0, 0, 0); for (const e of st.embers) e.s.visible = false; },
  /* pickup flash: a short bright bloom where an item was taken */
  flash(x, y, z, col) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: P1.glowTex(), color: col || 0xfff0d0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 1 })); s.position.set(x, y, z); s.scale.set(0.4, 0.4, 1); s.material._own = true; this.dyn.add(s); (this.fx || (this.fx = [])).push({ s, t: 0 }); },
  setGate(id, open, instant) { const st = this.gates[id]; if (!st) return; st.open = open; st.target = open ? 1 : 0; if (instant) st.anim = st.target;
    st.seg.on = !open; if (st.def.kind === 'portcullis' && open && !instant) { st.seg.on = true; st.unlockAt = 1.2; }   // portcullis blocks until it has risen past head height
    this.navDirty = true; },
  updateDynamic(dt, now, px, pz) {
    if (this._cWait && now - this._cWaitT > 0.5) { this._cWaitT = now; if (A.Corpses && A.Corpses.ready()) { this._cWait = false; this.rebuildCorpses(); } else if (++this._cWaitN > 240) this._cWait = false; }   // chunk G2 (polls twice a second for <= 2 min)
    for (const k in this.gates) { const st = this.gates[k]; if (st.unlockAt !== undefined) { st.unlockAt -= dt; if (st.unlockAt <= 0) { st.seg.on = false; delete st.unlockAt; this.navDirty = true; } }
      const sp = st.def.kind === 'portcullis' ? 0.45 : st.def.kind === 'fog' ? 1.6 : 0.6; st.anim += clamp(st.target - st.anim, -sp * dt, sp * dt); const a = st.anim;
      if (st.def.kind === 'portcullis') st.parts[0].position.y = a * 4.6;
      else if (st.def.kind === 'door' || st.def.kind === 'great') { st.parts[0].rotation.y = -a * 1.75; st.parts[1].rotation.y = a * 1.75; }
      else if (st.def.kind === 'iron') st.parts[0].rotation.y = -a * 1.6;
      else if (st.def.kind === 'fog') { st.fogMat.opacity = (1 - a) * (0.32 + 0.08 * Math.sin(now * 2.3)); st.parts[0].visible = a < 0.99; } }
    if (this.navDirty) { this.navDirty = false; this.buildNav(); }
    if (this.crows) for (const c of this.crows) { const m = c.m; if (!m.visible) continue; const d2 = (c.x - px) ** 2 + (c.z - pz) ** 2;   // chunk A2 crows: idle bob / peck / glance, and they take off when you come close
      if (c.fly < 0) { if (d2 > 1600) continue; if (d2 < c.scare * c.scare) { c.fly = 0; c.dx = c.x - px; c.dz = c.z - pz; const l = Math.hypot(c.dx, c.dz) || 1; c.dx /= l; c.dz /= l; m.rotation.y = Math.atan2(c.dx, c.dz); if (A.sfx) A.sfx('crow'); continue; }
        c.t -= dt; if (c.t <= 0) { c.t = 1.2 + ((Math.sin(now * 7.3 + c.ph) + 1) * 1.6); c.look = c.ry + Math.sin(now * 1.9 + c.ph) * 1.1; }
        m.rotation.y += clamp(c.look - m.rotation.y, -dt * 5, dt * 5); const pk = Math.max(0, Math.sin(now * 2.1 + c.ph)); const peck = Math.pow(pk, 16);
        m.rotation.x = peck * 0.55; m.position.y = c.y + Math.abs(Math.sin(now * 9 + c.ph)) * 0.006 + peck * 0.01; }
      else { c.fly += dt; const u = c.fly; m.position.set(c.x + c.dx * u * u * 5, c.y + u * 3.2 + u * u * 1.5, c.z + c.dz * u * u * 5); m.rotation.x = -0.5; m.rotation.z = Math.sin(u * 40) * 0.5; const sc = 1 + Math.sin(u * 40) * 0.25; m.scale.set(sc, 1, 1); if (u > 2.2) m.visible = false; } }
    for (const k in this.pickups) { const p = this.pickups[k];
      if (p.item) { const tw = Math.pow(Math.max(0, Math.sin(now * 1.35 + p.ph)), 24); p.c.material.opacity = 0.06 + tw * 0.3; p.c.material.rotation = now * 0.4; continue; }   // chunk G2: items read by their mesh; a faint periodic glint only
      if (p.model) { const tw = Math.pow(Math.max(0, Math.sin(now * 1.35 + p.ph)), 24); p.c.material.opacity = (p.def.model.upright ? 0.3 : 0.22) + tw * 0.35; p.c.material.rotation = now * 0.4; const sc = 0.3 + tw * 0.25; p.c.scale.set(sc, sc, 1); p.s.material.opacity = 0.12 + 0.04 * Math.sin(now * 1.7 + p.ph); continue; }   // the sword: faint steady sheen + a periodic glint (chunk G2: fainter)
      const y = p.y0 + Math.sin(now * 2 + p.ph) * 0.08; p.s.position.y = p.c.position.y = y; p.s.material.opacity = 0.3 + 0.08 * Math.sin(now * 3.1 + p.ph); }
    if (this.fx) for (let i = this.fx.length - 1; i >= 0; i--) { const f = this.fx[i]; f.t += dt; const u = f.t / 0.5; if (u >= 1) { this.dyn.remove(f.s); f.s.material.dispose(); this.fx.splice(i, 1); continue; } const sc = 0.4 + u * 2.4; f.s.scale.set(sc, sc, 1); f.s.material.opacity = (1 - u) * (1 - u); }
    for (const k in this.notes) { const p = this.notes[k]; const vis = Cond.test(p.def.if); p.s.visible = p.c.visible = vis; if (vis) p.s.material.opacity = 0.25 + 0.1 * Math.sin(now * 2.2 + p.ph); }
    // torch lights: hop to the nearest lit flames; flicker every flame
    const T = tier(), n = Math.min(this.lights.length, T.torches || 0);
    if (!this._lt || now - this._lt > 0.25) { this._lt = now; const best = this._best || (this._best = []), bd = this._bd || (this._bd = []); best.length = bd.length = 0;   // n nearest lit flames, insertion into a tiny array
      for (const t of this.torches) { if (!t.on || t.candle) continue; const d2 = (t.x - px) ** 2 + (t.z - pz) ** 2; if (d2 >= 34 * 34) continue; let k = best.length; if (k >= n && d2 >= bd[n - 1]) continue;
        while (k > 0 && bd[k - 1] > d2) { best[k] = best[k - 1]; bd[k] = bd[k - 1]; k--; } best[k] = t; bd[k] = d2; if (best.length > n) { best.length = n; bd.length = n; } }
      for (let i = 0; i < this.lights.length; i++) { const L = this.lights[i]; L.t = i < n && best[i] ? best[i] : null; L.L.visible = i < n; if (!L.t) L.L.position.set(px, -40, pz); else L.L.position.set(L.t.x, L.t.y + 0.35, L.t.z); } }
    const fx = T.wFx || 70, fx2 = fx * fx, pool2 = (fx * 0.65) ** 2;
    for (const t of this.torches) { if (!t.on || !t.fl) continue; const d2 = (t.x - px) ** 2 + (t.z - pz) ** 2, vis = d2 < fx2; t.fl.visible = vis && !t.candle; t.halo.visible = vis; if (t.pool) t.pool.visible = vis && d2 < pool2; if (!vis) continue;
      const nn = Math.sin(now * 13 + t.seed) * 0.5 + Math.sin(now * 23.7 + t.seed * 1.7) * 0.3 + Math.sin(now * 41.3 + t.seed * 0.3) * 0.2; t.fl.scale.y = (t.big ? 1.8 : 1) * (0.9 + nn * 0.18); t.halo.material.opacity = 0.7 + nn * 0.12; t.nn = nn; }
    const embersOn = (T.torchEmbers || 0) > 0 && !(G.Parts && G.Parts.on());   // merge A+E: when chunk E's GPU particle buffer is drawing (Medium/High/Ultra), it already rises embers from every lantern -> A's sprites stay off (no doubled embers); they return if E's guard turns particles off
    for (const k in this.lanterns) { const st = this.lanterns[k], d2 = (st.tor.x - px) ** 2 + (st.tor.z - pz) ** 2, near = d2 < fx * fx;
      if (st.lit) { const nn = st.tor.nn || 0, gl = 0.75 + nn * 0.28; st.glass.material.emissive.setRGB(0.95 * gl, 0.52 * gl, 0.2 * gl); st.tor.halo.material.opacity = 0.62 + nn * 0.16;
        for (const e of st.embers) { if (!embersOn || !near) { e.s.visible = false; continue; } e.t += dt / e.life; if (e.t >= 1 || !e.s.visible) { e.t = e.t >= 1 ? 0 : e.t; e.dx = (Math.random() - 0.5) * 0.25; e.dz = (Math.random() - 0.5) * 0.25; e.s.visible = true; }
          const u = e.t; e.s.position.set(st.top.x + e.dx * u + Math.sin(now * 3 + e.life * 7) * 0.03 * u, st.top.y + u * 0.9, st.top.z + e.dz * u); e.s.material.opacity = Math.sin(u * Math.PI) * 0.85; } }
      else if (near) { const b = 0.5 + 0.5 * Math.sin(now * 1.6 + st.tor.seed); st.emberMat.color.setRGB(0.45 + 0.4 * b, 0.08 + 0.08 * b, 0.02); st.coal.material.opacity = 0.25 + 0.3 * b; } }
    for (const L of this.lights) if (L.t) L.L.intensity = (L.t.big ? 3.0 : L.t.lantern ? 2.6 : 2.2) * (1 + (L.t.nn || 0) * 0.14) * VISUAL.torch;
    // chunk distance culling against each merged chunk's bounding sphere; the distance follows the tier's fog (nothing past it is visible)
    const dd = T.wDraw || 92; for (const c of this.chunks) { const lim = dd + c.r; c.mesh.visible = (c.x - px) ** 2 + (c.z - pz) ** 2 < lim * lim; }
  },
};
function segX(ax, az, bx, bz, cx, cz, dx, dz) { const d1 = (bx - ax) * (cz - az) - (bz - az) * (cx - ax), d2 = (bx - ax) * (dz - az) - (bz - az) * (dx - ax), d3 = (dx - cx) * (az - cz) - (dz - cz) * (ax - cx), d4 = (dx - cx) * (bz - cz) - (dz - cz) * (bx - cx); return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0)); }

/* =====================================================================
   ENCOUNTERS — field enemies on the core World: idle / patrol / alert / combat / return / dead
   ===================================================================== */
/* ---------- chunk B: aggro tuning + engagement token (one committed field attacker at a time) ----------
   The core Brain already asks w.tokenFree(f) before most attack decisions. In world mode the World INSTANCE gets its own
   tokenFree / claimToken / releaseToken (core.js untouched): bosses keep the core's token to themselves (their pacing is the
   locked v8 behaviour); field foes share Token below. Attacks the brain starts without asking (e.g. punishing a predictable
   heavy) are vetoed on the tick they start, before the strike exists, unless that foe holds the token. */
const AGGRO = { sightLos: 10.5, sight: 9.5, sightAng: 0.95, near: 4, rateNear: 2.4, rateFar: 1.1, rateHear: 1.5, hearSprint: 5.5, hearLoud: 4.5, hearWalk: 2.2,
  decay: 0.6, suspect: 0.08, engageAt: 1.0, groupR: 6, farPlayer: 18, leash: 24, lostSight: 5, lostT: 2 };
const TOK = { gapMin: 0.6, gapMax: 1.0, ringMin: 4, ringMax: 6, close: 3.5, reach: 4.2, reachT: 3, holdT: 4.5, pickR: 14 };
const Token = {
  holder: null, atk: false, since: 0, reachAt: 0, freeAt: 0, prev: null, seed: 1, vetoes: 0, handovers: 0,
  rnd() { this.seed = (this.seed * 16807) % 2147483647; return this.seed / 2147483647; },
  install(w) { const WP = World.prototype; this.holder = this.prev = null; this.atk = false; this.freeAt = 0; this.vetoes = this.handovers = 0; this.seed = ((window.__VEYN_SEED || Date.now()) & 0x7ffffff) + 1;
    const field = f => { const e = Ents.byF.get(f.id); return e && !e.def.boss ? e : null; };
    w.tokenFree = function (f) { const e = field(f); return e ? (e === Token.holder && !A.boss) : WP.tokenFree.call(this, f); };
    w.claimToken = function (f) { const e = field(f); if (!e) return WP.claimToken.call(this, f); if (e === Token.holder) Token.atk = true; };
    w.releaseToken = function (f) { const e = field(f); if (!e) return WP.releaseToken.call(this, f); if (e === Token.holder) Token.release(this); }; },
  release(w) { this.prev = this.holder; this.holder = null; this.atk = false; this.freeAt = w.time + TOK.gapMin + this.rnd() * (TOK.gapMax - TOK.gapMin); },
  update(w) { const p = w.player, h = this.holder;
    if (h) { const f = h.f, d = dist(f.x, f.z, p.x, p.z);
      if (f.dead || h.mode !== 'combat' || A.boss || p.dead) this.release(w);
      else if (this.atk && f.state !== 'attack') this.release(w);                                     // finished (or interrupted): hand over after the gap
      else if (!this.atk) { if (d < TOK.reach) this.reachAt = w.time;
        if (w.time - this.reachAt > TOK.reachT || w.time - this.since > TOK.holdT) { h.tokBan = w.time + 2; this.release(w); } } }   // anti-deadlock: can't reach / won't swing
    if (this.holder || A.boss || p.dead || w.time < this.freeAt) return;
    let best = null, bs = 1e9; for (const e of Ents.list) { const f = e.f; if (e.mode !== 'combat' || e.def.boss || f.dead || e.path || f.state === 'attack') continue;
      const d = dist(f.x, f.z, p.x, p.z); if (d > TOK.pickR || !Region.los(f.x, f.z, p.x, p.z)) continue;
      const s = d + (e === this.prev ? 3 : 0) + ((e.tokBan || 0) > w.time ? 50 : 0) + (f.canAct() ? 0 : 2); if (s < bs) { bs = s; best = e; } }
    if (best) { this.holder = best; this.atk = false; this.since = this.reachAt = w.time; this.handovers++; } },
  /* after the brain's tick: veto an unpermitted attack start; non-holders hold a 4–6 m ring (circle / guard / telegraph, never crowd) */
  after(w, e, was) { const f = e.f, own = e === this.holder && !A.boss;
    if (!was && f.state === 'attack' && !own) { f.atk = null; f.comboQueue.length = 0; f.comboBr = null; f.setState('idle'); e.brain.set('circle', 'waiting turn'); this.vetoes++;
      for (let i = w.events.length - 1; i >= 0; i--) { const ev = w.events[i]; if (ev.f === f.id && ev.t === w.time && (ev.type === 'attackStart' || ev.type === 'danger')) w.events.splice(i, 1); } }
    if (own || !f.canAct()) return;
    const p = w.player, dx = f.x - p.x, dz = f.z - p.z, d = Math.hypot(dx, dz) || 1e-3, ring = e.ring || 5; if (d > ring + 0.8) return;   // far: the brain closes in
    const ux = dx / d, uz = dz / d, rad = d < ring - 0.25 ? 1 : d > ring + 0.4 ? -0.6 : 0, cd = e.brain.circleDir || 1;
    const mx = ux * rad - uz * cd * 0.7, mz = uz * rad + ux * cd * 0.7, m = Math.hypot(mx, mz) || 1, sp = f.profile.speed * (d < TOK.close ? 0.85 : 0.5);
    f.intent.mx = mx / m * sp; f.intent.mz = mz / m * sp; },
};

const Ents = {
  list: [], byF: new Map(), killed: new Set(),   // killed: fallen since the last rest (respawn on rest / death); bosses persist in the save
  clear() { this.list = []; this.byF.clear(); },
  spawnAll(w) { for (const def of Region.data.enemies) { if (S().defeated[def.id] || this.killed.has(def.id)) continue; this.spawn(w, def); } },
  spawn(w, def) {
    const f = w.addEnemy(def.type, def.x, def.z); f.facing = def.face || 0; f.aiFace = f.facing; f.vx = f.vz = 0;
    const e = { def, f, brain: f.brain, mode: def.patrol ? 'patrol' : 'idle', wp: 1, wait: 0, alert: 0, lost: 0, home: { x: def.x, z: def.z, face: f.facing }, path: false };
    f.brain = null; const ob = e.brain.update.bind(e.brain);
    e.ring = TOK.ringMin + Token.rnd() * (TOK.ringMax - TOK.ringMin);   // chunk B: this foe's waiting distance while another holds the token
    e.brain.update = function (W, dt) {   // instance wrap: around corners, follow the nav field instead of walking into the wall
      if (e.path && W.player && !W.player.dead && f.canAct()) { const N = Region.navField(W.player.x, W.player.z, W.time); const dir = Region.navDir(f.x, f.z, N);
        if (dir) { const sp = f.profile.speed; f.intent.mx = dir[0] * sp; f.intent.mz = dir[1] * sp; f.aiFace = Math.atan2(dir[0], dir[1]); f.guard = false; return; } }
      const was = f.state === 'attack'; ob(W, dt); if (!e.def.boss && W.player && !W.player.dead) Token.after(W, e, was); };
    const c = new Character(f, f.profile.look); Game.chars.set(f.id, c); e.c = c; this.list.push(e); this.byF.set(f.id, e); return e; },
  engage(e, why) { if (e.mode === 'combat' || e.mode === 'dead' || !Game.world) return; e.mode = 'combat'; e.lost = 0; e.alert = 1; e.f.brain = e.brain; e.brain.set('approach', why || 'spotted'); e.engagedAt = Game.world.time;
    if (e.def.tut && !S().flags['tut_' + e.def.tut]) { S().flags['tut_' + e.def.tut] = true; Coach.on = true; e.coach = true;
      const line = { deflect: 'Tap F as the blade lands to deflect', thrust: 'Thrusts (red rune): deflect, or dash INTO them with C — Counterstep', sweep: 'Sweeps (red rune): jump with Space, then strike in the air', stealth: 'Unseen foes die to one blow: stay behind them, walk, and press E' }[e.def.tut]; if (line) setTimeout(() => Coach.say(line, 3.2), 300); }
    const pl = Game.world.player;   // chunk B: smaller chain-pull, and only foes that can themselves see the player
    if (why !== 'group') for (const o of this.list) if (o !== e && o.mode !== 'combat' && o.mode !== 'dead' && !o.def.boss && dist(o.f.x, o.f.z, e.f.x, e.f.z) < AGGRO.groupR && Region.los(o.f.x, o.f.z, e.f.x, e.f.z)
      && dist(o.f.x, o.f.z, pl.x, pl.z) < AGGRO.sight && Region.los(o.f.x, o.f.z, pl.x, pl.z)) { o.alert = 0.5; setTimeout(() => this.engage(o, 'group'), 350 + Math.random() * 300); }
    if (!e.def.boss) audio.play('cue'); },
  disengage(e) { if (e.mode !== 'combat') return; e.mode = 'return'; e.f.brain = null; e.f.guard = false; e.path = false; e.alert = 0; e.retT = 0; if (Game.world && Game.world.player.lockId === e.f.id) Game.world.player.lockId = null; },
  update(dt, w) {
    const p = w.player, sprint = p.moveSpeed > 5.2, loud = p.state === 'attack', farAi = tier().wAi || 60, K = AGGRO;
    Token.update(w);
    for (const e of this.list) { const f = e.f; if (f.dead) { if (e.mode !== 'dead') e.mode = 'dead'; continue; }
      if (A.cineHeld && A.cineHeld.has(f)) continue;   // held still while a boss finisher plays
      const d = dist(p.x, p.z, f.x, f.z);
      if (e.mode === 'combat') {
        e.path = (d > 2.8 && !Region.los(f.x, f.z, p.x, p.z)) || Math.abs(Region.groundY(f.x, f.z) - Region.groundY(p.x, p.z)) > A.LEDGE;   // other level: take the stairs
        if (e.def.boss) continue;
        const far = d > K.farPlayer || dist(f.x, f.z, e.home.x, e.home.z) > K.leash || (e.path && w.time - (e.seenAt || 0) > K.lostSight);
        if (!e.path) e.seenAt = w.time; e.lost = far ? e.lost + dt : Math.max(0, e.lost - dt); if (e.lost > K.lostT) this.disengage(e); continue; }
      if (p.dead) { f.intent.mx = f.intent.mz = 0; continue; }
      if (d > farAi && e.mode !== 'return') { f.intent.mx = f.intent.mz = 0; continue; }   // perf: idle / patrolling foes far from the player stand still (no perception, no patrol steering)
      // perception (bosses wait for their arena trigger)
      if (!e.def.boss && d < 30) { const toP = Math.atan2(p.x - f.x, p.z - f.z), ang = Math.abs(angNorm(toP - f.facing)), los = d < K.sightLos && Region.los(f.x, f.z, p.x, p.z);
        const sees = los && ((d < K.sight && ang < K.sightAng) || d < 2.2), hears = los && (d < (sprint ? K.hearSprint : loud ? K.hearLoud : K.hearWalk));
        if (sees || hears) e.alert += dt * (sees ? (d < K.near ? K.rateNear : K.rateFar) : K.rateHear); else e.alert = Math.max(0, e.alert - dt * K.decay);
        if (e.alert > K.suspect && e.mode !== 'return') { f.aiFace = toP; f.intent.mx = f.intent.mz = 0; }   // suspicious (?): stop and look
        if (e.alert >= K.engageAt) { this.engage(e, 'spotted'); continue; } }
      if (e.alert > K.suspect && e.mode !== 'return') continue;
      if (e.mode === 'return') { e.retT += dt; const dx = e.home.x - f.x, dz = e.home.z - f.z, l = Math.hypot(dx, dz);
        if (l < 0.8 || e.retT > 7) { if (l >= 0.8 && d > 12) { f.x = f.px = e.home.x; f.z = f.pz = e.home.z; } f.hp = f.maxHp; f.posture = 0; e.mode = e.def.patrol ? 'patrol' : 'idle'; f.intent.mx = f.intent.mz = 0; continue; }
        f.intent.mx = dx / l * 2.2; f.intent.mz = dz / l * 2.2; f.aiFace = Math.atan2(dx, dz); continue; }
      if (e.mode === 'patrol') { const P = e.def.patrol, t = P[e.wp % P.length], dx = t[0] - f.x, dz = t[1] - f.z, l = Math.hypot(dx, dz);
        if (e.wait > 0) { e.wait -= dt; f.intent.mx = f.intent.mz = 0; continue; }
        if (l < 0.6) { e.wp++; e.wait = 1.2 + Math.random(); continue; } f.intent.mx = dx / l * 1.35; f.intent.mz = dz / l * 1.35; f.aiFace = Math.atan2(dx, dz); }
      else { f.intent.mx = f.intent.mz = 0; f.aiFace = e.home.face; } }
  },
  stealthTarget(p) { for (const e of this.list) { if (e.mode === 'combat' || e.mode === 'dead' || e.def.boss || e.def.elite || e.f.dead || e.alert >= 0.5) continue; const f = e.f, d = dist(p.x, p.z, f.x, f.z); if (d > 2.4) continue;
      const behind = Math.abs(angNorm(Math.atan2(p.x - f.x, p.z - f.z) - f.facing)) > 1.6; if (behind || e.alert < 0.15) return e; } return null; },
};

/* =====================================================================
   WORLD MODE CONTROLLER
   ===================================================================== */
const ADV = Object.assign(A, { active: false, Save, Inv, Cond, Quests, Region, Ents, act, state: null, drink: null, busy: 0, dying: null, boss: null, npcs: {}, time: 0 });
let savedArena = null, savedFog = null;
A.sfx = function (name) { if (!audio.ok) return; switch (name) {
  case 'kindle': audio.nz(0.6, 'bandpass', 400, 0.8, 0.3, 0.6, 0, 2400); [523, 659, 784].forEach((f, i) => audio.tone(f, 1.2, 'sine', 0.05, 0.15 + i * 0.12)); break;
  case 'crow': audio.nz(0.5, 'bandpass', 1700, 3, 0.05, 0.45, 0.01, 900); [0, 0.22].forEach(t => audio.tone(520, 0.16, 'sawtooth', 0.025, t, 380)); break;   // wingbeats + two caws
  case 'pickup': [880, 1320].forEach((f, i) => audio.tone(f, 0.5, 'sine', 0.06, i * 0.08)); break;
  case 'blade': audio.nz(0.22, 'bandpass', 2600, 1.4, 0.1, 0.22, 0.02, 6200); [1568, 2349, 3520].forEach((f, i) => audio.tone(f, 0.9 - i * 0.2, 'sine', 0.035 / (i + 1), 0.05)); break;   // draw-ring of steel
  case 'gate': audio.nz(2.4, 'lowpass', 220, 1, 0.35, 1.6, 0, 120); audio.tone(55, 2.2, 'sawtooth', 0.05); break;
  case 'lever': audio.nz(0.2, 'lowpass', 600, 1, 0.4, 0.2); audio.tone(140, 0.2, 'square', 0.06); break;
  case 'drink': audio.nz(0.5, 'bandpass', 900, 2, 0.08, 0.4, 0, 500); audio.tone(392, 0.8, 'sine', 0.06, 0.3, 523); break;
  case 'alert': audio.tone(311, 0.16, 'triangle', 0.06); break;
  case 'refused': audio.tone(41, 2.6, 'sine', 0.35, 0, 30); [196, 185].forEach((f, i) => audio.tone(f, 2.2, 'triangle', 0.04, 0.4 + i * 0.3)); break;
  case 'page': audio.nz(0.15, 'highpass', 2500, 1, 0.08, 0.12); break;
} };

/* ---------- entering / leaving world mode ---------- */
A.enter = function () {
  if (A.active) return; A.active = true; document.body.classList.add('adv');
  for (const o of Arena.objects || []) scene.remove(o); if (P1.TorchEmbers.pts) scene.remove(P1.TorchEmbers.pts);
  savedArena = { radius: CONFIG.arena.radius, pillars: CONFIG.arena.pillars }; CONFIG.arena.radius = 1e5; CONFIG.arena.pillars = [];   // world walls replace the arena circle
  savedFog = VISUAL.fogDensity; VISUAL.fogDensity = 0.03; A._tierApplied = null;
  Game.mode = 'adv'; Game.enc = 'world'; const bn = document.querySelector('#hudPlayer .bname'); if (bn) { A._bn = bn.textContent; bn.textContent = 'Wren — the Unhanged'; }
};
/* perf: per-tier fog density and draw distance in world mode (the fog hides everything past the cull distance, so the far plane follows it) */
A.applyTier = function () { const T = tier(), M = A.mats();
  for (const k of ['mud', 'dirt', 'flag', 'cell', 'bonef']) { const m = M[k], want = T.normalMaps && T.wFloorNormal !== false && m.userData.normalHi || null; if (m.normalMap !== want) { m.normalMap = want; if (want) m.normalScale.set(m.userData.nK, m.userData.nK); m.needsUpdate = true; } }
  if (A._tierApplied === T) return; A._tierApplied = T;
  VISUAL.fogDensity = T.wFog || 0.03; A.lowShading(!!T.lambert); PropFX.metalTune(); if (Keys.mat) { Keys.mat.metalness = T.env ? 0.85 : 0.45; Keys.mat.roughness = T.env ? 0.38 : 0.5; }   // chunk G2   // (camera.far stays: the sky dome sits past the draw distance)
  const all = T.wRecv !== 'floor', rs = o => { if (o.isMesh && o.material && !Array.isArray(o.material)) o.receiveShadow = all || !!o.material.userData.floor; };   // Medium: only the ground takes shadows
  if (Region.root) Region.root.traverse(rs); if (Region.dyn) Region.dyn.traverse(rs); };
A.lowShading = function (on) { const tw = A.mats()._twin; if (!tw) return; const sw = o => { if (!o.isMesh || !o.material || Array.isArray(o.material)) return; const t = tw.get(o.material); if (t && (!!t.isMeshLambertMaterial) === on) o.material = t; };
  if (Region.root) Region.root.traverse(sw); if (Region.dyn) Region.dyn.traverse(sw); for (const m of tw.values()) m.needsUpdate = true; };   // recompile against the current light set
A.leave = function () {
  if (!A.active) return; A.active = false; document.body.classList.remove('adv');
  for (const c of Game.chars.values()) c.dispose(); Game.chars.clear(); Game.world = null; A.clearNpcExits();
  Region.unload(); for (const o of Arena.objects || []) scene.add(o); if (P1.TorchEmbers.pts) scene.add(P1.TorchEmbers.pts);
  if (savedArena) { CONFIG.arena.radius = savedArena.radius; CONFIG.arena.pillars = savedArena.pillars; } if (savedFog !== null) VISUAL.fogDensity = savedFog;
  A._tierApplied = null;
  Game.mode = null; Game.enc = 'duelist'; ['advCompass', 'advObj', 'advPrompt', 'advFlask'].forEach(id => UI.show(id, false)); UI.hideMarks(); UI.show('advDlg', false); UI.show('advMenu', false); UI.show('advDeath', false);
  Coach.on = false; Ents.clear(); Ents.killed.clear(); const bn = document.querySelector('#hudPlayer .bname'); if (bn && A._bn) bn.textContent = A._bn;
};
A.newGame = function () { Save.wipe(); Save.data = Save.fresh(); Save.data.lantern = null; Save.write(true); A.prologue(() => A.start()); };
A.continueGame = function () { const st = Save.load(); if (st === 'ok' || st === 'restored') { A.start(); if (st === 'restored') toast('Your save was damaged \u2014 restored from the backup slot.'); } else A.saveProblem(st); };
A.start = function () {
  try {
    audio.ensure(); A.enter(); Game.overlay(null); if ($('advEnd')) UI.show('advEnd', false);
    Region.load(S().region || 'execution'); A.checkPoints();
    const R = Region.data; A.time = 0; Ents.killed.clear(); if (S().defeated.odran) A.Keys.ensure('odran', 'headkey', 0, 52.5);   // old saves: a felled Odran whose key was never dropped
    const sp = A.spawnPoint(); A.buildWorld(sp);
    Game.state = 'playing'; Game.showHud(true); ['advCompass', 'advFlask'].forEach(id => UI.show(id, true)); A.refreshObjective();
    if (!S().lantern && !S().flags.started) { S().flags.started = true; setTimeout(() => UI.area(R.name, 'Chapter I'), 400); } else UI.area((A.zoneName(sp.x, sp.z)) || R.name, R.name);
    Fade.a = 1; Fade.set(0, 0.6, '0,0,0'); Save.write(); try { $('c').focus(); } catch (e) {}
    A.ready = true;
  } catch (e) { console.error('[Veynhold] world start failed', e); A.fail(e); }
};
A.fail = function (e) { try { A.leave(); } catch (x) {} Game.state = 'title'; Game.overlay('title'); toast('The world could not load (' + (e && e.message || e) + '). Trials still work.'); };
A.lanternSpawn = l => l.spawn ? { x: l.spawn[0], z: l.spawn[1], facing: l.spawnFacing || 0 } : { x: l.x - 0.4, z: l.z - 1.7, facing: 0 };
A.spawnPoint = function () { const R = Region.data, l = S().lantern && R.lanterns.find(x => x.id === S().lantern); if (l) return A.lanternSpawn(l); return Object.assign({}, R.spawn); };
/* assert (repair step 1): every spawn, respawn, lantern, NPC and enemy point stands on valid ground, inside a zone, and clear of every
   collision segment (walls, gates, ledges, stair rails) and collider circle. Runs on each region load; problems go to console.error. */
A.checkPoints = function () { const R = Region.data, out = [];
  const test = (label, x, z, r, ignore) => { const gy = Region.groundY(x, z); if (!isFinite(gy)) out.push(label + ': no ground height'); if (!Region.zoneAt(x, z)) out.push(label + ': outside every zone');
    for (const s of Region.segs) { if (!s.on && !s.gate) continue; const ex = s.bx - s.ax, ez = s.bz - s.az, L2 = ex * ex + ez * ez || 1e-6, t = clamp(((x - s.ax) * ex + (z - s.az) * ez) / L2, 0, 1), d = dist(x, z, s.ax + ex * t, s.az + ez * t);
      if (d < s.t + r - 0.01) out.push(label + ' (' + x + ', ' + z + ') inside ' + (s.ledge ? 'a ledge' : s.rail ? 'a stair rail' : s.gate ? 'gate ' + s.gate : s.low ? 'a low wall' : 'a wall') + ' at ' + s.ax.toFixed(1) + ',' + s.az.toFixed(1) + ' -> ' + s.bx.toFixed(1) + ',' + s.bz.toFixed(1)); }
    for (const c of Region.circles) { if (c === ignore || c.npc) continue; if (dist(x, z, c.x, c.z) < c.r + r - 0.01) out.push(label + ' (' + x + ', ' + z + ') inside a collider at ' + c.x.toFixed(1) + ',' + c.z.toFixed(1)); } };
  test('start spawn', R.spawn.x, R.spawn.z, 0.45);
  for (const l of R.lanterns) { const own = Region.circles.find(c => c.x === l.x && c.z === l.z && c.r === 0.6); test('lantern ' + l.id, l.x, l.z, 0.55, own); const sp = A.lanternSpawn(l); test('lantern ' + l.id + ' respawn', sp.x, sp.z, 0.45); }
  for (const n of R.npcs) test('npc ' + n.id, n.x, n.z, 0.45, (D.NPCS[n.id] || {}).caged ? Region.circles.find(c => c.x === n.x && c.z === n.z) : null);   // a caged NPC stands inside her own cage
  for (const e of R.enemies) { test('enemy ' + e.id, e.x, e.z, 0.4); (e.patrol || []).forEach((w, i) => test('enemy ' + e.id + ' patrol ' + i, w[0], w[1], 0.4)); }
  Region.pointIssues = out; if (out.length) console.error('[Veynhold] point check: ' + out.length + ' problem(s): ' + out.join('; ')); return out; };
A.zoneName = (x, z) => { const zn = Region.zoneAt(x, z); return zn && !zn.silent ? zn.name : null; };
A.buildWorld = function (sp) {
  for (const c of Game.chars.values()) c.dispose(); Game.chars.clear(); FX.clear(); if (G.V7 && G.V7.VFX) G.V7.VFX.clear(); if (G.Projectiles) G.Projectiles.clear(); Input.clear(); if (P1.Debug) P1.Debug.reset(); if (G.Juice) G.Juice.clear(); if (G.Cine) G.Cine.clear(); NameCard.hide(); P1.Cinema.clear();
  Ents.clear(); A.boss = null; A.drink = null; A.dying = null;
  const w = new World(window.__VEYN_SEED ? (window.__VEYN_SEED + (A.seedN = (A.seedN || 0) + 1)) : (Date.now() & 0xffff) + 1); w.over = 'adv'; Game.world = w; Token.install(w);   // sentinel: the core never ends a world-mode "encounter"; deaths/kills are handled here
  A.cineHeld = null; const step = w.step.bind(w); w.step = function (dt) { A.holdForCine(w); step(dt); for (const f of w.fighters) if (!f.dead || f.state === 'dead') Region.collide(f, f.isPlayer && f.airborne); };
  const p = w.addPlayer(sp.x, sp.z); p.facing = sp.facing || 0; p.name = 'Wren'; A.applyUpgrades(p); p.hp = p.maxHp;
  Game.chars.set(p.id, new Character(p, 'player'));
  Ents.spawnAll(w); A.clearNpcExits(); A.spawnNpcs();
  Cam.yaw = sp.facing || 0; Cam.pitch = 0.3; Cam.gy = Region.groundY(p.x, p.z); Cam.lookSm.set(p.x, 1.5 + Cam.gy, p.z); Cam.curDist = CONFIG.camera.dist; for (const k in Cam.vel) Cam.vel[k] = 0; Cam.trauma = 0; Cam.fovKick = 0;
  HUD.lagP = 1; HUD.lagT = 1; HUD.lagTid = -1; Game.t0 = 0; Game.softT = 0; Coach.on = false; $('coach').style.opacity = 0; $('practice').style.display = 'none';
  // reset the boss gate for an undefeated boss
  for (const def of Region.data.enemies) if (def.arena && !S().defeated[def.id]) Region.setGate(def.arena.gate, true, true);
};
A.applyUpgrades = function (p) { const u = S().upgrades; p.maxHp = 100 + (u.includes('heart') ? 20 : 0); p.postureMax = Math.round(100 * (u.includes('yoke') ? 1.2 : 1)); };
A.spawnNpcs = function () { for (const k in Region.npcs) { const n = Region.npcs[k]; if (n.c) { n.c.dispose(); n.c = null; } } A.npcs = {};
  for (const k in Region.npcs) { const n = Region.npcs[k], def = n.def; if (!Cond.test(def.if)) continue; const N = D.NPCS[def.id]; if (!N) continue;
    const f = new CORE.Fighter({ team: 2, name: N.name, x: def.x, z: def.z, hp: 100, postureMax: 100, radius: 0.45, facing: def.face || 0 }); f.px = f.x; f.pz = f.z; f.pvx = f.pvz = 0;
    let c = null; try { c = new Character(f, N.look); } catch (e) { console.warn(e); } n.f = f; n.c = c; A.npcs[k] = n;
    if (!N.caged) Region.circles.push({ x: def.x, z: def.z, r: 0.5, h: 2, cam: false, sight: false, on: true, npc: k }); }
  Region.rehash(); };

/* ---------- boss finisher in the open world: a world boss's final deathblow plays the finisher cinematic even while field foes
   elsewhere live (game.js asks Game.worldBossFinal); those foes are held in hit-stop (core freeze) until the cinematic ends. ---------- */
Game.worldBossFinal = function (vic) { return !!(A.active && A.boss && A.boss.e && A.boss.e.f === vic); };
A.holdForCine = function (w) { const F = G.P1.Finale;
  if (!A.active || !F.active) { A.cineHeld = null; return; }
  if (!A.cineHeld) A.cineHeld = new Set(w.fighters.filter(f => !f.isPlayer && !f.dead && f !== F.v && f !== F.a));
  for (const f of A.cineHeld) if (!f.dead) f.freeze = Math.max(f.freeze, 1); };

/* ---------- NPC exits: an NPC whose spawn condition just turned false (e.g. Ilsabet once freed) says a farewell, walks off for a few
   seconds while fading, then is disposed. Purely visual and not saved: a reload mid-exit simply never spawns her. ---------- */
A.npcExits = [];
A.detachNpcExits = function () { for (const k in A.npcs) { const n = A.npcs[k], N = D.NPCS[n.def.id]; if (!N || !N.exit || !n.c || Cond.test(n.def.if)) continue;
    A.npcExits.push({ k, c: n.c, f: n.f, X: N.exit, t: 0 }); n.c = null; if (N.exit.hint) UI.hint(N.exit.hint, 5); } };
A.clearNpcExits = function () { for (const e of A.npcExits) { try { e.c.dispose(); } catch (x) {} } A.npcExits.length = 0; };
A.fadeChar = function (c, k) {
  if (!c._fade) { const owned = new Set([].concat(c.mats || [], c.model ? c.model.mats : [], c.v7mats || [], c.v7steel || [])), live = new Set([c.blob && c.blob.material].concat((c.feetAO || []).map(o => o.material)));
    const list = [], seen = new Set();
    const grab = o => { if (!o.material) return; const arr = Array.isArray(o.material) ? o.material : [o.material];
      const out = arr.map(m => { let mm = m; if (!owned.has(m) && !live.has(m)) { mm = m.clone(); c.mats.push(mm); owned.add(mm); }
        if (!seen.has(mm)) { seen.add(mm); list.push({ m: mm, o: mm.opacity, live: live.has(mm) }); mm.transparent = true; mm.depthWrite = false; mm.needsUpdate = true; } return mm; });
      o.material = Array.isArray(o.material) ? out : out[0]; };
    c.root.traverse(grab); [c.clothCape, c.clothScarf, c.clothSash].forEach(cl => { if (cl && cl.mesh) grab(cl.mesh); }); (c.feetAO || []).forEach(grab);
    c._fade = list; }
  for (const e of c._fade) e.m.opacity = (e.live ? e.m.opacity : e.o) * k; c.fadeK = k; };
A.updateNpcExits = function (dt, now) {
  for (let i = A.npcExits.length - 1; i >= 0; i--) { const e = A.npcExits[i], f = e.f, c = e.c, X = e.X, dur = X.dur || 3, spd = X.speed || 1.5;
    e.t += dt; if (e.t >= dur) { try { c.dispose(); } catch (x) {} A.npcExits.splice(i, 1); continue; }
    const dir = X.dir || 0, ramp = clamp(e.t / 0.4, 0, 1);   // dir: world heading (0 = +z, north)
    f.facing += clamp(angNorm(dir - f.facing), -dt * 5, dt * 5); f.pfacing = f.facing;
    f.state = 'move'; f.pvx = f.vx || 0; f.pvz = f.vz || 0; f.vx = Math.sin(f.facing) * spd * ramp; f.vz = Math.cos(f.facing) * spd * ramp;
    f.px = f.x; f.pz = f.z; f.x += f.vx * dt; f.z += f.vz * dt;
    c.root.visible = true; c.culled = false; c.update(dt, 1, now);
    A.fadeChar(c, clamp(1 - e.t / dur, 0, 1)); } };

/* ---------- per-frame: before the sim step (called from the wrapped gatherIntent) ---------- */
A.preStep = function (dt) {
  const w = Game.world, p = w.player; const I = p.intent;
  if (A.busy > 0 || A.dying || p.dead) { I.mx = I.mz = 0; I.light = I.heavy = I.charged = I.dodge = I.jump = I.deathblow = I.parry = false; I.guard = false; }
  if (!Inv.count('wardblade')) { I.light = I.heavy = I.charged = false; }   // unarmed until the sword is recovered (guard/dodge still work)
  if (A.drink) { I.light = I.heavy = I.charged = I.dodge = I.jump = I.deathblow = false; I.mx *= 0.35; I.mz *= 0.35; I.sprint = false; }
  Ents.update(dt, w);
};
/* key E: interact or unseen deathblow (runs before the v8 intent read so the press is consumed exactly once) */
A.preIntent = function () {
  const w = Game.world, p = w.player; if (!p || p.dead || A.busy > 0) return;
  if (Settings.invertY) { Input.mdy = -Input.mdy; if (G.Pad) G.Pad.ry = -G.Pad.ry; }   // G4: invert Y covers the gamepad's right stick too
  if (Input.pressed.KeyE) {
    if (w.deathblowCandidate(p)) return;                                       // a real deathblow always wins
    const st = Inv.count('wardblade') && Ents.stealthTarget(p);
    if (st && p.canAct()) { CORE.addPosture(w, st.f, 1e5); st.unseen = true; st.f.brain = null; p.lockId = null; S().flags.tut_stealth = true; return; }   // posture break -> the same core deathblow path
    const it = A.inter; if (it && p.canAct()) { Input.pressed.KeyE = false; A.eQ = null; it.act(); return; }
    if (it) A.eQ = w.time;   // chunk C: E pressed mid-recovery (dash, landing, swing) is held briefly instead of silently dropped
  } else if (A.eQ !== null && A.eQ !== undefined) { if (w.time - A.eQ > 0.9 || w.time < A.eQ || p.state === 'deathblowExec') A.eQ = null; else if (p.canAct() && A.inter) { A.eQ = null; A.inter.act(); return; } }
  if (Input.pressed.KeyR) { Input.pressed.KeyR = false; A.startDrink(); }
};
A.startDrink = function () { const w = Game.world, p = w && w.player; if (!p || p.dead || A.drink || !p.canAct()) return; if ((S().inv.draught || 0) <= 0) { toast('No Lantern Draughts left \u2014 rest at a Vigil Lantern'); return; } if (p.hp >= p.maxHp) { toast('Already at full health'); return; }
  A.drink = { t: 0, hp0: p.hp }; A.sfx('drink'); };
A.updateDrink = function (dt) { const d = A.drink; if (!d) return; const p = Game.world.player; d.t += dt;
  if (p.dead || p.state === 'hit' || p.state === 'broken' || p.hp < d.hp0 - 0.01) { A.drink = null; toast('Interrupted'); return; }
  if (d.t >= 1.0) { A.drink = null; S().inv.draught = Math.max(0, (S().inv.draught || 0) - 1); p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.4); p.posture = Math.max(0, p.posture - 10);
    const c = Game.chars.get(p.id); if (c) FX.spark(c.root.position.clone().setY((c.gy || 0) + 1.2), 18, 0.7, [1, 0.75, 0.35]); Save.write(); } };

/* ---------- events (before the v8 handler consumes them) ---------- */
A.onEvents = function (w) {
  for (const e of w.events) {
    if (e.type === 'gameover') { e.type = 'advIgnored'; continue; }
    if (e.type === 'death' && e.f === w.player.id) { A.startDeath(); continue; }
    if ((e.type === 'hit' || e.type === 'block' || e.type === 'deflect' || e.type === 'postureBreak') && e.a === w.player.id) { const en = Ents.byF.get(e.d); if (en && en.mode !== 'combat' && !en.unseen) Ents.engage(en, 'struck'); }
    if (e.type === 'deathblow' && e.a === w.player.id) { if (S().upgrades.includes('tithe')) { const p = w.player; p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.15); } const en = Ents.byF.get(e.d); if (en && en.unseen) { setTimeout(() => P1.Letterbox.set(false), 900); } }
    if (e.type === 'postureBreak') { const en = Ents.byF.get(e.f); if (en && en.unseen) e.type = 'advSilentBreak'; }
    if (e.type === 'enemyDead') A.onKill(Ents.byF.get(e.f));
  }
};
A.onKill = function (en) { if (!en) return; en.mode = 'dead'; S().kills++; if (en.coach) { setTimeout(() => { if (!Ents.list.some(o => o.coach && o.mode === 'combat')) Coach.on = false; }, 2500); }
  const def = en.def; Ents.killed.add(def.id);
  if (def.drop) A.Keys.drop(def, en.f);   // chunk C: a carried key falls to the ground as a real item (taken with E; persists in the save until taken)
  if (def.boss) { S().defeated[def.id] = true; if (A.boss && A.boss.e === en) A.endBoss(true); else if (def.card) setTimeout(() => UI.area(def.card[0] + ' FALLEN', ''), 1600); }
  Save.write(); };

/* ---------- bosses ---------- */
A.checkBoss = function () { const w = Game.world, p = w.player; if (A.boss || p.dead) return;
  for (const en of Ents.list) { const def = en.def; if (!def.boss || en.mode === 'dead') continue;
    if (def.arena) { if (dist(p.x, p.z, def.arena.x, def.arena.z) < def.arena.r) A.startBoss(en); }
    else if (dist(p.x, p.z, en.f.x, en.f.z) < 9.5 && Region.los(p.x, p.z, en.f.x, en.f.z)) A.startBoss(en); } };
A.startBoss = function (en) { const def = en.def; A.boss = { e: en, def }; if (def.arena) { Region.setGate(def.arena.gate, false); Quests.set('main', 6, 'max'); }
  Ents.engage(en, 'boss'); const card = [en.f.profile.name, (def.card && def.card[1]) || '', true];
  if (def.bark) { UI.hint('\u201c' + def.bark + '\u201d', 4.5); }
  const first = !S().flags['intro_' + def.id]; S().flags['intro_' + def.id] = true;
  if (def.boss === 'region' && first && G.Intro.enabled && Settings.intros !== false) G.Intro.start(en.f, card); else NameCard.show(card[0], card[1], card[2]); };
A.endBoss = function (won) { const b = A.boss; if (!b) return; A.boss = null; const def = b.def;
  if (won) { if (def.arena) Region.setGate(def.arena.gate, true);
    setTimeout(() => { UI.area(def.boss === 'region' ? 'HEADSMAN FELLED' : 'PENITENT SILENCED', def.boss === 'region' ? 'Odran Vale, the Iron Warden' : ''); audio.play('victorySting'); }, 1700);
    if (def.reward && def.boss === 'region') A.grantUpgrade(def.reward, 3600);
    if (def.id === 'odran') { Quests.set('main', 7, 'max'); setTimeout(() => { if (A.active && Game.world && !Game.world.player.dead && Game.state === 'playing' && !S().flags.odran_spoke) A.dialogue('odran_dying', { name: 'Odran Vale', title: 'The Iron Warden' }); }, 5600); }
    Save.write(); } };
A.grantUpgrade = function (id, showDelay) { const d = S(); if (d.upgrades.includes(id)) return; d.upgrades.push(id); const U = D.UPGRADES[id];
  const p = Game.world && Game.world.player; if (p) { const hpK = p.hp / p.maxHp; A.applyUpgrades(p); p.hp = p.maxHp * hpK; }
  if (id === 'vessel') d.inv.draught = (d.inv.draught || 0) + 1;
  const show = () => { UI.area(U ? U.name.toUpperCase() : id, U ? U.desc : ''); A.sfx('kindle'); }; if (showDelay) setTimeout(show, showDelay); else show(); Save.write(); };

/* ---------- death: the earth refuses you ---------- */
A.startDeath = function () { if (A.dying) return; A.dying = { t: 0 }; S().deaths++; A.drink = null; audio.play('deathSting'); Fade.set(0.78, 0.5, '22,3,3'); if (G.Cine) G.Cine.slow(1.2, 0.45); if (P1.PostFX) P1.PostFX.desat(1.8); Save.write(); };
A.updateDeath = function (dt) { const d = A.dying; if (!d) return; d.t += dt;
  if (d.t > 1.3 && !d.shown) { d.shown = true; UI.show('advDeath', true); const el = $('advDeath'); requestAnimationFrame(() => { el.querySelector('.t').style.opacity = 1; el.querySelector('.s').style.opacity = 1; }); A.sfx('refused'); }
  if (d.t > 4.4 && !d.done) { d.done = true; Fade.set(1, 3, '0,0,0'); }
  if (d.t > 4.9) { const el = $('advDeath'); el.querySelector('.t').style.opacity = 0; el.querySelector('.s').style.opacity = 0; UI.show('advDeath', false); A.respawn(); } };
A.respawn = function () { Ents.killed.clear(); S().inv.draught = Inv.draughtMax(); A.buildWorld(A.spawnPoint()); Fade.set(0, 0.7, '0,0,0'); Game.state = 'playing'; Save.write(); };

/* ---------- lanterns: kindle, rest, travel ---------- */
A.lanternUse = function (id) { const st = Region.lanterns[id]; if (!st) return;
  if (!st.lit) { Region.setLantern(id, true); if (!S().lit.includes(id)) S().lit.push(id); S().flags['lit_' + id] = true; A.sfx('kindle'); UI.area('LANTERN KINDLED', st.def.name); if (id === Region.data.firstLantern) Quests.set('main', 3, 'max'); A.rest(id, true); return; }
  const others = Region.data.lanterns.filter(l => l.id !== id && S().lit.includes(l.id));
  const choices = [{ text: 'Rest', go: () => A.rest(id) }].concat(others.map(l => ({ text: 'Travel to ' + l.name, go: () => A.rest(l.id, false, true) }))).concat([{ text: 'Leave', go: () => {} }]);
  A.menuChoice(st.def.name, 'The flame steadies as you near it.', choices); };
A.rest = function (id, silentChoice, travel) { A.busy = 1; S().lantern = id; Fade.set(1, 2.6, '0,0,0');
  setTimeout(() => { Ents.killed.clear(); S().inv.draught = Inv.draughtMax(); A.buildWorld(A.spawnPoint()); Game.state = 'playing'; A.busy = 0; Fade.set(0, 0.9, '0,0,0'); toast(travel ? 'You travel by lantern-light.' : 'You rest. Health and Draughts restored \u2014 the fallen rise again.'); Save.write(); }, HEADLESS ? 10 : 480); };

/* ---------- gates ---------- */
A.openGate = function (id) { const st = Region.gates[id]; if (!st || st.open) return; Region.setGate(id, true); S().opened[id] = true; A.sfx('gate'); Save.write(); if (id === 'yardgate') Quests.set('main', 5, 'max'); if (st.def.ends) setTimeout(() => A.endChapter(), 2600); };
A.endChapter = function () { const d = S(); d.chapterDone = true; d.flags.chapter1_complete = true; Quests.set('main', 8, 'max'); Save.write(); Game.state = 'ended'; try { if (document.exitPointerLock) document.exitPointerLock(); } catch (e) {}
  const secrets = ['oss', 'tag_pell', 'tag_ilke', 'tag_jory', 'sallow'].filter(k => k === 'oss' ? d.zones.oss : k === 'sallow' ? d.defeated.sallow : d.collected[k]).length;
  const row = (a, b) => '<tr><td>' + a + '</td><td>' + b + '</td></tr>'; const t = Math.floor(d.playTime);
  $('advEndSub').textContent = 'The Hollowwood road lies open. The story continues in Chapter II \u2014 to be continued.';
  $('advEndStats').innerHTML = '<table class="stats" style="margin:0 auto">' + row('Time', Math.floor(t / 60) + ' min ' + (t % 60) + ' s') + row('Deaths (refused)', d.deaths) + row('Foes felled', d.kills) + row('Upgrades', d.upgrades.length + ' / 3') + row('Secrets', secrets + ' / 5') + row('Ilsabet Crane', d.flags.crane_freed ? 'freed' : d.flags.crane_refused ? 'left in the cage' : 'never freed') + row('Names for the Dead', Quests.stage('names') === 4 ? 'returned' : 'unfinished') + '</table>';
  UI.show('advEnd', true); audio.play('victorySting'); };

/* ---------- interaction scan (nearest valid interactable) ---------- */
A.scanInteract = function () { const w = Game.world, p = w.player; A.inter = null; if (p.dead || A.busy || Game.state !== 'playing') return null; if (Ents.list.some(e => e.mode === 'combat' && !e.f.dead && dist(e.f.x, e.f.z, p.x, p.z) < 7)) return null;
  let best = null, bd = 9; const consider = (x, z, r, label, fn) => { const d = dist(x, z, p.x, p.z); if (d < r && d < bd) { bd = d; best = { label, act: fn, x, z }; } };
  const R = Region.data;
  for (const k in Region.lanterns) { const st = Region.lanterns[k]; consider(st.def.x, st.def.z, 2.8, st.lit ? 'Rest at the ' + st.def.name : 'Kindle the Vigil Lantern', () => A.lanternUse(k)); }
  for (const k in Region.pickups) { const pk = Region.pickups[k], def = pk.def; if (!Cond.test(def.if)) continue; consider(def.x, def.z, 2.2, def.prompt || 'Pick up', () => A.pickup(k)); }
  for (const k in Region.notes) { const n = Region.notes[k], def = n.def; if (!Cond.test(def.if)) continue; consider(def.x, def.z, 2.2, def.prompt || 'Read', () => A.readLore(def.lore)); }
  for (const k in Region.levers) { const l = Region.levers[k]; if (l.pulled) continue; consider(l.def.x, l.def.z, 2.2, l.def.prompt, () => A.pullLever(k)); }
  for (const k in Region.gates) { const st = Region.gates[k], def = st.def; if (st.open || def.how === 'boss') continue; const side = A.gateSide(st, p);
    const can = def.how.startsWith('item:') ? Inv.count(def.how.slice(5)) > 0 : def.how === 'side' ? side === A.gateSide(st, { x: def.side[0], z: def.side[1] }) : false;
    consider(st.mx, st.mz, 2.6, can ? def.prompt : 'Examine the ' + (def.kind === 'portcullis' ? 'portcullis' : 'gate'), () => { if (can) { A.openGate(k); if (def.how.startsWith('item:')) toast('Used: ' + (D.ITEMS[def.how.slice(5)] || {}).name); } else { UI.hint(def.locked || 'It will not open.', 3); if (k === 'gaoldoor') Quests.set('main', 4, 'max'); } }); }
  for (const k in A.npcs) { const n = A.npcs[k], N = D.NPCS[n.def.id]; const r = N.caged ? 2.4 : 2.2; consider(n.f.x, n.f.z, r, 'Talk to ' + N.name.split(' ')[0], () => A.talk(k)); }
  if (S().defeated.odran && !S().flags.odran_spoke) consider(0, 54, 4, 'Kneel by the headsman', () => A.dialogue('odran_dying', { name: 'Odran Vale', title: 'The Iron Warden' }));
  if (S().chapterDone) { const g = Region.gates.hollowgate; if (g) consider(0, 72, 2.5, 'The Hollowwood road', () => UI.hint('The road into Hollowwood is not yet open. (Chapter II \u2014 to be continued.)', 4)); }
  void R; A.inter = best; return best; };
A.gateSide = (st, o) => { const d = st.def, ex = d.b[0] - d.a[0], ez = d.b[1] - d.a[1]; return ex * (o.z - d.a[1]) - ez * (o.x - d.a[0]) > 0 ? 1 : -1; };
A.pickup = function (k) { const pk = Region.pickups[k]; if (!pk) return; const def = pk.def, d = S(); d.collected[k] = true; Region.dyn.remove(pk.s); Region.dyn.remove(pk.c); delete Region.pickups[k]; A.sfx('pickup');
  if (pk.model) { const wp = pk.c.getWorldPosition(new THREE.Vector3()); Region.dyn.remove(pk.model); Region.flash(wp.x, wp.y + 0.1, wp.z, 0xdfe8ff); if (def.weapon) A.sfx('blade'); } else Region.flash(pk.s.position.x, pk.s.position.y, pk.s.position.z);
  if (def.weapon) { Inv.give(def.weapon); } if (def.item) Inv.give(def.item, 1); if (def.upgrade) A.grantUpgrade(def.upgrade);
  const name = def.weapon ? D.WEAPONS[def.weapon].name : def.item ? D.ITEMS[def.item].name : def.upgrade ? D.UPGRADES[def.upgrade].name : k;
  if (def.card && !def.upgrade) UI.area(def.card[0], def.card[1]); else if (!def.upgrade) UI.area(name.toUpperCase(), def.namesTag ? (Quests.stage('names') === null ? 'A name, scratched in tin' : 'For Tamsin\u2019s post') : '');
  if (def.weapon) UI.hint('Left click: attack (hold to charge) \u00b7 right click: heavy (hold to charge) \u00b7 F: tap to deflect, hold to guard \u00b7 Space jump \u00b7 C dash', 7);
  act(def.do); Quests.sync(); Save.write(); };
A.pullLever = function (k) { const l = Region.levers[k]; if (!l || l.pulled) return; l.pulled = true; l.pullT = 0; A.sfx('lever'); setTimeout(() => A.openGate(l.def.opens), 500); };
A.readLore = function (id) { const L = D.LORE[id]; if (!L) return; S().lore[id] = true; A.sfx('page'); Game.state = 'reading'; Input.clear(); try { if (document.exitPointerLock) document.exitPointerLock(); } catch (e) {} UI.read(L.title, L.text); Save.write(); };
A.closeRead = function () { UI.closeRead(); if (Game.state === 'reading') Game.state = 'playing'; Input.clear(); };

/* =====================================================================
   DIALOGUE
   ===================================================================== */
A.talk = function (k) { const n = A.npcs[k]; if (!n) return; const N = D.NPCS[n.def.id]; const pick = N.talk.find(t => Cond.test(t.if)); if (pick) A.dialogue(pick.dlg, N); };
A.dialogue = function (id, who) { const dl = D.DIALOGUE[id]; if (!dl) return; A.dlg = { dl, who, node: null, sel: 0 }; Game.state = 'dialogue'; Input.clear(); try { if (document.exitPointerLock) document.exitPointerLock(); } catch (e) {} UI.show('advDlg', true); UI.prompt(null); A.dlgGo(dl.start); };
A.dlgGo = function (key) { const s = A.dlg; if (!s) return; const node = s.dl.nodes[key]; if (!node) return A.dlgEnd(); s.node = node; s.key = key; s.sel = 0; if (node.do && !node.end) act(node.do);
  const el = $('advDlg'); el.querySelector('.who').innerHTML = (node.who || (s.who && s.who.name) || '') + (s.who && s.who.title ? '<small>' + s.who.title + '</small>' : '');
  el.querySelector('.txt').textContent = node.text; const ch = el.querySelector('.ch'); ch.innerHTML = '';
  s.choices = (node.choices || []).filter(c => Cond.test(c.if));
  s.choices.forEach((c, i) => { const b = document.createElement('button'); b.textContent = (i + 1) + '. ' + c.text; b.onclick = () => A.dlgChoose(i); ch.appendChild(b); });
  el.querySelector('.more').textContent = s.choices.length ? '1\u2013' + s.choices.length + ' or click' : (node.end ? 'E \u2014 end' : 'E \u2014 continue'); A.dlgSel(0); };
A.dlgSel = function (i) { const s = A.dlg; if (!s || !s.choices.length) return; s.sel = (i + s.choices.length) % s.choices.length; $('advDlg').querySelectorAll('.ch button').forEach((b, k) => b.classList.toggle('sel', k === s.sel)); };
A.dlgChoose = function (i) { const s = A.dlg; if (!s) return; const c = s.choices[i]; if (!c) return; audio.play('ui'); if (c.do) act(c.do); if (c.go) { A.dlgEnd(); c.go(); return; } if (c.next) A.dlgGo(c.next); else A.dlgEnd(); };
A.dlgNext = function () { const s = A.dlg; if (!s) return; if (s.choices.length) return A.dlgChoose(s.sel); const n = s.node; if (n.end) { if (n.do) act(n.do); return A.dlgEnd(); } if (n.next) A.dlgGo(n.next); else A.dlgEnd(); };
A.dlgEnd = function () { A.dlg = null; UI.show('advDlg', false); if (Game.state === 'dialogue') Game.state = 'playing'; Input.clear(); Save.write(); A.spawnNpcsIfChanged(); };
A.menuChoice = function (title, text, choices) { A.dlg = { dl: { nodes: { m: { who: title, text, choices: choices.map(c => ({ text: c.text, go: c.go })) } } }, who: null, node: null, sel: 0 }; Game.state = 'dialogue'; Input.clear(); UI.show('advDlg', true); A.dlgGo('m'); };
A.spawnNpcsIfChanged = function () { const want = Object.keys(Region.npcs).filter(k => Cond.test(Region.npcs[k].def.if)).join(','), have = Object.keys(A.npcs).join(','); if (want !== have) { A.detachNpcExits(); for (let i = Region.circles.length - 1; i >= 0; i--) if (Region.circles[i].npc) Region.circles.splice(i, 1); A.spawnNpcs(); } };

/* =====================================================================
   PER-FRAME (after the v8 frame): HUD, compass, prompts, culling, zones, hints, NPCs, death/drink timers
   ===================================================================== */
const _v = new THREE.Vector3();
A.post = function (dt, now) {
  const w = Game.world; if (!w || !Region.data) return; const p = w.player, d = S();
  if (Game.state === 'playing') { d.playTime += dt; A.time += dt; }
  A.applyTier();
  Region.updateDynamic(dt, now, p.x, p.z);
  if (A.keysPost) A.keysPost(now);   // chunk C: ground keys (glint/turn), belt keys, objective line
  // Ash and fog banks follow the player (they were built around the arena origin)
  if (P1.Ash.pts) P1.Ash.pts.position.set(p.x, 0, p.z);
  // levers
  for (const k in Region.levers) { const l = Region.levers[k]; if (l.pulled && l.piv.rotation.x < 0.7) l.piv.rotation.x = Math.min(0.7, l.piv.rotation.x + dt * 3); }
  // characters: distance culling + tint + unarmed
  const charD = tier().wChar || 52;
  for (const [fid, c] of Game.chars) { const f = c.f, far = dist(f.x, f.z, p.x, p.z) > charD; const en = Ents.byF.get(fid); const cull = far && !(en && en.mode === 'combat'); c.culled = cull; c.root.visible = !cull; if (c.feetAO) c.feetAO.forEach(o => o.visible = !cull);
    if (en && c.model && !c._tint) tint(c, en.def.type); if (f.isPlayer && c.model && c.model.q && !c._tint) tint(c, 'player'); if (f.isPlayer && c.model && c.model.blade) c.model.blade.visible = !!Inv.count('wardblade'); }
  Character.lookExtra.length = 0; for (const k in A.npcs) if (A.npcs[k].f) Character.lookExtra.push(A.npcs[k].f);   // chunk H3: Wren looks at the NPCs too
  for (const k in A.npcs) { const n = A.npcs[k]; if (!n.c) continue; const dd = dist(n.f.x, n.f.z, p.x, p.z); n.c.culled = dd > Math.min(45, charD); n.c.root.visible = !n.c.culled; if (n.c.culled) continue;
    const N = D.NPCS[n.def.id]; if (n.c.model && !n.c._tint) tint(n.c, n.def.id.split('_')[0]); if (n.c.model && n.c.model.blade && !N.blade) n.c.model.blade.visible = false;
    if (dd < 6) { const want = Math.atan2(p.x - n.f.x, p.z - n.f.z); n.f.facing += clamp(angNorm(want - n.f.facing), -dt * 2.5, dt * 2.5); } n.f.pfacing = n.f.facing; n.f.px = n.f.x; n.f.pz = n.f.z; n.c.update(dt, 1, now); }
  A.updateNpcExits(dt, now);
  A.updateDrink(dt); A.updateDeath(dt);
  if (Game.state === 'playing' && !A.dying && !p.dead) {
    A.checkBoss();
    // zones: area cards + quest hooks
    const zn = Region.zoneAt(p.x, p.z); if (zn && zn.id !== A.zone) { A.zone = zn.id; if (!d.zones[zn.id]) { d.zones[zn.id] = true; if (!zn.silent) UI.area(zn.name.toUpperCase(), zn.secret ? 'A hidden place' : Region.data.name); if (zn.secret) audio.play('victorySting'); Save.write(); }
      if (zn.id === 'gaol') Quests.set('main', 4, 'max'); if (zn.id === 'muster' && Quests.stage('main') >= 3) Quests.set('main', 5, 'max'); }
    // world-woven hints
    for (const h of Region.data.hints) { if (d.hints[h.id] || !Cond.test(h.if)) continue; if (dist(p.x, p.z, h.x, h.z) < h.r) { d.hints[h.id] = true; UI.hint(h.text, 7); } }
    if (!d.hints.draught && p.hp < p.maxHp * 0.55 && (d.inv.draught || 0) > 0) { d.hints.draught = true; UI.hint('R \u2014 drink a Lantern Draught (restores 40% health)', 6); }
    if (Quests.stage('main') === null) Quests.set('main', 0);
  }
  // HUD
  UI.flask(d.inv.draught || 0, Inv.draughtMax(), !!A.drink);
  const it = Game.state === 'playing' ? A.scanInteract() : null; const stl = Game.state === 'playing' && !p.dead && Inv.count('wardblade') ? Ents.stealthTarget(p) : null;
  if (stl && !w.deathblowCandidate(p)) UI.prompt('Deathblow (unseen)', 'E'); else if (it) UI.prompt(it.label, 'E'); else UI.prompt(null);
  // alert marks over enemies (? suspicious, ! engaged for a moment) and the unseen-deathblow marker
  let mi = 0; if (Game.state === 'playing') for (const e of Ents.list) { if (e.f.dead || e.c.culled) continue; const show = (e.alert > 0.12 && e.mode !== 'combat') || (e.mode === 'combat' && w.time - (e.engagedAt || 0) < 1.2 && !e.def.boss);
    if (!show && e !== stl) continue; _v.copy(e.c.root.position).setY((e.c.gy || 0) + 2.45 * e.c.look.scale); _v.project(camera); if (_v.z > 1) continue;
    UI.mark(mi++, e === stl ? 's' : e.mode === 'combat' ? 'x' : 'q', (_v.x + 1) / 2 * innerWidth, (1 - _v.y) / 2 * innerHeight, e === stl ? '\u25bc' : e.mode === 'combat' ? '!' : '?'); }
  UI.hideMarks(mi);
  // compass: cardinals, lit lanterns, revealed landmarks, optional objective mark. Screen-right is -x, so bearings use atan2(-dx, dz).
  const marks = [], brg = (x, z) => ((Math.atan2(-(x - p.x), z - p.z) * 180 / Math.PI) + 360) % 360;
  for (const l of Region.data.lanterns) if (d.lit.includes(l.id)) marks.push({ a: brg(l.x, l.z), kind: '', name: l.name });
  for (const l of Region.data.landmarks) if (d.zones[l.zone]) marks.push({ a: brg(l.x, l.z), kind: 'lm', name: l.name });
  const om = Region.data.objectiveMarks[Quests.stage('main')]; if (om && Settings.compassObj !== false && dist(om[0], om[1], p.x, p.z) > 4) marks.push({ a: brg(om[0], om[1]), kind: 'obj', name: 'Objective' });
  UI.compass(Cam.yaw, marks);
};
A.refreshObjective = function () { const st = Quests.stage('main'); UI.objective(st === null ? '' : D.QUESTS.main.stages[st] || ''); };
A.engaged = function (w) { if (!A.active) return w.enemies(); const p = w.player; return Ents.list.filter(e => e.mode === 'combat' && !e.f.dead && dist(e.f.x, e.f.z, p.x, p.z) < 22).map(e => e.f); };
A.hudTarget = function (w) { const p = w.player; if (A.boss && !A.boss.e.f.dead) return A.boss.e.f; let best = null, bd = 9; for (const e of Ents.list) { if (e.mode !== 'combat' || e.f.dead) continue; const d = dist(e.f.x, e.f.z, p.x, p.z); if (d < bd) { bd = d; best = e.f; } } return best; };

/* =====================================================================
   PAUSE MENU (tabs) + settings
   ===================================================================== */
const TABS = ['Journey', 'Inventory', 'Quests', 'Lore', 'Map', 'Settings', 'Controls'];
A.menuTab = 'Journey';
A.openMenu = function () { Game.state = 'paused'; Input.clear(); audio.bed(0); try { if (document.exitPointerLock && Input.locked) document.exitPointerLock(); } catch (e) {} UI.show('advMenu', true); A.renderMenu(); };
A.closeMenu = function () { UI.show('advMenu', false); Input.clear(); if (Game.state === 'paused') { Game.state = 'playing'; Game.lastFrame = performance.now(); } try { $('c').focus(); } catch (e) {} };
A.renderMenu = function () { const d = S(), m = $('advMenu'); const tabs = m.querySelector('.tabs'), body = m.querySelector('.body');
  tabs.innerHTML = TABS.map(t => '<button data-t="' + t + '" class="' + (t === A.menuTab ? 'on' : '') + '">' + t + '</button>').join('') + '<span class="sp"></span><button data-a="resume">Resume (Esc)</button><button data-a="quit">Save &amp; quit</button>';
  tabs.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { A.menuTab = b.dataset.t; audio.play('ui'); A.renderMenu(); });
  tabs.querySelector('[data-a=resume]').onclick = () => A.closeMenu(); tabs.querySelector('[data-a=quit]').onclick = () => A.quitToTitle();
  const it = (t, s, cls) => '<div class="it ' + (cls || '') + '"><b>' + t + '</b><small>' + s + '</small></div>'; const p = Game.world && Game.world.player; let h = '';
  if (A.menuTab === 'Journey') { const t = Math.floor(d.playTime); const W = D.WEAPONS[d.equip.weapon];
    h = '<div class="grid"><div class="col"><h4>Wren Aldmoor \u2014 the Unhanged</h4>' + it('Health', p ? Math.ceil(p.hp) + ' / ' + p.maxHp : '\u2014') + it('Posture', p ? p.postureMax + ' max' : '\u2014') + it('Lantern Draughts', (d.inv.draught || 0) + ' / ' + Inv.draughtMax())
      + '<h4>Equipment</h4>' + (W ? it('Weapon \u2014 ' + W.name, W.desc) : it('Weapon \u2014 none', 'Your sword lies on the corpse cart.')) + it('Weapon switching', 'Further weapons are found in later regions (Chapter II onward).', 'done')
      + '</div><div class="col"><h4>Upgrades</h4>' + Object.keys(D.UPGRADES).filter(k => D.UPGRADES[k].region === 'execution').map(k => d.upgrades.includes(k) ? it(D.UPGRADES[k].name, D.UPGRADES[k].desc) : it('???', 'Undiscovered', 'done')).join('')
      + '<h4>Record</h4>' + it('Time', Math.floor(t / 60) + ' min ' + (t % 60) + ' s') + it('Refused by the earth', d.deaths + ' times') + it('Foes felled', d.kills) + '</div></div>'; }
  else if (A.menuTab === 'Inventory') { const keys = Object.keys(d.inv).filter(k => D.ITEMS[k] && d.inv[k] > 0); h = '<h4>Items</h4>' + (keys.length ? keys.map(k => it(D.ITEMS[k].name + (d.inv[k] > 1 || k === 'draught' ? ' \u00d7' + d.inv[k] : ''), D.ITEMS[k].desc)).join('') : '<i>Nothing yet.</i>')
      + '<h4>Weapons</h4>' + (d.weapons.length ? d.weapons.map(k => it(D.WEAPONS[k].name + (d.equip.weapon === k ? ' (equipped)' : ''), D.WEAPONS[k].desc)).join('') : '<i>Unarmed.</i>'); }
  else if (A.menuTab === 'Quests') { h = Object.keys(D.QUESTS).filter(k => d.quests[k]).map(k => { const Q = D.QUESTS[k], q = d.quests[k]; const done = q.stage >= Q.stages.length - 1 || (k === 'crane' && q.stage >= 2);
      return '<h4>' + Q.name + (Q.kind === 'main' ? '' : ' \u2014 ' + (Q.giver || 'side')) + '</h4>' + it(Q.stages[q.stage], done ? 'Completed' : 'Current', (Q.kind === 'main' ? 'main ' : '') + (done ? 'done' : '')) + q.log.slice(0, -1).reverse().slice(0, 4).map(s => it(Q.stages[s], 'Earlier', 'done')).join(''); }).join('') || '<i>No quests yet.</i>'; }
  else if (A.menuTab === 'Lore') { const ks = Object.keys(D.LORE).filter(k => d.lore[k]); h = '<h4>Writings found</h4>' + (ks.length ? ks.map(k => '<div class="it" style="cursor:pointer" data-l="' + k + '"><b>' + D.LORE[k].title + '</b><small>' + D.LORE[k].text.split('\n')[0].slice(0, 90) + '\u2026</small></div>').join('') : '<i>Nothing read yet.</i>'); }
  else if (A.menuTab === 'Map') { h = '<canvas id="advMap" width="760" height="560"></canvas><div style="text-align:center;font-size:12px;color:#8f846f;margin-top:6px">Only places you have walked are drawn. \u25c6 lantern (gold = kindled) \u00b7 \u25b2 you \u00b7 north is up</div>'; }
  else if (A.menuTab === 'Settings') { const T = P1.TIERS ? null : null; void T;
    const sl = (id, lbl, v, min, max, st) => '<div class="set"><span>' + lbl + '</span><input type="range" id="' + id + '" min="' + min + '" max="' + max + '" step="' + st + '" value="' + v + '"></div>';
    const tg = (id, lbl, txt) => '<div class="set"><span>' + lbl + '</span><button class="tog" id="' + id + '">' + txt + '</button></div>';
    h = '<h4>Display</h4>' + tg('setQ', 'Quality (Low / Medium / High; drops one step automatically if slow)', (G.TIERS[Settings.quality] || {}).label || Settings.quality)
      + tg('setUltra', 'Ultra graphics (bloom, anti-aliasing, embers + mist; desktop GPUs only, never chosen automatically)', Settings.quality === 'ultra' ? 'On' : 'Off')
      + '<h4>Audio</h4>' + sl('setVol', 'Master volume', Math.round(Settings.volume * 100), 0, 100, 1) + sl('setMus', 'Music', Math.round((Settings.musicVol === undefined ? 1 : Settings.musicVol) * 100), 0, 100, 1) + sl('setSfx', 'Effects', Math.round((Settings.sfxVol === undefined ? 1 : Settings.sfxVol) * 100), 0, 100, 1)
      + '<h4>Controls</h4>' + sl('setSens', 'Mouse sensitivity', Math.round(Settings.sens * 10000), 10, 70, 1) + tg('setInv', 'Invert camera Y', Settings.invertY ? 'On' : 'Off')
      + '<h4>Game</h4>' + tg('setObj', 'Objective mark on the compass', Settings.compassObj !== false ? 'On' : 'Off') + tg('setAcc', 'Large deflect window (accessibility)', CONFIG.parry.accessibility ? 'On' : 'Off') + tg('setIntro', 'Boss intros', Settings.intros !== false ? 'On' : 'Off') + tg('setHit', 'Hit style', Settings.hitStyle === 'blood' ? 'Blood' : 'Ink') + tg('setHints', 'Control hints panel (H)', Settings.hints ? 'On' : 'Off'); }
  else if (A.menuTab === 'Controls') { h = '<div class="grid"><div class="col"><h4>Explore</h4>' + it('W A S D', 'Move \u00b7 Shift sprint') + it('Mouse', 'Camera (click the screen to capture; Esc releases)') + it('E', 'Interact \u00b7 talk \u00b7 rest \u00b7 deathblow (a deathblow wins when a foe is open; from behind, unseen, it kills outright)') + it('R', 'Drink a Lantern Draught') + it('Space', 'Jump \u2014 vault low rubble and wagons at a run') + it('Esc / P', 'Pause menu')
      + '</div><div class="col"><h4>Fight</h4>' + it('F', 'Tap to deflect as the blade lands (just before = Perfect, just after = Late); hold to guard') + it('Left click', 'Light attack (4-hit chain) \u00b7 hold for a charged thrust') + it('Right click', 'Heavy attack (hold to charge: crushes posture \u00b7 after a light = finisher, after a deflect = riposte)') + it('Grey health', 'Chip from blocked heavy blows: strike back within 3 s to win it back') + it('C', 'Dash / dodge (i-frames); into a thrust = Counterstep') + it('J \u00b7 K', 'Spare keys for light \u00b7 heavy') + it('Q \u00b7 Tab / wheel', 'Lock on \u00b7 switch target') + it('Gamepad', 'Standard mapping (see How to fight on the title screen)') + '</div></div>'; }
  if (A.menuExtra) { const x = A.menuExtra(A.menuTab); if (x !== null) h = A.menuTab === 'Journey' ? x + h : x; }   // chunk C: Objectives + Inventory with icons
  body.innerHTML = h;
  if (A.menuTab === 'Map') A.drawMap($('advMap'));
  body.querySelectorAll('[data-l]').forEach(el => el.onclick = () => { const L = D.LORE[el.dataset.l]; UI.read(L.title, L.text); A.readingFromMenu = true; });
  const on = (id, f) => { const el = $(id); if (el) el.onclick = () => { f(); audio.play('ui'); A.renderMenu(); }; }, inp = (id, f) => { const el = $(id); if (el) el.oninput = () => f(+el.value); };
  on('setQ', () => { Settings.quality = { ultra: 'high', high: 'medium', medium: 'low', low: 'high' }[Settings.quality] || 'medium'; G.applyQuality(); P1.onResize(); Store.save(); });
  on('setUltra', () => { Settings.quality = Settings.quality === 'ultra' ? 'high' : 'ultra'; G.applyQuality(); P1.onResize(); Store.save(); });   // chunk E: opt-in only
  inp('setVol', v => { audio.ensure(); audio.setVolume(v / 100); $('vol').value = $('vol2').value = v; Store.save(); }); inp('setMus', v => { audio.setBus('musicVol', v / 100); Store.save(); }); inp('setSfx', v => { audio.setBus('sfxVol', v / 100); Store.save(); });
  inp('setSens', v => { Settings.sens = v / 10000; Store.save(); }); on('setInv', () => { Settings.invertY = !Settings.invertY; Store.save(); }); on('setObj', () => { Settings.compassObj = Settings.compassObj === false; Store.save(); });
  on('setAcc', () => P1.setAccessibility(!CONFIG.parry.accessibility)); on('setIntro', () => { Settings.intros = Settings.intros === false; Store.save(); }); on('setHit', () => { Settings.hitStyle = Settings.hitStyle === 'blood' ? 'ink' : 'blood'; Store.save(); });
  on('setHints', () => { Settings.hints = !Settings.hints; Store.save(); }); };
A.drawMap = function (cv) { if (!cv || !cv.getContext) return; const g = cv.getContext('2d'); if (!g) return; const R = Region.data, B = R.bounds, d = S(), W = cv.width, H = cv.height;
  const sc = Math.min(W / (B.x1 - B.x0), H / (B.z1 - B.z0)) * 0.95, ox = W / 2, oz = H / 2, cx = (B.x0 + B.x1) / 2, cz = (B.z0 + B.z1) / 2; const X = x => ox - (x - cx) * sc, Y = z => oz - (z - cz) * sc;   // east (screen right) = -x
  g.fillStyle = '#0b0a09'; g.fillRect(0, 0, W, H);
  const seen = zn => d.zones[zn.id]; for (const zn of R.zones) { if (!seen(zn)) continue; g.fillStyle = 'rgba(120,100,70,0.22)'; for (const r of zn.rects || []) g.fillRect(X(r[2]), Y(r[3]), (r[2] - r[0]) * sc, (r[3] - r[1]) * sc); if (zn.circle) { g.beginPath(); g.arc(X(zn.circle[0]), Y(zn.circle[1]), zn.circle[2] * sc, 0, 6.3); g.fill(); } }
  if (Region.ground) for (const st of Region.ground.stairs) { const z = Region.zoneAt((st.x0 + st.x1) / 2, (st.z0 + st.z1) / 2); if (z && !seen(z)) continue; const n = st.risers || 5;
    g.strokeStyle = '#9a8660'; g.lineWidth = 1; for (let i = 0; i <= n; i++) { const u = i / n; g.beginPath(); if (st.axis === 'x') { const x = st.x0 + (st.x1 - st.x0) * u; g.moveTo(X(x), Y(st.z0)); g.lineTo(X(x), Y(st.z1)); } else { const zz = st.z0 + (st.z1 - st.z0) * u; g.moveTo(X(st.x0), Y(zz)); g.lineTo(X(st.x1), Y(zz)); } g.stroke(); } }
  g.lineCap = 'round'; for (const s of Region.segs) { if (s.ledge) continue; const za = Region.zoneAt(s.ax + (s.bx - s.ax) * 0.5 + 0.6, s.az + (s.bz - s.az) * 0.5 + 0.6) || Region.zoneAt(s.ax + (s.bx - s.ax) * 0.5 - 0.6, s.az + (s.bz - s.az) * 0.5 - 0.6); if (!za || !seen(za)) continue;
    g.strokeStyle = s.gate ? (s.on ? '#a8343a' : '#5a4a36') : s.low ? '#7a6a50' : '#c9b48a'; g.lineWidth = s.gate ? 3 : s.low ? 1.5 : 2.2; g.beginPath(); g.moveTo(X(s.ax), Y(s.az)); g.lineTo(X(s.bx), Y(s.bz)); g.stroke(); }
  for (const l of R.lanterns) { const z = Region.zoneAt(l.x, l.z); if (!z || !seen(z)) continue; g.fillStyle = d.lit.includes(l.id) ? '#f0c060' : '#6a5a40'; g.save(); g.translate(X(l.x), Y(l.z)); g.rotate(Math.PI / 4); g.fillRect(-4, -4, 8, 8); g.restore(); }
  g.font = '12px Georgia'; g.fillStyle = '#d8cbb0'; g.textAlign = 'center'; for (const zn of R.zones) { if (!seen(zn) || zn.silent) continue; const r = zn.rects ? zn.rects[0] : null; const x = r ? (r[0] + r[2]) / 2 : zn.circle[0], z = r ? (r[1] + r[3]) / 2 : zn.circle[1]; g.fillText(zn.name, X(x), Y(z)); }
  const p = Game.world && Game.world.player; if (p) { g.save(); g.translate(X(p.x), Y(p.z)); g.rotate(-p.facing); g.fillStyle = '#ff6a4a';   /* was rotate(-facing + PI): the arrow pointed backwards */ g.beginPath(); g.moveTo(0, -8); g.lineTo(5, 6); g.lineTo(-5, 6); g.closePath(); g.fill(); g.restore(); }
  g.fillStyle = '#a8343a'; g.fillText('N', W / 2, 16); };
A.quitToTitle = function () { Save.write(); UI.show('advMenu', false); UI.show('advEnd', false); UI.prompt(null); A.leave(); Game.quit(); A.refreshTitle(); };

/* ---------- prologue ---------- */
A.prologue = function (done) { const el = $('advProlog'), pEl = el.querySelector('p'), lines = (D.REGIONS.execution.prologue || []).slice(); let i = 0, tm = null, fin = false;
  const end = () => { if (fin) return; fin = true; clearTimeout(tm); el.onclick = null; window.removeEventListener('keydown', key, true); pEl.style.opacity = 0; setTimeout(() => { UI.show('advProlog', false); done(); }, HEADLESS ? 0 : 500); };
  const next = () => { if (i >= lines.length) return end(); pEl.style.opacity = 0; setTimeout(() => { pEl.textContent = lines[i++]; pEl.style.opacity = 1; tm = setTimeout(next, 3000); }, i ? 600 : 50); };
  const key = e => { e.preventDefault(); e.stopPropagation(); end(); }; Game.state = 'prologue'; Game.overlay(null); UI.show('advProlog', true); el.onclick = end; window.addEventListener('keydown', key, true); A.prologueEnd = end; next(); };

/* ---------- save problems + title ---------- */
A.saveProblem = function (st) { const txt = st === 'newer' ? 'This save was made by a newer version of Veynhold, so this build will not overwrite it.' : 'Your save could not be read, and the backup slot was empty or damaged too. The unreadable data was kept aside (veynhold_save_corrupt).';
  $('advSaveTxt').textContent = txt; Game.overlay(null); UI.show('advSaveMsg', true); $('advSaveNew').onclick = () => { UI.show('advSaveMsg', false); if (st === 'newer') { try { localStorage.setItem('veynhold_save_newer', localStorage.getItem(Save.KEY) || ''); } catch (e) {} } A.newGame(); };
  $('advSaveBack').onclick = () => { UI.show('advSaveMsg', false); Game.overlay('title'); A.refreshTitle(); }; };
A.confirm = function (txt, yes) { $('advConfirmTxt').textContent = txt; UI.show('advConfirm', true); $('advConfirmYes').onclick = () => { UI.show('advConfirm', false); yes(); }; $('advConfirmNo').onclick = () => UI.show('advConfirm', false); };
A.refreshTitle = function () { const st = Save.read(Save.KEY), b = $('advContinue'); if (!b) return;
  if (st.d) { const t = Math.floor(st.d.playTime / 60); b.style.display = 'block'; $('advContSub').textContent = (st.d.chapterDone ? 'Chapter I complete' : 'Chapter I \u2014 The Execution Grounds') + ' \u00b7 ' + t + ' min'; }
  else if (st.err) { b.style.display = 'block'; $('advContSub').textContent = st.newer ? 'Save from a newer version' : 'Save damaged \u2014 will try the backup'; } else b.style.display = 'none'; };

/* =====================================================================
   HOOKS into the v8 game object (instance-level wraps; arena modes pass straight through)
   ===================================================================== */
const orig = { gatherIntent: Game.gatherIntent, handleEvents: Game.handleEvents, onKey: Game.onKey, pause: Game.pause, resume: Game.resume, quit: Game.quit, frame: Game.frame, pickTarget: Game.pickTarget, restart: Game.restart };
Game.gatherIntent = function (dt) { if (!A.active) return orig.gatherIntent.call(this, dt); A.preIntent(); orig.gatherIntent.call(this, dt); A.preStep(dt); };
Game.handleEvents = function () { if (!A.active || !this.world) return orig.handleEvents.call(this); const w = this.world; A.onEvents(w);
  const p2 = w.events.find(e => e.type === 'phase2'); const r = orig.handleEvents.call(this);
  if (p2) { const f = w.byId(p2.f); if (f && f.profile && f.profile.look === 'warden') HUD.flash('THE HEADSMAN WILL NOT KNEEL', '#ff6a3d', 26); } return r; };
Game.engaged = function (w) { return A.active ? A.engaged(w) : w.enemies(); }; Game.engaged.p1 = true;
Game.hudTarget = function (w) { return A.active ? A.hudTarget(w) : w.enemies()[0]; };
Game.camClear = null; Object.defineProperty(Game, 'camClear', { configurable: true, get() { return A.active ? (lx, lz, cx, cz) => Region.camClear(lx, lz, cx, cz) : null; }, set() {} });
{ const arm = (px, pz, dx, dz, L, rad) => Region.camArm(px, pz, dx, dz, L, rad); Object.defineProperty(Game, 'camArm', { configurable: true, get() { return A.active && Region.data ? arm : null; }, set() {} }); }   // G4: spring-arm camera collision
Object.defineProperty(Game, 'groundY', { configurable: true, get() { return A.active && Region.ground ? Region.groundY : null; }, set() {} });   // repair: walkable height for characters, camera, FX
Object.defineProperty(Game, 'engaged', { configurable: true, get() { return A.active ? A.engaged : null; }, set() {} });
Object.defineProperty(Game, 'hudTarget', { configurable: true, get() { return A.active ? A.hudTarget : null; }, set() {} });
Game.pickTarget = function (p, cycle) { if (!A.active) return orig.pickTarget.call(this, p, cycle);
  const es = this.world.enemies().filter(e => { const en = Ents.byF.get(e.id); return dist(e.x, e.z, p.x, p.z) < 20 && Region.los(p.x, p.z, e.x, e.z) && (!en || en.mode === 'combat' || dist(e.x, e.z, p.x, p.z) < 12); }); if (!es.length) return null;
  if (cycle && p.lockId) { const i = es.findIndex(e => e.id === p.lockId); return es[(i + (cycle > 0 ? 1 : es.length - 1)) % es.length]; }
  let best = null, bs = 1e9; for (const e of es) { const d = dist(e.x, e.z, p.x, p.z), ang = Math.abs(angNorm(Math.atan2(e.x - p.x, e.z - p.z) - Cam.yaw)), s = d + ang * 6; if (s < bs) { bs = s; best = e; } } return best; };
Game.pause = function () { if (!A.active) return orig.pause.call(this); if (this.state === 'playing') A.openMenu(); };
Game.resume = function () { if (!A.active) return orig.resume.call(this); A.closeMenu(); };
Game.restart = function () { if (A.active) return; return orig.restart.call(this); };
Game.quit = function () { if (A.active) { A.quitToTitle(); return; } const r = orig.quit.call(this); A.refreshTitle(); return r; };
Game.onKey = function (code, repeat) {
  if (!A.active) return orig.onKey.call(this, code, repeat);
  if (G.Intro.active && !repeat && this.state === 'playing') { P1.Cinema.anyInput(); if (code === 'Escape' || code === 'KeyP') return; }
  if (repeat) return; const st = this.state;
  if (st === 'dialogue') { if (/^Digit[1-9]$/.test(code)) { A.dlgChoose(+code.slice(5) - 1); return; } if (code === 'KeyW' || code === 'ArrowUp') return A.dlgSel((A.dlg && A.dlg.sel || 0) - 1); if (code === 'KeyS' || code === 'ArrowDown') return A.dlgSel((A.dlg && A.dlg.sel || 0) + 1);
    if (['KeyE', 'Space', 'Enter', 'KeyJ', 'Escape', 'NumpadEnter'].includes(code)) A.dlgNext(); return; }
  if (st === 'reading') { if (['KeyE', 'Space', 'Enter', 'Escape', 'KeyJ'].includes(code)) A.closeRead(); return; }
  if (st === 'paused') { if ($('advRead').style.display === 'flex') { A.closeRead(); if (A.readingFromMenu) { A.readingFromMenu = false; this.state = 'paused'; } return; } if (code === 'Escape' || code === 'KeyP') A.closeMenu(); return; }
  if (st === 'ended' || st === 'prologue') return;
  if (code === 'Escape' || code === 'KeyP') { if (st === 'playing' && !A.dying && !A.busy) A.openMenu(); return; }
  if (code === 'KeyR') return;                               // R is the Draught in world mode (read in preIntent); never "restart"
  if (code === 'Enter') return;
  return orig.onKey.call(this, code, repeat); };
let lastNow = 0;
Game.frame = function (now) { orig.frame.call(this, now); if (A.active) { const dt = lastNow ? clamp((now - lastNow) / 1000, 0, 0.1) : 0; lastNow = now; try { A.post(dt, now / 1000); } catch (e) { console.error(e); if (!A._postErr) { A._postErr = true; toast('World update error: ' + e.message); } } } else lastNow = now; };
// FogBank sprites are positioned around the origin by v8 every frame (before render); in world mode they ring the player instead
{ const FB = P1.FogBank, fu = FB.update.bind(FB); FB.update = function (dt, now) { fu(dt, now); if (A.active && Game.world) { const p = Game.world.player; for (const s of FB.list) if (s.visible) { s.position.x += p.x; s.position.z += p.z; } } }; }

/* ---------- title wiring ---------- */
function bindTitle() { UI.init(); const n = $('advNew'), c = $('advContinue'); if (!n) return;
  n.onclick = () => { audio.ensure(); audio.play('ui'); if (Save.exists()) A.confirm('Begin a new journey? Your current progress will be overwritten (the previous save is kept in the backup slot until the next save).', () => { try { localStorage.setItem(Save.BAK, localStorage.getItem(Save.KEY) || ''); } catch (e) {} A.newGame(); }); else A.newGame(); };
  c.onclick = () => { audio.ensure(); audio.play('ui'); A.continueGame(); };
  $('advEndStay').onclick = () => { UI.show('advEnd', false); Input.clear(); Game.state = 'playing'; Game.lastFrame = performance.now(); };
  $('advEndTitle').onclick = () => A.quitToTitle();
  $('advRead').onclick = () => { if (Game.state === 'reading') A.closeRead(); else { UI.closeRead(); A.readingFromMenu = false; } };
  A.refreshTitle(); const ver = document.querySelector('#title .ver'); if (ver) ver.textContent = 'Phase 1 \u00b7 v9 \u00b7 Enter = practice'; }
bindTitle();
window.addEventListener('resize', () => { if (A.active && Game.state === 'paused' && A.menuTab === 'Map') A.renderMenu(); });
/* =====================================================================
   KEYS (chunk C) — every key is a real item in the world.
   - A foe that carries a key (region enemy `drop`) wears it visibly on his belt. When he falls it drops to the ground as an iron key
     (bow, shaft, bit) that glints and turns slowly; E within 2.2 m takes it (sound, flash, card, inventory entry with an icon).
   - Save: S().drops[item] = { x, z, from } while it lies on the ground (survives death, rest and reload); S().collected['drop_<foe>']
     marks that a foe has dropped its key (never again), S().collected['key_<item>'] that it was taken (never duplicated).
   - Objectives follow the real key state (clue read / key on the ground / key held / door open), shown as a compact top-left line with an
     "Objective updated" flash, an Objectives section in the pause menu, compass marks that point at the key or its door, and locked-door
     messages that name the key and where it is.
   Pure world layer: no core changes; a handful of meshes (2 draw calls per dropped key, 1 per belt key), no per-frame allocations.
   ===================================================================== */
const Keys = {
  list: {}, NONE: Object.freeze({}), _nd: 0, dyn: null, geo: null, mat: null, glow: null, marks: {}, _ok: true,
  items() { return Object.keys(D.ITEMS).filter(k => D.ITEMS[k].kind === 'key'); },
  st(item) { const d = S(); if (!d) return 'none'; if (d.drops && d.drops[item]) return 'ground'; if (Inv.count(item)) return 'held'; return d.collected['key_' + item] ? 'used' : 'none'; },
  carrier(item) { return Region.data && Region.data.enemies.find(e => e.drop === item); },
  /* the carrier still wears it: not dropped yet, not held, not taken */
  onBelt(def) { const d = S(); return !!def.drop && !d.collected['drop_' + def.id] && this.st(def.drop) === 'none'; },
  drop(def, f) { const d = S(), item = def.drop; if (!d || d.collected['drop_' + def.id] || this.st(item) !== 'none') return; d.collected['drop_' + def.id] = true;
    d.drops = d.drops || {}; const x = f ? f.x : def.x, z = f ? f.z : def.z; d.drops[item] = { x: +x.toFixed(2), z: +z.toFixed(2), from: def.id };
    this.sync(); if (A.active) { A.sfx('keydrop'); setTimeout(() => { if (A.active && this.st(item) === 'ground') UI.hint('Iron glints on the body \u2014 the ' + ((D.ITEMS[item] || {}).name || 'key') + '.', 4); }, 900); }
    A.refreshObjective(); Save.write(); },
  ensure(from, item, x, z) { const d = S(); if (!d || this.st(item) !== 'none' || d.collected['key_' + item]) return; d.collected['drop_' + from] = true; (d.drops = d.drops || {})[item] = { x, z, from }; },
  build() { const M = A.mats(); if (!this.mat) { this.mat = new THREE.MeshStandardMaterial({ color: 0x9a907e, roughness: 0.38, metalness: 0.85, emissive: 0x3a2608 }); this.mat.name = 'key'; lowTwinItem(this.mat, 0x9a907e, 0.8, 0x1a1206); }   // chunk G2: one material for the session + a Lambert twin (Low)
    const g = new THREE.Group(), m = this.mat;   // a 0.42 m iron key lying along +x: ring bow, shaft, two-tooth bit
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.017, 6, 14), m); bow.position.x = -0.15; g.add(bow);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.03, 6), m); collar.rotation.z = Math.PI / 2; collar.position.x = -0.075; g.add(collar);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.3, 6), m); shaft.rotation.z = Math.PI / 2; shaft.position.x = 0.07; g.add(shaft);
    const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.07, 0.016), m); b1.position.set(0.175, -0.042, 0); g.add(b1);
    const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.045, 0.016), m); b2.position.set(0.128, -0.03, 0); g.add(b2);
    A.mergeChildren(g); this.geo = g.children[0].geometry; this.glow = P1.glowTex(); void M; },
  makeMesh(scale) { if (!this.geo) this.build(); const env = !!tier().env; this.mat.metalness = env ? 0.85 : 0.45; this.mat.roughness = env ? 0.38 : 0.5;   // chunk G2: no env to reflect -> half-metal (full metal read black)
    const k = new THREE.Mesh(this.geo, tier().lambert ? A.mats()._twin.get(this.mat) || this.mat : this.mat); k.scale.setScalar(scale || 1); k.castShadow = false; return k; },
  makeGlint(size, op) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: 0xfff0c8, transparent: true, opacity: op || 0.6, depthWrite: false, blending: THREE.AdditiveBlending })); s.scale.set(size, size, 1); return s; },
  /* (re)build the ground keys for the current region; called every frame but only does work when the region or the drops changed */
  sync() { if (!Region.dyn) { this.list = {}; this.dyn = null; return; } if (this.dyn !== Region.dyn) { this.list = {}; this.dyn = Region.dyn; this.geo = null; this.poolGeo = null; }
    const d = S(), drops = (d && d.drops) || Keys.NONE;
    for (const item in this.list) if (!drops[item]) { const k = this.list[item]; Region.dyn.remove(k.grp); delete this.list[item]; }
    for (const item in drops) { if (this.list[item]) continue; const p = drops[item], gy = Region.groundY(p.x, p.z), grp = new THREE.Group(); grp.position.set(p.x, gy, p.z);
      const mesh = this.makeMesh(1.5); mesh.position.y = 0.32; mesh.rotation.x = 0.35; grp.add(mesh); const gl = this.makeGlint(0.7, 0.35); gl.position.y = 0.34; grp.add(gl);
      if (!this.poolMat) { this.poolMat = A.mats().glowPool.clone(); this.poolMat.opacity = 0.5; }   // chunk G2: half the warm pool (the key reads by itself now)
      const pool = new THREE.Mesh(this.poolGeo || (this.poolGeo = new THREE.PlaneGeometry(1.3, 1.3)), this.poolMat); pool.rotation.x = -Math.PI / 2; pool.position.y = 0.03; grp.add(pool);   // faint warm light on the floor under it
      Region.dyn.add(grp); const name = (D.ITEMS[item] || {}).name || item;
      this.list[item] = { item, grp, mesh, gl, x: p.x, z: p.z, ph: (p.x * 3.1 + p.z) % 6.28, inter: { label: 'Take the ' + name, act: () => this.take(item), x: p.x, z: p.z, key: item } }; } },
  update(now) { for (const item in this.list) { const k = this.list[item]; k.mesh.rotation.y = now * 0.9 + k.ph; k.mesh.position.y = 0.32 + Math.sin(now * 1.7 + k.ph) * 0.05;
      const tw = Math.max(0, Math.sin(now * 2.3 + k.ph)); k.gl.material.opacity = 0.15 + 0.3 * tw * tw * tw; k.gl.position.y = k.mesh.position.y + 0.02; } },
  take(item) { const d = S(); if (!d || !d.drops || !d.drops[item]) return; const k = this.list[item], p = d.drops[item]; delete d.drops[item]; d.collected['key_' + item] = true; Inv.give(item, 1); this.sync();
    const I = D.ITEMS[item] || {}; A.sfx('pickup'); A.sfx('key'); this.flash();
    try { FX.spark(new THREE.Vector3(p.x, Region.groundY(p.x, p.z) + 0.4, p.z), 16, 0.6, [1, 0.85, 0.5]); } catch (e) {}
    UI.area((I.name || item).toUpperCase(), I.use || ''); toast('Added to inventory: ' + (I.name || item)); void k;
    Quests.sync(); A.refreshObjective(); Save.write(); },
  flash() { let el = $('advKeyFlash'); if (!el) { el = document.createElement('div'); el.id = 'advKeyFlash'; document.body.appendChild(el); }
    el.style.transition = 'none'; el.style.opacity = 0.55; void el.offsetWidth; el.style.transition = 'opacity .9s ease-out'; el.style.opacity = 0; },
  near(p) { let best = null, bd = 2.2; for (const item in this.list) { const k = this.list[item], dd = dist(k.x, k.z, p.x, p.z); if (dd < bd) { bd = dd; best = k; } } this._nd = bd; return best; },   // nearest key within 2.2 m (its distance in _nd)
  /* belt keys: the carrier wears his key (mounted to the hips bone of the GLB, or the procedural hips before the model loads) */
  belts() { for (const e of Ents.list) { const def = e.def; if (!def.drop) continue; const c = e.c; if (!c) continue; const want = !e.f.dead && this.onBelt(def), mode = c.model ? 'm' : 'p';
      if (c._belt && (c._beltMode !== mode || c._beltModel !== c.model || !want)) { if (c._belt.parent) c._belt.parent.remove(c._belt); c._belt = null; }   // merge C+F: F can swap the body (Quaternius on Medium+), so re-mount on a new model
      if (!want || c._belt) continue;
      let host = null; if (c.model && c.model.byName && c.model.byName.Hips && c.model.K && c.model.K.get(c.model.byName.Hips)) { host = new THREE.Group(); host.quaternion.copy(c.model.K.get(c.model.byName.Hips)).invert(); c.model.byName.Hips.add(host); }
      else if (c.hips) { host = new THREE.Group(); c.hips.add(host); } if (!host) continue;
      if (c.model && c.model.q) { host.updateMatrixWorld(true); const hs = host.getWorldScale(new THREE.Vector3()).x, rs = c.root.getWorldScale(new THREE.Vector3()).x; if (hs > 1e-6) host.scale.setScalar(rs / hs); }   // merge C+F: Quaternius skeletons sit under a scale group; keep the belt key at character scale (once per mount)
      const big = def.boss ? 1.25 : 1; const ring = new THREE.Group(); ring.position.set(0.19 * big, -0.1, 0.07); ring.rotation.set(0, 0.3, -Math.PI / 2 + 0.25); host.add(ring);
      ring.add(this.makeMesh(1.05 * big)); const gl = this.makeGlint(0.3, 0.5); gl.position.x = -0.12; ring.add(gl);
      c._belt = host; c._beltMode = mode; c._beltModel = c.model; } },
};
A.Keys = Keys;
/* sounds: a dull clink when a key hits the flagstones, a bright ring when it is taken */
{ const sfx0 = A.sfx; A.sfx = function (name) { if (name === 'key' || name === 'keydrop') { if (!audio.ok) return; if (name === 'key') { [1568, 2093, 2637].forEach((f, i) => audio.tone(f, 0.35, 'triangle', 0.035, 0.05 + i * 0.06)); } else { audio.nz(0.12, 'bandpass', 2600, 4, 0.12, 0.1); audio.tone(1240, 0.25, 'triangle', 0.04, 0.02); audio.tone(930, 0.3, 'triangle', 0.03, 0.14); } return; } return sfx0(name); }; }

/* ---------- objectives tied to the real quest + key state ---------- */
const OBJ = { t: '', s: '' };
A.objective = function () { const st = Quests.stage('main'); OBJ.t = ''; OBJ.s = ''; if (st === null || !S()) return OBJ; const Q = D.QUESTS.main.stages, d = S(); OBJ.t = Q[st] || '';
  // merge 2: reading the clue points the objective at the sergeant as soon as the blade is in hand (stage 2). The first Vigil Lantern stays
  // optional: before or after Brask, kindling it only moves the stage to 3 (same line), and the sub-line mentions it until it is lit.
  const clue2 = st === 2 && d.flags.clue_gaolkey;
  if (st === 3 || st === 4 || clue2) { const g = Keys.st('gaolkey');
    if (g === 'held' && !d.opened.gaoldoor) { OBJ.t = 'Gaol Key acquired: unlock the gaol door'; OBJ.s = 'The north door, at the end of the Gaol\u2019s west passage.'; }
    else if (g === 'ground') { OBJ.t = 'Take the Gaol Key from the sergeant\u2019s body'; OBJ.s = 'It lies where Sergeant Brask fell, in the Gaol office.'; }
    else if (st === 4 || d.flags.clue_gaolkey) { OBJ.t = 'The sergeant by the gaol carries the key'; OBJ.s = 'Sergeant Brask drinks by the fire in the Gaol office. The key hangs on his belt.' + (clue2 ? ' (Optional: kindle the Vigil Lantern at the top of the cut on the way.)' : ''); }
    else { OBJ.t = 'Find a way out of the Execution Grounds'; OBJ.s = 'The yard\u2019s north gate is barred from the far side. Try the Gaol, east of the gallows.'; } }
  else if (st === 5) OBJ.s = 'Odran Vale, the headsman, wears the key to the Hollowwood Gate.';
  else if (st === 6) OBJ.s = 'He wears the Headsman\u2019s Key on his belt.';
  else if (st === 7) { const h = Keys.st('headkey');
    if (h === 'ground') { OBJ.t = 'Take the Headsman\u2019s Key from Odran\u2019s body'; OBJ.s = 'It lies on the Block where he fell.'; }
    else if (h === 'held') { OBJ.t = 'Headsman\u2019s Key acquired: open the Hollowwood Gate'; OBJ.s = 'The chained gate, north of the Block.'; } }
  return OBJ; };
A.refreshObjective = function () { const o = A.objective(), el = $('advObj'); if (!el) return; Keys.cssOnce();
  let sp = el.querySelector('span'), em = el.querySelector('em'), sm = el.querySelector('small'); if (!em) { em = document.createElement('em'); el.appendChild(em); }
  const changed = !!(A._objT && o.t && A._objT !== o.t && A.active && Game.world); if (sp.textContent !== o.t) sp.textContent = o.t; if (em.textContent !== o.s) em.textContent = o.s; el.style.display = o.t ? 'block' : 'none';
  if (o.t) A._objT = o.t; A._objS = o.s;
  if (changed) { sm.textContent = 'Objective updated'; el.classList.add('upd'); clearTimeout(A._objTm); A._objTm = setTimeout(() => { sm.textContent = 'Objective'; el.classList.remove('upd'); }, 2600); try { audio.play('ui'); } catch (e) {} } };
Keys.cssOnce = function () { if (Keys._css || !document.head) return; Keys._css = true; const st = document.createElement('style'); st.textContent =
  '#advObj{max-width:340px;font-size:13px;line-height:1.35;background:linear-gradient(90deg,rgba(8,6,6,.55),rgba(8,6,6,0));padding:5px 18px 6px 10px;border-left:2px solid rgba(168,52,58,.85)}' +
  '#advObj span{display:block;color:#efe2c4}#advObj em{display:block;font-size:11.5px;color:#a99d86;margin-top:2px}#advObj em:empty{display:none}' +
  '#advObj small{transition:color .3s}#advObj.upd small{color:#f0c060;text-shadow:0 0 8px rgba(240,190,90,.7)}#advObj.upd{border-left-color:#f0c060}' +
  '#advKeyFlash{position:fixed;inset:0;z-index:7;pointer-events:none;opacity:0;background:radial-gradient(ellipse at center,rgba(255,224,150,.55),rgba(255,200,110,.12) 45%,rgba(0,0,0,0) 70%)}' +
  '#advMenu .it.ico{display:flex;gap:12px;align-items:center}#advMenu .it.ico svg{flex:0 0 34px}#advMenu .it.ico div{flex:1}#advMenu .it.obj{border-left-color:#f0c060}';
  document.head.appendChild(st); };
/* keep the line honest every half second (key state can change without a quest change: pickups, drops, the door) */
A.keysPost = function (now) { Keys.sync(); Keys.update(now); Keys.belts(); if (!A._objN || now - A._objN > 0.5) { A._objN = now; const o = A.objective(); if (o.t !== A._objT || o.s !== A._objS) A.refreshObjective(); } };
/* compass objective marks follow the key: the carrier, the key on the ground, then its door */
{ const R = D.REGIONS.execution, OM = R.objectiveMarks, base = { 2: OM[2], 3: OM[3], 4: OM[4], 7: OM[7] }, out = [0, 0], door = [-53, -13], serg = [-43, -25];
  const keyMark = (item, fallback, heldAt) => { const d = S(), st = Keys.st(item); if (st === 'ground') { const p = d.drops[item]; out[0] = p.x; out[1] = p.z; return out; } if (st === 'held' && heldAt) return heldAt; return fallback; };
  Object.defineProperty(OM, 2, { configurable: true, enumerable: true, get: () => !S() || !S().flags.clue_gaolkey ? base[2] : keyMark('gaolkey', serg, door) });   // merge 2: clue read at stage 2
  Object.defineProperty(OM, 3, { configurable: true, enumerable: true, get: () => !S() ? base[3] : keyMark('gaolkey', S().flags.clue_gaolkey ? serg : base[3], door) });
  Object.defineProperty(OM, 4, { configurable: true, enumerable: true, get: () => !S() ? base[4] : keyMark('gaolkey', base[4], door) });
  Object.defineProperty(OM, 7, { configurable: true, enumerable: true, get: () => !S() ? base[7] : keyMark('headkey', base[7], base[7]) });
  /* locked-door messages name the key and where it is right now */
  const lockMsg = { gaoldoor: ['gaolkey', 'Locked. It needs the Gaol Key \u2014 Sergeant Brask carries it on his belt, by the fire in the Gaol office (just south).', 'Locked. The Gaol Key lies with Sergeant Brask\u2019s body in the Gaol office.'],
    hollowgate: ['headkey', 'A great gate, chained. It needs the Headsman\u2019s Key \u2014 Odran Vale wears it on his belt, on the Block.', 'A great gate, chained. The Headsman\u2019s Key lies with Odran Vale\u2019s body on the Block.'] };
  for (const g of R.gates) { const L = lockMsg[g.id]; if (!L) continue; Object.defineProperty(g, 'locked', { configurable: true, enumerable: true, get: () => S() && Keys.st(L[0]) === 'ground' ? L[2] : L[1] }); } }
/* interaction: keys on the ground can always be taken (even with a foe engaged nearby), and a locked door says which key it wants */
{ const scan0 = A.scanInteract; A.scanInteract = function () { let best = scan0.call(this); const w = Game.world, p = w && w.player; if (!p || p.dead || A.busy || Game.state !== 'playing') return best;
    if (best && /^Examine the /.test(best.label)) for (const k in Region.gates) { const st = Region.gates[k]; if (st.mx === best.x && st.mz === best.z && st.def.how.startsWith('item:')) { best.label = 'Locked \u2014 needs the ' + ((D.ITEMS[st.def.how.slice(5)] || {}).name || 'key'); break; } }
    const kn = Keys.near(p); if (kn) best = kn.inter;   // merge C+D: a key within 2.2 m always comes first (the Headsman's Key lies under the 'Kneel by the headsman' prompts; take it, then kneel)
    A.inter = best; return best; }; }
/* the clue: reading the posted order in the pit points the objective at the sergeant */
{ const read0 = A.readLore; A.readLore = function (id) { read0.call(this, id); if (id === 'order' && S() && !S().flags.clue_gaolkey) { S().flags.clue_gaolkey = true; A.refreshObjective(); Save.write(); } }; }
/* opening the gaol door is the step after the key */
{ const open0 = A.openGate; A.openGate = function (id) { open0.call(this, id); if (id === 'gaoldoor' && S() && S().opened.gaoldoor) Quests.set('main', 5, 'max'); A.refreshObjective(); }; }
/* pause menu: Objectives (top of Journey) and an Inventory with icons + descriptions */
const ICON = { key: '<svg viewBox="0 0 34 34" width="34" height="34"><circle cx="9" cy="17" r="6" fill="none" stroke="#c9b48a" stroke-width="2.6"/><rect x="15" y="15.7" width="15" height="2.6" fill="#c9b48a"/><rect x="25" y="18" width="2.6" height="5" fill="#c9b48a"/><rect x="21" y="18" width="2.2" height="3.4" fill="#c9b48a"/></svg>',
  consumable: '<svg viewBox="0 0 34 34" width="34" height="34"><path d="M13 6h8v5l4 5v12H9V16l4-5z" fill="#c26a1e" stroke="#ffcf70" stroke-width="1.5"/></svg>',
  quest: '<svg viewBox="0 0 34 34" width="34" height="34"><rect x="7" y="11" width="20" height="12" rx="2" fill="#8a8478" stroke="#c9b48a" stroke-width="1.4"/><path d="M11 17h12" stroke="#2a1d12" stroke-width="1.4"/></svg>',
  keepsake: '<svg viewBox="0 0 34 34" width="34" height="34"><path d="M10 27C12 17 18 9 26 6c-2 8-7 15-16 21z" fill="#9aa0a8" stroke="#d8cbb0" stroke-width="1.2"/><path d="M10 27l9-12" stroke="#a8343a" stroke-width="1.4"/></svg>' };
A.itemIcon = id => ICON[(D.ITEMS[id] || {}).kind] || ICON.quest;
A.menuExtra = function (tab) { const d = S(); const it = (t, s, cls, ico) => '<div class="it ' + (cls || '') + (ico ? ' ico' : '') + '">' + (ico || '') + '<div><b>' + t + '</b><small>' + s + '</small></div></div>';
  if (tab === 'Journey') { const o = A.objective(); let h = '<h4>Objectives</h4>' + (o.t ? it(o.t, o.s || 'Current objective', 'main obj') : it('Nothing pressing.', '', 'done'));
    for (const k of Object.keys(D.QUESTS)) { if (k === 'main' || !d.quests[k]) continue; const Q = D.QUESTS[k], q = d.quests[k], done = q.stage >= Q.stages.length - 1 || (k === 'crane' && q.stage >= 2); if (!done) h += it(Q.stages[q.stage], Q.name + ' \u2014 ' + (Q.giver || 'side')); }
    for (const k of Keys.items()) { const st = Keys.st(k), I = D.ITEMS[k]; if (st === 'ground') h += it(I.name + ' \u2014 on the ground', 'Dropped by ' + I.where + '. Walk to it and press E.', '', ICON.key); }
    return h + '<div style="height:10px"></div>'; }
  if (tab === 'Inventory') { const keys = Object.keys(d.inv).filter(k => D.ITEMS[k] && d.inv[k] > 0); const K = keys.filter(k => D.ITEMS[k].kind === 'key'), O = keys.filter(k => D.ITEMS[k].kind !== 'key');
    const row = k => it(D.ITEMS[k].name + (d.inv[k] > 1 || k === 'draught' ? ' \u00d7' + d.inv[k] : ''), (D.ITEMS[k].use ? D.ITEMS[k].use + '. ' : '') + D.ITEMS[k].desc, '', A.itemIcon(k));
    return '<h4>Keys</h4>' + (K.length ? K.map(row).join('') : '<i>No keys. Keys are carried by certain foes \u2014 watch their belts.</i>') + '<h4>Items</h4>' + (O.length ? O.map(row).join('') : '<i>Nothing yet.</i>')
      + '<h4>Weapons</h4>' + (d.weapons.length ? d.weapons.map(k => it(D.WEAPONS[k].name + (d.equip.weapon === k ? ' (equipped)' : ''), D.WEAPONS[k].desc)).join('') : '<i>Unarmed.</i>'); }
  return null; };

A.api = { Save, Region, Ents, Quests, Inv, Cond, act, segX, Token, AGGRO, TOK, Keys };
console.log('[Veynhold] world mode ready (regions: ' + Object.keys(D.REGIONS).join(', ') + ')');
})();
