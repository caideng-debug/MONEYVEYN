/* =====================================================================
   VEYNHOLD — CHUNK G3: ILSABET'S TWO DIALOGUE CUTSCENES (world layer only; core.js untouched, combat timing unchanged)
   - Scene: a small reusable cutscene runner lifted from Odran's cutscene (BD.Cut in world_boss.js), which is left exactly as it was.
     Same DOM (#vhSub subtitles, #vhSkip hint), same letterbox, same G.Intro hold (the sim waits at its tick), same Esc / E skip,
     same camera blend in and out. A scene is data: lines, camera shots, actor moves, pose tracks, timed events, onEnd.
   - "The Cage" (~19.6 s): the cage door swings open, Ilsabet steps out, says where she will wait and hands over the feather.
     Afterwards she visibly walks to the shadow under the Headsman's Stair (no fade, no walking through bars).
   - "The Block" (~19.6 s + walk): after Odran's last words and the key, she climbs the Stair, comes up to Wren and speaks,
     then walks to the Hollowwood Gate.
   - Saved flags: crane_freed (end of the Cage scene), crane_waiting (reached the Stair), crane_block_seen (end of the Block
     scene), crane_gate (reached the gate). A reload repairs a walk that was cut short, so she is always in the cage, at the Stair,
     or at the gate.
   ===================================================================== */
(function () {
'use strict';
const G = window.VEYN_GAME, CORE = window.VEYN_CORE, D = window.VEYN_DATA, A = window.VEYN_ADV;
if (!G || !CORE || !D || !A || !A.api || !A.BossD || !G.P1) { console.warn('[Veynhold] chunk G3 (scenes) unavailable'); return; }
const THREE = window.THREE, P1 = G.P1, BD = A.BossD, $ = id => document.getElementById(id);
const { Game, Cam, Input, Character, POSES } = G; const { audio, Letterbox, Cinema, NameCard } = P1; const Intro = G.Intro;
const { clamp, angNorm } = CORE; const { Region, Save, Inv, act } = A.api; const S = () => Save.data;
const HEADLESS = !!window.__VEYN_HEADLESS;

/* ---------------------------------------------------------------- places (Execution Grounds) */
const CAGE = { x: 26, z: 22 }, DOOR_OPEN = 2.3;
const WAIT = { x: 7.2, z: 26.2, face: -Math.PI / 2 };          // = region npc ilsabet_wait: shadow under the east Stair tower
const GATE = { x: 2.6, z: 66, face: -Math.PI / 2 };            // = region npc ilsabet_gate
const STAIR_HEAD = { x: 0, z: 36.3 }, STAIR_LANDING = { x: 0, z: 33.0 }, BLOCK = { x: 0, z: 50, r: 1.2 };
const FREE_PATH = [[24.75, 21.85], [22.6, 21.2], [18.5, 19.8], [10.5, 20.6], [WAIT.x, WAIT.z]];   // south of the tent (14, 24); checked by .test/ilsabet.js
const GATE_PATH = [[0.8, 58], [2.6, 64.5], [GATE.x, GATE.z]];

/* ---------------------------------------------------------------- subtitles: the boss cutscene's own DOM (created by world_boss.js) */
let subKey = -1;
const showSub = (i, who, text) => { const el = $('vhSub'); if (!el || i === subKey) return; subKey = i; if (i < 0) { el.style.opacity = 0; return; } el.querySelector('b').textContent = who; el.querySelector('span').textContent = text; el.style.opacity = 1; };
const skipHint = on => { const el = $('vhSkip'); if (el) el.style.opacity = on ? 1 : 0; };

/* ---------------------------------------------------------------- pose sampling (same smoothstep track format as the boss cutscene) */
const KEYS = Object.keys(POSES.ready);
const sm01 = t => t * t * (3 - 2 * t), eio = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
// Ilsabet has no blade: in a scene she stands easy (arms down) instead of the duelist's guard
const PZ = { rest: Object.assign({}, POSES.ready, { hipY: -0.02, lean: 0.03, twist: 0, side: 0, headX: 0, rSx: 0.06, rSy: 0, rSz: -0.12, rE: -0.22, wX: 0, wZ: 0, lSx: 0.06, lSy: 0, lSz: 0.12, lE: -0.22, lLeg: 0, rLeg: 0, lKnee: 0.06, rKnee: 0.06, legSpread: 0.07 }) };
PZ.look = Object.assign({}, PZ.rest, { headX: 0.42, lean: 0.12, hipY: -0.05 });   // looking down at the floor
const P = n => PZ[n] || POSES[n];
function sample(out, tr, t, stance, entry) { const g = n => n === '@' ? entry : n === null ? stance : P(n);
  if (t <= tr[0][0]) { Object.assign(out, g(tr[0][1])); return out; }
  for (let i = 0; i < tr.length - 1; i++) { const a = tr[i], b = tr[i + 1]; if (t <= b[0]) { const A0 = g(a[1]), B0 = g(b[1]), u = sm01((t - a[0]) / Math.max(1e-4, b[0] - a[0])); for (const k of KEYS) out[k] = A0[k] + (B0[k] - A0[k]) * u; return out; } }
  Object.assign(out, g(tr[tr.length - 1][1])); return out; }
const bump = (t, a, b, r) => clamp((t - a) / r, 0, 1) * clamp((b - t) / r, 0, 1);   // 0 -> 1 -> 0 window with r-second ramps
// trapezoid speed profile: accelerate over the first / last `a` of the move (u, s in 0..1)
const trap = (u, a) => { u = clamp(u, 0, 1); const v = 1 / (1 - a); if (u < a) return v * u * u / (2 * a); if (u > 1 - a) { const w = 1 - u; return 1 - v * w * w / (2 * a); } return v * (u - a / 2); };

/* ---------------------------------------------------------------- small geometry helpers */
const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
const pathLen = pts => { let L = 0; for (let i = 1; i < pts.length; i++) L += dist(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]); return L; };
function along(pts, s, out) { let rem = s; for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], l = dist(a[0], a[1], b[0], b[1]); if (rem <= l || i === pts.length - 1) { const k = l > 1e-6 ? clamp(rem / l, 0, 1) : 1; out.x = a[0] + (b[0] - a[0]) * k; out.z = a[1] + (b[1] - a[1]) * k; return out; } rem -= l; }
  out.x = pts[0][0]; out.z = pts[0][1]; return out; }
