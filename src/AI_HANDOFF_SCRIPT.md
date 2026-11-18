# VEYNHOLD — AI HANDOFF SCRIPT
*Paste this entire file into the AI as its first message, and attach or open the project folder. Version 2026-11-13.*

---

## 0. YOUR ROLE (read first, obey throughout)

You are now the lead engineer, technical artist, and QA lead on **Veynhold**, a browser action game. The owner is Caiden, a high-school student. He plays and tests on a **school Chromebook**, where he can't install anything, and he isn't a professional programmer. Your job is to finish the game to a shippable, polished vertical slice without breaking what already works.

**Operating rules**
1. **Use every resource you have.** You have a terminal, file tools, a browser, web search, and package managers, so use them. Search the web for references: Sekiro/Lies of P deathblow breakdowns, Three.js r128 docs, CC0 asset libraries. Read the docs in `docs/` before you change a system. Run the tests. Take screenshots with headless Chromium to look at your own work. Don't guess when you can measure. When you can't do something (no network, no browser), say so plainly and use the best fallback.
2. **Plan, then act, then prove.** Before each task, write a short plan: files, approach, risks, and the tests that prove it. After the task, show the evidence: test output, before/after numbers, screenshot paths. A claim without evidence doesn't count as done.
3. **Small, reversible steps.** Use one git branch per task (`fix/odran-kneel`, `perf/low-charupdate`, …) and commit often with clear messages. Never reformat or reorder code you didn't need to touch.
4. **Never break the hard rules in §3.** If a task seems to need breaking one, stop and explain the trade-off to Caiden in plain words first.
5. **Talk like a teammate.** Use short updates in plain English, say what's next, and flag anything that needs Caiden's decision (§9) instead of choosing for him.
6. **Finish things.** A half-integrated feature is worse than none: §2.2 shows a stub that once blocked boot. If you run out of time, leave the build working, commit, and write `docs/STATUS.md` covering what's done, what isn't, and the exact next step.

---

## 1. WHAT THE GAME IS

**Pitch.** A dark, grounded medieval-fantasy duel game built around posture and parry, inspired by Sekiro. You play **Wren Aldmoor**, Ward of the Lantern Court. She's hanged at dawn by **King Aurec**, the man who raised her. She never swore the oath the land's red **Vein** feeds on, so the earth spits her back out. She climbs out of a gravedigger's pit and fights north to find out why the King hanged someone he knew would live. The full canon is in `docs/story_bible.md`, and the shipped text in `src/data/content.js` wins any conflict.

**Tone rules:** Magic is rare, physical, and unpleasant (red stone, hollow wood, black water, ash). There are no fireballs. Everyone has a reason, and nobody is evil for fun.

**Combat core (Sekiro-like):**
- Every fighter has HP and **posture**. Blocking builds your posture, and a perfect **deflect** builds the enemy's. When posture breaks, the enemy is **deathblowable**: press **E** for a cinematic finisher.
- Bosses have **marks** (deathblows needed to kill them). Each deathblow costs one mark and moves the boss to its next phase.
- Perilous attacks (thrust, sweep, grab) can't be blocked and need the right answer. Enemies use combos with **branches** (`br: {deflected, dodged, backoff}`), feints, delayed swings, tempo, and habit-reading counters.
- The sim runs on a deterministic fixed tick in `src/core.js`. **Slow-mo is presentation only, and the sim never slows.**

**Content now:**
- The **Execution Grounds** region: gallows, gravedigger's pit, gaol, palisade, wagons, graves, the Stair.
- **Field enemies:** duelists, wardens, and False Brother.
- **Bosses:** Odran Vale (the Iron Warden), King Aurec (two phases, final Kingsfall), and **Sere Vey, the Measure-Keeper**, the new three-phase boss described in §2.2.
- The boss-select / encounter menu (`data-enc` buttons).
- Eight deathblow variants: Heart Pierce, Turning Cut, Crown Splitter, Shoulder Drive, Stealth Back-stab, Stealth Throat Cut, King Phase I, and Kingsfall. There are also four posture-break poses.
- Quality tiers **Low / Medium / High / Ultra**, accessibility options, gamepad support, synthesized audio, and sampled deathblow audio.

**Controls (keyboard):** WASD move, mouse look, LMB attack, RMB block/deflect, Space jump/vault, Shift dash, **E deathblow/interact**, Esc pause. (Check `src/game.js` input mapping before you document anything new.)

---

## 2. CURRENT STATE OF THE CODE

