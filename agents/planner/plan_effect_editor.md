# Plan — Effect editor (Stage 2b, epic `effect-editor`, Variant B)

## TL;DR
- Builds `design_effect_editor.md` Variant B: a full-window editor (key `L`) whose preview is the live stage CSS-scaled; DOM tiles baked in-session plus one async live tile; the builder on the existing `panel` ops with inverse-step undo; bool/event binding UI plus the event rising-edge fix; 5 new blocks (bars, Pixellate binding, mosaic, led-grid, ASCII port) and 3 built-ins.
- 4 CPs in the design's order (CP1 builder core → CP2 editor screen → CP3 library + tiles → CP4 blocks). **15 steps, not 14:** the design's S3.2 is split at the engine/editor seam (see `**Changed:**` in CP3). No new npm dependency. SceneDoc v1 unchanged, no migration.
- Research gaps: G1 (async readback) and G2 (bake time/memory) are measured in S3.3, G4 (tunnel under effect tiles) is judged in S3.3, G3 (ASCII licence) is checked in S4.3; each has its fallback named in the step.
- CP1 already gives the user something without a new screen: a bool bound to `kick` toggles in the E panel, and a bound event fires once per hit instead of every frame.

## Freshness
- 2026-11-05, master `2a0cdc1` (Stage 2d done; the kick-fix coder step runs in parallel, STATE HEAD L54).
- Read: `agents/system-designer/design_effect_editor.md` L1–236 (TL;DR, constraints, S1–S10), L274–300 (Variant B), L355–403 (CPs, gaps, decisions), plus L237–273 (Variant A) because B defines its files and the `tiles` contract "as A". `thoughts/spec_effect_editor.md` L19–76. `agents/planner/plan_td_look.md` L15–26. `agents/STATE.md` HEAD. `CLAUDE.md` § Lead workflow #11, § Constraints.
- Verified by glob/grep only (no code read): every path under **Files** exists or is marked new; `KeyL` is unused in `web/src/app.ts` (the switch is on `e.code`: E T B F Q R), so the design's `L` assumption holds; Vitest runs in Node with no jsdom/testing-library, so there are no component tests and `.tsx` logic that needs a test lives in a `.ts` helper (the `ui/SourcesTab.test.ts` → `audio/settings.ts` pattern); `donor/ISF-Files/ISF/ASCII Art.fs`, `web/src/fx/isf/Pixellate.fs`, `web/THIRD_PARTY.md` exist; harnesses `scratchpad/td/{td-feedback,cp3-close,cp4-close}.mjs` and `scratchpad/live-rebuild.mjs` exist.
- The kick-fix step lives in `audio/*`; no file overlap with this plan. S1.3's kick-toggle demo reads cleanly only after its merge (false kicks on the dubstep fixture before it).

## Chosen variant
`agents/system-designer/design_effect_editor.md` § Variant B (L274–300). Lead pick 2026-11-05 under the user's standing instruction ("take recommendations, don't ask"), all designer defaults (§ Decision needed 1–8): inverse-step undo recorded in `panel`; try = add + pending mark + Esc; mute/solo preview-only; editor key `L`; session-only thumbnails; port the donor `ASCII Art.fs`; CP order 1→4. CP4 has no code dependency on CP1–3 (design L381): its steps may fill a gap if a CP1–3 step is blocked, still one coder at a time.

## Conventions (every step; a step's text states only what differs)
- **Brief opener, verbatim:** "Invoke the `ponytail` skill (full) before writing code." Then: ~45 min (L ≈60–75), own worktree with `web/node_modules` symlinked, reads by symbol (never by line number), ≤ ~3 files plus their tests, one targeted browser check. The lead merges into `master`, runs the gates and commits (CLAUDE.md #11); one coder at a time.
- **Gates:** `cd web && npm run lint && npm run typecheck && npm test`.
- **Dev server:** `cd web && npm run dev -- --port 5174` → `http://localhost:5174/`. **Restart Vite after ANY `web/src` edit** before the browser check.
- **Worktree isolation:** the coder writes only inside its worktree. Harness scripts and screenshots go to `<worktree>/scratchpad/ed/<step>-<what>.{mjs,png}`; the lead copies them to `/Users/shaixee/Codered/Veejay-Wizard/scratchpad/ed/`. Patterns: `scratchpad/td/td-feedback.mjs` (one scene on `?debug`, trace + screenshot), `scratchpad/live-rebuild.mjs` (a structural panel edit leaves a feedback trail intact), `scratchpad/td/cp3-close.mjs` (contact sheet), `scratchpad/td/cp4-close.mjs` (60 s autopilot late-frame run).
- **Browser check:** Playwright, headed Chrome, `localhost:5174/?debug`, file source `scratchpad/fx_audio/dnb174-arr.wav` (build 23.1 s, drop 34.1 s); steps that bind a param also run `dubstep140-arr.wav` (build 28.4 s, drop 42.1 s) with Auto-style on via E → Sources. Every step leaves ≥1 screenshot for the lead.
- **Render-path change** (anything in `gl/live.ts` `run`/`render`, `gl/scene.ts`, `scenes/*.ts`, `bind.ts`): a same-session A/B of GPU p95 on `builtin:rgba-delay` and `builtin:swarm` (`?bench`, 1728×1117, scale 1) before/after, and a 60 s autopilot late-frame run on `dnb174-arr` → 0 late, 1.00× (`cp4-close.mjs` pattern). The per-scene GPU timer under-reports (STATE L22); the late-frame run is the truth.
- **Tests:** Vitest next to the code (`x.test.ts` beside `x.ts`), Node environment, pure logic first. Design S10 is the list; each step names its share.
- **New blocks (2d policy,** `design_td_look.md` L51–110 + ruling L420–452): drums (`kick`/`snare`/`hats`), `sub`, `build`/`drop` bind direct; the bass class binds `reese` (Auto-style maps it to `wobble` on Dubstep); flash-class inputs are 0..1 with binding min 0 and listed in `VJW_FLASH` (→ `EffectDef.flash`); `hats` drives thin detail only; `VJW_BIND` defaults live in the file so add-fx brings them along. Header per spec §6 (`Look:`/`Credits:` line, donor author/URL/licence). Shared header test `web/src/fx/isf.test.ts` `NEW_OWN` gets one entry per new own file (parses; sources ∈ `SOURCE_IDS`; flash inputs min 0).
- **Lead close-out per CP:** contact sheet or screen-recording stills at `scratchpad/ed/cpN-sheet.png` plus one end-to-end check (named per CP).

## Research gaps → steps (design L389–394)
- **G1** sync `readPixels` vs async PBO + fence at 320×180 on ANGLE-Metal → **S3.3** measures both. Pass for B: the fence signals within ≤3 frames and the 60 s run with the bake running stays at 0 late. Fail → S3.3 ships Variant A's sync path (≤1 readback per rAF, before `render()`), S3.4 runs the live tile on it at 20 fps, or drops it if the run shows late frames (design A's deviation: §2.2 hovered-live not met; the try in the preview stands in).
- **G2** full-library bake time (est. 15–25 s) and ~150 tile canvases (est. ≈34 MB) → **S3.3** records both. Late frames during the bake → lower the slice 6 → 3 tile-frames per rAF and K 90 → 45 for persistent-pass tiles (⚠️ planner's levers, the design's two knobs). Memory is reported for the lead; thumbnails stay session-only (S9).
- **G3** the licence line of Shadertoy `lssGDj` → **S4.3** reads it off the donor header; absent there, the step stops and reports (lead: Tier 1 researcher look-up). Fallback = decision 7's alternative, an own glyph shader.
- **G4** `native/tunnel` as the source under effect tiles → **S3.3** judges the 5 effect tiles on the sheet; a bad read → the coder picks another moving, colourful generator (S5 allows it) and records the pick.

## Checkpoints
**CP1 — Builder core, no new screen (S1.1–S1.3).** Frozen: `edit.ts` ops `addFx(d,l,n,at?)`, `removeFx → NodeDoc`, `moveFx(d,l,from,to)`, `setGen(d,l,n) → old NodeDoc`, `insertLayer(d,layer,at) → false at 4`, `removeLayer → Layer | false at 1`, `moveLayer(d,from,to)`, `addLayer` stays; `undo.ts` `Step { undo(); redo(); key?; t? }` and `edits { record, undo(): boolean, redo(): boolean, clear() }`; `bind.ts` pure `level(type, y, held)`; on `Live`: `addFx(l, at?)`, `moveFx`, `setGen`, `addLayer(at?)`, `moveLayer`, `mute(l, on)`, `read(p, key)`. **Demo:** in the E panel, bind the strobe's bool to `kick`: it toggles on kicks; an ISF event bound to `snare` fires once per hit. **Lead close-out:** stills of the panel's bool binding block with its meter; a structural panel edit on `builtin:td-feedback` keeps the trail (no restart).

**CP2 — Editor screen + builder (S2.1–S2.4).** Frozen: `UiSnapshot.editor: boolean` with the store's setter (name fixed by S2.1's note); `Fx`/`Param`/`Gpu` exported from `ui/Panel.tsx`; `editor/Editor.tsx` mounted in `main.tsx`, Overlay and Panel render null while `editor` is on; the editor's listener owns Esc, Cmd+Z, Shift+Cmd+Z, Delete, Alt+↑/↓ and the global keydown returns early for everything but `L`. **Demo:** `L` opens the editor; build a scene (add layer, add fx from today's picker lists, reorder by drag, bind a param incl. a bool, undo/redo), Save as, star; `L` again and it plays in the autopilot. **Lead close-out:** stills of that demo; then 60 s in live mode on `dnb174-arr` → 0 late (§7.5 unchanged).
**CP2 Done (lead, 2026-11-05):** the demo ran end to end in S2.4 (16/16: New → fx → bind → Save as → star → `L` → played by the autopilot; export/import round-trip); stills in `scratchpad/ed/s2.4-*`. 60 s live-mode run (`scratchpad/td/cp4-close.mjs`, 38 own scenes, `dnb174-arr`): 0/4563 late, 1.00×, no errors (§7.5 unchanged).


**CP3 — Library + tiles (S3.1–S3.4).** Frozen: `editor/blocks.ts` (`Block`, `blocks()`, `filterBlocks()` as S5); `EffectDef.tags?: readonly string[]`; `library.favs()` / `setFav(id, on)` under `vjw.favs`; `live.tile(doc, w, h): Live`; `NativeDef.create(gl, size?: readonly [number, number])`; `tiles: { frame(f, s); get(id): ImageData | undefined; invalidate(id); onChange(cb): () => void; hover(id: string | null) }`. **Demo:** library open: filters, search and favourites survive a reload; every tile shows a still; the hovered tile moves; Esc takes a tried effect back; 0 late frames. **Lead close-out:** 60 s late-frame run with the library open, the bake running and the live tile on a ring native, then on swarm → 0 late; contact sheet of the tile grid.
**CP3 Done (lead, 2026-11-05):** S3.1–S3.4 merged; 411 tests. Demo pieces ran per step: S3.1 filters/favs/try, S3.3 stills for all 135 blocks, S3.4 live hovered tile at 19.1–19.3 stills/s and re-bake on Save in 256 ms. Sheet `scratchpad/ed/cp3-sheet.png`. The CP3 60 s run (`scratchpad/ed/s3.4-live.mjs run`) had 4 late frames: the library mount (66.7 ms, pre-existing) + 3 single 33 ms vsync misses. Same-session A/B: bake only 3, no bake and no live tile 2, on a loaded machine (load 2.2–4.7, VM). Lead verdict: the 3 come from the environment, not the tiles. Closed on the A/B; a quiet-machine re-run comes with the 2b close-out after CP4.