// insert a side waypoint wherever a leg passes through a circle (the great block, Odran's body)
function route(pts, obs) { const out = [pts[0].slice()];
  for (let i = 1; i < pts.length; i++) { const b = pts[i]; for (let pass = 0; pass < 2; pass++) { const a = out[out.length - 1]; let hit = null;
      for (const o of obs) { const ex = b[0] - a[0], ez = b[1] - a[1], L2 = ex * ex + ez * ez || 1e-6, t = clamp(((o.x - a[0]) * ex + (o.z - a[1]) * ez) / L2, 0, 1), cx = a[0] + ex * t, cz = a[1] + ez * t;
        if (t > 0.02 && t < 0.98 && dist(cx, cz, o.x, o.z) < o.r) { hit = { o, cx, cz, ex, ez }; break; } }
      if (!hit) break; const L = Math.hypot(hit.ex, hit.ez) || 1; let px = -hit.ez / L, pz = hit.ex / L; if ((hit.cx - hit.o.x) * px + (hit.cz - hit.o.z) * pz < 0) { px = -px; pz = -pz; }
      out.push([hit.o.x + px * (hit.o.r + 0.35), hit.o.z + pz * (hit.o.r + 0.35)]); }
    out.push(b.slice()); }
  return out; }
const mirrorAcross = (p, a, b) => { const ex = b[0] - a[0], ez = b[2] - a[2], L2 = ex * ex + ez * ez || 1e-6, t = ((p[0] - a[0]) * ex + (p[2] - a[2]) * ez) / L2, cx = a[0] + ex * t, cz = a[2] + ez * t; return [2 * cx - p[0], p[1], 2 * cz - p[2]]; };
const shotClear = s => Region.camClear(s[4][0], s[4][2], s[2][0], s[2][2]) && Region.camClear(s[5][0], s[5][2], s[3][0], s[3][2]);

/* ---------------------------------------------------------------- the crane feather (one small mesh, built once, carried hand to hand) */
const Feather = { mesh: null, on: null };
Feather.build = function () { if (this.mesh) return this.mesh; const g = new THREE.ConeGeometry(0.036, 0.46, 5); g.translate(0, 0.23, 0); g.scale(1, 1, 0.3);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xcfc9bc })); m.castShadow = false; this.mesh = m; return m; };
Feather.attach = function (c) { this.on = c || null; const m = this.build(); if (!c) { if (m.parent) m.parent.remove(m); return; } if (!m.parent && Region.dyn) Region.dyn.add(m); };
const _fp = new THREE.Vector3();
Feather.post = function () { const c = this.on, m = this.mesh; if (!c || !m || !m.parent) return; const h = c.lHand || c.wrist; if (!h) return; h.getWorldPosition(_fp); m.position.copy(_fp); m.rotation.set(1.25, c.root.rotation.y || 0, 0.3); };   // lying across the palm, quill end in the hand

/* ---------------------------------------------------------------- Ilsabet's body while she belongs to a scene or a walk (not an NPC) */
const Hold = { c: null, f: null };
const ILS_PROFILE = { name: 'Ilsabet Crane', look: 'duelist' };   // NPC fighters carry no profile; the footstep sound reads profile.look
function mkIls(x, z, face) { const f = new CORE.Fighter({ team: 2, name: 'Ilsabet Crane', x, z, hp: 100, postureMax: 100, radius: 0.45, facing: face || 0 }); f.px = f.x; f.pz = f.z; f.pvx = f.pvz = 0; if (!f.profile) f.profile = ILS_PROFILE; let c = null; try { c = new Character(f, 'duelist'); } catch (e) { console.warn(e); } return { c, f }; }
// take her body from a running walk, or from the NPC slot `k` (removed from A.npcs, its collider dropped), or make one
function claimIls(keys, x, z, face) { if (Hold.c) { Walk.stop(); return Hold; }
  for (const k of keys) { const n = A.npcs && A.npcs[k]; if (n && n.c) { Hold.c = n.c; Hold.f = n.f; if (!Hold.f.profile) Hold.f.profile = ILS_PROFILE; n.c = null; delete A.npcs[k];
      for (let i = Region.circles.length - 1; i >= 0; i--) if (Region.circles[i].npc === k) Region.circles.splice(i, 1); Region.rehash(); return Hold; } }
  const o = mkIls(x, z, face); Hold.c = o.c; Hold.f = o.f; return Hold; }
function releaseIls(dispose) { if (dispose && Hold.c) { try { Hold.c.dispose(); } catch (e) {} } Hold.c = null; Hold.f = null; }
// she arrived: spawn the NPC for the new flag state and give it her body (no model swap, no pop)
function handToNpc(k) { const c = Hold.c, f = Hold.f; A.spawnNpcsIfChanged(); const n = A.npcs[k];
  if (n && c) { if (n.c && n.c !== c) { try { n.c.dispose(); } catch (e) {} } f.x = f.px = n.def.x; f.z = f.pz = n.def.z; f.vx = f.vz = f.pvx = f.pvz = 0; f.state = 'idle'; n.c = c; n.f = f; Hold.c = null; Hold.f = null; }
  else releaseIls(true); }
const hideBlade = c => { if (c && c.model && c.model.blade) c.model.blade.visible = false; };

