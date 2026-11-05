# Research — Stage 3 camera: cross-platform in-browser segmentation (Chrome on Windows + Mac)

## TL;DR
- **Scope (user, final):** pure web, the same app in Chrome on Windows and Mac. No native helper, Electron or OS SDK. The visuals most likely run on a **Windows PC in Chrome**. OS/vendor camera effects matter only as a camera device (§9).
- **MediaPipe Tasks Vision 1.2.2 (Apache-2.0)** is the only runtime with published per-platform browser fps, including a Windows desktop (i9-10900K + GTX 1070): Selfie 185–225 fps, BlazePose GHUM with its **full-body mask** 70–123 fps (TF blog, 2022; legacy solutions runtime). Windows GPU-delegate bugs: an NVIDIA-only one-texel mask offset (#5428/#5133; Google says fixed, ⚠️ unconfirmed in 1.2.2), unbounded GL-handle growth over long `segmentForVideo` sessions (#6352, open), and a hard abort where float/half-float render targets are missing (#6296, open).
- **ORT-Web 1.31.1 WebGPU** runs on Windows Chrome through D3D12; Chrome's blocklist allows NVIDIA, AMD and Intel on x64. RVM (GPL-3.0, recurrent, alpha) and MODNet/PP-HumanSeg/SINet all have ONNX files. **No published Windows browser fps exists for any of them** ⚠️. LiteRT.js 2.6.0 (Apache-2.0, WebGPU) has an RVM port measured at 8.3–10.1 ms at 512×288 on an unnamed GPU.
- **Full body at 2–3 m:** the Selfie models are scoped to < 2 m. BlazePose GHUM "works up to 4 meters" and is "well suited for bodies in full view further away". RVM documents a "Full-Body" `downsample_ratio` row. PP-HumanSeg has a separate "general human" model next to its portrait one. **No model has a published low-light, coloured-light or strobe evaluation** ⚠️.
- **Temporal smoothing reference:** OBS background-removal (GPL-3.0, cross-OS, ONNX Runtime) defaults to the MediaPipe Meet model, a per-frame mask EMA at factor 0.85, and skipping inference when frame PSNR shows a near-identical image. Windows has **no GPU EP** in its release builds ("we plan to support WinML").

## Freshness
- 2026-11-05, researcher. Checked:
  - npm: `@mediapipe/tasks-vision` 1.2.2 (2026-11-03; `vision.d.ts` read from the tarball), `onnxruntime-web` 1.31.1 (2026-10-26), `@litertjs/core` 2.6.0 (2026-10-22).
  - GitHub: OBS plugin `royshil/obs-backgroundremoval` 1.4.1 (2026-07-26; pushed 2026-10-29); RVM repo (pushed 2024-04-02); Chromium `gpu/config/webgpu_blocklist_impl.cc` @ main; chromestatus API.
- Inputs: `thoughts/spec_camera.md` §2, §5; `agents/research/research_camera.md` TL;DR, §1–§4 (not repeated here: runtime API facts, mask-to-texture options, camera constraints).
- Donor: `./donor/` has no segmentation code (same finding as `research_camera.md` Freshness).
- Dropped by the user's final scope: Electron/`onnxruntime-node`, native Windows SDKs (Maxine, Studio Effects APIs, WinML).

## §1 MediaPipe ImageSegmenter / PoseLandmarker in Chrome on Windows and Mac

**Models that give a person mask** (sizes from `curl -I`; the segmenter table is from https://developers.google.com/edge/mediapipe/solutions/vision/image_segmenter, the pose table from https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker):

| Model | Input | Size | Pixel 6 CPU/GPU | Scope (source wording) |
|---|---|---|---|---|
| `selfie_segmenter` (square) | 256×256 fp16 | 249,537 B | 33.46 / 35.15 ms | portrait; "< 2 meters" (TF blog) |
| `selfie_segmenter_landscape` | 144×256 fp16 | 250,177 B | 34.19 / 33.55 ms | "video calls" |
| `selfie_multiclass_256x256` | 256×256 fp32 | 16,371,837 B | 217.76 / 71.24 ms | 6 classes (hair/skin/clothes) |
| `deeplab_v3` | 257×257 fp32 | 2,780,176 B | 123.93 / 103.30 ms | "general purpose"; a `person` class among VOC classes |
| PoseLandmarker lite / full / heavy (`outputSegmentationMasks: true`) | detector 224², landmarker 256² fp16 | 5,777,746 / 9,398,198 / 30,664,242 B | — | BlazePose GHUM: "full-body … works up to 4 meters" |

- PoseLandmarker's option is typed in 1.2.2 as `outputSegmentationMasks?: boolean` ("Defaults to false"; `vision.d.ts` L2766). The output is a "per-pixel person confidence mask", Float32 in [0, 1]. Mask resolution is not stated ⚠️. Model card: https://storage.googleapis.com/mediapipe-assets/Model%20Card%20BlazePose%20GHUM%203D.pdf (not text-readable here ⚠️).
- Source for the scope quotes: https://blog.tensorflow.org/2022/01/body-segmentation.html ("well suited for cases where someone is directly in front of a webcam on a video call (<2 meters)"; BlazePose GHUM "specializes in full-body cases like yoga, fitness, dance and works up to 4 meters from the camera").
- implication: `deeplab_v3` and the PoseLandmarker mask are the two MediaPipe options not scoped to < 2 m.

**GPU delegate on Windows (ANGLE):**
- Chrome on Windows runs WebGL through ANGLE: "ANGLE is used as the default WebGL backend for both Google Chrome and Mozilla Firefox on Windows". ANGLE's D3D11 backend is "complete" on Windows. https://chromium.googlesource.com/angle/angle/+/main/README.md ⚠️ The README does not name D3D11 as Chrome's default; check `chrome://gpu` on the target PC.
- **NVIDIA-only mask misalignment:**
  - #5133 (Win 11, Chrome 121, 0.10.9; closed stale): the landscape model's GPU output sits "vertically offset by about one texel". Afflicted: RTX 3090, RTX 3080, GTX 1070. Correct: AMD R9 Fury X and Intel iGPU. https://github.com/google-ai-edge/mediapipe/issues/5133
  - #5428 (Win 11, 0.10.14; still open, labels `os:windows`, `gpu`): the offset plus "every 8th line gets jagged". On 2025-10-22 a Google engineer wrote that "a GPU-specific floating point precision issue … during sampling for a particular chunking/reformatting shader" was "identified and fixed", expected in "the next update of the vision npm package". https://github.com/google-ai-edge/mediapipe/issues/5428 ⚠️ Not re-tested on 1.2.2.
- **Long-session leak:** #6352 (open; macOS 15, Chrome 152, 1.0.1, GPU delegate, `selfie_segmenter`, VIDEO mode, ~24 fps).
  - The Emscripten GL handle tables (`GL.framebuffers`, `GL.textures`, `GL.syncs`) grow without bound, to 11.19 MB each after 75 min. Renderer RSS grows about 1.2 MB/min, and the page turns sluggish after about 60 min.
  - `mask.close()` makes no difference (reporter's A/B, 2026-10-03). https://github.com/google-ai-edge/mediapipe/issues/6352
  - Release v1.2.0 (2026-10-28) lists "Fix GPU memory leaks when releasing AHWB-backed SSBOs and pooled textures". ⚠️ Whether that covers #6352 is unknown. https://github.com/google-ai-edge/mediapipe/releases/tag/v1.2.0
- **Missing float render targets:** #6296 (open; Android Mali, 0.10.35). The GPU segmentation postprocessor aborts with "GPU does not fully support 4-channel float32 or float16 formats" instead of falling back. https://github.com/google-ai-edge/mediapipe/issues/6296 ⚠️ No Windows report of this was found.
- **Chrome-vs-Edge callback:** #5430 (Win 11, 0.10.13, `deeplab_v3`, GPU): the `segmentForVideo` callback never fired in Chrome but did in Edge; log line "Maximum number of pooled buffers reached". Closed 2026-09-30 as "doesn't happen on the latest version". https://github.com/google-ai-edge/mediapipe/issues/5430
- **Mask quality vs the legacy SDK:** #4630 (open). A Google engineer advised using `confidenceMask` rather than `categoryMask` for smooth edges, and said `minConfidence=0/maxConfidence=1` visualisation matches the legacy SDK. Another user needed a GLSL shader to avoid the GPU→CPU transfer "to get performance on par with selfie_segmentation". https://github.com/google-ai-edge/mediapipe/issues/4630
- **Dual-GPU Windows laptops:**
  - Since Chrome 80, WebGL's default `powerPreference` is "low-power". Ken Russell (2019): on Windows, Chrome/ANGLE could not pick a particular D3D device. https://groups.google.com/g/webgl-dev-list/c/gf0NHCFQkMM, https://www.khronos.org/webgl/public-mailing-list/public_webgl/1912/msg00003.php
  - The 2022–2023 workaround is to set Windows Graphics settings for Chrome to "High performance" or to pass `--force_high_performance_gpu`. https://groups.google.com/a/chromium.org/g/graphics-dev/c/2iXXLi9157M
  - ⚠️ Current (2026) behaviour was not confirmed.
- **Release notes, 2026:**
  - v1.2.2 (2026-11-03) "Remove non-SIMD WebAssembly builds".
  - v1.1.1 "Fix GPU interactive segmentation on macOS".
  - v1.0.0 "Add gpu_postprocessing option for TensorsToSegmentationCalculator".
  - v0.10.35 "Add missing GL memory barrier in TensorsToSegmentationGlBufferConverter".
  - https://github.com/google-ai-edge/mediapipe/releases
- **CPU fallback:** `baseOptions.delegate: "CPU"` uses WASM + XNNPACK (`research_camera.md` §1). Google Meet's selfie lineage ran on CPU WASM+SIMD at 8.3 ms inference on a 2018 MBP. https://research.google/blog/background-features-in-google-meet-powered-by-web-ml/
- implication: every Windows GPU bug above is vendor- or session-length-specific, so a CPU-delegate fallback and a 60+ min soak run on the target PC are the checks the sources point to.

## §2 ORT-Web (WebGPU) and LiteRT.js on Windows; the ONNX person models
**WebGPU on Windows Chrome:**
- Shipped by default in Chrome 113 for ChromeOS, macOS and Windows. Windows needs Direct3D 12. https://developer.chrome.com/blog/webgpu-release
- Current Chromium blocklist (`webgpu_blocklist_impl.cc` @ main): on Windows/D3D12, NVIDIA, AMD, Intel and Microsoft adapters are allowed.
  - NVIDIA is blocked on **32-bit x86 builds only** (crbug 42240193).
  - Qualcomm sits behind a feature flag.
  - Other vendors are blocked as "Limited support / testing currently available on Windows" (crbug 446254136).
  - Any **D3D11** adapter is blocked ("D3D11 backend not fully implemented", crbug 41479539).
  - https://chromium.googlesource.com/chromium/src.git/+/main/gpu/config/webgpu_blocklist_impl.cc
- **WebNN** (the route to DirectML/NPU from a page): chromestatus lists it as "Proposed", not shipped (https://chromestatus.com/feature/5176273954144256). Its origin trial was re-enabled in M147 to run through M149. https://go.mail-archive.com/blink-dev@chromium.org/msg15933.html ⚠️ Current trial state not confirmed.

**Runtimes:**
- **`onnxruntime-web` 1.31.1** (MIT, 2026-10-26; repo pushed 2026-11-05; unpacked 150.6 MB, of which the app ships only the chosen EP's wasm/js).
  - WebGPU EP is "the recommended path"; WebGL is deprecated since 1.29.0.
  - IO binding keeps tensors in `GPUBuffer`s.
  - Details in `research_camera.md` §1, §3. https://onnxruntime.ai/docs/tutorials/web/ep-webgpu.html
- **`@litertjs/core` 2.6.0** (Apache-2.0, 2026-10-22; 2.5.3 on 2026-07-17): Google's LiteRT.js, runs `.tflite` models on WebGPU with a WASM/XNNPack fallback. https://www.npmjs.com/package/@litertjs/core
- **RVM on LiteRT.js:** `ldenoue/rvm-webgpu` (created 2026-10-24, no licence file; RVM weights GPL-3.0).
  - Fixed-shape 512×288 and 256×256 graphs at `downsample_ratio=1`. The 4 recurrent states stay on the GPU.
  - TypeGPU pre-processing and compositing; no matte readback.
  - "In one local Chromium run at 512 × 288, the complete TypeGPU path measured 8.3–10.1 ms per frame (98.8–120.6 FPS), compared with 13.4 ms (74.6 FPS) for the … CPU-input/alpha-readback path."
  - The GPU and OS are **not named** ⚠️. https://github.com/ldenoue/rvm-webgpu

**ONNX person models** (OBS plugin copies with SPDX `.license` sidecars: https://github.com/royshil/obs-backgroundremoval/tree/main/data/models):

| Model | Licence (SPDX) | ONNX size | Input used by OBS | Output | Temporal | Upstream state |
|---|---|---|---|---|---|---|
| RVM `rvm_mobilenetv3` | GPL-3.0-only | 14,975,696 B fp32 (7,503,483 B fp16 upstream) | 320×192 base; any size + `downsample_ratio` | alpha + foreground | **recurrent** (r1–r4) | repo pushed 2024-04-02, dormant |
| MODNet (`Xenova/modnet`) | Apache-2.0 | 25,888,640 B fp32 / 12,984,781 B fp16 | (not in OBS) 256–512 | alpha matte | none | last commit 2022-07-29 |
| PP-HumanSeg (OBS `pphumanseg_fp32`) | Apache-2.0 | 6,196,913 B | ⚠️ variant not stated (portrait 256×144 vs general 192×192) | 2-class softmax | none | PaddleSeg 2.9 |
| SINet (`SINet_Softmax_simple`) | MIT | 395,434 B | 320×320 | 2-class | none | anilsathyan7/Portrait-Segmentation |
| MediaPipe Meet (`mediapipe.onnx`, PINTO conversion) | Apache-2.0 | 781,150 B | ⚠️ | person | none | PINTO_model_zoo 082 |
| MediaPipe selfie (`selfie_segmentation.onnx`) | Apache-2.0 | 447,596 B | 256×256 | person | none | PINTO conversion |

- **PP-HumanSeg families** (https://github.com/PaddlePaddle/PaddleSeg/blob/release/2.9/contrib/PP-HumanSeg/README.md; repo Apache-2.0):
  - Portrait V2-Lite: 256×144, mIoU 96.63 %, 15.86 ms on Snapdragon 855 (1 thread), 5.4 MB, aimed at "mobile video and web conferences".
  - **General human** V2-Mobile: 192×192, mIoU 93.13 %, 2.67 ms on an unnamed NVIDIA GPU; "the image of general human segmentation is various".
  - Downloads are Paddle inference models; no official ONNX is listed ⚠️ (paddle2onnx needed).
- **RVM in ONNX runtimes:** "depending on the inference tool you choose, it may not support all the operations in our official ONNX model". https://github.com/PeterL1n/RobustVideoMatting/blob/master/documentation/inference.md ⚠️ ORT-Web WebGPU op coverage for RVM is untested.
- ⚠️ **No published fps for any of these models in ORT-Web on Windows** (searched; the MODNet/transformers.js demos print fps but publish none).
- implication: on Windows the WebGPU route depends on a D3D12 adapter; the MediaPipe route depends on ANGLE WebGL2 float targets. These are two different driver paths on the same PC.

## §3 Published fps per platform (browser)
**TF blog 2022, MediaPipe solutions runtime (WASM & GPU) vs TF.js WebGL.** These are model-only fps. Pairs are landscape | general for Selfie and lite | full | heavy for BlazePose GHUM. https://blog.tensorflow.org/2022/01/body-segmentation.html

| Runtime / model | MacBook Pro 15" 2019 (i9, Radeon Pro Vega 20) | Desktop PC (i9-10900K + GTX 1070) | Pixel 6 Pro | iPhone 11 |
|---|---|---|---|---|
| MediaPipe, Selfie | 125 \| 130 | **185 \| 225** | 35 \| 33 | 31 \| 21 (CPU) |
| TF.js WebGL, Selfie | 74 \| 45 | 80 \| 62 | 25 \| 23 | 42 \| 30 |
| MediaPipe, BlazePose GHUM (+mask) | 70 \| 59 \| 31 | **123 \| 112 \| 70** | 22 \| 19 \| 10 | 8 \| 5 \| 1 |
| TF.js WebGL, BlazePose GHUM | 42 \| 36 \| 22 | 35 \| 33 \| 26 | 12 \| 10 \| 6 | 14 \| 12 \| 8 |

- The blog does not name the desktop's OS or browser ⚠️ (an i9-10900K + GTX 1070 desktop is presumably Windows).
- The runtime was the legacy `@mediapipe/selfie_segmentation`/`pose`, not Tasks Vision 1.2.2 ⚠️.
- Other published points:
  - Meet selfie model, 2018 MBP, CPU WASM SIMD: 8.3 ms inference, 14.3 ms pipeline (Google Research blog, see §1).
  - RVM on LiteRT.js WebGPU: 8.3–10.1 ms at 512×288 on an unnamed GPU (§2).
  - RVM native PyTorch: GTX 1080 Ti 104 fps at HD; RTX 3090 FP16 172 fps (RVM README).
- **Missing** ⚠️ (searched, none found): any Apple M-series + Chrome number; any Windows **Intel iGPU** or **AMD** browser number; any **RTX** browser number; any ORT-Web WebGPU number for MODNet, PP-HumanSeg or SINet; any Tasks Vision 1.x number on any desktop.
- implication: the only Windows-desktop browser figures are MediaPipe's (GTX 1070), and the Intel-iGPU laptop row is empty for every candidate.

## §4 Full body at 2–3 m (DJ behind decks)
- **Selfie (all variants):** "directly in front of a webcam on a video call (<2 meters)" (TF blog). Its training lineage is Meet's 256×144 video-call frames (Google Research blog).
- **BlazePose GHUM / PoseLandmarker mask:** "specializes in full-body cases … works up to 4 meters from the camera"; "well suited for bodies in full view further away from the camera" (TF blog).
  - It is a two-stage pipeline (pose detector 224², landmarker 256²; §1 table).
  - ⚠️ Inference, unverified: the mask exists only for a detected pose, so a half body hidden behind decks may affect detection. The docs say nothing about partial occlusion.
- **DeepLab-v3 (MediaPipe):** "general purpose image segmenter" with a `person` class; 257×257 input; no person-specific scope or distance statement.
- **RVM:** the `downsample_ratio` table has separate "Portrait" and "Full-Body" columns: at 1280×720 portrait 0.375 vs full-body 0.6; at 1920×1080 0.25 vs 0.4. "If the shot contains the full human body, use high `downsample_ratio`." No statement on subject distance. https://github.com/PeterL1n/RobustVideoMatting/blob/master/documentation/inference.md
- **PP-HumanSeg:** a separate **general human** family (192×192, "the image of general human segmentation is various") next to the portrait family (§2).
- **Selfie Multiclass:** has a `body-skin` and `clothes` class; its scope wording was not readable (PDF card) ⚠️.
- **Hands on the decks:** ⚠️ no source evaluates hands or forearms over equipment for any model.
- implication: the model choice splits on framing. Portrait-scoped models (Selfie, PP-HumanSeg portrait, Meet) fit a tight half-body shot; GHUM, RVM full-body settings, DeepLab and PP-HumanSeg general claim wider shots.

## §5 Low light, coloured light, strobes
- **No published evaluation** of low light, coloured light or strobes exists for MediaPipe, RVM, MODNet, PP-HumanSeg or SINet (⚠️; carried over from `research_camera.md` §2, re-searched, nothing new).
- The OBS plugin ships **low-light enhancement** models as an optional pre-pass:
  - TBEFN (BSD-3-Clause, 1,983,088 B);
  - URetinex-Net 180×320 (MIT, 1,661,990 B);
  - Semantic-Guided LLIE 180×324 (MIT, 53,274 B).
  - Source: OBS `data/models/*.license`.
- MediaPipe `VIDEO` mode keeps state across monotonic timestamps, while `IMAGE` mode "resets temporal tracking on each call" (`research_camera.md` §2). For PoseLandmarker, `minTrackingConfidence` controls when tracking falls back to re-detection (`vision.d.ts` L2765).
- Camera-side controls (`exposureMode`, `iso`, `brightness`) exist as image-track constraints; support depends on the device (`research_camera.md` §4).
- implication: strobe robustness has to come from our own pipeline (smoothing, hold, PSNR-style skip, §6). No model provides it.

## §6 Temporal smoothing in-browser: what references do
- **OBS background-removal** (`src/background-filter.cpp`, defaults in `background_filter_defaults`):
  - **EMA on the mask:** `cv::addWeighted(mask, f, lastMask, 1−f)`; default `temporal_smooth_factor` 0.85, clamped to be ≥ `threshold` (0.5).
  - **Skip near-identical frames:** `cv::PSNR(lastImage, image)` against `image_similarity_threshold` (default 35, enabled by default).
  - `mask_every_x_frames` (default 1, max 300); `smooth_contour` 0.5; `contour_filter` 0.05; `feather` 0.
  - https://github.com/royshil/obs-backgroundremoval/blob/main/src/background-filter.cpp
- **RVM:** recurrent states r1–r4 fed back each frame. "You must process frames sequentially and recycle its recurrent states"; ONNX initial states are zero tensors `[1,1,1,1]`. Without I/O binding, the states make a CPU↔GPU round-trip every frame (inference.md).
- **Google Meet:** a joint bilateral filter guided by the camera image, separable for speed, plus light wrapping (Google Research blog).
- **LiteRT.js RVM port:** keeps the recurrent state on the accelerator between frames (§2).
- Our engine already has a 32-slot frame-history ring (`web/src/scenes/history.ts`; `agents/STATE.md` S2.2).

## §7 Cross-OS reference: OBS "Background Removal" (royshil/obs-backgroundremoval)
- **Licence and state:** GPL-3.0-or-later (README SPDX). Latest release 1.4.1 (2026-07-26); repo pushed 2026-10-29; ships Windows x64, macOS universal and Debian builds. Maintenance: active. https://github.com/royshil/obs-backgroundremoval/releases/tag/1.4.1
- **Models:** SINet, MediaPipe Meet, Selfie, Selfie Multiclass, RVM, PP-HumanSeg. Depth: TCMonoDepth (790,459 B). Low light: §5. Paths in `src/consts.h`.
- **Defaults:** model **MediaPipe Meet**, device **CPU**, `numThreads` 1. The README says "A 2-thread setting works best".
- **Providers per OS:**
  - **Windows: CPU only**; the README says "we plan to support WinML acceleration".
  - macOS: CoreML (`COREML_FLAG_ENABLE_ON_SUBGRAPH`).
  - Linux: CUDA, ROCm, MIGraphX or TensorRT, only when built from source.
  - Sources: README "Technical Details"; `src/ort-utils/ort-session-utils.cpp`.
- **Reported fps:** none in the README or docs site ⚠️.
- **Integration mode:** reference only (C++/OpenCV/OBS). Its ONNX files can be fetched individually; each file carries its own licence sidecar (§2 table).
- **TouchDesigner "NVIDIA Background TOP":** Windows + NVIDIA (Maxine) only, so out of scope under the pure-web rule (`research_camera.md` §6).
- implication: the cross-OS streaming reference runs a <1 MB portrait model on CPU on Windows, then relies on EMA + PSNR skip for stability.

## §8 Unified-path shortlist (facts only; no pick)

| # | Model + runtime | Mac M-series (Chrome) | Win laptop, Intel iGPU | Win desktop, RTX | Licence | Size | Temporal | Soft alpha | Framing scope |
|---|---|---|---|---|---|---|---|---|---|
| 1 | MediaPipe `selfie_segmenter(_landscape)`, Tasks Vision, GPU delegate (CPU fallback) | ⚠️ none (MBP 2019 Intel: 125–130 fps) | ⚠️ none | ⚠️ none (GTX 1070: 185–225 fps) | Apache-2.0 | ≈250 KB + 14.6 MB wasm | none in model; VIDEO-mode state ⚠️ | confidence mask [0,1] | < 2 m |
| 2 | MediaPipe PoseLandmarker lite/full `outputSegmentationMasks` | ⚠️ none (MBP 2019: 70 / 59 fps) | ⚠️ none | ⚠️ none (GTX 1070: 123 / 112 fps) | Apache-2.0 | 5.8 / 9.4 MB | pose tracking across frames; mask smoothing ⚠️ | Float32 [0,1] | full body, ≤ 4 m |
| 3 | RVM mobilenetv3 via ORT-Web WebGPU or LiteRT.js WebGPU | ⚠️ none | ⚠️ none | ⚠️ none (unnamed GPU: 8.3–10.1 ms at 512×288) | GPL-3.0 | 7.5 MB fp16 / 15 MB fp32 | **recurrent** | **alpha matte** + foreground | portrait + full-body settings |
| 4 | MediaPipe `deeplab_v3` | ⚠️ none | ⚠️ none | ⚠️ none (Pixel 6 GPU 103 ms) | Apache-2.0 | 2.78 MB | none | confidence | general scenes |
| 5 | PP-HumanSeg general V2-Mobile (paddle2onnx) via ORT-Web | ⚠️ none | ⚠️ none | ⚠️ none (unnamed NVIDIA: 2.67 ms native) | Apache-2.0 | ⚠️ | none | softmax | general human |

- Runtime driver paths on Windows: rows 1, 2 and 4 run on WebGL2 via ANGLE (§1 bugs apply). Row 3's ORT/LiteRT WebGPU path and row 5 run on WebGPU/D3D12 (§2 blocklist applies). All have a WASM CPU fallback; the RVM port's CPU-input/alpha-readback path measured 13.4 ms on the same unnamed machine (§2).
- Mask hand-off into our WebGL2 context: rows 1, 2 and 4 can hand over a `WebGLTexture` in a shared canvas context or by GPU copy. Rows 3 and 5 produce `GPUBuffer`s with no zero-copy WebGL2 path (`research_camera.md` §3).
- implication: row 3 is the only candidate with temporal memory and a true matte. Rows 1–2 are the only ones with any published desktop browser fps. No row has a measured Intel-iGPU figure.

## §9 OS / vendor camera effects (only as a camera device)
- **NVIDIA Broadcast** (Windows, GeForce RTX 2060 / Quadro RTX 3000 or higher): a virtual camera. "select the NVIDIA Broadcast device from your video or voice chat application"; background *removal* outputs a black background. https://www.nvidia.com/en-us/geforce/broadcasting/broadcast-app/, https://www.nvidia.com/broadcast-app-faq ⚠️ Chrome `videoinput` visibility not confirmed.
- **Windows Studio Effects** (Copilot+ PC NPU ≥ 40 TOPS): applied in Windows "across supported apps that use your camera". Exact effects vary by device, camera and driver. https://support.microsoft.com/en-us/windows/ai/ai-features/windows-studio-effects, https://learn.microsoft.com/en-us/training/modules/windows-studio-effects/2-definition
- **macOS** Portrait, Studio Light and Backgrounds: video only, no mask (`research_camera.md` §8).
- **Chrome web APIs:**
  - The Background Blur API (Chrome 114 origin trial, set to end in Chrome 117) observes the OS blur on macOS/ChromeOS and can also control it on Windows. https://developer.chrome.com/blog/background-blur
  - chromestatus "Camera Effects Status: Background Blur" is In development (https://chromestatus.com/feature/5098450535055360).
  - **"Background Mask/Segmentation": No active development** (https://chromestatus.com/feature/5187283610501120).
- implication: none of these hands a page a mask. At most they deliver an already-processed picture as a camera.
