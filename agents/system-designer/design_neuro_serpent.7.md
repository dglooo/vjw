## §3 Comparison
| | A mesh + depth | B raymarch | C strip impostor |
|---|---|---|---|
| R2 estimate p95, normal / slow (ms) | mode M 2.2-3.5 / 3.7-5.8; mode S 2.0-2.8 / 3.3-4.7 | 12 / 20 (1/2 res: 4.6 / 7.6) | 2.0-2.9 / 3.4-4.7 |
| Occlusion | exact, also at a self-crossing | exact | pops at crossings |
| Edge AA | MSAA 4x (cost unknown) or a post edge smooth | analytic | analytic |
| Whip, crack, kink | free-form rig | too few joints | strips fold or degenerate |
| Full-res look (lines, silhouette) | yes | no at 1/2 res | yes, outside the failure cases |
| New GL features | depth renderbuffer (+ MSAA and blit in mode M) | none | none |
| New files | scene + test | scene + test | scene + test |
| Effort | L | M | L |
## §4 Recommendation and lever chain
**Variant A.** It is the only path that is exact on occlusion at the whip and keeps the full-res look. It uses a standard pipeline: an opaque mesh, a depth test and the Rave Lasers post chain. In a slow session its cost sits on the 5 ms line in mode M (centre 4.7 ms) and under it in mode S (top 4.7 ms, 4.5 ms with L1). The one unknown, MSAA, is measured at the start of the spike. B cannot meet R2. C is the fallback only if both AA modes of A fail.

**Lever chain if over budget** (in this order; the savings are slow-session estimates)
- L1 Draw the instances near -> far (CPU sort of 192 keys; instances become self-contained): early-z, -0.2 to -0.4 ms. Look-neutral.
- L2 Mode M only: MSAA 4x -> 2x, -0.2 to -0.5 ms.
- L3 Mode M -> mode S, if its edges passed the spike A/B: -0.4 to -1.1 ms against 4x.
- L4 Creative cut 1, fringe off: about -0.1 ms.
- L5 Creative cut 2, sparks 120 -> 60: up to -0.1 ms.
- L6 Creative cut 3, haze noise off: about -0.1 ms (if it was built).
- L7 Drop the far blur and keep the near tent: -0.1 to -0.2 ms.
- Never: the highlight lines, depth fog, occlusion, gills, the drop recipe (creative §2 L52).
- Rule: one lever per measurement, each recorded with its measured delta (CLAUDE.md § Task tiers, the performance flow). Stop at p95 <= 5 ms in a slow session.
- Haze noise: a contrast <= 4 % on a 3-8 % background is <= 0.8 / 255, under one 8-bit step. Build it last, as value noise inside the composite (0 extra passes), or not at all (the creative-director's call).

**Acceptance mapping** (all variants unless marked)
- R1, C1: stills S1-S10 from a live pass. `orbit`, `yaw`, `pitch` and `zoom` give the angles A / B and the close-up.
- R2: the cost tables + the lever chain.
- R3, C15: only `flare` is flash-class (`flashGate`, post.ts L46-58). Rings, snaps and glints stay local (<= 5 % of the frame, by size). The rig's JS stays well under 0.1 ms (192 rings).
- R4, R6, C6, C7: `state().twist` and `.ripple` against the bound `bass`, r >= .80 (the lasers T-C12 method, STATE RL S5.3). `flare`: r >= .60.
- R5, C12-C14: the release state machine, read from `state().turns`, `.spanFW`, `.whips`. C13 from frames.
- R7: one built-in. C2: lens + flutes + twist; overlap by depth (A), march (B) or sort (C).
- C3, C4: `studio()` + tangent lobes + rim. HDR stays in RGBA16F until the tone map. A cavity term (>= 60 % darker). Floor tone `#070A10`.
- C5: fog background 3-8 %, depth fog <= 25 % at 3x `nearDist`, hash dither.
- C8-C10: rises on float inputs with attack 0 / release 0, on the same frame. Counts in `state()`.
- C11: the `W` rules + the kick-proof `presence`. C16, C17: `state().speed`; row-1 release .30 s. C18: no wall clock, no `Math.random`.
