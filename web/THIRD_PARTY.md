# Third-party software

Every entry in `package.json` (exact pins), with the installed version and its license (spec §6, plan R4).
Regenerate the rows with `node scripts/licenses.mjs`.

## Runtime

Bundled into the app.

| name | version | license |
|---|---|---|
| butterchurn | 3.0.0-beta.5 | MIT |
| fft.js | 4.0.4 | MIT |
| react | 19.3.1 | MIT |
| react-dom | 19.3.1 | MIT |
| twgl.js | 7.0.0 | MIT |

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

### isf (14)

| path | author | source | license |
|---|---|---|---|
| `isf/Chromatic Aberration.fs` | VIDVOX | https://github.com/Vidvox/ISF-Files | MIT |
| `isf/Circular Feedback Mask.fs` | VIDVOX | https://github.com/Vidvox/ISF-Files | MIT |
| `isf/Comet Tails.fs` | VIDVOX | https://github.com/Vidvox/ISF-Files | MIT |
| `isf/Kaleidoscope Tile.fs` | VIDVOX | https://github.com/Vidvox/ISF-Files | MIT |
| `isf/Kaleidoscope.fs` | VIDVOX | https://github.com/Vidvox/ISF-Files | MIT |
| `isf/Long Exposure.fs` | VIDVOX | https://github.com/Vidvox/ISF-Files | MIT |
| `isf/Mirror.fs` | VIDVOX | https://github.com/Vidvox/ISF-Files | MIT |
| `isf/Pixellate.fs` | VIDVOX | https://github.com/Vidvox/ISF-Files | MIT |
| `isf/Posterize.fs` | VIDVOX | https://github.com/Vidvox/ISF-Files | MIT |
| `isf/Sine Warp Tile.fs` | VIDVOX | https://github.com/Vidvox/ISF-Files | MIT |
| `isf/Truchet Tile.fs` | pjkarlik | https://github.com/Vidvox/ISF-Files | MIT |
| `isf/VHS Glitch.fs` | David Lublin, original by Staffan Widegarn Åhlvik | https://github.com/Vidvox/ISF-Files | MIT |
| `isf/Worley Cells.fs` | VIDVOX | https://github.com/Vidvox/ISF-Files | MIT |
| `isf/v002-CRT-Displacement.fs` | vade | https://github.com/Vidvox/ISF-Files | MIT |

### own (16)

| path | author | source | license |
|---|---|---|---|
| `own/domain-warp.fs` | VeeJay Wizard (own) + webgl-noise snoise (Ian McEwan, Ashima Arts) | https://github.com/ashima/webgl-noise | MIT (own), MIT (webgl-noise) |
| `own/echo.fs` | VeeJay Wizard (own) | - | MIT (own) |
| `own/feedback-zoom.fs` | VeeJay Wizard (own) | - | MIT (own) |
| `own/flash.fs` | VeeJay Wizard (own) | - | MIT (own) |
| `own/flythrough.fs` | VeeJay Wizard (own) | - | MIT (own) |
| `own/fractal.fs` | VeeJay Wizard (own) | - | MIT (own) |
| `own/ink.fs` | VeeJay Wizard (own) + webgl-noise snoise (Ian McEwan, Ashima Arts) | https://github.com/ashima/webgl-noise | MIT (own), MIT (webgl-noise) |
| `own/liquid-chrome.fs` | VeeJay Wizard (own) | - | MIT (own) |
| `own/metaballs.fs` | VeeJay Wizard (own) | - | MIT (own) |
| `own/scanlines.fs` | VeeJay Wizard (own) | - | MIT (own) |
| `own/sdf-shapes.fs` | VeeJay Wizard (own) + hg_sdf (Mercury) | https://mercury.sexy/hg_sdf/hg_sdf.glsl | MIT (own), MIT (hg_sdf, its MIT option) |
| `own/smoke.fs` | VeeJay Wizard (own) + webgl-noise srdnoise (Stefan Gustavson) | https://github.com/stegu/webgl-noise | MIT (own), MIT (webgl-noise) |
| `own/strobe.fs` | VeeJay Wizard (own) | - | MIT (own) |
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
- hg_sdf (Mercury, version 2021-07-28), https://mercury.sexy/hg_sdf/hg_sdf.glsl. Dual-licensed `MIT OR CC-BY-NC-4.0`, used under MIT ("Copyright (c) 2011-2021 Mercury Demogroup"). In `own/sdf-shapes.fs`, adapted to GLSL ES 1.00 (float literals; `fDodecahedron` is `fGDF` unrolled).

### Credits in the files' comments

Upstream work that a file names in a comment. The files state no license for it: the license in the tables is the file's own (its repo's, for ISF-Files), and the upstream licenses are not checked.
- `isf/Truchet Tile.fs`: adapted from https://github.com/pjkarlik/TruchetTiles.
- `isf/VHS Glitch.fs`: based on https://github.com/staffantan/unity-vhsglitch, converted by David Lublin / VIDVOX.
- `isf/v002-CRT-Displacement.fs`: by vade; no upstream URL in the file.
- `isf/Comet Tails.fs`: the effect is described at https://bavc.github.io/avaa/artifacts/image_lag.html. `isf/Worley Cells.fs`: the common "iq" sin-based hash.
- `transitions/BurnThrough.glsl` and `transitions/PerlinDissolve.glsl`: value noise based on Morgan McGuire (`@morgan3d`), https://www.shadertoy.com/view/4dS3Wd. The files give it no license; Shadertoy's default is CC BY-NC-SA 3.0, which spec §6 allows.
- `transitions/PerlinDissolve.glsl`: the `random` one-liner from http://byteblacksmith.com/improvements-to-the-canonical-one-liner-glsl-rand-for-opengl-es-2-0/.
- `transitions/GlitchMemories.glsl`: based on work from natewave. `transitions/Hexagonalize.glsl`: hex math from http://www.redblobgames.com/grids/hexagons/. `transitions/Swirl.glsl`: ported by gre from https://gist.github.com/corporateshark/cacfedb8cca0f5ce3f7c.
- `own/domain-warp.fs`: the technique is after Inigo Quilez, https://iquilezles.org/articles/warp/ (named in its description).
