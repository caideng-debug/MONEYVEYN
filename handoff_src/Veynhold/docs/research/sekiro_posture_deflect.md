# Sekiro: Shadows Die Twice — Posture & Deflect Systems vs Veynhold

_Research doc, 2026-11-09. Public sources only. Status: COMPLETE (Parts A–D)._

## Part B — Veynhold current state (read from repo)

Files read: `docs/blueprint_v3.md` §5, §12, §13, §15; `src/core.js` (CONFIG lines 13–64, pressGuard/resolveDefense/addPosture/breakPosture/regenPosture ~275–420, AI ~470–500, jump-kick ~692); `src/world_combat.js` (H4 wrapper).

- Sim: fixed `CONFIG.sim.dt = 1/60` (core.js:13) → 1 tick = 16.67 ms.
- Player: `postureMax 100`, `postureRegen 16/s`, `postureRegenDelay 1.0 s`, `guardRegenMult 1.6`, `brokenTime 1.25 s`.
- Regen vitality scaling (core.js:338): `rate *= 0.35 + 0.65·hp/maxHp` — applies to player AND enemies. H4 (world_combat.js `CFG.vit`) re-shapes it for enemies only (world mode): factor 1.0 at full HP → 0.35 at ≤25% HP. Player keeps the core linear curve (`CFG.vit.player:false`).
- Guard regen: `f.guard` → ×1.6 (applies to enemies too, using the player constant).
- Deflect window: opens on press, `parry.window 0.20 s` (12 ticks) before strike + `lateGrace 0.07 s` (≈4 ticks) after; `largeWindow 0.30` accessibility; `perfectWindow 0.04 s` (≈2.4 ticks) before strike; per-attack `parryMod` 0.9–1.25 scales the pre-window.
- Anti-mash: 4th press within `spamSpan 1.0 s` → window × `spamFactor 0.55` (0.11 s); reset by any successful deflect; mashed press can never be perfect.
- Deflect posture: defender gets `post·0.15 − 6 (−4 more if perfect)` (can be net negative = recovery); attacker (enemy) gets `max(10, post·1.0) × 1.15 if perfect`; enemy deflecting player → player gets `post·1.5`.
- Block: player takes `post·1.0`; enemy takes `post·0.25 × lightPostureResist`; heavies chip `dmg·0.15` HP (never below 1); King phase-2 extra chip `dmg·0.18`; thrusts can't be blocked.
- Clean hit: HP `dmg`, posture `post·0.45` (enemy ×lightPostureResist on lights); broken enemies take ×1.5 HP.
- Mikiri: `mikiriPosture 45`, attacker recoil 0.9 s. Jump-kick (off sweep): `jumpKickPosture 30`, stagger 0.45 s.
- Enemy break → `broken` 2.2 s (hard-coded core.js:328), deathblowable; `deathblowTime 1.3 s`.
- Guard break on player: posture full while blocking → `breakPosture` → `broken` 1.25 s (event 'guardbreak').
- Enemy profiles: duelist 150/11/s/1.6 s delay; warden 230/9/2.0; brother 140/13/1.4; king 210/12/1.5 (p2 ×1.8 regen, 2 marks); trainer 120/8/2.5.
- Enemy AI deflect: guardChance ~0.4–0.8, deflectSkill 0.15–0.5, aims mid-window with gaussian error σ = 0.07·(1.4−skill); `maxConsecutiveCounters 2`; blockCounterChance 0.75.
- H4 extras: guard-regain (grey HP from blocked heavies returned 75% of damage dealt within 3 s — Bloodborne-style, not Sekiro); charged heavy +24/+30 posture.
- Blueprint §12: "Preserve press-open guard window, buffers, 40 ms perfect rule, spam protection." §14: no upgrade may obsolete perfect deflects. §15.2 rule 4: "posture is the real fight; HP costs mistakes."

## Part A — Sekiro findings (with confidence + source)