/* ---------------------------------------------------------------- the walk (visible, saved at the end) */
const Walk = { on: false, pts: null, i: 1, speed: 1.4, t: 0, endFace: 0, onArrive: null, pause: null, arrived: false, faceT: 0, lookBack: null };
Walk.start = function (pts, speed, endFace, onArrive, lookBack) { this.on = !!Hold.f; this.pts = pts; this.i = 1; this.speed = speed; this.t = 0; this.endFace = endFace; this.onArrive = onArrive; this.arrived = false; this.faceT = 0; this.lookBack = lookBack || null; this.lbT = -1; };
Walk.stop = function () { this.on = false; this.pts = null; this.onArrive = null; };
Walk.update = function (dt, now) { const f = Hold.f, c = Hold.c; if (!this.on || !f) return;
  const playing = Game.state === 'playing' && !Intro.active, w = Game.world, p = w && w.player;
  if (playing) { this.t += dt;
    if (!this.arrived) { const tgt = this.pts[this.i], dx = tgt[0] - f.x, dz = tgt[1] - f.z, d = Math.hypot(dx, dz), last = this.i === this.pts.length - 1;
      // a short look back over her shoulder at Wren on the way (the free walk, waypoint 2)
      if (this.lookBack && this.lbT < 0 && this.i === this.lookBack.at && d < 0.6) this.lbT = 0;
      let k = clamp(this.t / 0.5, 0, 1); if (last) k *= clamp(d / 0.9, 0.25, 1);
      if (this.lbT >= 0 && this.lbT < this.lookBack.dur) { this.lbT += dt; k *= 0.25; if (c && c.impulse && this.lbT < dt * 1.5) c.impulse({ twist: -2.6, headX: -0.6 }); }
      const want = Math.atan2(dx, dz); f.facing += clamp(angNorm(want - f.facing), -dt * 5, dt * 5); f.pfacing = f.facing;
      const turnK = clamp(1 - Math.abs(angNorm(want - f.facing)) / 1.6, 0.2, 1), sp = this.speed * k * turnK;
      f.pvx = f.vx || 0; f.pvz = f.vz || 0; f.vx = Math.sin(f.facing) * sp; f.vz = Math.cos(f.facing) * sp; f.state = 'move';
      f.px = f.x; f.pz = f.z; const step = Math.min(sp * dt, d); f.x += Math.sin(f.facing) * step; f.z += Math.cos(f.facing) * step;
      if (d < (last ? 0.06 : 0.35)) { if (last) { this.arrived = true; f.x = tgt[0]; f.z = tgt[1]; } else this.i++; } }
    else { f.vx = f.vz = f.pvx = f.pvz = 0; f.state = 'idle'; f.px = f.x; f.pz = f.z; f.facing += clamp(angNorm(this.endFace - f.facing), -dt * 3, dt * 3); f.pfacing = f.facing; this.faceT += dt;
      if (this.faceT > 0.6 || Math.abs(angNorm(this.endFace - f.facing)) < 0.05) { const cb = this.onArrive; this.on = false; this.onArrive = null; if (cb) cb(); return; } } }
  else { f.vx = f.vz = f.pvx = f.pvz = 0; if (f.state !== 'idle') f.state = 'idle'; f.px = f.x; f.pz = f.z; }
  if (c) { const far = p ? dist(f.x, f.z, p.x, p.z) > 45 : false; c.culled = far; c.root.visible = !far; if (c.feetAO) c.feetAO.forEach(o => o.visible = !far); hideBlade(c); if (!far) c.update(dt, 1, now); } };

/* =====================================================================
   SCENE RUNNER (from BD.Cut, WB 148-203: same hold, letterbox, subtitles, skip, camera blend)
   def: { id, dur, lines: [[t0, t1, who, text]], shots: [[t0, t1, from, to, lookFrom, lookTo, fov, track?]] (world, y above the floor),
          actors: { wren: A, ils: A }, events: [[t, fn, essential]], onEnd(skipped) }
   actor A: { c, f, path: [[t0, t1, pts]], look(t) -> {x, z} | angle | null, track: [[t, pose|null]], stance, fx(T, t), endFace }
   ===================================================================== */
const Scene = A.Scenes = { active: false, def: null, t: 0, pending: null, pendT: 0, outBlend: false, skipped: false, plays: {}, ended: {}, lastId: null, hold: false,
  enabled: !HEADLESS,   // headless (jsdom) tests run each scene as if skipped unless a test turns this on
  last: { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 40 }, SCENES: {} };
const _pos = { x: 0, z: 0 };
Scene.queue = function (id) { this.pending = id; this.pendT = 0; };
Scene.play = function (id) { const mk = this.SCENES[id], w = Game.world; if (!mk || !w || this.active) return false; const def = mk(); if (!def) return false;
  const p = w.player; this.def = def; this.t = 0; this.skipped = false; this.active = true; this.lastId = id; this.plays[id] = (this.plays[id] || 0) + 1; def.evDone = def.events.map(() => false);
  p.vx = p.vz = p.pvx = p.pvz = 0; p.atk = null; p.guard = false; if (p.state !== 'idle') p.setState('idle'); p.lockId = null;
  for (const k in def.actors) { const a = def.actors[k]; a.entry = a.c ? Object.assign({}, a.c.pose) : null; a.lx = a.f.x; a.lz = a.f.z; }
  this.place(0, 0);
  if (BD.Cut) BD.Cut.outBlend = false; Intro.active = true; Intro.t = 0; Intro.out = 0; Intro.boss = null; Intro.card = null; Intro.skipped = false; Letterbox.set(true, 0); NameCard.hide();
  showSub(-1); skipHint(true); Input.clear(); A.drink = null;
  if (!this.enabled) { this.finish(true); return true; }
  this.camera(); return true; };
