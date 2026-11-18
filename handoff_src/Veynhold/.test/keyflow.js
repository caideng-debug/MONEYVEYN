// Chunk C: the key flow, end to end (jsdom page; real key events for E / movement / menus; hooks only to break posture and to kill the player).
// fresh start -> read the clue -> objective updates -> kill the sergeant -> key item visible -> survives death + reload -> E takes it
// (also mid-jump and with a foe engaged nearby: the regression) -> inventory -> door opens -> death + reload keep it -> headkey chain.
const mk = require('./p1h.js'); const sleep = ms => new Promise(r => setTimeout(r, ms));
const FILE = process.env.VEYN_FILE || require('path').join(__dirname, '..', 'dist', 'index.html');
const res = []; const ok = (n, c, i) => { res.push((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? ' [' + i + ']' : '')); };
(async () => {
let H = mk({ file: FILE }), { w, G, Game, frames, key, tap, errors } = H; let A = w.VEYN_ADV, C = w.VEYN_CORE;
const W = () => Game.world, P = () => Game.world.player, S = () => A.Save.data, $ = id => w.document.getElementById(id);
const ent = id => A.Ents.list.find(e => e.def.id === id);
const calm = () => { for (const e of A.Ents.list) if (e.mode === 'combat' && !e.def.boss) { A.Ents.disengage(e); e.f.x = e.f.px = e.home.x; e.f.z = e.f.pz = e.home.z; } };
const tp = (x, z, face) => { calm(); const p = P(); p.x = p.px = x; p.z = p.pz = z; p.vx = p.vz = 0; if (face !== undefined) { p.facing = face; G.Cam.yaw = face; } frames(3); };
const press = async (code, n) => { tap(code); frames(n || 10); await sleep(15); };
const prompt = () => $('advPrompt').style.display !== 'none' ? $('advPrompt').textContent : '';
const objT = () => w.document.querySelector('#advObj span').textContent, objS = () => (w.document.querySelector('#advObj em') || {}).textContent || '';
const dlgThrough = async () => { for (let i = 0; i < 30 && Game.state === 'dialogue'; i++) { const ch = w.document.querySelectorAll('#advDlg .ch button'); if (ch.length) await press('Digit1', 4); else await press('KeyE', 4); } };
const killWithE = async (e) => { const f = e.f; for (let k = 0; k < 4 && !f.dead; k++) { const m0 = f.marks; tp(f.x, f.z - 1.6, 0); f.x = P().x; f.z = P().z + 1.6; f.atk = null; C.addPosture(W(), f, 1e5); frames(3); tap('KeyE'); frames(200); await sleep(10); if (f.marks < m0) break; } };
const die = async () => { const p = P(); p.invuln = false; p.hp = 0; p.dead = true; p.setState('dead', 99); W().emit({ type: 'death', f: p.id }); frames(10); await sleep(20); frames(330); await sleep(30); frames(20); };
const reload = async () => { const stor = { veynhold_save: w.localStorage.getItem('veynhold_save') }; H.dom.window.close(); H = mk({ file: FILE, storage: stor }); ({ w, G, Game, frames, key, tap, errors } = H); A = w.VEYN_ADV; C = w.VEYN_CORE; frames(3); w.document.getElementById('advContinue').click(); frames(8); await sleep(20); frames(5); };
const keyObj = item => A.Keys.list[item];

// ---- 1) fresh start + tutorial (Tamsin, sword, lantern) with real E presses
frames(3); $('advNew').click(); frames(2); key('Space', true); key('Space', false); await sleep(30); frames(5);
ok('fresh start: playing in the Corpse Pit, no keys anywhere', Game.state === 'playing' && !A.Inv.count('gaolkey') && !Object.keys(A.Keys.list).length);
tp(-3.6, -67, -Math.PI / 2); await press('KeyE'); await dlgThrough();
tp(4.4, -71.6, Math.PI * 0.8); await press('KeyE'); await sleep(40); frames(10);
ok('sword taken with a real E press (main -> 2, lantern step)', A.Quests.stage('main') === 2 && A.Inv.count('wardblade') === 1 && /Kindle the Vigil Lantern/.test(objT()), A.Quests.stage('main') + ' ' + objT());

// ---- 2) the clue in the pit, read BEFORE the lantern (merge 2: the objective must move to the sergeant right away)
tp(-3.3, -61.9, Math.PI); ok('the posted order on the body has a prompt', /Read the order/.test(prompt()), prompt());
await press('KeyE', 5); ok('E reads it: the sergeant keeps the gaol key on his belt, by the Gaol fire', Game.state === 'reading' && /sergeant keeps the gaol key on his belt/i.test($('advRead').textContent) && /Gaol fire/.test($('advRead').textContent));
await press('KeyE'); frames(40);
ok('objective updates at once (stage 2): "The sergeant by the gaol carries the key", not the lantern', S().flags.clue_gaolkey && A.Quests.stage('main') === 2 && /The sergeant by the gaol carries the key/.test(objT()) && !/Kindle/.test(objT()), objT());
ok('sub-line names Brask in the Gaol office and leaves the lantern optional', /Sergeant Brask/.test(objS()) && /Gaol office/.test(objS()) && /Optional: kindle the Vigil Lantern/.test(objS()), objS());
ok('"Objective updated" flash on the line', /Objective updated/i.test(w.document.querySelector('#advObj small').textContent) && $('advObj').classList.contains('upd'));
ok('compass objective mark (stage 2) now points at the sergeant', JSON.stringify(A.Region.data.objectiveMarks[2]) === '[-43,-25]', JSON.stringify(A.Region.data.objectiveMarks[2]));
// the lantern is optional: kindling it after the clue moves the stage to 3 but the line stays on the sergeant
tp(0, -59.4, 0); await press('KeyE'); await sleep(40); frames(10);
ok('lantern kindled after the clue (main -> 3): objective still the sergeant, optional-lantern note gone', A.Quests.stage('main') === 3 && /The sergeant by the gaol carries the key/.test(objT()) && !/Optional/.test(objS()), objT() + ' | ' + objS());
ok('compass objective mark (stage 3) points at the sergeant', JSON.stringify(A.Region.data.objectiveMarks[3]) === '[-43,-25]');
{ S().flags.clue_gaolkey = false; ok('without the clue, stage 3 still reads "Find a way out of the Execution Grounds"', /Find a way out of the Execution Grounds/.test(A.objective().t), A.objective().t); S().flags.clue_gaolkey = true; A.refreshObjective(); }

// ---- 3) the Gaol: the sergeant wears the key; the locked door names it
const g3 = ent('g3'); ok('Sergeant Brask wears the key on his belt (mounted mesh)', !!(g3.c._belt && g3.c._belt.parent));
tp(-24, -34, -Math.PI / 2); frames(5); ok('entering the Gaol: main -> 4, objective still the sergeant', A.Quests.stage('main') === 4 && /sergeant/.test(objT()));
tp(-53, -14.5, 0); ok('locked door prompt names the key', /needs the Gaol Key/.test(prompt()), prompt());
await press('KeyE'); ok('locked door message says which key and where it is', /Gaol Key/.test($('advHint').textContent) && /Gaol office/.test($('advHint').textContent) && !S().opened.gaoldoor, $('advHint').textContent);

// ---- 4) kill the sergeant (posture break via hook, deathblow with E)
await killWithE(g3); frames(5);
ok('sergeant felled', g3.f.dead);
const k1 = keyObj('gaolkey');
ok('the Gaol Key drops as a real 3D item (mesh + glint) at the body', !!k1 && k1.grp.parent === A.Region.dyn && k1.mesh.isMesh && k1.gl.isSprite && Math.hypot(k1.x - g3.f.x, k1.z - g3.f.z) < 0.05);
ok('not auto-taken: inventory empty until picked up', A.Inv.count('gaolkey') === 0 && S().drops.gaolkey && !S().collected.key_gaolkey);
ok('belt key gone from the body', !g3.c._belt);
{ const r0 = k1.mesh.rotation.y, y0 = k1.mesh.position.y; frames(20); ok('the key turns and bobs slowly', k1.mesh.rotation.y !== r0 && k1.mesh.position.y !== y0); }
ok('key geometry: bow + shaft + bit merged into one mesh', k1.mesh.geometry.attributes.position.count > 100, k1.mesh.geometry.attributes.position.count);
ok('objective: take the key from the body', /Take the Gaol Key/.test(objT()), objT());
ok('saved: the drop lies in localStorage', !!JSON.parse(w.localStorage.getItem('veynhold_save')).drops.gaolkey);

// ---- 5) death and reload before taking it: it stays, exactly once
await die(); ok('death -> respawn at the lantern', Game.state === 'playing' && !P().dead);
ok('after death the key still lies on the ground (one key, same spot)', Object.keys(A.Keys.list).length === 1 && !!keyObj('gaolkey') && A.Inv.count('gaolkey') === 0);
await reload();
ok('after reload the key still lies on the ground', !!keyObj('gaolkey') && A.Inv.count('gaolkey') === 0 && keyObj('gaolkey').grp.parent === A.Region.dyn);
{ const s3 = ent('g3'); frames(3); ok('the respawned sergeant no longer wears a key', s3 && !s3.c._belt); }

// ---- 6) the pickup: prompt at 2.2 m, works with a foe engaged nearby and when E is pressed mid-jump (regression)
const kp = S().drops.gaolkey; tp(kp.x, kp.z - 3.0, 0); ok('no prompt beyond 2.2 m', !/Take the Gaol Key/.test(prompt()), prompt());
tp(kp.x, kp.z - 1.9, 0); ok('prompt within 2.2 m: "Take the Gaol Key"', /Take the Gaol Key/.test(prompt()), prompt());
{ const g1 = ent('g1'); g1.f.x = g1.f.px = kp.x + 3; g1.f.z = g1.f.pz = kp.z + 3; A.Ents.engage(g1, 'test'); frames(2);
  ok('regression: with a foe engaged 5 m away the key prompt still shows', g1.mode === 'combat' && /Take the Gaol Key/.test(prompt()), prompt()); calm(); frames(2); }
P().invuln = true; tap('Space'); frames(3); ok('mid-jump (cannot act)', !P().canAct(), P().state); tap('KeyE'); frames(60); await sleep(20); frames(5);
ok('regression: E pressed mid-jump is honoured on landing (was silently dropped)', A.Inv.count('gaolkey') === 1, P().state);
ok('taken: removed from the world, never duplicated', !keyObj('gaolkey') && !S().drops.gaolkey && S().collected.key_gaolkey && A.Inv.count('gaolkey') === 1);
ok('card: GAOL KEY \u2014 opens the gaol door', /GAOL KEY/.test(w.document.querySelector('#advArea .t').textContent) && /gaol door/i.test(w.document.querySelector('#advArea .s').textContent));
ok('pickup flash shown', !!$('advKeyFlash'));
frames(35); ok('objective: "Gaol Key acquired: unlock the gaol door"', /Gaol Key acquired: unlock the gaol door/.test(objT()), objT());
ok('compass mark points at the door', JSON.stringify(A.Region.data.objectiveMarks[4]) === '[-53,-13]');
key('Escape', true); key('Escape', false); frames(3);
w.document.querySelector('#advMenu [data-t="Inventory"]').click(); const inv = w.document.querySelector('#advMenu .body').innerHTML;
ok('pause Inventory: Gaol Key with an icon and description', /Gaol Key/.test(inv) && /<svg/.test(inv) && /Opens the gaol door/.test(inv) && /greasy/.test(inv));
w.document.querySelector('#advMenu [data-t="Journey"]').click(); const jr = w.document.querySelector('#advMenu .body').innerHTML;
ok('pause menu: Objectives section with the current objective', /Objectives/.test(jr) && /unlock the gaol door/.test(jr));
key('Escape', true); key('Escape', false); frames(3);

// ---- 7) the door opens; death + reload keep everything consistent
tp(-53, -14.5, 0); ok('door prompt with the key', /Unlock with the Gaol Key/.test(prompt()), prompt()); await press('KeyE'); frames(5);
ok('gaol door opens; main -> 5 (next step)', S().opened.gaoldoor && !A.Region.gates.gaoldoor.seg.on && A.Quests.stage('main') === 5 && /Muster Field/.test(objT()), objT());
await die(); ok('after death: door still open, key still held, nothing on the ground', S().opened.gaoldoor && !A.Region.gates.gaoldoor.seg.on && A.Inv.count('gaolkey') === 1 && !Object.keys(A.Keys.list).length);
{ const s = ent('g3'); if (s) { await killWithE(s); frames(5); } ok('killing the respawned sergeant drops no second key', !keyObj('gaolkey') && A.Inv.count('gaolkey') === 1); }
await reload();
ok('reload keeps it: door open, Gaol Key in the inventory, no ground key, stage 5', S().opened.gaoldoor && !A.Region.gates.gaoldoor.seg.on && A.Inv.count('gaolkey') === 1 && !keyObj('gaolkey') && A.Quests.stage('main') === 5);

// ---- 8) the headsman's key chain
{ const o = ent('odran'); ok('Odran wears the Headsman\u2019s Key on his belt', !!(o && o.c._belt)); ok('stage 5 line says who holds the next key', /Odran Vale/.test(objS()), objS());
  tp(0, 40, 0); frames(5); A.startBoss(o); frames(2); o.f.x = o.f.px = 1.5; o.f.z = o.f.pz = 52; o.f.dead = true; o.f.hp = 0; o.f.setState('dead', 99); W().emit({ type: 'enemyDead', f: o.f.id }); frames(5); await sleep(20);
  const hk = keyObj('headkey'); ok('Odran\u2019s body drops the Headsman\u2019s Key (not auto-granted)', !!hk && A.Inv.count('headkey') === 0 && A.Quests.stage('main') === 7);
  frames(35); ok('objective: take the Headsman\u2019s Key', /Take the Headsman/.test(objT()), objT());
  await sleep(5700); frames(5); if (Game.state === 'dialogue') await dlgThrough();
  tp(1.5, 50.2, 0); ok('prompt "Take the Headsman\u2019s Key"', /Take the Headsman/.test(prompt()), prompt()); await press('KeyE'); frames(35);
  ok('Headsman\u2019s Key in the inventory; objective: open the Hollowwood Gate', A.Inv.count('headkey') === 1 && /Headsman\u2019s Key acquired: open the Hollowwood Gate/.test(objT()), objT()); }
await reload(); ok('reload: headkey held, no ground copy, gate still to open', A.Inv.count('headkey') === 1 && !keyObj('headkey') && !S().opened.hollowgate);
tp(0, 67.4, 0); ok('Hollowwood Gate prompt with the key', /Open the Hollowwood Gate/.test(prompt()), prompt());
// old-save safety: Odran felled, no key, no drop record -> the key is placed on the Block (never lost)
{ const d = JSON.parse(w.localStorage.getItem('veynhold_save')); delete d.inv.headkey; delete d.collected.key_headkey; delete d.collected.drop_odran; d.drops = {};
  const stor = { veynhold_save: JSON.stringify(d) }; H.dom.window.close(); H = mk({ file: FILE, storage: stor }); ({ w, G, Game, frames, key, tap, errors } = H); A = w.VEYN_ADV; frames(3); $('advContinue').click(); frames(8);
  ok('old save (Odran felled, key never given): the key is placed on the Block', !!A.Keys.list.headkey); }
ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
const fails = res.filter(r => r.startsWith('FAIL')); console.log(res.join('\n')); console.log((res.length - fails.length) + '/' + res.length + ' keyflow checks passed'); process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('CRASH', e && e.stack || e); process.exit(2); });
