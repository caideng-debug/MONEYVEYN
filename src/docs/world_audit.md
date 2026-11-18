# World layout audit — chunk WORLD (Execution Grounds)

Branch `chunkWORLD`, from `integrate5` 22496cf. Scope: prop placement, contact and colliders in the Execution Grounds. Combat code, `src/core.js` and the deathblow code are untouched.

## Fixes (13)

| # | Where | Problem | Fix | File |
|---|-------|---------|-----|------|
| 1 | Ossuary floor candles | Sat on Sallow's duel spot (47,-30) | Moved to the altar's north-west corner (51.4,-24.6) | region_execution.js |
| 2 | Ossuary altar candles | Sank into the altar block | Moved to the altar's foot with a tight 0.5 m spread (new `p.s` spread and `p.y` base for `p_candles`) | region_execution.js, world_build.js |
| 3 | Ossuary torch | Stood in the middle of the doorway (35,-28) | Moved to the wall beside it (34.8,-31.1) | region_execution.js |
| 4 | Gaol stores | Crates and barrels clipped the corridor-end walls | Nudged 0.15–0.4 m clear | world_build.js (F_PROPS) |
| 5 | Bone walls | Every skull was a whole ball sticking 16 cm out of the wall | Skulls set into the face (flattened, wall-rotated) | world_build.js `seg` bone |
| 6 | Brazier | Collider was 3 m tall and blocked sight, so it blocked the deathblow camera like a pillar | Collider height 1.1 m (the brazier's real height), `sight:false` | world_build.js `p_brazier` |
| 7 | Grave markers | Crossbars stayed level and slid off tilted posts | Crossbars lean with their posts; the Cut's crow perches on the leaning bar | world_build.js `p_graves`, Cut dressing |
| 8 | Grave markers | Had no collider (you could walk through them) | 0.12 m deco circle collider, no cam/sight block | world_build.js `p_graves` |
| 9 | Weapon racks | Rails hung in the air | Two end posts | world_build.js `p_rack` |
| 10 | Wagons | Had no collider (you could walk through them) | 3.4×1.7 m `low` box collider (vault with Space, as the pen hint says), no cam/sight block | world_build.js `p_wagon` |
| 11 | Bone piles | Skulls floated above the floor | A mound of bone dust (`bonef` hemisphere, 0.55 m) with the skulls and long bones resting on its surface | world_build.js `p_bonepile` |
| 12 | Ossuary skull wall | Rows floated 0.34 m up and 9 cm off the stone | Stacked from the ground in offset rows against the wall face (`p.off` override) | world_build.js `p_skullwall` |
| 13 | Headsman's Stair | The wall notice was inside the tower (z 29.62) and the carving was inside the stair wall (x -3.93) | Notice on the tower face (z 29.15); carving proud of the wall (x -3.5) | world_boss.js (prop data only) |

## Audit tool

- `.test/world_audit.js <audit|shots|perf> [quality] [tag] [html] [filter]` runs in headless Chromium (swiftshader). It always needs `LD_LIBRARY_PATH=/workspace/veynhold/.tools/chromelibs` and `flock /tmp/vh_browser.lock`. Paths are relative to the worktree, so no sed is needed.
  - `audit` uses the page script `.test/world_audit_page.js` and writes `.test/world_audit_<q>.json`. It checks prop ground contact, floating parts, floor against the height field, colliders against mesh footprints, wall-end gaps, nav reachability of every interactable, interact crowding, tall clutter and camera blind spots at kill spots, lantern and gate ground, and NPC zones. It also runs a key-driven collision walker over 8 routes.
  - `shots` takes a free-camera survey of every area and interactable and writes `shots/world/<tag>_<q>_<view>.png`.
  - `perf` measures the median and p90 frame time, draw calls and triangles at 6 fixed stations (960×540, enemies alive). It appends to `.test/world_perf.jsonl`.
- `.test/world_probe_palisade.js [html]` counts the merged static vertices above 1 m in 1 m bins along the west palisade (x=-58).

## Results

**Tests on the final build** (dist/index.html = dist/Veynhold.html):
- ct 99/99, v8 40/40, p1 97/97, smoke clean (no errors, restart and pause OK).
- boss 47/50. The same 3 checks fail on the untouched integrate5 build (/tmp/vh_world_base.html): field-finisher hit-stop, Headsman's Key at Odran's body, and the "Kneel by the headsman" prompt. They are in deathblow/finisher code, outside this chunk, so they were not touched here.

**Frame time, Low tier** (median ms / p90 ms / draw calls). The values are quantised to vsync steps under swiftshader.

| station | master 35b4f5e | integrate5 base | WORLD after |
|---|---|---|---|
| pit | 50 / 66.7 / 210 | 50 / 66.7 / 209 | 50 / 66.7 / 209 |
| yard | 33.3 / 50 / 180 | 33.3 / 50 / 179 | 33.3 / 50 / 179 |
| gaol | 33.4 / 50 / 144 | 33.3 / 50 / 147 | 33.3 / 50 / 147 |
| muster | 33.3 / 33.4 / 163 | 33.3 / 33.4 / 166 | 33.3 / 33.4 / 166 |
| block | 33.3 / 50.1 / 127 | 33.3 / 33.4 / 126 | 33.3 / 33.4 / 126 |
| oss | 33.3 / 33.4 / 87 | 33.3 / 33.4 / 90 | 33.3 / 33.4 / 90 |

- Low is no slower than master at any station.
- WORLD adds 0 draw calls over the base, because the new meshes merge into the static batches. It adds at most ~380 triangles (the bone mounds, rack posts and tilted crossbars).
- WORLD adds no per-frame code.

**Palisade:** The west palisade at x=-58 has no real hole. Every bin from z=-12 to 29 has 122–141 merged vertices above 1 m, z 5–17 included. The collider segment covers the full length. Nothing was changed.

**Audit leftovers** (from the Nov 10 audit JSON, which is still valid):
- `pickup tag_jory` shows as "unreachable". This is a nav-field artefact: the tag is in the wagon pen, which you enter by vaulting the low wagon colliders. The `wagon_pen` walker route reaches it.
- 5 wall-end gaps of 0.1–0.4 m: the gaol bars end and the stair/Block corner joints. They are not walkable.
- The camera blind spots at gaol kill spots (g1, g3, g5) and o1 are the corridor walls themselves. This is by design.

## Proposals (not done here)

1. **Fog-flat walls.** On Low, distant stone walls fade to a flat fog-grey slab. A cheap vertical gradient or a darker fog colour near the base would bring back depth for free.
2. **Pale tents on Medium.** The Muster tents (`M.cloth`) blow out to near-white under the Medium light rig. Lower the cloth albedo or emissive for Medium only.
3. **Monolith towers.** The corner and stair towers read as plain boxes. Adding a crenellation band and a slight batter (taper) costs about 2 merged meshes per tower.
4. **Blown-out notices.** The paper material's emissive (0x1a140a) plus torchlight clips the notices to white up close. Cut the emissive or scale it by tier so the text texture stays readable.

## Before/after shots

Curated pairs are committed in `shots/world/` (Low tier): bonepile, rack, graves, skullwall, wallnotice, and the Sallow duel spot (`k_sallow`). The rest of the survey stays local (shots/ is gitignored).
