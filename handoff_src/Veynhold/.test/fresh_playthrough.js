// chunk T: fresh-save playthrough of the merged Chapter 1 on MEDIUM, headless Chromium + SwiftShader (playwright-core).
// Real input: every progression step is walking (W/Shift + mouse-drag look) and real E presses; menus are real key presses / clicks.
// Hooks: READ state everywhere. Combat outcomes only: a foe's posture is broken through CORE.addPosture before the REAL E deathblow,
// and the player's health is topped up if it falls under 35 (both counted in the result). No placement, no flags, no gate hooks.
// usage: LD_LIBRARY_PATH=/workspace/veynhold/.tools/chromelibs node .test/fresh_playthrough.js [quality=medium]
//        writes .test/fresh_playthrough_result.json and shots/T_*.png
const L = require('./t_lib.js'); const { launch, boot, sleep, passPrologue } = L; const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, 'fresh_playthrough_result.json'); const QUALITY = process.argv[2] || 'medium';
const steps = [], confusing = [], help = { posture: 0, heal: 0 }; let T; const t00 = Date.now();
const now = () => ((Date.now() - t00) / 1000).toFixed(0);
const f1 = v => (+v).toFixed(1);
const objText = () => T.ev(() => { const el = document.getElementById('advObj'); return el && el.style.display !== 'none' ? (el.querySelector('span') || el).textContent : ''; });
const mainStage = () => T.ev(() => window.VEYN_ADV.Save.data.quests.main ? window.VEYN_ADV.Save.data.quests.main.stage : null);
const save = () => T.ev(() => { const S = window.VEYN_ADV.Save.data; return { stage: S.quests.main && S.quests.main.stage, inv: S.inv, weapon: S.equip.weapon, flags: S.flags, opened: S.opened, drops: S.drops || {}, defeated: S.defeated, lit: S.lit, deaths: S.deaths }; });

async function step(name, fn) { T.cur = name; const e0 = T.errors.length, t = Date.now(); let r = { pass: false, notes: [] };
  for (let att = 1; att <= 2; att++) { try { r = await fn(att); r.notes = r.notes || []; } catch (e) { r = { pass: false, notes: ['exception: ' + (e && e.message || e)] }; await T.releaseAll().catch(() => {}); }
    if (r.pass) break; if (att === 2) r.notes.push('LOOPED: failed twice, recorded and moved on'); else console.log('[' + now() + 's] retry', name, r.notes.join('; ')); }
  const ne = T.errors.slice(e0); if (ne.length) { r.pass = false; r.notes.push(ne.length + ' console error(s): ' + ne.map(e => e.msg).join(' / ').slice(0, 300)); }
  const row = { name, status: r.pass ? 'PASS' : 'FAIL', secs: Math.round((Date.now() - t) / 1000), notes: r.notes, shot: r.shot }; steps.push(row);
  console.log('[' + now() + 's] ' + row.status + ' ' + name + ' (' + row.secs + ' s) | ' + r.notes.join(' | ')); fs.writeFileSync(OUT, JSON.stringify({ partial: true, steps, confusing, help, errors: T.errors }, null, 2)); return r; }

// ---------- combat helpers (hook = posture break only; the deathblow is a real E press) ----------
const foes = () => T.ev(() => { const A = window.VEYN_ADV, P = window.VEYN_GAME.Game.world.player; return A.Ents.list.filter(e => !e.f.dead && e.mode !== 'dead').map(e => ({ id: e.def.id, x: e.f.x, z: e.f.z, mode: e.mode, state: e.f.state, d: Math.hypot(e.f.x - P.x, e.f.z - P.z), boss: !!e.def.boss, hp: e.f.hp, marks: e.f.marks })); });
const foe = id => T.ev(id => { const A = window.VEYN_ADV, P = window.VEYN_GAME.Game.world.player, e = A.Ents.list.find(q => q.def.id === id); if (!e) return null; const f = e.f;
  return { id, x: f.x, z: f.z, dead: !!f.dead, state: f.state, mode: e.mode, d: Math.hypot(f.x - P.x, f.z - P.z), marks: f.marks, hp: f.hp, posture: f.posture, db: !!f.deathblowable }; }, id);
