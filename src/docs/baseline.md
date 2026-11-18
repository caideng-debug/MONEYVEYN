# Veynhold — v8 baseline (before Phase 1)

Date: 2026-10-22. Build: `dist/Veynhold.html` = `dist/index.html` (2,443,282 bytes), combat-locked v8.
Backups: whole project copied to `/workspace/veynhold/.v8/` (src, build.py, models, three.min.js, dist, shots, test + tool scripts);
`dist/Veynhold_v8_combat.html` is a byte copy of the v8 build. `src/core.js` md5 `74a5299e9a45d86aaddc90e2f1831821` (matches `.v6/core.md5`).

## Automated suites (run 2026-10-22 on the v8 build)

| Suite | Result | What it drives |
|---|---|---|
| `.test/ct.js` (node, pure core) | **72/72** | deflect windows, perfect/good/late, buffers, perilous counters, chains, AI watchdog, fps independence |
| `.test/input.js` (jsdom + stub renderer) | **42 PASS, errors none** | real key/mouse events → intents, lock-on, attacks, pause, restart, leaks |
| `.test/v6.js` | **29/29** | grades, practice, persistence, tiers, Crimson Arc warning |
| `.test/smoke.js` | clean (no errors, not crashed) | title → fight → pause → resume |
| `.test/models.js` | **27/27** (one of 5 runs gave 26/27; flaky, could not reproduce in 3 reruns) | GLB load, retarget, hit flash, model toggle |
| `.test/v5.js` | **11/11** | chain HUD, finishers, Crimson Arc mesh lifecycle |
| `.test/v8.js` | **40/40** | clip timing, intros, finisher camera, save key migration, credits, core self-tests in page |

## Verified in a real browser (headless Chromium 1134, SwiftShader WebGL)
- Page loads from `file://` with zero page errors; title screen and a Duelist fight render (shots/base__title.png, shots/base__fight.png).
- Note: the Playwright Chromium binary was missing from `~/.cache/ms-playwright` at the start of Phase 1 and was reinstalled
  (`node .tools/node_modules/playwright-core/cli.js install chromium`; the host-deps check fails but `.tools/chromelibs` supplies the libs).

## Features present (from src/checklist.txt, spot-checked)
- Pure deterministic core (60 Hz fixed ticks, seeded RNG): deflect (0.20 s window from press, 70 ms late grace, perfect ≤40 ms),
  guard/block, posture + break + deathblow, perilous thrust (deflect or Counterstep), sweep (jump, trample), grab (dodge),
  dodge with i-frames, jump, 4-hit light chain, heavy, charged thrust, rising finisher, riposte, dash cut, running thrust, plunge.
- Enemies: Duelist, Iron Warden (super-armor, 1 mark), False Brother (feints), King's First Blade (2 marks, Phase II Crimson Arc,
  block chip), Training Shade; pair fights, gauntlet. AI uses the same rules (token system, branching strings, jitter, tempo modes).
- Presentation: skinned GLB models retargeted onto a pose rig, Quaternius CC0 clips, capes (verlet), ACES + post, ruined courtyard arena,
  boss intros, finisher cameras, victory/death cards, music layers, Low/Medium/High tiers + one adaptive step-down.
- Save: localStorage `veynhold_v8` (settings, bests, tutorial seen), migrates v7/v6.

## Controls (v8)
WASD move · Shift sprint · mouse/arrows camera · Q lock · Tab/wheel switch · J/LMB light · K heavy · hold LMB charged ·
F/RMB deflect (tap) / guard (hold) · Space dodge · C jump · E deathblow · R restart · Esc/P pause · H hints · ` debug (+T tune).
Gamepad standard mapping.

## Perf (headless SwiftShader CPU raster, 1280×720 — NOT a Chromebook; relative only)
Re-measured today on the v8 build, 90 frames, Duelist fight: Low avg 133.1 / p50 116.6 ms; Medium avg 558.8 / p50 516.7 ms.
Earlier v8 numbers in checklist.txt: Low 122.2/116.6, Medium 498.7/450, High 756.2/666.6 ms. Real GPU fps unknown.

## Known issues / limits at baseline
- Combat-only prototype: one circular arena (core clamps everyone to radius 16.5 around the origin), no world, no progression.
- Real Chromebook frame rate never measured; feel tuned by bots + numbers.
- models.js had one 26/27 run (flaky check, unidentified).
- No key rebinding, no touch controls.
