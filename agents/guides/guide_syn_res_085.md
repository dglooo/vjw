# Guide: raise the donor (syn) scenes to res .85

## TL;DR
- **What:** 59 built-ins in `web/src/scenes/builtin.ts` reference a `syn/…` scene at `res` < .85. Each one goes to `res: 0.85`. Old scenes (no `syn/` ref) are out of scope.
- **How:** per scene, one script call makes the two mechanical edits (the `res` in builtin.ts + a header line in the glsl). 9 scenes (group B) also get one named knob edit. Nothing else changes.
- **Cost rule (user 2026-11-19):** no frame-time measurement. The cost is kept by arithmetic where a clean knob exists (group B) and accepted where none exists (groups A and C).
- **Groups:** A = 19 (res only, cheap) · B = 9 (res + a named knob, 8 of them checked by a still pair) · C = 31 (res only, heavy, cost accepted).
- **Work split:** 3 scenes are done (§ Pilot) and 1 is held (`Hills, Eels`, § Open findings). The other 55 are 4 batches (14 / 15 / 15 / 11) for 2 Sonnet coders in parallel: batches 1 ‖ 3, then 2 ‖ 4.

## Freshness
- Written 2026-11-19 by `frontend-coder` (Fable 5.2) against master `e6e7fee` (85 syn files, 722 tests).
- Line numbers in § Per-scene table are from that commit. Re-run the triage (§ Tools) if `builtin.ts` or a `web/src/fx/syn/*.glsl` file changed since.
- Precedent: Traced Tunnel, merge `42f3b98`, tag `traced-tunnel-sharp` (`web/src/fx/syn/traced_tunnel.glsl` L1–25).
- ⚠️ Stale when: the layer `res` semantics change (`web/src/gl/live.ts` L400–410), or the syn adapter's pass sizing changes (`web/src/fx/syn.ts` L301–322).

## How res works (30 seconds)
- A layer at `res` < 1 renders into a smaller target and is upscaled linearly at composite (`web/src/gl/live.ts` L400–410, L429–439). Every pass of a syn scene scales with it (`web/src/fx/syn.ts` L301–322), except data grids under 8 px.
- The pixel count grows as res². The pixel factor of this change is **k = (.85 / res_now)²**: .25 → 11.56 · .3 → 8.03 · .33 → 6.63 · .35 → 5.9 · .4 → 4.52 · .5 → 2.89 · .6 → 2.01 · .7 → 1.47 · .75 → 1.28 · .8 → 1.13.
- In `60-adaptive` mode the governor lowers the whole output scale when the frame time runs over (`web/src/app.ts` L295). That is the safety net for group C. It is not a reason to skip a scene.

## Tools
All three live in `/Users/shaixee/Codered/Veejay-Wizard/scratchpad/res085/` (git-ignored: use these absolute paths from any worktree). If the folder is missing, stop and tell the lead: the pilot wrote it inside its own worktree (`<pilot worktree>/scratchpad/res085/`) and the lead copies it over.

| Tool | Call | What it does |
|---|---|---|
| `triage.mjs` | `node …/res085/triage.mjs <your worktree root> /tmp/res085-check.json` | Lists every syn built-in still under .85 with its static cost hints. Text only. **Always pass both arguments**: without them it rewrites the frozen `targets.json`. |
| `apply.mjs` | `node …/res085/apply.mjs <your worktree root> <id> "<note>"` | The two mechanical edits for one built-in (§ Recipe step 6). It refuses when the id is unknown, the res is already ≥ .85, or the glsl already has the header line. With `--undo` in place of the note it puts `builtin.ts` back for that built-in. |
| `still.mjs` | `ARGS=--disable-audio-output node …/res085/still.mjs <port> <tag> <builtin:id,builtin:id,…>` | One headless frame per id on a real DnB track. Writes `…/res085/stills/<id>-<tag>.png` (800 px) and prints `OK` / `BLACK` / `FLAT` with the mean luma. |

- `targets.json` (same folder) is the frozen triage of master `e6e7fee`: id, name, file, res, k, the `res` line, loops with runs per pixel, taps, passes, `syn_Presence` lines.
- `<id>` for `apply.mjs` is the id **without** `builtin:` (example: `circuit-bending`). `still.mjs` takes it **with** `builtin:`.

