# Spec — DnB scene wave 4 (two new DnB scenes)

## TL;DR
- Two new starred DnB scenes (170–175 BPM), each a Tier-3 new scene through SDLC v1.2: **Neuro Serpent** (reese-bass-driven chrome ribbon, neurofunk) and **Amen Shatter** (breakbeat-locked frame slicing, jungle). Both are visual concepts the catalog does not have yet.
- User request 2026-11-15: «можно делать сцены днб дальше». The user did not name the scenes; the lead picked these two (defaults, marked) per the never-ask rule. The user's creative gate (stills, ok / not ok) at S3 and S7 decides.
- Pipeline per scene: S1 research (one shared artifact) ‖ audio-dsp feasibility → S2 creative-director → system-designer → architecture-skeptic → lead pick → test-architect → S3 spike + stills on the real tracks → creative-qa → user gate → S4–S7.

## Freshness
- 2026-11-15, lead, session 15. Inputs: the 59 current built-ins (`web/src/scenes/builtin.ts`), the analyser sources (`web/src/bind.ts` L26), the user's quality bar (modern look: thin cores, lit haze, HDR, no banding; "our older scenes look like Terminator 2, 1991"), the Rave Lasers lessons (spec from the user's words, real tracks for stills, honest creative-QA before the gate).

## §1 Why these two (default picks)
- The catalog covers tunnels, fluids, particles, feedback, glitch, lasers, animals, meshes. It has no scene whose main body IS the DnB bass (the reese / wobble growl) and none that is locked to the **breakbeat** itself (the Amen-style drum pattern), which is what makes DnB / jungle recognisable.
- Overlap check: `fluid`, `liquid-chrome`, `lava-smoke`, `ink` (liquid looks) and `glitch`, `bloom-glitch`, `slit-scan` (generic glitch) exist. Neither wave-4 scene repeats them: Neuro Serpent is a 3D object, not a 2D fluid; Amen Shatter is beat-pattern-locked block motion, not random glitch.

## §2 Scene A — Neuro Serpent (default)
- **Mood:** neurofunk — dark, metallic, mechanical, aggressive. A thick chrome / liquid-metal ribbon or tube that coils through dark space.
- **Body = the bass:** the reese / wobble drives the twist, the coil tightness and a surface ripple ("growl" = visible tearing / ridges on the surface); the sub swells its thickness.
- **Drums:** the kick punches a pressure ring along the body; the snare tears or snaps it (a hard discrete deformation, not a pulse); hats add fine surface glints.
- **Build → drop:** the build winds it tighter and brighter; the drop releases it — it whips across the frame at full scale.
- **Look bar:** HDR specular highlights, environment reflections or a fake chrome map, depth fog, no flat shading, no banding.

## §3 Scene B — Amen Shatter (default)
- **Mood:** jungle / breakbeat — rhythmic, choppy, hand-cut. The frame is cut into slices or blocks that jump, offset and re-assemble **on the breakbeat pattern** (kick / snare / ghost notes), like a sampler chopping the Amen.
- **Source picture:** a strong underlying image (a gradient field, a running TD scene, or the camera when live — the main-app camera exists now) that the slicing cuts up.
- **Drums:** each drum hit moves a set of slices by a quantised amount; snare rolls produce a stutter / repeat; the pattern repeats per bar so the eye learns it.
- **Build → drop:** the build stutters faster (8ths → 16ths); the drop re-assembles the picture whole for one beat, then shatters wide.
- **Flash safety:** block motion is local; no full-frame blink beyond the app's ≤ 3/s gate.

## §4 Non-goals
- No reuse of the rejected looks (flat analytic shapes on black; dated 1991-style rendering).
- No random-noise glitch that ignores the beat. No full-frame strobing.
- No new runtime dependency unless the design proves the need.

## §5 Acceptance (per scene)
- **R1** The stills sheet (several moments: quiet, groove, build peak, drop +0.2 s, drop +1 bar; a close-up) on the user's real DnB tracks (`tracks/`: Kanine, Sub Focus, Andy C) reads as the scene's mood at a glance → the user's ok (S3, S7).
- **R2** Billed +flash p95 ≤ 5 ms at 1728×1117 on `dnb174-arr` and `dubstep140-arr`.
- **R3** `__flash` ≤ 3/s and the WCAG luma cap; 0 late frames over 60 s on autopilot.
- **R4** Live pass: every bound parameter correlates with its source (r ≥ .80 ungated, ≥ .60 flash-gated — the G1 rule).
- **R5** The drop is the climax (measured); the build reads as a ramp.
- **R6** Scene A: the body visibly follows the reese / wobble (r on the twist / ripple). Scene B: slice moves land on drum onsets within 2 frames, quantised to the bar grid.
- **R7** One built-in per scene, DnB preset.
