# Chunk G2: the boss-arena flag, invisible items, Corpse Pit bodies

Branch `chunkG2` (from master a0cd034). This implements `docs/vh_fixplan.md` sections 2, 3 and 4. `src/core.js` is unchanged (md5 74a5299e9a45d86aaddc90e2f1831821). The boss cutscene cameras, the `world_boss.js` deathblow code and the Ilsabet code are untouched.

## 1. The "flag" at the execution block (section 2)
- **Axe removed.** `world_build.js` `p_greatblock` no longer adds the darkwood pole or the flat 0.7 × 0.45 iron "head". The block, the plinth and the collider are kept. Odran's own planted blade is now the only weapon in the shot.
- **Six banners on the ring wall.** There is a new `p_wallbanners` prop, and the region data has `{ t: 'wallbanners', x: 0, z: 50, a: [±1.25, ±1.85, ±2.45] }`. Placement:
  - They hang at those angles, away from the north (behind Odran in the establishing shot), away from the south opening, and clear of the statues at ±0.785.
  - Each one sits 0.3 m off the inner face of its own wall segment and is turned parallel to that segment. Section 2 of the plan used a fixed radius of 14.6, but that would have put them *inside* the 0.9 m wall, whose inner face is at r ≈ 14.42–14.55.
  - The centre is 3.3 m above the Block floor, so each banner spans 3.8–6.4 m, under the 7 m wall top.
- **Banner mesh and material.** All six are merged into one mesh in `Region.dyn` (`wallBanners`), so they cost one draw call and cast no shadow.
  - The material is `MATS.bannerSway`: the duel arena's sway shader on a clone of `MATS.banner`.
  - It is defined *before* the `_twin` loop, so its Low Lambert twin keeps `alphaTest`, `transparent` and `DoubleSide`. On Low it is static and keeps the tattered cut-outs; it never renders as black rectangles.
- **Statue bars dropped.** Also from the plan: the 3.4 m iron bar beside each statue (`p_statue`) read as a pole in cut 2 (`G2_low_cut2_whet` before the fix), so it is gone. The statues are unchanged.

## 2. Items (section 3)
- **`PropFX.item(def, gy)`** in `world.js` builds every small pickup as **one vertex-coloured mesh plus one faint glint sprite**. That is 2 draw calls, the same as the old 2-sprite wisp. It returns `{ root, glint, halo: null }`, the same contract as `sword()`. The kinds:
  - `tag`: a tin strip with a punched hole, scratched letters and a twine cord loop plus a loose end, lying on a linen scrap. Scaled ×1.6.
  - `tithe`: an iron dish heaped with 7 coins, with a short chain.
  - `key`: uses `Keys.makeMesh`.
  - `flask`, `pouch`, `scroll`: procedurals for later use.
- **Material.** The shared material `PropFX.M().item` is Standard, rough 0.55, metal 0.25, with a faint emissive, and has a Lambert twin.
  - The palette is kept as dark as the scenery. The photo floors have about 0.05 albedo, and the first pass looked white next to them.
  - Merging is done by a new local `mergeColored()`.
- **Region data:**
  - `tag_pell`, `tag_ilke`: the mesh sits on the pickup point.
  - `tag_jory`: on the ground at (44.2, 26.9) by the crates.
  - `tithe_altar`: the dish is on the altar cloth at y 1.06.
  - The wisp branch is now a last-resort fallback only, at scale 0.45 and opacity about 0.3; no region pickup uses it.
- **Low variants, so nothing renders black:**
  - `PropFX` steel, darkSteel, leather and brass, and `Keys.mat`, are now registered in `mats()._twin` with Lambert twins:
    - steel `0xc4ccd6`
    - key `0x9a907e`, emissive `0x1a1206`
  - When the tier has no env map (Low and Medium), the metals drop to half-metal: steel 0.45, darkSteel 0.4, brass 0.45, key metalness 0.45 / roughness 0.5. This is `PropFX.metalTune()`, called from `sword()` and `A.applyTier`.
  - `Keys.mat` is now created once per session instead of once per region. `Keys.makeMesh` picks the twin directly on Low, because keys dropped after the tier was applied would otherwise miss the swap.
- **Fainter glows:**
  - Sword glint: 0.3 + 0.35·twinkle (was 0.55 + 0.45). Halo: 0.12 + 0.04·sin (was 0.2 + 0.06).
  - Item glint: 0.06 + 0.3·twinkle.
  - Dropped-key glint: 0.15 + 0.3·tw³ (was 0.22 + 0.5·tw³). The key's warm pool now uses its own material at 0.5 opacity; the lanterns keep the shared `glowPool`.
  - Note wisps: scale 0.35 (was 0.55), opacity 0.25 + 0.1·sin, core 0.1 at 0.4.
- **Hymn note.** It had no prop under it. The existing `carving` slab is now set into the Ossuary west wall at (34.52, -40.5), and the note point moved to (35.1, -40.5) in front of it.

## 3. Corpses (section 4)
- **Data:**
  - The two `bodies` groups (n=8 and n=3, the 11 random bodies) are deleted.
  - The clue body under the Gaol-Key order is now a fixed posed corpse: `{ t: 'corpse', pose: 'prone', x: -2.6, z: -63.2, rot: 0.4, prio: 2 }`. It is shifted 0.45 m sideways from the plan's (-3, -63) because at that spot the notice stake went straight through its back (first Medium shot). It now lies beside the stake.
  - 4 placed posed bodies were added (prio 3, `check: true`):

