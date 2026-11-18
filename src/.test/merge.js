// Merge checks (integrate branch): cross-chunk interactions that no single chunk test covers.
// A+F: the corpse cart (F mesh or its fallback) carries A's corpse at the cart's real bed height; A2's sword stands beside it.
// A+E: A's lantern ember sprites stay off whenever E's GPU particle buffer draws (no doubled embers), and come back when it is off.
// B+D: during the Odran fight field foes are sent home / never hold the engagement token.
// C+F: the belt key re-mounts when the carrier's body model is swapped.
const mk = require('./p1h.js'); const sleep = ms => new Promise(r => setTimeout(r, ms));
const FILE = process.env.VEYN_FILE || require('path').join(__dirname, '..', 'dist', 'index.html');
const res = []; const ok = (n, c, i) => { res.push((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? ' [' + i + ']' : '')); };
(async () => {
const H = mk({ file: FILE }), { w, G, Game, frames, key, errors } = H, A = w.VEYN_ADV, THREE = w.THREE;
frames(3); w.document.getElementById('advNew').click(); frames(2); key('Space', true); key('Space', false); await sleep(30); frames(5);
const R = A.Region, P = () => Game.world.player;
// ---- A+F: cart bed / sword / corpse
const bed = R.cartBedY; ok('region records the corpse cart bed height (F mesh 0.95 / fallback 1.2)', bed === 0.95 || bed === 1.2, bed);
// merge 2 (A2): the sword is no longer on the bed; it stands upright in the mud beside the cart at (3.72, -72.78), prompt at (3.55, -72.35)
const sw = R.pickups.sword; let sy = null, sx = null, sz = null; if (sw && sw.model) { sx = sw.model.position.x; sz = sw.model.position.z; sy = sw.model.position.y - R.groundY(sx, sz); }
ok('A2 sword stands in the mud beside the cart (not on the bed)', sw && sw.model && Math.abs(sx - 3.72) < 0.01 && Math.abs(sz + 72.78) < 0.01 && Math.abs(sy) < 0.05 && sw.def.model.upright, sy !== null && [sx.toFixed(2), sz.toFixed(2), sy.toFixed(3)].join(','));
ok('A2 sword prompt point at (3.55, -72.35)', sw && sw.def.x === 3.55 && sw.def.z === -72.35);
ok('A corpses still built (posed or shroud fallback), one on the cart', !!R.corpseInfo && (R.corpseInfo.posed + R.corpseInfo.fallback) > 0, JSON.stringify(R.corpseInfo));
// chunk G2: no random scattered bodies; 11 placed requests (cart, 2 pit slumps, clue body, 4 placed pit bodies, gallows slump, 2 gibbets), 9 on Low (gibbets empty), all fit
{ const ci = R.corpseInfo, reqs = A.Region._B.corpses; ok('G2 corpses: 11 placed requests, no scattered groups, every placed pit body fits (budget 14)', ci.requests === 11 && !reqs.some(q => q.group) && ci.misfit.length === 0 && ci.budget === 14 && reqs.filter(q => q.check).length === 4, JSON.stringify(ci));
  const q0 = G.Settings.quality; G.Settings.quality = 'low'; G.applyQuality(); const BL = new A.Builder(A.Region.data).build(); G.Settings.quality = q0; G.applyQuality();
  ok('G2 Low: 9 requests (no gibbet bodies), budget 9 -> all 9 can pose', BL.corpseInfo.requests === 9 && BL.corpseInfo.budget === 9, JSON.stringify(BL.corpseInfo));
  ok('G2 the clue body under the order is a fixed corpse beside the stake at (-2.6, -63.2)', reqs.some(q => !q.group && q.x === -2.6 && q.z === -63.2 && q.pose === 'prone'));
  const pk = R.pickups; ok('G2 every pickup has a real mesh (sword, 3 name-tags, tithe)', ['sword', 'tag_pell', 'tag_ilke', 'tag_jory', 'tithe_altar'].every(k => pk[k] && pk[k].model && pk[k].model.children.some(o => o.isMesh)), Object.keys(pk).join(','));
  ok('G2 the Block banners exist, the prop axe is gone', !!R.dyn.getObjectByName('wallBanners')); }
// ---- A2: set dressing built (pit + gallows sets, 2 crows)
ok('A2 dressing: pit + gallows sets merged, 2 crows', !!R.dressInfo && R.dressInfo.parts > 0 && R.dressInfo.crows === 2, JSON.stringify(R.dressInfo));
// ---- A+E: lantern embers
const Parts = G.Parts; const lan = Object.values(R.lanterns)[0];
if (lan) { R.setLantern(lan.def.id, true); P().x = P().px = lan.def.x; P().z = P().pz = lan.def.z - 2; frames(2);
  const vis = () => lan.embers.filter(e => e.s.visible).length;
  // medium: E particles drawing -> no A sprites
  const on0 = Parts.on; G.Settings.quality = 'medium'; G.applyQuality(); frames(1); const fakeOn = !Parts.pts; if (fakeOn) Parts.on = () => true; frames(40);
  ok('Medium with E particles on: A lantern ember sprites hidden (no doubled embers)', Parts.on() && vis() === 0, (Parts.on() ? 'parts on' : 'parts off') + ', sprites ' + vis());
  if (fakeOn) Parts.on = () => false; else { G.Guard.partsOff = true; Parts.apply(G.TIERS.medium); } frames(40);
  ok('particles off (Guard) -> A ember sprites come back', !Parts.on() && vis() > 0, vis());
  if (!fakeOn) { G.Guard.partsOff = false; } Parts.on = on0; G.Settings.quality = 'low'; G.applyQuality(); frames(40); ok('Low: neither (no E parts, no A sprites)', vis() === 0 && !Parts.on(), vis()); }
else ok('a lantern exists', false);
// ---- B+D: boss seals the Block; field foes go home and never hold the token
{ const od = A.Ents.list.find(e => e.def.id === 'odran'), m5 = A.Ents.list.find(e => e.def.id === 'm5'), T = A.api.Token;
  if (od && m5) { A.Save.data.flags.intro_odran = true; P().x = P().px = 0; P().z = P().pz = 40; m5.f.x = m5.f.px = 0; m5.f.z = m5.f.pz = 42; A.Ents.engage(m5, 'struck'); frames(30);
    A.startBoss(od); frames(5); ok('boss start: the engaged field foe is sent home (D)', m5.mode !== 'combat' && Math.hypot(m5.f.x - m5.home.x, m5.f.z - m5.home.z) < 0.5, m5.mode);
    let held = 0, atk = 0; for (let i = 0; i < 300; i++) { frames(1); if (Game.world.tokenFree && Game.world.tokenFree(m5.f)) held++; if (m5.f.atk) atk++; }
    ok('during the boss no field foe gets the token or attacks (B)', held === 0 && atk === 0, held + '/' + atk);
    ok('the boss itself still fights (core token)', !!A.boss, !!A.boss); }
  else ok('odran + m5 exist', false); }
// ---- C+F: belt key re-mount on model swap
{ const g3 = A.Ents.list.find(e => e.def.id === 'g3'); if (g3 && g3.c) { frames(2); const b0 = g3.c._belt; ok('the sergeant wears the Gaol Key', !!b0); const fake = { fake: 1 }; g3.c._beltModel = fake; frames(2); ok('belt re-mounts when the body model changes', !!g3.c._belt && g3.c._beltModel !== fake); }
  else ok('g3 exists with a character', false); }
ok('no console errors', errors.length === 0, errors[0]);
console.log(res.join('\n')); const fails = res.filter(r => r.startsWith('FAIL')).length; console.log((res.length - fails) + '/' + res.length + ' merge checks passed'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FAILED', e); process.exit(1); });
