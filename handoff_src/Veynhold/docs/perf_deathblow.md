# Deathblow performance: master build 06a on Low and Medium, Chromebook proxy (2026-11-10)

> **What these numbers are.** Headless Chromium 1134 on a 2-core sandbox shared with other agents (load average 2–10 during the runs). The renderer main thread is CPU-throttled through CDP (`Emulation.setCPUThrottlingRate`) **×4** (main runs) and **×6** (one check run) to approximate a Chromebook CPU. The GPU is SwiftShader, which is a CPU rasteriser, so its pixel cost says nothing about a real Chromebook iGPU. To isolate the CPU side, most runs use **`--fill 0.05`**: the renderer pixel ratio is cut to 5%. That keeps every draw call, state change, shader compile and texture or buffer upload, but leaves almost no pixels to fill. Read those numbers as *main-thread cost on a slow CPU*. Full-fill runs (SwiftShader) are included for draw calls and triangles and as a relative check only.
> Noise: frames with identical content (same camera, same draw calls) sometimes vary 2–3× because of host contention. Spikes below are attributed only where a counter shows a cause (a new GL program, an IR build, a forced layout, a GC event). Unattributed single-frame stalls are reported as noise. Medians are about ±25% run to run.

Build: `dist/Veynhold.html` md5 `beec98219c83eeb72862c7dd1f33a8bf` (= `dist/index.html`), 1280×720, 1-frame steps at a fixed 16.67 ms (deterministic, same deathblow frame for frame every run).

## How it was measured (reusable)
- Script: `.tools/perf_db/perf_db.js <html> [--q low,medium] [--scen field,boss] [--cpu 4] [--fill 0.05] [--tag NAME] [--prewarm] [--diag] [--prof] [--no-trace]`
  - Wrapper (takes `/tmp/vh_browser.lock`, sets `LD_LIBRARY_PATH`): `.tools/perf_db/run.sh <html> …`
  - Tables: `node .tools/perf_db/summarize.js .tools/perf_db/out/<tag>_*.json [--compare out/<tag2>_*.json]`. Per-section means per phase: `node .tools/perf_db/phase_sections.js <json>`.
  - The measured set for this doc: `.tools/perf_db/batch_master.sh [html] [tag]`. **Rerun on the integration build:** `.tools/perf_db/batch_master.sh /workspace/vh_wt/INT5/dist/Veynhold.html INT5`, then `node summarize.js out/master06a_low_field_x4_cpu.json --compare out/INT5_low_field_x4_cpu.json`.
- Setup: Continue from the chunk-G1 test save (`.test/boss.js` `save0`, `intro_odran` set). Quality is set and `Perf.stepped` and `Guard` are off. The rAF loop is detached and `Game.frame` is stepped by hand. Each frame is timed as `Game.frame` (JS + GL submit) plus `gl.finish()`. There are 60 unthrottled warm-up frames before throttling starts.
- **field** scenario: the same as `.test/boss.js` part 3 / `deathblow_seq.js`. Teleport to the Muster Field gaoler `m5`, engage, 45 base frames, posture break (`CORE.addPosture`), 14 frames of stagger and E prompt, then E. Phases are `exec` (E → pull-out), `collapse` (pull-out → body down) and `post`. Then the same on the nearest second gaoler (`m6`, **warm**, `db2`).
- **boss** scenario: Odran Vale (Execution Grounds). Walk onto the Block, run the Phase I deathblow (field-style finisher), the transition, then the final deathblow (3.3 s finale: letterbox, 3-shot camera, desat).
- Per frame the script records: total / JS-only (= frame − `renderer.render` time) / GPU-wait ms, draw calls and triangles summed over all passes, new GL programs (name + cache key), time in `compileShader/linkProgram/get*Parameter`, texture and buffer uploads, JS heap, and per-section timers (sim, characters, camera, `Fin.post`, `Col.post`, VFX, FX, HUD, audio synthesis, `makeIR`, splat canvases). A Chrome trace adds GC pauses and style/layout per frame.
- **Kingsfall is not in master 06a.** It exists only in `src/checklist.txt:74` and as an incoming clip (`assets_incoming/deathblow_clips/kingsfall.json`), so the boss numbers below are Odran Vale's finale. INT5 has no Kingsfall code either at the time of writing.
- Raw data: `.tools/perf_db/out/master06a_*.json` (every frame), logs `out/master06a.log`, `out/exp.log`, `out/more.log`.