## Groups
| Group | Meaning | What you change | Count |
|---|---|---|---|
| **A** | Res only. The shader is cheap (no loop over 40 runs per pixel, at most 60 taps per pixel in the triage), or k ≤ 1.3. | `res` | 19 |
| **B** | Res + one named knob. The knob is a count that does not define the look: shadow steps, a march cap with a distance exit, dispersion samples, a regular anti-aliasing grid. One row couples a value to res. | `res` + the knob in the row | 9 |
| **C** | Res only, cost accepted. The shader is heavy and every count in it defines the look (a light sum, a particle count, a fold count), or a reading on file shows > 10 ms at a higher res. | `res` | 31 |

- You do not move a scene between groups. If a C scene looks like it has a knob, report it; do not cut it.
- The groups come from the triage hints plus the frame-time readings already written in `builtin.ts` comments. No new measurement was taken.

## What never to touch
1. Bindings: `bind: …`, `syn(…)`, `SOFT_SNARE`, `SOFT_KICK`, `SYN_BIND`.
2. `VJW_FLASH`, `VJW_CLOCK` and every ⚡ input in a glsl header.
3. Hit overrides and control binds in the built-in (`FOV: { source: 'build', … }` and the like).
4. `values: { … }` in a built-in and `"DEFAULT"` in a glsl header, unless the row names one (only `gaussian-smoothlife` does).
5. The first header lines of a glsl file: `// Source:`, `// Author:`, `// License:`. Your line goes directly above `/*{` (the script puts it there).
6. `opacity`, `speed`, `blend`, `fx`, `star`, `name`, `id`.
7. Any built-in without a `syn/` ref, and any syn built-in already at `res` ≥ .85.
8. Any shader line the row does not name. No "same picture, fewer operations" rewrites: Traced Tunnel needed a full session for those.

## Pitfalls
1. **A feedback scene's look is tied to its pass size.** `builtin.ts` L1228–1229: the feedback scenes run at .5 because that is the donor's own pass size on a 3456-wide stage; their patterns and simulation steps are written in texels. More texels can make a simulation run differently or diverge. No such break is confirmed yet, so every row flagged `F` (it has passes that read their own last frame) is judged by its still pair (§ Verification): a `BLACK` or `FLAT` after-still next to an `OK` before-still, or a picture that is broken or unrecognisable, means **undo that scene and report it**.
   - The before-still is the control. The pilot met `Hills, Eels` black at .85 and then found it black at res .5 too, from about 5 s after a cut (§ Pilot). Without the before-still that would have been blamed on the res.
2. **A texel-sized pattern gets finer.** In an `F` scene a blur radius, a cell size or a trail width counted in texels shrinks on screen by .85 / res_now. A finer pattern that still reads as the same scene is expected: keep it and name the scene under "pattern finer" in your report.
3. **Stochastic sampling turns into grain at 1 sample.** Traced Tunnel went 8 → 1 samples and its frosted tiles became grain. Never cut a random-sample count below 2. A regular anti-aliasing grid is different (the one such row is `mandelbrot-decoration`).
4. **A count inside a sum changes the brightness.** If the loop adds light per step (`col +=`, `extraLight +=`, a glow), a lower count is a darker scene. That is why those scenes are group C.
5. **`texture(` inside a branch.** A tap inside an `if` or a loop that depends on the pixel has no valid derivatives: the mip level is undefined and the picture gets seams. Do not wrap code in a new `if`. If a row ever asks for it, the tap must be `textureLod(…, 0.)`.
6. **DOF or blur driven by `syn_Presence`.** The donor's Presence rests near 1 while music plays; ours rests near .5. A blur written as `(1. - syn_Presence)` or scaled by Presence is half on at rest and stays soft at any res. Rows flagged `P` read `syn_Presence` (the lines are in `targets.json`). **Do not change them.** If the after-still is soft where you expected sharp, name the scene under "Presence blur?" in your report.
7. **A value coupled to res.** `gaussian-smoothlife` sets `scale` from the res (its kernel is in texels). Its row gives the new value. If another built-in's comment ties a value to its res, stop and report it.

