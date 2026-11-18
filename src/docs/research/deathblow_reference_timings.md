# Deathblow reference timings: why finishers don't feel "stuck to the enemy"

Research for the Veynhold deathblow rework, written 2026-11-10. The trigger was Caiden's complaint: *"it's like I get stuck to the character."* This is research only. No code changed.

**Confidence tags.** Every number carries one:
- **[D]** comes from game data: ThrowParam rows, TAE events and clip times, pulled from the game files by two open-source Sekiro reimplementations and checked against live recordings. These are the strongest numbers here.
- **[S]** is stated by a guide, wiki, developer talk or post that I opened.
- **[E]** is my own estimate from how the games play. I did not frame-step any footage, so treat [E] numbers as hypotheses to check against a 60 fps capture.

**Main sources.**
- AKJama/sekiro-rs `docs/DEATHBLOW.md`: https://raw.githubusercontent.com/AKJama/sekiro-rs/main/docs/DEATHBLOW.md
- FFwLo/RustSekiro `docs/kb/damage.md`, `enemy.md`, `sound.md`, `camera.md`: https://github.com/FFwLo/RustSekiro/tree/main/docs/kb
- Chris Zimmerman, GDC 2021, "Master of the Katana: Melee Combat in Ghost of Tsushima". Transcript at https://gameindustrylibrary.com/documents/master-of-the-katana-melee-combat-in-ghost-of-tsushima
- Lies of P, Nioh 2 and Wukong wiki and guide pages, linked in each table.
- This builds on `docs/research/sekiro_feel_deathblow.md`, which already covers the sound mix and camera. Where the two disagree, the [D] data here is newer and wins: see the press-to-blade note under Sekiro.

**Video analysis.** I did not run analyze_video, because transcripts of finisher compilations carry no timing and the tool cannot see the picture. Clip timestamps found in RustSekiro's `clips.md` are given where useful. For example, a live recording shows a whole deathblow taking about 3 s on screen (0:30–0:33 and 0:44–0:46), approach included.

---

## The one finding that matters most

In Sekiro the two bodies are **not held together through the kill**. The sekiro-rs authors confirmed this against live recordings [D]:

> "The absorb places one character on the other's dummy **once**, as the pair stands when the body clip starts (its frame 0), spread over `adsrobModelPosInterpolationTime` [0.5 s]; after that each plays its own root motion ... and **nobody is held to anybody**."

Their first build held the enemy on Wolf's live pose every step. That bug made the Owl "spin with Wolf" and teleported him through walls. It was the reimplementation's own version of "stuck to the character."

Three things in the data keep the player from feeling glued:
1. **One alignment, then both sides move on their own.** The victim's own root motion carries him away from Wolf after the strike.
2. **The player is released before the victim is done.** On the Owl, Wolf's move and action cancels open at 4.0 s, while the Owl keeps going until 6.6 s [D]. The collapse belongs to the victim. The player is never kept waiting for it.
3. **The body does not block the player.** While the enemy is still in its defender clip, push-apart moves only Wolf, so walking into the falling or rising enemy does not shove it [D-adjacent: sekiro-rs's implementation, following RustSekiro's note "throw pairs skip the push-apart"].

Veynhold's current `src/core.js` (read today) does the opposite on all three. Both fighters get `vx = vz = 0` for the whole `deathblowTime` of 1.3 s. Facing snaps at the start. Nothing moves either body apart before the lock ends.

---

## 1. Sekiro: Shadows Die Twice

### 1a. Standard front deathblow (Ashina soldier c1010; same structure for Genichiro and the General)

