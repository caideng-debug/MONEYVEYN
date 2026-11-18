/* chunk WORLD: in-page analytic layout audit (evaluated inside the game page after a region is loaded).
   Builds a second, unmerged copy of the region with A.Builder (never added to the scene), records which meshes / colliders each prop
   call made, then checks: prop ground contact (per vertex vs the walkable height field), visible floor vs height field (raycast),
   collider vs mesh footprint, wall-end gaps, nav reachability of every interactable, interact-radius reachability, and tall clutter
   + camera-transparent tall meshes around deathblow kill spots. Returns a plain JSON report. Read-only for the live game. */
(function () {
  const A = window.VEYN_ADV, THREE = window.THREE, R = A.Region.data, Reg = A.Region;
  const B = new A.Builder(R); const recs = []; let cur = null;
  const wrapM = (name, tag) => { const f = B[name]; B[name] = function (p) { const r0 = { tag: tag || name, p, s0: this.statics.length, c0: this.circles.length, g0: this.segs.length, d0: this.dyn.children.length };
    const prev = cur; cur = r0; try { return f.call(this, p); } finally { r0.s1 = this.statics.length; r0.c1 = this.circles.length; r0.g1 = this.segs.length; r0.d1 = this.dyn.children.length; r0.C = this.circles.slice(r0.c0, r0.c1); cur = prev; if (!prev) recs.push(r0); } }; };
  for (const k of Object.getOwnPropertyNames(Object.getPrototypeOf(B))) if (k.startsWith('p_')) wrapM(k);
  wrapM('floors', 'floors'); wrapM('elevation', 'elevation'); wrapM('outer', 'outer');
  { const fw = B.wall; B.wall = function (w) { const r0 = { tag: 'wall', p: { t: 'wall:' + w[4], x: (w[0] + w[2]) / 2, z: (w[1] + w[3]) / 2, w }, s0: this.statics.length, c0: this.circles.length, g0: this.segs.length, d0: this.dyn.children.length }; fw.call(this, w); r0.s1 = this.statics.length; r0.c1 = this.circles.length; r0.g1 = this.segs.length; r0.d1 = this.dyn.children.length; recs.push(r0); }; }
  B.build();
  const gy = (x, z) => B.ground.y(x, z);
  const v = new THREE.Vector3(), box = new THREE.Box3();
  const meshesOf = r => { const out = B.statics.slice(r.s0, r.s1); for (const o of B.dyn.children.slice(r.d0, r.d1)) o.traverse(n => { if (n.isMesh) out.push(n); }); return out; };
  const f2 = x => Math.round(x * 100) / 100;
  /* per mesh: min clearance over vertices (y - ground), max sink, bbox */
  function meshStats(m) { m.updateMatrixWorld(true); const P = m.geometry.attributes.position; let minC = 1e9, maxSink = -1e9, minY = 1e9, maxY = -1e9, x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; const step = Math.max(1, Math.floor(P.count / 400));
    for (let i = 0; i < P.count; i += step) { v.fromBufferAttribute(P, i).applyMatrix4(m.matrixWorld); const g = gy(v.x, v.z), c = v.y - g; if (c < minC) minC = c; if (-c > maxSink) maxSink = -c; if (v.y < minY) minY = v.y; if (v.y > maxY) maxY = v.y; if (v.x < x0) x0 = v.x; if (v.x > x1) x1 = v.x; if (v.z < z0) z0 = v.z; if (v.z > z1) z1 = v.z; }
    return { minC, maxSink, minY, maxY, x0, x1, z0, z1, mat: m.material && (m.material.name || m.material.type) }; }
  const report = { props: [], floatParts: [], floor: [], colliders: [], wallGaps: [], reach: [], interact: [], killspots: [], lanterns: [], gates: [], npcs: [], counts: {} };
  /* ---- 1. props: contact ---- */
  for (const r of recs) { if (r.tag === 'wall' || r.tag === 'floors' || r.tag === 'elevation' || r.tag === 'outer') continue; const ms = meshesOf(r); if (!ms.length) continue; const st = ms.map(meshStats);
    let minC = 1e9, maxSink = -1e9; const bb = { x0: 1e9, x1: -1e9, z0: 1e9, z1: -1e9, y1: -1e9 }; for (const s of st) { minC = Math.min(minC, s.minC); maxSink = Math.max(maxSink, s.maxSink); bb.x0 = Math.min(bb.x0, s.x0); bb.x1 = Math.max(bb.x1, s.x1); bb.z0 = Math.min(bb.z0, s.z0); bb.z1 = Math.max(bb.z1, s.z1); bb.y1 = Math.max(bb.y1, s.maxY); }
    const g0 = gy(r.p.x, r.p.z); let gmin = 1e9, gmax = -1e9; for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) { const h = gy(bb.x0 + (bb.x1 - bb.x0) * i / 4, bb.z0 + (bb.z1 - bb.z0) * j / 4); gmin = Math.min(gmin, h); gmax = Math.max(gmax, h); }
    const e = { t: r.p.t + (r.p.set ? ':' + r.p.set : '') + (r.p.pose ? ':' + r.p.pose : ''), x: r.p.x, z: r.p.z, g: f2(g0), contact: f2(minC), sink: f2(maxSink), straddle: f2(gmax - gmin), top: f2(bb.y1 - g0), bb: [f2(bb.x0), f2(bb.z0), f2(bb.x1), f2(bb.z1)], cols: r.c1 - r.c0 + r.g1 - r.g0, n: ms.length };
    e.flag = []; if (minC > 0.03) e.flag.push('FLOAT ' + f2(minC)); if (e.straddle > 0.3) e.flag.push('STRADDLES elevation ' + e.straddle); report.props.push(e);
    // floating parts: a part whose lowest point hangs 3..80 cm above the ground and that is not resting on another part of the same prop (rough: no other part's top within 5 cm under it)
    for (let i = 0; i < st.length; i++) { const s = st[i]; if (s.minC <= 0.03 || s.minC > 0.8) continue; const sx = (s.x0 + s.x1) / 2, sz = (s.z0 + s.z1) / 2;
      const rest = st.some((o, k) => k !== i && o.maxY >= s.minY - 0.05 && o.minY < s.minY && sx >= o.x0 - 0.05 && sx <= o.x1 + 0.05 && sz >= o.z0 - 0.05 && sz <= o.z1 + 0.05);
      if (!rest) report.floatParts.push({ t: e.t, x: r.p.x, z: r.p.z, part: i, mat: s.mat, gap: f2(s.minC), at: [f2(sx), f2(sz)], size: [f2(s.x1 - s.x0), f2(s.maxY - s.minY), f2(s.z1 - s.z0)] }); } }
  /* ---- 2. visible floor vs walkable height (raycast down onto floors / decks / stair treads / the gallows deck / platform boxes) ---- */
  const floorMeshes = []; for (const r of recs) if (r.tag === 'floors' || r.tag === 'elevation' || r.tag === 'p_gallows' || r.tag === 'p_greatblock') for (const m of meshesOf(r)) { m.updateMatrixWorld(true); floorMeshes.push(m); }
  const rc = new THREE.Raycaster(); rc.far = 30; const down = new THREE.Vector3(0, -1, 0); const o3 = new THREE.Vector3();
  const pts = []; for (const zn of R.zones) { for (const q of zn.rects || []) for (let x = q[0] + 0.25; x < q[2]; x += (q[2] - q[0] > 40 ? 1.5 : 0.5)) for (let z = q[1] + 0.2137; z < q[3]; z += (q[3] - q[1] > 40 ? 1.5 : 0.5)) pts.push([x, z]);
    if (zn.circle) { const [cx, cz, cr] = zn.circle; for (let x = cx - cr; x <= cx + cr; x += 0.75) for (let z = cz - cr + 0.0137; z <= cz + cr; z += 0.75) if (Math.hypot(x - cx, z - cz) < cr - 0.1) pts.push([x, z]); } }
  for (const s of B.ground.stairs) for (let x = s.x0 + 0.1; x < s.x1; x += 0.4) for (let z = s.z0 + 0.05; z < s.z1; z += 0.1) pts.push([x, z]);
  let worst = 0, nFloor = 0; const bad = new Map();
  for (const [x, z] of pts) { o3.set(x, 12, z); rc.set(o3, down); const hit = rc.intersectObjects(floorMeshes, false).find(h => !h.face || h.face.normal.y > -0.5); nFloor++;
    const g = gy(x, z), hy = hit ? hit.point.y : -0.03, d = hy - g; if (Math.abs(d) > 0.05 || !hit) { const k = Math.round(x) + ',' + Math.round(z); const b = bad.get(k); if (!b || Math.abs(d) > Math.abs(b.d)) bad.set(k, { x: f2(x), z: f2(z), walk: f2(g), seen: f2(hy), d: f2(d), zone: (Reg.zoneAt(x, z) || {}).id, mesh: hit ? (hit.object.material.name || hit.object.material.type) : 'base' }); } worst = Math.max(worst, Math.abs(d)); }
  report.floor = [...bad.values()]; report.counts.floorSamples = nFloor;
  /* ---- 3. colliders vs meshes: per prop, tall solid footprint with no collider, and collider reaching beyond the mesh ---- */
  for (const r of recs) { if (r.tag === 'wall' || r.tag === 'floors' || r.tag === 'elevation' || r.tag === 'outer' || r.tag === 'p_dress' || r.tag === 'p_pines' || r.tag === 'p_corpse') continue; const ms = meshesOf(r); if (!ms.length) continue;
    const g0 = gy(r.p.x, r.p.z); let bx0 = 1e9, bx1 = -1e9, bz0 = 1e9, bz1 = -1e9, solid = 0; for (const m of ms) { const s = meshStats(m); if (s.minY - g0 > 1.4 || s.maxY - g0 < 0.45) continue; solid++; bx0 = Math.min(bx0, s.x0); bx1 = Math.max(bx1, s.x1); bz0 = Math.min(bz0, s.z0); bz1 = Math.max(bz1, s.z1); }
    const cs = (r.C || []).map(c => Object.assign({}, c, { removed: B.circles.indexOf(c) < 0 })), gs = B.segs.slice(r.g0, r.g1); if (!solid) continue;
    const e = { t: r.p.t, x: r.p.x, z: r.p.z, mesh: [f2(bx0), f2(bz0), f2(bx1), f2(bz1)], circles: cs.map(c => [f2(c.x), f2(c.z), f2(c.r), c.cam ? 'cam' : 'nocam', f2(c.h), c.removed ? 'UNSNAGGED' : '']), segs: gs.length, flag: [] };
    if (!cs.filter(c => !c.removed).length && !gs.length) e.flag.push(cs.length ? 'COLLIDER UNSNAGGED (wall-side deco)' : 'NO COLLIDER (solid >0.45 m)');
    for (const c of cs) { const over = Math.max(bx0 - (c.x - c.r), (c.x + c.r) - bx1, bz0 - (c.z - c.r), (c.z + c.r) - bz1); if (over > 0.35) e.flag.push('circle r' + f2(c.r) + ' overhangs mesh by ' + f2(over)); }
    // mesh footprint not covered: sample the solid bbox, count points > 0.25 m outside every collider of this prop
    let unc = 0, tot = 0; for (let i = 0; i <= 6; i++) for (let j = 0; j <= 6; j++) { const x = bx0 + (bx1 - bx0) * i / 6, z = bz0 + (bz1 - bz0) * j / 6; tot++;
      const inC = cs.some(c => Math.hypot(x - c.x, z - c.z) < c.r + 0.25) || gs.some(s => { const ex = s.bx - s.ax, ez = s.bz - s.az, L2 = ex * ex + ez * ez || 1e-6; let t = ((x - s.ax) * ex + (z - s.az) * ez) / L2; t = Math.max(0, Math.min(1, t)); return Math.hypot(x - s.ax - ex * t, z - s.az - ez * t) < s.t + 0.25; });
      if (!inC) unc++; }
    e.uncovered = f2(unc / tot); if (e.flag.length || e.uncovered > 0.5) report.colliders.push(e); }
  /* ---- 4. wall endpoint gaps (a wall end near, but not on, another wall: a crack you can see through or squeeze into) ---- */
  const W = R.walls; for (let i = 0; i < W.length; i++) for (const [ex, ez] of [[W[i][0], W[i][1]], [W[i][2], W[i][3]]]) { let best = 1e9, bj = -1;
    for (let j = 0; j < W.length; j++) { if (j === i) continue; const w = W[j], dx = w[2] - w[0], dz = w[3] - w[1], L2 = dx * dx + dz * dz || 1e-6; let t = ((ex - w[0]) * dx + (ez - w[1]) * dz) / L2; t = Math.max(0, Math.min(1, t)); const d = Math.hypot(ex - w[0] - dx * t, ez - w[1] - dz * t); if (d < best) { best = d; bj = j; } }
    for (const g of R.gates) { for (const [gx, gz] of [g.a, g.b]) best = Math.min(best, Math.hypot(ex - gx, ez - gz)); }
    if (best > 0.05 && best < 1.3) report.wallGaps.push({ wall: i, style: W[i][4], end: [f2(ex), f2(ez)], gap: f2(best), near: bj, nearStyle: W[bj] && W[bj][4] }); }
  /* ---- 5. reachability: live nav field with every gate open (restored after) ---- */
  const was = {}; for (const k in Reg.gates) { was[k] = Reg.gates[k].seg.on; Reg.gates[k].seg.on = false; } Reg.buildNav();
  const sp = R.spawn; const N = Reg.navField(sp.x, sp.z, -1234.5); const reachAt = (x, z, r) => { let best = 1e9; for (let dx = -r; dx <= r; dx += 0.5) for (let dz = -r; dz <= r; dz += 0.5) { const d = Math.hypot(dx, dz); if (d > r) continue; const i = Math.floor(x + dx - N.x0), j = Math.floor(z + dz - N.z0); if (i < 0 || j < 0 || i >= N.W || j >= N.H) continue; if (N.dist[j * N.W + i] >= 0) best = Math.min(best, d); } return best; };
  const targets = [];
  for (const l of R.lanterns) targets.push(['lantern ' + l.id, l.x, l.z, 2.8]); for (const p of R.pickups) targets.push(['pickup ' + p.id, p.x, p.z, 2.2]); for (const n of R.notes) targets.push(['note ' + n.id, n.x, n.z, 2.2]);
  for (const l of R.levers) targets.push(['lever ' + l.id, l.x, l.z, 2.2]); for (const g of R.gates) targets.push(['gate ' + g.id, (g.a[0] + g.b[0]) / 2, (g.a[1] + g.b[1]) / 2, 2.6]); for (const n of R.npcs) targets.push(['npc ' + n.id, n.x, n.z, 2.2]);
  for (const e of R.enemies) targets.push(['enemy ' + e.id, e.x, e.z, 1.5]);
  for (const [nm, x, z, r] of targets) { const d = reachAt(x, z, r); report.reach.push({ nm, x, z, r, nearestReachable: d > 1e8 ? null : f2(d), ok: d <= r - 0.3 }); }
  for (const k in was) Reg.gates[k].seg.on = was[k]; Reg.buildNav();
  /* ---- 6. interactables that crowd each other (two prompts competing inside 2.5 m) ---- */
  const it = targets.filter(t => !t[0].startsWith('enemy')); for (let i = 0; i < it.length; i++) for (let j = i + 1; j < it.length; j++) { const d = Math.hypot(it[i][1] - it[j][1], it[i][2] - it[j][2]); if (d < 2.5) report.interact.push({ a: it[i][0], b: it[j][0], d: f2(d) }); }
  /* ---- 7. kill spots: tall clutter within 3 m (colliders cam / no-cam, and tall meshes with no camera collider at all) ---- */
  const tallMeshes = []; for (const r of recs) { if (r.tag === 'floors' || r.tag === 'elevation' || r.tag === 'outer') continue; for (const m of meshesOf(r)) { const s = meshStats(m); const g = gy((s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2); if (s.maxY - g > 1.8 && (s.x1 - s.x0) < 14 && (s.z1 - s.z0) < 14) tallMeshes.push({ t: r.p.t, x: (s.x0 + s.x1) / 2, z: (s.z0 + s.z1) / 2, hw: Math.max(s.x1 - s.x0, s.z1 - s.z0) / 2, h: f2(s.maxY - g) }); } }
  const spots = []; for (const e of R.enemies) { spots.push([e.id, e.x, e.z]); (e.patrol || []).forEach((w, i) => spots.push([e.id + '.p' + i, w[0], w[1]])); if (e.arena) { const a = e.arena; for (let k = 0; k < 8; k++) spots.push([e.id + '.arena' + k, a.x + Math.sin(k / 8 * 6.283) * a.r * 0.6, a.z + Math.cos(k / 8 * 6.283) * a.r * 0.6]); } }
  for (const [id, x, z] of spots) { const near = []; for (const c of Reg.circles) { if (c.npc) continue; const d = Math.hypot(c.x - x, c.z - z) - c.r; if (d < 3 && c.h >= 1.8) near.push({ kind: 'circle', d: f2(d), cam: !!c.cam, h: f2(c.h), at: [f2(c.x), f2(c.z)] }); }
    for (const s of Reg.segs) { if (!s.on || s.ledge || s.rail) continue; const ex = s.bx - s.ax, ez = s.bz - s.az, L2 = ex * ex + ez * ez || 1e-6; let t = ((x - s.ax) * ex + (z - s.az) * ez) / L2; t = Math.max(0, Math.min(1, t)); const d = Math.hypot(x - s.ax - ex * t, z - s.az - ez * t) - s.t; if (d < 3 && s.h >= 1.8) near.push({ kind: 'wall', d: f2(d), cam: !!s.cam, h: f2(s.h), at: [f2(s.ax), f2(s.az), f2(s.bx), f2(s.bz)] }); }
    const tm = tallMeshes.filter(m => Math.hypot(m.x - x, m.z - z) - m.hw < 3).map(m => ({ t: m.t, d: f2(Math.hypot(m.x - x, m.z - z) - m.hw), h: m.h }));
    const g = { id, x: f2(x), z: f2(z), near: near.sort((a, b) => a.d - b.d), tallMeshes: tm.filter((m, i, arr) => arr.findIndex(q => q.t === m.t && Math.abs(q.d - m.d) < 0.2) === i) };
    g.camBlind = tm.filter(m => !near.some(n => n.cam && Math.abs(n.d - m.d) < 0.6)).length; report.killspots.push(g); }
  /* ---- 8. dynamic objects: lanterns / levers / gates / npcs on their ground ---- */
  for (const l of R.lanterns) { let gmin = 1e9, gmax = -1e9; for (const [dx, dz] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5], [0, 0]]) { const h = gy(l.x + dx, l.z + dz); gmin = Math.min(gmin, h); gmax = Math.max(gmax, h); } const sp2 = A.lanternSpawn(l);
    report.lanterns.push({ id: l.id, g: f2(gy(l.x, l.z)), straddle: f2(gmax - gmin), spawn: [sp2.x, sp2.z], spawnG: f2(gy(sp2.x, sp2.z)), zone: (Reg.zoneAt(l.x, l.z) || {}).id }); }
  for (const g of R.gates) { const mx = (g.a[0] + g.b[0]) / 2, mz = (g.a[1] + g.b[1]) / 2; report.gates.push({ id: g.id, kind: g.kind, how: g.how, g: f2(gy(mx, mz)), ga: f2(gy(g.a[0], g.a[1])), gb: f2(gy(g.b[0], g.b[1])), front: f2(gy(mx, mz - 0.6)), back: f2(gy(mx, mz + 0.6)) }); }
  for (const n of R.npcs) report.npcs.push({ id: n.id, g: f2(gy(n.x, n.z)), zone: (Reg.zoneAt(n.x, n.z) || {}).id });
  report.counts.props = report.props.length; report.counts.statics = B.statics.length; report.pointIssues = Reg.pointIssues || A.checkPoints();
  B.dyn.traverse(o => { if (o.geometry) o.geometry.dispose(); }); for (const m of B.statics) m.geometry.dispose();
  return report;
})();
