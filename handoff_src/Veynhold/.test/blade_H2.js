// chunk H2 + I2: sword feel and hit reactions (blueprint v3 §5.2, §6, §8). jsdom, procedural / skinned rig as the build picks.
// I2 expectations (changed on purpose from H2): blade lag is a hard cone, 7° during the attack's active frames and 10° outside (half on Low), with the
// error-increasing velocity zeroed on the clamp and the integrate dt clamped to 0.066 s; impact kicks are 1.2–1.8 rad/s angular impulses (peak v/(ω·e),
// about 1.1–1.7°, half on Low) instead of 5–14° peaks; a 0.15 s residual arc follows the active frames; hit-reaction impulses are a preallocated pool
// of 4 slots (2 on Low) decaying with τ = 0.216 s (half-life 0.15 s), suppressed during deathblows, with no allocation growth; a clip attack cut short
// fast-ins from the displayed pose. Kept from H2: presentation hold, trail spike, deathblow fade, teleport snap, cost.
const mk = require('./p1h.js');
const v8 = require('v8'); v8.setFlagsFromString('--expose-gc'); const gc = require('vm').runInNewContext('gc');
const res = []; const ok = (n, c, i) => { res.push((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? ' [' + i + ']' : '')); };
const NUM = {};
function run(quality) {
  const H = mk({ storage: { veynhold_v8: JSON.stringify({ v: 8, seenTutorial: true }) } }); const { w, G, Game, frames, tap } = H; const R2D = 180 / Math.PI, THREE = w.THREE;
  G.Settings.quality = quality; G.applyQuality(); frames(3); Game.start('duelist'); frames(2); tap('KeyQ'); frames(2);
  if (G.Intro && G.Intro.active) { tap('Escape'); frames(2); }
  const low = quality === 'low', LK = low ? 0.5 : 1, FULL = 10 * LK, ACT = 7 * LK, WK = 22, E1 = Math.E;
  const W = Game.world, P = W.player, E = W.enemies()[0]; if (E.brain) E.brain.update = () => {}; P.maxHp = P.hp = 1e5;
  E.x = E.px = P.x; E.z = E.pz = P.z + 6; frames(60);
  const pc = Game.chars.get(P.id), ec = Game.chars.get(E.id), tag = quality + (pc.model ? ' (skinned)' : ' (block rig)'); const N = NUM[quality] = { rig: pc.model ? 'skinned' : 'block' };
  ok(tag + ': blade feel initialised on both fighters', !!(pc.bf && pc.bf.init && ec.bf && ec.bf.init));
  let rest = 0; frames(30, () => { rest = Math.max(rest, pc.bf.lag * R2D); }); N.restLag = +rest.toFixed(2);
  ok(tag + ': lag at rest is small (< 1°)', rest < 1, rest.toFixed(2));
  // fast swings: light string + heavy. Sample after each frame; split active frames (bfAct = 1) from the rest.
  let mx = 0, mxAct = 0, nAct = 0, mxRaw = 0, mxHeavy = 0, mxHeavyAct = 0, actViol = 0, resFr = 0, resLag0 = -1, resVis = 0, inRes = false, resRuns = [];
  const sample = (heavy) => { if (P.state !== 'attack') { if (inRes) { resRuns.push(resFr); inRes = false; } return; } const L = pc.bf.lag * R2D, a = P.atk;
    if (pc.bfAct >= 1) { nAct++; if (heavy) mxHeavyAct = Math.max(mxHeavyAct, L); else mxAct = Math.max(mxAct, L); if (L > ACT + 1e-3) actViol++; }
    if (heavy) mxHeavy = Math.max(mxHeavy, L); else mx = Math.max(mx, L); mxRaw = Math.max(mxRaw, pc.bf.rawLag * R2D);
    const fk = pc.trail.fadeK; if (fk > 0 && fk < 1 && pc.bfAct < 1 && a && a.t >= a.su + a.ac - 1 / 60) { if (!inRes) { inRes = true; resFr = 0; if (resLag0 < 0) resLag0 = L; } resFr++; if (pc.trail.mesh.visible) resVis++; }
    else if (inRes && fk === 0) { resRuns.push(resFr); inRes = false; } };
  for (const k of ['KeyJ', 'KeyJ', 'KeyJ']) { tap(k); for (let i = 0; i < 14; i++) { frames(1); sample(false); } }
  frames(60); tap('KeyK'); for (let i = 0; i < 70; i++) { frames(1); sample(true); } frames(40);
  N.lagLight = +mx.toFixed(2); N.lagLightActive = +mxAct.toFixed(2); N.lagHeavy = +mxHeavy.toFixed(2); N.lagHeavyActive = +mxHeavyAct.toFixed(2); N.rawLag = +mxRaw.toFixed(1); N.activeFrames = nAct;
  ok(tag + ': active-frame lag never exceeds the active cap (' + ACT + '°)', nAct > 0 && actViol === 0, nAct + ' active frames, light ' + mxAct.toFixed(2) + '°, heavy ' + mxHeavyAct.toFixed(2) + '°, over cap ' + actViol);
  ok(tag + ': active-frame lag still reads (≥ 60 % of the active cap on the string)', Math.max(mxAct, mxHeavyAct) >= 0.6 * ACT, Math.max(mxAct, mxHeavyAct).toFixed(2) + '°');
  ok(tag + ': peak lag on the light string within 80–100 % of the full cap (' + FULL + '°)', mx >= 0.8 * FULL && mx <= FULL + 1e-3, mx.toFixed(2) + '° (raw spring ' + mxRaw.toFixed(1) + '°)');
  ok(tag + ': peak lag on the heavy within 60–100 % of the full cap', mxHeavy >= 0.6 * FULL && mxHeavy <= FULL + 1e-3, mxHeavy.toFixed(2) + '°');
  const rr = resRuns.filter(n => n > 1), resMs = rr.length ? Math.round(Math.max(...rr) * 16.67) : 0; N.residual = { runs: rr, ms: resMs, lagAtStart: +resLag0.toFixed(2), visibleFrames: resVis };
  ok(tag + ': residual arc lasts 0.12–0.18 s after the active frames (trail fading, lit)', resMs >= 117 && resMs <= 184 && resVis > 0, resMs + ' ms, runs ' + rr.join(',') + ', lit frames ' + resVis);
  ok(tag + ': lag carries into the residual arc (not snapped at the end of the active frames)', resLag0 > 0.05, resLag0.toFixed(2) + '°');
  frames(40); const settle = pc.bf.lag * R2D; ok(tag + ': lag settles back after the swing (< 1°)', settle < 1, settle.toFixed(2));
  // spring sign, cone clamp, dt clamp (direct calls on a settled blade)
  const Hb = pc.bf, Bo = pc.model && pc.model.blade ? pc.model.blade : pc.wrist;
  // bladeFeel rotates the blade object in place, so a direct call reads back last call's offset: save / restore the blade's local rotation around each probe
  const bq = new THREE.Quaternion(), mbZ = new THREE.Vector3(), Tnow = () => { Bo.updateMatrixWorld(true); const q = new THREE.Quaternion(); Bo.matrixWorld.decompose(new THREE.Vector3(), q, new THREE.Vector3());
    return (pc.model && pc.model.blade ? mbZ.set(0, 0, 1) : mbZ.set(0, -1, 0)).clone().applyQuaternion(q); };
  const offset = (deg) => { const T = Tnow(), ax = new THREE.Vector3(-T.z, 0, T.x); if (ax.lengthSq() < 1e-6) ax.set(1, 0, 0); ax.normalize(); Hb.x.copy(T).applyAxisAngle(ax, deg / R2D); Hb.v.set(0, 0, 0); Hb.pT.copy(T); return T; };
  frames(30); bq.copy(Bo.quaternion); const restore = () => { Bo.quaternion.copy(bq); Bo.updateMatrixWorld(true); };
  { restore(); const T = offset(5), a0 = Math.acos(Math.min(1, Hb.x.dot(T))) * R2D; pc.bladeFeel(1 / 60, 1 / 60, 0); const a1 = Hb.rawLag * R2D;
    ok(tag + ': spring pulls toward the target (5° offset shrinks in one step)', a1 < a0 && a1 < 5, a0.toFixed(2) + '° → ' + a1.toFixed(2) + '°'); }
  { restore(); const T = offset(30), E0 = new THREE.Vector3().copy(Hb.x).addScaledVector(T, -Hb.x.dot(T)).normalize(); Hb.v.copy(E0).multiplyScalar(5); const n0 = Hb.clampN || 0;
    pc.bfAct = 0; pc.bladeFeel(1 / 60, 1 / 60, 0); const cap = Hb.cap, Ed = new THREE.Vector3().copy(Hb.x).addScaledVector(Hb.T, -Hb.x.dot(Hb.T)).normalize();
    const g = Ed.clone().multiplyScalar(Math.cos(cap)).addScaledVector(Hb.T, -Math.sin(cap)), vg = Hb.v.dot(g);
    ok(tag + ': clamp projects onto the cone (lag = cap) and zeroes the error-increasing velocity', (Hb.clampN || 0) > n0 && Math.abs(Hb.lag * R2D - FULL) < 0.02 && vg < 0.05, (Hb.lag * R2D).toFixed(2) + '°, v·g ' + vg.toFixed(4) + ' rad/s (was 5)'); }
  { const dt0 = (pdt) => { restore(); offset(5); pc.bladeFeel(pdt, pdt, 0); return Hb.rawLag; };
    const a = dt0(0.2), b = dt0(0.066), c = dt0(1 / 60); N.dtClamp = { at200ms: +(a * R2D).toFixed(3), at66ms: +(b * R2D).toFixed(3), at16ms: +(c * R2D).toFixed(3) };
    ok(tag + ': integrate dt is clamped (a 0.2 s step integrates like 0.066 s, finite)', isFinite(a) && Math.abs(a - b) * R2D < 0.01 && b < c, (a * R2D).toFixed(3) + '° vs ' + (b * R2D).toFixed(3) + '° (1/60 s: ' + (c * R2D).toFixed(3) + '°)'); restore(); frames(10); }
  // kick: a synthetic block event (attacker = enemy 1.4 rad/s, defender = player 1.2 rad/s)
  const ev = (o) => { W.events.push(Object.assign({ a: E.id, d: P.id, x: (P.x + E.x) / 2, z: (P.z + E.z) / 2 }, o)); Game.handleEvents(); };
  E.x = E.px = P.x; E.z = E.pz = P.z + 1.6; frames(30);
  frames(40); ev({ type: 'block', heavy: false }); const v0A = ec.bf.kV0, v0D = pc.bf.kV0; const kA = [], kD = []; for (let i = 0; i < 30; i++) { frames(1); kA.push(ec.bf.k); kD.push(pc.bf.k); }
  const pkA = Math.max(...kA), pkD = Math.max(...kD), iA = kA.indexOf(pkA), at25 = kA[Math.round(0.25 * 60) - 1], at25D = kD[Math.round(0.25 * 60) - 1];
  const anA = 1.4 * LK / (WK * E1) * R2D, anD = 1.2 * LK / (WK * E1) * R2D;
  N.kickBlock = { attackerRadS: v0A, defenderRadS: v0D, attackerPeak: +pkA.toFixed(3), defenderPeak: +pkD.toFixed(3), peakMs: Math.round((iA + 1) * 16.67), at250ms: +(at25 / pkA * 100).toFixed(1) + '%' };
  ok(tag + ': block kick is 1.4 / 1.2 rad/s (×' + LK + ')', Math.abs(v0A - 1.4 * LK) < 1e-9 && Math.abs(v0D - 1.2 * LK) < 1e-9, v0A + ' / ' + v0D);
  ok(tag + ': block kick peaks at v/(ω·e) (' + anA.toFixed(2) + '° / ' + anD.toFixed(2) + '°)', Math.abs(pkA - anA) < 0.06 * anA && Math.abs(pkD - anD) < 0.06 * anD, pkA.toFixed(3) + ' / ' + pkD.toFixed(3));
  ok(tag + ': kick peaks 30–70 ms after contact', (iA + 1) * 16.67 >= 30 && (iA + 1) * 16.67 <= 70, Math.round((iA + 1) * 16.67) + ' ms');
  ok(tag + ': kick damps under 10 % by 0.25 s', at25 / pkA < 0.1 && at25D / pkD < 0.1, (at25 / pkA * 100).toFixed(1) + '% / ' + (at25D / pkD * 100).toFixed(1) + '%');
  // every kick on High sits in the blueprint's 1.2–1.8 rad/s
  { const vs = {}; const rec = (n, o) => { frames(20); ec.bf.kV0 = pc.bf.kV0 = 0; ev(o); vs[n] = [+(o.a === P.id ? pc.bf.kV0 : ec.bf.kV0).toFixed(3), +(o.a === P.id ? ec.bf.kV0 : pc.bf.kV0).toFixed(3)]; };
    rec('hit', { type: 'hit', a: P.id, d: E.id, heavy: false }); rec('hitHeavy', { type: 'hit', a: P.id, d: E.id, heavy: true }); rec('block', { type: 'block', heavy: false }); rec('blockHeavy', { type: 'block', heavy: true });
    rec('deflect', { type: 'deflect', quality: 'good', heavy: false }); rec('perfect', { type: 'deflect', quality: 'perfect', heavy: true }); E.freeze = P.freeze = 0; G.Hold.t = 0; pc.hsT = ec.hsT = 0;
    const all = []; for (const k in vs) for (const v of vs[k]) if (v > 0) all.push(v); N.kickRadS = vs;
    ok(tag + ': all kicks within ' + (1.2 * LK).toFixed(1) + '–' + (1.8 * LK).toFixed(1) + ' rad/s', all.length >= 9 && all.every(v => v >= 1.2 * LK - 1e-6 && v <= 1.8 * LK + 1e-6), JSON.stringify(vs)); frames(30); }
  // perfect deflect: hold 0.075 s inside the 7-tick freeze, 1.8 rad/s kick, trail spike
  frames(40); E.freeze = P.freeze = 7; ev({ type: 'deflect', quality: 'perfect', heavy: false });
  const hold0 = G.Hold.t; N.holdPerfect = +hold0.toFixed(4);
  ok(tag + ': perfect deflect holds hsPerfect (0.075 s), inside the 7-tick freeze', Math.abs(hold0 - 0.075) < 1e-6 && hold0 < 7 / 60, hold0.toFixed(4));
  ok(tag + ': hold set on both fighters', Math.abs(ec.hsT - 0.075) < 1e-6 && Math.abs(pc.hsT - 0.075) < 1e-6);
  E.freeze = P.freeze = 0; const kP = [], spk = []; for (let i = 0; i < 40; i++) { frames(1); kP.push(ec.bf.k); spk.push(ec.trail.spike); }
  const pkP = Math.max(...kP), heldK = kP[2], endHold = Math.ceil(0.075 * 60), at25P = kP[endHold + 15 - 1], anP = 1.8 * LK / (WK * E1) * R2D;
  N.kickPerfect = { attackerPeak: +pkP.toFixed(3), duringHold: +heldK.toFixed(3), at250msAfterHold: +(at25P / pkP * 100).toFixed(1) + '%' };
  ok(tag + ': perfect kick peaks at 1.8 rad/s / (ω·e) ≈ ' + anP.toFixed(2) + '° on the attacker', Math.abs(pkP - anP) < 0.06 * anP, pkP.toFixed(3));
  ok(tag + ': kick barely moves during the hold (4 % speed)', heldK < 0.25 * pkP, heldK.toFixed(3));
  ok(tag + ': perfect kick under 10 % 0.25 s after the hold ends', at25P / pkP < 0.1, (at25P / pkP * 100).toFixed(1) + '%');
  // heavy hit: hold capped by the remaining freeze
  frames(40); E.freeze = P.freeze = 2; ev({ type: 'hit', a: P.id, d: E.id, heavy: true }); N.holdHeavyCapped = +G.Hold.t.toFixed(4);
  ok(tag + ': heavy hold is capped by the remaining core freeze (2 ticks → 0.033 s)', Math.abs(G.Hold.t - 2 / 60) < 1e-6, G.Hold.t.toFixed(4));
  E.freeze = P.freeze = 0; frames(30); E.freeze = P.freeze = 5; ev({ type: 'hit', a: P.id, d: E.id, heavy: true }); N.holdHeavy = +G.Hold.t.toFixed(4);
  ok(tag + ': heavy hit holds hsHeavy (0.05 s) inside the 5-tick freeze', Math.abs(G.Hold.t - 0.05) < 1e-6 && G.Hold.t < 5 / 60, G.Hold.t.toFixed(4));
  ok(tag + ': light hit has no hold', (() => { E.freeze = P.freeze = 0; frames(20); E.freeze = P.freeze = 3; ev({ type: 'hit', a: P.id, d: E.id, heavy: false }); const h = G.Hold.t; E.freeze = P.freeze = 0; return h === 0; })());
  // trail spike decay e^(-13 t) in presentation time
  pc.trail.spike = 1; pc.hsT = 0; G.Hold.t = 0; frames(6); const sp = pc.trail.spike, want = Math.exp(-13 * 6 / 60); N.spike100ms = +sp.toFixed(3);
  ok(tag + ': trail spike decays e^(-13t) (0.1 s → ' + want.toFixed(3) + ')', Math.abs(sp - want) < 0.03, sp.toFixed(3));
  // hit-reaction impulse pool: 4 preallocated slots (2 used on Low), τ = 0.216 s, no growth
  { frames(80); const S = pc.impS, ids = S ? S.slice() : [], arrs = S ? S.map(s => s.a) : [];
    ok(tag + ': impulse pool is preallocated with 4 slots', !!S && S.length === 4 && S.every(s => s.a instanceof w.Float32Array), S && S.length);
    S.forEach(s => { s.on = false; }); frames(2); const o1 = { lean: 10 }; pc.impulse(o1); const tr = []; for (let i = 0; i < 40; i++) { frames(1); tr.push(pc.off.lean); }
    const pk = Math.max(...tr), ip = tr.indexOf(pk), half = tr[ip + 9] / pk; N.impulse = { peak: +pk.toFixed(4), peakMs: Math.round((ip + 1) * 16.67), after150ms: +half.toFixed(3) };
    ok(tag + ': impulse peaks at about 40 ms with GAIN ' + (10 * 0.0246).toFixed(3) + ' rad', ip <= 3 && Math.abs(pk - 10 * 0.0246) < 0.03, pk.toFixed(4) + ' at ' + Math.round((ip + 1) * 16.67) + ' ms');
    ok(tag + ': impulse decays exponentially, half-life 0.15 s (τ = 0.216)', Math.abs(half - 0.5) < 0.04, half.toFixed(3));
    for (let i = 0; i < 7; i++) pc.impulse({ lean: 2, headX: 1 }); const live = S.filter(s => s.on).length; N.impulse.liveAfter7 = live;
    ok(tag + ': 7 rapid impulses use at most ' + (low ? 2 : 4) + ' slots', live === (low ? 2 : 4), live);
    for (let i = 0; i < 200; i++) { if (i % 3 === 0) pc.impulse(o1); frames(1); }
    ok(tag + ': pool never grows (same 4 slot objects and buffers after 200 frames of impulses)', pc.impS === S && S.length === 4 && S.every((s, i) => s === ids[i] && s.a === arrs[i]));
    // allocation growth: direct calls, gc'd heap before / after
    const ctx = { lean: 3, twist: 1 }; for (let i = 0; i < 6000; i++) { if (i % 5 === 0) pc.impulse(ctx); pc.impUpdate(1 / 60); pc.bladeFeel(1 / 60, 1 / 60, i / 60); }
    let dh = Infinity; for (let r = 0; r < 3; r++) { gc(); const h0 = process.memoryUsage().heapUsed; for (let i = 0; i < 20000; i++) { if (i % 5 === 0) pc.impulse(ctx); pc.impUpdate(1 / 60); pc.bladeFeel(1 / 60, 1 / 60, i / 60); } gc(); dh = Math.min(dh, process.memoryUsage().heapUsed - h0); }   // best of 3 rounds (JIT / jsdom noise)
    N.heapDeltaKB = +(dh / 1024).toFixed(1);
    ok(tag + ': no allocation growth over 20 000 impulse / impUpdate / bladeFeel calls (< 64 KB)', dh < 64 * 1024, (dh / 1024).toFixed(1) + ' KB');
    S.forEach(s => { s.on = false; }); frames(10); }
  // deathblow states: feel off, back in over 0.15 s; impulses suppressed
  frames(30); ec.kickBlade(1.5, new THREE.Vector3(1, 0, 0)); ec.impulse({ lean: 6 }); frames(2); const st0 = E.state; E.state = 'deathblowed'; frames(2); N.dbState = E.state + '/' + E.dead;
  ok(tag + ': feel off during deathblowed (weight 0, kick cleared)', ec.bf.w === 0 && ec.bf.k === 0, ec.bf.w + ' / ' + ec.bf.k);
  ec.impulse({ lean: 6, headX: 4 }); const onDb = ec.impS.filter(s => s.on).length; frames(4); const offDb = Math.abs(ec.off.lean) + Math.abs(ec.off.headX), onDb2 = ec.impS.filter(s => s.on).length;
  ok(tag + ': impulses suppressed during the deathblow (none accepted, live ones fade out in 80 ms)', onDb <= 1 && onDb2 === 0 && offDb < 1e-6 && ec.impW === 0, 'live ' + onDb + ' → ' + onDb2 + ', off ' + offDb.toExponential(1));
  E.state = st0; E.dead = false; E.hp = Math.max(E.hp, 50); let fr = 0; while (ec.bf.w < 1 && fr < 60) { frames(1); fr++; } N.fadeInMs = Math.round(fr * 16.67);
  ok(tag + ': feel fades back in over ~0.15 s', fr >= 8 && fr <= 11, fr + ' frames');
  ec.impulse({ lean: 2 }); ok(tag + ': impulses accepted again after the deathblow', ec.impS.some(s => s.on) && ec.impW === 1);
  // snaps: a teleport resets the spring; a big one-frame blade turn does not (the clip strings do > 50° per frame mid-swing)
  frames(30); P.x += 3; P.px = P.x; frames(1); ok(tag + ': a teleport (> 1 m in a frame) snaps the spring', pc.bf.lag * R2D < 0.5, (pc.bf.lag * R2D).toFixed(2));
  const turn = (actK) => { frames(30); const Hh = pc.bf; Hh.x.copy(Hh.T); Hh.v.set(0, 0, 0); Bo.rotateX(1.2); Bo.updateMatrixWorld(true); pc.bfAct = actK; pc.bladeFeel(1 / 60, 1 / 60, 0); const L = Hh.lag * R2D; frames(20); return L; };
  { const L = turn(0); ok(tag + ': a 69° one-frame turn is not snapped and shows the full cap (' + FULL + '°)', Math.abs(L - FULL) < 0.02, L.toFixed(2) + '°'); }
  { const L = turn(1); N.turnActive = +L.toFixed(2); ok(tag + ': the same turn in the active frames is held to the active cap (' + ACT + '°)', Math.abs(L - ACT) < 0.02, L.toFixed(2) + '°'); }
  // §8: a clip attack cut short fast-ins from the displayed pose (no pop to the procedural pose)
  if (pc.cl) { frames(30); const fi0 = pc.cl.fiN || 0; tap('KeyJ'); let k = 0; while ((pc.clipW || 0) < 0.6 && k < 30) { frames(1); k++; }
    const q0 = pc.rSh.quaternion.clone(), w0 = pc.wrist.quaternion.clone(); P.atk = null; P.setState('hit', 0.3); P.hitDir = 'F'; frames(1);
    const d1 = q0.angleTo(pc.rSh.quaternion) + w0.angleTo(pc.wrist.quaternion); frames(8); const d9 = q0.angleTo(pc.rSh.quaternion) + w0.angleTo(pc.wrist.quaternion);
    N.fastIn = { clipW: +(pc.cl.prevWA || 0).toFixed(2), firstFrameDeg: +(d1 * R2D).toFixed(2), after9Deg: +(d9 * R2D).toFixed(2), n: (pc.cl.fiN || 0) - fi0 };
    ok(tag + ': clip attack cut by a hit fast-ins from the displayed pose (first frame moves < 35 % of the way)', (pc.cl.fiN || 0) > fi0 && d1 < 0.35 * Math.max(d9, 1e-3), (d1 * R2D).toFixed(2) + '° then ' + (d9 * R2D).toFixed(2) + '°');
    frames(40); }
  else ok(tag + ': clip layer present for the fast-in check', false, 'no clip layer in this build');
  // cost: bladeFeel per call
  const t0 = process.hrtime.bigint(); for (let i = 0; i < 4000; i++) pc.bladeFeel(1 / 60, 1 / 60, i / 60); const us = Number(process.hrtime.bigint() - t0) / 1000 / 4000; N.costUs = +us.toFixed(2);
  ok(tag + ': bladeFeel costs under 20 µs a call (jsdom)', us < 20, us.toFixed(2) + ' µs');
  // 20 fps: the lag still reads on a slow machine (exact spring steps, no angle snap), active cap holds
  { let tt = 1e7, mx20 = 0, a20 = 0, v20 = 0; const f20 = n => { for (let i = 0; i < n; i++) { tt += 50; Game.frame(tt); if (P.state === 'attack') { const L = pc.bf.lag * R2D; mx20 = Math.max(mx20, L); if (pc.bfAct >= 1) { a20 = Math.max(a20, L); if (L > ACT + 1e-3) v20++; } } } };
    f20(20); mx20 = 0; for (let i = 0; i < 3; i++) { G.Input.pressed.KeyJ = true; f20(6); } f20(20); N.lag20fps = +mx20.toFixed(2); N.lag20fpsActive = +a20.toFixed(2);
    ok(tag + ': peak lag at 20 fps within 60–100 % of the full cap, active cap held', mx20 >= 0.6 * FULL && mx20 <= FULL + 1e-3 && v20 === 0, mx20.toFixed(2) + '° (active ' + a20.toFixed(2) + '°)'); }
  ok(tag + ': no page errors', H.errors.length === 0, H.errors.slice(0, 2).join(' | '));
  H.dom.window.close();
}
run('high'); run('low');
console.log(res.join('\n')); console.log(JSON.stringify(NUM));
const pass = res.filter(r => r.startsWith('PASS')).length; console.log(pass + '/' + res.length + ' blade_H2 checks passed'); process.exit(pass === res.length ? 0 : 1);
