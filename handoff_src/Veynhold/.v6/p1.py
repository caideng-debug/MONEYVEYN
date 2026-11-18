p='src/game.js'; s=open(p).read()
def rep(a,b,cnt=1):
    global s
    assert s.count(a)==cnt,(a[:80],s.count(a)); s=s.replace(a,b)
rep("  constructor() { this.ctx = null; this.master = null; this.noise = null; }",
    "  constructor() { this.ctx = null; this.master = null; this.noise = null; this.out = null; this.wet = null; this.vol = 1; this.muted = false; }")
rep("this.noise = buf; this.ambient(); }",
    "this.noise = buf; this.ambient(); this.initBus(); }")
rep("  setVolume(v) { Settings.volume = v; if (this.master) this.master.gain.value = v; }",
"""  setVolume(v) { Settings.volume = v; if (this.master && !this.muted) this.master.gain.value = v; }
  // v6: mute while the tab is hidden
  mute(on) { this.muted = on; if (!this.master) return; const t = this.ctx.currentTime; this.master.gain.cancelScheduledValues(t); this.master.gain.setTargetAtTime(on ? 0 : Settings.volume, t, 0.05); }
  // v6: a small reverb send for stingers + a combat drone bed driven by pressure
  initBus() { const c = this.ctx; try {
      const len = Math.floor(c.sampleRate * 1.8), ir = c.createBuffer(2, len, c.sampleRate);
      for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
      this.rev = c.createConvolver(); this.rev.buffer = ir; this.revG = c.createGain(); this.revG.gain.value = 0.5; this.rev.connect(this.revG); this.revG.connect(this.master);
      this.bedF = c.createBiquadFilter(); this.bedF.type = 'lowpass'; this.bedF.frequency.value = 160; this.bedF.Q.value = 3; this.bedG = c.createGain(); this.bedG.gain.value = 0;
      for (const [f, d] of [[55, -6], [55.4, 5], [82.4, 0]]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = d; o.connect(this.bedF); o.start(); }
      const pulse = c.createOscillator(); pulse.frequency.value = 0.9; const pg = c.createGain(); pg.gain.value = 60; pulse.connect(pg); pg.connect(this.bedF.frequency); pulse.start();
      this.bedF.connect(this.bedG); this.bedG.connect(this.master); this.bedG.connect(this.rev);
    } catch (e) { this.rev = null; } }
  bed(intensity) { if (!this.bedG) return; const t = this.ctx.currentTime, k = clamp(intensity, 0, 1);
    this.bedG.gain.setTargetAtTime(k <= 0 ? 0 : 0.025 + 0.085 * k, t, 0.35); this.bedF.frequency.setTargetAtTime(140 + 720 * k * k, t, 0.4); }
  dest() { return this.out || this.master; }""")
rep("f.Q.value = q; const g = c.createGain(); this.env(g, t, 0.004, peak, dec); s.connect(f); f.connect(g); g.connect(this.master);",
    "f.Q.value = q; const g = c.createGain(); this.env(g, t, 0.004, peak * this.vol, dec); s.connect(f); f.connect(g); g.connect(this.dest()); if (this.wet && this.rev) g.connect(this.rev);")
rep("const g = c.createGain(); this.env(g, t, 0.003, peak, dur); o.connect(g); g.connect(this.master);",
    "const g = c.createGain(); this.env(g, t, 0.003, peak * this.vol, dur); o.connect(g); g.connect(this.dest()); if (this.wet && this.rev) g.connect(this.rev);")
rep("""  play(name, o) {
    o = o || {};
    switch (name) {""","""  play(name, o) {
    o = o || {}; if (!this.ok) return;
    this.vol = o.vol === undefined ? 1 : o.vol; this.wet = !!o.wet || ['perfect', 'break', 'deathblow', 'phase', 'win', 'death'].includes(name); this.out = null;
    if (o.pan && this.ctx.createStereoPanner) { const pn = this.ctx.createStereoPanner(); pn.pan.value = clamp(o.pan, -1, 1); pn.connect(this.master); this.out = pn; }
    this.sw(name, o); this.out = null; this.wet = null; this.vol = 1;
  }
  sw(name, o) {
    switch (name) {""")
rep("      case 'branch': this.tone(740, 0.06, 'square', 0.025); break;",
"""      case 'branch': this.tone(740, 0.06, 'square', 0.025); break;
      case 'perfect': [1568, 2093, 2637, 3136].forEach((f, i) => this.tone(f, 0.9 - i * 0.12, 'sine', 0.11 / (i + 1), i * 0.012)); this.tone(98, 0.4, 'sine', 0.3, 0, 60); break;
      case 'late': this.tone(880, 0.18, 'triangle', 0.05); break;
      case 'deathSting': [220, 261.6, 329.6].forEach((f, i) => this.tone(f, 2.2, 'triangle', 0.06, 0.3 + i * 0.02, f * 0.5)); break;
      case 'phaseSting': [110, 130.8, 164.8, 220].forEach((f, i) => this.tone(f, 2.6, 'sawtooth', 0.05, 0.6 + i * 0.15)); this.nz(0.5, 'bandpass', 900, 0.7, 0.2, 1.4, 1.6, 5000); break;
      case 'execSting': this.tone(41, 1.4, 'sine', 0.4, 0.4, 30); [196, 233, 294].forEach((f, i) => this.tone(f, 1.2, 'triangle', 0.05, 0.45 + i * 0.03)); break;""")
rep("if (f.isPlayer && amp > 0.35) audio.play('step'); }",
    "if (f.isPlayer && amp > 0.35) audio.play('step'); else if (!f.isPlayer && amp > 0.5) { const d = Math.hypot(f.x - camera.position.x, f.z - camera.position.z); if (d < 14) audio.play('step', { pan: panOf(f.x, f.z), vol: (f.profile.look === 'warden' ? 1.8 : 1) * clamp(1.4 - d / 12, 0.2, 1) }); } }")
open(p,'w').write(s)
