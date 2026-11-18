// chunk T: shared launch + real-input helpers for traverse.js and fresh_playthrough.js (lifted from p1_browser.js).
// Paths are relative to this worktree, so no sed is needed. window.VEYN_* hooks: read state, or place the player at a test start.
const { chromium } = require('/workspace/veynhold/.tools/node_modules/playwright-core');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const URL = 'file://' + path.join(ROOT, 'dist', 'index.html'), SHOTS = path.join(ROOT, 'shots') + '/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

async function launch(opts) {
  opts = opts || {};
  const browser = await chromium.launch({ executablePath: '/workspace/veynhold/.tools/browsers/chromium-1134/chrome-linux/chrome',
    args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1280, height: 720 } });   // fresh context = fresh localStorage
  // same environment shim as p1_browser.js: headless pointer lock is broken, so refuse it and use the game's drag-to-look fallback
  await ctx.addInitScript(() => { Element.prototype.requestPointerLock = function () { return Promise.reject(new DOMException('pointer lock disabled for the headless playtest', 'NotSupportedError')); }; });
  if (opts.storage) await ctx.addInitScript(s => { if (!sessionStorage.getItem('__t_seeded')) { sessionStorage.setItem('__t_seeded', '1'); for (const k in s) localStorage.setItem(k, s[k]); } }, opts.storage);
  const page = await ctx.newPage();
  const T = { browser, ctx, page, errors: [], cur: 'boot' };
  page.on('pageerror', e => T.errors.push({ step: T.cur, kind: 'pageerror', msg: e.message }));
  page.on('console', m => { if (m.type() === 'error') T.errors.push({ step: T.cur, kind: 'console.error', msg: m.text() }); });
  const ev = (fn, arg) => page.evaluate(fn, arg); T.ev = ev;
  T.st = () => ev(() => { const G = window.VEYN_GAME, A = window.VEYN_ADV, W = G.Game.world, P = W && W.player; const pr = document.getElementById('advPrompt');
    const c = P && G.Game.chars.get(P.id);
    return { s: G.Game.state, fps: G.Game.fps, x: P ? P.x : null, z: P ? P.z : null, yaw: G.Cam.yaw, hp: P ? P.hp : null, dead: P ? !!P.dead : null, pstate: P ? P.state : null,
      ry: c ? c.root.position.y : null, rx: c ? c.root.position.x : null, rz: c ? c.root.position.z : null,
      gy: P && A.active ? A.Region.groundY(P.x, P.z) : 0,
      prompt: pr && pr.style.display !== 'none' ? pr.textContent : '', zone: P && A.active && A.Region.zoneAt(P.x, P.z) ? A.Region.zoneAt(P.x, P.z).id : null, sens: G.Settings.sens }; });
  T.shot = async name => { await page.screenshot({ path: SHOTS + name + '.png' }); return name + '.png'; };
  const cx = () => (page.viewportSize().width / 2) | 0, cy = () => (page.viewportSize().height / 2) | 0;
  T.look = async function (dYaw) { const sens = (await T.st()).sens; let px = -dYaw / sens; const lim = page.viewportSize().width / 2 - 20;
    while (Math.abs(px) > 1) { const d = Math.max(-lim, Math.min(lim, px)); await page.mouse.move(cx(), cy()); await page.mouse.down({ button: 'middle' });
      await page.mouse.move(cx() + d, cy(), { steps: 6 }); await sleep(120); await page.mouse.up({ button: 'middle' }); px -= d; } await sleep(150); };
  const held = new Set(); T.held = held;
  T.down = async k => { if (!held.has(k)) { held.add(k); await page.keyboard.down(k); } };
  T.up = async k => { if (held.has(k)) { held.delete(k); await page.keyboard.up(k); } };
  T.releaseAll = async () => { for (const k of [...held]) await T.up(k); };
  T.tap = async (k, ms) => { await page.keyboard.down(k); await sleep(ms || 90); await page.keyboard.up(k); };
  T.clickEl = async function (sel) { const b = await page.$(sel); if (!b) throw new Error('no element ' + sel); const r = await b.boundingBox(); if (!r) throw new Error('not visible ' + sel);
    await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2); };
  T.walkTo = async function (tx, tz, tol, maxMs, noSprint) { const t0 = Date.now(); let last = null, stuck = 0, iters = 0;
    while (Date.now() - t0 < (maxMs || 40000)) { iters++; const s = await T.st(); if (s.s !== 'playing') { await T.releaseAll(); await sleep(200); continue; }
      const dx = tx - s.x, dz = tz - s.z, d = Math.hypot(dx, dz); if (d < (tol || 0.6)) { await T.releaseAll(); return { ok: true, d, iters }; }
      const want = Math.atan2(dx, dz), err = wrap(want - s.yaw);
      if (Math.abs(err) > (d < 2 ? 0.35 : 0.2)) { await T.releaseAll(); await T.look(err); continue; }
      if (d > 4 && !noSprint) await T.down('ShiftLeft'); else await T.up('ShiftLeft'); await T.down('KeyW'); await sleep(d < 1.5 ? 120 : 260);
      const s2 = await T.st(); if (last && Math.hypot(s2.x - last.x, s2.z - last.z) < 0.03) { if (++stuck > 4) { await T.releaseAll(); await T.down(stuck % 2 ? 'KeyA' : 'KeyD'); await sleep(500); await T.releaseAll(); stuck = 0; } } else stuck = 0; last = s2; }
    await T.releaseAll(); const s = await T.st(); return { ok: false, d: Math.hypot(tx - s.x, tz - s.z), iters }; };
  T.faceTo = async function (tx, tz) { const s = await T.st(); await T.look(wrap(Math.atan2(tx - s.x, tz - s.z) - s.yaw)); };
  // set the camera yaw exactly (a read/aim aid for traversal checks; the movement itself is page.keyboard)
  T.setYaw = yaw => ev(y => { window.VEYN_GAME.Cam.yaw = y; }, yaw);
  // test-start placement hook: put the player at (x, z), facing yaw, at rest
  T.place = (x, z, yaw) => ev(([x, z, yaw]) => { const G = window.VEYN_GAME, p = G.Game.world.player; p.x = p.px = x; p.z = p.pz = z; p.vx = p.vz = 0; if (p.pvx !== undefined) p.pvx = p.pvz = 0;
    if (yaw !== undefined) { p.facing = p.pfacing = yaw; G.Cam.yaw = yaw; } const c = G.Game.chars.get(p.id); if (c) { c.gy = window.VEYN_ADV.Region.groundY(x, z); } }, [x, z, yaw]);
  // per-frame sampler living in the page (read-only): records the player's rendered root y, its ground, and position every rAF
  T.sampleStart = () => ev(() => { const G = window.VEYN_GAME, A = window.VEYN_ADV; const S = window.__tS = { on: true, rows: [] };
    const f = () => { if (!S.on) return; const P = G.Game.world && G.Game.world.player, c = P && G.Game.chars.get(P.id);
      if (P && c && G.Game.state === 'playing') { const r = c.root.position; S.rows.push([r.x, r.z, r.y, A.Region.groundY(r.x, r.z), P.x, P.z, P.state, P.airborne ? 1 : 0]); } requestAnimationFrame(f); }; requestAnimationFrame(f); });
  T.sampleStop = () => ev(() => { const S = window.__tS; S.on = false; return S.rows; });
  return T;
}

async function boot(T, quality) {   // fresh title -> choose quality by real clicks -> New Journey
  await T.page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await T.page.waitForFunction(() => window.VEYN_ADV && document.getElementById('advNew') && window.VEYN_GAME && window.VEYN_GAME.Game.state === 'title', null, { timeout: 90000 });
  await sleep(1000);
  for (let i = 0; i < 6; i++) { const qt = await (await T.page.$('#qualBtn')).textContent(); if (new RegExp(quality, 'i').test(qt)) break; await T.clickEl('#qualBtn'); await sleep(250); }
  return (await (await T.page.$('#qualBtn')).textContent());
}

module.exports = { launch, boot, sleep, wrap, URL, SHOTS, ROOT };
// prologue -> playing with real Space presses (retries while the prologue text is still fading in)
module.exports.passPrologue = async function (T, maxMs) { const t0 = Date.now(); let n = 0;
  while (Date.now() - t0 < (maxMs || 90000)) { const s = await T.st(); if (s.s === 'playing') return { ok: true, presses: n, secs: (Date.now() - t0) / 1000 }; if (s.s === 'prologue') { await T.tap('Space'); n++; } await sleep(1500); }
  return { ok: false, presses: n }; };
