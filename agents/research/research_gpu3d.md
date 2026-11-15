# Research: GPU compute (WebGPU) + 3D (Three.js) as layer types

## TL;DR
- No published number exists for a WebGPU canvas → WebGL2 texture copy at 1728×1117. Our only measured cross-context precedent is WebGL2 → WebGL2 (Butterchurn): 0.10 ms main-thread time, 0 late frames over 60 s. Its GPU timer reads "copy + wait", median 7.61 ms (§2). The Dawn → ANGLE copy is ⚠️ unmeasured.
- Three.js r187 (MIT, 2026-10-30) has two renderers:
  - `WebGLRenderer` accepts OUR WebGL2 context (`context:`) and `resetState()`, so it needs no copy. It has no compute shaders.
  - `WebGPURenderer` adds TSL compute. Its manual calls it "still in an experimental state". Its WebGL2 fallback runs compute through transform feedback: no atomics, and scatter writes are broken (#31250, open).
- Both items need WebGPU compute for one thing only: 3D particle fluids (MLS-MPM needs atomics, three's `webgpu_compute_particles_fluid` throws without WebGPU). Particles at 10⁵–3·10⁵, 2D grid fluids, GLTF, PBR and transmission all run on WebGL2 (§3, §4).
- Donor: no WebGPU or Three.js module exists in `donor/`. What exists: TD `particlesGpu` compute GLSL (an algorithm reference, proprietary), 4 glTF samples incl. Khronos `Fox.glb` (rigged), and `gl-transitions` WGSL ports (MIT) (§11). The options table is §10.

## Freshness
- 2026-11-16, researcher, `master 049437f`. npm checked today: three 0.187.0 (2026-10-30; dev HEAD commit 2026-11-15), @types/three 0.187.0, electron 45.3.2 (2026-11-13, Chromium 156.0.8078.100), postprocessing 6.39.6 (Zlib), three-mesh-bvh 0.9.18 (MIT). WebGPU spec: W3C CRD 2026-09-15. gpuweb implementation-status wiki edited 2026-10-02.
- Inputs: `agents/backlog.md` § Order (4, 5) + § TouchDesigner gaps L34–35; `thoughts/spec_veejay_wizard.md` TL;DR + §5 + §6; `design_milkdrop.md` § Probe ruling L384–420; `research_render_stack.md` §1–§2 (2026-10, three r186; updated here).

## §1 Codebase map (what a new layer type plugs into)
- **Layer contract.** `NativeDef.create(gl, size?) → Native`. `Native.draw(f, v, src?, s?)` draws into the bound FB, with optional `dispose()` / `hidden()` and `warm(): Promise` (`gl/scene.ts:9,15`). `live.ts:180` builds a native. `live.ts:262-271` binds `dst`, copies `FrameInput` onto the layer's clock and size, then calls `draw`. Blends and opacity run after it (`live.ts:344-386`): fixed-function, plus a shader for difference/dodge. The engine resets `blendEquation` back to `FUNC_ADD` (`live.ts:385`).
- **Context.** One WebGL2 context: `alpha:false, antialias:false` (`gl/engine.ts:16`). Context loss reloads the page (`engine.ts:17`). Targets are **colour-only, no depth**: RGBA8, or RGBA16F when `EXT_color_buffer_float` is present (`engine.ts:77-81`, `:22`). A 3D layer needs its own depth buffer and its own MSAA.
- **Precedent: an external renderer in its own context.** `milkdrop/native.ts` (124 lines) runs Butterchurn on its own WebGL2 canvas. Each frame it calls `copy(src,w,h)` (`native.ts:25-37`). The source is HTMLCanvas, OffscreenCanvas or ImageBitmap. The call is `texSubImage2D` into one shared RGBA8 texture (realloc on resize), then a Y-flip fullscreen draw. Resize goes through `setRendererSize` when `f.width/height` change (`:98`). Pool and `warm()` cover compile/first-load stalls (`:45-77`, `:117-123`). The source comments set a Chromium cap of 16 WebGL contexts per page (`:45`).
- **Measured cost of that copy** (`design_milkdrop.md` L384–405; M4, Chrome 156, ANGLE Metal, 1728×1118):
  - Main thread: p95 0.10 ms.
  - A GPU timer on our context reads "copy + cross-context wait", median 7.61 ms. It tracks the source's own GPU time, not the copy.
  - End to end: 3600 frames, 0 late, max 18.8 ms, governor 1.00×.
  - Path (c) (2D-canvas blit) hides the wait from our timer. Path (d) (direct RGBA8 target) is a knob.
- **Governor.** `quality.ts:24-26`: scale 0.6–1.0, step ×0.85 down / ×1.1 up. It steps down on >3 late frames in 2 s, and only while the JS median is <10 ms (`:84-88`). It never reads `gpuMs` (design_milkdrop L403). Work on a foreign context counts only through late frames. `engine.ts:144-178` times only our context.
- **Audio inputs available per frame:**
  - `FrameInput f` (dt, time, onsets, `sync.bpm`).
  - Bound values `v`.
  - `Sources s` (kick/snare/hats/drop…; `scene.ts:5-6`).
  - R8 textures `audioTex.fft/wave/toy/waveLR`, 512 bins (`engine.ts:103-124`). These are WebGLTextures in OUR context only.
- **Existing GPU particles (WebGL2 transform feedback):**
  - `scenes/particles.ts`: 65 536 points (`:1`, TF at `:99,:115,:144`), adapted from twgl (MIT).
  - Same TF pattern in `points.ts:171,209,318` and `creatures.ts:164`.
- **Recording** captures `stage` only (`app.ts:184` → `recorder.ts:38`). A DOM canvas stacked over `#stage` would not be recorded.
- **Other GPU users on the page:**
  - MediaPipe runs in `camera/segment.worker.ts` with a private OffscreenCanvas GL context (GPU delegate, `:96-97`).
  - The camera probe already reads the WebGPU adapter (`camprobe.ts:106-108`). On M4 it reports vendor `apple` (`scratchpad/cam/camprobe-mac-…-2026-11-07.json`). No Windows probe file exists in `scratchpad/cam/`.

## §2 WebGPU availability (Chrome, Electron)
- **Chrome 113+ ships WebGPU by default** on macOS, Windows x86/x64 and ChromeOS. Android 12+ has had it since 121. Linux: Intel Gen12+ since 144, NVIDIA (Wayland) since 147, the rest behind a flag. Windows ARM64: behind a flag. ([gpuweb implementation-status](https://github.com/gpuweb/gpuweb/wiki/Implementation-Status))
- **Chromium blocklist** ([webgpu_blocklist_impl.cc @ main](https://chromium.googlesource.com/chromium/src/+/main/gpu/config/webgpu_blocklist_impl.cc)):
  - macOS: no rules.
  - Windows: AMD, Intel and Microsoft have no restriction. NVIDIA is blocked on "x86" ("indirect root constants in compute pass broken").
  - ⚠️ Assumption, needs confirmation: "x86" here means 32-bit builds. `research_camera_xplat.md` TL;DR records that x64 allows NVIDIA, AMD and Intel.
  - Windows Qualcomm: gated per device and driver.
  - The D3D11 backend is blocked. CPU adapters are blocked.
- **Windows reach.** Google's compatibility-mode intent says 31 % of Windows Chrome users lack D3D FL 11.1+ ([blink-dev](https://groups.google.com/a/chromium.org/g/blink-dev/c/N3RlLGCOTJ4)). Compatibility mode shipped in Chrome 146 on OpenGL ES 3.1 (Android). D3D11 is only "exploring" ([new-in-webgpu-146](https://developer.chrome.com/blog/new-in-webgpu-146)).
- **Our machines:** M4 Chrome 156 returns a WebGPU adapter (vendor `apple`, §1). The user's Windows PC GPU is ⚠️ not recorded in this repo.
- **Electron.** 45.3.2 = Chromium 156 ([release](https://releases.electronjs.org/release/v45.3.2)). WebGPU in Electron was reported working on macOS in 32.1.1. Secure-context rules apply (localhost or https) ([electron#44880](https://github.com/electron/electron/issues/44880)). ⚠️ No Electron doc states that WebGPU is on by default per OS. A Linux adapter bug was closed 2026-11-04 (#41763).
- **WebGPU default limits** ([W3C CRD 2026-09-15](https://www.w3.org/TR/webgpu/)): maxBufferSize 256 MiB, maxStorageBufferBindingSize 128 MiB, maxComputeWorkgroupsPerDimension 65 535. 1 M particles × (vec4 pos + vec4 vel) = 32 MB, inside the defaults.

## §3 Interop: getting WebGPU pixels into our WebGL2 compositor
- **No shared resources.** WebGPU (Dawn) and WebGL2 (ANGLE) objects cannot be bound across APIs. A pixel transfer goes through an image source.
- **Spec semantics.** A WebGPU canvas is readable through its **drawing buffer**: it "outlives the [[currentTexture]]", and every read "must ensure that all previously submitted work … have completed". A read "synchronously blocks on another timeline" (spec §3.4.1, §21.2). So `texImage2D/texSubImage2D(webgpuCanvas)` in our context is a cross-API copy plus a wait. This is the same shape as the milk path in §1.
- **Paths:**
  - (a) WebGPU `<canvas>`/OffscreenCanvas → `texSubImage2D` (= `native.ts` `copy()` unchanged).
  - (b) `createImageBitmap(canvas)` → upload: an async copy.
  - (c) `new VideoFrame(canvas)` → `texImage2D(VideoFrame)`.
  - (d) GPU readback (`mapAsync`) → `texSubImage2D` from CPU: 1728×1117×4 = **7.72 MB per frame** through RAM, with ≥1 frame of latency.
  - (e) A DOM overlay canvas (no copy). It is outside the recorder (`app.ts:184`), the layer blends and the fades.
- **Published costs:**
  - No benchmark was found for (a)–(c) at 1728×1117 (⚠️ unmeasured).
  - gpuweb [#1670](https://github.com/gpuweb/gpuweb/issues/1670) (open, post-MVP) says interop "can be done, with some overhead, with `copyExternalImageToTexture`".
  - A 2025 Chromium thread measured 20 ms for a 4K canvas2D → WebGL copy on M2. The cause was the page's own path building, not the copy ([graphics-dev](https://groups.google.com/a/chromium.org/g/graphics-dev/c/pjXEk2o4aZE)).
  - A WebKit bug (2025-06) reports slow canvas → WebGPU uploads in Chrome and Safari ([#294602](https://bugs.webkit.org/show_bug.cgi?id=294602)).
- **Windows plumbing.** Chrome's D3DImageBacking tracks the D3D11 device per access for "WebGL/ANGLE/D3D11, or WebGPU/Dawn/D3D12" interop. Across two adapters (dual-GPU laptops), sharing copies "through system memory using staging textures" (2023 thread, ⚠️ may be dated) ([graphics-dev](https://groups.google.com/a/chromium.org/g/graphics-dev/c/2iXXLi9157M)).
- implication: a spike on both machines (Mac + the Windows PC) measures path (a) with the milk K1 instrument (0 late / 60 s, main-thread p95) before any design depends on it.

## §4 Three.js r187 (MIT; npm `three` 0.187.0, 2026-10-30; monthly releases r185 Jun, r186 Sep, r187 Oct; dev commit 2026-11-15; verdict: very active)
- **Bundle** (jsDelivr `build/`, gzip -9, before tree-shaking): `three.core` 105 KB + `three.module` (WebGLRenderer) 89 KB = **≈194 KB gz**. `three.core` + `three.webgpu.nodes` (WebGPURenderer + TSL) 213 KB = **≈318 KB gz**. The Vite tree-shaken size is ⚠️ unmeasured. Integration: import-as-dep.
- **`WebGLRenderer` on OUR context.**
  - Options `canvas` and `context`: "attach an existing rendering context". `resetState()` is "mostly relevant for applications which share a single WebGL context across multiple WebGL libraries" ([docs](https://threejs.org/docs/pages/WebGLRenderer.html)).
  - `resetState()` = `state.reset()` + `bindingStates.reset()` (`WebGLRenderer.js:3658-3666`). `state.reset()` issues ~44 `gl.*` calls that restore GL defaults (`WebGLState.js:1207`). ⚠️ Cost per call unmeasured (CPU only, sub-ms expected, ⚠️ Assumption).
  - Rendering straight into our target: `setRenderTargetFramebuffer(rt, ourFB)` and `setRenderTargetTextures(rt, colorTex, depthTex)` exist without JSDoc (`WebGLRenderer.js:2923-2948`). `ExternalTexture(sourceTexture)` wraps a raw `WebGLTexture`, e.g. our `audioTex` or `src`.
  - The manual calls WebGLRenderer "the recommended choice for pure WebGL 2 applications" with "no plans to add larger new features" ([manual](https://threejs.org/manual/pages/webgpurenderer.html)).
  - It has no compute. Addon `GPUComputationRenderer` does float-RT ping-pong (`research_render_stack.md` §1).
- **`WebGPURenderer`:**
  - The manual: "still in an experimental state although its maturity level has been greatly improved". `ShaderMaterial`, `RawShaderMaterial`, `onBeforeCompile` and `EffectComposer` are **not supported**: port them to node materials, TSL and the TSL post stack. Init is async (`await renderer.init()`) ([manual](https://threejs.org/manual/pages/webgpurenderer.html)).
  - Documented options: `forceWebGL`, `antialias`/`samples`, `alpha`, `outputBufferType` (default HalfFloat) ([docs](https://threejs.org/docs/pages/WebGPURenderer.html)).
  - `WebGPUBackend.init` accepts an existing `parameters.device` (a GPUDevice) and forwards `device.lost` to `renderer.onDeviceLost` ([WebGPUBackend.js](https://github.com/mrdoob/three.js/blob/dev/src/renderers/webgpu/WebGPUBackend.js)).
- **The WebGL2 fallback of WebGPURenderer:**
  - `WebGLBackend` takes `parameters.context` (an existing WebGL2RenderingContext). So `WebGPURenderer({forceWebGL:true, context: gl})` can run on our context ([WebGLBackend.js](https://github.com/mrdoob/three.js/blob/dev/src/renderers/webgl-fallback/WebGLBackend.js)). ⚠️ No `resetState` equivalent was checked there.
  - Compute = transform feedback with `RASTERIZER_DISCARD` (same file). There are no atomics in the file.
  - Open [#31250](https://github.com/mrdoob/three.js/issues/31250): `instancedArray.element(x).assign()` always writes at `instanceIndex` under the fallback. Scatter writes do not work.
  - [#34597](https://github.com/mrdoob/three.js/issues/34597) (the fallback never deleted programs/VAOs) closed 2026-09-20.
- **TSL compute examples:**
  - `webgpu_compute_particles`: `particleCount = 200000` (the subtitle says 500k). It calls `renderer.compute()` then `render()` per frame and has no fallback check.
  - `webgpu_compute_points`: 300 000. `_snow`: 100 000. `_rain`: 50 000.
  - `webgpu_tsl_compute_attractors_particles`: 2¹⁸ = 262 144.
  - `webgpu_compute_birds`: 8 192 (has a `forceWebGL` path).
  - `webgpu_compute_water`: 128² grid.
  - Source: [examples on dev](https://github.com/mrdoob/three.js/tree/dev/examples). Example code is MIT.

## §5 Particle counts and fluid solvers (published, with licences)
- **Fluids, 3D particle (MLS-MPM):**
  - three `webgpu_compute_particles_fluid`: default 32 768, max 131 072 particles, 64³ grid. It uses `atomicAdd/Store/Load`, throws "No WebGPU support" without WebGPU, and "closely follows" matsuoka-601/WebGPU-Ocean.
  - [WebGPU-Ocean](https://github.com/matsuoka-601/WebGPU-Ocean) (MIT, pushed 2025-06-09, 573★): "~100,000 particles on integrated graphics", "~300,000 … on decent GPUs". Its SPH mode reaches 30 000 on an iGPU. It renders with screen-space fluid.
  - Codrops write-up, 2025-02-26: 100k real time on a Ryzen 7 5825U iGPU ([Codrops](https://tympanus.net/codrops/2025/02/26/webgpu-fluid-simulations-high-performance-real-time-rendering/)).
  - [Splash](https://github.com/matsuoka-601/Splash) (MIT, 2025-04-22).
  - Maintenance verdict for these two: low activity (last push mid-2025).
- **Fluids, 2D grid (stable fluids), WebGL-only:** [PavelDoGreat/WebGL-Fluid-Simulation](https://github.com/PavelDoGreat/WebGL-Fluid-Simulation) (MIT, pushed 2024-11-12, 16.8k★, "works even on mobile"). Also lygia `simulate/simpleAndFastFluid` (Prosperity licence, `research_td_look.md` §3). Neither needs WebGPU. Integration: copy, with a header.
- **Particles at 10⁶:** no instrumented M-series or mid-Windows number was found.
  - Anecdotal (fluid sims, not plain particles): "~36 fps with 1.13 M" on an RTX 3080 Ti, and "~15 fps with 1 M" on an M1 Max (⚠️ eyeballed, [r/GraphicsProgramming](https://redlib.hackliberty.org/r/GraphicsProgramming/comments/1jh3pd2/splash_a_realtime_fluid_simulation_in_browsers/mjfn4ij/?context=3)).
  - A TU Wien thesis claims 10 M particles at ~63 fps on a GTX 1060 with compute ([PDF](https://www.cg.tuwien.ac.at/research/publications/2023/PETER-2023-PSW/PETER-2023-PSW-.pdf); ⚠️ unverified, the text was not extractable).
  - Plain advected points are fill-rate- and bandwidth-bound at 1728×1117 (⚠️ Assumption).
- **WebGPU samples** ([webgpu/webgpu-samples](https://github.com/webgpu/webgpu-samples), BSD-3-Clause, pushed 2026-10-02): `particles` = 50 000, workgroup 64.

## §6 GLTF animal models (rigged / animated)
| Source | Licence | Content | Size | Notes |
|---|---|---|---|---|
| [Quaternius Ultimate Animated Animal Pack](https://quaternius.com/packs/ultimateanimatedanimals.html) (2021-07) | CC0 | 12 animals, >12 animations (attack, death, gallop, walk, jump…) | ⚠️ per-file size not listed | FBX/OBJ/Blend/**glTF** |
| [Quaternius LowPoly Animated Animals](https://quaternius.itch.io/lowpoly-animated-animals) | CC0 | 6 animals: idle/walk/run/jump/death | ⚠️ | FBX/OBJ/Blend; no glTF stated (convert in Blender) |
| [Khronos Fox](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/Fox) | model CC0 (PixelMannen); rig + animation **CC-BY-4.0** (tomkranis); glTF conversion CC-BY-4.0 | skinned: Survey/Walk/Run | 162 852 B (`donor/td-reverse/.../glTF/Fox.glb`) | attribution required |
| three.js `examples/models/gltf` Horse / Flamingo / Parrot / Stork | ⚠️ no licence stated; credit "model by mirada from ro.me" ([example](https://github.com/mrdoob/three.js/blob/dev/examples/webgl_morphtargets_horse.html)) | morph-target animation | 181 808 / 77 428 / 97 024 / 76 852 B | low-poly silhouettes |
| [Kenney Cube Pets](https://kenney.nl/assets/cube-pets) | CC0 | animated; v2.0 "added animals & animations" | ⚠️ | formats not stated on the page ⚠️ |
| [Poly Pizza](https://poly.pizza/) | ⚠️ per-model (CC0 / CC-BY, unverified) | 10 700+ low-poly models, has an API | ⚠️ | |
- Loader: `GLTFLoader` (three addon). Playback: `AnimationMixer`. Both are in three's examples for both renderers (`webgpu_loader_gltf`, `webgpu_animation_retargeting`).

## §7 PBR chrome / glass in Three.js
- **Env maps.** `PMREMGenerator` builds a GGX-prefiltered mip cube from a scene (`fromScene`, size ≥256), an equirect or a cubemap. It returns a cube render target ([docs](https://threejs.org/docs/pages/PMREMGenerator.html)). Per-frame regeneration is not documented. The docs suggest pre-compiling (`compileEquirectangularShader`) during load. Chrome = `metalness 1, roughness≈0` + `scene.environment`.
- **Transmission (glass).** `MeshPhysicalMaterial` "has a higher performance cost, per pixel, than other three.js materials". "Always specify an environment map" ([docs](https://threejs.org/docs/pages/MeshPhysicalMaterial.html)). In `WebGLRenderer`, any transmissive object triggers `renderTransmissionPass`:
  - The opaque objects render again into an extra target: HalfFloat when supported, `generateMipmaps: true`, **≥4 MSAA samples** "to avoid feedback loops".
  - Its size = viewport × `transmissionResolutionScale` (default 1.0) (`WebGLRenderer.js:298, 2015-2057`).
  - ⚠️ ms cost at 1728×1117 unmeasured.
- Examples for both stacks: `webgpu_materials_transmission`, `webgpu_loader_gltf_transmission`, `_dispersion`, `_iridescence`, `webgpu_pmrem_*` ([list](https://threejs.org/examples/files.json)).

## §8 Audio-reactivity hooks
- **TSL.** `uniform(x)` nodes. Script writes `.value` per frame (the examples import `uniform` and update it in `animate()`). Compute kernels take uniforms the same way.
- **`WebGLRenderer`.** Material uniforms / `onBeforeRender`. A raw texture goes through `ExternalTexture`.
- **Our side.** `Native.draw` already receives `f`, `v`, `s` per frame (`scene.ts:9`). The FFT textures live in our WebGL2 context (`engine.ts:106`):
  - On our context (WebGLRenderer, or WebGPURenderer with forceWebGL + `context`), they wrap without a copy.
  - On a separate GPUDevice, the 512-bin arrays (1–2 KB) must be re-uploaded (`queue.writeTexture`/`writeBuffer`).
- Three ships `webgpu_compute_audio` (compute over audio data).

## §9 Risks (facts)
- **Two GPU APIs on one GPU.** Every read of a WebGPU canvas from WebGL blocks on WebGPU's queue (§3). Our GPU timer reads that wait as cost (milk precedent: median 7.61 ms on 0.10 ms main-thread work).
- **Dual-GPU laptops.** WebGL and the WebGPU adapter can land on different GPUs. Sharing then copies through system memory (§3, 2023 thread). `requestAdapter({powerPreference})` and WebGL `powerPreference` are separate knobs (⚠️ default pairing unverified).
- **Context / device loss.** WebGL: we reload (`engine.ts:17`, `native.ts:61`). WebGPU: `device.lost` is a promise; three forwards it to `renderer.onDeviceLost` and ignores `'destroyed'` (§4). Nothing in `web/src` handles a lost GPUDevice (no `navigator.gpu` use outside `camprobe.ts`).
- **Context count.** Chromium caps WebGL contexts at 16 per page (`native.ts:45`). Current users: our stage, 2+ pooled Butterchurn canvases, the MediaPipe worker's OffscreenCanvas (`segment.worker.ts:96-97`). A three.js layer on its own canvas adds one WebGL context or one GPUDevice. On our context it adds none.
- **Shared-state risk on our context.** Three changes blend/depth/program/VAO state. `resetState()` restores GL defaults (§4). Our code already restores `blendEquation` after MAX (`live.ts:385`). Our targets have no depth (`engine.ts:77-81`), so a 3D layer needs a depth attachment of its own.
- **Governor.** Foreign-context GPU time steps quality down only through late frames (`quality.ts:84-88`). A layer's size follows `f.width/height` (`live.ts:269-270`). A renderer in its own canvas must resize on change, as `native.ts:98` does. `setRendererSize` cost is unmeasured even for milk (design_milkdrop L405).
- **Compile stalls.** Butterchurn's first load blocks ≤26 ms, and `createVisualizer` takes 51–76 ms (design_milkdrop L402). Three/WebGPU pipeline compile at first use is ⚠️ unmeasured. `warm()` exists for this (`scene.ts:15`).
- **WebGPURenderer port cost.** No `ShaderMaterial`/`EffectComposer` (§4). Our GLSL effects do not run inside it. They stay in our compositor.
- **Memory.** No measured number. Defaults in §2. A transmission pass adds a half-float MSAA mip target at full size (§7).

## §10 Integration options
| # | Option | Per-frame transfer | Maturity | Licence | Particles | 3D fluids (MLS-MPM) | 2D fluids | GLTF / anim | PBR / transmission |
|---|---|---|---|---|---|---|---|---|---|
| O1 | Raw WebGPU on own canvas → `copy()` (path a) | cross-API copy + wait, ⚠️ unmeasured; WebGL→WebGL precedent 0.10 ms main / 0 late | WebGPU spec CRD; Chrome stable since 113 | — (own code; webgpu-utils MIT) | ✅ compute, 10⁵–10⁶ ⚠️ | ✅ (atomics) | ✅ | ❌ (write a loader) | ❌ (write it) |
| O2 | Three `WebGLRenderer` on OUR context | none (renders into our FB / an RT whose texture we sample); `resetState()` ~44 GL calls | stable, "recommended for pure WebGL 2", no big new features | MIT | TF / FBO ping-pong (ours: 65 536 today) | ❌ | ✅ | ✅ | ✅ PMREM + transmission pass |
| O3 | Three `WebGPURenderer` (WebGPU backend) on own canvas → `copy()` | as O1 | "still experimental" (manual) | MIT | ✅ TSL compute (examples 2·10⁵–3·10⁵) | ✅ (example, 131 072 max) | ✅ | ✅ | ✅ (node materials) |
| O4 | Three `WebGPURenderer` `forceWebGL` + `context: gl` | none | fallback; #31250 open (no scatter writes) | MIT | TSL compute via TF, gather-only | ❌ (no atomics) | ✅ (ping-pong) | ✅ | ✅ |
| O5 | Raw WebGPU compute → readback → WebGL2 upload (path d) | 7.72 MB via RAM + ≥1 frame latency | spec-level | — | ✅ | ✅ | ✅ | ❌ | ❌ |
| O6 | WebGPU canvas as DOM overlay | none | — | — | ✅ | ✅ | ✅ | via three | via three |
- Additional facts per row:
  - O3 and O4 share one TSL codebase.
  - O6 is not recorded (`app.ts:184`) and sits outside layer blends and fades.
  - O2 and O4 run on the WebGL2 context Butterchurn already sits beside, and add no GPU API.

## §11 Donor scan (`donor/`, 7 entries)
- **No WebGPU, Three.js, glTF-loader or fluid-solver module.**
- `td-reverse/graph-src/Samples/Palette/Tools/particlesGpu/.../glslmulti1_compute.glsl`: 895 lines, a GL 4.3 compute shader (`local_size 8×8`). Birth modes, life, drag, wind/turbulence/directional forces, effector textures. Not WebGL2/WGSL-portable as-is. Derivative proprietary, personal-use study. Integration: **rewrite by analogy** (`research_td_look.md` L10).
- `td-reverse/touchdesigner/extracted/Samples/glTF/`: `Fox.glb` 162 852 B (skinned, licences §6), `Duck.gltf` 162 796 B (⚠️ licence not checked), `ToyCar.glb` 5.4 MB and `LightsPunctualLamp.glb` 4.3 MB (Khronos samples, ⚠️ licences not checked). Integration: copy the asset with its credit.
- `gl-transitions-2.0.0/wgsl/*.wgsl`: WGSL ports of the transitions (MIT, `package.json`). Relevant only if a WebGPU compositor ever exists.
- `hg_sdf`, `webgl-noise`, `ISF-Files`, `interactive-shader-format-js`: GLSL only, no WebGPU or 3D-asset content.
