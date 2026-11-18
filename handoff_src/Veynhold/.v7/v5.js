// v5 presentation checks: new families/stances/tracks, no NaN poses, no snaps on cancels, spin continuity, glint vs feint,
// deathblow variants, King awakening track, projectile visuals, chain HUD.
process.env.VEYN_MODELS = '1';
const H = require('./harness.js'); const { w, G, Game, frames, key, tap, errors } = H; const C = w.VEYN_CORE;
const res = []; const ok = (n, p, i) => { res.push(p); console.log((p ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? ' [' + i + ']' : '')); };
const wait = () => new Promise(r => { const t = () => { const s = w.VEYN_MODELS.status(); if (s.ready === s.total || s.failed) r(); else setTimeout(t, 20); }; t(); });
const finite = P => Object.values(P).every(Number.isFinite);
(async () => {
  await wait();
  // 1) every stance x style x kind family is finite and distinct from its stance
  { let bad = 0, n = 0; const styles = ['overhead', 'overheadHeavy', 'sideR', 'sideL', 'thrust', 'sweep', 'grab', 'spin', 'rising', 'dashCut', 'runThrust', 'plunge', 'riposte', 'wave'];
    for (const sk of Object.keys(G.STANCES)) for (const st of styles) for (const kd of ['light', 'heavy', 'danger']) { const F = G.famFor(sk, st, kd); n++; for (const k of ['A', 'W', 'S', 'O', 'F']) if (!finite(F[k])) bad++; }
    ok('all ' + n + ' attack families (stance × style × kind) are finite', bad === 0, bad + ' bad'); }
  { const S = G.STANCES; const d = (a, b) => Object.keys(a).reduce((s, k) => s + Math.abs(a[k] - b[k]), 0);
    ok('each enemy has a visibly distinct stance', ['duelist', 'warden', 'brother', 'king', 'king2'].every(k => d(S[k], S.player) > 1.5), ['duelist', 'warden', 'brother', 'king', 'king2'].map(k => k + ' ' + d(S[k], S.player).toFixed(1)).join(', ')); }
  // 2) random brawls across every encounter: pose stays finite and never snaps between frames
  const encs = ['duelist', 'warden', 'brother', 'king', 'pair'];
  let nan = 0, worst = 0, worstWhere = '', samples = 0; const execV = new Set(), vicV = new Set(); let sawAwaken = false;
  for (const enc of encs) {
    w.document.querySelector(`[data-enc="${enc}"]`).click(); frames(2); const W = Game.world; tap('KeyQ'); let r = 11; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
    const prev = new Map(); key('KeyW', true);
    frames(60 * 30, i => {
      if (i % 17 === 0) { const k = ['KeyJ', 'KeyJ', 'KeyK', 'KeyF', 'Space', 'KeyC', 'KeyE', 'ShiftLeft'][Math.floor(rnd() * 8)]; key(k, true); H._k = k; } if (i % 17 === 4 && H._k) key(H._k, false);
      W.player.hp = Math.max(W.player.hp, 40); if (i === 900) for (const e of W.enemies()) C.addPosture(W, e, 1e4);
      for (const c of Game.chars.values()) { const P = c.pose; samples++; if (!finite(P)) nan++;
        if (c.f.state === 'deathblowExec') execV.add(c.execVariant()); if (c.f.state === 'deathblowed') vicV.add(c.victimVariant()); if (c.f.state === 'transition') sawAwaken = true;
        const kk = c.f.state + ':' + (c.f.atk ? c.f.atk.id : ''), q = prev.get(c); const since = q && q.kk === kk ? q.since + 1 : 0; if (q && !c.f.frozen && since <= 3 && q.kk !== undefined && (since > 0 || q.kk !== kk)) { let m = 0, mk = ''; if (c.f.state === 'guard' || c.f.reactKind === 'deflect' || c.f.state === 'hit') { prev.set(c, { p: Object.assign({}, P), st: c.f.state, kk, since }); continue; } for (const k in P) { if (k === 'yaw') continue; const dd = Math.abs(P[k] - q.p[k]); if (dd > m) { m = dd; mk = k; } }
          if (m > worst) { worst = m; worstWhere = c.lookKey + ' ' + q.st + '→' + c.f.state + ' ' + mk + ' ' + (c.f.atk ? c.f.atk.def.key + ' t=' + c.f.atk.t.toFixed(3) + ' su=' + c.f.atk.su.toFixed(2) : '') + ' since ' + since; } }
        prev.set(c, { p: Object.assign({}, P), st: c.f.state, kk, since }); }
    });
    key('KeyW', false); Game.quit();
  }
  ok('poses stay finite through 5 random 30 s brawls', nan === 0, nan + ' / ' + samples);
  ok('no joint jumps > 0.75 rad/frame in the first frames after any state/attack change', worst < 0.75, worst.toFixed(2) + ' rad @ ' + worstWhere);
  ok('deathblows pick per-enemy executions', execV.size >= 2, [...execV].join(','));
  ok('victims play their own deathblow reaction', vicV.size >= 2, [...vicV].join(','));
  // 3) forced: every execution + victim track + the King's awakening
  { const seen = []; for (const enc of ['duelist', 'warden', 'brother', 'king']) { w.document.querySelector(`[data-enc="${enc}"]`).click(); frames(2); const W = Game.world, e = W.enemies()[0];
      e.x = W.player.x; e.z = W.player.z + 2; C.addPosture(W, e, 1e4); frames(3); tap('KeyE'); frames(10); const pc = Game.chars.get(W.player.id), ec = Game.chars.get(e.id);
      seen.push(pc.execVariant() + '/' + ec.victimVariant() + ':' + W.player.state); frames(90);
      if (enc === 'king') { const st = e.state; frames(150); seen.push('king→' + st + ' then ' + e.state + ' ph' + e.phase); }
      Game.quit(); }
    ok('each enemy gets its own execution + reaction; King mark 1 → awakening', seen.join(' ').includes('duelist/duelist') && seen.join(' ').includes('warden/warden') && seen.join(' ').includes('brother/brother') && seen.join(' ').includes('king1/king1') && /transition|ph2/.test(seen.join(' ')), seen.join(' | ')); }
  // 4) spin finisher turns the body a full turn and lands where it began
  { w.document.querySelector('[data-enc="duelist"]').click(); frames(2); const W = Game.world; W.enemies()[0].x = 30; const pc = Game.chars.get(W.player.id); let minYaw = 0, endYaw = null;
    C.startAttack(W, W.player, 'p_l4'); for (let i = 0; i < 90; i++) { frames(1); minYaw = Math.min(minYaw, pc.pose.yaw); if (W.player.state !== 'attack' && endYaw === null) endYaw = pc.pose.yaw; }
    ok('spin finisher rotates a full turn and returns to facing', minYaw < -6 && Math.abs(endYaw || 0) < 0.05, 'min ' + minYaw.toFixed(2) + ' end ' + (endYaw || 0).toFixed(3));
    // 5) glint fires on delayed strikes, never on feints
    const audioCalls = []; const orig = G.Game && w.VEYN_GAME; let glints = 0; const ec = Game.chars.get(W.enemies()[0].id); W.enemies()[0].x = 0; W.enemies()[0].z = 3; W.enemies()[0].brain.update = () => {};
    const spy = c => { let n = 0; const o = c.update.bind(c); return () => n; };
    const fx0 = G.FX.ring; G.FX.ring = function (pos, col, sc, dur) { if (col === 0xffffff && sc === 2.2) glints++; return fx0.apply(this, arguments); };
    C.startAttack(W, W.enemies()[0], 'd_delay'); frames(110); const g1 = glints; Game.quit();
    w.document.querySelector('[data-enc="brother"]').click(); frames(2); const W2 = Game.world; const b = W2.enemies()[0]; b.brain.update = () => {}; C.startAttack(W2, b, 'f_feint'); frames(80); const g2 = glints - g1; G.FX.ring = fx0; Game.quit();
    ok('delayed strike glints once; feint never glints', g1 === 1 && g2 === 0, g1 + ' / ' + g2); }
  // 6) Crimson Arc visuals spawn and clean up
  { w.document.querySelector('[data-enc="king"]').click(); frames(2); const W = Game.world, k = W.enemies()[0]; k.phase = 2; k.brain.update = () => {}; k.z = W.player.z + 8; W.player.hp = 1e4;
    C.startAttack(W, k, 'k2_wave', { jitter: false }); let maxLive = 0; for (let i = 0; i < 150; i++) { frames(1); maxLive = Math.max(maxLive, G.Projectiles.live.size); }
    ok('Crimson Arc mesh appears and is removed afterwards', maxLive === 1 && G.Projectiles.live.size === 0, maxLive + ' → ' + G.Projectiles.live.size); Game.quit(); }
  // 7) chain HUD
  { w.document.querySelector('[data-enc="duelist"]').click(); frames(2); Game.world.enemies()[0].x = 30; const seen = new Set();
    for (let n = 0; n < 4; n++) { tap('KeyJ'); for (let i = 0; i < 22; i++) { frames(1); const t = w.document.getElementById('chain').textContent; if (t) seen.add(t); } }
    ok('chain HUD shows ◆ pips up to the 4-hit finisher', seen.has('◆◆◆◆') && seen.has('◆◇◇◇'), [...seen].join(' ')); Game.quit(); }
  console.log('errors', errors.length ? errors.slice(0, 5) : 'none', 'crashed', !!Game.crashed);
  console.log(res.filter(Boolean).length + '/' + res.length + ' v5 checks passed'); process.exit(0);
})();
