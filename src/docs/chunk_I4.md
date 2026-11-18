# Chunk I4: audio direction and surfaces

Branch `chunkI4` (from master `35b4f5e`, which already has H2's reverb sends and `dbEntry`). `src/core.js` is unchanged (md5 `74a5299e9a45d86aaddc90e2f1831821`), and so is combat timing. Everything here is presentation or world-layer data, and none of it is read back by the sim.

Files:
- `src/game.js`: changes only inside `AudioSys` and its static tables (audio code).
- `src/world_surfaces.js` (new): surface materials.
- `src/world_audio.js` (new): `A.DBAudio`, plus priorities for world one-shots.
- `build.py`: two lines that append the new files after `world_combat.js`.

No other file is touched: not `world_boss.js` (H1c), not core (I1), not the blade code (I2), not the UI (I3), not the models (H3c).

## 1. Priority, voice limit, ducking (`AudioSys`, src/game.js)

**Priorities** (`AudioSys.PRIO_OF`, from blueprint 10 / 18):

| level | sounds |
|---|---|
| 5 | deathblow, perfect, break (posture), mikiri, dbEntry, execSting, death/phase/intro/victory stings, win, death, the `db*` phase sounds, bodyfall |
| 4 | combat impacts and everything else not listed (hit, block, deflect, whoosh, kick, chip, danger, …) |
| 3 | footsteps (`step`, `step_<surface>`) |
| 2 | UI (`ui`, `branch`) |
| 1 | music (drum hits) |
| 0 | ambients |

`play()` tags every synth voice of a sound with its priority. Raw `audio.tone` / `audio.nz` calls made outside `play()` take `audio.ctxPrio` if it is set, otherwise 4. `A.DBAudio` sets `ctxPrio` to 5 for the length of a deathblow, so `world_boss.js`'s own impale, rip and slam are protected without editing that file. The `A.sfx` wrapper sets it per world one-shot: crow 0; kindle, pickup, page, drink and keys 2; alert, gate, lever and blade 4; refused 5. The continuous wind ambient and the bed oscillators are not one-shot voices, so they are never stolen.

**Voice limit (Chromebook).** Every `nz`, `tone` and drum part asks `admit()` for a slot from a small reused pool. The caps are `AudioSys.VOICES`: Low 24, Medium 40, High 56, Ultra 64. At the cap:
- The lowest-priority voice playing (the oldest, when several share that priority) is faded out in about 4 ms (`cancelAndHoldAtTime`, then `setTargetAtTime` to 0) and stopped.
- If the new voice ranks below everything playing, the new voice is dropped instead.

`vstats` counts voices started, dropped (by priority), stolen (by priority) and the peak.

**Ducking.** The music bus is now a chain of three duck gains in front of the music-volume gain:

`impG → stG → dbG → musG → master`

`musBus()` returns the head of the chain, so the bed, the drums and the strings are all ducked. `setBus` still sets the volume gain itself. Each gain has its own automation, so the ducks never cancel each other:
- **impG:** a short dip under combat impacts.
- **stG:** under stingers.
- **dbG:** held by `A.DBAudio` (`audio.dbDuck(dB, tc)`).

Overlapping ducks on the same gain keep the deepest level and the latest end. Table `AudioSys.DUCK` (dB / hold s):

| bus | sound | dB / hold s |
|---|---|---|
| stG | perfect | −9 / 0.32 |
| stG | break | −8 / 0.4 |
| stG | mikiri | −8 / 0.35 |
| stG | deathblow | −10 / 0.6 |
| stG | execSting | −6 / 1.0 |
| stG | phase | −10 / 1.6 |
| stG | deathSting | −12 / 2.0 |
| stG | dbEntry | −10 / 0.45 |
| impG | hit | −4.5 / 0.06 |
| impG | kick | −4.5 / 0.06 |
| impG | block | −3.5 / 0.05 |
| impG | deflect | −3.5 / 0.06 |
| impG | chip | −3 / 0.05 |

The depth scales with the sound's `vol` (×0.3 to ×1.5).

Known gap: the bed's and the strings' existing sends into the old 1.8 s room (`this.rev`) are not ducked. The send is small and diffuse, and rerouting it would have changed H2's room.

## 2. Deathblow audio map (`A.DBAudio`, src/world_audio.js)

`A.DBAudio.play(phase)` plays one phase now: its sound, its bed duck and the hold flag. `A.DBAudio.start(e, world, mode)` schedules the phases on the **deathblow clock**. That clock is the attacker's core `stateT` in `deathblowExec`. It does not advance while the core freezes the fighter for hit-stop, and it slows with the presentation time scale, so phases cannot drift from the picture. After the core exec ends (boss tail), wall time carries the clock on.

| phase | blueprint (normal) | boss final | legacy (today's finisher) | sound | bed (dbG) |
|---|---|---|---|---|---|
| plant | 0.05 | 0.05 | 0.03 | `dbPlant` + surface plant under the attacker (sound and particles) | — |
| drive | 0.28 | 0.28 | 0.10 | `dbDrive` (air pulled in) | −12 dB, tc 0.02 |
| impact | 0.32 | 0.32 | = Fin tImp (0.14) | `dbImpact` + `dbEntry` *only if `own.impact`*; sets **hold** (footsteps at 35 %) | −12 |
| settle | 0.55 | 0.55 | 0.18 | — | −7 dB, tc 0.08 |
| tension (optional) | 0.70 | 0.79 | skipped | `dbTension` (steel grinding in the seam) | −7 |
| extract | 0.95 | 1.20 | 0.23 | `dbExtract` (scrape) | −12 |
| clear | 1.15 | 1.65 | = Fin tRip (0.27 / 0.30) | `dbClear` *only if `own.clear`*; clears hold | back to 0 dB, tc 0.25 |
| land | when the collapse lands | | | `bodyfall` + the surface under the body ×3, plus particles | — |

`land` is detected read-only: the victim's `A.BossD.Col` entry gets `.landed`. `world_boss.js`'s own `slam` still plays, and the surface layer sits on top of it.

**Current wiring (minimal), with notes for merge time:**
- A `Game.handleEvents` wrapper walks `w.events` before the frame consumes them (no allocation). It starts DBAudio from the core `deathblow` event (the player's) in **legacy** mode, because the current H1 finisher thrusts at 0.14 and pulls out at 0.27 sim seconds.
- In legacy mode, impact and clear also snap to the presentation's own bookmarks through `BD.onPost`. A `BD.onPost` set by anyone else, such as tests, is still called. world_boss keeps playing its own `impale` / `rip`, so `own.impact` and `own.clear` are false.
- **For I1:** the same wrapper already handles `deathblowStart` (`{a|attacker, d|victim}`). It starts the **blueprint** timeline and from then on ignores the old `deathblow` event. `deathblowUnlock` calls `A.DBAudio.unlock()`, which is informational only.
- **For H1c:**
  - If the new presentation follows the blueprint schedule and stops playing `sfx('impale')` / `sfx('rip')`, set `A.DBAudio.own.impact = own.clear = true`. Otherwise, leave them false so the impact is not doubled.
  - A presentation can also call `A.DBAudio.play('impact')` itself.
  - `A.DBAudio.forceMode = 'blueprint'` forces the new timeline from the old event.
  - The `BD.onPost` sync is only used in legacy mode and can be deleted once legacy goes.

The arena modes (non-world) keep the old `deathblow` + `execSting` pair. That pair still ducks the bed through stG.

## 3. Music intensity layers (`AudioSys.music`)

This uses what the existing system has: the drone bed (`bed()`), the war-drum layer and the tremolo string layer.
- The layers now enter and leave with hysteresis. Drums come in above pressure 0.45 and go out below 0.36. Strings come in above 0.66 (or in Phase II) and go out below 0.56.
- Layers fade at about 1/s (`layers.drums` / `layers.strings` weights scale the drum velocity and string gain), so pressure hovering on a threshold no longer flickers a layer.
- Pressure is computed in `Game.frame` as before.
- Impacts never get masked: every hit, block, deflect, kick or chip dips the whole bus (impG), stingers duck it deeper (stG), and the deathblow holds it down (dbG).

## 4. Surfaces (blueprint 4.5, src/world_surfaces.js)

`A.SURFACES`: `SurfaceDef = { id, footstep, particle, dustAmount, wetness, frictionMod }`

| id | footstep | particle | dust | wet | frictionMod |
|---|---|---|---|---|---|
| stone | stone (dull thud + tick) | dust | 0.5 | 0.1 | 1.0 |
| wet_stone | wet (thud + splash sweep + hiss) | splash (blue-grey, fast fall) | 0.6 | 0.8 | 0.88 |
| mud | mud (low squelch + suction sweep) | mud (dark brown) | 1.0 | 0.9 | 0.8 |
| wood | wood (hollow 150 Hz knock) | splinter | 0.4 | 0.2 | 1.0 |
| ash | ash (soft thump + long hiss) | ash (pale, slow, floaty) | 1.4 | 0 | 0.95 |
| gravel | gravel (3 random grit grains) | grit | 0.8 | 0.15 | 0.92 |
| bone | bone (dry clicks) | chip (pale) | 0.5 | 0 | 0.9 |

**Chapter I tags** (`A.SURFACE_TAGS.execution`) are applied to the data objects at load. The region data file is untouched.
- `R.surfaces` lists all seven.
- Each zone gets `.surface`:
  - Corpse Pit and Gravedigger's Cut: mud
  - Gallows Yard: wet stone
  - Gaol: stone
  - Muster Field: gravel
  - Ossuary: bone
  - Stair: wet stone
  - Block: wet stone
  - Hollowwood Gate: gravel
- Elevation pieces get `.surface`: gallows deck and steps are wood, and the stair flights and landing are wet stone.
- Patches: ash in a 6.5 m circle round the headsman's block, a plank floor in the Gaol office, and wet stone on the causeway to the gate.
- Regions without tags fall back to their zone `floor` keys.

**Query and cache:**
- `A.Surf.resolve(R, x, z)` is pure. It walks a per-region precedence list (stairs, platforms, patches, zones; first match wins) that is built once.
- `A.Surf.at(x, z, key)` caches the last surface per fighter. It reuses the result while the point stays in the same 0.5 m cell, or inside the same shape when no earlier shape overlaps it. `A.Surf.last` is the latest result.

Queries happen on:
- **Every foot plant.** The two existing `audio.play('step')` calls in `Character` have no position. A `Character.prototype.update` wrapper records which character is updating, and the `audio.play` wrapper swaps `step` for `step_<surface>` under that fighter. The player is always covered; foes only within the existing 14 m.
- **Impacts:** the dodge scuff (core `dodge` event), the deathblow plant, and the body landing.

**Particles** come from the existing pooled `FX.dust` buffer: no new buffers, materials or lights.
- Count = `dustAmount × k × tier.particles`, ×0.5 again on Low. For a mud plant with k = 4 that is High 4, Medium 3, Low 1.
- In the deathblow hold, steps and their particles are at 35 %.

**frictionMod** is presentation only, because the world layer has no friction and core movement is unchanged. It lengthens the dodge scuff (a second step layer at vol ×(2 − frictionMod)) and scales its particle count.

## 5. Lighting budgets (blueprint 20)

This chunk adds no lights on any tier. It also adds no renderables, materials or textures. Surface particles reuse the existing pooled `FX.dust` points, and Low gets half of the tier-scaled count.

## Measured numbers
(see Tests)

## Tests
