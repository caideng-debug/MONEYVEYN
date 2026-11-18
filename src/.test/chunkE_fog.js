// chunk E follow-up: Medium draws embers only (fog-strength uniform uFog = 0), Low draws nothing, High/Ultra keep the mist.
const mk = require('./p1h.js'); const sleep = ms => new Promise(r => setTimeout(r, ms));
const res = []; const ok = (n, c, i) => { res.push((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? ' [' + i + ']' : '')); };
(async () => {
const H = mk({ file: process.env.VEYN_HTML || require('path').join(__dirname, '../dist/index.html') }), { w, G, Game, frames, key, errors } = H, A = w.VEYN_ADV;
frames(3); w.document.getElementById('advNew').click(); frames(2); key('Space', true); key('Space', false); await sleep(30); frames(5);
ok('in world', Game.state === 'playing' && A.active);
G.Settings.quality = 'ultra'; G.applyQuality(); frames(2); const P = G.Parts;
ok('particle buffer exists with a fog-strength uniform', P.pts && P.U && P.U.uFog && /uFog\b/.test(P.pts.material.vertexShader));
const fog = {}, vis = {}; for (const q of ['low', 'medium', 'high', 'ultra']) { G.Settings.quality = q; G.applyQuality(); frames(1); fog[q] = P.U.uFog.value; vis[q] = P.pts.visible; }
ok('Medium: fog strength 0 (embers only), buffer still visible', fog.medium === 0 && vis.medium === true, JSON.stringify(fog));
ok('High / Ultra: fog strength 1', fog.high === 1 && fog.ultra === 1, JSON.stringify(fog));
ok('Low: buffer hidden', vis.low === false);
ok('Medium partsFog key only on Medium', G.TIERS.medium.partsFog === 0 && G.TIERS.high.partsFog === undefined && G.TIERS.ultra.partsFog === undefined && G.TIERS.low.partsFog === undefined);
G.Settings.quality = 'medium'; G.applyQuality();
ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
console.log(res.join('\n')); const pass = res.filter(r => r.startsWith('PASS')).length; console.log(pass + '/' + res.length); process.exit(pass === res.length ? 0 : 1);
})();
