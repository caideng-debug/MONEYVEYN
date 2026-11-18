// chunk T: traversal test in headless Chromium (playwright-core) with real keyboard / mouse input.
// Hooks: window.VEYN_* only READ state, or PLACE the player at a test start (T.place). Movement is page.keyboard (+ mouse drag look).
// Exceptions, as the brief allows: the respawn check kills the player through a hook; the doorway check unlocks gates through a hook.
// Start state: a seeded save (Continue) with every foe already defeated, so no foe walks into the measurements.
// usage: LD_LIBRARY_PATH=/workspace/veynhold/.tools/chromelibs node .test/traverse.js [quality=low]   (writes .test/traverse_result.json)
const L = require('./t_lib.js'); const { launch, boot, sleep } = L; const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, 'traverse_result.json'); const QUALITY = process.argv[2] || 'low';
const ENEMIES = ['y1', 'y2', 'y3', 'g1', 'g3', 'g5', 'm1', 'm2', 'm5', 'm6', 'o1', 'sallow', 'odran'];
const save = { game: 'veynhold', schema: 1, created: 1, updated: 1, playTime: 600, deaths: 0, kills: 12, region: 'execution', lantern: 'stair', lit: ['grave', 'gaol', 'stair'],
  flags: { met_tamsin: true, combat_tutorial_seen: true, tut_deflect: true, tut_thrust: true, tut_sweep: true, tut_stealth: true, intro_odran: true, clue_gaolkey: true, lit_grave: true },
  quests: { main: { stage: 6, log: [6], t: 1 } }, inv: { draught: 3 }, weapons: ['wardblade'], equip: { weapon: 'wardblade' },
  upgrades: [], defeated: Object.fromEntries(ENEMIES.map(k => [k, true])), opened: {}, collected: { sword: true }, lore: {},
  zones: { pit: true, cut: true, yard: true, gaol: true, muster: true, stair: true, block: true, hgate: true, oss: true },
  hints: { h_move: true, h_lantern: true, h_lock: true, h_order: true, h_breach: true, h_pen: true, draught: true }, chapter: 1, chapterDone: false };
const storage = { veynhold_save: JSON.stringify(save), veynhold_v8: JSON.stringify({ v: 8, seenTutorial: true }) };

const results = []; let T;
const rec = (name, pass, notes) => { results.push({ name, status: pass ? 'PASS' : 'FAIL', notes: [].concat(notes || []) }); console.log((pass ? 'PASS ' : 'FAIL ') + name + ' | ' + [].concat(notes || []).join(' | ')); };
async function check(name, fn) { T.cur = name; const e0 = T.errors.length; let r;
  for (let att = 1; att <= 2; att++) { try { r = await fn(att); } catch (e) { r = { pass: false, notes: ['exception: ' + (e && e.message || e)] }; await T.releaseAll().catch(() => {}); }
    if (r.pass) break; if (att === 2) r.notes = [].concat(r.notes || [], 'LOOPED: failed twice, moved on'); }
  const ne = T.errors.slice(e0); if (ne.length) { r.pass = false; r.notes = [].concat(r.notes || [], ne.length + ' console error(s): ' + ne.map(e => e.msg).join(' / ').slice(0, 300)); }
  rec(name, r.pass, r.notes); return r; }
const hold = async (keys, ms) => { for (const k of keys) await T.down(k); await sleep(ms); for (const k of keys.slice().reverse()) await T.up(k); };
const ready = async () => { for (let i = 0; i < 40; i++) { const s = await T.st(); if (s.s === 'playing' && !s.dead) return s; await sleep(500); } return T.st(); };
// sim-rate wait: wall time adjusted so slow SwiftShader frames (dt capped at 0.1 s) still give the sim the time we ask for
const simWait = async secs => { const t0 = await T.ev(() => window.VEYN_GAME.Game.world.time); const w0 = Date.now(); while (Date.now() - w0 < secs * 8000) { await sleep(150); const t = await T.ev(() => window.VEYN_GAME.Game.world.time); if (t - t0 >= secs) return; } };
const holdSim = async (keys, secs) => { for (const k of keys) await T.down(k); await simWait(secs); for (const k of keys.slice().reverse()) await T.up(k); };
// per-frame analysis of the sampler rows [rx, rz, ry, gy, px, pz, state, airborne]
function frames(rows) { let maxDy = 0, maxBelow = -1e9, jumps = 0, prev = null, dodges = 0, maxDyAt = null;
  for (const r of rows) { if (prev) { const dy = Math.abs(r[2] - prev[2]); if (dy > maxDy) { maxDy = dy; maxDyAt = r; } if (r[6] === 'jump' && prev[6] !== 'jump') jumps++; if (r[6] === 'dodge' && prev[6] !== 'dodge') dodges++; }
    else { if (r[6] === 'jump') jumps++; if (r[6] === 'dodge') dodges++; }
    maxBelow = Math.max(maxBelow, r[3] - r[2]); prev = r; }
  return { n: rows.length, maxDy, maxBelow, jumps, dodges, maxDyAt }; }
