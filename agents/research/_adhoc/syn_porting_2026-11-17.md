# How to port a donor `.synScene` scene (synScene adapter, merged `41eedc0`)

## TL;DR
- The adapter (`web/src/fx/syn.ts`) runs donor GLSL 330 scenes on the ISF pass runtime. One port = one `web/src/fx/syn/<name>.glsl` file + one built-in entry.
- Done: `syn/beats_in_4d` (Library-only), `syn/dark_twister`, `syn/kaleidowhoa_man` (starred). Copy their pattern.
- Batches B1–B4 below cover all 87 scenes once. B1 and B2 can be ported now. B3 needs the IMAGES adapter step. B4 needs the media stub.

## Freshness
- 2026-11-17, from the adapter coder's report (branch head `61187d1`, merged as `41eedc0`). Lead copy for the porter lanes.

## Steps per scene
1. **Create `web/src/fx/syn/<name>.glsl`.** `scratchpad/donor-vs2/port.py` shows the steps.
   - Three header lines: `// Source: donor/visual_system_2/scenes/release/<name>.synScene · <licence>`, `// Author: <CREDIT>`, `// License: <the file's own, else unknown>`.
   - Then `/*{TITLE, CREDIT, TAGS, WIDTH, HEIGHT, PASSES, IMAGES, CONTROLS}*/`, taken from `scene.json`. Add the tag `donor` to TAGS.
   - Then `main.glsl` verbatim, keeping its licence comments.
2. **Fix ES 3.00 errors by hand.** Run `node scratchpad/donor-vs2/glcheck.mjs <fs>` or the scan.
   - Int literals in float maths: `2*x` → `2.0*x`, `x/2` → `x/2.0`.
   - `textureSize` used as a `vec2` → `vec2(...)`.
   - The adapter already handles global initializers, `PASSINDEX`, `FRAMECOUNT`, the `syn_*` names and colours.
3. **Transcribe `script.js` into `"VJW_CLOCK"`:** `{"<uniform>": [[k, "input", ...], ...]}`, a sum of products per second.
   - Multiply by 60 when the script adds per frame without `dt`.
   - A square: repeat the name. `pow(x, 1.9)`: approximate as `x, x`.
   - A vector `setUniform` becomes `v_x` / `v_y` clocks; edit the body from `v.x` to `v_x`.
   - Camera paths, random re-rolls and event hooks have no data form yet. Approximate them simply, or drop them and note it.
   - NEVER execute the donor's `script.js`.
4. **Read `parseSyn(...).unsupported`.** It lists every gap. If a scene is flagged, leave it and report the reason.
5. **Flash safety:** put every hit-driven brightness input in `VJW_FLASH`, bound from 0.
6. **Add the built-in** at the end of OWN in `web/src/scenes/builtin.ts`: `gen: {ref: 'syn/<name>', bind: syn(<every bound syn_* the def lists>)}`.
   - Use res .25 for raymarchers.
   - **Star a scene only if it passes I-FL1 (≤ 3 luma steps > .10 in any 1 s) AND billed p95 ≤ 5 ms. Otherwise set `star: false` (Library-only).**
7. **Do NOT edit `THIRD_PARTY.md` or `syn.ts`.** The lead runs `node scripts/shaders.mjs` and pastes the syn table at merge. If a scene needs an adapter change, report it and leave the scene.
8. **Checks:**
   - gates;
   - `scratchpad/donor-vs2/compile.mjs`: non-blank, no NaN;
   - `scratchpad/donor-vs2/stills.mjs`: one still per scene;
   - flash: `scratchpad/donor-vs2/g3-bench.mjs`, mode `60s flash audit` (env `LIST` = JSON list of your ids, `SEC=30`) on dnb174-arr, all your scenes in one page;
   - billed p95: `TAIL=1 SEC=20 NOREF=1` per scene.
   - **Restart Vite before every harness run.** After any `web/src` edit, a harness `import('/src/app.ts')` creates a second app that starves the analysis.

## Batches (all 87, each scene once)
- **B1, ES literal fixes only (20):** PLUS alien_cavern canvas churning compound_iris dispersion fluid_body glassier glob milk_honey_smoke_bile nova pop quicksand rearranged sprinkles square_shoals sun_set turbo_encabulator_fluid circles5 hills_eels
- **B2, clocks + manual control decisions (19):** meta_experiment_3 min_max_hex neuron_proximitors overload thresholder beamers exoplanet fractilian_foundation gpu_melter hex_array hue_review inkshot lattix myoplasm scaffold_fractal swarm deeper logo_grid_pulses entombed_silicon_dreams
- **B3, after the IMAGES adapter step (18):** biopsy biopsy_v2 boreal cloudten cosmic_dust dynamical_flame gaussian_smoothlife glitch hexoplanet kifs_flythrough molten redrum replik8 shrouded stained_glass transparent_isoslices vein_melter voronoi_geode
- **B4, after the media stub (25):** SkaiWalkerOG bouncy_hexagons circuit_bending deeper_v2 equirectangular filter_blown fire_tunnel fuzzy_signal hextunnel lost_in_the_sauce mandelbrot_decoration neon_city primitiv_logik ray_marching_experiment_62 raymarched_reflections sinusoidal_warp terrain_lattice traced_tunnel tunnel_beauty_6 videofx_directionalblur waterly raw_video videofx_1 pxl_sort_1 audio_indicators
- **Skip:** test_card, midi_mapping (utilities). **Done:** beats_in_4d, dark_twister, kaleidowhoa_man.