Confidence key: **H** = datamine/param-confirmed or multiple independent sources agree; **M** = single reputable wiki or consistent community testing; **L** = anecdotal / single forum post; **C** = contested (sources disagree — see note).

### A1. Deflect window & anti-mash
| Item | Value | Conf. | Source |
|---|---|---|---|
| Base deflect window | **12 frames @60 fps = 0.200 s**, opens on guard press | H | Fextralife Deflection https://sekiroshadowsdietwice.wiki.fextralife.com/Deflection ; anim `a050_203000` AddSpEffect 105010 shown as 6 frames in 30-fps DS Anim Studio = 0.2 s https://www.nexusmods.com/stellarblade/articles/199 ; Arqade summary of a game-file video https://gaming.stackexchange.com/questions/387925 |
| Mechanism | SpEffect **105010** ("just guard judgment") applied by the deflect animation at press time | H | Nexus mod 1374 (edits SpEffectParam 105010 `effectEndurance`) https://www.nexusmods.com/sekiro/mods/1374 ; Nexus article above |
| After the 12 deflect frames, held guard = **block** (Steam users cite frames 13–36 as block-only during the raise anim) | 12f deflect then block | M | Steam thread https://steamcommunity.com/app/814380/discussions/0/598534026474564261/ |
| Anti-mash penalty | each recent press/release **shrinks** the next window, stacking, "to as little as 4 frames, even 0 frames if you spam too fast" | M | Fextralife Deflection |
| Penalty decay | penalty cleared after **30 frames (0.5 s)** without pressing, and **immediately on any successful deflect** | M | Fextralife Deflection; Arqade |
| Hold-then-release-then-press | also accrues penalty (release counts) | M | Fextralife Deflection |
| Flurries | spamming is *required/allowed* vs rapid flurries because each successful deflect resets the penalty | H | Fextralife Deflection; Reddit r/Sekiro https://www.reddit.com/r/Sekiro/comments/zoe5en |
| **CONTESTED**: "window is 30 frames / 0.5 s" or ".4 s" | Conflates deflect window with block-after-press or mod author's own retraction (mod 1374 strikes out ".5s/30 frames" and says ".4s") | C | Steam thread 3270186319532361490; mod 1374. Treat **0.2 s** as canonical; ".4–.5 s" is likely the full raise animation incl. block frames. |
| "Perfect deflect" | Visually distinct big-spark deflect exists in community lore; FromSoft/manual never names it; GameFAQs regulars say "deflect is binary". Community claim: perfectly-timed deflect = ~0 self posture (L). | C/L | GameFAQs https://gamefaqs.gamespot.com/boards/241004-sekiro-shadows-die-twice/77639299?page=2 ; Steam 3270186319532361490 |

### A2. Posture recovery & vitality link
| Item | Value | Conf. | Source |
|---|---|---|---|
| Player regen delay | starts "after not taking posture damage for about a second" | M | Fextralife Posture https://sekiroshadowsdietwice.wiki.fextralife.com/Posture |
| Enemy regen delay | **none** ("Enemy posture doesn't have this delay") | M | Fextralife Posture |
| No regen while | attacking, sprinting, grappling, staggered | M | Fextralife Posture |
| Guarding | "greatly speeds up" recovery (player); Polygon says faster while blocking applies to Sekiro **and** enemies | H (qualitative) | Fextralife Posture; Polygon https://www.polygon.com/sekiro-guide/2019/3/21/18274151/vitality-posture-damage-deflect-deathblows/ ; FromSoft web manual https://www.fromsoftware.jp/manual/sekiroshadowsdietwice/stadia/mechanics.html |
| Vitality → regen multiplier (stepped) | HP 100–75% → **100%**; 75–50% → **66%**; 50–25% → **33%**; 25–0% → **1%** | M (wiki table, no datamine cited) | Fextralife Posture |
| Official statement | "the lower the Vitality, the slower the Posture recovery. Some enemies have very fast Posture recovery … first focus on reducing their Vitality" | H (official) | FromSoft manual (above); Activision support https://support.activision.com/uk/en/sekiro/articles/sekiro-shadows-die-twice-game-mechanics |
| Low HP increases posture *damage taken*? | GameFAQs claims "posture builds faster" at low HP — unsupported | L | GameFAQs answer 510562 |
| Bar UI cue | posture bar background reddens as vitality limits regen | H | Fextralife; NamuWiki; supercheats |

