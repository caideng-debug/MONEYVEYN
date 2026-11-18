// chunk G4: dash + world camera checks in headless Chromium (playwright-core) with real keyboard input (page.keyboard).
// Deterministic: once in the world the page's requestAnimationFrame is switched to a manual 60 fps clock (window.__tick), so every
// key press lands on a known frame; rendering, Input, the sim and the camera run exactly as in play.
// Hooks (read-only, or test-start placement like t_lib's T.place): place the player, hold the lock-on dummy (g1) still, aim the camera
// toward the next waypoint at <= 3 rad/s (a stand-in for the mouse; headless pointer lock is unavailable).
// usage: LD_LIBRARY_PATH=/workspace/veynhold/.tools/chromelibs node .test/dash_cam.js [quality=low]   (writes .test/dash_cam_result.json)
const L = require('./t_lib.js'); const { launch, boot, sleep } = L; const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, 'dash_cam_result.json'); const QUALITY = process.argv[2] || 'low';
const ENEMIES = ['y1', 'y2', 'y3', 'g3', 'g5', 'm1', 'm2', 'm5', 'm6', 'o1', 'sallow', 'odran'];   // g1 stays alive: the lock-on dummy
const save = { game: 'veynhold', schema: 1, created: 1, updated: 1, playTime: 600, deaths: 0, kills: 12, region: 'execution', lantern: 'stair', lit: ['grave', 'gaol', 'stair'],
  flags: { met_tamsin: true, combat_tutorial_seen: true, tut_deflect: true, tut_thrust: true, tut_sweep: true, tut_stealth: true, intro_odran: true, clue_gaolkey: true, lit_grave: true },
  quests: { main: { stage: 6, log: [6], t: 1 } }, inv: { draught: 3 }, weapons: ['wardblade'], equip: { weapon: 'wardblade' },
  upgrades: [], defeated: Object.fromEntries(ENEMIES.map(k => [k, true])), opened: {}, collected: { sword: true }, lore: {},
  zones: { pit: true, cut: true, yard: true, gaol: true, muster: true, stair: true, block: true, hgate: true, oss: true },
  hints: { h_move: true, h_lantern: true, h_lock: true, h_order: true, h_breach: true, h_pen: true, draught: true }, chapter: 1, chapterDone: false };
const storage = { veynhold_save: JSON.stringify(save), veynhold_v8: JSON.stringify({ v: 8, seenTutorial: true }) };
const f2 = v => (+v).toFixed(2), f3 = v => (+v).toFixed(3);
const results = []; const metrics = {}; let T;
const rec = (name, pass, notes) => { results.push({ name, status: pass ? 'PASS' : 'FAIL', notes: [].concat(notes || []) }); console.log((pass ? 'PASS ' : 'FAIL ') + name + ' | ' + [].concat(notes || []).join(' | ')); };

