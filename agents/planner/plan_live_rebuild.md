# Plan — live rebuild: structural panel edits in place

## TL;DR
- Today every structural panel edit (`addFx`, `removeFx`, `addLayer`, `removeLayer`, `setBlend`, `pasteToy`) calls `rebuild()` = `dispose()` + `build()` (`web/src/gl/live.ts:298-301, 226-234, 330-336`): every node is re-created (natives re-run `create()`, ISF pass pairs get new cleared targets), the layer clocks and `frames` go back to 0, binding smoothing restarts.
- Fix: `Live` mirrors each doc op on the built `layers` in place: `addFx(layer)`, `removeFx(layer, i)`, `addLayer()`, `removeLayer(i)`, `setBlend(layer, b)`. Only the added node/layer is built, only the removed one is freed (through the same `free` / `native.dispose` path `dispose()` uses); every survivor keeps its `Node`, its `u` (so its smoothing), its targets and its clock. `rebuild()` goes away (one caller).
- One step, one file (`web/src/gl/live.ts`), ≈40 lines. No new Vitest: the only index mapping is `nodes.splice(i + 1, 1)` / `push`, mirroring `edit.ts`'s own splice/push (pinned by `web/src/edit.test.ts:56-84`); `live.ts` cannot load under Vitest (WebGL context at import). The browser check is in the done-check.

## Freshness
- Written 2026-11-03 from `agents/research/_adhoc/effects_polish_2026-11-03.md` §5 (same day) and the code at `93af737`: `web/src/gl/live.ts`, `web/src/edit.ts`, `web/src/gl/engine.ts:36-98`, `web/src/store.ts:27`, `web/src/scenes/builtin.ts:166-171`. Stale once `live.ts`'s `Node`/`Layer` shapes or `edit.ts`'s structural ops change.

## Chosen variant
- Tier 2 (lead, 2026-11-03): no new design. Governing design: `agents/system-designer/design_effects.md` Variant A (user pick 2026-10-28, STATE § Key decisions), E6 (the panel).
- Drift: `design_effects.md:234` says "Structural edits call `live.rebuild()` and bump `editRev`". After this plan: "mirror the one op on the built layers in place, then bump `editRev`". The lead notes it; nobody edits the design doc in this step.

## Checkpoints

### CP1 — a structural edit changes only what it edited
**Frozen contract** (`web/src/gl/live.ts`, the `Live` interface; internal to `live.ts`: `edit.ts`, `engine.ts`, `store.ts`, `Panel.tsx` unchanged; `prepare()` keeps using `dispose()`):
```ts
export interface Live {
  readonly doc: SceneDoc; readonly errors: readonly string[]
  render(f: FrameInput, s: Sources, acc: Target): void; dispose(): void
  set(p: edit.NodePath, input: string, v: Value): void; rebind(): void
  /** The panel, after edit.ts changed the doc's structure: the same one op on the built layers. Every other node
   *  and layer keeps its state and clock. addFx/addLayer build the doc's last fx of that layer / last layer. */
  addFx(layer: number): void; removeFx(layer: number, i: number): void
  addLayer(): void; removeLayer(i: number): void; setBlend(layer: number, b: Blend): void
}
```
`rebuild()` is removed from the interface (single caller: `restructure`).

**User-verifiable demo:** `cd web && npm run dev` → `http://localhost:5173/?debug`, pick **Trails spectrum** (`builtin:trails-spectrum`: `native/spectrum` + `isf/Long Exposure`, a PERSISTENT feedback target), press E, add any filter, then remove it: the bars keep their heights and the trail keeps flowing through both edits (no black frame, no restart); the blend dropdown changes the composite without a restart. On **Particles over tunnel**, remove the particles layer: the tunnel keeps travelling.

## Steps

