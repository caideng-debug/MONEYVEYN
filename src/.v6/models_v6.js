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

function b64ToBuf(b64) { const bin = atob(b64), n = bin.length, u = new Uint8Array(n); for (let i = 0; i < n; i++) u[i] = bin.charCodeAt(i); return u.buffer; }
function load(onDone) {
  if (started) return; started = true;
  const keys = Object.keys(FILES).filter(k => DATA[FILES[k]]); if (!keys.length || !THREE.GLTFLoader) { failed = 'no model data'; if (onDone) onDone(false); return; }
  const loader = new THREE.GLTFLoader(); let pending = keys.length;
  keys.forEach(k => {
    try {
      loader.parse(b64ToBuf(DATA[FILES[k]]), '', g => { templates[k] = g; readyN++; if (--pending === 0 && onDone) onDone(true); },
        e => { failed = (e && e.message) || 'parse error'; if (--pending === 0 && onDone) onDone(readyN > 0); });
    } catch (e) { failed = e.message; if (--pending === 0 && onDone) onDone(readyN > 0); }
  });
}

/* driver joints (procedural rig groups) each bone follows; mix = [a, b, t] slerps two drivers */
const MAP = {
  Hips: 'hips', Spine: ['hips', 'torso', 0.5], Spine1: 'torso', Neck: ['torso', 'head', 0.45], Head: 'head',
  LeftShoulder: ['torso', 'lSh', 0.18], LeftArm: 'lSh', LeftForeArm: 'lEl', LeftHand: 'lHand',
  RightShoulder: ['torso', 'rSh', 0.18], RightArm: 'rSh', RightForeArm: 'rEl', RightHand: 'wrist',
  LeftUpLeg: 'lLeg', LeftLeg: 'lKnee', LeftFoot: ['lKnee', 'rig', 0.6], RightUpLeg: 'rLeg', RightLeg: 'rKnee', RightFoot: ['rKnee', 'rig', 0.6],
};
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3();

class Model {
  /* drv: { rig, hips, torso, head, lSh, lEl, lHand, rSh, rEl, rHand, wrist, lLeg, lKnee, rLeg, rKnee } — THREE.Groups of the pose rig.
     opts: { scale (rig scale), hideCape, hideScarf } */
  constructor(key, drv, opts) {
    const T = templates[key]; if (!T) throw new Error('model not loaded: ' + key);
    this.drv = drv; this.key = key;
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
    // ---- rest correction: the pose rig hangs arms straight down, the GLB binds in a T-pose
    root.updateMatrixWorld(true);
    const rz = (b, ang) => { const bn = this.byName[b]; if (bn) bn.quaternion.premultiply(_q.setFromAxisAngle(_v.set(0, 0, 1), ang)); };
    rz('LeftArm', -Math.PI / 2); rz('RightArm', Math.PI / 2);
    // K = bone rest rotation in model space (driver rest rotations are identity)
    this.K = new Map(); this.Qm = new Map(); this.restLocal = new Map(); this.parentBone = new Map();
    for (const b of this.order) {
      const p = b.parent && b.parent.isBone ? b.parent : null; this.parentBone.set(b, p);
      const qm = (p ? this.Qm.get(p).clone() : new THREE.Quaternion()).multiply(b.quaternion);
      this.Qm.set(b, qm); this.K.set(b, qm.clone()); this.restLocal.set(b, b.quaternion.clone());
    }
    this.hipsBone = this.byName.Hips; this.hipsRest = this.hipsBone ? this.hipsBone.position.clone() : null; this.hipsDrvRest = drv.hips.position.clone();
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
    this.D = {}; for (const k of ['rig', 'hips', 'torso', 'head', 'lSh', 'lEl', 'lHand', 'rSh', 'rEl', 'rHand', 'wrist', 'lLeg', 'lKnee', 'rLeg', 'rKnee']) this.D[k] = new THREE.Quaternion();
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
  }
  update() {
    this.solveDrivers(); const D = this.D;
    for (const b of this.order) {
      const p = this.parentBone.get(b), qm = this.Qm.get(b), m = MAP[b.name];
      if (m) {
        if (typeof m === 'string') qm.copy(D[m]); else qm.copy(D[m[0]]).slerp(D[m[1]], m[2]);
        qm.multiply(this.K.get(b));
        if (p) b.quaternion.copy(_q2.copy(this.Qm.get(p)).invert().multiply(qm)); else b.quaternion.copy(qm);
      } else { qm.copy(p ? this.Qm.get(p) : _q.identity()).multiply(this.restLocal.get(b)); b.quaternion.copy(this.restLocal.get(b)); }
    }
    // hips translation follows the rig's hip drop / bob / shudder (rig units -> metres)
    if (this.hipsBone) this.hipsBone.position.copy(this.hipsRest).addScaledVector(_v.copy(this.drv.hips.position).sub(this.hipsDrvRest), this.scale);
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

window.VEYN_MODELS = { load, Model, FILES, templates, MAP, status: () => ({ ready: readyN, total: Object.keys(FILES).filter(k => DATA[FILES[k]]).length, failed }), has: k => !!templates[k] };
})();
