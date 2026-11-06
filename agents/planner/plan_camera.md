# Plan — Stage 3: camera scene (Variant B: segmentation worker + layer mask)

## TL;DR
- 4 CPs / 15 coder steps + 1 probe ruling (R0) + 6 USER sub-steps. CP0 = the `?camprobe` probe on both machines (M4 + Windows PC) → a system-designer ruling (model, delegate, host, ALIGN, `RECYCLE`, gate knobs). CP1 = camera source, mask math, `native/camera`, picker, `LayerDoc.mask`. CP2 = outline + negative + 3 starred built-ins + licences. CP3 = framing (optional, after CP2).
- Everything model-specific sits behind one interface: the `ToWorker`/`FromWorker` messages (design § Variant B). The ruling changes only `segment.worker.ts` (which model functions survive, the delegate) and the host flag in `camera.ts`; natives, the mask field, looks and scenes never see the model.
- Stand-in before the user's clip: a `synthetic` worker model (a deterministic ellipse with scripted strobe/flood frames) for every plumbing check; a real person comes from the FaceTime camera or a 20 s Photo Booth selfie (U0.0). No third-party clips; the DJ clip lives in `scratchpad/cam/`, outside the product tree.
- Pure TS gets Vitest: cover-fit and framing math (`camera/xf.ts`), stats/downsample/quantize/gate/presence (`camera/smooth.ts`), probe metrics (`camera/metrics.ts`), the `mask` parse and the `setMask` inverse.

## Freshness
- 2026-11-05, planner (Fable 5.1). Inputs: `design_camera.md` L1–37, L38–142 (D1–D10), L181–241 (Variant B), L287–403 (probe, CPs, G1–G10, decisions); `thoughts/spec_camera.md` §2–§4; `plan_td_look.md` L15–26 (conventions); `CLAUDE.md` § Lead workflow #11, § Constraints; `STATE.md` HEAD L122–128. Code facts read by symbol: `audio/input.ts` (`listDevices`/`allowDevices`/`selectDevice`), `gl/scene.ts` (`Native`, `NativeDef`), `gl/live.ts` (`BLENDS`, `uOpacity`, `direct`, `setBlend` at 4 sites), `doc.ts` (`LayerDoc`, `parseScene`), `edit.ts` (`setBlend`), `fx/catalog.ts` (natives registry), `bind.ts` (`SOURCE_IDS`), `main.tsx` (`?bench` hook), `app.ts` (`frame`, `src.build`, exports), `fx/isf.test.ts` (`NEW_OWN`), `scratchpad/td/cp3-close.mjs`, `scratchpad/real/run.mjs`.
- Stale when: the probe ruling lands (re-read `design_camera.md` § Ruling before S1.1), or `live.ts`'s composite changes under 2b.

## Chosen variant
`agents/system-designer/design_camera.md` § Variant B (L181–241), lead pick 2026-11-05 with all 10 defaults (L379–389): mask as `LayerDoc.mask`; ALIGN on (the image waits for its mask); RVM in the probe if it wires in its box; the worker is recycled every 30 min, start-before-stop; no camera → built-ins keep their TD layer; a saved camera reopens at Start; the PC serves `npm run build && npm run preview`; PC acceptance at its real output size; framing from the mask box / Pose head, after CP2. Recorded in `agents/STATE.md` HEAD L122.

