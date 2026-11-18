// probe: repeat the v6 gamepad X-tap sequence and log what the player gets and why
const H = require('./xharness.js'); const { w, G, Game, frames } = H; const C = w.VEYN_CORE;
if (!w.localStorage) { const mem = {}; Object.defineProperty(w, 'localStorage', { value: { getItem: k => k in mem ? mem[k] : null, setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } } }); }
G.Store.data.seenTutorial = true;
const N = +process.env.N || 20; const out = {};
for (let r = 0; r < N; r++) {
  w.document.querySelector('[data-enc="duelist"]').click(); frames(2); const W = Game.world, p = W.player; const ev = [];
  const o = W.emit.bind(W); W.emit = e => { if (['attackStart','deflect','guardRaise','hit','blocked'].includes(e.type)) ev.push(W.time.toFixed(2) + ':' + e.type + (e.key ? '/' + e.key : '') + (e.a !== undefined ? ' a' + e.a : '')); return o(e); };
  let pad = { connected: true, axes: [0, -1, 0.6, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
  w.navigator.getGamepads = () => [pad]; frames(30); pad.axes = [0, 0, 0, 0]; frames(30);
  pad.buttons[0].pressed = true; frames(1); pad.buttons[0].pressed = false; frames(1); frames(60);
  pad.buttons[5].pressed = true; frames(3); pad.buttons[5].pressed = false; frames(20);
  const pre = { st: p.state, rk: p.reactKind, dt: (p.lt - p.reactT).toFixed(2), atk: p.atk && p.atk.def.key }; const evMark = ev.length;
  pad.buttons[2].pressed = true; frames(1); pad.buttons[2].pressed = false; frames(1);
  const k = p.atk && p.atk.def.key; out[k] = (out[k] || 0) + 1;
  if (k !== 'p_h') console.log('run', r, 'got', k, 'pre', JSON.stringify(pre), 'state', p.state, 'events', ev.slice(-8).join(' | '));
  w.navigator.getGamepads = () => []; frames(2); Game.quit();
}
console.log(JSON.stringify(out));
