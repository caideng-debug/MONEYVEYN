p='src/game.js'; s=open(p).read()
def rep(a,b,cnt=1):
    global s
    assert s.count(a)==cnt,(a[:80],s.count(a)); s=s.replace(a,b)

# ---- Settings + Store (localStorage, sandbox-safe)
rep("const Settings = { quality: 'medium', volume: 0.7, debug: false, hints: true, sens: 0.0032 };",
"""const Settings = { quality: 'medium', volume: 0.7, debug: false, hints: true, sens: 0.0032, mirror: false, padSens: 2.6 };
/* v6: persistence — localStorage key veynhold_v6 (fails soft when storage is blocked) */
const Store = {
  KEY: 'veynhold_v6', data: { best: {}, seenTutorial: false },
  load() { try { const raw = window.localStorage && localStorage.getItem(this.KEY); if (!raw) return; const d = JSON.parse(raw); this.data = Object.assign(this.data, d); if (!this.data.best) this.data.best = {};
      for (const k of ['quality', 'volume', 'hints', 'sens', 'mirror']) if (d[k] !== undefined) Settings[k] = d[k];
      if (d.accessibility !== undefined) CONFIG.parry.accessibility = !!d.accessibility; } catch (e) {} },
  save() { try { if (!window.localStorage) return; const d = Object.assign({}, this.data, { quality: Settings.quality, volume: Settings.volume, accessibility: !!CONFIG.parry.accessibility, hints: Settings.hints, sens: Settings.sens, mirror: Settings.mirror });
      localStorage.setItem(this.KEY, JSON.stringify(d)); } catch (e) {} },
};
Store.load();""")
rep("/* ---------------- settings (memory only — sandbox-safe) ---------------- */", "/* ---------------- settings (persisted in localStorage when available) ---------------- */")

