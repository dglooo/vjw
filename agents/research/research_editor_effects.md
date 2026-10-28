# Research — Editor & effects sources (Stage 2, epic `editor`)

## TL;DR
- **Effect pools:** VIDVOX ISF-Files has 327 ISF shaders (MIT repo): 207 filters, 68 transitions, 52 generators. editor.isf.video lists **10,552** public ISF shaders, with no per-shader license field; in a sample, ~70% are generators and ~30% filters. gl-transitions has **125** transitions (123 MIT, 2 BSD) and ships a ready **GLSL ES 3.00** build.
- **ISF JS runtime** (`interactive-shader-format`): MIT in the repo but ISC on npm, and dormant on npm since 2020. It emits GLSL ES 1.00, **throws on `audio`/`audioFFT` inputs**, and its final pass always draws to the default framebuffer (`null`), not to a caller's FBO.
- **Shader libs:** lygia is **Prosperity-3.0.0 (non-commercial; personal use allowed) + Patron**. webgl-noise is MIT. hg_sdf is `MIT OR CC-BY-NC-4.0`. hydra-synth is **AGPL-3.0**. cables.gl is MIT.
- **Node editors:** @xyflow/react (MIT, very active, React ≥17 incl. 19, 60 kB gz). rete v2 (MIT; its React plugin supports React 19 but needs styled-components). litegraph.js (MIT, dormant; the Comfy fork is archived). baklavajs (MIT, active, Vue-only renderer).
- **Audio-mapping conventions:** Resolume: per-parameter FFT with band (L/M/H + in/out), Gain, Fall and direction. VDMX: any slider receives a data-source (filter, LFO, sequencer) through a per-receiver Num FX chain (Fall, invert, math). Synesthesia: uniforms (Level/Hits/Presence/Time × 5 bands, OnBeat, BPM sines) plus `smooth`/`speed` control modifiers. MilkDrop: `bass/mid/treb` ≈1 normal, plus damped `*_att`.

## Freshness
- Checked **2026-10-28**. npm (latest + publish date): interactive-shader-format 2.8.1 (2020-03-02); gl-transitions 2.0.0 (2026-10-25); gl-transition 2.1.0 (2026-06-11); lygia 1.4.1 (2026-02-07); glsl-noise 0.0.0 (2013-09-27); @xyflow/react 12.12.0 (2026-09-24); rete 2.0.6 (2025-06-30); rete-react-plugin 2.1.2 (2026-07-10); litegraph.js 0.7.18 (2024-01-08); @comfyorg/litegraph 0.17.2 (2025-08-06, deprecated); baklavajs 2.8.1 (2025-11-02); hydra-synth 1.4.0 (2025-09-14).
- Last commits come from shallow clones (scratchpad) or the GitHub API (anonymous). Sizes are min / min+gz from the bundlephobia API (whole package, before tree-shaking).
- No `./donor/` dir. shadertoy.com returns 403 to our fetchers, so Shadertoy facts come from secondary sources (marked).
- Does not repeat `research_render_stack.md` §1 (WebGL2 libs) or §7 (Shadertoy license).

