const H = require('./p1h.js')(); const { w, G, Game, frames, key, tap, errors } = H; const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
const A = w.VEYN_ADV;
frames(3); w.document.getElementById('advNew').click(); frames(2); if (A.prologueEnd) A.prologueEnd(); await sleep(20);
const t0 = Date.now(); frames(5); console.log('start ms', Date.now() - t0, 'state', Game.state, 'region build ms', A.Region.buildMs && A.Region.buildMs.toFixed(0));
const W = Game.world, p = W.player; console.log('player', p.x, p.z, 'enemies', A.Ents.list.length, 'segs', A.Region.segs.length, 'chunks', A.Region.chunks.length);
key('KeyW', true); frames(90); key('KeyW', false); console.log('after walk', p.x.toFixed(2), p.z.toFixed(2));
console.log('quest', JSON.stringify(A.Save.data.quests), 'obj', w.document.querySelector('#advObj span').textContent);
console.log('errors', errors.slice(0, 5));
})();