# ---- helpers + V6 modules before ENCOUNTERS
rep("const ENCOUNTERS = {", r"""/* v6: stereo position of a world point relative to the camera (-1 left … 1 right) */
const _panV = new THREE.Vector3();
function panOf(x, z) { _panV.set(x - camera.position.x, 0, z - camera.position.z); const rx = Math.cos(Cam.yaw), rz = -Math.sin(Cam.yaw); const l = Math.hypot(_panV.x, _panV.z) || 1; return clamp((_panV.x * -rx + _panV.z * -rz) / l, -1, 1) * 0.7; }
/* v6: coach — short reactive lines in practice and in the first fight */
const Coach = {
  on: false, t: 0, last: '', soft: 0,
  say(text, hold) { if (!this.on) return; const el = $('coach'); if (!el) return; el.textContent = text; el.style.opacity = 1; this.t = hold || 1.8; this.last = text; },
  update(dt) { if (this.t > 0) { this.t -= dt; if (this.t <= 0) { const el = $('coach'); if (el) el.style.opacity = 0; } } },
  onEvent(e, w) {
    if (!this.on) return; const pl = w.player; const toPl = e.d === pl.id, byPl = e.a === pl.id;
    switch (e.type) {
      case 'earlyParry': this.say('Too early — wait for the blade'); break;
      case 'deflect': if (toPl) this.say(e.quality === 'perfect' ? 'Perfect — right on the strike' : e.quality === 'late' ? 'Late — caught in the grace frames' : 'Good — press a hair later for Perfect'); else if (byPl) this.say('Deflected — your swing was read. Mix in a pause'); break;
      case 'block': if (toPl) this.say('Tap, don\u2019t hold — holding only blocks'); break;
      case 'guardbreak': if (toPl) this.say('Guard broken — deflect to keep posture'); break;
      case 'hit': if (toPl) { const t = ATTACKS[e.key] ? ATTACKS[e.key].type : ''; this.say(t === 'thrust' ? 'Thrust: deflect, or dodge INTO it (Counterstep)' : t === 'sweep' ? 'Sweep: jump (C), then attack mid-air' : t === 'grab' ? 'Grab: can\u2019t be blocked — dodge it' : ATTACKS[e.key] && ATTACKS[e.key].projectile ? 'Crimson Arc: deflect, jump, or dodge through' : 'Tap guard as the blade lands'); } break;
      case 'danger': this.say({ thrust: '危 Thrust — deflect or step into it', sweep: '危 Sweep — jump!', grab: '危 Grab — dodge!' }[e.atype] || '危 Perilous', 1.0); break;
      case 'jumped': this.say('Now attack in the air to trample'); break;
      case 'jumpKick': this.say('Trampled!'); break;
      case 'mikiri': this.say('Counterstep!'); break;
      case 'grabWhiff': this.say('Slipped the grab — punish!'); break;
      case 'postureBreak': if (e.f !== pl.id) this.say('Posture broken — E to deathblow', 2.2); else this.say('Your posture broke — deflect more, block less'); break;
      case 'trainerReset': this.say('The Shade stands again'); break;
    }
  },
};
/* v6: gamepad (standard mapping) — feeds the same intent path as keyboard */
const Pad = {
  prev: [], held: {}, lx: 0, ly: 0, rx: 0, ry: 0, xT: 0, connected: false, DZ: 0.18,
  dz(v) { return Math.abs(v) < this.DZ ? 0 : (v - Math.sign(v) * this.DZ) / (1 - this.DZ); },
  poll() { let gp = null; try { const list = navigator.getGamepads ? navigator.getGamepads() : []; for (const g of list) if (g && g.connected) { gp = g; break; } } catch (e) {}
    this.connected = !!gp; if (!gp) { this.lx = this.ly = this.rx = this.ry = 0; this.held = {}; return; }
    const b = i => !!(gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.5)), edge = i => b(i) && !this.prev[i];
    this.lx = this.dz(gp.axes[0] || 0); this.ly = this.dz(gp.axes[1] || 0); this.rx = this.dz(gp.axes[2] || 0); this.ry = this.dz(gp.axes[3] || 0);
    const P = Input.pressed;
    if (edge(0)) P.KeyJ = true; if (edge(1)) P.Space = true; if (edge(6)) P.KeyC = true; if (edge(3)) P.KeyE = true; if (edge(4) || edge(11)) P.KeyQ = true;
    if (edge(5) || edge(7)) P.KeyF = true; if (edge(15)) { P.Tab = true; } if (edge(14)) { Input.wheel = -1; }
    if (edge(2)) this.xT = performance.now(); if (!b(2) && this.prev[2]) P[(performance.now() - this.xT) / 1000 >= CONFIG.heavy.chargeHold ? 'LMB_CHARGED' : 'KeyK'] = true;
    if (edge(9)) Game.onKey(Game.state === 'title' ? 'Enter' : 'Escape', false); if (edge(8)) Game.onKey('KeyR', false);
    this.held.guard = b(5) || b(7); this.held.sprint = b(10) || Math.hypot(this.lx, this.ly) > 0.95 && b(1);
    for (let i = 0; i < gp.buttons.length; i++) this.prev[i] = b(i); },
};
/* v6: adaptive quality — one automatic step down per session if the frame rate stays low */
const Perf = {
  acc: 0, n: 0, playT: 0, stepped: false,
  update(dt, playing) { if (!playing) { this.acc = this.n = 0; return; } this.playT += dt; if (this.playT < 4 || this.stepped || Settings.quality === 'low') return; this.acc += dt; this.n++;
    if (this.acc >= 2) { const fps = this.n / this.acc; this.acc = this.n = 0; if (fps < 40) { this.stepped = true; Settings.quality = Settings.quality === 'high' ? 'medium' : 'low'; applyQuality(); onResize(); Store.save(); toast('Quality lowered for performance (' + fps.toFixed(0) + ' fps)'); } } },
};
function toast(msg) { const el = $('toast'); if (!el) return; el.textContent = msg; el.style.opacity = 1; clearTimeout(toast.t); toast.t = setTimeout(() => el.style.opacity = 0, 3200); }
/* v6: grade — damage taken dominates, perfect share and clean execution lift it */
function gradeOf(s, win) { if (!win) return '—'; const defl = s.perfect + s.good + s.late, ps = defl ? s.perfect / defl : 0;
  const score = 100 - s.hitsTaken * 9 - s.earlyParries * 2 + ps * 20 + Math.min(10, s.mikiri * 3 + s.jumpKicks * 2); return score >= 95 ? 'S' : score >= 80 ? 'A' : score >= 60 ? 'B' : 'C'; }
const GRADE_RANK = { S: 4, A: 3, B: 2, C: 1, '—': 0 };
const fmtT = t => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
/* v6: practice against any foe — the Shade borrows its look and moveset */
function shadeOf(foe) {
  const T = CORE.PROFILES.trainer; if (!foe || foe === 'trainer' || !CORE.PROFILES[foe]) return T; const P = CORE.PROFILES[foe];
  const keys = []; const add = c => c.c.forEach(st => { const k = CORE.stepOf(st).k; if (!keys.includes(k)) keys.push(k); });
  P.combos.forEach(add); if (P.phase2) P.phase2.combos.forEach(add);
  return Object.assign({}, T, { name: 'Shade of ' + P.name.replace(/^The /, ''), look: P.look, lesson: keys.map(k => [k]), perilous: keys.filter(k => ATTACKS[k].danger || ATTACKS[k].projectile).map(k => [k]) });
}
const ENC_NAMES = { practice: 'Practice Dummy', duelist: 'The Duelist', warden: 'The Iron Warden', brother: 'The False Brother', pair: 'Two Oathbreakers', duowarden: 'Blade and Wall', king: "The King's First Blade", gauntlet: 'Gauntlet' };
const ENCOUNTERS = {""")
rep("pair: [['duelist', 'brother']], gauntlet:", "pair: [['duelist', 'brother']], duowarden: [['duelist', 'warden']], practice: [['trainer']], gauntlet:")

