/* =====================================================================
   VEYNHOLD v8 — CLIP ANIMATION LAYER (presentation only; never touches the combat core)
   Quaternius Universal Animation Library 1 + 2 (CC0) retargeted offline onto the pose rig
   (tools: work/ual/retarget.py). Data: 15 rig joints per frame, int16 quaternions (w rebuilt),
   hip height in 0.1 mm, 30 fps. Attack clips are RE-TIMED TO THE CORE: the clip's strike frame
   always lands on the attack's strike tick (inst.su), whatever the windup jitter / hold / tempo.
   Locomotion: phase-synced 2D blend (walk / jog / sprint / backpedal / side-step / hip-twist strafe),
   playback rate = ground speed / stride so planted feet do not slide.
   ===================================================================== */
(function () {
'use strict';
const DATA = /*ANIM_DATA*/null;
const ANIM = { ready: false, clips: {}, J: [], W0: {}, fps: 30, error: null };
function b64(s) { const bin = atob(s), n = bin.length, u = new Uint8Array(n); for (let i = 0; i < n; i++) u[i] = bin.charCodeAt(i); return u.buffer; }
function decode() {
  try {
    if (!DATA || !DATA.clips) { ANIM.error = 'no animation data'; return; }
    ANIM.J = DATA.joints; ANIM.fps = DATA.fps; ANIM.W0 = DATA.W0; const J = ANIM.J.length;
    for (const k in DATA.clips) {
      const c = DATA.clips[k], n = c.n, raw = new Int16Array(b64(c.q)), hy = new Int16Array(b64(c.hy)), q = new Float32Array(n * J * 4), h = new Float32Array(n);
      for (let i = 0; i < n * J; i++) { const x = raw[i * 3] / 32767, y = raw[i * 3 + 1] / 32767, z = raw[i * 3 + 2] / 32767; q[i * 4] = x; q[i * 4 + 1] = y; q[i * 4 + 2] = z; q[i * 4 + 3] = Math.sqrt(Math.max(0, 1 - x * x - y * y - z * z)); }
      for (let i = 0; i < n; i++) h[i] = hy[i] / 10000;
      const meta = Object.assign({}, c); delete meta.q; delete meta.hy;
      ANIM.clips[k] = Object.assign(meta, { key: k, q, h, n, dur: (n - 1) / ANIM.fps, stride: (c.speed || 0) * ((n - 1) / ANIM.fps) });
    }
    ANIM.ready = true;
  } catch (e) { ANIM.error = e.message; ANIM.ready = false; }
}
/* sample one clip at time t (seconds; looped when loop) into out (Float32Array J*4) and return hip height */
function sample(clip, t, out, loop) {
  const J = ANIM.J.length, n = clip.n; let f = t * ANIM.fps;
  if (loop) { f = f % (n - 1); if (f < 0) f += n - 1; } else f = Math.max(0, Math.min(n - 1, f));
  const i0 = Math.min(n - 1, Math.floor(f)), i1 = Math.min(n - 1, i0 + 1), u = f - i0, q = clip.q, a = i0 * J * 4, b = i1 * J * 4;
  for (let j = 0; j < J; j++) { const o = j * 4; let x1 = q[b + o], y1 = q[b + o + 1], z1 = q[b + o + 2], w1 = q[b + o + 3];
    const x0 = q[a + o], y0 = q[a + o + 1], z0 = q[a + o + 2], w0 = q[a + o + 3]; if (x0 * x1 + y0 * y1 + z0 * z1 + w0 * w1 < 0) { x1 = -x1; y1 = -y1; z1 = -z1; w1 = -w1; }
    let x = x0 + (x1 - x0) * u, y = y0 + (y1 - y0) * u, z = z0 + (z1 - z0) * u, w = w0 + (w1 - w0) * u; const l = Math.hypot(x, y, z, w) || 1;
    out[o] = x / l; out[o + 1] = y / l; out[o + 2] = z / l; out[o + 3] = w / l; }
  return clip.h[i0] + (clip.h[i1] - clip.h[i0]) * u;
}
/* weighted blend of several samples: acc += w * sample (hemisphere-aligned), finish() normalises */
function accumulate(acc, src, w, first) { const J = ANIM.J.length;
  for (let j = 0; j < J; j++) { const o = j * 4; let s = 1; if (!first && acc[o] * src[o] + acc[o + 1] * src[o + 1] + acc[o + 2] * src[o + 2] + acc[o + 3] * src[o + 3] < 0) s = -1;
    if (first) { acc[o] = src[o] * w; acc[o + 1] = src[o + 1] * w; acc[o + 2] = src[o + 2] * w; acc[o + 3] = src[o + 3] * w; }
    else { acc[o] += src[o] * w * s; acc[o + 1] += src[o + 1] * w * s; acc[o + 2] += src[o + 2] * w * s; acc[o + 3] += src[o + 3] * w * s; } } }
function finish(acc) { const J = ANIM.J.length; for (let j = 0; j < J; j++) { const o = j * 4, l = Math.hypot(acc[o], acc[o + 1], acc[o + 2], acc[o + 3]) || 1; acc[o] /= l; acc[o + 1] /= l; acc[o + 2] /= l; acc[o + 3] /= l; } }

/* ---------- attack clips per character (distinct choices per boss); styles not listed stay procedural ----------
   (thrusts, sweeps, grabs, plunges, risings, ripostes, running thrusts and the Crimson Arc keep their hand-made
   perilous / special poses so their tells stay unmistakable) */
const SETS = {
  player:  { sideR: 'swA', sideL: 'swB', overhead: 'swOH', overheadHeavy: 'swOH', spin: 'swC', dashCut: 'swDash' },
  duelist: { sideR: 'swA', sideL: 'swB', overhead: 'swOH', overheadHeavy: 'swOH' },
  warden:  { sideR: 'swAB', sideL: 'swB', overheadHeavy: 'swOH' },
  brother: { sideR: 'swDash', sideL: 'swB', overhead: 'swOH' },
  king:    { sideR: 'swA', sideL: 'swB', overhead: 'swOH', overheadHeavy: 'swAB' },
  king2:   { sideR: 'swC', sideL: 'swB', overheadHeavy: 'swOH', overhead: 'swA' },
};
/* per-character feel: how much of the clip shows (the rest is the character's own stance), recovery speed */
const FEEL = { player: 1, duelist: 1, warden: 0.92, brother: 0.95, king: 1, king2: 1 };
function clipFor(setKey, def) { const s = SETS[setKey] || SETS.player; const k = s[def.style]; return k && ANIM.clips[k] ? ANIM.clips[k] : null; }
/* map core attack time -> clip time. Keys: coil (start of the fast swing), strike (blade crosses the target),
   swingEnd. Core: 0 .. su (strike tick) .. su+ac .. su+ac+rc. The strike frame is pinned to su EXACTLY. */
const SWING_MAX = 0.12;   // clip seconds of fast swing kept before the strike (played at natural speed or faster)
function attackTime(clip, a, vt) {
  const s = clip.strike, c = Math.max(clip.coil, s - SWING_MAX), e = Math.max(s + 1 / 60, clip.swingEnd), D = clip.dur;
  const su = a.su, ac = a.ac, rc = a.rc;
  const swingT = Math.min(s - c, su * 0.45), Tc = su - swingT;                          // game time when the fast swing starts
  if (vt < Tc) { // windup: play toward the coil pose no slower than 0.6x, then HOLD (held / delayed windups tremble there)
    const rate = Math.max(c / Math.max(1e-4, Tc), 0.6); const ct = vt * rate; return ct >= c ? { t: c, hold: true } : { t: ct, hold: false }; }
  if (vt < su) return { t: c + (s - c) * (vt - Tc) / Math.max(1e-4, su - Tc), hold: false };
  if (vt < su + ac) return { t: s + (e - s) * (vt - su) / Math.max(1e-4, ac), hold: false };
  const u = Math.min(1, (vt - su - ac) / Math.max(1e-4, rc)); return { t: e + (D - e) * u, hold: false, rec: u };
}

/* ---------- locomotion: speed bands x direction ----------
   One clip per speed band (walk / jog / sprint, or their reversed versions for backpedal), cross-faded when the band
   changes; travel direction turns the hips (up to 90 deg; the torso keeps facing the target). Each clip is STRIDE-WARPED
   (thigh swing scaled by k) toward a natural cadence for the current speed, and the playback rate is v / (k * stride),
   so a planted foot moves at the body speed (no slide). Warp changes leg height, so the hips are re-grounded by FK. */
const LOCO = { fwd: [['walk', 0, 2.6], ['jog', 2.6, 6.2], ['run', 6.2, 99]], back: [['walkB', 0, 2.4], ['jogB', 2.4, 99]], turnL: 'walkSL', turnR: 'walkSR', hyst: 0.3, fade: 5.5, yawMax: 1.75, backOn: -0.17, backOff: 0.02,
  cad: { walk: [0.75, 1.2, 0.5], jog: [1.07, 6.17, 0.25], run: [1.5, 9.24, 0.3], walkB: [0.75, 1.2, 0.5], jogB: [1.07, 6.17, 0.25], walkSL: [0.75, 0.55, 0.3], walkSR: [0.75, 0.55, 0.3] }, kMin: 0.55, kMax: 1.1 };
function bandKey(set, v, cur) { const B = LOCO[set]; for (const [k, lo, hi] of B) { if (k === cur && v >= lo - LOCO.hyst && v < hi + LOCO.hyst) return k; } for (const [k, lo, hi] of B) if (v >= lo && v < hi) return k; return B[B.length - 1][0]; }
/* stride warp + rate for one clip at rig speed v (rig units / s) */
function warpOf(key, v) { const c = ANIM.clips[key], cd = LOCO.cad[key] || [1, c.speed, 0.3]; const cadence = cd[0] * Math.pow(Math.max(0.05, v) / cd[1], cd[2]);
  const k = Math.max(LOCO.kMin, Math.min(LOCO.kMax, v / Math.max(1e-3, cadence * c.stride))); return { k, rate: v / Math.max(1e-3, k * c.stride) }; }
/* blend weights: exactly sum to 1 with idle. state = persistent { lw:{}, back, key } */
function locoWeights(st, v, theta, move, turnW, turnDir, dt, out) {
  for (const k in out) delete out[k];
  const ct = Math.cos(theta), sn = Math.sin(theta);
  if (!st.back && ct < LOCO.backOn) st.back = true; else if (st.back && ct > LOCO.backOff) st.back = false;
  const set = st.back ? 'back' : 'fwd', want = move > 0.01 ? (st.guarded ? (st.back ? 'walkB' : 'walk') : bandKey(set, v, st.key)) : (st.key || 'walk'); st.key = want;   // guarding fighters always walk (sword up, no flight phase)
  const lw = st.lw || (st.lw = {}); if (!(want in lw)) lw[want] = 0; let tot = 0;
  for (const k in lw) { lw[k] += ((k === want ? 1 : 0) - lw[k]) * Math.min(1, dt * LOCO.fade * (st.guarded ? 2 : 1)); if (lw[k] < 1e-3 && k !== want) delete lw[k]; else tot += lw[k]; }
  const tw = Math.max(0, Math.min(1, turnW)) * (1 - move), mv = move * (1 - tw);
  out.idle = 1 - mv - tw;
  for (const k in lw) out[k] = mv * lw[k] / tot;
  if (tw > 0) { const tk = turnDir > 0 ? LOCO.turnL : LOCO.turnR; out[tk] = (out[tk] || 0) + tw; }
  let yaw = st.back ? Math.atan2(-sn, -ct) : Math.atan2(sn, ct); yaw = Math.max(-LOCO.yawMax, Math.min(LOCO.yawMax, yaw));
  return { yaw, key: want };
}
function sumWeights(w) { let s = 0; for (const k in w) s += w[k]; return s; }
/* thigh swing scaled by k (angle-axis), joints lLeg = 9, rLeg = 12 in the rig order */
function warpLegs(q, k) { if (Math.abs(k - 1) < 1e-3) return; for (const j of [9, 12]) { const o = j * 4; let x = q[o], y = q[o + 1], z = q[o + 2], w = q[o + 3]; if (w < 0) { x = -x; y = -y; z = -z; w = -w; }
    const s = Math.hypot(x, y, z); if (s < 1e-6) continue; const ang = 2 * Math.atan2(s, w) * k, h = Math.sin(ang / 2) / s; q[o] = x * h; q[o + 1] = y * h; q[o + 2] = z * h; q[o + 3] = Math.cos(ang / 2); } }
/* lowest sole point (heel / toe) of the rig pose, Wanderer GLB proportions, hips at height 0 */
const _a = [0, 0, 0, 1], _b = [0, 0, 0, 1], _v = [0, 0, 0];
function qm(o, a, b) { const ax = a[0], ay = a[1], az = a[2], aw = a[3], bx = b[0], by = b[1], bz = b[2], bw = b[3]; o[0] = aw * bx + ax * bw + ay * bz - az * by; o[1] = aw * by - ax * bz + ay * bw + az * bx; o[2] = aw * bz + ax * by - ay * bx + az * bw; o[3] = aw * bw - ax * bx - ay * by - az * bz; return o; }
function rotY(q, x, y, z) { const qx = q[0], qy = q[1], qz = q[2], qw = q[3]; const ix = qw * x + qy * z - qz * y, iy = qw * y + qz * x - qx * z, iz = qw * z + qx * y - qy * x, iw = -qx * x - qy * y - qz * z;
  return iy * qw + iw * -qy + iz * -qx - ix * -qz; }
function rotV(q, x, y, z, o) { const qx = q[0], qy = q[1], qz = q[2], qw = q[3]; const ix = qw * x + qy * z - qz * y, iy = qw * y + qz * x - qx * z, iz = qw * z + qx * y - qy * x, iw = -qx * x - qy * y - qz * z;
  o[0] = ix * qw + iw * -qx + iy * -qz - iz * -qy; o[1] = iy * qw + iw * -qy + iz * -qx - ix * -qz; o[2] = iz * qw + iw * -qz + ix * -qy - iy * -qx; return o; }
/* support-foot contact point (lower foot; heel or toe, whichever is lower) in hips space: [x, y, z, foot] */
const _p = [0, 0, 0], _s = new Float32Array(15 * 4);
function contact(q, foot) { const H = [q[0], q[1], q[2], q[3]]; let best = null;
  for (const [jl, sx, fi] of [[9, 1, 0], [12, -1, 1]]) { if (foot !== undefined && foot !== fi) continue; const L = qm([0, 0, 0, 1], H, [q[jl * 4], q[jl * 4 + 1], q[jl * 4 + 2], q[jl * 4 + 3]]), K = qm([0, 0, 0, 1], L, [q[jl * 4 + 4], q[jl * 4 + 5], q[jl * 4 + 6], q[jl * 4 + 7]]), F = qm([0, 0, 0, 1], K, [q[jl * 4 + 8], q[jl * 4 + 9], q[jl * 4 + 10], q[jl * 4 + 11]]);
    const a = rotV(H, sx * 0.10, -0.03, 0, [0, 0, 0]), b = rotV(L, 0, -0.43, 0, [0, 0, 0]), c = rotV(K, 0, -0.435, 0, [0, 0, 0]), an = [a[0] + b[0] + c[0], a[1] + b[1] + c[1], a[2] + b[2] + c[2]];
    const t = rotV(F, 0, -0.055, 0.13, [0, 0, 0]), h = rotV(F, 0, -0.085, -0.035, [0, 0, 0]); const pt = t[1] < h[1] ? t : h; const r = [an[0] + pt[0], an[1] + pt[1], an[2] + pt[2], fi];
    if (!best || r[1] < best[1]) best = r; }
  return best; }
/* d(contact z)/d(phase) of the support foot at phase ph (rig units per cycle), after the stride warp */
function supportRate(clip, ph, k, eps) { eps = eps || 0.02; const t0 = ((ph + (clip.phase0 || 0)) % 1) * clip.dur, t1 = ((ph + eps + (clip.phase0 || 0)) % 1) * clip.dur;
  sample(clip, t0, _s, true); warpLegs(_s, k); const a = contact(_s); sample(clip, t1, _s, true); warpLegs(_s, k); const b = contact(_s, a[3]);
  return { dz: (b[2] - a[2]) / eps, dx: (b[0] - a[0]) / eps, low: a[1] }; }
function lowestSole(q) { let low = 1e9; const H = [q[0], q[1], q[2], q[3]];
  for (const [jl, sx] of [[9, 1], [12, -1]]) { const L = qm([0, 0, 0, 1], H, [q[jl * 4], q[jl * 4 + 1], q[jl * 4 + 2], q[jl * 4 + 3]]), K = qm([0, 0, 0, 1], L, [q[jl * 4 + 4], q[jl * 4 + 5], q[jl * 4 + 6], q[jl * 4 + 7]]), F = qm([0, 0, 0, 1], K, [q[jl * 4 + 8], q[jl * 4 + 9], q[jl * 4 + 10], q[jl * 4 + 11]]);
    const y = rotY(H, sx * 0.10, -0.03, 0) + rotY(L, 0, -0.43, 0) + rotY(K, 0, -0.435, 0); low = Math.min(low, y + rotY(F, 0, -0.055, 0.13), y + rotY(F, 0, -0.085, -0.035)); }
  return low; }
decode();
Object.assign(ANIM, { sample, accumulate, finish, SETS, FEEL, clipFor, attackTime, LOCO, locoWeights, sumWeights, warpOf, warpLegs, lowestSole, contact, supportRate, bandKey, SWING_MAX });
window.VEYN_ANIM = ANIM;
})();
