# Third-party software

Every entry in `package.json` (exact pins), with the installed version and its license (spec §6, plan R4).
Regenerate the rows with `node scripts/licenses.mjs`.

## Runtime

Bundled into the app.

| name | version | license |
|---|---|---|
| @mediapipe/tasks-vision | 1.2.2 | Apache-2.0 |
| butterchurn | 3.0.0-beta.5 | MIT |
| fft.js | 4.0.4 | MIT |
| react | 19.3.1 | MIT |
| react-dom | 19.3.1 | MIT |
| three | 0.187.0 | MIT |
| twgl.js | 7.0.0 | MIT |

@mediapipe/tasks-vision: the camera's segmentation runtime (the R0-Mac ruling, plan_camera S1.2a; licence from its `package.json`, the package ships no LICENSE file). The page self-hosts it so the browser touches localhost only (design D7): `postinstall` (`scripts/models.mjs`) copies the package's `wasm/` to the git-ignored `public/mediapipe/`. The package's built-in usage logger (a POST to `https://odml.pa.googleapis.com/v1/log` once a minute) is refused in `src/camera/segment.worker.ts`. Its models:

| file | model | where | license |
|---|---|---|---|
| `public/models/selfie_segmenter_landscape.tflite` (250,177 B) | MediaPipe Selfie Segmentation, landscape 144×256 (Tingbo Hou, Siargey Pisarchyk, Karthik Raveendran, Google; 2021-05-06) | committed (K-12) | Apache-2.0, per its [model card](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20MediaPipe%20Selfie%20Segmentation.pdf) ("Licensed under: Apache License, Version 2.0") |
| `public/models/pose_landmarker_lite.task` | MediaPipe BlazePose GHUM 3D, lite (Valentin Bazarevsky, Ivan Grishchenko, Eduard Gabriel Bazavan, Google; 2021-04-16) | downloaded by `postinstall`, git-ignored | Apache-2.0, per its [model card](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20BlazePose%20GHUM%203D.pdf) ("Licensed under: Apache License, Version 2.0") |

three: lazy-loaded by `native/model` only (`src/three/host.ts`, GPU3D S1-T spike; pinned exactly, an upgrade re-runs S1-T). Its `LICENSE` ships in the package. Its model asset:

| file | asset | where | license |
|---|---|---|---|
| `public/models/Wolf.glb` (986,712 B) | "Wolf" by Quaternius: rigged (51 joints), 12 clips (`native/model` plays Gallop), from its Poly Pizza listing https://poly.pizza/m/P1gU3Qkr9r (uploaded 2021-09-07; GLB https://static.poly.pizza/f1d12388-e39b-4157-b32a-646a1d089fc4.glb, fetched 2026-11-16). Its clip set is the one of Quaternius's Ultimate Animated Animal Pack (2021-07). Listed in `public/models/manifest.json` | committed | CC0-1.0, per the listing's licence field ("CC0 1.0"). No attribution required |

Licence provenance (GPU3D S4.2, lead ruling 2026-11-16): https://quaternius.com/license.html now shows the Quaternius Asset License (QAL) v1.0 (last updated 2026-08-28), while the pack page (https://quaternius.com/packs/ultimateanimatedanimals.html, "License CC0") and the Poly Pizza listing say CC0. The copy obtained is the Poly Pizza listing's (CC0 1.0); the pack's own Drive folder refused anonymous downloads ("Quota exceeded"). Recorded as provenance (spec §6).

