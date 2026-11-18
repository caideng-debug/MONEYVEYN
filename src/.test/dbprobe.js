const H = require('./xharness.js'); const { w, G, Game, frames, tap } = H; const C = w.VEYN_CORE;
if (!w.localStorage) { const mem = {}; Object.defineProperty(w, 'localStorage', { value: { getItem: k => k in mem ? mem[k] : null, setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } } }); }
G.Store.data.seenTutorial = true; const out = {};
for (let r = 0; r < (+process.env.N || 20); r++) {
  w.document.querySelector('[data-enc="duelist"]').click(); frames(2); const W = Game.world; W.player.hp = W.player.maxHp = 1e5; frames(60 * 3 + Math.floor(Math.random()*120)); W.player.maxHp = 100; W.player.hp = 100; for (const en of W.enemies()) en.brain.update = () => {}; for (let i = 0; i < 90 && !['idle', 'move'].includes(W.player.state); i++) frames(1);
  for (const en of W.enemies()) { C.addPosture(W, en, 1e4); en.x = W.player.x; en.z = W.player.z + 2; } frames(2);
  const p = W.player, e = W.enemies()[0]; const info = { pst: p.state, cand: !!W.deathblowCandidate(p), est: e.state, broken: e.broken };
  const tr=[]; tap('KeyE'); frames(200,(i)=>{ if(i<40) tr.push(p.state+'/'+e.state+'/'+(e.atk&&e.atk.def.key)); }); const k = W.over || 'none'; out[k] = (out[k] || 0) + 1; if (k !== 'victory') console.log('run', r, JSON.stringify(info), 'after', p.state, e.state, e.hp, tr.filter((x,i)=>i%3==0).join(' '));
  Game.quit();
} console.log(JSON.stringify(out));
