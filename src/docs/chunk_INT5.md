# INT5 — integration branch `integrate5` (worktree /workspace/vh_wt/INT5, from master 35b4f5e)

Merges the finished-but-unmerged chunks I1, H1, I2, I3, I4, H3, rewires H1's deathblow presentation onto the I1 core, and applies
Tier A item 1 of docs/research/sekiro_plan.md (no sim slow-mo during deathblows; slow-mo is presentation only).
Build: `python3 build.py && cp dist/index.html dist/Veynhold.html` → `/workspace/vh_wt/INT5/dist/Veynhold.html`.
`src/core.js` = the approved chunk I1 core, md5 `8b20b83611f0ffb143934b32e055d5dd` (unchanged by INT5).

## 1. THE TIME MODEL (read this first)

There are three clocks. Everything about deathblow timing hangs off them.

| clock | what it is | who advances it | pauses |
|---|---|---|---|
| **sim time** (`world.time`, `world.tick`) | the fixed 60 Hz core tick | `world.advance(dt * Cine.timeScale(dt))` in `Game.frame` | never slowed while a deathblow record exists (see below) |
| **deathblow clock** (`world.deathblow.t`, mirrored to `stateT` of both fighters) | seconds since `startDeathblow`; the blueprint §7.1 schedule is on this clock | core `stepDeathblow` (+dt per tick) | while the attacker or victim is frozen (core hit-stop) |
| **presentation time** (`dt * PresSlow.k`) | the dt handed to particles / ambient / camera easing / non-participant characters | `Game.frame` | never; `k` is 1 except after the impact |

Rules:
1. **The core schedule runs on unscaled time.** `Cine.timeScale()` returns 1 (and cancels any pending `Cine.slow`) whenever
   `world.deathblow` is non-null. `Cine.slow(1.0, 0.32)` on normal deathblows and `Cine.slow(1.8, 0.22)` in `Finale.start` are gone.
   H1's feedback sim time scale (`Fin.scale` steering the sim onto knots) is gone; `Fin.scale` only advances `F.wall`
   (and still returns 0 for `BD.hold` screenshot freezes).
2. **One hit-stop:** the core freezes both fighters `deathblow.impactHitStop` = 6 ticks (×`parry.hitStopScale`) = **0.10 s** at the impact
   bookmark. The deathblow clock stands still during it. H1's own presentation hit-stop (`F.hs = ph.hs`, 0.10/0.15 s) is removed;
   `F.hs` now only mirrors the core freeze still to run (read-only, for tests/beats).
3. **Wall times that follow (normal):** commit 0, drive 0.28, **impact 0.32 s wall** (measured 0.317 in deathblow_seq), hit-stop
   0.32–0.42, settle 0.65, extract 1.05, blade-clear 1.25, **unlock 1.50 s wall** (= 1.40 deathblow clock + 0.10), presentation end 2.25 s
   wall (letterbox, field camera blend-out over `camOut` 0.55 after unlock). Boss final: clock settle 0.80, extract 1.45, clear 1.65,
   unlock 1.90 (= 2.00 wall); world-mode Finale/letterbox 2.75 s wall. (Before INT5 the impact landed at ~0.85 s wall.)
4. **Presentation phase clock `F.real`** (world_boss.js `Fin.clock`): while the core record for this victim exists,
   `F.real = max(F.real, R.t + acc)` where `acc` = the sub-tick accumulator (`min(world.acc, dt)`), added only when neither fighter is
   frozen and the start tick has passed (smooth poses at 144 fps, monotonic). After the unlock `F.real` runs on in wall time
   (`F.wall` deltas). All finisher pose tracks, beats and finisher cameras sample `F.real`, so they are the core clock.
5. **Bookmarks:** Fin listens to the core events (`deathblowPhase` impact/settle/extract, `deathblowClear` with `vel`, `deathblowUnlock`)
   in the `Game.handleEvents` hook and stores them in `F.ev`. Impact FX fire on `F.ev.impact || F.real >= ph.impact`; the rip on
   `extract`; the collapse hand-off on `clear`. `F.ph` is built from the core record's `sched` (`phaseTable(T, R)`), the PH_FIELD/PH_BOSS
   tables are only a fallback. `ph.unlock` is on the deathblow clock; `ph.unlockW = unlock + hs`; `ph.end = endW - hs`.
