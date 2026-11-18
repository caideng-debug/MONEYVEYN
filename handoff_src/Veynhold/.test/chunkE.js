// chunk E: Ultra tier (opt-in), GPU particle buffer, adaptive resolution guard. jsdom / headless (no WebGL: the Ultra composer itself is checked in the browser probe).
const mk = require('./p1h.js'); const sleep = ms => new Promise(r => setTimeout(r, ms));
const res = []; const ok = (n, c, i) => { res.push((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? ' [' + i + ']' : '')); };
(async () => {
const H = mk({ file: process.env.VEYN_HTML || require('path').join(__dirname, '../dist/index.html') }), { w, G, Game, frames, key, errors } = H, A = w.VEYN_ADV;
frames(3);
const T = G.TIERS;
ok('Ultra tier exists, flagged, above High', T.ultra && T.ultra.ultra === true && T.ultra.label === 'Ultra' && T.ultra.ss > 1 && T.ultra.parts === 1);
ok('Low/Medium/High keys unchanged apart from particle shares', T.low.pr === 0.65 && T.medium.pr === 0.8 && T.high.pr === 1.25 && !T.low.shadows && T.low.parts === 0 && T.medium.parts > 0 && T.medium.parts < T.high.parts && T.high.parts < 1);
ok('default quality is not Ultra', G.Settings.quality !== 'ultra', G.Settings.quality);
{ const qb = w.document.getElementById('qualBtn'), seen = []; for (let i = 0; i < 6; i++) { qb.click(); seen.push(G.Settings.quality); } ok('title quality cycle never lands on Ultra', !seen.includes('ultra'), seen.join(','));
  G.Settings.quality = 'ultra'; qb.click(); ok('title cycle steps Ultra down to High', G.Settings.quality === 'high'); G.Settings.quality = 'medium'; G.applyQuality(); }
// Perf (one tier step per session) goes Ultra -> High, never Ultra -> Low
{ G.Settings.quality = 'ultra'; G.Perf.stepped = false; G.Perf.playT = 0; for (let i = 0; i < 200; i++) G.Perf.update(1 / 25, true); ok('adaptive tier step: Ultra -> High', G.Settings.quality === 'high', G.Settings.quality); G.Perf.stepped = true; }
// Guard
{ const g = G.Guard; g.scale = 1; g.ema = 16.7; g.partsOff = false; G.Settings.quality = 'medium'; G.applyQuality();
  for (let i = 0; i < 40; i++) g.update(0.025, true); ok('guard: 25 ms frames for < 2 s do not change the scale', g.scale === 1, g.scale);
  for (let i = 0; i < 80; i++) g.update(0.025, true); ok('guard: sustained > 20 ms lowers the render scale one step', Math.abs(g.scale - 0.9) < 1e-6, g.scale);
  for (let i = 0; i < 800; i++) g.update(0.04, true); ok('guard: floors at 0.6', Math.abs(g.scale - 0.6) < 1e-6, g.scale);
  ok('guard: still slow at the floor on Medium -> particles off', g.partsOff === true);
  for (let i = 0; i < 600; i++) g.update(0.010, true); ok('guard: < 14 ms for 5 s raises the scale one step', Math.abs(g.scale - 0.7) < 1e-6, g.scale);
  for (let i = 0; i < 3000; i++) g.update(0.010, true); ok('guard: recovers to 1.0, never above', g.scale === 1, g.scale);
  const s0 = g.scale; for (let i = 0; i < 100; i++) g.update(0.05, false); ok('guard idles outside play', g.scale === s0);
  g.partsOff = false; G.Settings.quality = 'high'; g.scale = 0.6; g.ema = 40; for (let i = 0; i < 200; i++) g.update(0.04, true); ok('guard never turns particles off on High/Ultra (tier step handles it)', g.partsOff === false);
  g.scale = 1; g.ema = 16.7; g.hiT = g.loT = 0; }
// world mode: one particle buffer, gated per tier
w.document.getElementById('advNew').click(); frames(2); key('Space', true); key('Space', false); await sleep(30); frames(5);
ok('in world', Game.state === 'playing' && A.active);
G.Settings.quality = 'ultra'; G.applyQuality(); frames(2);
const P = G.Parts; ok('particle buffer built from the region flames', P.pts && P.N > 150 && P.pts.parent === G.scene, P.N);
const n = () => P.pts.visible ? P.pts.geometry.drawRange.count : 0;
const counts = {}; for (const q of ['low', 'medium', 'high', 'ultra']) { G.Settings.quality = q; G.applyQuality(); frames(1); counts[q] = n(); }
ok('particles per tier: Low 0 < Medium < High < Ultra = all', counts.low === 0 && counts.medium > 0 && counts.medium < counts.high && counts.high < counts.ultra && counts.ultra === P.N, JSON.stringify(counts));
ok('one draw call (single Points, one material)', P.pts.isPoints && !Array.isArray(P.pts.material));
{ const pos = P.pts.geometry.attributes.position.array.slice(0, 30).join(); frames(30); ok('no CPU writes to the particle buffer per frame', P.pts.geometry.attributes.position.array.slice(0, 30).join() === pos && P.pts.geometry.attributes.position.version === 0); }
ok('High uses the cheap mist variant, Ultra the full one', (() => { G.Settings.quality = 'high'; G.applyQuality(); const a = P.U.uCheap.value; G.Settings.quality = 'ultra'; G.applyQuality(); return a === 1 && P.U.uCheap.value === 0; })());
G.Guard.partsOff = true; G.Settings.quality = 'medium'; G.applyQuality(); ok('guard particles-off hides the buffer on Medium', !P.pts.visible); G.Guard.partsOff = false;
G.Settings.quality = 'medium'; G.applyQuality();
// world settings menu: Ultra toggle is the only way in
key('Escape', true); key('Escape', false); frames(3);
const st = w.document.querySelector('#advMenu [data-t="Settings"]'); if (st) st.click(); frames(1);
const ub = w.document.getElementById('setUltra'); ok('world Settings has an Ultra toggle', !!ub);
if (ub) { ub.click(); ok('Ultra toggle turns Ultra on', G.Settings.quality === 'ultra'); w.document.getElementById('setUltra').click(); ok('Ultra toggle off -> High', G.Settings.quality === 'high'); }
G.Settings.quality = 'medium'; G.applyQuality();
ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
console.log(res.join('\n')); const pass = res.filter(r => r.startsWith('PASS')).length; console.log(pass + '/' + res.length); process.exit(pass === res.length ? 0 : 1);
})();
