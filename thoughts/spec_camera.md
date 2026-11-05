# Spec — Stage 3: camera scene

## TL;DR
- A live camera (USB webcam or capture card via `getUserMedia` video) becomes part of the show. The **person is cut out of the background in real time** (ML segmentation in the browser, local only; the same on Mac and Windows). Effects run on the person and are composited into the graphics.
- The camera is a normal layer **generator** (`native/camera`) and a **mask source** usable by any layer. That covers person over graphics, graphics inside the person and effects only on the person, all in the existing SceneDoc model and audio bindings.
- Written by the lead from recommended answers (user standing instruction: "ставь все реки, не спрашивай"). Every answer is marked `(default)`. Spec §4 of `thoughts/spec_veejay_wizard.md` names this stage.

## Freshness
- 2026-11-05, lead. Inputs: `thoughts/spec_veejay_wizard.md` §4 (Stage 3 camera scene) and §5 (stack), `thoughts/spec_effects.md` §2 (layer model), the Stage 2d TD-look engine (native filters with `src`, history ring, TF points; `agents/planner/plan_td_look.md`).

## §1 Goal
At a DJ set, the DJ on a camera becomes part of the visuals. Their silhouette glows, glitches, trails and pulses with the kick, inside or over the generative scenes.

**The target scenario (user, 2026-11-05):**
- The camera faces **the DJ standing behind the decks**. There is **no green screen**: the background is the room, at some distance.
- The system must find the person (and their face) and cut them out reliably, as well as Apple's camera effects do, but in the browser, so it works on Windows too.

## §2 Scope
- **Input:** one camera at a time, picked like the audio input; resolution ≥ 720p, 30 fps. A capture card (HDMI → USB) counts as a camera `(default)`.
- **Deployment (user, 2026-11-05):** the user DJs from his **Mac**, and the visuals will most likely run on a separate **Windows PC** in Chrome; the camera and audio plug into that PC. The same web app must run **unchanged in Chrome on both Mac and Windows**. Nothing is ported. The Windows PC's GPU is unknown ⚠️ (the probe reports it).
- **Segmentation: pure web, one path for both OSes (user).** The mask is computed in the browser (MediaPipe Tasks ImageSegmenter, ONNX Runtime Web models, …; a research/design pick judged on both machines). **No native helpers:** no Swift, no Electron addon, no OS-specific SDK. OS camera features (macOS Portrait/Backgrounds, Continuity Camera + Center Stage, Windows Studio Effects, NVIDIA Broadcast) need no code: they appear as an ordinary camera device. Never a dependency.
- The mask runs ≥ 24 fps and must not cost the render loop its 60 fps `(default)`.
- **Framing (optional, Center Stage-like):** follow the DJ's face/body with a smooth digital crop, so a wide camera keeps them centred `(default: after the mask works)`.
- **As blocks:**
  - `native/camera` generator (the raw image);
  - a `mask` usable by a layer: show only the person / only the background, with feather;
  - effects on the person: any existing fx through the layer chain, plus 2–3 new looks: negative, outline glow, trails via the history ring `(default)`.
- **Scenes:** 3 starred built-ins: person over a TD scene, a TD scene inside the silhouette, the person as a glitch/trail sprite `(default)`.
- **Audio:** every new param binds the 2c sources per the 2d policy (drums, sub, build/drop direct; the bass class via `reese`).
- **Stage lighting:** dark rooms, strobes and coloured light are the normal case, so the mask must degrade gracefully (temporal smoothing, never flash the whole frame).

## §3 Non-goals
Native helpers / OS-specific SDKs, multi-camera, hand landmarks, depth cameras, pose skeletons, NDI/network video, recording the raw camera separately `(default; later)`. Face *detection* for framing is in scope (§2); face *effects* (masks, landmarks) are not.

## §4 Acceptance
1. A scene with the camera + mask + one TD effect holds 60 fps at 1728×1117 (0 late frames over 60 s). The mask runs ≥ 24 fps with ≤ 100 ms camera-to-screen latency.
2. Mask quality on **real footage of a DJ behind decks** (the user records a clip in his setup: room background, low light, strobe): no full-frame flicker, a continuous silhouette, hands on the decks kept. The lead reviews a screenshot sheet from both the Mac and the Windows PC.
3. Camera permission flow and device switching work. No camera means the scene falls back cleanly (black, no errors).
4. Privacy: nothing leaves the machine. Model files are bundled or cached locally, and their licences are recorded in `web/THIRD_PARTY.md`.
5. Gates green; WCAG flash cap holds.

## §5 Open questions (for research/design)
- Which segmentation model + runtime (WebGL/WebGPU/WASM): latency, quality in low light, licence, size, main thread vs worker? It must run on Windows too, across NVIDIA, AMD and Intel/integrated GPUs.
- How the mask reaches the GL engine: texture upload per frame, `VideoFrame`, and the cost?
- Mask as a layer property vs a dedicated fx node vs a source the binding system can read (e.g. `presence` = person area)?
- Temporal smoothing and the strobe case.
- How REC records the composite (it already records the stage canvas).
