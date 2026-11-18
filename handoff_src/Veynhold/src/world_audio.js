/* =====================================================================
   VEYNHOLD — chunk I4: AUDIO DIRECTION in world mode (blueprint 10 / 18) — presentation only; core.js is untouched.
   A.DBAudio: the deathblow audio map, scheduled on the DEATHBLOW CLOCK (the attacker's core stateT in 'deathblowExec', which does not advance
   while the core freezes the fighter for hit-stop and slows with the presentation time scale), so phases never drift from the picture.
     plant ~0.05 · drive 0.28 (bed duck in) · impact ~0.32 (hold: footsteps at 35 %) · settle 0.55 (duck eases) · optional tension ~0.70 ·
     extract 0.95 (bed duck in) · clear ~1.15 (duck released) · land = when the collapse lands (BD.Col entry .landed).
     Boss final: settle +0.25 and extract +0.25 (blueprint 7.1).
   HOOK (merge note): today it starts from the core 'deathblow' event in a Game.handleEvents wrapper (below). When chunk I1's core events land,
   call A.DBAudio.start({ a: attackerId, d: victimId, boss }, world, 'blueprint') from the 'deathblowStart' listener (the wrapper already does
   this when it sees type 'deathblowStart' and then ignores the old 'deathblow'), and A.DBAudio.unlock() on 'deathblowUnlock'.
   Ownership: while the H1 presentation in world_boss.js still plays its own 'impale' / 'rip' at its own bookmarks, DBAudio runs the
   'legacy' timeline (synced to Fin's tImp / tRip) and does not play impact / clear sounds itself (own.impact / own.clear false).
   A presentation that wants DBAudio to own them calls DBAudio.play('impact') / play('clear') itself or sets own.* true.
   ===================================================================== */
