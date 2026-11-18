/* =====================================================================
   VEYNHOLD — chunk DB6: deathblow feel ("I get stuck to the character").
   Presentation + world glue only; src/core.js is untouched (the I1 core still owns the schedule, hit-stop, flags and unlock).
   1. CLIPS  — the 12 keyframe clips of assets_incoming/deathblow_clips (veynhold-deathblow-clip/1, 15-joint pose rig, W0.u2 grip) drive BOTH
               fighters as interpolated keyframed animation at full frame rate: Wren's step-in / plant / drive / twist / pull-out / push-off /
               chiburi, the victim's stagger onto the blade / shudder / slide off / buckle / fall. The core clock is remapped piecewise onto each
               clip's own tick table, so Impact lands on core 0.32 and every bookmark on the core's. Blend-in from the displayed pose over 0.12 s.
               On top: per-joint lag springs (head, torso, off arm), breathing, a Settle tremble on the victim (micro-motion while the slow-mo holds),
               a strain tremble in Wren's sword arm, cloth kicks. Nothing is ever held static or snapped.
   2. ROOT   — no glue. The pair is aligned ONCE in Commit (eased over 0.22 s): the VICTIM is drawn onto the clip's start spacing when he is
               further than it (research: Sekiro's absorb moves the enemy, not the player); then Wren follows the clip's own root track from where
               she stands (lunge, plant, press-in, step back on Extract with a push), the victim takes the core launch topped up to 1.8 m/s, so the
               bodies separate to >= 2.0 m by Unlock. These are sim positions moved by the world layer after each core step (the same place
               world.js already pushes fighters out of walls), so camera, collision and interpolation follow; no per-frame position lock ever.
   3. INPUT  — from Blade-clear (core 1.15) the stick moves Wren (walk, 0.15 s fade of the finisher clip, she turns into it), still invulnerable
               (core deathblowExec) until the core unlock; at the unlock tick her velocity and facing carry into the core so control is continuous.
               Attack / dodge / deflect presses from 1.14 are buffered by the core itself and fire on the unlock tick. Lock-on leaves the corpse at
               Blade-clear. Collapse, letterbox, camera blend and audio never gate input.
   4. AUDIO  — the 6 sampled variants (assets_incoming/deathblow_audio, cues.json) decoded once after the first gesture / at region load,
               fired on the deathblow clock (hit-stop shifted), with the music duck and a 180–240 ms post-impact near-silence; they replace
               the old procedural deathblow / execSting / dbEntry / impale one-shots.
   Public: VEYN_GAME.DB6 (alias VEYN_ADV.DB6): { on, cur, variantFor(), clips, log, Audio }.
   ===================================================================== */
(function () {
'use strict';
const G = window.VEYN_GAME, CORE = window.VEYN_CORE, A = window.VEYN_ADV = window.VEYN_ADV || {};
if (!G || !CORE || !CORE.World) return;
const THREE = window.THREE, { Game, Character, Settings, VISUAL } = G; const { CONFIG, clamp, angNorm } = CORE;
const P1 = G.P1, audio = P1 && P1.audio;
const RAW = /*DB6_CLIPS*/{};
const AUD = /*DB6_AUDIO*/{};
const DT = CONFIG.sim.dt;
const sm = u => { u = u < 0 ? 0 : u > 1 ? 1 : u; return u * u * (3 - 2 * u); };
const smr = u => { u = u < 0 ? 0 : u > 1 ? 1 : u; return u * u * u * (u * (u * 6 - 15) + 10); };   // smootherstep
const eout = u => { u = u < 0 ? 0 : u > 1 ? 1 : u; return 1 - (1 - u) * (1 - u) * (1 - u); };

/* ---------------------------------------------------------------- clip decode (assets_incoming/deathblow_clips/sample_clip.js, inlined) */
function b64(s) { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; }
function decode(d) { const n = d.n, J = d.joints.length, t = new Uint16Array(b64(d.t)), T = new Float32Array(n); for (let i = 0; i < n; i++) T[i] = t[i] / 1000;
  const actors = {};
  for (const k in d.actors) { const a = d.actors[k], raw = new Int16Array(b64(a.q)), hy = new Int16Array(b64(a.hy)), rt = new Int16Array(b64(a.root));
    const q = new Float32Array(n * J * 4), h = new Float32Array(n), r = new Float32Array(n * 3);
    for (let i = 0; i < n * J; i++) { const x = raw[i * 3] / 32767, y = raw[i * 3 + 1] / 32767, z = raw[i * 3 + 2] / 32767; q[i * 4] = x; q[i * 4 + 1] = y; q[i * 4 + 2] = z; q[i * 4 + 3] = Math.sqrt(Math.max(0, 1 - x * x - y * y - z * z)); }
    for (let i = 0; i < n; i++) { h[i] = hy[i] / 10000; r[i * 3] = rt[i * 3] / 1000; r[i * 3 + 1] = rt[i * 3 + 1] / 1000; r[i * 3 + 2] = rt[i * 3 + 2] / 10000; }
    actors[k] = { q, h, r }; }
  const ck = d.clock || {}; const knots = [0, ck.drive, ck.impact, ck.settle, ck.extract, ck.bladeClear, ck.unlock, ck.presEnd];
  return { name: d.variant, n, J, T, actors, knots, dur: d.dur || T[n - 1], vital: d.vital, extractDir: d.extractDir, scale: d.victimScale || 1, joints: d.joints, W0: d.W0 }; }
const SEG = [0, 0, 0];
function seg(T, t) { let lo = 0, hi = T.length - 1; if (t <= T[0]) { SEG[0] = 0; SEG[1] = 0; SEG[2] = 0; return SEG; } if (t >= T[hi]) { SEG[0] = hi; SEG[1] = hi; SEG[2] = 0; return SEG; }
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T[m] <= t) lo = m; else hi = m; } SEG[0] = lo; SEG[1] = hi; SEG[2] = (t - T[lo]) / Math.max(1e-6, T[hi] - T[lo]); return SEG; }
const ROOT = { x: 0, z: 0, yaw: 0, hy: 0 };
function sampleRoot(C, who, t, o) { o = o || ROOT; const Ac = C.actors[who], s = seg(C.T, t), i0 = s[0], i1 = s[1], u = s[2], r = Ac.r;
  o.x = r[i0 * 3] + (r[i1 * 3] - r[i0 * 3]) * u; o.z = r[i0 * 3 + 1] + (r[i1 * 3 + 1] - r[i0 * 3 + 1]) * u;
  let dy = r[i1 * 3 + 2] - r[i0 * 3 + 2]; if (dy > Math.PI) dy -= 2 * Math.PI; if (dy < -Math.PI) dy += 2 * Math.PI; o.yaw = r[i0 * 3 + 2] + dy * u; o.hy = Ac.h[i0] + (Ac.h[i1] - Ac.h[i0]) * u; return o; }
