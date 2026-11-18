// chunk G1: the full deathblow sequence in jsdom (procedural rig), real key events for parry and E.
// A gaoler swings overheads (d_over); the player parries each one (normal posture accumulation, no forced break) until the parry that breaks
// posture -> standing stagger, sword arm up -> E prompt within 300 ms -> step-in, seam thrust (110 ms hit-stop), drive, settle, pull-out, extract -> collapse:
// the body ends on the floor (+-0.05 m) and is still there, still down, 10 s later.
// chunk H1 (updated on purpose, retargeted to blueprint v3 §7): the phase clock (wall since E, paused in every hit-stop): impact 0.30-0.34 with a
// ~0.10 s hit-stop during which the phase clock stands still, pull-out at extract 0.95, blade-clear hand-off 1.15 with launch velocity 0.9-1.3 m/s
// plus a slight lift, the body moving from clear on (never hanging until the unlock), control back at 1.40 clock = ~1.50 s WALL (INT5: I1 core), the player moving while
// the camera still blends out, letterbox and presentation done by ~2.25 s wall; landing away from the finisher camera; no pop at the hand-off.
// Then pause mid-finisher (another gaoler) and quit-to-title mid-finisher: letterbox and presentation state cleared.
const mk = require('./p1h.js'); const path = require('path');
const FILE = path.join(__dirname, '..', 'dist', 'index.html');
const src = require('fs').readFileSync(path.join(__dirname, 'boss.js'), 'utf8'); const save0 = eval('(' + src.match(/const save0 = (\{[\s\S]*?chapterDone: false \})/)[1] + ')'); save0.flags.intro_odran = true;
const res = []; const ok = (n, c, i) => { res.push((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? ' [' + i + ']' : '')); };
const H = mk({ file: FILE, storage: { veynhold_save: JSON.stringify(save0), veynhold_v8: JSON.stringify({ v: 8, seenTutorial: true }) } });
const { w, G, Game, frames, key } = H, A = w.VEYN_ADV, C = w.VEYN_CORE, THREE = w.THREE; A.BossD.enabled = true; frames(3); w.document.getElementById('advContinue').click(); frames(5);
setTimeout(() => {
  const W = Game.world, P = W.player, BD = A.BossD, e = A.Ents.list.find(x => x.def.id === 'm5'), f = e.f, c = Game.chars.get(f.id), $ = id => w.document.getElementById(id);
  P.x = P.px = f.x; P.z = P.pz = f.z - 2.0; P.maxHp = P.hp = 1e5; A.Ents.engage(e, 'struck'); frames(2); f.brain && (f.brain.update = () => {});
  // ---- parry overheads until posture breaks
  let parries = 0, brokeOn = null, guard = 0, promptAt = null, reel = null;
  while (f.state !== 'broken' && guard++ < 12) {
    for (let i = 0; i < 200 && !(f.canAct && f.canAct() && f.state !== 'hit'); i++) frames(1);
    f.x = f.px = P.x; f.z = f.pz = P.z + 2.0; f.facing = f.pfacing = Math.PI; P.facing = 0; G.Cam.yaw = 0; P.posture = 0; f.lastPostureHit = f.lt; frames(1);
    C.startAttack(W, f, 'd_over', { jitter: false }); const su = f.atk.su, t0 = W.time; let pressed = false;
    frames(70, () => { if (!pressed && W.time >= t0 + su - 0.08) { key('KeyF', true); pressed = true; } if (f.state === 'broken' && !brokeOn) brokeOn = { t: W.time, n: parries + 1 }; if (brokeOn && promptAt === null && $('dbHint').style.display === 'block') promptAt = W.time - brokeOn.t;
      if (brokeOn && !reel && W.time - brokeOn.t > 0.3) reel = { hipY: c.pose.hipY, rSx: c.pose.rSx }; }); key('KeyF', false);
    if (P.lastDefense && P.lastDefense.result === 'deflect') parries++; if (f.state === 'broken' || brokeOn) break; frames(10); }
  ok('each overhead was deflected; posture broke only after several (normal accumulation, ' + parries + ' parries)', parries >= 2 && !!brokeOn && brokeOn.n === parries, JSON.stringify(brokeOn) + ' parries=' + parries);
  ok('the breaking parry leads straight into the posture break (state broken, deathblowable)', f.state === 'broken' && f.deathblowable, f.state);
  // ---- stagger + prompt
  const tb = brokeOn ? brokeOn.t : W.time;
  for (let i = 0; i < 40; i++) { frames(1); if (promptAt === null && $('dbHint').style.display === 'block') promptAt = W.time - tb; if (!reel && W.time - tb > 0.3) reel = { hipY: c.pose.hipY, rSx: c.pose.rSx }; }
  ok('E prompt appears within 300 ms of the break', promptAt !== null && promptAt <= 0.3, promptAt);
  ok('standing stagger with the sword arm raised (no kneel)', !!reel && reel.hipY > -0.3 && reel.rSx < -1.2, JSON.stringify(reel));
  ok('E prompt pops in (vhPop)', $('dbHint').classList.contains('vhPop'));
  // ---- E: step-in, thrust, hold, pull (phase clock F.real, wall clock F.wall)
  let impWall = null, pkMin = 9, pkAfter = 0, pkPre = 9; let F = null, impReal = null, ripReal = null, hsMax = 0, stepD = null, handReal = null, handWall = null, ctlWall = null, ctlReal = null, camAt = null, hip0 = null, maxJump = 0, prevHip = null, hsR = null;
  const ax0 = Game.chars.get(P.id).root.position.clone(), hv = new THREE.Vector3(), lb = () => $('lbox') && $('lbox').classList.contains('on'), sp = [];
  BD.onPost = (FF, st) => { F = FF; if (FF.impReal >= 0 && impReal === null) { impReal = FF.impReal; impWall = FF.wall; } { const k = w.VEYN_GAME.PresSlow.k; if (FF.real > FF.ph.settle && FF.real < FF.ph.extract) pkMin = Math.min(pkMin, k); if (FF.real >= FF.ph.clear + 0.02) pkAfter = Math.max(pkAfter, k); if (W.deathblow && W.deathblow.v === f && W.deathblow.t < FF.ph.impact) pkPre = Math.min(pkPre, k); } if (FF.ripReal >= 0 && ripReal === null) ripReal = FF.ripReal; hsMax = Math.max(hsMax, FF.hs);
    if (FF.hs > 0) { if (!hsR) hsR = { r0: FF.real, r1: FF.real, w0: FF.wall, w1: FF.wall }; hsR.r1 = FF.real; hsR.w1 = FF.wall; }
    if (stepD === null && FF.imp) stepD = Game.chars.get(P.id).root.position.distanceTo(ax0);
    if (handReal === null && BD.Col.list.some(x => x.c === c)) { handReal = FF.real; handWall = FF.wall; camAt = w.VEYN_GAME.camera.position.clone(); }
    if (ctlWall === null && P.state !== 'deathblowExec') { ctlWall = FF.wall; ctlReal = FF.real; } };
  const hipTrack = () => { c.hips.getWorldPosition(hv); if (!hip0) hip0 = hv.clone(); if (prevHip && F && F.real > F.ph.extract && F.real < F.ph.clear + 0.4) maxJump = Math.max(maxJump, Math.abs(hv.y - prevHip.y));
    if (prevHip && F && handReal !== null && ctlWall === null) sp.push(Math.hypot(hv.x - prevHip.x, hv.z - prevHip.z) * 60); prevHip = (prevHip || new THREE.Vector3()).copy(hv);
    if (F) { const ah = new THREE.Vector3(); Game.chars.get(P.id).hips.getWorldPosition(ah); trk.push({ v: hv.clone(), a: ah, cam: w.VEYN_GAME.camera.position.clone(), dir: w.VEYN_GAME.camera.getWorldDirection(new THREE.Vector3()), r: F.real, ho: handReal !== null, ul: ctlWall !== null }); } };
  const trk = [];
  // pop = the jump in per-frame motion (second difference) across a hand-off; smooth motion at ~1 m/s gives ~0.001 m
  const pop = (key, flag) => { const i = trk.findIndex(x => x[flag]); if (i < 2) return null; let m = 0; for (let j = Math.max(2, i - 2); j <= Math.min(trk.length - 1, i + 3); j++) { const p0 = trk[j - 2][key], p1 = trk[j - 1][key], p2 = trk[j][key];
    m = Math.max(m, Math.hypot(p2.x - 2 * p1.x + p0.x, p2.y - 2 * p1.y + p0.y, p2.z - 2 * p1.z + p0.z)); } return m; };
  G.Input.pressed.KeyE = true; for (let i = 0; i < 300 && (ripReal === null || handReal === null || ctlWall === null); i++) { frames(1); hipTrack(); }
  const PH = F && F.ph;
  ok('deathblow started: seam thrust', !!F && F.kind === 'stab' && ['gut', 'armpit', 'neck'].includes(F.seam), F && F.seam);
  ok('phase table (blueprint v3 §7, INT5 core clock): drive 0.28, impact 0.32, settle 0.55, extract 0.95, clear 1.15, unlock 1.40 clock (= 1.50 wall with the 0.10 s core hit-stop) / end 2.25 wall', !!PH && PH.drive === 0.28 && PH.impact === 0.32 && PH.settle === 0.55 && PH.extract === 0.95 && PH.clear === 1.15 && PH.unlock === 1.4 && Math.abs(PH.unlockW - 1.5) < 1e-9 && PH.endW === 2.25, PH && JSON.stringify(PH));
  { const B = BD.BLEND; ok('phase entry blends: commit 0.12, drive 0.08, settle 0.14, extract 0.11, collapse 0.18', B.commit === 0.12 && B.drive === 0.08 && B.settle === 0.14 && B.extract === 0.11 && B.collapse === 0.18 && BD.COL.COL_TR[1][0] === 0.18, JSON.stringify(B)); }
  ok('impact (the point goes in) at 0.30-0.34 on the phase clock', impReal !== null && impReal >= 0.30 && impReal <= 0.34, impReal);
  // INT5 Tier A: the core schedule runs on unscaled time (no sim slow-mo), so the impact lands at ~0.32 s WALL; the slow-mo is presentation only
  ok('INT5 Tier A: impact lands at 0.30-0.35 s wall (was ~0.85 s under Cine.slow)', impWall !== null && impWall >= 0.30 && impWall <= 0.35, impWall && impWall.toFixed(3));
  ok('INT5 Tier A: presentation slow-mo only after the impact (k 1 before, 0.35-0.45 through the hold, back to 1 after blade-clear)', pkPre === 1 && pkMin >= 0.35 && pkMin <= 0.45 && pkAfter === 1, pkPre + ' / ' + pkMin.toFixed(2) + ' / ' + pkAfter);
  ok('~0.10 s hit-stop on the impact', Math.abs(hsMax - 0.10) < 0.02, hsMax);
  ok('the phase clock stands still through the hit-stop (wall runs on)', !!hsR && hsR.r1 - hsR.r0 < 0.005 && hsR.w1 - hsR.w0 >= 0.06, hsR && JSON.stringify({ dr: +(hsR.r1 - hsR.r0).toFixed(3), dw: +(hsR.w1 - hsR.w0).toFixed(3) }));
  ok('the attacker stepped in (visual root moved)', stepD !== null && stepD > 0.1, stepD && stepD.toFixed(2));
  ok('pull-out (the rip) at extract 0.95 +- 0.03', ripReal !== null && Math.abs(ripReal - 0.95) <= 0.03, ripReal);
  ok('collapse hand-off at blade-clear 1.15 +- 0.03', handReal !== null && Math.abs(handReal - 1.15) <= 0.03, handReal + ' (wall ' + (handWall && handWall.toFixed(3)) + ')');
  ok('control back at 1.40 on the deathblow clock = 1.45-1.55 s wall (INT5: I1 core unlock + its 0.10 s impact hit-stop, no sim slow-mo)', ctlWall !== null && ctlWall >= 1.45 && ctlWall <= 1.55 && ctlReal !== null && Math.abs(ctlReal - 1.40) <= 0.02, ctlWall && ctlWall.toFixed(3) + ' wall / ' + (ctlReal && ctlReal.toFixed(3)) + ' clock');
  { const ce0 = BD.Col.list.find(x => x.c === c); ok('launch at clear: 0.9-1.3 m/s along E plus a slight upward component', !!ce0 && ce0.v0 >= 0.9 && ce0.v0 <= 1.3 && !!ce0.E && ce0.vy0 > 0 && ce0.vy0 < 1, ce0 && ce0.v0 + ' up ' + ce0.vy0); }
  { const s1 = sp.slice(1); ok('the body moves from clear to the unlock, never hangs (hips >= 0.3 m/s every frame)', s1.length >= 5 && Math.min(...s1) >= 0.3, s1.length + ' frames, min ' + (s1.length ? Math.min(...s1).toFixed(2) : '-')); }
  ok('no pop through the pull-out and hand-off (hips move < 0.06 m per frame)', maxJump < 0.06, maxJump.toFixed(3));
  // after the unlock: Wren moves while the presentation (camera blend-out, letterbox) is still running; it all ends by ~2.25 s wall
  { const pz0 = P.z; let still = null, lbMid = null; for (let i = 0; i < 6; i++) { frames(1); hipTrack(); } key('KeyS', true); for (let i = 0; i < 20; i++) { frames(1); hipTrack(); if (i === 2) still = !!BD.Fin.cur; } key('KeyS', false); lbMid = lb();
    ok('Wren can move right after the unlock while the finisher presentation still runs', Math.abs(P.z - pz0) > 0.05 && still === true, (P.z - pz0).toFixed(2) + ' presentation ' + still); 
    let lbOff = null, curOff = null; for (let i = 0; i < 90 && (lbOff === null || curOff === null); i++) { frames(1); const Fx = BD.Fin.last; if (lbOff === null && !lb()) lbOff = Fx.wall; if (curOff === null && !BD.Fin.cur) curOff = Fx.wall; }
    ok('letterbox held past the unlock, off at ~2.25 s wall', lbMid === true && lbOff !== null && lbOff >= 2.1 && lbOff <= 2.4, lbMid + ' off at ' + (lbOff && lbOff.toFixed(3)));
    ok('finisher presentation ends at ~2.25 s wall', curOff !== null && curOff >= 2.1 && curOff <= 2.4, curOff && curOff.toFixed(3)); }
  { const p1 = pop('v', 'ho'), p2 = pop('a', 'ul'), p3 = pop('v', 'ul');
    ok('no pose pop at the hand-offs (< 0.01 m jump in per-frame hips motion): body at blade-clear, Wren and the body at the unlock', p1 !== null && p2 !== null && p3 !== null && p1 < 0.01 && p2 < 0.01 && p3 < 0.01, [p1, p2, p3].map(x => x === null ? '-' : x.toFixed(4)).join(' / ')); }
  { let m = 0; for (let j = 2; j < trk.length; j++) { const p0 = trk[j - 2].cam, p1 = trk[j - 1].cam, p2 = trk[j].cam; if (trk[j - 2].r > 0) m = Math.max(m, Math.hypot(p2.x - 2 * p1.x + p0.x, p2.y - 2 * p1.y + p0.y, p2.z - 2 * p1.z + p0.z)); }
    if (process.env.DBG) for (let j = 2; j < trk.length; j++) { const p0 = trk[j - 2].cam, p1 = trk[j - 1].cam, p2 = trk[j].cam; console.log('CAM', j, trk[j].r.toFixed(3), Math.hypot(p2.x - 2 * p1.x + p0.x, p2.y - 2 * p1.y + p0.y, p2.z - 2 * p1.z + p0.z).toFixed(4), (() => { const d0 = trk[j - 2].dir, d1 = trk[j - 1].dir, d2 = trk[j].dir; return Math.hypot(d2.x - 2 * d1.x + d0.x, d2.y - 2 * d1.y + d0.y, d2.z - 2 * d1.z + d0.z).toFixed(4); })(), p2.toArray().map(x => x.toFixed(2)).join(',')); }
    let md = 0; for (let j = 2; j < trk.length; j++) { const p0 = trk[j - 2].dir, p1 = trk[j - 1].dir, p2 = trk[j].dir; if (trk[j - 2].r > 0) md = Math.max(md, Math.hypot(p2.x - 2 * p1.x + p0.x, p2.y - 2 * p1.y + p0.y, p2.z - 2 * p1.z + p0.z)); }
    ok('steady camera through the finisher after the cut on E (no frame jolt: per-frame camera motion changes < 0.03 m, aim < 0.02 rad)', m < 0.03 && md < 0.02, m.toFixed(4) + ' m / ' + md.toFixed(4) + ' rad'); }
  // ---- collapse
  for (let i = 0; i < 60 * 2; i++) frames(1); const gy = c.gy || 0;
  const lowest = () => { c.root.updateMatrixWorld(true); const bb = new THREE.Box3(), tb2 = new THREE.Box3(); let first = true;
    c.rig.traverse(o => { if (!o.isMesh || !o.visible) return; for (let q = o; q; q = q.parent) if (q === c.wrist) return;   // chunk H1: exact lowest vertex (a rotated box's AABB over-reports a tilted hat brim by ~0.1 m)
      const E = o.matrixWorld.elements, Pp = o.geometry.attributes.position.array; for (let i = 0; i < Pp.length; i += 3) { const y = E[1] * Pp[i] + E[5] * Pp[i + 1] + E[9] * Pp[i + 2] + E[13]; if (first || y < bb.min.y) { bb.min.y = y; first = false; } } });
    if (c.model && c.model.root) { /* skinned body follows the rig */ } return first ? null : bb.min.y; };
  const ce = () => BD.Col.list.find(x => x.c === c);
  // chunk DB6: the deathblow clip lays the body down in joint space (the rig stays level by design, no rig tip), so "fallen" is also read off the
  // torso's actual tilt from vertical; the old rig-rotation reading assumed the collapse tipped the whole rig
  const lie = () => { const q = new THREE.Quaternion(); c.torso.getWorldQuaternion(q); const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    return Math.max(Math.abs(c.rig.rotation.x), Math.abs(c.rig.rotation.z), Math.acos(Math.max(-1, Math.min(1, up.y)))); };
  const y1 = lowest(), h1 = new THREE.Vector3(); c.hips.getWorldPosition(h1);
  ok('foe died', f.dead);
  ok('body fell over and landed (rig or torso tilted > 1.2 rad, landed)', !!ce() && ce().landed && lie() > 1.2, lie().toFixed(2));
  ok('body at the floor: lowest mesh point within +-0.05 m of the ground', y1 !== null && Math.abs(y1 - gy) <= 0.05, y1 !== null && (y1 - gy).toFixed(3));
  ok('lying low (hips under 0.45 m)', h1.y - gy < 0.45, (h1.y - gy).toFixed(2));
  // settled, not propped: the pelvis / torso rest on the floor, and every limb lies down too (lowest vertex of each part above the floor)
  const partLow = () => { c.root.updateMatrixWorld(true); const NM = ['head', 'lHand', 'rHand', 'lEl', 'rEl', 'lSh', 'rSh', 'lFoot', 'rFoot', 'lKnee', 'rKnee', 'lLeg', 'rLeg', 'torso', 'hips'], out = {};
    c.rig.traverse(o => { if (!o.isMesh || !o.visible) return; let nm = null; for (let q = o; q && !nm; q = q.parent) { if (q === c.wrist) return; for (const n of NM) if (c[n] === q) { nm = n; break; } } if (!nm) return;
      const g = { lHand: 'lArm', lEl: 'lArm', lSh: 'lArm', rHand: 'rArm', rEl: 'rArm', rSh: 'rArm', lFoot: 'lLeg', lKnee: 'lLeg', lLeg: 'lLeg', rFoot: 'rLeg', rKnee: 'rLeg', rLeg: 'rLeg', torso: 'body', hips: 'body', head: 'head' }[nm];
      const E = o.matrixWorld.elements, Pp = o.geometry.attributes.position.array; for (let i = 0; i < Pp.length; i += 3) { const y = E[1] * Pp[i] + E[5] * Pp[i + 1] + E[9] * Pp[i + 2] + E[13] - gy; if (out[g] === undefined || y < out[g]) out[g] = y; } });
    return out; };
  { const L = partLow(), f = x => x === undefined ? '-' : x.toFixed(3);
    ok('hips settle on the floor (pelvis / torso lowest point within 0.04 m of the ground)', L.body !== undefined && L.body <= 0.04, 'body ' + f(L.body));
    ok('no floating or propped limbs (each arm, leg and the head comes down within 0.12 m of the ground)', ['lArm', 'rArm', 'lLeg', 'rLeg', 'head'].every(k => L[k] !== undefined && L[k] <= 0.12), ['lArm', 'rArm', 'lLeg', 'rLeg', 'head'].map(k => k + ' ' + f(L[k])).join(', ')); }
  { const tx = hip0.x - camAt.x, tz = hip0.z - camAt.z, tl = Math.hypot(tx, tz) || 1, mv = ((h1.x - hip0.x) * tx + (h1.z - hip0.z) * tz) / tl;
    ok('landed away from the finisher camera (hips moved > 0.3 m along camera -> victim)', mv > 0.3, mv.toFixed(2)); }
  ok('visible, no ash fade', c.root.visible && !c._fade);
  frames(60 * 10); const y2 = lowest();
  ok('10 s later: body still present, visible, still down at the floor', !!c.root.parent && c.root.visible && !!ce() && lie() > 1.2 && y2 !== null && Math.abs(y2 - gy) <= 0.05, (y2 - gy).toFixed(3) + ' lie=' + lie().toFixed(2));
  ok('corpse blood pool persists', !!w.VEYN_GAME.V7.VFX.stains.some(q => q.m.visible && q.life > 1e5));
  // ---- pause and quit-to-title in the middle of a finisher clear the letterbox and the presentation
  const midFin = id => { const e2 = A.Ents.list.find(x => x.def.id === id); if (!e2 || !e2.f || e2.f.dead) return null; const f2 = e2.f;
    P.x = P.px = f2.x; P.z = P.pz = f2.z - 2.0; A.Ents.engage(e2, 'struck'); f2.brain && (f2.brain.update = () => {}); f2.atk = null; f2.facing = f2.pfacing = Math.PI; P.facing = 0; G.Cam.yaw = 0; frames(2);
    C.addPosture(W, f2, 1e5); frames(20); if (W.deathblowCandidate(P) === f2) W.startDeathblow(P, f2); for (let i = 0; i < 120 && !(BD.Fin.cur && BD.Fin.cur.v === f2 && BD.Fin.cur.real > 0.6); i++) frames(1);
    if (process.env.DBG) console.log('MID', id, f2.state, f2.dead, Math.hypot(P.x - f2.x, P.z - f2.z).toFixed(2), P.state, BD.Fin.cur && BD.Fin.cur.v === f2, f2.deathblowable, W.deathblowCandidate(P) && W.deathblowCandidate(P).id, f2.id);
    return BD.Fin.cur && BD.Fin.cur.v === f2 ? f2 : null; };
  { const f2 = midFin('m6'); const c2 = f2 && Game.chars.get(f2.id), lbOn = lb(); Game.pause();
    ok('pause mid-finisher: letterbox off, finisher presentation cleared, body rig reset', !!f2 && lbOn && !lb() && !BD.Fin.cur && c2.rig.position.x === 0 && c2.rig.rotation.z === 0, !!f2 + ' ' + lbOn + ' ' + lb() + ' ' + !!BD.Fin.cur);
    Game.resume(); for (let i = 0; i < 60 * 3; i++) frames(1); ok('…and after resuming the core deathblow still finishes (foe dead, collapse took the body)', !!f2 && f2.dead && !!BD.Col.list.find(x => x.c === c2), f2 && f2.state); }
  { const f3 = midFin('m2'); const lbOn = lb(); Game.quit();
    ok('quit to title mid-finisher: letterbox off, finisher presentation cleared', !!f3 && lbOn && !lb() && !BD.Fin.cur && !w.VEYN_GAME.P1.Finale.active, !!f3 + ' ' + lbOn + ' ' + lb()); }
  ok('no page errors', H.errors.length === 0, H.errors.slice(0, 2).join(' | '));
  console.log(res.join('\n')); const pass = res.filter(r => r.startsWith('PASS')).length; console.log(pass + '/' + res.length + ' deathblow_seq checks passed'); H.dom.window.close(); process.exit(pass === res.length ? 0 : 1);
}, 250);
