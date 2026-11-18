# VEYNHOLD: deathblow direction

Presentation spec for every deathblow, plus the keyframe data in `assets_incoming/deathblow_clips/`. Nothing here touches `src/` or the core. The only things this doc asks of the core are the blueprint §7.1 bookmarks it already plans (events plus a deathblow clock `dbT` that pauses during core hit-stop) and the deterministic variant id (§7.4).

**The brief:** every deathblow is the climax: *"I read him perfectly and now he dies."* It should carry weight, commitment and finality. The blade goes cleanly into a vital point. The kill grows out of the posture-break pose. It should be dark, cold, brutal, elegant and readable on a Chromebook.

## 0. Conventions (read once)

- **Clocks.** `t` is the core deathblow clock in seconds (blueprint §7.1). It advances only when the core `freeze === 0`. `f` is the 60 Hz frame number, `f = round(t·60)`. **Wall clock** is `t` for t ≤ 0.32, and `t + 0.100` after that, because the 6-tick Impact hit-stop pauses `dbT` for 100 ms of wall time. Every pose key is on `t`, so the impact tick and Unlock land exactly where the core puts them.
- **Normal schedule:** Commit 0.00 (f0) · Drive 0.28 (f17) · Impact 0.32 (f19) · Settle 0.55 (f33) · Extract 0.95 (f57) · Blade-clear 1.15 (f69) · Unlock 1.40 (f84) · presentation end 2.25 (f135).
  - Wall clock: Impact 0.32, Unlock **1.50**, presentation end 2.35. The kill reads as about 1.5 s, inside the 1.1–1.6 s brief.
- **Boss schedule:** Settle 0.80 (f48) · Extract 1.45 (f87) · Blade-clear 1.65 (f99) · Unlock 1.90 (f114) · presentation end 2.75 (f165).
  - Kingsfall may hold its last frame to **3.00 s** (f180) for the title card. Presentation only; the core is already unlocked.
- **Space.** Camera and root numbers are in **victim space**: origin at the victim's feet at Commit, +Z is the way the victim faces, +X is the victim's left, metres.
  - For front variants, Wren starts on +Z facing −Z (yaw 180°). Her sword hand is therefore on the victim's left (+X), which is the heart side.
  - For stealth variants, Wren is on −Z facing +Z (yaw 0).
- **Pose rig.** These are the 15 joints of `src/anim.js` (`hips, torso, head, lSh, lEl, lHand, rSh, rEl, rHand, lLeg, lKnee, lFoot, rLeg, rKnee, rFoot`). Rest pose is arms hanging, facing +Z, left = +X, identity rests.
  - `torso` is spine_03/chest. spine_01/02 and neck_01 are the existing `models.js QMAP` blends, so "spine" and "neck" in the tables mean those blends.
  - Euler values are **rig-local, three.js 'XYZ' order, in degrees**. Sign cheat sheet:
    - torso/head +X leans forward or nods down; +Y turns left; +Z leans right.
    - Shoulder −X raises the arm forward (−90 is horizontal, −180 is overhead). Right shoulder −Z (left shoulder +Z) lifts the arm out to the side.
    - Elbow −X flexes. Thigh −X swings it forward. Knee +X flexes. Foot +X points the toe.
  - Wrist: the clips use `anim_data.json W0.u2`, the same grip convention as the sword strings.
- **Victim scales:** duelist 1.0, Iron Warden 1.22 (`LOOKS.warden.scale`), King 1.06. All spacings below already include them.
- **Data:** one JSON per variant, decoded by `assets_incoming/deathblow_clips/sample_clip.js`. It contains a 20 fps grid **plus a key exactly on every core tick**, so the 40 ms Drive→Impact snap is never smoothed away. Section 11 has the format and the integration sketch.
- **Blade pinned in the wound.** Wherever a key carries a blade line (vital point, travel direction, hand-to-point distance), Wren's right arm and wrist were solved by IK onto it at that key, and then re-solved on every exported frame between pinned keys. Results:
  - Wrist-to-line error is **≤ 2 mm** on the in-wound keys of six variants, and 16 mm (King Phase I) at worst.
  - After the per-frame refinement, the blade line misses the vital point by **≤ 3 mm** on hold frames. The exceptions are the moving-cut frames: Turning Cut 27 mm in its 40 ms sweep, the throat cut 44 mm in the draw, and Shoulder Drive 81 mm on the 0.28 approach frame, before the blade enters.
  - At Impact the point comes out of the far side by **0.44–0.84 m** (`blade.past_point_m` in each JSON).

## 1. The shared shape of a deathblow (what all eight variants do)

| Phase | t (f) | What the player must read | Pose rule | Presentation rule |
|---|---|---|---|---|
| 0 Break | before t = 0 | "He's open." | Family break clip (section 9): snap 0.10 s, sag by 1.0 s, loop [1.0, 2.5] | Posture-break flash, `#dbHint` after 0.2 s |
| 1 Commit | 0.00 (f0) | "I chose this." | Blend from the **displayed** pose to the clip in 0.12 s (smootherstep). Wren eases onto the authored root over 0.22 s (the absorb). Never snap. | Letterbox in, grade starts, world bus lowpass |
| 2 Coil | 0.00–0.14 (f0–8) | Wind-up: weight drops, blade drawn back | Authored `coil` / `overhead` / `crouch` | Camera starts its move |
| 3 Drive | 0.28 (f17) | Point at the seam | Blade line pinned 0.6–1.0 m short of the vital point | "Blade slide" audio layer |
| 4 Impact | 0.32 (f19) | **Steel in the vital point** | Hand-to-point 0.20–0.60 m, point 0.44–0.84 m out the far side | 6-tick hit-stop, edge flash, entry spurt, wet impact, start of the silence |
| 5 Hold | 0.32–0.55 (f19–33) | "It went all the way in." | Victim folds or arches around the fixed blade. Wren presses in, off hand on his shoulder or mouth. | 40 % presentation slow-mo (section 2), camera holds or orbits |
| 6 Settle → Extract | 0.55–0.95 (f33–57) | Tension | Small tremble on the victim (2–3°, 5–9 Hz). Wrist twist 28–36° at the midpoint. | Rising payoff layer, tension breath |
| 7 Extract | 0.95–1.15 (f57–69) | The kill-off | Off palm or boot drives him off. Blade pulled out along `extractDir`. | Blade-draw sweep |
| 8 Blade-clear | 1.15 (f69) | **Finality** | Victim takes the launch (core v = 1.1 m/s along `extractDir` + 0.25 up). Death clip takes over. | Main spray along `extractDir`, shake 0.3 s / 3° |
| 9 Unlock | 1.40 (f84) | "I'm free." | Wren in chiburi or recovery. Fully cancelable from here. | Camera blends to gameplay over 0.5 s |
| 10 Settle | 1.40–2.6 | The body stays | Victim falls into its lie pose by 2.4–3.0 s, then hands off to `Col.ground` | Letterbox and grade out by presentation end |

**Hand-off to the collapse:** from Blade-clear, the victim track *is* the collapse (Death01 or Death02 retimed). The existing `BD.Col` should take the victim's displayed pose at the track's end, or at any interrupt, and only ground and pin it. That replaces `COL_TR` for these variants and keeps the bounce/slam/pool logic.

## 2. Presentation curves (shared)

### 2.1 Slow-mo: a presentation-only dilation clock
The sim is **never** slowed. Gap #2 of the research doc says to remove `Cine.slow(1.0, VISUAL.slowmo)` from `case 'deathblow'`. In its place, add a presentation rate `r(t)`. It scales **only** particle, cloth/cape and ember simulation, camera orbit angular speed, and grade animation. It never scales pose sampling, which follows `dbT`.

| Window (core t) | r | Feel |
|---|---|---|
| 0.00 → 0.32 | 1.00 | Commit and drive at full speed: commitment |
| Impact hit-stop (100 ms wall) | 0.04 | Near-freeze: sparks and blood hang |
| 0.32 → 0.38 | 0.04 → 0.60, ease-out | Breath out |
| 0.38 → Extract − 0.10 | **0.60** (40 % slow) | The held wound, with drifting embers and blood motes |
| Extract − 0.10 → Blade-clear | 0.60 → 1.00, ease-in | Snaps back for the kill-off |
| Blade-clear → end | 1.00 | Real speed for the body's weight |

- Boss and Kingsfall use **0.55** in the hold. Stealth uses **0.70**: quieter, less operatic.
- The poses already carry the slow feel: the hold keys barely move, with trembles at 5–9 Hz.
- Measured from wall-clock 0.42 to 0.95, presentation runs at about 0.6×, which is 40 % visual slow-mo. The core impact tick lands exactly on time.

### 2.2 Letterbox, grade, edge flash
| Element | In | Hold | Out | Final-deathblow-of-fight |
|---|---|---|---|---|
| Letterbox bars (each) | 0 → 8.5 % of screen height, Commit → 0.18 s, ease-out cubic | to presEnd − 0.35 | 0.35 s ease-in | 11 %, held through the victory card |
| Desaturation | 0 → 0.30 by Impact (ease-out); spike 0.50 for 3 frames at Impact | 0.30 | from Unlock over 0.6 s | 0.45 at Impact, then 0.38 |
| Grade shift | shadows lifted 4 % toward #1b2430 (cold), contrast +8 %, exposure −0.15 EV by Settle | | with desat | red-black floor fade (section 2.4) |
| Red survives | hue 345–15° keeps 85 % saturation, so blood stays red in the grey | | | |
| Edge flash | 1 frame at Impact: `#vhFlash` (exists) at 0.38 normal / 0.55 boss, decay 120 ms | | | 0.6 + a second 0.25 pulse at Blade-clear |
| FOV kick | −3° at Impact, 0.17 s (existing `Cam.kickFov`) | | | −5° |

- **Low tier:** skip the selective "red survives" and use a uniform desat of 0.25. Doing it without a post pass is in section 10 #6.

### 2.3 Hit-stop
- The core holds **one 6-tick stop at Impact** (blueprint §7.1).
- The presentation hold (`Hold`, H2) is capped at that stop. The blade-feel springs stay at weight 0 through the deathblow, as H2 already does.
- There is **no** second freeze at Blade-clear. Its weight comes from the shake and the spray.