function samplePose(C, who, t, out) { const Ac = C.actors[who], J = C.J, s = seg(C.T, t), i0 = s[0], i1 = s[1], u = s[2], q = Ac.q, a = i0 * J * 4, b = i1 * J * 4;
  for (let j = 0; j < J; j++) { const o = j * 4; let x1 = q[b + o], y1 = q[b + o + 1], z1 = q[b + o + 2], w1 = q[b + o + 3]; const x0 = q[a + o], y0 = q[a + o + 1], z0 = q[a + o + 2], w0 = q[a + o + 3];
    if (x0 * x1 + y0 * y1 + z0 * z1 + w0 * w1 < 0) { x1 = -x1; y1 = -y1; z1 = -z1; w1 = -w1; }
    const x = x0 + (x1 - x0) * u, y = y0 + (y1 - y0) * u, z = z0 + (z1 - z0) * u, w = w0 + (w1 - w0) * u, l = Math.hypot(x, y, z, w) || 1; out[o] = x / l; out[o + 1] = y / l; out[o + 2] = z / l; out[o + 3] = w / l; }
  return hermite(Ac.h, C.T, i0, i1, u); }
// hips height: cubic (Catmull-Rom on the non-uniform key times) so the body's vertical motion has no velocity steps at the keys (linear keys read as hip pops)
function hermite(h, T, i0, i1, u) { if (i0 === i1) return h[i0]; const n = h.length, dt = T[i1] - T[i0] || 1e-6, ip = i0 > 0 ? i0 - 1 : i0, iq = i1 < n - 1 ? i1 + 1 : i1;
  const m0 = (h[i1] - h[ip]) / Math.max(1e-6, T[i1] - T[ip]) * dt, m1 = (h[iq] - h[i0]) / Math.max(1e-6, T[iq] - T[i0]) * dt, u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * h[i0] + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * h[i1] + (u3 - u2) * m1; }
const CLIPS = {}; let clipErr = null;
try { for (const k in RAW) CLIPS[k] = decode(RAW[k]); } catch (e) { clipErr = String(e); console.warn('[Veynhold] DB6 clips unavailable', e); }

/* ---------------------------------------------------------------- variant map (deterministic: core variantId + world facts at Commit) */
const W0U2 = new THREE.Quaternion(); { const c = CLIPS.heart_pierce; if (c && c.W0) W0U2.fromArray(c.W0); else if (window.VEYN_ANIM && window.VEYN_ANIM.W0 && window.VEYN_ANIM.W0.u2) W0U2.fromArray(window.VEYN_ANIM.W0.u2); }
const LAND = { heart_pierce: 1.95, turning_cut: 2.2, crown_splitter: 2.35, shoulder_drive: 1.85, stealth_backstab: 2.3, stealth_throat: 2.3, kingsfall: 2.3, king_phase1: 99 };   // victim contact (clip clock), direction doc §6
// blade target on the victim (Fin's targetPoint): fraction hips->head and lateral offset toward the victim's LEFT (+) in metres (scaled)
const VITAL = { heart: [0.56, 0.08], heartTop: [0.62, 0.06], crown: [1.04, 0], clavL: [0.86, 0.12], back: [0.52, 0.04], throat: [0.9, 0] };
function unseen(v) { const E = A.api && A.api.Ents; const en = E && E.byF && E.byF.get(v.id); return !!(en && en.unseen); }
function variantFor(R, w) { const v = R.v, id = R.variantId || 'heart', look = v.profile && v.profile.look;
  if (A.active && unseen(v)) { const ch = Game.chars.get(v.id), tall = !!(ch && (ch.look.scale || 1) > 1.1);
    let wall = false; const Rg = A.api && A.api.Region; if (Rg && Rg.camClear) { const f0 = R.vf0 !== undefined ? R.vf0 : v.facing; wall = !Rg.camClear(v.x, v.z, v.x + Math.sin(f0) * 1.1, v.z + Math.cos(f0) * 1.1); }
    return tall || wall ? 'stealth_throat' : 'stealth_backstab'; }
  if (id === 'brother' || look === 'brother') return 'turning_cut';
  if (id === 'warden' || look === 'warden') return R.bossFinal ? 'crown_splitter' : 'shoulder_drive';
  if (id === 'king1') return 'king_phase1';
  if (id === 'kingF') return 'kingsfall';
  const ch = Game.chars.get(v.id); if (ch && ch.pose && ch.pose.hipY < -0.3) return 'kingsfall';   // a kneeling victim: the plunge from above (audio stays the normal one)
  return 'heart_pierce'; }

/* ---------------------------------------------------------------- tunables */
const T6 = {
  absorb: 0.26,          // Commit alignment window (core clock; smoothstep, done before Drive 0.28)
  minBack: 1.32,         // final kills: Wren ends at least this far from the victim's Commit spot by Unlock (so the pair is >= 2 m apart)
  blendIn: 0.12,         // displayed pose -> clip
  pushBack: 0.34,        // Wren's total step back from Extract (m, at least; clip root included)
  pushT: 0.26,           // ...eased out over this (core clock) from Extract
  pressIn: 0.03,         // hips push-in through Settle (m)
  launch: 1.9,           // corpse speed reached by Blade-clear (m/s, core launch topped up; final victims only)
  launchRamp: 0.08,      // ramp from Extract (s)
  moveFade: 0.15,        // move-cancel fades the finisher clip over this
  outFade: 0.30,         // after unlock, the attacker clip fades into her stance
  tremble: 2.5,          // victim Settle tremble (deg)
  stepCap: 0.135,        // pair closing per sim tick before Impact (Wren's step + the victim's core glide, m; the remainder carries over): no snap
  stepCap2: 0.145,       // ...after Impact (push-off)
};
const DB6 = G.DB6 = A.DB6 = { on: !!Object.keys(CLIPS).length, cur: null, clips: CLIPS, clipErr, T6, variantFor, log: [], corpses: [], frameId: 0, VITAL, LAND };

/* ---------------------------------------------------------------- session: one per player deathblow */
const _rt = { x: 0, z: 0, yaw: 0, hy: 0 }, _rt2 = { x: 0, z: 0, yaw: 0, hy: 0 };
function knotTimes(R, C) { // core-clock knots (with the accessibility Settle extension folded into the presentation clock)
  const s = {}; for (const [k, v] of R.sched) s[k] = v; const un = s.unlock, ex0 = s.extract, cl0 = s.clear;
  const Acc = G.Access || A.Access, extra = Acc && Acc.settleExtra ? +Acc.settleExtra() || 0 : 0;
  const ex = Math.min(ex0 + extra, un - 0.2), cl = Math.min(cl0 + extra, un - 0.05);
  return [0, s.drive, s.impact, s.settle, ex, cl, un, un + (C.knots[7] - C.knots[6])]; }
function remap(S, t) { const K = S.K, Kc = S.C.knots; if (t <= 0) return 0;
  for (let i = 1; i < K.length; i++) if (t < K[i]) { const u = (t - K[i - 1]) / Math.max(1e-6, K[i] - K[i - 1]); return Kc[i - 1] + (Kc[i] - Kc[i - 1]) * u; }
  return Kc[K.length - 1] + (t - K[K.length - 1]); }   // past presEnd: the clip runs on to its own end in wall time