## Known extra work
- **Media-only (nothing to show without media):** raw_video, videofx_1, videofx_directionalblur, equirectangular, sinusoidal_warp, pxl_sort_1.
- **Heavy JS (> 60 lines):** molten, thresholder, neon_city, biopsy, raymarched_reflections, deeper_v2, deeper, primitiv_logik, alien_cavern, circuit_bending, lattix.
- **Likely L-cost:**
  - donor GPU rating 5: neuron_proximitors, ray_marching_experiment_62, raymarched_reflections, traced_tunnel;
  - donor GPU rating 4: alien_cavern, compound_iris, fuzzy_signal, transparent_isoslices, vein_melter, videofx_directionalblur, voronoi_geode;
  - also fluid_body (10 passes) and neon_city (path tracing).
- **Spectrum texture:** audio_indicators, bouncy_hexagons, entombed_silicon_dreams, neon_city. **Non-public names:** exoplanet `syn_BassExpoCurve`, audio_indicators `syn_InputLevel`.

## Update after adapter step 2 (`syn-adapter-2`, 2026-11-17)
- **IMAGES:** the adapter loads IMAGES from `web/public/syn/<scene>/<PATH>` (PATH as in scene.json). All 18 B3 scenes' files are copied. When porting a B4 scene that has IMAGES (circuit_bending, equirectangular, fire_tunnel, hextunnel, terrain_lattice, traced_tunnel, waterly), copy only the listed files from `donor/…/<scene>.synScene/<PATH>`. Images are upright, REPEAT, mipmapped, and black until loaded.
- **Pass sizes:** a side under 8 px keeps exact pixels; WIDTH/HEIGHT 0 = the frame's size. Target wrap defaults to repeat (unless `WRAP: clamp`). The screen pass writes alpha 1.
- **Media stub:** `syn_Media` / `syn_UserImage` are black, `syn_MediaType` = 0. Media-only scenes (raw_video, videofx_1, videofx_directionalblur, equirectangular, sinusoidal_warp, pxl_sort_1) compile but show nothing: skip them or make them Library-only.
- **`syn_Spectrum`:** the 1D calls are rewritten automatically. ⚠️ Our FFT is linear, the donor's may be log: a range like 0.05–0.55 reads 1–13 kHz here (the hats band). Retune frequency controls via `values` if a scene only reacts to hats.
- **Controls:** `bang counter` and `traveler` work with no edits (override a traveler's speed with a same-name `VJW_CLOCK` entry). xy scalar defaults, colours without a default, and bang DEFAULT 1 are fixed in the adapter. Copy `HARD_TRANSITIONS` / `SMOOTH_TRANSITIONS` into the header (port.py does not yet); they become static controls. Per-scene workarounds from B1/B2 are harmless (declared controls win).
- **Still unsupported:** `FILTER mipmap` passes (entombed_silicon_dreams, logo_grid_pulses), pass `TYPE float` (lost_in_the_sauce), `syn_LevelTrail` / `syn_InputLevel` (audio_indicators). Report these and leave them.
- **Measurement:** with several lanes on the GPU, billed p95 reads 1.2–1.9× high: take the lowest run; a solo rerun decides borderline stars.

## Update after adapter step 3 (`syn-adapter-3`, 2026-11-18)
- Preamble: the meta-control stubs return the neutral result, and `_loadImage` / `_textureImage` work.
- Passes: no FLOAT key means HDR (half float). Write `FLOAT: false` only where 8-bit is faithful or HDR costs frame time (churning). `TYPE float` is HDR. `FILTER mipmap` works.
- New feeds: `syn_LevelTrail` (256 frames; r all, g bass, b mid, a high; newest at x = 1), `syn_InputLevel` (the HUD meter, linear), `syn_BassExpoCurve` (subBody²).
- Controls:
  - A `slider speed` control is a clock; its panel input is `<name>_`.
  - A bang rests at its MIN.
  - A toggle whose DEFAULT lies between MIN and MAX starts at MIN (when DEFAULT is 0) or at MAX.
  - A `FRAMECOUNT` compare with an int literal compiles.
  - A dropdown with VALUES still reads its index: map it in the body.
- Raws: Toggle / RandomOnBeat, BeatTime (one step per beat), BPMTwitcher, Intensity = max(energy, build, drop), InputLevel and BassExpoCurve are raws. They are not inputs and do not go in `bind`. Hits peak at 1. SOFT_* = attack .04 × 6.
- Built-ins: a built-in may also bind its scene's controls. To make a size or bang control ride `build` or `drop`, bind the control directly in builtin.ts and leave the body as the donor wrote it (see tunnel_beauty_6, traced_tunnel, raymarched_reflections).
- Media is still a stub. If a look needs a logo, add your own IMAGES file and read it through `_loadImage`.
- Donor scenes assume a 16:9 frame; our stage is 1.55. Anything at `|_uvc.x|` > .77 is off-screen.
- If a dropped track never plays, run Chrome with `--disable-audio-output` (env `ARGS`).
