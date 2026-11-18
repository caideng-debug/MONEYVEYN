// Isolated preview of the baked corpse poses (own renderer, neutral light): shots/A_corpse_poses.png
const { chromium } = require('/workspace/veynhold/.tools/node_modules/playwright-core');
const fs = require('fs'); const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ executablePath: '/workspace/veynhold/.tools/browsers/chromium-1134/chrome-linux/chrome', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 400, height: 300 } }); p.on('pageerror', e => console.log('pageerror', e.message)); p.on('console', m => { if (m.type() === 'error') console.log('err', m.text()); });
  await p.goto('file:///workspace/veynhold/dist/index.html', { timeout: 180000 });
  await p.waitForFunction(() => window.VEYN_ADV && window.VEYN_ADV.Corpses && window.VEYN_MODELS && window.VEYN_MODELS.status().ready >= 3, null, { timeout: 240000 });
  const url = await p.evaluate(() => { const THREE = window.THREE, C = window.VEYN_ADV.Corpses, W = 1600, H = 900;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true }); r.outputEncoding = THREE.sRGBEncoding;
    const sc = new THREE.Scene(); sc.background = new THREE.Color(0x30343a); sc.add(new THREE.HemisphereLight(0xffffff, 0x404040, 1.1)); const dl = new THREE.DirectionalLight(0xffffff, 1.2); dl.position.set(2, 4, 3); sc.add(dl);
    const g = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: 0x6a6258 })); g.rotation.x = -Math.PI / 2; sc.add(g);
    const poses = Object.keys(C.POSES), keys = C.KEYS, info = [];
    poses.forEach((pn, i) => keys.forEach((k, j) => { const bk = C.bake(k, pn); if (!bk) return; info.push(pn + '/' + k + ' ' + JSON.stringify(bk.box));
      for (const part of bk.parts) { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(part.pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(part.nor, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(part.uv, 2));
        const col = new Float32Array(part.pos.length).fill(0.85); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setIndex(new THREE.BufferAttribute(part.idx, 1)); const m = new THREE.Mesh(geo, C.mat(k, part)); m.position.set((i - 2) * 2.4, 0, (j - 1) * 2.6); sc.add(m); } }));
    const cam = new THREE.PerspectiveCamera(40, W / H, 0.1, 100); cam.position.set(0, 9, 9); cam.lookAt(0, 0, 0.5); r.render(sc, cam); const a = cv.toDataURL('image/png');
    cam.position.set(0, 1.0, 9.5); cam.lookAt(0, 0.4, 0); r.render(sc, cam); return [a, cv.toDataURL('image/png'), info]; });
  fs.writeFileSync('/workspace/veynhold/shots/A_corpse_poses.png', Buffer.from(url[0].split(',')[1], 'base64'));
  fs.writeFileSync('/workspace/veynhold/shots/A_corpse_poses_side.png', Buffer.from(url[1].split(',')[1], 'base64')); console.log(url[2].join('\n'));
  await b.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
