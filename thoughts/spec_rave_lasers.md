# Spec — Rave Lasers (laser scene, third attempt)

## TL;DR
- A real rave-stage laser show on screen: thin, hard, hyper-bright beams that shoot from fixed emitter points, sparkle, flicker, cross, and appear / vanish on the music. Several emitter positions, not one. Colours green / white / red, adjustable.
- Replaces CP2 of `spec_scenes_wave3.md` §2 B (the two laser scenes). Two built-ins on one renderer: techno and rave / DnB (default).
- Tier 3, SDLC v1.2: S1 research → S2 creative-director → system-designer → architecture-skeptic → lead pick → test-architect → S3 spike + stills → user gate.
- The trace look built in the last attempt is NOT a laser (user, 2026-11-15); it stays as the separate scene `builtin:isobars`.

## Freshness
- 2026-11-15, lead, session 15. Source: the user's Telegram verdict on the laser spike sheet (below). Supersedes the laser rows of `spec_scenes_wave3.md` §2 B and the CP2 plan in `agents/planner/plan_scenes_wave3.md` L161–L190.

## §1 The user's words (2026-11-15, verbatim)
> «я думаю это не совсем то — оставь текущую сцену. Лазеры это линии ебошащие сверкающие, даже можно не из одного места направленные, зеленые белые красные — должно регулироваться. Они должны быть упоротые, прижаты к одним точкам и должны как-то появляться. Вот это выглядит прикольно, но это не лазеры. Вот лазеры на рейв-сцене — как это устроено, какие сетки создаёт, квадраты… короче они мелькают. Надо что-то в этом стиле сделать.»

Reading (lead): lines that blast across the frame and sparkle; origins at fixed points, several origins allowed; colours green / white / red with a control; wild ("упоротые"); beams switch on and off; the reference is how a real rave-stage laser rig works and which figures it draws (grids, squares, fans); they flicker.

## §2 History (what was rejected, so the design does not repeat it)
- **Attempt 1 (2026-11-14), `own/laser-grid.fs`:** an analytic ISF polar fan, 4 emitters × 8 beams, quarter-res mist + full-res cores. User: «полное дерьмо». No detailed reason given. ⚠️ Assumption, needs confirmation: it read flat and dated (the user's "Terminator 2, 1991" remark on our older scenes, the same session); the beams did not read as light in smoke.
- **Attempt 2 (2026-11-15), `native/laser` trace → now `native/isobars`:** closed contour loops around blobs. User: looks cool, not a laser. Creative QA (`agents/creative-qa/cqa_laser_grid_spike.md`): no beam origin / direction / fan, no haze, the drop not a climax.

## §3 Scope (what the scene must show)
- **L1 Beams from points.** Every beam starts at an emitter point (on screen or just off the frame edge) and shoots across the frame. A thin, very bright core; a soft volumetric glow along the beam in haze; a hot spot at the origin.
- **L2 Several emitter positions.** At least two placements in one scene (e.g. a top truss row + side or floor points); a layout control.
- **L3 Rig figures.** The figures a real rave rig draws: fan (spread), scan / sweep, chase (beams switching on / off along a fan), crossing beams from two emitters forming a lattice / squares, cone / tunnel, sheet (a dense fan read as a plane). The research decides which figures matter most.
- **L4 Sparkle and flicker.** Beams appear and vanish (blanking, chases, scanner flicker). Flicker is per beam, never a full-frame blink.
- **L5 Haze.** Beams visible through smoke; the air between beams is not pure black where beams pass.
- **L6 Colour control.** Green / white / red, selectable and mixable (a palette knob); default green + white. Not a rainbow by default.
- **L7 Wild energy.** Fast, aggressive, rave / DnB tempo 170–175 and techno 125–135; the drop is the climax.

## §4 Audio triggers (suggested, the creative-director decides)
- hats → chase / flicker rate; kick → fan pop or a figure step; snare → figure switch or a white accent; sub → spread / cone opening; reese → sweep speed; build → density and speed ramp; drop → every emitter opens, full spread, white burst (through `VJW_FLASH`).

## §5 Non-goals
- No closed contour loops (that is `builtin:isobars`).
- No repeat of the attempt-1 look (thin flat lines on black without volume).
- No ILDA / hardware laser output. No rainbow default. No new runtime dependency unless the design proves the need.

## §6 Acceptance
- **R1** The stills sheet (several moments, several emitter layouts) reads as a rave laser show at a glance → the user's ok (S3, S7).
- **R2** Beams anchor at emitter points; ≥ 2 emitter positions in one scene.
- **R3** Palette control: green / white / red selectable and mixable; default green + white.
- **R4** Haze visible: a sample between beams in the beam region reads above black (measured, value set by the design).
- **R5** Billed +flash p95 ≤ 5 ms at 1728×1117 on `dnb174-arr` and `dubstep140-arr`.
- **R6** Flash safety: full-frame `__flash` ≤ 3/s and the WCAG luma cap holds; beam flicker stays local.
- **R7** The drop is the climax: brighter and wider than the build top (measured mean luma + beam count).
- **R8** Live pass: every bound parameter correlates with its source (r per row, the wave-3 convention).
- **R9** Two built-ins on one renderer: techno and rave / DnB (default; the design may argue for one).
