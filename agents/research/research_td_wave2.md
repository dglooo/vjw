# Research: TD-look wave 2 (triage of the rest of the TouchDesigner dump)

## TL;DR
- The 160 snippet GLSL DATs are mostly API teaching code: POP 109, TOP 20, CHOP 12, MAT 11, COMP 8. There is little new look in them. The keepers are the **phaser staggered wipe** (CHOP/phaserCHOP ex10–11), **plexus lines** (POP/glsladvancedPOP ex8) and a **Verlet chain** (POP/_conceptsPOP ex15). The non-GLSL TOP snippets add a **difference-blend feedback** (feedbackTOP ex2) and a **luma→ramp gradient map** (lookupTOP ex4).
- The strongest new sources are the palette generators **julia** (orbit trap with an input image) and **superFormula**, plus **cartesianToPolar** and **pointillize**. **xyScope** (in `Palette/Techniques`, not `Tools`) draws audio as Lissajous points through a rotating feedback.
- Most `ImageFilters` left over are plain TOP chains (level/thresh/chroma/blur), so each is one small own ISF file. Several already exist as **MIT donor ISF** files (`donor/ISF-Files/ISF/`): Twirl, Solarize, Sharpen RGB, Emboss, Dilate/Erode, Color Monochrome, Color Replacement, False Color.
- Engine gaps found: **stereo L/R wave** (only mono `audioTex.wave`), a **line renderer with neighbour search** (plexus), **geometry shaders** (none in WebGL2), and a **splat renderer** (Gaussian splats).

## Freshness
- 2026-11-05. Dump `donor/td-reverse/touchdesigner/extracted/` (TD build 2025.31047 per the `.tox` headers; manifest: 355 GLSL DATs, 796 `.tox`). Donor `ISF-Files` HEAD `395072d` (2026-06-04), MIT (`donor/ISF-Files/LICENSE`). App state: `web/src/fx/own/` 24 files, `web/src/fx/isf/` 14 files, 38 `builtin:` scenes (`web/src/scenes/builtin.ts`).
- Method: the `.tox` networks were read with `strings` + awk (op name/type + non-default parms; script in `/tmp/tdw2/net.sh`, not kept). Help text comes from `Samples/Learn/OfflineHelp/https.docs.derivative.ca/Palette-*.htm`. Visual judgements are read from the math and TD's own readMe text, not rendered (⚠️ unverified visually).
- Wave-1 context: `research_td_look.md` §1b (L34–56) and §5 (L120–129); `plan_td_look.md` CP1–CP4 (L28–63); `agents/STATE.md` HEAD.

Paths: `X/` = `donor/td-reverse/touchdesigner/extracted/`. `SN/` = `X/Samples/Learn/OPSnippets/Snippets/`. `P/` = `X/Samples/Palette/`. GLSL text lives under `X/dat_texts/<same path>/…txt`. Integration for every TD item is **rewrite by analogy** (user ruling, STATE 2026-11-04). Donor ISF rows say **copy** (MIT, keep the header).

Cost classes: **S** = one pass, ≤9 taps. **M** = ≤32 taps or 2–3 passes. **L** = an iteration loop of ≥48 per pixel, or ≥4 passes. **N** = native draw (TF ≈25 µs per 1k points, STATE S3.1).