**CP4 — New blocks (S4.1–S4.4).** Frozen: S7's inputs and `VJW_BIND` per block (restated in each step); CATEGORIES `"Pixel"` on the 4 pixel files; built-ins `builtin:bars`, `builtin:led-grid`, `builtin:ascii` (⚠️ ids are the planner's; keep them unless the look dictates otherwise, and say so). **Demo on `dnb174-arr`:** the bars' glow pulses on kicks (≤3/s), mosaic jitters on the reese, the LED dots swell on the sub, the ASCII cells jump on kicks. **Lead close-out:** contact sheet `ed/cp4-sheet.png` + a 60 s autopilot run over the 3 new built-ins on both arr fixtures → 0 late, 1.00×; then the full playlist run once.

## Steps

### CP1

#### S1.1 [x] `edit.ts` ops + `undo.ts` — M
- Invoke the `ponytail` skill (full) before writing code. **Goal:** the pure half of every builder op and the undo stack (S2 pure column, S3).
- **Files:** `web/src/edit.ts`, `web/src/edit.test.ts`, new `web/src/undo.ts`, new `web/src/undo.test.ts`.
- **Depends on:** none (may start now).
- **Behaviour:** `addFx` gains `at = fx.length`; `removeFx` returns the removed `NodeDoc`; new `moveFx`, `setGen` (returns the old gen), `insertLayer` (false at 4), `moveLayer`; `removeLayer` returns the removed layer, false at 1; `addLayer(gen)` stays as sugar over `insertLayer`. Every op yields a doc `parseScene` accepts (S9). `undo.ts`: `edits.record(step)` pushes and clears redo; a step whose `key` equals the top's within 1 s (`t`) only replaces the top's `redo` (one slider drag = one step); `undo()/redo()` return false on an empty stack; `clear()`.
- **Tests:** `edit.test.ts`: insert-at, moves (incl. from === to), `setGen` and the returned old gen, the insert/remove return values, the limits 1 and 4; every op: apply → its inverse → `toEqual` the original doc. `undo.test.ts`: undo/redo order, redo cleared by a new record, coalescing by key within 1 s (fixed `t`), not across keys, `clear()`.
- **Done:** gates. No browser check (pure).
- **Changed during implementation:**
  - The coalescing window slides: a merged step also takes the new `t`, so a drag longer than 1 s stays one step, as long as each event is within 1 s of the last. A fixed window would split it every second.
  - `record` stamps `t = performance.now()` when the step has none.
  - Call site: `gl/live.ts` `restructure`'s `apply` is now typed `unknown` (was `boolean | void`), since `removeFx`/`removeLayer` return the node/layer. `false` still means refused.

