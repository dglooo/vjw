# Design: Neuro Serpent (DnB wave 4, Scene A)
## TL;DR
- One shared CPU rig, three render paths. **A** = an instanced tube mesh + a depth renderbuffer in the native's own HDR target. **B** = an SDF raymarch. **C** = sorted camera-facing strip impostors, no depth.
- **Recommend A.** Estimated billed +flash p95: 2.2-3.5 ms normal, 3.7-5.8 ms slow (x1.65) with MSAA 4x (mode M); 2.0-2.8 / 3.3-4.7 ms single-sample with a post edge smooth (mode S). MSAA has no cost basis in the repo, so the spike A/Bs the two AA modes first. The lever chain is in §4.
- B fails R2 (about 12 ms normal at full res, even with an analytic helix). C is the cheapest (3.4-4.7 ms slow) but pops where the body crosses itself (the whip) and folds at tight bends.
- Every variant: 1 new scene file + 1 test + registration, no engine change, the Rave Lasers pipeline shape (HDR target -> 1/8 glow chain -> one composite), not `createBloom`.
- SG1: add a `reeseLevel` source, for presence only; the body rows stay on `band8`. A bass that returns on a kick reads 0.2 s late (features.ts L19-22, L63), so C12 needs a reading (Decision 3).
## Freshness
- 2026-11-15, system-designer, master `d73907a` + the uncommitted `creative_neuro_serpent.md`.
- Artifacts: `agents/creative-director/creative_neuro_serpent.md` TL;DR-§3, §6, §8, Signal gaps. `thoughts/spec_dnb_wave4.md` §5. `agents/research/research_dnb_wave4.md` §1, §4. `agents/audio-dsp/dsp_dnb_wave4.md` §3, §5. `agents/STATE.md` HEAD.
- Read outside the brief's ranges: creative §4, §5, §7 (one whole-file read) and dsp TL;DR-§2 (the SG1 basis).
- Code (narrow): `gl/scene.ts`, `gl/view.ts`, `gl/post.ts`, `gl/bloom.ts` L1-75, `gl/engine.ts` L16, L22, L80-99 (grep), `fx/own/liquid-chrome.fs` L30-56, `scenes/wireform.ts` L1-125, `scenes/lasers.ts` L1-40, L540-654, `scenes/isobars.ts` L1-16, L478-517, `audio/features.ts` L1-120, `frame.ts`, `fx/types.ts`, `bind.ts` L7, L12, L26, L122 (grep), `fx/catalog.ts` L8, L26 (grep), `scenes/builtin.ts` L1007-1015 (grep).
- Not read: `gl/live.ts`, `audio/arrange.ts`, the rest of `bind.ts` and `builtin.ts`, the SDLC doc. Web: not used.
- Parts: 9 files (`design_neuro_serpent.md`, `.2.md` to `.9.md`). Join = concatenate in order.
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
- Determinism (C18): the rig reads `v`, `f.sync.beat`, `f.sync.bpm`, `f.dt` and a seeded hash. No `Math.random`, no wall clock (lasers.ts L601 reads `performance.now()`; do not copy that).
- Spine: a helix (0.8 -> 4.0 turns from `W`) on a seeded drift path, plus additive terms: the thrash wave (`B`), the whip loop and the crack sweep (release), the snap kink (snare). 192 rings, uniform in arc length (knob). Each end tapers over 15 % of `L` and closes on a zero-width ring.
- Frames: rotation-minimising by double reflection (Wang et al. 2008, research §1.2; own code, about 15 lines; the body is open, so no closure fix), anchored at mid-body. A helix rolls an RMF by turns x sin(pitch angle), so the rig removes that roll with a linear counter-twist against the coil reference (the coil axis projected off the tangent). Then twist(u) goes on top, and `twist` alone sets the wide / narrow count in C2 (S1 <= 1, S2 >= 3).
- ⚠️ Assumption, needs confirmation: the coil reference puts the wide chord along the coil axis (tape-wound), so the core glow lights the wide inner faces.
- Camera: `orbitVP` unchanged (view.ts L17). The rig subtracts the lagged body centre (lag 1 s). `w` in world units = (% FH) x 2 (view.ts L2-3).
- Ripple phase: a monotone integrator. Each frame adds 2 x max(0, beat step), which is 1 ripple length per 8th note, or 5.8 Hz x dt while bpm = 0. A beat jump adds bpm x dt / 30 for that frame. It never reverses (creative §6).
- `W`: the absence time counts from the last frame with `presence` above θ. Winding starts when it reaches 1 bar and credits that bar. So 16 bars give `W` .85 (3.5 turns), a gap under 1 bar winds 0, and a 1.1-bar gap winds .058, under the .06 whip floor (C11). `W` >= `build`. `W` never falls while the bass is absent. bpm = 0 uses 345 ms per beat.

