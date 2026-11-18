// Chunk I3: options menu (Accessibility), title Accessibility panel, debug overlay + HUD (prompt, posture, colour-blind tints)
// -> shots/I3_<quality>_*.png (real Chromium, swiftshader).  usage: node .test/shots_I3.js [high|low]
const { launch, sleep } = require('./t_lib.js'); const path = require('path'), fs = require('fs');
const URL = 'file://' + path.join(__dirname, '..', 'dist', 'index.html'), SHOTS = path.join(__dirname, '..', 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const base = { game: 'veynhold', schema: 1, created: 1, updated: 1, playTime: 600, deaths: 0, kills: 10, region: 'execution', lantern: 'stair', lit: ['grave', 'gaol', 'stair'],
  flags: { met_tamsin: true, met_ilsabet: true, combat_tutorial_seen: true, tut_deflect: true, tut_thrust: true, tut_sweep: true, tut_stealth: true, intro_odran: true, crane_freed: true, crane_waiting: true }, quests: { main: { stage: 5, log: [5], t: 1 }, crane: { stage: 1, log: [0, 1], t: 1 } },
  inv: { draught: 3, cagekey: 1 }, weapons: ['wardblade'], equip: { weapon: 'wardblade' }, upgrades: [], defeated: { m1: true }, opened: { gaoldoor: true, yardgate: true }, collected: { sword: true, key_cagekey: true }, lore: {},
  zones: { pit: true, yard: true, gaol: true, muster: true, stair: true, block: true }, hints: { h_move: true, h_lantern: true, h_lock: true, draught: true }, chapter: 1, chapterDone: false };
const quality = process.argv[2] || 'high';
(async () => {
  const out = []; const T = await launch({ storage: { veynhold_save: JSON.stringify(base), veynhold_v8: JSON.stringify({ v: 8, seenTutorial: true, quality }) } }); const { page, ev } = T;
  const shot = async (name, clip) => { const f = 'I3_' + quality + '_' + name + '.png'; await page.screenshot({ path: path.join(SHOTS, f), timeout: 300000, clip }); out.push(f); };
  try {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 300000 });
    await page.waitForFunction(() => window.VEYN_ADV && document.getElementById('advContinue') && window.VEYN_GAME.Game.state === 'title', null, { timeout: 300000, polling: 1000 });
    await page.waitForFunction(() => !window.VEYN_MODELS || window.VEYN_MODELS.status().ready >= window.VEYN_MODELS.status().total, null, { timeout: 120000, polling: 1000 }).catch(() => {}); await sleep(400);
    await ev(q => { const G = window.VEYN_GAME; G.Settings.quality = q; G.Perf.stepped = true; G.applyQuality(); }, quality);
    // title Accessibility panel
    await ev(() => document.getElementById('vhAccBtn').click()); await sleep(500); await shot('title_access');
    await ev(() => window.VEYN_ADV.Access.Panel.show(false));
    await ev(() => document.getElementById('advContinue').click()); await page.waitForFunction(() => window.VEYN_ADV.active && window.VEYN_GAME.Game.state === 'playing' && window.VEYN_GAME.Game.world, null, { timeout: 900000, polling: 1000 }); await sleep(2500);
    await ev(() => { const G = window.VEYN_GAME, A = window.VEYN_ADV, W = G.Game.world, p = W.player; for (const e of A.Ents.list) { if (!e.def.boss) { e.f.brain = null; e.mode = 'dead'; e.f.x = e.f.px = e.f.x + 300; } }
      p.x = p.px = -10; p.z = p.pz = 16; p.facing = p.pfacing = 0; G.Cam.yaw = 0; G.Cam.pitch = 0.18; });
    await sleep(1500);
    // options menu: Settings tab scrolled to the Accessibility section
    await ev(() => { const A = window.VEYN_ADV; A.openMenu(); A.menuTab = 'Settings'; A.renderMenu(); const b = document.querySelector('#advMenu .body'); b.scrollTop = b.scrollHeight; }); await sleep(700); await shot('options');
    await ev(() => { const A = window.VEYN_ADV; document.getElementById('vhAcc_cb').click(); const b = document.querySelector('#advMenu .body'); b.scrollTop = b.scrollHeight; }); await sleep(400); await shot('options_cb_on');
    await ev(() => window.VEYN_ADV.closeMenu()); await sleep(600);
    // HUD with a broken gaoler in reach (deathblow prompt) + the debug overlay (URL flag path on Low)
    await ev(() => { const G = window.VEYN_GAME, A = window.VEYN_ADV, C = window.VEYN_CORE, W = G.Game.world, p = W.player; const yaw = G.Cam.yaw;
      const e = A.Ents.spawn(W, { id: 'i3a', type: 'gaoler', x: p.x + Math.sin(yaw) * 2.2, z: p.z + Math.cos(yaw) * 2.2, face: yaw + Math.PI }); e.f.brain = null; e.mode = 'combat'; e.alert = 1;
      C.addPosture(W, e.f, 1e5); p.posture = p.postureMax * 0.9; A.Access.Overlay.url = true; A.Access.Overlay.toggle(true); });
    await sleep(1600); await shot('overlay_cb'); await shot('overlay_hud_cb', { x: 0, y: 380, width: 1280, height: 340 });
    await ev(() => window.VEYN_ADV.Access.set('cb', false)); await sleep(500); await shot('overlay'); await shot('overlay_panel', { x: 860, y: 80, width: 420, height: 300 });
    out.push('state ' + JSON.stringify(await ev(() => ({ s: window.VEYN_GAME.Game.state, q: window.VEYN_GAME.Settings.quality, dbHint: document.getElementById('dbHint').style.display, low: document.body.classList.contains('vhLow'), ov: document.getElementById('vhDbg').textContent.split('\n').slice(0, 4) }))));
  } catch (e) { out.push('ERROR ' + e.message); }
  out.push('errors ' + JSON.stringify(T.errors.slice(0, 5)));
  console.log(out.join('\n')); await T.browser.close(); process.exit(0);
})();