6. **Body motion:** the core moves the victim itself along the deterministic launch dir (speed ramps 0 → 0.9–1.3 m/s across
   Extract→Blade-clear; final victims keep it until unlock, then core dead-decay ×0.9/tick). So Fin no longer slides the rig during the
   extract (`F.slide` = 0; only the small lift `vy` = core `launchUp` 0.18 m/s ramps in). `E` = the core launch dir (`coreE`, side =
   which side of the victim it leaves on). `Col.post` only adds what the core's motion along E lacks (`max(0, e.v - v_core)`), and its
   slide starts decaying only after the core lock ends, so the body neither hangs nor doubles speed.
7. **Presentation slow-mo (`PresSlow`, game.js, exported as `VEYN_GAME.PresSlow`):** stateless, recomputed each frame from the core
   record: `k = 1` before the impact; the hit-stop is a hard freeze (clock still → k still 1); then k eases to `VISUAL.dbSlow` (default
   **0.40**, the 35–45 % band) over 0.06 s of deathblow clock, holds through Settle, and eases back to 1 across Extract → Blade-clear.
   `pdt = dt * k` drives: `FX.update`, `VFX.update` (splashes/streaks/stains), embers, `Atmos`/`FogBank`, `Cam.update` (gameplay camera
   easing; also the dt of `Col.post` for older corpses) and `Character.update` of every character **not** in the deathblow. The two
   participants, finisher poses/beats/cameras (core clock), HUD, letterbox, Post pulses and audio run at 1×. `VISUAL.dbSlow = 1` turns it off.
   `VISUAL.slowmo` still drives the sim slow-mo of mikiri / posture-break / death cinematics (outside deathblows).
8. Arena mode (non-world) uses the same core clock via `stateT`; Juice's delayed payoff (`w.time + 0.45`) is now 0.45 s wall.

Next agent: never re-introduce a sim time scale during a deathblow; put feel into presentation (PresSlow, camera, audio). If you add a
presentation system that should slow with the hold, give it `pdt`; if it belongs to the two participants, give it the core clock.

## 2. Merge log
| step | commit | notes |
|---|---|---|
| chunk worktrees | I1 69ca8e8, H1 3a12afa, H3 8e79a7c, I2 a33fb62, I4 59fe9c7 | committed each worktree's worthwhile uncommitted work (path-sed test edits reverted by inverse sed; `.test/h1probe.js`, result JSONs left untracked). I3 had only path-sed edits. |
| I1 | 187bc3a | clean |
| H1 | 632df8f | clean; then rewire 78397cd + fixes a7f4af1 |
| I2 | a5cd10c | clean (auto-merged game.js) |
| I3 | 9910260 | clean |
| I4 | e43e746 | build.py conflict: I4 surfaces + audio, then I3 ui_access last |
| H3 | c51442d | game.js conflict: kept H2/I2 blade scratch vectors + H3 look-at scratch |
| fixes | b7f3b2a, (this commit) | CONFIG shim, test retargets, I3 debug overlay → I4 `A.Surf` |

## 3. Fixes made during integration
* **I1 core bug (shimmed, not fixed in core):** the I1 core.js puts `enemyPostureFromBlockedHit: 0.25, enemyPostureFromDeflectedHit: 0.15`
  inside the comment on the `deathblowTime` line, so `CONFIG.combat` lost both keys → an enemy blocking a player hit got NaN posture
  (NaN hips/cloth, `computeBoundingSphere NaN` errors in v8, foe could never be posture-broken from blocks). core.js may not change here,
  so game.js restores the master values if undefined. **The next approved core revision must move the keys out of the comment and drop the shim.**
