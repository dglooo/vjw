# Plan: GPU3D (particles TF + WebGPU splat path, 2D fluid, GLTF model chrome / glass)

> Part 1 of 20. Files in order: `plan_gpu3d.md`, `plan_gpu3d.2.md` ... `plan_gpu3d.20.md`. The lead joins them.

## TL;DR
- 5 checkpoints, 23 coder steps: CP1 particles on the TF path (`count`, growth, Bench N*) -> CP2 the WebGPU splat path in the same native -> CP3 the 2D fluid -> CP4 the GLTF model (first step: merge the passed S1-T spike) -> CP5 integration.
- Each of the 83 matrix rows has one owner: a step, S1-T or manual (§ Row owners). One row is proposed on top: M-B7, the model as layer 0. R1-R6 map in § Acceptance mapping.
- 3 demo built-ins, all unstarred: `builtin:demo-particles`, `builtin:demo-fluid`, `builtin:demo-model`.
- S1-T passed every line (lead update, 2026-11-16), so CP4 has no "re-check" marks. S2.1, S3.1 and S4.1 depend on nothing (second-lane candidates).
- 7 lead rulings are needed (§ Lead rulings needed). No user stills gate (the lead's brief).

## Freshness
- 2026-11-16, planner (Fable 5.2), source_commit master `9559aac`, brief PLAN-GPU3D-2026-11-16.
- Lead update during the task (2026-11-16): S1-T rev 1 PASS on lines 0-9, no routing; branch `worktree-agent-afd1458d462044d4c` @ `334631f`; `Native.draw` gains an optional 5th argument `blend`. CP4 and CP5 are written against it.
- Read: `thoughts/spec_gpu3d.md`; `agents/system-designer/design_gpu3d.md` L112-L120, L505-L711, L757-L780; `agents/test-architect/matrix_gpu3d.md` §1, §3, § Lead rulings; `scratchpad/gpu3d/s1p.md`, `s1w.md`, `s1t.md`; `agents/planner/plan_rave_lasers.md` L22-L30; `agents/STATE.md` HEAD.
- Read outside the brief's ranges, disclosed:
  - design L32-L38, L72-L82, L153-L190. L72 says "final paths are the planner's call". The fluid and model contracts exist only there (the fluid has no rev-1 block).
  - matrix L51-L151 by line (the grep dropped the long rows) and L185-L210 (the G-rows that the rulings hand to the planner).
- Not read: any code, `research_gpu3d.md`, the skeptic file, design L39-L71, L83-L111, L121-L152, L191-L504.
- Stale when: P-PERF1 reports (the demo's count); P-PERF3 reports (LR-2).

## Chosen variant
- `agents/system-designer/design_gpu3d.md`: Variant A (L30-L281) as amended by the rev-1 blocks (L505-L711), plus item 1 of § Variant C rev 1 (L686-L702): a WebGPU compute-splat path of the same particle native, with TF as the fallback.
- Chosen by the lead on 2026-11-16: design § Lead rulings, recheck round, "FINAL PICK" (L780); logged in `agents/STATE.md` HEAD L14. S1-T confirmed A (no fallback A').
- Not planned, because not ordered: the 3D particle fluid (MLS-MPM), Variant B, a ping-pong particle sim, any Windows-only draw path (C11).
## Conventions
`agents/planner/plan_camera.md` § Conventions (L20-L30) applies as written, through `plan_rave_lasers.md` L23: the gates, the headless rule, the dev-server ports, "restart Vite after any `web/src` edit", the test-ID tags. GPU3D differences:
- **Names:** `Sx.y` = coder step y of checkpoint CPx. SDLC stages are written "SDLC S2" ... "SDLC S7". The matrix phases (`S5.P` ...) are not step names.
- **Step size:** one coder dispatch, 45-75 min, a fresh context. Every browser harness runs headless (user rule).
- **Branch:** every step starts in a fresh worktree from `master` HEAD. Two steps also use a spike:
  - S2.2 takes one file from S1-W by path (`git checkout 55d06ba -- <path>`). The S1-W branch is not merged.
  - S4.1 merges the S1-T branch `worktree-agent-afd1458d462044d4c` @ `334631f` (lead update, 2026-11-16).
- **Harnesses:** directory `scratchpad/gpu3d/` in the MAIN checkout; file names and bases per matrix §1 (L25-L32). A harness file grows by modes; each step names its modes. Every mode accepts the argument list of its matrix command. If the sandbox refuses the write, the coder writes in its worktree and reports the path (`plan_rave_lasers.md` L26).
- **Harness access:** a Playwright init script that wraps GL / WebGPU prototype methods (the pattern of S1-T instrument 2, design L623), or `import('/src/...')` on the dev server. A DEV-only hook (`import.meta.env.DEV`) is allowed only when a row cannot be read otherwise; the step report names it.
- **Port and fixtures:** the lane port from the lead's brief (matrix: 5176, later 5177), never 5173. Fixtures and session class: matrix §1 (L34-L41).
- **GPU bench:** alone on the GPU. PASS evidence only in the slow class (wireform+flash p95 >= 3.33 ms in the same session) and on an Apple `metal-3` adapter. Otherwise the number is a projection (R6-PRE: UNKNOWN). Every record carries the P-REC fields.
- **Evidence:** a coder run is coder evidence. A row is PASS only from the lead's run of the matrix command (port swapped) after the merge, and again at SDLC S6 on the final commit.
- **New Vitest row:** the matrix ID starts the test title; `npx vitest run -t "<ID>"` selects it. The matrix file paths are proposals (matrix G6); the paths in this plan are final. The coder sees the row RED once under its matrix `bad_input` (temporary edit, reverted).
- **Thresholds:** values marked "(proposed)" in the matrix are adopted as written, except I-BUNDLE1's 1 KB (LR-4).
- **RED rule:** `plan_rave_lasers.md` L30 as written: fix in the step only if the root-cause fix takes <= ~15 min; otherwise stop and the lead routes it. Nobody edits a threshold.
- **Done line:** "Gates" = `cd web && npm run lint && npm run typecheck && npm test`, exit 0 x 3, test count not lower than at the step base (G-GATE).
- **Reports:** plan against reality drift is marked `**Changed during implementation:** <what and why>`.
- No step adds a roadmap feature (spec_gpu3d §3).
## Planner-fixed names and policies (matrix rulings G6, G7)
| Item | Value | Rows |
|---|---|---|
| Demo built-ins | `builtin:demo-particles`, `builtin:demo-fluid`, `builtin:demo-model`; all `star: false` | I-LIB1 |
| New audio bindings | `builtin:demo-fluid`: `force <- sub` (0.4..1.6). `builtin:demo-model`: `speed <- sub` (0.5..2). `builtin:demo-particles`: none new (it copies the document of `builtin:particles`) | I-B4 |
| `count` input | NaN -> 65 536; else `Math.round` (half up), clamp 0..1 048 576; a tile draws min(n, 4096) | P-U2, P-U3 |
| Splat count encoding | R = count & 255, G = count >> 8, count saturated at 65 535. B of texel (0, 0) = frame index mod 256 (the marker; the look reads R and G only) | P-B5, P-B6, P-B7 |
| `samples` | `v >= 4 ? 4 : 1` (3 -> 1, NaN -> 1); not bindable | M-U2, I-B3 |
| Fluid clamp | `V_MAX = 1000` per component, in the port's velocity units: every impulse from `splats()` and every velocity write | F-U4, F-B1 |
| Fluid events | kick -> 1 splat with an impulse; hat -> 1 dye-only splat at `HAT_SCALE = 0.5` x radius; drop -> `RING_N = 8` splats on one circle, impulses outward; silence -> none | F-U1, F-U2, F-U3 |
| Fluid values | `force` 0..2 (1), `radius` 0..1 (0.25), `curl` 0..50 (30), `fade` 0..4 (1). Constants `SIM = 128`, `DYE = 1024`, `PRESSURE_ITER = 20` | F-PERF1 |
| Model values | as merged from S1-T (`glass`, `samples` and the spike's other values). The demo needs `speed` (animation speed gain, 0..4, default 1); S4.3 adds it if the merged native lacks it | M-U2, I-B4 |
| Model assets | folder `web/public/models/` + `manifest.json` (fields `file`, `title`, `author`, `licence`, `source`, `fetched`) | M-U6 |
| Paths | `web/src/scenes/particles.ts`, `web/src/gpu/splat.ts`, `web/src/scenes/fluid.ts`. From S1-T: `web/src/three/host.ts`, `web/src/three/three.d.ts`, `web/src/scenes/model.ts`, `web/src/gl/glstate.ts`. Test files as the matrix commands name them | all |

- ⚠️ Assumption, needs confirmation (LR-1): the fluid's value list and the model's `speed` value are planner proposals. In the ranges read, the design names no value beyond `count`, `glass` and `samples`.

## Open code facts (RG)
No code was read for this plan (brief). The coder resolves each fact at its step with graphify, as the lead ruled for RG-1 / RG-2 on 2026-11-16. None blocks the plan. If a fact contradicts a step, the coder stops and reports.
- RG-2 (S4.4): how a native declares a value that cannot be bound (`samples`).
- RG-4 (S1.3): a tile instance = `create()` received a `size` (matrix P-U2).
- RG-5 (S2.1, S2.4): where the governor reads its cost, where the debug read-out shows `gpuMs`, and how a native reports a term with no change to `Native`.
- RG-6 (S3.1): the shape of `f.onsets`, and which field carries a drop for one frame.
- RG-7 (S1.6): the call that prepares and cuts to a given scene id. The demos are unstarred, so the autopilot never picks them.
- RG-8 (several): the native registry, the editor catalog, the built-in list (`web/src/scenes/builtin.ts` per `plan_rave_lasers.md` L25), the THIRD_PARTY file, the tile-bake module, and which of the named test files exist already.
- RG-9 (S4.6): how the engine's direct path treats layer 0 (s1t.md L34: straight alpha goes into acc).
- Closed: RG-1 (ruling N1). RG-3, the layer's blend inside a native: `Native.draw`'s 5th argument (S1-T).
## Checkpoints

### CP1 - particles on the TF path (S1.1-S1.6)
The thinnest slice: audio in -> the existing particle native reacts, now with a `count` value.

**Frozen contract** (`web/src/scenes/particles.ts`, and one engine line):
```ts
export const COUNT_DEFAULT = 65536, COUNT_MAX = 1048576, TILE_MAX = 4096;
/** Points drawn. NaN -> COUNT_DEFAULT; else Math.round, clamp 0..COUNT_MAX; tile -> min(n, TILE_MAX). Pure. */
export function particleCount(count: number, tile: boolean): number;
/** max(capacity, next power of two >= n). Pure. Never shrinks. */
export function grownCapacity(capacity: number, n: number): number;

// gl/scene.ts - contract drift from S1-T (lead update, 2026-11-16): one optional 5th argument.
//   Native.draw(f, v, src?, s?, blend?)      // gl/live.ts passes l.blend
```
- The `blend` argument lands with S4.1 (the merge of `334631f`). The natives of CP1-CP3 ignore it. No step adds another argument to `Native.draw`. LR-3: dispatch S4.1 during CP1, so that this line is true at the CP1 close.
- `native/particles` has the value `count` (default 65 536). n = `count` at any layer res and governor scale (N1). `builtin:particles` still draws 65 536 points.
- Seeding is a GPU hash of `gl_VertexID` for ids >= `seeded`. Growth runs in a task between frames.
- `builtin:demo-particles` exists, unstarred, at `count` = N*_shipped.
- Bench record (P-REC): `pointsDrawn`, `count`, `res`, `scale`, `look`, `sessionClass`, `refP95`, plus `adapter { vendor, architecture }`.

**Demo:** `cd web && npm run dev`, open http://localhost:5173/, load a track, Start, open the Library, pick `demo-particles`. The cloud bursts on each kick. Lower and raise `count` in the panel: the cloud thins and thickens with no stall.

**Close (lead):** merge, Gates, then P-PERF1, P-REC, R6-PRE, P-R5-1, P-R5-2, P-B1, P-B3, P-B2, P-B4, P-B10, P-B11. Fill R1 record lines 1 and 2.

### CP2 - the splat path in the same native (S2.1-S2.4)
**Frozen contract** (`web/src/gpu/splat.ts`, the only module that touches `navigator.gpu`; the names follow the S1-W file where it has them):
```ts
export function splatDevice(): Promise<GPUDevice | null>;    // memoised per page; null = absent or lost
export interface SplatPath {
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;       // count as data, alphaMode 'opaque'
  readonly particles: GPUBuffer; readonly counts: GPUBuffer;  // harness readback only
  readonly index: number;                                     // frame index of the last submit
  /** clear, integrate + atomicAdd, resolve. u = the uniforms that the TF pass takes. */
  frame(n: number, w: number, h: number, u: SplatUniforms): void;
  webgpuMs(): number | undefined;                             // p95 of timestamp-query; undefined without the feature
  dispose(): void;                                            // this instance's buffers, never the device
}
export function createSplat(device: GPUDevice): SplatPath;
```
- Encoding: § Planner-fixed names and policies.
- Path rule in `particles.ts`: splat when a device is ready and n >= `SPLAT_MIN`; otherwise TF. The document, the bindings and the built-in never name the API.
- Governor cost = `gpuMs` + the WebGPU term (N4). A frame with no report uses 0.

**Demo:** as CP1, then set `count` to 1 048 576: a million points, still at 60 fps. Fallback: `node scratchpad/gpu3d/g3-webgpu.mjs lost 5176` prints that TF draws within 1 s after the device is destroyed.

**Close (lead):** merge, Gates, then P-PERF2, P-PERF3, P-PERF4, P-B5, P-B6, P-B7, P-B8, P-B9. Rule LR-2. Fill R1 record line 3.
### CP3 - the 2D fluid layer (S3.1-S3.3)
**Frozen contract** (`web/src/scenes/fluid.ts`; design L165-L168):
```ts
export interface Splat { x: number; y: number; dx: number; dy: number; rgb: [number, number, number]; radius: number }
export const V_MAX = 1000, RING_N = 8, HAT_SCALE = 0.5;
/** Pure, no Math.random: kick -> impulse, drop -> ring burst, hats -> small dye, silence -> []. */
export function splats(s: Sources, f: FrameInput, v: Values): Splat[];
```
- `native/fluid` with the values of § Planner-fixed names and policies. `builtin:demo-fluid`, unstarred, binds `force <- sub`.

**Demo:** `npm run dev`, Start, Library, `demo-fluid`: ink bursts on each kick, small puffs on the hats, one ring on the drop.

**Close (lead):** merge, Gates, then F-PERF1, F-B1, F-B2, F-LAT, F-B3.

### CP4 - the GLTF model layer (S4.1-S4.7)
S1-T rev 1 passed lines 0-9 (`scratchpad/gpu3d/s1t.md` @ `334631f`): chrome 2.07 ms and glass 2.07 ms billed p95 at 1 sample; 4 samples = 4.85 ms.

**Frozen contract:**
- The S1-T files as merged by S4.1: `web/src/three/host.ts` (the only importer of `three`, exactly `0.187.0`; types in `web/src/three/three.d.ts`), `web/src/scenes/model.ts` (`native/model`), `web/src/gl/glstate.ts` (`glState`, `diff`).
- Restore: after `resetState()`, every render restores the 13 fields of `RENDER_LIST` in `host.ts` (s1t.md L27-L28). Load-time entries restore the full snapshot. Host rule 3 rev 1 is corrected: our ambient UNPACK_ALIGNMENT is 1, not the GL default.
- **Diff rule:** a step that changes the material, the model file or the host's GL calls runs `node scratchpad/gpu3d/s1t.mjs diff <port>` (S1-T lines 0 and 1) and reports diff = {}.
- `modelSamples(v): 1 | 4` = `v >= 4 ? 4 : 1`. Lifecycle = design L558-L569: `hidden()` is true until Ready; `warm()` returns the memoised load; `dispose()` frees only the instance's render target.
- Alpha: straight under `normal`, premultiplied colour under the other 6 blends (N3), chosen by the `blend` argument. As layer 0, the model equals the same model over a black layer.
- `web/public/models/manifest.json` lists every shipped model with its licence and source. `builtin:demo-model`, unstarred, binds `speed <- sub`.

**Demo:** `npm run dev`, Start, Library, `demo-model`: the animal moves, in chrome, over the layer below. Set `glass` to 1: glass, and the layer below shows through undisplaced. The Network panel shows the three chunk only after the model first appears.

**Close (lead):** merge, Gates, then M-B1-M-B6, the `layer0` check (M-B7, proposed), M-PERF2, I-GOV1, I-BUNDLE1, I-BUNDLE2, I-LC3. Send the M-V1 stills to the user as information.

### CP5 - integration (S5.1-S5.3)
**Frozen contract:** none new. The contracts of CP1-CP4 are final.

**Demo:** `npm run dev`, put the three demo layers in one scene in the editor, record 10 s, play the file: all three layers are in the video.

**Close (lead):** merge, Gates, then I-GL2, I-LC1, I-LC2, I-B2, I-B1, I-SHADER1, I-B4, I-REC1, I-CL1. Then SDLC S6 on the final commit.
## Steps
Status: `[ ]` open, `[x]` merged by the lead.

### S1.1 [x] Bench harness and pre-change baselines
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** the bench exists, and both baselines are captured before any product edit.
- **Files (scratch only):** `scratchpad/gpu3d/g3-bench.mjs` (base `s1p-bench.mjs`), `scratchpad/gpu3d/g3-state.mjs` (new).
- **Behaviour:**
  1. `g3-bench.mjs pin <port> <rounds>`: `builtin:particles` as shipped, dnb174-arr live, `own/flash` tail, scale-1 samples only, rounds x 3 s, re-seeked after the drop. Output: per round billed p95 and median, the band (max - min of the round p95s), mean luma, the P-REC fields, the adapter.
  2. `pointsDrawn` = the `count` argument of the native's `drawArrays(POINTS, ...)`, read in a 1-frame probe before the timing rounds.
  3. `g3-bench.mjs check <out.json>`: exit 1 when a P-REC field is missing or not numeric (`look` may be `'as-shipped'`). When the adapter is not Apple `metal-3`, it writes class UNKNOWN and no PASS line.
  4. `g3-state.mjs seeddist capture <port>`: the 65 536 start positions of the unchanged build -> `scratchpad/gpu3d/seed-pre.json`.
  5. Run `pin` on the base commit -> `scratchpad/gpu3d/pin-pre.out.json`.
- **Tests:** Vitest: none (no product code). Rows: P-REC and R6-PRE (the `check` mode; show exit 1 on a copy with one field deleted), P-R5-1 (the baseline half; the lead runs `pin` again at the CP1 close and at SDLC S6).
- **Done:** Gates (tree unchanged). Both JSON files written. `check` exits 0 on `pin-pre.out.json`. The session class is in the report.
- **Base / depends:** master / none. **New deps:** none.
- **Changed during implementation:**
  - `sessionClass` is the string `'slow'` or `'normal'`. `check` accepts it only when it matches `refP95` (>= 3.33 = slow). The plan's literal rule ("numeric") would fail every record.
  - `check` exits 2 when the class is UNKNOWN (adapter not apple / `metal-3`, or no WebGPU adapter). The plan gives no exit code for that case. Exit 0 = PASS line, exit 1 = a field is missing.
  - The record also has `countFrom`. Before S1.3 the native has no `count` input, so `count` = `pointsDrawn` (`'drawn (no count input)'`). After S1.3 it reads the value (`'value'`).
  - `seeddist capture` wraps `bufferData` around one `create(gl)` call at the stage size. It records the first non-zero `Float32Array` that the call uploads. It does not go through the app's scene path.
  - Files are in the worktree's `scratchpad/gpu3d/` (the lead copies them out). The port is 5175 (the lead's brief).
  - Between-session noise is larger than the within-run band. Three `pin` sessions on `f6b482d` gave pooled p95 5.29 / 5.32 / 5.18 ms (spread 0.14) and round bands 0.13 / 0.09 / 0.05. P-R5-1 against `pin-pre` (band 0.09) would fail `pin-pre2` with no code change. The lead rules on the band; the threshold is not edited here.

### S1.2 [x] GPU-hash seeding, allocation by size
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** `create()` fills no CPU array (C8), and the start distribution stays the same.
- **Files:** `web/src/scenes/particles.ts`, `web/src/scenes/particles.test.ts`, `scratchpad/gpu3d/g3-state.mjs` (mode `seeddist`).
- **Behaviour:**
  1. Before editing, read the CPU seed law (`particles.ts` L103-L110 per matrix G1). The GPU law must match it: the same domain (a disc, r in [0.06, 0.72] per P-B1) and the same radius law.
  2. `create()` allocates the TF buffers by size only, capacity 65 536.
  3. The TF pass takes a uniform `seeded`. A point with `gl_VertexID >= seeded` starts from a hash of `gl_VertexID`; the others integrate as today.
  4. After a pass over n points, `seeded = max(seeded, n)`. It is a high-water mark: an id is seeded once.
  5. Nothing else changes: 65 536 points, the same physics, look and uniforms.
- **Tests:** P-U5 (Vitest, fake `gl`; reuse an existing fake if the test tree has one). P-R5-2: `g3-state.mjs seeddist <port>` = two-sample KS on the radii, `seed-pre.json` against a readback of the first frame; D <= 0.011.
- **Waiver:** the frozen-pair gate does not apply to `builtin:particles` (matrix ruling G1).
- **Done:** Gates. P-R5-2 prints D. One headless still of `builtin:particles`.
- **Base / depends:** master / S1.1. **New deps:** none.
- **Changed during implementation:**
  - The GLSL uniform is `uSeeded` (int), after the shader's `u` prefix. The JS high-water mark in `create()` is `seeded`.
  - A tile instance keeps its 4 096-point buffers (the existing rule `size ? 4096 : N`). Capacity 65 536 applies to the stage instance, which is P-U5's fixture "create() at the default count". S1.3 owns the tile cap.
  - The seed reuses the shader's `hash()` with two new streams (angle, radius). They are independent of `r1` / `r2`, so a point starts away from its home radius, as with the CPU seed (the start-up settle stays).
  - `seeddist <port>`: one `create()` at the stage size, then one `draw()` at dt 0. The first pass seeds and moves nothing, so its TF output (`posOut`, index 0) is the start disc; `getBufferSubData` reads it back. It does not go through the app's scene path (as `seeddist capture`). `capture` finds no non-zero upload on this build (n 0, exit 1): it is for pre-change builds only.
  - For S1.4 (P-B1): the GPU sample's rMin is 0.0599999937 (float32 0.06 × |(cos a, sin a)|), 6e-9 under the domain floor 0.06. A strict P-B1 check reads such a point as out of domain; a float tolerance (about 1e-6) does not. The lead rules; nothing is edited here.
### S1.3 [x] The `count` value and the pure count rule
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** n = `count` (N1), with the tile cap.
- **Files:** `web/src/scenes/particles.ts`, `web/src/scenes/particles.test.ts`.
- **Behaviour:**
  1. Export `COUNT_DEFAULT`, `COUNT_MAX`, `TILE_MAX` and `particleCount()` as in CP1's contract.
  2. `native/particles` gains the bindable value `count` (default 65 536, range 0..1 048 576). `burst`, `swirl`, `size` and `glow` stay.
  3. The TF pass and the draw cover `min(particleCount(v.count, tile), capacity)` points. `tile` = RG-4.
  4. n does not read the layer res or the governor scale.
- **Tests:** P-U2, P-U3, P-U4 (Vitest).
- **Done:** Gates.
- **Base / depends:** master / S1.2. **New deps:** none.
- **Changed during implementation:**
  - RG-4 resolved: a tile = `create()` received a `size` (`live.ts` `tile()` passes it, the stage passes none). Capacity = `TILE_MAX` on a tile, `COUNT_DEFAULT` on the stage, until S1.4's growth.
  - `count` is a `float` input (the panel slider; step = range / 100). A `long` input is a menu in this codebase. `particleCount()` rounds the value.
  - P-U2 at this step: a tile's 4 096-point capacity also caps the draw. So the matrix bad input (no tile cap in `particleCount`) turns the row RED on its pure line `particleCount(1048576, true)`; the two draw lines catch a draw that ignores `count`.
  - P-U4 also checks that `builtin:particles` binds nothing to `count` (a binding would move the drawn count) and that one fake-GL frame of its values draws 65 536.

### S1.4 [x] Growth between frames
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** any `count` up to 1 048 576 draws, and no allocation runs inside a stage frame (C8, N6).
- **Files:** `web/src/scenes/particles.ts`, `web/src/scenes/particles.test.ts`, `scratchpad/gpu3d/g3-state.mjs` (mode `grow`).
- **Behaviour:**
  1. Export `grownCapacity()` as in CP1's contract.
  2. A frame that asks for n > capacity draws `capacity` points and schedules one task (`setTimeout(..., 0)`; at most one pending per instance).
  3. The task does nothing on a disposed instance. Otherwise it allocates the new buffers by size, copies the live state with `copyBufferSubData`, swaps, deletes the old buffers and sets `capacity = grownCapacity(capacity, n)`.
  4. The task unbinds the transform-feedback object before the copy. It leaves COPY_READ_BUFFER and COPY_WRITE_BUFFER unbound after it (N6).
  5. `seeded` does not change, so the new ids take hash seeds in the next pass.
  6. Capacity never shrinks before `dispose()`. `dispose()` deletes the current buffers.
- **Tests:**
  - P-U6 (Vitest, pure).
  - P-U1 (Vitest, fake `gl`, fake timers): after the task, the `drawArrays` count === `count` at res 1, at res 0.5 and at scale 0.6, for 65 536 and for 1 048 576.
  - `g3-state.mjs grow <port>`: P-B1 (after growth to 131 072 the first 65 536 entries are bit-identical; the new ids are inside the disc) and P-B3 (the 4 bindings are equal before and after; `getError()` = NO_ERROR). P-B3 uses 4 inline `getParameter` calls, so it does not wait for the instrument of S4.1.
- **Report:** the real buffer count, format and bytes at 1 048 576 (the design's 33.5 MB is computed).
- **Done:** Gates. The `grow` line passes.
- **Base / depends:** master / S1.3. **New deps:** none.
- **Changed during implementation:**
  - `alloc()` passes `{ numElements: cap }` to twgl's `createBufferInfoFromArrays`. Without it, twgl reads `BUFFER_SIZE` back (`getBufferParameter`, 2 per allocation). That call is a sync wait on the GPU process, which zero-fills the new buffers: 3.0 to 21.9 ms of main thread per growth to 1 048 576 (`s14-diag.log`). With the argument the task takes 0 to 0.2 ms (`s14-diag-fix.log`). `create()` loses the same wait. It is margin, not the reason for the live result: `s14-live.mjs` reads 0 late frames at the growth also without the argument (`s14-live-nonum.log`), because the wait fits in the idle part of the frame in this session.
  - The task copies both ping-pong pairs (4 `copyBufferSubData` calls, 8 B x old capacity each), so `cur` stays valid without a choice of the live pair.
  - "Does nothing on a disposed instance" = `clearTimeout` in `dispose()`: the task never runs. P-U6 checks it.
  - The task restores the frame's ARRAY_BUFFER binding (one `getParameter`). twgl's VAO setup leaves a TF buffer there. Between frames the binding is the engine's triangle buffer (P-B3 `before`: bound), so the `null` of `create()` would show in P-B3's diff.
  - The task grows to `grownCapacity(capacity, n)`, n = the count of the frame that scheduled it. A higher count asked while it is pending grows in the next task.
  - `grow` catches the growth callback (`window.setTimeout` wrapped during the draw) and runs it itself, so no app frame runs between its reads. P-U6 checks the scheduling (`vi.getTimerCount()` = 1).
  - P-B1 also checks that the buffers read after growth are new and that the old ids keep their positions at dt 0 (no re-seed). Both matrix bad inputs read RED: copy skipped = 131 072 / 131 072 differing floats (pos / vel); `seeded` reset = 131 072 moved. P-B3 bad input (no COPY unbind): diff `["COPY_WRITE"]`, and the next draw gets INVALID_OPERATION (1282).
  - The panel slider step for `count` (S1.3 note) is not changed: it needs an optional `step` on `Input` (CP1 effects contract) and a `Panel.tsx` change, outside this step's files. `particleCount()` rounds the 10 485.76 step.
  - Buffers at 1 048 576: 4 (pos + vel of 2 ping-pong pairs), float32 vec2 = 8 B per point, 8 388 608 B each, 33 554 432 B total (the design's 33.5 MB). In a growth from 65 536 the old 4 x 524 288 B live until the same task frees them: peak 35 651 584 B.
  - Harness files are in the worktree's `scratchpad/gpu3d/` (lane 2 edits the main `g3-state.mjs`: copy out the self-contained `if (MODE === 'grow') {...}` block, its header lines and the usage text). `s13-count.mjs` has the S1.4 cases (2 000 000 -> 1 048 576, 131 073 -> 131 073). `s14-live.mjs` is the brief's growth-to-1 M check on the app path.
### S1.5 [x] `builtin:demo-particles` and Bench N*
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** the particle demo ships at the measured N*_shipped (C2, N2).
- **Files:** `web/src/scenes/builtin.ts`, `web/src/library.test.ts`, `web/src/scenes/particles.ts` (header note only), `scratchpad/gpu3d/g3-bench.mjs` (mode `nstar`).
- **Behaviour:**
  1. `builtin:demo-particles` = the document of `builtin:particles`, copied, with `star: false` and `count` 65 536 as the placeholder (matrix G10).
  2. `g3-bench.mjs nstar <port> <rounds> <sec>`: N in {65 536, 131 072, 196 608} x res in {1, 0.5}, the demo as shipped, `own/flash` tail.
  3. N*_shipped = the largest N whose every round has billed p95 <= 5.00 ms. If both res give the same N, take res 1.
  4. Run it alone. Set the demo's `count` and res to the result. If no row passes, stop and report.
  5. Header note in `particles.ts`: a `count` above N*_shipped is L-class and is never starred.
- **Tests:**
  - I-LIB1 (Vitest): every id of the gpu3d list is unstarred and absent from `playlist()`. The list is `['builtin:demo-particles']` now. S3.2 and S4.7 append one id each; S4.7 asserts exactly 3.
  - P-PERF1: the coder's run sets the count; the lead's run is the record.
- **Done:** Gates. The `nstar` JSON passes `check`.
- **Base / depends:** master / S1.4, S1.1. **New deps:** none.
- **Changed during implementation:**
  - **First pass: stopped at behaviour 4, no candidate row of the plan's set passes** (resolved by LR-2 part 1, last bullets). Final code (integer hash, below), `s15-nstar-int.*`, alone, slow class (refP95 3.72), apple / metal-3, billed p95 per round:

    | count | res | points drawn | round p95 (ms) | all p95 / med | row |
    |---|---|---|---|---|---|
    | 65 536 | 1 | 65 536 | 6.19 / 4.84 / 5.86 | 5.89 / 3.87 | FAIL |
    | 65 536 | 0.5 | 65 536 | 5.35 / 5.08 / 5.29 | 5.29 / 4.55 | FAIL |
    | 131 072 | 1 | 131 072 | 9.22 / 7.91 / 7.56 | 8.32 / 6.67 | FAIL |
    | 131 072 | 0.5 | 131 072 | 7.00 / 6.89 / 7.14 | 7.10 / 6.28 | FAIL |
    | 196 608 | 1 | 196 608 | 10.85 / 10.41 / 10.22 | 10.64 / 8.36 | FAIL |
    | 196 608 | 0.5 | 196 608 | 8.74 / 8.36 / 8.60 | 8.67 / 7.46 | FAIL |
    | 1 048 576 | 1 | 1 048 576 | 14.58 / 14.93 / 15.46 | 14.93 / 11.71 | L-class record |
    | 1 048 576 | 0.5 | 1 048 576 | 22.13 / 22.18 / 20.77 | 22.13 / 19.40 | L-class record |

    The run before the hash switch (`s15-nstar.*`, refP95 3.72) reads the same: 65 536 at res 0.5 = 5.26 / 4.97 / 5.27. 65 536 at res 0.5 is `builtin:particles` itself, which bills 5.16-5.33 in every pin since S1.1. The demo keeps the placeholder (65 536, res 0.5). The `nstar` JSON has a top-level `rec` only for an N*_shipped, so `check` exits 1 on it by design. Each row carries its own P-REC record; `check` on a row gives PASS.
  - Diagnostic outside the plan's N set (`COUNTS=32768,49152`, `s15-nstar-int-diag.*`, refP95 3.80): 32 768 at res 1 = 4.61 / 4.44 / 4.39, at res 0.5 = 3.94 / 3.85 / 3.89; 49 152 at res 1 = 5.35 / 5.24 / 5.18 (FAIL), at res 0.5 = 4.64 / 4.67 / 4.75. With the set extended, N*_shipped = 49 152 at res 0.5 (all p95 4.66), and `check` gives PASS.
  - At 1 048 576, res 0.5 bills more than res 1 (p95 22.1 against 14.9; median 19.4 against 11.7), in every round of both runs. Up to 196 608, res 0.5 is the cheaper one. ⚠️ The cause is not verified (one guess: the half-size target holds 4x the points per GPU tile).
  - Harness `nstar`: env `COUNTS` (first default: the plan's 3 counts + 1 048 576 as the L-class record row; LR-2 extends it, below). `governor.reset()` 2 s after each cut and 0.5 s before the samples, so the samples start at the pin's music time (governed = 0 in every row). `pin` keeps its procedure and its output shape. The harness writes `nstar-<tag>.out.json`; the evidence files are renamed `s15-*`.
  - Ring check (lead ruling S1.2): the 1 M still in the break (t 29.5 s, `s15-1m-calm-crop.png`) shows a sharp bright ring at the disc's inner edge. Cause: in float32 the sin hash puts 65 % of ids on a 1/256 grid, and 0.25 % get r1 = 0 exactly; those sit on the home-radius floor (2 602 ids at 1 M, against about 8 under the smooth law; `s15-ring-cpu.log`). **The 4 per-id streams (r1, r2, seed angle, seed radius) now use an integer hash, `idHash()` (PCG, Jarzynski & Olano 2020).** The respawn is keyed by `uTime` and keeps `hash()`. This touches the shader, outside the step's file note ("header note only"); the S1.2 ruling orders it.
  - After the switch: the ring is gone (`s15-1m-calm-int-crop.png`). The seed's grid share falls from 64.80 % to 0.16 % (CPU pre-change sample: 0.18 %). P-R5-2: KS D 0.00609 before, 0.00626 after, both <= 0.011 (PASS). Pin (coder run): p95 5.24, luma 0.3617, against pin-pre 5.32 / 0.3661, inside the 0.17 ms / 0.01 bands.
  - `g3-state.mjs seeddist` also prints the 1/256 grid share (information, no threshold).
  - I-LIB1's list is `['builtin:demo-fluid', 'builtin:demo-particles']`: S3.2 ran first.
  - **Lead ruling LR-2 part 1 (2026-11-16):** the Bench N* set is extended downward and the rule applies as written. **N*_shipped = 49 152 at res 0.5.** The demo ships `count` 49 152 at res 0.5. The `nstar` default set is now 32 768, 49 152, 65 536, 131 072, 196 608, plus 1 048 576 as the L-class record, so the matrix command alone gives the record. Confirmation run (`COUNTS=32768,49152,65536`, `s15-nstar-final.*`, alone, slow class refP95 3.79, apple / metal-3): 49 152 at res 0.5 = 4.67 / 4.64 / 4.68 (all p95 4.67, median 4.24), points drawn 49 152. 49 152 at res 1 = 5.19 / 5.28 / 5.22 (FAIL). 65 536 at res 0.5 = 5.26 / 5.16 / 5.20 (FAIL). 32 768 passes at both res. `check` on that JSON exits 0 (P-REC PASS, top-level `rec` = the 49 152 / 0.5 row).
  - **R1, TF part (for the R1 record):** line 1, N*_shipped = 49 152 at res 0.5, billed p95 4.67 ms (alone, slow class). Line 2, 1 048 576 is L-class: billed p95 14.9 ms at res 1 and 22.1 ms at res 0.5 (`s15-nstar-int.*`). The inversion (res 0.5 costs more than res 1 at 1 M only) has an unchecked cause. The full R1 claim waits for splat row B (S2.4, LR-2 part 2).
  - **`builtin:particles` (starred, 65 536 at res 0.5) bills 5.2-5.3 ms** (every pin since S1.1: 5.16-5.33; `s15-pin` 5.24). This overshoot of the 5.0 ms budget by about 0.3 ms is pre-existing. CP1 does not change it (R5: the pin stays inside its band). This epic has no fix for it. The header note in `particles.ts` records it.

### S1.6 [x] Run harnesses for the R1 record
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** the lead can run the 60 s, the cut and the 1 M records.
- **Files (scratch only):** `scratchpad/gpu3d/g3-60s.mjs` (base `cp4-60s.mjs`; modes `particles`, `crossfade-1m`), `scratchpad/gpu3d/g3-cut.mjs`, `scratchpad/gpu3d/g3-bench.mjs` (mode `run tf`).
- **Behaviour:** each mode follows its matrix row.
  1. P-B10: the demo at its shipped count, 60 s, governor on.
  2. P-B11: a shipped starred scene -> the demo at 1 048 576 -> back, 60 s; late frames and `minScale` recorded.
  3. P-B2: 10 cuts into the demo (RG-7), at the shipped count and at 1 048 576. If it fails at 1 048 576, report: the design's lever (one grown buffer set cached per context) is not built.
  4. P-B4: the demo at 1 048 576 on TF, alone. The matrix `2` (px) argument is accepted, recorded and not applied: no px knob ships (LR-5).
- **Tests:** Vitest: none. Rows: P-B2, P-B4, P-B10, P-B11. The coder runs each mode once and reports the numbers.
- **Done:** Gates (tree unchanged). Each mode exits 0 and writes a JSON that passes `check`.
- **Base / depends:** master / S1.5. **New deps:** none.
- **Changed during implementation:**
  - `g3-60s.mjs` and `g3-cut.mjs` are 2-line forwards into `g3-bench.mjs`, which holds the new modes `60s`, `cut` and `run`. All GPU3D benches share one page setup, the live-analysis check, the session reference and the P-REC record. The base `cp4-60s.mjs` gives the per-frame rAF recorder and the late rule (delta > 1.5 x the window's median delta). The matrix commands run as written.
  - `pin` and `nstar` call the shared helpers `go`, `sample`, `probe` and `adapter`. Their procedure is unchanged: smoke `s16-smoke-pin` gives p95 5.05 and governed 0. A failed run now exits 1; before, a run that printed `FAILED` exited 0.
  - Each new JSON has a top-level `rec`, so `check` applies. `refP95` comes from 3 rounds of `test:wireform+flash` after the window (the nstar procedure). `rec.scale` = the window's `minScale`. The cut JSON's `rec` = the shipped case; each case also has its own `rec`.
  - RG-7: the cut call is `director.cut(director.peek())`, the app's autopilot drop cut to the prepared next scene. Playlist [`builtin:tunnel`, `builtin:spectrum`, demo], hold on. Prepare-ahead (`app.ts` L377) builds the demo at the cut to spectrum. The next cut draws it, and the cut after that frees it. A prepare = one `native/particles` `create()` call (wrapped). The growth = the `copyBufferSubData` calls (wrapped).
  - P-B11 fades `builtin:tunnel` (the first starred built-in) into the demo and back with `director.next()` (the autopilot's fade), at 20 s and at 40 s. The demo at 1 048 576 keeps its shipped res .5. P-B4 runs at res 1 (matrix fixture); `px` 2 is in `rec.px`, with `pxApplied: false`.
  - Results (coder runs; all alone; slow class, refP95 4.27-4.30; apple / metal-3; `1ffd511`; port 5175):
    - P-B10 PASS: 0 late / 3 599, `minScale` 1, 0 governor steps.
    - P-B11 record: 0 late / 3 601, `minScale` 1, 0 steps. The growth runs in the gap 1 frame after the fade-in, and that frame is 16.7 ms. The demo's gpuMs (no tail) is med 11.59 / p95 13.48.
    - P-B2 PASS at both counts: 10 prepares each, 0 late per prepare, `minScale` 1. The lever (one grown buffer set per context) is not needed.
    - P-B4 record: billed p95 14.69 / med 11.84 ms, 0 late / 3 599 at 1.00x, 1 048 576 drawn.
  - Runs not used, kept as evidence:
    - `s16-pb2-first9`: the first cut landed in row 0, which has no delta, so only 9 prepares were counted. Fixed: 0.5 s before the first cut.
    - `s16-pb11-first`: its `gpu` field mixed in stale gpuMs from frames after the demo stopped. Now `gpuD` covers the demo's phase only.
    - `s16-pb10-first`: alone, run before those two fixes; the same result.
    - `s16-pb10-overlap`: OVERLAP, 4 Playwright Chromes from another lane.
    - The first pin smoke failed on the cold Vite cache: the first load stepped the governor, and `pin` has no reset.
### S2.1 [x] The WebGPU term in the governor
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** the governor and the billed figure see WebGPU work (N4).
- **Files:** `web/src/quality.ts`, `web/src/quality.test.ts`.
- **Behaviour:**
  1. The governor's cost input = `gpuMs` + the WebGPU term in ms.
  2. The term is reported per frame. RG-5 picks the call; the proposed name is `noteWebgpuMs(ms)`. A frame with no report uses 0.
  3. The late-frame rule does not depend on the term.
  4. The debug read-out shows `gpuMs` (unchanged) and `webgpuMs` as two figures, so a bench can add their p95s.
- **Tests:** P-U7, P-U8 (Vitest). One more plain test: a frame without a report reads 0.
- **Done:** Gates.
- **Base / depends:** master / none. **New deps:** none.
- **Changed during implementation:** RG-5 fact: the governor had no GPU cost input. It reads only the rAF delta (the late rule) and the JS time (the CPU-bound veto). `gpuMs` is the engine's per-scene map (`gl/engine.ts:144`); the panel hint and the benches read it, the governor never did. So the cost input is new: `frame(now, jsMs, gpuMs = 0)` + the read-out `governor.gpuCostMs` = gpuMs + webgpuMs. No rule reads it (item 3). The term call is the module export `noteWebgpuMs(ms)` in `quality.ts`. A native imports it with no change to `Native` and no import of `app.ts` (that would be a cycle: app → fx/catalog → scenes/particles). Reports in one frame add up (two splat layers). The read-out is `governor.webgpuMs`, per frame, beside the engine's `gpuMs` (unchanged). Open, not in this step's files: `app.ts:399` passes no `gpuMs` yet, so in the app `gpuCostMs` = `webgpuMs` until a step passes `gpuMs.get(id)`. The bench's billed figure (S2.4) needs no wire: it adds the two p95s.

### S2.2 [x] The splat module in the product tree
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** the S1-W compute splat becomes `web/src/gpu/splat.ts` with CP2's contract.
- **Files:** `web/src/gpu/splat.ts`, `scratchpad/gpu3d/g3-webgpu.mjs` (base `s1w-stage2.mjs`; modes `conserve`, `pile`), `web/package.json` only under the types rule.
- **Source:** `git checkout 55d06ba -- web/src/gpu/splat.ts` (our own spike code). Take only this file. `web/s1w.html` and the spike's `native/gpu-splat` stay on the spike branch.
- **Behaviour:**
  1. `splatDevice()`: one `requestDevice` per page, memoised. It resolves `null`, with no throw, when `navigator.gpu` is absent, the adapter is null or the device is lost. It asks for `timestamp-query` only if the adapter has it.
  2. `createSplat(device)`: a particle storage buffer that the compute pass updates in place. The physics is the TF path's physics, in WGSL. The seeds use the hash law of S1.2.
  3. Buffers are created and grown between frames, never inside `frame()`. The particle buffer grows with `grownCapacity()`.
  4. `frame()`: `clearBuffer` on the count buffer, then integrate + 1 `atomicAdd` per particle (a 1 x 1 footprint), then the resolve. The count buffer is `u32`, w x h; a size change rebuilds it.
  5. The resolve writes the encoding of § Planner-fixed names and policies into an opaque canvas.
  6. `webgpuMs()`: p95 over a rolling window, from pass-end timestamps only (s1w.md § Findings); `undefined` without the feature.
  7. `dispose()` never destroys the device.
- **Types rule:** if `tsc` already knows `GPUDevice`, add nothing. Else reuse what `55d06ba` used. Else add the devDependency `@webgpu/types` and record its licence from its `package.json` (⚠️ Assumption, needs confirmation: BSD-3-Clause).
- **Tests:** Vitest: none (GPU code; the pure path rule is S2.3's). `g3-webgpu.mjs conserve <port>` (P-B6) and `pile <port>` (P-B7). The harness loads the module with `import('/src/gpu/splat.ts')` on the dev server.
- **Done:** Gates. Both lines pass. `npm run build` succeeds.
- **Base / depends:** master + the file from `55d06ba` / S1.4. **New deps:** at most `@webgpu/types` (dev).
- **Changed during implementation:**
  - Types: `tsc` (TS 6.0.3 lib.dom) knows `GPUDevice`, so nothing is added: no `@webgpu/types`, `package.json` unchanged. The spike's two local declares (`GPUBufferUsage`, `GPUMapMode`) and its `getContext('webgpu')` cast stay in `splat.ts`.
  - Item 3 also covers the count buffer: a new w x h schedules the same between-frames build (setTimeout 0, at most one pending). Until it runs, `frame()` runs min(n, capacity) at the built size (the canvas keeps that size; `copy()` scales it). Before the first build there is nothing to draw: the first `frame()` after `createSplat()` submits nothing and `index` stays 0. S2.3 draws TF for a frame whose `index` did not move.
  - `webgpuMs()` = marker-pass end -> resolve end, p95 of the last 120 frames (the governor's window). It does not contain Chrome's canvas snapshot at `texImage2D` (s1w.md: 0.35 ms at 1 M, res 1), because the contract has no call after the copy. S2.4 decides whether the bill needs that term.
  - `grownCapacity` is imported from `scenes/particles.ts`. When S2.3 imports `splat.ts` from `particles.ts`, the two modules form an import cycle. The cycle is safe at runtime (a function declaration, called only inside `frame()` work), but a dynamic `import()` in S2.3 avoids it. `SPRING` (40) and `DRAG` (3) are copied into the WGSL as literals: `particles.ts` keeps them private.
  - The harness writes in this worktree's `scratchpad/gpu3d/` (the brief's evidence rule); the lead copies `g3-webgpu.mjs` to the main checkout.
  - Coder runs (port 5175, private cacheDir, alone, adapter apple / metal-3; class n/a: exact-integer rows, no timing gate): P-B6 PASS (inside 29 216 = count sum 29 216 = canvas R + 256 G sum 29 216); P-B7 PASS (one lit texel = 65 535, count buffer 1 048 576 there, wraps 0). RED once each: clear after resolve -> count sum 0; `& 65535u` wrap -> lit 0.
### S2.3 [x] The splat path inside `native/particles`
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** one particle native with two paths; TF is the fallback (design § Variant C rev 1).
- **Files:** `web/src/scenes/particles.ts`, `web/src/scenes/particles.test.ts`, `scratchpad/gpu3d/g3-webgpu.mjs` (modes `marker`, `lost`, `nogpu`).
- **Behaviour:**
  1. Pure rule `useSplat(n, deviceReady)`: true when `deviceReady` and n >= `SPLAT_MIN` (262 144 until S2.4 sets it).
  2. The native calls `splatDevice()` the first time n >= `SPLAT_MIN`, never before. `draw` never awaits.
  3. While the device is pending, the TF path draws `capacity` points and schedules no growth. When the device resolves `null`, the TF rules of S1.4 apply.
  4. Splat frame: `splat.frame(...)` -> copy the canvas into a GL texture with the milk `copy()` pattern (`milkdrop/native.ts`; reuse it) -> one GLSL pass decodes R and G into the count and feeds the native's existing look chain in place of the POINTS draw. Reference for the copy step: the spike's `native/gpu-splat` (`git show 55d06ba`).
  5. The count buffer follows the size of this instance's target. Tiles stay on TF (n <= 4096).
  6. On `device.lost` the device is dead for the page (no retry). Every instance draws TF from its next frame. State is not carried between the paths; the switch reseeds.
  7. No availability flag enters the document or the engine.
- **Tests:**
  - Vitest: `useSplat` (a plain test; no matrix row).
  - `g3-webgpu.mjs marker <port> 600` (P-B5): B of texel (0, 0), read on the GL side, equals `index` mod 256 in the same rAF, 600 of 600.
  - `g3-webgpu.mjs lost <port>` (P-B8) and `nogpu <port>` (P-B9).
- **Done:** Gates. The three lines pass. One headless still of the demo at 1 048 576.
- **Base / depends:** master / S2.2, S1.5. **New deps:** none.
- **Changed during implementation:**
  - Name: `useSplat` is `shouldSplat(n, deviceReady)`. ESLint's `react-hooks/rules-of-hooks` reads every `use*` call as a React hook: 2 errors in `draw`, more in the test callbacks. `SPLAT_MIN` (262 144) is exported beside it.
  - Device state is module-level, once per page: `ask()` = dynamic `import('../gpu/splat')` + `splatDevice()`, on the first draw that wants >= `SPLAT_MIN` (tiles never ask). `device.lost` sets it to null for the page. TF schedules growth only when `!shouldSplat(want, device !== null)` (no WebGPU, lost, or below `SPLAT_MIN`). While the device is pending, and on a splat frame whose `index` did not move, TF draws its capacity.
  - Copy: milk `copy()` is not called. It draws a LINEAR, Y-flipped texture over the bound target, and its texture is shared by every milk layer. `particles.ts` reuses its upload pattern on an own NEAREST texture per instance, made on the first splat frame (`texSubImage2D` at an equal size, `texImage2D` at a new size). The decode pass flips Y and reads `texelFetch` (S2.2 ruling 4), scaled while a count-buffer rebuild is pending.
  - Look (the plan names none): the decode writes count x the TF calm colour (0.06, 0.125, 0.5) x `uGain` into the HDR target, then the same bloom and composite. `uGain` = one TF sprite's energy, (π/12) x 1.08 x s², s = size x height/1000 x (0.6 + 0.4 bass + 0.4 pulse). So the brightness per point matches TF at any res, and size, bass and beat still move it. No heat colour: a count carries none (design § Variant C rev 1, "a per-particle colour needs more atomics").
  - Reseed: the splat path is disposed whenever the rule says TF, and a new one seeds itself. TF sets `seeded = 0` on its first frame after a splat frame.
  - Tests: a `beforeAll` in `particles.test.ts` lets Node's device resolve null (no WebGPU), so P-U1..P-U6 keep the S1.4 rules under `-t`. Two plain tests: "S2.3 shouldSplat" and "S2.3 while the device is pending" (a fresh module through `vi.resetModules`). RED once each: `n > SPLAT_MIN`; growth while pending.
  - Harness: `g3-webgpu.mjs` app modes `marker [port] [frames] [tag]`, `lost [port] [tag]`, `nogpu [port] [tag]`. They use init-script instrumentation, no DEV hook. P-B5 compares the GL-read B with the last 48-byte uniform write (u32 11 = `index`) AND its rAF timestamp. The lag-1 bad input (upload before `splat.frame()`) shows as `otherRaf` 600/600, because B then matches the stale index; so the same-rAF timestamp is part of the PASS line.
  - Coder runs (port 5175, private cacheDir, alone, `20c7b4f`, test:demo-1048576 = the demo at 1 048 576, res .5): P-B5 PASS 600/600, lag 0, same rAF, indices consecutive, stage luma .56. P-B8 PASS: TF from the next frame (8 ms), luma .0875 then .29 then .66 at 1 048 576 after the growth, 0 uploads after TF, reloads 0, pageerror 0. P-B9 PASS: TF draws 1 048 576, luma .625, WebGPU calls 0, pageerror 0. RED once each (`s23-red-*`): P-B5 lag 1 -> `otherRaf` 600; P-B8 no lost handler -> luma 0, no TF; P-B9 0 points when the device is null -> luma 0.
  - Frame time, not a bench (alone, no tail, no snapshot term, no class): 1 048 576 at res .5 on the splat path = GL `gpuMs` p95 2.45 + `webgpuMs` p95 1.51 = 3.96 ms; 0 late / 300 rAF; scale 1.
  - Stills `s23-1m-drop.png`, `s23-1m-calm.png` (the S1.5 moments; splat uploads in the probe frame, no POINTS draw). `npm run build`: `splat.ts` is a lazy chunk (6.36 kB, 3.19 kB gzip); the entry has no `navigator.gpu`.

### S2.4 [x] The WebGPU budget, rows A and B, `SPLAT_MIN`
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** the splat path is billed honestly, and the sweep sets where it takes over (N4, matrix ruling G2).
- **Files:** `web/src/scenes/particles.ts`, `scratchpad/gpu3d/g3-bench.mjs` (modes `splat-a`, `splat-b`), `scratchpad/gpu3d/g3-60s.mjs` (mode `splat`).
- **Behaviour:**
  1. Every splat frame reports `splat.webgpuMs()` to the term of S2.1. Without `timestamp-query` it reports nothing.
  2. `splat-a 1048576 1 <port>` (row A): the bare layer + `own/flash`, res 1. "Bare" = a DEV-only switch that skips the look. Billed = `gpuMs` p95 + `webgpuMs` p95.
  3. `splat-b <port> <rounds>` (row B): the demo as shipped, res in {1, 0.5}, N in {262 144, 524 288, 1 048 576}. Each point records the splat sum and the TF billed p95.
  4. `SPLAT_MIN` = the smallest swept N whose splat sum is <= the TF figure at the demo's res. If there is none, set `SPLAT_MIN = Infinity` and report.
  5. `g3-60s.mjs splat 1048576 <port>`: 60 s; the copy call on the main thread, p95 and max.
  6. The demo's `count` does not change in this step. LR-2 decides it.
- **Tests:** Vitest: none new. Rows: P-PERF2, P-PERF3, P-PERF4. The coder runs them alone; the lead's runs are the record.
- **Done:** Gates. The three JSON files pass `check`. The report carries the sweep table and the chosen `SPLAT_MIN`.
- **Base / depends:** master / S2.1, S2.3, S1.6. **New deps:** none.
- **Changed during implementation:**
  - Item 1: a splat frame (its `index` moved) calls `noteWebgpuMs(webgpuMs() + SNAPSHOT_MS)`. `webgpuMs()` undefined (no `timestamp-query`, or no timing yet) reports nothing. `SNAPSHOT_MS` = 1.05 ms, a constant (lead ruling S2.2 notes 2): the snapshot p95 of the alone row A at 1 M, res .5 (the demo's res). Res 1 reads 1.8-2.0.
  - RG-5 (lead ruling): `app.ts:399` passes `gpuMs.get(id)`. `app.ts` is outside the step's file list; the ruling names the line. No governor rule reads `gpuCostMs`.
  - Bare (item 2): `import.meta.env.DEV && globalThis.vjwBare`, set by the harness. The splat frame decodes straight into the engine's target and skips bloom + composite. `npm run build`: 0 files in `dist/` contain `vjwBare`. This is the step's only DEV hook.
  - Harness: in the worktree's `scratchpad/gpu3d/` (the lead copies `g3-bench.mjs` and `g3-60s.mjs` to the main checkout). Modes: `splat-a <count> <res> [port] [rounds] [tag]`, `splat-b [port] [rounds] [tag]`, `60s splat <count> [port] [tag]`. An init script reads the splat's own timestamp maps (the `webgpuMs()` samples), the uniform n, and the main-thread ms of each upload of a WebGPU canvas. After that upload it submits the S1-W post-copy marker: a `loadOp: 'load'` render pass on the canvas texture, with its end timestamp in a harness query set. snapshot = marker end - the latest resolve end before it (one device clock; a pair > 8 ms apart is dropped as unpaired). Billed = gpuMs p95 (own/flash tail) + WebGPU p95 + snapshot p95.
  - Row B's TF figure is measured in the same page after `device.destroy()` (the product's lost path, P-B8), so both paths share the session reference. `check` accepts `look: 'bare'` (row A's record). Diagnostic env knobs (not matrix commands): `ARGS` (extra Chrome flags), `NO60=1` (row A without its 60 s window).
  - Results (coder runs, `b8c489e` + this diff, port 5175, apple / metal-3, slow class). Row A ran alone. Every row-B and 60 s run was stamped OVERLAP (max 3 Playwright Chromes: another lane), so those are projections. Totals = billed p95 (ms):

    | row | res | gpuMs | WebGPU | snapshot | total | run |
    |---|---|---|---|---|---|---|
    | A bare 1 M | 1 | 2.72 | 2.36 | 1.97 | **7.05** | alone, ref 3.78 |
    | A bare 1 M | .5 | 2.24 | 1.51 | 1.05 | **4.80** | alone, ref 3.89 |
    | B shipped 1 M | 1 | 5.41 / 5.47 | 2.42 / 3.54 | 1.64 / 1.77 | **9.47 / 10.78** | OVERLAP x 2, ref 3.83 / 5.81 |
    | B shipped 1 M | .5 | 2.99 / 3.28 | 1.51 / 2.69 | 0.98 / 2.23 | **5.48 / 8.20** | OVERLAP x 2 |

    - Sweep (splat billed vs TF billed, run 1 / run 2): 256 K res 1 8.82 / 9.41 vs 13.32 / 13.95; 256 K res .5 5.40 / 7.03 vs 13.63 / 11.83; 512 K res 1 9.07 / 9.81 vs 14.04 / 13.64; 512 K res .5 5.61 / 7.11 vs 19.69 / 20.53; 1 M res 1 9.47 / 10.78 vs 15.41 / 14.78; 1 M res .5 5.48 / 8.20 vs 22.00 / 20.92. No splat point reads <= 5.00 ms. Splat beats TF at every point, by >= 3.8 ms.
    - `SPLAT_MIN` = 262 144, confirmed: the smallest swept N already wins at res .5, in both sweeps. The sweep has no N below 262 144, so the true crossover may be lower.
    - P-PERF2 RED (coder run): row A at res 1 = 7.05 > 5.00. The matrix form without the snapshot (5.08) is also > 5.00. The 60 s window passes: 0 late / 3599 at 1.00x, 0 governor steps. Root cause not isolated within the RED rule's ~15 min. The S1-W 4.84 does not reproduce: same Chrome 157.0.8103.51 and same size, but the snapshot reads med 1.05 / p95 1.97 against S1-W's 0.34 / 0.35. S1-W's flags (`--enable-unsafe-webgpu --use-angle=metal`) do not change it (`s24-diag-flags`: med 1.01 / p95 1.71). The three round sums spread 6.46-8.07. Routed to the lead; no threshold edited.
    - P-PERF4 (60 s, 1 M as shipped, res .5, OVERLAP): run 1: copy call p95 0.1 / max 0.3 ms PASS; 0 late / 3599; 0 governor steps; minScale 1. Run 2: max 0.5 ms (> 0.4, one 100 us tick) FAIL; 0 late / 3599; 0 steps. Alone, the row A 60 s window at res 1 reads p95 0.1 / max 0.4.
    - Row A's 60 s window at res .5 (alone) had 3 late frames (416.6, 483.3, 50.1 ms) and a 28.2 ms copy call. These are main-thread stalls that the alone stamp cannot see; the rounds before the window were clean.
    - P-B5 rerun on this branch (alone): PASS 600/600, lag 0, same rAF.
  - Proposed R1 line 3 (for the lead's rerun; LR-2): "Splat path: row A bare 1 M res 1 7.05 ms, res .5 4.80 (alone). Row B as shipped 1 M: res .5 5.48, res 1 9.47 (best runs, both OVERLAP); no row-B point <= 5.00 ms. P-B5 same frame 600/600." -> LR-2 second clause: the demo stays at N*_shipped (49 152, res .5). R1 closes as a measured ceiling + lever. The measured terms that a lever can cut: the snapshot (~1 ms p95 at res .5) and the look at res .5 (gpuMs +0.75 over bare). Status UNKNOWN until the lead's alone rerun.
  - Evidence: worktree `scratchpad/gpu3d/s24-*` (logs + `.out.json`; all 6 JSONs pass `check`), `s24-chain.sh`, `s24-rerun.sh`, `s24-vite.config.mjs`.
### S3.1 [x] The pure seam `splats()`
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** the fluid's audio mapping, pure and tested, before any GL code.
- **Files:** `web/src/scenes/fluid.ts` (types, constants and `splats()` only), `web/src/scenes/fluid.test.ts`.
- **Behaviour:**
  1. CP3's contract as written. Positions and directions come from a hash of the frame time; no `Math.random`.
  2. No onset and no drop in the frame -> `[]`.
  3. A kick onset -> 1 splat: impulse = direction x `v.force` x strength, each component clamped to +-`V_MAX`; radius = `v.radius`.
  4. A hat onset -> 1 splat: `dx = dy = 0`; radius = `HAT_SCALE` x `v.radius`.
  5. A drop -> `RING_N` splats at equal angles on one circle, impulses outward.
  6. RG-6. If only a drop level exists, the native computes the rise (level - previous > 0.25 per frame, the milk-sync rule) and `splats()` takes it as a 4th argument, `dropRise: boolean`. Report that as `Changed during implementation`.
- **Tests:** F-U1, F-U2, F-U3, F-U4 (Vitest).
- **Done:** Gates.
- **Base / depends:** master / none. **New deps:** none.
- **Changed during implementation:**
  - RG-6 resolved. `f.onsets` is `{ t, strength }[]` from the generic spectral-flux detector. It has no drum label. Drum hits never reach a native: `features.hit()` drops `strength`. A native sees a kick or a hat only as the envelope sources `s.kick` / `s.hats`. On the frame that drains a hit, the envelope jumps to min(1, sens), and between hits it only decays (`features.ts`). The drop is the `drop` level, which also only decays between drops (`arrange.ts`).
  - So every event is a rise, not only the drop. The 4th argument is `prev: Readonly<Sources>`, the `s` of the previous call, not `dropRise: boolean`. `splats()` applies the milk-sync rule (level - previous > 0.25 = `RISE`) to `kick`, `hats` and `drop` alike. The edge rule stays inside the tested pure function. Strength = the source's level. The native (S3.2) keeps a copy of the last `s`. With `{}` on the first call, a level that is still decaying reads as one hit.
  - The step's formula has no unit, so the impulse = direction x `SPEED` (500, the port's velocity units, as upstream's random splats ±500) x `v.force` x strength, each component clamped to +-`V_MAX`; NaN -> 0. The drop ring: radius `RING_R` = 0.15 stage heights. Its x offsets are divided by the stage aspect, so the ring is round on the stage. Its impulses = outward x `SPEED` x force x `s.drop`. Centres lie in the middle 60 % of the stage. `rgb` = a full-saturation hue from the hash, 0..1; the native may scale the dye.
  - Only `V_MAX`, `RING_N`, `HAT_SCALE` and the event knobs are in `fluid.ts`. `SIM`, `DYE`, `PRESSURE_ITER` and the values go with the solver (S3.2). For S3.2: when `fluid.ts` imports the engine, `fluid.test.ts` needs `vi.mock('../gl/engine', () => ({}))` (the `orb.test.ts` precedent).

### S3.2 [x] The solver port and `native/fluid`
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** a 2D grid fluid as a plain WebGL2 native (design L33, L76).
- **Files:** `web/src/scenes/fluid.ts`; one entry each in the native registry and `web/src/scenes/builtin.ts`; one id in `web/src/library.test.ts`; one row in the THIRD_PARTY file; `scratchpad/gpu3d/g3-state.mjs` (mode `fluid-nan`).
- **Port authorisation:** the WebGL-Fluid-Simulation solver, MIT (design L76).
  - Take the URL from `agents/research/research_gpu3d.md` (grep `WebGL-Fluid`). ⚠️ Assumption, needs confirmation (planner's memory, not read): the GitHub repo `PavelDoGreat/WebGL-Fluid-Simulation`, file `script.js`.
  - Download that one file into a new empty directory `scratchpad/gpu3d/upstream-fluid/`. Only read it; run nothing from it.
  - Keep the upstream MIT notice verbatim in the header of `fluid.ts`, with the URL and the commit.
- **Behaviour:**
  1. Port by hand to GLSL ES 3.00: splat, advection, curl, vorticity, divergence, pressure, gradient subtract, and a display pass into `dst`. Do not port bloom, sunrays, the pointer input or the GUI.
  2. Constants and values: § Planner-fixed names and policies. Value defaults = the upstream config values of the same knobs.
  3. Each frame: apply `splats(s, f, v)`, then step with `f.dt` clamped at 0.05.
  4. Every pass that writes velocity clamps each component to +-`V_MAX`.
  5. Reuse the engine's existing half-float target helper. Output alpha: the convention that `scenes/particles.ts` uses for its own target.
  6. `dispose()` deletes every FBO, texture and program.
  7. `builtin:demo-fluid`: one `native/fluid` layer at the defaults, `star: false`, no binding yet. Append its id to the I-LIB1 list.
- **Tests:** Vitest: the I-LIB1 list only (the seam is S3.1's). `g3-state.mjs fluid-nan dnb174-arr <port>` (F-B1).
- **Report:** the tile bake time of `builtin:demo-fluid`. No tile-specific sim size is built.
- **Done:** Gates. F-B1 passes. One headless still.
- **Base / depends:** master / S3.1. **New deps:** none. **Third party:** WebGL-Fluid-Simulation, MIT.
- **Changed during implementation:**
  - Upstream confirmed: `PavelDoGreat/WebGL-Fluid-Simulation`, `script.js` at commit `a2d292931f19d9b3b9f564e23e6c32729d2121c3` (2024-11-12, master HEAD on 2026-11-16), MIT ("Copyright (c) 2017 Pavel Dobryakov", in its LICENSE and the file's header). Fetched from raw.githubusercontent.com with no login (LR-6), kept read-only in the worktree's `scratchpad/gpu3d/upstream-fluid/` (script.js sha256 `291d86de…`).
  - `dispose()` deletes every FBO and texture, not the programs. They come from the engine's `program()` cache, shared by every instance, the warm-up's throwaway `create()` and the tiles; no native deletes them, and a deleted one would go to the next instance.
  - Values beyond the step's list, as module constants: the port's `PRESSURE` 0.8 and `VELOCITY_DISSIPATION` 0.2; `DYE_GAIN` 1.5 (the port's random splats: generateColor() 0.15 × 10) scales S3.1's 0..1 hue. The splat radius is max(`radius`, 1e-3), so the slider's 0 never divides by 0 in the splat shader.
  - Every target is `renderTarget(true)` (RGBA16F, linear) where the port used RG / R formats and NEAREST for pressure, divergence and curl: those reads sit on texel centres, so linear = nearest. No MANUAL_FILTERING (WebGL2 filters RGBA16F). The display pass keeps the port's SHADING and writes alpha 1. Grid sizes follow `f.width / f.height` every frame (the port's getResolution); velocity and dye are persistent targets (resampled on a resize, as the port's resizeDoubleFBO), the others start over.
  - The demo sits after the spread (`DEMOS` in builtin.ts), so the autopilot order and the milk interleave do not change. Its name is "Demo fluid": an equal name would hide it in the library as the `native/fluid` block's twin (blocks.ts).
  - I-LIB1 is a new test in `library.test.ts`: the `builtin:demo-*` ids equal its list, all `star: false`, none in `playlist(true)` or `playlist(false)`. S1.5 and S4.7 append theirs (the "3" closes at S4.7). RED under its bad_input (the demo starred): exit 1.
  - `g3-state.mjs` mode `fluid-nan` is in the worktree's `scratchpad/gpu3d/` (the lead copies it to the main checkout). It finds the FBOs by GL wrapping (the advection program = uniform `uSource`; velocity = its smaller target), with no DEV hook. RED under the bad_input (Jacobi weight 0.5, clamps uncapped): exit 1 through max |v| 65 280 and luma .0067. Finding: on this Metal stack the non-finite arm cannot fire for a blow-up. fp16 stores saturate at ±65 504 and `clamp()` maps NaN to its bound (probe: raw NaN / Inf → 16 of 16 counted; clamp(NaN) → −1000; 1e30 → 65 504). A NaN in velocity would read as ±1000, inside the clamp; only the luma arm would see it.
  - Report: the tile bake of `builtin:demo-fluid` = 90 frames in 214 ms (synced), 6-frame slices median 14.0 ms, max 16.5 ms. The tile's dye is 1820 × 1024 (DYE on its short side; no tile size, as the step says).
### S3.3 [x] The fluid demo binding and the R2 bench
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** R2 is measured on the demo as shipped (matrix ruling G5).
- **Files:** `web/src/scenes/builtin.ts`, `scratchpad/gpu3d/g3-bench.mjs` (mode `fluid`), `scratchpad/gpu3d/g3-px.mjs` (new, base `pxdiff.mjs`; modes `react`, `latency`), `scratchpad/gpu3d/g3-60s.mjs` (mode `fluid`).
- **Behaviour:**
  1. `builtin:demo-fluid` binds `force <- sub` (0.4..1.6).
  2. `g3-bench.mjs fluid <port> 3` (F-PERF1): the demo, `own/flash` tail, alone, slow class. Every round: billed p95 <= 4.00 ms.
  3. If a round reads > 4.00, set `DYE = 512` and `PRESSURE_ITER = 12` (the design's lever, matrix G5) and run again. If it still reads > 4.00, stop: R2 FAIL goes to the lead.
  4. `g3-px.mjs react dnb174-arr <port>` (F-B2) and `latency dnb174-arr <port>` (F-LAT).
  5. `g3-60s.mjs fluid dnb174-arr <port>` (F-B3). This run is also the fluid half of I-GOV1.
- **Tests:** Vitest: none new. Rows: F-PERF1, F-B2, F-LAT, F-B3.
- **Done:** Gates. The JSON files pass `check`. The report states the constants that ship.
- **Base / depends:** master / S3.2, S1.6. **New deps:** none.
- **Changed during implementation:**
  - **The lever ships.** F-PERF1 at `DYE 1024`, `PRESSURE_ITER 20` (alone, slow, refP95 3.80, metal-3): round billed p95 4.01 / 4.13 / 3.74 ms → FAIL. With `DYE 512`, `PRESSURE_ITER 12` (alone, slow, refP95 3.75): 3.19 / 2.83 / 3.16 ms → PASS; `check` exit 0. The constants that ship: `SIM 128`, `DYE 512`, `PRESSURE_ITER 12` (stage 1728×1118: velocity 198×128, dye 791×512). A first run at 1024 / 20 overlapped another lane (4.11 / 3.98 / 4.38, a projection; kept as `s33-perf1-shipped-overlap1`).
  - **Tile dye (lead ruling S3.2 (3)), as a general rule:** the dye's short side = min(`DYE`, the output's short side), not a tile flag. A 320×180 tile now bakes a 320×180 dye (was 1820×1024): 90 frames in 116 ms, 6-frame slices median 7.4 ms, max 12.2 ms (was 214 ms, 14.0 / 16.5 ms). The stage keeps `DYE` while its short side is ≥ `DYE`.
  - Coder evidence at the lever (`scratchpad/gpu3d/s33-*`): F-B2 delta .0859 (before .0000, after .0859; drop rise 34.46 s) PASS. F-LAT median 0 frames (37 of 37 kicks in their drain frame; stamp to response 14 ms median, 22 ms p95) PASS, alone. F-B3 0 late / 3599, minScale 1, 0 governor steps, PASS twice, both runs OVERLAP (another lane's browser) → projections. F-B1 PASS, alone.
  - The binding's envelope is the house sub pattern (attack .02, release .25); the step gives only the range 0.4..1.6.
  - `g3-bench.mjs`: modes `fluid` (the nstar procedure, so `governor.reset()` before each window) and `60s fluid`. P-REC for the fluid: `pointsDrawn` = the POINTS the probe saw (0), `count` 0 (no count input).
  - `g3-px.mjs` `react` / `latency`: the base is fluid-nan's live-analysis page start, not `pxdiff.mjs` (a PNG diff). Both read the fluid layer's own output (the display pass's framebuffer, found by GL wrapping, blitted to 1/8, read back), not the stage: the post pass (drop flash, beat strobe) would leak into the stage. F-LAT's onset = the frame where app.ts drains the detector's kick hit (`input.ts` `hitQueue.splice` wrapped, no DEV hook). The response = the first frame whose luma rise beats the floor (p99 of that rise over the frames with no drained kick and no source rise).
  - `g3-state.mjs fluid-nan` (lead ruling S3.2 (1)): |v| ≥ 999 fails at both reads and in a new velocity scan (every 30th frame over the 60 s). Every read also reads the velocity right after the vorticity and the gradient pass (`mid`). Reason: a NaN there becomes ±1000 in the clamp, then the advection pass, the frame's last velocity write, divides it by 1 + 0.2·dt (996.7) and moves it. So an end-of-frame read never sees the 999 signature: with a NaN bit pattern in the vorticity pass, the end-of-frame reads gave 757 / 762, the scan 815 → PASS (exit 0, blind). With `mid`: 1000 → FAIL (exit 1). Green with `mid`: end 671.5, mid 784, PASS.
  - RED once each (temporary edit, restored, Vite restarted): F-B2 with the drop branch off → delta .0103 (exit 1). F-LAT with the splats 3 frames late → median 11 frames (exit 1). F-B1 999 arm → see above (a 0/0 in the vorticity pass, the first try, made no NaN on this stack: max |v| 384, exit 0).
  - Risk for the lead: legitimate |v| now reaches 784 mid-frame (S3.2: 165 at force 1). `force ← sub` drives impulses up to 500 × 1.6 = 800 per component. A kick on fluid that already moves > 200 the same way clamps at 1000 legitimately, so the 999 arm can read a clamp that is not a NaN.
  - Out of scope (report only): built-in scenes read `styled` (Auto-style). app.ts builds `styled` before it writes `src.drop`, `src.build`, `src.presence` and `sources(f, src)`. So those sources reach built-in scenes one frame late.

### S4.1 [x] Merge the S1-T spike
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** the passed spike is in `master` with no change in behaviour: the three host, `native/model` (not in the catalog yet), the GL-state instrument and the `blend` argument.
- **Source:** in a fresh worktree from `master`: `git merge 334631f` (branch `worktree-agent-afd1458d462044d4c`, base `badc76d`). Keep the entries of both sides in `package.json`, the lock file and the THIRD_PARTY file.
- **Files (from the merge):** `web/src/three/host.ts`, `web/src/three/three.d.ts`, `web/src/scenes/model.ts`, `web/src/gl/glstate.ts` + its test, `gl/scene.ts` + `gl/live.ts` (the `blend` argument), `web/package.json` + lock (`three` 0.187.0), `web/public/models/Fox.glb`, the THIRD_PARTY rows.
- **Behaviour (the only edits after the merge):**
  1. `three` is pinned exactly: `"three": "0.187.0"`, no caret.
  2. `glstate.ts` gains COPY_READ_BUFFER_BINDING and COPY_WRITE_BUFFER_BINDING (N6).
  3. The title of the instrument's test starts with `I-GL1`, and the test covers the matrix row: identical snapshots -> {}; a changed CULL_FACE -> exactly CULL_FACE.
  4. `node scratchpad/gpu3d/s1t.mjs diff <port>` stays runnable on the merged tree. If it needs a spike-only page, that page stays DEV-only and the report names it. Delete the other spike-only knobs.
  5. `native/model` stays out of the editor catalog until S4.4. `Fox.glb` stays until S4.2 replaces it.
- **Tests:** I-GL1 (Vitest). Browser: the diff rule of CP4 (S1-T lines 0 and 1 again; diff = {}).
- **Done:** Gates. `npm run build` succeeds. Record the gzip size of the entry chunk before and after the merge (the I-BUNDLE1 baseline). The diff line passes.
- **Base / depends:** master + the merge of `334631f` / none.
- **New deps:** `three` 0.187.0, MIT (`agents/STATE.md` HEAD, "GPU/3D research"). Its types are local (`three.d.ts`).
- **Changed during implementation:** the merge was `git merge --no-ff` of the branch (clean: master changed no `web/` file after `badc76d`). Items 1 and 2 were already true in `334631f` (the exact pin; both COPY bindings in `FIELDS`), so no edit. Item 3: I-GL1 is a new test next to the spike's three; it also checks a pixel-store field (UNPACK_ALIGNMENT), the other half of the matrix `bad_input` (the fake GL gains `pixelStorei`). Item 4: no spike-only page exists (`s1t.mjs` boots `/?debug` and imports `/src/...` from the dev server). Nothing is deleted: every `MODEL_SPIKE` field is read by an `s1t.mjs` mode that the plan still runs (`diff` = lines 1, 2, 4, 5; `inst` = line 0; `bench` = S4.2). The hooks ship inert: no app code sets them.
- **I-BUNDLE1 baseline (S4.1):** entry gzip (Node `zlib.gzipSync`, default level) 365 603 B before (master `2692601`), 365 605 B after the merge (Vite prints 368.44 kB for both). The merged build has no three chunk, because nothing imports `scenes/model.ts` before S4.4. A probe build (model in the catalog, temporary edit, reverted): entry 366 368 B (+765 B); lazy chunk `host-*.js` 641 413 B raw, 159 801 B gzip. The marker `THREE.WebGLRenderer` survives the minifier: 0 in the entry, 8 in the lazy chunk.
### S4.2 [x] The Quaternius CC0 animal in place of Fox
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** the shipped model is one animated CC0 animal with recorded provenance (matrix ruling G4). `Fox.glb` leaves the tree.
- **Files:** `web/public/models/<animal>.glb` (or `.gltf` + `.bin`), `web/public/models/manifest.json`, `web/public/models/LICENSE-quaternius.txt`, the THIRD_PARTY file, `web/src/scenes/model.ts` (the model URL only), `web/src/scenes/model.test.ts` (new).
- **Behaviour:**
  1. Download the Quaternius Ultimate Animated Animal Pack from its official source (URL: `agents/research/research_gpu3d.md` §6) into a new empty directory `scratchpad/gpu3d/quaternius/`. Run nothing from it.
  2. Check that the pack's licence text says CC0. Copy that text to `LICENSE-quaternius.txt`.
  3. Pick one animal: rigged, >= 2 animation clips, the smallest file. Copy only that model into `web/public/models/`. Add its manifest entry and its THIRD_PARTY row.
  4. Point `native/model` at the new file. Delete `Fox.glb` and its THIRD_PARTY rows.
  5. If the source needs a login or a manual click, stop and report (LR-6). Report the file size; above 5 MB, ask before committing.
- **Tests:**
  - M-U6 (Vitest, Node `fs`): every `.glb` / `.gltf` in `web/public/models/` has exactly one manifest entry whose `licence` equals the CC0 1.0 string exactly and whose `source` is an https URL; the test runs after `Fox.glb` and its THIRD_PARTY rows are deleted (coverage B2, LR-5 i).
  - Browser: the diff rule of CP4 on the new model. `node scratchpad/gpu3d/s1t.mjs bench <port>` once: chrome and glass at 1 sample (S1-T read 2.07 ms on Fox).
- **Done:** Gates. The diff line passes. One headless still: the animal in chrome.
- **Base / depends:** master / S4.1. **New deps:** none. **Asset:** Quaternius pack, CC0.
- **Changed during implementation:**
  - Source (behaviour 1, lead ruling 2026-11-16): the pack's only official download, the Google Drive folder `1uJ3N5HfB7jKTseJUNQr3N4YaN0UuEtHk`, answered "Quota exceeded" to every anonymous download (10 retries; `s42-drive-retries.log`). The asset is the Poly Pizza listing of "Wolf" by user "Quaternius", https://poly.pizza/m/P1gU3Qkr9r (uploaded 2021-09-07; its 12 clips are the Ultimate pack's set), as an anonymous GLB in the new empty folder `scratchpad/gpu3d/polypizza/`.
  - `Wolf.glb`: 986 712 B, 1 skin of 51 joints, 4 meshes, 1 962 triangles, normals, no images, 12 clips (each also duplicated with an `AnimalArmature|` prefix). It is not the smallest Quaternius wolf: the listing XU7oNeKShV (253 068 B) is a 2023 pack (16 joints, an atlas texture). The plan names the 2021 Ultimate pack.
  - Behaviour 2 is replaced (lead ruling): no `LICENSE-quaternius.txt`. The licence evidence is the listing's own field `"Licence":"CC0 1.0"` (`scratchpad/gpu3d/s42-polypizza-licence.json` + `.html.txt`). THIRD_PARTY records that quaternius.com/license.html now shows QAL v1.0 (2026-08-28) while the pack page and the listing say CC0.
  - Beyond "the model URL only" (lead ruling): `host.ts` picks the clip by name, on the last `|` segment, Gallop, then Run, then Walk, then clip 0 (the Fox's `Run` name is absent; clip 0 is Attack). `fox` is renamed `animal`, and 3 comments change. The material is unchanged. `model.ts`: the URL constant `MODEL`, the `credit`, the header comment. `web/.gitignore` re-includes `Wolf.glb` and `manifest.json`.
  - M-U6's CC0 string is `CC0-1.0` (the SPDX id). RED on `"licence": "QAL-1.0"` (`s42-mu6-red-wolf-noncc0.log`), GREEN after the revert.
  - Diff rule (`s42-diff.*`): diff after restore = {} for ctor, pmrem, compileAsync, upload, dispose and render x33; spy `getProgramParameter` x1. Frozen pair 0.0023/255 (the mutation reads 14.4); line 4 5/5; line 5: glass 0 = 1 = 0.5 at 4 calls / 4 textures / 4 programs (4 meshes: the Fox had 1 call), checker corr 0.987.
  - Bench, run once (coder evidence; slow class, post wireform+flash p95 3.78): chrome 2.03 ms, glass 2.04 ms, samples 4 4.85 ms billed p95 (Fox: 2.07 / 2.07 / 4.85). Main thread per draw: median 1.9 ms, p95 2.4 ms. Load 133 ms; 0 late frames on lines 7 and 8.

### S4.3 [x] Unit rows on the model native
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** Vitest pins the model's pure logic and its lifecycle. The behaviour does not change.
- **Files:** `web/src/scenes/model.ts`, `web/src/three/host.ts`, `web/src/scenes/model.test.ts`.
- **Behaviour (only what the tests need; read the merged files first):**
  1. Export `modelSamples(v)` = `v >= 4 ? 4 : 1`. The render target is rebuilt only when the size or `modelSamples` changes.
  2. The load goes through an injectable loader (default: the real `import()` of `host.ts`). A test can resolve it, reject it or leave it pending.
  3. One exported function builds the material and one exported setter changes it (names: the spike's; else `makeMaterial(THREE)` and `setGlass(material, glass)`). `transparent = true` at every `glass` value (N5).
  4. `pose(s, v)` is a pure seam (design L183-L185). If the merged native has none, extract its present pose code without changing the mapping.
  5. The value `speed` exists (animation speed gain, 0..4, default 1). Add it if the merged native lacks it.
- **Tests (Vitest):**
  - M-U1: `transparent === true` at `glass` 0, 0.5 and 1; one material object; no program field changes.
  - M-U2: `samples` 1 -> 4 = 1 rebuild; 4 -> 4 = 0 rebuilds; 3 -> 1.
  - M-U3: the shipped model of S4.2 parsed in Node; 0.5 s of the mixer moves the bone matrices (Frobenius diff > 1e-3); two instances share one scene object. The fixture is the shipped model, not the donor Fox (LR-5).
  - M-U4: `hidden()` is true until Ready; Failed stays hidden with one `console.error`; `dispose()` during Loading keeps the cache; 2 instances = 1 fetch.
- **Risk:** if `GLTFLoader.parse` cannot run under Vitest within ~15 min (texture decode), keep the shared-scene half of M-U3 on a fake host and report. M-B5 covers the motion in the browser.
- **Done:** Gates. The diff rule of CP4 (the host file changed).
- **Base / depends:** master / S4.2. **New deps:** none.
- **Changed during implementation:**
  - `host.ts` keeps its GL calls; its GL-free part moves out of `load()` into exports: `rig(gltf)` (scene, the one material, camera, clip; `apply(pose, aspect, glass)` sets the mixer, the camera and `glass` right before a render), `makeMaterial()`, `setGlass(material, g)`, `pose(t, d)`, `fit(rt, w, h, samples)`. Vitest runs all of them on real three in Node: `GLTFLoader.parseAsync` reads the shipped `Wolf.glb` in ~14 ms (no textures), so the Risk line's fake host is not needed.
  - Item 3: `makeMaterial()` has no `THREE` parameter: it lives in `host.ts`, the only importer of three (frozen contract). The `glass` uniform holder sits on `material.userData.glass`.
  - Item 4: `pose(t, d)`, not `pose(s, v)`: the present mapping reads only the layer clock (clip time t, orbit yaw 0.9 + 0.12 t); no source drives the pose yet. `d` = the clip's lead that `speed` integrates per instance (`d += dt × (speed − 1)`), so the default speed 1 keeps the clip exactly on the layer clock (unchanged behaviour). The camera orbit stays on the layer clock.
  - Item 1: model.ts passes `modelSamples()` (1 | 4) to the host; `fit()` maps 1 to three's `samples: 0` (three's 1 = a 1-sample MSAA buffer). `Math.round` is gone (3.6 now reads 1; the input is a 1 / 4 menu).
  - Item 2: `export const loader = { load }` in model.ts. A first try with `vi.mock('../three/host')` leaked the real `load()` to concurrent dynamic imports after `vi.resetModules()` (the no-memo RED showed the real host failing on the fake GL), so the fetch count was not reliable through the mock.
  - The warm-up render in `load()` now also sets `glass` 0 (through `apply`): uniforms only, on the discarded 16 × 16 shot.
  - M-U3's shared half: both instances read the module-level host, so a per-instance load still draws one scene; the row asserts the load count (1) with the drawn-scene count (1). RED under the no-memo edit: `[3, 1]`.
  - RED once per matrix bad input (temporary edits, reverted; logs `scratchpad/gpu3d/s43-red-*.log`): M-U1 transparent = g > 0 (false at 0), a new material per apply (4 objects), `needsUpdate` per glass (program key changed); M-U2 rebuild every frame ([1, 2, 3, 4]), samples 3 passed through ([1, 4, 4, 3]); M-U3 no `mixer.setTime` (Frobenius 0); M-U3/M-U4 no memo (3 loads); M-U4 no `!host` guard (TypeError on a draw before Ready), no `.catch` in `create()` (Vitest Unhandled Rejection `Error: 404`, exit 1; the row's own assertions pass).
  - Values: M-U1 56 primitive material fields + `defines` + `customProgramCacheKey()` constant over glass 0 / 0.5 / 1, 1 material on the 4 meshes; M-U2 builds [1, 2, 2, 3] for samples 1, 4, 4, 3, the host receives [1, 4, 4, 1]; M-U3 Frobenius 379.99 over 51 bones (t 0 → 0.5 s); M-U4 loads 1, renders 0 before Ready, 1 console.error on Failed.
  - Diff rule (`s43-diff.*`, port 5176, a private Vite `cacheDir` so lane 1's shared `node_modules/.vite` is not re-optimised): diff after restore = {} for ctor, pmrem, compileAsync, upload, dispose and render × 34; spy {}; line 2 pair 0.0128/255 (≤ 0.08; mutation 14.13); line 4 5/5; line 5 glass 0 = 0.5 = 1 at 4 calls / 4 textures / 4 programs, checker corr 0.987. Stills `s43-chrome.png`, `s43-glass-checker.png`.
### S4.4 [x] Catalog entry, `samples` not bindable, tile bake waits for Ready
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** `native/model` is in the Library, and its tile is never a black bake (N7).
- **Files:** the editor catalog (RG-8); the tile-bake module (RG-8; the matrix proposes `web/src/editor/tiles.ts`) + `web/src/editor/tiles.test.ts`; `web/src/bind.ts` + `web/src/bind.test.ts` (only what RG-2 needs).
- **Behaviour:**
  1. Add `native/model` to the editor catalog. S1-T left it out, so N7 is untested until now.
  2. `samples` cannot be bound (RG-2). `glass`, `speed` and the other values can.
  3. The tile bake skips a native while `hidden()` is true. It bakes exactly once when the native turns ready (`warm()` resolves). A disposed native is not baked.
- **Tests (Vitest):**
  - M-U5: a fake native whose `hidden()` flips: 0 bakes while hidden, then exactly 1.
  - I-B3: bind refuses `samples`; `count` accepts a source and clamps to 0..1 048 576.
- **Done:** Gates. One headless still of the Library: the model tile shows the animal.
- **Base / depends:** master / S4.3; S1.3 for the `count` half of I-B3. **New deps:** none.
- **Changed during implementation:**
  - RG-2 resolved: no declaration existed. Every numeric input was bindable, in `live.ts` `bindInto` and in the panel. Files beyond the list: `fx/types.ts` (`Input.bindable?: false`), `scenes/model.ts` (`samples` declares it), `gl/live.ts` (`bindInto` refuses it through the existing "cannot bind" path), `ui/Panel.tsx` (no bind dot). `bind.ts` holds the one predicate `bindable(x)`.
  - N7 resolved through a new `Live.hidden()` (`gl/live.ts`): true when every layer's generator is hidden, so a render draws black. The bake (`park()` in `tiles.ts`) disposes such a tile's instance before any render, takes the job off the slice and waits for its natives' `warm()` (native/model's memoised load). Then it bakes once, from frame 0. If the tile is still hidden after `warm()` (a failed load), the job leaves the queue: no still, the grey name tile stays. The hovered tile reads nothing back while hidden.
  - The rule is generic: `native/camera`'s block tile without a picture now keeps the grey name tile instead of a black still. A scene with a visible layer is not "every layer hidden" and bakes as before. Ceiling: a multi-layer scene with a model layer can bake before the load and miss the model; `builtin:demo-model` (S4.7) has one layer.
  - Values: M-U5 0 bakes over 30 rAFs while hidden (the parked instance: 0 renders, 1 dispose; 6 hovered rAFs: 0 read-backs), then 1 bake of 90 frames after `warm()`. A new row-less test pins the failed load: 2 instances, 0 renders, 0 stills, job gone. I-B3: `bindable` of samples / glass / speed = [false, true, true]; count bindable; a binding −5..2 000 000 at source 0 / 1 → count [0, 1 048 576].
  - RED once per bad input (logs `scratchpad/gpu3d/s44-red-*.log`): M-U5 before the fix "bakes while hidden: 1"; no re-arm "bakes after ready: 0"; no hover check "hover read-backs while hidden: 2"; the failed-load drop removed: 7 instances (a create + dispose per frame); I-B3 samples bindable [true, true, true]; no clamp [−5, 2 000 000].
  - Browser (`s44-library.*`, port 5176, private Vite `cacheDir`, headless): 179 tiles; native/model Ready 1 103 ms after L; its first and only still 1 366 ms after L, mean luma 13.6/255, 10.7 % of texels > 8/255; 0 errors; no host or GLB request before L. `s44-panel.*`: a bind dot on glass and speed, none on samples.
  - Bundle (Node gzip, `s44-bundle*.json`): entry 369 423 B against the base `e166f16` 368 406 B = +1 017 B (+116 B without the catalog line; the model module +901 B). Against S4.1's baseline 365 603 B: +3 820 B, of which +2 803 B was in the base already. Lazy `host-*.js` 641 773 B raw, 159 960 B gzip. `THREE.WebGLRenderer`: 0 in the entry, 8 in the lazy chunk.
  - The CP4 diff rule was not run: no material, model-file or host GL change.

### S4.5 [x] Instance checks: two instances at once, animation, lifecycle
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** close the S1-T gap "two instances at once" (s1t.md L34): a Library tile and the stage share one loaded model, and each keeps its own pose.
- **Files:** `scratchpad/gpu3d/g3-state.mjs` (modes `twopose`, `anim`, `life model`); `web/src/scenes/model.ts` and `web/src/three/host.ts` only for a root-cause fix.
- **Behaviour:**
  1. `twopose <port>` (M-B6): the stage instance and a Library tile draw in the same frames with different t. The bone matrices of each instance match its own t: Frobenius diff between the instances > 1e-3; 0 when t is equal.
  2. If the tile shows the stage's pose, apply the design's rule (L571): the instance applies its pose right before its own render. Then run the diff rule of CP4.
  3. `anim <port>` (M-B5): mean abs frame diff over 1 s inside the model region >= 1/255.
  4. `life model <port>` (I-LC3): 10 enter / exit cycles; render-target delta 0; the cached asset count is constant after cycle 1.
- **Tests:** Vitest: none new, unless a fix adds pure logic. Rows: M-B6, M-B5, I-LC3.
- **Done:** Gates. The three modes pass.
- **Base / depends:** master / S4.4. **New deps:** none.
- **Changed during implementation:**
  - No product edit: no row proved a defect. three r187 recomputes the skeleton on every `render()` (`info.render.frame++` per call, WebGLRenderer.js:1710; `WebGLObjects.update`), and `host.ts` already applies the pose right before each render, so the design's assumption (L571) holds. The CP4 diff rule was not run (no host GL change).
  - Harness: `g3-state.mjs` was extended in the worktree (`scratchpad/gpu3d/`, from the main checkout's copy of 07:08) and the lead copies it back. No product hook: the harness wraps model.ts's exported `loader` before the first load. That gives it the host: `render()` and `free()` mark a phase, and the renderer's `render()` hands over the shared scene (the skeleton). It also wraps `model.create` (instance counts) and `gl.create*` / `delete*` while `MODEL_SPIKE.entry > 0`. After a `web/src` edit the app imports model.ts with `?t=`, which gives a second module instance. The harness then stops with "restart Vite".
  - Fixtures: `builtin:demo-model` lands in S4.7, so `life` cycles a one-layer native/model doc (the demo's planned shape: glass 0, samples 1). `twopose` and `anim` use [black toy, model].
  - M-B6, "t differs" = the clip phase differs. Gallop loops every 0.5417 s (the GLB accessor max), so two clip times k × 0.5417 s apart show one pose by design. One run read Frobenius 2.6e-4 at dClip 1.083 s = 2 × the length and failed the literal raw-t reading. Pairs within 1 ms of k × the length are reported apart. "0 when t equal" = every capture against a probe: the host renders one stage-sized RT alone at that capture's own t and d.
  - M-B6 values (`s45-twopose.*`): 141 frames with both; stage 153 captures (1 RT); tile 231 captures (2 RTs: the hovered tile and the bake). 230 phase-differing pairs: Frobenius min 31.8, med 251. 1 same-phase pair: 0.52 at a phase of 6.7e-5 s. 384/384 captures equal their probe (max 0).
  - M-B6 RED (`s45-red-mb6-*`, the tile skips its pose: `if (w * h > 320 * 180) apply(...)`): 230/230 tile captures differ from their probe (max 1014). The same-frame Frobenius alone still read min 64.3, so the probe check is the half that catches a shared pose.
  - M-B5 values (`s45-anim.*`): 19.37/255 over 60 frame pairs (1.03 s) in the model region (25.7 % of the quarter-size frame); the stage's bones move Frobenius 517 over the window (clip 0.933 to 1.933 s). Control at `speed` 0 (clip frozen, camera orbit on): 0.93/255. That is just under the 1/255 line, so the row separates a frozen clip from the orbit by a thin margin (information; threshold unchanged). RED (`apply(pose(0, 0), ...)`, time not applied to the pose): 0/255.
  - I-LC3 values (`s45-life-model.*`): RT objects alive after each exit [0 x 10], at each enter [3 x 10] (texture, framebuffer, depth renderbuffer). These are equal at all 20 samples: the load-phase GL objects {Texture 7, Framebuffer 39, Buffer 24, Program 4, VertexArray 7} and three's info {geometries 5, textures beside the RT 3, programs 4}. Instances: 10 created, 10 disposed.
  - I-LC3 REDs: (a) `dispose()` skips `host.free`: RT objects alive after the exits 3, 6, ... 30 (`s45-red-lc3-rtleak.log`). (b) `free` also disposes the geometries: after exit 1, Buffer 24 -> 4, VertexArray 7 -> 3, geometries 5 -> 1 (`s45-red-lc3-assetfreed.log`).
### S4.6 [x] Alpha under the 7 blends, and the model as layer 0
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** the model composites correctly under every blend (N3; matrix ruling G3) and on the direct path (s1t.md L34).
- **Files:** `scratchpad/gpu3d/g3-px.mjs` (modes `alpha-normal`, `blends`, `fringe`, `fxafter`, `layer0`); `web/src/three/host.ts` and `web/src/scenes/model.ts` only for a root-cause fix.
- **Behaviour:**
  1. `blends <port>` (M-B2): white and 50 % grey layers under the model at alpha 0.5 and 1.0, in the 7 modes. The expected values are closed forms, with the GL factors written out in the harness and not imported from `live.ts`. S1-T line 4 passed 5 modes (normal, add, screen, max, multiply); `difference` and `dodge` are new.
  2. `alpha-normal <port>` (M-B1), `fringe <port>` at `samples` 1 and 4 (M-B3), `fxafter <port>` (M-B4). Reuse the S1-T fixture (display white at alpha 0.5).
  3. `layer0 <port>` (M-B7, a proposed row): the model as layer 0 at `normal`, opacity 1, res 1, against the same model over an opaque black layer. Pass: max texel diff <= 1/255.
  4. A RED row: root cause first (RG-9 for `layer0`). The fix stays inside `host.ts` / `model.ts` and uses the `blend` argument. If it needs an engine change, stop and report (LR-7). After a fix, run the diff rule of CP4.
- **Tests:** Vitest: none new (GL output). Rows: M-B1, M-B2, M-B3, M-B4, and the `layer0` check.
- **Done:** Gates. The five modes pass.
- **Base / depends:** master / S4.3. **New deps:** none.
- **Lead ruling LR-7 (2026-11-16), option 1:** a straight-alpha native stays off the direct path. One optional flag on `NativeDef`, set on native/model. The one engine change is the direct-path condition in `live.ts`. No draw argument is added.
  - RED before the ruling (`s46-final-layer0.*`, 1728 x 1118, t frozen, target pre-filled magenta): M-B7 glass 0 max RGB diff 0 (no texel unwritten, so no ghosting). Glass 1: max 161/255; 221 964 texels > 1/255 (11.5 % of the frame = the whole glass body). Worst texel: layer 0 (220, 221, 221, a 69) against black-backed (60, 60, 60); 220 x 69/255 = 59.5.
  - Root cause: `live.ts` L351 drew a bottom layer at normal / opacity 1 / res 1 / no mask straight into `acc`, with no blend. Under `normal`, native/model writes straight `(d, a)` (N3); only the normal composite premultiplies it (`vec4(c.rgb * c.a, c.a) * op`). Nothing in `draw(f, v, src, s, blend)` tells the direct path from the composited one, so `host.ts` / `model.ts` alone cannot fix it.
- **Result (merged master `4e016e3` first):**
  - `gl/scene.ts`: `NativeDef.alpha?: 'straight'` and the pure predicate `straight(def)`. `scenes/model.ts`: `alpha: 'straight'`. `gl/live.ts` L352: the direct path also needs `!straight(l.nodes[0]?.def)`. A straight-alpha bottom layer goes through the normal composite, so layer 0 reads d·a.
  - M-B7 PASS (`s46-flag-layer0.*`): glass 0 max diff 0, glass 1 max diff 0; layer-0 alpha 255 everywhere (composited). RED with the flag ignored in `live.ts` (`s46-red-noflag-layer0.*`): glass 1 max 161 again.
  - M-B1..M-B4 PASS with the values below, unchanged (`s46-flag-*`; no row draws the model as layer 0).
  - Vitest pin `LR-7 the direct path skips a straight-alpha generator ...` (`gl/scene.test.ts`, new): over the real catalog (every shader, the 23 named natives, the milk/* presets), `straight` holds for `native/model` only, so every other generator keeps the direct path (R5). RED with the flag removed from model.ts: `[]` (`s46-red-pin-noflag.log`). The test mocks the engine, `butterchurn`, `audio/input` and twgl's `createTexture` (module-level browser work).
  - CP4 diff rule (`s46-flag-s1t-diff.*`): line 1 diff after restore = {} for every entry (render x 33), spy {}; line 4 7/7.
  - Cost, information (`s46-bench-noflag.*`, `s46-bench-flag.*`; `s1t.mjs bench`, slow class both: post wireform+flash p95 3.83 / 3.78-3.83). One-layer model + own/flash, billed p95, direct (flag ignored) -> composited (flag): chrome 2.04 -> 2.53, glass 2.05 -> 2.61, samples 4 4.85 -> 5.21-5.22. That is +0.4..0.6 ms: the acc clear and the composite at 1728 x 1118. Alone: the no-flag run started with no other headless Chrome (lane 1's next run began in its last phase, after the model rows). In the flag run a watcher saw lane 1's Chrome twice; the rounds it overlapped are left out (pre rounds, round 3 of samples 4 and of post wireform+flash).
  - Gates exit 0: 678 tests (base 677).
- **Changed during implementation:**
  - Files and tests beyond the list (lead ruling LR-7): `gl/scene.ts`, `gl/live.ts`, `gl/scene.test.ts` (new), and one new Vitest pin.
  - `g3-px.mjs` does not read the stage canvas. Each check renders its own `tile()` instances (the same `create()` / `render()` code as the stage, outside the director's cache) into a harness RGBA8 target. The target is the drawing-buffer size (1728 x 1118, governor scale 1), with dt 0, so every layer clock stays at 0 and every shot of a mode shows the same pose. The loader wrap (the S4.5 pattern) gives fringe the shared scene.
  - M-B2 adds a third layer below the model, 25 % grey (64), next to white and 50 % grey (128). Over white and 50 % grey, `add` and `dodge` saturate at alpha 0.5 with straight and with premultiplied colour alike. The inverted-colour RED (`s46-red-premul-blends.*`) fails `add` and `dodge` only on the 64 layer.
  - M-B3: the white silhouette is the shipped material with emissive 1e4 (uniform only, then set back to 0). Edge texels = partial coverage, or lit with an unlit 4-neighbour. At samples 1, coverage is binary (0 partial texels), so the 3 661 edge texels there are the boundary only.
  - M-B4: the fixture is the shipped chrome model + `own/negative` (amount 1) over black, not the display-white fixture. Display white inverts to 0 from the composite and from the raw RT alike, so it cannot see the bad input. `own/negative` writes `a - rgb`: expected = `a^2 - A`, with coverage a = 1 - (W - A) from the model over white (W) and over black (A). That is 1 - the composite where the layer is opaque, and black where it is transparent.
  - `s1t.mjs` line 4 now checks all 7 blends: `difference` over black (127.5), and `dodge` over a new 64-grey doc `test:aq` (128). The extended diff run (`s46-s1t-diff.*`, no host / model change): line 4 7/7, line 1 diff after restore = {} for every entry (render x 34), spy {}. Information: line 2's floor (two reads, nothing changed) read 0.61/255 over 12.6 % of pixels in this session, above its pair (0.12). Line 2 is not an S4.6 row.
  - Values (`s46-final-*`, the same in `s46-flag-*`): M-B1 255 (max error 0). M-B2: 42 cells, max error 0.5 (P = 0.5 stores as 127). M-B3 min edge luma 255 at samples 1 (3 661 edge texels) and at samples 4 (3 661, of them 2 893 partial). M-B4 max error 0 (221 974 opaque texels, 0 partial, 658 617 channels changed).
  - REDs (temporary edits, reverted; Vite restarted after each): premultiplied under `normal` and straight elsewhere (`s46-red-premul-*`): M-B1 191; M-B2 7/7 modes fail; M-B3 min edge luma 191 at samples 4 (2 893 texels < 254; samples 1 unchanged). The fx reads the raw RT (`live.ts` `run()` returns the model's RT texture to a following node, `s46-red-rawrt-fxafter.*`): M-B4 max error 101. M-B7: RED before the ruling and with the flag ignored (above).

### S4.7 [x] `builtin:demo-model`, the bundle rows and the R3 bench
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** the third demo ships, and R3 / R5 are measured on it.
- **Files:** `web/src/scenes/builtin.ts`, `web/src/library.test.ts`, `web/src/scenes/model.ts` (header note only), `scratchpad/gpu3d/g3-bench.mjs` (mode `model`), `scratchpad/gpu3d/g3-60s.mjs` (mode `model`), `scratchpad/gpu3d/g3-state.mjs` (mode `bundle`).
- **Behaviour:**
  1. `builtin:demo-model`: one `native/model` layer, `glass` 0, `samples` 1, `speed <- sub` (0.5..2), `star: false`. Append its id to the I-LIB1 list; the test now asserts exactly 3 ids.
  2. `g3-bench.mjs model <port> 3` (M-PERF2): the demo as shipped, at `glass` 0 and at `glass` 1. Every round: billed p95 <= 5.00 ms. S1-T read 2.07 ms on the bare layer.
  3. If a round reads > 5.00, apply the levers of design L648 in order: the model target at scale 0.5, then a cap on the animal's screen coverage. If it still reads > 5.00, stop: R3 FAIL goes to the lead.
  4. Header note in `model.ts`: `samples` 4 costs 4.85 ms billed p95 on the bare layer (S1T-3c); the demo ships `samples` 1.
  5. `g3-60s.mjs model dnb174-arr <port>` (I-GOV1; the fluid half is F-B3's run).
  6. I-BUNDLE1: `npm run build`; the entry chunk has 0 occurrences of a string that only `three` contains (name the string that survives the minifier); a lazy chunk has >= 1. Report the entry gzip size against S4.1's baseline (LR-4).
  7. `g3-state.mjs bundle <port>` (I-BUNDLE2): 60 s from Start with no model layer; 0 requests for the three chunk.
- **Tests:** I-LIB1 final (Vitest). Rows: M-PERF2, I-GOV1, I-BUNDLE1, I-BUNDLE2.
- **Done:** Gates. The JSON files pass `check`.
- **Base / depends:** master / S4.4, S4.5, S4.6, S3.3. **New deps:** none.
- **Result (coder evidence; code commit `17754eb`, port 5176, a private Vite `cacheDir`, headless; evidence `scratchpad/gpu3d/s47-*` in the worktree, harness copies there too):**
  - `builtin:demo-model` (`scenes/builtin.ts`, after `builtin:demo-particles`): one `native/model` layer, values `glass` 0 and `samples` 1, `speed` ← `{ source: 'sub', amount: 1, attack: 0.05, release: 0.3, min: 0.5, max: 2 }`, `star: false`, res 1, layer speed 1. I-LIB1 lists the 3 ids (`toEqual`: exactly 3). RED with the demo starred (`s47-red-ilib1-starred.log`: `false` -> `true`).
  - M-PERF2 (`s47-bench-model.*`, `g3-bench.mjs model 5176 3`, alone, slow class: wireform+flash p95 3.47, apple / metal-3): billed p95 per round, chrome 2.43 / 2.50 / 2.57 (all 2.56), glass 1 2.19 / 2.63 / 2.63 (all 2.61). The model drew in every sampled frame (181 draws / 181 samples per round). No lever needed. `check` PASS.
  - I-GOV1, model half (`g3-60s.mjs model dnb174-arr 5176`): r4 alone PASS, 0 late / 3599, minScale 1, 0 governor steps, slow class (ref 4.17; `s47-60s-model-r4.*`). r3 the same values but OVERLAP (lane 1's Chrome). r1 alone FAIL, 6 late / 3576 (33-167 ms), minScale 0.85: macOS daemons (triald, axassetsd, MTLAssetUpgraderD, mds) started during it, load average 76.8 (`s47-60s-model.log`). `check` PASS on all three JSON files.
  - I-BUNDLE1 (`s47-bundle-build.json`, `s47-bundle-probe.log`; Node gzip): `THREE.WebGLRenderer` 0 in the entry, 8 in the lazy `host-BA1-iqzl.js` (641 773 B raw, 159 960 B gzip, the S4.4 chunk unchanged). Entry 369 853 B. Size row (lead ruling): the model module + the demo doc = the entry minus a probe build without both (`s47-probe.mjs`, edits reverted) = 369 853 - 368 914 = **+939 B <= 2 KB** (S4.4: +901 B for the module). Against `e166f16` (368 406 B, S4.4's build; no build-config change since): +1 447 B, of which +508 B is not the model layer. Against S4.1's baseline 365 603 B: +4 250 B. RED (a static `three` import in `model.ts`, reverted): 8 markers in the entry, entry 514 405 B (`s47-red-ibundle1-static.json`).
  - I-BUNDLE2 (`s47-bundle.*`, `g3-state.mjs bundle 5176`, alone): 0 three-side requests in 60 s from Start; the playlist (101 scenes) has no model layer; 3 scenes shown; music 45.6 s. RED with the demo starred (Start's `warm()` loads it): 6 requests, `src/three/host.ts`, three and its addons, `Wolf.glb` (`s47-red-ibundle2-starred.log`).
  - M-B5 control (`s47-anim.*`, information, LR S4.5): as shipped 19.50/255; `speed` 0 (clip frozen, orbit on) **0.88/255**, under the 1/255 line (S4.5: 0.93). `host.ts` is unchanged, so the orbit and the framing are unchanged.
  - M-V1 stills (information): `s47-still-chrome-1200.png` (the demo as shipped, over black) and `s47-still-glass-1200.png` (glass 1 over a 96 px checker), 1200 x 775; full size `s47-still-*.png`. Track: Kanine "Feel The Vibration" at 56.2 s, sub 0.31.
  - Gates exit 0: 678 tests (base 678).
- **Changed during implementation:**
  - The binding's attack 0.05 / release 0.3 are the file's common `sub` shape; the plan names the range only.
  - `g3-bench.mjs`: a model record has `kind: 'model'` with `glass` and `samples` in place of `pointsDrawn` and `count` (a model draws no points); `check` reads the field list of the record's kind (`M_REC`). The `model` rows also gate on the model's draws per sample window (0 while the load hides the layer). `stats()` gains `lateAt` (s into the window per late frame).
  - `g3-state.mjs bundle`: "the three chunk" on the dev server = a URL with `/three/` (`src/three/host.ts`), `/deps/three` (Vite's optimised three and addons), `/assets/host-` (the build's lazy chunk) or `.glb`. My first sanity rule, "music > 50 s", failed a valid run: the music starts ~14 s after Start, after the compile-all of 101 scenes (`s47-bundle-r1-musicrule.*`, the same values). The rule is now ">= 2 scenes shown, the music playing".
  - Not done, for the lead: matrix § Amendments assigns I-FL1's `flash` mode of `g3-60s.mjs` to "frontend-coder at S4.7"; the S4.7 text and the brief do not name it.
  - Base: S3.3, a listed dependency, is not in master `52beaf1`. No S4.7 row needs it.
  - Observation, not fixed: `s1t.mjs` instrument 2 matches three's stack frames with `/\.vite\/deps\/three/`. Under a private `cacheDir`, three is served from `/@fs/tmp/vite-cache-*/deps/three.js`, so the spy cannot match ("spy {}" in S4.3 and S4.6 ran under private caches). `/deps\/three/` matches both paths.
### S5.1 [x] Integration A: particles and fluid hygiene
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** the R4 hygiene rows of the two plain natives.
- **Files (scratch only):** `scratchpad/gpu3d/g3-state.mjs` (modes `leak`, `life`), `scratchpad/gpu3d/g3-px.mjs` (mode `fxafter-pf`).
- **Behaviour:**
  1. The harness loads the instrument of S4.1 with `import('/src/gl/glstate.ts')`. No product module imports it.
  2. `leak <port>` (I-GL2): the diff around one TF particle draw and around one fluid draw. Run the same mode on one shipped native as the control, and report the fields that the control also changes (LR-5).
  3. `life particles <port>` (I-LC1, with the `requestDevice` count) and `life fluid <port>` (I-LC2): 10 enter / exit cycles each.
  4. `fxafter-pf <port>` (I-B2): an invert fx after each layer, on a frozen frame.
- **Tests:** Vitest: none (no product code). Rows: I-GL2, I-LC1, I-LC2, I-B2. A row that is RED for a product reason follows the RED rule.
- **Done:** Gates (tree unchanged). Each mode prints its row result.
- **Base / depends:** master / S4.1, S3.3, S2.3. **New deps:** none.
- **Coder evidence (port 5176, private cacheDir `/tmp/vite-cache-s51`, base `9ceaa0b`; harnesses in the worktree's `scratchpad/gpu3d/`, prefix `s51-`):**
  - I-GL2 `leak` PASS after the fix: diff = {} over 146 fields for particles TF (12 draws, 1 POINTS draw each), particles splat (12 draws, 0 POINTS + 1 canvas upload each), fluid (13 draws); GL errors 0. The mutation (TF object + RASTERIZER_DISCARD + VAO left bound) reads exactly those 3 fields. RED before the fix (`s51-leak-red.log`): TF {CURRENT_PROGRAM, unit0/unit1 TEXTURE_2D, ARRAY_BUFFER_BINDING, blendFunc, COLOR_CLEAR_VALUE}, splat {CURRENT_PROGRAM, unit0/unit1 TEXTURE_2D, blendFunc}, fluid {CURRENT_PROGRAM, unit0/unit1 TEXTURE_2D}. **Finding (control, not an exemption):** native/spectrum leaves blendFunc, CURRENT_PROGRAM, unit0/unit1 TEXTURE_2D, ACTIVE_TEXTURE, COLOR_CLEAR_VALUE; every shipped native that ends with a twgl pass is expected to do the same (not measured).
  - I-LC1 `life particles` PASS: 30 exits over cycles 1-10 (the demo TF 49 152, a TF growth case 131 072, the splat path 1 M) = the post-warm-up baseline for every GL kind; at enter +4 buffers, +2 VAOs, +2 TF objects, +7 FBOs, +7 textures (+8 on the splat path); instances 34 = 34; requestDevice 1 (requestAdapter 1).
  - I-LC2 `life fluid` PASS: 10 exits = the baseline (programs 108 constant after the warm-up: the engine's cache); at enter +8 FBOs, +8 textures; instances 11 = 11.
  - I-B2 `fxafter-pf` PASS: max |B - (255 - A)| = 0 for particles (tile, 51 239 lit texels) and fluid (one kick splat, 100 732 lit texels).
- **Changed during implementation:**
  - **RED rule fix (I-GL2):** the row reads every field of S1T-1's list, and the three new-native draws left the fields their own passes set (the engine's program, twgl's sampler units 0-1 and attribute buffer, bloom's blendFunc, a clear colour). Root-cause fix in the natives, as `host.ts` does for three: `glstate.ts` exports `PASS_LIST` (those 7 fields); `native/particles` and `native/fluid` take `glState(gl, PASS_LIST)` at the start of `draw` and `restore()` it at the end (the DEV `vjwBare` early return too). Not "tree unchanged". New Vitest pin `I-GL2 PASS_LIST names instrument fields only` (RED on a misspelt key, `s51-igl2-vitest-red.log`). `glstate.ts` now sits on the entry path (particles imports it); the I-BUNDLE1 size row excludes particle-step growth (lead ruling), not measured. Each particle / fluid draw now issues about 15 more GL state calls (CPU side, no GPU work): P-R5-1's pin belongs in the lead's S6 alone rerun.
  - `leak` adds a sentinel pass (4 frames): inert fields (blend func / equation / colour, clear values, depth func, cull mode, front face, scissor box, polygon offset) are set to values no pass uses right before the snapshot. Without it, particles' blendFunc ONE, ONE read as unchanged after an `add` composite.
  - `life particles` covers three scenes (the demo as shipped, a growth case, the splat path) so the matrix bad input "the growth buffers" and the `requestDevice` count are exercised; cycle 0 warms the program cache and the device and is not counted.
  - `g3-px.mjs`: the frozen `f` gains `energy` (particles reads `att.bass`); `shot()` takes the sources (the fluid needs one kick rise).
  - Base: S3.3 (a listed dependency) is not in master `9ceaa0b`; `life fluid` and `fxafter-pf` ran on the S3.2 fluid. The lead re-runs them after S3.3 merges.
- **Lead-routed items:**
  - Harness merge: `g3-bench.mjs` = S2.4 (splat-a, splat-b, 60s splat) + S4.7 (model, 60s model, `lateAt`, model records `M_REC`); `g3-60s.mjs` lists particles, crossfade-1m, model, splat. The `.s47` copies are deleted in the worktree. Smoke, one run per mode, minimal rounds, NOT alone (lane 1 benches ran; `s51-smoke.log`, `s51-smoke-run1.log`): every mode ran to its row line. pin 5.36 (normal class; two earlier runs stopped on "no scale-1 sample": pin never resets the governor, under load), check P-REC PASS on a pin, an nstar, a run and a model record, nstar N* 49 152, model M-PERF2 line printed, splat-a / splat-b printed (SPLAT_MIN 262 144), run tf drew 49 152, cut 0 late per prepare, 60s particles 0 / 3599, crossfade-1m 0 / 3602, 60s model I-GOV1 0 / 3599, 60s splat 5 late (not alone). **Finding (pre-existing since S2.3, not a merge defect):** `cut` and `60s crossfade-1m` count POINTS draws only, so their 1 M case (now on the splat path) records `pointsDrawn: null` and exits 1 (P-B2 "FAIL", P-B11 no record) while the timing reads 0 late. The splat instrument (`probeOf().n`) is wired only for the splat modes.
  - Spectrum pair across the S4.1 `blend` arg: `builtin:spectrum` through `live.tile()` with a fixed FrameInput (`s51-floor.mjs tile`) at `2692601` (pre-S4.1, `git archive` tree) and at this branch: byte-identical, SHA-256 `3e94aedf…77b8` both, mean 0 / max 0 (71 % of texels lit); 10 fresh tiles per build all identical (in-session floor 0). Code reading agrees: between the two commits only `live.ts` and `scene.ts` change on that path (the 5th arg, which `spectrum.draw(f, v)` never reads; `straight()` false for spectrum; `bindable()` on bindings it has none of).
  - Spy regex (`s1t.mjs`): `/deps\/three/` + a non-blind check (`seen` = the first three call inside a host entry). `s1t.mjs diff` under the private cacheDir: spy {getProgramParameter: 1} (line 1's allowed call; `seen` = getContextAttributes at `/@fs/tmp/vite-cache-s51/deps/three.module-*.js`); line 1 diff after restore = {} for ctor, pmrem, compileAsync, upload, dispose, render x35; line 4 7/7. The S4.3 / S4.6 "spy {}" lines were blind; re-proven here as "getProgramParameter x1 only".
  - G11 floor: source of 0.08/255 = TD wave-2 S0.1 (STATE TAIL), a cross-session pair of builtin:spectrum frozen at 13.50 s (FFT-quantum jitter between page loads), not a two-read floor. Re-measured (`s51-floor.mjs stage`, 10 repeats of two reads 10 frames apart, builtin:spectrum frozen at 13.5 s, layer speed 0): 0/255 in all 10 repeats after a 150-frame settle; after 30 frames it decays 0.244 → 0.044 → 0.008 → ... → 0 by repeat 7 (the S1-T line-2 "floor" 0.34 / S4.6's 0.61 are this transient). Threshold source for S5.2: this measurement.

### S5.2 [x] Integration B: blends, compile, binding r
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** the R4 rows that need all three layers.
- **Files (scratch only):** `scratchpad/gpu3d/g3-px.mjs` (mode `blends-layers`), `scratchpad/gpu3d/g3-state.mjs` (modes `compile`, `binding-r`).
- **Behaviour:**
  1. `blends-layers <port>` (I-B1): particles, fluid and model, one per run, under the 7 blends: no `pageerror`, and the layer changes the frame against hidden, 21 of 21. Floor: 0.08 / 255 (S1-T line 2 measured 0.005 / 255 against it).
  2. `compile <port>` (I-SHADER1): 0 link failures, 0 `getCompilationInfo` errors and 0 GL errors over the particle TF program, the fluid programs, the model composite and the WGSL splat module.
  3. `binding-r dnb174-arr dubstep140-arr <port>` (I-B4): Pearson r between each new binding's output and its source, on both fixtures: `force <- sub` on `builtin:demo-fluid`, `speed <- sub` on `builtin:demo-model`.
- **Tests:** Vitest: none (no product code). Rows: I-B1, I-SHADER1, I-B4. A row that is RED for a product reason follows the RED rule.
- **Done:** Gates (tree unchanged). Each mode prints its row result.
- **Base / depends:** master / S4.7, S3.3, S2.4. **New deps:** none.
- **Coder evidence (port 5175, private cacheDir `/tmp/vite-cache-s52`, base `4f42d05`; harnesses in the worktree's `scratchpad/gpu3d/`, prefix `s52-`; not alone: another lane on 5176):**
  - I-B1 `blends-layers` PASS: 21 of 21 (layer, blend) deltas > 0/255 vs hidden; per-layer control (hidden vs hidden, same frozen instance) 0/0/0; page errors 0. Smallest: particles x max 0.0145/255 (0.36 % of texels change, max 95), then particles x dodge 0.17; normal / multiply 60-64. At the plan's 0.08/255: 20 of 21. bad_input (BAD=1, layer muted in A too): 0 of 21, FAIL (`s52-blends-layers-bad.log`).
  - I-SHADER1 `compile` PASS: link failures 0, getCompilationInfo errors 0 (1 WGSL module, created in the 1 M splat case), GL errors 0 in 364 draws (91 per case: particles TF 6 programs, splat 1 M 7, fluid 9, model 3), page: 282 link calls, 127 live programs, 0 failures, 254 live shaders, 0 compile failures. bad_input: BAD=wgsl FAIL (2 errors "64:12 expected ')'"); BAD=tf FAIL (link error "varying velOutBad does not exist", draws 0, page errors).
  - I-B4 `binding-r` PASS 8 of 8 (r: dnb174-arr / dubstep140-arr): particles swirl <- reese .962 / .804 (thin), glow <- build .896 / .926; fluid force <- sub .998 / .885; model speed <- sub .996 / .887; n 2720-3364 draws each. bad_input (BAD=1, every binding wired to hats, dnb174-arr): 0 of 4 (r .076, -.864, .262, .26), FAIL.
  - I-FL1 `flash` (`g3-60s.mjs flash <demo>`, dnb174-arr): fluid PASS (__flash 0; luma steps 3, all at the app's drop flash 31.9 s, max 3 per 1 s), model PASS (0; 2 at the drop). **particles FAIL in 2 of 2 runs: __flash 0, but 256 / 250 frame-mean luma steps > .10, max 12 / 9 in any 1 s** (frame-mean luma .021-.864, median .104; run 2: 134 of 250 steps within 2 frames of an `__src.onset` rise, the rest the decays after them): the onset burst (radial speed -> hot through the bloom) of `builtin:particles`' document, which the demo copies. Not fixed (RED rule: a look change on a starred scene's document, P-R5-1 pins its luma; the lead routes it). bad_input (BAD=1, layer opacity <- kick): particles FAIL (112 steps, max 6); model PASS (3 steps, the drop: the wolf covers ~11 % of the frame, median luma .002, so its pulse is no full-frame pulse: not a RED proof). The counter is non-blind on real data: 2 PASS / 1 FAIL, and the drop flash reads 2-3 steps in every run. The lead's S6 run is the evidence.
  - Splat counter: `cut` 1 M = drawn 1 048 576 of 1 048 576, path splat, P-B2 PASS (0 late per prepare, both cases); `60s crossfade-1m` = drawn 1 048 576, path splat, 0 late / 3601, P-B11 record, exit 0 (both were `pointsDrawn: null`, exit 1).
  - Merged-mode smoke (one run each, row line reached, page errors 0): `fluid` F-PERF1 5.54 ms FAIL (1 round, NOT alone: the binding-r Chrome ran beside it; not evidence), `60s fluid` F-B3 PASS 0 / 3599, `react` F-B2 PASS .076, `latency` F-LAT PASS median 0 frames, `fluid-nan` F-B1 PASS (new rule: share at |v| >= 999 = 0 in both reads, 4 mid reads, 118 scan reads + 236 mid; max |v| 530.5 mid).
  - Gates at `4f42d05` + harness-only work: lint 0, typecheck 0, test 0 (681 / 681).
- **Changed during implementation:**
  - The `### S5.2` heading was missing (its body followed S5.1's last bullet); restored with the tick.
  - I-B1 floor = 0/255, the S5.1 G11 re-measure (the lead's S5.2 brief names it the threshold source), plus a per-layer control that must read it; the plan's 0.08/255 is printed beside it (20 of 21 there). Base layer 25 % grey (64, M-B2's darker grey): over 50 % grey, `max` hid the tile's 4096 dim points (39 texels > 128, `s52-blends-layers-base128.log`). Frozen synthetic input (dt 0, fxafter-pf's sources) in place of the matrix's dnb174-arr.wav: a frozen pair makes "delta vs hidden" exactly the layer's share. Hidden = the layer muted (live.ts `mute()`, the panel's hide).
  - I-SHADER1 checks the programs bound inside each native's draws (cached programs included) and every live program the page linked; LINK_STATUS read after the frames (no sync in the link path). The TF bad input fails through draws 0 + page errors (twgl deletes the failed program).
  - I-B4 also measures the particles' existing bindings (the brief); r against the source value the binding read (the draw's sources arg: the Auto-style overlay for a built-in), the rl-bench precedent. The live check starts at 9 s (rl-bench): dubstep140-arr has no kick in 2-7 s (first run starved, `s52-binding-r-run1-starved.log`).
  - I-FL1: no demo native declares a flash-class input, so `__flash` reads 0 by construction; the WCAG luma cap = T-R3f's counter (matrix_amen_shatter: frame-mean luma steps > .10, <= 3 per 1 s), the only definition in the project. Mode `60s flash` in `g3-bench.mjs`, forwarded by `g3-60s.mjs flash <demo>`; per-frame trace [s, luma, __src.onset] in the JSON.
  - F-B1 (`fluid-nan`): the S3.3 mid-frame reads and scan merged; the S5.1 + S3.3 ruling (1) replaces "max |v| < 999": a read fails when > 0.5 % of its velocity texels read max(|vx|, |vy|) >= 999 (both reads, their mid reads, the scan and its mid reads). The new rule was not shown RED (S3.3 proved the read path RED).
  - The splat counter in `cut` / `60s crossfade-1m` is count-only (the n and the uploads; no post-copy marker pass, so their frame timing stays as in S1.6); `rec.path` added.
  - Harness merge: `g3-bench.mjs` (+ `fluid`, `60s fluid`, `60s flash`), `g3-px.mjs` (+ `react`, `latency`, `blends-layers`), `g3-state.mjs` (fluid-nan S3.3 reads + ruling, + `compile`, `binding-r`), `g3-60s.mjs` (lists fluid, flash). The `.s33` copies are deleted in the worktree copy; the main checkout's copies wait for the lead.
### S5.3 [ ] Integration B: recorder and context loss
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** the three layers survive a recording and a context loss (R4). The context-loss row also closes the S1-T gap for the model (s1t.md L34).
- **Files (scratch only):** `scratchpad/gpu3d/g3-rec.mjs`, `scratchpad/gpu3d/g3-cl.mjs` (bases: the newest recorder and context-loss harnesses in `scratchpad/ed/`; name them in the report).
- **Behaviour:**
  1. Both scripts build one scene with the three demo layers in one stack, through the editor path. No fourth built-in is added.
  2. `g3-rec.mjs 10 <port>` (I-REC1): a 10 s recording; duration within 0.3 s; one decoded frame with mean luma > 0.02; 0 `pageerror`.
  3. `g3-cl.mjs <port>` (I-CL1): dispatch `webglcontextlost` on the stage; exactly 1 reload; Ready within 10 s; 0 uncaught errors after the reload.
- **Tests:** Vitest: none. Rows: I-REC1, I-CL1.
- **Done:** Gates (tree unchanged). Both scripts print their row result.
- **Base / depends:** master / S4.7. **New deps:** none.

### SDLC S6 and S7 (lead; no coder step)
- S6: on the final commit the lead runs Gates and every browser, visual and performance row with its matrix command (port swapped), performance rows alone. The lead fills § Gate record and the R1 record. Then the tester (AV QA).
- S7: no creative gate (the lead's brief; CLAUDE.md § Tier 3, non-visual changes). The lead sends the M-V1 stills as information. W-M1-W-M4 wait for the user's PC.

## Row owners (83 matrix rows, one owner each)
| Owner | Rows |
|---|---|
| lead, every merge | G-GATE |
| S1-T (spike, passed) | S1T-0, S1T-1, S1T-2, S1T-3a, S1T-3b, S1T-3c, S1T-4, S1T-5, S1T-6, S1T-7, S1T-8, S1T-9 |
| S1.1 | P-REC, R6-PRE, P-R5-1 |
| S1.2 | P-U5, P-R5-2 |
| S1.3 | P-U2, P-U3, P-U4 |
| S1.4 | P-U1, P-U6, P-B1, P-B3 |
| S1.5 | P-PERF1, I-LIB1 |
| S1.6 | P-B2, P-B4, P-B10, P-B11 |
| S2.1 | P-U7, P-U8 |
| S2.2 | P-B6, P-B7 |
| S2.3 | P-B5, P-B8, P-B9 |
| S2.4 | P-PERF2, P-PERF3, P-PERF4 |
| S3.1 | F-U1, F-U2, F-U3, F-U4 |
| S3.2 | F-B1 |
| S3.3 | F-PERF1, F-B2, F-LAT, F-B3 |
| S4.1 | I-GL1 |
| S4.2 | M-U6 |
| S4.3 | M-U1, M-U2, M-U3, M-U4 |
| S4.4 | M-U5, I-B3 |
| S4.5 | M-B5, M-B6, I-LC3 |
| S4.6 | M-B1, M-B2, M-B3, M-B4; plus M-B7 (proposed, not in the matrix) |
| S4.7 | M-PERF2, I-GOV1, I-BUNDLE1, I-BUNDLE2 |
| S5.1 | I-GL2, I-LC1, I-LC2, I-B2 |
| S5.2 | I-B1, I-SHADER1, I-B4 |
| S5.3 | I-REC1, I-CL1 |
| manual (user) | M-V1 (information, no gate), W-M1, W-M2, W-M3, W-M4 |

Count: 1 + 12 + 26 (P) + 9 (F) + 13 (M without M-V1) + 16 (I) + 1 (R6-PRE) + 5 manual = 83.
## Acceptance mapping (spec_gpu3d §4)
| ID | Proved by |
|---|---|
| R1 | CP1 + CP2. Line 1: S1.5 P-PERF1 (N*_shipped). Line 2: S1.6 P-B4, P-B11 (1 M on TF, recorded). Line 3: S1-W PASS (bare) + S2.4 P-PERF2, P-PERF3 (as shipped; the claim through the splat path waits for row B: matrix ruling G2, LR-2). Support: P-U1-P-U8, P-B1-P-B3, P-B5-P-B10, P-PERF4, P-REC. |
| R2 | CP3: S3.1 F-U1-F-U4; S3.2 F-B1; S3.3 F-PERF1 (<= 4.00 ms), F-B2, F-LAT, F-B3. |
| R3 | S1-T lines 3a, 3b, 3c, 5, 6, 7, 8 (PASS, on Fox). CP4 on the CC0 animal: S4.2 M-U6; S4.3 M-U3; S4.5 M-B5, M-B6; S4.7 M-PERF2. M-V1: stills to the user, information only. |
| R4 | S1-T lines 0, 1, 2, 6, 7, 8 (PASS). Blend: S5.2 I-B1; S4.6 M-B2 and the `layer0` check. Fx after: S5.1 I-B2; S4.6 M-B4. Bindings: S4.4 I-B3; S5.2 I-B4. Governor: S1.6 P-B10; S3.3 F-B3; S4.7 I-GOV1. Recorder: S5.3 I-REC1. Context loss: S5.3 I-CL1. `device.lost`: S2.3 P-B8, P-B9. Hygiene: S4.1 I-GL1; S5.1 I-GL2, I-LC1, I-LC2; S4.5 I-LC3; S5.2 I-SHADER1. |
| R5 | S1.3 P-U4; S1.1 P-R5-1; S1.2 P-R5-2 (waiver G1); S1-T line 9 (PASS); S4.7 I-BUNDLE1, I-BUNDLE2; G-GATE at every merge. |
| R6 | Mac: S1.1 R6-PRE on every bench record; S2.3 P-B9. Windows: stated in design § R6 statement rev 1; W-M1-W-M4 on the user's PC (manual, later). |

- Rulings: N1 -> S1.3, S1.4. N2 -> S1.5, S2.4. N3 -> S4.6. N4 -> S2.1, S2.4. N5 -> S4.3. N6 -> S1.4. N7 -> S4.4. C8 -> S1.2, S1.4. C10 -> S1.5 (I-LIB1). C11 -> W-M1-W-M3. The full ID lists: matrix §3.
- The S1-T gaps (lead update, item 5; s1t.md L34):

| Gap | Step | Row |
|---|---|---|
| Two instances at once (shared skeleton; a Library tile while the stage draws) | S4.5 | M-B6 |
| Context loss | S5.3 | I-CL1 |
| The model as layer 0 on the direct path | S4.6 | `layer0` = M-B7 (proposed) |
| N7 tile bake (the native enters the catalog) | S4.4 | M-U5 |
| The Quaternius CC0 animal in place of Fox | S4.2 | M-U6 (+ M-U3 in S4.3) |

- No creative spec exists for this epic, so there is no creative §8 mapping.
## Gate record (the lead fills it; UNKNOWN is never PASS)
| Stage | Status | Reviewer | Evidence | Waiver |
|---|---|---|---|---|
| S2 skeptic (design) | PASS by lead ruling | architecture-skeptic + lead | `design_gpu3d.md` § Lead rulings, recheck round (L773-L780) | N1 fixed by text; N2-N7 ruled; no second recheck round |
| S2 matrix | PASS | test-architect + lead | `matrix_gpu3d.md` (83 rows) + its § Lead rulings; commit `9559aac` | G1: the bit-identical frozen-pair gate is waived for `builtin:particles` only; replaced by P-R5-2 (KS D <= 0.011) + P-R5-1 |
| S3 spike S1-P | FAIL on its pass line; done and routed | lead | `scratchpad/gpu3d/s1p.md` @ `bce1f81`: 1 M billed p95 11.10-14.58 ms > 5.0; 0 late / 3602 | routed: keep TF; bare N* = 131 072 |
| S3 spike S1-W | PASS (stage 1 and stage 2, bare) | lead | `scratchpad/gpu3d/s1w.md` @ `55d06ba`: 4.84 ms, 0 late / 3601 | row B not measured (G2) |
| S3 spike S1-T | PASS, lines 0-9 (lead update, 2026-11-16) | lead | `scratchpad/gpu3d/s1t.md` @ `334631f`: chrome 2.07 ms, glass 2.07 ms, 4 samples 4.85 ms | 5 items not tested in the spike; each has a step (§ Acceptance mapping) |
| S3 user | UNKNOWN; not applicable | - | the lead's brief: no stills gate (non-visual architecture; the demos are unstarred) | - |
| S4 coverage | UNKNOWN | test-architect | - | - |
| S6 gates | UNKNOWN | lead | - | - |
| S6 AV QA | UNKNOWN | tester | - | - |
| S7 user | UNKNOWN; not applicable | - | as S3 user | - |

- The brief names S1-P "done". The table writes FAIL because its pass line (1 M at billed p95 <= 5 ms) was missed; the lead may reword it.

### R1 record (design L539-L543)
| Line | Status | Figure |
|---|---|---|
| 1. N*_shipped (P-PERF1) | UNKNOWN | count, res, billed p95 |
| 2. 1 M on TF, L-class (P-B4, P-B11) | UNKNOWN | billed p95, late frames, `minScale`; record only |
| 3. S1-W | PASS at stage 2, bare: 4.84 ms. As shipped (P-PERF3): UNKNOWN | - |
## Lead rulings needed
- **LR-1 (veto only).** Under matrix rulings G6 / G7 the planner fixed the 3 demo ids, the binding list and the policies of § Planner-fixed names and policies. Two items go beyond naming: the value list of `native/fluid`, and the `speed` value of `native/model`. The design names neither.
- **LR-2 (after P-PERF3).** The particle demo's shipped `count` and res, and the form of the R1 claim. Proposed rule: if row B at 1 048 576 reads <= 5.00 ms at some res, the demo ships 1 048 576 at that res and R1 passes by its first clause (TF stays L-class where WebGPU is absent). Otherwise the demo stays at N*_shipped and R1 closes as "measured ceiling + lever". Also confirm `SPLAT_MIN`.
- **LR-3 (lane order).** S4.1 (the merge of S1-T) depends on nothing. Proposed: dispatch it on the second lane during CP1. Then the `blend` line of CP1's frozen contract is true at the CP1 close, and the instrument is in `master` early. S2.1 and S3.1 also depend on nothing.
- **LR-4.** I-BUNDLE1's "entry gzip delta <= 1 KB (proposed)". `scenes/model.ts` stays on the entry path. Proposed: the marker rule gates; the delta against S4.1's baseline is recorded; the lead accepts the measured size or orders a lazy shim.
- **LR-5 (for the coverage check).** Deltas against the matrix text:
  - (a) M-U3 and M-B5 use the shipped CC0 model. `donor/` is not in git, so a worktree has no Fox.
  - (b) P-B4's `2` (px) argument = "as shipped". No px knob ships.
  - (c) P-B9 is owned in CP2: it needs the WebGPU harness.
  - (d) I-GL1 lands in S4.1: the spike has the instrument and its test.
  - (e) F-PERF1 runs in S3.3 (ruling G5), and again at SDLC S6.
  - (f) I-GL2 may read RED on bindings that every shipped native leaves. S5.1 reports a control native.
  - (g) A new row is proposed: M-B7, the model as layer 0 (S4.6, mode `layer0`).
  - (h) M-V1 is information, not a gate (the lead's brief).
  - (i) `Fox.glb` is in the tree from S4.1 to S4.2, with its THIRD_PARTY rows (the lead's merge list). M-U6 lands in S4.2.
- **LR-6 (downloads).** Two coder downloads: the fluid upstream file (S3.2) and the Quaternius pack (S4.2). If a source needs a login or a manual click, the lead fetches it.
- **LR-7 (only if `layer0` is RED).** If the fix for the model as layer 0 needs an engine change (the direct path), the lead rules. The plan allows fixes inside `host.ts` and `model.ts` only.

## Notes for the lead
- Host rule 3 rev 1 in the design is false on one point (s1t.md L5): our ambient UNPACK_ALIGNMENT is 1. CP4's contract records the corrected rule; the design text is not edited by this plan.
- S1-T measured 1.7 ms median on the main thread per model draw (s1t.md L32). No matrix row gates it; S4.7's 60 s run (I-GOV1) shows whether it causes late frames.

## Lead rulings (2026-11-16)
- **LR-1 ACCEPTED:** demo ids `builtin:demo-particles`, `builtin:demo-fluid`, `builtin:demo-model` (all unstarred); bindings `force ← sub` (fluid), `speed ← sub` (model); policies NaN → 65 536 + `Math.round`; splat count saturates at 65 535 with the marker in channel B of texel (0, 0); `samples` = `v ≥ 4 ? 4 : 1`; fluid `V_MAX = 1000`; the fluid values (`force`, `radius`, `curl`, `fade`) and the model `speed`.
- **LR-2:** decided after P-PERF3 (the shipped particle demo count / res, the R1 claim form, `SPLAT_MIN`).
- **LR-3 ACCEPTED:** S4.1 (merge S1-T `334631f`) runs on the second lane during CP1, so the `blend` contract line is true at the CP1 close; S2.1 and S3.1 are also free for lane 2.
- **LR-4 ACCEPTED:** I-BUNDLE1 entry gzip delta ≤ 1 KB.
- **LR-5:** the matrix deltas go to the test-architect's S4 coverage check (accept unless coverage rejects).
- **LR-6 ACCEPTED:** coders fetch the fluid upstream file and the Quaternius pack from their official sources with licences recorded; a source that needs a login or a manual click goes to the lead.
- **LR-7 ACCEPTED:** if `layer0` reads RED and the fix needs an engine change on the direct path, the step stops and routes to the lead.
- **Gate record wording:** S1-P "FAIL on its pass line; done and routed" is correct as written.

## Lead rulings — S4 coverage (2026-11-16)
- **Coverage FAIL (B1–B3) → closed by the lead:** B1 row I-FL1 (flash ≤ 3/s + WCAG luma cap on the three demo layers, run at S6, owner lead) and B3 row M-B7 appended to the matrix (§ Amendments); B2 M-U6 tightened in S4.2 (CC0 1.0 exact, https source, after Fox is deleted). **S4 coverage = PASS by lead ruling.**
- **M-V1:** information only; the S3/S7 user gate is waived for GPU3D (non-visual architecture, unstarred demos, the user's «no video checks now»); stills still go to the user as information.
- **User order «пока никакие сцены не делаем»:** the three `builtin:demo-*` are capability demos (spec_gpu3d §3), unstarred, outside the autopilot → consistent with the order. Go.
- **Non-blocking notes (coverage §E):** P-R5-1's post-change comparison = the lead's S6 rerun; I-LIB1 closes at S4.7; add one before/after frozen pair on `builtin:spectrum` to S4.1's checks (the `blend` arg touches every native); G11 (the 0.08/255 floor source) is cited or re-measured before S5.2.
- **LR (S1.1 finding, 2026-11-16):** P-R5-1's cost band = the spread of all 9 pre rounds across the 3 pre sessions (5.16–5.33 → **0.17 ms**), not one session's within-run band (0.09); luma band stays 0.01. Threshold source recorded here; no other threshold changed.
- **LR (S2.1 finding RG-5, 2026-11-16):** the governor never read `gpuMs`; S2.1 added an optional `frame(now, jsMs, gpuMs)` argument. **S2.4 owns the one-line wiring** `governor.frame(now, js, gpuMs.get(id))` at `app.ts:399` so `gpuCostMs` = gpuMs + the WebGPU term in the running app.
- **LR (S1.2 findings, 2026-11-16):** P-B1 domain checks use a float32 tolerance of 1e-6 (0.18 % of ids land at r = 0.0599999937 from float32 rounding). The 1/256 hash grid (≈ 46 % of ids, existing `r1`/`r2` too) is watched at 1 M points in S1.5's Bench N* still: faint rings → switch to an integer hash in that step; none → leave it.
- **LR (S3.2 findings, 2026-11-16):** (1) F-B1's non-finite count is blind on Metal (fp16 saturates, `clamp(NaN)` → ±bound): F-B1 also fails when any velocity texel reads |v| ≥ 999 (the NaN-clamp signature) during the normal music window; the luma check stays. (2) F-PERF1 p95 4.09 (not a bench) already tops 4.00 → S3.3 applies the lever (DYE 512, PRESSURE_ITER 12) if its alone bench misses. (3) The tile bake slice overruns a frame (14–16.5 ms; dye 1820×1024) → S3.3 sizes the tile's dye to the tile.
- **LR (I-BUNDLE1 baseline, 2026-11-16):** the hard gate is the marker (`THREE.WebGLRenderer` = 0 in the entry, > 0 in the lazy chunk). The size row measures only what the model layer adds to the entry — the model module + `builtin:demo-model` — against the entry right before S4.4 (`e166f16`): **≤ 2 KB** (S4.4 measured +1 017 B; S4.7 records the final). Entry growth from the particle / fluid steps is not part of this row.
- **LR (S4.5, 2026-11-16):** M-B6 "t differs" = the clip PHASE differs; pairs a whole loop apart (Gallop 0.5417 s) are reported separately and are not failures; "0 when t is equal" is shown by the own-t probe check. M-B5's frozen-clip control (0.93/255 vs the 1/255 line) is thin: S4.7 keeps the demo's orbit / framing so the control stays below the line, and reports it.
- **LR (S2.2 notes, 2026-11-16):** (1) S2.3 draws the TF path on any frame where the splat `index` did not move (first frame, rebuilds). (2) N4 honest billing: S2.4 includes Chrome's canvas snapshot at `texImage2D` (≈ 0.35 ms at 1 M) in the bill — measured per row with the S1-W post-copy marker; the governor feed = `webgpuMs()` + that measured snapshot term as a constant until it can be timed per frame. (3) S2.3 imports `splat.ts` with a dynamic `import()` (no cycle; loads only when n ≥ `SPLAT_MIN`). (4) The R/G decode uses NEAREST / `texelFetch` (the milk `copy()` samples LINEAR).
- **LR (S4.7 open items, 2026-11-16):** (1) **I-FL1** (flash ≤ 3/s + WCAG luma cap on the 3 demos): the `flash` mode of `g3-60s.mjs` is written in **S5.2**; the lead runs I-FL1 at S6. (2) **S1-T spy regex** `/\.vite\/deps\/three/` misses private-cacheDir paths (`/@fs/tmp/vite-cache-*/deps/three.js`) → **S5.1** changes it to `/deps\/three/` and re-runs the spy for the model (the S4.3 / S4.6 "spy {}" lines are re-proven there). (3) **Harness divergence:** `g3-bench.mjs` (main, with S2.4 splat modes) and `g3-bench.s47.mjs` / `g3-60s.s47.mjs` (S4.7 model modes) — **S5.1** merges them into one `g3-bench.mjs` / `g3-60s.mjs` with every mode.
- **LR (S5.1 + S3.3 findings, 2026-11-16):** (1) F-B1's NaN rule: with `force ← sub` legitimate velocity reaches ≈ 784 and can clamp at 1000 for real, so F-B1 fails when **> 0.5 % of velocity texels read |v| ≥ 999 in any read (mid-frame reads included)**, or the luma check fails — a NaN spreads, a real clamp stays local. (2) `cut` and `60s crossfade-1m` count POINTS only → their 1 M case on the splat path records `pointsDrawn: null`: **S5.2** wires the splat instrument into those modes. (3) **Harness divergence again:** `g3-bench/g3-px/g3-state/g3-60s.s33.mjs` (S3.3 fluid modes: `fluid`, `60s fluid`, `react`, `latency`, the fluid-nan mid-frame reads) → **S5.2** merges them into the main files. (4) Re-run `life fluid` and `fxafter-pf` on the S3.3 fluid at S6. (5) F-B3 (fluid 60 s) alone run at S6. (6) Control dirt: `native/spectrum` leaves blendFunc / program / units / clear colour (finding, not an exemption → hardening).
