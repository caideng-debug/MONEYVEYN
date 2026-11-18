/* =====================================================================
   REGION 1 — THE EXECUTION GROUNDS (data only; built by src/world.js)
   Units: metres. +z = north. Ground is y = 0 except where `elevation` (below) raises it: stairs/ramps and platforms give a walkable
   height field (VEYN_ADV.Ground.y), and platform edges / stair sides become collision segments (no drops or climbs over 0.6 m).
   walls:  [ax, az, bx, bz, style, height]   styles: stone | earth | bars | low | palisade | cliff | bone
           'low' walls block walking but can be vaulted by a jump (Space); 'bars' block bodies, not the camera or sight.
   gates:  kind portcullis | door | iron | fog | great ; how: lever:<id> | item:<id> | side | boss | none
   enemies: type = a BESTIARY / named key; patrol = waypoint loop; drop = item id.
   ===================================================================== */
(function () {
'use strict';
const walls = [
  // Corpse Pit (spawn) + Gravedigger's Cut
  [-9, -62, -9, -78, 'earth', 3.2], [-9, -78, 9, -78, 'earth', 3.6], [9, -78, 9, -62, 'earth', 3.2], [-9, -62, -4, -62, 'earth', 3.4], [4, -62, 9, -62, 'earth', 3.4],
  [-4, -62, -4, -54, 'earth', 4.2], [4, -62, 4, -54, 'earth', 4.2],
  // Gallows Yard
  [-22, -54, -4, -54, 'stone', 6], [4, -54, 22, -54, 'stone', 6],
  [-22, -54, -22, -37, 'stone', 6.5], [-22, -31, -22, -16, 'stone', 6.5],
  [22, -54, 22, -30, 'stone', 6], [22, -26, 22, -16, 'stone', 6], [22, -30, 22, -26, 'low', 0.9],
  [-22, -16, -3, -16, 'stone', 7], [3, -16, 22, -16, 'stone', 7], [-3, -16, -3, -12, 'stone', 7], [3, -16, 3, -12, 'stone', 7],
  // Gaol: corridor A (west), cells (south), office (north), corridor B (north to the muster door)
  [-22, -31, -38, -31, 'stone', 5], [-38, -31, -41, -31, 'stone', 5], [-45, -31, -50, -31, 'stone', 5],
  [-22, -37, -26, -37, 'stone', 5], [-46, -37, -56, -37, 'stone', 5],
  [-26, -37, -39.4, -37, 'bars', 3.2], [-41.6, -37, -46, -37, 'bars', 3.2],
  [-46, -43, -26, -43, 'stone', 5], [-26, -37, -26, -43, 'stone', 5], [-30, -37, -30, -43, 'stone', 5], [-34, -37, -34, -43, 'stone', 5], [-38, -37, -38, -43, 'stone', 5], [-42, -37, -42, -43, 'stone', 5], [-46, -37, -46, -43, 'stone', 5],
  [-48, -31, -48, -21, 'stone', 5], [-48, -21, -38, -21, 'stone', 5], [-38, -21, -38, -31, 'stone', 5],
  [-56, -37, -56, -12, 'stone', 6], [-50, -31, -50, -12, 'stone', 6],
  // Muster Field
  [-58, -12, -56, -12, 'stone', 6], [-50, -12, -3, -12, 'stone', 6], [3, -12, 42, -12, 'stone', 6], [46, -12, 48, -12, 'stone', 6],
  [-58, -12, -58, 30, 'palisade', 4.5], [48, -12, 48, 30, 'palisade', 4.5], [-58, 30, -4, 30, 'stone', 6], [4, 30, 48, 30, 'stone', 6],
  [38, 30, 38, 20, 'low', 1.0], [38, 20, 48, 20, 'low', 1.0],                       // supply-wagon pen (vault it)
  // Headsman's Stair
  [-4, 30, -4, 36, 'stone', 7], [4, 30, 4, 36, 'stone', 7],
  // Hollowwood Gate passage
  [-4, 64, -4, 74, 'stone', 8], [4, 64, 4, 74, 'stone', 8], [-4, 74, 4, 74, 'cliff', 9],
  // Ossuary: passage from the yard breach, chapel, gate to the muster field
  [22, -30, 34, -30, 'bone', 5], [22, -26, 34, -26, 'bone', 5],
  [34, -30, 34, -42, 'bone', 7], [34, -42, 56, -42, 'bone', 7], [56, -42, 56, -14, 'bone', 7], [56, -14, 46, -14, 'bone', 7], [42, -14, 34, -14, 'bone', 7], [34, -14, 34, -26, 'bone', 7],
  [42, -14, 42, -12, 'bone', 6], [46, -14, 46, -12, 'bone', 6],
];
// The Block: a ring of stone around (0, 50), r = 15, open south (stair) and north (Hollowwood passage)
(function ring() { const N = 24, R = 15, cx = 0, cz = 50; for (let i = 0; i < N; i++) { const a0 = i / N * Math.PI * 2, a1 = (i + 1) / N * Math.PI * 2, am = (a0 + a1) / 2;
  const nearS = Math.abs(Math.atan2(Math.sin(am - Math.PI), Math.cos(am - Math.PI))) < 0.2, nearN = Math.abs(Math.atan2(Math.sin(am), Math.cos(am))) < 0.2;
  if (nearS || nearN) continue; walls.push([cx + Math.sin(a0) * R, cz + Math.cos(a0) * R, cx + Math.sin(a1) * R, cz + Math.cos(a1) * R, 'stone', 7]); }
  walls.push([-4, 36, -3.9, 35.4, 'stone', 7], [4, 36, 3.9, 35.4, 'stone', 7], [-4, 64, -3.9, 64.6, 'stone', 7], [4, 64, 3.9, 64.6, 'stone', 7]); })();

window.VEYN_DATA = window.VEYN_DATA || {}; (window.VEYN_DATA.REGIONS = window.VEYN_DATA.REGIONS || {}).execution = {
  id: 'execution', name: 'The Execution Grounds', chapter: 1, next: 'hollowwood',
  bounds: { x0: -64, x1: 62, z0: -84, z1: 80 },
  spawn: { x: 0, z: -73, facing: 0 }, firstLantern: 'grave',
  prologue: ['At dawn, the King\u2019s Mercy was read before the court.', 'You were hanged from the Long Gallows of Veynhold. Your heart stopped.', 'The gravedigger carted you to the pit with the others.', 'The earth would not take you.'],
  zones: [
    { id: 'pit', name: 'The Corpse Pit', rects: [[-9, -78, 9, -62]], floor: 'mud' },
    { id: 'cut', name: 'The Gravedigger\u2019s Cut', rects: [[-4, -62, 4, -54]], floor: 'mud', silent: true },
    { id: 'yard', name: 'The Gallows Yard', rects: [[-22, -54, 22, -16], [-3, -16, 3, -12]], floor: 'flag' },
    { id: 'gaol', name: 'The Gaol', rects: [[-56, -37, -22, -31], [-56, -31, -50, -12], [-48, -31, -38, -21], [-46, -43, -26, -37]], floor: 'cell' },
    { id: 'muster', name: 'The Muster Field', rects: [[-58, -12, 48, 30]], floor: 'dirt' },
    { id: 'oss', name: 'The Ossuary', rects: [[22, -30, 34, -26], [34, -42, 56, -14], [42, -14, 46, -12]], floor: 'bone', secret: true },
    { id: 'stair', name: 'The Headsman\u2019s Stair', rects: [[-4, 30, 4, 36]], floor: 'flag', nofloor: true },   // surfaces come from the elevation (steps, landing, top deck)
    { id: 'block', name: 'The Block', circle: [0, 50, 15], floor: 'flag', y: 1.8 },
    { id: 'hgate', name: 'The Hollowwood Gate', rects: [[-4, 64, 4, 74]], floor: 'dirt', y: 1.8 },
  ],
  walls,
  /* walkable elevation (repair step 1). stairs: axis-aligned rect, height runs linearly from y0 at the low edge (z0 for axis z, x0 for
     axis x) to y1 at the high edge (a smooth ramp), drawn as `risers` equal steps; rails: true adds side collision segments.
     platforms: rect [x0,z0,x1,z1] or circle [cx,cz,r] at height y. Every platform / stair edge where the height on the two sides
     differs by more than 0.6 m becomes a ledge collision segment (generated, see A.Ground). decks: visible floor planes at height. */
  elevation: {
    stairs: [
      { id: 'gallows_steps', x0: -1.5, x1: 1.5, z0: -41.05, z1: -38.65, axis: 'z', y0: 0, y1: 1.6, risers: 8, mat: 'wood', rails: true, stringer: 'darkwood' },   // 0.20 m risers, 0.30 m treads, 3.0 m wide
      { id: 'stair_lower', x0: -4, x1: 4, z0: 30, z1: 31.6, axis: 'z', y0: 0, y1: 1.0, risers: 5, mat: 'stone', rails: true },       // 0.20 m risers, 0.32 m treads, 7.1 m clear
      { id: 'stair_upper', x0: -4, x1: 4, z0: 33.72, z1: 35, axis: 'z', y0: 1.0, y1: 1.8, risers: 4, mat: 'stone', rails: true },    // 0.20 m risers, 0.32 m treads
    ],
    platforms: [
      { id: 'gallows', rect: [-6.15, -38.65, 6.15, -33.35], y: 1.6 },                 // the Long Gallows deck (drawn by the gallows prop)
      { id: 'stair_landing', rect: [-4, 31.6, 4, 33.72], y: 1.0, deck: 'stone' },     // landing (Stair Lantern)
      { id: 'block', circle: [0, 50, 15], y: 1.8 },                                    // the Block, raised above the Muster Field
      { id: 'block_approach', rect: [-4, 35, 4, 74], y: 1.8 },                         // stair head + Hollowwood Gate passage
    ],
    decks: [ { rect: [-4, 35, 4, 36.8], y: 1.8, mat: 'flag' } ],                       // stair head (the Block's round floor starts behind it)
  },
  gates: [
    { id: 'yardgate', kind: 'portcullis', a: [-3, -16], b: [3, -16], how: 'lever:yardlever', locked: 'Barred from the far side.' },
    { id: 'gaoldoor', kind: 'door', a: [-56, -12], b: [-50, -12], how: 'item:gaolkey', locked: 'Locked. It needs the Gaol Key \u2014 Sergeant Brask carries it on his belt, by the fire in the Gaol office.', prompt: 'Unlock with the Gaol Key' },
    { id: 'ossgate', kind: 'iron', a: [42, -13], b: [46, -13], how: 'side', side: [44, -16], locked: 'Rusted shut. It opens from the other side.', prompt: 'Lift the bar' },
    { id: 'bossfog', kind: 'fog', a: [-4, 36], b: [4, 36], how: 'boss', startOpen: true },
    { id: 'hollowgate', kind: 'great', a: [-4, 70], b: [4, 70], how: 'item:headkey', locked: 'A great gate, chained. It needs the Headsman\u2019s Key \u2014 Odran Vale wears it on his belt, on the Block.', prompt: 'Open the Hollowwood Gate', ends: true },
  ],
  levers: [ { id: 'yardlever', x: 4.6, z: -10.2, rot: Math.PI, opens: 'yardgate', prompt: 'Pull the lever' } ],
  lanterns: [
    { id: 'grave', name: 'Gravedigger\u2019s Lantern', x: 0, z: -57.5 },
    { id: 'gaol', name: 'Gaol Lantern', x: -52.6, z: -19.5 },
    { id: 'stair', name: 'Stair Lantern', x: 2.2, z: 33, spawn: [-0.6, 32.7] },   // stands on the landing; you wake beside it
  ],
  enemies: [   // chunk B: field roster cut 16 -> 11 (removed redundant grunts y4, g2, m3, m4, o2; every tut / drop / elite / boss kept)
    { id: 'y1', type: 'gaoler', x: 0, z: -48.5, face: 0, tut: 'stealth' },
    { id: 'y2', type: 'gaoler', x: -9, z: -42, patrol: [[-9, -42], [9, -42], [9, -29], [-9, -29]], tut: 'deflect' },
    { id: 'y3', type: 'gaoler', x: -15, z: -30, face: Math.PI / 2 },
    { id: 'g1', type: 'jailer', x: -28, z: -34, patrol: [[-28, -34], [-44, -34]], tut: 'thrust' },
    { id: 'g3', type: 'sergeant', x: -43, z: -25.5, face: Math.PI, drop: 'gaolkey', elite: true },
    { id: 'g5', type: 'jailer', x: -53, z: -27, patrol: [[-53, -30], [-53, -24]] },
    { id: 'm1', type: 'brute', x: 18, z: 6, patrol: [[18, 6], [34, 6], [34, 14], [18, 14]], drop: 'cagekey', tut: 'sweep', elite: true },
    { id: 'm2', type: 'gaoler', x: -34, z: 4, face: Math.PI * 0.85 },
    { id: 'm5', type: 'gaoler', x: -3, z: 24, face: Math.PI },
    { id: 'm6', type: 'jailer', x: -8, z: 0, patrol: [[-8, 0], [-8, 16], [4, 16], [4, 0]] },
    { id: 'o1', type: 'jailer', x: 38, z: -36, face: Math.PI / 2 },
    { id: 'sallow', type: 'sallow', x: 47, z: -30, face: -Math.PI / 2, boss: 'mini', reward: 'tithe', card: ['BROTHER SALLOW', 'The Smiling Penitent'], bark: 'You. The Vein spat you out. Kneel, and let me offer you again.' },
    { id: 'odran', type: 'odran', x: 0, z: 55, face: Math.PI, boss: 'region', arena: { x: 0, z: 50, r: 12.5, gate: 'bossfog' }, reward: 'yoke', drop: 'headkey', card: ['ODRAN VALE', 'The Iron Warden \u2014 he tied the rope himself'] },
  ],
  npcs: [
    { id: 'tamsin', x: -5.2, z: -67, face: Math.PI / 2 },
    { id: 'ilsabet', x: 26, z: 22, face: Math.PI, if: '!flag:crane_freed' },
    { id: 'ilsabet_wait', x: 7.2, z: 26.2, face: -Math.PI / 2, if: 'flag:crane_waiting&!flag:crane_block_seen' },   // chunk G3: shadow under the east Stair tower
    { id: 'ilsabet_gate', x: 2.6, z: 66, face: -Math.PI / 2, if: 'flag:crane_gate' },
  ],
  pickups: [
    { id: 'sword', x: 3.55, z: -72.35, model: { kind: 'sword', upright: true, tilt: 0.26, scale: 1.12, x: 3.72, z: -72.78, ry: -0.75 },   /* chunk A2: planted upright in the mud beside the cart (reads from 6 m) */ weapon: 'wardblade', prompt: 'Take your sword', do: [['quest', 'main', 2, 'max']], card: ['WARD\u2019S BLADE', 'Your own sword'] },
    { id: 'tag_pell', x: -40, z: -41.4, model: { kind: 'tag', x: -40, z: -41.4, ry: 0.6 }, item: 'name_pell', prompt: 'Pick up the name-tag', namesTag: true },
    { id: 'tag_ilke', x: 50.2, z: -40.2, model: { kind: 'tag', x: 50.2, z: -40.2, ry: -0.3 }, item: 'name_ilke', prompt: 'Pick up the name-tag', namesTag: true },
    { id: 'tag_jory', x: 44, z: 26, model: { kind: 'tag', x: 44.2, z: 26.9, ry: 1.2 }, item: 'name_jory', prompt: 'Pick up the name-tag', namesTag: true },
    { id: 'tithe_altar', x: 53.5, z: -28, model: { kind: 'tithe', x: 53.6, z: -27.9, y: 1.06, ry: 0.3 }, upgrade: 'tithe', prompt: 'Take the Penitent\u2019s Tithe', if: 'dead:sallow', card: ['PENITENT\u2019S TITHE', 'Deathblows restore health'] },
  ],
  notes: [
    { id: 'order', x: -3.3, z: -63.5, lore: 'order', prompt: 'Read the order on the body' },   // chunk C: the first clue to the Gaol Key
    { id: 'writ', x: -1.6, z: -39.3, lore: 'writ', prompt: 'Read the writ nailed to the gallows' },
    { id: 'tally', x: -46.5, z: -23, lore: 'tally', prompt: 'Read the ledger' },
    { id: 'hymn', x: 35.1, z: -40.5, lore: 'hymn', prompt: 'Read the carving' },
    { id: 'roll', x: -24, z: 1.5, lore: 'roll', prompt: 'Read the muster roll' },
    { id: 'confession', x: 0, z: 59.5, lore: 'confession', prompt: 'Read the headsman\u2019s papers', if: 'dead:odran' },
  ],
  hints: [   // tutorial woven into the world: shown once each, when the condition holds and the player is near
    { id: 'h_move', x: 0, z: -73, r: 6, text: 'WASD move \u00b7 Shift sprint \u00b7 mouse looks (click the screen to capture it) \u00b7 Space jump \u00b7 C dash \u00b7 E interact' },
    { id: 'h_order', x: -3.3, z: -63.5, r: 3.6, text: 'An order is nailed above a body. E to read it.', if: '!flag:clue_gaolkey' },
    { id: 'h_lantern', x: 0, z: -59, r: 4, text: 'Vigil Lanterns: rest to heal and refill Draughts. Resting also wakes the fallen gaolers.', if: '!flag:lit_grave' },
    { id: 'h_breach', x: 20, z: -28, r: 4, text: 'Low rubble can be vaulted: run at it and jump (Space).' },
    { id: 'h_pen', x: 36, z: 22, r: 4, text: 'The wagons are low enough to vault (Space).' },
    { id: 'h_lock', x: 0, z: -46, r: 6, text: 'Q locks on to a foe. F: tap as the blade lands to deflect; hold to guard. Right click: heavy.', if: 'has:wardblade' },
  ],
  props: [
    // Corpse Pit
    { t: 'cart', x: 5, z: -73.5, rot: 0.3, corpse: true },   // chunk G2: the 11 randomly scattered bodies are gone; every pit body below is placed and posed
    { t: 'corpse', pose: 'supine', x: -2.2, z: -71.4, rot: 1.1, prio: 3, check: true }, { t: 'corpse', pose: 'side', x: 1.6, z: -68.6, rot: -0.7, prio: 3, check: true },
    { t: 'corpse', pose: 'prone', x: -3.1, z: -66.6, rot: 2.6, prio: 3, check: true }, { t: 'corpse', pose: 'supine', x: 3.4, z: -65.6, rot: -2.2, prio: 3, check: true },
    { t: 'corpse', pose: 'slump', x: -8.15, z: -69.6, rot: Math.PI / 2 }, { t: 'corpse', pose: 'slump', x: 8.15, z: -68.4, rot: -Math.PI / 2 },   // slumped against the pit walls
    { t: 'graves', x: -6, z: -75, n: 6 }, { t: 'shovel', x: -6.2, z: -68.3 }, { t: 'corpse', pose: 'prone', x: -2.6, z: -63.2, rot: 0.4, prio: 2 }, { t: 'notice', x: -3.3, z: -63.5, rot: 0.4 }, { t: 'lamp', x: -7.6, z: -66.5 }, { t: 'deadtree', x: 7.5, z: -64, h: 7 },
    { t: 'dress', set: 'pit', x: 0, z: -70, ground: false },   // chunk A2: personal effects, cut nooses, lime bucket, a crow on a grave marker
    // Gallows Yard
    { t: 'gallows', x: 0, z: -36, ground: false }, { t: 'dress', set: 'gallows', x: 0, z: -36, ground: false }, { t: 'corpse', pose: 'slump', x: -3.9, z: -38.7, rot: Math.PI, prio: 3 }, { t: 'stand', x: 14, z: -20.5 }, { t: 'block_small', x: -10, z: -46 }, { t: 'crates', x: -18, z: -50, n: 4 }, { t: 'crates', x: 18, z: -45, n: 3 },
    { t: 'torch', x: -20.6, z: -44 }, { t: 'torch', x: 20.6, z: -44 }, { t: 'torch', x: -20.6, z: -24 }, { t: 'torch', x: 20.6, z: -20 }, { t: 'torch', x: -3.8, z: -17.2 }, { t: 'torch', x: 3.8, z: -17.2 },
    { t: 'banner', x: -10, z: -16.6, rot: Math.PI }, { t: 'banner', x: 10, z: -16.6, rot: Math.PI }, { t: 'rubble', x: 23, z: -28 },
    { t: 'tower', x: -24, z: -56, h: 13 }, { t: 'tower', x: 24, z: -56, h: 12 }, { t: 'tower', x: -24, z: -14, h: 14 }, { t: 'tower', x: 24, z: -14, h: 12 },
    // Gaol
    { t: 'torch', x: -30, z: -31.6 }, { t: 'torch', x: -46.5, z: -36.4 }, { t: 'torch', x: -50.6, z: -20 }, { t: 'torch', x: -43, z: -21.6 },
    { t: 'desk', x: -46, z: -24 }, { t: 'brazier', x: -40.8, z: -23.4 }, { t: 'rack', x: -39, z: -29 },   // the Gaol fire (the sergeant drinks by it) { t: 'cellstuff', x: -36, z: -40 }, { t: 'cellstuff', x: -28, z: -41 }, { t: 'brokenbars', x: -40.5, z: -37 },
    { t: 'tower', x: -53, z: -40, h: 16 },
    // Muster Field
    { t: 'tent', x: -42, z: 6, rot: 0.1 }, { t: 'tent', x: -42, z: 18, rot: -0.1 }, { t: 'tent', x: -28, z: 22, rot: 1.6 }, { t: 'tent', x: -18, z: 6, rot: 1.4 }, { t: 'tent', x: 14, z: 24, rot: 1.5 },
    { t: 'desk', x: -24, z: 1.2 }, { t: 'brazier', x: -30, z: 10 }, { t: 'brazier', x: -6, z: 8 }, { t: 'brazier', x: 22, z: 10 }, { t: 'brazier', x: -12, z: 26 }, { t: 'brazier', x: 12, z: 26 },
    { t: 'dummy', x: -2, z: -4 }, { t: 'dummy', x: 2, z: -6 }, { t: 'rack', x: 6, z: -6 }, { t: 'cage', x: 26, z: 22 }, { t: 'wagon', x: 42, z: 20, rot: 0 }, { t: 'wagon', x: 38, z: 25, rot: Math.PI / 2 },
    { t: 'crates', x: 44, z: 28, n: 3 }, { t: 'crates', x: -54, z: 26, n: 5 }, { t: 'crates', x: 30, z: -8, n: 4 }, { t: 'barrels', x: -48, z: -8, n: 5 }, { t: 'barrels', x: 10, z: 28, n: 3 },
    { t: 'gibbets', x: -54, z: 0 }, { t: 'gibbets', x: -54, z: 12 }, { t: 'deadtree', x: 30, z: 0, h: 8 }, { t: 'deadtree', x: -50, z: 22, h: 9 },
    { t: 'leverhouse', x: 6, z: -9.6 }, { t: 'banner', x: -8, z: 29.4, rot: 0 }, { t: 'banner', x: 8, z: 29.4, rot: 0 },
    { t: 'tower', x: -6, z: 31, h: 15 }, { t: 'tower', x: 6, z: 31, h: 15 },
    // Ossuary (chunk WORLD: floor candles moved off Sallow's spot at (47,-30) to the altar's north-west corner, the altar candles out of the altar block to its foot, the torch out of the middle of the doorway to the wall beside it)
    { t: 'bonepile', x: 52, z: -38 }, { t: 'bonepile', x: 37, z: -17 }, { t: 'bonepile', x: 54, z: -17 }, { t: 'candles', x: 51.4, z: -24.6 }, { t: 'candles', x: 52.75, z: -28.7, s: 0.5 }, { t: 'altar', x: 54, z: -28 },
    { t: 'belltower', x: 52, z: -46 }, { t: 'torch', x: 34.8, z: -31.1 }, { t: 'skullwall', x: 45, z: -41.5 },
    // The Block (boss) + Hollowwood
    { t: 'greatblock', x: 0, z: 50 }, { t: 'wallbanners', x: 0, z: 50, a: [1.25, -1.25, 1.85, -1.85, 2.45, -2.45] }, { t: 'statue', x: -9, z: 59 }, { t: 'statue', x: 9, z: 59 }, { t: 'torch', x: -11, z: 41 }, { t: 'torch', x: 11, z: 41 }, { t: 'torch', x: -3.6, z: 63 }, { t: 'torch', x: 3.6, z: 63 },
    { t: 'papers', x: 0, z: 59.5 }, { t: 'carving', x: 34.52, z: -40.5 }, { t: 'greatgate', x: 0, z: 70 }, { t: 'pines', x: 0, z: 82, n: 24, r: 18 },
  ],
  landmarks: [   // compass marks, revealed when their zone is first entered
    { id: 'gallows', name: 'Long Gallows', x: 0, z: -36, zone: 'yard' }, { id: 'gaol', name: 'Gaol Tower', x: -53, z: -40, zone: 'yard' },
    { id: 'stairtowers', name: 'Headsman\u2019s Stair', x: 0, z: 31, zone: 'muster' }, { id: 'bell', name: 'Ossuary Bell', x: 52, z: -46, zone: 'oss' },
    { id: 'hollow', name: 'Hollowwood', x: 0, z: 76, zone: 'block' },
  ],
  objectiveMarks: { 0: [-5, -67], 1: [5, -73], 2: [0, -57.5], 3: [-22, -34], 4: [-43, -25], 5: [0, 33], 6: [0, 50], 7: [0, 70] },
};
})();
