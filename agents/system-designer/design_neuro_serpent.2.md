## §1 Problem and constraints
- Problem: the first opaque, self-occluding, lit 3D body in a codebase with no depth attachment (engine.ts L80-81, view.ts L8-9; no depth, cull or MSAA call anywhere in `web/src`), inside the 5 ms budget.
- Spec (`spec_dnb_wave4.md` §5): R1 stills gate (user). R2 billed +flash p95 <= 5 ms at 1728x1117 on `dnb174-arr` and `dubstep140-arr`. R3 `__flash` <= 3/s and 0 late frames in 60 s. R4 r >= .80 (>= .60 flash-gated). R5 the drop is the climax. R6 = "follows `B`" (the lead-confirmed reading). R7 one built-in, DnB preset.
- Creative: never cut the highlight lines, depth fog, occlusion, gills or the drop recipe; the cut order is fringe, spark count, haze noise (creative §2 L52). §6 must-nots. C1-C18.
- Budget: a slow session runs 1.6-1.7x normal, so the design target is <= 3.0 ms in a normal session.
- Contract: `NativeDef.create(gl, size?)` returns `{ draw(f, v), dispose }` and draws into the bound framebuffer (scene.ts L7, L13). Unchanged.
- Licence: any; record the provenance (CLAUDE.md § Constraints).
- Non-goals: no engine or `renderTarget` change, no texture asset (cubemap, matcap), no bar phase (creative §4), no growl detector (SG4), no new dependency.
### Cost bases (billed +flash p95 at 1728x1117; cited below as b1-b4)
- b1 Rave Lasers, the same pipeline shape, slow sessions: 2.85-2.99 ms loud, 4.44-4.58 ms at the drop (STATE HEAD: RL S6, S5.3, fix-1).
- b2 wireform = lines + `createBloom` + `COMPOSITE_FS`: 3.78-3.84 ms slow (same entries). Bloom as a def pass billed +3.3 ms (isobars.ts L497-498). So `createBloom` is out.
- b3 one full-res analytic pass: superformula 1.01 ms, stars 0.71 ms (STATE Queue 2: S1.1, S1.3). ⚠️ The session speed is not recorded; taken as normal.
- b4 `own/julia.fs`: 20.4 ms at Iter 48, res .5 (julia.fs L35; STATE Queue 2: S1.2).
## §2 Variants
### §2.0 Shared by A, B and C
**Files**
- `web/src/scenes/serpent.ts` (new): the pure rig + GLSL + `serpent: NativeDef`. The lasers.ts shape (rig from L19, def L550-654).
- `web/src/scenes/serpent.test.ts` (new): Vitest rows on the rig.
- Registration: `web/src/fx/catalog.ts` L8 + L26 (import, the catalog list) and one built-in `builtin:neuro-serpent` in `web/src/scenes/builtin.ts` (R7). Template: `builtin:rave-lasers`, L1007-1015; the built-in repeats the def's binds.
- Only with `reeseLevel`: `audio/features.ts` `fill`, `bind.ts` L26 (`SOURCE_IDS` and its group), `bind.test.ts` L67 (the pinned count), one fixture.
- Roadmap (Electron on Mac + Windows later, CLAUDE.md § Stack): every variant uses WebGL2 core calls only, keeps the native contract and adds no dependency.

**Rig contract** (pure, runs in Node; the `createRig` / `laserState()` precedent, lasers.ts L581, L598)
```ts
export const RING = 16 // p.xyz, halfWidth | n.xyz (RMF + twist), u (arc, in w) | b.xyz, heat | crest, ripple, 2 spare
export interface SerpentOut { rings: number; parts: number; vp: Float32Array; eye: readonly number[]; nearDist: number; glow: number; shock: number; key: number }
export interface SerpentState { phase: 'coil' | 'release' | 'groove'; W: number; B: number; turns: number; twist: number
  ripple: number; ripplePhase: number; spanFW: number; speed: number; whips: number; rings: number; snaps: number; snapSide: 1 | -1; glints: number }
export function createSerpent(seed: number): {
  step(i: { v: Readonly<Record<string, Value>>; beat: number; bpm: number; dt: number; aspect: number }, rings: Float32Array, parts: Float32Array): SerpentOut
  state(): SerpentState }
```
