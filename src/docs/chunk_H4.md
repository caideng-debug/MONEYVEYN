# Chunk H4: combat mechanics

Branch `chunkH4` (from master `08b76f9`). `src/core.js` is unchanged (md5 `74a5299e9a45d86aaddc90e2f1831821`), and so are the v8 core timings (v8 40/40, ct 72/72).

Everything lives in one new file, `src/world_combat.js`, added to `build.py` after `world_scenes.js`. It is a wrapper layer only. The text changes are in `src/template.html` (hints panel and How to fight) and `src/world.js` (pause-menu Controls, the weapon pickup hint, the stealth tutorial line). Tuning values sit in `window.VEYN_COMBAT.CFG`, and the live state and counters are on `window.VEYN_COMBAT` for tests and debugging.

## Hooks

| Hook | Only when | What it does |
|---|---|---|
| `CORE.World.prototype.stepFighter` | `this === Game.world` | Vitality add-back, charged-heavy windup hold and charge arming, charge hint |
| `CORE.World.prototype.step` | `this === Game.world` | Guard-regain bookkeeping, charged-heavy hit and block bonuses (reads the events the tick produced) |
| `Game.handleEvents` | always (outermost wrapper) | Splits a player's perfect or late deflect into its own pass so only that deflect's FX are scaled; stealth kill layers |
| `P1.HUD.update` | always | Grey health segment, target posture tint, charge ring and CHARGED, queued sounds and FX, stealth cue |
| `audio.play` / `audio.tone` | always | A pitch factor (1 unless a deflect tier is playing) and the muted early whoosh of a held heavy |
| `FX.spark` / `FX.kick` / `FX.flash` | during a tiered deflect only | Scale factors |
| `Pad.poll` | always | New pad A and X mapping (below) |

Any other `World` (core self-tests, previews, `.test` worlds) runs the plain core. The sword trail and the audio internals (`sw`, the synth voices) are untouched. The deathblow animation and camera are untouched.

## 1. Vitality and posture

The core already scales posture regen by `c = 0.35 + 0.65·hp/maxHp` (about 51% at 25% HP). H4 bends that into the plan's curve `m`: 1.0 at full health, falling linearly to 0.35 at 25% health, and flat at 0.35 below that. Each tick, before the core's `regenPosture` runs inside `stepFighter`, the wrapper computes the exact regen the core is about to apply (same conditions, same order, after `f.lt` has advanced). Afterwards it adds back `regen × (1 − m/c)`. It only ever slows recovery: the add-back is capped just under the bar, so it never causes a break.

| Health | core alone | with H4 |
|---|---|---|
| 100% | 1.00 | 1.00 |
| 50% | 0.675 | 0.567 |
| 25% | 0.51 | 0.35 |
| 10% | 0.42 | 0.35 |

**Scope: enemies only** (`CFG.vit.player = false`). The player keeps the core curve, so a hurt player isn't punished twice. This is a judgment call; set the flag to apply it to the player too. It applies in world mode and in the arena modes, because both run on `Game.world`.

Cues:
- The target's posture fill (`#tPost`) warms from amber toward red as its health falls (CSS sepia, saturate and hue-rotate scaled by `(1 − m)/0.65`). Below about 55% health (more than 60% of the slowdown) the bar's centre tick turns red as well.
- When a foe within 18 m drops to 50% and again to 25% health, you hear a low thud and embers rise from its chest (orange at 50%, redder and more of them at 25%).
- A one-time hint: "A wounded foe recovers posture slowly. Keep pressing as their health falls."

## 2. Guard regain

