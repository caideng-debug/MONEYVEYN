# Chunk DB6: deathblow motion ("stuck to the character")

User report: the deathblow felt "stuck to the character", and it has to be animated all the way through.
Spec: `docs/research/deathblow_reference_timings.md`. `src/core.js` is untouched (md5 `8b20b83611f0ffb143934b32e055d5dd`).

## Root cause (pre-DB6)
- **Visual warp.** `Fin.post` dragged Wren's displayed root up to 0.38 m onto the victim (a presentation offset, not sim). The body you saw was not where the sim, the camera or collision thought it was.
- **Glue every frame.** The pair was snapped to a fixed spacing of 0.84–0.87 m each frame from Commit to Unlock. Both bodies moved as one rigid unit, which is the "stuck to him" feel.
- **Wren's root froze for 1.48 s.** From Commit to Unlock her sim root never moved on its own. The step-in was a warp, and there was no plant and no step back.
- **She glided back with no footwork.** At the unlock the warp released, and her root slid back to the sim position while her legs stayed in stance.
- **Input was dead until 1.48 s.** The stick did nothing until the core unlock, so even after Blade-clear the player was a passenger.
- **The camera held.** The finisher camera stayed on until after the unlock, then blended out. Control came back under a camera that wasn't following the player yet.

## What changed (src/deathblow6.js, plus small hooks in world_boss.js / build.py)
- **Clips.** The 12 keyframe deathblow clips (`assets_incoming/deathblow_clips`) drive both fighters at full frame rate. The core clock is remapped piecewise onto each clip's knots, so Impact lands on core 0.32. Blend-in runs from a snapshot of the displayed pose. The snapshot follows the live pose until the clock starts, with a shortest-arc sign check every frame. A 35°/frame per-joint rate limiter runs outside the authored Drive→Impact snap. Secondary motion keeps every joint moving through the hit-stop and Settle (breath, Settle tremble, sword-arm strain). The hips height uses cubic (Catmull-Rom) sampling, because linear keys read as hip pops.
- **No glue.** The pair is aligned once in Commit, then Wren follows the clip's root track as sim movement after each core step:
  - Bosses and stealth victims stay put.
  - Other victims are drawn onto the clip's start spacing.
  - Wren's root step is capped per sim tick, with carry-over. The cap is on pair closing (her step plus the core's glide on the victim), 0.135 m/tick before Impact and 0.145 after. This fixes the 0.15–0.165 m/frame step-in from a 2.4 m start.
  - On Extract she gets a push-back along the away vector, and final victims get a launch top-up to 1.9 m/s. Every final variant now ends ≥ 2.0 m apart by the unlock (Turning Cut was 0.72, Shoulder Drive 1.94).
- **Input.** From Blade-clear (core 1.15) the stick walks Wren out of the clip with a 0.15 s fade, still invulnerable. Her velocity and facing carry into the core unlock. Lock-on leaves the corpse at Blade-clear.
- **Camera (world_boss.js).** The finisher camera is a cut on E (the 0.18 s eased swing whipped ~4 m), handed back to the gameplay camera from `min(extract − 0.15, unlock − 0.4)` to the unlock instead of holding past it. For DB6, the aim follows the vital point through a soft low-pass, so the clip's Impact snap doesn't jolt the look.
- **Collapse hand-off (world_boss.js).**
  - For DB6 bodies, `Col` adds no second rig slide on top of the sim launch.
  - It doesn't measure a "stance lift" either: the clip sets the hips absolutely, so the measurement was a frame of clip motion and popped the hips 0.014 m.
  - The clip lays the body down in joint space, so the rig stays level.
- **Kingsfall.** The 178° (later 123°) shoulder flip in the blend-in came from a second slerp from the live v8 pose. That slerp is gone; the blend-in now runs only from the snapshot.
- **Audio.** The sampled deathblow variants replace the procedural one-shots.

## Tests (this commit)
- `db6_motion` 47/47.
- `ct` 99/99.
- `smoke`: OK, no errors, self-tests 99/99.
- `deathblow_seq` 37/39. Retarget: "body fell over" now reads the torso's tilt as well as the rig rotation, because DB6 lays the body down with the clip and keeps the rig level by design.
- **Still failing in deathblow_seq:** "hips settle on the floor" (pelvis 0.115 m above the floor) and "no propped limbs" (rArm 0.135 m). The clip's final lying pose arches on our rig proportions, with the head and legs touching and the pelvis up. This is a real (small) visual issue, not a test assumption. A fix needs a ground-aware settle of the legs/pelvis at the end of the corpse clip, or a hand-off to Col's `lieSide` pose. Not attempted here (time box).

## Core proposal (for the core owner; not done here, core.js frozen)
- **Movement natively from 1.15.** Let the core open locomotion at Blade-clear (still invulnerable, `deathblowExec` i-frames until the unlock) instead of DB6 moving Wren from the world layer and handing velocity over at the unlock tick.
- **Attacker root motion and launch 1.7–1.9 in core.** Move the attacker's step-in / plant / push-back root motion and a 1.7–1.9 m/s victim launch into the core schedule (today DB6 tops the core launch up from the world layer). Then separation ≥ 2 m is a core guarantee rather than a presentation patch.
- **Posture CONFIG keys out of the comment.** The posture tunables that currently sit commented-out in core.js should become real `CONFIG` keys, so chunks can tune them without editing core.js.

## Notes
- COMMON.md lists core md5 `74a5299e…`. The assignment and this branch's HEAD both carry `8b20b836…`, which is unchanged here.
- `assets_incoming/` is gitignored. The build reads the clips and audio from there.
