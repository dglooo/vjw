# Research — Render stack (pilot)

## TL;DR
- All six WebGL2 options are permissive. three.js, PixiJS and twgl are MIT. OGL is **Unlicense ⚠️ (not on the spec §6 list)**. regl exposes only the WebGL1 API (its WebGL2 issue has been open since 2016) and is dormant. OGL is dormant too (last commit 2025-04). three.js and PixiJS are very active.
- WebGPU has been on by default in Chrome on macOS since Chrome 113. Butterchurn is WebGL2-only. three.js (WebGPURenderer, with a WebGL2 fallback) and PixiJS v8 (marked "experimental") support WebGPU.
- Chrome's MediaRecorder (per Chromium source) takes webm with vp8/vp9/h264/av1 (plus hevc on capable builds), and mp4 since Chrome 126. Default video bitrate is 2.5 Mbps. The M4 hardware-encodes only H.264/HEVC/ProRes.
- `EXT_disjoint_timer_query_webgl2` is reported on 81% of Chrome and 61% of Mac sessions. Its availability on Apple Silicon is ⚠️ unverified and needs a runtime check. The fanless M4 Air loses about 22% GPU performance under sustained load.
- The Shadertoy default license is **CC BY-NC-SA 3.0 Unported, which is NC + SA ⚠️**.

