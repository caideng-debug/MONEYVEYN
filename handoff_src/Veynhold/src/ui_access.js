/* =====================================================================
   VEYNHOLD — CHUNK I3: HUD rules, accessibility, soft-lock recovery, debug overlay, local telemetry, action map.
   Presentation + world glue only (blueprint v3 §17, §19, §26, §27, §30). Never edits core state: it reads fighters, events
   and CONFIG, and wraps presentation functions (camera, post pulses, HUD, menus). Every wrapper is a pass-through at the
   authored defaults (camera 100 %, effects 100 %, plant 100 %, tints off, Settle normal).
   Public surface: VEYN_ADV.Access (alias VEYN_GAME.Access) — settings (cam, fx, cb, longSettle, plant), settleExtra(),
   DB (deathblow phase tracker), Overlay (debug), Tel (telemetry), ACTIONS (stable action ids), clearPresentation().
   ===================================================================== */
(function () {
'use strict';
const G = window.VEYN_GAME, CORE = window.VEYN_CORE; const A = window.VEYN_ADV = window.VEYN_ADV || {};
if (!G || !CORE || !G.P1) { console.warn('[Veynhold] I3 (access/HUD) unavailable'); return; }
const THREE = window.THREE, P1 = G.P1, $ = id => document.getElementById(id);
const { Game, Cam, Input, Settings, Store, camera, FX, VISUAL, Cine, Post, Tune } = G;
const { Letterbox, Cinema, Finale, HUD, Coach, toast, tier, audio } = P1;
const Intro = G.Intro, Hold = G.Hold, PostFX = P1.PostFX, CamFX = G.V8 && G.V8.CamFX, Perf = G.Perf;
const { CONFIG, clamp } = CORE;
const fin = v => typeof v === 'number' && isFinite(v);
const body = () => document.body;
const wrap = (o, k, mk) => { if (o && typeof o[k] === 'function') { const f0 = o[k]; o[k] = mk(f0); o[k].i3 = f0; } };

/* ---------------------------------------------------------------- 6. stable action ids (documentation table for a future rebind UI;
   the live bindings in game.js / world.js are unchanged — this mirrors them). Contexts: combat, explore (world), trials, menu, debug.
   pad = standard-mapping button index (Pad.poll). Mouse buttons are 'MouseLeft' / 'MouseRight' / 'Wheel'. */
const ACTIONS = Object.freeze([
  ['move_forward', 'Move forward', ['KeyW'], 'LS', 'combat'], ['move_back', 'Move back', ['KeyS'], 'LS', 'combat'],
  ['move_left', 'Move left', ['KeyA'], 'LS', 'combat'], ['move_right', 'Move right', ['KeyD'], 'LS', 'combat'],
  ['sprint', 'Sprint', ['ShiftLeft', 'ShiftRight'], '10', 'combat'],
  ['camera_left', 'Camera left', ['ArrowLeft'], 'RS', 'combat'], ['camera_right', 'Camera right', ['ArrowRight'], 'RS', 'combat'],
  ['camera_up', 'Camera up', ['ArrowUp'], 'RS', 'combat'], ['camera_down', 'Camera down', ['ArrowDown'], 'RS', 'combat'],
  ['guard', 'Guard (hold) / deflect (tap)', ['KeyF'], '5,7', 'combat'],
  ['attack_light', 'Light attack', ['MouseLeft', 'KeyJ'], '0', 'combat'], ['attack_charged', 'Charged thrust (hold light)', ['MouseLeft'], '2 (hold)', 'combat'],
  ['attack_heavy', 'Heavy attack', ['MouseRight', 'KeyK'], '2', 'combat'],
  ['jump', 'Jump', ['Space'], '6', 'combat'], ['dodge', 'Dash / dodge', ['KeyC'], '1', 'combat'],
  ['deathblow', 'Deathblow', ['KeyE'], '3', 'combat'], ['interact', 'Interact / talk / rest', ['KeyE'], '3', 'explore'],
  ['lock_on', 'Lock on / recentre', ['KeyQ'], '4,11', 'combat'], ['switch_target', 'Switch target', ['Tab', 'Wheel'], '14,15', 'combat'],
  ['drink', 'Drink a Lantern Draught', ['KeyR'], '8', 'explore'], ['restart', 'Restart encounter', ['KeyR'], '8', 'trials'],
  ['pause', 'Pause menu', ['Escape', 'KeyP'], '9', 'menu'], ['toggle_hints', 'Control hints', ['KeyH'], '', 'menu'],
  ['practice_1', 'Practice: perilous only', ['Digit1'], '', 'trials'], ['practice_2', 'Practice: Shade holds guard', ['Digit2'], '', 'trials'],
  ['practice_3', 'Practice: pause swings', ['Digit3'], '', 'trials'], ['practice_4', 'Practice: cadence', ['Digit4'], '', 'trials'],
  ['dialogue_choice', 'Dialogue choice 1-9', ['Digit1'], '', 'menu'], ['debug', 'Debug text', ['Backquote'], '', 'debug'],
  ['tune', 'Tune panel', ['KeyT'], '', 'debug'], ['debug_overlay', 'Debug overlay (High)', ['Backslash', 'F8'], '', 'debug'],
].map(([id, label, keys, pad, ctx]) => Object.freeze({ id, label, keys: Object.freeze(keys.slice()), pad, ctx })));
const actionsFor = (code, ctx) => ACTIONS.filter(a => a.keys.includes(code) && (!ctx || a.ctx === ctx)).map(a => a.id);
const keysFor = id => { const a = ACTIONS.find(x => x.id === id); return a ? a.keys.slice() : []; };

/* ---------------------------------------------------------------- 2. accessibility settings (saved inside the existing Store blob: Store.data.access) */
const DEF = Object.freeze({ cam: 1, fx: 1, cb: false, longSettle: false, plant: 1 });
const RANGE = { cam: [0, 1], fx: [0, 1], plant: [0, 1] };
const Acc = A.Access = G.Access = {
  cam: 1, fx: 1, cb: false, longSettle: false, plant: 1, DEF, SETTLE_EXTRA: 0.25, ACTIONS, actionsFor, keysFor,
  sane(k, v) { if (k in RANGE) { v = +v; return fin(v) ? clamp(v, RANGE[k][0], RANGE[k][1]) : DEF[k]; } return !!v; },
  load() { const d = Store.data && Store.data.access; if (d && typeof d === 'object') for (const k in DEF) if (d[k] !== undefined) this[k] = this.sane(k, d[k]); this.apply(); },
  save() { const o = {}; for (const k in DEF) o[k] = this[k]; Store.data.access = o; try { Store.save(); } catch (e) {} },
  set(k, v) { if (!(k in DEF)) return; this[k] = this.sane(k, v); this.apply(); this.save(); },
  reset() { Object.assign(this, DEF); this.apply(); this.save(); },
  isDefault() { for (const k in DEF) if (this[k] !== DEF[k]) return false; return true; },
  settleExtra() { return this.longSettle ? this.SETTLE_EXTRA : 0; },    // presentation-only: a deathblow controller may lengthen its Settle phase by this
  apply() { const b = body(); if (b) b.classList.toggle('vhCb', !!this.cb); },
};

/* ---------------------------------------------------------------- CSS: HUD rules + tints + Low chrome + overlay + accessibility panel */
const CSS = `
.bar.post{outline:1px solid rgba(0,0,0,.75);outline-offset:0}
#danger .rune{filter:drop-shadow(0 0 6px #ff1a10) drop-shadow(0 0 2px #000) drop-shadow(0 0 1px #000)}
#danger::before{content:"";position:absolute;left:-6px;top:-6px;width:64px;height:64px;border-radius:50%;background:radial-gradient(rgba(0,0,0,.55),rgba(0,0,0,0) 70%);z-index:-1}
#dbHint,#dangerLbl{text-shadow:0 0 4px #000,0 1px 2px #000,0 0 1px #000}
body.vhCb .post i{background:linear-gradient(90deg,#8d7d52,#f1e8c4 50%,#8d7d52)}
body.vhCb .post.hot i{background:linear-gradient(90deg,#1f6fa8,#8fd0f7 50%,#1f6fa8);box-shadow:0 0 10px rgba(86,180,233,.75)}
body.vhCb .post.crit i{background:repeating-linear-gradient(135deg,#ffffff 0 5px,#0072b2 5px 10px);box-shadow:0 0 14px rgba(255,255,255,.9)}
body.vhCb .rune .r1{fill:rgba(70,40,0,.6);stroke:#ffb000}body.vhCb .rune .r2{stroke:#ffffff}body.vhCb .rune .r3{fill:#ffffff}
body.vhCb #danger .rune{filter:drop-shadow(0 0 6px #e69f00) drop-shadow(0 0 2px #000) drop-shadow(0 0 1px #000)}
body.vhCb #dbDot{background:radial-gradient(#ffffff,#0072b2);box-shadow:0 0 18px 6px rgba(86,180,233,.8)}
body.vhCb #dbHint,body.vhCb #dangerLbl{color:#ffe9a8}
body.vhDb #hints,body.vhDb #advCompass,body.vhDb #advObj,body.vhDb #advHint,body.vhDb #advPrompt,body.vhDb #advArea,body.vhDb .advMark,body.vhDb #chain,
body.vhDb #reticle,body.vhDb #chargeRing,body.vhDb #coach,body.vhDb #practice,body.vhDb #toast{opacity:0!important;transition:opacity .25s}
body.vhLow #advCompass span{display:none}body.vhLow #advCompass{-webkit-mask-image:none;mask-image:none;background:rgba(0,0,0,.25)}
body.vhLow .bar,body.vhLow .post i,body.vhLow .post.hot i,body.vhLow .post.crit i{box-shadow:none}body.vhLow .bar.post.crit{animation:none}
body.vhLow #hints{background:rgba(8,8,10,.8)}body.vhLow #advObj,body.vhLow #advFlask{text-shadow:none}
#vhDbg{position:fixed;right:12px;top:96px;z-index:19;pointer-events:none;font:11px/1.45 monospace;color:#bfe9c0;background:rgba(0,0,0,.78);border:1px solid rgba(160,220,160,.35);padding:8px 10px;white-space:pre;display:none;min-width:330px}
#vhDbg b{color:#f0d68a;font-weight:normal}#vhDbg i{color:#ff8a7a;font-style:normal}
#vhAccPanel{z-index:30}#vhAccPanel .panel{max-width:640px;text-align:left}
.vhAcc .set{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:8px 0;max-width:600px}.vhAcc .set span{flex:1}
.vhAcc .set input[type=range]{width:180px}.vhAcc .set b{min-width:44px;text-align:right;font-weight:normal;color:#e8d9b0}.vhAcc .set button{min-width:120px}
.vhAcc small.note{display:block;color:#9c8f78;font-size:12px;margin-top:6px}
`;
function injectCSS() { if (Acc._css || !document.head) return; Acc._css = true; const st = document.createElement('style'); st.id = 'vhI3css'; st.textContent = CSS; document.head.appendChild(st); }

/* ---------------------------------------------------------------- settings rows (shared by the world Settings tab and the trials panel) */
const ROWS = [
  ['cam', 'range', 'Camera motion (cinematic orbit, pull-back, finisher cameras, impulses)'],
  ['fx', 'range', 'Screen effects (shake, flash, FOV kick, punch)'],
  ['cb', 'tog', 'Colour-blind-safe posture and danger colours'],
  ['longSettle', 'tog', 'Longer deathblow Settle (presentation only)'],
  ['plant', 'range', 'Plant feel (presentation)'],
];
function rowsHTML() { let h = '';
  for (const [k, t, lbl] of ROWS) { const id = 'vhAcc_' + k;
    if (t === 'range') { const v = Math.round(Acc[k] * 100); h += '<div class="set"><span>' + lbl + '</span><input type="range" id="' + id + '" min="0" max="100" step="5" value="' + v + '"><b id="' + id + '_v">' + v + '%</b></div>'; }
    else h += '<div class="set"><span>' + lbl + '</span><button class="tog" id="' + id + '">' + (Acc[k] ? 'On' : 'Off') + '</button></div>'; }
  h += '<div class="set"><span>Default is the authored feel</span><button class="tog" id="vhAcc_reset">Reset accessibility</button></div>';
  return h; }
function bindRows(root, rerender) { if (!root) return;
  for (const [k, t] of ROWS) { const el = root.querySelector('#vhAcc_' + k); if (!el) continue;
    if (t === 'range') el.oninput = () => { Acc.set(k, (+el.value) / 100); const v = root.querySelector('#vhAcc_' + k + '_v'); if (v) v.textContent = Math.round(Acc[k] * 100) + '%'; };
    else el.onclick = () => { Acc.set(k, !Acc[k]); try { audio.play('ui'); } catch (e) {} rerender(); }; }
  const r = root.querySelector('#vhAcc_reset'); if (r) r.onclick = () => { Acc.reset(); try { audio.play('ui'); } catch (e) {} rerender(); }; }
// world pause menu: an Accessibility section at the end of the Settings tab
wrap(A, 'renderMenu', f0 => function () { const r = f0.apply(this, arguments); try { if (A.menuTab === 'Settings') { const b = document.querySelector('#advMenu .body'); if (b) {
    const d = document.createElement('div'); d.className = 'vhAcc'; d.id = 'vhAccWorld'; d.innerHTML = '<h4>Accessibility</h4>' + rowsHTML(); b.appendChild(d); bindRows(d, () => A.renderMenu()); } } } catch (e) { console.error(e); } return r; });
// trials: an Accessibility panel opened from the pause panel and the title screen
const Panel = Acc.Panel = {
  build() { if ($('vhAccPanel') || !body()) return; const o = document.createElement('div'); o.id = 'vhAccPanel'; o.className = 'ov';
    o.innerHTML = '<div class="panel vhAcc"><div class="big" style="font-size:30px">ACCESSIBILITY</div><div id="vhAccRows"></div><small class="note">Saved with your settings. Esc closes.</small><button class="btn" id="vhAccClose">Close</button></div>';
    body().appendChild(o); $('vhAccClose').onclick = () => this.show(false);
    for (const [row, id] of [['#pause .row', 'vhAccBtn2'], ['#title .row', 'vhAccBtn']]) { const r = document.querySelector(row); if (!r || $(id)) continue; const b = document.createElement('button'); b.className = 'tog'; b.id = id; b.textContent = 'Accessibility'; b.onclick = () => { try { audio.play('ui'); } catch (e) {} this.show(true); }; r.appendChild(b); } },
  render() { const el = $('vhAccRows'); if (!el) return; el.innerHTML = rowsHTML(); bindRows(el, () => this.render()); },
  open: false,
  show(on) { const o = $('vhAccPanel'); if (!o) return; this.open = !!on; o.classList.toggle('show', !!on); o.style.display = on ? 'flex' : ''; if (on) this.render(); },
};
window.addEventListener('keydown', e => { if (Panel.open && (e.code === 'Escape' || e.code === 'KeyP')) { e.stopImmediatePropagation(); e.preventDefault(); Panel.show(false); } }, true);

/* ---------------------------------------------------------------- 2a. screen effect scale (shake, flash, FOV kick, punch) */
const fxK = () => Acc.fx;
wrap(Cam, 'addTrauma', f0 => function (a) { return f0.call(this, fxK() === 1 ? a : a * fxK()); });
wrap(Cam, 'kickFov', f0 => function (a) { return f0.call(this, fxK() === 1 ? a : a * fxK()); });
wrap(Post, 'pulse', f0 => function (rgb, s) { return f0.call(this, rgb, fxK() === 1 ? s : s * fxK()); });
wrap(PostFX, 'punch', f0 => function (a) { return f0.call(this, fxK() === 1 ? a : a * fxK()); });
wrap(PostFX, 'flash', f0 => function (rgb, a) { return f0.call(this, rgb, fxK() === 1 ? a : a * fxK()); });
wrap(FX, 'flash', f0 => function (pos, color, power) { return f0.call(this, pos, color, fxK() === 1 ? power : power * fxK()); });
{ const Pop = A.BossD && A.BossD.Pop;   // world finisher pop: its own screen flash + shake
  wrap(Pop, 'tick', f0 => function () { if (fxK() === 1) return f0.apply(this, arguments); const a0 = this.flA; this.flA = a0 * fxK(); try { return f0.apply(this, arguments); } finally { this.flA = a0; } });
  wrap(Pop, 'cam', f0 => function () { if (fxK() === 1) return f0.apply(this, arguments); const a0 = this.skA; this.skA = a0 * fxK(); try { return f0.apply(this, arguments); } finally { this.skA = a0; } }); }

/* ---------------------------------------------------------------- 2b. camera motion scale */
const camK = () => Acc.cam;
wrap(Cam, 'update', f0 => function () { const s = camK(); if (s === 1) return f0.apply(this, arguments);
  const o = { cineOrbit: VISUAL.cineOrbit, camPull: VISUAL.camPull, closeSwing: VISUAL.closeSwing };
  for (const k in o) if (fin(o[k])) VISUAL[k] = o[k] * s; try { return f0.apply(this, arguments); } finally { for (const k in o) VISUAL[k] = o[k]; } });
// cinematic cameras (intro, boss finale, field finisher): blend back toward the gameplay camera by (1 - scale)
const _p0 = new THREE.Vector3(), _q0 = new THREE.Quaternion();
function camScaled(f0) { return function () { const s = camK(); if (s === 1) return f0.apply(this, arguments);
  _p0.copy(camera.position); _q0.copy(camera.quaternion); const fov0 = camera.fov; const r = f0.apply(this, arguments);
  camera.position.lerpVectors(_p0, camera.position.clone(), s); camera.quaternion.copy(_q0.slerp(camera.quaternion, s)); const f = fov0 + (camera.fov - fov0) * s;
  if (Math.abs(camera.fov - f) > 1e-4) { camera.fov = f; camera.updateProjectionMatrix(); } return r; }; }
wrap(Cinema, 'camera', camScaled);
if (A.BossD && A.BossD.Fin) wrap(A.BossD.Fin, 'post', camScaled);

/* ---------------------------------------------------------------- deathblow phase tracker (presentation; reads core state, never writes it)
   Phase bookmarks follow §7.1 (Commit 0, Drive 0.28, Settle 0.55, Extract 0.95, Unlock 1.40, presentation end 2.25; boss final:
   Settle +0.25, Extract +0.25). The clock is the victim's core stateT, so it pauses with core hit-stop. Unlock is the core's: the
   victim/attacker leaving the deathblow states or a core 'deathblowUnlock' event (vh-I1). A controller elsewhere may supply its own
   phase through Access.dbSource() -> { phase, t } and that wins. */
const SCHED = Object.freeze({ Commit: 0, Drive: 0.28, Settle: 0.55, Extract: 0.95, Unlock: 1.40, End: 2.25, bossExtra: 0.25 });
const DB = Acc.DB = {
  SCHED, active: false, a: null, v: null, t: 0, tail: 0, real: 0, phase: '', final: false, unlocked: false, src: '', dur: null, variant: null,
  start(att, vic, src, e) { this.active = true; this.a = att; this.v = vic; this.t = 0; this.tail = 0; this.real = 0; this.unlocked = false; this.src = src;
    this.final = !!(vic && vic.profile && vic.profile.boss && vic.marks <= 1); this.dur = e && fin(e.duration) ? e.duration : null; this.variant = (e && e.variantId) || null; this.phase = 'Commit';
    const b = body(); if (b) b.classList.add('vhDb'); hidePrompt(true); Coach.t = 0; const ce = $('coach'); if (ce) ce.style.opacity = 0; },
  bounds() { const x = this.final ? SCHED.bossExtra : 0; return { drive: SCHED.Drive, settle: SCHED.Settle, extract: SCHED.Extract + x, unlock: SCHED.Unlock + 2 * x }; },
  phaseAt(t) { const B = this.bounds(); return t < B.drive ? 'Commit' : t < B.settle ? 'Drive' : t < B.extract ? 'Settle' : 'Extract'; },
  update(dt, w) { const p = w && w.player;
    if (!this.active) { if (p && p.state === 'deathblowExec') { const v = w.fighters.find(f => f.state === 'deathblowed') || null; this.start(p, v, 'state', null); this.t = p.stateT || 0; } else return; }
    this.real += dt; const ext = typeof Acc.dbSource === 'function' ? Acc.dbSource() : null;
    if (ext && ext.phase) { this.phase = String(ext.phase); this.t = fin(ext.t) ? ext.t : this.t; this.unlocked = /collapse|unlock|end/i.test(this.phase); if (ext.done) return this.end(); }
    else { const v = this.v, a = this.a; let live = false;
      if (!this.unlocked && v && v.state === 'deathblowed' && w.fighters.includes(v)) { this.t = fin(v.stateT) ? v.stateT : this.t; live = true; }
      else if (!this.unlocked && a && a.state === 'deathblowExec' && w.fighters.includes(a)) { this.t = fin(a.stateT) ? a.stateT : this.t; live = true; }
      if (!live) this.unlocked = true;
      if (this.unlocked) { this.tail += dt; this.phase = 'Collapse'; if (this.tail >= SCHED.End - SCHED.Unlock) return this.end(); }
      else this.phase = this.phaseAt(this.t); }
    if (this.real > 8) this.end(); },   // a deathblow presentation always terminates
  quiet() { return this.active && !this.unlocked; },   // coach + hints silent Commit..Extract (blueprint: after unlock / Collapse is fine)
  end() { this.active = false; this.phase = ''; this.a = this.v = null; const b = body(); if (b) b.classList.remove('vhDb'); flushHint(); },
  clear() { this.end(); this.t = 0; this.tail = 0; this.unlocked = false; },
};

/* ---------------------------------------------------------------- 1. HUD rules */
// INT5 perf: element lookups cached, style written only on change, and the candidate search skipped while the base HUD already hides the prompt
const _el = {}; const el = id => { let e = _el[id]; if (!e || !e.isConnected) e = _el[id] = $(id); return e; };
function hidePrompt(dot) { const h = el('dbHint'); if (h && h.style.display !== 'none') h.style.display = 'none'; if (dot) { const d = el('dbDot'); if (d && d.style.display !== 'none') d.style.display = 'none'; } }
wrap(HUD, 'update', f0 => function (dt, w) { const r = f0.apply(this, arguments); try { const p = w && w.player; if (!p) return r;
    if (!DB.quiet()) { const h = el('dbHint'); if (!h || h.style.display === 'none') return r; }
    const cand = w.deathblowCandidate(p); const valid = !!cand && Game.state === 'playing' && !p.dead && p.state !== 'deathblowExec' && p.state !== 'broken' && !DB.quiet() && !(Intro && Intro.active);
    if (!valid) hidePrompt(DB.quiet()); } catch (e) {} return r; });
// coach silent Commit -> Settle (until the core unlocks); world hints are held and shown after
wrap(Coach, 'say', f0 => function () { if (DB.quiet()) return; return f0.apply(this, arguments); });
let heldHint = null;
function flushHint() { if (!heldHint || !A.UI || !A.UI.hint || !A.UI.hint.i3) return; const h = heldHint; heldHint = null; A.UI.hint.i3.call(A.UI, h[0], h[1]); }
if (A.UI) wrap(A.UI, 'hint', f0 => function (text, dur) { if (DB.quiet()) { heldHint = [text, dur]; return; } return f0.call(this, text, dur); });

/* ---------------------------------------------------------------- 3. soft-lock + recovery */
function clearPresentation(toTitle) {
  const tryy = f => { try { f(); } catch (e) {} };
  tryy(() => Letterbox.set(false)); tryy(() => { Letterbox.t = 0; });
  tryy(() => { if (Finale.active) { Finale.active = false; Finale.t = Finale.dur; } });
  tryy(() => Cine.clear()); tryy(() => Hold && Hold.clear());
  tryy(() => { if (PostFX) { PostFX.dof = 0; PostFX.cine = 0; } });
  tryy(() => { const BD = A.BossD; if (BD) { if (BD.Fin) BD.Fin.cur = null; if (BD.Pop && BD.Pop.clear) BD.Pop.clear(); } });
  tryy(() => { if (CamFX) CamFX.clear(); });
  DB.clear(); heldHint = toTitle ? null : heldHint;
  tryy(() => { Cinema.cineOn = false; const b = body(); if (b) { b.classList.remove('cine'); b.classList.remove('vhDb'); } });
  hidePrompt(true);
  if (toTitle) { tryy(() => Cinema.clear()); tryy(() => { if (A.UI && A.UI.prompt) A.UI.prompt(null); }); tryy(() => { const d = $('danger'); if (d) d.style.display = 'none'; });
    A.pauseWanted = false; A.eQ = null; A._eQpos = null; }
}
Acc.clearPresentation = clearPresentation;
function afterResume() { try { if (Intro && Intro.active) Letterbox.set(true, 0); } catch (e) {} }   // an intro / cutscene still owns its bars after a pause
wrap(Game, 'pause', f0 => function () { const was = this.state; const r = f0.apply(this, arguments); if (this.state === 'paused' || (A.active && A.pauseWanted)) { if (was === 'playing') clearPresentation(false); Tel.flush(true); } return r; });
wrap(Game, 'resume', f0 => function () { const r = f0.apply(this, arguments); if (this.state === 'playing') afterResume(); return r; });
wrap(Game, 'quit', f0 => function () { clearPresentation(true); Tel.flush(true); const r = f0.apply(this, arguments); clearPresentation(true); return r; });
wrap(Game, 'begin', f0 => function () { clearPresentation(false); return f0.apply(this, arguments); });
// world: pause is always reachable — queued while a lantern rest / travel fade owns the screen, allowed while dying (the death timer holds)
wrap(A, 'openMenu', f0 => function () { if (A.busy) { A.pauseWanted = true; return; } A.pauseWanted = false; const was = Game.state; const r = f0.apply(this, arguments); if (was === 'playing') clearPresentation(false); Tel.flush(true); return r; });
wrap(A, 'closeMenu', f0 => function () { const r = f0.apply(this, arguments); if (Game.state === 'playing') afterResume(); return r; });
wrap(A, 'quitToTitle', f0 => function () { clearPresentation(true); Tel.flush(true); return f0.apply(this, arguments); });
wrap(A, 'leave', f0 => function () { const r = f0.apply(this, arguments); clearPresentation(true); return r; });
wrap(A, 'buildWorld', f0 => function () { clearPresentation(false); return f0.apply(this, arguments); });
wrap(A, 'updateDeath', f0 => function () { if (Game.state === 'paused') return; return f0.apply(this, arguments); });
wrap(A, 'updateDrink', f0 => function () { if (Game.state === 'paused') return; return f0.apply(this, arguments); });
wrap(Game, 'onKey', f0 => function (code, repeat) {
  if (A.active && !repeat && (code === 'Escape' || code === 'KeyP') && this.state === 'playing' && !(A.BossD && A.BossD.Cut && A.BossD.Cut.active) && !(Intro && Intro.active)) {
    if (A.busy) { A.pauseWanted = true; return; } if (A.dying) { A.openMenu(); return; } }
  return f0.call(this, code, repeat); });
// interaction: remember where it started; cancel on distance
wrap(A, 'preIntent', f0 => function () { eqGuard(); const q0 = A.eQ; const r = f0.apply(this, arguments); const w = Game.world, p = w && w.player;
  if (p && A.eQ !== null && A.eQ !== undefined && A.eQ !== q0) A._eQpos = { x: p.x, z: p.z, ix: A.inter ? A.inter.x : p.x, iz: A.inter ? A.inter.z : p.z }; return r; });
const INTERACT_CANCEL = { move: 1.5, target: 3.4 };   // a held E press (chunk C queue) is dropped once Wren walks away from where she pressed it
function eqGuard() { const w = Game.world, p = w && w.player; if (!A.active || !p) return; const d = (x, z) => Math.hypot(x - p.x, z - p.z);
  if (A.eQ !== null && A.eQ !== undefined && A._eQpos) { const q = A._eQpos, it = A.inter, other = it && Math.hypot(it.x - q.ix, it.z - q.iz) > 0.5;
    if (d(q.x, q.z) > INTERACT_CANCEL.move || d(q.ix, q.iz) > INTERACT_CANCEL.target || other || p.dead) { A.eQ = null; A._eQpos = null; } } }
const interactGuard = eqGuard;
// focus loss (Chromebook: switching windows, closing the lid, the shelf): no stuck keys and a safe pause
function onFocusLoss() { try { Input.clear(); } catch (e) {} A.eQ = null; A._eQpos = null; Game.cT = null; Game.eT = null; try { if (G.Pad) G.Pad.held = {}; } catch (e) {}
  if (Game.state === 'playing') { try { Game.pause(); } catch (e) {} } else if (A.active && Game.state !== 'paused' && A.busy) A.pauseWanted = true;
  Tel.flush(true); }
window.addEventListener('blur', onFocusLoss);
document.addEventListener('visibilitychange', () => { if (document.hidden) onFocusLoss(); });
window.addEventListener('pagehide', () => Tel.flush(true));
// clamp live Tune edits and refuse NaN
wrap(Tune, 'set', f0 => function (path, v) { v = +v; if (!fin(v)) return; const d = (this.defs || []).find(x => x[1] === path); if (d && fin(d[2]) && fin(d[3])) v = clamp(v, d[2], d[3]); return f0.call(this, path, v); });
// per-frame watchdogs
const good = { pos: new THREE.Vector3(0, 2, 6), q: new THREE.Quaternion(), fov: 60, yaw: 0, pitch: 0.28, dist: 5.4, ok: false };
function camGuard() { const p = camera.position, q = camera.quaternion;
  const ok = fin(p.x) && fin(p.y) && fin(p.z) && fin(q.x) && fin(q.y) && fin(q.z) && fin(q.w) && fin(camera.fov);
  if (ok) { good.pos.copy(p); good.q.copy(q); good.fov = camera.fov; if (fin(Cam.yaw)) good.yaw = Cam.yaw; if (fin(Cam.pitch)) good.pitch = Cam.pitch; if (fin(Cam.curDist)) good.dist = Cam.curDist; good.ok = true; return true; }
  if (good.ok) { p.copy(good.pos); q.copy(good.q); camera.fov = good.fov; camera.updateProjectionMatrix(); }
  if (!fin(Cam.yaw)) Cam.yaw = good.yaw; if (!fin(Cam.pitch)) Cam.pitch = good.pitch; if (!fin(Cam.curDist)) Cam.curDist = good.dist;
  for (const k in Cam.vel) if (!fin(Cam.vel[k])) Cam.vel[k] = 0; for (const v of [Cam.lookSm, Cam.pre, Cam.look, Cam.lookAt]) if (v && !(fin(v.x) && fin(v.y) && fin(v.z))) v.copy(good.pos);
  if (!fin(Cam.trauma)) Cam.trauma = 0; if (!fin(Cam.fovKick)) Cam.fovKick = 0; if (!fin(Cam.gy)) Cam.gy = 0; if (!fin(Cam.lift)) Cam.lift = 0;
  if (CamFX && !(fin(CamFX.off.x) && fin(CamFX.off.y) && fin(CamFX.off.z))) CamFX.clear();
  Acc.nanFixes = (Acc.nanFixes || 0) + 1; return false; }
let lbFree = 0;
function cineGuard(dt) { const w = Game.world, has = f => !!(w && f && w.fighters.includes(f));
  // camera blend-out completes when its target is lost
  if (Finale.active && (!has(Finale.v) || !has(Finale.a))) { const out = Math.max(0, (Finale.dur || 2.7) - 0.55); if (Finale.t < out) Finale.t = out; Acc.lostTargets = (Acc.lostTargets || 0) + 1; }
  if (Finale.active && Finale.t > (Finale.dur || 2.7) + 1) Finale.active = false;
  if (Cine.cam !== null && Cine.cam !== undefined && !(w && w.byId(Cine.cam))) Cine.cam = null;
  const Cut = A.BossD && A.BossD.Cut, Sc = A.Scenes;
  if (Intro && Intro.active && Intro.boss && !has(Intro.boss) && !(Cut && Cut.active) && !(Sc && Sc.active)) { try { Intro.end(); } catch (e) { Intro.active = false; } }
  const F = A.BossD && A.BossD.Fin; if (F && F.cur && (!has(F.cur.v) || !has(F.cur.a))) F.cur = null;
  // a letterbox nobody owns (no intro, cutscene, finale, deathblow) is released after 3 s
  const owned = (Intro && Intro.active) || Finale.active || DB.active || (Cut && Cut.active) || (Sc && Sc.active) || (F && F.cur) || Letterbox.t > 0;
  if (Letterbox.on && !owned && Game.state === 'playing') { lbFree += dt; if (lbFree > 3) { Letterbox.set(false); lbFree = 0; } } else lbFree = 0; }

/* ---------------------------------------------------------------- 4. debug overlay (High / URL flag) */
const Overlay = Acc.Overlay = {
  on: false, url: false, el: null, n: 0, KEYS: ['Backslash', 'F8'],
  allowed() { return this.url || Settings.quality === 'high' || Settings.quality === 'ultra'; },
  checkUrl() { try { this.url = /[?&#]vhdebug(=1|=on|=true)?(&|$|#)/i.test(String(location.search) + '&' + String(location.hash) + '&') || /[?&#]vhdebug\b/i.test(String(location.href)); } catch (e) { this.url = false; } if (this.url) this.toggle(true); return this.url; },
  build() { if (this.el || !body()) return; const d = document.createElement('div'); d.id = 'vhDbg'; body().appendChild(d); this.el = d; },
  toggle(force) { const want = force === undefined ? !this.on : !!force; if (want && !this.allowed()) { if (force === undefined) toast('Debug overlay: High quality only (or open with ?vhdebug)'); return false; }
    this.build(); this.on = want; if (this.el) this.el.style.display = want ? 'block' : 'none'; if (want) this.render(); return this.on; },
  f(v, d) { if (v === undefined || v === null) return 'n/a'; if (typeof v === 'boolean') return v ? 'on' : 'off'; if (typeof v === 'number') return fin(v) ? v.toFixed(d === undefined ? 2 : d) : '<i>NaN!</i>'; return String(v).replace(/[<>&]/g, ''); },
  read(fn) { try { return fn(); } catch (e) { return undefined; } },
  lines() { const f = this.f.bind(this), rd = this.read, w = Game.world, p = w && w.player, T = rd(() => tier()) || {};
    const L = []; L.push('<b>VEYNHOLD DEBUG</b>  (\\ or F8 toggles)');
    L.push('quality      ' + f(Settings.quality) + ' (' + f(T.label) + ')  adaptive ' + (Settings.quality === 'low' ? 'idle' : 'armed') + (Perf && Perf.stepped ? ', stepped down' : '') + (G.GPU && G.GPU.weak ? ', weak GPU' : '') + '  fps ' + f(Game.fps, 0));
    L.push('deathblow    ' + (DB.active ? 'phase ' + f(DB.phase) + '  t ' + f(DB.t, 3) + '  src ' + f(DB.src) + (DB.final ? '  boss-final' : '') + (DB.variant ? '  variant ' + f(DB.variant) : '') : 'idle') + '  longSettle ' + f(Acc.longSettle) + ' (+' + f(Acc.settleExtra(), 2) + ' s)');
    const ch = p && rd(() => Game.chars.get(p.id)); const BS = rd(() => G.BladeSpring || (A.Blade && A.Blade.params) || null);
    if (BS && typeof BS === 'object') L.push('blade spring ' + Object.keys(BS).slice(0, 6).map(k => k + ' ' + f(typeof BS[k] === 'number' ? BS[k] : BS[k] === undefined ? undefined : String(BS[k]), 3)).join('  '));
    else L.push('blade spring lag ' + f(VISUAL.bladeLag, 1) + '  kick ' + f(VISUAL.bladeKick) + '  sway ' + f(VISUAL.bladeSway) + '  w ' + f(rd(() => ch && ch.bf && ch.bf.w)) + '  k/c n/a');
    L.push('plantT       ' + f(p && p.plantT, 3) + '   plant feel ' + f(Acc.plant));
    L.push('separation   ignoreSeparation ' + f(p && p.ignoreSeparation) + (w ? '  foes ' + w.fighters.filter(x => !x.isPlayer && x.ignoreSeparation).length : ''));
    const surf = p && rd(() => { const S = (A.Surf && A.Surf.at && ((x, z) => A.Surf.at(x, z, 'dbgOverlay'))) || (A.Surface && A.Surface.at) || A.surfaceAt || (A.api && A.api.Region && A.api.Region.surfaceAt) || G.surfaceAt; return typeof S === 'function' ? S(p.x, p.z) : undefined; });
    L.push('surface      ' + f(surf && typeof surf === 'object' ? (surf.id || surf.name || surf.kind) : surf));
    L.push('player       ' + (p ? f(p.state) + '  x ' + f(p.x) + ' z ' + f(p.z) + '  hp ' + f(p.hp, 0) + '  posture ' + f(p.posture, 0) : 'n/a') + '  state ' + f(Game.state));
    L.push('camera       yaw ' + f(Cam.yaw) + ' pitch ' + f(Cam.pitch) + ' dist ' + f(Cam.curDist) + ' fov ' + f(camera.fov, 1) + (Acc.nanFixes ? '  <i>NaN fixes ' + Acc.nanFixes + '</i>' : ''));
    L.push('cine         letterbox ' + f(!!Letterbox.on) + '  finale ' + f(!!Finale.active) + '  intro ' + f(!!(Intro && Intro.active)) + '  hold ' + f(Hold ? Hold.t : undefined, 3));
    L.push('access       cam ' + f(Acc.cam) + '  fx ' + f(Acc.fx) + '  tints ' + (Acc.cb ? 'cb-safe' : 'authored'));
    const td = Tel.data; if (td) L.push('telemetry    P/G/L ' + td.deflect.perfect + '/' + td.deflect.good + '/' + td.deflect.late + '  deathblows ' + td.deathblows + '  deaths ' + Object.values(td.deaths).reduce((a, b) => a + b, 0) + (Tel.mem ? '  (memory only)' : ''));
    return L; },
  render() { if (!this.el) return; const h = this.lines().join('\n'); if (h !== this._h) { this._h = h; this.el.innerHTML = h; } },
  update() { if (!this.on) return; if (!this.allowed()) { this.toggle(false); return; } if ((this.n++ % 6) === 0) this.render(); },
};
window.addEventListener('keydown', e => { if (e.repeat || !Overlay.KEYS.includes(e.code)) return; if (e.code === 'F8') e.preventDefault(); Overlay.toggle(); });

/* ---------------------------------------------------------------- 5. optional local telemetry (localStorage counters; never blocks) */
const Tel = Acc.Tel = {
  KEY: 'veynhold_telemetry', data: null, mem: false, dirty: false, lastFlush: 0, lastHit: null,
  fresh() { return { v: 1, deflect: { perfect: 0, good: 0, late: 0 }, deathblows: 0, unseen: 0, deaths: {} }; },
  load() { let d = null; try { const ls = window.localStorage; if (!ls) throw 0; const raw = ls.getItem(this.KEY); d = raw ? JSON.parse(raw) : null; } catch (e) { this.mem = true; }
    const f = this.fresh(); if (d && typeof d === 'object') { for (const k of ['perfect', 'good', 'late']) if (d.deflect && fin(d.deflect[k])) f.deflect[k] = d.deflect[k]; if (fin(d.deathblows)) f.deathblows = d.deathblows; if (fin(d.unseen)) f.unseen = d.unseen;
      if (d.deaths && typeof d.deaths === 'object') for (const k in d.deaths) if (fin(d.deaths[k])) f.deaths[k] = d.deaths[k]; }
    this.data = f; },
  bump(fn) { try { if (!this.data) this.load(); fn(this.data); this.dirty = true; } catch (e) {} },
  flush(force) { if (!this.dirty || !this.data) return; const now = Date.now(); if (!force && now - this.lastFlush < 2000) return; this.lastFlush = now; this.dirty = false;
    try { const ls = window.localStorage; if (!ls) throw 0; ls.setItem(this.KEY, JSON.stringify(this.data)); this.mem = false; } catch (e) { this.mem = true; } },
  reset() { this.data = this.fresh(); this.dirty = true; this.flush(true); },
  onEvent(e, w) { const p = w.player; if (!p || !e) return;
    if (e.type === 'deflect' && e.d === p.id && (e.quality === 'perfect' || e.quality === 'good' || e.quality === 'late')) this.bump(d => d.deflect[e.quality]++);
    else if (e.type === 'deathblow' && e.a === p.id) this.bump(d => { d.deathblows++; const en = A.api && A.api.Ents && A.api.Ents.byF && A.api.Ents.byF.get(e.d); if (en && en.unseen) d.unseen++; });
    else if (e.type === 'hit' && e.d === p.id) { const att = w.byId(e.a), def = CORE.ATTACKS[e.key]; this.lastHit = { t: w.time, by: att ? (att.profile && att.profile.look) || att.name || 'foe' : 'foe', how: def && def.projectile ? 'projectile' : e.grab ? 'grab' : (def && def.type) || (e.heavy ? 'heavy' : 'strike') }; }
    else if (e.type === 'crimsonChip' && e.d === p.id) this.lastHit = { t: w.time, by: 'king', how: 'chip' };
    else if (e.type === 'death' && e.f === p.id) { const h = this.lastHit, cause = h && w.time - h.t < 4 ? String(h.by).replace(/[^\w-]/g, '') + ':' + h.how : 'unknown'; this.lastHit = null; this.bump(d => { d.deaths[cause] = (d.deaths[cause] || 0) + 1; }); this.flush(true); } },
};

/* ---------------------------------------------------------------- event hook (outermost): deathblow tracker before the presentation reacts, telemetry */
const _evs = [];   // INT5 perf: reused snapshot (no per-frame slice)
wrap(Game, 'handleEvents', f0 => function () { const w = this.world; const evs = _evs; evs.length = 0; if (w && w.events) for (let i = 0; i < w.events.length; i++) evs.push(w.events[i]);
  try { for (let i = 0; i < evs.length; i++) { const e = evs[i], p = w.player; if (!p) break;
      if ((e.type === 'deathblowStart' && (e.attacker === p.id || e.a === p.id)) || (e.type === 'deathblow' && e.a === p.id && !(DB.active && DB.src === 'core-event'))) {
        const vic = w.byId(e.victim !== undefined ? e.victim : e.d); DB.start(p, vic, e.type === 'deathblowStart' ? 'core-event' : 'event', e); }
      if (e.type === 'deathblowUnlock' && DB.active) DB.unlocked = true; } } catch (x) { console.error(x); }
  const r = f0.apply(this, arguments);
  try { for (let i = 0; i < evs.length; i++) Tel.onEvent(evs[i], w); if (Tel.dirty) Tel.flush(false); } catch (x) {}
  evs.length = 0; return r; });

/* ---------------------------------------------------------------- frame hook (outermost) */
let lastNow = 0, lastLow = null;
wrap(Game, 'frame', f0 => function (now) { const r = f0.apply(this, arguments); const dt = lastNow && now > lastNow ? Math.min(0.1, (now - lastNow) / 1000) : 0; lastNow = now;
  try { const w = this.world; const b = body();
    if (b) { const low = Settings.quality === 'low'; if (low !== lastLow) { lastLow = low; b.classList.toggle('vhLow', low); } }
    if (w && this.state === 'playing') DB.update(dt, w); else if (!w && DB.active) DB.clear();
    if (this.state !== 'playing' || !w) hidePrompt(false);
    cineGuard(dt); camGuard(); interactGuard();
    if (A.pauseWanted) { if (!A.active || this.state === 'title') A.pauseWanted = false; else if (this.state === 'playing' && !A.busy && A.openMenu) A.openMenu(); }
    Overlay.update(); } catch (e) { if (!Acc._err) { Acc._err = true; console.error('[Veynhold] I3 frame', e); } }
  return r; });

/* ---------------------------------------------------------------- boot */
function boot() { injectCSS(); Acc.load(); Tel.load(); Panel.build(); Overlay.checkUrl(); }
if (document.body) boot(); else document.addEventListener('DOMContentLoaded', boot);
})();
