const H = require('./harness.js'); const { w, G, Game, frames, key, tap, errors } = H;
frames(30);
const encs = ['duelist','warden','brother','pair','king','gauntlet'];
for (const enc of encs) {
  w.document.querySelector(`[data-enc="${enc}"]`).click();
  if (Game.state !== 'playing') { console.log('FAIL start', enc, Game.state); continue; }
  tap('KeyQ'); const W = Game.world;
  // random play for 40 sim seconds
  let r = 1; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
  key('KeyW', true);
  frames(60 * 40, i => { if (i % 20 === 0) { const k = ['KeyJ','KeyF','Space','KeyK','KeyC','KeyE','KeyA','KeyD'][Math.floor(rnd()*8)]; key(k, true); setTimeout(()=>{},0); H._k = k; } if (i % 20 === 3 && H._k) key(H._k, false); W.player.hp = Math.max(W.player.hp, 30); });
  key('KeyW', false);
  const counts = {}; // count events? events cleared; check stats
  console.log(enc.padEnd(9), 'state', Game.state, 'player', W.player.stats, 'enemies', W.fighters.filter(f=>f.team===1).map(e=>`${e.name}:${e.hp.toFixed(0)}hp ${e.state} ph${e.phase}`).join(', '), 'chars', Game.chars.size, 'scene children', G.scene.children.length);
  // restart 5 times and check no leaks
  const before = G.scene.children.length;
  for (let i = 0; i < 5; i++) { tap('KeyR'); frames(5); }
  console.log('   restart x5: scene children', before, '->', G.scene.children.length, 'chars', Game.chars.size, 'state', Game.state);
  tap('Escape'); console.log('   pause ->', Game.state); tap('Escape'); console.log('   resume ->', Game.state);
  Game.quit();
}
console.log('ERRORS:', errors.length ? errors.slice(0, 10) : 'none', 'crashed', !!Game.crashed);
