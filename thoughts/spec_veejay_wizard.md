# VeeJay Wizard — Pilot Spec

## TL;DR
- Browser pilot (Vite + React + TypeScript, Chrome-first, localhost only) that listens to a live music source and renders reactive visuals fullscreen.
- Inputs: an audio device (DJ console master → USB sound card line-in) and drag-and-drop local files. Analysis: spectrum bands, bass, onsets, BPM.
- Visuals: own WebGL2 engine (4 scenes) in one autopiloted playlist with keyboard override. Live recording to file. MilkDrop/Butterchurn is the next step after the pilot (user, 2026-10-27, session 3).
- Next stages: effect editor → camera scene (person cut-out + filters) → clip mixer; desktop app via Electron later.

## Freshness
- Authored 2026-10-27 from a `/grill-me` session (5 rounds). Every decision below was confirmed by the user, except items marked `⚠️ Assumption`.
- Facts cited from `agents/research/_adhoc/audio_capture_feasibility_2026-10-27.md` (§1–§6).
- Target machine at authoring time: MacBook Air M4, 16 GB, 2880×1864 Retina, fanless, macOS 26.6.

## §1 Product goal
Plug in any music, and the visualization runs on its own: no setup ritual, a calm, uncluttered UI ("not Resolume"), buttery-smooth output. Personal pilot that explores what our own engine can do, side by side with MilkDrop.

Usage: a separate DJ console plays music. Its master out goes into the line-in of a USB sound card on the Mac. Visuals render in the browser window or fullscreen on whatever display the window sits on. A second-screen or control-window split is not required.

## §2 Pilot scope (stage 1)

### §2.1 Audio input
- **Device input**: `getUserMedia` + device picker (`enumerateDevices`). Labels and IDs are only available after the user grants permission (research §1). Request with echo cancellation, noise suppression and auto gain control all off, in stereo. Loopback drivers (BlackHole) appear as ordinary devices and work without extra code.
- Line-in only in the pilot. No sync input (MIDI Clock/Link), per the user in session 3. The user's rig: rekordbox, sometimes a Pioneer controller over USB line-in.
- Channels: take stereo 1–2 of the selected device. No channel-pair selection. Channel count does not prove routing, so verify with `track.getSettings()` plus a test tone on each hardware input (acceptance check).
- **Local file**: drag-and-drop any format the browser decodes (mp3/wav/flac). The file plays through the speakers and feeds analysis.
- Out of scope: tab audio, system-audio capture, network streams (research §2–§4).

### §2.2 Audio analysis (minimum feature set)
Three separate tasks, with separate requirements and possibly separate implementations (user, session 3). Exposed to every scene every frame:
- **(a) Energy**: spectrum bands (count chosen in design), plus bass/mid/treble with auto-gain. Bass swells objects, highs add sparks.
- **(b) Onsets**: drum-attack events, timestamped in audio time. Low latency matters most; false positives are tolerated. Drives flashes/hits.
- **(c) Tempo + phase**: BPM estimate plus continuous beat/bar phase and a confidence value. Drives pulses between beats and the autopilot.
  - It is a **bonus that does not block the pilot** (user, session 3).
  - Robustness: hold tempo through short breaks; manual Tap, ×2/÷2 and phase nudge; smooth fallback to energy-only reaction when the rhythm is lost (e.g. two tracks overlapping in a mix).
- (a)+(b) alone must make a good visualizer.

Latency: the FFT window and smoothing dominate the lag, not capture (research §6). `⚠️ Assumption`: target audio→visual lag ≤ ~50 ms; design validates.

### §2.3 Own engine — scenes
The engine is WebGL2-based (library chosen in design, §5). The pilot ships one scene per type:
1. **Shader abstraction**: tunnels, fractals, fluids.
2. **Styled spectrum**: bars, rings or waves with glow, reflections and smooth motion.
3. **GPU particles**: thousands of points that burst on beats and breathe with the bass.
4. **Pixels/glitch**: pixel art, fragmentation, digital glitches on hits.

Scene parameters are tuned in code; the pilot has no editor. The design must leave room for the stage-2 editor to expose scene parameters, but the pilot builds no editor scaffolding.

### §2.4 MilkDrop: deferred to the next step
Moved out of the pilot (user, 2026-10-27, session 3), see §4. The pilot must not block adding a second engine later; research is in `research_donor_milkdrop.md`.

### §2.5 Playlist & autopilot
- The playlist holds the 4 own scenes.
- Autopilot is on by default. `⚠️ Assumption`: with a confident phase it switches every 16 bars on a bar line with a ~1-bar transition; otherwise it switches on time.
- Keyboard override (§2.6). Lock holds the current scene.

### §2.6 UI & controls
- Fullscreen canvas. A minimal overlay appears on mouse move and auto-hides after ~2–3 s. It shows: source picker (device/file), REC, current scene name, BPM, lock, quality mode.
- `⚠️ Assumption` keys: `←/→` prev/next, `Space` lock, `F` fullscreen, `R` record, `Q` cycle quality mode.
- `⚠️ Assumption`: last device and quality mode persist in `localStorage`.

### §2.7 Recording
- REC records the live output, i.e. the final canvas stream + audio track; the React overlay is not recorded, in real time via `MediaRecorder`, then downloads the file on stop.
- `⚠️ Assumption`: container/codec is whatever Chrome provides (WebM expected), at the current render resolution.
- No offline frame-by-frame render.

