const C = require('../src/core.js'); const { World, CONFIG, atkPhase } = C;
const w = new World(97); const p = w.addPlayer(0, -4); const e = w.addEnemy('duelist', 0, 4); const r = (s => () => (s = (s * 16807) % 2147483647) / 2147483647)(100);
const log = [];
while (!w.over && w.time < 30) { p.lockId = e.id; const d = Math.hypot(e.x - p.x, e.z - p.z), ang = Math.atan2(e.x - p.x, e.z - p.z);
  p.intent.mx = d > 2.2 ? Math.sin(ang) : 0; p.intent.mz = d > 2.2 ? Math.cos(ang) : 0; if (d < 3 && r() < 0.2) p.intent.light = true;
  const before = e.state + '/' + e.brain.state; w.step(CONFIG.sim.dt);
  for (const ev of w.events) if (['hit', 'block', 'deflect', 'attackStart', 'postureBreak', 'deathblow'].includes(ev.type)) log.push(w.time.toFixed(2) + ' ' + ev.type + ' ' + (ev.key || '') + ' a=' + (ev.a || ev.f) + ' estate=' + before + ' reason=' + e.brain.reason);
  w.events.length = 0; }
console.log(log.slice(0, 60).join('\n')); console.log('enemy stats', e.stats, 'player', p.stats);
