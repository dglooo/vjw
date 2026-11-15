# Spec — GPU compute + 3D layer types (backlog priorities 4 and 5)

## TL;DR
- Two new capabilities for the engine, as layer types inside the existing WebGL2 compositor: (4) GPU particles at the scale of a million and fluids; (5) 3D on Three.js: GLTF models (animals included), chrome / glass reflections.
- Tier 3 architecture (CLAUDE.md § Tier 3): new dependency (three), a new layer kind, possibly a second GPU API. No new scenes beyond one demo built-in per capability (user 2026-11-16: «пока никакие сцены не делаем»; scenes come later through Tier S).
- Facts: `agents/research/research_gpu3d.md` (three r187 MIT; only 3D particle fluids strictly need WebGPU; WebGPU → WebGL2 copy cost unmeasured).

## Freshness
- 2026-11-16, lead, session 16. Source: the user's order (`agents/backlog.md` § Order items 4, 5) and the research above.

## §1 The user's words (2026-11-16, voice transcription)
> «WebGPU — миллион частиц, жидкости — добавляем. 3D на Three.js с моделями, в том числе животных, хромовые отражения — добавляем.»

## §2 Scope
- **G1 Particles:** a GPU particle layer, target 1 M particles at 60 fps on the M4 at 1728×1117 (fallback count via the governor), audio-reactive (our sources: kick, snare, hats, sub, reese, build, drop).
- **G2 Fluids:** a fluid layer (2D grid fluid at minimum; 3D particle fluid only if the design proves it affordable), audio-reactive splats / forces.
- **G3 3D models:** load GLTF / GLB (rigged, animated), CC0 animal pack first; audio-driven animation speed, pose, camera.
- **G4 Materials:** chrome (PMREM env map reflections) and glass (transmission) at real-time cost.
- **G5 Integration:** every new layer behaves like any layer: blend, opacity, fx chain after it, bindings, the governor, the recorder, the editor Library, context loss.

## §3 Non-goals
- No new scenes beyond one demo built-in per capability. No Syphon / NDI output. No Electron work.
- No rewrite of the existing engine.

## §4 Acceptance
- **R1** Particle layer: ≥ 1 M particles at billed p95 ≤ 5 ms on the M4 at 1728×1117, or the design states the measured ceiling and the lever.
- **R2** Fluid layer: billed p95 ≤ 4 ms; reacts to kick / drop.
- **R3** GLTF layer: an animated CC0 animal renders with chrome and with glass; billed p95 ≤ 5 ms.
- **R4** Every new layer works with blend, fx after it, bindings, the governor, the recorder and context loss (no crash; recovery or reload as today).
- **R5** No regression: existing scenes' cost unchanged; gates green.
- **R6** Mac (Chrome, Apple Silicon) required; Windows behaviour stated (WebGPU availability, fallback).
