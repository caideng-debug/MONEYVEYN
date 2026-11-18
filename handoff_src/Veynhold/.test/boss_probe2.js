// chunk D: field foes chasing the player up the Headsman's Stair into the boss arena
const mk = require('./p1h.js'); const path = require('path');
const save = JSON.parse(require('fs').readFileSync(__dirname + '/boss_probe.js', 'utf8').match(/const save = (\{[\s\S]*?\});\n/)[1].replace(/(\w+):/g, '"$1":').replace(/'/g, '"'));
const H = mk({ file: path.join(__dirname, '..', 'dist', 'index.html'), storage: { veynhold_save: JSON.stringify(save), veynhold_v8: JSON.stringify({ v: 8, seenTutorial: true }) } });
const { w, G, Game, frames, key, tap, errors } = H; const A = w.VEYN_ADV, C = w.VEYN_CORE; frames(3); w.document.getElementById('advContinue').click(); frames(5);
const P = () => Game.world.player, W = () => Game.world, R = A.Region; const ent = id => A.Ents.list.find(e => e.def.id === id);
const p = P(); p.x = p.px = -3; p.z = p.pz = 26; frames(2); for (const id of ['m5', 'm4', 'm6']) A.Ents.engage(ent(id), 'struck'); frames(30);
console.log('engaged', A.Ents.list.filter(e => e.mode === 'combat').map(e => e.def.id + '@' + e.f.x.toFixed(1) + ',' + e.f.z.toFixed(1)).join(' '));
p.x = p.px = 0; p.z = p.pz = 30.6; G.Cam.yaw = 0; key('KeyW', true); key('ShiftLeft', true); let n = 0; while (!A.boss && n < 400) { frames(1); n++; } frames(10); key('KeyW', false); key('ShiftLeft', false);
console.log('boss on', !!A.boss, 'player', p.x.toFixed(1), p.z.toFixed(1), 'gate', R.gates.bossfog.seg.on);
// step back to the fog gate and stand there; Odran held far away so only the field foes matter
const od = ent('odran'); od.f.brain.update = () => {}; od.f.x = od.f.px = 0; od.f.z = od.f.pz = 60; 
p.x = p.px = 0; p.z = p.pz = 36.8; let hits = [], lockF = [];
const he = Game.handleEvents; Game.handleEvents = function () { for (const e of W().events) { if ((e.type === 'hit' || e.type === 'block' || e.type === 'deflect') && e.d === p.id) { const a = W().byId(e.a); hits.push(e.type + ' by ' + (a && a.name) + ' from z=' + (a && a.z.toFixed(2)) + ' los=' + (a && R.los(a.x, a.z, p.x, p.z))); } } return he.call(this); };
for (let i = 0; i < 60 * 15; i++) { p.hp = p.maxHp; p.x = 0; p.z = 36.8; if (i % 30 === 0) { tap('KeyQ'); const t = W().byId(p.lockId); if (t && t !== od.f) lockF.push(t.name + '@z' + t.z.toFixed(1)); } frames(1); }
console.log('foes', A.Ents.list.filter(e => ['m5', 'm4', 'm6'].includes(e.def.id)).map(e => e.def.id + ' ' + e.mode + ' ' + e.f.state + ' @' + e.f.x.toFixed(1) + ',' + e.f.z.toFixed(1) + ' path=' + e.path).join(' | '));
console.log('hits on player standing inside the fog gate:', hits.length, [...new Set(hits)].slice(0, 6));
console.log('locked onto field foes behind the fog:', [...new Set(lockF)].slice(0, 5));
console.log('ERRORS', errors.slice(0, 3));