DB6.begin = function (R, w) {
  const a = R.a, v = R.v, name = variantFor(R, w), C = CLIPS[name]; if (!C) return null;
  const stealth = name.indexOf('stealth') === 0;
  // pair frame: +Z = the victim's facing at the end of the Commit turn (front: toward Wren; stealth: his own facing, he never turns)
  const vf0 = R.vf0 !== undefined ? R.vf0 : v.facing, th = stealth ? vf0 : (R.vf1 !== undefined ? R.vf1 : Math.atan2(a.x - v.x, a.z - v.z));
  const fx = Math.sin(th), fz = Math.cos(th), lx = Math.cos(th), lz = -Math.sin(th);   // +Z and +X (victim's left) of the pair frame in world space
  // where Wren stands in the pair frame now
  const dx = a.x - v.x, dz = a.z - v.z, az0 = dx * fx + dz * fz, ax0 = dx * lx + dz * lz, d0 = Math.hypot(dx, dz);
  const r0 = sampleRoot(C, 'att', 0, {}), rD = sampleRoot(C, 'att', C.knots[1], {}), rX = sampleRoot(C, 'att', C.knots[4], {}), rU = sampleRoot(C, 'att', C.knots[6], {});
  // absorb: the victim slides toward Wren only when she is further than the clip's start spacing (never pushed away); lateral line-up too
  // stealth (he is unaware) and bosses (heavy, the Owl pattern) are not moved: Wren covers the distance with her own lunge instead
  const s0 = Math.abs(r0.z), pinV = stealth || !!(v.profile && v.profile.boss), mv = pinV ? 0 : Math.max(0, Math.abs(az0) - s0), sgn = az0 >= 0 ? 1 : -1;
  const S = { R, w, a, v, C, name, stealth, th, fx, fz, lx, lz, d0, vf0, af1: R.af1, K: knotTimes(R, C), tau: 0, tc: 0, wall: 0, unlocked: false, unT: -1,
    mv, mvDone: 0, ux: dx / (d0 || 1), uz: dz / (d0 || 1), ax: v.x + dx / (d0 || 1) * mv, az: v.z + dz / (d0 || 1) * mv,
    // Wren's pair-frame offset correction at t=0: her real spot minus the clip start (after the absorb), faded out by the Drive
    dz0: (Math.abs(az0) - mv) * sgn - r0.z, r0, rD, rX, rU, lastAX: null, lastAZ: null, back: Math.max(0, T6.pushBack - Math.max(0, (Math.abs(rU.z) - Math.abs(rX.z))), R.final ? T6.minBack - Math.hypot(rU.x, rU.z) : 0),
    vex: 0, final: !!R.final, clearSeen: false, mc: { on: false, vx: 0, vz: 0, k: 0, facing: a.facing }, ev: {}, land: LAND[name] || 2.3, audio: null,
    audioId: name === 'kingsfall' && !(v.profile && v.profile.look === 'king') ? 'heart' : null, yaw0: { a: r0.yaw, v: sampleRoot(C, 'vic', 0, {}).yaw } };
  S.dz0 = clamp(S.dz0, -0.35, 1.6);
  this.cur = S; this.log.push({ name, d0: +d0.toFixed(3), mv: +mv.toFixed(3), tick: w.tick }); if (this.log.length > 32) this.log.shift();
  if (DB6.Audio) DB6.Audio.start(S);
  return S; };

/* clip-space -> world (pair frame anchored on the victim's absorbed Commit position) */
function attTarget(S, tau, out) {
  const C = S.C, r = sampleRoot(C, 'att', tau, _rt), kD = C.knots[1], kX = C.knots[4];
  let z = r.z, x = r.x;
  // start-spacing correction fades out across the step-in (keyed on the clip's own approach curve, so the lunge keeps its shape)
  // (time-based smoothstep to the Drive: it peaks mid-way, where the clip's own lunge has slowed, so the two never add up to a jump)
  z += S.dz0 * (1 - sm(tau / Math.max(0.05, kD)));
  // press-in through Settle (toward the victim), released into the push-off
  const kI = C.knots[2], kS = C.knots[3], kC = C.knots[5], sgn = S.r0.z >= 0 ? 1 : -1;
  const press = T6.pressIn * sm((tau - kI) / Math.max(0.05, kS - kI)) * (1 - sm((tau - kX) / Math.max(0.05, kC - kX)));
  z -= sgn * press;
  // the push-off: extra step back (away from the victim's Commit spot) on top of the clip's own, ease-out from Extract
  if (S.back > 0 && tau > kX) { const k = eout((tau - kX) / T6.pushT), bx = x, bz = z, l = Math.hypot(bx, bz) || 1; x += bx / l * S.back * k; z += bz / l * S.back * k; }
  // anchor = the victim's Commit position after the absorb (fixed: Wren never follows the body after it leaves the blade)
  const ox = S.ax + x * S.lx + z * S.fx, oz = S.az + x * S.lz + z * S.fz; out.x = ox; out.z = oz; out.yaw = r.yaw; return out; }
const _at = { x: 0, z: 0, yaw: 0 };
const Rg = () => (A.active && A.api && A.api.Region) || null;

/* ---------------------------------------------------------------- per sim tick, after the core step (World.prototype.step) */
DB6.post = function (w, dt) {
  if (!this.on || w !== Game.world) return; const R = w.deathblow; let S = this.cur;
  if (R && R.a && R.a.isPlayer) { if (!S || S.R !== R) { if (S && S.unlocked) this.corpseFrom(S); S = this.begin(R, w); if (!S) return; } this.tick(S, R, w, dt); return; }
  if (S && S.w === w && !S.unlocked) this.unlockTick(S, w);
  if (S && S.unlocked) this.after(S, w, dt); };
