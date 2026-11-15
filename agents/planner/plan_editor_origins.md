# Plan — editor library grouped by origin (Tier 2)
## TL;DR
- User request (2026-11-15): the editor library groups its blocks by ORIGIN, not by the alphabet. Section order: Mine · Ours · TouchDesigner · MilkDrop · ISF/Shadertoy donors · Camera.
- One coder step S1 (size M, 4 files): `blocks.ts` computes `Block.origin` by mechanical rules, `catalog.ts` keeps the raw `.fs` text, `Library.tsx` renders one native `<details>` section per origin plus an origin chips row.
- No new dep, no donor code, no CSS file. Expected on master: Ours 49 · TouchDesigner 72 · MilkDrop 50 · ISF/Shadertoy donors 23 · Camera 3 (197 blocks).
## Freshness
2026-11-15, master `8c91d85` (web tree = `f70876c`). Sources: `agents/research/_adhoc/scene_origins_2026-11-15.md` §1–§4; `web/src/editor/blocks.ts` L1–50, `blocks.test.ts` L1–38, `Library.tsx` L1–129, `editor.css` L74–81; `web/src/fx/catalog.ts` L1–40. Verified by grep: `blocks()` has one caller (`Library.tsx:59`).
## Chosen variant
None (Tier 2, no design round). Lead rulings 2026-11-15: the `Look: TD` header decides (`own/bars`, `own/mosaic`, `own/laser-grid` → TD); mixed scenes → Ours; user scenes → Mine.
## Checkpoints
**CP1 = S1.** Frozen contract: `type Origin = 'mine' | 'ours' | 'td' | 'milkdrop' | 'isf' | 'camera'`; `ORIGINS: Record<Origin, string>` (key order = display order, value = label); `Block.origin: Origin`; `blocks(catalog, scenes, rawFs?)`; `filterBlocks` query field `origin?`; `rawFs: Map<string, string>` exported by `catalog.ts` (id → raw `.fs` text).
Demo: `cd web && npm run dev`, then open the editor. The library shows the sections in the TL;DR order. Each header reads `label · count`. A click on a header folds its section. An origin chip leaves one section.
## Steps
### S1 [x] Origin sections in the library (size M, time box 45 min)
Invoke the `ponytail` skill (full) before writing code. Browser harnesses headless (user rule 2026-11-15).
**Files (no other files):** `web/src/fx/catalog.ts`, `web/src/editor/blocks.ts`, `web/src/editor/blocks.test.ts`, `web/src/editor/Library.tsx`.
1. `catalog.ts`: export `rawFs = new Map<string, string>()`. The registration loop (L27–34) calls `rawFs.set(id, src)`.
2. `blocks.ts`: export `Origin` and `ORIGINS` = mine `Mine`, ours `Ours`, td `TouchDesigner`, milkdrop `MilkDrop`, isf `ISF/Shadertoy donors`, camera `Camera`, in this order. Add `Block.origin`. `blocks()` gets a third parameter `rawFs: ReadonlyMap<string, string> = new Map()`. `blocks.ts` does not import `../fx/catalog` (`tiles.test.ts:18` mocks that module).
3. Two hand lists in `blocks.ts`. `CAMERA`: `native/camera`, `native/outline`, `own/negative`. `TD_NATIVES`: `native/rgba-delay`, `native/time-machine`, `native/slit-scan`, `native/swarm`, `native/scatter`, `native/scope`, `native/plexus`, `native/creatures`, `native/isobars`, `native/wireform`, `native/vortex`, `native/orb`.
4. Def origin, first match wins: id starts with `milk/` → milkdrop; id in `CAMERA` → camera; id starts with `own/` and `rawFs.get(id)` matches `/^\/\/ Look: (a )?TD/m` → td; id in `TD_NATIVES` → td; id starts with `isf/` → isf; else ours.
5. Scene origin, first match wins: user scene (its id does not start with `builtin:`, the test of `library.ts:16`) → mine; any node (`gen` or `fx`, any layer) in `CAMERA` → camera; id starts with `builtin:milk-` → milkdrop; any node with def origin td → td; a layer `gen.ref` starts with `isf/` → isf; else ours. ⚠️ Assumption, needs confirmation: the research's `dj-*` id arm is dropped, because the camera-node arm covers the pending dj-* scenes.
6. Toy block origin: mine if the scene it is first found in is a user scene, else ours. ⚠️ Assumption, needs confirmation (the rulings name scenes only).
7. Sort: `ORIGINS` order, then the current kind order, then name. `filterBlocks` gets an `origin?: string` arm, ANDed like `group` (L48). `Block.group` and its arm stay.
8. `Library.tsx` chips: pass `rawFs` to `blocks()` (L59). Add `Q.origin`. Insert a chips row of the 6 origins (label `ORIGINS[o]`) above the category row (L86). The category row stays byte-identical. ⚠️ Its `milkdrop` chip overlaps the new MilkDrop chip; dropping it is a lead call after the still.
9. `Library.tsx` list: replace the single `<ul>` (L90–126). For each origin in order with ≥ 1 filtered block, render `<details open>`, a `<summary>` reading `label · count` (one inline `style`: pointer cursor, small margin) and a `<ul>` with the current `<li>` JSX unchanged. Do not reuse class `lib` (`ui/panel.css:186` restyles `li`). The aside scrolls (`editor.css:23`), so the `<ul>` grids need no CSS.

