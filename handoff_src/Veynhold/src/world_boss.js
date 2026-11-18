/* =====================================================================
   VEYNHOLD — CHUNK D: THE HEADSMAN (world layer only; core.js untouched, combat timing unchanged)
   1. Build-up on the Headsman's Stair: dying torches, notices, a remembered voice, bell / crows / heartbeat (WebAudio synth),
      a visible fog threshold into the Block.
   2. Odran's first-encounter cutscene (~43 s, letterboxed, subtitled, skippable with Esc / E, Settings.intros). The sim is held
      at its current tick the whole time (G.Intro.active), so nothing can be hit; control returns with input cleared.
   3. Boss fixes: field foes no longer follow you onto the Block or strike / lock on through the sealed fog gate; the finisher
      camera never sits inside the ring wall; the dying headsman can be knelt by where he actually fell.
   4. Sekiro-style deathblows (chunk G1): step inside the guard, the blade driven through a plate seam (gut, armpit or neck; down through the
      neck when the victim is on its knees), hit-stop + hold, dark spray (ink or blood per Settings.hitStyle), heavy impact,
      a pull-out with blood, then the body clutches, buckles and falls on its side and stays (blood pool). The boss's final blow gets a three-shot cut;
      field foes a real-time 3/4 cut (none on Low). Presentation only: poses, the attacker's visual root, the blade's
      attachment rotation, presentation time scale (Cine) and cameras. Every sim tick and state duration is the core's own.
   ===================================================================== */
(function () {
'use strict';
const G = window.VEYN_GAME, CORE = window.VEYN_CORE, D = window.VEYN_DATA, A = window.VEYN_ADV;
if (!G || !CORE || !D || !A || !A.api || !G.P1) { console.warn('[Veynhold] chunk D unavailable'); return; }
const THREE = window.THREE, P1 = G.P1, $ = id => document.getElementById(id);
const { Game, Cam, Input, Settings, camera, Character, FX, VISUAL, Cine, Juice, POSES } = G;
const { audio, tier, NameCard, Letterbox, Cinema, Finale, toast } = P1; const Intro = G.Intro; const VFX = G.V7.VFX;
const { CONFIG, clamp, angNorm } = CORE; const { Region, Ents, Save } = A.api; const S = () => Save.data;
const HEADLESS = !!window.__VEYN_HEADLESS;
const R1 = D.REGIONS && D.REGIONS.execution; if (!R1) return;
const BD = A.BossD = { enabled: !HEADLESS, hold: false };   // tests set enabled (headless has no intros by default); hold freezes presentation for screenshots

/* ---------------------------------------------------------------- lore + dressing (data, merged by the region builder) */
Object.assign(D.LORE, {
  notice_odran: { title: 'A Fresh Notice', text: 'Nailed over an older writ. The ink is still wet.\n\nTHE WARD IS LOOSE.\n\nThe King\u2019s sentence on Wren Aldmoor is not discharged. A sentence stands until it is carried out.\n\nShe will come up the Stair. Let her. No gaoler is to follow her onto the Block.\n\n\u2014 O. Vale, Warden' },
  warden_rule: { title: 'Cut into the Stair', text: 'WHAT THE KING CONDEMNS, THE WARDEN FINISHES.\n\nBeneath it, in a newer hand, forty years of tally marks run down the stone in neat columns.\n\nThe last mark has been cut, scratched out, and cut again.' },
});
R1.notes.push({ id: 'notice_odran', x: 5.6, z: 28.7, lore: 'notice_odran', prompt: 'Read the notice nailed by the Stair' },
  { id: 'warden_rule', x: -3.0, z: 32.7, lore: 'warden_rule', prompt: 'Read the words cut into the Stair' });
// fewer torches as you climb: two burning at the foot, one on the landing, dead ones at the stair head
R1.props.push({ t: 'torch', x: -4.9, z: 28.2 }, { t: 'torch', x: 4.9, z: 27.4 }, { t: 'torch', x: -3.4, z: 31.9 }, { t: 'deadtorch', x: 3.45, z: 31.85 },
  { t: 'deadtorch', x: -3.45, z: 35.5 }, { t: 'deadtorch', x: 3.45, z: 35.5 }, { t: 'wallnotice', x: 5.6, z: 29.15 }, { t: 'carving', x: -3.5, z: 32.7 },   // chunk WORLD: notice on the tower face (was z 29.62, inside the tower), carving proud of the stair wall (was x -3.93, inside it)
  { t: 'chainposts', x: 0, z: 36.4 });
const B = A.Builder && A.Builder.prototype;
if (B) {
  B.p_deadtorch = function (p) { const M = this.M; this.mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.2, 6), M.darkwood, p.x, 1.1, p.z); this.mesh(new THREE.CylinderGeometry(0.2, 0.11, 0.2, 8), M.iron, p.x, 2.25, p.z);
    const c = this.mesh(new THREE.ConeGeometry(0.12, 0.22, 6), M.rust, p.x, 2.42, p.z); c.castShadow = false; this.circle(p.x, p.z, 0.2, { cam: false, sight: false, deco: true }); };
  // merge: renamed from p_notice — chunk C's p_notice (the stake with the Gaol Key order) keeps that name
  B.p_wallnotice = function (p) { const M = this.M; const bd = this.mesh(new THREE.BoxGeometry(0.9, 1.1, 0.06), M.darkwood, p.x, 1.75, p.z); bd.castShadow = false;
    for (const [dx, dy, s, k] of [[-0.12, 1.82, 0.5, 0.06], [0.2, 1.6, 0.34, -0.1]]) { const pa = this.mesh(new THREE.PlaneGeometry(s, s * 1.3), M.wax, p.x + dx, dy, p.z - 0.035, Math.PI); pa.rotation.z = k; pa.castShadow = false; } };
  B.p_carving = function (p) { const M = this.M; const sl = this.mesh(new THREE.BoxGeometry(0.1, 1.2, 1.5), M.stone, p.x, 1.25, p.z); sl.castShadow = false;
    for (let i = 0; i < 5; i++) { const g = this.mesh(new THREE.BoxGeometry(0.02, 0.05, 1.1 - i * 0.12), M.darkwood, p.x + 0.055, 1.62 - i * 0.16, p.z); g.castShadow = false; } };
  // the threshold: two iron posts with slack chains hanging off them (clear of the walkway), the fog gate seals between them
  B.p_chainposts = function (p) { const M = this.M; for (const sx of [-1, 1]) { const x = p.x + sx * 3.55; this.mesh(new THREE.CylinderGeometry(0.11, 0.14, 2.6, 6), M.iron, x, 1.3, p.z); this.mesh(new THREE.SphereGeometry(0.16, 6, 4), M.iron, x, 2.65, p.z);
      for (let k = 0; k < 7; k++) { const u = k / 6, l = this.mesh(new THREE.TorusGeometry(0.07, 0.018, 3, 6), M.iron, x - sx * (0.12 + u * 0.32), 2.35 - u * 1.5 + Math.sin(u * 3.1) * 0.08, p.z, k * 1.57); l.castShadow = false; } } };
}

/* ---------------------------------------------------------------- audio (WebAudio synth only) */
const DB6on = () => !!(G.DB6 && G.DB6.cur && G.DB6.on);
const sfx = function (name, o) { if (!audio.ok) return; if ((name === 'impale' || name === 'rip' || name === 'scrape') && G.DB6 && G.DB6.Audio && G.DB6.Audio.owns()) return; o = o || {}; const v = o.vol === undefined ? 1 : o.vol;
  audio.vol = v; audio.wet = true; audio.out = null;
  try { switch (name) {
    case 'bell': [[110, 4.2, 0.12], [220.6, 3.4, 0.05], [264, 3.0, 0.045], [330.8, 2.4, 0.03], [467, 1.6, 0.02]].forEach(([f, d, a]) => audio.tone(f, d, 'sine', a, o.delay || 0)); audio.nz(0.06, 'bandpass', 900, 1, 0.08, 0.2, o.delay || 0); break;
    case 'crow': { const n = 2 + ((Math.random() * 2) | 0); for (let i = 0; i < n; i++) { const t = (o.delay || 0) + i * (0.32 + Math.random() * 0.08); audio.tone(780 + Math.random() * 120, 0.16, 'sawtooth', 0.025, t, 520); audio.nz(0.14, 'bandpass', 1500, 2.5, 0.05, 0.12, t, 900); } break; }
    case 'heart': { const c = audio.ctx, t = c.currentTime + 0.02; audio.drum(t, true, 0.55 * v); audio.drum(t + 0.2, false, 0.38 * v); break; }
    case 'scrape': audio.nz(0.32, 'bandpass', 2600, 3, 0.05, 0.2, o.delay || 0, 4200); break;
    case 'impale': audio.tone(46, 0.6, 'sine', 0.6, 0, 26); audio.nz(0.14, 'lowpass', 380, 1, 0.7, 0.28); audio.nz(0.05, 'bandpass', 2100, 1.4, 0.22, 0.07); audio.tone(760, 0.5, 'triangle', 0.04, 0.02, 600); audio.play('dbEntry', { vol: v }); break;
    case 'rip': audio.nz(0.22, 'bandpass', 1300, 1, 0.3, 0.16, 0, 420); audio.nz(0.16, 'bandpass', 900, 1.2, 0.16, 0.12, 0.05, 2600); break;
    case 'slam': audio.tone(52, 0.8, 'sine', 0.5, 0, 30); audio.nz(0.3, 'lowpass', 300, 1, 0.5, 0.5); break;
    case 'ash': audio.nz(1.4, 'highpass', 2400, 0.6, 0.05, 1.2, 0, 6000); break;
  } } catch (e) {}
  audio.vol = 1; audio.wet = null; };
BD.sfx = sfx;

/* ---------------------------------------------------------------- DOM: subtitles + skip hint (created once) */
const css = document.createElement('style'); css.textContent =
  '#vhSub{position:fixed;left:50%;bottom:13.5vh;transform:translateX(-50%);width:min(86vw,960px);text-align:center;pointer-events:none;z-index:7;opacity:0;transition:opacity .25s;font-family:Georgia,serif;text-shadow:0 2px 6px #000,0 0 2px #000}'
  + '#vhSub b{display:block;font:600 12px/1.2 Georgia,serif;letter-spacing:.32em;color:#b89a6a;margin-bottom:6px;text-transform:uppercase}#vhSub span{font-size:clamp(17px,2.2vw,25px);color:#efe4cc;line-height:1.35}'
  + '#vhSkip{position:fixed;right:3vw;top:calc(10.5vh + 12px);z-index:7;pointer-events:none;font:12px Georgia,serif;letter-spacing:.18em;color:#a8987c;opacity:0;transition:opacity .4s}'
  + '#vhFlash{position:fixed;inset:0;z-index:6;pointer-events:none;opacity:0;background:radial-gradient(ellipse at 50% 46%,rgba(255,246,236,.85) 0%,rgba(255,206,190,.6) 22%,rgba(176,14,20,.42) 62%,rgba(70,0,4,.62) 100%)}'   /* merge 2: softer: at peak the old stops washed the whole frame pink */
  + '#dbHint.vhPop{animation:vhDbPop .12s ease-out,vhDbPulse .5s .12s infinite alternate}@keyframes vhDbPop{from{transform:scale(1.35)}to{transform:scale(1)}}@keyframes vhDbPulse{from{text-shadow:0 0 6px rgba(255,60,40,.5)}to{text-shadow:0 0 14px rgba(255,190,90,.95);color:#ffd2a0}}'
  + 'body.cine #advArea,body.cine #advHint,body.cine #advPrompt,body.cine #advCompass,body.cine #advObj,body.cine #advFlask,body.cine #toast,body.cine .advMark{opacity:0!important;transition:opacity .3s}';
document.head.appendChild(css);
const sub = document.createElement('div'); sub.id = 'vhSub'; sub.innerHTML = '<b></b><span></span>'; document.body.appendChild(sub);
const skipEl = document.createElement('div'); skipEl.id = 'vhSkip'; skipEl.textContent = 'ESC / E \u2014 SKIP'; document.body.appendChild(skipEl);
const flashEl = document.createElement('div'); flashEl.id = 'vhFlash'; document.body.appendChild(flashEl);
let subKey = -1; const showSub = (i, who, text) => { if (i === subKey) return; subKey = i; if (i < 0) { sub.style.opacity = 0; return; } sub.querySelector('b').textContent = who; sub.querySelector('span').textContent = text; sub.style.opacity = 1; };

