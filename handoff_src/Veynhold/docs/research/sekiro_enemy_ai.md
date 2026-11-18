# Sekiro enemy & boss combat design — research + Veynhold gap analysis

Status: complete (written incrementally). Research only; no code edited.
Date: 2026-11-09. Sources listed per section and in §12.

## 0. Veynhold baseline as read (what exists today)

Files read: `docs/blueprint_v3.md` §13 + §15, `src/core.js` (CONFIG.ai / CONFIG.perilous / ATTACKS / PROFILES / Brain / tokens),
`src/world_boss.js` (Odran presentation layer), plus `src/data/content.js` (Brask, Sallow, Odran profiles) and
`src/world.js` (AGGRO, field Token) because the bosses and field AI actually live there.

Key facts (numbers are CONFIG / profile values):
- **Deflect**: window 0.20 s from press (`parry.window`), lateGrace 0.07, perfect ≤0.04 before strike; mash = 4 presses / 1.0 s shrinks next window to 55 %.
- **Perilous**: `type: thrust | sweep | grab`, `danger: true` emits a `danger` event at **attack start**, so the kanji lead time = full startup:
  thrusts 0.60–0.85 s, sweeps 0.64–0.92 s, grabs 0.66–0.82 s (± profile jitter 10–20 %). Mikiri: dodge within 80° arc into a thrust → 45 posture + 0.9 s recoil. Jump over sweep → jump-kick 30 posture + 0.45 s stagger (range 3.4). Grab whiff → +0.6 s attacker recovery, −15 own posture.
- **Strings**: `PROFILES[*].combos` weighted lists with `S(key, tempo, hold, gap)` steps; branches `br.deflected / dodged / backoff`; `maxString 7`; per-swing startup jitter and hold-jitter for delayed swings; feints (`feintAt`) cancel with 0.1 s recovery.
- **Brain**: tempo modes pressure / measured / patient (3–8 s each, 40/40/20 %), preferDist ± offset, footwork bursts (sidestep, gapclose, feintstep), react to player attack startup after 0.14 s, guardChance / deflectSkill with honest Gaussian timing error, max 2 consecutive counters, poise breakout after 2 hits in a row, punish on player recoil/broken/hit/recovery (75 %).
- **Habits** (14 s window): `parry_early` ≥2 → delayed/feint ×3; `dodge` ≥4 → delayed/mixup ×1.8; `parry` ≥8 → grab/mixup ×1.8; `retreat` ≥2 → lunge ×2.5; `heavy` ≥2 → grab ×1.5 and a dedicated heavyPunish counter; `light` ≥6 → +0.25 guard, +0.3 deflect.
  **No habit for held guard (turtling)** and no habit for healing.