# ---- Game.begin: training world, mirror, soft tutorial, practice foe
rep("""    const w = new World((Date.now() & 0xffff) + 1); this.world = w;
    const p = w.addPlayer(0, -6); p.facing = 0;
    const list = ENCOUNTERS[this.enc][this.stage];
    list.forEach((k, i) => { const e = w.addEnemy(k, (i - (list.length - 1) / 2) * 4, 5); e.facing = Math.PI; });""",
"""    const w = new World((Date.now() & 0xffff) + 1); this.world = w;
    const p = w.addPlayer(0, -6); p.facing = 0;
    const list = ENCOUNTERS[this.enc][this.stage], practice = this.enc === 'practice';
    list.forEach((k, i) => { const e = w.addEnemy(k, (i - (list.length - 1) / 2) * 4, practice ? -2 : 5); e.facing = Math.PI; if (practice) { e.profile = shadeOf(this.practiceFoe); e.name = e.profile.name; } });
    if (practice) { w.training = this.training = this.training || { perilous: false, guard: false, paused: false, cadence: 2.4 }; }
    if (Settings.mirror && !practice) { p.maxHp = p.hp = Math.round(p.maxHp * 0.8); p.postureMax = Math.round(p.postureMax * 0.8); }   // v6: Mirror challenge
    // v6: soft tutorial — the first Duelist fight starts slower and coached, without blocking input
    this.softT = 0; Coach.on = practice; Coach.t = 0; $('coach').style.opacity = 0;
    if (!practice && this.enc === 'duelist' && this.stage === 0 && !Store.data.seenTutorial) { this.softT = 20; Coach.on = true; for (const e of w.enemies()) e.tempoMult = 1.25; setTimeout(() => Coach.say('Tap F (or right mouse) as the blade lands', 3), 900); }
    if (practice) setTimeout(() => Coach.say('Watch the Shade. Tap F as each blade lands', 3), 900);
    $('practice').style.display = practice ? 'block' : 'none'; this.updatePracticeHud(); Perf.playT = 0; audio.bed(0);""")
rep("    for (const f of w.fighters) this.chars.set(f.id, new Character(f, f.isPlayer ? 'player' : f.profile.look));",
    "    for (const f of w.fighters) this.chars.set(f.id, new Character(f, f.isPlayer ? 'player' : f.profile.look));\n    for (const b of document.querySelectorAll('[data-enc]')) b.blur();")