(async () => {
  T = await launch({ viewport: { width: 960, height: 540 }, storage });
  await T.ctx.addInitScript(() => {   // manual frame clock (off until __man is set)
    const raf = window.requestAnimationFrame.bind(window); window.__q = []; window.__man = false;
    window.requestAnimationFrame = cb => { if (window.__man) { window.__q.push(cb); return 1; } return raf(cb); };
    window.__tick = n => { for (let i = 0; i < n; i++) { window.__t += 1000 / 60; if (window.__pre) window.__pre(i); const q = window.__q.splice(0); for (const cb of q) cb(window.__t); if (window.__post) window.__post(i); } };
  });
  const ev = T.ev, page = T.page;
  const qt = await boot(T, QUALITY); console.log('quality', qt);
  await T.clickEl('#advContinue'); await page.waitForFunction(() => window.VEYN_GAME.Game.state === 'playing', null, { timeout: 240000 }); await sleep(2500);
  await ev(() => { window.__t = performance.now() + 20; window.__man = true; }); await sleep(300); await ev(() => window.__tick(2));
  // page-side helpers: placement, step recorder (every 1/60 s sim step), per-frame camera sampler
  await ev(() => { const G = window.VEYN_GAME, A = window.VEYN_ADV, C = window.VEYN_CORE, Cam = G.Cam, R = A.Region, w = G.Game.world;
    const H = window.__H = { rows: [], fr: [], rec: false, steer: null };
    H.freeze = () => { for (const e of A.Ents.list) if (e.f && !e.f.dead) e.f.freeze = 3; };
    H.place = (x, z, yaw) => { const p = w.player; H.freeze(); p.x = p.px = x; p.z = p.pz = z; p.vx = p.vz = 0; p.atk = null; p.setState('idle'); p.buffer = null; p.lockId = null; p.dodgeCD = 0;
      p.facing = p.pfacing = yaw; Cam.yaw = yaw; Cam.armYaw = yaw; Cam.gy = R.groundY(x, z); Cam.lookSm.set(x, 1.55 + Cam.gy, z); Cam.pre.set(x, 0, z); for (const k in Cam.vel) Cam.vel[k] = 0; Cam.curDist = C.CONFIG.camera.dist; Cam.lift = 0; Cam.recentre = null;
      const c = G.Game.chars.get(p.id); if (c) c.gy = Cam.gy; };
    H.inside = (x, z, r) => { let worst = 9; for (const s of R.segs) { if (!s.on) continue; const ex = s.bx - s.ax, ez = s.bz - s.az, L2 = ex * ex + ez * ez || 1e-6; let t = ((x - s.ax) * ex + (z - s.az) * ez) / L2; t = Math.max(0, Math.min(1, t));
        worst = Math.min(worst, Math.hypot(x - (s.ax + ex * t), z - (s.az + ez * t)) - s.t - r); } for (const c of R.circles) { if (!c.on || c.npc) continue; worst = Math.min(worst, Math.hypot(x - c.x, z - c.z) - c.r - r); } return worst; };   // < 0 = overlapping
    H.camClear = (x, z) => { let m = 9; for (const s of R.segs) { if (!s.on || !s.cam || s.h < 1.8) continue; const ex = s.bx - s.ax, ez = s.bz - s.az, L2 = ex * ex + ez * ez || 1e-6; let t = ((x - s.ax) * ex + (z - s.az) * ez) / L2; t = Math.max(0, Math.min(1, t)); m = Math.min(m, Math.hypot(x - (s.ax + ex * t), z - (s.az + ez * t)) - s.t); }
      for (const c of R.circles) { if (!c.on || !c.cam || c.h < 1.8) continue; m = Math.min(m, Math.hypot(x - c.x, z - c.z) - c.r); } return m; };
    const st0 = w.step.bind(w); w.step = function (dt) { st0(dt); if (H.rec) { const p = w.player; H.rows.push([w.time, p.x, p.z, p.state, p.stateT, p.iframes ? 1 : 0, H.inside(p.x, p.z, p.radius)]); } };
    const v = new G.camera.position.constructor();
    window.__pre = () => { H.freeze(); const S = H.steer, p = w.player; if (S && S.k < S.pts.length) { const t = S.pts[S.k]; if (Math.hypot(t[0] - p.x, t[1] - p.z) < 0.8) S.k++; else { const want = Math.atan2(t[0] - p.x, t[1] - p.z), e = Math.atan2(Math.sin(want - Cam.yaw), Math.cos(want - Cam.yaw)); Cam.yaw += Math.max(-0.05, Math.min(0.05, e)) + (S.wob ? Math.sin(S.i++ / 20) * 0.04 : 0); } } };
    window.__post = () => { if (!H.rec) return; const p = w.player, cam = G.camera; cam.updateMatrixWorld(); let ndc = null; const lt = p.lockId && w.byId(p.lockId);
      if (lt) { v.set(lt.x, R.groundY(lt.x, lt.z) + 1.2, lt.z).project(cam); ndc = [v.x, v.y, v.z]; }
      H.fr.push([cam.position.x, cam.position.y, cam.position.z, Cam.curDist, H.camClear(cam.position.x, cam.position.z), Math.hypot(Cam.lookSm.x - p.x, Cam.lookSm.z - p.z), Cam.yaw, ndc, p.x, p.z]); };
  });
  const tick = n => ev(n => window.__tick(n), n);
  const place = (x, z, yaw) => ev(([x, z, yaw]) => window.__H.place(x, z, yaw), [x, z, yaw]);
  const recOn = () => ev(() => { const H = window.__H; H.rows = []; H.fr = []; H.rec = true; });
  const recOff = () => ev(() => { const H = window.__H; H.rec = false; return { rows: H.rows, fr: H.fr }; });
  const press = async (k, frames) => { await page.keyboard.down(k); await tick(1); await page.keyboard.up(k); if (frames) await tick(frames); };
  const dashes = rows => rows.filter((r, k) => r[3] === 'dodge' && (k === 0 || rows[k - 1][3] !== 'dodge' || r[4] < rows[k - 1][4])).length;
  function dashInfo(rows, x0, z0) { const d = rows.filter(r => r[3] === 'dodge'); const end = d[d.length - 1]; const tot = Math.hypot(end[1] - x0, end[2] - z0);
    const k98 = d.findIndex(r => Math.hypot(r[1] - x0, r[2] - z0) >= tot * 0.98); const ifr = d.filter(r => r[5]);
    return { dist: tot, motion: (k98 + 1) / 60, state: d.length / 60, dir: Math.atan2(end[1] - x0, end[2] - z0), iframes: ifr.length ? f3(ifr[0][4]) + '-' + f3(ifr[ifr.length - 1][4]) : 'none' }; }
  function camInfo(fr) { let acc = 0, lag = 0; for (let k = 2; k < fr.length; k++) { const v1 = Math.hypot(fr[k][0] - fr[k - 1][0], fr[k][2] - fr[k - 1][2]) * 60, v0 = Math.hypot(fr[k - 1][0] - fr[k - 2][0], fr[k - 1][2] - fr[k - 2][2]) * 60; acc = Math.max(acc, Math.abs(v1 - v0) * 60); lag = Math.max(lag, fr[k][5]); } return { camAccMax: acc, lagMax: lag }; }
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

  // ---------------------------------------------------------------- 1) dash distance / duration / direction (open ground of the Execution Grounds)
  { const notes = []; let ok = true;
    for (const [label, keys, yaw, wantDir] of [['W+C (forward)', ['KeyW'], Math.PI, Math.PI], ['C alone (backstep)', [], 0, Math.PI], ['D+C, camera yaw 0.7 (camera-relative right)', ['KeyD'], 0.7, Math.atan2(-Math.cos(0.7), Math.sin(0.7))]]) {
      await place(-30, 8, yaw); await tick(10); for (const k of keys) await page.keyboard.down(k); await tick(keys.length ? 10 : 1);
      const p0 = await ev(() => [window.VEYN_GAME.Game.world.player.x, window.VEYN_GAME.Game.world.player.z]);
      await recOn(); await press('KeyC', 40); const { rows, fr } = await recOff(); for (const k of keys) await page.keyboard.up(k); await tick(10);
      const k0 = rows.findIndex(r => r[3] === 'dodge'); const s0 = k0 > 0 ? [rows[k0 - 1][1], rows[k0 - 1][2]] : p0;
      const D = dashInfo(rows, s0[0], s0[1]), C = camInfo(fr); const dirErr = Math.abs(wrap(D.dir - wantDir));
      const good = D.dist >= 3.0 && D.dist <= 4.0 && D.motion >= 0.28 && D.motion <= 0.35 && D.state <= 0.37 && dirErr < 0.06; ok = ok && good;
      metrics['dash ' + label] = { dist: f2(D.dist), motion_s: f3(D.motion), state_s: f3(D.state), dirErr: f3(dirErr), iframes: D.iframes, camAccMax: f2(C.camAccMax), camLagMax: f2(C.lagMax) };
      notes.push(label + ': ' + f2(D.dist) + ' m, motion ' + f3(D.motion) + ' s, state ' + f3(D.state) + ' s, dir err ' + f3(dirErr) + ', i-frames ' + D.iframes + ', cam accel max ' + f2(C.camAccMax) + (good ? '' : '  <-- OUT OF TARGET')); }
    rec('1 dash: 3-4 m, motion 0.28-0.35 s, camera-relative direction / backstep', ok, notes); }

  // ---------------------------------------------------------------- 2) buffered C: pressed mid-dash and in the post-dash cooldown
  { const notes = []; let ok = true;
    for (const at of [6, 26]) { await place(-30, 8, Math.PI); await tick(5); await page.keyboard.down('KeyW'); await tick(10); await recOn(); await press('KeyC', at - 1); await press('KeyC', 50);
      const { rows } = await recOff(); await page.keyboard.up('KeyW'); await tick(10); const n = dashes(rows); ok = ok && n === 2; notes.push('second C at +' + f3(at / 60) + ' s -> ' + n + ' dashes'); metrics['second C at +' + f3(at / 60)] = n; }
    { await place(-30, 8, Math.PI); await tick(5); await recOn(); await press('KeyJ', 5); await press('KeyC', 60); const { rows } = await recOff(); const k = rows.findIndex(r => r[3] === 'dodge'); const good = k >= 0; ok = ok && good;
      notes.push('C 0.1 s into a light attack -> dash at +' + (k >= 0 ? f3(k / 60) + ' s' : 'NEVER (eaten)')); metrics['C in attack startup'] = k >= 0 ? f3(k / 60) : 'eaten'; await tick(30); }
    { await place(-30, 8, Math.PI); await tick(5); await page.keyboard.down('KeyW'); await tick(8); await recOn(); await press('KeyC', 8); await press('KeyJ', 40); const { rows } = await recOff(); await page.keyboard.up('KeyW');
      const r = rows.find(r => r[3] === 'attack'); const good = !!r; ok = ok && good; notes.push('J during the dash -> ' + (r ? 'attack (dash cut) at +' + f3(rows.indexOf(r) / 60) + ' s' : 'no attack')); await tick(40); }
    rec('2 C is buffered (mid-dash, cooldown, attack startup) and the dash cancels into an attack', ok, notes); }

  // ---------------------------------------------------------------- 3) dash into walls: never inside a collider on any sim step
  { const notes = []; let ok = true;
    for (const [label, x, z, yaw] of [['yard north wall, head-on', -12, -51, Math.PI], ['yard north wall, 45 deg (slide)', -12, -51, Math.PI * 0.75], ['yard south-west corner', -19, -51, Math.atan2(-3, -3)], ['gaol cell bars', -36, -35, Math.PI], ['gaol corridor A west wall', -53, -20, -Math.PI / 2], ['ossuary passage wall', 28, -28, 0]]) {
      await place(x, z, yaw); await tick(5); await page.keyboard.down('KeyW'); await tick(4); const p0 = await ev(() => [window.VEYN_GAME.Game.world.player.x, window.VEYN_GAME.Game.world.player.z]);
      await recOn(); await press('KeyC', 30); await press('KeyC', 30); const { rows, fr } = await recOff(); await page.keyboard.up('KeyW'); await tick(5);
      const worst = Math.min(...rows.map(r => r[6])), end = rows[rows.length - 1], camMin = Math.min(...fr.map(f => f[4])); const good = worst > -0.02 && camMin > 0.12; ok = ok && good;
      notes.push(label + ': moved ' + f2(Math.hypot(end[1] - p0[0], end[2] - p0[1])) + ' m, deepest overlap ' + f3(Math.min(0, worst)) + ' m, camera clearance min ' + f2(camMin) + (good ? '' : '  <-- INSIDE')); }
    rec('3 dash into walls: the player never ends a step inside a collider', ok, notes); }

  // ---------------------------------------------------------------- 4) scripted walks: the camera never enters a collider
  { const notes = []; let ok = true;
    for (const [label, pts, wob] of [['gaol corridor A -> cells passage', [[-53, -14], [-53, -33], [-40, -34], [-28, -34]], false], ['gaol corridor A, swaying view', [[-53, -14], [-53, -33]], true], ['ossuary entry passage', [[23, -28], [33, -28]], true], ['ossuary hall', [[38, -18], [52, -18]], true]]) {
      await place(pts[0][0], pts[0][1], Math.atan2(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1])); await tick(10);
      await ev(([pts, wob]) => { window.__H.steer = { pts, k: 1, wob, i: 0 }; }, [pts, wob]); await page.keyboard.down('KeyW'); await recOn();
      for (let i = 0; i < 40; i++) { await tick(30); const k = await ev(() => window.__H.steer.k); if (k >= pts.length) break; }
      const { fr } = await recOff(); await page.keyboard.up('KeyW'); const k = await ev(() => { const S = window.__H.steer; window.__H.steer = null; return S.k; });
      const minC = Math.min(...fr.map(f => f[4])), inside = fr.filter(f => f[4] < 0.12).length; let pops = 0; for (let j = 1; j < fr.length; j++) if (Math.abs(fr[j][3] - fr[j - 1][3]) > 0.6) pops++;
      const good = inside === 0 && k >= pts.length; ok = ok && good; metrics['walk ' + label] = { frames: fr.length, minClear: f2(minC), framesInside: inside, bigPops: pops, minArm: f2(Math.min(...fr.map(f => f[3]))) };
      notes.push(label + ': ' + fr.length + ' frames, waypoints ' + k + '/' + pts.length + ', camera clearance min ' + f2(minC) + ' m, frames inside ' + inside + ', arm pops >0.6 m ' + pops);
      if (label === 'gaol corridor A, swaying view') await T.shot('G4_gaol_corridor'); }
    rec('4 camera never inside a collider on scripted walks (gaol corridor, ossuary)', ok, notes); }

  // ---------------------------------------------------------------- 5) lock-on keeps the target on screen (strafe, dash around, dash through)
  { const notes = []; let ok = true;
    await ev(() => { const A = window.VEYN_ADV, e = A.Ents.list.find(e => e.def.id === 'g1'); e.f.x = e.f.px = -40; e.f.z = e.f.pz = -34; });
    // corridor south of the gaol office door (6 m wide): the wall / doorway behind you crushes the arm, which is the hard case for framing
    for (const [label, x0, z0, yaw0, script] of [['strafe + dash around (wall and doorway at your back)', -40, -32.5, Math.PI, [['KeyA', 60], ['KeyD', 60], ['KeyS', 40], ['KeyW', 40]]], ['close in along the corridor with W + dash', -44, -33.2, Math.PI / 2, [['KeyW', 80]]]]) {
      await place(x0, z0, yaw0); await tick(3); await page.keyboard.press('KeyQ'); await tick(30); await recOn();
      for (const [k, n] of script) { await page.keyboard.down(k); await tick(4); await press('KeyC', 24); await tick(Math.max(0, n - 29)); await page.keyboard.up(k); }
      const { fr } = await recOff(); await page.keyboard.press('KeyQ'); await tick(3);
      const s = fr.filter(f => f[7]); let maxX = 0, maxY = 0, off = 0, yr = 0; s.forEach(f => { maxX = Math.max(maxX, Math.abs(f[7][0])); maxY = Math.max(maxY, Math.abs(f[7][1])); if (Math.abs(f[7][0]) > 0.95 || Math.abs(f[7][1]) > 0.95 || f[7][2] > 1) off++; });
      for (let j = 1; j < fr.length; j++) yr = Math.max(yr, Math.abs(wrap(fr[j][6] - fr[j - 1][6])) * 60);
      const good = s.length > 30 && off === 0; ok = ok && good; metrics['lock ' + label] = { frames: s.length, ndcMaxX: f2(maxX), ndcMaxY: f2(maxY), offscreen: off, yawRateMax: f2(yr) };
      notes.push(label + ': ' + s.length + ' locked frames, target |ndc| max x ' + f2(maxX) + ' y ' + f2(maxY) + ', off-screen frames ' + off + ', yaw rate max ' + f2(yr) + ' rad/s'); }
    await T.shot('G4_lock'); rec('5 lock-on keeps the target on screen', ok, notes); }

  rec('6 no page errors', T.errors.length === 0, T.errors.slice(0, 5).map(e => e.msg.slice(0, 200)));
  fs.writeFileSync(OUT, JSON.stringify({ results, metrics }, null, 1));
  console.log('SUMMARY', results.filter(r => r.status === 'PASS').length + '/' + results.length);
  await T.browser.close(); process.exit(0);
})().catch(async e => { console.error(e); try { await T.browser.close(); } catch (x) {} process.exit(1); });
