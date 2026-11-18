# Chunk B — fewer enemies, less aggro, fair engagement

Files: `src/world.js` (Ents AI + new `AGGRO` / `TOK` / `Token`), `src/data/region_execution.js` (roster), `.test/engage.js` (new), `.test/p1.js` (spawn-count assertion 18 -> 13).
`src/core.js` untouched (md5 74a5299e9a45d86aaddc90e2f1831821).

## 1. Roster: 16 -> 11 field foes (-31%)
Removed redundant grunts: `y4` (yard gaoler), `g2` (gaol gaoler next to g1's patrol end), `m3`, `m4` (muster field, the worst gang-up spot: 6 -> 4), `o2` (Ossuary jailer beside Sallow).
Kept every foe with a tut flag, drop, elite or boss: y1 (stealth), y2 (deflect), g1 (thrust), g3 (sergeant, gaolkey), m1 (brute, cagekey, sweep), sallow, odran.
Total spawned World entries incl. bosses: 18 -> 13.

## 2. Aggro (`AGGRO` in world.js)
| what | before | after |
|---|---|---|
| sight LOS range / sight range / cone half-angle | 13 m / 12 m / 1.05 rad | 10.5 m / 9.5 m / 0.95 rad |
| alert build-up seen near / far (near cutoff) | 3.2 / 1.6 per s (<5 m) | 2.4 / 1.1 per s (<4 m) |
| alert build-up heard | 2.2 /s | 1.5 /s |
| hearing: sprint / attacking / walking | 7 / 6 / 2.8 m | 5.5 / 4.5 / 2.2 m |
| engage threshold (time spent as "?") | 0.8 (~0.25–0.5 s) | 1.0 (~0.4–0.9 s) |
| "stop and look" (suspicious) threshold | 0.15 | 0.08 (foe stops and turns to look sooner, so the "?" reads) |
| group chain-pull | 11 m, LOS to the engaged foe | 6 m, LOS to the engaged foe AND the puller must itself see the player (<9.5 m + LOS) |
| disengage: player distance / home leash | 26 m / 34 m | 18 m / 24 m |
| disengage: no sight (path mode) for | 9 s | 5 s |
| disengage after "far" condition held for | 3 s | 2 s |

## 3. Engagement token (`Token` in world.js)
- In world mode `A.buildWorld` calls `Token.install(w)`, which gives the World INSTANCE its own `tokenFree / claimToken / releaseToken`.
  Bosses fall through to the core's prototype methods (the core token is then theirs alone, so boss pacing is the locked v8 behaviour).
  Field foes use `Token`: `tokenFree(f)` is true only for the current holder and never while `A.boss` is set.
- `Token.update` (once per frame, start of `Ents.update`): releases the holder when it dies/leaves combat, when its committed attack (string) ends or is interrupted,
  or (anti-deadlock) when it was not within 4.2 m of the player for 3 s, or held 4.5 s without swinging (that foe is then skipped for 2 s).
  After a release a new holder is picked after a 0.6–1.0 s gap: nearest engaged field foe with LOS, not pathing; the previous holder gets a +3 m penalty so the turn rotates.
- `Token.after` (instance brain wrap, after each core brain tick): attacks the brain starts without asking the token (e.g. heavy-punish) are vetoed on the tick they start
  (atk cleared, idle, `attackStart`/`danger` events of that tick removed, brain -> circle "waiting turn"). Non-holders inside their personal ring (4–6 m, random per foe)
  are steered to hold it: back off (faster inside 3.5 m), circle, guard/telegraph as the brain likes. Far foes still approach normally. Result: at most the holder plus one recovering foe inside 3.5 m.
- No new per-frame allocations (closures built once at install; loops over the existing list).

## 4. Test: `.test/engage.js`
jsdom world mode; clears the region roster, spawns 4 engaged foes (2 gaolers, 2 jailers) round an invulnerable player who swings a light every 1.5 s, 60 s simulated; checks every sim tick.
Result (seed 4242): 0 ticks with 2 committed field attacks (max 1), 24 attacks (t1 2, t3 14, t4 8), 19 handovers, max 1 foe within 3.5 m, min clearance 0.22 m, all 4 stayed engaged,
pinned holder released after 2.1 s, boss (Sallow) fight: boss 20 attacks, nearby field foes 0. ALL 11 PASSED.

## Other tests
ct 72/72, v8 40/40, p1 95/95 (count assertion updated to 13), smoke: no errors.
Note: v8.js needs `dist/Veynhold_v7.html` (gitignored) — copied from /workspace/veynhold/dist for the run.
