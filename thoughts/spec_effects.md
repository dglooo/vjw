# VeeJay Wizard — Stage 2a Spec: "Many effects" (layers, effect chains, audio bindings)

## TL;DR
- Scenes become **stacks of layers**. Each layer has a generator (our 4 pilot scenes, an ISF generator, an imported Shadertoy shader, or our own) and an **effect chain** (ISF filters + our own). Layers blend with modes and opacity.
- **Any parameter can be bound to sound**: bass/mid/treb, onset, beat or bar phase, or an LFO. Each binding has amount, smoothing and range.
- **Lots of effects fast**: open ISF shaders, gl-transitions for scene transitions, Shadertoy import by pasting code, plus our own effects in four first-wave categories.
- **Control**: a minimal slider panel over the output, mouse and keyboard. New scenes join the autopilot playlist. The full scene-building editor is Stage 2b.

## Freshness
- 2026-10-28. Comes from a `/grilling` session with the user (2 rounds plus a confirmation). Everything was confirmed by the user. The lead's defaults are marked `(default)`. Builds on `thoughts/spec_veejay_wizard.md`, with the pilot code-complete through CP4.
- Research: `agents/research/research_editor_effects.md` (pending at authoring time).

## §1 Goal
The user tested the pilot live ("ахуенно зашло") and wants (1) **many more effects** right away, and (2) eventually to **build their own visualizers and scenes** from blocks. This spec covers (1) and the data model that (2) will edit. Order chosen by the user: effects first, full editor second.

## §2 Scope (Stage 2a)
### §2.1 Scene model
- A scene is an ordered stack of up to 4 layers `(default)`.
- Each layer = one **generator** + an **effect chain** (0..N filters) + a **blend mode** (normal / add / screen / multiply `(default)`) + opacity.
- Generators:
  - the 4 pilot scenes (tunnel, spectrum, particles, glitch);
  - ISF generators;
  - Shadertoy imports;
  - our own.
- Effects: ISF filters + our own (feedback/trails need persistent buffers).
- Scenes are data (JSON), so the Stage 2b editor edits the same model. Built-in scenes are defined in that same data format.

### §2.2 Parameters and audio bindings
- Every generator/effect exposes typed parameters (ISF `INPUTS` style: float, color, bool, point2D…). Each parameter gets a slider/picker automatically.
- Any numeric parameter can be **bound** to a source:
  - bass, mid, treb;
  - one of the spectrum bands;
  - onset (envelope);
  - beat phase, bar phase (from CP5 when confident);
  - LFO (rate, shape).
- A binding has amount, smoothing (attack/release) and an output range.
- A parameter can have one binding `(default)`; several are Stage 2b.

### §2.3 Effect sources
1. **Open shaders**: ISF generators, filters and transitions, plus **gl-transitions** for scene-to-scene transitions. Any license is allowed (spec §6); every ported file keeps an author/URL/license header.
2. **Shadertoy import**: paste the shader code (single-pass `mainImage` first) to make it a generator layer. Fetching by link only if the API allows it (research).
3. **Our own effects**, first wave, all four categories the user picked:
   - trails/feedback, kaleidoscope, mirrors;
   - 3D and geometry (raymarched fractals, fly-throughs, rotating shapes, wave landscapes);
   - liquids and metal (fluid forms, smoke, liquid chrome that bursts on kicks);
   - retro (VHS, CRT, strobe, colour flashes on drops).

### §2.4 Control and UI
- A minimal **scene panel** over the output (auto-hides like the bar):
  - the current scene's layers;
  - each layer's parameters as sliders;
  - binding controls per parameter;
  - add/remove effect from a list;
  - save as a new scene.
- Mouse + keyboard only. **MIDI learn later** (Stage 2b+).
- **Screens**: the user hasn't settled the live setup. Build single-screen (panel over the output, hidden during a set). The architecture must allow moving the output to a separate window or display later, without building it now.
- Library: user scenes are stored in the browser (IndexedDB `(default)`), with export/import to JSON files `(default)`. A star marks scenes for the autopilot playlist `(default)`.

### §2.5 Performance
- Every built-in scene holds the pilot budget: 60A on the M4 with no sustained drops, governor active.
- Imported shaders that blow the budget get scaled down by the governor. The panel shows a per-scene GPU-cost hint `(default)`.

## §3 Non-goals (Stage 2a)
Full drag-and-drop scene-building editor (2b), node graph, formula/expression bindings, MIDI, second-window output, camera (Stage 3), clip mixer (Stage 4), Butterchurn (separate next step, still pending), WebCodecs recorder (backlog).

## §4 Acceptance
1. At least 30 usable effects/generators across the four categories, plus at least 10 gl-transitions, all running in the autopilot without console/GL errors. `⚠️ Assumption` on the counts, to confirm in design.
2. A scene can be built from up to 4 layers with effect chains and blend modes, saved, reloaded and exported/imported as JSON.
3. Any numeric parameter can be bound to an audio source, and the binding is visible in the motion. Bindings survive save/load.
4. Pasting a single-pass Shadertoy shader creates a working generator layer.
5. 60A on the M4 holds with built-in scenes, as in pilot §7.5.
6. Gates (ESLint, tsc, Vitest) pass. Pure logic is tested: bindings math, LFO, scene (de)serialisation, ISF header parsing.

## §5 Open questions (for research/design)
- ISF runtime: the official JS lib vs our own small ISF loader on twgl. Multi-pass/persistent buffers. Rendering into our FBO chain.
- Shadertoy adapter: uniforms mapping (iTime, iResolution, iChannel* ← audio texture?), and multipass later.
- Audio as a texture for shaders (FFT/waveform texture like ISF `audioFFT` / Shadertoy audio channel).
- Persistent buffers per layer (feedback) under the governor's resolution changes.
- How pilot scenes are refactored into "generators" without regressions.