### A3. Bars, break, deathblow
| Item | Value | Conf. | Source |
|---|---|---|---|
| Player posture growth | +30 posture per Prayer-Bead upgrade (4 beads), 10 upgrades, **max 420** (⇒ base ≈ 120) ; vitality +80 each, max 1120 | M | Fextralife Posture |
| Deflects can't break player | "Sekiro's posture can't be broken by regular attacks if he deflects them, even if his bar is full" | H (widely corroborated) | Fextralife Posture; GameFAQs board 77634347 |
| Player posture broken | staggered, can't defend; takes extra damage; cut short by step-dodge/jump (safety roll w/ i-frames) | M | Fextralife Posture |
| Enemy posture broken | deathblow available "within a few seconds", then enemy recovers "a small portion" and fight continues | M | Fextralife Posture |
| Deflected-attack rhythm | consecutive deflects in a short span deal **increasing** posture damage to the attacker | M | Fextralife Posture & Deflection |
| Enemy deflects the player | deals **no** posture damage to the player per Fextralife ("will not deal any Posture damage") but player recovers slower → counters | M/C | Fextralife Deflection |
| Player posture break aftermath | player's bar **empties** after their own break (players exploit this: "purposely have your posture broken so it regenerates instantly") | M | GameFAQs https://gamefaqs.gamespot.com/boards/241004-sekiro-shadows-die-twice/77634347?page=1 |
| Deathblow window length (enemy broken) | **not numerically established** in any source I opened — only "a few seconds" / "limited window" | — (gap) | Fextralife Posture; Activision support (above) |

### A4. Datamined param values (community extraction of AtkParam / NpcParam)
Source: dash512/AeroliteWasTaken **Sekiro-Calculator** repo, raw files `Sekiro/Enemy.py`, `Sekiro/Player.py`, `Sekiro/Multipliers.py`, `Sekiro/Reference.py` — https://github.com/AeroliteWasTaken/Sekiro-Calculator (raw: https://raw.githubusercontent.com/dash512/Sekiro-Calculator/main/Sekiro/Enemy.py). Field meanings: SekiroResurrection modding wiki https://github-wiki-see.page/m/SekiroResurrection/modding-wiki/wiki/AtkParams . Confidence on **raw values: H** (param dump). Confidence on **what each field does in combat: L–M** (field docs are sparse — see notes).

**NpcParam (HP, Posture, "Posture Regen")** — regen field is the NpcParam base; the repo warns it "changes a lot depending on events and animations … check StaminaControlParam", and gives no unit (likely points/s — inferred).
| Enemy | HP | Posture | Regen field | Super armor (poise) |
|---|---|---|---|---|
| Common fodder (most frequent rows) | 80–235 | 15 / 45 / 60 / **75** / **90** | **20** | 0 |
| Ashina Elite (Jinsuke Saze / Ujinari Mizuo) | 714 | 270 | 20 | 0 |
| Genichiro (both fights) | 1598 | **660** | **60** | 0 |
| Lady Butterfly | 2073 | 600 | 60 | 80 |
| Great Shinobi Owl | 1916 | 660 | 60 | 0 |
| Owl (Father) | 2552 | 750 | 60 | 0 |
| Isshin Ashina | 1600 | 750 | 60 | 0 |
| Isshin, the Sword Saint | 2240 | 660 | 60 | 0 |
| Guardian Ape | 3520 | 1140 | 60 | 400 (recov. corr. 4.0) |
| Demon of Hatred | 3195 | 1050 | **30** | 640 |
(Most-common (posture, regen) pairs across 2,000+ NPC rows: (15,20)×183, (90,20)×152, (75,20)×125, (45,20)×110, (60,20)×85, (210,20)×45, (120,30)×42, (480,30)×41, (750,30)×22.)
- Phase multipliers (`Multipliers.PhaseChangePosture`): Guardian Ape phase 2 posture ×**1.1**; True Monk phases ×1 / ×**0.8** / ×1. NG+ scales HP, posture **and posture regen** together (NG+2 ×1.2 … NG+7 ×1.5; charmless up to ×1.9).
- Boss/fodder posture ratio ≈ **7–9×**; boss/fodder regen ratio ≈ **3×** (60 vs 20). Posture ≈ **0.3–0.45 × HP** for bosses (Genichiro 0.41, Isshin SS 0.29, Ape 0.32).

