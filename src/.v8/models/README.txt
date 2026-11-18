VEYNHOLD — rigged character GLBs (procedurally built, game-ready low poly)

Files: Veynhold_Wanderer.glb, Veynhold_Duelist.glb, Veynhold_IronWarden.glb, Veynhold_FalseBrother.glb, Veynhold_KingsFirstBlade.glb
Each: one skinned body mesh, a separate unskinned "Blade" node parented to RightHand (grip at origin, blade along +Z),
PBR materials with small embedded weathering textures, and one looping clip "Idle_Guard" (3 s).
The King also has a separate skinned node "PhaseII_Cracks" (emissive) — hide it in Phase I, show it in Phase II.

Conventions: metres, +Y up, character faces +Z, bind pose = T-pose, all joint rest rotations = identity.
Skeleton (Mixamo names, no prefix): Root > Hips > Spine > Spine1 > Neck > Head > HeadTop_End;
Left/Right Shoulder > Arm > ForeArm > Hand > HandEnd; Left/Right UpLeg > Leg > Foot > ToeBase > Toe_End;
Cape1..Cape4 > Cape_End (from Spine1), Scarf1..Scarf3 > Scarf_End (Wanderer, from Neck).
Weights: up to 2 influences per vertex, 50/50 blends at shoulders, elbows, hips, knees and spine; capes and scarf
blend linearly down their bone chains; skirt panels blend from Hips to each thigh.

Material slots: Cloth, Armor, Trim, Skin, Shadow (face void), Cape, Scarf, Blade, Edge (King's crimson edge, emissive),
PhaseII_Cracks (emissive). Colours mirror the game's LOOKS table.

Validated: Khronos glTF-Validator 0 errors / 0 warnings on all five; loads and animates in three.js r128 GLTFLoader.
Rebuild / change: python build_models.py (numpy, pygltflib, Pillow).
