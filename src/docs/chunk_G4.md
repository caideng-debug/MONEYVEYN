# Chunk G4: dash and camera feel

Brief: "fix the dash and camera a bit." I measured both first, then made targeted fixes. `src/core.js` is untouched (md5 `74a5299e9a45d86aaddc90e2f1831821`). The dash changes sit in `src/game.js` as a wrapper around the core's `World.prototype.stepFighter` and the intent read. The camera changes sit in `Cam.update` (game.js) and in a new spring-arm cast in `src/world.js` (`Region.camArm`, exposed as `Game.camArm`). I did not touch `world_boss.js`, Ilsabet, the props/items/corpse code, or `CONFIG` values.

## How I measured
- **Analysis probe**: jsdom page (`p1h.js`) at a deterministic 60 fps. Real key events go through the game's own `Input` listeners. The save has every foe defeated except `g1`, which is frozen in place as a lock-on dummy. It records every 1/60 s sim step and every rendered frame. It ran on master (`git stash`) for the "before" column and on this branch for "after". (Scratch file outside the repo.)
- **`.test/dash_cam.js`** (new): headless Chromium with real `page.keyboard` input. After boot, the page's `requestAnimationFrame` switches to a manual 60 fps clock (`window.__tick`), so every key press lands on a known frame. Rendering, Input, the sim and the camera all run as in play. Hooks only place the player, freeze the dummy, and steer the camera yaw toward the next waypoint at up to 3 rad/s (a stand-in for the mouse, because headless pointer lock is unavailable). It writes `.test/dash_cam_result.json` and the shots `shots/G4_gaol_corridor.png` and `shots/G4_lock.png`.

## Dash (C): before vs after