// a stricter per-SIM-STEP sampler: wraps the current world's step and reads p.x/p.z/ground after every 1/60 s step (read-only)
const stepRecStart = () => T.ev(() => { const G = window.VEYN_GAME, A = window.VEYN_ADV, w = G.Game.world; const R = window.__tR = { rows: [] }; if (!w.__tWrapped) { const s = w.step.bind(w); w.__tWrapped = true;
  w.step = function (dt) { s(dt); const r = window.__tR; if (r && r.on) { const p = w.player, J = window.VEYN_CORE.CONFIG.jump; const jy = p.state === 'jump' ? Math.sin(Math.min(1, p.stateT / J.dur) * Math.PI) * J.height : 0; r.rows.push([p.x, p.z, A.Region.groundY(p.x, p.z) + jy, A.Region.groundY(p.x, p.z), p.x, p.z, p.state, p.airborne ? 1 : 0]); } }; } R.on = true; });
const stepRecStop = () => T.ev(() => { const R = window.__tR; R.on = false; return R.rows; });
async function measure(fn) { await T.sampleStart(); await stepRecStart(); await fn(); return { fr: frames(await T.sampleStop()), st: frames(await stepRecStop()) }; }
const f2 = v => (+v).toFixed(2);
// collider check for a point (same rules as world.js A.checkPoints)
const insideCollider = (x, z, r) => T.ev(([x, z, r]) => { const R = window.VEYN_ADV.Region, out = [];
  for (const s of R.segs) { if (!s.on) continue; const ex = s.bx - s.ax, ez = s.bz - s.az, L2 = ex * ex + ez * ez || 1e-6; let t = ((x - s.ax) * ex + (z - s.az) * ez) / L2; t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(x - (s.ax + ex * t), z - (s.az + ez * t)); if (d < s.t + r - 0.01) out.push('seg ' + s.ax.toFixed(1) + ',' + s.az.toFixed(1) + '->' + s.bx.toFixed(1) + ',' + s.bz.toFixed(1) + ' d=' + d.toFixed(2)); }
  for (const c of R.circles) { if (!c.on || c.npc) continue; const d = Math.hypot(x - c.x, z - c.z); if (d < c.r + r - 0.01) out.push('circle ' + c.x.toFixed(1) + ',' + c.z.toFixed(1) + ' d=' + d.toFixed(2)); }
  return out; }, [x, z, r]);

