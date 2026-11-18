# Veynhold — Third-party licences

Checked 2026-10-23 against `src/` and the built `dist/index.html`.

## Third-party assets and code

| Asset | Where used | Source | Licence |
|---|---|---|---|
| Quaternius — Universal Animation Library (1) | Sword-combo, locomotion and idle clips, retargeted to joint rotations in `src/anim_data.json` | https://opengameart.org/content/universal-animation-library · https://quaternius.com | CC0 1.0 Universal (Public Domain Dedication), https://creativecommons.org/publicdomain/zero/1.0/ |
| Quaternius — Universal Animation Library 2 | As above | https://opengameart.org/content/universal-animation-library-2 · https://quaternius.com | CC0 1.0 Universal |
| Quaternius — Modular Character Outfits: Fantasy (free Standard edition): Male_Peasant, Female_Peasant, Male_Ranger (LOD30) | World-mode bodies on Medium / High: gaolers and the gaol sergeant (peasant), Penitent jailers (hooded ranger), Tamsin and Ilsabet (female peasant). Shipped as `assets/chars/Q_Peasant.glb`, `Q_PeasantF.glb`, `Q_Ranger.glb` | https://quaternius.com/packs/modularcharacteroutfitsfantasy.html · https://quaternius.itch.io/modular-character-outfits-fantasy · author: Quaternius | CC0 1.0 Universal |
| Quaternius — Universal Base Characters (free Standard edition): Superhero_Male head, eyes and brows (head-only cut) | The head on every body above. `assets/chars/Q_Head.glb` | https://quaternius.com/packs/universalbasecharacters.html · https://quaternius.itch.io/universal-base-characters · author: Quaternius | CC0 1.0 Universal |
| Quaternius — Universal Base Characters (free Standard edition): Superhero_Female head, eyes and brows (head-only cut), Hair_Buns and Hair_Long ("Rigged to Head Bone"), with T_Superhero_Female_Light_BaseColor, T_Hair_2_BaseColor and T_Eye_Brown | Chunk H3: the female head on the female peasant body: Ilsabet (buns), Tamsin (long hair) and, in world mode, Wren (long hair under a procedural hood). Used on every quality tier. `assets/chars/Q_HeadF.glb`, packed by `assets/tools/pack_H3.mjs` (256 px base colour only, simplified, quantised) | https://quaternius.com/packs/universalbasecharacters.html · https://quaternius.itch.io/universal-base-characters (file "Universal Base Characters[Standard].zip", downloaded 2026-11-06; its License_Standard.txt: "CC0 1.0 Universal (CC0 1.0) Public Domain Dedication … Models by @Quaternius") · author: Quaternius | CC0 1.0 Universal |
| Quaternius — Fantasy Props MegaKit (free Standard edition): Stall_Cart_Empty (canopy removed), Barrel, Crate_Wooden, Cage_Small, Chain_Coil + their trim-sheet textures | Execution Grounds props (carts, barrels, crates, the hanging cage, chains). `assets/props/Q_Props.glb` | https://quaternius.com/packs/fantasypropsmegakit.html · https://quaternius.itch.io/fantasy-props-megakit · author: Quaternius | CC0 1.0 Universal |
| Poly Haven — castle_wall_slates, medieval_blocks_02, rough_wood, rusty_metal_02, brown_mud_leaves_01 (1K diffuse + GL normal; resized, some desaturated) | Stone walls, flagstone and gaol floors, wood, iron and rust, mud and dirt ground (Medium / High; Low keeps the procedural canvases). `assets/textures/*.jpg` | https://polyhaven.com/a/castle_wall_slates · https://polyhaven.com/a/medieval_blocks_02 · https://polyhaven.com/a/rough_wood · https://polyhaven.com/a/rusty_metal_02 · https://polyhaven.com/a/brown_mud_leaves_01 · authors: Poly Haven contributors | CC0 1.0 Universal, https://polyhaven.com/license |
| Three.js r128 | `three.min.js`, embedded in the build | https://threejs.org · Copyright 2010-2021 Three.js Authors | MIT |
| GLTFLoader.js, SkeletonUtils.js (Three.js r128 examples) | `src/vendor/`, embedded in the build | Three.js Authors | MIT |
| EffectComposer.js, RenderPass.js, ShaderPass.js, UnrealBloomPass.js, CopyShader.js, LuminosityHighPassShader.js, FXAAShader.js (Three.js r128 examples, `examples/js/` at tag r128) | `src/vendor/`, embedded in the build; used only by the opt-in Ultra tier (bloom + FXAA) | https://github.com/mrdoob/three.js/tree/r128/examples/js · Three.js Authors | MIT. The FXAA 3.11 shader body inside FXAAShader.js is © 2014-2015 NVIDIA Corporation under the BSD 3-Clause licence; its notice is kept verbatim in the file and in the build. |

Since chunk F (2026-11-04) Quaternius meshes and textures ARE shipped (the rows above), re-packed by `assets/tools/pack_F.mjs` (chunk H3: `pack_H3.mjs` for the female head)
(simplified, quantised, normal / ORM maps dropped) and `assets/tools/tex_F.py` (Poly Haven resize / desaturate). The licence files
travel with the downloads in `assets_incoming/` (not shipped). CC0 does not require attribution; the credit is given anyway: the title
screen credits read "Animations by Quaternius (CC0) … Characters and props by Quaternius (CC0) … Textures by Poly Haven (CC0)".

## Original / procedural (no third-party licence)

- **Character models:** (the Quaternius world-mode bodies above excepted) the 5 rigged GLBs in `models/glb/` (Wanderer, Duelist, Iron Warden, False Brother, King's First Blade) are generated by `models/build_models.py` (numpy, pygltflib and Pillow). Their weathering textures are drawn in code. The skeleton uses Mixamo-style bone *names* only; no Mixamo content is included. World-mode foes and NPCs reuse these meshes with tints.
- **World and arena geometry and textures:** built in code (`src/world_build.js`, `src/game.js`) with runtime canvas and DataTexture surfaces.
- **Audio:** synthesised at runtime with WebAudio (oscillators and generated noise). No sample files.
- **Fonts:** system font stacks only. No embedded or downloaded fonts.
- **Code, story and data:** original.

## How this was checked

A grep of `src/*.js`, `src/data/*.js`, `src/template.html` and `dist/index.html` found:
- no external URLs, except comments inside Three.js and GLTFLoader;
- no image, audio, font or model file references;
- no `fetch`, `XMLHttpRequest`, `TextureLoader`, `<img src>`, CSS `url()`, `@font-face` or `<link>`;
- no base64 data URIs in the hand-written sources. The embedded binaries are the 5 procedural GLBs and (chunk F) the CC0 files under `assets/` listed above, all injected by `build.py`; the textures are decoded from data URIs at runtime (no file or network access).
