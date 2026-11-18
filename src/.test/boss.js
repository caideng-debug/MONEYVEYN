// Chunk D: Odran Vale — cutscene (plays once, skippable, input restored, no damage), both phases, Sekiro finisher, field
// finisher, ash, reload state. Real key events in the jsdom page; core helpers only to break posture quickly.
// usage: node .test/boss.js            (paths are relative to this worktree)
const mk = require('./p1h.js'); const path = require('path');
const FILE = path.join(__dirname, '..', 'dist', 'index.html');
const res = []; const ok = (n, c, i) => { res.push((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? ' [' + i + ']' : '')); };
const save0 = { game: 'veynhold', schema: 1, created: 1, updated: 1, playTime: 600, deaths: 0, kills: 10, region: 'execution', lantern: 'stair', lit: ['grave', 'gaol', 'stair'],
  flags: { met_tamsin: true, combat_tutorial_seen: true, tut_deflect: true, tut_thrust: true, tut_sweep: true, tut_stealth: true }, quests: { main: { stage: 5, log: [5], t: 1 } }, inv: { draught: 3 }, weapons: ['wardblade'], equip: { weapon: 'wardblade' },
  upgrades: [], defeated: {}, opened: { gaoldoor: true }, collected: { sword: true }, lore: {}, zones: { pit: true, yard: true, gaol: true, muster: true, stair: true }, hints: { h_move: true, h_lantern: true, h_lock: true, draught: true }, chapter: 1, chapterDone: false };
const open = (storage, cut) => { const H = mk({ file: FILE, storage }); const A = H.w.VEYN_ADV; if (cut !== false) A.BossD.enabled = true; H.frames(3); H.w.document.getElementById('advContinue').click(); H.frames(5); return H; };
const stor = s => ({ veynhold_save: JSON.stringify(s), veynhold_v8: JSON.stringify({ v: 8, seenTutorial: true }) });
const walkIn = (H, maxF) => { const { G, Game, frames, key } = H, A = H.w.VEYN_ADV; G.Cam.yaw = 0; key('KeyW', true); let n = 0; while (!A.boss && n < (maxF || 600)) { frames(1); n++; } frames(2); key('KeyW', false); return n; };
const ent = (A, id) => A.Ents.list.find(e => e.def.id === id);
const breakAndE = (H, f, n) => { const { Game, frames, tap } = H, C = H.w.VEYN_CORE, p = Game.world.player; for (let k = 0; k < 3 && !f.dead; k++) { const m0 = f.marks; p.x = p.px = f.x; p.z = p.pz = f.z - 1.7; p.facing = 0; f.atk = null; if (f.state === 'transition') frames(160); C.addPosture(Game.world, f, 1e5); frames(3); tap('KeyE'); frames(n || 200); if (f.marks < m0 || f.dead) break; } };