DB6.tick = function (S, R, w, dt) { const a = S.a, v = S.v, t = R.t; S.tc = t;
  // 1. Commit absorb: the victim slides onto the clip's start spacing (ease 0.22 s, deathblow clock — it holds through the hit-stop)
  if (S.mv > 0) { const want = S.mv * sm(t / T6.absorb), d = want - S.mvDone; if (Math.abs(d) > 1e-7) { v.x += S.ux * d; v.z += S.uz * d; S.mvDone = want; } }
  // the anchor (S.ax/az) is where the absorb puts him; it stays there (the core moves him on from Extract; Wren does not follow the body)
  // 2. Wren's own root motion (clip root in the pair frame), applied as a delta so the core glide / walls compose with it
  const tau = remap(S, t); attTarget(S, tau, _at);
  if (S.lastAX === null) { S.offX = a.x - _at.x; S.offZ = a.z - _at.z; S.lastAX = _at.x; S.lastAZ = _at.z; }   // exact at t=0: no jump on the first tick
  else if (!S.mc.on) { // the t=0 residual (lateral, rounding) bleeds off over the step-in
    const k = 1 - sm(t / T6.absorb), tx = _at.x + S.offX * k, tz = _at.z + S.offZ * k, px = S.lastAX + S.offX * (S.lastK === undefined ? 1 : S.lastK), pz = S.lastAZ + S.offZ * (S.lastK === undefined ? 1 : S.lastK);
    // per-tick cap with carry (a far start or a pinned boss victim makes the step-in long): the remainder is paid out on the next ticks
    let sx = tx - px + (S.dbx || 0), sz = tz - pz + (S.dbz || 0); const sl = Math.hypot(sx, sz), vst = S.lvx === undefined ? 0 : Math.hypot(v.x - S.lvx, v.z - S.lvz),   // the core's own Commit glide on the victim counts too
      cap = t < S.K[2] ? Math.max(0.04, T6.stepCap - vst) : T6.stepCap2;
    if (sl > cap) { const f = cap / sl; S.dbx = sx * (1 - f); S.dbz = sz * (1 - f); sx *= f; sz *= f; } else { S.dbx = 0; S.dbz = 0; }
    a.x += sx; a.z += sz; S.lastAX = _at.x; S.lastAZ = _at.z; S.lastK = k; }
  // 3. stealth: the victim never turns to face her (the core blends both facings; hold his own)
  if (S.stealth) v.facing = S.vf0;
  // 4. Extract -> launch: top the core's launch up to T6.launch (final victims), ramped so it is continuous with the core's own ramp
  const ex = S.K[4], cl = S.K[5];
  if (S.final && t >= R.tEx) { const L = R.launch, coreSp = t < R.tCl ? L.speed * sm((t - R.tEx) / (R.tCl - R.tEx)) : L.speed, want = T6.launch * sm((t - R.tEx) / T6.launchRamp);
    if (S.gx === undefined) { let gx = v.x - a.x, gz = v.z - a.z; const gl = Math.hypot(gx, gz) || 1; gx = gx / gl + 0.5 * L.x; gz = gz / gl + 0.5 * L.z; const g2 = Math.hypot(gx, gz) || 1; S.gx = gx / g2; S.gz = gz / g2; }   // away from Wren (pass-through cuts end behind him), the core's side kept
    // extra = wanted velocity along the away dir minus what the core already gives (its own launch dir)
    const ex = S.gx * want - L.x * coreSp, ez = S.gz * want - L.z * coreSp; S.vex = Math.hypot(ex, ez); S.ldx = S.vex > 1e-6 ? ex / S.vex : 0; S.ldz = S.vex > 1e-6 ? ez / S.vex : 0;
    if (dt > 0 && t > S.lastT) { v.x += ex * dt; v.z += ez * dt; } }
  // 5. Blade-clear: lock-on leaves the body; move-cancel opens
  if (t >= R.tCl - 1e-9) { if (!S.clearSeen) { S.clearSeen = true; this.retarget(a, v, w); }
    this.moveCancel(S, a, w, dt); }
  S.lastT = t; S.lvx = v.x; S.lvz = v.z; };
DB6.retarget = function (a, v, w) { if (!a.lockId || a.lockId !== v.id) return; let best = null, bd = 12;
  for (const e of w.fighters) { if (e === v || e === a || e.dead || e.team === a.team || e.state === 'deathblowed') continue; const d = Math.hypot(e.x - a.x, e.z - a.z); if (d < bd) { bd = d; best = e; } }
  a.lockId = best ? best.id : 0; };
DB6.moveCancel = function (S, a, w, dt) { const I = a.intent || {}, m = Math.min(1, Math.hypot(I.mx || 0, I.mz || 0)), M = S.mc, P = CONFIG.player;
  if (m > 0.2) M.on = true; if (!M.on) return;
  const hm = Math.hypot(I.mx || 0, I.mz || 0) || 1, sp = (I.sprint ? P.sprint : P.walk) * m, tvx = m > 0.05 ? I.mx / hm * sp : 0, tvz = m > 0.05 ? I.mz / hm * sp : 0;
  const dvx = tvx - M.vx, dvz = tvz - M.vz, dl = Math.hypot(dvx, dvz); if (dl > 0) { const k = Math.min(1, (P.accel || 30) * dt / dl); M.vx += dvx * k; M.vz += dvz * k; }
  a.x += M.vx * dt; a.z += M.vz * dt; const r = Rg(); if (r && r.collide) r.collide(a, false);
  if (m > 0.05) { const want = Math.atan2(I.mx, I.mz); M.facing = M.facing + clamp(angNorm(want - M.facing), -(P.turnRateFast || 14) * dt, (P.turnRateFast || 14) * dt); }
  a.facing = M.facing; a.vx = M.vx; a.vz = M.vz; a.moveSpeed = Math.hypot(M.vx, M.vz); M.k = Math.min(1, M.k + dt / T6.moveFade); };
DB6.unlockTick = function (S, w) { S.unlocked = true; S.unT = S.tc; const a = S.a, M = S.mc;
  if (M.on) { a.vx = M.vx; a.vz = M.vz; a.facing = a.pfacing = M.facing; a.moveSpeed = Math.hypot(M.vx, M.vz); }
  if (S.stealth && !S.v.dead) S.v.facing = S.vf0; else if (S.stealth) S.v.facing = S.vf0; };
DB6.after = function (S, w, dt) { // the corpse keeps the topped-up slide, decaying with the core's dead decay (×0.9 / tick)
  const v = S.v; if (S.vex > 1e-3 && v.dead) { v.x += S.ldx * S.vex * dt; v.z += S.ldz * S.vex * dt; S.vex *= 0.9; } };
{ const P = CORE.World.prototype, s0 = P.step; P.step = function (dt) { s0.call(this, dt); if (DB6.on) { try { DB6.post(this, dt); } catch (e) { console.error('[Veynhold] DB6', e); DB6.cur = null; } } }; }

/* ---------------------------------------------------------------- presentation clock (once per frame) */
DB6.clock = function (S, dt) { const w = Game.world, R = w && w.deathblow;
  if (R && R === S.R) { const fr = (S.a.freeze || 0) > 0 || (S.v.freeze || 0) > 0 || S.a.frozen || S.v.frozen; S.tc = R.t; S.tcp = Math.max(S.tcp || 0, R.t + (fr || w.tick <= R.t0 ? 0 : Math.min(w.acc || 0, DT))); }
  else if (S.unlocked) { if (!(A.BossD && A.BossD.hold)) S.wall += dt; S.tcp = S.unT + S.wall; }
  S.tau = remap(S, S.tcp || 0); };
{ const f0 = Game.frame; Game.frame = function (now) { DB6.frameId++; DB6._now = now; return f0.apply(this, arguments); }; }

