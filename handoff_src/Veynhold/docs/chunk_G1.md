# Chunk G1: the deathblow

Branch `chunkG1` (from master `a0cd034`). `src/core.js` is unchanged (md5 `74a5299e9a45d86aaddc90e2f1831821`). The combat timing is the core's own: every sim tick, state and duration is untouched. All changes are presentation, in `src/world_boss.js` (world mode only, so duel mode / v8 is not affected).

## User corrections applied (they override fixplan §1.2 A/B)
- **No forced break.** A single overhead parry does **not** call `addPosture` for a guaranteed break, and the bestiary weights are unchanged. Posture builds the normal way. Whatever parry breaks posture (the last one) leads straight into the new standing stagger, and from there into the step-in / seam-thrust deathblow.
- **The SENTENCED/DEATHBLOW brush stamp is removed** (CSS, DOM element and `Pop` code). The game's original generic banner, `HUD.flash('DEATHBLOW', '#ff3b30', 48)` on the core `deathblow` event, is no longer suppressed in world mode. `Pop.tick` also fades that banner while `Game.state` isn't `playing` (for example in the boss finale), because `HUD.update` doesn't run then. The red-white flash (field 0.38, boss 0.6, was 0.5/0.72) and the pull-out shake (0.055/0.10) stay, toned down slightly.

## What the player sees (field foe, wall clock; the boss's numbers are in brackets)
| Beat | ms | Notes |
|---|---|---|
| Breaking parry | 0 | The existing deflect and postureBreak VFX. |
| Standing stagger | from break | `TR.vic_reel`: snaps back with the sword arm thrown up and the chest/armpit open (`reel`), then sags to `reelLow` by 1.0 s. It replaces the one-knee `broken` kneel for every team-1 fighter in world mode, including Odran. |
| E prompt | break + 0.2 s sim (about 0.3 s after the parry) | `#dbHint` is held back for 0.2 s so the stagger reads first. It then pops in (scale 1.35→1 over 120 ms) with a soft 1400 Hz tone and pulses at 2 Hz. E is still accepted the whole time (buffered by the game). |
| Step-in | E + 0–250 [0–300] | The attacker's visual root slides in with an ease-out. A solver lines up **both** reach and the lateral position of the sword hand on the seam, so the blade goes in straight instead of 45° across. Exec tracks `exec_stab` (gut), `exec_armpit` (`thrustMid`) and `exec_neckHigh` (`thrustHigh`). The two new thrust poses are shallower lunges, so the hand rises to the higher seams. |
| Thrust + hit-stop | 250 | **80 ms** hit-stop [120], a steel spark at the seam, the impale burst at the exit, `Cam.kickFov(-4)`, the flash. |
| Hold | 330–680 | A shudder impulse at +120 ms, and at about 520 ms a 0.35 rad blade twist in the wound with a scrape. |
| Pull-out | 680–830 | The rip burst, a second smaller burst at the entry wound 60 ms later, drip flecks every 80 ms for 400 ms, the shake. |
| Collapse (`BD.Col`) | rip + 0 → about 1.9 s | `impaledRip → clutch (200) → buckle (420, knee thud + dust) → slumpFwd (640) → lieSide`. The rig topples sideways from 650 ms (`easeInQuad`, 1.38 rad), lands at about 1030 ms with a 4.5 % overshoot bounce over 160 ms (slam, dust, small kick), then three spreading blood pools. The last and widest pool persists. |
| Camera (Medium/High) | 0–2360 | A 3/4 side cut on Wren's sword-arm side, framed on the victim (3.2 m off the line, 0.6 m toward Wren, 1.3 m high, looking between the seam and Wren). It blends in over 120 ms, holds through thrust, hold and pull-out, dollies out to 3.9 m and down with the falling hips after 830 ms, and releases from 1960 to 2360 ms. Low has no cut (as before). The first framing (2.3 m off the midpoint, on Wren's off side) had her shoulder filling half the frame, so it was changed after the first strip. |