**Def: inputs and bindings** (creative §3 rows in brackets)
| Input | Source | Attack / release (s) | Rig use |
|---|---|---|---|
| `bass` | `band8` | .06 / .30 | twist, ripple height, flex + thrash, scale [1-4]; rows 3-4 get slower rig one-poles |
| `presence` | `reeseLevel` (SG1) | 0 / 0 | absence -> `W` [12]; return -> release [14] |
| `reese`, `wobble` | same | .03 / .2 | burst = the larger [6] |
| `sub` | `sub` | .04 / .4 | thickness [7] |
| `kick`, `snare`, `hats` | same | 0 / 0 | float; the rig fires on a rise [8-10]. Release 0 keeps 96-100 % of the snare and hat hits (dsp §2.1) |
| `build` | `build` | 0 / 0 | floor of `W` [11] |
| `drop` | `drop` | 0 / .4 | ungated: the fallback whip and the one-whip latch (recipe 4-5) |
| `flare` | `drop` | 0 / .4 | flash-class, `flash: ['flare']`. On the gated rise the rig starts the shock (400 ms) and key (1 s) envelopes [15] |
| `orbit`, `yaw`, `pitch`, `zoom` | none | - | still angles A / B and the S7 close-up; `orbit` 1 = auto drift |
- `band8` over `band6`: the higher worst-track r (.51 against .47, dsp §2.1). Lever: a second input and the max.
- Row 1 release: .35 s leaves twist .58 at 1 s from twist 6 (0.25 + 5.75 x e^(-1/.35); `release` is the one-pole tau, bind.ts L122). C17 wants <= .5, so the table uses .30 s (.46). dsp G6.1 allows >= .3 s.
- `drop` + `flare` repeat the lasers' `climax` + `burst` pair (lasers.ts L564-565, L576-577).
- If Decision 2 is "no", only the `presence` row changes (source `band8` + a rig-side kick mask). The contract stays.
**Scene states**
```mermaid
stateDiagram-v2
  [*] --> Coil: W = 0
  Coil --> Coil: bass absent for 1 bar or more, W rises, W stays above build
  Coil --> Release: presence returns, W at least .06
  Coil --> Groove: presence returns, W under .06, no whip
  Release --> Groove: W to 0 within 2 beats, loop 1 beat, crack within 1 beat
  Groove --> Coil: bass absent for 1 bar or more
  Groove --> Release: drop rise, no whip in the last 2 s, +15 % pump
```
- One whip per drop: a `drop` rise within 2 s after a whip only flares (recipe 5, C14).