## Freshness
- Checked 2026-10-27. Chrome stable for Mac is 156.0.8078.48 (2026-10-20, [chromiumdash](https://chromiumdash.appspot.com/releases?platform=Mac)).
- npm versions checked today: twgl.js 7.0.0, regl 2.1.1, ogl 1.0.11, three 0.186.1, pixi.js 8.22.0, pixi-filters 6.1.5, postprocessing 6.39.5, butterchurn 2.6.7 (and 3.0.0-beta.5), webgpu-utils 2.1.1.
- **There is no `./donor/` directory**, so this research is web-only.
- The GitHub API hit its rate limit partway through. Butterchurn's commit history is left to `research_donor_milkdrop.md`.
- Chromium source was read from `main` on 2026-10-27. `isTypeSupported` was **not executed** on the target machine, because no browser was available in this environment.

## §1 WebGL2 libraries
Sizes come from bundlephobia (min / min+gz) and cover the whole package before tree-shaking.

| Lib | SPDX | Latest (npm) | Last commit | Maintenance | Size min / gz | WebGL2 | Particles (TF / float RT) + post FX | Integration |
|---|---|---|---|---|---|---|---|---|
| raw WebGL2 | n/a (browser API) | — | — | — | 0 | Native: transform feedback (TF), MRT, float render targets via `EXT_color_buffer_float` (Mac 99.99%) | Everything is hand-written | n/a |
| twgl.js | MIT | 7.0.0 (2025-07-16). Git tags v7.0.1 and v7.0.2 are not published to npm | 2026-10-19 | Active, single maintainer | 78.4 / 22.7 kB (twgl-full, includes math) | Yes. TF helpers, plus examples "transform feedback particles" and "webgl2 textures" | Thin helpers for programs, buffers, FBOs and TF. Bloom is self-written | import-as-dep, or vendor (single file) |
| regl | MIT | 2.1.1 (2024-11-12) | 2026-06-22 (README only; last code change 2024-11) | Dormant. Issue #667 "Is this project abandoned?" | 117.4 / 37.7 kB | **WebGL1 API only.** Issue #378 "Investigate WebGL 2.0 support" open since 2016. It accepts a webgl2 context but still requires `OES_texture_float` (#697) | Float-texture GPGPU via extensions. No TF | import-as-dep |
| OGL | **Unlicense ⚠️** (declared in package.json and README; the repo has no LICENSE file) | 1.0.11 (2025-01-27) | 2025-04-13 | Dormant (~18 months) | 131.4 / 34.2 kB (README: 29 kB full, tree-shakes) | Tries webgl2, falls back to webgl1 (`Renderer.js` L42–44) | `extras/GPGPU.js` (float ping-pong), `extras/Post.js`. Examples `gpgpu-particles`, `post-bloom`, `post-fxaa`. No TF in `Program` | import-as-dep, or copy (ES source modules) |
| three | MIT | 0.186.1 / r186 (2026-09-24) | 2026-10-27 | Very active: r184 Apr, r185 Jul, r186 Sep 2026 | 736 / 185 kB (tree-shakeable ESM) | `WebGLRenderer` is WebGL2-only since r163 (2024-03, "Remove WebGL 1 support") | Addons: `GPUComputationRenderer` (float RT ping-pong), `EffectComposer` + `UnrealBloomPass`. The WebGLRenderer build has 0 `beginTransformFeedback` calls; the `three.webgpu.js` WebGL2 backend uses TF | import-as-dep |
| pixi.js | MIT | 8.22.0 (2026-10-01) | 2026-10-27 | Very active | 925 / 265 kB | WebGL2 by default, `preferWebGLVersion: 1 \| 2` | 2D-oriented. `GlProgram` accepts `transformFeedbackVaryings`, but the lib never calls `beginTransformFeedback`. Filters handle post FX. Bloom comes from `pixi-filters` 6.1.5 (MIT): `AdvancedBloomFilter`, `BloomFilter` | import-as-dep |

- Optional post-FX lib: `postprocessing` (pmndrs, for three) 6.39.5 is **Zlib ⚠️ (not on the spec §6 list)**.
- Sources:
  - npm: [twgl.js](https://www.npmjs.com/package/twgl.js), [regl](https://www.npmjs.com/package/regl), [ogl](https://www.npmjs.com/package/ogl), [three](https://www.npmjs.com/package/three), [pixi.js](https://www.npmjs.com/package/pixi.js)
  - Sizes: [bundlephobia](https://bundlephobia.com/package/three@0.186.1) (same URL pattern for each package)
  - twgl: [README WebGL2 examples](https://github.com/greggman/twgl.js#webgl-2-examples)
  - regl: [#378](https://github.com/regl-project/regl/issues/378), [#667](https://github.com/regl-project/regl/issues/667), [#697](https://github.com/regl-project/regl/issues/697)
  - OGL: [Renderer.js](https://github.com/oframe/ogl/blob/master/src/core/Renderer.js), [extras](https://github.com/oframe/ogl/tree/master/src/extras), [README Unlicense section](https://github.com/oframe/ogl#unlicense)
  - three: [r163 notes](https://github.com/mrdoob/three.js/releases/tag/r163), [r186](https://github.com/mrdoob/three.js/releases/tag/r186)
  - Pixi: [GlContextSystem.ts](https://github.com/pixijs/pixijs/blob/dev/src/rendering/renderers/gl/context/GlContextSystem.ts), [v8.22.0](https://github.com/pixijs/pixijs/releases/tag/v8.22.0)
  - Float formats: [MDN EXT_color_buffer_float](https://developer.mozilla.org/en-US/docs/Web/API/EXT_color_buffer_float) (WebGL2-only; makes R16F…RGBA32F and R11F_G11F_B10F color-renderable), [web3dsurvey](https://web3dsurvey.com/webgl2/extensions/EXT_color_buffer_float)
- implication: only raw WebGL2, twgl and three's WebGPU-renderer path expose transform feedback directly; the others reach GPU particles through float-texture ping-pong.

## §2 WebGPU in Chrome on macOS
- **Chrome:** WebGPU has been on by default since Chrome 113, on macOS, Windows (D3D12) and ChromeOS (Vulkan) ([Chrome blog](https://developer.chrome.com/blog/webgpu-release)).
- **Timestamp queries:** these use the `timestamp-query` feature and are quantized to 100 µs by default since Chrome 120 ([120](https://developer.chrome.com/blog/new-in-webgpu-120), [121](https://developer.chrome.com/blog/new-in-webgpu-121)).
- **Butterchurn:** its README says it "requires the browser support WebGL 2" ([README](https://github.com/jberg/butterchurn)). No WebGPU port was found in search.
- **three.js:** `WebGPURenderer` uses WebGPU and falls back to a WebGL 2 backend. A `forceWebGL` option exists ([docs](https://threejs.org/docs/pages/WebGPURenderer.html)).
  - ⚠️ unverified (third-party): `EffectComposer` and `ShaderMaterial` are not available under WebGPURenderer.
  - Issue [#34597](https://github.com/mrdoob/three.js/issues/34597) reports that the WebGL2 fallback leaks GL resources (r185).
- **PixiJS v8:** the docs mark WebGPU "experimental" and say "It is recommended to use the WebGL renderer for production applications" ([docs](https://pixijs.com/8.x/guides/components/renderers)).
- **twgl:** no WebGPU support. The same author publishes a sibling package, `webgpu-utils` 2.1.1 (MIT) ([npm](https://www.npmjs.com/package/webgpu-utils)).
- **regl:** issue [#558](https://github.com/regl-project/regl/issues/558) "Investigate WebGPU support" has been open since 2020.
- **OGL:** creates only webgl2/webgl contexts (Renderer.js above).
- implication: a WebGPU-based own engine would run beside a separate WebGL2 context for Butterchurn.

## §3 rAF loop outside React (Vite + React 18/19)
- **StrictMode (dev only):** components re-render an extra time, Effects re-run, and ref callbacks re-run.
  - It double-invokes the component body and the functions passed to `useState`, the `set` functions, `useMemo` and `useReducer` ([StrictMode](https://react.dev/reference/react/StrictMode)).
- **Effects:** "In Strict Mode, React mounts components twice (in development only!)". The documented fix is a cleanup that "should stop or undo whatever the Effect was doing".
  - Under the heading "Not an Effect: Initializing the application", module-level code "only runs once after the browser loads the page" ([Synchronizing with Effects](https://react.dev/learn/synchronizing-with-effects)).
- **WebGL contexts:** Chromium logs "WARNING: Too many active WebGL contexts. Oldest context will be lost" ([source](https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/modules/webgl/webgl_rendering_context_base.cc)).
  - The limit of 16 comes from secondary sources ([Plotly forum](https://community.plotly.com/t/too-many-active-webgl-contexts/16379), [WebKit commit](https://webkit.googlesource.com/WebKit/+/70e10861eb2fbd9d0862fd8702874c25ae5d8bfd)) ⚠️.
- **Engine state → UI:** `useSyncExternalStore` "lets you subscribe to an external store". `getSnapshot` must return a cached value, otherwise the component re-renders in an infinite loop ([docs](https://react.dev/reference/react/useSyncExternalStore)).
- **R3F pattern (reference):** "Fast updates are carried out in `useFrame` by mutation", and there is "no reason" to call setState in `useFrame` ([pitfalls](https://r3f.docs.pmnd.rs/advanced/pitfalls)).
- **Vite HMR:**
  - `hot.dispose` "clean[s] up any persistent side effects" (timers, listeners).
  - `hot.data` "is persisted across successive instances of the same module" ([HMR API](https://vite.dev/guide/api-hmr)).
- **Fast Refresh (`@vitejs/plugin-react`):** "your file should only export React components". Otherwise "the module will be invalidated and HMR will propagate". `eslint-plugin-react-refresh` flags violations ([plugin-react](https://github.com/vitejs/vite-plugin-react/tree/main/packages/plugin-react)).
- **rAF:** calls are "paused in most browsers when running in background tabs", and the call rate "generally match[es] the display refresh rate" ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)).

## §4 Dynamic resolution, GPU timing, DPR
- **`EXT_disjoint_timer_query_webgl2`:** WebGL extension #33, rev 4, last modified 2023-06-01.
  - Results arrive asynchronously, at "well-defined times" after control returns to the browser. `GPU_DISJOINT_EXT` means the measurements must be redone ([Khronos](https://registry.khronos.org/webgl/extensions/EXT_disjoint_timer_query_webgl2/)).
  - Support (web3dsurvey, undated sample): Chrome/Chromium 81.47%, Mac OS 61.39%, Windows 87.28%, Safari 0.38% ([web3dsurvey](https://web3dsurvey.com/webgl2/extensions/EXT_disjoint_timer_query_webgl2)).
  - **Chrome on Apple Silicon (ANGLE/Metal): ⚠️ unverified.** It needs a runtime `getExtension` check on the target.
  - History: Chrome disabled it after the GLitch exploit and re-enabled it on desktop "once Site Isolation shipped" ([crbug 40779345](https://issues.chromium.org/issues/40779345)).
- **Frame-time heuristic precedent:** Babylon.js `SceneOptimizer` targets `targetFrameRate` (60 by default) and checks every `trackerDuration` (2000 ms by default). Its `HardwareScalingOptimization` "could really help if you are GPU-bound" ([docs](https://doc.babylonjs.com/features/featuresDeepDive/scene/sceneOptimizer)).
  - rAF timestamps have ≥1 ms precision (MDN above).
- **Chrome Energy Saver:** reduces the display refresh rate. Loops that hard-code 16.67 ms "will run twice as slow" ([Chrome blog](https://developer.chrome.com/blog/memory-and-energy-saver-mode)).
- **Render scale + upscale:** "it's a common optimization in games to actually render less pixels than are displayed and let the GPU scale them up". CSS sets the displayed size. `devicePixelContentBoxSize` is "only available in Chrome/Edge so far" ([webgl2fundamentals](https://webgl2fundamentals.org/webgl/lessons/webgl-resizing-the-canvas.html)).
- **DPR:** the backing store is sized as `canvas.width = Math.floor(size * devicePixelRatio)`. Changes are detected with `matchMedia("(resolution: Xdppx)")`, and the query has to be re-created on every change ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio)).
- **Target panel:** 2880×1864 ([Apple spec](https://support.apple.com/en-us/122210)) = 5.37 MP. Half-Retina 1440×932 = 1.34 MP, a quarter of the pixels.
  - ⚠️ unverified: the reported macOS "looks like" defaults for the 15" Air vary: 1710×1107 ([MacWelt](https://www.macwelt.de/article/1958394/macbook-air-15-zoll-vs-macbooks-pro-m2-test-vergleich.html)) and 1470×956 or 1710×1112 ([Apple Discussions](https://discussions.apple.com/thread/256083056)).
- implication: in those scaled modes, `clientWidth × dpr` may not equal 2880×1864, so the backing-store size should be measured on the target.

## §5 Recording (MediaRecorder, Chrome)
Chromium source: [`media_recorder_handler.cc`](https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/modules/mediarecorder/media_recorder_handler.cc).
- **Containers:** `video/webm`, `video/x-matroska`, `video/matroska`, `video/mp4`, plus the `audio/*` equivalents.
- **webm/mkv codecs:** `vp8`, `vp9`, `h264`/`avc1`/`avc3` (only on proprietary-codec builds, which include Google Chrome), `av01` (plus the legacy string `av1`), `hvc1`/`hev1` (only behind the HEVC build flag). Audio: `opus`, `pcm`.
- **mp4 codecs:** `avc1`, `avc3`, `mp4a.40.2`, `hvc1`/`hev1`, `vp9`, `av01`, `opus`.
  - mp4 codec strings are matched case-sensitively, and full `avc1.<profile>.<level>` strings are parsed.
  - Accepted H.264 profiles are baseline, main, extended and high only.
- **Version history** ([addpipe demo table](https://addpipe.com/media-recorder-api-demo/)):
  - MP4 since Chrome 126 (fragmented MP4).
  - AV1 since 126, "always software encoding" on macOS.
  - HEVC since 136, depending on device and OS ([blink-dev I2S](https://groups.google.com/a/chromium.org/g/blink-dev/c/YJ1QijNiHeM/m/3EhMjMVwAgAJ)).
  - AAC LC in MP4 only.
- **`isTypeSupported` results on the target: ⚠️ unverified** (not run).
- **Bitrate** ([`media_recorder.cc`](https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/modules/mediarecorder/media_recorder.cc)):
  - Defaults: video 2.5 Mbps, audio 128 kbps.
  - Clamps: Opus 5 k–510 k; VPX minimum 75 kbps.
  - `bitsPerSecond` is split between audio and video when the per-track values are not given.
- **Hardware encode:** `VideoTrackRecorder` uses a hardware VEA encoder when `CanUseAcceleratedEncoder` passes, and software otherwise ([`video_track_recorder.cc`](https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/modules/mediarecorder/video_track_recorder.cc)).
  - The M4 media engine does hardware H.264, HEVC and ProRes; AV1 is decode-only (Apple spec above).
  - VP8/VP9 hardware encode on Mac: ⚠️ unverified.
- **`captureStream(fps)`** ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/captureStream)):
  - Omitted: "a new frame will be captured each time the canvas changes".
  - `0`: frames are captured only on `requestFrame()`.
  - Returns one `CanvasCaptureMediaStreamTrack`.
- **Audio track:** `MediaStreamAudioDestinationNode.stream` holds a "single `MediaStreamTrack` whose `kind` is `audio`" with the node's channel count. MDN says it can be fed "into another construct, such as a Media Recorder" ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamAudioDestinationNode)).
  - The `MediaStream` constructor takes a track array ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/MediaStream/MediaStream)).
- **WebM duration:** since Chrome 140, Duration is written only for non-chunked recordings. Using `timeslice`/`requestData()` drops it, and Cues are never written ([addpipe](https://blog.addpipe.com/duration-in-webm-videos-produced-by-chrome/)).
- **Perf:** no measured data was found on MediaRecorder cost at ~1440p60 on M-series ⚠️ unverified. In a background tab, rAF pauses (MDN above) and the recorded canvas freezes ([SendRec](https://sendrec.eu/blog/why-canvas-breaks-your-screen-recorder/)).

## §6 Fanless Apple Silicon thermals
- **Notebookcheck** (MacBook Air 15 M4, review dated 03/11/2025) ([review](https://www.notebookcheck.net/Apple-MacBook-Air-15-M4-review-The-fanless-M4-SoC-is-years-ahead-of-the-competition.976933.0.html)):
  - "Under longer load, the GPU's performance dropped by around 22%."
  - Under combined load the SoC "initially consumed 29 watts, but this quickly dropped to around 9 watts".
- **LaptopMedia** (13" M4) reports ~8–9 W average over 30 min of sustained load ⚠️. This comes from a search summary only, because the page returned 403 ([review](https://laptopmedia.com/review/apple-macbook-air-13-6-m4-review-the-silent-king-of-efficiency/)).
- **Anecdotal:** an emulated game on an M4 Air showed frame-rate oscillation after about 20–22 min. This is not Chrome ([issue](https://github.com/ly05010419/MacNativeGames/issues/671)) ⚠️.
- **No Chrome/WebGL-specific sustained-load measurements were found for fanless M-series ⚠️.**
- implication: 60-adaptive headroom has to hold after ~20–30 min of warm-up, with ~20% less GPU throughput than a cold start.

## §7 Shadertoy default license
- **Default license:** the Shadertoy terms page ("What license will my Shaders have?", https://www.shadertoy.com/terms) says shaders posted without a license fall under **Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported**. Authors own their shaders and pick the license, stated at the top of the code.
  - A direct fetch returned HTTP 403, so this wording comes via the search index. It is corroborated by [godotshaders](https://godotshaders.com/shader/creation-by-silexars/).
- **⚠️ NC + SA FLAG (spec §6):** the license is NonCommercial. Under ShareAlike, adaptations must use the same license ([CC deed](https://creativecommons.org/licenses/by-nc-sa/3.0/)). It is not MIT-compatible.
  - Spec §6 allows porting during the personal phase with a header; the pre-open-source gate must then replace these shaders or get permission.
