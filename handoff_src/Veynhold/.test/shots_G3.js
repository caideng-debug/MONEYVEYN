// Chunk G3: frames from Ilsabet's two scenes for framing / subtitle checks -> shots/G3_*.png (real Chromium, swiftshader).
// The scene clock is frozen (A.Scenes.hold) at each beat while the frame is taken. usage: node .test/shots_G3.js [quality]
const { launch, sleep } = require('./t_lib.js'); const path = require('path');
const URL = 'file://' + path.join(__dirname, '..', 'dist', 'index.html');
const base = { game: 'veynhold', schema: 1, created: 1, updated: 1, playTime: 600, deaths: 0, kills: 10, region: 'execution', lantern: 'stair', lit: ['grave', 'gaol', 'stair'],
  flags: { met_tamsin: true, met_ilsabet: true, combat_tutorial_seen: true, tut_deflect: true, tut_thrust: true, tut_sweep: true, tut_stealth: true, intro_odran: true }, quests: { main: { stage: 5, log: [5], t: 1 }, crane: { stage: 1, log: [0, 1], t: 1 } },
  inv: { draught: 3, cagekey: 1 }, weapons: ['wardblade'], equip: { weapon: 'wardblade' }, upgrades: [], defeated: { m1: true }, opened: { gaoldoor: true, yardgate: true }, collected: { sword: true, key_cagekey: true }, lore: {},
  zones: { pit: true, yard: true, gaol: true, muster: true, stair: true, block: true }, hints: { h_move: true, h_lantern: true, h_lock: true, draught: true }, chapter: 1, chapterDone: false };
