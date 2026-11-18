// Chunk H3: head / identity close-ups -> shots/H3_<tag>_<quality>_<who>_{face,body}.png + H3_<tag>_<quality>_lineup.png (real Chromium, swiftshader, 960x720).
// usage: flock /tmp/vh_browser.lock node .test/shots_H3.js <low|medium|high> <tag> [whoRegex]
// A fixed portrait camera replaces the gameplay camera (Intro.camera/weight hook); AI brains are frozen. Each subject is moved to the same open
// spot (SX, SZ) with a known facing (toward the player, who stands 4.5 m off to its front-right so NPCs keep looking at her), shot, and moved back.
// Prints per-subject head/neck heights and the draw calls per frame (renderer.info.autoReset = false, averaged over 30 frames, every pass).
const { launch, sleep } = require('./t_lib.js'); const path = require('path');
const URL = 'file://' + (process.env.H3_HTML || path.join(__dirname, '..', 'dist', 'index.html'));   // H3_HTML: shoot another build (the master 'before')
const base = { game: 'veynhold', schema: 1, created: 1, updated: 1, playTime: 600, deaths: 0, kills: 10, region: 'execution', lantern: 'stair', lit: ['grave', 'gaol', 'stair'],
  flags: { met_tamsin: true, met_ilsabet: true, combat_tutorial_seen: true, tut_deflect: true, tut_thrust: true, tut_sweep: true, tut_stealth: true, intro_odran: true, crane_freed: true, crane_waiting: true },
  quests: { main: { stage: 5, log: [5], t: 1 }, crane: { stage: 2, log: [0, 1, 2], t: 1 } },
  inv: { draught: 3 }, weapons: ['wardblade'], equip: { weapon: 'wardblade' }, upgrades: [], defeated: {}, opened: { gaoldoor: true, yardgate: true }, collected: { sword: true, key_cagekey: true }, lore: {},
  zones: { pit: true, yard: true, gaol: true, muster: true, stair: true, block: true }, hints: { h_move: true, h_lantern: true, h_lock: true, draught: true }, chapter: 1, chapterDone: false };
