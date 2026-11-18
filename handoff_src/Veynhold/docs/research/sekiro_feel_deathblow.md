# Sekiro game feel & deathblow presentation — research + Veynhold gap analysis
_Compiled 2026-11-09. Research only; no code changed. Written incrementally._

Confidence tags used below: **[S]** = stated by a source I opened (URL given); **[M]** = community measurement / frame count from a source I opened;
**[E]** = my estimate from common knowledge of the game (60 fps, 1 frame = 16.7 ms) that I could NOT confirm in a source — treat as a starting point to verify by frame-stepping footage.
FromSoftware has published almost nothing numeric about Sekiro's feel; most exact numbers below are community-measured or estimated.

## 0. Veynhold baseline (read from the repo)
Source files: `/workspace/veynhold/src/core.js` (CONFIG lines 12-66, startDeathblow ~L846), `/workspace/veynhold/src/game.js` (deathblow event ~L1203, Cine ~L1172), `/workspace/veynhold/docs/blueprint_v3.md` §3, §5-13.

| Item | Veynhold now (core.js / game.js) | Blueprint v3 target |
|---|---|---|
| Sim | fixed 60 Hz, hit-stop = freeze ticks per fighter | same |
| Hit-stop (ticks @60Hz) | light 3 (50 ms), block 3, heavy 5 (83 ms), deflect 5, perfect 7 (117 ms), break 9 (150 ms), mikiri deflect+2 = 7; `hitStopScale` 1 | Deathblow Impact: 6 ticks at ~0.32 s |
| Deflect window | 0.20 s from press (0.30 accessibility), lateGrace 0.07, perfect ≤0.04 before strike, spam → 55% window | "Preserve…40 ms perfect rule, spam protection" (§12) |
| Buffers | action bufferTime 0.26 s; guardBuffer 0.18 s | preserve; buffer/ignore during deathblow lock |
| Cancels | guard cancels attack startup in first 50% (player), recovery after 20%; dodge→guard at 0.22 s, dodge→attack 0.26 s; light→light chain any recovery; dodge from recovery ≥30%; heavy ≥55%; hitstun→guard in last 0.14 s | preserve |
| Player lights | p_l1 .15/.10/.30 (startup/active/recovery), p_l2 .14/.10/.32, p_l3 .22/.12/.46, p_l4 spin .26/.14/.55 | — |
| Movement | walk 4.4, sprint 7.0 m/s, accel 32, decel 40; dodge 0.36 s / 3.3 m, iframes 0.02–0.26; jump 0.62 s, 0.8 m | plantT 0.09–0.13 s turn ×0.65–0.70; air speed ≤0.70× ground |
| Deathblow core | `startDeathblow`: both fighters locked for `deathblowTime` 1.3 s, one `deathblow` event; no variantId, no ignoreSeparation flag, no Impact hit-stop, no Blade-clear / Unlock events, no plantT | Commit 0 → Drive .28 → Impact ~.32 (6-tick stop) → Settle .55 → Extract .95 → Blade-clear ~1.15 (corpse launch) → Unlock 1.40 → presentation end ~2.25; boss final 2.75 s |
| Deathblow presentation | game.js: normal kill → `Cine.slow(1.0, VISUAL.slowmo=0.32)` (sim slowed ~1 s), letterbox 2.0 s, desat 1.6 s, blood payoff 0.45 s after start (sim time), CamFX kick; final kill → `Finale` cameras 2.7 s (3.3 s Odran) | Camera push-in Commit, hold Drive/Settle, pull back Extract, blend out 0.45–0.60 s after unlock; audio plant .05, impact .32, extract 1.15 |

Notable baseline mismatch already: the blueprint schedule assumes the deathblow clock runs at 1× (only paused by hit-stop), but game.js slows the sim to 0.32× for ~1 s of real time on every normal deathblow. That stretches the 1.3 s lock to roughly 2.0+ s wall-clock and puts the blood payoff (0.45 s sim) well after the blueprint's 0.32 s Impact.

## 1. Deflect timing (the anchor every other number hangs off)
- **Window = 12 frames @60 fps = 0.20 s, starting on the first frame of the press, no startup delay** [S/M]. Game data stores 6 frames at 30 fps (DS Anim Studio, anim `a050_203000`, SpEffect 105010).
  Sources: https://sekiroshadowsdietwice.wiki.fextralife.com/Deflection ; https://gaming.stackexchange.com/questions/387925/how-precise-is-the-deflect-mechanic-in-sekiro ; https://www.nexusmods.com/stellarblade/articles/199 (credits Igor's "Sekiro Deflecting EXPLAINED" video https://www.youtube.com/watch?v=d4zsm63x730).
