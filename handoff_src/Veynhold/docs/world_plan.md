# VEYNHOLD: World Plan

*Design plan for the five regions, the bosses, the weapons and the upgrades. The story bible is canon for story. `src/data/content.js` is canon for stats and timings. This file sets out what gets built and where.*

## 0. Ground Rules

- **Combat is locked.** Every enemy and boss uses the existing core attack families: duelist `d_*`, Penitent/fencer `f_*` and warden `w_*`. Deflect, posture and perilous timings stay at the locked v8 values. A new foe is a new BESTIARY entry: new stats, combo weights, branches and a new look, built on existing attacks. This is the same pattern as `namedFoes()`.
- **Perilous grammar is the same everywhere.** A thrust is answered with Counterstep, a sweep with a jump, and a grab with a dodge. Each region adds one new *pressure* on top of that grammar, never new rules: footing, reach, attack tempo or a second enemy.
- **Region structure.** Every region has a hub lantern, one loop that opens back to the hub, one secret, one optional mini-boss or duel, one main boss, and an exit gated by a key or event. The world is linear between regions and loops inside each region. Later regions also open shortcuts back to earlier ones.
- **Palette.** Each region keeps the shared dark base and gets one accent colour from the Vein: red stone, hollow wood, black water, ash, and finally an unnatural green.

---

## 1. The Execution Grounds (built). *The Rope That Broke*

**Identity.** Wet flagstones, bone and iron. It is dawn after a hanging. **Palette:** slate grey, rope tan, and red gallows stones (the first visible sign of the Vein).

**Layout (as shipped):** Corpse Pit, Gravedigger's Cut, Gallows Yard, the Gaol, Muster Field, the Ossuary (secret, with the gallows chapel), Headsman's Stair, the Block (boss ring) and the Hollowwood Gate.

**Routes.** The Pit leads to the Yard (yard lever), then the Gaol (Gaol Key from Brask), the Muster Field, the Stair and the Block. The Ossuary is reached through the low-wall breach in the yard, and its bar lifts from inside onto the Muster Field as a shortcut. **Lanterns:** Gravedigger's, Gaol and Stair.

**Optional.** Names for the Dead (3 tags, Ember Vessel); the Caged Crane (Gibbet Key); Sallow's chapel duel in the Ossuary.

**Enemies.** Gallows Gaoler (teaches the deflect rhythm), Penitent Jailer (thrust and feints, teaches Counterstep), Chain Gaoler (sweep and grab), Sergeant Brask.

**Rewards.** Ward's Blade, Ember Vessel, Penitent's Tithe, Warden's Yoke, Headsman's Key.

**Revisit hooks.** Tamsin's post fills with names as later quests return them: levy tins from Saltmere, and the feather if Ilsabet died. If Names is complete, Tamsin leaves for the Abbey after the March and the pit is left empty. A one-way drop from Hollowwood's first glade lands on the Muster Field wall, so the trip back is short.

**Hours:** 1.5 (1.0 critical, 0.5 optional).

---

## 2. Hollowwood. *The Lamp-Brand*

**Identity.** An ancient forest hollow to the roots, half burned by Huntsmen. Unsworn lanterns hang deep inside it. It is quiet, cramped and vertical, and the player is the one being hunted. **Palette:** char black, bone-white dead bark, ember orange, and the red sap glow inside hollow trunks.

**Layout**
1. **The Hollow Road.** The gate road under dead oaks, with a Huntsmen checkpoint and burning carts. *Lantern: Roadside Lantern.*
2. **Charcoal Rows.** Kilns and woodcutters' sheds. A ridge of stacked logs overlooks the Rows.
3. **The Burned Camp.** A ruined Unsworn camp with the carved cradle (lamp-brand). This is where the Burned Cradle quest starts.
4. **Rootcellar Hollows.** Tunnels inside giant trunks lit by red sap seams. Landmark: the **Heartwood Bole**, one living tree in the dead wood.
5. **Huntsmen's Lodge.** Trophy racks and kennels. Ilsabet's feather hangs here if she died.
6. **Rook's Lamp (Unsworn Refuge).** A hidden clearing of oil-lamps. *Hub lantern: Rook's Lantern.*
7. **The Gallow-Oak.** A huge hollow oak hung with Unsworn bodies. Boss arena.
8. **Drainroot Channel.** Root-channels draining south-east. A flooded tunnel leads to the March.