### 2.4 Final deathblow of a fight
This is the last foe, or a boss's last mark (`Juice` `final` / `worldBossFinal`).
- Letterbox 11 %.
- Camera: the alternate keys in each table, lower and tighter, with a longer hold.
- From Blade-clear, a radial red-black floor fade (#1a0204 at 35 % at the edges, centre clear) over 0.6 s. It is held until the card and lifts over 0.8 s after it.
- **This must never use the full-screen red or the timing of the player death fade.** That fade means "you died", and the two must not be confusable.
- The victory card (existing) fades in at presEnd + 0.15. Kingsfall gets its own card (section 3.8).
- Music: the bed is cut at Impact. At presEnd − 0.3, one low bell or choir stinger plays (normal fights: none).

### 2.5 Audio: shared layer map
- All layers go through the H2 `exec` send, unless the layer says otherwise.
- The world bed (music and ambience) goes through a lowpass to 500 Hz in 0.3 s from Commit, released over 2.0 s from presEnd (Sekiro's muffle).
- Stingers are not filtered.

| Layer | t | Recipe (WebAudio, existing `audio.tone/nz`) | dB |
|---|---|---|---|
| L1 Plant | 0.05 | Cloth rustle: bandpass noise 1.1 kHz, 90 ms. Boot scuff: lowpass noise 300 Hz, 60 ms. | −14 |
| L2 Draw / blade slide | Drive − 0.06 → Impact | Steel shimmer: bandpass noise 3.2→4.8 kHz, 60 ms, plus a 2.6 kHz triangle tick | −12 |
| L3 Wet impact | Impact | Sub thud: 46→26 Hz sine, 0.6 s (exists as `impale`/`dbEntry`). Wet body: lowpass noise 380 Hz, 140 ms. Squelch: bandpass 900 Hz Q1.2, 60 ms. Bone tick: 2.1 kHz, 50 ms. | 0 (reference) |
| L4 Silence | Impact + 0.06 → Impact + 0.24 (**180 ms**; boss **240 ms**; stealth 120 ms) | Duck everything except L3's sub tail by −30 dB (bed gain 0.03 over 20 ms) | — |
| L5 Rising payoff | Settle → Extract | Low drone 55→82 Hz sine with a slow 4 Hz tremolo, plus a breath (bandpass 600 Hz noise, 0.5 s). Swells −24 → −10 dB. | −10 at peak |
| L6 Twist scrape | Hold midpoint | Bandpass noise 1.3 kHz, 0.22 s, with a 760 Hz triangle (exists as `rip`/scrape) | −16 |
| L7 Extract draw | Extract → Blade-clear | Blade draw: bandpass sweep 1.4 → 0.6 kHz, 0.20 s. Wet suck: lowpass 500 Hz, 0.1 s. | −8 |
| L8 Spray | Blade-clear | Highpass noise 1.2 kHz, 0.25 s, panned along `extractDir` | −10 |
| L9 Body fall | Victim contact frame (per variant) | 52→30 Hz sine, 0.8 s, plus lowpass noise 300 Hz (exists as `slam`). Knees first: 0.6× version. | −6 |
| L10 Final stinger | presEnd − 0.3 (final only) | Low bell: 110 Hz + partials 2.76× / 5.4×, 3 s decay, steel send | −8 |

**Muffled stealth variant:**
- The whole kill chain goes through a lowpass at **900 Hz**.
- L2 is dropped; a cloth grab (bandpass 700 Hz, 80 ms) plays in its place.
- L3 is at −8 dB, with no bone tick.
- L5 is replaced by a single held breath that is cut off at Impact + 0.05, then a long exhale (bandpass 500 Hz, 0.9 s, −20 dB) from Settle.
- No L8. L9 at 0.5×.
- The bed is ducked only to −12 dB (no 500 Hz muffle), so the world keeps breathing around a private act.

### 2.6 VFX cue map (shared; per-variant positions in section 3)
| Cue | t | Spec (Medium/High) | Low |
|---|---|---|---|
| Posture-break flash | break | Existing `postureBreak` FX + `Post.pulse('255,200,90')` | Same |
| Steel spark | Impact | 6–8 sparks at the entry point, white-gold, 80 ms (the blade touching armour, not a deflect: no ring) | 4 |
| Entry spurt | Impact + 1 frame | 10 flecks, dark red 0x6a0a08→0xb01510, along −bladeDir, splash ×1 | 6 |
| Embers / ash | Hold | 6–10 embers (`M.fx.embers`) rising from the wound at the r(t) rate; boss: 16, crimson | 4 |
| Drip | Settle → Extract | 1 drip every 80 ms from the exit point (blade tip) | Every 160 ms |
| Main spray | Blade-clear | 24–30 flecks along `extractDir`, cone 25°, upward 0.25; splash ×2; stain 1.6 m | 12 flecks, 1 splash |
| Exit-wound burst | Blade-clear + 60 ms | 8 flecks at the entry point | Skip |
| Pools | Lie pose + 0.3 s | Existing 3 spreading pools, last persists | 1 pool |
| Dust | Each body contact | Existing knee thud + dust | Same |

**Ink/blood toggle:** every blood cue has an ink twin with the same timing, count and direction.
- Colour #0b0b10 with 12 % blue.
- Flecks become brush-stroke sprites stretched ×2 along their velocity.
- Pools become a dry ink stain that never spreads.
- The "red survives" grade keeps hue 220–250 instead, so the ink reads blue-black.
- Stealth uses the existing `inkPuff(pos, 26)` at Impact + 0.1 in both modes.

## 3. The variants

Selection is deterministic (blueprint §7.4: `profile.deathblowVariant || mapLook(look)`, plus the front/behind split from research gap #11):
- `duelist` → Heart Pierce.
- `brother` (False Brother) → Turning Cut.
- `warden` lesser → Shoulder Drive.
- `warden` boss's final mark (Odran) → Crown Splitter.
- Unseen kill from behind → Stealth back-stab. When the victim's head is above Wren's eye line (`victim.scale ≥ 1.1`) or the victim is facing a wall, Stealth throat cut instead.
- `king` with `marks > 1` → King Phase I. Reuse it for any middle phase of the three-phase duel in the story bible.
- `king` final → Kingsfall.

Each subsection gives a frame-accurate table (core t, 60 Hz frame, wall clock), the camera keys, cue positions and the identity notes. Full bone tables at every tick for both actors are in **Appendix A**, generated from the same data as the JSON. Retime maps are in the README.

### Camera conventions
- Keys are in victim space. `pos` is the camera position and `look` is its target.
- Between keys the camera eases with the named ease, using position and target splines (Catmull-Rom over the keys). Orbit keys rotate `pos` about the victim's vertical axis through `look`.
- "→gameplay" means: blend to the gameplay camera over 0.5 s from Unlock, ease-in-out. The player may move during the blend.
- **Occlusion:** if a segment from `look` to `pos` hits the region's camera-blocking geometry (`Region.camClear`, blueprint §9), swing to the mirrored side (x → −x). If that also clips, pull in along the segment to 0.2 m before the hit. The shot never cuts mid-deathblow.
- **Low tier:** the same keys, with no orbit. Hold the key nearest the orbit's midpoint, which saves the per-frame occlusion re-test.

### 3.1 Heart Pierce: duelists (standard front deathblow)
**Identity:** the textbook kill. Wren's point goes in under his left breast and out between the shoulder blades. She leans her weight in, hand on his shoulder, gives it a quarter-turn, then palms him off the blade.
- Vital point: `heart` (chest, 6 cm left of centre).
- Blade travels −Z (front to back).
- `extractDir` = (+0.55, −0.83): he goes back and to his left, away from her sword arm.

| Beat | t | f | wall | Wren | Victim |
|---|---|---|---|---|---|
| Commit | 0.00 | 0 | 0.00 | From her guard; root 1.75 m out (re-warped to her real distance) | `brk_std_low`: sagging, sword arm half up, chest open |
| Coil | 0.14 | 8 | 0.14 | `coil`: hips turned 25° right, blade drawn to the hip, right knee 45° | |
| Step-in done | 0.26 | 16 | 0.26 | Root at 0.95 m (ease-out). Front (right) foot planted. | Head lifts: "he sees it" |
| Drive | 0.28 | 17 | 0.28 | `lunge`, blade line pinned 0.67 m short of the heart | |
| **Impact** | **0.32** | **19** | 0.32 | `lunge`: hand 0.42 m in front of the heart; point 0.62 m out of his back | Arches onto the blade (`Idle_Shield_Break@0.34`, torso −12°, head −22°) |
| Fold | 0.43 | 26 | 0.53 | Pinned | Folds around it (`Hit_Stomach@0.12`, torso −34°) |
| Settle | 0.55 | 33 | 0.65 | `press`: weight in, left palm on his right shoulder; hand-to-point 0.34 m | Hold with tremble (torso 2.2° at 7 Hz, head 3° at 5 Hz) |
| Twist | 0.75 | 45 | 0.85 | Wrist +28° about the blade | Head starts to drop |
| Extract | 0.95 | 57 | 1.05 | Left palm moves to his sternum: the kick-off push; wrist +32° | Arms go slack |
| **Blade-clear** | **1.15** | **69** | 1.25 | `pull_through`: arm swept out to her right (rSh Z −82°), torso −32° yaw; root back to 1.10 m | Launched: `Death02@0.30`; root starts its 0.6 m slide along `extractDir`, yaw +55° |
| Unlock | 1.40 | 84 | 1.50 | `chiburi` flick: blood thrown off to her right | Knees at 1.65 (`Death02@0.90`, knee thud) |
| Settle | 2.25 / 2.6 | 135 / 156 | | `stand_ready` | Face down by 2.6 (`Death02@2.0`). Body fall L9 at **1.95**. |

**Camera** (victim space; Wren's sword side is +X):

| Key | t | pos | look | FOV | ease |
|---|---|---|---|---|---|
| C0 | 0.00 | gameplay | gameplay | 60 | blend 0.12 s |
| C1 | 0.12 | (2.45, 1.45, 1.55) | (0.10, 1.15, 0.45) | 48 | ease-out cubic |
| C2 Impact | 0.32 | (2.20, 1.55, 0.90) | (0.00, 1.15, 0.25) | 44 | ease-out cubic (the push-in lands on Impact) |
| C3 | 0.32 → 0.95 | orbit +10° about Y (toward +Z) at 16°/s × r(t) | same | 42 | linear |
| C4 | 1.15 | (2.70, 1.30, 1.25) | (0.20, 0.95, 0.10) | 50 | ease-in-out (pull back with the fall) |
| C5 | 1.40 | →gameplay | | | 0.5 s |

- **Final of fight:** C2 at (1.55, 1.05, 0.95), FOV 38, look (0.05, 1.10, 0.35) (low, looking up at the impale). The orbit runs to +16°. C4 holds until 1.7.

**Cues:**
- Spark plus entry spurt at the heart point, Impact.
- Drip from the exit point, Settle → Extract.
- Spray along (+0.55, 0.25, −0.83) at Blade-clear, from the entry point.
- Embers: none for duelists (the shared ember cue is for bosses).

### 3.2 Turning Cut: False Brother
**Identity:** the iai pass. Wren goes past his sword side, low and fast. The edge goes through his throat at 0.32. Then both stand **frozen back to back**, still, for 0.6 s (the silence). His throat opens only at Blade-clear, as she flicks the blood off behind her. It is elegant, almost polite, and the most "samurai" read in the set.
- Vital point: `throat`.
- Blade travels +X across the throat at Impact, then (0.9, 0, −0.45) as it leaves.
- `extractDir` = (−0.30, +0.95): the spray goes forward, toward where she came from.

| Beat | t | f | wall | Wren | Victim |
|---|---|---|---|---|---|
| Commit | 0.00 | 0 | 0.00 | Root (−0.25, 1.85) | `brk_std_low` |
| Coil | 0.16 | 10 | 0.16 | `coil`: low, blade back | |
| Drive | 0.28 | 17 | 0.28 | `pass_cut`, running past his right side; root (−0.45, 0.85) | Head turns 25° to follow her |
| **Impact** | **0.32** | **19** | 0.32 | Edge through the throat, hand 0.50 m from it; root (−0.55, 0.42) | Head snaps (`Hit_Head@0.10`) |
| Exit | 0.40 | 24 | 0.50 | Blade leaves the far side; root (−0.65, 0.05) | |
| Settle | 0.55 | 33 | 0.65 | `zanshin`: deep knees, blade out low to her right, back to his back; root (−0.80, −0.55) | `Hit_Head@0.22`: stands, not yet knowing |
| Hold | 0.55–0.95 | 33–57 | | Frozen (head turns 6°) | Tremble on the head only (1.2° at 4 Hz) |
| Extract | 0.95 | 57 | 1.05 | Begins to rise | |
| **Blade-clear** | **1.15** | **69** | 1.25 | `chiburi`: the blood flick | Left hand to the throat (1.12). **The spray** opens along `extractDir`. |
| Unlock | 1.40 | 84 | 1.50 | `stand_ready` | `Death02@0.35` at 1.35 → knees 1.9 → face down 2.6 |

**Camera:** two-shot, profile on the pass line.

| Key | t | pos | look | FOV | ease |
|---|---|---|---|---|---|
| C1 | 0.10 | (−2.6, 1.40, 0.9) | (−0.4, 1.20, 0.3) | 46 | ease-out |
| C2 Impact | 0.32 | (−2.6, 1.50, 0.2) | (−0.3, 1.35, 0.20) | 42 | ease-out cubic |
| C3 | 0.55 | (−3.2, 1.30, −0.2) | (−0.4, 1.20, −0.25) | 44 | ease-in-out: pull out to frame both, back to back |
| C3h | 0.55 → 1.12 | **static** (stillness is the point) | | | |
| C4 | 1.15 | (−2.4, 1.25, 0.6) | (0.0, 1.30, 0.10) | 40 | 0.18 s snap toward his throat as it opens |
| C5 | 1.40 | →gameplay | | | |

- **Final of fight:** C3 at (−3.6, 0.9, −0.3), FOV 36. The hold runs to 1.25 and the spray happens in the wide shot.

**Cues:**
- At Impact: a thin steel streak along the cut (trail spike ×1.6) and **no blood**; at most 2 flecks.
- At Blade-clear: an arterial spray of 30 flecks in a 15° cone, plus a second burst at +120 ms.
- Audio: L4 silence stretched to **0.55 → 1.10** (the whole hold), with only the wind bed at −30 dB.

### 3.3 Crown Splitter: the Iron Warden (Odran's last mark; boss schedule)
**Identity:**
- The headsman dies the way his prisoners did, kneeling with his head bowed.
- Wren rises with both hands high and brings the edge down into his crown.
- She leans her weight onto it, then saws it deeper at 1.20.
- At Extract she wrenches it out, up and back, and the giant falls over backwards.

This variant is the slowest, heaviest and most iconic.
- Vital point: `crownIn`, 45 % of the way from crown to head centre.
- Blade travels (0, −0.3, −1): edge down, the blade lying fore-and-aft along his skull.
- `extractDir` = (0, −1): he goes back.
- Victim scale 1.22.

| Beat | t | f | wall | Wren | Odran |
|---|---|---|---|---|---|
| Commit | 0.00 | 0 | 0.00 | Root 2.5 m out | `brk_heavy_kneel`: one knee down, hunched, head bowed: the crown is offered |
| Rise | 0.20 | 12 | 0.20 | `overhead`: both hands high, arching back 14° | Lifts his head (−14°): sees it coming |
| Drive | 0.28 | 17 | 0.28 | `cleave`, edge 0.95 m above and in front of the crown; root 1.50 m | |
| **Impact** | **0.32** | **19** | 0.32 | Edge in the crown, blade down at 45° (dir (0, −0.7, −0.7)); hand 0.60 m up and in front; left hand on the right wrist | Head driven down 26°, torso 14° |
| Weight | 0.80 | 48 | 0.90 | Leans in (torso +6°) | Sword arm hangs (+20°) |
| Saw | 1.20 | 72 | 1.30 | Torso +8°, pinned 65 % deep | Tremble 1.6° at 6 Hz, sword arm twitch 4° |
| Extract | 1.45 | 87 | 1.55 | | |
| **Blade-clear** | **1.65** | **99** | 1.75 | `overhead` +40°: wrenched out, up and back; root to 1.75 | Wrenched upright and over (`Death01@0.90`) |
| Unlock | 1.90 | 114 | 2.00 | `chiburi` | Falls back (`Death01@1.35` at 2.25) |
| End | 2.75 / 3.0 | 165 / 180 | | `stand_ready` | On his back (`Death01@2.4`). **Ground slam L9 at 2.35** (1.0×, the biggest in the game), dust ring. |

**Camera** (low hero angle on Wren's left, so the arc of the blade crosses the frame):

| Key | t | pos | look | FOV | ease |
|---|---|---|---|---|---|
| C1 | 0.10 | (−2.5, 0.85, 2.6) | (0.0, 1.55, 1.3) | 50 | ease-out (low, looking up at her rising) |
| C2 Impact | 0.32 | (−2.1, 1.25, 1.9) | (0.0, 1.45, 0.95) | 46 | ease-out cubic |
| C3 | 0.32 → 1.45 | slow push-in, 0.25 m along the view ray, plus orbit −8° | | 42 | linear × r(t) |
| C4 | 1.65 | (−2.8, 1.20, 2.1) | (0.0, 0.70, 0.4) | 50 | ease-in-out: he falls through the frame |
| C5 | 1.90 | →gameplay over **0.6 s** | | | |

- **Final of fight** (it always is, for Odran): C2 at (−1.8, 0.80, 1.8), FOV 42. Hold C4 until 2.5. Then the Odran dying-lines flow (`odran_dying`) takes over from the lie pose instead of `COL_TR_BOSS` → `kneelDown`.
  - This variant replaces the kneel-and-speak beat. If narrative needs his lines while he is alive, use **Shoulder Drive** for his final mark instead and keep `COL_TR_BOSS`.

**Cues:**
- At Impact: a helm spark burst, 12 sparks (it is steel on steel), and the entry spurt upward.
- A dark drip runs down his face through the hold.
- 16 crimson embers.
- At Blade-clear: the spray goes up and back along the wrench (+Y bias 0.6).
- His helm ring audio: a 2.6 kHz partial on the steel send at Impact.

### 3.4 Shoulder Drive: lesser wardens (normal schedule)
**Identity:** too big to reach the heart through his plate, so Wren goes **through the gap above the collarbone**.
- Her left shoulder slams into his chest.
- The blade is driven straight down into him from above, both of them locked.
- His hand claws at her back.
- She rips it up and out, and he goes down like a felled tree.

Technical details:
- Vital point: `clavL`, the left gorget gap.
- Blade travels (0, −0.92, −0.38), steeply down.
- `extractDir` = (+0.35, −0.94).
- Victim scale 1.22, buckled by the blow (knees 70°).

| Beat | t | f | wall | Wren | Warden |
|---|---|---|---|---|---|
| Commit | 0.00 | 0 | 0.00 | Root 1.9 m | `brk_heavy_stand`: guard dropped, sagging |
| Coil | 0.14 | 8 | 0.14 | `coil` | |
| Drive | 0.26–0.28 | 16–17 | 0.28 | `shoulder_check`: left shoulder leading (torso −30° yaw), arm overhead, point 0.60 m above the gap; root 0.82 m (her shoulder against his chest) | Rises 8° as she hits him |
| **Impact** | **0.32** | **19** | 0.32 | Hand 0.20 m above the gap; point 0.84 m down into him | Knees go (`brk_heavy_sag`), head −24°, left shoulder jerks |
| Settle | 0.55 | 33 | 0.65 | Pinned 0.15 m deep at the hilt | Right hand claws her back (reach to her shoulder blade) |
| Twist | 0.95 | 57 | 1.05 | Wrist +20° | Tremble: left shoulder 5° at 4 Hz, torso 1.5° at 7 Hz |
| **Blade-clear** | **1.15** | **69** | 1.25 | Ripped up and out (`overhead` variant); root back to 0.95 | Falls back (`Death01@0.25` → `@1.15` at 1.80) |
| Unlock | 1.40 | 84 | 1.50 | `chiburi` | On his back by 2.7. **L9 at 1.85**, 0.9×. |

**Camera:** tight two-shot from his left, looking slightly up, with the gorget in the upper third.

| Key | t | pos | look | FOV | ease |
|---|---|---|---|---|---|
| C1 | 0.10 | (2.3, 1.10, 1.3) | (0.1, 1.55, 0.35) | 48 | ease-out |
| C2 Impact | 0.32 | (2.1, 1.35, 0.7) | (0.10, 1.50, 0.40) | 46 | ease-out cubic |
| C3 | 0.32 → 0.95 | orbit +6° and rise 0.1 m | | 42 | × r(t) |
| C4 | 1.15 | (2.6, 1.30, 1.4) | (0.1, 0.9, −0.2) | 52 | ease-in-out: frame the fall |
| C5 | 1.40 | →gameplay | | | |

- **Final of fight:** C2 at (1.8, 1.0, 0.7), FOV 40.

**Cues:**
- A spark at the gorget rim at Impact.
- The entry spurt goes **up** (blood around the hilt).
- At Blade-clear: the spray goes up along the rip (+Y bias 0.8), then falls as rain.
- Dust ring when he lands.

### 3.5 Stealth back-stab (unseen; normal schedule; muffled)
**Identity:** quiet, low and intimate.
- She comes in crouched.
- She rises behind him, clamps her left hand over his mouth, and drives the blade up under his ribs into the heart.
- He arches up onto his toes.
- She holds him and the blade still, then **lowers him to his knees with her**, sliding the blade out on the way down.
- No flourish and no chiburi.

Technical details:
- Vital point: `back`, under the left shoulder blade.
- Blade travels (0, +0.45, +0.89): up and forward.
- `extractDir` = (0, +1).
- Hold slow-mo r = 0.70.

| Beat | t | f | wall | Wren | Victim |
|---|---|---|---|---|---|
| Commit | 0.00 | 0 | 0.00 | `Crouch_Fwd_Loop@0.0`, root (0, −1.55) | `unaware` (sword idle) |
| Close | 0.18 | 11 | 0.18 | Crouched at root −0.80 | |
| Rise | 0.28 | 17 | 0.28 | `stab_back`: left hand over his mouth, point 0.55 m short; root −0.52 | |
| **Impact** | **0.32** | **19** | 0.32 | Hand 0.28 m behind the point; point 0.76 m through | Arches (torso −16°, head −24°), up on his toes (+3 cm) |
| Settle | 0.55 | 33 | 0.65 | Holds | Arms spasm (shoulders 4° at 6 Hz), torso 1.8° at 9 Hz |
| Extract | 0.95 | 57 | 1.05 | Starts to sink | Goes slack |
| **Blade-clear** | **1.15** | **69** | 1.25 | `hold_low`: kneeling with him, left hand moved to his chest; blade out | Lowered to his knees (`Death02@0.85` at 1.35) |
| Unlock | 1.40 | 84 | 1.50 | `hold_low` → `Crouch_Idle` by 2.25 (stays low, still unseen) | Face down by 2.4. L9 at 0.5×. |

**Camera:** low and close, over the victim's right shoulder, toward Wren's face.

| Key | t | pos | look | FOV | ease |
|---|---|---|---|---|---|
| C1 | 0.08 | (−1.3, 0.95, 0.9) | (0.0, 1.25, −0.3) | 50 | ease-out |
| C2 Impact | 0.32 | (−1.5, 1.25, 0.5) | (0.0, 1.25, −0.25) | 46 | ease-out cubic |
| C3 | 0.32 → 1.15 | descend with them: y −0.45 by 1.35 | look y −0.55 | 46 | ease-in-out |
| C5 | 1.40 | →gameplay over 0.6 s | | | |

- **Letterbox:** 6 % only. Grade: desat 0.20, **no** red-survives push.

**Cues:**
- At Impact: entry spurt of 4 flecks.
- Ink puff `inkPuff(chest, 26)` at Impact + 0.10 (existing H4).
- At Blade-clear: the spray drops to 6 flecks, falling.
- Audio: the muffled chain (section 2.5).

### 3.6 Stealth throat cut (unseen; for tall victims or victims at a wall)
**Identity:** Wren's left hand takes his brow and pulls his head back. The edge is laid across his throat and **drawn back toward her** (a pull cut). She holds him while he goes still, then lowers him.
- Vital point: `throat`.
- The blade lies along +X with the edge in at Impact, then is drawn to (0.8, 0, 0.6) until the tip leaves the throat at 0.55.
- `extractDir` = (+0.5, +0.86).

| Beat | t | f | wall | Wren | Victim |
|---|---|---|---|---|---|
| Commit | 0.00 | 0 | 0.00 | Crouched, root (0, −1.5) | `unaware` |
| Grip | 0.28 | 17 | 0.28 | `throat_hold`, left hand on his brow, edge laid across; root −0.34 (pressed to his back) | |
| Wrench | 0.30 | 18 | 0.30 | | Head wrenched back 34° |
| **Impact** | **0.32** | **19** | 0.32 | Edge bites, hand 0.24 m from mid-throat | `Hit_Head@0.20`, head held back |
| Draw | 0.55 | 33 | 0.65 | Pull cut: the hand travels 0.45 m back and right, the tip leaves | Tremble on the head 2° at 6 Hz |
| Hold | 0.95 | 57 | 1.05 | Holds him | Right hand to his throat |
| **Blade-clear** | **1.15** | **69** | 1.25 | `hold_low` | Lowered: knees 1.35 → face down 2.4, yaw +30° |
| Unlock | 1.40 | 84 | 1.50 | `Crouch_Idle` | |

**Camera:** frontal three-quarter, low, looking up past his chin.

| Key | t | pos | look | FOV | ease |
|---|---|---|---|---|---|
| C1 | 0.08 | (0.9, 1.05, 1.5) | (0.0, 1.45, 0.0) | 48 | ease-out |
| C2 Impact | 0.32 | (1.1, 1.25, 1.5) | (0.0, 1.45, 0.00) | 44 | ease-out cubic |
| C3 | 0.55 → 1.35 | descend y −0.5 with them | | | ease-in-out |
| C5 | 1.40 | →gameplay | | | |

**Cues:**
- At Impact + 0.05: a fine spray of 8 flecks along the draw, forward and down.
- Ink puff at 0.42.
- Muffled audio. L2 becomes a cloth grab. A wet hiss on the draw: bandpass noise 2.4 kHz, 0.2 s, −18 dB.

### 3.7 King Aurec, Phase I (boss schedule; not a death)
**Identity:** this is the Heart Pierce, but **he takes it**.
- At Settle his left hand closes on Wren's sword wrist.
- At 1.20 he looks up at her: the teacher, defiant.
- She has to boot him off her own blade (the kick at 1.55).
- He skids back 1.25 m and drops to one knee. The phase II transition rises from that kneel.

Technical details:
- Vital point: `heart`.
- `extractDir` = (0, −1).
- Victim scale 1.06.
- No body fall and no pools. The wound burns with embers instead (the Vein).

| Beat | t | f | wall | Wren | King |
|---|---|---|---|---|---|
| Commit → Impact | as 3.1 | | | as 3.1 (root 1.8 → 0.95) | Arches onto the blade |
| Settle | 0.80 | 48 | 0.90 | `press`, left palm on his shoulder | `Hit_Stomach@0.18`, torso −30°; **left hand grips her wrist** (IK, 2 mm) |
| Defiance | 1.20 | 72 | 1.30 | Pinned | Head −34°: looks her in the eye |
| Chamber | 1.38 | 83 | 1.48 | `Kick@0.18` | |
| Kick | 1.55 | 93 | 1.65 | `Kick@0.34`: boot to his chest; blade comes out with it | |
| **Blade-clear** | **1.65** | **99** | 1.75 | `Kick@0.45` | `Hit_Knockback@0.25`: thrown down onto his back, root slides 1.05 m by 2.05 |
| Unlock | 1.90 | 114 | 2.00 | `Kick@0.80` → `stand_ready` | Rises from the floor to one knee by 2.75 (`Fixing_Kneeling@0.9`, torso −48°, head −10°): the phase-2 pose |

**Camera:**

| Key | t | pos | look | FOV | ease |
|---|---|---|---|---|---|
| C2 Impact | 0.32 | (2.2, 1.55, 0.9) | (0.0, 1.15, 0.25) | 44 | as 3.1 |
| C3 | 0.80 → 1.38 | **push-in to his face**, (1.2, 1.55, 0.7), look (0.0, 1.55, 0.15) | | 36 | ease-in-out |
| C4 | 1.55 | (2.8, 1.30, 1.6) | (0.0, 1.0, −0.5) | 52 | ease-out 0.2 s: the kick pushes the camera out |
| C5 | 1.90 | hand to the `phase2` Cine (existing `Cine.focus(e.f, 2.2)`) | | | |

**Cues:**
- Entry spurt.
- Crimson embers pour from the wound through the hold (24, rising slowly at r(t)).
- At the kick: a dust ring at his heel and the Vein-red pulse `Post.pulse('180,10,10', 0.6)` (existing `phase2`).
- No victory card, no stinger, no red-black floor fade.

### 3.8 Kingsfall: the King's last mark (boss schedule; the end of the game)
**Identity:** the most brutal and the most still.
- He is on his knees. As Wren raises Lanternfall point-down above him with both hands, **he lifts his head and looks at her** (0.22).
- The blade goes down through the hollow of his collarbone into the heart.
- His right hand rises and closes on her wrist (0.80). He is not resisting: he is holding on.
- She turns the blade (1.15). His grip opens and his head drops (1.38).
- She draws it up and out and steps back. He falls forward onto his face **at her feet**.

Technical details:
- Vital point: `heartTop`, 45 % of the way from heart to collarbone.
- Blade travels (0, −0.95, −0.3).
- `extractDir` = (−0.35, +0.94).
- Total 2.75 s, with the card hold to 3.00.

| Beat | t | f | wall | Wren | King |
|---|---|---|---|---|---|
| Commit | 0.00 | 0 | 0.00 | Root 1.55 m | `kneel_both`, head bowed 22° |
| Raise | 0.20 | 12 | 0.20 | `plunge_up`: both hands, point down, pinned straight above the wound (hand 1.05 m above it) | |
| Look | 0.22 | 13 | 0.22 | | **Lifts his head (−34°): looks at her** |
| Drive | 0.28 | 17 | 0.28 | `plunge_down`; root 0.70 m | |
| **Impact** | **0.32** | **19** | 0.32 | Hand 0.40 m above the point; point 0.64 m down into him | Jolts back: torso −18°, head −44° |
| Grip | 0.80 | 48 | 0.90 | Leans over him (torso +6°) | **Right hand closes on her wrist** (IK, 3 mm) |
| Turn | 1.15 | 69 | 1.25 | Wrist +24°: the turn | Still gripping, head −24° |
| Release | 1.38 | 83 | 1.48 | | Grip opens, head drops +10° |
| Extract | 1.45 | 87 | 1.55 | | |
| **Blade-clear** | **1.65** | **99** | 1.75 | Drawn up and out (`overhead` +60°); steps back and right to (0.35, 1.20), yaw 165° | `Death02@1.00` → falls forward |
| Unlock | 1.90 | 114 | 2.00 | `chiburi`, slow | Face down at her feet by 2.35 (`Death02@1.55`). **L9 at 2.30.** |
| End | 2.75 → 3.00 | 165 → 180 | | `stand_ready`, head bowed 10° | `Death02@2.4` |

**Camera:** the only variant with a cut (the boss finale already allows 3–4 authored shots, blueprint §9).

| Shot | t | pos | look | FOV | ease |
|---|---|---|---|---|---|
| S1 | 0.00 → 0.30 | Over Wren's right shoulder, high: (0.55, 2.10, 2.30) | His upturned face (0.0, 1.05, 0.15) | 40 | push 0.3 m, ease-out |
| S2 Impact | 0.30 → 1.40 | Low profile from his left: (1.9, 0.95, 0.40) | Hilt and hands (0.0, 1.20, 0.45) | 42 | static, then a 0.15 m push-in × r(t) |
| S3 Release | 1.40 → 1.65 | Close on the hands: (0.65, 1.05, 0.75) | (0.0, 1.10, 0.40) | 30 | static: the grip opens |
| S4 Fall | 1.65 → 3.00 | Wide, low, behind him: (−1.2, 0.55, −1.6) | (0.1, 0.4, 0.9) | 48 | slow rise 0.4 m: he falls toward her and the lens |
| Exit | 3.00 | Card, then →gameplay over 0.8 s | | | |

**Cues:**
- At Impact: a gold-red flash at 0.6, then a second 0.25 pulse at Blade-clear.
- Crimson embers from the wound, 24 of them, **dying out** (their spawn rate falls to 0 by 1.38: the Vein lets him go).
- At Blade-clear: the spray rises along the draw.
- **Crown falls** at 2.30 with the body (prop: drop-and-roll 0.6 m with 2 bounces; ring audio 1.8 kHz on the steel send).
- 0.6 s of drifting ash from 2.35.
- Red-black floor fade from Blade-clear.
- Audio:
  - Music cut at Impact.
  - L4 silence **240 ms**.
  - L5 replaced by his breathing: three breaths that stop at 1.38.
  - L10 stinger at 2.45.
- **KINGSFALL** title card at 2.90, held, then the ending sequence.

## 4. Posture break → deathblowable pose (section 9 has the clips)
- **Snap (0 → 0.10 s, ease-out cubic).** The break pose comes from the displayed pose.
  - Standard: `Idle_Shield_Break@0.30`, sword arm flung up and chest open.
  - Heavy: `Hit_Knockback@0.30`.
- **Hold (0.10 → 0.55 s).** The existing posture-break flash and `Cine` pulse play here.
  - The E prompt appears at 0.2 s (as G1 does). Keep that, so the stagger reads before the prompt.
- **Sag (0.55 → 1.0 s).** The victim sinks into the family's deathblowable pose:
  - `brk_std_low`: knees 22–24°, torso +16°, arm half down.
  - `brk_heavy_stand`, or `brk_heavy_kneel` (a knee thud at 0.55).
  - `kneel_both` for the King's final.
- **Loop (1.0 → 2.5 s, crossfade 0.12 s at the seam).** A breathing sway (torso 1.5° at 0.7 Hz, head 2° at 0.5 Hz) until Commit or the window closes.
- Recommend raising the enemy break window from 2.2 s to **2.5 s** (Sekiro, research gap #12) so the loop is actually seen.
- **Commit hand-off:** every deathblow track starts on exactly that family pose. At Commit, blend from the *displayed* pose (whatever loop phase it is in) over 0.12 s, so the hand-off is seamless at any moment of the window.

## 5. Step-in / hand-off (the absorb)
- **Wren's root is authored** (section 3, Appendix A). At Commit the game knows her real offset from the victim, `d0`, which is anywhere inside the deathblow range.
- Play the clip root with a warp:
  - Warped position: `root(t) = lerp(d0, clipRoot(t), w(t))`.
  - Warp weight: `w = smootherstep(t / 0.22)` for front and stealth, and `t / 0.30` for Crown Splitter, Kingsfall and Shoulder Drive.
  - Facing turns at most 16 rad/s over the same window.
  - Separation stays off (`ignoreSeparation`) from 0 to Unlock.
- The victim is **not** moved before Impact; the attacker comes to him. Front variants only rotate the victim to face Wren, over the same 0.22 s. Stealth variants never turn him.
- If `d0` is larger than the authored start, the first 0.14 s gets a sliding lunge (Sekiro moves Wolf onto the absorb dummy over 0.5 s; here it is 0.22 s, because the core Commit→Drive is 0.28 s).

## 6. Death reaction and settle
- **Blade-clear onward,** the victim track is a retimed Quaternius death:
  - `Death02`: knees, then face down. Used by Heart Pierce, Turning Cut, stealth and Kingsfall.
  - `Death01`: falls backwards. Used by the Warden variants.
- **Root** slides 0.3–0.6 m along `extractDir` with a 20–70° yaw, so no two bodies land the same way. The core's launch velocity (1.1 m/s along `extractDir` + 0.25 up) matches that slide: 0.6 m over about 0.5 s with the existing ×0.9 friction.
- **Contact frames for L9 and dust:** Heart Pierce 1.95, Turning Cut 2.2, Crown Splitter 2.35, Shoulder Drive 1.85, stealth 1.75 (knees) and 2.3, Kingsfall 2.30.
- **After the track ends,** `Col.ground` takes over pinning only: lowest joint to the floor, pools, and the body stays (G1 behaviour).
- **Bake the corpse** once its lie pose is final (section 10 #7).

## 7. Recovery (Wren)
- **Unlock** (1.40 / 1.90): Wren is in `chiburi`, with blood flicked off to her right (a 4-fleck splash along her blade's swing).
- Any input pressed during [Blade-clear, Unlock) is latched and fires on Unlock (research gap #9). Earlier presses are dropped.
- From Unlock, the clip weight fades out over 0.30 s into her stance (`stand_ready` is the last key, so no fade pops). Movement input fades it at once, over 0.15 s.
- `plantT 0.11` applies (blueprint §3.2).
- Stealth recovery stays crouched (`Crouch_Idle`), so she is still unseen.
- Kingsfall recovery is locked to the cinematic until the card.

## 8. Variant summary
| Variant | Clock | Unlock (wall) | Vital / blade line | Wren spacing at Impact | Victim | Sources (CC0 Quaternius) |
|---|---|---|---|---|---|---|
| Heart Pierce | normal | 1.50 | heart, −Z | 0.95 m | 1.0 | Sword_Dash_RM (step/recovery), Idle_Shield_Break, Hit_Stomach, Death02 |
| Turning Cut | normal | 1.50 | throat, +X | passes at 0.55 m lateral | 1.0 | Sword_Dash_RM, Idle_Shield_Break, Hit_Head, Death02 |
| Crown Splitter | boss | 2.00 | crown, edge down at 45° | 1.50 m | 1.22 | Sword_Dash_RM, Fixing_Kneeling, Death01 |
| Shoulder Drive | normal | 1.50 | gorget gap, down | 0.82 m (shoulder contact) | 1.22 | Sword_Dash_RM, Idle_Shield_Break, Death01 |
| Stealth back-stab | normal | 1.50 | back → heart, up | 0.52 m behind | 1.0 | Crouch_Fwd_Loop, Crouch_Idle_Loop, Sword_Idle, Hit_Chest, Death02 |
| Stealth throat cut | normal | 1.50 | throat, pull cut | 0.34 m behind | 1.0 | Crouch_Fwd_Loop, Crouch_Idle_Loop, Sword_Idle, Hit_Head, Death02 |
| King Phase I | boss | 2.00 | heart, −Z | 0.95 m | 1.06 | Sword_Dash_RM, Kick, Idle_Shield_Break, Hit_Stomach, Hit_Knockback, Fixing_Kneeling |
| Kingsfall | boss (+0.25 card) | 2.00 | heartTop, down | 0.70 m | 1.06 | Sword_Dash_RM, Death02 |

The attacker's strike poses (`lunge`, `press`, `coil`, `cleave`, `overhead`, `plunge_*`, `shoulder_check`, `stab_back`, `throat_hold`, `pass_cut`, `zanshin`, `pull_through`, `chiburi`, `hold_low`) are **authored**, with the right arm IK-solved onto the blade line.
- No free CC0 clip contains a sword *finisher*. The CC0 sword clips are combat swings and lunges. I tried using `Sword_Dash_RM` / `Sword_Regular_C` / `Sword_Attack` / `Sword_Heavy_D` as the strike bodies first.
- They lunge 1.5–2 m and twist the blade off-line, so the blade could not be pinned without body interpenetration (contact sheets `preview/rejected_*.jpg`).
- The clips are kept where they read well: step-off, crouch approach, kick, and all the victim reactions and deaths.

## 9. Posture-break clips (data)
These live in `assets_incoming/deathblow_clips/` and are victim-only. They have the same format, and loop the window [1.0, 2.5] s:
- `break_std.json`: duelists, False Brother, King Phase I.
- `break_heavy_stand.json`: lesser wardens.
- `break_heavy_kneel.json`: Odran's final mark (the knee thud is at 0.55).
- `break_king_kneel.json`: the King's final mark (on both knees by 0.95).

## 10. Surrounding systems: changes ranked by impact on the deathblow
Each item has a **Chromebook (Low tier) cost**. "Per frame" means at 60 Hz on the target device; the reference is H2's `bladeFeel` at 7–9 µs per call.

| # | Change | Why it matters for the deathblow | Chromebook cost |
|---|---|---|---|
| 1 | **Drive everything from the core deathblow clock.** Core bookmarks per blueprint §7.1 and research gap #1: `deathblowStart{variantId}`, `Impact`, `BladeClear{launch}`, `Unlock`, `dbT` paused in freeze. Presentation samples poses, camera keys and cues from `dbT`. | Without it, nothing in this doc lands frame-accurately. Today the payoff is a `w.time + 0.45` timer, and wall-clock `setTimeout`s drift under slow frames. | ~0 (a float compare per cue) |
| 2 | **Remove the sim slow-mo; add the presentation dilation clock** `r(t)` (section 2.1) for FX, cloth, camera orbit and grade. | "Impact on time in wall clock" plus a 40 % slow-mo feel. Today `Cine.slow(1.0, 0.32)` pushes Impact to 0.85 s and Unlock to 1.95 s wall. | ~0. It *saves* sim ticks during the kill. |
| 3 | **Play these clips for both actors.** A `DBClip` layer above the attack layer in `Character.computeTarget`: weight 1 from Commit (blended in 0.12 s from the displayed pose), wrist = W0.u2, root warp (section 5). Replaces `TR.exec_*` / `vic_*` and `COL_TR` for the listed variants. | The pinned blade line, weight, the hold, and character identity. | 2 actors × 15 slerps per frame: about 4 µs. Data: 8 variants + 4 break clips = **172 KB**. The JSON is already int16 + base64 text, so it embeds at that size (budget 400 KB). |
| 4 | **Runtime blade pin.** When the live victim's scale or height differs from the authored one (variants, or a body on a slope), run one analytic two-bone IK on Wren's right arm between pinned keys to keep the authored blade line through the live vital point. Use the `align.js` metric: miss < 0.12 m. | The blade must visibly *enter* the seam, not sit near it. | One 2-bone solve (~3 µs), only during the hold, for one actor. |
| 5 | **Audio chain** (section 2.5): bed lowpass + duck, the **silence gap**, layered stingers, the muffled stealth chain. | The silence after the wet impact is the single biggest "it's over" cue (Sekiro's muffle). | One BiquadFilter on the bed bus (already cheap), plus about 8 short voices. ~0 CPU. |
| 6 | **Camera keys per variant**, the final-of-fight alternates, and occlusion fallback (mirror, then pull in) via `Region.camClear`. Replaces `Cine.focus` plus the generic G1 3/4 cut for these variants. | Readability: the blade and the vital point on screen at Impact in every variant. | 1 occlusion test per key change (about 6 per kill); none on Low (no orbit). |
| 7 | **Corpse settle and bake.** The victim track ends in the lie pose; `Col.ground` only pins it. After 0.5 s at rest, freeze the SkinnedMesh (skip `skeleton.update`) or bake it to static geometry (README rec 1). | Bodies that stay without costing frames. With G1's "the body stays", corpses accumulate. | **Saves** ~0.05–0.1 ms per corpse per frame (skinning), plus pose sampling. |
| 8 | **Two-beat blood/ink VFX on the ticks** (section 2.6), pooled; Low halves the counts. Drop the white-gold `FX.ring`/`FX.flash` from deathblows (research gap #6). | Finality and direction: blood out along the extraction, not a generic burst. | Pooled sprites; ≤ 40 live, 1 draw call per pool. No new materials. |
| 9 | **Grade without a post pass on Low.** Lerp light colours toward grey and the fog colour toward #1b2430, darken exposure via `renderer.toneMappingExposure`. Letterbox with DOM bars (existing `Letterbox`). Avoid CSS `filter: saturate()` on the WebGL canvas. | The cold desaturated read on every tier. | ~0 on Low. A CSS filter on the canvas would force a full-screen composite every frame, which Chromebooks pay for in GPU time. |
| 10 | **Input latch** [Blade-clear, Unlock), and invulnerability to *other* enemies 0 → Unlock (research gap #9). Allies hesitate (blueprint §13). | A clean kill is never interrupted, and the exit feels responsive. | ~0 |
| 11 | **Deterministic variant selection**, including front/behind and the stealth throat-cut rule (section 3). | Character identity, every time. | ~0 |
| 12 | **Break window 2.5 s and the break clips** (section 4). | The sag and loop are seen; the hand-off is seamless. | ~0 (one more clip sample for the victim) |
| 13 | **Final-of-fight treatment and Kingsfall shots** (sections 2.4 and 3.8), including the crown prop drop. | The game's climax reads as the climax. | One prop and four camera shots. ~0. |

**Top 5** by impact: #1 clock bookmarks · #3 the clip layer · #2 the dilation clock instead of sim slow-mo · #5 audio silence and muffle · #4 the runtime blade pin.

## 11. Data format and integration sketch
- **File format:** `veynhold-deathblow-clip/1`, one JSON per variant: `t` (uint16 ms keys), and for each actor `q` (int16 xyz quats, w rebuilt), `hy` (int16, 0.1 mm), and `root` (int16 [x mm, z mm, yaw 1e-4 rad], victim space). Also `clock`, `vital`, `extractDir`, `victimScale`, `retime` (keys with sources, eases, notes and blade lines), `blade` (pin diagnostics) and `sources`. The decoder and sampler are in `sample_clip.js`.
- **Wiring sketch** (for whoever integrates; nothing is changed in `src/`):
  - `build.py` embeds the 12 JSONs the way it embeds `anim_data.json`.
  - On `deathblowStart`, pick the variant (section 3), snapshot both displayed poses, and compute the root warp from the actual `d0`.
  - Each frame, `DBClip.sample(C, 'att'|'vic', dbT, buf)` drives the two pose rigs: `setQ` for all 15 joints at weight `w`, `hips.y = 0.95 + hy`, wrist = W0.u2, root placed in victim space.
  - Cues fire on the core events, or on `dbT` crossing the times in section 3.
  - Corpse: on `dbT > dur`, hand the victim's displayed pose to `Col` for grounding and pooling.
- **Tests to add later:**
  - `align.js` style: blade-to-vital miss < 0.12 m at Impact, Settle and Extract for every variant against the live rig.
  - The wall-clock Impact is within 1 frame of 0.32 s.
  - Unlock fires at 1.40 / 1.90 on the deathblow clock.
  - Lowest mesh point within ±0.05 m of the floor at the end of each victim track.

## 12. What this does not cover, and limits
- **Mixamo** (needs an Adobe login, so it was not used).
  - Candidates, if someone with an account wants references or replacements: *Sword And Shield Kill*, *Stabbing*, *Sword And Shield Slash*, *Great Sword Slash*, *Sword And Shield Power Up*, *Kneeling Pointing*, *Dying*, *Dying Backwards*, *Falling Back Death*, *Hit To Body*, *Neck Hit / Getting Choked*, *Sneak Attack / Stealth Assassination* (named "Assassination" in some packs), *Two Handed Sword Death*, *Kneel*.
  - Mixamo clips are licensed for use in projects but **not for redistribution as animation files**. They would have to be baked into the game's own data, never shipped as FBX.
- **Validation so far:** the poses were authored and checked on the game's pose-rig proportions, in a mannequin render.
  - They have **not** been seen on the skinned Quaternius meshes in-game, where `models.js QMAP` blends spine and neck.
  - Expect small offsets: the blade pin assumes the rig's wrist at `rHand` + W0.u2. Rec #4 covers this.
- **Approach keys** (Drive 0.26–0.28, before entry) are not reachable exactly in Turning Cut, Crown Splitter and Shoulder Drive (0.21–0.39 m wrist error). The blade is still travelling through its arc there; it is pinned from Impact on.
- **Throat cut hold (0.95):** the edge is kept near the throat, but not pinned (0.2 m). The cut is already over.
- **Victim own-sword drop:** not animated. Presentation should detach the victim's blade at Impact and let it fall (a prop with 1 bounce), or hide it. The previews hide it after Impact.
- **Interpenetration:** these are the minimum body-to-body gaps (hips/chest/head centres) over each clip. Small gaps are intended contact (shoulder check, hand over the mouth, the kick), but check them on the skinned meshes.

| Variant | Minimum gap |
|---|---|
| Heart Pierce | 0.09 m |
| Turning Cut | 0.42 m |
| Crown Splitter | 0.32 m |
| Shoulder Drive | 0.27 m |
| Stealth back-stab | 0.06 m |
| Stealth throat cut | 0.06 m |
| King Phase I | 0.02 m (the kick) |
| Kingsfall | 0.21 m |

## Appendix A: key poses at the core ticks (both actors, every main bone)
Generated from the exported data (`work/db/build.py`). Read the root, hy and Euler conventions from section 0. Rig-local Euler means each bone is relative to its parent in the pose rig: hips are relative to the root, and the root is yawed in victim space.

### A.1 heart_pierce

**Wren (attacker)**: rig-local Euler XYZ degrees (three.js order) at each core tick; root = [x, z] m in victim space and yaw deg; hy = hips offset m (hips.y = 0.95 + hy, before scale)

| bone | commit 0.00 | drive 0.28 | impact 0.32 | settle 0.55 | extract 0.95 | bladeClear 1.15 | unlock 1.40 | presEnd 2.25 |
|---|---|---|---|---|---|---|---|---|
| root | 0.00, 1.75 / 180° | 0.00, 0.95 / 180° | 0.00, 0.95 / 180° | 0.00, 0.94 / 180° | 0.00, 0.93 / 180° | -0.10, 1.10 / 180° | -0.10, 1.18 / 180° | -0.10, 1.18 / 180° |
| hy | 0.001 | -0.110 | -0.110 | -0.140 | -0.140 | -0.018 | 0.009 | 0.001 |
| hips | -5 -13 -1 | 5 -12 0 | 5 -12 0 | 8 -14 0 | 8 -14 0 | 2 -30 0 | 0 -8 0 | -5 -13 -1 |
| spine/chest | 21 0 0 | 14 22 0 | 14 22 0 | 18 26 0 | 18 26 0 | 2 -32 0 | 6 -12 0 | 21 0 0 |
| neck/head | -2 11 0 | -8 -20 0 | -8 -20 0 | 0 -22 0 | 0 -22 0 | -4 26 0 | 4 8 0 | -2 11 0 |
| R upper arm | 4 -15 -19 | -37 10 23 | -90 -3 10 | 9 48 26 | 14 41 39 | -8 0 -82 | -20 0 -40 | 4 -15 -19 |
| R lower arm | -43 14 13 | -103 0 0 | -12 0 0 | -130 0 0 | -127 0 0 | -12 0 0 | -10 0 0 | -43 14 13 |
| R hand | -14 -1 5 | 103 -25 -4 | 72 -18 -3 | 57 -23 -4 | 55 -7 5 | 24 0 0 | 30 0 -20 | -14 -1 5 |
| L upper arm | 1 0 18 | -50 0 18 | -50 0 18 | -57 -15 8 | -28 -35 -14 | -70 0 10 | 5 0 8 | 1 0 18 |
| L lower arm | -31 -5 -2 | -55 0 0 | -55 0 0 | -116 0 0 | -102 0 0 | -10 0 0 | -30 0 0 | -31 -5 -2 |
| L hand | -13 0 -3 | 0 0 0 | 0 0 0 | 0 0 0 | 0 0 0 | -30 0 0 | 0 0 0 | -13 0 -3 |
| R thigh | 15 -1 -11 | -50 0 -4 | -50 0 -4 | -55 0 -4 | -55 0 -4 | -20 0 -8 | -12 0 -6 | 15 -1 -11 |
| R shin | 3 -43 2 | 55 0 0 | 55 0 0 | 64 0 0 | 64 0 0 | 30 0 0 | 18 0 0 | 3 -43 2 |
| R foot | -6 13 15 | -5 0 0 | -5 0 0 | -6 0 0 | -6 0 0 | 0 0 0 | 0 0 0 | -6 13 15 |
| L thigh | -9 -1 12 | 25 0 6 | 25 0 6 | 27 0 6 | 27 0 6 | 18 0 8 | 10 0 6 | -9 -1 12 |
| L shin | 8 13 -2 | 28 0 0 | 28 0 0 | 32 0 0 | 32 0 0 | 22 0 0 | 16 0 0 | 8 13 -2 |
| L foot | 8 -7 -8 | -22 0 0 | -22 0 0 | -24 0 0 | -24 0 0 | -12 0 0 | 0 0 0 | 8 -7 -8 |

**victim**: rig-local Euler XYZ degrees (three.js order) at each core tick; root = [x, z] m in victim space and yaw deg; hy = hips offset m (hips.y = 0.95 + hy, before scale)

| bone | commit 0.00 | drive 0.28 | impact 0.32 | settle 0.55 | extract 0.95 | bladeClear 1.15 | unlock 1.40 | presEnd 2.25 |
|---|---|---|---|---|---|---|---|---|
| root | 0.00, 0.00 / 0° | 0.00, 0.00 / 0° | 0.00, 0.00 / 0° | 0.00, 0.00 / 0° | 0.00, 0.00 / 0° | 0.04, -0.06 / 10° | 0.18, -0.25 / 46° | 0.33, -0.46 / 66° |
| hy | -0.091 | -0.050 | -0.050 | -0.073 | -0.066 | -0.247 | -0.476 | -0.640 |
| hips | -22 -7 -3 | -20 -8 -3 | -20 -8 -3 | 21 -13 -1 | 19 -13 -1 | 13 -16 -2 | -12 -5 -3 | 121 -6 0 |
| spine/chest | 25 34 -21 | -7 37 -1 | -8 37 -1 | 22 1 -7 | 27 0 -6 | 34 0 0 | 38 0 -1 | -23 0 0 |
| neck/head | 11 -14 7 | -29 -21 -4 | -30 -21 -5 | -3 11 -1 | 15 9 -3 | -55 -1 6 | -27 2 7 | -13 45 6 |
| R upper arm | 38 -29 -3 | 9 -23 -23 | 9 -23 -23 | -31 45 -33 | -9 32 -39 | -5 41 -84 | -20 32 -45 | -17 10 -12 |
| R lower arm | -43 13 1 | -64 12 7 | -64 12 7 | -54 -19 -24 | -57 -22 -30 | -58 -26 -36 | -36 -19 -14 | 7 -2 1 |
| R hand | -37 -2 -7 | -34 -3 -6 | -34 -3 -6 | -14 -1 5 | -14 -1 5 | -12 21 1 | -7 12 6 | -4 51 0 |
| L upper arm | -3 -16 47 | -8 -24 55 | -8 -23 55 | -23 -53 49 | -6 -38 55 | -3 -8 66 | -9 -15 43 | -3 5 36 |
| L lower arm | -93 53 41 | -94 53 42 | -94 53 42 | -52 41 42 | -57 43 48 | -59 11 19 | -51 -1 -1 | -38 -12 -10 |
| L hand | -13 0 -3 | -13 0 -3 | -13 0 -3 | -13 0 -3 | -13 0 -3 | -13 -1 -5 | -12 -4 -10 | 21 -16 -4 |
| R thigh | -5 3 -20 | 2 0 -20 | 2 0 -20 | -35 7 -20 | -31 6 -20 | -40 13 -33 | 14 -3 -29 | -58 6 -11 |
| R shin | 67 -11 24 | 46 -20 19 | 46 -20 19 | 60 -28 39 | 58 -29 37 | 91 0 21 | 98 -2 -11 | 64 0 0 |
| R foot | -5 -1 10 | -6 0 10 | -6 0 10 | -22 12 8 | -22 12 9 | 14 23 8 | 10 28 9 | 32 -5 0 |
| L thigh | -26 -5 13 | -13 -2 13 | -14 -2 13 | -60 -12 20 | -56 -11 19 | -66 -10 15 | -7 -2 21 | -54 -7 13 |
| L shin | 45 9 -9 | 21 12 -4 | 21 12 -4 | 38 9 -7 | 38 9 -7 | 98 0 2 | 125 4 6 | 49 3 -4 |
| L foot | 24 -15 -3 | 24 -14 -3 | 23 -14 -3 | 5 -7 -9 | 4 -7 -9 | -11 -4 -13 | 11 -20 9 | 45 -2 -14 |

### A.2 turning_cut

**Wren (attacker)**: rig-local Euler XYZ degrees (three.js order) at each core tick; root = [x, z] m in victim space and yaw deg; hy = hips offset m (hips.y = 0.95 + hy, before scale)

| bone | commit 0.00 | drive 0.28 | impact 0.32 | settle 0.55 | extract 0.95 | bladeClear 1.15 | unlock 1.40 | presEnd 2.25 |
|---|---|---|---|---|---|---|---|---|
| root | -0.25, 1.85 / 180° | -0.49, 0.68 / 180° | -0.55, 0.42 / 180° | -0.80, -0.55 / 180° | -0.80, -0.56 / 180° | -0.80, -0.57 / 180° | -0.80, -0.58 / 180° | -0.80, -0.62 / 180° |
| hy | 0.001 | -0.060 | -0.060 | -0.082 | -0.082 | 0.009 | 0.001 | 0.001 |
| hips | -5 -13 -1 | 6 -28 0 | 6 -28 0 | 8 -18 0 | 8 -18 0 | 0 -8 0 | -5 -13 -1 | -5 -13 -1 |
| spine/chest | 21 0 0 | 12 -40 0 | 12 -40 0 | 16 -22 0 | 16 -22 0 | 6 -12 0 | 21 0 0 | 21 0 0 |
| neck/head | -2 11 0 | -4 45 0 | -4 45 0 | 6 20 0 | 6 26 0 | 4 8 0 | -2 11 0 | -2 11 0 |
| R upper arm | 4 -15 -19 | -179 -11 75 | -172 43 57 | -55 0 -72 | -55 0 -72 | -20 0 -40 | 4 -15 -19 | 4 -15 -19 |
| R lower arm | -43 14 13 | -3 0 0 | -105 0 0 | -6 0 0 | -6 0 0 | -10 0 0 | -43 14 13 | -43 14 13 |
| R hand | -14 -1 5 | -147 -15 -2 | -109 -1 -1 | 40 0 0 | 40 0 0 | 30 0 -20 | -14 -1 5 | -14 -1 5 |
| L upper arm | 1 0 18 | -20 0 30 | -20 0 30 | -10 0 25 | -10 0 25 | 5 0 8 | 1 0 18 | 1 0 18 |
| L lower arm | -31 -5 -2 | -40 0 0 | -40 0 0 | -50 0 0 | -50 0 0 | -30 0 0 | -31 -5 -2 | -31 -5 -2 |
| L hand | -13 0 -3 | 0 0 0 | 0 0 0 | 0 0 0 | 0 0 0 | 0 0 0 | -13 0 -3 | -13 0 -3 |
| R thigh | 15 -1 -11 | 28 0 -6 | 28 0 -6 | 30 0 -8 | 30 0 -8 | -12 0 -6 | 15 -1 -11 | 15 -1 -11 |
| R shin | 3 -43 2 | 36 0 0 | 36 0 0 | 52 0 0 | 52 0 0 | 18 0 0 | 3 -43 2 | 3 -43 2 |
| R foot | -6 13 15 | -24 0 0 | -24 0 0 | -26 0 0 | -26 0 0 | 0 0 0 | -6 13 15 | -6 13 15 |
| L thigh | -9 -1 12 | -42 0 6 | -42 0 6 | -40 0 8 | -40 0 8 | 10 0 6 | -9 -1 12 | -9 -1 12 |
| L shin | 8 13 -2 | 46 0 0 | 46 0 0 | 64 0 0 | 64 0 0 | 16 0 0 | 8 13 -2 | 8 13 -2 |
| L foot | 8 -7 -8 | -4 0 0 | -4 0 0 | -8 0 0 | -8 0 0 | 0 0 0 | 8 -7 -8 | 8 -7 -8 |

**victim**: rig-local Euler XYZ degrees (three.js order) at each core tick; root = [x, z] m in victim space and yaw deg; hy = hips offset m (hips.y = 0.95 + hy, before scale)

| bone | commit 0.00 | drive 0.28 | impact 0.32 | settle 0.55 | extract 0.95 | bladeClear 1.15 | unlock 1.40 | presEnd 2.25 |
|---|---|---|---|---|---|---|---|---|
| root | 0.00, 0.00 / 0° | 0.00, 0.00 / 0° | 0.00, 0.00 / 0° | 0.00, 0.00 / 0° | 0.00, 0.00 / 0° | 0.00, 0.00 / 0° | -0.00, 0.00 / 0° | -0.10, 0.21 / -16° |
| hy | -0.091 | -0.011 | -0.004 | -0.003 | -0.003 | -0.042 | -0.331 | -0.753 |
| hips | -22 -7 -3 | -10 -12 -2 | -5 -13 -1 | -5 -13 -1 | -5 -13 -1 | -3 -13 -2 | 2 -11 -3 | 101 -6 0 |
| spine/chest | 25 34 -21 | 13 12 -2 | 17 0 2 | 22 0 0 | 22 0 0 | 25 0 0 | 36 0 0 | -25 0 0 |
| neck/head | 11 -14 7 | -28 -1 1 | -36 15 4 | -32 14 3 | -26 14 2 | -26 11 2 | -51 -1 6 | 30 54 2 |
| R upper arm | 38 -29 -3 | 0 -10 -19 | -3 -6 -17 | -2 -7 -17 | -2 -7 -17 | -8 4 -31 | -10 40 -73 | 6 -15 -15 |
| R lower arm | -43 13 1 | -46 10 6 | -39 10 7 | -36 11 7 | -36 11 7 | -38 2 -1 | -53 -23 -28 | 2 23 0 |
| R hand | -37 -2 -7 | -21 -2 2 | -14 -1 5 | -14 -1 5 | -14 -1 5 | -14 4 4 | -10 17 3 | -6 43 18 |
| L upper arm | -3 -16 47 | -7 -12 31 | -4 -8 20 | -4 -7 20 | -4 -7 20 | -151 36 -47 | -3 -9 64 | 14 38 44 |
| L lower arm | -93 53 41 | -40 21 5 | -28 3 1 | -25 2 -1 | -25 2 -1 | 107 -1 -4 | -56 6 11 | -78 -15 -54 |
| L hand | -13 0 -3 | -13 0 -3 | -13 0 -3 | -13 0 -3 | -13 0 -3 | -13 0 -4 | -13 -1 -7 | 21 -15 -5 |
| R thigh | -5 3 -20 | 7 -1 -17 | 8 -1 -16 | 9 -1 -15 | 9 -1 -15 | 0 0 -20 | -25 7 -31 | -14 2 -17 |
| R shin | 67 -11 24 | 30 -34 17 | 22 -40 14 | 20 -40 13 | 20 -40 13 | 41 -30 18 | 98 1 7 | 57 1 -1 |
| R foot | -5 -1 10 | -10 9 13 | -11 13 14 | -11 13 15 | -11 13 15 | -6 16 14 | 8 25 10 | 21 18 -4 |
| L thigh | -26 -5 13 | -14 -2 13 | -15 -2 12 | -15 -2 13 | -15 -2 13 | -25 -3 14 | -53 -8 16 | -11 -1 11 |
| L shin | 45 9 -9 | 18 12 -4 | 16 13 -4 | 17 13 -4 | 17 13 -4 | 40 9 -4 | 116 2 4 | 34 5 -3 |
| L foot | 24 -15 -3 | 11 -10 -6 | 6 -8 -7 | 5 -7 -8 | 5 -7 -8 | 2 -8 -8 | -7 -13 -9 | 48 -7 -2 |

### A.3 crown_splitter

**Wren (attacker)**: rig-local Euler XYZ degrees (three.js order) at each core tick; root = [x, z] m in victim space and yaw deg; hy = hips offset m (hips.y = 0.95 + hy, before scale)

| bone | commit 0.00 | drive 0.28 | impact 0.32 | settle 0.80 | extract 1.45 | bladeClear 1.65 | unlock 1.90 | presEnd 2.75 |
|---|---|---|---|---|---|---|---|---|
| root | 0.00, 2.50 / 180° | 0.00, 1.50 / 180° | 0.00, 1.50 / 180° | 0.00, 1.50 / 180° | 0.00, 1.50 / 180° | 0.00, 1.75 / 180° | 0.00, 1.76 / 180° | 0.00, 1.82 / 180° |
| hy | 0.001 | -0.055 | -0.055 | -0.055 | -0.055 | -0.029 | 0.009 | 0.001 |
| hips | -5 -13 -1 | 12 0 0 | 12 0 0 | 12 0 0 | 12 0 0 | -6 0 0 | 0 -8 0 | -5 -13 -1 |
| spine/chest | 21 0 0 | 26 6 0 | 26 6 0 | 32 6 -1 | 30 6 0 | -14 8 0 | 6 -12 0 | 21 0 0 |
| neck/head | -2 11 0 | 8 0 0 | 8 0 0 | 8 0 0 | 8 0 0 | -10 0 0 | 4 8 0 | -2 11 0 |
| R upper arm | 4 -15 -19 | -176 -67 76 | -176 -1 72 | -134 22 145 | 167 80 -75 | -132 -5 -6 | -20 0 -40 | 4 -15 -19 |
| R lower arm | -43 14 13 | -4 0 0 | -98 0 0 | -100 0 0 | -121 0 0 | -55 0 0 | -10 0 0 | -43 14 13 |
| R hand | -14 -1 5 | -114 -7 -1 | -84 0 -1 | -56 -32 -11 | 6 -3 0 | 30 0 0 | 30 0 -20 | -14 -1 5 |
| L upper arm | 1 0 18 | -85 0 10 | 138 87 -24 | 12 -13 -89 | -176 84 -82 | -125 6 8 | 5 0 8 | 1 0 18 |
| L lower arm | -31 -5 -2 | -25 0 0 | 76 0 0 | 76 0 0 | 93 0 0 | -60 0 0 | -30 0 0 | -31 -5 -2 |
| L hand | -13 0 -3 | 0 0 0 | 0 0 0 | 0 0 0 | 0 0 0 | 0 0 0 | 0 0 0 | -13 0 -3 |
| R thigh | 15 -1 -11 | 22 0 -6 | 22 0 -6 | 22 0 -6 | 22 0 -6 | 16 0 -6 | -12 0 -6 | 15 -1 -11 |
| R shin | 3 -43 2 | 32 0 0 | 32 0 0 | 32 0 0 | 32 0 0 | 18 0 0 | 18 0 0 | 3 -43 2 |
| R foot | -6 13 15 | -20 0 0 | -20 0 0 | -20 0 0 | -20 0 0 | -12 0 0 | 0 0 0 | -6 13 15 |
| L thigh | -9 -1 12 | -42 0 6 | -42 0 6 | -42 0 6 | -42 0 6 | -30 0 6 | 10 0 6 | -9 -1 12 |
| L shin | 8 13 -2 | 50 0 0 | 50 0 0 | 50 0 0 | 50 0 0 | 30 0 0 | 16 0 0 | 8 13 -2 |
| L foot | 8 -7 -8 | -4 0 0 | -4 0 0 | -4 0 0 | -4 0 0 | 0 0 0 | 0 0 0 | 8 -7 -8 |

**victim**: rig-local Euler XYZ degrees (three.js order) at each core tick; root = [x, z] m in victim space and yaw deg; hy = hips offset m (hips.y = 0.95 + hy, before scale)

| bone | commit 0.00 | drive 0.28 | impact 0.32 | settle 0.80 | extract 1.45 | bladeClear 1.65 | unlock 1.90 | presEnd 2.75 |
|---|---|---|---|---|---|---|---|---|
| root | 0.00, 0.00 / 0° | 0.00, 0.00 / 0° | 0.00, 0.00 / 0° | 0.00, 0.00 / 0° | 0.00, 0.00 / 0° | 0.00, -0.00 / 0° | 0.00, -0.08 / 2° | 0.00, -0.52 / 8° |
| hy | -0.442 | -0.442 | -0.442 | -0.442 | -0.442 | -0.737 | -0.830 | -0.830 |
| hips | 11 0 -1 | 11 0 -1 | 11 0 -1 | 11 0 -1 | 11 0 -1 | -53 -16 -5 | -76 -14 -3 | -93 -14 -2 |
| spine/chest | 30 7 -1 | 41 7 -2 | 44 7 -3 | 46 6 -2 | 50 6 -3 | 57 1 -1 | 54 1 -1 | 24 -1 1 |
| neck/head | -4 -6 -2 | 17 -7 1 | 22 -7 1 | 26 -6 2 | 26 -6 2 | -27 11 -2 | 1 7 -5 | -45 3 -1 |
| R upper arm | -55 28 -8 | -55 28 -8 | -55 28 -8 | -31 23 -17 | -28 22 -19 | -9 86 -82 | 85 69 170 | 5 -15 -129 |
| R lower arm | -16 1 0 | -16 1 0 | -16 1 0 | -16 1 0 | -16 1 0 | -27 -48 -22 | -38 -58 -34 | -8 -41 -23 |
| R hand | -56 -67 -77 | -56 -67 -77 | -56 -67 -77 | -56 -67 -77 | -56 -67 -77 | -5 -11 -11 | -13 -41 -9 | -26 -79 -35 |
| L upper arm | -59 -44 7 | -59 -44 7 | -59 -44 7 | -59 -44 7 | -28 -36 28 | -34 -42 15 | -6 -7 30 | 0 21 83 |
| L lower arm | -36 46 29 | -36 46 29 | -36 46 29 | -36 46 29 | -36 46 29 | -85 6 54 | -100 -11 45 | -88 -2 117 |
| L hand | 13 2 2 | 13 2 2 | 13 2 2 | 13 2 2 | 13 2 2 | -5 21 -7 | 2 39 -6 | 5 20 0 |
| R thigh | -17 1 -9 | -17 1 -9 | -17 1 -9 | -17 1 -9 | -17 1 -9 | -68 17 -25 | -63 11 -18 | -9 2 -20 |
| R shin | 93 0 0 | 93 0 0 | 93 0 0 | 93 0 0 | 93 0 0 | 88 -2 39 | 58 -17 26 | 14 -22 5 |
| R foot | 68 -5 11 | 68 -5 11 | 68 -5 11 | 68 -5 11 | 68 -5 11 | 9 -3 -17 | 19 8 -16 | 19 16 15 |
| L thigh | -66 -38 55 | -66 -38 55 | -66 -38 55 | -66 -38 55 | -66 -38 55 | -35 -10 29 | -20 -4 22 | 3 0 17 |
| L shin | 119 -25 -38 | 119 -25 -38 | 119 -25 -38 | 119 -25 -38 | 119 -25 -38 | 38 31 -22 | 26 37 -16 | 18 45 -13 |
| L foot | -37 -47 -6 | -37 -47 -6 | -37 -47 -6 | -37 -47 -6 | -37 -47 -6 | 37 -11 -12 | 30 -7 -10 | 15 -13 -5 |

### A.4 shoulder_drive

**Wren (attacker)**: rig-local Euler XYZ degrees (three.js order) at each core tick; root = [x, z] m in victim space and yaw deg; hy = hips offset m (hips.y = 0.95 + hy, before scale)

| bone | commit 0.00 | drive 0.28 | impact 0.32 | settle 0.55 | extract 0.95 | bladeClear 1.15 | unlock 1.40 | presEnd 2.25 |
|---|---|---|---|---|---|---|---|---|
| root | 0.10, 1.90 / 180° | 0.10, 0.82 / 180° | 0.10, 0.82 / 180° | 0.10, 0.82 / 180° | 0.10, 0.82 / 180° | 0.12, 0.95 / 180° | 0.12, 0.96 / 180° | 0.12, 1.05 / 180° |
| hy | 0.001 | -0.079 | -0.079 | -0.079 | -0.079 | -0.029 | 0.009 | 0.001 |
| hips | -5 -13 -1 | 6 -28 0 | 6 -28 0 | 6 -28 0 | 6 -28 0 | -6 0 0 | 0 -8 0 | -5 -13 -1 |
| spine/chest | 21 0 0 | 12 -30 0 | 12 -30 0 | 19 -30 3 | 19 -30 3 | -14 8 0 | 6 -12 0 | 21 0 0 |
| neck/head | -2 11 0 | -6 40 0 | -6 40 0 | -6 40 0 | -6 40 0 | -10 0 0 | 4 8 0 | -2 11 0 |
| R upper arm | 4 -15 -19 | 163 21 26 | -173 31 48 | 178 30 53 | -172 32 53 | -122 -6 -35 | -20 0 -40 | 4 -15 -19 |
| R lower arm | -43 14 13 | 0 0 0 | -56 0 0 | -60 0 0 | -74 0 0 | -55 0 0 | -10 0 0 | -43 14 13 |
| R hand | -14 -1 5 | -71 62 -158 | 134 89 12 | 135 86 12 | -172 81 -39 | 30 0 0 | 30 0 -20 | -14 -1 5 |
| L upper arm | 1 0 18 | -20 0 25 | -20 0 25 | -20 0 25 | -20 0 25 | -45 9 -5 | 5 0 8 | 1 0 18 |
| L lower arm | -31 -5 -2 | -80 0 0 | -80 0 0 | -80 0 0 | -80 0 0 | -60 0 0 | -30 0 0 | -31 -5 -2 |
| L hand | -13 0 -3 | 0 0 0 | 0 0 0 | 0 0 0 | 0 0 0 | 0 0 0 | 0 0 0 | -13 0 -3 |
| R thigh | 15 -1 -11 | 26 0 -6 | 26 0 -6 | 26 0 -6 | 26 0 -6 | 16 0 -6 | -12 0 -6 | 15 -1 -11 |
| R shin | 3 -43 2 | 30 0 0 | 30 0 0 | 30 0 0 | 30 0 0 | 18 0 0 | 18 0 0 | 3 -43 2 |
| R foot | -6 13 15 | -20 0 0 | -20 0 0 | -20 0 0 | -20 0 0 | -12 0 0 | 0 0 0 | -6 13 15 |
| L thigh | -9 -1 12 | -45 0 6 | -45 0 6 | -45 0 6 | -45 0 6 | -30 0 6 | 10 0 6 | -9 -1 12 |
| L shin | 8 13 -2 | 52 0 0 | 52 0 0 | 52 0 0 | 52 0 0 | 30 0 0 | 16 0 0 | 8 13 -2 |
| L foot | 8 -7 -8 | -6 0 0 | -6 0 0 | -6 0 0 | -6 0 0 | 0 0 0 | 0 0 0 | 8 -7 -8 |

**victim**: rig-local Euler XYZ degrees (three.js order) at each core tick; root = [x, z] m in victim space and yaw deg; hy = hips offset m (hips.y = 0.95 + hy, before scale)

| bone | commit 0.00 | drive 0.28 | impact 0.32 | settle 0.55 | extract 0.95 | bladeClear 1.15 | unlock 1.40 | presEnd 2.25 |
|---|---|---|---|---|---|---|---|---|
| root | 0.00, 0.00 / 0° | 0.00, 0.00 / 0° | 0.00, 0.00 / 0° | 0.00, 0.00 / 0° | 0.00, 0.00 / 0° | 0.00, -0.00 / 0° | 0.03, -0.06 / 2° | 0.17, -0.40 / 13° |
| hy | -0.044 | -0.160 | -0.226 | -0.226 | -0.226 | -0.134 | -0.179 | -0.830 |
| hips | -7 -13 -2 | -7 -13 -2 | -7 -13 -2 | -7 -13 -2 | -7 -13 -2 | 2 -29 1 | -1 -31 0 | -93 -14 -2 |
| spine/chest | 35 9 -10 | 32 0 -5 | 35 -4 -4 | 36 -2 -4 | 39 0 -6 | 21 7 -2 | 33 6 -4 | 25 -1 1 |
| neck/head | 12 -4 -3 | -13 -3 -5 | -19 -2 -5 | -25 -2 -5 | -29 -1 -5 | -29 3 4 | -11 4 2 | -44 3 -1 |
| R upper arm | 62 -38 10 | 62 -38 10 | 62 -38 10 | 79 5 121 | 75 10 119 | 2 -17 -48 | 0 -12 -50 | 5 -15 -129 |
| R lower arm | -25 22 9 | -25 22 9 | -25 22 9 | -36 20 13 | -50 16 18 | -85 2 24 | -86 1 10 | -8 -41 -23 |
| R hand | -6 -6 -1 | -6 -6 -1 | -6 -6 -1 | -6 -6 -1 | -6 -6 -1 | -14 12 3 | -12 14 3 | -26 -79 -35 |
| L upper arm | -11 -32 58 | -2 -20 76 | 0 -15 82 | 5 -7 85 | 2 -10 83 | 14 18 20 | 11 14 22 | 0 21 83 |
| L lower arm | -88 57 29 | -88 57 29 | -88 57 29 | -88 57 29 | -88 57 29 | -96 0 -11 | -103 0 -5 | -88 -1 117 |
| L hand | -13 0 -3 | -13 0 -3 | -13 0 -3 | -13 0 -3 | -13 0 -3 | -8 -9 -4 | -5 -9 -15 | 6 21 -4 |
| R thigh | -8 3 -16 | -23 7 -15 | -29 9 -14 | -29 9 -14 | -29 9 -14 | -28 8 -32 | -33 10 -31 | -9 2 -20 |
| R shin | 56 -21 28 | 82 -6 34 | 92 1 34 | 92 1 34 | 92 1 34 | 71 -13 33 | 78 -6 26 | 14 -22 5 |
| R foot | -7 7 12 | -21 4 14 | -26 2 14 | -26 2 14 | -26 2 14 | -30 23 12 | -34 19 13 | 19 16 15 |
| L thigh | -33 -6 12 | -50 -9 10 | -57 -10 9 | -57 -10 9 | -57 -10 9 | -40 -12 31 | -44 -13 32 | 3 0 17 |
| L shin | 47 9 -10 | 76 3 -13 | 89 0 -13 | 89 0 -13 | 89 0 -13 | 64 15 -27 | 73 9 -26 | 18 45 -13 |
| L foot | 13 -9 -7 | -1 -7 -9 | -7 -6 -10 | -7 -6 -10 | -7 -6 -10 | -10 -10 -8 | -14 -7 -9 | 15 -13 -5 |

### A.5 stealth_backstab

**Wren (attacker)**: rig-local Euler XYZ degrees (three.js order) at each core tick; root = [x, z] m in victim space and yaw deg; hy = hips offset m (hips.y = 0.95 + hy, before scale)

| bone | commit 0.00 | drive 0.28 | impact 0.32 | settle 0.55 | extract 0.95 | bladeClear 1.15 | unlock 1.40 | presEnd 2.25 |
|---|---|---|---|---|---|---|---|---|
| root | 0.00, -1.55 / 0° | 0.04, -0.52 / 0° | 0.04, -0.52 / 0° | 0.04, -0.51 / 0° | 0.04, -0.50 / 0° | 0.04, -0.52 / 0° | 0.04, -0.55 / 0° | 0.04, -0.62 / 0° |
| hy | -0.462 | -0.031 | -0.031 | -0.031 | -0.022 | -0.318 | -0.318 | -0.463 |
| hips | 19 -7 -13 | 6 0 0 | 6 0 0 | 6 0 0 | 12 0 0 | 20 0 0 | 20 0 0 | 19 -7 -12 |
| spine/chest | 63 16 -1 | 8 12 0 | 8 12 0 | 8 12 0 | 8 12 0 | 22 8 0 | 30 8 -1 | 61 15 -1 |
| neck/head | -43 1 0 | 12 -8 0 | 12 -8 0 | 12 -8 0 | 12 -8 0 | 18 0 0 | 18 0 0 | -41 1 1 |
| R upper arm | -12 21 -34 | 14 27 24 | 8 27 26 | 5 28 26 | 4 29 24 | -30 0 -10 | -30 0 -10 | -12 21 -34 |
| R lower arm | -75 -9 -31 | -38 0 0 | -60 0 0 | -75 0 0 | -78 0 0 | -40 0 0 | -40 0 0 | -75 -9 -31 |
| R hand | -9 -1 7 | -36 -2 1 | -9 -4 0 | 8 -6 -1 | 7 -4 -1 | 40 0 0 | 40 0 0 | -11 -1 6 |
| L upper arm | -15 -34 28 | -122 15 -42 | -120 -5 -50 | -127 17 -41 | -127 17 -40 | -118 -11 -59 | -80 0 -5 | -15 -34 28 |
| L lower arm | -50 22 25 | -2 0 0 | -62 0 0 | -7 0 0 | -2 0 0 | -87 0 0 | -50 0 0 | -50 22 25 |
| L hand | -6 24 -7 | 0 0 0 | 0 0 0 | 0 0 0 | 0 0 0 | 0 0 0 | 0 0 0 | -7 24 -7 |
| R thigh | -75 2 -3 | 14 0 -6 | 14 0 -6 | 14 0 -6 | 14 0 -6 | 20 0 -6 | 20 0 -6 | -75 2 -3 |
| R shin | 129 -1 -1 | 32 0 0 | 32 0 0 | 32 0 0 | 32 0 0 | 100 0 0 | 100 0 0 | 129 -2 -2 |
| R foot | -20 4 26 | -18 0 0 | -18 0 0 | -18 0 0 | -18 0 0 | 40 0 0 | 40 0 0 | -20 4 26 |
| L thigh | -121 -18 10 | -28 0 6 | -28 0 6 | -28 0 6 | -28 0 6 | -70 0 8 | -70 0 8 | -121 -18 10 |
| L shin | 90 0 -1 | 40 0 0 | 40 0 0 | 40 0 0 | 40 0 0 | 110 0 0 | 110 0 0 | 90 0 -2 |
| L foot | 12 -8 0 | -6 0 0 | -6 0 0 | -6 0 0 | -6 0 0 | -30 0 0 | -30 0 0 | 12 -7 0 |

**victim**: rig-local Euler XYZ degrees (three.js order) at each core tick; root = [x, z] m in victim space and yaw deg; hy = hips offset m (hips.y = 0.95 + hy, before scale)

| bone | commit 0.00 | drive 0.28 | impact 0.32 | settle 0.55 | extract 0.95 | bladeClear 1.15 | unlock 1.40 | presEnd 2.25 |
|---|---|---|---|---|---|---|---|---|
| root | 0.00, 0.00 / 0° | 0.00, 0.01 / 0° | 0.00, 0.01 / 0° | 0.00, 0.02 / 0° | 0.00, 0.04 / 0° | 0.00, 0.05 / 0° | 0.00, 0.06 / 0° | 0.00, 0.29 / 0° |
| hy | -0.113 | -0.006 | 0.020 | 0.029 | 0.004 | -0.121 | -0.473 | -0.672 |
| hips | -19 -23 -7 | -14 -16 -3 | -13 -13 -1 | -9 -13 -1 | -9 -13 -1 | -2 -9 -1 | 7 -5 -2 | 98 -6 0 |
| spine/chest | 53 -17 4 | 14 -5 1 | -2 0 2 | 4 0 0 | 12 0 0 | 23 -2 -4 | 33 -6 -7 | 0 0 0 |
| neck/head | 5 27 -9 | -38 10 4 | -55 1 4 | -47 5 7 | -33 6 5 | -28 5 8 | -22 4 10 | -6 56 -1 |
| R upper arm | -3 -5 -26 | -4 -5 -19 | -4 -5 -16 | 11 -15 -26 | 19 -14 -13 | -7 6 -13 | -33 23 -3 | -19 26 -27 |
| R lower arm | -34 -14 -10 | -43 0 2 | -48 5 7 | -49 7 10 | -49 7 10 | -32 -3 1 | -16 -14 -4 | 15 -10 13 |
| R hand | -3 -14 -3 | -11 -5 3 | -14 -1 5 | -14 -1 5 | -14 -1 5 | -10 6 6 | -6 14 8 | -4 64 3 |
| L upper arm | -4 -10 48 | -5 -9 29 | -5 -9 21 | 6 -4 34 | 16 1 20 | -2 -8 28 | -20 -19 31 | -14 -19 27 |
| L lower arm | -49 16 19 | -40 8 10 | -36 5 7 | -37 2 5 | -37 2 5 | -29 3 3 | -23 3 1 | 13 8 -4 |
| L hand | -8 5 3 | -12 1 -1 | -13 0 -3 | -13 0 -3 | -13 0 -3 | -9 -6 -5 | -4 -12 -6 | -4 -75 9 |
| R thigh | -1 1 -35 | 12 -2 -23 | 18 -3 -17 | 15 -2 -15 | 15 -2 -15 | 12 -2 -21 | 8 -2 -27 | -25 7 -30 |
| R shin | 64 -17 31 | 36 -34 21 | 21 -39 13 | 18 -40 11 | 18 -40 11 | 56 -17 7 | 93 -1 -10 | 56 -32 38 |
| R foot | -31 25 17 | -19 16 16 | -13 13 17 | -12 13 16 | -12 13 16 | -6 22 17 | -1 30 18 | 18 5 12 |
| L thigh | -24 -4 18 | -13 -2 14 | -9 -1 12 | -12 -1 12 | -12 -1 12 | 0 0 16 | 14 2 19 | -25 -3 12 |
| L shin | 59 5 -8 | 34 10 -6 | 23 12 -5 | 21 12 -5 | 21 12 -5 | 58 5 -3 | 92 0 2 | 24 6 -3 |
| L foot | -13 2 -10 | -4 -5 -9 | 0 -8 -8 | 2 -8 -8 | 2 -8 -8 | 4 -14 -3 | 7 -20 3 | 50 16 -30 |

### A.6 stealth_throat

**Wren (attacker)**: rig-local Euler XYZ degrees (three.js order) at each core tick; root = [x, z] m in victim space and yaw deg; hy = hips offset m (hips.y = 0.95 + hy, before scale)

| bone | commit 0.00 | drive 0.28 | impact 0.32 | settle 0.55 | extract 0.95 | bladeClear 1.15 | unlock 1.40 | presEnd 2.25 |
|---|---|---|---|---|---|---|---|---|
| root | 0.00, -1.50 / 0° | 0.02, -0.34 / 0° | 0.02, -0.34 / 0° | 0.02, -0.34 / 0° | 0.02, -0.34 / 0° | 0.02, -0.41 / 0° | 0.02, -0.50 / 0° | 0.02, -0.56 / 0° |
| hy | -0.462 | -0.014 | -0.014 | -0.014 | -0.014 | -0.318 | -0.318 | -0.463 |
| hips | 19 -7 -13 | 2 0 0 | 2 0 0 | 2 0 0 | 2 0 0 | 20 0 0 | 20 0 0 | 19 -7 -12 |
| spine/chest | 63 16 -1 | 6 6 0 | 6 6 0 | 6 6 0 | 10 6 0 | 22 8 0 | 22 8 0 | 61 15 -1 |
| neck/head | -43 1 0 | 10 0 0 | 10 0 0 | 10 0 0 | 10 0 0 | 18 0 0 | 18 0 0 | -41 1 1 |
| R upper arm | -12 21 -34 | -39 21 -39 | -44 22 -41 | -43 1 -114 | -91 1 -121 | -30 0 -10 | -30 0 -10 | -12 21 -34 |
| R lower arm | -75 -9 -31 | -65 0 0 | -64 0 0 | 35 0 0 | 1 0 0 | -40 0 0 | -40 0 0 | -75 -9 -31 |
| R hand | -9 -1 7 | 5 46 10 | -7 44 10 | -83 10 -145 | -74 17 -152 | 40 0 0 | 40 0 0 | -11 -1 6 |
| L upper arm | -15 -34 28 | -119 -8 -40 | -122 -5 -38 | -126 -18 -37 | -131 -9 -38 | -129 -21 -72 | -80 0 -5 | -15 -34 28 |
| L lower arm | -50 22 25 | -1 0 0 | -1 0 0 | -67 0 0 | -45 0 0 | -107 0 0 | -50 0 0 | -50 22 25 |
| L hand | -6 24 -7 | 0 0 0 | 0 0 0 | 0 0 0 | 0 0 0 | 0 0 0 | 0 0 0 | -7 24 -7 |
| R thigh | -75 2 -3 | 12 0 -6 | 12 0 -6 | 12 0 -6 | 12 0 -6 | 20 0 -6 | 20 0 -6 | -75 2 -3 |
| R shin | 129 -1 -1 | 26 0 0 | 26 0 0 | 26 0 0 | 26 0 0 | 100 0 0 | 100 0 0 | 129 -2 -2 |
| R foot | -20 4 26 | -14 0 0 | -14 0 0 | -14 0 0 | -14 0 0 | 40 0 0 | 40 0 0 | -20 4 26 |
| L thigh | -121 -18 10 | -22 0 6 | -22 0 6 | -22 0 6 | -22 0 6 | -70 0 8 | -70 0 8 | -121 -18 10 |
| L shin | 90 0 -1 | 30 0 0 | 30 0 0 | 30 0 0 | 30 0 0 | 110 0 0 | 110 0 0 | 90 0 -2 |
| L foot | 12 -8 0 | 0 0 0 | 0 0 0 | 0 0 0 | 0 0 0 | -30 0 0 | -30 0 0 | 12 -7 0 |

**victim**: rig-local Euler XYZ degrees (three.js order) at each core tick; root = [x, z] m in victim space and yaw deg; hy = hips offset m (hips.y = 0.95 + hy, before scale)

| bone | commit 0.00 | drive 0.28 | impact 0.32 | settle 0.55 | extract 0.95 | bladeClear 1.15 | unlock 1.40 | presEnd 2.25 |
|---|---|---|---|---|---|---|---|---|
| root | 0.00, 0.00 / 0° | 0.00, 0.00 / 0° | 0.00, 0.00 / 0° | 0.00, 0.00 / 0° | 0.00, 0.00 / 0° | 0.00, 0.00 / 0° | 0.01, 0.01 / 1° | 0.17, 0.24 / 29° |
| hy | -0.113 | -0.113 | -0.089 | -0.003 | -0.003 | -0.114 | -0.473 | -0.674 |
| hips | -19 -23 -7 | -19 -23 -7 | -17 -22 -6 | -5 -13 -1 | -5 -13 -1 | 0 -9 -1 | 7 -5 -2 | 98 -6 0 |
| spine/chest | 53 -17 4 | 41 -17 0 | 35 -15 0 | 10 0 1 | 15 0 1 | 25 -2 -3 | 33 -6 -7 | 0 0 0 |
| neck/head | 5 27 -9 | -32 27 8 | -39 24 10 | -63 10 11 | -55 12 9 | -39 8 9 | -22 4 10 | -6 56 -1 |
| R upper arm | -3 -5 -26 | -3 -5 -26 | -3 -5 -25 | -3 -6 -16 | -50 29 43 | -44 25 23 | -33 23 -3 | -19 26 -27 |
| R lower arm | -34 -14 -10 | -34 -14 -10 | -34 -10 -7 | -36 11 7 | -115 -5 12 | -66 -1 -2 | -16 -14 -4 | 15 -10 13 |
| R hand | -3 -14 -3 | -3 -14 -3 | -4 -12 -2 | -14 -1 5 | -14 -1 5 | -10 6 6 | -6 14 8 | -4 64 3 |
| L upper arm | -4 -10 48 | -4 -10 48 | -4 -9 44 | -5 -8 20 | -5 -8 20 | -12 -14 27 | -20 -19 31 | -14 -19 27 |
| L lower arm | -49 16 19 | -49 16 19 | -45 14 16 | -25 2 0 | -25 2 0 | -23 3 1 | -23 3 1 | 13 8 -4 |
| L hand | -8 5 3 | -8 5 3 | -9 4 2 | -13 0 -3 | -13 0 -3 | -9 -6 -5 | -4 -12 -6 | -4 -74 9 |
| R thigh | -1 1 -35 | -1 1 -35 | 0 0 -32 | 9 -1 -15 | 9 -1 -15 | 9 -1 -21 | 8 -2 -27 | -25 7 -30 |
| R shin | 64 -17 31 | 64 -17 31 | 59 -21 30 | 21 -40 13 | 21 -40 13 | 57 -17 8 | 93 -1 -10 | 57 -31 38 |
| R foot | -31 25 17 | -31 25 17 | -28 23 16 | -11 13 14 | -11 13 14 | -6 22 16 | -1 30 18 | 17 6 11 |
| L thigh | -24 -4 18 | -24 -4 18 | -22 -4 17 | -15 -2 13 | -15 -2 13 | -1 0 16 | 14 2 19 | -25 -3 12 |
| L shin | 59 5 -8 | 59 5 -8 | 52 7 -8 | 17 13 -4 | 17 13 -4 | 56 5 -3 | 92 0 2 | 25 6 -3 |
| L foot | -13 2 -10 | -13 2 -10 | -11 0 -10 | 6 -7 -8 | 6 -7 -8 | 6 -14 -2 | 7 -20 3 | 49 16 -30 |

### A.7 king_phase1

**Wren (attacker)**: rig-local Euler XYZ degrees (three.js order) at each core tick; root = [x, z] m in victim space and yaw deg; hy = hips offset m (hips.y = 0.95 + hy, before scale)

| bone | commit 0.00 | drive 0.28 | impact 0.32 | settle 0.80 | extract 1.45 | bladeClear 1.65 | unlock 1.90 | presEnd 2.75 |
|---|---|---|---|---|---|---|---|---|
| root | 0.00, 1.80 / 180° | 0.00, 0.95 / 180° | 0.00, 0.95 / 180° | 0.00, 0.95 / 180° | 0.00, 0.90 / 180° | 0.00, 0.96 / 180° | 0.00, 1.05 / 180° | 0.00, 1.10 / 180° |
| hy | 0.001 | -0.110 | -0.110 | -0.140 | 0.064 | 0.065 | -0.017 | 0.001 |
| hips | -5 -13 -1 | 5 -12 0 | 5 -12 0 | 8 -14 0 | -83 74 29 | -72 67 16 | -28 13 -15 | -5 -13 -1 |
| spine/chest | 21 0 0 | 14 22 0 | 14 22 0 | 18 26 0 | 12 46 32 | 20 40 22 | 41 20 0 | 21 0 0 |
| neck/head | -2 11 0 | -8 -20 0 | -8 -20 0 | 0 -22 0 | 56 -82 58 | 32 -71 32 | 7 -15 17 | -2 11 0 |
| R upper arm | 4 -15 -19 | -49 7 27 | -98 -5 11 | 0 63 34 | 12 -51 -48 | 6 -32 -46 | -20 28 -34 | 4 -15 -19 |
| R lower arm | -43 14 13 | -103 0 0 | -10 0 0 | -134 0 0 | -104 7 -25 | -122 5 -7 | -120 13 -21 | -43 14 13 |
| R hand | -14 -1 5 | 113 -27 -4 | 78 -19 -3 | 50 -29 -5 | -14 -1 5 | -14 -1 5 | -14 -1 5 | -14 -1 5 |
| L upper arm | 1 0 18 | -50 0 18 | -50 0 18 | -64 -9 13 | -19 -49 37 | -19 -49 37 | -11 -39 45 | 1 0 18 |
| L lower arm | -31 -5 -2 | -55 0 0 | -55 0 0 | -123 0 0 | -70 -4 -9 | -67 -4 -9 | -78 3 22 | -31 -5 -2 |
| L hand | -13 0 -3 | 0 0 0 | 0 0 0 | 0 0 0 | -13 -1 -7 | -13 -1 -7 | -13 -1 -7 | -13 0 -3 |
| R thigh | 15 -1 -11 | -50 0 -4 | -50 0 -4 | -55 0 -4 | -40 22 -54 | -38 19 -51 | 22 -2 -13 | 15 -1 -11 |
| R shin | 3 -43 2 | 55 0 0 | 55 0 0 | 64 0 0 | -9 4 1 | 4 3 0 | 59 -18 25 | 3 -43 2 |
| R foot | -6 13 15 | -5 0 0 | -5 0 0 | -6 0 0 | 43 9 -3 | 43 9 -3 | 9 12 9 | -6 13 15 |
| L thigh | -9 -1 12 | 25 0 6 | 25 0 6 | 27 0 6 | 6 3 53 | 12 6 53 | 0 0 25 | -9 -1 12 |
| L shin | 8 13 -2 | 28 0 0 | 28 0 0 | 32 0 0 | 29 13 -7 | 28 13 -7 | 47 -1 1 | 8 13 -2 |
| L foot | 8 -7 -8 | -22 0 0 | -22 0 0 | -24 0 0 | -17 -25 3 | -17 -16 1 | -20 -4 -4 | 8 -7 -8 |

**victim**: rig-local Euler XYZ degrees (three.js order) at each core tick; root = [x, z] m in victim space and yaw deg; hy = hips offset m (hips.y = 0.95 + hy, before scale)

| bone | commit 0.00 | drive 0.28 | impact 0.32 | settle 0.80 | extract 1.45 | bladeClear 1.65 | unlock 1.90 | presEnd 2.75 |
|---|---|---|---|---|---|---|---|---|
| root | 0.00, 0.00 / 0° | 0.00, 0.00 / 0° | 0.00, 0.00 / 0° | 0.00, 0.00 / 0° | 0.00, 0.00 / 0° | 0.00, -0.38 / 0° | 0.00, -0.96 / 0° | 0.00, -1.25 / 0° |
| hy | -0.091 | -0.050 | -0.050 | -0.078 | -0.078 | -0.830 | -0.830 | -0.442 |
| hips | -22 -7 -3 | -20 -8 -3 | -20 -8 -3 | 23 -13 -1 | 23 -13 -1 | -108 -13 -1 | -87 -1 -1 | 11 0 -1 |
| spine/chest | 25 34 -21 | -8 37 0 | -11 37 1 | 22 0 -6 | 24 1 -7 | 46 13 -6 | 5 0 0 | 24 7 0 |
| neck/head | 11 -14 7 | -27 -21 -3 | -28 -21 -4 | -5 9 0 | -13 9 1 | 10 -9 2 | -9 0 -1 | -25 -2 -12 |
| R upper arm | 38 -29 -3 | 9 -23 -23 | 9 -23 -23 | -27 39 -34 | -27 39 -34 | 17 61 -120 | -19 19 -25 | -14 58 -74 |
| R lower arm | -43 13 1 | -64 12 7 | -64 12 7 | -51 -14 -17 | -51 -14 -17 | -101 -34 -110 | -11 -15 -7 | -41 1 1 |
| R hand | -37 -2 -7 | -34 -3 -6 | -34 -3 -6 | -14 -1 5 | -14 -1 5 | -8 -10 -13 | -10 -2 -2 | -56 -67 -77 |
| L upper arm | -3 -16 47 | -8 -24 55 | -8 -23 55 | 78 -78 152 | -148 13 -75 | -4 -63 88 | -4 -8 26 | -20 -65 65 |
| L lower arm | -93 53 41 | -94 53 42 | -94 53 42 | -111 -25 45 | -2 50 3 | -89 40 76 | -25 -12 -5 | -73 20 50 |
| L hand | -13 0 -3 | -13 0 -3 | -13 0 -3 | -13 0 -3 | -13 0 -3 | -5 8 7 | -12 0 -2 | 13 2 2 |
| R thigh | -5 3 -20 | 2 0 -20 | 2 0 -20 | -39 7 -20 | -39 7 -20 | -33 3 -9 | -40 4 -12 | -17 1 -9 |
| R shin | 67 -11 24 | 46 -20 19 | 46 -20 19 | 62 -27 40 | 62 -27 40 | 44 -13 12 | 48 -12 13 | 93 0 0 |
| R foot | -5 -1 10 | -6 0 10 | -6 0 10 | -22 12 7 | -22 12 7 | 29 11 -9 | 4 5 8 | 68 -5 11 |
| L thigh | -26 -5 13 | -13 -2 13 | -14 -2 13 | -62 -12 20 | -62 -12 20 | -63 -20 32 | -26 -6 25 | -66 -38 55 |
| L shin | 45 9 -9 | 21 12 -4 | 21 12 -4 | 38 9 -7 | 38 9 -7 | 74 10 -29 | 50 17 -19 | 119 -25 -38 |
| L foot | 24 -15 -3 | 24 -14 -3 | 23 -14 -3 | 6 -7 -9 | 6 -7 -9 | 20 -4 3 | -9 -14 -2 | -37 -47 -6 |

### A.8 kingsfall

**Wren (attacker)**: rig-local Euler XYZ degrees (three.js order) at each core tick; root = [x, z] m in victim space and yaw deg; hy = hips offset m (hips.y = 0.95 + hy, before scale)

| bone | commit 0.00 | drive 0.28 | impact 0.32 | settle 0.80 | extract 1.45 | bladeClear 1.65 | unlock 1.90 | presEnd 2.75 |
|---|---|---|---|---|---|---|---|---|
| root | 0.00, 1.55 / 180° | 0.00, 0.70 / 180° | 0.00, 0.70 / 180° | 0.00, 0.70 / 180° | 0.00, 0.70 / 180° | 0.31, 1.14 / 167° | 0.35, 1.21 / 165° | 0.40, 1.30 / 165° |
| hy | 0.001 | -0.075 | -0.075 | -0.075 | -0.075 | -0.029 | 0.009 | 0.001 |
| hips | -5 -13 -1 | 16 0 0 | 16 0 0 | 16 0 0 | 16 0 0 | -6 0 0 | 0 -8 0 | -5 -13 -1 |
| spine/chest | 21 0 0 | 34 0 0 | 34 0 0 | 40 0 0 | 38 0 0 | -14 8 0 | 6 -12 0 | 21 0 0 |
| neck/head | -2 11 0 | 20 0 0 | 20 0 0 | 20 0 0 | 20 0 0 | -10 0 0 | 4 8 0 | -2 11 0 |
| R upper arm | 4 -15 -19 | 42 -27 -27 | 127 -83 116 | -75 -57 -78 | -70 -43 -76 | -112 -7 -44 | -20 0 -40 | 4 -15 -19 |
| R lower arm | -43 14 13 | 135 0 0 | 169 0 0 | 165 0 0 | 150 0 0 | -55 0 0 | -10 0 0 | -43 14 13 |
| R hand | -14 -1 5 | -176 13 2 | -16 86 -165 | -25 84 -167 | -21 83 -166 | 30 0 0 | 30 0 -20 | -14 -1 5 |
| L upper arm | 1 0 18 | -151 44 -92 | -96 39 -98 | -58 26 -99 | -43 16 -92 | -35 8 -6 | 5 0 8 | 1 0 18 |
| L lower arm | -31 -5 -2 | 23 0 0 | 66 0 0 | 64 0 0 | 64 0 0 | -60 0 0 | -30 0 0 | -31 -5 -2 |
| L hand | -13 0 -3 | 0 0 0 | 0 0 0 | 0 0 0 | 0 0 0 | 0 0 0 | 0 0 0 | -13 0 -3 |
| R thigh | 15 -1 -11 | 8 0 -6 | 8 0 -6 | 8 0 -6 | 8 0 -6 | 16 0 -6 | -12 0 -6 | 15 -1 -11 |
| R shin | 3 -43 2 | 52 0 0 | 52 0 0 | 52 0 0 | 52 0 0 | 18 0 0 | 18 0 0 | 3 -43 2 |
| R foot | -6 13 15 | -30 0 0 | -30 0 0 | -30 0 0 | -30 0 0 | -12 0 0 | 0 0 0 | -6 13 15 |
| L thigh | -9 -1 12 | -38 0 6 | -38 0 6 | -38 0 6 | -38 0 6 | -30 0 6 | 10 0 6 | -9 -1 12 |
| L shin | 8 13 -2 | 62 0 0 | 62 0 0 | 62 0 0 | 62 0 0 | 30 0 0 | 16 0 0 | 8 13 -2 |
| L foot | 8 -7 -8 | -6 0 0 | -6 0 0 | -6 0 0 | -6 0 0 | 0 0 0 | 0 0 0 | 8 -7 -8 |

**victim**: rig-local Euler XYZ degrees (three.js order) at each core tick; root = [x, z] m in victim space and yaw deg; hy = hips offset m (hips.y = 0.95 + hy, before scale)

| bone | commit 0.00 | drive 0.28 | impact 0.32 | settle 0.80 | extract 1.45 | bladeClear 1.65 | unlock 1.90 | presEnd 2.75 |
|---|---|---|---|---|---|---|---|---|
| root | 0.00, 0.00 / 0° | 0.00, 0.00 / 0° | 0.00, 0.00 / 0° | 0.00, 0.00 / 0° | 0.00, 0.00 / 0° | -0.00, 0.00 / 0° | -0.01, 0.01 / -3° | -0.09, 0.11 / -23° |
| hy | -0.578 | -0.578 | -0.578 | -0.578 | -0.578 | -0.636 | -0.737 | -0.685 |
| hips | 29 -5 -1 | 29 -5 -1 | 29 -5 -1 | 29 -5 -1 | 29 -5 -1 | 43 -5 -1 | 61 -5 -1 | 99 -6 0 |
| spine/chest | -2 -1 -12 | -19 3 -12 | -19 3 -12 | -15 3 -12 | -6 0 -12 | -6 0 -11 | -17 1 -6 | -2 0 0 |
| neck/head | 5 2 0 | -38 2 2 | -39 2 2 | -24 2 2 | 21 2 0 | -11 5 -7 | -12 14 -16 | -2 57 -1 |
| R upper arm | -8 0 0 | -8 0 0 | -8 0 0 | -78 18 80 | -8 0 0 | 8 -14 -1 | 20 -28 -9 | -18 25 -26 |
| R lower arm | -10 7 1 | -10 7 1 | -10 7 1 | -107 -2 7 | -10 7 1 | -7 22 3 | -5 37 4 | 15 -8 12 |
| R hand | -4 21 12 | -4 21 12 | -4 21 12 | -4 21 12 | -4 21 12 | -3 26 15 | -3 33 19 | -8 65 0 |
| L upper arm | 1 12 30 | 1 12 30 | 1 12 30 | 1 12 30 | 1 12 30 | 15 33 34 | 19 50 47 | -13 -17 27 |
| L lower arm | -39 -17 -15 | -39 -17 -15 | -39 -17 -15 | -39 -17 -15 | -39 -17 -15 | -56 -26 -35 | -78 -24 -65 | 13 6 -4 |
| L hand | 2 -13 -6 | 2 -13 -6 | 2 -13 -6 | 2 -13 -6 | 2 -13 -6 | 8 -14 -6 | 15 -15 -5 | -4 -75 9 |
| R thigh | 11 -2 -25 | 11 -2 -25 | 11 -2 -25 | 11 -2 -25 | 11 -2 -25 | 14 -3 -23 | 13 -2 -22 | -27 5 -21 |
| R shin | 83 1 -7 | 83 1 -7 | 83 1 -7 | 83 1 -7 | 83 1 -7 | 73 2 -5 | 64 2 -4 | 34 -44 25 |
| R foot | 1 31 12 | 1 31 12 | 1 31 12 | 1 31 12 | 1 31 12 | 9 31 5 | 14 29 0 | 42 -9 23 |
| L thigh | 18 2 16 | 18 2 16 | 18 2 16 | 18 2 16 | 18 2 16 | 15 2 15 | 12 1 13 | -24 -3 12 |
| L shin | 60 1 -2 | 60 1 -2 | 60 1 -2 | 60 1 -2 | 60 1 -2 | 50 2 -3 | 42 3 -3 | 13 7 -1 |
| L foot | 23 -16 2 | 23 -16 2 | 23 -16 2 | 23 -16 2 | 23 -16 2 | 32 -14 2 | 39 -11 1 | 58 18 -31 |
