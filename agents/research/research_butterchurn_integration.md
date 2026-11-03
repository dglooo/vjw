# Research — Butterchurn integration into the current render stack (epic MilkDrop)

## TL;DR
- **Butterchurn has had no release since 2026-10-27.** npm `latest` is 2.6.7 (2019) and `beta` is 3.0.0-beta.5 (2025-07-13). The last upstream commit is still 2026-04-20; since then only PRs have moved (#106 and #108 open, #107 closed unmerged). Both lines are WebGL2-only, and no Apple-Silicon-specific report was found.
- **Our stack has one WebGL2 context, on `#stage` (twgl).** A scene is a `SceneDoc` (≤4 layers of catalog refs). The director switches `SceneId`s from `library.playlist()`. The engine draws `shot.from`/`shot.to` into 2 offscreen targets, then the transition shader and the post blend draw into `#stage`, and REC captures `#stage`.
- **Audio:** `hub` is module-private, but the exported `analyser` (fftSize 1024, smoothing 0, the same as Butterchurn's own analysers) is a passthrough AudioNode that `connectAudio` can take. Our `energy.ts` already reproduces Butterchurn's bass/mid/treb(+att) formula.
- **Butterchurn can't render into our context.** Chromium main has a GPU→GPU `texImage2D` path for WebGL-canvas and OffscreenCanvas sources, but no public measurement of its cost exists. Butterchurn compiles preset shaders synchronously, and no public load-time numbers exist either.
- **Presets:** a new 2026 pack, `butterchurn-presets-baron` (762, MIT as packaging), and its source Ansorre (15,056, no license) are JS `*_eqs_str` with **empty warp/comp shaders**. `butterchurn-presets` 2.4.7 has warp shaders in 1,141 of 1,754 presets. Presets read only bass/mid/treb(+_att), and there is no public API to inject our sources.

## Freshness
- Written 2026-11-03. This is a delta on `research_donor_milkdrop.md` (2026-10-27) §1–§6, §8, which still holds unless a point below says otherwise.
- Checked: `butterchurn` 2.6.7 / 3.0.0-beta.5; `butterchurn-presets` 2.4.7 / 3.0.0-beta.4; `@webamp/butterchurn` 3.0.0-beta.5; `butterchurn-presets-baron` 1.5.1; `butterchurn-presets-weekly` 0.0.4. Upstream source: shallow clone of jberg/butterchurn @ `fbac2f6`. Chromium source: `main` as of today.
- Spec read: `thoughts/spec_veejay_wizard.md` L6, L15, §2.4 (L48–49), §3–§4 (L75–78), §6 (L99). The donor directory `./donor/` holds ISF-Files, gl-transitions, hg_sdf, isf-js and webgl-noise, none of which is MilkDrop-related.
- Code reads are at master `481d97b`. Butterchurn `src/` paths point to https://github.com/jberg/butterchurn/blob/master/src/. Pack numbers come from local `npm pack` and zip inspection.

## §1 Butterchurn now
- **npm, unchanged since 10-27** (https://registry.npmjs.org/butterchurn, https://registry.npmjs.org/butterchurn-presets):
  - `butterchurn`: `latest` 2.6.7 (2019-03-12), `beta` 3.0.0-beta.5 (2025-07-13).
  - `butterchurn-presets`: `latest` 2.4.7, `beta` 3.0.0-beta.4 (2021-02-10).
  - `@webamp/butterchurn`: `latest` 3.0.0-beta.5, `next` 1.0.0 (2025-07-10).
  - License is MIT on all of them. Bundle sizes are as in prior §1 (3.0.0-beta.5 ESM is 243.8 KB min / 61.7 KB gzip).
- **Upstream repo** (https://api.github.com/repos/jberg/butterchurn):
  - Last commit `fbac2f6` on 2026-04-20; 1,980 stars, 171 forks; `has_issues: false`.
  - The API's `open_issues_count` of 26 counts PRs.
  - Webamp's fork, captbaritone/butterchurn, is 4 ahead and 0 behind upstream (last commit 2026-04-27, a merge of upstream).
- **Activity since 10-27** (https://github.com/jberg/butterchurn/pulls). Nothing was merged.
  - #108 adds an EEL2 conformance suite of 82 cases (open, updated 10-27).
  - #106 fixes "preserve sign on negative zoom and fix solarize blend typo" (open, updated 10-26). This is a rendering-correctness bug in current master, per the PR.
  - #107, a wave modes 6/7 baseline fix, was closed unmerged on 10-25.
  - `eel-conformance` 0.1.0 and `milkdrop-toolchain` 0.1.0 appeared on npm on 2026-10-13. Whether they are linked to #108 is ⚠️ unverified.
- **WebGL2 only, in both lines:**
  - `src/isSupported.js` tests `getContext("webgl2")`.
  - All 30 GLSL sources are `#version 300 es`.
  - The only extensions used are `EXT_texture_filter_anisotropic` (optional) and `WEBGL_lose_context` (in `loseGLContext`).
  - It uses no float textures or render targets: 0 hits for `HALF_FLOAT`/`RGBA16F`/`RGBA32F` in `src/`.
- **Chrome on Apple Silicon:** no Butterchurn-specific report was found. Issues are disabled, and web search found nothing (⚠️ an absence of evidence, not proof of none). The open mobile PR #92 is unrelated to macOS.
- **Maintenance verdict:** unchanged. Low activity, effectively one maintainer, and only the beta line moves.
- **Integration mode:** import-as-dep (npm), or vendor/copy (MIT, header kept). There are no TypeScript types (prior §1).
- implication: a pin is a choice between a 2019 stable and a 2025 beta. Neither has moved since the prior research.

## §2 Our render stack today (master `481d97b`)
- **Contexts:** exactly **one WebGL2 context**, on `<canvas id="stage">` (`web/index.html:15`).
  - It is created at `web/src/gl/engine.ts:15-16` with `{alpha:false, antialias:false, preserveDrawingBuffer:false}`.
  - `webglcontextlost` triggers `location.reload()` (`engine.ts:17`).
  - twgl.js 7.0.0 (MIT) wraps it: programs, FBOs and textures (`engine.ts:4-7`).
  - No other `getContext`/OffscreenCanvas exists in `web/src` (grep).
- **Registry (avoids import cycles):** `scenes = { live?, catalog? }` lives at `engine.ts:21` and is filled by `web/src/app.ts:39-40`.
- **Scene = data:**
  - `SceneId` is a string (`'builtin:<slug>'` or a UUID) (`web/src/doc.ts:7`).
  - `SceneDoc` has `layers: LayerDoc[]` (`doc.ts:12`), at most 4 of them (`doc.ts:16`). Each layer is `gen` + `fx[]` `NodeDoc { ref }` (`doc.ts:9-10`).
  - Built-ins are literals in `web/src/scenes/builtin.ts:5` (e.g. `gen: { ref: 'native/tunnel' }`).
- **Native generator contract** (frozen CP1, `web/src/gl/scene.ts:5-6`):
  - `NativeDef extends EffectDef { create(gl): Native }`, and `Native { draw(f: FrameInput, v); dispose?() }` draws "into the bound FB".
  - Natives are registered in the catalog map (`web/src/fx/catalog.ts:14`). ISF files come in by glob (`catalog.ts:12-22`).
  - Example: `web/src/scenes/tunnel.ts:65-88`.
- **Live scene** (`web/src/gl/live.ts`):
  - `Live` interface: `live.ts:25-29`.
  - A native node is built via `create(gl)` (`live.ts:114`) and drawn with the target bound and a per-layer `FrameInput` copy (`live.ts:195-202`).
  - The layer loop: gen → fx ping-pong on `temps` → composite with blend/opacity (`live.ts:253-297`). A fast path draws the bottom layer straight into the target (`live.ts:273`).
  - The cache is keyed by `SceneId`. `live(id)` **throws `unknown scene`** unless the id is in `edit.docs` or `library` (`live.ts:315-326`).
  - `prepare(keep)` disposes every other live instance between fades (`live.ts:402-409`).
  - `warm(ids)` compiles every program with `KHR_parallel_shader_compile` at Start (`live.ts:48`, `live.ts:417-441`).
- **Playlist/director:**
  - `createDirector(library.playlist())` (`app.ts:45`) re-syncs on library changes (`app.ts:46`).
  - The playlist is the starred built-ins, then the starred user scenes (`web/src/library.ts:89-92`).
  - The director is pure and deals only in `SceneId`s. `Shot { from, to, mix }` is at `web/src/director.ts:6`.
  - Defaults are 16 bars per shot with a 1-bar fade when confident, otherwise 30 s with a 2 s fade (`director.ts:21-23`). There is also `cut(id)` (`director.ts:112-119`).
  - Per frame (`app.ts:315-321`): `director.update`, then a random transition per new fade, then `prepare([from, peek()])`. A confident drop calls `director.cut` (`app.ts:330`).
- **Engine frame** (`engine.ts:187-216`):
  - Targets: `shots = [A, B]`, RGBA8 at output × scale (`engine.ts:96`), plus ping-pong `temps` (`engine.ts:98`).
  - `drawScene(from → A)`, plus `drawScene(to → B)` while fading (`engine.ts:198-199`). Each scene is wrapped in a GPU timer query (`engine.ts:163-174`).
  - Then `bindFramebufferInfo(null)` and either a copy of A (`engine.ts:202`) or the transition `fade.info` with uniforms `from`, `to`, `progress`, `ratio`, `uRes` (`engine.ts:203`).
  - Transitions are gl-transitions/own GLSL (`web/src/fx/transitions/*.glsl`, 13 files), wrapped at `catalog.ts:25-32` and picked by `setTransition` (`engine.ts:123-127`).
- **Post pass:** fixed-function blends of one tint colour over `#stage` after the transition (`engine.ts:204-215`). The values come from the pure `postFor` (`web/src/gl/post.ts:23-31`). At rest it is skipped entirely (`engine.ts:205`).
- **Resolution/governor:**
  - `setOutput(w, h, scale)` sizes `#stage` to the output and the targets to output × scale (`engine.ts:130-134`).
  - It is called only when the size or scale changes, and **frozen during REC** (`app.ts:231-236`).
  - Governor defaults (`web/src/quality.ts:23-25`): scale 0.6–1, ×0.85 down / ×1.1 up. It steps down on >3 late frames in 2 s **only while the median JS time is < 10 ms** (GPU-bound), and probes up after 10 s (doubling to 160 s).
  - JS time is measured from the frame start (`app.ts:230`) to `governor.frame` (`app.ts:338`). 60A output is ½ base (`quality.ts:112-115`).
- **Recorder:** `startRecording(stage, recDest track, 12 Mbps)` (`app.ts:159`) calls `canvas.captureStream()` with no fps argument, i.e. one frame per canvas change, on that canvas (`web/src/recorder.ts:37-39`). REC therefore captures exactly what the engine draws into `#stage`.
- implication: every integration point (catalog native, `SceneId` lookup, transition inputs, the captured canvas) assumes frames live as textures in the single `#stage` context.

## §3 Audio feed
- **Graph** (`web/src/audio/input.ts`):
  - `ctx = new AudioContext({latencyHint:'interactive'})`, with **no `sampleRate`**, so it runs at the device default (`input.ts:14`).
  - `hub` is a GainNode and **not exported** (`input.ts:15`). It feeds `analyser` (`input.ts:19`), `recDelay → recDest` (`input.ts:20`) and the onset worklet (`input.ts:59`).
  - Exported nodes are `ctx`, `analyser` and `recDest`. `recDest` is a MediaStreamAudioDestinationNode with no output.
  - The file player goes to the speakers (`input.ts:66`); line-in is not monitored.
- **`analyser` = `new AnalyserNode(ctx, {fftSize:1024, smoothingTimeConstant:0})`** (`input.ts:16`). That is the same fftSize and smoothing Butterchurn sets on its own 3 analysers (`src/audio/audioProcessor.js` L5-28).
  - An AnalyserNode passes its input to its output unprocessed (https://webaudio.github.io/web-audio-api/#AnalyserNode), so `connectAudio(analyser)` would tap the hub signal from the same `ctx`.
- **Butterchurn's `connectAudio`** does `node.connect(DelayNode)`, then feeds 1 mono analyser and L/R analysers through `ChannelSplitter(2)` (`audioProcessor.js` L11-33, L99-101).
  - Bands are sample-rate aware: `bucketHz = sampleRate / 1024` (`src/audio/audioLevels.js` L5-12), so there is no hard 44.1 kHz assumption. 44100 is only the fallback when there is no context.
- **No-context path:** `render({audioLevels:{timeByteArray, timeByteArrayL, timeByteArrayR}})` takes 1024-byte time-domain arrays (`src/rendering/renderer.js` L825-837).
  - Our `analyser` can fill the mono array.
  - We have no L/R analysers outside `?debug` (`input.ts:136-143`, fftSize 256).
- **Timing:** our frame reads `analyser` undelayed (`app.ts:240-241`). File onsets and hits are held until audible (`app.ts:222-225`), and REC audio for files is delayed by base+output latency (`input.ts:82`). Butterchurn's analysers on the hub would see the same undelayed signal as our `energy`.
- implication: no new tap is needed in `input.ts` for a mono or stereo feed. Butterchurn adds 3 audio-thread analysers plus 3 main-thread 1024-point JS FFTs per frame (prior §6).

## §4 Context and compositing facts
- **Own context only.**
  - 3.x creates `new OffscreenCanvas(w,h).getContext("webgl2")` (`src/visualizer.js` L20-34). `render()` then does `outputGl.drawImage(internalCanvas,0,0)`, but only if the passed canvas yields a 2D context (L773-781).
  - The only export is `createVisualizer` (`src/index.js`). The `Renderer` class is not exported, and there is no caller-FBO option.
  - No fork checked (captbaritone, geeks-accelerator, ubernaut/butterchurnxr, all MIT) advertises shared-context rendering. Only READMEs were checked (⚠️ shallow check).
- **Context budget:** Chromium caps active WebGL contexts at **16 on desktop** (8 on Android, 4 in workers). Past the cap, the oldest context is lost with "Too many active WebGL contexts" (https://chromium.googlesource.com/chromium/src/+/main/content/renderer/webgraphicscontext3d_provider_impl.cc L122-127; `webgl_rendering_context_base.cc` ActivateContext). We would go from 1 context to 2.
- **Moving the frame into `#stage`, Chromium main** (`third_party/blink/renderer/modules/webgl/webgl_rendering_context_base.cc`):
  - `texImage2D`/`texSubImage2D` with a source whose context is WebGL uses `TexImageViaGPU` → `DrawingBuffer::CopyToPlatformTexture(kBackBuffer)`. That is a **GPU→GPU blit**, taken when the drawing-buffer colour space equals the unpack colour space (`TexImageHelperCanvasRenderingContextHost`, ~L6457-6505).
  - Exclusions are only `UNSIGNED_SHORT_5_5_5_1` on Mac, `RED_INTEGER`, `HALF_FLOAT_OES` and non-2D targets (`CanUseTexImageViaGPU` ~L6292-6331).
  - The source is `ClearIfComposited` first (~L6411). The spec's rule therefore applies: read in the same task as Butterchurn's render (prior §4).
  - ImageBitmap sources (`transferToImageBitmap`) take the texture-backed GPU path too (~L5891-5895).
- **Measured cost: no trustworthy public number.** The only recent thread (Chromium graphics-dev, Feb 2025) reported ~20 ms for a 4K Canvas2D→WebGL copy on M2. Its root cause was the page's unclosed `rect()` path, not the copy, and Ken Russell saw ~120 fps on M1 at the start (https://groups.google.com/a/chromium.org/g/graphics-dev/c/pjXEk2o4aZE). Older numbers (2010–2016, 2–900 ms) predate the GPU path. ⚠️ Needs a local measurement.
- **Inside the transition pass:** the fade shader samples two textures, `from: A` and `to: B` (`engine.ts:203`). A Butterchurn frame uploaded into an RGBA8 texture of the target's size would occupy the slot that `drawScene` fills today (`engine.ts:198-199`).
- **Resize behaviour:**
  - `setRendererSize(w,h,{pixelRatio,textureRatio,meshWidth,meshHeight})` resizes the internal canvas. It also **resamples the feedback texture** and re-renders when the texture size changes (`renderer.js` L283-323).
  - The sim texture is `w × pixelRatio × textureRatio`, and `pixelRatio` defaults to DPR (prior §6).
  - Our governor changes the scale at most every ~2 s (`quality.ts:23-25`), and `setOutput` is frozen during REC (`app.ts:233`).
- **CPU side vs the governor:** Butterchurn's equations run on the main thread (JS ~4.2 ms, WASM ~2.3 ms per frame, prior §6), inside our measured JS time if called from `frame()`. The governor only steps down while the median JS time is < 10 ms (`quality.ts:82`).
- **Worker:** `src/` references `window.`/`document.` 36 times. These include the ~20 globals in `presetBase.js` and `window.OffscreenCanvas` in `visualizer.js` L20. Running it in a Worker would need shims (⚠️ unverified).
- implication: every path is one context-to-context copy per frame on top of Butterchurn's own passes. Chromium's code says the copy can be GPU-only, but its cost on the M4 is unmeasured.

## §5 Presets: sources, format, licensing, load time
| Pack | Presets | Format | warp/comp non-empty | Median / p90 bytes | License (packaging) | Last activity |
|---|---|---|---|---|---|---|
| `butterchurn-presets` 2.4.7 (`presets/converted`) | 1,754 | `*_eqs_str` (JS) | 1,141 / 1,122 | 3,932 / 9,845 | MIT (Jordan Berg) | 2018-06-09 |
| `butterchurn-presets` 3.0.0-beta.4 | 504 | `*_eqs_eel` (WASM) | 395 / 387 | 5,972 / 11,153 | MIT | 2021-02-10 |
| `butterchurn-presets-baron` 1.5.1 **(new)** | 762 | `*_eqs_str` | **0 / 0** | 4,040 / 10,288 | MIT (© 2026 baron) | 2026-02-27 |
| Ansorre zip (baron's source) | 15,056 | `*_eqs_str` | **0 / 0** (400 sampled) | — | **none** (GitHub API `license: null`) | 2020-05-23 |
| `butterchurn-presets-weekly` 0.0.4 | ⚠️ not counted | — | — | 167 KB unpacked | MIT | 2019-03-13 |
- **Baron provenance:** baron is the ISOCELES curated list (a NestDrop pack on Patreon) intersected with Ansorre's conversions. It exposes `getPresets({random, count})`, and its README states no preset license (https://github.com/uvmain/butterchurn-presets-baron, https://github.com/ansorre/tens-of-thousands-milkdrop-presets-for-butterchurn). Empty warp/comp means MilkDrop 2 shader content was not carried over. Whether the originals had shaders is ⚠️ unverified per preset.
- **Named packs:** the per-pack counts (minimal 29, md1 87, base 100/107, …) are in prior §5. A 20–30-preset curation can be a hand-picked list of single JSONs, each about 4–6 KB raw.
- **Preset content license:** unchanged, ⚠️ UNKNOWN per author. The packaging licenses above cover only the packaging (prior §5). Spec §6 allows any license, but each one must be recorded.
- **Format/engine coupling:** `*_eqs_eel` loads only on 3.x. `*_eqs_str` loads on both, unless `onlyUseWASM` is set (`src/visualizer.js` L453-472).
- **Load cost, no public ms numbers** (eel-wasm PR #48 says only "long task … stutter when loading a new preset", https://github.com/captbaritone/eel-wasm/pull/48). The mechanism:
  - `loadPreset` deep-clones the JSON (L433).
  - 3.x then does an async WASM compile of the EEL (L546-560).
  - Warp and comp GLSL are compiled **synchronously** (`renderer.js` L262-263). `KHR_parallel_shader_compile` has 0 hits in `src/`. ⚠️ Needs a local measurement.
- **Hosting:** Webamp's demo allows preset URLs from unpkg (`butterchurn-presets`, `-weekly`), `archive.org/cors/md_*.json` and S3, and dynamic-imports the default pack (https://github.com/captbaritone/webamp/blob/master/packages/webamp-demo/js/butterchurnOptions.ts).
- implication: shader-bearing presets come only from `butterchurn-presets` 2.4.7 / 3.0.0-beta.4. The 2026 pack has none.

## §6 Our sources → Butterchurn
- **What a preset sees:** the per-frame globals `frame`, `time`, `fps`, `bass`, `bass_att`, `mid`, `mid_att`, `treb`, `treb_att`, `meshx/y`, `aspectx/y`, `pixelsx/y`, `rand_start` and `rand_preset` (`src/visualizer.js` L156-176; `renderer.js` L840-856). Per-pixel equations add x/y/rad/ang. Waves read the time-domain and spectrum arrays. There is no beat variable.
- **The values are Butterchurn's own:** `bass = imm/longAvg`, `bass_att = avg/longAvg`, with rates 0.2/0.5 for avg and 0.992 for longAvg, rescaled to 30 fps (`src/audio/audioLevels.js` L80-125).
  - Our `energy.ts` copies these ranges and rates (`web/src/audio/energy.ts:7-13`, `:57-58`).
  - Differences: our input is AnalyserNode dB→linear, not Butterchurn's own JS FFT on bytes, and our bin edges use ceil vs Butterchurn's round−1. The values are close but not identical.
  - `bind.ts` maps att/2 to the 0..1 sources "bass/mid/treb" (`web/src/bind.ts:48-50`).
- **Injection, public API:** none. `render()` accepts only `audioLevels` (time-domain bytes) and `elapsedTime` (`renderer.js` L825). Synthetic bytes would still go through Butterchurn's FFT and normalisation.
- **Injection, internal (undocumented):**
  - `render()` calls `this.audioLevels.updateAudioLevels(...)` and then immediately reads its `bass…treb_att` getters into `globalVars` (`renderer.js` L838-849). An instance-level override of `visualizer.renderer.audioLevels` would therefore set what presets read.
  - This is internal state and is not covered by any version contract.
- **q vars:** q1–q32 are written by the preset's own init/per-frame equations each frame (`presetEquationRunnerWASM.js` L274-287), so there is no external input. `reg00–reg99` are shared only on the JS (`*_str`) path (`renderer.js` L865, L878), and no WASM pool exposes them (0 hits in `visualizer.js`). Existing presets don't read our values in either case.
- **Our extra sources** (kick/snare/hats, sub/reese/wobble, build/drop, `u:*`; `bind.ts:25`) have no counterpart variable in MilkDrop presets.
- implication: kick/reese/drop can reach a preset only by remapping into bass/mid/treb(+_att) through internals, or from outside it: switching presets, blend times, or our post pass over the composited frame.
