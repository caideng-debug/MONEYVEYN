// chunk WORLD: Phase 1 world layout audit in headless Chromium.
// usage: LD_LIBRARY_PATH=/workspace/veynhold/.tools/chromelibs flock /tmp/vh_browser.lock node .test/world_audit.js <mode> [quality] [tag] [html]
//   mode = audit  -> analytic report (.test/world_audit_<quality>.json): prop contact, floor vs height field, colliders, wall gaps,
//                    reachability, interact crowding, kill-spot clutter, plus a collision walker along the main routes
//          shots  -> free-camera survey screenshots shots/world/<tag>_<quality>_<view>.png (every area + every interactable)
//          perf   -> fixed-camera frame time at 6 stations (median ms over ~4 s each)
// Start state: a seeded save (Continue) with every foe defeated (no foe walks into views / routes). Paths relative to this worktree.
const path = require('path'), fs = require('fs');
const { chromium } = require('/workspace/veynhold/.tools/node_modules/playwright-core');
const ROOT = path.resolve(__dirname, '..');
const MODE = process.argv[2] || 'audit', Q = process.argv[3] || 'medium', TAG = process.argv[4] || 'after', HTML = path.resolve(process.argv[5] || path.join(ROOT, 'dist/index.html')), ONLY = process.argv[6] ? new RegExp(process.argv[6]) : null;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ENEMIES = ['y1', 'y2', 'y3', 'g1', 'g3', 'g5', 'm1', 'm2', 'm5', 'm6', 'o1', 'sallow', 'odran'];
const save = { game: 'veynhold', schema: 1, created: 1, updated: 1, playTime: 600, deaths: 0, kills: 12, region: 'execution', lantern: 'grave', lit: ['grave', 'gaol', 'stair'],
  flags: { met_tamsin: true, combat_tutorial_seen: true, tut_deflect: true, tut_thrust: true, tut_sweep: true, tut_stealth: true, intro_odran: true, clue_gaolkey: true, lit_grave: true },
  quests: { main: { stage: 6, log: [6], t: 1 } }, inv: { draught: 3 }, weapons: ['wardblade'], equip: { weapon: 'wardblade' },
  upgrades: [], defeated: Object.fromEntries(ENEMIES.map(k => [k, MODE === 'perf' ? false : true])), opened: {}, collected: {}, lore: {},
  zones: { pit: true, cut: true, yard: true, gaol: true, muster: true, stair: true, block: true, hgate: true, oss: true },
  hints: { h_move: true, h_lantern: true, h_lock: true, h_order: true, h_breach: true, h_pen: true, draught: true }, chapter: 1, chapterDone: false };
if (MODE === 'perf') save.defeated = {};

