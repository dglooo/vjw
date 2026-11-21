# Epic spec: vs3 engine — the donor's look system (post chain, macros, palettes)

## TL;DR
The user (2026-11-21, voice): «давай погнали большую доработку движка vs3». Scope = the parked vs3 UI/engine epic: the donor's
global look over the active scene — 4 macros, a post chain (mirror → feedback → bloom → lens → finish) with per-scene
art direction, and palettes as a look system — so that the vs3 factory presets carry their full look (today they drop
the post chain and the macros: 672 values over 34 presets, `agents/hardening.md` line 86).

## Freshness
- 2026-11-21, lead. Source commit `a4554bf` (branch `dev`). Research: `agents/research/research_donor_vs3_ui.md`
  (2026-11-19, fresh; §2 config model, §4 post chain, §5 gap table).

## Mood
The donor's one-look feel: every vs3 scene sits inside a shared camera-and-glass treatment (trails, symmetry, bloom, a
lens material, a film finish) that a preset or four macro knobs reshape. Smooth, physical, never a flash.

## Triggers (signals the chain reads)
Kick (flash-gated ⚡ only), mids, sub, energy (as host.ts `signal()` already builds them), the bar clock, the new melody
sources only if a variant finds a use (`tonal`, `pitch` with ≥ 0.3 s glide).

## Requirements (acceptance IDs)
- **R1 Macros.** `react`, `chaos`, `trails`, `heat` (0..1, 0.5 = stock, donor `drastic()` mapping) as user knobs; bindable,
  MIDI-learnable, carried in presets, glided by the preset morph.
- **R2 Post chain** for vs3 scenes in the donor order: mirror (symmetry 0..12 with fold fades, tiles, twist, slice) →
  feedback (persist, zoom, spin, decay, swirl/wobble) → bloom (ours, existing) → lens (the 7 styles) → finish (existing +
  hue drift, grain, brightness). Defaults `BASE_POST`; per-scene art direction `FX_DEFAULTS` (32 entries) merged on a
  scene switch per the donor's `FADE_KEYS` rule. Each pass costs nothing at amount 0 (skipped).
- **R3 Palettes as a look system.** The 24 palettes stay; add hue drift; the morph (done 2026-11-21) covers them.
  Custom palette from an image: only if cheap.
- **R4 Full presets.** Regenerate the factory presets with their post + macro values (`web/scripts/vs3-presets.mjs`,
  donor `main.js` read as text); the preset morph glides post + macros too.
- **R5 Safety (kept).** The app-wide flash gate (≤ 3 luma steps > .10 per second, `post.ts`) holds on every vs3 scene
  with the chain at its preset values; kick-driven post terms (feedback zoom push, lens re-seats, aberration kick) go
  through the flash-gated ⚡ path (I-FL1). Frame budget: the chain at a typical preset adds ≤ 2 ms GPU p95 at the
  stage size on the user's laptop (billed-p95 A/B, SDLC §7).
- **R6 UI.** The new knobs live where vs3 params live today (E panel, the scene's folders) plus a compact «look» group;
  no console restyle.

## Non-goals (unless a variant shows them nearly free)
Second-scene layer across scenes; output window; automation timeline lanes; 16 device macros map; randomize; the
donor's glass console skin; emblem (we have `native/text`); adaptive exposure; FXAA.

## Open design question (for the system designer)
Where the chain lives: (a) inside the vs3 host only (per vs3 layer, after its render), (b) a global look stage in our
engine (`gl/engine.ts` / `gl/post.ts`) that any scene may opt into, with vs3 scenes opted in by default, or (c) a hybrid.
Interaction with our per-layer effects, the director's transitions (13), the toy flash limiter and the analysis-off idle
signal must be stated.
