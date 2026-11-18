/* =====================================================================
   VEYNHOLD — chunk I4: SURFACE MATERIALS (blueprint 4.5) — presentation + world-layer data only; core.js is untouched.
   SurfaceDef = { id, footstep, particle, dustAmount, wetness, frictionMod }
   - Chapter I is tagged here (region surfaces list, zone surfaces, elevation pieces, small patches) so the region data file stays as it is.
   - Queried on every foot plant (player + nearby foes) and on ground impacts (dodge scuff, deathblow plant, body land). The last surface per
     fighter is cached by 0.5 m cell; A.Surf.last holds the most recent result.
   - Each surface has its own footstep sound (AudioSys 'step_<footstep>', priority 3) and particle (FX.dust pool, no new buffers or lights).
   - Low: half the particles (on top of the tier's particle scale). During the deathblow hold (A.DBAudio.hold) steps play at 35 %.
   - frictionMod is presentation only (the world layer has no friction): it stretches the dodge scuff and its particle trail. Core movement is unchanged.
   ===================================================================== */
(function () {
'use strict';
const G = window.VEYN_GAME, D = window.VEYN_DATA, A = window.VEYN_ADV;
if (!G || !D || !A || !A.api || !G.P1) return;
const { Game, Character, FX, camera } = G, P1 = G.P1, { audio, tier } = P1, { Region } = A.api;

const SURFACES = A.SURFACES = {
  stone:     { id: 'stone',     footstep: 'stone',  particle: 'dust',     dustAmount: 0.5, wetness: 0.1,  frictionMod: 1.0 },
  wet_stone: { id: 'wet_stone', footstep: 'wet',    particle: 'splash',   dustAmount: 0.6, wetness: 0.8,  frictionMod: 0.88 },
  mud:       { id: 'mud',       footstep: 'mud',    particle: 'mud',      dustAmount: 1.0, wetness: 0.9,  frictionMod: 0.8 },
  wood:      { id: 'wood',      footstep: 'wood',   particle: 'splinter', dustAmount: 0.4, wetness: 0.2,  frictionMod: 1.0 },
  ash:       { id: 'ash',       footstep: 'ash',    particle: 'ash',      dustAmount: 1.4, wetness: 0.0,  frictionMod: 0.95 },
  gravel:    { id: 'gravel',    footstep: 'gravel', particle: 'grit',     dustAmount: 0.8, wetness: 0.15, frictionMod: 0.92 },
  bone:      { id: 'bone',      footstep: 'bone',   particle: 'chip',     dustAmount: 0.5, wetness: 0.0,  frictionMod: 0.9 } };
// particle looks: colour (linear-ish rgb), outward speed, upward speed, life (s), gravity
const PARTS = {
  dust:     { c: [0.40, 0.38, 0.35], sp: 0.7, up: 0.5, life: 0.55, g: 1.2 },
  splash:   { c: [0.50, 0.58, 0.66], sp: 1.3, up: 1.7, life: 0.32, g: 9 },
  mud:      { c: [0.20, 0.14, 0.09], sp: 1.0, up: 1.3, life: 0.4,  g: 9 },
  splinter: { c: [0.44, 0.32, 0.20], sp: 0.9, up: 0.9, life: 0.45, g: 7 },
  ash:      { c: [0.58, 0.56, 0.53], sp: 0.6, up: 0.6, life: 1.0,  g: 0.6 },
  grit:     { c: [0.36, 0.33, 0.29], sp: 1.1, up: 1.1, life: 0.35, g: 9 },
  chip:     { c: [0.74, 0.71, 0.62], sp: 1.0, up: 1.2, life: 0.4,  g: 9 } };
// the old zone 'floor' keys, for regions without explicit tags
const FLOOR_MAP = { mud: 'mud', flag: 'wet_stone', cell: 'stone', dirt: 'gravel', bone: 'bone', wood: 'wood', stone: 'stone', ash: 'ash', gravel: 'gravel' };

/* Chapter I tags. zones: zone id -> surface. elevation: stair / platform id -> surface (wins inside its footprint). patches: rect [x0,z0,x1,z1]
   or circle [cx,cz,r] that override the zone underneath (first match wins). */
const TAGS = A.SURFACE_TAGS = {
  execution: {
    surfaces: ['mud', 'wet_stone', 'stone', 'wood', 'gravel', 'bone', 'ash'],
    zones: { pit: 'mud', cut: 'mud', yard: 'wet_stone', gaol: 'stone', muster: 'gravel', oss: 'bone', stair: 'wet_stone', block: 'wet_stone', hgate: 'gravel' },
    elevation: { gallows_steps: 'wood', gallows: 'wood', stair_lower: 'wet_stone', stair_upper: 'wet_stone', stair_landing: 'wet_stone' },
    patches: [
      { circle: [0, 50, 6.5], s: 'ash' },              // the Block: ash and old pyre soot round the headsman's block
      { rect: [-48, -31, -38, -21], s: 'wood' },        // the Gaol office: plank floor by the sergeant's fire
      { rect: [-4, 35, 4, 64], s: 'wet_stone' },        // stair head + causeway to the Hollowwood Gate (raised flagstones)
    ] } };

function applyTags() { for (const id in TAGS) { const R = D.REGIONS && D.REGIONS[id], T = TAGS[id]; if (!R) continue; R.surfaces = T.surfaces.slice();
    for (const z of R.zones || []) z.surface = T.zones[z.id] || FLOOR_MAP[z.floor] || 'stone';
    const E = R.elevation || {}; for (const k of ['stairs', 'platforms']) for (const e of E[k] || []) if (T.elevation[e.id]) e.surface = T.elevation[e.id];
    R.surfacePatches = T.patches; }
  for (const id in D.REGIONS || {}) { const R = D.REGIONS[id]; if (TAGS[id]) continue; for (const z of R.zones || []) if (!z.surface) z.surface = FLOOR_MAP[z.floor] || 'stone'; } }
applyTags();

const inRect = (r, x, z) => x >= Math.min(r[0], r[2]) && x <= Math.max(r[0], r[2]) && z >= Math.min(r[1], r[3]) && z <= Math.max(r[1], r[3]);
const inCirc = (c, x, z) => (x - c[0]) * (x - c[0]) + (z - c[1]) * (z - c[1]) <= c[2] * c[2];
/* precedence list per region (built once): stairs, platforms, patches, zone rects / circles; first match wins. An entry is 'clean' when no
   earlier entry overlaps its box, so a fighter still inside the shape its last plant matched can reuse that surface without a new search. */
const LISTS = new WeakMap();
function box(e) { return e.c ? [e.c[0] - e.c[2], e.c[1] - e.c[2], e.c[0] + e.c[2], e.c[1] + e.c[2]] : [Math.min(e.r[0], e.r[2]), Math.min(e.r[1], e.r[3]), Math.max(e.r[0], e.r[2]), Math.max(e.r[1], e.r[3])]; }
function listOf(R) { let L = LISTS.get(R); if (L) return L; L = []; const E = R.elevation || {};
  for (const st of E.stairs || []) if (st.surface) L.push({ r: [st.x0, st.z0, st.x1, st.z1], s: st.surface });
  for (const p of E.platforms || []) if (p.surface) L.push(p.rect ? { r: p.rect, s: p.surface } : { c: p.circle, s: p.surface });
  for (const p of R.surfacePatches || []) L.push(p.rect ? { r: p.rect, s: p.s } : { c: p.circle, s: p.s });
  for (const zn of R.zones || []) { if (zn.circle) L.push({ c: zn.circle, s: zn.surface || 'stone' }); for (const r of zn.rects || []) L.push({ r, s: zn.surface || 'stone' }); }
  L.forEach((e, i) => { const b = box(e); e.clean = !L.slice(0, i).some(o => { const q = box(o); return q[0] < b[2] && q[2] > b[0] && q[1] < b[3] && q[3] > b[1]; }); e.inside = e.c ? (x, z) => inCirc(e.c, x, z) : (x, z) => inRect(e.r, x, z); });
  LISTS.set(R, L); return L; }
function find(R, x, z) { const L = listOf(R); for (let i = 0; i < L.length; i++) if (L[i].inside(x, z)) return L[i]; return null; }
// pure resolver: region def + point -> surface id
function resolve(R, x, z) { if (!R) return 'stone'; const e = find(R, x, z); return e ? e.s : (R.surfaces && R.surfaces[0]) || 'stone'; }

const Surf = A.Surf = { last: SURFACES.stone, cache: new Map(), hits: 0, misses: 0, resolve, parts: PARTS };
// cached query (the last surface per key = fighter id): reused while the point stays inside the clean shape it matched (or the same 0.5 m cell)
Surf.at = function (x, z, key) { const R = Region.data, cx = Math.floor(x * 2), cz = Math.floor(z * 2);
  let c = this.cache.get(key); if (c && c.R === R && ((c.cx === cx && c.cz === cz) || (c.e && c.e.clean && c.e.inside(x, z)))) { this.hits++; c.cx = cx; c.cz = cz; return (this.last = c.s); }
  const e = R ? find(R, x, z) : null, s = SURFACES[e ? e.s : resolve(R, x, z)] || SURFACES.stone; this.misses++;
  if (!c) { c = { cx: 0, cz: 0, R: null, e: null, s: null }; this.cache.set(key, c); } c.cx = cx; c.cz = cz; c.R = R; c.e = e; c.s = s; return (this.last = s); };
Surf.clear = function () { this.cache.clear(); };
// particles from the pooled FX.dust buffer; n is scaled by the tier's particle scale and halved again on Low
Surf.puff = function (s, x, z, k, dirX, dirZ) { if (!FX.dust) return 0; const P = PARTS[s.particle] || PARTS.dust, T = tier(), low = G.Settings.quality === 'low';
  const want = s.dustAmount * k * (T.particles || 1) * (low ? 0.5 : 1); let n = Math.floor(want); if (Math.random() < want - n) n++; if (n <= 0) return 0;
  const y = (Region.groundY ? Region.groundY(x, z) : 0) + 0.05;
  for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, sp = P.sp * (0.4 + Math.random() * 0.8), bx = dirX || 0, bz = dirZ || 0;
    FX.dust.spawn(x + Math.cos(a) * 0.08, y, z + Math.sin(a) * 0.08, Math.cos(a) * sp + bx, P.up * (0.5 + Math.random() * 0.7), Math.sin(a) * sp + bz, P.life * (0.7 + Math.random() * 0.6), P.c[0], P.c[1], P.c[2], P.g); }
  this.parts = PARTS; this.lastPuff = n; return n; };
Surf.quiet = () => (A.DBAudio && A.DBAudio.hold ? 0.35 : 1);
// one foot plant: sound + particle. o = the original play('step') options (pan / vol for foes)
Surf.step = function (f, o, play) { const s = this.at(f.x, f.z, f.id), q = this.quiet(); const v = (o && o.vol !== undefined ? o.vol : 1) * q;
  play('step_' + s.footstep, { pan: o && o.pan, vol: v });
  this.puff(s, f.x, f.z, f.isPlayer ? 1.6 * q : 1.0 * q); this.steps = (this.steps || 0) + 1; return s; };
// ground impacts
Surf.impact = function (kind, x, z, key, o) { const s = this.at(x, z, key); o = o || {}; const q = kind === 'land' ? 1 : this.quiet();
  if (kind === 'dodge') { audio.play('step_' + s.footstep, { vol: 1.5 * q, pan: o.pan }); audio.play('step_' + s.footstep, { vol: 0.9 * q * (2 - s.frictionMod), pan: o.pan }); this.puff(s, x, z, 3 * (2 - s.frictionMod) * q, o.dx || 0, o.dz || 0); }
  else if (kind === 'plant') { audio.play('step_' + s.footstep, { vol: 1.8 }); this.puff(s, x, z, 2.5); }
  else if (kind === 'land') { audio.play('bodyfall', { vol: o.boss ? 1 : 0.7 }); audio.play('step_' + s.footstep, { vol: 3 }); this.puff(s, x, z, o.boss ? 9 : 6); }
  return s; };

// which character is updating (its footstep code calls audio.play('step') without a position)
{ const up = Character.prototype.update; Character.prototype.update = function () { const pc = Surf.cur; Surf.cur = this; try { return up.apply(this, arguments); } finally { Surf.cur = pc; } }; }
// footsteps: in world mode, swap the generic 'step' for the surface under the stepping fighter
{ const play1 = audio.play.bind(audio); audio.play = function (name, o) {
    if (name === 'step' && A.active && Surf.cur && Surf.cur.f) { try { Surf.step(Surf.cur.f, o, play1); return; } catch (e) { /* fall back to the generic step */ } }
    return play1(name, o); }; }
// ground impacts from core events (read-only; no allocation: the event list is walked before the frame consumes it)
{ const he = Game.handleEvents; Game.handleEvents = function () { const w = this.world;
    if (A.active && w && w.events) for (let i = 0; i < w.events.length; i++) { const e = w.events[i];
      if (e.type === 'dodge') { const f = w.byId(e.f); if (f) { const d = Math.hypot(f.x - camera.position.x, f.z - camera.position.z); if (f.isPlayer || d < 14) Surf.impact('dodge', f.x, f.z, f.id, { dx: f.vx * 0.15 || 0, dz: f.vz * 0.15 || 0 }); } } }
    return he.apply(this, arguments); }; }
{ const ab = A.buildWorld; if (ab) A.buildWorld = function () { Surf.clear(); return ab.apply(this, arguments); }; }
})();
