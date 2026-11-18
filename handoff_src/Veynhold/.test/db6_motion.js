// chunk DB6: the deathblow is not "stuck to the character".
// For a world field kill (gaoler m5, Heart Pierce) and arena kills (duelist Heart Pierce, False Brother Turning Cut, warden Shoulder Drive,
// King Phase I, Kingsfall), stepped at 60 fps in jsdom with no input:
//  - no position glue: each body's displayed root == its interpolated sim position (no presentation warp), every frame
//  - step-in: the player-victim distance never jumps > 0.15 m in one frame (no snap / teleport), and Wren's root never moves > 0.15 m a frame
//  - separation: final kills are >= 2.0 m apart (centre to centre) by the unlock tick; the bodies are moving apart from Extract
//  - animation: both fighters' 15 rig joints change EVERY frame from Commit to Unlock + 0.4 s (no held static pose, also through the hit-stop
//    and the Settle hold), and no joint turns > 40 deg in one frame outside the authored Drive->Impact snap (no pose-to-pose pops)
//  - the clip layer actually drives both (DB6 session with the expected variant), the blade-clear move-cancel works (stick from 1.15 moves Wren
//    before the core unlock, velocity carried on), and lock-on leaves the corpse at blade-clear.
// usage: node .test/db6_motion.js [dist html]
const mk = require('./p1h.js'); const path = require('path'), fs = require('fs');
const FILE = process.argv[2] || path.join(__dirname, '..', 'dist', 'index.html');
const res = []; const ok = (n, c, i) => { res.push((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? ' [' + i + ']' : '')); };
const src = fs.readFileSync(path.join(__dirname, 'boss.js'), 'utf8'); const save0 = eval('(' + src.match(/const save0 = (\{[\s\S]*?chapterDone: false \})/)[1] + ')'); save0.flags.intro_odran = true;
const H = mk({ file: FILE, storage: { veynhold_save: JSON.stringify(save0), veynhold_v8: JSON.stringify({ v: 8, seenTutorial: true }) } });
const { w, G, Game, frames, key, tap } = H, A = w.VEYN_ADV, C = w.VEYN_CORE, THREE = w.THREE, DB6 = G.DB6;
const JN = ['hips', 'torso', 'head', 'lSh', 'lEl', 'lHand', 'rSh', 'rEl', 'rHand', 'lLeg', 'lKnee', 'lFoot', 'rLeg', 'rKnee', 'rFoot'];
const out = {};
function run(label, P, f, opts) { opts = opts || {}; const W = Game.world, ac = Game.chars.get(P.id), vc = Game.chars.get(f.id);
  const qa = JN.map(() => new THREE.Quaternion()), qv = JN.map(() => new THREE.Quaternion()), pa = JN.map(() => new THREE.Quaternion()), pv = JN.map(() => new THREE.Quaternion());
  const v3 = new THREE.Vector3(); const rows = []; let started = false, unlockRow = null, i0 = -1, name = null, sess = null;
  if (opts.stickAt) { /* nothing yet */ }
  tap('KeyE');
  for (let i = 0; i < 200; i++) {
    if (opts.stickAt !== undefined) { const R = W.deathblow; if (R && R.t >= opts.stickAt && !opts._down) { key('KeyD', true); opts._down = true; } }
    frames(1); const R = W.deathblow; if (R && !started) { started = true; i0 = i; } if (!started) continue;
    if (DB6.cur && !sess) { sess = DB6.cur; name = sess.name; }
    const alpha = Math.min(1, (W.acc || 0) / C.CONFIG.sim.dt);
    const pxa = P.px + (P.x - P.px) * alpha, pza = P.pz + (P.z - P.pz) * alpha, pxv = f.px + (f.x - f.px) * alpha, pzv = f.pz + (f.z - f.pz) * alpha;
    let da = 0, dv = 0, maxA = 0, maxV = 0, maxAj = '', maxVj = '';
    for (let j = 0; j < 15; j++) { const ga = ac[JN[j]], gv = vc[JN[j]]; if (ga) { qa[j].copy(ga.quaternion); if (rows.length) { const d = 2 * Math.acos(Math.min(1, Math.abs(qa[j].dot(pa[j])))) * 57.2958; da += d; if (d > maxA) { maxA = d; maxAj = JN[j]; } } pa[j].copy(qa[j]); }
      if (gv) { qv[j].copy(gv.quaternion); if (rows.length) { const d = 2 * Math.acos(Math.min(1, Math.abs(qv[j].dot(pv[j])))) * 57.2958; dv += d; if (d > maxV) { maxV = d; maxVj = JN[j]; } } pv[j].copy(qv[j]); } }
    const t = R ? R.t : null, st = P.state;
    const row = { i: i - i0, t, st, simD: Math.hypot(P.x - f.x, P.z - f.z), rootA: [ac.root.position.x, ac.root.position.z], rootV: [vc.root.position.x, vc.root.position.z],
      glueA: Math.hypot(ac.root.position.x - pxa, ac.root.position.z - pza), glueV: Math.hypot(vc.root.position.x - pxv, vc.root.position.z - pzv), da, dv, maxA, maxV, maxAj, maxVj,
      w6a: ac._db6 ? +ac._db6.w.toFixed(2) : 0, w6v: vc._db6 ? +vc._db6.w.toFixed(2) : 0, frozen: !!(P.freeze > 0 || f.freeze > 0), tau: sess ? +sess.tau.toFixed(3) : null, pv: Math.hypot(P.vx, P.vz), lock: P.lockId };
    row.visD = Math.hypot(row.rootA[0] - row.rootV[0], row.rootA[1] - row.rootV[1]);
    rows.push(row); if (st !== 'deathblowExec' && unlockRow === null && rows.length > 2) unlockRow = rows.length - 1;
    if (unlockRow !== null && rows.length - 1 - unlockRow > 30) break; }
  if (opts._down) key('KeyD', false);
  const U = unlockRow !== null ? rows[unlockRow] : null, preU = unlockRow ? rows[unlockRow - 1] : null;
  // step-in: frames whose core clock is in Commit..Drive
  let jump = 0, rootStep = 0; for (let k = 1; k < rows.length; k++) { const r = rows[k], p = rows[k - 1]; if (r.t !== null && r.t <= 0.32) jump = Math.max(jump, Math.abs(r.visD - p.visD)); if (unlockRow === null || k <= unlockRow) rootStep = Math.max(rootStep, Math.hypot(r.rootA[0] - p.rootA[0], r.rootA[1] - p.rootA[1])); }
  const glue = Math.max(...rows.map(r => Math.max(r.glueA, r.glueV)));
  const win = rows.filter((r, k) => k >= 1 && (unlockRow === null || k <= unlockRow + 24));
  const staticA = win.filter(r => r.da < 0.02).length, staticV = win.filter(r => r.dv < 0.02).length;
  // per-joint pops outside the Drive->Impact window (clip clock 0.26..0.36) and outside the blend-in frames
  const pops = win.filter(r => !(r.tau !== null && r.tau >= 0.26 && r.tau <= 0.36) && (r.maxA > 40 || r.maxV > 40)).map(r => r.i + ':' + (r.maxA > 40 ? 'A.' + r.maxAj + ' ' + r.maxA.toFixed(0) : 'V.' + r.maxVj + ' ' + r.maxV.toFixed(0)));
  const exI = rows.findIndex(r => r.t !== null && r.t >= 0.96), sepGrow = exI > 0 && U ? U.simD - rows[exI].simD : 0;
  const o = { label, name, d0: rows[0] && rows[0].simD, hold: rows.find(r => r.t !== null && r.t >= 0.6) && rows.find(r => r.t !== null && r.t >= 0.6).simD, unlockSep: U && U.simD, preUnlockSep: preU && preU.simD, jump, rootStep, glue, staticA, staticV, pops,
    clipA: Math.max(...rows.map(r => r.w6a)), clipV: Math.max(...rows.map(r => r.w6v)), sepGrow, rows: rows.length, unlockI: unlockRow, preUpv: preU && preU.pv, lockAtUnlock: U && U.lock, victimId: f.id };
  out[label] = o; o.trace = rows.map(r => [r.i, r.t === null ? null : +r.t.toFixed(3), r.tau, +r.simD.toFixed(3), +r.da.toFixed(2), +r.dv.toFixed(2), +r.maxA.toFixed(1), +r.maxV.toFixed(1), r.st.slice(0, 6)]);
  return o; }
