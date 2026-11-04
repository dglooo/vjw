# Research — Effect editor (Stage 2b, epic `effect-editor`)

## TL;DR
- **Code:** the panel edits the *running* scene through `live.ts` `panel` (in-place values, mirrored structural ops, `editRev`). The engine is single-output: `render()` always ends on the stage, `temps` are sized to the shots, a `Live` is cached once per SceneId with its own clock, and `prepare()` frees every scene except `[shot.from, peek]` on each non-fade frame. Store has no UI-mode field, only `panel: boolean`.
- **Catalog:** 72 defs = 40 generators, 19 filters, 13 transitions. `EffectDef` carries kind, one of 4 categories (or none), credit and inputs. Raw ISF `CATEGORIES` and `DESCRIPTION` are not kept. All 25 milk presets are tagged `feedback`.
- **Donor:** `isf/Pixellate` is **already bundled**. ISF-Files has ready, loader-compatible MIT filters for pixel/mosaic/halftone/ASCII and 4 audio generators (FFT lines, filled FFT, radial, waveform-shape). There is **no LED-grid shader**. `ASCII Art` is a Shadertoy port (licence ⚠️).
- **DnD:** dnd-kit legacy (MIT, last release 2024-12) or `@dnd-kit/react` 0.5.3 (MIT, 2026-10-31, pre-1.0); pragmatic-drag-and-drop 4.0.0 (Apache-2.0, native HTML5 DnD, ~4.7 kB core); native HTML5 DnD has no keyboard path. Undo: a doc is 155–777 B of JSON (≤ 64 KiB with a toy paste) and `structuredClone` of the largest takes ~1.7 µs (Node). `edit.ts` ops are mutate-in-place functions with no op records.

## Freshness
- 2026-11-04. Code at `master` `62a540d`: React 19.3.1, butterchurn 3.0.0-beta.5 (presets 3.0.0-beta.4), twgl.js 7.0.0 (`web/package.json:16-28`).
- npm checked 2026-11-04: @dnd-kit/core 6.3.1 (2024-12-05), @dnd-kit/sortable 10.0.0 (2024-12-04), @dnd-kit/react + /dom 0.5.3 (2026-10-31), @atlaskit/pragmatic-drag-and-drop 4.0.0, -hitbox 3.0.0 and -react-accessibility 3.2.4 (all 2026-09-24), react-dnd 16.0.1 (2022-04-19), @hello-pangea/dnd 18.0.1 (2025-02-09).
- Sizes come from the bundlephobia API (min / gz). Repo activity comes from the GitHub API. Doc sizes and clone timing come from a scratchpad transpile of `scenes/builtin.ts` `OWN` (Node 20.20.2).
- Deltas only: this does not repeat `research_editor_effects.md` §1 (ISF), §5 (node editors) or §7 (storage), nor `research_donor_milkdrop.md` §4 / `research_butterchurn_integration.md` (Butterchurn copy paths).

