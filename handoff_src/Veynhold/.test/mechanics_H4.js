// Chunk H4: combat mechanics (src/world_combat.js) in the real page (jsdom, world mode, seeded).
// Vitality posture curve, guard regain, charged heavy (RMB/K/pad X hold), deflect tiers, stealth polish, text, gamepad, core untouched.
const path = require('path'), fs = require('fs'), crypto = require('crypto'); const mk = require('./p1h.js'); const sleep = ms => new Promise(r => setTimeout(r, ms));
const ROOT = path.join(__dirname, '..'), FILE = path.join(ROOT, 'dist', 'index.html');
const res = []; const ok = (n, c, i) => res.push((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? ' [' + i + ']' : ''));
const near = (a, b, e) => Math.abs(a - b) <= e;
(async () => {
const H = mk({ file: FILE }), { w, G, Game, frames, key, tap, errors } = H; const A = w.VEYN_ADV, CORE = w.VEYN_CORE, M = w.VEYN_COMBAT, $ = id => w.document.getElementById(id);
ok('core.js is the chunk I1 core (md5 8b20b836…)', crypto.createHash('md5').update(fs.readFileSync(path.join(ROOT, 'src', 'core.js'))).digest('hex') === '8b20b83611f0ffb143934b32e055d5dd');
ok('world_combat loaded (window.VEYN_COMBAT)', !!M && !!M.CFG);
frames(3); w.document.getElementById('advNew').click(); frames(2); key('Space', true); key('Space', false); await sleep(30); frames(5);
const W = Game.world, p = W.player, E = A.Ents; A.Inv.give('wardblade'); const S = () => A.api.Save.data;
const clearFoes = () => { for (const e of E.list) { const c = Game.chars.get(e.f.id); if (c) c.dispose(); Game.chars.delete(e.f.id); const i = W.fighters.indexOf(e.f); if (i >= 0) W.fighters.splice(i, 1); } E.clear(); };
clearFoes(); p.x = p.px = -10; p.z = p.pz = 18; p.facing = 0; frames(2);
// a foe that stands where it is put (no brain, counted as engaged so world mode never wakes it)
const dummy = (type, x, z, face) => { const e = E.spawn(W, { id: 'd' + Math.random().toString(36).slice(2, 7), type, x, z, face: face || 0 }); e.mode = 'combat'; e.alert = 1; e.f.brain = null; return e; };
const settle = () => { p.atk = null; p.setState('idle'); p.posture = 0; p.hp = p.maxHp; p.guard = false; p.lockId = null; M.rec = 0; frames(2); };
const run = (sec, cb) => { const n = Math.round(sec * 60); for (let i = 0; i < n; i++) { frames(1); if (cb && cb(i)) return i; } return n; };

// ---------------------------------------------------------------- 1. vitality posture curve
ok('curve m: 1.0 at full health', near(M.vitM(1), 1, 1e-9)); ok('curve m: 0.35 at 25% and below', near(M.vitM(0.25), 0.35, 1e-9) && near(M.vitM(0.1), 0.35, 1e-9));
ok('curve m: ~0.567 at 50% (core gives 0.675)', near(M.vitM(0.5), 0.5667, 0.001), M.vitM(0.5).toFixed(4));
{ const e = dummy('gaoler', -10, 24, 0), f = e.f; const rate = hk => { f.hp = f.maxHp * hk; f.posture = 60; f.lastPostureHit = f.lt - 10; f.state = 'idle'; f.guard = false; const p0 = f.posture; frames(60); return (p0 - f.posture); };
  const r1 = rate(1), r50 = rate(0.5), r25 = rate(0.25), r10 = rate(0.1);
  ok('vitality: full-health regen unchanged (gaoler 10/s)', near(r1, 10, 0.4), r1.toFixed(2));
  ok('vitality: 50% health regen = base × 0.567', near(r50 / r1, 0.5667, 0.02), (r50 / r1).toFixed(3));
  ok('vitality: 25% health regen = base × 0.35 (core alone: 0.51)', near(r25 / r1, 0.35, 0.02), (r25 / r1).toFixed(3));
  ok('vitality: 10% health regen floor 0.35', near(r10 / r1, 0.35, 0.02), (r10 / r1).toFixed(3));
  f.hp = f.maxHp * 0.2; f.posture = f.postureMax - 0.5; f.lastPostureHit = f.lt - 10; let broke = false; run(1, () => { if (f.state === 'broken') broke = true; });
  ok('vitality never causes a posture break', !broke && f.posture < f.postureMax, f.posture.toFixed(2));
  // the player keeps the core curve (CFG.vit.player = false)
  settle(); p.hp = p.maxHp * 0.25; p.posture = 60; p.lastPostureHit = p.lt - 10; const pp = p.posture; frames(60); const pr = (pp - p.posture) / CORE.CONFIG.player.postureRegen;
  ok('player posture regen keeps the core curve', near(pr, 0.5125, 0.03), pr.toFixed(3));
  // a world that is not Game.world is never touched
  const w2 = new CORE.World(7); w2.addPlayer(0, -20); const g2 = w2.addEnemy('gaoler', 0, 0); g2.brain = null; g2.hp = g2.maxHp * 0.25; g2.posture = 60; g2.lastPostureHit = -99; for (let i = 0; i < 60; i++) w2.step(1 / 60);
  ok('other worlds (tests, previews) keep the core curve', near((60 - g2.posture) / 10, 0.5125, 0.02), ((60 - g2.posture) / 10).toFixed(3));
  // cues: thud + embers at 50 / 25 %, amber -> red target bar
  const c0 = M.stats.vitCues || 0; f.hp = f.maxHp; frames(2); f.hp = f.maxHp * 0.45; frames(2); f.hp = f.maxHp * 0.2; frames(2);
  ok('vitality cue fires at 50% and again at 25% health', (M.stats.vitCues || 0) - c0 === 2, (M.stats.vitCues || 0) - c0);
  ok('vitality one-time hint saved', !!S().hints.h4_vitality);
  ok('target posture bar tinted toward red at 20% health', /hue-rotate\(-/.test($('tPost').style.filter) && M.tPostK > 0.9, $('tPost').style.filter);
  f.hp = f.maxHp; frames(2); ok('target posture bar untinted at full health', $('tPost').style.filter === '', $('tPost').style.filter);
  clearFoes(); }

// ---------------------------------------------------------------- 2. guard regain
{ settle(); p.x = p.px = -10; p.z = p.pz = 18; p.facing = 0; const e = dummy('gaoler', -10, 20.2, Math.PI), f = e.f;
  const swing = k => { f.facing = Math.atan2(p.x - f.x, p.z - f.z); f.atk = null; f.setState('idle'); CORE.startAttack(W, f, k, { jitter: false }); };
  const chip = () => { key('KeyF', true); run(0.5); swing('d_over'); let got = null; run(1.5, () => { if (M.rec > 0) { got = M.rec; return true; } }); key('KeyF', false); run(0.15); return got; };
  const hp0 = p.hp; const r = chip(); const lost = hp0 - p.hp;
  ok('blocked heavy chips health into the recoverable pool', r > 0 && near(r, lost, 0.01), 'rec=' + (r || 0).toFixed(2) + ' lost=' + lost.toFixed(2));
  ok('grey segment drawn after the health bar', $('pRegain') && $('pRegain').style.display === 'block' && parseFloat($('pRegain').style.width) > 0, $('pRegain') && $('pRegain').style.width);
  ok('regain one-time hint saved', !!S().hints.h4_regain);
  // light blocks are chip-free
  { const rec0 = M.rec; settle(); key('KeyF', true); run(0.5); swing('d_slash'); run(1.4); key('KeyF', false); run(0.1); ok('a blocked light attack adds no chip', M.rec === 0 && p.hp === p.maxHp, M.rec.toFixed(2)); void rec0; }
  // a hit within 3 s restores min(rec, dmg × 0.75)
  settle(); f.atk = null; f.setState('idle'); f.posture = 0; f.hp = f.maxHp; const r2 = chip(); const hpA = p.hp, n0 = M.stats.restores; p.facing = Math.atan2(f.x - p.x, f.z - p.z);
  let dmg = 0; const st = W.step.bind(W); W.step = function (dt) { st(dt); for (const ev of W.events) if (ev.type === 'hit' && ev.a === p.id && !ev._s) { ev._s = 1; dmg += ev.dmg; } };
  tap('KeyJ'); run(0.6); W.step = st;
  ok('player hit within 3 s restores min(rec, dmg × 0.75)', M.stats.restores === n0 + 1 && near(p.hp - hpA, Math.min(r2, dmg * 0.75), 0.01), 'dmg=' + dmg + ' rec=' + (r2 || 0).toFixed(2) + ' +' + (p.hp - hpA).toFixed(2));
  // taking a hit clears it
  settle(); f.atk = null; f.setState('idle'); chip(); ok('pool present before the clean hit', M.rec > 0); swing('d_slash'); run(1.2); ok('taking a clean hit clears the pool', M.rec === 0 && p.hp < p.maxHp, M.rec);
  // drains after 3 s
  settle(); f.atk = null; f.setState('idle'); chip(); const rD = M.rec; run(2.5); const mid = M.rec; run(1.3); ok('pool holds for 3 s, then drains away', near(mid, rD, 1e-6) && M.rec === 0, rD.toFixed(2) + ' -> ' + mid.toFixed(2) + ' -> ' + M.rec.toFixed(2));
  ok('grey segment hidden once drained', $('pRegain').style.display === 'none');
  // deathblow restores all
  settle(); f.atk = null; f.setState('idle'); chip(); const rB = M.rec, hpB = p.hp; f.hp = f.maxHp; CORE.addPosture(W, f, 1e5); frames(2); p.facing = Math.atan2(f.x - p.x, f.z - p.z); tap('KeyE'); run(0.3);
  ok('a deathblow restores the whole pool', rB > 0 && M.rec === 0 && near(p.hp - hpB, rB, 0.01), (p.hp - hpB).toFixed(2) + ' of ' + rB.toFixed(2));
  run(4); clearFoes(); }

// ---------------------------------------------------------------- 3. charged heavy
{ settle(); p.x = p.px = -10; p.z = p.pz = 18; p.facing = 0;
  const strike = (holdS, type, guard) => { // returns { su, tStrike (s from start), ev, post (posture gained), st, dur }
    clearFoes(); settle(); const e = dummy(type || 'gaoler', -10, 20.0, guard ? Math.PI : 0), f = e.f; if (guard) { f.guard = true; f.setState('guard'); } p.facing = 0; frames(1);
    const ev = []; const st = W.step.bind(W); let t = 0, strikeAt = -1, fst = null, fdur = 0; W.step = function (dt) { const n0 = W.events.length; st(dt); t += dt;
      for (let i = n0; i < W.events.length; i++) { const x = W.events[i]; if (x.a === p.id && (x.type === 'hit' || x.type === 'block' || x.type === 'guardbreak')) { if (strikeAt < 0) { strikeAt = t; fst = f.state; fdur = f.stateDur; } ev.push(x.type); } }
      if (guard && f.state === 'guard') f.guard = true; };
    const pre = f.posture; key('KeyK', true); let held = 0, info = null; if (holdS > 0) { run(holdS, () => { held++; if (!info && M.chg && M.chg.charged && M.chg.t > 0.75) info = { vis: M.visT, t: p.atk && p.atk.t, su: p.atk && p.atk.su, chain: $('chain').textContent, ring: $('chargeRing').style.display, cls: $('chargeRing').className }; }); } else frames(1);
    const tRel = t; key('KeyK', false); run(1.6); W.step = st; const chg = M.chg;
    return { strikeAt, rel: tRel, ev, post: f.posture - pre, fst, fdur, charged: chg && chg.charged, info, f, chg }; };
  // a clean hit is reported up to lateGrace (0.07 s) after the strike frame, so compare against the tap
  const tapR = strike(0); ok('tap K: normal heavy, hit reported at su + late grace (0.46 + 0.07 s)', near(tapR.strikeAt, 0.53, 0.03) && !tapR.charged && !tapR.chg.clamped, tapR.strikeAt.toFixed(3));
  const sh = strike(0.4); ok('hold 0.4 s: windup held, strike ≈ release + su/2, not charged', near(sh.strikeAt - sh.rel, tapR.strikeAt - 0.23, 0.035) && !sh.charged && sh.chg.clamped, (sh.strikeAt - sh.rel).toFixed(3));
  const ch = strike(1.0); ok('hold 1.0 s: CHARGED, windup parked at su×0.5', ch.charged && ch.info && near(ch.info.t, ch.info.su * 0.5, 0.02), ch.info && ch.info.t.toFixed(3));
  ok('held heavy: the pose winds on to a full windup (0.88·su) while the sim stays parked', ch.info && near(ch.info.vis, ch.info.su * 0.88, 0.01) && ch.info.t < ch.info.su * 0.5, ch.info && (ch.info.vis || 0).toFixed(3));
  ok('charged: #chain shows CHARGED, heavy charge ring shown', ch.info && ch.info.chain === 'CHARGED' && ch.info.ring === 'block' && /h4heavy/.test(ch.info.cls), JSON.stringify(ch.info));
  ok('charged: strike lands ≈ su/2 after release', near(ch.strikeAt - ch.rel, tapR.strikeAt - 0.23, 0.035), (ch.strikeAt - ch.rel).toFixed(3));
  ok('charged hit: +24 posture over a plain heavy hit', ch.ev[0] === 'hit' && tapR.ev[0] === 'hit' && near(ch.post - tapR.post, 24, 0.6), 'charged ' + ch.post.toFixed(1) + ' plain ' + tapR.post.toFixed(1));
  ok('charged hit: light foe stunned longer (+0.35 s)', ch.fst === 'hit' && tapR.fst === 'hit' && near(ch.fdur - tapR.fdur, 0.35, 0.01), ch.fdur.toFixed(2) + ' vs ' + tapR.fdur.toFixed(2));
  const pb = strike(0, 'gaoler', true), cb = strike(1.0, 'gaoler', true);
  ok('charged block: +30 posture over a plain blocked heavy', cb.ev[0] === 'block' && pb.ev[0] === 'block' && near(cb.post - pb.post, 30, 0.6), 'charged ' + cb.post.toFixed(1) + ' plain ' + pb.post.toFixed(1));
  ok('charged block: light foe recoils 0.7 s', cb.fst === 'recoil' && near(cb.fdur, 0.7, 0.001), cb.fst + ' ' + cb.fdur);
  const bb = strike(1.0, 'brute', true); ok('charged block: heavy foe (Chain Gaoler) does not recoil', bb.ev[0] === 'block' && bb.fst !== 'recoil', bb.fst);
  const lg = strike(2.6); ok('hold longer than 2 s auto-releases', lg.strikeAt > 0 && lg.strikeAt < 2.6, lg.strikeAt.toFixed(2));
  // RMB (mouse) also charges
  clearFoes(); settle(); const cv = $('c'); cv.dispatchEvent(new w.MouseEvent('mousedown', { button: 2, bubbles: true })); run(0.8); const rm = M.chg && M.chg.charged && p.atk && p.atk.def.key === 'p_h';
  w.dispatchEvent(new w.MouseEvent('mouseup', { button: 2, bubbles: true })); run(1.5); ok('RMB hold charges the heavy', rm);
  ok('charge hint shown after the second plain heavy (one time)', !!S().hints.h4_charge && M.plainHeavies >= 2, M.plainHeavies);
  ok('CHARGED text cleared after the swing', $('chain').textContent !== 'CHARGED' || $('chain').style.opacity === '0', $('chain').textContent + ' ' + $('chain').style.opacity); }

// ---------------------------------------------------------------- 4. deflect tiers (presentation only)
{ clearFoes(); settle(); const e = dummy('gaoler', -10, 20.0, Math.PI), f = e.f; frames(2);
  const Cm = G.Cam, at0 = Cm.addTrauma.bind(Cm); let trauma = 0; Cm.addTrauma = a => { trauma += a; return at0(a); };
  const fire = (q, d) => { trauma = 0; M.lastFlash = null; M.lastTierPitch = null; W.events.push({ type: 'deflect', a: d === p ? f.id : p.id, d: d.id, x: p.x, z: p.z + 1, heavy: false, offset: q === 'late' ? 0.03 : -0.01, quality: q, key: 'd_slash', t: W.time }); Game.handleEvents(); return { trauma, flash: M.lastFlash, pitch: M.lastTierPitch }; };
  const good = fire('good', p), perf = fire('perfect', p), late = fire('late', p), enemyPerf = fire('perfect', f);
  ok('perfect deflect: camera kick ×1.7', near(perf.trauma / good.trauma, 1.7, 0.01), (perf.trauma / good.trauma).toFixed(3));
  ok('perfect deflect: light ×1.5, pitch 1.12', perf.flash && perf.flash.tier === 'perfect' && near(perf.flash.power, 5 * 1.5, 1e-6) && perf.pitch === 1.12, JSON.stringify(perf.flash) + ' ' + perf.pitch);
  ok('late deflect: kick ×0.45', near(late.trauma / good.trauma, 0.45, 0.01), (late.trauma / good.trauma).toFixed(3));
  ok('late deflect: light ×0.5 in dull orange, pitch 0.85', late.flash && near(late.flash.power, 2.5, 1e-6) && late.flash.color === 0xb0602a && late.pitch === 0.85, JSON.stringify(late.flash));
  ok('good deflect and enemy deflects are unchanged', good.flash === null && good.pitch === null && enemyPerf.flash === null && near(enemyPerf.trauma, good.trauma, 1e-9));
  ok('late deflect hint saved (one time)', !!S().hints.h4_late);
  Cm.addTrauma = at0;
  // a real deflect in the sim still reports its quality and is tiered
  settle(); f.facing = Math.atan2(p.x - f.x, p.z - f.z); CORE.startAttack(W, f, 'd_slash', { jitter: false }); const su = f.atk.su; const n0 = M.stats.perfect + M.stats.late; let fired = false;
  run(1.2, i => { if (!fired && f.atk && f.atk.t >= su - 0.03) { fired = true; tap('KeyF'); } }); ok('a real deflect in play goes through the tier path', fired && M.stats.perfect + M.stats.late === n0 + 1, (M.stats.perfect + M.stats.late - n0) + ' perfect=' + M.stats.perfect + ' late=' + M.stats.late);
  clearFoes(); }

// ---------------------------------------------------------------- 5. stealth polish
{ settle(); S().flags.tut_stealth = true; p.x = p.px = -10; p.z = p.pz = 18; frames(2);
  p.z = p.pz = 17.7; const e = E.spawn(W, { id: 'st1', type: 'gaoler', x: -10, z: 20, face: 0 }); e.alert = 0; // facing away (+z), player 2.3 m behind
  const c0 = M.stats.stealthCues; run(0.05); ok('stealth: target found, cue played once', M.stl === e && M.stats.stealthCues === c0 + 1, M.stats.stealthCues - c0);
  ok('stealth: prompt pops (h4stl) and the hint is saved', /h4stl/.test($('advPrompt').className) && !!S().hints.h4_stealth, $('advPrompt').className);
  run(0.05); ok('stealth: no repeat cue while the same target stays available', M.stats.stealthCues === c0 + 1);
  tap('KeyE'); run(0.2); ok('stealth: unseen deathblow -> muffled kill layer', (M.stats.stealthKills || 0) === 1 && e.unseen, M.stats.stealthKills);
  await sleep(500); frames(2); const dark = (() => { const D = G.FX.dust; let n = 0; for (let i = 0; i < D.n; i++) if (D.life[i] > 0 && D.base[i * 3] < 0.08 && D.base[i * 3 + 2] < 0.08) n++; return n; })();
  ok('stealth: ink puff spawned at the body', dark >= 10, dark);
  run(4); }

// ---------------------------------------------------------------- 6. gamepad: X = heavy on press, hold to charge; A = light on release, hold = charged thrust
{ clearFoes(); settle(); const pad = { connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }; w.navigator.getGamepads = () => [pad];
  pad.buttons[2].pressed = true; frames(2); ok('pad X press starts the heavy at once', p.atk && p.atk.def.key === 'p_h', p.atk && p.atk.def.key); run(0.8); ok('pad X held charges it', M.chg && M.chg.charged); pad.buttons[2].pressed = false; run(1.6);
  settle(); pad.buttons[0].pressed = true; frames(1); pad.buttons[0].pressed = false; frames(2); ok('pad A tap = light', p.atk && p.atk.def.key === 'p_l1', p.atk && p.atk.def.key); run(1.2);
  settle(); pad.buttons[0].pressed = true; frames(1); await sleep(420); frames(1); pad.buttons[0].pressed = false; frames(2); ok('pad A hold = charged thrust', p.atk && p.atk.def.key === 'p_hc', p.atk && p.atk.def.key); run(1.2);
  w.navigator.getGamepads = () => []; frames(2); }

// ---------------------------------------------------------------- 7. text and controls
{ const html = fs.readFileSync(FILE, 'utf8');
  ok('hints panel: hold RMB to charge, grey health', /hold RMB<\/b>charged heavy/.test(html) && /grey health/i.test(html));
  ok('How to fight: charged heavy, guard regain, vitality, late vs perfect, unseen', /hold right click/i.test(html) && /grey/i.test(html) && /wounded foe/i.test(html) && /Late deflects/i.test(html) && /unseen/i.test(html));
  ok('pause Controls + weapon hint mention the charge', /Heavy attack \(hold to charge/.test(html) && /right click: heavy \(hold to charge\)/.test(html));
  ok('stealth tutorial line is no longer empty', !/stealth: '' \}/.test(html)); }

const errs = errors.filter(e => !/WebGL|getContext/.test(e)); ok('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(res.join('\n')); const nf = res.filter(r => r.startsWith('FAIL')).length; console.log(nf ? nf + ' FAILED' : 'ALL ' + res.length + ' PASSED'); process.exit(nf ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
