const { JSDOM, VirtualConsole } = require('/workspace/veynhold/.test/node_modules/jsdom');
const fs = require('fs');
const html = fs.readFileSync('/workspace/veynhold/dist/index.html', 'utf8');
const vc = new VirtualConsole(); const errors = [];
vc.on('jsdomError', e => { if (!/getContext|Not implemented: HTMLCanvasElement/.test(e.message)) errors.push('jsdomError: ' + e.message + (e.detail ? ' ' + e.detail : '')); });
vc.on('error', e => errors.push('console.error: ' + (e && e.stack || e)));
vc.on('log', m => console.log('[page]', m));
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: false, virtualConsole: vc, beforeParse(w) { w.__VEYN_HEADLESS = true; if (process.env.VEYN_MODELS) w.__VEYN_TEX_STUB = T => { w.URL.createObjectURL = () => 'blob:stub'; w.URL.revokeObjectURL = () => {}; T.TextureLoader.prototype.load = function (u, onLoad) { const tx = new T.Texture(); setTimeout(() => onLoad && onLoad(tx), 0); return tx; }; }; w.requestAnimationFrame = () => 0; w.innerWidth = 1280; w.innerHeight = 720; } });
const w = dom.window; const G = w.VEYN_GAME; if (!G) { console.log('NO GAME', errors); process.exit(1); }
const { Game } = G; let t = 1000;
const frames = (n, cb) => { for (let i = 0; i < n; i++) { t += 16.67; if (cb) cb(i); Game.frame(t); } };
const key = (code, down) => w.dispatchEvent(new w.KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true }));
const tap = (code) => { key(code, true); frames(1); key(code, false); };
module.exports = { w, G, Game, frames, key, tap, errors, get t() { return t; } };