## Recipe
`…/res085/` below is `/Users/shaixee/Codered/Veejay-Wizard/scratchpad/res085/`. `<root>` is your worktree root. `<port>` is the dev port from your brief. Work on your batch's rows only.

**Setup, once**
1. Invoke the `ponytail` skill (full). You should not need to read code beyond your rows; if you do, run `graphify query "<question>"` before Read / Grep.
2. Symlink the modules: `ln -s /Users/shaixee/Codered/Veejay-Wizard/web/node_modules <root>/web/node_modules`.
3. Start Vite from `<root>/web`: `npm run dev -- --port <port> --strictPort` (in the background).
4. Take the before-stills of the whole batch in one call, before any edit:
   `ARGS=--disable-audio-output node …/res085/still.mjs <port> before builtin:<id1>,builtin:<id2>,…`
   It takes about 10 s per scene (4 s on the scene, then the next kick). A scene that is not `OK` here is skipped (reason: "not OK before the change"): you have no control picture for it.
   `still.mjs` exits 1 when any frame is not `OK`: do not chain a later command to it with `&&`. Run one `still.mjs` at a time. The id and file lists of your batch are in § Batch ids and files.

**Per scene, in the batch's order**
5. **Group B only: the knob first.** The row's line number is valid until step 6 runs.
   - Read the line: Read tool, `offset` = the row's line number, `limit` 3. It must show the row's old text. If it does not, stop and report it (the file changed).
   - Edit that whole line with the Edit tool: put one comment line above it, with the line's own indentation, and change the number. Change nothing else on the line.
   - The comment line: `// VJW: was <old value> (res <res now> → .85, agents/guides/guide_syn_res_085.md)`. It is a line of its own, never the end of a `#define` line.
   Example (`raymarched_reflections.glsl`, the pilot):
   ```glsl
       // VJW: was 24 (res .25 → .85, agents/guides/guide_syn_res_085.md)
       const int maxIterationsShad = 12;
   ```
   `gaussian-smoothlife` is the one knob in `builtin.ts`: edit `values: { scale: 1.13 }` to `values: { scale: 1.2 }` and add no comment (step 6 writes it).
6. **All groups: the script.** `node …/res085/apply.mjs <root> <id> "<note>"`. The note is `res only` for A and C, and the row's note for B. It prints `OK <id>: res <old> → .85 …`. It writes exactly this:
   - in `builtin.ts`, above the line that holds the layer's `res`:
     `// res .85 (was <old>, <date>, agents/guides/guide_syn_res_085.md): <note>` and on the line itself `res: 0.85`;
   - in the glsl, directly above `/*{`:
     `// res <old> → .85 (<date>, agents/guides/guide_syn_res_085.md): <note>`.
   If it prints `REFUSED`, read the reason. Do not edit by hand to get around it: skip the scene and report the reason.

**After the batch's last scene**
7. Compile every glsl you touched: § Verification step 1.
8. Take the after-stills (the step 4 call with the tag `after`) and judge them: § Verification step 2.
9. Undo each scene that failed (below). Then run the stills again for the undone ids with the tag `undone`: each must be `OK`.
10. Run the gates: § Verification step 3.
11. Stop Vite. Remove the symlink (`rm <root>/web/node_modules`). `git status --short` must list only `web/src/scenes/builtin.ts` and your batch's glsl files.
12. Commit on your branch. Do not merge. Message: `res .85: batch <n> (<count> scenes), agents/guides/guide_syn_res_085.md`.

**Undo one scene**
1. `node …/res085/apply.mjs <root> <id> --undo` (puts `builtin.ts` back for that built-in).
2. `git checkout -- web/src/fx/syn/<file>.glsl` (the file holds one scene: this removes the header line and a knob edit).
3. `gaussian-smoothlife` only: edit `values: { scale: 1.2 }` back to `values: { scale: 1.13 }`.

## Verification (no frame-time measurement)
Do not run `g3-bench` or any p95 tool. Three checks, in this order.

