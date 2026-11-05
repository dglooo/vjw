# plan_td_look — Stage 2d: the TouchDesigner look, Variant A

## TL;DR
- 4 CPs, 16 one-coder steps, in the design's order. CP1 = Track A: 7 own ISF files (td-feedback, edge-rings, bloom, light-tunnel, radial-blur, flow-smear, reaction-diffusion) + 6 starred showcase scenes, around two engine edits (`VJW_FLASH`, TARGET pairs by name). CP2 = natives as filters + the 32-slot history ring (rgba-delay, time-machine, slit-scan). CP3 = transform-feedback points (swarm, scatter). CP4 = the rebind pass over the existing built-ins.
- Every effect ships its D1 bindings as defaults (ISF `VJW_BIND` / native `bind`): drums, `sub`, build/drop bind directly; the bass class binds `bass`, which Auto-style turns into reese (DnB) / wobble (Dubstep).
- Per step: gates green, `?bench` GPU p95 ≤5 ms at 1728×1117, one screenshot for the lead, a param trace on both fixtures. Per CP: a lead close-out (contact sheet + reaction check); CP3 closes with the spec §4.4 60 s autopilot run, CP4 repeats it.
- 11 new starred scenes, ≈25 engine lines, 7 `.fs` + 2 native files. No new npm deps. One optional donor port (MIT) in S1.7.

## Freshness
2026-11-04, planner (Fable 5.1). Inputs: `agents/system-designer/design_td_look.md` L1–317 and L379–418 (today); `thoughts/spec_td_look.md` §2, §4; `agents/planner/plan_flash_cap.md` (format); `agents/STATE.md` HEAD; CLAUDE.md § Lead workflow #11, § Constraints. Code checked by Glob/Grep only: `fx/own/*.fs` names (`tunnel-mesh`, `fractal`, `wave-landscape`, `strobe`, `flash`, `echo` exist, so the design's ⚠️ on those names is closed); `parseIsf` + `isf.test.ts` 'VJW_BIND round-trips'; `live.ts` `const FLASH`, `flashOnsets`, the `flashGate` call in `render`; `web/src/bind.test.ts` exists; donor `donor/ISF-Files/ISF/Optical Flow Generator.fs` exists.

## Chosen variant
`design_td_look.md` § Variant A (L202–317). Lead pick 2026-11-04 22:5x per the user's standing instruction (STATE HEAD), all designer defaults (§ Decision needed 1–6): ring RGBA8, ½ stage, 32 slots, stride 1/2/2, ≤64 MiB, fixed at create; RD as ISF + S1.8 with a native RD only as plan B; hybrid binding policy with CP4 after CP3; the parked slit-scan worktree is already removed (`agents/_archive/slit_scan_wip_2026-11-04.patch`); `VJW_FLASH` replaces the hard-coded flash set.

