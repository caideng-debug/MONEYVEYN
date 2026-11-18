/* =====================================================================
   VEYNHOLD — skinned character models (GLB) + retargeting onto the procedural pose rig.
   The tested pose/spring rig keeps driving every joint; the GLB skeleton copies those joint
   rotations (with a rest-pose correction), so combat timing and feel are unchanged.
   Depends only on THREE (+ GLTFLoader, SkeletonUtils). Pure presentation.
   ===================================================================== */
(function () {
'use strict';
const DATA = /*MODELS_DATA*/{};
const FILES = { player: 'wanderer', duelist: 'duelist', warden: 'warden', brother: 'brother', king: 'king' };
const templates = {}; let readyN = 0, failed = null, started = false;
/* chunk F: Quaternius CC0 characters (Modular Character Outfits - Fantasy + Universal Base Characters head), Medium / High only.
   They share the UE-mannequin skeleton (root, pelvis, spine_01..03, neck_01, Head, clavicle/upperarm/lowerarm/hand_l|r,
   thigh/calf/foot/ball_l|r + fingers). The same pose-rig drivers drive them through QMAP (the alias table of work/ual/retarget.py).
   Templates: qpeasant (Male_Peasant + head + the duelist blade), qpeasantF (Female_Peasant + head), qranger (hooded Male_Ranger + head + the brother's curved blade). */
const QDATA = /*QMODELS_DATA*/{};
/* chunk H3: the female templates take Q_HeadF (Superhero_Female head + brows + eyes, one hair node per look) instead of the male Q_Head.
   [outfit, blade source, head file, hair node, opts]; opts.tall = extra uniform scale over the hips match, opts.arm = forearm / hand bone length factor.
   qpeasantF = Ilsabet (buns), qpeasantFT = Tamsin (long hair), qwren = the player in world mode (long hair under a hood, longer arms). qwren's hips match the
   Wanderer GLB's (0.95 m, the rig's own hip height) instead of the duelist's, which puts her Head bone at ~1.60 m standing (Ilsabet 1.58,
   Tamsin 1.53), so tall stays 1 (measured in the H3 portraits: head height scales 1:1 with tall). */
const QBUILD = { qpeasant: ['Q_Peasant', 'duelist', 'Q_Head'], qpeasantF: ['Q_PeasantF', 'duelist', 'Q_HeadF', 'HairBuns'], qpeasantFT: ['Q_PeasantF', 'duelist', 'Q_HeadF', 'HairLong'],
  qwren: ['Q_PeasantF', 'player', 'Q_HeadF', 'HairLong', { tall: 1.0, arm: 1.05 }], qranger: ['Q_Ranger', 'brother', 'Q_Head'] };
const QMATNAME = { MI_Peasant: 'Cloth', MI_Ranger: 'Cloth', MI_Regular_Male: 'Skin', MI_Superhero_Male: 'Skin', MI_Superhero_Female: 'Skin', MI_Hair_1: 'Hair', MI_Hair_2: 'Hair', MI_Eyes: 'Shadow' };   // hit flash / tint / v7 rim read these names; 'Shadow' = the eyes (perilous glow)
/* chunk H3: per-look head fit. headScale scales the Head bone (head, hair, brows, eyes and any hood mounted on it); neckY (m, template space) lengthens (+) or
   shortens (-) neck_01 -> Head so the head neither floats above the collar nor sinks into it; neck = the neck_01 share of the torso -> head turn (QMAP default 0.45).
   Keys are template keys (Quaternius bodies) or look keys (the procedural GLBs, Mixamo 'Neck'). Tuned from the H3 close-ups (docs/chunk_H3.md). */
const HEADFIT = {
  qpeasant: { headScale: 1.0, neckY: 0.0, neck: 0.45 }, qranger: { headScale: 1.0, neckY: -0.005, neck: 0.45 },
  qpeasantF: { headScale: 0.97, neckY: 0.0, neck: 0.5 }, qpeasantFT: { headScale: 0.97, neckY: 0.0, neck: 0.5 }, qwren: { headScale: 0.98, neckY: 0.0, neck: 0.5 },
  player: { headScale: 1.0, neckY: 0.0, neck: 0.45 }, duelist: { headScale: 1.0, neckY: -0.01, neck: 0.45 }, warden: { headScale: 1.0, neckY: 0.0, neck: 0.4 }, brother: { headScale: 1.0, neckY: 0.0, neck: 0.45 }, king: { headScale: 1.0, neckY: 0.0, neck: 0.4 },
};
const headInfo = {};   // chunk H3: per template, how far the head meshes' own inverse binds sit from the outfit skeleton's bind (m; 0 = same bind pose)

function b64ToBuf(b64) { const bin = atob(b64), n = bin.length, u = new Uint8Array(n); for (let i = 0; i < n; i++) u[i] = bin.charCodeAt(i); return u.buffer; }
function load(onDone) {
  if (started) return; started = true;
  const keys = Object.keys(FILES).filter(k => DATA[FILES[k]]); if (!keys.length || !THREE.GLTFLoader) { failed = 'no model data'; if (onDone) onDone(false); return; }
  const loader = new THREE.GLTFLoader(); const qkeys = Object.keys(QDATA); let pending = keys.length + qkeys.length; const qraw = {};
  const done = () => { if (--pending > 0) return; try { buildQ(qraw); } catch (e) { console.warn('[Veynhold] Quaternius characters skipped', e); } if (onDone) onDone(readyN > 0); };
  keys.forEach(k => {
    try {
      loader.parse(b64ToBuf(DATA[FILES[k]]), '', g => { templates[k] = g; readyN++; done(); },
        e => { failed = (e && e.message) || 'parse error'; done(); });
    } catch (e) { failed = e.message; done(); }
  });
  qkeys.forEach(k => { try { loader.parse(b64ToBuf(QDATA[k]), '', g => { qraw[k] = g; done(); }, e => { console.warn('[Veynhold] ' + k, e); done(); }); } catch (e) { done(); } });
}
/* outfit + head on ONE skeleton (the head meshes are re-bound to the outfit's bones by name, keeping their own inverse binds, which also
   carry the mesh quantisation), materials renamed to the game's slots, scaled so the pelvis matches the GLB hips height, and the blade of
   the source look cloned onto hand_r (grip ~55% of the way to the middle knuckle). */
function buildQ(raw) {
  const _w = new THREE.Vector3(), _w2 = new THREE.Vector3(), _qq = new THREE.Quaternion(), _m = new THREE.Matrix4();
  for (const key in QBUILD) { const [file, src, headFile, hairName, qo] = QBUILD[key], O = raw[file], S = templates[src], HD = raw[headFile || 'Q_Head']; if (!O || !S || !HD) continue; const opt = qo || {};
    const outfit = THREE.SkeletonUtils.clone(O.scene);   // H3: several templates share one outfit file, so each works on its own copy
    let body = null; const bones = {}; outfit.traverse(o => { if (o.isBone) bones[o.name] = o; if (o.isSkinnedMesh && !body) body = o; }); if (!body || !bones.pelvis || !bones.hand_r) continue;
    const head = THREE.SkeletonUtils.clone(HD.scene); const hm = []; head.traverse(o => { if (o.isSkinnedMesh && !(/^Hair/.test(o.name) && o.name !== hairName) && !(o.parent && /^Hair/.test(o.parent.name) && o.parent.name !== hairName)) hm.push(o); });
    // H3: inverse-bind check. Each head mesh keeps its own inverse binds; where its bind pose differs from the outfit's (Q_Head on the female outfit) the head
    // rides on the outfit's bones offset by the difference: report it (Head bone, metres) so HEADFIT.neckY can take it up.
    outfit.updateMatrixWorld(true); let ibd = 0;
    for (const m of hm) { const sk = m.skeleton, nb = sk.bones.map(b => bones[b.name]); if (nb.some(b => !b)) continue;
      // Head in the pelvis frame, as the head file was bound (IB_pelvis * IB_head^-1; the quantisation folded into both inverse binds cancels) vs on this outfit
      const hi = sk.bones.findIndex(b => b.name === 'Head'), pi = sk.bones.findIndex(b => b.name === 'pelvis');
      if (hi >= 0 && pi >= 0) { _m.copy(sk.boneInverses[hi]).invert().premultiply(sk.boneInverses[pi]); _w.setFromMatrixPosition(_m);
        _m.copy(nb[pi].matrixWorld).invert().multiply(nb[hi].matrixWorld); _w2.setFromMatrixPosition(_m); ibd = Math.max(ibd, _w.distanceTo(_w2)); }
      m.bind(new THREE.Skeleton(nb, sk.boneInverses.map(x => x.clone())), m.bindMatrix.clone()); body.parent.add(m); }
    headInfo[key] = { head: headFile || 'Q_Head', hair: hairName || null, ibDelta: +ibd.toFixed(4), meshes: hm.length };
    outfit.traverse(o => { if (!o.isMesh) return; const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) { m.name = QMATNAME[m.name] || m.name; m.metalness = 0; m.roughness = m.name === 'Shadow' ? 0.35 : 0.88; if (!m.emissive) m.emissive = new THREE.Color(0); } });
    // H3: longer reach (qwren): forearm and hand sit a little further down the arm chain (skinning stretches the sleeve and forearm)
    if (opt.arm) for (const n of ['lowerarm_l', 'lowerarm_r', 'hand_l', 'hand_r']) if (bones[n]) bones[n].position.multiplyScalar(opt.arm);
    // height: pelvis world height -> the source GLB's Hips height (x opts.tall)
    outfit.updateMatrixWorld(true); let hy = 0.97; S.scene.updateMatrixWorld(true); S.scene.traverse(o => { if (o.isBone && o.name === 'Hips') hy = o.getWorldPosition(_w).y; });
    const k = hy / bones.pelvis.getWorldPosition(_w).y * (opt.tall || 1); const sg = new THREE.Group(); sg.name = 'QScale'; sg.scale.setScalar(k); sg.add(outfit); const top = new THREE.Group(); top.add(sg);
    // blade: clone of the source look's Blade, parented to hand_r at the grip (bone-local offset; Model sets its rotation every frame)
    let blade = null; S.scene.traverse(o => { if (!blade && o.name === 'Blade') blade = o; });
    if (blade) { const b = blade.clone(true), hr = bones.hand_r, mid = bones.middle_01_r; top.updateMatrixWorld(true); const off = mid ? mid.getWorldPosition(_w2).sub(hr.getWorldPosition(_w)).multiplyScalar(0.55) : _w2.set(-0.06, 0, 0);
      off.applyQuaternion(hr.getWorldQuaternion(_qq).invert()).divideScalar(k); b.position.copy(off); b.scale.setScalar(1 / k); hr.add(b); }
    templates[key] = { scene: top, q: true, qScale: k }; readyN++; }
}

/* driver joints (procedural rig groups) each bone follows; mix = [a, b, t] slerps two drivers */
const MAP = {
  Hips: 'hips', Spine: ['hips', 'torso', 0.5], Spine1: 'torso', Neck: ['torso', 'head', 0.45], Head: 'head',
  LeftShoulder: ['torso', 'lSh', 0.18], LeftArm: 'lSh', LeftForeArm: 'lEl', LeftHand: 'lHand',
  RightShoulder: ['torso', 'rSh', 0.18], RightArm: 'rSh', RightForeArm: 'rEl', RightHand: 'wrist',
  LeftUpLeg: 'lLeg', LeftLeg: 'lKnee', LeftFoot: ['lKnee', 'rig', 0.6], RightUpLeg: 'rLeg', RightLeg: 'rKnee', RightFoot: ['rKnee', 'rig', 0.6],
};
/* chunk F: UE-mannequin bone -> driver (the same targets MAP gives the Mixamo-named bones) and the Mixamo aliases other code looks up (byName) */
const QMAP = {
  pelvis: 'hips', spine_01: ['hips', 'torso', 0.35], spine_02: ['hips', 'torso', 0.7], spine_03: 'torso', neck_01: ['torso', 'head', 0.45], Head: 'head',
  clavicle_l: ['torso', 'lSh', 0.18], upperarm_l: 'lSh', lowerarm_l: 'lEl', hand_l: 'lHand', clavicle_r: ['torso', 'rSh', 0.18], upperarm_r: 'rSh', lowerarm_r: 'rEl', hand_r: 'wrist',
  thigh_l: 'lLeg', calf_l: 'lKnee', foot_l: ['lKnee', 'rig', 0.6], thigh_r: 'rLeg', calf_r: 'rKnee', foot_r: ['rKnee', 'rig', 0.6],
};
const QALIAS = { Hips: 'pelvis', Spine: 'spine_01', Spine1: 'spine_03', Neck: 'neck_01', LeftShoulder: 'clavicle_l', LeftArm: 'upperarm_l', LeftForeArm: 'lowerarm_l', LeftHand: 'hand_l',
  RightShoulder: 'clavicle_r', RightArm: 'upperarm_r', RightForeArm: 'lowerarm_r', RightHand: 'hand_r', LeftUpLeg: 'thigh_l', LeftLeg: 'calf_l', LeftFoot: 'foot_l', RightUpLeg: 'thigh_r', RightLeg: 'calf_r', RightFoot: 'foot_r' };
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3();

class Model {
  /* drv: { rig, hips, torso, head, lSh, lEl, lHand, rSh, rEl, rHand, wrist, lLeg, lKnee, rLeg, rKnee } — THREE.Groups of the pose rig.
     opts: { scale (rig scale), hideCape, hideScarf } */
  constructor(key, drv, opts) {
    const T = templates[key]; if (!T) throw new Error('model not loaded: ' + key);
    this.drv = drv; this.key = key; this.q = !!T.q; this.map = T.q ? QMAP : MAP;
    const fit = this.fit = Object.assign({ headScale: 1, neckY: 0, neck: 0.45 }, HEADFIT[key], opts.fit || {});   // chunk H3: per-look head fit
    if (fit.neck !== 0.45) { this.map = Object.assign({}, this.map); this.map[T.q ? 'neck_01' : 'Neck'] = ['torso', 'head', fit.neck]; }
    const root = THREE.SkeletonUtils.clone(T.scene); this.root = root; root.scale.setScalar(1 / (opts.scale || 1));
    this.bones = []; this.byName = {}; this.meshes = []; this.mats = []; this.matByName = {}; this.blade = null; this.cracks = null;
    const matClone = new Map();
    root.traverse(o => {
      if (o.isBone) { this.bones.push(o); this.byName[o.name] = o; }
      if (o.name === 'Blade') this.blade = o;
      if (o.name === 'PhaseII_Cracks') this.cracks = o;
      if (o.isMesh) {
        const m = o.material; let c = matClone.get(m); if (!c) { c = m.clone(); matClone.set(m, c); this.mats.push(c); c.userData.baseEmissive = c.emissive.clone(); (this.matByName[c.name] = this.matByName[c.name] || []).push(c); }
        o.material = c; o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false; this.meshes.push(o);
        if ((opts.hideCape && c.name === 'Cape') || (opts.hideScarf && c.name === 'ScarfTail')) o.visible = false;
      }
    });
    if (this.cracks) this.cracks.traverse(o => { if (o.isMesh) o.visible = false; });
    // hierarchical order (parents before children) for the per-frame solve
    this.order = []; const walk = b => { if (b.isBone) this.order.push(b); b.children.forEach(walk); }; walk(root);
    if (this.q) for (const a in QALIAS) if (this.byName[QALIAS[a]]) this.byName[a] = this.byName[QALIAS[a]];   // chunk F: Mixamo names for blade / feet AO / mounts
    { const hb = this.byName.Head; if (hb) { if (fit.headScale !== 1) hb.scale.multiplyScalar(fit.headScale);   // chunk H3: head size and neck length per look (bone space; Q bones sit under the QScale group)
      if (fit.neckY) { const l = hb.position.length(); if (l > 1e-6) hb.position.multiplyScalar(1 + fit.neckY / (T.qScale || 1) / l); } } }
    // ---- rest correction: the pose rig hangs arms straight down, the GLB binds in a T-pose
    root.updateMatrixWorld(true);
    const rz = (b, ang) => { const bn = this.byName[b]; if (!bn) return; _q.setFromAxisAngle(_v.set(0, 0, 1), ang);
      if (this.q) { const pq = new THREE.Quaternion(); for (let x = bn.parent; x && x.isBone; x = x.parent) pq.premultiply(x.quaternion); _q.premultiply(pq.clone().invert()).multiply(pq); }   // UE arms: the same model-space turn, expressed in the clavicle's frame
      bn.quaternion.premultiply(_q); };
    rz('LeftArm', -Math.PI / 2); rz('RightArm', Math.PI / 2);
    // K = bone rest rotation in model space (driver rest rotations are identity)
    this.K = new Map(); this.Qm = new Map(); this.restLocal = new Map(); this.parentBone = new Map();
    for (const b of this.order) {
      const p = b.parent && b.parent.isBone ? b.parent : null; this.parentBone.set(b, p);
      const qm = (p ? this.Qm.get(p).clone() : new THREE.Quaternion()).multiply(b.quaternion);
      this.Qm.set(b, qm); this.K.set(b, qm.clone()); this.restLocal.set(b, b.quaternion.clone());
    }
    this.hipsBone = this.byName.Hips; this.hipsRest = this.hipsBone ? this.hipsBone.position.clone() : null; this.hipsDrvRest = drv.hips.position.clone();
    this.hipsXq = null; if (this.q && this.hipsBone) { const p = this.parentBone.get(this.hipsBone); this.hipsXq = (p ? this.Qm.get(p).clone() : new THREE.Quaternion()).invert(); this.hipsXk = 1 / (T.qScale || 1); }   // rig delta -> pelvis parent (Z-up root) frame
    this.lFootBone = this.byName.LeftFoot; this.rFootBone = this.byName.RightFoot;
    this.scale = opts.scale || 1;
    // blade: keep the old rig's convention (blade along the wrist's -Y) so every pose still aims it the same way
    this.tip = new THREE.Object3D(); this.base = new THREE.Object3D();
    if (this.blade) {
      const hand = this.byName.RightHand; const kInv = this.K.get(hand).clone().invert();
      this.blade.quaternion.copy(kInv.multiply(_q.setFromAxisAngle(_v.set(1, 0, 0), Math.PI / 2)));
      let tip = null, maxZ = -1; this.blade.traverse(o => { if (o.isMesh && o.material.name === 'Blade') { const a = o.geometry.attributes.position; for (let i = 0; i < a.count; i++) if (a.getZ(i) > maxZ) { maxZ = a.getZ(i); tip = [a.getX(i), a.getY(i), a.getZ(i)]; } } });
      if (tip) this.tip.position.set(tip[0], tip[1], tip[2]); this.base.position.set(0, 0, 0.12); this.blade.add(this.tip); this.blade.add(this.base);
      this.bladeMats = []; this.blade.traverse(o => { if (o.isMesh && this.bladeMats.indexOf(o.material) < 0) this.bladeMats.push(o.material); });
    }
    this.D = {}; for (const k of ['rig', 'hips', 'torso', 'head', 'lSh', 'lEl', 'lHand', 'rSh', 'rEl', 'rHand', 'wrist', 'lLeg', 'lKnee', 'rLeg', 'rKnee', 'lFoot', 'rFoot']) this.D[k] = new THREE.Quaternion();
    // v8 clip layer: the anatomical hand can follow rHand (clip grip) while the blade keeps following the wrist; feet can take clip rotations
    this.handLocal = null; this.footW = 0; this._hq = new THREE.Quaternion(); this._fq = new THREE.Quaternion();
    this.bladeX90 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2); this.handBone = this.byName.RightHand;
    this.handKinv = this.handBone && this.K.get(this.handBone) ? this.K.get(this.handBone).clone().invert() : null;
    this.flash = 0; this.flashCol = new THREE.Color(1, 0.3, 0.2); this.eyes = 0; this.eyeFlash = 0; this.crackA = 0;
    drv.rig.add(root);
  }
  /* driver rotations relative to the rig (local quaternion chain; no matrix decomposition) */
  solveDrivers() {
    const d = this.drv, D = this.D;
    D.hips.copy(d.hips.quaternion);
    D.torso.copy(D.hips).multiply(d.torso.quaternion); D.head.copy(D.torso).multiply(d.head.quaternion);
    D.lSh.copy(D.torso).multiply(d.lSh.quaternion); D.lEl.copy(D.lSh).multiply(d.lEl.quaternion); D.lHand.copy(D.lEl).multiply(d.lHand.quaternion);
    D.rSh.copy(D.torso).multiply(d.rSh.quaternion); D.rEl.copy(D.rSh).multiply(d.rEl.quaternion); D.rHand.copy(D.rEl).multiply(d.rHand.quaternion); D.wrist.copy(D.rHand).multiply(d.wrist.quaternion);
    D.lLeg.copy(D.hips).multiply(d.lLeg.quaternion); D.lKnee.copy(D.lLeg).multiply(d.lKnee.quaternion);
    D.rLeg.copy(D.hips).multiply(d.rLeg.quaternion); D.rKnee.copy(D.rLeg).multiply(d.rKnee.quaternion);
    if (d.lFoot) { D.lFoot.copy(D.lKnee).multiply(d.lFoot.quaternion); D.rFoot.copy(D.rKnee).multiply(d.rFoot.quaternion); }
  }
  update() {
    this.solveDrivers(); const D = this.D;
    for (const b of this.order) {
      const p = this.parentBone.get(b), qm = this.Qm.get(b), m = this.map[b.name];
      if (m) {
        if (b === this.handBone && this.handLocal) qm.copy(D.rHand).multiply(this.handLocal);                 // v8: clip grip
        else if (typeof m === 'string') qm.copy(D[m]); else qm.copy(D[m[0]]).slerp(D[m[1]], m[2]);
        if (this.footW > 0 && this.drv.lFoot && (b === this.lFootBone || b === this.rFootBone)) qm.slerp(b === this.lFootBone ? D.lFoot : D.rFoot, this.footW);
        qm.multiply(this.K.get(b));
        if (p) b.quaternion.copy(_q2.copy(this.Qm.get(p)).invert().multiply(qm)); else b.quaternion.copy(qm);
      } else { qm.copy(p ? this.Qm.get(p) : _q.identity()).multiply(this.restLocal.get(b)); b.quaternion.copy(this.restLocal.get(b)); }
    }
    // v8: blade stays on the wrist convention even when the hand bone follows the clip grip
    if (this.blade && this.handKinv) { if (this.handLocal) this.blade.quaternion.copy(this.handKinv).multiply(this._hq.copy(this.handLocal).invert()).multiply(this.drv.wrist.quaternion).multiply(this.bladeX90);
      else this.blade.quaternion.copy(this.handKinv).multiply(this.bladeX90); }
    // hips translation follows the rig's hip drop / bob / shudder (rig units -> metres)
    if (this.hipsXq) { _v.copy(this.drv.hips.position).sub(this.hipsDrvRest).applyQuaternion(this.hipsXq); this.hipsBone.position.copy(this.hipsRest).addScaledVector(_v, this.scale * this.hipsXk); }
    else if (this.hipsBone) this.hipsBone.position.copy(this.hipsRest).addScaledVector(_v.copy(this.drv.hips.position).sub(this.hipsDrvRest), this.scale);
  }
  /* emissive effects: hit flash (decays), eye glow (perilous), Phase II cracks */
  effects(dt, now, o) {
    this.flash = Math.max(0, this.flash - dt * 6.5); const fl = this.flash * o.flashScale; this.eyeFlash = Math.max(0, this.eyeFlash - dt * 4);
    for (const m of this.mats) {
      if (m.name === 'Blade' || m.name === 'Edge' || m.name === 'PhaseII_Cracks') continue;
      const be = m.userData.baseEmissive; let r = be.r + this.flashCol.r * fl * 0.55, g = be.g + this.flashCol.g * fl * 0.55, bl = be.b + this.flashCol.b * fl * 0.55;
      if (m.name === 'Shadow') { const e = this.eyes, x = this.eyeFlash; r += 0.9 * e + 0.8 * x; g += 0.05 * e + 0.55 * x; bl += 0.02 * e + 0.4 * x; }
      m.emissive.setRGB(r, g, bl);
    }
    if (this.cracks) {
      const want = o.phase2 ? 1 : 0; this.crackA += (want - this.crackA) * Math.min(1, dt * (want ? 1.2 : 4));
      const vis = this.crackA > 0.02; this.cracks.traverse(c => { if (c.isMesh) c.visible = vis; });
      if (vis) for (const m of (this.matByName.PhaseII_Cracks || [])) { const p = 0.65 + 0.35 * Math.sin(now * 5.2) * Math.sin(now * 1.7 + 1); m.emissive.setRGB(1.0 * this.crackA * p * 1.4, 0.12 * this.crackA * p, 0.05 * this.crackA * p); }
    }
    for (const m of (this.matByName.Edge || [])) { const k = o.phase2 ? 1.6 + 0.4 * Math.sin(now * 6) : 0.9; m.emissive.setRGB(0.9 * k, 0.06 * k, 0.04 * k); }
  }
  hit(color, k) { this.flashCol.setHex(color); this.flash = Math.max(this.flash, k); }
  dispose() { if (this.root.parent) this.root.parent.remove(this.root); this.mats.forEach(m => m.dispose()); }
}

window.VEYN_MODELS = { load, Model, FILES, templates, MAP, QMAP, HEADFIT, headInfo, pick: null, status: () => ({ ready: readyN, total: Object.keys(FILES).filter(k => DATA[FILES[k]]).length + Object.keys(QBUILD).filter(k => QDATA[QBUILD[k][0]] && QDATA[QBUILD[k][2]]).length, failed }), has: k => !!templates[k] };
})();
