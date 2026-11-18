// v6 checks: practice mode + coach, deflect quality presentation, persistence, grade/best, gamepad, adaptive quality,
// new encounters, mirror, arc warning, pause info, practice-this-foe.
const H = require('./harness.js'); const { w, G, Game, frames, key, tap, errors } = H; const C = w.VEYN_CORE;
const res = []; const ok = (n, p, i) => { res.push(p); console.log((p ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? ' [' + i + ']' : '')); };
const $ = id => w.document.getElementById(id);
if (!w.localStorage) { const mem = {}; Object.defineProperty(w, 'localStorage', { value: { getItem: k => k in mem ? mem[k] : null, setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } } }); }
const tapEv = (W, fn) => { const o = W.emit.bind(W); W.emit = ev => { fn(ev); return o(ev); }; }; const click = enc => { w.document.querySelector(`[data-enc="${enc}"]`).click(); frames(2); };
// 1) practice dummy
click('practice'); { const W = Game.world, e = W.enemies()[0]; ok('Practice Dummy starts with the Training Shade', e.profile.trainer && $('practice').style.display === 'block', e.name);
  const seen = new Set(), s2 = new Set(); let coachTexts = new Set(); W.player.hp = 1e5; W.player.maxHp = 1e5; let sink = seen; tapEv(W, ev => { if (ev.type === 'attackStart') sink.add(ev.key); });
  frames(60 * 25, () => { const t = $('coach').textContent; if ($('coach').style.opacity === '1' && t) coachTexts.add(t); });
  ok('Shade swings thrust, sweep and grab', seen.has('d_thrust') && seen.has('d_sweep') && seen.has('w_grab'), [...seen].join(','));
  ok('coach reacts to what happens (≥3 different lines)', coachTexts.size >= 3, [...coachTexts].slice(0, 4).join(' | '));
  tap('Digit1'); ok('key 1 toggles perilous-only', Game.training.perilous && /perilous only: <b>on/.test($('practice').innerHTML)); sink = s2;
  frames(60 * 12); ok('perilous-only swings only perilous', [...s2].every(k => C.ATTACKS[k].danger) && s2.size > 0, [...s2].join(','));
  tap('Digit1'); tap('Digit3'); const n0 = W.atkCounter; frames(60 * 6); ok('key 3 pauses the Shade', W.atkCounter === n0 || (e.atk && W.atkCounter - n0 <= 1), (W.atkCounter - n0) + ' swings'); tap('Digit3');
  tap('Digit2'); frames(30); ok('key 2 makes the Shade hold guard', e.guard || e.state === 'attack', e.state); tap('Digit2');
  C.addPosture(W, e, 1e4); e.x = W.player.x; e.z = W.player.z + 2; frames(2); tap('KeyE'); frames(120); ok('Shade survives deathblows (practice never ends)', !W.over && !e.dead && e.hp === e.maxHp, W.over + ' ' + e.hp); }
// 2) deflect quality HUD: drive a perfect, a good and a late press
{ const W = Game.world, e = W.enemies()[0], p = W.player; Game.training.paused = true; e.brain.update = () => {}; const flashes = [];
  for (const rel of [0.02, 0.12, -0.04]) { e.x = p.x; e.z = p.z + 2; e.facing = Math.PI; p.facing = 0; frames(40); C.startAttack(W, e, 'd_slash', { jitter: false }); const su = e.atk.su; const t0 = W.time; let pressed = false;
    frames(80, () => { if (!pressed && W.time >= t0 + su - rel - 0.0001) { key('KeyF', true); pressed = true; } }); key('KeyF', false); frames(30); flashes.push($('flash').textContent); }
  ok('HUD shows PERFECT / DEFLECT / LATE by quality', flashes.join(',') === 'PERFECT,DEFLECT,LATE', flashes.join(','));
  Game.quit(); }
// 3) persistence
{ G.Settings.quality = 'low'; G.Settings.volume = 0.33; G.Store.data.seenTutorial = true; G.Store.save(); const raw = w.localStorage.getItem('veynhold_v6'); const d = JSON.parse(raw || '{}');
  ok('settings saved to localStorage veynhold_v6', d.quality === 'low' && d.volume === 0.33 && d.seenTutorial === true, raw && raw.slice(0, 80));
  G.Settings.quality = 'high'; G.Store.load(); ok('settings load back', G.Settings.quality === 'low' && G.Settings.volume === 0.33); G.Store.data.seenTutorial = false; G.Store.save(); }
// 4) soft tutorial on first Duelist fight
click('duelist'); { const W = Game.world, e = W.enemies()[0]; ok('first Duelist fight starts slower and coached', e.tempoMult === 1.25 && G.Coach.on && Game.softT > 19, e.tempoMult + ' ' + G.Coach.on);
  W.player.hp = W.player.maxHp = 1e5; frames(60 * 21); W.player.maxHp = 100; ok('soft tutorial ends after 20 s and is remembered', e.tempoMult === 1 && !G.Coach.on && G.Store.data.seenTutorial, e.tempoMult + ' ' + G.Store.data.seenTutorial);
  // 5) win → grade + best on title
  W.player.stats.perfect = 5; W.player.stats.good = 2; W.player.hp = 100; for (const en of W.enemies()) { C.addPosture(W, en, 1e4); en.x = W.player.x; en.z = W.player.z + 2; } frames(2); tap('KeyE'); frames(200); if (W.over) Game.endEncounter(W.over === 'victory');
  ok('victory shows a grade and the deflect breakdown', Game.state === 'victory' && /class="grade"/.test($('winStats').innerHTML) && /perfect \/ good \/ late/.test($('winStats').innerHTML), Game.state + ' ' + $('winStats').textContent.slice(0, 60));
  Game.quit(); const best = w.document.querySelector('[data-enc="duelist"] .best'); ok('title shows best time + grade', best && /Best \d+:\d\d · [SABC]/.test(best.textContent), best && best.textContent); }
