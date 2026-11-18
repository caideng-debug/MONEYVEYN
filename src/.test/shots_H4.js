// Chunk H4: frames of the new combat cues for a visual check -> shots/H4_<quality>_*.png (real Chromium, swiftshader).
// usage: node .test/shots_H4.js [quality] [only]   only: regain | charge | stealth | deflect
// Guard-regain grey bar, charged-heavy flash (tip light, edge glow, ring, CHARGED), stealth prompt, late vs perfect deflect.
const { launch, sleep } = require('./t_lib.js'); const path = require('path'), fs = require('fs');
const URL = 'file://' + path.join(__dirname, '..', 'dist', 'index.html'), SHOTS = path.join(__dirname, '..', 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const base = { game: 'veynhold', schema: 1, created: 1, updated: 1, playTime: 600, deaths: 0, kills: 10, region: 'execution', lantern: 'stair', lit: ['grave', 'gaol', 'stair'],
  flags: { met_tamsin: true, met_ilsabet: true, combat_tutorial_seen: true, tut_deflect: true, tut_thrust: true, tut_sweep: true, tut_stealth: true, intro_odran: true, crane_freed: true, crane_waiting: true }, quests: { main: { stage: 5, log: [5], t: 1 }, crane: { stage: 1, log: [0, 1], t: 1 } },
  inv: { draught: 3, cagekey: 1 }, weapons: ['wardblade'], equip: { weapon: 'wardblade' }, upgrades: [], defeated: { m1: true }, opened: { gaoldoor: true, yardgate: true }, collected: { sword: true, key_cagekey: true }, lore: {},
  zones: { pit: true, yard: true, gaol: true, muster: true, stair: true, block: true }, hints: { h_move: true, h_lantern: true, h_lock: true, draught: true }, chapter: 1, chapterDone: false };
const quality = process.argv[2] || 'high', ONLY = process.argv[3] || '';
(async () => {
  const out = []; const T = await launch({ storage: { veynhold_save: JSON.stringify(base), veynhold_v8: JSON.stringify({ v: 8, seenTutorial: true, quality }) } }); const { page, ev } = T;
  const shot = async (name, clip) => { const f = 'H4_' + quality + '_' + name + '.png'; await page.screenshot({ path: path.join(SHOTS, f), timeout: 300000, clip }); out.push(f); };
  const frameWait = n => page.waitForFunction(([c, n]) => window.VEYN_GAME.Game.frameCount >= c + n || window.__h4f >= n, [0, n], { timeout: 60000 }).catch(() => {});
  try {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 300000 });
    await page.waitForFunction(() => window.VEYN_ADV && document.getElementById('advContinue') && window.VEYN_GAME.Game.state === 'title', null, { timeout: 300000, polling: 1000 });
    await page.waitForFunction(() => !window.VEYN_MODELS || window.VEYN_MODELS.status().ready >= window.VEYN_MODELS.status().total, null, { timeout: 120000, polling: 1000 }).catch(() => {}); await sleep(400);
    await ev(q => { const G = window.VEYN_GAME; G.Settings.quality = q; G.Perf.stepped = true; G.applyQuality(); }, quality);
    await ev(() => document.getElementById('advContinue').click()); await page.waitForFunction(() => window.VEYN_ADV.active && window.VEYN_GAME.Game.state === 'playing' && window.VEYN_GAME.Game.world, null, { timeout: 900000, polling: 1000 }); await sleep(2500);
    // a quiet spot in the yard; the camera looks north; every field foe frozen far away
    await ev(() => { const G = window.VEYN_GAME, A = window.VEYN_ADV, W = G.Game.world, p = W.player; for (const e of A.Ents.list) { if (!e.def.boss) { e.f.brain = null; e.mode = 'dead'; e.f.x = e.f.px = e.f.x + 300; } }
      p.x = p.px = -10; p.z = p.pz = 16; p.facing = p.pfacing = 0; G.Cam.yaw = 0; G.Cam.pitch = 0.18;
      window.__h4spawn = (type, dist, faceAway) => { const yaw = G.Cam.yaw, x = p.x + Math.sin(yaw) * dist, z = p.z + Math.cos(yaw) * dist; const e = A.Ents.spawn(W, { id: 'h4' + Math.random().toString(36).slice(2, 6), type, x, z, face: faceAway ? yaw : yaw + Math.PI });
        e.f.brain = null; if (!faceAway) { e.mode = 'combat'; e.alert = 1; } return e; };
      window.__h4clear = () => { for (const e of A.Ents.list.slice()) if (/^h4/.test(e.def.id)) { const c = G.Game.chars.get(e.f.id); if (c) c.dispose(); G.Game.chars.delete(e.f.id); const i = W.fighters.indexOf(e.f); if (i >= 0) W.fighters.splice(i, 1); A.Ents.list.splice(A.Ents.list.indexOf(e), 1); A.Ents.byF.delete(e.f.id); } };
      window.__h4freeze = on => { const FX = G.FX, V = G.V7.VFX; if (on) { window.__fxu = FX.update; FX.update = () => {}; if (V && V.update) { window.__vxu = V.update; V.update = () => {}; } G.Game.world.__frozenAdv = G.Game.world.advance; G.Game.world.advance = () => 0; }
        else { FX.update = window.__fxu; if (window.__vxu) V.update = window.__vxu; G.Game.world.advance = G.Game.world.__frozenAdv; } }; });
    await sleep(1500);
    const HUDCLIP = { x: 0, y: 560, width: 640, height: 160 };
    // ---- 1. guard regain: grey striped segment after the health bar
    if (!ONLY || ONLY === 'regain') {
      await ev(() => { const G = window.VEYN_GAME, W = G.Game.world, p = W.player, M = window.VEYN_COMBAT; window.__h4spawn('gaoler', 2.4, false); p.hp = p.maxHp * 0.62; M.rec = p.maxHp * 0.14; M.recT = W.time + 100; });
      await sleep(1500); await shot('regain_full'); await shot('regain_hud', HUDCLIP);
      await ev(() => { const M = window.VEYN_COMBAT, W = window.VEYN_GAME.Game.world; M.fxq.push({ k: 'regain', hp: 6, all: false }); M.rec -= 6; W.player.hp += 6; }); await sleep(120); await shot('regain_restore_hud', HUDCLIP);
      await ev(() => { const M = window.VEYN_COMBAT, W = window.VEYN_GAME.Game.world; M.rec = 0; M.recT = -99; W.player.hp = W.player.maxHp; window.__h4clear(); }); await sleep(600); }
    // ---- 2. charged heavy: hold until CHARGED, freeze the frame
    if (!ONLY || ONLY === 'charge') {
      await ev(() => { window.__h4spawn('gaoler', 3.4, false); }); await sleep(800);
      await ev(() => { const G = window.VEYN_GAME, M = window.VEYN_COMBAT; M.forceHold = true; G.Input.pressed.KeyK = true; });
      await page.waitForFunction(() => { const M = window.VEYN_COMBAT; return M.chg && M.chg.holding && M.chg.t > 0.3; }, null, { timeout: 60000, polling: 50 }); await shot('charge_building');
      await page.waitForFunction(() => { const M = window.VEYN_COMBAT; return M.chg && M.chg.charged && M.chg.t > 0.75; }, null, { timeout: 60000, polling: 50 }); await shot('charge_charged'); await shot('charge_charged_hud', { x: 380, y: 420, width: 520, height: 300 });
      const info = await ev(() => { const M = window.VEYN_COMBAT, $ = id => document.getElementById(id); return { chain: $('chain').textContent, op: $('chain').style.opacity, ring: $('chargeRing').style.display, cls: $('chargeRing').className, t: M.chg.t.toFixed(2), fps: +window.VEYN_GAME.Game.fps.toFixed(1) }; }); out.push('  charge state ' + JSON.stringify(info));
      await ev(() => { window.VEYN_COMBAT.forceHold = false; }); await sleep(1800); await ev(() => window.__h4clear()); await sleep(500); }
    // ---- 3. stealth prompt: 2.3 m behind an unaware gaoler
    if (!ONLY || ONLY === 'stealth') {
      await ev(() => { window.__h4stl = window.__h4spawn('gaoler', 2.3, true); window.__h4stl.alert = 0; });
      await page.waitForFunction(() => window.VEYN_COMBAT.stl === window.__h4stl, null, { timeout: 60000, polling: 50 }).catch(() => {});
      await ev(() => { window.__h4stl.alert = 0; }); await shot('stealth_prompt');
      out.push('  stealth ' + JSON.stringify(await ev(() => ({ stl: !!window.VEYN_COMBAT.stl, prompt: document.getElementById('advPrompt').textContent, cls: document.getElementById('advPrompt').className, cues: window.VEYN_COMBAT.stats.stealthCues }))));
      await ev(() => { window.__h4stl.alert = 0; window.VEYN_GAME.Input.pressed.KeyE = true; }); await sleep(900); await shot('stealth_kill');
      await sleep(2600); await ev(() => window.__h4clear()); await sleep(500); }
    // ---- 4. deflect tiers: a duelist mid-swing at contact range, then the same deflect as perfect and as late
    if (!ONLY || ONLY === 'deflect') {
      for (const q of ['good', 'perfect', 'late']) {
        await ev(q => { const G = window.VEYN_GAME, CORE = window.VEYN_CORE, W = G.Game.world, p = W.player; const e = window.__h4spawn('gaoler', 1.9, false); e.f.facing = e.f.pfacing = G.Cam.yaw + Math.PI;
          CORE.startAttack(W, e.f, 'd_slash', { jitter: false }); window.__h4e = e; window.__h4q = q; }, q);
        await page.waitForFunction(() => { const f = window.__h4e.f; return f.atk && f.atk.t >= f.atk.su; }, null, { timeout: 60000, polling: 16 });
        await ev(() => { const G = window.VEYN_GAME, W = G.Game.world, p = W.player, f = window.__h4e.f; W.events.push({ type: 'deflect', a: f.id, d: p.id, x: (p.x + f.x) / 2, z: (p.z + f.z) / 2, heavy: false, offset: window.__h4q === 'late' ? 0.03 : -0.01, quality: window.__h4q, key: 'd_slash', t: W.time });
          window.__h4fc = G.Game.frameCount || 0; });
        await sleep(70); await ev(() => window.__h4freeze(true)); await shot('deflect_' + q); await shot('deflect_' + q + '_crop', { x: 340, y: 160, width: 600, height: 420 });
        await ev(() => window.__h4freeze(false)); await sleep(1500); await ev(() => window.__h4clear()); await sleep(400); } }
  } catch (e) { out.push('ERROR ' + (e && e.stack || e)); }
  console.log(out.join('\n')); console.log('page errors:', JSON.stringify(T.errors.slice(0, 5))); await T.browser.close();
})();
