# Merge report: chunks A–F → `integrate` → `master`

Base `0906e58`. Merge order: A (master `dadcfc0`), B (`5a11eec`), C (`49f1861`), D (`479da34`), E (`5856ddc`), F (`dd85f82`).
`src/core.js` md5 is still `74a5299e9a45d86aaddc90e2f1831821`. The D, E and F tips merged here are those agents' WIP commits. No newer commits had landed on chunkD/E/F when this report was written.

## Conflicts and how they were resolved

| Where | Sides | Resolution |
|---|---|---|
| `src/data/region_execution.js`, Corpse Pit props (B+A vs C) | A put the posed corpse on the cart (`corpse: true`), added 2 slumped corpses and trimmed the `bodies` counts to 8/3. C added the clue body and the `notice` stake. | Kept A's cart, corpses and counts, and added C's clue body plus `notice`. B's roster (11 field foes) and C's `odran.drop = 'headkey'` auto-merged. |
| `src/world.js`, end of file (B vs C) | B extended `A.api` with `Token, AGGRO, TOK`. C added the whole `Keys` section and `A.api.Keys`. | Kept C's section. `A.api = { …, Token, AGGRO, TOK, Keys }` |
| `p_notice` (C vs D, no textual conflict) | Both chunks defined `Builder.p_notice`. D's file loads later, so it would have replaced C's Gaol Key stake with a wall board. | Renamed D's prop to `p_wallnotice` and its Stair placement to `t: 'wallnotice'` in `src/world_boss.js`. |
| `build.py` (D, E, F) | D appends `world_boss.js`, E appends the vendor post-processing scripts to `loaders`, F embeds `assets/` (textures, props GLB, Quaternius chars). | All three kept. |
| `src/world_build.js` (A vs F), 3 hunks | A: `bloodTex`, corpse system (`buildCorpses`, `p_corpse`, the corpse-gathering `p_bodies`), cart with corpse. F: asset loader, `F_PROPS`, `q()`, the new cart mesh, shroud `p_bodies`. | Kept both blocks. `build()` iterates `R.props.concat(F_PROPS)` and then calls `buildCorpses()`. A's corpse `p_bodies` wins over F's shrouds, because posed corpses replace the shrouds. `p_cart` was rewritten (next row). |
| `p_cart` (A+F) | F's Quaternius cart is 1.2 m wide with a bed at about 0.95 m. A's box cart had a 1.2 m bed. | Uses F's mesh, or F's procedural fallback until the GLB is parsed or in headless mode. Records `this.cartBedY` (0.95 for the mesh, 1.2 for the fallback). A's corpse is placed at `gy + bed`, moved 0.2 m inboard (was 0.32) so it fits the narrower bed. The sword pickup (`model.bed: true`) uses `Region.cartBedY`. Carts without a corpse (F's yard carts) keep F's shrouds at bed height. |

## Cross-chunk interactions (no textual conflict)

- **B token vs D boss fog.** They do not conflict. D's `sealArena` disengages field foes and sends them home. Its `Ents.update` wrapper keeps foes outside the sealed fog unaware. B's `Token.update` already releases a holder that leaves combat, and `tokenFree` is false while `A.boss` is set. Both run in the same frame without undoing each other. Covered by `.test/merge.js`: 0 token holds and 0 field attacks over 300 boss frames. engage.js's boss part also still passes.
- **C key drop vs D finisher and kneel prompt: real bug, fixed.** The key does drop at the body: `Keys.drop` uses `en.f` at `enemyDead`, the same spot as D's `BD.corpse`. But the stock "Kneel by the headsman" prompt at (0, 54), r = 4, was nearer than the key, so the key prompt was hidden at the body. **Fix** in C's `scanInteract` wrap: a key within 2.2 m always takes the prompt. The flow is take the key, then kneel. `boss.js` was updated to the merged truth: no auto-grant; the key lies at his body; E takes it; then the kneel; the key is kept after reload.
- **C belt key vs F Quaternius bodies.** `Keys.belts` now re-mounts when `c.model` changes, because F swaps bodies on Medium and up. On a Quaternius skeleton it rescales the mount to character scale, since the skeleton sits under F's `QScale` group.
- **E particles vs A lantern embers.** A's 5 ember sprites per lantern now run only when `!G.Parts.on()`. On Medium, High and Ultra, E's GPU buffer already emits embers from every lantern, so A's sprites stay off. If E's Guard turns particles off for the session, A's sprites come back. Low draws neither (`torchEmbers: 0`, `parts: 0`).
- **F characters vs A corpses.** Independent. A bakes corpses from the Duelist/Brother GLBs, and F only adds `q*` templates. Medium browser shot: 15 posed corpses, 0 fallback, no console errors.

## Tests (final build of the merged tree)

