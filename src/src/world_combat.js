/* =====================================================================
   VEYNHOLD — CHUNK H4: COMBAT MECHANICS (wrapper layer only; core.js untouched, v8 timings unchanged)
   - Vitality: a wounded foe recovers posture more slowly. The core already scales regen by c = 0.35 + 0.65·hp; this layer
     adds back actualRegen × (1 − m/c) so the effective factor is m: 1.0 at full health down to 0.35 at 25% health or less.
     It only ever slows recovery (never adds posture past the bar, never causes a break). Cues: the foe's posture bar warms from
     amber to red, a thud and embers at 50% and 25% health, a one-time hint.
   - Guard regain: health lost to blocked heavy blows (block / guard break with no clean hit that tick) becomes a grey striped
     "recoverable" segment. Landing a hit within 3 s gives back min(rec, dmg × 0.75); a deathblow gives back all of it. Taking a
     clean hit clears it; after 3 s it drains away. Gold spark + chime on each restore, a one-time hint.
   - Charged heavy: hold RMB / K / pad X and the heavy (p_h) holds its windup at su × 0.5 − ε. Held 0.6 s it is CHARGED:
     +24 posture on hit, +30 on block; a light foe gets extra stun on hit or a 0.7 s recoil on block. Cues: charge ring, tip light,
     hum then ting, sword-edge flash, CHARGED in #chain, a release whoosh (the original early whoosh is muted while held).
   - Deflect tiers: the player's perfect deflect kicks harder (kick ×1.7, light ×1.5, pitch ×1.12); a late one is dull
     (sparks ×0.45, kick ×0.45, light ×0.5 in dull orange, embers, pitch ×0.85).
   - Stealth polish (world mode): a cue when an unseen deathblow becomes available, a muffled kill layer, an ink puff, the
     tutorial line. The deathblow animation and camera are not touched.
   Hooks: CORE.World.prototype.step / stepFighter (only when this === Game.world), Game.handleEvents, P1.HUD.update,
   audio.play / audio.tone (pitch + mute wrappers only), Pad.poll.
   ===================================================================== */
