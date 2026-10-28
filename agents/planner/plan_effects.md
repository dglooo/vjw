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

### S2.2 `[x]` `?bench` page: G1 compile timing + ISF-Files sweep, G2 allocation hitches, G3 timer presence, per-effect GPU cost
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** one page the lead runs with Playwright; its `window.__bench` is the curation gate for every content batch.
- **Files:** `web/src/bench.ts`, `web/src/main.tsx` (`if (location.search.includes('bench')) import('./bench')` after `./app`), `web/scripts/isf-sweep.mjs`.
- **Behaviour:** `isf-sweep.mjs` copies every `*.fs` under `donor/ISF-Files` into `web/public/isf-sweep/` (git-ignored; add the line to `web/.gitignore`) and writes `index.json` (file names). `bench.ts`, after Start (waits for `store.needsStart` to clear): line 1 prints `timer query: yes/no` (G3) and `KHR_parallel_shader_compile: yes/no`. **G1:** compiles every catalog shader program (cache cleared first: `program` gets an `evict()` or the bench constructs `createProgramInfo` directly) measuring `performance.now()` around compile+link+`getProgramParameter(LINK_STATUS)`; prints count, median, max, total ms. **Sweep (`?bench&sweep`):** fetches `index.json` + each file, `parseIsf`, compiles each (same timing), lists per file: kind, category, compile OK/log, `unsupported`; `console.table` and `window.__sweep`. **G2:** during `builtin:tunnel`, 10 bursts 2 s apart, each allocating 4 RGBA8 + 2 RGBA16F targets at the internal size, clearing them and disposing; prints `drops` delta (from the store) per burst and the max rAF delta. **Per-effect:** builds test docs (`bench:<id>`: each generator alone; each filter over `native/tunnel`), registers them for `live(id)` (a `docs` override map in `live.ts`, exported for the bench only — 2 lines), `director.setPlaylist(ids)` + `setHold(true)`, `next()` every 3 s (the fade uses the director's 2 s; measure the last 1 s of each item once `shot.to` is null) → `gpuMed/gpuP95` from `gpuMs` samples, `gl.getError()` once, `console.error` count (wrapped). Ends with `console.table` and `window.__bench.done = true`. Runs at whatever size the window has; the lead sets fullscreen 60A on the M4 (1728×1117 internal at scale 1, the design budget size).
- **Tests:** none (DOM/GL).
- **Done-check:** gates green; `npm run build` passes; the lead's Playwright run records G1–G3 in STATE and the sweep's compile-OK list by category (the curation input for CP4). **Conditional for S2.5:** G1 total for the starred set > 500 ms ⚠️ knob → async compile; G2 shows ≥1 late frame per burst → add the target pool in S2.5.
- **Depends on:** S2.1; pilot S6.1 closed (`main.tsx`).
- **Changed during implementation:**
  - **`app.ts` gets one line at its end, `export { director }`.** The director is module-local there, and the bench needs `setPlaylist`, `setHold` and `next`. The line sits at the end of the file, clear of S2.4's comment edit.
  - **The sweep runs last, not after G1.** Compiling 327 programs stalls frames, and the 60A governor then steps the scale down, so G2 and the per-effect numbers would be measured at a smaller size. `done` is set after the sweep.
  - **`index.json` is `[{ name, vs }]`.** `vs` means a sibling `.vs` exists. This is S1.1's check for `3d Rotate` and `Vertex Manipulator`, which feed no varying. The sweep marks those files `custom vertex shader`.
  - **Script input.** `isf-sweep.mjs` reads the argument or `ISF_FILES`. Its default is the main checkout's absolute `donor/ISF-Files`, because worktrees have no `donor/`.
  - **G1 compiles with raw WebGL, not twgl.** That avoids twgl's console spam, gives the sweep its logs, and lets the programs be deleted afterwards. A unique comment tail misses our map and any cache keyed by source. A lower cache that ignores comments still hits: Kaleidoscope took 0.8–2 ms, against a 43 ms median for first-time programs. A program already built on this machine reports its warm time.
  - **G1 covers the catalog's `ShaderDef`s only.** Natives build their programs inside `create()`, so `compileMs` is `null` for them.
  - **Output.** Line 1 (G3) prints before Start, so the user can read it without clicking. Lines go to the console and to a `<pre>` overlay. The G2 and per-effect headers carry the internal size.
  - **Coder's run.** Playwright, installed Chrome, 1200×800 viewport at DPR 1. 60A halves that, so the run is at **600×400 internal**; the lead's fullscreen run is the real one. `?bench` took 35.6 s, `?bench&sweep` 46.2 s. Saved as `s22_*` in the scratchpad.
    - **G3:** timer query yes; `KHR_parallel_shader_compile` yes.
    - **G1:** 1 catalog program (Kaleidoscope): 2.0 ms, then 0.8 ms on the second load.
    - **G2:** 10/10 bursts gave +0 drops on both loads; max rAF Δ 18.4–18.7 ms. Clean at 600×400.
    - **Per effect** (GPU median/p95, ms): tunnel 0.24/0.25, spectrum 1.01/1.23, glitch 0.35/0.36, Kaleidoscope over tunnel 0.32/0.33. glError 0, 0 console errors and 0 page errors. Particles join automatically once S2.4 registers it.
    - **Sweep:** 263 of 327 compile OK, 245 of them usable. First-time compile+link: median 42.7 ms, p10 13.3, p90 47.4, max 111.9; total 10.6 s for the 263.
    - **Sweep OK / usable by kind/category:** filter/none 86/81, filter/retro 32/27, filter/geometry 18/16, filter/feedback 17/17, generator/none 31/27, generator/geometry 15/15, transition/none 59/57, transition/retro 5/5. No ISF file maps to `liquid`.
    - **The 64 failures:** 33 are custom-`.vs` varyings (already `unsupported`). 19 hit GLSL ES 1.00 limits: non-constant loop bounds or indexing, const init declarations, an array constructor. 12 are desktop-GLSL typing or old ISF runtime names: int/float mixing (7), `vv_FragNormCoord` / `_<img>_imgRect` (3), `uvec2` (2).


- **Lead fullscreen bench (2026-10-28):** design size 60A internal 1728×1118 (viewport 1728×1117 @ DPR 2), installed Chrome, M4.
  - G3: timer + KHR_parallel_shader_compile both yes. G1: Kaleidoscope 5 ms.
  - **G2: 10 bursts of 6 targets, +0 drops each, max rAF Δ 18.6 ms, so no target pool is needed.**
  - Per effect, GPU median / p95 ms:

    | effect | median | p95 |
    |---|---|---|
    | tunnel | 0.80 | 1.33 |
    | spectrum | 3.00 | 3.10 |
    | particles | 4.55 | 4.67 |
    | glitch | 1.28 | 2.17 |
    | Kaleidoscope | 1.05 | 3.18 |

  - All are within the 5 ms budget; particles is the closest. glError 0, 0 console errors.

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

### S2.5 `[x]` Compile-all at Start ("compiling n/N") + prepare-ahead (+ pool only if G2 says so)
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** no shader compile and no target allocation inside a fade (design E2).
- **Files:** `web/src/gl/live.ts`, `web/src/app.ts`, `web/src/store.ts` (+ `ui/Overlay.tsx` shows `store.compiling` under the Start button / in the bar, a 4th file, 3 lines ⚠️).
- **Behaviour:** `warm(ids, onProgress)`: for every shader node in those docs (and every transition from S3.2 on), `program(vs, fs)` through the cache. With `KHR_parallel_shader_compile` present: create all programs first, then per rAF poll `getProgramParameter(p, ext.COMPLETION_STATUS_KHR)` and resolve when all are linked (progress = linked count); without it, compile synchronously in chunks of 4 per rAF so the "compiling n/N" line repaints. `app.ts` calls `warm(playlist)` right after `start()` (and at load when the context is already running), `store.patch({ compiling })` per progress, `null` at the end; the loop keeps running meanwhile (built-in scenes whose programs aren't ready yet render black for those frames; acceptable at Start). **Prepare-ahead:** when a fade completes (`shot.to` turns null), `live(director.peek())` is created and fitted on that frame and the outgoing instance is disposed (unless it is the current one or the peeked one); `←/→` create on demand. **Pool (conditional on S2.2 G2 ≥ 1 late frame per burst):** `renderTarget` takes freed targets from a small per-format free list instead of deleting them, capped at 8 ⚠️ otherwise skip, note "G2 clean, no pool".
- **Tests:** none (GL/DOM).
- **Done-check:** gates green. **Manual:** Start shows "compiling n/N" briefly; a 5-min autopilot run in the lead's Playwright shows 0 late frames inside fades. **Lead commits** `cp2-effects`.
- **Depends on:** S2.2 numbers, S2.4.
- **Changed during implementation:**
  - **ISF shaders compile through twgl's `createProgramInfoAsync`,** which polls `COMPLETION_STATUS_KHR`. The Freshness note says the twgl 7.0.0 typings lack it, but `dist/7.x/twgl.d.ts` declares it. Without the extension, `program()` runs 4 per frame as planned. Progress counts effects (5 today), not programs.
  - **Natives warm through a throwaway instance:** `create(gl).dispose?.()`, one per frame. Their programs are built inside `create()` from sources private to each module, so these compiles are synchronous: 4 natives, 9 programs. The probe saw one 83 ms frame at Start. The CP4 growth is ISF, which compiles in parallel.
  - **A second program cache, `ready`, in `live.ts`.** The engine's map is private and `engine.ts` was out of scope. `node()` reads `ready` before `program()` (a `ponytail:` comment marks it). S3.2 should fold it into the engine's `program()` when it warms the transitions.
  - **Warm-up trigger.** `app.ts` doesn't call `start()` (the Overlay and `input.ts` do), so it warms on the audio context's first `statechange`, or at load when the context is already running.
  - **Prepare-ahead runs on every frame without a fade,** not only on the frame `shot.to` turns null. `prepare([shot.from, director.peek()])` builds what's missing and disposes the rest. That needs no edge state and also covers load (Spectrum is built before Start), `setPlaylist` and hold. `←/→` to a freed scene build on demand.
  - **Not fitted ahead.** Natives size their targets in `draw()`, so a pre-fit would need a hidden draw. Their first draw inside the fade allocates the targets instead. G2 and the probe below (0 late frames in all 5 first-visit fades) show that's harmless. Add a hidden draw if a run shows late frames at fade starts.
  - **G2 clean, no pool.**
  - **`?bench` G1** may now read warm-cache times for the starred effects, because `warm()` compiles them at Start first.
  - **`Live.rebuild()` still has no caller** (S5.1). `dispose()` now runs on every switch.
  - **Chrome check.** Playwright on :5178, installed Chrome, `--mute-audio`, 1200×800 (600×400 internal), kicks128n.wav, `→` ×10 (2 cycles). Scripts and logs are `s25_*` in the scratchpad.
    - **Before:** Start +1 drop. First visits: Spectrum 0, Particles +1, Glitch +1, Kaleido 0, Tunnel 0. Revisits 0.
    - **After, Start:** "compiling 1/5" at 79 ms, done at 214 ms after the click; +1 drop.
    - **After, programs:** none compiled after Start (11 programs and 22 shaders throughout).
    - **After, leaks:** live GL objects per scene are identical in both cycles (e.g. Spectrum 16 tex / 16 FB, Glitch 4 / 4, the engine's own). Nothing leaks.
    - **After, errors:** glError 0; 0 console errors or warnings.
    - **After, drops:** the walk saw 1 in 10 switches (Glitch, cycle 1, taken with screenshots between presses). A probe without screenshots logged 0 frames over 25 ms in all 5 first-visit switches; its only late frame was the 83 ms one at Start.
  - **Gates:** lint and tsc clean, 119 tests, build OK. No new tests: the step adds no pure logic (GL/DOM only).

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

### S3.2 `[x]` Engine services: persistent targets with resample, audio textures, the transition pass
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** the engine side of CP3 (design E2 persistent targets, E3 audio textures, E7 transition pass).
- **Files:** `web/src/gl/engine.ts`, `web/src/app.ts`, `web/src/fx/transitions/crossfade.glsl` (+ `fx/catalog.ts` globs `./transitions/*.glsl` through `wrapTransition` → `gl/<stem>` defs and `transitions` ids; a 4th file, ~6 lines ⚠️).
- **Behaviour:** `renderTarget(hdr, persistent)`: on `fit()` with a new size a persistent target allocates the new texture, draws the old one into it with a copy pass (linear), then frees the old (no clear); transient targets refit as today; a new persistent target starts cleared. `setAudio(magDb, wave)`: three R8 textures (`fft` 512×1 from a −100…−30 dB window ⚠️, `wave` 512×1 as `0.5 + 0.5·sample` ⚠️, `toy` 512×2 rows fft/wave ⚠️ G5) uploaded with `texSubImage2D` each frame from one reused `Uint8Array`; `app.ts` adds `analyser.getFloatTimeDomainData(wave)` and the call. **Transition pass:** `setTransition(id)` selects a `gl/<Name>` or `own/crossfade` def (program via the cache, `inputs` defaults as uniforms); `render` replaces the `final` mix with it: `from` = A, `to` = B (or A), `progress = mix`, `ratio = w/h`, `uRes`. `crossfade.glsl` (own): `vec4 transition(vec2 uv){ return mix(getFromColor(uv), getToColor(uv), progress); }`. `app.ts`: when `shot.to` goes from null to an id, `setTransition(pick())` = random from `transitions`, never the same twice in a row (one id now, so trivially crossfade). Both default to `own/crossfade` at boot.
- **Tests:** none new (GL).
- **Done-check:** gates green. **Manual:** looks identical to CP2; `?debug` 0 drops over 2 min.
- **Depends on:** S3.1, S2.5.
- **Changed during implementation:**
  - **The engine reads the catalog through `scenes.catalog`, which `app.ts` fills next to `scenes.live`.** The catalog's natives import the engine, so a direct import would add a runtime import cycle. `app.ts` calls `setTransition('own/crossfade')` at boot.
  - **Without a fade, the stage pass is a plain copy, not the transition at progress 0.** This is design E7 ("with no fade, it is a plain copy"). The `copy` program also does the persistent resample and replaces `final`. So a gl-transition that isn't exact at progress 0 can't show between fades and costs nothing then.
  - **A transition is picked whenever `shot.to` changes to a new id,** not only on null → id. That also covers a fade begun mid-fade by `←/→` and one begun on the frame the last one ended. The code is the same size.
  - **Ids come from the file:** a source with a `// Author:` line (all 125 gl-transitions files have one) becomes `gl/<stem>` with that author as `credit`. Our files have no such line, so they become `own/<stem>` (credit "VeeJay Wizard"). Transitions sit in `catalog` with `kind: 'transition'` and `passes: []`.
  - **The byte array is a `Uint8ClampedArray`,** so −∞ dB (silence) and out-of-window values clamp to 0…255 with no extra code. `texSubImage2D` takes it for `UNSIGNED_BYTE`. One 1024-byte array holds both rows: `toy` uploads all of it, `fft`/`wave` each upload a row through the WebGL2 `srcOffset`. The textures are LINEAR and CLAMP_TO_EDGE.
  - **S2.5's `ready` cache is folded in.** The engine's `programAsync(vs, fs)` compiles through `createProgramInfoAsync` into `program()`'s cache. It skips a source already cached and keeps the first program if a sync compile wins the race. `live.ts` dropped `ready`. `warm()` now also compiles every transition ("compiling n/N" counts them: 6 today).
  - **The engine VS is unchanged,** so the `glsl.test.ts` pin holds.
  - **Chrome check.** Playwright on :5179, installed Chrome, `--mute-audio`, 1200×800, kicks128n.wav. Scripts and logs are `s32_*` in the scratchpad.
    - **Walk:** `→` ×5 went Tunnel → Spectrum → Particles → Glitch → Kaleido Tunnel → Tunnel. glError 0.
    - **Fades:** mid-fade shots (0.9 s after each press) show the straight blend of the pilot crossfade.
    - **Probe while the wav plays:** RGBA8 and RGBA16F persistent targets keep their red through a 4→8 refit, and a transient one comes back cleared. `fft` bytes move every frame (bass bins ≈200, top bins ≈0), `wave` reads 123–132 around 128, and the `toy` rows equal `fft`/`wave`. `transitions` = `['own/crossfade']`.
    - **Errors:** glError 0 and 0 console errors after the probe. The walk's only console error was the first probe's own `readPixels` of a half-float target as bytes. Fixed in `s32_probe.mjs`.
    - **Drops:** 1 at Start, as in CP2.
    - **Not run:** the 2-min `?debug` drop count.
  - **Gates:** lint and tsc clean, 119 tests, build OK. No new tests: the step adds no pure logic (GL only).

### S3.3 `[x]` `live.ts`: ISF passes, layers with blend/opacity, layer clock + `res`, audio inputs
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** the full layer compositor and ISF multipass (design E1, E2, E3).
- **Files:** `web/src/gl/live.ts`, `web/src/scenes/builtin.ts`, `web/src/fx/isf/<one PERSISTENT filter>.fs`.
- **Behaviour:** **Passes:** for a `ShaderDef` with `passes`, run them in order with `PASSINDEX`; named `TARGET`s get a `renderTarget(float, persistent)` (`FLOAT` → RGBA16F; `PERSISTENT` → a ping-pong pair, read the previous frame's, write the other, swap) sized by `sizeExpr(width/height, { WIDTH, HEIGHT, ...inputs })` or the layer size; later passes sample earlier targets by name (+ `_imgSize`); the last pass draws into the chain's output. `audio` inputs bind `audioTex.wave`, `audioFFT` bind `audioTex.fft` (sizes 512×1). **Layers:** clear `acc`; per layer the gen renders into `temps[0]` (or a per-layer target at `size × res` when `res < 1`, linear upscale on composite), fx ping-pong; the final texture is composited onto `acc` by one composite program with the E2 table (normal `ONE, ONE_MINUS_SRC_ALPHA` with `rgb·a·op`; add `ONE, ONE`; screen `ONE_MINUS_DST_COLOR, ONE`; multiply `DST_COLOR, ZERO` with `1 − op + op·rgb`), blending disabled after. Fast path kept: 1 layer, normal, opacity 1, res 1 → the last pass draws straight into `acc`. **Clock:** per layer `t += dt · speed`; shader nodes get `TIME = t`, natives a per-layer reused `FrameInput` copy with warped `time`/`dt`. `opacity` and `speed` are bindable like inputs (`layer.bind`). **Resize:** persistent targets `fit()` on size change (resampled), others refit. `builtin.ts` adds `builtin:particles-over-tunnel` (tunnel; particles `add`, opacity 0.9) and `builtin:trails-spectrum` (spectrum + the PERSISTENT filter).
- **Donor authorisation:** one `PERSISTENT` `inputImage` filter from the S2.2 sweep's compile-OK list (`donor/ISF-Files`, MIT), header kept + the `// Source:` line.
- **Tests:** none new (GL); `sizeExpr` is tested in S1.1.
- **Done-check:** gates green. **Manual:** both new scenes play; trails keep flowing when the governor steps 1 → 0.85 (force it with a heavy tab, `?debug` shows the scale) with no pop; the 4 pilot built-ins still take the fast path (GPU numbers ±10 %).
- **Depends on:** S3.2.
- **Changed during implementation:**
  - **The PERSISTENT filter is `isf/Long Exposure`** (VIDVOX, "Feedback"). It has 2 passes: a persistent FLOAT `feedbackBuffer`, then a pass that samples it by name. Trails spectrum sets absorption 0.1 and discharge 0.12 for longer, softer trails.
  - **The fast path is the bottom layer, as in design E1, not only 1-layer docs.** A bottom layer at normal, opacity 1 and res 1 draws straight into `acc` even with layers above it, so Particles over tunnel's tunnel skips a composite. A bottom layer then looks the same with or without layers on top.
  - **Every TARGET is a read/write pair, persistent or not,** as in the official runtime's `ISFBuffer`. A pass reads the pair's last texture, draws into the other, then swaps, so later passes in the frame read what it drew. No pass samples the texture it draws into. With one target, a pass whose sampler is live would be a WebGL feedback loop (`INVALID_OPERATION`), because ISF declares a sampler per target. The cost: a non-persistent target takes 2 textures, not 1.
  - **A last pass with a TARGET** (11 of the 29 compile-OK persistent filters, e.g. Comet Tails) makes that target the node's output, with no copy. For such a node the fast path composites instead.
  - **`res` < 1:** the gen draws into the layer's own RGBA8 target. Its fx still run at the shots' size, and `_inputImage_imgSize` stays the shots' size, so the input reads as already upscaled and `IMG_PIXEL(inputImage, gl_FragCoord.xy)` still works. Natives get the layer size in their `FrameInput` copy. `RENDERSIZE` is set per pass to the target it draws into.
  - **Size expressions are evaluated on resize only** (a `ponytail:` comment). A bound input named in one resizes nothing until the next resize. Results are clamped to 1…`MAX_TEXTURE_SIZE`. One that throws goes to `errors` and falls back to the node's size.
  - **A broken upper layer is skipped.** A broken bottom layer still clears `acc` to black, as before. Clearing `acc` for an upper layer would erase the layers below it.
  - **Natives' `time` is the layer clock** from instance creation, no longer rAF's clock. Nothing visible changes. Layer `opacity`/`speed` are copied at build, as node values are; S5.1 decides how panel edits reach them.
  - **Chrome check.** Playwright on :5182, installed Chrome, `--mute-audio`, 1728×1118 at 60F (internal 1728×1118, scale 1), `s33_kicks_loop.wav`. Scripts and logs are `s33_*` in the scratchpad.
    - **Walk:** under hold, `→` through all 7 built-ins. The 5 existing ones look as before.
    - **Particles over tunnel:** particles are added over the tunnel.
    - **Trails spectrum:** fading ghost columns stand above bars that just dropped.
    - **Fast-path GPU (ms, median over 1 s, music playing):** Tunnel 1.33, Spectrum 3.08, Particles 5.3, Glitch 2.24, Kaleido 1.82. The 2 new scenes: Particles over tunnel 6.14, Trails spectrum 4.07. The lead's CP2 numbers (0.8 / 3.0 / 4.55 / 1.3 / 1.05) were taken in silence, so this is not a same-conditions ±10 % check. The fast path issues the same draws as before, by construction.
    - **`res` 1 → 0.5, composite included (GPU ms):** Tunnel 1.37 → 0.96, Spectrum 3.08 → 1.82, Particles 5.35 → 4.03. At 600×400 internal (60A in a 1200×800 window) the gain disappears: Spectrum went 1.16 → 1.58, because there per-pass overhead outweighs fill.
    - **Governor step:** `setOutput(w, h, 0.85)` forced on Trails spectrum. Stage luminance per frame around the step stays on the kick pattern: 34.66 → 42.6, matching the pre-kick rise 29.02 → 40.63 seen before the step. No dip, so the feedback buffer was resampled, not cleared.
    - **Errors:** glError 0; 0 console errors or warnings.
    - **Drops:** 15 over the run, which includes 30 full-frame `readPixels` at 1728×1118 and 3 first-visit test docs. The first run at 600×400 had 4.
  - **Gates:** lint and tsc clean, 119 tests, build OK. No new tests: no new pure logic (`sizeExpr` is S1.1's).

### S3.4 `[x]` Shadertoy node (`toy/<uuid>`, inline code) + an own `mainImage` fixture scene
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** a pasted single-pass shader runs as a generator (design E5); the paste UI comes in S5.3.
- **Files:** `web/src/fx/catalog.ts`, `web/src/gl/live.ts`, `web/src/scenes/builtin.ts`.
- **Behaviour:** `toyDef(node)`: `wrapToy(node.code)` → `ShaderDef { id: node.ref, glsl: 300, kind: 'generator', credit: node.credit ?? '' }`, memoised by code string. `live.ts` resolves `toy/` refs through it; uniforms: `iResolution = [w, h, 1]`, `iTime/iTimeDelta/iFrame` from the layer clock, `iMouse = 0`, `iDate`, `iSampleRate = ctx.sampleRate`, `iChannel0 = audioTex.toy`, `iChannel1..3` = one shared 256² RGBA noise texture made once (`Math.random` bytes), `iChannelResolution` accordingly; comment-param inputs become uniforms. A compile error → `errors` with line numbers shifted by `prefixLines`, layer black. `builtin:toy-plasma`: an own 10-line `mainImage` plasma (no third-party code), `credit: 'VeeJay Wizard'`, star true.
- **Tests:** none new (`wrapToy` tested in S3.1); `doc.test.ts` round-trips the inline-code doc.
- **Done-check:** gates green. **Manual:** the toy scene plays and reacts via `iChannel0` (use `texture(iChannel0, vec2(0.05, 0.25)).r` for bass in the fixture). **Lead commits** `cp3-effects` after a 5-min Playwright run (0 GL errors, 0 late in fades).
- **Depends on:** S3.3.
- **Changed during implementation:**
  - **The fixture reads bass at x = 0.004, not 0.05.** The toy texture's 512 bins run up to Nyquist (fftSize 1024, ≈ 47 Hz per bin at 48 kHz), so x = 0.05 is ≈ 1.2 kHz. x = 0.004 reads bins 1–2 (≈ 45–95 Hz). G5: Shadertoy's texture spans about 0–11 kHz, so a pasted toy's x reads about twice the frequency it would on shadertoy.com.
  - **`#define HW_PERFORMANCE 1` is prepended in `toyDef`** (`glsl.ts` untouched), so a toy's `prefixLines` is wrapToy's + 1 (19). `toyDef` returns `ShaderDef & { prefixLines }`, for the log shift here and for S5.3.
  - **The compile log comes from compiling the FS again (`toyLog` in `live.ts`), on a failure only.** The engine's `program()` sends twgl's log only to the console. `ERROR:`/`WARNING:` line numbers are shifted to the paste's. S5.3 can export `toyLog`.
  - **`warm()` resolves toy nodes as well,** so Toy plasma compiles at Start like the rest (its `program()` returned in 0 ms before the first visit).
  - **`iDate` follows Shadertoy:** month from 0, seconds with ms. ISF's `DATE` is unchanged. `iMouse`, `iFrameRate` and `iChannelTime` are not set and stay at GL's zero (iFrameRate was not in the step's list). `iResolution` shares `RENDERSIZE`'s memory (`RS` is a view on its first two floats), so the per-pass size write sets both.
  - **`iFrame` is the scene's frame counter, which reads 1 on the first frame.** ISF's `FRAMEINDEX` already does this, though ISF says 0. Out of scope, so it is reported and not fixed.
  - **`isf.test.ts`'s built-in-ref check now skips `toy/` refs,** as `doc.test.ts`'s already did. The fixture's ref is `toy/plasma` (a readable fixed id, not a UUID).
  - **Chrome check.** Playwright on :5184, installed Chrome, `--mute-audio`, 1200×800 at 60A (600×400 internal), `s33_kicks_loop.wav`. Scripts and logs are `s34_*` in the scratchpad.
    - **Toy plasma:** 0 errors, GPU 0.65 ms. Over 150 frames the stage luminance (94–144) follows the bass texel (0.34–1.0) with r = 0.994.
    - **Probe toy into a 512×2 target:** `iChannel0` equals the toy audio texture, 1024/1024 texels. `iChannel1` is noise (220 distinct bytes). The comment param `gain` becomes the input {0.5, 0…1} and the uniform 0.5. After two 0.5 s frames, iTime is 1, iTimeDelta 0.5 and iFrame 2. iSampleRate is 44100.
    - **Vector uniforms:** a second short run (`s34_uniforms.mjs`), because the first printed them as null. iResolution [320, 180, 1], iMouse 0, iDate [2026, 9, 28, 77222.68], iChannelResolution [512, 2, 1] then 3 × [256, 256, 1].
    - **A broken paste (`o = foo;` on paste line 3):** `errors` = "toy/s34-bad: ERROR: 0:3: 'foo' : undeclared identifier …". The stage is black, the loop runs at 61 fps and there is no page error. Its 3 console errors are the expected ones (twgl ×2, `fail()`).
    - **Errors:** glError 0, and 0 console errors outside the broken paste. 4 drops over the run, which reads pixels on 150 frames.
  - **Gates:** lint and tsc clean, 121 tests, build OK.

### S4.1 `[x]` Content batch 1: trails / feedback / kaleidoscope / mirrors (target ≥8)
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** the feedback category filled, budget-checked.
- **Files:** `web/src/fx/isf/*.fs` (~5 from the sweep's compile-OK list: kaleidoscope, mirror variants, tiling, one PERSISTENT feedback; the user's picks from the contact sheet ⚠️ names from the sweep), `web/src/fx/own/*.fs` (~3: `feedback-zoom.fs` MilkDrop-style zoom-rotate warp with `VJW_BIND` on onset, `trails.fs` half-float decay (`PERSISTENT` + `FLOAT`), `echo.fs` slit-scan), `web/src/scenes/builtin.ts` (+3 starred scenes using them).
- **Behaviour:** every file keeps its header; own files are valid ISF (JSON header with `CATEGORIES: ["Feedback"]`, `VJW_BIND` suggestions). Each effect appears in ≥1 starred built-in.
- **Donor authorisation:** `donor/ISF-Files` (MIT) → `fx/isf/`, header kept + `// Source:` line. Record the list of copied file names in the step's "Changed during implementation" note (S7.1 consumes it).
- **Tests:** `doc.test.ts` round-trips the new docs.
- **Done-check:** gates green; `?bench`: every new item compiles, 0 GL/console errors, p95 ≤ 5 ms at 1728×1117 (over budget → lower `res` or drop); the lead's contact sheet; the user prunes.
- **Depends on:** S3.4, S2.2 sweep list.
- **Changed during implementation:**
  - **Run before S3.4** (lead's call, a parallel worktree): only CP3's `PERSISTENT` targets and layers were needed (S3.3).
  - **Copied from `donor/ISF-Files/ISF` (MIT), header kept, `// Source:` line added** (for S7.1):
    - `Comet Tails.fs` (VIDVOX);
    - `Circular Feedback Mask.fs` (VIDVOX);
    - `Kaleidoscope Tile.fs` (by VIDVOX);
    - `Sine Warp Tile.fs` (by VIDVOX);
    - `Mirror.fs` (by VIDVOX).
  - **Own files in `fx/own/`,** all `CATEGORIES: ["Feedback"]` with a `VJW_BIND` suggestion. Per-frame amounts are at 60 fps, rescaled by `TIMEDELTA`.
    - `feedback-zoom.fs`: MilkDrop-style. It keeps the last frame zoomed, turned and decayed under `max()` of the new one, in a half-float persistent target. `zoom` ← onset.
    - `trails.fs`: half-float decay. The trail drifts up and its hue walks round the grey axis. `rise` ← bass.
    - `echo.fs`: slit-scan. A live band runs across the middle, and its edges stream out to the top and bottom in whole-pixel steps, so the stream never blurs. `speed` ← bass. RGBA8 persistent.
  - **Mirror's ISF category is "Geometry Adjustment",** so it counts as geometry. **Feedback after this step: 9** (Kaleidoscope, Long Exposure, the 4 ISF above and the 3 own files), up from 2.
  - **Scenes (starred, appended):**
    - `builtin:spiral-mesh`: tunnel-mesh (res 0.75, its usual bindings) → feedback-zoom.
    - `builtin:slit-scan`: tunnel → Sine Warp Tile (`angle` ← a 33 s lfo saw) → echo.
    - `builtin:kaleido-maze`: Truchet (res 0.75; lines are `color2`, so cyan on navy) → Kaleidoscope Tile (`rotation` ← a 20 s lfo saw, `angle` ← bass) → Comet Tails.
    - `builtin:feedback-ring`: spectrum (res 0.5) → Mirror (vertical) → Circular Feedback Mask (`twirlAmount` ← bass, `feedbackRate` ← onset).
    - `builtin:rainbow-trails`: spectrum (res 0.5) → trails.
  - **All single-layer.** The tried 2-layer Rainbow trails measured 6.1 / 6.3 ms and looked washed out: warped tunnel at the bottom, spectrum + trails `screen` 0.9 on top, and the bright tunnel drowned the trails. Mirror over the trails spectrum was also dropped.
  - **Budget, Playwright on :5185:** installed Chrome, muted, viewport 1728×1117 @ DPR 2 (internal 1728×1118), `s44_kicks_loop.wav`. Files are `s41_*` in the scratchpad.
    - **`?bench` per effect over the tunnel, GPU median / p95 ms.** That run's tunnel read 1.99 / 3.04 against the usual 1.3: Circular Feedback Mask 3.33 / 4.86, Comet Tails 3.73 / 4.58, Kaleidoscope Tile 1.73 / 2.95, Sine Warp Tile 1.51 / 1.57, Mirror 1.83 / 1.89, echo 2.55 / 2.61, feedback-zoom 3.07 / 3.14, trails 3.04 / 3.10. A half-float feedback pass costs about 1 ms at this size.
    - **glError 0 and 0 console errors** on every item and scene. No effect was dropped.
    - **Scenes, GPU median / p95 ms, all ≤ 5 in the runs that count:**

      | scene | first run (after `?bench`) | tunnel ref 1.7–1.8 | tunnel ref 1.37 |
      |---|---|---|---|
      | Spiral mesh | 2.73 / 2.82 | 4.02 / 4.51 | |
      | Slit scan | 1.78 / 2.67 (no Sine Warp Tile yet) | 2.98 / 3.06 | |
      | Kaleido maze | 2.48 / 2.90 | 4.02 / 4.24 | |
      | Feedback ring | 2.88 / 3.18 | 2.88 / 3.13 | 2.88 / 3.23 |
      | Rainbow trails | | | 3.42 / 3.77 |
  - **Bench noise.** Other worktree agents shared the GPU (S4.2/S4.3/S3.4 benches were running). In loaded runs the same docs read 2–4× higher, e.g. Feedback ring 10.1 / 13.0 and Rainbow trails 10–15, while builtin:spectrum alone read 5.5–6.8. Every doc was re-measured with a `builtin:tunnel` reference in the same run, and only near-clean runs count above.
  - **Look (screenshots `s41_out/`, `s41_ab/`):**
    - Spiral mesh: the neon wire tube with stacked, zooming echo copies of its grid. It is bright and busy.
    - Feedback ring: the mirrored spectrum sits in a central disc, and concentric pink/yellow/green rings stream out and fade to black. Clean.
    - Kaleido maze: cyan maze lines on navy in a rotating kaleido tiling (rosettes, nested squares), with faint comet ghosts.
    - Rainbow trails: glowing spectrum bars with dimmer ghosts rising above the tops.
    - Slit scan: the warped tunnel in a centre band, with beat-spaced horizontal bands streaming out. It reads as a glitchy time-smear, the weakest look, for the user to prune.
  - **Tests:** none new. `doc.test.ts` round-trips every built-in and checks every ref against a bundled file. `isf.test.ts` checks the own files' category, `unsupported` and `VJW_BIND` keys. 121 pass.

### S4.2 `[x]` Content batch 2: 3D / geometry (target ≥7 incl. tunnel, particles)
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** raymarched and SDF generators within budget.
- **Files:** `web/src/fx/own/*.fs` (~5: `fractal.fs` (mandelbulb/menger-class raymarch), `sdf-shapes.fs` rotating hg_sdf primitives, `flythrough.fs`, `wave-landscape.fs`, `tunnel-mesh.fs`; `res` 0.5–0.75 set in their built-ins), `web/src/fx/isf/*.fs` (1–2 generators from the sweep if any fit ⚠️), `web/src/scenes/builtin.ts` (+3 scenes, with `speed` bound to bass on one).
- **Donor authorisation:** inline the needed functions from `donor/webgl-noise` (MIT, Ashima Arts / Stefan Gustavson; `https://github.com/stegu/webgl-noise`) and `donor/hg_sdf.glsl` (`MIT OR CC-BY-NC-4.0`, used as MIT, `https://mercury.sexy/hg_sdf/hg_sdf.glsl`) into each file that uses them, with the original header lines. No `#include` machinery.
- **Tests:** doc round-trips.
- **Done-check:** gates green; `?bench` p95 ≤ 5 ms at the scene's `res`; contact sheet; the user prunes.
- **Depends on:** S4.1.
- **Changed during implementation:**
  - **Pulled ahead of CP3 by the lead** (worktree, parallel with S3.2 and S4.4). Single-pass generators render through the CP1 fast path, so each generator gets its **own single-layer starred scene**: 4 scenes, not +3 combos, because layers don't composite before S3.3. `res` (0.5 / 0.75) and the Flythrough layer's `speed` ← bass binding are in the docs and take effect from S3.3. Every scene also binds a shader input that works today.
  - **Kept, 2 own + 2 ISF-Files.** GPU median / p95 ms at 1728×1118, full res, from the `?bench` runs:

    | id | binding | median / p95 | |
    |---|---|---|---|
    | `own/flythrough` | glow ← bass, layer speed ← bass | 3.77–4.16 / 4.00–4.30 | p95 is 5.1–6.9 in the runs where the natives were inflated too |
    | `own/tunnel-mesh` | twist ← bass, flash ← onset | 1.42–1.94 / 1.45–2.51 | |
    | `isf/Worley Cells` | borderWidth ← bass | 3.58–4.06 / 3.62–4.89 | |
    | `isf/Truchet Tile` | tSize ← bass | 0.67–0.91 / 0.80–1.70 | |

  - **Dropped as over budget after 2 tuning iterations each.** Copies are in the scratchpad as `s42_<name>.fs`, so they can come back if the lead's uncontended bench, or `res` after S3.3, makes them fit.
    - `fractal`: Menger KIFS, ITER 3, STEPS 32; 3.80 / 6.38 and 4.85 / 5.20.
    - `wave-landscape`: synthwave grid terrain with sine ridges, 30 steps + secant refine; 4.24 / 5.95 and 4.71 / 5.39.
    - `sdf-shapes`: hg_sdf cube ↔ dodecahedron, ring of cubes, orbit; 9.52 / 10.47 and 7.58 / 7.65. Its cost did not move with steps 64→48→40 or with per-object bounds, so the march isn't the driver; unresolved.
    - Flythrough behaved the same way: 72→56→44 steps all gave a ~4.1 median. It stays at 72 steps, the version that passed.
  - **Bench noise.**
    - Other worktree agents shared the GPU. In some runs the natives read +20–40% (particles 5.4–6.3, spectrum 3.8–4.2), and those runs set the p95 highs above.
    - The bench's p95 is taken over `gpuMs`, a running median of 8. Prepare-ahead compiles the next item synchronously just as the measure window opens, so one run read tunnel-mesh at 1.68 / 8.55.
    - A clean re-measure pass (programs cached) failed: `import('/src/app.ts')` from the page made a second app instance.
  - **No hg_sdf or webgl-noise code ships.** Only the dropped `sdf-shapes` (hg_sdf header + vmax/fBox/fTorus/fGDF-dodecahedron/pR/pModPolar/fOpUnionRound, ES 1.00 fixes) and the first `wave-landscape` (noise2D `snoise`) used them; simplex cost 2.5× the sine ridges.
  - **Copied files (for S7.1):** `web/src/fx/isf/Truchet Tile.fs` (CREDIT pjkarlik, adapted from github.com/pjkarlik/TruchetTiles) and `web/src/fx/isf/Worley Cells.fs` (by VIDVOX), both from ISF-Files (MIT), header kept + `// Source:` line.
  - **Catalog:** one glob for both folders, `import.meta.glob(['./isf/*.fs', './own/*.fs'], …)`, and the id is the path minus `./` and `.fs`. S4.4 adds the same: take either side.
  - **Tests:** `isf.test.ts` +1. Every `own/*.fs` parses with a category, no `unsupported`, and VJW_BIND keys that name its inputs. Every non-native ref in `BUILTIN` names a bundled file, which guards the frozen ids. Doc round-trips already cover every built-in.
  - **Look (Playwright 1280×800, kicks128n.wav):**
    - Flythrough is a green girder lattice with glowing edges; far cells show faint contour speckle (haze banding, unconverged rays) and fade to a dark red.
    - Tunnel mesh is a clean rainbow hexagonal wire tube with a bright vanishing point.
    - Worley cells are cyan gradient cells with dark borders, plus black wedges where the bass-widened borders meet.
- **Changed during implementation:** (lead, S4.2b) a follow-up once S3.3 made `res` work.
  - **All 3 dropped generators are back, at res 0.5.** The `s42_*.fs` copies are unchanged in `own/`: `fractal`, `wave-landscape` and `sdf-shapes`. Each has its own starred single-layer scene after Truchet. The gen bindings repeat each file's VJW_BIND: fold/height/morph ← bass, glow/glow/burst ← onset.
  - **Particles: `res` 0.5 on both particles layers,** in `builtin:particles` and `builtin:particles-over-tunnel`. These are value edits only. The native honours `res` (it draws at its `FrameInput` size, and point size scales with height), so `particles.ts` is untouched and N stays 65 536.
  - **Budget (GPU median / p95 ms, 1728×1118).**
    - Setup: Playwright :5187, installed Chrome, `--mute-audio`, viewport 1728×1117 @ DPR 2. The quality badge read `60A · 1.00×` throughout.
    - First the stock `?bench` (silence, res 1). Then on the same page: `s33_kicks_loop.wav`, plus copies of the built-ins at each `res`, faded in by the director and sampled for 1 s after a 2 s fade.
    - The S4.1/S4.3 benches overlapped most runs. They inflated every number by up to 2×, the res-1 baselines too. The "quiet" column is the windows where no other bench ran (`ps`), or where the same round's other scenes read at their quiet values. Scripts and logs are `s42b_*` in the scratchpad.

    | scene | committed res | `?bench` res 1, silence | kicks, res 1 | kicks, committed res, quiet | kicks, 0.75 |
    |---|---|---|---|---|---|
    | fractal | 0.5 | 2.30 / 4.38 | 4.80 / 5.04 | 2.48 / 2.51, 2.58 / 2.60 | 2.2–3.9 / 3.9–5.6 (borderline) |
    | wave-landscape | 0.5 | 4.73 / 5.21 | 4.06 / 7.54 | 2.43 / 2.52, 2.46 / 2.50 | 2.5–3.9 / 4.0–6.1 |
    | sdf-shapes | 0.5 | 7.60 / 8.14 | 9.50 / 11.77 | 3.45 / 3.60, 3.46 / 3.57 | 5.6–7.4 / 5.9–8.8 |
    | particles | 0.5 | 4.62 / 5.29 | 5.45 / 6.38, 5.07 / 6.57 | 3.06 / 3.23, 3.12 / 3.21, 2.97 / 3.20 | 4.4–6.8 / 5.0–7.2 |
    | particles over tunnel (particles layer) | 0.5 | – | 5.81 / 6.96, 5.45 / 7.47 | 3.48 / 3.57, 3.52 / 3.62, 3.54 / 4.55 | 4.7–7.9 / 6.2–8.6 |

    - **Contended windows.** With another bench running, every scene's p95 spiked to 5–8 at its committed res, including wave-landscape at a 2.5 median. The paired res-1 copies went up just as far. Re-bench uncontended before reading any one row as a fail.
  - **`sdf-shapes` is fill-bound after all.** Its median at res 1 / 0.75 / 0.5 is 9.5 / 6.7 / 3.65, so `res` fixes what march steps couldn't (S4.2). It stays over budget at 0.75.
  - **Look** (one shot each, kicks).
    - The fractal is a close, screen-filling orange/green folded sponge.
    - SDF shapes is a clean gold dodecahedron with pink cubes and a magenta orbit ring.
    - Particles at 0.5 is the same fine-grained blue disc.
    - Wave landscape is the synthwave grid valley with a striped sun, but when the bass lifts the peaks, the coarse march leaves **floating yellow shards** near the mountain tops. That's the shader at any `res`, not the scale. The user prunes or asks for a fix (more STEPS fit at 0.5: median 2.5).
  - **For S7.1:** hg_sdf code now ships, in `own/sdf-shapes.fs` (MIT option, full header kept). No webgl-noise code ships.
  - **Tests and gates.** No new tests: the S4.2 test covers own files and built-in refs, and the doc round-trips cover the new scenes. Lint and tsc are clean, 121 tests pass, the build is OK. 0 console errors and glError 0 over all runs.

### S4.3 `[x]` Content batch 3: liquids / metal (target ≥6)
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** procedural and feedback-advection liquids; no Navier–Stokes (design E8).
- **Files:** `web/src/fx/own/*.fs` (~5: `domain-warp.fs` fluid, `smoke.fs` feedback advection (`PERSISTENT`), `liquid-chrome.fs` with an onset-bound burst via `VJW_BIND`, `metaballs.fs`, `ink.fs`), `web/src/fx/isf/*.fs` (~1 from the sweep ⚠️), `web/src/scenes/builtin.ts` (+3 scenes).
- **Donor authorisation:** webgl-noise functions as in S4.2; ISF-Files as in S4.1.
- **Tests:** doc round-trips.
- **Done-check:** gates green; `?bench` budget; contact sheet.
- **Depends on:** S4.2.
- **Changed during implementation:**
  - **5 own effects, no ISF-Files pick.** No sweep file has a liquid category; the near misses (Ripples, Smoke Screen) are distortion/stylize filters. With the 5 own effects, the liquid category reaches 5.
    - Generators: `domain-warp`, `liquid-chrome`, `metaballs`, `ink`.
    - Filter: `smoke`.
    - All are `CATEGORIES: ["Liquid"]` with a `VJW_BIND` suggestion.
  - **+4 starred scenes, not +3, one per generator.** All are appended to `builtin.ts`:
    - `builtin:liquid-chrome`: burst ← onset, res 0.75.
    - `builtin:fluid`: domain-warp, warp ← bass 1–2.2, res 0.5.
    - `builtin:lava-smoke`: metaballs (size ← bass) → smoke (curl ← bass), res 1.
    - `builtin:ink`: spread ← bass, res 0.5.
  - **Smoke is a 2-pass filter.** Pass 0 writes a `PERSISTENT` + `FLOAT` target at `$WIDTH/2 × $HEIGHT/2`. It is a semi-Lagrangian step through a curl-noise velocity (the `srdnoise` gradient turned 90°, plus a rise), a 4-tap diffuse, `exp(−fade·dt)` decay, and `max` with the input. Pass 1, at full size, is `max(buffer, input)`, so the image stays sharp. The last pass has no TARGET, so the fast path still applies.
    - First version: one full-size pass. Over the tunnel it was 3.81 / 5.09 ms; the 2-pass version is 2.41 / 3.30.
  - **Liquid chrome burst:** the ring radius is `RING·(1 − burst)` and its amplitude is `burst`. When the onset envelope decays, the ring moves outward and slows, with no state.
  - **webgl-noise inlined (MIT, header lines kept; for S7.1).** No ISF-Files were copied.
    - `snoise` (noise2D.glsl, Ian McEwan / Ashima Arts) in `domain-warp.fs` and `ink.fs`.
    - `srdnoise` + `rgrad2`/`permute`/`mod289` (psrdnoise2D.glsl, Stefan Gustavson; the sin/cos branch of `rgrad2`) in `smoke.fs`.
    - Inline comments in the function bodies were trimmed.
  - **Transcendentals drove the cost, not noise or loops.**
    - Metaballs, full size: 4.59 → 2.67 ms. Each blob's `sin()` paths became a smoothstepped triangle, and the per-blob palette became one palette of the field-weighted blob index.
    - Domain-warp: 4 palette calls became 2. `palette(t + 1/3) = palette(t).gbr` and `palette(t + 0.5) = 1 − palette(t)`.
  - **Tunings.**
    - Fluid, 2: warp 2.2–4.5 → 1–2.2, scale 1.6 → 1, octaves 4 → 3, hue 0.55 → 0.3 (the first version was a grainy green "moss"); then the palette.
    - Ink, 1: its first version filled the screen with a pink/blue ridged plasma. It became sparse clouds (mask threshold) of billows, `|noise|`, and 14 → 10 noise calls.
    - Metaballs, 2: the cost, then a broader specular (60 → 24).
    - Smoke, 1: the half-size buffer.
  - **Budget, Playwright on :5186.** Installed Chrome, muted, viewport 1728×1117 @ DPR 2 (internal 1728×1118). Files are `s43_*` in the scratchpad.
    - Scenes, with `s44_kicks_loop.wav` playing, GPU median / p95 ms at their res: Liquid chrome 2.27 / 2.36, Fluid 3.49 / 3.60, Lava smoke 3.64 / 3.82, Ink 1.23 / 2.24. 0 glError, 0 console errors.
    - `?bench`, silent, per effect at full size (generators alone, filters over the tunnel; tunnel alone 1.35): domain-warp 9.11 / 9.14, ink 6.22 / 9.19, liquid-chrome 2.02 / 7.18 (a prepare-ahead spike, as in S4.2), metaballs 2.67 / 2.71, smoke 2.41 / 3.30.
    - So **domain-warp and ink must stay at res ≤ 0.5.** At res 1 a user-built scene with either goes over 5 ms.
    - The GPU was shared. In the previous run, the unchanged chrome read +29% and Fluid read 5.13 / 5.89; this re-measure is the one above. No effect was dropped.
  - **Look (screenshots `s43_<scene>_<k>.jpg`):**
    - Liquid chrome: mercury with a blue sky, a sharp dark floor and white strip highlights. On a 4-on-the-floor kick loop a new ring starts on every beat (release 0.35 s, beat 0.47 s), so concentric rings fill the frame most of the time. ⚠️ The user may prefer a longer release or a smaller `RING_K`.
    - Fluid: a glossy blue/teal liquid marble with olive pockets.
    - Lava smoke: soft glossy purple/pink/cyan blobs, steaming curls. A very fast highlight still leaves a short beaded streak in the smoke: `max` stamps it once per frame, and the broader specular reduced but did not remove it.
    - Ink: blue and pink ink clouds in black water, with clear water between them. The creases stretch into fine streaks, a slight "wood grain".
  - **Tests:** none new. The S4.2 check in `isf.test.ts` covers the own files (category, no `unsupported`, VJW_BIND keys) and every built-in ref; `doc.test.ts` round-trips the 4 new docs.

### S4.4 `[x]` Content batch 4: retro — VHS / CRT / strobe / flashes (target ≥8 incl. glitch)
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** the retro category; count check for §4.1.
- **Files:** `web/src/fx/isf/*.fs` (~5 from the sweep: VHS, CRT, RGB split, pixelate, posterize ⚠️ names), `web/src/fx/own/*.fs` (~3: `strobe.fs` (bool/event bound to beat), `flash.fs` colour flash with `VJW_BIND` on onset (the "drop" proxy, design E8 ⚠️), `scanlines.fs`), `web/src/scenes/builtin.ts` (+3 scenes).
- **Behaviour:** after this step the coder tallies `catalog` by category in the step note: total ≥ 30, each category ≥ 5 (natives count), and lists any shortfall for the lead.
- **Donor authorisation:** as S4.1.
- **Tests:** doc round-trips; add one assertion in `doc.test.ts` that every `BUILTIN` ref (except `native/*`, `toy/*`) matches a file stem under `fx/isf` or `fx/own` (`import.meta.glob` is Vite-only; in Vitest read the directories with `fs.readdirSync` ⚠️ `environment: 'node'` allows it).
- **Done-check:** gates green; `?bench` budget; contact sheet; counts met.
- **Depends on:** S4.3.
- **Changed during implementation:**
  - **Run ahead of CP3 and S4.1–S4.3** (lead's call, a parallel worktree with S3.2 and S4.2): retro needs only single-pass filters, which the CP1/CP2 pipeline renders. So every pick is single-pass with no `PERSISTENT`, and every scene has one layer.
  - **Copied from `donor/ISF-Files/ISF` (MIT), header kept, `// Source:` line added** (for S7.1): `VHS Glitch.fs` (David Lublin, after Staffan Widegarn Åhlvik), `v002-CRT-Displacement.fs` (vade), `Chromatic Aberration.fs` (VIDVOX), `Pixellate.fs` (VIDVOX), `Posterize.fs` (VIDVOX).
  - **Own files in `fx/own/`:** `strobe.fs` (bool `strobe` plus `color`), `flash.fs` (float `flash` screens `color`), `scanlines.fs` (`lines`, `darkness`; at least 3 px per line, so a small target shows no moiré). All have `CATEGORIES: ["Retro"]` and a `VJW_BIND` suggestion.
  - **`catalog.ts`:** the existing glob takes `['./isf/*.fs', './own/*.fs']`, and the id is the path without `./` and `.fs`. S4.2 adds the same, and the lead resolves the merge.
  - **The `doc.test.ts` assertion uses `import.meta.glob`, not `fs.readdirSync`.** Vitest runs Vite's glob transform. The app tsconfig has no Node types, so `node:fs` would not typecheck.
  - **Scenes (starred, appended):**
    - `builtin:vhs-tunnel`: tunnel → Chromatic Aberration (static) → VHS Glitch (`yScanlineAmount` ← bass) → flash (← onset).
    - `builtin:crt-spectrum`: spectrum → scanlines → v002-CRT-Displacement (`Amount` ← bass, so the glass bulges on a kick).
    - `builtin:pixel-strobe`: tunnel → Pixellate (`cell_size` ← bass) → Posterize (5 colours) → strobe.
    - The strobe binding is `beat` + `saw` with `max: 0.65`. A bool is on at ≥ 0.5, so the strobe fires for the first ≈ 20% of each beat when confidence is 0.95–1 (measured 0.94–0.999 on the kick loop). It never fires below confidence 0.77.
  - **Budget, Playwright on :5180:** installed Chrome, muted, viewport 1728×1117 @ DPR 2 (internal 1728×1118), a 24-beat seamless loop of `kicks128n.wav`. Files are `s44_*` in the scratchpad.
    - `?bench` per effect over the tunnel, GPU median / p95 ms: Chromatic Aberration 1.83 / 1.97, Pixellate 1.80 / 1.92, Posterize 2.06 / 2.29, VHS Glitch 2.03 / 2.25, CRT 1.97 / 2.17, flash 2.20 / 2.48, scanlines 2.06 / 2.43, strobe 1.70 / 2.04. The tunnel alone was 1.34 / 1.43.
    - glError 0 and 0 console errors on every item. No effect was dropped.
    - Scenes, GPU median / p95 ms: VHS tunnel 3.03 / 3.11, CRT spectrum 3.51 / 3.67, Pixel strobe 2.46 / 2.53. 0 errors, 1 drop over the run.
  - **The spectrum carries at most 2 filters.** Over the spectrum, a third filter took the scene from 3.5 to 6.1–6.2 ms p95 (two runs). Three filters over the tunnel stay at 2.4 ms. Cause unknown; this step does not touch the engine. So Chromatic Aberration moved from the CRT scene into the VHS one.
  - **Not mine, seen in the bench:** `native/particles` measured 5.18 / 6.36 ms with the kick loop playing. The lead's silent run had 4.67 p95.
  - **Measuring trap:** after a source edit, Vite serves the app's modules with `?t=`, so a bare `import('/src/app.ts')` from the page builds a second app. Restart the dev server before driving the page through module imports.
  - **Tally after this step (`parseIsf` over `fx/isf` + `fx/own`, plus the natives):**
    - Total 13: retro 7 (glitch, VHS Glitch, CRT, Posterize, strobe, flash, scanlines), geometry 2 (tunnel, particles), feedback 1 (Kaleidoscope), liquid 0, none 3 (spectrum, Chromatic Aberration, Pixellate: their ISF categories are "Color Effect/Distortion" and "Stylize").
    - **Shortfall for the lead:** total −17, feedback −4, geometry −3, liquid −5. These are S4.1–S4.3's batches, S4.2 running in parallel.

### S4.5 `[x]` Content batch 5: 12 gl-transitions + bench transition loop
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** ≥10 transitions in the random set.
- **Files:** `web/src/fx/transitions/*.glsl` (12 curated from the package, e.g. fade-class, wipes, zoom, glitch-class ⚠️ names from the tarball), `web/src/bench.ts` (adds: each transition between `builtin:tunnel` and `builtin:spectrum`, measured over the fade), `web/src/app.ts` only if the pick needs a change (it reads `transitions`, so likely none).
- **Donor authorisation:** `donor/gl-transitions-2.0.0/glsl3/<Name>.glsl` (MIT; the 2 BSD ones are allowed too with their headers); header kept + `// Source: https://github.com/gl-transitions/gl-transitions · MIT`. If the tarball has no `glsl3/` dir (G6), use the `transitions/<Name>.glsl` ES 1.00 sources: `wrapTransition` already works for bodies without `texture2D`; drop any that fail to compile.
- **Tests:** none new.
- **Done-check:** gates green; `?bench` transition items p95 ≤ 11 ms (two scenes + transition at 1728×1117, the pilot's worst fade) and 0 errors. **Lead commits** `cp4-effects` after a full autopilot cycle in Playwright with 0 console/GL errors.
- **Depends on:** S4.4.
- **Changed during implementation:**
  - **Copied files (for S7.1).** 12 files from `donor/gl-transitions-2.0.0/glsl3/` → `web/src/fx/transitions/`, all MIT (none of the BSD ones). Each keeps its header, with `// Source: https://github.com/gl-transitions/gl-transitions · MIT` added as line 1. Ids are `gl/<Name>`:
    - fades: `FadeColor`, `Overexposure`
    - wipes: `DirectionalWipe`, `CircleOpen`
    - dissolves: `PerlinDissolve`, `BurnThrough`
    - zoom: `DreamyZoom`, `CrossWarp`
    - glitch: `GlitchMemories`
    - swirl and kaleidoscope: `Swirl`, `Kaleidoscope`
    - pixel: `Hexagonalize`
  - With `own/crossfade`, the random set has 13 ids. Every param of these 12 parses (no ivec2, image or expression defaults). `app.ts` is unchanged.
  - **CrossZoom was picked first and dropped.** Its 41-tap zoom blur measured p95 10.1 ms for the pass alone. CrossWarp took its slot.
  - **How the bench times a transition.** The engine times scenes only, so the bench wraps `gl.drawArrays` with a timer query while the transition's program is current. That measures the pass alone, at the output size.
    - Each transition fades Tunnel ↔ Spectrum (2 s in silence). It is set every frame, over the app's random pick.
    - Rows go into `__bench.results` next to the effects, plus a line with the scenes' medians.
    - Budget used: the lead's p95 ≤ 5 ms for the pass alone. The plan's ≤ 11 ms total is that plus the two scenes.
  - **Run.** Lead's design size (1728×1117 @2), :5183, installed Chrome, only our Chrome on the GPU (process count logged every 3 s).
    - Every pass reads 3.2–3.5 ms median and 3.5–3.9 ms p95. BurnThrough reads 4.43 / 4.88.
    - `own/crossfade` reads 3.20 / 3.55. Scenes: Tunnel 1.35, Spectrum 2.43 ms. The worst fade is ≈ 8.7 ms in all.
    - glError 0, 0 console errors.
  - ⚠️ **The stage pass has a ~3 ms floor on ANGLE/Metal (M4), even for the crossfade.**
    - A scratch probe drew the same pass again into an offscreen target of the same size and read the same ~3.4 ms. An empty query reads 0.
    - So the transitions add ≤ 1.3 ms p95 over the pilot's fade. The cause was not investigated.
  - ⚠️ **GPU timer numbers inflate when another Playwright Chrome shares the GPU.** A first run, with another agent's Chrome running, read up to 11 ms p95 for trivial passes. Bench runs need a quiet GPU.

### S5.1 `[x]` Panel actions in `live.ts`, store fields, keys `E`/`Esc`, hold on open
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** the engine side of the panel (design E6), no React yet.
- **Files:** `web/src/gl/live.ts`, `web/src/store.ts`, `web/src/app.ts`.
- **Behaviour:** `live.ts` keeps an editable copy of the current scene's doc (built-ins are immutable: the first edit clones into an in-memory doc under the same id, marked dirty). `panel.setValue` writes `doc.values` and the live uniform in place (no snapshot change); `setBinding` recompiles that node's bindings; `addFx` (applies the def's `VJW_BIND` suggestions), `removeFx`, `addLayer` (≤4), `removeLayer` (≥1), `setBlend` mutate the doc, `rebuild()`, and `store.patch({ editRev: editRev + 1 })`. `pasteToy` lands in S5.3. The GPU hint `store.patch({ gpuMs })` and `nodeErrors` ride the existing 4×/s badge patch in `app.ts`. `store`: `panel`, `editRev`, `edited`, `gpuMs`, `nodeErrors`. `app.ts`: `E` toggles `panel` (open → `director.setHold(true)` remembering the previous hold; close → restore), `Esc` closes; the key filter also ignores `HTMLTextAreaElement`; `edited` = the current scene id (the incoming one during a fade).
- **Tests:** none (GL/DOM).
- **Done-check:** gates green; `E` toggles `store.panel` and the hold (visible as the Lock badge), `Esc` restores it.
- **Depends on:** S4.5.
- **Changed during implementation:**
  - **The pure edits live in a new `web/src/edit.ts`** (+ `edit.test.ts`, 8 tests; all 13 hand-made mutants killed). `live.ts` reads GL at import, so Vitest can't load it. It holds `NodePath`, clone-on-first-edit, `dirty: Set<SceneId>` (S6 clears it on save), the 7 ops and `newNode(ref, bind)` (VJW_BIND copied). The ops take the scene's current doc. A refused `addLayer` (4 layers) or `removeLayer` (1 layer) neither clones nor marks dirty, and the panel then skips the rebuild and the `editRev` bump.
  - **`docs` moved to `edit.ts`.** It holds the edited copies as well as ?bench's test docs. `live.ts` re-exports `docs` and `NodePath`, so the contract paths are unchanged.
  - **`create(id)` reads its doc through `find(id)`; `Live.doc` is a getter.** After a scene's first edit the same instance builds from the copy, with no rebuild for the switch.
  - **`Live` gains two in-place hooks, `set(p, input, v)` and `rebind()`.** `set` writes the uniform, or the layer's live values; arrays are copied, because a component binding writes into them. `rebind` recompiles **every** binding of the scene from the doc, not only that node's. That is less code with the same result: each binding still bound keeps its smoothing state, and an input no longer bound gets its doc value back (the browser check shows the frame comes back bit for bit).
  - **S3.3's question (layer opacity/speed copied at build):** `res` joined opacity/speed in the layer's live `v`, so `setValue({ node: 'layer' }, 'opacity' | 'speed' | 'res', v)` writes the doc and `v` in place. The res < 1 target is now also created lazily in `render()` the first time res drops below 1. It is kept until dispose. `blend` is read from the built layer, and `setBlend` rebuilds.
  - **`setBinding` does not bump `editRev`.** S5.2's binding sliders call it at input rate. Structural ops bump it once each.
  - **`fail()` lists a message once,** because `rebind()` meets a bad binding again on each call.
  - **`pasteToy` is not on `panel` yet** (S5.3 adds it).
  - **A new layer is normal / 1 / 1 / 1,** like S5.3's pasted layer. `addLayer` applies the generator's VJW_BIND suggestions too, through the same helper as `addFx`.
  - **Events (`ponytail:`):** an event's `true` from `setValue` is stored in the doc too, so it fires once more on each build. No current effect has an event input.
  - **Not fixed (out of scope): a structural edit restarts the scene.** Layer clocks go back to 0, and natives and persistent buffers are recreated, so adding or removing an fx or layer, or changing blend, makes a visible jump. Keep each layer's `t` across `rebuild()` if that bothers.
  - **Heads-up for S5.2:** the key filter ignores focused `<input>`s, so `Esc` doesn't close the panel while a slider has focus. Blur on pointer-up, or accept it.
  - **Store:** `gpuMs` is rounded to 0.1 ms, like the BPM, and patched on every 4×/s tick, open or not. `nodeErrors` is a new array only when its joined text changes. `edited` and `sceneName` are patched together whenever either one changes.
  - **Chrome check.** Playwright on :5188, installed Chrome, `--mute-audio`, 1200×800 at 60F, in silence. Scripts and logs are `s51_*` in the scratchpad.
    - **Keys:** `E` opens with hold and Lock; `Esc` restores hold off, and hold on when it was on before; `E E` closes; a focused `<textarea>` keeps its `E`.
    - **Tunnel, layer speed 0 (still):**
      - `glow` 3 raises the mean brightness 26.9 → 73.4; back at 1, the frame matches the original hash.
      - An lfo square binding on `glow` gives 2 alternating frames; unbinding restores the original frame exactly.
      - `res` 0.5 changes the frame; back at 1 it matches exactly.
      - `opacity` 0.5 halves the mean (26.9 → 13.7); back at 1 it matches exactly.
      - None of this changes `editRev`. The built-in stays untouched while the copy is marked dirty.
    - **Structural edits:**
      - Each one bumps `editRev`.
      - Kaleidoscope added changes the frame; removing it gives the reference frame back exactly.
      - `own/strobe` gets its VJW_BIND copied.
      - An unknown ref shows in `nodeErrors` within 0.4 s and clears after `removeFx`.
      - `gpuMs` reads 0.9 ms.
      - Particles at `add` show over the tunnel.
      - Layers stop at 4 (a 5th is refused, no bump) and at 1 (the last is refused); back at 1 the frame is the reference frame.
    - **Leaks:** after 70 rebuilds (10 cycles of add fx ×2, add layer, blend, remove ×3, incl. Long Exposure and Spectrum), the live GL objects are identical: 8 tex / 4 FB / 1 buf / 16 prog / 32 sh / 4 queries. glError 0 throughout.
    - **Walk:** all 15 starred scenes under `→`, each with 0 errors and glError 0.
    - **Console:** 1 error, the deliberate `unknown ref isf/s51-missing`; nothing else.
  - **Gates:** lint and tsc clean, 129 tests (+8), build OK.

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

### S6.1 `[x]` `library.ts`: IndexedDB, stars, playlist, export/import; `live` reads the library
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** persistence (design E4), native APIs only.
- **Files:** `web/src/library.ts`, `web/src/gl/live.ts`, `web/src/app.ts`.
- **Behaviour:** IndexedDB `vjw`, store `scenes` keyPath `id`, ~30 lines (`open` with `onupgradeneeded`, `getAll`, `put`, `delete` wrapped in promises). `load()` reads all user docs through `parseScene` (a corrupt record is skipped with `console.error`). `get(id)` = user doc or built-in; `all()`; `put(doc)` (calls `navigator.storage.persist()` once, remembered in `localStorage['vjw.persisted']`); `del`; `setStar`: built-in overrides in `localStorage['vjw.stars']` (JSON `{ id: boolean }`), user docs via `put`; `playlist()` = starred built-ins in `BUILTIN` order, then starred user docs by creation time (add `created?: number` to `SceneDoc` v1 now, before any user data exists ⚠️ assumption, needs confirmation; `parseScene` accepts it optional). `exportLibrary()`: `{ v: 1, scenes: user docs }` → `<a download="veejay-library-<local date>.json">` (the recorder's pattern). `importFile(f)`: `parseLibrary(JSON.parse(text))`, `put` each (overwrite by id), returns an error string or null. `onChange` notifies after any mutation. `live(id)` uses `library.get`; `panel.save()` (put the edited doc; built-ins can't be saved in place → `saveAs`), `saveAs(name)` (new uuid, star false), `toggleStar()`. `app.ts`: the director starts with the built-in playlist, then `library.load().then(() => director.setPlaylist(library.playlist()))`, and `onChange` → `setPlaylist` again.
- **Tests:** none (IndexedDB); the parse layer is tested in S1.3. Add `created` to `doc.test.ts` (optional field survives).
- **Done-check:** gates green; a DevTools session shows the `vjw` DB after a save.
- **Depends on:** S5.3.
- **Changed during implementation:**
  - **Pulled ahead of S5.2/S5.3 by the lead** (no shared files with S5.2). S5.3 adds `pasteToy` to the same `panel` object in `live.ts`: a merge touch point.
  - **Tests after all (lead's brief).** The browser side is three seams: `createLibrary(db: Db, kv, download)`, and `library = createLibrary(idb(), localStorage, download)`. `library.test.ts` has 12 tests over an in-memory "browser" (rows + localStorage + downloads, `open()` = a page load): export → import round-trip, versions and bad JSON, star → playlist with the empty-star fallback, id collisions, corrupt rows, persist, onChange, the local-date file name. Of 25 hand mutations of `library.ts`, 24 are killed. The survivor (`get` looks in the built-ins first) is equivalent: a user id is never a built-in's. `doc.test.ts` gains 1 test for `created`.
  - **`put` checks what it stores** (`own()` = `parseScene` + a `builtin:` id refused), so whatever is stored loads back. `saveAs('')` is refused with `name: …` instead of being skipped at the next load. `panel.save()` on a built-in resolves to `id: builtin:… is a built-in, save it as a new scene`.
  - **Import collisions:** an existing user id is overwritten and keeps its `created` (its playlist place) when the file has none; a repeated id: the last wins; a `builtin:` id comes in as a new scene (fresh uuid) instead of shadowing the built-in. Validation is all-or-nothing (`parseLibrary` before any write).
  - **`get(id)` of a built-in is the library's shallow copy with the user's star** (the contract has no `starred(id)`), so `get(id).star` is the truth for every scene. `setStar` also stars the panel's unsaved copy in `edit.docs`, so `live(id).doc.star` and a later `save()` agree.
  - **`persist()` is asked on each save until granted,** then remembered in `vjw.persisted` (the plan: once). A first denial (Chrome decides by engagement, without a prompt) doesn't stick forever.
  - **IndexedDB:** a write resolves on the transaction's `complete` (durable), not on the request's success. A connection closed under us (DevTools' delete: `versionchange`/`close`) is let go and reopened by the next call, so the demo's "delete the DB in DevTools, Import" works without a reload.
  - **`app.ts`:** the director starts from `library.playlist()` (the built-ins with the user's stars, read synchronously from localStorage). One `onChange` handler sets the playlist; `load()` notifies too. Compile-all at Start waits for the load, so starred user scenes are warmed. A failed load logs `library …`, and the built-ins play on.
  - **`panel`:** `save()` and `saveAs(name)` resolve to an error message or null (as `importFile`); `save()` clears `edit.dirty`. `toggleStar()` flips the edited scene's star.
  - **Not done (heads-up for S6.2):**
    - After Save as, the panel keeps editing the scene on screen; the original's copy stays dirty. "My tunnel" plays when the autopilot reaches it once starred (S6.2's list stars it). Showing it at once needs a director cut-to-id, which is outside this step's files.
    - An import over the scene on screen (or over one with an unsaved copy) shows at its next build. The panel reads the new doc meanwhile.
    - `library.del()` has no caller. Deleting the scene on screen would leave `live(id).doc` undefined, and app.ts reads `.name` every frame. Keep the last doc in `create()` when a delete button lands.
    - `download()` repeats the recorder's 5 lines; a shared helper needs `recorder.ts`.
  - **Chrome check.** Playwright on :5190, installed Chrome, `--mute-audio`, in silence; `s61_*` in the scratchpad. 18/18 checks pass:
    - Save on the tunnel is refused; Save as "My tunnel" (glow 3, twist bound to bass) is stored unstarred, and the `vjw` DB exists.
    - The star makes it the 28th, last playlist entry. After a reload it is still there, starred, with the value and the binding intact.
    - `←` from the first scene fades to it ("My tunnel", 0 node errors). Save on it stores glow 2.
    - Unstar takes it out of the playlist while it stays on screen; star puts it back.
    - Export downloads `veejay-library-2026-10-28.json` (1 scene). CDP `IndexedDB.deleteDatabase` (as DevTools) removes the DB. Import without a reload restores it and recreates the DB, and a reload shows it restored.
    - A second round with a reload between the delete and the import: the library is empty (27 built-ins), then it is restored after the import.
    - glError 0. Console errors: 0.
  - **Gates:** lint and tsc clean, 142 tests (+13), build OK.

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