// place every actor for scene time t (presentation placements: the sim is held)
Scene.place = function (t, dt) { const def = this.def;
  for (const k in def.actors) { const a = def.actors[k], f = a.f; let moving = false, x = f.x, z = f.z;
    for (const m of a.path || []) { if (t < m[0]) { if (m === a.path[0]) { along(m[2], 0, _pos); x = _pos.x; z = _pos.z; } break; }
      const L = m.L || (m.L = pathLen(m[2])), u = (t - m[0]) / Math.max(1e-4, m[1] - m[0]); along(m[2], trap(u, Math.min(0.3, 0.8 / Math.max(0.5, m[1] - m[0]))) * L, _pos); x = _pos.x; z = _pos.z; if (u > 0 && u < 1) moving = true; }
    const vx = dt > 0 ? (x - a.lx) / dt : 0, vz = dt > 0 ? (z - a.lz) / dt : 0, sp = Math.hypot(vx, vz); a.lx = x; a.lz = z;
    f.x = f.px = x; f.z = f.pz = z; f.pvx = f.vx || 0; f.pvz = f.vz || 0; f.vx = moving ? vx : 0; f.vz = moving ? vz : 0;
    // facing: along the motion while walking, else toward the actor's look target
    let want = null; if (moving && sp > 0.25) want = Math.atan2(vx, vz); else if (a.look) { const L = a.look(t); if (typeof L === 'number') want = L; else if (L) want = Math.atan2(L.x - x, L.z - z); }
    if (want !== null) { if (!dt) f.facing = want; else f.facing += clamp(angNorm(want - f.facing), -dt * (moving ? 7 : 4.5), dt * (moving ? 7 : 4.5)); f.pfacing = f.facing; if (f.isPlayer) f.aiFace = f.facing; }
    const st = moving && sp > 0.15 ? 'move' : 'idle'; if (f.isPlayer) { if (f.state !== st) f.setState(st); } else f.state = st; } };
Scene.update = function (dt) { if (!this.active) return; if (Game.state !== 'playing' || this.hold || BD.hold) return; if (Input.pressed.KeyE || Input.pressed.Escape) { this.finish(true); return; }   // pad Y arrives as a pressed KeyE
  const w = Game.world; if (!w || w.player.dead) { this.finish(true); return; }
  this.t += dt; const t = this.t, def = this.def; Intro.t = t;
  this.place(t, dt);
  for (let i = 0; i < def.events.length; i++) if (!def.evDone[i] && t >= def.events[i][0]) { def.evDone[i] = true; try { def.events[i][1](false); } catch (e) { console.error(e); } }
  let li = -1; for (let i = 0; i < def.lines.length; i++) if (t >= def.lines[i][0] && t < def.lines[i][1]) { li = i; break; } showSub(li, li >= 0 ? def.lines[li][2] : '', li >= 0 ? def.lines[li][3] : '');
  if (t >= def.dur) this.finish(false); };
Scene.finish = function (skipped) { if (!this.active) return; const def = this.def, w = Game.world; this.active = false; this.skipped = !!skipped; showSub(-1); skipHint(false);
  // a skip still does everything the scene does to the world (door, flags, items), in order; sounds are left out
  for (let i = 0; i < def.events.length; i++) if (!def.evDone[i]) { def.evDone[i] = true; if (def.events[i][2]) { try { def.events[i][1](true); } catch (e) { console.error(e); } } }
  this.t = Math.max(this.t, def.dur); this.place(def.dur + 10, 0);
  for (const k in def.actors) { const a = def.actors[k], f = a.f; f.vx = f.vz = f.pvx = f.pvz = 0; if (a.endFace !== undefined) { const e = typeof a.endFace === 'function' ? a.endFace() : a.endFace; if (e !== null) f.facing = f.pfacing = e; } if (f.isPlayer) { if (f.state !== 'idle') f.setState('idle'); } else f.state = 'idle'; }
  if (w) { const p = w.player, I = p.intent; I.mx = I.mz = 0; I.light = I.heavy = I.charged = I.dodge = I.jump = I.deathblow = I.parry = I.guard = I.sprint = false; p.buffer = null; Cam.yaw = p.facing; }
  Intro.active = false; Intro.out = Intro.outDur; this.outBlend = true; Letterbox.set(false); Input.clear(); Game.eT = null;
  this.ended[def.id] = (this.ended[def.id] || 0) + 1;
  try { def.onEnd(!!skipped); } catch (e) { console.error(e); }
  Save.write(); };
Scene.cancel = function () { if (!this.active) return; this.active = false; showSub(-1); skipHint(false); Intro.active = false; Intro.out = 0; this.outBlend = false; Letterbox.set(false); };
const _ap = new THREE.Vector3();
Scene.camera = function () { const def = this.def, t = this.t; let s = def.shots[def.shots.length - 1]; for (const q of def.shots) if (t < q[1]) { s = q; break; }
  const u = eio(clamp((t - s[0]) / (s[1] - s[0]), 0, 1)), a = s[2], b = s[3], la = s[4], lb = s[5];
  this.last.pos.set(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u); this.last.look.set(la[0] + (lb[0] - la[0]) * u, la[1] + (lb[1] - la[1]) * u, la[2] + (lb[2] - la[2]) * u); this.last.fov = s[6];
  if (s[7]) { const ac = def.actors[s[7].who]; if (ac) { const k = s[7].w; this.last.look.x += (ac.f.x - this.last.look.x) * k; this.last.look.z += (ac.f.z - this.last.look.z) * k; } }
  void _ap; };
Scene.pose = function (c, T) { const def = this.def; if (!def) return false; let a = null; for (const k in def.actors) if (def.actors[k].c === c) { a = def.actors[k]; break; } if (!a) return false;
  const t = this.t, st = a.stance || (G.STANCES && G.STANCES[c.lookKey]) || POSES.ready;
  sample(T, a.track || [[0, null]], t, st, st);
  if (a.entry && t < 0.4) { const k = sm01(t / 0.4); for (const key of KEYS) T[key] = a.entry[key] + (T[key] - a.entry[key]) * k; }   // no pop from the gameplay pose
  if (a.fx) a.fx(T, t); return true; };

