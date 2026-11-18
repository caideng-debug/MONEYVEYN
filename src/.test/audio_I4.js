// chunk I4: audio direction + surfaces.
// Part 1 (real Chromium, OfflineAudioContext, 44.1 kHz): music-bed ducking depth (stingers, impacts, the deathblow Drive / Settle / Extract / clear via
//   A.DBAudio.play), the priority voice limiter (lowest priority stolen first, nothing below the floor admitted, the cap never exceeded, stolen voices
//   go silent), surface footsteps distinguishable, surface resolution at Chapter I sample points, fewer particles on Low.
// Part 2 (jsdom world mode, procedural rig): live foot plants resolve the surface under the fighter (with the cache), a real deathblow runs the
//   DBAudio schedule on the deathblow clock (legacy timeline synced to the finisher's impale / pull-out; blueprint timeline within one sim step of
//   0.05 / 0.32 / 0.70 / 1.15, the clock holds during core hit-stop), the body-land phase fires, the bed duck is released.
// usage: node .test/audio_I4.js
const path = require('path'), fs = require('fs');
const { launch, URL } = require('./t_lib.js');
const res = []; const ok = (n, c, i) => { res.push((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? ' [' + i + ']' : '')); };
const SAMPLES = [   // [label, x, z, expected surface]
  ['Corpse Pit', 0, -70, 'mud'], ['Gravedigger\u2019s Cut', 0, -58, 'mud'], ['Gallows Yard', 12, -45, 'wet_stone'], ['Gallows deck', 0, -36, 'wood'], ['Gallows steps', 0, -40, 'wood'],
  ['Gaol corridor', -30, -34, 'stone'], ['Gaol cells', -32, -40, 'stone'], ['Gaol office', -43, -25, 'wood'], ['Muster Field', -20, 0, 'gravel'], ['Ossuary', 40, -30, 'bone'],
  ['Stair (lower flight)', 0, 30.8, 'wet_stone'], ['Stair landing', 0, 32.5, 'wet_stone'], ['the Block (centre)', 0, 50, 'ash'], ['the Block (edge)', 11, 50, 'wet_stone'],
  ['Block causeway', 0, 60, 'wet_stone'], ['Hollowwood Gate', 0, 68, 'gravel']];
