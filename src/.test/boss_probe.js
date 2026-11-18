// chunk D: Odran fight probe — a simple bot fights the Iron Warden in the real world mode and logs anomalies.
// usage: node .test/boss_probe.js [seconds] [seed]
const mk = require('./p1h.js'); const path = require('path');
const SECS = +(process.argv[2] || 60), SEED = +(process.argv[3] || 4242), BOT = process.argv[4] || 'duel';
const save = { game: 'veynhold', schema: 1, created: 1, updated: 1, playTime: 600, deaths: 0, kills: 10, region: 'execution', lantern: 'stair', lit: ['grave', 'gaol', 'stair'],
  flags: { met_tamsin: true, combat_tutorial_seen: true, tut_deflect: true, tut_thrust: true, tut_sweep: true, tut_stealth: true }, quests: { main: { stage: 5, log: [5], t: 1 } }, inv: { draught: 3 }, weapons: ['wardblade'], equip: { weapon: 'wardblade' },
  upgrades: [], defeated: {}, opened: { gaoldoor: true }, collected: { sword: true }, lore: {}, zones: { pit: true, yard: true, gaol: true, muster: true, stair: true }, hints: { h_move: true, h_lantern: true, h_lock: true, draught: true }, chapter: 1, chapterDone: false };
const file = path.join(__dirname, '..', 'dist', 'index.html');
const H = mk({ file, seed: SEED, storage: { veynhold_save: JSON.stringify(save), veynhold_v8: JSON.stringify({ v: 8, seenTutorial: true }) } });
const { w, G, Game, frames, key, tap, errors } = H; const A = w.VEYN_ADV, C = w.VEYN_CORE;
frames(3); w.document.getElementById('advContinue').click(); frames(5);
const P = () => Game.world.player, W = () => Game.world, R = A.Region;
const anomalies = []; const note = (s) => { if (anomalies.length < 60) anomalies.push(s); };
console.log('spawn', P().x.toFixed(2), P().z.toFixed(2), 'state', Game.state);
// walk to the arena
G.Cam.yaw = 0; key('KeyW', true); let n = 0; while (!A.boss && n < 600) { frames(1); n++; } key('KeyW', false);
const od = A.Ents.list.find(e => e.def.id === 'odran'); console.log('boss started after', n, 'frames; player at', P().x.toFixed(2), P().z.toFixed(2), 'gy', R.groundY(P().x, P().z), 'odran', od.f.x.toFixed(2), od.f.z.toFixed(2), 'mode', od.mode, 'gate', R.gates.bossfog.seg.on);
// bot
let lastState = '', stateSince = 0, t = 0, phase2At = null, lastLog = -1; const fo = od.f; let hits = 0, hitsNoLos = 0; const ph = { 1: 0, 2: 0 };
const origHE = Game.handleEvents; Game.handleEvents = function () { for (const e of W().events) { if (e.type === 'hit' && e.d === P().id) { hits++; const a = W().byId(e.a); if (a && !R.los(a.x, a.z, P().x, P().z)) { hitsNoLos++; note('hit through a wall at t=' + t.toFixed(1)); } } if (e.type === 'phase2') { phase2At = t; note('phase2 event at t=' + t.toFixed(1)); } } return origHE.call(this); };
let r = SEED; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
for (let i = 0; i < SECS * 60; i++) { t = i / 60;
  const p = P(); if (p.dead) { note('player died t=' + t.toFixed(1)); break; } p.hp = Math.max(p.hp, 60);
  if (fo.dead) { note('odran dead t=' + t.toFixed(1)); break; }
  if (!p.lockId && i % 30 === 0) tap('KeyQ');
  const a = fo.atk, d = Math.hypot(fo.x - p.x, fo.z - p.z);
  if (BOT === 'chaos') { if (i % 40 === 0) { const k = ['KeyA', 'KeyD', 'KeyS', 'KeyW'][Math.floor(rnd() * 4)]; ['KeyA', 'KeyD', 'KeyS', 'KeyW'].forEach(q => key(q, q === k)); key('ShiftLeft', rnd() < 0.5); G.Cam.yaw = rnd() * 6.28; }
    if (i % 25 === 0) tap(['KeyJ', 'KeyC', 'Space', 'KeyK', 'KeyF'][Math.floor(rnd() * 5)]); if (fo.deathblowable && d < 2.8) tap('KeyE');
    if (fo.hp < 40 && fo.phase === 1) fo.hp = 40; frames(1); }
  else if (fo.state === 'attack' && a && a.t < a.su) { const left = a.su - a.t; if (left < 0.09 && left > 0.04 && !a._b) { a._b = 1; if (a.def.danger) tap('KeyC'); else tap('KeyF'); } }
  else if (fo.deathblowable && d < 2.8) { tap('KeyE'); }
  else if ((fo.state !== 'attack' || (a && a.t > a.su + a.ac)) && d < 3 && i % 14 === 0 && rnd() < 0.7) tap('KeyJ');
  // approach if far
  if (BOT !== 'chaos') { const want = Math.atan2(fo.x - p.x, fo.z - p.z); G.Cam.yaw = want; key('KeyW', d > 2.6); frames(1); }
  if (fo.state !== lastState) { lastState = fo.state; stateSince = t; } else if (t - stateSince > 6 && !['idle', 'move'].includes(fo.state)) { note('odran stuck in ' + fo.state + ' for 6 s at t=' + t.toFixed(1)); stateSince = t; }
  ph[fo.phase] = (ph[fo.phase] || 0) + 1;
  const ar = Math.hypot(fo.x - 0, fo.z - 50); if (ar > 14.6) note('odran outside the ring r=' + ar.toFixed(2) + ' t=' + t.toFixed(1));
  const c = Game.chars.get(fo.id); const gy = R.groundY(fo.x, fo.z); if (c && Math.abs(c.gy - gy) > 0.05) note('odran visual gy ' + c.gy + ' vs ground ' + gy);
  if (Math.abs(gy - 1.8) > 0.01 && ar < 14) note('arena ground not 1.8 at odran: ' + gy + ' (' + fo.x.toFixed(1) + ',' + fo.z.toFixed(1) + ')');
  const cam = G.camera.position; const cgy = R.groundY(cam.x, cam.z); if (cam.y < cgy + 0.25) note('camera below/at ground t=' + t.toFixed(1) + ' cam y ' + cam.y.toFixed(2) + ' ground ' + cgy);
  if (od.path && Math.abs(R.groundY(fo.x, fo.z) - R.groundY(p.x, p.z)) < 0.3 && d < 2.8) note('odran in path mode at melee range t=' + t.toFixed(1));
  for (const e of A.Ents.list) if (!e.def.boss && !e.f.dead && e.mode === 'combat' && Math.hypot(e.f.x, e.f.z - 50) < 15) { note('field foe ' + e.def.id + ' in the arena t=' + t.toFixed(1)); break; }
  if (Math.floor(t) % 5 === 0 && Math.floor(t) !== lastLog) { lastLog = Math.floor(t); console.log(`t=${t.toFixed(0)} od ${fo.state}${a ? ':' + a.key : ''} ph${fo.phase} hp${fo.hp.toFixed(0)} post${fo.posture.toFixed(0)} marks${fo.marks} pos(${fo.x.toFixed(1)},${fo.z.toFixed(1)}) d${d.toFixed(1)} path${od.path} brain ${fo.brain && fo.brain.mode} | p ${p.state} (${p.x.toFixed(1)},${p.z.toFixed(1)}) cam(${cam.x.toFixed(1)},${cam.y.toFixed(1)},${cam.z.toFixed(1)})`); }
}
console.log('hits on player', hits, 'through walls', hitsNoLos, 'frames per phase', JSON.stringify(ph), 'phase2At', phase2At);
console.log('ANOMALIES', anomalies.length ? '\n  ' + [...new Set(anomalies)].join('\n  ') : 'none');
console.log('ERRORS', errors.slice(0, 5));