## §1 OPSnippets GLSL (160 files): triage
| Family (count) | What the shaders are | DJ-visual value |
|---|---|---|
| POP (109) | Compute-shader API demos (`TDIn_P`, attribute arrays, prim batches, atomics, ray queries) | Mostly none. Keepers: **plexus** `POP/glsladvancedPOP/…/example8/glsladv2_compute` (a line for each pair of points closer than `uDist`, via `atomicAdd`); **Verlet chain** `POP/_conceptsPOP/…/example15/Chain/VerletIntegration/glsl1_compute` (`new = p + (p − prev) + turb·dt`, then a pull toward each neighbour to `uRestDistance`); "sphere pulse" `POP/glslPOP/…/example4/glsl6–8` (`P *= 1+.3 sin t`, `y += .2 sin(2t + x)`, colour `.5+.5 sin(5P + t)`), which is trivial |
| TOP (20) | Templates (`glslTOP`), `glslmultiTOP` ex1 (a grid mosaic of N inputs), ssao, OCIO, renderselect | Low. A grid mosaic needs N inputs, and we have 1 |
| CHOP (12) | 4× UI slider, 2× pangolin dilate (= palette dilate), 5× **phaser** (+1 readMe) | **Phaser wipe**: see §5 #4 |
| MAT (11) | phong/pbr templates; ex2 random texture per instance; ex3 **geometry-shader explode** (each triangle is pushed along its face normal × `uAmount·0.1`) | Explode needs a geometry shader. WebGL2 has none, so it **needs engine** (a CPU/TF de-indexed mesh) |
| COMP (8) | flex-solver stubs, materialDesignIcons viewer | None |

Non-GLSL TOP snippets that were skimmed (readMe text), with their value:
- `SN/TOP/feedbackTOP/…/example2`: blend modes "Screen tame, Add dynamic, Maximum punchy, **Difference psychotic**". This is §5 #8.
- `SN/TOP/lookupTOP/…/example4`: "tinting based on source luminance, 2 or 3 colours + 2 bias sliders". This is §5 #5.
- `SN/TOP/edgeTOP/…/example2`: edge in a feedback loop ("#facemelt"). **have**: `edge-rings`.
- `SN/TOP/tileTOP/…/example2`: kaleidoscopic tile + spin. **have**: `isf/Kaleidoscope Tile`, `builtin:kaleido-*`.
- `SN/TOP/mirrorTOP`: **have** `isf/Mirror`.
- `SN/TOP/cacheTOP/…/example5`: average of the last 4 frames. **have**: ring natives.
- `SN/TOP/flowTOP`: fluid "flame thrower". **have**: `builtin:fluid`.
- `SN/TOP/embossTOP`, `normalmapTOP`: fake relief lighting. Quick win (§6).
- `SN/TOP/spectrumTOP`: image DFT re-synthesis. Low DJ value, and it needs an FFT pass.

## §2 `P/ImageFilters` not covered by wave 1
Every palette filter ends in `dryWetMix` (a cross with the dry input). Mapping key: **have** = an existing node (named). **easy** = one own ISF file. **copy** = a donor ISF file already does it (MIT).