## Measured numbers

### Low, field deathblow, CPU ×4, CPU-side (`master06a_low_field_x4_cpu.json`)
| phase | frames | ms p50 | p95 | p99 | max | JS-only p50 | draw calls | tris | new GL programs | GC ms (sum) |
|---|---|---|---|---|---|---|---|---|---|---|
| db1 base (foe engaged) | 45 | 30.0 | 41.6 | 51.2 | 51.2 | 12.1 | 158 | 23.1k | 0 | 6.5 |
| db1 broken (stagger + E prompt) | 14 | 41.3 | 100.6 | 100.6 | 100.6 | 13.7 | 160 | 23.1k | **2** | 7.9 |
| db1 exec (E → pull-out) | 43 | 36.1 | 74.2 | 202.0 | **202.0** | 13.8 | 160 | 23.1k | **1** | 16.9 |
| db1 collapse | 105 | 34.4 | 50.4 | 65.3 | 67.3 | 11.3 | 153 | 25.5k | **2** | 22.0 |
| db2 base (warm) | 45 | 25.1 | 30.6 | 33.9 | 33.9 | 8.9 | 152 | 19.6k | 0 | 14.4 |
| db2 exec | 42 | 32.8 | 52.1 | 61.1 | 61.1 | 10.6 | 153 | 20.3k | 0 | 3.9 |
| db2 collapse | 106 | 31.9 | 64.8 | 69.0 | 75.9 | 10.0 | 163 | 29.0k | **1** | 21.9 |

- **CPU ×6** (`…_x6_cpu.json`): base p50 43.8 ms; db1 exec p50 46.9, max 231.8 ms; collapse p50 49.4 ms. Same spikes in the same frames.
- **Full fill, SwiftShader** (`master06a_low_field_x4.json`): base p50 62.6 ms, exec 79.1, collapse 69.3, whole run 80 ms p50. This is GPU-bound and in line with `docs/perf.md`.
- **Baseline already misses 60 fps on a ×4 CPU.** Low costs 25–30 ms per frame on the CPU before any deathblow, and about 16 ms of that is `renderer.render` itself. The CPU profile (`--prof`) puts three.js `updateMatrixWorld` (the whole scene graph every frame), `WebGLLights.setup`, `renderBufferDirect` and uniform uploads on top. The HUD compass DOM (`UI.compass`/`place`, `src/ui.js:99`, called every frame from `src/world.js:824`) comes next. **30 fps (33.3 ms) is the realistic Low target on this proxy.**
- What a deathblow adds on Low, per frame at ×4 (means without the spike frames, `phase_sections.js`):
  - `renderer.render`: 15–16 → 21–22 ms (**+5–6 ms**) through exec and collapse. Draw calls barely change (+2–10). Most of this cost follows the camera framing and the corpses (db2 post stays at 20.5 ms with two bodies down), so it is not a VFX cost. It is not fully attributed.
  - Camera + `Fin.post` (`cam.update`): +0.5–1.2 ms (`Fin.post` 0.76–1.07 ms in exec).
  - `Col.post`: +0.2–0.4 ms. VFX/FX updates under 0.3 ms. Audio scheduling under 0.1 ms (except the IR build, below).
  - Allocation: about 300 → **366 KB/frame** during db1 exec. Minor GCs run every ~15 frames at 2–5 ms each (×4). No major GC happened in any deathblow window.
  - Net: **+4–8 ms p50** over base, plus the hitches below.