- **Group**: core has a single World token (0.55 s cooldown); world.js replaces it for field foes with a Token (gap 0.6–1.0 s between attackers, non-holders orbit a 4–6 m ring, anti-deadlock release after 3 s can't-reach / 4.5 s hold). Vetoes unpermitted attack starts.
- **Stealth/alert** (world.js `AGGRO`): sight 9.5 m in ±0.95 rad cone, LOS 10.5 m; alert fills at 2.4/s near (<4 m), 1.1/s far, 1.5/s hearing (sprint 5.5 m, attacking 4.5 m, walk 2.2 m); decays 0.6/s; "?" at 0.08, engage at 1.0; group-alert radius 6 m (delay 0.35–0.65 s); leash 24 m, lost sight 5 s. Stealth deathblow (needs Wardblade) on any non-boss non-elite foe with alert <0.5 from behind (>1.6 rad) or alert <0.15.
- **Bosses**:
  - **Odran Vale** (`odran`) = Iron Warden clone: hp 210, posture 230, 2 marks, superarmor, guardChance .4, deflectSkill .15. Phase 2 = same moveset re-weighted (aggression .62, regen ×1.4, branch .85). No new move, no tell change, no new rule.
  - **Brask** (`sergeant`, elite) = lesser Duelist: hp 110, posture 120, 1 mark, d_* moves. Not a token exception; elite only flags "no stealth kill".
  - **Brother Sallow** (`sallow`, mini-boss) = False Brother copy with hp 130: feints, delayed, grab, lunge, 1 mark, no phase 2.
  - Phase-2 transition: `enterPhase2` → 2.4 s `transition` state, posture reset, hp to 50 %; also auto-triggers at ≤50 % hp in phase 1 (marks set to 1).
- **Blueprint §13**: "No new AI state machine required for first implementation" — allies may use tempo/branch for hesitation. **§15**: one new pressure per archetype; feints never glint, delayed strikes do; strings field 1–3, elites 3–5 + one branch, bosses longer but phrased; ≥1 punish window; branches only on clear player actions; **§15.4 phase changes alter readable behaviour, not only numbers** — Odran currently violates this.

---

## 1. Perilous attacks (危 kanji): types, counters, tell timing

**What Sekiro does**
- One shared red kanji (危, "danger") plus a sting sound for every perilous type; it says *that* an unguardable is coming, never *which* one. The body says which: thrust = shoulder drawn back, blade levelled forward (often a run-up); sweep = weapon dropped low and horizontal; grab = weapon put away / free hand reaching. [Fextralife Perilous Attacks; Eurogamer; Gamers.Wiki]
- Counters (rock-paper-scissors, per Bayjinger's reading): **thrust** → deflect (cannot be blocked) or **Mikiri** (step-dodge *into* it: heavy posture damage, no vitality damage); **sweep** → jump (cannot be blocked or deflected); a second jump press over the enemy is a head-kick for "significant" posture; **grab** → dodge sideways / sprint / jump out of reach; never guardable. Lightning is a fourth type: reverse it by being struck in the air and attacking before landing. [Fextralife Combat; Eurogamer; IGN; Genichiro wiki]
- The *wrong* counter is punished: jumping into a thrust or a grab, Mikiri-ing a sweep. Guides say outright: "do not jump automatically at every danger symbol". [Dead Good Reviews]
- **Tell timing.** I found no published frame data for the gap between kanji and impact. What the sources agree on: the kanji shows at the start of the wind-up; the Mikiri press lands "a moment after the symbol pops, at the very end of the wind-up" (Steam forum); Genichiro's sweep has a slightly longer wind-up than his thrust from the same leap, which is the only thing that separates them; Guardian Ape's grab kanji shows "so late" that experienced players are already moving before it. So the lead is **variable per move**, not a constant, and players read the body rather than the icon. (Unverified as frame counts; treat as qualitative.)
- Mikiri is very forgiving in Sekiro: the counter window spans the whole step-dodge, past its i-frames, provided you face the enemy and step straight in. [Fextralife Perilous Attacks]
- Counters pay out in posture, not HP; that's why they matter (Fextralife New Player Help).

**Veynhold today**: same three types plus a projectile wave; kanji fires at **attack start**, so the lead time = full startup (0.60–0.92 s) on every perilous, the same for all types. Mikiri: 80° arc, 45 posture, 0.9 s recoil; jump-kick 30 posture / 0.45 s stagger; grab whiff gives +0.6 s recovery. No two perilous moves share an opener, so the attack's *type* is known from the first frame.

## 2. Attack strings, delays and feints

- Bosses mix tempo inside a string. Isshin's basic chain is "3–4 hits, delaying between each hit"; reviewers say working out when a combo has *ended* is a skill in itself. [Fextralife Isshin; Disposable Media]
- Delays are honest (no damage on the fake beat), with a glint before the real release (Isshin's sheathe-glint on Dragon Flash / Ashina Cross). Fake-outs come from **shared openers**: two Ape right-hand swipes start from similar poses, one is a perilous hop-grab ("wait a second, then jump"), the other an upright deflectable swipe. [de Heras, Ape]
- Grunt openers have "different anticipation poses, slower/faster hit frames" whose purpose is to bait an early parry and push the player into block-stun. [de Heras, Enemies]
- **Branch on player action**: Genichiro's flurry → if the player deflects the last hit in phase 2, he branches into a perilous thrust; deflecting his P2 slash leads to a thrust; deflecting his dive thrust leads to a running grab. Isshin's Ichimonji: deflect the first hit and he goes straight into a force wave. [Fextralife Genichiro; de Heras humanoid; Fextralife Isshin]
- **Distance branches**: Genichiro's Floating Passage ends in a quick bow shot if you are far away; Isshin's Ashina Cross becomes a pommel smack plus perilous sweep if you crowd him. [Fextralife]

**Veynhold today**: very close to Sekiro here: weighted strings, S() tempo/hold/gap, branches on deflected/dodged/backoff, feints that never glint and delayed strikes that do (glint cue in game.js). Missing: **shared-opener perilous 50/50s**, **distance-conditional enders**, and branches **out of a deflected *final* hit** (Veynhold branches `deflected` mid-string, but a deflected last hit always ends the string in recoil, `finalDeflectRecoil 0.6`).

## 3. Aggression and spacing logic

- Posture regenerates faster at high vitality and slower at low (Bycer eyeballs it: drops off below ~75 % HP and is near zero below 50 %), and faster while guarding. Backing off hands progress back, so the system itself pushes both sides into close range. [Gamedeveloper/Bycer; Eurogamer; Aside House]
- Bosses punish range: Genichiro pulls the bow when you're far or shuffle back; Isshin fires the pistol at a gap and dash-slashes from distance. Both punish **healing at range** with a dedicated gap-closer (Genichiro P1 charged shot, P2 leaping thrust; Isshin distance slash / leaping slam). [Fextralife Genichiro / Isshin]
- Passive play makes the fight *harder*: a passive or evasive player invites Genichiro's tricky neutral attacks and his neutral grab, which "rarely, if at all" come out when he is on the defensive. Aggression keeps him in his predictable counter loop. [de Heras humanoid]
- Setups: the Ape farts to push you backwards, then uses that space for the hard-to-dodge poo throw. [de Heras Ape]

**Veynhold today**: tempo modes (pressure/measured/patient), preferDist ± offset, footwork bursts, `retreat` habit → lunge ×2.5, `retreating && dist 3.5–8.5` → lunge. Posture regen scales 0.35 + 0.65·hp% (gentler than Sekiro's curve). Missing: **heal punish** (the Brain never sees `A.drink`; it lives in world.js), and **range-specific enders**.

## 4. Responses to turtling and mashing

- **Mashing guard**: Sekiro's deflect window is 12 frames (0.20 s at 60 fps). Each recent press/release shrinks the next window, down to 4 frames and even 0; the penalty clears after ~30 frames without a press or on any successful deflect. Pressing early is safe because it falls through to a block. [Fextralife Deflection; Arqade]. *Contested*: several forum posts claim 30 frames (0.5 s); the datamine-backed answer is 12 frames of deflect, then frames 13–36 count as block.
- **Mashing attack**: Genichiro "~90 % of the time performs a counter action after blocking the player's **2nd consecutive** attack" (a deflect plus a quick slash that is *faster than the player's first attack*, or a back-evade); the quick slash lands on a player who keeps swinging <40 % of the time, which is enough to make them hesitate. Kawarada deflects after 3–4 hits and then overheads or jump-slashes. Lady Butterfly lets you land exactly 2 hits, then parries the 3rd into stun. [de Heras humanoid; Fandom Kawarada; Eurogamer]
- **Turtling**: blocking fills your own posture; grunts vary their openers to break block timing; the Early Brute's bare-hand attacks go *through* guard and it carries hit armour, so "the player simply cannot stand there and hold Block". Grabs exist mainly to punish standing still. [de Heras Enemies]
- **Hit threshold** (anti-mash *reward*): enough hits in a short time stagger the Ape and stop its attack; keep going and it plays a huge reaction, escapes and **always** follows with an unblockable. [de Heras Ape]

**Veynhold today**: mash guard → 4 presses in 1.0 s shrink the next window to 55 %, reset on a clean deflect; a mashed press can never be perfect. Good, but gentler than Sekiro (one step to 55 % vs a stacking slide to 0). Mash attack → poise breakout after 2 hits in a row (guard + forced deflect); `light` habit ≥6 → +0.25 guard / +0.3 deflect; counters after block 75 %; max 2 consecutive counters. **No turtle detector** (held guard is not a habit); only `parry` ≥8 → grab/mixup ×1.8. No hit threshold for superarmour foes.

## 5. Group fights and the one-attacker rule

- Sekiro does **not** run a polite one-at-a-time ring. Guides: "enemies will not stand in a ring around you and attack one by one like in the Batman games… facing multiple enemies at once will quickly turn into a swift death". The design answer is stealth and terrain: thin groups first, pull singles, kill ranged and weak units first. Deathblow animations give i-frames and nearby enemies briefly hold off. [Cultured Vultures; Eurogamer; Activision blog]
- Composition is the lever: strong-posture grunts that you could mash on their own must be deflected when aggressive allies are present; several dogs make their leap timing harder. [de Heras Enemies]

**Veynhold today**: a stricter-than-Sekiro token: one committed attacker, a 0.6–1.0 s gap between holders, non-holders orbit 4–6 m, plus an anti-deadlock. Blueprint §13 keeps this. That's a reasonable choice for a Chromebook/keyboard audience; the gap is only that groups currently add **no pressure beyond attrition**.

## 6. Stealth and alert states

- Three visible states: white outline triangle (detecting, filling) → solid yellow (suspicious: walks to investigate, *can still be stealth-deathblowed*) → red (hostile, attacks, "may call for aid"). You can lose a yellow by staying out of the detection radius; red enemies are hard to shake in open areas. Kills make noise and stealth kills "almost always" alert neighbours; Ceramic Shard noise lures one enemy away. Front detection is long; flank and rear detection is weak. [Fextralife Stealth; Fandom Game Mechanics; NamuWiki; Digital Trends]
- Stealth deathblows from behind or above remove a **whole mark**, even on mini-bosses (Kawarada's first mark can be stolen, and the wiki warns his second phase is faster). [Fandom Kawarada; Digital Trends]

**Veynhold today**: an alert meter with "?" at 0.08 and engage at 1.0, rates near/far/hearing, decay 0.6/s, group alert 6 m, leash 24 m. The suspicious state **stops and looks** but never **walks to the last-known position**. Stealth kills create no noise event. Elites and bosses are fully immune to stealth kills, so there's no "steal the first mark" option.

## 7. Boss phase structure

- Marks (red dots) = deathblows needed. Phase changes come with a **new readable behaviour**: Genichiro P2 (Way of Tomoe) sheds armour, gets faster with more range, defends less, adds lightning and new perilous moves (run-and-dive stab, running grab) and **always opens with the leaping thrust** (a guaranteed Mikiri, which shows off the new threat and rewards readiness). The Ape fakes its death ("Shinobi Execution" shown), then returns with an entirely new moveset and status (apparition), longer reach and a terror scream. Isshin goes Genichiro → sword → spear+gun → lightning, each layer reusing earlier lessons. [Fextralife; de Heras]
- **Linear ramp inside a phase**: as HP drops, new branches get grafted onto known moves (the leap gains a thrust-or-sweep 50/50; the unblockable thrust becomes a block-counter too). New pressure is built from **moves already taught**. [de Heras humanoid]
- No checkpoints between phases, so late phases are tested under pressure. [de Heras Ape]

**Veynhold today**: marks + `enterPhase2` (2.4 s transition, posture to 0, HP to 50 %, plus an auto P2 at ≤50 % HP). The King boss (v8) has a true P2 moveset (Crimson Arc, block chip). **Odran's P2 is a reweight of the same 7 Warden moves**, which breaks blueprint §15.4.

## 8. Pressure and rhythm ("the sword clash dance")

- Miyazaki's keywords: "intensity" and "dynamism"; "this constant clang, clang, clang between yourself and your foe". [Game Informer interview]
- An **initiative** system: you swing until the enemy deflects (loud clang, your blade bounces), then initiative is theirs; you deflect their string, then take it back in the recovery. "One hit to their guard will bait out a predictable and easily parried counterattack." [PC Gamer; Eurogamer]
- Rhythm memorisation: "tap, tap-tap, tap, tap: each enemy has a set few attack rhythms". **Consecutive deflects in a short span deal more posture** (Fextralife Deflection/Posture). Counters are skill checks with **fixed timing** ("the timing of his counter is always the same"); deflecting the Grunt-Special's counter gives an instant-kill opening. [Eurogamer; Fextralife; de Heras Enemies]

**Veynhold today**: flat deflect posture (`deflectAttackerPosture 1.0`, +15 % on perfect); counter timing gets jitter unless `jitter:false`; no streak bonus.

## 9. Teaching through mini-bosses

- **Kawarada (first general)** teaches perilous **sweep and grab** (the kanji intro), 2 marks, a stealable first mark, a readable deflect-after-3–4-hits, and a **Recover** move: when his posture is nearly full he hops back and charges an aura that heals posture, and it can be interrupted. That teaches pressure. [Fandom Kawarada; IGN; Red Bull]
- **Tenzen Yamauchi** is "made easier by Mikiri", so it's the thrust lesson. **Ashina Elite Jinsuke Saze** brings fast iai doubles and sweeps: a reflex exam. [SimpleGamer; ethugamer]
- **Genichiro** teaches the counter loop, the coin-flip leap, lightning reversal (taught on the way in) and range punishment.
- **Isshin** is "not here to teach you anything but to test… how much you've really been paying attention": Ashina Cross (a double deflect from a glint), Mikiri thrusts, crowd-cancel sweeps, gun deflects, spear sweeps, lightning, and phase 1 *is* Genichiro. Every mechanic comes back. [The Game Fanatics; AV Club; Fextralife Isshin; SuperJump top 10]

---

## 10. Deep dive A: Genichiro Ashina (castle roof, 2 marks + Way of Tomoe)

Sources: Fextralife Genichiro and Way of Tomoe pages; Fandom 2nd encounter; de Heras humanoid thread; Polygon; GameFAQs; DualShockers. Timings are qualitative: no source publishes frame counts for his moves.

| Move | Tell | Answer | Punish / window | Notes |
|---|---|---|---|---|
| Opener: arrow → roll → slash (P1) | Fixed every attempt | Hold block / deflect | Close in after the roll | Always the same, so the first seconds are "free reading" |
| Closing Tide (always his 1st P1 sword attack, Fandom) | Fixed | Deflect | Short gap after | Learnable opener |
| Bow into rolling slash (1–2 arrows) | Bow drawn while running in | Sidestep or deflect arrows, deflect slash | **Deflect arrow then attack = ≥1 guaranteed hit**; sidestep the run-in shot and attack interrupts the slash | Range answer |
| Multi-arrow jump (3 + 1 delayed) | Shuffle back after your attack, then jump | Block or deflect; **4th arrow is delayed** | Close in while airborne | Delay inside a projectile string |
| Charged shot | Long, obvious draw; triggers on **heal** / after back-kick | Sidestep | Free hits | **Heal punish** |
| Slash into back kick | Kick stance | Sidestep (kick staggers, then charged shot) | | Anti-turtle |
| Backhand grab after a spin | Spin then empty hand | Deflect spin, backstep | Opening after whiff | Neutral grab, mostly vs passive players (de Heras) |
| Floating Passage (long flurry) | **Triggered when he deflects you**; long multi-hit chain | Deflect all (or deflect 2 and dodge out when posture is high) | **Last hit deflected = short punish window** | Long phrase, which is a sanctioned "string length" for bosses |
| Floating Passage cancel → fast bow | Only when you're far, after the first mark | Deflect | | Distance-conditional ender |
| Leap slam → **perilous thrust** (2 bars) / **thrust or sweep ~1:3** (1 bar) | Leap; after landing the stance differs (sweep wind-up slightly longer) | Mikiri / jump-kick | Mikiri → posture spike; dodging the slam → a few hits | **Linear ramp**: the coin flip only appears after mark 1 |
| Perilous attack follow-up → thrust (P1 always) | | Mikiri | | Guaranteed Mikiri chance |
| Counter behaviour | Blocks your 2nd consecutive hit → ~90 % counter: deflect + quick slash (faster than your first swing) or back-evade (first evade never attacks; later it chains) | Stop at 2 swings; deflect the counter | | **The core loop** (de Heras) |
| **P2 opener: leaping thrust, always** | Leap from range | Mikiri or dodge right | Guaranteed hits | Phase reveal + free reward |
| P2 5-swipe flurry | Committed 5 hits covering ¾ of the circle | Deflect ×5 | His **back-left** is open | Long phrase |
| P2 sword dive thrust (on heal) → deflected → running grab | Dive | Mikiri / deflect, then **run from the grab** | | **Branch on deflect into a different perilous** |
| P2 leap slam → horizontal slash (not a sweep!) → if deflected, thrust | | Deflect, deflect, Mikiri | | Teaches "red only after the 2nd beat" |
| Lightning slash / slam | Two-handed crouch, kanji | Jump, get struck in the air, attack before landing | Heavy damage + stun | New rule, taught earlier in the area |

**Design takeaways**: (1) fixed openers; (2) a deterministic counter-after-N; (3) the perilous type is decided late from a shared leap; (4) the long flurry is gated behind a player action (being deflected); (5) heal and range are punished by specific moves; (6) P2 = always-same signature opener + 2–3 new moves + new branches grafted onto old moves.

## 11. Deep dive B: Guardian Ape (2 marks, beast then headless)

Sources: Fextralife Guardian Ape; de Heras Ape thread.

| Move | Tell | Answer | Punish | Notes |
|---|---|---|---|---|
| Rapid slams / swipes (P1) | Arm raises | Block or deflect all | 1–2 hits max after the string (hit armour) | **Hit armour**: only the head flinches |
| Swipe grab (perilous) | Hops before swiping; similar start to the deflectable swipe | **Wait ~1 s then jump** | Opening | Shared-opener mixup |
| Leaping body-slam grab (perilous) | Jumps at you | Dodge as it jumps (double dodge) | | |
| Back-turned fart → retreats → leaps → poo throw | Attacking its back | Dodge out of the cloud; **run under** the jump | Long recovery after the throw | **Setup**: push back, then use the space |
| Roar / jump-back | Jump back | Grapple prompt → brief stagger | | Gap-closer reward |
| Hit threshold | N hits in a short span | — | Stagger (no attack); more hits = big reaction → escape → **always an unblockable** | Rewards aggression, then taxes it |
| Rare hyper-aggressive combo | Low chance early, frequency rises late | Precise deflects | | Outlier frequency ramps over the fight |
| Fake death → resurrection | "Shinobi Execution" shown | | | Phase reveal as narrative |
| P2 jumping sweep | Leaps high, sweeps on landing | **Jump-kick him on landing** → forces an overhead slam | | Counter → forced follow-up |
| P2 delayed overhead slam | Big wind-up, long delay | **Deflect** → massive stagger, neck exposed | Full combo window | **Long hold, then a huge punish**; breaks your rhythm on purpose |
| P2 lunge swipe that falls to the ground | Very telegraphed | Jump over and hit in the air | Very vulnerable | |
| P2 scream (terror) | Head placed back on the neck | Get distance (or umbrella) | | |
| P2 overall | Longer reach, easier to deflect, more posture per deflect; ~5 hits after it topples | Stay mid-range, deflect, step in at low HP | | "More predictable but a more focused skill test" |

**Design takeaways**: hit armour plus a **hit threshold** as the counterweight; shared-opener perilous; setups that create the space for the next move; a phase 2 built on a deflect test that throws you off the beat (the long delayed slam).

---

## 12. Gap table: Sekiro pattern → Veynhold now → recommendation

Legend for risk: **L** = data/profile only (content.js / PROFILES), no rule change; **M** = small core.js or world.js logic (needs a new self-test); **H** = touches the deflect/deathblow contract or locked v8 feel (needs Caiden's sign-off: combat was "locked at v8", core.js edits approved Nov 6 only to follow blueprint v3).

| # | Sekiro pattern | Veynhold current state | Recommendation (numbers) | Risk |
|---|---|---|---|---|
| G1 | Kanji lead varies per move; body tells the type | Kanji at attack start; lead = full startup 0.60–0.92 s for every perilous | Add `dangerLead` per ATTACK (default = su, i.e. no change). For boss perilous moves set the kanji at **su − 0.55 s** (thrust), **su − 0.60 s** (sweep), **su − 0.50 s** (grab), floor 0.45 s. Keep the presentation pose distinct from t=0. Emit `danger` from the attack tick when `t ≥ su − lead` (core) | M: event timing only; deterministic tests must assert danger ≥ 0.45 s before the strike |
| G2 | Shared-opener 50/50 (Genichiro leap → thrust or sweep; Ape swipe vs grab) | Every perilous has its own opener; the type is readable at t=0 | Add a shared opener step: string `[opener, 'X_thrust' | 'X_sweep']` where the opener's last 0.35 s is a common pose; the branch is picked at opener end. Decision visible **≥0.40 s** before impact (0.25 s reaction + input) | M (needs a presentation pose blend); fairness risk on Low quality where pose detail is lost |
| G3 | Branch out of a deflected *final* hit (P2 Genichiro flurry → thrust) | Deflected last hit → `recoverFrom='deflected'` → 0.6 s recoil, string ends | Allow `br.finalDeflected` only on bosses in phase 2, chance 0.6, follow-up must be perilous with startup ≥0.60 s, never chained twice in a row | M: changes the "final deflect = safe punish" promise; gate by phase and keep ≥1 string per boss that ends clean (§15.2.5) |
| G4 | Counter after the Nth blocked hit, ~90 %, fixed timing | Poise breakout after 2 hits; 75 % block-counter in a gap; counters jittered | Per-profile `counterAfter: N` (deterministic count of player hits blocked/deflected within 1.5 s) with chance 0.9 and `jitter:false` on the counter. Gaoler N=3, Brask N=3, Sallow N=2, Odran N=4 (superarmour, see G7) | L/M: a tiny addition to Brain's guard branch |
| G5 | Deflecting a fixed-tempo counter = skill-check reward | Counter deflect gives the normal posture | Counters (`*_counter`) get `parryMod .9` already; add `counterDeflectBonus: +0.5×post` (≈ +7–10 posture) when the deflected attack is the profile's `counter` key | L |
| G6 | Consecutive deflects stack posture | Flat; perfect +15 % | `chainDeflect`: +10 % per consecutive deflect within 1.2 s, cap +40 %, reset on a hit/block/1.2 s gap. Re-tune boss postureMax +10 % to keep TTK | H: shifts every fight's TTK; gate behind CONFIG and A/B on the Tune panel |
| G7 | Hit threshold on hit-armour enemies (Ape) | Superarmour + poise breakout (2 hits → guard). Mashing a superarmoured swing just trades | For `superarmor` profiles: 5 landed hits within 2.5 s → 1.1 s `reel` (no attack); 3 more within the reel → hop back and **always** open with a perilous (sweep or charge) | M |
| G8 | Heal punish (Genichiro charged shot / dive thrust; Isshin dash) | Brain can't see `A.drink` (world.js); drinking takes 1.0 s, cancelled by damage | world.js calls `w.habit('heal')` when a drink starts; Brain: if heal within 0.3 s and dist < 8 m and the token is free, pick the profile's `healPunish` string (Odran `w_charge`, Brask `d_thrust`, Sallow `f_lunge`). Bosses only; field foes at 0.3 chance | M: a cross-layer hook; keep core pure by using the existing habit channel |
| G9 | Turtling is punished (grabs, block-penetrating hits, varied openers) | No held-guard habit; only `parry` ≥8 → grab ×1.8 | Track `guardHold`: every 1.0 s of continuous guard without a deflect adds a habit. ≥3 in 14 s → grab and sweep weights ×2, and gaoler openers use their slow variant (G10). Never at <2.5 m pairs (grab range 2.2–2.3 is fine) | L/M |
| G10 | Grunt openers vary hit frames to bait early parries | jitter ±10–20 % of startup only | Gaoler: two opener variants, `d_slash` (0.42) and `S('d_slash',1,0.18)` (0.60 + glint off, since it's a hold, not a delay), weights 3:1.5; after the first blocked opener, aggression +0.3 for 3 s ("hyper after you block") | L |
| G11 | Distance-conditional enders (Floating Passage → bow; Ashina Cross → smack+sweep) | `backoff` branch exists (dist-based on retreat) | Add `br.far` (dist > 4.5 at the last step) and `br.close` (dist < 1.6) for bosses. Odran close → `w_shove` + `w_sweep`; far → `w_charge` | L (data) + M (branch trigger) |
| G12 | Phase 2 = new readable behaviour + signature opener | Odran P2 = reweighted P1 | See §13.1: an always-opening P2 move, 2 new moves, 1 grafted branch | M (new ATTACKS + poses) |
| G13 | Kawarada **Recover** (interruptible posture heal at high posture) | Silent regen after a 1.5–2.0 s delay | Brask: when posture ≥ 80 % and dist > 3, backstep + 1.4 s `rally` (posture regen ×6, i.e. ~66/s for 11/s base); any hit cancels it and gives +10 posture. Emits `rally` (aura VFX on Med/High; ring on Low) | M (new state) |
| G14 | Stealth: yellow = searching (moves, still stealth-killable); kills make noise | "?" stops and looks; no last-known search; no kill noise; elites immune | (a) alert ≥ 0.5 without LOS → `search`: walk to `lastSeen` at 0.55× speed for 6 s, then return. (b) Stealth deathblow emits noise r = 5 m: +0.45 alert to foes with LOS, +0.25 without. (c) Elite/mini-boss stealth deathblow **removes 1 mark** instead of being blocked (needs marks ≥2) | M (world.js only); (c) changes the elite rule, so check the Brask key-drop flow |
| G15 | Groups: no polite ring; composition adds pressure | Strict one-token, 0.6–1.0 s gap, ring 4–6 m | Keep the token (blueprint). Add a **harass slot**: when ≥3 foes are engaged, one non-holder may fire a *long-tell* move (startup ≥0.75 s, e.g. jailer `d_thrust`) only if its strike frame lands ≥0.45 s from the holder's strike frame. Max 1 harasser; Low quality: off | M; readability risk on Chromebook; default OFF behind CONFIG |
| G16 | Mash-guard penalty stacks to 0 frames, clears after 0.5 s | 4 presses / 1.0 s → 55 % once | Leave as is. Sekiro's version is harsher, but v6 tests ("mashing never beats a single good press") already secure the intent. Optional: second step at 6 presses → 35 % | L; mostly feel, so don't change without a playtest |

## 13. Concrete boss and field proposals

### 13.1 Odran Vale, the Iron Warden (region boss, 2 marks): "the Ape/Kawarada of Veynhold"
Role: first region boss, so teach **sweep + grab + heavy deflect**, test the thrust. Currently: Warden clone, hp 210, posture 230, superarmour, P2 reweight only.
- **P1 (keep the Warden kit; add phrasing)**
  - Fixed opener every attempt: `w_swing → S('w_slam', 1, .2)` (Genichiro-style "free read"). L.
  - `counterAfter: 4` (G4); hit threshold 5/2.5 s → reel 1.1 s (G7).
  - Turtle answer: `guardHold` ≥3 → `w_grab` weight ×2 (G9).
  - Heal punish: `w_charge` (G8).
- **P2 (new readable behaviour; satisfies §15.4)**
  - **Signature opener, always**: "The Verdict", a new `o_verdict`: overheadHeavy, startup **1.30 s** (hold .45, glints), dmg 38, post 40, recovery 1.1 s. **Deflect → 1.2 s stagger** (Ape delayed-slam analogue) = the punish window. Bark: "Kneel." Then `w_charge` (a guaranteed Mikiri chance, like Genichiro's P2 leap).
  - **New move 1** `o_chainsweep`: sweep, range 4.0, arc 260, startup 0.80 (kanji at su−0.60), followed by a forced `w_slam` if the player jump-kicks him (Ape: kick → forced overhead).
  - **New move 2** `o_noose`: grab, range **3.4** (longer than w_grab 2.3), startup 0.90, kanji at su−0.50; used only from 2.5–3.6 m. Teaches "a grab is not always close". Needs a chain/rope presentation (risk: assets).
  - **Grafted branch**: `w_swing` deflected → 50/50 `w_sweep` or `w_charge` from a shared 0.35 s lowered-blade pose (G2/G3).
  - Numbers: aggression .62 → **.68**, tempo .95, postureRegenMult 1.4 (keep), branchChance .85 (keep). Expected deflect count to break 230 posture in P2 with HP ≤50 %: ~7–8 heavy deflects (30–40 each), a Mikiri (45), a jump-kick (30).
- Risk: **M–H**. The new ATTACKS + poses are presentation work in world_boss.js; deathblow timing untouched. Must keep the `odran` intro cutscene logic (`Cut.start`) and `finishDeathblow` → P2 path.

### 13.2 Gaol Sergeant Brask (elite, Gaol Key): "Kawarada lesson: pressure beats regen"
Currently: lesser Duelist, hp 110, posture 120, 1 mark, immune to stealth kills.
- `counterAfter: 3` with a fixed-tempo `d_counter` (jitter off) + G5 bonus: teaches the 3-hits-then-deflect loop.
- **Rally** (G13): posture ≥ 80 % → backstep + 1.4 s rally at ×6 regen; interruptible. Teaches "don't back off".
- marks **1 → 2** and allow a stealth deathblow to take the first mark (G14c) (Kawarada's stealable mark). P2 (after mark 1): tempo .9, aggression +.1, adds `d_sweep` after `d_slash2` (one new pressure only).
- Keep the strings ≤ 3–5 + one branch (§15.2.3, elite).
- Risk: **L–M**. The key drop is bound to death (`drop: 'gaolkey'`), so make sure marks=2 still drops on the final mark; the quest text references "Brask's body".

### 13.3 Brother Sallow, the Smiling Penitent (mini-boss): "Grunt-Special + feint exam"
Currently: False Brother copy, hp 130, 1 mark, feints/delays/grab/lunge.
- **Patient bait mode**: on spawn and every ~8 s, 2.5 s `passive` strafing at 3.4 m with guard up (guardChance .85, deflectSkill .55 while passive). Once he has blocked or deflected 2 of your hits → fixed-tempo `f_counter` (jitter off). **Deflecting it = +40 posture** (≈29 % of 140) (de Heras' Grunt Special skill check).
- `counterAfter: 2`; early-parry habit (already ×3 delayed/feint) stays: it's his identity.
- **Penitent's Embrace**: if the player *blocks* (not deflects) 2 hits in a row → `f_grab` branch at 0.8 chance (turtle punish).
- marks 1 → **2** (mini-boss parity with Sekiro); P2 adds `f_feint → f_grab` shared opener (G2) as his single new pressure.
- Risk: **L** for the data, **M** for the passive-mode timer.

### 13.4 Field enemies
| Foe | Lesson (§15) | Change |
|---|---|---|
| Gallows Gaoler | Deflect rhythm | G10 opener variants; "hyper after first blocked opener" (aggr +.3 for 3 s); `counterAfter: 3` at 0.6 chance (grunts are softer than bosses) |
| Penitent Jailer | Thrust / Mikiri | Kanji lead 0.55 s on `d_thrust` (G1); harass-slot candidate (G15) |
| Chain Gaoler (brute) | Sweep / grab | G9 turtle → grab ×2; hit threshold 4/2.0 s (no superarmour, so it's cheap); keep "no super-armor" note |
| New archetype (later) | **Fodder "dog"**: 1-hit kill, near-zero recovery, keeps min distance 3.2 m, leap is the tell | One new pressure: timing a pack's leaps (de Heras Dog) |
| Stealth layer | — | G14 a/b on all field foes; leash/lostSight unchanged |

## 14. Implementation order, tests, risks

1. Data-only (L): G4 counts, G10, G13 numbers parked, Sallow/Brask/Odran weights. Tests: existing suites (ct 72, v8 40, v6 29, p1 95) must stay green; core.js md5 changes only when M items land.
2. Small logic (M): G8 heal habit, G9 guardHold habit, G7 hit threshold, G11 far/close branches, G14 search + noise. New deterministic tests: "heal within 8 m → boss starts healPunish within 0.5 s"; "5 hits / 2.5 s on Odran → reel"; "kanji ≥0.45 s before strike for every danger attack"; "search walks to lastSeen and returns within 9 s".
3. Feel changes (H): G1 kanji lead, G3 final-deflect branch, G6 chain-deflect: behind CONFIG flags, Tune-panel toggles, playtest before default-on.
4. Content (M–H): Odran P2 moves + poses, the Brask rally state, the Sallow passive mode.

Top risks: (a) breaking the v8 "locked" feel and the deathblow contract (blueprint §3); keep all of this in Brain/PROFILES/world.js, none in deathblow code; (b) Chromebook readability of shared-opener mixups on Low (pose detail, 0.65 render scale); keep ≥0.40 s decision lead and a distinct sound per perilous type as a fallback; (c) TTK inflation/deflation from G6/G7; re-tune postureMax with the Tune panel; (d) the world.js token veto removing `attackStart`/`danger` events: any new harasser must emit its kanji *after* the veto check.

## 15. Sources (opened unless marked)
- Fextralife: Genichiro Ashina — https://sekiroshadowsdietwice.wiki.fextralife.com/Genichiro_Ashina
- Fextralife: Guardian Ape — https://sekiroshadowsdietwice.wiki.fextralife.com/Guardian_Ape
- Fextralife: Deflection — https://sekiroshadowsdietwice.wiki.fextralife.com/Deflection
- Fextralife: Isshin, the Sword Saint — https://sekiroshadowsdietwice.wiki.fextralife.com/Isshin,_the_Sword_Saint
- Fandom: General Naomori Kawarada — https://sekiro-shadows-die-twice.fandom.com/wiki/General_Naomori_Kawarada
- Eurogamer, combat system explained — https://www.eurogamer.net/sekiro-combat-system-explained-posture-perilous-attacks-how-to-deflect-dodge-counter-frame-data-6009
- Jason de Heras, The Purpose of Enemies in Sekiro — https://www.jasondeheras.com/gamedesign/sekiroenemies
- Jason de Heras, challenging boss (Guardian Ape) — https://www.jasondeheras.com/gamedesign/2021/5/8/vaddcoayo3yxvuy3h9eipl0bblhor5
- Jason de Heras, humanoid bosses (Genichiro) — https://www.jasondeheras.com/gamedesign/2021/12/22/how-do-humanoid-bosses-in-sekiro-remain-predictable-yet-provide-increasing-challenge
- Josh Bycer, How I Broke Sekiro (Game Developer) — https://www.gamedeveloper.com/design/how-i-broke-sekiro-shadows-die-twice
- Search excerpts only (not opened): Fextralife Perilous Attacks / Combat / Stealth / Way of Tomoe; Arqade deflect thread; Game Informer Miyazaki interview; PC Gamer guide; Bayjinger; Cultured Vultures; Dead Good Reviews; Fandom Game Mechanics; Steam forum threads on kanji timing; AV Club / Game Fanatics on Isshin.
- **Not covered**: Game Maker's Toolkit / Mark Brown has no Sekiro-specific video that I could confirm in search, so none is cited. YouTube frame-analysis videos were not transcribed (fetch budget). Kanji-to-impact frame counts remain unverified.
