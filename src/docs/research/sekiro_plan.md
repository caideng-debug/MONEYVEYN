# Sekiro → Veynhold implementation plan (2026-11-09)
Sources: sekiro_posture_deflect.md, sekiro_enemy_ai.md, sekiro_feel_deathblow.md (this folder). Basis rule: blueprint v3 wins where it is explicit; Sekiro fills gaps.

## Tier A: deathblow fluidity (no feel sign-off needed; follows blueprint §7)
1. Remove the `Cine.slow(1.0, 0.32)` sim slow-mo on normal deathblows (game.js `case 'deathblow'`). It stretches impact to 0.85 s and unlock to 1.95 s wall-clock, breaking §7.1. On the boss finale, use no sim slow-mo either; sell it with camera, letterbox and audio.
2. Ease the pair into contact over 0.22 s to 1.05 m. No snap, and the blade can't fall short from 2.9 m.
3. Blood in two beats: a small entry spurt at Impact (0.32) and the main spray along extractDir at Blade-clear (1.15). Drop the white-gold ring and flash, which read as deflect sparks.
4. World-audio muffle: lowpass to about 445 Hz over 0.3 s, back over 2 s. The blade sounds own the moment.
5. Camera stays in gameplay view: push in about 4 → 1.5 m through Commit/Drive, hold, pull back from Extract, blend out 0.5 s after unlock.
6. Deathblow window after a break: 2.2 → 2.5 s, moved into CONFIG.

## Tier B: posture and deflect (changes v8-locked feel, needs Caiden's OK)
7. Anti-mash ladder: deflect window [12,10,8,6,4] ticks per recent press; reset after 30 idle ticks or a successful deflect.
8. Deflects stop restoring player posture. Optionally they cost a small amount (post×0.40) with a rule that a deflect can never break your posture.
9. A swing the enemy deflects costs the player 0 posture (currently post×1.5).
10. Enemy posture recovery: no start delay, and a stepped vitality curve (100/66/33/1% at 75/50/25% HP) replacing the linear 0.35 floor.
11. Player bar resets to 0 after their own break. Enemy bar goes to 80% if the deathblow window expires. Dodge out of break from 0.4 s.
12. Hit-stop trim: deflect 5→2, perfect 7→3, light 3→2, heavy 5→3, break 9→6 ticks.

## Tier C: enemies and bosses
13. Perilous kanji shown 0.45–0.60 s before impact rather than at startup. 50/50 openers that resolve ≥0.40 s before impact.
14. Counter after N blocked hits: Gaoler 3, Brask 3, Sallow 2, Odran 4. A held-guard habit doubles grab and sweep weights. Healing triggers a gap-closer within 8 m.
15. Branch after a deflected final hit, distance-dependent enders, fixed-timing counters that reward deflects.
16. Odran phase 2: a "Verdict" opener (1.30 s held overhead; deflect gives a 1.2 s punish), chain sweep, 3.4 m noose grab, 50/50.
17. Brask: an interruptible rally at 80% posture, 2 marks, stealth can take the first. Sallow: bait mode, where deflecting his counter adds +40 posture; a grab punishes double block; 2 marks.
18. Super-armour foes stagger after 5 hits in 2.5 s and always answer with a perilous attack. A "searching" state walks to the last-seen spot. Stealth kills alert enemies within 5 m.

## Open conflicts
- Knockback: Sekiro pushes 0.4–2.2 m (Veynhold is lower); the blueprint says lower still (2.0/3.6 m/s). Blueprint wins unless Caiden says otherwise.
- The "perfect" deflect tier is Veynhold's own (Sekiro has none). Keep it.

Every change is behind CONFIG with tests updated on purpose. core.js changes re-run the 30/60/144 determinism test and record the new md5.