1. **Compile.** `node /Users/shaixee/Codered/Veejay-Wizard/scratchpad/donor-vs2/b1b/check.mjs <port> web/src/fx/syn/<a>.glsl web/src/fx/syn/<b>.glsl …` (run from `<root>`). Expect one `== syn/<file> OK` per file and exit code 0. A `COMPILE FAIL`, `THROW` or `UNSUPPORTED` line: fix your knob edit, or undo the scene.
2. **Stills.** Expect `OK` for every id and `errors: none`.
   - `BLACK` or `FLAT`: run the after-still once more for that id alone (the frame lands 4–10 s after the cut, and a few scenes change a lot in that window). Still not `OK`: undo the scene. Reason: "black / flat at .85".
   - `HOLD=<ms>` sets the time on the scene before the frame (default 4000). Use the same value for the before- and the after-still of a scene, or the pair does not compare.
   - Open both PNGs with the Read tool (`…/res085/stills/<id>-before.png`, `…-after.png`) for **every `F` row and every B row**. For the other rows, open them only if the mean luma moved by more than 2× in either direction.
   - Keep: the same scene, sharper; a finer pattern (pitfall 2); softer shadows after a shadow-step cut.
   - Undo: holes, missing geometry, a white or black block, noise where the before-still has a picture, a scene you cannot recognise.
   - The two frames are a few beats apart in the scene's own motion. Judge the look, not the pose.
3. **Gates.** From `<root>/web`: `npm run lint && npm run typecheck && npm test`. Expect exit code 0 and 722 tests passed. Then `node …/res085/triage.mjs <root> /tmp/res085-check.json`: your batch's ids must be gone from its list, except the ones you undid.

## Merge hygiene
- A batch edits only its own built-ins in `builtin.ts`: the `res` token and one new comment line above it (plus `scale` for `gaussian-smoothlife`). No reflow, no reorder, no other comment edits.
- The batches are contiguous line ranges of `builtin.ts`, so two parallel branches never touch neighbouring lines. Run **1 ‖ 3**, then **2 ‖ 4**.
- Each glsl file belongs to exactly one batch.
- The lead merges the pilot branch first, then one batch at a time, and runs the gates after each merge.

## Report shape (each Sonnet coder)
1. Batch number, branch, commit SHA.
2. Scene **names as shown in the app** (the Name column), in three lists: **A**, **B** (with the knob change), **C**.
3. **Skipped / undone:** name + reason (`REFUSED: …`, "not OK before the change", "black / flat at .85", "compile fail", "broken picture: <what you saw>").
4. **Pattern finer:** names (pitfall 2). **Presence blur?:** names (pitfall 6).
5. Compile result (the count of `OK` lines, exit code), stills result (the count of `OK`, `errors:` line), gates (three exit codes, the test count).
6. `**Changed during implementation:**` if you left the recipe anywhere.
7. `STATE entry:` ≤ 3 lines.

## Per-scene table
Columns: **id** (without `builtin:`) · **Name** (as shown in the app) · **glsl** (`web/src/fx/syn/<glsl>.glsl`) · **res → .85 (k)** · **Grp** · **Knob (B) or why (C)** · **Flags**.
Flags: `F<n>` = n feedback passes (pitfalls 1–2: look at both stills) · `P` = reads `syn_Presence` (pitfall 6) · `V` = the built-in sets `values` (leave them).
Line numbers are the file's before `apply.mjs` runs. The note for `apply.mjs` is `res only` unless the row gives one in quotes.
The group B knobs were each tried on a still pair in the pilot (§ Pilot), except `gaussian-smoothlife`.

