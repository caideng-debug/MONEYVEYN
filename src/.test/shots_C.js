// Chunk C screenshots: the clue in the pit, the sergeant's belt key, the dropped key on the ground, the HUD line, the pause Inventory.
// usage: LD_LIBRARY_PATH=/workspace/veynhold/.tools/chromelibs node .test/shots_C.js [html] [quality]
const { chromium } = require('/workspace/veynhold/.tools/node_modules/playwright-core'); const path = require('path');
const html = process.argv[2] || path.join(__dirname, '..', 'dist', 'index.html'), Q = process.argv[3] || 'medium', OUT = path.join(__dirname, '..', 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ executablePath: '/workspace/veynhold/.tools/browsers/chromium-1134/chrome-linux/chrome', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('file://' + html, { timeout: 100000, waitUntil: 'commit' }); await p.waitForFunction(() => window.VEYN_ADV && window.VEYN_GAME && window.VEYN_GAME.Game.state === 'title', null, { timeout: 95000 });
  await p.waitForFunction(() => !window.VEYN_MODELS || window.VEYN_MODELS.status().ready >= window.VEYN_MODELS.status().total, null, { timeout: 15000 }).catch(() => {});
  await p.evaluate(q => { localStorage.removeItem('veynhold_save'); const G = window.VEYN_GAME; G.Settings.quality = q; G.Perf.stepped = true; G.applyQuality(); G.Settings.intros = false; if (G.Intro) G.Intro.enabled = false; }, Q);
  await p.click('#advNew'); await sleep(300); await p.evaluate(() => window.VEYN_ADV.prologueEnd && window.VEYN_ADV.prologueEnd()); await sleep(2500);
  const view = (x, z, yaw, pitch, setup) => p.evaluate(([x, z, yaw, pitch, setup]) => { const G = window.VEYN_GAME, W = G.Game.world, P = W.player, A = window.VEYN_ADV; P.maxHp = P.hp = 1e5; for (const e of A.Ents.list) { e.f.brain = null; e.brain.update = () => {}; e.f.intent.mx = e.f.intent.mz = 0; }
    if (setup) (new Function('A', 'G', setup))(A, G); P.x = P.px = x; P.z = P.pz = z; P.facing = P.pfacing = yaw; G.Cam.yaw = yaw; G.Cam.pitch = pitch; const gy = G.Game.groundY ? G.Game.groundY(x, z) : 0; G.Cam.lookSm.set(x, 1.5 + gy, z); }, [x, z, yaw, pitch, setup]);
  const ONLY = process.env.VIEW; const shot = async n => { if (ONLY && ONLY !== n) return; await p.screenshot({ path: OUT + '/C_' + n + '.png' }); console.log('saved C_' + n); };
  const PART = process.env.PART || 'all';
  if (PART !== '2') {
  if (!ONLY || ONLY === 'clue') { await view(-1.6, -66.4, -0.45, 0.2, "A.Save.data.quests.main={stage:3,log:[3]}; A.refreshObjective();"); await sleep(2200); await shot('clue'); }
  if (!ONLY || ONLY === 'belt') await view(-43, -27.4, 0, 0.05, "const s=A.Ents.list.find(e=>e.def.id==='g3'); s.f.facing=s.f.aiFace=Math.PI; A.Save.data.flags.clue_gaolkey=true; A.refreshObjective();"); if (!ONLY || ONLY === 'belt') { await sleep(2200); await shot('belt'); }
  await view(-42.6, -23.6, 0, 0.42, "const s=A.Ents.list.find(e=>e.def.id==='g3'); s.f.x=s.f.px=-46.5; s.f.z=s.f.pz=-28; A.Keys.drop(s.def, {x:-43, z:-25.4});"); await sleep(2500); await shot('dropped');
  }
  if (PART === '2') { await view(-42.6, -23.6, 0, 0.42, "const s=A.Ents.list.find(e=>e.def.id==='g3'); s.f.x=s.f.px=-46.5; s.f.z=s.f.pz=-28; A.Keys.drop(s.def, {x:-43, z:-25.4});"); await sleep(1500); }
  if (PART !== '1') {
  await view(-43, -24.0, Math.PI, 0.3, ""); await sleep(800); await p.keyboard.press('KeyE'); await sleep(700); await shot('taken');
  await sleep(1500); await p.keyboard.press('Escape'); await sleep(300); await p.click('#advMenu [data-t="Inventory"]'); await sleep(300); await shot('inventory');
  await p.click('#advMenu [data-t="Journey"]'); await sleep(300); await shot('objectives'); }
  const info = await p.evaluate(() => ({ fps: window.VEYN_GAME.Game.fps.toFixed(1), calls: window.VEYN_GAME.renderer.info.render.calls }));
  console.log('info', JSON.stringify(info), 'errors', JSON.stringify(errs)); await b.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