rep("  start(enc) { this.enc = enc; this.stage = 0; this.begin(); },",
"""  start(enc, foe) { this.enc = enc; this.stage = 0; this.practiceFoe = enc === 'practice' ? (foe || null) : null; this.begin(); },
  practiceThis() { const list = ENCOUNTERS[this.enc] && ENCOUNTERS[this.enc][this.stage]; const foe = this.enc === 'practice' ? this.practiceFoe : list && list[list.length - 1]; this.start('practice', foe); },
  updatePracticeHud() { const T = this.training || {}, on = v => v ? '<b>on</b>' : 'off';
    $('practice').innerHTML = `PRACTICE — ${this.practiceFoe ? ENC_NAMES[this.practiceFoe] || this.practiceFoe : 'Training Shade'}<br>1 perilous only: ${on(T.perilous)}<br>2 Shade holds guard: ${on(T.guard)}<br>3 pause swings: ${on(T.paused)}<br>4 cadence: ${(T.cadence || 2.4).toFixed(1)} s`; },""")
rep("  pause() { if (this.state !== 'playing') return; this.state = 'paused'; Input.clear(); this.overlay('pause');",
    "  pause() { if (this.state !== 'playing') return; this.state = 'paused'; Input.clear(); this.overlay('pause'); audio.bed(0);\n    { const n = ENCOUNTERS[this.enc].length; $('pauseInfo').textContent = (ENC_NAMES[this.enc] || this.enc) + (n > 1 ? ' — foe ' + (this.stage + 1) + ' of ' + n : '') + (Settings.mirror && this.enc !== 'practice' ? ' · Mirror' : ''); }")
rep("  quit() { for (const c of this.chars.values()) c.dispose(); this.chars.clear(); Projectiles.clear(); this.world = null;",
    "  quit() { for (const c of this.chars.values()) c.dispose(); this.chars.clear(); Projectiles.clear(); this.world = null; Coach.on = false; $('coach').style.opacity = 0; $('practice').style.display = 'none'; audio.bed(0); this.refreshBest();")
rep("    if (code === 'KeyH') { Settings.hints = !Settings.hints; $('hints').style.display = Settings.hints && this.state === 'playing' ? 'block' : 'none'; }",
"""    if (code === 'KeyH') { Settings.hints = !Settings.hints; $('hints').style.display = Settings.hints && this.state === 'playing' ? 'block' : 'none'; Store.save(); }
    if (code === 'Enter' && this.state === 'title') { audio.ensure(); this.start('practice'); return; }
    if (this.enc === 'practice' && this.world && this.training && ['Digit1', 'Digit2', 'Digit3', 'Digit4'].includes(code)) { const T = this.training;
      if (code === 'Digit1') T.perilous = !T.perilous; if (code === 'Digit2') T.guard = !T.guard; if (code === 'Digit3') T.paused = !T.paused; if (code === 'Digit4') T.cadence = T.cadence >= 3.4 ? 1.6 : +(T.cadence + 0.6).toFixed(1);
      for (const e of this.world.enemies()) if (e.brain) e.brain.lessonI = -1; this.updatePracticeHud(); audio.play('ui'); }""")
# ---- endEncounter: stats table + grade + best
rep("""    const line = `Time ${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')} &nbsp;·&nbsp; Deflects ${s.deflects} &nbsp;·&nbsp; Blocks ${s.blocks} &nbsp;·&nbsp; Hits taken ${s.hitsTaken} &nbsp;·&nbsp; Early deflects ${s.earlyParries}`;""",
"""    // v6: post-fight breakdown, grade, personal best
    const g = gradeOf(s, win), bk = this.enc + (Settings.mirror ? '_mirror' : ''), lastStage = this.stage >= ENCOUNTERS[this.enc].length - 1;
    let pb = ''; if (win && lastStage) { const B = Store.data.best[bk]; const better = !B || t < B.time || GRADE_RANK[g] > GRADE_RANK[B.grade];
      if (better) { Store.data.best[bk] = { time: B ? Math.min(B.time, t) : t, deflects: s.deflects, grade: B && GRADE_RANK[B.grade] > GRADE_RANK[g] ? B.grade : g }; pb = '<div class="flavor">New personal best</div>'; } }
    if (this.enc === 'duelist') Store.data.seenTutorial = true; Store.save();
    const row = (a, b) => `<tr><td>${a}</td><td>${b}</td></tr>`;
    const line = (win ? `<div class="grade">${g}</div>` : '') + pb + '<table>' + row('Time', fmtT(t)) + row('Deflects — perfect / good / late', `${s.perfect} / ${s.good} / ${s.late}`) + row('Blocks', s.blocks) +
      row('Hits taken · damage', `${s.hitsTaken} · ${Math.round(s.dmgTaken)}`) + row('Early presses', s.earlyParries) + row('Counterstep · Trample', `${s.mikiri} · ${s.jumpKicks}`) + row('Deathblows', s.deathblows) + '</table>';
    $('practiceBtn').style.display = $('practiceBtn2').style.display = this.enc === 'practice' ? 'none' : 'inline-block'; audio.bed(0);
    if (!win) audio.play('deathSting');""")
