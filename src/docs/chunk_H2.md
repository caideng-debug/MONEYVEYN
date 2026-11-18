# Chunk H2: sword feel

Branch `chunkH2` (from master `08b76f9`). `src/core.js` is unchanged (md5 `74a5299e9a45d86aaddc90e2f1831821`), and so is combat timing: everything here is presentation, run after the sim and never read back by it. `src/world_boss.js` carries one line (the `dbEntry` layer in the `'impale'` sfx case); H1 owns the rest of that file.

## What changed

### 1. Blade lag, kick and sway (`Character.bladeFeel`, `Character.kickBlade`, src/game.js)
Runs every frame after `root.updateMatrixWorld`, before the trail samples the tip. It rotates the blade about its grip in world space, then writes the result back as a local quaternion. It acts on the same object `Fin.post` aims: the skinned model's `Blade` (along +Z) or the block rig's `wrist` (along −Y). `Model.update()` and the pose rig rebuild that rotation every frame, so the offset never accumulates.

- **Lag.** A critically damped direction spring (ω = `bladeLagHz` 30 rad/s) chases the blade's target direction. It uses the exact closed-form step, sub-stepped with the target swept across the frame, so the result does not depend on the frame rate. The shown lag is `bladeLag · tanh(raw / bladeLag)`, a soft cap at 10°. The spring snaps on real discontinuities: a new blade object (model swap), a fade-out, a teleport (more than 1 m in one frame) or a stalled frame (dt > 0.25 s). **This departs from the plan's "snap if the jump is over 50°".** A probe of the player's clip strings found the blade turning more than 50° in a single 60 fps frame about 5 times a second, up to about 160°, and more often at 20 fps. An angle snap therefore wiped the lag at the peak of every swing; in one High frame mid-swing the lag read 0°. Instead, the spring state is kept within 3× the cap, so a pose pop shows at most the 10° cap and settles in about 0.15 s.
- **Kick.** A second critically damped spring (ω = `bladeKickHz` 22), started by an impulse: x(t) = A·ωt·e^(1−ωt), which peaks at A after 45 ms. The kick direction comes from the swing: the attacker's tip recoils against its own swing, and the defender's tip is pushed along it. If no swing is measured, the horizontal line between the two fighters is used. Peaks in degrees (attacker / defender): hit 5 / –, block 8 / 4.5, deflect 11 / 5.5, perfect 14 / 7, all ×1.35 for heavy or finisher attacks, ×`bladeKick`.
- **Sway.** About 0.6° (×`bladeSway`, ×wind) of two-axis breathing in idle and guard, 35 % while moving, none otherwise, eased in and out.
- **Deathblows.** The weight drops to 0 in `deathblowExec`, `deathblowed`, `dead` and `f.dead`, which clears the springs, and fades back in over 0.15 s. `Fin.post` therefore aims a clean blade, and the align numbers are unchanged.

### 2. Kick triggers (`Game.handleEvents`)
`hit`, `block` and `deflect` call a shared `feel()` that applies the kicks, the trail spike and the presentation hold.

### 3. Trail spike (`Trail.push`)
On impact the attacker's trail gets `spike` = 1 (0.7 on a block). Brightness is ×(1 + 1.6·spike·`trailSpike`). The tail exponent goes from 2 to 0.7, so the arc reads longer. The spike decays as e^(−13t) in presentation time, so it holds through a hit-stop.

### 4. Presentation hold (`Hold`, `Character.hsT`)
Heavy or finisher hits hold for `hsHeavy` 0.05 s, and perfect deflects for `hsPerfect` 0.075 s. The user did not answer the open question about the perfect hold, so it is included and tunable. During the hold, the two fighters' blade feel, their trails and the impact FX (`FX.update`, `VFX.update`) run at 4 % speed. The hold is capped at the remaining core freeze of those fighters (`max(freeze) · sim.dt`): 5 ticks = 0.083 s for heavy, 7 ticks = 0.117 s for perfect. It never outlasts the sim's own hit-stop, and it changes nothing in the sim.

### 5. Material reverb sends (`AudioSys.makeIR / sendOf`, `AudioSys.SENDS / SEND_OF`)
There are four convolver sends, each built lazily from a generated IR: decaying noise through a one-pole low-pass whose cutoff falls over the tail. `ConvolverNode.normalize` evens out the levels.

| send | IR | used by | Low |
|---|---|---|---|
| air | 0.55 s, 6.0→2.2 kHz, gain 0.38 | whoosh, dodge, finisher | off |
| steel | 1.6 s, 9.0→2.6 kHz, gain 0.63 | deflect, block, perfect, mikiri, chip, guardUp, late, glint | on |
| flesh | 0.32 s, 1.4 kHz→500 Hz, gain 0.3 | hit, kick | off |
| exec | 2.8 s, 1.8 kHz→380 Hz, gain 0.35 | deathblow, execSting, **dbEntry** | on |

On those sounds a send replaces the old shared 1.8 s room. Sounds without a send (break, phase, win, death, the music bed) keep the old room exactly as before. `dbEntry` is new: a 38→24 Hz sub thud with a dark low-passed body, played at the impale through the exec room. Its one-line hook is in `world_boss.js` `sfx('impale')`.

## Tune panel / VISUAL keys
`bladeLag` 10, `bladeLagHz` 30, `bladeKick` 1, `bladeKickHz` 22, `bladeSway` 1, `trailSpike` 1, `hsHeavy` 0.05, `hsPerfect` 0.075. Tune rows: Blade lag (deg), Blade impact kick, Blade sway, Trail impact spike, Heavy-hit hold (s), Perfect hold (s). Any of them set to 0 turns that part off.

## Measured numbers