**Routes and shortcuts.** The Road leads to the Rows, the Camp, the Refuge (hub), the Lodge and the Gallow-Oak. The Rootcellar Hollows loop from the Rows back up under the Refuge, through a ladder that drops from the hub side. A rope bridge over the Lodge ravine is lowered after Thorne. *Lanterns:* Roadside, Rook's and the Lodge Kennels. The exit is the Drainroot Channel after Thorne. It is also the hidden route in Rook's choice.

**Optional and secrets.**
- **Heartwood Bole** (inside the Hollows, reached by a climbing route through the trunks): **Heartwood Sap**.
- **The Burned Cradle:** three camp relics (the cradle-brand, a lamp-mother's flask in the Rows, and a swaddling cloth tied with red thread on a Lodge trophy rack).
- A charred hunter's stand above the Road holds the Cranes' tally-sticks (R2 clue) and a lore page with the Unsworn song "the lantern man who went into the hill" (R4).

**Enemies**
- **Huntsman** (duelist base): d_slash strings, more delayed beats, high footwork, keeps its distance and **flanks in pairs**. The region's pressure is two foes at once.
- **Kennel Hound** (light jailer reskin, f_quick tempo): low posture and an f_thrust lunge marked perilous. It teaches Counterstep under pressure.
- **Torchman** (brute base): w_sweep becomes a burning log swing. Jump it.
- **Hollow-Sworn Woodcutter** (gaoler variant): a slow overhead axe with a long hold. It teaches patience against the delay.
- *If the Crane was refused:* an **Unsworn Trial** duel against Rook's champion (duelist, d_counter-heavy) before the Refuge will help.

**NPCs and quests**
- **Mother Rook** (main): reads Wren's palm and confirms R3. **Optional:** the Burned Cradle, which names Isolde of the Lamp. **Rook's request:** reveal the hidden route to the March (Key Choice 3).
- **Ilsabet Crane** (if freed): brings Cranes to the Refuge, arms the Lodge assault, and is summonable for Thorne.
- **Unsworn lamp-maker:** refills one extra Draught use per region once trust is earned (flavour, gated on crane_freed or the trial).

**Rewards.** Huntsman's Hooks (Thorne), Heartwood Sap, the lore chain for R3 and R4, and the Drainroot route.

**Revisit hooks.** If Rook's route was shown, Unsworn fighters appear in later regions. In late game the Lodge kennels open onto a cliff path that drops to the Abbey kiln-yard (a back door into the Abbey that skips the causeway).

**Hours:** 2.75 (1.75 critical, 1.0 optional).

---

## 3. The Drowned March. *Two Hundred and Twelve*

**Identity.** Sunken farmland, knee-deep black water and drowned oathstones glowing red under the surface. Long sightlines, fog and bells. The region's pressure is **footing**: deep water slows the dodge, so deflecting matters more than evading. **Palette:** black water, reed-gold, pewter sky, and red under the shallows.

**Layout**
1. **The Root-Mouth.** The Drainroot exit into a reed marsh. *Lantern: Reedline Lantern.*
2. **Levy Row.** Abandoned farmsteads with the levy's oathstone, flooded to the waist.
3. **The Drowned Shrine.** A half-sunk chapel with the fresco of young Aurec holding a lantern (R4 clue).
4. **The Sunken Bell Tower.** A tilted tower standing in a mere. Optional mini-boss.
5. **Eelgate Villages.** Two stilt villages that the Sluice Choice will flood. *Hub lantern: Eelgate Lantern.*
6. **Saltmere Crossing.** A wide flooded causeway where the ninth levy drowned. Levy tins lie beneath it.
7. **The Tide Warden's Tower.** The sluice house and a gibbet row of Saltmere survivors. Boss arena: the sluice deck.
8. **The Ash Causeway.** A raised road climbing onto the Abbey hill.

**Routes and shortcuts.** The Root-Mouth leads to Levy Row and then Eelgate (hub). From the hub the path splits to the Shrine and the Bell Tower (optional), or onward to Saltmere and the Tower. A plank causeway from the Tower lowers back to Eelgate. *Lanterns:* Reedline, Eelgate and Sluice House. The exit is the Ash Causeway, unlocked by Hollin's Sluice Key.

**Optional and secrets.**
- **Sunken Bell Tower:** the Bellwarden mini-boss, then the **Drowned Bell**.
- **The Ninth Levy:** recover levy tins at Saltmere. Most are reachable only once the sluices are open, so they are full only on the Open choice.
- **Hollin's sluice log** ("water raised before muster, as instructed") sits in the tower office and confirms R2.
- A secret dive-path in the Shrine crypt leads to a coin cache: recent coins stamped with the same face as the fresco.

**Enemies**
- **Levy Ghoul.** Not undead: these are starving deserters who went feral. Gaoler base with frantic d_slash chains and low posture. They come in packs and should be deathblown quickly.
- **Sluice Warden** (brute base): w_grab out of the water. Dodge it, and the dodge is slowed.
- **Marsh Pikeman** (jailer base, long range): d_thrust spam at a distance. Counterstep, then close in. This is a natural matchup for the Tide Halberd later.
- **Bog-Penitent** (jailer variant): f_feint into a perilous thrust. Penitents baptise the dying here.

**NPCs and quests**
- **Ilsabet** (if freed): leads Unsworn fighters, can be summoned at Saltmere, and makes peace with herself through the Ninth Levy.
- **Eelgate Reeve:** begs Wren to hold the sluices. This is the Sluice Choice (Key Choice 4).
- **Old Bellringer:** optional. He asks for the bell silenced and points the way to the tower.
- *If Names is complete:* Tamsin's letter arrives through a ferryman asking for the levy tins.

**Rewards.** Tide Halberd (Hollin), Drowned Bell, levy tins and the Sluice Key.

**Revisit hooks.** **Open:** Saltmere drains and the floor of the crossing becomes walkable, with the tins, the remaining dead and a crypt route to the Abbey ossuary. The Eelgate villages flood, the hub lantern moves to the tower, and the villagers turn hostile in dialogue. **Hold:** the villages stay, the merchant stays, and Saltmere keeps its dead.

**Hours:** 3.0 (1.75 critical, 1.25 optional).

---

## 4. The Abbey of Ash. *The First Roll*

**Identity.** A monastery on a hill made of seventy years of ash. Kilns smoke day and night. The Penitent coup is underway: the lower cloisters are a battle, and the upper library is under siege. The region's pressure is **tempo**: Penitents feint and mix delays, so the player must not panic-press. **Palette:** ash-white, soot, candle amber, and red kiln-glow.

**Layout**
1. **The Ash Steps.** The causeway's end, with a pilgrim gate held by Penitents. *Lantern: Pilgrim Lantern.*
2. **The Lower Cloister.** A garth littered with coup dead, Penitents fighting loyal brothers.
3. **The Kilns.** Burning halls where the dead are reduced to ash. Optional mini-boss.
4. **The Archive of Rolls.** Endless shelves of swearing rolls with a name for every oath.
5. **The Bell Gallery.** A walkway over the cloister and the loop back to the Ash Steps.
6. **The Upper Library.** Hester's barricade. *Hub lantern: Library Lantern.*
7. **The First Roll Vault.** A sealed reliquary holding the single roll whose ink is still wet-red (R4).
8. **The Chapter House.** The Penitent coup's seat. Boss arena.
9. **The Kiln-Tunnel.** Hidden, following the Vein into the Crownlands.

**Routes and shortcuts.** The Steps lead to the Cloister, the Archive, the Bell Gallery, the Library (hub), the Vault and the Chapter House. The Bell Gallery drops a ladder back to the Steps. The Kilns are a side branch off the Cloister and join the Kiln-Tunnel at the back. *Lanterns:* Pilgrim, Library and Kiln. **Exits:** the pilgrim road north (main), or the Kiln-Tunnel (shortcut that skips the Crownlands' outer fields).

**Optional and secrets.**
- **The Kilns:** the Kiln-Father mini-boss, then the **Ash Censer**.
- **Ilke's cell:** her intercepted letters bearing the **King's** seal (R5 clue).
- **Hester's research notes** ("The Vein cannot drink what was not sworn," R6).
- Archive secret: Wren's own roll entry is blank, with a margin note in Aurec's hand: "Not to be sworn."

**Enemies**
- **Penitent Zealot** (jailer variant): f_feint, f_delay and d_thrust in long chains. It is the region's tempo test.
- **Censer Brother** (brute variant): w_swing becomes a censer swing. A smouldering hit pauses the player's posture regen for a moment, using the existing posture-regen-delay field. No new rule is needed.
- **Kiln Acolyte** (gaoler base): weak, carries ash pots, and serves to break up a fight.
- **Loyal Brother** (neutral): fights the Penitents. If Wren spares him he becomes a temporary ally.

**NPCs and quests**
- **Abbess Hester Vane** (main): opens the Vault and explains what an oath weighs. She gives the **Rite of Ash**. She dies if Wren dawdles past the Chapter House trigger or sides with Sallow.
- **Brother Sallow:** coup leader and Abbey boss. Spare and turn him (needs Names), or kill him.
- **Tamsin** (if Names): arrives with the post's names for the unwriting.
- **The Ledger** (begins here): Hester asks for the original ledgers from the Crownlands.

**Rewards.** Rite of Ash, Ash Censer, the First Roll (R4), Sallow's outcome flag, and Hester's alive or allied flag.

**Revisit hooks.** After the coup, the Chapter House bell opens the Kiln-Tunnel from both ends. If Hester lives, the Library becomes the final-act hub, where delivering the ledgers sets up the unwriting.

**Hours:** 2.75 (1.75 critical, 1.0 optional).

---

## 5. The Crownlands. *Too Green*

**Identity.** Impossibly lush fields, fat cattle and a kingdom that is well fed and unquestioning. It is beautiful, and that is what makes it unsettling. The region's pressure is **mastery**: courtly duelists who deflect back, read the player and punish button-mashing. **Palette:** saturated green, gold leaf and lantern-white, with red only underground.

**Layout**
1. **Harvest Road.** Rich farms and villagers who bow. Few enemies; the region opens with silence. *Lantern: Waymark Lantern.*
2. **Granary Town.** Overflowing granaries and the Lantern Guard garrison.
3. **The Orchard Terraces.** Climbs toward the hold, with Huntsmen hunting Wren.
4. **The Lantern Court.** The courtyard of the hold. *Hub lantern: Court Lantern.*
5. **The Ledger Gallery.** Corran's offices and the unforced lock (R5).
6. **The Wards' Quarters.** Empty except for Wren's room, kept exactly as she left it.
7. **The Throne Hall.** The empty throne with **Lanternfall** hanging above it, and Aurec's note. Crownlands boss arena.
8. **The Hill Mouth.** The threshold. Allies stop here.
9. **The Vein's Heart.** The final descent and Aurec's arena.

**Routes and shortcuts.** The Harvest Road leads to Granary Town, the Terraces, the Court (hub), the Ledger Gallery and Wards' Quarters (side wings), the Throne Hall, the Hill Mouth and the Heart. The Kiln-Tunnel from the Abbey surfaces in the granary cellars. A servants' stair joins the Ledger Gallery back to the Court. *Lanterns:* Waymark, Court and Hill Mouth.

**Optional and secrets.**
- **The Ledger:** persuade Corran (requires the order book from the Gallery and R5 dialogue) or take the ledgers by force.
- **Wards' Quarters:** the cradle-blanket thread (R6 clue). If the Burned Cradle is complete, a portrait of Isolde is hidden here.
- **Royal Granary:** the epilogue setup. It can be unlocked with Corran's keys.

**Enemies**
- **Lantern Guard** (duelist base): high deflectSkill and guardChance, using d_counter and branch-heavy combos. They punish greed.
- **Court Huntsman** (Hollowwood Huntsman, upgraded).
- **Gilded Warden** (brute base with the warden super-armor flag on w_charge only). It is the final posture check.
- No enemies in the Heart except Aurec.

**NPCs and quests**
- **Steward Maelis Corran:** the Ledger quest, then she flees or surrenders.
- **Ilsabet / Unsworn** (by choices): hold the Hill Mouth.
- **Aurec's note** on the throne: "Come down, Wren."

**Rewards.** Lanternfall, the original ledgers, R5 and R6, and the endings.

**Revisit hooks.** None; this is the end. After the final boss the game is completed through the epilogue cards.

**Hours:** 2.5 (1.75 critical, 0.75 optional).

---

## 6. Boss Table

| # | Boss | Region / arena | Identity | Rhythm | Signature mechanic | Punish windows | Reward |
|---|---|---|---|---|---|---|---|
| 1 | **Odran Vale, the Iron Warden** (built) | Execution Grounds: the Block | A headsman, proud of his craft, who knew what the stones did | Slow and heavy, then aggressive in phase 2 | Warden super-armor; phase 2 charge-and-grab mix-ups | After w_slam recovery; after a jumped w_sweep; a dodged w_grab gives a long opening | Headsman's Key, Warden's Yoke, confession |
| 2 | **Brother Sallow, the Smiling Penitent** | (a) Ossuary gallows chapel, optional. (b) Abbey Chapter House, main Abbey boss | A gentle zealot and Ilke's confessor | Soft and pastoral: feints, delays and a perilous thrust | (b) **Coup duel**: zealots join at 50% HP. If Names is complete, telling him Ilke's name breaks his posture and opens the **spare** option | After a Counterstep on d_thrust; f_feint whiffs if you hold guard | (a) withdraws. (b) spare/turn or kill flag |
| 3 | **Garrick Thorne, the King's Huntsman** | Hollowwood: the Gallow-Oak | Burned Wren's birth-camp and is not sorry | Stalking: retreats, circles and lunges in | **Hounds**: two Kennel Hounds at 60%. Kill or ignore them; he whistles them back after each deathblow mark | After a Counterstepped lunge; while he whistles for the hounds | Huntsman's Hooks |
| 4 | **Sir Edric Hollin, Tide Warden** | Drowned March: the sluice deck | A drunk who raised the water and hanged the survivors | Wide, reaching and lumbering; long holds | **Rising water**: at 50% he opens a sluice. The deck floods, the dodge slows and w_sweep becomes the main threat | Recovery after a w_sweep you jumped; he drinks after every second combo | Tide Halberd, Sluice Key |
| 5 | **Ser Corvin Hale, the First Ward** | Crownlands: the Throne Hall | The eldest Ward, sworn, captain of the Lantern Guard. The sworn version of Wren | Mirrors Wren: court duelist with d_counter, deflect-backs and branching | **Mirror**: he deflects the player's 3rd chain hit, so the player must vary chains and use Counterstep | After deflecting his d_over; his d_counter whiffs against an unpressed guard | Throne access, Lanternfall, the Court lore |
| 6 | **King Aurec, the Lantern King** | The Vein's Heart | The teacher and father who waited | **P1:** courtly swordsman, reads tells, punishes repetition. **P2:** Vein-fed, with red perilous strikes (thrust, sweep, grab, all in one string). Posture regenerates fast and refuses to break below one mark. **P3:** a tired old man; slow and honest, long recovery | Phase gates are story beats. P2 can only be finished with the **Lanternfall** charged wave or by a Counterstep perilous chain. In P3 the oathless deathblow lets him go | P1: after the d_slash2 tell he taught her. P2: after every perilous counter. P3: every recovery | Ending choice |
| 7 | **The Bellwarden, Maudry Sowle** (optional) | Drowned March: the Sunken Bell Tower | A lesser warden who rang the muster bell for Saltmere | Heavy brute | **Bell toll**: every toll forces a w_grab next. The toll is the tell | After a dodged grab | Drowned Bell |
| 8 | **The Kiln-Father** (optional) | Abbey: the Kilns | The Penitent who burns the dead and believes the ash is holy | Relentless, short gaps | **Smoulder**: censer hits pause posture regen, so the player must deflect, not block | After a jumped w_sweep; after his censer overheats (3 swings) | Ash Censer |

Conditional extras (not counted): the **Unsworn Trial** if the Crane was refused, and an Ilsabet summon for bosses 3 and 4 if she was freed.

---

## 7. Weapon Roster (from content.js)

| Weapon | Moveset | Distinct mechanic | Where found |
|---|---|---|---|
| **Ward's Blade** (implemented) | sword | Full four-hit chain, charged thrust, riposte and air plunge. The balanced baseline | Execution Grounds: the corpse cart |
| **Huntsman's Hooks** | hooks | Fast, short and low on posture damage. A hooked strike on a guarding foe **drags their guard open**, which suits the Lantern Guard and Penitents | Hollowwood: dropped by Thorne (critical path) |
| **Tide Halberd** | halberd | Long reach and wide sweeps; slow recovery. Heavy strikes **break posture from beyond sword range**, which suits pikemen and brutes | Drowned March: dropped by Hollin (critical path) |
| **Ash Censer** | censer | Chained, **unblockable smouldering swings** that stop enemy posture from recovering. Strong against the high-regen Aurec P2 | Abbey: the Kiln-Father (optional) |
| **Lanternfall** | greatsword | Charged strikes release a **travelling wave of light**. The answer to Aurec P2 | Crownlands: above the throne after Hale (critical path) |

Swapping weapons happens at lanterns only. Balance follows one rule: no weapon changes deflect timings. Each one changes only how the player *spends* an opening.

---

## 8. Permanent Upgrades (6)

| Upgrade | Effect | Source | Path |
|---|---|---|---|
| **Ember Vessel** | +1 Lantern Draught | Execution Grounds: Names for the Dead (Tamsin) | Optional (built) |
| **Penitent's Tithe** | Deathblows restore 15% HP | Execution Grounds (as shipped) | Built |
| **Warden's Yoke** | +20% max posture | Execution Grounds: Odran | Critical (built) |
| **Heartwood Sap** | +20 max HP | Hollowwood: the Heartwood Bole | Optional |
| **Drowned Bell** | Posture recovers 40% faster while guarding | Drowned March: the Bellwarden | Optional |
| **Rite of Ash** | Draughts heal more and clear half your posture | Abbey: from Hester (or on the Library lectern if she died) | Critical |

There is one upgrade per region beyond the first, with none in the Crownlands. No currency and no grinding. A critical-path-only player has Yoke and Rite, and the encounters in the last two regions are tuned to be fair on exactly that kit.

---

## 9. Critical Path vs Optional Content, and Hour Budget

**Critical path.** Odran, then Hollowwood (Rook's reveal, Thorne), the March (Saltmere, Hollin, the Sluice Choice), the Abbey (the Vault, Sallow), the Crownlands (the Ledger Gallery, Hale, Lanternfall) and finally Aurec.

**Optional.** Names, Crane, the Sallow chapel duel, the Burned Cradle, the Heartwood Bole, Rook's route choice, the Bellwarden, the Ninth Levy, the Kiln-Father and the Censer, Ilke's cell, the Ledger, the Wards' Quarters, and the Unsworn Trial.

| Region | Critical (h) | Optional (h) | Total (h) |
|---|---|---|---|
| Execution Grounds | 1.0 | 0.5 | 1.5 |
| Hollowwood | 1.75 | 1.0 | 2.75 |
| Drowned March | 1.75 | 1.25 | 3.0 |
| Abbey of Ash | 1.75 | 1.0 | 2.75 |
| Crownlands (+ Aurec) | 1.75 | 0.75 | 2.5 |
| **Total** | **8.0** | **4.5** | **12.5** |

Targets: a critical-path run takes about 8–9 h, a typical run about 11 h and a completionist run with the best ending about 13–14 h, inside the 10–15 h band. The Names ending requires roughly 80% of the optional content.