(async () => {
  const b = await chromium.launch({ executablePath: '/workspace/veynhold/.tools/browsers/chromium-1134/chrome-linux/chrome', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: MODE === 'perf' ? { width: 960, height: 540 } : { width: 1280, height: 720 } }); const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 400)); });
  await p.addInitScript(s => { localStorage.setItem('veynhold_save', s); localStorage.setItem('veynhold_v8', JSON.stringify({ v: 8, seenTutorial: true })); }, JSON.stringify(save));
  await p.goto('file://' + HTML, { timeout: 300000, waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.VEYN_ADV && window.VEYN_GAME && window.VEYN_GAME.Game.state === 'title', null, { timeout: 240000 });
  await p.waitForFunction(() => !window.VEYN_MODELS || window.VEYN_MODELS.status().ready >= window.VEYN_MODELS.status().total, null, { timeout: 120000 }).catch(() => {});
  await p.waitForFunction(() => window.VEYN_ADV.QP && window.VEYN_ADV.QP.ready, null, { timeout: 60000 }).catch(() => {});
  await p.evaluate(q => { const G = window.VEYN_GAME; G.Settings.quality = q; G.Perf.stepped = true; G.applyQuality(); G.Settings.intros = false; if (G.Intro) G.Intro.enabled = false; }, Q);
  await p.evaluate(() => document.getElementById('advContinue').click());
  await p.waitForFunction(() => { const A = window.VEYN_ADV, G = window.VEYN_GAME; return A.active && G.Game.state === 'playing' && G.Game.world; }, null, { timeout: 600000, polling: 1000 }); await sleep(1500);
  await p.evaluate(() => { const A = window.VEYN_ADV, G = window.VEYN_GAME, P = G.Game.world.player; P.maxHp = P.hp = 1e5; A._sb = A.startBoss; A.startBoss = () => {}; });

  if (MODE === 'audit') {
    const rep = await p.evaluate(fs.readFileSync(path.join(__dirname, 'world_audit_page.js'), 'utf8'));
    rep.walk = await p.evaluate(ROUTES_FN());
    rep.quality = Q; rep.errors = errs;
    const out = path.join(__dirname, 'world_audit_' + Q + '.json'); fs.writeFileSync(out, JSON.stringify(rep, null, 1));
    const s = r => r.length; console.log('audit', Q, JSON.stringify({ props: s(rep.props), floatProps: rep.props.filter(x => x.flag.length).length, floatParts: s(rep.floatParts), floor: s(rep.floor), colliders: s(rep.colliders), wallGaps: s(rep.wallGaps), unreachable: rep.reach.filter(x => !x.ok).length, crowd: s(rep.interact), walk: rep.walk.map(w => w.name + ':' + (w.ok ? 'ok' : 'STUCK')).join(' '), pointIssues: rep.pointIssues.length, errs: errs.length }));
  } else if (MODE === 'shots') {
    await p.evaluate(() => { const G = window.VEYN_GAME, Ci = G.P1.Cinema, o = Ci.camera.bind(Ci); Ci.camera = a => { o(a); const s = window.__shot, W = G.Game.world; const pc = W && G.Game.chars.get(W.player.id); if (pc && pc.root) { const vis = !s || !!s.wren; pc.root.visible = vis; for (const cl of [pc.clothCape, pc.clothScarf, pc.clothSash]) if (cl && cl.mesh) cl.mesh.visible = vis; }
      if (s) { G.camera.position.set(s.pos[0], s.pos[1], s.pos[2]); G.camera.lookAt(s.at[0], s.at[1], s.at[2]); } }; });
    const V = VIEWS(); fs.mkdirSync(path.join(ROOT, 'shots/world'), { recursive: true }); let n = 0;
    for (const [name, cx, cy, cz, lx, ly, lz, wren] of V) { if (ONLY && !ONLY.test(name)) continue;
      await p.evaluate(([cx, cy, cz, lx, ly, lz, wren]) => { const G = window.VEYN_GAME, A = window.VEYN_ADV, P = G.Game.world.player, g = (x, z) => A.Region.groundY(x, z);
        P.x = P.px = lx; P.z = P.pz = lz; G.Cam.lookSm.set(lx, 1.5 + g(lx, lz), lz); window.__shot = { pos: [cx, g(cx, cz) + cy, cz], at: [lx, g(lx, lz) + ly, lz], wren }; }, [cx, cy, cz, lx, ly, lz, !!wren]);
      await sleep(1600); await p.screenshot({ path: path.join(ROOT, 'shots/world', TAG + '_' + Q + '_' + name + '.png'), timeout: 120000 }); n++; }
    console.log('shots', n, 'errors', JSON.stringify(errs.slice(0, 5)));
  } else if (MODE === 'perf') {
    // fixed stations, player parked, foes frozen in place (no AI): median frame ms from rAF deltas over ~4 s each (SwiftShader: relative only)
    await p.evaluate(() => { const A = window.VEYN_ADV; for (const e of A.Ents.list) { e.f.brain = null; if (e.brain) e.brain.update = () => {}; } window.VEYN_GAME.Perf.stepped = false; });
    const ST = [['pit', 0, -70, 0], ['yard', 0, -50, 0], ['gaol', -30, -34, -1.57], ['muster', -10, 0, 0.5], ['block', 0, 40, 0], ['oss', 40, -28, 1.57]]; const res = {};
    for (const [nm, x, z, yaw] of ST) { const ms = await p.evaluate(([x, z, yaw]) => new Promise(done => { const G = window.VEYN_GAME, P = G.Game.world.player; P.x = P.px = x; P.z = P.pz = z; P.facing = P.pfacing = yaw; G.Cam.yaw = yaw; G.Cam.pitch = 0.3;
        let last = 0, t0 = performance.now(); const d = []; const f = now => { if (last) d.push(now - last); last = now; if (now - t0 < 5000) requestAnimationFrame(f); else { d.splice(0, 20); d.sort((a, b) => a - b); done({ med: d[d.length >> 1], p90: d[Math.floor(d.length * 0.9)], n: d.length, calls: G.renderer.info.render.calls, tris: G.renderer.info.render.triangles }); } }; requestAnimationFrame(f); }), [x, z, yaw]);
      res[nm] = ms; }
    console.log('perf', Q, path.basename(HTML), JSON.stringify(res)); fs.appendFileSync(path.join(__dirname, 'world_perf.jsonl'), JSON.stringify({ q: Q, html: HTML, tag: TAG, res, t: Date.now() }) + '\n');
  }
  await b.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });

