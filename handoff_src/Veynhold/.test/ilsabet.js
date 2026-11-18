// Chunk G3: Ilsabet's two dialogue cutscenes. jsdom page (paths relative to this worktree), real key events for the dialogue,
// the skip and the deathblow; core helpers only to break Odran's posture quickly.
// Covers: free her -> the Cage scene plays (door swings, lines, sim held) -> skip (Esc / E) -> visible walk to the Stair spot
// (never through a collider) -> save / reload keeps her there -> Odran beaten, last words, key -> the Block scene -> she ends at the gate.
// usage: node .test/ilsabet.js
const mk = require('./p1h.js'); const path = require('path');
const FILE = path.join(__dirname, '..', 'dist', 'index.html');
const res = []; const ok = (n, c, i) => { res.push((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? ' [' + i + ']' : '')); };
const save0 = { game: 'veynhold', schema: 1, created: 1, updated: 1, playTime: 600, deaths: 0, kills: 10, region: 'execution', lantern: 'stair', lit: ['grave', 'gaol', 'stair'],
  flags: { met_tamsin: true, met_ilsabet: true, combat_tutorial_seen: true, tut_deflect: true, tut_thrust: true, tut_sweep: true, tut_stealth: true, intro_odran: true }, quests: { main: { stage: 5, log: [5], t: 1 }, crane: { stage: 1, log: [0, 1], t: 1 } },
  inv: { draught: 3, cagekey: 1 }, weapons: ['wardblade'], equip: { weapon: 'wardblade' }, upgrades: [], defeated: { m1: true }, opened: { gaoldoor: true, yardgate: true }, collected: { sword: true, key_cagekey: true }, lore: {},
  zones: { pit: true, yard: true, gaol: true, muster: true, stair: true }, hints: { h_move: true, h_lantern: true, h_lock: true, draught: true }, chapter: 1, chapterDone: false };
const stor = s => ({ veynhold_save: typeof s === 'string' ? s : JSON.stringify(s), veynhold_v8: JSON.stringify({ v: 8, seenTutorial: true }) });
const open = (storage, scenes) => { const H = mk({ file: FILE, storage }); const A = H.w.VEYN_ADV; if (scenes !== false) A.Scenes.enabled = true; H.frames(3); H.w.document.getElementById('advContinue').click(); H.frames(5); return H; };
const ent = (A, id) => A.Ents.list.find(e => e.def.id === id);
const calm = A => { for (const e of A.Ents.list) if (e.mode === 'combat' && !e.def.boss) A.Ents.disengage(e); for (const e of A.Ents.list) if (!e.def.boss && !e.f.dead) { e.f.brain && (e.f.brain.update = () => {}); } };
const place = (H, x, z, face) => { const p = H.Game.world.player; p.x = p.px = x; p.z = p.pz = z; p.vx = p.vz = 0; p.facing = p.pfacing = face || 0; H.G.Cam.yaw = face || 0; };
const sub = w => w.document.getElementById('vhSub').style.opacity === '1' ? w.document.querySelector('#vhSub span').textContent : null;
// collider check for an NPC body (r 0.45) at (x, z): walls / gates / rails / ledges and collider circles (NPC slots ignored)
const hits = (A, x, z, r, skipCage) => { const R = A.Region, out = []; for (const s of R.segs) { if (!s.on && !s.gate) continue; const ex = s.bx - s.ax, ez = s.bz - s.az, L2 = ex * ex + ez * ez || 1e-6, t = Math.max(0, Math.min(1, ((x - s.ax) * ex + (z - s.az) * ez) / L2));
    if (Math.hypot(x - s.ax - ex * t, z - s.az - ez * t) < s.t + r - 0.02) out.push('seg ' + s.ax.toFixed(1) + ',' + s.az.toFixed(1)); }
  for (const c of R.circles) { if (c.npc || c.deco) continue; if (skipCage && Math.hypot(c.x - 26, c.z - 22) < 0.01) continue; if (Math.hypot(x - c.x, z - c.z) < c.r + r - 0.02) out.push('circle ' + c.x.toFixed(1) + ',' + c.z.toFixed(1) + ' r' + c.r); } return out; };

