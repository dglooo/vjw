# Design — Rave Lasers (RL-S2: one DnB scene, 23 emitters, up to 135 beams in haze)

## TL;DR
- One new native `native/lasers` and one built-in `builtin:rave-lasers`. Every variant shares one pure CPU rig (figures, chase, light bookkeeping) that writes ≤ 256 beam instances per frame. The variants differ only in the GPU pipeline.
- **A (recommended, simplest):** the Isobars pipeline. Instanced beam quads go into a full-res HDR target; its mip chain is the haze; one composite. ≈ 3.2–3.9 ms at 135 beams (≤ 5.1 ms in a slow-GPU session); default `truss` 3.0–3.5 ms.
- **B:** split resolution. Skirt + analytic halo at ½ res; cores added at full res. ≈ 2.0–2.6 ms (computed, no in-house anchor); new look risks.
- **C (rejected):** per-pixel beam loop. 12–20 ms; 3.5–5 ms with CPU-binned beam lists.
- The 3 signal gaps are answered in `## Codebase facts`. Two creative-spec lines cannot hold as worded (C10 second clause; the drop veil timing): see `## Decision needed`.

## Freshness
- 2026-11-15, system-designer. Brief `RL-S2-DESIGN`, source commit `7dff355`.
- Inputs: `agents/creative-director/creative_rave_lasers.md` TL;DR, §2, §3, Signal gaps, §6, §8 (L1–L16, L25–L104, L118–L130, L146–L167); `thoughts/spec_rave_lasers.md` §6 R1–R9; `agents/research/research_rave_lasers.md` §5, §6; `agents/STATE.md` HEAD.
- Code read at `7dff355`, under `web/src/`: `scenes/isobars.ts` L196–L523; `gl/scene.ts`; `gl/post.ts`; `gl/live.ts` L56–L85, L136–L147, L168–L197, L280–L324; `gl/engine.ts` L55–L114, L160–L221; `bind.ts`; `audio/features.ts` L1–L129; `audio/sync.ts` L1–L60, L120–L154; `audio/arrange.ts` L20–L59, L126–L155; `app.ts` L214–L225, L340–L369; `fx/types.ts`; `frame.ts`; `scenes/builtin.ts` L974–L1013. Other file:line references come from grep hits or from research §6.
- Not read (outside the brief's ranges): creative §1 (the quiet / loud rule), §4, §5, §7 (the stills list); `thoughts/spec_veejay_wizard.md` §4, §7. Roadmap notes rest on STATE HEAD only.
- No web source was used. Costs are measured anchors (research §5, STATE HEAD) or marked computed.
- Notation: `[F]` marks a flash-gated input (as `web/src/scenes/isobars.ts:323`).
- Split artifact (Write cap 5 KB): this file, then `design_rave_lasers.2.md` … `.9.md`. The lead joins them in numeric order.

## §1 Problem and constraints
- Problem: draw up to 135 straight beams, 64 booth rays, 2 sheets and 23 origin sprites from 23 fixed emitters, in haze, at billed +flash p95 ≤ 5 ms at 1728×1117 (R5). Hits move geometry. Full-frame brightness rises only through the flash gate (R6, creative Rule H).
- Fixed by the inputs:
  - Acceptance: R1–R9 (`spec_rave_lasers.md` §6), C1–C16 (creative §8), the 12 must-nots (creative §6).
  - Rig: emitter counts and positions are never cut. Beams per emitter may drop to the floor (creative §2.1). The floor for `full` is 93 beams (T 8×5 + S 6×3 + F 7×5) and 2×24 rays.
  - Contract: `Native` / `NativeDef` stay frozen (`web/src/gl/scene.ts:7`, `:11`). The flash gate stays as is (`web/src/gl/post.ts:46`).
  - Stack: WebGL2 + `twgl.js` 7.0.0 (MIT, installed). No variant needs a new dependency.
  - Licence: own code, credit "VeeJay Wizard". `webgl-noise` is MIT and already copied into 5 files (research §6).
- Non-goals: a drawn truss, stage or crowd (creative §2.1); a 3D camera; a techno variant (R9); a new detector (creative Signal gaps).
- Measured anchors (billed +flash p95):
  - **M1** Isobars ribbons, ≤ 8,000 segments, full-res HDR target, no haze: 1.57 ms dnb / 1.73 ms dub (research §5 b).
  - **M2** Isobars mip haze: + ≈ 1.3 ms. Total 3.76 ms in a slow-GPU session, a factor ≈ 1.3 over M1 + M2 (research §5 d).
  - **M3** per-pixel fan, 32 beams = 61.8 M segment tests: 2.9–3.9 ms, so ≥ 16–21 M tests per ms (research §5 a).
  - **M4** one simple full-res pass: 0.71 ms (stars), 1.01 ms (superformula) (STATE HEAD, wave-2 S1.1 / S1.3).

## §2 Variants
### §2.0 Shared by A, B and C: the rig (no GL)
- Files: new `web/src/scenes/lasers.ts` (def + rig + GL) and `web/src/scenes/lasers.test.ts`. Edits: `web/src/fx/catalog.ts` (+1 entry, as `isobars` at `:6`, `:24`); `web/src/scenes/builtin.ts` (+1 doc, as `:986–1006`).
- Ids: native `native/lasers`; built-in `builtin:rave-lasers`, name "Rave Lasers". `builtin:laser-grid` is not reused: it names one figure of five, and it matches the rejected `web/src/fx/own/laser-grid.fs`.
```mermaid
flowchart LR
  SRC["sources: kick snare hats sub reese build drop"] --> BIND["live.ts bindings"]
  BIND -->|pop snap flick open scissor converge climax| RIG
  BIND -->|flashGate, 3 onsets per s max| FL["[F] hit, burst"] --> RIG
  SYNC["f.sync: bar, bpm, confidence"] --> RIG
  RIG["rig.step: pure CPU"] -->|256 x 12 floats max| BUF["instance buffer"]
  RIG --> ST["laserState: harness truth"]
  BUF --> GPU["pipeline A, B or C"] --> OUT["engine target RGBA8"]
```

| Input | Type; default | Bind: source, attack / release (s) | Role |
|---|---|---|---|
| `layout` | long 0 / 1 / 2 = truss / floor / full; 0 | — | groups present (creative §2.1) |
| `green`, `white`, `red` | float 0–1; 0.7 / 0.3 / 0 | — | emitter colour shares (R3) |
| `haze` | float 0–1; 0.5 | — | haze gain (R4) |
| `open` | float 0–1 | sub, 0.04 / 0.3 | beams per emitter, spread, lit emitters |
| `scissor` | float 0–1 | reese, 0.03 / 0.15 | neighbour fans lean apart |
| `converge` | float 0–1 | build, 0.15 / 0.8 | the build ramp into the cage |
| `flick` | float 0–1 | hats, 0 / 0.18 | dark-share target, speckle depth |
| `pop` | float 0–1 | kick, 0 / 0.14 | spread ×1.3, chase jump. Geometry, not gated |
| `snap` | float 0–1 | snare, 0 / 0.11 | Grating burst, chase reverse, S pose step. Not gated |
| `climax` | float 0–1 | drop, 0 / 0.4 | drop geometry: unblank, shoot, hold. Not gated |
| `hit` [F] | float 0–1 | kick, 0 / 0.14; min 0, max 1 | core gain +40 %. Gated |
| `burst` [F] | float 0–1 | drop, 0 / 0.4; min 0, max 1 | drop brightness: `power` 1.0, white cores. Gated |
- `flash: ['hit', 'burst']`. An [F] bind rests at 0 and spans 0–1; the native applies the gain. Reason: the gate's ON line is 0.5 in output units (`web/src/gl/post.ts:34`, `:46–57`). An [F] input whose max is below 0.5 never fires; at max 0.5 it fires only at the source's peak (Isobars `hit`, `web/src/scenes/isobars.ts:332`).
- The times are the creative §3 targets; the planner may tune them. `scissor` follows wobble under Dubstep Auto with no extra code (`isobars.ts:304–305`; `web/src/bind.ts:93`).
```ts
// web/src/scenes/lasers.ts, exported for lasers.test.ts (the isobars `traceBands` precedent)
export const EMITTERS: readonly { group: 'T' | 'S' | 'F' | 'B'; x: number; y: number; max: number; floor: number }[] // 23 (creative §2.1)
export interface RigIn {
  v: Readonly<Record<string, Value>> // the bound inputs above
  bar: number; locked: boolean       // f.sync.bar; locked = bpm > 0 && confidence >= 0.3
  time: number                       // f.time: wall clock (f.dt is heat-scaled, app.ts:357)
  width: number; height: number      // px
}
export interface RigOut { n: number; light: number; core: number; haze: number; speckle: number } // instance count + 4 frame scalars
export interface LaserState {        // CPU truth for the harness (C2, C8, C11, C12, C14, C15)
  mode: 'quiet' | 'loud' | 'drop'; figure: number; step: number
  open: number; converge: number; spread: number; power: number
  lit: Uint8Array                    // lit beams per emitter, 23
  onsets: number                     // full-frame brightness onsets the native rendered
}
export interface Rig { step(x: RigIn, out: Float32Array): RigOut; state(): LaserState }
export function createRig(seed?: number): Rig
// One instance = 12 floats: x0 y0 x1 y1 (px) | w0 w1 (core half-width at each end, px) | gain0 gain1 | hot | tint | kind | fade
// tint: 0 green, 1 white, 2 red. kind: 0 beam, 1 sheet, 2 ray, 3 origin (disc + glint). fade: share of the length that fades at the tip.
```
- The native returns `laserState()` beside `draw` (the `isobarState()` precedent, `isobars.ts:365`).
- Rig rules (every variant):
  1. **One primitive.** A beam is a straight segment from its emitter to the frame exit: the ray ∩ the frame rectangle, inflated by the half-width, so the viewport clips the end. A Sheet is the same primitive with a flat-top profile and a wide `w1` (a wedge). A ray is a beam with a 1-px core and no skirt.
  2. **Depth is 2.5D.** Each beam has a `toward` value 0–1. It sets `w1 / w0` (1 → 3.5), `gain1 / gain0` and the glint (`toward` ≥ cos 10°). A 3D camera is rejected: the creative numbers are screen-space (emitter positions, square cage cells).
  3. **Blanking and chase.** An unlit beam emits no instance. The lit count per emitter is rig state. At each chase step it moves by ≤ 1 toward `round(n · (1 − 0.6 · flick))` (C14, creative §6.5). The speckle depth follows `flick` directly, so row 3's 30 ms attack still shows. Entry `shoot`: `x1 y1` runs from the emitter to the exit in ≤ 48 ms with `fade` 0.2. Exit: one instance stays at falling gain for ≤ 50 ms.
  4. **Clock.** `step = floor(bar · 8)`; 16 at `converge` ≥ 0.75 for ≤ 4 bars. The figure cuts at the bar wrap, every 2 bars (loud) or 4 bars (quiet). Not locked: 5.8 Hz and 2.8 s (creative §3). Steps and cuts apply only while a drum input was > 0.05 in the last 0.7 s (C11). Reason: the grid runs on for ≤ 16 bars of silence (`web/src/audio/sync.ts:28`, `:133`). ⚠️ Assumption, needs confirmation: the 0.7 s window.
  5. **Light bookkeeping** (the Isobars P7 precedent, `isobars.ts:467–479`). Each lit primitive gets a relative weight: emitter share ÷ its lit beams, capped at `W_MAX`. One scalar (`RigOut.light`) pins Σ weight × on-screen area (closed form) to `L0 · power`, or less where the cap binds (few-beam figures). So a chase step, a Pop, a pose step or a Grating burst cannot change the total linear light. Only three things can: `power` (slewed in the rig), `hit` (core light × (1 + 0.4 · hit)) and `burst` (`power` → 1.0, `hot` → 1).
  6. **Timers** (burst, shoot, glint, afterglow, and the 2-bar hold when not locked) latch `f.time`.
  7. **Palette.** The normalised `green` / `white` / `red` amounts are the emitter shares, seeded per figure. A beam carries `tint`; the shaders hold the 3 skirt and 3 core colours of creative §2.5.
```mermaid
sequenceDiagram
  participant AR as arrange.ts
  participant AP as app.ts and engine
  participant LV as live.ts
  participant N as native/lasers
  AR->>AP: fired = conf (0.56 or more), drop = conf x exp(-t / 1 s)
  AP->>AP: post flash, white mix 0.8 x exp(-t / 0.2 s), every scene, not in __flash
  AP->>LV: src.drop
  LV->>N: climax = drop, ungated
  LV->>N: burst = flashGate(drop), passes if under 3 onsets in the last 1 s
  N->>N: climax edge - latch time and bar, unblank all, shoot, Beam-to-crowd, 2-bar hold, ignore hit for 1 s
  N->>N: burst at 0.5 or more - power 1.0, white cores for 400 ms or more
```
```mermaid
stateDiagram-v2
  [*] --> Quiet
  Quiet --> Loud: loud on (creative §1)
  Loud --> Quiet: loud off
  Quiet --> Drop: climax edge
  Loud --> Drop: climax edge
  Drop --> Loud: after 2 bars
  note right of Loud: Figure cut every 2 bars. Chase on 8ths or 16ths. converge 0 to 1 bends the figure into the cage.
```

### Variant A — the Isobars pipeline (simplest; recommended)
- Summary: all instances draw additively into one full-res HDR target. Its mip chain gives the haze. One composite adds the smoke and tone-maps. This is `web/src/scenes/isobars.ts:482–512` with a new vertex stage and a new composite.
```mermaid
flowchart LR
  BUF["instances"] --> P1["P1 instanced quads, additive"] --> TA[("tA full-res RGBA16F with mips")]
  TA --> P2["P2 blur H"] --> P3["P3 blur V"] --> TV[("tV far haze, about 64 rows")]
  P4["P4 smoke, 2 octaves of snoise"] --> TS[("tS 1/8 res R8")]
  TA --> P5["P5 composite: beams + near tent + far, times smoke, tone map"]
  TV --> P5
  TS --> P5 --> OUT["engine target"]
```
- **P1** is one `drawArraysInstanced(TRIANGLE_STRIP, 0, 4, n)` (the `web/src/scenes/spectrum.ts:135` precedent). The VS builds the trapezoid from the instance. The FS takes the cross-section from the pixel's distance to the beam axis (flat varyings). Reason: an interpolated side coordinate kinks along a trapezoid's diagonal. The core σ is clamped to ≥ 0.6 px and its peak is scaled down by the same factor, so 1–2 px cores do not crawl.
- **P1 colour:** white core light × `hot` + the skirt colour of the `tint`. Alpha accumulates the Sheet's share; P5 deepens the smoke there (± 25 % → ± 40 %).
- **P2–P3:** the Isobars `BLUR` shader, imported (`isobars.ts:263–280`; +1 `export`). Start at ≈ 64 rows with σ 3 texels ≈ 52 px: a lone beam's far haze is then < 0.1 % of its peak at 200 px (C4). Isobars' 32 rows (σ ≈ 105 px) would leave 16 %.
- **P5:** the Isobars `COMPOSITE`, rewritten: + the smoke tap, and the tone map acts on the max channel (`c · (1 − exp(−m · E)) / m`). Reason: the per-channel form (`web/src/scenes/particles.ts:83`, research §6) moves a bright `#00FF46` skirt past hue 150° once its linear sum exceeds ≈ 1.7 (computed). That fails C13.
- **Reuse:** the native contract; the flash gate; the Isobars pass order, `BLUR`, HDR target and mip setup (`isobars.ts:341–344`, `:497–512`); `renderTarget`, `fullscreenProgram` (`web/src/gl/engine.ts:61`, `:80`); `webgl-noise` `snoise`.
- **Not reused as code:** the Isobars ribbon VS / FS (`isobars.ts:222–258`). It draws de-indexed contour segments with per-level widths; beams need instancing, trapezoid widths and an analytic cross-section. Its soft profile and its core-to-white mix carry over as a pattern.
- **Rejected reuse:** `own/bloom` as a def pass (+3.3 ms, `isobars.ts:497–498`); the `scope.ts` trail (a full-res persistent target for 3 frames of afterglow; the rig keeps 1 float per beam); `God Rays.fs` (shafts from one point, cost ∝ px × samples); `hg_sdf` (the distance to a ray is 2 lines).
- **Cost at 135 beams** (`full`, drop, every beam at `toward` 1). Fill ≈ 7–10 M px = 3.6–5.1× the frame (computed: 135 × 1200 px × 43–61 px mean support). At the M3 rate and 2 tests per fragment, P1 ≈ 0.7–1.2 ms, against ≈ 0.35–0.45 ms for a loud `truss` Fan (86 beams, ≈ 3.5 M px). Total = M1 + M2 + the fill excess ≈ **3.2–3.9 ms**; slow-GPU session (× 1.3) ≈ 4.2–5.1 ms. Default `truss`: 3.0–3.5 ms (3.9–4.6 ms slow). ⚠️ Assumption, needs confirmation: the ribbon fill inside M1 ≈ the fill of a loud `truss` Fan. Quiet (Sheet + Lone beams) fills less than a loud Fan. CPU: ≤ 3,072 floats per frame against 288,000 for Isobars (its draw CPU p95 is 1.00 ms).
- **Roadmap:** tiles work through `create(gl, size)`; widths scale with `height / 1117`. A second look later is another built-in doc on the same native. No scaffolding is added for either.
- **Risks:** A-1 the `full` drop sits on the budget line in a slow session. A-2 the blur halo has one width, so only the skirt widens toward the viewer. A-3 the 1.3 ms haze cost has no measured split (mip chain / blur / taps). **Effort: M.**

### Variant B — split resolution (cheapest)
- Summary: wide soft light at ½ res, thin hot light at full res. The same instance buffer is drawn twice; a `uPart` uniform picks the profile and the support. No blur pass and no mip chain: each beam carries its own analytic halo (20× the core, ≤ 8 % of the skirt peak), and that halo widens toward the viewer.
```mermaid
flowchart LR
  BUF["instances"] --> P1["P1 quads, glow part: skirt + halo, additive"] --> TG[("tG 1/2 res RGBA16F")]
  P2["P2 smoke"] --> TS[("tS 1/8 res R8")]
  TG --> P3["P3 composite: glow times smoke, tone map"] --> OUT["engine target"]
  TS --> P3
  BUF --> P4["P4 quads, core part: cores, rays, origins, additive"] --> OUT
```
- **Haze:** the halo is exactly 0 outside its quad, so "≤ 0.02 at 200 px" (C4) holds by construction. The lift between beams comes only from overlapping halos. The Sheet draws in P1.
- **Core-to-white:** P4 adds white core light in display space; the RGBA8 target clamps at 1. Skirts keep A's max-channel tone map, in P3.
- **Reuse:** the native contract, the flash gate, instancing, `renderTarget`, `fullscreenProgram`, `snoise`. Not reused: the Isobars `BLUR` and mip haze (the analytic halo replaces them) and the Isobars ribbon shaders (as A). Rejected as in A: `own/bloom`, the `scope.ts` trail, `God Rays.fs`, `hg_sdf`.
- **Cost at 135 beams:** P1 ≈ 3.6 M texels (135 × 1200 px × 90 px mean halo ÷ 4) ≈ 0.35–0.45 ms. P4 ≈ 2.1 M px ≈ 0.15–0.2 ms. The rest is an M1-class base (HDR target + geometry + composite) with a ½-res target and no M2. Total ≈ **2.0–2.6 ms** (2.6–3.4 ms slow). Basis: computed from M1, M3 and M4. ⚠️ Assumption, needs confirmation: no in-house anchor exists for an additive ½-res quad pass.
- **Roadmap:** as A.
- **Risks:** B-1 cores add after the tone map, so the drop can clip to flat white where cores cross bright glow (C9). B-2 no far haze: a gap wider than two halos falls to black, the mark of rejected look 1 (creative §6.1). B-3 a ½-res skirt (σ ≈ 2 texels) can shimmer on fast sweeps. B-4 two profiles and two draws are more shader code than A. **Effort: M** (above A).

### Variant C — per-pixel beam loop (rejected)
- Summary: one full-res fragment shader loops over the beams (read from a float data texture) and sums an analytic in-scatter term per beam (research §5 a, c). This is the technique of rejected attempt 1, not its look.
```mermaid
flowchart LR
  RIG["rig.step"] --> TEX["beam data texture"] --> P1["P1 fullscreen FS: sum over beams, tone map"] --> OUT["engine target"]
  RIG -.-> BIN["CPU tile lists, optional"] -.-> P1
```
- **Draws:** every item of §2.4 per pixel; the rig is unchanged.
- **Cost at 135 beams:** cost ∝ px × beams. M3 scaled from 32 beams to 199 primitives ≈ **12–20 ms**. ⚠️ Assumption, needs confirmation: the fixed ¼-res mist share inside M3 is unknown, hence the range. With CPU-binned tile lists the count per pixel falls to ≈ 10–40 at the drop: ≈ 3.5–5 ms plus the binning. The rasteriser gives A and B that binning for free.
- **Reuse:** the native contract, the flash gate; no Isobars code. **Roadmap:** as A. **Risks:** fails R5 unbinned; binned, it is the most new code and still on the budget line. **Effort: L.**

### §2.4 How each variant draws the required items
| Item | A | B | C |
|---|---|---|---|
| ≤ 135 beams (`full`) | 1 instanced draw, ≤ 256 instances | 2 instanced draws of one buffer | a loop per pixel |
| White core + coloured skirt | P1: white core × `hot` + tint skirt; HDR sum; max-channel tone map | skirt in P1 (HDR); core in P4 (display space) | per-pixel profile |
| Origin hot spot | `kind` 3 instance in P1: disc ≥ 8 px + 4-ray glint | the same instance, in P4 | a disc per emitter per pixel |
| Haze where beams pass (smooth) | near halo = 3×3 tent at the ⅛-res mip; far = blurred beams | analytic halo per beam | analytic integral |
| Swirling fog | the smoke field × the whole sum; deeper inside the Sheet | the same | noise inside the loop |
| Energy sharing | rig rule 5 | rig rule 5 | rig rule 5 |
| Beams leave the frame | rig rule 1; `fade` 0.2 for the ≤ 15 % that end inside | the same | the same |
| Blanking / chase | rig rule 3 | rig rule 3 | rig rule 3 |
| Cost at 135 beams | 3.2–3.9 ms (≤ 5.1 ms slow) | 2.0–2.6 ms, computed | 12–20 ms; 3.5–5 ms binned |

## §3 Comparison
| | A Isobars pipeline | B split resolution | C per-pixel loop |
|---|---|---|---|
| New / edited files | 2 / 3 | 2 / 2 | 2 / 2 |
| Render targets | 4 (1 full-res HDR) | 2 (none full-res) | 0 |
| Reuse of merged code | highest: pass order, `BLUR`, HDR + mips | medium: instancing only | lowest |
| Cost at 135 beams | 3.2–3.9 ms | 2.0–2.6 ms | 12–20 ms (3.5–5 ms binned) |
| Cost at 86 beams (default `truss`) | 3.0–3.5 ms | 1.9–2.4 ms | not estimated |
| Cost basis | M1 + M2 measured; fill computed | computed from M1, M3, M4 | M3 scaled |
| Budget risk | medium: `full` drop in a slow session | low | high |
| Look risk | low: HDR sum + blur haze, the Isobars glow | medium: clipped drop, no far haze | medium |
| C4 dark side (≤ 0.02 at 200 px) | by a knob (far σ) | by construction | by construction |
| Effort | M | M (above A) | L |

## §4 Recommendation
Pick **Variant A**. It adds the fewest new parts to a pipeline that already ships (Isobars). It sums light in HDR before the tone map, so the drop stays countable (C9). Its cost rests on measured anchors. Its weak point is the `full` drop in a slow-GPU session (≤ 5.1 ms). The S3 spike measures that case first, on both fixtures. If it is over budget, apply one lever per measurement, in this order:
1. **L1 trim the support** (knobs). Skirt support 2.7 → 2.2 × its half-maximum width; exit growth 3.5 → 3× (creative §2.2 allows 3–4×). Fill −20 to −30 %.
2. **L2 floor counts in `full`** (knob; allowed by creative §2.1). 135 → 93 beams, rays 32 → 24. Fill −31 %. `truss` and `floor` keep the maximum.
3. **L3 haze without the mip chain** (code). Draw the same instances again at ⅛ and 1/16 res in place of `generateMipmap`; the σ clamp keeps them alias-free. ⚠️ Assumption, needs confirmation: the saving is unmeasured (risk A-3).
4. **L4 Variant B's split** (code). The skirts move to a ½-res target.

## Decision needed
1. **Variant:** A (recommended), B or C. The line the lead records: "RL design pick = Variant A; ids `native/lasers` + `builtin:rave-lasers`; lever chain L1 → L4; the spike measures the `full` drop first."
2. **C10, second clause** ("`__flash` = 1 in the 1 s after each drop") cannot hold as worded. `hit` and `burst` are two [F] bindings with separate gate states and one shared budget (`web/src/gl/live.ts:190`, `:304`; `web/src/gl/post.ts:38`). A native cannot veto an onset the gate has counted. Proposed: the native ignores `hit` for 1 s after its drop latch, and the test reads the rendered onsets from `laserState().onsets`. `__flash` ≤ 3 per second still holds (R6).
3. **Drop veil.** The app already flashes every scene toward white at a drop: mix 0.8 · e^(−t / 0.2 s), which is 0.29 at +200 ms and 0.23 at +250 ms (`post.ts:12–13`, `:31`; `web/src/gl/engine.ts:216–218`; `web/src/app.ts:358–361`). The creative drop recipe asks ≤ 25 % and ≤ 10 %. Proposed: the scene adds no veil of its own (`burst` drives only `power` and the white cores), and the creative-director restates the veil numbers against the app flash. The alternative is an app-wide knob change (`TAU` 0.2 → 0.1 s), a Tier-2 task that touches every scene.
4. **Stills S3–S5 need the scene held.** The app cuts to the next scene on a confident drop unless hold is on (`app.ts:359`). A cut into this scene at a drop plays the drop recipe from its first frame (`climax` starts ≥ 0.5).

## Risks (ranked; Variant A)
| # | Risk | Level | Mitigation |
|---|---|---|---|
| 1 | The rig does not read as a real rig (C1; the third attempt). Not a render risk | HIGH | the rig is pure and exposes `laserState()`; the S3 sheet is the gate |
| 2 | The `full` drop exceeds 5 ms in a slow session (A-1) | MED | L1 → L4 |
| 3 | Displayed luma is not flat when the lit count changes: rule 5 pins linear light and the tone map is concave | MED | the lit-count slew (rule 3); knob: dark share 60 → 40 % |
| 4 | Decisions 2 and 3 change two creative lines | MED | a lead ruling before the test matrix |
| 5 | The drop's unblank raises displayed luma in 1 frame even when the gate refuses `burst` (same cause as 3) | LOW | ≤ 1 per 20 s (`web/src/audio/arrange.ts:53`); same frame as the app flash |
| 6 | The haze knobs miss C4 (far haze too wide, or halo too narrow for the gap lift); the halo does not widen toward the viewer (A-2) | LOW | knobs: far rows, the two haze gains; L4 gives a depth-following halo |

## Research gaps
- No measured split of the 1.3 ms Isobars haze (mip chain / blur / composite taps). L3's saving is unknown.
- No measured rate for additive quads into RGBA16F at 2–5× overdraw. The fill costs use the M3 per-pixel rate.
- The billed cost of an empty native is not in research §5; M4 stands in for it.
- R6 names a "WCAG luma cap". My inputs hold no rule or mechanism for it (`post.ts:8–13` caps only the app's gain and flash). The test-architect needs the rule.
- Creative §1 (the quiet / loud rule) and §7 (the stills list) were outside this brief. The planner reads them.

## Acceptance map (Variant A; B differs where noted)
| ID | Met by |
|---|---|
| R1, C1, C15, C16 | the rig's figures and the S3 stills gate (not a render property) |
| R2, C2 | the `EMITTERS` constant; every instance starts at an emitter (unit test on the instance buffer) |
| R3, C13 | the `green` / `white` / `red` inputs; the max-channel tone map keeps the skirt hue |
| R4, C4 | near tent + far blur (B: analytic halo). R4's value = C4's lower bound: gap luma ≥ 0.05 |
| R5 | §3 costs; the §4 lever chain |
| R6, C10 | `flash: ['hit', 'burst']`; rig rule 5; decision 2 |
| R7, C8, C9 | `climax` unblanks every emitter; `burst` sets `power` 1.0; `W_MAX` caps the cage's 14 beams; HDR sum (B: risk B-1) |
| R8, C12 | one input per row of creative §3; `laserState()` gives the bound truth. ⚠️ Assumption, needs confirmation: the hats row takes r on the bound `flick`; the rendered dark share lags it by the C14 slew |
| R9 | one built-in doc |
| C3, C5 | rig rule 1 (straight segments, `fade`); rig rule 5 weights (Lone > Fan beam > Sheet) |
| C6, C7 | white core light × `hot`; the `kind` 3 disc + glint |
| C11, C14 | rig rule 4 (drum-armed clock; `pop` / `snap` edges act in the same frame); rig rule 3 |

## Codebase facts (the creative-spec gaps G1 and G5)
- **1. Does `hats` give a 0–1 level? Yes: a 0–1 hit envelope, not a spectral level.** Each detected hat sets it to 1; it falls by 1/e per 60 ms, × sens, capped at 1 (`web/src/audio/features.ts:14`, `:105–112`; listed at `web/src/bind.ts:26`). The hits come from the 7–16 kHz detector (`web/src/audio/drums.ts:13`); real tracks give 3.7–5.4 hats a bar (`drums.ts:17`). Row 3 works with bind attack 0 / release 0.18 s; attack 0 keeps the peak (Isobars `dash`, `web/src/scenes/isobars.ts:329`). The 60 % fallback is not needed.
- **2. Does a bar-phase lock state exist? No boolean. A 0–1 confidence and a bpm exist.** Every native gets `f.sync = { bpm, beat, bar, confidence }` (`web/src/frame.ts:12`; `web/src/audio/sync.ts:7–12`). `bpm` is 0 with no grid (`sync.ts:130`). The codebase's lock line is confidence ≥ 0.3 (`LOCK`, `sync.ts:33`; `SURE`, `web/src/gl/post.ts:11`); `web/src/app.ts:340` uses `bpm > 0`. Use `locked = bpm > 0 && confidence ≥ 0.3`. Read `f.sync.bar` directly: a shaped `bar` binding is multiplied by the confidence, and its saw falls (`bind.ts:22`, `:103–104`, `:119`). The grid holds for ≤ 16 bars with no on-grid onset (`sync.ts:28`, `:132–137`).
- **3. Can a scene route only the brightness part of a hit through the flash gate? Yes.** The gate is per input: only the inputs named in the def's `flash` list pass through `flashGate` (`web/src/fx/types.ts:10–12`; `web/src/gl/live.ts:190`, `:304`). Bind two inputs to `kick`: `pop` (not listed: geometry) and `hit` (listed: brightness). Isobars binds `width` and `hit` to `kick` and lists both (`isobars.ts:323`, `:331–332`). All [F] inputs of all live layers share one budget (`live.ts:56–59`); a tile has its own (`live.ts:142`).
- Further facts for the plan:
  - `drop` = conf · e^(−t / 1 s), conf ≥ 0.56, ≥ 20 s apart (`web/src/audio/arrange.ts:53`, `:64`, `:141–149`). It crosses the gate's 0.5 line on its first frame.
  - `f.dt` is scaled by 1 + 0.5 · heat before the scene draws (`app.ts:357`).
  - A scene draws into an RGBA8 target, and the GPU timer wraps `scene.render` only (`web/src/gl/engine.ts:97`, `:173–177`).
## Skeptic response (rev 2, 2026-11-15)
- **Inputs:** `agents/architecture-skeptic/skeptic_rave_lasers.md` L1–L49; this design L26–L141, L199–L202, L204–L209, L227–L242; `agents/creative-director/creative_rave_lasers.md` L46–L57, L87–L97; `scratchpad/ed/w3s21-spike.md` L26–L51; `agents/STATE.md` HEAD.
- **Result:** 8 accept · 3 accept-modified · 0 reject. L-1 (HIGH) is closed by SR-2 and SR-3. Lead decisions (a)–(d) stand; SR-4 re-times (a). The text above is not edited. SR-2 … SR-7 replace: rules 3–6 (L90–L93), `RigIn` and `LaserState` (L68–L80), the drop sequence (L101–L107), the tone map (L134), the cost (L138), the R5–R7 rows (L234–L236). `T-Ln` = the check for finding L-n. "Rig test" = Vitest in `web/src/scenes/lasers.test.ts` on the pure rig, fed 60 frames per second. Open facts are marked ⚠️ in place and listed in SR-8 item 9.
### SR-1 Verdicts
| ID | Verdict | Change | Proof |
|---|---|---|---|
| L-1 HIGH | accept | SR-2: the chase unit is the row, and each figure has a lit floor. SR-3: the capped regime is defined, and the frame light is one rate-limited state. | T-L1a–e, rig test (SR-2, SR-3) |
| L-2 | accept | SR-6: anchors and factor restated from the spike file. L1 and L2 are defaults, not contingent. | T-L2, spike bench (SR-6) |
| L-3 | accept-modified | No probe code. A bench doc with `climax` unbound at 1 holds the drop. SR-5 gives the one rig rule that makes it hold. | T-L3, per-sample assert (SR-6) |
| L-4 | accept | SR-4: `RigIn.time` is wall clock. Every timed window is listed with its clock. | T-L4, rig test + harness (SR-4) |
| L-5 | accept | SR-7: the tone map whitens above a knee; guard m ≥ 1e-4. | T-L5, Vitest on a TS twin (SR-7) + the S6 crossing crop |
| L-6 | accept-modified | SR-5: ungated `climax` carries `power` 1.0 and the light; `burst` keeps the white cores and binds before `hit`. Modified: the light loads at the latch; it does not slew. | T-L6, rig test + the `run` log (SR-5) |
| L-7 | accept | SR-3: the light sum covers every emitted instance at its current gain. | T-L1e, read per frame (SR-3) |
| L-8 | accept | P5 adds ± 0.5 LSB triangular dither after the tone map (a hash of `gl_FragCoord` and the frame). | T-L8, S1 and S8 stills: no equal-luma run ≥ 6 px on a 200-px line across the haze |
| L-9 | accept-modified | SR-4: an index fires only when it grows; `locked` latches with hysteresis. Modified: a backward jump re-bases the index, and figure cuts use the same rule. | T-L9, rig test (SR-4) |
| L-10 | accept | `state()` returns a copy; `lit` becomes `number[]` (SR-7). | T-L10, rig test: two `state()` calls share no `lit`; a later `step()` leaves a stored `lit` unchanged |
| L-11 | accept | P1 is built through the engine `program(VS, FS)` with `layout(location = N)` attributes, not through `createProgramInfo`. ⚠️ Assumption, needs confirmation: `program()` fits an instanced draw (`engine.ts:36–43`, the skeptic's reading). | T-L11, harness: the `createProgram` call count is equal after 1 and after 10 prepare / dispose cycles |
### SR-2 Rule 3 rev 2: rows and lit floors (L-1)
- **Row** = the chase unit: an ordered list of beams. An emitter with ≥ 2 beams in the figure is one row (its fan). Emitters with 1 beam form one row per line: T (8 beams), F (7), each S tower (3). N = the beams of the row. `k` = its lit count (rig state).
- At a chase step the lit pattern moves one position along the row (`k` unchanged: a rotation). Then `k` moves by ≤ 1 toward `clamp(round(N · (1 − 0.6 · flick)), kMin, N)`.
- `kMin` by figure. Quiet figures (Sheet, Lone beams): N, and they have no chase; `flick` reaches them as speckle only. Cage: S rows N (never chased); T and F rows ceil(0.75 · N), which is 6 of 8 and 6 of 7. Every other loud row: ceil(0.4 · N) (creative L55: lit share 40–100 %).
- **I-1 (lit share).** On every frame each row has `k` ≥ `kMin`, whatever input moves it (`flick`, `open`). No row is dark. The cage keeps ≥ 75 % of each chased row and every S beam: ≥ 12 of 14 lit (`truss`), 12 of 13 (`floor`), 18 of 21 (`full`), which is ≥ 85 % of the figure. **I-2 (rotation).** A step with `k` unchanged leaves the lit count of the row and of the figure unchanged (creative L55). C14 still holds: the lit count of one emitter changes by ≤ 1 per step.
- **T-L1a–d** (rig test; locked, 174 BPM, drums armed). (a) Cage, `flick` 1 for 4 bars, each layout: on every frame Σ `lit` ≥ 12 / 12 / 18, and every S entry is 1. (b) Any chased row, `flick` 1 for ≥ 4 steps: Σ `lit` is then constant, and the lit set changes at every step. (c) Sheet + Lone beams, `flick` 1, 8 bars: `lit` is identical on every frame. (d) Grid with 1 beam per T emitter, `flick` 1: the T row keeps ≥ 4 of 8.
### SR-3 Rule 5 rev 2: one light state, two regimes (L-1, L-7)
- Per emitted instance i: weight `w_i` = min(emitter share ÷ its lit beams, `W_MAX`); `a_i` = on-screen area (closed form); `g_i` = current fade gain (`shoot` entry, exit fade; 1 when steady).
- `A` = Σ w_i · a_i · g_i over **every emitted instance**, entering and exiting ones included (L-7). `A°` = the same sum with uncapped weights. φ = A ÷ A°. **Pinned regime:** φ = 1. **Capped regime:** φ < 1: `W_MAX` binds on ≥ 1 beam (the cage, Lone beams, the Sheet, a thin Grid).
- The rig keeps one state `sum` = the total linear light of the frame. Its target is `L0 · power · φ`. `RigOut.light = sum ÷ A`. So Σ light · w_i · a_i · g_i = `sum` on every frame, in both regimes.
- `sum` moves toward its target at ≤ `SUM_RATE` = 0.4 per second (log rate). That is ≤ 0.7 % per frame, ≤ 3.5 % per 16th and ≤ 7.1 % per 8th at 174 BPM, and ≤ 8 % per 8th down to 156 BPM. ⚠️ Assumption, needs confirmation at the spike: the value 0.4.
- Three one-frame loads. The first frame of a rig and the drop latch (SR-5) load `sum = target`. A figure cut or a mode change loads `sum = min(sum, target)`: Blanking stays hard, a fall is not an onset, and no figure starts above its cap.
- **I-3 (flat light).** Outside the loads, `sum` changes by ≤ 8 % between two chase steps. The fast rises of frame light are then exactly three: `hit` and `burst` (both gated) and the drop latch. Consequences: between cuts `W_MAX` is a soft cap (when beams leave a capped figure, the other beams run hotter and settle at `SUM_RATE`); a loud-on with no detected drop swells at `SUM_RATE` and does not step.
- **T-L1e** (rig test; also L-7). Every figure and layout; `flick` switched 0 ↔ 1 on a step frame; `pop` and `snap` pulses; `hit` and `burst` at 0. The test recomputes Σ gain × area from the instance buffer, times `RigOut.light`. Outside the loads: ≤ 1 % per frame and ≤ 8 % per chase step.
### SR-4 Clocks rev 2: rules 4 and 6 (L-4, L-9)
| Clock | Source | Drives | Reason |
|---|---|---|---|
| Wall | `RigIn.time` = `performance.now() / 1000`, read once per draw by the native. The rig clamps its frame step to ≤ 0.1 s (a hidden tab, a prepare gap) | Every latch and window: `shoot` ≤ 48 ms, exit fade ≤ 50 ms, glint, afterglow, Grating burst 110 ms + 170 ms gap, white cores ≥ 400 ms, skirt return 1.2 s, the `hit` ignore, the 0.7 s drum arm, `SUM_RATE`, the `power` slew, Lone sweep, Grid shear. Not locked: steps at 5.8 Hz, 2.8 s per 2 bars | The creative times are real seconds. The flash gate counts on the app clock, not on the layer clock (`live.ts:304`) |
| Bar | `RigIn.bar` while `locked` | Chase steps (8ths; 16ths for ≤ 4 bars), figure cuts, bar 1 and bar 2 of the drop, Sheet tilt | Music time |
| Layer | `f.time`, scaled by heat and by the layer speed (`live.ts:243–245`, `:317–318`; L71 called it wall clock, which was wrong) | GL only: the smoke drift in P4. The rig has no layer-clock input | No timed contract. Heat and the layer `speed` knob act here and nowhere else in this native |
- `locked` latches in the rig: on at `conf` ≥ 0.3 with `bpm` > 0; off at `conf` < 0.2 or `bpm` = 0. Step index = floor(bar · 8) or floor(bar · 16); cut index = floor(bar). An index fires once when it exceeds the last fired index. A lock change, or a backward jump of > 1 index, re-bases the last fired index and fires nothing. Reason for the re-base: a downbeat press moves `bar` back by whole beats (`sync.ts:174`), and without it the chase would freeze for ≤ 6 steps.
- **Decision (a), re-timed.** The native ignores `hit` from the drop latch until `RigIn.time` ≥ latch + 1.0 s **and** `hit` < 0.05. Reason for the second term: the kick at + 0.86 s (174 BPM) is still at 0.37 at + 1.0 s, and applying it mid-decay renders a step. The first rendered kick is the one at + 1.38 s.
- **T-L4** (rig test). Drop latch at T. `hit` pulses at T + 0.86 s and T + 1.38 s: `onsets` + 0, then + 1. With `burst` 1: `hot` = 1 through T + 0.4 s. Not locked: 5 or 6 steps per second of `RigIn.time`. Harness (`run`): the first rendered `hit` onset after each drop is ≥ 1.0 s of media time after it.
- **T-L9** (rig test). (1) `bar` jumps − 0.06 across a step boundary: 1 step for that boundary. (2) `bar` jumps − 2 beats: 16 ± 1 steps in the next 2 bars, and no gap > 2 step periods. (3) `conf` alternates 0.29 / 0.31: `locked` does not change. (4) `bar` moves back across an integer and forward again: `figure` does not change.
### SR-5 Drop rev 2 (L-6, L-3)
- **Drop latch** = the first frame with `climax` ≥ 0.5 after a frame below it. A rig whose first frame has `climax` ≥ 0.5 latches at once (a cut into the scene at a drop). `climax` is ungated. The latch unblanks every emitter with `shoot`, sets Beam-to-crowd and `power` 1.0, loads `sum = target`, starts the `hit` ignore and adds 1 to `onsets`.
- `burst` [F] keeps one job: `hot` → 1 (white cores ≥ 400 ms). The def and the built-in doc list `burst` before `hit`, so `burst` takes the gate slot in a same-frame tie (`live.ts:178`): `flash: ['burst', 'hit']`. A refused `burst` now costs only the white cores of that drop. The spike `run` logs per drop: the allowed onsets in [t − 1 s, t], and whether `burst` reached 0.5. Lever for the lead if `burst` is refused on one of the 3 tracks: `hot` follows `climax` too, and `burst` leaves the def.
- **Why the light loads and does not slew** (the modification to L-6). The cage is capped, so the drop total is above the cage total. At `SUM_RATE` a × 2 rise takes 1.7 s, and the app's white flash is below mix 0.07 after 0.5 s. The scene would sit under its drop level for bar 1, and R7 / C9 would fail. The load adds no onset: on the same frame the app flashes every scene to white at mix 0.8, ungated and outside `__flash` (L102, L207; `w3s21-spike.md:48`: peak frame luma 0.87 at the drop edge). The load is one rise with no return (the drop holds for 2 bars), and it happens ≤ 1 time per 20 s (`arrange.ts:53`).
- **Bar 1 hold (the L-3 probe).** Bar 1 of the drop (Beam-to-crowd, every beam lit) ends at the later of two events: 1 bar after the latch; `climax` < 0.5. Live, `climax` stays ≥ 0.5 for ≤ 1.13 s (computed: source conf · e^(−t / 1 s), release 0.4 s), and 1 bar is 1.38 s at 174 BPM, so the live recipe does not change. A bench doc with `climax` unbound at 1 holds the pose. ⚠️ Assumption, needs confirmation: an unbound input reaches the native at its doc value (`agents/STATE.md` HEAD, the wave-2 S3.2 note).
- **T-L6** (rig test). `climax` 0 → 1 with `burst` 0: on the latch frame `power` = 1, Σ `lit` = the layout maximum, the light sum = L0 · φ, and `hot` = 0 on every beam. With `burst` 1: `hot` = 1 for ≥ 400 ms.
### SR-6 Cost rev 2 (L-2) and the bench (L-3)
| State | Beams | Rev 1 knobs: normal / slow (ms) | Shipped defaults: normal / slow (ms) |
|---|---|---|---|
| `truss` loud Fan (the default look) | 86 | 2.5–2.8 / 4.3–4.5 | L1: 2.4–2.7 / 4.1–4.4 |
| `truss` drop | 86 | 2.6–3.1 / 4.5–5.1 | L1: 2.5–3.0 / 4.3–4.8 |
| `full` drop | 135 → 93 | 2.9–3.6 / 4.9–5.8 | L1 + L2: 2.5–3.0 / 4.3–4.9 |
- **Anchors restated** (`w3s21-spike.md:29–31`, `:47`). Isobars without haze: 1.57 ms p95 in a normal session, 2.50 ms in a slow session (wireform reference 2.22 and 3.81 ms). Isobars with haze: 3.76 ms in a slow session. Slow ÷ normal = 1.59 (Isobars) to 1.72 (wireform). The haze costs + 1.26 ms slow, which is + 0.73–0.79 ms normal. Withdrawn: M2 as + 1.3 ms on a normal anchor, the factor 1.3, and the L138 assumption (the ribbon fill is 0.2–0.8 M px, so P1 is all excess).
- **Formula.** Normal total = (2.19–2.36) + P1. Slow total = 3.76 + P1 × (1.59–1.72). P1 at rev 1 knobs (L138), per table row: 0.35–0.45 ms, 0.45–0.76 ms (the `full` value × 86 ÷ 135), 0.7–1.2 ms. L1 = × 0.7–0.8; L2 = × 0.69. The base keeps the Isobars ribbon pass (it has no measured split), so the totals are conservative; the skeptic's 4.7–5.8 subtracts ≤ 0.1 ms. ⚠️ Assumption, needs confirmation: P1 uses the M3 rate; additive RGBA16F at 1.7–5.1 × overdraw is unmeasured.
- **Defaults from now on.** L1 is the shipped constant set for every layout: skirt support 2.2 × its half-maximum width, exit growth 3 ×. The skirt profile must reach 0 at the support edge (a Gaussian is still at 3.5 % there). L2 is the `full` layout: 93 beams, 24 rays. The `full` drop keeps ≈ 0.1 ms at the top of its slow range. The next lever is L3, then L4.
- **T-L2 / T-L3 (spike bench, the first spike task).** One session, 3 rounds, 3 held states, each next to the wireform reference: the `truss` loud cycle (`climax` unbound at 0), the `truss` drop and the `full` drop (`climax` unbound at 1). Every `gpuMs` sample carries `mode`, Σ `lit` and `fill` from `laserState()`. A drop state counts only when `mode` = drop and Σ `lit` = the layout maximum on ≥ 95 % of its samples. The session is slow when the wireform p95 ≥ 3.33 ms (1.5 × 2.22). A normal session also reports p95 × 3.81 ÷ its wireform p95, marked as a projection and not as PASS evidence. The slope in ms per M px of `fill` replaces the M3 rate.
### SR-7 Tone map rev 2 (L-5) and contract rev 2
- P5: `m = max(E.r, E.g, E.b, 1e-4)`; `out = mix(E / m, vec3(1), W · smoothstep(K0, K1, m)) · (1 − exp(−m))`. E = the linear sum after exposure. Defaults K0 1.0, K1 2.0, W 0.9, with m = 1 at the skirt peak of one loud Fan beam. ⚠️ Assumption, needs confirmation on the S6 crop: the three values. The mix adds the same amount to every channel, so the hue stays (C13).
- Computed for the skirt colour (0.1, 1, 0.38): one beam (m = 1) → saturation 0.90; one beam at × 1.4 (m = 1.4) → 0.61; a two-beam crossing (m = 2) → 0.09. **T-L5** (Vitest on the TS twin `tone()`): m = 0 gives a finite output; hue = 138.7° ± 0.5° for m from 0.1 to 8; saturation ≥ 0.6 at m ≤ 1.4 and ≤ 0.15 at m ≥ 2. The GLSL takes K0, K1 and W from the same TS constants.
```ts
export interface RigIn { v: Readonly<Record<string, Value>>; bar: number; bpm: number; conf: number; time: number; width: number; height: number }
// bar, bpm, conf = f.sync; the rig latches `locked` (SR-4). time = wall clock in s: performance.now() / 1000, never f.time.
// LaserState: + locked: boolean; + fill: number (sum of quad areas / frame area, L-2); lit: number[], a copy per call (L-10); onsets = drop latches + rendered `hit` rises. RigOut is unchanged.
export function tone(r: number, g: number, b: number): [number, number, number] // TS twin of the P5 tone map (L-5)
```
### SR-8 Changes for the plan
1. Rig chase and light: rows, `kMin`, rotation (SR-2); `sum`, φ, `SUM_RATE`, the three loads, the sum over every emitted instance (SR-3). Tests T-L1a–e.
2. Rig clocks: wall-clock `RigIn.time` (the native passes `performance.now() / 1000`), the frame-step clamp, the `locked` latch, the index re-base; `f.time` only in P4 (SR-4). Tests T-L4, T-L9.
3. Drop: the `climax` latch carries `power`, the load and `onsets`; `burst` = `hot` only, listed and bound before `hit`; the bar-1 hold; the re-timed `hit` ignore (SR-4, SR-5). Test T-L6.
4. GL: tone map rev 2 with its TS twin (T-L5); ± 0.5 LSB dither in P5 (T-L8); P1 through the engine `program()` with `layout(location = N)` (T-L11).
5. Constants: the L1 values, the skirt window to 0, `full` = 93 beams and 24 rays (SR-6).
6. Contract: `RigIn` (`bpm` and `conf` in, `locked` out), `LaserState` (`locked`, `fill`, `lit: number[]`), `tone()` (SR-7). Test T-L10.
7. Spike order: the bench first (T-L2 / T-L3), then the stills with hold on. The `run` log adds two columns per drop: `burst` refused or not, and the time of the first rendered `hit` onset.
8. Acceptance map and matrix: R5 → SR-6; R6 / C10 → `flash: ['burst', 'hit']`, I-3, decision (a) re-timed; R7 / C8 / C9 → the `climax` latch; C14 → I-1, I-2. Vitest: T-L1a–e, T-L4, T-L5, T-L6, T-L9, T-L10. Harness: T-L2, T-L3, T-L8, T-L11, the `run` log.
9. Facts to confirm at the spike (⚠️ above): an unbound input keeps its doc value; `program()` fits an instanced draw; `SUM_RATE` 0.4; K0, K1, W; the P1 fill rate.
10. Outside this epic (Tier 1, the lead's queue): Isobars has the same program leak (`isobars.ts:338`, `:514–521`).