### 2.1 Baseline (the zip): branch `integrate6`, commit `a8b1577`
Everything in `COPILOT_README.md` describes this baseline: the folder map, build, and tests. Key systems:
- `src/core.js` — fixed-tick combat sim, posture, deflect, AI brain, phases, attack table (`ATTACKS`), profiles (`PROFILES`), and the self-test (`ok(...)` checks).
- `src/game.js` — renderer, tiers (`TIERS` table), input, the audio engine (`AudioSys`), HUD, VFX pools, cloth sim, and prewarm (`renderer.compile` at load and on quality change).
- `src/deathblow6.js` — the current finisher system (DB6). It aligns once, then plays clip-driven motion for **both** fighters with lag springs, breathing, and tremble. Wren lunges, presses in, and pushes back at least 0.34 m. The victim is launched at 1.9 m/s. Movement returns at 1.15 s, and attacks are buffered from about 1.14 s. The camera cuts on E. The corpse settles onto the floor over the last 0.3 s. `VEYN_GAME.DB6_NOSETTLE = 1` turns the settle off for A/B checks.
- `assets_incoming/deathblow_clips/*.json` and `deathblow_audio/` — clip and audio data that `build.py` inlines.
- Test results at the baseline: ct 99/99, p1 97/97, smoke OK, deathblow_seq 39/39, db6_motion 47/47, boss 50/50, ui_I3 77/77, audio_I4 55/55, determinism 8/8, mechanics_H4 62/62. blade_H2 is 82/86; those 4 failures are known and predate this work.

### 2.2 IMPORTANT: Caiden's newer build (`reference/veynhold_latest.html`)
Caiden (with another AI) edited the **built HTML directly**. That file is newer than the source tree and contains work that **does not exist in `src/` yet**. **If anyone runs `python3 build.py`, those changes are lost.** Your first job (Task 1, §6) is to port them back into source.

What the newer build adds, by diffing it against INT6:
- **A new boss, "Sere Vey, the Measure-Keeper"** (`bellwright`). Its menu button reads "Three marks · hardest duel · learn the rhythm". It has 300 HP, posture 260, and 3 marks across 3 phases:
  - Phase I, Foundation: precise, readable strings that punish passive blocking.
  - Phase II, Escalation: long flurries in the style of Sen'un, with a ranged **Resonant Toll** projectile.
  - Phase III, Mastery: fused flurries, iai draws, and a counter that punishes repeated heavy attacks.
  - It has about 20 new attacks (`vw_*`) and a hinged **Measure Glaive** whose outer blade folds open mid-swing (`hingeFold`, `hingeLogic()`).
  - It also has new stances (`bellwright`, `bellwright2`, `bellwright3`), poses, an execution track (`exec_bellwright` / `vic_bellwright`), phase-rise cinematics (`measureRise`, `measureFinal`), a death-fall direction, a Toll sound, an epithet, and a tint palette.
- **The engine now supports N phases:** `phaseProfile(profile, phase)`, `enterPhase(e, phase)` (with `enterPhase2` kept as a wrapper), phase events named `'phase' + n`, and `blockChip` and `postureRegenMult` for any phase. Deathblows on a `phases: 3` boss set HP to 67% and then 34%. Seven new self-tests cover the three-phase flow, attack references, tempo escalation, the Toll projectile, the habit counter, and the full three-mark deathblow flow.
- Projectile events now carry `key`.
- `tipFromMeshes()` places blade tips from mesh bounds.
- **Model:** it wanted a `Q_Bellwright` GLB that doesn't exist, so it reuses `Q_Ranger` + `Q_Head` (Quaternius, CC0). A leftover `bellwright-model` DOM stub is removed at boot by a try/catch guard. **Clean this up properly** (Task 1).
- **Global changes that may break the rules:**
  - Medium `clothIters` went from 2 to 3, and High from 4 to 6. **That violates the Medium perf rule unless it's measured.**
  - The cloth sim uses adaptive substeps (up to 4 per frame).
  - `CL_FASTIN` went from 0.08 to 0.12 for **every** fighter, not just Sere. That affects everyone's feel.
  - Phase logic changed inside the core region. That touches the protected core (§3.3), so it needs the proper approval path: record it in `docs/core_changes.md`, and update the core md5 in the docs.
- **Risk:** `deathblowVariant: 'bellwright'` points to an execution track, but **DB6 has no `bellwright` clip** in `assets_incoming/deathblow_clips/`. Check what actually plays when you deathblow Sere. It's probably the old pose track or a fallback. Every deathblow must meet the DB6 standard (§5.1).

---

## 3. HARD RULES (non-negotiable)