// --- hooks: while a scene owns G.Intro, its timer / camera / skip are ours (the frame loop holds the sim exactly as for Odran's cutscene)
{ const iu = Intro.update; Intro.update = function (dt) { if (Scene.active) { Scene.update(dt); return; } const r = iu.call(this, dt); if (Scene.outBlend && this.out <= 0) Scene.outBlend = false; return r; }; }
{ const ic = Intro.camera; Intro.camera = function (alpha) { if (Scene.active || (Scene.outBlend && this.out > 0)) { if (Scene.active) Scene.camera(); this.pos.copy(Scene.last.pos); this.look.copy(Scene.last.look); this.fov = Scene.last.fov; return true; } return ic.call(this, alpha); }; }
{ const isk = Intro.skip; Intro.skip = function () { if (Scene.active) return; return isk.call(this); }; }   // only Esc / E skip a scene
{ const ie = Intro.end; Intro.end = function () { if (Scene.active) { Scene.finish(true); return; } return ie.call(this); }; }
{ const ist = Intro.start; Intro.start = function () { Scene.outBlend = false; if (Scene.active) Scene.finish(true); return ist.apply(this, arguments); }; }
{ const ai = Cinema.anyInput; Cinema.anyInput = function () { if (Scene.active) return; return ai.call(this); }; }
{ const ok = Game.onKey; Game.onKey = function (code, repeat) { if (Scene.active && A.active) { if (!repeat && (code === 'Escape' || code === 'KeyE')) Scene.finish(true); return; } return ok.call(this, code, repeat); }; }
{ const ct = Character.prototype.computeTarget; Character.prototype.computeTarget = function (alpha, dt) { if (A.active && Scene.active && Scene.pose(this, this.target)) return 0; return ct.call(this, alpha, dt); }; }

/* =====================================================================
   THE CAGE DOOR
   ===================================================================== */
const Door = { cols: [] };
Door.set = function (k) { const cg = Region.cage; if (!cg || !cg.door) return; cg.door.rotation.y = DOOR_OPEN * clamp(k, 0, 1); };
// an open door is solid where it stands (two small colliders off the cage circle); closed, the cage circle covers it
Door.solid = function () { const cg = Region.cage; if (!cg || !cg.door) return; if (Region.circles.some(c => c.cageDoor)) return; const piv = cg.door.position;
  const r = 0.75, n = 12, ring = i => [cg.x + Math.sin(i / n * 6.28) * r, cg.z + Math.cos(i / n * 6.28) * r], th = DOOR_OPEN;
  for (const i of [8.6, 9.8]) { const q = ring(i), rx = q[0] - piv.x, rz = q[1] - piv.z, X = rx * Math.cos(th) + rz * Math.sin(th), Z = -rx * Math.sin(th) + rz * Math.cos(th);
    Region.circles.push({ x: piv.x + X, z: piv.z + Z, r: 0.28, h: 2.2, cam: false, sight: false, on: true, deco: false, cageDoor: true }); }
  Region.rehash(); };
Door.sync = function () { const d = S(); if (!d) return; if (d.flags.crane_freed) { this.set(1); this.solid(); } else this.set(0); };

/* =====================================================================
   SCENE 1 — "THE CAGE" (freed), ~19.6 s. Muster Field cage (26, 22), door on the west side, hinge north-west.
   ===================================================================== */
