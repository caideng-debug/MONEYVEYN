# Veynhold world mode — performance pass (2026-10-23)

> **These numbers are headless Chromium + SwiftShader (CPU software rasteriser) on a 2-core sandbox, 1280x720.
> They are NOT Chromebook hardware numbers.** SwiftShader is far slower than any real GPU, so treat the fps as
> *relative* (before vs after, tier vs tier). Real Chromebook fps is still unverified.

## How it was measured
- Probe: `.tools/perfW.js <html> <quality> <seconds>`, driven by `/workspace/work/vh/runperf.sh` (one quality per browser launch, run alone, no other browser running).
- New Journey, prologue skipped, player teleported with the hooks used by `.tools/shotsP1.js` and made unkillable; adaptive quality off (`Perf.stepped`), boss intro off.
- Spots: **Gallows Yard** (6, -52) looking at the gallows; **Muster Field** (-5, -9) with nearby foes forced into combat; **boss arena** (0, 42) with Odran Vale engaged.
- fps = frames / wall time over 6 s (before) and 8 s (after) after a 2 s settle. Draw calls and triangles are `renderer.info` **per frame summed over every pass** (shadow + scene + post), averaged over the window.
- Before = the build of `src/` at the start of this pass; after = the final build (`dist/index.html`). Raw lines: `/workspace/work/vh/perf_before.jsonl`, `/workspace/work/vh/perf_final3.jsonl`.
- Run-to-run noise on SwiftShader is about ±10%. In the "after" Gallows Yard run on Low, two yard gaolers spotted the player and engaged, so that spot carried more work than in the "before" run.

## Before / after (SwiftShader, 1280x720)

| Tier | Spot | fps before | fps after | speed-up | ms/frame | draw calls | triangles |
|---|---|---|---|---|---|---|---|
| Low | Gallows Yard | 5.42 | 11.45 | **2.11x** | 184 → 87 | 352 → 173 | 65.4k → 35.5k |
| Low | Muster Field (foes engaged) | 6.07 | 12.60 | **2.08x** | 165 → 79 | 410 → 163 | 65.6k → 31.3k |
| Low | Boss arena (Odran engaged) | 6.48 | 16.03 | **2.47x** | 154 → 62 | 244 → 118 | 32.8k → 18.4k |
| Medium | Gallows Yard | 1.77 | 3.24 | **1.83x** | 564 → 309 | 584 → 389 | 106.7k → 73.4k |
| Medium | Muster Field (foes engaged) | 2.04 | 3.56 | **1.75x** | 491 → 281 | 744 → 494 | 131.4k → 97.1k |
| Medium | Boss arena (Odran engaged) | 1.96 | 3.56 | **1.82x** | 511 → 281 | 465 → 308 | 66.3k → 51.0k |
| High | Gallows Yard | 1.35 | 1.52 | 1.13x | 743 → 658 | 584 → 460 | 105.0k → 92.6k |
| High | Muster Field (foes engaged) | 1.49 | 1.59 | 1.07x | 670 → 631 | 733 → 568 | 123.0k → 107.7k |
| High | Boss arena (Odran engaged) | 1.35 | 1.54 | 1.14x | 741 → 647 | 462 → 344 | 64.9k → 57.8k |

The "after" builds also draw things the "before" build did not: the closed gates (portcullis, gaol door, Hollowwood gate) were invisible before because of a NaN bug, and the sky dome now always draws. Those costs are included in the "after" numbers.

Where the time goes (main-thread split from `.tools/cpuW.js`): game JS + three.js submit is only about 7–18 ms per frame on every tier. Almost all the rest is SwiftShader filling pixels, so render scale, per-pixel lighting, shadows and the post pass are what matter. Draw calls matter less here than they would on a real GPU.

