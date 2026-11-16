# Donor scan: `donor/visual_system_2/` (reverse-engineered macOS live-visual app)

## TL;DR
- 87 shipped `.synScene` scenes (GLSL 330 `main.glsl` + `scene.json` + optional `script.js`), a public GLSL helper library (`glsl/01–05`), a meta-control post chain (`glsl/07`), a Shadertoy importer (`protocol/shadertoy_conversion.txt`) and a 43-name audio-uniform API (`syn_*`).
- ~75 of 87 scenes are generators with optional media; 47 use a JS `update(dt)` script, mostly as audio-driven clocks (`pos += (base + k·audio)·dt`). We have no per-uniform equivalent of these audio clocks (`syn_BassTime`, `syn_BPMTwitcher`, script accumulators).
- Shader value: mrange (CC0) raymarch/4D/neon pieces, Shane's raymarch set (Shadertoy URLs, no licence line; Shadertoy default licence ⚠️ unverified per shader), cornusammonis multi-buffer fluids/RD, Meebs/Flexi feedback stacks. 31 scenes name a Shadertoy source URL.
- `audio_indicators` is the app's own "what the system hears" view: 5 stacked bands (raw FFT, two FFT variants, waveform with hue-decaying trail, bass/mid/high level history) + input level meter with peak-hold and a smoothed meter (§6).
- Top of the §3 ranking: bouncy_hexagons, beats_in_4d, dark_twister, neon_city, molten, voronoi_geode, compound_iris, cloudten, nova, entombed_silicon_dreams. Four of them are CC0 (mrange).

## Freshness
- Scanned 2026-11-17. Donor: app v1.25.4.188 (`report.md` L1). Our side: master `956410d`.
- Read: `report.md` §1, §2, §4, §5, §6, §8, §9; `glsl/01–07`; `protocol/*`; all 87 `scene.json`; `main.glsl` / `script.js` by grep plus ~10 partial reads; 87 thumbnails viewed as 320×180 contact sheets (built in `/tmp`, not in the repo); the UI bundle `src/App.app/Contents/Resources/views/bundle.*.js` grepped as text only (nothing executed).
- Thumbnails: bouncy_hexagons and turbo_encabulator_fluid were re-checked at full size from their `IMAGE_PATH` (the first sheet picked a texture); hue_review has no `IMAGE_PATH` (default thumbnail only); 8 scenes ship `.jpg` thumbnails, 6 `.png` files are JPEG data.
- Not read: report §3 (overlay modes; §5 below covers them via `glsl/07`), §7 (DSP). DSP pointer: `report.md` §7 L256–300 is covered by `audio-dsp` → `agents/audio-dsp/dsp_formula_review_2026-11-17.md`.
- Provenance: the report anonymises the app ("app", `<vendor>`); this artifact keeps that. The scene files keep their original CREDIT and licence comments.

## §1 What the donor is
- **Engine** (`report.md` L10–30, L31–60): ObjC shell + C++ render engine on OpenGL core 330; DSP in a separate C++ framework; React UI in WKWebView; Duktape JS for scene scripts. Render is NSTimer-driven at `1/FPS` on the main thread, not vsync; `dt` clamped to [1/240, 0.5] s (L44–45). `AudioEngine::update(dt)` runs inside the render tick (L54–55).
- **Scene transitions** (L58–64, `glsl/07` crossfade block): per-pass uniforms are snapshotted with `sceneA_`/`sceneB_` prefixes; a built-in shader mixes `texture(sceneA,_uv)` and `texture(sceneB,_uv)` by `sceneMix`. `HARD_TRANSITIONS` in `scene.json` disables the fade (L190).
- **Scene format** (L174–215): folder with `main.glsl`, `scene.json`, optional `script.js`, thumbnail, optional `images/`. `scene.json` keys: `TITLE, DESCRIPTION, CREDIT, TAGS[], WIDTH/HEIGHT, GPU, MEDIA, IMAGES[], PASSES[], CONTROLS[], HARD_TRANSITIONS, IMAGE_PATH`.
- **Passes / feedback:** `PASSES[]` entries `{TARGET, WIDTH, HEIGHT, FLOAT, FILTER, WRAP}`; the engine auto-declares `sampler2D <TARGET>` (L183–189). No `PERSISTENT` key exists in any of the 87 files: a pass that samples its own TARGET reads last frame's content (e.g. `fuzzy_signal` one `feedback` target; `turbo_encabulator_fluid` BuffA/BuffB ping). `syn_FinalPass` = the previous final frame, a free whole-frame feedback (used by boreal, bouncy_hexagons, canvas, dark_twister, entombed_silicon_dreams, myoplasm). The last pass index in `main.glsl` (`PASSINDEX == N`, N = pass count) is the screen output.
- **GLSL entry:** `vec4 renderMain()` with `if (PASSINDEX == k)` dispatch (L203–208). Preamble supplies `_xy, _uv, _uvc` (aspect-centred), `RENDERSIZE, TIME, FRAMECOUNT, PASSINDEX, _mouse` (`glsl/01_preamble.txt` start; `protocol/uniform_binding_list.txt`).
- **Media inputs:** `syn_UserImage` (raw CPU media), `syn_Media` (media after meta-controls, pass 0 of `glsl/07`), `IMAGES[]` → named samplers (e.g. `colornoise`). Nearly every scene guards media with `_isMediaActive()` and renders without it (grep of `_isMediaActive|_loadMedia` over all `main.glsl`). Media-only scenes: raw_video, videofx_1, videofx_directionalblur, equirectangular (its fallback is static), sinusoidal_warp, pxl_sort_1.
- **Controls:** `CONTROLS[]` `{NAME, TYPE, MIN, MAX, DEFAULT, PARAMS, UI_GROUP}`; each becomes a GLSL uniform and a JS global (L194–201). Types across the 87 files: toggle 307, slider smooth 223, slider 142, bang smooth 78, xy smooth 66, toggle smooth 53, knob smooth 49, knob 36, bang 23, color 21, bang counter 16, dropdown 8+5, "traveler" variants 11 (jq over `CONTROLS[].TYPE`). `PARAMS` on `smooth` types = exponential smoothing factor (L198).
- **How a scene reads audio:** GLSL reads `syn_*` floats and the `syn_Spectrum` / `syn_LevelTrail` textures directly; `script.js` reads the same names as globals or `inputs.syn_*`, integrates them over `dt`, and pushes results through `setUniform` (`report.md` L245–253; e.g. `dark_twister/script.js` L5–12, `molten/script.js` L47–105).
- **Shader language facts that matter for a port:** GLSL 330 (`texelFetch`, `textureSize`, `round`, integer ops, dynamic loops). Our toy path compiles ES 3.00 single pass (`web/src/fx/catalog.ts:61`); our ISF path compiles ES 1.00 with PASSES/PERSISTENT/FLOAT/IMPORTED (`web/src/fx/isf.ts:35,114–121,148`); natives own their ES 3.00 programs (`web/src/scenes/history.ts:2–3`).