### Batch 1 (14 scenes, `builtin.ts` L1104–1210)
| id | Name | glsl | res (k) | Grp | Knob (B) or why (C) | Flags |
|---|---|---|---|---|---|---|
| beats-in-4d | Beats in 4D | beats_in_4d | .25 (11.56) | C | 79-step light sum, L134 | V |
| dark-twister | Dark Twister | dark_twister | .25 (11.56) | **B** | L67: `max_steps = 90.` → `max_steps = 60.` · note `"max_steps 90 → 60"` | |
| kaleidowhoa-man | KaleidoWHOA, MAN | kaleidowhoa_man | .4 (4.52) | C | 80 steps × 5 folds, L170 / L105 | F1 |
| min-max-hex | Min Max Hex | min_max_hex | .75 (1.28) | A | | F2 P |
| overload | Overload | overload | .4 (4.52) | A | | |
| beamers | Beamers | beamers | .5 (2.89) | C | 60-beam sum, L183; 13 ms at res 1 on file | F1 P |
| hex-array | Hex Array | hex_array | .5 (2.89) | A | | F1 |
| gpu-melter | GPU Melter | gpu_melter | .4 (4.52) | A | | F2 |
| neuron-proximitors | Neuron Proximitors | neuron_proximitors | .25 (11.56) | C | 72 points per pixel are the look, L104 | F3 |
| thresholder | Thresholder | thresholder | .5 (2.89) | A | | F2 P |
| exoplanet | EXOplanet | exoplanet | .25 (11.56) | C | 3 passes, short marches (20 and 10 steps) | F3 |
| sprinkles | Sprinkles | sprinkles | .5 (2.89) | A | | F4 |
| square-shoals | SquareShoals | square_shoals | .5 (2.89) | A | | F1 |
| turbo-encabulator-fluid | Turbo Encabulator Fluid | turbo_encabulator_fluid | .5 (2.89) | C | fluid simulation; 7–11 ms at .5 on file | F2 P |

### Batch 2 (15 scenes, `builtin.ts` L1216–1350)
| id | Name | glsl | res (k) | Grp | Knob (B) or why (C) | Flags |
|---|---|---|---|---|---|---|
| voronoi-geode | Voronoi Geode | voronoi_geode | .25 (11.56) | C | 32 steps × 9 Voronoi cells, L316 | P |
| bouncy-hexagons | Bouncy Hexagons | bouncy_hexagons | .25 (11.56) | **B** | L89: `max_marches_1 = 90.` → `max_marches_1 = 60.` · note `"max_marches_1 90 → 60"` | F1 |
| alien-cavern | Alien Cavern | alien_cavern | .25 (11.56) | **B** | L246: `i<200` → `i<120` in `for(int i=0;i<200;i++)` · note `"march cap 200 → 120"` | P V |
| churning | Churning | churning | .5 (2.89) | A | | F4 V |
| compound-iris | Compound Iris | compound_iris | .35 (5.9) | C | 5 passes; 12 ms at .5 on file | F5 |
| dispersion | Dispersion | dispersion | .5 (2.89) | **B** | L328: `#define SAMPLES 34` → `#define SAMPLES 16` · note `"SAMPLES 34 → 16"` | F2 P (L370: the spread rides Presence) |
| fluid-body | Fluid Body | fluid_body | .33 (6.63) | C | 10 passes; 13 ms at .5 on file | F10 |
| glassier | Glassier | glassier | .35 (5.9) | C | 3 passes; 12 ms at .5 on file | F3 V |
| glob | Glob | glob | .5 (2.89) | C | the loop count is a runtime value, L88 | |
| milk-honey-smoke-bile | Milk, Honey, Smoke, Bile | milk_honey_smoke_bile | .5 (2.89) | A | | F2 |
| lattix | Lattix | lattix | .5 (2.89) | C | 50-step march, L91 | F1 P |
| scaffold-fractal | Scaffold Fractal | scaffold_fractal | .5 (2.89) | C | 25 × 4 light sum, L99 / L47 | P |
| swarm-meebs | Swarm (Meebs) | swarm | .5 (2.89) | C | 40 particles per pixel are the look | F2 P |
| deeper | Deeper | deeper | .6 (2.01) | C | 70-step march; 11 ms at res 1 on file | F1 P V |
| entombed-silicon-dreams | Entombed Silicon Dreams | entombed_silicon_dreams | .25 (11.56) | C | 50 steps × 7 octaves, L367 / L254 | F4 |