/* ---------------------------------------------------------------- poses (built over the rig's zero pose; nothing in POSES is changed) */
const KEYS = Object.keys(POSES.ready), Z0 = {}; for (const k of KEYS) Z0[k] = 0;
const KEYSH = KEYS.concat(['headX', 'side']);   // chunk H1: the finisher / collapse tracks also drive the head and the torso's side bend (not in POSES.ready, so never sampled before)
const pose = o => Object.assign({}, Z0, o); const mix = (a, b, t) => { const o = {}; for (const k of KEYS) o[k] = a[k] + (b[k] - a[k]) * t; return o; };
const PZ = {
  stagger: pose({ hipY: -0.22, lean: 0.25, headX: 0.15, rSx: -0.2, rSz: -0.4, rE: -0.4, wX: 0.4, lSx: -0.2, lSz: 0.4, lE: -0.4, lLeg: -0.3, rLeg: 0.25, lKnee: 0.45, rKnee: 0.4, legSpread: 0.1 }),
  impaled: pose({ hipY: -0.2, lean: 0.55, headX: 0.55, rSx: -0.55, rSy: 0.1, rSz: -0.35, rE: -0.5, wX: 0.5, lSx: -0.6, lSy: 0.2, lSz: 0.35, lE: -0.5, lLeg: -0.35, rLeg: 0.3, lKnee: 0.5, rKnee: 0.45, legSpread: 0.12 }),
  impaledRip: pose({ hipY: -0.3, lean: -0.15, headX: -0.45, rSx: 0.2, rSz: -0.7, rE: -0.3, wX: 0.4, lSx: 0.2, lSz: 0.7, lE: -0.3, lLeg: 0.15, rLeg: -0.1, lKnee: 0.6, rKnee: 0.7 }),
  kneelNeck: pose({ hipY: -0.52, lean: 0.85, headX: 0.75, rSx: -0.2, rSz: -0.35, rE: -0.3, wX: 0.5, lSx: -0.2, lSz: 0.35, lE: -0.3, lLeg: -1.45, rLeg: 0.1, lKnee: 1.65, rKnee: 2.05 }),
  kneelRip: pose({ hipY: -0.5, lean: 0.35, headX: -0.35, rSx: 0.1, rSz: -0.6, rE: -0.2, wX: 0.4, lSx: 0.1, lSz: 0.6, lE: -0.2, lLeg: -1.45, rLeg: 0.1, lKnee: 1.65, rKnee: 2.05 }),
  // chunk G1: standing posture-break stagger (sword arm thrown up, chest and armpit open) and the collapse keys
  reel: pose({ hipY: -0.12, lean: -0.32, headX: -0.35, twist: 0.15, rSx: -2.3, rSy: 0.2, rSz: -0.5, rE: -0.6, wX: -0.5, lSx: -0.9, lSz: 0.7, lE: -0.5, lLeg: 0.25, rLeg: -0.3, lKnee: 0.35, rKnee: 0.25, legSpread: 0.14 }),
  reelLow: pose({ hipY: -0.24, lean: 0.12, headX: 0.2, rSx: -1.5, rSz: -0.45, rE: -0.5, wX: 0.2, lSx: -0.5, lSz: 0.5, lE: -0.7, lLeg: -0.2, rLeg: 0.15, lKnee: 0.5, rKnee: 0.45, legSpread: 0.12 }),
  clutch: pose({ hipY: -0.18, lean: 0.4, headX: 0.45, rSx: -0.95, rSy: 0.5, rSz: -0.1, rE: -1.7, wX: 0.6, lSx: -0.95, lSy: -0.5, lSz: 0.1, lE: -1.7, lLeg: -0.3, rLeg: 0.2, lKnee: 0.4, rKnee: 0.35 }),
  buckle: pose({ hipY: -0.55, lean: 0.6, headX: 0.6, rSx: -0.6, rSz: -0.2, rE: -1.4, wX: 0.5, lSx: -0.6, lSz: 0.2, lE: -1.4, lLeg: -1.45, rLeg: -1.4, lKnee: 1.75, rKnee: 1.8, legSpread: 0.12 }),
  slumpFwd: pose({ hipY: -0.6, lean: 1.05, headX: 0.85, rSx: 0.15, rSz: -0.35, rE: -0.2, wX: 0.3, lSx: 0.15, lSz: 0.35, lE: -0.2, lLeg: -1.5, rLeg: -1.45, lKnee: 1.85, rKnee: 1.9 }),
  // chunk H1: the side lie, tuned by search (coordinate descent + random restarts over these keys and FALL_A, jsdom procedural rig, exact-vertex floor pin)
  // so the resting body lies flat: hips 0.20, head 0.18, hands 0.09 / 0.09, knees 0.17 / 0.15 m off the floor (was 0.38 / 0.46 / 0.57 / 0.39). Chest turned down, top knee drawn up.
  // INT5: re-searched (same method, deathblow_seq rig) so the pelvis rests on the floor (<= 0.04 m) and no limb is propped (<= 0.12 m)
  lieSide: pose({ hipY: -0.5, lean: 0.48, side: 0.8, twist: -1.65, headX: 0.38, rSx: -0.42, rSy: -0.02, rSz: 1.7, rE: -0.65, wX: 0.86, lSx: -0.5, lSy: 0.88, lSz: 0.5, lE: -1.05, lLeg: -0.07, rLeg: 0.06, lKnee: 1.31, rKnee: 0.57, legSpread: -0.54 }),
  // chunk H1: settle (blade in, the body locks rigid around it, head lifts in a gasp) and extract (jerked back off the blade, arms flung)
  impaledTense: pose({ hipY: -0.17, lean: 0.36, headX: -0.18, twist: 0.08, rSx: -0.85, rSy: 0.35, rSz: -0.2, rE: -1.3, wX: 0.6, lSx: -0.9, lSy: 0.3, lSz: 0.25, lE: -1.25, lLeg: -0.4, rLeg: 0.35, lKnee: 0.5, rKnee: 0.42, legSpread: 0.13 }),
  pullLean: pose({ hipY: -0.3, lean: -0.2, headX: -0.42, rSx: 0.25, rSz: -0.75, rE: -0.35, wX: 0.4, lSx: 0.15, lSz: 0.65, lE: -0.4, lLeg: 0.2, rLeg: -0.15, lKnee: 0.6, rKnee: 0.68, legSpread: 0.14 }),
  whet: pose({ hipY: -0.5, lean: 0.6, headX: 0.55, rSx: -0.9, rSy: 0.1, rE: -0.5, wX: 1.0, lSx: -0.75, lSy: -0.35, lSz: 0.1, lE: -1.1, lLeg: -1.5, rLeg: 0.2, lKnee: 1.6, rKnee: 2.1 }),
};
PZ.plungeMid = mix(POSES.plunge_w, POSES.plunge_s, 0.55);
PZ.plungeDeep = Object.assign({}, POSES.plunge_s, { hipY: -0.5, lean: 0.9 });   // chunk H1: drive phase, the weight goes down through the blade
// chunk G1: thrusts for the higher seams: a shallower lunge, the torso more upright, so the sword hand rises toward the armpit / gorget
PZ.thrustMid = Object.assign({}, Z0, POSES.runThrust_s, { hipY: -0.26, lean: 0.5, rSx: -1.75, wX: 0.15 });
PZ.thrustHigh = Object.assign({}, Z0, POSES.runThrust_s, { hipY: -0.14, lean: 0.28, rSx: -1.95, wX: 0.3 });
PZ.driveStab = Object.assign({}, Z0, POSES.runThrust_s, { hipY: -0.43, lean: 0.84 });
PZ.driveMid = Object.assign({}, PZ.thrustMid, { hipY: -0.31, lean: 0.6, rSx: -1.7 });
PZ.driveHigh = Object.assign({}, PZ.thrustHigh, { hipY: -0.19, lean: 0.38 });
const P = n => PZ[n] || POSES[n];
// sim-time track for the standing posture-break stagger (the finisher tracks are built per blow on the wall clock: see tracks() below)
const TR = {
  vic_reel: [[0, '@'], [0.10, 'reel'], [0.55, 'reel'], [1.0, 'reelLow'], [2.2, 'reelLow']],
};
const sm01 = t => t * t * (3 - 2 * t), eio = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
function sample(out, tr, t, stance, entry, keys) { const g = n => n === '@' ? entry : n === null ? stance : P(n), K = keys || KEYS;
  if (t <= tr[0][0]) { const A0 = g(tr[0][1]); if (!keys) Object.assign(out, A0); else for (const k of K) out[k] = A0[k] || 0; return out; }
  for (let i = 0; i < tr.length - 1; i++) { const a = tr[i], b = tr[i + 1]; if (t <= b[0]) { const A0 = g(a[1]), B0 = g(b[1]), u = sm01((t - a[0]) / Math.max(1e-4, b[0] - a[0])); for (const k of K) { const x0 = A0[k] || 0; out[k] = x0 + ((B0[k] || 0) - x0) * u; } return out; } }
  const Z = g(tr[tr.length - 1][1]); if (!keys) Object.assign(out, Z); else for (const k of K) out[k] = Z[k] || 0; return out; }
const visT = (f, t, alpha, dt) => f.frozen ? t : Math.max(0, t - (1 - alpha) * dt);

/* =====================================================================
   CUTSCENE — "The Block" (first encounter with Odran Vale)
   ===================================================================== */
const OD_SPOT = { x: 0, z: 52.4 }, WR_SPOT = { x: 0, z: 41.5 };
// 10 lines. Odran: craftsman's pride, terse; circles the stones (taboo) and never says the King knew (that is his dying confession).
const LINES = [
  [6.0, 10.6, 'Odran Vale', 'Forty years I\u2019ve tied the knots on this hill. Not one has ever slipped.'],
  [12.2, 16.0, 'Wren', 'Yours didn\u2019t slip, Odran. I hung. I died.'],
  [17.2, 20.3, 'Odran Vale', 'You did. I watched it, Ward. I know dead when I see it.'],
  [20.5, 23.8, 'Odran Vale', 'Then Tamsin\u2019s cart. The pit. And now you\u2019re standing on my stair.'],
  [24.2, 26.7, 'Wren', 'Why didn\u2019t it take me?'],
  [27.4, 30.3, 'Odran Vale', 'Don\u2019t ask a headsman about the stones. Not up here.'],
  [30.5, 33.8, 'Odran Vale', 'The writ says hanged until dead, under the King\u2019s own seal. It doesn\u2019t say once.'],
  [34.1, 36.5, 'Wren', 'I\u2019m going north. The key on your belt opens that gate.'],
  [37.0, 40.0, 'Odran Vale', 'Then take it off a dead man. I\u2019ve never left a sentence half done.'],
  [40.3, 43.2, 'Odran Vale', 'Kneel, Ward. I\u2019ll make it clean this time.'],
];
// camera shots: [t0, t1, from pos, to pos, look from, look to, fov]; y is height above the Block's floor
const SHOTS = [
  [0, 5.6, [3.5, 5.6, 34.9], [2.2, 3.4, 37.4], [0, 1.0, 51.5], [0, 1.0, 51.5], 50],           // establishing: over the stair head onto the Block, Wren walks in
  [5.6, 12.0, [2.7, 1.3, 47.4], [2.1, 1.2, 48.3], [0, 0.95, 52.4], [0, 0.9, 52.4], 38],        // the headsman behind the Block, whetting the blade
  [12.0, 17.0, [-1.2, 1.8, 54.4], [-1.0, 1.75, 54.0], [0, 1.3, 41.5], [0, 1.3, 41.5], 36],      // reverse: over his shoulder onto Wren
  [17.0, 23.9, [1.95, 0.85, 50.1], [1.75, 0.95, 50.4], [0, 1.15, 52.4], [0, 1.9, 52.4], 36],    // close, low: he rises (merge 2: look ends at 1.9, not 2.25: the helm sits on the upper third instead of mid-frame under empty fog, clear of the subtitle)
  [23.9, 27.2, [0.85, 1.5, 43.5], [0.75, 1.5, 43.2], [0, 1.45, 41.5], [0, 1.45, 41.5], 32],     // Wren, close
  [27.2, 33.9, [-2.5, 1.5, 47.8], [-2.0, 1.5, 48.6], [0, 1.8, 52.4], [0, 1.7, 52.4], 40],       // Odran, the blade dragging
  [33.9, 36.8, [1.7, 2.7, 54.8], [1.6, 2.6, 54.5], [0, 1.0, 41.5], [0, 1.1, 41.5], 44],         // high over his shoulder: Wren looks small
  [36.8, 44.0, [3.4, 0.6, 48.2], [3.0, 0.7, 48.8], [0, 1.5, 51.8], [0, 1.9, 52.0], 44],         // low 3/4: he heaves the blade and plants it (merge 2: was a worm's-eye from in front of the Block, which hid him behind it)
];
const OD_TRACK = [[0, 'whet'], [12.0, 'whet'], [16.8, 'kneelPlant'], [17.6, 'kneelPlant'], [19.2, 'riseHalf'], [20.4, null], [27.6, null], [28.6, 'bladeDrag'], [30.4, 'bladeDrag'], [31.4, null], [36.9, null],
  [37.9, 'overheadHeavy_w'], [38.75, 'overheadHeavy_s'], [40.2, 'overheadHeavy_s'], [41.2, 'roar'], [42.6, 'roar'], [43.6, null]];
