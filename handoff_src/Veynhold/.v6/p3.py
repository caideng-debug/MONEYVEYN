p='src/game.js'; s=open(p).read()
def rep(a,b,cnt=1):
    global s
    assert s.count(a)==cnt,(a[:80],s.count(a)); s=s.replace(a,b)
rep("  live: new Map(), geo: null,", "  live: new Map(), geo: null, warn: new Map(),")
rep("""  update(w, alpha, dt) {
    for (const [id, L] of this.live) {""","""  // v6: ground warning — a crimson lane flares under the wave's path 0.3 s before it is released
  warnMesh() { const g = new THREE.PlaneGeometry(1.6, 7); g.translate(0, 3.6, 0); g.rotateX(-Math.PI / 2); const m = new THREE.MeshBasicMaterial({ color: 0xff2010, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const mesh = new THREE.Mesh(g, m); mesh.position.y = 0.03; scene.add(mesh); return mesh; },
  update(w, alpha, dt) {
    for (const f of w.fighters) { const a = f.atk; let W = this.warn.get(f.id); const lead = a && a.def.projectile && f.state === 'attack' ? a.su - a.t : -1;
      if (lead > 0 && lead <= 0.3) { if (!W) { W = this.warnMesh(); this.warn.set(f.id, W); } W.visible = true; W.position.x = f.x; W.position.z = f.z; W.rotation.y = f.facing; W.material.opacity = 0.18 + 0.5 * (1 - lead / 0.3) * (0.75 + 0.25 * Math.sin(lead * 90)); }
      else if (W && W.visible) { W.material.opacity *= 0.8; if (W.material.opacity < 0.01) W.visible = false; } }
    for (const [id, L] of this.live) {""")
rep("  clear() { for (const L of this.live.values()) { scene.remove(L.g); L.g.children.forEach(c => c.material.dispose()); } this.live.clear(); },",
    "  clear() { for (const L of this.live.values()) { scene.remove(L.g); L.g.children.forEach(c => c.material.dispose()); } this.live.clear(); for (const W of this.warn.values()) { scene.remove(W); W.geometry.dispose(); W.material.dispose(); } this.warn.clear(); },")
# per-frame string alloc: compare state + atk id separately
rep("    const sKey = st + ':' + (f.atk ? f.atk.id : ''); if (sKey !== this.sKey) { this.sKey = sKey; Object.assign(this.sEntry, this.pose); }",
    "    const sA = f.atk ? f.atk.id : -1; if (st !== this.sKeyS || sA !== this.sKeyA) { this.sKeyS = st; this.sKeyA = sA; Object.assign(this.sEntry, this.pose); }   // v6: no per-frame string")
open(p,'w').write(s)