**Vitest (`blocks.test.ts`):**
- Update the L26 test. Its title says "by origin, then kind, then name". L33–37 becomes: `scene Mine`, `generator Spectrum`, `generator Toy plasma`, `generator Tunnel`, `effect bloom`, `scene Toy plasma`, `scene Tunnel`, `generator Mindblob`, `effect Pixellate`.
- New test with its own fixture (reuse `def`, `layer`, `scene`). Defs: `milk/a` → milkdrop; `native/camera`, `own/negative` → camera; `native/orb` → td; an `own/*` text with the header on line 2, one with `// Look: a TD-style`, one with the header on line 4 → td; an `own/*` text without the header → ours; an `isf/*` text with the header → isf; `native/tunnel` → ours. Scenes: `u-1` with a TD node → mine; camera gen + TD fx → camera; TD gen + `own/negative` fx → camera; `builtin:milk-a` with a TD fx → milkdrop; own gen + TD fx → td; `isf/*` gen → isf; own gen + `isf/*` fx → ours; a toy found only in `u-1` → mine. Order: the output's origins, deduplicated, equal `Object.keys(ORIGINS)` = mine, ours, td, milkdrop, isf, camera. Filter: `{ origin: 'td' }` alone, then ANDed with `kind`.

**Done-check:** `cd web && npm run lint && npm run typecheck && npm test` (573 + the new test, all green). One headless browser check with a fresh profile: the editor is open and the `summary` texts in DOM order are `Ours · 49`, `TouchDesigner · 72`, `MilkDrop · 50`, `ISF/Shadertoy donors · 23`, `Camera · 3` (no Mine; Camera 6 if the dj-* scenes are merged). Save one still to `scratchpad/ed/origins/`. Report a count mismatch with the ids. Do not tune the rules to fit.
**Depends on:** no step. Notes: `catalog.ts` L26–34 is a merge hotspot with the scene lanes; the DOM gets one `<ul>` per section (old harness selectors on `.library ul`). **New npm deps:** none. **Donor authorisation:** none.
**Lead confirmations (2026-11-15, coder brief):** the three ⚠️ above are confirmed: toy found only in a user scene → mine; the `dj-*` id arm is dropped; the category chips row stays as is.
**Changed during implementation:** (1) The stills are in the worktree's `scratchpad/ed/` (the isolation guard refused the main checkout's `scratchpad/`), not `scratchpad/ed/origins/`. The brief asked for one still. There are two: `editor-origins.png` has the first four sections folded by header clicks, so all five headers and the Camera tiles fit in one shot. `editor-origins-open.png` shows the default state (all open). Each has a `.small.png` copy at 1200 px. (2) The harness `scratchpad/ed/editor-origins.mjs` also checks the demo: each header count equals its tile count, the TouchDesigner chip leaves one section, and a header click folds its section. All checks PASS, with 0 console errors. The section tile ids are in `editor-origins.json`. (3) The new test's "no header" text has `Look: TD` in the middle of a line, which also checks the `^`/`m` anchoring. The test also checks the literal key order of `ORIGINS`. No count mismatch: Ours 49 · TouchDesigner 72 · MilkDrop 50 · ISF/Shadertoy donors 23 · Camera 3.
## Acceptance mapping
- User request "groups by origin (MilkDrop / ours / TouchDesigner), not by the alphabet" → S1: the two Vitest tests (rules, order) + the S6 still (headers, counts).
- Lead rulings 1–5 → the new test's samples (header forms, mixed scene → ours, user scene → mine).
## Gate record
| stage | status | reviewer | evidence | waiver |
|---|---|---|---|---|
| S2 skeptic | n/a | — | — | Tier 2: no independent roles |
| S5 build (S1) | PASS | frontend-coder | branch `worktree-agent-a48670fdf0a3e59cb` on base `ebb1bd7`: `npm run lint` exit 0, `npm run typecheck` exit 0, `npm test` exit 0 (51 files, 574 tests); headless `scratchpad/ed/editor-origins.mjs` ALL PASS (worktree scratchpad) | |
| S6 gates + one headless still of the open editor | UNKNOWN | lead | | |