/* collision walker: a 0.45 m circle steered straight at each waypoint at 4.5 m/s, 60 Hz, through the live Region.collide (gates opened).
   'J' waypoints are crossed airborne (vault). Reports stuck legs (no progress for 1.5 s) and height steps > 0.25 m in one step (pop / drop). */
function ROUTES_FN() { return `(function(){ const A = window.VEYN_ADV, Reg = A.Region; const was = {}; for (const k in Reg.gates) { was[k] = Reg.gates[k].seg.on; Reg.gates[k].seg.on = false; }
  const ROUTES = ${JSON.stringify(ROUTES())}; const out = [];
  for (const [name, pts] of ROUTES) { const f = { x: pts[0][0], z: pts[0][1], radius: 0.45 }; let ok = true, legs = [], maxStep = 0, stepAt = null;
    for (let i = 1; i < pts.length; i++) { const [tx, tz, fl] = pts[i]; let t = 0, bestD = 1e9, lastBest = 0, prevY = Reg.groundY(f.x, f.z);
      while (true) { const dx = tx - f.x, dz = tz - f.z, d = Math.hypot(dx, dz); if (d < 0.35) break; const s = Math.min(d, 4.5 / 60); f.x += dx / d * s; f.z += dz / d * s; Reg.collide(f, fl === 'J'); t += 1 / 60;
        const y = Reg.groundY(f.x, f.z), st = Math.abs(y - prevY); if (st > maxStep) { maxStep = st; stepAt = [+f.x.toFixed(2), +f.z.toFixed(2)]; } prevY = y;
        if (d < bestD - 0.05) { bestD = d; lastBest = t; } if (t - lastBest > 1.5) { ok = false; legs.push({ leg: i, to: [tx, tz], stuckAt: [+f.x.toFixed(2), +f.z.toFixed(2)], left: +d.toFixed(2) }); f.x = tx; f.z = tz; break; } } }
    out.push({ name, ok, legs, maxStep: +maxStep.toFixed(2), stepAt }); }
  for (const k in was) Reg.gates[k].seg.on = was[k]; return out; })()`; }