fft.js: MIT per npm metadata (and its README); the GitHub repo (https://github.com/indutny/fft.js, Fedor Indutny) has no LICENSE file.

butterchurn's runtime deps are inlined into its `dist/butterchurn.js` (npm installs them too): eel-wasm 0.0.16 MIT, @assemblyscript/loader 0.17.14 Apache-2.0, ecma-proposal-math-extensions 0.0.2 MIT (each `package.json`; none ships a LICENSE file).

## Toolchain

Dev only, never shipped. `playwright-core` is the lead's browser-verification tool (it drives the installed Chrome); it stays.

| name | version | license |
|---|---|---|
| @eslint/js | 10.0.1 | MIT |
| @types/node | 24.19.2 | MIT |
| @types/react | 19.3.0 | MIT |
| @types/react-dom | 19.3.0 | MIT |
| @vitejs/plugin-react | 6.1.2 | MIT |
| butterchurn-presets | 3.0.0-beta.4 | MIT |
| eslint | 10.13.0 | MIT |
| eslint-plugin-react-hooks | 7.1.1 | MIT |
| eslint-plugin-react-refresh | 0.5.7 | MIT |
| globals | 17.13.0 | MIT |
| playwright-core | 1.64.1 | Apache-2.0 |
| typescript | 6.0.3 | Apache-2.0 |
| typescript-eslint | 8.72.1 | MIT |
| vite | 8.3.5 | MIT |
| vitest | 4.1.12 | MIT |

## Adapted code

- `src/scenes/particles.ts` adapts the twgl.js example `examples/transform-feedback-particles-va.html` (ping-pong vertex arrays + transform feedback, the update shader also rasterises the points).
  - Author: Gregg Tavares. URL: https://github.com/greggman/twgl.js. License: MIT.
  - The file keeps the original header: "twgl.js Copyright (c) 2015, Gregg Tavares All Rights Reserved. Available via the MIT license. see: http://github.com/greggman/twgl.js for details".
- `src/scenes/fluid.ts` ports the WebGL-Fluid-Simulation solver to GLSL ES 3.00 (splat, advection, curl, vorticity, divergence, pressure, gradient subtract, the display pass; not its bloom, sunrays, pointer input or GUI; GPU3D S3.2).
  - Author: Pavel Dobryakov. URL: https://github.com/PavelDoGreat/WebGL-Fluid-Simulation (`script.js` at commit `a2d292931f19d9b3b9f564e23e6c32729d2121c3`, 2024-11-12). License: MIT.
  - The file keeps the original MIT notice verbatim ("Copyright (c) 2017 Pavel Dobryakov").

Besides `particles.ts` and `fluid.ts`, the only code and shaders ported from third parties are the ones under Shaders below.

## Shaders

Every file under `src/fx/isf`, `src/fx/own`, `src/fx/transitions` and `src/fx/syn` has a row (spec §6); paths are relative to `web/src/fx/`.
The four tables come from `node scripts/shaders.mjs`, which reads each file's header. After adding a shader, rerun it and paste the output over the tables.

- `isf/`: [Vidvox/ISF-Files](https://github.com/Vidvox/ISF-Files). The author is the file's `CREDIT`. An ISF header has no license line, so the license is the repo's: MIT (its LICENSE reads "Copyright (c) 2018", with no holder named). Each file's first line records it: `// Source: … · MIT`.
- `own/`: ours, MIT (the project's license, spec §6). Library code inlined in a file keeps its original header there, and the row names it.
- `syn/`: scenes from the donor `donor/visual_system_2/` (a reverse-engineered commercial live-visual app, `research_donor_visual_system_2.md` §7), run by `src/fx/syn.ts`. Each file is the scene's `main.glsl` under a header built from its `scene.json`; its first lines name the source scene, the author (the scene's `CREDIT`) and the license (the CC0 dedication the mrange files carry; otherwise unknown, recorded per spec §6). The scene's `script.js` is never copied or run: its clocks are restated as data (`VJW_CLOCK`). `preamble.glsl` is the app's whole GLSL helper library (`glsl/01`–`05`), copied once with ES 3.00 literal fixes; its media and meta-control helpers are zero stubs.
- `transitions/`: [gl-transitions](https://github.com/gl-transitions/gl-transitions) 2.0.0, the `glsl3/` sources. Author and license are the file's own `// Author:` and `// License:` lines (all 12 are MIT, as is the repo's LICENSE); the source is the upstream file its header names. `crossfade.glsl` is ours.

### isf (20)

| path | author | source | license |
|---|---|---|---|
| `isf/ASCII Art.fs` | VIDVOX (Ported from https://www.shadertoy.com/view/lssGDj) | https://github.com/Vidvox/ISF-Files | MIT |
| `isf/Chromatic Aberration.fs` | VIDVOX | https://github.com/Vidvox/ISF-Files | MIT |
| `isf/Circular Feedback Mask.fs` | VIDVOX | https://github.com/Vidvox/ISF-Files | MIT |
| `isf/Color Monochrome.fs` | zoidberg | https://github.com/Vidvox/ISF-Files | MIT |
| `isf/Color Replacement.fs` | VIDVOX | https://github.com/Vidvox/ISF-Files | MIT |
| `isf/Comet Tails.fs` | VIDVOX | https://github.com/Vidvox/ISF-Files | MIT |
| `isf/Dilate.fs` | VIDVOX | https://github.com/Vidvox/ISF-Files | MIT |
| `isf/Erode.fs` | VIDVOX | https://github.com/Vidvox/ISF-Files | MIT |
| `isf/Kaleidoscope Tile.fs` | VIDVOX | https://github.com/Vidvox/ISF-Files | MIT |
| `isf/Kaleidoscope.fs` | VIDVOX | https://github.com/Vidvox/ISF-Files | MIT |
| `isf/Long Exposure.fs` | VIDVOX | https://github.com/Vidvox/ISF-Files | MIT |
| `isf/Mirror.fs` | VIDVOX | https://github.com/Vidvox/ISF-Files | MIT |
| `isf/Pixellate.fs` | VIDVOX | https://github.com/Vidvox/ISF-Files | MIT |
| `isf/Posterize.fs` | VIDVOX | https://github.com/Vidvox/ISF-Files | MIT |
| `isf/Sine Warp Tile.fs` | VIDVOX | https://github.com/Vidvox/ISF-Files | MIT |
| `isf/Solarize.fs` | VIDVOX | https://github.com/Vidvox/ISF-Files | MIT |
| `isf/Truchet Tile.fs` | pjkarlik | https://github.com/Vidvox/ISF-Files | MIT |
| `isf/VHS Glitch.fs` | David Lublin, original by Staffan Widegarn Åhlvik | https://github.com/Vidvox/ISF-Files | MIT |
| `isf/Worley Cells.fs` | VIDVOX | https://github.com/Vidvox/ISF-Files | MIT |
| `isf/v002-CRT-Displacement.fs` | vade | https://github.com/Vidvox/ISF-Files | MIT |

### own (44)

| path | author | source | license |
|---|---|---|---|
| `own/bars.fs` | VeeJay Wizard (own) + FFT Color Lines and FFT Filled Waveform (VIDVOX) | https://github.com/Vidvox/ISF-Files | MIT (own), MIT (ISF-Files) |
| `own/bloom.fs` | VeeJay Wizard (own) | - | MIT (own) |
| `own/change-color.fs` | VeeJay Wizard (own) | - | MIT (own) |
| `own/checker.fs` | VeeJay Wizard (own) | - | MIT (own) |
| `own/color-threshold.fs` | VeeJay Wizard (own) | - | MIT (own) |
| `own/dent.fs` | VeeJay Wizard (own) | - | MIT (own) |
| `own/diff-feedback.fs` | VeeJay Wizard (own) | - | MIT (own) |
| `own/domain-warp.fs` | VeeJay Wizard (own) + webgl-noise snoise (Ian McEwan, Ashima Arts) | https://github.com/ashima/webgl-noise | MIT (own), MIT (webgl-noise) |
| `own/echo.fs` | VeeJay Wizard (own) | - | MIT (own) |
| `own/edge-rings.fs` | VeeJay Wizard (own) | - | MIT (own) |
| `own/emboss.fs` | VeeJay Wizard (own) | - | MIT (own) |
| `own/feedback-zoom.fs` | VeeJay Wizard (own) | - | MIT (own) |
| `own/flash.fs` | VeeJay Wizard (own) | - | MIT (own) |
| `own/flow-smear.fs` | VeeJay Wizard (own) + Optical Flow Generator (VIDVOX / v002 / Andrew Benson) | https://github.com/Vidvox/ISF-Files | MIT (own), MIT (ISF-Files) |
| `own/flythrough.fs` | VeeJay Wizard (own) | - | MIT (own) |
| `own/fractal.fs` | VeeJay Wizard (own) | - | MIT (own) |
| `own/gradient.fs` | VeeJay Wizard (own) | - | MIT (own) |
| `own/hsv-blur.fs` | VeeJay Wizard (own) | - | MIT (own) |
| `own/ink.fs` | VeeJay Wizard (own) + webgl-noise snoise (Ian McEwan, Ashima Arts) | https://github.com/ashima/webgl-noise | MIT (own), MIT (webgl-noise) |
| `own/julia.fs` | VeeJay Wizard (own) | - | MIT (own) |
| `own/laser-grid.fs` | VeeJay Wizard (own) | - | MIT (own) |
| `own/led-grid.fs` | VeeJay Wizard (own) | - | MIT (own) |
| `own/light-tunnel.fs` | VeeJay Wizard (own) | - | MIT (own) |
| `own/liquid-chrome.fs` | VeeJay Wizard (own) | - | MIT (own) |
| `own/metaballs.fs` | VeeJay Wizard (own) | - | MIT (own) |
| `own/mosaic.fs` | VeeJay Wizard (own) + Triangle Mosaic (VIDVOX) | https://github.com/Vidvox/ISF-Files | MIT (own), MIT (ISF-Files) |
| `own/negative.fs` | VeeJay Wizard (own) | - | MIT (own) |
| `own/phaser.fs` | VeeJay Wizard (own) | - | MIT (own) |
| `own/polar.fs` | VeeJay Wizard (own) | - | MIT (own) |
| `own/radial-blur.fs` | VeeJay Wizard (own) | - | MIT (own) |
| `own/reaction-diffusion.fs` | VeeJay Wizard (own) | - | MIT (own) |
| `own/rgb-contrast.fs` | VeeJay Wizard (own) | - | MIT (own) |
| `own/rgba-blur.fs` | VeeJay Wizard (own) | - | MIT (own) |
| `own/scanlines.fs` | VeeJay Wizard (own) | - | MIT (own) |
| `own/sdf-shapes.fs` | VeeJay Wizard (own) + hg_sdf (Mercury) | https://mercury.sexy/hg_sdf/hg_sdf.glsl | MIT (own), MIT (hg_sdf, its MIT option) |
| `own/sharpen.fs` | VeeJay Wizard (own) | - | MIT (own) |
| `own/smoke.fs` | VeeJay Wizard (own) + webgl-noise srdnoise (Stefan Gustavson) | https://github.com/stegu/webgl-noise | MIT (own), MIT (webgl-noise) |
| `own/stars.fs` | VeeJay Wizard (own) + Stars2D and PolkaDot2D from Brian Sharpe's Wombat | https://github.com/BrianSharpe | MIT (own), Wombat permissive ("use the code however you wish, credit"; no licence file in the in-repo TD extract; personal use) |
| `own/strobe.fs` | VeeJay Wizard (own) | - | MIT (own) |
| `own/superformula.fs` | VeeJay Wizard (own) | - | MIT (own) |
| `own/td-feedback.fs` | VeeJay Wizard (own) + webgl-noise snoise (Ian McEwan, Ashima Arts) | https://github.com/ashima/webgl-noise | MIT (own), MIT (webgl-noise) |
| `own/trails.fs` | VeeJay Wizard (own) | - | MIT (own) |
| `own/tunnel-mesh.fs` | VeeJay Wizard (own) | - | MIT (own) |
| `own/wave-landscape.fs` | VeeJay Wizard (own) | - | MIT (own) |

### transitions (13)

| path | author | source | license |
|---|---|---|---|
| `transitions/BurnThrough.glsl` | liubailin2020@gmail.com | https://github.com/gl-transitions/gl-transitions/blob/master/transitions/BurnThrough.glsl | MIT |
| `transitions/CircleOpen.glsl` | gre | https://github.com/gl-transitions/gl-transitions/blob/master/transitions/CircleOpen.glsl | MIT |
| `transitions/CrossWarp.glsl` | Eke Péter <peterekepeter@gmail.com> | https://github.com/gl-transitions/gl-transitions/blob/master/transitions/CrossWarp.glsl | MIT |
| `transitions/DirectionalWipe.glsl` | gre | https://github.com/gl-transitions/gl-transitions/blob/master/transitions/DirectionalWipe.glsl | MIT |
| `transitions/DreamyZoom.glsl` | Zeh Fernando | https://github.com/gl-transitions/gl-transitions/blob/master/transitions/DreamyZoom.glsl | MIT |
| `transitions/FadeColor.glsl` | gre | https://github.com/gl-transitions/gl-transitions/blob/master/transitions/FadeColor.glsl | MIT |
| `transitions/GlitchMemories.glsl` | Gunnar Roth | https://github.com/gl-transitions/gl-transitions/blob/master/transitions/GlitchMemories.glsl | MIT |
| `transitions/Hexagonalize.glsl` | Fernando Kuteken | https://github.com/gl-transitions/gl-transitions/blob/master/transitions/Hexagonalize.glsl | MIT |
| `transitions/Kaleidoscope.glsl` | nwoeanhinnogaehr | https://github.com/gl-transitions/gl-transitions/blob/master/transitions/Kaleidoscope.glsl | MIT |
| `transitions/Overexposure.glsl` | Ben Zhang | https://github.com/gl-transitions/gl-transitions/blob/master/transitions/Overexposure.glsl | MIT |
| `transitions/PerlinDissolve.glsl` | Rich Harris | https://github.com/gl-transitions/gl-transitions/blob/master/transitions/PerlinDissolve.glsl | MIT |
| `transitions/Swirl.glsl` | Sergey Kosarevsky | https://github.com/gl-transitions/gl-transitions/blob/master/transitions/Swirl.glsl | MIT |
| `transitions/crossfade.glsl` | VeeJay Wizard (own) | - | MIT (own) |

### syn (86)

| path | author | source | license |
|---|---|---|---|
| `syn/PLUS.glsl` | Meebs | donor/visual_system_2/scenes/release/PLUS.synScene | unknown (the donor's CREDIT names Meebs only; shipped inside a commercial app; personal use, ⚠️ check before release) |
| `syn/SkaiWalkerOG.glsl` | Psybernautics ("Ferro Fluid Speaker Box", 2025) | donor/visual_system_2/scenes/release/SkaiWalkerOG.synScene | unknown (no notice in the file; the inlined hg_sdf and lygia functions keep their own licence lines; ⚠️ check before release) |
| `syn/alien_cavern.glsl` | aiekick (Stephane Cuillerdier) | donor/visual_system_2/scenes/release/alien_cavern.synScene | CC BY-NC-SA 3.0 Unported (the author's lines are kept below; non-commercial, share-alike) |
| `syn/audio_indicators.glsl` | the donor app (its built-in audio monitor, AUDIO_INDICATORS_SCENE_TITLE; research_donor_visual_system_2 §6) | donor/visual_system_2/scenes/release/audio_indicators.synScene | unknown (shipped inside a commercial app; personal use, ⚠️ check before release) |
| `syn/beamers.glsl` | sheltron | donor/visual_system_2/scenes/release/beamers.synScene | unknown (the donor's CREDIT names sheltron only; shipped inside a commercial app; personal use, ⚠️ check before release) |
| `syn/beats_in_4d.glsl` | mrange (Mårten Rånge) | donor/visual_system_2/scenes/release/beats_in_4d.synScene | CC0 1.0 Universal (the dedication is kept below) |
| `syn/biopsy.glsl` | Meebs ft. Flexi | donor/visual_system_2/scenes/release/biopsy.synScene | unknown (the donor's CREDIT names Meebs ft. Flexi only; shipped inside a commercial app; personal use, ⚠️ check before release) |
| `syn/biopsy_v2.glsl` | Meebs ft. Flexi | donor/visual_system_2/scenes/release/biopsy_v2.synScene | unknown (the donor's CREDIT names Meebs ft. Flexi only; shipped inside a commercial app; personal use, ⚠️ check before release) |
| `syn/boreal.glsl` | Alex Rowe | donor/visual_system_2/scenes/release/boreal.synScene | unknown (the donor's CREDIT names Alex Rowe only; shipped inside a commercial app; personal use, ⚠️ check before release) |
| `syn/bouncy_hexagons.glsl` | mrange (Mårten Rånge) | donor/visual_system_2/scenes/release/bouncy_hexagons.synScene | CC0 1.0 Universal (the dedication is kept below; the helpers keep their own licence lines) |
| `syn/canvas.glsl` | unknown (the donor's CREDIT is empty) | donor/visual_system_2/scenes/release/canvas.synScene | unknown (no credit, no licence text; shipped inside a commercial app; personal use, ⚠️ check before release) |
| `syn/churning.glsl` | Victor S. | donor/visual_system_2/scenes/release/churning.synScene | unknown (the donor's CREDIT names Victor S. only; shipped inside a commercial app; personal use, ⚠️ check before release) |
| `syn/circles5.glsl` | Keijiro Takahashi | donor/visual_system_2/scenes/release/circles5.synScene | unknown (the donor's CREDIT names Keijiro Takahashi only; shipped inside a commercial app; personal use, ⚠️ check before release) |
| `syn/circuit_bending.glsl` | mojovideotech ("Equirec_MengerTunnel", after shadertoy lsjcWV); modifications by Meebs | donor/visual_system_2/scenes/release/circuit_bending.synScene | CC BY-NC-SA 3.0 (the notice is kept below; non-commercial) |
| `syn/cloudten.glsl` | nimitz (the body's title comment: "Cloud Ten by nimitz (twitter: @stormoid)") | donor/visual_system_2/scenes/release/cloudten.synScene | unknown (no licence in the file; shipped inside a commercial app; personal use, ⚠️ check before release) |
| `syn/compound_iris.glsl` | Meebs | donor/visual_system_2/scenes/release/compound_iris.synScene | unknown (the donor's CREDIT names Meebs only; shipped inside a commercial app; personal use, ⚠️ check before release) |
| `syn/cosmic_dust.glsl` | Kali x Meebs | donor/visual_system_2/scenes/release/cosmic_dust.synScene | unknown (the donor's CREDIT names Kali x Meebs only; shipped inside a commercial app; personal use, ⚠️ check before release) |
| `syn/dark_twister.glsl` | mrange (Mårten Rånge) | donor/visual_system_2/scenes/release/dark_twister.synScene | CC0 1.0 Universal (the dedication is kept below) |
| `syn/deeper.glsl` | Meebs | donor/visual_system_2/scenes/release/deeper.synScene | unknown (the donor's CREDIT names Meebs only; shipped inside a commercial app; personal use, ⚠️ check before release) |
| `syn/deeper_v2.glsl` | Meebs | donor/visual_system_2/scenes/release/deeper_v2.synScene | unknown (the donor's CREDIT names Meebs only; shipped inside a commercial app; personal use, ⚠️ check before release) |
| `syn/dispersion.glsl` | cornusammonis | donor/visual_system_2/scenes/release/dispersion.synScene | unknown (the donor's CREDIT names cornusammonis only; shipped inside a commercial app; personal use, ⚠️ check before release) |
| `syn/dynamical_flame.glsl` | cornusammonis | donor/visual_system_2/scenes/release/dynamical_flame.synScene | unknown (the donor's CREDIT names cornusammonis only; shipped inside a commercial app; personal use, ⚠️ check before release) |
| `syn/entombed_silicon_dreams.glsl` | mrange (Mårten Rånge) | donor/visual_system_2/scenes/release/entombed_silicon_dreams.synScene | CC0 1.0 Universal (the dedication is kept below; helpers: sam hocevar WTFPL, Inigo Quilez MIT, Pascal Gilcher MIT) |
| `syn/equirectangular.glsl` | Shady Headstash (the donor's CREDIT) | donor/visual_system_2/scenes/release/equirectangular.synScene | unknown (no licence in the file; shipped inside a commercial app; personal use, ⚠️ check before release) |
| `syn/exoplanet.glsl` | Meebs ft. WAHa_06x36 | donor/visual_system_2/scenes/release/exoplanet.synScene | unknown (the donor's CREDIT names Meebs ft. WAHa_06x36 only; shipped inside a commercial app; personal use, ⚠️ check before release) |
| `syn/filter_blown.glsl` | Meebs | donor/visual_system_2/scenes/release/filter_blown.synScene | unknown (the donor's CREDIT names Meebs only; shipped inside a commercial app; personal use, ⚠️ check before release) |
| `syn/fire_tunnel.glsl` | aiekick (Stephane Cuillerdier) | donor/visual_system_2/scenes/release/fire_tunnel.synScene | CC BY-NC-SA 3.0 Unported (the notice is kept below; non-commercial) |
| `syn/fluid_body.glsl` | Victor S.; HSLUV-GLSL v4.2: William Malo (https://github.com/williammalo) | donor/visual_system_2/scenes/release/fluid_body.synScene | unknown (the donor's CREDIT names Victor S. only; shipped inside a commercial app; personal use, ⚠️ check before release); HSLUV-GLSL: its header is kept below, it names no licence |
| `syn/fractilian_foundation.glsl` | mojovideotech (based on "Fractals: MRS" by Nikos Papadopoulos, 4rknova) | donor/visual_system_2/scenes/release/fractilian_foundation.synScene | CC BY-NC-SA 3.0 Unported (the file's own notice is kept below) |
| `syn/fuzzy_signal.glsl` | Meebs | donor/visual_system_2/scenes/release/fuzzy_signal.synScene | unknown (the donor's CREDIT names Meebs only; shipped inside a commercial app; personal use, ⚠️ check before release) |
| `syn/gaussian_smoothlife.glsl` | cornusammonis | donor/visual_system_2/scenes/release/gaussian_smoothlife.synScene | unknown (the donor's CREDIT names cornusammonis only; shipped inside a commercial app; personal use, ⚠️ check before release) |
| `syn/glassier.glsl` | Felix Woitzel | donor/visual_system_2/scenes/release/glassier.synScene | unknown (the donor's CREDIT names Felix Woitzel only; shipped inside a commercial app; personal use, ⚠️ check before release) |
| `syn/glitch.glsl` | Meebs ft. XOR | donor/visual_system_2/scenes/release/glitch.synScene | unknown (the donor's CREDIT names Meebs ft. XOR only; shipped inside a commercial app; personal use, ⚠️ check before release) |
| `syn/glob.glsl` | Nimitz | donor/visual_system_2/scenes/release/glob.synScene | unknown (the donor's CREDIT names Nimitz only; shipped inside a commercial app; personal use, ⚠️ check before release) |
| `syn/gpu_melter.glsl` | Meebs (the warp by inigo quilez, https://www.shadertoy.com/view/lsl3RH) | donor/visual_system_2/scenes/release/gpu_melter.synScene | unknown (the donor's CREDIT names Meebs only; shipped inside a commercial app; personal use, ⚠️ check before release) |
| `syn/hex_array.glsl` | sheltron | donor/visual_system_2/scenes/release/hex_array.synScene | unknown (the donor's CREDIT names sheltron only; shipped inside a commercial app; personal use, ⚠️ check before release) |
| `syn/hexoplanet.glsl` | aiekick (Stephane Cuillerdier) | donor/visual_system_2/scenes/release/hexoplanet.synScene | CC BY-NC-SA 3.0 Unported (the author's lines are kept below; non-commercial, share-alike) |
| `syn/hextunnel.glsl` | sheltron | donor/visual_system_2/scenes/release/hextunnel.synScene | unknown (the donor's CREDIT names sheltron only; shipped inside a commercial app; personal use, ⚠️ check before release) |
| `syn/hills_eels.glsl` | Victor S. | donor/visual_system_2/scenes/release/hills_eels.synScene | unknown (the donor's CREDIT names Victor S. only; shipped inside a commercial app; personal use, ⚠️ check before release) |
| `syn/hue_review.glsl` | Meebs | donor/visual_system_2/scenes/release/hue_review.synScene | unknown (the donor's CREDIT names Meebs only; shipped inside a commercial app; personal use, ⚠️ check before release) |
| `syn/inkshot.glsl` | Meebs | donor/visual_system_2/scenes/release/inkshot.synScene | unknown (the donor's CREDIT names Meebs only; shipped inside a commercial app; personal use, ⚠️ check before release) |
| `syn/kaleidowhoa_man.glsl` | Meebs | donor/visual_system_2/scenes/release/kaleidowhoa_man.synScene | unknown (the donor's CREDIT names Meebs only; shipped inside a commercial app; personal use, ⚠️ check before release) |
| `syn/kifs_flythrough.glsl` | Shane (the body's title comment: "KIFS Flythrough") | donor/visual_system_2/scenes/release/kifs_flythrough.synScene | unknown (no licence in the file; shipped inside a commercial app; personal use, ⚠️ check before release) |
| `syn/lattix.glsl` | Anonymous | donor/visual_system_2/scenes/release/lattix.synScene | unknown (the donor's CREDIT names "Anonymous" only; shipped inside a commercial app; personal use, ⚠️ check before release) |
| `syn/logo_grid_pulses.glsl` | UFFFD x Meebs | donor/visual_system_2/scenes/release/logo_grid_pulses.synScene | unknown (the donor's CREDIT only; shipped inside a commercial app; personal use, ⚠️ check before release) |
| `syn/lost_in_the_sauce.glsl` | Keijiro Takahashi x Meebs | donor/visual_system_2/scenes/release/lost_in_the_sauce.synScene | unknown (the donor's CREDIT only; shipped inside a commercial app; personal use, ⚠️ check before release) |
| `syn/mandelbrot_decoration.glsl` | Shane ("Mandelbrot Pattern Decoration"; audio and media controls by the donor app) | donor/visual_system_2/scenes/release/mandelbrot_decoration.synScene | unknown (no notice in the file; ⚠️ a Shadertoy original would be under its default CC BY-NC-SA 3.0; check before release) |
| `syn/meta_experiment_3.glsl` | aiekick (Stephane Cuillerdier) | donor/visual_system_2/scenes/release/meta_experiment_3.synScene | CC BY-NC-SA 3.0 Unported (the file's own notice is kept below) |
| `syn/milk_honey_smoke_bile.glsl` | Victor S. | donor/visual_system_2/scenes/release/milk_honey_smoke_bile.synScene | unknown (the donor's CREDIT names Victor S. only; shipped inside a commercial app; personal use, ⚠️ check before release) |
| `syn/min_max_hex.glsl` | Meebs (the triangle tiling adapted from mattz, https://www.shadertoy.com/view/4d2GzV) | donor/visual_system_2/scenes/release/min_max_hex.synScene | unknown (the donor's CREDIT names Meebs only; shipped inside a commercial app; personal use, ⚠️ check before release) |
| `syn/molten.glsl` | Meebs ft. Flexi | donor/visual_system_2/scenes/release/molten.synScene | unknown (the donor's CREDIT names Meebs ft. Flexi only; shipped inside a commercial app; personal use, ⚠️ check before release) |
| `syn/myoplasm.glsl` | Alex Rowe | donor/visual_system_2/scenes/release/myoplasm.synScene | unknown (the donor's CREDIT names Alex Rowe only; shipped inside a commercial app; personal use, ⚠️ check before release) |
| `syn/neon_city.glsl` | mrange (Mårten Rånge) | donor/visual_system_2/scenes/release/neon_city.synScene | unknown (no notice in the file; its helpers keep their own licence lines; ⚠️ check before release) |
| `syn/neuron_proximitors.glsl` | patu x Meebs (a fork of "Buffer computed points." by patu, https://shadertoy.com/view/XllBRj) | donor/visual_system_2/scenes/release/neuron_proximitors.synScene | unknown (the file states none; a Shadertoy fork, the site's default is CC BY-NC-SA 3.0; personal use, ⚠️ check before release) |
| `syn/nova.glsl` | Felix Woitzel | donor/visual_system_2/scenes/release/nova.synScene | unknown (the donor's CREDIT names Felix Woitzel only; shipped inside a commercial app; personal use, ⚠️ check before release) |
| `syn/overload.glsl` | Alex Rowe | donor/visual_system_2/scenes/release/overload.synScene | unknown (the donor's CREDIT names Alex Rowe only; shipped inside a commercial app; personal use, ⚠️ check before release) |
| `syn/pop.glsl` | Meebs (the polygon layers: "by @301z", kept below) | donor/visual_system_2/scenes/release/pop.synScene | unknown (the donor's CREDIT names Meebs only; shipped inside a commercial app; personal use, ⚠️ check before release) |
| `syn/preamble.glsl` | the donor app (anonymised in donor/visual_system_2/report.md); _hsv2rgb/_rgb2hsv: sam hocevar (WTFPL, https://stackoverflow.com/a/17897228/418488) | donor/visual_system_2/glsl/01_preamble.txt | unknown (app resource strings, copied as text; recorded per spec §6); _hsv2rgb/_rgb2hsv WTFPL |
| `syn/primitiv_logik.glsl` | Meebs | donor/visual_system_2/scenes/release/primitiv_logik.synScene | unknown (the donor's CREDIT names Meebs only; shipped inside a commercial app; personal use, ⚠️ check before release) |
| `syn/pxl_sort_1.glsl` | Meebs | donor/visual_system_2/scenes/release/pxl_sort_1.synScene | unknown (the donor's CREDIT names Meebs only; shipped inside a commercial app; personal use, ⚠️ check before release). The noise snippet has no header in the donor file; it reads as webgl-noise's classic Perlin (Ian McEwan / Stefan Gustavson, MIT) |
| `syn/quicksand.glsl` | Meebs | donor/visual_system_2/scenes/release/quicksand.synScene | unknown (the donor's CREDIT names Meebs only; shipped inside a commercial app; personal use, ⚠️ check before release) |
| `syn/raw_video.glsl` | unknown (the donor's CREDIT is empty: the donor app's own utility scene) | donor/visual_system_2/scenes/release/raw_video.synScene | unknown (no licence in the file; shipped inside a commercial app; personal use, ⚠️ check before release) |
| `syn/ray_marching_experiment_62.glsl` | aiekick (Stephane Cuillerdier) | donor/visual_system_2/scenes/release/ray_marching_experiment_62.synScene | CC BY-NC-SA 3.0 Unported (the notice is kept below; non-commercial) |
| `syn/raymarched_reflections.glsl` | Shane (the body's title comment: "Raymarched Reflections") | donor/visual_system_2/scenes/release/raymarched_reflections.synScene | unknown (no licence in the file; shipped inside a commercial app; personal use, ⚠️ check before release) |
| `syn/rearranged.glsl` | Meebs | donor/visual_system_2/scenes/release/rearranged.synScene | unknown (the donor's CREDIT names Meebs only; shipped inside a commercial app; personal use, ⚠️ check before release) |
| `syn/redrum.glsl` | Meebs (grit / flashing effect by jmpep, Shadertoy: the body's first comment) | donor/visual_system_2/scenes/release/redrum.synScene | unknown (the donor's CREDIT names Meebs only; shipped inside a commercial app; personal use, ⚠️ check before release) |
| `syn/replik8.glsl` | Meebs | donor/visual_system_2/scenes/release/replik8.synScene | unknown (the donor's CREDIT names Meebs only; shipped inside a commercial app; personal use, ⚠️ check before release) |
| `syn/scaffold_fractal.glsl` | Meebs (after kabuto, fork by s1e; glslsandbox.com) | donor/visual_system_2/scenes/release/scaffold_fractal.synScene | unknown (the body credits "a raymarching experiment by kabuto, dmt fork by s1e, found on glslsandbox.com"; no licence text; personal use, ⚠️ check before release) |
| `syn/shrouded.glsl` | Felix Woitzel ft. Meebs | donor/visual_system_2/scenes/release/shrouded.synScene | unknown (the donor's CREDIT names Felix Woitzel ft. Meebs only; shipped inside a commercial app; personal use, ⚠️ check before release) |
| `syn/sinusoidal_warp.glsl` | Shane ("Bumped Sinusoidal Warp", https://www.shadertoy.com/view/4l2XWK), modified by Mikael Ems (Shady Headstash) | donor/visual_system_2/scenes/release/sinusoidal_warp.synScene | CC BY-NC-SA 3.0 Unported (the body's licence lines are kept) |
| `syn/sprinkles.glsl` | sheltron ft. Meebs | donor/visual_system_2/scenes/release/sprinkles.synScene | unknown (the donor's CREDIT names sheltron ft. Meebs only; shipped inside a commercial app; personal use, ⚠️ check before release) |
| `syn/square_shoals.glsl` | Alex Rowe | donor/visual_system_2/scenes/release/square_shoals.synScene | unknown (the donor's CREDIT names Alex Rowe only; shipped inside a commercial app; personal use, ⚠️ check before release) |
| `syn/stained_glass.glsl` | Meebs | donor/visual_system_2/scenes/release/stained_glass.synScene | unknown (the donor's CREDIT names Meebs only; shipped inside a commercial app; personal use, ⚠️ check before release) |
| `syn/sun_set.glsl` | Meebs | donor/visual_system_2/scenes/release/sun_set.synScene | unknown (the donor's CREDIT names Meebs only; shipped inside a commercial app; personal use, ⚠️ check before release) |
| `syn/swarm.glsl` | Meebs | donor/visual_system_2/scenes/release/swarm.synScene | unknown (the donor's CREDIT names Meebs only; shipped inside a commercial app; personal use, ⚠️ check before release); the particle draw cites iq, "Brick", shadertoy.com/view/MddGzf |
| `syn/terrain_lattice.glsl` | Shane (the body's title comment: "Terrain Lattice") | donor/visual_system_2/scenes/release/terrain_lattice.synScene | unknown (no licence in the file; shipped inside a commercial app; personal use, ⚠️ check before release) |
| `syn/thresholder.glsl` | Kyle Grover (Classic Perlin 3D Noise by Stefan Gustavson) | donor/visual_system_2/scenes/release/thresholder.synScene | unknown (the donor's CREDIT names Kyle Grover only; shipped inside a commercial app; personal use, ⚠️ check before release) |
| `syn/traced_tunnel.glsl` | Shane (the body's title comment: "Traced Tunnel"; after W23's "Past Racer" and NuSan's "Corridor Travel") | donor/visual_system_2/scenes/release/traced_tunnel.synScene | unknown (no licence in the file; shipped inside a commercial app; personal use, ⚠️ check before release) |
| `syn/transparent_isoslices.glsl` | Shane (the body's title comment: "Transparent Isoslices") | donor/visual_system_2/scenes/release/transparent_isoslices.synScene | unknown (no licence in the file; shipped inside a commercial app; personal use, ⚠️ check before release) |
| `syn/tunnel_beauty_6.glsl` | aiekick (Stephane Cuillerdier, @Aiekick, 2016) | donor/visual_system_2/scenes/release/tunnel_beauty_6.synScene | CC BY-NC-SA 3.0 Unported (the body's licence line is kept) |
| `syn/turbo_encabulator_fluid.glsl` | cornusammonis (the donor's CREDIT: "Original by cornusammonis from shadertoy"); noise: Inigo Quilez | donor/visual_system_2/scenes/release/turbo_encabulator_fluid.synScene | unknown (the Shadertoy original names no licence; shipped inside a commercial app; personal use, ⚠️ check before release); the noise helper: MIT, Copyright © 2013 Inigo Quilez (the notice is kept below) |
| `syn/vein_melter.glsl` | cornusammonis | donor/visual_system_2/scenes/release/vein_melter.synScene | unknown (the donor's CREDIT names cornusammonis only; shipped inside a commercial app; personal use, ⚠️ check before release) |
| `syn/videofx_1.glsl` | unknown (the donor's CREDIT is empty: the donor app's own utility scene) | donor/visual_system_2/scenes/release/videofx_1.synScene | unknown (no licence in the file; shipped inside a commercial app; personal use, ⚠️ check before release) |
| `syn/videofx_directionalblur.glsl` | unknown (the donor's CREDIT is empty: the donor app's own utility scene) | donor/visual_system_2/scenes/release/videofx_directionalblur.synScene | unknown (no licence in the file; shipped inside a commercial app; personal use, ⚠️ check before release) |
| `syn/voronoi_geode.glsl` | Shane (the body's title comment: "Perspex Web Lattice") | donor/visual_system_2/scenes/release/voronoi_geode.synScene | unknown (no licence in the file; shipped inside a commercial app; personal use, ⚠️ check before release) |
| `syn/waterly.glsl` | FabriceNeyret2 ("waterly video - test", https://www.shadertoy.com/view/MdlGDM), modified by Mikael Ems (Shady Headstash); noise: Inigo Quilez (https://www.shadertoy.com/view/XslGRr) | donor/visual_system_2/scenes/release/waterly.synScene | CC BY-NC-SA 3.0 Unported (the body's licence lines are kept) |

### Parser port

`src/fx/isf.ts` ports the header parse and the uniform prefix of `src/ISFParser.js` (npm package `interactive-shader-format` 2.8.0).
- Author: Michael Feldstein. URL: https://github.com/msfeldstein/interactive-shader-format-js. License: MIT ("Copyright (c) 2025 Michael Feldstein").
- The file keeps the repo's MIT text as its header, followed by the list of our changes.

### Inlined libraries

No `#include` machinery: each file carries its own copy, with the library's header.
- webgl-noise, MIT ("Copyright (C) 2011 by Ashima Arts (Simplex noise)", "Copyright (C) 2011-2016 by Stefan Gustavson (Classic noise and others)"). URLs: https://github.com/ashima/webgl-noise, https://github.com/stegu/webgl-noise.
  - `snoise` (`noise2D.glsl`, Ian McEwan, Ashima Arts) in `own/domain-warp.fs` and `own/ink.fs`.
  - `srdnoise` with `rgrad2`, `permute` and `mod289` (`psrdnoise2D.glsl`, Stefan Gustavson) in `own/smoke.fs`.
  - `snoise(vec3, out vec3 gradient)` with `mod289`, `permute` and `taylorInvSqrt` (`noise3Dgrad.glsl`, Ian McEwan, Ashima Arts) in `src/scenes/points.ts`.
  - `snoise(vec3)` with `mod289`, `permute` and `taylorInvSqrt` (`noise3D.glsl`, Ian McEwan, Ashima Arts) in `own/td-feedback.fs`, changed to return a second channel.
- hg_sdf (Mercury, version 2021-07-28), https://mercury.sexy/hg_sdf/hg_sdf.glsl. Dual-licensed `MIT OR CC-BY-NC-4.0`, used under MIT ("Copyright (c) 2011-2021 Mercury Demogroup"). In `own/sdf-shapes.fs`, adapted to GLSL ES 1.00 (float literals; `fDodecahedron` is `fGDF` unrolled). Also `vmax` and `fBox` in `syn/SkaiWalkerOG.glsl` (copied from the donor app's bundled `lib/hg_sdf.glsl`, read as text).
- Wombat (Brian Sharpe), the GPU noise library, http://briansharpe.wordpress.com, https://github.com/BrianSharpe. The author's permissive header: "I'm not one for copyrights. Use the code however you wish. All I ask is that credit be given back to the blog or myself" (no licence file in the in-repo TD extract; personal use). In `own/stars.fs`: `Stars2D` and `PolkaDot2D` verbatim, with only the helpers they call (`FAST32_hash_2D_Cell`, `Falloff_Xsq_C1`/`Falloff_Xsq_C2`).
- lygia (Patricio Gonzalez Vivo), https://github.com/patriciogonzalezvivo/lygia, Prosperity Public License 3.0.0 (non-commercial; ⚠️ check before release). `digits` (`lygia/draw/digits.glsl`) in `syn/SkaiWalkerOG.glsl`, copied from the donor app's bundled `lib/`, read as text.

### Credits in the files' comments

Upstream work that a file names in a comment. The files state no license for it: the license in the tables is the file's own (its repo's, for ISF-Files), and the upstream licenses are not checked.
- `isf/Truchet Tile.fs`: adapted from https://github.com/pjkarlik/TruchetTiles.
- `isf/VHS Glitch.fs`: based on https://github.com/staffantan/unity-vhsglitch, converted by David Lublin / VIDVOX.
- `isf/v002-CRT-Displacement.fs`: by vade; no upstream URL in the file.
- `isf/Comet Tails.fs`: the effect is described at https://bavc.github.io/avaa/artifacts/image_lag.html. `isf/Worley Cells.fs`: the common "iq" sin-based hash.
- `transitions/BurnThrough.glsl` and `transitions/PerlinDissolve.glsl`: value noise based on Morgan McGuire (`@morgan3d`), https://www.shadertoy.com/view/4dS3Wd. The files give it no license; Shadertoy's default is CC BY-NC-SA 3.0, which spec §6 allows.
- `isf/ASCII Art.fs`: VIDVOX's port of Shadertoy `lssGDj`, https://www.shadertoy.com/view/lssGDj. No licence stated; CC BY-NC-SA 3.0 assumed (personal use; ⚠️ check before release); author per the Shadertoy page (neither the donor nor the VIDVOX repo names it).
- `transitions/PerlinDissolve.glsl`: the `random` one-liner from http://byteblacksmith.com/improvements-to-the-canonical-one-liner-glsl-rand-for-opengl-es-2-0/.
- `transitions/GlitchMemories.glsl`: based on work from natewave. `transitions/Hexagonalize.glsl`: hex math from http://www.redblobgames.com/grids/hexagons/. `transitions/Swirl.glsl`: ported by gre from https://gist.github.com/corporateshark/cacfedb8cca0f5ce3f7c.
- `syn/beats_in_4d.glsl`, `syn/dark_twister.glsl` (mrange, CC0): the helpers inside keep their own lines: `tanh_approx` (Claude Brezinski, license unknown, https://mathr.co.uk/blog/2017-09-06_approximating_hyperbolic_tangent.html), `hsv2rgb` (sam hocevar, WTFPL, https://stackoverflow.com/a/17897228/418488), `roundedX` and `raySphereDensity` (Inigo Quilez, MIT, https://iquilezles.org).
- `own/domain-warp.fs`: the technique is after Inigo Quilez, https://iquilezles.org/articles/warp/ (named in its description).
- `own/bloom.fs`: the dual filter is after Bjørge, "Bandwidth-Efficient Rendering" (ARM, SIGGRAPH 2015), via our `src/gl/bloom.ts`. `own/reaction-diffusion.fs`: the Gray-Scott step follows jsexp's grayscott (pmneila, https://github.com/pmneila/jsexp, BSD-3-Clause) as the algorithm reference only; no code copied.
- The TD look files (`own/td-feedback.fs`, `edge-rings.fs`, `bloom.fs`, `light-tunnel.fs`, `radial-blur.fs`, `flow-smear.fs`, `reaction-diffusion.fs`): each header's `Look:` line names the TouchDesigner component it studies; rewritten, no TD code. `own/light-tunnel.fs` adds that TD's shader names Andrew Benson (Cycling '74) as its origin.

## MilkDrop presets

`src/milkdrop/presets/<slug>.json`, copied from `butterchurn-presets` 3.0.0-beta.4 (`presets/converted/<name>.json`; the package is MIT, "Copyright (c) 2013-2018 Jordan Berg") by `node scripts/milk-presets.mjs "<preset name>"…`, which also prints the rows below.
- JSON has no comment header, so each file carries the credit (spec §6) as fields: `{ name, author, url, license, preset }`. `author` is the name before the first ` - ` (MilkDrop's "author - title").
- The presets are the MilkDrop community's work; the package gives no license for their content, so it is recorded as unknown.
- The set is picked by `agents/planner/plan_milkdrop.md` S3.1's rule from the CP1 probe. Adding a preset = one file + one row.
- milk-new (Tier S, 2026-11-16) added 25 more from the base + extra packs, by measurement on two DnB tracks through the shipped path (`sync` .75): no load / GL / render error, billed GPU p95 within the slowest shipped preset's (two sessions), ≤ 3 luma steps > .10 per 1 s, not black / static, then the highest kick correlation (frame-to-frame luma change vs our kick), ≤ 2 per lead author, ≤ 1 per near-duplicate cluster. The 13 lowest-scoring of them start unstarred (`UNSTARRED` in `presets.ts`).

| slug | name | author | license |
|---|---|---|---|
| `adam-eatit-fx-2-martin-disco-mix-lodus-geiss-ludicrous-speed-flexi-aderrasi-n-hexcollie` | adam eatit fx 2 martin - disco mix, lodus, geiss, ludicrous speed,flexi, aderrasi n hexcollie | adam eatit fx 2 martin | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `adamfx-mashup-2-martin-reflections-on-black-tile-raron-n-flexi` | AdamFX Mashup 2 Martin - reflections on black tile + Raron N Flexi  | AdamFX Mashup 2 Martin | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `aderrasi-geiss-airhandler-kali-mix-painterly-tendrils-colorfast` | Aderrasi + Geiss - Airhandler (Kali Mix) - Painterly Tendrils Colorfast | Aderrasi + Geiss | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `aderrasi-storm-of-the-eye-thunder-mash0000-quasi-pseudo-meta-concentrics` | Aderrasi - Storm of the Eye (Thunder) - mash0000 - quasi pseudo meta concentrics | Aderrasi | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `cope-alternative-energy-antimatter-mod-1-4z` | cope - alternative energy (antimatter mod_1)4z | cope | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `cope-flexi-colorful-marble-ghost-mix` | cope + flexi - colorful marble (ghost mix) | cope + flexi | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `cope-the-drain-to-heaven` | cope - the drain to heaven | cope | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `cope-the-neverending-explosion-of-red-liquid-fire` | Cope - The Neverending Explosion of Red Liquid Fire | Cope | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `eos-particle-storm-b-couldn-t-not` | EoS - particle storm B - couldn't not | EoS | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `eos-phat-dark-heart-nobal-cause-cpe-ap4` | EoS_Phat Dark_heart_nobal_cause cpe ap4+ | EoS_Phat Dark_heart_nobal_cause cpe ap4+ | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `fed-slowfast-1-1` | fed - slowfast 1.1 | fed | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `flexi-fishbrain-geiss-martin-tokamak-witchery` | Flexi, fishbrain, Geiss + Martin - tokamak witchery | Flexi, fishbrain, Geiss + Martin | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `flexi-fishbrain-martin-witchery` | Flexi, fishbrain + Martin - witchery | Flexi, fishbrain + Martin | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `flexi-martin-cascading-decay-swing` | Flexi + Martin - cascading decay swing | Flexi + Martin | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `flexi-martin-geiss-dedicated-to-the-sherwin-maxawow` | Flexi, martin + geiss - dedicated to the sherwin maxawow | Flexi, martin + geiss | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `flexi-martin-geiss-painterly-rogue-wave-strike-color-emboss-mix` | _Flexi, martin + geiss - painterly rogue wave strike (color emboss mix) | _Flexi, martin + geiss | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `flexi-mom-why-the-sky-looks-different-today` | flexi - mom, why the sky looks different today | flexi | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `flexi-psychenapping` | Flexi - psychenapping | Flexi | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `flexi-swing-out-on-the-spiral` | flexi - swing out on the spiral | flexi | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `geiss-explosion-mod-2b` | _Geiss - Explosion Mod 2b | _Geiss | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `geiss-skin-dots-multi-layer-3` | Geiss - Skin Dots Multi-layer 3 | Geiss | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `geiss-tokamak-plus-2` | Geiss - Tokamak Plus 2 | Geiss | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `geiss-untitled` | _Geiss - untitled | _Geiss | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `goody-the-wild-vort` | Goody - The Wild Vort | Goody | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `martin-angel-flight` | martin - angel flight | martin | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `martin-liquid-arrows` | Martin - liquid arrows | Martin | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `martin-mucus-cervix` | martin - mucus cervix | martin | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `martin-shadow-harlequins-shape-code-fata-morgana` | martin [shadow harlequins shape code] - fata morgana | martin [shadow harlequins shape code] | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `mig-049` | _Mig_049 | _Mig_049 | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `mig-085` | _Mig_085 | _Mig_085 | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `mig-colorful9` | _Mig_COLORFUL9 | _Mig_COLORFUL9 | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `milk-artist-at-our-best-fed-slowfast-ft-adamfx-n-martin-hd-cosmofx` | Milk Artist At our Best - FED - SlowFast Ft AdamFX n Martin - HD CosmoFX | Milk Artist At our Best | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `milkdrop2077-r002` | MilkDrop2077.R002 | MilkDrop2077.R002 | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `milkdrop2077-r033` | MilkDrop2077.R033 | MilkDrop2077.R033 | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `orb-magma-pool` | ORB - Magma Pool | ORB | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `orb-pastel-primer` | ORB - Pastel Primer | ORB | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `raron-a-grayish-blob-mash0000-pungent-gastric-automata-cloud-fumes` | raron - a grayish blob - mash0000 - pungent gastric automata cloud fumes | raron | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `rovastar-flexi-hurricane-nightmare-moebius-mix` | Rovastar + Flexi - Hurricane Nightmare (Moebius Mix) | Rovastar + Flexi | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `rovastar-geiss-hurricane-nightmare-relief-mix` | Rovastar + Geiss - Hurricane Nightmare (Relief Mix) | Rovastar + Geiss | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `rovastar-geiss-hyperspace-kaleidoscope` | Rovastar + Geiss - Hyperspace - kaleidoscope | Rovastar + Geiss | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `royal-mashup-307` | $$$ Royal - Mashup (307) | $$$ Royal | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `shifter-escape-sigur-ros` | shifter - escape (sigur ros) | shifter | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `shifter-feathers-angel-wings-phat-remix-relief-2` | shifter - feathers (angel wings)_phat_remix relief 2 | shifter | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `stahlregen-dots-layered-suksma-world-humanvirus-replication-killphreqs-mix` | stahlregen - dots (layered) - suksma world humanvirus replication killphreqs mix | stahlregen | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `suksma-vector-exp-1-couldn-t-not` | suksma - vector exp 1 - couldn′t not | suksma | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `va-ultramix-154-chaos` | va ultramix - 154 [chaos] | va ultramix | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `vovan-geiss-bass-with-flover-feedback-mix-2` | _Vovan + Geiss - Bass With Flover (Feedback Mix) 2 | _Vovan + Geiss | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `waltra-square-orgy` | Waltra - Square Orgy | Waltra | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `zylot-paint-spill-music-reactive-paint-mix` | Zylot - Paint Spill (Music Reactive Paint Mix) | Zylot | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `zylot-true-visionary-final-mix` | Zylot - True Visionary (Final Mix) | Zylot | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |

## vs3 scenes

`src/vs3/kit/**/*.js`, copied from `donor/vs3/visual_kit/src/` (the friends' three.js visual engine, app v0.4.3, three r170; `research_donor_vs3_scenes.md`), run by `src/vs3/host.ts`. The friends gave the user permission to use all of it (2026-11-19); the kit ships no licence file. Each file opens with its source path and a `vjw:` line naming what we changed. Adding a scene = one file + one row (`agents/guides/guide_vs3_port.md`).

| file | author | source | licence |
|---|---|---|---|
| `scenes/ink.js` | the friends' engine | donor/vs3/visual_kit/src/scenes/ink.js | used with permission (2026-11-19) |
| `scenes/relic.js` | the friends' engine | donor/vs3/visual_kit/src/scenes/relic.js | used with permission (2026-11-19) |
| `scenes/morphogen.js` | the friends' engine | donor/vs3/visual_kit/src/scenes/morphogen.js | used with permission (2026-11-19) |
| `scenes/kaleido.js` (mandala) | the friends' engine | donor/vs3/visual_kit/src/scenes/kaleido.js | used with permission (2026-11-19) |
| `scenes/tendril.js` | the friends' engine | donor/vs3/visual_kit/src/scenes/tendril.js | used with permission (2026-11-19) |
| `scenes/citadel.js` | the friends' engine | donor/vs3/visual_kit/src/scenes/citadel.js | used with permission (2026-11-19) |
| `scenes/descent.js` | the friends' engine | donor/vs3/visual_kit/src/scenes/descent.js | used with permission (2026-11-19) |
| `scenes/oracle.js` | the friends' engine | donor/vs3/visual_kit/src/scenes/oracle.js | used with permission (2026-11-19) |
| `scenes/idol.js` | the friends' engine | donor/vs3/visual_kit/src/scenes/idol.js | used with permission (2026-11-19) |
| `scenes/spacetime.js` | the friends' engine | donor/vs3/visual_kit/src/scenes/spacetime.js | used with permission (2026-11-19) |
| `scenes/ingot.js` | the friends' engine | donor/vs3/visual_kit/src/scenes/ingot.js | used with permission (2026-11-19) |
| `lib/common.js` | the friends' engine | donor/vs3/visual_kit/src/lib/common.js (window listeners stripped) | used with permission (2026-11-19) |
| `lib/context.js` | the friends' engine | donor/vs3/visual_kit/src/lib/context.js | used with permission (2026-11-19) |
| `lib/descent-motion.js` | the friends' engine | donor/vs3/visual_kit/src/lib/descent-motion.js | used with permission (2026-11-19) |
| `lib/palette.js` | the friends' engine | donor/vs3/visual_kit/src/lib/palette.js (the edition, preset-guard and DOM parts stripped) | used with permission (2026-11-19) |
| `lib/noise-glsl.js` | the friends' engine; its GLSL: Ian McEwan / Ashima Arts, Stefan Gustavson (webgl-noise, https://github.com/ashima/webgl-noise) | donor/vs3/visual_kit/src/lib/noise-glsl.js | used with permission (2026-11-19); the GLSL: MIT |