function checks(o, exp, final) {
  ok(o.label + ': DB6 session runs the ' + exp + ' clip on both fighters', o.name === exp && o.clipA > 0.99 && o.clipV > 0.99, o.name + ' wA ' + o.clipA + ' wV ' + o.clipV);
  ok(o.label + ': no glue — both displayed roots stay on their interpolated sim positions (< 0.02 m)', o.glue < 0.02, o.glue.toFixed(4));
  ok(o.label + ': step-in never jumps the pair distance > 0.15 m in a frame', o.jump <= 0.15, o.jump.toFixed(3) + ' (d0 ' + o.d0.toFixed(2) + ' -> hold ' + (o.hold || 0).toFixed(2) + ')');
  ok(o.label + ': Wren\u2019s root never moves > 0.15 m in a frame (no teleport)', o.rootStep <= 0.15, o.rootStep.toFixed(3));
  if (final) ok(o.label + ': bodies separate >= 2.0 m by the unlock tick, growing from Extract', o.unlockSep >= 2.0 && o.sepGrow > 0.6, (o.unlockSep || 0).toFixed(3) + ' m (+' + o.sepGrow.toFixed(2) + ' from Extract)');
  else ok(o.label + ': survivor variant separates from Extract (>= 1.2 m at unlock)', o.unlockSep >= 1.2, (o.unlockSep || 0).toFixed(3));
  ok(o.label + ': both fighters animate every frame Commit -> Unlock + 0.4 s (no held static pose)', o.staticA === 0 && o.staticV === 0, 'static frames A ' + o.staticA + ' V ' + o.staticV);
  ok(o.label + ': no per-joint pop > 40\u00b0/frame outside the authored Drive->Impact snap', o.pops.length === 0, o.pops.slice(0, 6).join(', ')); }