/* ---------------------------------------------------------------- pose layer: after the v8 clip layer, before the skinned model copies the rig */
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), JN = ['hips', 'torso', 'head', 'lSh', 'lEl', 'lHand', 'rSh', 'rEl', 'rHand', 'lLeg', 'lKnee', 'lFoot', 'rLeg', 'rKnee', 'rFoot'];
function rigOf(c) { if (!c._db6) { const J = JN.map(n => c[n] || null); c._db6 = { J, buf: new Float32Array(60), snap: new Float32Array(60), prev: new Float32Array(60), lag: JN.map(() => new THREE.Quaternion()), out: JN.map(() => new THREE.Quaternion()), lagInit: false, outInit: false, snapped: false, sid: null, hand: new THREE.Quaternion(), w: 0, last: -1 }; } return c._db6; }
const RATE = 2100 * Math.PI / 180;   // rad/s per joint (35 deg a 60 fps frame): IK flips in the authored data become fast motion, never a pop
const LAGK = { 1: 26, 2: 16, 3: 20, 4: 20 };   // torso, head, left shoulder / elbow: lag-spring rate (1/s); the rest follow the clip exactly
function applyClip(c, S, who, dt, now) {
  const D = rigOf(c), C = S.C, J = D.J, isA = who === 'att';
  if (D.sid !== S) { D.sid = S; D.snapped = false; D.lagInit = false; D.outInit = false; D.w = 0; }
  const tau = S.tau, hy = samplePose(C, who, tau, D.buf), B = D.buf, P = D.prev;
  if (!D.snapped || !((S.tcp || 0) > 0)) { for (let j = 0; j < 15; j++) if (J[j]) J[j].quaternion.toArray(D.snap, j * 4); D.snapHY = c.hips.position.y; D.snapped = true; P.set(B);
    for (let j = 0; j < 60; j += 4) if (D.snap[j] * B[j] + D.snap[j + 1] * B[j + 1] + D.snap[j + 2] * B[j + 2] + D.snap[j + 3] * B[j + 3] < 0) for (let k = 0; k < 4; k++) D.snap[j + k] = -D.snap[j + k]; }
  // keep each clip quaternion in the hemisphere of last frame's, so the blend from the snapshot never takes the other way round
  for (let j = 0; j < 60; j += 4) { if (B[j] * P[j] + B[j + 1] * P[j + 1] + B[j + 2] * P[j + 2] + B[j + 3] * P[j + 3] < 0) for (let k = 0; k < 4; k++) B[j + k] = -B[j + k]; for (let k = 0; k < 4; k++) P[j + k] = B[j + k]; }
  // weight: blend in from the displayed pose; the attacker fades out into her stance after the unlock (fast when she walks off)
  let w = 1;   // blend-in is done from the snapshot below (k); w is only the fade-out (never a second slerp from the live v8 pose: its antipodal flips popped)
  if (isA) { if (S.mc.on) w *= 1 - S.mc.k; if (S.unlocked) { const u = (S.wall) / (S.mc.on ? T6.moveFade : T6.outFade); w *= 1 - smr(u); } }
  D.w = w; if (w <= 1e-4) return false;
  const k = smr((S.tcp || 0) / T6.blendIn), lagA = dt > 0 ? dt : 0, snapWin = tau >= C.knots[1] - 0.005 && tau <= C.knots[2] + 0.005;   // the 40 ms Drive->Impact snap stays authored
  for (let j = 0; j < 15; j++) { const g = J[j]; if (!g) continue; _q.fromArray(D.buf, j * 4);
    if (k < 1) { const o = j * 4, S0 = D.snap, sg = S0[o] * B[o] + S0[o + 1] * B[o + 1] + S0[o + 2] * B[o + 2] + S0[o + 3] * B[o + 3] < 0 ? -1 : 1;   // shortest arc every frame
      _q.set(S0[o] * sg + (B[o] - S0[o] * sg) * k, S0[o + 1] * sg + (B[o + 1] - S0[o + 1] * sg) * k, S0[o + 2] * sg + (B[o + 2] - S0[o + 2] * sg) * k, S0[o + 3] * sg + (B[o + 3] - S0[o + 3] * sg) * k).normalize(); }
    const lk = LAGK[j]; if (lk) { const L = D.lag[j]; if (!D.lagInit) L.copy(_q); else L.slerp(_q, 1 - Math.exp(-lk * lagA)); _q.copy(L); }
    { const O = D.out[j]; if (D.outInit && !snapWin && lagA > 0) O.rotateTowards(_q, RATE * lagA); else O.copy(_q); _q.copy(O); }
    if (w >= 1) g.quaternion.copy(_q); else g.quaternion.slerp(_q, w); }
  D.lagInit = true; D.outInit = true;
  const hY = 0.95 + hy, hy0 = k < 1 ? D.snapHY + (hY - D.snapHY) * k : hY; c.hips.position.y += (hy0 - c.hips.position.y) * w;
  // grip: the clips use W0.u2 at the wrist and an identity hand (as the v8 attack layer does)
  if (isA && c.wrist) { const wg = w * k; c.wrist.quaternion.slerp(W0U2, wg); if (c.model) { D.hand.copy(c.model.handLocal || c.wrist.quaternion).slerp(_q.identity(), wg); c.model.handLocal = D.hand; } }
  { const r = sampleRoot(C, who, tau, _rt2), yd = angNorm(r.yaw - (isA ? S.yaw0.a : S.yaw0.v)) * w * k; D.yaw = yd; c.rig.rotation.y = yd; }
  if (!isA) settleVic(c, S, D, tau);   // INT6
  secondary(c, S, isA, w, dt, now, tau);
  return true; }
// micro-motion on top: breathing, the victim's Settle tremble, Wren's strain tremble; never zero, so nothing freezes even inside the slow-mo hold
function secondary(c, S, isA, w, dt, now, tau) { const C = S.C, kI = C.knots[2], kS = C.knots[3], kX = C.knots[4], kC = C.knots[5], ph = (c.f.id || 1) * 1.7;
  const add = (g, x, y, z) => { if (!g) return; _e.set(x * w, y * w, z * w); g.quaternion.multiply(_q.setFromEuler(_e)); };
  const DEG = Math.PI / 180, br = Math.sin(now * (isA ? 1.9 : 2.6) + ph);
  if (isA) { const strain = sm((tau - kI) / 0.1) * (1 - sm((tau - kX) / 0.15)); const tr = strain * 0.9 * DEG;
    add(c.torso, br * 0.7 * DEG, 0, 0); add(c.rSh, Math.sin(now * 53 + ph) * tr, 0, Math.sin(now * 47) * tr * 0.6); add(c.head, br * 0.4 * DEG + Math.sin(now * 2.2) * 0.3 * DEG, 0, 0); }
  else { const hold = sm((tau - kI) / 0.06) * (1 - sm((tau - kC) / 0.2)), dying = sm((tau - kS) / Math.max(0.05, kX - kS)), amp = T6.tremble * DEG * hold * (1 - 0.5 * dying);
    const s1 = Math.sin(now * 2 * Math.PI * 7.1 + ph), s2 = Math.sin(now * 2 * Math.PI * 5.3 + ph * 2), s3 = Math.sin(now * 2 * Math.PI * 8.7 + ph * 3);
    add(c.torso, amp * s1 * 0.6 + br * 1.2 * DEG * hold, amp * s2 * 0.4, amp * s3 * 0.3); add(c.head, amp * s2, amp * s3 * 0.5, amp * s1 * 0.4);
    add(c.lSh, amp * s3 * 0.8, 0, amp * s1 * 0.5); add(c.rSh, amp * s1 * 0.8, 0, -amp * s2 * 0.5); add(c.lEl, amp * s2, 0, 0); add(c.rEl, amp * s3, 0, 0);
    if (tau > kC) { const life = Math.exp(-(tau - kC) * 2.2) * 0.8 * DEG; add(c.torso, Math.sin(now * 3.1 + ph) * life, 0, 0); add(c.head, Math.sin(now * 2.3 + ph) * life * 1.5, 0, 0); } } }
{ const cl0 = Character.prototype.clipLayer; Character.prototype.clipLayer = function (dt, alpha, now, turnV) { cl0.apply(this, arguments);
    if (!DB6.on) return; const S = DB6.cur, f = this.f;
    try { if (S && (f === S.a || f === S.v)) { if (S._cf !== DB6.frameId) { S._cf = DB6.frameId; DB6.clock(S, dt); } applyClip(this, S, f === S.a ? 'att' : 'vic', dt, now); }
      else if (this._db6 && this._db6.corpse) corpsePose(this, dt, now); } catch (e) { console.error('[Veynhold] DB6 pose', e); DB6.on = false; } }; }
