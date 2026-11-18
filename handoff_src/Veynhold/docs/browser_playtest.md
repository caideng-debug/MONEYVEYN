# Veynhold — real-input browser playtest (Phase 1)

- **Date:** 2026-10-23
- **Build:** `dist/index.html` (the file dated Oct 23 12:15)
- **Script:** `.test/p1_browser.js`. The raw results are in `.test/p1_browser_result.json`.
- **How to run:** `LD_LIBRARY_PATH=/workspace/veynhold/.tools/chromelibs node .test/p1_browser.js`
- **Browser:** headless Chromium 1134 with SwiftShader (no GPU), at 1280×720. The game was set to Low quality by clicking the title screen's Quality button.
- **Input:** every action used `page.keyboard` or `page.mouse`. The `VEYN_*` hooks only read state, for assertions and for steering. No game source files were changed.
- **Result:** **10/10 steps PASS** in one full run of 245.6 s, with **0 console errors and 0 page errors**.

## Step results

| # | Step | Result | Time | Notes |
|---|------|--------|------|-------|
| 1 | Fresh localStorage, load, New Journey | PASS | 25.3 s | The page took 11.3 s to reach the title. localStorage was empty and Continue was hidden. A real click took Quality from Medium to Low, and a click on New Journey started the prologue. |
| 2 | Pass the prologue | PASS | 16.6 s | The first prologue line was on screen. Space went to `playing` in 2.3 s. Spawn was at (0, −73) in the pit, and the schema 1 save was written. About 12 fps. |
| 3 | Walk out of the Corpse Pit (WASD + mouse look) | PASS | 17 s + walk | A mouse drag turned the yaw 0 → −0.80 → 0.00, exactly as commanded. D strafed 1.7 m. The sword was taken with E from the cart (prompt "Take your sword"). The walk north left the pit for the Gravedigger's Cut (zone `pit` → `cut`). |
| 4 | Talk to Tamsin, advance and close | PASS | 20.2 s | The prompt was "Talk to Tamsin". E opened the dialogue. It took 4 E presses and 2 mouse clicks on choices to close it. Afterwards `met_tamsin` was set, the side quest was at stage 0 and the main quest at stage 1. |
| 5 | Find and rest at the first lantern | PASS (2nd attempt) | 41 s | **Attempt 1 failed:** the walk stopped at (0, −60.2), 2.7 m from the lantern, and no prompt appeared. Attempt 2 reached −59.1 and got the prompt "Kindle the Vigil Lantern". After E, the game was back in `playing` within 3.9 s with lit=[grave], lantern=grave, main=3. The step did not loop more than twice. |
| 6 | Engage a field enemy, block/deflect, damage it | PASS | 62.7 s | I approached the tutorial gaoler `y1` from behind, locked on with Q and attacked with J. Over 50 s of fighting there was **1 block and 0 deflects**, and the gaoler's health went from 70 to 54. **The player died once** and respawned at the lantern with 100 HP. 2 enemy swings were sampled, and a second gaoler joined the fight. |
| 7 | Pause menu: all tabs, volume | PASS | 22.2 s | Esc opened the menu and paused the game. All 7 tabs were clicked by mouse and each one rendered. Inventory listed Ward's Blade (equipped) and the Draughts ×3. Quests listed "Names for the Dead". Clicking the Music slider at 30% changed it from 1 to 0.28, and `veynhold_v8.musicVol` was 0.28. |
| 8 | Close, reload, Continue, persistence | PASS | 31.7 s | Esc resumed the game, then the page was reloaded. The title showed Continue ("Chapter I — The Execution Grounds · 0 min"), which was clicked. The player came back at (−0.40, −59.20), the Gravedigger's Lantern spawn. The save stores the lantern, not the exact position. The lantern, lit list, met_tamsin flag, weapon, and main and names quest stages all matched. musicVol 0.28 and quality Low also persisted. |
| 9 | Resize to 800×500 and 1366×768 | PASS | 8.5 s | Camera aspect was 1.600 and 1.779, and the canvas matched the viewport each time. W still moved the player after each resize, and there were no errors. |
| 10 | No console or page errors throughout | PASS | — | 0 / 0 over 245.5 s, across the load, the reload and both resizes. |

## Deviations and environment notes

- **Pointer lock shim.** Headless Chromium's pointer lock reports every synthetic mouse move as `movementX = +X` followed by `−X`. The two cancel out but can land in different frames, so mouse look cannot work under pointer lock here; a probe showed the yaw unchanged or jumping. The test's init script makes `requestPointerLock` reject, just as a browser that refuses pointer lock would. The game then falls back to its own drag-to-look path (`src/game.js:1774-1775`). The drags use the **middle** button so they neither attack (left) nor guard (right). This is an environment shim, not a state hook.
- **Controls source.** `src/checklist.txt` contains no "Controls" section; the grep returns nothing. I took the controls from the in-game Controls tab instead (`src/world.js:597`).
- **Setup clicks.** The Quality setting was changed to Low by clicking the title button. At Medium, SwiftShader runs at about 2 fps, which would have made a real-time input run unworkable.