const WR_TRACK = [[0, null], [24.4, null], [25.0, 'execPull'], [26.2, null], [39.6, null], [40.6, 'guard'], [44, 'guard']];
const CUT_DUR = 44.0, SLAM_T = 38.75;
const Cut = BD.Cut = { active: false, t: 0, en: null, card: null, from: null, last: { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 44 }, events: null, skipped: false, plays: 0, tmp: {} };
Cut.start = function (en, card) { const w = Game.world, p = w.player, o = en.f;
  this.active = true; this.t = 0; this.en = en; this.card = card; this.skipped = false; this.plays++; this.hp0 = p.hp; this.time0 = w.time; this.from = { x: p.x, z: p.z };
  this.events = { bell0: false, bell1: false, crow: false, slam: false, sting: false, hb: 0, strokes: 0 };
  // stage the scene (sim is held while G.Intro is active, so these are placements, not motion)
  o.x = o.px = OD_SPOT.x; o.z = o.pz = OD_SPOT.z; o.vx = o.vz = o.pvx = o.pvz = 0; o.facing = o.pfacing = o.aiFace = Math.PI; o.atk = null; if (o.state !== 'idle') o.setState('idle');
  p.vx = p.vz = p.pvx = p.pvz = 0; p.atk = null; p.guard = false; if (p.state !== 'idle') p.setState('idle'); p.lockId = null;
  Intro.active = true; Intro.t = 0; Intro.out = 0; Intro.boss = o; Intro.card = null; Intro.skipped = false; Letterbox.set(true, 0); NameCard.hide();
  skipEl.style.opacity = 1; showSub(-1); Input.clear(); A.drink = null; };
Cut.finish = function (skipped) { if (!this.active) return; const w = Game.world; this.active = false; this.skipped = !!skipped; showSub(-1); skipEl.style.opacity = 0;
  if (w) { const p = w.player, o = this.en && this.en.f; p.x = p.px = WR_SPOT.x; p.z = p.pz = WR_SPOT.z; p.vx = p.vz = p.pvx = p.pvz = 0; if (p.state !== 'idle') p.setState('idle');
    const I = p.intent; I.mx = I.mz = 0; I.light = I.heavy = I.charged = I.dodge = I.jump = I.deathblow = I.parry = I.guard = I.sprint = false; p.buffer = null;
    if (o) { o.x = o.px = OD_SPOT.x; o.z = o.pz = OD_SPOT.z; o.facing = o.pfacing = o.aiFace = Math.atan2(p.x - o.x, p.z - o.z); p.facing = p.pfacing = Math.atan2(o.x - p.x, o.z - p.z); Cam.yaw = p.facing; } }
  Intro.active = false; Intro.out = Intro.outDur; this.outBlend = true; Letterbox.set(false); Input.clear(); Game.eT = null;
  if (this.card) NameCard.show(this.card[0], this.card[1], this.card[2]); this.card = null;
  if (skipped) audio.play('introSting'); Save.write(); };
Cut.update = function (dt) { if (!this.active) return; if (Game.state !== 'playing' || BD.hold) return; if (Input.pressed.KeyE || Input.pressed.Escape) { this.finish(true); return; }   // pad Y arrives as a pressed KeyE
  const w = Game.world; if (!w || !this.en || this.en.f.dead) { this.finish(true); return; }
  const t0 = this.t; this.t += dt; const t = this.t, E = this.events, p = w.player, o = this.en.f; Intro.t = t;
  // Wren walks up to the Block during the establishing shot (presentation placement; the sim is held)
  if (t < 5.8) { const u = clamp((t - 0.4) / 5.2, 0, 1), sp = u > 0 && u < 1 ? Math.hypot(WR_SPOT.x - this.from.x, WR_SPOT.z - this.from.z) / 5.2 : 0, k = sm01(u);
    p.x = p.px = this.from.x + (WR_SPOT.x - this.from.x) * k; p.z = p.pz = this.from.z + (WR_SPOT.z - this.from.z) * k; const fa = Math.atan2(o.x - p.x, o.z - p.z); p.facing = p.pfacing = fa;
    const v = sp * 6 * k * (1 - k) * 1.0; p.vx = p.pvx = Math.sin(fa) * v; p.vz = p.pvz = Math.cos(fa) * v; const want = v > 0.15 ? 'move' : 'idle'; if (p.state !== want) p.setState(want); }
  else if (p.state !== 'idle' || p.vx || p.vz) { p.vx = p.vz = p.pvx = p.pvz = 0; if (p.state !== 'idle') p.setState('idle'); }
  if (t >= 5.8) { const fa = Math.atan2(o.x - p.x, o.z - p.z); p.facing = p.pfacing = fa; }
  o.x = o.px = OD_SPOT.x; o.z = o.pz = OD_SPOT.z; o.vx = o.vz = 0; o.facing = o.pfacing = Math.atan2(p.x - o.x, p.z - o.z);
  // sound
  if (!E.bell0 && t > 0.3) { E.bell0 = true; sfx('bell'); } if (!E.crow && t > 3.2) { E.crow = true; sfx('crow', { vol: 0.8 }); } if (!E.bell1 && t > 20.6) { E.bell1 = true; sfx('bell', { vol: 0.8 }); }
  if (t < 36.8 && Math.floor(t / 1.05) !== Math.floor(t0 / 1.05)) sfx('heart', { vol: 0.25 + 0.35 * t / 36.8 });
  if (t > 5.6 && t < 11.8) { const n = Math.floor((t - 5.6) * 0.8); if (n > E.strokes) { E.strokes = n; sfx('scrape'); } }
  if (!E.slam && t >= SLAM_T) { E.slam = true; sfx('slam'); const c = Game.chars.get(o.id); FX.kick(0.18); if (c) { FX.puff(o.x + Math.sin(o.facing) * 1.4, o.z + Math.cos(o.facing) * 1.4, 10); } }
  if (!E.sting && t >= 40.3) { E.sting = true; audio.play('introSting'); }
  // subtitles
  let li = -1; for (let i = 0; i < LINES.length; i++) if (t >= LINES[i][0] && t < LINES[i][1]) { li = i; break; } showSub(li, li >= 0 ? LINES[li][2] : '', li >= 0 ? LINES[li][3] : '');
  if (t >= CUT_DUR) this.finish(false); };
const _cp = new THREE.Vector3(), _cl = new THREE.Vector3();
Cut.camera = function () { const t = this.t; let s = SHOTS[SHOTS.length - 1]; for (const q of SHOTS) if (t < q[1]) { s = q; break; }
  const u = eio(clamp((t - s[0]) / (s[1] - s[0]), 0, 1)), a = s[2], b = s[3], la = s[4], lb = s[5];
  this.last.pos.set(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u); this.last.look.set(la[0] + (lb[0] - la[0]) * u, la[1] + (lb[1] - la[1]) * u, la[2] + (lb[2] - la[2]) * u); this.last.fov = s[6]; };
Cut.pose = function (c, T, alpha, dt) { const f = c.f, o = this.en && this.en.f, t = this.t; if (!o) return false;
  if (f === o) { sample(T, OD_TRACK, t, G.STANCES.warden || POSES.ready, POSES.ready);
    if (t > 5.6 && t < 11.8) { const k = Math.sin((t - 5.6) * Math.PI * 1.6), e = clamp((t - 5.6) / 0.6, 0, 1) * clamp((11.8 - t) / 0.6, 0, 1); T.lSx += k * 0.32 * e; T.lE += Math.abs(k) * 0.25 * e; T.headX += 0.05 * k * e; }   // whetstone strokes along the edge
    if (t > 20.4 && t < 27.6) T.headX += Math.sin(t * 0.9) * 0.04; return true; }
  if (f.isPlayer && t >= 5.8) { sample(T, WR_TRACK, t, POSES.ready, POSES.ready); T.headX -= 0.06; return true; }
  return false; };
BD.LINES = LINES; BD.SHOTS = SHOTS; BD.CUT_DUR = CUT_DUR;

// --- Intro hooks: while the cutscene owns G.Intro, its timer / camera / skip are ours (the frame loop still holds the sim)
{ const iu = Intro.update, ic = Intro.camera, isk = Intro.skip, ie = Intro.end;
  const ist = Intro.start; Intro.start = function () { Cut.outBlend = false; return ist.apply(this, arguments); };
  Intro.update = function (dt) { if (Cut.active) { Cut.update(dt); return; } const r = iu.call(this, dt); if (Cut.outBlend && this.out <= 0) Cut.outBlend = false; return r; };
  Intro.camera = function (alpha) { if (Cut.active || (Cut.outBlend && this.out > 0)) { if (Cut.active) Cut.camera(); this.pos.copy(Cut.last.pos); this.look.copy(Cut.last.look); this.fov = Cut.last.fov; return true; } return ic.call(this, alpha); };
  Intro.skip = function () { if (Cut.active) return; return isk.call(this); };   // only Esc / E skip the cutscene (handled in onKey / pad)
  Intro.end = function () { if (Cut.active) { Cut.finish(true); return; } return ie.call(this); }; }
{ const ai = Cinema.anyInput; Cinema.anyInput = function () { if (Cut.active) return; return ai.call(this); }; }
{ const ok = Game.onKey; Game.onKey = function (code, repeat) { if (Cut.active && A.active) { if (!repeat && (code === 'Escape' || code === 'KeyE')) Cut.finish(true); return; } return ok.call(this, code, repeat); }; }

/* =====================================================================
   BOSS START: cutscene on the first encounter; seal the Block from the field
   ===================================================================== */
{ const sb = A.startBoss; A.startBoss = function (en) { const def = en.def, first = !S().flags['intro_' + def.id], want = def.boss === 'region' && first && def.id === 'odran' && BD.enabled && Settings.intros !== false;
    const en0 = Intro.enabled; if (def.id === 'odran') Intro.enabled = false; let r; try { r = sb.call(this, en); } finally { Intro.enabled = en0; }
    if (def.arena) BD.sealArena(def.arena);
    if (want) { const card = [en.f.profile.name, (def.card && def.card[1]) || '', true]; Cut.start(en, card); }
    return r; }; }
BD.sealArena = function (ar) { const p = Game.world.player; let n = 0;
  for (const e of Ents.list) { if (e.def.boss || e.f.dead) continue; const inside = Math.hypot(e.f.x - ar.x, e.f.z - ar.z) < 15.5;
    if (e.mode === 'combat') { Ents.disengage(e); n++; } if (inside) { e.f.x = e.f.px = e.home.x; e.f.z = e.f.pz = e.home.z; e.f.vx = e.f.vz = 0; e.alert = 0; } }   // the notice: no gaoler follows her onto the Block
  if (p.lockId) { const t = Game.world.byId(p.lockId); const en = t && Ents.byF.get(t.id); if (en && !en.def.boss) p.lockId = null; } return n; };
// a sealed fog gate blocks sight (no lock-on / perception / attacks through it); while the Block is sealed, field foes outside it lose you
{ const eu = Ents.update.bind(Ents); Ents.update = function (dt, w) { eu(dt, w); const b = A.boss; if (!b || !b.def.arena) return; const ar = b.def.arena, gate = Region.gates[ar.gate]; if (!gate || !gate.seg.on) return;
    const p = w.player, pin = Math.hypot(p.x - ar.x, p.z - ar.z) < ar.r + 2.5; if (!pin) return;
    for (const e of this.list) { if (e.def.boss || e.f.dead) continue; const out = Math.hypot(e.f.x - ar.x, e.f.z - ar.z) > ar.r + 2.5; if (!out) continue;
      if (e.mode === 'combat') this.disengage(e); else if (e.alert > 0.1) e.alert = 0; } }; }
{ const bw = A.buildWorld; A.buildWorld = function (sp) { const r = bw.apply(this, arguments); BD.afterBuild(); return r; }; }
BD.afterBuild = function () { if (G.prewarm && !HEADLESS) setTimeout(() => G.prewarm(true), 0);   /* DB6 perf #2/#3: region programs + uploads at load */ const g = Region.gates.bossfog; if (g && g.seg) g.seg.sight = true; Fin.cur = null; Col.list.length = 0; BD.brkId = undefined; BD.dbOn = false; Cut.active = false; showSub(-1); skipEl.style.opacity = 0; BD.corpse = null; BD.buildT = 0; Pop.clear(); };

/* =====================================================================
   DEATHBLOWS
   ===================================================================== */