## §1 Code map for an editor mode
- **Panel → running scene.**
  - `panel` (`gl/live.ts:376-432`): `setValue`/`setBinding` write the doc (edit.ts) and patch the live instance in place, with no store change (`:377-386`, `Live.set` `:313-320`, `rebind` `:321`).
  - Structural ops go through `restructure()` (`:363-369`): the edit.ts op, then the mirrored `Live` op (`addFx` builds the doc's last fx `:325-328`; `removeFx`/`addLayer`/`removeLayer`/`setBlend` `:329-343`), then `editRev+1`.
  - The edited scene is `store.edited`, set every frame to `shot.to ?? shot.from` (`app.ts:336-338`). `Panel` renders on `editRev`, `edited` or a library change (`ui/Panel.tsx:278-296`) and reads `live(id).doc` (`:296`).
  - `Live` has no insert-at-index, move/reorder, replace-generator, duplicate or mute op (`live.ts:26-34`).
- **Rendering.**
  - One WebGL2 context on `#stage`, with `preserveDrawingBuffer:false` (`gl/engine.ts:15-16`).
  - `render()` draws `shot.from`/`shot.to` into the `shots` A/B, then always copies or transitions into framebuffer `null` (`:187-215`). `drawScene` is module-private (`:163`).
  - `shots` and `temps` are fitted together to output×scale (`:96-98`, `setOutput` `:130-135`).
  - `Live.render(f, s, acc)` takes any `acc` Target (`live.ts:267`), but its effect chains ping-pong the shared `temps` (`:297`) and composite with `uRes = acc` size (`:274-275`, `:305-308`). An `acc` at another size would therefore read a mismatched `temps` area (code reading, ⚠️ not run).
  - Per-node pass targets refit whenever `dst` size changes (`:217`).
  - A `Live` is one cached instance per SceneId (`:347-358`), and its layer clocks advance on every `render` call (`:281-282`), so drawing it twice per frame advances it twice.
  - `prepare([shot.from, director.peek()])` runs on every non-fade frame (`app.ts:321`) and disposes every other cached `Live` (`live.ts:436-443`).
  - GPU timers are per SceneId inside `drawScene` (`engine.ts:163-176`).
  - implication: a second target at another size needs its own temps/acc and a `Live` (or id) that `prepare()` keeps.
- **Pausing the autopilot.**
  - `director.setHold(on)` (`director.ts:100`) stops automatic switches only (`director.ts:81`); `←/→` steps still apply under hold (`:78`).
  - The drop cut checks `hold` (`app.ts:330`).
  - The panel sets hold while open and restores the previous hold on close (`setPanel`, `app.ts:87-94`; `KeyE` `:102`; `Escape` `:105` closes it).
  - Hotkeys are skipped when an input, select or textarea has focus (`:100`).
- **UI mode / store.**
  - `UiSnapshot` (`store.ts:7-37`) has `panel` (`:29`), `editRev` (`:30`) and `edited` (`:31`), and no mode enum. The fields are "added later, never renamed" (`:6`).
  - React mounts `Overlay` + `Panel` into `#ui` over the fixed `#stage` canvas (`main.tsx:9-14`, `index.html:10,15`). The Overlay bar auto-hides (`ui/Overlay.tsx:18-31`).

## §2 Block metadata in the catalog
- **`EffectDef`** (`fx/types.ts:10`): `id`, `name`, `kind` (generator/filter/transition), optional `category` (one of `feedback|geometry|liquid|retro`, `:5`), `credit`, `inputs[]` (name, type, label, default/min/max, values/labels, `:9`) and optional `bind` (VJW_BIND suggestions).
  - `ShaderDef` adds `glsl`, `vs`/`fs`, `passes[]` (target/persistent/float/size) and `unsupported` (`:13`). `NativeDef` adds `create`/`warm` (`gl/scene.ts:7`).
- **ISF metadata.** `IsfHeader` reads `CREDIT`, `CATEGORIES`, `INPUTS`, `PASSES`, `IMPORTED` and `VJW_BIND` (`fx/isf.ts:36`).
  - `CATEGORIES` is reduced to one of our 4 categories by exact match, then by keyword (`:42-49`, `:81-87`, `:144`). The raw strings are dropped.
  - `DESCRIPTION` is not read. Kind is decided by input names (`:107-109`).
- **Counts** (census of headers + `catalog.ts:13-32`):

| Family | id prefix | gen | filter | trans | categories |
|---|---|---|---|---|---|
| natives | `native/` | 4 | – | – | tunnel, particles = geometry; glitch = retro; spectrum = none |
| MilkDrop | `milk/` | 25 | – | – | all `feedback` (`milkdrop/native.ts:70`); credit = author |
| ISF ported | `isf/` (14) | 2 | 12 | – | feedback 6, geometry 3, retro 3, none 2 (Chromatic Aberration, Pixellate) |
| own `.fs` | `own/` (16) | 9 | 7 | – | liquid 5, geometry 5, feedback 3, retro 3 (all carry VJW_BIND) |
| transitions | `gl/` 12, `own/crossfade` | – | – | 13 | none |
| **total 72** | | **40** | **19** | **13** | |

  - Scenes: 52 built-ins (27 own + 25 `builtin:milk-*`, `scenes/builtin.ts:7`, `milkdrop/presets.ts:24-27`) plus the user scenes in IndexedDB. Toys (`toy/<uuid>`) live inline in scene docs, not in the catalog (`catalog.ts:38-47`).
  - The milk preset JSON also has `url` and `license` (`presets.ts:6`); the def keeps only `credit`.
- **Filterable today with no new data:** kind; category (or "other", as the panel already groups it, `Panel.tsx:23-26`); name; credit/author; source family by id prefix; input types (none of the 72 has `audio`/`audioFFT` today); pass count / `persistent`; has-VJW_BIND; scene star, built-in vs user, `created`, layer count.

## §3 Tile previews from one WebGL2 context
- **Scissor/viewport per tile:** one canvas, and for each tile element its `getBoundingClientRect` → `gl.viewport` + `gl.scissor` (`clear` ignores the viewport); off-screen tiles are skipped. It compiles and uploads once, since "WebGL contexts can not share resources" ([webgl2fundamentals multiple views](https://webgl2fundamentals.org/webgl/lessons/webgl-multiple-views.html)). The context cap is "as low as 8" there; Chromium desktop is 16 (`research_donor_milkdrop.md` §4).
- **FBO per tile / atlas:** our `renderTarget()` and `fit()` already make sized RGBA8/half targets (`engine.ts:79-94`). MDN: batch draws and atlas textures to cut the batch splits that texture changes cause; set up "hot" FBOs ahead, because attachment changes invalidate completeness; `invalidateFramebuffer` for discarded data ([MDN WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices)).
- **Readback.** `readPixels` to the CPU = "finish + round-trip". The async form is `PIXEL_PACK_BUFFER` + `fenceSync` + `clientWaitAsync` + `getBufferSubData` (MDN, same page).
  - `createImageBitmap(canvas|OffscreenCanvas|ImageData, {resizeWidth, resizeHeight, resizeQuality})` returns a Promise ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/createImageBitmap)).
  - `OffscreenCanvas.transferToImageBitmap()` → `bitmaprenderer.transferFromImageBitmap()` transfers ownership; Baseline since 2020 ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/ImageBitmapRenderingContext/transferFromImageBitmap)).
  - Reading the stage after the rAF task returns is undefined with `preserveDrawingBuffer:false` (`research_donor_milkdrop.md` §4).