const FREE = {
  wrenA: [23.9, 22.3], wrenB: [23.3, 22.8], ilsA: [26.0, 22.0], ilsB: [24.75, 21.85],
  lines: [
    [1.0, 4.2, 'Ilsabet', 'Easy. That lock\u2019s older than anyone in Veynhold but the King.'],
    [4.4, 9.0, 'Ilsabet', 'Ahh, my legs. They say you never swore to anyone. Odd thing, for the King\u2019s own shadow.'],
    [9.2, 10.8, 'Wren', 'Where will you go?'],
    [11.1, 15.5, 'Ilsabet', 'I\u2019ll wait in the shadow under the Headsman\u2019s Stair. When the bell stops, I\u2019ll come up.'],
    [15.8, 19.3, 'Ilsabet', 'Then Hollowwood. Take this. My Cranes will know it.'],
  ],
  dur: 19.6,
};
Scene.SCENES.ilsabet_free = function () { const w = Game.world; if (!w) return null; const p = w.player, F = FREE;
  const ils = claimIls(['ilsabet'], CAGE.x, CAGE.z, -Math.PI / 2); if (!ils.f) return null; const ic = ils.c, wc = Game.chars.get(p.id);
  ils.f.x = ils.f.px = F.ilsA[0]; ils.f.z = ils.f.pz = F.ilsA[1]; ils.f.facing = ils.f.pfacing = -Math.PI / 2; p.x = p.px = F.wrenA[0]; p.z = p.pz = F.wrenA[1]; p.facing = p.pfacing = Math.PI / 2 - 0.25;
  const atW = t => ({ x: p.x, z: p.z }), atI = () => ({ x: ils.f.x, z: ils.f.z }), stair = { x: 4.0, z: 29.0 };
  const def = { id: 'ilsabet_free', dur: F.dur, lines: F.lines,
    shots: [
      [0.0, 4.4, [22.4, 1.9, 20.6], [22.55, 1.86, 20.8], [25.2, 1.3, 22.1], [25.0, 1.35, 22.05], 42],              // 3/4 from the south-west: Wren at the lock, the door swings back, she steps out
      [4.4, 9.2, [23.2, 1.55, 21.05], [23.35, 1.55, 21.2], [24.75, 1.55, 21.85], [24.75, 1.55, 21.85], 36],      // Ilsabet close as she straightens up
      [9.2, 11.0, [24.95, 1.66, 21.2], [24.88, 1.66, 21.3], [23.3, 1.48, 22.8], [23.3, 1.48, 22.8], 38],          // Wren, over Ilsabet's shoulder
      [11.0, 15.7, [21.9, 1.75, 19.55], [22.1, 1.75, 19.8], [24.0, 1.5, 22.35], [23.6, 1.6, 22.5], 44],           // profile two-shot from the south-west; she turns her head toward the Stair
      [15.7, 19.6, [24.75, 1.4, 19.95], [24.65, 1.36, 20.2], [24.0, 1.2, 22.4], [24.0, 1.22, 22.4], 40],         // from the south: the feather between their hands
    ],
    actors: {
      wren: { c: wc, f: p, stance: POSES.ready, path: [[2.4, 3.6, [F.wrenA, F.wrenB]]],
        look: t => t < 2.4 ? { x: 25.25, z: 22.0 } : atI(), endFace: () => Math.atan2(FREE_PATH[2][0] - p.x, FREE_PATH[2][1] - p.z),   // she watches Ilsabet go; the gameplay camera behind her stays clear of the cage
        track: [[0, null], [0.3, 'execPull'], [1.2, 'execPull'], [1.9, null]],
        fx: (T, t) => { const k = bump(t, 17.6, 19.2, 0.45); T.lSx -= 0.3 * k; T.lE -= 0.2 * k; T.lean += 0.05 * k; T.headX += 0.15 * bump(t, 16.5, 18.6, 0.4); T.headX -= 0.04; } },
      ils: { c: ic, f: ils.f, stance: PZ.rest, path: [[2.6, 4.0, [F.ilsA, [25.3, 21.95], F.ilsB]]],
        look: t => t < 2.6 ? -Math.PI / 2 : (t > 11.1 && t < 13.2) ? stair : atW(), endFace: null,
        track: [[0, null], [2.6, null], [2.9, 'riseHalf'], [3.6, 'riseHalf'], [4.3, null]],
        fx: (T, t) => { const s = bump(t, 4.3, 5.9, 0.5); T.lSx -= 1.35 * s; T.rSx -= 1.35 * s; T.lE -= 0.5 * s; T.rE -= 0.5 * s; T.lean -= 0.12 * s; T.headX -= 0.25 * s;   // the stretch
          const g = bump(t, 11.1, 13.4, 0.5); T.twist += 0.45 * g; T.headX -= 0.08 * g;                                                                            // a nod toward the Stair
          const h = bump(t, 16.0, 18.6, 0.45); T.lSx -= 1.0 * h; T.lE -= 0.4 * h; T.lean += 0.05 * h; T.headX += 0.12 * h; } },                                   // the feather held out
    },
    events: [
      [0.4, () => A.sfx('key'), false],
      [1.6, sk => { if (sk) { Door.set(1); return; } Door.anim = { t: 0 }; try { audio.nz(0.45, 'bandpass', 1800, 4, 0.06, 0.38); audio.nz(0.25, 'lowpass', 500, 1, 0.08, 0.2, 0.3); } catch (e) {} }, true],
      [16.2, sk => { if (!sk) Feather.attach(ic); }, false],
      [18.3, sk => { if (!sk) Feather.attach(wc); }, false],
    ],
    onEnd(skipped) { Feather.attach(null); Door.anim = null; Door.set(1); Door.solid();
      act([['take', 'cagekey', 1], ['give', 'feather', 1], ['quest', 'crane', 2], ['flag', 'crane_freed']]);
      A.spawnNpcsIfChanged();   // the cage slot is gone; her body stays ours for the walk
      if (A.UI && A.UI.hint) A.UI.hint('Ilsabet heads for the foot of the Headsman\u2019s Stair.', 5);
      if (Hold.c) hideBlade(Hold.c);
      Walk.start(FREE_PATH.map(q => q.slice()), 1.45, WAIT.face, () => { const d = S(); d.flags.crane_waiting = true; handToNpc('ilsabet_wait'); Save.write(); }, { at: 3, dur: 0.7 });
      void skipped; } };
  return def; };
const Door0 = Door; Door0.anim = null;
Door.post = function (dt) { if (!this.anim) return; this.anim.t += dt; const u = clamp(this.anim.t / 0.8, 0, 1); this.set(1 - Math.pow(1 - u, 3)); if (u >= 1) this.anim = null; };

/* =====================================================================
   SCENE 2 — "THE BLOCK" (after Odran's last words and the key), ~19.6 s plus the climb.
   Frame: Wren where she stands; she turns to the Stair head. Ilsabet comes up the Stair from the landing.
   ===================================================================== */