(function () {
'use strict';
const G = window.VEYN_GAME, A = window.VEYN_ADV;
if (!G || !A || !A.api || !G.P1) return;
const { Game } = G, { audio } = G.P1;

const TL = {   // deathblow-clock seconds
  blueprint: { plant: 0.05, drive: 0.28, impact: 0.32, settle: 0.55, tension: 0.70, extract: 0.95, clear: 1.15 },
  boss:      { plant: 0.05, drive: 0.28, impact: 0.32, settle: 0.55, tension: 0.79, extract: 1.20, clear: 1.65 },
  // the current world_boss.js finisher (sim seconds): thrust at tImp 0.14, pull-out at tRip 0.27 (0.30 boss final); no room for tension
  legacy:    { plant: 0.03, drive: 0.10, impact: 0.14, settle: 0.18, tension: -1, extract: 0.23, clear: 0.27 } };
const ORDER = ['plant', 'drive', 'impact', 'settle', 'tension', 'extract', 'clear'];
const DUCK = { drive: -12, impact: -12, settle: -7, tension: -7, extract: -12 };   // dB on the music bed (audio.dbG) from that phase on; clear releases

const DBA = A.DBAudio = { on: false, hold: false, t: 0, real: 0, idx: 0, a: null, v: null, boss: false, mode: 'legacy', tl: TL.legacy, landed: false,
  own: { impact: false, clear: false }, tension: true, log: [], TL, ORDER, DUCK, fromEvent: false };

// play one phase now (sound + bed duck + hold flag). Safe without a running AudioContext (sounds are no-ops; state still moves).
DBA.play = function (ph, o) { o = o || {}; if (this.a && this.a.state === 'deathblowExec' && this.a.stateT > this.t) this.t = this.a.stateT;   // log on the current clock (Fin.post can fire between A.post updates)
  switch (ph) {
    case 'plant': if (A.Surf && this.a) A.Surf.impact('plant', this.a.x, this.a.z, 'db'); audio.play('dbPlant'); break;
    case 'drive': audio.play('dbDrive'); break;
    case 'impact': this.hold = true; if (this.own.impact || o.force) { audio.play('dbImpact', { vol: this.boss ? 1 : 0.75 }); audio.play('dbEntry', { vol: this.boss ? 1 : 0.75 }); } break;
    case 'settle': break;
    case 'tension': if (this.tension) audio.play('dbTension', { vol: this.boss ? 1 : 0.8 }); break;
    case 'extract': audio.play('dbExtract', { vol: 0.5 }); break;
    case 'clear': this.hold = false; if (this.own.clear || o.force) audio.play('dbClear', { vol: this.boss ? 1 : 0.7 }); break;
    case 'land': if (A.Surf && o.x !== undefined) A.Surf.impact('land', o.x, o.z, 'dbland', { boss: o.boss }); else audio.play('bodyfall'); break;
  }
  if (DUCK[ph] !== undefined) audio.dbDuck(DUCK[ph], ph === 'settle' || ph === 'tension' ? 0.08 : 0.02);
  if (ph === 'clear') audio.dbDuck(0, 0.25);
  this.log.push({ ph, clock: +this.t.toFixed(4), real: +this.real.toFixed(4), freeze: this.a ? this.a.freeze : 0 }); if (this.log.length > 64) this.log.shift(); };

// start on the core deathblow start. mode: 'blueprint' (I1's deathblowStart schedule) | 'legacy' (today's world_boss finisher)
DBA.start = function (e, w, mode) { const a = w.byId(e.a), v = w.byId(e.d); if (!a || !v) return;
  if (this.on) this.end();
  const boss = !!(A.boss && A.boss.e && A.boss.e.f === v) && v.marks <= 1;
  this.on = true; this.a = a; this.v = v; this.boss = boss; this.t = 0; this.real = 0; this.idx = 0; this.landed = false; this.hold = false; this.mode = mode || 'legacy';
  this.tl = this.mode === 'legacy' ? Object.assign({}, TL.legacy, boss ? { extract: 0.26, clear: 0.30 } : null) : boss ? TL.boss : TL.blueprint;
  audio.ctxPrio = 5; this.log.push({ ph: 'start', clock: 0, real: 0, mode: this.mode }); };
DBA.unlock = function () { this.unlocked = true; };
DBA.end = function () { if (!this.on) return; this.on = false; this.hold = false; this.a = this.v = null; audio.ctxPrio = null; audio.dbDuck(0, 0.25); };
// per frame (A.post): advance the deathblow clock and fire due phases
DBA.update = function (dt) { if (!this.on) return; const a = this.a; this.real += dt;
  if (A.BossD && A.BossD.hold) return;   // screenshot freeze
  if (a && a.state === 'deathblowExec') this.t = a.stateT;   // core clock: frozen during hit-stop, slowed by the presentation time scale
  else this.t += dt;   // past the core exec (boss tail / unlock): wall time
  const tl = this.tl;
  while (this.idx < ORDER.length) { const ph = ORDER[this.idx], at = tl[ph]; if (at < 0) { this.idx++; continue; } if (this.t + 1e-6 < at) break; this.idx++; this.play(ph); }
  // body land: the collapse in world_boss.js marks its entry landed (read only)
  if (!this.landed && A.BossD && A.BossD.Col) { const L = A.BossD.Col.list; for (let i = 0; i < L.length; i++) { const c = L[i]; if (c.f === this.v && c.landed) { this.landed = true; this.play('land', { x: this.v.x, z: this.v.z, boss: this.boss }); break; } } }
  if (this.idx >= ORDER.length) { if (this.real > 0.25 + tl.clear && audio.ctxPrio === 5) audio.ctxPrio = null; if (this.landed || this.real > 4 || !this.v || (!this.v.dead && this.v.state !== 'deathblowed')) this.end(); } };

// wiring: core events -> DBAudio (read-only walk of the event list before the frame consumes it; no allocation)
{ const he = Game.handleEvents; Game.handleEvents = function () { const w = this.world;
    if (A.active && w && w.events) for (let i = 0; i < w.events.length; i++) { const e = w.events[i];
      if (e.type === 'deathblowStart') { DBA.fromEvent = true; DBA.start({ a: e.a !== undefined ? e.a : e.attacker, d: e.d !== undefined ? e.d : e.victim }, w, 'blueprint'); }
      else if (e.type === 'deathblow' && !DBA.fromEvent && w.player && e.a === w.player.id) DBA.start(e, w, DBA.forceMode || 'legacy');
      else if (e.type === 'deathblowUnlock') DBA.unlock(); }
    return he.apply(this, arguments); }; }
// legacy sync: snap impact / clear to the presentation's own bookmarks (Fin.post reports them through BD.onPost); never earlier than scheduled
if (A.BossD) { const BD = A.BossD; let prev = BD.onPost; Object.defineProperty(BD, 'onPost', { configurable: true, get() { return DBA._onPost; }, set(fn) { prev = fn; } });
  DBA._onPost = function (F, st) { if (DBA.on && DBA.mode === 'legacy' && F && F.v === DBA.v) {
      if (F.imp && DBA.idx <= ORDER.indexOf('impact')) { while (DBA.idx <= ORDER.indexOf('impact')) { const ph = ORDER[DBA.idx++]; if (DBA.tl[ph] >= 0) DBA.play(ph); } }
      if (F.rip && DBA.idx <= ORDER.indexOf('clear')) { while (DBA.idx <= ORDER.indexOf('clear')) { const ph = ORDER[DBA.idx++]; if (DBA.tl[ph] >= 0) DBA.play(ph); } } }
    if (prev) return prev(F, st); }; }
{ const ap = A.post; A.post = function (dt, now) { const r = ap.apply(this, arguments); if (!A.active) { if (DBA.on) DBA.end(); return r; } try { DBA.update(dt); } catch (e) { console.error(e); DBA.end(); } return r; }; }
{ const ab = A.buildWorld; if (ab) A.buildWorld = function () { DBA.end(); DBA.fromEvent = false; return ab.apply(this, arguments); }; }

// world one-shots (A.sfx): give their raw tone / nz voices a priority (ambient crows 0, pickups / pages / kindling 2, gates / levers / alerts 4, the refusal 5)
const SFX_PRIO = { crow: 0, kindle: 2, pickup: 2, page: 2, drink: 2, key: 2, keydrop: 2, alert: 4, gate: 4, lever: 4, blade: 4, refused: 5 };
if (A.sfx) { const s0 = A.sfx; A.sfx = function (name) { const p = SFX_PRIO[name], pc = audio.ctxPrio; if (p !== undefined) audio.ctxPrio = p; try { return s0.apply(this, arguments); } finally { audio.ctxPrio = pc; } }; }
})();