const Fin = BD.Fin = { cur: null, last: null, count: 0 };
const _u = new THREE.Vector3(), _h = new THREE.Vector3(), _t = new THREE.Vector3(), _d = new THREE.Vector3(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _hp = new THREE.Vector3(), _hd = new THREE.Vector3(),
  _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4(), _UP = new THREE.Vector3(0, 1, 0), _e = new THREE.Vector3(), _tip = new THREE.Vector3();
function lowTier() { const T = tier(); return T === G.TIERS.low || T.label === 'Low'; }
// chunk G1: plate seams. Field kills cycle gut (under the breastplate) / armpit (under the raised sword arm) / neck (gorget gap); Odran's last is the armpit.
const SEAMS = ['gut', 'armpit', 'neck'], SSTEP = { gut: 0, armpit: 0.3, neck: -0.08, kneel: 0 }, SLAT = { gut: 0, armpit: -0.12, neck: 0, kneel: 0 }, SEAM_H = { gut: 0.22, armpit: 0.62, neck: 0.92 };
const eout = t => 1 - (1 - t) * (1 - t) * (1 - t);
/* chunk H1 (retargeted to blueprint v3 §7): the finisher runs on a PHASE clock, wall seconds since E that stand still while any hit-stop is
   active (our impact hit-stop, or a core freeze on either fighter). Bookmarks: commit 0 (wind-back, step-in), drive 0.28 (the point goes in),
   impact ~0.32 (hit-stop), settle 0.55 (the body locks around the blade, the twist), extract 0.95 (the pull-out), blade-clear ~1.15 (the
   collapse takes the body WITH launch velocity), unlock (the core's 1.3 s deathblow ends: control back, 1.40 s wall), end (camera / letterbox
   done, ~2.25 s wall; Odran's final blow 2.75 s, settle and extract +0.25 each). Unlock and end are given in wall seconds (unlockW / endW) and
   live on the phase clock as unlockW - hs / endW - hs. The sim is not re-timed: a feedback time scale steers the sim clock (stateT +
   world.acc) onto a straight line that ends at `unlock`, so every core tick and duration is the core's own (~1x, held in the hit-stop).
   Phase entry blends (smoothstep, sample()): commit 0.12, drive 0.08, settle 0.14, extract 0.11, collapse hand-off 0.18. */
/* INT5 rewire to the chunk I1 core: the phase clock IS the core deathblow clock (world.deathblow.t, paused in the core's impact hit-stop, which
   is the ONLY hit-stop: 6 ticks = 0.10 s). Bookmarks come from the core schedule / deathblowPhase / deathblowClear / deathblowUnlock events; these
   tables are only the fallback when no core record is visible. unlock is on the phase clock (core 1.40 / 1.90); unlockW = unlock + hs (wall);
   end = endW - hs. v0 / vy are replaced by the core launch (speed 0.9-1.3 m/s, up 0.18) once the record is read. The sim is never re-timed. */
const PH_FIELD = { drive: 0.28, impact: 0.32, settle: 0.55, extract: 0.95, clear: 1.15, unlock: 1.40, endW: 2.25, v0: 1.1, vy: 0.18, camOut: 0.55 };
const PH_BOSS = { drive: 0.28, impact: 0.32, settle: 0.80, extract: 1.45, clear: 1.65, unlock: 1.90, endW: 2.75, v0: 1.0, vy: 0.18, camOut: 0.55 };
const BLEND = { commit: 0.12, drive: 0.08, settle: 0.14, extract: 0.11, collapse: 0.18 };
BD.PH = { field: PH_FIELD, boss: PH_BOSS }; BD.BLEND = BLEND;
const coreHS = () => Math.max(0, Math.round(((CONFIG.deathblow && CONFIG.deathblow.impactHitStop) || 0) * CONFIG.parry.hitStopScale)) * CONFIG.sim.dt;   // the core impact hit-stop (s)
function phaseTable(T, R) { const o = Object.assign({}, T); if (R && R.sched) for (const [k, v] of R.sched) if (k !== 'commit') o[k] = v;
  if (R && R.launch) { o.v0 = R.launch.speed; o.vy = R.launch.up; } o.hs = coreHS(); o.unlockW = o.unlock + o.hs; o.end = T.endW - o.hs; return o; }
const DB_T = CONFIG.combat.deathblowTime;   // legacy alias (1.40 with the I1 core)
// pose tracks per finisher on the phase clock; each phase's key is reached after its entry blend (the hit-stop freezes the clock, so nothing moves in it)
function tracks(F) { const ph = F.ph, B = BLEND, dr = ph.drive, se = ph.settle, ex = ph.extract, cl = ph.clear, u = ph.unlock;
  const atk = (wind, thr, drv) => [[0, '@'], [B.commit, wind], [dr, thr], [dr + B.drive, drv], [ex, drv], [ex + B.extract, 'execPull'], [cl + 0.05, 'chiburi'], [u - 0.08, 'chiburi'], [u, null]];
  const A = F.kind === 'neck' ? atk('plunge_w', 'plungeMid', 'plungeDeep')
    : F.seam === 'neck' ? atk('riposte_w', 'thrustHigh', 'driveHigh') : F.seam === 'armpit' || F.bossFinal ? atk('riposte_w', 'thrustMid', 'driveMid') : atk('riposte_w', 'runThrust_s', 'driveStab');
  let V; if (F.kind === 'neck') V = F.final ? [[0, '@'], [B.commit, 'kneelNeck'], [ex, 'kneelNeck'], [ex + B.extract, 'kneelRip']] : [[0, '@'], [B.commit, 'kneelNeck'], [ex, 'kneelNeck'], [ex + B.extract, 'kneelRip'], [cl + 0.15, 'broken'], [u, 'broken']];
  else { const v0 = [[0, '@'], [B.commit, 'stagger'], [dr, 'stagger'], [dr + B.drive, 'impaled'], [se, 'impaled'], [se + B.settle, 'impaledTense'], [ex, 'impaledTense']];
    V = F.final ? v0.concat([[ex + B.extract, 'pullLean']]) : v0.concat([[ex + B.extract, 'impaledRip'], [cl + 0.15, 'broken'], [u, 'broken']]); }
  return { A, V }; }
BD.tracks = tracks;
Fin.begin = function (e, w) { const att = w.byId(e.a), vic = w.byId(e.d); if (!att || !vic || !att.isPlayer) return; const ac = Game.chars.get(att.id), vc = Game.chars.get(vic.id); if (!ac || !vc) return;
  const boss = !!(A.boss && A.boss.e && A.boss.e.f === vic), final = vic.marks <= 1, kneel = !(boss && final) && vc.pose.hipY < -0.3;
  const seam = kneel ? 'kneel' : boss && final ? 'gut' : SEAMS[this.count % 3];   // Odran (tall, plated): up under the breastplate
  const R0 = w.deathblow && w.deathblow.v === vic ? w.deathblow : null, bf = boss && final, ph = phaseTable(bf ? PH_BOSS : PH_FIELD, R0);
  this.cur = { a: att, v: vic, ac, vc, boss, final, bossFinal: bf, kind: kneel ? 'neck' : 'stab', seam, sStep: SSTEP[seam], lat: SSTEP[seam], latW: SLAT[seam], D: kneel ? 0.85 : 1.05, imp: false, rip: false, hs: 0, real: 0, wall: 0,
    impReal: -1, ripReal: -1, shud: false, twist: false, burst2: false, drip: 0, plant: false, jerk: false, handed: false, ph,
    launch: R0 ? R0.launch : null, ev: {}, wl: 0, cut: true, entA: null, entV: null, side: -1, shot: 0, sideOK: null, L: 0, cu: null, E: null, slide: 0 };   // side -1: Wren's sword-arm side; chunk H1: the field cut runs on every tier (Low too)
  const F = this.cur; F.tr = tracks(F);
  // chunk DB6: the clip layer + world root motion own both bodies (no step-in glue); bookmarks follow its presentation clock (accessibility Settle)
  const S6 = G.DB6 && G.DB6.on && G.DB6.cur; if (S6 && S6.v === vic && S6.R === w.deathblow) { F.db6 = S6; ph.extract = S6.K[4]; ph.clear = S6.K[5]; }
  if (!bf) Letterbox.set(true, ph.endW);   // the bars run on to the presentation end (wall), past the unlock (the generic deathblow sets 2.0 s)
  this.count++; this.last = F; };
// INT5: no sim time scale any more (Tier A): the core deathblow runs at 1x, so the impact lands at 0.32 s wall. Fin.scale only advances the
// wall clock F.wall (and freezes the sim for BD.hold screenshots). The phase clock F.real is read from the core in Fin.clock().
Fin.scale = function (dt) { const F = this.cur; if (!F) return null; if (BD.hold) return 0; F.wall += dt; return null; };
// phase clock = core deathblow clock (+ the sub-tick accumulator while it runs, so 144 fps poses are smooth); after the unlock it runs on in wall time.
// F.hs mirrors the core impact hit-stop still to run (s), for the tests / beats; it is never a second hit-stop.
Fin.clock = function (F, w) { const R = w.deathblow, a = F.a, v = F.v;
  if (R && R.v === v) { const fr = (a.freeze || 0) > 0 || (v.freeze || 0) > 0 || a.frozen || v.frozen; F.hs = Math.max(a.freeze || 0, v.freeze || 0) * CONFIG.sim.dt;
    F.real = Math.max(F.real, R.t + (fr || w.tick <= R.t0 ? 0 : Math.min(w.acc || 0, CONFIG.sim.dt))); }
  else { F.hs = 0; if (!BD.hold) F.real += Math.max(0, F.wall - F.wl); }
  F.wl = F.wall; };
// blueprint §7: pause or the title clears the letterbox and every piece of finisher presentation (the core's deathblow simply runs on: on resume
// the generic game.js tracks play it out and the collapse takes the body when it dies). Bodies already handed to the collapse stay.
BD.clearFin = function () { const F = Fin.cur; if (F && !F.handed && F.vc) Col.reset(F.vc); Fin.cur = null; Letterbox.set(false); Pop.clear(); Pop.sk = 0; if (Finale.active) Finale.active = false; };
{ const gp = Game.pause, gq = Game.quit; Game.pause = function () { const was = this.state; const r = gp.apply(this, arguments); if (was === 'playing' && this.state === 'paused') BD.clearFin(); return r; };
  Game.quit = function () { BD.clearFin(); return gq.apply(this, arguments); }; }
{ const ts = Cine.timeScale; Cine.timeScale = function (dt) { const b = ts.call(this, dt); if (!A.active) return b; const s = Fin.scale(dt); return s === null ? b : s; }; }
// event hooks: our payoff replaces the generic delayed burst for player deathblows in world mode (the generic DEATHBLOW banner stays)
const _bossEvs = [];   // DB6 perf: reused (no per-frame events.slice())
{ const he = Game.handleEvents; Game.handleEvents = function () { const w = this.world; if (!A.active || !w) return he.call(this); const evs = _bossEvs; evs.length = 0; for (let i = 0; i < w.events.length; i++) evs.push(w.events[i]); const r = he.apply(this, arguments);
    for (let i = 0; i < evs.length; i++) { const e = evs[i]; const Fc = Fin.cur; if (Fc && Fc.v && (e.type === 'deathblowPhase' || e.type === 'deathblowClear' || e.type === 'deathblowUnlock') && e.victim === Fc.v.id) {   // INT5: core bookmarks
        Fc.ev[e.type === 'deathblowPhase' ? e.phase : e.type === 'deathblowClear' ? 'clear' : 'unlock'] = true; if (e.type === 'deathblowClear' && e.vel) Fc.launchVel = e.vel; }
      if (e.type === 'deathblow' && w.player && e.a === w.player.id) { Fin.begin(e, w); for (let i = Juice.pending.length - 1; i >= 0; i--) if (Juice.pending[i].id === e.d) Juice.pending.splice(i, 1); }
      if (e.type === 'postureBreak') { BD.brkId = e.f; BD.brkT = w.time; }
      if (e.type === 'enemyDead') Col.died(w.byId(e.f)); }
    return r; }; }
// finisher pose override (attacker + victim), collapse, standing posture-break stagger, cutscene poses
{ const ct = Character.prototype.computeTarget; Character.prototype.computeTarget = function (alpha, dt) {
    if (A.active) { const f = this.f, T = this.target;
      if (Cut.active && Cut.pose(this, T, alpha, dt)) return 0;
      if (Col.pose(this, T, dt)) return 0;
      const F = Fin.cur; if (F && (f === F.a || f === F.v) && (f.state === 'deathblowExec' || f.state === 'deathblowed')) { const isA = f === F.a;
        const key = isA ? 'entA' : 'entV'; if (!F[key]) F[key] = Object.assign({}, this.pose);
        const st = (G.STANCES && G.STANCES[this.lookKey]) || POSES.ready; sample(T, isA ? F.tr.A : F.tr.V, F.real, this.baseP || st, F[key], KEYSH);
        if (!isA && F.E && F.jerkS) { const u = clamp((F.real - F.ph.extract) / (F.ph.clear - F.ph.extract), 0, 1); T.twist += F.jerkS * 0.4 * sm01(u); }   // extract: the lateral twist toward the fall side
        return 0; }
      // chunk G1: a broken foe staggers on its feet, sword arm thrown up (chest and armpit open) instead of the one-knee kneel
      if (f.state === 'broken' && !f.isPlayer && f.team === 1) { if (!this._reelE) this._reelE = Object.assign({}, this.pose);
        sample(T, TR.vic_reel, visT(f, f.stateT, alpha, dt), POSES.ready, this._reelE); return 0; }
      if (this._reelE) this._reelE = null; }
    return ct.call(this, alpha, dt); }; }
// geometry: after every character has updated (Cam.update runs right after), place the step-in and run the blade through the seam
function bladeOf(c) { if (c.model && c.model.blade) return { o: c.model.blade, ax: 'z' }; return { o: c.wrist, ax: '-y' }; }
const _AXZ = new THREE.Vector3(0, 0, 1), _AXY = new THREE.Vector3(0, -1, 0);
function aimBlade(c, dir, w, roll) { const b = bladeOf(c), o = b.o; if (!o || !o.parent || w <= 0) return;
  o.parent.getWorldQuaternion(_q); _x.crossVectors(_UP, dir); if (_x.lengthSq() < 1e-6) _x.set(1, 0, 0); _x.normalize(); _y.crossVectors(dir, _x).normalize();
  if (b.ax === 'z') _m.makeBasis(_x, _y, dir); else { _e.copy(dir).negate(); _hd.crossVectors(_x, _e).normalize(); _m.makeBasis(_x, _e, _hd); }
  _q2.setFromRotationMatrix(_m); _q.invert().multiply(_q2); o.quaternion.slerp(_q, clamp(w, 0, 1)); if (roll) o.rotateOnAxis(b.ax === 'z' ? _AXZ : _AXY, roll); o.updateMatrixWorld(true); }
function targetPoint(vc, F, out) { if (F.db6 && G.DB6.vital(vc, out)) return out; vc.hips.getWorldPosition(_hp); vc.head.getWorldPosition(_hd); if (F.kind === 'neck') return out.copy(_hp).lerp(_hd, 0.84);
  out.copy(_hp).lerp(_hd, SEAM_H[F.seam] || 0.3);
  if (F.seam === 'armpit') { const th = vc.root.rotation.y, k = 0.16 * (vc.look.scale || 1); out.x -= Math.cos(th) * k; out.z += Math.sin(th) * k; }   // victim's right (local -x)
  return out; }
BD.targetPoint = targetPoint;
// chunk H1: E, the way the body leaves the blade and falls: away from the camera, a little away from the killer, never into a wall, and at least
// 0.55 to the victim's side (the lie pose is a side lie). Returns { x, z, side } with side +1 = the victim's right.
// Blueprint §7.3: for a finisher the reference is the finisher camera's AUTHORED spot (camRef: from the attacker / victim line, the facing and the
// walls), never the live camera, so variant and side are deterministic; the live camera is used only for bodies that die outside a finisher.
const LAT_MIN = 0.55;
function fallDir(c, ax, az, out, ref) { const vx = c.root.position.x, vz = c.root.position.z, rx0 = ref ? ref[0] : camera.position.x, rz0 = ref ? ref[1] : camera.position.z; let ex = vx - rx0, ez = vz - rz0, l = Math.hypot(ex, ez) || 1; ex /= l; ez /= l;
  if (ax !== null) { let kx = vx - ax, kz = vz - az; const kl = Math.hypot(kx, kz) || 1; ex += 0.35 * kx / kl; ez += 0.35 * kz / kl; l = Math.hypot(ex, ez) || 1; ex /= l; ez /= l; }
  const th = c.root.rotation.y, rx = -Math.cos(th), rz = Math.sin(th), fx = Math.sin(th), fz = Math.cos(th);
  let la = ex * rx + ez * rz, fw = ex * fx + ez * fz; if (Math.abs(la) < LAT_MIN) { la = (la < 0 ? -1 : 1) * LAT_MIN; fw = (fw < 0 ? -1 : 1) * Math.sqrt(1 - LAT_MIN * LAT_MIN); } else { const n = Math.hypot(la, fw); la /= n; fw /= n; }
  const cand = [[la, fw], [la, -fw], [-la, fw], [-la, -fw]];
  for (const [a, b] of cand) { const x = a * rx + b * fx, z = a * rz + b * fz; if (Region.camClear(vx, vz, vx + x * 1.9, vz + z * 1.9)) { out.x = x; out.z = z; out.side = a < 0 ? -1 : 1; return out; } }
  out.x = la * rx + fw * fx; out.z = la * rz + fw * fz; out.side = la < 0 ? -1 : 1; return out; }
BD.fallDir = fallDir;
function fieldCut(F) { if (F.cu) return F.cu; const a = F.a, v = F.v; let ux = v.x - a.x, uz = v.z - a.z; const l = Math.hypot(ux, uz) || 1; ux /= l; uz /= l; F.cu = { ux, uz, vx: v.x, vz: v.z };
  const ok = s => Region.camClear(v.x, v.z, v.x + uz * s * 3.9 - ux * 0.7, v.z - ux * s * 3.9 - uz * 0.7); F.fside = ok(-1) ? -1 : ok(1) ? 1 : 0; return F.cu; }   // prefer Wren's sword-arm side
function camRef(F) { const a = F.a, v = F.v; let ux = v.x - a.x, uz = v.z - a.z; const l = Math.hypot(ux, uz) || 1; ux /= l; uz /= l;
  if (F.bossFinal) { const s = F.side || -1; return [(a.x + v.x) / 2 + uz * s * 4.4 - ux * 0.5, (a.z + v.z) / 2 - ux * s * 4.4 - uz * 0.5]; }
  const C = fieldCut(F), s = F.fside; if (!s) return [a.x, a.z]; return [C.vx + C.uz * s * 3.4 - C.ux * 0.75, C.vz - C.ux * s * 3.4 - C.uz * 0.75]; }
BD.camRef = camRef;
// rig-local x/z for a world-space offset (the rig hangs off the root, which carries the facing)
function setRigXZ(c, ox, oz) { const th = c.root.rotation.y, cs = Math.cos(th), sn = Math.sin(th); c.rig.position.x = ox * cs - oz * sn; c.rig.position.z = ox * sn + oz * cs; }
const _en = new THREE.Vector3();
Fin.post = function () { const F = this.cur; if (!F) return; const w = Game.world; if (!w || !A.active) { this.cur = null; return; }
  const a = F.a, v = F.v, ac = F.ac, vc = F.vc, ph = F.ph, live = a.state === 'deathblowExec' || v.state === 'deathblowed';
  // the camera and the blood keep running through the collapse (until end + 0.5 s) once the blow was final
  this.clock(F, w);
  if (!live && (!F.final || !F.rip || F.real > ph.end || !vc.root.parent)) { this.cur = null; return; }
  const st = a.state === 'deathblowExec' ? a.stateT : DB_T, R = F.real, c = ph.drive, I = ph.impact;
  // until the hand-off game.js must not start its own death fall on the victim (deathT from sim 0.7 drops the stance lift and tips the rig)
  if (F.final && !F.handed) { vc.deathT = 0; vc.rig.rotation.set(0, F.db6 && vc._db6 ? vc._db6.yaw || 0 : 0, 0); vc.rig.position.y = F.uy || 0; }
  // step-in weight (attacker's visual root slides inside the guard, ease-out), blade-aim weight (locked in the seam until the pull-out)
  const x0 = ph.extract, wL = R < c ? eout(R / c) : R < x0 ? 1 : R < ph.unlock ? 1 - sm01((R - x0) / (ph.unlock - x0)) : 0;   // back on the core position by the unlock
  // DB6: the blade stays on its entry line through the pull-out (Extract -> Blade-clear), so it slides out the way it went in, then hands back to the clip
  const wB = R < c - 0.04 ? 0 : R < c ? (R - (c - 0.04)) / 0.04 : R < ph.extract ? 1 : F.db6 ? (R < ph.clear ? 1 : R < ph.clear + 0.1 ? 1 - (R - ph.clear) / 0.1 : 0) : R < ph.extract + 0.08 ? 1 - (R - ph.extract) / 0.08 : 0;
  const deep = R < I ? 0 : sm01(clamp((R - I) / Math.max(0.05, ph.settle - I), 0, 1)) * (1 - sm01(clamp((R - ph.extract) / 0.12, 0, 1)));   // drive: the hand closes on the wound
  const vx = vc.root.position.x, vz = vc.root.position.z; _u.set(vx - ac.root.position.x, 0, vz - ac.root.position.z); const dl = _u.length() || 1; _u.multiplyScalar(1 / dl);
  const px = _u.z, pz = -_u.x;   // toward the victim's right (the victim faces the attacker); the step-in solves forward reach AND lateral line-up of the sword hand
  if (wL > 0 && !F.db6) { const sx = ac.root.position.x, sz = ac.root.position.z;
    if (R < ph.extract) for (let it = 0; it < 2; it++) { ac.root.position.x = vx - _u.x * F.D + px * F.lat; ac.root.position.z = vz - _u.z * F.D + pz * F.lat; ac.root.updateMatrixWorld(true); vc.root.updateMatrixWorld(true);
      const b = bladeOf(ac).o; if (!b) break; b.getWorldPosition(_h); targetPoint(vc, F, _t);
      if (!F.L) { const tip = ac.tip; tip.getWorldPosition(_tip); F.L = clamp(_tip.distanceTo(_h), 0.6, 1.8); }
      const want = F.L * ((F.bossFinal ? 0.5 : 0.6) - 0.08 * deep), dy = _t.y - _h.y, hz = Math.sqrt(Math.max(0.04, want * want - dy * dy)), e = (_t.x - _h.x) * _u.x + (_t.z - _h.z) * _u.z;   // horizontal reach to the seam
      const el = (_t.x - _h.x) * px + (_t.z - _h.z) * pz;   // lateral offset hand -> seam (armpit: angle in from the victim's right)
      F.D = clamp(F.D - (e - hz), 0.55, 1.9); F.lat = clamp(F.lat + (el - F.latW), -0.7, 0.7); }
    ac.root.position.x = sx + (vx - _u.x * F.D + px * F.lat - sx) * wL; ac.root.position.z = sz + (vz - _u.z * F.D + pz * F.lat - sz) * wL; ac.root.updateMatrixWorld(true); }
  const tw = ph.settle + 0.12, roll = F.impReal >= 0 && wB >= 1 ? 0.4 * sm01(clamp((R - tw) / 0.1, 0, 1)) : 0;   // settle: the twist in the wound
  if (wB > 0) { const b = bladeOf(ac).o; b.getWorldPosition(_h); targetPoint(vc, F, _t);
    if (F.db6 && R >= ph.extract && F.dir) { _d.copy(F.dir); if (!F.dirX) { F.dirX = true; } } else _d.subVectors(_t, _h).normalize(); aimBlade(ac, _d, wB, roll); F.dir = F.dir || new THREE.Vector3(); F.dir.copy(_d);
    F.H = F.H || new THREE.Vector3(); F.H.copy(_h); F.T = F.T || new THREE.Vector3(); F.T.copy(_t); }
  if (!BD.hold && !F.plant && R >= 0.05) { F.plant = true; FX.puff(ac.root.position.x + _u.x * 0.3, ac.root.position.z + _u.z * 0.3, lowTier() ? 2 : 4); }   // commit: the lead foot plants
  if (!F.imp && (F.ev.impact || R >= I)) { F.imp = true; this.impact(F, false); }   // INT5: core bookmark events (the clock is the same, the event is authoritative)
  if (!F.rip && ((F.ev.extract && !F.db6) || R >= ph.extract)) { F.rip = true; this.impact(F, true); }
  // real-time beats: shudder after the hit-stop, the twist's scrape, the jerk off the blade, a second burst at the entry wound, drips while the body sags
  if (!BD.hold && F.impReal >= 0) {
    if (!F.shud && R >= I + 0.02) { F.shud = true; vc.impulse && vc.impulse({ lean: 2, headX: 2 }); }
    if (!F.twist && R >= tw && !F.rip) { F.twist = true; sfx('scrape', { vol: 0.4 }); vc.impulse && vc.impulse({ twist: 2.5, lean: 1, headX: -2 }); } }
  if (!BD.hold && F.ripReal >= 0 && F.dir && F.T) { const tr = R - F.ripReal, ink = Settings.hitStyle !== 'blood', col = ink ? [0.22, 0.02, 0.03] : [0.55, 0.02, 0.02];
    _en.copy(F.T).addScaledVector(F.dir, -0.14);
    if (!F.jerk && tr >= 0.03) { F.jerk = true; vc.impulse && vc.impulse({ twist: 4 * (F.jerkS || 1), headX: -3, lean: -2 }); }
    if (!F.burst2 && tr >= 0.06) { F.burst2 = true; if (VFX.streaks) VFX.streaks.burst(_en, lowTier() ? 4 : 8, 0.45, col, -F.dir.x, -F.dir.z); }
    if (tr < 0.4 && tr >= F.drip * 0.08) { F.drip++; FX.flecks(_en, lowTier() ? 1 : 2); } }
  // extract: the body is jerked off the blade and slides along E, reaching v0 at blade-clear, where the collapse takes it with that launch velocity
  // INT5: the core moves the victim itself along the launch dir (0 at extract -> launch speed at blade-clear), so no rig slide here (F.slide stays 0);
  // only the slight lift ramps in, so its velocity is continuous at blade-clear
  if (F.final && F.E && !F.handed && R < ph.clear) { const Te = ph.clear - ph.extract, u = clamp((R - ph.extract) / Te, 0, 1); F.slide = 0;
    F.uy = 0.5 * (ph.vy || 0) * Te * u * u; vc.rig.position.y = F.uy; }
  if (F.final && F.rip && !F.handed && ((F.ev.clear && !F.db6) || R >= ph.clear)) { F.handed = true; const e = Col.add(v, F); if (e) { e.ox = F.E ? F.E.x * F.slide : 0; e.oz = F.E ? F.E.z * F.slide : 0; e.uy = F.uy || 0; } }
  if (BD.onPost) BD.onPost(F, st); };
const _sp = new THREE.Vector3();
const SEAM_IMP = { gut: { lean: 5, hipY: -1.4, headX: 3 }, armpit: { rSx: -5, rSz: -3, twist: 2, headX: 2, lean: 1.5 }, neck: { headX: -6, lean: -2, hipY: -0.6 }, kneel: { headX: 5, lean: 2.5 } };
Fin.impact = function (F, rip) { const ink = Settings.hitStyle !== 'blood', col = ink ? [0.22, 0.02, 0.03] : [0.55, 0.02, 0.02], lo = lowTier();
  if (!F.dir) { targetPoint(F.vc, F, _t); _d.set(F.vc.root.position.x - F.ac.root.position.x, 0, F.vc.root.position.z - F.ac.root.position.z).normalize(); F.dir = _d.clone(); F.T = _t.clone(); F.H = _t.clone().addScaledVector(_d, -0.5); }
  const L = F.L || 1; _sp.copy(F.H).addScaledVector(F.dir, L * 0.9);   // where the point comes out of the back
  if (!rip) { F.impReal = F.real; sfx('impale', { vol: F.bossFinal ? 1 : 0.75 });
    _en.copy(F.T).addScaledVector(F.dir, -0.14); FX.spark(_en, 3, 0.4, [1, 0.9, 0.7]);   // steel kiss at the plate seam
    VFX.splash(_sp, true, 0); if (VFX.streaks) VFX.streaks.burst(_sp, (F.bossFinal ? 34 : 18) >> (lo ? 1 : 0), 0.7, col, F.dir.x, F.dir.z); FX.flecks(_sp, F.bossFinal ? 16 : 8);
    VFX.stain(_sp.x + F.dir.x * 0.5, _sp.z + F.dir.z * 0.5, F.bossFinal ? 1.6 : 1.1); FX.kick(F.bossFinal ? 0.08 : 0.05); Cam.kickFov(F.bossFinal ? -5 : -6);   /* steady camera: trauma 0.14 / 0.22 shook the held shot */ if (G.Post) G.Post.pulse('110,0,0', F.bossFinal ? 0.7 : 0.45); if (G.V7.PostFX) G.V7.PostFX.punch(F.bossFinal ? 0.035 : 0.02);
    F.vc.impulse && F.vc.impulse(SEAM_IMP[F.seam] || SEAM_IMP.gut); Pop.stab(F); }
  else { F.ripReal = F.real; sfx('rip', { vol: F.bossFinal ? 1 : 0.7 }); _sp.copy(F.T); VFX.splash(_sp, F.bossFinal, 0); if (VFX.streaks) VFX.streaks.burst(_sp, (F.bossFinal ? 20 : 10) >> (lo ? 1 : 0), 0.55, col, -F.dir.x, -F.dir.z);
    F.ac.impulse && F.ac.impulse({ wX: 6, rSx: 3, twist: -2 }); Pop.rip(F);
    if (F.final) { F.E = F.launch ? coreE(F) : fallDir(F.vc, F.a.x, F.a.z, {}, camRef(F)); F.jerkS = F.E.side; } } };
// INT5: E = the core launch dir (blueprint §7.3, deterministic); side = which side of the victim it leaves on (+1 = the victim's right)
function coreE(F) { const L = F.launch, th = F.vc.root.rotation.y, la = L.x * -Math.cos(th) + L.z * Math.sin(th); return { x: L.x, z: L.z, side: la < 0 ? -1 : 1 }; }

/* ---------------------------------------------------------------- Sekiro punctuation: white-red flash on the stab, shake on the pull-out. The game's own
   DEATHBLOW banner (HUD.flash on the deathblow event) is the text. Real-time clocks (frozen only by BD.hold for screenshots), no allocations. */
const Pop = BD.Pop = { fl: 0, flA: 0, sk: 0, skA: 0, skDur: 0.5, last: 0 };
Pop.stab = function (F) { const k = (VISUAL.flashFx === undefined ? 1 : VISUAL.flashFx); this.flA = (F.bossFinal ? 0.6 : 0.38) * k; this.fl = this.flA > 0 ? 0.3 : 0;
  if (NameCard.on) NameCard.hide(); };   // a boss name card still up (a fast finish) must not sit over the finisher
Pop.rip = function (F) { this.skA = F.bossFinal ? 0.035 : 0.018;   // steady: a tremor on the pull-out, not a shake (was 0.1 / 0.055)
  this.sk = this.skDur; };
Pop.tick = function () { const now = performance.now() / 1000, dt = this.last ? Math.min(0.1, now - this.last) : 0; this.last = now; if (BD.hold) return;
  if (this.fl > 0) { this.fl = Math.max(0, this.fl - dt); const u = this.fl / 0.3; flashEl.style.opacity = (this.flA * u * u).toFixed(3); }
  if (this.sk > 0) this.sk = Math.max(0, this.sk - dt);
  const H = P1.HUD; if (H && Game.state !== 'playing' && H.flashT > 0) { H.flashT -= dt; const fe = $('flash'); if (fe && H.flashT < 0.35) fe.style.opacity = Math.max(0, H.flashT / 0.35); } };   // banner fades during a finale too
Pop.clear = function () { this.fl = this.sk = 0; flashEl.style.opacity = 0; };
Pop.cam = function () { if (this.sk <= 0) return; const u = this.sk / this.skDur, a = this.skA * u * u, t = performance.now() / 1000;
  camera.position.x += (Math.sin(t * 47.3) * 0.6 + Math.sin(t * 83.1 + 1.1) * 0.4) * a; camera.position.y += (Math.sin(t * 53.9 + 0.5) * 0.6 + Math.sin(t * 91.7 + 2.3) * 0.4) * a * 0.8;
  camera.rotateZ((Math.sin(t * 37.7 + 0.9) * 0.6 + Math.sin(t * 71.3) * 0.4) * a * 0.25); };
// E prompt: shown ~0.2 s after the break (the stagger reads first), pops in with a short tone and pulses
{ const hu = P1.HUD.update; P1.HUD.update = function (dt, w) { const r = hu.apply(this, arguments); if (!A.active || !w) return r; const el = $('dbHint'); if (!el) return r;
    if (el.style.display === 'block' && BD.brkId !== undefined && w.time - BD.brkT < 0.2) { const c = w.deathblowCandidate(w.player); if (c && c.id === BD.brkId) el.style.display = 'none'; }
    const on = el.style.display === 'block'; if (on && !BD.dbOn) { if (el.animate) { el.classList.add('vhPop'); try { el.animate([{ transform: 'scale(1.35)' }, { transform: 'scale(1)' }], { duration: 120, easing: 'ease-out' }); } catch (e) {} } else el.classList.add('vhPop'); /* DB6 perf: was remove + offsetWidth + add (9-11 ms forced layout) */ try { audio.tone(1400, 0.12, 'sine', 0.05); } catch (e) {} BD.dbShownT = w.time; }
    BD.dbOn = on; return r; }; }

// boss finale camera: three hard-cut shots on the boss phase table (chunk H1): a wide push-in over the step-in, a low close profile at the impact that
// creeps in through the settle, a low wide at the rip that holds the slump. Never inside a wall; skipped while a dialogue scene owns the camera.
{ const fs = Finale.start, fc = Finale.camera, fw = Finale.weight;
  Finale.start = function (att, vic) { const r = fs.apply(this, arguments); if (A.active) { this.dur = PH_BOSS.endW; Letterbox.set(true, this.dur); } return r; };   // INT5: arena keeps the I1 glue (2.7 / 3.2 boss final)
  Finale.weight = function () { const F = Fin.cur || Fin.last; if (A.active && this.active && F && F.bossFinal && F.v === this.v) { if (A.Scenes && A.Scenes.active) return 0; const t = F.wall, u0 = F.ph.unlockW; return t < 0.25 ? eio(t / 0.25) : t > u0 ? 1 - sm01(Math.min(1, (t - u0) / F.ph.camOut)) : 1; } return fw.call(this); };   // blends out over camOut after the unlock while Wren can already move
  Finale.camera = function () { const F = Fin.cur || Fin.last; if (!A.active || !F || !F.bossFinal || F.v !== this.v) return fc.call(this); return BD.finCam(F, this.pos, this.lk); }; }
const clearCam = (lx, lz, x, z) => Region.camClear(lx, lz, x, z);
BD.finCam = function (F, pos, look) { const a = F.a, v = F.v, ph = F.ph || PH_BOSS, R = F.real; let ux = v.x - a.x, uz = v.z - a.z; const l = Math.hypot(ux, uz) || 1; ux /= l; uz /= l; const sx = uz, sz = -ux; const mx = (a.x + v.x) / 2, mz = (a.z + v.z) / 2;
  const shot = R < ph.drive ? 0 : R < ph.extract ? 1 : 2;
  if (shot !== F.shot || F.sideOK === null) { F.shot = shot; const tryS = s => { const c = shot === 0 ? [mx + sx * s * 3.8 - ux * 0.5, mz + sz * s * 3.8 - uz * 0.5] : shot === 1 ? [v.x - ux * 0.75 + sx * s * 3.5, v.z - uz * 0.75 + sz * s * 3.5] : [mx + sx * s * 4.4 - ux * 0.5, mz + sz * s * 4.4 - uz * 0.5]; return clearCam(mx, mz, c[0], c[1]); };
    F.side = tryS(F.side) ? F.side : tryS(-F.side) ? -F.side : F.side; F.sideOK = true; F.shotT = R; }
  const s = F.side, ox = F.E ? F.E.x * F.slide : 0, oz = F.E ? F.E.z * F.slide : 0;
  if (shot === 0) { const k = eio(clamp(R / ph.drive, 0, 1)), d = 3.8 - 1.0 * k; pos.set(mx + sx * s * d - ux * 0.5, 1.45 - 0.15 * k, mz + sz * s * d - uz * 0.5); look.set(mx + ux * 0.25, 1.15, mz + uz * 0.25); }
  else if (shot === 1) {   // low, close, in profile from Wren's sword side: the blade in under the breastplate, the point out of his back; creeps in through the settle
    const sc = (F.vc.look && F.vc.look.scale) || 1, k = sm01(clamp((R - ph.drive) / (ph.extract - ph.drive), 0, 1)), ly = F.T ? clamp(F.T.y - (Cam.gy || 0), 0.9, 1.8) : 1.25, d = (3.05 - 0.3 * k) * sc;   // polish: 2.35 cropped Odran's helm and both sets of feet
    pos.set(v.x - ux * 0.75 + sx * s * d, 1.12 + 0.06 * k, v.z - uz * 0.75 + sz * s * d); look.set(v.x - ux * 0.62, ly - 0.08, v.z - uz * 0.62); }
  else { const k = sm01(clamp((R - ph.extract) / 1.2, 0, 1)), d = 4.4 + 0.5 * k;   // low wide: the rip, the slump to his knees
    pos.set(mx + sx * s * d - ux * 0.5 + ox * 0.5, 0.5 + 0.22 * k, mz + sz * s * d - uz * 0.5 + oz * 0.5); look.set(v.x + ox, 1.0 - 0.22 * k, v.z + oz); }
  return true; };
// field finisher camera, every tier (chunk H1: Low too, it is only a few vector ops). Four beats on the field phase table, blended over the gameplay
// camera after Cam.update: commit = a 3/4 side cut blends in over the step-in; drive = a punch in at the impact (plus the FOV kick); settle = a slow
// creep toward the wound; extract = it pulls back and down after the body as it leaves the blade and falls; released back to the gameplay camera
// around the end (control back). Pop shake rides on top. Skipped while a dialogue scene owns the camera.
{ const cc = Cinema.camera; const _fp = new THREE.Vector3(), _fl = new THREE.Vector3(), _gl = new THREE.Vector3(), _fp2 = new THREE.Vector3(), _fl2 = new THREE.Vector3(), _hw = new THREE.Vector3(), _tt = new THREE.Vector3();
  Cinema.camera = function (alpha) { const r = cc.apply(this, arguments); const F = Fin.cur; if (!A.active || !F || F.bossFinal || !F.cut || Finale.active || (A.Scenes && A.Scenes.active)) return r;
    const ph = F.ph, t = F.real; let wgt;
    if (F.db6) { const ce = Math.min(ph.extract - 0.15, ph.unlock - 0.4); wgt = t < ce ? 1 : t < ph.unlock ? 1 - sm01((t - ce) / (ph.unlock - ce)) : 0; }   // DB6: the cut on E (an eased swing whipped ~4 m in 0.18 s), handed back by the unlock
    else { const r0 = ph.unlock, r1 = ph.unlock + ph.camOut; wgt = t < r0 ? 1 : t < r1 ? 1 - sm01((t - r0) / (r1 - r0)) : 0; }   // out over camOut after the unlock, Wren already free
    if (wgt <= 0) return r;
    fieldCut(F);
    if (!F.fside) return r; const C = F.cu, s = F.fside, sx = C.uz * s, sz = -C.ux * s, gy = Cam.gy || 0;
    // blueprint §9: a cut on E to the 3/4 side shot, push in through the commit (eased to rest at the drive), hold drive / settle (a slow creep;
    // the impact punch is the FOV kick, so the hit-stop never stops a moving camera), pull back from the extract, blend out after the unlock
    const kC = sm01(clamp(t / ph.drive, 0, 1)), kD = kC, kS = sm01(clamp((t - ph.settle) / (ph.extract - ph.settle), 0, 1));
    const dist = 3.8 - 0.4 * kC - 0.55 * kD - 0.3 * kS, back = 0.75 - 0.15 * kD - 0.1 * kS, y = 1.38 - 0.1 * kD - 0.06 * kS;
    _fp.set(C.vx + sx * dist - C.ux * back, gy + y, C.vz + sz * dist - C.uz * back);
    let TT = F.T || targetPoint(F.vc, F, _tt);
    if (F.db6) { if (!F.tl) F.tl = TT.clone(); else F.tl.lerp(TT, 1 - Math.exp(-14 * Math.max(0, F.wall - (F.tlw === undefined ? F.wall : F.tlw)))); F.tlw = F.wall; TT = F.tl; }   // DB6: the vital point rides the clip's Drive->Impact snap; the aim follows it softly
    _fl.copy(TT).lerp(_gl.set(C.vx - C.ux * 0.6, TT.y, C.vz - C.uz * 0.6), 0.5 - 0.25 * kS);   // the seam from the first frame (no look jump when the blade starts aiming)
    if (t > ph.extract) { const k = sm01(clamp((t - ph.extract) / (ph.unlock + 0.3 - ph.extract), 0, 1)), ox = F.E ? F.E.x * F.slide : 0, oz = F.E ? F.E.z * F.slide : 0; F.vc.hips.getWorldPosition(_hw);
      // polish: 3.3 m out, following 0.85 of the slide, eye 0.95 (3.9 / 0.6 / 0.85 left the falling body small over half a frame of empty floor)
      const ce = Col.find(F.vc); const bx = (F.v.x - C.vx) + (ce ? ce.ox : ox), bz = (F.v.z - C.vz) + (ce ? ce.oz : oz);   // INT5: the core moves the body root too
      _fp2.set(C.vx + sx * 3.3 - C.ux * 0.4 + bx * 0.85, gy + 0.95, C.vz + sz * 3.3 - C.uz * 0.4 + bz * 0.85); _fl2.set(_hw.x, Math.max(gy + 0.35, Math.min(_hw.y, gy + 0.35 + (_hw.y - gy - 0.35) * (1 - k))), _hw.z);
      _fp.lerp(_fp2, k); _fl.lerp(_fl2, Math.min(1, k * 1.6)); }
    const k = sm01(clamp(wgt, 0, 1)) * 0.94; camera.position.lerp(_fp, k); _gl.copy(Cam.lookAt).lerp(_fl, k); camera.lookAt(_gl); return r; }; }

/* ---------------------------------------------------------------- collapse (replaces chunk D's kneel + ash): clutch, buckle, slump, a side fall along E with a
   landing bounce, a spreading pool. Chunk H1: it takes the body at the extract end still moving (v0 along E, decaying), eases onto the floor pin
   (blend, then a soft spring, hard once landed), adds a short follow-through spring on the head and arms, and falls along E (yaw + side roll, the
   lie pose mirrored to the side it lands on). The body stays until the region rebuilds. Odran kneels through his dying words, then topples 0.4 s
   after them and stays. Presentation only (pose, rig rotation / offset / height). */
const Col = BD.Col = { list: [] };
const mirrorPose = p => Object.assign({}, p, { twist: -(p.twist || 0), side: -(p.side || 0), rSx: p.lSx, lSx: p.rSx, rSy: p.lSy, lSy: p.rSy, rSz: p.lSz, lSz: p.rSz, rE: p.lE, lE: p.rE, lLeg: p.rLeg, rLeg: p.lLeg, lKnee: p.rKnee, rKnee: p.lKnee });
const LIE_SIDE = 1;   // the side lieSide is authored for (+1 = lying on the victim's right)
PZ.lieSideM = mirrorPose(PZ.lieSide);
// INT5: buckle 0.38 -> 0.46, slump 0.58 -> 0.64: with the core unlock now 0.25 s after blade-clear the clutch->buckle hip drop (~6 g) read as a pop at the unlock
const COL_TR = [[0, '@'], [0.18, 'clutch'], [0.46, 'buckle'], [0.64, 'slumpFwd'], [0.95, 'lieSide']];
const COL_TR_M = [[0, '@'], [0.18, 'clutch'], [0.46, 'buckle'], [0.64, 'slumpFwd'], [0.95, 'lieSideM']];
const COL_TR_BOSS = [[0, '@'], [0.18, 'clutch'], [0.7, 'buckle'], [1.15, 'kneelDown']];
const COL_FALL = [[0, 'kneelDown'], [0.3, 'slumpFwd'], [0.75, 'lieSide']], COL_FALL_M = [[0, 'kneelDown'], [0.3, 'slumpFwd'], [0.75, 'lieSideM']];
BD.COL = { COL_TR, COL_TR_M, COL_TR_BOSS, COL_FALL, COL_FALL_M, PZ, mirrorPose };
const CP = BD.CP = { FALL_A: 1.49, fallT: 0.5, Df: 0.38, DfBoss: 0.6, slideK: 2.6, landK: 10, pinBlend: 0.35, pinRate: 16, pinSink: 0.08, pinHard: 0.3, secT: 0.6, secW: 13, secZ: 0.32 };
const SEC = ['headX', 'rSx', 'lSx', 'rE', 'lE'];
const _cv = new THREE.Vector3(), _OFF = new THREE.Vector3(), _bb = new THREE.Box3();
Col.find = function (c) { const L = this.list; for (let i = 0; i < L.length; i++) if (L[i].c === c) return L[i]; return null; };
Col.add = function (f, F) { if (!f || !A.active) return null; const c = Game.chars.get(f.id); if (!c) return null; let e = this.find(c); if (e) return e;
  const en = Ents.byF.get(f.id), boss = !!(en && en.def.boss);
  const E = F && F.E ? F.E : fallDir(c, F && F.a ? F.a.x : null, F && F.a ? F.a.z : null, {});
  const v0 = F && F.ph ? F.ph.v0 : 0, vy = F && F.ph ? F.ph.vy || 0 : 0;   // launch at blade-clear: v0 along E plus a slight lift
  // the stance's own foot-pin lift (game.js raises the hips so the lowest foot touches the floor) is switched off from here on (deathT > 0 in Col.post);
  // the rig takes it over at the same height so nothing drops (hips sit under the rig, and the rig is scaled)
  const s = c.look.scale || 1, lift0 = clamp((c.hips.position.y - 0.95 - c.pose.hipY) * s, 0, 0.4);
  e = { c, f, boss, t: 0, ent: Object.assign({}, c.pose), E, side: E.side, v: v0, v0, ox: 0, oz: 0, py: lift0, lift0, vy, vy0: vy, uy: 0, fresh: true, sp: null, sv: null, fallT: boss ? -1 : CP.fallT, spokeT: -1, landed: false, landT: 0, thud: false, pools: 0, done: false, ry: 0 };
  if (F && F.db6) { e.v = 0; e.d6 = true; }   // DB6: the sim launch (core + DB6 top-up) owns the body's travel: no second rig slide on top (the lift hop stays, its velocity is continuous at blade-clear)
  this.list.push(e); return e; };
Col.died = function (f) { if (!f || !A.active) return; const en = Ents.byF.get(f.id); if (en && en.def.boss) BD.corpse = { x: f.x, z: f.z, id: en.def.id }; this.add(f, null); };
Col.pose = function (c, T, dt) { if (!this.list.length) return false; const e = this.find(c); if (!e) return false; const f = e.f;
  if (!f.dead && f.state !== 'deathblowed') return false;
  const mir = e.side !== LIE_SIDE;
  if (e.boss && e.fallT >= 0) sample(T, mir ? COL_FALL_M : COL_FALL, e.t - e.fallT, POSES.ready, e.ent, KEYSH);
  else { sample(T, e.boss ? COL_TR_BOSS : mir ? COL_TR_M : COL_TR, e.t, POSES.ready, e.ent, KEYSH); if (e.boss) T.headX += 0.04 * Math.sin(e.t * 1.7); }
  // follow-through: head and arms lag the hand-off on an underdamped spring for the first 0.6 s, then hand back to the track
  if (e.t < CP.secT) { if (!e.sp) { e.sp = {}; e.sv = {}; for (const k of SEC) { e.sp[k] = e.ent[k] || 0; e.sv[k] = 0; } }
    const h = dt > 0 && !BD.hold ? Math.min(dt, 0.05) : 0, w0 = CP.secW, kk = w0 * w0, cz = 2 * CP.secZ * w0, n = Math.max(1, Math.ceil(h * w0 / 0.4)), hh = h / n, wb = sm01(e.t / CP.secT);
    for (const k of SEC) { for (let i = 0; i < n; i++) { e.sv[k] += (kk * (T[k] - e.sp[k]) - cz * e.sv[k]) * hh; e.sp[k] += e.sv[k] * hh; } T[k] = e.sp[k] + (T[k] - e.sp[k]) * wb; } }
  return true; };
function lowY(c, p, r) { p.getWorldPosition(_cv); return _cv.y - r; }
function footY(c, k) { _OFF.set(0, 0, 0); k.localToWorld(_cv.copy(_OFF)); return _cv.y; }
Col.ground = function (c) { const s = c.look.scale || 1; c.rig.position.y = 0; c.root.updateMatrixWorld(true);
  let m = Math.min(lowY(c, c.head, 0.12 * s), lowY(c, c.hips, 0.14 * s), lowY(c, c.lHand, 0.05 * s), lowY(c, c.rHand, 0.05 * s), lowY(c, c.lKnee, 0.06 * s), lowY(c, c.rKnee, 0.06 * s),
    lowY(c, c.lSh, 0.1 * s), lowY(c, c.rSh, 0.1 * s));
  if (c.lFoot) m = Math.min(m, footY(c, c.lFoot) - 0.04 * s, footY(c, c.rFoot) - 0.04 * s);
  // chunk H1: the procedural rig (no skinned model) rests on its actual parts: the lowest vertex of every visible piece (kettle-hat brims, thigh plates).
  // A box test first (exact for its 8 corners, conservative otherwise), vertices only for the pieces whose box reaches below the current minimum.
  if (!(c.hidden && c.hidden.length)) { if (!c._colM) { c._colM = []; c.rig.traverse(o => { if (!o.isMesh || !o.geometry.attributes.position) return; for (let q = o; q; q = q.parent) if (q === c.wrist) return; if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); c._colM.push(o); }); }
    for (const o of c._colM) { if (!o.visible) continue; _bb.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld); if (_bb.min.y >= m) continue;
      const E = o.matrixWorld.elements, P = o.geometry.attributes.position.array; for (let i = 0; i < P.length; i += 3) { const y = E[1] * P[i] + E[5] * P[i + 1] + E[9] * P[i + 2] + E[13]; if (y < m) m = y; } } }
  const gy = c.gy || 0; c.rig.position.y = gy - m; c.root.updateMatrixWorld(true); return c.rig.position.y; };