(async () => {
  const out = {};
  // ------------------------------------------------------------------ part 1: Chromium
  const T = await launch(); const { page, ev } = T;
  try {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 300000 });
    await page.waitForFunction(() => window.VEYN_GAME && window.VEYN_GAME.Game.state === 'title', null, { timeout: 300000, polling: 1000 });
    // ---- ducking
    const duck = await ev(async () => {
      const G = window.VEYN_GAME, A = window.VEYN_ADV, au = G.P1.audio, sr = 44100, secs = 6.5, ctx = new OfflineAudioContext(1, sr * secs, sr);
      const save = { ctx: au.ctx, master: au.master, noise: au.noise, musG: au.musG, sfxG: au.sfxG, sends: au.sends, dk: au.dk };
      au.ctx = ctx; au.musG = null; au.sends = {}; au.dkS = { imp: { lv: 1, end: 0 }, st: { lv: 1, end: 0 } }; Object.defineProperty(au, 'ok', { get: () => true, configurable: true });
      au.master = ctx.createGain(); au.master.connect(ctx.destination); const nb = ctx.createBuffer(1, sr, sr); nb.getChannelData(0).fill(0); au.noise = nb;
      au.sfxG = ctx.createGain();   // sfx bus left unconnected: the render is the music bus alone
      const cs = ctx.createConstantSource(); cs.offset.value = 1; cs.connect(au.musBus()); cs.start();
      const at = (t, f) => ctx.suspend(t).then(() => { f(); ctx.resume(); });
      const DB = A.DBAudio; DB.a = null;
      at(0.5, () => au.play('perfect')); at(2.0, () => au.play('hit')); at(2.6, () => au.play('break'));
      at(3.5, () => DB.play('drive')); at(3.54, () => DB.play('impact')); at(3.8, () => DB.play('settle')); at(3.95, () => DB.play('tension')); at(4.2, () => DB.play('extract')); at(4.4, () => DB.play('clear'));
      const b = await ctx.startRendering(); const d = b.getChannelData(0);
      Object.assign(au, save); delete au.ok; DB.hold = false; DB.log.length = 0;
      const lv = t => 20 * Math.log10(Math.max(1e-6, Math.abs(d[Math.min(d.length - 1, Math.floor(t * sr))])));
      const minIn = (t0, t1) => { let m = 1e9, mt = 0; for (let i = Math.floor(t0 * sr); i < Math.floor(t1 * sr); i++) { const v = Math.abs(d[i]); if (v < m) { m = v; mt = i / sr; } } return { db: +(20 * Math.log10(Math.max(1e-6, m))).toFixed(2), t: +mt.toFixed(3) }; };
      const reach = (t0, db, t1) => { const th = Math.pow(10, db / 20); for (let i = Math.floor(t0 * sr); i < Math.floor(t1 * sr); i++) if (Math.abs(d[i]) <= th) return +(i / sr - t0).toFixed(4); return null; };
      const back = (t0, db, t1) => { const th = Math.pow(10, db / 20); for (let i = Math.floor(t0 * sr); i < Math.floor(t1 * sr); i++) if (Math.abs(d[i]) >= th) return +(i / sr - t0).toFixed(3); return null; };
      return { pre: +lv(0.4).toFixed(2), perfect: minIn(0.5, 1.5), perfectAttack6: reach(0.5, -6, 1), perfectBack1: back(0.83, -1, 2), hit: minIn(2.0, 2.4), hitBack1: back(2.06, -1, 2.6), brk: minIn(2.6, 3.4),
        drive: +lv(3.535).toFixed(2), driveAttack10: reach(3.5, -10, 3.7), hold: +lv(3.79).toFixed(2), settle: +lv(3.94).toFixed(2), extract: +lv(4.39).toFixed(2), afterClear: +lv(6.3).toFixed(2), clearBack1: back(4.4, -1, 6.5) };
    });
    out.duck = duck; console.log('duck', JSON.stringify(duck));
    ok('bed at 0 dB before any duck', Math.abs(duck.pre) < 0.05, duck.pre);
    ok('perfect deflect ducks the bed ~9 dB', duck.perfect.db <= -8.5 && duck.perfect.db >= -9.5, duck.perfect.db);
    ok('duck attack is fast (-6 dB inside 25 ms)', duck.perfectAttack6 !== null && duck.perfectAttack6 <= 0.025, duck.perfectAttack6);
    ok('perfect duck recovers to -1 dB within 0.5 s of its hold', duck.perfectBack1 !== null && duck.perfectBack1 <= 0.5, duck.perfectBack1);
    ok('combat impact: short shallow dip (-3 to -5 dB, back within 0.3 s)', duck.hit.db <= -3 && duck.hit.db >= -5 && duck.hitBack1 !== null && duck.hitBack1 <= 0.3, duck.hit.db + ' / ' + duck.hitBack1);
    ok('posture break stinger ducks ~8 dB', duck.brk.db <= -7.5 && duck.brk.db >= -8.6, duck.brk.db);
    ok('deathblow Drive ducks the bed to ~-12 dB (inside 0.1 s)', duck.hold <= -11.5 && duck.driveAttack10 !== null && duck.driveAttack10 <= 0.1, duck.hold + ' / ' + duck.driveAttack10);
    ok('Settle eases the duck to ~-7 dB', duck.settle >= -7.8 && duck.settle <= -6.5, duck.settle);
    ok('Extract ducks to ~-12 dB again', duck.extract <= -11, duck.extract);
    ok('clear releases the bed back to 0 dB', duck.afterClear > -0.3 && duck.clearBack1 !== null && duck.clearBack1 <= 1.2, duck.afterClear + ' / ' + duck.clearBack1);
    // ---- voice limit
    const vl = await ev(async () => {
      const G = window.VEYN_GAME, AS = G.P1.audio.constructor, sr = 44100, ctx = new OfflineAudioContext(1, sr * 3, sr), a = new AS(); a.ctx = ctx; Object.defineProperty(a, 'ok', { get: () => true });
      a.master = ctx.createGain(); a.master.connect(ctx.destination); const nb = ctx.createBuffer(1, sr, sr); const nd = nb.getChannelData(0); let s = 7; for (let i = 0; i < sr; i++) { s = (s * 16807) % 2147483647; nd[i] = s / 1073741823.5 - 1; } a.noise = nb;
      const q0 = G.Settings.quality; G.Settings.quality = 'low'; const cap = a.voiceCap(); const r = { cap, medium: 0, high: 0 };
      G.Settings.quality = 'medium'; r.medium = a.voiceCap(); G.Settings.quality = 'high'; r.high = a.voiceCap(); G.Settings.quality = 'low';
      const S = a.vstats; let maxSeen = 0; const seen = () => { maxSeen = Math.max(maxSeen, a.voices()); };
      a.ctxPrio = 0; for (let i = 0; i < cap; i++) { a.tone(220, 2.8, 'sine', 0.02); seen(); } a.ctxPrio = null;
      r.fullAmbient = a.voices();
      a.play('step_stone'); seen(); r.afterStep = { stolen0: S.stolenBy[0], stolen: S.stolen };
      a.play('perfect'); seen(); r.afterPerfect = { stolen0: S.stolenBy[0], stolen5: S.stolenBy[5] };
      a.play('ui'); seen(); r.afterUi = { stolen0: S.stolenBy[0], dropped: S.dropped };
      const pr = () => a.vpool.filter(v => v.on).map(v => v.p).sort().join('');
      r.mix1 = pr();
      // flood with stinger-priority voices at 880 Hz from t = 1.0 s: every lower voice goes first, then a UI blip is refused
      await new Promise(done => { ctx.suspend(1.0).then(() => { a.ctxPrio = 5; for (let i = 0; i < cap; i++) { a.tone(880, 1.5, 'sine', 0.01); seen(); } a.ctxPrio = null; r.mix2 = pr(); a.play('ui'); r.uiDropped = S.dropBy[2]; a.play('step_gravel'); r.stepDropped = S.dropBy[3]; seen(); ctx.resume(); done(); }); ctx.startRendering().then(b => { r.buf = b; }); });
      while (!r.buf) await new Promise(z => setTimeout(z, 20));
      const d = r.buf.getChannelData(0); delete r.buf;
      const goertzel = (f, t0, t1) => { const k = 2 * Math.cos(2 * Math.PI * f / sr); let s1 = 0, s2 = 0; const i0 = Math.floor(t0 * sr), i1 = Math.floor(t1 * sr); for (let i = i0; i < i1; i++) { const s0 = d[i] + k * s1 - s2; s2 = s1; s1 = s0; } return Math.sqrt(s1 * s1 + s2 * s2 - k * s1 * s2) / (i1 - i0); };
      r.amb220_before = goertzel(220, 0.5, 0.9); r.amb220_after = goertzel(220, 1.1, 1.5); r.sting880_after = goertzel(880, 1.1, 1.5);
      r.maxSeen = maxSeen; r.peak = S.peak; r.stats = JSON.parse(JSON.stringify(S)); G.Settings.quality = q0; return r; });
    out.voices = vl; console.log('voices', JSON.stringify(vl));
    ok('voice caps by tier (Low 24 < Medium 40 < High 56)', vl.cap === 24 && vl.medium === 40 && vl.high === 56, vl.cap + '/' + vl.medium + '/' + vl.high);
    ok('ambient flood fills exactly the Low cap', vl.fullAmbient === vl.cap, vl.fullAmbient);
    ok('a footstep (2 voices) steals 2 ambient voices', vl.afterStep.stolen0 === 2 && vl.afterStep.stolen === 2, JSON.stringify(vl.afterStep));
    ok('a perfect stinger (5 voices) steals ambients, never footsteps', vl.afterPerfect.stolen0 === 7 && vl.stats.stolenBy[3] <= 2 && vl.mix1.indexOf('3') >= 0, JSON.stringify(vl.afterPerfect) + ' ' + vl.mix1);
    ok('the stinger flood removes every lower-priority voice, lowest first', vl.mix2 === '5'.repeat(vl.cap), vl.mix2);
    ok('UI and footsteps are refused while the cap is all stingers', vl.uiDropped >= 1 && vl.stepDropped >= 1, vl.uiDropped + '/' + vl.stepDropped);
    ok('the cap is never exceeded', vl.maxSeen <= vl.cap && vl.peak <= vl.cap, vl.maxSeen + ' / peak ' + vl.peak);
    ok('stolen voices actually go silent (220 Hz ambient bed -40 dB after the flood)', vl.amb220_after < vl.amb220_before * 0.01 && vl.sting880_after > vl.amb220_before * 0.2, [vl.amb220_before, vl.amb220_after, vl.sting880_after].map(x => x.toExponential(2)).join(' '));
    // ---- surfaces: resolution, schema, distinguishable footsteps, Low particles
    const sf = await ev(async (SAMPLES) => {
      const G = window.VEYN_GAME, A = window.VEYN_ADV, D = window.VEYN_DATA, R = D.REGIONS.execution, r = {};
      r.got = SAMPLES.map(s => A.Surf.resolve(R, s[1], s[2]));
      r.schema = Object.values(A.SURFACES).every(s => ['id', 'footstep', 'particle', 'dustAmount', 'wetness', 'frictionMod'].every(k => s[k] !== undefined));
      r.ids = Object.keys(A.SURFACES).sort().join(','); r.regionSurfaces = (R.surfaces || []).slice().sort().join(','); r.zonesTagged = R.zones.every(z => !!A.SURFACES[z.surface]);
      // every zone rect centre resolves to a known surface
      r.zoneCentres = R.zones.map(z => { const c = z.circle ? [z.circle[0], z.circle[1]] : [(z.rects[0][0] + z.rects[0][2]) / 2, (z.rects[0][1] + z.rects[0][3]) / 2]; return z.id + ':' + A.Surf.resolve(R, c[0], c[1]); });
      // footsteps: render each, measure spectral centroid + length
      const AS = G.P1.audio.constructor, sr = 44100, steps = {};
      for (const s of Object.values(A.SURFACES)) { const ctx = new OfflineAudioContext(1, sr * 0.4, sr), a = new AS(); a.ctx = ctx; Object.defineProperty(a, 'ok', { get: () => true });
        a.master = ctx.createGain(); a.master.connect(ctx.destination); const nb = ctx.createBuffer(1, sr, sr); const nd = nb.getChannelData(0); let q = 11; for (let i = 0; i < sr; i++) { q = (q * 16807) % 2147483647; nd[i] = q / 1073741823.5 - 1; } a.noise = nb; a.sendOf = () => null;
        const R0 = Math.random; let rs = 5; Math.random = () => (rs = (rs * 16807) % 2147483647) / 2147483647; try { a.play('step_' + s.footstep); } finally { Math.random = R0; }
        const d = (await ctx.startRendering()).getChannelData(0); let e = 0, pk = 0, last = 0, zc = 0; for (let i = 0; i < d.length; i++) { e += d[i] * d[i]; pk = Math.max(pk, Math.abs(d[i])); }
        for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > pk * 0.01) last = i; for (let i = 1; i <= last; i++) if ((d[i] >= 0) !== (d[i - 1] >= 0)) zc++;
        steps[s.id] = { rms: +Math.sqrt(e / d.length).toExponential(2), peak: +pk.toFixed(4), len: +(last / sr).toFixed(3), zcr: Math.round(zc / Math.max(1e-3, last / sr) / 2) }; }
      r.steps = steps;
      // particles: High vs Low for a mud plant (fixed random)
      const R0 = Math.random; Math.random = () => 0.5; const q0 = G.Settings.quality; const n = {};
      for (const q of ['high', 'medium', 'low']) { G.Settings.quality = q; n[q] = A.Surf.puff(A.SURFACES.mud, 0, -70, 4); }
      G.Settings.quality = q0; Math.random = R0; r.parts = n; return r; }, SAMPLES);
    out.surfaces = sf; console.log('surfaces', JSON.stringify(sf));
    SAMPLES.forEach((s, i) => ok('surface at ' + s[0] + ' (' + s[1] + ', ' + s[2] + ') = ' + s[3], sf.got[i] === s[3], sf.got[i]));
    ok('7 SurfaceDefs with {id, footstep, particle, dustAmount, wetness, frictionMod}', sf.schema && sf.ids === 'ash,bone,gravel,mud,stone,wet_stone,wood', sf.ids);
    ok('Chapter I region lists its surfaces and every zone is tagged', sf.regionSurfaces === sf.ids && sf.zonesTagged, sf.regionSurfaces);
    const st = Object.values(sf.steps); let distinct = true; for (let i = 0; i < st.length; i++) for (let j = i + 1; j < st.length; j++) { const a = st[i], b = st[j]; if (Math.abs(a.len - b.len) < 0.012 && Math.abs(a.zcr - b.zcr) / Math.max(a.zcr, b.zcr) < 0.15) distinct = false; }
    ok('each surface footstep is audible and distinguishable (length or brightness differ)', distinct && st.every(s => s.peak > 0.005), JSON.stringify(sf.steps));
    ok('fewer particles on Low (High > Medium > Low)', sf.parts.high > sf.parts.medium && sf.parts.medium > sf.parts.low, JSON.stringify(sf.parts));
  } catch (e) { ok('chromium part ran', false, e.message); }
  ok('no page errors (Chromium)', T.errors.length === 0, JSON.stringify(T.errors.slice(0, 3)));
  await T.browser.close();
  // ------------------------------------------------------------------ part 2: jsdom world mode
  try {
    const mk = require('./p1h.js'); const FILE = path.join(__dirname, '..', 'dist', 'index.html');
    const src = fs.readFileSync(path.join(__dirname, 'boss.js'), 'utf8'); const save0 = eval('(' + src.match(/const save0 = (\{[\s\S]*?chapterDone: false \})/)[1] + ')'); save0.flags.intro_odran = true;
    const H = mk({ file: FILE, storage: { veynhold_save: JSON.stringify(save0), veynhold_v8: JSON.stringify({ v: 8, seenTutorial: true }) } });
    const { w, G, Game, frames } = H, A = w.VEYN_ADV, C = w.VEYN_CORE; A.BossD.enabled = true; frames(3); w.document.getElementById('advContinue').click(); frames(5);
    await new Promise(r => setTimeout(r, 250));
    const W = Game.world, P = W.player, Surf = A.Surf, DB = A.DBAudio;
    // live foot plants: walk the player on each surface; the step hook resolves the cell under the fighter
    const R1 = w.VEYN_DATA.REGIONS.execution, rec = []; const st0 = Surf.step; Surf.step = function (f, o, play) { const r = st0.call(this, f, o, play); if (f.isPlayer) rec.push([f.x, f.z, r.id]); return r; };
    const walkOn = (x, z) => { P.x = P.px = x; P.z = P.pz = z; rec.length = 0; frames(2); H.key('KeyW', true); frames(70); H.key('KeyW', false); frames(10);
      return { steps: rec.length, first: rec[0] && rec[0][2], allMatch: rec.every(r => r[2] === Surf.resolve(R1, r[0], r[1])), end: [+P.x.toFixed(1), +P.z.toFixed(1)] }; };
    const live = {}; for (const [lab, x, z, want] of [['pit', 0, -72, 'mud'], ['yard', 12, -48, 'wet_stone'], ['muster', -20, -6, 'gravel'], ['gaol', -32, -34, 'stone'], ['ossuary', 45, -28, 'bone']]) { const r = walkOn(x, z); live[lab] = r;
      ok('live foot plants on ' + lab + ' resolve ' + want + ' (every plant matches the cell under the foot)', r.steps >= 2 && r.first === want && r.allMatch, JSON.stringify(r)); }
    Surf.step = st0;
    ok('surface cache reused on repeated plants inside a clean shape', Surf.hits >= 3, Surf.hits + ' hits / ' + Surf.misses + ' misses');
    out.live = live;
    // deathblow: legacy timeline (today's world_boss finisher)
    const dbRun = (id, mode) => { const e = A.Ents.list.find(x => x.def.id === id); const f = e.f; P.x = P.px = f.x; P.z = P.pz = f.z - 2.0; P.maxHp = P.hp = 1e5; A.Ents.engage(e, 'struck'); frames(2); if (f.brain) f.brain.update = () => {};
      f.x = f.px = P.x; f.z = f.pz = P.z + 2.0; f.facing = Math.PI; P.facing = 0; G.Cam.yaw = 0; C.addPosture(W, f, 1e4); frames(30);
      DB.log.length = 0; DB.forceMode = mode; let F = null, impFrame = null, ripFrame = null, frame = 0, minDb = 0, hold = { seen: false, stepsDuring: 0 };
      const op = A.BossD.onPost; A.BossD.onPost = (FF) => { F = FF; if (FF.imp && impFrame === null) impFrame = frame; if (FF.rip && ripFrame === null) ripFrame = frame; };
      const clk = []; let colLand = null; G.Input.pressed.KeyE = true;
      let froze = false; for (let i = 0; i < 60 * 6; i++) { frame++; if (mode === 'blueprint' && !froze && DB.on && DB.t >= 0.29) { froze = true; W.freezeFighters([P, f], 6); } frames(1); if (DB.on) clk.push([+DB.t.toFixed(4), DB.a ? DB.a.freeze : 0]); if (DB.hold) hold.seen = true; if (colLand === null) { const ce = A.BossD.Col.list.find(x => x.f === f); if (ce && ce.landed) colLand = DB.real; } }   /* INT5: DBAudio ends on the land frame itself, so read its clock even when it just switched off */
      A.BossD.onPost = op; DB.forceMode = null;
      const L = DB.log.slice(); const ph = {}; for (const l of L) if (!ph[l.ph]) ph[l.ph] = l;
      // clock frozen while the core holds the attacker for hit-stop
      let frozenAdv = 0, frozenN = 0; for (let i = 1; i < clk.length; i++) if (clk[i - 1][1] > 0 && clk[i][1] > 0) { frozenN++; frozenAdv = Math.max(frozenAdv, clk[i][0] - clk[i - 1][0]); }
      let maxStep = 0; for (let i = 1; i < clk.length; i++) maxStep = Math.max(maxStep, clk[i][0] - clk[i - 1][0]);
      return { mode: L[0] && L[0].mode, ph, colLand, impFrame, ripFrame, dead: f.dead, on: DB.on, hold: hold.seen, holdNow: DB.hold, ctxPrio: G.P1.audio.ctxPrio, frozenN, frozenAdv, maxStep, F: F && { tImp: F.ph.impact, tRip: F.ph.clear } }; };   /* INT5: H1's tImp / tRip are gone; the finisher's bookmarks are the core's (F.ph) */
    const L1 = dbRun('m5', null); out.legacy = L1; console.log('legacy', JSON.stringify(L1));
    ok('INT5: with the I1 core merged, a deathblow starts DBAudio from the core deathblowStart (blueprint timeline; legacy is the pre-I1 fallback)', L1.mode === 'blueprint', L1.mode);
    ok('legacy: plant, drive, impact, settle, extract, clear and land all fire, in order', ['plant', 'drive', 'impact', 'settle', 'extract', 'clear', 'land'].every(k => L1.ph[k]) && L1.ph.plant.clock <= L1.ph.impact.clock && L1.ph.impact.clock <= L1.ph.clear.clock, Object.keys(L1.ph).join(','));
    ok('first run: impact phase on the deathblow clock at the finisher\u2019s impact bookmark (core 0.32, \u00b1 1 sim step)', L1.ph.impact && L1.F && L1.ph.impact.clock >= L1.F.tImp - 1e-6 && L1.ph.impact.clock - L1.F.tImp <= 0.0175, L1.ph.impact && L1.ph.impact.clock + ' vs ' + (L1.F && L1.F.tImp));
    ok('first run: clear at the finisher\u2019s blade-clear bookmark (core 1.15, \u00b1 1 sim step)', L1.ph.clear && L1.F && L1.ph.clear.clock >= L1.F.tRip - 1e-6 && L1.ph.clear.clock - L1.F.tRip <= 0.0175, L1.ph.clear && L1.ph.clear.clock + ' vs ' + (L1.F && L1.F.tRip));
    ok('the hold flag was raised between impact and clear, and released after', L1.hold && !L1.holdNow);
    ok('foe died, body landed, DBAudio finished and released priority context', L1.dead && !L1.on && L1.ctxPrio === null, JSON.stringify([L1.dead, L1.on, L1.ctxPrio]));
    // blueprint timeline on the same clock
    const L2 = dbRun('m6', 'blueprint'); out.blueprint = L2; console.log('blueprint', JSON.stringify(L2));
    const BT = DB.TL.blueprint; const errs = ['plant', 'impact', 'tension', 'clear'].map(k => L2.ph[k] ? +(L2.ph[k].clock - BT[k]).toFixed(4) : null);
    ok('blueprint: plant 0.05 / impact 0.32 / tension 0.70 / clear 1.15 fire within one sim step (never early)', errs.every(e => e !== null && e >= -1e-6 && e <= 0.0175), JSON.stringify(errs));
    ok('land fires on the frame the collapse lands (legacy + blueprint runs)', [L1, L2].every(L => L.ph.land && L.colLand !== null && Math.abs(L.ph.land.real - L.colLand) <= 0.0175), [L1, L2].map(L => (L.ph.land && L.ph.land.real) + ' vs ' + L.colLand).join(' / '));
    ok('deathblow clock advances at most one sim step a frame and holds while the core freezes the attacker', L2.maxStep <= 0.0175 && L2.frozenN >= 3 && L1.frozenAdv === 0 && L2.frozenAdv === 0, 'maxStep ' + L2.maxStep.toFixed(4) + ' frozen frames ' + (L1.frozenN + L2.frozenN));
    ok('no page errors (jsdom world)', H.errors.length === 0, H.errors.slice(0, 2).join(' | '));
    H.dom.window.close();
  } catch (e) { ok('jsdom part ran', false, e.stack); }
  console.log(res.join('\n')); const pass = res.filter(r => r.startsWith('PASS')).length; console.log(pass + '/' + res.length + ' audio_I4 checks passed');
  fs.writeFileSync(path.join(__dirname, 'audio_I4_result.json'), JSON.stringify(out, null, 1));
  process.exit(pass === res.length ? 0 : 1);
})();
