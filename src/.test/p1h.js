// P1 harness: same jsdom page as harness.js, but console.error keeps every argument (stack traces)
const { JSDOM, VirtualConsole } = require('/workspace/veynhold/.test/node_modules/jsdom');
const fs = require('fs');
module.exports = function (opts) { opts = opts || {};
  const html = fs.readFileSync(opts.file || '/workspace/veynhold/dist/index.html', 'utf8');
  const vc = new VirtualConsole(); const errors = [], logs = [];
  vc.on('jsdomError', e => { if (!/getContext|Not implemented: HTMLCanvasElement|Not implemented: navigation/.test(e.message)) errors.push('jsdomError: ' + e.message); });
  vc.on('error', (e, ...r) => errors.push('console.error: ' + (e && e.stack || e) + ' ' + r.map(x => x && x.stack || x).join(' ')));
  vc.on('log', m => logs.push(m)); vc.on('warn', m => logs.push('warn ' + m));
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: false, virtualConsole: vc, url: 'http://localhost/veynhold/index.html', beforeParse(w) { w.__VEYN_HEADLESS = true; w.__VEYN_SEED = opts.seed || +(process.env.P1_SEED || 4242); w.requestAnimationFrame = () => 0; w.innerWidth = 1280; w.innerHeight = 720;
    if (opts.storage) for (const k in opts.storage) w.localStorage.setItem(k, opts.storage[k]); } });
  const w = dom.window; const G = w.VEYN_GAME; const Game = G.Game; let t = 1000;
  const frames = (n, cb) => { for (let i = 0; i < n; i++) { t += 16.67; if (cb) cb(i); Game.frame(t); } };
  const key = (code, down) => w.dispatchEvent(new w.KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true }));
  const tap = code => { key(code, true); frames(1); key(code, false); frames(1); };
  return { w, G, Game, frames, key, tap, errors, logs, dom };
};
