# Spec — Stage 2e: TouchDesigner look, wave 2 (the rest of the dump)

## TL;DR
- Wave 1 (Stage 2d, `thoughts/spec_td_look.md`) ported the TD feedback/bloom/flow/ring/particle look as 11 scenes. Wave 2 ports **everything else in the dump that is worth having**, per the triage in `agents/research/research_td_wave2.md`: the top-10 (§5), the 12 quick wins (§6), and the engine gaps they need.
- The rules are the same as wave 1: TD is **rewritten by analogy** (no licence pushback: personal use, user ruling 2026-11-04); MIT donor ISF files may be **copied** with their header. Every effect binds the 2c sources per the 2d policy.
- Written by the lead from recommended answers (user standing instruction: "ставь все реки, не спрашивай"; user 2026-11-06 asked for "all the remaining shaders"). Each answer is marked `(default)`.

## Freshness
- 2026-11-06, lead. Inputs: `agents/research/research_td_wave2.md` (all §), `thoughts/spec_td_look.md` §2 §4, `agents/system-designer/design_td_look.md` binding policy L54–64 + § Ruling L420–452, `agents/STATE.md` HEAD.

## §1 Goal
Fill the library with every distinct TD look we don't have yet, so the user can build any scene in the 2b editor from a complete palette: fractal generators, polar/geometry warps, colour grading, blend-mode feedback, an audio scope, pointillism and the small colour filters, all reacting to the music.

## §2 Scope
- **Top-10** (research §5): julia orbit-trap filter (+ mandelbrot as its generator mode `(default)`), superformula outline generator, polar wrap, phaser staggered wipe, gradient map, XY/Lissajous audio scope + rotating feedback, pointillize, difference-blend feedback, dilate/erode melt, stars / polka-dot noise generator.
- **Quick wins** (research §6 q1–q11): solarize, rgbContrast, colorThreshold, monochrome, changeColor, changeToColor, dent, sharpen, emboss/normal relight, checker, hsv/rgba blur. q12 twirl only if it costs nothing next to `light-tunnel`'s input `(default: skip)`. Copy the MIT donor ISF where research names one; else one tiny own ISF each.
- **Engine gaps, in scope:**
  - layer blend modes `difference`, `max` (lighten), `dodge` (research §4 blendModes);
  - a stereo L/R waveform texture for the XY scope;
  - the plexus line renderer (research §1, `glsladvancedPOP` ex8) if the design shows it is cheap on top of the TF points from wave 1 `(default: design decides; defer if L+)`.
- **Each look ships:**
  - as a catalog effect/generator, tagged so the 2b library filters find it;
  - at least one starred built-in per top-10 item;
  - quick wins grouped into 2–3 built-ins `(default)`.
- **Audio:** every expressive param binds a specific 2c source (research §5/§6 suggested bindings are the starting point). State the Auto-style effect per genre.
- **Credits:** each file names its TD component in a header comment; copied donor ISF keeps the VIDVOX MIT header; THIRD_PARTY rows for both.

## §3 Non-goals
- **Deferred to a later wave `(default)`:**
  - the 17 parametric 3D meshes (`P/Generators/mesh`), which need a 3D mesh renderer;
  - Gaussian splats (asset-driven, not reactive);
  - the geometry-shader explode (needs a de-indexed mesh path);
  - the Verlet chain;
  - 3DScope.
- **Skipped (research §6 "not worth porting"):** convolve, softenAlpha, pixelate (we have it), the broadcast scopes, spectrumTOP.
- Retuning wave-1 or older scenes.

## §4 Acceptance
1. Each new scene: GPU p95 ≤ 5 ms at 1728×1117, scale 1, measured with a billed tail (`own/flash` appended). Gates green.
2. Reaction check per effect on `scratchpad/fx_audio/dnb174-arr.wav` and `dubstep140-arr.wav`: every bound param moves on its source (r reported). `__flash` ≤3/s; the WCAG luma cap holds, which matters for difference feedback and solarize.
3. A contact sheet per checkpoint, reviewed by the lead against the research's TD description.
4. Closing run: 60 s autopilot over all new built-ins on both arr fixtures → 0 late, 1.00×.
5. All new blocks appear in the 2b library with stills, filterable by their tags.

## §5 Open questions (for design)
- Julia/mandelbrot cost at full res vs `res` .5; fp32 limits on zoom.
- XY scope: a native TF-points generator vs an ISF pass on a stereo wave texture; where the stereo texture comes from (`audioTex` today is mono).
- Blend modes: a `Blend` enum extension in `doc.ts` + compositor, and its effect on saved docs.
- Pointillize: a `native/scatter` mode vs its own native.
- Plexus: cost of neighbour search on the GPU in WebGL2 (no atomics/compute).
- Checkpoint order and how to batch the quick wins (one step per 3–4 tiny files).
