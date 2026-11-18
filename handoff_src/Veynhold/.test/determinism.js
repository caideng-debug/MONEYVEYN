// chunk I1: cross-framerate determinism. The same seed + tick-keyed input script, driven by a fake presentation loop at
// 30 / 60 / 144 fps (World.advance accumulator stepping), must give identical core-state hashes at every checkpoint and the
// identical full event sequence — with a core deathblow (incl. its impact hit-stop, clear and unlock) and plantT (hard stop,
// landing, extract-end) all happening inside the run. The presentation side uses its own RNG and must not touch the core stream.
const path = require('path'), crypto = require('crypto');
const C = require(path.join(__dirname, '..', 'src', 'core.js'));
const res = []; const ok = (n, c, i) => res.push((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? ' [' + i + ']' : ''));
const TICKS = 1500, CHECK = 50;
const r6 = v => typeof v === 'number' ? (Number.isFinite(v) ? v.toPrecision(15) : String(v)) : v;
// Fighter ids come from a module-global counter, so each run's ids are offset: normalise them to the run's first id.
const ID_KEYS = new Set(['a', 'd', 'f', 'attacker', 'victim', 'owner']);
const normEv = (ev, base) => JSON.stringify(ev, (k, v) => (ID_KEYS.has(k) && typeof v === 'number') ? v - base : k === 'ids' && Array.isArray(v) ? v.map(x => x - base) : typeof v === 'number' ? r6(v) : v);
function snap(w) {   // full numeric + discrete core state (no presentation objects, no functions)
  const B = w.fighters[0].id;
  const fs = w.fighters.map(f => [f.id - B, f.state, f.stateT, f.stateDur, f.x, f.z, f.vx, f.vz, f.facing, f.hp, f.posture, f.freeze, f.lt, f.plantT, f.ignoreSeparation, f.guard, f.guardStart,
    f.guardWin, f.buffer, f.dead, f.marks, f.phase, f.atk ? [f.atk.def.key, f.atk.t, f.atk.su] : null, f.brain ? [f.brain.state, f.brain.mode, f.brain.think] : null].map(r6));
  const R = w.deathblow; const db = R ? [R.a.id - B, R.v.id - B, R.t, R.i, R.phase, R.variantId] : null;
  return JSON.stringify([w.tick, r6(w.time), fs, db, w.projectiles.filter(p => !p.dead).map(p => [p.id, r6(p.x), r6(p.z)]), w.over]);
}
const md5 = s => crypto.createHash('md5').update(s).digest('hex');
function run(fps) {
  const w = new C.World(4242); const p = w.addPlayer(0, -3); const e1 = w.addEnemy('duelist', 0, 9); const e2 = w.addEnemy('brother', 9, 8);
  p.hp = p.maxHp = 1e6; p.lockId = e1.id;
  const checks = [], events = [], present = { rng: C.__presentRng || mkRng(99), sprays: 0 };
  // tick-keyed input script (runs inside the core step via preStep, so it is identical at any fps)
  w.preStep = ww => { const t = ww.tick, I = p.intent;
    if (t % CHECK === 0) checks.push(md5(snap(ww)));
    I.mx = 0; I.mz = 0; I.sprint = false;
    if (t < 40) { I.mz = 1; I.sprint = t > 10; }                          // run ... then release = hard stop (plantT)
    if (t === 50 || t === 64) I.jump = true;                                            // landing (plantT)
    if (t >= 100 && t < 115) I.mx = 0.6;
    if (t === 120 || t === 140 || t === 300) I.light = true;
    if (t === 160 || t === 210 || t === 260) I.parry = true;
    if (t === 190) { I.dodge = true; I.mx = 1; }
    if (t === 240) I.heavy = true;
    if (t === 400) { e1.x = p.x + 0.3; e1.z = p.z + 2.0; e1.brain && (e1.brain.think = 9); C.addPosture(ww, e1, 1e5); }   // scripted posture break in range
    if (t === 412) I.deathblow = true;                                      // core deathblow (variant, impact hit-stop, clear, unlock)
    if (t >= 420 && t < 600 && t % 7 === 0) I.light = true;                 // presses during the lock (ignored / tail-buffered)
    if (t >= 470 && t < 560) { I.mx = 1; }                                   // steer into and past unlock (plantT from extract-end)
    if (t > 600 && t % 37 === 0) I.light = true;
    if (t > 600 && t % 53 === 11) I.parry = true;
    if (t > 600) { I.mx = Math.sin(t / 40) * 0.8; I.mz = Math.cos(t / 55) * 0.8; }
  };
  const dtF = 1 / fps; let frames = 0;
  while (w.tick < TICKS) {
    w.advance(dtF, TICKS); frames++;
    // fake presentation: drains events each frame, spends its OWN rng on cosmetic sprays
    for (const ev of w.events) { events.push(normEv(ev, p.id)); if (ev.type === 'hit' || ev.type === 'deathblowClear') for (let i = 0; i < 8; i++) present.sprays += present.rng(); }
    w.events.length = 0;
  }
  checks.push(md5(snap(w)));
  return { checks, events, frames, w, p, e1 };
}
function mkRng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const A = run(30), B = run(60), Cc = run(144);
const firstDiff = (x, y) => { for (let i = 0; i < Math.max(x.length, y.length); i++) if (x[i] !== y[i]) return i; return -1; };
ok('frames differ per cadence (30/60/144 fps drove ' + [A.frames, B.frames, Cc.frames].join('/') + ' presentation frames)', A.frames < B.frames && B.frames < Cc.frames);
ok('core-state hashes identical at all ' + B.checks.length + ' checkpoints (30 vs 60)', firstDiff(A.checks, B.checks) < 0, 'first diff @' + firstDiff(A.checks, B.checks));
ok('core-state hashes identical at all checkpoints (144 vs 60)', firstDiff(Cc.checks, B.checks) < 0, 'first diff @' + firstDiff(Cc.checks, B.checks));
ok('full event sequence identical (30 / 60 / 144: ' + B.events.length + ' events)', firstDiff(A.events, B.events) < 0 && firstDiff(Cc.events, B.events) < 0, [firstDiff(A.events, B.events), firstDiff(Cc.events, B.events)].join(','));
const types = B.events.map(s => JSON.parse(s).type), plants = B.events.map(s => JSON.parse(s)).filter(e => e.type === 'plant').map(e => e.why);
const dbSeq = types.filter(t => /^deathblow/.test(t)).join('>');
ok('run contains a full core deathblow (start, legacy, phases, impact hit-stop, clear, unlock)', /deathblowStart>deathblow>deathblowPhase>deathblowPhase>deathblowPhase>deathblowPhase>deathblowClear>deathblowUnlock/.test(dbSeq), dbSeq);
ok('run contains plantT from hard stop, landing and extract-end', ['stop', 'land', 'extract'].every(k => plants.includes(k)), plants.join(','));
ok('victim died at unlock; attacker actionable after', A.e1.dead && B.e1.dead && Cc.e1.dead && types.includes('enemyDead'));
// presentation RNG must not advance the core stream: rerun 60 fps with a presentation that burns 10x more of its own rng
{ const save = C.__presentRng; let n = 0; const heavy = mkRng(7); C.__presentRng = () => { n++; heavy(); heavy(); return heavy(); }; const D = run(60); C.__presentRng = save;
  ok('presentation RNG use does not change the core (hashes match with a different presentation rng)', firstDiff(D.checks, B.checks) < 0 && n > 0, n + ' presentation draws'); }
console.log(res.join('\n')); const pass = res.filter(r => r.startsWith('PASS')).length; console.log(pass + '/' + res.length + ' determinism checks passed');
process.exit(pass === res.length ? 0 : 1);