- **Cost on M4 / ANGLE-Metal:** no public per-technique number found (⚠️ unverified). Our rig: M4, Chrome 156, ANGLE Metal (`design_milkdrop.md:385`). Timer queries there carry ~1 ms overhead and a 3 ms floor artefact (`_adhoc/effects_polish_2026-11-03.md:39`). DOM-source `texImage2D` causes an internal program switch and a pipeline flush (MDN).
- **MilkDrop thumbnails.**
  - Each `milk/*` native renders on a pooled visualizer whose `internalCanvas` is an `OffscreenCanvas` with its own WebGL2 context (`butterchurn dist:12108-12121`), copied into our context by `copy()` (`milkdrop/native.ts:27-36`).
  - The pool holds 2 after `warm()`; `create()` pops one or makes another (uncapped, `:40-50`, `:96-104`).
  - A preset load is `loadPreset(p, 0)` + one throwaway `render` (`:54-66`). The first load blocks ≤ 26 ms; later loads hit caches (`:93-95`).
  - Butterchurn `Visualizer.toDataURL()` (`dist:12874` → renderer `:12012-12064`) re-runs the comp shader into a temporary FBO, then does a sync `readPixels`, a CPU row flip, a 2D canvas and a PNG data URL. `opts.deterministic`/`testMode` exists (`:12102`).
  - Other capture routes already described: `texImage2D(internalCanvas)` is a GPU→GPU blit when done in the same task; `transferToImageBitmap` takes the GPU path (`research_butterchurn_integration.md` ~L104-109).
  - implication: thumbnails can be produced sequentially on one pooled visualizer (load → N renders → capture → cache), with no extra contexts.

## §4 Donor / ISF candidates (all in `donor/ISF-Files/ISF/`, repo MIT ©2018 `donor/ISF-Files/LICENSE`)

