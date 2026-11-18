p='src/game.js'; s=open(p).read()
a="    this.hips.position.set(shud, 0.95 + p.hipY + hipBob + br * 0.008, 0);"
assert s.count(a)==1
s=s.replace(a,"""    // v6: ground contact — crouched stances and kneels pin the lowest foot/knee to the floor instead of sinking through it
    let lift = 0; { const grounded = f.state !== 'jump' && f.state !== 'dead' && !(f.state === 'attack' && f.atk && f.atk.def.style === 'plunge') && this.deathT <= 0;
      if (grounded) { const hy = 0.95 + p.hipY + hipBob - 0.04, cs = Math.cos(p.legSpread), kl = hy - 0.46 * Math.cos(lLeg) * cs, kr = hy - 0.46 * Math.cos(rLeg) * cs;
        const fl = kl - 0.45 * Math.cos(lLeg + lKnee) * cs, fr = kr - 0.45 * Math.cos(rLeg + rKnee) * cs, lo = Math.min(fl, fr, kl - 0.06, kr - 0.06);
        lift = clamp(-lo, -0.04, 0.32); } }
    this.hips.position.set(shud, 0.95 + p.hipY + hipBob + br * 0.008 + lift, 0);""")
open(p,'w').write(s)
