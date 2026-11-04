# Plan — MilkDrop (epic `milkdrop`), Variant A

## TL;DR
- Butterchurn `3.0.0-beta.5` renders curated presets in its own OffscreenCanvas WebGL2 context; each preset is a catalog native `milk/<slug>` inside a one-layer built-in `builtin:milk-<slug>`, so stars, playlist, director, gl-transitions, prepare-ahead, warm-at-Start, `?bench`, panel and REC work unchanged (design § Variant A).
- **CP1 is the `?bench&milk` probe and nothing else** (design C5): K1 copy, K2 per-preset GPU, K3 load hitch, K4 JS headroom. **Hard stop:** any K fails → the lead takes the K table's "Then" to the user; no CP2 step is dispatched.
- CP2 integrates (`presets.ts` pure, `native.ts`, one catalog line, `warm?()`, `BUILTIN = spread(...)`) with 3 provisional presets; CP3 curates ~25 by rule from the probe rows (coder picks, lead reviews, user unstars later), credits them in `THIRD_PARTY.md`; the lead runs a 60 s autopilot check on the M4.
- 7 steps, one coder each, sequential, ~45 min. Pure logic (`presets.ts`, the governor's `jsMs`) in Vitest; GL/Butterchurn through `?bench` plus one browser check per step.

## Freshness
- Written 2026-11-03 at master `eae9dec` from `agents/system-designer/design_milkdrop.md` (2026-11-03): TL;DR, Constraints, § Common C1–C5, § Variant A, § Research gaps; spec `thoughts/spec_veejay_wizard.md` §4 L78, §6 L97–101, §7 L103–110.
- Code pinned: `gl/scene.ts:5-6`, `gl/live.ts:108-127, 193-202, 400-441`, `fx/catalog.ts:12-22`, `scenes/builtin.ts:5`, `bench.ts:1-50, 74-77, 113-145, 224-226`, `library.ts:88-92`, `quality.ts:4-9, 82`, `app.ts:58, 227-246, 315-338`, `engine.ts:15-17, 61-98`, `doc.test.ts:18-21`, `fx/isf.test.ts:124-125`, `library.test.ts:63`, `THIRD_PARTY.md`, `scripts/licenses.mjs`. Stale once `NativeDef`, `live.ts` `warm()`/`run()`, `bench.ts` `run()` or the Butterchurn pin changes.

## Chosen variant
- `design_milkdrop.md` § Variant A + § Common C1–C5. User pick 2026-11-03 (STATE HEAD "USER GATE passed"): Q2 **no** detector hook; Q3 **~25** presets we pick, all starred; Q4 autopilot mix `spread()` evenly.
- Later (not planned): the detector hook, ~15 lines in `native.ts` (design C3).

## Checkpoints

### CP1 — the probe (K1–K4 on the M4)
**Frozen contract:**
```ts
// web/src/milkdrop/butterchurn.d.ts — only what we call (3.0.0-beta.5); the installed dist is the source of truth (S1.1 checks names)
declare module 'butterchurn' {
  interface Levels { timeByteArray: Uint8Array; timeByteArrayL: Uint8Array; timeByteArrayR: Uint8Array }
  interface Size { pixelRatio: number; textureRatio: number; meshWidth?: number; meshHeight?: number }
  export interface Visualizer {
    loadPreset(preset: object, blendTime: number): Promise<void>
    render(opts: { audioLevels: Levels; elapsedTime: number }): void // elapsedTime unit ⚠️ S1.1 confirms in the dist (design C3: it is dt)
    setRendererSize(width: number, height: number, opts: Size): void
    readonly internalCanvas: OffscreenCanvas // undocumented (G2): boot check
  }
  const butterchurn: { createVisualizer(ctx: AudioContext, canvas: HTMLCanvasElement, opts: { width: number; height: number } & Size): Visualizer }
  export default butterchurn
}
// web/src/quality.ts: Governor gains `readonly jsMs: number` (the median of the last 120 JS times, the one :82 tests)
// window.__bench.milk = { boot, copy: Row[], presets: Row[], run, verdict: Record<'K1'|'K2'|'K3'|'K4', 'pass' | 'fail'> }
```
**Demo:** `cd web && npm run dev` → `http://localhost:5173/?bench&milk`, Start. **No audio needed:** silence (bytes 128) feeds the presets and GPU/JS/load timings do not depend on it, so the stuck CoreAudio output is irrelevant here (the lead runs it headed with `--mute-audio`). The `<pre>` prints `boot:`, the copy table, one line per candidate preset, the 60 s run, then `K1..K4: pass|fail (numbers)`; `console.table` and `window.__bench.milk` carry the rows. Hard stop as in the TL;DR.

### CP2 — integration: MilkDrop scenes in the show
**Frozen contract** (design § Variant A Contracts):
```ts
// gl/scene.ts
export interface NativeDef extends EffectDef { create(gl: WebGL2RenderingContext): Native; warm?(): Promise<void> }
// milkdrop/presets.ts (pure, no GL import). Files: src/milkdrop/presets/<slug>.json = PresetFile
export interface PresetFile { name: string; author: string; url: string; license: string; preset: object }
export const PRESETS: readonly (PresetFile & { slug: string })[]
export const MILK_SCENES: readonly SceneDoc[] // 'builtin:milk-<slug>', name, star: true, one layer { gen: { ref: 'milk/<slug>' }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1 }
export function spread<T>(own: readonly T[], milk: readonly T[]): T[] // own[0] stays first; milk evenly spaced; both orders kept
// milkdrop/native.ts (GL)
export const milkdrop: readonly NativeDef[] // 'milk/<slug>', kind 'generator', category 'feedback', credit = author, inputs []
```
**Demo:** `npm run dev`, Start, autopilot on: within a few switches a MilkDrop scene fades in through one of our gl-transitions (its name in the badge), a kick still cuts/flashes over it; panel (E) lists `builtin:milk-*` starred; REC → the file plays with MilkDrop frames and sound.

### CP3 — curation and credits
**Frozen contract:** the preset set = the files under `web/src/milkdrop/presets/` (20–30 `PresetFile`s); `THIRD_PARTY.md` § MilkDrop presets has one row per file. Adding a preset = one file + one row.
**Demo:** `npm run dev`, panel lists ~25 `builtin:milk-*`, all starred; the lead's 60 s autopilot run at 60A on the M4 shows `drops` +0 per switch and `jsMs` < 9 ms with MilkDrop on screen.

## Steps
One coder per step, own worktree, ~45 min, sequential. Every brief mandates the `ponytail` skill (full).

### S1.1 `[x]` Install, types, boot checks (G1–G3, G9, G10)
Invoke the `ponytail` skill (full) before writing code.
**Goal:** Butterchurn runs in the dev server; the internals we rely on are asserted; licenses recorded.
**Files:** `web/package.json` (+ lock), `web/src/milkdrop/butterchurn.d.ts`, `web/src/bench.ts`, `web/THIRD_PARTY.md` (pasted rows only).
**Behaviour:**
1. `cd web && npm i -E butterchurn@3.0.0-beta.5 && npm i -DE butterchurn-presets@3.0.0-beta.4`. Handback, facts from the installed files only: butterchurn's runtime dependency tree with licenses (`npm ls butterchurn --all`, each dep's `package.json` `license`) = G1; how `butterchurn-presets` 3.0.0-beta.4 exposes presets (export name, file layout) = G9; the unit of `elapsedTime` in the dist's `render()` = G10.
2. `butterchurn.d.ts` per the CP1 contract, names corrected to the dist where they differ; no members beyond those.
3. `bench.ts`: in `run()` right after the Start wait and the underruns line (:76-77), `if (location.search.includes('milk')) return milk()`. `milk()` (new section above :224): a detached `document.createElement('canvas')` on which `getContext('bitmaprenderer')` was called; `createVisualizer(ctx, canvas, { width, height, pixelRatio: 1, textureRatio: 1 })` at `temps[0]`'s size, timed. Print `boot: internalCanvas yes|no, 2d null yes|no, created <ms>` from `internalCanvas instanceof OffscreenCanvas` and `canvas.getContext('2d') === null` (G2). Then every shader-bearing candidate in the package (non-empty `warp` or `comp`; research counts 395): `await loadPreset(p, 0)` + one `render({ audioLevels: silence, elapsedTime })` (`silence` = `Uint8Array(1024)` filled with 128) in try/catch → `load errors n/395` + names (G3). Rows → `window.__bench.milk.boot`. `ctx` from `./audio/input`.
4. `THIRD_PARTY.md`: `node scripts/licenses.mjs` rows for the two packages into § Runtime / § Toolchain, plus one § Runtime line naming butterchurn's transitive runtime deps and licenses (G1).
**Vitest:** none (GL/Butterchurn; a `.d.ts` has no logic). **Done-check:** gates green; `?bench&milk` prints `boot:` with both `yes` and the load-error count (a non-zero list is a result, not a failure). **Deps:** `butterchurn` 3.0.0-beta.5 MIT (runtime); `butterchurn-presets` 3.0.0-beta.4 MIT packaging, preset content unknown (dev). **Donor:** none. **Dependencies:** none.
**Changed during implementation:** (1) The installed package has **410** candidates by this step's rule (372 warp+comp, 23 warp-only, 15 comp-only); research's 395 counts a non-empty `warp` alone. The denominator is computed. (2) The dist never checks a shader's compile/link status, so try/catch only sees EEL/WASM errors. A second line `gl errors m/N` reads Butterchurn's GL error flag after the render (`internalCanvas.getContext('webgl2')` returns its own context; drained before each preset). M4 run: `load errors 1/410`, `gl errors 22/410` (0x502, "program not linked"). `boot` = `{ internalCanvas, nullCtx2d, createdMs, candidates, loadErrors, glErrors }`. (3) Candidates come from a lazy `import.meta.glob` over `presets/converted/*.json` with `exhaustive: true` (Vite skips `node_modules` otherwise), minus the two `#` file names (a fragment in an import specifier; neither has a shader). `dist/all.js` is lossy (472 keys, 33 of the 504 files missing). `butterchurn` is a dynamic import inside `milk()`, so plain `?bench` never loads it. `npm run build` now emits ~502 small preset chunks, fetched only under `?bench&milk`.