**How each variant draws it**
| Item | A mesh + depth | B raymarch | C strip impostor |
|---|---|---|---|
| Lens, flutes, ripple | VS: the lens outline, 24 sides from `gl_VertexID`. FS: flutes + ripple as analytic bump from (u, side angle). Vertex ripple only when `zoom` > 1 (384 rings) | a 2D lens SDF in the twisted frame per step; bump at the hit | FS: the view ray against the local lens cylinder (2 quadratics); the same bump |
| Taper, coil 0.8-4 | per-ring `halfWidth` and positions | <= 32 joints + radii as uniforms | per-ring screen half-extent from the rig |
| Occlusion | depth test LESS, back faces culled | per pixel, free | painter: CPU sort far -> near, blend over |
| Edge AA | mode M: MSAA 4x resolve, alpha = coverage. Mode S: edge smooth after the tone map | closest-approach coverage | analytic edge alpha |
| Chrome | shared GLSL `studio(r, rough)`: a key strip, 2 rim strips and a fog bounce as smoothstep bands in the world-space reflection (the structure of liquid-chrome.fs L36-44; no sky, no horizon). Schlick rim. One tangent-aligned lobe per strip gives >= 3 lines (C3). `rough` widens the bands (research §1.3), and so does `fwidth` of the reflection (no highlight crawl) | the same block | the same block |
| Fog | FS depth fog from the view distance over `nearDist`; fog background, glow band and dither in the composite | the same; fog from the ray length | as A |
| Gills, heat | FS: trough mask x heat ramp (per-ring `heat`); fringe = the mask's outer band. Core glow = an additive billboard on the coil axis + an axis light term | the same at the hit; glow summed along the ray | as A; the glow sits between the far and near segments |
| Whip, crack | the rig moves the rings; a `heat` 6x band rides the loop | the joints move; 32 joints cannot hold the loop | the rig; strips fold at the loop |
| Sparks, glints | additive instanced quads, depth-tested, no depth write (the lasers.ts L582-617 pattern) | a second additive pass, no occlusion | additive, drawn last, no occlusion |

### Variant A: mesh + depth (recommended; the simplest that meets the spec)
A standard opaque mesh with a depth test. No sort, no impostor math. The same file count as B and C.
```mermaid
flowchart LR
  IN["v, f.sync, f.dt"] --> RIG["rig.step"]
  RIG -->|"rings 192 x 16"| BODY["body: instanced segments, depth LESS, cull back"]
  RIG -->|"parts N x 12"| PART["core glow, sparks, glints: additive, depth test, no write"]
  BODY --> FB[("own FBO: RGBA16F + DEPTH24, x4 in mode M")]
  PART --> FB
  FB -->|"blit (mode M)"| TA[("tA HDR, a = coverage")]
  TA --> DS["1/4 box, threshold HDR 1"] --> BL["1/8 blur H, V"]
  TA --> CMP["composite: fog bg, shock ring, body, glow, tone map, dither"]
  BL --> CMP --> OUT[("engine target")]
```
- Depth lives in the native's own framebuffer only; `renderTarget` (engine.ts L80) and the engine targets stay depth-less. Two AA modes, A/B'd at the spike. Mode M: two multisampled renderbuffers (RGBA16F, DEPTH_COMPONENT24), resolved by `blitFramebuffer` into a `renderTarget(true)`; about 15 raw WebGL2 lines. Mode S: one DEPTH_COMPONENT24 renderbuffer on that target (about 6 lines) + a 4-tap edge smooth in the composite, after the tone map. Both follow `f.width` / `f.height` and are deleted in `dispose`.
- ⚠️ Assumption, needs confirmation (mode M): Chrome (ANGLE) accepts MSAA on RGBA16F with EXT_color_buffer_float (engine.ts L22). The spike checks `getInternalformatParameter(RENDERBUFFER, RGBA16F, SAMPLES)`. Without the extension the format is RGBA8, as in `renderTarget` (engine.ts L81).
- Body draw: one ring buffer bound twice with a one-ring offset (divisor 1), so an instance is the segment between ring i and ring i+1 (the attribute pattern of lasers.ts L590-594). 192 x 24 x 2 = 9216 triangles, up to about 100 px² each at Groove scale.
- Frame order: clear colour + depth -> body -> core glow + particles (blend ONE, ONE on rgb; alpha untouched) -> restore the GL defaults (depth test off, cull off, depth mask on) -> blit (mode M) -> 1/4 box -> 1/8 blur (`BLUR` from isobars.ts, as lasers.ts L14) -> composite into the engine target (lasers.ts L602, L640-642).
- Composite: the fog background + glow band + shock ring (x `shock`), the body over them (premultiplied), + glow, the lasers max-channel tone map (lasers.ts L543-544), hash dither (L545-546).
- Tile mode (`size` given, scene.ts L11-12): 64 rings, mode S.
- Reuse: own code only (the lasers.ts pipeline, isobars.ts `BLUR`, view.ts, the `env()` structure of liquid-chrome.fs, the helix frame of wireform.ts L60-69). `NOISE` (webgl-noise, MIT) only if the haze noise is built. Not used: matcaps (no licence, research §4), TD snippets.

