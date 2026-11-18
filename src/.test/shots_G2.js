// Chunk G2 shots + draw calls: Block arena (wall banners, no prop axe) + cutscene establishing frame, every pickup close up, the Corpse Pit wide + close-ups.
// usage: LD_LIBRARY_PATH=/workspace/veynhold/.tools/chromelibs node .test/shots_G2.js <prefix> [html] [quality] [shots=1]
// shots=0: only the draw-call survey (used for the before/after Low comparison against an older build).
const path = require('path'); const fs = require('fs');
const { chromium } = require('/workspace/veynhold/.tools/node_modules/playwright-core');
const ROOT = path.resolve(__dirname, '..');
const prefix = process.argv[2] || 'G2', html = path.resolve(process.argv[3] || path.join(ROOT, 'dist/index.html')), Q = process.argv[4] || 'medium', SHOTS = process.argv[5] !== '0', ONLY = process.argv[6] || '';   // argv[6]: regex of view names (and no cutscene)
const sleep = ms => new Promise(r => setTimeout(r, ms));
const save0 = { game: 'veynhold', schema: 1, created: 1, updated: 1, playTime: 600, deaths: 0, kills: 10, region: 'execution', lantern: 'stair', lit: ['grave', 'gaol', 'stair'],
  flags: { met_tamsin: true, combat_tutorial_seen: true, tut_deflect: true, tut_thrust: true, tut_sweep: true, tut_stealth: true }, quests: { main: { stage: 5, log: [5], t: 1 } }, inv: { draught: 3 }, weapons: ['wardblade'], equip: { weapon: 'wardblade' },
  upgrades: [], defeated: {}, opened: { gaoldoor: true }, collected: {}, lore: {}, zones: { pit: true, yard: true, gaol: true, muster: true, stair: true, oss: true }, hints: { h_move: true, h_lantern: true, h_lock: true, draught: true, h_order: true }, chapter: 1, chapterDone: false };