let saveWaiting = null, saveMidWalk = null;

// ---------------------------------------------------------------- 1) free her: the Cage scene plays in full, then the walk to the Stair
{ const H = open(stor(save0)); const { w, G, Game, frames, key, tap, errors } = H, A = w.VEYN_ADV, SC = A.Scenes, P = () => Game.world.player, S = () => A.Save.data; calm(A);
  ok('the wait spot passes the region placement check (A.checkPoints)', !(A.Region.pointIssues || []).some(s => /ilsabet/.test(s)), (A.Region.pointIssues || []).join('; '));
  { const pts = SC.FREE_PATH; let bad = []; for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]); for (let s = 0; s <= L; s += 0.2) { const x = a[0] + (b[0] - a[0]) * s / L, z = a[1] + (b[1] - a[1]) * s / L; const h = hits(A, x, z, 0.45, true); if (h.length) bad.push(x.toFixed(1) + ',' + z.toFixed(1) + ' ' + h[0]); } }
    ok('the walk from the cage to the Stair (path) is clear of every collider', bad.length === 0, bad.slice(0, 3).join(' | ')); }
  const door = A.Region.cage && A.Region.cage.door; ok('the cage has a hinged door (closed at first)', !!door && Math.abs(door.rotation.y) < 1e-6);
  place(H, 23.9, 22.3, Math.PI / 2); frames(3); ok('"Talk to Ilsabet" by the cage', /Talk to Ilsabet/.test(w.document.getElementById('advPrompt').textContent), w.document.getElementById('advPrompt').textContent);
  tap('KeyE'); frames(3); ok('dialogue with the key offers "Unlock the cage."', Game.state === 'dialogue' && /Unlock the cage/.test(w.document.querySelector('#advDlg .ch').textContent));
  tap('Digit1'); frames(4);
  ok('choosing it starts the Cage scene (letterbox, G.Intro hold, skip hint)', SC.active && SC.lastId === 'ilsabet_free' && G.Intro.active && w.document.getElementById('lbox').classList.contains('on') && w.document.getElementById('vhSkip').style.opacity === '1' && Game.state === 'playing');
  ok('nothing is given before the scene ends', !S().flags.crane_freed && A.Inv.count('cagekey') === 1 && !A.Inv.count('feather'));
  const t0 = Game.world.time, hp0 = P().hp, seen = new Set(); let doorMid = null, outAt = null, wrenDist = 9;
  key('KeyW', true); for (let i = 0; i < 60 * 25 && SC.active; i++) { if (i % 30 === 0) { tap('KeyJ'); tap('Space'); } const s = sub(w); if (s) seen.add(s); frames(1);
    const f = A.SceneHold.f; if (SC.t > 2.0 && doorMid === null) doorMid = door.rotation.y; if (f && outAt === null && f.x < 25.0) outAt = SC.t; if (f && SC.t > 4.5) wrenDist = Math.min(wrenDist, Math.hypot(f.x - P().x, f.z - P().z)); }
  key('KeyW', false);
  ok('the door visibly swings open during the scene (mid-swing at 2 s, open after)', doorMid > 0.2 && doorMid < 2.25 && Math.abs(door.rotation.y - 2.3) < 0.01, doorMid && doorMid.toFixed(2));
  ok('she steps out through the doorway (not the bars) around 3 s', outAt !== null && outAt > 2.6 && outAt < 4.2, outAt && outAt.toFixed(2));
  ok('the two keep a talking distance (never overlapping)', wrenDist > 1.2, wrenDist.toFixed(2));
  ok('scene runs ~20 s and ends by itself', !SC.active && !G.Intro.active && !SC.skipped && SC.t >= 19.5 && SC.t < 19.8, SC.t.toFixed(2));
  ok('all 5 lines were subtitled', SC.FREE.lines.every(L => seen.has(L[3])), seen.size);
  ok('sim held during the scene, no damage, other keys ignored', Game.world.time === t0 && P().hp === hp0);
  ok('end of scene: freed, feather given, quest done, cage key used', S().flags.crane_freed && A.Inv.count('feather') === 1 && !A.Inv.count('cagekey') && A.Quests.stage('crane') === 2);
  ok('not yet waiting; no cage NPC; she walks (visible, not faded)', !S().flags.crane_waiting && !A.npcs.ilsabet && A.SceneWalk.on && !!A.SceneHold.c && A.SceneHold.c.root.visible && !A.SceneHold.c.fadeK);
  frames(40); ok('control returned (letterbox off, movement works)', !w.document.getElementById('lbox').classList.contains('on') && (() => { const z0 = P().z; G.Cam.yaw = Math.PI; key('KeyW', true); frames(20); key('KeyW', false); return Math.abs(P().z - z0) > 0.3; })());
  saveMidWalk = w.localStorage.getItem('veynhold_save');
  let maxHit = [], n = 0; const f = A.SceneHold.f; while (A.SceneWalk.on && n < 60 * 30) { frames(1); n++; const h = hits(A, f.x, f.z, 0.42, true); if (h.length && maxHit.length < 3) maxHit.push(f.x.toFixed(2) + ',' + f.z.toFixed(2) + ' ' + h[0]); }
  ok('the walk never passes through a wall or collider', maxHit.length === 0, maxHit.join(' | '));
  const nw = A.npcs.ilsabet_wait; ok('she arrives at the Stair spot (~15 s walk) and becomes the waiting NPC', !!nw && Math.hypot(nw.f.x - 7.2, nw.f.z - 26.2) < 0.05 && S().flags.crane_waiting && !A.SceneHold.c && n > 60 * 9 && n < 60 * 24, (n / 60).toFixed(1) + ' s');
  ok('same body handed over (no respawned model)', !!nw && !!nw.c && nw.c.root.parent && nw.c.root.visible);
  place(H, 7.2, 24.4, 0); frames(3); tap('KeyE'); frames(3); ok('talking to her at the Stair: "not without a blade"', Game.state === 'dialogue' && /without a blade/.test(w.document.querySelector('#advDlg .txt').textContent)); tap('KeyE'); frames(3);
  saveWaiting = w.localStorage.getItem('veynhold_save');
  ok('no console errors (part 1)', errors.length === 0, errors[0]); H.dom.window.close(); }