| test | result |
|---|---|
| ct | 72/72 |
| v8 (`dist/Veynhold_v7.html` present) | 40/40 |
| v6 | 29/29 |
| input | pass, no errors |
| p1 | 97/97 (spawn count 13, keys taken with E) |
| smoke | no errors, no crash |
| engage | 11/11 |
| keyflow | 51/51 |
| epress | PASS |
| boss | 50/50 (was 46/48 before the fixes: 2 checks assumed the old auto-granted headkey) |
| chunkE | 25/25 |
| merge (new, `.test/merge.js`) | 12/12 |

Browser check: Medium tier, Chromium with SwiftShader. F's cart mesh loaded (`QP.ready`, `cartBedY` 0.95). The sword rests at y = 0.95 and the corpse lies on the bed. No console errors.

## Open points

- D, E and F were merged at WIP commits. Any later commits on those branches still need merging.
- A `chunkA2` worktree (`/workspace/vh_wt/A2`) has uncommitted edits to world.js, world_build.js and region_execution.js. It was not part of this assignment and was not merged. Expect conflicts in the same cart, corpse and lantern areas when it lands.
- `docs/chunk_D/E/F.md` were not committed on their branches at merge time. D's doc exists uncommitted in its worktree.
- The rule that a key within 2.2 m always takes the prompt applies to all keys. A key that falls right beside a lever or door hides that prompt until it is taken.

---

# Merge 2: finished polish (A2, D, E, F, T) → `integrate2` → `master`

Base: master `8d15fc3` (chunks A–F at their WIP commits). Merged: chunkT `1ef362a`, chunkD `f0c7532`, chunkE `c9e89b9`, chunkF `b068c50`, chunkA2 `737f465`. `src/core.js` is still md5 `74a5299e9a45d86aaddc90e2f1831821`. Three.js r128, single offline file.

## Conflicts and how they were resolved

| Where | Sides | Resolution |
|---|---|---|
| `src/world_build.js` `build()` (master A+F vs F) | Master: `R.props.concat(F_PROPS)` then `buildCorpses()`. F: `this.lowB` on Low (no F dressing props, `q()` returns false so Low gets the procedural props). | F's `lowB` and its filtered prop list, plus A's `buildCorpses()`. A2's `dress` props are region props, not F props, so they stay on Low (A2 gave them Lambert twins). |
| `src/world_build.js` `p_cart` (master A+F vs F) | F restored the procedural cart's collider to its own 1.8 × 3.2 box (2.0 × 3.4). | Kept master's merged cart: F mesh, `cartBedY` 0.95 / 1.2, A's corpse on the bed, shrouds on carts without a corpse. F's 2.0 × 3.4 collider applied to the fallback branch. On Low the fallback is always used (`lowB`). |
| `src/data/region_execution.js` sword pickup (master vs A2) | Master: sword on the cart bed (`bed: true`). A2: upright in the mud. | A2's: pickup at (3.55, -72.35), model upright at (3.72, -72.78), `tilt 0.26`, `scale 1.12`, `ry -0.75`. It is about 1.4 m from the cart's long axis, outside both cart colliders. The bed-height logic stays for the corpse. |
| Corpse Pit props (master C vs A2) | Master: C's clue body and `notice` stake. A2: `dress` set `pit`. | Both. |
| `src/world.js` `Region.load` (master vs A2) | Master: `cartBedY`. A2: `crows`, `dressInfo`. | Both. |
| `.test/merge.js` | The old "sword rests on the bed" check. | It now checks A2's upright sword in the mud, the prompt point, and the A2 dressing (2 crows). 14 checks. |

D, E and T merged without conflicts.

## Step 2: clue → sergeant (UX fix)

