// Veynhold chunk F asset packer (gltf-transform 4.5 + meshoptimizer + sharp; run from a dir that has them in node_modules).
// node pack_F.mjs <assets_incoming> <out assets dir>
// Characters: drop COLOR_0 (UE mask data, not colour), animations, normal/ORM maps; simplify; compact; quantize (KHR_mesh_quantization).
// Props: one GLB with cart (canopy removed), barrel, crate, cage, chain; shared trim textures stored once.
import fs from 'fs'; import sharp from 'sharp';
import { NodeIO, Document } from '@gltf-transform/core'; import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, weld, simplify, quantize, join, mergeDocuments, unpartition, compactPrimitive, joinPrimitives } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
const [SRC, OUT] = process.argv.slice(2); const io = new NodeIO().registerExtensions(ALL_EXTENSIONS); await MeshoptSimplifier.ready;
async function texShrink(doc, size, q) { for (const t of doc.getRoot().listTextures()) { const img = t.getImage(); const meta = await sharp(img).metadata(); const s = Math.min(size, meta.width);
  t.setImage(await sharp(img).resize(s, s).jpeg({ quality: q }).toBuffer()).setMimeType('image/jpeg'); } }
function strip(doc, dropMat) { const r = doc.getRoot(); for (const a of r.listAnimations()) a.dispose();
  for (const m of r.listMaterials()) { m.setNormalTexture(null); m.setMetallicRoughnessTexture(null); m.setOcclusionTexture(null); m.setMetallicFactor(0); m.setRoughnessFactor(0.9); }
  for (const me of r.listMeshes()) for (const p of me.listPrimitives()) { const c = p.getAttribute('COLOR_0'); if (c) { p.setAttribute('COLOR_0', null); }
    if (dropMat && dropMat.test(p.getMaterial().getName())) { me.removePrimitive(p); p.dispose(); } } }
const tris = d => { let t = 0; for (const m of d.getRoot().listMeshes()) for (const p of m.listPrimitives()) t += p.getIndices().getCount() / 3; return Math.round(t); };
// all skinned parts share one skin: move every primitive into the first mesh node, so join() can merge same-material parts and quantize() keeps ONE skin
function oneMesh(doc, dropNode) { const nodes = doc.getRoot().listNodes().filter(n => n.getMesh()); const keep = nodes[0], km = keep.getMesh(); keep.setName('Body');
  for (const n of nodes.slice(1)) { const m = n.getMesh(); if (!(dropNode && dropNode.test(n.getName()))) for (const p of m.listPrimitives()) km.addPrimitive(p); n.dispose(); m.dispose(); }
  const by = new Map(); for (const p of km.listPrimitives()) { const k = p.getMaterial(); if (!by.has(k)) by.set(k, []); by.get(k).push(p); }   // join() skips skinned nodes: join same-material parts by hand
  for (const [, ps] of by) { if (ps.length < 2) continue; const j = joinPrimitives(ps); for (const p of ps) { km.removePrimitive(p); p.dispose(); } km.addPrimitive(j); } }
async function finish(doc, out, ratio, texSize, texQ, err) {
  await doc.transform(prune(), weld(), ...(ratio < 1 ? [simplify({ simplifier: MeshoptSimplifier, ratio, error: err || 0.012, lockBorder: false })] : []), prune());
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) compactPrimitive(p);
  await texShrink(doc, texSize, texQ);
  await doc.transform(dedup(), prune(), quantize({ quantizePosition: 14, quantizeNormal: 8, quantizeTexcoord: 12, quantizeWeight: 8 }), unpartition());
  await io.write(out, doc); console.log(out.split('/').pop(), tris(doc), 'tris', fs.statSync(out).size, 'B');
}
// characters
{ const d = await io.read(SRC + '/quaternius_outfits/lod30/Male_Peasant_LOD30.glb'); strip(d); oneMesh(d); await finish(d, OUT + '/chars/Q_Peasant.glb', 0.72, 512, 72); }
{ const d = await io.read(SRC + '/quaternius_outfits/lod30/Female_Peasant_LOD30.glb'); strip(d); oneMesh(d); await finish(d, OUT + '/chars/Q_PeasantF.glb', 0.72, 512, 72); }
{ const d = await io.read(SRC + '/quaternius_outfits/lod30/Male_Ranger_LOD30.glb'); strip(d); oneMesh(d, /Belt_2/); await finish(d, OUT + '/chars/Q_Ranger.glb', 0.5, 512, 72, 0.03); }
{ const d = await io.read(SRC + '/quaternius_basechar/Superhero_Male_HeadOnly.glb'); strip(d); oneMesh(d); await finish(d, OUT + '/chars/Q_Head.glb', 0.4, 256, 75); }
// props: merged into one document, one node per prop (named), trim textures deduplicated
{ const names = ['Stall_Cart_Empty', 'Barrel', 'Crate_Wooden', 'Cage_Small', 'Chain_Coil']; const ratio = { Stall_Cart_Empty: 0.5, Barrel: 0.7, Crate_Wooden: 0.6, Cage_Small: 0.35, Chain_Coil: 0.3 };
  const base = new Document(); base.createScene('props'); 
  for (const n of names) { const d = await io.read(SRC + '/quaternius_props/' + n + '.glb'); strip(d, n === 'Stall_Cart_Empty' ? /MI_Banner/ : null);
    await d.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: ratio[n], error: 0.02, lockBorder: false }), prune());
    for (const nd of d.getRoot().listNodes()) if (nd.getMesh()) nd.setName(n);
    mergeDocuments(base, d); }
  const sc = base.getRoot().listScenes(); for (let i = 1; i < sc.length; i++) { for (const c of sc[i].listChildren()) sc[0].addChild(c); sc[i].dispose(); }
  await base.transform(dedup(), prune());
  for (const m of base.getRoot().listMeshes()) for (const p of m.listPrimitives()) compactPrimitive(p);
  await texShrink(base, 256, 80); await base.transform(dedup({ propertyTypes: ['Texture', 'Material', 'Accessor'] }), prune(), quantize({ quantizePosition: 14, quantizeNormal: 8, quantizeTexcoord: 12 }), unpartition());   // quantized; the world converts to float before merging into chunk geometry
  await io.write(OUT + '/props/Q_Props.glb', base); console.log('Q_Props.glb', tris(base), 'tris', fs.statSync(OUT + '/props/Q_Props.glb').size, 'B', base.getRoot().listTextures().map(t => t.getName()), base.getRoot().listMaterials().map(m => m.getName()));
  for (const nd of base.getRoot().listNodes()) if (nd.getMesh()) console.log('  ', nd.getName(), nd.getMesh().listPrimitives().map(p => p.getMaterial().getName() + ':' + p.getIndices().getCount() / 3).join(' '));
}