(function () {
'use strict';
const G = window.VEYN_GAME, CORE = window.VEYN_CORE, A = window.VEYN_ADV;
if (!G || !CORE || !G.P1) { console.warn('[Veynhold] chunk H4 (combat) unavailable'); return; }
const THREE = window.THREE, P1 = G.P1, $ = id => document.getElementById(id);
const { Game, Input, FX, Cam, Pad, Coach } = G; const { audio, HUD, PostFX, toast } = P1; const VFX = G.V7 && G.V7.VFX;
const { CONFIG, clamp, atkPhase, addPosture } = CORE; const World = CORE.World;
const HEADLESS = !!window.__VEYN_HEADLESS;

const CFG = {
  vit: { floor: 0.35, lowAt: 0.25, player: false, bands: [0.5, 0.25] },
  regain: { window: 3.0, ratio: 0.75, drainT: 0.6 },
  heavy: { key: 'p_h', chargeT: 0.6, holdFrac: 0.5, eps: 0.004, maxHold: 2.0, postHit: 24, postBlock: 30, lightStun: 0.35, lightRecoil: 0.7, lightPostureMax: 100, visWind: 0.88, visRamp: 0.3 },
  deflect: { perfect: { spark: 1, kick: 1.7, light: 1.5, pitch: 1.12 }, late: { spark: 0.45, kick: 0.45, light: 0.5, pitch: 0.85, color: 0xb0602a, streak: 0.5, streakCol: [0.85, 0.45, 0.2], glare: 0.7, glareCol: [0.9, 0.55, 0.3] } },
};
const M = window.VEYN_COMBAT = { CFG, plainHeavies: 0, rec: 0, recT: -99, drain0: 0, restored: 0, chg: null, tier: null, pitch: 1, stl: null, stats: { restores: 0, restoredHp: 0, charged: 0, chargedHits: 0, chargedBlocks: 0, lightRecoils: 0, vitBack: 0, stealthCues: 0, perfect: 0, late: 0 }, log: [] };
const note = s => { M.log.push(s); if (M.log.length > 40) M.log.shift(); };
const live = w => w && w === Game.world;

/* ---------------------------------------------------------------- one-time hints (saved in world mode; per browser in the arena) */
const HK = 'veynhold_h4_hints';
let hintSeen = {}; try { hintSeen = JSON.parse(localStorage.getItem(HK) || '{}') || {}; } catch (e) { hintSeen = {}; }
M.hint = function (key, text, dur) {
  const S = A && A.active && A.api && A.api.Save && A.api.Save.data; if (S && S.hints) { if (S.hints['h4_' + key]) return false; S.hints['h4_' + key] = true; }
  else { if (hintSeen[key]) return false; hintSeen[key] = true; try { localStorage.setItem(HK, JSON.stringify(hintSeen)); } catch (e) {} }
  M.lastHint = key; note('hint ' + key);
  if (A && A.active && A.UI && A.UI.hint) A.UI.hint(text, dur || 6); else if (toast) toast(text); return true; };

/* ---------------------------------------------------------------- vitality curve */
const vitM = h => { const V = CFG.vit; h = clamp(h, 0, 1); return V.floor + (1 - V.floor) * clamp((h - V.lowAt) / (1 - V.lowAt), 0, 1); };
const coreC = h => 0.35 + 0.65 * clamp(h, 0, 1);
M.vitM = vitM; M.coreC = coreC;
// exactly the regen the core is about to apply inside this stepFighter (same conditions, same order: f.lt already advanced)
function coreRegen(f, dt) {
  if (f.state === 'broken' || f.dead) return 0; const cfg = f.isPlayer ? CONFIG.player : f.profile; if (!cfg) return 0;
  if (f.lt - f.lastPostureHit < cfg.postureRegenDelay) return 0;
  let rate = cfg.postureRegen * (!f.isPlayer && f.phase === 2 && f.profile.phase2 ? (f.profile.phase2.postureRegenMult || 1) : 1);
  rate *= coreC(f.hp / f.maxHp); if (f.guard) rate *= CONFIG.player.guardRegenMult;
  return Math.max(0, Math.min(f.posture, rate * dt)); }

/* ---------------------------------------------------------------- charged heavy: input */
const padHeld = { x: false };
M.isHeld = () => !!(Input.rmb || Input.keys.KeyK || padHeld.x || M.forceHold);
const isLight = f => !f.isPlayer && f.profile && !f.profile.boss && !f.superarmor && f.postureMax <= CFG.heavy.lightPostureMax;
M.isLight = isLight;

/* ---------------------------------------------------------------- sim hooks */
const WP = World.prototype, sf0 = WP.stepFighter, st0 = WP.step;
WP.stepFighter = function (f, dt) {
  if (!live(this)) return sf0.call(this, f, dt);
  // vitality: measure the core's regen before it runs, add back the part the curve takes away
  let back = 0; if ((!f.isPlayer || CFG.vit.player) && !f.dead) { const h = f.hp / f.maxHp; if (h < 1) { const act = coreRegen(f, dt); if (act > 0) back = act * (1 - vitM(h) / coreC(h)); } }
  // charged heavy: hold the windup while the button is held
  const C = M.chg; if (f.isPlayer && C && f.atk && f.atk.id === C.id && f.state === 'attack') {
    const inst = f.atk, H = CFG.heavy, holdAt = inst.su * H.holdFrac - H.eps;
    if (C.holding) {
      if (M.isHeld() && C.t < H.maxHold) { C.t += dt; if (inst.t + dt > holdAt) { inst.t = Math.max(0, holdAt - dt); C.clamped = true; }
        if (!C.charged && C.t >= H.chargeT) { C.charged = true; M.stats.charged++; M.fxq.push({ k: 'charged' }); note('charged'); } }
      else { C.holding = false; C.releasedAt = this.time; M.fxq.push({ k: 'release', charged: C.charged, clamped: C.clamped, left: Math.max(0, inst.su - inst.t) }); note('release ' + C.t.toFixed(2) + (C.charged ? ' charged' : '')); }
    } }
  sf0.call(this, f, dt);
  if (back > 0 && !f.dead && f.state !== 'broken') { const lim = f.postureMax - 0.01; if (f.posture < lim) { const add = Math.min(back, lim - f.posture); f.posture += add; M.stats.vitBack += add; } }
  // the charge hint: after the second plain (uncharged) heavy
  if (f.isPlayer && C && !C.hinted && f.atk && f.atk.id === C.id && atkPhase(f.atk) !== 'startup') { C.hinted = true; if (!C.clamped && ++M.plainHeavies >= 2) M.fxq.push({ k: 'chargeHint' }); }
  // a heavy that just started: arm the charge (a tap is just the normal heavy)
  if (f.isPlayer && f.state === 'attack' && f.atk && f.atk.def.key === CFG.heavy.key && (!M.chg || M.chg.id !== f.atk.id)) {
    M.chg = { id: f.atk.id, holding: M.isHeld(), t: 0, charged: false, clamped: false, startedAt: this.time, applied: new Set(), whooshDue: performance.now() + f.atk.su * 1000 - 40 };
    if (M.chg.holding) M.fxq.push({ k: 'hum' }); }
};
WP.step = function (dt) {
  if (!live(this)) return st0.call(this, dt);
  if (M.worldRef !== this) { M.worldRef = this; M.rec = 0; M.drain0 = 0; M.recT = -99; M.chg = null; M.stl = null; bandOf.clear(); M.fxq.length = 0; }
  const p = this.player, hp0 = p ? p.hp : 0, n0 = this.events.length;
  st0.call(this, dt);
  if (!p) return; const evs = this.events; let blocked = false, struck = false, dealt = 0, db = false;
  for (let i = n0; i < evs.length; i++) { const e = evs[i];
    if ((e.type === 'block' || e.type === 'guardbreak' || e.type === 'crimsonChip') && e.d === p.id) blocked = true;
    if (e.type === 'hit' && e.d === p.id) struck = true;
    if (e.type === 'hit' && e.a === p.id) dealt += e.dmg || 0;
    if (e.type === 'deathblow' && e.a === p.id) db = true;
    if (e.a === p.id && (e.type === 'hit' || e.type === 'block' || e.type === 'guardbreak')) chargedLanded(this, p, e); }
  // ---- guard regain
  const R = CFG.regain;
  if (p.dead || struck) { if (M.rec > 0) note('regain cleared'); M.rec = 0; M.drain0 = 0; }
  else if (blocked && p.hp < hp0 - 1e-6) { M.rec = Math.min(p.maxHp - p.hp, M.rec + (hp0 - p.hp)); M.recT = this.time; M.drain0 = 0; M.fxq.push({ k: 'chip' }); }
  if (M.rec > 0 && !p.dead && (dealt > 0 || db) && this.time - M.recT <= R.window) {
    const give = db ? M.rec : Math.min(M.rec, dealt * R.ratio); if (give > 0) { p.hp = Math.min(p.maxHp, p.hp + give); M.rec -= give; M.stats.restores++; M.stats.restoredHp += give; M.fxq.push({ k: 'regain', hp: give, all: db }); note('regain +' + give.toFixed(1)); } }
  if (M.rec > 0 && this.time - M.recT > R.window) { if (!M.drain0) M.drain0 = M.rec; M.rec = Math.max(0, M.rec - M.drain0 / R.drainT * dt); if (!M.rec) M.drain0 = 0; }
};
function chargedLanded(w, p, e) {
  const C = M.chg, H = CFG.heavy; if (!C || !C.charged || C.applied.has(e.d) || !p.atk || p.atk.id !== C.id) return; const d = w.byId(e.d); if (!d || d.dead) return;
  C.applied.add(e.d);
  if (e.type === 'hit') { M.stats.chargedHits++; if (d.state !== 'broken' && d.posture < d.postureMax) addPosture(w, d, H.postHit);
    if (isLight(d) && d.state === 'hit') { d.stateDur += H.lightStun; } }
  else { M.stats.chargedBlocks++; if (d.state !== 'broken' && d.posture < d.postureMax) addPosture(w, d, H.postBlock);
    if (isLight(d) && d.state !== 'broken' && !d.dead) { d.atk = null; d.comboQueue.length = 0; d.comboBr = null; d.guard = false; d.setState('recoil', H.lightRecoil); w.releaseToken(d); M.stats.lightRecoils++; } }
  M.fxq.push({ k: 'chargedLand', d: e.d, block: e.type !== 'hit', broke: d.state === 'broken' }); note('charged ' + e.type + ' on ' + d.name);
}
M.fxq = [];
const bandOf = new Map();

/* ---------------------------------------------------------------- audio: pitch + whoosh mute (wrappers only) */
const tone0 = audio.tone.bind(audio), play0 = audio.play.bind(audio);
audio.tone = function (freq, dur, type, peak, delay, slideTo) { const k = M.pitch || 1; return tone0(freq * k, dur, type, peak, delay, slideTo ? slideTo * k : slideTo); };
audio.play = function (name, o) {
  if (name === 'whoosh' && o && o.heavy && !M.ownWhoosh) { const C = M.chg; if (C && C.clamped && Math.abs(performance.now() - C.whooshDue) < 120 && Game.world && Game.world.player.atk && Game.world.player.atk.id === C.id) { M.mutedWhoosh = (M.mutedWhoosh || 0) + 1; return; } }
  if (M.tier && (name === 'deflect' || name === 'perfect' || name === 'late')) { const T = CFG.deflect[M.tier], pk = M.pitch; M.pitch = T.pitch; M.lastTierPitch = T.pitch; try { return play0(name, o); } finally { M.pitch = pk; } }
  return play0(name, o); };
const sfx = {
  hum() { if (!audio.ok) return; const T = CFG.heavy.chargeT; audio.tone(92, T, 'sawtooth', 0.035, 0, 150); audio.tone(184, T, 'sine', 0.03, 0.05, 300); audio.nz(T, 'bandpass', 500, 2, 0.04, 0.2, 0, 1400); },
  ting() { if (!audio.ok) return; [2637, 3951, 5274].forEach((f, i) => audio.tone(f, 0.55 - i * 0.12, 'sine', 0.07 / (i + 1), i * 0.01)); audio.tone(110, 0.25, 'sine', 0.12, 0, 70); },
  release(charged) { M.ownWhoosh = true; try { audio.play('whoosh', { heavy: true, vol: charged ? 1.35 : 1 }); if (charged && audio.ok) { audio.nz(0.3, 'bandpass', 300, 0.9, 0.22, 0.25, 0, 1600); audio.tone(70, 0.3, 'sine', 0.18, 0, 45); } } finally { M.ownWhoosh = false; } },
  thud(k) { if (!audio.ok) return; audio.tone(58, 0.45, 'sine', 0.22 + 0.1 * k, 0, 36); audio.nz(0.14, 'lowpass', 320, 1, 0.16, 0.2); },
  chime() { if (!audio.ok) return; [1318.5, 1760, 2637].forEach((f, i) => audio.tone(f, 0.5 - i * 0.1, 'sine', 0.06 / (i + 1), i * 0.045)); },
  chip() { if (!audio.ok) return; audio.tone(240, 0.12, 'triangle', 0.035, 0, 160); },
  crush() { if (!audio.ok) return; audio.tone(64, 0.4, 'sine', 0.3, 0, 38); audio.nz(0.12, 'lowpass', 700, 1, 0.3, 0.2); },
  stealthCue() { if (!audio.ok) return; audio.nz(0.35, 'bandpass', 900, 3, 0.03, 0.3, 0, 500); audio.tone(1760, 0.3, 'sine', 0.018, 0.05); },
  muffled() { if (!audio.ok) return; audio.nz(0.5, 'lowpass', 380, 0.9, 0.35, 0.45, 0.18, 160); audio.tone(46, 0.7, 'sine', 0.3, 0.2, 30); audio.nz(0.25, 'bandpass', 600, 1.5, 0.08, 0.3, 0.05, 300); },
  emberHiss() { if (!audio.ok) return; audio.nz(0.18, 'highpass', 2200, 0.8, 0.05, 0.2, 0.02); },
};
M.sfx = sfx;

/* ---------------------------------------------------------------- FX scale wrappers for the deflect tiers */
const spark0 = FX.spark.bind(FX), kick0 = FX.kick.bind(FX), flash0 = FX.flash.bind(FX);
FX.spark = function (pos, n, s, col) { const T = M.tier && CFG.deflect[M.tier]; return spark0(pos, T ? Math.max(1, Math.round(n * T.spark)) : n, s, col); };
FX.kick = function (a) { const T = M.tier && CFG.deflect[M.tier]; return kick0(T ? a * T.kick : a); };
FX.flash = function (pos, color, power) { const T = M.tier && CFG.deflect[M.tier]; if (T) { M.lastFlash = { tier: M.tier, power: power * T.light, color: T.color || color }; return flash0(pos, T.color || color, power * T.light); } return flash0(pos, color, power); };
if (VFX && VFX.streaks && VFX.streaks.burst) { const sb0 = VFX.streaks.burst.bind(VFX.streaks); VFX.streaks.burst = function (pos, n, s, col) { const T = M.tier && CFG.deflect[M.tier]; if (T && T.streak) return sb0(pos, Math.max(1, Math.round(n * T.streak)), s, T.streakCol || col); return sb0(pos, n, s, col); }; }
if (VFX && VFX.glare) { const gl0 = VFX.glare.bind(VFX); VFX.glare = function (pos, rgb, size, dur) { const T = M.tier && CFG.deflect[M.tier]; if (T && T.glare) return gl0(pos, T.glareCol || rgb, size * T.glare, dur); return gl0(pos, rgb, size, dur); }; }
const _v = new THREE.Vector3();
function chest(f, y) { const c = Game.chars.get(f.id); if (c) return _v.copy(c.root.position).setY((c.gy || 0) + (y || 1.3) * (c.look ? c.look.scale : 1)); return _v.set(f.x, (y || 1.3), f.z); }
function embers(pos, n, col) { for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, sp = 0.3 + Math.random() * 0.8; FX.sparks.spawn(pos.x + (Math.random() - 0.5) * 0.3, pos.y + (Math.random() - 0.5) * 0.4, pos.z + (Math.random() - 0.5) * 0.3, Math.cos(a) * sp, 0.6 + Math.random() * 1.2, Math.sin(a) * sp, 0.7 + Math.random() * 0.6, col[0], col[1], col[2], -0.6); } }
function inkPuff(pos, n) { for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, sp = 0.4 + Math.random() * 1.4; FX.dust.spawn(pos.x, pos.y + (Math.random() - 0.5) * 0.3, pos.z, Math.cos(a) * sp, 0.2 + Math.random() * 0.9, Math.sin(a) * sp, 0.8 + Math.random() * 0.5, 0.05, 0.045, 0.06, -0.2); } }
M.fx = { embers, inkPuff };