// ---------------------------------------------------------------- 2) skip: Esc and E; the world still changes; input cleared
{ const H = open(stor(save0)); const { w, G, Game, frames, key, tap, errors } = H, A = w.VEYN_ADV, SC = A.Scenes, P = () => Game.world.player, S = () => A.Save.data; calm(A);
  place(H, 23.9, 22.3, Math.PI / 2); frames(3); tap('KeyE'); frames(3); tap('Digit1'); frames(60 * 3);
  ok('second save: Cage scene playing', SC.active);
  key('KeyD', true); G.Input.pressed.KeyJ = true; frames(1); key('Escape', true); key('Escape', false); frames(1);
  ok('Esc skips the Cage scene', !SC.active && SC.skipped && !G.Intro.active && Game.state === 'playing');
  ok('input cleared on skip; the pause menu did not open', !G.Input.keys.KeyD && !G.Input.pressed.KeyJ && P().intent.mx === 0 && Game.state === 'playing');
  key('KeyD', false); frames(5);
  ok('skipped: door open, freed, feather, walk running from her end mark', Math.abs(A.Region.cage.door.rotation.y - 2.3) < 0.01 && S().flags.crane_freed && A.Inv.count('feather') === 1 && A.SceneWalk.on && A.SceneHold.f.x < 25.0);
  ok('the open door is solid (colliders beside the cage)', A.Region.circles.filter(c => c.cageDoor).length === 2);
  ok('no console errors (part 2)', errors.length === 0, errors[0]); H.dom.window.close(); }
{ const H = open(stor(save0)); const { w, G, Game, frames, tap } = H, A = w.VEYN_ADV, SC = A.Scenes; calm(A);
  place(H, 23.9, 22.3, Math.PI / 2); frames(3); tap('KeyE'); frames(3); tap('Digit1'); frames(40); tap('KeyE'); frames(2);
  ok('E skips the Cage scene too', !SC.active && SC.skipped && !G.Intro.active && Game.state === 'playing'); H.dom.window.close(); }

