# Spec — Stage 2d: the TouchDesigner look

## TL;DR
- Our own effects look dated next to MilkDrop. The new quality bar is the user's reverse of TouchDesigner 2025.33230: palette shaders and operator chains in `donor/td-reverse/touchdesigner/`, studied and **rewritten by analogy**.
- Track A: six looks that today's ISF engine can already express. Track B: two engine features, a frame-history ring and an instanced/point + particle layer, that unlock four more.
- Every new effect reacts to our Stage 2c sources: drums, sub/reese/wobble, build/drop, beat/bar. Generic `bass`/`onset` alone is not enough.
- Written by the lead from recommended answers (user standing instruction 2026-11-04 "ставь все реки, не спрашивай"). Each answer is marked `(default)`.

## Freshness
- 2026-11-04, lead. Inputs: `agents/research/research_td_look.md` (all §), user messages 2026-11-04 (quality complaint, TD as the reference, audio-reactivity requirement), `agents/STATE.md` HEAD.

## §1 Goal
DJ-set visuals that hold up next to TouchDesigner and MilkDrop: feedback-chain depth, real glow, motion smear, organic growth, time warps, particles. All of it must react to the music the way our audio-reactivity stage already hears it.

## §2 Scope
- **Track A, looks in today's engine** (research §5 items 1–6): TD "feedback fx" chain, feedbackEdge contour rings, bloom pyramid, light tunnel + radial zoom blur, optical-flow smear, reaction-diffusion. Reaction-diffusion has a ⚠️ runtime check.
- **Track B, engine features** (research §5 items 7–8):
  - (a) a frame-history ring, which unlocks RGBA delay, time machine and slit scan. It absorbs the parked polish §1 slit scan.
  - (b) a GPU particle-state layer plus an instanced/point renderer usable as a layer generator, which unlocks particles driven by noise/flow and pixel scatter.
- Each look ships:
  - as an effect in the catalog;
  - plus at least one starred built-in scene that shows it off in the autopilot `(default)`;
  - with default params tuned toward the TD values in research §1b `(default)`.
- **Audio reactivity, mandatory per effect:**
  - Map each expressive param to a specific 2c source (`web/src/bind.ts` SOURCE_IDS). Example: zoom ← kick, hue step ← snare, displace ← reese/wobble, glow ← build→drop, growth seed ← sub.
  - Say how the Auto-style overlay (`web/src/audio/presets.ts` `map`) changes it per genre.
- Every new file credits its look reference in a header comment (TD component name), plus any OSS block actually used (webgl-noise MIT, Wombat credit) `(default)`.

## §3 Non-goals
- Point clouds from depth cameras (Stage 3 camera); LUT image assets; cross-layer texture input.
  - These go in only if the design shows one of them is nearly free on top of Track B.
- Redoing the existing own effects. Retiring the weakest ones is a later taste pass after the user sees Track A `(default)`.
- Pasting TD text verbatim.

## §4 Acceptance
1. Each new scene: `?bench` GPU p95 ≤ 5 ms at 1728×1117, scale 1 (design_effects E2). Gates green.
2. Each new scene: a screenshot reviewed by the lead side by side with its TD reference description (research §1b). A contact sheet goes to the user per checkpoint.
3. Reaction check per effect on `scratchpad/fx_audio/dnb174.wav` and `dubstep140.wav`: the bound params visibly move on their source (debug overlay values or param trace). Repeat on real tracks once the user provides them.
4. Closing run: 60 s autopilot with all new scenes in the playlist, 0 late frames, governor 1.00×. Memory stays within the design's budget, which matters for the Track B history ring.
5. The WCAG flash cap still holds: no new effect strobes past ≤3 onsets/s.

## §5 Open questions (for design)
- Bloom: a per-layer fx, a global post pass next to heat (`web/src/gl/post.ts`), or both?
- Reaction-diffusion and optical flow: ISF multi-pass or native generators?
- Should Tracks A and B share one multi-pass / persistent-target infrastructure, and what is its order?
- History ring: resolution, depth (30–120 frames), format and memory cap. Fixed or adaptive to the governor?
- Particle layer: transform feedback (as in `web/src/scenes/particles.ts`) or float-texture ping-pong? How does it read another layer or noise as a force field?