**AtkParam posture fields (enemy attacks)** — 2,396 enemy attack rows:
- `atkStam` (wiki: "value of posture damage on deflected attacks") — Genichiro normal slashes **6–9**, heavier slashes/thrusts **12–21**, Lightning/big moves 21–42; Isshin SS sword combo 9–18, Strong Iai **27**, "Weakness slash" 30; Butterfly light 3–9.
- `repelLostStamDamage` = **exactly 2 × atkStam in 2,051/2,051 non-zero rows** (H). Inferred meaning (L): posture the defender loses when **guarding** (FromSoft "repel" = guard-repel) — consistent with community testing that blocking fills posture ~2× faster than deflecting (Reddit https://www.reddit.com/r/Sekiro/comments/loj4r8 ; Steam 1753520467360440211).
- `repelLostStamDamage_Attacker` — **tiered constant**: 30 (1,380 rows), 0 (450), 15 (240), 45 (213), 60 (61), 999 (15). Inferred meaning (M): posture the **attacker** takes when its attack is deflected. Strong corroboration: **every player katana attack has `_Attacker = 0`**, matching Fextralife's "enemies can deflect your attacks, but this will not deal any Posture damage". Light jabs/kicks = 15, normal = 30, heavy = 45–60, 999 ≈ guaranteed break.
- Player katana attacks: `atkStam` 10–15 (`Right hand sword_attack 1`: phys corr 200, stam 15, repel 30); the calculator doubles player `atkStam` (×2) when computing posture damage dealt (`Utils.getDamage`) — so a basic slash ≈ **30 posture on hit** at AP1, scaled by Attack Power (AP2 ×1.25 … AP10 ×3.25).
- Field `NewStaminaDamage2`: "posture damage dealt to Sekiro when an attack has not been blocked or deflected" (clean-hit posture). Field `Set Guard Behavior`: 1/2 = NPC combo interrupted when blocked, 11 = combo continues.

**Worked Sekiro ratio (inferred, L–M):** vs Genichiro's 64-dmg slash: deflect → you lose ~9 posture, he loses 30; block → you lose ~18, he loses 0. Breaking 660 posture from zero by deflects alone ≈ 22 deflects before regen — hence counter-slashes, consecutive-deflect bonus, and vitality damage.

### A5. Enemy deflect/counter & how bosses differ
| Item | Value | Conf. | Source |
|---|---|---|---|
| Enemies deflect player swings | yes; costs player **no posture** (`_Attacker 0`), but the player "recovers slower than your opponent", making follow-ups risky → counter | H | Fextralife Deflection; param above |
| Thrusts | can't be guarded; can be deflected (or Mikiri'd); enemies may deflect player thrusts too | H | Fandom Combat https://sekiro-shadows-die-twice.fandom.com/wiki/Posture (Combat category page) |
| Sweeps / grabs | sweeps: jump (jump-kick = "large amount of posture damage, often leaving them vulnerable to a Deathblow"); grabs: dodge only | H (qual.) | Fandom Combat |
| Mikiri | "deals more Posture damage than a regular Deflect"; skill Shinobi Eyes increases it | H (qual.) | Fandom Combat; Fextralife Posture |
| Enemy blocking | enemy guarding your hits still takes "only a little" posture | M | Samurai Gamers https://samurai-gamers.com/sekiro-shadows-die-twice/posture-system |
| Golden-flash counter | a deflect that shows a gold flash marks an opening where a counter-slash beats the enemy's next swing | L | Reddit r/Sekiro https://www.reddit.com/r/Sekiro/comments/b9hlhu/ |
| Bosses | multiple deathblow marks; bosses have 7–9× fodder posture, 3× regen, some have poise/super-armor (Ape 400, DoH 640), phase posture multipliers; Butterfly-type "very fast recovery" ⇒ must lower vitality first | H | param dump; FromSoft manual; Eurogamer https://www.eurogamer.net/sekiro-combat-system-explained-posture-perilous-attacks-how-to-deflect-dodge-counter-frame-data-6009 |
| Gyoubu can't recover posture | community claim | L | Steam 592909223872062838 |