const quality = process.argv[2] || 'medium', ONLY = process.argv[3] || '';   // ONLY: 'free' or 'block'
(async () => {
  const out = []; const T = await launch({ storage: { veynhold_save: JSON.stringify(base), veynhold_v8: JSON.stringify({ v: 8, seenTutorial: true, quality }) } }); const { page, ev } = T; T.shot = async name => { await page.screenshot({ path: path.join(__dirname, '..', 'shots', name + '.png'), timeout: 300000 }); return name + '.png'; };   // the shared machine is slow on High
  try {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 300000 });
    await page.waitForFunction(() => window.VEYN_ADV && document.getElementById('advContinue') && window.VEYN_GAME.Game.state === 'title', null, { timeout: 300000, polling: 1000 });
    await page.waitForFunction(() => !window.VEYN_MODELS || window.VEYN_MODELS.status().ready >= window.VEYN_MODELS.status().total, null, { timeout: 120000, polling: 1000 }).catch(() => {}); await sleep(400);
    await ev(q => { const G = window.VEYN_GAME; G.Settings.quality = q; G.Perf.stepped = true; G.applyQuality(); }, quality);
    await ev(() => document.getElementById('advContinue').click()); await page.waitForFunction(() => window.VEYN_ADV.active && window.VEYN_GAME.Game.state === 'playing' && window.VEYN_GAME.Game.world, null, { timeout: 900000, polling: 1000 }); await sleep(2500);
    // jump the scene clock to just before the beat (the machine is shared and slow), let it reach the beat, freeze, shoot
    const freezeAt = async (t, name) => { await page.waitForFunction(t => { const S = window.VEYN_ADV.Scenes; if (S.active && S.t < t - 0.05) S.t = t - 0.05; return !S.active || S.t >= t; }, t, { timeout: 300000, polling: 100 });
      const r = await ev(() => { const S = window.VEYN_ADV.Scenes; S.hold = true; return { active: S.active, t: S.t, sub: document.getElementById('vhSub').style.opacity === '1' ? document.querySelector('#vhSub span').textContent : '' }; });
      await sleep(2000); await T.shot(name); out.push(name + '.png  t=' + r.t.toFixed(2) + '  "' + r.sub + '"'); await ev(() => { window.VEYN_ADV.Scenes.hold = false; }); };
    // ---- the Cage
    if (ONLY !== 'block') {
    await ev(() => { const G = window.VEYN_GAME, A = window.VEYN_ADV, p = G.Game.world.player; for (const e of A.Ents.list) if (!e.def.boss && e.f.brain) e.f.brain.update = () => {};
      p.x = p.px = 23.9; p.z = p.pz = 22.3; p.facing = p.pfacing = Math.PI / 2; G.Cam.yaw = Math.PI / 2; });
    await sleep(600); await ev(() => { const A = window.VEYN_ADV; A.talk('ilsabet'); }); await sleep(400); await ev(() => window.VEYN_ADV.dlgChoose(0));
    await freezeAt(3.3, 'G3_free_1_door'); await freezeAt(6.6, 'G3_free_2_ilsabet'); await freezeAt(9.9, 'G3_free_3_wren'); await freezeAt(13.2, 'G3_free_4_stair'); await freezeAt(17.7, 'G3_free_5_feather');
    await page.waitForFunction(() => !window.VEYN_ADV.Scenes.active, null, { timeout: 300000 }); await sleep(9000); await T.shot('G3_free_6_walk'); out.push('G3_free_6_walk.png  (9 s real time into her walk) ' + JSON.stringify(await ev(() => { const h = window.VEYN_ADV.SceneHold.f; return { ils: h && [+h.x.toFixed(2), +h.z.toFixed(2)], walking: window.VEYN_ADV.SceneWalk.on, fps: +window.VEYN_GAME.Game.fps.toFixed(1) }; })));
    }
    // ---- the Block: Odran fallen, his last words heard, the key taken; she waits at the Stair
    if (ONLY !== 'free') {
    await ev(() => { const A = window.VEYN_ADV, d = A.Save.data; A.SceneWalk.stop(); d.flags.crane_waiting = true; d.defeated.odran = true; d.flags.odran_spoke = true; d.inv.headkey = 1; d.collected.key_headkey = true; d.lantern = 'stair'; A.Save.write(); A.rest('stair'); });
    await sleep(4000); await page.waitForFunction(() => window.VEYN_GAME.Game.state === 'playing' && !window.VEYN_ADV.busy, null, { timeout: 600000, polling: 500 }); await sleep(2000);
    await ev(() => { const G = window.VEYN_GAME, p = G.Game.world.player; p.x = p.px = 1.2; p.z = p.pz = 46.5; p.facing = p.pfacing = Math.PI; G.Cam.yaw = Math.PI; });
    await page.waitForFunction(() => window.VEYN_ADV.Scenes.active && window.VEYN_ADV.Scenes.lastId === 'ilsabet_block', null, { timeout: 300000, polling: 200 });
    const dT = await ev(() => window.VEYN_ADV.Scenes.def.dur - 19.6);
    await freezeAt(3.0, 'G3_block_1_climb'); await freezeAt(6.6 + dT, 'G3_block_2_body'); await freezeAt(9.9 + dT, 'G3_block_3_wren'); await freezeAt(13.5 + dT, 'G3_block_4_ilsabet'); await freezeAt(18.0 + dT, 'G3_block_5_gate');
    await page.waitForFunction(() => !window.VEYN_ADV.Scenes.active, null, { timeout: 300000 }); await sleep(8000); await T.shot('G3_block_6_walk'); out.push('G3_block_6_walk.png  (8 s real time into her walk to the gate) ' + JSON.stringify(await ev(() => { const h = window.VEYN_ADV.SceneHold.f; return { ils: h && [+h.x.toFixed(2), +h.z.toFixed(2)], walking: window.VEYN_ADV.SceneWalk.on, fps: +window.VEYN_GAME.Game.fps.toFixed(1) }; }))); }
  } catch (e) { out.push('ERROR ' + (e && e.stack || e)); }
  console.log(out.join('\n')); console.log('page errors:', JSON.stringify(T.errors.slice(0, 5))); await T.browser.close();
})();