/* ---------------------------------------------------------------- events: deflect tiers (split so only the deflect's own effects scale), stealth layers */
const he0 = Game.handleEvents;
const tierOf = (e, w) => { if (e.type !== 'deflect' || (e.quality !== 'perfect' && e.quality !== 'late')) return null; const d = w.byId(e.d); return d && d.isPlayer ? e.quality : null; };
Game.handleEvents = function () {
  const w = this.world; if (!w || !w.events.length) return he0.apply(this, arguments);
  for (const e of w.events) onEvent(w, e);
  if (!w.events.some(e => tierOf(e, w))) return he0.apply(this, arguments);
  const evs = w.events, all = evs.slice(); let r, batch = [];
  const run = (list, tier) => { w.events = list; M.tier = tier; try { r = he0.apply(this, arguments); } finally { M.tier = null; w.events = evs; } };
  for (const e of all) { const t = tierOf(e, w); if (t) { if (batch.length) { run(batch, null); batch = []; } run([e], t); afterTier(w, e, t); } else batch.push(e); }
  if (batch.length) run(batch, null);
  evs.length = 0; return r; };
function afterTier(w, e, t) { M.stats[t]++; const a = w.byId(e.a), d = w.byId(e.d); const pos = a && d ? chest(d, 1.35).clone().lerp(chest(a, 1.35), 0.5) : _v.set(e.x, 1.3, e.z).clone();
  if (t === 'late') { embers(pos, 10, [0.9, 0.42, 0.12]); sfx.emberHiss(); M.hint('late', 'LATE deflect: it held, but weakly. Press F a moment earlier for a Perfect deflect.', 6); }
  else { const c = Game.chars.get(e.d); if (c) c.edgeFlash = 1; } }