(async () => {
  const b = await chromium.launch({ executablePath: '/workspace/veynhold/.tools/browsers/chromium-1134/chrome-linux/chrome', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.addInitScript(s => { localStorage.setItem('veynhold_save', s); localStorage.setItem('veynhold_v8', JSON.stringify({ v: 8, seenTutorial: true })); }, JSON.stringify(save0));
  await p.goto('file://' + html, { timeout: 300000, waitUntil: 'domcontentloaded' }); await p.waitForFunction(() => window.VEYN_ADV && window.VEYN_GAME && window.VEYN_GAME.Game.state === 'title', null, { timeout: 240000 });
  await p.waitForFunction(() => !window.VEYN_MODELS || window.VEYN_MODELS.status().ready >= window.VEYN_MODELS.status().total, null, { timeout: 120000 }).catch(() => {}); await sleep(400);
  await p.evaluate(q => { const G = window.VEYN_GAME; G.Settings.quality = q; G.Perf.stepped = true; G.applyQuality(); }, Q);
  await p.evaluate(() => document.getElementById('advContinue').click()); await sleep(2500);
  await p.waitForFunction(() => { const A = window.VEYN_ADV, G = window.VEYN_GAME; return A.active && G.Game.state === 'playing' && G.Game.world && A.Ents.list.length; }, null, { timeout: 900000, polling: 1000 }); await sleep(1500);
  await p.evaluate(() => { const A = window.VEYN_ADV, G = window.VEYN_GAME, P = G.Game.world.player; P.maxHp = P.hp = 1e5; for (const e of A.Ents.list) { e.f.brain = null; if (e.brain) e.brain.update = () => {}; e.f.x = e.f.px = e.f.x + 400; }
    A._sbG2 = A.startBoss; A.startBoss = () => {};   // survey: no boss start / cutscene in the arena views (the cutscene is shot on its own below)
    if (A.Keys && A.Keys.ensure) { A.Keys.ensure('m1', 'cagekey', -38.5, -33.5); } });   // a dropped key to photograph (in the yard by the gaol)
  const info0 = await p.evaluate(() => { const R = window.VEYN_ADV.Region; return { corpses: R.corpseInfo, banners: !!R.dyn.getObjectByName('wallBanners'), shrouds: !!R.dyn.getObjectByName('corpseShrouds'),
    pickups: Object.keys(R.pickups).map(k => [k, R.pickups[k].model ? R.pickups[k].model.userData.item || (R.pickups[k].model.userData.sword ? 'sword' : '?') : 'wisp']) }; });
  console.log('region', JSON.stringify(info0));
  // free shot camera: after the game camera (Cinema.camera runs last), place the camera at s.pos looking at s.at; hide Wren while it is set
  await p.evaluate(() => { const G = window.VEYN_GAME, Ci = G.P1.Cinema, o = Ci.camera.bind(Ci); Ci.camera = a => { o(a); const s = window.__shot, W = G.Game.world; const pc = W && G.Game.chars.get(W.player.id); if (pc && pc.root) pc.root.visible = !s;
    if (s) { G.camera.position.set(s.pos[0], s.pos[1], s.pos[2]); G.camera.lookAt(s.at[0], s.at[1], s.at[2]); } }; });
  const yawTo = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);
  const place = (x, z, tx, tz, pitch, dist) => p.evaluate(([x, z, yaw, pitch, dist]) => { const G = window.VEYN_GAME, P = G.Game.world.player; P.x = P.px = x; P.z = P.pz = z; P.facing = P.pfacing = yaw; G.Cam.yaw = yaw; G.Cam.pitch = pitch; if (dist && G.Cam.dist !== undefined) G.Cam.dist = dist;
    const gy = window.VEYN_ADV.Region.groundY(x, z); G.Cam.lookSm.set(x, 1.5 + gy, z); }, [x, z, yawTo(x, z, tx, tz), pitch, dist || 0]);
  // whole-frame draw calls (every pass), the minimum over 4 frames (one-off passes such as shadow refreshes don't count)
  const calls = () => p.evaluate(() => new Promise(res => { const r = window.VEYN_GAME.renderer; let best = null, n = 0; const one = () => { r.info.autoReset = false; r.info.reset(); requestAnimationFrame(() => { const c = r.info.render.calls, t = r.info.render.triangles; r.info.autoReset = true;
    if (!best || c < best.calls) best = { calls: c, tris: t }; if (++n < 4) requestAnimationFrame(one); else res(best); }); }; requestAnimationFrame(one); }));
  const pk = await p.evaluate(() => { const R = window.VEYN_ADV.Region, o = {}; for (const k in R.pickups) { const m = R.pickups[k].model; const v = m ? m.position : R.pickups[k].s.position; o[k] = [v.x, v.z]; } const kd = window.VEYN_ADV.Save.data.drops || {}; for (const k in kd) o['key_' + k] = [kd[k].x, kd[k].z]; return o; });
  // free-camera views: [name, cam x, cam y-above-ground, cam z, look x, look y-above-ground, look z]; Wren stands (hidden) at the look point so chunk culling centres there
  const it = (k, dx, dy, dz, ly) => { const q = pk[k]; return q ? [q[0] + dx, dy, q[1] + dz, q[0], ly || 0.05, q[1]] : null; };
  const V = [
    ['pit_wide', 7.2, 4.2, -77.4, -1.0, 0.2, -67.5], ['pit_wide2', -7.4, 4.0, -62.8, 2.5, 0.2, -71.5], ['pit_clue', -1.4, 1.9, -61.6, -3.1, 0.3, -63.4], ['pit_bodies_w', 0.2, 2.0, -70.0, -2.6, 0.2, -68.5],
    ['pit_bodies_e', -0.4, 2.0, -64.8, 2.6, 0.2, -67.0], ['pit_cart', 1.0, 2.4, -70.8, 5.0, 1.0, -73.5], ['pit_slumps', 0.0, 2.2, -69.0, -8.0, 0.6, -69.6], ['gallows_slump', -1.2, 2.0, -41.6, -3.9, 0.6, -38.7], ['gibbet', -47.5, 3.6, 3.0, -52.4, 2.9, 0.0],
    ['item_tag_pell', ...(it('tag_pell', 0.9, 1.0, 0.8) || [])], ['item_tag_ilke', ...(it('tag_ilke', -0.9, 1.0, 0.8) || [])], ['item_tag_jory', ...(it('tag_jory', -0.9, 1.0, -0.9) || [])],
    ['item_tag_jory_5m', ...(it('tag_jory', -3.4, 1.7, -3.4) || [])], ['item_tithe', ...(it('tithe_altar', -1.0, 1.75, 0.3, 1.1) || [])], ['item_sword', ...(it('sword', -1.2, 1.2, 1.2, 0.5) || [])], ['item_key', ...(it('key_cagekey', 1.0, 1.0, 0.9, 0.3) || [])],
    ['hymn_carving', 36.6, 1.7, -39.4, 34.5, 1.3, -40.5],
    ['arena_wide', 0, 4.5, 37.5, 0, 1.0, 52], ['arena_wide_back', 0, 5.0, 61.5, 0, 1.0, 46],
  ].filter(v => v.length === 7 && (!ONLY || new RegExp(ONLY).test(v[0])));
  const survey = {};
  for (const [name, cx, cy, cz, lx, ly, lz] of V) {
    await p.evaluate(([cx, cy, cz, lx, ly, lz]) => { const G = window.VEYN_GAME, R = window.VEYN_ADV.Region, P = G.Game.world.player; P.x = P.px = lx; P.z = P.pz = lz; G.Cam.lookSm.set(lx, R.groundY(lx, lz) + 1.5, lz);
      window.__shot = { pos: [cx, R.groundY(cx, cz) + cy, cz], at: [lx, R.groundY(lx, lz) + ly, lz] }; }, [cx, cy, cz, lx, ly, lz]);
    await sleep(SHOTS ? 2200 : 1500); survey[name] = await calls();
    if (SHOTS) { await p.screenshot({ timeout: 200000, path: path.join(ROOT, 'shots', prefix + '_' + name + '.png') }); console.log('saved', prefix + '_' + name, JSON.stringify(survey[name])); }
  }
  await p.evaluate(() => { window.__shot = null; });
  console.log('survey', JSON.stringify(survey));
  if (SHOTS && !ONLY) {   // cutscene: establishing frame (t 3.6) and the whetstone frame (t 8.4), the D shots where the "flag" sat
    await p.evaluate(() => { const A = window.VEYN_ADV; A.startBoss = A._sbG2; });
    await p.evaluate(() => { const G = window.VEYN_GAME, A = window.VEYN_ADV, P = G.Game.world.player; const od = A.Ents.list.find(e => e.def.id === 'odran'); if (od) { od.f.x = od.f.px = od.def.x; od.f.z = od.f.pz = od.def.z; } P.x = P.px = 0; P.z = P.pz = 38.0; P.facing = 0; G.Cam.yaw = 0; A.BossD.enabled = true; });
    await p.waitForFunction(() => { const A = window.VEYN_ADV, G = window.VEYN_GAME, P = G.Game.world.player; if (!A.BossD.Cut.active && !A.boss) { P.x = P.px = 0; P.z = P.pz = 38.0; A.BossD.enabled = true; } return A.BossD.Cut.active; }, null, { timeout: 120000, polling: 200 }).catch(() => console.log('CUTSCENE DID NOT START'));
    for (const [name, t] of [['cut1_establish', 3.6], ['cut2_whet', 8.4], ['cut3_reverse', 14.2]]) {
      await p.evaluate(t => { const BD = window.VEYN_ADV.BossD; BD.hold = false; BD.jump = t; }, t);
      await p.waitForFunction(t => { const C = window.VEYN_ADV.BossD.Cut; if (C.t < t - 0.04) C.t = t - 0.04; return C.t >= t || !C.active; }, t, { timeout: 180000, polling: 100 }).catch(() => {});
      await p.evaluate(() => { window.VEYN_ADV.BossD.hold = true; }); await sleep(2200); await p.screenshot({ timeout: 200000, path: path.join(ROOT, 'shots', prefix + '_' + name + '.png') }); console.log('saved', prefix + '_' + name); }
    await p.evaluate(() => { const BD = window.VEYN_ADV.BossD; BD.hold = false; BD.Cut.finish(true); }); await sleep(600);
    // rebuild path: re-bake the corpses in place (what happens when the GLBs land after the region build); counts must not change, no duplicates
    const rb = await p.evaluate(() => { const R = window.VEYN_ADV.Region; if (!R.rebuildCorpses) return 'no rebuildCorpses'; const before = JSON.stringify(R.corpseInfo); R.rebuildCorpses(); const n = R.dyn.children.filter(o => /^corpse/.test(o.name)).length; return { before, after: JSON.stringify(R.corpseInfo), meshes: n }; });
    console.log('rebuild', JSON.stringify(rb));
  }
  console.log('console errors', JSON.stringify(errs)); await b.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