rep("  next() { if (this.stage", """  refreshBest() { document.querySelectorAll('[data-enc]').forEach(b => { let el = b.querySelector('.best'); const B = Store.data.best[b.dataset.enc + (Settings.mirror ? '_mirror' : '')];
      if (!el) { el = document.createElement('span'); el.className = 'best'; b.appendChild(el); } el.textContent = B ? 'Best ' + fmtT(B.time) + ' · ' + B.grade + (Settings.mirror ? ' (mirror)' : '') : ''; }); },
  next() { if (this.stage""")
# ---- frame: pad, coach, bed, perf, soft tutorial timer
rep("""    if (this.world && this.state === 'playing') {
      this.gatherIntent(dt);""","""    Pad.poll(); Coach.update(dt); Perf.update(dt, this.state === 'playing');
    if (this.world && this.state === 'playing') {
      if (this.softT > 0) { this.softT -= dt; if (this.softT <= 0) { for (const e of this.world.enemies()) e.tempoMult = 1; Coach.on = false; Store.data.seenTutorial = true; Store.save(); } }
      { const w = this.world, p = w.player, es = w.enemies(); let k = 0.25 + 0.35 * (p.posture / p.postureMax) + 0.15 * Math.max(0, es.length - 1); for (const e of es) { if (e.phase === 2) k += 0.3; if (e.state === 'attack' && Math.hypot(e.x - p.x, e.z - p.z) < 5) k += 0.12; } audio.bed(this.enc === 'practice' ? k * 0.4 : k); }
      this.gatherIntent(dt);""")
# ---- gatherIntent: pad
rep("    Cam.yaw += ak * dt * 2.4 - Input.mdx * Settings.sens; Cam.pitch += -pk * dt * 1.4 + Input.mdy * Settings.sens * 0.8; Input.mdx = Input.mdy = 0;",
    "    Cam.yaw += ak * dt * 2.4 - Input.mdx * Settings.sens - Pad.rx * dt * Settings.padSens; Cam.pitch += -pk * dt * 1.4 + Input.mdy * Settings.sens * 0.8 + Pad.ry * dt * Settings.padSens * 0.55; Input.mdx = Input.mdy = 0;")
rep("    const fwd = (K.KeyW ? 1 : 0) - (K.KeyS ? 1 : 0), str = (K.KeyD ? 1 : 0) - (K.KeyA ? 1 : 0);",
    "    const fwd = clamp((K.KeyW ? 1 : 0) - (K.KeyS ? 1 : 0) - Pad.ly, -1, 1), str = clamp((K.KeyD ? 1 : 0) - (K.KeyA ? 1 : 0) + Pad.lx, -1, 1);")
rep("    I.mx = mx; I.mz = mz; I.sprint = !!(K.ShiftLeft || K.ShiftRight);\n    I.guard = !!(K.KeyF || Input.rmb);",
    "    I.mx = mx; I.mz = mz; I.sprint = !!(K.ShiftLeft || K.ShiftRight || Pad.held.sprint);\n    I.guard = !!(K.KeyF || Input.rmb || Pad.held.guard);")
# ---- events: deflect quality, coach, stingers, pan, arc
rep("""      Juice.onEvent(e, w, this);""", """      Juice.onEvent(e, w, this); Coach.onEvent(e, w);""")
rep("""          const pl = w.byId(e.d); if (pl && pl.isPlayer) HUD.flash('DEFLECT', '#f6e2a8'); else""",
"""          const pl = w.byId(e.d);
          if (pl && pl.isPlayer) { if (e.quality === 'perfect') { HUD.flash('PERFECT', '#ffffff', 52); audio.play('perfect', { pan: panOf(e.x, e.z) }); FX.ring(pos, 0xffffff, 11, 0.32); FX.spark(pos, 22, 1.5, [1, 1, 0.9]); Cam.kickFov(-3.5); Post.pulse('255,215,120', 0.32); }
            else if (e.quality === 'late') { HUD.flash('LATE', '#b7a780', 34); audio.play('late'); } else HUD.flash('DEFLECT', '#f6e2a8'); } else""")
