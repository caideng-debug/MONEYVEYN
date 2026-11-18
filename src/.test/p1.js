// Phase 1 scripted playthrough (jsdom page, real key events for movement / interaction / menus; core helpers only to
// break an enemy's posture where a fight would otherwise take minutes — the deathblow itself is the real E key).
const mk = require('./p1h.js'); const sleep = ms => new Promise(r => setTimeout(r, ms));
const res = []; const ok = (n, c, i) => { res.push((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? ' [' + i + ']' : '')); };
(async () => {
let H = mk(), { w, G, Game, frames, key, tap, errors } = H; let A = w.VEYN_ADV, C = w.VEYN_CORE;
const W = () => Game.world, P = () => Game.world.player, S = () => A.Save.data;
const tp = (x, z, face) => { if (A.Ents) for (const e of A.Ents.list) if (e.mode === 'combat' && !e.def.boss && !tp.keep) { A.Ents.disengage(e); e.f.x = e.f.px = e.home.x; e.f.z = e.f.pz = e.home.z; } const p = P(); p.x = p.px = x; p.z = p.pz = z; p.vx = p.vz = 0; if (face !== undefined) { p.facing = face; G.Cam.yaw = face; } frames(2); };
const ent = id => A.Ents.list.find(e => e.def.id === id);
const press = async (code, n) => { tap(code); frames(n || 10); await sleep(15); };
const dlgThrough = async (pick) => { for (let i = 0; i < 30 && Game.state === 'dialogue'; i++) { const ch = w.document.querySelectorAll('#advDlg .ch button'); if (ch.length) await press('Digit' + Math.min(ch.length, (pick || 1)), 4); else await press('KeyE', 4); } };
const calm = () => { for (const e of A.Ents.list) if (e.mode === 'combat' && !e.def.boss) { A.Ents.disengage(e); e.f.x = e.f.px = e.home.x; e.f.z = e.f.pz = e.home.z; } frames(2); };
const killWithE = async (e, n) => { const f = e.f; for (let k = 0; k < 3 && !f.dead; k++) { const m0 = f.marks; tp(f.x, f.z - 1.6, 0); f.x = P().x; f.z = P().z + 1.6; f.atk = null; C.addPosture(W(), f, 1e5); frames(3); tap('KeyE'); frames(n || 160); await sleep(10); if (f.marks < m0) break; } };   // retried: the AI may still be mid-swing on a teleport

// ---------------------------------------------------------------- 1) fresh start
frames(3); ok('title shows New Journey (no save yet)', w.document.getElementById('advNew') && w.document.getElementById('advContinue').style.display === 'none');
w.document.getElementById('advNew').click(); frames(2); ok('prologue plays', Game.state === 'prologue');
key('Space', true); key('Space', false); await sleep(30); frames(5);
ok('any key skips the prologue into the world', Game.state === 'playing' && A.active && !!W(), Game.state);
ok('fresh save written with schema 1', JSON.parse(w.localStorage.getItem('veynhold_save') || '{}').schema === 1);
ok('spawn in the Corpse Pit', Math.abs(P().x) < 0.1 && Math.abs(P().z + 73) < 0.1);
ok('main quest starts', A.Quests.stage('main') === 0 && /digging/.test(w.document.querySelector('#advObj span').textContent));
ok('13 field / named foes spawned into one core World', A.Ents.list.length === 13 && W().over === 'adv', A.Ents.list.length);
ok('core arena circle widened only in world mode', C.CONFIG.arena.radius > 1000 && C.CONFIG.arena.pillars.length === 0);

// ---------------------------------------------------------------- 2) movement + collision
{ const z0 = P().z; key('KeyW', true); frames(60); key('KeyW', false); frames(20); ok('W walks the Wanderer forward (north)', P().z > z0 + 3, (P().z - z0).toFixed(2));
  tp(-6, -70, -Math.PI / 2); key('KeyW', true); frames(120); key('KeyW', false); frames(5); ok('pit wall stops movement (no walking through walls)', P().x > -9 + 0.4 && P().x < -7, P().x.toFixed(2));
  tp(0, -73, 0); tap('KeyJ'); frames(5); ok('unarmed: attacks do nothing before the sword is recovered', P().state !== 'attack'); }

// ---------------------------------------------------------------- 3) NPC dialogue (Tamsin)
tp(-3.6, -67, -Math.PI / 2); frames(3); ok('interaction prompt appears near Tamsin', /Talk to Tamsin/.test(w.document.getElementById('advPrompt').textContent), w.document.getElementById('advPrompt').textContent);
await press('KeyE'); ok('E opens dialogue', Game.state === 'dialogue' && /breathing/.test(w.document.querySelector('#advDlg .txt').textContent));
await dlgThrough(3); ok('dialogue completes: Names for the Dead started, main advances', Game.state === 'playing' && A.Quests.stage('names') === 0 && A.Quests.stage('main') === 1 && S().flags.met_tamsin, A.Quests.stage('main'));
await press('KeyE'); ok('second talk uses the follow-up conversation', Game.state === 'dialogue' && /Still breathing/.test(w.document.querySelector('#advDlg .txt').textContent)); await dlgThrough(4);

// ---------------------------------------------------------------- 4) sword pickup + lantern
tp(4.4, -71.6, Math.PI * 0.8); frames(3); await press('KeyE'); ok('sword pickup: Ward\u2019s Blade equipped, main -> 2', A.Inv.count('wardblade') === 1 && S().equip.weapon === 'wardblade' && A.Quests.stage('main') === 2);
tap('KeyJ'); frames(4); ok('armed: J starts a light attack', P().state === 'attack'); frames(60);
tp(0, -59.4, 0); frames(3); ok('lantern prompt', /Kindle/.test(w.document.getElementById('advPrompt').textContent));
await press('KeyE'); await sleep(40); frames(10); ok('kindling lights the lantern, rests there, main -> 3', S().lit.includes('grave') && S().lantern === 'grave' && A.Quests.stage('main') === 3 && Game.state === 'playing');

// ---------------------------------------------------------------- 5) unseen deathblow (tutorial foe y1, facing away)
{ const e = ent('y1'); tp(e.f.x, e.f.z - 1.9, 0); frames(2); ok('unseen-deathblow prompt behind an unaware gaoler', /unseen/.test(w.document.getElementById('advPrompt').textContent));
  tap('KeyE'); frames(170); await sleep(10); ok('E performs the unseen deathblow (core deathblow path)', e.f.dead && S().kills === 1, e.f.state); }

// ---------------------------------------------------------------- 6) perception + engagement + leash
{ const e = ent('y2'); tp(e.f.x, e.f.z - 5, 0); e.f.facing = Math.PI; e.f.aiFace = Math.PI; frames(80); ok('patrolling gaoler spots you in front and engages', e.mode === 'combat' && !!e.f.brain, e.mode);
  ok('music/HUD only track engaged foes', Game.engaged(W()).includes(e.f) && Game.engaged(W()).length <= 3);
  tp.keep = true; tp(-45, -34, 0); tp.keep = false; frames(300); ok('leashed foe gives up and walks home when you are far', e.mode !== 'combat', e.mode);
  await killWithE(e); ok('posture break + E deathblow kills a field foe', e.f.dead, e.f.state + ' ' + e.mode + ' p=' + P().state + ' d=' + Math.hypot(P().x - e.f.x, P().z - e.f.z).toFixed(2)); }

// ---------------------------------------------------------------- 7) Gaol: zone, sergeant + key, name-tag, door
tp(-24, -34, -Math.PI / 2); frames(5); ok('entering the Gaol updates the objective (main -> 4)', A.Quests.stage('main') === 4 && S().zones.gaol);
tp(-53, -14.5, 0); frames(3); await press('KeyE'); ok('locked gaol door explains itself (no key yet)', S().opened.gaoldoor !== true && W().player.z < -12.4);
{ const e = ent('g3'); await killWithE(e, 200); await sleep(20); const k = S().drops && S().drops.gaolkey; ok('Gaol Sergeant drops the Gaol Key on the ground (chunk C: a real item)', !!k && A.Inv.count('gaolkey') === 0);
  tp(k.x, k.z - 1.5, 0); frames(3); await press('KeyE'); ok('E takes the Gaol Key (main stays 4 until the door opens)', A.Inv.count('gaolkey') === 1 && A.Quests.stage('main') === 4); }
tp(-40, -40.6, 0); frames(3); await press('KeyE'); ok('name-tag in the broken cell; quest counts it (1/3)', A.Inv.count('name_pell') === 1 && A.Quests.stage('names') === 1);
tp(-46.8, -23.6, 0); frames(3); await press('KeyE', 5); ok('ledger opens the reader', Game.state === 'reading' && /Tally/.test(w.document.querySelector('#advRead h3').textContent)); await press('KeyE'); ok('reader closes on E', Game.state === 'playing' && S().lore.tally);
tp(-53, -14.5, 0); frames(3); ok('door prompt changes with the key', /Unlock/.test(w.document.getElementById('advPrompt').textContent)); await press('KeyE');
ok('Gaol door opens (collider off)', S().opened.gaoldoor && !A.Region.gates.gaoldoor.seg.on);
{ const z0 = P().z; key('KeyW', true); frames(100); key('KeyW', false); ok('walk through the open door into the Muster Field', P().z > -9 && A.Region.zoneAt(P().x, P().z).id === 'muster', P().z.toFixed(2)); }
await sleep(10); frames(4);

// ---------------------------------------------------------------- 8) shortcut lever, reachability, no softlocks
{ const R = A.Region; const sp = { x: 0, z: -60 };
  ok('before the lever: muster unreachable from the yard except through the gaol', R.reachable(sp.x, sp.z, 0, 5));
  tp(4.6, -9.0, Math.PI); frames(3); await press('KeyE'); await sleep(600); frames(150); await sleep(10);
  ok('lever raises the yard portcullis (shortcut loop to the first lantern)', S().opened.yardgate && !R.gates.yardgate.seg.on);
  R.gates.gaoldoor.seg.on = true; R.buildNav(); ok('with the gaol door shut, the shortcut alone connects yard and field', R.reachable(0, -60, 0, 20)); R.gates.gaoldoor.seg.on = false; R.buildNav();
  const near = (x, z) => { for (let r = 0; r <= 1.6; r += 0.4) for (let a = 0; a < 6.28; a += 0.5) if (R.reachable(0, -73, x + Math.sin(a) * r, z + Math.cos(a) * r)) return true; return false; };
  const spots = { sword: [5.2, -72.6], tamsin: [-5.2, -67], lantern1: [0, -57.5], sergeant: [-43, -25.5], tag1: [-40, -41.4], gaoldoor: [-53, -13], lever: [4.6, -10.2], cage: [26, 22], roll: [-24, 1.5], stair: [2.2, 33], block: [0, 46], hollowgate: [0, 68.5], ossgate_far: [44, -11] };
  const bad = Object.keys(spots).filter(k => !near(spots[k][0], spots[k][1])); ok('every quest interaction point is reachable on foot from the pit (nav grid)', bad.length === 0, bad.join(',')); }

// ---------------------------------------------------------------- 9) vault the rubble into the Ossuary (real sprint + jump input)
tp(20.0, -28, Math.PI / 2); frames(2);   // camera yaw +pi/2 faces +x
{ key('ShiftLeft', true); key('KeyW', true); frames(18); tap('Space'); frames(40);   // repair: Space = jump key('KeyW', false); key('ShiftLeft', false); frames(10);
  ok('sprint + jump vaults the low rubble (secret route)', P().x > 23, P().x.toFixed(2)); }
{ key('ShiftLeft', true); tp(21, -28, Math.PI / 2); key('KeyW', true); frames(60); key('KeyW', false); key('ShiftLeft', false); frames(5); ok('walking into the rubble without jumping is blocked', P().x < 22, P().x.toFixed(2)); }
tp(30, -28, Math.PI / 2); key('KeyW', true); frames(40); key('KeyW', false); frames(5); ok('Ossuary discovered (secret zone card)', S().zones.oss);
// mini-boss: Brother Sallow
{ const e = ent('sallow'); for (const o of ['o1', 'o2']) { const x = ent(o); if (x && !x.f.dead) await killWithE(x); }
  tp(e.f.x - 7, e.f.z, Math.PI / 2); frames(10); ok('approaching Sallow starts the mini-boss (name card, engaged)', A.boss && A.boss.e === e && e.mode === 'combat');
  await killWithE(e, 200); ok('Sallow defeated and remembered', S().defeated.sallow && !A.boss);
  tp(53.5, -26.4, Math.PI); frames(3); await press('KeyE'); ok('altar grants the Penitent\u2019s Tithe upgrade', S().upgrades.includes('tithe'));
  tp(50.2, -39, Math.PI); frames(3); await press('KeyE'); ok('second name-tag (2/3)', A.Quests.stage('names') === 2);
  tp(44, -15.2, 0); frames(3); await press('KeyE'); ok('iron gate opens from the Ossuary side (second shortcut)', S().opened.ossgate); }

// ---------------------------------------------------------------- 10) Muster Field: brute + cage key, pen vault, Ilsabet
{ const e = ent('m1'); await killWithE(e, 200); await sleep(20); const k = S().drops && S().drops.cagekey; if (k) { tp(k.x, k.z - 1.5, 0); frames(3); await press('KeyE'); } ok('Chain Gaoler drops the Gibbet Key (taken with E)', A.Inv.count('cagekey') === 1); }
tp(26, 19.6, 0); frames(3); await press('KeyE'); ok('Ilsabet: dialogue with the key offers to open the cage', Game.state === 'dialogue'); await dlgThrough(1); await sleep(10); frames(5);
ok('freeing Ilsabet: flag, quest complete, keepsake, cage key used', S().flags.crane_freed && A.Quests.stage('crane') === 2 && A.Inv.count('feather') === 1 && !A.Inv.count('cagekey'));
// chunk G3: freeing her plays the Cage scene (headless runs it as skipped), then she walks visibly to the shadow under the Headsman's Stair
{ const Wk = A.SceneWalk, hold = A.SceneHold; const hint = (w.document.getElementById('advHint') || {}).textContent || '';
  ok('freed Ilsabet does not vanish: she walks off (visible, not faded), no longer talkable', Wk.on && !!hold.c && !!hold.c.root.parent && !hold.c.fadeK && !A.npcs.ilsabet);
  ok('the cage door stands open', Math.abs(A.Region.cage.door.rotation.y - 2.3) < 0.01);
  ok('a hint says where she is going (the Stair)', /Stair/.test(hint), hint);
  const reload = w.localStorage.getItem('veynhold_save');
  { const Hr = mk({ storage: { veynhold_save: reload } }); const Ar = Hr.w.VEYN_ADV; Hr.frames(3); Hr.w.document.getElementById('advContinue').click(); Hr.frames(10);
    ok('reload mid-walk: Ilsabet waits at the Stair (not in the cage, not gone)', Hr.Game.state === 'playing' && Ar.Save.data.flags.crane_freed && !Ar.npcs.ilsabet && !!Ar.npcs.ilsabet_wait && Hr.errors.length === 0, Hr.errors[0]); Hr.dom.window.close(); }
  frames(60 * 20); ok('after ~15 s she stands at the foot of the Stair (ilsabet_wait)', !Wk.on && !!A.npcs.ilsabet_wait && S().flags.crane_waiting && Math.hypot(A.npcs.ilsabet_wait.f.x - 7.2, A.npcs.ilsabet_wait.f.z - 26.2) < 0.05); }
tp(44, 24.6, 0); frames(3); await press('KeyE'); ok('third name-tag in the wagon pen (3/3)', A.Quests.stage('names') === 3);

// ---------------------------------------------------------------- 11) draught + death / respawn
{ const p = P(); p.hp = 40; const n0 = S().inv.draught; tap('KeyR'); frames(75); ok('R drinks a Lantern Draught (+40%, one charge)', p.hp > 75 && S().inv.draught === n0 - 1, p.hp.toFixed(0) + ' ' + S().inv.draught); }
{ const e = ent('m5'); const p = P(); tp(e.f.x, e.f.z - 1.5, 0); p.hp = 1; A.Ents.engage(e); e.f.brain = null; e.f.facing = Math.PI; C.startAttack(W(), e.f, 'd_over', { jitter: false }); frames(80);
  ok('death: the earth refuses you (death card)', !!A.dying && P().dead, P().state); const deaths = S().deaths;
  frames(330); await sleep(10); frames(5); ok('respawn at the last lantern, foes reset, draughts refilled', !P().dead && Math.abs(P().z - (-57.5 - 1.7)) < 0.5 && ent('y2') && !ent('y2').f.dead && S().inv.draught === A.Inv.draughtMax() && deaths === 1, P().z.toFixed(1)); }

// ---------------------------------------------------------------- 12) return the names
tp(-3.6, -67, -Math.PI / 2); frames(3); await press('KeyE'); await dlgThrough(1); await sleep(10); frames(5);
ok('Tamsin receives the three names: Ember Vessel (+1 Draught)', A.Quests.stage('names') === 4 && S().upgrades.includes('vessel') && A.Inv.draughtMax() === 4 && !A.Inv.count('name_jory'));

// ---------------------------------------------------------------- 13) pause menu + settings
await press('Escape'); ok('Esc opens the pause menu (sim paused)', Game.state === 'paused' && w.document.getElementById('advMenu').style.display === 'block');
{ let allTabs = true; for (const t of ['Journey', 'Inventory', 'Quests', 'Lore', 'Map', 'Settings', 'Controls']) { w.document.querySelector('#advMenu [data-t="' + t + '"]').click(); if (!w.document.querySelector('#advMenu .body').innerHTML.length) allTabs = false; } ok('every menu tab renders (Journey/Inventory/Quests/Lore/Map/Settings/Controls)', allTabs);
  w.document.querySelector('#advMenu [data-t="Settings"]').click(); const q0 = G.Settings.quality; w.document.getElementById('setQ').click(); ok('quality toggles from the menu', G.Settings.quality !== q0); G.Settings.quality = q0; G.applyQuality();
  const m = w.document.getElementById('setMus'); m.value = 40; m.dispatchEvent(new w.Event('input')); ok('music volume setting persists', JSON.parse(w.localStorage.getItem('veynhold_v8')).musicVol === 0.4);
  w.document.getElementById('setInv').click(); ok('invert Y toggle', G.Settings.invertY === true); w.document.getElementById('setInv').click();
  w.document.querySelector('#advMenu [data-t="Quests"]').click(); ok('quest log lists main + both side quests', (w.document.querySelector('#advMenu .body').innerHTML.match(/<h4>/g) || []).length === 3); }
await press('Escape'); ok('Esc resumes', Game.state === 'playing');

// ---------------------------------------------------------------- 14) boss: arena trigger, retry, phase II, reward
tp(0.6, 33.4, 0); frames(3); await press('KeyE'); await sleep(30); frames(5); ok('stair lantern kindled (checkpoint before the boss)', S().lantern === 'stair');
{ key('KeyW', true); frames(110); key('KeyW', false); frames(5); const b = ent('odran');
  ok('entering the Block starts the boss and seals the fog gate', A.boss && A.boss.e === b && A.Region.gates.bossfog.seg.on && A.Quests.stage('main') === 6);
  const p = P(); p.hp = 1; b.f.x = p.x; b.f.z = p.z + 2; b.f.brain.update = () => {}; b.f.facing = Math.PI; C.startAttack(W(), b.f, 'w_swing', { jitter: false }); frames(90); frames(340); await sleep(10); frames(5);
  const b2 = ent('odran'); ok('boss retry: respawn at the stair lantern, boss reset to full, gate open again', !P().dead && b2 && b2 !== b && b2.f.hp === b2.f.maxHp && !A.boss && !A.Region.gates.bossfog.seg.on); }
{ key('KeyW', true); frames(110); key('KeyW', false); frames(5); const b = ent('odran'); ok('boss restarts on re-entry', A.boss && A.boss.e === b);
  await killWithE(b, 260); ok('first deathblow -> Phase II (2 marks)', !b.f.dead && b.f.phase === 2 && b.f.marks === 1, b.f.phase + ' ' + b.f.marks);
  // FIX B: spy on the finisher cinematic + record field foes' local clocks while it plays
  const F = G.P1.Finale, st0 = F.start, up0 = F.update; let fin = null;
  F.start = function (a, v) { const field = W().fighters.filter(x => !x.isPlayer && x !== v && !x.dead); fin = { v, field, lt0: field.map(x => x.lt), lt1: null }; return st0.apply(this, arguments); };
  F.update = function (dt) { const was = this.active; up0.call(this, dt); if (fin && was && !this.active && !fin.lt1) fin.lt1 = fin.field.map(x => x.lt); };
  frames(120); await killWithE(b, 260); await sleep(20); frames(10); F.start = st0; F.update = up0;
  ok('world boss final deathblow plays the finisher cinematic while field foes live elsewhere', !!fin && fin.v === b.f && fin.field.length > 0, fin ? fin.field.length : 'no finale');
  ok('field foes are frozen for the whole finisher (no local time passes)', !!(fin && fin.lt1) && fin.lt1.every((t, i) => t === fin.lt0[i]) && !A.cineHeld, fin && fin.lt1 ? fin.lt1.map((t, i) => (t - fin.lt0[i]).toFixed(2)).join(',') : 'n/a');
  ok('second deathblow fells the Iron Warden; defeat saved', b.f.dead && S().defeated.odran);
  ok('boss reward: Warden\u2019s Yoke (+20% posture) and the Headsman\u2019s Key', S().upgrades.includes('yoke') && P().postureMax === 120 && !!(S().drops && S().drops.headkey));
  ok('fog gate opens after the win; main -> 7', !A.Region.gates.bossfog.seg.on && A.Quests.stage('main') === 7); }
{ const k = S().drops && S().drops.headkey; if (k) { tp(k.x, k.z - 1.5, 0); frames(3); await press('KeyE'); } ok('E takes the Headsman\u2019s Key from Odran\u2019s body', A.Inv.count('headkey') === 1 && !S().drops.headkey); }
frames(400); await sleep(20); if (Game.state === 'dialogue') await dlgThrough(1); else { tp(0, 52.6, 0); frames(3); await press('KeyE'); await dlgThrough(1); }
ok('the headsman\u2019s last words (dialogue) set the story flag', S().flags.odran_spoke);
tp(0, 47, 0); frames(70); frames(60 * 25);   // chunk G3: on the Block with the key + his last words -> the Block scene (skipped headless) -> her walk to the gate
ok('Ilsabet waits at the Hollowwood gate after the boss (freed)', !!A.npcs.ilsabet_gate && !A.npcs.ilsabet && !A.npcs.ilsabet_wait && S().flags.crane_gate);

// ---------------------------------------------------------------- 15) save / load round-trip
{ const snap = w.localStorage.getItem('veynhold_save'); const d = JSON.parse(snap);
  ok('save holds world progress (flags, quests, upgrades, gates, lanterns)', d.defeated.odran && d.opened.yardgate && d.upgrades.length === 3 && d.lit.includes('grave') && d.lit.includes('stair') && d.quests.crane.stage === 2);
  const stor = { veynhold_save: snap, veynhold_v8: w.localStorage.getItem('veynhold_v8') }; H.dom.window.close();
  H = mk({ storage: stor }); ({ w, G, Game, frames, key, tap, errors } = H); A = w.VEYN_ADV; C = w.VEYN_CORE; frames(3);
  ok('title offers Continue for an existing save', w.document.getElementById('advContinue').style.display === 'block' && /min/.test(w.document.getElementById('advContSub').textContent));
  w.document.getElementById('advContinue').click(); frames(5);
  ok('Continue restores the world: stair-lantern spawn (-0.6, 32.7) on the landing, opened gates, defeated boss absent, upgrades applied', Game.state === 'playing' && Math.hypot(P().x - (-0.6), P().z - 32.7) < 0.5 && !A.Region.gates.yardgate.seg.on && !ent('odran') && P().postureMax === 120); }

// ---------------------------------------------------------------- 16) chapter end
tp(0, 67.4, 0); frames(3); await press('KeyE'); frames(10); await sleep(2800); frames(5);
ok('the Hollowwood Gate opens with the key and ends Chapter I (to be continued, saved)', Game.state === 'ended' && S().chapterDone && A.Quests.stage('main') === 8 && JSON.parse(w.localStorage.getItem('veynhold_save')).chapterDone);
w.document.getElementById('advEndStay').click(); frames(3); ok('can return to the Grounds after the ending', Game.state === 'playing');
tp(0, 71.5, 0); frames(3); ok('the road beyond is sealed for Chapter II (no softlock, explains itself)', /Hollowwood road/.test(w.document.getElementById('advPrompt').textContent));

// ---------------------------------------------------------------- 17) resize + quit
w.innerWidth = 900; w.innerHeight = 600; w.dispatchEvent(new w.Event('resize')); frames(5); ok('resize keeps running (camera aspect follows)', Math.abs(G.camera.aspect - 1.5) < 0.01);
await press('Escape'); w.document.querySelector('#advMenu [data-a="quit"]').click(); frames(5);
ok('save & quit returns to the title, arena restored', Game.state === 'title' && !A.active && C.CONFIG.arena.radius === 16.5 && C.CONFIG.arena.pillars.length === 6);
w.document.querySelector('[data-enc="duelist"]').click(); frames(30); ok('trials still work after world mode (arena fight starts)', Game.state === 'playing' && Game.world.enemies().length === 1); Game.quit();
const errs1 = errors.slice();

// ---------------------------------------------------------------- 18) corrupt / outdated / newer saves
const good = w.localStorage.getItem('veynhold_save');
{ const H2 = mk({ storage: { veynhold_save: '{"game":"veynhold","schema":1,"fla', veynhold_save_bak: good } }); const A2 = H2.w.VEYN_ADV; H2.frames(3);
  H2.w.document.getElementById('advContinue').click(); H2.frames(5); ok('corrupt main save -> restored from the backup slot', H2.Game.state === 'playing' && A2.Save.problem === 'restored' && !!H2.w.localStorage.getItem('veynhold_save_corrupt')); H2.dom.window.close(); }
{ const H3 = mk({ storage: { veynhold_save: 'not json at all', veynhold_save_bak: '%%%' } }); const A3 = H3.w.VEYN_ADV; H3.frames(3); H3.w.document.getElementById('advContinue').click(); H3.frames(3);
  ok('corrupt main + backup -> reset prompt (never a blank page)', H3.w.document.getElementById('advSaveMsg').classList.contains('show') && H3.Game.state !== 'playing');
  H3.w.document.getElementById('advSaveNew').click(); H3.frames(2); if (A3.prologueEnd) A3.prologueEnd(); await sleep(20); H3.frames(5); ok('reset prompt starts a fresh journey', H3.Game.state === 'playing' && A3.Save.data.deaths === 0); ok('no errors in the corrupt-save page', H3.errors.length === 0, H3.errors[0]); H3.dom.window.close(); }
{ const old = JSON.stringify({ v: 0, lanternId: 'grave', items: { draught: 2, gaolkey: 1 }, flags: { met_tamsin: true }, quests: { main: { stage: 4, log: [4] } }, defeated: {}, opened: {}, collected: {} });
  const H4 = mk({ storage: { veynhold_save: old } }); const A4 = H4.w.VEYN_ADV; H4.frames(3); H4.w.document.getElementById('advContinue').click(); H4.frames(5);
  ok('outdated (schema 0) save migrates to schema 1 and loads', H4.Game.state === 'playing' && A4.Save.data.schema === 1 && A4.Inv.count('gaolkey') === 1 && A4.Save.data.lantern === 'grave' && A4.Save.data.migratedFrom === 0); H4.dom.window.close(); }
{ const H5 = mk({ storage: { veynhold_save: JSON.stringify({ game: 'veynhold', schema: 99 }) } }); H5.frames(3); H5.w.document.getElementById('advContinue').click(); H5.frames(3);
  ok('save from a newer version is refused safely (prompt, not overwritten)', H5.w.document.getElementById('advSaveMsg').classList.contains('show') && JSON.parse(H5.w.localStorage.getItem('veynhold_save')).schema === 99); H5.dom.window.close(); }
{ const H6 = mk({ storage: { veynhold_v8: JSON.stringify({ v: 8, quality: 'low', volume: 0.3, seenTutorial: true, best: {} }) } }); H6.frames(3); H6.w.document.getElementById('advNew').click(); H6.frames(2); if (H6.w.VEYN_ADV.prologueEnd) H6.w.VEYN_ADV.prologueEnd(); await sleep(20); H6.frames(3);
  ok('v8 settings carry over (quality/volume) and are noted in the new save', H6.G.Settings.quality === 'low' && H6.G.Settings.volume === 0.3 && H6.w.VEYN_ADV.Save.data.importedFrom === 'veynhold_v8' && H6.w.VEYN_ADV.Save.data.flags.combat_tutorial_seen === true); H6.dom.window.close(); }

ok('no console errors during the whole playthrough', errs1.length === 0, errs1[0]);
console.log(res.join('\n')); const pass = res.filter(r => r.startsWith('PASS')).length; console.log(pass + '/' + res.length + ' p1 checks passed'); process.exit(0);
})().catch(e => { console.log(res.join('\n')); console.log('CRASH', e && e.stack); process.exit(1); });