Col.reset = function (c) { if (!c || !c.rig) return; c.rig.position.set(0, 0, 0); c.rig.rotation.set(0, 0, 0); };
Col.post = function (dt) { const L = this.list; if (!L.length) return; const hold = BD.hold, h = hold ? 0 : dt;
  for (let i = L.length - 1; i >= 0; i--) { const e = L[i], c = e.c, f = e.f;
    if (!c.root.parent || (!f.dead && f.state !== 'deathblowed')) { this.reset(c); L.splice(i, 1); continue; }
    // slide: carried on from the extract, friction decays it (hard once landed)
    // INT5: the core moves the fighter itself (launch speed until the unlock, then its dead decay); the rig only adds what the core's motion along E
    // lacks, and the slide only starts to decay once the core lock is over, so the body never hangs and never doubles its speed
    if (e.v > 1e-3 && h > 0) { const wd = Game.world && Game.world.deathblow, held = !!wd && wd.v === f, vc = Math.max(0, (f.vx || 0) * e.E.x + (f.vz || 0) * e.E.z), ex = Math.max(0, e.v - vc);
      e.ox += e.E.x * ex * h; e.oz += e.E.z * ex * h; if (!held) e.v *= Math.exp(-(e.landed ? CP.landK : CP.slideK) * h); }
    setRigXZ(c, e.ox, e.oz);
    if (e.fresh) { e.fresh = false; c.deathT = Math.max(c.deathT, 1e-3); if (h > 0) { e.uy += e.vy * h; e.vy -= 9.8 * h; } c.rig.position.y = e.uy; c.root.updateMatrixWorld(true); c.hips.getWorldPosition(_cv); e.hy0 = _cv.y; continue; }   // the hand-off frame: this frame's hips still carry the stance lift
    // polish: the lift is measured, not estimated from hipY (exact whatever hipBob / breath add): the hips' world height on the hand-off frame
    // (stance lift on) minus their height now (lift off, rig at 0) is what the rig carries
    if (e.hy0 !== undefined) { c.rig.position.y = 0; c.root.updateMatrixWorld(true); c.hips.getWorldPosition(_cv); e.lift0 = e.py = e.d6 ? 0 : clamp(e.hy0 - _cv.y - e.uy, 0, 0.5); e.hy0 = undefined; }   // DB6: the clip sets the hips absolutely (no stance lift); the hand-off frame's hips are a frame of clip motion away, not a lift
    // INT5: the core keeps a final victim sliding after the unlock (launch speed, then its dead decay), so a key dropped / corpse marked at the moment of
    // death sits ~0.2 m off the body; once the body has come to rest, move them onto it (once per body)
    if (f.dead && !e.posSync && Math.hypot(f.vx || 0, f.vz || 0) < 1e-3) { e.posSync = true; const en = Ents.byF.get(f.id), C0 = BD.corpse;
      if (C0 && en && C0.id === en.def.id) { C0.x = f.x; C0.z = f.z; }
      const d = S(), it = en && en.def.drop; if (d && it && d.drops && d.drops[it] && d.drops[it].from === en.def.id) { d.drops[it].x = +f.x.toFixed(2); d.drops[it].z = +f.z.toFixed(2); try { const K = A.Keys, kk = K.list && K.list[it]; if (kk && kk.grp) kk.grp.position.set(d.drops[it].x, Region.groundY(d.drops[it].x, d.drops[it].z), d.drops[it].z); K.sync(); Save.write(); } catch (er) {} } }
    if (!hold && !e.done) e.t += dt;
    c.deathT = Math.max(c.deathT, 1e-3);   // no stance foot-pin lift and no generic death fall under the collapse (both were overridden late, which popped the body at sim 0.7)
    if (e.boss && e.fallT < 0) { if (S().flags.odran_spoke || !A.active) { if (e.spokeT < 0) e.spokeT = e.t; if (e.t - e.spokeT >= 0.4) { e.fallT = e.t; e.E = fallDir(c, null, null, {}); e.side = e.E.side; } } }   // he falls away from wherever the camera is then
    const x = c.root.position.x, z = c.root.position.z;
    if (!e.thud && e.t >= (e.boss ? 0.75 : 0.42)) { e.thud = true; try { if (audio.ok) audio.drum(audio.ctx.currentTime + 0.01, false, 0.35); } catch (er) {} FX.puff(x + e.ox, z + e.oz, lowTier() ? 2 : 4); }
    const Df = e.boss ? CP.DfBoss : CP.Df, tf = e.fallT < 0 ? -1 : e.t - e.fallT; let k = 0;
    const d6 = !!(c._db6 && (c._db6.corpse || (G.DB6.cur && G.DB6.cur.v === f)));
    if (tf >= 0 && !d6) { if (tf < Df) { const u = tf / Df; k = u * u; } else { const v = (tf - Df) / 0.16; k = v < 1 ? 1 + 0.045 * Math.sin(Math.PI * v) : 1;
      if (!e.landed) { e.landed = true; e.landT = e.t; sfx('slam', { vol: e.boss ? 0.8 : 0.45 }); c.hips.getWorldPosition(_cv); FX.puff(_cv.x, _cv.z, lowTier() ? 4 : 8); FX.kick(0.025); } } }
    // fall along E: a side roll toward E's side, yawed so the roll's direction is E (rig Euler XYZ: x 0, so R = Ry(psi) * Rz(side * A))
    if (d6) { k = 0; c.rig.rotation.set(0, c._db6.yaw || 0, 0);   // DB6: the clip lays the body down (no rig tip)
      const S6 = c._db6.corpse ? c._db6.corpse.S : G.DB6.cur, tau = c._db6.corpse ? c._db6.corpse.tau0 + c._db6.corpse.t : S6.tau;
      if (!e.landed && tau >= S6.land) { e.landed = true; e.landT = e.t; sfx('slam', { vol: e.boss ? 0.8 : 0.45 }); c.hips.getWorldPosition(_cv); FX.puff(_cv.x, _cv.z, lowTier() ? 4 : 8); FX.kick(0.02); } }
    else if (k > 0) { const th = c.root.rotation.y, cs = Math.cos(th), sn = Math.sin(th), lx = e.E.x * cs - e.E.z * sn, lz = e.E.x * sn + e.E.z * cs;
      const psi = e.side > 0 ? Math.atan2(lz, -lx) : Math.atan2(-lz, lx); e.psi = psi; c.rig.rotation.set(0, psi * Math.min(1, k), e.side * CP.FALL_A * k); }
    else c.rig.rotation.set(0, 0, 0);
    // floor pin: blend in over pinBlend, then a spring that may sink at most pinSink, hard once landed for pinHard
    const yT = e.done && e.restY !== undefined ? e.restY : this.ground(c); if (e.done) e.restY = yT;   // a body at rest keeps its pin (no per-frame probe for old corpses)
    if (!hold) { if (e.landed && e.t - e.landT >= CP.pinHard) e.py = yT;
      else if (e.t < CP.pinBlend) e.py = e.lift0 + (yT - e.lift0) * sm01(e.t / CP.pinBlend);
      else e.py += (yT - e.py) * (1 - Math.exp(-CP.pinRate * h));
      if (e.t >= CP.pinBlend && e.py < yT - CP.pinSink) e.py = yT - CP.pinSink; }   // polish: not during the blend (the exact-vertex target sits ~0.13 m above game.js's
      // analytic stance lift at the hand-off, so clamping the sink there threw the hips up 0.053 m in one frame; the blend takes it up smoothly instead)
    if (!hold && (e.vy > 0 || e.uy > 0)) { e.uy += e.vy * h; e.vy -= 9.8 * h; if (e.uy <= 0) { e.uy = 0; e.vy = 0; } }   // the launch's slight upward component (ballistic, a few cm)
    c.rig.position.y = e.py + e.uy; c.root.updateMatrixWorld(true); e.ry = e.py;
    if (e.landed && !hold) { const tl = e.t - e.landT;
      if (e.pools < 3 && tl >= [0, 0.37, 0.87][e.pools]) { c.hips.getWorldPosition(_cv); VFX.stain(_cv.x, _cv.z, [1.0, 1.4, 1.8][e.pools] * (e.boss ? 1.25 : 1)); const q = BD.lastStain;
        if (q && e.pools === 2) { q.life = 1e6; q.m.position.x = _cv.x; q.m.position.z = _cv.z; } e.pools++; }   // the last, widest pool stays under the body
      if (tl > 1.6 && e.pools >= 3) e.done = true; }
    if (c.feetAO && e.landed) c.feetAO.forEach(o => o.visible = false); } };