| Cost part (A) | Basis | Normal ms | Slow ms |
|---|---|---|---|
| Frame: clear + 1/8 chain + composite | b1 loud minus its thin beam fill (⚠️ the split is not measured) | 1.3-1.6 | 2.2-2.6 |
| Body FS: about 2x a b3 shader x coverage (Groove 26 %, cap 35 %) x overdraw <= 1.5 | b3 | 0.5-1.0 | 0.9-1.7 |
| MSAA 4x + depth + resolve (mode M) | none in the repo (⚠️ assumed) | 0.3-0.8 | 0.5-1.3 |
| Core glow + particles | b1 (thin fill) | <= 0.1 | <= 0.2 |
| **Total p95 at the drop, mode M** | | **2.2-3.5** | **3.7-5.8** |
| **Total, mode S** (edge smooth 0.1-0.2 ms slow instead of MSAA) | | **2.0-2.8** | **3.3-4.7** |

**Risks, ranked**
1. Budget in a slow session: mode M centre 4.7 ms, top 5.8 ms; mode S top 4.7 ms. The spike measures both first; the levers are in §4.
2. Look: an analytic studio has no self-reflection and can read as plastic or "1991" (creative §6). Mitigation: roughness contrast, tangent lobes, rim, HDR + glow. The S3 stills gate decides; architecture cannot fix it.
3. Edge quality: the MSAA resolve averages HDR samples before the tone map (WebGL2 has no custom resolve), so edges above about HDR 2x keep some stair-step. Mode S smooths after the tone map but softens the silhouette by about 1 px. The spike compares both on S7 and a 10 s clip.
4. GL state bleed: the first user of DEPTH_TEST, CULL_FACE, depthMask and READ_FRAMEBUFFER; every other native assumes the defaults (isobars.ts L489). Restore after the pass + one harness row: GL state diff = {} after `draw` (the camera K5 precedent, STATE Queue 2).
5. MSAA float support (the ⚠️ above). Fallback: mode S.
6. Lifecycle: renderbuffers are new GL objects. The lasers T-LC and T-CTX rows apply (create / dispose delta 0, context loss).
7. Frames: an RMF recomputed every frame can roll the far end when the curve changes (hence the mid-body anchor). A self-crossing in the whip renders as a clean intersection, not a pop.
- Effort: L (one file about the size of lasers.ts; the rig is about half of it). A second depth scene lifts the renderbuffer lines into `renderTarget` then, not now.
### Variant B: SDF raymarch (no mesh, no depth)
One fullscreen pass marches a twisted-lens tube. Occlusion, edge AA and fog come free. It does not fit R2; it is listed because the brief asks for the evaluation.
```mermaid
flowchart LR
  IN["v, f.sync, f.dt"] --> RIG["rig.step: spine as 32 joints"]
  RIG -->|"uniform arrays: joints, radii, twist, heat"| RM["fullscreen march at 1/2 res: lens SDF, shade, fog, alpha"]
  RM --> TH[("tH HDR, 1/2 res")]
  TH --> BL["1/8 blur H, V"]
  TH --> CMP["composite: upsample, fog bg, glow, tone map, dither"]
  BL --> CMP --> OUT[("engine target")]
```
- Cost at full res: an analytic-helix SDF is about 60 arithmetic ops per step x 48 steps, about 25x the per-pixel work of a b3 shader (my estimate), on about half of the pixels: about 12 ms normal, 20 ms slow. A polyline spine (32 joints, one capsule test each) costs 5-10x more; research §1.2 derives 4 x 10^9 capsule evaluations per frame. b4 points the same way: 48 cheap iterations on 1/4 of the pixels billed 20.4 ms.
- At 1/2 res: about 3 ms + the frame 1.5 ms = 4.6 ms normal, 7.6 ms slow. The 4-6 px highlight lines (C3) and the sharp silhouette (creative §6) do not survive 1/2 res.
- The drop recipe needs a free-form spine (loop, crack, kink). An analytic helix cannot hold it, and 32 joints are too few for 4 turns plus a loop. The twist makes the distance inexact, so the steps shrink (research §1.2, ⚠️ unverified there).
- Reuse: `fCapsule`, `donor/hg_sdf/hg_sdf.glsl` L325-326 (MIT OR CC-BY-NC-4.0; keep the header). Sparks need a second additive pass with no occlusion.
- Effort: M. Verdict: not viable inside R2.