// ---------------------------------------------------------------- 1) first entry: the cutscene plays, holds the sim, can't hurt you
{ const H = open(stor(save0)); const { w, G, Game, frames, key, tap, errors } = H, A = w.VEYN_ADV, BD = A.BossD, P = () => Game.world.player;
  const n = walkIn(H); const od = ent(A, 'odran');
  ok('walking onto the Block starts the boss (fog seals)', !!A.boss && A.Region.gates.bossfog.seg.on, n);
  ok('first encounter plays the cutscene (G.Intro held, letterbox, skip hint)', BD.Cut.active && G.Intro.active && w.document.getElementById('lbox').classList.contains('on') && w.document.getElementById('vhSkip').style.opacity === '1');
  const t0 = Game.world.time, hp0 = P().hp; const seen = new Set(); let maxSub = 0;
  // try to hurt the player during the cutscene: put Odran beside her mid-swing and mash attack keys
  frames(60 * 6); ok('Odran is staged by the Block, Wren walked up to it', Math.abs(od.f.z - 52.4) < 0.01 && Math.abs(P().z - 41.5) < 0.05, od.f.z.toFixed(2) + ' / ' + P().z.toFixed(2));
  od.f.x = P().x; od.f.z = P().z + 1.5; key('KeyW', true); for (let i = 0; i < 60 * 12; i++) { if (i % 20 === 0) { tap('KeyJ'); tap('KeyF'); tap('Space'); } const s = w.document.querySelector('#vhSub span').textContent; if (w.document.getElementById('vhSub').style.opacity === '1') seen.add(s); frames(1); } key('KeyW', false);
  ok('sim is held during the cutscene (no world time passes)', Game.world.time === t0, (Game.world.time - t0).toFixed(3));
  ok('no damage during the cutscene', P().hp === hp0 && !P().dead);
  ok('other keys (W, J, F, Space, clicks) do not skip it', BD.Cut.active);
  ok('Odran stays staged even when shoved mid-cutscene', Math.abs(od.f.z - 52.4) < 0.01);
  // let it run out naturally
  for (let i = 0; i < 60 * 34 && BD.Cut.active; i++) { const el = w.document.getElementById('vhSub'); if (el.style.opacity === '1') seen.add(w.document.querySelector('#vhSub span').textContent); frames(1); }
  ok('cutscene runs ~44 s and ends by itself', !BD.Cut.active && !G.Intro.active && BD.Cut.t >= BD.CUT_DUR - 0.05, BD.Cut.t.toFixed(1));
  ok('all 10 dialogue lines were subtitled', BD.LINES.every(L => seen.has(L[3])), seen.size);
  ok('letterbox off, name card shown, control returned', !w.document.getElementById('lbox').classList.contains('on') && w.document.getElementById('vhSub').style.opacity === '0');
  frames(40); ok('the sim runs again after the cutscene', Game.world.time > t0);
  { const z0 = P().z; G.Cam.yaw = 0; key('KeyW', true); frames(30); key('KeyW', false); ok('movement works straight after (input restored)', Math.abs(P().z - z0) > 0.5, (P().z - z0).toFixed(2)); }
  // die in the fight -> respawn at the stair lantern -> re-enter: no cutscene the second time
  const p = P(); p.hp = 1; od.f.x = p.x; od.f.z = p.z + 2; od.f.brain.update = () => {}; od.f.facing = Math.PI; w.VEYN_CORE.startAttack(Game.world, od.f, 'w_swing', { jitter: false }); frames(90); frames(340);
  ok('death in the fight respawns you at the Stair Lantern', !P().dead && Math.hypot(P().x + 0.6, P().z - 32.7) < 0.6 && !A.boss, P().x.toFixed(1) + ',' + P().z.toFixed(1));
  walkIn(H); ok('the cutscene plays once: re-entry starts the fight with no cutscene', !!A.boss && !BD.Cut.active && !G.Intro.active && BD.Cut.plays === 1);
  ok('no console errors (part 1)', errors.length === 0, errors[0]); var save1 = w.localStorage.getItem('veynhold_save'); H.dom.window.close(); }

// ---------------------------------------------------------------- 2) skip with Esc / with E; input cleared; Settings.intros respected
{ const H = open(stor(save0)); const { w, G, Game, frames, key, tap, errors } = H, A = w.VEYN_ADV, BD = A.BossD, P = () => Game.world.player;
  walkIn(H); frames(120); ok('second save: cutscene playing', BD.Cut.active);
  key('KeyD', true); w.VEYN_GAME.Input.pressed.KeyJ = true; frames(2);
  key('Escape', true); key('Escape', false); frames(1);
  const I = G.Input; ok('Esc skips the cutscene', !BD.Cut.active && !G.Intro.active && BD.Cut.skipped);
  ok('input cleared on skip (held keys, presses, player intent)', !I.keys.KeyD && !I.pressed.KeyJ && !P().intent.light && P().intent.mx === 0 && Game.state === 'playing');
  key('KeyD', false); frames(30); ok('skipping does not open the pause menu', Game.state === 'playing');
  ok('after a skip the fight is on (boss engaged, fog sealed)', !!A.boss && A.boss.e.mode === 'combat' && A.Region.gates.bossfog.seg.on);
  ok('no console errors (part 2)', errors.length === 0, errors[0]); H.dom.window.close(); }
{ const H = open(stor(save0)); const { w, G, Game, frames, key } = H, A = w.VEYN_ADV, BD = A.BossD;
  walkIn(H); frames(30); key('KeyE', true); key('KeyE', false); frames(2); ok('E skips the cutscene too', !BD.Cut.active && !G.Intro.active && BD.Cut.skipped && Game.state === 'playing'); H.dom.window.close(); }
{ const H = mk({ file: FILE, storage: Object.assign(stor(save0), { veynhold_v8: JSON.stringify({ v: 8, seenTutorial: true, intros: false }) }) }); const A = H.w.VEYN_ADV; A.BossD.enabled = true; H.frames(3); H.w.document.getElementById('advContinue').click(); H.frames(5);
  walkIn(H); ok('Settings.intros = off: no cutscene, the fight just starts', !!A.boss && !A.BossD.Cut.active && !H.G.Intro.active && H.G.Settings.intros === false); H.dom.window.close(); }
{ const H = open({ veynhold_save: save1, veynhold_v8: JSON.stringify({ v: 8, seenTutorial: true }) }); const A = H.w.VEYN_ADV;
  ok('reload after seeing it: spawn at the Stair Lantern, Odran at home, fog open', !!ent(A, 'odran') && !A.Region.gates.bossfog.seg.on && Math.hypot(H.Game.world.player.z - 32.7, H.Game.world.player.x + 0.6) < 0.6);
  walkIn(H); ok('reload: the cutscene does not play again', !!A.boss && !A.BossD.Cut.active); H.dom.window.close(); }

