# Spec — Stage 3: camera scene

## TL;DR
- A live camera (USB webcam or capture card via `getUserMedia` video) becomes part of the show. The **person is cut out of the background in real time** (ML segmentation, in the browser, local only). Effects run on the person and are composited into the graphics.
- The camera is a normal layer **generator** (`native/camera`) and a **mask source** usable by any layer. That covers person over graphics, graphics inside the person and effects only on the person, all in the existing SceneDoc model and audio bindings.
- Written by the lead from recommended answers (user standing instruction: "ставь все реки, не спрашивай"). Every answer is marked `(default)`. Spec §4 of `thoughts/spec_veejay_wizard.md` names this stage.

## Freshness
- 2026-11-05, lead. Inputs: `thoughts/spec_veejay_wizard.md` §4 (Stage 3 camera scene) and §5 (stack), `thoughts/spec_effects.md` §2 (layer model), the Stage 2d TD-look engine (native filters with `src`, history ring, TF points; `agents/planner/plan_td_look.md`).

## §1 Goal
At a DJ set, the DJ (or dancers) on a camera become part of the visuals. Their silhouette glows, glitches, trails and pulses with the kick, inside or over the generative scenes, with no green screen.

## §2 Scope
- **Input:** one camera at a time, picked like the audio input; resolution ≥ 720p, 30 fps. A capture card (HDMI → USB) counts as a camera `(default)`.
- **Segmentation:** real-time person/background mask in the browser, on-device, no upload. The model and runtime are a research + design pick (candidates such as MediaPipe Tasks ImageSegmenter / Selfie, ONNX Runtime Web + RVM/MODNet). The mask runs ≥ 24 fps and must not cost the render loop its 60 fps `(default)`.
- **As blocks:**
  - `native/camera` generator (the raw image);
  - a `mask` usable by a layer: show only the person / only the background, with feather;
  - effects on the person: any existing fx through the layer chain, plus 2–3 new looks: negative, outline glow, trails via the history ring `(default)`.
- **Scenes:** 3 starred built-ins: person over a TD scene, a TD scene inside the silhouette, the person as a glitch/trail sprite `(default)`.
- **Audio:** every new param binds the 2c sources per the 2d policy (drums, sub, build/drop direct; the bass class via `reese`).
- **Stage lighting:** dark rooms, strobes and coloured light are the normal case, so the mask must degrade gracefully (temporal smoothing, never flash the whole frame).

## §3 Non-goals
Multi-camera, face/hand landmarks, depth cameras, pose skeletons, NDI/network video, recording the raw camera separately `(default; later)`.

## §4 Acceptance
1. A scene with the camera + mask + one TD effect holds 60 fps at 1728×1117 (0 late frames over 60 s). The mask runs ≥ 24 fps with ≤ 100 ms camera-to-screen latency.
2. Mask quality on a test clip in low light with a strobe: no full-frame flicker; the silhouette stays continuous (lead review of a screenshot sheet).
3. Camera permission flow and device switching work. No camera means the scene falls back cleanly (black, no errors).
4. Privacy: nothing leaves the machine. Model files are bundled or cached locally, and their licences are recorded in `web/THIRD_PARTY.md`.
5. Gates green; WCAG flash cap holds.

## §5 Open questions (for research/design)
- Which segmentation model + runtime (WebGL/WebGPU/WASM): latency, quality in low light, licence, size, main thread vs worker?
- How the mask reaches the GL engine: texture upload per frame, `VideoFrame`, and the cost?
- Mask as a layer property vs a dedicated fx node vs a source the binding system can read (e.g. `presence` = person area)?
- Temporal smoothing and the strobe case.
- How REC records the composite (it already records the stage canvas).
