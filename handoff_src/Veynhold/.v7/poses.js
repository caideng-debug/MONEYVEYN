const H = require('./harness.js'); const { w, G } = H; const THREE = w.THREE;
const keys = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(G.POSES);
const FAM = k => { const [st, key] = k.split(':'); return G.FAMILY[st][key]; };
const f = { pvx: 0, pvz: 0, pfacing: 0, lt: 0, guardStart: -99, reactT: -99, id: 99, state: 'idle', stateT: 0, moveSpeed: 0, vx: 0, vz: 0, facing: 0, x: 0, z: 0, px: 0, pz: 0, phase: 1, isPlayer: false, marks: 1, atk: null };
const out = {};
for (const k of keys) {
  const c = new G.Character(f, 'duelist'); c.computeTarget = () => { Object.assign(c.target, G.POSES[k] || FAM(k)); return 0; };
  c.update(0.016, 1, 0); c.root.updateMatrixWorld(true);
  const P = o => { const v = new THREE.Vector3(); o.getWorldPosition(v); return [v.x, v.y, v.z]; };
  const L = (o, y) => { const v = new THREE.Vector3(0, y, 0); o.localToWorld(v); return [v.x, v.y, v.z]; };
  out[k] = { hips: P(c.hips), neck: L(c.torso, 0.6), head: L(c.head, 0.12), rSh: P(c.rSh), rEl: P(c.rEl), rHand: P(c.wrist), lSh: P(c.lSh), lEl: P(c.lEl), lHand: L(c.lEl, -0.29),
    lKnee: P(c.lKnee), rKnee: P(c.rKnee), lFoot: L(c.lKnee, -0.46), rFoot: L(c.rKnee, -0.46), base: P(c.bladeBase), tip: P(c.tip) };
  c.dispose();
}
require('fs').writeFileSync('/tmp/poses.json', JSON.stringify(out));
console.log('ok', Object.keys(out).length);
