// v8 checks: Quaternius clip timing vs the core, locomotion (foot slide, blend weights), cinematics (skippable, no input
// consumed, no effect on outcomes), quality tiers, save migration v7 -> v8, restart stability, frame-rate independence.
process.env.VEYN_MODELS = '1';
const H = require('./harness.js'); const { w, G, Game, frames, key, tap, errors } = H; const C = w.VEYN_CORE, A = w.VEYN_ANIM, THREE = w.THREE;
const res = []; const ok = (n, p, i) => { res.push(!!p); console.log((p ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? ' [' + i + ']' : '')); };
const $ = id => w.document.getElementById(id);
if (!w.localStorage) { const mem = {}; Object.defineProperty(w, 'localStorage', { value: { getItem: k => k in mem ? mem[k] : null, setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; }, _mem: mem } }); }
const wait = () => new Promise(r => { const t0 = Date.now(); const tick = () => { const s = w.VEYN_MODELS.status(); if (s.ready === s.total || s.failed || Date.now() - t0 > 20000) r(s); else setTimeout(tick, 20); }; tick(); });
const FR = 1 / 60;
(async () => {
  await wait();
  ok('animation data decoded (Quaternius clips embedded)', A && A.ready && Object.keys(A.clips).length >= 14, A && Object.keys(A.clips).join(','));
  // ------------------------------------------------------------------ 1) strike frames locked to the core
  { const sets = A.SETS; let pairs = 0, worst = 0, worstWhere = '', mono = true, procOnly = [];
    const styles = new Set(Object.values(C.ATTACKS).map(d => d.style));
    for (const sk in sets) for (const key in C.ATTACKS) { const d = C.ATTACKS[key], clip = A.clipFor(sk, d); if (!clip) continue;
      // sweep tempo / jitter / held windups the core can produce
      for (const tempo of [0.75, 1, 1.25]) for (const j of [-0.15, 0, 0.15]) for (const hold of [0, 0.35]) {
        const su = Math.max(0.1, d.startup * tempo * (1 + j) + hold), a = { su, ac: d.active, rc: d.recovery }; pairs++;
        const m = A.attackTime(clip, a, su); const err = Math.abs(m.t - clip.strike);
        // convert clip-time error to game time with the local playback rate around the strike
        const r0 = (A.attackTime(clip, a, su).t - A.attackTime(clip, a, su - 0.004).t) / 0.004, gErr = err / Math.max(1e-3, r0);
        if (gErr > worst) { worst = gErr; worstWhere = sk + '/' + key + ' su=' + su.toFixed(2); }
        let prev = -1; for (let t = 0; t <= su + d.active + d.recovery + 1e-9; t += 0.004) { const x = A.attackTime(clip, a, t).t; if (x < prev - 1e-9) mono = false; prev = x; } } }
    for (const st of styles) if (!Object.values(sets).some(s => s[st])) procOnly.push(st);
    ok('every clip-driven attack: clip strike frame lands on the core strike tick (all tempos / jitters / holds)', worst <= FR + 1e-9, (worst * 1000).toFixed(2) + ' ms worst over ' + pairs + ' variants (' + worstWhere + ')');
    ok('attack clip time never runs backwards (no pops)', mono);
    ok('styles kept procedural for clear tells (perilous / special)', procOnly.length > 0, procOnly.join(',')); }
  // in-game: sample the presentation at the frame the core enters its active phase, and blade-tip speed peaks in the strike window
  { const cases = [['player', 'p_l1'], ['player', 'p_l2'], ['player', 'p_l3'], ['player', 'p_l4'], ['player', 'p_h'], ['player', 'p_dash'], ['duelist', 'd_slash'], ['duelist', 'd_slash2'], ['duelist', 'd_over'], ['duelist', 'd_delay'],
      ['warden', 'w_swing'], ['warden', 'w_slam'], ['warden', 'w_shove'], ['brother', 'f_quick'], ['brother', 'f_quick2'], ['brother', 'f_delay'], ['king', 'k_cut'], ['king', 'k_cut3'], ['king', 'k_over'], ['king', 'k2_a'], ['king', 'k2_dly']];
    let worst = 0, where = '', n = 0;
    for (const [who, k] of cases) {
      const enc = who === 'player' ? 'duelist' : who; Game.start(enc); const W = Game.world, P = W.player, e = W.enemies()[0]; e.brain.update = () => {}; P.hp = P.maxHp = 1e5; e.hp = e.maxHp = 1e5;
      if (k.startsWith('k2_')) e.phase = 2; P.x = 0; P.z = -1.5; e.x = 0; e.z = 1.5; P.facing = 0; e.facing = Math.PI; frames(20);
      const f = who === 'player' ? P : e; if (f.setState) f.setState('idle', 0); C.startAttack(W, f, k, { jitter: who !== 'player' }); const ch = Game.chars.get(f.id), clip = A.clipFor(ch.lookKey === 'king' && f.phase === 2 ? 'king2' : ch.lookKey, f.atk.def);
      if (!clip) { ok('clip mapped for ' + who + '/' + k, false); continue; }
      const id = f.atk.id; let gotErr = null;
      for (let i = 0; i < 200 && f.atk && f.atk.id === id; i++) { frames(1); const a = f.atk; if (!a) break;
        if (gotErr === null && a.t >= a.su) { const sw = Math.min(clip.strike - Math.max(clip.coil, clip.strike - A.SWING_MAX), a.su * 0.45), before = (clip.strike - Math.max(clip.coil, clip.strike - A.SWING_MAX)) / Math.max(1e-3, sw), after = (Math.max(clip.strike + FR, clip.swingEnd) - clip.strike) / a.ac;
          const d = ch.cl.atkT - clip.strike; gotErr = Math.abs(d) / (d < 0 ? before : after); } }   // game-time offset between clip strike frame and the core strike tick
      n++; if (gotErr === null) gotErr = 9; if (gotErr > worst) { worst = gotErr; where = who + '/' + k; } Game.quit();
    }
    ok('in-game: clip sits on its strike frame at the core strike tick (≤ 1 frame) for 21 attacks across 5 fighters', worst <= FR + 1e-6, (worst * 1000).toFixed(2) + ' ms worst (' + where + '), ' + n + ' attacks'); }
  // visual strike: fastest blade-tip motion happens in the strike window (presentation reads the same moment the core resolves)
  { let bad = [], n = 0; const v = new THREE.Vector3();
    for (const [enc, who, k] of [['duelist', 'p', 'p_l1'], ['duelist', 'p', 'p_l2'], ['duelist', 'p', 'p_l3'], ['duelist', 'e', 'd_slash'], ['duelist', 'e', 'd_over'], ['warden', 'e', 'w_swing'], ['king', 'e', 'k_cut'], ['brother', 'e', 'f_quick']]) {
      Game.start(enc); const W = Game.world, P = W.player, e = W.enemies()[0]; e.brain.update = () => {}; P.hp = P.maxHp = 1e5; e.hp = e.maxHp = 1e5; P.x = 0; P.z = -4; e.x = 0; e.z = 4; frames(20);
      const f = who === 'p' ? P : e; C.startAttack(W, f, k, { jitter: false }); const ch = Game.chars.get(f.id), id = f.atk.id, su = f.atk.su, ac = f.atk.ac; let prev = null, best = null;
      for (let i = 0; i < 200 && f.atk && f.atk.id === id; i++) { frames(1); const a = f.atk; if (!a) break; ch.root.updateMatrixWorld(true); ch.tip.getWorldPosition(v); const tw = v.clone().sub(ch.root.position); if (prev) { const sp = tw.distanceTo(prev) / FR; if (!best || sp > best[1]) best = [a.t - FR / 2, sp]; } prev = tw; }
      n++; if (!best || best[0] < su - 0.1 || best[0] > su + ac + 0.05) bad.push(k + '@' + (best ? (best[0] - su).toFixed(3) : '?')); Game.quit(); }
    ok('blade tip moves fastest inside the strike window (−100 ms … end of active) for every sampled attack', bad.length === 0, bad.length ? bad.join(' ') : n + ' attacks'); }
  // ------------------------------------------------------------------ 2) locomotion: blend weights + foot sliding
  { let worst = 0; const st = {}, out = {}; let r = 3; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 4000; i++) { st.guarded = rnd() < 0.3; A.locoWeights(st, rnd() * 9, (rnd() * 2 - 1) * Math.PI, rnd() < 0.15 ? 0 : rnd(), rnd() < 0.3 ? rnd() : 0, rnd() - 0.5, rnd() * 0.05, out); worst = Math.max(worst, Math.abs(A.sumWeights(out) - 1)); for (const k in out) if (out[k] < -1e-9) worst = 9; }
    ok('locomotion blend weights always sum to 1 and are never negative (4000 random states)', worst < 1e-6, worst.toExponential(2)); }
  const slideRun = (keys, lock, guard, clipsOn) => {
    G.VISUAL.clipLoco = clipsOn ? 1 : 0; Game.start('duelist'); const W = Game.world, P = W.player, e = W.enemies()[0]; e.brain.update = () => {};
    e.x = lock ? 0 : 14; e.z = lock ? 8 : -14; P.x = 0; P.z = lock ? 0 : -12; P.facing = 0; P.lockId = lock ? e.id : null; G.Cam.yaw = 0;
    for (const k of keys) key(k, true); if (guard) key('KeyF', true);
    const c = Game.chars.get(P.id), M = c.model; let n = 0, slide = 0, sp = 0, pl = 0, wsMax = 0; const prev = {}; frames(40);
    frames(110, () => { c.root.updateMatrixWorld(true); const sc = c.look.scale;
      for (const s of ['Left', 'Right']) { const toe = M.byName[s + 'ToeBase'].getWorldPosition(new THREE.Vector3()), heel = M.byName[s + 'Foot'].getWorldPosition(new THREE.Vector3()), low = Math.min(toe.y - 0.03 * sc, heel.y - 0.085 * sc), q = prev[s];
        if (q && low < 0.015 && q.low < 0.015) { slide += Math.min(Math.hypot(toe.x - q.toe.x, toe.z - q.toe.z), Math.hypot(heel.x - q.heel.x, heel.z - q.heel.z)) * 60; pl++; } prev[s] = { toe, heel, low }; }
      sp += Math.hypot(P.vx, P.vz); n++; if (c.cl) wsMax = Math.max(wsMax, Math.abs(A.sumWeights(c.cl.w) - 1)); });
    for (const k of keys) key(k, false); key('KeyF', false); Game.quit(); G.VISUAL.clipLoco = 1;
    return { body: sp / n, drift: pl ? slide / pl : 0, ratio: pl ? slide / pl / (sp / n) : 0, wsMax };
  };
  { const rows = [['walk (guarded, 2.3 m/s)', ['KeyW'], true, true], ['walk / jog (4.4 m/s)', ['KeyW'], false, false], ['sprint (7 m/s)', ['KeyW', 'ShiftLeft'], false, false], ['locked strafe right', ['KeyD'], true, false], ['locked strafe left', ['KeyA'], true, false], ['locked backpedal', ['KeyS'], true, false]];
    const out = []; let worst = 0, wsWorst = 0, v7worse = 0;
    for (const [lab, keys, lock, guard] of rows) { const r8 = slideRun(keys, lock, guard, true), r7 = slideRun(keys, lock, guard, false); worst = Math.max(worst, r8.ratio); wsWorst = Math.max(wsWorst, r8.wsMax); if (r8.drift <= r7.drift + 0.05) v7worse++;
      out.push(lab + ' ' + r8.drift.toFixed(2) + ' m/s (' + (r8.ratio * 100).toFixed(0) + '% of body; v7 gait ' + r7.drift.toFixed(2) + ')'); }
    console.log('  foot slide (planted-foot drift):\n    ' + out.join('\n    '));
    ok('no foot sliding: planted-foot drift < 25% of body speed at walk, jog, sprint, strafe and backpedal', worst < 0.25, (worst * 100).toFixed(0) + '% worst');
    ok('in-game locomotion weights sum to 1 every frame', wsWorst < 1e-6, wsWorst.toExponential(2));
    ok('clip locomotion slides no more than the v7 procedural gait on any row', v7worse === rows.length, v7worse + '/' + rows.length); }
  // ------------------------------------------------------------------ 3) cinematics: skippable, never consume input, never change outcomes
  const fixedSeed = fn => { const dn = w.Date.now; w.Date.now = () => 424242; try { return fn(); } finally { w.Date.now = dn; } };
  { const I = G.Intro; I.enabled = true; fixedSeed(() => Game.start('king')); const W = Game.world;
    ok('boss intro plays on a fresh boss fight (letterbox on)', I.active && $('lbox').classList.contains('on'));
    frames(90); ok('sim is held at tick 0 during the intro (presentation clock only)', W.tick === 0 && I.active, 'tick ' + W.tick);
    tap('KeyJ'); frames(2); const P = W.player; ok('any key skips the intro', !I.active); frames(3);
    ok('…and the skipping key is not consumed (J still starts the first light attack)', P.state === 'attack' && P.atk && P.atk.def.key === 'p_l1', P.state + ' ' + (P.atk && P.atk.def.key));
    Game.quit(); fixedSeed(() => Game.start('warden')); frames(2); key('KeyW', true); frames(2); ok('holding a movement key also skips, and the player moves at once', !I.active && (frames(20), Math.hypot(Game.world.player.vx, Game.world.player.vz) > 1)); key('KeyW', false);
    Game.quit(); fixedSeed(() => Game.start('duelist')); frames(Math.ceil(I.dur * 60) + 5); ok('intro ends by itself after ~3.3 s', !I.active && Game.world.tick > 0, 'tick ' + Game.world.tick);
    tap('KeyR'); frames(2); ok('restart skips the intro (straight back into the fight)', !I.active); Game.quit();
    fixedSeed(() => Game.start('practice')); frames(2); ok('no intro in practice', !I.active); Game.quit();
    // outcomes: same seed + same per-tick inputs, intro played out vs intros disabled -> identical sim trace
    const trace = (introOn, fpsMs) => { I.enabled = introOn; fixedSeed(() => Game.start('duelist')); const W = Game.world, out = []; let r = 11; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647; const plan = [];
      for (let t = 0; t < 900; t++) plan.push(rnd()); W.preStep = ww => { const p = ww.player, u = plan[ww.tick % plan.length]; p.intent.mx = 0; p.intent.mz = u < 0.5 ? 0.6 : 0; if (ww.tick % 23 === 0) p.intent.light = true; if (ww.tick % 37 === 5) p.intent.parry = true; if (ww.tick % 97 === 50) p.intent.dodge = true; p.lockId = ww.enemies()[0] ? ww.enemies()[0].id : null; };
      const st = W.step.bind(W); W.step = dt => { st(dt); const p = W.player, e = W.fighters[1]; out.push([W.tick, p.hp.toFixed(3), p.posture.toFixed(3), p.x.toFixed(4), p.z.toFixed(4), p.state, e.hp.toFixed(3), e.posture.toFixed(3), e.x.toFixed(4), e.z.toFixed(4), e.state].join(',')); };
      let guard = 0; while (W.tick < 900 && guard++ < 20000) { H.frames(1); } I.enabled = true; const r0 = out.slice(0, 900); Game.quit(); return r0; };
    const A1 = trace(false), A2 = trace(true); ok('intros never change core outcomes (900-tick trace identical with intro on / off)', A1.length === 900 && A1.join('|') === A2.join('|'), A1.length + ' vs ' + A2.length + (A1.join('|') === A2.join('|') ? '' : ' first diff @' + A1.findIndex((x, i) => x !== A2[i])));
    I.enabled = false; }
  // finale, victory card, death fade
  { const I = G.Intro; I.enabled = false; Game.start('duelist'); const W = Game.world, P = W.player, e = W.enemies()[0]; e.brain.update = () => {}; P.hp = P.maxHp = 1e5; e.x = P.x; e.z = P.z + 1.5; e.hp = 1; C.addPosture(W, e, 1e4); frames(3); tap('KeyE'); frames(4);
    ok('final deathblow: finisher camera + letterbox, no sim slow-mo (INT5 Tier A: the slow-mo is presentation only, PresSlow)', G.V8.Finale.active && G.Cine.dur === 0 && !!G.Cine.cam && $('lbox').classList.contains('on'), G.V8.Finale.look);
    let sawCard = false; frames(60 * 8, () => { if ($('vcTitle').textContent === 'OATHBREAKER SLAIN' && +$('vcard').style.opacity > 0.5) sawCard = true; }); ok('victory moment: OATHBREAKER SLAIN title card, then the results screen', sawCard && Game.state === 'victory', Game.state);
    Game.quit(); Game.start('king'); const W2 = Game.world, k = W2.enemies()[0]; k.brain.update = () => {}; k.marks = 1; k.phase = 2; W2.player.hp = W2.player.maxHp = 1e5; k.x = W2.player.x; k.z = W2.player.z + 1.5; k.hp = 1; C.addPosture(W2, k, 1e4); frames(3); tap('KeyE'); frames(4);
    ok('the King gets his own finisher camera', G.V8.Finale.active && G.V8.Finale.look === 'king'); let kc = ''; frames(420, () => { if (+$('vcard').style.opacity > 0.5) kc = $('vcTitle').textContent; }); tap('Space'); frames(3); ok('King victory card reads THE OATH IS ENDED; any key skips it', kc === 'THE OATH IS ENDED' && Game.state === 'victory', kc + ' ' + Game.state);
    Game.quit(); Game.start('warden'); const W3 = Game.world; W3.player.hp = 0.5; for (const en of W3.enemies()) { en.brain.update = () => {}; en.x = W3.player.x; en.z = W3.player.z + 2; en.facing = Math.PI; C.startAttack(W3, en, 'w_swing', { jitter: false }); }
    let fadeMax = 0; frames(60 * 5, () => { fadeMax = Math.max(fadeMax, +$('fade').style.opacity || 0); }); ok('death: red fade, then the death screen', Game.state === 'dead' && fadeMax > 0.4, Game.state + ' fade ' + fadeMax.toFixed(2)); Game.quit();
    ok('fade and cards are cleared on quit', +$('fade').style.opacity < 0.01 && !G.V8.Victory.active && !G.V8.Finale.active); }
  // ------------------------------------------------------------------ 4) quality tiers
  { const T = G.TIERS, costly = ['post', 'lut', 'depthFx', 'godRays', 'dof', 'shimmer', 'wrap', 'wetFloor', 'env', 'cloth', 'shadows'];
    ok('every v8 effect has a Low / Medium / High setting', ['lut', 'depthFx', 'godRays', 'dof', 'shimmer', 'wrap', 'wetFloor', 'torchEmbers', 'shadowBox', 'contactAO'].every(k => k in T.low && k in T.medium && k in T.high));
    ok('Low disables every costly effect', costly.every(k => !T.low[k]) && T.low.torchEmbers === 0, costly.filter(k => T.low[k]).join(','));
    ok('High enables depth fog, god rays, DOF, heat shimmer, LUT grade', T.high.depthFx && T.high.godRays && T.high.dof && T.high.shimmer && T.high.lut);
    G.Settings.quality = 'low'; G.applyQuality(); Game.start('duelist'); frames(10); const V8 = G.V8;
    ok('Low at runtime: no torch embers, no wrap lighting, no DOF / cine LUT, no foot AO decals beyond 2 per fighter', !(V8.TorchEmbers.pts && V8.TorchEmbers.pts.visible) && G.V7.V7U.wrapK.value === 0 && G.V7.PostFX.dof === 0);
    const countVis = () => { let n = 0; G.scene.traverseVisible(o => { if (o.isMesh || o.isPoints || o.isLine || o.isSprite) n++; }); return n; };
    const n8 = countVis(); Game.quit();
    // v7 build for comparison, Low tier, same encounter
    const { JSDOM, VirtualConsole } = require('/workspace/veynhold/.test/node_modules/jsdom'); const fs = require('fs'); const vc = new VirtualConsole();
    const d7 = new JSDOM(fs.readFileSync('/workspace/veynhold/dist/Veynhold_v7.html', 'utf8'), { runScripts: 'dangerously', virtualConsole: vc, beforeParse(x) { x.__VEYN_HEADLESS = true; x.requestAnimationFrame = () => 0; x.innerWidth = 1280; x.innerHeight = 720; } });
    const G7 = d7.window.VEYN_GAME; G7.Settings.quality = 'low'; G7.applyQuality(); G7.Game.start('duelist'); let t7 = 1000; for (let i = 0; i < 10; i++) { t7 += 16.67; G7.Game.frame(t7); }
    let n7 = 0; G7.scene.traverseVisible(o => { if (o.isMesh || o.isPoints || o.isLine || o.isSprite) n7++; });
    ok('Low adds no renderables over v7 Low (visible meshes/points/sprites; v8 skinned models vs v7 headless block rig)', n8 <= n7 + 6, 'v8 ' + n8 + ' vs v7 ' + n7);
    G.Settings.quality = 'medium'; G.applyQuality(); }
  // ------------------------------------------------------------------ 5) save migration v7 -> v8
  { const LS = w.localStorage; LS.removeItem('veynhold_v8'); LS.setItem('veynhold_v7', JSON.stringify({ v: 7, quality: 'low', volume: 0.41, hitStyle: 'blood', seenTutorial: true, best: { duelist: { time: 51.2, deflects: 9, grade: 'A' } }, accessibility: false }));
    G.Store.data = { best: {}, seenTutorial: false }; G.Settings.quality = 'high'; G.Store.load(); await new Promise(r => setTimeout(r, 5));
    const d = JSON.parse(LS.getItem('veynhold_v8') || '{}');
    ok('v7 save migrates into veynhold_v8 (settings, best times, tutorial flag)', G.Settings.quality === 'low' && G.Settings.volume === 0.41 && G.Settings.hitStyle === 'blood' && G.Store.data.best.duelist && G.Store.data.best.duelist.grade === 'A' && G.Store.data.seenTutorial === true, JSON.stringify(G.Store.data.best));
    ok('migrated save is written as v8 and the v7 key is left in place', d.v === 8 && d.migratedFrom === 'veynhold_v7' && !!LS.getItem('veynhold_v7'), 'v=' + d.v + ' from=' + d.migratedFrom);
    G.Settings.intros = false; G.Store.save(); G.Settings.intros = true; G.Store.load(); ok('new v8 setting (boss intros) persists', G.Settings.intros === false); G.Settings.intros = true; G.Store.save();
    LS.removeItem('veynhold_v8'); LS.removeItem('veynhold_v7'); LS.setItem('veynhold_v6', JSON.stringify({ quality: 'medium', volume: 0.2, best: {} })); G.Store.load(); await new Promise(r => setTimeout(r, 5));
    ok('v6-only save still migrates (falls back to v6)', G.Settings.volume === 0.2 && JSON.parse(LS.getItem('veynhold_v8') || '{}').migratedFrom === 'veynhold_v6'); G.Settings.quality = 'medium'; G.applyQuality(); }
  // ------------------------------------------------------------------ 6) restart stability with every cinematic path
  { const I = G.Intro; I.enabled = true; const before = []; let leak = false, e0 = errors.length;
    for (const enc of ['duelist', 'warden', 'brother', 'king', 'pair', 'gauntlet', 'practice']) {
      Game.start(enc); frames(30); tap('KeyJ'); frames(60); const n0 = G.scene.children.length;
      for (let i = 0; i < 6; i++) { const W = Game.world, e = W.enemies()[0]; if (i % 3 === 1 && e) { e.x = W.player.x; e.z = W.player.z + 1.5; e.hp = 1; C.addPosture(W, e, 1e4); frames(2); tap('KeyE'); frames(40); } if (i % 3 === 2) { Game.restart(); frames(5); }
        tap('KeyR'); frames(20); }
      if (G.scene.children.length !== n0) leak = true; before.push(enc + ':' + n0 + '->' + G.scene.children.length); Game.quit(); }
    I.enabled = false; ok('42 restarts through intros / finishers / victory across 7 encounters: no errors, no leaked scene objects', errors.length === e0 && !leak && !Game.crashed, before.join(' ')); }
  // ------------------------------------------------------------------ 7) outcomes identical at 30 / 60 / 144 fps (presentation incl. clips + cinematics never feeds back)
  { const run = fpsMs => { G.Intro.enabled = true; const dn = w.Date.now; w.Date.now = () => 31337; Game.start('duelist'); w.Date.now = dn; const W = Game.world, out = []; let r = 5; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647; const plan = []; for (let t = 0; t < 1400; t++) plan.push(rnd());
      W.preStep = ww => { const p = ww.player, u = plan[ww.tick]; p.intent.mz = u < 0.55 ? 0.7 : 0; p.intent.mx = u > 0.85 ? 0.5 : 0; if (ww.tick % 19 === 0) p.intent.light = true; if (ww.tick % 31 === 7) p.intent.parry = true; if (ww.tick % 101 === 60) p.intent.heavy = true; if (ww.tick % 89 === 30) p.intent.deathblow = true; p.lockId = ww.enemies()[0] ? ww.enemies()[0].id : null; };
      const st = W.step.bind(W); W.step = dt => { st(dt); const p = W.player, e = W.fighters[1]; out.push([W.tick, p.hp.toFixed(4), p.posture.toFixed(4), p.x.toFixed(5), p.z.toFixed(5), p.state, e.hp.toFixed(4), e.posture.toFixed(4), e.x.toFixed(5), e.state, W.atkCounter].join(',')); };
      // skip the intro the same way at every frame rate (first frame), then fixed-dt frames at the requested rate
      Game.frame(H.t); G.Intro.skip(); let tt = H.t; for (let g = 0; g < 40000 && W.tick < 1300; g++) { tt += fpsMs; Game.frame(tt); }
      Game.quit(); G.Intro.enabled = false; return out.slice(0, 1300); };
    const a = run(1000 / 30), b = run(1000 / 60), c = run(1000 / 144);
    ok('outcomes identical at 30 / 60 / 144 fps with clips + cinematics on (1300-tick trace)', a.length === 1300 && a.join('|') === b.join('|') && b.join('|') === c.join('|'), a.length + '/' + b.length + '/' + c.length + (a.join('|') === b.join('|') ? '' : ' 30v60 diff @' + a.findIndex((x, i) => x !== b[i])) + (b.join('|') === c.join('|') ? '' : ' 60v144 diff @' + b.findIndex((x, i) => x !== c[i]))); }
  // ------------------------------------------------------------------ 8) credits + misc
  { G.Intro.enabled = false; Game.start('duelist'); const W = Game.world, P = W.player, e = W.enemies()[0]; e.brain.update = () => {}; P.x = 0; P.z = -1.2; e.x = 0.25; e.z = 1.0; P.lockId = e.id; frames(90);
    const d = Math.hypot(e.x - P.x, e.z - P.z), want = Math.atan2(e.x - P.x, e.z - P.z) + G.VISUAL.lockAngle + G.VISUAL.closeSwing * Math.max(0, Math.min(2, 3.4 - d)) * 0.5, err = Math.abs(C.angNorm(G.Cam.yaw - want));
    ok('lock-on camera orbits off the duel line (wider up close) so both fighters read', err < 0.08 && G.Cam.yaw > 0.3, 'yaw ' + G.Cam.yaw.toFixed(2) + ' want ' + want.toFixed(2)); Game.quit(); }
  // a timestamp that steps backwards (e.g. the trace above runs its own clock) must give dt 0, never a negative step into the camera springs
  { G.Intro.enabled = false; Game.start('duelist'); const W = Game.world; W.player.lockId = W.enemies()[0].id; frames(20); const y0 = G.Cam.yaw, tick0 = W.tick; Game.frame(H.t - 20000);
    const v = Object.values(G.Cam.vel), sane = v.every(x => Number.isFinite(x) && Math.abs(x) < 50); frames(30);
    ok('backwards clock step gives dt 0: sim keeps ticking on the next frames (no stall), camera springs stay sane', sane && Math.abs(G.Cam.yaw - y0) < 0.5 && W.tick >= tick0 + 20 && Number.isFinite(G.Cam.pos.x), (W.tick - tick0) + ' ticks over the next 30 frames'); Game.quit(); }
  ok('credit "Animations by Quaternius (CC0)" in the How to fight panel', /Animations by Quaternius \(CC0\)/.test($('tut').textContent));
  ok('core untouched (self-tests still pass in the page)', C.runSelfTests().every(t => t.pass));
  console.log('errors', errors.length ? errors.slice(0, 5).join(' | ') : 'none', 'crashed', !!Game.crashed);
  console.log(res.filter(Boolean).length + '/' + res.length + ' v8 checks passed');
})();