function onEvent(w, e) {
  const p = w.player; if (!p) return;
  if (e.type === 'deathblow' && e.a === p.id && A && A.active && A.api) { const en = A.api.Ents.byF.get(e.d);
    if (en && en.unseen) { const f = en.f; sfx.muffled(); M.stats.stealthKills = (M.stats.stealthKills || 0) + 1; note('stealth kill ' + f.name);
      setTimeout(() => { const pos = chest(f, 1.15).clone(); inkPuff(pos, 26); if (VFX && VFX.splash) VFX.splash(pos, true, 0); }, 420); } }
}

/* ---------------------------------------------------------------- per-frame presentation (HUD.update wrapper) */
let regainEl = null, lastTipK = 0;
function ensureDom() { if (regainEl && regainEl.isConnected) return; const bar = document.querySelector('#hudPlayer .bar.hp'); if (!bar) return;
  regainEl = document.createElement('i'); regainEl.id = 'pRegain'; bar.appendChild(regainEl);
  if (!$('h4css')) { const st = document.createElement('style'); st.id = 'h4css'; st.textContent =
    '#pRegain{position:absolute;top:0;bottom:0;left:0;width:0;display:block;z-index:1;background:repeating-linear-gradient(-45deg,rgba(214,208,196,.92) 0 3px,rgba(120,114,106,.9) 3px 6px);box-shadow:inset 0 0 0 1px rgba(0,0,0,.35);transition:opacity .2s}' +
    '#pRegain.drain{opacity:.45}#pRegain.pop{animation:h4pop .45s ease-out}@keyframes h4pop{0%{box-shadow:0 0 0 1px #ffe08a,0 0 14px 4px rgba(255,210,110,.9)}100%{box-shadow:inset 0 0 0 1px rgba(0,0,0,.35)}}' +
    '#pHp.h4gold{animation:h4gold .5s ease-out}@keyframes h4gold{0%{filter:brightness(2.2) sepia(.6)}100%{filter:none}}' +
    '#chargeRing.h4heavy{height:5px;width:96px;margin-left:-48px}#chargeRing.h4full{box-shadow:0 0 10px 2px rgba(255,140,60,.75)}' +
    '#chain.h4chg{color:#ffb070;letter-spacing:6px;text-shadow:0 0 10px rgba(255,120,40,.8),0 0 4px #000}' +
    '#tPostBar.h4wound::after{background:rgba(255,120,80,.8)}' +
    '#advPrompt.h4stl{animation:h4stl .5s ease-out}@keyframes h4stl{0%{transform:translateX(-50%) scale(1.25);text-shadow:0 0 14px rgba(160,190,255,.9)}100%{transform:translateX(-50%) scale(1)}}';
    document.head.appendChild(st); } }