(async () => {
  T = await launch({ viewport: { width: 960, height: 540 }, storage });
  const qt = await boot(T, QUALITY); console.log('quality', qt);
  await T.clickEl('#advContinue'); await T.page.waitForFunction(() => window.VEYN_GAME.Game.state === 'playing', null, { timeout: 240000 }); await sleep(2500);
  console.log('start', JSON.stringify(await T.st()));

  // ---------------------------------------------------------------- 1) stairs up and down
  async function walkStair(name, x, zLow, zHigh, yLow, yHigh) {
    return check(name, async () => { const notes = []; let ok = true;
      await T.place(x, zLow, 0); await sleep(500); await ready();
      // up: W toward +z until past zHigh
      const mUp = await measure(async () => { await T.down('KeyW'); const w0 = Date.now(); while (Date.now() - w0 < 60000) { const s = await T.st(); if (s.z >= zHigh) break; await sleep(60); } await T.up('KeyW'); await simWait(0.6); });
      let s = await T.st(); const upEnd = { z: s.z, gy: s.gy, ry: s.ry };
      const upOk = Math.abs(s.gy - yHigh) < 0.02 && Math.abs(s.ry - yHigh) < 0.05 && mUp.fr.maxDy <= 0.3 && mUp.st.maxDy <= 0.3;
      notes.push('up: end z ' + f2(s.z) + ' ground ' + f2(s.gy) + ' root y ' + f2(s.ry) + ' (want ' + yHigh + '); max dy/frame ' + f2(mUp.fr.maxDy) + ' over ' + mUp.fr.n + ' frames, max dy/sim step ' + f2(mUp.st.maxDy) + ' over ' + mUp.st.n);
      // down: real mouse-drag turn, then W toward -z
      await T.look(Math.PI); await sleep(300);
      const mDn = await measure(async () => { await T.down('KeyW'); const w0 = Date.now(); while (Date.now() - w0 < 60000) { const s = await T.st(); if (s.z <= zLow) break; await sleep(60); } await T.up('KeyW'); await simWait(0.6); });
      s = await T.st(); const dnOk = Math.abs(s.gy - yLow) < 0.02 && Math.abs(s.ry - yLow) < 0.05 && mDn.fr.maxDy <= 0.3 && mDn.st.maxDy <= 0.3;
      notes.push('down: end z ' + f2(s.z) + ' ground ' + f2(s.gy) + ' root y ' + f2(s.ry) + ' (want ' + yLow + '); max dy/frame ' + f2(mDn.fr.maxDy) + ' over ' + mDn.fr.n + ' frames, max dy/sim step ' + f2(mDn.st.maxDy));
      ok = upOk && dnOk; void upEnd; return { pass: ok, notes }; }); }
  await walkStair("1a Headsman's Stair: walk up (0 -> 1.0 landing -> 1.8) and back down", 0, 28.6, 36.6, 0, 1.8);
  await T.shot('T_trav_stair');
  await walkStair('1b Gallows steps: walk up onto the deck (0 -> 1.6) and back down', 0, -43, -37.6, 0, 1.6);
  await T.shot('T_trav_gallows');

  // ---------------------------------------------------------------- 2) jumps on the stairs and at a ledge edge
  await check('2 jumps on both stairs and at ledge edges: never more than 0.05 m below ground', async () => { const notes = []; let ok = true; const all = [];
    const jumpRun = async (label, x, z, yaw, keys, secs, expect) => { await T.place(x, z, yaw); await sleep(400); await ready();
      const m = await measure(async () => { for (const k of keys) await T.down(k); for (let i = 0; i < Math.ceil(secs / 0.7); i++) { await T.tap('Space', 60); await simWait(0.7); } for (const k of keys) await T.up(k); await simWait(0.5); });
      const s = await T.st(); const below = Math.max(m.fr.maxBelow, m.st.maxBelow); all.push(below); const good = below <= 0.05 && m.fr.jumps >= 1 && (!expect || expect(s));
      ok = ok && good; notes.push(label + ': ' + m.fr.jumps + ' jumps, worst below-ground ' + f2(below) + ' m, end ' + f2(s.x) + ',' + f2(s.z) + ' ground ' + f2(s.gy) + (good ? '' : '  <-- FAIL')); };
    await jumpRun('Headsman stair, jumping while walking up', 0, 29, 0, ['KeyW'], 3.5, s => s.gy > 0.9);
    await jumpRun('Headsman stair, jumping while walking down', 0, 36.4, Math.PI, ['KeyW'], 3.5, s => s.gy < 0.9);
    await jumpRun('gallows steps, jumping up', 0, -42.5, 0, ['KeyW'], 2.8, s => s.gy > 1.5);
    await jumpRun('gallows steps, jumping down', 0, -37.8, Math.PI, ['KeyW'], 2.8, s => s.gy < 0.1);
    await jumpRun('deck ledge from below (jump into the 1.6 m side): stays below', 7.2, -36, -Math.PI / 2, ['KeyW'], 2.1, s => s.gy < 0.05 && s.x > 6.15);
    await jumpRun('deck ledge from above (jump at the edge): stays on the deck', 5.0, -36, Math.PI / 2, ['KeyW'], 2.1, s => s.gy > 1.55);
    await jumpRun('Block approach edge, jump at the stair-side wall', 2.5, 35.6, Math.PI / 2, ['KeyW'], 2.1, s => s.gy > 1.75);
    return { pass: ok, notes }; });

  // ---------------------------------------------------------------- 3) walking off raised edges is blocked
  await check('3 walking off the gallows deck sides and the raised Block approach edges is blocked', async () => { const notes = []; let ok = true;
    const push = async (label, x, z, yaw, want) => { await T.place(x, z, yaw); await sleep(400); await ready(); await holdSim(['KeyW'], 2.2); await holdSim(['ShiftLeft', 'KeyW'], 1.2); await simWait(0.3); const s = await T.st();
      const good = Math.abs(s.gy - want) < 0.02; ok = ok && good; notes.push(label + ': end ' + f2(s.x) + ',' + f2(s.z) + ' ground ' + f2(s.gy) + ' (want ' + want + ')' + (good ? '' : '  <-- walked off')); };
    await push('deck east side', 4.5, -35, Math.PI / 2, 1.6); await push('deck west side', -4.5, -35, -Math.PI / 2, 1.6); await push('deck north edge', 3, -34.5, 0, 1.6);
    await push('deck south edge beside the steps', 3.5, -37.6, Math.PI, 1.6);
    await push('approach east (stair head)', 2.5, 35.8, Math.PI / 2, 1.8); await push('approach west (stair head)', -2.5, 35.8, -Math.PI / 2, 1.8);
    await push('Block rim (south-east)', 8, 40.5, Math.atan2(8, -9.5), 1.8); await push('Block rim (east)', 11, 50, Math.PI / 2, 1.8);
    await push('landing east side', 3, 32.6, Math.PI / 2, 1.0);
    return { pass: ok, notes }; });

  // ---------------------------------------------------------------- 4) dash into a wall and into a corner, then walk away
  await check('4 dash (C) into a wall and into a corner, then W away: the player moves', async () => { const notes = []; let ok = true;
    const dashAway = async (label, x, z, yaw) => { await T.place(x, z, yaw); await sleep(400); await ready();
      await T.down('KeyW'); await simWait(0.15); await T.tap('KeyC', 60); await simWait(0.5); await T.tap('KeyC', 60); await simWait(0.6); await T.up('KeyW'); await simWait(0.2);
      const a = await T.st(); await T.look(Math.PI); const b0 = await T.st(); await holdSim(['KeyW'], 1.0); await simWait(0.2); const b = await T.st();
      const moved = Math.hypot(b.x - b0.x, b.z - b0.z); const good = moved > 1.5 && (await insideCollider(b.x, b.z, 0.44)).length === 0; ok = ok && good;
      notes.push(label + ': after dashes at ' + f2(a.x) + ',' + f2(a.z) + ' (state ' + a.pstate + '); W away moved ' + f2(moved) + ' m' + (good ? '' : '  <-- STUCK')); };
    await dashAway('yard north wall (z -54)', -12, -51, Math.PI); await dashAway('yard south-west corner (-22,-54)', -19, -51, Math.atan2(-3, -3));
    await dashAway('gaol cell bars', -36, -35, Math.PI); await dashAway('Block ring wall', 9, 44, Math.PI / 2);
    return { pass: ok, notes }; });

  // ---------------------------------------------------------------- 5) Space held = one jump; diagonal combos
  await check('5 hold Space 1 s = exactly one jump; W+D+Space jumps, W+D+C dashes', async () => { const notes = []; let ok = true;
    await T.place(-30, 8, 0); await sleep(400); await ready();
    let m = await measure(async () => { await T.down('Space'); await simWait(1.0); await T.up('Space'); await simWait(0.6); });
    const one = m.st.jumps === 1; ok = ok && one; notes.push('Space held 1 s: ' + m.st.jumps + ' jump(s) (sim steps), ' + m.fr.jumps + ' (frames)');
    await T.place(-30, 8, 0); await sleep(300); await ready(); let s0 = await T.st();
    m = await measure(async () => { await T.down('KeyW'); await T.down('KeyD'); await simWait(0.3); await T.tap('Space', 80); await simWait(0.8); await T.up('KeyD'); await T.up('KeyW'); await simWait(0.3); });
    let s = await T.st(); const wdj = m.st.jumps === 1 && s.z - s0.z > 0.8 && s.x - s0.x > 0.8; ok = ok && wdj;
    notes.push('W+D+Space: ' + m.st.jumps + ' jump, moved dx ' + f2(s.x - s0.x) + ' dz ' + f2(s.z - s0.z) + (wdj ? '' : '  <-- FAIL'));
    await T.place(-30, 8, 0); await sleep(300); await ready(); s0 = await T.st();
    m = await measure(async () => { await T.down('KeyW'); await T.down('KeyD'); await simWait(0.3); await T.tap('KeyC', 80); await simWait(0.6); await T.up('KeyD'); await T.up('KeyW'); await simWait(0.3); });
    s = await T.st(); const wdc = m.st.dodges === 1 && s.z - s0.z > 1 && s.x - s0.x > 1; ok = ok && wdc;
    notes.push('W+D+C: ' + m.st.dodges + ' dash, moved dx ' + f2(s.x - s0.x) + ' dz ' + f2(s.z - s0.z) + (wdc ? '' : '  <-- FAIL'));
    return { pass: ok, notes }; });

  // ---------------------------------------------------------------- 6) Esc while holding W: no drift
  await check('6 hold W, press Esc, release W, close the menu: no drift', async () => { const notes = [];
    await T.place(-30, 0, 0); await sleep(400); await ready();
    await T.down('KeyW'); await simWait(0.6); await T.tap('Escape'); await sleep(700); const sMenu = await T.st(); await T.up('KeyW'); await sleep(500);
    await T.tap('Escape'); await sleep(400); const a = await T.st(); await simWait(1.5); const b = await T.st();
    const drift = Math.hypot(b.x - a.x, b.z - a.z); notes.push('menu state ' + sMenu.s + ', after close ' + a.s + '; drift over 1.5 s sim: ' + f2(drift) + ' m');
    return { pass: sMenu.s === 'paused' && a.s === 'playing' && drift < 0.05, notes }; });

  // ---------------------------------------------------------------- 7) death + respawn: not inside a collider
  await check('7 kill the player (hook), respawn: not inside a collider', async () => { const notes = [];
    await T.place(-10, 10, 0); await sleep(400); await ready();
    await T.ev(() => { const G = window.VEYN_GAME, w = G.Game.world, p = w.player; p.invuln = false; p.hp = 0; p.dead = true; p.setState('dead', 99); w.emit({ type: 'death', f: p.id }); });
    let s; const w0 = Date.now(); let sawDeath = false; while (Date.now() - w0 < 90000) { await sleep(500); const d = await T.ev(() => !!window.VEYN_ADV.dying); if (d) sawDeath = true; s = await T.st(); if (sawDeath && !d && s.s === 'playing' && !s.dead) break; }
    await sleep(1500); s = await T.st(); const ins = await insideCollider(s.x, s.z, 0.45);
    // and the player can walk away from the respawn point
    const s0 = s; await holdSim(['KeyW'], 0.8); const s1 = await T.st(); const mv = Math.hypot(s1.x - s0.x, s1.z - s0.z);
    notes.push('death screen seen ' + sawDeath + '; respawned at ' + f2(s.x) + ',' + f2(s.z) + ' ground ' + f2(s.gy) + ' (Stair Lantern spawn -0.60,32.70); colliders overlapped: ' + (ins.length ? ins.join('; ') : 'none') + '; walked ' + f2(mv) + ' m after');
    await T.shot('T_trav_respawn');
    return { pass: sawDeath && !ins.length && s.s === 'playing' && mv > 0.5 && Math.abs(s.gy - 1.0) < 0.02, notes }; });

  // ---------------------------------------------------------------- 8) four doorways
  await check('8 pass through 4 doorways (gaol door, ossuary gate, yard portcullis, Hollowwood passage)', async () => { const notes = []; let ok = true;
    const door = async (label, gate, x0, z0, yaw, axis, beyond, sign) => { await T.ev(g => window.VEYN_ADV.Region.setGate(g, true, true), gate); await T.place(x0, z0, yaw); await sleep(400); await ready();
      const w0 = Date.now(); await T.down('KeyW'); let s; while (Date.now() - w0 < 40000) { s = await T.st(); if ((axis === 'z' ? s.z : s.x) * sign >= beyond * sign) break; await sleep(80); } await T.up('KeyW'); await simWait(0.3); s = await T.st();
      const good = (axis === 'z' ? s.z : s.x) * sign >= beyond * sign - 0.05; ok = ok && good; notes.push(label + ': ' + f2(s.x) + ',' + f2(s.z) + ' zone ' + s.zone + (good ? '' : '  <-- blocked'));
      if (good) await T.shot('T_trav_door_' + gate); };
    await door('gaol door (gaol -> muster)', 'gaoldoor', -53, -15.5, 0, 'z', -9, 1);
    await door('ossuary gate (ossuary -> muster)', 'ossgate', 44, -17, 0, 'z', -9.5, 1);
    await door('yard portcullis (yard -> muster)', 'yardgate', 0, -20, 0, 'z', -9, 1);
    await door('Hollowwood passage + gate', 'hollowgate', 0, 61, 0, 'z', 72.6, 1);
    return { pass: ok, notes }; });

  T.cur = 'final';
  rec('9 no console / page errors over the whole run', T.errors.length === 0, T.errors.length ? T.errors.map(e => '[' + e.step + '] ' + e.msg).slice(0, 10) : '0 errors');
  const fps = (await T.st().catch(() => ({}))).fps;
  fs.writeFileSync(OUT, JSON.stringify({ when: new Date().toISOString(), quality: QUALITY, fps, results, errors: T.errors }, null, 2));
  console.log(results.filter(r => r.status === 'PASS').length + '/' + results.length + ' passed; fps ~' + fps);
  await T.browser.close(); process.exit(0);
})().catch(async e => { console.log('CRASH', e && e.stack); try { fs.writeFileSync(OUT, JSON.stringify({ crash: String(e && e.stack), results, errors: T && T.errors }, null, 2)); } catch (x) {} try { await T.browser.close(); } catch (x) {} process.exit(1); });