/* INT6: floor-aware corpse settle. The clips' final lying pose arches on our rig (pelvis ~0.12 m up, head and feet down, an arm propped). Once per
   corpse the final frame is solved against the floor: the pelvis is lowered onto it while the torso and legs swing about their pivots so the head and
   feet stay where they lay, then a propped arm/leg is swung down about its root. The result blends in over the last SETTLE_T of the clip (both the
   live session and the corpse player), so it is continuous; a final pose that is not lying (kneeling bosses) is left alone. */
const SETTLE_T = 0.3, GRP = { hips: 'body', torso: 'body', head: 'head', lSh: 'lArm', lEl: 'lArm', lHand: 'lArm', rSh: 'rArm', rEl: 'rArm', rHand: 'rArm', lLeg: 'lLeg', lKnee: 'lLeg', lFoot: 'lLeg', rLeg: 'rLeg', rKnee: 'rLeg', rFoot: 'rLeg' };
const PRX = { hips: 0.14, torso: 0.14, head: 0.12, lSh: 0.1, rSh: 0.1, lEl: 0.06, rEl: 0.06, lHand: 0.05, rHand: 0.05, lLeg: 0.08, rLeg: 0.08, lKnee: 0.06, rKnee: 0.06, lFoot: 0.04, rFoot: 0.04 };
const _sv = new THREE.Vector3(), _sv2 = new THREE.Vector3(), _sv3 = new THREE.Vector3(), _sq = new THREE.Quaternion(), _sq2 = new THREE.Quaternion(), _sTmp = new Float32Array(60);
function partLows(c, L) { for (const k in L) delete L[k]; const s = c.look.scale || 1; c.root.updateMatrixWorld(true);
  for (const n in PRX) { const g = c[n]; if (!g) continue; g.getWorldPosition(_sv); const y = _sv.y - PRX[n] * s, k = GRP[n]; if (L[k] === undefined || y < L[k]) L[k] = y; }
  if (!(c.hidden && c.hidden.length)) { const L2 = {}; c.rig.traverse(o => { if (!o.isMesh || !o.visible || !o.geometry.attributes.position) return; let k = null;
      for (let q = o; q && !k; q = q.parent) { if (q === c.wrist) return; for (const n in GRP) if (c[n] === q) { k = GRP[n]; break; } } if (!k) return;
      const E = o.matrixWorld.elements, P = o.geometry.attributes.position.array; for (let i = 0; i < P.length; i += 3) { const y = E[1] * P[i] + E[5] * P[i + 1] + E[9] * P[i + 2] + E[13]; if (L2[k] === undefined || y < L2[k]) L2[k] = y; } });
    for (const k in L2) L[k] = L2[k]; }   // the procedural rig rests on its real parts (as Col.ground does); the skinned body on the joint proxies
  let m = Infinity; for (const k in L) m = Math.min(m, L[k]); L.min = m; return L; }
// swing joint g about its pivot so that the world point P (a descendant's position before the change) ends at P + dy; world-space pre-rotation
function swing(g, P, piv, dy, maxA) { _sv2.subVectors(P, piv); const len = _sv2.length(); if (len < 1e-4) return; _sv3.copy(_sv2); _sv3.y += dy; _sv2.multiplyScalar(1 / len); _sv3.normalize();
  _sq.setFromUnitVectors(_sv2, _sv3); const a = 2 * Math.acos(Math.min(1, Math.abs(_sq.w))); if (a > maxA) _sq.slerp(_sq2.identity(), 1 - maxA / a);
  g.parent.getWorldQuaternion(_sq2); g.getWorldQuaternion(_q2); g.quaternion.copy(_sq2.invert().multiply(_sq).multiply(_q2)); }