### Medium, field deathblow, CPU ×4, CPU-side (`master06a_medium_field_x4_cpu.json`)
| phase | frames | ms p50 | p95 | max | JS-only p50 | draw calls | tris | new programs | shader ms |
|---|---|---|---|---|---|---|---|---|---|
| db1 base | 45 | 74.9 | 118.4 | 859.9 | 22.8 | 356 | 126k | 3 | 93 |
| db1 broken | 14 | 55.7 | 115.9 | 115.9 | 19.3 | 358 | 127k | 2 | 22 |
| db1 exec | 43 | 55.8 | 256.0 | **1494.3** | 18.5 | 346 | 133k | 1 | **1289** |
| db1 collapse | 105 | 70.4 | 143.4 | 193.5 | 22.8 | 347 | 136k | 2 | 27 |
| db2 exec (warm) | 42 | 73.1 | 116.2 | 138.8 | 25.0 | 341 | 157k | 0 | 0 |

- Medium costs 55–75 ms on the CPU alone at ×4, with about 45–50 ms in the post chain and scene render: 350 draws, a 512 shadow map, bright pass + 2 blurs + composite. **Medium is not viable on a Chromebook-class CPU whatever the deathblow does.** Low should stay the Chromebook default.
- The Medium field finisher has a camera cut (`src/world_boss.js:373-383`; Low has none, `cut: … || !lowTier()` at `:248`). The cut's first frame (f125) shows a `MeshStandardMaterial` variant never drawn before. That cost **1.29 s of shader compile** on this run, and 83 first-time buffer uploads.
- Full fill (SwiftShader, `master06a_medium_field_x4.json`) runs at 430–530 ms per frame. It ran under load 8, so its medians are unreliable; the counters match the CPU-side run.

### Boss (Odran Vale), CPU ×4, CPU-side
| | Low p50 / p95 / max | Medium p50 / p95 / max | notes |
|---|---|---|---|
| fight base | 29.2 / 46.8 / 48.3 | 56.0 / 146.2 / 218.3 | 120 / 289 draws |
| Phase I break (stagger) | 31.3 / 120.7 / 120.7 | 55.6 / 152.9 / 152.9 | 2 new programs (ring + ink sprite) |
| Phase I exec | 31.2 / 65.3 / **200.8** | 52.9 / 95.4 / **200.7** | exec reverb IR built on the E frame: 115 / 129 ms |
| Phase I collapse | 27.3 / 43.6 / 66.0 | 42.9 / 73.7 / **400.4** | Low 4 / Medium 4 new programs as arena geometry enters view (Medium `MeshStandard` 333 ms) |
| transition | 28.4 / 49.8 / 75.9 | 59.5 / 106.0 / 622.5 | 2 programs. Medium: `makeIR` again (23 ms, the steel send) |
| final deathblow, finale exec | 23.7 / 30.2 / 33.1 | 53.4 / 78.6 / 86.3 | tighter finale shots draw less (91 / 235 draws) |
| finale collapse | 30.6 / 107.1 / 150.3 | 56.6 / 83.3 / 149.4 | 1 program (f741). Low p95 is mostly host load, see note |

Files: `master06a_low_boss_x4_cpu.json`, `master06a_medium_boss_x4_cpu.json`. In the Low run, the frames after the finale climb from 30 to 100 ms with the same camera and the same 151 draws, and every section slows equally. That is host contention, not the game.

