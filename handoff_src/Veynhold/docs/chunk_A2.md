# Chunk A2: opening polish (Corpse Pit + Gallows Yard)

Branch `chunkA2`, on top of chunk A (posed corpses, blood, sword model, lanterns). `src/core.js` untouched (md5 74a5299e9a45d86aaddc90e2f1831821).

## 1. Sword readability
- **Before:** the Ward's Blade lay flat on the cart bed at about 1.2 m. From about 6 m (`shots/A_after_sword_6m.png`) it was a few pixels behind the cart rail and the bodies on the bed. The glint was the only cue, and it didn't read.
- **After:** the sword is planted point-down in the mud on the cart's west side, at (3.72, -72.78), with a 15° tilt (`tilt: 0.26`), `ry -0.75`, and 1.12× scale. About 25 cm of blade sits below the surface. A small disturbed-earth disc marks where it went in. The glint now sits on the upper blade under the guard and has a brighter resting level (0.55 instead of 0.4). The halo is larger (1.3).
  - Data: `region_execution.js`, pickup `sword`: `model: { kind:'sword', upright:true, tilt, scale, x, z, ry }`. The interaction point moved to (3.55, -72.35) so the E prompt sits by the blade.
  - Code: `PropFX.sword` upright branch in `world.js` reads `def.tilt` and `def.scale` and adds the earth disc. `root.userData.sword = true` lets tests find it.
- **Checked:** `shots/A2_sword_6m*.png`, `A2_sword.png`, `A2_sword_far.png`, `A2_dress_pit.png`. In `A2_dress_pit.png` the hilt and the cross-shaped glint are clear from about 7 m across the pit.
- **Real-key pickup:** `.test/shots_A2.js` stands the player by the pickup, reads `#advPrompt` ("E Take your sword"), presses `e` through Playwright's keyboard (down, 250 ms, up), then checks that the pickup is gone and `Inv.count('wardblade') == 1`. The jsdom `p1.js` sword step, which uses the real KeyE event, also passes at the new spot.

## 2. Gallows corpse, lanterns, Low tier
- **Gallows corpse** at (-3.9, -38.7), slumped: the mesh spans y -0.01 to 1.02 and z -39.79 to -38.70, with its back 5 cm off the deck face at z -38.65. It is seated on the flagstones: no floating, no clipping into the deck. Its contact-shadow quad tucks under the deck front, where it's hidden. The cart body spans y 1.19 to 1.67 on a 1.20 bed top (1 cm sink). The wall slumps reach y -0.01. All three were measured in the browser on High.
- **Lanterns** (`A2_lantern.png`, `A2_lantern_kindled.png`, `A_low_lantern*.png`): the post sits in its plinth and the cage hangs from the arm. Nothing to fix.
- **Low** (`shots/A_low_*.png` from `shots_A.js ... low`, plus `A2_low_*.png`): 6 posed corpses and 9 shroud fallbacks, no floating. One thing noted but not changed because it belongs to chunk A's styling: on Low the shroud fallbacks read pale grey-blue (the Lambert twin's moonlit boost).

## 3. Set dressing (story, cheap)
New prop `{ t:'dress', set:'pit'|'gallows' }`, built by `Builder.p_dress` in `world_build.js`:
- **Gallows Yard:**
  - Two stools kicked over on the deck, one under a noose
  - A coil of spare rope on the deck
  - Two cut nooses dropped in the yard
  - A boot left on the drop, plus a pair of boots by the slumped body
  - A hat, a cloth bundle, two tin cups
  - A **posted writ of execution** on a notice post left of the steps: a 256×320 canvas reading "BY ORDER OF THE KING / a Writ of Execution / … HANGED AT DAWN", with a name struck through and a red seal. A torn older notice sits next to it.
  - A **crow** on the gallows crossbeam, which reads as a silhouette against the moon (`A2_dress_gibbet_crow.png`).
- **Corpse Pit:**
  - Two cut nooses
  - Odd boots, a hat, a bundle, a cup: what the dead came with
  - A tipped bucket of lime with a pale spill by the graves
  - A **crow** on a grave marker's crossbar, a few metres from the spawn
- **Crows:** one merged mesh each, about 0.4 m. They idle-bob, peck and glance around, animated only within 40 m. When the player comes within 3.2 m they take off away from the player with wing flutter and a short wingbeat-and-caw SFX (`A.sfx('crow')`), then vanish. That takes no allocations per frame.
- **Draw calls:** every dressing part in a set is merged into **one vertex-coloured mesh** (`DRESS_MAT`, no shadow casting). The writ paper is one more mesh. Static chunk count is unchanged at 199 (measured in jsdom, old vs new). Dynamic meshes went from 88 to 94: pit dress, yard dress, writ, 2 crows, sword earth disc. At most 3 of those are visible from any spot in the opening. No new lights, no new shadow casters. Low tier gets Lambert twins for the new materials through the existing `A.lowShading` map (`lowTwin()`). Only one new texture: the 256×320 writ.

## Tests (final build)
- ct 72/72
- v8 40/40
- p1 95/95
- smoke: no errors
- Browser shots: High and Low runs listed above. No console errors.

## Files
- `src/world.js`: sword upright options; crows in `Region.updateDynamic`; `dressInfo`; `crow` SFX.
- `src/world_build.js`: `writMat`, `crowGeo`, `dressMat`, `crowMat`, `lowTwin`; `Builder.dress*` and `p_dress`.
- `src/data/region_execution.js`: sword pickup data, two `dress` props.
- `.test/shots_A2.js` (new): worktree-relative paths. Args: `<prefix> [html] [high|medium|low] [all|sword|base|dress] [pickup 1|0]`.