A.BossD.enabled = true; frames(3); w.document.getElementById('advContinue').click(); frames(5);
setTimeout(() => {
  try {
    // ---- world: field gaoler m5, from 2.2 m
    { const W = Game.world, P = W.player, e = A.Ents.list.find(x => x.def.id === 'm5'), f = e.f;
      P.x = P.px = f.x; P.z = P.pz = f.z - 2.2; P.facing = 0; P.maxHp = P.hp = 1e5; A.Ents.engage(e, 'struck'); frames(2); f.brain && (f.brain.update = () => {});
      f.x = f.px = P.x; f.z = f.pz = P.z + 2.2; f.facing = Math.PI; P.lockId = f.id; C.addPosture(W, f, 1e5); frames(20);
      const o = run('world gaoler', P, f); checks(o, 'heart_pierce', true);
      ok('world gaoler: lock-on left the corpse at blade-clear', o.lockAtUnlock !== f.id, String(o.lockAtUnlock));
      frames(200); const c = Game.chars.get(f.id), BD = A.BossD; ok('world gaoler: body handed to the collapse, landed, on the floor, still there', f.dead && BD.Col.list.some(d => d.c === c && d.landed) && c.root.visible, f.dead + ''); }
    // ---- world: second gaoler, stick pushed from core 1.16: Wren walks off before the unlock
    { const W = Game.world, P = W.player, e = A.Ents.list.find(x => x.def.id === 'm6') || A.Ents.list.find(x => x.f && !x.f.dead && x.def.id !== 'm5' && x.f.team === 1), f = e && e.f;
      if (f) { P.x = P.px = f.x; P.z = P.pz = f.z - 1.6; P.facing = 0; A.Ents.engage(e, 'struck'); frames(2); f.brain && (f.brain.update = () => {}); f.x = f.px = P.x; f.z = f.pz = P.z + 1.6; f.facing = Math.PI; C.addPosture(W, f, 1e5); frames(20);
        const o = run('world stick', P, f, { stickAt: 1.16 }); const mv = o.trace.filter(r => r[1] !== null && r[1] > 1.2 && r[1] < 1.4);
        ok('world stick: from blade-clear the stick moves Wren before the core unlock, velocity carried into the unlock', o.preUpv > 1.5 && o.name, 'v before unlock ' + (o.preUpv || 0).toFixed(2) + ' m/s');
        ok('world stick: no glue / no jump with the move-cancel', o.glue < 0.02 && o.rootStep <= 0.15, o.glue.toFixed(4) + ' / ' + o.rootStep.toFixed(3)); }
      else ok('world stick: second gaoler found', false); }
    // ---- arena variants
    const arena = (enc, setup, label, exp, final) => { Game.quit(); frames(2); Game.start(enc); frames(5); const W = Game.world, P = W.player, k = W.enemies()[0]; k.brain && (k.brain.update = () => {});
      P.hp = P.maxHp = 1e5; if (setup) setup(k); k.x = k.px = P.x; k.z = k.pz = P.z + (k.profile && k.profile.boss ? 2.0 : 2.4); k.facing = Math.PI; P.facing = 0; k.hp = 1; C.addPosture(W, k, 1e4); frames(3);
      const o = run(label, P, k); checks(o, exp, final); return o; };
    arena('duelist', k => { k.marks = 1; }, 'arena duelist', 'heart_pierce', true);
    arena('brother', k => { k.marks = 1; }, 'arena brother', 'turning_cut', true);
    arena('warden', k => { k.marks = 1; }, 'arena warden', 'shoulder_drive', true);
    arena('king', k => { k.marks = 2; }, 'arena king I', 'king_phase1', false);
    arena('king', k => { k.marks = 1; k.phase = 2; }, 'arena kingsfall', 'kingsfall', true);
  } catch (e) { ok('no exception', false, e.stack); }
  ok('no page errors', H.errors.length === 0, H.errors.slice(0, 3).join(' | '));
  fs.writeFileSync(path.join(__dirname, 'db6_motion_result.json'), JSON.stringify(out));
  for (const k in out) { const o = out[k]; console.log(k, JSON.stringify(Object.assign({}, o, { trace: undefined }))); }
  for (const r of res) console.log(r); console.log(res.filter(r => r.startsWith('PASS')).length + '/' + res.length + ' db6_motion checks passed'); process.exit(0);
}, 50);