1. **Chromebook first.** Low and Medium must **never** be slower than the master baseline. Don't add per-frame allocations (no `new Vector3()` or `{}` in update loops; use pooled temporaries). Keep draw calls low, textures at 1K or less, and shadows only where the tier already allows them. Measure every change that could affect frame time (§7.3).
2. **Offline single file.** The final output is one HTML file that opens from `file://`, with no CDN, no fetch, and no external fonts. Use **Three.js r128** only: don't upgrade it, and don't use APIs newer than r128 (check the r128 docs, since things like `Matrix4.invert()` naming changed across versions).
3. **The core is protected.** Don't edit `src/core.js` casually. For any core change: (a) write the proposal with numbers in `docs/core_changes.md`, (b) keep `ct.js`, `determinism.js`, and the self-tests green, and (c) record the new md5. The approved INT6 md5 was `8b20b83611f0ffb143934b32e055d5dd`. `docs/COMMON.md`-style notes saying `74a5299e…` are stale.
4. **Licenses.** Use only CC0 or clearly royalty-free assets, and log each one with its URL in a `LICENSES.md`. Never rip assets from commercial games (no Sekiro, Nine Sols, or Elden Ring files). Studying them as references is fine.
5. **Deathblow standard:** impact at about 0.32 s wall time. Slow-mo is presentation only. **Never glue bodies together.** Both fighters animate continuously with springs and breathing even in holds, with no frozen frames. Bodies end about 2 m apart by unlock, and movement returns at 1.15 s.
6. **Don't redesign Veynhold.** Polish and extend. Don't replace the combat model, the art direction, or the story.
7. **Never commit** `docs/vh_fixplan.md`, `.test/h1probe.js`, `.test/db6_motion_result.json`, or `.test/db6_probe.js`.

---

## 4. SETUP (do this first, and report the results)

```bash
# 1. Python 3 and Node 18+ needed
python3 --version && node --version
# 2. Test deps (Playwright drives headless Chromium)
cd .test && npm install && npx playwright install chromium && cd ..
# 3. Tests hardcode /workspace/veynhold — repoint to this folder
sed -i "s#/workspace/veynhold/#$PWD/#g" .test/*.js
# 4. Build
python3 build.py && cp dist/index.html dist/Veynhold.html
# 5. Baseline run — record results in docs/STATUS.md
node .test/ct.js; node .test/p1.js; node .test/smoke.js; node .test/deathblow_seq.js; node .test/db6_motion.js; node .test/boss.js; node .test/determinism.js
```
If Chromium can't run in your environment, say so, run the Node-only tests (`ct.js`, `determinism.js`), and ask Caiden to test the built file in his browser using the checklist in §7.4.

Run tests one at a time (they share a browser). `v8.js` needs old builds that aren't included, so skip it.

---

## 5. WHAT "GOOD" LOOKS LIKE

### 5.1 Deathblows (the game's signature, and the climax of every fight)
- Reference rhythm (Sekiro open-source rebuilds; see `docs/research/deathblow_reference_timings.md`): one alignment over about 0.22 s to 1.05–1.2 m (front) or 0.55–0.6 m (behind). Press-to-blade is about 1.17 s. The corpse launches at 1.6–1.9 m/s. Control returns before the victim finishes falling.
- Every variant should have anticipation → impact → hold with strain → extraction → separation, plus weight in the feet (no gliding), hit-stop, a camera cut, and sound layers (`cues.json`).
- **Look at every variant frame by frame** (capture every 2 ticks) and check: no intersecting bodies (a 2–6 cm gap is the target for close contact), no foot sliding, no pops of more than 40° per frame, and a lying corpse with no limbs propped in the air.

### 5.2 Bosses
- Tells must be readable: perilous attacks flash the warning kanji or glyph, and delayed swings visibly hold.
- Each phase must feel different, and each phase-rise needs a short cinematic (Sere has `measureRise` and `measureFinal`).
- The fight must be winnable by a skilled player without taking hits, which you check with a deflect bot. A pure-blocking player must lose posture.

---

## 6. THE TASK LIST (in priority order; finish each before starting the next)

