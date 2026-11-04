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

### S1.2 [ ] [M] `own/td-feedback.fs` + `builtin:td-feedback`
Depends on: S1.1 (order only). **Files:** `web/src/fx/own/td-feedback.fs`, `web/src/scenes/builtin.ts`, `web/src/fx/isf.test.ts`.
**Look:** `feedbackTOP.tox` ex3 (research §1b). **Passes** (the `PASSES` syntax of the existing own multi-pass files; grep `PASSES` in `fx/own/`): P0 `loop` PERSISTENT FLOAT at ½: read `loop` (last frame) × `fade`, gamma, hue += `hueStep`, zoom by `zoom` about the centre, displace by simplex noise (webgl-noise, MIT header) × `displace`, 3×3 blur + Sobel edge of `inputImage` × `edge`, screen `inputImage`, soft-clip above .8; `reset` true → black. P1 out at full res: `mix(src, screen(src, loop), dryWet)` (TD dryWetMix; default .8 ⚠️ taste). ≈7.7 MB.
**Inputs / VJW_BIND (D1):** zoom ← kick 0/.25 1.012→1.035 · hueStep ← snare 0/.3 3→15 (°/frame) · edge ← hats 0/.1 .12→.3 · displace ← bass .05/.4 .01→.07 · fade ← build 1/2 .97→.99 · reset ← drop. Auto-style moves only `displace` (reese / wobble / bass).
**G2 check (first new own file):** confirm `web/src/fx/catalog.ts` picks the file up (glob import vs a list; if a list, add it) and the panel's add-fx picker shows it.
**Scene:** `builtin:td-feedback` = spectrum → td-feedback, starred (S1.4 appends bloom). **Tests:** start `NEW_OWN` in `isf.test.ts` (conventions). **Done:** gates; bench (D5 ≈3.5 with bloom, less now); screenshot; trace: zoom on kick, hue on snare, displace on reese (DnB) / wobble (Dubstep).

