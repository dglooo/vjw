# Spec — Stage 2f: scene wave 3 (animal particles, lasers, rave picks)

## TL;DR
- **10 new starred scenes** for rave / DnB / techno sets: **5 particle scenes where the particles assemble into animals**, **2 pure laser scenes**, **3 free picks** from the best remaining looks of the TouchDesigner dump (3D allowed).
- Look source: the TouchDesigner dump `donor/td-reverse/touchdesigner/` (rewritten by analogy; personal use, no licence pushback, user ruling 2026-11-04) + `donor/hg_sdf` for SDF shapes; MilkDrop is the second bar. The user finds our older own effects dated: these must read as a modern club show.
- Written by the lead from the user's voice request (2026-11-14). **The user ordered the planner directly, with no research/design pass**: the planner makes the architectural picks inline and marks each one `⚠️ planner pick (no design pass)`. Defaults are marked `(default)`.

## Freshness
- 2026-11-14, lead. Inputs: the user's request; `agents/STATE.md` HEAD § Key facts (binding policy); `thoughts/spec_td_wave2.md` (template); `agents/research/research_td_wave2.md` §3–§4; `agents/system-designer/design_td_wave2.md` § Verified engine facts (code read 2026-11-06; later merges touched `scenes/points.ts`, `scenes/plexus.ts`, `scenes/scope.ts`).

## §1 Goal
Club-grade scenes that react to our 2c audio patterns (kick / snare / hats, sub / reese / wobble, build / drop) the way a lighting op would: tension on the build, impact on the drop, motion locked to the drums.

## §2 Scope
- **A. Animal particles ×5.** A particle cloud that assembles into an animal silhouette, dissolves, and morphs into the next animal, driven by the track's structure.
  - Behaviour `(default)`: build → the shape loosens and scatters (tension); drop → the cloud slams together into a new animal; kick → a pulse/shockwave through the cloud; snare → a colour/sparkle accent; sub / reese → swirl/turbulence amplitude; hats → glitter detail only. Brightness on a hit only via `VJW_FLASH` (≤3/s).
  - Five **distinct** scenes, not one scene in five colours: different animal sets and moods, different render styles (glow points, streak trails, plexus lines between near points, 3D depth with a camera orbit, ink/dust). Animal set `(default, planner adjusts)`: wolf, eagle, panther, snake, stag, shark, owl, jellyfish, butterfly, dragon.
  - Reuse first: `native/scatter`'s home-spring physics (`web/src/scenes/points.ts`): the home becomes a point sampled from the animal shape instead of the grid cell; `scenes/plexus.ts` for lines; the swarm trail pattern.
  - Shape source: own, offline, in-repo, no third-party art `(default)`. Candidates: hand-authored SVG path data rasterised to an OffscreenCanvas and sampled; 2D SDF built with hg_sdf-style operators; low-poly point lists. **No emoji fonts** (the look differs per OS, and Windows is a target).
- **B. Lasers ×2.** Pure laser-show scenes: thin saturated beams fanning from 1–N emitters, scanning sweeps, beam sheets and tunnels, fake haze (beams visible through smoke), hard chops on kicks/hats, sweep speed on reese/build, a full fan plus a white burst on the drop (through `VJW_FLASH`).
  - One leans **techno**: mono or two-colour, strict geometry, 16-step chops.
  - One leans **rave/DnB**: multicolour, fast scanning, tunnel.
  - TD reference for the shape language: `extracted/dat_texts/Samples/Learn/OPSnippets/Snippets/CHOP/laserCHOP/` (+ `laserdeviceCHOP`) readMe files.
- **C. Free picks ×3.** The planner picks the three best-looking remaining dump looks for rave / DnB / techno and states why. 3D is now in scope: the wave-2-deferred `P/Generators/mesh` parametric meshes, POPs `pointRender` with a 3D camera, hg_sdf raymarched structures, OPSnippets `POP/*` (feedbackPOP, forcePOP, glsladvancedPOP …).
- **Each scene ships** as a starred built-in (`web/src/scenes/builtin.ts`); its new blocks go in the catalog with category/tags for the 2b library; every file has a `Look: TD <component> (studied, rewritten)` header.
- **Audio:** every expressive param binds a specific 2c source per the binding policy; the Auto-style effect per genre is stated. Each scene names its primary genre: DnB 170–175 (fast, sub-heavy, reese), techno 125–140 (hypnotic, kick-locked), rave/hardcore.

## §3 Non-goals
- Camera-driven scenes (Stage 3); Gaussian splats; asset files over 1 MB; third-party animal art; retuning older scenes.

## §4 Acceptance
1. Each scene: GPU p95 ≤ 5 ms at 1728×1117, scale 1, billed tail (`own/flash` appended). A scene over budget gets a cheaper mode, or a catalog L-class note per the julia precedent (lead ruling). Gates green.
2. Reaction check on `scratchpad/fx_audio/dnb174-arr.wav` (build 23.1 s, drop 34.1 s) and `dubstep140-arr.wav` (build 28.4 s, drop 42.1 s): every bound param moves on its source (r reported); the animal assembles visibly on the drop. ⚠️ No techno fixture exists: techno-leaning scenes are checked on the dnb fixture with the techno preset.
3. `__flash` ≤ 3/s and the WCAG luma cap holds (lasers and drop bursts especially).
4. The animal reads at a glance in an assembled still (lead review on the contact sheet).
5. A contact sheet per checkpoint; closing run: 60 s autopilot over all 10 on both fixtures → 0 late, 1.00×.
6. All new blocks appear in the 2b library with stills.

## §5 Open questions (the planner decides inline, marked)
- Animal shape data format and location; particle count vs the 5 ms budget (scatter's ~120k-point grid measured p95 2.65 ms).
- Morph between animals: index-stable reassignment vs nearest-target, keeping each point's identity and colour.
- 3D: a shared view/projection for points and meshes (none exists; research_td_wave2 §4 "a 3D camera is missing").
- Lasers: an analytic ISF pass vs a native LINES draw with bloom; the haze.
- Which 3 free picks.
