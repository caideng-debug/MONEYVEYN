/* =====================================================================
   VEYNHOLD — COMBAT CORE v2 (pure, deterministic simulation)
   No THREE / DOM dependencies. Seeded RNG. Fixed 60 Hz ticks.
   Everything that decides a combat outcome lives here and is unit-tested.
   ===================================================================== */
(function (root) {
'use strict';

/* ---------------------------------------------------------------
   CONFIG — every tunable value (the in-game Tune panel edits these live)
   --------------------------------------------------------------- */
const CONFIG = {
  sim: { dt: 1 / 60, maxFrame: 0.1 },
  arena: { radius: 16.5, pillars: [
    { x: 9.5, z: 6.5, r: 0.9 }, { x: -10, z: 5.5, r: 0.9 }, { x: 6, z: -11, r: 0.9 },
    { x: -6.5, z: -10.5, r: 0.9 }, { x: 13.2, z: -3, r: 0.8 }, { x: -13.5, z: -2.5, r: 0.8 } ] },
  player: {
    hp: 100, postureMax: 100, radius: 0.45,
    walk: 4.4, guardWalk: 2.3, sprint: 7.0, strafe: 3.9, backpedal: 3.1,
    accel: 32,            // m/s² toward the wanted velocity (ground)
    decel: 40,            // m/s² when slowing / stopping
    turnRateSlow: 17,     // rad/s turning when nearly still
    turnRateFast: 8.5,    // rad/s turning at full sprint (wider arcs)
    attackTurnRate: 6, guardTurnRate: 18,
    postureRegen: 16, postureRegenDelay: 1.0, guardRegenMult: 1.6,
    brokenTime: 1.25, hitTime: 0.45, hitTimeHeavy: 0.65, recoilTime: 0.42,
  },
  parry: {
    window: 0.20,          // deflect window (s) that opens the moment guard is pressed
    largeWindow: 0.30,     // used when accessibility "large deflect window" is on
    accessibility: false,
    lateGrace: 0.07,       // presses up to this long AFTER the strike frame still deflect
    guardBuffer: 0.18,     // a guard press made while busy is held this long and fires when allowed
    spamCount: 4,          // this many guard presses inside spamSpan...
    spamSpan: 1.0,         // ...seconds
    spamFactor: 0.55,      // ...shrinks the NEXT window to 55% (reset by any successful deflect)
    deflectArc: 240,       // degrees around facing that can deflect
    blockArc: 180,         // degrees around facing that can block
    autoTurnRange: 7,      // guard snaps facing toward the nearest threat inside this range
    deflectSelfPosture: 0.15, deflectPostureRecover: 6,
    deflectAttackerPosture: 1.0, deflectStagger: 0.1, finalDeflectRecoil: 0.6,
    blockPosture: 1.0, heavyChip: 0.15, hitPosture: 0.45, earlyTrack: 0.6,
    hitStop: { deflect: 5, heavy: 5, light: 3, block: 3, break: 9, perfect: 7 }, hitStopScale: 1,
    // v6: graduated deflects — perfect = pressed within this of the strike frame (before it), late = used lateGrace
    perfectWindow: 0.04, perfectPostureBonus: 0.15, perfectSelfRecover: 4,
  },
  perilous: { mikiriWindow: 0.34, mikiriArc: 80, mikiriPosture: 45, mikiriStagger: 0.9, mikiriTime: 0.5,
    jumpKickRange: 3.4, jumpKickPosture: 30, jumpKickStagger: 0.45, grabWhiffExtra: 0.6, grabDodgeRecover: 15 },
  dodge: { dur: 0.36, dist: 3.3, iStart: 0.02, iEnd: 0.26, cooldown: 0.12, guardCancelAt: 0.22, attackCancelAt: 0.26 },
  jump: { dur: 0.62, airStart: 0.06, airEnd: 0.52, height: 0.8 },
  combat: { bufferTime: 0.26, guardCancelStartup: 0.5, guardCancelRecovery: 0.2, hitstunGuardWindow: 0.14,
    deathblowRange: 2.9, deathblowTime: 1.3, enemyPostureFromBlockedHit: 0.25, enemyPostureFromDeflectedHit: 0.15,
    playerPostureWhenDeflected: 1.5, knockHit: 3.0, knockHeavy: 5.0 },
  heavy: { chargeHold: 0.35 },
  combo: { lightChain: 4,           // light presses that chain (4th is the spinning finisher)
    riposteWindow: 0.6,              // heavy pressed this soon after a successful deflect = riposte
    sprintAttackSpeed: 5.4,          // moving at least this fast turns a light into the running thrust
    finisherKnock: 6.0, finisherBlockPosture: 1.3 },
  projectile: { hitRadius: 0.55 },
  ai: { timingJitter: 0.15, holdJitter: 0.22, jitterScale: 1, branchChance: 0.7, reactDelay: 0.14, accel: 24,
    thinkMin: 0.18, thinkMax: 0.42, maxConsecutiveCounters: 2, habitWindow: 14, tokenCooldown: 0.55,
    poiseHits: 2, poiseBreakout: 0.12, blockCounterChance: 0.75, deflectErrorBase: 0.07, maxString: 7,
    watchdog: { approach: 8, circle: 4, guard: 2.5, retreat: 2.5, idle: 3, sidestep: 1, gapclose: 1.2, feintstep: 1.2, passive: 3, attacking: 3 } },
  camera: { followTime: 0.09, yawTime: 0.14, lockYawTime: 0.2, dist: 5.4, shoulder: 0.85, fov: 60, fovKick: 5, shakeDecay: 2.4, trauma: 1 },
};

/* ---------------------------------------------------------------
   ATTACK DATA (seconds). Enemy instances get per-swing jitter.
   type: normal | thrust (deflect or mikiri) | sweep (jump/dodge) | grab (dodge only)
   lunge = peak root-motion speed, delivered as a bell curve synced to the strike
   --------------------------------------------------------------- */
function A(o) { return Object.assign({ startup: .3, active: .1, recovery: .4, dmg: 10, post: 10, range: 2.3, arc: 110,
  lunge: 0, type: 'normal', style: 'sideR', parryMod: 1, heavy: false, delayed: false, feintAt: 0, danger: false,
  chainAt: 0.2, superarmor: false, finisher: false, projectile: null }, o); }
const ATTACKS = {
  // ---- player
  p_l1: A({ style: 'sideR', startup: .15, active: .10, recovery: .30, dmg: 8, post: 10, lunge: 2.6, chainAt: .2 }),
  p_l2: A({ style: 'sideL', startup: .14, active: .10, recovery: .32, dmg: 8, post: 11, lunge: 2.6, chainAt: .2 }),
  p_l3: A({ style: 'overhead', startup: .22, active: .12, recovery: .46, dmg: 12, post: 16, lunge: 3.6 }),
  p_h:  A({ style: 'overheadHeavy', startup: .46, active: .14, recovery: .60, dmg: 18, post: 30, range: 2.5, lunge: 3, heavy: true }),
  p_hc: A({ style: 'thrust', startup: .26, active: .14, recovery: .70, dmg: 26, post: 42, range: 2.9, arc: 70, lunge: 7, heavy: true }),
  p_l4: A({ style: 'spin', startup: .26, active: .14, recovery: .55, dmg: 14, post: 24, range: 2.5, arc: 210, lunge: 3.2, finisher: true }),           // 4th light: spinning finisher
  p_lh: A({ style: 'rising', startup: .30, active: .12, recovery: .55, dmg: 16, post: 34, range: 2.4, lunge: 2.4, heavy: true, finisher: true }),    // light -> heavy: rising finisher
  p_dash: A({ style: 'dashCut', startup: .12, active: .10, recovery: .34, dmg: 9, post: 12, range: 2.5, arc: 90, lunge: 5 }),                       // light out of a dodge
  p_run: A({ style: 'runThrust', startup: .24, active: .12, recovery: .50, dmg: 13, post: 18, range: 2.7, arc: 80, lunge: 8 }),                     // light while sprinting
  p_air: A({ style: 'plunge', startup: .16, active: .12, recovery: .42, dmg: 14, post: 22, range: 2.4, arc: 130, lunge: 2.5 }),                     // light in the air
  p_ripo: A({ style: 'riposte', startup: .18, active: .12, recovery: .45, dmg: 16, post: 32, range: 2.6, arc: 90, lunge: 4, heavy: true }),        // heavy right after a deflect
  // ---- Duelist
  d_slash:  A({ style: 'sideR', startup: .42, active: .10, recovery: .45, dmg: 18, post: 16, range: 2.4, lunge: 1.5 }),
  d_slash2: A({ style: 'sideL', startup: .32, active: .10, recovery: .50, dmg: 18, post: 16, range: 2.4, lunge: 1.5 }),
  d_over:   A({ style: 'overheadHeavy', startup: .58, active: .12, recovery: .62, dmg: 22, post: 24, heavy: true, lunge: 2.5, parryMod: 1.1 }),
  d_thrust: A({ style: 'thrust', type: 'thrust', startup: .72, active: .12, recovery: .70, dmg: 25, post: 22, range: 3.3, arc: 60, lunge: 6, danger: true, parryMod: 1.1 }),
  d_delay:  A({ style: 'overhead', startup: .95, active: .12, recovery: .55, dmg: 20, post: 20, delayed: true, lunge: 3 }),
  d_sweep:  A({ style: 'sweep', type: 'sweep', startup: .76, active: .14, recovery: .70, dmg: 20, post: 14, range: 2.9, arc: 220, danger: true }),
  d_counter:A({ superarmor: true, style: 'sideR', startup: .22, active: .10, recovery: .32, dmg: 15, post: 14, range: 2.5, lunge: 3.5, parryMod: .9 }),
  // ---- Iron Warden
  w_swing: A({ style: 'sideR', startup: .78, active: .16, recovery: .85, dmg: 30, post: 30, range: 3.3, arc: 150, heavy: true, superarmor: true, parryMod: 1.2 }),
  w_slam:  A({ style: 'overheadHeavy', startup: 1.0, active: .16, recovery: 1.1, dmg: 40, post: 40, range: 3.1, heavy: true, superarmor: true, lunge: 2.5, parryMod: 1.25 }),
  w_sweep: A({ style: 'sweep', type: 'sweep', startup: .92, active: .20, recovery: 1.0, dmg: 28, post: 20, range: 3.5, arc: 250, danger: true, superarmor: true }),
  w_grab:  A({ style: 'grab', type: 'grab', startup: .82, active: .14, recovery: .95, dmg: 35, post: 0, range: 2.3, arc: 70, danger: true, lunge: 3.5 }),
  w_shove: A({ style: 'sideL', startup: .50, active: .10, recovery: .60, dmg: 12, post: 28, range: 2.6, superarmor: true }),
  w_charge:A({ style: 'thrust', type: 'thrust', startup: .85, active: .16, recovery: .9, dmg: 32, post: 30, range: 3.2, arc: 70, lunge: 9, danger: true, superarmor: true, parryMod: 1.15 }),
  // ---- False Brother
  f_quick:  A({ style: 'sideR', startup: .30, active: .08, recovery: .40, dmg: 14, post: 12, range: 2.3, lunge: 2.8, parryMod: .95 }),
  f_quick2: A({ style: 'sideL', startup: .26, active: .08, recovery: .42, dmg: 14, post: 12, range: 2.3, lunge: 2.8, parryMod: .95 }),
  f_delay:  A({ style: 'overhead', startup: 1.05, active: .10, recovery: .55, dmg: 20, post: 18, delayed: true, lunge: 3.5 }),
  f_feint:  A({ style: 'sideR', startup: .5, feintAt: .30, active: .08, recovery: .1, dmg: 0, post: 0 }),
  f_grab:   A({ style: 'grab', type: 'grab', startup: .70, active: .12, recovery: .80, dmg: 28, post: 0, range: 2.2, arc: 70, danger: true, lunge: 4 }),
  f_lunge:  A({ style: 'thrust', type: 'thrust', startup: .62, active: .12, recovery: .62, dmg: 22, post: 18, range: 3.0, arc: 60, lunge: 9, danger: true }),
  f_counter:A({ superarmor: true, style: 'sideL', startup: .2, active: .08, recovery: .32, dmg: 15, post: 14, range: 2.4, lunge: 3.5, parryMod: .9 }),
  // ---- King's First Blade — phase I
  k_cut:   A({ style: 'sideR', startup: .40, active: .10, recovery: .45, dmg: 20, post: 16, range: 2.5, lunge: 2.2 }),
  k_cut2:  A({ style: 'sideL', startup: .33, active: .10, recovery: .45, dmg: 20, post: 16, range: 2.5, lunge: 2.2 }),
  k_cut3:  A({ style: 'overhead', startup: .48, active: .12, recovery: .60, dmg: 25, post: 22, range: 2.5, lunge: 2.8 }),
  k_over:  A({ style: 'overheadHeavy', startup: .62, active: .12, recovery: .70, dmg: 30, post: 28, heavy: true, lunge: 2.5, parryMod: 1.1 }),
  k_thrust:A({ style: 'thrust', type: 'thrust', startup: .70, active: .12, recovery: .70, dmg: 28, post: 22, range: 3.5, arc: 60, lunge: 7, danger: true }),
  k_delay: A({ style: 'overhead', startup: .98, active: .12, recovery: .55, dmg: 25, post: 22, delayed: true, lunge: 2.8 }),
  k_sweep: A({ style: 'sweep', type: 'sweep', startup: .70, active: .14, recovery: .6, dmg: 22, post: 14, range: 3.0, arc: 230, danger: true }),
  k_feint: A({ style: 'overhead', startup: .5, feintAt: .32, active: .08, recovery: .1, dmg: 0, post: 0 }),
  k_counter:A({ superarmor: true, style: 'sideR', startup: .20, active: .10, recovery: .32, dmg: 18, post: 16, range: 2.6, lunge: 4, parryMod: .9 }),
  // ---- King's First Blade — phase II
  k2_a:    A({ style: 'sideR', startup: .32, active: .09, recovery: .40, dmg: 21, post: 17, range: 2.7, lunge: 3.2 }),
  k2_b:    A({ style: 'sideL', startup: .26, active: .09, recovery: .40, dmg: 21, post: 17, range: 2.7, lunge: 3.2 }),
  k2_c:    A({ style: 'sideR', startup: .28, active: .09, recovery: .40, dmg: 21, post: 17, range: 2.7, lunge: 3.2 }),
  k2_dly:  A({ style: 'overheadHeavy', startup: 1.0, active: .12, recovery: .75, dmg: 32, post: 30, delayed: true, heavy: true, lunge: 3.2, parryMod: 1.1 }),
  k2_sweep:A({ style: 'sweep', type: 'sweep', startup: .64, active: .14, recovery: .55, dmg: 25, post: 16, range: 3.1, arc: 230, danger: true }),
  k2_thrust:A({ style: 'thrust', type: 'thrust', startup: .60, active: .12, recovery: .62, dmg: 30, post: 24, range: 3.6, arc: 60, lunge: 8, danger: true }),
  k2_feint:A({ style: 'overhead', startup: .55, feintAt: .34, active: .08, recovery: .1, dmg: 0, post: 0 }),
  k2_leap: A({ style: 'overheadHeavy', startup: .85, active: .14, recovery: .85, dmg: 35, post: 32, range: 3.0, heavy: true, lunge: 11, parryMod: 1.1 }),
  k2_grab: A({ style: 'grab', type: 'grab', startup: .66, active: .12, recovery: .8, dmg: 32, post: 0, range: 2.3, arc: 70, danger: true, lunge: 4.5 }),
  k2_counter:A({ superarmor: true, style: 'thrust', startup: .18, active: .10, recovery: .45, dmg: 22, post: 20, range: 2.9, arc: 70, lunge: 5.5, parryMod: .9 }),
  // Crimson Arc: a travelling blood-wave. Deflect it, block it (chips health in phase II), dodge through it, or jump it.
  k2_wave: A({ style: 'wave', startup: .72, active: .10, recovery: .70, dmg: 24, post: 26, range: 0, arc: 0, projectile: { speed: 11, life: 1.2 } }),
};
for (const k in ATTACKS) ATTACKS[k].key = k;

/* step helper for strings: S(key, tempo, hold, gap) */
const S = (k, tempo, hold, gap) => ({ k, tempo: tempo || 1, hold: hold || 0, gap: gap || 0 });

/* ---------------------------------------------------------------
   ENEMY PROFILES — strings are 1–7 hits with irregular beats and branches
   br.deflected / br.dodged / br.backoff replace the rest of the string
   --------------------------------------------------------------- */
const PROFILES = {
  duelist: { name: 'The Duelist', hp: 130, postureMax: 150, radius: .45, speed: 3.6, postureRegen: 11, postureRegenDelay: 1.6,
    marks: 1, lightPostureResist: 1, guardChance: .72, deflectSkill: .45, aggression: .62, preferDist: 2.6, jitter: .1, footwork: .35,
    combos: [
      { c: ['d_slash', 'd_slash2'], w: 3, br: { deflected: ['d_thrust'], backoff: ['d_thrust'] } },
      { c: ['d_slash', S('d_slash2', .85), S('d_over', 1, .15)], w: 2, br: { dodged: ['d_sweep'] } },
      { c: ['d_over'], w: 1.3 }, { c: ['d_thrust'], w: 1, tag: 'lunge' },
      { c: ['d_slash', S('d_delay', 1, .15)], w: 1.3, tag: 'delayed' },
      { c: ['d_sweep'], w: .9 },
      { c: ['d_slash', S('d_slash2', 1, 0, .3), 'd_sweep'], w: 1.1, tag: 'mixup' } ],
    counter: 'd_counter', look: 'duelist' },
  warden: { name: 'The Iron Warden', hp: 190, postureMax: 230, radius: .62, speed: 2.5, postureRegen: 9, postureRegenDelay: 2.0,
    marks: 1, lightPostureResist: .5, guardChance: .4, deflectSkill: .15, aggression: .5, preferDist: 3.0, superarmor: true, jitter: .12, footwork: .15,
    combos: [
      { c: ['w_swing'], w: 3, br: { dodged: ['w_sweep'], backoff: ['w_charge'] } },
      { c: ['w_swing', S('w_slam', 1, .2)], w: 2 },
      { c: ['w_sweep'], w: 1.3 }, { c: ['w_grab'], w: 1.1, tag: 'grab' },
      { c: ['w_shove', 'w_slam'], w: 1.3 },
      { c: ['w_swing', S('w_swing', .8), 'w_grab'], w: 1, tag: 'mixup' },
      { c: ['w_charge'], w: .8, tag: 'lunge' } ],
    counter: 'w_shove', look: 'warden' },
  brother: { name: 'The False Brother', hp: 120, postureMax: 140, radius: .43, speed: 4.0, postureRegen: 13, postureRegenDelay: 1.4,
    marks: 1, lightPostureResist: 1, guardChance: .65, deflectSkill: .45, aggression: .72, preferDist: 2.8, jitter: .2, footwork: .6,
    combos: [
      { c: ['f_quick', 'f_quick2'], w: 2.5, br: { deflected: ['f_grab'], dodged: ['f_lunge'] } },
      { c: ['f_feint', 'f_quick'], w: 2, tag: 'feint' },
      { c: ['f_quick', S('f_delay', 1, .2)], w: 1.6, tag: 'delayed' }, { c: ['f_delay'], w: 1.1, tag: 'delayed' },
      { c: ['f_grab'], w: 1, tag: 'grab' }, { c: ['f_lunge'], w: 1, tag: 'lunge' },
      { c: ['f_quick', 'f_feint', 'f_quick2'], w: 1.2, tag: 'feint' },
      { c: [S('f_quick', 1.3), S('f_quick2', .65), S('f_quick', .6), 'f_lunge'], w: 1.2, tag: 'mixup', br: { deflected: [S('f_delay', 1, .3)] } } ],
    counter: 'f_counter', look: 'brother' },
  // v6: Training Shade — a patient practice partner. Loops readable strings and one perilous of each kind; never counters or branches.
  trainer: { name: 'Training Shade', hp: 999, postureMax: 120, radius: .45, speed: 3.0, postureRegen: 8, postureRegenDelay: 2.5, marks: 1, lightPostureResist: 1,
    guardChance: 0, deflectSkill: 0, aggression: 0, preferDist: 2.4, jitter: 0, footwork: 0, trainer: true, look: 'duelist', counter: 'd_slash',
    lesson: [['d_slash'], ['d_slash', 'd_slash2'], ['d_thrust'], ['d_over'], ['d_sweep'], ['d_slash', S('d_delay', 1, .15)], ['w_grab'], ['d_slash', 'd_slash2', 'd_over']],
    perilous: [['d_thrust'], ['d_sweep'], ['w_grab']], combos: [{ c: ['d_slash'], w: 1 }] },
  king: { name: "The King's First Blade", hp: 260, postureMax: 210, radius: .47, speed: 3.9, postureRegen: 12, postureRegenDelay: 1.5,
    marks: 2, lightPostureResist: 1, guardChance: .75, deflectSkill: .4, aggression: .6, preferDist: 2.7, boss: true, jitter: .15, footwork: .5,
    combos: [
      { c: ['k_cut', 'k_cut2'], w: 2.6, br: { deflected: ['k_thrust'], backoff: ['k_thrust'] } },
      { c: ['k_cut', S('k_cut2', .8), S('k_cut3', 1, .25)], w: 2, br: { dodged: ['k_sweep'] } },
      { c: ['k_over'], w: 1.2 }, { c: ['k_thrust'], w: 1, tag: 'lunge' },
      { c: ['k_cut', S('k_delay', 1, .2)], w: 1.3, tag: 'delayed' },
      { c: [S('k_cut2', 1.2), S('k_cut', .75), S('k_thrust', 1, .1)], w: 1.1, tag: 'mixup' },
      { c: ['k_cut', 'k_cut2', 'k_sweep'], w: 1, tag: 'mixup' },
      { c: ['k_feint', 'k_cut2', 'k_cut'], w: 1, tag: 'feint' } ],
    counter: 'k_counter', look: 'king',
    phase2: { blockChip: 0.18, postureRegenMult: 1.8, speed: 4.6, guardChance: .8, deflectSkill: .5, aggression: .8, heavyPunish: 'k2_counter', jitter: .2, tempo: .92, branchChance: .85, footwork: .7,
      combos: [
        { c: ['k2_a', 'k2_b', 'k2_c', S('k2_dly', 1, .3)], w: 2, tag: 'delayed', br: { deflected: ['k2_thrust'], dodged: ['k2_sweep', 'k2_a'] } },
        { c: ['k2_a', S('k2_b', .7), 'k2_feint', S('k2_c', .7), 'k2_sweep', 'k2_thrust'], w: 1.6, tag: 'mixup', br: { backoff: ['k2_wave', 'k2_leap'] } },
        { c: ['k2_a', 'k2_b', S('k2_wave', 1, .1)], w: 1.3, tag: 'lunge' },
        { c: ['k2_wave', S('k2_wave', .8, .2)], w: .8, tag: 'lunge' },
        { c: ['k2_wave', 'k2_leap', 'k2_a'], w: .9, tag: 'lunge' },
        { c: ['k2_sweep', 'k2_thrust'], w: 1.2, tag: 'lunge' }, { c: ['k2_thrust', S('k2_sweep', 1, 0, .25)], w: 1.1 },
        { c: ['k2_feint', 'k2_a', 'k2_b'], w: 1.4, tag: 'feint', br: { deflected: ['k2_grab'] } },
        { c: ['k2_leap', 'k2_a', 'k2_b'], w: 1, tag: 'lunge' },
        { c: [S('k2_a', 1, .35), S('k2_b', .65), S('k2_c', .6), S('k2_dly', 1, .45)], w: 1.2, tag: 'delayed' },
        { c: ['k2_a', S('k2_dly', 1, .2), S('k2_dly', 1, .5)], w: .9, tag: 'delayed' },
        { c: ['k2_b', 'k2_grab'], w: .9, tag: 'grab' } ],
      counter: 'k_counter' } },
};

/* ---------------------------------------------------------------
   Helpers
   --------------------------------------------------------------- */
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const angNorm = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const turnToward = (cur, tgt, maxStep) => cur + clamp(angNorm(tgt - cur), -maxStep, maxStep);
const stepOf = s => typeof s === 'string' ? { k: s, tempo: 1, hold: 0, gap: 0 } : s;
const parryWindow = () => CONFIG.parry.accessibility ? CONFIG.parry.largeWindow : CONFIG.parry.window;

/* ---------------------------------------------------------------
   Fighter
   --------------------------------------------------------------- */
let NEXT_ID = 1;
class Fighter {
  constructor(o) {
    this.id = NEXT_ID++; this.team = o.team; this.isPlayer = !!o.isPlayer; this.profile = o.profile || null; this.name = o.name;
    this.x = o.x || 0; this.z = o.z || 0; this.px = this.x; this.pz = this.z; this.facing = o.facing || 0; this.pfacing = this.facing;
    this.vx = 0; this.vz = 0; this.ax = 0; this.az = 0; this.radius = o.radius; this.maxHp = o.hp; this.hp = o.hp;
    this.postureMax = o.postureMax; this.posture = 0; this.lastPostureHit = -99;
    this.state = 'idle'; this.stateT = 0; this.stateDur = 0; this.atk = null; this.comboQueue = []; this.comboBr = null; this.comboCount = 0;
    this.lt = 0;            // local clock: stops while this fighter is frozen by hit-stop
    this.freeze = 0;        // remaining hit-stop ticks
    this.guard = false; this.guardStart = -99; this.guardWin = 0; this.guardBufT = -99; this.presses = [];
    this.iframes = false; this.airborne = false; this.deathblowable = false; this.marks = o.marks || 1; this.superarmor = !!o.superarmor;
    this.moveSpeed = 0; this.lightCombo = 0; this.buffer = null; this.bufferT = -99; this.dodgeCD = 0; this.dodgeStart = -99; this.dodgeDx = 0; this.dodgeDz = 1;
    this.hitStreak = 0; this.lastHitAt = -99; this.hitDir = 'F'; this.hitHeavy = false; this.dead = false; this.phase = 1; this.invuln = false;
    this.kickReady = 0; this.kickT = -99; this.lastDefense = null; this.recoverFrom = null; this.attackStartedAt = -99; this.reactT = -99; this.reactKind = '';
    this.stats = { perfect: 0, good: 0, late: 0, deathblows: 0, dmgTaken: 0, deflects: 0, blocks: 0, hitsTaken: 0, hitsLanded: 0, dodges: 0, earlyParries: 0, lateDeflects: 0, mikiri: 0, jumpKicks: 0 };
    this.intent = { mx: 0, mz: 0, sprint: false, light: false, heavy: false, charged: false, parry: false, guard: false, dodge: false, jump: false, deathblow: false };
  }
  setState(s, dur) { this.state = s; this.stateT = 0; this.stateDur = dur || 0; }
  canAct() { return this.state === 'idle' || this.state === 'move' || this.state === 'guard'; }
}

/* ---------------------------------------------------------------
   Attack instances (per-swing timing — jitter lives here)
   --------------------------------------------------------------- */
function atkPhase(inst) {
  const t = inst.t;
  if (t < inst.su) return 'startup';
  if (t < inst.su + inst.ac) return 'active';
  if (t < inst.su + inst.ac + inst.rc) return 'recovery';
  return 'done';
}
function startAttack(w, f, key, step) {
  const def = ATTACKS[key]; step = step || {};
  let tempo = step.tempo || 1, hold = step.hold || 0, j = 0;
  if (!f.isPlayer && step.jitter !== false) {
    const P = f.profile ? (f.phase === 2 && f.profile.phase2 ? Object.assign({}, f.profile, f.profile.phase2) : f.profile) : {};
    const J = (P.jitter !== undefined ? P.jitter : CONFIG.ai.timingJitter) * CONFIG.ai.jitterScale;
    j = (w.rand() * 2 - 1) * J;                                               // ±J of startup
    if (def.delayed || hold) hold += w.rand() * CONFIG.ai.holdJitter * CONFIG.ai.jitterScale; // variable held windup
    tempo *= (P.tempo || 1) * (f.tempoMult || 1);                          // v6: tempoMult slows a fighter (soft tutorial)
  }
  const su = Math.max(0.1, def.startup * tempo * (1 + j) + hold);
  f.atk = { def, t: 0, su, ac: def.active, rc: def.recovery, baseSu: def.startup * tempo, hold, jit: j, hit: new Set(), id: ++w.atkCounter,
    feinted: false, feintAt: def.feintAt ? def.feintAt * tempo * (1 + j) + hold * 0.5 : 0, gap: step.gap || 0, outcome: null, extraGap: 0 };
  f.setState('attack', su + def.active + def.recovery);
  f.attackStartedAt = w.time; f.guard = false; f.comboCount++;
  f.atk.last = !f.isPlayer && f.comboQueue.length === 0 && f.comboCount > 1;
  w.emit({ type: 'attackStart', f: f.id, key, danger: def.danger, atype: def.type, su, last: f.atk.last, finisher: def.finisher });
  if (def.danger) w.emit({ type: 'danger', f: f.id, key, atype: def.type });
}

/* ---------------------------------------------------------------
   Guard / deflect — window opens on PRESS, holding afterwards blocks
   --------------------------------------------------------------- */
function pressGuard(w, f) {
  const P = CONFIG.parry, now = f.lt;
  while (f.presses.length && now - f.presses[0] > P.spamSpan) f.presses.shift();
  const spam = f.presses.length >= P.spamCount - 1;       // this press would be the Nth inside the span
  f.presses.push(now); if (f.presses.length > 8) f.presses.shift();
  f.guardStart = now; f.guardWin = parryWindow() * (spam ? P.spamFactor : 1);
  f.guardBufT = -99;
  if (f.state === 'idle' || f.state === 'move') f.setState('guard');
  w.emit({ type: 'guardRaise', f: f.id, spam, win: f.guardWin });
  return true;
}
/* may a guard press take effect right now? (cancel rules) */
function canGuardNow(f) {
  const C = CONFIG.combat;
  switch (f.state) {
    case 'idle': case 'move': case 'guard': return true;
    case 'attack': { const a = f.atk; if (!a) return true; const ph = atkPhase(a);
      if (ph === 'startup') return a.t < a.su * C.guardCancelStartup && f.isPlayer;
      if (ph === 'recovery') return (a.t - a.su - a.ac) / a.rc >= C.guardCancelRecovery;
      return ph === 'done'; }
    case 'dodge': return f.stateT >= CONFIG.dodge.guardCancelAt;
    case 'hit': case 'recoil': return f.stateDur - f.stateT <= C.hitstunGuardWindow;
    default: return false;
  }
}
function facingDiffDeg(def, att) { const toAtt = Math.atan2(att.x - def.x, att.z - def.z); return Math.abs(angNorm(toAtt - def.facing)) * 180 / Math.PI; }
/* strikeLT = the visual strike frame expressed in the defender's local clock */
/* v6: offset = press time minus strike frame (negative = before). */
function deflectQuality(offset, spammed) { const P = CONFIG.parry; if (offset > 0) return 'late'; return -offset <= P.perfectWindow && !spammed ? 'perfect' : 'good'; }   // a mashed (shrunk-window) press can never be perfect
function resolveDefense(defender, attacker, inst, strikeLT) {
  const P = CONFIG.parry, def = inst.def;
  if (defender.invuln || defender.iframes) return { result: 'dodged' };
  if ((def.type === 'sweep' || def.projectile) && defender.airborne) return { result: 'jumped' };
  if (def.type === 'grab' || def.type === 'sweep') return { result: 'hit', unblockable: true };
  const diff = facingDiffDeg(defender, attacker);
  const canDefend = defender.state === 'idle' || defender.state === 'move' || defender.state === 'guard';
  const d = defender.guardStart - strikeLT;              // >0: pressed after the strike frame
  const win = defender.guardWin * def.parryMod;
  if (canDefend && diff <= P.deflectArc / 2 && d >= -win && d <= P.lateGrace) return { result: 'deflect', offset: d };
  if (canDefend && defender.guard && diff <= P.blockArc / 2 && def.type !== 'thrust') return { result: 'block', offset: d };
  return { result: 'hit', offset: d };
}

/* ---------------------------------------------------------------
   Posture
   --------------------------------------------------------------- */
function addPosture(w, f, amt) {
  if (f.dead) return; if (amt < 0) { f.posture = Math.max(0, f.posture + amt); return; } if (amt === 0) return;
  f.posture = Math.min(f.postureMax, f.posture + amt); f.lastPostureHit = f.lt;
  if (f.posture >= f.postureMax && f.state !== 'broken' && f.state !== 'deathblowed') breakPosture(w, f);
}
function breakPosture(w, f) {
  f.atk = null; f.comboQueue.length = 0; f.comboBr = null; f.guard = false;
  f.setState('broken', f.isPlayer ? CONFIG.player.brokenTime : 2.2); f.posture = f.postureMax;
  if (!f.isPlayer) f.deathblowable = true;
  w.freezeFighters([f], CONFIG.parry.hitStop.break);
  w.emit({ type: 'postureBreak', f: f.id });
}
function regenPosture(w, f, dt) {
  if (f.state === 'broken' || f.dead) return;
  const cfg = f.isPlayer ? CONFIG.player : f.profile;
  if (f.lt - f.lastPostureHit < cfg.postureRegenDelay) return;
  let rate = cfg.postureRegen * (!f.isPlayer && f.phase === 2 && f.profile.phase2 ? f.profile.phase2.postureRegenMult : 1);
  rate *= 0.35 + 0.65 * (f.hp / f.maxHp);
  if (f.guard) rate *= CONFIG.player.guardRegenMult;
  f.posture = Math.max(0, f.posture - rate * dt);
}

/* ---------------------------------------------------------------
   Outcome application
   --------------------------------------------------------------- */
function hitDirFor(def) { if (def.heavy) return 'B'; if (def.style === 'sideR' || def.style === 'sweep') return 'L'; if (def.style === 'sideL') return 'R'; return 'F'; }
function applyOutcome(w, att, dfn, inst, out) {
  const P = CONFIG.parry, C = CONFIG.combat, HS = P.hitStop, def = inst.def;
  const sx = inst.proj ? inst.proj.x : att.x, sz = inst.proj ? inst.proj.z : att.z, cx = (sx + dfn.x) / 2, cz = (sz + dfn.z) / 2, res = out.result;
  dfn.lastDefense = { result: res, offset: out.offset, t: w.time, key: def.key }; inst.outcome = res;
  if (res === 'dodged') {
    // perilous counters: mikiri (step INTO a thrust) and grab whiff
    if (def.type === 'thrust' && dfn.state === 'dodge') {
      const toA = Math.atan2(att.x - dfn.x, att.z - dfn.z), dAng = Math.abs(angNorm(Math.atan2(dfn.dodgeDx, dfn.dodgeDz) - toA)) * 180 / Math.PI;
      if (dAng <= CONFIG.perilous.mikiriArc / 2) { mikiri(w, dfn, att); return 'mikiri'; }
    }
    if (def.type === 'grab') { inst.rc += CONFIG.perilous.grabWhiffExtra; att.stateDur += CONFIG.perilous.grabWhiffExtra; addPosture(w, dfn, -CONFIG.perilous.grabDodgeRecover); w.emit({ type: 'grabWhiff', a: att.id, d: dfn.id, x: cx, z: cz }); }
    w.emit({ type: 'dodged', f: dfn.id, x: cx, z: cz }); return res;
  }
  if (res === 'jumped') { dfn.kickReady = att.id; w.emit({ type: 'jumped', f: dfn.id, x: cx, z: cz }); return res; }
  if (res === 'deflect') {
    dfn.stats.deflects++; if (out.offset > 0) dfn.stats.lateDeflects++;
    const quality = deflectQuality(out.offset, dfn.guardWin < parryWindow() * 0.99); dfn.stats[quality]++; dfn.lastDefense.quality = quality;      // v6
    dfn.presses.length = 0;                                           // a clean deflect restores the full window
    addPosture(w, dfn, def.post * P.deflectSelfPosture - P.deflectPostureRecover - (quality === 'perfect' ? P.perfectSelfRecover : 0));
    if (att.isPlayer) {
      addPosture(w, att, def.post * C.playerPostureWhenDeflected);
      if (att.state !== 'broken') { att.atk = null; att.comboQueue.length = 0; att.setState('recoil', CONFIG.player.recoilTime); }
    } else {
      addPosture(w, att, Math.max(10, def.post * P.deflectAttackerPosture) * (quality === 'perfect' ? 1 + P.perfectPostureBonus : 1));
      if (att.state === 'attack' && att.atk === inst) { if (!att.comboQueue.length || def.heavy) att.recoverFrom = 'deflected'; else { inst.extraGap += P.deflectStagger; inst.rc += P.deflectStagger; att.stateDur += P.deflectStagger; } }
    }
    w.freezeFighters([att, dfn], quality === 'perfect' ? HS.perfect : HS.deflect);
    dfn.reactT = dfn.lt; dfn.reactKind = 'deflect'; att.reactT = att.lt; att.reactKind = 'deflected';
    w.emit({ type: 'deflect', a: att.id, d: dfn.id, x: cx, z: cz, heavy: def.heavy, offset: out.offset, quality, key: def.key });
    return res;
  }
  if (res === 'block') {
    dfn.stats.blocks++;
    if (def.heavy) dfn.hp = Math.max(1, dfn.hp - def.dmg * P.heavyChip);
    const p2 = !att.isPlayer && att.phase === 2 && att.profile && att.profile.phase2; if (p2 && p2.blockChip) { dfn.hp = Math.max(1, dfn.hp - def.dmg * p2.blockChip); w.emit({ type: 'crimsonChip', d: dfn.id, x: dfn.x, z: dfn.z }); }
    let pm = dfn.isPlayer ? P.blockPosture : C.enemyPostureFromBlockedHit; if (!dfn.isPlayer && !def.heavy) pm *= dfn.profile.lightPostureResist; if (def.finisher) pm *= CONFIG.combo.finisherBlockPosture;
    addPosture(w, dfn, def.post * pm);
    const ang = Math.atan2(dfn.x - att.x, dfn.z - att.z), k = def.heavy ? 2.6 : 1.4; dfn.vx += Math.sin(ang) * k; dfn.vz += Math.cos(ang) * k;
    w.freezeFighters([att, dfn], def.heavy ? HS.heavy : HS.block);
    dfn.reactT = dfn.lt; dfn.reactKind = 'block';
    const gb = dfn.state === 'broken'; w.emit({ type: gb ? 'guardbreak' : 'block', a: att.id, d: dfn.id, x: cx, z: cz, heavy: def.heavy });
    return gb ? 'guardbreak' : 'block';
  }
  // clean hit
  let dmg = def.dmg; if (dfn.state === 'broken' && !dfn.isPlayer) dmg *= 1.5;
  dfn.hp = Math.max(0, dfn.hp - dmg); dfn.stats.hitsTaken++; dfn.stats.dmgTaken += dmg; att.stats.hitsLanded++;
  if (dfn.isPlayer && out.offset !== undefined && out.offset < -dfn.guardWin * def.parryMod && out.offset > -P.earlyTrack) { dfn.stats.earlyParries++; w.emit({ type: 'earlyParry', f: dfn.id }); w.habit('parry_early'); }
  let pm = P.hitPosture; if (!dfn.isPlayer && !def.heavy) pm *= dfn.profile.lightPostureResist;
  if (def.post > 0) addPosture(w, dfn, def.post * pm);
  if (w.time - dfn.lastHitAt < 1.6) dfn.hitStreak++; else dfn.hitStreak = 1; dfn.lastHitAt = w.time;
  w.freezeFighters([att, dfn], def.heavy ? HS.heavy : HS.light);
  dfn.hitDir = hitDirFor(def); dfn.hitHeavy = def.heavy;
  w.emit({ type: 'hit', a: att.id, d: dfn.id, x: cx, z: cz, heavy: def.heavy, dmg, grab: def.type === 'grab', dir: dfn.hitDir, finisher: def.finisher, key: def.key });
  if (dfn.hp <= 0) { onZeroHp(w, dfn); return res; }
  const armored = (dfn.superarmor || (dfn.atk && dfn.atk.def.superarmor)) && !def.heavy && dfn.state === 'attack';
  if (dfn.state !== 'broken' && !armored) {
    dfn.atk = null; dfn.comboQueue.length = 0; dfn.comboBr = null; dfn.guard = false;
    const k = def.finisher ? CONFIG.combo.finisherKnock : def.heavy ? C.knockHeavy : C.knockHit, ang = Math.atan2(dfn.x - att.x, dfn.z - att.z);
    dfn.vx = Math.sin(ang) * k; dfn.vz = Math.cos(ang) * k;
    const pl = CONFIG.player; dfn.setState('hit', def.type === 'grab' ? 1.0 : def.heavy ? pl.hitTimeHeavy : pl.hitTime);
  }
  return res;
}
function mikiri(w, dfn, att) {
  const M = CONFIG.perilous; dfn.stats.mikiri++;
  att.atk = null; att.comboQueue.length = 0; att.comboBr = null; addPosture(w, att, M.mikiriPosture);
  if (att.state !== 'broken') att.setState('recoil', M.mikiriStagger);
  dfn.setState('mikiri', M.mikiriTime); dfn.iframes = true; dfn.vx = dfn.vz = 0; dfn.facing = Math.atan2(att.x - dfn.x, att.z - dfn.z);
  w.freezeFighters([att, dfn], CONFIG.parry.hitStop.deflect + 2);
  w.emit({ type: 'mikiri', a: att.id, d: dfn.id, x: (att.x + dfn.x) / 2, z: (att.z + dfn.z) / 2 });
}
function onZeroHp(w, f) {
  if (!f.isPlayer && f.profile && f.profile.trainer) f.hp = 1;
  if (f.isPlayer) { f.dead = true; f.atk = null; f.setState('dead', 99); w.emit({ type: 'death', f: f.id }); return; }
  f.hp = 0; f.atk = null; f.comboQueue.length = 0; f.deathblowable = true; f.setState('broken', 3.0);
  w.emit({ type: 'postureBreak', f: f.id, zeroHp: true });
}

/* ---------------------------------------------------------------
   Habit tracker — only records what already happened
   --------------------------------------------------------------- */
class Habits {
  constructor() { this.log = []; }
  add(kind, t) { this.log.push({ kind, t }); if (this.log.length > 40) this.log.shift(); }
  count(kind, now) { let n = 0; for (const e of this.log) if (e.kind === kind && now - e.t < CONFIG.ai.habitWindow) n++; return n; }
  reset() { this.log.length = 0; }
}

/* ---------------------------------------------------------------
   Enemy brain — footwork, tempo modes, branching strings, honest defense
   --------------------------------------------------------------- */
class Brain {
  constructor(f, w) { this.f = f; this.state = 'approach'; this.t = 0; this.think = 0.4; this.circleDir = 1; this.pressAt = -1; this.counters = 0;
    this.reason = 'start'; this.lastPlayerAtkId = -1; this.lastCombo = null; this.watchdogResets = 0; this.mode = 'measured'; this.modeT = 4;
    this.distOffset = 0; this.burstX = 0; this.burstZ = 0; this.lastCounterCheck = -1; this.forceDeflect = false; }
  set(s, reason) { this.state = s; this.t = 0; this.reason = reason || s; }
  prof() { const p = this.f.profile; return (this.f.phase === 2 && p.phase2) ? Object.assign({}, p, p.phase2) : p; }
  gauss(w) { let u = 0, v = 0; while (u === 0) u = w.rand(); v = w.rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  /* v6: trainer brain — keeps a readable distance, swings one lesson string at a steady cadence */
  updateTrainer(w, dt, P) {
    const f = this.f, pl = w.player, T = w.training || {}; const dx = pl.x - f.x, dz = pl.z - f.z, dist = Math.hypot(dx, dz), toPl = Math.atan2(dx, dz); f.aiFace = toPl;
    if (!f.canAct()) { f.intent.mx = f.intent.mz = 0; return; }
    f.guard = !!T.guard; if (f.guard && f.state !== 'guard') f.setState('guard');
    const want = P.preferDist, sp = dist > want + 0.4 ? 1 : dist < want - 0.5 ? -0.6 : 0; f.intent.mx = Math.sin(toPl) * sp * P.speed; f.intent.mz = Math.cos(toPl) * sp * P.speed;
    this.t += 0; this.think -= dt; if (T.paused || this.think > 0 || dist > want + 1.4) return;
    const list = T.perilous ? P.perilous : P.lesson; this.lessonI = ((this.lessonI === undefined ? -1 : this.lessonI) + 1) % list.length;
    const steps = list[this.lessonI].map(stepOf); f.guard = false; f.setState('idle'); f.facing = toPl; f.comboQueue = steps.slice(1); f.comboBr = null; f.comboCount = 0;
    startAttack(w, f, steps[0].k, Object.assign({ jitter: false }, steps[0])); w.claimToken(f); this.think = T.cadence || 2.4; this.set('attacking', 'lesson ' + this.lessonI);
  }
  update(w, dt) {
    const f = this.f, pl = w.player, P = this.prof(); this.t += dt;
    if (P.trainer) { if (pl && !pl.dead) this.updateTrainer(w, dt, P); return; }
    if (!pl || pl.dead) { f.intent.mx = f.intent.mz = 0; return; }
    const dx = pl.x - f.x, dz = pl.z - f.z, dist = Math.hypot(dx, dz), toPl = Math.atan2(dx, dz);
    const wd = CONFIG.ai.watchdog[this.state]; if (wd && this.t > wd) { this.watchdogResets++; w.emit({ type: 'watchdog', f: f.id, s: this.state }); this.set('circle', 'watchdog'); }
    f.aiFace = toPl;
    // tempo modes: pressure / measured / patient — varies engagement distance and aggression
    this.modeT -= dt; if (this.modeT <= 0) { const r = w.rand(); this.mode = r < 0.4 ? 'pressure' : r < 0.8 ? 'measured' : 'patient'; this.modeT = 3 + w.rand() * 5; this.distOffset = (w.rand() - 0.5) * 1.6; }
    if (f.state === 'hit' && f.hitStreak >= CONFIG.ai.poiseHits && f.stateT > CONFIG.ai.poiseBreakout && f.hp > 0) {
      f.atk = null; f.guard = true; f.setState('guard'); this.set('guard', 'poise: refuses another free hit'); this.forceDeflect = true; f.hitStreak = 0; }
    if (!f.canAct()) { f.intent.mx = f.intent.mz = 0; return; }
    if (this.pressAt > 0 && w.time >= this.pressAt) { if (canGuardNow(f)) pressGuard(w, f); this.pressAt = -1; }
    // react to the player's VISIBLE attack startup (after a human-like reaction delay)
    const pa = pl.state === 'attack' && pl.atk ? pl.atk : null;
    if (pa && pa.id !== this.lastPlayerAtkId && pa.t >= CONFIG.ai.reactDelay && dist < 4.2) {
      this.lastPlayerAtkId = pa.id;
      if (pa.def.heavy && P.heavyPunish && w.habits.count('heavy', w.time) >= 2 && atkPhase(pa) === 'startup' && pa.su - pa.t > ATTACKS[P.heavyPunish].startup + 0.04 && dist < 3) {
        f.facing = toPl; startAttack(w, f, P.heavyPunish, { jitter: false }); w.claimToken(f); this.set('attacking', 'punish predictable heavy'); return; }
      const lightHabit = w.habits.count('light', w.time);
      let guardP = P.guardChance + (lightHabit >= 6 ? 0.25 : 0) + (this.mode === 'patient' ? 0.15 : 0); if (this.forceDeflect || this.state === 'guard') guardP = 1;
      if (w.rand() < guardP) {
        f.guard = true; f.setState('guard'); if (this.state !== 'guard') this.set('guard', ''); this.reason = lightHabit >= 6 ? 'reading repeated lights' : 'guard vs attack';
        let dfl = P.deflectSkill + (lightHabit >= 6 ? 0.3 : 0) + (this.forceDeflect ? 0.6 : 0); this.forceDeflect = false;
        if (this.counters >= CONFIG.ai.maxConsecutiveCounters) dfl = 0;
        if (w.rand() < dfl && atkPhase(pa) === 'startup') {
          // honest timing: aim mid-window with human error; same rules as the player
          const strikeAt = w.time + (pa.su - pa.t), sigma = CONFIG.ai.deflectErrorBase * (1.4 - P.deflectSkill);
          this.pressAt = Math.max(w.time + 0.001, strikeAt - parryWindow() * 0.5 + this.gauss(w) * sigma); this.reason = 'deflect attempt';
        }
        return;
      }
    }
    if (this.state === 'guard') {
      f.intent.mx = f.intent.mz = 0; f.guard = true;
      const ld = f.lastDefense, recent = ld && w.time - ld.t < 0.9;
      const plOpen = pl.state === 'recoil' || pl.state !== 'attack' || (pl.atk && atkPhase(pl.atk) === 'recovery');
      const canCounter = dist < 3.2 && w.tokenFree(f) && this.counters < CONFIG.ai.maxConsecutiveCounters + 1;
      if (recent && ld.result === 'deflect' && pl.state === 'recoil' && canCounter) return this.counter(w, f, P, toPl, 'riposte after deflect');
      if (recent && ld.result === 'block' && plOpen && this.t > 0.25 && ld.t !== this.lastCounterCheck && canCounter) {
        this.lastCounterCheck = ld.t; if (w.rand() < CONFIG.ai.blockCounterChance) return this.counter(w, f, P, toPl, 'counter in a gap after block'); }
      if (this.t > 1.1 && pl.state !== 'attack') { f.guard = false; f.setState('idle'); this.set('circle', 'guard done'); }
      return;
    }
    const plVuln = ['recoil', 'broken', 'hit'].includes(pl.state) || (pl.state === 'attack' && pl.atk && atkPhase(pl.atk) === 'recovery');
    if (plVuln && dist < 3.0 && w.tokenFree(f) && w.rand() < 0.75) { f.facing = toPl; startAttack(w, f, P.counter); w.claimToken(f); this.counters = 0; this.set('attacking', 'punish ' + pl.state); return; }
    // footwork bursts
    if (this.state === 'sidestep' || this.state === 'gapclose' || this.state === 'feintstep') {
      const dur = this.state === 'sidestep' ? 0.32 : this.state === 'gapclose' ? 0.42 : 0.55;
      let mx = this.burstX, mz = this.burstZ;
      if (this.state === 'feintstep' && this.t > 0.25) { mx = -Math.sin(toPl) * 4.5; mz = -Math.cos(toPl) * 4.5; }
      if (this.state === 'gapclose') { mx = Math.sin(toPl) * 7.5; mz = Math.cos(toPl) * 7.5; if (dist < P.preferDist + 0.3) { this.t = dur; } }
      f.intent.mx = mx; f.intent.mz = mz; f.guard = false;
      if (this.t >= dur) { const after = this.state; this.set('circle', after + ' done'); if (after === 'gapclose' && w.tokenFree(f)) this.think = 0; }
      return;
    }
    this.think -= dt;
    const retreating = w.habits.count('retreat', w.time) >= 2;
    const pref = P.preferDist + this.distOffset * 0.5;
    const aggr = P.aggression + (this.mode === 'pressure' ? 0.25 : this.mode === 'patient' ? -0.3 : 0);
    if (this.think <= 0) {
      this.think = CONFIG.ai.thinkMin + w.rand() * (CONFIG.ai.thinkMax - CONFIG.ai.thinkMin);
      const fw = P.footwork || 0.3;
      if (dist > 7.5) { if (w.rand() < fw * 0.6) this.burst('gapclose', toPl, 0); else this.set('approach', 'too far'); }
      else if (w.tokenFree(f) && dist < pref + 1.6 && w.rand() < aggr + 0.2) {
        const combo = this.pickCombo(w, P, dist, retreating);
        if (combo) { this.beginCombo(w, f, combo, toPl); return; }
      } else if (retreating && dist > 3.5 && dist < 8.5 && w.tokenFree(f)) {
        const lunge = P.combos.find(c => c.tag === 'lunge'); if (lunge) { this.beginCombo(w, f, lunge, toPl); this.reason = 'you keep backing off: lunge'; return; }
      } else if (dist < pref - 0.9) { if (w.rand() < fw) this.burst('sidestep', toPl, this.circleDir); else this.set('retreat', 'too close'); }
      else {
        const r = w.rand();
        if (r < fw * 0.35) this.burst('sidestep', toPl, w.rand() < 0.5 ? 1 : -1);
        else if (r < fw * 0.55 && dist > 3.2) this.burst('feintstep', toPl, 0);
        else if (r < fw * 0.75 && dist > pref + 1.5) this.burst('gapclose', toPl, 0);
        else if (this.mode === 'patient' && r > 0.75) { this.set('passive', 'watching you'); }
        else { this.set('circle', w.tokenFree(f) ? 'measure' : 'waiting turn'); if (w.rand() < 0.3) this.circleDir *= -1; }
      }
    }
    let mx = 0, mz = 0; const sp = P.speed * (this.state === 'approach' ? 1 : this.state === 'passive' ? 0.3 : 0.55);
    if (this.state === 'approach') { mx = Math.sin(toPl); mz = Math.cos(toPl); if (dist < pref + 0.4) this.set('circle', 'in range'); }
    else if (this.state === 'circle' || this.state === 'passive') { const a = toPl + this.circleDir * Math.PI / 2, rad = dist > pref + 0.6 ? 0.5 : dist < pref - 0.4 ? -0.5 : 0;
      mx = Math.sin(a) * 0.8 + Math.sin(toPl) * rad; mz = Math.cos(a) * 0.8 + Math.cos(toPl) * rad; f.guard = this.state === 'passive'; }
    else if (this.state === 'retreat') { mx = -Math.sin(toPl); mz = -Math.cos(toPl); if (dist > pref) this.set('circle', 'spaced'); }
    const m = Math.hypot(mx, mz) || 1; f.intent.mx = mx / m * sp; f.intent.mz = mz / m * sp;
  }
  burst(kind, toPl, dir) { const f = this.f; const a = toPl + dir * Math.PI / 2; this.burstX = Math.sin(a) * 6.5; this.burstZ = Math.cos(a) * 6.5; if (kind === 'feintstep') { this.burstX = Math.sin(toPl) * 5; this.burstZ = Math.cos(toPl) * 5; } this.set(kind, kind); f.guard = false; }
  counter(w, f, P, toPl, why) { f.guard = false; f.setState('idle'); this.counters++; f.facing = toPl; startAttack(w, f, P.counter); w.claimToken(f); this.set('attacking', why); }
  beginCombo(w, f, combo, toPl) {
    f.facing = turnToward(f.facing, toPl, 1.2); const steps = combo.c.map(stepOf);
    f.comboQueue = steps.slice(1); f.comboBr = combo.br || null; f.comboCount = 0;
    startAttack(w, f, steps[0].k, steps[0]); w.claimToken(f); this.lastCombo = combo; this.counters = 0; this.set('attacking', this.reason);
  }
  pickCombo(w, P, dist, retreating) {
    const early = w.habits.count('parry_early', w.time), heavy = w.habits.count('heavy', w.time), dodges = w.habits.count('dodge', w.time), parries = w.habits.count('parry', w.time);
    let total = 0; const opts = [];
    for (const c of P.combos) {
      let wt = c.w;
      if (early >= 2 && (c.tag === 'delayed' || c.tag === 'feint')) wt *= 3;
      if (dodges >= 4 && (c.tag === 'delayed' || c.tag === 'mixup')) wt *= 1.8;
      if (parries >= 8 && (c.tag === 'grab' || c.tag === 'mixup')) wt *= 1.8;   // deflect-only players meet unblockables
      if (retreating && c.tag === 'lunge') wt *= 2.5;
      if (heavy >= 2 && c.tag === 'grab') wt *= 1.5;
      if (this.lastCombo === c) wt *= 0.35;
      const first = ATTACKS[stepOf(c.c[0]).k]; if (dist > first.range + first.lunge * 0.35 + 1.2) wt *= 0.25;
      opts.push([c, wt]); total += wt;
    }
    let r = w.rand() * total;
    for (const [c, wt] of opts) { r -= wt; if (r <= 0) { this.reason = 'string ' + c.c.map(s => stepOf(s).k).join('>') + (early >= 2 && (c.tag === 'delayed' || c.tag === 'feint') ? ' (you deflect early)' : ''); return c; } }
    return opts.length ? opts[0][0] : null;
  }
}

/* ---------------------------------------------------------------
   World
   --------------------------------------------------------------- */
class World {
  constructor(seed) { this.time = 0; this.tick = 0; this.fighters = []; this.events = []; this.atkCounter = 0; this.rand = rng(seed || 12345);
    this.habits = new Habits(); this.player = null; this.token = null; this.tokenFreeAt = 0; this.over = null; this.acc = 0; this.retreatT = 0; this.pending = []; this.projectiles = []; this.projCounter = 0; }
  emit(e) { e.t = this.time; this.events.push(e); }
  habit(k) { this.habits.add(k, this.time); }
  freezeFighters(list, n) { n = Math.round(n * CONFIG.parry.hitStopScale); if (n <= 0) return; for (const f of list) f.freeze = Math.max(f.freeze, n); this.emit({ type: 'hitstop', n, ids: list.map(f => f.id) }); }
  get hitStopTicks() { return this.player ? this.player.freeze : 0; }
  addPlayer(x, z) { const C = CONFIG.player; const f = new Fighter({ team: 0, isPlayer: true, name: 'Wanderer', x, z, hp: C.hp, postureMax: C.postureMax, radius: C.radius }); this.fighters.push(f); this.player = f; return f; }
  addEnemy(key, x, z) { const p = PROFILES[key]; const f = new Fighter({ team: 1, profile: p, name: p.name, x, z, hp: p.hp, postureMax: p.postureMax, radius: p.radius, marks: p.marks, superarmor: p.superarmor, facing: Math.PI });
    f.brain = new Brain(f, this); this.fighters.push(f); return f; }
  enemies() { return this.fighters.filter(f => f.team === 1 && !f.dead); }
  byId(id) { return this.fighters.find(f => f.id === id); }
  tokenFree(f) { const h = this.token !== null && this.byId(this.token); return (!h || h.dead || this.token === f.id) && (this.time >= this.tokenFreeAt || this.token === f.id); }
  claimToken(f) { this.token = f.id; }
  releaseToken(f) { if (this.token === f.id) { this.token = null; this.tokenFreeAt = this.time + CONFIG.ai.tokenCooldown; } }
  advance(realDt, maxTick) {
    this.acc += Math.min(realDt, CONFIG.sim.maxFrame); const dt = CONFIG.sim.dt; let n = 0;
    while (this.acc >= dt) { if (maxTick && this.tick >= maxTick) { this.acc = 0; break; } this.acc -= dt; n++; this.step(dt); }
    return n;
  }
  step(dt) {
    if (this.preStep) this.preStep(this);
    this.tick++; this.time += dt;
    for (const f of this.fighters) { f.px = f.x; f.pz = f.z; f.pfacing = f.facing; f.pvx = f.vx; f.pvz = f.vz; }
    // input buffering runs every tick, even for fighters frozen in hit-stop
    if (this.player && !this.player.dead) this.bufferInput(this.player);
    for (const f of this.fighters) if (f.brain && !f.dead && f.freeze <= 0) f.brain.update(this, dt);
    for (const f of this.fighters) {
      if (f.freeze > 0) { f.freeze--; f.frozen = true; continue; }
      f.frozen = false; f.lt += dt; this.stepFighter(f, dt);
    }
    this.stepProjectiles(dt); this.resolveHits(); this.resolvePending(); this.separate(); this.trackHabits(dt); this.checkOver();
  }
  lockTarget(f) { if (f.isPlayer) { const t = f.lockId && this.byId(f.lockId); return t && !t.dead ? t : null; } return this.player; }
  /* nearest enemy that matters for auto-facing (lock target, else the closest threat in range) */
  softTarget(f) { const lt = this.lockTarget(f); if (lt) return lt; let best = null, bd = CONFIG.parry.autoTurnRange;
    for (const e of this.enemies()) { const d = Math.hypot(e.x - f.x, e.z - f.z) - (e.state === 'attack' ? 1.5 : 0); if (d < bd) { bd = d; best = e; } } return best; }
  bufferInput(f) {
    const I = f.intent, take = k => { const v = I[k]; I[k] = false; return v; };
    let act = null;
    if (take('dodge')) act = 'dodge'; else if (take('jump')) act = 'jump'; else if (take('deathblow')) act = 'deathblow';
    else if (take('charged')) act = 'charged'; else if (take('heavy')) act = 'heavy'; else if (take('light')) act = 'light';
    if (act) { f.buffer = act; f.bufferT = f.lt; }
    if (take('parry')) { f.guardBufT = f.lt; this.habit('parry'); }
  }
  stepFighter(f, dt) {
    f.stateT += dt; f.dodgeCD = Math.max(0, f.dodgeCD - dt);
    if (f.dead) { f.vx *= 0.9; f.vz *= 0.9; f.x += f.vx * dt; f.z += f.vz * dt; return; }
    const tgt = f.isPlayer ? this.softTarget(f) : this.lockTarget(f);
    regenPosture(this, f, dt);
    // buffered guard press fires as soon as the cancel rules allow (player and AI share this path)
    if (f.guardBufT > -50 && f.lt - f.guardBufT <= CONFIG.parry.guardBuffer && canGuardNow(f)) {
      if (f.state === 'attack' || f.state === 'dodge' || f.state === 'hit' || f.state === 'recoil') { f.atk = null; f.iframes = false; f.setState('guard'); }
      pressGuard(this, f);
    } else if (f.guardBufT > -50 && f.lt - f.guardBufT > CONFIG.parry.guardBuffer) { f.guardBufT = -99; this.emit({ type: 'guardDropped', f: f.id }); }
    if (f.isPlayer) this.playerInput(f, dt, tgt);
    const vx0 = f.vx, vz0 = f.vz;
    switch (f.state) {
      case 'attack': this.stepAttack(f, dt, tgt); break;
      case 'dodge': { const D = CONFIG.dodge, u = clamp(f.stateT / D.dur, 0, 1); f.iframes = f.stateT >= D.iStart && f.stateT <= D.iEnd;
        const sp = D.dist / D.dur * 3 * (1 - u) * (1 - u);                         // derivative of ease-out cubic: fast start, clean settle
        f.vx = f.dodgeDx * sp; f.vz = f.dodgeDz * sp;
        if (f.stateT >= D.dur) { f.iframes = false; f.dodgeCD = D.cooldown; f.setState('idle'); } break; }
      case 'jump': { const J = CONFIG.jump; f.airborne = f.stateT >= J.airStart && f.stateT <= J.airEnd; f.vx *= 0.985; f.vz *= 0.985;
        if (f.stateT >= J.dur) { f.airborne = false; f.kickReady = 0; f.setState('idle'); } break; }
      case 'mikiri': f.vx = f.vz = 0; if (f.stateT >= f.stateDur) { f.iframes = false; f.setState('idle'); } break;
      case 'hit': case 'recoil': f.vx *= 0.86; f.vz *= 0.86; if (f.stateT >= f.stateDur) f.setState('idle'); break;
      case 'broken': f.vx *= 0.8; f.vz *= 0.8; if (f.stateT >= f.stateDur) { if (f.hp <= 0 && !f.isPlayer) f.hp = Math.max(1, f.maxHp * 0.08);
          f.deathblowable = false; f.posture = f.postureMax * 0.5; f.setState('idle'); this.emit({ type: 'recover', f: f.id }); } break;
      case 'deathblowExec': f.vx = f.vz = 0; if (f.stateT >= f.stateDur) f.setState('idle'); break;
      case 'deathblowed': f.vx = f.vz = 0; if (f.stateT >= f.stateDur) this.finishDeathblow(f); break;
      case 'transition': f.vx = f.vz = 0; f.invuln = true; if (f.stateT >= f.stateDur) { f.invuln = false; f.setState('idle'); this.emit({ type: 'phase2ready', f: f.id }); } break;
    }
    if (f.canAct()) this.locomote(f, dt, tgt);
    f.x += f.vx * dt; f.z += f.vz * dt;
    f.ax = (f.vx - vx0) / dt; f.az = (f.vz - vz0) / dt; f.moveSpeed = Math.hypot(f.vx, f.vz);
  }
  /* acceleration-based locomotion shared by player and AI */
  locomote(f, dt, tgt) {
    const I = f.intent, C = CONFIG.player; let tvx, tvz, accel, decel;
    if (f.isPlayer) {
      const m = Math.min(1, Math.hypot(I.mx, I.mz));
      let speed;
      if (f.guard) speed = C.guardWalk;
      else if (tgt && f.lockId) { // locked: blend forward / strafe / backpedal speed by local direction
        const fx = Math.sin(f.facing), fz = Math.cos(f.facing), dirx = m > 0.01 ? I.mx / m : 0, dirz = m > 0.01 ? I.mz / m : 0;
        const fwd = dirx * fx + dirz * fz; speed = fwd >= 0 ? C.strafe + (C.walk - C.strafe) * fwd : C.strafe + (C.backpedal - C.strafe) * -fwd; if (I.sprint) speed *= 1.25;
      } else speed = I.sprint ? C.sprint : C.walk;
      tvx = m > 0.05 ? I.mx / Math.max(1, Math.hypot(I.mx, I.mz)) * speed : 0; tvz = m > 0.05 ? I.mz / Math.max(1, Math.hypot(I.mx, I.mz)) * speed : 0;
      accel = C.accel; decel = C.decel;
      if (f.state !== 'guard') f.state = (Math.hypot(tvx, tvz) > 0.05 || f.moveSpeed > 0.3) ? 'move' : 'idle';
      const sp = Math.hypot(f.vx, f.vz), turn = C.turnRateSlow + (C.turnRateFast - C.turnRateSlow) * clamp(sp / C.sprint, 0, 1);
      let want = f.facing, rate = turn;
      const deflecting = f.lt - f.guardStart <= f.guardWin + CONFIG.parry.lateGrace;
      if (tgt && (f.lockId || f.guard || deflecting)) { want = Math.atan2(tgt.x - f.x, tgt.z - f.z); rate = (f.guard || deflecting) ? C.guardTurnRate : turn; }
      else if (m > 0.05) want = Math.atan2(I.mx, I.mz);
      f.facing = turnToward(f.facing, want, rate * dt);
      if (f.lightCombo) f.lightCombo = 0;
    } else {
      tvx = I.mx; tvz = I.mz; accel = decel = CONFIG.ai.accel;
      f.state = f.guard ? 'guard' : (Math.hypot(tvx, tvz) > 0.1 ? 'move' : 'idle');
      if (f.aiFace !== undefined) f.facing = turnToward(f.facing, f.aiFace, 7 * dt);
    }
    // approach the wanted velocity with separate accel / decel (no instant velocity)
    const dvx = tvx - f.vx, dvz = tvz - f.vz, dl = Math.hypot(dvx, dvz);
    if (dl > 0) { const speeding = Math.hypot(tvx, tvz) >= Math.hypot(f.vx, f.vz) && (tvx * f.vx + tvz * f.vz) >= 0; const maxd = (speeding ? accel : decel) * dt; const k = Math.min(1, maxd / dl); f.vx += dvx * k; f.vz += dvz * k; }
  }
  playerInput(f, dt, tgt) {
    const I = f.intent, CB = CONFIG.combat, now = f.lt;
    f.guard = !!I.guard && f.canAct();
    if (f.state === 'guard' && !f.guard) f.state = 'idle';
    if (f.guard && (f.state === 'idle' || f.state === 'move')) f.state = 'guard';
    if (f.buffer && now - f.bufferT > CB.bufferTime) f.buffer = null;
    if (!f.buffer) return;
    const b = f.buffer, a = f.atk, inRecovery = f.state === 'attack' && a && atkPhase(a) === 'recovery';
    const recFrac = inRecovery ? (a.t - a.su - a.ac) / a.rc : 0;
    const D = CONFIG.dodge;
    // jump kick off a sweep you just cleared
    if (b === 'light' && f.state === 'jump' && f.airborne && f.kickReady) {
      const e = this.byId(f.kickReady); f.buffer = null; f.kickReady = 0;
      if (e && !e.dead && Math.hypot(e.x - f.x, e.z - f.z) < CONFIG.perilous.jumpKickRange) {
        f.stats.jumpKicks++; f.kickT = f.lt; addPosture(this, e, CONFIG.perilous.jumpKickPosture);
        if (e.state !== 'broken') { e.atk = null; e.comboQueue.length = 0; e.setState('recoil', CONFIG.perilous.jumpKickStagger); this.releaseToken(e); }
        this.freezeFighters([e], CONFIG.parry.hitStop.heavy); this.emit({ type: 'jumpKick', a: f.id, d: e.id, x: e.x, z: e.z });
      }
      return;
    }
    // air slash: a light in the air with no sweep to kick off (once per jump)
    if (b === 'light' && f.state === 'jump' && f.airborne && !f.kickReady && !f.airUsed) {
      f.buffer = null; f.airUsed = true; f.airY = Math.sin(clamp(f.stateT / CONFIG.jump.dur, 0, 1) * Math.PI) * CONFIG.jump.height; f.airborne = false;
      if (tgt) f.facing = turnToward(f.facing, Math.atan2(tgt.x - f.x, tgt.z - f.z), 0.9);
      f.lightCombo = 0; startAttack(this, f, 'p_air'); this.habit('light'); return;
    }
    const fromDodge = f.state === 'dodge' && f.stateT >= (b === 'dodge' ? D.dur : D.attackCancelAt);
    const canFromRecovery = inRecovery && (b === 'light' ? true : b === 'dodge' ? recFrac >= 0.3 : recFrac >= 0.55);
    const CO = CONFIG.combo, isLightKey = inRecovery && /^p_l[1-4]$/.test(a.def.key);
    const chainOk = isLightKey && b === 'light' && f.lightCombo < CO.lightChain;
    const finisherOk = isLightKey && b === 'heavy';                                   // light -> heavy finisher (any point of the recovery)
    if (b === 'deathblow' || (b === 'light' && this.deathblowCandidate(f))) {
      const t = this.deathblowCandidate(f); if (t && (f.canAct() || inRecovery || fromDodge)) { f.buffer = null; this.startDeathblow(f, t); return; }
      if (b === 'deathblow' && !t) f.buffer = 'light';
      return;
    }
    if (!(f.canAct() || canFromRecovery || chainOk || finisherOk || fromDodge)) return;
    const wasDodging = f.state === 'dodge';
    f.buffer = null;
    if (b === 'dodge') {
      if (f.dodgeCD > 0 && !inRecovery) return;
      let dx = I.mx, dz = I.mz; const m = Math.hypot(dx, dz);
      if (m < 0.1) { dx = -Math.sin(f.facing); dz = -Math.cos(f.facing); } else { dx /= m; dz /= m; }
      f.atk = null; f.dodgeDx = dx; f.dodgeDz = dz; f.guard = false; f.dodgeStart = f.lt; f.setState('dodge', D.dur); f.stats.dodges++; this.habit('dodge'); this.emit({ type: 'dodge', f: f.id });
    } else if (b === 'jump') { f.atk = null; f.guard = false; f.kickReady = 0; f.airUsed = false; f.setState('jump', CONFIG.jump.dur); this.emit({ type: 'jump', f: f.id }); }
    else if (b === 'light') {
      if (tgt) f.facing = turnToward(f.facing, Math.atan2(tgt.x - f.x, tgt.z - f.z), 0.9);
      if (wasDodging) { f.lightCombo = 0; startAttack(this, f, 'p_dash'); this.habit('light'); return; }
      if (f.canAct() && I.sprint && f.moveSpeed >= CO.sprintAttackSpeed) { f.lightCombo = 0; startAttack(this, f, 'p_run'); this.habit('light'); return; }
      f.lightCombo = chainOk || (inRecovery && f.lightCombo > 0 && f.lightCombo < CO.lightChain) ? f.lightCombo + 1 : 1;
      const keep = f.lightCombo; startAttack(this, f, 'p_l' + keep); f.lightCombo = keep; this.habit('light');
      if (keep === CO.lightChain) this.emit({ type: 'finisherStart', f: f.id, key: 'p_l' + keep });
    } else if (b === 'heavy' || b === 'charged') {
      const chain = f.lightCombo; f.lightCombo = 0; if (tgt) f.facing = turnToward(f.facing, Math.atan2(tgt.x - f.x, tgt.z - f.z), 0.9);
      let key = b === 'heavy' ? 'p_h' : 'p_hc';
      if (b === 'heavy' && finisherOk) key = 'p_lh';
      else if (b === 'heavy' && f.reactKind === 'deflect' && f.lt - f.reactT <= CO.riposteWindow) key = 'p_ripo';
      startAttack(this, f, key); this.habit('heavy');
      if (key === 'p_lh') this.emit({ type: 'finisherStart', f: f.id, key, chain });
    }
  }
  stepAttack(f, dt, tgt) {
    const inst = f.atk; if (!inst) { f.setState('idle'); return; }
    const d = inst.def; inst.t += dt; const ph = atkPhase(inst);
    if (inst.feintAt && !inst.feinted && inst.t >= inst.feintAt) { inst.feinted = true; this.emit({ type: 'feint', f: f.id });
      f.atk = null; f.setState('idle'); if (!this.nextInString(f, inst)) this.releaseToken(f); return; }
    const face = tgt ? Math.atan2(tgt.x - f.x, tgt.z - f.z) : null;
    if (ph === 'startup' && face !== null) f.facing = turnToward(f.facing, face, (f.isPlayer ? CONFIG.player.attackTurnRate : 4) * dt);
    // root motion: bell curve peaking on the strike frame (late startup -> end of active)
    let lv = 0; if (d.lunge) { const s0 = inst.su * 0.55, s1 = inst.su + inst.ac; if (inst.t > s0 && inst.t < s1) { const u = (inst.t - s0) / (s1 - s0); lv = d.lunge * 1.35 * Math.sin(Math.PI * Math.pow(u, 0.8)); } }
    if (tgt && lv) { const dist = Math.hypot(tgt.x - f.x, tgt.z - f.z); if (dist < f.radius + tgt.radius + 0.35) lv = 0; }
    const tvx = Math.sin(f.facing) * lv, tvz = Math.cos(f.facing) * lv; f.vx += (tvx - f.vx) * 0.5; f.vz += (tvz - f.vz) * 0.5;
    if (d.projectile && !inst.fired && ph !== 'startup') { inst.fired = true; const sp = d.projectile.speed, fx = Math.sin(f.facing), fz = Math.cos(f.facing);
      const pr = { id: ++this.projCounter, owner: f.id, team: f.team, x: f.x + fx * 0.8, z: f.z + fz * 0.8, vx: fx * sp, vz: fz * sp, t: 0, life: d.projectile.life, def: d, hit: new Set(), dead: false };
      this.projectiles.push(pr); this.emit({ type: 'projectile', f: f.id, id: pr.id, x: pr.x, z: pr.z, dir: f.facing }); }
    if (ph === 'recovery' && f.recoverFrom === 'deflected') { f.recoverFrom = null; f.atk = null; f.comboQueue.length = 0; f.comboBr = null; f.setState('recoil', CONFIG.parry.finalDeflectRecoil); this.releaseToken(f); return; }
    if (ph === 'recovery' && inst.t >= inst.su + inst.ac + inst.rc * d.chainAt + inst.gap + inst.extraGap) { if (this.nextInString(f, inst)) return; }
    if (ph === 'done') { f.atk = null; f.setState('idle'); if (!f.isPlayer) this.releaseToken(f); }
  }
  /* continue / branch a string. Branches react to what the player JUST did. */
  nextInString(f, inst) {
    if (f.isPlayer) return false;
    const P = f.brain ? f.brain.prof() : {}, br = f.comboBr, pl = this.player;
    if (br && f.comboCount < CONFIG.ai.maxString && pl) {
      const dist = Math.hypot(pl.x - f.x, pl.z - f.z); let pick = null, why = '';
      const bc = P.branchChance !== undefined ? P.branchChance : CONFIG.ai.branchChance;
      if (inst.outcome === 'deflect' && br.deflected) { pick = br.deflected; why = 'you deflected'; }
      else if ((inst.outcome === 'dodged' || inst.outcome === 'jumped' || pl.state === 'dodge') && br.dodged) { pick = br.dodged; why = 'you dodged'; }
      else if (dist > 3.6 && br.backoff) { pick = br.backoff; why = 'you backed off'; }
      if (pick && this.rand() < bc) { f.comboQueue = pick.map(stepOf); f.comboBr = null; this.emit({ type: 'branch', f: f.id, why, to: f.comboQueue.map(s => s.k).join('>') }); if (f.brain) f.brain.reason = 'branch: ' + why; }
    }
    if (!f.comboQueue.length || f.comboCount >= CONFIG.ai.maxString) { f.comboQueue.length = 0; return false; }
    const next = stepOf(f.comboQueue.shift()); startAttack(this, f, next.k, next); return true;
  }
  /* travelling attacks: same defense rules as a melee strike, timed to the moment the wave reaches you */
  stepProjectiles(dt) {
    const R = CONFIG.arena.radius;
    for (const pr of this.projectiles) {
      if (pr.dead) continue; pr.t += dt; pr.x += pr.vx * dt; pr.z += pr.vz * dt;
      if (pr.t >= pr.life || Math.hypot(pr.x, pr.z) > R) { pr.dead = true; this.emit({ type: 'projectileEnd', id: pr.id, x: pr.x, z: pr.z }); continue; }
      const att = this.byId(pr.owner); if (!att) { pr.dead = true; continue; }
      for (const d of this.fighters) {
        if (d.team === pr.team || d.dead || pr.hit.has(d.id) || d.state === 'deathblowed' || d.state === 'deathblowExec') continue;
        if (Math.hypot(d.x - pr.x, d.z - pr.z) > d.radius + CONFIG.projectile.hitRadius) continue;
        pr.hit.add(d.id);
        const inst = { def: pr.def, t: 0, su: 0, ac: 0, rc: 0, hit: pr.hit, id: -pr.id, outcome: null, extraGap: 0, proj: pr };
        // the wave's facing for defense arcs = from where it is, not from the distant attacker
        const ghost = { x: pr.x - pr.vx * 0.05, z: pr.z - pr.vz * 0.05 };
        const out = resolveDefense(d, Object.assign(Object.create(att), ghost), inst, d.lt);
        if (out.result === 'hit' && !d.iframes) { this.pending.push({ a: att, d, inst, strikeLT: d.lt, ghost }); continue; }
        this.projectileOutcome(att, d, inst, out);
      }
    }
    if (this.projectiles.length > 8) this.projectiles = this.projectiles.filter(p => !p.dead);
  }
  projectileOutcome(att, d, inst, out) {
    const r = applyOutcome(this, att, d, inst, out); const pr = inst.proj;
    if (r === 'deflect' || r === 'block' || r === 'guardbreak' || r === 'hit') { pr.dead = true; this.emit({ type: 'projectileEnd', id: pr.id, x: pr.x, z: pr.z, how: r }); }
    return r;
  }
  resolveHits() {
    for (const a of this.fighters) {
      if (a.dead || a.frozen || a.state !== 'attack' || !a.atk) continue;
      const inst = a.atk; if (atkPhase(inst) !== 'active' || inst.def.feintAt || inst.def.projectile) continue;
      for (const d of this.fighters) {
        if (d === a || d.team === a.team || d.dead || inst.hit.has(d.id)) continue;
        if (d.state === 'deathblowed' || d.state === 'deathblowExec') continue;
        const dx = d.x - a.x, dz = d.z - a.z, dist = Math.hypot(dx, dz);
        if (dist > inst.def.range + d.radius) continue;
        if (Math.abs(angNorm(Math.atan2(dx, dz) - a.facing)) * 180 / Math.PI > inst.def.arc / 2) continue;
        inst.hit.add(d.id);
        const strikeLT = d.lt - Math.max(0, inst.t - inst.su);          // anchored to the visual strike frame
        const out = resolveDefense(d, a, inst, strikeLT);
        if (out.result === 'hit' && !out.unblockable && !d.iframes) { this.pending.push({ a, d, inst, strikeLT }); continue; } // late-grace: wait a few ticks for a late deflect
        applyOutcome(this, a, d, inst, out);
      }
    }
  }
  resolvePending() {
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i], d = p.d;
      if (d.dead || d.state === 'deathblowed' || d.state === 'deathblowExec') { this.pending.splice(i, 1); continue; }
      const src = p.ghost ? Object.assign(Object.create(p.a), p.ghost) : p.a;
      const out = resolveDefense(d, src, p.inst, p.strikeLT);
      if (out.result !== 'hit' || d.lt - p.strikeLT > CONFIG.parry.lateGrace) { this.pending.splice(i, 1); if (p.inst.proj) this.projectileOutcome(p.a, d, p.inst, out); else applyOutcome(this, p.a, d, p.inst, out); }
    }
  }
  separate() {
    const fs = this.fighters, R = CONFIG.arena.radius;
    for (let i = 0; i < fs.length; i++) for (let j = i + 1; j < fs.length; j++) {
      const a = fs[i], b = fs[j]; if (a.dead || b.dead) continue;
      const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz) || 0.0001, min = a.radius + b.radius;
      if (d < min) { const p = (min - d) / 2, nx = dx / d, nz = dz / d; a.x -= nx * p; a.z -= nz * p; b.x += nx * p; b.z += nz * p; }
    }
    for (const f of fs) {
      for (const p of CONFIG.arena.pillars) { const dx = f.x - p.x, dz = f.z - p.z, d = Math.hypot(dx, dz) || 0.0001, min = p.r + f.radius; if (d < min) { f.x = p.x + dx / d * min; f.z = p.z + dz / d * min; } }
      const r = Math.hypot(f.x, f.z), lim = R - f.radius; if (r > lim) { f.x *= lim / r; f.z *= lim / r; }
    }
  }
  trackHabits(dt) {
    const pl = this.player, e = pl && (this.lockTarget(pl) || this.enemies()[0]); if (!pl || !e) return;
    const dist = Math.hypot(pl.x - e.x, pl.z - e.z);
    const away = pl.moveSpeed > 1 && ((pl.vx * (pl.x - e.x) + pl.vz * (pl.z - e.z)) / (dist || 1)) > 1.5;
    if (away && dist > 3.5) { this.retreatT += dt; if (this.retreatT > 1.1) { this.habit('retreat'); this.retreatT = 0; } } else this.retreatT = Math.max(0, this.retreatT - dt);
  }
  deathblowCandidate(p) { let best = null, bd = 1e9;
    for (const e of this.enemies()) { if (!e.deathblowable || e.state === 'deathblowed') continue; const d = Math.hypot(e.x - p.x, e.z - p.z); if (d < CONFIG.combat.deathblowRange && d < bd) { bd = d; best = e; } } return best; }
  startDeathblow(p, e) {
    p.atk = null; p.guard = false; p.facing = Math.atan2(e.x - p.x, e.z - p.z); p.setState('deathblowExec', CONFIG.combat.deathblowTime);
    e.atk = null; e.comboQueue.length = 0; e.deathblowable = false; e.setState('deathblowed', CONFIG.combat.deathblowTime); e.facing = p.facing + Math.PI;
    this.releaseToken(e); this.emit({ type: 'deathblow', a: p.id, d: e.id, x: e.x, z: e.z });
  }
  finishDeathblow(e) {
    if (this.player) this.player.stats.deathblows++;
    if (e.profile && e.profile.trainer) { e.hp = e.maxHp; e.posture = 0; e.deathblowable = false; e.setState('idle'); this.emit({ type: 'trainerReset', f: e.id }); return; }   // v6: the dummy never dies
    e.marks--;
    if (e.marks <= 0) { e.dead = true; e.hp = 0; e.setState('dead', 99); this.emit({ type: 'enemyDead', f: e.id }); return; }
    e.hp = e.maxHp * 0.5; e.posture = 0; this.enterPhase2(e);
  }
  enterPhase2(e) {
    if (e.phase === 2) return; e.phase = 2; e.posture = 0; e.atk = null; e.comboQueue.length = 0; e.comboBr = null; e.deathblowable = false;
    e.setState('transition', 2.4); this.releaseToken(e); this.emit({ type: 'phase2', f: e.id }); if (e.brain) e.brain.set('circle', 'phase II stance');
  }
  checkOver() {
    for (const e of this.enemies()) if (e.profile.boss && e.phase === 1 && e.hp <= e.maxHp * 0.5 && e.hp > 0 && !['broken', 'deathblowed', 'transition'].includes(e.state)) { e.marks = 1; this.enterPhase2(e); }
    if (this.over) return;
    if (this.player && this.player.dead) { this.over = 'death'; this.emit({ type: 'gameover', win: false }); }
    else if (this.fighters.some(f => f.team === 1) && this.enemies().length === 0) { this.over = 'victory'; this.emit({ type: 'gameover', win: true }); }
  }
}

