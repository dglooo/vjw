# plan_scenes_wave3 — Stage 2f: scene wave 3 (5 animal-particle, 2 laser, 3 free picks)

## TL;DR
- 5 CPs (CP0 engine + probes → CP1 animals → CP2 lasers → CP3 free picks → CP4 lead close), **12 one-coder steps** (S0.1–S3.3), **10 new starred built-ins**, 14 new files, **zero new npm deps**, no third-party code or art.
- One TF native, `native/creatures` (scatter's home-spring; the home is a sample of an own SVG-path silhouette), carries 4 animal scenes as render regimes (glow / streaks / 3D sway / dust); the 5th extends `native/plexus` with shape homes. Lasers: 2 analytic ISF generators. Free picks: **Wireform** (parametric wire meshes + explode), **Vortex** (force-field particles), **Orb** (displaced point sphere), all through one new orbit camera (`gl/view.ts`).
- Gates front-loaded in CP0: silhouette readability (S0.1, lead review), point count vs 5 ms (S0.2: N 131072, fallback 65536), the 3D look and cost (S0.3: pillow z, fallback slab). Later gates: plexus pair count (S1.4), laser luma flatness (S2.1).
- Per scene: billed A/B (`own/flash` appended) ≤ 5 ms p95 at 1728×1117 and one live pass per arr fixture with source↔param r. Per CP: the 60 s late-frame run (the GPU timer under-bills the last pass).

## Freshness
2026-11-14, planner. Spec: `thoughts/spec_scenes_wave3.md` §1–§5 (whole file). Inputs: `plan_td_wave2.md` L1–70, L185–201; `design_td_wave2.md` L22–33 (engine facts, code read 2026-11-06); `research_td_wave2.md` L24, L61–90; `STATE.md` HEAD L12 + Key facts. Code read today: `gl/scene.ts`, `scenes/points.ts` (L1–20, L140–342), `scenes/plexus.ts` L1–40, `scenes/scope.ts` L45, `scenes/builtin.ts` (all ids), `fx/catalog.ts`, `fx/types.ts` L5–12, `bind.ts` L26, `frame.ts`, the `fx/own/{flash,bloom,sdf-shapes}.fs` headers, twgl.js `package.json` (7.x full build: `m4` ships). Every TD path cited under § Scenes was opened today.
⚠️ All p95 figures are pre-measurement estimates. Measured anchors (waves 1–2): swarm N 65536 + trail + bloom is starred; scatter 120k points 2.65 ms (214k: 3.12 ms); plexus 2.15 / 3.48 ms.

## Chosen variant
None: there was no research or design pass. User decision 2026-11-14 (STATE HEAD L12): the plan comes straight from the lead spec, and the planner makes the architectural picks inline, each the laziest option that meets spec §4.

## Planner picks (each one: ⚠️ planner pick (no design pass))
- **P1 Shape data** (spec §5.1): hand-authored SVG path strings in `web/src/scenes/animals.ts` (100×100 box; `d` filled even-odd, `lines` stroked detail, `mirror` for symmetric animals), rasterised once on a 2D canvas (`Path2D`, 256²) into a density map (fill grey < stroke white, so outline and detail draw more points), then sampled. Reason: a native platform feature, a few KB of own data, curves for free; the sampler stays pure for Vitest.
- **P2 Morph** (§5.2): index-stable. Point i owns sample i of every shape; stratified sampling in raster order makes index i the i/n mass quantile, so a point sits at a similar height in each animal and keeps its colour. The switch is staggered per point (TD phaserPOP). Reason: nearest-target assignment is O(n²) for no visible gain, the cloud is scattered before every slam.
- **P3 One native, four regimes:** `native/creatures` inputs (size, trail, depth/yaw, wisp, hue/sat) separate glow / streaks / 3D / dust; the line scene extends `native/plexus` (wave-2 S2.2 precedent: new inputs, defaults bit-for-bit). Reason: one physics seam to test and tune, not five.
- **P4 3D** (§5.3): render-side only. `gl/view.ts` `orbitVP` (twgl `m4`, already installed) plus a per-point z; TF physics stays 2D in the object plane, `tfPoints` reused untouched. Ceiling: no volumetric flows (those need a 6-float TF state).
- **P5 Count** (§5.1): N 131072, gated at S0.2, fallback 65536 (the swarm's proven count); one N for all regimes (the count is fixed at `create()`).
- **P6 Lasers** (§5.4): analytic ISF generators, O(1) per emitter per pixel (the pixel's polar angle picks the nearest beam of the fan); analytic halo, no bloom pass; haze = 2-octave value noise in beam space (angle × distance). Reason: WebGL lines are 1 px (wave-2 S2.1) and haze needs per-pixel maths anyway.
- **P7 WCAG:** a 16-step chop is a **chase**: every step lights the same number of beams, so the frame luma stays flat; brightness changes only through `VJW_FLASH` inputs (`hit`, `burst`). An ISF cannot integrate a speed, so "sweep speed on reese/build" is sweep amplitude at a tempo-locked period.
- **P8 Free picks** (§5.5): Wireform, Vortex, Orb (reasons under § Scenes). Not picked: an hg_sdf raymarched hall (julia precedent: the estimate was 4× off; six tunnel / flythrough built-ins exist) and a spectrum terrain (`builtin:wave-landscape` exists).
- **P9 Animals:** the spec's ten, two per scene, paired by mood; front views are authored as a mirrored half. Reserve swaps at the lead's ruling: dragon → bat, panther → manta ray.

## Conventions (every step; a step states only what differs)
- **Brief opener, verbatim, line 1 of every dispatch:** "Invoke the `ponytail` skill (full) before writing code." Then: ~45 min (S0.2 and the CP1 steps ≈ 60), own worktree with `web/node_modules` symlinked, dev port **5175** (5173/5174 are taken), reads by symbol, ≤ 3 new files, one targeted browser check, Vite restarted after `web/src` edits. The lead merges, runs the gates, commits (CLAUDE.md #11).
- **Gates:** `cd web && npm run lint && npm run typecheck && npm test`. New npm deps: none. Donor authorisation: none (TD files are look references; nothing is copied).
- **A/B bench:** the step's scene with `own/flash` appended (billed tail), 1728×1117, scale 1, both fixtures → GPU p95 ≤ 5 ms.
- **Browser check:** file source `scratchpad/fx_audio/dnb174-arr.wav` (build 23.1 s, drop 34.1 s), then `dubstep140-arr.wav` (28.4 / 42.1 s), Auto-style on, **one live pass from the intro through the drop** (`build` is an online tracker: a seek-parked shot reads 0). Every bound param moves on its source, **r reported**. Techno scenes run on the dnb fixture with the techno preset (spec §4.2). Screenshots → `scratchpad/ed/<scene>.png`; animals and picks add `<scene>-drop.png` (≤ 0.5 s after the drop: the assembled still).
- **Natives:** `gl.viewport(0, 0, f.width, f.height)` before every geometry draw; a `size` (tile) → N × 0.1; events use the `held` rising-edge pattern (points.ts); additive deposit ÷ size; sparkle zero-mean; trails fade by `trailKeep` (scope.ts); no input brightens the frame on a hit.
- **Headers:** every new file opens with `Look: TD <component> (studied, rewritten)`. Own code only: no `web/THIRD_PARTY.md` rows.
- **Bindings** read `source attack/release min→max`; defaults live in the native def's `bind` or the file's `VJW_BIND` and are repeated in the built-in (JSON literals). Policy (STATE Key facts): drums, sub, build and drop bind directly; the bass-class param binds `reese` (Auto: Dubstep → wobble); `hats` = sparkle/detail only; brightness on a hit only via `VJW_FLASH`, binding min 0 (flashGate ≤ 3/s). **All binding numbers are ⚠️ Assumption, needs confirmation** at each CP demo.
- **Tests:** one unit test on each native's pure seam; ISF files join the `NEW_OWN` `test.each` in `web/src/fx/isf.test.ts`.
- **Lead close-out per CP:** contact sheet `scratchpad/ed/w3-cpN-sheet.png` + the 60 s late-frame run over the CP's built-ins on both fixtures → 0 late, 1.00×.

## Scenes (the 10 built-ins, all `star: true`)
Path prefixes: `SN/` = `donor/td-reverse/touchdesigner/extracted/dat_texts/Samples/Learn/OPSnippets/Snippets/`, `PAL/` = `donor/td-reverse/touchdesigner/extracted/dat_texts/Samples/Palette/`. Bindings read `param←source attack/release min→max`; **[F]** marks a `VJW_FLASH` input. "Auto" = the bass-class param that Auto-style drives (DnB / Techno: reese; Dubstep: wobble). Cost = billed p95 estimate.

| # | Built-in · look | Genre | Block | Look reference (studied, rewritten) | Bindings | Auto | Cost |
|---|---|---|---|---|---|---|---|
| 1 | `builtin:spirit` Spirit · wolf ↔ eagle, big glow sprites | DnB | `native/creatures` set 0 | SN/POP `sprinklePOP` ex1 (points in a shape), `phaserPOP` ex1 (staggered point-set transition), `particlePOP` ex3 (image-weighted birth) | scatter←build 1/.15 0→.9 · next←drop 0/.1 · pulse←kick 0/.25 0→1 · hue←snare 0/.3 .52→.72 · swirl←reese .05/.4 .02→.25 · size←sub .05/.3 2.5→4.5 · sparkle←hats 0/.08 0→.5; static trail .5, hold 16 | swirl | N, 3–4 ms |
| 2 | `builtin:chase` Chase · panther ↔ stag, streak trails | rave | creatures set 1 | row 1 + SN/POP `trailPOP` ex1 (time-history strips) | row 1 with scatter 0→1.2, pulse 0/.2, hue .08→.2, swirl .06→.45, size 1.2→2.2; static trail .95, hold 8 | swirl | N, 3–4 |
| 3 | `builtin:abyss` Abyss · shark ↔ jellyfish, 3D volume, camera sway | DnB | creatures set 2 | row 1 + PAL `POPs/pointRender` (points + `cameraViewport`) | row 1 with hue .55→.62, swirl .02→.2, size 2→4, plus yaw←lfo sine .07 Hz −.09→.09; static depth .35, trail .7, hold 16 | swirl | N, 3–4 |
| 4 | `builtin:dust` Dust · owl ↔ butterfly, 1 px ink/dust grain with strays | techno | creatures set 3 | row 1 + SN/POP `forceradialPOP` ex1 (a force pulls strays off the body) | row 1 with scatter 0→.7, pulse 0→.6, hue .09→.12, swirl .03→.3, no size bind, plus wisp←sub .05/.4 .2→.8; static size 1, sat .15, trail .6, hold 16 | swirl | N, 3 |
| 5 | `builtin:zodiac` Zodiac · dragon ↔ snake, constellation nodes + lines | techno | `native/plexus` shape 5 | SN/POP `glsladvancedPOP` ex8 (lines between near points, as wave 2), `phaserPOP` ex1 | drift←reese .05/.4 .2→1 · dist←sub .05/.3 .08→.2 · size←kick 0/.1 2→5 · pulse←kick 0/.2 0→.06 · hue←snare 0/.3 .1→.16 · wander←build 1/.15 .15→1 · next←drop 0/.1; static hold 16 | drift | S, 2.5–3.5 |
| 6 | `builtin:laser-grid` Laser Grid · 4 truss emitters, green + white, strict fans, a 16-step chase | techno | `own/laser-grid.fs` | SN/CHOP `laserCHOP` ex1 ("a few ways to generate laser patterns"), ex2 (a stepped pattern: cycles + phase) | phase←bar saw ×1 0→1 · spread←sub .05/.3 .25→.6 · tilt←reese .05/.4 0→.5 · dash←hats 0/.06 0→1 · swap←snare 0/.25 0→1 · haze←build 1/2 .3→.9 · hit←kick 0/.12 0→.6 **[F]** · burst←drop 0/.4 0→1 **[F]**; static hits 5, hue .36 | tilt | S, 1–2 |
| 7 | `builtin:laser-storm` Laser Storm · a centre cone / tunnel + 2 side scanners, rainbow by beam | rave / DnB | `own/laser-storm.fs` | SN/CHOP `laserCHOP` ex1 (pattern → beam; our reading: a scanned circle is a cone in haze) | scan←beat saw ×1 0→1 · radius←sub .05/.3 .25→.6 · twist←reese .05/.4 0→1 · spread←build 1/2 .3→1 · hueShift←snare 0/.3 0→.33 · dash←hats 0/.06 0→1 · hit←kick 0/.12 0→.6 **[F]** · burst←drop 0/.4 0→1 **[F]**; static haze .6 | twist | S, 1.5–2.5 |
| 8 | `builtin:wireform` Wireform · parametric wire surfaces that morph and explode | techno | `native/wireform` | PAL `Generators/mesh` (17 shapes; the dump holds only their names: `…/extracted/Samples/Learn/OfflineHelp/https.docs.derivative.ca/Palette-mesh.htm`), PAL `Generators/superFormula/…/script1_callbacks_3D.txt`, SN/MAT `glslMAT` ex3 `phong1GLSLGeometry.txt` (explode along face normals), SN/POP `twistPOP` ex1 | explode←build 1/.15 0→.8 · next←drop 0/.1 · pulse←kick 0/.2 0→.25 · twist←reese .05/.4 0→1.2 · scale←sub .05/.3 .85→1.1 · hue←snare 0/.3 .5→.85 · sparkle←hats 0/.08 0→.5 · yaw←lfo saw .04 Hz 0→1; static pitch .06, hold 8 | twist | S, 2.5 |
| 9 | `builtin:vortex` Vortex · 65k points in a tilted spiral disc, trails | rave | `native/vortex` | SN/POP `forcePOP` ex1 + `forceradialPOP` ex1–2 (radial + spiral forces with falloff: "gravitational wells to chaotic vortexes"), `particlePOP` ex1, `trailPOP` ex1 | spin←reese .05/.4 .4→2.5 · pull←sub .05/.3 .6→.25 · burst←kick 0/.15 0→1.5 · hue←snare 0/.3 0→.25 · sparkle←hats 0/.08 0→.5 · trail←build 1/2 .88→.97 · nova←drop 0/.1 · yaw←lfo saw .03 Hz 0→1; static pitch .17 | spin | N, 3–4 |
| 10 | `builtin:orb` Orb · a 60k-point sphere, noise-displaced, shock shells | DnB | `native/orb` | SN/POP `spherePOP` ex1 (point sphere), `fieldPOP` ex1 (points moved by a shape-distance weight), PAL `POPs/pointRender` | amp←sub .05/.3 .08→.35 · spike←kick 0/.2 0→.5 · twist←reese .05/.4 0→1 · freq←build 1/.3 1.5→5 · hue←snare 0/.3 .58→.8 · sparkle←hats 0/.08 0→.5 · shatter←drop 0/.1 · yaw←lfo saw .05 Hz 0→1 | twist | S–N, 2.5–3.5 |

Why these three picks: **Wireform** is the one dump generator family still missing (the meshes and the MAT explode, both deferred in wave 2 for lack of 3D) and costs like plexus. **Vortex** is the dump's own headline force look, and only its vertex shader is new (`tfPoints` and the swarm trail are reused). **Orb** is the signature TD audio-reactive look, needs no TF state (the cheapest 3D scene) and has no sibling among the 53 built-ins.

## Checkpoints and steps

### CP0 — engine + probes: shape sampler, `native/creatures`, orbit camera (S0.1–S0.3)
**Frozen contract:**
```ts
// web/src/scenes/animals.ts — own path data (no third-party art, no fonts); CP1 steps append their animals and sets
export interface AnimalPath { d: string; lines?: string; mirror?: boolean } // 100×100 box, y down; d: even-odd fill (eyes = holes); lines: stroked detail; mirror: the left half is authored
export const ANIMALS: Readonly<Record<string, AnimalPath>>
export const SETS: readonly { name: string; ids: readonly string[] }[] // 0 spirit [wolf, eagle], 1 chase, 2 abyss, 3 dust, 4 zodiac
// web/src/scenes/shapes.ts
export function sampleMask(density: Uint8Array | Uint8ClampedArray, w: number, h: number, n: number, seed?: number): Float32Array // PURE: n×2 xy in [0,1), stratified by density, raster order (index i = the i/n mass quantile)
export function shapePoints(id: string, n: number): Float32Array // browser: n×4 [x, y, z, edge] in scene units (fits ±0.8), cached by id:n
export interface Morph { from: number; to: number; mix: number; slot: number; dur: number } // mix 0→1 over dur s: the staggered switch from → to
export function morphStep(m: Morph, len: number, next: boolean, bar: number, hold: number, dt: number): Morph // PURE (S0.2): next = rising edge → slam (SLAM 0.12 s); floor(bar / hold) changed → calm morph (PHASE 1.5 s); hold 0 = off
// web/src/scenes/creatures.ts — id 'native/creatures', generator, category 'geometry', tags ['particles', 'animals']
// inputs: set (long, values/labels from SETS), size, trail, scatter, swirl, pulse, hue, sat, sparkle, hold (bars), next (event); S0.3 adds depth, yaw (turns); S1.3 adds wisp
// web/src/gl/view.ts
export function orbitVP(yaw: number, pitch: number, aspect: number): Float32Array // PURE: column-major mat4, radians; at (0, 0) the z = 0 plane maps onto the 2D scene units (x ±aspect, y ±1)
export const FOCAL: number // camera distance = 1/tan(fovY/2); a VS sizes points by FOCAL / gl_Position.w
// web/src/scenes/points.ts — tfPoints, NOISE, HASH, FS gain `export` (no behaviour change)
```
**Demo (`npm run dev`, lead checkout):** star `Spirit` and play `dnb174-arr.wav`: a glowing wolf made of points holds its shape, kicks send a ring through it, snares turn its colour; through the build it loosens into a drifting cloud, and at 34.1 s the cloud slams together as an eagle. In the editor, `depth` .35 with `yaw` moved swings the eagle as a volume.

#### S0.1 [ ] [M] shape sampler + wolf, eagle + the readability gate
- Invoke the `ponytail` skill (full) before writing code. **Goal:** prove that an own-authored, point-sampled silhouette reads at a glance (spec §4.4) before any native exists.
- **Files (3 new):** `web/src/scenes/shapes.ts` (`sampleMask`, `shapePoints`), `web/src/scenes/animals.ts` (wolf: front head, mirrored; eagle: wings spread, mirrored; `SETS[0]`), `web/src/scenes/shapes.test.ts`. **Depends on:** —.
- **Behaviour:** `shapePoints` rasterises on a 256² 2D canvas: fill `d` (even-odd) at grey 96, stroke `d` + `lines` at 255 (≈ 2 box units wide) → density; a blurred copy of the fill (`ctx.filter`) → pillow. `sampleMask` walks the density CDF with a seeded PRNG (u_i = (i + rand)/n, in-texel jitter). Per sample: x, y to scene units (y up), z = (rand·2 − 1)·pillow, edge = 1 where the density is 255.
- **Tests:** `sampleMask` on synthetic masks: n samples, all on non-zero texels; same seed → same output; a 255 region draws ≈ 2.7× an equal-area 96 region (±15 %); texel rows non-decreasing (raster order). Data: every `SETS` id is an `ANIMALS` key with a `d` or `lines` (covers the CP1 appends).
- **Done / gate:** gates green; a scratch harness (outside `web/src`) plots `shapePoints(id, 20000)` for both → `scratchpad/ed/w3-animals-cp0.png`. **The lead reviews: each reads without a caption.** Fail → one more authoring round on the lead's notes; fail again → a reserve swap (P9), lead ruling.

#### S0.2 [ ] [L] `native/creatures` + `morphStep` + the count gate → `builtin:spirit`
- Invoke the `ponytail` skill (full) before writing code. **Goal:** the morph engine (scatter's home-spring with the home read from a shape texture), the spec §2.A choreography, and a frozen N.
- **Files (1 new):** `web/src/scenes/creatures.ts`; (edit) `shapes.ts` + `shapes.test.ts` (`morphStep`), `points.ts` (exports), `fx/catalog.ts`, `scenes/builtin.ts`. **Depends on:** S0.1.
- **Behaviour:** per animal one RGBA32F texture, 256 × ⌈N/256⌉, from `shapePoints` (module cache; `texelFetch` by `gl_VertexID`). VS = scatter's backward-Euler spring (`DAMP`; vec4 state through `tfPoints`; a zero state starts at home, so a tile's still is the assembled animal) toward `home + noise₁·scatter + noise₂·swirl`, with `home = i/N < uMix ? B : A` (the staggered switch; the spring does the easing). `pulse`: a ring at radius (1 − pulse)·R pushes the points it crosses outward. Colour = hsv(hue + 0.15·i/N, sat), edge points brighter. Draw = the swarm's: persistent half-float trail → additive round sprites → bloom → `COMPOSITE_FS`. `draw` runs `morphStep` on `f.sync.bar`. Choreography: `scatter←build` (release .15 s) loosens the shape; `next←drop` slams the cloud into the set's next animal; `hold` bars → a calm morph; the rest per § Scenes row 1.
- **Tests:** `morphStep`: an edge advances `to` and wraps at `len`; `mix` reaches 1 after SLAM; `hold` 16 advances once per 16 bars over PHASE; `hold` 0 never advances; no edge, no change.
- **Done / gate:** gates green. **N gate:** billed p95 at N 131072 ≤ 4.5 ms on both fixtures → keep; else N 65536 (must be ≤ 5 ms; else lower size/bloom and report). Live pass on both fixtures: the wolf scatters through the build, the eagle assembles at the drop (`spirit-drop.png`); r per bound param.

#### S0.3 [ ] [M] `gl/view.ts` orbit camera + `depth` / `yaw` on creatures (the 3D probe)
- Invoke the `ponytail` skill (full) before writing code. **Goal:** the one view-projection every 3D scene of the wave shares (spec §5.3), proven on the eagle.
- **Files (2 new):** `web/src/gl/view.ts`, `web/src/gl/view.test.ts`; (edit) `creatures.ts`. **Depends on:** S0.2.
- **Behaviour:** `orbitVP` = twgl `m4` perspective × look-at, the eye at FOCAL·(sin yaw·cos pitch, sin pitch, cos yaw·cos pitch) looking at the origin (look: TD `POPs/pointRender` `cameraViewport`). creatures gains `depth` (0–.6, default 0) and `yaw` (−1…1 turns, default 0): a render-only z = depth·(home.z·settle + s·|p − target|), settle = 1 − clamp(|p − target|/0.3), s = a signed per-point hash, so a scattered cloud is a volume too; `gl_Position = uVP·vec4(p, z, 1)`, size and brightness × FOCAL/w.
- **Tests:** at (0, 0): (x, y, 0) → ndc (x/aspect, y) and w = FOCAL; at yaw ¼ turn (1, 0, 0) projects to x ≈ 0; a point at z > 0 projects larger than its mirror at z < 0.
- **Done / gate:** gates green; at depth 0, yaw 0 `builtin:spirit` is unchanged (frozen pair, the wave-2 S2.2 method); at depth .35, yaw ±.09 the eagle reads as a volume (`w3-view.png`) and billed p95 stays within +0.3 ms of S0.2. If the pillow reads wrong → z = a hash slab, reported.

### CP1 — animals: Chase, Abyss, Dust, Zodiac (S1.1–S1.4)
**Frozen contract:**
```ts
// web/src/scenes/animals.ts — ANIMALS holds all ten; SETS[1..4] = chase [panther, stag], abyss [shark, jellyfish], dust [owl, butterfly], zodiac [dragon, snake]
// web/src/scenes/creatures.ts — S1.3 adds:
{ name: 'wisp', type: 'float', min: 0, max: 1, default: 0 } // share of points that stray far along the swirl field (0 = the S0.2 look)
// web/src/scenes/shapes.ts — S1.4 adds:
export function stagger(mix: number, t: number): number // PURE: eased 0→1 progress of the point at phase t ∈ [0,1) for a morph at `mix` (the CPU twin of the VS switch)
// web/src/scenes/plexus.ts — native/plexus gains (defaults keep builtin:plexus bit-for-bit):
{ name: 'shape', type: 'long', values: [0, 1…SETS.length], default: 0 } // 0: today's homes; k: SETS[k − 1]
{ name: 'wander', type: 'float', min: 0, max: 1, default: 1 }           // × the orbit radii
{ name: 'pulse', type: 'float', min: 0, max: 0.2, default: 0 }          // a radial punch
{ name: 'hold', type: 'float', min: 0, max: 64, default: 0 }, { name: 'next', type: 'event' }
```
**Demo:** press through the five animal scenes on `dnb174-arr.wav`, then `dubstep140-arr.wav`. Each holds its first animal, loosens through the build and assembles the second at the drop. Chase leaves streak trails; Abyss sways as a 3D volume; Dust is 1 px grain that sheds strays with the sub; Zodiac draws its dragon as nodes and lines. Five different pictures, not one picture in five colours.

Common to S1.1–S1.3 — **Files (0 new):** (edit) `animals.ts` (two paths + the `SETS` entry), `scenes/builtin.ts`. **Tests:** S0.1's `SETS` data test covers the new entries; no new pure logic. **Done:** gates green; billed p95 ≤ 5 ms; live pass on both fixtures with r; `<scene>.png` + `<scene>-drop.png`; the lead's readability review of the two animals (fail → as S0.1).

#### S1.1 [ ] [M] Chase: panther + stag → `builtin:chase`
- Invoke the `ponytail` skill (full) before writing code. **Goal:** the streak regime. **Depends on:** S0.2.
- **Behaviour:** panther = a prowling profile (the one unmirrored hard case); stag = a front head with the antlers as `lines`, mirrored. Built-in per § Scenes row 2: trail .95, small sprites, and a swirl floor of .06, so the points always run along the noise field (short streaks at rest, long ones on the reese).

#### S1.2 [ ] [M] Abyss: shark + jellyfish → `builtin:abyss`
- Invoke the `ponytail` skill (full) before writing code. **Goal:** the 3D regime. **Depends on:** S0.3.
- **Behaviour:** shark = a side profile; jellyfish = a bell with tentacles as `lines`, mirrored. Built-in per row 3: depth .35, trail .7, and `yaw←lfo sine` as a sway of ±.09 turns (a flat silhouette must never turn edge-on).

#### S1.3 [ ] [M] Dust: owl + butterfly + `wisp` → `builtin:dust`
- Invoke the `ponytail` skill (full) before writing code. **Goal:** the ink/dust regime. **Depends on:** S0.2.
- **Behaviour:** owl = front view, mirrored, with eye holes; butterfly = top view, mirrored. `creatures.ts` gains `wisp`: a point's swirl gain = mix(1, 8·hash³, wisp), so a few percent of the points stray far and stream off the body. Built-in per row 4: size 1 px, sat .15, low bloom.

#### S1.4 [ ] [L] Zodiac: dragon + snake on `native/plexus` → `builtin:zodiac` (pair-count gate)
- Invoke the `ponytail` skill (full) before writing code. **Goal:** the line regime: plexus nodes whose homes are shape samples. **Depends on:** S0.2.
- **Files (0 new):** (edit) `scenes/plexus.ts`, `shapes.ts` + `shapes.test.ts` (`stagger`), `animals.ts`, `scenes/builtin.ts`.
- **Behaviour:** dragon and snake are built from strokes (`lines`: an S-curve body, a head, spines), so the density sits on the lines. At `shape` k the node homes are the xy of `shapePoints(id, plexusN)`; `morphStep` + `stagger` lerp each home A → B (no spring on the CPU); `wander` scales the orbit radii (.15 holds the shape, 1 is today's drift); `pulse` pushes the nodes outward. `shape` 0 takes today's path untouched.
- **Tests:** `stagger`: 0 at mix 0, 1 at mix 1, monotonic in mix, a later t starts later.
- **Done / gate:** gates green; `builtin:plexus` frozen pair unchanged; **gate:** billed p95 ≤ 5 ms with the clustered nodes (levers: the `dist` range, then N; aim at 6–12 neighbours per node); live pass on both fixtures with r; `zodiac.png` + `zodiac-drop.png`. Still over → lead ruling (unstar, the melt precedent).

### CP2 — lasers: Laser Grid (techno), Laser Storm (rave / DnB) (S2.1–S2.2)
**Frozen contract:** no engine surface. Two own ISF generators in `web/src/fx/own/`, in our ES 1.00 subset (constant loop bounds, no array constructors, no `varying`), `CATEGORIES ["Geometry", "Laser"]`:
- `laser-grid.fs`: inputs `phase, hits, spread, tilt, dash, swap, haze, hue, hit, burst`; `VJW_FLASH ["hit", "burst"]`.
- `laser-storm.fs`: inputs `scan, radius, twist, spread, hueShift, dash, haze, hit, burst`; `VJW_FLASH ["hit", "burst"]`.
- Shared shape language (each file carries its own ~15-line copy; an ISF has no includes): a beam = a thin core + an analytic halo 1/(1 + (d/w)²), brighter where the haze noise is dense; a fan evaluates only the beam nearest to the pixel's polar angle about its emitter (± 1 neighbour for the halo).

**Demo:** `Laser Grid` with the techno preset: four emitters on the top edge throw strict green fans that change pose on every beat and chase through a 16-step pattern, while the picture never blinks as a whole; hats dot the beams, a build thickens the smoke, the drop opens the full fan with a white core. `Laser Storm` on `dnb174-arr.wav`: a rainbow cone opens toward the viewer with the sub, its spokes scan once per beat and shear on the reese, two side scanners widen through the build.

#### S2.1 [ ] [M] `own/laser-grid.fs` → `builtin:laser-grid` (luma-flatness gate)
- Invoke the `ponytail` skill (full) before writing code. **Goal:** the techno laser: mono / two-colour, strict geometry, 16-step chops that stay inside WCAG 2.3.1 by construction. **Depends on:** —.
- **Files (1 new):** `web/src/fx/own/laser-grid.fs`; (edit) `fx/isf.test.ts` (`NEW_OWN`), `scenes/builtin.ts`.
- **Behaviour:** 4 emitters on the top edge, 8 beams each, mirrored left/right. step = floor(fract(1 − phase)·16) (`phase←bar saw`); the pose (parallel / crossed / fan / scissor) is a function of floor(step/4); beam b of emitter e is lit iff mod((step + 4e + b)·hits, 16) < hits. For an odd `hits` every step lights exactly 2·hits of the 32 beams, so a chop moves the light without changing its amount. `spread` opens the fans, `tilt` scissors them, `dash` dots the beams, `swap` exchanges green and white, `haze` raises the smoke; `hit` lifts the cores, `burst` lights all 32 with a white core.
- **Tests:** the `NEW_OWN` row (parses in our subset; every source ∈ `SOURCE_IDS`; `hit` and `burst` bound from 0).
- **Done / gate:** gates green; billed p95 ≤ 5 ms (over → layer res .75); **gate:** with `hit` and `burst` unbound, the frame's mean luma changes < 10 % between steps over 4 bars; with them bound, `__flash` ≤ 3/s and the luma cap holds; live pass (dnb fixture + techno preset, then dubstep) with r; `laser-grid.png`.
  **Status (coder, 2026-11-14): built, committed, every other gate green — left unticked because the flatness gate reads over 10 % by the chase's own steps in the plan's check configuration (dnb fixture + techno preset); see ⚠️ under Flatness. The lead rules and ticks.**
  **Changed during implementation:** (1) **The CP2 shape language, as built (S2.2 should copy this, not the contract's "nearest ± 1"):** two passes, no engine surface. `mist` (`PASSES`, FLOAT, `$WIDTH/4`) sums the halos of **all 8 beams** of each fan + the smoke + a reach mask in alpha; the final pass draws the cores at full res for the nearest beam ± 1, only within reach of a lit beam. Why: at the lead's quality bar (2026-11-14: wide soft halos) a halo spans several beam pitches, so a ± 1 window cuts it and makes its light depend on the pitch. (2) **Flatness needed more than the beam count:** each halo is normalised by its own in-frame run (floor or side wall), the pose swing is a half-beat glide that lands on the beat, the dots are light-neutral (cores only, widened), the colour swap is a decisive crossfade with luma-matched white. Before these the gate failed on a locked grid (step changes up to 12.4 % in the intro and drop windows); the per-beam normalisation alone took a static chop + pose change from 21 % to 3.4 %. (3) **`burst`** lights all 32 cores but half their halo (`FLOOD`) and holds the cores solid: the composited drop peak went 0.899 → 0.877 (0.87 in the final shader). (4) `hits` VALUES are odd only (1, 3, 5, 7). (5) **Measured** (final shader, 1728×1118, scale 1; the GPU was shared, so every A/B carries `builtin:stars`+flash as a same-session reference, 0.71 ms in wave-2 S1.3): billed p95 **2.89** (dubstep, reference 1.29) and **2.96** (dnb + techno, the one round with the reference at 1.29) on a quiet GPU; pooled 3.59 / 3.84 / 3.93 with the reference at 1.59 / 1.61 / 1.95, and 4.86 in one run whose reference itself read 3.87. **Flatness** (`hit`, `burst` unbound, the engine's post pass skipped, max change of the frame's mean luma between consecutive steps over 4 bars, windows intro / build / drop). On a fixed clock, one true 16th per bin (64 bins): dnb fixture + techno preset **5.3 / 4.5 / 5.8 %**, + dnb preset **6.0 / 4.5 / 7.3 %**, dubstep **4.2 / 5.1 / 8.1 %** — under 10 % everywhere. By the chase's own steps: locked grid (dnb preset, 4 runs) 6.0–6.5 / 7.1–9.1 / 7.1–8.1 %, dubstep 4.3–4.8 / 6.6–7.1 / 7.4–8.3 %; ⚠️ techno preset (4 runs) 3.9–5.7 / 9.2–12.5 (or frozen) / 9.0–15.0 %: the techno tempo range locks 174 BPM weakly (confidence 0.1–0.55), the bar saw shrinks, a "step" lasts 0.2–0.45 s, and it then spans the haze's own slow ramp (build) and decay (after the drop) — nothing chops there. **Lead ruling wanted:** accept the fixed-clock reading, or flatten haze's share of the light. Bound: `__flash` 1.07/s, max 3 in 1 s (dnb); 0.44/s, max 2 (dubstep); composited peak mean luma 0.865–0.87 (the engine's own 0.8 drop flash + the burst). r (dnb / dubstep): phase 1.00 / 1.00, spread 1.00 / 0.89, tilt 0.96 / 0.91, dash 0.93 / 0.94, swap 0.87 / 0.86, haze 0.90 / 0.93, hit 0.94 / 0.95, burst 0.99 / 0.99; Auto on the real built-in under Dubstep: styled reese ↔ wobble 1.00, tilt ↔ wobble 0.84. (6) **Findings, not fixed:** (a) after a `web/src` edit under a running Vite, 21 of 22 page loads ran a starved analysis (no drums, no grid; the one live load held no scene); after a Vite restart 29 of 29 were live — a likely cause of wave-2 S3.5 note 5; (b) the engine's drop flash (0.8, τ 0.2 s) covers the first ≈ 0.3 s of the burst (release 0.4 s per row 6): a longer burst release would outlive it — confirm at the CP2 demo.

#### S2.2 [ ] [M] `own/laser-storm.fs` → `builtin:laser-storm`
- Invoke the `ponytail` skill (full) before writing code. **Goal:** the rave / DnB laser: multicolour, fast scanning, a tunnel. **Depends on:** S2.1 (its beam and haze functions, copied).
- **Files (1 new):** `web/src/fx/own/laser-storm.fs`; (edit) `fx/isf.test.ts`, `scenes/builtin.ts`.
- **Behaviour:** a centre emitter facing the viewer: a scanned circle of radius `radius` reads as a cone in the haze (a bright ring, its wall fading inward), with 24 radial spokes, hue by spoke index + `hueShift`, rotating one spoke pitch per `scan` cycle (`scan←beat saw`) and sheared into a spiral by `twist`. Two side emitters in the bottom corners sweep rainbow fans, the arc set by `spread`. Every beam is always on (it only moves), so the luma is flat by construction; `dash`, `hit`, `burst` as in S2.1.
- **Tests:** the `NEW_OWN` row.
- **Done:** gates green; billed p95 ≤ 5 ms (over → layer res .75); `__flash` ≤ 3/s and the luma cap hold; live pass on both fixtures with r; `laser-storm.png`.

### CP3 — free picks: Wireform, Vortex, Orb (S3.1–S3.3)
**Frozen contract:**
```ts
// web/src/scenes/wireform.ts — id 'native/wireform', generator, 'geometry', tags ['mesh', 'wireframe', '3d']
export function surface(kind: number, u: number, v: number): [number, number, number] // PURE: u, v ∈ [0,1]; every kind fits the unit ball
// inputs: explode, pulse, twist, scale, hue, sparkle, yaw, pitch (turns), hold (bars), next (event)
// web/src/scenes/vortex.ts — id 'native/vortex', generator, 'geometry', tags ['particles', 'vortex', '3d']
export function novaPull(age: number): number // PURE: the pull multiplier `age` s after a drop: a blast outward, a strong re-accretion, then 1
// inputs: spin, pull, burst, hue, sparkle, trail, yaw, pitch, nova (event)
// web/src/scenes/orb.ts — id 'native/orb', generator, 'geometry', tags ['particles', 'sphere', '3d']
export function orbPoints(n: number): Float32Array // PURE: n×3 unit vectors, a Fibonacci lattice
// inputs: amp, spike, twist, freq, hue, sparkle, yaw, shatter (event)
// all three: registered in fx/catalog.ts; camera = orbitVP (CP0); wireform's morph clock = morphStep (CP0)
```
**Demo:** `Wireform` (techno preset): a glowing wire surface orbits, kicks run a wave over it, the reese twists it, through the build its quads drift apart, and at the drop they fly back together as the next surface. `Vortex`: a tilted spiral disc of points with trails spins up on the reese, breathes with the sub, blasts out and re-forms at the drop. `Orb`: a sphere of points swells and roughens with the sub, a shock shell crosses it on every kick, and the drop shatters and rebuilds it.

#### S3.1 [ ] [L] `native/wireform` → `builtin:wireform`
- Invoke the `ponytail` skill (full) before writing code. **Goal:** TD's parametric meshes as an additive wireframe that morphs and explodes (the wave-2-deferred mesh + MAT explode). **Depends on:** S0.3.
- **Files (2 new):** `web/src/scenes/wireform.ts`, `web/src/scenes/wireform.test.ts`; (edit) `fx/catalog.ts`, `scenes/builtin.ts`.
- **Behaviour:** `surface`: ≥ 6 kinds from the TD mesh list (suggested: Elliptic Torus, Astroidal Ellipsoid, Bohemian Dome, Triaxial Tritorus, Steinbach Screw, Shell) + the 3D supershape (two superformulas; TD defaults M1 20, M2 10). ⚠️ Assumption, needs confirmation: the dump holds only the names (`Palette-mesh.htm`), so the coder uses the standard public definitions, and only the ones it is sure of. Geometry: a 48×48 grid of de-indexed quads, two edges each, as LINES (+ POINTS at the corners); attributes posA, posB, the quad's normal and phase, refilled on the CPU at each morph. VS: mix(posA, posB) by the staggered `mix` (`morphStep`: `next←drop` slam, `hold` 8 bars) + normal·(a pulse wave + explode·(0.5 + hash)) → twist about y → `scale` → `uVP`. Draw: additive lines → bloom → `COMPOSITE_FS` (the plexus pipeline).
- **Tests:** `surface`: finite on a 16×16 grid for every kind; |p| ≤ 1.05; closed kinds meet at u = 0 and u = 1.
- **Done:** gates green; billed p95 ≤ 5 ms; live pass (dnb fixture + techno preset, then dubstep) with r; `wireform.png` + `wireform-drop.png`.

#### S3.2 [ ] [M] `native/vortex` → `builtin:vortex`
- Invoke the `ponytail` skill (full) before writing code. **Goal:** TD's force look (forcePOP: radial + spiral forces, wells to vortexes) as a 3D disc of trailing points. **Depends on:** S0.3.
- **Files (2 new):** `web/src/scenes/vortex.ts`, `web/src/scenes/vortex.test.ts`; (edit) `fx/catalog.ts`, `scenes/builtin.ts`.
- **Behaviour:** N 65536 (tile 4096) through `tfPoints`; the state is position and velocity in the disc plane. The velocity relaxes toward a field: a tangential `spin` with a 1/√r falloff + an inward `pull`·`novaPull(age)` + curl noise (`NOISE`); `burst` adds a radial kick. A point inside the core or past the rim respawns on the rim (the zero-state "new" trick). Render: z = a per-point hash × a thickness that thins with r, through `uVP` at `pitch` .17 with `yaw` orbiting; the swarm's trail (`trailKeep`) → bloom → `COMPOSITE_FS`.
- **Tests:** `novaPull`: negative just after 0; > 1 during the re-accretion; exactly 1 after it ends and at age = ∞ (no drop yet).
- **Done:** gates green; billed p95 ≤ 5 ms (over → N 32768); live pass on both fixtures with r; `vortex.png` + `vortex-drop.png`.

#### S3.3 [ ] [M] `native/orb` → `builtin:orb`
- Invoke the `ponytail` skill (full) before writing code. **Goal:** the displaced point sphere (spherePOP + a fieldPOP-weighted push), with no TF state. **Depends on:** S0.3.
- **Files (2 new):** `web/src/scenes/orb.ts`, `web/src/scenes/orb.test.ts`; (edit) `fx/catalog.ts`, `scenes/builtin.ts`.
- **Behaviour:** N 60000 static unit vectors (`orbPoints`; tile × 0.1). VS: radius = 0.55·(1 + amp·snoise(n·freq + t) + spike·shell), where shell is a band that sweeps pole to pole as the kick envelope decays; `twist` rotates about y by latitude; `shatter` (a rising edge → an age clock on the CPU) blows the radius out and lets it fall back; `uVP` with `yaw` orbiting; size and brightness × FOCAL/w (the far side dimmer). Draw: additive round sprites → a short trail → bloom → `COMPOSITE_FS`.
- **Tests:** `orbPoints`: n×3, unit length (±1e-5), deterministic, |mean| < 0.02, y spans −1…1.
- **Done:** gates green; billed p95 ≤ 5 ms (over → N 30000); live pass on both fixtures with r; `orb.png` + `orb-drop.png`.

### CP4 — close (lead, no coder)
**Frozen contract:** none (terminal).
**Demo / verification:** 60 s autopilot over all 10 built-ins on both arr fixtures → 0 late, 1.00×; the final billed-tail p95 sheet (all 10 ≤ 5 ms); r for every bound param; `scratchpad/ed/w3-sheet.png` reviewed (five assembled animals read at a glance; five different pictures); `__flash` ≤ 3/s and the luma cap on the two lasers; the 2b library shows `native/creatures`, `native/wireform`, `native/vortex`, `native/orb`, `own/laser-grid`, `own/laser-storm` (and the extended `native/plexus`) with stills; STATE + INDEX updated.

## Acceptance mapping (spec §4)
| Spec §4 | Proved by |
|---|---|
| 1. p95 ≤ 5 ms billed, gates green | every step's A/B bench; the gates S0.2 (N) and S1.4 (pairs); CP4's final sheet. Over budget → the step's lever, then a lead ruling (L-class / unstar) |
| 2. reaction on both fixtures, r; the animal assembles on the drop | every step's live pass (`<scene>-drop.png`); the techno scenes (Dust, Zodiac, Laser Grid, Wireform) on the dnb fixture + techno preset |
| 3. `__flash` ≤ 3/s, WCAG luma cap | S2.1's luma-flatness gate, S2.2; animals and picks have no flash input (by construction); CP4 |
| 4. the animal reads at a glance | S0.1's sheet gate; each CP1 step's review; the CP1 sheet |
| 5. a sheet per CP; closing 60 s run 0 late, 1.00× | the lead close-out per CP; CP4 |
| 6. new blocks in the 2b library with stills | every def carries category/tags (tiles bake the stills); a zero TF state starts assembled (S0.2); CP4 |

## Risks / lead rulings likely
1. **Silhouette quality** (S0.1, CP1): the paths are authored by a coder in a screenshot loop. Mitigations: mirrored front views, stroke-built dragon and snake, outline-weighted density. Ruling per animal: accept, one more round, or the reserve swap (P9).
2. **"Five distinct scenes" from one native** (P3): if the CP1 sheet reads as one scene in four colours, the lever is a per-regime VS branch (e.g. velocity-stretched sprites for Chase). Ruling at the CP1 demo.
3. **N gate** (S0.2): 131072 big sprites + bloom may miss 4.5 ms → 65536; no ruling unless 65536 misses too.
4. **Zodiac's pair count** (S1.4): worst case unstarred → 9 starred. Ready swap: a `POPs/pointRender` relief (scatter + `depth` / `yaw`, a ~15-line diff).
5. **Laser chops vs WCAG** (P7): the chase is flat by construction and may read tame; the ruling is how deep `hit` may go (0→.6 here), flashGate caps the rate either way. `phase←bar saw` is scaled by the grid confidence: on a weak grid the chase walks off the 16ths.
6. **No techno fixture** (spec §4.2): four techno scenes are tuned on the dnb fixture; the ear/eye check on a real techno track is the user's.
7. **Bindings are planner assumptions** (no design pass): confirm at each CP demo.
8. **Free-pick taste** (P8): an hg_sdf hall or a spectrum terrain can replace a pick on request; the hall would be gated like julia (res .5, 40 steps, L-class escape).
9. **Port 5175** is held today by the camera Tier-1 coder (STATE HEAD L12): wave-3 steps start after it merges.