### Batch 3 (15 scenes, `builtin.ts` L1352–1478)
| id | Name | glsl | res (k) | Grp | Knob (B) or why (C) | Flags |
|---|---|---|---|---|---|---|
| boreal | Boreal | boreal | .75 (1.28) | A | | F1 V |
| cloudten | Cloud Ten | cloudten | .5 (2.89) | C | two 70-step cloud marches; 10 ms at res 1 on file | F2 P |
| cosmic-dust | Cosmic Dust | cosmic_dust | .5 (2.89) | C | 13 ms at res 1 on file | F2 |
| gaussian-smoothlife | Gaussian SmoothLife | gaussian_smoothlife | .75 (1.28) | **B** | `builtin.ts`: `values: { scale: 1.13 }` → `values: { scale: 1.2 }` (the kernel is in texels: 1.3 × √.85) · note `"scale 1.13 → 1.2 (kernel in texels: 1.3 x sqrt(.85))"` | F3 P V |
| hexoplanet | HEXOplanet | hexoplanet | .25 (11.56) | C | the march, L141; 13.5 ms at .5 on file | F1 V |
| replik8 | replik8 | replik8 | .6 (2.01) | C | 12 ms at res 1 on file | F1 P |
| stained-glass | Stained Glass | stained_glass | .5 (2.89) | C | 11 ms at res 1 on file | F1 P |
| transparent-isoslices | Transparent Isoslices | transparent_isoslices | .3 (8.03) | C | 50-slice sum, L136 | |
| kifs-flythrough | KIFS Flythrough | kifs_flythrough | .6 (2.01) | **B** | L270: `maxIterationsShad = 16` → `maxIterationsShad = 8` · note `"maxIterationsShad 16 → 8"` | F1 |
| redrum | REDRUM | redrum | .5 (2.89) | A | | F2 P V |
| vein-melter | Vein Melter | vein_melter | .5 (2.89) | A | | F2 V |
| shrouded | Shrouded | shrouded | .5 (2.89) | C | 3 passes of 8-tap blur columns | F3 P |
| molten | Molten | molten | .5 (2.89) | C | the same blur columns + a march | F3 |
| tunnel-beauty-6 | Tunnel Beauty 6 | tunnel_beauty_6 | .6 (2.01) | C | 90-step march, L171; 9.5 ms at res 1 on file | F1 P |
| terrain-lattice | Terrain Lattice | terrain_lattice | .8 (1.13) | A | | F1 P V |

### Batch 4 (11 scenes, `builtin.ts` L1480–1600)
| id | Name | glsl | res (k) | Grp | Knob (B) or why (C) | Flags |
|---|---|---|---|---|---|---|
| traced-tunnel | Traced Tunnel | traced_tunnel | .75 (1.28) | A | | P |
| logo-grid-pulses | Logo Grid Pulses | logo_grid_pulses | .5 (2.89) | A | | F4 V |
| lost-in-the-sauce | Lost in the Sauce | lost_in_the_sauce | .5 (2.89) | A | | F2 |
| fuzzy-signal | Fuzzy Signal | fuzzy_signal | .25 (11.56) | C | the 30-step pattern is the look, L65; 12 ms at .5 on file | F1 P |
| hextunnel | HexTunnel | hextunnel | .5 (2.89) | C | 80-step march, L157 | F1 P V |
| fire-tunnel | Fire Tunnel | fire_tunnel | .7 (1.47) | C | 100 steps, the step size is tied to the count, L127 | F1 |
| ray-marching-experiment-62 | Ray Marching Experiment 62 | ray_marching_experiment_62 | .25 (11.56) | C | 200 steps feed the light sum, L144 | P V |
| primitiv-logik | PRIMITIV_logik | primitiv_logik | .6 (2.01) | **B** | L193: `#define SAMPLES 32` → `#define SAMPLES 16` · note `"SAMPLES 32 → 16"` | F1 V |
| deeper-v2 | Deeper V2 | deeper_v2 | .35 (5.9) | C | 140-step march, L477 | |
| neon-city | Neon City by Night | neon_city | .35 (5.9) | C | path tracing; 15 ms at .35 on file | F3 V |
| skaiwalker-og | Skaiwalker OG | SkaiWalkerOG | .5 (2.89) | A | | F2 P V |