- **Spam penalty**: each recent guard release shrinks the next window, stacking, down to ~4 frames and eventually 0 [S, fextralife]. **Reset** by any successful deflect, or after **30 frames (0.5 s)** without releasing guard [S, both].
- A missed deflect while guard is held simply **becomes a block** (posture damage, no HP loss) [S].
- **There is no "perfect" tier in Sekiro**: deflect is binary [S, GameFAQs/Steam threads, consistent with the wiki]. The only graded read is *visual/audio*: the block vs deflect difference (see §3). Community folklore of a "perfect deflect" refers to the bigger spark burst on deflects vs blocks.
- Back-to-attacker attacks can't be deflected [S, Steam thread]. Veynhold's 240° deflect arc is more generous (fine; keep).

**Veynhold vs Sekiro**: window 0.20 s ✔ identical. Spam factor 0.55 (single step) vs Sekiro's stacking shrink-to-zero — Veynhold is more forgiving, deliberate. lateGrace 0.07 s has no Sekiro analogue (Sekiro is strictly press-before-hit); it is an accessibility/netcode-style allowance that is fine for a browser game with input latency. Veynhold's perfect/good/late grading is an *addition* over Sekiro; keep it but make sure the grades read mostly through VFX/SFX, not big timing differences (see gap table).

