# Repair log

## Chunk A: the opening (Corpse Pit + Gallows Yard)

**A (commit dadcfc0): posed corpses, blood, sword, lanterns**
- **Corpses:** posed humanoid corpses replace the old bodies. They are baked once per pose and merged per material, about 10 draw calls for every corpse in the region. On Low the budget is 6 posed bodies; the rest fall back to shrouds. Fixed bodies sit on the cart bed, against the pit walls, and slumped at the foot of the Long Gallows.
- **Blood:** fewer, smaller stains.
- **Sword:** the Ward's Blade is a real 3D sword with steel, glint, a draw-ring SFX and a pickup flash. It is no longer a floating wisp.
- **Lanterns:** the Vigil Lanterns were rebuilt: iron cage, glass panes, candle, coal glow while unlit, rising embers while kindled.

**A2 (branch chunkA2): opening polish.** Details in `docs/chunk_A2.md`.
- **Sword readability fixed.** Lying flat on the cart bed, it didn't read from about 6 m. It now stands upright, planted in the mud beside the cart: about 15° tilt, 1.12× scale, earth disc, a brighter glint on the upper blade. The interaction point moved next to it. The E prompt and the pickup were verified with real key input in Playwright (`.test/shots_A2.js`) and in jsdom (`p1.js`).
- **Gallows corpse, cart body, wall slumps and lanterns checked on High and Low.** Nothing is floating or clipping; measured mesh bounds are in `chunk_A2.md`. Noted, not changed: Low-tier shroud fallbacks read pale.
- **Set dressing for immersiveness, limited to the Corpse Pit and Gallows Yard:**
  - Stools kicked over on the drop, spare and cut rope
  - Personal effects: boots, hats, bundles, cups
  - A lime bucket by the graves
  - A posted writ of execution: a canvas texture with a struck-through name and a red seal
  - Two crows (gallows beam, grave marker). They bob, peck and look around, then fly off with a caw when you approach.
- **Cost:** one merged vertex-coloured mesh per area, plus the writ and the crows. Static chunks are unchanged (199); 6 small dynamic meshes were added. No new lights or shadow casters, one 256×320 texture, Lambert twins on Low.