const hu0 = HUD.update;
HUD.update = function (dt, w, target) {
  const r = hu0.apply(this, arguments); if (!w || !w.player) return r; ensureDom(); const p = w.player;
  try { frameFx(dt, w, p); hud(dt, w, p); } catch (e) { if (!M._err) { M._err = true; console.error('[H4]', e); } }
  return r; };
function frameFx(dt, w, p) {
  const q = M.fxq.splice(0); const pc = Game.chars.get(p.id);
  for (const x of q) switch (x.k) {
    case 'hum': sfx.hum(); break;
    case 'chargeHint': M.hint('charge', 'Hold right click (or K / pad X) to charge a heavy: a charged blow crushes posture and staggers light foes.', 7); break;
    case 'charged': sfx.ting(); if (pc) { pc.edgeFlash = 1; FX.ring(pc.tipW, 0xffb060, 3, 0.25); spark0(pc.tipW, 10, 0.5, [1, 0.7, 0.35]); } if (G.Post && G.Post.pulse) G.Post.pulse('255,170,90', 0.12); break;
    case 'release': if (x.clamped) setTimeout(() => sfx.release(x.charged), Math.max(0, x.left * 1000 - 40)); break;
    case 'chargedLand': { const d = w.byId(x.d); if (d) { const pos = chest(d, 1.3).clone(); sfx.crush(); FX.ring(pos, 0xff9a40, 8, 0.32); spark0(pos, 18, 1.1, [1, 0.6, 0.25]); kick0(0.1); if (PostFX && PostFX.punch) PostFX.punch(0.014); } break; }
    case 'chip': sfx.chip(); if (M.rec > 0.5) M.hint('regain', 'Grey health is chip from blocked heavy blows. Strike back within 3 s to win it back; a deathblow restores it all.', 7); break;
    case 'regain': { sfx.chime(); if (pc) { const pos = chest(p, 1.2).clone(); spark0(pos, x.all ? 22 : 12, 0.6, [1, 0.84, 0.35]); FX.ring(pos, 0xffd27a, 4, 0.22); }
      const h = $('pHp'); if (h) { h.classList.remove('h4gold'); void h.offsetWidth; h.classList.add('h4gold'); } if (regainEl) { regainEl.classList.remove('pop'); void regainEl.offsetWidth; regainEl.classList.add('pop'); } break; }
  }
  // tip light + edge glow while the heavy is held
  const C = M.chg; const holding = C && C.holding && p.atk && p.atk.id === C.id;
  if (holding && pc) { const k = clamp(C.t / CFG.heavy.chargeT, 0, 1); lastTipK = k; flash0(pc.tipW, C.charged ? 0xff8a3a : 0xffc070, (C.charged ? 2.6 : 0.6 + 1.6 * k) * (1 + 0.12 * Math.sin(performance.now() / 45)));
    if (C.charged) pc.edgeFlash = Math.max(pc.edgeFlash || 0, 0.6); else pc.edgeFlash = Math.max(pc.edgeFlash || 0, 0.25 * k);
    if (C.charged && Math.random() < dt * 14) spark0(pc.tipW, 1, 0.25, [1, 0.6, 0.25]); tipSprite(pc.tipW, k, C.charged); }
  else tipSprite(null);
  // vitality cues: thud + embers when a fighting foe drops to 50% / 25% health
  for (const e of w.enemies()) { if (e.hp <= 0 || e.dead) continue; const h = e.hp / e.maxHp, b = h <= CFG.vit.bands[1] ? 2 : h <= CFG.vit.bands[0] ? 1 : 0, b0 = bandOf.get(e.id) || 0;
    if (b > b0) { const near = Math.hypot(e.x - p.x, e.z - p.z) < 18; if (near) { sfx.thud(b); embers(chest(e, 1.3).clone(), b === 2 ? 16 : 10, b === 2 ? [1, 0.25, 0.08] : [1, 0.55, 0.15]); M.stats.vitCues = (M.stats.vitCues || 0) + 1;
        M.hint('vitality', 'A wounded foe recovers posture slowly. Keep pressing as their health falls.', 6); } }
    bandOf.set(e.id, b); }
  if (bandOf.size > 64) bandOf.clear();
  // stealth: a cue the moment an unseen deathblow becomes available
  if (A && A.active && A.api && Game.state === 'playing' && !p.dead) { const Inv = A.api.Inv, Ents = A.api.Ents;
    const st = Inv.count('wardblade') && !w.deathblowCandidate(p) ? Ents.stealthTarget(p) : null;
    if (st && st !== M.stl) { sfx.stealthCue(); M.stats.stealthCues++; const pr = $('advPrompt'); if (pr) { pr.classList.remove('h4stl'); void pr.offsetWidth; pr.classList.add('h4stl'); }
      M.hint('stealth', 'Unseen: press E to slay this foe in one blow. Stay behind them and don\u2019t sprint.', 6); }
    M.stl = st || null; } else M.stl = null;
}
function hud(dt, w, p) {
  // recoverable (grey) health
  if (regainEl) { const hp = p.hp / p.maxHp, rk = clamp(M.rec / p.maxHp, 0, 1 - hp); regainEl.style.left = hp * 100 + '%'; regainEl.style.width = rk * 100 + '%'; regainEl.style.display = rk > 0.001 ? 'block' : 'none'; regainEl.classList.toggle('drain', w.time - M.recT > CFG.regain.window); }
  // target posture bar: amber -> red as the foe's posture recovery slows
  const t = (Game.hudTarget ? Game.hudTarget(w) : w.enemies()[0]) || null, tp = $('tPost'), tb = $('tPostBar');
  if (tp) { const k = t && !t.dead ? clamp((1 - vitM(t.hp / t.maxHp)) / (1 - CFG.vit.floor), 0, 1) : 0; M.tPostK = k; const f = k > 0.02 ? 'sepia(' + (0.45 * k).toFixed(2) + ') saturate(' + (1 + 1.6 * k).toFixed(2) + ') hue-rotate(' + (-32 * k).toFixed(1) + 'deg)' : '';
    if (tp.style.filter !== f) tp.style.filter = f; if (tb) tb.classList.toggle('h4wound', k > 0.6); }
  // charged heavy: ring + CHARGED
  const C = M.chg, ch = $('chargeRing'), atkOn = C && p.atk && p.atk.id === C.id && p.state === 'attack';
  if (ch && atkOn && (C.holding || C.charged) && Game.state === 'playing') { const k = clamp(C.t / CFG.heavy.chargeT, 0, 1); if (C.holding && k > 0.12) { ch.style.display = 'block'; ch.classList.add('h4heavy'); ch.classList.toggle('h4full', k >= 1); ch.firstChild.style.width = k * 100 + '%'; ch.firstChild.style.background = k >= 1 ? '#ff7a3d' : '#f0d68a'; }
    else if (!C.holding && !Input.lmbDown) ch.style.display = 'none'; }
  else if (ch && ch.classList.contains('h4heavy')) { ch.classList.remove('h4heavy', 'h4full'); if (!Input.lmbDown) ch.style.display = 'none'; }
  const el = $('chain'); if (el) { const show = atkOn && C.charged && atkPhase(p.atk) !== 'recovery';
    if (show) { if (HUD.chainTxt !== 'CHARGED') { HUD.chainTxt = 'CHARGED'; el.textContent = 'CHARGED'; el.style.opacity = 1; el.classList.add('h4chg'); } }
    else if (el.classList.contains('h4chg')) { el.classList.remove('h4chg'); if (HUD.chainTxt === 'CHARGED') { HUD.chainTxt = ''; el.style.opacity = 0; } } }
}

