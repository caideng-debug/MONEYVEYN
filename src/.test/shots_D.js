// Chunk D screenshots (real Chromium, High): 3 cutscene frames, 2 boss-deathblow frames, 1 field deathblow + alignment numbers.
// usage: LD_LIBRARY_PATH=/workspace/veynhold/.tools/chromelibs node .test/shots_D.js [quality]
const { chromium } = require('/workspace/veynhold/.tools/node_modules/playwright-core'); const path = require('path');
const ROOT = path.join(__dirname, '..'), html = path.join(ROOT, 'dist', 'index.html'), Q = process.argv[2] || 'high', ONLY = process.argv[3] || '';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const save0 = { game: 'veynhold', schema: 1, created: 1, updated: 1, playTime: 600, deaths: 0, kills: 10, region: 'execution', lantern: 'stair', lit: ['grave', 'gaol', 'stair'],
  flags: { met_tamsin: true, combat_tutorial_seen: true, tut_deflect: true, tut_thrust: true, tut_sweep: true, tut_stealth: true }, quests: { main: { stage: 5, log: [5], t: 1 } }, inv: { draught: 3 }, weapons: ['wardblade'], equip: { weapon: 'wardblade' },
  upgrades: [], defeated: {}, opened: { gaoldoor: true }, collected: { sword: true }, lore: {}, zones: { pit: true, yard: true, gaol: true, muster: true, stair: true }, hints: { h_move: true, h_lantern: true, h_lock: true, draught: true }, chapter: 1, chapterDone: false };
