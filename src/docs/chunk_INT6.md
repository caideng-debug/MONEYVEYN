# INT6: integrate chunkWORLD + chunkDB6, corpse settle, full suite, perf

Branch `integrate6` (worktree `/workspace/vh_wt/INT6`). It is cut from `integrate5` 7faf326 and merges `chunkWORLD` 0e92288 and `chunkDB6` bf0c3fb.
`src/core.js` is untouched: md5 `8b20b83611f0ffb143934b32e055d5dd`. That is the approved I1 core. COMMON.md still lists `74a5299e…`, which is stale. I noted it and did not act on it.

## 1. Merge
- Both merges were clean, with no conflicts.
  - WORLD's `src/world_boss.js` change is prop data only: the wall notice moves z 29.62→29.15, and the carving moves x −3.93→−3.5.
  - DB6's change is deathblow code (Fin/Col hooks, camera, sfx ownership).
  - The two touch different hunks.
- `assets_incoming/` is gitignored, and build.py reads the DB6 clips and audio from it. I copied it from `/workspace/vh_wt/DB6/assets_incoming`.
- `dist/Veynhold_{v6,v7,v8_combat,pre_repair}.html` are gitignored too, but v8.js needs them. I copied them from INT5.

## 2. Corpse settle (src/deathblow6.js)
**Problem.** The end-of-clip lying pose arches on our rig. The pelvis sat 0.115 m up, the head and feet were down, and the right arm was propped 0.135 m. This failed deathblow_seq's "hips settle" and "no propped limbs" checks.

**Fix.** A floor-aware solve, run once per corpse when the clip reaches `dur − 0.3 s`. It starts from the clip's final frame, with the rig level and the final yaw:
1. **Pelvis.** The pelvis is lowered onto the floor that the head and feet already touch. On each pass the torso swings about its pivot so the head stays where it lay, and each thigh swings so its foot stays. It takes up to 4 passes, because the torso's lowest point can sit toward the chest.
2. **Limbs.** Each arm and leg is swung about its root, with a bisection on the swing, until its lowest point sits 0.005–0.045 m above the rest of the body. Propped limbs come down; a limb the pelvis pass pushed under the floor comes back up. Swings are capped at 0.6 rad (torso/thighs) and 0.3 rad (limbs).
3. **Measurement.** It uses the same rule as `Col.ground`. The procedural rig is measured on its real mesh vertices; the skinned body uses the joint proxies.

**Blending.**
- The solved pose blends in with smootherstep over the clip's last 0.3 s. It runs in both the live session (`applyClip`, victim only, before the secondary micro-motion) and the corpse player.
- After the clip ends, the corpse player copies the solved rest pose directly. That is cheaper than before, since there is no per-frame clip sampling for old corpses.
- A final pose that is not lying (torso tilt ≤ 1.0 rad, e.g. a kneeling end) is left alone.
- `VEYN_GAME.DB6_NOSETTLE = 1` switches the settle off, for A/B checks.

**Continuity.**
- The largest per-frame joint world rotation over the collapse is 10.5°, against 9.8° without the settle. Both peak before the settle window, and both are far under the 40° limit.
- db6_motion is 47/47, and deathblow_seq's hips-pop checks pass.

**Real browser (skinned Quaternius gaoler, Medium).** Joint heights above the floor, settle off → on:

| joint | off | on |
|---|---|---|
| hips | 0.238 | 0.169 |
| knees | 0.11/0.12 | 0.06/0.075 |
| feet | 0.08/0.10 | 0.05/0.07 |

Shots: `shots/int6/corpse_settle_{on,off}_medium.png`. shots/ is gitignored; copies are in `/workspace/work/int6/shots/`.

## 3. Test suite (final build)
| test | result | note |
|---|---|---|
| ct | 99/99 | |
| v8 | 40/40 | needs the gitignored dist/Veynhold_v7.html etc. |
| p1 | 97/97 | |
| smoke | OK, no errors, self-tests 99/99 | |
| deathblow_seq | **39/39** | was 37/39 (settle fixed both) |
| db6_motion | 47/47 | |
| boss | **50/50** | was 47/50 after the merge; see the retargets below |
| ui_I3 | 77/77 | |
| audio_I4 | 55/55 | |
| i1_self | 99/99 | |
| determinism | 8/8 | |
| mechanics_H4 | 62/62 | |
| audio_H2 | runs clean, 0 page errors | |
| blade_H2 | 82/86 | 4 known block-rig fails (pre-existing, H2/I2 owner) |

**boss retargets.** These are DB6 design changes, not regressions. After the merge, the 3 boss fails were not the "known" set (finisher hit-stop, Key at body, Kneel prompt), which all pass. They were:
- **"field foe falls on its side" and "after his last words the headsman falls and stays down".** Both read only the rig's rotation. DB6 lays the body down in joint space and keeps the rig level by design. They now also read the torso's tilt from vertical, the same retarget DB6 made in deathblow_seq. Field foe 1.43 rad, Odran 1.21 rad (> 1.2).
- **"boss finisher: impale and rip-out fired".** This required `BF.L > 0.5`. L is the blade reach measured by the old step-in solver, and DB6 does not run that solver, so L stays 0. The check now accepts `BF.db6`. imp and rip still fire.

