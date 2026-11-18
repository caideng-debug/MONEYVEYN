// Veynhold chunk H3: female head packer (gltf-transform 4 + meshoptimizer + sharp; run from a dir that has them in node_modules).
// node pack_H3.mjs <stage dir> <out assets dir>
// Source: Quaternius "Universal Base Characters [Standard]" (CC0): Superhero_Female_FullBody (Godot - UE) + Hair_Buns / Hair_Long ("Rigged to Head Bone"),
// with T_Superhero_Female_Light_BaseColor, T_Hair_2_BaseColor, T_Eye_Brown. The stage .gltf copies have their normal / roughness texture refs removed
// (only base colour ships) and the Dark base colour swapped for the Light one.
// Output Q_HeadF.glb, one skin (the full body's 65 joints) and three nodes:
//   HeadF    = head + neck (triangles weighted > 50% to Head / neck_01, as headcut.mjs did for Q_Head) + eyes + the body's own female brows
//   HairBuns = Hair_Buns, HairLong = Hair_Long (models.js shows one per look)
import fs from 'fs'; import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core'; import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, weld, simplify, quantize, mergeDocuments, unpartition, compactPrimitive, joinPrimitives } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
const [SRC, OUT] = process.argv.slice(2); const io = new NodeIO().registerExtensions(ALL_EXTENSIONS); await MeshoptSimplifier.ready;
const KEEP_ATTR = new Set(['POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0']);
function strip(doc) { const r = doc.getRoot(); for (const a of r.listAnimations()) a.dispose();
  for (const m of r.listMaterials()) { m.setNormalTexture(null); m.setMetallicRoughnessTexture(null); m.setOcclusionTexture(null); m.setMetallicFactor(0); m.setRoughnessFactor(0.9); }
  for (const me of r.listMeshes()) for (const p of me.listPrimitives()) for (const s of p.listSemantics()) if (!KEEP_ATTR.has(s)) p.setAttribute(s, null); }   // UE mask colours / extra UV sets
const tris = d => { let t = 0; for (const m of d.getRoot().listMeshes()) for (const p of m.listPrimitives()) t += p.getIndices().getCount() / 3; return Math.round(t); };
function headcut(node) { const joints = node.getSkin().listJoints().map(j => j.getName()); const keepJ = new Set(['Head', 'neck_01'].map(x => joints.indexOf(x)));
  for (const p of node.getMesh().listPrimitives()) { const J = p.getAttribute('JOINTS_0'), W = p.getAttribute('WEIGHTS_0'), I = p.getIndices(), a = I.getArray(), out = [];
    const ok = v => { const j = J.getElement(v, []), w = W.getElement(v, []); let s = 0; for (let k = 0; k < 4; k++) if (keepJ.has(j[k])) s += w[k]; return s > 0.5; };
    for (let t = 0; t < a.length; t += 3) if (ok(a[t]) && ok(a[t + 1]) && ok(a[t + 2])) out.push(a[t], a[t + 1], a[t + 2]);
    I.setArray(new Uint32Array(out)); console.log('headcut kept', out.length / 3, 'tris'); } }
async function simp(doc, ratio, err) { await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio, error: err, lockBorder: false }), prune()); }

// 1) head + eyes + brows: one mesh, one node
const body = await io.read(SRC + '/Superhero_Female_FullBody_s.gltf'); strip(body);
{ const r = body.getRoot(), nodes = r.listNodes().filter(n => n.getMesh()); const sk = nodes.find(n => n.getName() === 'Superhero_Female'); headcut(sk);
  await body.transform(prune()); for (const m of r.listMeshes()) for (const p of m.listPrimitives()) compactPrimitive(p);
  await simp(body, 0.42, 0.01); }
// 2) hair
const hair = {}; for (const [k, f, ratio] of [['HairBuns', 'Hair_Buns', 0.3], ['HairLong', 'Hair_Long', 0.32]]) { const d = await io.read(SRC + '/' + f + '_s.gltf'); strip(d); await simp(d, ratio, 0.02); hair[k] = d; }
// merge, then put every skinned node on the body's skin (same 65 joints in the same order, same bind pose) and drop the duplicate skeletons
const r = body.getRoot(); const skin = r.listSkins()[0]; const J = skin.listJoints().map(j => j.getName());
for (const k in hair) { const before = new Set(r.listNodes()); mergeDocuments(body, hair[k]);
  const added = r.listNodes().filter(n => !before.has(n)); const hn = added.find(n => n.getMesh()); const hs = hn.getSkin();
  if (hs.listJoints().map(j => j.getName()).join() !== J.join()) throw new Error(k + ': joint order differs');
  const a = hs.getInverseBindMatrices().getArray(), b = skin.getInverseBindMatrices().getArray(); let md = 0; for (let i = 0; i < a.length; i++) md = Math.max(md, Math.abs(a[i] - b[i])); console.log(k, 'IBM max diff', md.toExponential(2));
  hn.setSkin(skin); hn.setName(k); for (const n of added) if (n !== hn) n.dispose(); hs.dispose();
  const sc = r.listScenes(); sc[0].addChild(hn); for (let i = 1; i < sc.length; i++) sc[i].dispose(); }
// one node for head / eyes / brows (names the runtime reads)
{ const nodes = r.listNodes().filter(n => n.getMesh() && !/^Hair/.test(n.getName())); const keep = nodes.find(n => n.getName() === 'Superhero_Female'), km = keep.getMesh(); keep.setName('HeadF');
  for (const n of nodes) if (n !== keep) { for (const p of n.getMesh().listPrimitives()) km.addPrimitive(p); const m = n.getMesh(); n.dispose(); m.dispose(); } }
await body.transform(dedup(), prune());
for (const m of r.listMeshes()) for (const p of m.listPrimitives()) compactPrimitive(p);
for (const t of r.listTextures()) { const n = t.getName(), s = /Eye/.test(n) ? 64 : 256; const img = t.getImage();
  t.setImage(await sharp(img).resize(s, s).jpeg({ quality: 78 }).toBuffer()).setMimeType('image/jpeg').setURI(''); }
for (const m of r.listMaterials()) m.setName(m.getName());   // MI_Superhero_Female, MI_Hair_2, MI_Eyes (models.js QMATNAME maps them)
await body.transform(dedup(), prune(), quantize({ quantizePosition: 14, quantizeNormal: 8, quantizeTexcoord: 12, quantizeWeight: 8, quantizationVolume: 'scene' }), unpartition());
const out = OUT + '/chars/Q_HeadF.glb'; await io.write(out, body); console.log('Q_HeadF.glb', tris(body), 'tris', fs.statSync(out).size, 'B');
for (const n of r.listNodes()) if (n.getMesh()) console.log('  ', n.getName(), n.getMesh().listPrimitives().map(p => p.getMaterial().getName() + ':' + p.getIndices().getCount() / 3).join(' '));
