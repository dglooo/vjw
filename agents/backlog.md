# Backlog — VeeJay Wizard (user-facing features)

## TL;DR
- The user's feature backlog, one item per line, owned by the lead. Not ordered yet: the user sets the order.
- Sources: the TouchDesigner gap list (lead, 2026-11-16, checked against the code), the user's requests of 2026-11-16 (track recognition, Rekordbox capture), earlier queued items.
- Debt from fast ships lives in `agents/hardening.md`, not here.

## Freshness
- 2026-11-16, lead. Code facts: no `requestMIDIAccess` in `web/src`; video only from the camera (`camera/camera.ts`); `MediaRecorder` in `recorder.ts`; LFO sources exist (`bind.ts`); 13 transitions (`editor/blocks.ts:23`); engine = WebGL2 + twgl.js 7 + Butterchurn 3 beta 5, 100 % TypeScript.

## Queued (user asked earlier)
- **Audio player for the file input** (Tier 2): scrub bar, play/pause, ±10 s on the existing `new Audio()` (`audio/input.ts:70`); beat grid and drop state survive a seek.
- **Animals scene rework:** the user dislikes the current look («было круче, силуэты животных»); he writes the tasks later.
- **Shaders from the user's next project** (name pending, user 2026-11-16).

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
- **Track recognition on the line-in:** identify the playing track by its sound (audio fingerprint, Shazam-style) → title / artist (+ genre, BPM, key where the service gives them) → show it in the text layer, let the autopilot pick scenes by genre. ⚠️ Assumption, needs confirmation: the provider (ACRCloud / AudD / Shazam API / AcoustID + Chromaprint). Any provider receives audio fingerprints over the internet → the user approves the provider before the build.
- **Rekordbox output capture on the same computer:** when the user plays from a controller in Rekordbox on the machine that runs VeeJay Wizard, take Rekordbox's master (or one channel) as our input: (a) pick the controller's audio-interface channels in our device list (Rekordbox output routing / REC OUT); (b) a virtual loopback (BlackHole on Mac, VB-Cable on Windows) when the sound goes only to the controller; (c) optional: Rekordbox track metadata, BPM, beat grid and key for a tighter sync. ⚠️ Assumption, needs confirmation: which routes Rekordbox exposes in controller mode (research first: Rekordbox audio settings, MIDI clock / Pro DJ Link, per-app capture in Electron).
