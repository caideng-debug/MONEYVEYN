// Chunk C regression: an E press made while the player cannot act (mid-jump / landing / swing recovery) beside an interactable used to be
// silently dropped (A.preIntent only honoured it if p.canAct() on that exact frame; the press then fell into the deathblow buffer and expired).
// Reproduced on the pre-fix build with the sword pickup in the Corpse Pit; run: VEYN_FILE=<build> node .test/epress.js
const mk = require('./p1h.js'); const sleep = ms => new Promise(r => setTimeout(r, ms));
const FILE = process.env.VEYN_FILE || require('path').join(__dirname, '..', 'dist', 'index.html');
(async () => { const H = mk({ file: FILE }), { w, Game, frames, key, tap } = H, A = w.VEYN_ADV, P = () => Game.world.player;
  frames(3); w.document.getElementById('advNew').click(); frames(2); key('Space', true); key('Space', false); await sleep(30); frames(5);
  const p = P(); p.x = p.px = 4.4; p.z = p.pz = -71.6; frames(3); const before = /Take your sword/.test(w.document.getElementById('advPrompt').textContent);
  tap('Space'); frames(3); const air = !P().canAct(); tap('KeyE'); frames(60); await sleep(20);
  const got = !!A.Save.data.collected.sword; console.log((before && air && got ? 'PASS' : 'FAIL') + ' E pressed mid-jump beside the sword is honoured on landing [prompt=' + before + ' air=' + air + ' taken=' + got + ']');
  process.exit(before && air && got ? 0 : 1); })();