## How it felt (from the screenshots and timing)

- **Frame rate.** About 10–12 fps on Low in SwiftShader. This is not representative of a real GPU, but every input still registered. Walking was smooth enough to steer with mouse drags, and each drag turned exactly the angle commanded.
- **Latency.** Space to gameplay took 2.3 s, mostly the prologue fade. Kindling the lantern took 3.9 s to return control. Each menu tab click took about 1.2 s round trip, which includes my 350 ms wait. The tabs without a screenshot took about 1.2 s and those with one about 2.5 s, so most of that is the harness.
- **Readability.**
  - **Dialogue (`pb_04_dialogue.png`):** clear serif text with a "TAMSIN · Gravedigger of the Grounds" header and an "E — continue" hint.
  - **Combat (`pb_06_block.png`):** reads well. A large "BLOCKED" word, the enemy name and its health/posture bars at the top, and a coach line: "Tap, don't hold — holding only blocks".
  - **Lantern (`pb_09_800x500.png`):** the prompt "[E] Rest at the Gravedigger's Lantern" is clear at 800×500.
- **Fight difficulty.** The bot died once against one tutorial gaoler (a second one walked in) and landed only one block in about 50 s. My poll loop is around 100–150 ms per read at about 10 fps, so it probably missed most windups. The death says more about the harness than the game's fairness, but at this frame rate a human would also see very short windups.

## Bugs and issues found

None of these are crashes or errors; they are visual or layout problems, plus one test-flow note.

1. **The HUD shows through the pause menu** (`pb_07_inventory.png`, `pb_07_volume_changed.png`). The objective text ("The yard's north gate is barred…"), the compass and the enemy's name and health bar are all readable behind the JOURNEY, INVENTORY, LORE and MAP tab labels and overlap them. At the bottom left, the "WREN — THE UNHANGED" HUD sits behind the "Control hints panel" row. The relevant CSS is `src/ui.js:18` (`#advObj` z-index 5) and `src/ui.js:38` (`#advMenu` z-index 11, radial background 0.86–0.96 alpha). At that alpha I would expect the HUD to be nearly hidden, so I have not confirmed the cause; hiding the HUD while the menu is open would fix it either way.
2. **The menu tab row wraps at 1280 px.** "SAVE & QUIT" drops onto a second line below the tabs. This comes from `src/ui.js:40-41` (`flex-wrap:wrap` with 0.2em letter-spacing and 14px padding).
3. **The dialogue box covers the player HUD** (`pb_04_dialogue.png`). The box sits on top of the player's name and health/posture bars at the bottom left. This is minor; the health bar is hidden only while you are talking.
4. **The rocks in the earth walls look like floating boulders** (`pb_04_dialogue.png`, `pb_02_spawn.png`, and also the older `it_pit.png`). Grey dodecahedra stick out up to about 0.8 m from the pit wall face at 20–110% of the wall height, and against the dark wall they look like they are hanging in the air. Source: `src/world_build.js:130`, the `style === 'earth'` branch. This is cosmetic and I would call it a judgment call rather than a hard bug.
5. **The lantern's interaction range is tight (test-flow note).** Standing 2.7 m from the lantern at (0, −60.2) gave no prompt; −59.1 did. That cost one retry in step 5. It is probably fine for a human, but worth knowing.
6. **Hardening suggestion, not a bug.** The pointer-lock path (`src/game.js:1774`) trusts `movementX/Y` with no clamp. Some real browsers also send one-off spikes, so clamping each event (for example to ±200 px) would stop the camera from snapping.

## Screenshots (`/workspace/veynhold/shots/`)

These are the 21 `pb_*.png` files: `pb_01_title`, `pb_02_prologue`, `pb_02_spawn`, `pb_03_sword`, `pb_04_dialogue`, `pb_04_choices`, `pb_05_lantern_prompt`, `pb_05_rested`, `pb_06_approach`, `pb_06_block`, `pb_06_after`, `pb_07_journey`, `pb_07_inventory`, `pb_07_quests`, `pb_07_map`, `pb_07_settings`, `pb_07_volume_changed`, `pb_08_title_continue`, `pb_08_continued`, `pb_09_800x500` and `pb_09_1366x768`.

I checked these by eye: `pb_04_dialogue`, `pb_06_block`, `pb_07_inventory`, `pb_07_volume_changed`, `pb_09_800x500` and `pb_02_spawn`. Each shows what its step expects: the Tamsin dialogue, the "BLOCKED" moment against the Gallows Gaoler, the Inventory tab with the sword and Draughts, the Settings tab with Music at about 28%, and the lantern prompt at 800×500.