/* ---------------------------------------------------------------- held heavy, presentation only: the pose keeps winding up to a full overhead
   (0.88·su of the clip) while the sim clock stays parked at su/2, then runs on from there so the blade still lands exactly at su. */
if (G.Character && G.Character.prototype.update) { const CH = G.Character.prototype, cu0 = CH.update;
  CH.update = function (dt, alpha, now) { const f = this.f, C = M.chg; if (!f || !f.isPlayer || !C || !C.clamped || !f.atk || f.atk.id !== C.id || f.state !== 'attack' || f.atk.t >= f.atk.su) return cu0.apply(this, arguments);
    const a = f.atk, t = a.t, H = CFG.heavy, holdAt = a.su * H.holdFrac, V = a.su * H.visWind; let v;
    if (C.holding) { const k = clamp((C.t - holdAt) / H.visRamp, 0, 1); v = holdAt + (V - holdAt) * k * k * (3 - 2 * k); C.vLast = v; }
    else { if (C.vRel === undefined) C.vRel = C.vLast || holdAt; v = C.vRel + clamp((t - holdAt) / (a.su - holdAt), 0, 1) * (a.su - C.vRel); }
    a.t = v; M.visT = v; try { return cu0.apply(this, arguments); } finally { a.t = t; } }; }
let tipGlow = null;
function tipSprite(pos, k, charged) { if (!tipGlow) { try { const tex = P1.glowTex(); tipGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); tipGlow.renderOrder = 5; G.scene.add(tipGlow); } catch (e) { tipGlow = false; } }
  if (!tipGlow) return; if (!pos) { tipGlow.visible = false; return; } tipGlow.visible = true; tipGlow.position.copy(pos); const s = charged ? 0.95 + 0.12 * Math.sin(performance.now() / 60) : 0.25 + 0.5 * k; tipGlow.scale.set(s, s, s);
  tipGlow.material.opacity = charged ? 1 : 0.35 + 0.5 * k; tipGlow.material.color.setHex(charged ? 0xffd0a0 : 0xffffff); }