async function keepAlive() { const s = await T.st(); if (s.hp !== null && s.hp < 35 && !s.dead) { await T.ev(() => { const p = window.VEYN_GAME.Game.world.player; p.hp = p.maxHp; }); help.heal++; } }
async function waitPlaying(ms) { const w0 = Date.now(); while (Date.now() - w0 < (ms || 60000)) { const s = await T.st(); if (s.s === 'playing' && !s.dead && !(await T.ev(() => !!window.VEYN_ADV.dying || window.VEYN_ADV.busy > 0))) return true; await sleep(400); } return false; }
async function fightFoe(id, maxCycles) { const notes = [];
  for (let c = 0; c < (maxCycles || 5); c++) { let e = await foe(id); if (!e || e.dead) break; await keepAlive();
    if (e.state === 'transition' || e.state === 'deathblowed') { await sleep(1500); continue; }
    if (!(await waitPlaying(90000))) { notes.push('not playing'); break; }
    // close in, swing twice for real (LMB), then the posture hook, then a real E deathblow
    await T.walkTo(e.x, e.z, 1.9, 15000, true); e = await foe(id); if (!e || e.dead) break; await T.faceTo(e.x, e.z);
    for (let k = 0; k < 2; k++) { await T.page.mouse.click(400, 300); await sleep(350); }
    e = await foe(id); if (!e || e.dead) break; if (e.state === 'transition') continue;
    await T.ev(id => { const A = window.VEYN_ADV, e = A.Ents.list.find(q => q.def.id === id); if (e && !e.f.dead) { e.f.atk = null; window.VEYN_CORE.addPosture(window.VEYN_GAME.Game.world, e.f, 1e5); } }, id); help.posture++;
    await sleep(250); e = await foe(id); if (!e || e.dead) break;
    if (e.d > 1.9) { await T.walkTo(e.x, e.z, 1.5, 8000, true); e = await foe(id); } if (!e) break; await T.faceTo(e.x, e.z);
    await T.tap('KeyE'); await sleep(2500); await waitPlaying(30000); }
  const e = await foe(id); notes.push(id + (e && !e.dead ? ' still standing (marks ' + e.marks + ')' : ' down')); return { dead: !e || e.dead, notes }; }
// walk with foe handling: any foe engaged within 7 m is fought; the walk resumes after
async function go(tx, tz, tol, budgetMs) { const w0 = Date.now(); let fought = [];
  while (Date.now() - w0 < (budgetMs || 240000)) { await keepAlive(); await waitPlaying(90000);
    const th = (await foes()).filter(f => !f.boss && f.mode === 'combat' && f.d < 7).sort((a, b) => a.d - b.d)[0];
    if (th) { const r = await fightFoe(th.id, 4); fought.push(th.id + (r.dead ? '' : '(alive)')); continue; }
    const r = await T.walkTo(tx, tz, tol || 0.6, 8000); if (r.ok) return { ok: true, fought }; }
  const s = await T.st(); return { ok: false, fought, at: f1(s.x) + ',' + f1(s.z) }; }
async function route(pts, tol) { const all = []; for (const p of pts) { const r = await go(p[0], p[1], p[2] || tol || 0.8); all.push(...r.fought); if (!r.ok) return { ok: false, fought: all, at: r.at, stuckAt: p }; } return { ok: true, fought: all }; }
async function promptAt(x, z, fx, fz, re, tol) { await go(x, z, tol || 0.45); await T.faceTo(fx, fz); await sleep(500); let s = await T.st();
  for (let i = 0; i < 3 && !re.test(s.prompt); i++) { await T.look(0.35 * (i % 2 ? -2 : 1)); await sleep(400); s = await T.st(); } return s; }