- **Chip**: health the player loses on a tick that has a `block`, `guardbreak` or `crimsonChip` on the player and no clean `hit` on the player. In the core only blocked *heavy* blows (and the King's Phase II arc) chip, so light blocks stay chip-free.
- **Restore**: a player hit within 3 s of the last chip gives back `min(rec, dmg × 0.75)`. A player deathblow in that window gives back all of it.
- **Lose it**: taking a clean hit clears the pool. 3 s after the last chip, the pool drains away over 0.6 s.
- **UI**: a grey striped segment (`#pRegain`) sits right after the red health fill. It fades to half strength while it drains. On a restore you get a gold spark and ring at the chest, a three-note chime, a gold flash on the health fill and a glow on the segment.
- A one-time hint: "Grey health is chip from blocked heavy blows. Strike back within 3 s to win it back; a deathblow restores it all."

## 3. Charged heavy (hold RMB / K / pad X)

- A heavy (`p_h`) started while the button is held arms a charge. While the button stays held, the attack's clock is parked at `su × 0.5 − ε` (0.226 s of the 0.46 s windup). The pose holds mid-windup, the lunge (which starts at 0.55·su) hasn't begun, and the strike follows su/2 after release. A tap is exactly the old heavy. Finishers (`p_lh`) and ripostes (`p_ripo`) are never held.
- **Pose (presentation only).** The sim clock stays parked at su/2, but the player's `Character.update` is given a remapped attack time. The pose keeps winding up over 0.3 s to a full overhead (0.88·su of the clip), and after release it runs from there to su in step with the sim, so the blade lands exactly when the hit is resolved. Without this, the held pose sat a quarter of the way into the windup with the blade low, which didn't read as a charge in the High frames.
- **Charged** after 0.6 s held. The hold auto-releases at 2.0 s.
- A charged blow that **hits** adds +24 posture. A light foe also stays stunned 0.35 s longer.
- A charged blow that is **blocked** adds +30 posture. A light foe is knocked into a 0.7 s recoil (an opening).
- "Light foe" means no boss, no super-armor and `postureMax ≤ 100`: the Gallows Gaoler and the Penitent Jailer. The Chain Gaoler, Brask, the arena duelists and the bosses are not light.
- Measured in play (jsdom, gaoler): a plain heavy hit adds 13.5 posture and a charged one 37.5. A plain blocked heavy adds 7.5 and a charged one 37.5, plus the recoil. The cost is about 0.83 s of exposed windup, and the AI's deflect timing reads the parked clock, so it tends to deflect early.
- **Cues**:
  - The `#chargeRing` (wider, `h4heavy`) fills over 0.6 s and glows orange when full.
  - A tip light and glow: the existing FX point light rides the sword tip and brightens with the charge (no new light, so no shader recompile), plus one additive glow sprite on the tip (it pulses once charged).
  - The sword edge warms, then flashes white-hot at CHARGED.
  - You hear a rising hum while charging, then a bright "ting" with a low knock and a spark ring at the tip.
  - **CHARGED** shows in `#chain` (orange) until the swing's recovery.
  - The v8 attack-start whoosh is muted for a held heavy (it would fire at the wrong time), and a release whoosh plays su/2 after release instead (heavier when charged).
  - A charged landing adds a crunch, an orange ring, sparks, a small camera kick and a screen punch.
- A one-time hint after the second plain heavy: "Hold right click (or K / pad X) to charge a heavy…"

**Gamepad remap.** X is now heavy **on press**, and holding X charges it. It used to fire on release, with a long hold giving the charged thrust. A now works like the mouse's left button: a tap is a light attack (on release) and a hold of 0.35 s or more is the charged thrust (`p_hc`). The chargeRing also tracks a held A. The v6 pad checks (A tap = light, X tap = heavy) still pass.

## 4. Deflect tiers (the player's own deflects)

Good deflects and deflects by enemies are unchanged.

| | sparks | camera kick | flash light | pitch | extra |
|---|---|---|---|---|---|
| Perfect | ×1 | ×1.7 | ×1.5 | ×1.12 | sword-edge flash forced to full |
| Late | ×0.45 (streaks ×0.5, dulled orange; glare ×0.7, orange) | ×0.45 | ×0.5, dull orange `#b0602a` | ×0.85 | embers and a short hiss; one-time hint "LATE deflect: it held, but weakly. Press F a moment earlier for a Perfect deflect." |

The existing PERFECT / LATE banners, glare and streaks are kept. The scaling covers only the deflect's own handler pass: `Game.handleEvents` runs a tiered deflect alone, then the rest of the batch, in order.

## 5. Stealth polish (world mode)

- **Cue** when an unseen deathblow becomes available (the same `Ents.stealthTarget` test the prompt uses): a soft breath-and-glint sound and a pop on the "Deathblow (unseen)" prompt. It fires once per new target.
- A one-time hint: "Unseen: press E to slay this foe in one blow. Stay behind them and don't sprint."
- **Kill layers** on an unseen deathblow: a muffled low thud with cloth noise on top of the normal deathblow sound, and an ink puff (dark particles and an ink/blood splash in the hit style) at the body about 0.42 s in.
- **Tutorial line**: the yard gaoler's `tut: 'stealth'` line used to be empty. It is now "Unseen foes die to one blow: stay behind them, walk, and press E" (it shows when that gaoler spots you).
- **Not done**: the plunge (skipped as the plan says). The deathblow animation and camera were not touched.

## Tuning from the frames

`.test/shots_H4.js` was run on High and Low (1280×720, SwiftShader, about 10 fps on the shared machine). I checked every frame myself.
- **Charged heavy, first pass**: the CHARGED text and ring were clear, but the held pose was a low mid-windup and the tip light only lit the ground. Two fixes: the presentation-only pose remap (full overhead while held) and the tip glow sprite. The second pass reads as a raised, glowing blade on both tiers.
- **Late vs perfect, first pass**: the late deflect still showed a full fan of bright white streaks from the v7 streak burst, so it read close to a good deflect. Fix: during a late deflect the streaks are halved and dulled to orange and the glare is shrunk and turned orange. Second pass: perfect is a dense white burst with a double ring, good is a medium gold burst, late is a sparse dim orange scatter, on both High and Low.
- **Grey health**: legible on both tiers but faint on the dark bar. The stripes were brightened a step.
- **Stealth prompt and kill**: the prompt, the ▼ marker and the hint all show. The ink splash is visible behind the body at 0.9 s.

Values left at the plan's numbers: charge 0.6 s, +24 / +30, recoil 0.7 s, and the regain window and ratio. A plain heavy against a Gaoler adds 13.5 posture on a hit and 7.5 on a block; charged, it adds 37.5 either way. Three charged blows break a Gaoler that isn't recovering, which fits a slow, readable guard-breaker that costs 0.83 s of exposed windup.

## Text

- Hints panel (H): hold LMB is now "thrust", there is a new "hold RMB: charged heavy" row, a "Late" row, a "Grey health" row, and the gamepad row reads "A light (hold = thrust) · X heavy (hold = charge)".
- How to fight: the right-click line covers the charge, the gamepad line covers the new A and X, and a new paragraph covers grey health, wounded foes, late deflects and unseen kills.
- Pause Controls: Right click "(hold to charge…)", a new "Grey health" row, F "(just before = Perfect, just after = Late)", and E "from behind, unseen, it kills outright".
- Weapon pickup hint: "right click: heavy (hold to charge)".

## Tests

New `.test/mechanics_H4.js` (jsdom, world mode, seeded) with assertions per feature: the curve and the measured regen ratios, no break, the player and other worlds untouched, cues, tint, every regain rule, charge timing / posture / stun / recoil / non-light / auto-release / RMB, the charge hint, deflect tier factors (kick measured on `Cam.addTrauma`, light, colour, pitch), a real in-sim deflect through the tier path, stealth cue / no repeat / kill layer / ink puff, the gamepad map, the text, and no page errors.

New `.test/shots_H4.js [quality] [only]` writes `shots/H4_<quality>_*.png` (regain, charge, stealth, deflect good/perfect/late).

## Results (final build, commit `eded78d` + test commit)

| suite | result |
|---|---|
| ct (core self-tests) | 72/72 |
| v8 | 40/40 (core timings unchanged) |
| v6 | 29/29 (pad: A tap = light, X tap = heavy still pass) |
| p1 | 97/97 |
| keyflow | 54/54 |
| boss | 50/50 |
| merge | 19/19 |
| smoke | self-tests 72/72, no errors, no crash |
| engage | 11/11 |
| mechanics_H4 (new) | 62/62 |

`src/core.js` md5 is `74a5299e9a45d86aaddc90e2f1831821` (also asserted in mechanics_H4). Frames: `shots/H4_high_*.png` and `shots/H4_low_*.png` (not committed).

## Not done / caveats

- **Plunge**: skipped, as planned.
- **Vitality for the player**: off by design (`CFG.vit.player`).
- **Muted whoosh**: the v8 attack-start whoosh carries no attacker id, so the mute matches by timing (within 120 ms of the held heavy's original whoosh). An enemy heavy whoosh landing in that same window would also be muted (rare).
- **Arena modes**: get every mechanic except stealth, because they share `Game.world`. The arena suites (v6, v8 via core) are green.
- **Real hardware**: feel and timing were checked in headless SwiftShader only (about 10 fps on the shared machine), not on the Chromebook.
