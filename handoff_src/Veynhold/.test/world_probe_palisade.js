// chunk WORLD: probe — which z (1 m bins) along the west palisade (x = -58) have merged static geometry above 1 m, and what draws there
const path = require('path'); const { chromium } = require('/workspace/veynhold/.tools/node_modules/playwright-core');
const ROOT = path.resolve(__dirname, '..'), HTML = path.resolve(process.argv[2] || path.join(ROOT, 'dist/index.html'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ executablePath: '/workspace/veynhold/.tools/browsers/chromium-1134/chrome-linux/chrome', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 640, height: 360 } });
  await p.goto('file://' + HTML, { timeout: 300000, waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.VEYN_ADV && window.VEYN_GAME && window.VEYN_GAME.Game.state === 'title', null, { timeout: 240000 });
  await p.evaluate(() => { window.VEYN_GAME.Settings.quality = 'medium'; window.VEYN_GAME.applyQuality(); document.getElementById('advNew').click(); });
  await p.waitForFunction(() => { const A = window.VEYN_ADV; if (A.prologueEnd) A.prologueEnd(); return A.active && window.VEYN_GAME.Game.world; }, null, { timeout: 300000, polling: 1000 }); await sleep(1500);
  const r = await p.evaluate(() => { const A = window.VEYN_ADV, THREE = window.THREE, v = new THREE.Vector3(), bins = {}, who = {};
    for (const m of A.Region.root.children) { m.updateMatrixWorld(true); const P = m.geometry.attributes.position; for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(m.matrixWorld); if (Math.abs(v.x + 58) < 0.6 && v.y > 1 && v.z > -13 && v.z < 31) { const k = Math.floor(v.z); bins[k] = (bins[k] || 0) + 1; (who[k] = who[k] || new Set()).add(m.material.name || m.material.uuid.slice(0, 6)); } } }
    const out = []; for (let z = -12; z < 30; z++) out.push([z, bins[z] || 0, who[z] ? [...who[z]].join('/') : '']); return out; });
  console.log(JSON.stringify(r)); await b.close();
})().catch(e => { console.error(e); process.exit(1); });