* H1 world `Finale.start` override no longer resets the arena Finale.dur to 2.7 (keeps I1's 2.7 / 3.2 boss-final glue).
* deathblow_seq: `lieSide` re-searched (coordinate descent on the test rig) → pelvis on the floor, no propped limbs; collapse
  `buckle` 0.38→0.46 s, `slumpFwd` 0.58→0.64 s (the clutch→buckle hip drop landed right on the earlier unlock and read as a 0.016 m pop).
  Camera steadiness passes after the rewire (no doubled hit-stop / sim steering).
* Field finisher camera follows the core root motion of the body (+ Col offset).
* I3 debug overlay reads the surface from I4's `A.Surf.at`.

## 4. Tests (see §5 for numbers)
## 5. Results
Test runs on the INT5 build (worktree paths sed-ed for the run, reverted before commit):

| test | result |
|---|---|
| ct (core self-tests) | 99/99 |
| v8 | 40/40 |
| p1 | 97/97 |
| smoke | no errors, self-tests 99/99 |
| deathblow_seq | 39/39 (impact 0.317 s wall, unlock 1.50 s wall) |
| boss | 50/50 |
| ui_I3 | 77/77 |
| audio_I4 | 55/55 (after the world_boss key/corpse sync + legacy→blueprint retarget) |
| audio_H2 | runs clean, 0 page errors |
| determinism | 8/8 |
| I1 self | 99/99 |
| mechanics_H4 | 62/62 |
| blade_H2 | 82/86 — 4 fails on the block rig (clip fast-in first frame 9.5° vs <35 % rule; 20 fps peak lag 0°): the H2 residual on the procedural block rig under the I2 blade path; not a deathblow regression, left for the H2/I2 owner |

Perf (headless SwiftShader, Low, 300 frames, `Game.frame` JS ms/frame, alternating runs): master 4.13 / 4.24 / 3.91, INT5 4.70 / 4.70 / 4.27
→ INT5 was ~0.4 ms/frame slower on Low. Unwrapping the I3 frame/HUD/Cam/handleEvents wrappers alone brought it to 3.82. Fixed in the
follow-up commit (see §7).

## 6. Known issues / for the director
* Tier A items 2–6 (pair ease-in to 1.05 m, two-beat blood + drop white-gold ring, world-audio muffle, camera push 4→1.5 m, deathblow
  window 2.2→2.5 s) are NOT done; only item 1 (time model) is. Item 6 needs a core change.
* The core launch dir has no wall check (H1's `fallDir` did camClear); a body next to a wall can slide into it. Presentation may nudge the
  corpse only (blueprint §7.3) — not done.
* Non-participant characters animate at `pdt` but their sim positions move at 1×; a foe walking during the 0.6 s hold can foot-slide slightly.
* `lieSide` was tuned on the procedural rig in jsdom only; check it on the skinned Quaternius gaoler in a browser screenshot pass.
* docs/chunk_H1.md still describes H1's old wall-clock/feedback model; §1 above supersedes it. No chunk docs exist for I1, I2, I3, H3.
* docs/blueprint_v3.md and docs/research/ are untracked in master; INT5 has an untracked copy of blueprint_v3.md only.

## 7. Low-tier perf fix (follow-up commit)
Sectioned timing (inst.js wrappers, Low, 300 frames) showed the gap was `Character.update` (0.67 → 0.98 ms/frame for 2 fighters) plus small I3 wrapper costs, not the deathblow.
* `game.js` H3 `lookTarget`: no per-frame closure; the look target is searched every 3rd frame (every 6th on Low) — the spring smooths it.
* `game.js` I2 clip fast-in: the displayed-pose snapshot (15 × `toArray`) is only written while a clip attack is on screen (`wA > 0.02`), the only time it can be used.
* `ui_access.js`: cached `#dbHint/#dbDot`, style written only on change, the HUD wrapper skips `deathblowCandidate` while the base HUD already hides the prompt, reused event snapshot (no `events.slice()` per frame), `vhLow` class toggled only on quality change.
Result (same harness, alternating, `Game.frame` JS ms): master 3.93 / INT5 3.89; sections char 0.715 vs 0.698. ct 99/99, v8 40/40, smoke clean.