// VFX.stain hands back the stain it used so the corpse pool can outlive the splash stains (chunk H1: 15 s, was 9; every other call resets that slot's life)
{ const st0 = VFX.stain; VFX.stain = function () { st0.apply(this, arguments); const n = Math.min(this.stains.length, tier().inkStains || 0); BD.lastStain = null; if (!n) return null;
    const q = this.stains[(this.stainCursor - 1 + n * 64) % n]; q.life = 15; BD.lastStain = q; return q; }; }
// kneel by the headsman where he actually fell (the stock prompt sits at the Block's north side)
{ const si = A.scanInteract; A.scanInteract = function () { const r = si.apply(this, arguments); const c = BD.corpse, d = S();
    if (!A.inter && c && d && d.defeated.odran && !d.flags.odran_spoke && Game.state === 'playing') { const p = Game.world.player; if (Math.hypot(p.x - c.x, p.z - c.z) < 3.2 && !p.dead) A.inter = { label: 'Kneel by the headsman', act: () => A.dialogue('odran_dying', { name: 'Odran Vale', title: 'The Iron Warden' }), x: c.x, z: c.z }; }
    return A.inter; }; }

/* =====================================================================
   BUILD-UP on the Headsman's Stair: sound by height of the climb, a remembered voice, the fog threshold
   ===================================================================== */