const BLOCKL = {
  l1: [1.4, 4.8, 'Ilsabet', 'The bell stopped. I counted to a hundred and came up anyway.'],
  rest: [   // shifted by the extra walk time
    [4.9, 8.2, 'Ilsabet', 'Forty years on this hill. I thought there\u2019d be more of him.'],
    [8.5, 11.3, 'Wren', 'He said the King knew I\u2019d live. Then why hang me?'],
    [11.6, 16.4, 'Ilsabet', 'Not to kill you. That\u2019s the worse answer. Ask the Unsworn in Hollowwood. They keep what the Abbey burns.'],
    [16.7, 19.3, 'Ilsabet', 'You have his key. I\u2019ll be at the gate.'],
  ],
  dur: 19.6,
};
Scene.SCENES.ilsabet_block = function () { const w = Game.world; if (!w) return null; const p = w.player, wc = Game.chars.get(p.id);
  const ils = claimIls(['ilsabet_wait'], STAIR_LANDING.x, STAIR_LANDING.z, 0); if (!ils.f) return null; const ic = ils.c; if (ic) hideBlade(ic);
  const d0 = S(), kd = (d0.drops || {}).headkey; let C = BD.corpse ? { x: BD.corpse.x, z: BD.corpse.z } : kd ? { x: kd.x, z: kd.z } : { x: 0, z: 52.5 };
  const W0 = [p.x, p.z]; let ux = STAIR_HEAD.x - p.x, uz = STAIR_HEAD.z - p.z; const gap = Math.hypot(ux, uz) || 1; ux /= gap; uz /= gap; const rx = -uz, rz = ux;   // +z toward the Stair head, +x screen-right
  const obs = [{ x: BLOCK.x, z: BLOCK.z, r: BLOCK.r + 0.55 }, { x: C.x, z: C.z, r: 0.95 }];
  // Wren takes a few steps to meet her when the Stair head is far (keeps the climb short), never into the block or the body
  let step = clamp(gap - 6.5, 0, 2.5); let W1 = [W0[0] + ux * step, W0[1] + uz * step]; if (obs.some(o => dist(W1[0], W1[1], o.x, o.z) < o.r) || !Region.zoneAt(W1[0], W1[1])) { step = 0; W1 = W0.slice(); }
  // Ilsabet's end mark: 1.9 m in front of Wren, a little to her right; clear of the block, the body and walls
  let E = null; for (const sx of [0.35, -0.35, 1.2, -1.2, 0.35]) { const e = [W1[0] + ux * 1.9 + rx * sx, W1[1] + uz * 1.9 + rz * sx]; if (!obs.some(o => dist(e[0], e[1], o.x, o.z) < o.r) && Region.zoneAt(e[0], e[1])) { E = e; break; } }
  if (!E) E = [W1[0] + ux * 1.9, W1[1] + uz * 1.9];
  if (dist(C.x, C.z, E[0], E[1]) > 4.5) C = { x: E[0] + (W1[0] - E[0]) * 0.1 + rx * 1.1, z: E[1] + (W1[1] - E[1]) * 0.1 + rz * 1.1 };   // body gone or far: she looks at the floor where it lay
  const climb = route([[STAIR_LANDING.x, STAIR_LANDING.z], [STAIR_HEAD.x, STAIR_HEAD.z + 0.4], E], obs), L = pathLen(climb);
  const Tw = clamp(L / 1.9, 4.2, 8.5), dT = Tw - 4.2, T0 = 0.4, T1 = T0 + Tw;
  ils.f.x = ils.f.px = climb[0][0]; ils.f.z = ils.f.pz = climb[0][1]; ils.f.facing = ils.f.pfacing = 0;
  const sh = (a, b) => [a + dT, b + dT], lines = [BLOCKL.l1].concat(BLOCKL.rest.map(l => [l[0] + dT, l[1] + dT, l[2], l[3]])), dur = BLOCKL.dur + dT;
  // camera shots (world): behind Wren onto the Stair head; low two-shot on the body; Wren close; over Wren's shoulder; wide, panning to the gate
  const Y = (x, y, z) => [x, y, z];
  let s1 = [0, T1 + 0.2, Y(W0[0] - rx * 1.6 - ux * 2.4, 1.6, W0[1] - rz * 1.6 - uz * 2.4), Y(W0[0] - rx * 1.4 - ux * 2.1, 1.55, W0[1] - rz * 1.4 - uz * 2.1), Y(STAIR_HEAD.x, 1.3, STAIR_HEAD.z), Y(E[0], 1.4, E[1]), 44, { who: 'ils', w: 0.85 }];
  if (!shotClear(s1)) { const a = Y(W0[0], 0, W0[1]), b = Y(E[0], 0, E[1]); s1[2] = mirrorAcross(s1[2], a, b); s1[3] = mirrorAcross(s1[3], a, b); }
  let dx = E[0] - W1[0], dz = E[1] - W1[1]; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl; let qx = -dz, qz = dx;
  const mwx = (W1[0] + E[0]) / 2, mwz = (W1[1] + E[1]) / 2, cs = (C.x - mwx) * qx + (C.z - mwz) * qz >= 0 ? 1 : -1;   // the side the body lies on
  const lx = mwx * 0.6 + C.x * 0.4, lz = mwz * 0.6 + C.z * 0.4;
  let s2 = [s1[1], 8.4 + dT, Y(mwx + qx * cs * 3.6 + dx * 0.5, 1.4, mwz + qz * cs * 3.6 + dz * 0.5), Y(mwx + qx * cs * 3.3 + dx * 0.5, 1.35, mwz + qz * cs * 3.3 + dz * 0.5), Y(lx, 1.0, lz), Y(lx, 1.15, lz), 40];
  if (!shotClear(s2)) { const a = Y(W1[0], 0, W1[1]), b = Y(E[0], 0, E[1]); s2[2] = mirrorAcross(s2[2], a, b); s2[3] = mirrorAcross(s2[3], a, b); }
  const mk34 = s => [[8.4 + dT, 11.4 + dT, Y(W1[0] + dx * 2.5 + qx * 0.8 * s, 1.64, W1[1] + dz * 2.5 + qz * 0.8 * s), Y(W1[0] + dx * 2.4 + qx * 0.85 * s, 1.64, W1[1] + dz * 2.4 + qz * 0.85 * s), Y(W1[0], 1.45, W1[1]), Y(W1[0], 1.45, W1[1]), 38],
    [11.4 + dT, 16.6 + dT, Y(W1[0] - dx * 0.8 + qx * 0.55 * s, 1.62, W1[1] - dz * 0.8 + qz * 0.55 * s), Y(W1[0] - dx * 0.7 + qx * 0.6 * s, 1.62, W1[1] - dz * 0.7 + qz * 0.6 * s), Y(E[0], 1.5, E[1]), Y(E[0], 1.5, E[1]), 34]];
  let s34 = mk34(1); if (!shotClear(s34[0]) || !shotClear(s34[1])) { const m = mk34(-1); if (shotClear(m[0]) && shotClear(m[1])) { s34 = m; qx = -qx; qz = -qz; } }
  const cx = (W1[0] + E[0]) / 2, cz = (W1[1] + E[1]) / 2; let gx = GATE_PATH[0][0] - cx, gz = GATE_PATH[0][1] - cz; const gl = Math.hypot(gx, gz) || 1; gx /= gl; gz /= gl;
  let s5 = [16.6 + dT, dur + 1, Y(cx + qx * 4.3 - dx * 0.3, 2.0, cz + qz * 4.3 - dz * 0.3), Y(cx + qx * 4.7 - dx * 0.3, 2.1, cz + qz * 4.7 - dz * 0.3), Y(cx, 1.3, cz), Y(cx + gx * 1.8, 1.5, cz + gz * 1.8), 44];
  if (!shotClear(s5)) { s5[2] = Y(cx - qx * 4.3 - dx * 0.3, 2.0, cz - qz * 4.3 - dz * 0.3); s5[3] = Y(cx - qx * 4.7 - dx * 0.3, 2.1, cz - qz * 4.7 - dz * 0.3); }
  const atI = () => ({ x: ils.f.x, z: ils.f.z }), atW = () => ({ x: p.x, z: p.z }), gate = { x: GATE_PATH[0][0], z: GATE_PATH[0][1] };
  const lookT = sh(4.6, 8.0), turnT = 17.4 + dT;
  const def = { id: 'ilsabet_block', dur, lines, shots: [s1, s2].concat(s34, [s5]),
    actors: {
      wren: { c: wc, f: p, stance: POSES.ready, path: step > 0 ? [[2.4, 2.4 + Math.max(1.2, step / 1.3), [W0, W1]]] : [], look: () => atI(), endFace: () => Math.atan2(gate.x - W1[0], gate.z - W1[1]),
        track: [[0, null]], fx: (T, t) => { T.headX -= 0.05; T.headX += 0.12 * bump(t, lookT[0], lookT[1], 0.5); } },
      ils: { c: ic, f: ils.f, stance: PZ.rest, path: [[T0, T1, climb]], look: t => (t > lookT[0] && t < lookT[1]) ? C : t > turnT ? gate : atW(), endFace: () => Math.atan2(gate.x - E[0], gate.z - E[1]),
        track: [[0, null], [lookT[0], null], [lookT[0] + 0.5, 'look'], [lookT[1] - 0.4, 'look'], [lookT[1] + 0.2, null]],
        fx: (T, t) => { const k = bump(t, 11.8 + dT, 16.2 + dT, 0.6); T.headX -= 0.06 * k; T.twist -= 0.1 * k; } },
    },
    events: [[0.3, () => { if (BD.sfx) BD.sfx('crow', { vol: 0.5 }); }, false]],
    onEnd() { const d = S(); d.flags.crane_block_seen = true; A.spawnNpcsIfChanged(); if (Hold.c) hideBlade(Hold.c);
      Walk.start(route([[Hold.f ? Hold.f.x : E[0], Hold.f ? Hold.f.z : E[1]]].concat(GATE_PATH.map(q => q.slice())), obs), 1.35, GATE.face, () => { const dd = S(); dd.flags.crane_gate = true; handToNpc('ilsabet_gate'); Save.write(); }); } };
  return def; };

