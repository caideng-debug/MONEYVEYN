// chunk G1 frame strip (real Chromium): parry -> stagger -> step-in -> impale -> pull-out -> fall -> floor, for a field gaoler (m5) and Odran's final blow.
// usage: LD_LIBRARY_PATH=/workspace/veynhold/.tools/chromelibs node .test/shots_G1.js [quality] [field|boss]
const { chromium } = require('/workspace/veynhold/.tools/node_modules/playwright-core'); const path = require('path');
const ROOT = path.join(__dirname, '..'), html = path.join(ROOT, 'dist', 'index.html'), Q = process.argv[2] || 'high', ONLY = process.argv[3] || '';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const save0 = { game: 'veynhold', schema: 1, created: 1, updated: 1, playTime: 600, deaths: 0, kills: 10, region: 'execution', lantern: 'stair', lit: ['grave', 'gaol', 'stair'],
  flags: { met_tamsin: true, combat_tutorial_seen: true, tut_deflect: true, tut_thrust: true, tut_sweep: true, tut_stealth: true, intro_odran: true }, quests: { main: { stage: 5, log: [5], t: 1 } }, inv: { draught: 3 }, weapons: ['wardblade'], equip: { weapon: 'wardblade' },
  upgrades: [], defeated: {}, opened: { gaoldoor: true }, collected: { sword: true }, lore: {}, zones: { pit: true, yard: true, gaol: true, muster: true, stair: true }, hints: { h_move: true, h_lantern: true, h_lock: true, draught: true }, chapter: 1, chapterDone: false };