function ROUTES() { return [
  ['pit_to_yard', [[0, -73], [0, -62], [-1.6, -58.5], [-1.6, -56], [0, -54.5], [0, -50], [-8, -46], [-10, -40], [-8, -30], [0, -22], [0, -17], [0, -13], [0, -8]]],
  ['gallows_climb', [[0, -44], [0, -41.6], [0, -38.2], [0, -36.5], [4.5, -36.5], [-4.5, -36.5], [0, -37.5], [0, -42]]],
  ['yard_to_gaol', [[-10, -40], [-18, -34], [-24, -34], [-36, -34], [-43, -34], [-43, -29], [-43, -24], [-40, -27], [-43, -31.5], [-43, -34], [-53, -34], [-53, -24], [-54.3, -21.5], [-54.3, -18], [-53, -13], [-53, -8], [-44, -4], [-30, 4]]],
  ['muster_to_block', [[-30, 4], [-14, 14], [-2, 20], [0, 26], [0, 29.5], [0, 31.4], [0, 33], [0, 35.4], [0, 38], [0, 45], [6, 50], [0, 56], [0, 62], [0, 66], [0, 69.5]]],
  ['block_ring', [[0, 38], [10, 42], [12, 50], [10, 58], [0, 61], [-10, 58], [-12, 50], [-10, 42], [0, 38]]],
  ['ossuary', [[14, -28], [20.5, -28], [23.5, -28, 'J'], [30, -28], [36, -28], [45, -28], [50, -36], [44, -22], [44, -16], [44, -13], [44, -10], [40, -4]]],
  ['muster_loop', [[0, -8], [20, -4], [34, 2], [36, 16], [30, 26], [14, 20], [-10, 26], [-30, 26], [-44, 12], [-50, 0], [-40, -6], [0, -8]]],
  ['wagon_pen', [[34, 22], [37.5, 22], [40, 22, 'J'], [44, 24], [46, 26]]],
]; }
/* survey views: [name, cam x, cam y-above-ground, cam z, look x, look y-above-ground, look z] */
function VIEWS() { const v = (n, cx, cy, cz, lx, ly, lz, w) => [n, cx, cy, cz, lx, ly, lz, w];
  return [
    // areas
    v('a_pit_wide', 7, 4.5, -76.5, -2, 0.3, -66), v('a_pit_north', -6, 3, -63.6, 2, 0.5, -72), v('a_cut', 0, 2.4, -61, 0, 1.2, -52),
    v('a_yard_south', 0, 5, -52.5, 0, 1, -30), v('a_yard_east', 19, 4, -48, -6, 1, -30), v('a_yard_north', -16, 4, -19, 6, 1, -44), v('a_yard_breach', 14, 2.5, -27, 26, 0.8, -28),
    v('a_gaol_corr', -23.5, 2.2, -34, -50, 1, -34), v('a_gaol_cells', -36, 2.2, -33, -36, 0.3, -42), v('a_gaol_office', -39.5, 2.6, -22.5, -47, 0.8, -29), v('a_gaol_corrB', -53, 2.4, -35.5, -53, 1, -13),
    v('a_muster_w', -55, 5, -9, -20, 1, 18), v('a_muster_e', 45, 5, -9, 10, 1, 20), v('a_muster_n', 0, 6, 27, 0, 1, -6), v('a_pen', 30, 3, 16, 44, 0.8, 25),
    v('a_stair', 0, 2.5, 22, 0, 1.8, 35), v('a_stair_landing', -3, 2.8, 31.7, 2, 1.0, 34), v('a_block_s', 0, 4, 37, 0, 1, 56), v('a_block_n', 0, 4.5, 63, 0, 1, 42), v('a_block_e', 12, 3.5, 50, -8, 1, 50), v('a_hgate', 0, 3, 61, 0, 3, 71),
    v('a_oss_pass', 23, 2.2, -28, 36, 1, -28), v('a_oss_w', 36, 3, -40, 50, 1, -20), v('a_oss_e', 54, 3, -16, 40, 1, -36), v('a_oss_gate', 44, 2.5, -20, 44, 1.5, -12),
    v('a_horizon_n', 0, 6, 40, 0, 9, 62), v('a_horizon_s', 0, 4, -64, 0, 6, -76), v('a_horizon_w', -40, 4, 10, -56, 7, 12), v('a_horizon_e', 30, 4, 4, 46, 7, 6), v('a_horizon_ne', -2, 4.5, -60, 6, 6, -74),
    // interactables (lanterns, gates, lever, pickups, notes, NPCs)
    v('i_lantern_grave', -2.5, 1.8, -60, 0, 0.8, -57.5), v('i_lantern_gaol', -54.5, 1.8, -22.5, -52.6, 0.8, -19.5), v('i_lantern_stair', -1.8, 2.2, 31.0, 2.2, 0.8, 33),
    v('i_gate_yard', 0, 2.2, -21, 0, 2, -16), v('i_gate_gaol', -53, 2.2, -17, -53, 2, -12), v('i_gate_oss', 44, 2.2, -18.5, 44, 1.5, -13), v('i_gate_fog', 0, 2.4, 33, 0, 2, 37), v('i_gate_hollow', 0, 3, 63, 0, 3, 70),
    v('i_lever', 1.5, 1.8, -7.5, 4.6, 0.8, -10.2), v('i_sword', 1.5, 1.4, -70.5, 3.6, 0.4, -72.6), v('i_tag_pell', -40, 1.3, -38.6, -40, 0.1, -41.4), v('i_tag_ilke', 48, 1.3, -37.6, 50.2, 0.1, -40.2), v('i_tag_jory', 42, 1.4, 24, 44.2, 0.1, 26.9),
    v('i_tithe', 50.5, 1.8, -28, 53.6, 1.0, -27.9), v('i_note_order', -1.6, 1.6, -61.6, -3.3, 1.2, -63.5), v('i_note_writ', -3.5, 1.6, -44.5, -2.5, 1.4, -41.7), v('i_note_tally', -43.5, 1.8, -25, -46.5, 0.9, -23),
    v('i_note_hymn', 38, 1.7, -38, 35.1, 1.0, -40.5), v('i_note_roll', -21.5, 1.7, -0.8, -24, 0.9, 1.5), v('i_note_conf', 2, 2, 56.5, 0, 0.6, 59.5),
    v('i_npc_tamsin', -2, 1.7, -66, -5.2, 1.2, -67), v('i_npc_ilsabet', 23, 1.8, 19, 26, 1.2, 22), v('i_npc_wait', 4, 1.8, 24, 7.2, 1.2, 26.2), v('i_npc_gate', 0, 1.8, 63.5, 2.6, 1.2, 66),
    // chunk WORLD fix close-ups (before / after)
    v('f_wallnotice', 5.6, 1.7, 26.6, 5.6, 1.7, 29.2), v('f_carving', -1.0, 1.9, 32.7, -3.6, 1.3, 32.7), v('f_rack', -37.6, 1.6, -26.6, -39, 0.8, -29), v('f_skullwall', 45, 1.6, -38.2, 45, 0.6, -41.5),
    v('f_bonepile', 49.2, 1.8, -35.2, 52, 0.3, -38), v('f_wagon', 34.5, 2.2, 17.5, 41, 0.6, 22), v('f_altar', 49.2, 1.9, -26.4, 53.5, 0.7, -27.6), v('f_ossdoor', 29.5, 1.9, -28, 36, 1.2, -30.2), v('f_bonewall', 40, 1.7, -24, 46, 1.6, -14.6), v('f_graves', -1.5, 1.7, -72.5, -4.4, 0.6, -74.5),
    // kill spots (deathblow framing distance ~2.5-4 m): the camera height a finisher uses
    v('k_y2_corner', -6, 2.0, -40, -9, 1.2, -42), v('k_gaol_g1', -31, 1.8, -33, -28, 1.2, -34), v('k_g3_office', -40, 1.8, -27, -43, 1.2, -25.5), v('k_m1', 22, 2, 9, 18, 1.2, 6),
    v('k_m6', -5, 2, 13, -8, 1.2, 16), v('k_o1', 41, 2, -34, 38, 1.2, -36), v('k_sallow', 44, 2, -31, 47, 1.2, -30), v('k_odran', 2.5, 2.2, 52, 0, 1.2, 55),
  ]; }
