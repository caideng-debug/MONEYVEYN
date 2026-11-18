// Repair before/after screenshots at High (headless Chromium + SwiftShader).
// usage: LD_LIBRARY_PATH=/workspace/veynhold/.tools/chromelibs node .test/shots_repair.js <prefix> [html]
// Views: Corpse Pit opening (bodies), Headsman's Stair, Gallows Yard, pause-menu map. Writes shots/<prefix>_*.png and prints console errors.
const { chromium } = require('/workspace/veynhold/.tools/node_modules/playwright-core');
const prefix = process.argv[2] || 'before', html = process.argv[3] || '/workspace/veynhold/dist/index.html';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ executablePath: '/workspace/veynhold/.tools/browsers/chromium-1134/chrome-linux/chrome', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errs = [], warns = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); if (m.type() === 'warning') warns.push(m.text()); });
  await p.goto('file://' + html); await p.waitForFunction(() => window.VEYN_ADV && window.VEYN_GAME && window.VEYN_GAME.Game.state === 'title', null, { timeout: 90000 }); await sleep(800);
  await p.evaluate(() => { localStorage.removeItem('veynhold_save'); const G = window.VEYN_GAME; G.Settings.quality = 'high'; G.Perf.stepped = true; G.applyQuality(); G.Settings.intros = false; if (G.Intro) G.Intro.enabled = false; });
  await p.click('#advNew'); await sleep(400); await p.evaluate(() => window.VEYN_ADV.prologueEnd && window.VEYN_ADV.prologueEnd()); await sleep(3500);
  const views = [
    ['corpsepit', 0, -74.5, 0, 0.22, 3500],          // the opening view: player at the spawn, bodies ahead
    ['headsman_stair', 0, 25.5, 0, 0.18, 3500],      // from the Muster Field looking north up the stair
    ['headsman_stair_top', 0, 32.6, 0, 0.3, 3000],   // on the stair / landing
    ['gallows_yard', 0, -47, 0, 0.2, 3000],          // the Long Gallows and its steps
  ];
  for (const [name, x, z, yaw, pitch, wait] of views) {
    await p.evaluate(([x, z, yaw, pitch]) => { const G = window.VEYN_GAME, W = G.Game.world, P = W.player, A = window.VEYN_ADV; P.maxHp = P.hp = 1e5; for (const e of A.Ents.list) { e.f.brain = null; e.brain.update = () => {}; }
      P.x = P.px = x; P.z = P.pz = z; P.facing = P.pfacing = yaw; G.Cam.yaw = yaw; G.Cam.pitch = pitch; const gy = G.Game.groundY ? G.Game.groundY(x, z) : 0; G.Cam.lookSm.set(x, 1.5 + gy, z); }, [x, z, yaw, pitch]);
    await sleep(wait); await p.screenshot({ path: '/workspace/veynhold/shots/' + prefix + '_' + name + '.png' }); console.log('saved', prefix + '_' + name);
    const info = await p.evaluate(() => { const G = window.VEYN_GAME, P = G.Game.world.player, c = G.Game.chars.get(P.id); return { x: P.x.toFixed(2), z: P.z.toFixed(2), rootY: c.root.position.y.toFixed(3), fps: G.Game.fps.toFixed(1) }; });
    console.log('  ', JSON.stringify(info));
  }
  // pause-menu map with every zone revealed
  await p.evaluate(() => { const A = window.VEYN_ADV; const d = A.Save.data; for (const z of A.Region.data.zones) d.zones[z.id] = true; const P = window.VEYN_GAME.Game.world.player; P.x = P.px = 0; P.z = P.pz = 24; });
  await sleep(300); await p.keyboard.press('Escape'); await sleep(500);
  const mapBtn = await p.$('#advMenu [data-t="Map"]'); if (mapBtn) { await mapBtn.click(); await sleep(600); }
  await p.screenshot({ path: '/workspace/veynhold/shots/' + prefix + '_pause_map.png' }); console.log('saved', prefix + '_pause_map');
  const ctl = await p.$('#advMenu [data-t="Controls"]'); if (ctl) { await ctl.click(); await sleep(400); await p.screenshot({ path: '/workspace/veynhold/shots/' + prefix + '_controls_tab.png' }); console.log('saved', prefix + '_controls_tab'); }
  console.log('console errors', JSON.stringify(errs)); console.log('console warnings', JSON.stringify(warns.slice(0, 8)));
  await b.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