| File | Kind | Inputs (key) | Passes | Our loader | Credit / licence note |
|---|---|---|---|---|---|
| FFT Color Lines.fs | gen | `fftImage:audioFFT`, `waveImage:audio`, gainFFT, rangeFFT, vertical, `stereo`, 4 colours | 1 | ok | by VIDVOX |
| FFT Filled Waveform.fs | gen | `fftImage:audioFFT`, strokeSize, gain, min/maxRange, 3 colours | 1 | ok | by VIDVOX |
| Radial Spectrogram.fs | gen | `audioFFT:audioFFT`, size, feedbackOpacity, low, high | 3, persistent | ok | icalvin102 |
| Audio Waveform Shape.fs | gen | `audioWave:audio`, lineWidth, shapeRadius, feedback, zoom, shape1/2 (Circle…Rays) | 1, persistent | ok | **empty CREDIT** |
| FFT Spectrogram.fs | gen | `fftImage:audioFFT`, `clear:event`, gain, range | 2, persistent | ok | by VIDVOX |
| Waveform Displace.fs | filter | `audio:audio`, displaceX/Y, detailX/Y | 1 | ok | icalvin102 |
| Pixellate.fs (**already `isf/Pixellate`**) | filter | cell_size, shape {Square, Rectangle} | 1 | ok | by VIDVOX |
| Multi-Pixellate.fs / Noise Pixellate.fs | filter | cell_size, min_cell_size/rSeed, shape, … | 1 | ok | by VIDVOX |
| Triangle Mosaic.fs | filter | cellSize, jitter, seed, outlineWidth/Color | 1 | ok | by VIDVOX |
| RGB Halftone.fs / CMYK Halftone.fs (+ -Lookaround) | filter | gridSize, smoothing | 1 | ok | by zoidberg |
| Dot Screen.fs | filter | sharpness, angle, scale, colorize, center | 1 | **custom `.vs` → `unsupported`** | by VIDVOX |
| ASCII Art.fs | filter | size, gamma, tint, tintColor, alphaMode; 5×5 bit-packed glyphs, no font texture | 1 | ok | VIDVOX, "Ported from shadertoy.com/view/lssGDj": Shadertoy terms apply ⚠️ unverified |
| Random Characters.fs | gen | charCodeSeed, blockSize, char/bg colour | 1 | ok | VIDVOX |

- Pixelize, Mosaic, Hexagonalize and Polka Dots Curtain are gl-transitions ports (`startImage/endImage/progress`, MIT lines) and load as **transitions**. No file matches LED / dot-matrix by name or content.
- **Our ISF loader** (`fx/isf.ts`):
  - It maps `audio`/`audioFFT` inputs to `sampler2D` + `_<name>_imgSize` (`:38-41`, `:121-129`). `live.ts` binds them to the engine's **512×1 R8** `audioTex.wave` / `.fft` (`live.ts:132-136`; `engine.ts:27-28,104-121`; FFT bytes = −100…−30 dB).
  - So a `stereo` row-2 read (FFT Color Lines `:119-124`) sees one row only.
  - Supported: multipass with TARGET / PERSISTENT / FLOAT / size expressions (`:111-117`, `:155-166`).
  - Rejected (`unsupported`): IMPORTED images, any extra `image` input, and a body with `varying` (custom `.vs`) (`:131-141`). Output is GLSL ES 1.00 (`:51-74`).

## §5 Drag-and-drop in React 19 (ours: 19.3.1)