**Note for the director.** Odran's `crown_splitter` clip ends with him lying on his side (hips 0.27 m above the floor, torso tilted 69°). He lies through his dying words instead of kneeling and then toppling 0.4 s after them: Col's scripted boss fall is skipped for DB6 bodies. "He slumps to his knees" still passes, but only because it reads the rig's x rotation. If the kneel→topple beat matters, the boss clip should end kneeling, and Col should take over the fall after the words.

## 4. Perf
**Setup.** perf_db field scenario: m5 first deathblow (db1, first use), then a second gaoler (db2). CPU ×4, `--fill 0.05` (CPU-side), 1280×720, headless SwiftShader. The machine's load average was 2–3.5 for most runs (other worktrees), so differences under ~10 % are noise. Times are ms at 4× throttle.

"Normal" means the base and post phases (no finisher on screen). Run 1 / run 2 (/ run 3):

| | Low normal p50 | Low normal p95 | Low first-deathblow worst frame | Medium normal p50 | Medium normal p95 | Medium first-deathblow worst | draw calls (Med) |
|---|---|---|---|---|---|---|---|
| master 35b4f5e | 29.2 / 31.9 | 38.6 / 44.2 | 174 / 186 | 69.1 / 64.4 / 65.8 | 115 / 122 / 97 | 1828 / 1546 / 1653 | 351 |
| INT5 7faf326 | 36.3 | 60.4 | 342 | 64.9 | 113 | 1482 | 357 |
| INT6 | 31.8 / 32.1 | 98.8 / 53.1 | 562 / 113 | 70.1 / 74.6 / 67.5 | 115 / 111 / 112 | 1313 / 1312 / 1164 | 361 |

- **First-deathblow worst frame.** INT6 is better than master on Medium (≈1.2–1.3 s against 1.5–1.8 s; DB6's region prewarm). On Low, run 2 is better (113 against 174–186 ms). INT6 r1 Low had a 562 ms frame in `broken`, at load 3.06; I could not reproduce it in r2.
- **Normal play.**
  - Medium mean frame (base+post) is 77.9 ms for INT6 (3 runs), 75.9 for master (3 runs) and 77.5 for INT5. That is within noise, and INT6 ≈ INT5.
  - Low mean is 37.1 for INT6 against 31.1 for master and 38.2 for INT5.
  - Per section, the only consistent difference against master is `chars.update`: +1.3 ms at 4× on Low, about +0.3 ms real. INT5 shows the same, so it comes from the INT5 layer, not from WORLD/DB6/INT6.
- **world_audit perf (fixed camera, rAF-paced).** On Low, every station has the same median for master and INT6 (33.3 ms; pit 50). Draw calls are within ±3.
  - Triangles are +4–8 k per station. The WORLD chunk's `base` measurement of INT5 shows the same numbers, so that difference predates WORLD/DB6.
  - The Medium world_audit run is not usable on SwiftShader (n = 0 at several stations, for master and INT6 alike).
- **Settle cost.** One solve per corpse (a few dozen pose evaluations, once). Per frame it is 15 slerps during the last 0.3 s of the clip, then a plain copy, which is cheaper than the old per-frame clip sample.

### 4a. jsdom arena bench
This is `Game.frame` JS-only ms per frame: Low, duel arena, 1500 frames × 3 reps, 3 alternating rounds, same `bench.js` as INT5.
- **Means.** master 0.408, INT5 0.437, INT6 0.460.
- **Last (warmest) rep.** master 0.317, INT5 0.333, INT6 0.380.
- **Reading it.** INT6 is about +0.02–0.05 ms/frame over INT5 here. That is under 0.3 % of a 16.7 ms frame and inside the rep-to-rep spread (0.30–0.56). When idle, the DB6 hooks are early-outs (the `DB6.cur` null checks), and the arena runs no DB6 session. I did not chase it further.

## 5. Remaining issues
- **Low normal play vs master.** About +0.3 ms/frame real in `chars.update`. It predates INT6 (INT5 shows the same) and was not addressed here.
- **Odran's dying beat.** He lies rather than kneels (see §3).
- **blade_H2.** The 4 block-rig fails are unchanged.
- **Tracked files I left alone.** `docs/vh_fixplan.md` was already tracked in integrate5; this branch did not modify it. `.test/h1probe.js`, `.test/db6_motion_result.json` and `.test/db6_probe.js` are not committed.
- **COMMON.md core md5 is stale** (74a5299e). The approved core is 8b20b836.
- **A file I didn't make.** `/workspace/veynhold/dist_preview/Veynhold_INT6_preview.html` appeared during this run; another agent wrote it, not me. The INT6 build is `Veynhold_INT6.html`.