// ---------------------------------------------------------------- 3) reloads: mid-walk -> at the Stair; waiting -> still at the Stair
for (const [label, snap] of [['mid-walk', saveMidWalk], ['waiting', saveWaiting]]) {
  const H = open(stor(snap)); const A = H.w.VEYN_ADV, n = A.npcs.ilsabet_wait, d = A.Save.data;
  ok('reload ' + label + ': she is at the Stair spot, not in the cage, door open', !!n && Math.hypot(n.f.x - 7.2, n.f.z - 26.2) < 0.01 && !A.npcs.ilsabet && !A.npcs.ilsabet_gate && d.flags.crane_waiting && Math.abs(A.Region.cage.door.rotation.y - 2.3) < 0.01);
  ok('reload ' + label + ': no errors', H.errors.length === 0, H.errors[0]); H.dom.window.close(); }

// ---------------------------------------------------------------- 4) Odran beaten, last words, key -> the Block scene -> the gate
{ const H = open(stor(saveWaiting)); const { w, G, Game, frames, key, tap, errors } = H, A = w.VEYN_ADV, SC = A.Scenes, BD = A.BossD, C = w.VEYN_CORE, P = () => Game.world.player, S = () => A.Save.data;
  const od = ent(A, 'odran'), f = od.f; place(H, 0, 41, 0); frames(5); ok('walking onto the Block starts the fight', !!A.boss);
  for (let r = 0; r < 4 && !f.dead; r++) { const m0 = f.marks; const p = P(); p.x = p.px = f.x; p.z = p.pz = f.z - 1.7; p.facing = 0; f.atk = null; if (f.state === 'transition') frames(160); C.addPosture(Game.world, f, 1e5); frames(3); tap('KeyE'); frames(300); }
  ok('Odran is beaten', f.dead && S().defeated.odran);
  ok('no scene before his last words and the key', !SC.active && SC.lastId !== 'ilsabet_block');
  frames(400); { const c = BD.corpse; place(H, c.x, c.z - 1.6, 0); frames(3); }
  // beside the body the key comes first, then the kneel (merged chunk C order); the scene must wait for both
  tap('KeyE'); frames(4); ok('the Headsman\u2019s Key taken', A.Inv.count('headkey') === 1); frames(90); ok('no scene with the key but before his last words', !SC.active);
  for (let k = 0; k < 3 && !S().flags.odran_spoke; k++) { if (Game.state !== 'dialogue') { tap('KeyE'); frames(3); } for (let i = 0; i < 14 && Game.state === 'dialogue'; i++) { tap('KeyE'); frames(4); } }
  ok('his last words played', S().flags.odran_spoke);
  let started = -1; for (let i = 0; i < 120 && !SC.active; i++) { frames(1); started = i; }
  ok('the Block scene starts a moment after the key', SC.active && SC.lastId === 'ilsabet_block' && G.Intro.active && started > 30, started);
  const hf = A.SceneHold.f; ok('she starts on the Stair landing (below the Block)', !!hf && Math.abs(hf.z - 33) < 0.6 && A.Region.groundY(hf.x, hf.z) < 1.5, hf && hf.z.toFixed(2));
  const seen = new Set(), t0 = Game.world.time; let minD = 99, upAt = null;
  for (let i = 0; i < 60 * 30 && SC.active; i++) { const s = sub(w); if (s) seen.add(s); frames(1); if (upAt === null && hf.z > 36.4) upAt = SC.t; if (SC.t > 6) minD = Math.min(minD, Math.hypot(hf.x - P().x, hf.z - P().z)); }
  ok('she climbs the Stair and comes up to Wren (stops ~1.9 m from her)', upAt !== null && upAt < 4.5 && minD > 1.4 && minD < 2.4, (upAt && upAt.toFixed(2)) + ' / ' + minD.toFixed(2));
  ok('Block scene: all 5 lines subtitled, ends by itself (~19-24 s), sim held', SC.BLOCKL.rest.concat([SC.BLOCKL.l1]).every(L => seen.has(L[3])) && !SC.active && !SC.skipped && SC.t > 19.5 && SC.t < 24.5 && Game.world.time === t0, seen.size + ' ' + SC.t.toFixed(1));
  ok('after it: flag saved, she walks toward the gate', S().flags.crane_block_seen && A.SceneWalk.on && !A.npcs.ilsabet_wait);
  const midGate = w.localStorage.getItem('veynhold_save');
  let n = 0, bad = []; while (A.SceneWalk.on && n < 60 * 30) { frames(1); n++; const h = hits(A, hf.x, hf.z, 0.42); if (h.length && bad.length < 3) bad.push(hf.x.toFixed(2) + ',' + hf.z.toFixed(2) + ' ' + h[0]); }
  const ng = A.npcs.ilsabet_gate; ok('she ends near the Hollowwood Gate as the gate NPC (walk clear of colliders)', !!ng && Math.hypot(ng.f.x - 2.6, ng.f.z - 66) < 0.05 && S().flags.crane_gate && bad.length === 0, (n / 60).toFixed(1) + ' s ' + bad.join(' | '));
  place(H, 2.6, 64.4, 0); frames(3); tap('KeyE'); frames(3); ok('gate talk: the Hollowwood line', Game.state === 'dialogue' && /Hollowwood starts/.test(w.document.querySelector('#advDlg .txt').textContent)); tap('KeyE'); frames(3);
  ok('no console errors (part 4)', errors.length === 0, errors[0]);
  const snap = w.localStorage.getItem('veynhold_save'); H.dom.window.close();
  for (const [label, s] of [['mid-walk to the gate', midGate], ['at the gate', snap]]) { const H2 = open(stor(s)); const A2 = H2.w.VEYN_ADV, g = A2.npcs.ilsabet_gate;
    ok('reload ' + label + ': she is at the gate (not at the Stair), no scene replays', !!g && Math.hypot(g.f.x - 2.6, g.f.z - 66) < 0.01 && !A2.npcs.ilsabet_wait && A2.Save.data.flags.crane_gate);
    place(H2, 0, 48, 0); H2.frames(120); ok('reload ' + label + ': standing on the Block plays nothing', !A2.Scenes.active && H2.errors.length === 0, H2.errors[0]); H2.dom.window.close(); } }