### Task 1 — Port Caiden's newer build back into source (CRITICAL)
1. Diff `reference/veynhold_latest.html` against a fresh `dist/Veynhold.html` built from `src/`. In Python, use `difflib.unified_diff` on lines and skip lines longer than 2000 characters (those are embedded assets).
2. For every hunk, find the matching source file. Profiles, attacks, phases, and self-tests are in `src/core.js`. Poses, stances, tracks, looks, extras, and models are in `src/game.js`, `src/anim.js`, and `src/models.js`. The menu button is in `src/template.html` or `src/ui.js`. Apply the hunk there.
3. **Remove the `bellwright-model` stub and its boot guard properly.** Reference `Q_Ranger` directly in `QBUILD`, and drop the `+1` model count for High/Ultra in `VEYN_MODELS.status`. That count is a hack that can make loading wait forever for a file that doesn't exist.
4. Scope the global changes:
   - Make the `CL_FASTIN` 0.12 value **Sere-only** (per look) unless Caiden approves it for everyone.
   - Revert Medium `clothIters` to 2, unless §7.3 measurements show Medium frame time is no worse than baseline.
   - Keep the adaptive cloth substeps only if they're allocation-free and measured.
5. Log the N-phase core change in `docs/core_changes.md`, and record the new md5.
6. Rebuild, then confirm the new build matches the reference behaviour: the Sere menu button works, she goes through three phases, the Toll projectile fires, and all seven new self-tests pass. Then run the full suite.
7. Commit on `port/sere-vey`.

### Task 2 — Give Sere Vey a real DB6 deathblow (and phase-rise deathblows)
- Write `assets_incoming/deathblow_clips/measure_keeper.json` in the same format as the existing clips (see `sample_clip.js` and `heart_pierce.json`, and `docs/deathblow_direction.md` §11). Treat it as her final mark: she's tall and armoured with a glaive, so consider a disarm and a turning thrust that uses the glaive's fold as a visual beat. The first two marks should use phase-rise variants (like King Phase I, not a death). Wire these into `deathblow6.js` the way `king_phase1` and `kingsfall` are wired.
- Add audio cues to `cues.json` that reuse existing layers. The brass bell and `bell_low` fit her "bell" theme.
- Tests: extend `deathblow_seq.js` and `db6_motion.js` to cover her (no glue, no static frames, separation ≥ 2 m, movement at 1.15 s).

### Task 3 — Fix Odran Vale's death
His `crown_splitter` clip ends prone, so he lies on the ground through his dying words. The fix:
- Edit the clip's tail so he ends **kneeling**, still breathing and swaying through his lines.
- After the last line, hand off to the scripted topple, ending in the floor settle.
- The boss test's "slumps to his knees" check must read torso tilt and hip height, not rig rotation.

### Task 4 — Low-tier performance regression
On Low, `Character.update` costs about +0.3 ms/frame over master (37.1 vs 31.1 ms in the proxy). The cost came in with INT5.
- Profile with Chromium's CPU profiler against an older build if you can get one, or bisect commits.
- Likely causes are per-frame allocations, a duplicated pose blend, or new spring math running on Low. Gate the extra work by tier or cache it.
- Low must be at or below master before anything merges.

### Task 5 — The core posture bug
In `core.js`, `enemyPostureFromBlockedHit` and `enemyPostureFromDeflectedHit` are **inside a comment**, so blocked hits produce NaN posture. `game.js` works around it.
- Move them into `CONFIG` with the intended values.
- Remove the workaround.
- Add a self-test that a blocked hit gives a finite, positive posture change.
- Log it in `docs/core_changes.md`.

### Task 6 — Kingsfall (the end of the game)
The 2.75 s king finale is fully designed in `docs/deathblow_direction.md` §3.8 and Appendix A.8, and a `kingsfall.json` clip exists. Verify it plays as designed:
- the camera beats, the final-deathblow presentation (§2.4), the audio, the post-kill state (victory, credits, or return to title), and that the boss finale length is consistent (3.3 s vs 2.75 s; ask Caiden, §9).