// 6) new encounters + mirror + pause info
click('duowarden'); ok('Blade and Wall = Duelist + Warden', Game.world.enemies().map(e => e.profile.look).sort().join() === 'duelist,warden'); Game.quit();
$('mirrorChk').checked = true; $('mirrorChk').dispatchEvent(new w.Event('change')); click('warden'); ok('Mirror challenge cuts health and posture 20%', Game.world.player.maxHp === 80 && Game.world.player.postureMax === 80, Game.world.player.maxHp);
tap('Escape'); frames(2); ok('pause shows encounter (and mirror)', /Iron Warden/.test($('pauseInfo').textContent) && /Mirror/.test($('pauseInfo').textContent), $('pauseInfo').textContent); tap('Escape'); frames(2);
$('mirrorChk').checked = false; $('mirrorChk').dispatchEvent(new w.Event('change'));
// 7) practice this foe from the death screen
{ const W = Game.world; W.player.hp = 0.1; for (const e of W.enemies()) { e.brain.update = () => {}; C.startAttack(W, e, 'w_swing', { jitter: false }); e.x = W.player.x; e.z = W.player.z + 2; } frames(120); W.player.hp = 0; W.player.dead = true; W.player.setState('dead', 99); frames(10); if (W.over) Game.endEncounter(false);
  ok('death screen offers Practice this foe', Game.state === 'dead' && $('practiceBtn').style.display !== 'none', Game.state); $('practiceBtn').click(); frames(3);
  const e = Game.world.enemies()[0]; ok('practice uses that foe\'s look and moves', Game.enc === 'practice' && e.profile.look === 'warden' && e.profile.lesson.some(l => l[0] === 'w_grab'), e.name + ' ' + e.profile.lesson.length); Game.quit(); }
// 8) gamepad
{ click('duelist'); const W = Game.world; let pad = { connected: true, axes: [0, -1, 0.6, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
  w.navigator.getGamepads = () => [pad]; const yaw0 = G.Cam.yaw; frames(30); ok('left stick moves, right stick turns camera', W.player.moveSpeed > 1 && G.Cam.yaw !== yaw0, W.player.moveSpeed.toFixed(2));
  pad.axes = [0, 0, 0, 0]; frames(30); pad.buttons[0].pressed = true; frames(1); pad.buttons[0].pressed = false; frames(1); ok('A = light attack', W.player.atk && W.player.atk.def.key === 'p_l1', W.player.atk && W.player.atk.def.key); frames(60);
  pad.buttons[5].pressed = true; frames(3); ok('RB = deflect/guard', W.player.state === 'guard' && W.player.guard, W.player.state); pad.buttons[5].pressed = false; frames(20);
  pad.buttons[2].pressed = true; frames(1); pad.buttons[2].pressed = false; frames(1); ok('X tap = heavy', W.player.atk && W.player.atk.def.key === 'p_h', W.player.atk && W.player.atk.def.key); frames(90);
  pad.buttons[9].pressed = true; frames(1); pad.buttons[9].pressed = false; frames(1); ok('Start pauses', Game.state === 'paused', Game.state); pad.buttons[9].pressed = true; frames(1); pad.buttons[9].pressed = false; frames(1);
  w.navigator.getGamepads = () => []; frames(2); Game.quit(); }
// 9) adaptive quality
{ click('duelist'); G.Settings.quality = 'medium'; G.Perf.stepped = false; G.Perf.playT = 0; for (let i = 0; i < 200; i++) G.Perf.update(1 / 25, true);
  ok('sustained < 40 fps steps quality down once with a toast', G.Settings.quality === 'low' && /Quality lowered/.test($('toast').textContent), G.Settings.quality);
  G.Settings.quality = 'medium'; for (let i = 0; i < 200; i++) G.Perf.update(1 / 25, true); ok('…only once per session', G.Settings.quality === 'medium'); G.Settings.quality = 'low'; G.TIERS && ok('Low tier: no cloth, no shadows, pixel ratio ≤ 1, fewer particles', !G.TIERS.low.cloth && !G.TIERS.low.shadows && G.TIERS.low.pr <= 1 && G.TIERS.low.particles < 1); Game.quit(); }
// 10) Crimson Arc ground warning
{ click('king'); const W = Game.world, k = W.enemies()[0]; k.phase = 2; k.brain.update = () => {}; k.z = W.player.z + 8; W.player.hp = 1e4; C.startAttack(W, k, 'k2_wave', { jitter: false }); let warned = false, early = false;
  frames(90, () => { const m = G.Projectiles.warn.get(k.id); if (m && m.visible && m.material.opacity > 0.1) { warned = true; if (k.atk && k.atk.su - k.atk.t > 0.32) early = true; } });
  ok('Crimson Arc flashes a ground warning in the last 0.3 s', warned && !early); Game.quit(); }
console.log('errors', errors.length ? errors.slice(0, 5) : 'none', 'crashed', !!Game.crashed);
console.log(res.filter(Boolean).length + '/' + res.length + ' v6 checks passed'); process.exit(0);
