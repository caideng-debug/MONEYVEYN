# Veynhold — Phase 1 report: The Execution Grounds

Date: 2026-10-23. Build: `dist/index.html` = `dist/Veynhold.html` (rebuilt with `python3 build.py`).
`src/core.js` md5 `74a5299e9a45d86aaddc90e2f1831821`: the combat core has not changed since v6.
Sources: `docs/test_run.md`, `docs/browser_playtest.md`, `docs/perf.md`, `docs/baseline.md`, `src/checklist.txt`, `src/data/*.js`.

## What's implemented in the Execution Grounds

Chapter I is a connected open area that you play from the prologue through to the Hollowwood Gate.

- **Areas:** the Corpse Pit (spawn), the Gravedigger's Cut, the Gallows Yard, the Gaol, the Muster Field, the Ossuary (a secret area), the Headsman's Stair, the Block (the boss arena) and the Hollowwood Gate.
- **Field enemies:** the Gallows Gaoler, which teaches the deflect rhythm; the Penitent Jailer, with perilous thrusts and feints, which teaches Counterstep; the Chain Gaoler, with a perilous sweep and grab, who carries the Gibbet Key; and Gaol Sergeant Brask, who carries the Gaol Key. All of them run on the locked v8 combat core and its AI rules.
- **Brother Sallow, the Smiling Penitent:** a named mini-boss built on the False Brother moveset.
- **Odran Vale, the Iron Warden:** the area boss. He has 2 deathblow marks and a **phase II** with higher aggression, faster posture regen and new mix-up, charge and sweep strings. He drops the Headsman's Key.
- **3 Vigil Lanterns:** the Gravedigger's, Gaol and Stair lanterns. Resting heals you, refills your Draughts, sets your respawn point and brings the gaolers back.
- **2 shortcuts:** the Gallows Yard portcullis, opened by a lever from the far side, and the Ossuary iron gate, which only opens from the inside.
- **Quests:** the main quest (7 stages, ending at "The road to Hollowwood lies open"); **"Names for the Dead"** (Tamsin, recover 3 name-tags); and **"The Caged Crane"** (Ilsabet, free her from the gibbet cage, or leave her there).
- **NPCs:** Tamsin, the gravedigger, in the Corpse Pit, and Ilsabet Crane, Captain of the Cranes. Once she is freed and Odran is dead, Ilsabet reappears at the Hollowwood Gate.
- **Pause menu** with 7 tabs (Journey, Inventory, Quests, Lore, Map, Settings, Controls), plus Save & Quit.
- **Saves:** versioned saves (schema 1 under `veynhold_v8`) with a backup copy, and migration from older v6/v7 settings keys. Continue restores you to the last lantern.
- **Starting sword:** Ward's Blade, taken from the cart in the Corpse Pit.
- **3 permanent upgrades:** Ember Vessel (+1 Lantern Draught), Penitent's Tithe (each deathblow restores 15% health) and Warden's Yoke (+20% maximum posture).

## Fixes this session

- **Boss finisher in world mode.** A world boss's final deathblow now plays the finisher cinematic in the open world. Any field enemies still alive elsewhere are frozen in core hit-stop until it ends (`src/world.js`, the `cineHeld` set). Brother Sallow gets the finisher too.
- **Ilsabet** now leaves with a fading exit instead of popping out of the scene.
- **UI:** the HUD is hidden while the pause menu is open and during dialogue. The menu tabs now fit on one row (no wrap; they scroll if needed). Interact radii are wider, which fixes the lantern prompt not appearing at 2.7 m. Pointer-lock mouse events larger than ±200 px are dropped, so a one-off spike can't snap the camera.
- **Performance** (headless SwiftShader, so relative numbers only): Low runs about **2.1–2.5x** faster and Medium about **1.8x** faster. High is about 1.1x. The gains come from render scale, shadow map size, light count, per-tier fog and cull distances, sphere-based chunk culling, separate merging of shadow casters, merged repeated props, Lambert scenery on Low, far-AI sleep and zero per-frame allocations in the hot loops. Details are in `docs/perf.md`.
- **Art:**
  - The pit-wall boulders are now set into the wall instead of floating.
  - Closed gates were invisible because of a NaN in the animation target. They now render.
  - Corpse heads floated beside their bodies because of a wrong axis sign. They now sit on the body.
  - The boss-arena ring is now a dark inlay instead of a glowing white band, and the z-fighting is gone.
  - Horizon silhouettes are now unlit dark shapes instead of pale "pyramids", and they are never culled.

