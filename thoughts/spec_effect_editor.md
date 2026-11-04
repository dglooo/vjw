# VeeJay Wizard — Stage 2b Spec: Effect editor (library + scene builder)

## TL;DR
- A separate **editor screen** for preparing at home: a **library** of every block with live previews (browse, search, keep favourites) plus a roomier **layer-stack builder** for scenes. Live sets still use the autopilot + the `E` panel.
- Same scene model as Stage 2a (`SceneDoc` v1: up to 4 layers, each a generator + an effect chain + blend + opacity). **No node graph.**
- New blocks: a **Bars** generator with shapes (line, circle, mirror, wave) and a **pixel family** of effects (pixelate, mosaic, LED grid, ASCII).
- Calm UI, React. Live preview on the current audio input. Undo/redo.

## Freshness
- 2026-11-04, session 7. Q1–Q4 were put to the user as one round. The user replied "always take the recommendations, don't ask" (standing instruction, 2026-11-04), so every answer here is the lead's recommendation.
  - Q1–Q4 are those recommended answers.
  - Everything past Q4 is marked `(default)`.
- Builds on `thoughts/spec_veejay_wizard.md` §4 (Stage 2b line) and `thoughts/spec_effects.md` (§2.1 model, §2.4 panel, §3 non-goals that name 2b).
- Code state: `master` @ `62a540d`. MilkDrop is done: 25 presets are natives `milk/<slug>`.

## §1 Goal
The user wants to build their own visuals from blocks: "browse shaders, bars, pixels and other building blocks, pick and keep the ones you like, build presets" (spec_veejay_wizard §4). The `E` panel (Stage 2a) edits a running scene in a small overlay. 2b gives that work a proper home.

## §2 Scope
### §2.1 Editor screen (Q2: prep at home)
- A separate full-window **editor mode** in the same app. You enter and leave it with a hotkey and a bar button `(default)`. Leaving returns to the live output and the autopilot.
- Three areas `(default)`: **library** (browse blocks), **preview** (the scene being edited, large, live), **builder** (layer stack + selected block's parameters).
- The preview runs the edited scene on the **current audio input** (device or dropped file), with the same bindings as live.
- The autopilot is paused while the editor is open `(default)`.
- Single screen. Output to a second window or display stays out of scope; the architecture must not block it (spec_effects §2.4).

### §2.2 Library (Q1: library + builder)
- Every block in one browser:
  - generators: our natives, ISF generators, own shaders, MilkDrop presets, Shadertoy pastes saved in scenes;
  - effects: ISF filters + own;
  - user scenes and built-in scenes, as whole scenes.
- **Tiles with previews.** The selected or hovered tile animates live. The rest show a still or a slowly refreshing thumbnail `(default)`; the method is for design, within the §2.6 budget.
- **Filter by kind** (generator / effect / scene) and by **category** (the four Stage 2a categories + ISF `CATEGORIES` + MilkDrop) `(default)`. Plus **search by name**.
- **Favourites** per block ("keep"), separate from the scene star that feeds the autopilot playlist. Saved with the library `(default)`.
- **Try a block** on the preview without committing: click a generator to preview it alone; click an effect to preview it over the edited scene `(default)`.

### §2.3 Builder (Q3: layer stack)
- The Stage 2a model, unchanged: up to 4 layers. Each has a generator, an effect chain (0..N), a blend mode, opacity, speed and res.
- Operations:
  - **Add a block** from the library: drag it to a layer or to "new layer", or use a button.
  - **Reorder** layers and effects by drag.
  - Remove, duplicate a layer, mute/solo a layer `(default)`.
- **Parameters:** larger controls than the panel. Every parameter type gets a control, and **every bindable parameter, bool included,** gets binding controls: source, amount, smoothing, range. This closes the Stage 2a gap where the strobe's bool had none.
  - A **live meter** shows the bound signal next to the control `(default)`.
- **Undo/redo** (Cmd+Z / Shift+Cmd+Z) for every builder edit within the editor session `(default)`.
- A **GPU-cost hint** per scene, as in the panel.
- **Saving:** save, save as, star for the playlist, export/import JSON: the library as today. A scene gets a thumbnail on save for its library tile `(default)`.

### §2.4 New blocks (Q4: bars + pixels)
- **Bars** generator, audio-driven:
  - shapes: line, circle (radial), mirror, wave/oscilloscope;
  - parameters: band count, thickness, gap, colours/gradient, glow, smoothing.
  - It complements the `native/spectrum` scene, it does not replace it `(default)`.
- **Pixel family**, four effects that work over any layer: **pixelate**, **mosaic** (tile shapes), **LED grid** (dots with gaps), **ASCII** (glyph-mapped luminance). Cell size and similar parameters are bindable.
- Implementation source: ISF from `donor/` where it fits, else own shaders. Every ported file keeps an author/URL/license header (spec §6).
- At least 2 new built-in scenes show the new blocks `(default)`.

### §2.5 Flow
Open the editor → browse or search the library → keep favourites → start from an empty or existing scene → add blocks, bind parameters to sound, tune against the live preview → save + star → leave the editor → the scene plays in the autopilot.

### §2.6 Performance
- The editor itself must stay smooth (60 fps preview) on the M4. Library previews must not starve the preview.
- The edited scene holds the pilot budget (60A, governor active), the same as live.
- Live output performance outside the editor is unchanged (§7.5 still holds).

## §3 Non-goals (2b)
Node graph · second-window output · MIDI learn · several bindings per parameter, formula/expression bindings · timeline/sequencing · text/logo layers (possible later) · importing the whole ISF collection (curate as now) · camera (Stage 3) · clip mixer (Stage 4).

## §4 Acceptance
1. The editor opens and closes by hotkey/button. The live output and autopilot resume as before.
2. The library lists every block kind with previews, filters by kind/category, searches by name, and keeps favourites across reloads.
3. A new scene can be built entirely in the editor: library → layers → chain → reorder → bindings (incl. a bool) → save → star. It then plays in the autopilot. Undo/redo work on every builder edit.
4. Bars (4 shapes) and 4 pixel-family effects exist, are bindable, and show in ≥2 new built-in scenes.
5. Preview at 60 fps on the M4 with the library open. The edited scene is within the pilot budget.
6. Gates pass (ESLint, tsc, Vitest). Pure logic is tested: undo stack, reorder ops, favourites persistence, library filters/search. One browser check per step.

## §5 Open questions (for research/design)
- How to render many tile previews from one WebGL2 context (FBO per tile, atlas, `readPixels` → bitmap cache, scissor) and their cost. MilkDrop tiles: Butterchurn's 2-visualizer pool can't preview 25 at once.
- Editor-mode layout and its relation to `app.ts`/`Overlay`/`Panel` (reuse vs new components). Whether the edited-scene preview is the main output canvas or a separate target.
- Drag-and-drop in React: native HTML5 DnD vs a library (license, size).
- Undo model: doc snapshots vs inverse ops over `edit.ts`.
- Donor ISF candidates for bars / pixelate / mosaic / LED / ASCII, with licenses.
- Category metadata: what the catalog already carries per block.