### Variant C: sorted strip impostors (no depth, no MSAA)
The body is one camera-facing strip, 2 vertices per ring. The FS intersects the view ray with the local lens cylinder, shades it and fades the edge. The CPU sorts the segments far -> near.
```mermaid
flowchart LR
  IN["v, f.sync, f.dt"] --> RIG["rig.step + sort far to near + screen half-extent per ring"]
  RIG -->|"segments N x 32, sorted"| IMP["impostor pass: ray vs lens cylinder, edge alpha, blend over"]
  RIG -->|"parts N x 12"| PART["core glow between far and near; particles last"]
  IMP --> TA[("tA HDR, no depth")]
  PART --> TA
  TA --> BL["1/4 box, 1/8 blur"] --> CMP["composite as A"]
  TA --> CMP --> OUT[("engine target")]
```
- No new GL feature: blending only, as every scene today (isobars.ts L489). Analytic edge AA at no cost. Instances are self-contained (2 x RING) because the sort reorders them. Reuse as A.
- Cost: the frame 2.2-2.6 ms + body 1.0-1.9 ms (FS about 2.3x b3; back to front, so no early-z) + particles 0.2 ms = 3.4-4.7 ms slow, 2.0-2.9 ms normal. The cheapest path.
- Risk 1 (HIGH, at the climax): a painter sort pops where the body crosses itself or where two parts lie within one segment length in depth. That is the whip loop and the crack (S5, C2).
- Risk 2: strips fold on the inside of tight bends and degenerate where the tangent points at the camera. The local-cylinder model fails there (the loop, the snap kink).
- Risk 3: the most shader math of the three and the hardest to debug. Sparks and glints get no occlusion.
- Effort: L. Prefer C only if both AA modes of A fail the spike.
## §3 Comparison
| | A mesh + depth | B raymarch | C strip impostor |
|---|---|---|---|
| R2 estimate p95, normal / slow (ms) | mode M 2.2-3.5 / 3.7-5.8; mode S 2.0-2.8 / 3.3-4.7 | 12 / 20 (1/2 res: 4.6 / 7.6) | 2.0-2.9 / 3.4-4.7 |
| Occlusion | exact, also at a self-crossing | exact | pops at crossings |
| Edge AA | MSAA 4x (cost unknown) or a post edge smooth | analytic | analytic |
| Whip, crack, kink | free-form rig | too few joints | strips fold or degenerate |
| Full-res look (lines, silhouette) | yes | no at 1/2 res | yes, outside the failure cases |
| New GL features | depth renderbuffer (+ MSAA and blit in mode M) | none | none |
| New files | scene + test | scene + test | scene + test |
| Effort | L | M | L |
## §4 Recommendation and lever chain
**Variant A.** It is the only path that is exact on occlusion at the whip and keeps the full-res look. It uses a standard pipeline: an opaque mesh, a depth test and the Rave Lasers post chain. In a slow session its cost sits on the 5 ms line in mode M (centre 4.7 ms) and under it in mode S (top 4.7 ms, 4.5 ms with L1). The one unknown, MSAA, is measured at the start of the spike. B cannot meet R2. C is the fallback only if both AA modes of A fail.