| Filter | Chain (one line) | Key math (our words) | Look-good params (TD defaults) | Ours | Cost |
|---|---|---|---|---|---|
| twirl | `in → glsl` (Benson, Cycling '74) | `φ += (1 − smoothstep(−size, size, r))·twirl` | Twirl −5, Size 1, Center 0,0 | **have**: `light-tunnel` has a `twirl` input (S1.5); also **copy** `ISF/Twirl.fs` | S |
| dent | `in → glsl` | per axis: `n=|uv·2−1|; n = .5n + .5·smoothstep(w.x, w.y, n+c)·n`, sign restored → pinch/bulge toward the centre | Width .5/.6, Center −.3/.1 | **easy** | S |
| cartesianToPolar | `in → projection(equirect → fisheye, fov 360, rx 90, ry 90)` | Polar wrap: `u = θ/2π`, `v = r` → the input wraps into a disc ("tiny planet") | fov 360 | **easy** (`isf/Polar Function.fs` is a gl-transition wipe, not this) | S |
| pointillize | `in → topto POP (1 pt/px, Color) → pattern(P.xy += rand·Scatter·.001) → pattern(PointScale = rand·Size) → sort(random) → line MAT circlesprite, blend → rendersimple` | Each pixel becomes a round sprite with a random size and jitter, drawn in random order with blending | Size 10, size multiplier .32, Scatter ×.001 | **native**: `native/scatter` + round sprites, random size, jitter | N |
| solarize | `in → thresh(.5, soft .258) ×in ; thresh2(.5, soft .363) × level(invert) → comp maximum` | Sabattier: keep the brights, invert the darks, take the max | Lightthreshold .5/.258, Darkthreshold .5/.363 | **easy** / **copy** `ISF/Solarize.fs` | S |
| hsvBlur | `in → rgbhsv → blur H (preshrink 2, size 7) / S (1,1) / V (0,0) → reorder → hsvrgb` | Hue bleeds at 1/4 res while luma stays sharp → watercolour colour bleed | Hue preshrink 2, filter 7 | **easy** (2 passes: a ¼-res hue blur, then a recombine) | M |
| rgbaBlur | `in → blur R (2,7) / G (1,1) / B (0,0) → reorder → comp maximum(in)` | Per-channel blur radius → coloured halos, max with dry | R preshrink 2, size 7 | **easy** | M |
| convolve | `in → convolve(kernel DAT)` | Generic N×N kernel | — | skip (needs a kernel editor) | M |
| dilate | `grid SOP (Size 10) → disc of offsets (random order, first N) → glsl max (dilate) / min (erode)` | Max (or min) over 10 random taps in a disc of radius Size px → blobs swell / thin out | Size 10, arraySize 10, Type dilate | **easy** (a fixed 10-tap disc) / **copy** `ISF/Dilate.fs`, `Erode.fs` | S |
| sharpen | `in → convolve 5×5 (ring 16/24, centre −840 + Amount·615, normalize, rgba16f)` | Unsharp kernel | Amount 0–1 | **copy** `ISF/Sharpen RGB.fs` | S |
| monochrome | `in → chanmix(R .4, G .4, B .2) → [÷ analyze max]` | Weighted luma, optionally normalised by the frame's max | .4/.4/.2 | **easy** / **copy** `ISF/Color Monochrome.fs` (no auto-normalise: it needs a reduction pass) | S |
| changeColor | `in → chroma(hue ±18° around a pick, soft 36°) → mask; hsvadj(hue −200°) inside the mask` | Recolour **one hue band** only | Hueoffset −200, soft 36° | **easy** / **copy** `ISF/Color Replacement.fs` (⚠️ unverified that it matches) | S |
| changeToColor | `chroma(hue 337–356, sat ≥ .411) → swap in a target colour via rgbhsv/hsvrgb` | Replace one hue band with a fixed colour | hue 337–356, sat min .411 | **easy** | S |
| colorThreshold | `3× thresh(R/G/B ≤ t, soft) → reorder → multiply(in)` | A per-channel step → an 8-colour posterised mask × the input | t .491 each, soft 0 | **easy** | S |
| rgbContrast | `3× level(contrast c_ch) → reorder` | `(x − .5)·c + .5` per channel; c < 0 inverts that channel | R −7, G 2.57, B 1 (sample values) | **easy** | S |
| softenAlpha | `blur(alpha only) → lookup` | Feathers the alpha | — | skip (our layers composite on RGB) | — |
| pixelate | `res(46×26 nearest) → res(back, nearest)` | Block down/up | 46×26 | **have**: `isf/Pixellate`, `builtin:pixel-strobe` | S |

## §3 `P/Generators`
| Generator | Chain | Key math (our words) | Look-good params (TD defaults) | Ours | Cost |
|---|---|---|---|---|---|
| **julia** (`julia.txt`) | `glsl(julia; in1 = res, in2 = ramp3 1024×256, in3 = trap map) → out` | `z ← r^p·(cos pφ, sin pφ) + C`, iterated. **Escape mode**: smooth count `i − log2 log2|z|²`, `/100` → ramp colour. **Trap mode**: stop at the first iteration where `texture(trapMap, z).a > .1` and output that texel, so the fractal is tiled out of the trap image. `Iterlimit` drops the first/last k iterations | Power **−2** (inverse Julia), C (−.15, .6), Iter 300, Scale 1, 6.4×3.6 domain | **easy**: ISF filter with trap map = the layer input (`inputImage`), a constant loop bound (GLSL 1.00) | L (cap ~48–64 iter; `res` .5) |
| mandelbrot (`mandelbrot.txt`) | same, `c = pixel`, `z₀ = c` | same; bailout 256 | Center .6/0, Scale .5, Iter 256, rgba16f | **easy**; a zoom needs float precision past ~1e-5 scale (⚠️ fp32 limit, our knowledge) | L |
| superFormula | `script SOP (Python, 2D/3D) → SOP` | Gielis: `r(φ) = (|cos(mφ/4)/a|^n2 + |sin(mφ/4)/b|^n3)^(−1/n1)` | A 1, B 1, **M 16, N1 1, N2 .6, N3 6**, Points 500 | **easy**: per pixel compare `|p|` with `r(atan p)` → a glow line / fill (fragment-only, no SOP) | S |
| mesh | Python-built parametric SOP; 17 shapes: Paraboloid, Steinbach, Sine, Figure 8, Elliptic Torus, Corkscrew, Bohemian Dome, Bow, Maeder's Owl, Astroidal Ellipsoid, Triaxial Tritorus, Limpet Torus, Horn, Shell, Kidney, Lemniscape, Trianguloid | Classic `(u,v) → xyz` surface formulas | Rows/Cols, Shape | **needs engine**: a mesh/wireframe renderer as a layer (our own geometry is per-pixel: `tunnel-mesh.fs` "solved per pixel"; `sdf-shapes.fs` raymarched). A TF/points native could draw them as a point cloud | N |
| checker | `constant/ramp → 2 colours, Divisionsx/y` | Checkerboard | 2 colours, divisions | **easy** (trivial) | S |
| noise (25 × `allNoise` + 25 × `allNoiseDer`) | `glsl(main per type; input = a UV-lookup texture, P = uv.rg·res·.1·scale + offset)` + a 2529-line library (`glsl2_pixel1.txt`, **Brian Sharpe Wombat**, header "Use the code however you wish… credit") | Value, Perlin, ValuePerlin, Hermite, ValueHermite, Simplex(Perlin/Cellular/PolkaDot), **Cellular** (Worley, 2×2 search), **Cubist** ("cubist-style painting, contains discontinuities"), **PolkaDot** (random-radius dots), **Stars2D** (`probThresh, maxDimm, radius`), 2D/3D/4D, with analytic derivatives | see the row below | **easy** (one ISF generator with a `type` switch) | S–M |

Noise, visually (from Sharpe's descriptions in the library comments, ⚠️ not rendered):
- **Stars2D**: a sparse star field (density `probThresh`, dimming `maxDimm`, `radius`).
- **PolkaDot2D/3D**: dots of random radius, an LED/halftone grid.
- **Cubist2D/3D**: hard-edged shards.
- **Cellular**: Worley veins (**have**: `isf/Worley Cells`, `builtin:worley-cells`).
- **Perlin/Simplex**: **have** (donor webgl-noise; used in td-feedback).
- **Derivative variants**: give a gradient for bump lighting or flow (curl), e.g. for displacement fields.
- implication: Stars and PolkaDot are the two noises with no equivalent in the app today.

## §4 `P/POPs`, `P/Tools`, `P/Techniques` (visual items only)
| Item | Chain | What it does | Ours | Cost |
|---|---|---|---|---|
| POPs/pointRender | `in1` XYZ in RGB (alpha 1 = valid), `in2` colour → points + viewport camera | A point cloud from position textures | **have**: `native/scatter` (TF points); a 3D camera is missing | N |
| POPs/GaussianSplats (`gsGeo`, `gsScene`, `gsTransform`; shader `SN/POP/pointfileinPOP/…/example2/gsGeo/glslSplat_vertex3`, 164 lines) | `pointfilein (.ply splats) → compute → splat VS` | Renders 3DGS captures | **needs engine**: a splat renderer + per-frame depth sort + a `.ply` asset. Not a reactive effect | L |
| **Techniques/xyScope** (help: "an example of an audio visualization") | `audio CHOP (2 ch) → math(Scale) → chopto POP (tx,ty → P.xy) → geo, line MAT points (additive colour) → render 1280×720 → Feedback COMP (rotate = LFO ramp .16 Hz × 360°)` | Stereo L→x, R→y Lissajous ("oscilloscope music"), trails rotate | **native**: a `LINE_STRIP`/points over the wave samples. True L/R XY **needs engine**: a stereo wave per frame (today only mono `audioTex.wave`, `web/src/gl/engine.ts` L111–119; L/R analysers exist only under `?debug`, `audio/input.ts` L140–150). Mono fallback: delay embedding `x = s(i)`, `y = s(i+τ)` (our math) | N + S feedback |
| Tools/3DScope | `TOP → topto POP (rgb + hsl) → mathmix (hue → angle, sat → radius / RGB → xyz) → line MAT additive → render` | A colour-space scatter of the image (vectorscope in 3D) | **native** (points from pixels, as in scatter) | N |
| Tools/blendModes | 2 inputs `comp` (dodge etc.) | Blend-mode picker | **have** in part: layer `Blend = normal / add / screen / multiply` (`web/src/doc.ts` L8). Dodge, difference and max are missing | S |
| Tools/opticalFlow, particlesGpu | — | done in wave 1 | **have**: `flow-smear`, `swarm` | — |
| Tools/vectorScope, waveformMonitor, histogram | analysis UIs | broadcast scopes | low DJ value | — |

## §5 Top-10: visual punch for a DJ set ÷ effort (wave-1 near-duplicates excluded)
Bindings follow the 2d policy (`design_td_look.md` L54–64 + § Ruling L420–452): drums/sub/build/drop direct, the bass class via `reese`. Available sources: kick, snare, hats, sub, reese, build, drop, beat, lfo.

1. **Julia orbit-trap filter**
   - Source: `P/Generators/julia` (`julia.txt`).
   - Chain: `layer in → julia(trap map = in) → out`.
   - Math: iterate `z ← z^p + C`; output the trap texel at the first escape into the input's footprint. This tiles the incoming layer into fractal lace. Fallback colour = a smooth-count ramp.
   - Params: p = −2 (TD default; ±2 for normal Julia), C (−.15, .6), Scale 1, ~48–64 iterations.
   - Ours: **easy** (one own ISF filter). Cost **L**, so run it at `res` .5.
   - Audio: C angle ← lfo, |C| ← reese, scale ← kick, ramp hue ← snare, re-seed C on drop.
2. **Superformula outline generator**
   - Source: `P/Generators/superFormula` (Python SOP; the formula is in `script1_callbacks_2D.txt`).
   - Chain: `glsl: polar r(φ) → glow line/fill`.
   - Math: Gielis `r(φ)` (§3); the pixel is lit where `|p| ≈ r(φ)`.
   - Params: M 16, N1 1, N2 .6, N3 6, A = B = 1.
   - Ours: **easy**. Cost **S**. It feeds td-feedback/bloom well.
   - Audio: m ← snare (integer steps), n1 ← reese, scale ← kick, glow ← sub, new (m, n) preset on drop.
3. **Polar wrap ("tiny planet") filter**
   - Source: `P/ImageFilters/cartesianToPolar` (projection equirect→fisheye, fov 360).
   - Math: `uv' = (θ/2π, r)`, so spectrum, slit-scan and the ring scenes become discs.
   - Ours: **easy**. Cost **S**.
   - Audio: rotation ← lfo, radial offset ← kick, twist ← reese.
4. **Phaser staggered wipe**
   - Source: `SN/CHOP/phaserCHOP/…/example10–11` (`glslmulti1_pixel`, `glslmulti2_pixel*`).
   - Chain: `mix(A, B, phaser(t, phaseMap, e))`.
   - Math: `phaser(t, ph, e) = clamp((ph − 1 + t(1+e))/e, 0, 1)`. Three phase maps: snake bars (`floor(x·bars)`, alternating y), random grid cells (`rand(floor(uv·grid))`), diamond (`floor(|2uv−1|·grid)` averaged). Each cell flips at its own moment. TD readMe: "a bit like what Time Machine TOP does".
   - Params: edge e .2–.5, bars/grid 8–16.
   - Ours: **easy** with B = a treated copy of the input (invert / hue +180 / zoom). A two-layer A/B needs the editor's layer model ⚠️.
   - Cost **S**.
   - Audio: t ← build (the wipe sweeps through the build), reset on drop; map switch on drop.
5. **Gradient map (luma → 2–3 colour ramp)**
   - Source: `SN/TOP/lookupTOP/…/example4` (readMe: 2 or 3 colours + 2 bias sliders); bloom's ramp (wave 1).
   - Math: `out = ramp(bias(luma))`, with a procedural 3-stop ramp.
   - Ours: **easy** (bloom.fs already has a procedural ramp, `rampShift`; donor `ISF/False Color.fs` is MIT). Cost **S**.
   - Audio: ramp shift ← snare, bias ← sub, dry/wet ← build.
6. **XY/Lissajous audio scope + rotating feedback**
   - Source: `P/Techniques/xyScope`.
   - Math: L→x, R→y points, additive; feedback rotates 360° at .16 Hz.
   - Ours: **native** (draw the `audioTex.wave` samples as a line strip). True stereo XY **needs engine** (a stereo wave per frame, §4). Mono delay embedding works today. The feedback can reuse `td-feedback`. Cost **N + S**.
   - Audio: the signal itself; scale ← sub, rotate speed ← reese, hue ← snare, trail ← build.
7. **Pointillize**
   - Source: `P/ImageFilters/pointillize`.
   - Math: one round sprite per sampled pixel, random size ≤ Size, jitter Scatter·.001, random order, blended.
   - Params: Size 10, multiplier .32.
   - Ours: **native**, an extension of `native/scatter` (round sprite, per-point random size/jitter). Cost **N**.
   - Audio: size ← sub, scatter ← reese, burst ← kick.
8. **Difference-blend feedback**
   - Source: `SN/TOP/feedbackTOP/…/example2` ("Difference — psychotic"; wave 1 built only ex3).
   - Math: `out = |new − k·prev|`, with transforms upstream. It yields inverted, strobing rings.
   - Ours: **easy** (one persistent pass). Cost **S**. It must carry `VJW_FLASH` (strobe risk; the flash cap exists, S1.1).
   - Audio: zoom ← kick, k ← build, hue ← snare.
9. **Dilate/erode "melt"**
   - Source: `P/ImageFilters/dilate` (`glsl1_pixel`/`glsl2_pixel`).
   - Math: max (or min) over 10 random disc taps of radius Size px. Bright shapes swell into blobs.
   - Params: Size 10.
   - Ours: **easy** / **copy** `ISF/Dilate.fs`. Cost **S**.
   - Audio: radius ← sub, dilate↔erode flip on drop.
10. **Stars / polka-dot noise generator**
    - Source: `P/Generators/noise` (Wombat `Stars2D`, `PolkaDot2D/3D`).
    - Math: the hash-cell star/dot functions (§3).
    - Ours: **easy** (copy only the needed Wombat functions; credit Brian Sharpe). Cost **S**.
    - Audio: star probability ← hats, dot radius ← kick, scroll ← reese.

Just outside the top 10 (high punch, but an engine item first):
- **Plexus**: `SN/POP/glsladvancedPOP/…/example8`. It links point pairs closer than `uDist`. It **needs engine**: a line renderer plus a neighbour search. WebGL2 has no atomics; a CPU O(N²) search for N ≲ 500, or a grid, is our inference ⚠️.
- **Verlet strings**: `_conceptsPOP` ex15. It **needs engine**: neighbour reads per point (a float state texture, not TF-only ⚠️).
- **Geometry explode**: MAT ex3. It **needs engine**: there are no geometry shaders.
- **Mesh surfaces** (§3): **needs engine**.

## §6 Quick wins: trivial colour/geometry filters (batch-portable, one tiny ISF each, cost S)
Each is a few lines of math plus `dryWet`. The donor ISF match (MIT, `donor/ISF-Files/ISF/`) is noted where one exists.
| # | Filter (TD source) | One-line math | Donor ISF | Suggested binding |
|---|---|---|---|---|
| q1 | solarize (`P/IF/solarize`) | `max(in·sm(Lt), (1−in)·sm(Dt))` | `Solarize.fs` | threshold ← build; flip on drop |
| q2 | rgbContrast (`P/IF/rgbContrast`) | `(x−.5)·c_ch+.5` per channel (c<0 inverts) | — | R contrast ← snare (sign flip) |
| q3 | colorThreshold (`P/IF/colorThreshold`) | `step(x_ch, t_ch)·in` → 8-colour posterise | (`Posterize` in app is different) | t ← sub |
| q4 | monochrome (`P/IF/monochrome`) | `dot(rgb, (.4,.4,.2))` | `Color Monochrome.fs` | mix ← drop (mono breakdown, colour on drop) |
| q5 | changeColor (`P/IF/changeColor`) | hue-band mask (±18°, soft 36°) → hue + offset inside | `Color Replacement.fs` ⚠️ | hue offset ← snare |
| q6 | changeToColor (`P/IF/changeToColor`) | hue-band mask → target colour | — | target hue ← lfo |
| q7 | dent (`P/IF/dent`) | per-axis smoothstep pinch/bulge | — | width ← kick |
| q8 | sharpen (`P/IF/sharpen`) | 5×5 unsharp | `Sharpen RGB.fs` | — (static) |
| q9 | emboss / normal-map relight (`SN/TOP/embossTOP`, `normalmapTOP`) | `n = normalize(−∇luma, k)`; `lit = dot(n, L)` | `Emboss.fs` | light angle ← lfo, k ← sub |
| q10 | checker (`P/Generators/checker`) | `mod(floor(uv·div).x + .y, 2)` | — | divisions ← kick (flash-gated) |
| q11 | hsvBlur / rgbaBlur (`P/IF/hsvBlur`, `rgbaBlur`) | blur only the hue (or R) at ¼ res; recombine / max | — (cost M, 2 passes) | blur size ← reese |
| q12 | twirl (`P/IF/twirl`) | `φ += (1−smoothstep(−s,s,r))·tw` | `Twirl.fs` | already a `light-tunnel` input; standalone only if wanted |

Not worth porting: softenAlpha (alpha only), convolve (needs a kernel UI), pixelate (have), the analysis tools (vectorScope, waveformMonitor, histogram), Gaussian splats (asset-driven, not reactive).

## §7 Sources (all local; the TD dump is the user's own extract)
- Snippet GLSL: `X/glsl_dat_manifest.json` → `X/dat_texts/Samples/Learn/OPSnippets/Snippets/{POP,TOP,CHOP,MAT,COMP}/…` (counts computed from the manifest).
- Palette networks: `X/Samples/Palette/{ImageFilters,Generators,POPs,Tools,Techniques}/*.tox` (decoded text tokens, per `donor/td-reverse/touchdesigner/README.md` phase 8); GLSL in `X/dat_texts/Samples/Palette/…/{pixel,julia,mandelbrot}.txt`, `noise/noise/noise/glsl2_pixel1.txt` (Wombat header, author's terms: "Use the code however you wish… credit"; https://github.com/BrianSharpe).
- Help: `X/Samples/Learn/OfflineHelp/https.docs.derivative.ca/Palette-{xyScope,pointillize,julia,mandelbrot,solarize,hsvBlur,rgbContrast,colorThreshold,changeColor,pointRender,superFormula,dilate,mesh,checker,dent}.htm` (mirror of https://docs.derivative.ca/Palette:xyScope etc.).
- Donor ISF: `donor/ISF-Files/` MIT (`LICENSE`), HEAD `395072d` 2026-06-04 (https://github.com/Vidvox/ISF-Files).
- App facts: `web/src/gl/engine.ts` L111–119 (mono wave texture), `web/src/audio/input.ts` L140–150 (L/R only under `?debug`), `web/src/doc.ts` L8 (blend modes), `web/src/fx/catalog.ts` L15 (own + isf globs), `web/src/fx/own/light-tunnel.fs` (`twirl` input).