### A6. Not established (searched, no reliable number)
- Player base posture (Fextralife arithmetic implies 120 → 420 max; unverified against params).
- Player posture regen rate (pts/s) and the exact guard-regen multiplier ("greatly speeds up" only).
- Exact anti-mash ladder per press (only "→4 frames, even 0"), and decay = 30 frames.
- Consecutive-deflect bonus size.
- Deathblow window seconds; player posture-broken stun seconds.
- Whether a "perfect" (tighter) deflect tier exists — contested; no param evidence found in what I opened.

## Part C — Gap table (Sekiro → Veynhold)

Ticks are at `CONFIG.sim.dt = 1/60` (1 tick = 16.67 ms). "Sekiro value" carries its confidence from Part A. Recommendations are proposals only — no code was changed. Blueprint guards that constrain them: §12 keeps "press-open guard window, buffers, 40 ms perfect rule, spam protection"; §14 says no upgrade may make perfect deflects obsolete; §15.2-4 says "posture is the real fight".

| # | Mechanic | Sekiro value (conf.) | Veynhold now (file / variable) | Recommended Veynhold change (60 Hz) | Risk |
|---|---|---|---|---|---|
| 1 | Base deflect window | 12 f = 0.200 s, all **before** impact (H) | 0.20 s = 12 ticks pre (`core.js CONFIG.parry.window`) + 0.07 s ≈ 4 ticks post (`lateGrace`) | **Keep 12 ticks.** Keep `lateGrace` but cut it to **3 ticks (0.05 s)**. It stands in for browser input latency, which Sekiro does not have. | Low. Cutting late grace too far would feel unfair on 60 Hz displays with vsync lag. |
| 2 | Anti-mash rule | Every recent press/release shrinks the next window, stacking down to 4 f and even 0 f. Clears after **30 f** idle or on **any successful deflect** (M) | Only the 4th press inside 1.0 s shrinks the window, to ×0.55 = 6.6 ticks (`spamCount 4`, `spamSpan 1.0`, `spamFactor 0.55`). A deflect resets it (`dfn.presses.length = 0`) ✓ | Use a **ladder**: windows by press number inside the decay span = **[12, 10, 8, 6, 4] ticks**, floored at 4 (Sekiro's 0 floor would be too harsh for a browser game). Set **decay span = 30 ticks (0.5 s)** after the last press (replaces `spamSpan 1.0`). Scale `lateGrace` by the same factor. Count a **release** of a held guard as a press. Keep "a mashed press can never be perfect". | Medium. Players who rely on mashing through flurries need the reset-on-success, which already exists. Re-run test "4 consecutive perfectly timed deflects" (core.js:899): gaps of 0.4–0.6 s land inside the 30-tick decay, but each deflect resets the ladder, so the test should still pass. |
| 3 | Perfect-deflect tier | Contested; no param evidence. Community says "deflect is binary" (C) | `perfectWindow 0.04` (≈2.4 ticks), `perfectPostureBonus 0.15`, `perfectSelfRecover 4` | **Keep** (blueprint §12 requires it). Express it as **2 ticks** (0.0333 s) or **3 ticks** (0.05 s); 0.04 s is not a whole tick count, so it lands as 2 or 3 depending on phase. Recommend `perfectWindow = 3/60`. | Low. This is Veynhold's own addition; label it in docs as "not Sekiro". |
| 4 | Defender posture cost on deflect | Defender loses `atkStam` ≈ **½ of a block's cost** (L–M, inferred from repel = 2×atkStam) | `post·0.15 − 6` (−4 more on perfect). With typical `post` 12–30 this is **≤0: deflects refund posture** (`deflectSelfPosture`, `deflectPostureRecover`) | Good deflect = **post × 0.40**, perfect = **post × 0.10 − 2**, late = **post × 0.60**. **Remove the flat −6.** | **High** (feel). Defence gets much harder; the player bar starts to matter during long boss strings. Pair it with #5 and playtest. |
| 5 | Deflects never break the player | "Can't be broken … if he deflects, even if bar is full" (H) | No such guard. `addPosture` breaks at max from any source (core.js:321–325). Today deflects are net-negative, so it never triggers | In `addPosture`, add a `noBreak` flag for deflect self-posture that clamps to `postureMax − 0.01`. **Required if #4 ships.** | Low. Pure safety rule. |
| 6 | Block posture cost (player) | ≈ 2 × deflect cost (= `repelLostStamDamage`) (L–M) | `blockPosture 1.0` × post | Keep 1.0 × post. With #4 a block then costs 2.5× a good deflect, close to Sekiro's 2×. | Low. |
| 7 | Attacker posture when deflected (enemy) | Fixed **tier** per attack: 15 light / **30** normal / 45–60 heavy, independent of damage (H raw, M meaning). Bars 600–1140, so a normal deflect ≈ 2.7–5% of a boss bar | `max(10, post × 1.0)` × 1.15 on perfect (`deflectAttackerPosture`). King bar 210, so a normal deflect ≈ 10–14% of the bar | Add a per-attack field `defl` with tiers **8 / 16 / 24 / 32** (light / normal / heavy / perilous) on Veynhold's 100–230 bars, which keeps the ~3–5%-of-boss-bar feel scaled to shorter fights. Default `defl = post` until authored. | Medium. This is a rebalance; see #15. |
| 8 | Consecutive-deflect bonus | Deflects "in quick succession" do more posture damage (M, size unknown) | None (only the perfect bonus) | Add: each deflect within **60 ticks (1.0 s)** of the previous one gives **+10% attacker posture**, stacking to **+30%** and resetting on a gap. | Low–medium. This makes flurries the payoff, which Sekiro intends. |
| 9 | Player posture when *their* swing is deflected | **0 posture** (`_Attacker = 0` on every player attack; Fextralife agrees). Punishment comes from slower recovery (H) | `post × 1.5` (`combat.playerPostureWhenDeflected`), plus recoil `player.recoilTime 0.42` | Drop to **post × 0.5** (or 0 for pure Sekiro). Raise `recoilTime` to **0.50 s (30 ticks)** so the counter window still exists. | Medium. Mashing attacks gets cheaper on posture; the AI must reliably counter during recoil (it does: `riposte after deflect`). |
| 10 | Player regen delay | ~1 s (M) | `player.postureRegenDelay 1.0` ✓ | Keep **60 ticks**. | — |
| 11 | Enemy regen delay | **None** (M) | 1.4–2.5 s (`duelist 1.6`, `warden 2.0`, `brother 1.4`, `king 1.5`, `trainer 2.5`) | Lower toward Sekiro while keeping a readable beat: field **0.75 s (45 ticks)**, King **1.0 s (60 ticks)**, trainer unchanged. | Medium. Fights lengthen unless #13 (steeper vitality curve) ships too. |
| 12 | Guard speeds regen | "Greatly" (H qual., no number); applies to enemies too (Polygon) | ×1.6 (`player.guardRegenMult`), also used for enemies | **×2.0** for both. | Low. A turtling enemy recovers faster, so pressure matters more. |
| 13 | Vitality → regen curve | Stepped: ≥75% HP → 100%, 50–75% → 66%, 25–50% → 33%, <25% → **1%** (M, wiki table). Applies to player and enemies | Core: linear `0.35 + 0.65·hp` for all (core.js:338). H4 reshapes enemies only (world mode): 1.0 → 0.35 at ≤25% (`world_combat.js CFG.vit`) | **Enemies:** step curve **1.0 / 0.66 / 0.33 / 0.05** at 75/50/25%. Use 0.05, not 0.01, so the bar visibly still moves. Move it into core so arena and world match, and add a 0.75 band to H4's HUD cue (`CFG.vit.bands → [0.75, 0.5, 0.25]`). **Player:** keep the linear curve with floor 0.5, to avoid a death spiral; Sekiro does apply it to the player, so this deviation is deliberate. | Medium. A stepped curve is less smooth, but it is readable with the band cues already in H4. |
| 14 | Posture recovery is paused while… | attacking, sprinting, grappling, staggered (M) | Only paused in `broken`/dead and during the delay (core.js:333–341) | Pause regen while `state ∈ {attack, hit, recoil}` or sprinting, for player and enemies. | Low–medium. Raises posture pressure on aggressive AI. |
| 15 | Bar sizes and boss scaling | Bosses 600–1140 vs fodder 15–90 (7–9×); boss regen **3×** fodder (60 vs 20); phase multipliers (Ape ×1.1) (H) | Player 100; field 140–230; King 210; boss regen 12 vs field 9–13 (≈1×); King phase 2 `postureRegenMult 1.8` | Keep bar sizes (short-fight design). Widen the regen gap: field **9–11/s**, King **18/s** in phase 1 (×1.8 stays for phase 2 = 32/s at full HP, tempered by #13). Optionally King phase-2 `postureMax ×1.1`. | Medium. The King gets much harder to break at high HP, which is intentional (forces HP damage first, per Sekiro). Needs a playtest. |
| 16 | Guard break on player | Posture full while blocking → stagger, can't defend, takes extra damage; safety roll (dodge/jump) shortens it (M) | `breakPosture`: `broken` 1.25 s (`player.brokenTime`), event `guardbreak`. Dodge-cancel out of `broken` **not found** (`canGuardNow` has no `broken` case; dodge path not verified) | Keep **75 ticks**. Allow a dodge/jump **safety roll from tick 24 (0.40 s)** with i-frames, using the existing dodge i-frame window. Apply **×1.25 damage** to the player while broken (enemies already take ×1.5, core.js:391). | Medium. Adds an escape, so tune AI follow-ups. |
| 17 | Player bar after own break | Empties (M) | Reset to 50% (`posture = postureMax*0.5`, core.js:640, shared with enemies) | Player → **0**. | Low. Matches the Sekiro "reset" feel; it is forgiving. |
| 18 | Enemy break → deathblow window | "A few seconds", then recovers "a small portion" (M; no number) | 2.2 s hard-coded (core.js:328); afterwards posture = 50% | Move the 2.2 s into CONFIG (`combat.enemyBrokenTime = 132 ticks`), keep the value. After expiry set enemy posture to **80%** of max ("small portion" recovered), not 50%. | Low. Exposing the value is pure hygiene; 80% makes a missed deathblow cost less progress than now. |
| 19 | Chip damage | Plain blocked attacks: **no HP**. Fire/terror/elemental attacks chip through guard **and deflect** (H) | Heavies chip 15% dmg on block (`parry.heavyChip`); King phase 2 `blockChip 0.18`; H4 guard-regain refunds it | Keep King phase-2 chip (the analogue of Sekiro's elemental chip). Lower generic `heavyChip` to **0.10**, or tag it "Veynhold-only". Optionally make Crimson attacks chip **on deflect** at 5%, as Sekiro's elemental attacks do. | Low. |
| 20 | Mikiri | Larger than a deflect; skill-upgradable (H qual.) | `mikiriPosture 45` (≈1.5–2× a deflect), window 0.34 s | Keep. If #7 ships, set it to **2× the attacker's `defl` tier, minimum 40**. | Low. |
| 21 | Jump-kick on sweep | "Large amount … often vulnerable to a Deathblow" (H qual.); a generic player kick is only `atkStam 5` (param) | `jumpKickPosture 30`, stagger 0.45 s | Raise to **40**. Stamping enemies that are *not* sweeping should do ≤5 (a cheap kick), matching the generic kick param. | Low. |
| 22 | Enemy deflect behaviour | Enemies deflect player swings at no posture cost to the player; they counter during the player's slower recovery; bosses deflect whole strings | AI `guardChance` 0.4–0.8, `deflectSkill` 0.15–0.5, σ = 0.07·(1.4−skill), `maxConsecutiveCounters 2`, `blockCounterChance 0.75` | Keep the structure. With #9, make sure every enemy deflect of a player swing sets `recoil` ≥ 30 ticks and the AI counters ≥75% of the time when in range. | Low. |
| 23 | Enemy posture from blocking player hits | "Only a little" (M) | `enemyPostureFromBlockedHit 0.25` × post | Keep. | — |
| 24 | Block window after deflect frames | Held guard after 12 f = block (raise anim frames 13–36) (M) | Hold = block for as long as guard is held ✓ | Keep. | — |

## Part D — Suggested CONFIG deltas (for whoever implements; not applied)
```js
// core.js CONFIG (proposed)
parry: { window: 12/60, lateGrace: 3/60, perfectWindow: 3/60,
  spamLadder: [12, 10, 8, 6, 4],   // ticks, indexed by presses inside spamDecay
  spamDecay: 30/60,                // replaces spamCount/spamSpan/spamFactor
  deflectSelfPosture: 0.40, deflectPostureRecover: 0, perfectSelfMult: 0.10, perfectSelfRecover: 2, lateSelfMult: 0.60,
  deflectNoBreak: true, chainBonus: 0.10, chainCap: 0.30, chainSpan: 1.0, heavyChip: 0.10 },
player: { postureRegenDelay: 1.0, guardRegenMult: 2.0, brokenTime: 75/60, safetyRollAt: 24/60, brokenDmgMult: 1.25, postBreakPosture: 0, vitFloor: 0.5 },
combat: { playerPostureWhenDeflected: 0.5, enemyBrokenTime: 132/60, enemyPostBreakPosture: 0.8 },
enemyVit: { steps: [[0.75, 1.0], [0.5, 0.66], [0.25, 0.33], [0, 0.05]] },
perilous: { jumpKickPosture: 40 },
// profiles: duelist/brother/warden postureRegenDelay 0.75; king postureRegenDelay 1.0, postureRegen 18
```
Ship order (least to most risky): #5, #18, #17, #1/#3, #2, #12, #14, #8, #13, #11/#15, #9, #7, #4. Re-run the core self-tests (core.js ~880–1040), especially the perfect/good/late tests at 1035–1040 and the posture-break test at 934.

## Sources opened (fetch budget ≈ 13)
1. https://sekiroshadowsdietwice.wiki.fextralife.com/Deflection
2. https://sekiroshadowsdietwice.wiki.fextralife.com/Posture
3. https://sekiro-shadows-die-twice.fandom.com/wiki/Posture (redirects to the Combat category page)
4. https://github.com/AeroliteWasTaken/Sekiro-Calculator (README)
5–10. Raw param files: …/dash512/Sekiro-Calculator/main/Sekiro/{Enemy,Player,Multipliers,Reference,Utils}.py
11. https://raw.githubusercontent.com/wiki/SekiroResurrection/modding-wiki/AtkParams.md
Search-excerpt only (not opened; treat as corroboration): Nexus mod 1374, Nexus Stellar Blade article 199, Arqade 387925, Steam threads, GameFAQs, Polygon, Eurogamer, FromSoft web manual, Activision support, Reddit threads.
No FromSoftware interview with numeric posture/deflect values turned up in the searches. Interviews were not pursued further, to stay within budget.
