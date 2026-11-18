// Chunk A2: opening polish shots (sword readability at ~6 m, gallows corpse, lanterns, Corpse Pit / Gallows Yard set dressing)
// + a real-key pickup check (E prompt shown, KeyE pressed through Playwright's keyboard, sword taken).
// usage: LD_LIBRARY_PATH=/workspace/veynhold/.tools/chromelibs node .test/shots_A2.js <prefix> [html] [quality] [views=all|sword|dress|base] [pickup=1]
// Paths are relative to this worktree (no sed needed).
const path = require('path');
const { chromium } = require('/workspace/veynhold/.tools/node_modules/playwright-core');
const ROOT = path.resolve(__dirname, '..');
const prefix = process.argv[2] || 'A2', html = path.resolve(process.argv[3] || path.join(ROOT, 'dist/index.html')), Q = process.argv[4] || 'high', which = process.argv[5] || 'all', doPick = process.argv[6] !== '0';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const yawTo = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);
(async () => {
  const b = await chromium.launch({ executablePath: '/workspace/veynhold/.tools/browsers/chromium-1134/chrome-linux/chrome', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('file://' + html, { timeout: 400000 }); await p.waitForFunction(() => window.VEYN_ADV && window.VEYN_GAME && window.VEYN_GAME.Game.state === 'title', null, { timeout: 400000 });
  await p.waitForFunction(() => !window.VEYN_MODELS || window.VEYN_MODELS.status().ready >= window.VEYN_MODELS.status().total, null, { timeout: 200000 }).catch(() => {}); await sleep(500);
  await p.evaluate(q => { localStorage.removeItem('veynhold_save'); const G = window.VEYN_GAME; G.Settings.quality = q; G.Perf.stepped = true; G.applyQuality(); G.Settings.intros = false; if (G.Intro) G.Intro.enabled = false; }, Q);
  await p.evaluate(() => document.getElementById('advNew').click()); await sleep(1500);
  await p.waitForFunction(() => { const A = window.VEYN_ADV; if (A.prologueEnd) A.prologueEnd(); return window.VEYN_GAME.Game.world && window.VEYN_GAME.Game.world.player; }, null, { timeout: 400000, polling: 2000 }); await sleep(2500);
  const sw = await p.evaluate(() => { const k = window.VEYN_ADV.Region.pickups.sword; const v = k && k.model ? k.model.getWorldPosition(new window.THREE.Vector3()) : null; return v ? [v.x, v.z] : [5.4, -73.3]; });
  const at = (name, x, z, tx, tz, pitch, wait, act) => [name, x, z, yawTo(x, z, tx, tz), pitch, wait, act];
  const V = {
    sword: [at('sword_6m', sw[0] - 5.2, sw[1] + 3.0, sw[0], sw[1], 0.32, 2500), (v => (v[3] += 0.38, v))(at('sword_6m_side', sw[0] - 5.2, sw[1] + 3.0, sw[0], sw[1], 0.3, 2500)), at('sword_spawn', 0, -73, sw[0], sw[1], 0.3, 2500), at('sword', 2.0, -70.6, sw[0], sw[1], 0.42, 2500), at('sword_far', -2.5, -66.0, sw[0], sw[1], 0.3, 2500)],
    base: [['gallows_corpse', -3.0, -43.5, 0.15, 0.3, 2500, null], ['lantern', -0.9, -60.6, 0.3, 0.05, 2500, null], ['lantern_kindled', -0.9, -60.6, 0.3, 0.05, 2500, 'kindle'], ['corpsepit_wide', 6.5, -75.5, -0.86, 0.45, 2500, null]],
    dress: [at('dress_pit', 3.5, -63.5, -3.5, -71, 0.4, 2500), at('dress_gallows', -6.5, -45.5, -1.5, -37.5, 0.28, 2500), at('dress_gibbet_crow', 2.0, -44, 0, -36, 0.05, 2500), at('dress_writ', -4.0, -45.2, -2.0, -40.6, 0.25, 2500), at('dress_yard_wide', 12, -50, -2, -34, 0.3, 2500)],
  };
  const views = which === 'all' ? [...V.sword, ...V.base, ...V.dress] : V[which] || [];
  for (const [name, x, z, yaw, pitch, wait, act] of views) {
    await p.evaluate(([x, z, yaw, pitch, act]) => { const G = window.VEYN_GAME, W = G.Game.world, P = W.player, A = window.VEYN_ADV; P.maxHp = P.hp = 1e5; for (const e of A.Ents.list) { e.f.brain = null; e.brain.update = () => {}; }
      if (act === 'kindle' && A.Region && A.Region.setLantern) A.Region.setLantern('grave', true);
      P.x = P.px = x; P.z = P.pz = z; P.facing = P.pfacing = yaw; G.Cam.yaw = yaw; G.Cam.pitch = pitch; const gy = G.Game.groundY ? G.Game.groundY(x, z) : 0; G.Cam.lookSm.set(x, 1.5 + gy, z); }, [x, z, yaw, pitch, act]);
    await sleep(wait); await p.screenshot({ timeout: 200000, path: path.join(ROOT, 'shots', prefix + '_' + name + '.png') }); console.log('saved', prefix + '_' + name);
  }
  const info = await p.evaluate(() => { const G = window.VEYN_GAME, R = window.VEYN_ADV.Region; return { fps: G.Game.fps.toFixed(1), calls: G.renderer.info.render.calls, tris: G.renderer.info.render.triangles, corpses: R && R.corpseInfo, dress: R && R.dressInfo }; });
  console.log('info', JSON.stringify(info));
  if (doPick) {   // real key input: stand by the pickup, read the DOM prompt, press E through the keyboard, check the sword is in hand
    const def = await p.evaluate(() => { const k = window.VEYN_ADV.Region.pickups.sword; return k ? { x: k.def.x, z: k.def.z } : null; });
    if (!def) console.log('pickup: sword not present'); else {
      await p.evaluate(([x, z]) => { const G = window.VEYN_GAME, P = G.Game.world.player; P.x = P.px = x - 1.2; P.z = P.pz = z + 0.6; }, [def.x, def.z]); await sleep(1500);
      const pr = await p.evaluate(() => { const el = document.getElementById('advPrompt'); return el ? { shown: el.style.display !== 'none' && getComputedStyle(el).display !== 'none', text: el.textContent } : null; });
      console.log('prompt', JSON.stringify(pr)); await p.screenshot({ timeout: 200000, path: path.join(ROOT, 'shots', prefix + '_pickup_prompt.png') });
      await p.keyboard.down('e'); await sleep(250); await p.keyboard.up('e'); await sleep(1500);
      const after = await p.evaluate(() => { const A = window.VEYN_ADV, d = A.save ? null : null; void d; const R = A.Region; let col = null; try { col = JSON.parse(localStorage.getItem('veynhold_save') || 'null'); } catch (e) {}
        const inv = A.Inv && A.Inv.count ? A.Inv.count('wardblade') : null; return { gone: !R.pickups.sword, inv, modelInScene: (() => { let f = false; R.dyn.traverse(o => { if (o.userData && o.userData.sword) f = true; }); return f; })(), saveHas: !!(col && JSON.stringify(col).includes('sword')) }; });
      await p.screenshot({ timeout: 200000, path: path.join(ROOT, 'shots', prefix + '_pickup_after.png') });
      console.log('pickup prompt', JSON.stringify(pr), 'after', JSON.stringify(after));
    }
  }
  console.log('console errors', JSON.stringify(errs)); await b.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