**Lever chain if over budget** (in this order; the savings are slow-session estimates)
- L1 Draw the instances near -> far (CPU sort of 192 keys; instances become self-contained): early-z, -0.2 to -0.4 ms. Look-neutral.
- L2 Mode M only: MSAA 4x -> 2x, -0.2 to -0.5 ms.
- L3 Mode M -> mode S, if its edges passed the spike A/B: -0.4 to -1.1 ms against 4x.
- L4 Creative cut 1, fringe off: about -0.1 ms.
- L5 Creative cut 2, sparks 120 -> 60: up to -0.1 ms.
- L6 Creative cut 3, haze noise off: about -0.1 ms (if it was built).
- L7 Drop the far blur and keep the near tent: -0.1 to -0.2 ms.
- Never: the highlight lines, depth fog, occlusion, gills, the drop recipe (creative §2 L52).
- Rule: one lever per measurement, each recorded with its measured delta (CLAUDE.md § Task tiers, the performance flow). Stop at p95 <= 5 ms in a slow session.
- Haze noise: a contrast <= 4 % on a 3-8 % background is <= 0.8 / 255, under one 8-bit step. Build it last, as value noise inside the composite (0 extra passes), or not at all (the creative-director's call).

**Acceptance mapping** (all variants unless marked)
- R1, C1: stills S1-S10 from a live pass. `orbit`, `yaw`, `pitch` and `zoom` give the angles A / B and the close-up.
- R2: the cost tables + the lever chain.
- R3, C15: only `flare` is flash-class (`flashGate`, post.ts L46-58). Rings, snaps and glints stay local (<= 5 % of the frame, by size). The rig's JS stays well under 0.1 ms (192 rings).
- R4, R6, C6, C7: `state().twist` and `.ripple` against the bound `bass`, r >= .80 (the lasers T-C12 method, STATE RL S5.3). `flare`: r >= .60.
- R5, C12-C14: the release state machine, read from `state().turns`, `.spanFW`, `.whips`. C13 from frames.
- R7: one built-in. C2: lens + flutes + twist; overlap by depth (A), march (B) or sort (C).
- C3, C4: `studio()` + tangent lobes + rim. HDR stays in RGBA16F until the tone map. A cavity term (>= 60 % darker). Floor tone `#070A10`.
- C5: fog background 3-8 %, depth fog <= 25 % at 3x `nearDist`, hash dither.
- C8-C10: rises on float inputs with attack 0 / release 0, on the same frame. Counts in `state()`.
- C11: the `W` rules + the kick-proof `presence`. C16, C17: `state().speed`; row-1 release .30 s. C18: no wall clock, no `Math.random`.
## Decision needed
1. Variant: **A** (recommended) or C. B is not viable.
2. `reeseLevel`: add it (light SDLC §4, audio-dsp first), or ship on `band8` with a scene-side kick mask (no analyser change; a 4-frame delay and its own tuning).
3. The C12 reading: "<= 3 frames after `presence` crosses θ". A bass that returns on a kick then starts the release up to 0.2 s + 3 frames after the true onset. Confirm it, or route it to the creative-director.
4. Spike gates, in this order: AA mode M against mode S (billed delta + edge quality on S7 and a 10 s clip), the billed +flash p95 at Groove coverage, the stills. The user gate is the S3 stills sheet, not this pick.
## Signal-gap answers
### SG1: a kick-proof bass presence -> `reeseLevel`, for presence only
- Two uses: absence -> `W` (row 12, C11) and return -> release (row 14, C12, C14).
- No listed signal is both kick-proof and inside 50 ms when the bass returns on a kick. `band6` / `band8` are immediate but pump with the kick (dsp G6.1). `raw.reese` is kick-gated at hop rate (features.ts L62-67) but holds for `HOLD` = 0.2 s after every kick: "a bass note that starts on a kick shows HOLD late" (L63; L19-22). `sub`, `reese` and `wobble` share that hold (L67).
- Answer: bind `presence` to a new `reeseLevel`. (1) During a lone kick it reads the held pre-kick level, so C11 holds by construction, with no θ tuning against the pump. (2) The best truth r: .53-.74 at 0.1 s and .67-.83 per bar, against .47-.73 for `band6` / `band8` (dsp §2.1, G6.2). (3) About 5 product lines that expose a value already computed and already used by the classifier and the arrangement (features.ts L55-57).
- The body rows 1-4 stay on `band8` (the lead-confirmed R6 reading): the ignite (0-60 ms, recipe 1) needs the ungated band. Side effect: a lone kick in a drum-only build bar blips the twist and the ripple for about .3 s. ⚠️ A creative call at the spike: keep it as the build shiver, or scale rows 1-2 by presence (the ignite is then up to 0.2 s late on a kick).
- Timing: a return without a kick starts the release within 1 hop + 1 frame. With a kick (the usual drop) it starts at +0.2 s. The loop then reaches the head near +0.55 s and the crack ends near +0.9 s, so the late `drop` (+0.3 to +0.7 s) still lands on the loop or the crack (recipe 4).
- θ is relative: present = `presence` > θ x peak, where peak is a slow max-hold of `presence` in the rig (decay about 30 s, ⚠️ knob). Line-in gain and the source's scale then do not move it. Default θ = .25 (⚠️ until Research gap 1).
- Alternative (a), `band8` + a scene-side kick mask: the `kick` event reaches the scene 27-38 ms p50 and 39-57 ms p90 after the onset (dsp §5 d), while the band rises at once. The mask needs a 4-frame delay line and still waits 0.2 s on a kick: the same latency class, more scene code, its own tuning, a copy of features.ts L62-67.
- Alternative (b), the creative fallback (`W` from `build`, the release from `drop`): `build` gives no ramp before 6 of 9 drops and `drop` is absent on 3 of 9 (dsp TL;DR). The build story is lost on most drops.
- SDLC §4 cost: not a detector change. No detector, gate, band, threshold or timing changes, and every existing source stays bit-identical. It is an additive source-contract change (`SOURCE_IDS` is pinned by bind.test.ts L66-67, L75-78). Light §4, audio-dsp leads: (1) a fixture, reese on / off / kick-only (kick-only reads 0; a bass that starts on a kick reads at most `HOLD` + 1 hop late); (2) before / after on the same dataset (3 tracks + 2 arr fixtures, the w4sim dumps): diff 0 on every existing id; (3) the r table for the new id; (4) the 0..1 scale. Effort S.
### SG2: the bass dip before the drops
- Not answerable from the inputs (Research gap 2). The design does not depend on it. No dip and no `build` -> `W` stays under .06 -> no release; the `drop` rise then launches the whip from Groove with the +15 % pump (recipe 4). R5 and C13 stay UNKNOWN on such drops (dsp G7). The S9 caption carries the bars of absence.
### SG3: `drop` absent on 3 of 9 drops, late on the rest
- `drop` feeds only the flare and the fallback whip. On a drop without it, recipe steps 1-3 run alone, so C13 must be reachable without step 4. Spike check: one Sub Focus drop (0 of 3 fire there, dsp §2.1).
- For the test-architect: the app-wide drop flash (post.ts L12-13: white mix .8, decay .1 s) lands on the crack frame. C15 "clipped white <= 20 %" is measured with it.
### SG4: growl timbre
- Accepted as specified. The ripple height comes from `B`, the travel from `f.sync.beat` (the monotone integrator, §2.0), the burst from the larger of `reese` and `wobble`. No growl source is needed. C7 measures against `B`.
## Research gaps
1. θ data (SG1): the level distributions of `raw.reese` and `band8` in drum-only bars against bass bars, and at the first 3 frames of each audit drop against lone build kicks. Owner: audio-dsp, from the existing dumps (`scratchpad/dsp/`).
2. SG2: the bars of bass absence before each of the 9 audit drops. The same run as gap 1.
3. MSAA on RGBA16F renderbuffers: the support and the billed cost on ANGLE-Metal, and on ANGLE-D3D11 for the Windows stage. Owner: the spike.
4. The `reeseLevel` scale: `raw.reese` is linear and not normalised (features.ts L55-56). Owner: audio-dsp.
5. The session speed of the b3 numbers, and the split of b1 between beam fill and composite. Both widen the A estimate; the spike replaces them.