function solveSettle(c, S, D) { const C = S.C, J = D.J, L = {}, MAXA = 0.6;
  for (let j = 0; j < 15; j++) if (J[j]) J[j].quaternion.toArray(_sTmp, j * 4); const hy0 = c.hips.position.y, ry0 = c.rig.rotation.y;
  const res = { q: new Float32Array(60), hy: 0, on: false };
  try { const hy = samplePose(C, 'vic', C.dur, D.buf); for (let j = 0; j < 15; j++) if (J[j]) J[j].quaternion.fromArray(D.buf, j * 4); c.hips.position.y = 0.95 + hy;
    c.rig.rotation.y = angNorm(sampleRoot(C, 'vic', C.dur, _rt2).yaw - S.yaw0.v); c.root.updateMatrixWorld(true);
    c.torso.getWorldQuaternion(_q); _sv.set(0, 1, 0).applyQuaternion(_q); const lying = Math.acos(Math.max(-1, Math.min(1, _sv.y))) > 1.0;
    if (lying) { const pv = n => c[n].getWorldPosition(new THREE.Vector3()); c.rig.getWorldScale(_sv); const sY = _sv.y || 1;
      // pelvis: lower it onto the floor the head and feet already touch (a few passes: the torso's lowest point can sit toward the chest)
      for (let it = 0; it < 4; it++) { partLows(c, L); const mo = Math.min(L.head, L.lLeg, L.rLeg), d = L.body - mo - 0.01; if (!(d > 0.008)) break;
        const Ph = pv('head'), Pt = pv('torso'), Pl = pv('lFoot'), Pr = pv('rFoot'), Ll = pv('lLeg'), Lr = pv('rLeg');
        c.hips.position.y -= d / sY; c.root.updateMatrixWorld(true); swing(c.torso, Ph, Pt, d, MAXA); swing(c.lLeg, Pl, Ll, d, MAXA); swing(c.rLeg, Pr, Lr, d, MAXA); c.root.updateMatrixWorld(true); }
      // limbs: swing each arm / leg about its root (bisection) so its lowest point sits 0.005-0.045 m above the rest of the body: propped ones come
      // down, ones the pelvis pass pushed under the floor come back up
      for (const [k, root, tip] of [['lArm', 'lSh', 'lHand'], ['rArm', 'rSh', 'rHand'], ['lLeg', 'lLeg', 'lFoot'], ['rLeg', 'rLeg', 'rFoot']]) {
        partLows(c, L); let mo = Infinity; for (const g in L) if (g !== k && g !== 'min') mo = Math.min(mo, L[g]); const r0 = L[k] - mo; if (r0 >= 0.005 && r0 <= 0.05) continue;
        const g = c[root], q0 = g.quaternion.clone(), Ptip = pv(tip), Prt = pv(root);
        let lo = r0 > 0 ? 0 : -(0.03 - r0) * 2.5, hi = r0 > 0 ? r0 * 2.5 : 0, best = null; for (let it = 0; it < 8; it++) { const dy = (lo + hi) / 2; g.quaternion.copy(q0); swing(g, Ptip, Prt, -dy, MAXA * 0.5); partLows(c, L); const r = L[k] - mo;
          if (r < 0.005) hi = dy; else { best = dy; lo = dy; if (r <= 0.045) break; } }
        g.quaternion.copy(q0); if (best !== null) swing(g, Ptip, Prt, -best, MAXA * 0.5); c.root.updateMatrixWorld(true); }
      for (let j = 0; j < 15; j++) if (J[j]) J[j].quaternion.toArray(res.q, j * 4); res.hy = c.hips.position.y; res.on = true; } }
  finally { for (let j = 0; j < 15; j++) if (J[j]) J[j].quaternion.fromArray(_sTmp, j * 4); c.hips.position.y = hy0; c.rig.rotation.y = ry0; c.root.updateMatrixWorld(true); }
  return res; }
function settleVic(c, S, D, tau) { if (!S.v.dead || G.DB6_NOSETTLE) return; const C = S.C, u = (tau - (C.dur - SETTLE_T)) / SETTLE_T; if (u <= 0) return;
  if (D.settleS !== S) { D.settleS = S; D.settle = null; try { D.settle = solveSettle(c, S, D); } catch (e) { console.error('[Veynhold] DB6 settle', e); } }
  const T = D.settle; if (!T || !T.on) return; const k = smr(u), J = D.J;
  for (let j = 0; j < 15; j++) if (J[j]) J[j].quaternion.slerp(_q.fromArray(T.q, j * 4), k); c.hips.position.y += (T.hy - c.hips.position.y) * k; }
// after the live presentation, the victim keeps playing its clip to the end, then holds the last frame (the corpse) with a fading breath of motion
function corpsePose(c, dt, now) { const D = c._db6, K = D.corpse; if (!c.f.dead) { D.corpse = null; return; }
  K.t += dt; const S = K.S, tau = Math.min(S.C.dur, K.tau0 + K.t);
  // INT6: past the clip's end the body is the solved rest pose: copy it (no clip sampling / settle blend per frame for every old corpse)
  if (tau >= S.C.dur && D.settleS === S && D.settle && D.settle.on && !G.DB6_NOSETTLE) { const T = D.settle; for (let j = 0; j < 15; j++) { const g = D.J[j]; if (g) g.quaternion.fromArray(T.q, j * 4); }
    c.hips.position.y = T.hy; c.rig.rotation.y = D.yaw; return; }
  const hy = samplePose(S.C, 'vic', tau, D.buf);
  for (let j = 0; j < 15; j++) { const g = D.J[j]; if (g) g.quaternion.fromArray(D.buf, j * 4); } c.hips.position.y = 0.95 + hy;
  const r = sampleRoot(S.C, 'vic', tau, _rt2); D.yaw = angNorm(r.yaw - S.yaw0.v); c.rig.rotation.y = D.yaw; settleVic(c, S, D, tau); }
DB6.corpseFrom = function (S) { const c = Game.chars.get(S.v.id); if (!c || !c._db6 || !S.v.dead) return; c._db6.corpse = { S, tau0: S.tau, t: 0 }; };
// session end: hand the victim over to the corpse player, drop the session
DB6.update = function (dt) { const S = this.cur; if (!S) return;
  if (S.unlocked && (S.tau >= S.C.dur || S.wall > 3 || !Game.world || S.w !== Game.world)) { this.corpseFrom(S); const ac = Game.chars.get(S.a.id); if (ac) ac.rig.rotation.y = 0; this.cur = null; } };
{ const cu = G.Cam.update; G.Cam.update = function (dt) { const r = cu.apply(this, arguments); try { DB6.update(dt); } catch (e) { console.error(e); DB6.cur = null; } return r; }; }
// the arena (no world collapse): stop game.js's generic death tip while the clip lays the body down, and pin the lowest joint to the floor
{ const up0 = Character.prototype.update; Character.prototype.update = function (dt, alpha, now) {
    const S = DB6.cur, f = this.f, mc = S && f === S.a && S.mc.on && !S.unlocked;
    if (mc) { const st = f.state; f.state = 'move'; try { up0.call(this, dt, alpha, now); } finally { f.state = st; } }   // walking off from Blade-clear: locomotion clips run
    else up0.call(this, dt, alpha, now);
    if (!A.active && this._db6 && (this._db6.corpse || (S && f === S.v && this._db6.w > 0))) { this.rig.rotation.x = 0; this.rig.rotation.z = 0; const BD = A.BossD; if (BD && BD.Col && BD.Col.ground) BD.Col.ground(this); } }; }

/* ---------------------------------------------------------------- hooks the world finisher (world_boss.js Fin) reads */
DB6.active = function (f) { const S = this.cur; return !!S && (S.a === f || S.v === f); };
DB6.vital = function (vc, out) { const S = this.cur; if (!S) return null; const V = VITAL[S.C.vital] || VITAL.heart; vc.hips.getWorldPosition(out); const hx = out.x, hy = out.y, hz = out.z;
  vc.head.getWorldPosition(out); out.x = hx + (out.x - hx) * V[0]; out.y = hy + (out.y - hy) * V[0]; out.z = hz + (out.z - hz) * V[0];
  const th = vc.root.rotation.y + (vc.rig ? vc.rig.rotation.y : 0), s = (vc.look && vc.look.scale) || 1; out.x += Math.cos(th) * V[1] * s; out.z -= Math.sin(th) * V[1] * s; return out; };