### S1.2 `[x]` The measurements K1–K4 and the verdict
Invoke the `ponytail` skill (full) before writing code.
**Goal:** the numbers behind the K table, printed as `K1..K4: pass|fail`.
**Files:** `web/src/bench.ts` (`milk()`), `web/src/quality.ts` + `web/src/quality.test.ts` (`jsMs`), `web/src/app.ts:58` (`export const governor`, one word, as `director` is exported).
**Behaviour** (all at `temps[0]`'s size at probe start, printed once; the probe's visualizers never resize; silence bytes as S1.1; reuse `q()`, `frames()`, `print`):
1. `quality.ts`: `readonly jsMs` on `Governor` = `median(js)` (the :82 expression), 0 before N samples. Test: N frames at 4 ms then N at 12 ms → `jsMs` is 12.
2. Copy (K1), 300 frames per path, a timer query on our `gl` plus `performance.now()` around the whole copy: (a) `texSubImage2D(internalCanvas)` into one RGBA8 texture of ours + a Y-flip draw (`fullscreenProgram`) into `temps[1]`; (b) `transferToImageBitmap()` → `texSubImage2D(bitmap)` + flip draw, `bitmap.close()`; (c) the public path: a second visualizer on a plain canvas (2D context, Butterchurn's own `drawImage`) → `texSubImage2D(canvas)` + flip draw; (d) ⚠️ assumption, cheap: `UNPACK_FLIP_Y_WEBGL` + `texSubImage2D(internalCanvas)` straight into `temps[1].attachments[0]`, no draw (G11). Row `{ path, gpuP95, mainP95 }`. K1 fails when every path is > 1 ms GPU p95 or > 0.5 ms main-thread p95.
3. Per preset (K2, K3), the S1.1 candidates, ~1 s each on visualizer A: `cold` = `performance.now()` around `await loadPreset(p, 0)` + the first `render()`, with the `store.getSnapshot().drops` delta; then 45 frames of `render()` + copy (a): `render()` main-thread median, Butterchurn GPU p95 over the last 30 (an `EXT_disjoint_timer_query_webgl2` query on `internalCanvas.getContext('webgl2')` around `render()`), copy p95. After the pass, `warm` = the same load on visualizer B (created after the pass, creation ms printed) for every preset that loaded. Row `{ name, loadErr, coldMs, coldDrops, warmMs, warmDrops, renderMs, gpuP95, copyP95, k2: gpuP95 + copyP95 <= 5, k3: warmMs <= 16 }`. K2 fails per the table (fewer than 20 pass at full size → repeat at 0.75 size with `meshWidth: 32, meshHeight: 24` before stopping); K3 fails on warm median > 8 ms or p90 > 16 ms.
4. 60 s run (K3, K4): `director.setPlaylist` of the starred built-ins (`BUILTIN.filter((d) => d.star)`), `setHold(false)`; every frame `render()` + copy (a) of the current preset on A. When `store.getSnapshot().sceneName` changes (app.ts:337 sets it as a fade starts), wait out the fade (2 s in silence, :20-21), load the next k2-passing preset on B (emulates prepare-ahead, app.ts:321), swap A/B. Print per switch: the `drops` delta (one late frame at a load = K3 fail). At the end: `governor.jsMs` (the app's JS median), the probe's own per-frame ms median, and their sum = "JS with MilkDrop". K4 fails at sum ≥ 9 ms (repeat once with mesh 32×24; still ≥ 9 → Variant C).
5. `window.__bench.milk = { boot, copy, presets, run, verdict }`; `console.table(presets)`; the four verdict lines last.
**Vitest:** `quality.test.ts` (the `jsMs` test). **Done-check:** gates green; the lead runs `?bench&milk` headed with `--mute-audio` at 60A on the M4 (no file needed), reads `window.__bench.milk`, then the CP1 hard stop. **Dependencies:** S1.1. **New deps:** none.
**Changed during implementation:**
1. S1.1's load pass is folded into the K2 pass. One loop over the candidates finds the load and GL errors and times `cold` on A's first load of each preset. A separate S1.1 pass first would have made every `cold` a second load, served from Chrome's program cache. Errored presets get `loadErr` (`GL error 0x502` or the exception) and skip their frames and the warm load. `boot` keeps its fields, and its `load errors` / `gl errors` lines now print after the per-preset lines.
2. Late frames come from `governor.drops`, read one frame after each load. It is the same counter the store copies 4×/s, without the lag.
3. The repeats are URL params, not automatic re-runs. `&res=0.75&mesh` repeats K2 and `&mesh` (32×24) repeats K4, and a failing verdict line names its re-run. `&n=N` limits the probe to the first N candidates.
4. Copy rows also carry `glError`, and a path with a GL error cannot pass K1.
5. Path (c)'s main-thread ms is Butterchurn's own `drawImage` (timed by wrapping its 2D context's `drawImage`) plus the upload and flip. Its GPU side runs on the 2D canvas's context, so no timer of ours sees it.
6. The app holds its scene (`setHold(true)`) from the probe's start until the 60 s run.
7. `cold` and `warm` are wall ms. `loadPreset` awaits a WASM compile, so a frame may run inside the window.
**Design ruling (2026-11-04, design_milkdrop.md § Probe ruling):** K1/K2 as built time a cross-context wait. K1 → 0 late frames over the 60 s run at full size, 1.00× at the end, copy main-thread p95 ≤ 0.5 ms: pass (0 of 3600; 0.10 ms). K2 → Butterchurn's own `gpuP95` ≤ 5 ms, ≥ 20: pass (264/387). K3, K4 pass. **CP1: go.** The printed K1/K2 lines and the `k2` flag are void.

### S2.1 `[x]` `presets.ts` (pure), its test, the copy script, 3 provisional presets
Invoke the `ponytail` skill (full) before writing code.
**Goal:** preset files become `PRESETS`, `MILK_SCENES` and the `spread()` order, with no GL import.
**Files:** `web/scripts/milk-presets.mjs`, `web/src/milkdrop/presets.ts`, `web/src/milkdrop/presets.test.ts`; generated: `web/src/milkdrop/presets/<slug>.json` × 3 (the lead names 3 presets from the S1.2 rows that pass S3.1's pick rule, two of them with the highest `gpuP95`, for the CP2 worst-case run).
**Behaviour:**
1. `milk-presets.mjs <preset name>…`: reads the package per G9, writes `src/milkdrop/presets/<slug>.json` = `{ name, author, url, license, preset }`: `slug` = the name lower-cased, runs of non-`[a-z0-9]` → `-`, trimmed; `author` = the name's prefix before the first ` - ` (MilkDrop's "author - title" convention; a `+` list stays whole; no ` - ` → the whole name); `url` = `repository.url` from `node_modules/butterchurn-presets/package.json`; `license` = `"content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg)"` (design C1). Prints `| slug | name | author | license |` rows for `THIRD_PARTY.md`, as `scripts/shaders.mjs` does.
2. `presets.ts`: `import.meta.glob('./presets/*.json', { eager: true, import: 'default' })` (the `catalog.ts:12` pattern) → a small guard (five fields, strings + object; a bad file is `console.error`ed and skipped as `catalog.ts:17-21`) → `PRESETS` sorted by slug; `MILK_SCENES` per the CP2 contract (`name` = the file's `name`); `spread(own, milk)`: rank `own[i]` at `i / own.length`, `milk[j]` at `(j + 1) / (milk.length + 1)`, stable merge by rank, ties own first.
**Vitest** (`presets.test.ts`): every file has non-empty `name/author/url/license` and a `preset` with a non-empty `warp` or `comp`; slugs unique and `/^[a-z0-9-]+$/`; every `MILK_SCENES` doc round-trips `parseScene(JSON.parse(JSON.stringify(d)))` (as `doc.test.ts:15`) with id `builtin:milk-<slug>`, `star` true, one layer, gen `milk/<slug>`, `fx: []`; `spread`: `spread(own, [])` is `own`, `spread([], milk)` is `milk`, length = sum, `[0]` is `own[0]`, each input is a subsequence of the output, `spread([1, 2, 3, 4], ['m'])` is `[1, 2, 3, 'm', 4]`, 27 own + 25 milk never has three in a row from one list; `PRESETS.length > 0`.
**Done-check:** gates green; `node scripts/milk-presets.mjs "<name>"` reproduces a file byte for byte. **Dependencies:** S1.2 (CP1 passed). **New deps:** none.
**Changed during implementation:** (1) `node_modules/butterchurn-presets/package.json` (3.0.0-beta.4) has no `repository` field, only `homepage: https://butterchurnviz.com`. So `url` is the constant `https://github.com/jberg/butterchurn-presets`, the repo `research_donor_milkdrop.md` §5 cites, and the script no longer reads package.json. (2) The test also checks that `PRESETS.length` equals the number of `presets/*.json` files, so a file the guard skips fails "every file" instead of dropping out silently. Files are written with `JSON.stringify(…, null, 2)` plus a newline, and the `preset` deep-equals its source.

### S2.2 `[x]` `native.ts`: pool, audio bytes, copy, resize; the catalog line
Invoke the `ponytail` skill (full) before writing code.
**Goal:** `milk/<slug>` natives render a preset into the bound target every frame.
**Files:** `web/src/milkdrop/native.ts`, `web/src/fx/catalog.ts:14` (`...milkdrop` in the Map's seed + import).
**Behaviour** (design § Variant A Pool and lifecycle, C2–C4):
1. Pool: `free: Visualizer[]`; `make()` = the S1.1 bitmaprenderer canvas, `createVisualizer(ctx, canvas, { width: 16, height: 16, pixelRatio: 1, textureRatio: 1 })`, `internalCanvas.addEventListener('webglcontextlost', () => location.reload())` (engine.ts:17); `acquire()` = `free.pop() ?? make()`. `// ponytail: uncapped pool, one Chromium context each (16 max); cap if ←/→ spam ever shows`.
2. `create()`: `v = acquire()`, `ready = false`, `loading = v.loadPreset(p.preset, 0).then(() => { v.render(...); ready = true })`. `draw(f)`: not ready → clear the bound FB to black; else if `(f.width, f.height)` differ from the visualizer's size → `setRendererSize(f.width, f.height, { pixelRatio: 1, textureRatio: 1 })`; `analyser.getByteTimeDomainData(bytes)` (one module-level `Uint8Array(analyser.fftSize)` = 1024); `v.render({ audioLevels: { timeByteArray: bytes, timeByteArrayL: bytes, timeByteArrayR: bytes }, elapsedTime: f.dt })` (unit per G10); then the copy = path (a) (design § Probe ruling): one shared RGBA8 texture, `texImage2D(null)` on size change else `texSubImage2D(internalCanvas)`, then the flip draw into the still-bound target (`run()` binds it, live.ts:196; Butterchurn touches none of our GL state). `dispose()`: `loading.finally(() => free.push(v))`.
3. `milkdrop = PRESETS.map(...)` per the CP2 contract. Order S2.2 → S2.3 → S2.4 is mandatory: until `warm?()` lands, `live.ts` `warm()` (:435-439) would `create()` one native per frame without waiting for `dispose()`'s load, one context per preset; nothing puts `milk/*` in the playlist before S2.4.
**Vitest:** none (GL + Butterchurn; `native.ts` imports `gl` at module load). **Done-check:** gates green; plain `?bench` (its per-effect loop :113-145 builds a `bench:milk/<slug>` doc for every catalog generator) shows the 3 natives with `glError 0`, `console errors 0`, and upright (not Y-flipped) pictures (their GPU column includes the cross-context wait: information only). **Dependencies:** S2.1. **New deps:** none.
**Changed during implementation:** (1) The copy is one function, `copy(src, w, h)`, exported by `native.ts`. bench.ts's K1 `tex`, `flip` and upload moved there with the flip shader unchanged. Bench's `upload` now binds `temps[1]` and calls it, imported as `milkCopy` because `milk()` already has a `copy` results array. The shared texture follows the source's size. On a change it calls `texImage2D(src)`, which allocates and uploads in one call, instead of `texImage2D(null)`, so a resize frame is never empty. (2) `dispose()` returns the visualizer at once when its load has settled, otherwise after the load (`loading.then`). The literal `loading.finally(() => free.push(v))` always pushes a microtask later. By then `prepare()`/`rebuild()`'s synchronous build (live.ts:309-310, 412-419) has already popped an empty pool, which gives a 3rd visualizer and context per live milk native instead of the design's pool of 2. (3) A failed `loadPreset` is logged with `console.error` (`milk/<slug>: …`) and the native stays black, with no unhandled rejection; it still counts as settled. The throwaway render uses `elapsedTime: 1 / 60`.

### S2.3 `[x]` `warm?()` at Start
Invoke the `ponytail` skill (full) before writing code.
**Goal:** Start loads every starred preset once, one at a time, behind the existing "compiling n/N" line; the pool holds 2. Both pool visualizers exist and each is past its first load when Start ends (a fresh visualizer's first load blocks ≤ 26 ms = a late frame; design § Probe ruling).
**Files:** `web/src/gl/scene.ts:6` (`warm?(): Promise<void>`), `web/src/gl/live.ts:435-439` (`if (d.warm) await d.warm(); else d.create(gl).dispose?.()`, comment updated), `web/src/milkdrop/native.ts` (`warm` on each def).
**Behaviour:** `warm()`: `make()` until 2 exist; `v = acquire()`; `await v.loadPreset(p.preset, 0)`; one `render()` with silence; `free.push(v)`. If S1.2 showed warm ≈ cold (no cache gain, design R1), `warm()` only makes the 2 visualizers and skips the loads; the lead says which in the brief.
**Vitest:** none (GL). **Done-check:** gates green; the browser check is S2.4's demo: at Start "compiling n/N" counts the milk scenes, and Chrome Task Manager's GPU memory grows by two contexts' worth, not one per preset. **Dependencies:** S2.2. **New deps:** none.
**Changed during implementation:**
1. The natives loop in `live.ts` `warm()` is now at :469-473 (polish §5 moved it).
2. Until the pool's 2 exist, `warm()` makes one visualizer, loads its preset into it, then makes and loads the second. The plan's order was `make()` ×2, then one `acquire()` and load.
   - `acquire()` pops the pool, so the plan's order loads every preset into the same visualizer and leaves the other one fresh. The lead's brief requires each to be past its first load.
   - Interleaving also keeps the two `createVisualizer` blocks in separate tasks.
   - A module `made` count (in `make()`, live and pooled) is the "until 2 exist" test, once per page. Later calls load into one pooled visualizer, so N milk presets cost N + 1 loads at Start.
3. `create()`'s load, throwaway render and error log moved into a shared `load(v, p)` that both `create()` and `warm()` use. Behaviour is unchanged.
4. The "silent" render uses the shared `audioLevels`, which stay silence until the first milk draw (none has drawn at Start).

Browser (M4, headed, autoplay, so Start = page load): 2 starred user scenes with one `milk/*` layer each were stored via `library.put`, then the page reloaded.
- At Start: `compiling 1/50 … 50/50`, the 2 milk natives ticking last; `createVisualizer` 2; `loadPreset` 3.
- Over Start + 31 s: `createVisualizer` stays 2. Both milk scenes came on screen (an autopilot fade, then →), each prepared ahead, with 0 black draws.

### S2.4 `[x]` `BUILTIN = spread(own, MILK_SCENES)`
Invoke the `ponytail` skill (full) before writing code.
**Goal:** MilkDrop scenes join the playlist, spread evenly (Q4), all starred (Q3).
**Files:** `web/src/scenes/builtin.ts:5` (`const OWN = [...]`, `export const BUILTIN = spread(OWN, MILK_SCENES)`), `web/src/doc.test.ts:21` and `web/src/fx/isf.test.ts:125` (regex `/^(native|toy|milk)\//`).
**Behaviour:** nothing else changes: `library.playlist()` (:88-92) already orders by `BUILTIN`; `library.test.ts:63` pins `BUILTIN[0]` = tunnel, which `spread` keeps. Accepted side effect: `Panel.tsx:410` lists built-ins in the same interleaved order (sort there later if the user wants grouping).
**Vitest:** the existing `doc.test.ts` round-trip and ref tests now cover the milk docs. **Done-check:** gates green; the CP2 demo: `npm run dev`, Start, autopilot: a MilkDrop scene fades in through a gl-transition within a few switches, the badge names it, a kick cuts/flashes over it; panel lists the 3 starred; REC 20 s → the file plays with MilkDrop frames and sound (needs audio: a file drop, or the lead's no-device sink after a coreaudiod restart). Then the lead's harness (design § Probe ruling 5): silence, full size, ≥ 60 s with the playlist forced so that the two heaviest presets fade into each other and the heaviest starred own scene (plain `?bench` GPU) fades with a milk scene; pass = 0 late frames incl. switches and 1.00× at the end; fail → path (d), then a lower S3.1 cap, then design. **Dependencies:** S2.3. **New deps:** none.
**Changed during implementation:**
1. `native.ts` `load()` (lead's brief, outside this step's files) is now `.then(ok).catch(fail)`, so a throw from the throwaway `render()` is also logged and resolves false. Before, a two-argument `.then` let it reject, which would have left Start's `warm()` stuck on "compiling n/N".

Browser (M4, headed, `--mute-audio`, autoplay, so Start = page load). Setup: dnb174.wav dropped and looped by the harness, 1280×720 viewport at DPR 1 (stage 640×360).
- **Start:** `compiling 1/51 … 51/51`, which is 48 own defs + the 3 milk ones, ticking last (49–51/51). `createVisualizer` 2, `loadPreset` 4 (2 for the first preset: 1 per pool visualizer, then 1 each for the other two).
- **Playlist:** 30 scenes; the milk scenes sit at 7, 15 and 23.
- **Autopilot fade:** with the harness cut to the scene before it, the next switch faded CRT spectrum → milk through `gl/PerlinDissolve` (1 bar, 1.37 s). The badge named the preset. A → switch into the second preset used `gl/BurnThrough`.
- **Drop:** the harness made a 10 s breakdown with a 400 Hz high-pass on the file's source node, then removed it. A drop fired (0.63) while milk was on screen and cut to Pixel strobe in the same frame. Its flash therefore washes the incoming scene, as for any scene; the milk frames got the heat post pass (gain ≤ 1.08).
- **Start + 62 s:** `createVisualizer` still 2, 0 black milk draws, 0 console errors.
- **Panel (E):** the Library lists the 3 milk rows starred at rows 8, 16 and 24, interleaved as the plan accepted.
- **REC 20 s** from the milk fade: MP4 with H.264 High 640×360 ≈ 59 fps and AAC LC 44.1 kHz stereo (mean −16.5 dB, so not silent), 20.03 s long. Frame 4 s = the preset.
- The lead's worst-case 60 s harness (design § Probe ruling 5) was not run here.

### S3.1 `[x]` Curate ~25 presets, credits
Invoke the `ponytail` skill (full) before writing code.
**Goal:** 20–30 shipped presets with credit fields and `THIRD_PARTY.md` rows.
**Files:** generated `web/src/milkdrop/presets/*.json` (via `scripts/milk-presets.mjs`; the 3 provisional ones stay only if picked), `web/THIRD_PARTY.md` (§ MilkDrop presets: intro + table), `web/src/milkdrop/presets.test.ts` (`PRESETS.length` within 20–30).
**Pick rule** (the coder, from S1.2's `presets` rows attached to the brief; the lead reviews the list and takes a 5 s look at each in the panel; the user unstars later): eligible = no `loadErr`, `k3` true, with margin (`gpuP95 ≤ 4 ms`, Butterchurn's own GPU; `warmMs ≤ 8 ms`; `renderMs ≤ 2.5 ms`); `k2` and `copyP95` are void (design § Probe ruling); spread = round-robin over authors (the `author` field), at most 3 per author, best margin first, until 25; prefer presets with both `warp` and `comp`. The handback lists each pick with its numbers.
**Vitest:** `presets.test.ts` range bump. **Done-check:** gates green; plain `?bench`: every `milk/*` row without errors (its GPU column includes the cross-context wait: information only); panel lists them all starred. **Dependencies:** S2.4. **New deps:** none.
**Changed during implementation:**
- "Best margin" = the smallest `gpuP95` (lead). The sort key is both `warp`+`comp` first, then `gpuP95` ascending; it orders each author's list and each round-robin round.
- `author` is the literal field, so `Flexi`/`flexi`, `martin`/`Martin`, `cope`/`Cope` and `Geiss`/`_Geiss` count as different authors. Folded together they hold 2 picks each, so the ≤ 3 cap holds either way.
- 116 eligible from 49 authors, so round 1 alone fills the 25: one per author, all with warp+comp, `gpuP95` 2.58–3.52.
- The 3 provisional presets are not picked and are removed: they rank #40 and #41, and Geiss's best is Tokamak Plus 2.
- Lead's added check: headed Chrome, `dnb174.wav` looped, LOCK, each scene cut to and held 3 s. One frame per scene was not stable (`royal-mashup-307` read luma std 7.5, then 34.1 on a re-run), so the verdict uses the median of 5 frames over 1–3 s. Near-flat = < 10; all 25 read ≥ 16.2, so nothing is dropped.

### CP3 close-out (lead, no coder)
A scratchpad Playwright run (as `scratchpad/s8-underrun60a.mjs`): 60 s at 60A, autopilot on, headed `--mute-audio`, silence is fine; read `store` `drops` per switch (0 expected) and `governor.jsMs` (< 9 ms). Then queue the spec §7.5 30-min run with MilkDrop in the playlist (audio flowing, after the coreaudiod restart).

## Acceptance mapping
- Spec §4 L78 (20–30 curated presets in the shared playlist; both engines in one recorded canvas) → CP2 (S2.2 copy into our targets, S2.4 playlist, REC demo), CP3 (S3.1 count).
- §7.1 input, §7.2 analysis → untouched; S2.2 reads the same `analyser` in the same frame (design C3).
- §7.3 all own scenes in the playlist, bar-line switching, keys → S2.4 (`spread` keeps every own scene; director untouched); CP2 demo.
- §7.4 REC with picture and sound → CP2 demo (REC holds MilkDrop frames, design C2).
- §7.5 60A holds 60 fps 30 min → S1.2 (K1–K4 gates), S2.3 (no compile inside a fade), CP3 close-out (60 s) and the queued 30-min re-run.
- §7.6 gates → every step's done-check; pure logic in `presets.test.ts`, `quality.test.ts`.

## Research gaps
None blocks the plan; each closes in the step the design assigned (G1–G3: "covered by install + probe, no researcher").
- G1 butterchurn's runtime dep tree + licenses → S1.1. G2 `internalCanvas` + the null-2D skip on the beta.5 dist → S1.1 boot line. G3 beta.4 presets on engine beta.5 → S1.1 load-error count. G4–G7 cold/warm load, copy on the M4, our JS median, per-preset GPU → S1.2.
- New: G9 how `butterchurn-presets` 3.0.0-beta.4 exposes presets (export + file layout; research records only 2.4.7's `getPresets()` and `presets/converted/`) → S1.1 handback, used by S1.1 and S2.1. G10 `elapsedTime`'s unit → S1.1 from the dist. G11 whether `UNPACK_FLIP_Y_WEBGL` keeps Chromium's GPU copy path → S1.2 path (d).