// merge 2: run alone, 'boss' (or 'field') must not replay the first-encounter cutscene (it would eat the deathblow E press and re-place both fighters)
if (ONLY && ONLY !== 'cut') save0.flags.intro_odran = true;
(async () => {
  const b = await chromium.launch({ executablePath: '/workspace/veynhold/.tools/browsers/chromium-1134/chrome-linux/chrome', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.addInitScript(s => { localStorage.setItem('veynhold_save', s); localStorage.setItem('veynhold_v8', JSON.stringify({ v: 8, seenTutorial: true })); }, JSON.stringify(save0));
  await p.goto('file://' + html, { timeout: 300000, waitUntil: 'domcontentloaded' }); await p.waitForFunction(() => window.VEYN_ADV && window.VEYN_GAME && window.VEYN_GAME.Game.state === 'title', null, { timeout: 240000 });
  await p.waitForFunction(() => !window.VEYN_MODELS || window.VEYN_MODELS.status().ready >= window.VEYN_MODELS.status().total, null, { timeout: 60000 }).catch(() => {}); await sleep(400);
  await p.evaluate(q => { const G = window.VEYN_GAME; G.Settings.quality = q; G.Perf.stepped = true; G.applyQuality(); }, Q);
  await p.evaluate(() => document.getElementById('advContinue').click()); await sleep(2500);
  await p.waitForFunction(() => { const A = window.VEYN_ADV, G = window.VEYN_GAME; return A.active && G.Game.state === 'playing' && G.Game.world && A.Ents.list.some(x => x.def.id === 'odran'); }, null, { timeout: 900000, polling: 1000 }).catch(async () => console.log('WORLD NOT READY', JSON.stringify(await p.evaluate(() => { const A = window.VEYN_ADV, G = window.VEYN_GAME, W = G.Game.world; return { active: A.active, state: G.Game.state, world: !!W, n: A.Ents && A.Ents.list.length, ids: A.Ents && A.Ents.list.map(x => x.def.id).slice(0, 30), p: W && [W.player.x, W.player.z] }; }).catch(e => String(e))))); await sleep(1500);
  console.log('ready', new Date().toISOString());
  const shot = async name => { await p.screenshot({ path: path.join(ROOT, 'shots', 'D_' + name + '.png') }); console.log('saved D_' + name); };
  // ---------------- cutscene
  if (!ONLY || ONLY === 'cut') {
    await p.evaluate(() => { const G = window.VEYN_GAME, A = window.VEYN_ADV, P = G.Game.world.player; P.x = P.px = 0; P.z = P.pz = 38.0; P.facing = 0; G.Cam.yaw = 0; A.BossD.enabled = true; });
    await p.waitForFunction(() => { const A = window.VEYN_ADV, G = window.VEYN_GAME, P = G.Game.world.player; if (!A.BossD.Cut.active && !A.boss) { P.x = P.px = 0; P.z = P.pz = 38.0; A.BossD.enabled = true; } return A.BossD.Cut.active; }, null, { timeout: 120000, polling: 200 }).catch(() => console.log('CUTSCENE DID NOT START'));
    for (const [name, t] of [['cut1_establish', 3.6], ['cut2_whet', 8.4], ['cut3_reverse', 14.2], ['cut4_close', 22.4], ['cut5_slam', 39.4]]) {
      await p.evaluate(t => { const BD = window.VEYN_ADV.BossD; BD.hold = false; BD.jump = t; }, t);
      await p.waitForFunction(t => { const C = window.VEYN_ADV.BossD.Cut; if (C.t < t - 0.04) C.t = t - 0.04; return C.t >= t || !C.active; }, t, { timeout: 180000, polling: 100 });
      await p.evaluate(() => { window.VEYN_ADV.BossD.hold = true; }); await sleep(2500); await shot(name); }
    await p.evaluate(() => { const BD = window.VEYN_ADV.BossD; BD.hold = false; BD.Cut.finish(true); }); await sleep(800);
  }
  // ---------------- boss deathblows
  const setupFin = async (which) => p.evaluate(which => { const G = window.VEYN_GAME, A = window.VEYN_ADV, C = window.VEYN_CORE, W = G.Game.world, P = W.player, BD = A.BossD;
    P.maxHp = P.hp = 1e5; const e = which === 'boss' ? A.Ents.list.find(x => x.def.id === 'odran') : A.Ents.list.find(x => x.def.id === 'm5');
    if (!e) return 'no target'; const f = e.f;
    if (which === 'boss') { if (!A.boss) A.startBoss(e); f.marks = 1; f.phase = 2; f.x = f.px = 1.5; f.z = f.pz = 49.5; P.x = P.px = 1.5; P.z = P.pz = 47.8; }
    else { P.x = P.px = f.x + 0.3; P.z = P.pz = f.z - 1.8; A.Ents.engage(e, 'struck'); }
    f.atk = null; f.brain && (f.brain.update = () => {}); f.facing = Math.PI; P.facing = 0; G.Cam.yaw = 0; C.addPosture(W, f, 1e5);
    BD.capture = { stage: 0 }; BD.onPost = (F, st) => { const cp = BD.capture; if (cp.stage === 0 && F.imp && st >= F.tImp + 0.03) { cp.stage = 1; BD.hold = true; cp.F = F; } else if (cp.stage === 2 && st >= 0.5) { cp.stage = 3; BD.hold = true; } };
    setTimeout(() => { G.Input.pressed.KeyE = true; }, 250); return 'ok'; }, which);
  const measure = () => p.evaluate(() => { const A = window.VEYN_ADV, BD = A.BossD, F = BD.capture.F; if (!F) return null; const THREE = window.THREE, ac = F.ac, vc = F.vc;
    const hilt = new THREE.Vector3(), tip = new THREE.Vector3(), hips = new THREE.Vector3(), head = new THREE.Vector3(); (ac.model && ac.model.blade ? ac.model.blade : ac.wrist).getWorldPosition(hilt); ac.tip.getWorldPosition(tip); vc.hips.getWorldPosition(hips); vc.head.getWorldPosition(head);
    // closest approach of the blade segment to the victim's spine segment (hips->head)
    const d1 = tip.clone().sub(hilt), d2 = head.clone().sub(hips), r = hilt.clone().sub(hips), a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r), c = d1.dot(r), bb = d1.dot(d2), den = a * e - bb * bb;
    let s = den > 1e-9 ? Math.min(1, Math.max(0, (bb * f - c * e) / den)) : 0, t = (bb * s + f) / e; t = Math.min(1, Math.max(0, t)); s = Math.min(1, Math.max(0, (bb * t - c) / a));
    const pc = hilt.clone().addScaledVector(d1, s), qc = hips.clone().addScaledVector(d2, t);
    return { kind: F.kind, boss: F.bossFinal, bladeLen: d1.length().toFixed(2), missToSpine_m: pc.distanceTo(qc).toFixed(3), alongBlade: s.toFixed(2), spineHeight_t: t.toFixed(2), hitY: qc.y.toFixed(2), hipsY: hips.y.toFixed(2), headY: head.y.toFixed(2), tipBeyondSpine_m: (d1.length() * (1 - s)).toFixed(2) }; });
  if (!ONLY || ONLY === 'boss') {
    console.log('boss setup', await setupFin('boss'));
    await p.waitForFunction(() => window.VEYN_ADV.BossD.capture.stage === 1, null, { timeout: 300000, polling: 50 }).catch(() => console.log('no impale capture'));
    await sleep(2500); console.log('boss impale alignment', JSON.stringify(await measure())); await shot('db1_boss_impale');
    await p.evaluate(() => { const BD = window.VEYN_ADV.BossD; BD.capture.stage = 2; BD.hold = false; });
    await p.waitForFunction(() => window.VEYN_ADV.BossD.capture.stage === 3, null, { timeout: 300000, polling: 50 }).catch(() => console.log('no slump capture'));
    await sleep(2500); await shot('db2_boss_rip_slump'); await p.evaluate(() => { const BD = window.VEYN_ADV.BossD; BD.hold = false; BD.onPost = null; }); await sleep(4500);
  }
  if (!ONLY || ONLY === 'field') {
    console.log('field setup', await setupFin('field'));
    await p.waitForFunction(() => window.VEYN_ADV.BossD.capture.stage === 1, null, { timeout: 300000, polling: 50 }).catch(() => console.log('no field capture'));
    await sleep(2500); console.log('field impale alignment', JSON.stringify(await measure())); await shot('db3_field_impale'); await p.evaluate(() => { const BD = window.VEYN_ADV.BossD; BD.hold = false; BD.onPost = null; }); await sleep(1500);
  }
  const info = await p.evaluate(() => { const G = window.VEYN_GAME; return { fps: G.Game.fps.toFixed(1), calls: G.renderer.info.render.calls }; }); console.log('info', JSON.stringify(info));
  console.log('console errors', JSON.stringify(errs)); await b.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
