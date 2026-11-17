# Backlog — VeeJay Wizard (user-facing features)

## TL;DR
- The user's feature backlog, owned by the lead. **Order set by the user 2026-11-16** (§ Order); the sections below hold the item details.
- Sources: the TouchDesigner gap list (lead, 2026-11-16, checked against the code), the user's requests of 2026-11-16 (track recognition, Rekordbox capture), earlier queued items.
- Debt from fast ships lives in `agents/hardening.md`, not here.

## Freshness
- 2026-11-16, lead. Code facts: no `requestMIDIAccess` in `web/src`; video only from the camera (`camera/camera.ts`); `MediaRecorder` in `recorder.ts`; LFO sources exist (`bind.ts`); 13 transitions (`editor/blocks.ts:23`); engine = WebGL2 + twgl.js 7 + Butterchurn 3 beta 5, 100 % TypeScript.

## Order (user 2026-11-16, voice message; transcription read by the lead)
1. **MilkDrop on our audio system** (running; `sync` knob keeps the old path open for quick rework).
2. **New MilkDrop presets.**
3. **Audio in: line-in = the same signal decoding as the file** (§ Audio input).
4. **WebGPU: millions of particles, fluids.**
5. **3D on Three.js: models incl. animals, chrome reflections.**
6. **Text layer** — just a text layer.
7. **MIDI controller** — basic, without extras. ⚠️ Assumption, needs confirmation: the transcription reads «мобиль»; the lead reads it as MIDI (the first item of the gap list).
8. **Video files as a source.**
9. **Set list / timeline** — lay the groundwork only («закладываем»).
10. **Rekordbox audio capture** — the last stage.
- **Dropped for now:** output to other apps (Syphon / Spout / NDI) — «в пизду их пока»; multi-screen / mapping and OSC (not named, parked with it). More transitions: not named, parked.
- Not in the order, queued separately: the audio player (file transport), the animals rework (the user writes the tasks), shaders from the user's next project.

## Queued (user asked earlier)
- **Audio player for the file input** (Tier 2): scrub bar, play/pause, ±10 s on the existing `new Audio()` (`audio/input.ts:70`); beat grid and drop state survive a seek.
- **Animals scene rework:** the user dislikes the current look («было круче, силуэты животных»); he writes the tasks later.
- **Shaders from the user's next project** (name pending, user 2026-11-16).
- **Donor scene port, the rest** (user 2026-11-17: «с портом сцен закончим позже — в бэклог … пусть эти закончат»): the running lanes B1a / B1b / B2b and adapter step 2 finish; then PARKED: batch B3 (18 scenes, needs IMAGES) and B4 (25, needs the media stub / spectrum), plus anything a running lane skips. Guide: `agents/research/_adhoc/syn_porting_2026-11-17.md`. Also: alone p95 rerun of every starred syn scene; THIRD_PARTY syn table (`node scripts/shaders.mjs`).
- **Scene groups + a group browser** (user 2026-11-17, voice): split all scenes into groups; the user picks the groups; add a switcher («листалка») that pages through the scenes of a chosen group in the UI; the autopilot plays inside the chosen group. Frontend work (`frontend-coder`). ⚠️ Assumption, needs confirmation: the transcription reads «разнести по группе все спектры»; the lead reads «спектры» as all scenes / effects, not only the spectrum scenes.

## TouchDesigner gaps (user 2026-11-16: «добавляем всё это в backlog»)
- **MIDI controller:** Web MIDI learn mode: map knobs / faders / pads to any param, scene switch, strobe / flash trigger, tap tempo.
- **Video files as a source:** mp4 / webm loops as a layer generator (VJ clips), a clip library, audio-reactive speed / scrub.
- **Text layer:** DJ name, track title, custom text; fonts, outline / glow, audio-reactive scale and glitch.
- **3D scene type (Three.js):** GLTF models (e.g. animal silhouettes), PBR / chrome / glass materials, environment maps, instancing, Three.js post; renders into our compositor as one more layer type.
- **WebGPU compute:** millions of particles, fluids, physics on the GPU (Chrome supports WebGPU).
- **Output to other apps:** Syphon (Mac), Spout (Windows), NDI — needs the Electron build.
- **Multi-screen / projection mapping:** a second output window, corner-pin, masks.
- **Set list / timeline:** a cue list of scenes per set, tempo-locked switches, saved sets.
- **More transitions** (13 today): tempo-synced wipes, glitch cuts, feedback dissolves, displacement.
- **OSC control:** from other apps / tablets (Electron or a local WebSocket bridge).

## Audio input (user 2026-11-16)
- **Audio clocks + source mute** (user 2026-11-17, voice): «звуковые часы давай как опционально к себе добавим … чтобы эта штука была динамичная в настройке: отключаем воздействие на бас, и перестаёт всё движение в той области, где раньше двигалось на бас». Two parts: (a) a `clock` binding mode for any float input: value = ∫ (base + k·source) dt (the donor's audio clocks, dsp P5); (b) a global per-source mute / gain in the Sources tab, applied before bindings and clocks → muting `bass` freezes every bass-clocked motion and zeroes bass bindings. Route: after the synScene adapter (its reusable clock evaluator) and P1 (`subBody`, so bass clocks integrate the body level) merge; Tier 2.
- **Audio analysis view + the formula review** (user 2026-11-17, voice): «нет понимания, правильно ли у нас распарсивается … раньше было лучше». Technical tools that show what the system hears in a track: kick, reese, bass, sub, rhythm (tempo, beat, bar), dynamics (build, drop, energy), over time; and a check whether the analysis formula is right («не хватает какой-то правильной формулы, визуал по ней немножечко криво работает»). First step: audio-dsp formula review vs the donor `visual_system_2` DSP (2026-11-17).
- **Line-in analysis = the same as the file** (user 2026-11-16, corrected: NOT Shazam, no title / artist): the line-in stream is decoded into our signals — kick, snare, hats, sub, reese, mid-bass, bass, build, drop — as well as a file is, and the scene shows them the same way. Check on a real line-in from the controller: input gain / auto-level, latency, detector floors on a live mix (the file path reads ahead, the line-in cannot), and that the genre preset locks. Facts: both inputs share the detectors; the line-in path adds `baseLatency + outputLatency` and reads features at `Infinity` (`app.ts:91`, `app.ts:288`). Optional: a live meter strip (kick / snare / hats / sub / reese / mid / drop) in the HUD so the DJ sees what the app hears.
- **Rekordbox output capture on the same computer:** when the user plays from a controller in Rekordbox on the machine that runs VeeJay Wizard, take Rekordbox's master (or one channel) as our input: (a) pick the controller's audio-interface channels in our device list (Rekordbox output routing / REC OUT); (b) a virtual loopback (BlackHole on Mac, VB-Cable on Windows) when the sound goes only to the controller; (c) optional: Rekordbox track metadata, BPM, beat grid and key for a tighter sync. ⚠️ Assumption, needs confirmation: which routes Rekordbox exposes in controller mode (research first: Rekordbox audio settings, MIDI clock / Pro DJ Link, per-app capture in Electron).