// ---------------------------------------------------------------- 3) both phases, the boss finisher, field finisher, ash, reload after the win
{ const s = JSON.parse(JSON.stringify(save0)); s.flags.intro_odran = true; const H = open(stor(s)); const { w, G, Game, frames, key, tap, errors } = H, A = w.VEYN_ADV, BD = A.BossD, P = () => Game.world.player;
  // INT6 retarget (as deathblow_seq for DB6): the deathblow clip lays the body down in joint space and keeps the rig level, so "down" reads the
  // torso's tilt from vertical as well as the rig's rotation
  const lieA = cc => { const q = new w.THREE.Quaternion(); cc.torso.getWorldQuaternion(q); const u = new w.THREE.Vector3(0, 1, 0).applyQuaternion(q);
    return Math.max(Math.abs(cc.rig.rotation.x), Math.abs(cc.rig.rotation.z), Math.acos(Math.max(-1, Math.min(1, u.y)))); };
  // field finisher first: a gaoler on the Muster Field, posture broken, E
  { const g = ent(A, 'm5'); P().x = P().px = g.f.x; P().z = P().pz = g.f.z - 1.7; frames(2); A.Ents.engage(g, 'struck'); frames(2); const c0 = BD.Fin.count; let fin = null;
    const tsSeen = []; const ts0 = G.Cine.timeScale; G.Cine.timeScale = function (dt) { const v = ts0.call(this, dt); if (BD.Fin.cur) tsSeen.push(v); return v; };
    let hsSeen = 0; BD.onPost = (F, st) => { if (!fin) fin = F; if (F.hs > 0 && (F.a.freeze > 0 || F.v.freeze > 0)) hsSeen++; }; breakAndE(H, g.f, 10); const F = BD.Fin.cur || BD.Fin.last;
    ok('field deathblow runs the stab-through finisher', BD.Fin.count === c0 + 1 && !!F && !F.bossFinal, F && F.kind);
    frames(170); G.Cine.timeScale = ts0; BD.onPost = null;
    ok('field finisher: impale + rip both fired, blade aimed through the spine', !!fin && fin.imp && fin.rip && !!fin.dir);
    ok('field finisher: core hit-stop during the impale, sim never slowed (INT5 Tier A: time scale stays 1 through the finisher)', hsSeen > 0 && tsSeen.length > 0 && tsSeen.every(v => v === 1), 'hit-stop frames ' + hsSeen + ', min scale ' + Math.min(...tsSeen));
    ok('field foe died', g.f.dead);
    frames(200); const c = Game.chars.get(g.f.id); ok('field foe falls on its side and stays on the floor (chunk G1: visible, no ash)', !!c && c.root.visible === true && BD.Col.list.some(d => d.c === c && d.landed) && lieA(c) > 1.2, lieA(c).toFixed(2)); }
  // the boss
  walkIn(H); const od = ent(A, 'odran'), f = od.f; ok('boss fight starts (intro already seen: no cutscene)', !!A.boss && !BD.Cut.active);
  breakAndE(H, f, 230); ok('Phase I deathblow -> Phase II (transition, then one mark left)', !f.dead && f.phase === 2 && f.marks === 1, f.phase + '/' + f.marks + ' ' + f.state);
  ok('the first (non-final) deathblow on Odran is a field-style finisher, not the finale', !!BD.Fin.last && !BD.Fin.last.bossFinal && BD.Fin.last.v === f);
  frames(160); ok('Phase II: he leaves the transition and fights', f.state !== 'transition' && !f.dead, f.state);
  const F0 = G.P1.Finale; let finSeen = null, camOk = true, walls = 0; const fu = F0.update; F0.update = function (dt) { if (this.active) { finSeen = finSeen || { dur: this.dur }; const cp = G.camera.position; if (!A.Region.camClear(f.x, f.z, cp.x, cp.z)) walls++; } return fu.call(this, dt); };
  breakAndE(H, f, 300); F0.update = fu; const BF = BD.Fin.last;
  ok('final deathblow plays the boss finisher (3-shot cut, 2.75 s finale: blueprint v3 §7 boss total)', !!finSeen && finSeen.dur === 2.75 && !!BF && BF.bossFinal && BF.kind === 'stab');
  // INT6 retarget: BF.L is the step-in solver's measured blade reach; DB6 drives both bodies from the clip (no step-in solver), so L is never measured there
  ok('boss finisher: impale (hit-stop) and rip-out fired', BF.imp && BF.rip && (BF.L > 0.5 || !!BF.db6), BF.db6 ? 'db6' : BF.L && BF.L.toFixed(2));
  ok('finisher camera never inside a wall', walls === 0, walls);
  // merged truth (chunk C): the Headsman's Key is not auto-granted; it drops as a real item at his body and is taken with E
  { const kd = (A.Save.data.drops || {}).headkey; ok('Odran dead, defeat saved, reward; the Headsman\u2019s Key lies at his body', f.dead && A.Save.data.defeated.odran && A.Inv.count('headkey') === 0 && A.Save.data.upgrades.includes('yoke') && !!kd && Math.hypot(kd.x - f.x, kd.z - f.z) < 0.05, JSON.stringify(kd) + ' f=' + f.x.toFixed(2) + ',' + f.z.toFixed(2)); }
  const oc = Game.chars.get(f.id); ok('he slumps to his knees (no flat fall) while he is dying', !!oc && Math.abs(oc.rig.rotation.x) < 1e-6 && oc.root.visible);
  frames(400); if (Game.state !== 'dialogue') { const c = BD.corpse; ok('a "Kneel by the headsman" prompt sits where he fell', !!c && Math.hypot(c.x - f.x, c.z - f.z) < 0.01); P().x = P().px = c.x; P().z = P().pz = c.z - 1.6; frames(3);
    const pr = () => w.document.getElementById('advPrompt').textContent;
    ok('beside the body the key comes first: "Take the Headsman\u2019s Key"', /Take the Headsman/.test(pr()), pr()); tap('KeyE'); frames(6);
    ok('E takes the key at the body (inventory, no ground copy)', A.Inv.count('headkey') === 1 && A.Keys.st('headkey') === 'held'); frames(3);
    ok('kneel prompt shown at the body', /Kneel by the headsman/.test(w.document.getElementById('advPrompt').textContent), w.document.getElementById('advPrompt').textContent); tap('KeyE'); frames(3); }
  if (Game.state === 'dialogue') { for (let i = 0; i < 12 && Game.state === 'dialogue'; i++) { tap('KeyE'); frames(4); } }
  ok('his last words play (story flag)', A.Save.data.flags.odran_spoke);
  frames(240); ok('after his last words the headsman falls and stays down (chunk G1: visible, no ash)', oc.root.visible === true && !!oc.root.parent && BD.Col.list.some(d => d.c === oc && d.landed) && lieA(oc) > 1.2, lieA(oc).toFixed(2));
  ok('fog gate open after the win', !A.Region.gates.bossfog.seg.on);
  ok('no console errors (part 3)', errors.length === 0, errors[0]);
  const snap = w.localStorage.getItem('veynhold_save'); H.dom.window.close();
  const H2 = open({ veynhold_save: snap, veynhold_v8: JSON.stringify({ v: 8, seenTutorial: true }) }); const A2 = H2.w.VEYN_ADV;
  ok('reload after the win: no Odran, fog open, key kept, no cutscene', !ent(A2, 'odran') && !A2.Region.gates.bossfog.seg.on && A2.Inv.count('headkey') === 1 && !A2.BossD.Cut.active);
  H2.G.Cam.yaw = 0; H2.key('KeyW', true); H2.frames(200); H2.key('KeyW', false); ok('reload: walking onto the Block starts nothing', !A2.boss && !A2.BossD.Cut.active);
  ok('no console errors (reload)', H2.errors.length === 0, H2.errors[0]); H2.dom.window.close(); }

console.log(res.join('\n')); const fails = res.filter(r => r.startsWith('FAIL')).length; console.log((res.length - fails) + '/' + res.length + ' boss checks passed');
process.exit(fails ? 1 : 0);