const Up = BD.Up = { bellT: 2, crowT: 4, hbT: 0, whisper: false, inZone: false };
Up.post = function (dt) { const w = Game.world; if (!w || Game.state !== 'playing' || Cut.active) return; const p = w.player, d = S(); if (!d || d.defeated.odran || A.boss || p.dead) { this.inZone = false; return; }
  const z = p.z, near = Math.abs(p.x) < 30 && z > 12 && z < 38.5; this.inZone = near; if (!near) return;
  const k = clamp((z - 12) / (37.5 - 12), 0, 1);   // 0 at mid-field, 1 at the stair head
  this.hbT -= dt; if (this.hbT <= 0 && k > 0.25) { const bpm = 52 + 46 * k; this.hbT = 60 / bpm; sfx('heart', { vol: 0.12 + 0.4 * k }); }
  this.bellT -= dt; if (this.bellT <= 0) { this.bellT = 8.5 + Math.random() * 3; sfx('bell', { vol: 0.45 + 0.55 * k }); }
  this.crowT -= dt; if (this.crowT <= 0) { this.crowT = 5 + Math.random() * 7; sfx('crow', { vol: 0.5 + 0.4 * (1 - k) }); }
  if (!this.whisper && z > 31.4 && z < 34 && Math.abs(p.x) < 4.2) { this.whisper = true; const UI = A.UI;
    const line = d.flags.crane_freed ? '\u201cI\u2019ll be listening for the bell, Ward.\u201d \u2014 Ilsabet, low, from the shadow under the Stair.' : '\u201cHis headsman stayed. Odran always stays.\u201d \u2014 Tamsin\u2019s words come back to you, low.';
    if (UI && UI.hint) UI.hint(line, 6); } };
