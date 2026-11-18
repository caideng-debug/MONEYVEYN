const C = require('../src/core.js'); const { World, atkPhase, CONFIG } = C;
function fight(enemyKeys, bot, seed, maxT = 300) {
  const w = new World(seed); const p = w.addPlayer(0, -4); enemyKeys.forEach((k, i) => w.addEnemy(k, i * 3 - (enemyKeys.length - 1) * 1.5, 4));
  const st = { pf: new Set(), df: new Set() }; const r = (s => () => (s = (s * 16807) % 2147483647) / 2147483647)(seed + 3);
  while (!w.over && w.time < maxT) {
    const es = w.enemies().sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z)); const e = es[0]; if (!e) break; p.lockId = e.id;
    const I = p.intent, d = Math.hypot(e.x - p.x, e.z - p.z), ang = Math.atan2(e.x - p.x, e.z - p.z);
    I.mx = d > 2.2 ? Math.sin(ang) : 0; I.mz = d > 2.2 ? Math.cos(ang) : 0; I.guard = false;
    bot(w, p, es, I, st, r, d); w.step(CONFIG.sim.dt); w.events.length = 0;
  }
  const es = w.fighters.filter(f => f.team === 1);
  return { over: w.over || 'timeout', t: w.time.toFixed(0), php: p.hp.toFixed(0), s: p.stats, ehp: es.map(e => e.hp.toFixed(0) + (e.dead ? '†' : '')).join('/') };
}
// sigma: timing noise (s); read: chance to recognise the right answer to a perilous attack / feint
const human = (sigma, read, aggro, bias, readsTiming) => (w, p, es, I, st, r, d) => {
  for (const e of es) { if (e.state !== 'attack' || !e.atk) continue; const a = e.atk, def = a.def, tti = a.su - a.t, key = e.id + ':' + a.id;
    if (!st.pf.has(key)) { st.pf.add(key); st[key] = (bias || 0.07) + (r() + r() + r() - 1.5) * sigma * 1.4; st[key + 'r'] = r() < read; st[key + 'clock'] = r() < (readsTiming === undefined ? 1 : readsTiming); }
    if (def.feintAt && st[key + 'r']) continue;                               // recognised the feint
    const t = st[key] - (st[key + 'clock'] ? 0 : (a.su - a.baseSu)), correct = st[key + 'r'];  // non-readers time by memorised clock, not by the tell
    let ans = def.type === 'grab' ? 'dodge' : def.type === 'sweep' ? 'jump' : def.type === 'thrust' ? 'mikiri' : 'parry'; if (!correct) ans = 'parry';
    if (tti <= t && !st.df.has(key)) { st.df.add(key);
      if (ans === 'dodge') { I.dodge = true; I.mx = Math.cos(Math.atan2(e.x - p.x, e.z - p.z)); I.mz = -Math.sin(Math.atan2(e.x - p.x, e.z - p.z)); }
      else if (ans === 'jump') I.jump = true;
      else if (ans === 'mikiri') { if (r() < 0.5) { I.dodge = true; const an = Math.atan2(e.x - p.x, e.z - p.z); I.mx = Math.sin(an); I.mz = Math.cos(an); } else I.parry = true; }
      else I.parry = true; } }
  if (w.deathblowCandidate(p)) I.deathblow = true;
  const e = es[0]; const open = e.state === 'recoil' || e.state === 'broken' || e.state === 'hit' || (e.state === 'attack' && e.atk && atkPhase(e.atk) === 'recovery' && !e.comboQueue.length) || (e.state !== 'attack' && e.state !== 'guard' && r() < aggro);
  if (d < 2.6 && open && p.canAct() && r() < 0.5) I.light = true;
  if (p.state === 'jump' && p.airborne && p.kickReady) I.light = true;
};
const masher = (w, p, es, I, st, r, d) => { if (d < 3 && r() < 0.2) I.light = true; if (r() < 0.01) I.heavy = true; };
const turtle = (w, p, es, I) => { I.guard = true; };
const enc = [['duelist'], ['warden'], ['brother'], ['king'], ['duelist', 'brother']];
const bots = [['expert σ20ms read95% tells95%', human(0.02, 0.95, 0.02, 0.07, 0.95)], ['learner σ50ms early40ms read70% tells60%', human(0.05, 0.7, 0.03, 0.11, 0.6)], ['first-timer σ90ms early80ms read35% tells20%', human(0.09, 0.35, 0.05, 0.15, 0.2)], ['masher', masher], ['turtle', turtle]];
for (const [name, bot] of bots) {
  console.log('== ' + name); let wins = 0, n = 0;
  for (const e of enc) { const res = []; for (let s = 1; s <= 5; s++) { const x = fight(e, bot, s * 97); res.push(x); n++; if (x.over === 'victory') wins++; }
    console.log('  ' + e.join('+').padEnd(16), res.map(x => `${x.over[0]}${x.t}s p${x.php} d${x.s.deflects} m${x.s.mikiri} k${x.s.jumpKicks}`).join(' | ')); }
  console.log('  win rate', (wins / n * 100).toFixed(0) + '%');
}
