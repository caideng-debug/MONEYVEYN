# Chunk H1 — deathblow depth and the body fall

All code changes are in `src/world_boss.js` (presentation only). `src/core.js` is untouched (md5 74a5299e9a45d86aaddc90e2f1831821) and the core
combat timing is unchanged: a deathblow is still the core's 1.3 s `deathblowExec` / `deathblowed` pair, every sim tick and state duration is
the core's own, and only the presentation time scale (`Cine.timeScale`) decides how fast that 1.3 s plays on the wall clock.
Plan: `/workspace/work/hplans/H1.md` (audit 11-05). Baseline trace: `/workspace/work/h1/before_m5.json`.

## 1. Phase tables and the feedback time scale

Wall seconds after E (`BD.PH`):

| phase ends at | field | Odran's final blow |
|---|---|---|
| commit (point in the seam, hit-stop starts) | 0.28 | 0.32 |
| hit-stop | 0.11 | 0.15 |
| drive (weight goes in behind the blade) | 0.55 | 0.64 |
| settle (body locks, blade twists at drive + 0.12) | 0.95 = the rip | 1.10 = the rip |
| extract (jerked off the blade, hand-off to the collapse) | 1.35 | 1.55 |
| end (core deathblow finishes, control back) | 2.2 | 2.6 |

`Fin.scale` no longer holds piecewise constant rates (`Fin.scale` used to stretch 1.3 s to ~1.77 s). It steers the sim clock
(`v.stateT + world.acc`) onto sim knots `[0,0] [commit,tImp] [commit+hs,tImp] [settle,tRip] [extract,0.5] [end,1.32]` and returns
`(target − sim)/dt` clamped to [0, 3], capped at 0.02 while the hit-stop runs. The last knot sits 0.02 past 1.3 so the final tick always lands
(without it the sim floated at stateT + acc = 1.3 − ε and never finished). Every pose track, beat and camera runs on `F.real` (wall clock),
so they are frame-rate independent and freeze in the hit-stop by holding the same key at both ends.

## 2. Beats
* Commit: riposte wind-back → thrust lands at `commit`; a foot-plant puff under the lead foot at 0.7 × commit.
* Drive: seam-specific impulse on the entry joint (`SEAM_IMP`: gut folds the hips, armpit throws the sword arm, neck snaps the head, kneel drives it down),
  `PostFX.punch` 0.02 (boss 0.035, was 0.012 / 0.025), `Cam.kickFov(−6)` (boss −5), the attacker's hand closes on the wound (lunge reach shrinks 0.08 × L)
  with new `driveStab / driveMid / driveHigh / plungeDeep` keys.
* Settle: new `impaledTense` key (body rigid, head lifts in a gasp); at drive + 0.12 the blade twists 0.4 rad with the scrape and an impulse.
* Extract: new `pullLean` key, a lateral twist toward the fall side, the exit spray at rip + 0.06, drips. `Col.add` moved from the rip to the extract end.
  `Fin.cur` lives until `end + 0.5`.

## 3. Extract direction E and the slide
`fallDir()`: E = horizontal (camera → victim) + 0.35 × (attacker → victim), normalised; at least 0.55 of it goes to the victim's side
(the lie is a side lie); the four sign variants are tried against `Region.camClear` (1.9 m) so the body never slides into a wall.
During the extract the rig slides along E with a linear velocity ramp (0.5·v0·T·u²) so it reaches v0 = 0.9 m/s (field) / 0.7 m/s (boss) at the
hand-off; `Col.post` carries it on and decays it (k 2.6, 10 once landed). Stored as `e.E`, `e.v0` for tests.

## 4. The fall
The rig falls along E as a side roll yawed onto E: `rig.rotation = (0, ψ·k, side·FALL_A·k)` (Euler XYZ, so R = Ry(ψ)·Rz(side·A)); `lieSide`
is mirrored (`lieSideM`) when the body lands on its left. Entries that are dropped reset the rig (position and rotation). Odran's fall direction is
taken from the camera at the moment he topples (after his words).

## 5. Floor pin
Blend from the stance's own foot-pin lift to the floor target over 0.35 s, then a spring at rate 16 that may sink at most 0.08 m, hard once landed
for 0.3 s. Found while doing it: the old 0.136 m pop at collapse t ≈ 0.52 was not the buckle, it was game.js dropping its stance foot-pin lift when
`deathT` went positive at sim 0.7 (the hips fell ~0.2 m in one frame and the hard pin threw them back up). The collapse now owns that from the
hand-off: `deathT` is held > 0 (no stance lift, no generic death fall) and the rig starts at the lift height, so nothing drops. For the procedural
rig the pin also uses the exact lowest vertex of every visible piece (kettle-hat brims, thigh plates; box pre-test first); a body at rest keeps
its pin instead of probing every frame.

## 6. Floating limbs
`lieSide` keys and `FALL_A` were tuned by search (coordinate descent + random restarts, jsdom procedural rig, `/workspace/work/h1/search.js`).
Numbers in the results table below.

## 7–9
* Secondary spring (ω 13, ζ 0.32) on headX, rSx/lSx, rE/lE for the first 0.6 s after the hand-off, blended back to the track.
* `COL_TR`: clutch 0.16 → buckle 0.38 → slumpFwd 0.58 → lieSide 0.95, fall from 0.5 (Df 0.38). Boss: clutch 0.3 → buckle 0.7 → kneelDown 1.15.
* Splash stains 9 → 15 s (the last pool under a body stays).
* The finisher / collapse tracks now also drive `headX` and the torso `side` bend (`KEYSH`); `POSES.ready` has neither, so the authored head
  angles in the G1 keys were never applied before. The cutscene sampling is unchanged.

## 10. Cameras
* Field (every tier, Low included — a few vector ops): commit = 3/4 side cut blends in over 0.16 s; drive = punch in (3.4 → 2.85 m) over 0.1 s with
  the FOV kick; settle = slow creep toward the wound; extract → collapse = pulls back and down after the body (it follows the slide offset);
  released over end − 0.05 … end + 0.45. Letterbox held to `end`. Skipped while `A.Scenes.active`.
* Odran (`BD.finCam`, boss table): wide push-in over the step-in; a low profile at the impact (scaled by his look scale) creeping in through the
  settle; a low wide at the rip holding the slump. Finale stays 3.3 s (boss test). `Finale.weight` is 0 while a dialogue scene runs.