## Conventions (every step; a step states only what differs)
- **Brief opener, verbatim:** "Invoke the `ponytail` skill (full) before writing code." Then: ~45 min (M ≈60, L ≈75), own worktree with `web/node_modules` symlinked, reads by symbol (files move between steps), ≤ ~3 files, one targeted browser check. The lead merges into `master`, runs the gates and commits (CLAUDE.md #11).
- **Gates:** `cd web && npm run lint && npm run typecheck && npm test`.
- **Dev server:** `npm run dev -- --port 5174`; **restart Vite after ANY `web/src` edit** (worker and WASM caching bite). The lead's server stays on 5173.
- **Worktree isolation:** coder outputs (PNG, JSON, harness `.mjs`) go to the coder's worktree `scratchpad/cam/`; the lead copies them to the main checkout's `scratchpad/cam/`. Harness pattern: `scratchpad/td/cp3-close.mjs` (playwright-core + real Chrome, the `__raf` init script, late = Δ > 1.5× median, `director.setHold`/`setPlaylist`) and `scratchpad/real/run.mjs` (`page.route('**/__track', …)` serves a local file, no base64). Chrome flags for a camera harness: `--use-fake-ui-for-media-stream` (grants permission), `--use-fake-device-for-media-stream` (a fake camera for the device/permission path).
- **Fixtures:** audio `scratchpad/fx_audio/dnb174-arr.wav` (build 23.1 s, drop 34.1 s) and `dubstep140-arr.wav` (build 28.4 s, drop 42.1 s). Video: the user's `scratchpad/cam/booth.mp4` once U0.1 lands; before that the `synthetic` model (S0.2) or `scratchpad/cam/selfie.mov` (U0.0). Never commit a clip.
- **Render-path steps** (S1.3, S1.6, S2.1, S2.3, S3.1): same-session A/B on `?bench` with a non-camera scene (no GPU change for scenes without a mask) + a 60 s late-frame run (`__raf`) at 1728×1117 @2. The per-scene GPU timer is not the truth (STATE: it leaves the last pass unbilled).
- **Bindings** follow the 2d policy (td_look D1; design D5): drums, `sub`, `build`/`drop` direct; the bass class binds `reese`; ⚡ flash-class inputs are 0..1 with binding min 0, listed in `VJW_FLASH` (ISF) or the native def's `flash`, under the shared ≤3/s cap. `hats` drives hue or thin detail only. Defaults live in the file's `VJW_BIND` or the def's `bind`.
- **Header comment, every new `.fs` / native:** `Look: <what>. Credits: <block, licence>`; MediaPipe/RVM credits go to `web/THIRD_PARTY.md`, never into shaders.
- **Screenshots:** `scratchpad/cam/<step>-<what>.png` (worktree), 1728×1117.
- **`[R0]`** tags the parts a step takes from `design_camera.md` § Ruling (written at R0); nothing else decides them. Until R0 lands, design defaults apply and are marked ⚠️.
- **Lead close-out per CP** is listed in its CP block; each ends with a commit on `master` and a STATE line.

## Checkpoints

### CP0 — the probe (`?camprobe`, both machines) → R0 ruling
**Frozen contract** (design § Variant B contracts, D1, D2; files `web/src/camera/segment.worker.ts`, `camera/smooth.ts`, `camera/xf.ts`):
```ts
type ModelId = 'synthetic' | 'selfie' | 'selfie-square' | 'pose-lite' | 'pose-full' | 'multiclass' | 'deeplab' | 'rvm'
type ToWorker = { type: 'init'; model: ModelId; delegate: 'CPU' | 'GPU'; base: string }        // base: self-hosted wasm/model URL
  | { type: 'frame'; id: number; frame: VideoFrame } | { type: 'close' }                         // frame transferred; the worker closes it
type FromWorker = { type: 'ready'; info: string } | { type: 'error'; msg: string }
  | { type: 'mask'; id: number; w: number; h: number; data: Uint8Array; ms: number; stats: MaskStats } // ≤320×180 u8, transferred
interface MaskStats { area: number; cx: number; cy: number; box: [x0: number, y0: number, x1: number, y1: number] } // 0..1 of the mask
type Model = (frame: VideoFrame) => Promise<{ data: Uint8Array | Float32Array; w: number; h: number }> // one function per model, no classes
coverFit(stageW, stageH, camW, camH, mirror: boolean): [sx, sy, ox, oy]   // xf: camUv = stageUv * xf.xy + xf.zw
stats(data: Uint8Array, w, h): MaskStats · downsample(data, w, h, tw, th): Uint8Array · quantize(f32: Float32Array): Uint8Array
```
Probe JSON `camprobe-<os>-<gpu>-<date>.json`: `{ env: { ua, gpu, webgpu, floatRT, cores, deviceMemory, dpr, stage, refresh, camSettings, camCaps, rvfcCaptureTime }, arms: { [arm]: { maskFps: { min1s, med }, inferMs: { p50, p95 }, mainMs: { p95 }, late, frames, scale, initMs, firstMaskMs, align } }, agreement: { [model]: { iou, centroidTexels } }, soak?: { recycle: number | null, perMin: [{ min, maskFps, inferP95, late }] } }`. The sheet: `camprobe-…-sheet.png`, moments × arms.
**Demo:** `npm run dev -- --port 5174` → `localhost:5174/?camprobe` → pick a clip or the FaceTime camera → the stage plays HEAVY with the cut-out person on top; area, box and mask fps in a corner; "Run all" downloads the JSON and the sheet.

### CP1 — mask in the engine
**Frozen contract** (D1–D3, D7, § Variant B contracts; `camera/camera.ts`, `camera/smooth.ts`, `doc.ts`, `edit.ts`, `gl/live.ts`, `bind.ts`):
```ts
export const cam: { tex: WebGLTexture; mask: WebGLTexture; xf: Float32Array; ref: number; stats: MaskStats; live: boolean }
export function tick(now: number): void          // once per rAF in app.ts `frame`, before render(): upload, EMA pass (k = gate), ref, presence
export function use(mask: boolean): () => void   // refcount; segmentation runs only while a mask user is live; the stream stays open while selected
export function listCameras(): Promise<MediaDeviceInfo[]> · allowCameras() · selectCamera(id: string | 'off' | File): Promise<void>
export interface Gate { area: number; held: number }
export function gate(g: Gate, area: number): number   // k: 0 (area > AREA_MAX .6, or a jump > JUMP .5 for ≤ HOLD 6 masks), SLOW .15 after HOLD, else KEEP .85; g.area follows with k
export function presence(area: number): number        // clamp(area / PRESENCE_FULL .08); rests at 0
export type MaskMode = 'person' | 'background'; interface LayerDoc { /* as today */ mask?: MaskMode }
export function setMask(doc: SceneDoc, layer: number, m: MaskMode | undefined): MaskMode | undefined  // returns the old value, the setBlend shape
// live.ts composite: op *= none ? 1 : person ? m : 1 − m; m = smoothstep(.5 − f, .5 + f, texture(uMask, uv * xf.xy + xf.zw).r), f = .15; a masked layer never takes `direct`
// bind.ts: 'presence' ∈ SOURCE_IDS, group 'camera'
```
**Demo:** Start → overlay "Camera…" → FaceTime camera → panel: new layer, gen `native/camera`, Mask: person → you appear cut out over the running scene; Mask: background → the scene shows through you; "Off" → the camera layer goes black and the scene keeps playing; plug a second camera → the list updates and switches live.

### CP2 — looks + scenes
**Frozen contract** (D4, D5; `scenes/camera.ts`, `fx/own/negative.fs`, `scenes/builtin.ts`):
```ts
// native/outline (generator): width px ← sub .05/.4 1.5→4; glow ⚡ ← kick 0/.2 0→1 (def flash: ['glow']); hueStep (bool) ← snare 0/1.5
// own/negative.fs (ISF filter): amount ⚡ ← snare 0/.15 0→1; VJW_FLASH ['amount']
// starred ids: 'builtin:dj-over-tunnel' | 'builtin:dj-inside' | 'builtin:dj-ghost'; L0 carries no mask (the no-camera fallback); every person layer binds opacity ← presence .3/1.5
```
**Demo:** Start with the camera on → the autopilot reaches the three `dj-*` scenes: you over the tunnel with a glowing outline; the swarm inside your silhouette; your ghost trailing, inverted on snares. Camera "Off" → the same scenes keep their TD layer playing, never a black screen.

### CP3 — framing (optional, after CP2)
**Frozen contract** (D9; `camera/xf.ts`):
```ts
export interface Frame { x: number; y: number; zoom: number; vx: number; vy: number; vz: number }
export function frameStep(f: Frame, box: MaskStats['box'] | null, dt: number, aspect: number): Frame  // headroom, zoom 1–2, 5% dead zone, critically damped τ 1 s, clamped; null → drifts home
export function frameXf(f: Frame, cover: [sx, sy, ox, oy]): [sx, sy, ox, oy]   // the crop composed onto coverFit; every consumer samples through xf
```
**Demo:** overlay "Framing" on → walk left and right in front of the camera: the crop follows smoothly, holds while you stand, never shows the frame edge; off → the full cover-fit returns.

## Steps

### CP0
**S0.1 [x] (M) Camera source + texture + the probe page skeleton.** Invoke the `ponytail` skill (full) before writing code.
- Goal: a device or a clip plays in one hidden `<video>` attached to the document; each new frame (`requestVideoFrameCallback`) uploads into `cam.tex`; `?camprobe` draws it cover-fitted over the stage after `render()`. No worker yet.
- Files: new `web/src/camera/camera.ts` (`listCameras`/`allowCameras`/`selectCamera(id | 'off' | File)` mirroring `audio/input.ts` `listDevices`/`allowDevices`/`selectDevice`; constraints `deviceId: {exact}`, ideal 1280×720 at 30; `cam = { tex, w, h, xf }`; upload = `texImage2D` then `texSubImage2D` while the size holds, the `milkdrop/native.ts` `copy` rule; `track.onended` → black); new `web/src/camera/xf.ts` (`coverFit`) + `xf.test.ts`; new `web/src/camprobe.ts` (holds HEAVY via `director.setHold`/`setPlaylist` as `bench.ts` does; `&heavy=<id>`, default `builtin:td-feedback` ⚠️ Assumption, needs confirmation: the lead names HEAVY from `?bench` before S0.3; the overlay runs in its own rAF registered after `app.ts`'s `frame`, which rAF ordering guarantees); one line in `web/src/main.tsx` beside the `bench` hook.
- Behaviour (D1): a clip loops muted from an object URL; upload path A/B `&upload=frame|video` (`new VideoFrame(video)` vs the element), timed per frame; `env` fields collected now (UA, `WEBGL_debug_renderer_info`, WebGPU adapter info, cores, `deviceMemory`, DPR, stage, median rAF Δ, `getSettings`/`getCapabilities`, rVFC `captureTime` presence).
- Tests `xf.test.ts`: 16:9 on 16:9 → identity; a 4:3 camera on a 16:9 stage crops top/bottom symmetrically; mirror flips x only; every stage corner maps inside [0,1].
- Done: gates; browser: the FaceTime camera and a clip both show over HEAVY, env printed; `s0.1-overlay.png`. Depends on: none. Size M.
  - **Changed during implementation:** (2026-11-06, S0.1) The real FaceTime camera was held by another process the whole session (gUM with `deviceId:{exact}` hangs; default gUM resolves but no frames arrive — `cam-quick.mjs` one-liner), so the camera arm was proven on `--use-fake-device-for-media-stream` (1280×720@20, mirror xf applied, `rvfcCaptureTime: true`); the clip arm ran on the generated `test-pattern.webm` (both upload paths). `s0.1.mjs` keeps the real-camera attempt first and re-captures it automatically when the camera is free. Port was 5175 (lead: 5174 kept). TS 6.0's DOM lib types `VideoFrame` without `width`/`height` — the upload passes `displayWidth`/`displayHeight` (spec-identical). `&upload=` default is `video` (the no-allocation path). `__camprobe` also exposes `source` (camSource) for the harness.

**S0.2 [ ] (M/L, 75 min) Segmentation worker: `synthetic` + MediaPipe Selfie CPU, self-hosted.** Invoke the `ponytail` skill (full) before writing code.
- Goal: the worker contract above runs end to end; the overlay shows the cut-out (EMA at a fixed k = `KEEP` .85; the gate comes in S1.1).
- Files: new `web/src/camera/segment.worker.ts` (Vite module worker `new Worker(new URL('./segment.worker.ts', import.meta.url), { type: 'module' })`; models as functions: `synthetic` = an ellipse whose centre drifts on a sine, area ≈ .12, every 90th frame flooded, every 91st empty, no deps; `selfie` = `ImageSegmenter` landscape 144×256 fed `createImageBitmap(frame, {resizeWidth, resizeHeight})`, VIDEO mode with a monotonic stamp, result area-downsampled to ≤320×180 and quantized; one frame in flight; the worker closes every frame); new `web/src/camera/smooth.ts` (`stats`, `downsample`, `quantize`) + `smooth.test.ts`; new `web/scripts/models.mjs` as `postinstall` (`fs.cpSync` of the package's `wasm/` into `web/public/mediapipe/`, the model files from `research_camera.md` §1 into `web/public/models/`; both git-ignored; `FilesetResolver` gets the local base). `camera.ts` gains `uploadMask` + the RG16F ping-pong EMA pass (RGBA8 fallback without `HALF`, D2) and the ALIGN clone (`VideoFrame.clone()`, uploaded when its mask returns, closed after).
- G1 fallback: if MediaPipe refuses the module worker, try a classic worker (`?worker` with `worker.format: 'iife'`); if that fails too, the same module runs on main behind the same messages (design § Variant B risk 1) and the step says so.
- New dep: `@mediapipe/tasks-vision` 1.2.2, Apache-2.0 (design D8); models Apache-2.0, probe copies git-ignored, THIRD_PARTY entry marked probe-only.
- Tests `smooth.test.ts`: `stats` empty → area 0 and an empty box; full → 1 and the full box; one edge pixel → box there, centroid there; `downsample` is area-preserving (a half-filled 4×4 → 2×2 of 128; a 3:2 ratio keeps the total ±1 u8); `quantize` 0→0, 1→255, .5→128, clamps.
- Done: gates; browser: `&model=synthetic` shows the drifting ellipse cut-out with flood/empty frames visible as flashes (the gate is not in yet, expected); `&model=selfie` cuts a person out of the FaceTime camera or `selfie.mov`; DevTools Network shows localhost only; `s0.2-selfie.png`. Depends on: S0.1.

**S0.3 [ ] (M) Probe runner, metrics, exports + harness.** Invoke the `ponytail` skill (full) before writing code.
- Goal: unattended runs of the arms that exist (`base-0`, `base-cam`, `W-synthetic`, `W-selfie-cpu`, ALIGN on/off), the soak mode, the latency clock, JSON + sheet downloads, and a Mac harness.
- Files: `web/src/camprobe.ts` (runner: 60 s per arm, `&arms=a,b`, `&moments=12,35,…` seconds for the sheet, `&soak=<min>` logs per minute, `&recycle=<min>` reserved for S0.4; a big ms clock + a "Latency" button that cycles raw → ALIGN on → ALIGN off and downloads 5 `latency-<mode>-<n>.png` of its own canvas per mode; late frames by `quality.ts`'s rule, imported, and `governor`'s scale at the end); new `web/src/camera/metrics.ts` (`p50`, `p95`, `minWindowFps(ts)`, `iou(a, b)`, `centroidDelta(a, b, w, h)`, `lateCount(deltas)`) + `metrics.test.ts`; new harness `scratchpad/cam/probe.mjs` (clip served via `page.route('**/__clip')`, `&clip=/__clip`, 1728×1117 @2, writes the JSON + sheet to `scratchpad/cam/`; `node probe.mjs <clip> [port=5174] [arms]`).
- Tests `metrics.test.ts`: `p50`/`p95` on known arrays; `minWindowFps` on 30 fps stamps with one 400 ms hole → the hole's window; `iou` identical 1, disjoint 0, half-overlap 1/3; `centroidDelta` of a one-texel shift = 1; `lateCount` matches the `__raf` rule.
- Done: gates; `node scratchpad/cam/probe.mjs scratchpad/cam/selfie.mov` (or the FaceTime camera with the fake-ui flag) produces a JSON with all four arms and a sheet; K1–K3 numbers for `W-selfie-cpu` on the M4 go in the final message. Depends on: S0.2.

**S0.4 [ ] (M/L, 75 min) The remaining arms, agreement, recycle.** Invoke the `ponytail` skill (full) before writing code.
- Goal: every design arm except RVM runs from the same runner: `W-selfie-gpu`, `W-pose-cpu`/`-gpu` (PoseLandmarker lite, `outputSegmentationMasks`, the full frame), `M-cpu` (the main-thread host: the same module behind the same messages, `host: 'main' | 'worker'` in `camera.ts`), `M-same` (Selfie GPU on our `stage` context + a GL state diff before/after, K5), sheet-only `selfie-square`, `multiclass`, `deeplab`, `pose-full`; `agreement` = GPU vs CPU of the same clip frames per model (IoU, centroid Δ in texels, K7); `&recycle=<min>` = a new worker initialised beside the old one, swapped at its first mask, the old one terminated (D2 make-before-break); the soak JSON records `recycle`.
- Files: `web/src/camera/segment.worker.ts`, `web/src/camera/camera.ts`, `web/src/camprobe.ts`. Models via `scripts/models.mjs` (Pose lite 5.8 / full 9.4 MB, git-ignored).
- Tests: none new (no new pure logic; `metrics.test.ts` covers agreement).
- Done: gates; `probe.mjs` on the M4 yields every arm + agreement; a 3-min `&soak=3&recycle=1` shows two swaps with no empty-mask gap (the mask fps per minute never dips below the median); `s0.4-sheet.png`. Depends on: S0.3.

**S0.5 [ ] (M, hard box 60 min) RVM in the worker, or dropped with a log.** Invoke the `ponytail` skill (full) before writing code.
- Goal: `rvm` as one more `Model`: ORT-Web WebGPU with the official fp16 ONNX, recurrent states kept on the GPU via IO binding; if an op is missing (G7), LiteRT.js after `ldenoue/rvm-webgpu` as reference only (no licence file, nothing copied); if neither wires inside the box, the step ends with the error log in `scratchpad/cam/rvm.log` and no code merged.
- Files: new `web/src/camera/rvm.ts` (worker-side), `web/src/camera/segment.worker.ts` (the `rvm` entry), `web/package.json`.
- New deps (probe-only, design D8): `onnxruntime-web` 1.31.1 MIT, or `@litertjs/core` 2.6.0 Apache-2.0; RVM mobilenetv3 weights GPL-3.0 (allowed, recorded, git-ignored). Tests: none (no pure logic).
- Done: gates; `W-rvm` runs 60 s on the M4 and appears in the JSON + sheet, or the drop is logged. Depends on: S0.4.

**U0.0 [ ] USER (optional, 2 min, any time):** record a 20 s selfie clip on the Mac (Photo Booth or QuickTime, 720p or better: you at a desk, hands moving as on decks, one step out of frame and back) → `scratchpad/cam/selfie.mov`. It gives coders a real person before the booth clip exists.
**U0.1 [ ] USER (before R0):** the DJ-booth clip from the show camera at its real position: ≥60 s (2–3 min is better), 1280×720 or 1920×1080 at 30 fps, MP4 (H.264) or WebM → `scratchpad/cam/booth.mp4`; plus `scratchpad/cam/moments.txt`, one `mm:ss` per moment: steady light, low light, strobe on, strobe off, hands on the decks, fast move, someone walking behind, walk-out and back. The probe takes them as `&moments=12,35,…` (seconds).
**U0.2 [ ] USER (after S0.5 is merged; ≈30 min hands-on):** the Windows PC run.
  1. Install Node 20 LTS (≥20.19, nodejs.org) and Google Chrome. Copy `web/` (without `node_modules`) and `booth.mp4` to the PC, e.g. `C:\vjw\web` and `C:\vjw\cam\booth.mp4` (USB stick or a LAN share; the repo has no remote).
  2. PowerShell: `cd C:\vjw\web` · `npm install` (runs `scripts/models.mjs`; internet once) · `npm run build` · `npm run preview` → `http://localhost:4173/` (localhost is a secure context, so the camera works).
  3. Dual-GPU laptop only: Settings → System → Display → Graphics → add Chrome → High performance.
  4. Chrome: `http://localhost:4173/?camprobe&moments=<your seconds>` → pick `C:\vjw\cam\booth.mp4` → "Run all" (≈15 min) → `%USERPROFILE%\Downloads\camprobe-win-<gpu>-<date>.json` + `…-sheet.png`.
  5. `chrome://gpu` → screenshot the top block (GL_RENDERER, feature status) → `chrome-gpu-win.png`.
**U0.3 [ ] USER (same visit; 2 × 75 min unattended):** `http://localhost:4173/?camprobe&soak=75` with the clip; at 0/30/60/75 min open Chrome's Task Manager (Shift+Esc) and note the "Memory footprint" of the tab row and of its "Dedicated Worker" row into `soak-notes.txt`. Then the same with `&soak=75&recycle=30`. Each run downloads `camprobe-soak-*.json`.
**U0.4 [ ] USER (same visit; 10 min):** latency: pick the live show camera in the probe, point it at the monitor showing the probe's big ms clock, press "Latency": the page cycles raw → ALIGN on → ALIGN off and downloads 5 `latency-<mode>-<n>.png` per mode (its own canvas: the clock now, and the clock seen through the camera). Send back everything from U0.2 steps 4–5, U0.3 and U0.4; the lead files it under `scratchpad/cam/pc/`.
**R0 [ ] lead + user → system-designer ruling.** The lead runs the Mac arms (`probe.mjs` on `booth.mp4`, 1728×1117 @2) and the Mac soak (Task Manager notes as in U0.3), collects the PC files, grades K1–K7 per arm per machine (design L321–329; K4 from the latency PNGs' clock digits) and dispatches `system-designer` to append § Ruling to `design_camera.md`: model, runtime, delegate per machine, host, ALIGN, `RECYCLE`, gate knobs (`AREA_MAX`, `JUMP`, `HOLD`, `SLOW`, `PRESENCE_FULL`), HEAVY numbers, or a kill path (design L337–339). CP1 starts after the ruling; S1.5 (model-free) may run before it.
**CP0 close (lead):** both JSONs + sheets + latency PNGs + soak notes in `scratchpad/cam/` and `scratchpad/cam/pc/`; the ruling committed; STATE line with the pick.

### CP1
**S1.1 [ ] (M) Gate + presence (pure) and the `presence` source.** Invoke the `ponytail` skill (full) before writing code.
- Goal: `gate`/`presence` in `smooth.ts` per the CP1 contract with the ruling's knobs `[R0]` (⚠️ design defaults until then); `'presence'` joins `bind.ts` `SOURCE_IDS` with a `camera` group (no Auto-style map touches it, D3); `src.presence = presence(cam.stats.area)` beside `src.build`/`src.drop` in `app.ts` `frame`.
- Files: `web/src/camera/smooth.ts` + `smooth.test.ts`, `web/src/bind.ts` (+ `bind.test.ts` if it asserts group coverage), `web/src/app.ts` (one line).
- Tests (D10): a one-mask flood (area .9) → k 0, `g.area` unchanged; a one-mask vanish → held; `AREA_MAX` holds even after HOLD; a sustained jump enters at SLOW after HOLD masks, then KEEP once settled; an alternating strobe (.1/.9/.1/.9…) never grows `held` past 1, so it is always held; `presence(0) = 0`, `presence(.08) = 1`, `presence(.04) = .5`, clamps above; `g.area` follows with the same k.
- Done: gates; browser: `?camprobe&model=synthetic` now holds through the scripted flood/empty frames (no flash) while the drifting ellipse stays smooth; `s1.1-gate.png` × 2 (a flood frame, the next). Depends on: R0 (knobs; may start on the defaults).

**S1.2 [ ] (M) `tick` in the app loop, the limiter `ref`, `use()`, arm cleanup `[R0]`.** Invoke the `ponytail` skill (full) before writing code.
- Goal: `camera.ts` `tick(now)` called once per rAF in `app.ts` `frame` before `render()` (D1): upload the aligned frame, EMA pass with k from `gate`, the 1×1 `ref` (top-mip mean luma, slow EMA τ ≈ 1 s), presence; `use(mask)` refcount, segmentation only while a mask user is live, the stream open while a camera is selected; the host flag and the surviving model(s) per the ruling `[R0]`: losing arms, probe-only deps and their models deleted, the ruled model committed under `web/public/models/` (≤10 MB) so a checkout runs offline; `RECYCLE` `[R0]` (30 min default) make-before-break in normal use. `camprobe.ts` keeps working on what remains.
- Files: `web/src/camera/camera.ts`, `web/src/camera/segment.worker.ts`, `web/src/app.ts` (the `tick` call).
- Tests: none new (GL and DOM); `smooth.test.ts` pins the math.
- Done: gates; browser: with no mask user the worker posts nothing (DevTools: no `frame` messages); a 3-min `&recycle=1` run swaps twice with no gap; the `__raf` 60 s run on a non-camera scene is unchanged (A/B). Depends on: S1.1, R0.

**S1.3 [ ] (M) `native/camera` generator.** Invoke the `ponytail` skill (full) before writing code.
- Goal: a `NativeDef` (`gl/scene.ts`: `create(gl) → { draw(f, v, src?), dispose }`, a generator, `src` ignored) drawing `cam.tex` through `xf`: inputs `cut` none/person/background (rgb·m, alpha m, black outside), `limit` 0..1 default 1 (rgb × min(1, ref/mean) blended by `limit`; dims, never boosts: the D2 WCAG limiter), `gain` 1. No audio binding (D4: zoom or shake would split image from mask). `create` takes `use(true)`, `dispose` releases (`ponytail:` always segments while live; re-ref on a `cut` change if the worker CPU matters). Layer `res` .5 is the budget lever (D6).
- Files: new `web/src/scenes/camera.ts` (natives file shaped like `scenes/history.ts`), `web/src/fx/catalog.ts` (register beside `rgbaDelay`).
- Tests: the existing catalog/library tests pass (inputs with defaults, no flash inputs). Render path → A/B + 60 s late run.
- Done: gates; browser: panel → new layer, gen `native/camera`, `cut` person over `builtin:light-tunnel`, normal blend: the cut-out person; `cut` none + screen; a torch waved at the camera dims instead of flashing (`limit` 1 vs 0); `s1.3-cut.png`. Depends on: S1.2.

**S1.4 [ ] (S/M) Overlay camera picker, errors, saved device.** Invoke the `ponytail` skill (full) before writing code.
- Goal: beside `'Audio input…'` in `ui/Overlay.tsx`: "Camera… / Allow camera…" → Off / labelled `videoinput` devices / Video file…; `devicechange` refreshes; switching stops the old track before opening the new one; the saved id is stored like the audio device id and reopened at Start (decision 7); errors shown in the overlay, never thrown in the loop (D7): `NotAllowedError` → "Allow the camera in Chrome (the lock icon) and in the OS privacy settings: macOS System Settings → Privacy & Security → Camera; Windows Settings → Privacy & security → Camera" (⚠️ G9: the Windows path is unverified; the user confirms it at the CP2 close), `NotReadableError` → "Camera in use by another app", `onended` → black, presence 0.
- Files: `web/src/ui/Overlay.tsx`, `web/src/camera/camera.ts` (+ the settings file the audio id uses, if separate).
- Tests: none (browser-only, D10).
- Done: gates; browser with `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`: the fake camera lists and plays; without the flags: deny → the message; allow → the FaceTime camera; a second device switches live; reload → the saved camera reopens at Start; `s1.4-picker.png`. Depends on: S1.3.

**S1.5 [ ] (S) `LayerDoc.mask`: parse, `setMask`, inverse.** Invoke the `ponytail` skill (full) before writing code. Model-free: may run before R0.
- Goal: `mask?: MaskMode` on `LayerDoc` (absent = none, so old scenes parse unchanged); `parseScene` accepts `'person' | 'background'` and rejects junk at `${at}.mask`; `edit.ts` `setMask(doc, layer, m)` returns the old value, the `setBlend` shape.
- Files: `web/src/doc.ts`, `web/src/edit.ts`, `web/src/doc.test.ts` + `web/src/edit.test.ts` (a `setMask` row in the inverse table beside `setBlend`).
- Tests: absent → `undefined`; both modes round-trip; `'face'` throws with the path; `setMask` then its inverse restores the doc (the table test).
- Done: gates. Depends on: none.

**S1.6 [ ] (M) Mask in the composite, live mirror, panel select, undo.** Invoke the `ponytail` skill (full) before writing code.
- Goal (§ Variant B contracts): the `live.ts` composite shader gets `uMask`, `uMaskMode` (0/1/2), `uXf`, `uFeather` beside `uOpacity` in `cu`, `op *= …` as in the contract; `direct` adds `&& !l.mask`; `buildLayer` takes `use(true)` for a masked layer, `freeLayer` releases it; `Live.setMask` at the four `setBlend` sites (interface, impl, `op` via `restructure`, undo via `act`); `ui/Panel.tsx` gets `<select aria-label="Mask">` beside Blend. A cut-out over graphics = mask + `cut` none (D4: a cut layer in normal blend darkens the feather to rgb·m²); `cut` stays for add/screen chains.
- Files: `web/src/gl/live.ts`, `web/src/ui/Panel.tsx`.
- Tests: `edit.test.ts` (S1.5) covers the doc side; one `setMask` undo case if `undo.test.ts` enumerates ops. Render path → A/B (unmasked scenes: identical `?bench` readback bytes) + 60 s late run.
- Done: gates; browser: the CP1 demo; all 4 blends with mask person over a TD scene (no double-darkened feather); `s1.6-mask.png` × 2 (person, background). Depends on: S1.5, S1.2.

**CP1 close (lead):** 60 s of `native/camera` + mask person + one TD effect (`builtin:light-tunnel` under it) on `booth.mp4`, 1728×1117 @2: 0 late, 1.00×, mask ≥24 fps in every 1 s window; a device switch; "Off"; `scratchpad/cam/cp1-sheet.png`; commit + STATE.

### CP2
**S2.1 [ ] (S) `native/outline`.** Invoke the `ponytail` skill (full) before writing code.
- Goal: a generator in `scenes/camera.ts` drawing the mask iso-line at a constant px width (`abs(m − .5) / fwidth(m)`) through `xf`, inputs and `bind`/`flash` per the CP2 contract (`hueStep` is a bool input written at y ≥ .5, the td_look rule); `create` takes `use(true)`. Scenes follow it with `own/bloom` (D4).
- Files: `web/src/scenes/camera.ts`, `web/src/fx/catalog.ts`.
- Tests: a `test.each` over the camera natives' defs (every `bind` source ∈ `SOURCE_IDS`; every `flash` input binds from 0), in whichever test already iterates defs (`bind.test.ts` or the catalog test; else a new case in `isf.test.ts` beside `NEW_OWN`). Render path → A/B + 60 s late run.
- Done: gates; browser: outline → bloom in add over `builtin:light-tunnel`; `?debug` on `dnb174-arr`: `width` follows sub, `glow` jumps on kicks only, hue steps on snares; `__flash` ≤3/s; `s2.1-outline.png`. Depends on: S1.6.

**S2.2 [ ] (S) `own/negative.fs`.** Invoke the `ponytail` skill (full) before writing code.
- Goal: an ISF filter, `amount` 0..1 ⚡ in `VJW_FLASH`, `VJW_BIND` `amount ← snare 0/.15 0→1`; usable on any layer; header per conventions (no borrowed code).
- Files: `web/src/fx/own/negative.fs`, `web/src/fx/isf.test.ts` (`NEW_OWN` += `'negative'`).
- Tests: the shared header test (parses; sources ∈ `SOURCE_IDS`; flash inputs bind from 0).
- Done: gates; browser: `negative` appended to a camera layer inverts on snares only (`dubstep140-arr`), ≤3/s; `s2.2-negative.png`. Depends on: none.

**S2.3 [ ] (M) The 3 starred built-ins + `THIRD_PARTY.md`.** Invoke the `ponytail` skill (full) before writing code.
- Goal (D5 table): `builtin:dj-over-tunnel` = L0 tunnel → light-tunnel → radial-blur (their D1 bindings), L1 `native/camera` mask person normal opacity ← presence, L2 outline → bloom add opacity ← presence; `builtin:dj-inside` = L0 spectrum → td-feedback (res .5, opacity .5), L1 swarm mask person normal, L2 outline → bloom add; `builtin:dj-ghost` = L0 tunnel → edge-rings, L1 camera `cut` person → rgba-delay (spread ← reese, rotate ← snare) → negative → bloom, screen, opacity ← presence. An empty mask leaves L0 playing (decision 6). Scene comments state the Auto-style rule as the TD scenes do. `web/THIRD_PARTY.md`: `@mediapipe/tasks-vision` 1.2.2 + the ruled model `[R0]` (Apache-2.0; RVM GPL-3.0 only if ruled in), probe-only entries gone with S1.2; the npm part through `web/scripts/licenses.mjs`'s existing flow.
- Files: `web/src/scenes/builtin.ts`, `web/THIRD_PARTY.md`, `web/src/library.test.ts`.
- Tests: each `builtin:dj-*` parses; its L0 has no `mask`; every masked layer binds `opacity ← presence`; every binding source ∈ `SOURCE_IDS`. Render path → A/B + a 60 s late run over the three scenes (two live rings stay ≤ the existing cap).
- Done: gates; browser: the CP2 demo on `booth.mp4` with `dnb174-arr`, then camera Off → L0 keeps playing; `s2.3-<scene>.png` × 3. Depends on: S2.1, S2.2, S1.6, R0.

**CP2 close (lead; the user on the PC = U2.1):** spec §4.1–§4.5 on both machines: 60 s per `dj-*` scene, 0 late, 1.00× (M4 at 1728×1117; PC at its real output size, decision 9); mask ≥24 fps; ≤100 ms (the probe's latency mode on the PC); a sheet from each machine on `booth.mp4`'s 8 moments; a WCAG luma trace over the clip's strobe section (the `cp3-close.mjs` luma counter: ≤3 flashes in any 1 s); permissions deny → message, allow, switch, Off; DevTools Network localhost-only; gates. **U2.1 [ ] USER:** on the PC, copy the merged `web/` again, `npm install`, `npm run build`, `npm run preview`, open `http://localhost:4173/`, Camera… → the show camera; let the autopilot run the three `dj-*` scenes for 5 min; send one screenshot per scene plus the `?camprobe&arms=base-0,W-<ruled>` JSON; confirm the Windows privacy-settings path shown in the camera error text (S1.4 ⚠️).

### CP3
**S3.1 [ ] (M) Framing from the mask box.** Invoke the `ponytail` skill (full) before writing code.
- Goal: `frameStep`/`frameXf` pure in `xf.ts` per the CP3 contract; `camera.ts` `tick` composes the crop into `xf` while framing is on; the target is `stats.box` (its top ≈ the head) or, if the ruled model is PoseLandmarker `[R0]`, its head landmarks (internal only, no skeleton visuals, spec §3); a "Framing" toggle in the overlay beside Camera…; capture ideal 1920×1080 while on (D1). No face model (decision 10; G10 only if both targets fail).
- Files: `web/src/camera/xf.ts` + `xf.test.ts`, `web/src/camera/camera.ts`, `web/src/ui/Overlay.tsx`.
- Tests: a box move < 5% → no change; a step reaches ≥ .9 of the way after 3τ with no overshoot; zoom clamps 1–2; the crop never leaves [0,1]; the aspect equals the stage's; a `null` box drifts home.
- Done: gates; browser: the CP3 demo; 1080p on; a 60 s late run, 0 late; `s3.1-framing.png` × 2 (left, right). Depends on: CP2 close.

**CP3 close (lead):** the walk test on the live camera, 60 s 0 late with framing on at 1080p; commit + STATE.

## Acceptance mapping (spec_camera §4)
| § | Criterion | Proven by |
|---|---|---|
| 4.1 | camera + mask + 1 TD effect: 0 late over 60 s at 1728×1117; mask ≥24 fps; ≤100 ms | S0.3 K1–K4 per arm (R0 picks an arm passing on both machines) → CP1 close (M4) → CP2 close (both; PC at its real size) |
| 4.2 | the booth clip: no full-frame flicker, continuous silhouette, hands kept; sheets from both machines | S0.3/S0.4 sheet + K6 at R0; S1.1 gate (`AREA_MAX`, strobe hold); CP2 close sheets (U2.1 on the PC) |
| 4.3 | permission flow, device switching, clean no-camera fallback | S1.4 picker + errors; S2.3 L0 fallback; CP1/CP2 close (deny / allow / switch / Off) |
| 4.4 | nothing leaves the machine; models local; licences in `THIRD_PARTY.md` | S0.2 self-hosting; S1.2 committed model; S2.3 `THIRD_PARTY.md`; CP2 close network log |
| 4.5 | gates green; WCAG flash cap | every step's done-check; S1.3 `limit`; S2.1/S2.2 flash inputs from 0 under the cap; CP2 close luma trace |

## Open points folded into steps (design G1–G10; no new research needed)
- G1 (worker) → S0.2 (module → classic → main fallback); G2/G4 (fps, upload costs) → S0.1/S0.3 numbers; G3 (latency, `captureTime`) → S0.1 env + U0.4; G5 (Pose with hidden legs) → S0.4 sheet; G6 (#5428/#6352 in 1.2.2) → S0.4 agreement + U0.3 soak; G7 (RVM ops) → S0.5; G8 (lighting) → U0.1 + K6; G9 (Windows wording) → S1.4 ⚠️ + U2.1; G10 (face detector) → only if S3.1 fails on both targets.
- ⚠️ Assumptions, need confirmation: HEAVY = `builtin:td-feedback` (the lead names it before S0.3); Node ≥ 20.19 on the PC; the `postinstall` copy of the package's `wasm/` serves under `vite preview` as a plain `public/` asset; MediaPipe's WASM needs no cross-origin isolation (if it does, `vite.config.ts` `preview.headers` gets COOP/COEP in S0.2).
- Not planned (spec §4 roadmap, YAGNI): multi-camera, a `motion` source, multi-ghost echo, joint-bilateral upsampling, the low-light pre-pass; each has a named trigger in design D2/D4.

**Count:** 4 CPs; 15 coder steps (CP0 S0.1–S0.5, CP1 S1.1–S1.6, CP2 S2.1–S2.3, CP3 S3.1); 1 ruling (R0); USER: U0.0 (optional), U0.1–U0.4, U2.1.
