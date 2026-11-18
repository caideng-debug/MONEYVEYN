/* =====================================================================
   VEYNHOLD — game content (data only). Phase 2 adds entries here; the engine (src/world.js) reads them.
   - BESTIARY: field archetypes + named foes, registered into VEYN_CORE.PROFILES (additive; core.js untouched).
     Every archetype uses EXISTING core attacks, so all deflect / posture / perilous timings are the locked v8 values.
   - ITEMS, WEAPONS, UPGRADES, QUESTS, LORE, DIALOGUE, NPCS.
   Conditions (strings): 'flag:x' '!flag:x' 'has:item' 'has:item:3' 'q:main>=3' 'q:names==2' 'up:yoke' 'dead:odran'  (joined with '&')
   Actions (arrays): ['flag',k] ['unflag',k] ['quest',id,stage] ['give',item,n] ['take',item,n] ['upgrade',id] ['open',gateId]
                     ['card',title,sub] ['toast',text] ['lore',id] ['sfx',name] ['heal'] ['save']
   ===================================================================== */
(function () {
'use strict';
const S = (k, tempo, hold, gap) => ({ k, tempo: tempo || 1, hold: hold || 0, gap: gap || 0 });

/* ---------- BESTIARY ---------- */
const BESTIARY = {
  // Basic yard guard: short honest strings, the occasional overhead and one delayed beat. Teaches the deflect rhythm.
  gaoler: { name: 'Gallows Gaoler', hp: 70, postureMax: 80, radius: .45, speed: 3.2, postureRegen: 10, postureRegenDelay: 1.7,
    marks: 1, lightPostureResist: 1, guardChance: .35, deflectSkill: .12, aggression: .48, preferDist: 2.6, jitter: .12, footwork: .2,
    combos: [ { c: ['d_slash'], w: 3 }, { c: ['d_slash', S('d_slash2', .9)], w: 2.2 }, { c: ['d_over'], w: 1.2 },
      { c: ['d_slash', S('d_delay', 1, .15)], w: .8, tag: 'delayed' } ],
    counter: 'd_slash', look: 'duelist' },
  // Cowled jailer of the Penitent order: thrusts (perilous) and feints. Teaches Counterstep.
  jailer: { name: 'Penitent Jailer', hp: 75, postureMax: 90, radius: .43, speed: 3.6, postureRegen: 11, postureRegenDelay: 1.5,
    marks: 1, lightPostureResist: 1, guardChance: .45, deflectSkill: .2, aggression: .55, preferDist: 2.9, jitter: .16, footwork: .45,
    combos: [ { c: ['f_quick', 'f_quick2'], w: 2.4 }, { c: ['d_thrust'], w: 1.6, tag: 'lunge' }, { c: ['f_feint', 'f_quick'], w: 1.2, tag: 'feint' },
      { c: ['f_quick', S('d_thrust', 1, .1)], w: 1.1 }, { c: ['f_delay'], w: .7, tag: 'delayed' } ],
    counter: 'f_quick', look: 'brother' },
  // Heavy chain-gaoler: slow swings, perilous sweep (jump) and grab (dodge). No super-armor (that is the Warden's).
  brute: { name: 'Chain Gaoler', hp: 130, postureMax: 150, radius: .6, speed: 2.6, postureRegen: 8, postureRegenDelay: 2.0,
    marks: 1, lightPostureResist: .7, guardChance: .2, deflectSkill: .05, aggression: .45, preferDist: 3.0, jitter: .1, footwork: .1,
    combos: [ { c: ['w_swing'], w: 3, br: { dodged: ['w_sweep'] } }, { c: ['w_sweep'], w: 1.4 }, { c: ['w_grab'], w: 1.1, tag: 'grab' },
      { c: ['w_shove', 'w_slam'], w: 1.2 }, { c: ['w_swing', S('w_swing', .85)], w: 1 } ],
    counter: 'w_shove', look: 'warden' },
  // Gaol Sergeant: a lesser duelist; carries the Gaol Key.
  sergeant: { name: 'Gaol Sergeant Brask', hp: 110, postureMax: 120, radius: .45, speed: 3.5, postureRegen: 11, postureRegenDelay: 1.6,
    marks: 1, lightPostureResist: 1, guardChance: .55, deflectSkill: .28, aggression: .55, preferDist: 2.6, jitter: .12, footwork: .3,
    combos: [ { c: ['d_slash', 'd_slash2'], w: 3, br: { deflected: ['d_thrust'] } }, { c: ['d_slash', S('d_slash2', .85), S('d_over', 1, .15)], w: 1.6, br: { dodged: ['d_sweep'] } },
      { c: ['d_over'], w: 1.2 }, { c: ['d_thrust'], w: .9, tag: 'lunge' }, { c: ['d_slash', S('d_delay', 1, .15)], w: 1, tag: 'delayed' } ],
    counter: 'd_counter', look: 'duelist' },
};
// Named foes built on the locked v8 duelists (copied, renamed; attacks and timings unchanged).
function namedFoes(P) {
  return {
    sallow: Object.assign({}, P.brother, { name: 'Brother Sallow, the Smiling Penitent', hp: 130 }),
    odran: Object.assign({}, P.warden, { name: 'Odran Vale, the Iron Warden', hp: 210, marks: 2, boss: true,
      phase2: { aggression: .62, postureRegenMult: 1.4, footwork: .25, branchChance: .85,
        combos: [ { c: ['w_swing', S('w_slam', 1, .2)], w: 2 }, { c: ['w_swing', S('w_swing', .8), 'w_grab'], w: 1.4, tag: 'mixup' },
          { c: ['w_charge'], w: 1.2, tag: 'lunge' }, { c: ['w_shove', 'w_slam'], w: 1.2 }, { c: ['w_sweep', S('w_swing', 1, .15)], w: 1.3 },
          { c: ['w_swing'], w: 1.6, br: { dodged: ['w_sweep'], backoff: ['w_charge'] } }, { c: ['w_grab'], w: .9, tag: 'grab' } ] } }),
  };
}

/* ---------- ITEMS ---------- */
const ITEMS = {
  draught:   { name: 'Lantern Draught', kind: 'consumable', desc: 'Warm lamp-oil and wine, blessed by no one. Restores 40% health. Refilled at every Vigil Lantern.' },
  gaolkey:   { name: 'Gaol Key', kind: 'key', use: 'Opens the gaol door', where: 'Sergeant Brask, the Gaol office', desc: 'Heavy iron, greasy with handling. Opens the north door of the Gaol.' },
  cagekey:   { name: 'Gibbet Key', kind: 'key', use: 'Opens the gibbet cage', where: 'the Chain Gaoler, Muster Field', desc: 'A small key on a chain gaoler\u2019s ring. Fits the hanging cage on the Muster Field.' },
  headkey:   { name: 'Headsman\u2019s Key', kind: 'key', use: 'Opens the Hollowwood Gate', where: 'Odran Vale, on the Block', desc: 'Worn on Odran Vale\u2019s belt for forty years. Opens the Hollowwood Gate.' },
  name_pell: { name: 'Name-tag: Pell Arden', kind: 'quest', desc: 'A strip of tin, scratched by hand: PELL ARDEN, 14. Taken from a body before burial.' },
  name_ilke: { name: 'Name-tag: Ilke of the Ash', kind: 'quest', desc: 'Tin, stamped with the Abbey\u2019s ash-wheel: ILKE, NOVICE. The stamp has been struck through.' },
  name_jory: { name: 'Name-tag: Jory Ferrow', kind: 'quest', desc: 'Tin, bent double: JORY FERROW, LEVY OF THE MARCH. Someone kept it a long time.' },
  feather:   { name: 'Crane Feather', kind: 'keepsake', desc: 'A grey feather tied with red thread. Ilsabet Crane\u2019s mark. Her company will know it.' },
};
/* ---------- WEAPONS (Phase 1 implements the Ward's Blade; the rest are designed for Phase 2, see docs/world_plan.md) ---------- */
const WEAPONS = {
  wardblade: { name: 'Ward\u2019s Blade', moveset: 'sword', region: 'execution', implemented: true,
    desc: 'Your own sword, taken from you at the gallows and dumped on the corpse cart. Balanced, honest steel: the full four-hit chain, charged thrust, riposte and air plunge. It will carry you to the throne.' },
  hooks:     { name: 'Huntsman\u2019s Hooks', moveset: 'hooks', region: 'hollowwood', implemented: false, desc: 'Twin hook-blades. Fast, short, low posture damage; hooked strikes drag a guarding foe off balance.' },
  halberd:   { name: 'Tide Halberd', moveset: 'halberd', region: 'drowned', implemented: false, desc: 'Long reach and wide sweeps; slow recovery. Heavy strikes break posture from beyond sword range.' },
  censer:    { name: 'Ash Censer', moveset: 'censer', region: 'abbey', implemented: false, desc: 'A chained iron censer. Unblockable smoldering swings that keep posture from recovering.' },
  lantern:   { name: 'Lanternfall', moveset: 'greatsword', region: 'crownlands', implemented: false, desc: 'The King\u2019s old blade. Charged strikes release a travelling wave of light.' },
};
/* ---------- UPGRADES (4-7 meaningful, permanent, no grinding). Phase 1 implements the three found in the Execution Grounds. ---------- */
const UPGRADES = {
  vessel: { name: 'Ember Vessel', region: 'execution', implemented: true, desc: '+1 Lantern Draught. A soldier\u2019s lamp-flask that burned through a whole war.' },
  tithe:  { name: 'Penitent\u2019s Tithe', region: 'execution', implemented: true, desc: 'Each deathblow restores 15% of your health. The Penitents believed the dying owe the living.' },
  yoke:   { name: 'Warden\u2019s Yoke', region: 'execution', implemented: true, desc: '+20% maximum posture. The headsman\u2019s iron collar, worn so his arms never shook.' },
  heart:  { name: 'Heartwood Sap', region: 'hollowwood', implemented: false, desc: '+20 maximum health.' },
  bell:   { name: 'Drowned Bell', region: 'drowned', implemented: false, desc: 'Posture recovers 40% faster while guarding.' },
  rite:   { name: 'Rite of Ash', region: 'abbey', implemented: false, desc: 'Lantern Draughts heal more and clear half your posture.' },
};

/* ---------- QUESTS ---------- */
const QUESTS = {
  main: { name: 'The Rope That Broke', kind: 'main', stages: [
    'Find your feet. Someone is digging nearby.',
    'Recover your blade from the corpse cart.',
    'Kindle the Vigil Lantern at the top of the cut.',
    'Find a way out of the Execution Grounds.',
    'The sergeant by the gaol carries the key.',
    'Cross the Muster Field and climb the Headsman\u2019s Stair, north.',
    'Defeat Odran Vale, the Iron Warden.',
    'Open the Hollowwood Gate.',
    'The road to Hollowwood lies open. (To be continued.)' ] },
  names: { name: 'Names for the Dead', kind: 'side', giver: 'Tamsin', stages: [
    'Tamsin buries the hanged without names. Find the three tin name-tags the gaolers took (0/3).',
    'Name-tags found: 1/3.', 'Name-tags found: 2/3.', 'All three name-tags found. Bring them to Tamsin in the Corpse Pit.',
    'Tamsin has the names. The dead can be mourned.' ] },
  crane: { name: 'The Caged Crane', kind: 'side', giver: 'Ilsabet', stages: [
    'A prisoner hangs in a gibbet cage on the Muster Field. The Chain Gaoler carries its key.',
    'You have the Gibbet Key. Return to the cage.',
    'Ilsabet Crane is free. She waits in the shadow under the Headsman\u2019s Stair.',
    'You left Ilsabet in the cage.' ] },
};

/* ---------- LORE (readable) ---------- */
const LORE = {
  order: { title: 'Order of the Watch', text: 'Posted by order of the Warden.\n\nThe north door of the Gaol stays LOCKED from dusk to the hanging bell. No gaoler holds a copy.\n\nThe sergeant keeps the gaol key on his belt \u2014 he drinks by the Gaol fire. Ask him, not me.\n\n\u2014 posted, and then someone hanged the man who posted it.' },
  writ: { title: 'Writ of Execution', text: 'BY THE KING\u2019S MERCY.\n\nWren Aldmoor, Ward of the Lantern Court, for the breaking of sealed ledgers and the carrying of their contents toward the Abbey of Ash.\n\nTo be hanged at first light upon the Long Gallows.\n\nNo oath to be returned to the Vein, for none was sworn.\n\n\u2014 under seal, Aurec, Third of the Name, King of Veynhold' },
  tally: { title: 'Gaoler\u2019s Tally', text: 'Autumn tithe, Long Gallows.\nHanged: 14. Oaths returned: 14.\nHanged: 1 (the Ward). Oath returned: \u2014\n\nThe stones did not drink. Odran says do not write that down. I am writing it down.\n\u2014 B.' },
  hymn: { title: 'Penitent\u2019s Hymn', text: 'Beneath the hold the red vein runs,\nit drinks the word of fathers\u2019 sons.\nSwear, and it keeps you. Die, and it keeps you still.\nOnly the oathless walk out of the hill.' },
  roll: { title: 'Muster Roll \u2014 The Hollow Levy', text: 'Levy of the Drowned March, ninth draft.\nSworn at the oathstone: 212. Marched: 212. Returned: 0.\n\nCaptain Crane (Cranes, free company) refused the crossing at Saltmere and is held for desertion pending the Warden\u2019s pleasure.' },
  confession: { title: 'The Headsman\u2019s Confession', text: 'Forty years I tied the knots myself. A rope of mine has never broken.\n\nYours did not break. I watched it. You hung, and you were dead, and the stones under the gallows turned red as they always do \u2014 and then they spat. Like a throat refusing.\n\nThe King watched it too. He did not look surprised. He looked like a man who had been proven right.\n\u2014 O.V.' },
};

/* ---------- NPCS ---------- */
const NPCS = {
  tamsin:  { name: 'Tamsin Ferrow', title: 'Gravedigger of the Grounds', look: 'brother', blade: false, talk: [
    { if: 'q:names==4', dlg: 'tamsin_after' },
    { if: 'q:names==3', dlg: 'tamsin_return' },
    { if: 'flag:met_tamsin', dlg: 'tamsin_again' },
    { dlg: 'tamsin_first' } ] },
  ilsabet: { name: 'Ilsabet Crane', title: 'Captain of the Cranes', look: 'duelist', blade: false, caged: true, talk: [   // chunk G3: no fading exit; the "Cage" scene and a visible walk to the Stair replace it
    { if: 'flag:crane_freed', dlg: 'ilsabet_free' },
    { if: 'has:cagekey', dlg: 'ilsabet_key' },
    { if: 'flag:met_ilsabet', dlg: 'ilsabet_again' },
    { dlg: 'ilsabet_first' } ] },
  ilsabet_wait: { name: 'Ilsabet Crane', title: 'Captain of the Cranes', look: 'duelist', blade: false, talk: [ { dlg: 'ilsabet_wait' } ] },   // chunk G3: in the shadow under the Headsman's Stair until Odran falls
  ilsabet_gate: { name: 'Ilsabet Crane', title: 'Captain of the Cranes', look: 'duelist', blade: true, talk: [ { dlg: 'ilsabet_gate' } ] },
};

/* ---------- DIALOGUE ---------- */
const DIALOGUE = {
  tamsin_first: { start: 'a', nodes: {
    a: { who: 'Tamsin', text: 'Stay down, stay down \u2014 oh, gods. You\u2019re breathing. You were on my cart an hour ago with your neck the wrong shape.', next: 'b' },
    b: { who: 'Tamsin', text: 'Thirty years I\u2019ve dug for the Long Gallows. Nobody climbs out of my pit. The earth here takes them. It always takes them.', choices: [
      { text: 'Where am I?', next: 'where' }, { text: 'Why didn\u2019t it take me?', next: 'why' }, { text: 'I need to get out.', next: 'out' } ] },
    where: { who: 'Tamsin', text: 'The Execution Grounds. The King\u2019s own killing-yard. He watched you swing at dawn, then rode back to the Crownlands. His headsman stayed. Odran always stays.', next: 'b2' },
    why: { who: 'Tamsin', text: 'I don\u2019t know. The stones under the gallows go red when a body drops \u2014 everybody pretends not to see it. Yours went red, then black. Like the ground choked on you.', next: 'b2' },
    out: { who: 'Tamsin', text: 'North. Always north. The Headsman\u2019s Gate opens on the Hollowwood road. But the yard gate is barred from the far side, and the gaolers will cut you down again.', next: 'b2' },
    b2: { who: 'Tamsin', text: 'They threw your things on the cart with you. Sword and all. Take it \u2014 then light the lantern at the top of the cut. It\u2019s a vigil lamp. Rest by it, and you\u2019ll find your feet again, every time.', next: 'c' },
    c: { who: 'Tamsin', text: 'And\u2026 if you\u2019re going through the yard anyway. The gaolers strip the name-tags off the hanged before I bury them. A body with no name can\u2019t be mourned. There are three I never got back.', choices: [
      { text: 'I\u2019ll find them.', next: 'yes', do: [['quest', 'names', 0]] }, { text: 'I can\u2019t promise anything.', next: 'maybe', do: [['quest', 'names', 0]] } ] },
    yes: { who: 'Tamsin', text: 'Bless you, then. Whatever you are.', end: true, do: [['flag', 'met_tamsin'], ['quest', 'main', 1]] },
    maybe: { who: 'Tamsin', text: 'No. Nobody can, here. Go on, before Odran\u2019s dogs come round.', end: true, do: [['flag', 'met_tamsin'], ['quest', 'main', 1]] } } },
  tamsin_again: { start: 'a', nodes: {
    a: { who: 'Tamsin', text: 'Still breathing. Good. Rest at the lantern if they cut you. The pit keeps the dead, but the lamp keeps you.', choices: [
      { text: 'Tell me about the King.', next: 'king' }, { text: 'Tell me about Odran.', next: 'odran' }, { text: 'About the name-tags\u2026', next: 'names', if: 'q:names<3' }, { text: 'Goodbye.', next: 'bye' } ] },
    king: { who: 'Tamsin', text: 'Aurec the Lantern King. Ended the Long Hunger before I was born, and he\u2019s ruled ever since. Seventy-one years, and he still sits a horse like a young man. People call that a blessing.', next: 'a2' },
    a2: { who: 'Tamsin', text: 'You were his Ward, weren\u2019t you? Raised in the Lantern Court. They read it out at the hanging. I thought, that poor child, even the King\u2019s love won\u2019t save them.', next: 'a' },
    odran: { who: 'Tamsin', text: 'The Iron Warden. Headsman forty years. He ties every knot himself and he never misses a hanging. Waits up the Headsman\u2019s Stair by the great block. He\u2019ll know you\u2019re loose by now.', next: 'a' },
    names: { who: 'Tamsin', text: 'Three tins. Pell, a boy who stole from the King\u2019s granary. A novice from the Abbey \u2014 I never heard her name. And one from the March levy. The gaolers keep them like trophies \u2014 in the Gaol, I\u2019d wager, and wherever the Penitents pray.', next: 'a' },
    bye: { who: 'Tamsin', text: 'Go careful.', end: true } } },
  tamsin_return: { start: 'a', nodes: {
    a: { who: 'Tamsin', text: 'You found them? All three? Give them here, let me see\u2026', next: 'b' },
    b: { who: 'Tamsin', text: 'Pell Arden. Fourteen. And the novice \u2014 Ilke. Ilke of the Ash. I\u2019ll cut it into the post so she\u2019s not forgotten.', next: 'c' },
    c: { who: 'Tamsin', text: '\u2026', next: 'd' },
    d: { who: 'Tamsin', text: 'Jory. Jory Ferrow. That\u2019s \u2014 that\u2019s my boy. They told me he drowned in the March with the levy. They told me there was no body to bury.', next: 'e' },
    e: { who: 'Tamsin', text: 'I buried him. I must have. I bury all of them, and I never look at their faces any more. Thirty years, and I buried my own son without a name.', choices: [
      { text: 'I\u2019m sorry, Tamsin.', next: 'f' }, { text: 'Now you know where he lies.', next: 'f' } ] },
    f: { who: 'Tamsin', text: 'Here. This was his \u2014 his lamp-flask from the March, they sent it back with the tin. It burned through a whole war. Let it burn for something now.', end: true,
      do: [['take', 'name_pell', 1], ['take', 'name_ilke', 1], ['take', 'name_jory', 1], ['upgrade', 'vessel'], ['quest', 'names', 4], ['card', 'EMBER VESSEL', '+1 Lantern Draught']] } } },
  tamsin_after: { start: 'a', nodes: {
    a: { who: 'Tamsin', text: 'Three names on the post now. It\u2019s a small thing. It\u2019s the only thing I had to give them. Go on, Wren. North.', end: true } } },

  ilsabet_first: { start: 'a', nodes: {
    a: { who: 'Ilsabet', text: 'Well. A dead woman walking past a dying one. They said the Ward hanged at dawn. Either the rope was rotten or you\u2019re a ghost with good boots.', choices: [
      { text: 'Who are you?', next: 'who' }, { text: 'Why are you caged?', next: 'why' }, { text: 'I can\u2019t stay.', next: 'bye' } ] },
    who: { who: 'Ilsabet', text: 'Ilsabet Crane. Captain of the Cranes \u2014 free company, out of the Drowned March. What\u2019s left of it.', next: 'a2' },
    why: { who: 'Ilsabet', text: 'Desertion. They marched the ninth levy into the floodlands at Saltmere \u2014 two hundred farm boys sworn at the oathstone that morning. There was no enemy across the water. There was only the water. I turned my company around. That\u2019s my crime.', next: 'a2' },
    a2: { who: 'Ilsabet', text: 'The big brute with the chains carries the key to this cage. I\u2019d not ask a stranger to fight him for me. But I\u2019d remember it.', end: true, do: [['flag', 'met_ilsabet'], ['quest', 'crane', 0]] },
    bye: { who: 'Ilsabet', text: 'Nobody can, Ward. Go on.', end: true, do: [['flag', 'met_ilsabet'], ['quest', 'crane', 0]] } } },
  ilsabet_again: { start: 'a', nodes: {
    a: { who: 'Ilsabet', text: 'Still here. Still caged. The Chain Gaoler walks his round by the wagons. Mind the sweep of those chains \u2014 jump them, don\u2019t block them.', end: true } } },
  ilsabet_key: { start: 'a', nodes: {
    a: { who: 'Ilsabet', text: 'That\u2019s his ring. You actually\u2026 hah. Well? Are you opening this, or are you going to make me beg?', choices: [
      { text: 'Unlock the cage.', do: [['scene', 'ilsabet_free']] }, { text: 'Not yet. (Leave her for now)', next: 'later' }, { text: 'You deserted. You stay. (Leave her)', next: 'refuse' } ] },
    later: { who: 'Ilsabet', text: 'Take your time. I\u2019m not going anywhere. Literally.', end: true },
    refuse: { who: 'Ilsabet', text: 'Then you\u2019re the King\u2019s Ward after all. Go on. I hope the rope holds next time.', end: true, do: [['flag', 'crane_refused'], ['quest', 'crane', 3]] } } },
  ilsabet_free: { start: 'a', nodes: {
    a: { who: 'Ilsabet', text: 'Still here? I\u2019m stretching. Then I\u2019m gone. Hollowwood, Ward. Don\u2019t die again before then.', end: true } } },
  ilsabet_wait: { start: 'a', nodes: {
    a: { who: 'Ilsabet', text: 'I\u2019m not climbing that Stair without a blade. Go on, Ward. When the bell stops, I\u2019ll come up.', end: true } } },
  ilsabet_gate: { start: 'b', nodes: {   // chunk G3: the Block scene now says what node a used to
    b: { who: 'Ilsabet', text: 'Beyond that gate the Hollowwood starts. The trees are hollow all the way down, and something drinks from their roots. Find the Unsworn. I\u2019ll be with them.', end: true, do: [['flag', 'crane_gate_talked']] } } },

  odran_dying: { start: 'a', nodes: {
    a: { who: 'Odran Vale', text: 'Forty years\u2026 and the last neck I tied\u2026 is the one that ends me.', next: 'b' },
    b: { who: 'Odran Vale', text: 'It wasn\u2019t the rope, Ward. My knots hold. It was the stones. They drink the oath out of the dying \u2014 every soul sworn in Veynhold goes down into the Vein. You had nothing for them to drink.', next: 'c' },
    c: { who: 'Odran Vale', text: 'He knew. The King knew you\u2019d never sworn. He hanged you anyway. Ask yourself why a man hangs someone he knows will live.', next: 'd' },
    d: { who: 'Odran Vale', text: 'Take my key. Go to the Abbey of Ash\u2026 ask the Abbess\u2026 what an oath weighs.', end: true, do: [['flag', 'odran_spoke']] } } },
};

window.VEYN_DATA = Object.assign(window.VEYN_DATA || {}, { BESTIARY, namedFoes, ITEMS, WEAPONS, UPGRADES, QUESTS, LORE, NPCS, DIALOGUE, S });
})();