## §2 Scene inventory (87)
Sources: `scenes/release/<name>.synScene/{scene.json,main.glsl,script.js}`; look from the thumbnail; technique from `TAGS` + grep of `main.glsl` (raymarch loop, own-TARGET reads, `_fbm`, polar folds). Audio legend: band prefix B/M/MH/H (none = all bands); `L` Level, `Hi` Hits, `P` Presence, `T` band Time; `Beat` OnBeat, `Tog` ToggleOnBeat, `Rnd` RandomOnBeat, `BeatT` BeatTime, `Sin`/`Tri`n, `Twit` BPMTwitcher, `Conf` BPMConfidence, `Curv` CurvedTime, `Fade` FadeInOut, `Int` Intensity, `Spec` Spectrum tex. Passes: count of `PASSES[]`, F = FLOAT, `FP` = reads `syn_FinalPass`, img = `IMAGES[]`, JS = has `script.js`, G = `GPU` field (0–5; ⚠️ meaning inferred as load rating). Cost route: T = our toy path (ES 3.00, single pass, `fx/catalog.ts:61`), I = ISF (ES 1.00 + PASSES, `fx/isf.ts`), N = native scene. Licence: "NC-SA" = explicit CC BY-NC-SA 3.0 comment; "ST id" = Shadertoy source URL in the file (no licence line ⇒ Shadertoy's site default, ⚠️ unverified per shader).

| # | name | look (≤6 words) | technique · helpers | audio | passes / fb / media | cost | overlap | author / licence |
|---|---|---|---|---|---|---|---|---|
| 0 | alien_cavern | blue/orange contour-line cave | RM + iso bands · `_palette _pixelate _gamma` | BL BT BeatT BPM Sin4 HHi P | 0 · JS · G4 | M T | native/isobars | aiekick · NC-SA · ST Xsf3zX |
| 1 | audio_indicators | spectrum/wave/level debug bands | bars + hsv-decay trail · `_map _sqPulse _inRange _rgb2hsv` | InputLevel, Spec, LevelTrail | 2F fb · JS | S N/UI | new (monitor) | none |
| 2 | beamers | white light beams, dark | 2D beam fan · `_palette _rand` | BHi BL BP BT BPM HT P | 1 · JS · G1 | S I | rave-lasers | sheltron |
| 3 | beats_in_4d | 4D fractal glow-orb burst | 4D rotate + inversion fold, 79-step march | BL BHi; BassTime clock (JS) | 0 · JS · G1 | M T | new | mrange · CC0 |
| 4 | biopsy_v2 | orange RD worm field | 4-buffer RD + fbm + polar fold | 13 incl. Rnd BeatT | 4F · img colornoise · G2 | L I/N | reaction-diffusion | Meebs ft. Flexi |
| 5 | biopsy | blue-white RD cells | 4-buffer RD + fbm warp | 14 incl. Tri2 | 4F · img · JS · G3 | L I/N | reaction-diffusion | Meebs ft. Flexi |
| 6 | boreal | pink/blue smeared aurora | FP feedback + fbm warp + 4 overlay images | BHi BL BP Fade Int MHP PrimeBang Spec | 1 · FP · 4 img · JS | M I | flow-smear | Alex Rowe |
| 7 | bouncy_hexagons | white hex pillars, red spectrum bumps | RM hex grid, height = `syn_Spectrum.z` · `_rotate _pulse` | BP ML MHL Spec | 1F · FP · img t_fbm · JS · G1 | M N | new | mrange · CC0 (+iq MIT, WTFPL helpers) |
| 8 | canvas | grey ring, beat-flash dot | FP feedback 2D | BT Conf Tri Tri2 Beat Rnd | 0 · FP | S I | feedback-ring | none |
| 9 | churning | red/green psychedelic smear | 4-pass feedback + separable blur · `_fbm` | 14 incl. Tog Rnd | 4 | M I | rainbow-trails | Victor S. |
| 10 | circles5 | white half-discs, trails | 1-buffer feedback | BL BP | 1 · JS | S I | edge-rings | Keijiro Takahashi |
| 11 | circuit_bending | dark circuit-board tunnel | RM tunnel, triplanar circuit textures · `_fbm _triWave` | BHi BL BP BeatT Twit HHi HL HT Hi L P | 0 · 2 img · JS · G3 | M T | tunnel | mojovideotech · NC-SA |
| 12 | cloudten | clouds over glowing city grid | RM volumetric clouds + fbm | BP HP L P | 2 · img · JS · G3 | M N | new | nimitz · ST 4sX3Rs |
| 13 | compound_iris | glitchy RGB-split light rings | SDF rings + H/V blur + RGB split chain | BP BT BeatT Sin2 Twit Curv Fade HHi HP MP P | 5 (1F) · G4 | M I | edge-rings | Meebs |
| 14 | cosmic_dust | coloured star dust field | fbm/cell star field + backbuffer | BL Fade HHi HP HT MHHi ML MP | 2 · img · JS | M I | builtin:stars | Kali x Meebs |
| 15 | dark_twister | neon purple/cyan spiral vortex | 3-fold abs-fold 2D fractal on twisted tunnel, FP blur | BHi BL BP BT Hi MHP MP | 0 · FP · JS · G1 | S T | builtin:vortex | mrange · CC0 (+iq MIT) |
| 16 | deeper_v2 | ring tunnel, white ray burst | polar rings + light rays · `_palette _toPolarTrue _nsin` | BL BP BT BeatT BPM Curv HHi HT Int MHL Beat | 0 · JS | M T | light-tunnel | Meebs |
| 17 | deeper | rainbow blade tunnel | RM tunnel · `_palette` | BL BP BT BeatT BPM HHi HP HT Beat P | 1 · JS · G2 | M T | tunnel | Meebs |
| 18 | dispersion | chromatic oily fluid | 2-buffer advection + chromatic dispersion | BL HHi HL Beat P | 2F · G3 | M I | liquid-chrome | cornusammonis |
| 19 | dynamical_flame | red flame turbulence | 2-buffer dynamical system, mipmapped image | BL HHi P | 2F · img | M I | lava-smoke | cornusammonis |
| 20 | entombed_silicon_dreams | synthwave mountains, purple sky | RM terrain, spectrum rows, FP motion blur | BHi BL Spec | 4 · FP · JS | M N | wave-landscape | mrange · CC0 · ST flSXRV |
| 21 | equirectangular | equirect media projection | UV remap (media-only) | — | 0 · img | S I | tiny-planet | Shady Headstash |
| 22 | exoplanet | glowing particle-web planet | RM sphere + mirror + RGB-split post · `_smin` | BassExpoCurve BHi BL BT Sin4 Twit Fade HHi Int | 3 (1F) · G2 | M N | builtin:orb | Meebs ft. WAHa_06x36 |
| 23 | filter_blown | blue/orange blown texture | feedback + Sobel + pixelate | BL BT BeatT Conf Sin2 Sin4 HHi Beat Tog | 2 · G1 | M I | glitch | Meebs |
| 24 | fire_tunnel | dusky smoke tunnel | RM fire tunnel | BHi BL BP BPM HHi HP MP | 1 · img · JS | M T | tunnel | aiekick · NC-SA · ST ltBSzV, MljXDw |
| 25 | fluid_body | pink/peach marbled fluid | 10-buffer flow field (fb0/1 + flow1–8) | BHi Conf Tri Tri2 HHi MHL ML | 10F · JS · G3 | L N | builtin:fluid | Victor S. |
| 26 | fractilian_foundation | teal/yellow kaleido fractal | kaleido fractal + feedback · `_palette` | BT Sin4 P Tog | 1 | S I | builtin:fractal | mojovideotech · NC-SA |
| 27 | fuzzy_signal | white glitch blocks, RGB fringe | own-target feedback, cell blocks · `_statelessContinuousChaotic` | BL BT BeatT Twit HHi P | 1F · G4 | S I | bloom-glitch | Meebs |
| 28 | gaussian_smoothlife | blue SmoothLife worms | separable-Gaussian SmoothLife CA | BHi BL HHi P | 3F · img | M I | reaction-diffusion | cornusammonis · ST XtdSDn |
| 29 | glassier | teal glassy RD terrain | 3-buffer RD + glass lighting | 13 incl. Tog Rnd | 3F · img | M I | reaction-diffusion | Felix Woitzel |
| 30 | glitch | white/magenta pixel burst | dripping + RGB split chain | 16 incl. Tri | 4F · 4 img · G2 | M I | builtin:glitch | Meebs ft. XOR |
| 31 | glob | dark blob, yellow rim light | RM blob | BHi Twit Curv Fade HHi | 0 | S T | builtin:orb | Nimitz |
| 32 | gpu_melter | green melting scanlines | melt displacement + blur | BL BP BeatT Fade HHi HP L MP Beat | 2 | M I | slit-scan | Meebs · ST lsl3RH |
| 33 | hex_array | orange 3D hex tubes | RM hex prism array · `_triWave _palette` | BPM | 1 · JS | S T | new | sheltron |
| 34 | hexoplanet | bronze hex-tiled sphere | RM displaced sphere, hex pattern | BL BeatT Hi Tog | 1F · img | M T | builtin:orb | aiekick · NC-SA · ST ltlSW4 |
| 35 | hextunnel | hot-pink hex tunnel | RM hex tunnel | BL BT BPM HT P | 1F · img · JS | M T | tunnel | sheltron |
| 36 | hills_eels | layered pastel dune waves | layered sine hills + feedback | BHi BL Twit HP Int MHHi MHP MHi MP | 2F · JS · G3 | S I | wave-landscape | Victor S. |
| 37 | hue_review | orange melted smear | feedback + hue rotate | BHi BT BeatT BPM HHi HT Beat P | 2 · JS | M I | diff-feedback | Meebs |
| 38 | inkshot | dotted halftone grid | dot grid + RGB split | 11 incl. Rnd | 1 | S I | pointillize | Meebs |
| 39 | kaleidowhoa_man | neon hexagonal kaleidoscope | polar mirror kaleido + feedback | BL BeatT HHi L Beat P | 1F · JS | S I | kaleido-tunnel | Meebs |
| 40 | kifs_flythrough | grey KIFS fractal flythrough | RM Knighty KIFS, textured | BHi BL BP | 1 · 3 img · JS · G3 | L N | builtin:flythrough | Shane · ST 4sGXzV, ldKSDm, Mdf3z7 |
| 41 | lattix | white/blue lattice light tunnel | RM lattice + RGB split | BL BPM HHi Beat P | 1 · JS · G3 | M T | light-tunnel | Anonymous |
| 42 | logo_grid_pulses | logo over pulsing pattern grid | 4K pattern gen → fb fix → composite → bloom; Sobel on media | 13 incl. Sin4 Conf | 4 (1F) · JS | L N | led-grid | UFFFD x Meebs |
| 43 | lost_in_the_sauce | orange/pink liquid line flow | feedback advection, `finalPass` | BL BT Twit Curv Beat | 2 · G3 | S I | flow-smear | Keijiro Takahashi x Meebs |
| 44 | mandelbrot_decoration | ornamented Mandelbrot bands | Mandelbrot + pattern colouring | BT Twit MHT Beat | 0 · JS · G3 | M T | builtin:fractal | Shane · ST ldf3DN, wtdSzS |
| 45 | meta_experiment_3 | grid of 2D metaball cells | 2D metaballs per cell | BHi BL HHi P | 0 · JS | S I | own/metaballs | aiekick · NC-SA |
| 46 | midi_mapping | MIDI control test grid | utility | — | 0 | — | n/a | none |
| 47 | milk_honey_smoke_bile | soft blurred smoke blobs | 2-buffer warp feedback | 11 incl. Rnd | 2F | S I | lava-smoke | Victor S. |
| 48 | min_max_hex | metallic hex frame | 2-pass hex min/max | 11 incl. Sin2 Curv | 2 · JS | S I | new | Meebs · ST 4d2GzV |
| 49 | molten | glowing lava cracks | 3-buffer crack field + fbm, JS camera | BL BP BT Sin4 HHi HP HT MP | 3F · img · JS(122 L) · G3 | L N | new | Meebs ft. Flexi |
| 50 | myoplasm | blue glowing cell blobs | 2D cells + FP | BHi BL BP Fade HT | 0 · FP | S I | worley-cells | Alex Rowe |
| 51 | neon_city | neon city night flythrough | path-traced towers, spectrum heights, motion blur | BHi BP HHi HP MHHi MHP MHi MP Spec | 3F · JS · G1 | L N | new | mrange · ST ss3SD8 helper (0b5vr) |
| 52 | neuron_proximitors | cyan plexus constellation | particle buffer + proximity lines | BL BeatT Twit HHi HT Hi L Beat P | 3F · JS · G5 | M N | native/plexus | patu x Meebs · ST XllBRj |
| 53 | nova | golden radial burst mandala | 3-buffer polar feedback warp | 17 incl. Tog Rnd | 3F · G2 | M I | new | Felix Woitzel |
| 54 | overload | rainbow ring tunnel hole | polar fbm rings | 13 incl. PrimeBang | 0 · JS | S T | feedback-ring | Alex Rowe |
| 55 | PLUS | grid of plus signs | 2D grid · `_fbm _pixelate` | BPM HHi P | 0 · JS | S I | led-grid | Meebs |
| 56 | pop | pop-art halftone dots | hex halftone | BL BP Tri2 Curv Fade HL HP P Rnd | 2 | S I | pointillize | Meebs |
| 57 | primitiv_logik | RGB-split neon triangle | 2D SDF primitive + RGB split | BT HHi Beat | 1 · JS · G3 | S I | sdf-shapes | Meebs |
| 58 | pxl_sort_1 | pixel-sorted media smear | feedback sort (media-only) | HHi Beat | 1 | S I | slit-scan | Meebs |
| 59 | quicksand | pink sand feedback, sun disc | 2-buffer feedback | Sin2 Twit HHi Int MHHi ML Beat P | 2F | S I | diff-feedback | Meebs |
| 60 | raw_video | media passthrough | utility | — | 0 | — | native/camera | none |
| 61 | ray_marching_experiment_62 | orange glowing silk swirl | RM spiral, glow | BL BP HHi Hi P | 0 · JS · G5 | M T | new | aiekick · NC-SA · ST ltcSDr, MsXGWr |
| 62 | raymarched_reflections | chrome blocks, reflections | RM reflections + soft shadows | BL BT | 0 · JS · G5 | L T | new | Shane · ST Ml2XWt |
| 63 | rearranged | salmon dot grid shuffle | 2-pass grid shuffle | BL Conf Tri2 Twit Curv HHi Beat P | 2 | S I | truchet | Meebs |
| 64 | redrum | red horror smears | 2-buffer sim on wall images | BL BP BeatT Curv HHi HT L Beat P | 2F · 3 img · JS | M I | new | Meebs |
| 65 | replik8 | dark radial replicas | feedback replicate | BP BT HHi HT P | 1 · img | S I | feedback-zoom | Meebs |
| 66 | scaffold_fractal | neon lines through scaffold | RM scaffold fractal, line glow | BL BP BPM Conf Tri2 Curv HHi HP HT P | 0 · JS · G3 | M T | laser-grid | Meebs · glslsandbox |
| 67 | shrouded | green bubbly organic RD | 3-buffer RD | 15 incl. Rnd | 3F · img · G3 | M I | reaction-diffusion | Felix Woitzel ft. Meebs |
| 68 | sinusoidal_warp | marbled media warp | sinusoidal UV warp (media) | BP Hi L | 0 · JS | S I | own/domain-warp | Shady Headstash · NC-SA · ST 4l2XWK, MlSSDV, XslGRr |
| 69 | SkaiWalkerOG | coloured glyph corridor | RM glyph tunnel | 11 incl. UserImage | 2F · JS · G0 | M N | new | Psybernautics |
| 70 | sprinkles | RGB-rimmed blob outline | 4-buffer RD | BT HHi | 4F · G3 | M I | reaction-diffusion | sheltron ft. Meebs |
| 71 | square_shoals | green square noise shoals | feedback squares · `_fbm` | BL BT Fade HHi Hi Beat Tog | 1F | S I | new | Alex Rowe |
| 72 | stained_glass | green hex stained glass | hex cells + colour noise | BL BP HT Beat P | 1 · img · JS | S I | worley-cells | Meebs |
| 73 | sun_set | red sun, halftone rays | 2-pass polar · `_fbm` | 9 incl. Beat | 2 | S I | new | Meebs |
| 74 | swarm | blue fish particle swarm | 2-pass particle field + feedback | BL BeatT Sin2 Twit Fade HHi Beat P | 2 (1F) | M I | builtin:swarm | Meebs · ST MddGzf |
| 75 | terrain_lattice | flat-shaded lattice terrain | RM terrain + mesh lines | BL BeatT HHi Beat P | 1 · img · G3 | L N | wave-landscape | Shane · ST ldKSDm, lllGRr, ltjSRD |
| 76 | test_card | colour bars test card | utility | BL Tri2 HL P | 0 | S | n/a | Keijiro Takahashi |
| 77 | thresholder | acid colour threshold flow | 2-buffer feedback + threshold | 15 | 2F · JS | S I | color-threshold | Kyle Grover |
| 78 | traced_tunnel | reflective box tunnel | multipass path-trace scatter | BL BT Sin2 HHi HT MHT P | 0 · 2 img · JS · G5 | L N | tunnel | Shane · ST 3sXyRN, Wts3W7 |
| 79 | transparent_isoslices | sliced chrome organic field | RM isosurface slices · `_triWave` | BL Twit Fade HHi HT ML MP Beat | 0 · 2 img · JS · G4 | M T | new | Shane |
| 80 | tunnel_beauty_6 | gold spiral tunnel | RM spiral tunnel | BP BT Sin4 HT Beat P | 1 · G3 | M T | tunnel | aiekick · NC-SA · ST MsXGWr |
| 81 | turbo_encabulator_fluid | embossed blue/green/red fingering flow | 2-buffer fake fluid (curl + suture) | 18 incl. Tog | 2F · G2 | M I | builtin:fluid | cornusammonis · MIT (iq noise) |
| 82 | vein_melter | red/blue dendritic veins | 2-buffer dendritic RD, paint | BL BPM HHi | 2F · 2 img · JS · G4 | M I | reaction-diffusion | cornusammonis |
| 83 | videofx_1 | media FX stack | edge + RGB shift (media) | BL Curv HHi | 3F | M I | (effects) | none |
| 84 | videofx_directionalblur | directional media blur | 1-pass blur (media) | BT Tog | 0 · G4 | S I | own/radial-blur | none |
| 85 | voronoi_geode | 3D Voronoi geode crystals | RM 3D Voronoi + agate textures | BHi BL HHi HL Hi L P | 0 · 2 img · JS · G4 | M T | worley-cells | Shane · ST 4sGSRc, ldKSDm, ltsXRM, XsBXWt |
| 86 | waterly | cyan caustic water | noise caustic distortion | BHi BP Hi L P | 0 · img · JS | S I | new | Shady Headstash · NC-SA · ST MdlGDM, XslGRr |

Also shipped: `scenes/default/welcome_scene.synScene` (splash) and `scenes/new_scene/` (template: `main.glsl`, `scene.json`, thumbnail).

**Recurring technique families (counts from the table):**
- **Raymarch / path trace (~27):** mrange (CC0, KodeLife-portable: an `#ifdef KODELIFE` block fakes the `syn_*` values, e.g. `neon_city/main.glsl` L1–35), Shane (textured, reflections), aiekick (NC-SA). Audio usually drives camera speed via a JS clock, not geometry.
- **Feedback (~35):** own-TARGET reads or `syn_FinalPass`; decay via hue/value drift (`audio_indicators` slot 3: hsv −0.012 hue, −0.05 value per frame).
- **Multi-buffer simulations (~14):** RD / SmoothLife / fake fluid by cornusammonis, Felix Woitzel, Flexi; FLOAT targets, 2–10 buffers.
- **Kaleido / polar folds (~8):** `_toPolarTrue` + mirror; dark_twister's abs-fold loop.
- **Post chains in-scene (~8):** separable blur, RGB split, bloom passes inside the scene (compound_iris, logo_grid_pulses, exoplanet, glitch).
- **Particles (~3):** swarm, neuron_proximitors, myoplasm, all in fragment buffers (no vertex particles).
- **Novel vs our catalog:** spectrum-driven geometry in 3D (bouncy_hexagons, neon_city, entombed), 4D fold fractals (beats_in_4d), lava-crack field (molten), volumetric clouds (cloudten), 3D Voronoi geode (voronoi_geode), audio-integrated clocks in every JS scene.

## §3 Top 15 port candidates
Rank = look (thumbnail) × audio reactivity (uniform count + what it drives) × new for us (§2 overlap). Thumbnails under `donor/visual_system_2/scenes/release/<name>.synScene/`. Mapping column uses our `SOURCE_IDS` (`web/src/bind.ts:26`); "clock" = a donor JS/`*Time` accumulator; our nearest is a layer `speed` binding (`web/src/gl/live.ts:6`), per layer only.

| # | scene | why | donor → our sources | route | thumbnail |
|---|---|---|---|---|---|
| 1 | bouncy_hexagons | white hex pillar landscape whose heights follow the FFT; red bumps; nothing like it in our catalog | `syn_Spectrum.z` → `audioTex.fft`; BassPresence cam clock → speed←`bass` (slow release); Mid/MidHighLevel wave clock → `mid`/`treb` | M: toy (ES 3.00) if the FinalPass blur is dropped; native for the FP + t_fbm image | `scene.png` |
| 2 | beats_in_4d | 4D inversion-fold fractal of glowing orbs, very high look; CC0 | BassHits → `kick`; BassLevel → `bass`; JS clock `ct += (x + y·BassLevel)·dt` → speed←`bass` | M: toy paste (single pass, 79-step loop); `ct` becomes layer time | `scene.png` |
| 3 | dark_twister | neon purple/cyan twisted vortex; CC0; single pass | Hits → `onset`; BassPresence → `bass`; Mid/MidHighPresence → `mid`/`treb` (all three feed JS clocks lum/tun/rot) | S: toy; FP feedback dropped or done as a layer `own/trails` | `scene.png` |
| 4 | neon_city | neon city flythrough, towers lit per band, FFT tower heights | `syn_Spectrum.y` → fft; Bass/Mid/MidHigh/High Hits → `kick`/`snare`/band/`hats`; *Presence → `bass`/`mid`/`treb` | L: native (3 FLOAT passes, motion blur, path tracing) | `scene.png` |
| 5 | molten | glowing lava crack field, 3D camera; new look | Bass/Mid/HighPresence → camera dx/dy/dz (`bass`/`mid`/`treb`); BPMSin4 → `beat` sine rate ¼ ⚠️; High/BassTime → clock | L: native (3 FLOAT buffers + colornoise + 122-line JS camera) | `molten.png` |
| 6 | voronoi_geode | 3D Voronoi geode crystals, agate textures | HighHits² → clock (`hats`); HighHits → shimmer; Presence → grid growth (`bass`+`mid` slow) | M: toy + 2 IMPORTED-style textures (toy has noise only → native or ISF with IMPORTED) | `voronoi_geode.png` |
| 7 | compound_iris | glitchy RGB-split light rings, blur chain | BPMTwitcher → `beat` (count); MidPresence⁴ → ring radius (`mid`); BassPresence → jitter (`kick`/`bass`); HighHits → `hats` | M: ISF 5 passes (blur H/V, RGB split) | `compound_iris.png` |
| 8 | cloudten | volumetric clouds over a glowing city grid | Level² → clock; Presence → camera height (`bass` slow) | M: native or ISF (2 passes + colornoise), raymarch cost unmeasured | `cloudten.png` |
| 9 | nova | golden radial burst mandala, feedback | BassHits/HighHits → `kick`/`hats`; MidLevel accum → `mid`; RandomOnBeat → `beat` random; Time/BassTime → clocks | M: ISF 3 FLOAT passes | `nova.jpg` |
| 10 | entombed_silicon_dreams | synthwave mountains + ringed planet; CC0 | `syn_Spectrum.yz` → fft rows; BassLevel/BassHits → `bass`/`kick` | M: native (4 passes + FP) or toy without the motion-blur passes | `scene.png` |
| 11 | logo_grid_pulses | pattern grid with logo, hundreds of combinations, bloom | BeatTime/BPMSin4/Conf → `beat`/`confidence`; Bass/MidHigh/HighHits → `kick`/band/`hats` | L: native (4K gen pass + bloom); ties to backlog item "text layer" | `logo_grid_pulses.png` |
| 12 | scaffold_fractal | neon red/blue lines racing through a scaffold | CurvedTime → clock ⚠️ semantics; Presence → camera y (`bass`) | M: toy (single pass) | `scaffold_fractal.png` |
| 13 | ray_marching_experiment_62 | orange glowing silk swirl | BassLevel/BassPresence → `bass`; Hits/HighHits → `onset`/`hats` | M: toy; G5 rating ⇒ res lever | `ray_marching_experiment_62.png` |
| 14 | turbo_encabulator_fluid | embossed multi-colour fingering flow; MIT noise | 18 uniforms; BassHits → `kick`, Presence → `bass`, BPMTri2 → `beat` tri rate ½ ⚠️ | M: ISF 2 FLOAT persistent passes | `turbo_encabulator_fluid.png` |
| 15 | kaleidowhoa_man | neon hexagonal kaleidoscope + feedback | BassLevel → `bass`; OnBeat → `kick`; HighHits → `hats` | S: ISF 1 FLOAT feedback pass | `kaleidowhoa_man.png` |

Runners-up (look high, more overlap): deeper_v2 (ring tunnel + rays), lattix, hextunnel, exoplanet, alien_cavern (vs native/isobars), transparent_isoslices, gaussian_smoothlife.
implication: rows 2, 3, 12, 13 are single-pass GLSL 330 bodies, but our toy def declares no inputs (`web/src/fx/catalog.ts:56–64`), so scalar `syn_*` values have no bind path there today (only `iChannel0` FFT/wave); "T" in §2/§3 means "ES 3.00 single-pass body", and the binding route needs a native or a toy-with-inputs.

## §4 Audio uniforms
Public list = 43 names in the app's GLSL/JS editor keyword table (`src/App.app/Contents/Resources/views/bundle.*.js`, rule `ssf.audio`, byte ≈1 070 700; read as text). Meaning comes from scene usage only (no doc strings found); `report.md` §7 holds the DSP side (→ `audio-dsp`). Ours = `SOURCE_IDS` (`web/src/bind.ts:26`) and `audioTex` (`web/src/gl/engine.ts:106`). ❌ = no equivalent today.

| donor | meaning (as used) | used in | ours |
|---|---|---|---|
| `syn_Level`, `syn_RawLevel` | overall level 0..1 (RawLevel: 0 scenes) | 14 | ❌ single source; mean of `bass mid treb` by hand |
| `syn_BassLevel` / `MidLevel` / `MidHighLevel` / `HighLevel` | band level | 61 / 11 / 7 / 14 | `bass` (or `sub`) / `mid` / a `bandN` / `treb` |
| `syn_Hits` | any-band hit envelope | 14 | `onset` |
| `syn_BassHits` / `MidHits` / `MidHighHits` / `HighHits` | per-band hit envelope (band onsets, not drum classes ⚠️) | 32 / 3 / 5 / 56 | `kick` / `snare` / ❌ (`hats` partial) / `hats` |
| `syn_Presence`, `syn_*Presence` (5) | slow sustained band energy (seconds) | 64 (any band) | ❌ as a source; a binding with long attack/release on `bass mid treb` (`Binding.attack/release`, `bind.ts:7`) |
| `syn_Time`, `syn_BassTime` / `MidTime` / `MidHighTime` / `HighTime` | clock advancing with (band) level | 60 (any; syn_Time 41, BassTime 34) | ❌ per uniform; layer `speed` bound to a source (`live.ts:6`) is per layer |
| `syn_CurvedTime` | warped clock ⚠️ | 11 | ❌ |
| `syn_OnBeat` | beat pulse | 33 | `beat` with a shape, or `kick` |
| `syn_ToggleOnBeat` | 0/1 flip each beat | 9 | `beat` shape `square`, rate ½ ⚠️ |
| `syn_RandomOnBeat` | new random per beat | 10 | `beat` shape `random` (`bind.ts:99–100`, holds per cycle) |
| `syn_BeatTime` | beat count | 25 | `beat` (count) |
| `syn_BPM` | tempo | 12 | ❌ as source; `sync.bpm` exists (`audio/sync.ts:8`) |
| `syn_BPMConfidence` | tempo lock | 8 | `confidence` |
| `syn_BPMSin/2/4/8`, `syn_BPMTri/2/4/8` | beat-locked LFOs (n = period in beats ⚠️) | 25 | `beat` + shape `sine`/`tri` + `rate` 1/n |
| `syn_BPMTwitcher` | beat-locked clock, jumps per beat (scenes use `floor`/`fract`, `compound_iris/main.glsl` L1–38) | 17 | ❌ (`beat` count is the nearest) |
| `syn_FadeInOut` | fade gain ⚠️ (`col *= pow(syn_FadeInOut,.07)`) | 16 | ❌ (`build` nearest) |
| `syn_Intensity` | external energy via OSC `/energy/intensity` (`protocol/osc_bootstrap.txt` L1–2) | 5 | ❌ (`build`/`drop` nearest) |
| `syn_PrimeBang`, `syn_PrimeAndBang` | event that re-rolls dropdowns when `auto_cycle` (boreal, overload JS); not in the public list | 2 | ❌ (`drop` nearest) |
| `syn_BassExpoCurve` | exoplanet only, not public ⚠️ | 1 | ❌ |
| `syn_InputLevel` | raw input meter (audio_indicators) | 1 | HUD meter only, not a source |
| `syn_Spectrum` (tex) | `.r` FFT per bin (texelFetch × 1024), `.g` FFT (Shadertoy row 0, `spectralFetch`), `.b` second FFT variant ⚠️ smoothed/"juiced", `.a` waveform | 5 | `audioTex.fft` (512), `.wave`, `.toy` 512×2, `.waveLR` |
| `syn_LevelTrail` (tex) | history along x of bass `.g`, mid `.b`, high `.a` | 1 | ❌ |
| `syn_TimeSeries`, `syn_Bass/Mid/HighTimeSeries`, `syn_SpectrumSmooth/Juiced` | listed in `report.md` L157–161, read by no shipped scene | 0 | ❌ |
| `syn_MediaType`, `syn_Media`, `syn_UserImage` | media flag / media textures | — | camera layer (`native/camera`) |

Ours with no donor equivalent: `sub reese wobble wobbleDepth reeseLevel` (bass design), `build drop` (arrangement), `bar`, `lfo`, drum-classified `snare hats`, camera `presence`.

## §5 Reusable non-scene parts
Licence fact for all of §5: the `glsl/` and `protocol/` texts are strings recovered from the commercial app binary/resources (`report.md` L14, L177); they carry no licence header. Some helper bodies are well-known public snippets (e.g. `_palette` = iq cosine palette `a + b·cos(6.28318(c·t+d))`, `_smin` = exponential smooth-min).

**5a GLSL helpers (`glsl/01–05`, single-line texts; 160+ functions).** Groups and call counts across the 87 `main.glsl` (grep `\b_name\(`):
- Coordinates: `_uv`, `_uvc` (aspect-centred, `01` start), `_rotate` (105 calls / 44 scenes), `_toPolar` / `_toPolarTrue` (0..2π quadrant-safe) / `_toRect`, `_mirror` (fold to 0..1), `_pixelate`, `_uvc2uv` / `_uv2uvc`.
- Shaping: `_pulse` (smoothstep bump, 132 calls / 33 scenes, the most used helper), `_sqPulse` (hard bump), `_triWave`, `_inRange`, `_map`, `_scale`, `_nclamp`, `_nsin`/`_ncos` (0..1), `_smin`, `_statelessContinuousChaotic` (sum of 10 prime-frequency sines, a deterministic "random walk" from time).
- Colour: `_hsv2rgb`/`_rgb2hsv`, `_hueRotate`, `_palette` (40 calls), `_normalizeRGB` (42), `_luminance`, `_contrast`/`_gamma`/`_saturation`/`_brightness`/`_invert`/`_grayscale`, `_dichrome` (two-colour map).
- Hash / noise: `_hash11…_hash44`, `_rand`, `_noise` (1D/2D hash, 3D Perlin via `_mod289/_perm`), `_fbm` 1/2/3D (5 octaves default, 0.5 rad rotation per octave; float loop bound = ES 3.00 only).
- Image / media: `IMG_NORM_PIXEL`, `IMG_PIXEL` (texelFetch), `IMG_SIZE` (`02`), `_loadMedia`/`_textureMedia`/`…AsMask`, `_correctMediaCoords`, `_isMediaActive`, `_edgeDetect` (dFdx/dFdy), `_edgeDetectSobel`, `_hBlurTiltShift`/`_vBlurTiltShift` (`04`).
- Adoption: worth it as one shared GLSL include for our natives/toys (ES 3.00) — the scene bodies call these names, so any port needs them; a 1.00-compatible subset for ISF. Form: rewrite by analogy (short, generic math).

**5b Meta-controls (`glsl/07`, uniform names in `glsl/01–05`).** A fixed post chain after every scene: pass "to meta controls" = H/V mirror (`_Hor_Mirror _Vert_Mirror`), flip, `_applyDichrome` (`_Limit_Colors`, `_Low_Color`, `_High_Color`), `_applyColorCorrection` = invert → hue/saturation → contrast → gamma → brightness (`03_hue_saturation.txt`), clamp, media overlay with 7 modes (add, alpha, difference, divide, lighten, multiply, subtract; `_Media_Overlay_Mode`, amount `_Media_Overlay`), `_Master`, `_Alpha_Channel`; then a black-bar pass (`_Fit_or_Fill`, `SCREENSIZE`). Media gets its own chain (`_Media_Contrast/_Gamma/_Hue/_Saturation`, `_Invert_Media`, `_Media_Scale`). Adoption: a global "look" stage (dichrome + colour correction + mirror) on our output; ours today: the app-wide post pass is gain + flash only (`web/src/gl/engine.ts:181–218`, caps in `gl/post.ts`); per-layer effects such as `own/gradient` and `own/change-color` cover parts of the colour side (mirror/flip equivalents not checked ⚠️).

**5c Shadertoy conversion (`report.md` §8 L301–334, `protocol/shadertoy_conversion.txt`).** Rules: `iGlobalTime→TIME`, `iTimeDelta→0.016667` (a constant), `iFrame→int(FRAMECOUNT)`, `iResolution→RENDERSIZE` shim, `iMouse→_mouse`, `iDate→vec4(2019,1,1,TIME)`, `iChannelResolution[x]→vec3(RENDERSIZE,1)`, `iChannelTime` removed; user `PI` definitions deleted by regex; audio channel → `spectralFetch()` reading `syn_Spectrum` `.g` (y<0.5) / `.a` (wave); volume channel → `_noise` with a warning; keyboard → warning; cubemaps downloaded; `noise()` → `_noise()` (5 signatures); `mainImage` wrapped into `renderMain`; Shadertoy multipass → `if (PASSINDEX == n)` with `Common` / `BuffA…` sections. Ours: toy path already maps iChannel0 = audio (FFT row 0, wave row 1) and noise on 1–3 (`gl/live.ts:78–82`) and is single pass (`fx/catalog.ts:61`). Worth adopting: the multipass split (Common + BuffA–D → passes) and the cubemap/volume/keyboard fallbacks; not the `iTimeDelta` constant. Form: adapt the rule list.

**5d Uniform binding list (`protocol/uniform_binding_list.txt`, 19 lines).** Built-ins: `RENDERSIZE, _mouse, FRAMECOUNT, PASSINDEX`; provider↔texture pairs `syn_UserImage/_MediaTexture`, `syn_Spectrum/_Spectrum`, `syn_LevelTrail/_LevelTrail`; `syn_FinalPass`; validation strings (`Pass '…' in stage '…' has invalid dimensions`, `Uniform … not found`); template slots `UNIFORM_TEXT`, `SHADER_MAIN_FN` (`06_wrapper.txt`: `out vec4 _COLOR_OUT_; void main(){ _COLOR_OUT_ = renderMain(); }`). Adoption: the `syn_FinalPass` idea (previous output frame as a sampler for every scene) is the one item we lack as a generic input. Form: rewrite.

**5e JS scripting model (`report.md` §6 L216–255, `protocol/js_api_errors.txt`).** Duktape; lifecycle `setup()`, `update(dt)` per frame, `transition()` on scene change; API `setUniform`, `setControl(Normalized/Dimension)`, `default/randomizeControl`, `default/randomizeGroup`, event hooks `onChange`, `onOffToOn`, `onOnToOff`, `whileOn`, `whileOff`, `textureFinalPass(x,y)` (CPU read of a pixel). Failure policy: an `update` error disables the script until reload; a failing event handler is disabled alone; a NaN provider uniform is coerced to 0 (`js_api_errors.txt` L47–56). Usage: 47 scripts, 2 093 lines; calls: `transition(` 25, `setUniform(` 23, `setControl(` 11. Dominant pattern: audio-integrated clocks (`x += (base + k·syn_*)·dt`, e.g. `dark_twister/script.js` L5–12, frame-rate dependent there: no `dt`), then camera paths (`molten`), then random re-rolls on `syn_PrimeBang`. Adoption: the value is the accumulator semantics, not a JS VM. Form: rewrite by analogy as a binding/source feature (⚠️ design decision, not made here).

## §6 Analysis / monitor views
**`audio_indicators`** (`scenes/release/audio_indicators.synScene/{main.glsl,script.js,scene.json}`; thumbnail `audio_indicators.png`). The UI references it by title: constant `AUDIO_INDICATORS_SCENE_TITLE = "AUDIO INDICATORS"` in the UI bundle (byte ≈51 297, text grep), so the app treats it as its built-in audio monitor (how the UI opens it: ⚠️ not traced). Layout, 1920×1080, 10 px margins, x ∈ [0, 0.9] = graphs, x > 0.9 = meters; five horizontal slots bottom → top (`main.glsl` L20–100):
1. Slot 0: raw spectrum bars, `texelFetch(syn_Spectrum, int(x·1024)).r`, height = value, colour = `plasma_quintic(val)` (a polynomial plasma colormap, L1–10), floor −0.05.
2. Slot 1: spectrum `.g` bars, same colormap.
3. Slot 2: spectrum `.b` bars, same colormap (the three rows show three FFT variants side by side).
4. Slot 3: waveform `.a` as a thin orange line (`_sqPulse` width 0.01) plus a trail: the `helper` buffer is fed back with hue −0.012 and value −0.05 per frame, so old waveforms fade through the colour wheel.
5. Slot 4: level history `syn_LevelTrail` along x: bass `.g` blue, mid `.b` red, high `.a` green, soft-edged area fills (smoothstep 0.1), additive.
6. Meters (x > 0.9): left bar = `syn_InputLevel` (gradient magenta→orange) with a white peak-hold tick (`tracker`: jumps up, falls 5 %/frame of the gap; `script.js` L5–10); right bar = smoothed level (one-pole 0.04) coloured by zone: red < 0.01, red→green 0.01–0.06, green 0.06–0.9, green→yellow 0.9–0.95, yellow ≥ 0.95, with its own peak-hold tick (`script.js` L13–20, `main.glsl` L104–135). Passes: `feedback` (FLOAT) → `helper` (FLOAT) → screen (`scene.json`).
- No beat/BPM, hit or presence indicator in this view: it shows spectrum, waveform, 3-band level history and input level only.

**Other monitor-like items:** `midi_mapping` (a control-test grid, no audio); `test_card` (colour bars). The UI bundle lists `AUDIO_DEVICE(S)`, an "Audio Device" selector and `OUT_AUDIO_UPDATE_AUDIO_META_CONTROL` (a per-app audio meta-control message; its fields ⚠️ not traced). No other audio graph was found by text grep of the bundle.
- Ours today: the Sources tab meters per source group (`web/src/ui/SourcesTab.tsx`, groups `bind.ts:31–43`) and the HUD input meter (STATE HEAD, session 16 "line-in parity + HUD meter").
implication: the donor view has no drum-class, beat-grid or arrangement lanes; our sources (`kick snare hats sub reese build drop beat bar confidence`) have no donor template to copy.

## §7 Integration mode and provenance
| item | mode | provenance note |
|---|---|---|
| CC0 scenes (beats_in_4d, bouncy_hexagons, dark_twister, entombed_silicon_dreams; mrange) | copy/adapt body; replace `syn_*` with our inputs; keep the CC0 header | CC0 line in each `main.glsl` (grep `CC0`; dark_twister L1–4); embedded helpers keep their own lines (iq MIT, sam hocevar WTFPL) |
| neon_city (mrange) | adapt (native) | no CC0 line found by grep; 0b5vr helper "License: Unknown" ⚠️ |
| Shane / nimitz / aiekick / cornusammonis / Felix Woitzel scenes with ST ids | rewrite by analogy or adapt; record the ST URL | 10 files say CC BY-NC-SA 3.0 explicitly (aiekick, mojovideotech, Shady Headstash); others carry only the ST URL ⚠️ |
| Meebs / Flexi / Victor S. / Alex Rowe / sheltron originals (no URL) | rewrite by analogy | CREDIT field only; shipped inside a commercial app; licence unknown ⚠️ |
| turbo_encabulator_fluid | adapt | iq noise block "The MIT License, Copyright © 2013 Inigo Quilez" in `main.glsl` |
| scene `images/` (colornoise, agate, wall textures, `t_fbm`) | replace with our own noise or regenerate | origin not stated ⚠️ |
| `glsl/01–05` helpers | rewrite by analogy (generic math) | app resource strings, no header |
| `glsl/07` meta-control chain | rewrite by analogy | app resource |
| Shadertoy conversion rules | adapt the rule list | app binary strings (`report.md` §8) |
| JS clock semantics | rewrite by analogy | pattern only |
| `audio_indicators` layout | rewrite by analogy | no CREDIT; app-authored |
Spec §6 (any licence allowed, record it) applies; NC-SA and "unknown" are recorded facts, not blockers. Ported shaders carry author / URL / licence header (CLAUDE.md § Donor scanning).
