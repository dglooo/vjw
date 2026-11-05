# Spec — Stage 3: camera scene

## TL;DR
- A live camera (USB webcam or capture card via `getUserMedia` video) becomes part of the show. The **person is cut out of the background in real time** (ML segmentation, in the browser, local only). Effects run on the person and are composited into the graphics.
- The camera is a normal layer **generator** (`native/camera`) and a **mask source** usable by any layer. That covers person over graphics, graphics inside the person and effects only on the person, all in the existing SceneDoc model and audio bindings.
- Written by the lead from recommended answers (user standing instruction: "ставь все реки, не спрашивай"). Every answer is marked `(default)`. Spec §4 of `thoughts/spec_veejay_wizard.md` names this stage.

## Freshness
- 2026-11-05, lead. Inputs: `thoughts/spec_veejay_wizard.md` §4 (Stage 3 camera scene) and §5 (stack), `thoughts/spec_effects.md` §2 (layer model), the Stage 2d TD-look engine (native filters with `src`, history ring, TF points; `agents/planner/plan_td_look.md`).

## §1 Goal
At a DJ set, the DJ on a camera becomes part of the visuals. Their silhouette glows, glitches, trails and pulses with the kick, inside or over the generative scenes.

**The target scenario (user, 2026-11-05):**
- The camera faces **the DJ standing behind the decks**. There is **no green screen**: the background is the room, at some distance.
- The system must find the person (and their face) and cut them out reliably, the way Apple's camera effects find a face and separate the person.
- The user will **experiment with native camera paths**: a camera plugged in natively, Apple's own person segmentation, possibly an iPhone as the camera.

## §2 Scope
- **Input:** one camera at a time, picked like the audio input; resolution ≥ 720p, 30 fps. A capture card (HDMI → USB) counts as a camera `(default)`.
- **Segmentation: three paths to research and try, with the design picking the default and keeping the others pluggable:**
  - **A. In-browser ML:** MediaPipe Tasks ImageSegmenter / Selfie, ONNX Runtime Web + RVM/MODNet, etc. Works today in Chrome; local, no upload.
  - **B. Apple native:** the macOS Vision framework person segmentation (`VNGeneratePersonSegmentationRequest`, Neural Engine), plus face detection for framing. It runs in a small local native helper (Swift) that streams the mask/frames to the web app, or in an Electron native addon later.
  - **C. Apple system camera features, zero code:** macOS video effects (Portrait background blur / replacement, Studio Light, available to any app including Chrome), and Continuity Camera (iPhone as a webcam) with Center Stage (keeps the face framed). These are useful as an input path and as a quality baseline.
- The mask runs ≥ 24 fps and must not cost the render loop its 60 fps `(default)`. Path A is the first build because it needs no native code; B and C are experiment steps with the user `(default)`.
- **Framing (optional, Center Stage-like):** follow the DJ's face/body with a smooth digital crop, so a wide camera keeps them centred `(default: after the mask works)`.
- **As blocks:**
  - `native/camera` generator (the raw image);
  - a `mask` usable by a layer: show only the person / only the background, with feather;
  - effects on the person: any existing fx through the layer chain, plus 2–3 new looks: negative, outline glow, trails via the history ring `(default)`.
- **Scenes:** 3 starred built-ins: person over a TD scene, a TD scene inside the silhouette, the person as a glitch/trail sprite `(default)`.
- **Audio:** every new param binds the 2c sources per the 2d policy (drums, sub, build/drop direct; the bass class via `reese`).
- **Stage lighting:** dark rooms, strobes and coloured light are the normal case, so the mask must degrade gracefully (temporal smoothing, never flash the whole frame).

## §3 Non-goals
Multi-camera, hand landmarks, depth cameras, pose skeletons, NDI/network video, recording the raw camera separately `(default; later)`. Face *detection* for framing is in scope (§2); face *effects* (masks, landmarks) are not.

## §4 Acceptance
1. A scene with the camera + mask + one TD effect holds 60 fps at 1728×1117 (0 late frames over 60 s). The mask runs ≥ 24 fps with ≤ 100 ms camera-to-screen latency.
2. Mask quality on **real footage of a DJ behind decks** (the user records a clip in his setup: room background, low light, strobe): no full-frame flicker, a continuous silhouette, hands on the decks kept. The lead reviews a screenshot sheet comparing paths A/B/C.
3. Camera permission flow and device switching work. No camera means the scene falls back cleanly (black, no errors).
4. Privacy: nothing leaves the machine. Model files are bundled or cached locally, and their licences are recorded in `web/THIRD_PARTY.md`.
5. Gates green; WCAG flash cap holds.

## §5 Open questions (for research/design)
- Which segmentation model + runtime (WebGL/WebGPU/WASM): latency, quality in low light, licence, size, main thread vs worker?
- The native path B: Vision person-segmentation quality levels and fps on an M4; how a Swift helper hands frames/masks to the browser (WebSocket, WebRTC, shared memory, a virtual camera); later, Electron.
- Path C: which macOS video effects reach Chrome's `getUserMedia`, and whether we can get the mask itself or only the processed video.
- How the mask reaches the GL engine: texture upload per frame, `VideoFrame`, and the cost?
- Mask as a layer property vs a dedicated fx node vs a source the binding system can read (e.g. `presence` = person area)?
- Temporal smoothing and the strobe case.
- How REC records the composite (it already records the stage canvas).