/* ---------------------------------------------------------------- audio: 6 sampled variants on the deathblow clock */
const AU = DB6.Audio = { buf: null, loading: false, cues: AUD.cues || null, files: AUD.files || null, S: null, idx: 0, list: null, dk: null, err: null, decoded: 0 };
const VAR_AUDIO = { heart_pierce: 'heart', turning_cut: 'turning', crown_splitter: 'crown', shoulder_drive: 'crown', stealth_backstab: 'stealth', stealth_throat: 'stealth', king_phase1: 'king1', kingsfall: 'kingsfall' };
AU.load = function () { if (this.loading || this.buf || !this.files || !audio || !audio.ctx) return; const c = audio.ctx; if (!c.decodeAudioData) return; this.loading = true; this.buf = {};
  const names = Object.keys(this.files); let i = 0; const next = () => { if (i >= names.length) { this.loading = false; return; } const n = names[i++];
    try { const bin = atob(this.files[n]), u8 = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) u8[k] = bin.charCodeAt(k);
      const p = c.decodeAudioData(u8.buffer, b => { this.buf[n] = b; this.decoded++; next(); }, e => { this.err = String(e); next(); }); if (p && p.catch) p.catch(() => {}); } catch (e) { this.err = String(e); next(); } };
  next(); };
AU.ready = function () { return !!(this.buf && this.cues && this.decoded >= Object.keys(this.files || {}).length * 0.9); };
AU.start = function (S) { this.S = null; if (!this.cues || !this.cues.variants) return; const id = S.audioId || VAR_AUDIO[S.name] || 'heart', cue = this.cues.variants[id]; if (!cue) return;
  // in the world the collapse lands the body itself (Col slam + the surface-aware land thud): no scheduled body fall there
  const L = (cue.layers || []).filter(l => !(A.active && /^body_fall/.test(l.file))).sort((x, y) => x.t - y.t);
  // the post-impact near-silence: hold the -40 dB point to impact + 0.11 s of clock (+ the 0.10 s hit-stop = ~0.21 s of wall time)
  const imp = (this.cues.schedules[cue.schedule] || {}).impact || 0.32, duck = (cue.duck || []).map(d => d.slice()); for (const d of duck) if (d[1] <= -39 && d[0] > imp + 0.03) d[0] = Math.max(d[0], imp + 0.11);
  this.S = S; this.list = L; this.idx = 0; this.cue = cue; this.duck = duck; this.sched = this.cues.schedules[cue.schedule] || null; this.id = id; this.duckI = 0; S.audio = id;
  if (audio && audio.ctx) { audio.ctxPrio = 5; } };
AU.fire = function (L, off) { const c = audio.ctx, b = this.buf && this.buf[String(L.file).replace(/\.ogg$/, '')]; if (!c || !b) return false;
  try { const s = c.createBufferSource(); s.buffer = b; s.playbackRate.value = L.rate || 1; let n = s;
    if (L.lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = L.lp; f.Q.value = 0.0001; n.connect(f); n = f; }
    const g = c.createGain(); g.gain.value = Math.pow(10, (L.gainDb || 0) / 20); n.connect(g); g.connect(audio.sfxBus());
    if (L.send !== undefined && L.send !== null && !(Settings.quality === 'low' && L.send < -14)) { const snd = audio.sendOf('exec'); if (snd) { const sg = c.createGain(); sg.gain.value = Math.pow(10, L.send / 20); g.connect(sg); sg.connect(snd); } }
    s.start(c.currentTime, Math.max(0, Math.min(off || 0, b.duration - 0.01))); return true; } catch (e) { this.err = String(e); return false; } };
// per frame: layers whose clip-clock time was just crossed (offset = how far past); the music duck and the post-impact near-silence
AU.update = function () { const S = this.S; if (!S || !audio || !audio.ctx) return; if (S !== DB6.cur && !(S.unlocked)) { this.S = null; return; }
  if (!this.ready()) { if (!this.buf) this.load(); }
  const tc = S.tcp || 0, L = this.list;
  // cue times are on the variant's own schedule; map our core-ish clock onto it through the same knots as the picture
  const t = cueClock(this.sched, S, tc);
  while (this.idx < L.length && L[this.idx].t <= t + 1e-4) { const l = L[this.idx++]; if (t - l.t < 0.25 || l.t <= 0.02) this.fire(l, t - l.t); }
  const D = this.duck; if (D && D.length && audio.dbDuck) { while (this.duckI < D.length && D[this.duckI][0] <= t) { const d = D[this.duckI++], nx = D[this.duckI]; audio.dbDuck(d[1], nx ? Math.max(0.01, (nx[0] - d[0]) / 3) : 0.6); } }
  if (S.unlocked && this.idx >= L.length && (!D || this.duckI >= D.length)) { if (audio.ctxPrio === 5) audio.ctxPrio = null; audio.dbDuck && audio.dbDuck(0, 0.6); this.S = null; } };
function cueClock(sc, S, tc) { if (!sc) return tc; const kc = [0, sc.drive, sc.impact, sc.settle, sc.extract, sc.clear !== undefined ? sc.clear : sc.bladeClear, sc.unlock, sc.end !== undefined ? sc.end : sc.presEnd];
  const K = S.K; if (kc.some(x => x === undefined)) return tc; if (tc <= 0) return 0; for (let i = 1; i < K.length; i++) if (tc < K[i]) { const u = (tc - K[i - 1]) / Math.max(1e-6, K[i] - K[i - 1]); return kc[i - 1] + (kc[i] - kc[i - 1]) * u; }
  return kc[7] + (tc - K[7]); }
AU.owns = function () { return !!(this.S && this.ready()); };
// decode after the first gesture (AudioSys.ensure), never on the first deathblow; also prebuild the reverb sends there (perf #1)
if (audio) { const en = audio.ensure; audio.ensure = function () { const had = !!this.ctx; const r = en.apply(this, arguments); if (!had && this.ctx) { const self = this;
      setTimeout(() => { try { self.sendOf('exec'); } catch (e) {} }, 0); setTimeout(() => { try { self.sendOf('steel'); } catch (e) {} }, 30);
      if (Settings.quality !== 'low') { setTimeout(() => { try { self.sendOf('air'); self.sendOf('flesh'); } catch (e) {} }, 60); }
      setTimeout(() => AU.load(), 90); } return r; };
  // the old procedural deathblow one-shots stand down while a sampled variant plays (no doubling)
  const pl = audio.play; audio.play = function (name) { if ((name === 'deathblow' || name === 'execSting' || name === 'dbEntry' || name === 'dbImpact' || name === 'dbClear' || name === 'dbExtract' || name === 'dbTension' || name === 'dbDrive') && AU.owns()) return; return pl.apply(this, arguments); }; }
// arena fights: prewarm the programs once the encounter is built (world regions do it in BD.afterBuild)
{ const gb = Game.begin; if (gb) Game.begin = function () { const r = gb.apply(this, arguments); if (!A.active && G.prewarm && !window.__VEYN_HEADLESS) setTimeout(() => G.prewarm(true), 0); return r; }; }
{ const cu = G.Cam.update; G.Cam.update = function (dt) { const r = cu.apply(this, arguments); try { AU.update(); } catch (e) { AU.err = String(e); AU.S = null; } return r; }; }
})();