// ---------------------------------------------------------------- 5) Block scene skip (E) still lands her at the gate
{ const s = JSON.parse(saveWaiting); s.defeated.odran = true; s.flags.odran_spoke = true; s.inv.headkey = 1; s.collected.key_headkey = true; s.lantern = 'stair';
  const H = open(stor(s)); const { w, G, Game, frames, tap, errors } = H, A = w.VEYN_ADV, SC = A.Scenes; place(H, 1.5, 47, 0); frames(70);
  ok('reload on the Stair with the key: walking onto the Block starts the Block scene', SC.active && SC.lastId === 'ilsabet_block');
  frames(120); tap('KeyE'); frames(2); ok('E skips it: flag set, walk to the gate running', !SC.active && SC.skipped && A.Save.data.flags.crane_block_seen && A.SceneWalk.on && !G.Intro.active);
  let n = 0; while (A.SceneWalk.on && n < 60 * 30) { frames(1); n++; } ok('after the skip she still ends at the gate', !!A.npcs.ilsabet_gate && A.Save.data.flags.crane_gate);
  ok('no console errors (part 5)', errors.length === 0, errors[0]); H.dom.window.close(); }

console.log(res.join('\n')); const fails = res.filter(r => r.startsWith('FAIL')).length; console.log((res.length - fails) + '/' + res.length + ' ilsabet checks passed');
process.exit(fails ? 1 : 0);
