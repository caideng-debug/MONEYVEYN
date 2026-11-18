// Phase 1 REAL-INPUT browser playtest (headless Chromium + SwiftShader via playwright-core).
// Every action is page.keyboard / page.mouse. window.VEYN_* hooks are used ONLY to READ state for assertions and steering.
// usage: LD_LIBRARY_PATH=/workspace/veynhold/.tools/chromelibs node .test/p1_browser.js
//
// Environment shim (not a game hook): headless Chromium's pointer lock reports movementX as +X then -X for every synthetic
// mouse move (net zero, split across frames), so mouse look cannot work under lock in this browser. The init script makes
// requestPointerLock reject, which is what a browser that refuses pointer lock does; the game then uses its own drag-to-look
// fallback (src/game.js Input.init: mousemove while a button is held). We drag with the MIDDLE button so the drag neither
// attacks (left) nor guards (right).
const { chromium } = require('/workspace/veynhold/.tools/node_modules/playwright-core');
const fs = require('fs');
const URL = 'file:///workspace/veynhold/dist/index.html', SHOTS = '/workspace/veynhold/shots/', OUT = '/workspace/veynhold/.test/p1_browser_result.json';
const T0 = Date.now(); const now = () => ((Date.now() - T0) / 1000).toFixed(1);
const steps = []; const errors = []; const log = (...a) => console.log('[' + now() + 's]', ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ executablePath: '/workspace/veynhold/.tools/browsers/chromium-1134/chrome-linux/chrome',
    args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });   // fresh context = fresh localStorage
  await ctx.addInitScript(() => { Element.prototype.requestPointerLock = function () { return Promise.reject(new DOMException('pointer lock disabled for the headless playtest', 'NotSupportedError')); }; });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push({ t: now(), step: cur, kind: 'pageerror', msg: e.message }));
  page.on('console', m => { if (m.type() === 'error') errors.push({ t: now(), step: cur, kind: 'console.error', msg: m.text() }); });
  let cur = 'boot';

  // ---------------- read-only state helpers ----------------
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const st = () => ev(() => { const G = window.VEYN_GAME, A = window.VEYN_ADV, W = G.Game.world, P = W && W.player; const pr = document.getElementById('advPrompt');
    return { s: G.Game.state, fps: G.Game.fps, x: P ? P.x : null, z: P ? P.z : null, yaw: G.Cam.yaw, hp: P ? P.hp : null, dead: P ? !!P.dead : null, pstate: P ? P.state : null,
      prompt: pr && pr.style.display !== 'none' ? pr.textContent : '', zone: P && A.active && A.Region.zoneAt(P.x, P.z) ? A.Region.zoneAt(P.x, P.z).id : null, sens: G.Settings.sens }; });
  const shot = async name => { await page.screenshot({ path: SHOTS + 'pb_' + name + '.png' }); return 'pb_' + name + '.png'; };
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

  // ---------------- real-input helpers ----------------
  const cx = () => (page.viewportSize().width / 2) | 0, cy = () => (page.viewportSize().height / 2) | 0;
  async function look(dYaw) {   // turn the camera by dYaw radians with a middle-button mouse drag (yaw -= mdx * sens)
    const sens = (await st()).sens; let px = -dYaw / sens; const lim = page.viewportSize().width / 2 - 20;
    while (Math.abs(px) > 1) { const d = Math.max(-lim, Math.min(lim, px)); await page.mouse.move(cx(), cy()); await page.mouse.down({ button: 'middle' });
      await page.mouse.move(cx() + d, cy(), { steps: 6 }); await sleep(120); await page.mouse.up({ button: 'middle' }); px -= d; } await sleep(150); }
  const held = new Set(); const down = async k => { if (!held.has(k)) { held.add(k); await page.keyboard.down(k); } }; const up = async k => { if (held.has(k)) { held.delete(k); await page.keyboard.up(k); } };
  const releaseAll = async () => { for (const k of [...held]) await up(k); };
  const tap = async (k, ms) => { await page.keyboard.down(k); await sleep(ms || 90); await page.keyboard.up(k); };
  async function clickEl(sel) { const b = await page.$(sel); if (!b) throw new Error('no element ' + sel); const r = await b.boundingBox(); if (!r) throw new Error('not visible ' + sel);
    await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2); }
  // walk to (tx,tz): steer with mouse look, move with W (+Shift when far). Returns {ok, d, iters}.
  async function walkTo(tx, tz, tol, maxMs) { const t0 = Date.now(); let last = null, stuck = 0, iters = 0;
    while (Date.now() - t0 < (maxMs || 40000)) { iters++; const s = await st(); if (s.s !== 'playing') { await releaseAll(); await sleep(200); continue; }
      const dx = tx - s.x, dz = tz - s.z, d = Math.hypot(dx, dz); if (d < (tol || 0.6)) { await releaseAll(); return { ok: true, d, iters }; }
      const want = Math.atan2(dx, dz), err = wrap(want - s.yaw);
      if (Math.abs(err) > (d < 2 ? 0.35 : 0.2)) { await releaseAll(); await look(err); continue; }
      if (d > 4) await down('ShiftLeft'); else await up('ShiftLeft'); await down('KeyW'); await sleep(d < 1.5 ? 120 : 260);
      const s2 = await st(); if (last && Math.hypot(s2.x - last.x, s2.z - last.z) < 0.03) { if (++stuck > 4) { await releaseAll(); await down(stuck % 2 ? 'KeyA' : 'KeyD'); await sleep(500); await releaseAll(); stuck = 0; } } else stuck = 0; last = s2; }
    await releaseAll(); const s = await st(); return { ok: false, d: Math.hypot(tx - s.x, tz - s.z), iters }; }
  async function faceTo(tx, tz) { const s = await st(); await look(wrap(Math.atan2(tx - s.x, tz - s.z) - s.yaw)); }

  // ---------------- step runner (max 2 attempts each, never blocks the rest) ----------------
  async function step(name, fn) { cur = name; const e0 = errors.length, t = Date.now(); let res = { status: 'FAIL', notes: [] };
    for (let attempt = 1; attempt <= 2; attempt++) { try { res = await fn(attempt); res.notes = res.notes || []; if (res.status === 'PASS' || res.status === 'SKIPPED') break; }
      catch (e) { res = { status: 'FAIL', notes: ['exception: ' + (e && e.message || e)] }; await releaseAll().catch(() => {}); }
      if (attempt === 2) res.notes.push('LOOPED: still failing after 2 attempts, moved on'); else log(name, 'attempt', attempt, 'failed:', res.notes.join('; ')); }
    const newErr = errors.slice(e0); if (newErr.length && res.status === 'PASS') { res.status = 'FAIL'; res.notes.push(newErr.length + ' console/page error(s) during the step'); }
    res.name = name; res.secs = +((Date.now() - t) / 1000).toFixed(1); res.errors = newErr.map(e => e.msg); steps.push(res); log(res.status, name, '(' + res.secs + 's)', res.notes.join(' | ')); return res; }
  const pass = (c, notes) => ({ status: c ? 'PASS' : 'FAIL', notes: [].concat(notes || []) });

  // ======================================================== 1) fresh start
  await step('1 fresh localStorage, load, New Journey from the title', async (att) => {
    const t = Date.now(); if (att === 1) { await page.goto(URL); } else { await page.reload(); }
    await page.waitForFunction(() => window.VEYN_ADV && document.getElementById('advNew') && window.VEYN_GAME && window.VEYN_GAME.Game.state === 'title', null, { timeout: 60000 });
    const loadS = ((Date.now() - t) / 1000).toFixed(1); await sleep(1200);
    const ls = await ev(() => ({ n: localStorage.length, keys: Object.keys(localStorage), cont: getComputedStyle(document.getElementById('advContinue')).display }));
    await shot('01_title');
    const qb = await page.$('#qualBtn'); const qt = await qb.textContent(); if (/Medium/.test(qt)) await clickEl('#qualBtn');   // real click: Medium -> Low (SwiftShader runs Medium at ~2 fps)
    await clickEl('#advNew'); await sleep(600); const s = await st();
    return pass(!ls.keys.includes('veynhold_save') && ls.cont === 'none' && s.s === 'prologue', ['load to title ' + loadS + ' s', 'localStorage keys before start: ' + JSON.stringify(ls.keys), 'Continue hidden: ' + (ls.cont === 'none'),
      'quality button clicked: ' + qt + ' -> ' + (await ev(() => window.VEYN_GAME.Settings.quality)), 'state after New Journey click: ' + s.s]); });

  // ======================================================== 2) prologue
  await step('2 pass the prologue', async () => { await sleep(1500); await shot('02_prologue'); const txt = await ev(() => document.querySelector('#advProlog p').textContent);
    const t = Date.now(); await tap('Space'); await page.waitForFunction(() => window.VEYN_GAME.Game.state === 'playing', null, { timeout: 15000 }); const into = ((Date.now() - t) / 1000).toFixed(1);
    await sleep(2500); const s = await st(); await shot('02_spawn');
    const save = await ev(() => JSON.parse(localStorage.getItem('veynhold_save') || '{}'));
    return pass(s.s === 'playing' && Math.abs(s.x) < 0.2 && Math.abs(s.z + 73) < 0.2 && save.schema === 1, ['prologue line on screen: "' + txt + '"', 'Space -> playing in ' + into + ' s', 'spawn ' + s.x.toFixed(2) + ',' + s.z.toFixed(2) + ' zone ' + s.zone, 'fps ~' + s.fps.toFixed(1)]); });

  // ======================================================== 3) walk out of the Corpse Pit (WASD + mouse look); sword pickup on the way (needed for step 6)
  let pitNotes = [];
  await step('3 walk out of the Corpse Pit with WASD + mouse look', async () => { const notes = [];
    // mouse look check
    const y0 = (await st()).yaw; await look(-0.8); const y1 = (await st()).yaw; await look(0.8); const y2 = (await st()).yaw;
    notes.push('mouse drag look: yaw ' + y0.toFixed(2) + ' -> ' + y1.toFixed(2) + ' -> ' + y2.toFixed(2)); const lookOk = Math.abs(wrap(y1 - y0) + 0.8) < 0.25 && Math.abs(wrap(y2 - y0)) < 0.25;
    // WASD check: D strafes, S backs up
    let s = await st(); await down('KeyD'); await sleep(700); await up('KeyD'); await sleep(300); let s2 = await st(); notes.push('D strafe dx ' + (s2.x - s.x).toFixed(2));
    const strafeOk = Math.abs(s2.x - s.x) > 0.3; await down('KeyA'); await sleep(700); await up('KeyA'); await sleep(300);
    // sword on the corpse cart
    let r = await walkTo(4.4, -71.6, 0.5, 30000); await faceTo(5.2, -72.6); await sleep(300); s = await st(); notes.push('at the cart: prompt "' + s.prompt + '"');
    if (/sword/i.test(s.prompt)) { await tap('KeyE'); await sleep(1500); }
    const sword = await ev(() => window.VEYN_ADV.Save.data.equip.weapon); notes.push('weapon after E: ' + sword); await shot('03_sword');
    await sleep(800); if ((await st()).s !== 'playing') { await tap('KeyE'); await sleep(800); }
    pitNotes = notes; return pass(lookOk && strafeOk && r.ok, notes); });

  // ======================================================== 4) Tamsin
  await step('4 talk to Tamsin (E), advance and close the dialogue', async () => { const notes = [];
    const r = await walkTo(-3.6, -67, 0.5, 30000); await faceTo(-5.2, -67); await sleep(400); let s = await st(); notes.push('walk ok ' + r.ok + ', prompt "' + s.prompt + '"');
    if (!/Tamsin/.test(s.prompt)) return pass(false, notes.concat('no Talk to Tamsin prompt'));
    await tap('KeyE'); await sleep(900); s = await st(); const first = await ev(() => document.querySelector('#advDlg .txt').textContent); notes.push('E -> ' + s.s + ': "' + first.slice(0, 60) + '…"'); await shot('04_dialogue');
    let presses = 0, clicks = 0, shotChoice = false;
    for (let i = 0; i < 30 && (await st()).s === 'dialogue'; i++) { const n = await ev(() => document.querySelectorAll('#advDlg .ch button').length);
      if (n) { if (!shotChoice) { await shot('04_choices'); shotChoice = true; } await clickEl('#advDlg .ch button:nth-child(' + Math.min(n, 3) + ')'); clicks++; } else { await tap('KeyE'); presses++; } await sleep(450); }
    s = await st(); const d = await ev(() => { const S = window.VEYN_ADV.Save.data; return { met: !!S.flags.met_tamsin, names: S.quests.names && S.quests.names.stage, main: S.quests.main && S.quests.main.stage }; });
    notes.push('advanced with ' + presses + ' E presses + ' + clicks + ' choice clicks; state ' + s.s + '; flags ' + JSON.stringify(d));
    return pass(s.s === 'playing' && d.met && d.names === 0, notes); });

  // ======================================================== 3b) leaving the pit is asserted here (the walk north through the cut)
  // ======================================================== 5) lantern
  let pitExit = null;
  await step('5 find and rest at the first lantern', async () => { const notes = [];
    let r = await walkTo(0, -63.5, 0.6, 30000); r = await walkTo(0, -59.6, 0.4, 30000); const s0 = await st(); pitExit = s0.zone; notes.push('zone now ' + s0.zone + ' at ' + s0.x.toFixed(1) + ',' + s0.z.toFixed(1));
    await faceTo(0, -57.5); await sleep(400); let s = await st(); notes.push('prompt "' + s.prompt + '"'); await shot('05_lantern_prompt');
    if (!/Kindle|Rest/i.test(s.prompt)) return pass(false, notes.concat('no lantern prompt'));
    const t = Date.now(); await tap('KeyE'); await sleep(2500); let k = 0; while ((await st()).s !== 'playing' && k++ < 10) await sleep(500);
    const d = await ev(() => { const S = window.VEYN_ADV.Save.data; return { lit: S.lit, lantern: S.lantern, main: S.quests.main.stage }; }); s = await st();
    notes.push('kindled -> playing again after ' + ((Date.now() - t) / 1000).toFixed(1) + ' s; save ' + JSON.stringify(d)); await shot('05_rested');
    return pass(d.lit.includes('grave') && d.lantern === 'grave' && s.s === 'playing', notes); });
  // record the pit exit as part of step 3
  { const s3 = steps.find(x => x.name.startsWith('3 ')); if (s3) { const left = pitExit && pitExit !== 'pit'; s3.notes.push('left the pit through the Gravedigger\u2019s Cut: zone ' + pitExit); if (!left) { s3.status = 'FAIL'; s3.notes.push('never left the pit zone'); } } }

  // ======================================================== 6) fight a field enemy
  await step('6 engage a field enemy, block/deflect, damage or kill it', async (att) => { const notes = [];
    const E = () => ev(() => { const A = window.VEYN_ADV, P = window.VEYN_GAME.Game.world.player; const live = A.Ents.list.filter(e => !e.f.dead && !e.def.boss);
      let best = null, bd = 1e9; for (const e of live) { const d = Math.hypot(e.f.x - P.x, e.f.z - P.z); if (d < bd) { bd = d; best = e; } }
      if (!best) return null; const f = best.f; return { id: best.def.id, x: f.x, z: f.z, hp: f.hp, maxHp: f.maxHp, dead: !!f.dead, mode: best.mode, state: f.state, atk: !!f.atk, phase: f.atk ? f.atk.phase : null, d: bd, facing: f.facing, posture: f.posture,
        ps: { blocks: P.stats.blocks, deflects: P.stats.deflects }, php: P.hp, pdead: !!P.dead, lock: P.lockId }; });
    let e = await E(); notes.push('nearest foe ' + e.id + ' at ' + e.x.toFixed(1) + ',' + e.z.toFixed(1) + ' (' + e.mode + ')'); const id = e.id, hp0 = e.hp;
    // approach from behind (it faces north), 2.2 m away
    await walkTo(e.x - Math.sin(e.facing) * 2.2, e.z - Math.cos(e.facing) * 2.2, 0.5, 30000); await faceTo(e.x, e.z); await shot('06_approach');
    await tap('KeyQ'); await sleep(200); await tap('KeyJ'); await sleep(300);
    const t0 = Date.now(); let guarding = false, firstShot = false, attacks = 0, lastAtk = false, deaths0 = await ev(() => window.VEYN_ADV.Save.data.deaths);
    while (Date.now() - t0 < 60000) { e = await ev(id => { const A = window.VEYN_ADV, P = window.VEYN_GAME.Game.world.player, x = A.Ents.list.find(q => q.def.id === id); if (!x) return null; const f = x.f;
        return { hp: f.hp, maxHp: f.maxHp, dead: !!f.dead, mode: x.mode, state: f.state, atk: !!f.atk && f.isAttacking !== false, d: Math.hypot(f.x - P.x, f.z - P.z), x: f.x, z: f.z, ps: { blocks: P.stats.blocks, deflects: P.stats.deflects }, php: P.hp, pst: P.state, gs: window.VEYN_GAME.Game.state }; }, id);
      if (!e || e.dead) break; if (e.gs !== 'playing') { await releaseAll(); guarding = false; await sleep(300); continue; }
      const attacking = e.state === 'attack'; if (attacking && !lastAtk) attacks++; lastAtk = attacking;
      if (attacking) { if (!guarding) { await down('KeyF'); guarding = true; } if (!firstShot && e.ps.blocks + e.ps.deflects > 0) { await shot('06_block'); firstShot = true; } await sleep(60); continue; }
      if (guarding) { await up('KeyF'); guarding = false; await sleep(80); }
      if (e.d > 2.6) { await down('KeyW'); await sleep(150); await up('KeyW'); continue; }
      if (e.ps.blocks + e.ps.deflects > 0 || attacks > 6) { await tap('KeyJ', 70); await sleep(250); } else await sleep(80);   // let it swing first so we get a block/deflect in, then press the attack
      if (e.ps.blocks + e.ps.deflects > 0 && e.hp < hp0 && Date.now() - t0 > 40000) break; }
    await releaseAll(); await sleep(400); e = await ev(id => { const A = window.VEYN_ADV, P = window.VEYN_GAME.Game.world.player, x = A.Ents.list.find(q => q.def.id === id); const f = x ? x.f : null;
      return { hp: f ? f.hp : 0, maxHp: f ? f.maxHp : 0, dead: !f || !!f.dead, mode: x ? x.mode : 'gone', ps: { blocks: P.stats.blocks, deflects: P.stats.deflects, hits: P.stats.hitsLanded }, php: P.hp, deaths: window.VEYN_ADV.Save.data.deaths, kills: window.VEYN_ADV.Save.data.kills }; }, id);
    await shot('06_after'); if (!firstShot) await shot('06_block');
    notes.push('fight ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s; enemy swings seen ' + attacks + '; player blocks ' + e.ps.blocks + ', deflects ' + e.ps.deflects + '; enemy hp ' + hp0 + ' -> ' + Math.max(0, e.hp).toFixed(0) + (e.dead ? ' (killed)' : '') + '; player hp ' + e.php.toFixed(0) + '; deaths ' + deaths0 + ' -> ' + e.deaths);
    return pass(e.ps.blocks + e.ps.deflects >= 1 && (e.dead || e.hp < hp0), notes); });

  // walk back to the lantern so the following steps are not interrupted by the foe (menu pauses the sim anyway)
  // ======================================================== 7) pause menu
  let musicSet = null;
  await step('7 pause menu: click every tab (Inventory, Quests…), change a volume setting', async () => { const notes = [];
    if ((await st()).s !== 'playing') await sleep(3000);
    await tap('Escape'); await sleep(700); let s = await st(); const vis = await ev(() => document.getElementById('advMenu').style.display); notes.push('Esc -> ' + s.s + ' (menu display ' + vis + ')');
    if (s.s !== 'paused') return pass(false, notes);
    const tabs = ['Journey', 'Inventory', 'Quests', 'Lore', 'Map', 'Settings', 'Controls']; const seen = {};
    for (const t of tabs) { const tt = Date.now(); await clickEl('#advMenu [data-t="' + t + '"]'); await sleep(350); const r = await ev(() => ({ on: (document.querySelector('#advMenu .tabs .on') || {}).textContent, html: document.querySelector('#advMenu .body').innerText }));
      seen[t] = r.on === t && r.html.length > 5; if (['Journey', 'Inventory', 'Quests', 'Map', 'Settings'].includes(t)) await shot('07_' + t.toLowerCase()); notes.push(t + ': ' + (seen[t] ? 'ok' : 'NOT shown') + ' (' + (Date.now() - tt) + ' ms) "' + r.html.replace(/\s+/g, ' ').slice(0, 70) + '"'); }
    const inv = await ev(() => document.querySelector('#advMenu .body') && 0); void inv;
    await clickEl('#advMenu [data-t="Inventory"]'); await sleep(300); const invTxt = await ev(() => document.querySelector('#advMenu .body').innerText);
    await clickEl('#advMenu [data-t="Quests"]'); await sleep(300); const qTxt = await ev(() => document.querySelector('#advMenu .body').innerText);
    const invOk = /Ward/.test(invTxt) && /Draught/.test(invTxt), qOk = /Names for the Dead/i.test(qTxt);
    notes.push('inventory lists the sword + draughts: ' + invOk + '; quests list Names for the Dead: ' + qOk);
    // volume: click the Music slider at ~30%
    await clickEl('#advMenu [data-t="Settings"]'); await sleep(300); const before = await ev(() => window.VEYN_GAME.Settings.musicVol);
    const sl = await page.$('#setMus'); const b = await sl.boundingBox(); await page.mouse.click(b.x + b.width * 0.3, b.y + b.height / 2); await sleep(400);
    musicSet = await ev(() => ({ s: window.VEYN_GAME.Settings.musicVol, slider: +document.getElementById('setMus').value, stored: JSON.parse(localStorage.getItem('veynhold_v8') || '{}').musicVol, q: window.VEYN_GAME.Settings.quality }));
    await shot('07_volume_changed'); notes.push('music volume ' + before + ' -> ' + musicSet.s + ' (slider ' + musicSet.slider + ', stored ' + musicSet.stored + ')');
    return pass(Object.values(seen).every(Boolean) && invOk && qOk && musicSet.s !== before && Math.abs(musicSet.stored - musicSet.s) < 1e-6, notes); });

  // ======================================================== 8) close, reload, Continue, persistence
  await step('8 close menu, reload, Continue; position, flags, settings persisted', async () => { const notes = [];
    await tap('Escape'); await sleep(600); let s = await st(); notes.push('Esc closes the menu -> ' + s.s); const closed = s.s === 'playing';
    const before = await ev(() => { const S = window.VEYN_ADV.Save.data; return { lantern: S.lantern, lit: S.lit.slice(), met: !!S.flags.met_tamsin, weapon: S.equip.weapon, main: S.quests.main.stage, names: S.quests.names.stage }; });
    await page.reload(); await page.waitForFunction(() => window.VEYN_ADV && document.getElementById('advContinue') && window.VEYN_GAME.Game.state === 'title', null, { timeout: 60000 }); await sleep(1200);
    const cont = await ev(() => ({ disp: getComputedStyle(document.getElementById('advContinue')).display, sub: document.getElementById('advContSub').textContent })); notes.push('title Continue: ' + cont.disp + ' "' + cont.sub + '"'); await shot('08_title_continue');
    await clickEl('#advContinue'); await page.waitForFunction(() => window.VEYN_GAME.Game.state === 'playing', null, { timeout: 20000 }); await sleep(2000); s = await st(); await shot('08_continued');
    const after = await ev(() => { const S = window.VEYN_ADV.Save.data, G = window.VEYN_GAME; return { lantern: S.lantern, lit: S.lit.slice(), met: !!S.flags.met_tamsin, weapon: S.equip.weapon, main: S.quests.main.stage, names: S.quests.names.stage, musicVol: G.Settings.musicVol, quality: G.Settings.quality }; });
    const posOk = Math.abs(s.x - (0 - 0.4)) < 0.3 && Math.abs(s.z - (-57.5 - 1.7)) < 0.3;
    notes.push('position after Continue ' + s.x.toFixed(2) + ',' + s.z.toFixed(2) + ' (expected the Gravedigger\u2019s Lantern spawn -0.40,-59.20; the save stores the lantern, not the exact spot)');
    notes.push('before ' + JSON.stringify(before)); notes.push('after ' + JSON.stringify(after));
    const flagsOk = after.lantern === before.lantern && after.met === before.met && after.weapon === before.weapon && after.main === before.main && after.names === before.names && JSON.stringify(after.lit) === JSON.stringify(before.lit);
    const setOk = musicSet && Math.abs(after.musicVol - musicSet.s) < 1e-6 && after.quality === 'low';
    return pass(closed && cont.disp !== 'none' && posOk && flagsOk && setOk, notes); });

  // ======================================================== 9) resize
  await step('9 resize to 800x500 and 1366x768, no errors', async () => { const notes = []; let ok = true;
    for (const [w, h] of [[800, 500], [1366, 768]]) { await page.setViewportSize({ width: w, height: h }); await sleep(1500);
      await down('KeyW'); await sleep(600); await up('KeyW'); await sleep(400);
      const r = await ev(() => { const G = window.VEYN_GAME, c = document.getElementById('c'), hud = document.getElementById('advObj'); const hb = hud ? hud.getBoundingClientRect() : null;
        return { aspect: G.camera.aspect, cw: c.clientWidth, ch: c.clientHeight, state: G.Game.state, hudRight: hb ? hb.right : null, iw: innerWidth }; });
      const okA = Math.abs(r.aspect - w / h) < 0.01 && r.cw === w && r.ch === h && r.state === 'playing'; ok = ok && okA;
      notes.push(w + 'x' + h + ': camera aspect ' + r.aspect.toFixed(3) + ' (want ' + (w / h).toFixed(3) + '), canvas ' + r.cw + 'x' + r.ch + ', state ' + r.state + (r.hudRight !== null ? ', objective box right edge ' + Math.round(r.hudRight) + ' / ' + r.iw : ''));
      await shot('09_' + w + 'x' + h); }
    return pass(ok, notes); });

  // ======================================================== 10) errors throughout
  cur = 'final';
  steps.push({ name: '10 no console errors or page errors throughout', status: errors.length ? 'FAIL' : 'PASS', notes: errors.length ? errors.map(e => '[' + e.step + '] ' + e.kind + ': ' + e.msg) : ['0 console errors, 0 page errors over ' + now() + ' s'], secs: 0 });
  const perf = await ev(() => ({ fps: window.VEYN_GAME.Game.fps, quality: window.VEYN_GAME.Settings.quality })).catch(() => null);
  fs.writeFileSync(OUT, JSON.stringify({ when: new Date().toISOString(), totalSecs: +now(), perf, steps, errors }, null, 2));
  console.log('\n' + steps.map(s => s.status + '  ' + s.name).join('\n')); console.log(steps.filter(s => s.status === 'PASS').length + '/' + steps.length + ' steps passed in ' + now() + ' s');
  await browser.close(); process.exit(0);
})().catch(e => { console.log('CRASH', e && e.stack); try { fs.writeFileSync(OUT, JSON.stringify({ crash: String(e && e.stack), steps, errors }, null, 2)); } catch (x) {} process.exit(1); });
