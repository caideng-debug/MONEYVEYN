# Veynhold — handoff for GitHub Copilot

Veynhold is a third-person, Sekiro-style posture/deflect action game in **plain JavaScript with Three.js r128**. It builds to **one offline, self-contained HTML file** that must run smoothly on a **school Chromebook**: no install, no server, no Itch or Godot.

Read AI_HANDOFF_SCRIPT.md first. Current state: branch `integrate6` (commit a8b1577). Every test suite passes except `blade_H2` (82/86; the 4 known block-rig fails).

## Build and run
```
python3 build.py                     # inlines src/, three.min.js, assets/, assets_incoming/ into dist/index.html
cp dist/index.html dist/Veynhold.html
```
Open `dist/Veynhold.html` straight from disk (file://).

## Folder map
| Path | What it is |
|---|---|
| `src/template.html` | HTML shell that build.py fills |
| `src/core.js` | **Deterministic combat core**: fixed-tick sim, posture, deflect, timing tables. Protected: change it only through an approved proposal. Approved md5 `8b20b83611f0ffb143934b32e055d5dd`. |
| `src/game.js` | Main loop, renderer and quality tiers (Low/Medium/High/Ultra), input, audio engine, HUD glue, VFX pools |
| `src/deathblow6.js` | Current deathblow system: clip-driven animation for both fighters, a one-time alignment, push-off and separation, movement release at 1.15 s, corpse floor settle, 6 audio variants |
| `src/world_boss.js` | Finisher camera and blade, boss and gaoler encounters, key/corpse logic, E-prompt |
| `src/world.js`, `world_build.js`, `world_combat.js`, `world_scenes.js`, `world_surfaces.js`, `world_audio.js` | Execution Grounds region: layout, colliders, enemies in the world, scenes, footsteps, ambience |
| `src/data/region_execution.js`, `src/data/content.js` | Region prop data and game content (enemies, text) |
| `src/anim.js`, `anim_data.json`, `models.js` | Procedural and skinned animation, 15-joint rig, model loading |
| `src/ui.js`, `ui_access.js` | HUD, menus, accessibility options |
| `src/vendor/` | Vendored libs |
| `assets/` | Textures (≤1K), GLB characters and props (Quaternius CC0), pack tools |
| `assets_incoming/deathblow_clips/` | 8 deathblow clips + 4 break poses (JSON), LICENSES.md |
| `assets_incoming/deathblow_audio/` | 31 CC0 synthesized layers + `cues.json` |
| `models/` | Model build/preview scripts |
| `docs/` | Design and chunk notes. Start with `chunk_INT6.md`, `chunk_DB6.md`, `world_audit.md`, `deathblow_direction.md`, `perf_deathblow.md`, `story_bible.md`, `research/` |
| `.test/` | Playwright/Node test suite (see below) |
| `.v8/` | Older reference snapshot used by the v8 test |

## Hard rules (please keep)
1. **Chromebook first.** Low and Medium must never get slower than before. No new per-frame allocations, few draw calls, textures ≤1K, shadows only where the tier already allows them.
2. **Offline single file.** No CDNs or network fetches at runtime. Stay on Three.js r128.
3. **Don't edit `src/core.js` casually.** Combat timing lives there. Propose changes with numbers first.
4. Every asset must be license-safe (CC0 or royalty-free) and logged in a LICENSES.md.
5. Deathblows: impact at about 0.32 s, presentation slow-mo only (the sim never slows), never glue the bodies together, both fighters animate continuously (no frozen poses), bodies separate about 2 m by unlock, movement returns at 1.15 s.

## Tests
These need Node with `playwright-core` and Chromium. **The test files hardcode `/workspace/veynhold/...` paths**, so point those at your own folder first, e.g.:
```
sed -i "s#/workspace/veynhold/#$PWD/#g" .test/*.js
```
Main suites: `ct.js`, `v8.js`, `p1.js`, `smoke.js`, `deathblow_seq.js`, `db6_motion.js`, `boss.js`, `ui_I3.js`, `audio_I4.js`, `i1_self.js`, `determinism.js`, `mechanics_H4.js`, `audio_H2.js`, `blade_H2.js`. World layout audit: `world_audit.js audit|shots|perf`.
`v8.js` also needs older builds (`dist/Veynhold_v6.html`, `_v7`, `_v8_combat`, `_pre_repair`), which aren't included. Skip it if they're missing.

## Open work (next up)
1. **Odran Vale's death:** his `crown_splitter` clip ends lying on his side, so he lies through his last words. He should end kneeling (still breathing), then topple after the words, finishing in the floor settle. Also make the "slumps to his knees" boss check read the real pose, not just the rig's rotation.
2. **Low-tier cost:** `Character.update` is about +0.3 ms/frame over the old master on Low (introduced in INT5). Bring it back to parity.
3. **Core bug:** in `core.js`, `enemyPostureFromBlockedHit` and `enemyPostureFromDeflectedHit` sit inside a comment, so blocked hits give NaN posture. `game.js` works around it. The fix is to move them into CONFIG and remove the workaround (an approved core change).
4. **Core proposal** (docs/chunk_DB6.md): allow movement natively from 1.15 s, add attacker root motion, and launch at 1.7–1.9 m/s in the core.
5. `blade_H2`: 4 block-rig test failures.
6. Look pass (docs/world_audit.md): walls in shadow read flat in fog, tents are pale on Medium, distant towers read as monoliths, the notice papers are blown out.
7. Kingsfall (the 2.75 s king finale) is designed in `docs/deathblow_direction.md` but not in the game yet.
8. Open design choices the owner hasn't settled: knockback strength, the perfect-deflect hold, gamepad remap, and boss finale length.
