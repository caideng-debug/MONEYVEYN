// merge 2: deathblow blade-to-spine alignment in jsdom (procedural rig), field foe (m5) and Odran's final blow. The lunge solver in world_boss.js
// (Fin.post) once moved the attacker the wrong way (F.D ran to its 1.9 m clamp, blade stopped short: 0.22-0.38 m miss). Must be < 0.12 m.
const mk = require('./p1h.js'); const path = require('path');
const FILE = path.join(__dirname, '..', 'dist', 'index.html');
const src = require('fs').readFileSync(path.join(__dirname, 'boss.js'), 'utf8'); const save0 = eval('(' + src.match(/const save0 = (\{[\s\S]*?chapterDone: false \})/)[1] + ')'); save0.flags.intro_odran = true;
const res = []; const ok = (n, c, i) => { res.push((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? ' [' + i + ']' : '')); };
const run = (id, seamIdx) => new Promise(done => { const H = mk({ file: FILE, storage: { veynhold_save: JSON.stringify(save0), veynhold_v8: JSON.stringify({ v: 8, seenTutorial: true }) } });
  const { w, G, Game, frames } = H, A = w.VEYN_ADV, C = w.VEYN_CORE, THREE = w.THREE; A.BossD.enabled = true; frames(3); w.document.getElementById('advContinue').click(); frames(5);
  const W = Game.world, P = W.player, BD = A.BossD, e = A.Ents.list.find(x => x.def.id === id), f = e.f;
  if (id === 'odran') { A.startBoss(e); f.marks = 1; f.phase = 2; f.x = f.px = 1.5; f.z = f.pz = 49.5; P.x = P.px = 1.5; P.z = P.pz = 47.8; } else { P.x = P.px = f.x + 0.3; P.z = P.pz = f.z - 1.8; A.Ents.engage(e, 'struck'); }
  P.maxHp = P.hp = 1e5; f.atk = null; f.brain && (f.brain.update = () => {}); f.facing = Math.PI; P.facing = 0; G.Cam.yaw = 0; C.addPosture(W, f, 1e5); if (seamIdx !== undefined) BD.Fin.count = seamIdx;
  let out = null; BD.onPost = (F, st) => { if (out || !F.imp || st < F.tImp + 0.03) return; const ac = F.ac, vc = F.vc, V = () => new THREE.Vector3(), hilt = V(), tip = V(), hips = V(), head = V();
    (ac.model && ac.model.blade ? ac.model.blade : ac.wrist).getWorldPosition(hilt); ac.tip.getWorldPosition(tip); vc.hips.getWorldPosition(hips); vc.head.getWorldPosition(head);
    const d1 = tip.clone().sub(hilt), d2 = head.clone().sub(hips), r = hilt.clone().sub(hips), a = d1.dot(d1), ee = d2.dot(d2), ff = d2.dot(r), c = d1.dot(r), bb = d1.dot(d2), den = a * ee - bb * bb;
    let s = den > 1e-9 ? Math.min(1, Math.max(0, (bb * ff - c * ee) / den)) : 0, t = (bb * s + ff) / ee; t = Math.min(1, Math.max(0, t)); s = Math.min(1, Math.max(0, (bb * t - c) / a));
    const tgt = BD.targetPoint(vc, F, V()), sT = Math.min(1, Math.max(0, tgt.clone().sub(hilt).dot(d1) / a)), missT = hilt.clone().addScaledVector(d1, sT).distanceTo(tgt);
    const ux = vc.root.position.x - ac.root.position.x, uz = vc.root.position.z - ac.root.position.z, ul = Math.hypot(ux, uz) || 1, fwd = (d1.x * ux + d1.z * uz) / ul / Math.sqrt(a);
    out = { dy: +(tgt.y - hilt.y).toFixed(2), L: +Math.sqrt(a).toFixed(2), hy: +hilt.y.toFixed(2), lat: +((d1.x * uz - d1.z * ux) / ul / Math.sqrt(a)).toFixed(2), seam: F.seam, missT: +missT.toFixed(3), fwd: +fwd.toFixed(2), beyond: +(Math.sqrt(a) * (1 - s)).toFixed(2), kind: F.kind, boss: !!F.bossFinal, D: +F.D.toFixed(2), miss: +hilt.clone().addScaledVector(d1, s).distanceTo(hips.clone().addScaledVector(d2, t)).toFixed(3), along: +s.toFixed(2) }; };
  setTimeout(() => { G.Input.pressed.KeyE = true; for (let i = 0; i < 150 && !out; i++) frames(1); const errs = H.errors.slice(); H.dom.window.close(); done({ out, errs }); }, 250); });
(async () => {
  // chunk G1: field kills cycle the plate seams (gut / armpit / neck); Odran's last is the armpit. The blade must hit the seam point (< 0.12 m)
  // and pass through the torso along the thrust: within 0.22 m of the spine, pointing forward into the body, the point out past the spine.
  for (const [id, si] of [['m5', 0], ['m5', 1], ['m5', 2], ['odran']]) { const { out, errs } = await run(id, si); const nm = id + (out ? ' ' + out.seam : '');
    ok(nm + ': deathblow impale captured', !!out, JSON.stringify(out));
    ok(nm + ': blade on the seam target (miss < 0.12 m)', !!out && out.missT < 0.12, out && out.missT);
    ok(nm + ': blade passes through the torso along the thrust', !!out && out.miss < 0.22 && out.fwd > 0.5 && out.beyond > 0.2, out && [out.miss, out.fwd, out.beyond].join('/'));
    const id_ = nm;
    ok(id_ + ': lunge distance inside its clamp (not pinned at 1.9 m)', !!out && out.D < 1.89, out && out.D);
    ok(id_ + ': no page errors', errs.length === 0, errs.slice(0, 2).join(' | ')); }
  console.log(res.join('\n')); const pass = res.filter(r => r.startsWith('PASS')).length; console.log(pass + '/' + res.length + ' align checks passed'); process.exit(pass === res.length ? 0 : 1);
})();
