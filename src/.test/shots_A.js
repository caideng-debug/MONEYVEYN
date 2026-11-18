// Chunk A before/after screenshots at High: Corpse Pit, sword spot, lantern (unkindled + kindled).
// usage: LD_LIBRARY_PATH=/workspace/veynhold/.tools/chromelibs node .test/shots_A.js <prefix> [html] [quality]
const { chromium } = require('/workspace/veynhold/.tools/node_modules/playwright-core');
const prefix = process.argv[2] || 'A_before', html = process.argv[3] || '/workspace/veynhold/dist/index.html', Q = process.argv[4] || 'high';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ executablePath: '/workspace/veynhold/.tools/browsers/chromium-1134/chrome-linux/chrome', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); if (/corpse|fail|error/i.test(m.text())) console.log('  log:', m.text()); });
  await p.goto('file://' + html, { timeout: 180000 }); await p.waitForFunction(() => window.VEYN_ADV && window.VEYN_GAME && window.VEYN_GAME.Game.state === 'title', null, { timeout: 240000 });
  await p.waitForFunction(() => !window.VEYN_MODELS || window.VEYN_MODELS.status().ready >= window.VEYN_MODELS.status().total, null, { timeout: 60000 }).catch(() => {}); await sleep(500);
  await p.evaluate(q => { localStorage.removeItem('veynhold_save'); const G = window.VEYN_GAME; G.Settings.quality = q; G.Perf.stepped = true; G.applyQuality(); G.Settings.intros = false; if (G.Intro) G.Intro.enabled = false; }, Q);
  await p.evaluate(() => document.getElementById('advNew').click()); await sleep(1500); await p.waitForFunction(() => { const A = window.VEYN_ADV; if (A.prologueEnd) A.prologueEnd(); return window.VEYN_GAME.Game.world && window.VEYN_GAME.Game.world.player; }, null, { timeout: 120000, polling: 2000 }); await sleep(2500);
  const views = [
    ['corpsepit', 1.2, -63.6, 3.14, 0.45, 3500, null],
    ['corpsepit_wide', 6.5, -75.5, -0.86, 0.45, 3000, null],
    ['sword', 2.0, -70.6, 2.18, 0.42, 3000, null],
    ['sword_far', -2.5, -66.0, 2.6, 0.3, 3000, null],
    ['corpse_close', -5.6, -71.8, 1.2, 0.55, 2500, 'close'],
    ['gallows_corpse', -3.0, -43.5, 0.15, 0.3, 3000, null],
    ['lantern', -0.9, -60.6, 0.3, 0.05, 3000, null],
    ['lantern_kindled', -0.9, -60.6, 0.3, 0.05, 3000, 'kindle'],
  ];
  for (const [name, x, z, yaw, pitch, wait, act] of views) {
    await p.evaluate(([x, z, yaw, pitch, act]) => { const G = window.VEYN_GAME, W = G.Game.world, P = W.player, A = window.VEYN_ADV; P.maxHp = P.hp = 1e5; for (const e of A.Ents.list) { e.f.brain = null; e.brain.update = () => {}; }
      if (act === 'kindle' && A.Region && A.Region.setLantern) A.Region.setLantern('grave', true); if (act === 'close') G.Cam.curDist = 2.6;
      P.x = P.px = x; P.z = P.pz = z; P.facing = P.pfacing = yaw; G.Cam.yaw = yaw; G.Cam.pitch = pitch; const gy = G.Game.groundY ? G.Game.groundY(x, z) : 0; G.Cam.lookSm.set(x, 1.5 + gy, z); }, [x, z, yaw, pitch, act]);
    await sleep(wait); await p.screenshot({ timeout: 120000, path: '/workspace/veynhold/shots/' + prefix + '_' + name + '.png' }); console.log('saved', prefix + '_' + name);
  }
  const info = await p.evaluate(() => { const G = window.VEYN_GAME, R = window.VEYN_ADV.Region; return { fps: G.Game.fps.toFixed(1), calls: G.renderer.info.render.calls, tris: G.renderer.info.render.triangles, corpses: R && R.corpseInfo, sword: (() => { const k = R && R.pickups.sword; if (!k || !k.model) return null; const v = k.model.getWorldPosition(new window.THREE.Vector3()); return [v.x.toFixed(2), v.y.toFixed(2), v.z.toFixed(2), k.model.visible, !!k.model.parent]; })() }; });
  console.log('info', JSON.stringify(info));
  console.log('console errors', JSON.stringify(errs)); await b.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