#### S1.2 [x] `Live` mirrors + `panel` records inverse steps — M
- Invoke the `ponytail` skill (full) before writing code. **Goal:** every S2 op mirrored on the built `Live` without a restart, and `panel` as the single choke point that records inverses into `edits` (S2, S3).
- **Files:** `web/src/gl/live.ts` (`restructure` mirrors, `panel`, `mute`, `read`); `web/src/edit.ts` only if a signature needs a tweak.
- **Depends on:** S1.1.
- **Behaviour:** add fx at `at` builds `fx[at]` and splices into `nodes` at `at+1`; move fx / move layer splice the node or `Layer` objects, no rebuild; `setGen` frees `nodes[0]` and builds the new gen; `addLayer(at?)`/duplicate build and splice, false at 4; existing `removeFx`/`removeLayer` mirrors stay. `mute(l, on)` sets `l.muted`; `ok = !l.muted && …` so the fast path and the clear both honour it (a muted layer 0 needs nothing else); never saved. `read(p, key)` returns a bound input's last evaluated value. Each `panel` action records its inverse at the point it has the data (old value, removed node, removed layer). `edits.clear()` where `store.edited` changes (open, Save as). Moving an fx across layers: not built.
- **Tests:** none new in Node (GL); the pure inverses are S1.1's tests.
- **Done:** gates; browser (`live-rebuild.mjs` pattern) on `builtin:td-feedback`: add fx, remove fx, add layer, remove layer, move via a console call: the trail is intact, screenshot before/after; render-path A/B + 60 s late-frame run.
- **Changed during implementation:**
  - `edit.ts`: the set ops (`setValue`, `setBinding`, `setBlend`) return the old value, for the inverse. `setValue(…, undefined)` deletes the key and an emptied `values` (design S2 table), so undoing a first value gives back the exact doc. `move` and `newLayer` are exported: the Live move mirrors reuse `move`; `panel.addLayer`/`pasteToy` = `insertLayer(newLayer(gen))`. `edit.test.ts` gained 3 round-trip rows (setValue, setBinding, setBlend). The step said none new, but the tweak is pure, so its inverses are tested beside S1.1's.
  - `panel` gains `insertLayer(layer, at = top)` (S2.1's duplicate), `moveFx`, `moveLayer`, `setGen(layer, ref)`, `mute`, and `addFx(layer, ref, at?)`. The plain ops (`op`) serve both the action and its undo/redo; `act` records the inverse from what the op returned (removed node/layer, old gen/blend).
  - `mute` records nothing (design S2 inverse "–"): an `edits.undo()` after a mute undoes the edit before it, or returns false.
  - Value and binding steps coalesce by key (`layer/node/input`; a binding's ends in ` bind`). Their undo/redo bump `editRev` so the panel shows the restored value; the drag itself still doesn't re-render.
  - `edits.clear()` sits in `app.ts` beside the one `store.patch` that changes `edited` (open, Save as, the autopilot): a file outside the list. `panel.saveAs` also clears, since its steps belong to the old id until the cut lands.
  - The move mirrors skip `bindAll()`: bindings follow their `u`.
  - `read` returns the value after the flash gate, stored per frame on `Bound.y`, before the bool/long conversion.
  - Browser (`scratchpad/ed/s1.2-ops.mjs`, log + 24 shots + `s1.2-sheet.png`). 23/23 steps PASS: same `Live` object throughout; td-feedback's 2 `loop` textures kept and its draws counting; only the touched natives built or freed; mute black and unmute resumes the trail. After all undos, the doc JSON equals the built-in.
  - A/B GPU p95 (`s1.2-ab.mjs`): rgba-delay 2.66 → 2.64, swarm 4.11 → 4.16 (noise).
  - 60 s late-frame run (`s1.2-late.mjs`, 38 scenes × 2 s on dnb174-arr): 0/4563 late, 1.00×, jsMs 0.7.

#### S1.3 [x] bool/event binding UI, event rising edge, meter — M
- Invoke the `ponytail` skill (full) before writing code. **Goal:** close the 2a gap (S4): bool and event get binding controls in the shared `Param`, a bound event fires once per hit, the bound signal shows on a meter.
- **Files:** `web/src/bind.ts` + `web/src/bind.test.ts`, `web/src/gl/live.ts` (the bound-input loop in `render`), `web/src/ui/Panel.tsx` (`Param`).
- **Depends on:** S1.2 (`read`).
- **Behaviour:** `Param` renders `bind(x.name, 0, 1)` for `bool` and `event`; their block shows source, amount (on when the source reaches .5/amount), release and an *invert* box (min/max = 1/0); attack/min/max hidden. `bool` still writes `y ≥ .5`; `event` writes `true` only on the rising edge via a `held` flag on `Bound` and a pure `level(type, y, held)` in `bind.ts` (returns the value to write and the new held flag; coder fixes the exact shape, keeps it pure). `color` stays unbindable; `point2D` per component as today. The natives' own edge detectors stay (deletion later, YAGNI). Meter: one rAF loop in Panel writes `<meter>` values from `Live.read` through refs; no per-frame React render.
- **Tests:** `bind.test.ts`: `level()`: bool follows y ≥ .5; event fires once on a rising edge, stays false while held, re-arms after y < .5.
- **Done:** gates; browser on `dnb174-arr`: `own/strobe`'s bool bound to `kick` toggles on kicks; `isf/Circular Feedback Mask`'s event bound to `snare` fires about as many times as snares in 10 s (every frame before the fix); meters move; screenshot of the binding block. Render-path A/B + 60 s late-frame run.
- **Changed during implementation:**
  - `held` sits on `BindState` (`x.state.held`), not as its own `Bound` field. `bindInto` already carries `state` across a rebind, and every `setBinding` rebinds all inputs. So a slider drag on any binding never re-fires a held event.
  - Shape: `level(type: 'bool' | 'event', y, held = false): [value, held]`. Only bool and event call it: the tuple allocates, so float and long keep their inline write.
  - The meter sits at the end of the binding block's source row. `meters` is a module `Map` filled by React 19 ref callbacks (cleanup on unmount), so a bind or unbind adds or drops its meter without restarting the loop. The one loop lives in `Open` (deps `[id]`) and writes `live(id).read(path, k) ?? 0`. Range = the row's lo..hi; a gate shows its 0..1 envelope, before `level`.
  - Invert writes min/max 1/0 and back 0/1. Toggling it replaces a non-0/1 range, e.g. own/strobe's built-in max .65.
  - Outside the listed files, two one-liners: the `gl/post.ts` comment on `ON` now points at bind.ts `level`; in `ui/panel.css` the bind block's checkbox joins the row checkboxes' `justify-self: start` rule.
  - Browser (`scratchpad/ed/s1.3-gate.mjs`, 10 s on `builtin:rgba-delay` + Circular Feedback Mask + strobe, audio 9.5–19.5 s; bound through `panel.setBinding`, so the same run works on the base):
    - before: clearBuffer←snare was true on 143 frames for 13 snares, and rgba-delay `rotate` likewise on 143 (13 native steps);
    - after: clearBuffer 13 fires for 13 snares; rotate 13 true frames = 13 native steps; strobe←kick 14 toggles for 14 kicks;
    - meters 52–60 distinct values in 60 frames;
    - UI: dot → `{bass, 1, 0, .15, 0, 1}`, then source kick, then invert 1/0 and back;
    - the gate blocks show only amount, release and invert.
  - A/B GPU p95 (`s1.3-ab.mjs`, 3 rounds): rgba-delay 2.63 → 2.60, swarm 4.18 → 4.15 (noise).
  - 60 s late-frame run (`s1.3-late.mjs`, 38 scenes × 2 s on dnb174-arr): 0/4562 late, 1.00×, jsMs 0.6.
  - Seen, not fixed (out of scope): an event row's `trigger` button calls `panel.setValue(…, true)`. That writes `true` into the doc's `values` and records an undo step. A saved scene then fires that event once at every build, and after an unbind.

### CP2

#### S2.1 [x] editor flag, `L` + bar button, hold/restore, key guard, `prepare` without peek, layout — L
- Invoke the `ponytail` skill (full) before writing code. **Goal:** enter and leave the editor with nothing reallocated and the autopilot held (S1).
- **Files:** `web/src/store.ts` + `web/src/store.test.ts`, `web/src/app.ts`, `web/src/main.tsx`, new `web/src/editor/Editor.tsx` + `web/src/editor/editor.css`, `web/src/ui/Overlay.tsx` (bar button; null while editing), `web/src/ui/Panel.tsx` (null while editing). 7 files of a few lines each; the logic sits in `app.ts`.
- **Depends on:** none in code; kept after CP1 per the design's order.
- **Behaviour:** `UiSnapshot.editor` (fields only ever added; the setter's name goes in the step note and becomes the CP2 contract). `KeyL` and the bar button toggle it. Enter: close the E panel, remember the hold, `director.setHold(true)` (the `setPanel` pattern); `store.edited` stays the current scene. While on, the global keydown returns early for every key but `L`; the modifier-chord and focused-input skips stay. Leave: restore the hold, **no cut** (the scene plays until the next autopilot switch, which lands on the slot it left). `prepare()` skips `director.peek()` while editing (one condition). `Editor.tsx`: a 3-column grid (library placeholder | preview cell | builder placeholder); a ResizeObserver on the cell sets the stage canvas's `transform: translate(x,y) scale(k)` (letterboxed fit) and nothing else, so `clientWidth`, `measure()`, `setOutput`, the governor, ring sizes, Auto-style, the flash gate and `gpuMs` stay live.
- **Tests:** `store.test.ts`: `editor` defaults false; the setter toggles it and notifies (the file's existing pattern).
- **Done:** gates; browser: `L` → Overlay/Panel gone, the stage's rect fits the cell, `canvas.width/height` unchanged (no realloc), the scene id holds 30 s, ←/→/Space inert; `L` → hold restored, no cut, the next switch lands on the slot it left. Screenshot of the layout. 60 s late-frame run with the editor open → 0 late.
- **Changed during implementation:**
  - **CP2 setter = `setEditor(on: boolean)`, exported from `app.ts`** (the `setPanel` pattern; `store.ts` has no named setters, only `patch`). UI calls `setEditor(true|false)`, and reads `store.getSnapshot().editor`. It shares `holdBefore` with `setPanel`: they never overlap, since entering closes the panel and keeps the pre-panel hold. `store.test.ts` covers the store side (default false, toggle + notify); the browser covers the hold.
  - `Panel.tsx` untouched: `panel` is false whenever `editor` is on. `setEditor` closes it, E/Esc sit behind the key guard, and nothing else calls `setPanel`, so Panel already renders null. `ui/overlay.css` +1 selector: `.bar button` shares `.bar select`'s look.
  - The bar button (`Editor · L`) only opens the editor, because the bar renders null while editing; `L` leaves. The fit translates centre to centre with the default `transform-origin`, so the symmetric 1fr|2fr|1fr grid gives `translate(0,0) scale(.486)` at 1728×1117. `useLayoutEffect`, so the first editor frame is already scaled.
  - Browser (`scratchpad/ed/s2.1-editor.mjs`, dnb174-arr):
    - E then L: the panel and bar are gone and the stage rect fits the cell (840×543 in 840×1093, centred). Canvas stays 1728×1118 (no realloc), and the prepared-ahead next scene is freed (a fresh `Live` on re-read).
    - 30 s held: one id (`builtin:tunnel`); hold true and panel false throughout, with ←/→/Space/E/T/Esc pressed at 5 s.
    - L: hold is back to the pre-panel `false`, with no cut. The next switch lands on the slot it left (`builtin:spectrum`), and prepare-ahead is back.
    - Space-lock → L → L keeps the lock. The bar button opens the editor. A resize to 1400×900 and back refits. The transform clears on leave; 0 page errors.
  - 60 s late-frame run with the editor open (`s2.1-late.mjs`, held on `builtin:swarm`): 0/3600 late, max 18.7 ms, governor drops 0, scale 1, jsMs 0.6.
  - Seen, not changed: leaving after a long edit finds the autopilot overdue, so its next switch starts at the next bar line (0.96 s in the check). Space-unlock does the same. "Plays until the next switch" holds, but the built scene gets ≤1 bar. A full shot after leaving would need the director to restart its shot clock on leave.

#### S2.2 [x] `Stack` — L
- Invoke the `ponytail` skill (full) before writing code. **Goal:** the layer stack and params on the live mirrors, with undo keys (S2, S3, S4).
- **Files:** new `web/src/editor/Stack.tsx`, new `web/src/editor/stack.ts` + `web/src/editor/stack.test.ts` (pure `muteMask`), `web/src/ui/Panel.tsx` (export `Fx`, `Param`, `Gpu`), `web/src/editor/Editor.tsx` (mount + key listener), `editor.css`.
- **Depends on:** S2.1, CP1.
- **Behaviour:** layers: select, add (today's picker lists, Panel L23–26), duplicate = `insertLayer(structuredClone(layer), i+1)`, remove (false at 1), mute/solo (preview-only through `Live.mute`; solo l = every other layer muted; reset on leave), blend/opacity/speed/res through the existing panel ops. Fx rows with params through `Fx`/`Param` (bool/event binding from S1.3), meters via `Live.read` in one rAF loop, `Gpu`, node errors. Keys on the editor's listener: Cmd+Z / Shift+Cmd+Z → `edits.undo/redo`; Delete → the selected fx, else the selected layer; Alt+↑/↓ → `moveFx`/`moveLayer` of the selection; a focused text field keeps the browser's Cmd+Z. Every edit goes through `panel`, so its inverse is recorded. Controls larger than the panel's by CSS only.
- **Tests:** `stack.test.ts`: `muteMask(muted, solo)`: null solo returns the flags; solo l unmutes l and mutes the rest; length = layer count.
- **Done:** gates; browser on `builtin:td-feedback`: add, duplicate, mute, solo, remove, Alt-move a layer; add/remove/move an fx; change a binding; Cmd+Z back through every op until the doc JSON equals the original (console); the trail survives throughout; screenshot of the stack with a bool block and live meters.
- **Changed during implementation:**
  - Two files outside the list:
    - `ui/panel.css`: its `.panel X` control rules became `:is(.panel, .stack) X`, so the stack shares the look; `editor.css` sizes it up.
    - `editor/Editor.tsx` imports `./Stack.tsx` with its extension. `Stack.tsx` and `stack.ts` differ only in case, and on a case-blind disk `./Stack` resolves `Stack.ts` → `stack.ts` before `.tsx` (TS1149; Vite would load the wrong module). Rename `stack.ts` if that trips anyone.
  - `Panel.tsx` also exports `LAYERS_MAX` and five small components, which the panel itself now uses:
    - `Meters`: the one rAF meter loop, moved out of `Open`.
    - `LayerHead`: number · gen, blend, `children`, remove.
    - `LayerParams`: opacity, speed, res.
    - `FxOptions` and `GenOptions`: the picker lists.
    - Components only, because the react-refresh lint rule rejects non-component exports from a `.tsx`.
    - Panel regression (`s2.2-panel.mjs`): it renders, the pickers include the paste, 6/10 meters move.
  - Selection `{ layer, fx | null }` lives in `Editor` (its keys need it), and pure `clampSel` (`stack.ts`, tested) clamps it after a removal or an undo.
    - Only the selected layer is open (spec §2.1 "layer stack + selected block's parameters"). The others show their head row: blend, M, S, ⧉, ×.
    - Selection happens on click, in capture: with pointer-down, opening a layer moved the rows under the pointer and the click was lost (found by the browser check).
    - Add layer, duplicate and add fx select the new item.
  - Keys:
    - Order follows the panel (bottom layer first), so Alt+↑ moves towards index 0, up the list.
    - Delete also takes Backspace, the Mac "delete" key.
    - `typing(t)` is a textarea, or an input with a text selection (`selectionStart !== null`). It keeps its own Cmd+Z and Delete.
    - The editor root has the panel's blur-after-mouse handlers, minus text fields, so L and the keys stay live.
    - Nothing renders or acts until `edited` is set (`''` for the first frames after load).
  - Mute and solo state is kept per `LayerDoc` (a Set, plus the solo doc), so a move, a removal and its undo take it along.
    - An effect applies `muteMask` after every render, because a layer built again by an undo comes back unmuted. Unmount (leave) unmutes every layer.
    - edit.ts clones the doc on a scene's first edit, so the Stack re-keys the state by position then. Ceiling, as a `ponytail:` note: a first edit that adds, moves or removes a layer shifts an earlier mute.
  - Browser (`scratchpad/ed/s2.2-stack.mjs` + log, dnb174-arr, 1728×1117 @2x): **45/45 PASS**, every op through the Stack's own buttons, pickers and keys.
    - Layers: a mute survives the scene's first edit (the clone); add tunnel; duplicate; mute 3; solo 1 (2 and 3 muted); unsolo/unmute; × layer 3; Alt+↑ moves the tunnel under td-feedback.
    - Fx: add `own/strobe` (bound bool), then its source beat → kick; meters 7/11 moving; Alt+↑ the strobe; Delete it.
    - A focused text field keeps Cmd+Z.
    - 9 × Cmd+Z: the doc JSON equals the built-in. One more does nothing; Shift+Cmd+Z redoes the first edit; Cmd+Z undoes it again.
    - Mute layer 1, then L: `mute(0, false)` is called and td-feedback draws again.
    - Throughout: the same `Live`; td-feedback's `loop` textures are kept and its draws keep counting; only the touched tunnel is built or freed; 0 console errors.
    - Shots: `s2.2-stack-panel.png` (the bool block + meters), `s2.2-stack-bool-meters.png`, 16 step shots.
  - Seen, not fixed: in 3 of 10 harness runs, td-feedback's persistent `loop` pair got new textures mid-run, never with a black frame.
    - One of those runs logged the governor at 0.935 → 1. A rescale refits the targets, and E2 resamples into new textures by design.
    - Controls with no edits (through the drop, editor open, 30 screenshots @2x) showed no swap. Nor did the last 3 runs, with whole-run canvas/scale logging.
    - No Stack op resizes or rebuilds that node. The lead should watch it in the CP2 late-frame run.

#### S2.3 [x] native DnD reorder of layers and fx — M
- Invoke the `ponytail` skill (full) before writing code. **Goal:** reorder by drag with HTML5 DnD, no dependency (S8).
- **Files:** new `web/src/editor/dnd.ts` + `web/src/editor/dnd.test.ts`, `web/src/editor/Stack.tsx`, `editor.css`.
- **Depends on:** S2.2.
- **Behaviour:** `dnd.ts`: the MIME `application/x-vjw-block`; `insertIndex(y, mids)` = the count of row midpoints above the pointer; `adjustForSource(idx, from)` (idx > from → idx−1). Layer rows and fx rows are `draggable`; each list is a drop target that shows an insert line at the index and on drop calls `moveLayer`/`moveFx` through `panel`. The document's audio drop handler already returns early without files (research §5): verify, don't change. The same drop targets accept a block id in the MIME (S3.1 wires the add). Keyboard path = Alt+↑/↓ from S2.2.
- **Tests:** `dnd.test.ts`: `insertIndex` above the first → 0, between → i+1, below the last → n; `adjustForSource` for a down-move, an up-move and the adjacent no-op.
- **Done:** gates; browser: Playwright `dragAndDrop` layer 2 above layer 1 and an fx to the end of its chain: the doc order changes, the trail survives, Cmd+Z restores; screenshot mid-drag with the insert line (dispatch `dragover` by hand if the helper skips that frame).
- **Changed during implementation:**
  - Lead fix first: `git mv` `editor/stack.ts` → `editor/layers.ts` and `stack.test.ts` → `layers.test.ts`, so `./Stack` no longer resolves to `stack.ts` on a case-blind disk; `Editor.tsx` imports `./Stack` again (S2.2 note).
  - Drag handle: a drag starts from a row's head only (a layer's number · gen and the gaps between its buttons; an effect's name row), never from a control.
    - The browser check caught it: Chrome starts a DnD of a `draggable` ancestor even from a range input inside it. The opacity jumped to the press point, then the whole layer dragged.
    - The press target is kept in a ref (`pointerdown`, capture), and `dragstart` refuses any other start, so the slider keeps the pointer.
  - One drop handler on the stack's list instead of one per list: an effect drag measures the open layer's `.fx` rows; a layer or library-block drag measures the layer sections.
    - Index n is drawn as the line above that list's add select (`.ins`, a box-shadow, no layout shift).
    - The dragged row sits in a ref: a re-render in `dragstart` can cancel the drag.
    - The drop recomputes the index from its own `clientY` and clears the state itself: the move re-keys the list, so `dragend` on the removed row never reaches React.
    - A no-op (`to === from`) records no undo step. The moved item becomes the selection, as with Alt+↑/↓.
  - S3.1 hook: a drag carrying `application/x-vjw-block` shows the line in the layer list. The drop returns at a `// S3.1` comment, where the add goes.
  - `ponytail:` there is no `dragleave`, so the line stays while the pointer is off the list, until the drop or `dragend`. A library tile's `dragend` fires on the tile, so S3.1 clears the line there too.
  - Browser (`scratchpad/ed/s2.3-dnd.mjs` + log, dnb174-arr): **19/19 PASS, 0 console errors**, two consecutive runs.
    - Covered: slider still slides; layer and fx mid-drag lines; both `dragAndDrop` moves; 3 × Cmd+Z back to the built-in; trail kept, same `Live`; an audio file dropped on the stack still plays.
    - Viewport 1728×2500 @1x, because `dragAndDrop` can't reach a target below the fold. It scrolls the target in after the press, and Chrome then hit-tests the press point in the scrolled content (another row drags).
    - Chrome drops CDP `dragOver`s while the renderer is busy. The harness settles with paced 1 px nudges at the target; real drags stream OS updates.
    - Shots: `s2.3-mid-drag-layer.png`, `s2.3-mid-drag-fx.png` (+ `-stack` crop), `s2.3-after-moves.png`, `s2.3-end.png`.
  - Not checked by harness: at 1117 px an fx moved to the end of td-feedback's chain needs a scroll mid-drag (Chrome autoscrolls near the stack's edge). The drag image is the whole row, tall for an open layer; `setDragImage(head)` if it bothers.

#### S2.4 [x] editor header: New, open, Save / Save as / star, export/import — S
- Invoke the `ponytail` skill (full) before writing code. **Goal:** the file operations in the editor on the existing library API (S1, S9).
- **Files:** `web/src/editor/Editor.tsx`; `web/src/ui/Panel.tsx` (export the save/export/import helpers if module-private); `web/src/gl/live.ts` only if `panel` lacks an action.
- **Depends on:** S2.1 (S2.2 for the demo).
- **Behaviour:** open = a `<select>` of library scenes → `director.cut(id)` (off-playlist works, director L112–117; `store.edited` follows and `edits` clears via S1.2). New = a one-layer `native/spectrum` doc through the laziest existing route (`saveAs` + cut, or a dirty doc under a fresh id; the route goes in the step note). Save / Save as / star = `panel.save/saveAs/toggleStar`. Export = the Panel's export; import = a native `<input type="file">` feeding the Panel's JSON import parser (its drop zone is unmounted here). The thumbnail on save comes in S3.4.
- **Tests:** if a `newScene()` helper lands in `edit.ts`/`doc.ts`, one test: `parseScene` accepts it. Otherwise none (wiring).
- **Done:** gates; browser = the CP2 demo end to end: New → add fx → bind → Save as `ed-test` → star → `L` → the playlist contains it and it plays within the cycle; export, then import round-trips it. Screenshot of the header + stack.
- **Changed during implementation:**
  - **New route = a dirty doc under a fresh id**, not saveAs + cut (that would store a "New scene" per click, with no delete UI).
    - `edit.newScene(gen)` holds a one-layer doc in `docs`, dirty. `edit.test.ts`: `parseScene` accepts it as is.
    - `panel.newScene()` passes `fresh('native/spectrum')`; the header cuts to the id it returns.
    - The draft is not stored until Save or Save as. Its star is disabled until then, since there is nowhere to keep it. The open list shows the draft while it is edited.
  - **`panel.saveAs` guard.** It deleted the original from `edit.docs`. A draft has no stored doc, and `store.edited` names it until the cut lands, so a render in that window threw `unknown scene`. The delete is now `if (library.get(doc.id))`.
    - `ponytail:` an abandoned draft stays in `docs` for the session.
  - **Header placement:** in the builder column, on top of the Stack. Two files outside the list: `Stack.tsx` takes `children` in place of its name · GPU row, and `editor.css` gains 2 rules.
    - Row 1: New · open `<select>` (built-ins, user scenes, plus the draft) · GPU.
    - Row 2: the panel's own row plus Export · Import.
    - The note state lives in `Editor`'s `Open`, because New, open and Save as re-key the Stack.
  - **`Panel.tsx`:** its header row became the exported `SceneHead` (star, Save, Save as… with its name field, `children`). Export/Import became `LibraryIo`. `Say` is exported as a type. The panel uses both, with no behaviour change (checked in the harness).
    - Export and import were already public on `library` (`exportLibrary`, `importFile`), so no helper needed exporting.
  - **Queued Tier-1 trigger fix (S1.3 finding):** the event row's trigger now calls `panel.pulse(p, input)` = `edited().set(p, input, true)`.
    - `run()` already clears events after each draw, so the event fires on exactly one draw. No doc value, no undo step, not dirty.
    - The `ponytail:` note on `panel` about it is gone.
    - There is no pure part to test (GL), so the browser covers it.
    - Scenes saved before the fix may still hold an event `true` in `values` and fire once per build. They are not migrated.
  - Browser (`scratchpad/ed/s2.4-header.mjs` + log, dnb174-arr, 1728×1117): **16/16 PASS, 0 console/page errors.**
    - Build: New → strobe (its bool unbound, bound again, source → kick) + scatter (explode unbound) + the gen's glow bound.
    - Save as `ed-test` from the draft: no page error. Open builtin:tunnel, then ed-test while it is off the playlist.
    - Trigger: 1 draw with explode, doc unchanged, `edits.undo()` false, not dirty.
    - Star (playlist 63/64) + Save: no explode value stored. Export: the file's ed-test equals the stored doc.
    - `L`: hold false, no cut. ← to the slot before it, then the autopilot's own next switch plays ed-test (26 s, the 16-bar shot).
    - → off it, delete it, then Import from the header: it is back, equal to the export, starred and listed.
    - Reload: ed-test builds with 0 explode draws in 2 s. The E panel's header and Export/Import are unchanged.
    - Shots: `s2.4-header-stack.png` (header + stack), `s2.4-04-starred.png` (full window), steps `s2.4-00…08`, `s2.4-export.json`.

### CP3
**Changed:** the design's S3.2 (`tile()` + size hint + bake queue + async readback, 8 files) is split at the engine/editor seam into S3.2 (engine: `tile()` + `NativeDef.create(gl, size?)`, a render-path change with its A/B) and S3.3 (editor: bake queue, async readback, tile canvases; G1/G2/G4). The design's S3.3 (live tile) becomes S3.4. Reason: one coder session and ≤ ~3 files per step; the halves carry different risks (render regression vs readback stalls). Order inside the CP is unchanged.

#### S3.1 [x] `blocks.ts`, `tags`, favourites, `Library` grid with placeholders; add by click/drag/`+`; try = pending + Esc — L
- Invoke the `ponytail` skill (full) before writing code. **Goal:** the library's data and grid, without previews yet (S5, S3).
- **Files:** new `web/src/editor/blocks.ts` + `web/src/editor/blocks.test.ts`; `web/src/fx/types.ts` + `web/src/fx/isf.ts` (`tags`) + `web/src/fx/isf.test.ts`; `web/src/library.ts` + `web/src/library.test.ts` (favs); new `web/src/editor/Library.tsx`; `web/src/editor/Editor.tsx` (mount, Esc). 6 files; the logic is in `blocks.ts`.
- **Depends on:** S2.3 (drop MIME, selection).
- **Behaviour:** `blocks(catalog, scenes)` derives, never stores: every non-transition def once (`milk/*` → group `milkdrop`); toys inside scene docs → generator blocks whose `node` is what an add inserts; built-in and user scenes → kind `scene`. `Block.scene` = what a tile renders: a generator alone; an effect as `REF → effect` with `REF = native/tunnel` (G4, judged in S3.3). `filterBlocks` ANDs kind, group, tag, text (case-insensitive substring over name, credit, tags) and favs. `isf.ts` keeps the raw `CATEGORIES` as `EffectDef.tags` beside the reduced `Category`. `library.favs()/setFav()` on the `vjw.stars` pattern, key `vjw.favs`, not exported. `Library.tsx`: kind chips, group/tag chips, a search box, a fav toggle per tile, grey name placeholders until S3.3 bakes; a scene tile opens that scene (`director.cut`). Adds: click = add + *pending* mark (an effect appends to the selected layer; a generator goes on top as a new soloed layer, or at 4 layers replaces the selected layer's gen); Enter or any other edit keeps it; Esc = `edits.undo()`; another tile swaps it (undo, then add); `+` and a drag onto a stack row (S2.3's MIME) add without the mark. Transitions excluded; scenes never inserted into scenes.
- **Tests:** `blocks.test.ts`: every non-transition def exactly once; the milk group; toys from scenes become generators with a `node`; user scenes appear as `scene`; `filterBlocks` by kind, group, tag, text, fav, and ANDed. `library.test.ts`: favs via the kv stub survive a reload; a corrupt value → an empty set. `isf.test.ts`: a parsed file keeps `tags` = its raw CATEGORIES.
- **Done:** gates; browser: all three kinds listed; chips + search narrow; a fav survives reload; click an effect tile → appended + pending, Esc → gone; a generator tile at 4 layers replaces the selected gen; a tile dragged onto a layer row adds there. Screenshot of the grid with filters.
- **Changed during implementation:**
  - Files outside the list (small):
    - `undo.ts`: `edits.top()`, the step Cmd+Z would undo. A try is pending while its add is still the top step, so Esc and a swap only ever undo the add. A bind-dot click records an edit with no `input` event and no re-render, so nothing in the UI alone could tell.
    - `gl/live.ts`: `panel.setGen(layer, gen: string | NodeDoc)`. A toy replacing a gen at 4 layers needs its code, which a bare ref loses.
    - `Stack.tsx` (the S2.3 drop stub, the tried solo), `dnd.ts` (`dragged`), `editor.css`.
  - `blocks.ts`: every generator and effect block carries a `node` (`newNode(id, VJW_BIND)`, or the toy's own node), so all generator adds take one path, `insertLayer(newLayer(clone(node)))`.
    - Toys: one block per ref, named after the first scene that holds it.
    - Order: kind, then name.
    - A tile scene's id is `tile:<block id>`; a scene block renders its own doc.
  - The try lives in `Editor` as `{ id, step, sel, solo }`:
    - Click adds and marks. Another tile undoes the try, then adds. Esc undoes it and restores the selection from before. Enter clears the mark.
    - Any other edit keeps it: the mark checks `edits.top()`, and an `input` event outside the library clears it at once.
    - `ponytail:` a bind-dot click leaves the mark up until the next re-render; Esc then only clears it.
    - A tried generator's new layer reaches `Stack` as a `tried` prop. Stack adopts it into its own solo, so the solo stays once the try is kept and goes with the layer on Esc.
    - `+` adds the same way, with no mark and no solo.
  - Drop:
    - A library effect lands on the layer row under the pointer, at the end of its chain; that row is outlined (`.drop`).
    - A generator goes in as a new layer at S2.3's line. At 4 layers there is no drop (no line, the no-drop cursor).
    - dragover sees only the types, and the line depends on the kind, so the tile's block sits in `dnd.ts dragged`. It is set at dragstart and never cleared; the target still checks the MIME first.
    - A window `dragend` clears the line, since the tile's dragend fires outside the list.
  - Filters and search persist in `sessionStorage['vjw.lib']`. The CP3 demo wants them to survive a reload, and no other CP3 step owns them.
  - Favourites: a new Set per change (its own snapshot), not in the export.
  - The library's top (search, chips, the try hint) is sticky over the grid. Each placeholder shows its kind; a tile's `title` is credit · tags.
  - Browser (`scratchpad/ed/s3.1-library.mjs` + log, dnb174-arr, 1728×1117 @1x): **28/28 PASS, 0 console errors**, 3 runs (the last on the final code after a Vite restart). Gates: lint and typecheck clean, 401 tests.
    - Grid: 135 tiles (42 generators, 30 effects, 63 scenes) = `blocks()`. Chip effect → 30, + feedback → 16, + "SMEAR" → flow-smear; tag Feedback + effect = the catalog's 10.
    - A fav, the search and the chips survive a reload; ★ favourites + effect + "blur" → radial-blur.
    - Try: bloom → swap to radial-blur → Esc: the doc equals the start's, and a second Esc does nothing. Enter keeps it, and so does a slider edit (Esc no longer undoes); Cmd+Z ×2 back.
    - Spectrum: a soloed top layer (tunnel muted) → Esc: gone, unmuted. At 4 layers with layer 2 selected it replaces glitch → Esc restores it.
    - Drags: a generator at 4 layers is refused. bloom onto layer 3's row lands at the end of its chain, selected, unmarked. Spectrum above layer 2 makes a new layer 2, not soloed. A drag released on the preview leaves no line.
    - A scene tile cuts to `builtin:spectrum`.
    - Shots: `s3.1-grid-filters.png` (+ `-library` crop), `s3.1-grid-effect-library.png`, `s3.1-try.png`, `s3.1-try-generator.png`, `s3.1-replace-at-4.png`, `s3.1-mid-drag-effect.png`, `s3.1-mid-drag-generator.png`, `s3.1-end.png`.
  - Seen, not done: a long name runs into the tile's `+`/★ corner (S3.3 puts the still there anyway).

#### S3.2 [x] `live.tile()` + the `NativeDef.create(gl, size?)` size hint — M (render path)
- Invoke the `ponytail` skill (full) before writing code. **Goal:** a small, self-contained `Live` for tiles; heavy natives shrink to the tile (S6).
- **Files:** `web/src/gl/scene.ts`, `web/src/gl/live.ts` (`tile`), `web/src/scenes/history.ts` + `web/src/scenes/history.test.ts`, `web/src/scenes/points.ts` + `web/src/scenes/points.test.ts`, `web/src/scenes/particles.ts`. 5 files, one idea.
- **Depends on:** CP1 merged (same `live.ts`); no editor code.
- **Behaviour:** `NativeDef.create(gl, size?: readonly [number, number])`: `size` is the stage it draws for, default the drawing buffer as today. Users: the ring slot size (`history.ts`), scatter's grid (`points.ts`), swarm/particles `N = size ? 4096 : N`. Every other native ignores it; the live path is byte-for-byte unchanged. `tile(doc, w, h): Live` = `create()` kept outside `cache` (so `prepare()` never frees it) with its own temps at w×h, its own flash-onset list (a tile never spends the preview's WCAG budget), natives created at `[w, h]`, and `res < 1` layers scaling with the tile via their own `small` target; `dispose` frees all of it. Milk layers: one pooled visualizer resized to the tile (`milkdrop/native.ts`), no new pool.
- **Tests:** `history.test.ts`: the ring at 320×180 → 160×90×32 slots (≈1.8 MB) vs the live 61.8 MB; `points.test.ts`: the scatter grid at tile size (3600 pts at 4 px) and swarm N 4096 under a size.
- **Done:** gates; browser via a `?debug` window hook: `tile(doc of builtin:rgba-delay, 320, 180)`, 90 frames, sync `readPixels`, dump `ed/s3.2-tile.png` (recognisable); allocation ≈ +2 MB, not +62 MB; dispose frees it. Render-path A/B on `builtin:rgba-delay` and `builtin:swarm` (p95 unchanged) + 60 s late-frame run.
- **Changed during implementation:**
  - No window hook in product code. `scratchpad/ed/s3.2-tile.mjs` imports `tile` from `/src/gl/live.ts` through Vite, as the A/B harness imports `app.ts`. It takes the app's own FrameInput and Sources by wrapping `scenes.live` once: same calls, captured in the live scene's render. S3.3's `tiles.frame(f, s)` is the real hook.
  - `live.ts`: `create(id, own?: { doc, size })`. With `own`, it makes two temps of its own at the size and an empty flash-onset list, passes `own.size` to every native, and `dispose` frees the temps. Without it (`live()`): the shared `temps`, `flashOnsets`, `create(gl, undefined)`, so nothing changes there. `tile = (doc, w, h) => create(doc.id, { doc, size: [w, h] })`.
  - `points.ts` exports `swarmN(size)`, the test's pure handle. particles keeps `size ? 4096 : N` inline: importing points from particles would be a cycle.
  - `milkdrop/native.ts` is untouched. `create()` already pops the pool or makes one, and `draw` already resizes to `f.width × f.height`.
  - Browser check (dnb174-arr, 1728×1117 @2; the live scene held on `builtin:rgba-delay`; 90 tile frames, one per rAF after the app's, dt 1/60; GPU bytes counted per texture/buffer, tagged by maker): 0 errors in all four.
    - rgba-delay: +2.304 MB (ring 1.843 + temps .461) beside the live 61.821 MB ring; 0 left after dispose.
    - swarm: +.592 MB at create, peak 1.325 (trail + bloom at 240×135, res .75); 0 left.
    - scatter: +.576 MB; 0 left.
    - milk: +.461 MB, peak 1.656; 1.195 left = the pooled visualizer and `copy()`'s shared texture at 320×180, kept by design.
  - Shots: `s3.2-tile.png` (rgba-delay: tunnel with RGB fringes), `s3.2-tile-swarm.png` (threads), `-scatter.png` (4 px squares), `-milk.png` (the preset's palette; its dot grid reads denser than live, `s3.2-live-milk.png`), `s3.2-stage-after.png` (live stage intact).
  - Tile cost: any single tile frame reads ≈2.4 ms on the per-span timer, while an empty query reads 0. 6 tile frames in one query read 3.87 / 3.37 / 2.84 / 8.41 ms (rgba-delay / swarm / scatter / milk), so the marginal cost per tile frame is .29 / .16 / .09 / .86 ms. CPU per `render` ≤ .1 ms (milk 1.7). Sync `readPixels` at 320×180: 4.0–5.4 ms CPU (input for S3.3's G1).
  - A/B (`s3.2-ab.mjs`, 3 × 8 s each, same session): rgba-delay p95 2.63 → 2.65 (med 2.49 → 2.54); swarm p95 4.23 → 4.17 (med 3.94 → 3.96). Late run (`s3.2-late.mjs`): 76 s over 38 scenes, 0/4564 late, 0 governor drops, scale 1, jsMs .6. Gates: lint and typecheck clean, 403 tests.
  - Seen, not done (S3.3/S3.4):
    - `copy()` in `milkdrop/native.ts` shares one texture: a milk tile beside a live milk scene re-allocates it twice a frame (`texImage2D` on each size change).
    - A milk tile hands its visualizer back to the pool at 320×180. The next live milk scene that takes it resizes at its first draw, as a fresh one from `make()` (16×16) does today.

#### S3.3 [x] bake queue, async readback, tile canvases; probes G1, G2, G4 — L
- Invoke the `ponytail` skill (full) before writing code. **Goal:** every tile gets a still in the background without a late frame (S6, Variant B readback).
- **Files:** new `web/src/editor/tiles.ts` + `web/src/editor/tiles.test.ts`, `web/src/editor/Library.tsx` (a canvas per tile, CSS `scaleY(-1)`, IntersectionObserver), `web/src/app.ts` (`tiles.frame(f, src)` right before `render()`, editor only).
- **Depends on:** S3.1, S3.2.
- **Behaviour:** per tile: build `tile()`, render K frames at dt 1/60 on the live Sources and audio textures (K = 1 when no node is a native or has a persistent pass, else 90), read back, dispose. Scheduling: ≤6 tile-frames per rAF, none on the rAF after a late frame (dt > 20 ms), visible tiles first, a shader def waits for `programAsync` before its first bake. Readback = `PIXEL_PACK_BUFFER` + `fenceSync`, polled with `clientWaitSync(…, 0)`, then `getBufferSubData` (research §3). Cache `Map<id, ImageData>` for the session; `invalidate(id)` re-queues; `onChange` wakes React once per finished tile. At most 2 instances alive. **G1:** log sync `readPixels` vs async (CPU ms per call, frames until the fence signals) over ≥100 tiles; pass/fail per § Research gaps. **G2:** log the full-library bake time and the cache's bytes. **G4:** screenshot the 5 effect tiles; a bad read → another REF generator in `blocks.ts`, noted.
- **Tests:** `tiles.test.ts` (pure scheduler): `bakeFrames(doc, catalog)` → 1 vs 90; `nextSlice(queue, dt, visible)` → ≤6 tile-frames, nothing after a late frame, visible first; `invalidate` re-queues once.
- **Done:** gates; browser: open the library, every tile gets a still; 60 s late-frame run with the bake running → 0 late (else the sync fallback, recorded); `ed/s3.3-grid.png` + the G1/G2/G4 numbers and picks in the step note.
- **Changed during implementation:**
  - Files outside the list: `editor.css` (the canvas under the tile's name, `scaleY(-1)`, a text shadow).
  - API beyond the frozen four (`hover` stays S3.4's):
    - `tiles.want(blocks)`: Library hands its blocks over each render, so the derivation stays in one place. A new id is queued; a known one only gets its doc refreshed.
    - `visible`: a Set that Library's IntersectionObserver writes.
    - `tiles.pause()`: on Library's unmount, a started bake disposes its instance and starts over next time. Without it, closing the editor mid-milk-bake made a 3rd Butterchurn context once two milk scenes played live (`s3.3-pause.mjs`: 3→4 contexts; with `pause`, 3→3).
    - Exported for the test: `bakeFrames`, `nextSlice`, `requeue` (invalidate's body), `Job`, `SLICE`, `LATE`, `W`/`H`.
  - The late check reads the unscaled rAF interval (`f.time` deltas). `f.dt` is heat-scaled up to 1.5×, so a build would read as late. `ponytail:` the 30 fps mode renders every other rAF, so every frame there reads as late and nothing bakes.
  - Compiles: each job's shaders go through `programAsync` when it is queued (all 135 at `want()`: 0.4 ms; no late frame came from it). A failed compile drops the job, and its placeholder stays.
  - Milk: a job with a `milk/*` node waits while the edited scene has a milk layer; a started one finishes.
    - Checked: on a live milk scene, an invalidated milk tile doesn't re-bake while a plain one does; back on swarm, it lands.
  - Stills are made opaque (alpha 255), as the `alpha: false` stage shows them. The grid bakes visible tiles first, and its top is the milk presets (kind, then name), so the bake starts with them.
  - Browser (`scratchpad/ed/s3.3-grid.mjs`, ?debug 1728×1117 @2, dnb174-arr, live held on `builtin:swarm`, the cache empty at L; GL timed by wrapping the prototype, no product hook): 0 console errors.
    - **G1 passes for B; no sync fallback.**
      - Async, n = 270: `readPixels` into the PBO ≤ .1 ms CPU, `fenceSync` .1 (p95 .2), `clientWaitSync` ≈ 0, `getBufferSubData` .3 (p95 .6, max 1.6). That is ≈ .4 ms per tile.
      - Every fence signalled after exactly 1 frame (405/405 over both runs).
      - Sync `readPixels` at the same point (Variant A, n = 135, `s3.3-sync.json`): 2.3 ms median, p95 6.3, max 8.9 CPU.
    - **G2:** the full library (135 tiles) bakes in 28.2 s (3 runs: 28.18–28.25). The cache holds 31.1 MB (135 × 230 400 B), and the 135 tile canvases hold as much again.
      - Under budget, so no lever pulled: slice 6, K 90.
    - **G4:** `native/tunnel` stays (`s3.3-effects.png`). Distortion and colour effects read clearly over it (Kaleidoscope, Mirror, Pixellate, Posterize, Sine Warp Tile, RGBA delay, VHS Glitch, Scatter, Time machine).
      - The feedback family (trails, td-feedback, feedback-zoom, Long Exposure) reads subtler, since the tunnel already zooms radially; light-tunnel comes out dark.
      - No other generator reads better across all of them.
    - **Late frames:** 60 s from L, with the bake running ≈56 s of it (270 tiles = 2 full passes): 2 late of 3599 frames, both in the first 125 ms; 0 after that; 0 governor drops, scale 1.
      - 51 ms at +56 ms: the library mount. A no-bake baseline (`tiles.frame` stubbed) shows it too (48.6 ms at +58).
      - 32.2 ms at +122 ms: the first milk tile's first ready slice took 10.6 ms (the 2nd and 3rd milk tiles' took 3.4–3.9, later slices 1.3–1.5).
        - Most likely the pooled visualizer's first resize, 16×16 → 320×180, plus its first draws: once per session. It is not a readback cost, so the sync path wouldn't remove it.
  - Gates: lint and typecheck clean, 409 tests (+6).
  - Shots: `s3.3-grid.png`, `s3.3-effects.png`, `s3.3-milk.png`, `s3.3-editor.png`. Logs: `s3.3-async.json` (+ `.log`), `s3.3-sync.json`, `s3.3-nobake.json`. Harnesses: `s3.3-grid.mjs` (modes async/sync/nobake/diag), `s3.3-pause.mjs`.
  - Seen, not done:
    - The first-milk-tile spike above. A fix is in `milkdrop/native.ts`, e.g. a tile-sized visualizer kept apart from the live pool, which would also end S3.2's resize when a live milk scene takes a visualizer back from a tile.
    - S3.4: `invalidate(id)` bakes the doc Library last handed over through `want()`. After a save, call it once Library has re-rendered, or pass the doc in.
    - `s3.1-library.mjs` `names()` reads `button.pick`'s first child, which is now the canvas.

#### S3.4 [x] live tile (hover/select, 20 fps), last frame → still, re-bake on save — M
- Invoke the `ponytail` skill (full) before writing code. **Goal:** the hovered or selected tile moves; a saved scene gets its thumbnail (Variant B, S6, spec §2.3).
- **Files:** `web/src/editor/tiles.ts` (`hover`), `web/src/editor/Library.tsx`, `web/src/gl/live.ts` (`panel.save/saveAs` → `tiles.invalidate(id)`; a store subscription in `tiles.ts` instead if shorter).
- **Depends on:** S3.3.
- **Behaviour:** `hover(id | null)` after a 150 ms hover delay, or on select: one `tile()` instance runs every frame, read back asynchronously every 3rd frame (20 fps) on S3.3's path; on leave its last frame becomes the still; still ≤2 instances alive (bake + live). Save / Save as invalidate the scene's tile. Under the G1 fallback: sync readback every 3rd frame, or the live tile is dropped (recorded as the design A deviation).
- **Tests:** `tiles.test.ts`: `hover` swaps the live id and releases the old one; the every-3rd-frame cadence.
- **Done:** gates; browser: hover a ring-native tile, then swarm, then a milk tile: it moves, the others stay stills, leaving keeps the last frame; save a scene → its tile re-bakes; CP3 close-out: 60 s with the library open, the bake running and the live tile on `builtin:rgba-delay` then `builtin:swarm` → 0 late; `ed/cp3-sheet.png`.
- **Changed during implementation:**
  - Files as listed; no others.
  - API:
    - `tiles.hover(id | null)`: Library's `li` calls it 150 ms after `pointerenter` (one module-level timer), and `null` on `pointerleave`. A tile's click calls it at once.
    - `pause()` also lets the hovered tile go. Library's unmount clears the timer.
    - `tiles.invalidate(id, doc?)`: a doc passed in wins over the one `want()` last handed over.
  - The live tile:
    - It is one more `tile()` instance. It draws into the bake's `acc` before the slice does, on `f` as given (the live clock, heat-scaled dt). Its frames 0, 3, 6, … go through `read()`, so the PBO + fence path and the cache are shared with the bake.
    - Sharing `acc` is safe: `render()` overwrites it (layer 0 clears it or draws it whole, and the natives clear their own), and GL runs the readback before the slice's draws.
    - A swap or a leave disposes the instance. No read on leave: `acc` may hold a bake frame by then. The last read-back frame (≤ 2 frames old) stays as the still.
    - ≤ 2 instances: the started bake job plus the hovered one.
  - Milk pick: a hovered milk tile **waits** while the edited scene has a milk layer. Its instance is disposed, so its pooled visualizer goes back. A fresh one starts once the scene has none.
  - Save: `panel.save()` calls `tiles.invalidate(doc.id, library.get(doc.id))` with the stored copy, so later edits don't reach the tile.
    - Save as needs no code: its new id is a new block, which `want()` queues on Library's next render.
    - A `library.onChange` subscription in `tiles.ts` was not shorter: `parseScene` gives every put a fresh doc, so a star toggle would re-bake too.
    - ⚠️ This adds an import cycle `gl/live.ts` ↔ `editor/tiles.ts`. Both use the other only at call time; tests and the browser are fine.
  - Browser (`scratchpad/ed/s3.4-live.mjs`; same setup as S3.3: ?debug 1728×1117 @2, dnb174-arr, live held on `builtin:swarm`, real mouse; 0 console errors):
    - Hover, with the bake idle, 1.5 s each:
      - `builtin:rgba-delay`, `builtin:swarm` and `milk/geiss-explosion-mod-2b`: 30 new stills each (20/s). No other listed tile changed.
      - After the leave, 1 s: the target got 0 new stills, and its canvas checksum equals its cached still and stays put.
      - Shots: `s3.4-hover-{rgba,swarm,milk}.png`.
    - Milk wait: on a live milk scene, a hovered milk tile got 0 stills in 1.5 s, while a plain one moved (20 in 1 s). Back on swarm, the milk tile moved (30 in 1.5 s).
    - Save:
      - Save as… (UI) "RGBA delay saved": its first still landed 255 ms later.
      - + Pixellate, then Save (UI): re-baked in 256 ms, with a new checksum.
      - Shots: `s3.4-save-before.png`; `cp3-sheet.png` (search "rgba": the effect tile, the live `builtin:rgba-delay` scene tile, the re-baked pixellated scene).
    - **CP3 run** (`s3.4-run-1.json`, 60 s from L; bake from an empty cache, kept running; live tile on rgba-delay +0.68–30.0 s, then swarm):
      - Totals: 3595 frames, **4 late**. 573 / 580 stills from the live tile (19.1 and 19.3 per s). First full bake 28.24 s. `tiles.frame` med .6, p99 4.3, max 7.4 ms. 3 governor drops, scale 1.
      - Pre-existing: the library mount, 66.7 ms at +78 ms (a 58 ms long task). The first-milk-tile spike didn't show in this run.
      - The other 3 are single missed vsyncs (33.4 / 33.3 / 33.3 ms at +14.2, +22.9, +39.5 s). Each had `tiles.frame` ≤ 2.4 ms around it and no long task. None fell within 1 s of a hover start or swap.
      - Same-session baselines, the same 60 s:
        - Bake without a live tile, pointer off the list (`s3.4-nohover-2.json`): mount 66.7 ms, the first-bake-slice spike (33.4 ms at +147 ms, a 15.4 ms slice: compile + link + 10 texImage2D), then 3 sporadic (≈50 ms at +9.6, +11.2, +46.1 s).
        - No bake and no live tile (`tiles.frame` stubbed, `s3.4-idle-1.json`): mount 50 ms, then 2 sporadic 33 ms (+0.6, +1.7 s).
      - So the live tile adds no measurable lates. This session's machine misses 2–3 vsyncs a minute on its own (load ≈ 2.2, a VM, WindowServer 36% CPU). S3.3's 0 came from a quieter session.
      - `s3.4-live.json` (the full-mode run) agrees: mount 83.1 ms, then 33.2 / 33.1 / 50.0 ms at +2.3, +4.0, +48.9 s.
      - `s3.4-nohover-1.json` is void: the pointer rested on `builtin:tunnel`'s tile, so a live tile ran.
      - A traced run (`s3.4-run-trace-1.json`; the trace's overhead made 12 late, so attribution only) points the same way.
        - Most late frames show a nearly idle main thread (a ≤ 9 ms task plus Layerize): a frame missed on the compositor side.
        - The ones with work are sync GL round-trips waiting on a busy GPU process (`WaitForCmd` 19 ms in GetProgramiv at +63 ms: the first link; 16 ms in a bake slice at +25.7 s), and one 13.6 ms style recalc plus 8.7 ms layout at +18 s.
  - Gates: lint and typecheck clean, 411 tests (+2: hover swap/release, the every-3rd-frame cadence on a fake GL).
  - Seen, not done:
    - A tile hovered before its first bake lands: the bake lands later and replaces the last hovered frame. This is possible only in the first seconds, since visible tiles bake first.
    - `requeue`'s compile-failure path does `queue.splice(queue.indexOf(j), 1)`. That would drop the last job if `j` were already gone, which is unreachable today.

### CP4 (no code dependency on CP1–3; S4.1–S4.3 are independent of each other)

#### S4.1 [x] `own/bars.fs` — L
- Invoke the `ponytail` skill (full) before writing code. **Goal:** the Bars generator, 4 shapes, bound per the policy (S7, spec §2.4).
- **Files:** new `web/src/fx/own/bars.fs`, `web/src/fx/isf.test.ts` (`NEW_OWN`), `web/src/fx/catalog.ts` only if own files are not glob-loaded.
- **Depends on:** none.
- **Behaviour:** generator, 2 passes: pass 1 `levels` (PERSISTENT FLOAT 128×1): log bands from `audioFFT`, release = `smoothing`; pass 2 draws `shape` ∈ {line, circle, mirror, wave}, wave reading the `audio` waveform texture. Inputs: `shape` (long), `bands` 8–128, `gap`, `thickness`, `gain`, `colorA`, `colorB`, `hue`, `glow`, `smoothing`, `spin`. `VJW_BIND`: glow←kick 0/.15 · hue←snare 0/.3 · thickness←sub .05/.4 · spin←bar (saw) · smoothing←build 1/2. `VJW_FLASH`: glow (0..1, min 0, added on top). Complements `native/spectrum`, never replaces it. Budget ≤5 ms p95 (two cheap passes; expect well under ⚠️ estimate). **Donor authorisation:** read and adapt the band mapping from the donor's FFT Color Lines / FFT Filled Waveform files under `donor/ISF-Files/ISF/` (VIDVOX, MIT ©2018); copied lines keep the MIT credit in the file header and in THIRD_PARTY (S4.4).
- **Tests:** `isf.test.ts` `NEW_OWN` += bars (parses; 2 passes with `levels` persistent; sources ∈ `SOURCE_IDS`; `glow` min 0). Band edges are GLSL; if the coder lifts them into a TS table, test monotonic edges for 8 and 128 bands.
- **Done:** gates; `?bench` p95; browser on both arr fixtures: glow↔kick with `__flash` ≤3/s; thickness idles at min on the intro and swings on the drop (sub); hue steps on snares; smoothing rises on the build; one screenshot per shape `ed/bars-<shape>.png`.
- **Changed during implementation:** harness `scratchpad/ed/bars.mjs`: a one-layer test doc with the file's `VJW_BIND`, a trace over the whole arr fixture against `__src`, one shot per shape on the drop, and a same-session A/B with `own/flash` appended. Out: `bars-<fixture>.out.json`; shots `bars-<shape>.png` (dnb) and `bars-<shape>-dub.png`.
  - Inputs `fftImage` (audioFFT) and `waveImage` (audio); bars is the catalog's first file with audio inputs. `bands` is a `long` select {8, 16, 32, 64, 128}, because the panel's `long` needs VALUES. The band edges stay in GLSL, so there is no TS table and no edge test.
  - `thickness` = a bar's width within its slot after the gap (the wave: its line width). Thin needles at rest, fat on the sub. Ranges: glow 0→1, hue 0→.25, thickness .3→1, spin 0→1 turn, smoothing .15→.6 s (the fall's time constant; the rise is instant).
  - Shapes:
    - line: bass on the left, on a floor;
    - circle: bass at the top, mirrored down both sides; spin turns the ring;
    - mirror: bass in the middle, up and down from the centre line;
    - wave: the waveform through a 4-sample box, as the distance to its local segment.
    - On line, mirror and wave, spin sweeps the colorA↔colorB ramp, which is cyclic, so a saw wrap is seamless at confidence 1.
  - Levels: the max of 8 taps per log band, 30 Hz–16 kHz (the row read as 48 kHz). TILT .25 over the range, FLOOR .4 (−72 dB).
  - Look passes:
    - The wave's slope-scaled distance smeared spikes into long streaks; the segment distance fixed that. The hats' sample-to-sample jumps still left thin streaks; the 4-sample box removed them.
    - The nearest bar's halo left dark notches between the tops; the 3 neighbours' halos summed fixed it.
  - **Donor lines (for S4.4 THIRD_PARTY):** VIDVOX, MIT ©2018, `FFT Filled Waveform.fs` + `FFT Color Lines.fs`. Credit in `bars.fs` L2–5 and `CREDIT`.
    - The band lookup `IMG_NORM_PIXEL(fftImage, vec2(x, 0.5))` × gain, adapted: `.r` only (our audio textures are R8) and a log span in place of the linear range.
    - The wave stroke `1 − smoothstep(…, |wave − y|)`, adapted as a segment SDF with smoothstep AA.
    - The input names `fftImage` / `waveImage`.
  - **Numbers** (1728×1118, r = param↔source):
    - dnb174-arr: glow↔kick .92, 49 flashes in 45.6 s (1.07/s, max 2 in any 1 s); hue↔snare .84; thickness↔sub .99 (intro .30–.34, drop .30–1.00, mean .63); smoothing↔build .90 (intro .15 flat, build to .46); spin↔bar saw 1.00.
    - dubstep140-arr: glow↔kick .93 (.44/s, max 1); hue↔snare .83; thickness↔sub .88 (intro mean .42, since this intro carries some sub, mean .07 and max .35; drop mean .66); smoothing↔build .93 (to .46); spin 1.00.
  - **GPU** (same-session A/B, med / p95 ms): bars alone 1.56 / 1.74 (dnb) and 1.61 / 1.67 (dub); + `own/flash` 2.18 / 2.65 and 2.20 / 2.41. Budget ≤5 ✓.
  - Seen, not fixed: the audio texture's −30 dB ceiling pins the bass bands at full height on a loud drop (both fixtures); `gain` < 1 lowers them. Once in the dnb trace the governor stepped the scale down (1616×1045 at the end), and it was back at full size for the A/B.

#### S4.2 [x] `isf/Pixellate` binding + tag, `own/mosaic.fs` — M
- Invoke the `ponytail` skill (full) before writing code. **Goal:** two of the four pixel effects (S7).
- **Files:** `web/src/fx/isf/Pixellate.fs`, new `web/src/fx/own/mosaic.fs`, `web/src/fx/isf.test.ts`.
- **Depends on:** none.
- **Behaviour:** Pixellate: add `VJW_BIND` cell_size←kick 0/.2 (a cell jump) and CATEGORIES `"Pixel"`; the VIDVOX header stays; `pixel-strobe`'s doc keeps its own values (file defaults only ride along on add-fx). mosaic: filter, 1 pass; `shape` {square, hex, triangle, diamond}, `cell`, `jitter`, `outline`, `outlineColor`; `VJW_BIND`: cell←kick 0/.2 · jitter←reese .05/.4 (bass class; Auto-style → wobble on Dubstep) · outline←hats 0/.08; CATEGORIES `"Pixel"`; no flash. **Donor authorisation:** study the donor's Triangle Mosaic (VIDVOX, MIT) under `donor/ISF-Files/ISF/`; copied lines keep the credit.
- **Tests:** `isf.test.ts`: `NEW_OWN` += mosaic; Pixellate parses with its `VJW_BIND` and tag.
- **Done:** gates; browser: mosaic over a moving generator on both fixtures: jitter idles on the intro and swings on the drop (reese / wobble), cell jumps on kicks, outline flickers on hats; `pixel-strobe` A/B unchanged; screenshot per shape.
- **Changed during implementation:**
  - **mosaic has 2 passes, not 1.** Pass 0 writes a 256² RGBA8 table of two random offsets per brick (VIDVOX `hash2`); pass 1 is the mosaic.
    - Why: a hash per seed cost about 1 ms of the square's ~2.8 ms at 1728×1118 (same-session bench). A table fetch costs less.
  - **The cells are the Voronoi cells of jittered lattice seeds,** so the fill and the outline always agree.
    - The donor's Triangle Mosaic tears at high jitter: its fill keeps the grid cells, but its outline follows the jittered edges.
    - Lattices:
      - square;
      - hex: a triangular lattice;
      - triangle: two seeds per brick, the up- and down-triangles' centroids (a honeycomb);
      - diamond: the squares turned 45°.
    - The search covers the 3×3 bricks round the pixel (18 seeds on the triangle). The border is the nearest bisector, an exact distance from a second loop over the stored seeds. REACH .25 per axis is what the 3×3 margin holds.
    - Triangles are scaled ×1.52, so a cell covers the same area as a square. The lattice is centred on the screen, so a kick grows the cells from the centre.
  - Jitter = a fixed random offset per seed × `jitter`, with no time drift: the shards move only when the bound jitter moves, so the motion is the bass.
  - Units:
    - `cell` = the cell width as a share of the screen width (as Pixellate's `cell_size`).
    - `outline` = the line width as a share of the cell, 0–.3. Its edge is 1 px AA, and it fades in below 1 px instead of popping.
    - The fill = 4 taps ±.2 unit round the seed.
  - Bind ranges:
    - mosaic: cell .03→.05, jitter 0→.8, outline 0→.1.
    - Pixellate: cell_size .01→.03, a visible fine grid at rest and 3× on the kick.
    - Pixellate keeps `"Stylize"` beside `"Pixel"`, and `"Pixel"` makes its category `retro`.
  - Harnesses in `scratchpad/ed/`:
    - `mosaic.mjs` (from S4.1's `bars.mjs`): native/tunnel → own/mosaic with its `VJW_BIND`, a whole-fixture trace, one shot per shape on the drop, and an A/B on the triangle with `own/flash` appended.
    - `mosaic-bench.mjs`: a no-audio phase bench.
    - `mosaic-look.mjs`: shape × jitter shots with no audio.
    - `pixel-ab.mjs`: the pixel-strobe A/B.
    - Out: `mosaic-<fixture>.out.json`; shots `mosaic-<shape>.png` (dnb) and `mosaic-<shape>-dub.png`.
  - **Numbers** (1728×1118, r = param↔source):
    - dnb174-arr: cell↔kick .89 (1.07 jumps/s); jitter↔reese .96 (intro mean .07, max .20; drop mean .40, to .80); outline↔hats .90 (3.2 flicks/s).
    - dubstep140-arr: cell↔kick .89 (.43/s); jitter↔reese .91, ↔wobble .79 (intro mean .10; drop mean .38, to .80); outline↔hats .91 (3.4/s).
  - **GPU** (same-session A/B on the triangle, the most seeds; med / p95 ms):
    - tunnel + mosaic: 4.08 / 4.37 (dnb), 4.09 / 4.28 (dub).
    - + `own/flash`: 4.36 / 4.51 and 4.37 / 4.56.
    - The square over a whole trace, without flash: 2.82 / 2.93 and 2.84 / 3.03. The tunnel alone ≈ 1.1–1.4.
    - Budget ≤5 ✓, with less headroom than bars. The machine was loaded: one earlier dub round read p95 5.06–5.25 on both phases.
  - **pixel-strobe A/B:** the doc's own bind still drives it. The traced cell_size was .0080…0.0250 before and .0086…0.0250 after (the file's suggestion would be .01…0.03).
    - Shots `pixel-strobe-{before,after}-{0,1,2}.png` at fixture t ≈ 40.7 s look the same.
  - **Donor lines (for S4.4 THIRD_PARTY):** VIDVOX, MIT ©2018, `Triangle Mosaic.fs`. Credit in `mosaic.fs` L2–6 and `CREDIT`. Hexagonalize and Mosaic were read, but nothing was taken from them.
    - `hash2`, verbatim (pass 0).
    - The jitter offset `(hash2 − 0.5) × jitter`, adapted: × 2·REACH·(nearest-neighbour distance).
    - The flat fill sampled inside the cell, adapted: at the seed, 4 taps.
    - The outline `1 − smoothstep(w/2, w/2 + 1, d px)` mixed toward `outlineColor` × its alpha, adapted: centred ±.5 px, × min(w, 1).
    - The input names `jitter` / `outlineColor`.
  - Seen, not fixed:
    - Without the outline, two cells meet in a hard 1 px step with no AA (invisible at @2).
    - On the hats the outline flicks 3.2–3.4 times a second: dark lines over up to ≈19% of the area at max. The plan says no flash, so it is not gated.
    - If the GPU gets tight, the triangle's window could drop to 5 seed rows (15 seeds).

#### S4.3 [x] `own/led-grid.fs` + the `ASCII Art` port; G3 — M
- Invoke the `ponytail` skill (full) before writing code. **Goal:** the last two pixel effects (S7); the ASCII licence line settled.
- **Files:** new `web/src/fx/own/led-grid.fs`, new `web/src/fx/isf/ASCII Art.fs`, `web/src/fx/isf.test.ts`; `web/src/fx/isf.ts` as a 4th file only for a ≤10-line parser gap (else report).
- **Depends on:** none.
- **Behaviour:** led-grid: filter, 1 pass; `cell`, `dot`, `gap`, `levels`, `off` (unlit floor), `glow`, `round`; `VJW_BIND`: dot←sub .05/.4 · glow←kick 0/.15 · levels←build 1/2; `VJW_FLASH`: glow; CATEGORIES `"Pixel"`; refs RGB/CMYK Halftone (zoidberg), studied only, nothing copied. ASCII, **donor authorisation:** copy `donor/ISF-Files/ISF/ASCII Art.fs` → `web/src/fx/isf/ASCII Art.fs`, keep the VIDVOX MIT header and the Shadertoy `lssGDj` origin line; add `VJW_BIND`: size←kick 0/.2 · gamma←build 1/2; `tint` (bool) left unbound on purpose (the user's bool test); CATEGORIES `"Pixel"`. **G3:** the header must name the Shadertoy source's licence; if the donor header lacks it, stop and report (fallback: an own glyph shader, decision 7).
- **Tests:** `isf.test.ts`: `NEW_OWN` += led-grid; ASCII Art parses with its binding.
- **Done:** gates; browser on `dnb174-arr`: the LED dots swell on the drop (sub), glow ≤3/s on kicks; the ASCII cells jump on kicks, gamma rises on the build; bind `tint` to `kick` in the panel (S1.3 UI) and it toggles; screenshots.
- **Changed during implementation:**
  - **G3 licence (lead ruling 2026-11-06, overrides the plan's stop-and-report):** the donor credits VIDVOX's port of Shadertoy `lssGDj` and names no licence. Ported anyway, with one header line added: `Shadertoy lssGDj: no licence stated; Shadertoy's default CC BY-NC-SA 3.0 assumed (personal use; ⚠️ check before any release)`. The Shadertoy author is named neither by the donor nor the VIDVOX repo → the S4.4 THIRD_PARTY row should write **author per the Shadertoy page**. The VIDVOX MIT credit and the `lssGDj` origin line stay in `CREDIT`.
  - **`tint` is a bool in the port, not the donor's float 0..1** (the plan's `tint` (bool); the user's S1.3 bool test). The body uses `float t = tint ? 1.0 : 0.0;` (GLSL ES 1.00 has no bool arithmetic) at the two `1.0−tint` sites. On = `tintColor` (terminal green by default), off = the cell's own colour.
  - **led-grid is a halftone over `inputImage`, 1 pass:** a 2×2 box per cell, the light quantised to `levels` steps, a dot SDF from square (`round` 0) to circle (`round` 1), the dim `off` floor on the unlit LEDs, and a `glow` halo (kick, flash-gated) on top. CATEGORIES `"Pixel"`. The RGB/CMYK Halftone (zoidberg) donor was studied (per-channel rotated dot grids); nothing copied.
  - **Root-cause fix found in the browser:** the first draft passed the cell *index* to `IMG_PIXEL`, so every LED sampled the same 38×27 px patch of the image's top-left corner — the wall read as one flat colour and looked "low contrast" (two false contrast edits were made chasing that). `IMG_PIXEL` takes px: `(g + ¼) * cs`. With correct per-cell sampling the wall reads instantly (the sun/grid/valley of a bright generator are legible in the steps).
  - Bind ranges (the plan gives attack/release; min/max set here):
    - led-grid: dot 0.5→1.0 (rest dots swell to the gap's margin on the sub); levels 4→12 (the build refines the steps); glow 0→1.
    - ASCII: size 0.10→0.25 (an 11.6→17 px cell jump on the kick); gamma 1.0→2.0.
  - **Harnesses in `scratchpad/ed/`:**
    - `led-grid.mjs` (from S4.2's `mosaic.mjs`): native/tunnel → own/led-grid with its `VJW_BIND`, a whole-fixture trace, one shot on the drop, and an A/B with `own/flash` appended.
    - `ascii.mjs`: native/tunnel → isf/ASCII Art, a whole-fixture trace, one shot on the drop, the `tint`→kick bool check through the panel (8 s on the drop: rising edges + one shot per side), and an A/B with `own/flash` appended.
    - `led-look.mjs` (from `mosaic-look.mjs`): no-audio look shots; the no-audio tunnel is near-black, so the look pass runs on `own/wave-landscape` (bright, time-driven) to judge the steps/dots/round.
    - Out: `led-grid-dnb174-arr.out.json`, `ascii-dnb174-arr.out.json`; shots `led-grid.png`, `ascii.png`, `ascii-tint-{on,off}.png`, `led-look-*.png`.
  - **Numbers** (1728×1118, r = param↔source), dnb174-arr:
    - led-grid: dot↔sub .99 (intro .500…0.528, drop .500…1.000 mean .735); levels↔build .89 (intro 4 flat, build 4…10 mean 6.6); glow↔kick .92, 49 flashes in 45.6 s (1.07/s, max 2 in any 1 s).
    - ASCII: size↔kick .89 (.100…0.250, 1.07 jumps/s; intro 33, drop 16); gamma↔build .9 (intro 1.000 flat, build 1.000…1.686 mean 1.33, drop relaxes to mean 1.12); tint→kick bool: 12 rising edges in 8 s (on 192 frames / off 289).
  - **GPU** (same-session A/B at 1728×1118, med / p95 ms):
    - led-grid: 1.80 / 1.86; + `own/flash`: 2.24 / 2.30. Whole-trace p95 1.85.
    - ASCII: 1.78 / 1.82; + `own/flash`: 2.22 / 2.27. Whole-trace p95 1.82.
    - Budget ≤5 ✓ — the cheapest CP4 passes so far.
  - Seen, not fixed: one `ascii.mjs` bool-loop run hit a transient `"push" is not a function` (harness-side only — no pageerror; the identical logic passed on re-run and in isolation, probes 2/3).

#### S4.4 [x] 3 built-ins, THIRD_PARTY, reaction check, contact sheet — M
- Invoke the `ponytail` skill (full) before writing code. **Goal:** the new blocks in the autopilot at the quality bar, credited (S7, spec §2.4).
- **Files:** `web/src/scenes/builtin.ts`, `web/THIRD_PARTY.md`, the existing test that parses every built-in (add the 3 ids if one lists them).
- **Depends on:** S4.1–S4.3.
- **Behaviour:** `builtin:bars` (bars + one post fx by look), `builtin:led-grid` (a moving gen → mosaic → led-grid), `builtin:ascii` (a moving gen → ASCII); each starred, ≤5 ms GPU p95 at 1728×1117 (E2), bound per the policy, the Auto-style note in the scene comment, composed by look against the TD/MilkDrop bar. THIRD_PARTY: ASCII Art (VIDVOX MIT + Shadertoy `lssGDj` + its licence), Pixellate if missing, any copied donor lines in bars/mosaic.
- **Tests:** the built-in parse test covers the new ids.
- **Done:** gates; `?bench` p95 per scene; reaction check on both arr fixtures (every bound param moves on its source; `__flash` ≤3/s); contact sheet `ed/cp4-sheet.png` (`cp3-close.mjs` pattern); 60 s autopilot run over the 3 new built-ins on both fixtures → 0 late, 1.00× (`cp4-close.mjs` pattern).

**Changed during implementation:**
- Harnesses live in the worktree, not product code: `scratchpad/ed/cp4-builtin.mjs` (reaction + billed A/B), `cp4-60s.mjs` (autopilot), `cp4-sheet.mjs` (contact sheet). Test docs = `structuredClone` of the `BUILTIN` scene registered as `test:<id>` / `test:<id>+flash` (appends an `own/flash` pass) — built-ins stay JSON literals, no test files added.
- The confident-drop cut (`app.ts:352`) checks the STORE's hold, not the director's → harnesses do both `store.patch({ hold: true })` and `director.setHold(true)`.
- Engine eval quirk (harness-side only): a chained `(await import('…')).x.y(…)` statement inside `page.evaluate` deterministically (5/5) threw a bogus TypeError naming a *previous* statement's callee; hoisting all dynamic imports to the top of the evaluate body → 5/5 pass. Same failure family as the S4.3 "push is not a function" transient. Imports are hoisted in all CP4 harnesses.
- The stage canvas is WebGL with `preserveDrawingBuffer: false` (`gl/engine.ts:16`) → in-page `toDataURL()` is always black; all shots are Node-side `page.locator('#stage').screenshot()`.
- Look choices (by eye, TD/MilkDrop bar): `bars` = own/bars shape 2 (mirror) + one post fx own/bloom; the sanctioned `gain: 0.7` keeps bass bands off the audio texture's −30 dB ceiling on a loud drop. `led-grid` = native/tunnel → own/mosaic → own/led-grid. `ascii` = native/tunnel → isf/ASCII Art. 6 dnb shots + 3 dub drop shots viewed; no re-tuning needed.
- dubstep: the auto remap is active (settings `auto` defaults true) so led-grid's jitter (bound to reese) follows the wobble band; correlation vs the written source still ≥0.88, and bars/ascii have no bass-class bindings so Auto-style changes nothing there.

**Results** (1728×1118 unless noted; r = Pearson param↔source over the settle→drop loop):
- Reaction, dnb174-arr (build 23.1 s / drop 34.1 s): bars r = glow↔kick .91, hue↔snare .84, thickness↔sub .99, spin↔bar-saw 1.00, smoothing↔build .90, bloom.threshold↔build −.95, bloom.glow↔kick .63, bloom.level↔drop .91, bloom.rampShift↔bar-saw 1.00; flash 1.05/s, max 2 in 1 s. led-grid r = cell↔kick .89, jitter↔reese .96, outline↔hats .90, dot↔sub .99, glow↔kick .92, levels↔build .89; flash 1.05/s, max 2 in 1 s. ascii r = size↔kick .89, gamma↔build .90; flash 0.
- Reaction, dubstep140-arr (build 28.4 s / drop 42.1 s): bars r = .93/.83/.88/1.00/.93/−.96/.89/.91/1.00; flash 0.44/s, max 2 in 1 s. led-grid r = .89/.91/.91/.88/.93/.92; flash 0.43/s, max 1 in 1 s. ascii r = .89/.93; flash 0. All `__flash` ≤3/s ✓.
- Billed GPU A/B (med / p95 ms, `ALL` at full res): dnb — bars 2.38/3.45, led-grid 4.03/4.14, ascii 1.67/1.68. dubstep — bars 3.43/3.47, led-grid 3.41/3.41, ascii 1.67/2.29. All +flash p95s ≤5 ms ✓; governor low 0 everywhere (no scale-down); whole-trace p95 dnb: bars 3.11, led-grid 3.61, ascii 1.48.
- 60 s autopilot (`cp4-60s.mjs`, drop auto-cuts active, `next()` every 20 s): A baseline (tunnel/swarm/scatter) and B new (bars/led-grid/ascii) on both fixtures — every phase 0 late, refreshMed 16.7 ms (1.00×), fps 59.9, scale 1, govDrops 0, no page errors.
- Contact sheet `scratchpad/ed/cp4-sheet.png`: 3 held drop shots (editor closed) + library pane after the bake's first full pass (30 s, 142 tiles; ascii/bars/led-grid all baked). THIRD_PARTY.md: `isf/ASCII Art.fs` row (VIDVOX, MIT ISF-Files; Shadertoy `lssGDj` — no licence stated, CC BY-NC-SA 3.0 assumed, ⚠️ check before release), Pixellate already present, donor lines for bars/mosaic carried over.
- Gates green from `web/`: `eslint .` clean, `tsc -b` clean, `vitest run` 35 files / 417 tests passed (parse test iterates BUILTIN — no test changes).

## Acceptance mapping (`spec_effect_editor.md` §4; `spec_veejay_wizard.md` §7.5)
| § | Criterion | Proven by |
|---|---|---|
| 4.1 | opens/closes by hotkey/button; live output and autopilot resume | S2.1 (CP2 demo) |
| 4.2 | every block kind with previews; kind/category filter; name search; favourites across reloads | S3.1 (data, filters, favs), S3.3 (stills), S3.4 (live hovered tile); CP3 demo |
| 4.3 | a scene built entirely in the editor incl. a bool binding, saved, starred, plays; undo/redo on every edit | S2.2–S2.4, S3.1 (adds from the library), S1.3 (bool); undo S1.1/S1.2/S2.2; CP2 + CP3 demos |
| 4.4 | Bars (4 shapes) + 4 pixel effects, bindable, in ≥2 built-ins | S4.1–S4.4; CP4 demo |
| 4.5 | 60 fps preview with the library open; the edited scene within budget | S2.1 (held-scene run), S3.3/S3.4 (bake budget; CP3 close-out 0 late), S4.4 (≤5 ms p95 per built-in) |
| 4.6 | gates; pure tests for undo, reorder ops, favourites, filters/search; one browser check per step | S1.1 (undo, ops), S3.1 (favs, filters); every step's Done |
| §7.5 | live output unchanged | S1.2 / S1.3 / S3.2 A/B + late-frame runs; CP2 and CP4 live-mode runs |
