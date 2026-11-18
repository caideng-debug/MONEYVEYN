# Chunk G3: Ilsabet's two dialogue cutscenes

Branch `chunkG3` (from master `a0cd034`). `src/core.js` is unchanged (md5 `74a5299e9a45d86aaddc90e2f1831821`), and so is combat timing.

## What the player sees

1. **The Cage** (about 19.6 s). With the Gibbet Key, the player picks "Unlock the cage." Wren turns the key, the new cage door swings open on its hinge, and Ilsabet steps out through the doorway. She speaks, Wren asks one question, and Ilsabet hands over the feather (a small feather mesh passes from her left hand to Wren's). Control then returns, a hint reads "Ilsabet heads for the foot of the Headsman's Stair.", and she walks there in about 15 s. The walk is visible: no fade, no walking through bars, and a short look back over her shoulder at the third waypoint. At the end she becomes a talkable NPC at the stair foot (7.2, 26.2). Her line there is "I'm not climbing that Stair without a blade. Go on, Ward. When the bell stops, I'll come up."
2. **The Block** (19.6 s, plus up to 4.3 s more for a long climb). This plays once Odran is dead, his last words (`odran_dying`) have been heard and the Headsman's Key has been taken, in either order, while Wren stands on the Block, 0.8 s after the last of those. Ilsabet comes up the Stair from the landing. If the Stair head is far, Wren takes a few steps to meet her. Ilsabet stops about 1.9 m from Wren and looks down at where Odran lies, and they speak. Then she turns north and walks to the Hollowwood Gate (2.6, 66), where her existing gate dialogue (node `b`) is waiting. Wren ends the scene facing the gate, so the gameplay camera that blends back in watches her walk off.

Both scenes use the boss cutscene's presentation: letterbox, subtitles in `#vhSub`, the "ESC / E — SKIP" hint, the `G.Intro` sim hold (no world time passes and nothing can be hit) and the same camera blend in and out. **Esc or E (pad Y) skips**, exactly as for Odran. Other keys and pad sticks do not skip. A skip still does everything the scene does to the world: the door opens, the items are exchanged, the flags are set and the walk starts from her end mark. Sounds are left out. The scenes play whatever the "Boss intros" setting is, because they are story and not boss intros. Headless (jsdom) runs treat each scene as skipped unless a test sets `A.Scenes.enabled = true`, which matches `BD.enabled`.

## Final dialogue

The voice follows the story bible: Ilsabet is dry and soldierly, Wren is brief and asks questions, and the stones are left unspoken. Odran's "Why does a man hang someone he knows will live?" comes back through Wren. The R3 clue from the old free node ("Odd thing, for the King's own shadow") is kept.

**The Cage**
| t (s) | who | line |
|---|---|---|
| 1.0–4.2 | Ilsabet | Easy. That lock's older than anyone in Veynhold but the King. |
| 4.4–9.0 | Ilsabet | Ahh, my legs. They say you never swore to anyone. Odd thing, for the King's own shadow. |
| 9.2–10.8 | Wren | Where will you go? |
| 11.1–15.5 | Ilsabet | I'll wait in the shadow under the Headsman's Stair. When the bell stops, I'll come up. |
| 15.8–19.3 | Ilsabet | Then Hollowwood. Take this. My Cranes will know it. |

**The Block** (later lines shift by the extra climb time `dT`)
| t (s) | who | line |
|---|---|---|
| 1.4–4.8 | Ilsabet | The bell stopped. I counted to a hundred and came up anyway. |
| 4.9–8.2 | Ilsabet | Forty years on this hill. I thought there'd be more of him. |
| 8.5–11.3 | Wren | He said the King knew I'd live. Then why hang me? |
| 11.6–16.4 | Ilsabet | Not to kill you. That's the worse answer. Ask the Unsworn in Hollowwood. They keep what the Abbey burns. |
| 16.7–19.3 | Ilsabet | You have his key. I'll be at the gate. |

"There'd be more of him" works whether his body is still burning to ash, as now, or lies on the floor, as fix plan §1.6 has it.

Other text changes:
- `ilsabet_key` choice: "Open the cage." becomes "Unlock the cage." and runs `['scene','ilsabet_free']`. The old `free` and `free2` nodes are removed.
- New `ilsabet_wait` dialogue (above).
- `ilsabet_gate` now starts at node `b`, because the Block scene says what node `a` used to.
- Crane quest stage 2 now reads "Ilsabet Crane is free. She waits in the shadow under the Headsman's Stair."
- The stair-landing whisper when she is freed (`world_boss.js` build-up `Up.post`, one string, not the deathblow code) now reads "“I'll be listening for the bell, Ward.” — Ilsabet, low, from the shadow under the Stair." It used to point to Hollowwood, which she no longer heads for directly.

## Flags and reloads (saved)

| Flag | Set when |
|---|---|
| `crane_freed` | end of the Cage scene (with feather, quest crane 2, cage key taken) |
| `crane_waiting` | she reaches the Stair spot |
| `crane_block_seen` | end of the Block scene |
| `crane_gate` | she reaches the gate |

Region NPC slots: `ilsabet` `!flag:crane_freed`, `ilsabet_wait` `flag:crane_waiting&!flag:crane_block_seen`, and `ilsabet_gate` `flag:crane_gate`.

Reload repair runs before `A.buildWorld` spawns NPCs:
- `crane_freed` without `crane_waiting` sets `crane_waiting`.
- `crane_block_seen` without `crane_gate` sets `crane_gate`.

So a save or reload mid-walk puts her at the walk's destination. A reload mid-scene puts her back where the scene started (cage, or the Stair), and the scene plays again. Odran dead with the key but the Block scene not yet seen means she is still at the Stair, and the scene plays the next time Wren steps onto the Block. That also covers old saves (`crane_freed` and dead Odran from before this chunk).

## Code

- **`src/world_scenes.js` (new, appended after `world_boss.js` in `build.py`)**
  - `A.Scenes` is the reusable runner, built from `BD.Cut` (WB 148-203), which is untouched. It hooks `Intro.update/camera/skip/end/start`, `Cinema.anyInput`, `Game.onKey` and `Character.prototype.computeTarget` by wrapping the existing functions, so the boss cutscene's code paths are unchanged. When no scene is active, every wrapper calls straight through.
  - A scene is `{ dur, lines, shots, actors{ path, look, track, fx, endFace }, events[[t, fn, essential]], onEnd }`. Moves use a trapezoid speed profile and give the fighters real `vx`/`vz` and `state 'move'`, so the locomotion clips play.
  - The Block scene's shots are computed from Wren's position, Ilsabet's end mark and the body. Each shot is tested with `Region.camClear` and mirrored across the subject line when blocked. Ilsabet's path is routed around the great block and Odran's body.
  - `A.SceneWalk` is the visible walk (steering, ramp, look-back, arrival callback). `A.SceneHold` holds her body while it belongs to a scene or walk. On arrival the body is handed to the new NPC slot, so the model is not swapped.
  - `A.SceneDoor` animates the door and adds two small colliders for the open door.
  - In a scene Ilsabet stands easy (arms down, a local `rest` pose) instead of the duelist guard, since she has no blade. Back in gameplay she uses her normal NPC stance again, blended by the usual springs.
- **`src/world_build.js` `p_cage`**: bars 8-10 (west) are now a hinged door group in `this.dyn`. It is hung on bar 11, merged to one mesh, and opens to `rotation.y = 2.3` (folded back to the north, clear of her path and of every camera). `cageObj.door` is new.
- **`src/world.js`**: one line, `act` case `'scene'`, which queues a scene. It starts once the dialogue box has closed.
- **`src/data/content.js`, `src/data/region_execution.js`**: the data above. `ilsabet.exit` is removed, so the old fading exit no longer runs for her (the system is still there for other NPCs).

The deathblow code, the flag / banner, item and corpse code are not touched.

**Positions checked:**
- The wait spot passes `A.checkPoints` (the region placement assert).
- The free path `[[24.75,21.85],[22.6,21.2],[18.5,19.8],[10.5,20.6],[7.2,26.2]]` is sampled every 0.2 m against every segment and collider circle at r 0.45.
- Both walks are checked every frame in `.test/ilsabet.js`.

**Performance:** one extra merged mesh (the door) and one tiny feather mesh while it is shown. No per-frame allocations: shots are built once per scene, and the hand position uses a reused vector. Nothing changes on Low/Medium outside the scenes.

## Tests

- **New `.test/ilsabet.js` (jsdom): 54/54.** It covers:
  - the placement check and a collider-clear path
  - the door is closed at first, half-open at 2 s, then open
  - she steps out through the doorway at about 3 s, and all 5 lines play
  - the scene runs about 20 s with the sim held and no damage
  - she receives nothing until the scene ends, then the walk is visible and never inside a collider; she arrives in 15.3 s
  - her body is handed over to the NPC, and the wait dialogue plays
  - Esc and E skips (input cleared, no pause menu, world changes applied, open door solid)
  - reloads mid-walk and at the Stair
  - Odran beaten for real (deathblows); no Block scene before both the key and his last words
  - the Block scene starts on the landing, she climbs to about 1.9 m from Wren, all 5 lines play
  - after the scene, the walk to the gate (collider-clear) and the gate dialogue
  - reloads mid-walk to the gate and at the gate (nothing replays)
  - Block scene skip with E (she still ends at the gate)
  - no console errors
- **`.test/p1.js`**: the old checks for her fading exit north are replaced on purpose by the new behaviour: a visible walk, the door open, the "Stair" hint, a reload mid-walk puts her at the Stair, and she arrives at the Stair after about 15 s. The boss section now steps onto the Block so the (headless-skipped) Block scene and the walk to the gate run before the existing "waits at the Hollowwood gate" check. 97/97.
- **ct 72/72, v8 40/40, boss 50/50, keyflow 54/54, merge 14/14, smoke clean** (no errors, self-tests 72/72).
- **New `.test/shots_G3.js` (Chromium, Medium)**: freezes each scene's clock at its beats and writes `shots/G3_free_*.png` and `shots/G3_block_*.png`. The results are listed in the report and below.

## Shots (`node .test/shots_G3.js high`, 1280×720)

I looked at every frame for framing and subtitle readability. Several shots were reframed after the first pass: they were too close on Wren, Ilsabet blocked Wren in the look-down shot, and the tent took over the old shot toward the Stair towers. The final frames:

| File | t | What it shows |
|---|---|---|
| `shots/G3_free_1_door.png` | 3.55 | 3/4 from the south-west: the door swung back with its lock plate showing, Ilsabet stepping through the doorway, line 1 |
| `shots/G3_free_2_ilsabet.png` | 6.85 | Ilsabet close in profile, straightening up (line 2) |
| `shots/G3_free_3_wren.png` | 10.15 | Wren over Ilsabet's shoulder ("Where will you go?") |
| `shots/G3_free_4_stair.png` | 13.45 | profile two-shot as she turns toward the Stair (line 4) |
| `shots/G3_free_5_feather.png` | 17.95 | the feather on her open palm (line 5) |
| `shots/G3_free_6_walk.png` | gameplay | after the scene: the door open, Ilsabet walking off |
| `shots/G3_block_1_climb.png` | 3.15 | behind Wren: Ilsabet coming up out of the Stair head (line 1) |
| `shots/G3_block_2_body.png` | 7.49 | side two-shot: she looks down where he lay (line 2) |
| `shots/G3_block_3_wren.png` | 10.79 | Wren close (line 3) |
| `shots/G3_block_4_ilsabet.png` | 14.39 | over Wren's shoulder onto Ilsabet (line 4) |
| `shots/G3_block_5_gate.png` | 18.89 | wide profile two-shot, the look panning north (line 5) |
| `shots/G3_block_6_walk.png` | gameplay | Wren facing the gate, Ilsabet walking past her toward it |

Subtitles sit on the lower band in every frame and never cover a face. The Block shots used a save with Odran already beaten, so no body was there; the "look down" shot then frames the floor beside them. The machine was shared, so the browser ran at about 1-10 fps. The walk frames are therefore only a few game seconds in (the walk timing is checked in jsdom: 15.3 s to the Stair). Wren is drawn as the game's block rig in these frames, the same as in gameplay.

## Notes and judgment calls

- "About 20 s" holds for the Cage scene (19.6 s). The Block scene is 19.6 s, plus 0 to 4.3 s more when Wren is far from the Stair head: Ilsabet climbs at about 1.9 m/s, and Wren steps up to 2.5 m toward her. This keeps the climb visible without a sprint.
- The Block scene waits for both the key and his last words, in either order (the user's spec). The fix plan had it trigger on the dialogue alone.
- The scenes ignore the "Boss intros" setting, because they are story and not boss intros.
- The old `A.npcExits` fade system is left in place for any other NPC that has an `exit` (none do now). Ilsabet no longer uses it.
- If another chunk changes what `BD.corpse` holds, the Block scene still falls back to the dropped key's position, then to (0, 52.5).