/* ---------------------------------------------------------------
   SELF TESTS (node + browser debug overlay)
   --------------------------------------------------------------- */
function runSelfTests() {
  const results = []; const ok = (name, cond, info) => results.push({ name, pass: !!cond, info: info === undefined ? '' : String(info) });
  const DT = CONFIG.sim.dt;
  const savedJ = CONFIG.ai.jitterScale; CONFIG.ai.jitterScale = 0;      // deterministic timing for the timing tests
  const mk = (key, faceOff) => { const w = new World(7); const p = w.addPlayer(0, 0); const e = w.addEnemy(key || 'duelist', 0, 2.0); e.brain = null; p.facing = faceOff || 0; e.facing = Math.PI; return { w, p, e }; };
  // run one enemy swing; cb(w, tStrikeRel) each tick before stepping, where tStrikeRel = time until the strike frame
  const swing = (w, e, key, cb, extraTicks) => { startAttack(w, e, key, { jitter: false }); const su = e.atk.su; const t0 = w.time;
    for (let i = 0; i < 260; i++) { const rel = (t0 + su) - (w.time + DT); if (cb) cb(w, rel); w.step(DT); if (!e.atk && i > 5) break; }
    for (let i = 0; i < (extraTicks || 0); i++) w.step(DT); };
  const pressAtRel = (p, target) => { let done = false; return (w, rel) => { if (!done && rel <= target + 1e-9) { p.intent.parry = true; done = true; } }; };
  const res = p => p.lastDefense && p.lastDefense.result;

  { const { w, p, e } = mk(); swing(w, e, 'd_slash', pressAtRel(p, 0.40)); ok('guard pressed 0.40s early (released) is not a deflect', res(p) === 'hit', res(p)); }
  { const { w, p, e } = mk(); swing(w, e, 'd_slash', pressAtRel(p, 0.10)); ok('press 0.10s before strike = deflect', res(p) === 'deflect', res(p)); ok('deflect costs no health', p.hp === p.maxHp, p.hp); ok('deflect damages enemy posture', e.posture >= 10, e.posture.toFixed(1)); }
  { const { w, p, e } = mk(); swing(w, e, 'd_slash', pressAtRel(p, -0.05)); ok('press 0.05s AFTER strike frame still deflects (late grace)', res(p) === 'deflect', res(p)); }
  { const { w, p, e } = mk(); swing(w, e, 'd_slash', pressAtRel(p, -0.15)); ok('press 0.15s after strike takes the hit', res(p) === 'hit' && p.hp < p.maxHp, res(p)); }
  { const { w, p, e } = mk(); p.intent.guard = true; swing(w, e, 'd_slash'); ok('guard held from long before = block (not deflect)', res(p) === 'block', res(p)); }
  { const { w, p, e } = mk(); swing(w, e, 'd_slash', (w, rel) => { if (rel <= 0.5) p.intent.guard = true; if (Math.abs(rel - 0.5) < DT / 2) p.intent.parry = true; }); ok('raise guard 0.5s before and hold = block', res(p) === 'block', res(p)); }
  { let bp = 0, dp = 0; { const { w, p, e } = mk(); p.intent.guard = true; swing(w, e, 'd_slash'); bp = p.posture; } { const { w, p, e } = mk(); swing(w, e, 'd_slash', pressAtRel(p, 0.08)); dp = p.posture; } ok('block costs more posture than deflect', bp > dp, bp.toFixed(1) + ' vs ' + dp.toFixed(1)); }
  // (a) four deflects in a row inside ONE enemy string, strikes 0.4–0.6 s apart
  { const w = new World(7); const p = w.addPlayer(0, 0); const e = w.addEnemy('brother', 0, 2.0); e.brain.update = () => {}; p.facing = 0; e.facing = Math.PI;
    e.brain.beginCombo(w, e, { c: ['f_quick', S('f_quick2', .7), S('f_quick', .7), S('f_quick2', .7)], w: 1 }, Math.PI);
    let pressedFor = -1, strikes = [], deflects = 0;
    for (let i = 0; i < 60 * 5; i++) { const a = e.atk; if (a && atkPhase(a) === 'startup' && a.id !== pressedFor && a.su - a.t <= 0.08) { p.intent.parry = true; pressedFor = a.id; strikes.push(w.time + (a.su - a.t)); }
      w.step(DT); for (const ev of w.events) if (ev.type === 'deflect') deflects++; w.events.length = 0; if (!e.atk && i > 20) break; }
    const gaps = strikes.slice(1).map((t, i) => (t - strikes[i]).toFixed(2));
    ok('4 consecutive perfectly timed deflects in one string all succeed', deflects === 4 && gaps.every(g => g >= 0.4 && g <= 0.6), deflects + '/4, gaps ' + gaps.join(',')); }
  // (b) no lock-on, facing away
  for (const deg of [90, 150]) { const { w, p, e } = mk('duelist', deg * Math.PI / 180); swing(w, e, 'd_slash', pressAtRel(p, 0.08)); ok('deflect with no lock-on while facing ' + deg + '° away', res(p) === 'deflect', res(p)); }
  // (c) buffered presses during recovery states
  { const { w, p, e } = mk(); e.superarmor = true; p.intent.light = true; w.step(DT); const pa = p.atk; const recStart = pa.su + pa.ac; let pressed = false;
    startAttack(w, e, 'd_slash', { jitter: false }); e.atk.su = recStart + pa.rc * 0.25 + 0.08; e.stateDur = e.atk.su + e.atk.ac + e.atk.rc; const strikeAt = w.time + e.atk.su;
    for (let i = 0; i < 200; i++) { if (!pressed && p.atk && p.atk.t >= recStart + 0.02) { p.intent.parry = true; pressed = true; } w.step(DT); if (!e.atk) break; }
    ok('guard pressed early in own attack recovery is buffered and deflects', res(p) === 'deflect', res(p)); }
  { const { w, p, e } = mk(); p.intent.dodge = true; p.intent.mz = 1; w.step(DT); let pressed = false; startAttack(w, e, 'd_slash', { jitter: false }); e.atk.su = 0.30;
    for (let i = 0; i < 200; i++) { if (!pressed && p.state === 'dodge' && p.stateT >= 0.12) { p.intent.parry = true; pressed = true; } p.intent.mz = 0; w.step(DT); if (!e.atk) break; }
    ok('guard pressed during dodge is buffered and deflects', res(p) === 'deflect', res(p)); }
  { const { w, p, e } = mk(); p.setState('hit', 0.3); let pressed = false; startAttack(w, e, 'd_slash', { jitter: false }); e.atk.su = 0.35;
    for (let i = 0; i < 200; i++) { if (!pressed && p.stateT >= 0.15) { p.intent.parry = true; pressed = true; } w.step(DT); if (!e.atk) break; }
    ok('guard pressed near the end of hit-stun is buffered and deflects', res(p) === 'deflect', res(p)); }
  // (d) human jitter ±50 ms around ideal
  { let succ = 0, n = 0; const r = rng(42);
    for (let k = 0; k < 60; k++) { const { w, p, e } = mk(); const off = 0.06 + (r() * 2 - 1) * 0.05; swing(w, e, ['d_slash', 'k_cut', 'f_quick', 'd_over'][k % 4], pressAtRel(p, off)); n++; if (res(p) === 'deflect') succ++; }
    ok('human-like ±50 ms timing deflects ≥ 90%', succ / n >= 0.9, (succ / n * 100).toFixed(0) + '%'); }
  // (e) mashing never worse than one good press
  { const { w, p, e } = mk(); swing(w, e, 'd_slash', (w, rel) => { if (w.tick % 5 === 0) p.intent.parry = true; }); const mashed = res(p);
    const rank = { deflect: 3, block: 2, hit: 0 };
    { const q = mk(); swing(q.w, q.e, 'd_slash', pressAtRel(q.p, 0.08)); const single = res(q.p); ok('mashing never beats a well-timed single press', rank[mashed] <= rank[single], mashed + ' vs ' + single); }
    const { w: w2, p: p2, e: e2 } = mk(); let presses = 0; swing(w2, e2, 'd_slash', (w, rel) => { if (rel < 0.9 && w.tick % 6 === 0) { p2.intent.parry = true; presses++; } });
    ok('mashing is never ignored (presses still raise guard)', p2.guardStart > 0, presses + ' presses'); }
  { const { w, p } = mk(); for (let i = 0; i < 5; i++) { p.intent.parry = true; w.step(DT); for (let j = 0; j < 9; j++) w.step(DT); }
    ok('rapid spam (5 presses/s) shrinks the next window', p.guardWin < CONFIG.parry.window * 0.99, (p.guardWin * 1000).toFixed(0) + 'ms'); }
  { const { w, p, e } = mk(); for (let i = 0; i < 4; i++) { p.intent.parry = true; w.step(DT); for (let j = 0; j < 9; j++) w.step(DT); } swing(w, e, 'd_slash', pressAtRel(p, 0.06)); p.intent.parry = true; w.step(DT);
    ok('a successful deflect restores the full window', res(p) === 'deflect' && Math.abs(p.guardWin - CONFIG.parry.window) < 1e-9, res(p) + ' ' + (p.guardWin * 1000).toFixed(0) + 'ms'); }
  // hit-stop never drops input
  { const { w, p, e } = mk(); swing(w, e, 'd_slash', pressAtRel(p, 0.08), 0); w.freezeFighters([p], 8); p.intent.light = true; w.step(DT);
    ok('input pressed during hit-stop is buffered, not lost', p.buffer === 'light' || p.state === 'attack', p.buffer + '/' + p.state); }
  { const { w, p, e } = mk(); startAttack(w, e, 'd_slash', { jitter: false }); for (let i = 0; i < 10; i++) w.step(DT); const tE = e.atk.t; w.freezeFighters([e], 6); for (let i = 0; i < 6; i++) w.step(DT);
    ok('hit-stop freezes the fighter but world time continues', Math.abs(e.atk.t - tE) < 1e-9 && w.tick === 16, e.atk.t.toFixed(3)); }
  // carried-over rules
  { const { w, p, e } = mk(); startAttack(w, e, 'd_slash', { jitter: false }); for (let i = 0; i < 120; i++) w.step(DT); ok('an attack damages at most once per swing', p.stats.hitsTaken === 1, p.stats.hitsTaken); }
  { const { w, p, e } = mk(); addPosture(w, e, 1000); ok('posture break at max', e.state === 'broken' && e.deathblowable, e.state); for (let i = 0; i < 200; i++) w.step(DT); ok('enemy recovers from posture break', e.state !== 'broken', e.state); }
  { const { w, p, e } = mk(); p.intent.guard = true; swing(w, e, 'd_sweep', pressAtRel(p, 0.08)); ok('sweep cannot be blocked or deflected', res(p) === 'hit', res(p)); }
  { const { w, p, e } = mk(); swing(w, e, 'd_sweep', (w, rel) => { if (Math.abs(rel - 0.2) < DT / 2) p.intent.jump = true; }); ok('sweep can be jumped', res(p) === 'jumped', res(p)); }
  { const { w, p, e } = mk(); let kicked = false; swing(w, e, 'd_sweep', (w, rel) => { if (Math.abs(rel - 0.2) < DT / 2) p.intent.jump = true; if (!kicked && res(p) === 'jumped' && p.airborne) { p.intent.light = true; kicked = true; } });
    ok('jump-kick off a cleared sweep breaks posture / staggers', p.stats.jumpKicks === 1 && e.posture >= CONFIG.perilous.jumpKickPosture - 1, p.stats.jumpKicks + ' kick, post ' + e.posture.toFixed(0)); }
  { const { w, p, e } = mk('warden'); e.z = 1.6; const p0 = 40; p.posture = p0; swing(w, e, 'w_grab', (w, rel) => { if (Math.abs(rel - 0.1) < DT / 2) { p.intent.mz = 1; p.intent.dodge = true; } });
    ok('grab dodged: whiff (longer enemy recovery) + posture recovery', res(p) === 'dodged' && p.posture < p0, res(p) + ' post ' + p.posture.toFixed(0)); }
  { const { w, p, e } = mk(); p.intent.guard = true; swing(w, e, 'd_thrust'); ok('thrust ignores ordinary guard', res(p) === 'hit', res(p)); }
  { const { w, p, e } = mk(); swing(w, e, 'd_thrust', pressAtRel(p, 0.08)); ok('thrust can be deflected', res(p) === 'deflect', res(p)); }
  { const { w, p, e } = mk(); e.z = 3.0; swing(w, e, 'd_thrust', (w, rel) => { if (Math.abs(rel - 0.15) < DT / 2) { p.intent.mx = 0; p.intent.mz = 1; p.intent.dodge = true; } });
    ok('mikiri: dodging INTO a thrust counters it (posture + stagger)', p.stats.mikiri === 1 && e.posture >= CONFIG.perilous.mikiriPosture - 1 && e.state === 'recoil', p.stats.mikiri + ' ' + e.state); }
  { const { w, p, e } = mk(); p.hp = 1; startAttack(w, e, 'd_over', { jitter: false }); for (let i = 0; i < 120; i++) w.step(DT); p.intent.light = true; w.step(DT); ok('player death ends encounter and blocks actions', p.dead && w.over === 'death', p.state); }
  { const { w, p, e } = mk(); addPosture(w, e, 1000); p.intent.deathblow = true; for (let i = 0; i < 120; i++) w.step(DT); ok('deathblow on broken enemy = victory', e.dead && w.over === 'victory', w.over); }
  { const w = new World(3); w.addPlayer(0, 0); const k = w.addEnemy('king', 0, 2); k.hp = k.maxHp * 0.49; w.step(DT); ok('boss enters phase II at half health', k.phase === 2 && k.state === 'transition', 'phase ' + k.phase);
    for (let i = 0; i < 200; i++) w.step(DT); ok('boss leaves transition state', k.state !== 'transition', k.state); }
  // locomotion feel
  { const { w, p } = mk(); p.intent.mz = 1; w.step(DT); const v1 = p.moveSpeed; for (let i = 0; i < 30; i++) w.step(DT); const v2 = p.moveSpeed; p.intent.mz = 0; w.step(DT); const v3 = p.moveSpeed;
    ok('movement accelerates and decelerates (no instant velocity)', v1 > 0 && v1 < CONFIG.player.walk * 0.25 && Math.abs(v2 - CONFIG.player.walk) < 0.05 && v3 > 0 && v3 < v2, [v1, v2, v3].map(v => v.toFixed(2)).join(' → ')); }
  CONFIG.ai.jitterScale = savedJ;
  // timing jitter bounds
  { const w = new World(77); w.addPlayer(0, 0); const e = w.addEnemy('brother', 0, 3); let lo = 1e9, hi = 0, distinct = new Set();
    const J = PROFILES.brother.jitter * CONFIG.ai.jitterScale;
    for (let i = 0; i < 300; i++) { startAttack(w, e, 'f_quick'); const su = e.atk.su; lo = Math.min(lo, su); hi = Math.max(hi, su); distinct.add(su.toFixed(3)); }
    const base = ATTACKS.f_quick.startup; ok('enemy startup jitter stays inside ±jitter bounds', lo >= base * (1 - J) - 1e-9 && hi <= base * (1 + J) + 1e-9, lo.toFixed(3) + '–' + hi.toFixed(3));
    ok('enemy timing actually varies swing to swing', distinct.size > 20, distinct.size + ' distinct'); }
  { const w = new World(5); w.addPlayer(0, 0); const e = w.addEnemy('duelist', 0, 3); startAttack(w, e, 'd_delay'); const su = e.atk.su; ok('delayed strikes add a variable hold', su >= ATTACKS.d_delay.startup * (1 - PROFILES.duelist.jitter) - 1e-9, su.toFixed(3)); }
  // branching combos
  { const w = new World(9); const p = w.addPlayer(0, 0); const e = w.addEnemy('duelist', 0, 2); e.brain.update = () => {}; CONFIG.ai.jitterScale = 0;
    const combo = PROFILES.duelist.combos[0]; e.brain.beginCombo(w, e, combo, Math.PI); let branched = false; const saveBC = CONFIG.ai.branchChance; CONFIG.ai.branchChance = 1;
    for (let i = 0; i < 300; i++) { if (e.atk && atkPhase(e.atk) === 'startup' && e.atk.su - e.atk.t <= 0.08 && e.atk.su - e.atk.t > 0.06) p.intent.parry = true; w.step(DT);
      for (const ev of w.events) if (ev.type === 'branch') branched = ev.to; w.events.length = 0; if (branched) break; }
    CONFIG.ai.branchChance = saveBC; CONFIG.ai.jitterScale = savedJ;
    ok('string branches when the player deflects (slash > slash2 -> thrust)', branched === 'd_thrust', branched); }
  { const w = new World(9); const p = w.addPlayer(0, 0); const e = w.addEnemy('king', 0, 2); e.phase = 2; e.brain.update = () => {}; const combo = PROFILES.king.phase2.combos[1];
    e.brain.beginCombo(w, e, combo, Math.PI); const seen = []; p.invuln = true;
    for (let i = 0; i < 60 * 8; i++) { w.step(DT); for (const ev of w.events) if (ev.type === 'attackStart') seen.push(ev.key); w.events.length = 0; if (!e.atk && i > 10) break; }
    ok('6-hit mix-up string plays out (deflect / jump / mikiri answers)', seen.length >= 5 && seen.includes('k2_sweep') && seen.includes('k2_thrust'), seen.join('>')); }
  // frame-rate independence
  const sim = fps => { const w = new World(99); const p = w.addPlayer(0, -3); const e = w.addEnemy('duelist', 0, 3); p.lockId = e.id;
    const script = [[0.5, 'light'], [0.9, 'light'], [1.4, 'parry'], [2.2, 'dodge'], [3.0, 'heavy'], [4.4, 'parry'], [5.0, 'light'], [6.0, 'parry'], [7.5, 'dodge']]; let si = 0;
    w.preStep = () => { while (si < script.length && w.time >= script[si][0]) { p.intent[script[si][1]] = true; si++; } p.intent.mz = 0.5; };
    while (w.tick < 720 && !w.over) w.advance(1 / fps, 720);
    return [p.hp.toFixed(3), p.posture.toFixed(3), e.hp.toFixed(3), e.posture.toFixed(3), p.x.toFixed(4), e.x.toFixed(4), w.tick].join('|'); };
  const s30 = sim(30), s60 = sim(60), s144 = sim(144); ok('identical outcome at 30 / 60 / 144 fps', s30 === s144 && s60 === s144, s30 === s144 && s60 === s144 ? 'match' : s30 + ' / ' + s60 + ' / ' + s144);
  { const w = new World(5); const p = w.addPlayer(0, -3); const e = w.addEnemy('brother', 0, 3); p.lockId = e.id; p.hp = 1e6; p.maxHp = 1e6; const r = rng(11);
    let maxStuck = 0, last = '', since = 0;
    for (let i = 0; i < 60 * 120; i++) { if (r() < 0.04) p.intent[['light', 'parry', 'dodge', 'heavy', 'jump'][Math.floor(r() * 5)]] = true; p.intent.mx = Math.sin(i / 90); p.intent.mz = Math.cos(i / 130);
      w.step(DT); w.events.length = 0; if (w.over) break; const s = e.state + ':' + e.brain.state; if (s === last) since += DT; else { since = 0; last = s; } maxStuck = Math.max(maxStuck, since); }
    ok('enemy AI never stuck >9 s in one state over a 2-minute brawl', maxStuck < 9, 'max ' + maxStuck.toFixed(1) + 's'); }
  { const w = new World(8); w.addPlayer(0, 0); const e = w.addEnemy('brother', 0, 2.5); const P = e.brain.prof(); let base = 0, adapted = 0;
    for (let i = 0; i < 400; i++) { const c = e.brain.pickCombo(w, P, 2.5, false); e.brain.lastCombo = null; if (c.tag === 'delayed' || c.tag === 'feint') base++; }
    for (let i = 0; i < 4; i++) w.habit('parry_early');
    for (let i = 0; i < 400; i++) { const c = e.brain.pickCombo(w, P, 2.5, false); e.brain.lastCombo = null; if (c.tag === 'delayed' || c.tag === 'feint') adapted++; }
    ok('early-deflect habit makes delayed/feint strings more likely', adapted > base * 1.3, base + ' -> ' + adapted); }
  { const w = new World(4); const p = w.addPlayer(0, 0); const e = w.addEnemy('duelist', 0, 2.2); e.brain = null; p.facing = 0; e.facing = Math.PI; p.intent.light = true; w.step(DT); let res2 = null;
    e.guard = true; e.setState('guard'); for (let i = 0; i < 30; i++) { w.step(DT); if (e.lastDefense) { res2 = e.lastDefense.result; break; } }
    ok('AI obeys the same rules: holding guard without a timed press only blocks', res2 === 'block', res2); }
  /* ---------- v5: player combo kit ---------- */
  { const sj = CONFIG.ai.jitterScale; CONFIG.ai.jitterScale = 0;
    const solo = () => { const w = new World(21); const p = w.addPlayer(0, 0); return { w, p }; };
    const tapKey = (w, p, k) => { p.intent[k] = true; w.step(DT); };
    const runUntil = (w, cond, n) => { for (let i = 0; i < (n || 240); i++) { if (cond()) return true; w.step(DT); } return cond(); };
    // light chain of four, 4th is the spinning finisher
    { const { w, p } = solo(); const keys = []; tapKey(w, p, 'light'); keys.push(p.atk && p.atk.def.key);
      for (let n = 0; n < 3; n++) { runUntil(w, () => p.atk && atkPhase(p.atk) === 'recovery'); tapKey(w, p, 'light'); keys.push(p.atk && p.atk.def.key); }
      ok('light chain runs four hits, ending in the spin finisher', keys.join('>') === 'p_l1>p_l2>p_l3>p_l4' && ATTACKS.p_l4.finisher, keys.join('>')); }
    { const { w, p } = solo(); tapKey(w, p, 'light'); runUntil(w, () => p.atk && atkPhase(p.atk) === 'recovery'); tapKey(w, p, 'light'); runUntil(w, () => p.atk && atkPhase(p.atk) === 'recovery'); tapKey(w, p, 'heavy');
      ok('light > light > heavy = rising finisher', p.atk && p.atk.def.key === 'p_lh', p.atk && p.atk.def.key); }
    { const { w, p } = solo(); tapKey(w, p, 'heavy'); ok('heavy from neutral is still the plain heavy', p.atk && p.atk.def.key === 'p_h', p.atk && p.atk.def.key); }
    { const { w, p } = solo(); p.intent.mz = 1; tapKey(w, p, 'dodge'); runUntil(w, () => p.stateT >= CONFIG.dodge.attackCancelAt); tapKey(w, p, 'light');
      ok('light out of a dodge = dash cut', p.atk && p.atk.def.key === 'p_dash', p.state + ' ' + (p.atk && p.atk.def.key)); }
    { const { w, p } = solo(); p.intent.mz = 1; p.intent.sprint = true; for (let i = 0; i < 40; i++) w.step(DT); tapKey(w, p, 'light');
      ok('light while sprinting = running thrust', p.atk && p.atk.def.key === 'p_run', p.atk && p.atk.def.key); }
    { const { w, p } = solo(); tapKey(w, p, 'jump'); runUntil(w, () => p.airborne); tapKey(w, p, 'light'); const k1 = p.atk && p.atk.def.key;
      ok('light in the air = plunging air slash', k1 === 'p_air', k1 + ' ' + p.state); }
    { const { w, p, e } = mk(); swing(w, e, 'd_slash', pressAtRel(p, 0.08), 0); let tries = 0; while (p.state !== 'idle' && p.state !== 'guard' && p.state !== 'move' && tries++ < 30) w.step(DT);
      p.intent.guard = false; tapKey(w, p, 'heavy'); ok('heavy right after a deflect = riposte', res(p) === 'deflect' && p.atk && p.atk.def.key === 'p_ripo', res(p) + ' ' + (p.atk && p.atk.def.key)); }
    { const { w, p, e } = mk(); swing(w, e, 'd_slash', pressAtRel(p, 0.08), 0); for (let i = 0; i < 60; i++) w.step(DT); tapKey(w, p, 'heavy');
      ok('heavy long after a deflect is a normal heavy', p.atk && p.atk.def.key === 'p_h', p.atk && p.atk.def.key); }
    { const kb = key => { const w = new World(3); const p = w.addPlayer(0, 0); const e = w.addEnemy('duelist', 0, 1.9); e.brain = null; e.facing = Math.PI; startAttack(w, p, key); for (let i = 0; i < 80 && e.state !== 'hit'; i++) w.step(DT); return Math.hypot(e.vx, e.vz); };
      const a = kb('p_l1'), b = kb('p_l4'); ok('finisher hits knock back harder than a light', b > a * 1.5, a.toFixed(1) + ' vs ' + b.toFixed(1)); }
    /* ---------- v5: King phase II — Crimson Arc + block chip ---------- */
    const kingAt = dist => { const w = new World(5); const p = w.addPlayer(0, 0); const k = w.addEnemy('king', 0, dist); k.brain = null; k.phase = 2; k.facing = Math.PI; p.facing = 0; return { w, p, k }; };
    const wave = (w, p, k, cb) => { startAttack(w, k, 'k2_wave', { jitter: false }); for (let i = 0; i < 240; i++) { if (cb) cb(w); w.step(DT); if (p.lastDefense) break; } for (let i = 0; i < 8; i++) w.step(DT); };
    const arriving = (w, p, lead) => { const pr = w.projectiles.find(q => !q.dead); if (!pr) return false; const d = Math.hypot(pr.x - p.x, pr.z - p.z) - p.radius - CONFIG.projectile.hitRadius; return d <= Math.hypot(pr.vx, pr.vz) * lead; };
    { const { w, p, k } = kingAt(7); wave(w, p, k); ok('Crimson Arc travels and hits at 7 m', res(p) === 'hit' && p.hp < p.maxHp, res(p) + ' hp ' + p.hp); }
    { const { w, p, k } = kingAt(7); let done = false; wave(w, p, k, w => { if (!done && arriving(w, p, 0.08)) { p.intent.parry = true; done = true; } });
      ok('Crimson Arc can be deflected (and hurts the King\'s posture)', res(p) === 'deflect' && k.posture > 0, res(p) + ' kpost ' + k.posture.toFixed(0)); }
    { const { w, p, k } = kingAt(7); let done = false; wave(w, p, k, w => { if (!done && arriving(w, p, 0.2)) { p.intent.jump = true; done = true; } });
      ok('Crimson Arc can be jumped', res(p) === 'jumped' && p.hp === p.maxHp, res(p)); }
    { const { w, p, k } = kingAt(7); let done = false; wave(w, p, k, w => { if (!done && arriving(w, p, 0.06)) { p.intent.dodge = true; p.intent.mz = 1; done = true; } });
      ok('Crimson Arc can be dodged through', res(p) === 'dodged' && p.hp === p.maxHp, res(p)); }
    { const blockHp = phase => { const { w, p, k } = kingAt(2); k.phase = phase; p.intent.guard = true; swing(w, k, phase === 2 ? 'k2_a' : 'k_cut'); return [res(p), p.hp]; };
      const [r1, h1] = blockHp(1), [r2, h2] = blockHp(2); ok('phase II blocks chip health; phase I light blocks do not', r1 === 'block' && r2 === 'block' && h1 === 100 && h2 < 100, h1 + ' vs ' + h2.toFixed(1)); }
    { const { w, p, k } = kingAt(7); wave(w, p, k); const left = w.projectiles.filter(q => !q.dead).length; for (let i = 0; i < 120; i++) w.step(DT);
      ok('projectiles expire and are cleaned up', w.projectiles.filter(q => !q.dead).length === 0, left + ' live after hit'); }
    CONFIG.ai.jitterScale = sj; }
  /* ---------- v6: graduated deflects + trainer ---------- */
  { const sj = CONFIG.ai.jitterScale; CONFIG.ai.jitterScale = 0; const q = p => p.lastDefense && p.lastDefense.result === 'deflect' ? p.lastDefense.quality : (p.lastDefense && p.lastDefense.result);
    const at = rel => { const { w, p, e } = mk(); swing(w, e, 'd_slash', pressAtRel(p, rel)); return { q: q(p), p, e }; };
    const a = at(0.02), b = at(0.12), c = at(-0.04);
    ok('deflect 20 ms before strike = perfect', a.q === 'perfect', a.q); ok('deflect 120 ms before strike = good', b.q === 'good', b.q); ok('deflect 40 ms after strike = late', c.q === 'late', c.q);
    ok('perfect deflect breaks more enemy posture than good', a.e.posture > b.e.posture, a.e.posture.toFixed(1) + ' vs ' + b.e.posture.toFixed(1));
    ok('perfect deflect costs the player less posture', a.p.posture <= b.p.posture, a.p.posture.toFixed(1) + ' vs ' + b.p.posture.toFixed(1));
    ok('deflect stats count quality', a.p.stats.perfect === 1 && b.p.stats.good === 1 && c.p.stats.late === 1, [a.p.stats.perfect, b.p.stats.good, c.p.stats.late].join('/'));
    { const { w, p, e } = mk(); swing(w, e, 'd_slash', (w, rel) => { if (w.tick % 4 === 0) p.intent.parry = true; }); const mq = q(p);
      ok('mashing never earns a perfect', mq !== 'perfect', mq); }
    { const w = new World(3); const p = w.addPlayer(0, 0); const e = w.addEnemy('trainer', 0, 2.4); const seen = [];
      for (let i = 0; i < 60 * 30; i++) { p.invuln = true; w.step(DT); for (const ev of w.events) if (ev.type === 'attackStart') seen.push(ev.key); w.events.length = 0; }
      ok('trainer loops its lesson incl. thrust, sweep and grab', seen.includes('d_thrust') && seen.includes('d_sweep') && seen.includes('w_grab') && seen.length >= 8, seen.length + ' swings'); }
    { const w = new World(3); w.training = { perilous: true }; const p = w.addPlayer(0, 0); w.addEnemy('trainer', 0, 2.4); const seen = new Set();
      for (let i = 0; i < 60 * 15; i++) { p.invuln = true; w.step(DT); for (const ev of w.events) if (ev.type === 'attackStart') seen.add(ev.key); w.events.length = 0; }
      ok('trainer "perilous only" swings only perilous attacks', [...seen].every(k => ATTACKS[k].danger) && seen.size >= 2, [...seen].join(',')); }
    { const w = new World(3); const p = w.addPlayer(0, 0); const e = w.addEnemy('trainer', 0, 2.0); addPosture(w, e, 1e4); p.intent.deathblow = true; for (let i = 0; i < 120; i++) w.step(DT);
      ok('trainer survives deathblows and resets', !e.dead && e.hp === e.maxHp && !w.over && p.stats.deathblows === 1, e.state + ' ' + w.over); }
    { const w = new World(5); w.addPlayer(0, 0); const e = w.addEnemy('duelist', 0, 3); e.tempoMult = 1.25; CONFIG.ai.jitterScale = 0; startAttack(w, e, 'd_slash');
      ok('tempoMult slows enemy windups', Math.abs(e.atk.su - ATTACKS.d_slash.startup * 1.25) < 1e-9, e.atk.su.toFixed(3)); }
    CONFIG.ai.jitterScale = sj; }
  return results;
}

const API = { deflectQuality, CONFIG, ATTACKS, PROFILES, World, Fighter, Brain, Habits, resolveDefense, pressGuard, canGuardNow, addPosture, atkPhase, startAttack, runSelfTests, angNorm, clamp, turnToward, parryWindow, stepOf };
root.VEYN_CORE = API; root.VEYN_TEST = { runSelfTests, resolveDefense, CONFIG };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
