// chunk B: engagement-token test (jsdom, real world mode). 4 field foes engaged on an invulnerable player for ~60 s:
// never two overlapping committed field attacks, enough attacks happen (no deadlock), max 2 foes within 3.5 m, nobody inside the player.
// Then a boss fight with field foes nearby: the boss attacks, the field foes never do.
const path = require('path'); const mk = require('./p1h.js'); const sleep = ms => new Promise(r => setTimeout(r, ms));
const res = []; const ok = (n, c, i) => res.push((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? ' [' + i + ']' : ''));
(async () => {
const H = mk({ file: path.join(__dirname, '..', 'dist', 'index.html') }), { w, G, Game, frames, key, tap, errors } = H; const A = w.VEYN_ADV;
frames(3); w.document.getElementById('advNew').click(); frames(2); key('Space', true); key('Space', false); await sleep(30); frames(5);
const W = Game.world, p = W.player, E = A.Ents, T = A.api.Token; A.Inv.give('wardblade');
const clearFoes = () => { for (const e of E.list) { const c = Game.chars.get(e.f.id); if (c) c.dispose(); Game.chars.delete(e.f.id); const i = W.fighters.indexOf(e.f); if (i >= 0) W.fighters.splice(i, 1); } E.clear(); };
clearFoes(); p.x = p.px = -10; p.z = p.pz = 18; p.facing = 0; frames(2);
const foes = [['t1', 'gaoler', -10, 24], ['t2', 'gaoler', -4, 18], ['t3', 'jailer', -16, 18], ['t4', 'jailer', -10, 12]].map(([id, type, x, z]) => { const e = E.spawn(W, { id, type, x, z, face: 0 }); E.engage(e, 'struck'); return e; });
const field = () => E.list.filter(e => !e.def.boss && !e.f.dead);
let ticks = 0, overlap = 0, maxAtk = 0, maxClose = 0, minD = 9, closeViol = 0; const last = new Map(); let attacks = 0, bossAtk = 0, fieldAtkInBoss = 0; const per = {};
const st = W.step.bind(W); W.step = function (dt) { st(dt); ticks++; p.invuln = true; p.hp = p.maxHp;
  let n = 0, close = 0; for (const e of E.list) { const f = e.f; if (f.dead) continue; const d = Math.hypot(f.x - p.x, f.z - p.z); if (!e.def.boss) { if (d < 3.5) close++; minD = Math.min(minD, d - f.radius - p.radius); }
    if (f.state === 'attack' && f.atk) { if (!e.def.boss) n++; if (last.get(f.id) !== f.atk.id) { last.set(f.id, f.atk.id); if (e.def.boss) bossAtk++; else { attacks++; per[e.def.id] = (per[e.def.id] || 0) + 1; if (A.boss) fieldAtkInBoss++; } } } }
  if (!A.boss) { if (n > 1) overlap++; maxAtk = Math.max(maxAtk, n); if (close > 2) closeViol++; maxClose = Math.max(maxClose, close); } };
// ~60 s: player stands its ground, swings a light every ~1.5 s (provokes guards, counters, heavy-punish reads)
for (let i = 0; i < 3600; i++) { if (i % 90 === 0) tap('KeyJ'); else frames(1); if (i % 600 === 0) await sleep(1); }
const engagedLeft = field().filter(e => e.mode === 'combat').length;
ok('60 s with 4 engaged field foes: never two committed field attacks at once', overlap === 0 && maxAtk <= 1, 'overlapTicks=' + overlap + ' maxAtk=' + maxAtk + ' ticks=' + ticks);
ok('attacks keep happening (no deadlock): >= 15 in 60 s', attacks >= 15, attacks + ' ' + JSON.stringify(per));
ok('the token rotates: at least 3 different foes attacked', Object.keys(per).length >= 3, Object.keys(per).join(','));
ok('at most 2 field foes within 3.5 m', closeViol === 0, 'maxClose=' + maxClose + ' violTicks=' + closeViol);
ok('nobody stacks inside the player', minD > -0.05, minD.toFixed(3));
ok('foes stayed engaged the whole time', engagedLeft === 4, engagedLeft);
ok('handovers / vetoes recorded', T.handovers >= 10, 'handovers=' + T.handovers + ' vetoes=' + T.vetoes);
// anti-deadlock: holder that cannot reach (walled off / held) loses the token within ~3 s
{ const h = T.holder || (frames(90), T.holder); if (h) { const f = h.f; f.x = f.px = p.x + 9; f.z = f.pz = p.z; const keep = f.profile.speed; f.profile.speed = 0; let t = 0; while (T.holder === h && t < 400) { frames(1); t++; }
    f.profile.speed = keep; ok('a holder that cannot reach the player releases the token within ~3 s', T.holder !== h && t <= 260, (t / 60).toFixed(2) + ' s'); } else ok('a holder exists to test release', false); }
// boss: Sallow + field foes nearby. The boss ignores the token; field foes never attack during the fight.
{ const def = Object.assign({}, A.Region.data.enemies.find(e => e.id === 'sallow') || {}); if (!def.id) ok('sallow def', false);
  else { def.x = p.x; def.z = p.z + 4; delete def.bark; const b = E.spawn(W, def); A.startBoss(b); const a0 = attacks; for (let i = 0; i < 1500; i++) { frames(1); if (i % 300 === 0) await sleep(1); }
    ok('boss fight: the boss attacks (ignores the field token)', bossAtk >= 3, bossAtk); ok('boss fight: nearby field foes never attack during it', fieldAtkInBoss === 0 && attacks === a0, fieldAtkInBoss); } }
const errs = errors.filter(e => !/WebGL|getContext/.test(e)); ok('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(res.join('\n')); const f = res.filter(r => r.startsWith('FAIL')).length; console.log(f ? f + ' FAILED' : 'ALL ' + res.length + ' PASSED'); process.exit(f ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