| Option | SPDX | Latest (date) / repo push | Size min / gz | React 19 | Keyboard / a11y |
|---|---|---|---|---|---|
| Native HTML5 DnD | – | – | 0 | n/a | MDN describes mouse drags; no keyboard drag path ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API)); `dataTransfer` is writable only in `dragstart`, readable in `drop` |
| @dnd-kit/core + /sortable (legacy docs) | MIT | 6.3.1 / 10.0.0 (2024-12) / repo 2026-10-31, 17.8k★ | 43.7/14.2 + 9.2/3.7 kB | peer `react >=16.8` | keyboard sensor (Space/Enter, arrows 25 px, Esc), live-region announcements, English only ([legacy a11y](https://dndkit.com/legacy/guides/accessibility)) |
| @dnd-kit/react (+ /dom) | MIT | 0.5.3 (2026-10-31), **pre-1.0** | 100.6/33.2 kB | peer `^18 \|\| ^19` | Accessibility plugin + KeyboardSensor ([docs](https://dndkit.com/guides/accessibility); details from a mirror, ⚠️) |
| @atlaskit/pragmatic-drag-and-drop | Apache-2.0 | 4.0.0 (2026-09-24) / repo 2026-11-02, 12.8k★ | "~4.7 kB core" ([README](https://github.com/atlassian/pragmatic-drag-and-drop)); bundlephobia 217 B = empty root entry | framework-agnostic; `-react-accessibility` peer `^18.2 \|\| ^19` | built on native DnD; a11y via optional "assistive controls" (ADS-based) or own; atlassian.design nav marks the section "Deprecated" ⚠️ unverified, npm not deprecated |
| @hello-pangea/dnd | Apache-2.0 | 18.0.1 (2025-02-09) / repo 2026-11-04 | 93.2/28.8 kB | `^18 \|\| ^19` | lists only (rbd fork) ⚠️ |
| react-dnd | MIT | 16.0.1 (2022-04-19) / repo 2025-07-06 | 31.8/8.9 + html5-backend 15.5/4.5 kB | peer `>=16.14` | HTML5 backend; dormant releases |

- **Existing drop handlers:**
  - `document` `dragover` preventDefault + `drop` plays `dataTransfer.files[0]` as audio (`audio/input.ts:128-137`); a drop without files returns early.
  - The panel `onDrop` imports `.json` (`ui/Panel.tsx:314-320`).
  - A window `dragover` wakes the overlay (`Panel.tsx:56`).

## §6 Undo/redo: facts
- **`edit.ts` op shape.**
  - Free functions `(doc, …args)` mutate `editable(doc)`: a `structuredClone` of the doc into `docs` on the first edit, which also marks it `dirty` (`edit.ts:15-25`).
  - They return `void`, or `false` on refusal (`addLayer` at 4, `removeLayer` at 1, `:60-73`). They record nothing; `removeFx`/`removeLayer` discard the removed node (`:51-53`, `:68-73`).
  - Ops: `setValue` (node input or layer opacity/speed/res), `setBinding` (null unbinds), `setBlend`, `addFx` (append), `removeFx`, `addLayer` (append), `removeLayer`, `newNode`.
- **Restoring a doc:** `Live` has no "replace doc" path. The only rebuild today is dispose + cache delete, as in `saveAs` (`live.ts:422-425`), or the per-op mirrors (§1). Values/bindings re-apply via `set`/`rebind`.
- **Sizes** (27 own built-ins, `JSON.stringify`): min 155 B (`tunnel`), median 335 B, max 777 B (`toy-plasma`, with inline code), total 9.3 kB. A milk scene is ~240 B. Max 2 layers and 3 fx in a built-in. A node's `code` may hold up to `CODE_MAX` 65 536 chars (`doc.ts:14`), and a scene holds ≤ 4 layers.
- **Timing:** `structuredClone`(777 B doc) ≈ 1.7 µs/op, JSON round-trip ≈ 3.5 µs/op (Node 20, M4, 10k loop; browser ⚠️ not measured).
- **Reference:** Synesthesia keeps a per-bank undo in its control panel (Scene / Meta / Media) ([controls](https://app.synesthesia.live/docs/manual/controls.html)).

## §7 Reference editor UX deltas
- **Synesthesia:** the scene library has Small/Medium/Large thumbnail sizes, a unified search bar (name/artist), tag filters (built-in + custom; AND), source-folder filters, **star labels for favourites** and colour labels ([library](https://app.synesthesia.live/docs/manual/library.html)). Its "FavSlots" are one-click favourite *presets* (control snapshots) ([presets](https://app.synesthesia.live/docs/manual/presets.html)). Since v1.20, a scene thumbnail can be updated "with a click" after a screenshot ([blog, 2022](https://vjlabor.blogspot.com/2022/10/synesthesia-v120-update-for-real-this.html)).
- **Resolume (7.7+):** a heart icon favourites effects and sources (top of list / Favorites tab). Double-click previews a source; drag onto an empty clip. There can be any number of preview monitors, and panels are undockable since 7.6 ([7.7 blog](https://www.resolume.com/blog/21042/resolume-7-7-128293-multiple-monitors-effect-favorites-127752-color-picker), [sources](https://resolume.com/support/en/sources)).
- **VDMX:** each layer has one source plus an FX chain. ISF FX appear in the Layer FX "Load Asset" menu. The Assets inspector previews the source through the inspected FX at **~10 fps**, and "Preview FX" jumps there from a layer ([assets](https://docs.vidvox.net/vdmx/vdmx_assets)).
- **Magic Music Visuals:** the Editor has a Folder panel on the left (hierarchical scenes), a Globals panel on the right and a Preview window at the bottom showing an additional scene. The main window is the live output ([screenshots](https://magicmusicvisuals.com/screenshots), [forum](https://magicmusicvisuals.com/forums/viewtopic.php?p=7144)).
- **TouchDesigner Palette:** a folder list, then the components below it, then a preview at the bottom (icon + info). You drag into the network. **"My Components"** is the user's own folder area (add by drag) ([Palette](https://derivative.ca/UserGuide/Palette)).
- **KodeLife:** the code editor is overlaid on the live output ("Stack"), with Split V/H options and an external output window; most controls sit in a "Kontrol Panel" ([interface](https://hexler.net/kodelife/manual/interface)).