| measure | before (master) | after (G4) | Sekiro target |
|---|---|---|---|
| distance | **3.53 m** (Euler overshoot of the configured 3.3) | **3.30 m** exact | 3–4 m |
| motion time (98 % of the distance) | ~0.33 s, then a 0.03 s crawl to the 0.367 s state end | **0.317 s**; the state is still 0.367 s | 0.30–0.35 s |
| first-frame step / peak speed | **0.46 m / 27.5 m/s** (ease-out cubic, 3× average) | 0.31 m / 18.4 m/s (ease-out quad, 2× average) | explosive but not a snap |
| curve | cubic ease-out via forward Euler | exact per-step ease-out, `s(u)=1-(1-u)^2` over 0.35 s | ease-out |
| i-frames | 0.033–0.250 s | unchanged | |
| direction | camera-relative WASD; no input = backstep (verified: D at yaw 0.7 → heading −0.87, error 0.000) | unchanged | input relative to camera, backstep |
| cooldown | 0.12 s after the state ends | unchanged | short recovery |
| 2nd C pressed 0.10 s into a dash | **eaten** (the core's 0.26 s buffer expired just before the chain point) | chains at 0.383 s | |
| 2nd C pressed 0.20–0.34 s in | chains at 0.383 s | chains at 0.383 s | |
| 2nd C pressed during the 0.12 s cooldown (0.40 / 0.45 s) | **eaten** (the core drops a dash pressed during cooldown) | fires at 0.517 s, when the cooldown ends | |
| C pressed 0.10 s into a light attack (startup) | **eaten** | fires at 0.367 s (first legal recovery frame) | |
| dash → J at 0.15 s | dash cut (`p_dash`) at 0.283 s | unchanged | cancel into attack |
| dash → Space at 0.15 s | jump at 0.283 s | unchanged | |
| dash into walls (yard N wall head-on / 45°, SW corner, cell bars, corridor wall, ossuary wall) | never inside a collider; 45° slides 3.18 m | never inside (deepest overlap 0.000 m); 45° slides 3.05 m | wall slide |
| dash up the Headsman's Stair | 3.53 m | 3.30 m, camera vertical speed max 3.2 m/s | |

**Fixes**
1. **Dash curve** (`DASH` and the `World.prototype.stepFighter` wrapper in game.js): after the core steps a fighter in `dodge`, the step's displacement is replaced with the exact ease-out increment over `[t, t+dt]` along the core's own `dodgeDx/Dz`. State length, i-frames, the cancel points and the cooldown all stay with the core. The world wall pass still runs after every step, so walls stop or slide the dash as before. This applies to every fighter, including enemy dodges.
2. **Buffered C** (`gatherIntent`): a C press is held for up to `DASH.buffer` = 0.45 s and offered to the core every frame until a dash starts (`p.dodgeStart` changes). Any other action pressed afterwards (light, heavy, charged, jump, guard, deathblow) cancels it, so a later choice always wins.
3. The dash FOV kick drops from 2.2 to 1.2 (it read as a lurch together with the camera lag).

## Camera (world mode): before vs after

| measure | before | after |
|---|---|---|
| camera peak acceleration during a dash (fwd / back / right) | 140 / 197 / 169 m/s² | **91 / 122 / 97 m/s²** (walking is ~22) |
| camera lag behind the player during a dash | 1.5–1.6 m | 1.5–1.6 m (same lag, reached and recovered without the jolt) |
| gaol corridor A → cells, scripted walk (599 frames) | lens inside a wall in **7** frames, min clearance **−0.38 m** | **0** frames, min clearance 0.35 m |
| gaol corridor A with a fast swaying view (7.7 rad/s mouse) | inside in **67 / 270** frames, min −0.44 m, 5 arm pops > 0.6 m | **0** frames, min 0.30 m, 2 pops |
| ossuary hall | inside in 10 frames, min −0.39 m | **0**, min 0.30 m |
| ossuary entry passage, swaying | inside in **49 / 141** frames, min −0.45 m | **0**, min 0.30 m |
| lock-on strafe + dash in the gaol corridor | target |NDC| ≤ 0.26 / 0.37, 0 off-screen | ≤ 0.36 / 0.13, 0 off-screen |
| lock-on with a wall / doorway at your back (arm crushed) | lens inside the wall | arm clamps and the view aims at the foe: 0 off-screen frames. A first attempt (orbit the duel line sideways) left the foe off-screen in 32–119 frames and was removed. |
| lock-on yaw rate when you dash right past the foe | **6.85 rad/s** (whip) | 5.9 rad/s; 4.2 rad/s cap near the view axis |
| stairs, walking up the Headsman's Stair | camera vertical speed max 2.38 m/s, accel 9.3 m/s² | unchanged (already damped twice: ground 0.12 s, then the pivot) |
| light / heavy attack camera acceleration | 23 / 23 m/s² | 22 / 22 m/s² (no jolt; not changed) |

What I found:
- The old collision test cast from the *unsmoothed* look point, without the 0.85 m shoulder offset that is added afterwards, in 0.25 m steps down to a 1.4 m floor. The shoulder alone put the lens inside corridor walls.
- The follow is a single critically damped spring (0.09 s). The dash's 27.5 m/s first frame turned into the camera jolt.
- Lock-on yaw was uncapped (smoothDamp 0.2 s), so dashing past the foe whipped the view.
- Settings already had mouse sensitivity (10–70) and Invert camera Y, but Invert Y only flipped the mouse.
- The pitch clamp is −0.25…1.05 rad and FOV 60° (vertical). Both are sensible, so I left them alone.
- There was no recentre.

**Fixes**
1. **Spring arm** (`Region.camArm` in world.js): an analytic ray-vs-capsule / ray-vs-circle cast from the *smoothed* pivot along the true arm, shoulder included. It uses the same collider filter as before (`on`, `cam`, `h >= 1.8`), allocates nothing, and does one spatial-hash query per cast. Cam.update casts twice: a hard probe (0.30 m radius) clamps the arm instantly, so the lens never enters a wall, and a soft probe (0.65 m) eases the arm in early (0.07 s) and back out slowly (0.4 s). A third, predictive probe runs only while the view swings faster than 0.8 rad/s.
2. **Two-stage follow**: x/z go through a 0.05 s pre-filter, then a 0.07 s spring. Total lag is about the same, but the acceleration from the dash's first frames is spread out (peak camera acceleration down about 35–40 %). The follow-time debug slider and the hit-stop hold still scale both stages.
3. **Tight spaces**: a crushed arm lifts the camera up to ~0.5 m (40 % of that while locked) and moves the look point forward, so the view keeps its pitch instead of staring down at Wren's back.
4. **Lock-on**: the yaw rate is capped at 4.2 rad/s near the view axis, rising to 8.4 rad/s when the foe is far off-axis. That stops the whip without losing the target. When the arm is crushed, the look point blends toward the foe's chest (by how crushed it is), which keeps the foe framed with a wall at your back.
5. **Recentre**: Q with nothing to lock swings the view behind Wren (0.12 s) and resets the pitch. Mouse, arrow keys or the stick cancel it.
6. **Invert camera Y** now covers the gamepad's right stick too (world.js `preIntent`).
- Arena trials keep their old camera path. `Game.camArm` is null outside world mode, so only world mode gets 1–4.

## Tests

`.test/dash_cam.js`, real Chromium, Low, 960×540:
1. Dash is 3–4 m, motion 0.28–0.35 s, state ≤ 0.37 s, and the heading matches camera-relative input or the backstep: **3.30 m, 0.317 s, 0.367 s, error 0.000** (forward, backstep, right at yaw 0.7).
2. C is buffered mid-dash, in cooldown and in attack startup, and the dash cancels into the dash cut.
3. Dashing into 6 walls and corners never ends a sim step inside a collider.
4. Over scripted walks through gaol corridor A → cells, corridor A with a swaying view, the ossuary passage and the ossuary hall, the camera is never inside a collider.
5. Lock-on keeps the target on screen while strafing and dashing with a wall or doorway at your back, and while closing in along the corridor.
6. No page errors.

Result (this branch, real Chromium, Low): **6/6 PASS**
- 1: forward / backstep / right are each 3.30 m; motion 0.317 s; state 0.367 s; heading error 0.000; i-frames 0.033–0.250 s; camera peak acceleration 93 / 122 / 102 m/s².
- 2: second C at +0.100 s gives 2 dashes; second C at +0.433 s (cooldown) gives 2; C 0.1 s into a light attack dashes at +0.350 s; J during the dash gives the dash cut at +0.267 s.
- 3: deepest overlap 0.000 m at every wall (head-on wall 2.01 m, 45° slide 5.61 m over two dashes, corner 2.88 m, bars 1.38 m, corridor 1.76 m, ossuary 1.01 m).
- 4: frames with the camera inside a collider: 0 on every walk. Minimum lens clearance 1.10 / 1.69 / 0.61 / 1.07 m; 0 arm pops.
- 5: target |NDC| at most x 0.13, y 0.21 while strafing and dashing (200 frames), and x 0.02, y 0.08 while closing in (80 frames); 0 off-screen frames; yaw rate at most 3.3 / 4.3 rad/s.
- 6: no page errors.

Regression runs on this branch, all passing: `ct` 72/72; `v8` 40/40 (combat timing, clip strike frames, 30/60/144 fps identical); `v6` 29/29; `input` 45 PASS, 0 FAIL; `p1` 97/97; `merge` 14/14; `smoke`: no errors, no crash. In-page core self-tests are 72/72 with the dash wrapper installed.

## Notes / judgment calls
- I kept the dash's i-frames and state timings exactly, so the v8 timing tests and Counterstep/grab/Crimson Arc rules are unchanged. Only the shape of the motion inside the dash changed.
- The extra dash buffer is game-side, so it also applies in the arena trials and on the gamepad (B → KeyC).
- Arm pops of more than 0.6 m in one frame still happen (2 per test) when the view is swung very fast (7.7 rad/s) past a wall end. That is the price of never clipping. At normal swing speeds the soft and predictive probes ease the arm in, and the Chromium walks measured 0 pops.
- `.test/` path rewrites for this worktree were reverted before commit; only `dash_cam.js` is new there.
