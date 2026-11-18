const H = require('./harness.js'); const { w, G, Game, frames, key, tap } = H; const THREE = w.THREE;
const shots = []; const enc = process.argv[2] || 'king';
frames(2); w.document.querySelector(`[data-enc="${enc}"]`).click(); frames(5); tap('KeyQ');
const snap = (label) => { G.scene.traverse(o => { if (o.material && (o.material.transparent || o.isSprite)) o.visible = false; }); const cam = G.camera; cam.updateMatrixWorld(); const tris = []; 
  G.scene.traverse(o => { if (!o.isMesh || !o.visible) return; let vis = true; let q = o; while (q) { if (!q.visible) vis = false; q = q.parent; } if (!vis) return; const g = o.geometry; if (!g.attributes.position) return;
    const P = g.attributes.position, I = g.index; const col = o.material.color ? o.material.color.getHexString() : 'ffffff'; const n = I ? I.count : P.count; const step = Math.max(3, Math.floor(n / 3 / 400) * 3);
    for (let i = 0; i + 2 < n; i += step) { const pts = []; for (let k = 0; k < 3; k++) { const vi = I ? I.getX(i + k) : i + k; const v = new THREE.Vector3().fromBufferAttribute(P, vi).applyMatrix4(o.matrixWorld); const d = v.clone().applyMatrix4(cam.matrixWorldInverse); v.project(cam); pts.push([v.x, v.y, -d.z]); } tris.push([pts, col]); } });
  shots.push({ label, tris }); };
const W = Game.world; const e = W.enemies()[0];
frames(60, i => { if (i < 40) key('KeyW', true); else key('KeyW', false); }); snap('approach locked');
// force an enemy attack and snap during windup and strike
e.brain.update = () => {}; w.VEYN_CORE.startAttack(W, e, enc === 'king' ? 'k_cut' : 'w_slam'); const su = e.atk.su; frames(Math.round((su * 0.75) * 60)); snap('enemy windup');
frames(Math.round(su * 0.25 * 60) - 4); tap('KeyF'); frames(5); snap('deflect moment'); frames(6);
tap('KeyJ'); frames(8); snap('player light active');
require('fs').writeFileSync('/tmp/wire.json', JSON.stringify(shots)); console.log('ok', shots.map(s => s.tris.length));