rep("""        case 'deflect': { const pos = contact(); audio.play('deflect', { heavy: e.heavy });""",
    """        case 'deflect': { const pos = contact(); audio.play('deflect', { heavy: e.heavy, pan: panOf(e.x, e.z), vol: e.quality === 'late' ? 0.7 : 1 });""")
rep("""        case 'block': { const pos = contact(); audio.play('block');""", """        case 'block': { const pos = contact(); audio.play('block', { pan: panOf(e.x, e.z) });""")
rep("""audio.play('hit', { heavy: e.heavy || e.finisher });""", """audio.play('hit', { heavy: e.heavy || e.finisher, pan: panOf(e.x, e.z) });""")
rep("""        case 'deathblow': { audio.play('deathblow');""", """        case 'deathblow': { audio.play('deathblow'); audio.play('execSting');""")
rep("""        case 'phase2': { audio.play('phase');""", """        case 'phase2': { audio.play('phase'); audio.play('phaseSting');""")
rep("HUD.flash('BLOCKING BLEEDS YOU — DEFLECT', '#ff5a4a', 22);", "HUD.flash('BLOCKING CHIPS HEALTH — DEFLECT THE ARC', '#ff5a4a', 22); Coach.on = true; Coach.say('In Phase II, blocking chips your health — deflect', 3); setTimeout(() => { if (Game.enc !== 'practice' && Game.softT <= 0) Coach.on = false; }, 3200);")
# ---- debug line: quality
rep("    lines.push(`  last defense: ${ld ? ld.result + ' (' + ld.key + ')  ' +", "    lines.push(`  last defense: ${ld ? ld.result + (ld.quality ? ' [' + ld.quality + ']' : '') + ' (' + ld.key + ')  ' +")
# ---- UI binding: persistence + new buttons
rep("  const q = () => { Settings.quality = { high: 'medium', medium: 'low', low: 'high' }[Settings.quality] || 'high'; applyQuality(); onResize(); };",
    "  const q = () => { Settings.quality = { high: 'medium', medium: 'low', low: 'high' }[Settings.quality] || 'high'; applyQuality(); onResize(); Store.save(); };")
rep("  const vol = e => { audio.ensure(); audio.setVolume(e.target.value / 100); $('vol').value = $('vol2').value = e.target.value; };",
    "  const vol = e => { audio.ensure(); audio.setVolume(e.target.value / 100); $('vol').value = $('vol2').value = e.target.value; Store.save(); };\n  $('vol').value = $('vol2').value = Math.round(Settings.volume * 100);\n  $('mirrorChk').checked = !!Settings.mirror; $('mirrorChk').onchange = e => { Settings.mirror = e.target.checked; Store.save(); Game.refreshBest(); };\n  $('practiceBtn').onclick = $('practiceBtn2').onclick = () => Game.practiceThis();")
rep("function setAccessibility(on) { CONFIG.parry.accessibility = on;", "function setAccessibility(on, noSave) { CONFIG.parry.accessibility = on; if (!noSave) Store.save();")
rep("buildArena(); FX.init(); initEmbers(); Input.init(); bindUI(); applyQuality(); onResize();",
    "buildArena(); FX.init(); initEmbers(); Input.init(); bindUI(); applyQuality(); onResize(); setAccessibility(CONFIG.parry.accessibility, true); Game.refreshBest();\ndocument.addEventListener('visibilitychange', () => audio.mute(document.hidden));")
# tune row for perfect window
rep("['Light chain length', 'combo.lightChain', 2, 4, 1],", "['Perfect window (s)', 'parry.perfectWindow', 0.01, 0.1, 0.005], ['Light chain length', 'combo.lightChain', 2, 4, 1],")
rep("window.VEYN_GAME = { Projectiles,", "window.VEYN_GAME = { Store, Coach, Pad, Perf, gradeOf, shadeOf, panOf, Projectiles,")
open(p,'w').write(s)