/* =====================================================================
   TRIGGERS, RELOAD REPAIR, PER-FRAME
   ===================================================================== */
const blockReady = d => d.flags.crane_freed && !d.flags.crane_block_seen && d.defeated.odran && d.flags.odran_spoke && (Inv.count('headkey') > 0 || d.collected.key_headkey);
Scene.blockT = 0;
Scene.tick = function (dt) { const w = Game.world, d = S(); if (!w || !d || !Region.data) return; const p = w.player;
  const calm = Game.state === 'playing' && !A.dlg && !A.boss && !A.dying && !A.busy && !p.dead && !Intro.active && !(P1.Finale && P1.Finale.active) && !(BD.Cut && BD.Cut.active);
  if (this.pending) { if (calm) { this.pendT += dt; if (this.pendT > 0.05) { const id = this.pending; this.pending = null; this.play(id); } } return; }
  if (Region.data.id === 'execution' && blockReady(d)) { const zn = Region.zoneAt(p.x, p.z); if (calm && zn && zn.id === 'block') { this.blockT += dt; if (this.blockT > 0.8) { this.blockT = 0; this.play('ilsabet_block'); } } else this.blockT = 0; } };
// reload: a walk cut short by a save / respawn / rest is finished; the NPC slots follow the flags
Scene.repair = function () { const d = S(); if (!d) return; const f = d.flags;
  if (f.crane_freed && !f.crane_waiting) f.crane_waiting = true;
  if (f.crane_block_seen && !f.crane_gate) f.crane_gate = true; };
{ const bw = A.buildWorld; A.buildWorld = function () { Scene.cancel(); Scene.pending = null; Scene.blockT = 0; Walk.stop(); releaseIls(true); Feather.attach(null); Door.anim = null; Scene.repair();
    const r = bw.apply(this, arguments); Door.sync(); return r; }; }
{ const cx = A.clearNpcExits; A.clearNpcExits = function () { const r = cx.apply(this, arguments); Walk.stop(); releaseIls(true); Feather.attach(null); if (Scene.active) Scene.cancel(); return r; }; }
{ const ap = A.post; A.post = function (dt, now) { const r = ap.apply(this, arguments); if (!A.active) return r;
    try { Scene.tick(dt); Door.post(dt); Walk.update(dt, now);
      if (Scene.active && Hold.c && !Walk.on) { const c = Hold.c; c.culled = false; c.root.visible = true; if (c.feetAO) c.feetAO.forEach(o => o.visible = true); hideBlade(c); c.update(dt, 1, now); }
      Feather.post(); } catch (e) { console.error(e); }
    return r; }; }
A.SceneWalk = Walk; A.SceneHold = Hold; A.SceneDoor = Door;
Scene.FREE = FREE; Scene.BLOCKL = BLOCKL; Scene.FREE_PATH = FREE_PATH; Scene.GATE_PATH = GATE_PATH; Scene.WAIT = WAIT; Scene.GATE = GATE;
console.log('[Veynhold] chunk G3 (Ilsabet scenes) ready');
})();
