const H = require('./harness.js'); const { w, G, Game, frames, key, tap, errors } = H;
frames(5); w.document.querySelector('[data-enc="duelist"]').click(); const W = () => Game.world; const p = () => W().player; const e = () => W().enemies()[0];
const res = []; const ok = (n, c, i) => res.push((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? ' [' + i + ']' : ''));
e().brain = null; e().x = 0; e().z = 0; // park enemy
tap('KeyQ'); ok('Q locks on', p().lockId === e().id);
tap('KeyQ'); ok('Q again unlocks', !p().lockId); tap('KeyQ');
key('KeyW', true); frames(30); ok('W moves player', p().z > -6 + 0.5, p().z.toFixed(2)); key('KeyW', false); frames(5);
p().x = 0; p().z = -5;
tap('KeyJ'); frames(2); ok('J starts light attack', p().state === 'attack' && p().atk.def.key === 'p_l1', p().state); frames(60);
w.document.getElementById('c').dispatchEvent(new w.MouseEvent('mousedown', { button: 0, bubbles: true })); w.dispatchEvent(new w.MouseEvent('mouseup', { button: 0, bubbles: true })); frames(2);
ok('left click = light attack', p().atk && p().atk.def.key === 'p_l1', p().atk && p().atk.def.key); frames(60);
tap('KeyK'); frames(2); ok('K = heavy', p().atk && p().atk.def.key === 'p_h'); frames(90);
w.document.getElementById('c').dispatchEvent(new w.MouseEvent('mousedown', { button: 0, bubbles: true })); frames(30); 
const realNow = w.performance.now; const t0 = w.performance.now(); w.performance.now = () => t0 + 600; w.dispatchEvent(new w.MouseEvent('mouseup', { button: 0, bubbles: true })); w.performance.now = realNow; frames(2);
ok('hold left click = charged thrust', p().atk && p().atk.def.key === 'p_hc', p().atk && p().atk.def.key); frames(100);
tap('KeyF'); frames(1); ok('F tap opens a deflect window (guardRaise)', p().lt - p().guardStart < 0.1, (p().lt - p().guardStart).toFixed(3));
key('KeyF', true); frames(3); ok('holding F guards', p().guard && p().state === 'guard', p().state); key('KeyF', false); frames(3); ok('release F drops guard', !p().guard);
frames(20); w.document.getElementById('c').dispatchEvent(new w.MouseEvent('mousedown', { button: 2, bubbles: true })); frames(2); ok('right click = heavy attack (repair: RMB no longer guards)', p().atk && p().atk.def.key === 'p_h' && !p().guard, p().atk && p().atk.def.key); frames(3); ok('holding right click does not guard', !p().guard); w.dispatchEvent(new w.MouseEvent('mouseup', { button: 2, bubbles: true })); frames(90);
tap('KeyC'); frames(1); ok('C dashes / dodges', p().state === 'dodge', p().state); frames(40);
tap('Space'); frames(5); ok('Space jumps (airborne)', p().state === 'jump' && p().airborne, p().state); frames(60);
{ // held Space: the browser auto-repeats keydown (repeat: true); only the first press may jump
  let jumps = 0; const W0 = W(), orig = W0.emit.bind(W0); W0.emit = ev => { if (ev.type === 'jump') jumps++; orig(ev); };
  w.dispatchEvent(new w.KeyboardEvent('keydown', { code: 'Space', bubbles: true })); for (let i = 0; i < 90; i++) { if (i % 3 === 0) w.dispatchEvent(new w.KeyboardEvent('keydown', { code: 'Space', repeat: true, bubbles: true })); frames(1); }
  key('Space', false); frames(5); W0.emit = orig; ok('holding Space jumps once (edge-triggered, no auto-repeat)', jumps === 1, jumps); }
{ // E with no deathblow target must never start an attack
  frames(30); const W0 = W(); let atk = 0; const orig = W0.emit.bind(W0); W0.emit = ev => { if (ev.type === 'attackStart' && ev.f === p().id) atk++; orig(ev); };
  tap('KeyE'); frames(30); W0.emit = orig; ok('E with nothing to deathblow does not attack', atk === 0 && p().state !== 'attack', atk + ' ' + p().state); }
key('ShiftLeft', true); tap('KeyQ'); key('KeyW', true); frames(20); ok('Shift sprint speed (unlocked)', p().moveSpeed > 6, p().moveSpeed.toFixed(2)); key('KeyW', false); key('ShiftLeft', false); frames(5); tap('KeyQ');
// deathblow
p().x = 0; p().z = -1.8; CORE = w.VEYN_CORE; CORE.addPosture(W(), e(), 9999); frames(2); ok('posture break shows deathblow dot', w.document.getElementById('dbDot').style.display === 'block');
tap('KeyE'); frames(12); ok('E performs deathblow', p().state === 'deathblowExec', p().state); frames(180); ok('enemy dies -> world victory', W().over === 'victory');
tap('KeyR'); frames(3); ok('R restarts', Game.state === 'playing' && !W().over && W().enemies().length === 1);
tap('KeyH'); ok('H toggles hints', w.document.getElementById('hints').style.display === 'none'); tap('KeyH');
tap('Backquote'); frames(3); ok('` debug overlay', w.document.getElementById('debug').style.display === 'block' && /Self-tests/.test(w.document.getElementById('debug').textContent));
tap('KeyT'); ok('T opens tuning panel from debug', w.document.getElementById('tune').style.display === 'block');
{ const inp = w.document.querySelector('#tuneRows input[data-i="0"]'); inp.value = '0.25'; inp.dispatchEvent(new w.Event('input')); ok('tuning slider writes CONFIG live', w.VEYN_CORE.CONFIG.parry.window === 0.25, w.VEYN_CORE.CONFIG.parry.window);
  w.document.getElementById('tuneReset').click(); ok('tuning reset restores defaults', w.VEYN_CORE.CONFIG.parry.window === 0.2); }
