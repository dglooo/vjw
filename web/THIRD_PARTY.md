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
| onnxruntime-web | 1.31.1 | MIT |
| react | 19.3.1 | MIT |
| react-dom | 19.3.1 | MIT |
| twgl.js | 7.0.0 | MIT |

@mediapipe/tasks-vision: **probe-only** until the R0 ruling ships an arm (plan_camera S0.2, design D8). The page self-hosts it: `postinstall` (`scripts/models.mjs`) copies the package's `wasm/` to the git-ignored `public/mediapipe/` and downloads the probe models (Apache-2.0, `selfie_segmenter_landscape.tflite` 250,177 B, the URL and size from research_camera.md §1) to the git-ignored `public/models/`, so the browser touches localhost only (D7). The models themselves are the probe-only part; the runtime ships only once an arm is ruled.

onnxruntime-web: **probe-only** until the R0 ruling ships an arm (plan_camera S0.5, design D8). The page self-hosts it: `postinstall` (`scripts/models.mjs`) copies the WebGPU build's wasm glue + binary (`ort-wasm-simd-threaded.asyncify.{mjs,wasm}`) to the git-ignored `public/ort/` and downloads the RVM model (`rvm_mobilenetv3_fp16.onnx` 7,503,483 B, the official release URL, size per research_camera.md §1) to the git-ignored `public/models/`, so the browser touches localhost only (D7). The RVM model is **GPL-3.0** (PeterL1n/RobustVideoMatting, re-released 2021-09-16; allowed by spec §6, the user ruling of 2026-10-27) — the probe-only part, like the MediaPipe models. `ldenoue/rvm-webgpu` was the wiring reference only: it has no licence file, so nothing was copied from it.

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

Besides `particles.ts`, the only code and shaders ported from third parties are the ones under Shaders below.

## Shaders

Every file under `src/fx/isf`, `src/fx/own` and `src/fx/transitions` has a row (spec §6); paths are relative to `web/src/fx/`.
The three tables come from `node scripts/shaders.mjs`, which reads each file's header. After adding a shader, rerun it and paste the output over the tables.