| Pose | x | z | rot | Note |
|---|---|---|---|---|
| supine | -2.2 | -71.4 | 1.1 | |
| side | 1.6 | -68.6 | -0.7 | |
| prone | **-3.1** | **-66.6** | 2.6 | moved from the plan's (-4.6, -66.4) |
| supine | 3.4 | -65.6 | -2.2 | |

- **Placement check.** `buildCorpses` now runs the same `corpseFits` test (pit rect −0.95 m, every keep-out, the other placed bodies) on every request flagged `check`, using its real baked box, and records failures in `corpseInfo.misfit`.
  - The plan's (-4.6, -66.4) failed: it was 0.85 m from Tamsin's 1.4 m keep-out circle. I searched for a fit with a box 10% larger than the default and moved the body to (-3.1, -66.6).
  - All 4 pass in headless (default box) and in Chromium (baked boxes): `misfit: []`.
- **Budget** is `Low ? 9 : 14`. Gibbet huddles are skipped on Low, which leaves an empty cage. Request counts:
  - Low: 9 requests (cart, 2 pit slumps, clue body, 4 placed, gallows slump) → **9 posed, 0 shrouds**.
  - Medium: 11 requests (adds the 2 gibbets) → **11 posed, 0 shrouds**.
- **Shrouds** now appear only when the models failed.
  - They are merged into one dyn mesh, `corpseShrouds`, instead of being folded into the statics, so they can be removed.
  - The Low twin colour is set explicitly to `0x2a241d`: dark wrapped cloth, not pale grey-blue.
- **Late-model rebuild.** `Region.rebuildCorpses()` removes the `corpses`, `corpseShadows` and `corpseShrouds` meshes from `Region.dyn` and re-runs `buildCorpses` on the saved Builder (`Region._B`), restoring its keep-out list first so it doesn't double up. It then re-applies the tier.
  - `Region.load` arms a wait when the region was built before the character GLBs were parsed (`corpseInfo.models === false`, not headless).
  - `updateDynamic` polls `A.Corpses.ready()` twice a second for at most 2 minutes and rebuilds once.
  - There is no `game.js` change. Verified in Chromium: a forced rebuild keeps the same counts and the same 10 meshes.
- **Tests:** `merge.js` checks the new truth (5 new checks):
  - 11 requests, no scattered groups, 4 checked bodies all fit, budget 14
  - Low: 9 requests, budget 9
  - the clue body is a fixed corpse
  - all 5 pickups have a real mesh
  - the wall banners exist

  `p1.js` has no body counts (its only mention of the Corpse Pit is the spawn check), so it needed no change.

## Draw calls, Low: before (master a0cd034) vs after
Whole-frame calls, the minimum over 4 frames, at the same free-camera views (`.test/shots_G2.js <prefix> <html> low 0`), with the boss trigger stubbed so no cutscene runs.

| View | Before | After | Δ |
|---|---|---|---|
| pit_wide | 168 | 167 | −1 |
| pit_wide2 | 83 | 81 | −2 |
| pit_clue | 71 | 70 | −1 |
| pit_bodies_w | 99 | 97 | −2 |
| pit_bodies_e | 54 | 52 | −2 |
| pit_cart | 48 | 42 | −6 |
| pit_slumps | 72 | 71 | −1 |
| gallows_slump | 114 | 114 | 0 |
| gibbet | 39 | 38 | −1 |
| tags (pell, ilke, jory, jory 5 m) | 21 / 19 / 29 / 30 | 21 / 19 / 29 / 30 | 0 |
| tithe | 25 | 25 | 0 |
| sword | 47 | 41 | −6 |
| dropped key | 30 | 30 | 0 |
| hymn_carving | 119 | 119 | 0 |
| arena_wide | 55 | 56 | +1 |
| arena_wide_back | 168 | 169 | +1 |

The largest increase is +1 (the banner mesh). Low triangles go up by about 6k in views that include the corpse mesh, because there are 9 posed bodies instead of 6 posed plus 9 shrouds. That is vertex work only. The merged corpse mesh spans the pit and the gallows, as it did before, so distant views that touch its bounding sphere draw it whole. Splitting it per chunk would be a possible later improvement.

## Tests
`ct` 72/72 · `v8` 40/40 · `p1` 97/97 · `keyflow` 54/54 · `merge` 19/19 · `smoke`: no errors, no crash, self-tests 72/72.

Every Chromium run of `shots_G2.js` logs one console error, `Character.clipLayer … reading 'look'`. The unmodified master build logs it too under the same script, so it comes from the script's harness (enemies frozen and moved away, Wren hidden) and not from this chunk.

## Shots (`shots/`, Medium and Low)
`G2_{med,low}_` + `pit_wide`, `pit_wide2`, `pit_clue`, `pit_bodies_w`, `pit_bodies_e`, `pit_cart`, `pit_slumps`, `gallows_slump`, `gibbet`, `item_tag_pell`, `item_tag_ilke`, `item_tag_jory`, `item_tag_jory_5m`, `item_tithe`, `item_sword`, `item_key`, `hymn_carving`, `arena_wide`, `arena_wide_back`, `cut1_establish`, `cut2_whet`, `cut3_reverse`.