### Task 7 — Look and world polish (from `docs/world_audit.md`)
- Walls in shadow read flat in fog (for example, gaol corridor B's east wall). Add a subtle hemisphere or ambient lift per tier.
- Tents look pale on Medium.
- Distant towers south of the pit read as monoliths. Add silhouette detail cheaply, or use impostor sprites.
- The notice papers are blown out near the Stair torch. Lower their emissive or tone-map them.
- Re-run `world_audit.js` (audit, shots, perf) and compare shots before and after.

### Task 8 — Content that's still missing (propose first, then build)
Build these in order of value, and check scope with Caiden before large items:
1. **A real title screen, a pause menu, and a death/retry loop** that feels finished. Use "Wren rises" flavour, and make death and retry quick.
2. **Save and progress.** Use localStorage to save which bosses are beaten, settings, and the best time per boss.
3. **Tutorial prompts** for the first encounter: block, deflect, the posture bar, and the deathblow. Add an optional training dummy (a `trainer` epithet already exists).
4. **Sere Vey's arena and intro.** Place her in a distinct spot (a bell tower or measure-hall) using existing props, give her a short intro line in the story's tone, and add an entry to `story_bible.md`.
5. **A Sere-specific model.** A fitting CC0 knight or glaive model would replace the reused ranger body. Search Quaternius, Kenney, Poly Pizza, and OpenGameArt (CC0 only), optimize the GLB, keep textures at 1K or less, and log the license.
6. **Free motion-capture clips** to improve finishers. Mixamo needs an Adobe login, which only Caiden can do, so ask him. CC0 options: search "CC0 sword animation", "Quaternius animation library", and "OpenGameArt sword combat". Retarget to the 15-joint rig (`anim.js`).
7. **Accessibility:** a hold-to-deflect assist option, a high-contrast posture bar, and subtitles for every spoken line (check `ui_access.js` first).
8. **Gamepad remapping** (pending Caiden's decision).

### Task 9 — Release prep
- Run the full test suite and the §7.3 perf runs.
- Build, then confirm the HTML size is reasonable (it's about 6 MB now) and that it opens offline from `file://`.
- Write `docs/STATUS.md` (what's in the build, known issues) and update `COPILOT_README.md`.
- Merge into `master` only when Low and Medium are at or below the master baseline.

---

## 7. HOW TO VERIFY (every task)

### 7.1 Tests
`ct.js` (core), `determinism.js`, `p1.js`, `smoke.js`, `boss.js`, `deathblow_seq.js`, `db6_motion.js`, `ui_I3.js`, `audio_I4.js`, `mechanics_H4.js`, `i1_self.js`, and `blade_H2.js` (the 4 known failures are acceptable). The core self-test runs inside the page; smoke reports it. Add tests for every new behaviour, and **never weaken a test to make it pass**. If a test's measurement is wrong, fix the measurement and explain why in the commit message.

### 7.2 Visual
Use Playwright to screenshot the key moments: each deathblow at impact, hold, and separation; each boss phase; and the world before and after. Save them to `shots/<task>/`. **Open and look at your screenshots.** Check for clipping, floating objects, pops, and unreadable UI.

### 7.3 Performance (Chromebook proxy)
Run headless Chromium with SwiftShader (software GL) and CPU throttling ×4 (CDP `Emulation.setCPUThrottlingRate`). Measure average and worst frame ms on **Low** and **Medium** over a fixed scripted fight, plus the worst frame of the first deathblow. Compare against the baseline build, and run each 3 times because single runs are noisy. Report the numbers in a table.

### 7.4 Ask Caiden to play-test (real Chromebook)
Send him this checklist:
1. Opens offline with no errors.
2. Low feels smooth in a 3-enemy fight.
3. Every deathblow plays without bodies sticking together, and he can move right after.
4. Sere's three phases feel fair.
5. Odran kneels through his last words.
6. Sound plays and sounds right.

---

## 8. CODE CONVENTIONS
- Plain ES2017 or later in IIFE or global style, matching the surrounding code. Don't add a bundler or framework.
- Use pooled `THREE.Vector3`/`Quaternion`/`Matrix4` temporaries in hot paths.
- Data-driven content: attacks go in `ATTACKS`, enemies and bosses in `PROFILES`, poses and stances in `POSES`/`STANCES`, timelines in tracks, and finishers as clip JSON.
- Keep changes local, and comment *why*, not *what*.
- Write a note for every chunk of work in `docs/chunk_<NAME>.md`.

## 9. DECISIONS ONLY CAIDEN MAKES (ask, don't choose)
1. Should the faster `CL_FASTIN` 0.12 apply to everyone or only Sere?
2. Knockback: 2.0/3.6 m/s (blueprint) or 3.0/5.0 m/s (current)?
3. Boss finale length: 3.3 s or 2.75 s?
4. Perfect-deflect hold of 0.075 s: yes or no?
5. Tier B posture and deflect tuning changes.
6. Sword kick size (the visible recoil when blades clash).
7. Gamepad remap.
8. Ilsabet scenes with boss intros: on or off?
9. Wren's line wording.
10. Should Vitality apply to enemies only?
11. Is Sere Vey's difficulty right? ("hardest duel")
12. Any Mixamo or other login-only asset site (he'd have to sign in himself).

## 10. HOW TO REPORT BACK
After each task, write to Caiden:
- **Done:** one line.
- **Proof:** tests passed/total, perf before→after, screenshot paths.
- **Changed files.**
- **Needs your call:** if anything.
- **Next:** the task you're starting.

Keep it short, honest, and readable on a phone. If something failed, say it failed and what you'll try next.

*End of handoff. Start with §4 Setup, then Task 1.*
