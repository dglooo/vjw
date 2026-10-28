# Research — donor scan: MilkDrop in the browser (Butterchurn)

## TL;DR
- Butterchurn is **MIT**. Stable `2.6.7` dates from 2019-03-12. `3.0.0-beta.5` (2025-07-13) is the only active line: it uses WASM equations and Webamp pins it. Last commit is 2026-04-20. GitHub Issues are **disabled**. Maintenance is low-gear, mostly a single maintainer.
- Butterchurn always creates **its own WebGL2 context**. In 3.x that context lives on an internal `OffscreenCanvas` and each frame is `drawImage`d onto a 2D output canvas. It draws to the default framebuffer, never into a caller's FBO. Audio comes from an AudioNode (it builds its own 3 AnalyserNodes, fftSize 1024), or the caller can pass raw time-domain bytes to `render()`.
- The packs are MIT as packaging (Jordan Berg). **The presets themselves carry no explicit license from their authors (⚠️ UNKNOWN).** projectM assumes they are public domain, but that is an assumption, not a grant. This is relevant to the spec §6 pre-open-source gate.
- **projectM is LGPL-2.1 ⚠️ COPYLEFT.** It has an Emscripten/WebGL2 build, and a 2026 npm WASM wrapper exists (also LGPL). Stims (Unlicense) is an app, not an embeddable library.

## Freshness
- 2026-10-27. **No `./donor/` directory exists in the repo**, so this artifact is web/npm only.
- Checked: `butterchurn` 2.6.7 / 3.0.0-beta.5; `butterchurn-presets` 2.4.7 / 3.0.0-beta.4; `@webamp/butterchurn` 3.0.0-beta.5; `milkdrop-preset-converter` 0.1.2; projectM v4.1.8; `@koel-project/projectm-wasm` 1.0.0; `milkdrop-toolchain` 0.1.0; Webamp master @ 2026-10-26.
- Spec read: `thoughts/spec_veejay_wizard.md` TL;DR, §2.4, §2.5, §2.7, §2.8, §6, §8.
- Gzip sizes were measured locally (`gzip -c`) on the npm tarballs. Source paths are written as `src/<file>` and point to https://github.com/jberg/butterchurn/blob/master/src/.