(async () => {
  const b = await chromium.launch({ executablePath: '/workspace/veynhold/.tools/browsers/chromium-1134/chrome-linux/chrome', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.addInitScript(s => { localStorage.setItem('veynhold_save', s); localStorage.setItem('veynhold_v8', JSON.stringify({ v: 8, seenTutorial: true })); }, JSON.stringify(save0));
  await p.goto('file://' + html, { timeout: 300000, waitUntil: 'domcontentloaded' }); await p.waitForFunction(() => window.VEYN_ADV && window.VEYN_GAME && window.VEYN_GAME.Game.state === 'title', null, { timeout: 240000 });
  await p.waitForFunction(() => !window.VEYN_MODELS || window.VEYN_MODELS.status().ready >= window.VEYN_MODELS.status().total, null, { timeout: 60000 }).catch(() => {}); await sleep(400);
  await p.evaluate(q => { const G = window.VEYN_GAME; G.Settings.quality = q; G.Perf.stepped = true; G.applyQuality(); }, Q);
  await p.evaluate(() => document.getElementById('advContinue').click()); await sleep(2500);
  await p.waitForFunction(() => { const A = window.VEYN_ADV, G = window.VEYN_GAME; return A.active && G.Game.state === 'playing' && G.Game.world && A.Ents.list.some(x => x.def.id === 'odran'); }, null, { timeout: 900000, polling: 1000 });
  await sleep(1500); console.log('ready', new Date().toISOString());
  // in-page director: a global freeze (sim + presentation clocks) and a watcher that freezes at each beat
  await p.evaluate(() => { const G = window.VEYN_GAME, A = window.VEYN_ADV; const ts = G.Cine.timeScale; G.Cine.timeScale = function (dt) { const v = ts.call(this, dt); return window.__frz ? 0 : v; };
    window.__dir = { beats: [], i: 0, hit: null };
    const loop = () => { const D = window.__dir; requestAnimationFrame(loop); if (window.__frz || D.i >= D.beats.length) return; try { if (D.beats[D.i].test()) { window.__frz = true; A.BossD.hold = true; D.hit = D.beats[D.i].name; D.i++; } } catch (e) { console.error(e); } };
    requestAnimationFrame(loop); });
  const go = async () => p.evaluate(() => { window.__dir.hit = null; window.__frz = false; window.VEYN_ADV.BossD.hold = false; });
  const runSeq = async (which) => {
    const setup = await p.evaluate(which => { const G = window.VEYN_GAME, A = window.VEYN_ADV, C = window.VEYN_CORE, W = G.Game.world, P = W.player, BD = A.BossD;
      P.maxHp = P.hp = 1e5; const e = A.Ents.list.find(x => x.def.id === (which === 'boss' ? 'odran' : 'm5')); if (!e) return 'no target'; const f = e.f;
      if (which === 'boss') { if (!A.boss) A.startBoss(e); f.marks = 1; f.phase = 2; f.x = f.px = 1.5; f.z = f.pz = 49.5; P.x = P.px = 1.5; P.z = P.pz = 47.4; }
      else { P.x = P.px = f.x + 0.3; P.z = P.pz = f.z - 2.0; A.Ents.engage(e, 'struck'); f.x = f.px = P.x; f.z = f.pz = P.z + 2.0; }
      f.brain && (f.brain.update = () => {}); f.facing = f.pfacing = Math.PI; P.facing = 0; G.Cam.yaw = 0; f.posture = f.postureMax - 1; f.lastPostureHit = f.lt + 99; P.posture = 0;
      const key = which === 'boss' ? 'w_slam' : 'd_over'; let t0 = -1, su = 0, pressed = false, d0 = P.lastDefense, brkT = -1;
      const D = window.__dir; D.i = 0; const c = G.Game.chars.get(f.id), Fin = BD.Fin, ent = () => BD.Col.list.find(x => x.c === c);
      D.beats = [
        { name: 'parry', test: () => { if (t0 < 0 && f.canAct()) { C.startAttack(W, f, key, { jitter: false }); su = f.atk.su; t0 = W.time; }
            if (t0 >= 0 && !pressed && W.time >= t0 + su - 0.14) { pressed = true; window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF', bubbles: true })); setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyF', bubbles: true })), 120); }
            return P.lastDefense !== d0 && P.lastDefense && P.lastDefense.result === 'deflect'; } },
        { name: 'stagger', test: () => { if (f.state === 'broken' && brkT < 0) brkT = W.time; return brkT >= 0 && W.time - brkT > 0.4; } },
        { name: 'stepin', test: () => { if (!Fin.cur && !G.Input.pressed.KeyE) G.Input.pressed.KeyE = true; return Fin.cur && Fin.cur.v === f && Fin.cur.real >= 0.16; } },
        { name: 'impale', test: () => Fin.cur && Fin.cur.impReal >= 0 && Fin.cur.real - Fin.cur.impReal >= 0.2 },
        { name: 'pullout', test: () => { const F = Fin.cur || Fin.last; return F && F.ripReal >= 0 && F.real - F.ripReal >= 0.06; } },
        which === 'boss' ? { name: 'kneel', test: () => { const e = ent(); return e && e.t >= 1.8; } } : { name: 'fall', test: () => { const e = ent(); return e && e.fallT >= 0 && e.t - e.fallT >= 0.24; } },
        which === 'boss' ? { name: 'fall', test: () => { const e = ent(); if (e && !A.Save.data.flags.odran_spoke) A.Save.data.flags.odran_spoke = true; return e && e.fallT >= 0 && e.t - e.fallT >= 0.42; } } : null,
        { name: 'floor', test: () => { const e = ent(); return e && e.landed && e.t - e.landT >= 0.9; } },
        { name: 'floor_late', test: () => { const e = ent(); if (e && e.done && !e.lateT) e.lateT = performance.now(); return e && e.done && performance.now() - e.lateT > 6000; } },
      ].filter(Boolean); return 'ok ' + D.beats.map(x => x.name).join(','); }, which);
    console.log(which, 'setup', setup); if (!setup.startsWith('ok')) return;
    const n = (await p.evaluate(() => window.__dir.beats.length));
    for (let k = 0; k < n; k++) {
      const hit = await p.waitForFunction(() => window.__dir.hit, null, { timeout: 240000, polling: 50 }).then(h => h.jsonValue()).catch(() => null);
      if (!hit) { console.log(which, 'beat timed out at', k, JSON.stringify(await p.evaluate(() => { const A = window.VEYN_ADV, F = A.BossD.Fin.cur || A.BossD.Fin.last; return { i: window.__dir.i, st: window.VEYN_GAME.Game.state, F: F && { real: F.real, imp: F.impReal, rip: F.ripReal } }; }))); break; }
      await sleep(1800); const info = await p.evaluate(() => { const A = window.VEYN_ADV, F = A.BossD.Fin.last; return F ? { seam: F.seam, real: +F.real.toFixed(3), impReal: +F.impReal.toFixed(3), ripReal: +F.ripReal.toFixed(3) } : null; });
      await p.screenshot({ path: path.join(ROOT, 'shots', 'G1_' + which + '_' + (k + 1) + '_' + hit + '.png'), timeout: 300000 }); console.log('saved G1_' + which + '_' + (k + 1) + '_' + hit, JSON.stringify(info)); await go(); }
    await p.evaluate(() => { window.__dir.beats = []; window.__frz = false; window.VEYN_ADV.BossD.hold = false; });
  };
  if (!ONLY || ONLY === 'field') await runSeq('field');
  if (!ONLY || ONLY === 'boss') { await sleep(1500); await runSeq('boss'); }
  const info = await p.evaluate(() => { const G = window.VEYN_GAME; return { fps: G.Game.fps.toFixed(1), calls: G.renderer.info.render.calls }; }); console.log('info', JSON.stringify(info));
  console.log('console errors', JSON.stringify(errs)); await b.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