## What spikes during a deathblow (ranked by cost on Low ×4)
| # | spike | when | cost (×4 Low; Medium) | where |
|---|---|---|---|---|
| 1 | **Lazy convolution-reverb IR built on the first deathblow.** `audio.play('deathblow' / 'dbEntry')` → `sendOf('exec')` → `makeIR(2.8 s)`: 2 × 134,400 samples, each with `Math.pow` + `Math.exp` + LCG, on the main thread. | the E-press frame (db1 f119 / boss f154) | **115–133 ms** in one frame (frame 202–232 ms). Medium also builds `steel` in the boss transition (23 ms). | `src/game.js:59-62` (makeIR), `:64-67` (sendOf caches lazily), `:149` (exec 2.8 s), `:150-151` (SEND_OF) |
| 2 | **Shader programs compiled on first sight.** No `renderer.compile` anywhere in `src/`. The deathblow is where new variants first appear: the break FX ring and the first ink sprite with a map at the posture break, then Lambert/Basic scenery variants (double-sided, vertex-colour, map+emissive) as the step-in, FOV kick and falling body bring new props into frustum. Medium's finisher cut and the boss arena bring `MeshStandardMaterial` variants. | break (2), exec (1), collapse (2–4), warm second kill (1) | Low: 50–100 ms frames (15–45 ms inside GL compile calls, the rest in first draw). Medium: **1.29 s** (cut), 333 ms (boss). SwiftShader compile is slower than a real driver, but a Chromebook's Mesa/ANGLE compile of a `MeshStandard` variant is still tens of ms. | new variants come from `src/game.js:1866-1868` (FX rings: `MeshBasic`, `DoubleSide`, additive), `:913-917` (ink sprites and stains created with `map: null`, given a map on first splash, which switches program variant), plus scenery materials. The fix belongs after `src/world.js:254` (`scene.add(this.root)` in `Region.load`). |
| 3 | **First-draw uploads of never-seen geometry and textures** (Medium cut). After the compile prewarm below, the cut frame still cost 225 + 741 ms with 83 buffer and 43 texture uploads. | Medium finisher cut f125–126 | 0.7–1 s | `src/world_boss.js:373-383` (cut camera). Region geometry is uploaded lazily by three on first render. |
| 4 | **Forced style + layout to restart the E-prompt pop animation**: `el.classList.remove('vhPop'); void el.offsetWidth; el.classList.add('vhPop')` | the frame the E prompt appears | 9–11 ms layout + 2–3 ms style (trace) | `src/world_boss.js:351` |
| 5 | **Splat textures generated lazily**: a 128² canvas painted, then a new texture uploaded, on the first splash or stain of each seed. | impact and pool frames | 3–11 ms per miss | `src/game.js:517` (`V7Tex.splat`), called from `:921`, `:924` |
| 6 | **Allocation churn**: minor GC, 2–5 ms each, about every 15 frames. The deathblow adds about 60 KB/frame on top of a 200–300 KB/frame baseline. | throughout | 0.2–0.3 ms/frame average, 5 ms hitches | HUD: `dc.root.position.clone()` ×2 per frame plus `w.enemies().find(...)` (`src/game.js:2045-2046`). VFX: `this.inks.slice()` / `this.stains.slice()` + `.find` closures per splash/stain (`:919-924`). `material.needsUpdate = true` on every splash/stain (`:921`, `:924`) makes three rebuild program parameters and cache-key strings. `w.events.slice()` every frame (`src/world_boss.js:258`). `F.dir = _d.clone()` etc. (`:324`, once per blow, negligible). |
| 7 | Letterbox / grade | — | ~0 on Low | Low has no post pass (`TIERS.low.post:false`, `src/game.js:442-445`). The letterbox is a CSS class on `#lbox` (`src/game.js:936`), so it is compositor work, not main thread. On Medium the grade and LUT live in the one composite pass that is always on (`src/game.js:795-830`), so a deathblow adds no pass (DoF passes only run with `T.dof` = High, `:815`). Not a spike on either tier. |
| 8 | Camera | — | +0.5–1.2 ms/frame | `Fin.post` step-in solve (2 iterations of `updateMatrixWorld(true)` on both roots + blade aim, `src/world_boss.js:290-321`). `BD.finCam` / field cut (`:360-383`) under 0.2 ms. |