## §1 Butterchurn: license, versions, maintenance
- **License: MIT** (SPDX), per https://github.com/jberg/butterchurn/blob/master/LICENSE and the GitHub API license field.
- **Versions** (https://registry.npmjs.org/butterchurn): npm `latest` = **2.6.7 (2019-03-12)**; `beta` = **3.0.0-beta.5 (2025-07-13)**. The previous beta, 3.0.0-beta.4, came out 2021-06-01. The repo has no git tags.
- **Last commit:** 2026-04-20 (`fbac2f6`, CI/visual tests, node24 bump). There are 16 commits since 2025-01-01, mostly CI/tests (https://github.com/jberg/butterchurn/commits/master).
- **Repo stats:** 1,977 stars, 172 forks, `has_issues: false`, not archived.
- **Open third-party PRs:** #106 (zoom/solarize fix, 2026-10-25), #108 (EEL2 conformance tests), #98 (eel-wasm 0.0.17) (https://github.com/jberg/butterchurn/pulls).
- **Maintenance verdict:** low-activity and effectively single-maintainer (jberg, plus captbaritone of Webamp). The "stable" release is 7.5 years old. New work happens only on the 3.0 beta line. There is no public bug tracker.
- **Bundle size (min / gzip):** 2.6.7 `lib/butterchurn.min.js` 192.5 KB / 40.6 KB; 3.0.0-beta.5 `dist/butterchurn.min.js` (ESM) 243.8 KB / 61.7 KB.
- **3.x dependencies:** `eel-wasm` ^0.0.16 (MIT), `@assemblyscript/loader` ^0.17.11 (Apache-2.0), `ecma-proposal-math-extensions` 0.0.2 (MIT). No GPL in the tree (https://github.com/jberg/butterchurn/blob/master/package.json).
- **No TypeScript types:** `@types/butterchurn` returns 404 on npm, and the package has no `.d.ts`.
- **Forks with recent pushes** (GitHub forks API): `captbaritone/butterchurn` (2026-08-23; publishes `@webamp/butterchurn` 3.0.0-beta.5, MIT), `geeks-accelerator/butterchurn` (2026-06-20), `ubernaut/butterchurnxr` (2026-07-20).
- **Webamp pins 3.0.0-beta.5 with a local patch** (`patches/butterchurn@3.0.0-beta.5.patch`, which strips a bundled EEL-parser block) (https://github.com/captbaritone/webamp/blob/master/packages/webamp/package.json).
- **Integration modes available:** import-as-dep (npm) or vendor (MIT allows copying with the header kept).
- implication: the stable-vs-beta choice also fixes the preset format (§5) and the eval/CSP posture (§8).

## §2 API surface (from source)
- **`createVisualizer(audioContext, canvas, opts)`** options: `width`/`height` (default 1200×900), `meshWidth`/`meshHeight` (48×36), `pixelRatio` (default `devicePixelRatio`), `textureRatio` (1), `outputFXAA`. 3.x only: `onlyUseWASM`, `deterministic`. Source: `src/rendering/renderer.js` L39-47.
- **`connectAudio(node)`** calls `node.connect(delayNode)`, so it accepts any AudioNode from the **same** AudioContext (cross-context `connect` throws `InvalidAccessError`, https://developer.mozilla.org/en-US/docs/Web/API/AudioNode/connect). Internally: 1 DelayNode and 3 AnalyserNodes (mono plus L/R via ChannelSplitter(2)), with `fftSize = 1024` and `smoothingTimeConstant = 0`. It never connects to `destination`. Each frame it reads `getByteTimeDomainData` and runs **its own JS FFT** 3×. It does not use the analyser's frequency data (`src/audio/audioProcessor.js`).
- **Bands are internal:** bass 20–320 Hz, mid 320–2800 Hz, treb 2800–11025 Hz, normalised against running averages (`src/audio/audioLevels.js`).
- **Own data:** `render({ audioLevels: { timeByteArray, timeByteArrayL, timeByteArrayR }, elapsedTime })` takes 1024-sample `Uint8Array` **time-domain** bytes instead of sampling the analysers (renderer.js L825-835). There is no API to inject bass/mid/treb or a spectrum directly. `elapsedTime` (s) overrides `performance.now()` timing. Butterchurn never calls `requestAnimationFrame`; the caller owns the loop.
- **`loadPreset(preset, blendTime = 0)`:** `blendTime` is in seconds. Old and new presets run side by side: the warp mesh uses a per-vertex random blend pattern, the comp pass weights `prevCompShader` + `compShader` by `blendProgress`, and frame variables are mixed with `0.5-0.5*cos(p·π)` (renderer.js L191-200, L653-654, L1138-1165). **In 3.x it is `async`** (WASM compile); in 2.6.7 it is sync. Webamp's durations: 2.7 s default, 5.7 s on user pick, 0 for immediate (https://github.com/captbaritone/webamp/blob/master/packages/webamp/js/components/MilkdropWindow/Visualizer.tsx).
- **`setRendererSize(w, h, {meshWidth, meshHeight, pixelRatio, textureRatio})`** resamples the feedback texture, so the image survives a resize. In 3.x it also resizes the internal canvas; in 2.6.7 the caller sizes the `<canvas>`.
- **`launchSongTitleAnim(text)`** draws the text into a 2D-canvas texture and plays a 1.7 s animation (renderer.js L1167-1173).
- **Other methods:** `disconnectAudio`, `loadExtraImages`, `setInternalMeshSize`, `setOutputAA`, `toDataURL` (uses `readPixels`). 3.x only: `loseGLContext()`, `setCanvas(canvas)`.
- **No destroy/dispose method.** Webamp's code comment says so (Visualizer.tsx).

## §3 GL context: own vs shared
- **2.6.7:** calls `canvas.getContext('webgl2', {alpha:false, antialias:false, depth:false, stencil:false, premultipliedAlpha:false})` on the canvas we pass in (npm `lib/butterchurn.js` ~L6498).
- **3.x:** commit `6c4fabb`, "render on internal canvas" (2021-04-04), changed this. It creates an internal `OffscreenCanvas` with a WebGL2 context, plus `getContext('2d')` on our canvas. `render()` then calls `drawImage(internalCanvas, 0, 0)`, but only if that 2D context is non-null (`src/visualizer.js` L18-36, L773-781).
- **Both versions draw to the default framebuffer** (`renderToScreen()` binds `null`, renderer.js L1086-1095). There is no caller-FBO option, and the `Renderer(gl, …)` class is not exported (`src/index.js`).
- **HTML spec on `getContext`:** it returns the same object for the same context type and `null` for a different type (https://html.spec.whatwg.org/multipage/canvas.html#dom-canvas-getcontext). 2.6.7 handed our WebGL2 canvas would therefore share our context and mutate its GL state. 3.x handed a WebGL2 canvas skips the 2D copy, so the frame stays only in the undocumented `visualizer.internalCanvas`.
- **No resource sharing across WebGL contexts.** A foreign object raises `INVALID_OPERATION` (https://registry.khronos.org/webgl/specs/latest/1.0/). Data moves between contexts only through canvas-as-image (`texImage2D` / `drawImage`).
- **Chromium caps WebGL contexts per renderer process at 16** (or 16 Mpx in total); past that the oldest is lost (https://codereview.chromium.org/14217005/). That review dates from 2013, so whether the cap still holds is ⚠️ unverified. No measured frame cost for 2 contexts on one page was found (⚠️ unverified).
- implication: our engine plus Butterchurn 3.x means ≥2 WebGL contexts plus 1 2D canvas on the page.

## §4 Compositing into one recorded canvas
- **Drawing-buffer rule:** with `preserveDrawingBuffer:false` (the default, and Butterchurn never sets it), reading a WebGL canvas via `drawImage`, `texImage2D`, `readPixels` or `toDataURL` *after the rendering function returns* is undefined. The spec also says `true` "can cause significant performance loss on some platforms" (WebGL spec, "The Drawing Buffer").
- **(a) 2D compositor:** `drawImage` each engine's canvas into it, then `captureStream()` on the 2D canvas. Cost: one full-frame copy per source per frame. `globalAlpha` and `globalCompositeOperation` are available for crossfades. Butterchurn commit `63393e1` (2025-07-12) passes `willReadFrequently:false` "to force GPU usage" on 2D canvases. Butterchurn's output is opaque (`alpha:false`).
- **(b) Upload into our WebGL2 context:** `texImage2D(butterchurn canvas | internalCanvas)` each frame. MDN: DOM-source uploads trigger an internal program switch and a pipeline flush; upload before drawing (https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices). Chromium (2016): canvas→texture is GPU-GPU only for a subset of formats, and the rest go through readback (https://codereview.chromium.org/735623003). Current state ⚠️ unverified.
- **(c) `captureStream()` directly on a WebGL canvas:** Chromium captures at paint invalidation, so `preserveDrawingBuffer:false` is fine for visible canvases. Off-screen canvases fall back to frame finalization (https://codereview.chromium.org/2768683002, 2017). With no argument it captures on every canvas change; with `0` it captures only on `requestFrame()` (https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/captureStream).
- **(d) 3.x `setCanvas(compositor2D)`:** Butterchurn itself `drawImage`s its frame into that 2D canvas, at (0,0), unscaled, with no alpha (`src/visualizer.js` L769-781). 3.x already pays one OffscreenCanvas→2D copy per frame.
- **(e) `OffscreenCanvas.transferToImageBitmap()`:** returns the last frame and clears the canvas. The bitmap must be `close()`d or consumed (https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas/transferToImageBitmap).
- implication: every path copies the Butterchurn frame at least once per frame, on top of 3.x's own internal copy.

## §5 Presets: packs, loading, licensing, conversion
- **`butterchurn-presets` 2.4.7** (npm `latest`, 2018-06-09, MIT, 11.9 MB unpacked). JS `*_eqs_str` format. Each pack exposes `getPresets()`. Packs (presets / gzip): base 100 / 123 KB; Extra 146 / 146 KB; Extra2 122 / 100 KB; MD1 87 / 53 KB; Minimal 29 / 40 KB; NonMinimal 71 / 89 KB. Minimal plus NonMinimal together make up base. The package also ships 1,754 single JSONs in `presets/converted/` (12 MB) (https://www.npmjs.com/package/butterchurn-presets).
- **3.0.0-beta.4** (2021-02-10, MIT, 16.9 MB unpacked). `*_eqs_eel` format plus GLSL `warp`/`comp`. Packs (presets / gzip): base 107 / 158 KB; extra 186 / 227 KB; image 151 / 163 KB (+ imageData 147 KB); md1 87 / 50 KB; minimal 29 / 48 KB; nonMinimal 78 / 114 KB. 504 JSONs in total. The entry files mix `require()` with ESM. `broken.js` lists 23 presets. Repo last commit: 2021-03-06 (https://github.com/jberg/butterchurn-presets).
- **Format compatibility:** 2.6.7 requires `*_str` (via `new Function`), so it cannot load 3.x `*_eel` presets. 3.x loads both unless `onlyUseWASM` is set (`src/visualizer.js` L432-470).
- **Lazy loading:** packs are separate bundles and single JSONs are importable, so `import()` can load one pack or one preset. Webamp's demo fetches per-preset JSON URLs and loads `butterchurn` itself with `import()` (https://github.com/captbaritone/webamp/blob/master/packages/webamp-demo/js/butterchurnOptions.ts).
- **⚠️ LICENSING FLAG: preset content license is UNKNOWN.** The pack LICENSE is "MIT, Copyright (c) 2013-2018 Jordan Berg", which covers the packaging. The presets are by Geiss, Flexi, Martin, Rovastar and others. projectM's statement: "Milkdrop presets were, in almost all cases, not released under any specific license. Theoretically, each preset author holds the full copyright … safe to assume them to be in the public domain" (https://github.com/projectM-visualizer/presets-cream-of-the-crop/blob/master/LICENSE.md). That is an assumption with a takedown offer, not a license grant. MilkDrop's code went BSD-3 in 2.25c, which does not cover presets (https://en.wikipedia.org/wiki/MilkDrop). No NC license was found on these presets.
- **Converting `.milk` to JSON:** `milkdrop-preset-converter` 0.1.2 (MIT, browser): EEL via `milkdrop-eel-parser`, HLSL→GLSL via `hlslparser-js` (Emscripten port, MIT). Bulk: `milkdrop-preset-converter-node`, which uses the native addon `milkdrop-shader-converter` (cmake-js/nan). Last commit 2021-01-24 (https://github.com/jberg/milkdrop-preset-converter-node). Webamp converts at runtime via `milkdrop-preset-converter-aws`, which calls an AWS Lambda for the shaders (butterchurnOptions.ts). Whether these tools emit 3.x `*_eel` output is ⚠️ unverified.

## §6 Performance
- **CPU (equations):** JS averages 4.17 ms/frame evaluating EEL, WASM 2.32 ms/frame. Overall the WASM version is "~72.6% faster" (105 presets × 7 trials × 300 frames) (https://jordaneldredge.com/blog/speeding-up-winamps-music-visualizer-with-webassembly/).
- **Per-pixel equations run on the CPU** for every mesh vertex: default 48×36, Webamp uses 32×24 (renderer.js L420-423). This cost scales with mesh size, not resolution.
- **Audio cost:** 3× JS FFT of 1024 samples per frame on the main thread (§2).
- **GPU:** sim texture = `width × pixelRatio × textureRatio`, and `pixelRatio` defaults to DPR (2 on Retina). Blur passes run at 1/2…1/16 of that size. The output viewport is `width×height` (renderer.js L43-47, L64-68, L1088-1095). So device-pixel `width`/`height` with the default `pixelRatio` gives 4× the texture pixels. Webamp passes CSS-px size plus `pixelRatio: devicePixelRatio`.
- **No official guidance** was found for Retina 2880×1864 or a recommended internal size (⚠️ unverified). MDN advises rendering into a smaller back buffer and upscaling with CSS, and warns that non-integer DPR causes moiré (best-practices link in §4).
- No public list of heavy presets was found beyond `broken.js` (23 entries) (⚠️ unverified).

## §7 Alternatives
- **projectM** (https://github.com/projectM-visualizer/projectm): **LGPL-2.1 ⚠️ COPYLEFT (weak), which is not on the spec §6 permissive list.** v4.1.8, 2026-10-06; last commit 2026-10-06. Active. Documented Emscripten/WebGL2 build (`docs/emscripten.rst`). No official npm package. implication: browser use ships an LGPL WASM binary, which falls outside the §6 MIT/BSD/Apache/ISC set.
- **`@koel-project/projectm-wasm` 1.0.0** (2026-10-11): **LGPL-2.1-only ⚠️**, 1.09 MB unpacked, bundles projectM 4.1.8, built with Docker (https://github.com/koel/projectm-wasm). implication: same LGPL flag. It is a two-week-old wrapper with a single consumer (Koel).
- **Stims / toil.fyi** (https://github.com/zz-plant/stims): **Unlicense.** Its own MilkDrop renderer: WebGL2 plus optional WebGPU, with a `three` dependency. Plays `.milk` directly. 3,768 commits since 2024-10-06, last 2026-10-26. Only `milkdrop-toolchain` 0.1.0 (Unlicense: parser/compiler/GLSL+WGSL) is on npm. implication: no embeddable renderer package, so use would mean copy/vendor out of an app tree.
- **`@webamp/butterchurn`** (MIT): the same 3.0.0-beta.5 code under captbaritone's scope. implication: an alternative publisher, not an alternative engine.
- **`@tensordoc/prism` 0.1.4** (MIT, 2026-06-01): wraps butterchurn 2.6.7 plus presets 2.4.7. implication: a wrapper that adds no new engine.
- **`milkdrop` 0.0.1** (terorie/milkshake, 2018) and **`@turbolego/oldmilk`** (WebGL1 for iPad 2). implication: dead or off-target for Chrome desktop.

## §8 Chrome gotchas and open issues
- **No `webglcontextlost`/`restored` handling** anywhere in Butterchurn (0 hits in the 3.0.0-beta.5 dist). In 3.x the context lives on an internal OffscreenCanvas, so its events fire there. The WebGL spec says UAs are "very likely to decide to lose background high-performance contexts".
- **Global pollution:** about 20 functions are defined on `window` (`sqr`, `sqrt`, `pow`, `sign`, `rand`, `div`, `mod`, `memcpy`, …). `ecma-proposal-math-extensions` adds `Math.clamp`, `Math.scale`, … (3.0.0-beta.5 dist L63-170; `src/index.js`).
- **eval/CSP:** 2.6.7 compiles preset equations with `new Function`. 3.x uses WASM, and `onlyUseWASM` avoids eval; Webamp sets it for XSS safety (blog in §6). The exact Electron CSP tokens needed are ⚠️ unverified.
- **No public bug tracker** (Issues disabled), so open problems are visible only as PRs: #106 (zoom sign / solarize typo), #98 (eel-wasm bump), #92 ("Butter-churn on mobile", open since 2023).
- **Safari is out of scope**, so it was skipped. `isSupported` checks only WebGL2 plus AudioContext.