(async () => {
  T = await launch({ viewport: { width: 960, height: 540 } });
  // 1 -------------------------------------------------------------- prologue
  await step('1 fresh save, Medium, prologue', async () => { const qt = await boot(T, QUALITY); const ls = await T.ev(() => Object.keys(localStorage));
    await T.clickEl('#advNew'); await sleep(1500); const s0 = await T.st(); const line = await T.ev(() => document.querySelector('#advProlog p').textContent); await T.shot('T_01_prologue');
    const r = await passPrologue(T, 300000); await sleep(3000); const s = await T.st(); await T.shot('T_01_spawn');
    return { pass: s0.s === 'prologue' && r.ok && Math.abs(s.z + 73) < 0.5 && /Medium/i.test(qt), notes: ['quality ' + qt + ', localStorage before: ' + JSON.stringify(ls), 'prologue line: "' + line + '"', 'Space -> playing after ' + r.presses + ' press(es), ' + r.secs + ' s (region build under load)', 'spawn ' + f1(s.x) + ',' + f1(s.z) + ', fps ' + s.fps], shot: 'T_01_prologue.png' }; });

  // 2 -------------------------------------------------------------- sword on the cart
  await step('2 take the sword from the corpse cart (E)', async () => {
    const s = await promptAt(4.4, -71.6, 5.2, -72.6, /sword/i); const notes = ['prompt at the cart: "' + s.prompt + '"'];
    if (!/sword/i.test(s.prompt)) return { pass: false, notes };
    await T.tap('KeyE'); await sleep(2500); await T.shot('T_02_sword'); await waitPlaying(20000); if ((await T.st()).s !== 'playing') { await T.tap('KeyE'); await sleep(800); }
    const sv = await save(); notes.push('weapon ' + sv.weapon + ', main stage ' + sv.stage); return { pass: sv.weapon === 'wardblade', notes, shot: 'T_02_sword.png' }; });

  // 3 -------------------------------------------------------------- read the clue
  let objBeforeClue = '';
  await step('3 read the order on the body (the Gaol Key clue)', async () => { objBeforeClue = await objText();
    const s = await promptAt(-2.4, -64.6, -3.3, -63.5, /order/i); const notes = ['prompt: "' + s.prompt + '"'];
    if (!/order/i.test(s.prompt)) return { pass: false, notes };
    await T.tap('KeyE'); await sleep(1200); const st = (await T.st()).s; const txt = await T.ev(() => { const r = document.getElementById('advRead'); return r ? r.innerText.replace(/\s+/g, ' ').slice(0, 160) : ''; });
    await T.shot('T_03_clue'); notes.push('state ' + st + ', reader: "' + txt + '"'); await T.tap('KeyE'); await sleep(800);
    const sv = await save(); notes.push('flag clue_gaolkey ' + !!sv.flags.clue_gaolkey + '; back to ' + (await T.st()).s);
    return { pass: st === 'reading' && !!sv.flags.clue_gaolkey && (await T.st()).s === 'playing', notes, shot: 'T_03_clue.png' }; });

  // 4 -------------------------------------------------------------- objective updates
  await step('4 objective text updates', async () => { const notes = []; let o = await objText(); notes.push('objective before the clue: "' + objBeforeClue + '"; right after reading: "' + o + '"');
    if (o === objBeforeClue) { confusing.push('Reading the order on the body sets the Gaol Key clue, but the objective still says "' + o + '" until the lantern is kindled; only then does it switch to the sergeant.');
      // the objective moves on at the lantern (stage 2 -> 3): kindle it with a real E press
      const s = await promptAt(0, -59.6, 0, -57.5, /Kindle|Rest/i); notes.push('lantern prompt: "' + s.prompt + '"'); if (/Kindle|Rest/i.test(s.prompt)) { await T.tap('KeyE'); await sleep(3000); await waitPlaying(30000); }
      o = await objText(); notes.push('after kindling the Gravedigger\u2019s Lantern: "' + o + '"'); }
    await T.shot('T_04_objective'); const upd = await T.ev(() => document.querySelector('#advObj small') ? document.querySelector('#advObj small').textContent : '');
    return { pass: /sergeant/i.test(o), notes: notes.concat('objective label: ' + upd), shot: 'T_04_objective.png' }; });

  // 5 -------------------------------------------------------------- the Gaol, Brask
  await step('5 walk to the Gaol and kill Sergeant Brask', async () => { const notes = [];
    const r = await route([[0, -55.5], [0, -51.5], [-10, -47], [-19, -36], [-24, -34], [-34, -34], [-43, -34], [-43, -30.5], [-43, -28.5]], 0.9); notes.push('route ok ' + r.ok + (r.ok ? '' : ' stuck near ' + r.at) + '; foes fought on the way: ' + (r.fought.join(', ') || 'none'));
    const b0 = await foe('g3'); notes.push('Brask: ' + (b0 ? (b0.dead ? 'dead' : 'at ' + f1(b0.x) + ',' + f1(b0.z) + ' marks ' + b0.marks + ' mode ' + b0.mode) : 'gone'));
    await T.shot('T_05_gaol'); const fr = b0 && !b0.dead ? await fightFoe('g3', 6) : { dead: !b0 || b0.dead, notes: [] }; notes.push(...fr.notes); await sleep(1500); await T.shot('T_05_brask_down');
    const sv = await save(); notes.push('drops ' + JSON.stringify(sv.drops));
    return { pass: fr.dead && !!sv.drops.gaolkey, notes, shot: 'T_05_brask_down.png' }; });

  // 6 -------------------------------------------------------------- key visible, take with E
  await step('6 the Gaol Key is visible at the body; take it with E', async () => { const notes = []; const d = (await save()).drops.gaolkey; if (!d) return { pass: false, notes: ['no key on the ground'] };
    const vis = await T.ev(() => { const K = window.VEYN_ADV.api && window.VEYN_ADV.api.Keys, k = K && K.list.gaolkey; if (!k) return null; let v = true; let o = k.grp; while (o) { if (!o.visible) v = false; o = o.parent; } return { visible: v, y: k.grp.position.y, inScene: !!k.grp.parent }; });
    notes.push('key mesh: ' + JSON.stringify(vis) + ' at ' + d.x + ',' + d.z);
    const s0 = await T.st(); const a = Math.atan2(s0.x - d.x, s0.z - d.z); const sx = d.x + Math.sin(a) * 1.1, sz = d.z + Math.cos(a) * 1.1;
    const s = await promptAt(sx, sz, d.x, d.z, /key/i, 0.4); notes.push('prompt: "' + s.prompt + '"'); await T.shot('T_06_key_visible');
    if (!/key/i.test(s.prompt)) return { pass: false, notes };
    await T.tap('KeyE'); await sleep(1500); await waitPlaying(15000); const sv = await save(); notes.push('inv ' + JSON.stringify(sv.inv)); await T.shot('T_06_key_taken');
    return { pass: !!(vis && vis.visible) && (sv.inv.gaolkey || 0) > 0, notes, shot: 'T_06_key_visible.png' }; });

  // 7 -------------------------------------------------------------- inventory
  await step('7 inventory shows the Gaol Key', async () => { await T.tap('Escape'); await sleep(900); const st = (await T.st()).s; await T.clickEl('#advMenu [data-t="Inventory"]'); await sleep(700);
    const txt = await T.ev(() => document.querySelector('#advMenu .body').innerText); await T.shot('T_07_inventory'); await T.tap('Escape'); await sleep(700);
    return { pass: st === 'paused' && /Gaol Key/i.test(txt), notes: ['menu ' + st + '; inventory: "' + txt.replace(/\s+/g, ' ').slice(0, 220) + '"', 'after Esc: ' + (await T.st()).s], shot: 'T_07_inventory.png' }; });

  // 8 + 9 ---------------------------------------------------------- the gaol door
  let objBeforeDoor = '';
  await step('8 open the gaol door with E', async () => { const notes = []; objBeforeDoor = await objText(); notes.push('objective: "' + objBeforeDoor + '"');
    const r = await route([[-43, -30.5], [-43, -34], [-51, -34], [-54.6, -30], [-54.6, -21], [-53, -15.5]], 0.8); notes.push('route ok ' + r.ok + (r.ok ? '' : ' stuck near ' + r.at) + '; fought ' + (r.fought.join(', ') || 'none'));
    const s = await promptAt(-53, -14.2, -53, -12, /Unlock|door/i); notes.push('prompt: "' + s.prompt + '"'); await T.shot('T_08_door_prompt');
    if (!/Unlock|door/i.test(s.prompt)) return { pass: false, notes };
    await T.tap('KeyE'); await sleep(3000); await waitPlaying(15000); const sv = await save(); await T.shot('T_08_door_open'); notes.push('opened ' + JSON.stringify(sv.opened));
    return { pass: !!sv.opened.gaoldoor, notes, shot: 'T_08_door_open.png' }; });
  await step('9 objective updates after the door', async () => { const o = await objText(); await T.shot('T_09_objective');
    return { pass: o !== objBeforeDoor && /Stair|Muster/i.test(o), notes: ['before "' + objBeforeDoor + '" -> now "' + o + '" (stage ' + (await mainStage()) + ')'], shot: 'T_09_objective.png' }; });

  // 10 + 11 -------------------------------------------------------- the stair and the cutscene
  await step("10 cross the Muster Field and climb the Headsman's Stair", async () => { const notes = [];
    const r = await route([[-53, -9], [-48, -4], [-36, -5], [-22, 10], [-10, 14], [-1, 26], [0, 29.2]], 1.0); notes.push('route ok ' + r.ok + (r.ok ? '' : ' stuck near ' + r.at) + '; fought ' + (r.fought.join(', ') || 'none'));
    if (!r.ok) return { pass: false, notes };
    // the stair itself: plain W up the flights (no sprint), reading the height
    await T.faceTo(0, 34); let ys = []; await T.down('KeyW'); const w0 = Date.now(); let s; while (Date.now() - w0 < 40000) { s = await T.st(); ys.push(s.gy); if (s.z > 35.6 || s.s !== 'playing') break; await sleep(150); } await T.up('KeyW');
    s = await T.st(); await T.shot('T_10_stair'); notes.push('top: ' + f1(s.x) + ',' + s.z.toFixed(2) + ' ground ' + s.gy.toFixed(2) + ' (state ' + s.s + ')');
    return { pass: s.gy > 1.75, notes, shot: 'T_10_stair.png' }; });
  await step('11 the Odran cutscene triggers; skip it (E)', async () => { const notes = [];
    if (!(await T.ev(() => !!window.VEYN_ADV.boss))) { await T.down('KeyW'); const w0 = Date.now(); while (Date.now() - w0 < 30000) { if (await T.ev(() => !!window.VEYN_ADV.boss)) break; await sleep(150); } await T.up('KeyW'); }
    await sleep(2500); const c = await T.ev(() => { const BD = window.VEYN_ADV.BossD; return { boss: !!window.VEYN_ADV.boss, cut: !!(BD && BD.Cut.active), skip: document.getElementById('vhSkip') ? document.getElementById('vhSkip').style.opacity : null, state: window.VEYN_GAME.Game.state }; });
    notes.push('boss ' + c.boss + ', cutscene active ' + c.cut + ', skip hint opacity ' + c.skip); await T.shot('T_11_cutscene');
    await T.tap('KeyE'); await sleep(2500); const after = await T.ev(() => ({ cut: !!window.VEYN_ADV.BossD.Cut.active, skipped: window.VEYN_ADV.BossD.Cut.skipped, intro: !!window.VEYN_GAME.Intro.active }));
    for (let i = 0; i < 20 && after.intro; i++) { await sleep(500); after.intro = await T.ev(() => !!window.VEYN_GAME.Intro.active); }
    await T.shot('T_11_skipped'); notes.push('after E: cutscene ' + after.cut + ', skipped ' + after.skipped + ', intro ' + after.intro + ', state ' + (await T.st()).s);
    return { pass: c.cut && !after.cut && after.skipped, notes, shot: 'T_11_cutscene.png' }; });

  // 12 + 13 -------------------------------------------------------- the fight and the deathblow
  let finalShot = false;
  await step("12 Odran's fight", async () => { const notes = []; let o = await foe('odran'); if (!o) return { pass: false, notes: ['no Odran'] };
    const p0 = await T.st(); notes.push('Odran marks ' + o.marks + ', hp ' + f1(o.hp) + '; player hp ' + f1(p0.hp));
    // a real exchange first: lock on (Q), guard (F) and swing (LMB / RMB) for ~20 s of wall time
    await T.tap('KeyQ'); const t0 = Date.now(); let swings = 0; while (Date.now() - t0 < 20000) { await keepAlive(); o = await foe('odran'); if (!o || o.dead) break; const s = await T.st(); if (s.s !== 'playing') { await sleep(400); continue; }
      if (o.d > 2.6) { await T.walkTo(o.x, o.z, 2.2, 4000, true); continue; } if (o.state === 'attack') { await T.tap('KeyF', 120); continue; } await T.page.mouse.click(400, 300, { button: swings % 4 === 3 ? 'right' : 'left' }); swings++; await sleep(300); }
    await T.shot('T_12_fight'); const mid = await foe('odran'); notes.push('after the exchange: Odran hp ' + f1(mid.hp) + ' posture ' + f1(mid.posture) + ', ' + swings + ' swings');
    // marks before the last: posture hook + real E deathblow per mark
    for (let k = 0; k < 4; k++) { o = await foe('odran'); if (!o || o.dead || o.marks <= 1) break; const m0 = o.marks; await fightFoe('odran', 1); await sleep(2000); o = await foe('odran');
      while (o && o.state === 'transition') { await sleep(1000); o = await foe('odran'); } notes.push('mark taken: ' + m0 + ' -> ' + (o ? o.marks : 'gone')); }
    o = await foe('odran'); return { pass: !!o && !o.dead && o.marks === 1, notes: notes.concat('Odran now marks ' + (o && o.marks) + ' state ' + (o && o.state)), shot: 'T_12_fight.png' }; });
  await step('13 the deathblow', async () => { const notes = []; let o = await foe('odran'); if (!o || o.dead) return { pass: !!(await save()).defeated.odran, notes: ['already down'] };
    await T.walkTo(o.x, o.z, 1.9, 15000, true); o = await foe('odran'); await T.faceTo(o.x, o.z);
    await T.ev(() => { const e = window.VEYN_ADV.Ents.list.find(q => q.def.id === 'odran'); e.f.atk = null; window.VEYN_CORE.addPosture(window.VEYN_GAME.Game.world, e.f, 1e5); }); help.posture++;
    await sleep(300); o = await foe('odran'); if (o.d > 1.9) { await T.walkTo(o.x, o.z, 1.5, 8000, true); o = await foe('odran'); } await T.faceTo(o.x, o.z);
    const hint = await T.ev(() => { const h = document.getElementById('dbHint'); return h ? h.style.display : null; });
    await T.tap('KeyE'); await sleep(1800); await T.shot('T_13_deathblow'); finalShot = true;
    const w0 = Date.now(); while (Date.now() - w0 < 90000) { const d = await save(); if (d.defeated.odran) break; await sleep(800); } await sleep(4000); await waitPlaying(60000);
    const sv = await save(); await T.shot('T_13_after'); notes.push('deathblow hint ' + hint + '; Odran defeated ' + !!sv.defeated.odran + '; drops ' + JSON.stringify(sv.drops));
    return { pass: !!sv.defeated.odran, notes, shot: 'T_13_deathblow.png' }; });
  void finalShot;

  // 14 + 15 -------------------------------------------------------- the Headsman's Key and the gate
  await step("14 take the Headsman's Key", async () => { const notes = []; const d = (await save()).drops.headkey; if (!d) return { pass: false, notes: ['no headkey on the ground: ' + JSON.stringify((await save()).inv)] };
    const s0 = await T.st(); const a = Math.atan2(s0.x - d.x, s0.z - d.z); const s = await promptAt(d.x + Math.sin(a) * 1.1, d.z + Math.cos(a) * 1.1, d.x, d.z, /key/i, 0.4);
    notes.push('key at ' + d.x + ',' + d.z + '; prompt "' + s.prompt + '"'); await T.shot('T_14_key'); if (!/key/i.test(s.prompt)) return { pass: false, notes };
    await T.tap('KeyE'); await sleep(1500); await waitPlaying(15000); const sv = await save(); notes.push('inv ' + JSON.stringify(sv.inv) + '; objective "' + (await objText()) + '"');
    return { pass: (sv.inv.headkey || 0) > 0, notes, shot: 'T_14_key.png' }; });
  await step('15 open the Hollowwood Gate', async () => { const notes = [];
    const r = await route([[0, 60], [0, 66]], 0.8); notes.push('route ok ' + r.ok);
    const s = await promptAt(0, 67.8, 0, 70, /Hollowwood|gate/i); notes.push('prompt "' + s.prompt + '"'); await T.shot('T_15_gate_prompt'); if (!/Hollowwood|gate/i.test(s.prompt)) return { pass: false, notes };
    await T.tap('KeyE'); await sleep(6000); const w0 = Date.now(); let st; while (Date.now() - w0 < 30000) { st = (await T.st()).s; if (st === 'ended') break; await sleep(800); }
    await T.shot('T_15_gate_open'); const sv = await save(); notes.push('state ' + st + ', opened ' + JSON.stringify(sv.opened) + ', chapter1_complete ' + !!sv.flags.chapter1_complete);
    return { pass: !!sv.opened.hollowgate || !!sv.flags.chapter1_complete, notes, shot: 'T_15_gate_open.png' }; });

  T.cur = 'final';
  steps.push({ name: '16 no console / page errors over the whole run', status: T.errors.length ? 'FAIL' : 'PASS', notes: T.errors.length ? T.errors.map(e => '[' + e.step + '] ' + e.kind + ': ' + e.msg) : ['0 errors over ' + now() + ' s'] });
  const fps = (await T.st().catch(() => ({}))).fps;
  fs.writeFileSync(OUT, JSON.stringify({ when: new Date().toISOString(), quality: QUALITY, totalSecs: +now(), fps, help, steps, confusing, errors: T.errors }, null, 2));
  console.log('\n' + steps.map(s => s.status + '  ' + s.name).join('\n')); console.log(steps.filter(s => s.status === 'PASS').length + '/' + steps.length + ' passed in ' + now() + ' s; help ' + JSON.stringify(help));
  await T.browser.close(); process.exit(0);
})().catch(async e => { console.log('CRASH', e && e.stack); try { fs.writeFileSync(OUT, JSON.stringify({ crash: String(e && e.stack), steps, confusing, help, errors: T && T.errors }, null, 2)); } catch (x) {} try { await T.browser.close(); } catch (x) {} process.exit(1); });
