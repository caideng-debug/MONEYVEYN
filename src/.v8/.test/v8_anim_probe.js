// probe: foot slide + weights (dev tool; the real checks live in v8.js)
process.env.VEYN_MODELS = '1';
const H = require('./harness.js'); const { w, G, Game, frames, key, errors } = H; const THREE = w.THREE;
const wait = () => new Promise(r => { const t0 = Date.now(); const tick = () => { const s = w.VEYN_MODELS.status(); if (s.ready === s.total || s.failed || Date.now() - t0 > 20000) r(s); else setTimeout(tick, 20); }; tick(); });
(async () => {
  await wait();
  const v = new THREE.Vector3();
  const run = (label, keys, lock, guard) => {
    Game.start('duelist'); const W = Game.world, P = W.player, e = W.enemies()[0]; e.brain.update = () => {}; e.x = lock ? 0 : 14; e.z = lock ? global.EZ : -14; P.x = 0; P.z = lock ? 0 : -12; P.facing = 0; P.lockId = lock ? e.id : null; G.Cam.yaw = 0;
    for (const k of keys) key(k, true); if (guard) key('KeyF', true);
    const c = Game.chars.get(P.id), M = c.model; let n = 0, slide = 0, sp = 0, pl = 0, sampled = 0; const prev = {};
    frames(40);
    frames(110, () => {
      c.root.updateMatrixWorld(true);
      const sc = c.look.scale, pts = {}; for (const s of ['Left', 'Right']) { const toe = M.byName[s + 'ToeBase'].getWorldPosition(new THREE.Vector3()), heel = M.byName[s + 'Foot'].getWorldPosition(new THREE.Vector3()); pts[s] = { toe, heel, low: Math.min(toe.y - 0.03 * sc, heel.y - 0.085 * sc) }; }
      const bodyV = Math.hypot(P.vx, P.vz);
      for (const s of ['Left', 'Right']) { const p = pts[s], q = prev[s]; if (q && p.low < 0.015 && q.low < 0.015) { const d = Math.min(Math.hypot(p.toe.x - q.toe.x, p.toe.z - q.toe.z), Math.hypot(p.heel.x - q.heel.x, p.heel.z - q.heel.z)); slide += d * 60; pl++; } prev[s] = p; }
      sp += bodyV; n++;
    });
    for (const k of keys) key(k, false); key('KeyF', false);
    const ws = c.cl ? c.cl.w : {}; const sum = Object.values(ws).reduce((a, b) => a + b, 0);
    console.log(label.padEnd(26), 'body', (sp / n).toFixed(2), 'm/s  planted-foot drift', (pl ? slide / pl : -1).toFixed(2), 'm/s  ratio', (pl ? slide / pl / (sp / n) : -1).toFixed(2), 'plantedFrac', (pl / n / 2).toFixed(2), 'w', JSON.stringify(ws), 'sum', sum.toFixed(3), 'yaw', c.cl && c.cl.yaw.toFixed(2));
    Game.quit();
  };
  global.EZ = 20; run('walk fwd (4.4)', ['KeyW'], false);
  run('sprint (7)', ['KeyW', 'ShiftLeft'], false);
  run('locked fwd', ['KeyW'], true);
  global.EZ = 8; run('locked strafe R', ['KeyD'], true);
  run('locked strafe L', ['KeyA'], true);
  global.EZ = 5; run('locked back', ['KeyS'], true); global.EZ = 20;
  run('guard walk fwd', ['KeyW'], true, true);
  run('guard strafe R', ['KeyD'], true, true);
  run('locked diag fwd-R', ['KeyW', 'KeyD'], true);
  global.EZ = 5; run('locked diag back-L', ['KeyS', 'KeyA'], true);
  console.log('errors', errors.length ? errors.slice(0, 3) : 'none');
})();
