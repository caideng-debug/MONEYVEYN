// Skinned-model integration test: loads the embedded GLBs in jsdom (texture decode stubbed), fights every encounter,
// and checks the GLB skeleton tracks the pose rig: blade in the GLB hand, no NaNs, feet near the floor, toggle + restart leaks.
process.env.VEYN_MODELS = '1';
const H = require('./harness.js'); const { w, G, Game, frames, key, tap, errors } = H; const THREE = w.THREE;
const results = []; const ok = (name, pass, info) => { results.push(pass); console.log((pass ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? ' [' + info + ']' : '')); };
const wait = () => new Promise(r => { const t0 = Date.now(); const tick = () => { const s = w.VEYN_MODELS.status(); if (s.ready === s.total || s.failed || Date.now() - t0 > 20000) r(s); else setTimeout(tick, 20); }; tick(); });
(async () => {
  const st = await wait(); ok('all five models parsed', st.ready === 5 && !st.failed, st.ready + '/' + st.total + (st.failed ? ' ' + st.failed : ''));
  const v = new THREE.Vector3(), v2 = new THREE.Vector3();
  const encs = ['duelist', 'warden', 'brother', 'pair', 'king', 'gauntlet']; let worstHand = 0, worstFoot = 0, nan = 0, samples = 0, maxBoneDist = 0; const statesSeen = new Set();
  for (const enc of encs) {
    w.document.querySelector(`[data-enc="${enc}"]`).click(); frames(2);
    const chars = [...Game.chars.values()]; ok(enc + ': every fighter uses a skinned model', chars.every(c => !!c.model), chars.map(c => c.lookKey + ':' + !!c.model).join(' '));
    const visCount = c => { let n = 0, old = 0; c.model.root.traverse(o => { if (o.isMesh && o.visible) n++; }); c.rig.traverse(o => { if (o.isMesh && o.visible && !c.model.root.getObjectById(o.id) && !(c.cape && c.cape.getObjectById(o.id))) old++; }); return [n, old]; };
    ok(enc + ': skinned meshes visible, old block meshes hidden', chars.every(c => { const [n, old] = visCount(c); return n >= 5 && old === 0; }), chars.map(c => visCount(c).join('/')).join(' '));
    tap('KeyQ'); const W = Game.world; let r = 7; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647; key('KeyW', true);
    frames(60 * 25, i => {
      if (i % 20 === 0) { const k = ['KeyJ', 'KeyF', 'Space', 'KeyK', 'KeyC', 'KeyE', 'KeyA', 'KeyD'][Math.floor(rnd() * 8)]; key(k, true); H._k = k; } if (i % 20 === 3 && H._k) key(H._k, false); W.player.hp = Math.max(W.player.hp, 30);
      if (i % 7 === 0) for (const c of Game.chars.values()) { const M = c.model; if (!M) continue; statesSeen.add(c.f.state); samples++;
        c.root.updateMatrixWorld(true);
        const hand = M.byName.RightHand.getWorldPosition(v), grip = M.blade.getWorldPosition(v2); worstHand = Math.max(worstHand, hand.distanceTo(grip));
        for (const b of M.bones) { b.getWorldPosition(v); if (!isFinite(v.x + v.y + v.z)) nan++; maxBoneDist = Math.max(maxBoneDist, Math.hypot(v.x - c.root.position.x, v.z - c.root.position.z)); }
        if (c.f.state === 'idle' || c.f.state === 'guard') { const fy = Math.min(M.byName.LeftFoot.getWorldPosition(v).y, M.byName.RightFoot.getWorldPosition(v2).y) - c.root.position.y; worstFoot = Math.max(worstFoot, Math.abs(fy - 0.085 * (c.look.scale))); }
        c.tip.getWorldPosition(v); if (!isFinite(v.x)) nan++; }
    });
    key('KeyW', false);
    const before = G.scene.children.length; for (let i = 0; i < 4; i++) { tap('KeyR'); frames(3); }
    ok(enc + ': restart x4 keeps scene size and models', G.scene.children.length === before && [...Game.chars.values()].every(c => c.model), before + '->' + G.scene.children.length);
    Game.quit();
  }
  ok('no NaN bones or blade tips', nan === 0, nan + ' of ' + samples + ' samples');
  ok('blade stays in the GLB hand (< 8 cm)', worstHand < 0.08, worstHand.toFixed(3) + ' m');
  ok('bones stay attached to the body (< 2.6 m from root)', maxBoneDist < 2.6, maxBoneDist.toFixed(2) + ' m');
  ok('feet stay near the floor when standing (< 22 cm drift)', worstFoot < 0.22, worstFoot.toFixed(3) + ' m');
  ok('wide state coverage', statesSeen.size >= 6, [...statesSeen].join(','));
  // King Phase II cracks appear only in phase 2
  w.document.querySelector('[data-enc="king"]').click(); frames(2); const king = [...Game.chars.values()].find(c => c.lookKey === 'king'); const cracksVis = () => { let vis = false; king.model.cracks.traverse(o => { if (o.isMesh && o.visible) vis = true; }); return vis; };
  frames(30); const p1 = cracksVis(); king.f.phase = 2; frames(120); const p2 = cracksVis(); ok('Phase II cracks hidden in phase 1, glowing in phase 2', !p1 && p2, p1 + ' / ' + p2);
  // hit flash
  king.f.setState('hit', 0.3); frames(1); const fl = king.model.flash; frames(40); ok('hit flash fires and decays', fl > 0.4 && king.model.flash === 0, fl.toFixed(2) + ' -> ' + king.model.flash.toFixed(2));
  // toggle back to the block rig and forth
  const sc = G.scene.children.length; G.VISUAL.models = 0; frames(2); const off = [...Game.chars.values()].every(c => !c.model); G.VISUAL.models = 1; frames(2); const on = [...Game.chars.values()].every(c => !!c.model);
  ok('Tune toggle swaps models off/on cleanly', off && on && G.scene.children.length === sc);
  Game.quit();
  console.log('errors', errors.length ? errors.slice(0, 5) : 'none', 'crashed', !!Game.crashed);
  console.log(results.filter(Boolean).length + '/' + results.length + ' model checks passed'); process.exit(0);
})();