**Seams** (field kills cycle by `Fin.count % 3`; Odran's last is the gut):
- **gut**: hips→head 0.22, no sidestep
- **armpit**: 0.62 plus 0.16 m to the victim's right, under the raised sword arm, angled in from that side
- **neck** (gorget gap): 0.92

The kneeling down-plunge (`kind 'neck'`) is kept only for a victim that is genuinely kneeling.

**Odran:** he does the same beats, then `COL_TR_BOSS` brings him to `kneelDown`, swaying, through his dying lines (`odran_dying`). 0.4 s after `flags.odran_spoke` he topples onto his side over 600 ms (slam at volume 0.8) and stays down. `BD.corpse` and the "Kneel by the headsman" prompt are unchanged. The boss finale's shot 2→3 cut now happens 300 ms after the pull-out in real time. Shot 2 is now a 3/4 profile from Wren's sword side. It used to be behind Odran, and in the strip his back hid Wren and the blade. Odran's thrust uses a reach of 0.5 × blade length, so the point clears his bulk.

**The body stays.** The ash fade, the `sfx('ash')` call and every `root.visible = false` are gone (`Dis` is deleted). `Col.ground()` pins the lowest joint (head, hips, shoulders, hands, knees, ankles, with radii) to the ground every frame, so the body never floats or sinks. Entries are dropped when the region rebuilds (`afterBuild` / `respawn`) or if a fighter comes back to life. `enemyDead` without a finisher (for example a non-player kill) still gets a collapse from the current pose.

`VFX.stain` is wrapped so it returns the slot it used and resets that slot's life to 9 s. The corpse pool sets its own slot to a long life.

## Perf
- No per-frame allocations: all scratch vectors are preallocated, and the only allocations are one pose snapshot per break and one per collapse.
- Dead foes now stay drawn, the same skinned characters already in the scene. They were previously hidden after the ash. They are distance-culled by Ents as before.
- Low/Medium do no extra per-frame work beyond about 10 `getWorldPosition` calls per collapsing body.

## Not done
- **UAL Death01 / Hit clips (optional): not done.** The whole collapse is keyframed procedurally (deterministic, no `anim_data.json` rebuild).
- Fixplan §1.2 C (an overhead glint) and the extra overhead-parry flash: skipped, since the break now comes from normal accumulation.

## Tests
- `.test/align.js` (extended): 4 runs (m5 gut / armpit / neck, Odran gut). For each: blade-to-seam miss < 0.12 m; the blade passes through the torso along the thrust (within 0.22 m of the spine, forward component > 0.5, point ≥ 0.2 m past the spine); lunge inside its clamp; no errors.
- `.test/deathblow_seq.js` (new): parries real `d_over` swings with KeyF until posture breaks (4 parries on a gaoler, normal accumulation), then checks:
  - the breaking parry → `broken`, standing stagger with the arm up, E prompt within 300 ms (0.217 s)
  - E → seam thrust at 0.20–0.30 s, 80 ms hit-stop, step-in, pull-out at 0.62–0.74 s
  - the body landed (rig > 1.2 rad), lowest mesh point within ±0.05 m of the floor, still there, down and visible 10 s later, persistent pool, no errors
- `.test/boss.js`: the three chunk-D ash assertions are updated to the new truth (the field foe falls and stays; Odran kneels through his words with rig rotation 0, then falls and stays). No combat-timing assertion was touched.
- `.test/shots_G1.js` (new): a real Chromium strip, `shots/G1_{field,boss}_N_<beat>.png`.

## Results (final code)
| Test | Result |
|---|---|
| ct | 72/72 |
| v8 | 40/40 |
| v6 | 29/29 |
| p1 | 97/97 |
| boss | 50/50 |
| keyflow | 54/54 |
| merge | 14/14 |
| smoke | ok (self-tests 72/72, no errors) |
| align | 20/20 |
| deathblow_seq | 18/18 |

Measured in align (blade-to-seam miss / forward component / point past the spine):
- gut: 0 / 0.86 / 0.42 m
- armpit: 0 / 0.84 / 0.38 m
- neck: 0 / 0.93 / 0.42 m
- Odran gut: 0 / 0.80 / 0.52 m

In deathblow_seq:
- the gaoler broke on the 4th overhead parry
- prompt at 0.217 s
- thrust at 0.267 s after E, 80 ms hit-stop, pull-out at 0.683 s
- lowest mesh point −0.047 m, still −0.047 m 10 s later

**Shots** (High, swiftshader):
- Field: `shots/G1_field_{1_parry,2_stagger,3_stepin,4_impale,5_pullout,6_fall,7_floor}.png`
- Boss: `shots/G1_boss_{1_parry,2_stagger,3_stepin,4_impale,5_pullout,6_kneel,7_fall,8_floor,9_floor_late}.png`

**Strip caveats** (all artifacts of the script holding the game for minutes per frame):
- The boss frames 6–9 show the `odran_dying` dialogue box, because its 5.6 s wall-clock `setTimeout` fires during the long holds. The script also forces `odran_spoke` to film the topple.
- The field `floor_late` frame was not captured: that watcher waited on a collapse clock that stops when the collapse finishes (fixed in the script for the boss run). The 10 s persistence is asserted in deathblow_seq.
- In the browser, frames are coarse (dt capped at 0.1 s under swiftshader), so beat times there are only to 0.1 s.