const quality = process.argv[2] || 'high', TAG = process.argv[3] || 'x', ONLY = process.argv[4] || '';
const SX = 6.0, SZ = 25.0;
(async () => {
  const out = []; const T = await launch({ viewport: { width: 960, height: 720 }, storage: { veynhold_save: JSON.stringify(base), veynhold_v8: JSON.stringify({ v: 8, seenTutorial: true, quality }) } }); const { page, ev } = T;
  const shot = async name => { await page.screenshot({ path: path.join(__dirname, '..', 'shots', name + '.png'), timeout: 300000 }); return name + '.png'; };
  // draw calls per frame: autoReset off, reset, count N of our own rAF ticks (one per game frame), divide
  const calls = () => page.evaluate(() => new Promise(res => { const R = window.VEYN_GAME.renderer, I = R.info; I.autoReset = false; I.reset(); let n = 0; const N = 30;
    const tick = () => { if (++n < N) return requestAnimationFrame(tick); const c = I.render.calls, t = I.render.triangles; I.autoReset = true; res({ calls: Math.round(c / (N - 1)), tris: Math.round(t / (N - 1)) }); };
    requestAnimationFrame(() => { I.reset(); requestAnimationFrame(tick); }); }));
  try {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 300000 });
    await page.waitForFunction(() => window.VEYN_ADV && document.getElementById('advContinue') && window.VEYN_GAME.Game.state === 'title', null, { timeout: 300000, polling: 1000 });
    await page.waitForFunction(() => !window.VEYN_MODELS || window.VEYN_MODELS.status().ready >= window.VEYN_MODELS.status().total, null, { timeout: 120000, polling: 1000 }).catch(() => {}); await sleep(400);
    await ev(q => { const G = window.VEYN_GAME; G.Settings.quality = q; G.Perf.stepped = true; G.applyQuality(); }, quality);
    await ev(() => document.getElementById('advContinue').click()); await page.waitForFunction(() => window.VEYN_ADV.active && window.VEYN_GAME.Game.state === 'playing' && window.VEYN_GAME.Game.world, null, { timeout: 900000, polling: 1000 }); await sleep(2500);
    await ev(() => { const G = window.VEYN_GAME, A = window.VEYN_ADV, I = G.Intro; for (const e of A.Ents.list) { if (e.f.brain) e.f.brain.update = () => {}; if (e.brain) e.brain.update = () => {}; }
      A.checkBoss = () => {};   // a boss parked next to her would start its fight (Sallow: engage -> combat -> reset with new fighter ids), so no boss fights while shooting
      window.__H3 = { on: false, pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 30 }; const H = window.__H3; const iw = I.weight, ic = I.camera;
      I.weight = function () { return H.on ? 1 : iw.call(this); }; I.camera = function (a) { if (!H.on) return ic.call(this, a); if (H.follow) H.follow(); const gy = G.Cam.gy || 0; this.pos.copy(H.pos).setY(H.pos.y - gy); this.look.copy(H.look).setY(H.look.y - gy); this.fov = H.fov; return true; };
      // every DOM overlay off (HUD, objective, compass, prompts, target bar): only the canvas stays
      const cv = G.renderer.domElement; const hide = () => { for (const el of document.body.children) if (!el.contains(cv)) el.style.setProperty('visibility', 'hidden', 'important'); }; hide(); setInterval(hide, 500);
      // foes: held out of the perception / patrol loop (the boss-finisher hold), standing still
      for (const e of A.Ents.list) { e.f.intent.mx = e.f.intent.mz = 0; e.h3 = { home: e.home, mode: e.mode }; e.alert = -1e6; if (e.mode === 'patrol') e.mode = 'idle'; }   // never spots her, never patrols
      // NPCs parked 60 m east (culled) unless they are the subject
      window.__H3park = {}; for (const k in A.npcs) { const f = A.npcs[k].f; window.__H3park[k] = [f.x, f.z, f.facing]; f.x = f.px = f.x + 60; } });
    // subjects: player, the NPCs, one enemy per type present in the region
    const subjects = await ev(() => { const G = window.VEYN_GAME, A = window.VEYN_ADV, W = G.Game.world, P = W.player; const L = [{ who: 'player', id: P.id }];
      for (const k in A.npcs) if (A.npcs[k].c) L.push({ who: k, npc: k }); const seen = {};
      for (const e of A.Ents.list) { const t = e.def.type; if (seen[t] || e.f.dead) continue; seen[t] = 1; L.push({ who: t, id: e.f.id }); } return L; });
    const sub = (s, sx, sz, face, px, pz) => ev(([s, sx, sz, face, px, pz]) => { const G = window.VEYN_GAME, A = window.VEYN_ADV, P = G.Game.world.player; const c = s.npc ? A.npcs[s.npc].c : G.Game.chars.get(s.id), f = c.f;
      if (!s.home) s.home = s.npc ? window.__H3park[s.npc] : [f.x, f.z, f.facing];
      if (f.intent) { f.intent.mx = f.intent.mz = 0; } f.vx = f.vz = f.pvx = f.pvz = 0; f.aiFace = face;
      const e = A.Ents.byF.get(f.id); if (e) { e.home = { x: sx, z: sz }; e.alert = -1e6; if (e.mode !== 'idle') e.mode = 'idle'; e.path = null; }   // leash / return-home would walk it back
      f.x = f.px = sx; f.z = f.pz = sz; f.facing = f.pfacing = face; if (c.visFacing !== undefined) c.visFacing = c.prevVis = face;
      if (s.who !== 'player') { P.x = P.px = px; P.z = P.pz = pz; P.facing = P.pfacing = Math.atan2(sx - px, sz - pz); }
      return { home: s.home, name: f.name || s.who, q: !!(c.model && c.model.q), key: c.model ? c.model.key : 'rig', look: c.lookKey }; }, [s, sx, sz, face, px, pz]);
    const arrive = (s, x, z) => page.waitForFunction(([s, x, z]) => { const G = window.VEYN_GAME, A = window.VEYN_ADV; const c = s.npc ? A.npcs[s.npc].c : G.Game.chars.get(s.id);
      return c && Math.hypot(c.root.position.x - x, c.root.position.z - z) < 0.05; }, [s, x, z], { timeout: 30000, polling: 300 }).catch(() => out.push('WARN ' + s.who + ' did not arrive'));
    for (const s of subjects) { if (ONLY && !new RegExp(ONLY).test(s.who)) continue; try {
      const face = 0.6, px = SX + Math.sin(face) * 4.5, pz = SZ + Math.cos(face) * 4.5;   // the player stands where the subject looks
      // a foe whose Character is not built yet (bosses spawn theirs when she comes near): walk her over first, else skip it
      const has = () => ev(s => { const G = window.VEYN_GAME, A = window.VEYN_ADV; return !!(s.npc ? A.npcs[s.npc] && A.npcs[s.npc].c : G.Game.chars.get(s.id)); }, s);
      if (!(await has())) { await ev(s => { const A = window.VEYN_ADV, P = window.VEYN_GAME.Game.world.player, e = A.Ents.list.find(e => e.f.id === s.id); if (e) { P.x = P.px = e.f.x + 3; P.z = P.pz = e.f.z + 3; } }, s); await sleep(4000);
        if (!(await has())) { out.push('SKIP ' + s.who + ' (no Character)'); continue; } }
      const info = await sub(s, SX, SZ, face, px, pz); s.home = info.home; delete info.home;
      await arrive(s, SX, SZ); await sleep(2500);
      for (const kind of ['face', 'body']) {
        const m = await ev(([s, kind]) => { const G = window.VEYN_GAME, A = window.VEYN_ADV; const c = s.npc ? A.npcs[s.npc].c : G.Game.chars.get(s.id); const H = window.__H3;
          const hp = new THREE.Vector3(), np = new THREE.Vector3(), pp = new THREE.Vector3();
          // the camera follows the subject every frame (a turning player would otherwise show her back)
          H.follow = () => { const M = c.model, hb = M && M.byName.Head; (hb || c.head).getWorldPosition(hp); const th = c.root.rotation.y, fx = Math.sin(th), fz = Math.cos(th), sx = Math.cos(th), sz = -Math.sin(th), gy = c.root.position.y;
            if (kind === 'face') { H.pos.set(hp.x + fx * 1.15 + sx * 0.45, hp.y + 0.1, hp.z + fz * 1.15 + sz * 0.45); H.look.set(hp.x, hp.y + 0.06, hp.z); H.fov = 28; }
            else { H.pos.set(c.root.position.x + fx * 3.6 + sx * 1.3, gy + 1.25, c.root.position.z + fz * 3.6 + sz * 1.3); H.look.set(c.root.position.x, gy + 0.95 * (c.look.scale || 1), c.root.position.z); H.fov = 34; } };
          c.root.updateMatrixWorld(true); const M = c.model, hb = M && M.byName.Head, nb = M && M.byName.Neck, pb = M && M.byName.Hips; (hb || c.head).getWorldPosition(hp); if (nb) nb.getWorldPosition(np); if (pb) pb.getWorldPosition(pp);
          const gy = c.root.position.y; H.follow(); H.on = true;
          return { headY: +(hp.y - gy).toFixed(3), neckY: nb ? +(np.y - gy).toFixed(3) : null, hipsY: pb ? +(pp.y - gy).toFixed(3) : null, headNeck: nb ? +hp.distanceTo(np).toFixed(3) : null, fit: M && M.fit ? M.fit : null }; }, [s, kind]);
        await sleep(1800); const dc = await calls();
        const n = 'H3_' + TAG + '_' + quality + '_' + s.who + '_' + kind; await shot(n); out.push(n + '.png ' + JSON.stringify(Object.assign({}, info, kind === 'face' ? m : {}, dc)));
      }
      if (s.who !== 'player') await sub(s, s.npc ? s.home[0] + 60 : s.home[0], s.home[1], s.home[2], SX, SZ);
      await ev(() => { window.__H3.on = false; window.__H3.follow = null; });
    } catch (e) { out.push('ERR ' + s.who + ' ' + (e && e.message || e).split('\n')[0]); } }
    // line-up: everyone side by side facing the camera (also the draw-call reading with every character in view)
    if (!ONLY) { const row = subjects.filter(s => s.who !== 'player' && s.home), n = row.length + 1, xs = j => SX + (j - (n - 1) / 2) * 1.0, pj = Math.floor(n / 2);
      const LZ = SZ - 4;   // the row stands 4 m south of the portrait spot: a camera 7.6 m north of (6, 25) sat in the yard wall and saw only fog
      let j = 0; for (const s of row) { if (j === pj) j++; s.lx = xs(j); await sub(s, xs(j), LZ, 0, xs(pj), LZ); j++; }
      await ev(([x, SZ, row]) => { const G = window.VEYN_GAME, A = window.VEYN_ADV, P = G.Game.world.player; P.x = P.px = x; P.z = P.pz = SZ; P.facing = P.pfacing = 0;
        for (const s of row) { const c = s.npc ? A.npcs[s.npc].c : G.Game.chars.get(s.id); Object.defineProperty(c.f, 'facing', { get: () => 0, set() {}, configurable: true }); }   // NPCs would turn to face her
        const H = window.__H3; H.follow = null; H.pos.set(x, 1.3, SZ + 6.2); H.look.set(x, 1.0, SZ); H.fov = 58; H.on = true; }, [xs(pj), LZ, row]);
      for (const s of row) await arrive(s, s.lx, LZ); await sleep(2500); const dc = await calls(); const n2 = 'H3_' + TAG + '_' + quality + '_lineup'; await shot(n2);
      const order = []; j = 0; for (const s of row) { if (j === pj) { order.push('player'); j++; } order.push(s.who); j++; } if (pj >= j) order.push('player');
      out.push(n2 + '.png ' + JSON.stringify(Object.assign({ order }, dc)));
      await ev(row => { const G = window.VEYN_GAME, A = window.VEYN_ADV; for (const s of row) { const c = s.npc ? A.npcs[s.npc].c : G.Game.chars.get(s.id); delete c.f.facing; c.f.facing = 0; } }, row);
      for (const s of row) await sub(s, s.home[0], s.home[1], s.home[2], SX, SZ); }   // NPCs back home too (un-parked)
    await ev(() => { window.__H3.on = false; }); await sleep(1500);
    out.push('gameplay ' + JSON.stringify(Object.assign(await calls(), { fps: await ev(() => window.VEYN_GAME.Game.fps) })));
  } catch (e) { out.push('ERROR ' + (e && e.stack || e)); }
  console.log(out.join('\n')); console.log('page errors:', JSON.stringify(T.errors.slice(0, 5))); await T.browser.close();
})();
