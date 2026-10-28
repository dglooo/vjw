# Plan — effects (epic `effects`, Stage 2a)

## TL;DR
- 27 atomic steps in 7 checkpoints. Variant A: our own ISF loader on twgl, one shader runtime for ISF, Shadertoy paste and gl-transitions, the 4 pilot scenes as native generators behind the same `inputs`/`values` contract.
- CP1 is the thinnest slice: ISF parser + ES 1.00 codegen, bindings math and `SceneDoc` (all pure, tested), then one ISF kaleidoscope over the tunnel as a 1-layer doc with one float bound to bass, on screen. CP2 probes G1–G3 through a `?bench` page the lead runs with Playwright, brings the other 3 natives back and adds compile-all-at-Start + prepare-ahead. CP3 is the rest of the engine (persistent targets, layers + blend, ISF passes, transition pass, audio textures, Shadertoy node). CP4 is content in 5 batches gated by `?bench`. CP5 the panel, CP6 IndexedDB + JSON + stars, CP7 closeout.
- **Binding sources are open ids** (lead's note 2026-10-28): `Binding.source` is a string resolved through a per-frame `Record<string, number>` registry. Exactly the spec §2.2 sources are filled now; later epics add keys without touching the math or the scene format.
- Gates for every step: `cd web && npm run lint && npm run typecheck && npm test`. The lead commits after each green CP (CLAUDE.md § Commands, Git line).

## Freshness
- Authored 2026-10-28 by planner (Fable 5.1) from: `agents/STATE.md` HEAD (gate 2026-10-28); `thoughts/spec_effects.md` (all); `agents/system-designer/design_effects.md` TL;DR, Constraints, E1–E8, Variant A, Defaults taken, Research gaps G1–G3, Decision needed; `agents/research/research_editor_effects.md` §1, §2, §3, §4 (webgl-noise/hg_sdf rows only, pointed to by E8), §6; `agents/planner/plan_pilot.md` drift notes S1.5, S3.1–S3.7, S4.1–S4.3, S5.1–S5.4, S6.1; CLAUDE.md § Commands (incl. Git), Constraints (hard), Agents.
- Code read 2026-10-28: `web/src/gl/engine.ts`, `gl/scene.ts`, `app.ts`, `main.tsx`, `director.ts` (head), `playlist.ts`, `store.ts`, `frame.ts`, `scenes/tunnel.ts`, `ui/Overlay.tsx` (head), `vite.config.ts`, `package.json`. `OwnSceneId` is used by `engine.ts`, `playlist.ts`, `director.ts`; `director.test.ts` imports `playlist`. The installed `twgl.js@7.0.0` typings contain no `createProgramInfoAsync` / `KHR_parallel_shader_compile` (grep of `node_modules/twgl.js/**/*.d.ts`), so async compile is raw WebGL (S2.5).
- No `donor/` dir and no internet for the planner. Stale when design E1–E8 or spec §2 change, or after 60 days.

## Chosen variant
`design_effects.md` § "Variant A — own small ISF loader on twgl" + shared E1–E8 + "Defaults taken". User gate 2026-10-28: Q1 = A; Q2 counts = ≥30 usable effects/generators, ≥5 per category (the 4 pilot natives count), ≥10 gl-transitions. All other choices are the designer's defaults, not reopened here.

**Deviations from the design, all additive:** `render(shot, f, s)` stays and `engine.setTransition(id)` carries the transition (instead of a 4th `render` parameter), `Director` gains `peek()` for prepare-ahead, `Live` gains `errors`, `Binding.source`/`Sources` are open (lead's note).

**Prerequisites for the lead (no internet for coders beyond docs):** shallow-clone into `donor/` before the step that needs them: `https://github.com/msfeldstein/interactive-shader-format-js` (MIT; S1.1), `https://github.com/Vidvox/ISF-Files` (MIT; S1.5, S2.2), `npm pack gl-transitions@2.0.0` extracted (MIT; S4.5), `https://github.com/stegu/webgl-noise` (MIT; S4.2–S4.3) and `hg_sdf.glsl` from `https://mercury.sexy/hg_sdf/hg_sdf.glsl` (MIT option; S4.2). Pilot S6.1 must be closed before S2.2 (it edits `main.tsx`).

Conventions: every step starts with **"Invoke the `ponytail` skill (full) before writing code."** Paths are under `web/`. Singletons at module level, never in Effects. Knobs are named constants at the top of a module. Content batches (CP4) are exempt from the ≤3-file rule by the brief: one coder session per batch, shader files + `scenes/builtin.ts` only. Every ported file keeps its author/URL/license header; own files carry `// VeeJay Wizard, <year>` and the inlined library headers.

## Checkpoints

### CP1 — thinnest slice: ISF kaleidoscope over the tunnel, one float on bass (S1.1–S1.6)
**Frozen contract (CP1):**
```ts
// fx/types.ts
export type Category = 'feedback' | 'geometry' | 'liquid' | 'retro'
export type Kind = 'generator' | 'filter' | 'transition'
export type InputType = 'float' | 'long' | 'bool' | 'event' | 'color' | 'point2D' | 'image' | 'audio' | 'audioFFT'
export type Value = number | boolean | readonly number[]           // color [r,g,b,a], point2D [x,y]
export interface Input { name: string; type: InputType; label?: string; default?: Value; min?: Value; max?: Value; values?: number[]; labels?: string[] }
export interface EffectDef { id: string; name: string; kind: Kind; category?: Category; credit: string; inputs: readonly Input[]; bind?: Readonly<Record<string, Binding>> }
export interface PassDef { target?: string; persistent: boolean; float: boolean; width?: string; height?: string }
export interface ShaderDef extends EffectDef { glsl: 100 | 300; vs: string; fs: string; passes: readonly PassDef[] }
// fx/isf.ts (pure)
export function parseIsf(src: string, id: string): ShaderDef          // throws a readable Error on a bad header
export function sizeExpr(expr: string, vars: Record<string, number>): number   // whitelist evaluator for PASSES WIDTH/HEIGHT
// bind.ts (pure). Open source ids (lead's note): the registry is filled per frame, bindings never enumerate it.
export type Shape = 'sine' | 'tri' | 'saw' | 'square' | 'random'
export interface Binding { source: string; amount: number; attack: number; release: number; min: number; max: number; shape?: Shape; rate?: number }
export type Sources = Record<string, number>                        // keys now: bass mid treb band0..band31 onset beat bar lfo confidence
export const SOURCE_IDS: readonly string[]                          // the keys sources() fills, for the panel list
export function sources(f: FrameInput, out: Sources): Sources        // no allocation
export function evaluate(b: Binding, s: Sources, state: BindState, dt: number): number
// doc.ts (pure)
export type SceneId = string                                        // 'builtin:<slug>' | crypto.randomUUID()
export type Blend = 'normal' | 'add' | 'screen' | 'multiply'
export interface NodeDoc { ref: string; code?: string; credit?: string; values?: Record<string, Value>; bind?: Record<string, Binding> }
export interface LayerDoc { gen: NodeDoc; fx: NodeDoc[]; blend: Blend; opacity: number; speed: number; res: number; bind?: Partial<Record<'opacity' | 'speed', Binding>> }
export interface SceneDoc { v: 1; id: SceneId; name: string; star: boolean; layers: LayerDoc[] }   // 1..4, bottom first
export interface LibraryFile { v: 1; scenes: SceneDoc[] }
export function parseScene(x: unknown): SceneDoc; export function parseLibrary(x: unknown): SceneDoc[]
export function defaults(def: EffectDef): Record<string, Value>
// gl/scene.ts
export interface Native { draw(f: FrameInput, v: Readonly<Record<string, Value>>): void; dispose?(): void }  // into the bound FB
export interface NativeDef extends EffectDef { create(gl: WebGL2RenderingContext): Native }
// gl/engine.ts (additive)
export type Target = ReturnType<typeof renderTarget>
export function program(vs: string, fs: string): ProgramInfo         // memoised by source
export function draw(info: ProgramInfo, uniforms: Record<string, unknown>): void   // the shared triangle
export function render(shot: Shot, f: FrameInput, s: Sources): void
// gl/live.ts
export interface Live { readonly doc: SceneDoc; readonly errors: readonly string[]; render(f: FrameInput, s: Sources, acc: Target): void; rebuild(): void; dispose(): void }
export function live(id: SceneId): Live                              // cached by id
// director.ts: OwnSceneId → SceneId (string); Shot/Director otherwise unchanged
```
**Demo:** `cd web && npm run dev`, Start, line-in or a dropped file. The autopilot alternates Tunnel and the new "Kaleido tunnel" (tunnel through an ISF kaleidoscope); in the latter the bound float (e.g. the kaleidoscope angle) moves with the bass. `←/→` work. Spectrum, particles and glitch return in CP2. Console: 0 errors, no "unknown ref".

### CP2 — probes G1–G3, natives back, compile-all + prepare-ahead (S2.1–S2.5)
**Frozen contract (CP2):**
```ts
// director.ts (additive)
export interface Director { …; setPlaylist(ids: readonly SceneId[]): void; peek(): SceneId }   // peek = the autopilot's next id
// gl/engine.ts
export const gpuMs: Map<SceneId, number>        // median of the last 8 timer results per scene; empty without the extension
// gl/live.ts
export function warm(ids: readonly SceneId[], onProgress?: (done: number, total: number) => void): Promise<void>   // programs only
// store.ts: compiling: string | null           // 'compiling 7/41' behind Start, null when done
// bench.ts: window.__bench = { items: { id, kind, category }[], results: { id, gpuMed, gpuP95, glError, consoleErrors, compileMs }[], done: boolean }
```
**Demo:** all 4 pilot scenes + Kaleido tunnel cycle as before. Start shows "compiling n/N" for a moment. The lead runs `?bench` (and `?bench&sweep`) fullscreen at 60A on the M4 via Playwright, records G1 (ms per program, total), G2 (late frames per allocation burst), G3 (timer query present in the user's Chrome: the user opens `?bench` once and reads the first line) in STATE.

### CP3 — layers, passes, transitions, audio textures, Shadertoy (S3.1–S3.4)
**Frozen contract (CP3):**
```ts
// fx/glsl.ts (pure)
export function commentParams(src: string): Input[]                  // `uniform float foo; // = 1.0` → float inputs
export function wrapToy(code: string): { vs: string; fs: string; inputs: Input[]; prefixLines: number }
export function wrapTransition(glsl: string): { vs: string; fs: string; inputs: Input[] }
// gl/engine.ts
export function renderTarget(hdr?: boolean, persistent?: boolean): Target   // persistent: fit() resamples instead of clearing
export function setAudio(magDb: Float32Array, wave: Float32Array): void     // R8 textures fft 512×1, wave 512×1, toy 512×2
export const audioTex: { fft: WebGLTexture; wave: WebGLTexture; toy: WebGLTexture }
export function setTransition(id: string): void                             // 'gl/<Name>' | 'own/crossfade'
// fx/catalog.ts
export const catalog: ReadonlyMap<string, EffectDef>; export const transitions: readonly string[]
export function toyDef(node: NodeDoc): ShaderDef                            // ref 'toy/<uuid>' from inline code
```
**Demo:** the autopilot also plays "Particles over tunnel" (2 layers, `add`), "Trails spectrum" (a `PERSISTENT` ISF filter whose trails survive a governor step with no pop) and "Toy plasma" (an own `mainImage` fixture). Fades still look like the pilot (the `own/crossfade` transition). `?debug` shows 0 drops over 2 min.

### CP4 — content: ≥30 effects in 4 categories, ≥10 gl-transitions, built-in scenes (S4.1–S4.5)
**Frozen contract (CP4):** effect ids are stable strings `isf/<file-stem>`, `own/<file-stem>`, `native/<name>`, `gl/<Name>`; SceneDocs reference them, so a file rename is a breaking change from here on. Every curated effect appears in ≥1 starred built-in.
**Demo:** the autopilot cycles ~16 built-in scenes with random gl-transitions, never the same twice in a row; 0 console/GL errors over a full cycle; the lead's contact sheet (one screenshot per `?bench` item) is what the user reviews and prunes.

### CP5 — panel (S5.1–S5.3)
**Frozen contract (CP5):**
```ts
// gl/live.ts
export type NodePath = { layer: number; node: 'gen' | 'layer' | number }   // number = fx index
export const panel: { setValue(p: NodePath, input: string, v: Value): void; setBinding(p: NodePath, key: string, b: Binding | null): void; addFx(layer: number, ref: string): void; removeFx(layer: number, i: number): void; addLayer(genRef: string): void; removeLayer(i: number): void; setBlend(layer: number, b: Blend): void; pasteToy(code: string, credit: string): string | null }
// store.ts (additive): panel: boolean; editRev: number; edited: SceneId; gpuMs: number | null; nodeErrors: string[]
```
**Demo:** `E` opens the panel (the autopilot holds; `Esc` closes and restores the previous hold). Drag a tunnel slider: instant, no re-render stutter. Toggle a binding on `twist` → bass, set range: it moves with the music. Add "Kaleidoscope" from the Feedback list, remove it. Paste a single-pass Shadertoy `mainImage` with a credit: a new generator layer appears; a bad paste shows the compile log with the right line numbers.

### CP6 — storage: IndexedDB, JSON export/import, stars → autopilot (S6.1–S6.2)
**Frozen contract (CP6):**
```ts
// library.ts
export const library: { load(): Promise<void>; get(id: SceneId): SceneDoc | undefined; all(): SceneDoc[]; put(doc: SceneDoc): Promise<void>; del(id: SceneId): Promise<void>; setStar(id: SceneId, on: boolean): void; playlist(): SceneId[]; exportLibrary(): void; importFile(f: File): Promise<string | null>; onChange(cb: () => void): () => void }
```
**Demo:** edit the tunnel, "Save as" → "My tunnel", star it: it joins the autopilot after the built-ins. Reload: still there, bindings intact. Export → one `veejay-library-<date>.json`; delete the DB in DevTools, Import the file: restored. Unstar → it leaves the playlist without cutting the current scene.

### CP7 — closeout (S7.1–S7.2)
**Contract:** none new. **Demo:** `THIRD_PARTY.md` lists every ported shader file; gates + `npm run build` green; the lead's Playwright regression (`cp3-demo.mjs`-style: autopilot, keys, fades, 0 late frames, 0 GL errors) passes on the new engine; optional 30-min 60A run by the user (Δdrops ≤ 30).

## Steps

### S1.1 `[x]` `fx/types.ts` + `fx/isf.ts`: ISF header parser, ES 1.00 codegen, pass-size expressions, with tests
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** `parseIsf(src, id) → ShaderDef`, pure, no GL.
- **Files:** `web/src/fx/types.ts`, `web/src/fx/isf.ts`, `web/src/fx/isf.test.ts`.
- **Behaviour:** the JSON header is the leading `/* … */` comment (research §1). Inputs map 1:1 (`NAME/TYPE/LABEL/DEFAULT/MIN/MAX/VALUES/LABELS`). Kind by convention: an `image` input named `inputImage` → `filter`; `startImage` + `endImage` + `progress` → `transition`; else `generator`. `PASSES[]` → `PassDef` (`TARGET`, `PERSISTENT`, `FLOAT`, `WIDTH`, `HEIGHT`). `category`: the first `CATEGORIES` entry equal (case-insensitive) to one of our 4 names, else a small keyword map (kaleid/mirror/feedback/tile → feedback; 3d/geometry/shape → geometry; liquid/fluid/water/metal → liquid; vhs/crt/retro/glitch/pixel/scanline/strobe → retro), else undefined. `CREDIT` → `credit`. Our `VJW_BIND` key → `bind` (unknown to other hosts, files stay valid ISF). `fs` = the ported prefix + the body: `precision highp float; precision highp int;`, auto uniforms `TIME, TIMEDELTA, RENDERSIZE, PASSINDEX, FRAMEINDEX, DATE`, `varying vec2 isf_FragNormCoord`, one uniform per input with the GLSL type (float→float, long→int, bool/event→bool, color→vec4, point2D→vec2, image/audio/audioFFT→sampler2D + its size uniform), the `IMG_PIXEL / IMG_NORM_PIXEL / IMG_THIS_PIXEL / IMG_THIS_NORM_PIXEL / IMG_SIZE` macros, and `vs` = the ES 1.00 triangle vertex shader (`attribute vec2 position`, writes `isf_FragNormCoord`). `glsl: 100`. `sizeExpr` substitutes `$WIDTH/$HEIGHT/$<input>` from `vars` and evaluates only if the string matches a whitelist (digits, `+-*/()., `, `floor|ceil|round|min|max|abs|sqrt|pow`), via `Math` lookups; anything else throws. Files with a custom `.vs`, `IMPORTED`, or extra `image` inputs parse but set `unsupported: string` (excluded at curation, design G4).
- **Donor authorisation:** port the header parse and prefix generation from `donor/interactive-shader-format-js/src/ISFParser.js` (repo MIT). Keep the repo LICENSE text as the header comment of `isf.ts` with the URL `https://github.com/msfeldstein/interactive-shader-format-js`. Add the `audio`/`audioFFT` sampler entries the original lacks.
- **Tests (`isf.test.ts`):** a 3-input fixture (float with MIN/MAX/DEFAULT, long with VALUES/LABELS, color) parses with all fields; kind for the three conventions; `PASSES` with `TARGET`/`PERSISTENT`/`FLOAT`/`WIDTH: "$WIDTH/2"`; audio types become `sampler2D` uniforms; the prefix declares every auto uniform and macro exactly once and the body follows it; `VJW_BIND` round-trips; `category` for 4 headers (exact name, keyword, none); `sizeExpr('$WIDTH/2', {WIDTH: 1000})` = 500, `floor($HEIGHT*$res)` with an input var, and `alert(1)`, `a.b`, `[` throw; a header without the JSON comment throws a readable message.
- **Done-check:** gates green.
- **Depends on:** nothing (`Binding` is an `import type` from `bind.ts`; author S1.1 and S1.2 in one session or land S1.2 first).
- **Changed during implementation:**
  - `ShaderDef` gains `unsupported?: string` (named by this step, missing from the CP1 contract block). `name` = the id's stem.
  - `IMG_SIZE(x)` is a regex rewrite to `_x_imgSize`, because GLSL ES 1.00 has no `##` token pasting, so it is not a `#define`. `IMG_PIXEL(x, c)` gets the head rewrite `IMG_PIXEL(x, _x_imgSize, c)` and the macro divides by the image's own size (the ISF spec; the JS runtime divides by RENDERSIZE, which breaks e.g. a 256×1 histogram read). The other 3 macros are `texture2D` on norm coords, as in the JS runtime.
  - Pass `TARGET`s and `IMPORTED` names also get `sampler2D` + `_imgSize` uniforms (as the donor). Every name is checked as a GLSL identifier before it goes into the source.
  - A custom `.vs` is detected by a `varying` declaration in the body. That catches 36 of the 38 `.vs` pairs in ISF-Files; the other 2 (`3d Rotate`, `Vertex Manipulator`) only move vertices and need a sibling-`.vs` check in the S2.2 sweep.
  - The header is plain `JSON.parse` (all 327 ISF-Files headers parse). `sizeExpr` runs `Function()` after a linear token whitelist (a `ponytail:` note says to swap in a tiny parser if a CSP forbids eval, e.g. Electron). It also throws on an unknown `$var` and on a non-finite result.

### S1.2 `[x]` `bind.ts`: open-id sources registry + binding evaluation, with tests
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** the per-frame source numbers and the source → amount → attack/release → range chain (design E3), pure.
- **Files:** `web/src/bind.ts`, `web/src/bind.test.ts`.
- **Behaviour (lead's note 2026-10-28):** `Sources` is a plain `Record<string, number>` reused every frame; `sources(f, out)` fills exactly the spec §2.2 keys: `bass/mid/treb = clamp(att.x / 2)`; `band0..band31` = band dB (20·log10 of the mean linear magnitude, +1 dB/band tilt) through a −75…−15 dB window (spectrum's mapping); `onset = clamp((strength − 1.5)/2.5) · exp(−max(0, audioNow − t)/0.12)` from `f.lastOnset`; `beat = f.sync.beat`, `bar = f.sync.bar` (counts, not fract), `confidence = f.sync.confidence`, `lfo = f.time`. `SOURCE_IDS` lists them for the panel. `evaluate(b, s, state, dt)`: `x = s[b.source] ?? 0` (an unknown id reads 0, never throws); if `b.shape` is set, `x = shape(fract(x · (b.rate ?? 1)))`, and the phase sources `beat`/`bar` are multiplied by `s.confidence` (`GATED = ['beat', 'bar']`, a table, not an enum in the schema; `lfo` is not gated). Shapes on φ∈[0,1): sine `0.5 − 0.5·cos(2πφ)`, tri `1 − |2φ − 1|`, saw `1 − φ` (1 on the beat, falling), square `φ < 0.5`, random = a hash of `floor(x · rate)` held for the cycle (`state.cycle/state.hold`). Then `y = clamp(b.amount · x)`; one-pole `state.y += (y − state.y)·(1 − exp(−dt/τ))` with τ = `attack` when rising, `release` when falling, τ = 0 → instant; output `min + (max − min)·state.y` (min > max inverts). `BindState = { y: number; cycle: number; hold: number }`. Defaults constant `BIND_DEFAULTS = { amount: 1, attack: 0, release: 0.15 }`; shape default saw for beat/bar, sine for lfo, rate 1 (applied by the panel/`defaults`, not here). No new detectors; later epics add registry keys (e.g. per-band hits) with no change here or in `doc.ts`.
- **Tests (`bind.test.ts`, synthetic `FrameInput`s):** `att.bass` 2 → 1, 1 → 0.5, 0 → 0; band window edges (−75 dB → 0, −15 → 1, tilt shifts band 10 by 10 dB); onset at age 0 = `(strength−1.5)/2.5`, decays by `e^-1` at 0.12 s, negative age clamps; unknown source → `min`; `amount` 2 doubles then clamps at 1; **fps independence:** a step 0→1 with `release 0.15` reaches the same value at t = 0.3 s stepping at 60 and at 30 fps (±1e-3); `attack 0` is instant, `attack 0.5` reaches 1 − 1/e at 0.5 s; inversion `min 1, max 0` yields `1 − y`; beat with saw: 1 on the beat line, 0.5 mid-beat, and × confidence 0.5 halves it; `bar` with `rate 2` cycles twice per bar; lfo sine at `time` 0 / 0.25 / 0.5 with rate 1 → 0 / 0.5 / 1; square and tri at 3 phases; random: constant within a cycle, different across cycles (≥ 2 distinct values over 8 cycles); `sources()` returns `out` itself (no allocation) and fills every `SOURCE_IDS` key.
- **Done-check:** gates green.
- **Depends on:** S1.1 (types only).
- **Changed during implementation:** `BindState = { y }`, without `cycle`/`hold`. Random is a hash of `floor(x · rate)`, so it holds within a cycle with no state. The confidence gate applies inside the shape branch: an unshaped `beat` is its raw count. An unknown id is checked with `Object.hasOwn`, so `'toString'` reads 0 and not the prototype's function. `sources()` has no `+1e-9`: `log10(0) = −∞` clamps to 0.

### S1.3 `[x]` `doc.ts` + `scenes/builtin.ts`: SceneDoc, validation, defaults, the first built-ins, with tests
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** the scene format (design E4) as pure code; the CP1 docs.
- **Files:** `web/src/doc.ts`, `web/src/doc.test.ts`, `web/src/scenes/builtin.ts`.
- **Behaviour:** types per the CP1 contract. `parseScene(x)` checks: object, `v === 1` (else "unsupported scene version"), `id`/`name` non-empty strings, `star` boolean, `layers` 1..4 arrays of `{ gen, fx[], blend ∈ Blend, opacity/speed/res finite numbers (clamped 0..1, 0..4, 0.25..1), bind? }`, each node `{ ref: non-empty string, code?: string ≤ 65536 chars (`CODE_MAX` knob), credit?: string, values?: object of number | boolean | number[] (finite), bind?: object of Binding with finite numbers, `source` a non-empty string, shape ∈ Shape | undefined }`. Unknown keys are dropped; the result is a fresh object (never the input). `parseLibrary(x)`: `{ v: 1, scenes: [] }` or a single doc → `SceneDoc[]`. `defaults(def)`: `Record<name, Value>` from `inputs` (float → DEFAULT ?? MIN ?? 0, long → DEFAULT ?? VALUES[0] ?? 0, bool → DEFAULT ?? false, event → false, color → DEFAULT ?? [0,0,0,1], point2D → DEFAULT ?? [0,0]; image/audio types omitted). `builtin.ts`: `export const BUILTIN: readonly SceneDoc[]` as JSON-compatible literals (tsc checks them): `builtin:tunnel` (gen `native/tunnel`, no fx, normal, opacity 1, speed 1, res 1) and `builtin:kaleido-tunnel` (same gen + one fx `isf/<kaleidoscope file stem, chosen in S1.5>` with one float input bound `{ source: 'bass', amount: 1, attack: 0, release: 0.15, min, max }`). `star: true` on both. Spectrum/particles/glitch docs are added by S2.3/S2.4 when their natives exist.
- **Tests (`doc.test.ts`):** every `BUILTIN` doc round-trips `JSON.parse(JSON.stringify(d))` → `parseScene` deep-equal; rejections with a message containing the field name: `v: 2`, 0 layers, 5 layers, blend `'xor'`, `opacity: NaN`, `code` of 65537 chars, a non-object, `bind.source: ''`; a doc with bindings on `gen`, `fx[0]` and `layer.bind.opacity` keeps them exactly; unknown keys are dropped; `parseLibrary` accepts both shapes and rejects `v: 0`; `defaults()` for one def with all 6 value-bearing types.
- **Done-check:** gates green.
- **Depends on:** S1.1, S1.2 (types).
- **Changed during implementation:** the kaleidoscope stem is filled here already: `isf/Kaleidoscope` (VIDVOX, from the clone, see S1.5), bound input `angle` with range 0..0.125 (at most 45° on a kick), plus a `values` override `center: [0.5, 0.5]` because the file's default is the corner. `layer.bind` keeps only `opacity`/`speed` (other keys are dropped like any unknown key). `parseLibrary` tells the two shapes apart by the presence of `scenes`. Error messages are `<field path>: <problem>`, e.g. `layers[0].fx[0].bind.angle.source: not a non-empty string`.

### S1.4 `[x]` Natives contract + tunnel as a `NativeDef` + engine program cache/temps
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** the pieces `live.ts` needs from the engine and the first native generator, additive so the pilot path still runs.
- **Files:** `web/src/gl/scene.ts`, `web/src/scenes/tunnel.ts`, `web/src/gl/engine.ts` (+ one line in `web/src/app.ts`, a 4th file ⚠️).
- **Behaviour:** `scene.ts` adds `Native`/`NativeDef` (CP1 contract) and keeps `Scene`/`SceneFactory` with a one-line note "removed in S2.4" (spectrum/particles/glitch still use them). `tunnel.ts`: `export const params` → `export const inputs: Input[]` (`speed 0..2 default 0.6`, `twist 0..0.5 default 0.12`, `glow 0..3 default 1`); `export const tunnel: NativeDef = { id: 'native/tunnel', name: 'Tunnel', kind: 'generator', category: 'geometry', credit: 'VeeJay Wizard', inputs, create: () => ({ draw(f, v) {…} }) }` reading `v.speed` etc. (cast through `as number`; no other logic change; the per-instance state stays inside `create`). Until S1.6 rewires the loop, `tunnel.ts` also exports a 3-line shim `tunnelScene: SceneFactory = (gl) => { const n = tunnel.create(gl); const v = defaults(tunnel); return { name: 'tunnel', draw: (f) => n.draw(f, v) } }`, and `app.ts`'s registry line becomes `scenes.tunnel = tunnelScene(gl)` (S1.6 deletes both). `engine.ts`: `program(vs, fs)` memoised in a `Map` keyed by `vs + '\0' + fs`; `draw(info, uniforms)` = useProgram + `setBuffersAndAttributes(triangle)` + `setUniforms` + `drawBufferInfo`; `fullscreenProgram(fs)` becomes `const info = program(VS, fs); return (u) => draw(info, u)`; `export type Target`; `export const temps = [renderTarget(), renderTarget()]` fitted in `setOutput` like `shots`. The old `scenes` registry and `render` are untouched here.
- **Tests:** none (GL). `inputs` defaults equal the old `params` values (checked by eye in review).
- **Done-check:** gates green. **Manual:** the app runs exactly as before (tunnel reacts; 4 scenes cycle).
- **Depends on:** S1.3.
- **Changed during implementation:** `program()` keeps the contract's `ProgramInfo` return type, but twgl returns `null` (and logs the info log) when a compile or link fails; `live.ts` checks for it. Manual check in Chrome (Playwright, `--mute-audio`, kicks128n.wav): `→` cycled TUNNEL → SPECTRUM → PARTICLES → GLITCH, 0 console errors or warnings, and the tunnel renders through the shim.

### S1.5 `[x]` `fx/catalog.ts` + `gl/live.ts` (1 layer, single-pass ISF, bindings, fast path) + the kaleidoscope file
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** a live scene instance renders a `SceneDoc` layer: native generator → ISF filter chain → the bound target, with bindings evaluated per frame.
- **Files:** `web/src/fx/catalog.ts`, `web/src/gl/live.ts`, `web/src/fx/isf/<Kaleidoscope>.fs`.
- **Behaviour:** `catalog.ts`: `import.meta.glob('./isf/*.fs', { query: '?raw', import: 'default', eager: true })` (verify the option names in the Vite 8 docs) → `parseIsf(src, 'isf/<stem>')`; plus `native/tunnel` → `catalog: Map<string, EffectDef>`; a parse failure logs `console.error` and skips the file. `live.ts`: `live(id)` finds the doc in `BUILTIN` (S6.1 swaps this for the library), builds per layer: the gen node (native: `def.create(gl)`; shader: `program(def.vs, def.fs)` + a uniform object) and the fx nodes (shader only), `values = { ...defaults(def), ...node.values }` per node (one object, reused), bindings compiled to `{ uniforms, key: name | 'name.i', binding, state }[]`. `render(f, s, acc)`: evaluate every binding into its uniform (float; long rounded; bool/event ≥ 0.5; `name.i` writes one component of the array); gen draws into `temps[0]` when the layer has fx, else straight into `acc` (fast path: 1 layer, normal, opacity 1, res 1 — all CP1 docs); each fx reads the previous texture as `inputImage` (+ its `_imgSize`), draws ping-pong `temps[0] ↔ temps[1]`, and the last fx draws into `acc`. ISF uniforms: `TIME = f.time − t0` (instance creation), `TIMEDELTA = f.dt`, `RENDERSIZE = [w, h]`, `PASSINDEX 0`, `FRAMEINDEX` counter, `DATE = [y, m, d, s since midnight]`. `audio`/`audioFFT` inputs stay unbound until S3.3. Saves/restores `FRAMEBUFFER_BINDING` around the layer. An unknown `ref` pushes `errors` and the layer clears to black. `dispose()` frees native instances; `rebuild()` = dispose + build (programs stay cached). Event values reset to `false` after each draw.
- **Donor authorisation:** copy one single-pass `inputImage` filter with ≥1 float input and no extra images from `donor/ISF-Files` (MIT) — a kaleidoscope if one exists in the clone ⚠️ name from the clone, else any mirror/tile filter — into `web/src/fx/isf/`, keeping its header and adding `// Source: https://github.com/Vidvox/ISF-Files · MIT` on top; fill the stem into `builtin.ts`'s `builtin:kaleido-tunnel` and pick its bound input + range.
- **Tests:** none new (GL); the pure parts are S1.1–S1.3.
- **Done-check:** gates green; `npm run build` passes (the `.fs` glob is bundled).
- **Depends on:** S1.4.

### S1.6 `[x]` Wire the loop: `render(shot, f, s)` through `live`, `SceneId = string`, playlist from built-ins
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** CP1 demo end to end.
- **Files:** `web/src/gl/engine.ts`, `web/src/app.ts`, `web/src/director.ts` (+ delete `web/src/playlist.ts`; `director.test.ts` loses its `playlist` import and gets a local 4-string fixture; the shim leaves `tunnel.ts`) ⚠️ 5 touches, three of them one-liners.
- **Behaviour:** `director.ts`: `OwnSceneId` → `export type SceneId = string` (import the type from `doc.ts` or alias it; one source of truth is `doc.ts`), no logic change. `engine.ts`: drop the `scenes` registry; `render(shot, f, s)` binds `shots[0]`, `live(shot.from).render(f, s, shots[0])`, same for `to` into `shots[1]`, then the existing final mix pass; `?flash` unchanged. `app.ts`: remove the 4 registry lines and the `tunnelScene` shim use; `const src: Sources = {}` + `sources(f, src)` once per frame before `render`; playlist = `BUILTIN.filter(d => d.star).map(d => d.id)` into `createDirector`; the overlay name = `live(shot.to ?? shot.from).doc.name` (compare before patching, as today).
- **Tests:** existing director tests pass with string fixtures.
- **Done-check:** gates green. **Manual:** CP1 demo; `?flash` still works; HMR of `live.ts` reloads the page (no second GL context). **Lead commits** `cp1-effects` after a Playwright check: 0 console/GL errors, 0 late frames over 60 s, the bound value visibly moving (screenshots at a kick and at rest differ in the kaleidoscope region).
- **Depends on:** S1.5.


- **Changed during implementation (lead, 2026-10-28):** S1.5 and S1.6 were finished by the CP1 coder, which was stopped at the very end for context bloat (~4 h, one session). The lead verified:
  - gates: lint, tsc, 109 tests; build OK;
  - Chrome via Playwright: `→` alternates TUNNEL ↔ KALEIDO TUNNEL, the kaleidoscope is visible and reacts to the music, 0 console errors;
  - the runtime import cycle is broken: `engine.ts → live.ts` is `import type` only, and graphify still lists the type edge.
  - Not done by the stopped coder: drift notes for S1.5/S1.6 and the CP1 user demo text.

### S2.1 `[x]` Director `setPlaylist` + `peek`, engine GPU timer ring
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** the two hooks the bench and prepare-ahead need.
- **Files:** `web/src/director.ts`, `web/src/director.test.ts`, `web/src/gl/engine.ts`.
- **Behaviour:** `setPlaylist(ids)`: keeps the current scene; if it was removed, `next()` continues from its old index clamped; a fade in progress is unaffected; `peek()` = the id the autopilot goes to next (`playlist[(cur + 1) % n]`). `engine.ts`: with `EXT_disjoint_timer_query_webgl2`, `beginQuery/endQuery(TIME_ELAPSED_EXT)` around each live scene's render (sequential, never nested), a ring of 8 queries per scene id, results polled each frame (`QUERY_RESULT_AVAILABLE`, discarded on `GPU_DISJOINT_EXT`), `gpuMs.set(id, median of the last 8)`; without the extension `gpuMs` stays empty.
- **Tests (`director.test.ts`, +3):** `setPlaylist` keeps the current scene and `next()` follows the new order; removing the current scene continues from its old position; `peek()` matches the scene `next()` then fades to.
- **Done-check:** gates green.
- **Depends on:** S1.6.
- **Changed during implementation:**
  - **A dropped current scene keeps its slot.** `cur` stays at its old index, clamped to `n`. The scene that followed it now sits in that slot, so `→` and the autopilot land there, and `←` lands on the scene before it. `peek()` uses the same rule (`playlist[away(1)]`). Why: the literal `playlist[(cur + 1) % n]` with `cur` clamped to `n − 1` skips the scene that followed the dropped one. It also changes `peek()`, so prepare-ahead would warm the wrong scene. 9 mutations of this logic were tried; the new tests catch all of them.
  - **Engine.** Each scene has at most 8 queries in flight. Query objects are recycled through one spare list rather than 8 fixed objects per scene. With an even count of 8 results, `gpuMs` takes the upper median (`sorted[n >> 1]`), the same convention as `quality.ts` and `app.ts`. `live(id)` resolves before `beginQuery`, so an unknown id throws without leaving a query active.
  - **Browser smoke (coder, :5174, installed Chrome, Playwright):** the extension is present. `gpuMs` fills per id (tunnel ≈0.2–0.3 ms, kaleido-tunnel ≈0.2–0.3 ms, both timed mid-fade), `gl.getError()` = 0, and the console shows no errors.

### S2.2 `[ ]` `?bench` page: G1 compile timing + ISF-Files sweep, G2 allocation hitches, G3 timer presence, per-effect GPU cost
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** one page the lead runs with Playwright; its `window.__bench` is the curation gate for every content batch.
- **Files:** `web/src/bench.ts`, `web/src/main.tsx` (`if (location.search.includes('bench')) import('./bench')` after `./app`), `web/scripts/isf-sweep.mjs`.
- **Behaviour:** `isf-sweep.mjs` copies every `*.fs` under `donor/ISF-Files` into `web/public/isf-sweep/` (git-ignored; add the line to `web/.gitignore`) and writes `index.json` (file names). `bench.ts`, after Start (waits for `store.needsStart` to clear): line 1 prints `timer query: yes/no` (G3) and `KHR_parallel_shader_compile: yes/no`. **G1:** compiles every catalog shader program (cache cleared first: `program` gets an `evict()` or the bench constructs `createProgramInfo` directly) measuring `performance.now()` around compile+link+`getProgramParameter(LINK_STATUS)`; prints count, median, max, total ms. **Sweep (`?bench&sweep`):** fetches `index.json` + each file, `parseIsf`, compiles each (same timing), lists per file: kind, category, compile OK/log, `unsupported`; `console.table` and `window.__sweep`. **G2:** during `builtin:tunnel`, 10 bursts 2 s apart, each allocating 4 RGBA8 + 2 RGBA16F targets at the internal size, clearing them and disposing; prints `drops` delta (from the store) per burst and the max rAF delta. **Per-effect:** builds test docs (`bench:<id>`: each generator alone; each filter over `native/tunnel`), registers them for `live(id)` (a `docs` override map in `live.ts`, exported for the bench only — 2 lines), `director.setPlaylist(ids)` + `setHold(true)`, `next()` every 3 s (the fade uses the director's 2 s; measure the last 1 s of each item once `shot.to` is null) → `gpuMed/gpuP95` from `gpuMs` samples, `gl.getError()` once, `console.error` count (wrapped). Ends with `console.table` and `window.__bench.done = true`. Runs at whatever size the window has; the lead sets fullscreen 60A on the M4 (1728×1117 internal at scale 1, the design budget size).
- **Tests:** none (DOM/GL).
- **Done-check:** gates green; `npm run build` passes; the lead's Playwright run records G1–G3 in STATE and the sweep's compile-OK list by category (the curation input for CP4). **Conditional for S2.5:** G1 total for the starred set > 500 ms ⚠️ knob → async compile; G2 shows ≥1 late frame per burst → add the target pool in S2.5.
- **Depends on:** S2.1; pilot S6.1 closed (`main.tsx`).

### S2.3 `[x]` Glitch and spectrum as `NativeDef`s + their built-ins
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** two more natives through the catalog.
- **Files:** `web/src/scenes/glitch.ts`, `web/src/scenes/spectrum.ts`, `web/src/fx/catalog.ts` (+ 2 docs in `scenes/builtin.ts`, a 4th file, data only ⚠️).
- **Behaviour:** as S1.4 for tunnel: `params` → `inputs` with sensible ranges (glitch `pixel, levels, split, hue`; spectrum `glow, reflect, hue, exposure`), `create(gl)` returns `{ draw(f, v), dispose }` where `dispose` deletes the scene's own targets/bloom (spectrum). `glitch` → `category: 'retro'`; spectrum uncategorised (counts toward the 30 total ⚠️ assumption, needs confirmation). Catalog registers both. `builtin:glitch`, `builtin:spectrum` docs (star: true). The autopilot order follows `BUILTIN` order: tunnel, spectrum, particles (S2.4), glitch, then the combinations.
- **Tests:** `doc.test.ts` round-trips the new docs automatically.
- **Done-check:** gates green. **Manual:** both scenes look as in the pilot; GPU time within ±10 % of S3.3/S3.5 numbers (1.1–1.9 and 1.04 ms at 1200×800) in the lead's run.
- **Depends on:** S1.6.
- **Changed during implementation:**
  - A 5th file: `gl/bloom.ts` gets `dispose()`, which deletes its 5 targets. Its targets are closure-private, so spectrum can't free them any other way, and particles (S2.4) reuses it.
  - Spectrum's own target is deleted inline (`deleteFramebuffer` + `deleteTexture`). A `dispose` on `renderTarget` would be the single release point, but `engine.ts` belongs to S2.1, running in parallel. S2.5's pool finds the delete sites with `grep deleteFramebuffer`.
  - Spectrum's bar program now goes through the engine's memoised `program()` instead of `createProgramInfo`. A re-created instance (rebuild, S2.5 prepare-ahead) neither recompiles nor leaks it, so `dispose` leaves programs alone.
  - Glitch has no own targets, so it has no `dispose`.
  - Ranges: glitch `pixel 1..40`, `levels 2..16` (a float: the panel maps `long` to a `<select>` that needs `values`; below 2 the shader divides by 0), `split 0..60`, `hue 0..1`; spectrum `glow 0..8`, `reflect 0..1`, `hue 0..1`, `exposure 0.2..4`. Defaults are the pilot `params`.
  - Gates: lint and tsc clean, 109 tests, build OK.
  - Chrome check (Playwright on :5175, `--mute-audio`, kicks128n.wav): `→` walked TUNNEL → SPECTRUM → GLITCH → KALEIDO TUNNEL with 0 console errors or warnings, and both look as in the pilot.
  - The drop counter showed 1 at start and 2 from Spectrum on. Likely cause, not measured: `live()` creates a native on its first switch, so Spectrum compiles 5 programs then, where the pilot built every scene at load. S2.5's warm-up and prepare-ahead target this.

### S2.4 `[x]` Particles as a `NativeDef`, remove `Scene`/`SceneFactory`
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** the last native; the old contract goes.
- **Files:** `web/src/scenes/particles.ts`, `web/src/gl/scene.ts`, `web/src/fx/catalog.ts` (+ 1 doc in `builtin.ts` ⚠️ data only).
- **Behaviour:** `inputs` = `burst, swirl, size, glow`; `category: 'geometry'`; `dispose` deletes the TF buffers and targets. Two particle layers must simulate independently (per-instance buffers already live inside the factory; confirm nothing is module-level). `scene.ts` keeps only `Native`/`NativeDef`.
- **Tests:** none new.
- **Done-check:** gates green; grep shows no `SceneFactory` left. **Manual:** particles burst on kicks as before; 3.5 ms GPU at 1200×800 ±10 %.
- **Depends on:** S2.3.
- **Changed during implementation:**
  - The transform feedback program is compiled once at module level and shared by all instances (`tfProgram ??= createProgramInfo(…)`). The engine's memoised `program()` takes no TF varyings, and `engine.ts` belongs to S2.1, running in parallel.
    - As with spectrum's bar program (S2.3), a re-created instance neither recompiles nor leaks it, so `dispose` leaves it alone.
    - Sharing is safe because the program holds no state: every draw sets all 9 uniforms the VS reads. Buffers, VAOs, TF objects, the ping-pong index, the target and the bloom all stay per instance inside `create`, so two particle layers simulate independently.
    - Once `program()` accepts varyings, this memo can go.
  - `dispose` deletes more than the step lists: besides the 4 TF buffers, the target and the bloom (`bloom.dispose()` from S2.3), it also deletes the 2 VAOs and the 2 TF objects.
  - Ranges: `burst 0..6`, `swirl 0..5`, `size 1..16`, `glow 0..8`. Defaults are the pilot `params`.
  - `credit: 'VeeJay Wizard, after Gregg Tavares (twgl.js)'`: the file adapts his MIT example, and its header is unchanged.
  - A 5th file: the stale playlist comment at `app.ts:26` was updated, one line, at the lead's request.
  - Gates: lint and tsc clean, 109 tests, build OK; `grep SceneFactory` finds nothing.
  - Chrome check (Playwright on :5176, `--mute-audio`, kicks128n.wav): `→` walked TUNNEL → SPECTRUM → PARTICLES → GLITCH → KALEIDO TUNNEL → TUNNEL with 0 console errors or warnings. The particles shot shows a kick burst (hot rim, cool core) as in the pilot.
  - Drops: 3 at start, 4 at Particles. Likely the same cause as in S2.3's note: the native is created on its first switch, and particles also seeds 65 536 points and compiles its TF program at that point. S2.5 targets this.
  - Not measured here:
    - The 3.5 ms GPU number: this branch has no GPU timer (S2.1/S2.2).
    - `dispose`: nothing calls `Live.dispose()`/`rebuild()` yet, so it first runs with S2.5's prepare-ahead.

### S2.5 `[ ]` Compile-all at Start ("compiling n/N") + prepare-ahead (+ pool only if G2 says so)
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** no shader compile and no target allocation inside a fade (design E2).
- **Files:** `web/src/gl/live.ts`, `web/src/app.ts`, `web/src/store.ts` (+ `ui/Overlay.tsx` shows `store.compiling` under the Start button / in the bar, a 4th file, 3 lines ⚠️).
- **Behaviour:** `warm(ids, onProgress)`: for every shader node in those docs (and every transition from S3.2 on), `program(vs, fs)` through the cache. With `KHR_parallel_shader_compile` present: create all programs first, then per rAF poll `getProgramParameter(p, ext.COMPLETION_STATUS_KHR)` and resolve when all are linked (progress = linked count); without it, compile synchronously in chunks of 4 per rAF so the "compiling n/N" line repaints. `app.ts` calls `warm(playlist)` right after `start()` (and at load when the context is already running), `store.patch({ compiling })` per progress, `null` at the end; the loop keeps running meanwhile (built-in scenes whose programs aren't ready yet render black for those frames; acceptable at Start). **Prepare-ahead:** when a fade completes (`shot.to` turns null), `live(director.peek())` is created and fitted on that frame and the outgoing instance is disposed (unless it is the current one or the peeked one); `←/→` create on demand. **Pool (conditional on S2.2 G2 ≥ 1 late frame per burst):** `renderTarget` takes freed targets from a small per-format free list instead of deleting them, capped at 8 ⚠️ otherwise skip, note "G2 clean, no pool".
- **Tests:** none (GL/DOM).
- **Done-check:** gates green. **Manual:** Start shows "compiling n/N" briefly; a 5-min autopilot run in the lead's Playwright shows 0 late frames inside fades. **Lead commits** `cp2-effects`.
- **Depends on:** S2.2 numbers, S2.4.

### S3.1 `[x]` `fx/glsl.ts`: `commentParams`, `wrapToy`, `wrapTransition`, with tests
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** the two ES 3.00 wrappers (design E5, E7), pure.
- **Files:** `web/src/fx/glsl.ts`, `web/src/fx/glsl.test.ts`.
- **Behaviour:** `commentParams(src)`: every `uniform float <name>; // = <number>` line → `{ name, type: 'float', default, min: 0, max: 2·|default| or 1 }` (gl-transitions param convention, research §2; also accepts `vec2/vec3/vec4` with `vec(…)` defaults as point2D/color when trivial, else skip). `wrapToy(code)`: `#version 300 es`, `precision highp float;`, declares `iResolution (vec3), iTime, iTimeDelta, iFrame (int), iFrameRate, iMouse (vec4), iDate (vec4), iSampleRate, iChannelTime[4], iChannelResolution[4], iChannel0..3 (sampler2D)`, `out vec4 _o;`, appends the code, adds `void main(){ mainImage(_o, gl_FragCoord.xy); _o.a = 1.0; }`; returns `prefixLines` (so compile-log line numbers can be shifted) and `inputs` from `commentParams`; `vs` = the engine's ES 3.00 triangle VS text (duplicated as a constant here to stay pure). `wrapTransition(glsl)`: `#version 300 es`, `uniform sampler2D from, to; uniform float progress, ratio; uniform vec2 uRes;`, `vec4 getFromColor(vec2 uv){ return texture(from, uv); }` (same for `to`), the transition source, `void main(){ outColor = transition(gl_FragCoord.xy / uRes); }`; strips a leading `#version` line from the source if present.
- **Tests (`glsl.test.ts`):** `commentParams` on 3 lines (float, a non-numeric comment ignored, a `vec2` default); `wrapToy` output starts with `#version 300 es`, contains every `i*` uniform once, ends with the `main` wrapper, `prefixLines` equals the number of lines before the pasted code (checked by locating a marker line); `wrapTransition` contains `getFromColor`, `transition(`, keeps the body, strips `#version`, and its `inputs` come from the comments.
- **Done-check:** gates green.
- **Depends on:** S1.1 (types).
- **Changed during implementation:**
  - `commentParams` also maps `int` → `long` and `bool` → `bool` (E7: "uniform defaults are parsed"). GL zero-initialises uniforms, so the 22 of the 125 glsl3 files with int/bool params would otherwise run with 0/false. `min` is `min(0, 2·default)` rather than 0, so a negative default stays in range (`direction = -1.0`, `endy = -1` in the corpus). `max` is as planned.
  - Still skipped, so S4.5 should leave these out at curation or extend the parser then: the `ivec2` params (GridFlip, Pixelize, RandomSquares, SquaresWipe, TilesWave), FlashFade's `/* = */` default, and the image params of DisplacementMap and LumaWipe. An expression default (`1.0/3.0`, `vec2(1.0 / 3.0, 0.5)`) is skipped, not truncated.
  - Both prefixes are `#version 300 es` + `precision highp float;` + `precision highp int;`. The plan's list left out the float precision (ES 3.00 fragment shaders have no default) and `out vec4 outColor;`; both upstream hosts declare highp int. A `#version` line is stripped wherever it sits, including after leading comments, because GLSL allows comments before it.
  - `glsl.test.ts` pins the duplicated VS to `gl/engine.ts` through a `?raw` import. If S3.2 edits the engine VS, update the copy here. The lead's alternative: have the engine import the VS from here.
  - Verified outside the gates with a scratchpad Playwright sweep on ANGLE Metal (M4). All 125 wrapped donor transitions and an all-uniforms toy (uint hash, `texelFetch`, non-constant loop) link. A paste error on line 3 is logged as line 21, and `prefixLines` is 18.

### S3.2 `[ ]` Engine services: persistent targets with resample, audio textures, the transition pass
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** the engine side of CP3 (design E2 persistent targets, E3 audio textures, E7 transition pass).
- **Files:** `web/src/gl/engine.ts`, `web/src/app.ts`, `web/src/fx/transitions/crossfade.glsl` (+ `fx/catalog.ts` globs `./transitions/*.glsl` through `wrapTransition` → `gl/<stem>` defs and `transitions` ids; a 4th file, ~6 lines ⚠️).
- **Behaviour:** `renderTarget(hdr, persistent)`: on `fit()` with a new size a persistent target allocates the new texture, draws the old one into it with a copy pass (linear), then frees the old (no clear); transient targets refit as today; a new persistent target starts cleared. `setAudio(magDb, wave)`: three R8 textures (`fft` 512×1 from a −100…−30 dB window ⚠️, `wave` 512×1 as `0.5 + 0.5·sample` ⚠️, `toy` 512×2 rows fft/wave ⚠️ G5) uploaded with `texSubImage2D` each frame from one reused `Uint8Array`; `app.ts` adds `analyser.getFloatTimeDomainData(wave)` and the call. **Transition pass:** `setTransition(id)` selects a `gl/<Name>` or `own/crossfade` def (program via the cache, `inputs` defaults as uniforms); `render` replaces the `final` mix with it: `from` = A, `to` = B (or A), `progress = mix`, `ratio = w/h`, `uRes`. `crossfade.glsl` (own): `vec4 transition(vec2 uv){ return mix(getFromColor(uv), getToColor(uv), progress); }`. `app.ts`: when `shot.to` goes from null to an id, `setTransition(pick())` = random from `transitions`, never the same twice in a row (one id now, so trivially crossfade). Both default to `own/crossfade` at boot.
- **Tests:** none new (GL).
- **Done-check:** gates green. **Manual:** looks identical to CP2; `?debug` 0 drops over 2 min.
- **Depends on:** S3.1, S2.5.

### S3.3 `[ ]` `live.ts`: ISF passes, layers with blend/opacity, layer clock + `res`, audio inputs
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** the full layer compositor and ISF multipass (design E1, E2, E3).
- **Files:** `web/src/gl/live.ts`, `web/src/scenes/builtin.ts`, `web/src/fx/isf/<one PERSISTENT filter>.fs`.
- **Behaviour:** **Passes:** for a `ShaderDef` with `passes`, run them in order with `PASSINDEX`; named `TARGET`s get a `renderTarget(float, persistent)` (`FLOAT` → RGBA16F; `PERSISTENT` → a ping-pong pair, read the previous frame's, write the other, swap) sized by `sizeExpr(width/height, { WIDTH, HEIGHT, ...inputs })` or the layer size; later passes sample earlier targets by name (+ `_imgSize`); the last pass draws into the chain's output. `audio` inputs bind `audioTex.wave`, `audioFFT` bind `audioTex.fft` (sizes 512×1). **Layers:** clear `acc`; per layer the gen renders into `temps[0]` (or a per-layer target at `size × res` when `res < 1`, linear upscale on composite), fx ping-pong; the final texture is composited onto `acc` by one composite program with the E2 table (normal `ONE, ONE_MINUS_SRC_ALPHA` with `rgb·a·op`; add `ONE, ONE`; screen `ONE_MINUS_DST_COLOR, ONE`; multiply `DST_COLOR, ZERO` with `1 − op + op·rgb`), blending disabled after. Fast path kept: 1 layer, normal, opacity 1, res 1 → the last pass draws straight into `acc`. **Clock:** per layer `t += dt · speed`; shader nodes get `TIME = t`, natives a per-layer reused `FrameInput` copy with warped `time`/`dt`. `opacity` and `speed` are bindable like inputs (`layer.bind`). **Resize:** persistent targets `fit()` on size change (resampled), others refit. `builtin.ts` adds `builtin:particles-over-tunnel` (tunnel; particles `add`, opacity 0.9) and `builtin:trails-spectrum` (spectrum + the PERSISTENT filter).
- **Donor authorisation:** one `PERSISTENT` `inputImage` filter from the S2.2 sweep's compile-OK list (`donor/ISF-Files`, MIT), header kept + the `// Source:` line.
- **Tests:** none new (GL); `sizeExpr` is tested in S1.1.
- **Done-check:** gates green. **Manual:** both new scenes play; trails keep flowing when the governor steps 1 → 0.85 (force it with a heavy tab, `?debug` shows the scale) with no pop; the 4 pilot built-ins still take the fast path (GPU numbers ±10 %).
- **Depends on:** S3.2.

### S3.4 `[ ]` Shadertoy node (`toy/<uuid>`, inline code) + an own `mainImage` fixture scene
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** a pasted single-pass shader runs as a generator (design E5); the paste UI comes in S5.3.
- **Files:** `web/src/fx/catalog.ts`, `web/src/gl/live.ts`, `web/src/scenes/builtin.ts`.
- **Behaviour:** `toyDef(node)`: `wrapToy(node.code)` → `ShaderDef { id: node.ref, glsl: 300, kind: 'generator', credit: node.credit ?? '' }`, memoised by code string. `live.ts` resolves `toy/` refs through it; uniforms: `iResolution = [w, h, 1]`, `iTime/iTimeDelta/iFrame` from the layer clock, `iMouse = 0`, `iDate`, `iSampleRate = ctx.sampleRate`, `iChannel0 = audioTex.toy`, `iChannel1..3` = one shared 256² RGBA noise texture made once (`Math.random` bytes), `iChannelResolution` accordingly; comment-param inputs become uniforms. A compile error → `errors` with line numbers shifted by `prefixLines`, layer black. `builtin:toy-plasma`: an own 10-line `mainImage` plasma (no third-party code), `credit: 'VeeJay Wizard'`, star true.
- **Tests:** none new (`wrapToy` tested in S3.1); `doc.test.ts` round-trips the inline-code doc.
- **Done-check:** gates green. **Manual:** the toy scene plays and reacts via `iChannel0` (use `texture(iChannel0, vec2(0.05, 0.25)).r` for bass in the fixture). **Lead commits** `cp3-effects` after a 5-min Playwright run (0 GL errors, 0 late in fades).
- **Depends on:** S3.3.

### S4.1 `[ ]` Content batch 1: trails / feedback / kaleidoscope / mirrors (target ≥8)
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** the feedback category filled, budget-checked.
- **Files:** `web/src/fx/isf/*.fs` (~5 from the sweep's compile-OK list: kaleidoscope, mirror variants, tiling, one PERSISTENT feedback; the user's picks from the contact sheet ⚠️ names from the sweep), `web/src/fx/own/*.fs` (~3: `feedback-zoom.fs` MilkDrop-style zoom-rotate warp with `VJW_BIND` on onset, `trails.fs` half-float decay (`PERSISTENT` + `FLOAT`), `echo.fs` slit-scan), `web/src/scenes/builtin.ts` (+3 starred scenes using them).
- **Behaviour:** every file keeps its header; own files are valid ISF (JSON header with `CATEGORIES: ["Feedback"]`, `VJW_BIND` suggestions). Each effect appears in ≥1 starred built-in.
- **Donor authorisation:** `donor/ISF-Files` (MIT) → `fx/isf/`, header kept + `// Source:` line. Record the list of copied file names in the step's "Changed during implementation" note (S7.1 consumes it).
- **Tests:** `doc.test.ts` round-trips the new docs.
- **Done-check:** gates green; `?bench`: every new item compiles, 0 GL/console errors, p95 ≤ 5 ms at 1728×1117 (over budget → lower `res` or drop); the lead's contact sheet; the user prunes.
- **Depends on:** S3.4, S2.2 sweep list.

### S4.2 `[ ]` Content batch 2: 3D / geometry (target ≥7 incl. tunnel, particles)
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** raymarched and SDF generators within budget.
- **Files:** `web/src/fx/own/*.fs` (~5: `fractal.fs` (mandelbulb/menger-class raymarch), `sdf-shapes.fs` rotating hg_sdf primitives, `flythrough.fs`, `wave-landscape.fs`, `tunnel-mesh.fs`; `res` 0.5–0.75 set in their built-ins), `web/src/fx/isf/*.fs` (1–2 generators from the sweep if any fit ⚠️), `web/src/scenes/builtin.ts` (+3 scenes, with `speed` bound to bass on one).
- **Donor authorisation:** inline the needed functions from `donor/webgl-noise` (MIT, Ashima Arts / Stefan Gustavson; `https://github.com/stegu/webgl-noise`) and `donor/hg_sdf.glsl` (`MIT OR CC-BY-NC-4.0`, used as MIT, `https://mercury.sexy/hg_sdf/hg_sdf.glsl`) into each file that uses them, with the original header lines. No `#include` machinery.
- **Tests:** doc round-trips.
- **Done-check:** gates green; `?bench` p95 ≤ 5 ms at the scene's `res`; contact sheet; the user prunes.
- **Depends on:** S4.1.

### S4.3 `[ ]` Content batch 3: liquids / metal (target ≥6)
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** procedural and feedback-advection liquids; no Navier–Stokes (design E8).
- **Files:** `web/src/fx/own/*.fs` (~5: `domain-warp.fs` fluid, `smoke.fs` feedback advection (`PERSISTENT`), `liquid-chrome.fs` with an onset-bound burst via `VJW_BIND`, `metaballs.fs`, `ink.fs`), `web/src/fx/isf/*.fs` (~1 from the sweep ⚠️), `web/src/scenes/builtin.ts` (+3 scenes).
- **Donor authorisation:** webgl-noise functions as in S4.2; ISF-Files as in S4.1.
- **Tests:** doc round-trips.
- **Done-check:** gates green; `?bench` budget; contact sheet.
- **Depends on:** S4.2.

### S4.4 `[ ]` Content batch 4: retro — VHS / CRT / strobe / flashes (target ≥8 incl. glitch)
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** the retro category; count check for §4.1.
- **Files:** `web/src/fx/isf/*.fs` (~5 from the sweep: VHS, CRT, RGB split, pixelate, posterize ⚠️ names), `web/src/fx/own/*.fs` (~3: `strobe.fs` (bool/event bound to beat), `flash.fs` colour flash with `VJW_BIND` on onset (the "drop" proxy, design E8 ⚠️), `scanlines.fs`), `web/src/scenes/builtin.ts` (+3 scenes).
- **Behaviour:** after this step the coder tallies `catalog` by category in the step note: total ≥ 30, each category ≥ 5 (natives count), and lists any shortfall for the lead.
- **Donor authorisation:** as S4.1.
- **Tests:** doc round-trips; add one assertion in `doc.test.ts` that every `BUILTIN` ref (except `native/*`, `toy/*`) matches a file stem under `fx/isf` or `fx/own` (`import.meta.glob` is Vite-only; in Vitest read the directories with `fs.readdirSync` ⚠️ `environment: 'node'` allows it).
- **Done-check:** gates green; `?bench` budget; contact sheet; counts met.
- **Depends on:** S4.3.

### S4.5 `[ ]` Content batch 5: 12 gl-transitions + bench transition loop
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** ≥10 transitions in the random set.
- **Files:** `web/src/fx/transitions/*.glsl` (12 curated from the package, e.g. fade-class, wipes, zoom, glitch-class ⚠️ names from the tarball), `web/src/bench.ts` (adds: each transition between `builtin:tunnel` and `builtin:spectrum`, measured over the fade), `web/src/app.ts` only if the pick needs a change (it reads `transitions`, so likely none).
- **Donor authorisation:** `donor/gl-transitions-2.0.0/glsl3/<Name>.glsl` (MIT; the 2 BSD ones are allowed too with their headers); header kept + `// Source: https://github.com/gl-transitions/gl-transitions · MIT`. If the tarball has no `glsl3/` dir (G6), use the `transitions/<Name>.glsl` ES 1.00 sources: `wrapTransition` already works for bodies without `texture2D`; drop any that fail to compile.
- **Tests:** none new.
- **Done-check:** gates green; `?bench` transition items p95 ≤ 11 ms (two scenes + transition at 1728×1117, the pilot's worst fade) and 0 errors. **Lead commits** `cp4-effects` after a full autopilot cycle in Playwright with 0 console/GL errors.
- **Depends on:** S4.4.

### S5.1 `[ ]` Panel actions in `live.ts`, store fields, keys `E`/`Esc`, hold on open
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** the engine side of the panel (design E6), no React yet.
- **Files:** `web/src/gl/live.ts`, `web/src/store.ts`, `web/src/app.ts`.
- **Behaviour:** `live.ts` keeps an editable copy of the current scene's doc (built-ins are immutable: the first edit clones into an in-memory doc under the same id, marked dirty). `panel.setValue` writes `doc.values` and the live uniform in place (no snapshot change); `setBinding` recompiles that node's bindings; `addFx` (applies the def's `VJW_BIND` suggestions), `removeFx`, `addLayer` (≤4), `removeLayer` (≥1), `setBlend` mutate the doc, `rebuild()`, and `store.patch({ editRev: editRev + 1 })`. `pasteToy` lands in S5.3. The GPU hint `store.patch({ gpuMs })` and `nodeErrors` ride the existing 4×/s badge patch in `app.ts`. `store`: `panel`, `editRev`, `edited`, `gpuMs`, `nodeErrors`. `app.ts`: `E` toggles `panel` (open → `director.setHold(true)` remembering the previous hold; close → restore), `Esc` closes; the key filter also ignores `HTMLTextAreaElement`; `edited` = the current scene id (the incoming one during a fade).
- **Tests:** none (GL/DOM).
- **Done-check:** gates green; `E` toggles `store.panel` and the hold (visible as the Lock badge), `Esc` restores it.
- **Depends on:** S4.5.

### S5.2 `[ ]` `ui/Panel.tsx` + `ui/panel.css`: layers, controls, bindings, catalog, GPU hint
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** the minimal slider panel over the output (spec §2.4, design E6).
- **Files:** `web/src/ui/Panel.tsx`, `web/src/ui/panel.css`, `web/src/main.tsx` (mount `<Panel />` next to `<Overlay />`).
- **Behaviour:** `useSyncExternalStore`; renders only when `store.panel`; re-renders on `editRev`, never per frame. Reads the edited doc through `live(store.edited).doc` and the defs through `catalog`. Per layer: generator name, blend `<select>`, opacity/speed/res sliders; per node: controls by input type (float → `<input type=range>` with MIN/MAX/step, long → `<select>`, bool → checkbox, event → button, color → `<input type=color>` + alpha slider, point2D → two sliders; `inputImage`/audio hidden). Sliders are uncontrolled (`defaultValue`), `onInput` → `panel.setValue`. A "bind" toggle per numeric input opens inline controls (source `<select>` from `SOURCE_IDS`, amount, attack, release, min, max, shape/rate when the source is beat/bar/lfo) → `panel.setBinding`. "Add effect" per layer: a `<select>` grouped by category from `catalog` (filters only), "×" per fx; "Add layer" (generators list) / remove. `GPU 3.1 ms` coloured green/amber/red against 5 ms; node errors as red lines. Auto-hides with the bar's idle state (same `mousemove` wake; `pointer-events: none` when hidden). Dark, compact, no library.
- **Tests:** none (UI).
- **Done-check:** gates green. **Manual:** CP5 demo minus paste; dragging a slider shows no React re-render (React DevTools or a `console.count` in render during the drag).
- **Depends on:** S5.1.

### S5.3 `[ ]` Paste Shadertoy dialog
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** spec §4.4 through the UI.
- **Files:** `web/src/ui/Panel.tsx`, `web/src/gl/live.ts`.
- **Behaviour:** a native `<dialog>` with a `<textarea>` (code), an `<input>` (credit/URL) and Add/Cancel. `panel.pasteToy(code, credit)`: builds `toyDef`, compiles via the cache, returns the compile log with line numbers shifted by `prefixLines` (shown under the textarea) or `null` and adds a layer `{ gen: { ref: 'toy/<crypto.randomUUID()>', code, credit }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1 }`. Code > `CODE_MAX` is refused with a message.
- **Tests:** none new (the wrapper is tested).
- **Done-check:** gates green. **Manual:** paste a known-good single-pass shader (the user's own or a CC BY-NC-SA one, allowed by spec §6) → it plays; paste `void mainImage(out vec4 o, vec2 p){ o = foo; }` → the log names the pasted line. **Lead commits** `cp5-effects`.
- **Depends on:** S5.2.

### S6.1 `[ ]` `library.ts`: IndexedDB, stars, playlist, export/import; `live` reads the library
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** persistence (design E4), native APIs only.
- **Files:** `web/src/library.ts`, `web/src/gl/live.ts`, `web/src/app.ts`.
- **Behaviour:** IndexedDB `vjw`, store `scenes` keyPath `id`, ~30 lines (`open` with `onupgradeneeded`, `getAll`, `put`, `delete` wrapped in promises). `load()` reads all user docs through `parseScene` (a corrupt record is skipped with `console.error`). `get(id)` = user doc or built-in; `all()`; `put(doc)` (calls `navigator.storage.persist()` once, remembered in `localStorage['vjw.persisted']`); `del`; `setStar`: built-in overrides in `localStorage['vjw.stars']` (JSON `{ id: boolean }`), user docs via `put`; `playlist()` = starred built-ins in `BUILTIN` order, then starred user docs by creation time (add `created?: number` to `SceneDoc` v1 now, before any user data exists ⚠️ assumption, needs confirmation; `parseScene` accepts it optional). `exportLibrary()`: `{ v: 1, scenes: user docs }` → `<a download="veejay-library-<local date>.json">` (the recorder's pattern). `importFile(f)`: `parseLibrary(JSON.parse(text))`, `put` each (overwrite by id), returns an error string or null. `onChange` notifies after any mutation. `live(id)` uses `library.get`; `panel.save()` (put the edited doc; built-ins can't be saved in place → `saveAs`), `saveAs(name)` (new uuid, star false), `toggleStar()`. `app.ts`: the director starts with the built-in playlist, then `library.load().then(() => director.setPlaylist(library.playlist()))`, and `onChange` → `setPlaylist` again.
- **Tests:** none (IndexedDB); the parse layer is tested in S1.3. Add `created` to `doc.test.ts` (optional field survives).
- **Done-check:** gates green; a DevTools session shows the `vjw` DB after a save.
- **Depends on:** S5.3.

### S6.2 `[ ]` Panel: Save / Save as / star / Export / Import (file picker + drop)
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** CP6 demo.
- **Files:** `web/src/ui/Panel.tsx`, `web/src/ui/panel.css`.
- **Behaviour:** buttons wired to `panel.save/saveAs/toggleStar` and `library.exportLibrary/importFile`; "Save as" uses a native `prompt()` for the name (one line, no dialog); Import = `<input type=file accept=.json>` plus `drop` on the panel root (stop propagation so the document's audio-file drop does not fire); errors shown inline. The star shows the edited scene's state; a scene list (`library.all()` + built-ins) with a star per row (the list only stars/unstars; click-to-switch is out of scope ⚠️ minimal).
- **Tests:** none (UI).
- **Done-check:** gates green. **Manual:** CP6 demo. **Lead commits** `cp6-effects`.
- **Depends on:** S6.1.

### S7.1 `[ ]` `THIRD_PARTY.md`: every ported shader file, the parser port, the shader libs
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** spec §6 bookkeeping in one place.
- **Files:** `web/THIRD_PARTY.md`.
- **Behaviour:** add a "Shaders" section listing per file: path under `web/src/fx/`, author (from the header), source URL, license: all `fx/isf/*.fs` (Vidvox/ISF-Files, MIT, per-file `CREDIT`), `fx/transitions/*.glsl` (gl-transitions, MIT/BSD per header), the `ISFParser.js` port in `fx/isf.ts` (MIT), webgl-noise and hg_sdf inlines (which `fx/own` files carry them). Keep the pilot's dependency tables; `ls web/src/fx/{isf,own,transitions}` must match the list 1:1 (a 5-line check in the step note).
- **Tests:** none.
- **Done-check:** gates green; every file under `fx/isf`, `fx/own`, `fx/transitions` appears in the file; no entry without a license.
- **Depends on:** S6.2.

### S7.2 `[ ]` Final gates, build, Playwright regression, 30-min run
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** closeout; fixes only if the regression finds something.
- **Files:** none planned (fixes land where found, ≤3 files, noted under this step).
- **Behaviour:** `npm run lint && npm run typecheck && npm test && npm run build`. The lead runs a `cp3-demo.mjs`-style script on the new engine: autopilot through all starred built-ins with transitions, `←/→/Space/F/Q/R/E` keys, a 5-min 60A run: 0 console/page/GL errors, late frames within the pilot numbers, REC of 30 s plays. Optional user run: 30 min 60A, Δdrops ≤ 30 (spec_effects §4.5). Update the spectrum-count ⚠️ and any pruned effects in STATE.
- **Tests:** the whole suite.
- **Done-check:** all green; **lead commits** `cp7-effects` and records the final effect count per category in STATE.
- **Depends on:** S7.1.

## Acceptance mapping
| spec_effects §4 | Proven by |
|---|---|
| §4.1 ≥30 effects/generators in 4 categories + ≥10 gl-transitions, in the autopilot, 0 console/GL errors | S4.1–S4.5 (`?bench` gate per batch, counts tallied in S4.4), every effect in a starred built-in; S7.2 full-cycle Playwright run |
| §4.2 up to 4 layers + chains + blend, saved, reloaded, exported/imported as JSON | S1.3 (`SceneDoc`, `parseScene/parseLibrary` tests), S3.3 (compositor), S5.1–S5.2 (edit), S6.1–S6.2 (IndexedDB, export/import); CP6 demo |
| §4.3 any numeric parameter bindable, visible in motion, survives save/load | S1.2 (`bind.ts` tests), S1.5 (per-frame writer incl. `name.i`, long, bool/event), S3.3 (opacity/speed), S5.2 (UI); `doc.test.ts` "bindings survive"; CP1 and CP5 demos |
| §4.4 pasting a single-pass Shadertoy creates a working generator layer | S3.1 (`wrapToy` tests), S3.4 (node), S5.3 (dialog); CP5 demo |
| §4.5 60A holds on the M4 as in pilot §7.5 | E1 fast path (S1.5, checked in S2.3/S2.4 ±10 %), S2.5 compile-all + prepare-ahead (+ pool per G2), `res`/governor (S3.3), 5 ms budget per batch (S4.x); S7.2 run |
| §4.6 gates pass; pure logic tested (bindings math, LFO, (de)serialisation, ISF header parsing) | every step's done-check; `isf.test.ts` (S1.1), `bind.test.ts` (S1.2, incl. LFO shapes), `doc.test.ts` (S1.3), `glsl.test.ts` (S3.1), `director.test.ts` (+3, S2.1); S7.2 |

## Research gaps
None blocking. G1–G3 become lead-run `?bench` numbers (S2.2) with conditionals in S2.5. G4 is the S2.2 sweep. G5 (Shadertoy audio layout) and the byte scalings in S3.2 stay ⚠️ until a pasted music-reactive toy is checked by eye. G6 has the S4.5 fallback. ⚠️ Assumptions needing confirmation at review: spectrum counts toward the 30 total without a category (S2.3); `created?: number` is added to `SceneDoc` v1 before any user data exists (S6.1); the Vite 8 glob option names (S1.5).