## Fixes, ranked by gain
1. **Build the reverb IRs at audio init, never at first use.** In `AudioSys.ensure()` (`src/game.js:34-41`), after `initBus()`, schedule `sendOf('exec'); sendOf('steel')` (and `air`/`flesh` on Medium+) in `requestIdleCallback` or across a few `setTimeout(0)` slices. Also make `makeIR` (`:59-62`) cheap: `fc` is a geometric ramp, so multiply by `ratio = (f1/f0)^(1/len)` each sample instead of `Math.pow`. Replace `Math.pow(1-u, pow)` with `(1-u)*(1-u)` for the pow-2 IRs. That is about 5–10× less work. **Measured gain: the 115–133 ms E-press hitch is gone** (prewarm experiment below). For the new presentation's ~30 `.ogg` cues (`assets_incoming/deathblow_audio/`): `decodeAudioData` everything at region load, never on the first deathblow.
2. **Prewarm shaders at region load and after every `applyQuality`.**
   - After `scene.add(this.root); scene.add(this.dyn)` in `Region.load` (`src/world.js:254`), call `renderer.compile(scene, camera)`. Call it again after `applyQuality`, because the torch-light count changes the program key.
   - Create the VFX pools with their real texture: ink sprites and stains with `map: V7Tex.splat(kind, 3)` / `(kind, 6)` instead of `map: null` (`src/game.js:914-917`). Then a splash only swaps textures and never changes variant, and `needsUpdate` can go.
   - Generate all splat seeds (3–8) at init.
   - **Measured** (`--prewarm`, in-page experiment, `master06a_prewarm_*_cpu.json`):

     | | new programs during the run | db1 exec max | whole-run max |
     |---|---|---|---|
     | Low, before | 6 | 202 ms | 202 ms |
     | Low, after | **0** | **74.7 ms** | 111 ms |
     | Medium, before | 8 | — | — |
     | Medium, after | **0** | — | — |

     Low's remaining 111 ms max is one 31 ms minor GC plus host load. Medium: the 1.29 s compile at the cut is gone.
   - Load-time cost: 290 ms at ×4 (audio 53 ms + compile 232 ms, 18 programs up front). Pay it behind the region fade-in.
3. **Warm-render the region once at load (Medium+ and for any finisher camera).** Render the scene once into a 1×1 (or 64×36) render target with `frustumCulled = false` on the region chunks for that one frame, then restore. That uploads every geometry buffer and texture that `renderer.compile` does not. It removes the 0.7–1 s first-draw stall at Medium's finisher cut, measured as still present after fix 2. Cheaper alternative: pre-position the camera at the cut's shot positions during the fade-in.
4. **Drop the forced reflow at the E prompt** (`src/world_boss.js:351`). Restart the pop with the Web Animations API (`el.animate([...], {duration})`) or alternate two animation names. Gain: about 10–13 ms on the posture-break frame. That frame also carries the ring and sprite compiles before fix 2, about 100 ms in total.
5. **Cut per-frame allocation in the deathblow window.**
   - HUD: project into the reused `this.proj` instead of `dc.root.position.clone()` twice per frame. Compute the deathblow candidate once (`src/game.js:2045-2046`).
   - VFX: iterate the pools with an index and a tier limit instead of `slice()` + `find` closures (`:919-924`). Stop setting `needsUpdate` when only the texture changes.
   - Hook: replace `w.events.slice()` with a reused array (`src/world_boss.js:258`).
   - Gain: about 60 KB/frame less, fewer 2–5 ms minor GCs inside the 2.4 s window.
6. **Baseline headroom: not deathblow code, but it is the budget.** On Low ×4, `renderer.render` is about 16 ms of the 25–30 ms frame.
   - Freeze the static region subtree: `regionStatic.matrixWorldAutoUpdate`-style. In r128, override `root.updateMatrixWorld = () => {}` after the build and update manually on rebuild. `matrixAutoUpdate=false` alone (`src/world_build.js:716`) still walks every child every frame.
   - Update the compass DOM at 10 Hz, or only when the yaw changes by more than 0.5° (`src/world.js:818-824`, `src/ui.js:99`).
   - Expected (not measured): 2–4 ms/frame at ×4, which is about what a deathblow currently adds.