### §2.8 Performance & quality modes
User-switchable modes:
- **60 adaptive** (default): internal render ≈ half-Retina (~1440×932), upscaled. Resolution drops dynamically to protect 60 fps.
- **60 full**: full Retina resolution.
- **30**: 30 fps cap.

Goal: in the default mode, 60 fps without drops for 30+ min on the target machine (fanless, so it throttles under sustained GPU load).

## §3 Non-goals (pilot)
MilkDrop/Butterchurn (next step), effect editor, camera, clip mixer, tab/system/network audio, desktop shell, second-screen/control-window split, MIDI, accounts/backend/server, deployment, Safari/Firefox parity, offline render.

## §4 Roadmap
- **Next step: MilkDrop.** 20–30 curated Butterchurn presets in the shared playlist, plus compositing both engines into one recorded canvas. Facts are in `research_donor_milkdrop.md`.
- **Later: sync from the rig.** rekordbox MIDI Clock / Link as a tempo+beat source; the bar line still needs alignment. Research is pending.
- **Stage 2a — Many effects** (layers, effect chains, audio bindings, ISF/Shadertoy/own): see `thoughts/spec_effects.md` (grilled 2026-10-28).
- **Stage 2c — Genre-aware audio reactivity** (kick/snare/hats, sub/reese/wobble, build/drop, custom bands, genre presets, Auto-style mode): see `thoughts/spec_audio_reactivity.md` (grilled 2026-10-28).
- **Stage 2b — Effect editor**: browse shaders, bars, pixels and other building blocks, pick and keep the ones you like, build presets. Calm UI, React. Details to be settled in a dedicated grill before design.
- **Stage 3 — Camera scene**: camera/capture device as video input, person segmentation (cut the person out), filters on the person (negative, etc.), composited into the graphics. Needs an ML segmentation model (`⚠️` MediaPipe or similar, to be chosen in research).
- **Stage 4 — Clip mixer** (`⚠️ Assumption` on placement): video-loop layers, the third leg of the hybrid.
- **Desktop app** (later, sequencing TBD): Electron, Mac + Windows. Same Chromium, so the pilot code runs as-is. Adds system-audio capture on macOS 14.2+ (research §5). Tauri is rejected because WebKit on macOS gives mono audio and keeps noise suppression on (research §1).

## §5 Stack (locked)
- **Platform**: browser web app, localhost only (DEV ONLY). Chrome latest stable on macOS is the primary target; Safari and Firefox are best-effort (Safari: mono, cannot disable noise suppression or auto gain — research §1).
- **Build/UI**: Vite + React + TypeScript.
- **Audio**: Web Audio API. Choosing `AnalyserNode` vs `AudioWorklet` for feature extraction is a design decision.
- **Render**: WebGL2. The library (raw WebGL2 / twgl / regl / OGL / three.js / PixiJS) is chosen in design. WebGPU only if the designer justifies it.
- **MilkDrop** (next step, not pilot): Butterchurn.
- **Recording**: `MediaRecorder` + `canvas.captureStream()`.
- **Quality gates**: ESLint, `tsc --noEmit`, Vitest (analysis logic at minimum).
- **Later desktop**: Electron.

## §6 Licensing & donor policy
- Project license: MIT. Personal project; open source unlikely (user, 2026-10-27, session 3). No commercial plans.
- Libraries/dependencies: **any license allowed**, including GPL/AGPL/LGPL/NC/unknown and MilkDrop presets (user decision 2026-10-27, session 3). Prefer permissive when options are otherwise equal. Record every dependency's license (plan step + research).
- Shaders: during the personal phase, porting shaders under any license is allowed (incl. Shadertoy default CC BY-NC-SA). Every ported shader file carries a header with original author, URL and license.
- **Pre-open-source / distribution gate** (only if that ever happens): audit ported shaders, presets and copyleft dependencies; replace or comply.

## §7 Pilot acceptance criteria
1. USB sound card with the DJ console master on line-in appears in the source picker in Chrome. Visuals react to it. File drag-and-drop also works.
2. Analysis exposes (a) energy bands and (b) timestamped onsets. Audio→visual lag is measured on the real rig; ≤50 ms is a `⚠️` hypothesis, since capture, processing, frame wait and display all add.
   - Bonus, non-blocking: (c) tempo + phase. Measured separately: tempo accuracy (`⚠️` ±1 BPM in ~10 s on steady 4/4), visual-pulse offset vs the real beat (ms), and recovery time after a transition. 1 BPM uncorrected is about 1 beat of drift per minute, so phase needs continuous correction.
3. Playlist contains all 4 own scenes. Autopilot switches smoothly, on bar lines when the phase is confident, otherwise on time. All keys work.
4. REC produces a playable file with picture and sound.
5. 60 adaptive holds 60 fps for 30 min on the target machine. 60 full and 30 are selectable.
6. ESLint, typecheck and Vitest pass. The user verifies locally.

## §8 Open questions & risks (for research/design)
- Butterchurn: answered in `research_donor_milkdrop.md`; relevant at the next step.
- Render library choice; dynamic-resolution technique; keeping the render loop outside React re-renders.
- Beat/onset/BPM approach: an existing library (any license, §6) vs our own (spectral flux + tempo estimation), and the latency each adds.
- Interfaces with >2 inputs: if the console's line-in lands on channels 3–4, the pilot can't reach it (channel selection is deferred). `⚠️` Chrome's multichannel `getUserMedia` behaviour is unverified.
- `MediaRecorder` codecs available in current Chrome. `⚠️` unverified.
- Thermal throttling of the fanless M4 under sustained WebGL load. `⚠️` unverified.