## Conventions (every step; a step's text states only what differs)
- **Brief opener, verbatim:** "Invoke the `ponytail` skill (full) before writing code." Then: ~45 min (L steps ≈60–75), own worktree with `web/node_modules` symlinked, reads by symbol (files move between steps), ≤ ~3 files, one targeted browser check. The lead merges into `master`, runs the gates and commits (CLAUDE.md #11).
- **Gates:** `cd web && npm run lint && npm run typecheck && npm test`.
- **Bench:** `localhost:5173/?bench` with the step's showcase scene on screen (the harness the MilkDrop CPs used): GPU p95 ≤5 ms at 1728×1117, scale 1. D5 budgets are quoted per step; levers: layer `res`, RD steps 8 → 6, swarm N 131k → 65k, ring stride, scatter cell 3 → 4 px.
- **Screenshot:** `/Users/shaixee/Codered/Veejay-Wizard/scratchpad/td/<scene>.png` (the main checkout, not the worktree), for the lead's side-by-side review against research §1b.
- **Trace:** `localhost:5173/?debug`, file source `scratchpad/fx_audio/dnb174.wav` then `dubstep140.wav`; Auto-style on via the panel (E → Sources), since `?debug&preset=` doesn't drive it (STATE). Each bound param visibly moves on its source in the overlay. Scenes with ⚡ inputs: `__flash` holds ≤3 stamps in any 1 s.
- **Header comment, every new `.fs` / native:** `Look: TD <component> (studied, rewritten). Credits: <OSS block, licence>`, only for blocks actually used (webgl-noise MIT; our `gl/bloom.ts`; jsexp Gray-Scott BSD-3 as algorithm reference; the S1.7 donor header). Never paste TD text.
- **Bindings** read `source attack/release min→max` (D1; seconds; the input's units). Defaults live in the file's `VJW_BIND` (shape as in `own/echo.fs`) or the native def's `bind`, so the panel's add-fx brings them along. `reset`/`spawn`/`explode`/`rotate` are `bool` inputs bound `drop` (or `snare`) 0/1.5: the runtime writes a bool at y ≥ 0.5 (`live.ts` `render`); ⚠️ use ISF `event` only if `parseIsf` already supports it. The panel has no bool binding controls (STATE finding), so file defaults are the only way in, which is fine here.
- **⚡ inputs** (brightness on a hit): 0..1, binding min 0, listed in `VJW_FLASH`, added by the shader on top of the TD default (fact 6: a min ≥ .5 freezes the param). Self-sustaining loops soft-clip above ≈.8 (D2 rule 3). `hats` drives hue or thin detail only (D2 rule 2).
- **Scenes:** `web/src/scenes/builtin.ts`, starred, ids `builtin:<look>`, shaped like a neighbouring multi-node scene. Auto-style changes only the `bass`-bound param per genre; say so in the scene comment.
- **Shared header test** (`web/src/fx/isf.test.ts`, started in S1.2, one entry added per later step): `test.each(NEW_OWN)`: the file parses; every `VJW_BIND` source ∈ `SOURCE_IDS` (`web/src/bind.ts`); every `flash` name is a declared input whose binding `min` is 0.
- **Lead close-out per CP:** contact sheet `scratchpad/td/cpN-sheet.png` of the CP's new scenes + a reaction check on both fixtures (bound params move on their source). CP2 adds the two-ring fade memory check; CP3 and CP4 add the 60 s autopilot run.

## Checkpoints
### CP1 — Track A: seven own ISF looks on today's engine (S1.1–S1.9)
**Frozen contract**
```ts
// web/src/fx/types.ts EffectDef — ISF header "VJW_FLASH": ["glow", "level"]; live.ts gates these inputs through flashGate (the FLASH set goes away)
flash?: readonly string[]
// web/src/fx/isf.ts (pure, tested) — pass i → index of the first pass naming the same TARGET; −1 for a pass without TARGET. live.ts node() builds one read/write pair per distinct index.
export const pairsByTarget = (passes: readonly { target?: string }[]): number[]
```
**Demo:** `cd web && npm run dev` → `localhost:5173`, file source `scratchpad/fx_audio/dnb174.wav`, press → through the starred `builtin:td-feedback`, `edge-rings`, `bloom-glitch`, `light-tunnel`, `flow-smear`, `reaction-diffusion`. td-feedback pumps its zoom on every kick and steps hue on snares; bloom's glow pulses on kicks and never more than 3×/s; RD cells grow where the spectrum is bright and hold their pattern for a minute.

### CP2 — Track B(a): native filters + the history ring (S2.1–S2.4)
**Frozen contract**
```ts
// web/src/gl/scene.ts — src = the previous node's output (the chain temp); existing natives ignore it
export interface Native { draw(f: FrameInput, v: Readonly<Record<string, Value>>, src?: WebGLTexture | null): void; dispose?(): void }
// a native filter def (web/src/fx/catalog.ts): kind: 'filter', no inputImage input, bind = its D1 defaults
// web/src/scenes/history.ts — module-local except the two pure helpers
interface Ring { tex: WebGLTexture; depth: number; head: number; filled: number; push(src: WebGLTexture): void; dispose(): void }
export const slot = (head: number, age: number, depth: number) => (((head - age) % depth) + depth) % depth
export const ringSize = (w: number, h: number, depth = 32, cap = 64 << 20): [number, number] // ½ of w×h, halved again until depth·w·h·4 ≤ cap
```
```glsl
// history shaders, ES 3.00
uniform highp sampler2DArray uRing; uniform sampler2D uSrc; uniform float uHead, uDepth, uFilled;
vec4 past(vec2 uv, float age); // age in slots; 0 = uSrc at full res; fractions mix 2 slots; clamped to uFilled − 1
```
**Demo:** `builtin:rgba-delay` over the tunnel shows R/G/B copies trailing by `spread` frames that widen on the reese; `time-machine` sweeps a circular ramp through the last second of Truchet; `slit-scan-ring` smears the spectrum along y by `span` slots on the sub. A cut between two ring scenes: no black ghost, no late frames.

### CP3 — Track B(b): transform-feedback points (S3.1–S3.2)
**Frozen contract:** `web/src/scenes/points.ts` exports `native/swarm` (generator, N = 131072 knob) and `native/scatter` (filter, 3×3 px cells); both use the `particles.ts` TF pattern (twgl `createTransformFeedback`, ping-pong VAOs, one update + raster pass); defs carry `bind` with D1 defaults. No TS types beyond CP2's.
**Demo:** `builtin:swarm` alone: 131k points curl through noise, burst outward on kicks, trails lengthen on a build, respawn on the drop. `builtin:scatter` over the tunnel: the image breaks into 3 px squares that scatter on the reese/wobble and snap back on a build.

### CP4 — the rebind pass (S4.1)
**Frozen contract:** none new; the binding policy table (design L54–64) is the contract. After S4.1 the own built-ins bind kick 14, snare 5, sub 6, `bass` 8, build 3, hats 1, beat 1, lfo 2, onset 0, treb 0.
**Demo:** `?debug` on `dnb174.wav`: kaleido-tunnel's angle, pixel-strobe's cell size and feedback-ring's twirl jump on the kick, not on every bass note; tunnel-mesh's flash fires on snares and stays ≤3/s.

## Steps
Every step: "Invoke the `ponytail` skill (full) before writing code." + the conventions above. Size S/M/L in the heading.

### CP1 — Track A

### S1.1 [x] [S] engine — `VJW_FLASH` → `EffectDef.flash`; gate by def
Depends on: none. **Files:** `web/src/fx/types.ts` (`EffectDef`: `flash?`), `web/src/fx/isf.ts` (`parseIsf`: read `VJW_FLASH` next to `VJW_BIND`; an array of strings naming declared inputs, else reject the way a malformed `VJW_BIND` is rejected), `web/src/gl/live.ts` (delete `const FLASH`; `bindInto` carries the `flash` state when `def.flash?.includes(name)`; the `flashGate` call in `render` stays), `web/src/fx/own/strobe.fs` + `flash.fs` (one header line each: `"VJW_FLASH": ["strobe"]` / `["flash"]`). Five files, two are one-liners; they must land together or strobe/flash lose their gate. Natives: the field exists on `EffectDef`; no native sets it in this plan (D1 marks ⚡ only on bloom).
**Tests (`isf.test.ts`):** 'VJW_FLASH round-trips' (mirror 'VJW_BIND round-trips'); an unknown name is rejected; `own/strobe` / `own/flash` parse with `flash` = `['strobe']` / `['flash']`. `post.test.ts` untouched.
**Done:** gates; browser: Pixel strobe still washes ≤3/s (`__flash`, plan_flash_cap CP1 demo). No bench (no render change).
**Changed during implementation:** `parseIsf` never rejected a malformed `VJW_BIND` (it passes through; `live.ts` `fail`s per key at bind time), so a bad `VJW_FLASH` (not an array, or a name that is no declared input) throws a readable `${id}: …` Error like `parseIsf`'s other bad-header cases; `catalog.ts` logs and skips such a file. `bindInto` takes the def's list as a trailing `flashes?` argument (the layer call has no def).

### S1.2 [x] [M] `own/td-feedback.fs` + `builtin:td-feedback`
Depends on: S1.1 (order only). **Files:** `web/src/fx/own/td-feedback.fs`, `web/src/scenes/builtin.ts`, `web/src/fx/isf.test.ts`.
**Look:** `feedbackTOP.tox` ex3 (research §1b). **Passes** (the `PASSES` syntax of the existing own multi-pass files; grep `PASSES` in `fx/own/`): P0 `loop` PERSISTENT FLOAT at ½: read `loop` (last frame) × `fade`, gamma, hue += `hueStep`, zoom by `zoom` about the centre, displace by simplex noise (webgl-noise, MIT header) × `displace`, 3×3 blur + Sobel edge of `inputImage` × `edge`, screen `inputImage`, soft-clip above .8; `reset` true → black. P1 out at full res: `mix(src, screen(src, loop), dryWet)` (TD dryWetMix; default .8 ⚠️ taste). ≈7.7 MB.
**Inputs / VJW_BIND (D1):** zoom ← kick 0/.25 1.012→1.035 · hueStep ← snare 0/.3 3→15 (°/frame) · edge ← hats 0/.1 .12→.3 · displace ← bass .05/.4 .01→.07 · fade ← build 1/2 .97→.99 · reset ← drop. Auto-style moves only `displace` (reese / wobble / bass).
**G2 check (first new own file):** confirm `web/src/fx/catalog.ts` picks the file up (glob import vs a list; if a list, add it) and the panel's add-fx picker shows it.
**Scene:** `builtin:td-feedback` = spectrum → td-feedback, starred (S1.4 appends bloom). **Tests:** start `NEW_OWN` in `isf.test.ts` (conventions). **Done:** gates; bench (D5 ≈3.5 with bloom, less now); screenshot; trace: zoom on kick, hue on snare, displace on reese (DnB) / wobble (Dubstep).
**Changed during implementation:** tuned on the spectrum until it looked like TD (shots in `scratchpad/td/s1.2/`).
- Edge = a Sobel of the **loop** (TD's edge over the feedback), not of `inputImage`: built from the same 4 bilinear taps as the 3×3 tent blur, so no extra taps. With the image's edge, or TD's .858 source level, the big spectrum filled the screen. The source is screened in at .45.
- Saturation is TD's HSV kind (the top channel V stays). A luma-pivot boost raised V by ≈16 %/frame and locked the loop into flat fills. Knobs: GAMMA 1.1, SAT 1.3, RED .99, LEVEL .45, FIELD 2.5, DRIFT .1.
- D1 ranges → shipped: hueStep 3→15 → **5→15** (TD's +5°); edge .12→.3 → **.25→.6**; displace .01→.07 → **.006→.025** (reese sits ≈.5, so .07 smeared everything into grey); fade .97→.99 → **.95→.98** (≥.97 washed out). `reset` ← drop a/r 0/1.5, range 0→1 (true ≈1 s after a confident drop).
- G2: the catalog globs `./own/*.fs`, so there is no list to edit. The panel's add-fx shows it under "feedback" (browser), and `newNode` copies `VJW_BIND`.
- Bench at 1728×1118, scale 1: GPU p95 3.00–4.40 ms over runs. The machine reads ≈1.5× higher in some runs: spectrum alone is 1.98 or 3.19 ms. The node itself costs ≈.7–1.1 ms, and 2× snoise3D at ½ is ≈.47 of that: the lever if S1.4's bloom misses 5 ms.
- Trace: neither fixture has a build or drop (both stay 0), so `fade`/`reset` go unexercised. The classifier stays undecided on the 12.5 s loops, so Auto-style was set the way the panel picker does (`pick`, auto on).

### S1.3 [x] [M] `own/edge-rings.fs` + `builtin:edge-rings`
Depends on: S1.2 (test list). **Files:** `web/src/fx/own/edge-rings.fs`, `builtin.ts`, `isf.test.ts`.
**Look:** `feedbackEdge`. P0 `loop` PERSISTENT FLOAT ½: last frame × `gain` (>1, self-sustaining, so soft-clip at .8, D2 rule 3), scale about the centre by `scale`, 3×3 blur, hue += `hueStep` (negative, TD's −2°), + Sobel edge of `inputImage` × `edge`, screen `inputImage`; `reset` → black. P1 out: screen(src, loop). ≈7.7 MB.
**Inputs:** scale ← kick 0/.3 1.002→1.012 · hueStep ← snare 0/.3 −1→−8 · gain ← sub .1/.6 1.03→1.08 · edge ← bass .05/.3 .15→.4 · reset ← drop. **Scene:** tunnel → edge-rings. **Done:** gates; bench (D5 ≈2.0); screenshot; trace (gain swells on sub, rings step on snare, no white-out over 60 s of `dnb174`).
**Changed during implementation:** tuned on the tunnel (sweeps v1–v5 in `scratchpad/td/s1.3/`, harnesses `tune-er.mjs` and `edge-rings.mjs`). Inputs, bindings and ranges ship as written.
- **Effective loop gain < 1.** `gain` × a fixed `OPACITY` .9 gives .93 at rest and .97 on a full sub. Every variant with an effective gain ≥ 1 filled the whole tunnel to the clip within ~1 s (mean luma ≈ .9). The soft clip caps the value, not the coverage. TD does the same: its `Feedbackgain` cparm is **1.03** × level opacity .95 ≈ .98 (the research's 1.07 is the stored constant, unused in expression mode). The .8 soft clip stays as the net (D2 rule 3).
- **Seed = the image above .7 only** (`SEED`, at `LEVEL` .5): the end light, sparks, and the walls on a hit. The whole image filled the loop, and so did its Sobel: the tunnel's 32 stripe borders are everywhere. Each hit seeds new rings.
- **Edge = a Sobel of the loop** (TD's edge of the history, as in S1.2), from the 4 blur taps, not of `inputImage`. TD's dark edge colour drawn over the loop made grooves in a bright fill, not glowing rings.
- **P1 = screen(.5·src, loop)** (`DRY`, TD's dry/wet). At 1, the tunnel's lit walls hid the rings. `BLACK` .01 (TD .002) kills the haze between hits.
- Bench at 1728×1118, scale 1, tunnel included: GPU p95 **2.48 ms** (dnb174, 60 s) and 2.51 (dubstep140).
- Trace r: scale↔kick .85/.83 · hueStep↔snare −.84/−.83 (inverted range) · gain↔sub .82/.84 · edge↔reese .62 (DnB), ↔wobble .59 (Dubstep).
  - The fixtures' sub sits at .40–.57, so gain only swings 1.050–1.058.
  - Neither fixture has a drop, so `reset` goes unexercised.
- **Luma, 60 s of dnb174** (mean Rec. 709 every 0.5 s): .10–.57, mean .39; per-10 s means .43 .34 .47 .33 .43 .34 .45, no drift; 0 samples > .8. The plain tunnel alone reads .34–.66.

### S1.4 [x] [M] `own/bloom.fs` + `builtin:bloom-glitch`; td-feedback gains bloom
Depends on: S1.1, S1.2. **Files:** `web/src/fx/own/bloom.fs`, `builtin.ts`, `isf.test.ts` (+ `web/src/bind.test.ts` for G3).
**Look:** `bloom.tox`; shaders ported from our `gl/bloom.ts` (Bjørge dual filter; credit the file). Targets with distinct names, FLOAT, not persistent: P0 threshold + down ½ (soft knee at `threshold`), P1–P4 down ¼ ⅛ 1/16 1/32, P5–P8 up ×4 (each samples both levels and adds), P9 composite at full res: `src + glowSum·(.4 + .3·glow + level)·tint(rampShift)`, TD's cosine-ramp tint, soft clip. ≈20.5 MB. Not a native around `createBloom` (design L290).
**Inputs:** threshold ← build 1/1 .35→.15 · glow⚡ ← kick 0/.2 0→1 · level⚡ ← drop 0/1.5 0→1 · rampShift ← bar saw 0→1. `"VJW_FLASH": ["glow", "level"]`.
**G3 check (first inverted range):** read `evaluate` in `web/src/bind.ts`; add 'evaluate lerps an inverted range (min > max)' to `bind.test.ts`. If it clamps instead, declare `tension` 0..1 and invert in-shader (`mix(.35, .15, tension)`), and report the result for S1.9, S3.2 and S4.1.
**Scenes:** `builtin:bloom-glitch` = glitch → bloom; append bloom to `builtin:td-feedback`. **Done:** gates; bench both scenes (D5 ≈2.3 / ≈3.5); screenshot; trace + the D2 luma trace on both fixtures: `__flash` ≤3 stamps per second, no onset refused on a plain 4/4.
**Changed during implementation:** shots `scratchpad/td/s1.4/` (v1–v5), harnesses `scratchpad/td/bloom.mjs` and `s1.4/ab.mjs` (same-session A/B).
- Levels from ¼, not ½ (P0 ¼ … P4 1/64; up 1/32 … ¼): wider halos, less cost. The composite is an exp screen, `1 − (1 − src)·exp(−k·glowSum·tint)` with k = 1.6·(.4 + .3·glow + level), not add + .8 soft clip: the brights keep their shape and the dark takes the halo. v1 (levels' mean) was faint; v2 (sum, add) went flat at the clip; v4 (`INTENSITY` 1.6) ships.
- **G3:** `evaluate` lerps (`min + (max − min)·y`), so min > max inverts. `bind.test.ts` pins it, and S1.9, S3.2 and S4.1 ship inverted ranges as written.
- **The 8.7 ms was neither noise nor bloom.** Same-session A/B (med ms): td-feedback alone 4.27; + a 1-tap pass-through (`own/flash`) 7.42; + bloom 8.13. Spectrum 3.07; + the pass-through 3.28. Any node after td-feedback adds ≈3.1 ms, and bloom itself ≈.7.
  - Appending takes td-feedback off `direct`: its full-size P1 now goes to `temps[1]`. A one-frame GL capture shows no extra copy, the loop still at ½ and no allocations.
  - Per-pass programs (PASSINDEX as a constant) changed nothing.
  - The timer bills the scene's GPU span, not its own work: 3 renders per frame bill 20–26 ms and still hold 60 fps. It seems to leave the last pass into `acc` unbilled, which hid td-feedback's real cost from S1.2's bench.
- **Levers shipped:** td-feedback's noise is one call with two channels (the 4 corners' gradients rotated yzx give y), −.6 ms. `builtin:td-feedback` gets layer `res` .5 (the spectrum at ½, the effects still at full size), −2.9 ms. Rejected: res .75 (p95 6.9) and bloom before td-feedback (7.4).
- **Bench** 1728×1118, scale 1, 25 s, med / p95: td-feedback + bloom 4.51 / 4.92 (dnb174) and 4.22 / 4.72 (dubstep140). Before: 8.13 / 8.42 (same session), 8.38 / 8.72 (WIP). bloom-glitch 3.60 / 3.66 and 3.62 / 3.68 (glitch alone 2.11 / 2.20).
- **Trace:** glow↔kick r .89, both scenes and fixtures; rampShift saws 0→1 per bar. Neither fixture has a build or drop, so threshold and level go unexercised.
  - Flash ≤2 stamps/s with nothing refused (wanted/allowed): bloom-glitch 29/29 (dnb), 12/12 (dub); td-feedback 28/28, 12/12.
  - Luma (2 Hz): bloom-glitch .11–.44, td-feedback .13–.55, 0 samples > .8.
- Shots `scratchpad/td/bloom-glitch.png` and `td-feedback-bloom.png` (+ `-rest`).
- Out of scope, for the lead: a res < 1 layer that ends on an effect could stay `direct` (in `live.ts`, `!small` → `!(small && l.nodes.length === 1)`, since effects draw at full size). That saves one full-size composite of real work but ≈0 on this timer, so it isn't shipped.

### S1.5 [x] [S] `own/light-tunnel.fs` (shown by S1.6's scene)
Depends on: S1.2 (test list). **Files:** `web/src/fx/own/light-tunnel.fs`, `isf.test.ts`.
**Look:** `lightTunnel` (Benson lineage). One pass: polar `r, θ` about `(centerX, .5)`; clamp/wrap `r` to `radius` (the mouth), `θ += twirl·(1 − r)`; sample `inputImage` at the remapped uv; dark falloff beyond the mouth. No targets.
**Inputs:** radius ← sub .05/.4 .3→.6 · twirl ← bass .05/.4 0→4 · centerX ← bar sine .45→.55 (a float input; no point2D component binding). **Done:** gates; a panel-built spectrum → light-tunnel: screenshot + trace (the mouth breathes on sub, the twirl on reese/wobble); the bench comes with S1.6.
**Changed during implementation:** harness `scratchpad/td/light-tunnel.mjs` (the panel's `addFx` on `builtin:spectrum`, trace + same-session A/B); shots `scratchpad/td/light-tunnel*.png` and `s1.5/` (v1–v3).
- Clamp, not wrap (TD's look). TD's units: y runs −1..1 over the height, so `radius` .3→.6 is a mouth 30–60% of the height across.
- The twirl turns by the clamped `r`, `twirl·(1 − min(r, radius))`: the streaks stay straight and turn with the rim. The raw `r` would curl them into spirals, which smear.
- No `atan`, which is undefined at the centre: a `mat2` rotation and the rim scale `m / max(r, 1e-6)` replace it.
- The falloff beyond the mouth is 1/r². With 1/r (v1) the streaks ran to the edges as flat wedges.
- **Fixture limit (as S1.3):** `sub` is relative (≈ .5 on a steady sub): dnb174 .42–.56, dubstep140 .47–.56. So radius only moves .444–.461 (r↔sub .88 / .91).
  - The range is shown by hand: `light-tunnel-r30.png` / `-r60.png`, radius unbound and set to .3 / .6.
- **Trace** (Auto-style on, genre picked):
  - twirl↔reese .57 on DnB (1.90–2.47 rad); twirl↔wobble .52 on Dubstep (.05–1.28).
  - centerX↔bar sine 1.00 (.45–.55, tempo-gated).
  - Luma (2 Hz): .07–.24 (DnB), .10–.27 (Dubstep), 0 samples > .8.
- **A/B** (same session, dnb174, 3 rounds × 4 s, med / p95 ms): spectrum 3.08 / 3.15 · + light-tunnel 3.33 / 3.39 · + flash 3.28 / 3.37 · + light-tunnel + flash 3.57 / 3.68. With light-tunnel billed (not last), its own cost is ≈ .29 ms.

### S1.6 [x] [S] `own/radial-blur.fs` + `builtin:light-tunnel`
Depends on: S1.5. **Files:** `web/src/fx/own/radial-blur.fs`, `builtin.ts`, `isf.test.ts`.
**Look:** `radialBlur`. P0 `blur` at ½, RGBA8 (no FLOAT): 24 taps from uv toward the centre, step `strength`/24, averaged. P1 out at full res: `mix(src, blur, dryWet)` (default .7 ⚠️ taste). 3.9 MB.
**Inputs:** strength ← kick 0/.18 .04→.3. **Scene:** spectrum → light-tunnel → radial-blur, starred. **Done:** gates; bench (D5 ≈2.8 for the trio); screenshot; trace (streaks on kick).
**Changed during implementation:** harness `scratchpad/td/radial-blur.mjs` (`gen`: generator comparison; `scene`: trace, centre pair, same-session A/B); shots `scratchpad/td/light-tunnel-scene*.png` and `s1.6/`.
- **Generator `native/tunnel`, not the spectrum** (`s1.6/v1-gen-*`, kick + rest each). Spectrum: its bars fill the mouth with busy wavy stripes and square it off (S1.5). Particles: real star streaks, but near black at rest and a noisy disc for a mouth. Tunnel: its rings keep the mouth round and bright at rest, its seams become the rays, and a kick zooms the whole portal outwards.
- **`centerX` input added** (default .5; not in D1). The scene binds it to light-tunnel's bar sine .45→.55 (r 1.00 between the two). With the zoom at .5 under a mouth at .45, the rays smear sideways and wash out on one side (`s1.6/v3-dnb-off-centre.png` vs `-on-centre.png`). `VJW_BIND` keeps strength only (D1), so a panel add on another generator stays centred. Category Geometry, beside light-tunnel.
- **Trace** (Auto-style on): strength↔kick r .91 (dnb174, 26 onsets) / .90 (dubstep140, 8 onsets). It reaches .30 within 50 ms of every onset and is ≈.15 300 ms later; mean .29 on a kick vs .075 / .05 off. light-tunnel as in S1.5: radius↔sub .89 / .91 (.444–.461), twirl↔reese .56 / ↔wobble .54, centerX↔bar sine 1.00. Luma (2 Hz) .06–.32 (DnB) and .09–.27 (Dubstep), 0 samples > .8.
- **Bench / A/B** (1728×1118, scale 1, same session, med / p95 ms; dnb174 4 rounds × 4 s, dubstep140 3 × 4 s):

  | Config | dnb174 | dubstep140 |
  |---|---|---|
  | scene (trio) | 2.90 / 3.07 | 2.86 / 3.06 |
  | trio + flash | 3.20 / 3.44 | 3.18 / 3.40 |
  | lt + flash | 2.18 / 2.25 | 2.18 / 2.25 |
  | lt | 1.72 / 1.76 | 1.72 / 1.80 |
  | tunnel alone | 1.34 / 1.39 | 1.35 / 1.40 |

  radial-blur's own cost ≈ 1.0 ms (trio + flash − lt + flash). The whole trio, billed, ≈ 3.2 / 3.4.
- **Harness trap:** restart the dev server after any source edit, not only `.fs`. After a `builtin.ts` edit the harness's `import('/src/app.ts')` became a second, silent app (likely HMR-stamped module URLs), and the first scene run traced zeros. A restart fixed it.

### S1.7 [x] [M] `own/flow-smear.fs` + `builtin:flow-smear`
Depends on: S1.2 (test list). **Files:** `web/src/fx/own/flow-smear.fs`, `builtin.ts`, `isf.test.ts`.
**Look:** `opticalFlow` TOP math, rewritten. **Donor authorised (optional):** `donor/ISF-Files/ISF/Optical Flow Generator.fs` (MIT): its flow-estimation block may be adapted; keep its licence header inside ours. Passes: P0 `flow` PERSISTENT FLOAT ⅛: luma of `inputImage` in .r, flow in .gb against last frame's .r (fact 1: a persistent pass reads its own last frame), `flow = −It·∇I / (|∇I|² + ε)`; P1 `smear` PERSISTENT FLOAT ½: `smear(uv − flow·force)·decay + src·hueRotate(tint)`; P2 out: screen(src, smear). Distinct TARGET names, so S1.8 isn't needed. ≈9.2 MB.
**Inputs:** force ← bass .05/.3 .5→3 · decay ← build 1/2 .85→.96 · tint ← hats 0/.12 0→.35 (hue rotation only, never brightness, D2 rule 2). **Scene:** tunnel → flow-smear. **Done:** gates; bench (D5 ≈2.2); screenshot; trace (smear length on reese/wobble, decay on build).
**Changed during implementation:** harness `scratchpad/td/flow-smear.mjs` (`gen`: generator comparison; `scene`: trace + 30 s luma; `ab`: + same-session A/B). Shots `scratchpad/td/flow-smear.png` and `s1.7/` (v1–v7, `scene-*`). The donor's flow block is adapted with its MIT notice inside the file.
- **Flow = the donor's / TD's bounded form**, `−It·∇I / sqrt(|∇I|² + λ)` (λ .1, offset 3 texels at ⅛), not `/(|∇I|² + ε)`, which blows up on weak gradients. Luma is an 8×8 box (16 taps, TD's preshrink).
- **Passes:** P0 `flow` ⅛ = (luma now, luma last frame, wake .ba). It reads only its own last frame, so the flow is one frame late (invisible) and the 16-tap box runs once. P1 `smear` ½, P2 out. ≈8.2 MB.
- **A wake, not the raw flow.** Raw flow lives only within the 3-texel offset of a moving edge, so a trail pushed by it stalls in a few px (v1–v3: ghosting, then moiré copies). The wake (`flow + .9·tent(last wake)`) keeps the trail flowing where the motion passed. The push is `W/(|W| + .1)·force·6` half-size px per frame (a knee: slow motion still streaks, fast motion can't tear). It is the max of 4 taps along it, so a bright point grows into a segment, with no gaps.
- **The trail streams back along the motion** (sample at uv + push). The plan's `uv − flow` (TD's direction) only hugged the moving edge (v7). The seed is gated by the wake (`smoothstep(.05, .25, |W|)`): a `|ΔL|` gate seeded only edges. The seed is `.8·hue(src, tint·2π)`, so tint is in turns, and the trail is kept by `max`, not added: no white-out by construction.
- **Out = lighten** `max(src, smear)`, not screen: screen brightened everything that moves into a pastel wash (v1–v2).
- **decay .85→.96 → .92→.97:** at .85 the trail falls to ⅓ in 5 frames and reads as a smudge (v4–v5).
- **Generator `native/spectrum`, not the tunnel** (`s1.7/v2`–`v6-gen-*`). The tunnel moves everywhere: |ΔL| and the wake saturate over the whole frame (debug view), so all of it seeds and washes out. On the spectrum each bar moves on its own, and the falling tops leave tinted plumes with upward striations. SDF shapes, flythrough, worley, truchet, glitch and particles read as weak smudges, static, mush or too costly.
- **Layer `res` .5** (S1.4's lever). At res 1 the scene billed p95 6.23 ms, and fs alone ≈3.0. A probe with P1 reduced to a copy and P0 to 1 tap still billed ≈2.4: structural, not shader work. It is the S1.4 timer anomaly, for the lead. At res .5 fs bills ≈.7.
- **Bench** 1728×1118, scale 1, same session, med / p95 ms (dnb174 3 rounds × 4 s, dubstep140 2 × 4 s):

  | Config | dnb174 | dubstep140 |
  |---|---|---|
  | scene [fs] | 3.07 / 3.41 | 3.09 / 3.39 |
  | fs + flash | 3.33 / 3.66 | 3.44 / 3.70 |
  | flash | 2.61 / 2.97 | 2.73 / 2.99 |
  | spectrum ½ alone | 1.98 / 2.20 | 1.99 / 2.25 |

  The final code's 30 s trace: p95 3.35 (dnb174). fs's own cost ≈ .72 / .71 (fs + flash − flash).
- **Trace** (Auto-style on, genre picked):
  - force↔reese r .61 (1.67–2.04) on DnB; force↔wobble .57 (.51–1.34) on Dubstep.
  - tint↔hats .84 / .87 (0–.35).
  - Neither fixture has a build, so decay stays .92 (unexercised).
- **Luma (2 Hz, 30 s):** .052–.287, mean .17 (dnb174) and .049–.256, mean .14 (dubstep140); 0 samples > .8. Per-10 s means .19 .16 .16 / .16 .13 .12, no climb.

### S1.8 [x] [S] engine — TARGET pairs by name
Depends on: none (lands right before S1.9). **Files:** `web/src/fx/isf.ts` (`pairsByTarget`, pure), `web/src/fx/isf.test.ts`, `web/src/gl/live.ts` (`node()`, `run()`, `resize()`, `freeNode()`).
**Behaviour (design L270):** `node()` builds one read/write pair per distinct `pairsByTarget` index; the first pass naming a TARGET sets FLOAT/PERSISTENT/WIDTH/HEIGHT; after any pass draws, its pair flips and `u[TARGET]` points at the newest texture (fact 1 semantics, unchanged); `resize()` and `freeNode()` visit each pair once. Files with distinct names behave exactly as before.
**Tests:** `pairsByTarget`: distinct names → identity; repeats → the first index; no TARGET → −1; mixed order. **Done:** gates; no-regression bench on two existing own multi-pass scenes (pick them by grepping `PASSES` in `fx/own/`) and on `builtin:flow-smear`; the panel's live rebuild (plan_live_rebuild) still keeps a loop alive across a param edit.

**Changed during implementation:** `parseIsf` declared one sampler per pass TARGET, so a repeated name redeclared `uniform sampler2D <name>` and the file failed to compile. Design fact 1's "N passes on one name work today" held only for `live.ts`. `isf.ts` now dedupes the TARGET samplers (a `Set`), with a test. `run()` needed no edit: passes sharing a name hold the same pair array, so its per-pass `reverse()` is the ping-pong. `resize()` skips a pair an earlier pass already fitted; `freeNode()` frees a `Set` of the textures.
- **Allocation** (harness `scratchpad/td/s1.8/s1.8.mjs`: panel addFx/removeFx on `builtin:tunnel`, `gl.createTexture`/`deleteTexture` counted): bloom 18/18, flow-smear 4/4, td-feedback, edge-rings, radial-blur 2/2, identical before and after.
  - A synthetic filter with 8 PERSISTENT passes on `s` around one pass on `a` gets 4 textures (18 the per-pass way); the base code can't compile it.
  - Its 1×1 `s` reads back newest = 8·(FRAMEINDEX+1) mod 256 and the other texture 1 less, at 3 checkpoints: after 30 frames, after a `setValue`, after an addFx/removeFx of another node. FRAMEINDEX 29 → 59 → 94: the loop stays alive, no rebuild. removeFx deletes 4.
- **A/B** (dnb174 looping, 2 × 8 s per scene, GPU p95 / median ms, td-feedback · bloom-glitch · flow-smear · edge-rings):
  - before 4.88/4.52 · 3.69/3.63 · 3.39/3.05 · 2.49/2.41
  - after 5.06/4.58 · 3.68/3.61 · 3.54/3.23 · 2.49/2.30
  - base code re-run (A/B/A) 4.86/4.53 · 3.68/3.62 · 3.34/3.04 · 2.49/2.42
  - after re-runs: flow-smear 3.39/3.07 and 3.49/3.15; td-feedback 5.01/4.55.
  - GL calls per method over 120 frames (`calls.mjs`) are identical before vs after for all 4 scenes, so the ±.15 ms spread is timer noise.
- **Shots:** `scratchpad/td/s1.8/sheet.png` (reference · before · after per scene): same look.

### S1.9 [x] [L] `own/reaction-diffusion.fs` + `builtin:reaction-diffusion`; plan-B gate
Depends on: S1.8, S1.4 (G3 result). **Files:** `web/src/fx/own/reaction-diffusion.fs`, `builtin.ts`, `isf.test.ts`.
**Look:** TD reaction-diffusion feedback palette; algorithm reference jsexp Gray-Scott (BSD-3, credit only). Passes: 8 step passes, all `TARGET rd` PERSISTENT FLOAT ½ (one pair after S1.8, ≈7.7 MB): A,B in .rg; Laplacian 3×3 (.05/.2/−1); `dA = Da∇²A − AB² + feed(1−A)`, `dB = Db∇²B + AB² − (kill+feed)B`, Da 1, Db .5, dt 1; `B += seed·luma(inputImage)·.02`; `reset` → A 1, B 0 plus a seed splash. P8 colour out: palette by B, hue += `palette`.
**Inputs:** seed ← sub .02/.25 0→.6 · kill ← bass .1/.6 .060→.064 · feed ← build 2/2 .0545→.040 (inverted, per S1.4's G3 result) · palette ← snare 0/.3 0→.15 · reset ← drop. **Scene:** spectrum (layer `res` .5) → reaction-diffusion.
**G5 gate:** patterns hold 60 s in half float (no die-out, no blow-up). On a miss, or p95 > 5 ms after the 8 → 6 step lever: stop and report "plan B" (a native RD filter after S2.1, design L292); the lead reorders. **Done:** gates; bench (D5 ≈3–3.5); screenshot; trace (seed on sub, feed on build, palette on snare).
**Changed during implementation:** G5 passes in half float with 6 steps. Harness `scratchpad/td/s1.9/rd.mjs` (`scene`: 2 s readback of `rd` as FLOAT; `ab`: same-session A/B); logs and shots are in `s1.9/`.
- **Seeding has a threshold.** Gray-Scott's rest state (A 1, B 0) is linearly stable, so a seed only nucleates above ≈.0034/step. Weaker seeding grows nothing (SEED .002: coverage 0 for 30 s). Stronger seeding held the spectrum's bars as a flat B flood, because sustained seeding keeps the flood state stable (v1, x1, x2 shots).
  - Fix: seed fresh A only, `·smoothstep(.5, .8, A)`. A bright patch nucleates, and once coral covers it (A < .5) the seeding stops, so the flood can't hold. A gate at (.8, 1) closed before B cleared the hump (B stalled at .09, coverage 0).
  - `SEED` stays the plan's .02.
- **seed ← sub, measured:** with the plan's 0→.6, seed moved only .287–.330 (sub .41–.56, p10–p90 .48–.52). The binding now spreads 0→.6 over sub .42–.56, i.e. min −1.8, max 2.486. The shader clamps it at `max(seed, 0)` and `bind.ts` is unchanged.
  - Seed now moves .25–.56 (p10 .27, p90 .45), r_sub .94/.95 (dnb/dub). With the sub silent, seed rests at 0 and nothing grows. `bass` was rejected: it is just as flat (relative, .43–.54) and already drives kill.
- **kill .060→.064 became .062→.064.** At feed .0545 the flat-flood state is stable below kill ≈ √F/2 − F = .0622 (the saddle-node).
  - Dubstep's styled bass is `wobble`, which rests near 0 (p90 .086), so kill sat at .060. By 60 s a flat flood filled the centre with a holes pattern around it (`g5-dub-60s.png`). dnb only held because reese parks kill at ≈.062.
  - Now it rests at the Sims coral value. Kill is as flat as seed: .0630–.0632 (dnb), .0620–.0626 (dub). That is the CP1 bass/sub offset decision. ⚠️ feed .040 (a build) with kill ≥ .062 may starve the coral; no fixture has a build to check it.
- **Bench** (dnb174, 1728×1118, scale 1, same-session A/B, med/p95 ms):
  - 8 steps: rd 4.66/5.08 (a miss) · rd+flash 5.04/5.34 · flash 2.63/2.95 · gen 2.02/2.23.
  - 6 steps: rd 4.28/4.63 · rd+flash 4.64/4.89 · flash 2.62/2.98 · gen 1.96/2.17.
  - RD's own cost ≈ (rd+flash) − flash: 2.4 ms with 8 steps, 2.0 with 6. The scene misses D5's 3–3.5 because the spectrum at res .5 alone costs 2.0. 60 s traces: p95 4.59 (dnb), 4.66 (dub).
- **G5 60 s** (final params; cov = share of `rd` texels with B > .1; every 10 s):
  - dnb cov .31 .39 .41 .56 .61 .57 .60, stdB .12–.13 throughout, maxB ≤ .60, 0 NaN, luma .16–.33.
  - dub cov .24 .41 .53 .62 .71 .69 .69, stdB .12–.13, maxB ≤ .47, 0 NaN, luma .13–.38.
  - No die-out, no blow-up, no flood. Coverage plateaus where the source never reaches.
- **Trace:** palette↔snare r .84/.83. Neither fixture has a build or drop, so feed (.0545) and reset never move. The reset splash (A 1, B .25 where luma > .5) is untested in the browser.
- **Look:** a cosine ramp by B, lit by B's own relief. The bars print parallel coral stripes and a labyrinth spreads around them. Shot `scratchpad/td/reaction-diffusion.png` (dnb, 20 s).
- Once the screen is covered, the maze is near-static except where the bars keep seeding gaps; snares turn the palette. More motion needs kill to actually swing (the CP1 decision).

**CP1 close (lead):** contact sheet `scratchpad/td/cp1-sheet.png` of the 6 scenes; reaction check on both fixtures (td-feedback zoom/kick, hue/snare, displace reese → wobble when the genre flips; RD seed/sub); bloom `__flash` ≤3/s; commit.
**CP1 Done (lead, 2026-11-05 05:3x):**
- `scratchpad/td/cp1-close.mjs` on `dnb174.wav`, Auto-style DnB. 64 s autopilot over the 6 new scenes, 16 switches: 3842 frames, **0 late**, p99 18.6 ms, governor drops 0, scale 1.00, jsMs 0.6, no page errors.
- bloom-glitch `__flash` ≤2 stamps in any 1 s.
- Contact sheet `scratchpad/td/cp1-sheet.png`.
- Reaction per coder traces (S1.2–S1.9): drums r .83–.91; reese/wobble r .52–.62.
- ⚠️ Open: relative `sub`/`bass` barely swing (ruling requested of the designer). Build/drop bindings are unexercised: no fixture has them.

### S1.10 [x] [S] relative band sources → rest at 0 (design § Ruling 2026-11-05); arrangement fixtures
**Added by the lead 2026-11-05** (design ruling, lead pick). Runs after S2.1 and before S2.2. Depends on: CP1. **Files:** `web/src/audio/features.ts` (`sub`, `reese` → `max(0, r − 1)` like `wobble`), `web/src/audio/presets.ts` (DnB drops `bass: 'reese'`; Dubstep `bass: 'wobble'` → `reese: 'wobble'`), `web/src/scenes/builtin.ts` (S1.2 displace, S1.3 edge, S1.5 twirl, S1.7 force, S1.9 kill `bass` → `reese`, ranges kept; S1.9 seed back to the plan's 0→.6; S1.3 gain and S1.5 radius unchanged), plus the matching `VJW_BIND` defaults in those `.fs` files, `features.test.ts`, `settings.test.ts`, `web/scripts/make-fx.mjs` (`arrangement()` fixtures with a build and a drop; Dubstep mixes in the existing `wobble()` stem).
**Done:** gates. New fixtures written to `scratchpad/fx_audio/`. Trace on them: sub/reese/wobble rest ≈0 and swing on the bass; build/drop fire; RD seed, td-feedback displace and edge-rings gain visibly move. No-regression A/B on two scenes.
**Changed during implementation:**
- Fixtures reuse synth.ts's existing `arrangement()` (S5.1): 16 groove bars, then an 8-bar breakdown (riser + snare roll), the drop, then 8 bars. `make-fx.mjs` writes `<genre><bpm>-arr.wav`. Dubstep adds `wobble()`, gated off over the breakdown with the same 5 ms edges. Both mixes peak over .99 and are scaled to .99; the ratio sources don't care about level.
  - DnB: 45.6 s, build 23.07 s, drop 34.10 s. Dubstep: 56.4 s, build 28.43 s, drop 42.14 s.
  - Generated through a throwaway Vitest that imports the script (Node 20 has no strip-types). The two old fixtures come out byte-identical.
- `features.test.ts`:
  - The ÷2 test now pins rest 0. The kick-hold test expects 0.
  - The sens test steps sub/reese ×2 so they read ≈.44, because a steady bed now reads 0.
  - The fixture bed test checks p50 <.1 and max <.2. The kick/gain tolerances are doubled, which is the same ratio tolerance as before.
  - New test: a bed returning after a gap reads ≥.9, then decays.
- edge-rings `gain` and light-tunnel `radius` are not widened. On the arr fixtures they swing their full range at the drop (1.030→1.080, .30→.60); body p50/p90 1.044/1.071 and .38/.53. They sit flat at rest on a steady bed, by design.
- **Found, not fixed (outside this step's files):**
  - (1) In the app the drop fires only on a coin flip with the DnB fixture: 1 of 5 runs; Dubstep fired 2 of 2. features.ts `HOLD` (0.2 s) delays `low`'s rise past arrange.ts `near` (0.2 s). `acceptance.test.ts` feeds bands.ts `held` directly, so it passes.
  - (2) RD is black at rest. With seed 0→.6 and sub resting at 0, a steady bed grows no coral: luma 0 until the first sub swell (34 s DnB, 43 s Dubstep), and seed ≤.18 doesn't nucleate. S1.9's rest ≈.3 did. Once grown, kill .062 at rest holds with no flood (coverage .34→.61, stdB ≈.13, 0 NaN over 52 s).

### S1.11 [x] [S] Tier 1 fixes from S1.10: drop window ≥ the bass hold; RD seed floor
**Added by the lead 2026-11-05** (lead pick on the S1.10 findings). Runs before S2.2. **Files:** `web/src/audio/arrange.ts` (the `near` window: derive it from `features.ts` `HOLD`, e.g. `HOLD + 0.15` s, instead of an independent 0.2 s; one shared constant, no duplicate number), an `arrange`/`acceptance` test that drives the drop through the **held** features path (today `acceptance.test.ts` feeds `bands.ts` levels straight in and misses the hold), `web/src/scenes/builtin.ts` + `web/src/fx/own/reaction-diffusion.fs` (`seed` min 0 → .3, max .6).
**Done:** gates. On `dnb174-arr.wav` and `dubstep140-arr.wav` the drop fires in 5 of 5 app runs each, with no extra drop in the groove or build. RD shows coral within ≈10 s on a steady bed and grows faster on sub swells; G5 coverage holds 60 s.
**Changed during implementation:**
- `features.ts` exports `HOLD`; arrange's default `near` is `HOLD + 0.15`.
- The test replaces `acceptance.test.ts` `inputs()` with app.ts's path: analysis.ts → features.ts → arrange, 60 fps frames on the heard clock at a given phase, kicks drained when heard (T1). §4.5 now runs on both `-arr` fixtures (Dubstep with make-fx's wobble stem) at 20 frame phases. `arrange.test.ts` keeps the `bands.ts` shortcut for its rule tests.
- Root cause, measured in that model: the hold is hop-rounded to ≈0.203 s. At 60 fps that is 12 or 13 frames, so `low` came back exactly 0.200 s or 0.217 s after the kick.
  - At the old 0.2 s window, DnB missed at 3 of 20 phases; the app's clock jitter makes it worse (1/5).
  - Dubstep passed only by luck: drums.ts reads the wobble onset as extra kicks at +0.14/+0.19 s, which refresh `kickAt`.
- With the fix, 40 of 40 runs fire once each, 0.32–0.34 s after the drop: the hold plus `sustain`, still within a DnB beat (0.345 s).
- App (5174, LOCK, whole file):
  - DnB fired 5/5 at 34.47–34.48 s, conf .80–.82. Dubstep fired 5/5 at 42.50–42.51 s, conf .74–.75. No extra drops.
  - RD on `dnb174-arr`: coral is visible at the first readback, ≈3 s after the scene switch on the groove bed (cov .22, then .47 by the build).
  - The drop resets RD to cov .11; it regrows to .65. Coverage maxed at .66, stdB .08–.14, 0 NaN over 62 s.
  - seed rests at .30 and reaches .60 on sub (r 1.00).

### CP2 — Track B(a): native filters + the history ring

### S2.1 [x] [S] engine — `Native.draw(f, v, src?)`
Depends on: none (CP1 merged first, by order). **Files:** `web/src/gl/scene.ts` (`Native`), `web/src/gl/live.ts` (`run()`: pass the previous node's texture, the chain temp an ISF filter would read as `inputImage`), `web/src/fx/catalog.ts` (the native def type takes `kind: 'filter'` and `bind`, if it doesn't already).
**Behaviour (D3):** the CP2 contract; existing natives compile unchanged (optional arg) and ignore it; the fast path holds (natives have no pass targets). A native filter draws into the layer's current output exactly as a generator does.
**Tests:** typecheck is the test; add a Vitest only if `live.ts` already loads under node (no `live.test.ts` exists today, so don't force one). **Done:** gates; no-regression bench on `builtin:tunnel` and `builtin:particles`; the proof that `src` arrives is S2.2's delayed image.
**Changed during implementation:** `catalog.ts` is untouched: `NativeDef extends EffectDef`, which already has `kind` and `bind`. The panel's picker (`Panel.tsx` `FILTERS` = `byName('filter')` over `catalog.values()`, computed once at import) lists any catalog def with `kind: 'filter'`, native or not, under its `category` ('other' without one). `fresh()` copies its `bind`, and `node()`/`warm()` build natives in any slot, so G2 holds by code; S2.2 still checks it live. There is no Vitest, because `engine.ts` reads `document` at import. `src` was proven early by harness `scratchpad/td/s2.1/s2.1.mjs`, using test-only natives (a constant gen plus an invert filter) on the direct path, at res .5 and over the tunnel: out = 255 − src, and the generator gets null.

### S2.2 [x] [L] `scenes/history.ts`: `ring()` + `native/rgba-delay` + `builtin:rgba-delay`
Depends on: S2.1. **Files:** `web/src/scenes/history.ts`, `web/src/scenes/history.test.ts`, `web/src/fx/catalog.ts` + `web/src/scenes/builtin.ts` (one entry each).
**Ring (design L272–283):** `texStorage3D(TEXTURE_2D_ARRAY, 1, RGBA8, w, h, 32)` with `[w, h] = ringSize(gl.drawingBufferWidth, gl.drawingBufferHeight)` → 864×559 (61.8 MB) at 1728×1117; allocated in `create()` (prepare-ahead runs it mid-scene), `warm()` compiles only; `push(src)` draws `src` at any size into layer `head` through one FBO + `framebufferTextureLayer`, linear; `filled` clamps ages (no black ghost); never refit by the governor. ES 3.00 fragment with `past()`; stride 1.
**G1 check (first touch):** log `drawingBufferWidth/Height` against the #stage size in 60A and 60F; if they differ, size from the first `f.width/f.height` (design Risk 4) and report.
**rgba-delay:** R,G,B = `past(uv, 0 / spread / 2·spread)`; `rotate` cycles the channel order. `kind: 'filter'`; `bind`: spread ← bass .05/.3 1→12 · rotate ← snare.
**G2 check:** the panel's add-fx picker lists the native filter and the def's `bind` defaults arrive with it. **Tests:** `slot()` (age 0 = head; wrap below 0; age = depth − 1); `ringSize` (1728×1117 → 864×559 and ≤ 64 MiB; a 3840×2160 input halves again). **Done:** gates; bench (D5 ≈1.9–2.6, tunnel → rgba-delay); screenshot; trace (spread on reese/wobble, rotate on snare); Chrome task manager GPU memory ≈ +62 MB for the scene (G6).
**Changed during implementation:**
- **Files and bindings.** `gl/engine.ts` exports its `copy` pass (one word), so `push()` reuses it instead of a duplicate shader. `spread` binds `reese`, not `bass` (ruling 2026-11-05; Dubstep Auto-style reads wobble). `rotate` is an `event` input (D1; the panel shows a trigger) bound `snare 0/.1`, not the bool convention's 0/1.5: a 1.5 s release holds it true across DnB's 0.69 s snare gap, so it would step once. live.ts writes a bound event every frame and resets it after the draw, so the native steps on the rising edge. Defaults: spread 4 (0–15, so 2·15 < 32 slots), category feedback. `builtin:rgba-delay` repeats the def's `bind` as a literal, because importing `history.ts` there would pull `engine.ts` into the doc/library tests. `warm()` = a sync `fullscreenProgram(FS)` (Start: 0 `texStorage3D` calls).
- **G1 holds**: 60A stage 1728×1118 = drawing buffer, 60F 3456×2234 = drawing buffer, ring 864×559×32 in both, so no `f.width` fallback. **G2 holds**: picker group 'feedback'; the added node carries the def's `bind`.
- **Measured** (`scratchpad/td/s2.2/`, worktree):
  - GPU: showcase p95 2.62–2.64 ms. A/B with an `own/flash` tail: tunnel → flash 2.05 vs tunnel → rgba-delay → flash 2.99 p95, so rgba-delay costs ≈.9 ms itself (D5 guessed .5).
  - Memory: the ring counts 61.8 MB. The GPU-process footprint goes up 64–66 MB and returns exactly to baseline on dispose (checked twice).
  - Fresh cut at spread 15: G holds frame 1's value through frame 16 and B through frame 31, then they move, so no black ghost. No late frames on later cuts.
  - Trace: DnB spread r .97 with reese, 1→12 on the drop, rotate 48 edges / 51 snares. Dubstep (pick dubstep): styled reese = wobble, spread swings with it (body p50 4.9 / p90 9.6), rotate 103 / 119.
- **Finding:** the session's first ring scene costs one frame, once: 51.6 → 29.7 → 25.3 ms over three runs, shrinking as the Metal shader cache warms; later fresh rings cost nothing. If the CP2 autopilot run shows it, `warm()` can draw once into a 1×1 array texture.

### S2.3 [ ] [M] `native/time-machine` + `builtin:time-machine`
Depends on: S2.2. **Files:** `history.ts`, `catalog.ts`, `builtin.ts`.
**Look:** TD time machine (circular ramp). Stride 2 (64 frames). `age = uDepth·depth·fract(rings·|uv − c| + swirl·θ/2π − phase)`, rings 2 ⚠️ taste, `c` the centre; shares `ring()` and `past()`. **Bind:** swirl ← bass .05/.3 0→1 · depth ← build 1/1 .3→1 · phase ← beat saw 0→1. **Scene:** truchet → time-machine. **Tests:** none new (GLSL only; `slot()` covers the ring). **Done:** gates; bench; screenshot; trace (the sweep locks to the beat, depth grows on a build).

### S2.4 [ ] [M] `native/slit-scan` + `builtin:slit-scan-ring`
Depends on: S2.2. **Files:** `history.ts`, `catalog.ts`, `builtin.ts`.
**Look:** TD slit scan over the ring. Stride 2. `age = span·coord + wave·sin(6.283·coord⊥ + time)`, `coord` = y, x or radius by an `axis` long input (default y). **Bind:** span ← sub .05/.5 8→31 · wave ← bass .05/.3 0→.3. **Scene:** spectrum → slit-scan, id `builtin:slit-scan-ring`: the echo-based `builtin:slit-scan` and `own/echo.fs` stay as they are (design decision 5); the parked worktree is already gone (STATE). **Done:** gates; bench; screenshot; trace (span on sub).

**CP2 close (lead):** contact sheet `cp2-sheet.png` of the 3 ring scenes; reaction check; a fade rgba-delay ↔ time-machine (forced cut or `?bench`): 0 late frames, GPU memory ≤ ≈160 MB peak with ≤2 rings live (Chrome task manager, G6); if over, drop the ring cap to 48 MiB (depth stays 32); commit.

### CP3 — Track B(b): transform-feedback points

### S3.1 [ ] [L] `scenes/points.ts`: `native/swarm` + `builtin:swarm`
Depends on: S2.1 (def `kind`/`bind`). **Files:** `web/src/scenes/points.ts`, `web/src/scenes/points.test.ts`, `catalog.ts` + `builtin.ts` (one entry each).
**Design (D4):** N = 131072 (module knob); pos/vel in TF ping-pong buffers after `web/src/scenes/particles.ts` (twgl `createTransformFeedback`, two VAOs); one pass updates and rasterises: `vel += curl(simplex3(pos·s + t·drift))·turbulence + radial·burst − drag·vel` (webgl-noise 3D simplex, MIT header), respawn hashed per `gl_VertexID` (`spawn` true → all at once); points of `size` px drawn additively into one persistent RGBA16F trail (`renderTarget(true, true)`), faded by a constant blend `ZERO, CONSTANT_ALPHA` = `trail` (the `post.ts` trick: no texture read, no ping-pong); then `createBloom` (reuse) and the `particles.ts` composite. ⚠️ point sizes 1.5–6 px are safe on ANGLE-Metal. ≈25 MB.
**Bind:** burst ← kick 0/.1 0→3 · hueStep ← snare 0/.3 0→.2 · sparkle ← hats 0/.08 0→.5 (a thin per-point flicker, not brightness) · size ← sub .05/.3 1.5→3 · turbulence ← bass .05/.4 .2→2 · trail ← build 1/2 .85→.97 · spawn ← drop. **Scene:** swarm alone, layer `res` .75.
**Tests (`points.test.ts`):** the def's `inputs` and `bind` names match and every source ∈ `SOURCE_IDS`; `swarmLayout(N)` buffer byte sizes (pure). **Done:** gates; bench (D5 1.5–2.5; lever N → 65536); screenshot; trace (burst on kick, trail on build, respawn on drop).

### S3.2 [ ] [M] `native/scatter` + `builtin:scatter`
Depends on: S3.1. **Files:** `points.ts`, `points.test.ts`, `catalog.ts` + `builtin.ts`.
**Design (D4, TD pixelRelocator):** one point per 3×3 px stage cell, grid fixed at create from the G1-checked size (≈214k); home from `gl_VertexID`; colour `texture(src, home)` in the vertex shader; `target = home + (noise − .5)·scatter`; `vel += spring·(target − pos) + burst·dir − drag·vel`; square opaque points on black. `kind: 'filter'`. 6.9 MB.
**Bind:** burst ← kick 0/.1 0→2 · size ← sub .05/.3 .9→1.4 · scatter ← bass .05/.35 0→.12 · spring ← build 1/2 40→12 (inverted, S1.4's G3 result) · explode ← drop. **Scene:** tunnel → scatter. **Tests:** `gridFor(w, h, cell)` count and the def check. **Done:** gates; bench (D5 1–1.5; lever cell 3 → 4 px); screenshot; trace (scatter on reese/wobble, spring on build).

**CP3 close (lead, spec §4.4–4.5):** contact sheet `cp3-sheet.png` of swarm + scatter; reaction check; **the closing run:** 60 s autopilot with all 11 new scenes starred in the live playlist (`scratchpad/milk-cp3.mjs` pattern): 0 late frames, governor 1.00×, GPU memory within D5 (peak ≈160 MB, Chrome task manager); `__flash` ≤3/s and a luma-std trace on both fixtures over the bloom scenes; commit.

### CP4 — the rebind pass

### S4.1 [ ] [S] the rebind pass + 3 `VJW_FLASH` keys
Depends on: S1.1 (the key); CP3 closed (order). **Files:** `web/src/scenes/builtin.ts`, `web/src/fx/own/tunnel-mesh.fs` (`"VJW_FLASH": ["flash"]`), `fractal.fs` (`["glow"]`), `wave-landscape.fs` (`["glow"]`, after re-ranging its `glow` binding so min = 0, fact 6). Four files, three are one-liners.
**Behaviour:** apply the CP4 table (design L81–105) row by row, by scene id; attack/release and ranges stay unless the row gives them; `trails-spectrum` `dischargeRate ← build 1/2 .12→.05` uses S1.4's G3 result; milk-* untouched. Net: kick 14, snare 5, sub 6, `bass` 8, build 3, hats 1, beat 1, lfo 2, onset 0, treb 0.
**Tests:** the existing builtin doc round-trip; add: no own scene binds `onset` or `treb`; every scene binding source ∈ `SOURCE_IDS`; the three keyed files parse with `flash`. **Done:** gates; `?debug` on both fixtures: kick-class params jump on kicks only, the three ⚡ scenes ≤3/s; no bench (bindings only).

**CP4 close (lead):** reaction check over the 9 formerly "on a kick" scenes (fact 8) on both fixtures; the same 60 s autopilot run again (20+ scenes changed bindings): 0 late, 1.00×; commit; STATE queue → 2b editor.

## Acceptance mapping (`thoughts/spec_td_look.md` §4)
| §4 | Proof |
|---|---|
| 1 GPU p95 ≤5 ms per new scene, gates green | every effect step's bench against its D5 budget (+ levers); S1.8 / S2.1 no-regression benches |
| 2 screenshot vs the TD reference, contact sheet per CP | every step's `scratchpad/td/<scene>.png`; CP1–CP3 close-outs |
| 3 reaction check on dnb174 / dubstep140 | every step's trace; CP close reaction checks; S4.1 + CP4 close for the old built-ins |
| 4 60 s autopilot, 0 late, 1.00×, memory in budget | CP3 close (closing run); CP2 close (two-ring fade memory); CP4 close (re-run) |
| 5 WCAG ≤3 onsets/s | S1.1 (`VJW_FLASH`), S1.4 luma trace, S4.1 keys, CP3 close `__flash` |

## Research gaps (none blocking; each is an in-step check)
- G1 drawingBuffer = stage → S2.2 (fallback `f.width/height`; S3.2 reuses the result). G2 catalog pickup → S1.2; picker lists native filters + native `bind` → S2.2. G3 inverted ranges in `evaluate()` → S1.4 (`bind.test.ts`; S1.9, S3.2, S4.1 reuse). G4 ms figures → every bench. G5 half-float RD → S1.9 gate. G6 GPU memory via Chrome task manager → CP2/CP3 close.
- ⚠️ Assumption, needs confirmation: `?bench` measures the scene on screen (as in the MilkDrop CPs); ISF `event` inputs are not in our dialect (bool used); `dryWet` .8/.7 and time-machine `rings` 2 are taste knobs; scene ids `builtin:bloom-glitch` and `builtin:slit-scan-ring` are the planner's names; layer `res` exists as a scene field (D5 uses it).