**Blade feel** (`.test/blade_H2.js`, jsdom, High and Low give identical results)
- Peak lag on fast swings is **10.0°** on the light string, the heavy, and the light string at 20 fps (the soft cap). The raw spring reaches 48–67° mid-swing on High frames; the 142° in the jsdom run is clip pose pops. At rest the lag is 0.8° (breathing and sway); 40 frames after a swing it is 0.2°. In the real-Chromium frames the lag reads 10° mid-active, 7.9° at the end of the active window and 6.5° 0.1 s after it, which is the follow-through.
- Block kick: attacker 7.96°, defender 4.48°. It peaks 33–50 ms after contact (sampled at 60 fps; 45 ms analytic). At 0.25 s it is down to **6.1 %**.
- Perfect deflect kick: attacker 13.8° in the jsdom test, 13.81° / 6.91° in the browser. It moves only 1.6° during the hold, and is down to **5.8 %** 0.25 s after the hold ends. Heavy-hit kick in the browser: 6.67° (5 × 1.35 = 6.75 analytic).
- Holds: perfect 0.075 s, inside the 7-tick (0.117 s) freeze. Heavy 0.05 s, inside 5 ticks (0.083 s). The cap is checked by a 2-tick freeze, which gives 0.033 s. A light hit gets no hold. In a real perfect deflect in Chromium, the hold read 0.058 s one frame after the event.
- Trail spike: 0.272 at 0.1 s (e^(−1.3) = 0.273).
- During deathblowed the weight is 0 and the kick is cleared; it fades back in over 9 frames (0.15 s). A teleport snaps the spring. A 69° one-frame blade turn is not snapped and shows 10.0°.
- Cost: `bladeFeel` takes 6.7–8.7 µs a call in jsdom, run for each character that is not culled. On Low it is the same code; nothing extra is drawn.

**align.js** (deathblow blade on the seam): 20/20. missT is 0.000 m on all four (m5 gut / armpit / neck, Odran gut), and the along-spine miss is 0 / 0.158 / 0 / 0. That is identical to master: the change is 0.000 m, inside the 0.02 m budget.

**Audio** (`.test/audio_H2.js`, OfflineAudioContext in Chromium, 44.1 kHz; the IRs are seeded so the numbers repeat). "wet" is the reverb-only energy relative to the dry sound; tail60 is the time until the sound is 60 dB under its peak; centroid is of the reverb tail after the dry sound ends.

| sound | wet (dB) | tail60 dry → wet (s) | tail centroid (Hz) | Low |
|---|---|---|---|---|
| whoosh / heavy | −21.9 / −21.6 | 0.39 → 0.41 | 1574 / 967 | dry |
| hit / heavy | −17.9 / −18.5 | 0.15 → 0.30, 0.25 → 0.32 | 99 / 56 | dry |
| block | −13.4 | 0.18 → 1.31 | 652 | same as High |
| deflect | −12.9 | 0.51 → 1.34 | 2122 | same |
| perfect | −13.3 | 0.79 → 1.40 | 593 | same |
| deathblow | −8.0 | 0.81 → 2.71 | 79 | same |
| dbEntry | −10.4 | 0.88 → 2.59 | 43 | same |

Peaks are unchanged by the sends (for example, deflect is 0.249 dry and wet), so there is no added clipping. The gains were tuned in three passes, from first-pass levels of −40 dB (air) and −30 dB (steel) to the table above. The first numbers were spoiled by the IR build drawing from `Math.random`, so the test now builds the IRs before it seeds the sounds.

**Frames** (`.test/shots_H2.js`, real Chromium on swiftshader, skinned models, High and Low, feel on vs off, fixed 1/60 s steps; in `shots/`, which git ignores): `H2_<q>_<on|off>_swing`, `_close_a…d` (the blade through the 2nd light), `_hit` (heavy, impact frame in the hold), `_hitKick`, `_deflect` (a real perfect deflect), `_deflectKick`. What they show by eye:
- With feel on, the blade visibly trails the forearm mid-swing and is still catching up after the wrist stops.
- On the heavy hit, the trail arc is brighter and reaches further back. It reads as a flare, not a slab.
- After a perfect deflect, the attacker's blade is thrown up and back.
- On Low the same moments read the same way, with no new renderables.
- The deflect impact frame is whited out by the existing v7 perfect FX (flash, glare, rings) with feel on and off alike. H2 did not change that; it is worth a look in a later visual pass.

## Tests
All tests ran on the final build (commit 2 code, `python3 build.py && cp dist/index.html dist/Veynhold.html`), each wrapped in `flock /tmp/vh_browser.lock`:

| suite | result |
|---|---|
| ct (core self-tests) | 72/72 |
| v8 | 40/40 |
| v6 | 29/29 |
| p1 | 97/97 |
| align | 20/20 (missT 0.000 m on all four, unchanged) |
| deathblow_seq | 18/18 |
| merge | 19/19 |
| smoke | 6 encounters, 40 s of random play each, no errors; restart ×5 leaks nothing (108 → 108, pair 113 → 113) |
| **blade_H2** (new) | 48/48 (24 High + 24 Low) |

`src/core.js` md5 is still `74a5299e9a45d86aaddc90e2f1831821`. Running v8 needs `dist/Veynhold_v7.html`, which is git-ignored; it was copied from `/workspace/veynhold/dist/`.

## Notes
- `world_boss.js` is touched in one line only (`sfx('impale')` ends with `audio.play('dbEntry', { vol: v })`). H1 is rewriting the deathblow in parallel, so a merge needs only that line.
- The test-path seds are not committed (`git checkout -- .test/` before each commit). `docs/vh_fixplan.md` is not committed.
- Not verified: real Chromebook frame rate and audio-thread load. Two convolvers on Low (steel and exec) are built on first use; Medium and High add air and flesh.