/* ---------------------------------------------------------------- gamepad: X = heavy on press (hold to charge); A = light on release, hold = charged thrust (like the mouse) */
const poll0 = Pad.poll.bind(Pad); let aT = 0, aPrev = false, xPrev = false;
Pad.poll = function () {
  const P = Input.pressed, had = { J: !!P.KeyJ, K: !!P.KeyK, C: !!P.LMB_CHARGED };
  poll0();
  let gp = null; try { const list = navigator.getGamepads ? navigator.getGamepads() : []; for (const g of list) if (g && g.connected) { gp = g; break; } } catch (e) {}
  if (!gp) { padHeld.x = false; aPrev = xPrev = false; return; }
  const b = i => !!(gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.5)); const a = b(0), x = b(2);
  // undo the v8 mapping for A and X, then apply the H4 one
  if (!had.J) P.KeyJ = false; if (!had.K) P.KeyK = false; if (!had.C) P.LMB_CHARGED = false;
  if (a && !aPrev) aT = performance.now();
  if (!a && aPrev) P[(performance.now() - aT) / 1000 >= CONFIG.heavy.chargeHold ? 'LMB_CHARGED' : 'KeyJ'] = true;
  if (x && !xPrev) P.KeyK = true;
  padHeld.x = x; M.padA = a ? (performance.now() - aT) / 1000 : 0; aPrev = a; xPrev = x; };
// the LMB charge ring also tracks a held pad A
{ const hu1 = HUD.update; HUD.update = function (dt, w) { const r = hu1.apply(this, arguments); const ch = $('chargeRing'); if (ch && M.padA > 0 && !Input.lmbDown && Game.state === 'playing' && !(M.chg && M.chg.holding)) { const k = Math.min(1, M.padA / CONFIG.heavy.chargeHold); ch.style.display = k > 0.25 ? 'block' : 'none'; ch.firstChild.style.width = k * 100 + '%'; ch.firstChild.style.background = k >= 1 ? '#ff7a3d' : '#f0d68a'; } return r; }; }

void HEADLESS; void Cam; void Coach;
})();