7. **Keep what is already right.** On Low: no bloom, no post pass, a CSS letterbox, no finisher camera cut. Do not move the letterbox or grade into a shader pass on Low. If the new presentation needs a grade on Low, drive an existing uniform or CSS opacity on an overlay, never a full-screen pass. `renderer.compile` covers new materials only if they exist in the scene at load.

## Frame budget for the new deathblow presentation (Low, Chromebook proxy = CPU ×4, CPU-side)
The Low baseline is 25–30 ms p50 with a foe engaged. The target is a steady **30 fps (33.3 ms)**. That leaves **about 3–6 ms per frame** for everything the deathblow adds, roughly 1–1.5 ms on an unthrottled desktop. Today's finisher already adds +4–8 ms p50, so the new one must be **at or below today's cost**, or buy headroom with fix 6.

| item (added on top of the base frame, ×4) | p50 budget | p95 budget | today (master 06a) |
|---|---|---|---|
| Camera (step-in solve, shot logic, shake, FOV) | ≤ 0.8 ms | ≤ 1.5 ms | 0.5–1.2 ms ✔ |
| Grade / letterbox / flash / desat | ≤ 0.3 ms main thread, **0 extra passes, 0 extra draws** | ≤ 0.5 ms | CSS bars, no pass ✔ |
| VFX (blood/ink sprites, streaks, flecks, pools) | ≤ 1.0 ms CPU, ≤ +8 draw calls, ≤ +2k tris, 0 new materials | ≤ 2 ms | < 0.5 ms, +2–5 draws ✔ |
| Render growth from framing (bodies, props in shot) | ≤ 2 ms | ≤ 4 ms | **+5–6 ms ✘** (frame shots tighter, like the boss finale: 91 draws) |
| Audio (scheduling only; no synthesis, decode or IR build) | ≤ 0.3 ms | ≤ 0.5 ms | 0.1 ms, but a **115–133 ms** IR build on first use ✘ |
| Allocation in the window | ≤ 50 KB/frame (no extra minor GC in 2.4 s) | — | +60 KB/frame ✘ |
| **Total added** | **≤ 3 ms** | **≤ 6 ms** | +4–8 ms ✘ |
| Hard limits | no frame > 50 ms (at most 1 dropped frame at 30 fps). **0 shader compiles, 0 first texture/geometry uploads, 0 IR builds or audio decodes, 0 forced layouts inside the window.** | | 5–6 violations on the first kill ✘ |

How to check a candidate build: `run.sh <html> --tag X --q low --scen field,boss --cpu 4 --fill 0.05`, then `summarize.js`. The exec and collapse rows must show 0 new programs, no `Reverb IR builds` line, and p50 within 3 ms of that run's base row.

## Caveats / not established
- No real Chromebook was measured. CPU throttling slows only the renderer main thread, so GPU-process work (SwiftShader compile, raster) is not scaled and real-GPU compile times will differ, likely shorter. The ranking (IR build, then compiles, then reflow) does not depend on that.
- The +5–6 ms `renderer.render` growth during exec/collapse on Low is only partly explained (framing and corpses). A per-object render breakdown was not done.
- `--prof` heap sampling reports surviving allocations only. Allocation sources in fix 5 come from code review, not the profiler.
- Some single-frame stalls of 0.2–1 s (for example Low cpu-x1 f546, Medium full-fill db2) had identical content to their neighbours and no counter fired. They are host contention and are excluded from attribution.
- The INT5 build was not profiled: it was mid-merge, and the doc and scripts were made for a later rerun. If INT5 renames `BossD.Fin` / `Fin.cur` / `F.rip`, the timers skip what they cannot find and the phase labels fall back to `exec`. The frame data stays valid.