## Pilot (2026-11-19, done on the guide's branch)
| id | Name | glsl | res (k) | Grp | Change | Stills (mean luma before → after) |
|---|---|---|---|---|---|---|
| circuit-bending | Circuit Bending | circuit_bending | .5 (2.89) | A | res only | 27.5 → 27.4, the same picture |
| raymarched-reflections | Raymarched Reflections | raymarched_reflections | .25 (11.56) | B | `maxIterationsShad` 24 → 12 (L221) | 48 → 60, the cubes go from blocks to sharp edges, the shadows hold |
| mandelbrot-decoration | Mandelbrot Decoration | mandelbrot_decoration | .5 (2.89) | B | `#define AA` 2 → 1 (L113) | 96.5 → 92.9, sharper, no visible aliasing |
| hills-eels | Hills, Eels | hills_eels | .5 (2.89) | A | **held at .5**, applied and undone (§ Open findings 1) | 122.5 → 0 |

- Compile: 3 × `OK`, exit 0. Gates: lint 0, typecheck 0, test 0 (722 passed). Triage after: 56 targets.
- **The other B knobs were tried the same way and then undone** (apply, compile, still pair, undo): `bouncy-hexagons` 90 → 60, `dark-twister` 90 → 60, `alien-cavern` 200 → 120, `dispersion` 34 → 16, `primitiv-logik` 32 → 16, `kifs-flythrough` 16 → 8. Each compiled and kept its picture (the luma moved by less than 10 %), with no holes. `gaussian-smoothlife` is the one B row without a picture check: its before-still was `BLACK` in the headless run, so expect to skip it by Recipe step 4.
- What the pilot changed in this guide:
  1. `apply.mjs` exists: two hand edits per scene in a 1 600-line file were the likely place for a slip. `--undo` was added when the first scene had to be undone.
  2. The knob edit comes before the script, so the row's line number is still valid.
  3. The `// VJW:` comment sits on its own line above the knob, never at the end of a `#define` line.
  4. The before-still is mandatory and is the control (pitfall 1).
  5. `still.mjs` exits 1 when a frame is not `OK`: do not chain a later command to it with `&&`. Run one `still.mjs` at a time.