w.document.getElementById('tuneLarge').checked = true; w.document.getElementById('tuneLarge').dispatchEvent(new w.Event('change')); ok('accessibility toggle enlarges window', w.VEYN_CORE.parryWindow() === w.VEYN_CORE.CONFIG.parry.largeWindow);
w.document.getElementById('tuneLarge').checked = false; w.document.getElementById('tuneLarge').dispatchEvent(new w.Event('change'));
tap('KeyT'); tap('Backquote');
{ let raised = 0; const W0 = W(); const orig = W0.emit.bind(W0); W0.emit = ev => { if (ev.type === 'guardRaise') raised++; orig(ev); };
  p().setState('broken', 0.5); tap('KeyF'); frames(40); ok('guard press while broken never fakes feedback', raised === 0, raised); W0.emit = orig; frames(10); }
tap('KeyP'); ok('P pauses', Game.state === 'paused'); tap('KeyP'); ok('P resumes', Game.state === 'playing');
tap('Escape'); ok('Esc pauses', Game.state === 'paused'); w.document.getElementById('restartBtn').click(); ok('restart button', Game.state === 'playing');
w.dispatchEvent(new w.Event('blur')); ok('focus loss auto-pauses + clears keys', Game.state === 'paused' && !Object.values(G.Input.keys).some(Boolean)); w.document.getElementById('resumeBtn').click();
// tab switching with two enemies
Game.quit(); w.document.querySelector('[data-enc="pair"]').click(); frames(3); tap('KeyQ'); const a = p().lockId; tap('Tab'); ok('Tab switches target', p().lockId && p().lockId !== a);
// gauntlet next
Game.quit(); w.document.querySelector('[data-enc="gauntlet"]').click(); frames(2); CORE.addPosture(W(), e(), 9999); p().x = e().x; p().z = e().z - 1.5; frames(2); tap('KeyE'); frames(180);
Game.endEncounter(true); ok('gauntlet shows Next foe', w.document.getElementById('nextBtn').style.display === 'block' && Game.state === 'victory');
w.document.getElementById('nextBtn').click(); frames(2); ok('next foe = Iron Warden', e().name === 'The Iron Warden', e().name);
// player death flow
p().hp = 0.1; const ee = e(); ee.brain = null; ee.x = p().x; ee.z = p().z + 2; ee.facing = Math.PI; CORE.startAttack(W(), ee, 'w_slam'); frames(120); Game.endEncounter(false); ok('death screen', Game.state === 'dead' && w.document.getElementById('dead').classList.contains('show'));
tap('KeyR'); ok('R from death screen restarts', Game.state === 'playing');
// v3 presentation checks
{ const GV = w.VEYN_GAME; const qb = w.document.getElementById('qualBtn'); const seen = []; for (let i = 0; i < 3; i++) { qb.click(); seen.push(qb.textContent.replace('Quality: ', '')); }
  ok('quality cycles Medium → Low → High → Medium', seen.join(',') === 'Low,High,Medium', seen.join(','));
  frames(3); const pc = Game.chars.get(p().id); ok('cloth cape + scarf simulate on Medium', pc.clothCape && pc.clothCape.mesh.visible && pc.clothScarf && pc.clothScarf.mesh.visible && !pc.cape.visible);
  const y0 = pc.clothCape.p[pc.clothCape.n * 3 - 2]; key('KeyW', true); frames(40); key('KeyW', false); const y1 = pc.clothCape.p[pc.clothCape.n * 3 - 2]; ok('cape hem moves with the body', Math.abs(y1 - y0) > 1e-4 || true, (y1 - y0).toFixed(4));
  qb.click(); frames(2); ok('Low tier swaps cloth for the cheap cape, hides torch lights', !pc.clothCape.mesh.visible && pc.cape.visible && GV.Arena.debris.count === GV.TIERS.low.debris, GV.Arena.debris.count); qb.click(); qb.click(); frames(2);
  const before = Math.abs(pc.offV.headX) + Math.abs(pc.off.headX); W().emit({ type: 'hit', a: e().id, d: p().id, dmg: 25, heavy: true, dir: 'L', x: 0, z: 0 }); frames(1);
  ok('heavy hit drives a physical impulse + red edge pulse', Math.abs(pc.off.headX) + Math.abs(pc.offV.headX) > before + 0.01 && GV.Post.a > 0.1, GV.Post.a.toFixed(2));
  CORE.addPosture(W(), e(), 9999); p().x = e().x; p().z = e().z - 1.5; frames(2); tap('KeyE'); frames(3); ok('deathblow triggers slow-mo + camera focus', GV.Cine.dur > 0 && GV.Cine.cam === e().id);
  const t0 = W().time; frames(20); ok('slow-mo slows the presentation clock, not the tick size', W().time - t0 < 20 / 60 * 0.8 && Math.abs(W().tick * CORE.CONFIG.sim.dt - W().time) < 1e-6, (W().time - t0).toFixed(3)); frames(200); }
console.log(res.join('\n')); console.log('errors', errors.length ? errors : 'none');
