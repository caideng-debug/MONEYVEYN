// chunk H2: sword-feel frames (real Chromium, swiftshader) -> shots/H2_<q>_<feel>_<moment>.png
// The page clock is replaced by fixed 1/60 s steps (deterministic, slow in wall time), and the loop stops dead on the wanted frame so the
// last presented frame is the one shot. Moments: swing (mid active window), hit (heavy, impact frame inside the hold), kick (3 frames after the
// hold), deflect (a real perfect deflect of the duelist's slash, impact frame), deflectKick (kick near its peak). feel: on / off (all H2 keys 0).
// usage: LD_LIBRARY_PATH=/workspace/veynhold/.tools/chromelibs node .test/shots_H2.js [high|low] [on|off|both]
const { launch, sleep, URL, SHOTS } = require('./t_lib.js');
const quality = process.argv[2] || 'high', FEEL = process.argv[3] || 'both', ONLY = process.argv[4] || '';
(async () => {
  const T = await launch({ storage: { veynhold_v8: JSON.stringify({ v: 8, seenTutorial: true, quality }) } }); const { page, ev } = T; const log = [];
  try {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 300000 });
    await page.waitForFunction(() => window.VEYN_GAME && window.VEYN_GAME.Game.state === 'title', null, { timeout: 300000, polling: 1000 });
    await page.waitForFunction(() => !window.VEYN_MODELS || window.VEYN_MODELS.status().ready >= window.VEYN_MODELS.status().total, null, { timeout: 180000, polling: 1000 }).catch(() => {});
    await ev(q => { const G = window.VEYN_GAME, Game = G.Game; G.Settings.quality = q; G.Perf.stepped = true; G.applyQuality();
      const of = Game.frame; window.__clk = 0; Game.frame = function (now) { if (window.__stop) return; window.__clk += 1000 / 60; of.call(this, window.__clk); window.__n = (window.__n || 0) + 1; if (window.__cond && window.__cond()) { window.__stop = true; window.__cond = null; } };
      const CN = G.P1.Cinema, cc = CN.camera; CN.camera = function () { const r = cc.apply(this, arguments); const c = window.__cam; const W = G.Game.world; if (c && W) { const P = W.player, E = W.enemies()[0], gp = G.Game.chars.get(P.id), ge = G.Game.chars.get(E.id); const px = gp.root.position.x, pz = gp.root.position.z, ex = ge.root.position.x, ez = ge.root.position.z;
          let dx = ex - px, dz = ez - pz; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l; const mx = px + (ex - px) * c.t, mz = pz + (ez - pz) * c.t, sx = dz * c.side, sz = -dx * c.side;   // side view of the pair, c.t along the line, c.side metres off it
          if (c.mode === 'tip') { const m = gp.tipW.clone().add(gp.baseW).multiplyScalar(0.5); G.camera.position.set(m.x + sx * c.d - dx * c.back, m.y + c.h, m.z + sz * c.d - dz * c.back); G.camera.lookAt(m.x, m.y, m.z); }
          else { G.camera.position.set(mx + sx * c.d - dx * c.back, c.h, mz + sz * c.d - dz * c.back); G.camera.lookAt(mx, c.ly, mz); } } return r; }; }, quality);
    await page.addStyleTag({ content: 'body * { visibility: hidden !important; } #c, canvas { visibility: visible !important; }' });
    const FEELKEYS = { bladeLag: 10, bladeKick: 1, bladeSway: 1, trailSpike: 1, hsHeavy: 0.05, hsPerfect: 0.075 };
    const setup = async (feel) => ev(([feel, K]) => { const G = window.VEYN_GAME, Game = G.Game; for (const k in K) G.VISUAL[k] = feel ? K[k] : 0; window.__stop = false; window.__cond = null;
      if (Game.world) Game.quit(); Game.start('duelist'); if (G.Intro && G.Intro.active && G.Intro.skip) G.Intro.skip(); }, [feel, FEELKEYS]);
    const place = () => ev(() => { const G = window.VEYN_GAME, W = G.Game.world, P = W.player, E = W.enemies()[0]; if (G.Intro && G.Intro.active) { if (G.Intro.skip) G.Intro.skip(); else G.Intro.active = false; }
      if (E.brain) E.brain.update = () => {}; P.maxHp = P.hp = 1e5; E.maxHp = E.hp = 1e5; P.x = P.px = 0; P.z = P.pz = 0; P.facing = P.pfacing = 0; E.x = E.px = 0; E.z = E.pz = 2.1; E.facing = E.pfacing = Math.PI; P.lockId = E.id; G.Cam.yaw = 0;
      window.__cam = { t: 0.4, side: 1, d: 2.4, back: 0.3, h: 1.55, ly: 1.3 }; });
    const waitStop = () => page.waitForFunction(() => window.__stop, null, { timeout: 600000, polling: 250 });
    const shoot = async (name) => { await sleep(700); const f = SHOTS + 'H2_' + quality + '_' + name + '.png'; await page.screenshot({ path: f }); log.push(name); };
    const settle = async (n) => { await ev(n => { const s = window.__n; window.__cond = () => window.__n >= s + n; window.__stop = false; }, n); await waitStop(); };
    const feels = FEEL === 'both' ? [true, false] : [FEEL === 'on'];
    for (const feel of feels) { const tag = feel ? 'on' : 'off';
      if (!ONLY || ONLY === 'main') {   // 1) swing: mid active window of the player's 2nd light
      await setup(feel); await settle(20); await place(); await settle(40);
      await ev(() => { const G = window.VEYN_GAME, W = G.Game.world, P = W.player; G.Input.pressed.KeyJ = true; let n = 0;
        window.__cond = () => { if (P.state === 'attack' && P.atk && P.atk.def.key !== 'p_l1') return P.atk.t >= P.atk.su + P.atk.ac * 0.5; if (P.state === 'attack' && P.atk && P.atk.t > P.atk.su + P.atk.ac && !n) { n = 1; G.Input.pressed.KeyJ = true; } return false; }; window.__stop = false; });
      await waitStop(); const sw = await ev(() => { const G = window.VEYN_GAME, c = G.Game.chars.get(G.Game.world.player.id); return { key: G.Game.world.player.atk.def.key, lag: +(c.bf ? c.bf.lag * 57.3 : 0).toFixed(2), skinned: !!c.model }; }); log.push(JSON.stringify(sw));
      await shoot(tag + '_swing');
      }
      if (!ONLY || ONLY === 'close') {   // 1b) close on the player's blade through the 2nd light: early / mid / end of the active window, and 0.1 s after (follow-through)
      for (const [fr, nm] of [[0.15, 'a'], [0.55, 'b'], [1.0, 'c'], [1.6, 'd']]) {
        await setup(feel); await settle(20); await place(); await ev(() => { window.__cam = { mode: 'tip', t: 0, side: 1, d: 1.55, back: 0.25, h: 0.25 }; }); await settle(40);
        await ev(fr => { const G = window.VEYN_GAME, W = G.Game.world, P = W.player; G.Input.pressed.KeyJ = true; let n = 0;
          window.__cond = () => { if (P.atk && P.atk.def.key !== 'p_l1') return P.atk.t >= P.atk.su + P.atk.ac * fr; if (P.state === 'attack' && P.atk && P.atk.t > P.atk.su + P.atk.ac && !n) { n = 1; G.Input.pressed.KeyJ = true; } return false; }; window.__stop = false; }, fr);
        await waitStop(); log.push('close ' + nm + ' ' + JSON.stringify(await ev(() => { const G = window.VEYN_GAME, c = G.Game.chars.get(G.Game.world.player.id); return { lag: +(c.bf ? c.bf.lag * 57.3 : 0).toFixed(2), raw: +(c.bf ? c.bf.rawLag * 57.3 : 0).toFixed(1) }; })));
        await shoot(tag + '_close_' + nm); }
      }
      if (!ONLY || ONLY === 'main') {   // 2) heavy hit: impact frame (inside the hold when feel is on), then 3 frames after the hold
      await setup(feel); await settle(20); await place(); await ev(() => { window.__cam = { t: 0.5, side: -1, d: 2.6, back: 0.2, h: 1.5, ly: 1.25 }; }); await settle(40);
      await ev(() => { const G = window.VEYN_GAME, W = G.Game.world, P = W.player, E = W.enemies()[0], hp = E.hp; G.Input.pressed.KeyK = true; window.__cond = () => E.hp < hp; window.__stop = false; });
      await waitStop(); log.push('hit hold ' + JSON.stringify(await ev(() => { const G = window.VEYN_GAME; return { hold: G.Hold.t, spike: G.Game.chars.get(G.Game.world.player.id).trail.spike }; })));
      await shoot(tag + '_hit');
      await ev(() => { const G = window.VEYN_GAME; let after = -1; window.__cond = () => { if (G.Hold.t <= 0 && after < 0) after = window.__n; return after >= 0 && window.__n >= after + 3; }; window.__stop = false; }); await waitStop();
      log.push('kick ' + JSON.stringify(await ev(() => { const G = window.VEYN_GAME, c = G.Game.chars.get(G.Game.world.player.id); return { k: c.bf && +c.bf.k.toFixed(2) }; }))); await shoot(tag + '_hitKick');
      // 3) a real perfect deflect: the duelist slashes, F is pressed 0.02 s before the strike frame
      await setup(feel); await settle(20); await place(); await ev(() => { window.__cam = { t: 0.5, side: 1, d: 2.3, back: -0.3, h: 1.6, ly: 1.35 }; }); await settle(40);
      await ev(() => { const G = window.VEYN_GAME, W = G.Game.world, P = W.player, E = W.enemies()[0], C = window.VEYN_CORE; C.startAttack(W, E, 'd_slash', { jitter: false }); let pressed = false, seen = false;
        const s0 = P.stats.perfect + P.stats.good + P.stats.late;
        window.__cond = () => { if (!pressed && E.atk && E.atk.t >= E.atk.su - 0.022) { pressed = true; G.Input.pressed.KeyF = true; } return P.stats.perfect + P.stats.good + P.stats.late > s0; }; window.__stop = false; });
      await waitStop(); log.push('deflect ' + JSON.stringify(await ev(() => { const G = window.VEYN_GAME, P = G.Game.world.player; return { perfect: P.stats.perfect, good: P.stats.good, hold: G.Hold.t }; })));
      await shoot(tag + '_deflect');
      await ev(() => { const G = window.VEYN_GAME; let after = -1; window.__cond = () => { if (G.Hold.t <= 0 && after < 0) after = window.__n; return after >= 0 && window.__n >= after + 3; }; window.__stop = false; }); await waitStop();
      log.push('dkick ' + JSON.stringify(await ev(() => { const G = window.VEYN_GAME, W = G.Game.world, c = G.Game.chars.get(W.enemies()[0].id), pc = G.Game.chars.get(W.player.id); return { atk: c.bf && +c.bf.k.toFixed(2), def: pc.bf && +pc.bf.k.toFixed(2) }; }))); await shoot(tag + '_deflectKick');
      }
    }
  } catch (e) { log.push('ERROR ' + e.message); }
  console.log(log.join('\n')); console.log('page errors', T.errors.length, JSON.stringify(T.errors.slice(0, 3))); await T.browser.close();
})();
