# Research — Stage 3 camera scene (person segmentation, paths A/B/C)

## TL;DR
- **A (in-browser):** MediaPipe Tasks Vision 1.2.2 (Apache-2.0, released 2026-11-03) with the 250 KB `selfie_segmenter` is the only actively maintained real-time option with a published browser lineage (Meet: 8.3 ms inference at 256×144 on a 2018 MBP). Its GPU mask is a `WebGLTexture` in **its own** context unless it is handed our canvas (⚠️ untested). RVM (GPL-3.0, recurrent, alpha matte) and MODNet (Apache-2.0) run via ONNX Runtime Web 1.31.1 (MIT), where WebGL is **deprecated** in favour of WebGPU. No published browser fps for either.
- **B (Apple Vision):** `VNGeneratePersonSegmentationRequest` has fast/balanced/accurate levels, an 8-bit/fp16/fp32 mask and a stateful request with temporal smoothing at the `fast` level. **Apple publishes no fps or mask sizes.** VDMX6 users report ≈22 fps on M1/M2. The browser has no shared memory, so a helper must stream over WebSocket/WebRTC or expose a CoreMediaIO virtual camera (macOS 13+).
- **C (macOS system effects):** Portrait, Studio Light and Backgrounds are applied **before** frames reach Chrome. An app sees only the processed video; no mask API was found (⚠️). Backgrounds need macOS 15 + Apple silicon; Portrait needs the built-in camera or Continuity Camera. Continuity Camera (macOS 13+, iPhone XR+) is a normal camera device to every app.
- **DJ booth:** MediaPipe's Selfie model is scoped to people **< 2 m** from the camera, and Vision's guidance wants the person to fill **≥ ½ of the image height**. A DJ behind decks sits at the edge of both. No published low-light/strobe evaluation was found for any model (⚠️).

## Freshness
- 2026-11-05, researcher. Checked: `@mediapipe/tasks-vision` 1.2.2 (npm, 2026-11-03; typings read from the tarball), `onnxruntime-web` 1.31.1 (2026-10-26), `@huggingface/transformers` 4.3.2 (2026-10-27), `@tensorflow-models/body-segmentation` 1.0.2 (2023-07-31), `@tensorflow-models/body-pix` 2.2.1 (2023-08-22), `@mediapipe/selfie_segmentation` 0.1.1675465747 (2023-02-03), RVM v1.0.0 assets, Xenova/modnet. Inputs: `thoughts/spec_camera.md` (all, incl. the 2026-11-05 A/B/C update), `thoughts/spec_veejay_wizard.md` §4–§5, `donor/td-reverse/touchdesigner/extracted/.../OfflineHelp`, `web/src/gl/scene.ts`, `web/src/gl/engine.ts`, `web/src/milkdrop/native.ts`, `web/vite.config.ts`, `agents/system-designer/design_milkdrop.md` L392–397.
- Donor: no browser segmentation code in `./donor/`. The TD dump only documents Windows/NVIDIA ops (§6).

## §1 Path A: in-browser segmentation models + runtimes

| Model / runtime | Licence | Model file | Input | Mask | Temporal | npm pkg, latest | Maintenance |
|---|---|---|---|---|---|---|---|
| MediaPipe `selfie_segmenter` (square) via Tasks Vision | Apache-2.0 | 249,537 B fp16 | 256×256 | float confidence [0,1] or uint8 category | none in API; ⚠️ unknown inside graph | `@mediapipe/tasks-vision` 1.2.2, 2026-11-03 | active (repo pushed 2026-11-05) |
| MediaPipe `selfie_segmenter_landscape` | Apache-2.0 | 250,177 B fp16 | 144×256 | same | same | same | same |
| MediaPipe `selfie_multiclass_256x256` (bg/hair/body-skin/face-skin/clothes/others) | Apache-2.0 | 16,371,837 B fp32 | 256×256 | 6 confidence masks | same | same | same |
| MediaPipe `hair_segmenter` | Apache-2.0 | 781,618 B | 512×512 | hair only | — | same | same |
| Legacy MediaPipe Selfie Segmentation (solutions API) | Apache-2.0 | bundled | 256×256 / 144×256 | — | — | `@mediapipe/selfie_segmentation` 0.1.1675465747, 2023-02-03 | legacy, no release since 2023 |
| TF.js BodyPix | Apache-2.0 | — | — | binary + 24 parts | — | `@tensorflow-models/body-pix` 2.2.1, 2023-08-22 | **deprecated** in favour of `body-segmentation` |
| TF.js body-segmentation (wraps MediaPipe Selfie or BodyPix) | Apache-2.0 | — | — | — | — | 1.0.2, 2023-07-31 | stale (tfjs 4.22.0, last 2025-01) |
| RVM `rvm_mobilenetv3` via ONNX Runtime Web | **GPL-3.0** (code + weights, re-released 2021-09-16) | 14,975,696 B fp32 / 7,503,483 B fp16 ONNX (opset 12) | any; `downsample_ratio` (0.25 at HD) | **alpha matte** + foreground | **recurrent** (4 hidden states fed back) | `onnxruntime-web` 1.31.1 (MIT), 2026-10-26 | model repo: last commit 2023-03-13 (dormant); ORT active |
| MODNet (`Xenova/modnet`) via ORT Web / transformers.js | Apache-2.0 | 25,888,640 B fp32 / 12,984,781 B fp16 | demo default 256 | alpha matte | none (per-frame) | `@huggingface/transformers` 4.3.2, 2026-10-27 | model repo last commit 2022-07-29 (dormant) |
| BiRefNet / BiRefNet-lite | MIT | — | 1024×1024 | matte | none | — | active (pushed 2026-10-25); ⚠️ no source claims real-time in a browser |
| `@imgly/background-removal` | AGPL-3.0 (repo) | — | — | still images | — | 1.7.0, 2025-07-18 | still-image tool, not video |