| Item | Value | Tag / source |
|---|---|---|
| Trigger range, "far" start row 11010000 | ≤ **3.0 m**, attacker in front of the enemy (90–180°), facing within 35° | [D] sekiro-rs |
| Trigger range, "near" start row 11010005 | ≤ **1.2 m**, with a different lunge (`a200_502500`) and a shorter body clip | [D] |
| Genichiro / Owl start range | 2.3 m / 2.4 m | [D] |
| How distance closes | A **lunge clip**, `a200_500000`, plays from the press. At its grab event, **0.27 s** after the press, the paired body clips start. The enemy is then slid onto Wolf's dummy 267 (**1.2 m in front of Wolf, facing him**) over **0.5 s**. The capsule snaps there and the *model* catches up linearly; the engine's exact curve is not traced. | [D] |
| Pair spacing during the hold | **1.2 m** front (1.10 m measured with Wolf backed to a wall); Owl 1.3 m | [D] |
| Press → blade lands | The damage event (`ThrowAttackBehavior`) fires at **0.90 s** into Wolf's body clip, so about **1.17 s after the press**. The camera closes to 1.5 m from 0.867 s, which agrees. The blade may touch slightly before the damage frame [E]. | [D] |
| Where the blade goes | Into the front of the torso. The 忍殺 mark sits on the chest. | [S] fextralife; [E] for the exact line |
| Hold / twist | No separate "twist" event in the data. The paired clips play the hold. Camera stays at 1.5 m from 0.867 to 1.567 s, so the hold reads as about **0.6–0.7 s** after the blade lands. | [D] camera window; [E] reading it as the hold |
| Withdrawal and separation | No push-apart physics. **Both clips' own root motion pull the pair apart.** The Ashina General's paired clip (ThrowDef13900, a different counter pair) shows the enemy moving about 0.4 m back, then **about 1.1 m net forward**, ending with no leftover yaw. Behind pair: held **0.60 m** straight behind, ending **about 0.9 m apart at about 145°**. On screen, Wolf pushes or kicks the body off the blade and the blade comes out back along its entry line [E]. | [D] RustSekiro damage.md; [E] visual |
| Victim collapse | A lethal soldier leaves his defender clip at **1.67 s** for the death clip `a000_012001`, which continues the same pose to the ground. Ragdoll from 3.67 s. Wolf's clip can switch on the same frame to a kill follow-up clip, but only in the `a201_` set (the General: Wolf 510000 runs 1.85 s, then 510001). | [D] |
| Player control returns | When Wolf's body clip ends, *"or earlier when its TAE lets him move and he does."* The source gives the soldier's body clip as both "2.0 s" and "ends 2.67 s" (it doesn't say what the 2.67 s is measured from). Either way that's about **2.3–2.9 s after the press**, earlier if cancel flags open (their frame isn't given for this clip). Owl: cancels at **4.0 s** of a 5.1 s clip; victim runs to 6.6 s. | [D] |
| Invulnerability | Whole animation, until control returns | [S-excerpt] gaming.stackexchange 348757 |
| Camera | No cut. The gameplay camera takes slot 41 (slower lock chase, 0.4 / 0.2), blending out over **1.0 s** afterwards. Distance goes **4.0 → 3.0 → 1.5 m (0.867–1.567 s) → back to 4.0 m with SlowStart**, settling over about 2 s. The player is moving while it comes back. | [D] |
| Audio | The whole SFX group goes through a **445 Hz low-pass, faded in over 0.3 s**, and **out over 2 s after the clip ends**. The stab and blood layers cut through. | [D] RustSekiro sound.md |
| Before the deathblow | The posture break clip runs 3.0 s and pushes the enemy back 0.5 m. The deathblow window is the first **2.5 s**. Leftover knockback is cleared when the deathblow starts. | [D] |

**Correction to `sekiro_feel_deathblow.md`.** That file estimated the blade going in about 0.25–0.35 s after the press [E]. The data says the lunge grab happens at 0.27 s and the damage at about 1.17 s. The 0.27 s is the *grab*, not the blade. Veynhold's Impact at 0.32 s is therefore roughly 3.5× faster than Sekiro's soldier deathblow. That fits Veynhold's faster pace, but it means the whole Sekiro kill runs about 2.3 s or more against Veynhold's 1.40 s Unlock. **"Stuck" is not about length. Veynhold is already shorter. It is about zero motion and rigid attachment.**

### 1b. Stealth deathblow (from behind)

| Item | Value | Tag |
|---|---|---|
| Range / angle | ≤ **2.0 m**, attacker within 0–90° of the enemy's back | [D] row 11010020 |
| Placement | Dummy 249, **0.5 m** in front of Wolf, enemy's back to him. Live trace: held **0.60 m** straight behind, no yaw drift | [D] |
| Entry | Blade into the back or neck from behind [E] | [E] |
| Separation | The pair ends **about 0.9 m apart at about 145°**: the body falls forward and to the side, away from Wolf, and does not drop on his feet | [D] |
| Feel | Shorter and quieter than the front version. The blade comes out as the body falls forward off it, so withdrawal and separation are one motion [E] | [E] |

### 1c. Boss final deathblows (Genichiro, Owl, Isshin)

| Item | Value | Tag |
|---|---|---|
| Which side moves | Genichiro: Genichiro is slid onto Wolf's dummy 266, and Wolf anchors. Owl: **Wolf is slid onto the Owl's dummy 230 (1.3 m in front of him)**, and the Owl anchors. Both absorbs take 0.5 s. | [D] |
| Owl timing | Wolf's body clip runs 5.1 s with turning disabled. **Move and action cancels open at 4.0 s.** The Owl finishes getting up by 6.6 s on his own. | [D] |
| Owl camera | Distance 2.0 → 3.5 → 2.0 → 2.5 m over 0–2.5 s. The look target is an *animated camera bone* in Wolf's skeleton, 1.1–1.4 m up and 0.2–1.5 m in front of Wolf. | [D] |
| Isshin final ("Todome") | A separate finishing pair, ThrowParam 17020180 (`a240_501700`), set up by a scripted kneel (EzState 20200) once Wolf's deathblow TAE sends message 10 at **2.9 s**. Bespoke and cinematic, not systemic. | [D] RustSekiro enemy.md |
| Final-kill presentation | Bespoke cinematic animation, with the camera pushed in further than on regular deathblows | [S] sekiro_feel_deathblow §4 (sumelagi study) |

---

## 2. Lies of P: Fatal Attacks

| Item | Value | Tag / source |
|---|---|---|
| Trigger | The enemy must be Groggy: charged heavy while the HP bar is outlined white, then it kneels. The player has to **walk into a red circle on the ground beside the body**, or attack from behind. | [S] https://lies-of-p.fandom.com/wiki/Fatal_Attack ; https://www.gameskinny.com/tips/lies-of-p-how-to-stagger-enemies-effectively/ |
| Closing distance | **Almost none.** The player does the positioning. The circle sits next to the enemy, so any snap is small (an estimated ≤ 0.5 m) [E]. | [S] position; [E] snap size |
| Strike | Front: a **flurry of slashes** ("not necessarily" lethal). Back: a backstab thrust. | [S] gameskinny; fextralife Combat |
| Invulnerability | Throughout the execution | [S] https://www.ginx.tv/en/fatal-attacks |
| Separation | The finisher leaves the enemy **knocked down for a few seconds**. The player stands free of the body and can heal, repair the weapon, buff, or keep hitting the downed enemy. | [S] ginx |
| Duration | About 1.5–2.5 s for a standard Fatal Attack [E] | [E] |
| Control returns | Before the enemy gets up. The player has a free window while the body is on the ground [S]. Exact frame unknown. | [S] / [E] |
| Lesson | **The finisher ends with the enemy thrown or knocked to the ground and the player standing apart.** Nothing stays joined, and the player acts during the victim's downtime. | |

## 3. Black Myth: Wukong: combo finishers (no paired executions found)

| Item | Value | Tag / source |
|---|---|---|
| Finisher type | **Not a paired execution.** The sources describe a light-combo "finisher" (the last hit of the string), Focus-point heavy attacks spent "at the end of a combo as a pseudo-finisher", and bespoke boss-end cutscenes. I found no systemic sync-kill on stunned enemies. | [S] https://gamerant.com/black-myth-wukong-preview-hands-on-gameplay/ ; IGN review |
| Closing distance / embed | The staff hits and extends, then the enemy is knocked back or killed off an ordinary hit. No blade to withdraw. | [S] GameSpot review (staff elongates); [E] |
| Separation | Built in: knockback from the hit, not a joined pose [E] | [E] |
| Player complaint that matches "stuck" | Players complain that skill animations are "too long and cannot be canceled, which makes the battle feel disconnected", compared with Nioh 2 and Sekiro. Steam asks for "no animation lock." | [S] https://www.zhihu.com/en/answer/3603962574 ; Steam discussion 4763207778565372367 |
| Lesson | A long recovery that can't be cancelled reads as "disconnected" even with no attachment. Hand back cancels early. | |

## 4. Nioh 2: Grapple (enemy out of Ki) and Final Blow (enemy downed)

| Item | Value | Tag / source |
|---|---|---|
| Trigger | Grapple: a human out of Ki, or a downed yokai, with the lock-on cursor turned red; strong attack. Final Blow: stab into an enemy lying on the floor. | [S] https://nioh2.wiki.fextralife.com/Grapple ; Steam 3114781060456669582 |
| Invulnerability | "Weapon-dependent animation which provides invulnerability frames." Nioh 1 players disputed this; a GameFAQs report says the i-frames cover only the damage, not the run-in. | [S] fextralife; [S] GameFAQs 74965954 |
| Closing distance | A short step-in into a canned grab; weapon-dependent [E] | [E] |
| Withdrawal | The dual-sword grapple stabs the feet, then **"pull[s] both weapons out of the enemy at the same time"**. A clean, deliberate extraction beat. | [S] GameFAQs 78701596 (player quote) |
| Duration | Standard grapple about 1.5–2.5 s [E]. The anima grapples are "really slow", long enough for a **human boss to regenerate full stamina by the time you're done**. | [E]; [S] GameFAQs answer 541994 |
| Lesson | A long showy grapple costs the player tempo, and the enemy recovers. Players call it "bad in general." Short and readable beats long and showy. | |

## 5. Ghost of Tsushima: Standoff kills (and chain assassination)

| Item | Value | Tag / source |
|---|---|---|
| Control model | Hold Triangle to ready, **release** as the enemy commits (their feet move) | [S] Polygon; IGN wiki |
| Strike | An **iaijutsu** draw-cut: the katana starts in the saya. A *cut through*, not a stab, so nothing to embed or pull out. | [S] Zimmerman GDC 2021, 43:00–44:00 |
| Timing context | Human simple reaction time is about **300 ms**. Jin's fast attacks take **< 250 ms**. Standoff enemies attack faster than normal, with no long wind-ups. | [S] GDC 5:02, 44:00 |
| Presentation | "Some time slow down, which is important", plus animation, SFX, VFX, control model and camera. Chain assassination adds "flashy camera and ... some time slow down." | [S] GDC 44:00, 46:00 |
| Separation | Jin finishes the draw-cut past or beside the enemy, who drops on his own. The next challenger can rush in at once and is killed with a **tap**, so control returns almost on the kill [E]. | [S] chain kills (GameWith); [E] exact timing |
| Control returns | Effectively at the end of the cut. Once the last standoff kill lands, "combat continues as normal, so be ready." | [S] Twinfinite |
| Lesson | **A cut-through finisher has separation built in.** The player's body follows through *past* the enemy instead of stopping against it. | |

---

## 6. Apply to Veynhold

Phase clock as specified: **Commit 0 → Drive 0.28 → Impact 0.32 → Settle 0.55 → Extract 0.95 → (Blade-clear 1.15) → Unlock 1.40 → Collapse/presEnd 2.25 s.** The numbers below are recommendations sized to Veynhold's faster clock. The Sekiro analogues are [D]; the scaling is my judgment.

| Phase (s) | What the pair does | Recommendation |
|---|---|---|
| **Commit 0.00–0.28** | Close the distance | **One** absorb, eased (smoothstep or ease-out), over **0.22 s**, to a pair spacing of **1.05–1.2 m** for front variants (Sekiro 1.2 m) and **0.55–0.6 m** for behind/stealth. Sekiro slides the *victim* onto the attacker's spot. Do the same, so the player's own position barely jumps. For a boss or heavy victim, move the attacker instead (the Owl pattern). Skip the warp when already ≤ 1.2 m, as Sekiro's near row does. Rotate facing over the same 0.22 s; no snap. |
| **Drive 0.28 → Impact 0.32** | Blade enters | Thrust along the attacker's forward line into the chest (front) or the back/neck (behind). Hit-stop at Impact as planned. |
| **Settle 0.55 → Extract 0.95** | Hold | This is the only stretch where the pair should look joined, and it should read as tension, not a freeze: a small push-in of the attacker's hips (≤ 0.05–0.1 m), victim tremble. **Do not re-snap positions every tick.** After the Commit absorb, each body follows its own authored root track (the sekiro-rs lesson). |
| **Extract 0.95 → Blade-clear 1.15** | Withdraw and separate | **Extraction direction: the blade comes out back along its entry line (toward and past the attacker), while the victim moves the other way.** The victim's root goes forward along `extractDir` (= the entry direction, away from the attacker, with up to about ±30° sideways and the yaw variation already in the direction doc). The attacker's root steps **back 0.25–0.35 m** with an ease-out over about 0.25 s; the left-palm push or kick at 0.95 already in the direction doc is the cue. Withdrawal and push happen together, so the body slides off the blade. Nothing pulls the blade sideways out of a still body. |
| **Blade-clear 1.15** | Body released | Raise the corpse launch from 1.1 to about **1.6–1.8 m/s** along `extractDir` (+0.25 up), so the victim slides about **0.8–0.9 m** (Sekiro's behind pair ends about 0.9 m further apart, and the General moves about 1.1 m net) instead of the current 0.6 m. **Turn off corpse-vs-player blocking** from here (push-apart moves only the player, as in Sekiro) so the falling body can never pin or nudge Wolf/Wren. Drop or switch the lock-on target to the next live enemy now, not at Collapse. |
| **Unlock 1.40** | Full control | **Recommended separation at Unlock: about 2.0–2.3 m centre to centre** (1.05 + about 0.85 victim + about 0.3 attacker), reached by **1.40 s**, which is about **0.45 s** after Extract begins. Ease the camera out over 0.5–1.0 s *while the player moves* (Sekiro's slot blend is 1.0 s, distance about 2 s). |
| **Collapse 1.40 → 2.25** | Victim's business only | The corpse finishes its fall on its own clock. **The player must never wait on it.** Letterbox, desat and audio release can run on, but none of them may gate input. |

**Earliest point to honour player input:**
- **Movement stick and dodge: from Blade-clear, 1.15 s.** From that point, movement input fades the deathblow clip over 0.15 s and walks the player away. This is the Sekiro move-cancel pattern: the Owl's cancels open 2.6 s before the victim finishes. Keep the player invulnerable to *other* enemies until 1.40.
- **Attack, guard and deflect: at Unlock, 1.40 s.** Presses in [1.15, 1.40) are latched and fire at 1.40, as the direction doc already plans. Earlier presses are dropped, so mashing during the kill doesn't misfire.
- **Before 1.15: ignore the stick.** Turning disabled, as Sekiro does during the body clip.
- If 1.15 feels too early in playtest, the fallback is movement from **1.25** (after the attacker's step-back finishes). Do not wait until 2.25.

**Audio beats tied to the separation:** a blade-draw sweep (about 1.4 → 0.6 kHz) and spray at **1.15**, a foot scuff on the attacker's step-back at about **1.0**, and the corpse hitting the ground on contact. Keep the existing 0.3 s / 2.0 s low-pass muffle, but release it from the start of Collapse, never holding input.

**What prevents "stuck", as a checklist for the build agent:**
1. One absorb in Commit, then no per-tick position lock.
2. Bodies visibly moving apart from 0.95 s: the victim forward, the attacker back.
3. About 2.0–2.3 m apart by 1.40.
4. The corpse never blocks or pushes the player after 1.15.
5. Lock-on leaves the corpse at 1.15.
6. The stick works from 1.15.
7. Nothing in Collapse (2.25) gates input.

**Hedges.**
- Sekiro's withdrawal direction and kick-off are read from how the game looks on screen [E]. The data only proves that separate root motions split the pair.
- The 2.0–2.3 m target is my scaling. The data gives only partial splits: about 0.9 m from the behind hold, and the General's about 1.1 m net forward on a counter pair.
- The Lies of P, Nioh 2 and Ghost of Tsushima durations are estimates [E].
- The Wukong row is about combo finishers, because I found no paired execution system to measure.