## 2. Hit-stop
What the sources actually say:
- A Japanese developer's study of Sekiro (techblog.sumelagi.co.jp, 2024) lists **"ヒットストップ: なし" (hit-stop: none)** for player sword hits; impact is sold instead by enemies guarding (normal guard and a "big guard" with a shockwave ring), sparks at the contact point, and the enemy's own reaction [S]. https://techblog.sumelagi.co.jp/gamestudy/210/
- No public source gives a FromSoftware hit-stop frame count for deflects or deathblows. My own read of the game, which I could **not** confirm in a source: deflects have a very short freeze (on the order of 2–4 frames @60, ~33–67 ms) that is mostly *pose-hold + spark*, not a global time stop; consecutive deflects in a flurry stay rhythmic, which is only possible because the stop is short [E]. Deathblow impact is sold by the animation's own sharp key (stab-in) and blood burst, plus a brief slow/hold on boss finishers [E].
- Design consequence (consistent with both the source and the rhythm-game reading of Sekiro, e.g. https://www.bayjinger.com/2019/05/04/sekiro-after-80-hours/): **hit-stop must be small and uniform enough that a 3–5-hit deflect string keeps its musical tempo.** Every tick of freeze added to a deflect is a tick added between the beats of the enemy's string.

**Veynhold**: light hit 3 ticks (50 ms), block 3, heavy 5, deflect 5 (83 ms), perfect 7 (117 ms), break 9 (150 ms). These are fighting-game-heavy compared with Sekiro. The deflect value matters most: Veynhold freezes *both* attacker and defender, so a 4-hit string that is fully deflected gains 4×5 = 20 ticks (0.33 s) — 7×4 = 28 ticks (0.47 s) if all perfect — of dead time. Because the AI string timer is frozen too, timing is preserved (no desync), but the *tempo* is slower and lumpier than Sekiro's.

### 2a. Hit-stop — hard data (reverse-engineering project, strongest source found)
RustSekiro (https://github.com/FFwLo/RustSekiro) is a community re-implementation that validates against the Sekiro exe (Ghidra decompile + emulated cases + 60 Hz live recordings). Its `docs/kb/guard-deflect.md` (https://raw.githubusercontent.com/FFwLo/RustSekiro/main/docs/kb/guard-deflect.md), section "Hit stop (redone 2026-10-11)" [M]:
- Hit-stop comes from AtkParam `hitStopTime` (player slashes: **0.1 s**). Attacker freezes for hitStopTime × the **defender's** NpcParam `hitStopType` scale (0 = none, 1 = 0.5, 2 = full). Defender freezes only if its own `hitStopType_Defencer` is 1 (Wolf always).
- **Most NpcParam rows are 0/0, so Wolf's sword on ordinary enemies and bosses freezes nobody.** Only a few big creatures use it (Guardian Ape, Okiryu at half; Great Serpent full).
- When it does apply, the clock **holds 0.06 s, then eases back** as (elapsed/length)² — a 0.1 s stop costs ~0.127 s total. It is an eased hold, not a hard freeze-then-snap.
- Deflect/block of the Ashina General's attacks: **"No hit stop in any case"** (his rows have hitStopTime 0).
- Deflect timing confirmed against the exe: guard clip time **0.017–0.20 s → deflect, ≥0.217 s → block**; a press 1 frame before contact is still a hit (guard clip not started).
- Knockback (AtkParam knockbackDist_*): enemy hit ~1.0 m, enemy combo guarded **1.08 / 1.80 / 2.16 m**, **deflected 0.4–0.5 m**; player slashes guarded 1.0–1.4 m. KnockBackParam: hold speed for ContTime, then linear to 0 over DecTime.

**Conclusion**: Sekiro's "impact" on deflects is **not** hit-stop. It is spark FXR + clang SFX + the defender's short recoil anim + a small 0.4–0.5 m push. Veynhold's 5–7 tick deflect freezes are the single biggest feel divergence from Sekiro in the combat loop. Recommendation in the gap table: deflect 2 ticks, perfect 3, with an ease-out instead of a hard stop.

## 3. Sparks, VFX and sound layering
- **Deflect vs block are different effects**: Ashina General's sword deflected → FXR **252001 "Jasuga sparks"**; guarded (blocked) → **201002**; Wolf cutting armour → 201001 + 229001. Chosen from HitEffectSfx tables by attack material and attack power class (Slash/Blow/Thrust × S..LLL), so bigger weapons throw bigger sparks [M]. https://raw.githubusercontent.com/FFwLo/RustSekiro/main/docs/kb/fxr.md
- Colour/size: no source gives numbers. My read [E]: deflect = a large, bright, hot white-yellow core with orange streaks thrown outward in a fan, plus a brief light flash (~1.5–2× block's spark count and reach); block = a smaller, duller orange-red puff that falls quickly. The Japanese study confirms the two tiers are told apart "immediately by sound and effect" and that an enemy's "big guard" adds a shockwave ring [S]. https://techblog.sumelagi.co.jp/gamestudy/210/
- **Sound**: deflect and block are separate events — deflect uses HitEffectSe**JustGuard**Param first, block uses HitEffectSeParam (e.g. Iron_Slash_S) [M] (https://raw.githubusercontent.com/FFwLo/RustSekiro/main/docs/kb/sound.md). Players and IGN describe the deflect as a **higher-pitched, louder, ringing metallic clang**; block is a duller, lower thud-clank [S] (https://www.ign.com/wikis/sekiro-shadows-die-twice/How_Combat_Works_in_Sekiro, search excerpt; Steam threads). Deflect clang is audible to 60 m (sound distance class) vs 0–29 m for swings [M].
- **Deathblow sound mix** [M, sound.md]: every deathblow anim requests a mix snapshot — a **low-pass on the whole Default channel group (≈445 Hz)**, faded **in over 0.3 s**, and **out over 2 s after the anim ends**. So the world goes muffled and the deathblow's own stab/blood layers (on a different bus) cut through clean. This is the "clean" feeling of a Sekiro deathblow. Pitch values of the stab itself are not public.
- CEDEC Awards 2020 Sound category honoured the Sekiro sound team for "wide dynamics" and careful balance between diegetic and game-presentation sounds [S] https://cedec.cesa.or.jp/2020/event/awards/snd.html

## 4. Camera
[M] from https://raw.githubusercontent.com/FFwLo/RustSekiro/main/docs/kb/guard-deflect.md and .../camera.md:
- Lock camera (LockCamParam row 0): **distance 4.5 m, vertical FOV 43°, focus height 1.5 m**, pitch −40..80° free, −30..30° locked (widens with height gap 0.5→3 m), target lock range 30 m.
- Lock chase: yaw rate 0.3, pitch 0.6 per 1/30 s step (≈ frame-rate-independent exponential); looks down ~9.7° (FOV·0.5·0.45) so the enemy sits above centre.
- Free follow: focus chased at XZ 0.2 / Y 0.3 per 1/30 s.
- Shake = authored "rumble" camera animations triggered from the animation (TAE): e.g. **0.17 s / 1.1°** (light), **0.3 s / 4°** (heavy), long rumbles for set pieces. Rotation shake, not positional noise.
- **Deathblow camera stays in the gameplay camera — no cut.** Deathblow anims switch the camera-set slot to 41 → CameraParam 4000 (lock chase 0.4/0.2); distance target goes **≈4 → 1.5 m → back**, blended with ease-in 1−(p−1)² and the used distance following at 0.1/frame. Only boss **finishers** use bespoke cinematic animations.
- Japanese study: camera position fixed, **no left/right shoulder offset**, look-at at the neck, character fills ~half the screen; on posture break the camera "zooms in at once" while the enemy holds the pre-deathblow pose; on the deathblow it "pushes right in" with heavy blood [S] https://techblog.sumelagi.co.jp/gamestudy/210/
- No slow-motion on regular deathblows [E — consistent with everything above; I found no source mentioning one].

**Veynhold**: dist 5.4, shoulder 0.85, FOV 60 (horizontal vs vertical not checked — verify which axis Three.js uses: PerspectiveCamera fov is *vertical*, so 60 vs Sekiro 43 is a real gap), shake = trauma² sine noise. Deathblow: 0.32× slow-mo for ~1 s real time + letterbox + `Cine.focus`. Measured from game.js `Cine.timeScale` (script, ignoring hit-stop): with slow-mo, blueprint Impact (0.32 deathblow-clock) lands at **0.85 s** wall-clock, Blade-clear (1.15) at **1.70 s**, Unlock (1.40) at **1.95 s**. Without slow-mo they would land at 0.32 / 1.15 / 1.40. The current blood payoff (`pending` at +0.45 s sim) lands ~1.0 s after the press.

**Veynhold sparks/SFX already follow Sekiro's split well** (game.js ~L2275–2281, L111–116): deflect = 26–44 streak sparks warm white→gold `[1,.75,.4]`/`[1,.95,.85]`, ring, flash, glare, inharmonic bell partials 1180–6900 Hz + 3.5 kHz noise tick; block = 8–10 dull orange sparks `[.9,.55,.25]`, no flash, 210/640 Hz + 900 Hz low-passed noise. Gaps are small (see table). Note: `feel(..., VISUAL.hsPerfect=0.075 s)` / `hsHeavy=0.05 s` add a presentation hold, but game.js L933 caps it *inside* the core freeze, so it is not additive — any core hit-stop reduction must shrink these two values with it (keep them ≤ the new tick counts). The deathblow SFX (`case 'deathblow'`, L116) fires as one layer at t=0, before the blade lands.

## 5. Deathblow
Sources: [S] fextralife https://sekiroshadowsdietwice.wiki.fextralife.com/Deathblows ; [M] RustSekiro guard-deflect.md (URL above); [S-excerpt] https://gaming.stackexchange.com/questions/348757/does-the-deathblow-animation-grant-i-frames (search excerpt only, not opened).
- **Trigger**: red indicator; press Attack. Opens on posture full, vitality empty, or unaware enemy from behind/above/below/wall/ledge [S].
- **Window**: break anim applies the "collapsed" state for frames 0–75 @30 fps = **2.5 s**; a missed window gives no posture restore beyond the regen rule [M].
- **Range/angle** (ThrowParam): posture broken by hits ("崩し") Dist **2.1 m**; broken by a deflect ("弾き") Dist **4.0 m**; plus a forward cone and a victim-yaw window; victim yaw 90–180° relative → **behind variant** where the victim *keeps facing away** [M].
- **Pairing ("absorb")**: Wolf is moved onto the victim's absorb dummy over **0.5 s** interpolation (adsrobModelPosInterpolationTime 0.5) — i.e. the pair is *eased* into alignment while the animation starts, never snapped [M].
- **Variants**: per enemy family (ThrowParam rows per attacker/defender character pair, e.g. Ochimusha uses its own a200 set), per direction (front vs behind), per context (plunge from air, ledge, wall, vault-over, anti-air), boss/mini-boss per-life deathblows plus boss-specific Finisher animations [S/M]. 188 deathblow animations carry the deathblow mix event [M].
- **Invulnerable from commit until control returns** [S-excerpt].
- **Sound**: global low-pass muffle in 0.3 s, out 2 s after anim (§3) [M].
- **Camera**: in-game camera, distance ≈4→1.5 m and back; no cut (§4) [M].
- Not found in any source: exact total length, frame of control return, frame of the stab, the kick-off timing, blood FXR timing. My frame-by-frame recollection, **unverified, treat as a hypothesis to check by stepping a 60 fps capture** [E]: common front deathblow ≈1.6–2.0 s; blade enters ≈0.25–0.35 s after the press; ≈0.3–0.5 s held impaled; Wolf plants a foot/shoulder and **drives the body off the blade (the "kick-off")** with a pull-through at ≈0.9–1.2 s that throws a directional blood arc along the extraction; corpse collapses under ragdoll-like momentum; Wolf is free to act ≈1.3–1.5 s (tail is a cancelable settle/blade flick). This matches the blueprint's Impact 0.32 / Extract 0.95 / Blade-clear 1.15 / Unlock 1.40 almost exactly — the blueprint basis is Sekiro-shaped.
- An AI-generated-looking textbook page (datafield.dev) claims a "five-second kill cinematic"; it conflicts with everything else and I discount it.

## 6. Hit-reaction hierarchy
[M] RustSekiro guard-deflect.md / damage.md; [S] techblog.sumelagi; [S-excerpt] Jason de Heras https://www.jasondeheras.com/gamedesign/2021/5/23/iu0vmcxg97b1sdkkf4s34lo77qb82s
1. **Guarded by enemy** (most of your hits on an idle/approaching enemy): guard or "big guard" (sparks + shockwave; after a big guard the enemy attacks at once). Hits land mainly during enemy attacks or flinches [S].
2. **Flinch** (damage S/M/L by attack damage level; knockback rows damage_S/M/L ≈1.0 m). Ordinary enemies have toughness/super-armour 0, so a landed hit always flinches [M].
3. **Deflected / blocked attacker**: "Hard" = deflected (AttackBound L/R by swing side, 0.4–0.5 m push), "Easy" = blocked; additive variants exist [M]. The Japanese study counts ~6 deflect motions: left, right, up, down, mid-flinch, big-flinch [S].
4. **Guard break** (player posture empties under a guard): GuardBreak clip, 1.08 m push [M].
5. **Posture break / collapse**: from hits → TrunkCollapseFront/Back; from deflect/guard → AttackBoundEmptyStamina / GuardBreak; 2.5 s deathblow window [M].
6. **Knockdown**: reserved for specific heavy attacks/kicks and falls (large knockback rows) [E — rows exist in data, specific triggers not verified].
- Wolf **keeps his facing** when hit (positional reactions), unlike DMC [S-excerpt].

**Veynhold**: hit 0.45 s / heavy 0.65 s, recoil 0.42, deflected-final recoil 0.6, mid-string deflect adds 0.1 s gap, enemy poise breakout after 2 hits (0.12 s), broken 2.2 s (enemy), 1.25 s (player); knock 3.0/5.0/6.0 m/s with ×0.86/tick decay ≈ **0.36 / 0.60 / 0.71 m** travel (blueprint wants 2.0/3.6/6.0 m/s). Hierarchy shape matches Sekiro; distances are about ⅓–½ of Sekiro's.

## 7. Input buffering and cancels
[M] https://raw.githubusercontent.com/FFwLo/RustSekiro/main/docs/kb/input-buffer.md ; [S-excerpt] Jason de Heras https://www.jasondeheras.com/gamedesign/2021/2/11/meleecombatdesign
- Sekiro's buffer is **window-gated, not timer-gated**: each animation opens an *accept* window (press is latched) and later an *execute* window (latched press fires). Presses **before** the accept window are dropped ("mash before the window is dropped"); a latched press has no expiry until used or until an animation reset clears it.
- Tap slash → next slash: accepted from TAE frame 6 (**0.20 s**), executes at frame 15 (**0.50 s**). Guard/jump/step get **early cancel windows at frames 3–15 (0.10–0.50 s)** of the attack. Buffered actions fire ~1 game frame after the window opens.
- **Guard must still be held** when a buffered guard executes (released taps are dropped), except in the deflect-spam chain.
- Design summary: "small window at the start of an attack to Block or Evade cancel; once committed you cannot cancel until after the hit frames" [S-excerpt]; Polygon notes Sekiro added attack-cancelling to the Souls formula (https://www.polygon.com/2019/4/1/18282744/sekiro-fromsoftware-dark-souls-canceling).

**Veynhold**: timer buffer 0.26 s; guard buffer 0.18 s; guard cancels the first 50% of player startup (p_l1: 0.075 s) and recovery after 20%; dodge from recovery ≥30%, heavy ≥55%, light→light anywhere in recovery; dodge→guard 0.22 s, dodge→attack 0.26 s. This is functionally close to Sekiro. The only material gap is during the deathblow lock: presses during `deathblowExec` expire after 0.26 s, so a press made early in the 1.3 s lock is lost and one made in the last 0.26 s fires on unlock — accidentally Sekiro-like, but not explicit (blueprint §12 asks for explicit ignore-or-buffer).

## 8. Player attack string timing
- Sekiro tap-slash chain cadence ≈ **0.5 s per slash** (execute at TAE f15) [M]; Combo1 hold accept f21 / execute f33 (0.7 / 1.1 s) [M]. Attack can be steered with the stick throughout [S-excerpt, de Heras]. Strings alternate sides (Combo1 → 2 → 3, reverse after deflect) [M, attacks.md https://raw.githubusercontent.com/FFwLo/RustSekiro/main/docs/kb/attacks.md].
- **Veynhold**: p_l1 .15/.10/.30, p_l2 .14/.10/.32, p_l3 .22/.12/.46, p_l4 .26/.14/.55; chain allowed from recovery start → fastest cadence ≈ 0.25 s (l1→l2), roughly **2× Sekiro's tempo**. Combat was locked by Caiden at v8 ("combat is great"), so treat this as informational, not a defect.

## 9. Movement (context)
[M] https://raw.githubusercontent.com/FFwLo/RustSekiro/main/docs/kb/movement.md (live 60 Hz recordings)
- Walk loop 1.61 m/s; **run 5.26–5.55 m/s**; **sprint 8.6–8.9 m/s**; step (dodge) 3.61 m/s steady; free turn 720°/s (exe default), sprint 360°/s.
- Jump: launch 9.4–9.8 m/s up, **apex 1.98 m**, **0.82 s airborne**, effective gravity 23.5 m/s² (9.8 + 13.72 fall accel); air stick accel 10, max 2 m/s. Grapple flight brakes at 10 m/s².
- Veynhold: walk 4.4, sprint 7.0, strafe 3.9, dodge 3.3 m/0.36 s, jump 0.62 s / 0.8 m. Veynhold's "walk" is Sekiro's run; sprint ~20% slower; jump much lower and shorter (fine for an arena game; matters only if world traversal wants Sekiro verticality).

---
# 10. GAP TABLE
Priority: **P0** = needed for the blueprint-basis deathblow (Caiden's standing requirement: "must follow that basis and have a fluid animation and feel clean"); **P1** = feel improvement, touches combat that Caiden locked at v8 (needs his OK); **P2** = optional.
All times at 60 Hz; "tick" = 1/60 s.

| # | Area | Sekiro | Veynhold now | Recommended change (numbers) | Risk | Pri |
|---|---|---|---|---|---|---|
| 1 | Deathblow core schedule | One continuous anim; stab ~0.3 s, control ~1.3–1.5 s [E]; whole thing invulnerable | `deathblowTime 1.3` for both, single `deathblow` event, no bookmarks | Implement blueprint §7.1 exactly: `combat.deathblow = {drive:.28, impact:.32, settle:.55, extract:.95, bladeClear:1.15, unlock:1.40, presEnd:2.25, impactStop:6}`; boss final `{settle:+.25, extract:+.25, total 2.75}`. Fighter gets `dbT` (deathblow clock, advanced only when `freeze===0`). Emit `deathblowStart{attacker,victim,variantId,duration}`, `deathblowImpact`, `deathblowBladeClear{vx,vz,vy}`, `deathblowUnlock`. | Medium: self-tests that step 120 ticks after a deathblow (core.js L946, L1047) still pass at 1.40+0.1; determinism hash test (L975) changes values — re-baseline. | P0 |
| 2 | Slow-motion | None on regular deathblows [E] | `Cine.slow(1.0, 0.32)` slows the **sim**: Impact lands at 0.85 s, Unlock at 1.95 s wall-clock | Remove the sim slow-mo on normal deathblows (`case 'deathblow'` L1204). Boss Finale: also no sim slow-mo (it stretches the 2.75 s core clock); if a "slow" read is wanted, do it with camera/letterbox/audio only. | Low code risk; feel risk: the kill reads faster — compensate with #5 camera push-in and #7 audio muffle (that is Sekiro's actual recipe). | P0 |
| 3 | Impact hit-stop | Not documented; anim holds the stab [E] | none inside deathblow (only break 9 ticks earlier) | 6 ticks at Impact (blueprint), freezing **both** fighters; presentation pauses phase clock while `freeze>0` (blueprint §3.1 step 3). Use the eased release (hold 60%, ease 40%) in presentation pose only. | Low | P0 |
| 4 | Pair alignment | "Absorb": attacker eased onto victim dummy over **0.5 s** | facing snapped instantly; no position change, so a 2.9 m start leaves the blade short | Core Commit phase: move attacker along the line to a **pair distance 1.05 m** (sum radii + 0.15) with smoothstep over **0.22 s** (ends before Drive 0.28); rotate facing over the same 0.22 s (max 16 rad/s) instead of snapping; victim faces attacker only for front variants. `ignoreSeparation=true` from 0.00. | Medium: positions are core-owned; deterministic smoothstep keeps replay determinism; needs a test that the gap closes to 1.05±0.02 m by 0.28 s from any start ≤ range. | P0 |
| 5 | Deathblow camera | Gameplay camera, distance ≈4→1.5 m, eased 1−(p−1)²; no cut | `Cine.focus` 1.7 s + letterbox 2.0 s + CamFX kick 0.2 at start | Push-in during Commit (0→0.28): dist 5.4→**2.0 m**, shoulder 0.85→0.35, FOV 60→54; hold Drive/Settle; at Extract (0.95) pull back to 3.2 m over 0.25 s; after Unlock blend to gameplay over **0.5 s** (blueprint 0.45–0.60). Ease 1−(1−p)². Shake: 0.17 s / ~1° rotational at Impact, 0.3 s / ~3° at Blade-clear (replace start-of-blow CamFX kick). Letterbox: on at Start, off at **presEnd 2.25** (not a fixed 2.0 s timer). Player input moves the character while camera still blends. | Low–medium: occlusion — use `Region.camClear` fallback (blueprint §9) when the 2.0 m push-in clips walls. | P0 |
| 6 | Blood / VFX timing | Blood bursts with the stab and a directional arc on extraction [E] | One big payoff at +0.45 s sim (≈1.0 s wall with slow-mo): sparks 46, flecks, 2 splashes, stain, ring, flash, FOV −4 | Bind to core events: **Impact (0.32)** = small entry spurt (flecks 10, splash ×1, dark red `0x6a0a08`→`0xb01510`), no ring; **Bladeclear (1.15)** = main spray along `extractDir` (presentation-RNG scatter, 24–30 flecks, splash ×2, stain 1.6 m, FOV −3); drop the white-gold `FX.ring`/`FX.flash` on deathblows (those read as deflect sparks, which muddies the language). Pool everything; Low tier halves counts. | Low | P0 |
| 7 | Deathblow audio | Global low-pass ≈445 Hz in 0.3 s, out over 2 s after anim; stab layer cuts through | One `deathblow` layer at t=0 (400 Hz band noise + 55 Hz + 1400 Hz) | Blueprint §10 map: **plant 0.05** (cloth/foot scuff), **impact 0.32** (wet thrust + low 55–70 Hz thump + short metallic tick), **tension 0.70** optional (low breath/creak), **extract 1.15** (blade draw 1.4→0.6 kHz sweep + spray), body land on corpse contact. Duck music/ambience bus with a **lowpass to ~500 Hz in 0.3 s**, release over **2.0 s** from presEnd. Stingers stay unfiltered (priority list §10). | Low; WebAudio BiquadFilter on the bed bus is cheap on Chromebook. | P0 |
| 8 | Corpse launch | Body driven off the blade, falls with momentum | `finishDeathblow` at 1.3 s; corpse pose from presentation; enemy `dead` friction 0.9/tick | At **bladeClear 1.15**: core emits launch `v = normalize(extractDir)·1.1 m/s + up 0.25 m/s` (blueprint 0.9–1.3); call the marks/death logic here (not at unlock); Col hand-off blend 0.18 s. preferredSide from attacker/victim facing (deterministic). | Medium: phase-2 bosses (marks>1) must *not* launch — branch to the existing transition at bladeClear. | P0 |
| 9 | Unlock & input | Invulnerable until control returns; window-gated buffer | Lock 1.3 s; buffered presses expire after 0.26 s | Unlock at **1.40**: clear `ignoreSeparation`, actionable. Inputs pressed in **[1.15, 1.40)** are latched and fire on unlock; earlier ones dropped (Sekiro "mash before the window is dropped"). Guard must be held at unlock to fire. Keep player invulnerable to *other* enemies from 0 → 1.40 (Sekiro behaviour; prevents a "clean" kill being interrupted). | Low–medium: invulnerability in multi-enemy fights; allies already hesitate (blueprint §13). | P0 |
| 10 | plantT | — (Sekiro hides it in the anim's settle) | none | `plantT = 0.11 s` at Extract-end (≈unlock), turn rate ×0.68; never locks actions (blueprint §3.2, §5.1). | Low; update turn-rate self-tests. | P0 |
| 11 | Variant selection | Per enemy family + front/behind + context | none (presentation picks by `look`) | Core `variantId = profile.deathblowVariant ‖ mapLook(look) ‖ 'heart'` (blueprint §7.4). Optional addendum: front/back by `|wrap(victimYaw−attackerYaw)| ≤ 90° → back`, victim not spun for back variant. | Low; the direction split is an extension beyond §7.4 — ask before adding. | P1 |
| 12 | Break window | 2.5 s | enemy 2.2 s | 2.5 s | Low; slightly easier | P2 |
| 13 | Deathblow range | 2.1 m (hit break) / 4.0 m (deflect break) | 2.9 m flat | Keep 2.9 m once #4 closes the gap; optionally 3.6 m when broken by a deflect | Low | P2 |
| 14 | Deflect hit-stop | ≈0 on ordinary enemies; when present 0.1 s eased (0.06 hold) | 5 ticks both fighters; perfect 7 (+0.075 s pres hold) | **deflect 2, perfect 3**, heavy-attack deflect +1; presentation hold capped at the new ticks (`hsPerfect` 0.04). Keeps a 4-hit flurry ≤ 12 extra ticks instead of 20–28. | Medium: feel was signed off at v8; the self-test at core.js L931 counts ticks (`w.tick === 16`) — update. | P1 |
| 15 | Hit hit-stop | 0 vs ordinary enemies and bosses; 0.1 s only vs a few big creatures | light 3, heavy 5, block 3, break 9 | light **2**, heavy **3**, block **2**, break **6** (break is the posture-snap beat — keep it the biggest). | Medium (same as #14) | P1 |
| 16 | Knockback distance | hit ≈1.0 m, guarded 1.08–2.16 m, deflected 0.4–0.5 m | ≈0.36 / 0.60 / 0.71 m (3.0/5.0/6.0 m/s, ×0.86/tick) | Blueprint §5.2 values (2.0/3.6/6.0/2.8–4.2 m/s) — note these are *smaller* than today for light/heavy; Sekiro distances would need ≈8 m/s with the same decay. Decide which basis wins; blueprint governs. | Medium; the blueprint and Sekiro point opposite ways here. Flag to Caiden. | P2 |
| 17 | Camera framing | dist 4.5 m, vFOV 43°, focus 1.5 m, no shoulder offset, rotational authored shake 0.17 s/1.1°–0.3 s/4° | dist 5.4, vFOV 60, shoulder 0.85, trauma² sine shake | Lock-on: dist **4.8**, vFOV **50** (Chromebook screens are small; 43 is too tight), shoulder **0.4**. Shake: rotation-only, max 4°, 0.17–0.3 s. | Low–medium: wider arena awareness lost; tune live via Tune panel. | P2 |
| 18 | Deflect vs block VFX/SFX | 2 separate FXR/SE tables; deflect brighter/bigger/higher clang | already split (44 vs 10 sparks, bell partials vs dull clank) | Keep. Small: block sparks fall (gravity 9 m/s²) and die by 0.15 s; deflect streaks fan *perpendicular* to the blade-contact normal; perfect adds the white ring only (already). | Low | P2 |
| 19 | Attack cadence | ≈0.5 s per tap slash | ≈0.25 s fastest chain | Informational only (combat locked at v8). If ever revisited: `chainAt` earliest ≈0.38 s from attack start. | High feel change | — |
| 20 | Movement | run 5.3, sprint 8.7, jump apex 2.0 m / 0.82 s | walk 4.4, sprint 7.0, jump 0.8 m / 0.62 s | None for arena combat; revisit for world traversal only. | — | — |

## 11. Deathblow: fluid & clean — the one-page spec (blueprint-basis)
Deathblow clock `t` (s), advanced only when core `freeze===0`; presentation phase clock pauses with it.

| t | Core | Presentation (pose / camera / VFX / audio) |
|---|---|---|
| 0.00 Commit | lock both, `ignoreSeparation`, `variantId`, emit start; begin 0.22 s smoothstep alignment to 1.05 m and facing turn | Commit blend 0.12 (smootherstep) from the *displayed* pose; camera push-in begins; world bus lowpass → 500 Hz over 0.3 s; letterbox in |
| 0.05 | — | plant SFX |
| 0.28 Drive | alignment complete | Drive blend 0.08; camera holds at 2.0 m |
| 0.32 Impact | 6-tick freeze (both) | entry spurt, impact SFX layers, 0.17 s/1° shake, blade lag kick 1.5 rad/s (§6) |
| 0.55 Settle | — | Settle blend 0.14, Override 1.0/Base 0.0, blade-lag stiffness up |
| 0.70 | — | optional tension SFX |
| 0.95 Extract | — | Extract blend 0.11; kick-off/pull-through; camera starts pull-back to 3.2 m |
| 1.15 Blade-clear | emit launch v (1.1 m/s along extractDir + 0.25 up); marks/death resolve | main blood spray along extractDir; extract SFX; 0.3 s/3° shake; Col hand-off 0.18 |
| 1.40 Unlock | clear separation lock, actionable, `plantT 0.11`, fire latched input; emit unlock | camera blends to gameplay over 0.5 s; player can move |
| 2.25 Pres. end | (nothing; core already free) | letterbox out; bus lowpass releases over 2.0 s |
| Boss final | same with Settle +0.25, Extract +0.25 → 2.75 s total | authored 3–4 shots (blueprint §9) |

Why this reads "clean": every beat is on the deathblow clock (no wall-clock timers, no sim slow-mo), every blend starts from the currently displayed pose, the only freeze is the single Impact stop, the pair is eased (not snapped) into contact, blood is two beats tied to the blade (in / out) instead of one generic burst, and the world audio drops away so the two blade sounds own the moment — which is the measurable part of Sekiro's recipe.

## 12. What I could not establish
- Exact Sekiro deathblow total length, control-return frame, kick-off frame and blood timing: no public frame data found; numbers in §5 are my hypothesis, flagged [E]. Verify by stepping a 60 fps capture (e.g. the all-bosses deathblow showcase https://www.youtube.com/watch?v=-FTy_AEd3bw) or RustSekiro's `clips.md` (not fetched — budget).
- Deflect clang pitch in Hz and spark colours/counts: not in public sources; descriptions only.
- Deflect hit-stop for enemies other than the Ashina General: data says 0 for his rows; other enemies unverified.
- FromSoftware animation interviews: only staff career pages and a contractor credit (TECO did "many deathblow player motions", https://tecoteco.jp/work_intro/sekiro_shadows_die_twice/); no timing talk found.
- Fetch budget: 16 page fetches used (one over the ~15 asked) — 7 RustSekiro KB files were the highest-value sources.