## What changed
Quality tiers (`src/game.js`, `TIERS`):
- Render scale: Low 0.75 → **0.65**, Medium 1.0 → **0.8**. High stays capped at 1.25 × the screen's pixel ratio.
- Shadows: Low none (as before); Medium shadow map 1024 → **512**; High 2048 → **1536** (soft PCF kept).
- Torch point lights: Medium 2 → **1**, High 4 → **3**, Low 0.
- New world-mode keys per tier: `wFog` fog density (Low 0.042 / Med 0.034 / High 0.028), `wDraw` chunk cull distance matched to where the fog reaches about 3% (45 / 55 / 68 m), `wChar` character cull (32 / 42 / 50 m), `wFx` torch flame and halo distance (38 / 48 / 60 m), `wAi` (see below). Low also has `lambert`; Medium has `wFloorNormal:false` and `wRecv:'floor'`.
- Arena trials use the same tiers, so the render scale, shadow map size and light count changes apply there as well. Combat timing is untouched.

Scenery (`src/world_build.js`, `src/world.js`):
- Chunk culling now tests each merged chunk's bounding sphere against the tier's draw distance (it used a fixed 92 m from the chunk's corner). Chunks are positioned at their own centre, so the renderer can sort them front to back. Floors and the base ground plane draw after walls and props, so hidden ground pixels get rejected by the depth test.
- Shadow casters: pieces with a bounding radius under 0.45 m (skulls, pebbles, candles, chains, ember coals) never cast. Casters and non-casters merge separately, so the shadow pass only redraws geometry that throws a visible shadow. On Medium, only the ground receives shadows. Characters are unchanged.
- Merged repeated props: portcullis bars and spikes, door leaves and bands, iron-gate bars and lantern posts are each baked into one mesh per material. Gates still swing and rise as one piece. Candle flames and brazier coals moved into the static chunks.
- Low: scenery uses per-vertex Lambert copies of its materials (normal maps off, colour-matched to the PBR look with a cool moonlit tint). Medium: ground has no normal maps; walls keep theirs. World materials now follow the tier normal-map switch (before, they kept normal maps even on Low).
- No per-frame allocations in the hot loops: the spatial hash uses numeric keys and returns a reused array instead of a new `Set` per collision or line-of-sight query; the torch-light pick no longer filters, maps and sorts every 0.25 s; the nav BFS reuses its queue.
- Far AI: idle and patrolling foes further than `wAi` (50 / 60 / 70 m) stop steering and perceiving until the player comes back in range. Engaged foes and bosses are never skipped, and the combat core is unchanged.

## Art fixes made in the same pass
- **Pit-wall "floating boulders"**: they are now set into the earth wall faces, flattened along the wall normal, with their tops kept under the wall crest, in a darker earthy material. Before, they floated up to 0.9 m off the face and above the top.
- **Closed gates were invisible.** A gate's animation target started out undefined, so its animation value was NaN. Fixed: the yard portcullis, gaol door, ossuary gate and Hollowwood gate now render.
- **Corpse heads floated beside their bodies** (wrong axis sign). They now sit on the body's axis. The shroud colour is darker, so the bodies stop reading as pale logs.
- **The boss-arena floor ring read as a glowing white band.** It is now a dark, rough inlay, raised 6 mm above the floor. The arena floor circle was raised 5 mm over the stair and gate floors it overlaps, which removes z-fighting at range.
- **Horizon silhouettes** (outer rock ridge and distant towers) were pale, moonlit or fogged polyhedra that looked like giant grey pyramids against the darker sky. They are now unlit dark silhouettes and never get culled, so they can't pop.
- **Ossuary walls**: a little bounce light (emissive from their own texture), so the moon-shadowed side isn't a black void behind the skulls.
- Low rubble walls: the stone blocks sit on the ground (up to 5 cm of float before).

## Tests after the pass
`python3 build.py && cp dist/index.html dist/Veynhold.html`, then: ct.js 72/72, v8.js 40/40, v6.js 29/29, p1.js 95/95, with no console errors. `src/core.js` md5 is still `74a5299e9a45d86aaddc90e2f1831821`.

## Screenshots (High, SwiftShader, UI hidden)
`shots/p1_pit.png`, `shots/p1_gaol.png`, `shots/p1_muster.png`, `shots/p1_hollowgate.png`, `shots/p1_boss.png` (Odran Vale at the block).