// fog threshold: visible (but open) until the boss is sealed in; sealed fog reads thicker
BD.fogPost = function (now) { const g = Region.gates.bossfog, d = S(); if (!g || !g.fogMat || !d) return;
  if (!d.defeated.odran && g.open) { g.parts[0].visible = true; g.fogMat.opacity = 0.14 + 0.05 * Math.sin(now * 1.7); }
  else if (!g.open) g.fogMat.opacity = Math.min(0.62, g.fogMat.opacity * 1.5 + 0.04 * Math.sin(now * 2.3)); };

/* ---------------------------------------------------------------- per-frame wiring */
{ const cu = Cam.update; Cam.update = function (dt) { const r = cu.apply(this, arguments); if (A.active) { try { Fin.post(); } catch (e) { console.error(e); Fin.cur = null; } try { Col.post(dt || 0); } catch (e) { console.error(e); } } return r; }; }
{ const ap = A.post; A.post = function (dt, now) { const r = ap.apply(this, arguments); if (!A.active) return r; try { Up.post(dt); BD.fogPost(now); } catch (e) { console.error(e); } return r; }; }
{ const cc2 = Cinema.camera; Cinema.camera = function () { const r = cc2.apply(this, arguments); if (A.active) { Pop.tick(); Pop.cam(); } return r; }; }
{ const un = Finale.update; Finale.update = function (dt) { if (BD.hold) return; return un.call(this, dt); }; }
console.log('[Veynhold] chunk D (headsman) ready');
})();
