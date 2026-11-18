const H = require('./harness.js'); const { w, G, Game, key, tap } = H;
let t = 5000; const run = (fps, n, cb) => { const out = []; for (let i = 0; i < n; i++) { t += 1000 / fps; if (cb) cb(i); Game.frame(t); out.push(sample()); } return out; };
w.document.querySelector('[data-enc="duelist"]').click(); const W = Game.world; W.enemies()[0].brain = null; W.enemies()[0].x = 12; W.enemies()[0].z = 12;
const pc = Game.chars.get(W.player.id);
const sample = () => ({ x: pc.root.position.x, z: pc.root.position.z, r: pc.root.rotation.y, cx: G.camera.position.x, cz: G.camera.position.z, leg: pc.lLeg.rotation.x });
for (const fps of [144, 60, 30]) {
  W.player.x = 0; W.player.z = -6; W.player.vx = W.player.vz = 0; key('KeyW', true); key('KeyD', false);
  const s = run(fps, fps * 2, i => { if (i === Math.floor(fps * 0.9)) key('KeyD', true); });
  key('KeyW', false); key('KeyD', false);
  const steps = []; for (let i = 1; i < s.length; i++) steps.push(Math.hypot(s[i].x - s[i - 1].x, s[i].z - s[i - 1].z));
  const steady = steps.slice(Math.floor(fps * 0.5), Math.floor(fps * 0.85));       // constant velocity stretch
  const mean = steady.reduce((a, b) => a + b, 0) / steady.length, dev = Math.max(...steady.map(v => Math.abs(v - mean))) / mean;
  const rs = []; for (let i = Math.floor(fps * 0.9); i < Math.floor(fps * 1.3); i++) rs.push(Math.abs(s[i + 1].r - s[i].r));
  const zeroTurnFrames = rs.filter(v => v < 1e-6).length;
  const cam = []; for (let i = 1; i < s.length; i++) cam.push(Math.hypot(s[i].cx - s[i - 1].cx, s[i].cz - s[i - 1].cz)); const cs = cam.slice(Math.floor(fps * 0.5), Math.floor(fps * 0.85)); const cm = cs.reduce((a, b) => a + b, 0) / cs.length;
  console.log(`${fps}fps: position step dev ${(dev * 100).toFixed(1)}% of mean, frozen-rotation frames during turn ${zeroTurnFrames}/${rs.length}, camera step dev ${(Math.max(...cs.map(v => Math.abs(v - cm))) / cm * 100).toFixed(1)}%`);
  run(fps, fps);
}
console.log('errors', H.errors.length);