## Verification

**Automated** (headless; `.test/*.js`): ct 72/72 · input 42/42 (errors none) · v5 11/11 · models 27/27 · v8 40/40 · smoke clean (6 encounters, restart ×5, no leaks, no crash) · v6 29/29 · p1 95/95.
The morning test run (`docs/test_run.md`) recorded p1 88/88. The 95/95 figure is from the final build after the perf/art pass (`docs/perf.md`).

**Real-input browser playtest:** 10/10 steps PASS in 245.6 s with 0 console errors and 0 page errors (`docs/browser_playtest.md`). It ran in headless Chromium 1134 with SwiftShader at Low quality. Every action was a real keyboard or mouse event: New Journey, the prologue, leaving the pit, the sword, Tamsin's dialogue, the first lantern, a field fight, every menu tab and the volume slider, reload and Continue with persistence, and two resizes. Pointer lock was shimmed off, so mouse look used the drag fallback. The HUD-through-menu, tab-wrap and lantern-radius issues it found are fixed above.

**Unverified:**
- Real Chromebook performance (all fps figures are from SwiftShader).
- Real pointer-lock mouse look (shimmed in headless).
- A full human playthrough from the prologue to the Hollowwood Gate, including feel and difficulty.

## Known issues

- The Ossuary back wall still reads dark, despite the added bounce light.
- On Low, the player character reads as a black block.
- Key rebinding is not implemented: the Controls tab is a static list.
- The compass/map east-west convention has not been checked visually.
- The main path's time budget is short: the critical path to Odran is brief for a full chapter.

## Licences

| Asset | Source | Licence |
|---|---|---|
| Animation clips (sword combos, locomotion, idle): Quaternius **Universal Animation Library** and **Universal Animation Library 2** | OpenGameArt (opengameart.org/content/universal-animation-library, …-library-2), quaternius.com | **CC0 1.0** (the bundled License.txt in each pack says so) |
| **Three.js r128** (`three.min.js`, header `REVISION "128"`) | three.js | **MIT** |
| GLTFLoader.js and SkeletonUtils.js (`src/vendor/`, from the Three.js r128 examples) | three.js | **MIT** (SPDX header in each file) |

Everything else is procedural or original. A grep of `src/` and the built `dist/index.html` found:
- **No external URLs.** The only `http(s)` strings are comments in Three.js and GLTFLoader (Khronos specs, GitHub issues).
- **No asset file references and no loaders.** There are no image, audio, font or model file references, no `fetch`, `XMLHttpRequest`, `TextureLoader`, `<img src>`, CSS `url()`, `@font-face` or `<link>`, and no base64 data URIs in the hand-written sources.
- **Characters:** the 5 GLBs (Wanderer, Duelist, Iron Warden, False Brother, King's First Blade) are generated by `models/build_models.py` (numpy, pygltflib and Pillow). Their small weathering textures are drawn in code; nothing is loaded from disk. World-mode foes and NPCs reuse these meshes with colour tints. The skeleton uses Mixamo-style *bone names* only; no Mixamo assets are included.
- **Textures:** world and arena textures are canvas and DataTexture surfaces generated at runtime.
- **Audio:** all sound is synthesised with WebAudio (oscillators and generated noise buffers). There are no samples.
- **Fonts:** system font stacks only (Georgia, Palatino, system-ui and so on). Nothing is embedded or downloaded.
- **Animation data:** `src/anim_data.json` holds only joint rotations retargeted from the Quaternius clips. No Quaternius meshes are included.

The in-game credits line ("Animations by Quaternius (CC0)… Three.js r128 (MIT)") already matches. See `docs/LICENSES.md`.