Sources: npm registry (`npm view <pkg> version license time`); model sizes via `curl -I` on the URLs listed at https://developers.google.com/edge/mediapipe/solutions/vision/image_segmenter; RVM README + release assets https://github.com/PeterL1n/RobustVideoMatting; MODNet https://github.com/ZHKKKe/MODNet, https://huggingface.co/Xenova/modnet; BodyPix note https://github.com/tensorflow/tfjs-models/blob/master/body-pix/README.md; repo metadata via `api.github.com/repos/<repo>`.

**Published speed numbers (none are Apple Silicon + Chrome):**
- MediaPipe model table, Pixel 6 CPU / GPU: selfie square 33.46 / 35.15 ms; landscape 34.19 / 33.55 ms; multiclass 217.76 / 71.24 ms; hair 57.90 / 52.14 ms. These are whole-pipeline times. https://developers.google.com/edge/mediapipe/solutions/vision/image_segmenter
- Google Meet (the selfie model's lineage: 256×144, 193K params, 400 KB fp16, WASM + XNNPACK + SIMD on CPU): on a 2018 MacBook Pro, inference 8.3 ms and full pipeline 14.3 ms at 720p. https://research.google/blog/background-features-in-google-meet-powered-by-web-ml/
- RVM, native PyTorch only: GTX 1080 Ti FP32 104 fps HD; RTX 3090 FP16 172 fps HD. Its webcam demo runs a TF.js int8 build in the browser, with no fps published. https://github.com/PeterL1n/RobustVideoMatting
- MODNet in transformers.js on WebGPU: a demo exists with a 256 px size slider and a "stream scale" 0.5 default. No fps published. https://huggingface.co/spaces/Nymbo/webgpu-video-background-removal/blob/main/index.html
- ⚠️ No published M-series + Chrome number exists for any candidate. It must be measured.

**Runtime facts:**
- **MediaPipe Tasks Vision 1.2.2** (typings `vision.d.ts` in the npm tarball):
  - `baseOptions.delegate?: "CPU" | "GPU"`; `runningMode` `IMAGE | VIDEO`.
  - `segmentForVideo(frame: TexImageSource, timestampMs, cb?)`. `TexImageSource` includes `VideoFrame`. The sync form copies the result; the callback form's masks live only for the duration of the callback.
  - `outputConfidenceMasks` defaults to true; `outputCategoryMask` defaults to false.
  - `canvas?: HTMLCanvasElement | OffscreenCanvas`: "The canvas element to bind textures to. This has to be set for GPU processing. The task will initialize a WebGL context and throw an error if this fails (e.g. if you have already initialized a different type of context)."
  - `MPMask.getAsWebGLTexture()`: "The returned texture is bound to the current canvas (see `.canvas`)." `getAsFloat32Array` / `getAsUint8Array` are an "expensive GPU to CPU transfer".
  - WASM ≈14.6 MB (`vision_wasm_internal.wasm`). The docs load it via `FilesetResolver.forVisionTasks(<url>/wasm)`, using jsDelivr in the examples. Self-hosting means pointing at a local copy of `wasm/`. https://developers.google.com/edge/mediapipe/solutions/vision/image_segmenter/web_js
  - No WebGPU delegate appears in the 1.2.2 typings.
- **MediaPipe in a worker:**
  - The typings accept `OffscreenCanvas`, and the `MPImage` docs say ImageBitmap paths need "an `OffscreenCanvas` with WebGL2".
  - Issue #5292 reports that tasks-vision called `document.createElement("canvas")` inside a worker on iOS 17. https://github.com/google/mediapipe/issues/5292
  - ⚠️ No official worker guide for ImageSegmenter was found. The interactive-segmenter guide suggests workers for its blocking calls. https://developers.google.com/edge/mediapipe/solutions/vision/interactive_segmenter/web_js
- **ONNX Runtime Web 1.31.1** (MIT):
  - EPs: `wasm`, `webgpu`, `webgl`, `webnn`. https://onnxruntime.ai/docs/tutorials/web/
  - v1.29.0 notes: "onnxruntime-web has announced the deprecation of WebGL and JSEP … The native WebGPU EP is the recommended path going forward." https://github.com/microsoft/onnxruntime/releases/tag/v1.29.0
  - WebGPU IO binding: `Tensor.fromGpuBuffer`, `preferredOutputLocation: 'gpu-buffer'`, graph capture for static shapes. https://onnxruntime.ai/docs/tutorials/web/ep-webgpu.html
  - A GPU output is a WebGPU buffer, not a WebGL texture (see §3).
  - ⚠️ The multithreaded WASM EP needs `SharedArrayBuffer`, i.e. cross-origin isolation (COOP/COEP). `web/vite.config.ts` sets no such headers today.
- implication: of the A candidates, only MediaPipe has a release in the last 12 months *and* a model under 1 MB. RVM is the only one with built-in temporal memory, and it is GPL-3.0.

## §2 Low light, strobes, temporal smoothing
**What is published about lighting (little):**
- No low-light, coloured-light or strobe evaluation exists for MediaPipe Selfie, RVM, MODNet or Apple Vision (⚠️ searched, none found).
- Vendor cards only say it qualitatively. Niantic ARDK: "extreme light conditions may affect the overall performance", https://niantic.dev/docs/ardk/model_cards/person_segmentation.html. NVIDIA PeopleSemSegNet: "accuracy may be reduced in low-light, low contrast lighting", https://catalog.ngc.nvidia.com/orgs/nvidia/tao/models/peoplesemsegnet/deployable_v1.0/model-card/explainability.
- ML Kit's selfie model card reports ≈96 % IoU on selfie sets, broken down by skin tone/region/gender, but not by lighting. https://developers.google.cn/static/ml-kit/images/vision/selfie-segmentation/selfie-model-card.pdf
- Research that handles dark scenes well (Swin-MFA, mIoU 81.0 on its own low-light set) uses RGB **+ depth**. https://doaj.org/article/b69cce200985494ab9995df35e4349eb
- OBS background-removal ships separate low-light *enhancement* models (TBEFN, URetinex-Net, SGLLIE) next to its segmenters. That is a sign that its author treats low light as a pre-processing problem. https://github.com/royshil/obs-backgroundremoval
- TD's NVIDIA Background TOP doc: the model "is trained to look for specific image patterns (a person in front of a webcam) and may not perform as well on generic input". It suggests Blur TOP + Level TOP to refine the key. Source: `donor/td-reverse/touchdesigner/extracted/Samples/Learn/OfflineHelp/https.docs.derivative.ca/NVIDIA_Background_TOP.htm`.

**Temporal smoothing techniques found:**
- **Recurrent model:** RVM carries 4 recurrent states between frames, "to process videos with temporal memory". https://github.com/PeterL1n/RobustVideoMatting
- **Stateful request:** Apple Vision. Reusing one `VNGeneratePersonSegmentationRequest` across frames lets it "smooth temporal changes between frames, in fast-quality level model". https://developer.apple.com/videos/play/wwdc2021/10040/
- **Edge-aware upsampling:** Google Meet smooths its low-res mask with a **joint bilateral filter** guided by the camera image, using separable filters instead of a Gaussian pyramid "to remove halo artifacts". It also applies **light wrapping** at the edges. https://research.google/blog/background-features-in-google-meet-powered-by-web-ml/
- **Guided filter:** He et al., ECCV 2010, an O(N) edge-preserving filter; RVM's high-res refiner is a related design. https://kaiminghe.github.io/eccv10/
- **Mask EMA / hysteresis:** ⚠️ no authoritative web source located. It is a generic technique (per-pixel `m = mix(m_prev, m_new, k)`). Our engine already holds frame history in a 32-slot ring (`web/src/scenes/history.ts`).
- **Strobe case:** ⚠️ no source covers a segmenter under strobe light. Fact: MediaPipe `IMAGE` mode "resets temporal tracking on each call", while `VIDEO` mode keeps state across monotonic timestamps. https://developers.google.com/edge/mediapipe/solutions/vision/image_segmenter/web_js
- implication: any smoothing or strobe robustness has to be built and measured in our own pipeline; no candidate documents it.

## §3 Getting frames and the mask into our WebGL2 context
**Camera frame → our texture:**
- `texImage2D` accepts `HTMLVideoElement` and `VideoFrame`, among other sources. https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/texImage2D
- Chromium removed a YUV→canvas paint step for camera→WebGL. At 720p on a Nexus 6P, blocking `texImage2D` dropped from ~12 ms to ~4 ms, but YUV is still copied between shared-memory regions. That is a 2016 number, ⚠️ no current macOS figure. https://crrev.com/321904d3d1c4675cfe9d25b1c30f528efcf869e4
- Chromium on macOS captures camera frames as IOSurfaces. These are "written to in the capture process … once sent to other processes no CPU writes are performed". ⚠️ Whether WebGL `texImage2D(video)` then stays GPU-side was not confirmed. https://chromium.googlesource.com/chromium/src/+/main/gpu/command_buffer/client/internal/mappable_buffer_io_surface.cc
- Upload tip (Unity/Chrome report): `texImage2D` on a fresh texture beat `texSubImage2D` from a video in Chromium. https://discussions.unity.com/t/video-player-render-to-texture-performance-issue-in-webgl-on-chrome/756187
- Our MilkDrop copy (`web/src/milkdrop/native.ts` L28–36) uses `texSubImage2D` when the size is unchanged.
- **`requestVideoFrameCallback`**: Baseline 2024. Metadata: `expectedDisplayTime`, `presentationTime`, `mediaTime`, `presentedFrames` (detects missed frames), `processingDuration`. `captureTime`/`receiveTime` are WebRTC-only. https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback
- **`MediaStreamTrackProcessor`** gives a `ReadableStream<VideoFrame>` from a track. MDN lists it for dedicated workers, with a main-thread variant in some browsers; "Limited availability". The track is transferable to a worker. https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrackProcessor
- WebGPU can import a `VideoFrame` as an external texture for "zero-copy sampling of YUV frame data". That is WebGPU only, not WebGL. https://groups.google.com/a/chromium.org/g/blink-dev/c/QLCfazM8XLQ

**Mask → our texture: the options found**
1. **Same context (MediaPipe).**
   - The `canvas` option binds MediaPipe's GL work to a given canvas.
   - `DrawingUtils` says "If your Task is using a GPU delegate, the context must be obtained from its canvas" (vision.d.ts L240–243).
   - Per the HTML spec, a second `getContext('webgl2')` on a canvas returns the **existing** context. https://html.spec.whatwg.org/multipage/canvas.html#dom-canvas-getcontext
   - Our project already relies on this rule for Butterchurn: `web/src/bench.ts` L314 has "a second getContext returns it".
   - So handing MediaPipe our stage canvas would put its textures in our context. ⚠️ Untested: GL state MediaPipe leaves bound (FBO, program, texture units, viewport), and whether it works with our `alpha:false` context (`web/src/gl/engine.ts` L16).
2. **Cross-context GPU copy.**
   - MediaPipe runs on its own (Offscreen)canvas; we `texImage2D(thatCanvas)` into our context.
   - Chromium takes a GPU→GPU blit (`TexImageViaGPU` → `CopyToPlatformTexture`) for WebGL-canvas sources (`agents/research/research_butterchurn_integration.md` L106).
   - **Measured here** for Butterchurn's canvas at full stage size: main-thread p95 0.10 ms, 0 late frames in 60 s (`agents/system-designer/design_milkdrop.md` L392–393).
   - A mask is 256×256 or smaller.
3. **CPU readback.** `getAsFloat32Array()` / `getAsUint8Array()` are documented as an "expensive GPU to CPU transfer" (vision.d.ts). Then `texImage2D` of an R8/R32F array: a 256×144 uint8 mask is 36,864 B. ⚠️ Cost unmeasured.
4. **WebGPU output (ORT).**
   - Outputs are `GPUBuffer`s (`preferredOutputLocation: 'gpu-buffer'`).
   - No WebGPU→WebGL2 zero-copy path was found. The routes are a WebGPU canvas as a `texImage2D` source, or a readback.
   - A Chromium graphics-dev thread reports a 4K canvas→WebGPU transfer at ~20 ms in Chrome vs 0.35 ms native, cause unknown. https://groups.google.com/a/chromium.org/g/graphics-dev/c/pjXEk2o4aZE
   - The WebGPU group notes that cross-API shared textures "usually have bad layouts". https://github.com/gpuweb/gpuweb/wiki/GPU-Web-2020-06-23-VF2F-Day-2
- **Frame/mask alignment:** TD's doc says the key is "multiple frames behind the original image" and should be matched via a Cache TOP delay (donor NVIDIA_Background_TOP.htm). MediaPipe's sync `segmentForVideo` returns the mask for the frame passed in.
- implication: only option 1 avoids any copy, and it is unverified. Option 2 has an in-house precedent with measured cost.

## §4 Camera input in Chrome
- **Constraints** (all `ConstrainX`, accepting `ideal`/`min`/`max`/`exact`): `width`, `height`, `aspectRatio`, `frameRate`, `facingMode`, `deviceId`, `groupId`, `resizeMode`. https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints
  - `resizeMode: 'none'` means "the resolution provided by the underlying hardware"; `'crop-and-scale'` lets the UA crop/downscale. Unset, the browser picks by fitness distance.
  - `track.applyConstraints()` changes a live track.
  - Image-track properties (`exposureMode`, `iso`, `brightness`, `zoom`, …) are listed separately; support depends on the device.
- **Device list and switching:** the same pattern as our audio input (`web/src/audio/input.ts` L96–159). `enumerateDevices()` labels stay empty until permission is granted; we filter on `kind`, then `getUserMedia({ … deviceId: { exact } })`, and listen to `devicechange`. For video, `kind === 'videoinput'`. https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/enumerateDevices
- **Permission:** `localhost` counts as a secure context, so `getUserMedia` is allowed. https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts
  - On macOS, Chrome itself also needs the OS camera grant (TCC) in System Settings › Privacy & Security › Camera. https://support.google.com/chrome/answer/2693767 ⚠️ that page's macOS wording was not re-read this session.
  - VDO.Ninja notes that system Video Effects can re-enable themselves when switching apps (§8). https://docs.vdo.ninja/common-errors-and-known-issues/unexpected-emojis-balloons
- **Capture cards:** Elgato Cam Link 4K is UVC: "should work in any application that supports webcams", macOS 10.12+. https://help.elgato.com/hc/en-us/articles/360027961492-Cam-Link-4K-Supported-Software ⚠️ Chrome not explicitly listed. A class-compliant UVC device appears as an ordinary `videoinput` (inference).
- **Latency:** ⚠️ no published camera→screen figure was found for USB webcams or Cam Link in Chrome.
  - `requestVideoFrameCallback.captureTime` exists only for WebRTC sources (§3), so measuring needs an external method (e.g. film a ms clock).
  - Spec budget: ≤ 100 ms camera→screen (`thoughts/spec_camera.md` §4.1).

## §5 Electron later
- **Camera permission:** `systemPreferences.askForMediaAccess('camera')` returns `Promise<boolean>`; `getMediaAccessStatus('camera')`; consent is required since macOS 10.14.
  - `NSCameraUsageDescription` must be in Info.plist.
  - After a denial "an alert will not pop up" again; the user changes it in System Settings, and "a restart of the app will be required".
  - https://www.electronjs.org/docs/latest/api/system-preferences
- **Same Chromium:** `getUserMedia`, WebGL2, WebGPU and `MediaStreamTrackProcessor` behave as in Chrome (spec §4 "Same Chromium, so the pilot code runs as-is", `thoughts/spec_veejay_wizard.md` §4).
- **Model files:** in a web build they are fetched from a URL. MediaPipe's `FilesetResolver` takes a base path; `createFromModelBuffer(fileset, Uint8Array)` takes bytes (vision.d.ts L1644). So an Electron build can read files from disk and pass buffers. ⚠️ Whether `FilesetResolver` accepts `file://` or needs a custom protocol is untested.
- **Native path B in Electron:** a Node native addon (N-API / `node-addon-api`) can call Swift/ObjC Vision code in-process, or a helper process can talk over IPC. ⚠️ No published Electron + `VNGeneratePersonSegmentationRequest` addon was found. Electron's native-module guide: https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules

## §6 Prior art: VJ tools with person segmentation
| Tool | What it uses | Facts | Source |
|---|---|---|---|
| TouchDesigner, NVIDIA Background TOP | NVIDIA Maxine Video Effects "AI Green Screening". **Windows + RTX 20–50 only**; models downloaded separately | Quality/Performance modes; min input 512×288; outputs a mono key; the key is "multiple frames behind", so delay the source with a Cache TOP (negative index); "tuned for a single person sitting in front of a webcam … full body … may not perform well" | donor `…/OfflineHelp/https.docs.derivative.ca/NVIDIA_Background_TOP.htm` (dated 2025-12-11) |
| TouchDesigner, Body Track CHOP | Maxine AR SDK 0.8.7, Windows + RTX | 34 keypoints, ≤ 8 bodies (pose, not mask) | donor `…/Body_Track_CHOP.htm` |
| TouchDesigner + `mediapipe-touchdesigner` | MediaPipe Tasks in an embedded **Chromium** page, with results sent to TD over a local WebSocket | MIT, v0.6.0 2026-10-14. Its docs recommend the multiclass model ("MultiCam") for the best webcam cutout | https://github.com/torinmb/mediapipe-touchdesigner |
| Resolume Arena/Avenue 7.28 (Sept 2026) | "a human-segmentation model", model unnamed (⚠️) | Wire node Human Segmentation; Background Removal fx; output/invert mask, smooth edges, clean boundaries; depth estimation node alongside | https://resolume.com/blog/34630, https://cdm.link/resolume-7-28-computer-vision/ |
| VDMX6 (macOS) | Apple Vision person segmentation (Remove Background FX, official since ≈2025-04) + CoreImage Person Segmentation FX | User reports: ≈22 fps max on M1/M2/Intel, 11 fps with two instances; Segmented Blur needs macOS 14+; a CoreImage mask appeared "shifted and stretched" | https://discourse.vidvox.net/t/background-removal-with-macos-vision-api/2246, https://vdmx.vidvox.net/blog/vdmx6-update-video-tracking-ocr-scopes-color-transfer-and-more |
| OBS `obs-backgroundremoval` | ONNX Runtime; **CoreML EP on Mac** (Apple Silicon); models: MediaPipe Meet segmentation, SINet, RVM, TCMonoDepth, + low-light enhancers | GPL-3.0; v1.4.1 2026-07-26; repo pushed 2026-10-29 | https://github.com/royshil/obs-backgroundremoval |
| Synesthesia | ⚠️ no person-segmentation feature found | — | — |
| Google Meet (not VJ; same lineage as path A) | MediaPipe + TFLite, WASM/XNNPACK, WebGL2 render | see §1, §2 | https://research.google/blog/background-features-in-google-meet-powered-by-web-ml/ |
- implication: the two macOS VJ tools that do segmentation use Apple Vision (VDMX6) or an ONNX model (OBS). TD's built-ins need Windows/NVIDIA, and TD on macOS reaches MediaPipe through a browser page.

## §7 Path B: Apple Vision native
**`VNGeneratePersonSegmentationRequest`** (macOS, iOS, iPadOS, tvOS; revision 1 is "the default and the only available revision"). https://developer.apple.com/videos/play/wwdc2021/10040/
- **Quality levels** (header doc text via https://docs.rs/objc2-vision/latest/src/objc2_vision/generated/VNGeneratePersonSegmentationRequest.rs.html):
  - `fast`: "a low accuracy segmentation mask that can be used in streaming scenarios … on devices that have a neural engine";
  - `balanced`: "a high accuracy segmentation mask";
  - `accurate`: "based on the balanced output that includes matting refinement". This is the default.
  - WWDC21 recommends `balanced` for frame-by-frame video and `fast` for streaming. "Mask resolution, memory consumption, processing time all go up" with quality.
  - Kodeco reports that the accurate mask is "64x" the fast frame size. https://www.kodeco.com/29650263-person-segmentation-in-the-vision-framework?page=2
- **Output:** a `VNPixelBufferObservation.pixelBuffer`.
  - Formats: `OneComponent8` (default), `OneComponent32Float`, and a 16-bit half float that WWDC calls "can be inserted directly into further GPU-based processing with Metal".
  - The mask resolution differs from the input, so scale it before compositing. https://origin-devforums.apple.com/forums/thread/733447
- **Temporal:** the request is stateful when reused across frames, which smooths frames at the `fast` level (WWDC21).
- **Scene guidance** (WWDC21): up to 4 people; each person "at least half the image height", ideally with good contrast; avoid "people at a far distance".
- **Speed:**
  - ⚠️ Apple publishes **no** fps, latency, mask sizes or M4 numbers, and the API exposes no compute-unit choice (ANE vs GPU) for this request.
  - Field reports: VDMX6 ≈22 fps on M1/M2 (level unknown), 11 fps with two instances; CoreImage `personSegmentation` quality 1.0 ≈30 fps on an M1 MBP with a shrunk feed. https://discourse.vidvox.net/t/background-removal-with-macos-vision-api/2246
- **Related requests:**
  - `CIFilter.personSegmentation()` wraps the same request (`qualityLevel` 0/1/2) (WWDC21).
  - `VNGeneratePersonInstanceMaskRequest`: macOS 14+, per-person masks; ≤ 4 people per third-party guides (⚠️). https://developer.apple.com/documentation/vision/vngeneratepersoninstancemaskrequest
  - Face/framing: `VNDetectFaceRectanglesRequest` returns face bounding boxes, and `VNDetectHumanRectanglesRequest` returns person boxes. ⚠️ Their macOS versions and costs were not checked this session. https://developer.apple.com/documentation/vision/vndetectfacerectanglesrequest

**Helper → Chrome transports** (a browser page cannot map native shared memory):
| Transport | Facts | Latency / overhead |
|---|---|---|
| WebSocket (binary) | Swift: Network.framework `NWListener` + `NWProtocolWebSocket`, with an Apple DTS sample server (https://developer.apple.com/forums/thread/660059). Browser: `WebSocket`, `binaryType='arraybuffer'`, then `texImage2D` of the mask bytes | Computed: a 720p BGRA frame is 3,686,400 B (≈110 MB/s at 30 fps); an 8-bit 512×288 mask is 147,456 B. ⚠️ No measured loopback latency found |
| WebRTC (local peer) | Needs a WebRTC stack in the helper; frames go through a video encoder; there is a jitter buffer | A practitioner moved off WebRTC to WebSocket + WebCodecs for lower latency, citing "no jitter buffer" (anecdotal, https://blog.helix.ml/p/we-killed-webrtc-and-nobody-noticed). ⚠️ Whether a WebRTC video track can carry alpha: not checked |
| Virtual camera (CoreMediaIO camera extension) | macOS 12.3+ (hardware camera access inside the extension needs 13); appears "just like the built-in camera in all camera apps"; must be sandboxed; ships inside a host app in `/Applications`; the user approves it in Privacy & Security; DAL plug-ins deprecated. Apple's CIFilterCam sample reads another camera, filters it and republishes it (https://developer.apple.com/videos/play/wwdc2022/10022/). OBS uses it from macOS 13 (https://git.tjdev.de/mirror/obs-studio/commit/aae2f7e8ffe27ab832f9eb65f23e0fe6e2ee6e00) | No numbers published ("emphasis on performance"). Chrome sees it through `getUserMedia` like any camera (⚠️ inferred from "all camera apps") |
| Electron native addon (later) | N-API addon in the main process, or a helper over IPC (§5) | ⚠️ none measured |
- implication: a virtual camera needs no browser-side transport code, but a camera stream carries an opaque image. The mask would have to travel inside the picture or over a second channel (⚠️ alpha in `getUserMedia` frames not verified).

## §8 Path C: macOS system camera features
**Video effects reach Chrome as processed pixels only:**
- macOS applies them "before the video even enters your browser", so the web app "cannot detect or control them". https://docs.vdo.ninja/common-errors-and-known-issues/unexpected-emojis-balloons
- Apple is "intercepting the video camera input, analyzing it, potentially processing it, and then sending it on". https://sixcolors.com/post/2023/07/first-look-macos-sonoma-public-beta/
- **App-side API:** `AVCaptureDevice.isPortraitEffectEnabled` (class-level; the user's choice in Control Center) and `isPortraitEffectActive` (macOS 12+). Both are read-only status flags. https://developer.apple.com/tutorials/data/documentation/avfoundation/avcapturedevice/isportraiteffectactive.md
  - ⚠️ No API that hands an app the Portrait/Backgrounds **mask** was found.
- **Web API for the OS mask:**
  - W3C `backgroundSegmentationMask` = a greyscale `ImageBitmap` in `VideoFrameMetadata` next to the unmodified frame. Merged into the Media Capture Extensions draft 2025-06-05. https://github.com/w3c/mediacapture-extensions/pull/142, https://w3c.github.io/mediacapture-extensions/
  - The PR names Apple Vision person segmentation as the planned macOS source. Chromium has constraints/settings only behind `--enable-blink-features=MediaCaptureCameraControls`.
  - **chromestatus 5187283610501120 = "No active development"** (last update 2024-06-18). https://chromestatus.com/feature/5187283610501120
  - The same draft defines `faceFraming` (crop to faces) and a `backgroundBlur` status in frame metadata. ⚠️ Chrome shipping status of those was not checked.
- **Per-app toggle:** in Sonoma, Video Effects moved to a menu-bar item shown while any app uses a camera. Center Stage has a per-app setting there. https://sixcolors.com/post/2023/07/first-look-macos-sonoma-public-beta/
  - ⚠️ No per-app toggle for Portrait/Backgrounds was confirmed.
  - Effects can re-enable themselves when switching apps (VDO.Ninja, above).

**Requirements** (https://support.apple.com/en-us/105117 and Apple search results for it):
| Effect | Needs | Camera sources |
|---|---|---|
| Portrait (background blur) | Apple silicon laptop | **built-in camera**, or Continuity Camera with iPhone XR+ |
| Studio Light | macOS 14+, Apple silicon laptop | built-in, or Continuity Camera with iPhone 12+ |
| Backgrounds (replacement) | macOS 15+, Apple silicon | Continuity Camera needs iOS 18, iPhone 12+; disabled with large Presenter Overlay |
| Center Stage | — | Continuity Camera iPhone 11+ (not SE); 2024+ MacBook Pro/iMac built-in; 2025+ MacBook Air; Studio Display (https://support.apple.com/en-us/111102) |
| Edge Light | macOS 26.2+, Apple silicon | — |
- ⚠️ Apple's page names only built-in and Continuity cameras. Effects on **USB webcams / capture cards** were not confirmed.

**Continuity Camera:**
- macOS 13+, iOS 16+, iPhone XR or later; wired (iPhone must trust the Mac) or wireless (no AirPlay/Sidecar; Wi-Fi + Bluetooth on). https://support.apple.com/en-us/102546
- When mounted, "its camera and mic are available to apps that can use them". It appears as a camera device.
- ⚠️ Latency (wired vs wireless) not published.
- implication: C can feed path A or B as a camera, and Backgrounds/Portrait give a processed-video baseline to compare against. The mask itself is not reachable from Chrome today.

## §9 Published comparisons (Vision vs MediaPipe vs RVM)
- ⚠️ **No head-to-head benchmark found** for Apple Vision person segmentation vs MediaPipe Selfie vs RVM (hair, hands, motion blur). Searched Apple, Google and arXiv.
- RVM paper: frame-by-frame matting flickers, and the recurrent design "substantially reduces flicker". https://arxiv.org/pdf/2108.11515.pdf
- A competing matting paper (2022) reports RVM, MODNet and P3MNet as less accurate on fine hair than its method, and says RVM "struggles" in its hard cases. These are rival authors' numbers. https://arxiv.org/pdf/2210.05210
- Browser practitioner write-up (dev.to, 2026-07-29):
  - Per-frame models make hair/clothing edges flicker.
  - A binary MediaPipe mask "would remove hair strands, fingers, and translucent clothing", so it is used there only as a soft gate under MODNet's alpha.
  - Optical flow (Farneback) warps the previous mask between model anchors.
  - Low hair/background contrast and motion blur remain hard.
  - No numbers given. https://dev.to/martindelophy/building-stable-video-portrait-outlines-in-the-browser-with-modnet-slimsam-mediapipe-and-optical-bh9
- Vision `accurate` adds "matting refinement" over `balanced` (§7), so only `accurate` claims a soft matte. ⚠️ Whether the `fast`/`balanced` masks are soft or near-binary is not stated.

## §10 DJ booth scenario (camera faces the DJ behind the decks)
- **Distance:**
  - MediaPipe Selfie's intended use is "selfie effects and video conferencing, where the person is close (< 2m) to the camera". https://github.com/tensorflow/tfjs-models/blob/master/body-segmentation/README.md
  - Vision wants each person "at least half the image height" and lists "people at a far distance" as ambiguous (WWDC21, §7).
  - TD/Maxine: "tuned for a single person sitting in front of a webcam. Videos including full body images, multiple people or indirect camera angles may not perform well" (donor NVIDIA_Background_TOP.htm).
- **Occlusion by gear / hands on decks:**
  - Vision: up to 4 people, "natural occlusions" allowed (WWDC21).
  - MediaPipe multiclass splits background / hair / body-skin / face-skin / clothes / others (accessories). Headphones would fall in "others" (⚠️ inferred from the class list; no test). https://developers.google.com/edge/mediapipe/solutions/vision/image_segmenter
  - Fingers and hair are where binary masks lose detail (§9).
  - TD's Maxine op has a "Chair Segment: foreground/background" switch, i.e. the vendor treats attached furniture as a known ambiguity (donor doc).
- **Pictures of people:** Vision lists "statues, pictures of people" as ambiguous (WWDC21). ⚠️ An LED wall or screen behind the DJ showing a person, including our own output, falls in that class. Untested.
- **More than one person** (B2B DJs, crowd edge): Vision returns one mask for all people (or per-instance on macOS 14+). MediaPipe Selfie "segments the prominent humans" (tfjs body-segmentation README).
- **Lighting:** strobes, colour washes and haze are unevaluated for every candidate (§2). Studio Light (path C) dims the background and lights the face, but only on built-in or Continuity cameras (§8).
- **Framing:** Center Stage (Continuity iPhone 11+) or the W3C `faceFraming` constraint (status unchecked) crop to the face at the source. Vision face/human rectangles give the boxes for a crop of our own (§7).
- implication: a wide shot of a standing DJ behind gear is outside the documented sweet spot of all three model families, so the acceptance clip (§4.2) is the only real evidence.
