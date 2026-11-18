// Chunk I3: HUD rules, accessibility settings, soft-lock recovery, debug overlay, telemetry, action map (jsdom page, real key / DOM events).
// run: flock /tmp/vh_browser.lock node .test/ui_I3.js      (VEYN_FILE=<build> to test another build)
const mk = require('./p1h.js'); const sleep = ms => new Promise(r => setTimeout(r, ms));
const FILE = process.env.VEYN_FILE || require('path').join(__dirname, '..', 'dist', 'index.html');
const res = []; const ok = (n, c, i) => { res.push((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? ' [' + i + ']' : '')); };
(async () => {
const boot = async (storage) => { const H = mk({ file: FILE, storage }); H.frames(3); return H; };
const intoWorld = async (H) => { const { w, frames, key } = H; w.document.getElementById('advNew').click(); frames(2); key('Space', true); key('Space', false); await sleep(30); frames(5); };
const vis = (w, id) => { const el = w.document.getElementById(id); return !!el && el.style.display !== 'none' && w.getComputedStyle(el).display !== 'none'; };

// ---------------------------------------------------------------- 1) defaults + action map
let H = await boot(), { w, G, Game, frames, key, tap, errors } = H; let A = w.VEYN_ADV, C = w.VEYN_CORE, Acc = A.Access;
ok('Access API present (also on VEYN_GAME)', !!Acc && G.Access === Acc);
ok('defaults are the authored feel', Acc.cam === 1 && Acc.fx === 1 && Acc.cb === false && Acc.longSettle === false && Acc.plant === 1 && Acc.isDefault() && Acc.settleExtra() === 0);
{ const ids = Acc.ACTIONS.map(a => a.id); const need = ['move_forward', 'guard', 'attack_light', 'attack_heavy', 'jump', 'dodge', 'deathblow', 'interact', 'lock_on', 'pause', 'drink'];
  ok('action map: ids unique and stable', new Set(ids).size === ids.length && need.every(n => ids.includes(n)), ids.length);
  ok('action map mirrors current keys', Acc.keysFor('guard')[0] === 'KeyF' && Acc.keysFor('dodge')[0] === 'KeyC' && Acc.actionsFor('KeyE').includes('deathblow') && Acc.actionsFor('Escape').includes('pause'));
  ok('action map is frozen', Object.isFrozen(Acc.ACTIONS) && Object.isFrozen(Acc.ACTIONS[0])); }
ok('FX scale is a pass-through at default', (() => { G.Cam.trauma = 0; G.Cam.addTrauma(0.3); const a = G.Cam.trauma; G.Cam.trauma = 0; return Math.abs(a - 0.3 * C.CONFIG.camera.trauma) < 1e-9; })());
Acc.fx = 0; G.Cam.trauma = 0; G.Cam.addTrauma(0.5); G.Cam.kickFov(5); ok('FX scale 0 removes shake and FOV kick', G.Cam.trauma === 0 && Math.abs(G.Cam.fovKick) < 1e-9); Acc.fx = 1; G.Cam.fovKick = 0;
ok('Accessibility buttons on the title and trials pause panel', !!w.document.getElementById('vhAccBtn') && !!w.document.getElementById('vhAccBtn2'));
w.document.getElementById('vhAccBtn').click(); frames(1); ok('title Accessibility panel opens', w.document.getElementById('vhAccPanel').classList.contains('show') && !!w.document.getElementById('vhAcc_cam'));
key('Escape', true); key('Escape', false); frames(1); ok('Esc closes the panel and stays on the title', !w.document.getElementById('vhAccPanel').classList.contains('show') && Game.state === 'title');

// ---------------------------------------------------------------- 2) settings in the world pause menu persist
await intoWorld(H); ok('world starts', Game.state === 'playing' && A.active);
tap('Escape'); frames(2); ok('Esc opens the pause menu', Game.state === 'paused' && w.document.getElementById('advMenu').style.display === 'block');
{ const tab = [...w.document.querySelectorAll('#advMenu .tabs button')].find(b => b.dataset.t === 'Settings'); tab.click(); frames(1);
  ok('Settings tab has an Accessibility section', !!w.document.getElementById('vhAccWorld') && !!w.document.getElementById('vhAcc_cam') && !!w.document.getElementById('vhAcc_plant'));
  const sl = (id, v) => { const el = w.document.getElementById(id); el.value = String(v); el.dispatchEvent(new w.Event('input', { bubbles: true })); };
  sl('vhAcc_cam', 40); sl('vhAcc_fx', 25); sl('vhAcc_plant', 70);
  w.document.getElementById('vhAcc_cb').click(); frames(1); w.document.getElementById('vhAcc_longSettle').click(); frames(1);
  ok('menu controls set the values', Acc.cam === 0.4 && Acc.fx === 0.25 && Acc.plant === 0.7 && Acc.cb === true && Acc.longSettle === true, JSON.stringify({ c: Acc.cam, f: Acc.fx, p: Acc.plant, cb: Acc.cb, s: Acc.longSettle }));
  ok('longer Settle exposed for the deathblow presentation', A.Access.longSettle === true && Acc.settleExtra() === 0.25);
  ok('colour-blind tints applied (body.vhCb)', w.document.body.classList.contains('vhCb'));
  const saved = JSON.parse(w.localStorage.getItem('veynhold_v8') || '{}');
  ok('saved in the existing settings blob (veynhold_v8.access)', saved.access && saved.access.cam === 0.4 && saved.access.cb === true && saved.access.longSettle === true && saved.quality !== undefined, JSON.stringify(saved.access));
  const H2 = await boot({ veynhold_v8: JSON.stringify(saved) }); const A2 = H2.w.VEYN_ADV.Access;
  ok('reload restores accessibility settings', A2.cam === 0.4 && A2.fx === 0.25 && A2.plant === 0.7 && A2.cb && A2.longSettle && H2.w.document.body.classList.contains('vhCb'));
  const H3 = await boot({ veynhold_v8: JSON.stringify({ v: 8, access: { cam: 'abc', fx: 7, cb: 1, plant: null, longSettle: 0 } }) }); const A3 = H3.w.VEYN_ADV.Access;
  ok('bad saved values are sanitised (clamped / defaulted)', A3.cam === 1 && A3.fx === 1 && A3.cb === true && A3.plant === 0 && A3.longSettle === false, JSON.stringify({ c: A3.cam, f: A3.fx, p: A3.plant }));
  w.document.getElementById('vhAcc_reset').click(); frames(1); ok('Reset returns to the authored feel', Acc.isDefault() && !w.document.body.classList.contains('vhCb'));
  tap('Escape'); frames(2); ok('Esc resumes', Game.state === 'playing'); }

// ---------------------------------------------------------------- 3) HUD rules during a deathblow + pause clears the letterbox / cine / fades
const W = () => Game.world, P = () => Game.world.player;
const sword = () => { A.Save.data.inv.wardblade = 1; };
const calm = () => { for (const e of A.Ents.list) if (e.mode === 'combat' && !e.def.boss) { A.Ents.disengage(e); e.f.x = e.f.px = e.home.x; e.f.z = e.f.pz = e.home.z; } };
const foe = () => A.Ents.list.find(e => !e.def.boss && !e.f.dead && e.f.marks <= 1) || A.Ents.list.find(e => !e.def.boss && !e.f.dead);
sword(); calm(); frames(2);
{ const e = foe(), f = e.f, p = P(); p.x = p.px = f.x; p.z = p.pz = f.z - 1.6; p.facing = 0; G.Cam.yaw = 0; f.atk = null; frames(2);
  C.addPosture(W(), f, 1e5); frames(45);
  ok('deathblow prompt shows when valid', vis(w, 'dbHint') && !!W().deathblowCandidate(p));
  const fx0 = f.x; f.x = f.px = p.x + 12; frames(2); ok('prompt disappears when the condition fails (out of range)', !vis(w, 'dbHint') && !W().deathblowCandidate(p));
  f.x = f.px = fx0; frames(2); ok('prompt back when valid again', vis(w, 'dbHint'));
  G.P1.Coach.on = true; A.UI.hint('held hint', 2);
  tap('KeyE'); frames(2);
  ok('sequence starts: tracker active in Commit/Drive', Acc.DB.active && /Commit|Drive/.test(Acc.DB.phase), Acc.DB.phase + ' t=' + Acc.DB.t.toFixed(3));
  ok('prompt hidden once the sequence starts', !vis(w, 'dbHint') && !vis(w, 'dbDot'));
  ok('non-essential HUD fades (body.vhDb)', w.document.body.classList.contains('vhDb'));
  w.document.getElementById('coach').textContent = ''; G.P1.Coach.say('should be silent', 2); A.UI.hint('during the blow', 3);
  ok('coach silent during Commit-Settle', w.document.getElementById('coach').textContent === '');
  ok('world hint held during the deathblow', w.document.getElementById('advHint').textContent !== 'during the blow');
  ok('letterbox on during the deathblow', G.P1.Letterbox.on === true);
  tap('Escape'); frames(2);
  ok('pause clears the letterbox', Game.state === 'paused' && G.P1.Letterbox.on === false && !w.document.getElementById('lbox').classList.contains('on'));
  ok('pause clears cine / finisher state and HUD fades', !G.P1.Finale.active && !G.Cine.cam && !w.document.body.classList.contains('cine') && !w.document.body.classList.contains('vhDb') && !(A.BossD && A.BossD.Fin && A.BossD.Fin.cur));
  tap('Escape'); frames(3); ok('resume works', Game.state === 'playing');
  let ph = new Set(); for (let i = 0; i < 260 && (Acc.DB.active || i < 5); i++) { frames(1); if (Acc.DB.active) ph.add(Acc.DB.phase); }
  ok('tracker runs to the end (deathblow always terminates)', !Acc.DB.active && !w.document.body.classList.contains('vhDb'), [...ph].join(','));
  G.P1.Coach.say('after unlock', 2); ok('coach speaks again after unlock', w.document.getElementById('coach').textContent === 'after unlock');
  ok('held hint shown after the deathblow', w.document.getElementById('advHint').textContent === 'during the blow');
  G.P1.Coach.on = false; }

// ---------------------------------------------------------------- 4) Low keeps the posture bar + deathblow prompt
{ G.Settings.quality = 'low'; G.applyQuality(); frames(2); ok('Low marks the chrome (body.vhLow)', w.document.body.classList.contains('vhLow'));
  calm(); const e = foe(), f = e.f, p = P(); p.x = p.px = f.x; p.z = p.pz = f.z - 1.6; f.atk = null; frames(2); C.addPosture(W(), f, 1e5); frames(45);
  ok('Low: posture bars still displayed', w.getComputedStyle(w.document.getElementById('pPostBar')).display !== 'none' && vis(w, 'hudPlayer'));
  ok('Low: deathblow prompt still shows', vis(w, 'dbHint'));
  f.x = f.px = p.x + 15; frames(2); G.Settings.quality = 'medium'; G.applyQuality(); frames(2); calm(); }

// ---------------------------------------------------------------- 5) focus loss pauses safely, no stuck keys; pause always reachable
{ key('KeyW', true); frames(3); ok('W held', !!G.Input.keys.KeyW);
  w.dispatchEvent(new w.Event('blur')); frames(2);
  ok('window blur pauses the world (menu open)', Game.state === 'paused' && w.document.getElementById('advMenu').style.display === 'block');
  ok('no stuck keys after blur', !G.Input.keys.KeyW && !G.Input.lmbDown && (A.eQ === null || A.eQ === undefined));
  key('KeyW', false); tap('Escape'); frames(2); ok('resume after blur', Game.state === 'playing');
  const z0 = P().z; frames(20); ok('Wren does not walk on by herself after refocus', Math.abs(P().z - z0) < 0.05, (P().z - z0).toFixed(3));
  Object.defineProperty(w.document, 'hidden', { configurable: true, get: () => true }); w.document.dispatchEvent(new w.Event('visibilitychange')); frames(2);
  ok('visibilitychange (hidden) pauses', Game.state === 'paused'); Object.defineProperty(w.document, 'hidden', { configurable: true, get: () => false });
  tap('Escape'); frames(2);
  A.busy = 1; w.dispatchEvent(new w.Event('blur')); frames(2); ok('blur during a lantern fade queues the pause (no half-open menu)', Game.state === 'playing' && A.pauseWanted === true);
  A.busy = 0; frames(2); ok('queued pause opens once the fade ends', Game.state === 'paused' && w.document.getElementById('advMenu').style.display === 'block');
  tap('Escape'); frames(2);
  A.busy = 1; tap('Escape'); frames(1); ok('Esc during a fade is queued too', A.pauseWanted === true); A.busy = 0; frames(2); ok('…and opens after', Game.state === 'paused'); tap('Escape'); frames(2);
  const p = P(); p.invuln = false; p.hp = 0; p.dead = true; p.setState('dead', 99); W().emit({ type: 'death', f: p.id }); frames(5);
  ok('dying', !!A.dying); const t0 = A.dying.t; tap('Escape'); frames(2); ok('pause reachable while dying', Game.state === 'paused');
  frames(120); ok('death timer holds while paused', A.dying && A.dying.t === t0, A.dying && A.dying.t.toFixed(2));
  tap('Escape'); frames(2); frames(400); await sleep(20); frames(30); ok('death completes after resume (respawn)', !A.dying && Game.state === 'playing' && !P().dead, Game.state); }

// ---------------------------------------------------------------- 6) interaction cancelled on distance
{ const p = P(); W().time; A.inter = { x: p.x, z: p.z + 1, label: 'x', act() { A._acted = true; } }; A.eQ = W().time; A._eQpos = { x: p.x, z: p.z, ix: p.x, iz: p.z + 1 }; A._acted = false;
  p.x = p.px = p.x + 3; frames(1); ok('held E dropped once Wren walks away', A.eQ === null && !A._acted); }

// ---------------------------------------------------------------- 7) debug overlay
{ const dbg = () => w.document.getElementById('vhDbg');
  G.Settings.quality = 'high'; G.applyQuality(); frames(2); tap('Backslash'); frames(7);
  ok('High: Backslash shows the overlay', !!dbg() && dbg().style.display === 'block');
  const txt = dbg().textContent; ok('overlay lists the fields', ['deathblow', 'blade spring', 'plantT', 'quality', 'adaptive', 'ignoreSeparation', 'surface'].every(s => txt.includes(s)), txt.split('\n').length);
  ok('INT5: plantT, separation and surface read live values now that I1 (plantT, ignoreSeparation) and I4 (A.Surf) are merged', /plantT\s+\d+\.\d{3}/.test(txt) && /ignoreSeparation (on|off)/.test(txt) && /surface\s+[a-z_]+/.test(txt) && !/surface\s+n\/a/.test(txt), (txt.match(/plantT.*|ignoreSeparation.*|surface.*/g) || []).join(' | '));
  ok('no NaN in a normal frame', !/NaN/.test(txt));
  const pt0 = P().plantT; P().plantT = NaN; frames(7); ok('NaN guarded (shown flagged, no throw)', /NaN!/.test(dbg().textContent)); if (pt0 === undefined) delete P().plantT; else P().plantT = pt0;
  G.Cam.yaw = NaN; frames(2); ok('NaN camera recovered', isFinite(G.Cam.yaw) && isFinite(G.camera.position.x) && Acc.nanFixes > 0);
  tap('Backslash'); frames(2); ok('Backslash hides it', dbg().style.display === 'none');
  tap('F8'); frames(2); ok('F8 toggles too', dbg().style.display === 'block'); tap('F8'); frames(1);
  G.Settings.quality = 'low'; G.applyQuality(); frames(2); tap('Backslash'); frames(2); ok('Low: key does not open it', dbg().style.display === 'none');
  w.history.replaceState(null, '', '?vhdebug=1'); Acc.Overlay.checkUrl(); frames(7); ok('URL flag ?vhdebug opens it on any tier', dbg().style.display === 'block' && Acc.Overlay.url);
  w.history.replaceState(null, '', '/veynhold/index.html'); Acc.Overlay.url = false; Acc.Overlay.toggle(false); G.Settings.quality = 'medium'; G.applyQuality(); frames(2); }

// ---------------------------------------------------------------- 8) tune clamp
{ const T = G.Tune, v0 = C.CONFIG.camera.trauma; T.set('camera.trauma', NaN); ok('Tune refuses NaN', C.CONFIG.camera.trauma === v0); T.set('camera.trauma', 99); ok('Tune clamps live edits', C.CONFIG.camera.trauma === 2); T.set('camera.trauma', v0); }

// ---------------------------------------------------------------- 9) telemetry
{ const T = Acc.Tel, w0 = W(), p = P(); const d0 = JSON.parse(JSON.stringify(T.data));
  const dv = q => ({ type: 'deflect', a: 999, d: p.id, quality: q, x: p.x, z: p.z + 1, heavy: false, offset: 0, key: 'd_slash' }); w0.events.push(dv('perfect'), dv('late')); Game.handleEvents(); w0.events.length = 0; T.flush(true);
  const s = JSON.parse(w.localStorage.getItem('veynhold_telemetry') || '{}');
  ok('telemetry counts deflects by tier', s.deflect && s.deflect.perfect === d0.deflect.perfect + 1 && s.deflect.late === d0.deflect.late + 1, JSON.stringify(s.deflect));
  ok('telemetry counted the deathblow + the death', s.deathblows >= 1 && Object.values(s.deaths).reduce((a, b) => a + b, 0) >= 1, JSON.stringify({ db: s.deathblows, deaths: s.deaths }));
  Object.defineProperty(w, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });
  let threw = false; try { w0.events.push(dv('good')); Game.handleEvents(); w0.events.length = 0; T.flush(true); frames(5); } catch (e) { threw = true; }
  ok('missing storage never blocks (memory only)', !threw && T.mem === true && Game.state === 'playing'); }

// ---------------------------------------------------------------- 10) trials: pause / title clear; camera blend-out on a lost target
{ A.quitToTitle(); frames(3); ok('quit to title clears the letterbox + cine', Game.state === 'title' && !G.P1.Letterbox.on && !w.document.body.classList.contains('cine') && !w.document.body.classList.contains('vhDb'));
  Game.start('duelist'); frames(5); ok('trial starts', Game.state === 'playing');
  G.P1.Letterbox.set(true, 0); G.Cine.focus(W().enemies()[0].id, 2); Game.pause(); frames(1);
  ok('trial pause clears letterbox + cinematic focus', Game.state === 'paused' && !G.P1.Letterbox.on && !G.Cine.cam);
  Game.resume(); frames(2);
  const ghost = { x: 3, z: 3, px: 3, pz: 3, profile: { look: 'duelist' } }; G.P1.Finale.start(P(), ghost); frames(1);
  ok('finale with a lost target starts its blend-out at once', G.P1.Finale.t >= G.P1.Finale.dur - 0.56, G.P1.Finale.t.toFixed(2));
  frames(60); ok('…and completes', !G.P1.Finale.active && isFinite(G.camera.position.x));
  G.P1.Letterbox.set(true, 0); frames(60 * 3 + 30); ok('an unowned letterbox is released', !G.P1.Letterbox.on);
  Game.quit(); frames(2); ok('trial quit returns to title', Game.state === 'title'); }

ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
for (const r of res) console.log(r); const nf = res.filter(r => r.startsWith('FAIL')).length; console.log((res.length - nf) + '/' + res.length + ' passed');
process.exit(nf ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