## Open findings (for the lead, not for the batch coders)
1. **`Hills, Eels` is held at res .5.** Headless on the Kanine track it is `OK` 4.3 s after a cut and `BLACK` (luma 0) at 4.9 s, 7.6 s, 10 s and 15 s, at res .5 (master's state) and at .85 alike. The res raise is not the cause. Either the scene dies a few seconds after a cut, or the headless seek starves it. It needs its own look before anyone changes its res.
2. **`Gaussian SmoothLife` is `BLACK` in the before-still** at master's res .75 (one run). Same question as item 1.
3. **`Thresholder` after 12 s on the scene is almost solid magenta** (res .5, `HOLD=12000`). At the default 4 s hold it was not looked at.
4. **The cost of group C is real.** The readings on file say most of these scenes sit at their res because they hit the 5–7.5 ms line there. Worst cases by arithmetic (reading on file × k, if the cost is pixel-bound): `beats-in-4d` 10.8 ms at .25 × 11.56, `entombed-silicon-dreams` 13.1 at .25, `dark-twister` 7.5 at .25, `ray-marching-experiment-62` 6.5 at .25, `exoplanet` 6.4 at .25, `alien-cavern` 6.0 at .25, `voronoi-geode` 5.5 at .25, `neuron-proximitors` 4.3 at .25, `neon-city` 15.3 at .35 × 5.9, `deeper-v2` 6.8 at .35, `fuzzy-signal` 11.9 at .5 × 2.89, `hexoplanet` 13.5 at .5. In `60-adaptive` mode the governor will lower the output scale on them, so part of the res gain is given back. A lower target for the res-.25 rows (for example .5, k = 4) is the lever if the user sees stutter.
5. **Flash safety was not re-read.** A res change does not touch a ⚡ input, but I-FL1 was measured at the old res. The app-wide flash gate still applies.

## Batch ids and files (copy these)
Generated from `targets.json`. The first line is the id list for `still.mjs`, the second the file list for `check.mjs`.

**Batch 1** (14)
```
builtin:beats-in-4d,builtin:dark-twister,builtin:kaleidowhoa-man,builtin:min-max-hex,builtin:overload,builtin:beamers,builtin:hex-array,builtin:gpu-melter,builtin:neuron-proximitors,builtin:thresholder,builtin:exoplanet,builtin:sprinkles,builtin:square-shoals,builtin:turbo-encabulator-fluid
web/src/fx/syn/beats_in_4d.glsl web/src/fx/syn/dark_twister.glsl web/src/fx/syn/kaleidowhoa_man.glsl web/src/fx/syn/min_max_hex.glsl web/src/fx/syn/overload.glsl web/src/fx/syn/beamers.glsl web/src/fx/syn/hex_array.glsl web/src/fx/syn/gpu_melter.glsl web/src/fx/syn/neuron_proximitors.glsl web/src/fx/syn/thresholder.glsl web/src/fx/syn/exoplanet.glsl web/src/fx/syn/sprinkles.glsl web/src/fx/syn/square_shoals.glsl web/src/fx/syn/turbo_encabulator_fluid.glsl
```

**Batch 2** (15)
```
builtin:voronoi-geode,builtin:bouncy-hexagons,builtin:alien-cavern,builtin:churning,builtin:compound-iris,builtin:dispersion,builtin:fluid-body,builtin:glassier,builtin:glob,builtin:milk-honey-smoke-bile,builtin:lattix,builtin:scaffold-fractal,builtin:swarm-meebs,builtin:deeper,builtin:entombed-silicon-dreams
web/src/fx/syn/voronoi_geode.glsl web/src/fx/syn/bouncy_hexagons.glsl web/src/fx/syn/alien_cavern.glsl web/src/fx/syn/churning.glsl web/src/fx/syn/compound_iris.glsl web/src/fx/syn/dispersion.glsl web/src/fx/syn/fluid_body.glsl web/src/fx/syn/glassier.glsl web/src/fx/syn/glob.glsl web/src/fx/syn/milk_honey_smoke_bile.glsl web/src/fx/syn/lattix.glsl web/src/fx/syn/scaffold_fractal.glsl web/src/fx/syn/swarm.glsl web/src/fx/syn/deeper.glsl web/src/fx/syn/entombed_silicon_dreams.glsl
```

**Batch 3** (15)
```
builtin:boreal,builtin:cloudten,builtin:cosmic-dust,builtin:gaussian-smoothlife,builtin:hexoplanet,builtin:replik8,builtin:stained-glass,builtin:transparent-isoslices,builtin:kifs-flythrough,builtin:redrum,builtin:vein-melter,builtin:shrouded,builtin:molten,builtin:tunnel-beauty-6,builtin:terrain-lattice
web/src/fx/syn/boreal.glsl web/src/fx/syn/cloudten.glsl web/src/fx/syn/cosmic_dust.glsl web/src/fx/syn/gaussian_smoothlife.glsl web/src/fx/syn/hexoplanet.glsl web/src/fx/syn/replik8.glsl web/src/fx/syn/stained_glass.glsl web/src/fx/syn/transparent_isoslices.glsl web/src/fx/syn/kifs_flythrough.glsl web/src/fx/syn/redrum.glsl web/src/fx/syn/vein_melter.glsl web/src/fx/syn/shrouded.glsl web/src/fx/syn/molten.glsl web/src/fx/syn/tunnel_beauty_6.glsl web/src/fx/syn/terrain_lattice.glsl
```

**Batch 4** (11)
```
builtin:traced-tunnel,builtin:logo-grid-pulses,builtin:lost-in-the-sauce,builtin:fuzzy-signal,builtin:hextunnel,builtin:fire-tunnel,builtin:ray-marching-experiment-62,builtin:primitiv-logik,builtin:deeper-v2,builtin:neon-city,builtin:skaiwalker-og
web/src/fx/syn/traced_tunnel.glsl web/src/fx/syn/logo_grid_pulses.glsl web/src/fx/syn/lost_in_the_sauce.glsl web/src/fx/syn/fuzzy_signal.glsl web/src/fx/syn/hextunnel.glsl web/src/fx/syn/fire_tunnel.glsl web/src/fx/syn/ray_marching_experiment_62.glsl web/src/fx/syn/primitiv_logik.glsl web/src/fx/syn/deeper_v2.glsl web/src/fx/syn/neon_city.glsl web/src/fx/syn/SkaiWalkerOG.glsl
```
