# Chunk C: the keys are clear and real

## Progression (what gates what)
- **Main path from the opening:** Corpse Pit → Gravedigger's Cut (first lantern) → Gallows Yard. The yard's north portcullis (`yardgate`) is barred from the far side. Its lever stands in the Muster Field, so from the yard the way on is through the Gaol. The Gaol's north door (`gaoldoor`, `how: item:gaolkey`, at x −56…−50, z −12) opens onto the Muster Field. **The Gaol Key is the key that gates the main path.** The Ossuary breach plus the iron bar (`ossgate`, side-opened) is a secret bypass, not the intended route.
- **Gaol Key:** carried by Gaol Sergeant Brask (`g3`), standing at (−43, −25.5) in the Gaol office, by the new Gaol fire (a brazier at −40.8, −23.4).
- **Headsman's Key:** carried by Odran Vale (`odran`), the region boss on the Block (0, 50). It opens the Hollowwood Gate (`hollowgate`, `item:headkey`), which ends Chapter I. Before this chunk it was not dropped at all: `endBoss` silently did `Inv.give('headkey')`, and `A.start` re-gave it on load.
- **Gibbet Key (`cagekey`):** dropped by the Chain Gaoler `m1` (Muster Field). It is used on Ilsabet's cage in a side quest.

## What changed
1. **Keys are real 3D items** (`Keys` section at the end of `src/world.js`).
   - On a carrier's death, his key drops at the body as an iron key model: ring bow, collar, shaft and a two-tooth bit, merged into one mesh. It has a faint glint sprite and a warm floor glow, and it turns and bobs slowly. That is 3 draw calls per key on the ground and 2 per key on a belt, with no per-frame allocations.
   - E within 2.2 m shows "Take the Gaol Key" (or "Take the Headsman's Key" / "Take the Gibbet Key"). Taking it plays a pickup sound plus a key chime, fires a spark, flashes a gold screen glow, shows the card **GAOL KEY — Opens the gaol door**, and toasts "Added to inventory".
   - The pause **Inventory** tab now has a *Keys* section with an SVG icon, the key's use and its description. Other items get icons too.
   - **Persistence:** `save.drops[item] = {x, z, from}` while the key lies on the ground; `collected.drop_<foe>` marks that the foe has dropped it; `collected.key_<item>` marks that it was taken. A key never auto-vanishes. It survives death, resting and reload until taken, and it is never duplicated: a respawned sergeant carries no second key. Old saves that recorded a felled Odran but no key get the key placed on the Block.
2. **The pickup bug** (root cause, reproduced in `.test/epress.js` and covered by `.test/keyflow.js`):
   - `A.preIntent` honoured an interaction press only if `p.canAct()` held on that exact frame. Otherwise the press fell into the v8 deathblow buffer and expired. So pressing E while still recovering did nothing: mid-jump, landing, a dash, or the end of the deathblow on the sergeant. On the pre-fix build, `.test/epress.js` (E mid-jump beside the sword) **FAILS**; on this build it **PASSES**.
   - **Fix:** the press is held for up to 0.9 s and used on the first frame the player can act. A deathblow still wins.
   - Also, `scanInteract` hid every prompt while any foe was engaged within 7 m. After killing Brask, the jailers who group-engage stood on the key's spot, so the key could not be taken. **Fix:** a key on the ground can always be taken. The old keys were never items at all: `onKill` silently `Inv.give()`d the drop with a delayed "Taken from the body" card, and it pushed the main quest to stage 5 ("climb the Headsman's Stair"), so the HUD and compass pointed away from the locked door.
3. **Where to get it:**
   - **Clue:** a body in the Corpse Pit with an order nailed to a stake (new `notice` prop and the `order` note at −3.3, −63.5, plus a one-time hint). It reads: "The sergeant keeps the gaol key on his belt — he drinks by the Gaol fire."
   - Brask and Odran **wear their keys on the belt.** The key mounts to the GLB Hips bone (or the procedural hips before the model loads) and disappears once the key has dropped.
   - **Objective line, tied to the real state** (`A.objective()`):
     - stage 3: *Find a way out of the Execution Grounds*
     - after reading the clue, or at stage 4 (entering the Gaol): *The sergeant by the gaol carries the key*
     - key on the ground: *Take the Gaol Key from the sergeant's body*
     - key held: *Gaol Key acquired: unlock the gaol door*
     - door opened: stage 5, *Cross the Muster Field and climb the Headsman's Stair* (the sub-line says Odran wears the next key)
     - stage 6: *Defeat Odran Vale* (he wears the Headsman's Key)
     - stage 7: *Take the Headsman's Key from Odran's body* → *Headsman's Key acquired: open the Hollowwood Gate*
   - **HUD:** a compact top-left line with a sub-line, plus an "OBJECTIVE UPDATED" gold flash and a chime when it changes. The pause menu Journey tab opens with an **Objectives** section: current objective, open side quests, and any key lying on the ground.
   - **Compass:** the objective mark follows the key: the sergeant, then the key on the ground, then the door.
   - **Locked doors** name their key and say where it is. The prompt reads "Locked — needs the Gaol Key". The message reads "Sergeant Brask carries it on his belt, by the fire in the Gaol office", or "…lies with Sergeant Brask's body…" once dropped. The Hollowwood Gate works the same way for the Headsman's Key.
4. **Quest wiring:** taking the Gaol Key no longer sets main stage 5. Opening the gaol door does (entering the Muster Field still does too). The stage 3 and 4 texts in `content.js` are now the chain's lines.

## Files
- `src/world.js`: the drop hook in `onKill`; `endBoss` and `A.start` no longer auto-grant the headkey; the E-press hold in `preIntent`; one hook line each in `A.post` and `renderMenu`; the new `Keys` section with objectives, menu extras, wraps of `scanInteract`, `readLore` and `openGate`, and dynamic `objectiveMarks` and `locked` getters.
- `src/data/region_execution.js`: `odran.drop = 'headkey'`, the clue note and hint, the `notice` and corpse props, the Gaol brazier, and the locked texts.
- `src/data/content.js`: `use` / `where` on the key items, the `order` lore, and the stage 3/4 texts.
- `src/world_build.js`: the `p_notice` prop.
- Tests: `.test/keyflow.js` (new, 51 checks), `.test/epress.js` (new regression), `.test/shots_C.js` (screenshots), and `.test/p1.js` (keys are now picked up with E; it takes the headkey before kneeling).

## Tests (this worktree)
- `node .test/keyflow.js`: **51/51** (fresh start → clue → objective updates → belt key → locked-door message → kill the sergeant → key visible, turning, saved → death and reload keep it on the ground → no prompt past 2.2 m → prompt with a foe engaged nearby → E mid-jump honoured → inventory, card and flash → Inventory icon and Objectives menu → door opens, stage 5 → death, re-kill and reload stay consistent → headkey chain → old-save safety → no console errors)
- `node .test/epress.js`: PASS (FAIL on the pre-fix build)
- `node .test/p1.js`: 97/97 · `node .test/ct.js`: 72/72 · `node .test/v8.js`: 40/40 · `node .test/smoke.js`: no errors · `src/core.js` md5 unchanged.

## Notes / judgment calls
- I kept the main quest's stage numbers (0–8), so other chunks and tests stay valid. The finer key steps are derived from save state (drops, inventory, flags, opened gates) rather than added as new stages.
- If the player reads the clue before kindling the first lantern, the objective shows the sergeant line as soon as stage 3 begins.
- With a foe engaged within 7 m, other interactions are still suppressed; only keys are exempt.
