# plan_td_wave2 — Stage 2e: TD look, wave 2, Variant A

## TL;DR
- 5 CPs in the lead-locked order (CP0 engine → CP1 top-10 own → CP2 natives → CP3 donors + quick wins → CP4 lead close), **13 one-coder steps** (S0.1–S3.5), **13 new starred built-ins** (15 minus the two S1.2 fractal scenes, dropped at the gate — lead ruling 2026-11-07), ~27 files, **zero new npm deps**.
- Variant A per lead pick 2026-11-06 (STATE HEAD L23): plexus = CPU grid-hash native (S2.3); one donor `Color Replacement` copy serves q5+q6 (full input list verified at S3.1, q5 falls back to own `change-color.fs` only if the donor lacks a hue-offset input); melt = donor Dilate+Erode (erode catalog-only, drop-flip NOT bindable — recorded); Emboss/Sharpen own ISF (donor copies rejected: `varying`, won't compile under `ISF_VS`); quick wins grouped solar-emboss / poster / halo.
- Julia (the only L item) gated at S1.2: start at doc values (Iter 48, layer res .5); if billed p95 > 5 ms → Iter 32 + res .25 as doc values; no engine change.
- Execution order (STATE queue): wave-2 coders run **after the 2b close-out + camera CP0** (S0.1–S0.5, S1.5 first, wave 2 fills the R0 wait). The plan itself is queue-independent — step deps below are within this file only.
- Per scene: GPU A/B with `own/flash` appended (billed tail) ≤ 5 ms p95 at 1728×1117, plus one browser check on `scratchpad/fx_audio/dnb174-arr.wav` + `dubstep140-arr.wav` with source↔param r. The per-scene GPU timer under-bills the last pass → each CP's truth check is the 60 s late-frame run (`scratchpad/ed/*-late.mjs` harness pattern) over the CP's new built-ins.

## Freshness
2026-11-06, planner. Inputs: `design_td_wave2.md` L3–43, L44–76, L77–108, L109–135, L148–166, L167–195, L206–224; `spec_td_wave2.md` §1–§5 (whole, L1–52); `STATE.md` HEAD L5–53; `plan_td_look.md` L28–63 (conventions + CP shape, mirrored). File existence verified by Glob today: `web/src/{doc.ts, doc.test.ts, gl/live.ts, gl/engine.ts, audio/input.ts, ui/Panel.tsx, scenes/points.ts, scenes/builtin.ts, fx/isf.test.ts, fx/catalog.ts}`, `web/THIRD_PARTY.md`, `scratchpad/ed/` harnesses.
⚠️ All p95 numbers are pre-measurement estimates (design § Research gaps); measured anchors are wave-1's: spectrum+2fx 3.7 ms, scatter 2.65 ms, mosaic 4.56 ms.

## Chosen variant
`design_td_wave2.md` § Variant A (L109–134). Lead pick 2026-11-06 (STATE HEAD L23), all six designer defaults locked by the lead: #1 Variant A; #2 plexus = CPU grid-hash native in CP2; #3 q5+q6 one donor `Color Replacement` copy (verified at S3.1, fallback own/change-color); #4 melt donor Dilate+Erode, flip not bindable, erode catalog-only; #5 the 15 built-ins, quick wins grouped solar-emboss / poster / halo; #6 CP order CP0→CP4.
Fallback (design L207, lead-locked): if S2.3 fails its cost check → drop S2.3 and continue in Variant C's shape — 14 built-ins, no `native/plexus`, spec §4 acceptance unaffected. Variant C (design L148–166) is the fallback shape only; nothing else in it is planned.

## Conventions (every step; a step's text states only what differs)
- **Brief opener, verbatim, line 1 of every dispatch:** "Invoke the `ponytail` skill (full) before writing code." Then: ~45 min (S1.2 ≈ 60–75 min), own worktree with `web/node_modules` symlinked, dev port **5174** (lead is 5173), reads by symbol (files move between steps), ≤ 3 new files, one targeted browser check. The lead merges into `master`, runs the gates, commits (CLAUDE.md #11).
- **Gates:** `cd web && npm run lint && npm run typecheck && npm test`.
- **A/B bench:** the step's scene(s) with `own/flash` appended (billed tail), 1728×1117, scale 1 → GPU p95 ≤ 5 ms. Per-CP truth: 60 s late-frame run over the CP's new built-ins on both arr fixtures → 0 late, 1.00×.
- **Browser check:** `npm run dev` (5174), file source `dnb174-arr.wav` then `dubstep140-arr.wav`; Auto-style on; every bound param visibly moves on its source, **r reported** per step. ⚡ scenes: `__flash` ≤ 3 stamps/s. Screenshots → `scratchpad/ed/<scene>.png` (main checkout, copied out of the worktree by the lead).
- **Headers:** every new own `.fs`/native: `Look: TD <component> (studied, rewritten)` + credits only for blocks actually used; donor copies keep the VIDVOX MIT header untouched; `web/THIRD_PARTY.md` row per donor file and one Wombat row (S1.3). q12 twirl: skipped (spec default; `own/light-tunnel.fs` already has a `twirl` input).
- **Bindings** read `source attack/release min→max` (wave-1 shape; defaults in the file's `VJW_BIND` or the native def's `bind` so the panel's add-fx brings them along; Auto-style stated in the scene comment). Policy: drums/sub/build/drop bind directly; bass class binds `reese` (Auto: DnB/Techno → reese, Dubstep → wobble, rest at 0); `hats` = sparkle/detail only; brightness on a hit only via `VJW_FLASH` (flashGate ≤ 3/s).
- **Shared tests:** extend the `NEW_OWN` `test.each` pattern in `web/src/fx/isf.test.ts` (file parses in our ES 1.00 subset; every `VJW_BIND` source ∈ `SOURCE_IDS`; every `flash` name is a declared input whose binding min is 0). Doc surface → `web/src/doc.test.ts`. Native steps → one small unit test on the pure seam.
- **Lead close-out per CP:** contact sheet `scratchpad/ed/cpN-sheet.png` (CP4: `wave2-sheet.png`) + reaction check on both fixtures + the 60 s late run.

## Checkpoints

### CP0 — engine: 3 blend modes + stereo wave texture (S0.1–S0.2)
**Frozen contract** (later steps and the 2b editor rely on these surfaces):
```ts
// web/src/doc.ts — the whole blend change: widen the type and the oneOf parse list; saved docs unaffected (list only widens, no version bump)
export type Blend = 'normal' | 'add' | 'screen' | 'multiply' | 'max' | 'difference' | 'dodge'
// web/src/gl/live.ts — BLENDS gains the three:
//   max:        shader branch vec4(c.rgb*op, 1) + blendFunc(ONE, ONE) + blendEquation(gl.MAX) → max(op·src, acc); equation reset to FUNC_ADD after the composite
//   difference: copy acc → module scratch target (shot size, RGBA8) + two-sampler compositeDst(uAcc, uSrc, op) = |acc − op·src|
//   dodge:      same copy, compositeDst = acc / max(1e-3, 1 − op·src)
//   2 extra passes only for layers that actually use difference/dodge; the four legacy blends take unchanged paths
// web/src/gl/engine.ts — new audio texture + extended upload:
audioTex.waveLR: WebGLTexture // 512×2 R8: row 0 = L, row 1 = R
setAudio(magDb, wave, waveL: Float32Array /*512*/, waveR: Float32Array /*512*/)
// web/src/ui/Panel.tsx — blend dropdown += 'max' | 'difference' | 'dodge'
```
**Demo (user runs `npm run dev` on the lead checkout, 5173):** every wave-1 scene looks exactly as before (legacy blends bit-identical). In the 2b editor, a second layer set to `max` shows the lighter of the two images, `difference` inverts where they overlap, `dodge` bleaches src over acc. `?debug` L/R meters still track a stereo file.

### CP1 — top-10 own ISF: 7 files + 6 built-ins (S1.1–S1.3)
**Frozen contract:** no engine surface. What later steps rely on: the 7 own fx in `web/src/fx/own/` — `superformula` (generator), `polar`, `gradient`, `julia`, `phaser`, `diff-feedback` (filters), `stars` (generator) — each with its `VJW_BIND` defaults from the table below; `own/julia.fs` carries `mode` long VALUES [0,1] (0 julia trap / 1 mandelbrot) and `Iter` int uniform (doc 32, the S1.2 gate's frozen value — the gate failed at both locked points, so the fractal built-ins were dropped and the fx is a **catalog L-class** effect: ~18.5 ms billed p95 at res .25, lead ruling 2026-11-07); `VJW_FLASH` entries `diff-feedback: ["glow"]` (here) and `checker: ["divisions"]` (S3.4) run through flashGate ≤ 3/s. Built-ins so far: superformula, tiny-planet, grad-map, phaser, diff-feedback, stars.
**Demo:** press through the 6 starred built-ins on `dnb174-arr.wav`: the superformula outline steps `m` on snares and morphs on reese; tiny-planet's wrap offset pumps on kicks; the gradient ramp shifts on snares; the phaser wipes across the build and steps its map on the drop; diff-feedback's glow flashes ≤ 3/s and never blows out luma; stars pop on hats. (`own/julia`'s looks — the centre crawling on kicks, hue stepping on snares, the reseed on the drop — were verified in S1.2's browser run before the drop; it stays reachable in the 2b library as an L-class effect.)

### CP2 — natives: scope + pointillize + plexus (S2.1–S2.3)
**Frozen contract:**
```ts
// web/src/scenes/points.ts — native/scatter gains (defaults keep today's look bit-for-bit):
{ name: 'dots',    type: 'float', min: 0, max: 1, default: 0 } // 1: round additive sprites
{ name: 'sizeVar', type: 'float', min: 0, max: 1, default: 0 } // random size spread
// web/src/scenes/scope.ts (new NativeDef) — id 'native/scope', kind generator, category 'geometry', tags ['scope','audio']; inputs: scale, rotSpeed, hue, trail, width
// web/src/scenes/plexus.ts (new NativeDef) — id 'native/plexus', kind generator, category 'geometry', tags ['plexus','lines']; inputs: dist, drift, size, hue; N = 400 knob (×.1 for tiles)
// both registered in web/src/fx/catalog.ts; built-ins: xy-scope, pointillize, plexus (plexus absent iff S2.3's fallback fires)
```
**Demo:** `builtin:xy-scope` draws the L→x / R→y Lissajous figure: it rotates on the reese, breathes with the sub, hue-walks on snares, trail stretches through a build. `builtin:pointillize`: the spectrum becomes round additive dots that burst on kicks and scatter on the reese (the wave-1 square scatter scene is unchanged). `builtin:plexus`: drifting nodes connect with lines within `dist`, which widens on the sub.

### CP3 — donor copies + quick wins: 5 donors, 8 own, 4 built-ins (S3.1–S3.5)
**Frozen contract:** the 5 donor copies in `web/src/fx/isf/` — `Solarize.fs`, `Color Monochrome.fs`, `Color Replacement.fs`, `Dilate.fs`, `Erode.fs` — each with its VIDVOX MIT header untouched and a `web/THIRD_PARTY.md` row; **the S3.1 verification outcome for `Color Replacement` (donor covers hue offset → q5+q6 both use it; otherwise q5 = own `change-color.fs`) is frozen for S3.5's halo and the q5/q6 bindings**; the 8 own quick-win fx: `rgb-contrast`, `color-threshold`, `dent`, `emboss`, `sharpen`, `checker`, `hsv-blur`, `rgba-blur`; built-ins `melt` (Dilate only, radius 6 doc value; erode catalog-only, flip not bindable — recorded in the scene comment), `poster`, `solar-emboss`, `halo`. At CP3 close all **13/13** built-ins exist (15 minus the two S1.2 fractal scenes, dropped at the gate) and every new def carries category/tags (tiles bake the 2b library stills for free).
**Demo:** `builtin:poster` hard-edges the spectrum on the sub and inverts red on snares; `builtin:solar-emboss` inverts above a build-driven threshold and relights with an lfo-swept light angle; `builtin:halo` blooms a ¼-res rgba blur and retints it on the reese; `builtin:melt` widens bright strokes with the sub (dilate; the drop flip to erode is a 2b editor swap, not a binding); solarize/monochrome/checker/dent/sharpen/hsv-blur are reachable in the 2b library, filterable by tag.

### CP4 — close (lead, no coder)
**Frozen contract:** none (terminal).
**Demo / verification:** 60 s autopilot over all 13 new built-ins on both arr fixtures → 0 late, 1.00×; reaction r reported for every bound param of every built-in; final billed-tail p95 sheet (all 13, ≤ 5 ms); contact sheet `scratchpad/ed/wave2-sheet.png` reviewed against the research's TD descriptions; `__flash` ≤ 3/s and the WCAG luma cap hold on the ⚡ scenes (diff-feedback.glow, checker.divisions); solarize bounded by construction; `web/THIRD_PARTY.md` rows complete (5 donors + Wombat); the 2b library shows every new block with stills, filterable by category/tags.

## Steps
Every step's brief opens, verbatim: "Invoke the `ponytail` skill (full) before writing code." + the conventions above. Size S/M/L in the heading.

### CP0 — engine

#### S0.1 [x] blends: `max` / `difference` / `dodge`
- **Goal:** three new layer blend modes, zero legacy regression (the CP0 gate: existing scenes render bit-identical).
- **Files (edit, 0 new):** `web/src/doc.ts`, `web/src/gl/live.ts`, `web/src/ui/Panel.tsx`, `web/src/doc.test.ts`.
- **Depends on:** — (queue: after 2b close-out + camera CP0).
- **Behaviour:** widen `Blend` + the `oneOf` parse list (fact: list only ever widens → no doc version bump). `BLENDS` record: the four legacy entries unchanged; `max` = pre-scale the layer src in the existing composite shader branch (`vec4(c.rgb*op, 1)`), `blendFunc(ONE, ONE)` + `blendEquation(gl.MAX)`, equation reset to `FUNC_ADD` after the pass; `difference`/`dodge` = copy acc to one module-level scratch target (shot size, RGBA8), then a two-sampler composite pass (`|acc − op·src|` / `acc / max(1e-3, 1 − op·src)`); the extra passes cost only when a layer actually uses them. `Panel.tsx` blend array += the three. **One-frame visual check of `max`** (design ⚠️ L224: confirm the WebGL2 factors apply before the equation — check, don't guess).
- **Tests:** `doc.test.ts` — all 7 blends parse + round-trip; the legacy 4 produce byte-identical doc strings (backward compatibility).
- **Done:** gates green; a 2-layer doc (spectrum + echo) shows lighter / inverted-overlap / bleached under max / difference / dodge respectively; wave-1 built-ins render unchanged (lead diffs against wave-1 stills); screenshots `scratchpad/ed/blend-{max,difference,dodge}.png`. No billed A/B (no new scene).

  **Changed during implementation:** (1) GLSL ES 3.00 (ANGLE) has no scalar/vec3 `max` overload — the dodge branch uses `max(vec3(1e-3), 1 − op·src)`; formula otherwise as contracted. (2) The one-frame `max` check PASSED: known 2-constant-layer doc, pixel (64,102,153) = `max(op·src, acc)` — factors apply before the equation (design L224 confirmed). (3) The `BLENDS` fixed-function record holds the legacy 4 + `max` only; `difference`/`dodge` are type-excluded from it (they take no blendFunc — scratch copy + two-sampler pass), matching the contract's behaviour split. (4) Legacy pixel-diff vehicle: `builtin:spectrum` (stateless, direct path, no TIME) instead of the suggested `builtin:td-feedback` — td-feedback's trail/heat depends on per-run sync confidence (one run's post gain was ~4× the other's); the tdfb pair is kept supplementary (`blend-legacy-tdfb-*.png`). Spectrum pair diff (1280×800, debug bar excluded): mean 0.08/255, residual 2.7 % — only bar-edge jitter from the ±1 FFT-quantum (2.7 ms) freeze offset.

#### S0.2 [x] stereo wave texture `waveLR`
- **Goal:** always-on L/R analysers feeding `audioTex.waveLR` (512×2 R8) for the CP2 scope.
- **Files (edit, 0 new):** `web/src/audio/input.ts`, `web/src/app.ts`, `web/src/gl/engine.ts`.
- **Depends on:** S0.1 (same CP; no code dependency).
- **Behaviour:** `input.ts`: hub → `splitter(2)` → analyserL/R (fftSize 1024, smoothing 0), always on, exported; the `?debug` meters reuse them — their own fftSize-256 analysers are deleted (⚠️ design assumption L223: meters = rms over 512 samples at 10 Hz, no user-visible change — verify on a stereo file). `app.ts` `frame()`: two `getFloatTimeDomainData(512)` calls; `setAudio(magDb, wave, waveL, waveR)`. `engine.ts`: `audioTex.waveLR` 512×2 R8 (row 0 L, row 1 R), uploaded into an own `Uint8Array` (no per-frame allocation).
- **Tests:** one small unit test if the float→R8 row packing is extracted as a pure helper (±1 → 255/0, 0 → 128, L row then R row); if it stays inline, the `?debug` meter check covers it (ponytail: extract only to test).
- **Done:** gates green; `?debug` L/R meters track `dnb174-arr.wav` stereo content, L≈R on a mono file; screenshot `scratchpad/ed/waveLR-meters.png`. No billed A/B (no new scene).

  **Changed during implementation:** (1) The brief's "stereo" fixture is mono — all four `scratchpad/fx_audio/*.wav` are 1-ch 48 kHz PCM16 — so the L≠R check used a synthetic stereo build of `dnb174-arr.wav` (L dry, R ×0.25 ≈ −12 dB; `scratchpad/ed/make-stereo.mjs` + `waveLR.mjs`); the mono check used the original file. (2) Design assumption L223 verified on old AND new code (pre-S0.2 tree re-run): both the deleted fftSize-256 meters and the reused shared analysers show the exact 12.0 dB L/R gap at every loud moment of the stereo build (old 229 / new 231 samples, med/min/max gap all 12.0) — no user-visible change; meters before→after: stereo gap 12.0→12.0 dB, mono L−R med 40.9→40.2 dB. (3) "L≈R on a mono file" does NOT hold in Chrome: `<audio>` → MediaElementAudioSourceNode presents mono content as 2ch [x, 0] (isolated in a fresh context, our graph bypassed), so the meters show L loud / R at the −60 floor both before and after S0.2 — pre-existing platform behaviour, not a regression (a true mono L≈R needs a mono device stream, out of this step). (4) The float→R8 packing stays inline in `setAudio` (the plan's ponytail rule: extract only to test; `engine.ts` is not importable in node tests) — the meters verify the analyser→data path end-to-end and the packing is the legacy `wave`-row formula verbatim; the texture row order (0 = L, 1 = R) is first consumed visually by S2.1's scope.

### CP1 — top-10 own ISF

#### S1.1 [x] [M] superformula + polar + gradient → 3 built-ins
- **Goal:** the three S-cost top-10 own ISF (1 generator, 2 filters) + their built-ins.
- **Files (3 new):** `web/src/fx/own/superformula.fs`, `polar.fs`, `gradient.fs`; (edit) `web/src/scenes/builtin.ts`, `web/src/fx/isf.test.ts`.
- **Depends on:** CP0.
- **Behaviour:** `superformula` = generator (no inputImage; m floored in shader); `polar` = filter, the "tiny planet" wrap; `gradient` = filter, 3-stop procedural ramp + bias in the style of `own/bloom`'s ramp (reuse that shape). Bindings (design table #2/#3/#5): superformula — `m ← snare 0/.3 10→14`, `n1 ← reese .05/.3 1→3`, `scale ← kick 0/.15 .7→1`, `glow ← sub .02/.4`, `preset ← drop (event)`; **Auto: reese**. polar — `rotation ← lfo (saw 0→1)`, `offset ← kick 0/.1 0→.12`, `twist ← reese 0/.3 0→1.5`; **Auto: reese**. gradient — `rampShift ← snare 0/.3`, `bias ← sub .05/.3`, `dryWet ← build 1/1–2`.
- **Built-ins (ride-along):** `builtin:superformula` (gen `own/superformula`, no fx), `builtin:tiny-planet` (spectrum + `polar`), `builtin:grad-map` (spectrum + `gradient`).
- **Tests:** 3 `isf.test.ts` NEW_OWN entries.
- **Done:** gates green; billed A/B ≤ 5 ms (est 2–3 / 2.5–3.5 / 2–3); browser both fixtures: outline steps on snare + morphs on reese, wrap pumps on kick, ramp shifts on snare — r reported; screenshots `superformula.png`, `tiny-planet.png`, `grad-map.png`.

  **Changed during implementation:** (1) `preset ← drop (event)`: the generator is stateless (one pass, no engine surface — the CP1 contract), so it cannot hold an event between frames; `preset` is a long (VALUES 0–3 = (n2, n3) pairs: 0 = the doc values through the n2/n3 inputs, 1 = 1/3, 2 = 3/1, 3 = .25/.25) bound to drop attack 0 / release 1.5 / 0→3 (the wave-1 drop precedent) — each drop sweeps the presets 3→2→1 and decays back to the doc shape. (2) `rotation ← lfo (saw 0→1)` at rate 0.05 (one turn per 20 s; the plan names no rate — the kaleido-maze precedent); rotation is in turns, so the saw's wrap is a full turn and never jumps. (3) polar's v = 2r: the disc rim (r .5, the inscribed circle) samples the input's bottom row, the research §2 equirect→fisheye (fov 360) full-height mapping; the image's seam is parked under the planet (+0.25 turn). (4) gradient's 3 stops are fixed #defines (indigo → cyan → warm white), cosine-eased blend in the style of own/bloom's procedural ramp; no colour inputs (the plan names none). (5) Harness (worktree scratchpad, not product code): the lfo-bound reference is traced from `__src.lfo` (the app's audio clock), not the media's `currentTime` — the load delay offsets them by a scene-constant 6–180 s, so a media-time reference put the saw a half-phase off (spurious r −0.44; correct r 1.0); grad-map's shot parks on the build peak (dryWet ← build, so arr[0]+0.5 would be dry).

#### S1.2 [x] [L] julia (trap + mandelbrot) → 2 built-ins + the cost gate
- **Goal:** the only L item, measured and gated before anything bakes on it.
- **Files (1 new):** `web/src/fx/own/julia.fs`; (edit) `builtin.ts`, `isf.test.ts`.
- **Depends on:** S1.1.
- **Behaviour:** stateless filter; ES 1.00 constant loop `for (i < 64) { if (i >= Iter) break; … }` (fact 5); the orbit trap = one `inputImage` sample per iteration, only while the orbit is inside the domain (most pixels escape in ≪ 48 iters); `mode` long VALUES [0,1] — 0 julia trap, 1 mandelbrot (z₀ = c, trap skipped) — the generator mode is a scene value, not a second shader; `Iter` int uniform (panel `VALUES` for the dropdown); `Scale` MIN 0.02 (fp32: the kick-bound zoom stays 1→1.25, never a deep-zoom animation). Bindings (table #1): `C.x ← lfo (sine 0→1)`, `C.y ← lfo offset`, `|C| ← reese .05/.3 0→.8`, `scale ← kick 0/.2 1→1.25`, `rampHue ← snare 0/.3`, `reseed ← drop (event)`; **Auto: reese→wobble (Dubstep)**.
- **Built-ins (ride-along):** `builtin:fractal` (spectrum at layer `res` .5 + `julia` mode 0), `builtin:mandelbrot` (same, `{mode:1}`).
- **The gate (lead-locked):** start at doc values Iter 48, res .5; measure billed p95 at 1728×1117; **if > 5 ms → Iter 32 + res .25 as the file defaults and the built-ins' doc values, re-measure; no engine change.** Record the outcome in the step report — it freezes the CP1 contract values.
- **Tests:** 1 `isf.test.ts` entry (the trap math lives in GLSL; no TS seam).
- **Done:** gates green; A/B per the gate; browser both fixtures: centre crawls on kick, hue on snare, reseed on drop — r reported; fp32 banding contact-sheet check at `Scale` 0.02 (design ⚠️ L222); screenshots `fractal.png`, `mandelbrot.png`.

  **Changed during implementation:**
  1. **Gate outcome (freezes the CP1 contract values):** start point (Iter 48 / res .5) billed **20.4 ms** p95 (julia+flash; mandelbrot+flash 13.1 ms) at 1728×1118, A/B on the drop — over 5 ms → the locked fallback froze the file default at **Iter 32** and the built-ins' doc values at **res .25**. Re-measured at the fallback: **julia+flash med 8.6 / p95 18.5 ms (dnb), p95 18.9 (dub); mandelbrot+flash med 5.7 / p95 6.2 ms (dnb), 6.2 (dub)**; full-trace (45–56 s) gpuTrace p95 18.0/19.9 (julia), 6.1/6.0 (mandelbrot). **Both scenes still miss the 5 ms CP1 acceptance in the A/B drop window; the locked gate has no third point — lead decision needed** (accept as the L-item price, a new lever, or drop the scenes). **RULING (lead, 2026-11-07): gate failed at both locked points — 20.4 ms @ 48/.5, 18.5 ms julia / 6.2 ms mandelbrot @ 32/.25; the fractal built-ins are dropped (`builtin:julia`/`builtin:mandelbrot` removed from builtin.ts), `own/julia` stays in the catalog as an L-class effect (its doc Iter 32 and the res .25 usage stand, noted in the file header); built-ins 15→13, CP1 8→6.** Estimate-miss root cause: the design's "3–5 @ res .5" assumed "most pixels escape in ≪ 48 iters", but p = −2 orbits are bounded (no escape) — at low-coverage C (the reseed jumps, the reese swell) most pixels run the full count, and the cost is the serial dependency chain, not just the fragment count.
  2. **ID collision:** the plan's `builtin:fractal` is the wave-1 Menger scene's id (2d S4.2b, starred, in the 2b library) — the new built-in takes **`builtin:julia`** (matching the fx); `builtin:mandelbrot` unchanged. The shots keep the plan's names (`fractal.png` = the julia scene).
  3. **Bindings:** the design line "C.x ← lfo / C.y ← lfo offset / |C| ← reese" is realized as one angle + one radius (the research's own summary: "C angle ← lfo, |C| ← reese") — `cAngle ← lfo sine 0.05 0→1`, `cMag ← reese .05/.3 0→0.8`; C = (cx, cy) + cMag·(cos 2πcAngle, sin 2πcAngle) + reseed hash (cx/cy doc −0.15/0.6, the TD defaults). The binding model has no per-input lfo phase, so a second lfo is not representable. `reseed` is a long VALUES [0,1,2,3] bound to drop (attack 0 / release 1.5 / 0→3, the S1.1 preset precedent): each drop steps 3→2→1→0 and C jumps to a hashed ±0.8 offset (stateless).
  4. **Cost internals (own shader, no engine change):** p = ±2 take the exact algebraic fast paths (z², 1/z² = conj(z²)/|z|⁴ — complex, not componentwise); a mode-1-only settle early-out (an orbit within 1e-3 of a fixed/2-cycle cannot escape or change its ramp — the settled ramp is the full-count colour either way) cut mandelbrot 9.1 → 6.2 ms; in mode 0 it measured net-negative (bounded p = −2 orbits converge too slowly in ≤ 32 iters) though node-verified safe (0 stamp mismatches, 16 C configs × 25.6k px), so it stays mode-1-only; a mode-0 `|C| > 2` no-stamp skip (the orbit stays in the C+unit disc, which misses the footprint — exact; helps panel use at large C, never fires in the bound scenes).
  5. **A/B vehicle confound:** the harness's consecutive 4 s windows measure different musical moments, and julia's cost is state-dependent (footprint coverage 2–100% → 3–20 ms), so the +flash delta varies round to round (r0 +flash med 12.7 vs plain 3.1 is a different moment, not the flash's cost) — both the locked A/B numbers and the full-trace p95 are reported above.
  6. **Banding (design ⚠️ L222):** no fp32 banding in the Scale 0.02 still (the orbit collapse is smooth at fp32); the view degenerates instead — 100% of the frame stamps the same narrow input band (the C+unit disc ∩ footprint, x 0–0.32 / y 0.45–0.89) → a near-uniform dark field with a central speck (`fractal-scale02.png`). Zoom-out is useless below ~0.5; MIN 0.02 stays as the panel floor, the kick's zoom at 1→1.25.
  7. **Reactions (all bound params, both scenes, both fixtures, r):** cAngle 1.0, cMag 0.92–0.97, scale 0.89, rampHue 0.83–0.85, reseed 0.90–0.91 (the reseed drop-span mean 0.42–0.54 vs 0.11–0.14 whole: the re-roll reads); Auto-style reese→wobble holds on the dub fixture (cMag r 0.92).

#### S1.3 [x] [M] phaser + diff-feedback + stars → 3 built-ins (Wombat credit step)
- **Goal:** the last three CP1 looks, incl. the flash-gated diff-feedback and the Wombat-based stars generator.
- **Files (3 new):** `web/src/fx/own/phaser.fs`, `diff-feedback.fs`, `stars.fs`; (edit) `builtin.ts`, `isf.test.ts`, `web/THIRD_PARTY.md`.
- **Depends on:** S1.2.
- **Behaviour:** `phaser` (filter): B = a treated in-shader copy (no A/B layers — research §5's open point, dissolved); `treat` long VALUES 0 invert / 1 hue+180 / 2 zoom; `t ← build 1/1–2 0→1`, `map ← drop 0/.1 0→2` (long, stepped by live.ts L288), `e` static .3. `diff-feedback` (filter): one PERSISTENT FLOAT pass `abs(src − k·prev)`, zoom/hue in shader; `k ← build 1/1–2 .85→.97`, `zoom ← kick 0/.1`, `hue ← snare 0/.3`, `glow ← kick 0/.2 0→.5`; **`VJW_FLASH ["glow"]`** — the WCAG luma cap matters here (acceptance 2). `stars` (generator): Wombat `Stars2D` (L1325) + `PolkaDot2D` (L1253) + only their hash helpers, read from the in-repo file `donor/td-reverse/touchdesigner/extracted/dat_texts/Samples/Palette/Generators/noise/noise/noise/glsl2_pixel1.txt` — **read the helper dependencies in that file before copying** (design ⚠️ L221); `mode` long VALUES 0 stars / 1 polka; `prob ← hats 0/.1`, `radius ← kick 0/.1`, `scroll ← reese 0/.3`, `mode ← drop (event)`; **Auto: reese**. **Lead-locked credit:** the file header carries the "Brian Sharpe Wombat — Use the code however you wish (credit)" line and `web/THIRD_PARTY.md` gains the Wombat row.
- **Built-ins (ride-along):** `builtin:phaser` (spectrum + `phaser` `{treat:1}`), `builtin:diff-feedback` (spectrum + `diff-feedback`, ⚡ glow ≤ 3/s), `builtin:stars` (gen `stars` mode 0).
- **Tests:** 3 `isf.test.ts` entries + one assertion that `stars.fs`'s header contains the Wombat credit.
- **Done:** gates green; billed A/B ≤ 5 ms (est 2.5–3.5 / 2.5–3.5 / 2–3); browser both fixtures: diff-feedback glow ≤ 3 stamps/s with luma holding, phaser wipe on build + map step on drop, stars pop on hats — r reported; screenshots `phaser.png`, `diff-feedback.png`, `stars.png`.

  **Changed during implementation:**
  1. **ES 1.00 int/float:** phaser's `BARS`/`GRID` and stars' `SCALE` `#define`s had to be float literals (12.0/24.0) — the first compile failed ("wrong operand types") on every mixed op; the Wombat functions were already float-clean.
  2. **The plan's "1/1–2" build releases resolved to attack 1 / release 2** (bars' smoothing precedent), for phaser's `t` and diff-feedback's `k`.
  3. **Wombat credit (lead-locked):** a detector was added to `web/scripts/shaders.mjs` (the S4.4 VIDVOX-detector precedent) so the row survives table regeneration, and the script was rerun — the own table is now 33 rows (26→33 also un-stales the S1.1/S1.2 rows for superformula/polar/gradient/julia); the `own/stars.fs` row carries "Stars2D and PolkaDot2D from Brian Sharpe's Wombat" (permissive: "use the code however you wish, credit"; no licence file in the in-repo TD extract; personal use), plus a Wombat bullet under "Inlined libraries" (the two noise functions + only the helpers they call — `FAST32_hash_2D_Cell`, `Falloff_Xsq_C1/C2` — read from the in-repo extract before copying, design ⚠️ L221).
  4. **Build-driven screenshots can't be seek-parked:** `build` is an online tracker (arrange.ts) that ramps only while it observes the breakdown live — a seek parks it asleep (build = 0; verified: a probe pass kept `t` = 0 across the whole [23.1, 34.1] window after a seek, while the onset-based drop survived). So `phaser.png` (mid-wipe) and `stars-drop.png` (the polka) are taken on a second full pass from the intro: phaser parks at the live `t ≥ 0.55` crossing, the polka 0.3 s after the mode onset (the mode==1 window is only ~1.04 s — the 0.5 crossing of the 1.5 s release — so a 1.5 s settle overshoots it). The drop event also fires ~0.9 s off the -arr point (dnb 34.1 → ~35.0), so all parks are traced from the uniforms, not the arr estimates.
  5. **diff-feedback luma (acceptance 2):** a 20-shot burst over the drop, decoded in the page at ¼ scale (the screenshot is the composited frame, heat pass included): peak luma 0.878 (dnb) / 0.899 (dub), frame mean at the peak 0.368/0.397 — no blow-out; glow flash 1.05/s (max 2 in 1 s, dnb) and 0.43/s (max 1, dub) — the flashGate's 3/s cap holds. The field is bounded by construction (`|src − k·prev| ≤ 1` inductively, k ≤ 1).
  6. **Measured (billed, `+flash`, 1728×1118):** phaser 2.53/2.52, diff-feedback 4.86/4.88, stars 0.71/0.71 ms p95 (dnb/dub). r per bound param, dnb/dub: phaser t 0.90/0.93, map 0.94/0.94; diff k 0.90/0.93, zoom 0.96/0.96, hue 0.84/0.83, glow 0.89/0.89; stars prob 0.88/0.87, radius 0.96/0.96, scroll 0.95/0.92 (Auto reese→wobble holds on dub, the S1.2 pattern), mode 0.87/0.88.

### CP2 — natives

#### S2.1 [x] [M] `native/scope` (XY/Lissajous) → `builtin:xy-scope`
- **Goal:** stereo scope as a native LINE_STRIP over `waveLR` (design answer 4: an ISF pass would SDF-test 512 segments per pixel — too slow).
- **Files (1 new):** `web/src/scenes/scope.ts`; (edit) `web/src/fx/catalog.ts`, `web/src/scenes/builtin.ts`.
- **Depends on:** S0.2 (waveLR).
- **Behaviour:** NativeDef id `native/scope`, generator, category `geometry`, tags `['scope','audio']`; inputs `scale, rotSpeed, hue, trail, width` (`width` static, unbound); 512-vertex LINE_STRIP; VS `x = texelFetch(waveLR, ivec2(id, 0), 0).r·2−1`, `y = texelFetch(waveLR, ivec2(id, 1), 0).r·2−1`; persistent trail target + `blendFunc(ZERO, SRC_ALPHA)` fade (the swarm trick, points.ts L213–229) + rotated sample pass + `COMPOSITE_FS` tone map. Bindings (table #6): `scale ← sub .02/.4`, `rotSpeed ← reese 0/.3`, `hue ← snare 0/.3`, `trail ← build 1/1–2`; **Auto: reese**.
- **Built-in (ride-along):** `builtin:xy-scope` (gen `native/scope`; stereo L→x, R→y).
- **Tests:** one small unit test on the pure seam (trail-decay from `trail` / tile-shrink scaling — whichever is extracted; GL itself is covered by the browser check).
- **Done:** gates green; billed A/B ≤ 5 ms (est 1.5–2.5); browser both fixtures: figure rotates on reese, breathes on sub, hue on snare, trail stretches on build — r reported; screenshot `xy-scope.png`.

  **Changed during implementation:**
  1. **Billed A/B (1728×1118, +own/flash, drop, 3×4 s, low 0):** xy-scope med 1.94 / p95 1.96 ms; xy-scope+flash med 2.10 / **p95 2.11 ms** — under the 5 ms budget, inside the 1.5–2.5 est.
  2. **Reaction r (mono `dnb174-arr.wav`, one live pass, native-draw wrap as S1.3):** scale↔sub **1.00**, rotSpeed↔reese **0.95**, hue↔snare **0.84**, trail↔build **0.90**. Figure shots on the stereo build `dnb174-arr-stereo.wav` (R ×.25; a mono file degenerates to a horizontal line, S0.2 finding).
  3. **`width` = the glow (bloom strength), static:** WebGL `lineWidth` is 1 px on every GPU here, so a 512-seg LINE_STRIP can't thicken via line width — the "width" input drives `bloom.apply`'s strength (the swarm-trick glow), min 1 / max 8 / def 4, unbound.
  4. **Rotation is applied in the waveLR-sampling line pass** (the "rotated sample pass"): the line VS `texelFetch`es waveLR, scales, and rotates by an accumulated `rot` (`rot += rotSpeed·dt`, rad/s). The trail then spirals behind the figure; `rotSpeed` 1.0 ≈ one turn / 6 s (TD xyScope's 0.16 Hz). The final composite is the reused `COMPOSITE_FS` tone map (no rotation there).
  5. **Hue is baked into the line at draw time** (colour stored in the half-float trail), not tinted in the composite — so the trail keeps a colour history as snare walks the base hue (a small 0.2-turn gradient across the 512 loop). This is why the composite is the plain `COMPOSITE_FS` (tone map only).
  6. **Frame-rate-independent trail decay (the extracted pure seam, unit-tested):** `trailKeep(trail, dt) = trail**(dt·60)` — `trail` is what one 60 Hz frame keeps, so a `dt` s frame keeps `trail^(dt·60)`. (The swarm uses a bare per-frame multiply; this holds the trail length across a governor step / fps change.) No tile-shrink seam: 512 line vertices are cheap at any size, so `create(gl)` takes no `size` (as `spectrum`); the trail and bloom `fit()` to `f` at draw.
  7. **Binding min/max (the plan gives source/a/r; ranges are taste, per the wave-1 precedent):** scale sub .02/.4 **0.65→1.35**, rotSpeed reese 0/.3 **0→1**, hue snare 0/.3 **0.35→0.65**, trail build 1/2 **0.85→0.97** (attack 1 / release 2, the S1.3 "1/1–2" resolution). Auto: reese (rotSpeed; wobble under Dubstep).
  8. **`build`-stretch visual is muted on this fixture:** sub and build are anti-correlated in the DnB arr (sub ~0 through the build's quiet breakdown, returns at the drop), so the stretched-trail moment has a small figure — the r-trace (trail r 0.90, span 0.85→0.933) is the solid evidence; `xy-scope-build-{rest,peak}.png` document the live-pass contrast. The required `xy-scope.png` (post-drop, sub+reese active) shows the glowing rotating figure.

#### S2.2 [x] [S] scatter `dots`/`sizeVar` → `builtin:pointillize`
- **Goal:** pointillize as a mode on `native/scatter` (design answer 6 — not a new native).
- **Files (0 new):** edit `web/src/scenes/points.ts`, `web/src/scenes/builtin.ts`.
- **Depends on:** S2.1 (sequential; no code dependency on scope).
- **Behaviour:** scatter += `dots` (0..1, def 0) + `sizeVar` (0..1, def 0) — **defaults keep today's look bit-for-bit**; VS: `gl_PointSize *= mix(1.0, 0.25 + 0.75*hash(id), dots*sizeVar)` and ÷ `uSize` when dots (gain, as swarm's); `p += (vec2(hash(id+7u), hash(id+13u)) − .5)·uCell·0.8·dots` (stable jitter); FS: `if (uRound > .5 && length(gl_PointCoord − .5) > .5) discard` (uRound passed by both programs); `draw()`: `blendFunc(ONE, ONE)` additive when dots, opaque otherwise (order-independent additive — TD's "random order" skipped, ponytail). Reuses tfPoints/NOISE/HASH/gridFor untouched. Bindings: no new ones — the existing scatter `VJW_BIND` already matches research #7: `size ← sub`, `scatter ← reese`, `burst ← kick`; **Auto: reese**.
- **Built-in (ride-along):** `builtin:pointillize` (spectrum + `native/scatter` `{dots:1, sizeVar:.7}`).
- **Tests:** regression check that a wave-1 scatter scene (dots 0) renders unchanged (lead diffs the stills); a small unit test only if a pure seam is extracted.
- **Done:** gates green; billed A/B ≤ 5 ms (est 3–4); browser both fixtures: round dots, burst on kick, scatter on reese — r reported; screenshots `pointillize.png`, `scatter-unchanged.png`.

  **Changed during implementation:**
  1. **Jitter is render-only (plan's `p +=` applied to `gl_Position`, not `stateOut`):** the spring aims at `home`, so a jitter baked into the TF state is pulled back out in < 200 ms (ω = 40, ζ = .5) — the "stable jitter" would not stay stable. The drawn position is `p + (hash(id+7u), hash(id+13u)) − .5)·uCell·0.8·dots·uPx`; the physics state is untouched, so dots 0 is bit-for-bit the wave-1 look (every new factor is exact 1.0/0.0 at `uDots` 0: `mix(x, y, 0) = x`, `·1.0`, `+0.0`).
  2. **New uniform `uPx = 2 / f.height` (scene units per px):** the plan's jitter formula is in px but `p` is in scene units (y spans 2 units over the frame height); without the conversion the jitter would be stage-sized.
  3. **`gl.viewport(0, 0, f.width, f.height)` added to the scatter draw (as scope/particles/history):** scatter was the only geometry native relying on the context's default viewport (the canvas buffer). Identical at the stage size (no visual change, scale 1), but it fixes a latent mis-mapping of the points in tiles (`tile()`, 2b) and at governor scale < 1, and makes the `uPx` conversion consistent at any target. (The swarm's TF pass has the same latent gap — left untouched, out of scope.)
  4. **Blend state made explicit:** `dots` → `blendFunc(ONE, ONE)` (order-independent additive, TD's "random order" skipped as planned), else `gl.disable(BLEND)`; blend is disabled again after the draw (as the swarm) so a dots frame never leaks additive state into the next node's target.
  5. **`points.test.ts` bind test updated:** the old `bind keys == input names` equality no longer holds (dots/sizeVar are static, as scope's `width`); the test now checks bound inputs name real sources + the built-in repeats the def bind (swarm, scatter, pointillize), asserts swarm binds everything and scatter's only static pair is `['dots', 'sizeVar']`, and checks pointillize's `values`/gen/star. No pure TS seam extracted (the mode is all GLSL) → no new unit test, per the plan.
  6. **Billed A/B (1728×1118, +own/flash, the drop, 3×4 s, low 0):** scatter (the dots-0 regression) p95 2.40/2.19 ms (dnb/dub; wave-1 anchor 2.65); pointillize+flash p95 3.57/3.64 ms — under the 5 ms budget, inside the 3–4 est. Full-trace (no flash) pointillize gpuTrace p95 3.17/3.24 ms.
  7. **Reactions (bound params, `__styled` reference so Auto shows; dnb/dub, r):** burst↔kick 0.96/0.96, size↔sub 1.00/0.89, scatter↔reese 0.96/0.81 (the dub value tracks the styled reese→wobble remap — Auto holds), spring↔build −0.90/−0.93 (the inverted range, as bound), explode↔drop 0.18/0.18 (a one-frame edge pulse: the span reaches 1.0 at the drop; Pearson over 2700 frames of ~2 nonzero samples is a sparsity artifact, the wave-1 precedent for this bind).
  8. **Regression stills (dots 0, the wave-1 scatter over the tunnel, frozen at the same fixture second by suspending the audio ctx at the crossing — the S0.1 blend.mjs technique; the tunnel's and scatter's `uTime` pinned to the media clock by the harness's create-wrap, since the scenes' own clocks carry an unknown load delay):** the scatter is a 4-px square grid — the highest-frequency content in the app — so the still's residual is set by the frozen FFT's pipeline offset (per-browser-session audio delay), not the code. Measured (1200-px downscales, bottom 100 px debug bar excluded): `scatter-unchanged-before.png` vs `scatter-unchanged-after.png` (matching sessions) **mean 0.003/255, max 3, 0.78 %** — bit-for-bit at the freeze method's noise floor (S0.1: 0.08/2.7 %). Mismatched sessions: 9.2–10.2 mean on the scatter — and the same mismatch shows **19.8–21.4 mean on `builtin:tunnel`, a scene this step does not touch** (`tunnel-ctrl-{before,after}.png`), which is the environmental A/B of the audio freeze; the extra scatter shots (`-after2/3/4`, `-before4/5`) are the evidence, the pair to diff is `scatter-unchanged-{before,after}.png`.

#### S2.3 [x] [M] `native/plexus` (CPU grid-hash) → `builtin:plexus` + fallback gate
- **Goal:** the plexus line renderer as a separate CPU native (design answer 7: positions live in GPU TF buffers — per-frame readback is a sync stall; CPU N=400 + grid hash ≲ N·8 checks ≈ < 0.1 ms; **M, not L+** → included per the spec default).
- **Files (1 new):** `web/src/scenes/plexus.ts`; (edit) `web/src/fx/catalog.ts`, `web/src/scenes/builtin.ts`.
- **Depends on:** S2.2.
- **Behaviour:** NativeDef id `native/plexus`, generator, category `geometry`, tags `['plexus','lines']`; inputs `dist, drift, size, hue`; CPU `Float32Array` N = 400 knob (×.1 for tiles, as swarmN); grid-hash neighbour search at cell = `dist`; LINES + POINTS uploaded per frame; additive. **Bindings — ⚠️ Assumption, needs confirmation** (the design names no plexus bindings; assigned per the 2d policy, confirm at the CP2 demo): `drift ← lfo (sine)`, `dist ← sub .05/.3`, `size ← kick 0/.1`, `hue ← snare 0/.3`; Auto: — (no bass-class param).
- **Built-in (ride-along):** `builtin:plexus` (gen `native/plexus`).
- **Tests:** unit test the grid-hash neighbour search (pure TS): deterministic output, every emitted pair ≤ `dist`, on a small known 4-point fixture.
- **Done:** gates green; billed A/B ≤ 5 ms (measure — **this is the gate**); browser both fixtures: drift + connect + sub-widened dist — r reported; screenshot `plexus.png`.
- **Fallback (lead-locked, design L207):** if the cost check fails → **drop S2.3, continue in Variant C's shape**: no `native/plexus`, no `builtin:plexus` (14 built-ins), CP4 runs over 14; spec §4 unaffected. The coder reports `**Changed during implementation:**` with the measurement.

  **Changed during implementation:**
  1. **Gate PASSED (measured, 1728×1118, +own/flash, the drop, 3×4 s):** billed p95 dnb 2.15 / dub 3.48 ms (plain 1.98 / 3.28) — under 5 ms. CPU (a performance mark/measure around the wrapped draw, 100 µs timer resolution): whole draw med 0.10 / 0.40, p95 0.20 / 0.60 ms (dnb / dub; the dub figure is the sub's wider dist → more pairs → more upload); the search seam alone (plexusPairs micro-bench, 400 points, dist at the bind's 0.18/0.25/0.45, 2000 iters): med < 0.1, p95 ≤ 0.1 ms both fixtures — the design's < 0.1 ms estimate holds for the grid-hash search; the rest of the draw is the plan's own "LINES + POINTS uploaded per frame" (bufferSubData + GL dispatch). No fallback.
  2. **Bindings (the lead assumption, confirmed reading well at the CP2 demo):** drift lfo sine rate 0.05 (one breath per 20 s, attack/release 0), dist sub .05/.3 0.18→0.45, size kick 0/.1 2→5 px, hue snare 0/.3 0.35→0.65 (the scope's hue span). The orbits integrate a per-node phase (drift scales the angular speed), so drift 0 stills the web without a position jump as the lfo moves.
  3. **r per bound param (one full live pass each, styled read):** dnb drift↔lfo 1.00, dist↔sub 1.00, size↔kick 0.96, hue↔snare 0.84; dub 1.00 / 0.89 / 0.96 / 0.83. Spans reach the binds' full min→max both fixtures (dist 0.18…0.45: the sub-widened web reads).
  4. **Test fixture:** the known 4-point fixture uses exact binary fractions (0.5/0.75/1.25) — a first draft (0.6, 0.8) failed its own boundary case in float (0.6²+0.8² > 1.0); the brute-force cross-check (20 seeds, n 50, exact ≤) pins the semantics.
  5. **One interleaved DYNAMIC_DRAW buffer (the used prefix via bufferSubData) + two programs (line/node, one shared VS, forced attrib locations) on one VAO** — no per-frame allocation except the search's small head/next (ponytail comment in plexus.ts). N = 400, plexusN(size) = 40 for tiles (the swarmN ×.1 precedent). `gl.viewport(0, 0, f.width, f.height)` in the draw (S2.2's drift note 3).

### CP3 — donor copies + quick wins

#### S3.1 [M] donors: Solarize + Color Monochrome + Color Replacement (q5/q6 verification)
- **Goal:** the first three donor copies; the lead-locked q5+q6 decision is verified here, before the copy is authorised.
- **Files (3 new copies):** `web/src/fx/isf/Solarize.fs`, `web/src/fx/isf/Color Monochrome.fs`, `web/src/fx/isf/Color Replacement.fs`; (edit) `web/src/fx/isf.test.ts`, `web/THIRD_PARTY.md`.
- **Depends on:** CP2 (sequential; no code dependency).
- **Donor authorisation (lead-locked):** these three copies are authorised by this step; source `donor/ISF-Files/ISF/` (MIT, VIDVOX, HEAD 395072d); the MIT header stays untouched; one `web/THIRD_PARTY.md` row per file.
- **Behaviour:** **before copying `Color Replacement`, read its full input list** (design ⚠️ L220: only L1–60 verified) — q5 `changeColor` uses it if it covers a hue offset (binding `hueOffset/band ← snare 0/.3`) and q6 `changeToColor` uses its mask/target model (`target hue ← lfo (saw)`); **if it lacks a hue-offset input → ship own `web/src/fx/own/change-color.fs` (~12 lines) in this step (4th new file, lead-authorised contingency) and q5 binds there.** Solarize (q1): `threshold ← build 1/1–2 .35→.65`, `flip ← drop (event)`; output bounded by construction (acceptance 2's luma note). Color Monochrome (q4): static .4/.4/.2; `mix ← drop 0/.5 0→1`; header notes TD's analyze-max normalise is skipped (needs a reduction pass). Catalog effects only — no built-ins this step.
- **Tests:** 3 `isf.test.ts` entries (parse in our subset; `VJW_BIND` sources; header preserved).
- **Done:** gates green; billed A/B each over spectrum ≤ 5 ms (est ~1.2 / ~1 / ~1.2); browser both fixtures: solarize inverts above threshold on build, mono mix on drop, replacement band hue on snare / target hue on lfo — r reported; screenshots `solarize.png`, `monochrome.png`, `color-replacement.png`; **verification outcome recorded** (freezes the CP3 contract for S3.5).

#### S3.2 [S] melt: donors Dilate + Erode → `builtin:melt`
- **Goal:** the dilate/erode "melt" (top-10 #9) as two donor copies + the dilate built-in.
- **Files (2 new copies):** `web/src/fx/isf/Dilate.fs`, `web/src/fx/isf/Erode.fs`; (edit) `web/src/scenes/builtin.ts`, `web/src/fx/isf.test.ts`, `web/THIRD_PARTY.md`.
- **Depends on:** S3.1 (sequential).
- **Donor authorisation (lead-locked):** these two copies are authorised here; VIDVOX MIT headers untouched; THIRD_PARTY rows.
- **Behaviour:** Dilate = 2-pass separable max-luma (radius 1–15, donor default 2) — a faithful analog of TD's disc-tap dilate, cheaper; Erode = the min counterpart. **Lead-locked: erode is catalog-only (no binding, no built-in); the drop dilate↔erode flip is a structural fx swap and is NOT bindable — recorded in the `builtin:melt` scene comment.** Dilate binding: `radius ← sub .05/.3 2→8`.
- **Built-in (ride-along):** `builtin:melt` (spectrum + `isf/Dilate`, scene `radius` 6 — the R3 lever if over budget; cap 15 stays user-controlled).
- **Tests:** 2 `isf.test.ts` entries.
- **Done:** gates green; billed A/B ≤ 5 ms at radius 6 (est 3–4.5 — closest to budget in the wave; if over, lever = the radius doc value); browser both fixtures: melt widens on sub — r reported; screenshot `melt.png`.

#### S3.3 [M] rgb-contrast + color-threshold + dent → `builtin:poster`
- **Goal:** quick wins q2/q3/q7 + quick-win group 2 (3–4 per step batching, design answer 8).
- **Files (3 new):** `web/src/fx/own/rgb-contrast.fs`, `color-threshold.fs`, `dent.fs`; (edit) `builtin.ts`, `isf.test.ts`.
- **Depends on:** S3.2.
- **Behaviour:** rgb-contrast (q2): 3 floats cR/cG/cB; `cR ← snare 0/.3 1→−5` (inversion, min>max per the wave-1 precedent). color-threshold (q3): `t ← sub .05/.3 .3→.6`. dent (q7): research §2's formula; `width ← kick 0/.15`.
- **Built-in (ride-along):** `builtin:poster` (spectrum + `color-threshold` + `rgb-contrast`; ≤ 2 fx, R6 comment).
- **Tests:** 3 `isf.test.ts` entries.
- **Done:** gates green; billed A/B ≤ 5 ms (est ~1 / ~1 / ~1.2; poster total ≈ 3, the spectrum+2fx anchor is 3.7); browser both fixtures: poster edges on sub + red inversion on snare, dent punches on kick — r reported; screenshots `poster.png`, `dent.png`.

#### S3.4 [M] emboss + sharpen + checker → `builtin:solar-emboss`
- **Goal:** quick wins q8/q9/q10 + quick-win group 1 (donor Emboss/Sharpen rejected — own ISF, lead-locked).
- **Files (3 new):** `web/src/fx/own/emboss.fs`, `sharpen.fs`, `checker.fs`; (edit) `builtin.ts`, `isf.test.ts`.
- **Depends on:** S3.3 (solar-emboss also needs S3.1's Solarize — satisfied).
- **Behaviour:** emboss (q9): 2×2 gradient + light angle — own ISF because donor `Emboss.fs` declares `varying` (fact 8, won't compile under `ISF_VS`; noted in the header); `light angle ← lfo (sine)`, `k ← sub .05/.3`. sharpen (q8): 3×3 + cross, 9 taps, static — own for the same donor-rejection reason (noted). checker (q10): generator, 3 lines; `divisions ← kick 0/.1 4→9`; **`VJW_FLASH ["divisions"]`** — a full-frame flip is a strobe, so it runs flashGate ≤ 3/s.
- **Built-in (ride-along):** `builtin:solar-emboss` (spectrum + `isf/Solarize` + `own/emboss`; quick-win group 1).
- **Tests:** 3 `isf.test.ts` entries (checker's flash rule comes free via the shared test: flash name declared, binding min 0).
- **Done:** gates green; billed A/B ≤ 5 ms (solar-emboss est ≈ 2.4 + tail; measure); browser both fixtures: emboss sweep on lfo + strength on sub, checker flips ≤ 3 stamps/s with the luma cap holding — r reported; screenshots `solar-emboss.png`, `checker.png`, `sharpen.png`.

#### S3.5 [M] hsv-blur + rgba-blur → `builtin:halo` (last fx step)
- **Goal:** quick wins q11 (the pair) + quick-win group 3; after this step all 13 built-ins exist.
- **Files (2 new):** `web/src/fx/own/hsv-blur.fs`, `rgba-blur.fs`; (edit) `builtin.ts`, `isf.test.ts`.
- **Depends on:** S3.4 (halo also needs S3.1's `Color Replacement` — use whichever the S3.1 verification froze: donor or own/change-color).
- **Behaviour:** both 2-pass: ¼-res TARGET via `"WIDTH": "0.25*$WIDTH"` (ISF size-expression whitelist, fact 5), then recombine (hsv) / max-with-dry (rgba); `size ← reese .05/.4`; **Auto: reese**.
- **Built-in (ride-along):** `builtin:halo` (spectrum + `rgba-blur` + `isf/Color Replacement` with the q6 binding `target hue ← lfo (saw)`; quick-win group 3).
- **Tests:** 2 `isf.test.ts` entries.
- **Done:** gates green; billed A/B ≤ 5 ms (est ~2 + ~2 over spectrum; the spectrum+2fx anchor is 3.7 — measure, lever = the ¼-res factor); browser both fixtures: halo blooms + retints on reese — r reported; screenshots `halo.png`, `hsv-blur.png`. CP3 close: 13/13 built-ins, all new defs in the 2b library with category/tags.

### CP4 — close (lead, no coder dispatch)
- 60 s autopilot over **all 13 new built-ins** (12 if S2.3's fallback fired) on both arr fixtures → 0 late, 1.00× (spec §4.4).
- Reaction r reported for every bound param of every built-in on both fixtures (spec §4.2); `__flash` ≤ 3/s on the ⚡ scenes (diff-feedback.glow, checker.divisions); WCAG luma cap holds; solarize bounded by construction.
- Final billed-tail p95 sheet (all 13, `own/flash` appended, 1728×1117) → ≤ 5 ms (spec §4.1).
- Contact sheet `scratchpad/ed/wave2-sheet.png`, reviewed by the lead against the research's TD descriptions (spec §4.3).
- `web/THIRD_PARTY.md`: 5 donor rows + the Wombat row complete (spec §2 credits).
- 2b library: every new block present with stills, filterable by category/tags (spec §4.5).

## Acceptance mapping (spec §4)
1. **p95 ≤ 5 ms billed tail @ 1728×1117** → per-step A/B (S1.1–S3.5); julia gate S1.2; plexus gate S2.3; final sheet CP4.
2. **Reaction per effect on both arr fixtures (r reported); `__flash` ≤ 3/s; luma cap** → per-step browser checks S1.1–S3.5; ⚡ scenes S1.3 (diff-feedback) and S3.4 (checker); solarize bounded S3.1; consolidated at CP4.
3. **Contact sheet per CP, lead review** → CP0 (legacy unchanged + the 3 new blends), CP1–CP3 (`scratchpad/ed/cpN-sheet.png`), CP4 (`wave2-sheet.png`).
4. **60 s autopilot over all new built-ins, both fixtures, 0 late, 1.00×** → per-CP 60 s late runs from CP1 (timer truth) + the full CP4 run.
5. **2b library: stills + tag filters** → every step ships its defs with category/tags (design facts 6/7, tiles bake stills); verified at CP3 close and CP4.

## Research gaps (inherited from design L218–224; resolved at the named step, none blocking)
- ⚠️ `Color Replacement.fs` full input list (q5 hue-offset coverage) → verified at S3.1 before the copy (lead-locked q5/q6 decision).
- ⚠️ Wombat `Stars2D`/`PolkaDot2D` helper dependencies → read from the in-repo file at S1.3.
- ⚠️ julia p95 + fp32 banding at `Scale` 0.02 → measured at S1.2 (gate) + CP1 sheet.
- ⚠️ `?debug` meters on the shared fftSize-1024 analysers → verified at S0.2.
- ⚠️ GLES 3.0 `max` factors-apply-before-equation → one-frame check at S0.1.
- ⚠️ **Planner assumption (not a research fact):** plexus bindings are unspecified in the design — S2.3 assigns them per the 2d policy, confirm at the CP2 demo.
- ⚠️ All p95 figures are pre-measurement estimates; wave-1 anchors: spectrum+2fx 3.7 ms, scatter 2.65 ms, mosaic 4.56 ms.