### S1.3 [ ] [M] `own/edge-rings.fs` + `builtin:edge-rings`
Depends on: S1.2 (test list). **Files:** `web/src/fx/own/edge-rings.fs`, `builtin.ts`, `isf.test.ts`.
**Look:** `feedbackEdge`. P0 `loop` PERSISTENT FLOAT ½: last frame × `gain` (>1, self-sustaining, so soft-clip at .8, D2 rule 3), scale about the centre by `scale`, 3×3 blur, hue += `hueStep` (negative, TD's −2°), + Sobel edge of `inputImage` × `edge`, screen `inputImage`; `reset` → black. P1 out: screen(src, loop). ≈7.7 MB.
**Inputs:** scale ← kick 0/.3 1.002→1.012 · hueStep ← snare 0/.3 −1→−8 · gain ← sub .1/.6 1.03→1.08 · edge ← bass .05/.3 .15→.4 · reset ← drop. **Scene:** tunnel → edge-rings. **Done:** gates; bench (D5 ≈2.0); screenshot; trace (gain swells on sub, rings step on snare, no white-out over 60 s of `dnb174`).

### S1.4 [ ] [M] `own/bloom.fs` + `builtin:bloom-glitch`; td-feedback gains bloom
Depends on: S1.1, S1.2. **Files:** `web/src/fx/own/bloom.fs`, `builtin.ts`, `isf.test.ts` (+ `web/src/bind.test.ts` for G3).
**Look:** `bloom.tox`; shaders ported from our `gl/bloom.ts` (Bjørge dual filter; credit the file). Targets with distinct names, FLOAT, not persistent: P0 threshold + down ½ (soft knee at `threshold`), P1–P4 down ¼ ⅛ 1/16 1/32, P5–P8 up ×4 (each samples both levels and adds), P9 composite at full res: `src + glowSum·(.4 + .3·glow + level)·tint(rampShift)`, TD's cosine-ramp tint, soft clip. ≈20.5 MB. Not a native around `createBloom` (design L290).
**Inputs:** threshold ← build 1/1 .35→.15 · glow⚡ ← kick 0/.2 0→1 · level⚡ ← drop 0/1.5 0→1 · rampShift ← bar saw 0→1. `"VJW_FLASH": ["glow", "level"]`.
**G3 check (first inverted range):** read `evaluate` in `web/src/bind.ts`; add 'evaluate lerps an inverted range (min > max)' to `bind.test.ts`. If it clamps instead, declare `tension` 0..1 and invert in-shader (`mix(.35, .15, tension)`), and report the result for S1.9, S3.2 and S4.1.
**Scenes:** `builtin:bloom-glitch` = glitch → bloom; append bloom to `builtin:td-feedback`. **Done:** gates; bench both scenes (D5 ≈2.3 / ≈3.5); screenshot; trace + the D2 luma trace on both fixtures: `__flash` ≤3 stamps per second, no onset refused on a plain 4/4.

### S1.5 [ ] [S] `own/light-tunnel.fs` (shown by S1.6's scene)
Depends on: S1.2 (test list). **Files:** `web/src/fx/own/light-tunnel.fs`, `isf.test.ts`.
**Look:** `lightTunnel` (Benson lineage). One pass: polar `r, θ` about `(centerX, .5)`; clamp/wrap `r` to `radius` (the mouth), `θ += twirl·(1 − r)`; sample `inputImage` at the remapped uv; dark falloff beyond the mouth. No targets.
**Inputs:** radius ← sub .05/.4 .3→.6 · twirl ← bass .05/.4 0→4 · centerX ← bar sine .45→.55 (a float input; no point2D component binding). **Done:** gates; a panel-built spectrum → light-tunnel: screenshot + trace (the mouth breathes on sub, the twirl on reese/wobble); the bench comes with S1.6.

### S1.6 [ ] [S] `own/radial-blur.fs` + `builtin:light-tunnel`
Depends on: S1.5. **Files:** `web/src/fx/own/radial-blur.fs`, `builtin.ts`, `isf.test.ts`.
**Look:** `radialBlur`. P0 `blur` at ½, RGBA8 (no FLOAT): 24 taps from uv toward the centre, step `strength`/24, averaged. P1 out at full res: `mix(src, blur, dryWet)` (default .7 ⚠️ taste). 3.9 MB.
**Inputs:** strength ← kick 0/.18 .04→.3. **Scene:** spectrum → light-tunnel → radial-blur, starred. **Done:** gates; bench (D5 ≈2.8 for the trio); screenshot; trace (streaks on kick).

### S1.7 [ ] [M] `own/flow-smear.fs` + `builtin:flow-smear`
Depends on: S1.2 (test list). **Files:** `web/src/fx/own/flow-smear.fs`, `builtin.ts`, `isf.test.ts`.
**Look:** `opticalFlow` TOP math, rewritten. **Donor authorised (optional):** `donor/ISF-Files/ISF/Optical Flow Generator.fs` (MIT): its flow-estimation block may be adapted; keep its licence header inside ours. Passes: P0 `flow` PERSISTENT FLOAT ⅛: luma of `inputImage` in .r, flow in .gb against last frame's .r (fact 1: a persistent pass reads its own last frame), `flow = −It·∇I / (|∇I|² + ε)`; P1 `smear` PERSISTENT FLOAT ½: `smear(uv − flow·force)·decay + src·hueRotate(tint)`; P2 out: screen(src, smear). Distinct TARGET names, so S1.8 isn't needed. ≈9.2 MB.
**Inputs:** force ← bass .05/.3 .5→3 · decay ← build 1/2 .85→.96 · tint ← hats 0/.12 0→.35 (hue rotation only, never brightness, D2 rule 2). **Scene:** tunnel → flow-smear. **Done:** gates; bench (D5 ≈2.2); screenshot; trace (smear length on reese/wobble, decay on build).

### S1.8 [ ] [S] engine — TARGET pairs by name
Depends on: none (lands right before S1.9). **Files:** `web/src/fx/isf.ts` (`pairsByTarget`, pure), `web/src/fx/isf.test.ts`, `web/src/gl/live.ts` (`node()`, `run()`, `resize()`, `freeNode()`).
**Behaviour (design L270):** `node()` builds one read/write pair per distinct `pairsByTarget` index; the first pass naming a TARGET sets FLOAT/PERSISTENT/WIDTH/HEIGHT; after any pass draws, its pair flips and `u[TARGET]` points at the newest texture (fact 1 semantics, unchanged); `resize()` and `freeNode()` visit each pair once. Files with distinct names behave exactly as before.
**Tests:** `pairsByTarget`: distinct names → identity; repeats → the first index; no TARGET → −1; mixed order. **Done:** gates; no-regression bench on two existing own multi-pass scenes (pick them by grepping `PASSES` in `fx/own/`) and on `builtin:flow-smear`; the panel's live rebuild (plan_live_rebuild) still keeps a loop alive across a param edit.

### S1.9 [ ] [L] `own/reaction-diffusion.fs` + `builtin:reaction-diffusion`; plan-B gate
Depends on: S1.8, S1.4 (G3 result). **Files:** `web/src/fx/own/reaction-diffusion.fs`, `builtin.ts`, `isf.test.ts`.
**Look:** TD reaction-diffusion feedback palette; algorithm reference jsexp Gray-Scott (BSD-3, credit only). Passes: 8 step passes, all `TARGET rd` PERSISTENT FLOAT ½ (one pair after S1.8, ≈7.7 MB): A,B in .rg; Laplacian 3×3 (.05/.2/−1); `dA = Da∇²A − AB² + feed(1−A)`, `dB = Db∇²B + AB² − (kill+feed)B`, Da 1, Db .5, dt 1; `B += seed·luma(inputImage)·.02`; `reset` → A 1, B 0 plus a seed splash. P8 colour out: palette by B, hue += `palette`.
**Inputs:** seed ← sub .02/.25 0→.6 · kill ← bass .1/.6 .060→.064 · feed ← build 2/2 .0545→.040 (inverted, per S1.4's G3 result) · palette ← snare 0/.3 0→.15 · reset ← drop. **Scene:** spectrum (layer `res` .5) → reaction-diffusion.
**G5 gate:** patterns hold 60 s in half float (no die-out, no blow-up). On a miss, or p95 > 5 ms after the 8 → 6 step lever: stop and report "plan B" (a native RD filter after S2.1, design L292); the lead reorders. **Done:** gates; bench (D5 ≈3–3.5); screenshot; trace (seed on sub, feed on build, palette on snare).

**CP1 close (lead):** contact sheet `scratchpad/td/cp1-sheet.png` of the 6 scenes; reaction check on both fixtures (td-feedback zoom/kick, hue/snare, displace reese → wobble when the genre flips; RD seed/sub); bloom `__flash` ≤3/s; commit.

### CP2 — Track B(a): native filters + the history ring

### S2.1 [ ] [S] engine — `Native.draw(f, v, src?)`
Depends on: none (CP1 merged first, by order). **Files:** `web/src/gl/scene.ts` (`Native`), `web/src/gl/live.ts` (`run()`: pass the previous node's texture, the chain temp an ISF filter would read as `inputImage`), `web/src/fx/catalog.ts` (the native def type takes `kind: 'filter'` and `bind`, if it doesn't already).
**Behaviour (D3):** the CP2 contract; existing natives compile unchanged (optional arg) and ignore it; the fast path holds (natives have no pass targets). A native filter draws into the layer's current output exactly as a generator does.
**Tests:** typecheck is the test; add a Vitest only if `live.ts` already loads under node (no `live.test.ts` exists today, so don't force one). **Done:** gates; no-regression bench on `builtin:tunnel` and `builtin:particles`; the proof that `src` arrives is S2.2's delayed image.

### S2.2 [ ] [L] `scenes/history.ts`: `ring()` + `native/rgba-delay` + `builtin:rgba-delay`
Depends on: S2.1. **Files:** `web/src/scenes/history.ts`, `web/src/scenes/history.test.ts`, `web/src/fx/catalog.ts` + `web/src/scenes/builtin.ts` (one entry each).
**Ring (design L272–283):** `texStorage3D(TEXTURE_2D_ARRAY, 1, RGBA8, w, h, 32)` with `[w, h] = ringSize(gl.drawingBufferWidth, gl.drawingBufferHeight)` → 864×559 (61.8 MB) at 1728×1117; allocated in `create()` (prepare-ahead runs it mid-scene), `warm()` compiles only; `push(src)` draws `src` at any size into layer `head` through one FBO + `framebufferTextureLayer`, linear; `filled` clamps ages (no black ghost); never refit by the governor. ES 3.00 fragment with `past()`; stride 1.
**G1 check (first touch):** log `drawingBufferWidth/Height` against the #stage size in 60A and 60F; if they differ, size from the first `f.width/f.height` (design Risk 4) and report.
**rgba-delay:** R,G,B = `past(uv, 0 / spread / 2·spread)`; `rotate` cycles the channel order. `kind: 'filter'`; `bind`: spread ← bass .05/.3 1→12 · rotate ← snare.
**G2 check:** the panel's add-fx picker lists the native filter and the def's `bind` defaults arrive with it. **Tests:** `slot()` (age 0 = head; wrap below 0; age = depth − 1); `ringSize` (1728×1117 → 864×559 and ≤ 64 MiB; a 3840×2160 input halves again). **Done:** gates; bench (D5 ≈1.9–2.6, tunnel → rgba-delay); screenshot; trace (spread on reese/wobble, rotate on snare); Chrome task manager GPU memory ≈ +62 MB for the scene (G6).

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