### S1.1 `[x]` Mirror each structural op on the built layers (one coder, ~45 min)
Invoke the `ponytail` skill (full) before writing code.
**Goal:** a structural panel edit builds only what it added, frees only what it removed, and leaves every other node and layer running.
**Files:** modify `web/src/gl/live.ts` only. Read first: `live.ts` 1–40, 94–161, 193–247, 298–313, 328–366; `edit.ts` 17–73; `engine.ts` 36–43, 76–95. Names below are suggestions; the file's short style (`node`, `free`, `run`) rules.
**Behaviour:**
1. Factor the two existing bodies into helpers, no new logic: the per-layer lambda of `build()` (:229–232) → `buildLayer(ld: LayerDoc): Layer` (import `LayerDoc` from `../doc`); the per-node freeing of `dispose()` (:239–242) → `freeNode(n: Node | null)`, and the per-layer part (`small` + every node) → `freeLayer(l: Layer)`. Then `build()` = `errors.length = 0; layers = doc().layers.map(buildLayer); bindAll()` and `dispose()` = `layers.forEach(freeLayer); layers = []`. One freeing path: a removed node is freed exactly as a disposed scene's.
2. Per-node frame counter: `Node.frames: number` (:34; `node()` returns `frames: 0` on both branches), and `run()` :207 becomes `n.u.FRAMEINDEX = n.u.iFrame = n.frames++`. Delete the Live-wide `frames` (:98, :228, :264). An ISF/toy added mid-run still sees FRAMEINDEX/iFrame 0 on its first draw (as after today's rebuild); survivors keep counting.
3. The five methods on the returned object (:248–312), replacing `rebuild`:
   - `addFx(layer)`: `layers[layer].nodes.push(node(doc().layers[layer].fx.at(-1)!))`; `bindAll()`. A failed `node()` pushes `null` and blacks the layer out until removed, as today (:269).
   - `removeFx(layer, i)`: `freeNode(layers[layer].nodes.splice(i + 1, 1)[0])` (`nodes[0]` is the gen, as `set()` :307); `bindAll()`.
   - `addLayer()`: `layers.push(buildLayer(doc().layers.at(-1)!))`; `bindAll()`.
   - `removeLayer(i)`: `freeLayer(layers.splice(i, 1)[0])`; `bindAll()`.
   - `setBlend(layer, b)`: `layers[layer].blend = b`. Nothing else (read per frame, :273, :287).
   `bindAll()` after each add/remove drops the removed node's `bound` entries, compiles the new node's VJW_BIND bindings, keeps the survivors' smoothing (`bindInto` matches `old` by the surviving `u` identity, :144) and realigns its `doc().layers[i]` ↔ `layers[i]` walk (:153–160).
4. `restructure(apply, sync: (l: Live) => void)` (:330): after `apply(l.doc) !== false`, `sync(l)`, then the `editRev` bump as today. A refused op (`addLayer` at 4 layers, `removeLayer` of the last) returns false with nothing synced. The six actions pass their mirror: `addFx` → `(l) => l.addFx(layer)`; `removeFx` → `l.removeFx(layer, i)`; `addLayer` and `pasteToy` → `l.addLayer()`; `removeLayer` → `l.removeLayer(i)`; `setBlend` → `l.setBlend(layer, b)`.
5. Comments: header line 7 ("structure by rebuild()" → the one op mirrored in place), `pasteToy` :364 ("where the rebuild finds it" → where `addLayer`'s `node()` finds it), the `panel` doc :339–341. `errors` is left alone on a structural edit: a removed node's message stays until the next full build (`prepare`), marked `// ponytail: errors are not pruned on remove; prune per node if it shows`.

**Edge cases (all follow from the above; each is a browser check):**
- Removing a layer's last effect: `nodes` becomes `[gen]`; `last`/`direct` are per-frame (:270–273), so the fast path re-applies itself; the effect's pass targets are freed.
- Removing a whole layer, layer 0 included: the others shift down one index and keep `t`, `v`, `f`, nodes and `small`; the last layer is refused by `edit.removeLayer`, so no sync.
- Pasting a Shadertoy: always a new top layer (design E5), built by `addLayer()` from the program `pasteToy` pre-compiled into the engine cache; the existing layers never notice. A 5th layer is refused → no sync, same message.
- An edit during a fade: the panel edits `store.edited` = the incoming scene (`store.ts:27`); `live(id)` is cached by id (:315–325) and is the instance `drawScene(shot.to)` renders, so the edit shows in the fade's next frame; `prepare()` keeps it (in `keep`). Nothing to add.
- No GL leak: a removed node frees every pass-pair target (`free` = deleteFramebuffer + deleteTexture, :67–70) and calls `native.dispose?.()`; a removed layer frees `small` too. Programs stay in the engine's cache by design (`engine.ts:36-43`, shared per source pair; `bloom.ts:77` precedent).
- The first edit of a built-in clones the doc (`edit.ts:18-23`); `doc()` resolves the clone by id (:99, :316), so index mirroring works from the first edit on. Matching by `NodeDoc` identity would not (the clone has new objects): that is why the mirror is by op + index, not a diff.

**Vitest:** none new. The mapping is `splice(i + 1, 1)`/`push` (trivial; extracting it into a GL-free module for a test is YAGNI); `edit.test.ts:56-84` already pins the doc-side push/splice semantics the mirror relies on; `live.ts` imports `gl` (WebGL at module load) and cannot run under Vitest.

**Done-check:** `cd web && npm run lint && npm run typecheck && npm test` green (316 tests, none removed). Browser, Chrome, `http://localhost:5173/?debug`:
1. **Trails spectrum**, E, add `isf/Pixellate` (any filter), then remove it: bar heights and the trail survive both edits, no black frame; a bound input (bind one slider to bass first) keeps its smoothed motion; change the blend: no restart.
2. Add a layer, then remove it; on **Particles over tunnel** remove layer 0, then (fresh) layer 1; remove a layer's last effect; paste a Shadertoy, then remove its layer: each time the other layers keep running (tunnel travel continuous).
3. Start a scene change (fade) and add/remove a filter in the panel while it fades: the incoming scene shows the edit, the fade completes.
4. Leak: the DevTools console filtered on `WebGL:` shows nothing new; Chrome Task Manager (Shift+Esc, enable the GPU memory column): note the value, add + remove `isf/Long Exposure` (has a TARGET) 10×, the value returns to the baseline (±noise); the same for 10× add + remove layer.

**Changed during implementation:**
- `build()` is inlined at its one remaining call site (create time, where `errors` is still empty). `buildLayer` / `freeNode` / `freeLayer` are as planned, and `dispose()` = `layers.forEach(freeLayer)`.
- FRAMEINDEX/iFrame: the per-node post-increment gives a node's first draw 0, as ISF and Shadertoy define it. The old Live-wide counter was incremented in `render()` before drawing, so every first draw saw 1; "as after today's rebuild" was off by one. No shipped shader reads FRAMEINDEX/iFrame (grep), so only a pasted toy can notice.
- `web/src/milkdrop/native.ts` (S2.2, after this plan): its `dispose()` comment named `rebuild()` and stale `live.ts` lines. It is reworded, comment only. `design_effects.md:234` is now updated to the in-place mirror (the lead allowed it).
- The browser checks ran as an automated harness, `scratchpad/live-rebuild.mjs <port> <outDir>` (headed Chrome, dnb174.wav). It counts each native's create()/dispose() per ref, logs every survivor's clock and bound `glow` per draw, and holds live WebGL texture/framebuffer sets per context. Check 4 reads those object counts in place of the Task Manager column (not scriptable). The same harness on the pre-change `live.ts` fails 16 of 17 steps (every edit re-creates the survivors). So the checks discriminate.

**Dependencies:** none. **New deps:** none. **Donor:** none.

## Acceptance mapping
`thoughts/spec_veejay_wizard.md` §7 has no panel criterion; the relevant spec is `thoughts/spec_effects.md` §4:
- §4.1 "without console/GL errors" → S1.1 check 4.
- §4.2 scenes built from up to 4 layers with chains and blends → built live now, without a restart: S1.1 checks 1–2.
- §4.3 a binding visible in the motion → its smoothing survives a structural edit: S1.1 check 1.
- §4.4 a pasted Shadertoy is a working generator layer → still true, the other layers keep running: S1.1 check 2.
- §4.6 gates, pure logic tested → the done-check gates; no new pure logic (Vitest note).
- STATE § Open notes backlog "a structural panel edit restarts the scene" → closed by CP1.