- **Bug:** reading the order on the clue body at stage 2 set `clue_gaolkey`, but `A.objective()` only looked at the flag at stages 3 and 4. So the line stayed on "Kindle the Vigil Lantern…" until the lantern was lit.
- **Fix** (`src/world.js`, C's objectives section): at stage 2 with the clue read, the key chain takes over: *The sergeant by the gaol carries the key*, or the ground/held key lines if they apply. The sub-line adds "(Optional: kindle the Vigil Lantern at the top of the cut on the way.)". The compass mark for stage 2 follows the key: sergeant → key on the ground → door.
- **The lantern is optional and order-free.** Kindling it later only moves the stage to 3. The line stays the same and the optional note goes away. Entering the Gaol still sets stage 4. The muster gate still needs stage ≥ 3, which the gaol door (stage 5) satisfies. The key steps stay derived from state, so C's stage numbers 0–8 are unchanged.
- `A.keysPost` now refreshes when the sub-line changes as well as the title.
- **keyflow.js** reads the clue before the lantern and checks the line, sub-line, flash and stage-2 compass mark. It then lights the lantern (stage 3, same line, note gone) and checks that stage 3 without the clue still says "Find a way out". 54/54.

## Step 3/4 findings and fixes

- **Deathblow lunge solver sign (real bug, `world_boss.js` `Fin.post`).** The solver did `F.D += (e − hz)`, where `e` is the hilt-to-spine reach. When the hilt was too far it moved the attacker further away, so `F.D` ran to its 1.9 m clamp. The blade then stopped short: in the browser the field blow missed by 0.363 m, and in jsdom the field miss was 0.217 and Odran's 0.375. It is now `F.D −= (e − hz)`. Browser: boss **0.009 m**, field **0.023 m**. jsdom: 0.000 for both. New `.test/align.js` (8 checks) covers both blows.
- **shots_D.js:** run alone, `boss` replayed the first-encounter cutscene. The cutscene ate the deathblow E press and re-placed both fighters, so there was no impale capture. Now `intro_odran` is pre-set unless the mode is `cut`.
- **Cutscene composition:**
  - Shot 4 (close, he rises): the look ends at 1.9 instead of 2.25, so the helm sits on the upper third instead of mid-frame under empty fog, clear of the subtitle.
  - Shot 8 (the slam): the worm's-eye camera in front of the Block hid him behind it. It is now a low 3/4 from the side, so the whole figure and the planted blade read.
- **Finale camera, shot 1 (exit wound):** it was 1.75 m behind Odran at 1.0 m, so his armoured back filled the frame. It is now 2.3 m back and 1.6 m to the side at 1.45 m, looking at the actual exit height.
- **Stamp:** it was at `top: 42%`, on top of the exit wound. It is now at 63%, the lower third.
- **Name card:** a fast finisher hides it (`Pop.stab`). `#ncName` is now `clamp(18px, 2.6vw, 40px)`, because "ODRAN VALE, THE IRON WARDEN" ran off the right edge at 1280 px (`src/template.html`).
- **Flash:** at its 0.85 peak it washed the frame pink. The peak is now 0.72 (boss) / 0.5 (field), with softer gradient stops. It still decays as u² over 0.32 s.

## Tests (final build)

| test | result |
|---|---|
| ct | 72/72 |
| v8 | 40/40 |
| v6 | 29/29 |
| input | pass, no errors |
| p1 | 97/97 |
| smoke | no errors, no crash |
| engage | 11/11 |
| keyflow | 54/54 (was 51; new clue-before-lantern checks) |
| epress | PASS |
| boss | 50/50 |
| chunkE | 25/25 |
| chunkE_fog | 7/7 |
| merge | 14/14 |
| align (new) | 8/8 |

## D shots (`.test/shots_D.js high cut|boss|field`, Chromium + SwiftShader, 1280×720)

- `shots/D_cut1_establish.png`: good. It reads the Block, Odran and the stair head.
- `shots/D_cut2_whet.png`: good. Over the Block onto the whetting. Subtitle readable (shadowed serif).
- `shots/D_cut3_reverse.png`: good. Over the shoulder onto Wren.
- `shots/D_cut4_close.png`: fixed. Headroom corrected.
- `shots/D_cut5_slam.png`: fixed. Low 3/4, full figure and planted blade.
- `shots/D_db1_boss_impale.png`: improved. Helm and upper body over the stamp. Wren is still mostly hidden behind his bulk.
- `shots/D_db2_boss_rip_slump.png`: good. Low wide, both fighters, slump, the stamp reads.
- `shots/D_db3_field_impale.png`: good. 3/4 neck stab on a kneeling Quaternius gaoler.
- `shots/D_pop_flash_peak.png`, `D_pop_stamp_sentenced.png`, `D_pop_stamp_deathblow.png`: flash peak and both stamps forced to full, from a workspace helper, not a repo test. The stamps look like brush ink, not garish. After the softening, the flash peak keeps the scene readable.

## Open issues

- **Field neck stab:** the tip only just reaches the neck (alongBlade 0.97, tip 0.03 m past the spine). The kneeling victim's neck sits about 0.8 m below the raised hilt, so the solver's `hz` floor (0.2 m) can't bring half the blade through. It is within tolerance; a deeper pose would need a change to D's `exec_neck` track.
- **Boss impale frame:** Wren is hidden behind Odran from the exit side. A further pull-back would lose the wound.
- A2's dressing is not culled on Low by F's `lowB`. This is intended, since A2 built Low twins, but a Chromebook frame-time check on Low with the dressing on was not run.
- T's `traverse.js` and `fresh_playthrough.js` were merged but not run; they were not on the required list.
- **Other activity on the machine:** during this run, files appeared from outside this assignment: `/workspace/vh_wt/Qdoc` (branch `chunkQdoc`), `/workspace/veynhold/assets_incoming/round2/` (git-ignored, untouched), `/workspace/work/vh2/` and `/workspace/deliver/`. Load average reached about 6 on 2 CPUs. None of these are in the commits.