## §1 ISF (Interactive Shader Format, VIDVOX)
- **Spec v2** ([ISF_Spec README](https://github.com/mrRay/ISF_Spec/blob/master/README.md); MIT; last commit 2025-03-20). A file is a GLSL fragment shader `.fs` (optional `.vs`) with a JSON blob in its leading comment.
  - Top-level keys: `ISFVSN`, `VSN`, `DESCRIPTION`, `CREDIT`, `CATEGORIES`, `INPUTS`, `PASSES`, `IMPORTED`.
  - `INPUTS[].TYPE` ∈ `event, bool, long, float, point2D, color, image, audio, audioFFT`. Keys: `NAME`, `LABEL`, `DEFAULT`, `MIN`, `MAX`, `IDENTITY`; `long` adds `VALUES`/`LABELS` (pop-up menu); `event` is a momentary button.
  - `audio` is passed as an image: one row per channel, one column per sample, centred at 0.5. `audioFFT` is passed the same way with FFT bins. On both, `MAX` = the number of samples or bins the shader wants.
  - `PASSES[]`: `TARGET` (a named buffer, readable in later passes), `PERSISTENT` (kept across frames, e.g. feedback), `FLOAT` (32-bit), `WIDTH`/`HEIGHT` (expressions using `$WIDTH`, `$HEIGHT`, `$<input>`). `IMPORTED` loads image files.
  - Auto uniforms: `PASSINDEX`, `RENDERSIZE`, `isf_FragNormCoord`, `TIME`, `TIMEDELTA`, `DATE`, `FRAMEINDEX`. Functions: `IMG_PIXEL`, `IMG_NORM_PIXEL`, `IMG_SIZE`.
  - **Kind by convention:** an `image` input named `inputImage` makes a **filter**; `startImage` + `endImage` + `progress` make a **transition**; anything else is a generator.
  - The ISF Editor (desktop) has "Import from Shadertoy/GLSL Sandbox"; the README says "shocking how many will just work". Native runtimes: ISFMSLKit (Metal), VVISF-GL (C++).
- **JS runtime** [`msfeldstein/interactive-shader-format-js`](https://github.com/msfeldstein/interactive-shader-format-js) (the npm package `interactive-shader-format`). This is the renderer the ISF website uses (per the spec README).
  - License: repo **MIT** (LICENSE added 2025-12-31, PR #53); the npm 2.8.1 `license` field says **ISC**.
  - Last commit 2025-12-31 (license only); 108★. 137.6 / 35.0 kB.
  - API: `new ISFRenderer(gl)` takes **the caller's context**; then `loadSource`, `setValue`, `pushTextures`, `draw(destination)`. The README example uses `getContext("webgl")`.
  - Emits **GLSL ES 1.00** (`texture2D`, `varying`; [ISFParser.js](https://github.com/msfeldstein/interactive-shader-format-js/blob/master/src/ISFParser.js)). WebGL2 contexts also accept ES 1.00 ([WebGL 2.0 spec](https://registry.khronos.org/webgl/specs/latest/2.0/)).
  - `typeUniformMap` (ISFParser.js L12–20) covers only float/image/bool/event/long/color/point2D, so **`audio`/`audioFFT` throw "Unknown input type"**.
  - `draw()` binds intermediate pass FBOs, but binds **framebuffer `null`** for the final pass and after every pass, then `paintToScreen` ([ISFRenderer.js L300–357](https://github.com/msfeldstein/interactive-shader-format-js/blob/master/src/ISFRenderer.js)). There is no API to target a caller FBO.
  - `contextState.reset()` changes shared GL state; whether it clashes with twgl state is ⚠️ unverified.
- **[Vidvox/ISF-Files](https://github.com/Vidvox/ISF-Files)**: MIT (LICENSE ©2018); last commit 2026-06-04; 103★. Measured by parsing all headers in a shallow clone:
  - **327 `.fs`**: 207 filters, 68 transitions, 52 generators.
  - 56 multipass, 49 with `PERSISTENT`, **7 with audio inputs** (5 `audioFFT`, 3 `audio`). Input types: float 873, image 358, color 151, bool 137, long 96, point2D 90, event 21.
  - Per-shader provenance: 326/327 carry a `CREDIT` key; 6 cite shadertoy.com; 1 mentions Creative Commons (`Boxinator.fs`); 24 transitions carry MIT lines (gl-transitions ports). Grep heuristic, ⚠️ not a legal audit.
- **[editor.isf.video](https://editor.isf.video/)**: user uploads, active (2026 uploads present). Undocumented JSON API found in its client bundle: `/api/search?from=N` (18 per page, `numberOfResults`) and `/api/shaders/:id`.
  - **10,552 public shaders** (2026-10-28). The record schema has **no license field**; each author's license, if any, is only in the source text.
  - Evenly spaced sample of 432 (⚠️ estimate):
    - kind: 302 generators / 130 filters / 0 transitions (search `q=transition` has 53 hits);
    - license text: ~16% Creative Commons, ~14% Shadertoy-derived without a license line, ~69% none;
    - 5 with audio inputs.
  - Third-party authors use CC BY-NC-SA 4.0 or custom terms ([search summary](https://discourse.vidvox.net/t/two-weeks-of-isf-shader-conversion/2649)).
- implication: the open ISF corpus is filter-heavy and almost never audio-typed; audio would reach these shaders through mapped `float` inputs, or through the runtime adding `audio`/`audioFFT` support.

## §2 gl-transitions
- [gl-transitions/gl-transitions](https://github.com/gl-transitions/gl-transitions): MIT (repo; [README §License](https://github.com/gl-transitions/gl-transitions#license)). Last commit 2026-10-25; 2.2k★; very active (1.75 → 2.0 within Oct 2026).
  - **125** `transitions/*.glsl`: per-header licenses are 124 MIT, 1 BSD-3-Clause, 1 BSD-2-Clause; the README says "all are MIT except two under BSD".
  - npm `gl-transitions` 2.0.0: 207.3 / 49.2 kB (the whole collection as JSON/JS).
  - 2.0 renamed every transition to PascalCase and made them alpha-preserving ([CHANGELOG](https://github.com/gl-transitions/gl-transitions/blob/master/packages/gl-transitions/CHANGELOG.md)).
- **Format (spec v1):** `vec4 transition(vec2 uv)` in GLSL ES 1.00. The host supplies `uniform float progress` (0 → only `from`, 1 → only `to`), `ratio` (w/h), `getFromColor(uv)` and `getToColor(uv)`.
  - Params are uniforms with a default in a comment: `uniform float foo; // = 42.0`, plus optional hint lines (min/max/step/description).
  - Extra `sampler2D` inputs are listed in `textures`. `uv` origin is bottom-left; straight RGBA out.
- **WebGL2-ready:** the package ships `glsl3/<name>.glsl` (all compile as GLSL ES 3.00 in CI with glslang). Also WGSL, MSL, SkSL and `compatibility.json`.
  - The documented host wrapper is `uniform sampler2D from, to; uniform float progress, ratio; … void main(){ _fragColor = transition(_uv); }` ([package README](https://github.com/gl-transitions/gl-transitions/tree/master/packages/gl-transitions)).
- **Crossfade plug-in point:** `from`/`to` = the two scene FBO textures, `progress` = the fade value. Helper [`gl-transition`](https://github.com/gre/gl-transition-libs) 2.1.0 (MIT, 33.6 / 12.1 kB, dep `gl-shader`):
  - `createTransition(gl, t).draw(progress, from, to, w, h, params)` issues `drawArrays(TRIANGLES,0,3)`; it assumes a bound full-screen-triangle buffer;
  - it targets `WebGLRenderingContext`; WebGL2/FBO behaviour is ⚠️ unverified.
- implication: the transition contract matches a two-texture `progress` crossfade one-to-one; the ISF-Files transitions are largely the same set.

## §3 Shadertoy import
- **Format:**
  - `void mainImage(out vec4 fragColor, in vec2 fragCoord)`.
  - Uniforms: `iResolution` (vec3), `iTime`, `iTimeDelta`, `iFrame`, `iChannelTime[4]`, `iChannelResolution[4]`, `iMouse` (vec4), `iDate` (vec4), `iSampleRate`, `iChannel0..3` ([Natron Shadertoy docs](https://natron.readthedocs.io/en/rb-2.5/plugins/net.sf.openfx.Shadertoy.html)).
  - Language: WebGL 2.0 / GLSL ES 3.00 ([help mirror](https://techfeed.io/entries/5e30044769b1a46f7bb91a68), [MLT docs](https://mltframework.org/plugins/FilterOpenfx-net-sf-openfx-shadertoy/)).
- **Multipass:** Buffers A–D render in order before Image; a buffer reads its own previous frame through an iChannel for feedback ([ShaderLab #44](https://gamedev.net/shaderlab/44-feedback-paint-trails/), [shader_buffers](https://pub.dev/documentation/shader_buffers/latest/)).
  - The `Common` tab, `Cube A` and `Sound` tabs: ⚠️ unverified (no primary source reachable).
  - Music/mic channel = a **512×2 texture (row 0 FFT, row 1 waveform)**: ⚠️ unverified; only Shadertoy-compatible tools document it ([Synthclipse](https://synthclipse.sourceforge.net/user_guide/music.html), [shader_fun](https://pub.dev/packages/shader_fun)).
- **API** ([shadertoy-api PyPI](https://pypi.org/project/shadertoy-api/), [Pipedream](https://pipedream.com/apps/shadertoy)):
  - Needs an **app key** from `shadertoy.com/myapps` (login).
  - **Only shaders published as "Public+API"** are served.
  - `GET /api/v1/shaders/query/<terms>?key=…` with `sort` (name/love/popular/newest/hot), `filter` (vr/soundoutput/soundinput/webcam/multipass/musicstream) and `from`/`num`; `GET /api/v1/shaders/<id>?key=…`.
  - The JSON has `info` plus `renderpass[]` (code, inputs with channel/type/src/sampler, outputs).
  - API terms of use: ⚠️ unverified (the howto page returns 403).
- **Default license:** CC BY-NC-SA 3.0, see `research_render_stack.md` §7. **Single-pass adapter surface:** declare the uniforms above, then `out vec4 fragColor; void main(){ mainImage(fragColor, gl_FragCoord.xy); }`.
  - Extra work per shader: supply each used `iChannel` (texture, buffer, keyboard or audio), one FBO (ping-pong for self-reads) per Buffer A–D, and map `iMouse`.
  - The ISF Editor's importer automates this conversion (§1).

## §4 Shader building-block libraries
| Lib | License (SPDX) | Latest / last commit | Size | Maint. | Integration |
|---|---|---|---|---|---|
| [lygia](https://github.com/patriciogonzalezvivo/lygia) | **Prosperity Public License 3.0.0** (not on the SPDX list → `LicenseRef-`) + **Patron License** for GitHub sponsors/contributors ([README §License](https://github.com/patriciogonzalezvivo/lygia#license)). Prosperity = non-commercial free, 30-day commercial trial; its "Personal Uses" clause lists hobby/private entertainment as non-commercial. A per-version permanent commercial license is offered | npm 1.4.1 (2026-02-07) / 2026-10-24 | 659 `.glsl` files ≈1.28 MB source; npm 4.1 MB unpacked. A shader only pulls the files it `#include`s | Very active, 3.5k★ | `#include "lygia/…"`, resolved by vite-plugin-glsl, `lygia.xyz/resolve.esm.js`, or a local clone. Also HLSL/MSL/WGSL/WESL |
| [webgl-noise (stegu)](https://github.com/stegu/webgl-noise) | MIT (Ashima Arts 2011 + S. Gustavson 2011–16) | No official npm / 2025-04-27. Original [ashima/webgl-noise](https://github.com/ashima/webgl-noise) last push 2024-11-15 | 12 files, 59 kB source (simplex 2–4D, classic, cellular, psrdnoise) | Maintained, low churn | copy |
| [glsl-noise (hughsk)](https://github.com/hughsk/glsl-noise) | MIT | 0.0.0 (2013-09-27) / 2015-12-27 | glslify packaging of webgl-noise | Dormant | import (glslify) or copy |
| [hg_sdf (Mercury)](https://mercury.sexy/hg_sdf/hg_sdf.glsl) | `MIT OR CC-BY-NC-4.0` (SPDX line in the file header) | version 2021-07-28 / no repo found (⚠️) | 1 file, 830 lines, 27 kB | Frozen since 2021 | copy |
- implication: lygia's non-commercial clause sits at the same pre-open-source gate as the Shadertoy shaders (spec §6).

## §5 Node/patch editors and reference VJ tools
| Lib | SPDX | Latest / last commit | Size min/gz | React 19 | Notes |
|---|---|---|---|---|---|
| [@xyflow/react](https://github.com/xyflow/xyflow) | MIT | 12.12.0 (2026-09-24) / 2026-10-26 | 187.8 / 59.9 kB | peer `react >=17` | Very active, 38.8k★. Nodes are React components. Deps: zustand, classcat, @xyflow/system. Graph model and evaluation are the app's job |
| [rete](https://github.com/retejs/rete) v2 | MIT | core 2.0.6 (2025-06-30) / 2025-06-30. [react-plugin](https://github.com/retejs/react-plugin) 2.1.2 / 2026-07-10 | core 11.4/3.1, react-plugin 34.5/10.7, area-plugin 36.7/9.7 kB | react-plugin peer `^16.8.6…^19`, **+ styled-components ^5\|\|^6 peer** | Framework-agnostic core plus renderer plugins; core quiet since 2025-06 |
| [litegraph.js](https://github.com/jagenjo/litegraph.js) | MIT | 0.7.18 (2024-01-08) / 2024-01-08 | 499.8 / 121.2 kB | n/a (Canvas2D, no React) | Dormant. The [Comfy-Org fork](https://github.com/Comfy-Org/litegraph.js) is **archived** (merged into ComfyUI_frontend 2025-08-05); npm `@comfyorg/litegraph` deprecated |
| [baklavajs](https://github.com/newcat/baklavajs) | MIT | 2.8.1 (2025-11-02) / 2026-10-23 | 109.1 / 28.7 kB (core alone 24.0 / 6.2) | **No**: the renderer is Vue 3 (`@baklavajs/renderer-vue`); the core is framework-free | Active. Has a dataflow engine (`@baklavajs/engine`) |
- **cables.gl** ([licence FAQ](https://cables.gl/docs/faq/licence_payment/licence/licence)):
  - "Everything needed to run a cables patch is licensed under the MIT License"; open-sourced with an offline standalone in Aug 2024 ([CDM](https://cdm.link/2024/08/cables-gl-open-offline/)).
  - The [repo](https://github.com/cables-gl/cables) has no LICENSE file (package.json says `MIT`); last push 2026-10-28.
  - Exports: iframe, zip, standalone exe, GitHub Pages/Netlify, CLI ([docs](https://cables.gl/docs/4_export_embed/dev_embed/dev_embed)).
  - Embedding API (shared GL context, variables): ⚠️ unverified.
- **hydra-synth** ([repo](https://github.com/hydra-synth/hydra-synth)): **AGPL-3.0**; 1.4.0 (2025-09-14); last commit 2026-07-16; 178.3 / 56.0 kB; built on **regl** (WebGL1 API, see render_stack §1).
  - Model: chained functions compiled to GLSL, e.g. `osc(4,0.1,1.2).rotate().out()`.
  - **53 transforms**: 9 src, 10 coord, 16 color, 7 combine, 11 combineCoord (`src/glsl/glsl-functions.js`).
  - Any argument may be a **JS function, evaluated per frame** (`src/format-arguments.js` L73). Arrays act as sequences with `.fast/.smooth/.ease` (`src/lib/array-utils.js`).
  - Options: `canvas`, `autoLoop:false` + `tick()`, `makeGlobal`, `detectAudio`.
- **nodes.io** (variable.io): desktop beta for Win/Mac/Linux plus browser examples; JS/WebGL-framework-agnostic ([site](https://nodes.io)). License/pricing ⚠️ unverified.
- **Vuo:** LGPL-2.0+ compiler/editor/SDK, MIT non-Pro nodes, proprietary binary/Pro ([license](https://vuo.org/license)). **TouchDesigner:** proprietary; the free Non-Commercial tier is capped at 1280×1280 ([licensing](https://derivative.ca/UserGuide/Licensing)). Both desktop, reference only.

## §6 Audio-reactive parameter mapping conventions
- **Resolume** ([parameter animation](https://resolume.com/support/en/parameter-animation)): every parameter has a control drop-down: Timeline, BPM Sync (duration in beats), **FFT**, Dashboard, Clip Position, Crossfader Phase, Envelope.
  - FFT source: External (device + channels), Composition, or Clip/Layer/Group audio.
  - **Band:** L/M/H buttons plus in/out points on the spectrum.
  - **Gain** (boost until the effect is right; master gain too) and **Fall** ("how quickly the value falls back from a peak").
  - **Direction:** `>` low→high, `<` high→low, `-`/`+` = audio sets the speed of movement.
  - Older manual: default L/M/H bin groups; Gain is a multiplier ([forum](https://resolume.com/forum/viewtopic.php?p=9341)).
- **VDMX** ([plugins](https://docs.vidvox.net/vdmx_plugins.html), [Num FX tutorial](https://vdmx.vidvox.net/tutorials/creating-a-falling-audio-level-data-source-using-number-fx-chains-in-vdmx)): every plugin publishes **data-sources**; any slider right-click → picks one ("receiver").
  - Audio Analysis: input + channel, pre-analysis gain, **any number of filters** (drag the centre frequency, drag up/down for width); smoothing per receiver.
  - LFO: sine/cosine/random/bezier; duration in seconds or **measures** when clocked.
  - Step Sequencer: data tracks, clock-relative duration, interpolation rate. Each receiver has a **Number FX chain** (e.g. **Fall**, invert, basic math).
- **Synesthesia** ([audio uniforms](https://app.synesthesia.live/docs/ssf/audio_uniforms.html), [scene.json](https://app.synesthesia.live/docs/ssf/json.html)): audio arrives as **uniforms that scene code consumes**, not as per-parameter bindings.
  - 5 bands (all/bass/mid/midhigh/high) × **Level** (smoothed 0–1), **Hits** (transients 0–1), **Presence** (sustained rise/fall), **Time** (a clock that speeds up with loudness).
  - Beat: `syn_OnBeat` (jumps to 1 and decays), `ToggleOnBeat`, `RandomOnBeat`, `BeatTime`.
  - Tempo: `syn_BPM` (50–220), `BPMConfidence`, `BPMSin/Tri` ×1/2/4/8. Song-level: `FadeInOut`, `Intensity`. Textures: `syn_Spectrum`, `syn_LevelTrail`.
  - Control modifiers: `smooth` (`PARAMS` default 0.01 ≈ 1/PARAMS frames), `speed` (integrates units/s), bang `counter`.
  - User-side per-control audio binding: ⚠️ not found in the docs.
- **MilkDrop** ([preset authoring](https://www.geisswerks.com/milkdrop/milkdrop_preset_authoring.html)): `bass/mid/treb` with "1 is normal; below ~0.7 quiet; above ~1.3 loud". `*_att` = "damped in time".
  - Mapping is code: per-frame equations, e.g. `zoom = zoom + 0.1*(vol-1)`. `q1..q32` carry values on to the shaders; `decay` 0.98 recommended.
- **hydra:** `a.fft[i]` with defaults 4 bins, smooth 0.4, cutoff 2, scale 10; beat = adaptive cutoff ×1.2 with decay (`src/lib/audio.js`, Meyda). Mapping = an arrow-function argument (§5).
- implication: all five share the source → (band select) → gain/scale → fall/smooth → range/direction chain; they differ in where it lives (a per-parameter UI in Resolume/VDMX, shader code in Synesthesia/MilkDrop/hydra).

## §7 Preset storage formats and browser options
- **Synesthesia:** a `.synScene` dir = `main.glsl` + `scene.json` + thumbnail (optional `script.js` per-frame JS, `images/`).
  - `scene.json` keys: `TITLE, CREDIT, DESCRIPTION, IMAGE_PATH, WIDTH, HEIGHT, CONTROLS, PASSES, HARD_TRANSITIONS, SMOOTH_TRANSITIONS, IMAGES, MEDIA, CUBEMAPS`.
  - `CONTROLS[]` types: slider/knob/toggle/bang/xy/color/dropdown, with `NAME, DEFAULT, MIN, MAX, UI_GROUP, DESCRIPTION, PARAMS` ([SSF](https://app.synesthesia.live/docs/ssf/ssf.html)).
- **Resolume:** composition = `.avc` **XML**, version-specific (newer comps fail in older Resolume). Lives in `Documents/Resolume Arena/Compositions` + `Presets/` (sources, effects, GUI, Advanced Output) ([directory list](https://resolume.com/support/es/directory-list), [forum](https://www.resolume.com/forum/viewtopic.php?p=68290)). No public schema ⚠️.
- **ISF:** a self-describing `.fs` (JSON header, §1). **gl-transitions:** a `.glsl` with comment metadata (§2). **MilkDrop/Butterchurn:** see `research_donor_milkdrop.md`.
- **localStorage:** 5 MiB per origin (strings only); over the limit throws `QuotaExceededError` ([MDN quotas](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)).
- **IndexedDB / OPFS (Chromium):** an origin may use up to **60% of disk**, the browser 80% total.
  - Best-effort data is evicted LRU, a whole origin at a time, unless `navigator.storage.persist()` is granted (Chrome auto-decides from engagement). `navigator.storage.estimate()` reports usage/quota.
- **File System Access API:** `showOpenFilePicker/showSaveFilePicker/showDirectoryPicker`, **Chrome 86+**; not in Firefox/Safari ([Chrome docs](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access)).
  - Needs a secure context and transient user activation ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/showSaveFilePicker)); `http://localhost` counts as secure ([MDN Secure contexts](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts)).
  - **Handles are serializable into IndexedDB**; on reuse, call `queryPermission`/`requestPermission`.
  - **Chrome 122+** offers a 3-way prompt incl. **"Allow on every visit"**; installed apps persist by default ([blog](https://developer.chrome.com/blog/persistent-permissions-for-the-file-system-access-api)).