- `isf/`: [Vidvox/ISF-Files](https://github.com/Vidvox/ISF-Files). The author is the file's `CREDIT`. An ISF header has no license line, so the license is the repo's: MIT (its LICENSE reads "Copyright (c) 2018", with no holder named). Each file's first line records it: `// Source: … · MIT`.
- `own/`: ours, MIT (the project's license, spec §6). Library code inlined in a file keeps its original header there, and the row names it.
- `transitions/`: [gl-transitions](https://github.com/gl-transitions/gl-transitions) 2.0.0, the `glsl3/` sources. Author and license are the file's own `// Author:` and `// License:` lines (all 12 are MIT, as is the repo's LICENSE); the source is the upstream file its header names. `crossfade.glsl` is ours.

### isf (18)

| path | author | source | license |
|---|---|---|---|
| `isf/ASCII Art.fs` | VIDVOX (Ported from https://www.shadertoy.com/view/lssGDj) | https://github.com/Vidvox/ISF-Files | MIT |
| `isf/Chromatic Aberration.fs` | VIDVOX | https://github.com/Vidvox/ISF-Files | MIT |
| `isf/Circular Feedback Mask.fs` | VIDVOX | https://github.com/Vidvox/ISF-Files | MIT |
| `isf/Color Monochrome.fs` | zoidberg | https://github.com/Vidvox/ISF-Files | MIT |
| `isf/Color Replacement.fs` | VIDVOX | https://github.com/Vidvox/ISF-Files | MIT |
| `isf/Comet Tails.fs` | VIDVOX | https://github.com/Vidvox/ISF-Files | MIT |
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

### own (34)

| path | author | source | license |
|---|---|---|---|
| `own/bars.fs` | VeeJay Wizard (own) + FFT Color Lines and FFT Filled Waveform (VIDVOX) | https://github.com/Vidvox/ISF-Files | MIT (own), MIT (ISF-Files) |
| `own/bloom.fs` | VeeJay Wizard (own) | - | MIT (own) |
| `own/change-color.fs` | VeeJay Wizard (own) | - | MIT (own) |
| `own/diff-feedback.fs` | VeeJay Wizard (own) | - | MIT (own) |
| `own/domain-warp.fs` | VeeJay Wizard (own) + webgl-noise snoise (Ian McEwan, Ashima Arts) | https://github.com/ashima/webgl-noise | MIT (own), MIT (webgl-noise) |
| `own/echo.fs` | VeeJay Wizard (own) | - | MIT (own) |
| `own/edge-rings.fs` | VeeJay Wizard (own) | - | MIT (own) |
| `own/feedback-zoom.fs` | VeeJay Wizard (own) | - | MIT (own) |
| `own/flash.fs` | VeeJay Wizard (own) | - | MIT (own) |
| `own/flow-smear.fs` | VeeJay Wizard (own) + Optical Flow Generator (VIDVOX / v002 / Andrew Benson) | https://github.com/Vidvox/ISF-Files | MIT (own), MIT (ISF-Files) |
| `own/flythrough.fs` | VeeJay Wizard (own) | - | MIT (own) |
| `own/fractal.fs` | VeeJay Wizard (own) | - | MIT (own) |
| `own/gradient.fs` | VeeJay Wizard (own) | - | MIT (own) |
| `own/ink.fs` | VeeJay Wizard (own) + webgl-noise snoise (Ian McEwan, Ashima Arts) | https://github.com/ashima/webgl-noise | MIT (own), MIT (webgl-noise) |
| `own/julia.fs` | VeeJay Wizard (own) | - | MIT (own) |
| `own/led-grid.fs` | VeeJay Wizard (own) | - | MIT (own) |
| `own/light-tunnel.fs` | VeeJay Wizard (own) | - | MIT (own) |
| `own/liquid-chrome.fs` | VeeJay Wizard (own) | - | MIT (own) |
| `own/metaballs.fs` | VeeJay Wizard (own) | - | MIT (own) |
| `own/mosaic.fs` | VeeJay Wizard (own) + Triangle Mosaic (VIDVOX) | https://github.com/Vidvox/ISF-Files | MIT (own), MIT (ISF-Files) |
| `own/phaser.fs` | VeeJay Wizard (own) | - | MIT (own) |
| `own/polar.fs` | VeeJay Wizard (own) | - | MIT (own) |
| `own/radial-blur.fs` | VeeJay Wizard (own) | - | MIT (own) |
| `own/reaction-diffusion.fs` | VeeJay Wizard (own) | - | MIT (own) |
| `own/scanlines.fs` | VeeJay Wizard (own) | - | MIT (own) |
| `own/sdf-shapes.fs` | VeeJay Wizard (own) + hg_sdf (Mercury) | https://mercury.sexy/hg_sdf/hg_sdf.glsl | MIT (own), MIT (hg_sdf, its MIT option) |
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
- hg_sdf (Mercury, version 2021-07-28), https://mercury.sexy/hg_sdf/hg_sdf.glsl. Dual-licensed `MIT OR CC-BY-NC-4.0`, used under MIT ("Copyright (c) 2011-2021 Mercury Demogroup"). In `own/sdf-shapes.fs`, adapted to GLSL ES 1.00 (float literals; `fDodecahedron` is `fGDF` unrolled).
- Wombat (Brian Sharpe), the GPU noise library, http://briansharpe.wordpress.com, https://github.com/BrianSharpe. The author's permissive header: "I'm not one for copyrights. Use the code however you wish. All I ask is that credit be given back to the blog or myself" (no licence file in the in-repo TD extract; personal use). In `own/stars.fs`: `Stars2D` and `PolkaDot2D` verbatim, with only the helpers they call (`FAST32_hash_2D_Cell`, `Falloff_Xsq_C1`/`Falloff_Xsq_C2`).

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
- `own/domain-warp.fs`: the technique is after Inigo Quilez, https://iquilezles.org/articles/warp/ (named in its description).
- `own/bloom.fs`: the dual filter is after Bjørge, "Bandwidth-Efficient Rendering" (ARM, SIGGRAPH 2015), via our `src/gl/bloom.ts`. `own/reaction-diffusion.fs`: the Gray-Scott step follows jsexp's grayscott (pmneila, https://github.com/pmneila/jsexp, BSD-3-Clause) as the algorithm reference only; no code copied.
- The TD look files (`own/td-feedback.fs`, `edge-rings.fs`, `bloom.fs`, `light-tunnel.fs`, `radial-blur.fs`, `flow-smear.fs`, `reaction-diffusion.fs`): each header's `Look:` line names the TouchDesigner component it studies; rewritten, no TD code. `own/light-tunnel.fs` adds that TD's shader names Andrew Benson (Cycling '74) as its origin.

## MilkDrop presets

`src/milkdrop/presets/<slug>.json`, copied from `butterchurn-presets` 3.0.0-beta.4 (`presets/converted/<name>.json`; the package is MIT, "Copyright (c) 2013-2018 Jordan Berg") by `node scripts/milk-presets.mjs "<preset name>"…`, which also prints the rows below.
- JSON has no comment header, so each file carries the credit (spec §6) as fields: `{ name, author, url, license, preset }`. `author` is the name before the first ` - ` (MilkDrop's "author - title").
- The presets are the MilkDrop community's work; the package gives no license for their content, so it is recorded as unknown.
- The set is picked by `agents/planner/plan_milkdrop.md` S3.1's rule from the CP1 probe. Adding a preset = one file + one row.

| slug | name | author | license |
|---|---|---|---|
| `adam-eatit-fx-2-martin-disco-mix-lodus-geiss-ludicrous-speed-flexi-aderrasi-n-hexcollie` | adam eatit fx 2 martin - disco mix, lodus, geiss, ludicrous speed,flexi, aderrasi n hexcollie | adam eatit fx 2 martin | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `adamfx-mashup-2-martin-reflections-on-black-tile-raron-n-flexi` | AdamFX Mashup 2 Martin - reflections on black tile + Raron N Flexi  | AdamFX Mashup 2 Martin | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `aderrasi-geiss-airhandler-kali-mix-painterly-tendrils-colorfast` | Aderrasi + Geiss - Airhandler (Kali Mix) - Painterly Tendrils Colorfast | Aderrasi + Geiss | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `cope-alternative-energy-antimatter-mod-1-4z` | cope - alternative energy (antimatter mod_1)4z | cope | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `cope-the-neverending-explosion-of-red-liquid-fire` | Cope - The Neverending Explosion of Red Liquid Fire | Cope | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `fed-slowfast-1-1` | fed - slowfast 1.1 | fed | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `flexi-fishbrain-geiss-martin-tokamak-witchery` | Flexi, fishbrain, Geiss + Martin - tokamak witchery | Flexi, fishbrain, Geiss + Martin | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `flexi-fishbrain-martin-witchery` | Flexi, fishbrain + Martin - witchery | Flexi, fishbrain + Martin | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `flexi-martin-cascading-decay-swing` | Flexi + Martin - cascading decay swing | Flexi + Martin | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `flexi-martin-geiss-dedicated-to-the-sherwin-maxawow` | Flexi, martin + geiss - dedicated to the sherwin maxawow | Flexi, martin + geiss | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `flexi-psychenapping` | Flexi - psychenapping | Flexi | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `flexi-swing-out-on-the-spiral` | flexi - swing out on the spiral | flexi | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `geiss-explosion-mod-2b` | _Geiss - Explosion Mod 2b | _Geiss | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `geiss-tokamak-plus-2` | Geiss - Tokamak Plus 2 | Geiss | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `martin-angel-flight` | martin - angel flight | martin | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `martin-liquid-arrows` | Martin - liquid arrows | Martin | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `mig-colorful9` | _Mig_COLORFUL9 | _Mig_COLORFUL9 | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `milk-artist-at-our-best-fed-slowfast-ft-adamfx-n-martin-hd-cosmofx` | Milk Artist At our Best - FED - SlowFast Ft AdamFX n Martin - HD CosmoFX | Milk Artist At our Best | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `orb-magma-pool` | ORB - Magma Pool | ORB | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `rovastar-geiss-hyperspace-kaleidoscope` | Rovastar + Geiss - Hyperspace - kaleidoscope | Rovastar + Geiss | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `royal-mashup-307` | $$$ Royal - Mashup (307) | $$$ Royal | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `shifter-escape-sigur-ros` | shifter - escape (sigur ros) | shifter | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `suksma-vector-exp-1-couldn-t-not` | suksma - vector exp 1 - couldn′t not | suksma | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `vovan-geiss-bass-with-flover-feedback-mix-2` | _Vovan + Geiss - Bass With Flover (Feedback Mix) 2 | _Vovan + Geiss | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
| `zylot-true-visionary-final-mix` | Zylot - True Visionary (Final Mix) | Zylot | content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg) |
