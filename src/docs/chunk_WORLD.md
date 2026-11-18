# Chunk WORLD — Execution Grounds layout pass

Base: `integrate5` 22496cf, branch `chunkWORLD`. Full audit, fix table, perf and proposals are in `docs/world_audit.md`.

## Changed
- `src/world_build.js`: prop builders (brazier, graves, rack, wagon, bonepile, candles, skullwall), the bone-wall face skulls, the Gaol F_PROPS nudges, and the Cut crow perch. Every edit is commented `chunk WORLD`.
- `src/data/region_execution.js`: Ossuary candles and torch positions.
- `src/world_boss.js`: Stair wallnotice and carving positions only (prop data, no boss or deathblow logic).
- New tests: `.test/world_audit.js`, `.test/world_audit_page.js`, `.test/world_probe_palisade.js`. Results: `.test/world_audit_{low,medium}.json` and `.test/world_perf.jsonl`.

## Not changed
- `src/core.js`. Its md5 is 8b20b836…, the same as integrate5. COMMON.md lists 74a5299e…, which does not match the integrate5 base either.
- Deathblow and combat code, and existing tracked `.test` files (the path seds were reverted).

## Merge notes
- New colliders change navigation and movement. Wagons are now solid but low, so you vault them with Space. Grave markers get small deco colliders. The brazier collider is now short and no longer blocks sight. Tests that walk through the wagon pen or the Cut graves by straight line could notice.
- `p_candles` accepts `s` (spread) and `y` (base height). `p_skullwall` accepts `off`.

## Tests
ct 99/99 · v8 40/40 · p1 97/97 · smoke clean · boss 47/50. The same 3 boss checks fail on the untouched base (finisher hit-stop and key/prompt at Odran's body), so they were not caused by this chunk. Low frame time and draw calls equal integrate5 and are no slower than master.
