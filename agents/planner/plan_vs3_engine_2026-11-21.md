# Plan: vs3 engine, Variant A amended (macros, post chain, palettes, full presets)

## TL;DR
- 19 steps in 4 checkpoints: 15 coder steps, 1 lead step (S8.1), 3 conditional steps (S3b.1 + S3b.2 if gate W fails; S8.2 if a gate needs a lever).
- The order is the design's «Step plan, rev 2»: the C5 fix, the pure chain with the light limiter, the first 4 light knobs, the warp + macros, (the servo), legacy copies, the lens, grain + hue drift, full presets + MIDI `'*'`, the final gates.
- N1–N6 and the residuals C4, C8, C12 are folded into named steps and test IDs (§ Folded amendments). Every lead-run gate has a command, pass lines and an exit code (§ Gates).
- CP2 ends with the user's check: one hot preset (Magmatic Eye) in the app on a kick-heavy track. No stills are sent.
- This run has no append tool. The plan is 24 part files: this one, then `.p02.md` … `.p24.md`. Join them in number order; no heading needs a new level.

## Freshness
- 2026-11-21, planner (Fable 5.2). Source commit `803abb2` (branch `dev`: `320d418` + the STATE commit). 913 tests on `dev`.
- Inputs of the brief: `thoughts/spec_vs3_engine.md` l. 1-60; `agents/system-designer/design_vs3_engine_2026-11-21.md` l. 121-265 and 460-900; `agents/architecture-skeptic/skeptic_vs3_engine_2026-11-21.md` l. 108-200; `agents/STATE.md` HEAD.
- Read outside the brief's ranges, with the reason:
  - The design's l. 1-120 and 400-459: S1–S7, the gaps G1–G9 and the old step plan. Variant A and rev 2 cite them by name ("old step 2", S4, S5).
  - `web/src/vs3/host.ts`, whole: 7 steps change it; its 38 rows become S2.1's fixture.
  - `web/src/gl/engine.ts` l. 56-125, 196-253; `gl/scene.ts` l. 1-22; `gl/live.ts` l. 880-897; `gl/post.ts` l. 40-105: N2's frame counter, C12's size, `programAsync`, `heatStep`.
  - `web/src/director.ts` l. 56-89; `library.ts` l. 72-93; `midi.ts` l. 1-80; `app.ts` l. 556-581; `web/scripts/vs3-presets.mjs` l. 1-90: the edit points of S0.1, S4.1, S7.2, S2.1.
  - `scratchpad/vs3/cost.mjs`, `scratchpad/vs3-look/flash3.mjs`, `scratchpad/vs3-engine/g1.txt`, `scratchpad/vs3-engine/skeptic/g1b.txt`: the gate commands and the preset numbers.
- Not read: the donor (each step names the lines its coder reads as text), `ui/Panel.tsx`, `ui/Midi.tsx`, `scenes/builtin.ts`, `scratchpad/donor-mode/lib.mjs`, the copied kit scenes.
- No product code and no existing artifact was changed.

## Chosen variant
- **Variant A, amended.** `agents/system-designer/design_vs3_engine_2026-11-21.md` § Variant A (l. 121-265), as changed by § Skeptic response (l. 460-900, "rev 2"), plus the recheck fixes N1–N6 (`agents/architecture-skeptic/skeptic_vs3_engine_2026-11-21.md` §4, l. 152-160).
- Chosen by the lead on 2026-11-21: `agents/STATE.md` HEAD, «VS3 ENGINE: LEAD PICK = Variant A, amended (rev 2 + skeptic recheck N1–N6)»; commit `803abb2`.
- Lead calls taken as given: per-scene macros; `decay` dropped; custom palette out; the 3 extra limiter legs stay; the limiter ships before the first light knob; `DYN` 1; step 3b may lift the "adaptive exposure" non-goal if gate W fails; no test-architect; the user's gate = one hot preset in the app after step 3.

## Parts
| File | Sections |
|---|---|
| `.md` | TL;DR, Freshness, Chosen variant, Parts |
| `.p02`–`.p04` | Conventions, Deviations; Folded amendments; The light limiter, final text |
| `.p05`–`.p07` | Checkpoints CP1–CP4; Order and lanes |
| `.p08`–`.p09` | Gates H2, W, P, luma check |
| `.p10`–`.p21` | Steps S0.1 … S8.2 |
| `.p22`–`.p24` | Acceptance mapping; Research gaps; Gate record |

## Conventions (every step)
- One step = one `frontend-coder` dispatch (Opus 5.5 max) in its own worktree. The worktree starts from `master`: run `git merge dev` first. The coder commits on its branch; the lead merges into `dev`.
- Done-check of every step ("gates"): `cd web && npm run lint && npm run typecheck && npm test`, all exit 0, plus the step's own check.
- A planned test's name starts with its ID, for example `test('L7 react before the slew: ...')`. Then `npx vitest run -t "L7 "` selects it.
- Paths are under `web/` unless they start with `scratchpad/`, `donor/` or `agents/`. Scratch scripts are evidence code (git-ignored); they are written with `ponytail` too.
- Donor code is read as text and rewritten in TypeScript or GLSL. It is never executed. Each ported block keeps the credit line `vs3: the friends' three.js engine, used with permission (2026-11-19)`, the donor file and lines, and any header the donor file itself carries.
- No step adds an npm dependency.
- One browser check per coder step, on the coder's own dev port (`:5175` or `:5177`), never the user's `:5173`.
- Plan against reality: the coder writes `**Changed during implementation:** <what & why>` in its report.
- At most 2 agents at once. § Order and lanes names the pairs. Merges into `dev` go one at a time.
- "Design l. N" means `agents/system-designer/design_vs3_engine_2026-11-21.md`, line N. "Skeptic l. N" means `agents/architecture-skeptic/skeptic_vs3_engine_2026-11-21.md`, line N.

## Deviations from «Step plan, rev 2» (planner's calls; the lead may veto each)
1. **S0.2 is new: the gate harnesses.** Rev 2 defines gates H2, W and P. No step builds a runner for value rows, pair counts, the washout marks or the governor check. S0.2 builds them and the lead captures the pre-step baselines with them.
2. **The lens uniform maths moves from step 1 to S5.1**, with its tests (re-seats only on `onKick`; at most 3 seeds per second). The lens shader arrives in S5.1, so the two are verified together. The limiter's lens leg and the style duck stay in step 1 (S1.2).
3. **One hot preset carries its look from S3.3**, not from step 7. The user's check needs a preset to pick. Step 7 (S7.1) maps the rest.
4. **C12's draw size lands in S3.2**, not in step 2 (skeptic l. 199). In step 2 the parameter has no reader; the 3 chain targets arrive in S3.2.
5. **`reactTo()` is new** (S1.1). The host's react write (design l. 601) becomes one pure, tested function. The 4 macros then cost the host one call, so they ship with the warp in S3.2, as rev 2's step 3 says.
6. **Contract deltas** against the design's Contracts (A) rev 2. Each is needed by a recheck fix:
   - `KNOBS` object and an optional `knobs` argument of `frame()`: L8 must run with `REACT_MAX` 1.5.
   - `ChainState.reset`, `ChainState.stale` and `clock()`: N2. They replace `fresh`.
   - `ChainState.hot0`: N1 (see § The light limiter).
   - `KNOBS.VIG_S` and `SceneFacts.vigRange`: N5.
   - `createChain(gl, w, h)`: C12.
   - `gl/engine.ts` leaves the design's "no change" list: two one-line exports (`engineFrame`, `shotSize`).

## Folded amendments (where each recheck item lands)
Source: skeptic §4, l. 136-199. Test IDs are Vitest names unless marked "gate" or "harness".

| Item | Lands in | Tests / gate |
|---|---|---|
| N1: react before the kick's slew; `REACT_MAX` caps the react-gain target | S1.2 (the rule); S1.1 (`reactTo`); S2.2 (the host calls it) | L7, L8, D11 |
| N2: one `reset` flag from an engine frame counter, not wall time; the history's `stale` flag apart | S1.1 (`stale`); S1.2 (`reset`, `clock()`); S2.2 (`engineFrame()` in `gl/engine.ts`); S3b.1 (`e` snaps on `reset` only) | N2a, N2b, N2c, N2d, D9, E6; gate: H2 S-cut with 1 s holds |
| N3: the servo never lifts (`e` at most 1); it skips a scene whose `faithful()` is true | S3b.1, S3b.2. Precondition of 3b. | E2, E3; gate W with `LOW=1` |
| N4: NaN guards on the two recursive light states | S1.2 (glow, signal); S3b.1 (probe, update) | N4a, N4b, E4, E7; harness E8 |
| N5: WCAG pair count in H2; S-jump at 8 jumps per second; the vignette leg at 1 s | S0.2 (`flashPairs`, `h2.mjs`); S1.2 (`VIG_S`); gates G2, G3, G5 | FP1–FP6, N5a; gate: H2 rule (c) |
| N6: the same clamp at 1 on the stock side | S1.2 | L1b |
| C4 residual: hold the governor's scale in P; log the renderer | S0.2 (`p.mjs`); gates G3, G5, G8 | gate: P is VOID unless `minScale` 1 and `governed` 0 on both arms |
| C8 residual: `chainOffForLegacy` inside `own()` | S4.1 | C8a–C8f |
| C12 residual: the draw size into `start()` | S3.1 (`createChain(gl, w, h)`); S3.2 (`create(gl, size)`, `shotSize()`) | C12a, C12b, C12c, C12d; gate: C12-cue |
| C3 residual: W2 for the 3 default rows is judged against the pre-step build | § Gates W; S0.2 baselines | gate W, `BASE=` |
| Planner note 1: show one hot preset in the app on a kick-heavy track | S3.3; CP2 demo | the user's check |
| Planner note 2: the bottom of brightness's range is at least 1.36 | S2.1 | K4 |
| Planner note 3: H2 S-jump on brightness, bloomMul, vignette already in step 2 | gate G2 | gate: H2 S-jump(2) |
| Planner note 4: the probe test needs one line-art scene | S3b.2 | harness E5 on Vesica |

Unchanged from the design and carried as written: C5 (S0.1), C7 (S7.2), C9 (per-scene macros; one line to the user at CP2), C10 (S1.1, S3.1, S6.1), C11 (S3.1, S5.1).

## The light limiter, final text
Design Amendment 1 (l. 513-646) with N1, N2, N4, N5, N6 folded (skeptic l. 155-160). S1.2 implements exactly this, inside `frame()`, once per draw. `v` = the node's values, `sc` = `SceneFacts`, `b` = `sc.bloom`, `K` = `knobs`, `L` = `st.light`.

```
x   = K.LIGHT_X ** dtl                               // 1.0234 at 60 fps
a   = dtl / K.KNOB_S                                 // 1/30 at 60 fps
en  = s.energy >= 0 ? min(1, s.energy) : 0           // N6: clamp at 1. N4: NaN reads 0
h   = hit >= 0 ? min(1, hit) : 0                     // N4
if (st.reset) { st.light = null; st.stale = true }   // N2. stepSym and stepTiles snap on this frame too;
                                                     // frame() clears st.reset when it returns
react = toward(L.react, min(v.react * 2, K.REACT_MAX), a * 2)          // N1, part 2
hot   = heatStep(st.hot,  reacted(h, react), dtl)    // N1, part 1: the donor's order. cf.kick = hot
hot0  = heatStep(st.hot0, h, dtl)                    // the stock scene's kick (react gain 1)
gain  = clamp(v.brightness, L.gain / x, L.gain * x)
vig   = toward(L.vig, v.vignette, (dtl / K.VIG_S) * sc.vigRange)       // N5
lens  = toward(L.lens, v.lensStyle === st.style ? v.lens * sc.wet : 0, a)
if (lens <= 0.01) st.style = v.lensStyle             // F4: the style swaps at the bottom of the duck
pT    = the effective persist (after `trails`, LATE_TRAILS and the hint; S1.1)
persist = pT >= L.persist ? pT : max(pT, L.persist - a)                // rises freely, falls slewed
k      = (rest + reacted(en, react) * b.gain + hot  * kick) * v.bloomMul * drastic(v.heat)
k0     = (rest + en * b.gain + hot0 * kick) * sc.bloomRow              // the stock scene
target = G  * 9 * k  * k                             // G = gain, G0 = sc.gainBase; both 1 for a filter
stock  = G0 * 9 * k0 * k0
r      = L.stock > 0 ? min(1, L.glow / L.stock) : 1
dyn    = K.DYN * (stock - L.stock) * r               // the stock scene's own move this frame
foll   = (x - 1) * max(L.glow, K.GLOW_SEED)
glow   = clamp(target, L.glow + min(dyn, 0) - foll, L.glow + max(dyn, 0) + foll)
if (!(glow >= 0)) glow = target >= 0 ? target : 0    // N4: the guard of gl/post.ts:51
strength = glow / G                                  // under 1e-3: 0, so the bloom pass skips
st.light = { glow, stock, gain, vig, lens, persist, react }; st.hot = hot; st.hot0 = hot0
```

- `rest` = `b.strength`, or 0 for a filter. `kick` = `b.kick ?? 0.35` (host.ts:237). Without `sc.bloom`: `k` = `k0` = 0.
- `toward(cur, to, step)` moves `cur` to `to` by at most `step`. `reacted(level, g)` = `min(1, level * g)`. `heatStep` is `gl/post.ts:105`, unchanged.
- `L` null (a new native, or `reset`): `st.style = v.lensStyle`, and every limited value equals its target on that frame. `hot` and `hot0` keep their slew.
- The skip tests of design S4 read the limited values. A pass finishes its ramp before it skips.
- `dtl` = real seconds since this native's last draw, at most `K.DT_MAX`. Motion (zoom, spin, `stepSym`, `stepTiles`, the hue phase) reads the layer's `dt`.
- Outputs: `cf.bloom` = `strength`; `cf.finish.uGain` = `gain`; `cf.finish.uVig` = `vig`; `cf.finish.uAber` = `v.aber * (0.22 + hot)` (host.ts:243); `cf.kick` = `hot`; `cf.react` = `react`; the warp's persist = `persist`; the lens amount = `lens`.

Planner's folds, beyond the skeptic's text:
- **`hot0`.** With react applied before the slew (N1), `hot` carries the react gain. The stock reference then needs its own slewed kick. At a constant react gain of at most 1, `hot` = gain × `hot0`, because `heatStep` is homogeneous. L1 and L2 are therefore unchanged. ⚠️ Assumption, needs confirmation (lead): no design text names `hot0`.
- **`en`, `h` read NaN as 0.** The skeptic's glow guard alone leaves `L.stock` at NaN for one frame. The next frame's bounds are then NaN, and the glow takes its target unlimited. Reading NaN as 0 at the entry (the rule of `flashGate`, post.ts:51) closes that. Test N4a.
- **`VIG_S` = 1.** The skeptic's number for the vignette leg (l. 159): 0.4 × range luma per second, the same budget as `uGain`. Test N5a holds the two-fader pump under 3 pairs per second.

## Checkpoints

### CP1: the limiter and the first light knobs (design steps 0, 1, 2)
Steps: S0.1, S0.2, S1.1, S1.2, S2.1, S2.2. It is the thinnest end-to-end slice: audio in → a vs3 scene whose brightness, glow and vignette the user moves, with every light move limited.

**Frozen contract** (later steps rely on it; it wins over the design's Contracts (A) where they differ):
```ts
// vs3/chain.ts, pure part
export const KNOBS = { LIGHT_X: 4, KNOB_S: 0.5, VIG_S: 1, DYN: 1, GLOW_SEED: 1, DT_MAX: 1 / 60, REACT_MAX: 2 }
export type Knobs = typeof KNOBS
export const drastic: (p: number) => number                    // 4 ** ((p - 0.5) * 2)
export const reacted: (level: number, gain: number) => number  // Math.min(1, level * gain)
export type LookKey = 'react' | 'chaos' | 'trails' | 'heat' | 'mirror' | 'tiles' | 'twist' | 'slice' | 'spin'
  | 'persist' | 'zoom' | 'bloomMul' | 'lens' | 'lensStyle' | 'aber' | 'vignette' | 'brightness' | 'hueDrift'
export type LookValues = Record<LookKey, number>
export interface SceneFacts {
  bloom?: { strength: number; gain: number; kick?: number }
  hint?: { mirror?: number; persist?: number; steady?: boolean } | null   // signal only
  wet: number; grain: number; lateTrails: number; filter: boolean
  bloomRow: number; gainBase: number; vigRange: number   // the row's bloomMul, base.brightness, the width of vignette's range
}
export interface Light { glow: number; stock: number; gain: number; vig: number; lens: number; persist: number; react: number }
export interface ChainState {
  angle: number; drift: number; seed: number; hue: number
  hot: number; hot0: number; style: number
  reset: boolean; stale: boolean; light: Light | null
  sym: { from: number; to: number | null; w: number; next: number | null }
  tiles: { y: number | null; v: number }
  rips: Float32Array; rip: number
}
export function chainState(): ChainState   // reset true, stale true, light null
type Uniforms = Record<string, number | readonly number[] | Float32Array>
export interface ChainFrame {
  mirror: boolean; feedback: boolean; warp: Uniforms
  bloom: number                 // the limited strength; 0 = skip
  lens: Uniforms | null         // null until S5.1
  finish: { uAber: number; uVig: number; uGain: number; uGrain: number }
  kick: number; react: number   // `hot`; the limited react gain
}
export function frame(v: LookValues, sc: SceneFacts, s: Readonly<Signal>, hit: number, st: ChainState,
  palMid: readonly number[], dt: number, dtl: number, t: number, aspect: number, knobs?: Knobs): ChainFrame
/** Writes the reacted signal for the scene: s.kick = cf.kick; the levels the donor scales, times cf.react, each at most 1. */
export function reactTo(s: Signal, cf: ChainFrame): void
/** The host's prelude. dtl: real seconds, at most DT_MAX. reset: this native was not drawn on the previous engine frame. */
export function clock(now: number, seen: number, engineFrame: number, drawnFrame: number): { dtl: number; reset: boolean }

// gl/engine.ts
export const engineFrame: () => number   // the count of render() calls
// vs3/pairs.ts
export function flashPairs(t: ArrayLike<number>, luma: ArrayLike<number>): { total: number; max1s: number }
```
- `Signal` is `vs3/host.ts`'s (host.ts:35), imported as a type only.
- `vs3/look.json`: `{ base: Record<LookKey, number>, ranges: Record<LookKey, [min, max]>, scenes: Record<nativeName, Partial<base>>, lateTrails: Record<nativeName, number>, lensStyles: string[] }` (7 names).
- The look inputs live on every `native/vs3-*` node: `group: 'look'`, named as the `LookKey`s, defaults `{ ...look.base, ...look.scenes[name] }`, ranges `look.ranges`. Shipped at CP1: `bloomMul`, `aber`, `vignette`, `brightness`.
- `FINISH` (host.ts:91-103) takes `uGain` in place of the literal 1.4.

**User-verifiable demo (CP1):** `cd web && npm run dev`, open http://localhost:5173/, play a track, pick vs3 Ink, open E → the «look» group.
1. At the defaults the picture is the one of the build before.
2. Click the `brightness` slider from its default to the top: the picture brightens over about 0.4 s, not in one frame. Undo: it dims over about 0.4 s.
3. Drag `vignette` and `bloomMul`: the edges darken, the glow grows and falls smoothly. No click makes a flash.
4. Arm a set with two cues of the same scene: at the bar line no fade starts, and the cue counter steps on.

### CP2: the warp, the macros, the washout answer (design steps 3, 3b, 4)
Steps: S3.1, S3.2, S3.3, S4.1, and S3b.1 + S3b.2 if gate W fails.

**Frozen contract:**
```ts
// vs3/chain.ts, GL part
export function createChain(gl: WebGL2RenderingContext, w: number, h: number): {
  /** src (w x h, HDR) through warp, bloom, lens. Returns the texture the finish reads. */
  apply(src: WebGLTexture, w: number, h: number, f: ChainFrame, bloom: ReturnType<typeof createBloom>): WebGLTexture
  dispose(): void
}
export function warmChain(): Promise<unknown>   // programAsync of the chain's programs
// gl/engine.ts
export const shotSize: () => readonly [number, number]   // the shots' size = a res-1 layer's draw size
// library.ts
export function chainOffForLegacy(doc: SceneDoc): SceneDoc   // called inside own()
```
- The chain owns three half-float targets, allocated in `createChain`: `hist[0]`, `hist[1]`, `lensRT`. The warp writes `hist[w]`. The lens (CP3) writes `lensRT`.
- Look inputs shipped at CP2 (15 of 18): CP1's four, plus `mirror` (a `long`, 0..12), `tiles`, `twist`, `slice`, `spin`, `persist`, `zoom`, `trails`, `chaos`, `heat`, `react`.
- The vs3 built-ins carry `fx: []`. The chain is their only mirror and feedback.
- If 3b ships: `export function expose(e: number, mean: number, target: number, dtl: number): number` (the law, `e` in .6–1) and the `FINISH` uniforms `uProbe`, `uExp`.

**User-verifiable demo (CP2) = the user's check.** No stills are sent; the lead reports in words.
1. `cd web && npm run dev`, open http://localhost:5173/, load a kick-heavy track from `tracks/` (Kanine, the H2 track).
2. Pick vs3 Morphogen 2.0, open W, pick `★ magma — Magmatic Eye` (the donor's `★ morphogen 2.0 · magma — Magmatic Eye`: heat .98, brightness 2.4). Watch 30 s across a drop.
3. He should see: the preset's hot glow level, arriving within about 2 s of the pick; trails under the glow; a kick pump about as big as the stock scene's (the `DYN` 1 trade-off: smaller than the original's); no flash.
4. The lead adds one line: a macro set on one scene does not follow to the next scene (C9).
5. Answer: ok / not ok.
   - "Not ok" on the pump → S8.2 with the lever `DYN` up, while H2 S-stress and P-hot-1 hold.
   - "Not ok" on the look → the lead routes it (a fix step, or the designer).
   - S5.1, S5.2, S6.1 and S7.1 wait for "ok". S4.1 and S7.2 do not wait.
6. If 3b was built, the check runs after S3b.2, so he judges the picture that ships.

### CP3: the lens, grain, hue drift (design steps 5, 6)
Steps: S5.1, S5.2, S6.1.

**Frozen contract:**
- All 18 look inputs are shipped: CP2's, plus `lens` (float), `lensStyle` (a `long`; labels = `look.lensStyles`), `hueDrift` (float).
- `look.lensStyles`' order is frozen: a preset stores the index.
- `ChainFrame.lens` is non-null when the limited lens amount is above .01 and `sc.wet` is above .001. The lens pass writes `lensRT`.
- `FINISH` takes `uGrain`. `ChainState.hue` is the palette's hue phase, in turns.

**User-verifiable demo (CP3):** `npm run dev`, vs3 Ink, E → «look».
1. Set `lens` to 1. Step `lensStyle` through the 7 styles: each change ducks the lens to nothing and back in about 1 s. No cut.
2. Raise `hueDrift`: the palette's hues turn slowly. Back at 0 the phase holds.
3. A dark passage shows fine film grain. vs3 Lasers shows none.

### CP4: full presets, MIDI, the R5 verdict (design steps 7, 8)
Steps: S7.1, S7.2, S8.1, and S8.2 if a gate needs a lever.

**Frozen contract:**
- A factory preset's `Preset.values` may hold any of the 18 look keys, under the input's name; `lensStyle` and `mirror` as numbers.
- `midi.ts`: `ParamTarget.scene: SceneId | '*'`; `createMidi`'s `app` has `ref(layer: number, node: ParamTarget['node']): string | null`.
- `KNOBS` holds the tuned values; the gate record names the commit.

**User-verifiable demo (CP4):** `npm run dev`.
1. vs3 Mandala, W: pick two factory presets one after the other. The whole look (trails, fold, glow, lens, palette) glides in 1.8 s.
2. MIDI menu → learn → touch `heat` in the «look» group → turn a knob. It moves `heat` of whatever vs3 scene is on stage. On a non-vs3 scene it does nothing.

## Order and lanes (at most 2 agents at once)
| # | Lane A | Lane B | Lead gate before the next row |
|---|---|---|---|
| 1 | S0.1 | S0.2 | baselines (after S0.2 merges, on `dev`) |
| 2 | S1.1 | S2.1 | — |
| 3 | S1.2 | S4.1 | — |
| 4 | S2.2 | S3.1 | G2 |
| 5 | S3.2 | — | G3 (gate W decides 3b) |
| 6 | S3b.1 → S3b.2, only if W failed | S3.3 | G3b (if built), G3p, then the user's check |
| 7 | S5.1 → S5.2 | S7.2 | G5 |
| 8 | S6.1 | — | G6 |
| 9 | S7.1 | — | G7 |
| 10 | S8.1 (lead); S8.2 if needed | — | G8, then `tester` (AV QA) |

- File sets in one row do not overlap. `chain.ts` is edited by one lane at a time (S1.1 → S1.2 → S3.1 → S3b.1 → S5.1 → S6.1).
- S4.1 merges before S3.2, or right after it: until then a user copy with the legacy fx doubles its trails.
- S7.2 has no technical dependency after S3.2; it may also run in row 6.
- No spike branch exists for this epic. Every step starts from `dev`.

## Gates (lead-run)
- Evidence per run: commit SHA, command, exit code, output file under `scratchpad/vs3-engine/`. UNKNOWN is never PASS: a void or missing run stays UNKNOWN.
- The harnesses are written in S0.2 over `scratchpad/donor-mode/lib.mjs`, as `scratchpad/vs3-look/flash3.mjs` and `scratchpad/vs3/cost.mjs` are.
- Track: the lead's Kanine file under `tracks/` (`<kanine>`), from 52 s. Never committed.
- A failing gate blocks the step's merge: the lead runs it on the step's branch.

### H2: flash (`h2.mjs`)
`ARGS=--disable-audio-output ANALYSER=<ours|vs3> node scratchpad/vs3-engine/h2.mjs <port> <kanine> scratchpad/vs3-engine/rows/<row>.json`
Env: `SEC` (15), `AT` (52), `BASE=<the out.json of another build>`. Exit 0 = PASS, 1 = FAIL, 2 = timeout or error.
- **(a)** No second holds more than 3 luma steps. A luma step = a frame-to-frame change of the frame-mean luma above .10.
- **(b)** The row's step total is not above its baseline's. A baseline is the larger of two runs.
- **(c)** (N5) Rows S-jump, S-cut, L-jump: no second holds more than 3 flash pairs (`flashPairs`: opposing frame-mean changes of at least .10, the darker side under .8).

| Row | Gate | What runs | Baseline |
|---|---|---|---|
| S-all | G3, G3b | every vs3 built-in at its defaults, analyser `ours`; the 11 S-stress scenes also with `vs3` | the same scene on the pre-step build (`BASE=`) |
| S-jump(2) | G2 | two value sets swapped every 250 ms, then every 125 ms: brightness 2.4 / 1.36, bloomMul and vignette at range top / bottom; Ink, Synapse, Mandala | the scene held at the brighter set |
| S-stress | G3 | heat 1, react 1, brightness 2.4 on the 11 S-stress scenes; once more with bloomMul at its range top | the scene at its defaults |
| S-jump | G3, G3b | S-jump(2)'s sets plus heat .98 / .36; 250 ms on Ink, Synapse, Mandala; 125 ms on the brightest of them | the scene held at the brighter set |
| S-cut | G3, G3b | trails .97 ↔ 0 every 250 ms, and once more with 1 s holds (N2); Ink, Synapse, Mandala | the scene held at .97 |
| P-hot-1 | G3p | S3.3's preset, picked by name | its scene at its defaults |
| L-styles | G5 | each of the 7 lens styles at lens 1 on Ink, Synapse, Mandala | the scene at lens 0 |
| L-stress | G5, G7 | heat 1, react 1, brightness 2.4, lens 1; anamorphic, then pixels | the scene at its defaults |
| L-jump | G5 | lens 0 ↔ 1, and glitch ↔ anamorphic at lens 1; every 250 ms, then every 125 ms | the scene held at lens 1 |
| P-hot | G7 | by name: every factory preset with heat ≥ .75 (11 in the donor table) or react ≥ .9 (19) | its scene at its defaults |
| all | G8 | every factory preset in `presets.json` | rule (a) only |

- **The 11 S-stress scenes:** Ink, Synapse, Mandala, plus the 8 scenes of the `vs3-look-analyser` H2 run (gap G13). If the lead has no list of those 8: Spacetime, Sand, Oracle, Fluid, Locus, Idol, Anemone, Chorus, the next 8 by `bloomMul` in host.ts:295-334. ⚠️ Assumption, needs confirmation.
- S-all takes about 13 minutes per pass (38 scenes × 20 s). Run it in batches of at most 15 scenes: `flash3.mjs` stops itself after 8 minutes.
- Levers when a row fails, one per rerun (SDLC §7), each as one S8.2 dispatch:
  - too many steps: `DYN` down, then `LIGHT_X` down, then `REACT_MAX` down;
  - too many pairs: `VIG_S` up, then `KNOB_S` up, then `LIGHT_X` down;
  - S-all above its baseline: step 3b.
- Last resort, not planned (design l. 648-649): the toy limiter's GPU pattern on the vs3 layer. It breaks R5 (+1.5 ms) and needs the lead's decision.

### W: washout (`w.mjs`)
`ARGS=--disable-audio-output node scratchpad/vs3-engine/w.mjs <port> <kanine> scratchpad/vs3-engine/rows/<row>.json`
Env: `BASE=<the out.json of the pre-step build>`, `LOW=1`. Exit 0 = PASS, 1 = FAIL.
- Run: 30 s per row. At 5, 15 and 30 s the harness logs the frame-mean luma, the share of pixels above .85, and the reference mean.
- **W1:** the share is at most .30 at all three marks (the donor's own washout line, `O/main.js:2580`).
- **W2:** the mean is at most 1.4 × the reference at all three marks.
- Reference: the mean luma of the row's thumb (the preset's, else the scene's). For the 3 default rows the reference is the pre-step build's mean at the same mark (`BASE=`), because their thumbs use other palettes (skeptic l. 141). ⚠️ Assumption, needs confirmation: the skeptic names that reference; the factor 1.4 is the design's.
- Rows at G3: the defaults of Ink, Synapse, Mandala, plus the 5 value sets with the highest persist × bloomMul × brightness among the 173 presets (design l. 655). The lead lists them with `scratchpad/vs3-engine/g1.mjs` or `skeptic/g1b.mjs`; they are set as values.
- Row at G3p: S3.3's preset by name. Rows at G7: the 5 brightest presets by name.
- Verdict at G3: a row that fails W1 or W2 makes S3b.1 and S3b.2 ship before the user's check. With every row passing, the gate record says "3b not needed". The designer expects W2 to fail (design l. 661).
- `LOW=1` (G3b only; N3): on one white-ground Morphogen 2.0 preset the mean is at least .6 × its thumb's.

### P: GPU cost (`p.mjs`)
`ARGS=--disable-audio-output node scratchpad/vs3-engine/p.mjs <port> <kanine> scratchpad/vs3-engine/rows/<row>.json`
Env: `VW`, `VH` (viewport), `SEC` (120), `LIMIT` (ms), `FIRST=1`. Exit 0 = PASS, 1 = FAIL, 2 = VOID.
- Method: billed-p95 A/B on one build, from `gpuMs`. Arm A = the row's scene with the chain off (mirror 0, trails 0, lens 0). Arm B = the row's values. Delta = B − A.
- Sizes, both in 60-adaptive: 1728×1117 @2 = 1.93 MP with `LIMIT` 0.76; 3008×1692 @2 = 5.09 MP with `LIMIT` 2.0. R5 is judged at 5.09 MP (design C4).
- **C4, the governor is held at scale 1:** the run prints `WEBGL_debug_renderer_info` once. It is VOID unless both arms report `minScale` 1 and `governed` 0. A void run is never read as a pass. The lead repeats it with the governor pinned (gap G14) or on a lighter scene.
- If the harness cannot render 5.09 MP on this host's GPU: the 5.09 MP figure is the 1.93 MP delta × 2.64, plus one fullscreen run by the user (design l. 851).
- G3: warp only, on Ink: persist .5, then mirror 6; 2 minutes per size.
- G5: warp + the glitch lens, the same pass lines. Every other style is reported. Melt and anamorphic are expected above the line (design, Cost table rev 2).
- G8: per vs3 scene at both sizes; then 10 minutes at 5.09 MP with warp + glitch. R5 is judged on the last 2 minutes; the first 2 are reported beside them.
- **C12-cue** (`FIRST=1`, G3): a fresh page, the first hold of vs3 Ink; the late frames of the first 2 s. Pass: not above the pre-step build's, two runs each.

### Luma check (G2, G6)
`h2.mjs` prints the 15 s frame-mean luma per scene. Pass: within ±.01 of the baseline build's, analyser `ours`. If the baseline's own two runs differ by more than .01, the lead records that spread and judges against it.

## Steps

### S0.1 [ ] C5: a cue to the scene on stage starts no fade
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** the director never fades a scene into itself. Today one cached Live is then drawn twice per frame (skeptic C5).
- **Lane, box, deps:** A · 45 min · none.
- **Read:** design l. 698-704; `src/director.ts:56-89`; `src/app.ts:573-585`.
- **Files:** `src/director.ts`, `src/director.test.ts`.
- **Behaviour:** write the failing tests first (SDLC §6). In `begin()` (director.ts:70-78), after `if (shot.to) shot.from = shot.to`: when `playlist[to] === shot.from`, write `cur`, `stand`, `switchedAt` and `switchedBar` as today, set `shot.to = null`, and start no mix. `begin()` is the one function every caller reaches (set-list cues, ← / →, the autopilot, `jump()`): add no guard elsewhere. The cue's preset must still land: `app.ts:579` applies `presetDue` when its scene is `shot.to ?? shot.from`. Find where `presetDue` is set and keep it firing for a same-scene cue.
- **Tests (Vitest):**
  - `C5a cues [A, A]`: after the bar line `shot.to === null`; the current cue is cue 2; its bars count from that bar line.
  - `C5b cues [A, B]`: the fade starts as today (`shot.to` is B).
  - `C5c mid-fade A → B, a cue back to A`: it fades B → A.
  - `C5d mid-fade A → B, a cue to B`: `shot.from` is B and `shot.to === null`.
- **Done-check:** gates. Browser: a set with two cues of one scene and two presets. At the bar line the preset glides, no fade runs, the bar shows `cue 2 / 2`.
- **Lead gate:** none.

### S0.2 [ ] Gate harnesses and the pair counter
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** runners for gates H2, W and P (§ Gates) and N5's flash-pair counter.
- **Lane, box, deps:** B · 75 min · none.
- **Read:** § Gates of this plan; `scratchpad/vs3-look/flash3.mjs`; `scratchpad/vs3/cost.mjs`; `scratchpad/donor-mode/lib.mjs`.
- **Files:** `src/vs3/pairs.ts`, `src/vs3/pairs.test.ts`; scratch: `scratchpad/vs3-engine/h2.mjs`, `w.mjs`, `p.mjs`, `rows/*.json`.
- **Behaviour:**
  - `flashPairs(t, luma)`, `t` in seconds: zig-zag extrema with a .10 threshold. A change counts when the darker of its two ends is under .8. Changes alternate; every second change completes a pair. `max1s` = the most pairs completed in any closed 1 s window. Nothing in the app imports it, so Rollup drops it from the build.
  - `h2.mjs` = `flash3.mjs` plus a row file `{ ids, a?, b?, swapMs?, holdMs?, preset? }`. It writes values on layer 0's generator through the path the E panel uses (`gl/live.ts` `panel.setValue`, named at midi.ts:7), so the limiter sees what a click produces. Per scene it prints `steps total (max/1 s) · pairs total (max/1 s) · luma mean/min/max · late`, applies rules (a), (b), (c), writes `h2.<row>.<build>.json`, and exits 0 or 1. The pairs are counted in the page: `import('/src/vs3/pairs.ts')`.
  - `w.mjs` and `p.mjs`: as § Gates W and P. `p.mjs` reuses `lib.mjs` `cost()` and prints `governed` and `minScale` per arm, as `cost.mjs` does.
  - A row with `preset` picks a factory preset by name from `src/vs3/presets.json`.
- **Tests (Vitest; 60 fps, 2 s traces):** `FP1 triangle 4 Hz, swing .12 around .5`: `max1s` > 3. `FP2 the same with swing .08`: 0 pairs. `FP3 one ramp .2 → .9`: 0. `FP4 swing .15 between .85 and 1`: 0. `FP5 square, 8 jumps per s of .15 around .5`: `max1s` > 3. `FP6 square 2 Hz of .3`: `max1s` ≤ 3 and `total` ≥ 3.
- **Done-check:** gates. On current `dev`, `h2.mjs` on Ink, Synapse and Mandala gives `flash3.mjs`'s step counts within ± 1 per 15 s. One run of `w.mjs` and of `p.mjs`; paste 3 output lines of each.
- **Lead gate (baselines, on `dev` before S2.2 merges):** H2 S-all twice → `h2.S-all.pre.json`; W's 3 default rows twice → `w.defaults.pre.json`; the luma of Ink, Synapse, Mandala twice; P on Ink at both sizes: is the run valid (`minScale` 1, `governed` 0)? That answers gap G14 early.

### S1.1 [ ] `chain.ts`, pure part 1: the types and the donor wiring
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** `frame()` for motion and the warp, with every light value passed through unlimited. The limiter is S1.2. No GL.
- **Lane, box, deps:** A · 75 min · none.
- **Read:** design S1, S3 "wiring", S4 (l. 49-81); Contracts (A) (l. 169-211) and rev 2 (l. 586-598); C10 (l. 733-737); § CP1 frozen contract of this plan, which wins.
- **Files:** `src/vs3/chain.ts` (new), `src/vs3/chain.test.ts` (new).
- **Behaviour:**
  - From the CP1 contract: `KNOBS`, `drastic`, `reacted`, the types, `chainState()`, `frame()`, `reactTo()`. `clock()` and the limiter come in S1.2. A parameter with no reader yet (`knobs`) is added by the step that reads it; the final signature is CP1's. Import `Signal` from `./host` as a type only.
  - `stepSym` (the 0.5 s fold fade) and `stepTiles` (the tile glide), with their state passed in. Both snap to their targets when `st.reset` is true.
  - `frame()`, the donor's per-frame maths for the macros, the mirror and the feedback: the effective persist (`persist` scaled by `trails`, with `sc.lateTrails` and `sc.hint`); the zoom; the spin angle; twist, slice, tiles; `chaos` through `drastic`; the kick's zoom push reads `cf.kick`; the tint is `min(1, .88 + .12 × palMid)` per channel. Motion reads `dt`.
  - `cf.mirror` and `cf.feedback` are the skip predicates of design S4 (l. 72-79). `cf.warp.uHist` is 0 while `st.stale`; after the frame `st.stale = !cf.feedback`.
  - Until S1.2: `cf.bloom` = 9k² with k as host.ts:237; `cf.finish` holds the plain values; `cf.kick` = `heatStep(st.hot, hit, dtl)`; `cf.react` = `v.react × 2`. `cf.lens` stays null until S5.1.
  - `reactTo(s, cf)`: `s.kick = cf.kick`; each level the donor scales by react (read `analyzer.js:464-473`) becomes `reacted(level, cf.react)`. `onKick`, `onMid`, `onHigh` stay as they are.
- **Donor authorisation** (read as text, rewrite in TypeScript, keep the credit line):
  - `donor/vs3/visual_kit/src/engine/engine.js:150-198` (macros, mirror and feedback uniforms; `:188` the tint)
  - `donor/vs3/visual_kit/src/engine/post-shaders.js:162-198` (`stepSym`, `stepTiles`)
  - `donor/vs3/visual_kit/src/core/analyzer.js:464-473` (what react scales)
- **Tests (Vitest):**
  - `D1 drastic`: .25, 1, 4 at 0, .5, 1.
  - `D2 persist`: `trails` scales it; a `lateTrails` scene; `trails` 0 gives 0.
  - `D3 zoom`: the donor formula over `dt`.
  - `D4 mirror skip`: no fold, no fold fade, tiles ≤ 1.0001, |twist| ≤ .001, slice ≤ .001 → `cf.mirror` false.
  - `D5 feedback skip`: effective persist ≤ 0 → `cf.feedback` false.
  - `D6 stepSym`: a fold change fades over 0.5 s; it snaps on `reset`.
  - `D7 stepTiles`: it glides; it snaps on `reset`.
  - `D8 tint` (C10): every `uTint` channel ≤ 1 for `palMid` = [1.3, 1, 1].
  - `D9 stale` (N2): on the frame the feedback turns on `uHist` is 0; on the next it is 1.
  - `D10 motion clock` (C6): the spin angle follows `dt`, not `dtl`.
  - `D11 reactTo`: at `cf.react` 1 the levels are unchanged up to the clamp at 1; at 2 they double, clamped at 1; `s.kick` is `cf.kick`; the impulses are untouched.
- **Done-check:** gates. Nothing imports `chain.ts` yet: the app is unchanged, so no browser check.
- **Lead gate:** none.

### S1.2 [ ] `chain.ts`, pure part 2: the light limiter
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** every scalar that sets the frame's light passes one limiter after every writer (C1, C2, C6), with N1, N2, N4, N5, N6 folded.
- **Lane, box, deps:** A · 75 min · S1.1, S0.2 (`flashPairs`).
- **Read:** § The light limiter, final text of this plan (the exact rule); design l. 513-646; skeptic l. 155-160.
- **Files:** `src/vs3/chain.ts`, `src/vs3/chain.test.ts`.
- **Behaviour:**
  - The rule of § The light limiter, line for line, with `KNOBS` as the default of `knobs`. `HEAT_RISE` and `HEAT_CAP` do not exist.
  - `clock()`: `dtl = min(max(0, now - seen) / 1000, DT_MAX)`; `reset = engineFrame - drawnFrame > 1`. A new native passes `drawnFrame = -Infinity`.
  - `ponytail:` comment on `clock()`: a library tile drawn every k-th stage frame resets on each draw, so its light takes its targets; fine for a thumbnail.
- **Tests (Vitest; `dtl` = 1/60 unless said):**
  - `L1 stock`: stock values, a 600-frame synthetic signal: the strength equals 9k0² within 1e-6 relative on every frame.
  - `L1b stock at energy 1.05` (N6): the same with the energy between .9 and 1.1.
  - `L2 dim`: heat .2, react .3, brightness = base, bloomMul = the row's: the strength equals 9k² within 1e-6 relative.
  - `L3 hot`: heat 1, react 1, brightness 2.4: every frame's glow move is inside `dyn` ± `foll`.
  - `L4 undo` (C2): brightness 2.4 → 1.36 and heat .98 → .36 between two frames: `uGain` ≥ 2.345; the glow falls by at most 2.34 % plus the stock's own move; vignette moves at most 1/60 of its range; lens and react gain at most 1/30 of theirs.
  - `L5 real time` (C6): hit 0 → 1: `cf.kick` is 1 − e^(−(1/60)/.04) = .3408 with `dt` at 3/60, and the same when the real frame took 100 ms.
  - `L6 light null`: every limited value equals its target on that frame.
  - `L7 react before the slew` (N1): hit 0 → 1 with the react gain settled at 2: `cf.kick` after one frame ≤ .3408.
  - `L8 REACT_MAX` (N1): `knobs.REACT_MAX` 1.5, react 1: the settled `cf.react` ≤ 1.5.
  - `N2a reset`: `st.reset` true → targets on that frame; `uHist` is 0 on it; the flag is cleared after it.
  - `N2b persist back from 0`: a light state mid-slew, then persist 0 → .5: `uGain` moves by at most × `LIGHT_X ** dtl`; `st.light` is not null.
  - `N2c clock, late draw`: 300 ms since the last draw, engine frames differ by 1: `reset` false, `dtl` 1/60.
  - `N2d clock, skipped frame`: engine frames differ by 2, and a new native: `reset` true.
  - `N4a NaN energy`: `s.energy` NaN for one frame, then finite: every number of `cf` is finite on that frame and the next two; each glow move stays inside `dyn` ± `foll`.
  - `N4b NaN glow`: `st.light.glow` = NaN: the next frame's glow is finite.
  - `N5a pump model`: brightness 2.4 / 1.36 and vignette 0 / 1 (`vigRange` 1), swapped together every 125 ms for 2 s. Luma model around .5, per frame: Δ ln uGain / 3.6 − .4 × .75 × Δ uVig. `flashPairs(...).max1s` ≤ 3. With `knobs.VIG_S` .5 the same trace gives > 3. Assert both.
  - `F1 kick terms`: the zoom push and `uAber` read `cf.kick`; on hit 0 → 1 neither takes more than the .3408 share in one frame.
  - `F4 style duck`: a style change at lens 1: the drawn style holds until the limited lens ≤ .01, then swaps, then the amount returns.
  - `F6 analysis off`: a constant signal: `dyn` is 0; a heat jump moves the glow by at most × `LIGHT_X ** dtl` per frame.
  - `PF persist fall`: .97 → 0 takes at least 29 frames; 0 → .97 takes 1.
  - `BS bloom skip` (R2): at bloomMul 0 the glow follows down; `cf.bloom` is exactly 0 once the strength is under 1e-3.
- **Done-check:** gates; D1–D11 stay green. No browser check (no product path yet).
- **Lead gate:** none.

### S2.1 [ ] `look.json` from the donor text
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** one generated source for the look's defaults, ranges and per-scene rows. No behaviour change.
- **Lane, box, deps:** B · 60 min · none.
- **Read:** design l. 153, l. 212, gaps G1 and G12 (l. 408, l. 885); `scripts/vs3-presets.mjs:1-45`; `src/vs3/host.ts:290-335`; `scratchpad/vs3-engine/g1.txt`.
- **Files:** `scripts/vs3-presets.mjs`, `src/vs3/look.json` (generated, committed), `src/vs3/look.test.ts` (new).
- **Behaviour:** the script (cwd `web/`: `node scripts/vs3-presets.mjs`) also writes `src/vs3/look.json`, read from the donor text with the literal reader it has (l. 26-43):
  - `base`: the donor's `BASE_POST` values for the 14 post keys, plus `react`, `chaos`, `trails`, `heat` = 0.5. `lensStyle` is an index into `lensStyles`.
  - `ranges`: the donor's `POST_RANGES` per key; the 4 macros [0, 1]; `mirror` [0, 12].
  - The 4 keys the donor has no slider for: `persist` [0, 1], `zoom` [0.9, 1.3], `bloomMul` [0, 3], `aber` [0, 4] (the design's assumption at l. 212; they contain every preset value of `g1.txt`).
  - `ranges.brightness[0]` = max(the donor's bottom, 1.36) (skeptic planner note 2, l. 178).
  - `scenes`: the `FX_DEFAULTS` rows (32 in the donor) under our native names: the donor's scene name through the script's `OURS` map (l. 16). `chorus-hall` gets chorus's row. A row whose scene has no native here is skipped and reported.
  - `lateTrails`: the donor's `LATE_TRAILS` under our names. `lensStyles`: the 7 style names in the donor lens shader's order.
  - The script throws when a range does not contain every value of that key in `FACTORY_PRESETS`.
  - `presets.json` and the thumbs come out unchanged by this step: `git diff --stat` shows the script, `look.json` and the test only.
- **Donor authorisation** (values only, read as text): `donor/vs3/visual_system_3/renderer/main.js` (`BASE_POST`, `POST_RANGES` near `:10602-10621`, `FX_DEFAULTS` from `:167`, `LATE_TRAILS`); `donor/vs3/visual_kit/src/engine/post-shaders.js:22-29, 303-459` (the base keys, the style names).
- **Tests (Vitest, `look.test.ts`):**
  - `K1 rows = today's numbers`: for each of the 38 natives of host.ts:295-334, `{ ...base, ...scenes[name] }` gives that line's `bloomMul`, `aber`, `vignette`. Copy the 38 × 3 table into the test as a fixture now; S2.2 deletes it from host.ts.
  - `K2 base.brightness is 1.4` (the literal at host.ts:99).
  - `K3 shape`: `base` has the 18 keys; each key has a range; the range contains the base value and every scene row's value.
  - `K4 brightness range`: bottom ≥ 1.36, top ≥ 2.4.
  - `K5 base leaves tiles, twist, slice off` (the design's assumption at l. 721): tiles ≤ 1.0001, |twist| ≤ .001, slice ≤ .001.
  - `K6 lensStyles has 7 names; base.lensStyle is a valid index`.
- **Done-check:** gates; `git diff --stat`. If K1 or K2 fails on the donor's own numbers: stop and report. S2.2's "picture unchanged" depends on them.
- **Lead gate:** none.

### S2.2 [ ] The first four light knobs, through the limiter
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** `bloomMul`, `aber`, `vignette`, `brightness` are inputs of every vs3 native, drawn from `frame()`'s limited values. At the defaults the picture does not change.
- **Lane, box, deps:** A · 75 min · S1.2, S2.1.
- **Read:** design l. 599-604 (host `draw`), l. 801 (step 2); skeptic N2 (l. 156); `src/vs3/host.ts:172-335`; `src/gl/engine.ts:222-236`.
- **Files:** `src/vs3/host.ts`, `src/vs3/host.test.ts`, `src/gl/engine.ts` (2 lines).
- **Behaviour:**
  - `gl/engine.ts`: a module counter, incremented once at the top of `render()` (l. 224); `export const engineFrame = () => <the counter>`.
  - `Look` (host.ts:176) loses `bloomMul`, `aber`, `vignette`; the 38 `VS3` lines lose those numbers. The defaults come from `{ ...look.base, ...look.scenes[name] }`.
  - `vs3()` appends the look inputs after `...ps` (host.ts:267) from a const list `LOOK_KEYS`, now the 4 keys: `{ name, type: 'float', group: 'look', default, min, max }` from `look.json`. `brightness` and `bloomMul` get `bindable: false` (F3).
  - `start()`: a `ChainState` from `chainState()` and the `SceneFacts`: `bloom` = `sc.bloom`, `filter`, `bloomRow`, `gainBase` = `look.base.brightness`, `vigRange`, `lateTrails`, `wet` 1, `grain` 0, `hint` null. `hot` leaves the closure (host.ts:191, :220).
  - `draw()`:
    1. `clock(now, seen, engineFrame(), drawn)` before `seen = now`; then `drawn = engineFrame()`. `reset` true → `st.reset = true`.
    2. After `signal(...)`: `cf = frame(values, facts, s, hit, st, palMid, f.dt, dtl, f.time, f.width / f.height)`. `values` = the node's 4 look values; every unshipped key reads `{ ...look.base, ...look.scenes[name] }`. `palMid` = the palette's `mid` colour.
    3. `reactTo(s, cf)` before `sc.update` (host.ts:231).
    4. The bloom strength is `cf.bloom`; the pass is skipped at 0.
    5. `FINISH`: `raw * uGain` in place of `raw * 1.4`; `uGain`, `uVig`, `uAber` from `cf.finish`.
  - The palette's own gap test (host.ts:207) stays as it is. Everything stays inside the guarded window (host.ts:236-244).
- **Tests (Vitest):**
  - `V1 look inputs`: every vs3 native has the 4 inputs, `group: 'look'`, with K1's defaults and `look.ranges`; `brightness` and `bloomMul` are not bindable.
  - `V2 FINISH`: its source has `uGain` and no literal `1.4`.
  - The existing host tests stay green (the `signal` tests, `params.json`).
- **Done-check:** gates. Browser: the E panel of vs3 Ink shows a «look» group with 4 sliders; a click on `brightness` ramps over about 0.4 s; no GL error in the console. Report how the panel draws the group (gap G4).
- **Lead gate G2** (on the step's branch; baselines from S0.2):
  - Luma check on Ink, Synapse, Mandala at their defaults, analyser `ours`: within ±.01 of the pre-step build's.
  - The same with analyser `vs3`: reported. The clamp at 1 (N6) can only darken; brighter by more than .01 blocks the merge.
  - H2 S-jump(2) at 250 ms and at 125 ms: rules (a), (b), (c).

### S3.1 [ ] `createChain`: the warp pass and the chain's targets
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** the GL half of the chain: mirror + feedback in one pass, three owned half-float targets, programs compiled off the visible frame. Not wired into the host yet.
- **Lane, box, deps:** B · 75 min · S1.2 (merged; `chain.ts` has one editor at a time).
- **Read:** design S3 "warp" (l. 64), S4 (l. 71-81), C10 (l. 733-737), C11 (l. 739-745), C12 (l. 747-753); `src/gl/engine.ts:56-118`; `src/gl/bloom.ts`.
- **Files:** `src/vs3/chain.ts`, `src/vs3/chain.test.ts`.
- **Behaviour:**
  - `WARP` shader: the donor mirror's uv transform (slice → tiles → twist → fold), a sample of the scene through it, then `max(cur, history × persist × tint × edge)`. The donor's NaN/Inf drop is ported verbatim, with its comment. `uHist` 0 ignores the history.
  - `createChain(gl, w, h)` allocates `hist[0]`, `hist[1]` (`renderTarget(true, true)`: half-float, content kept across a re-fit) and `lensRT` (`renderTarget(true)`) at w × h. Nothing is allocated on first use. `apply()` re-fits only when the size changed.
  - `apply(src, w, h, f, bloom)`:
    1. Warp, when `f.mirror || f.feedback`: it reads `src` and, with feedback, `hist[1 - w]`; it writes `hist[w]`; then the two swap.
    2. Bloom, when `f.bloom > 0`: `bloom.apply(tex, w, h, f.bloom)` (it writes its own targets).
    3. Lens: a pass-through until S5.1.
    4. It returns the texture the finish reads. It binds only its own targets; the host's guard keeps the GL state.
  - `warmChain()`: `programAsync(vs, fs)` for the warp, with the same `vs` string the draw path uses, so the cache key matches (engine.ts:57, :65). Either `program()` + `draw()` with `fx/glsl.ts`'s `VS`, or one exported async twin of `fullscreenProgram`: the coder's pick; C12a proves it.
- **Donor authorisation** (text → GLSL; the credit header on the shader): `donor/vs3/visual_kit/src/lib/fx.js:75-129` (mirror), `:136-175` (feedback; `:172-174` verbatim), `:203-213`.
- **Tests (Vitest):**
  - `C10a guard`: the warp source contains `isnan` and `isinf`.
  - `C11a own target`: `apply()` on a recording fake GL over the 8 on/off combinations of mirror, feedback and bloom (lens off): in no draw is a sampled texture the bound draw target's. Extend the suite's GL stub. If the stub cannot record bindings, the fallback is a pure `route(f)` that `apply()` executes line by line: say which was used.
  - `C11b skip`: with `f.mirror` and `f.feedback` false no warp draw happens, and the bloom reads `src`.
  - `C12a no allocation after create`: after `createChain(gl, w, h)` and `warmChain()`, an `apply()` at w × h that turns the warp on makes no `texStorage2D`, no `texImage2D` and no `compileShader` call.
  - `C12b re-fit`: a size change re-fits the three targets once.
- **Done-check:** gates. The app is unchanged (nothing imports `createChain`), so no browser check.
- **Lead gate:** none.

### S3.2 [ ] The warp and the macros in the host; the legacy fx leave the built-ins
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** the vs3 scenes get mirror and feedback from the chain, under the bloom and the tone map, with the 7 warp knobs and the 4 macros. The layer fx that approximated them leave.
- **Lane, box, deps:** A · 75 min · S2.2, S3.1. S4.1 should be merged (see the note).
- **Read:** design l. 155-157 (files), l. 802 (step 3), C12 (l. 747-753); skeptic l. 150 (C12 residual); `src/vs3/host.ts:181-288`; `src/scenes/builtin.ts:1826-1934`.
- **Files:** `src/vs3/host.ts`, `src/vs3/host.test.ts`, `src/scenes/builtin.ts`, `src/gl/engine.ts` (1 line).
- **Behaviour:**
  - `LOOK_KEYS` += `mirror` (`type: 'long'`, values 0..12, labels '0'..'12'), `tiles`, `twist`, `slice`, `spin`, `persist`, `zoom`, `trails`, `chaos`, `heat`, `react` (floats; bindable). The host passes them to `frame()`; `reactTo` already scales the signal.
  - `gl/engine.ts`: `export const shotSize = () => [shots[0].width, shots[0].height] as const`.
  - `create(gl, size)` (host.ts:271) passes `size ?? shotSize()` into `start()`. `start()` builds `createChain(gl, w, h)` and awaits `warmChain()` beside `compileAsync` (host.ts:192). vs3 `warm()` (host.ts:270) awaits `warmChain()` too. A layer with res ≠ 1 re-fits on its first draw, as three's target and the bloom do today.
  - `draw()`: inside the guarded window, `lit = chain.apply(texture(rt), f.width, f.height, cf, bloom)` replaces the direct bloom call (host.ts:240); then the finish as now. `dispose()` disposes the chain.
  - `SceneFacts`: `hint` from the scene's `fxHint` (signal only); `wet` from the scene's `fxWet()` (limitless only), else 1. `Scene` (host.ts:142) gains the optional `fxHint` and `fxWet`.
  - `scenes/builtin.ts`: every vs3 doc gets `fx: []`. `isf/Mirror`, `isf/Kaleidoscope`, `own/feedback-zoom`, `BASE_FX` and `KICK_ZOOM` leave where only the vs3 docs used them.
  - Never merge the warp without the `builtin.ts` change: the two together are one look change. If the box runs out, hand back with both done and the open rest named.
- **Tests (Vitest):**
  - `V3 look inputs`: the 15 shipped keys; defaults = `{ ...base, ...scenes[name] }`; `mirror` is a `long` 0..12; the 4 macros are bindable floats 0..1 with default .5 (R1).
  - `V4 built-ins`: no vs3 built-in doc carries `isf/Mirror`, `isf/Kaleidoscope` or `own/feedback-zoom`.
  - `V5 rows without trails`: for the defaults of crystal, pearl, spiral and descent `frame()` gives `feedback` false.
  - `C12c size`: `create(gl, size)` hands the tile's size to the chain; without a size it hands `shotSize()`.
- **Done-check:** gates. Browser: vs3 Ink shows trails and vs3 Mandala its fold; `heat` to 1 raises the glow over about 2 s; no GL error. One frame-time number (GPU p95 of vs3 Ink) in the report.
- **Lead gate G3** (on the step's branch; § Gates):
  - H2: S-all against `h2.S-all.pre.json` (rules a, b); S-stress (a, b); S-jump and S-cut (a, b, c).
  - W on its 8 rows. The verdict decides S3b.1 + S3b.2.
  - P, warp only, 2 minutes per size: delta ≤ 2.0 ms at 5.09 MP and ≤ 0.76 ms at 1.93 MP; both arms `minScale` 1, `governed` 0.
  - C12-cue.
- **Note:** S4.1 merges before this step, or right after it. Until then a user copy with the legacy fx doubles its trails on `dev`.

### S3.3 [ ] One hot preset carries its look (for the user's check)
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** the factory preset Magmatic Eye loads its macros and post values, so the user can pick one hot preset in W.
- **Lane, box, deps:** B · 45 min · S3.2.
- **Read:** `scripts/vs3-presets.mjs:45-95`; `scratchpad/vs3-engine/skeptic/g1b.txt` l. 8-16.
- **Files:** `scripts/vs3-presets.mjs`, `src/vs3/presets.json` (generated), `src/vs3/host.test.ts`.
- **Behaviour:**
  - In `map()` (l. 52-72): a `post.*` or `macros.*` key is written onto the input of the same name when the key is in `LOOK_NOW.keys` (the 15 keys shipped so far) and the preset's full donor name is in `LOOK_NOW.names`. Now: [`★ morphogen 2.0 · magma — Magmatic Eye`]. Every other key is dropped and counted as today (l. 58). S7.1 deletes `LOOK_NOW`.
  - Our picker shows the preset as `★ magma — Magmatic Eye` (the rename at l. 81), on `native/vs3-morphogen2`.
  - If the donor table has no such preset, or it maps to a dropped one: use `★ sand — token` (heat .8, bloomMul 1.5, lens 0) and report.
  - `git diff` of `presets.json`: one preset gains look keys, or one preset returns from the twin drop. Nothing else changes.
- **Tests (Vitest):** `M1 hot preset`: its look keys are inputs of its native and inside `look.ranges`; heat ≥ .75. `M2 only one`: no other factory preset holds a look key (deleted in S7.1).
- **Done-check:** gates. Browser: pick the preset in W on vs3 Morphogen 2.0; the look glides in over 1.8 s; the glow follows within about 2 s.
- **Lead gate G3p:** H2 P-hot-1 (rules a, b); W on this preset against its thumb. Then the user's check (§ CP2 demo), after S3b.2 if 3b is built.

### S4.1 [ ] C8: a legacy user copy keeps its fx; the chain is off for it
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** a user copy of a vs3 scene saved before this epic must not run its mirror or feedback fx and the chain together.
- **Lane, box, deps:** B · 45 min · S1.1 (test C8e reads `frame()`). Merge before S3.2, or right after it.
- **Read:** design l. 718-724; skeptic l. 146; `src/library.ts:76-84, 170-212`.
- **Files:** `src/library.ts`, `src/library.test.ts`.
- **Behaviour:** `chainOffForLegacy(doc)`, called inside `own()` (library.ts:80-84), so `put()` (:176) and `load()` (:208) both pass it. Per layer, when all three hold: the generator's ref starts with `native/vs3-`; its fx hold `isf/Mirror`, `isf/Kaleidoscope` or `own/feedback-zoom`; its values carry neither `trails` nor `mirror`. Then write `trails: 0, mirror: 0` into the generator's values. The fx stay. Add the design's `ponytail:` comment: a new doc that adds one of the three fx with both knobs untouched is read as legacy at its next load; one knob edit restores it; upgrade path = a `v: 2` stamp at the next SceneDoc format change.
- **Tests (Vitest):**
  - `C8a`: a copy with an edited `own/feedback-zoom` keeps its fx and gets both zeros.
  - `C8b`: a copy with `trails: 0.4` is untouched.
  - `C8c`: a second run changes nothing.
  - `C8d`: a non-vs3 doc is untouched.
  - `C8e`: for a migrated copy's values `frame()` returns `mirror` false and `feedback` false.
  - `C8f` (the residual): `put()` and `load()` both return the migrated doc.
- **Done-check:** gates. Report whether `parseScene` keeps value keys that are not inputs yet: it tells the lead whether this step may merge before S3.2.
- **Lead gate:** none.

### S3b.1 [ ] (only if gate W fails at G3) The exposure servo: the law and its passes
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** a GPU-only pull-down of the exposure per vs3 layer, with N2, N3 and N4 folded. It lifts the spec's non-goal "adaptive exposure" for vs3 layers only (the lead's accepted call).
- **Lane, box, deps:** A · 60 min · S3.2 and a failed W row.
- **Read:** design l. 663-688; skeptic N2, N3, N4 (l. 156-158); gap G10.
- **Files:** `src/vs3/chain.ts`, `src/vs3/chain.test.ts`.
- **Behaviour:**
  - First read `donor/vs3/visual_system_3/renderer/main.js:2361-2375, 2398-2405, 2552-2588` as text (G10): how brightness and the servo gain combine; what the share > .30 clause does. The numbers below stay; report a conflict.
  - `expose(e, mean, target, dtl)`: `e × (target / max(mean, .01)) ** (dtl / 2.5)`, moved by at most × `LIGHT_X ** dtl` per frame, clamped to [.6, 1]. No lift: the design's top of 1.35 is not built (N3). A non-finite result keeps the old `e` (N4).
  - `target` = .19 × brightness / 1.4 (frame-mean luma).
  - `createChain` gains a 64×64 probe target with mipmaps, a 1×1 half-float pair for `e`, and an `UPDATE` program: the same law in GLSL, reading the probe's top mip. `warmChain()` compiles it. No readback.
  - On `st.reset` the update takes the clamped `target / mean` at once. On `stale` (persist back from 0) it does not (N2).
  - A filter has no servo. A scene whose `faithful()` is true skips it: `e` reads 1 (N3).
- **Tests (Vitest):** `E1 law`: at a 10× error `e` moves by at most × 1.0155 per frame; it settles on `target / mean` inside [.6, 1]. `E2 no lift` (N3): mean .005, target .19: `e` ≤ 1 after 0.3 s. `E3 faithful`: `e` is 1. `E4 NaN mean` (N4): `e` keeps its value. `E6 reset snaps; stale does not` (N2). `E7 sources`: the `UPDATE` source keeps the old `e` for a non-finite value.
- **Done-check:** gates. The app is unchanged (not wired).

### S3b.2 [ ] (only if gate W fails at G3) The exposure servo in the host
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** probe → update → finish on every vs3 generator layer.
- **Lane, box, deps:** A · 75 min · S3b.1.
- **Files:** `src/vs3/host.ts`, `src/vs3/host.test.ts`; scratch: `scratchpad/vs3-engine/servo.mjs`.
- **Behaviour:**
  - `FINISH` gains `uProbe` and `uExp` (the 1×1 texture): `raw * uGain * e`. With `uProbe` on, it writes the output luma and `step(.85, luma)`, and luma 0 where `isnan` or `isinf` (N4).
  - Per frame, in this order: the probe draw into the 64×64 target and `generateMipmap`; the update; the full-size finish.
  - `Scene` (host.ts:142) gains the optional `faithful?(): boolean`, read per frame.
  - `servo.mjs` (lead-run): **E5** the probe mean is within ±.02 of a full readback mean on 3 stills: Ink, Mandala and one line-art scene, Vesica (skeptic planner note 4). **E8** one NaN texel written into the scene target: `e` is finite after the update (one `readPixels` in the harness). Exit 0 or 1.
- **Tests (Vitest):** `V8 FINISH`: its source has `uProbe` and `uExp`, and the probe branch guards `isnan` and `isinf`.
- **Done-check:** gates. Browser: vs3 Ink at brightness 2.4 settles darker within about 5 s; no GL error.
- **Lead gate G3b** (§ Gates):
  - W passes on every G3 row; with `LOW=1` on one white-ground Morphogen 2.0 preset.
  - H2 S-all does not rise against G3's run; once more on a window that holds a breakdown → drop (the lead sets `AT`).
  - H2 S-cut with 1 s holds and S-jump: rules (a), (b), (c) (N2).
  - `servo.mjs` exits 0. P: the servo's delta is reported (design: under .02 ms).

### S5.1 [ ] The lens: uniform maths, shader, pass
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** the 7 lens styles as one pass of the chain, with their per-frame maths. Not reachable from the panel until S5.2.
- **Lane, box, deps:** A · 75 min · S3.2 (and S3b.2 if built); the user's "ok" at CP2.
- **Read:** design S3 "lens" (l. 66), S4 (l. 78), S7 F1 (l. 113), F1 and F4 rev 2 (l. 640-643), C11 (l. 739-745).
- **Files:** `src/vs3/chain.ts`, `src/vs3/chain.test.ts`.
- **Behaviour:**
  - `frame()`: `cf.lens` is null when the limited lens amount ≤ .01 or `sc.wet` ≤ .001. Else it holds the uniforms of the DRAWN style `st.style`: the amount; `uKick` = `cf.kick`; the re-seat seed (a new seed only when `s.onKick` > 0); melt's 6 plume slots (`st.rips`, `st.rip`). Motion reads `dt`.
  - `LENS` shader: the 7 styles. 3 taps; anamorphic adds 24; melt adds noise and the plumes.
  - `apply()`: the lens reads the bloom's output, else `hist[w]`, else `src`. It always writes `lensRT`. `warmChain()` compiles it.
  - `look.lensStyles`' order is the shader's style index. 'water' is no style (S7.1 maps it to index 0).
- **Donor authorisation** (text → GLSL and TypeScript; credit header on the shader): `donor/vs3/visual_kit/src/engine/post-shaders.js:303-459` (the shader), `donor/vs3/visual_kit/src/engine/engine.js:199-243` (the uniforms, the re-seats).
- **Tests (Vitest):**
  - `Z1 lens skip`: amount ≤ .01, or wet ≤ .001 → `cf.lens` null.
  - `Z2 re-seat`: a new seed only on `onKick` > 0.
  - `Z3 seed budget`: a 10 Hz hit through `flashGate` gives at most 3 seeds in any second.
  - `Z4 kick source` (F1): the lens reads `cf.kick`, never the raw hit.
  - `Z5 style swap` (F4): the drawn style changes only at an amount ≤ .01.
  - `C11c own target`: the 16 on/off combinations of mirror, feedback, bloom and lens: in no draw is a sampled texture the bound draw target's.
  - `C12d`: with the lens turning on, no allocation and no compile after `createChain` + `warmChain`.
- **Done-check:** gates. The app is unchanged: the host still passes lens 0.
- **Lead gate:** none.

### S5.2 [ ] `lens` and `lensStyle` inputs
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** the lens reaches the panel.
- **Lane, box, deps:** A · 45 min · S5.1.
- **Files:** `src/vs3/host.ts`, `src/vs3/host.test.ts`.
- **Behaviour:** `LOOK_KEYS` += `lens` (a float from `look.ranges`; bindable: the limiter slews it) and `lensStyle` (`type: 'long'`, labels = `look.lensStyles`). The host passes both to `frame()`. For limitless the lens amount is scaled by `sc.wet` (already in the limiter).
- **Tests (Vitest):** `V6 lens inputs`: `lens` defaults to the row's value (0 on every row); `lensStyle` is a select of 7.
- **Done-check:** gates. Browser: lens 1 on vs3 Ink; each of the 7 styles draws; a style change ducks; no GL error. One frame-time number with glitch at lens 1.
- **Lead gate G5** (§ Gates):
  - H2 L-styles and L-stress (rules a, b); L-jump at 250 ms and at 125 ms (a, b, c).
  - P, warp + glitch: delta ≤ 2.0 ms at 5.09 MP and ≤ 0.76 ms at 1.93 MP; both arms `minScale` 1, `governed` 0. Every other style is reported.

### S6.1 [ ] Grain and hue drift
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** the finish's film grain; the palette's slow hue rotation with the input `hueDrift` (R3).
- **Lane, box, deps:** A · 60 min · S5.2.
- **Read:** design S3 "finish", "hue drift" (l. 67-68), C10 (l. 736-737); `src/vs3/host.ts:91-103, 225-235`.
- **Files:** `src/vs3/host.ts`, `src/vs3/chain.ts`, `src/vs3/chain.test.ts` (and `host.test.ts` for V7).
- **Behaviour:**
  - `FINISH`: the donor grain, scaled by `uGrain` = `cf.finish.uGrain` = `sc.grain`. `sc.grain` is 0 on `lasers`, on `morphogen2` and on a filter; else 1.
  - `frame()`: `st.hue` grows by `v.hueDrift × dt × 0.035` turns, wrapped into [0, 1).
  - The host writes each palette slot as `L.PAL[slot].copy(c).offsetHSL(st.hue, 0, 0)` at host.ts:228. The source colours `pal[]` stay unrotated, so nothing accumulates.
  - `LOOK_KEYS` += `hueDrift`. The list now equals the keys of `look.base`: delete the const and use those.
- **Donor authorisation** (text): `donor/vs3/visual_kit/src/engine/post-shaders.js:250` (grain), `donor/vs3/visual_kit/src/App.jsx:92` (the drift rate).
- **Tests (Vitest):**
  - `U1 hue rate`: `hueDrift` 1 over 1 s of `dt` → .035 turn; `hueDrift` 0 → no change.
  - `U2 gamut` (C10): each of the 24 palettes × 5 slots stays inside [0, 1] over a full turn in 36 steps of `offsetHSL`.
  - `U3 grain fact`: `uGrain` is 0 for lasers, morphogen2 and a filter; 1 else.
  - `V7 all 18`: every vs3 native has the 18 look inputs.
- **Done-check:** gates. Browser: grain shows on vs3 Ink in a dark passage; `hueDrift` at its top turns the palette.
- **Lead gate G6:** luma check on vs3 Lasers (grain 0) at its defaults against G5's build: within ±.01 (the design's "a still with grain 0 equals step 5's", made measurable). H2 on Ink with `hueDrift` at its range top: rules (a), (b).
- **Not planned:** grain off while recording (design risk 10, LOW). One line for `agents/hardening.md`.

### S7.1 [ ] Full presets: post and macros into `presets.json`
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** every factory preset carries its look; the 1.8 s morph glides it (R4).
- **Lane, box, deps:** A · 60 min · S6.1, S3.3; the user's "ok" at CP2.
- **Read:** design l. 156, l. 221, l. 807; `scripts/vs3-presets.mjs:45-110`.
- **Files:** `scripts/vs3-presets.mjs`, `src/vs3/presets.json` and the thumbs (generated), `src/vs3/host.test.ts`.
- **Behaviour:**
  - `LOOK_NOW` leaves. In `map()`: each `post.*` or `macros.*` key that is a `LookKey` is written onto the input of that name. `lensStyle`: the name → its index in `look.lensStyles`; 'water' → 0. `decay`, `quality` and `layer*` are dropped and counted as today. A key the entry lacks is not written.
  - The twin rule (l. 84-90) now compares the look keys too, so presets that differed only in post or macros return. Report the new preset count and the `gone` list.
- **Tests (Vitest):**
  - `M3 preset keys`: every factory preset's keys are inputs of its native; floats are inside their ranges; `long`s are valid indexes.
  - `M4 dropped keys`: no preset holds `decay`, `quality` or a `layer` key.
  - `M5 morph` (R4): `between()` glides `heat` and switches `lensStyle` and `mirror` at the midpoint. `presets.ts` is unchanged.
  - `M2` is deleted; `M1` stays.
- **Done-check:** gates. Browser: W on vs3 Mandala: two presets glide whole looks.
- **Lead gate G7:** H2 P-hot and L-stress (rules a, b). W on the 5 brightest presets by name.

### S7.2 [ ] MIDI `'*'`: a look knob follows the scene on stage (C7)
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** one learned CC drives a look input of whatever vs3 scene is on stage (R1).
- **Lane, box, deps:** B · 60 min · S3.2.
- **Read:** design l. 706-716; `src/midi.ts:1-100`; `src/ui/Midi.tsx`.
- **Files:** `src/midi.ts`, `src/midi.test.ts`, `src/ui/Midi.tsx` (and the file that builds `createMidi`'s `app`, if it is another one: name it in the report).
- **Behaviour:**
  - `ParamTarget.scene: SceneId | '*'`.
  - `createMidi`'s `app` gains `ref(layer, node): string | null`: the ref of that node in the scene on stage.
  - Learn arms `'*'` only for an input of `group: 'look'`. Every other input learns its scene as today.
  - A `'*'` CC reaches `app.param` only when `app.ref(layer, node)` starts with `native/vs3-`. Otherwise the message is dropped: no write, no dirty flag, no undo step.
  - Trust boundary (`mappingsOf`, midi.ts:54-55): a stored `'*'` target is valid only when its `input` is one of the 18 look keys.
- **Tests (Vitest):**
  - `C7a`: the stage node is `native/video`: a `'*'` CC for `zoom` does not reach `app.param`.
  - `C7b`: on `native/vs3-ink` it does, with the scaled value.
  - `C7c`: a stored `'*'` target for a scene row is left out by `mappingsOf`.
  - `C7d`: a mapping with a scene id behaves as before.
- **Done-check:** gates. Browser, with the suite's fake MIDI input or a console message: learn on `heat`, switch to another vs3 scene, the same CC moves its `heat`; on a MilkDrop scene nothing moves.
- **Lead gate:** none.

### S8.1 [ ] (lead) The final gates and the R5 verdict
Invoke the `ponytail` skill (full) before writing code. This step has no product code; the rule covers a row file or a script edit.
The lead runs, on the final `dev` commit:
- **(a) P:** per vs3 scene at both sizes; then 10 minutes at 5.09 MP with warp + glitch on Ink. R5 is judged on the last 2 minutes; the first 2 are reported. The governor rule applies.
- **(b) H2 row `all`:** every factory preset, rule (a).
- **(c) The gates:** `npm run lint && npm run typecheck && npm test`.
- **Output:** the `## Gate record` filled. R5 is PASS or FAIL per preset class (warp only; warp + a 3-tap lens; warp + melt; warp + anamorphic), each with the commit, the command, the exit code and the file under `scratchpad/vs3-engine/`.
- **Deps:** S7.1, S7.2. Then `tester` (AV QA, S6) and the close.

### S8.2 [ ] (conditional) Tune one limiter knob
Invoke the `ponytail` skill (full) before writing code.
- **When:** an H2 row fails, or the user says "not ok" on the pump at CP2. One lever per dispatch (SDLC §7).
- **Lane, box, deps:** A · 45 min · the failing gate's step.
- **Files:** `src/vs3/chain.ts` (`KNOBS`), `src/vs3/chain.test.ts` (the numbers that follow the knob).
- **Behaviour:** change one value of `KNOBS`, in the order of § Gates H2 "Levers". For the pump: `DYN` up in steps of 0.5.
- **Tests:** L1, L1b, L2 and L6 must stay green untouched. L4, L5 and N5a follow the knob: update their expected numbers and say so.
- **Done-check:** gates.
- **Lead gate:** the failing row reruns PASS. The lead compares the row's distribution before and after (billed p95 and step counts), not single runs.

## Acceptance mapping
Spec: `thoughts/spec_vs3_engine.md` § Requirements (l. 21-37). "gate" = a lead-run gate of § Gates.

| ID | Criterion | Proof |
|---|---|---|
| R1 | 4 macros as knobs: bindable, MIDI-learnable, in presets, glided by the morph | S3.2 V3; S7.2 C7a–C7d; S7.1 M3, M5; S1.1 D1, D2, D11; CP2 and CP4 demos |
| R2 | the post chain in the donor order: mirror → feedback → bloom → lens → finish | S3.1 C11a, C11b; S5.1 C11c |
| R2 | defaults `BASE_POST`, per-scene `FX_DEFAULTS` | S2.1 K1–K3, K5; S2.2 V1; S3.2 V3. Variant A has no run-time merge (design l. 224-228). |
| R2 | each pass costs nothing at amount 0 | S1.1 D4, D5; S1.2 BS; S3.1 C11b; S5.1 Z1; gate P, arm A |
| R2 | `decay` | dropped by the lead (design l. 484); S7.1 M4 |
| R3 | 24 palettes stay; hue drift; the morph covers them | S6.1 U1, U2; the existing palette tests of `host.test.ts`. Custom palette: out (lead). |
| R4 | factory presets with post + macros; the morph glides them | S3.3 M1; S7.1 M3, M4, M5; CP4 demo |
| R5 | the flash gate holds on every vs3 scene at preset values | gates H2: S-all (G3), P-hot-1 (G3p), P-hot (G7), all (G8) |
| R5 | no flash from a knob | S1.2 L1–L8, N5a, F4, F6, PF; gates H2: S-jump(2) (G2); S-stress, S-jump, S-cut (G3); L-styles, L-stress, L-jump (G5) |
| R5 | kick terms only through the gated ⚡ path (I-FL1) | S1.2 L5, L7, F1; S5.1 Z2, Z3, Z4 |
| R5 | a typical preset adds ≤ 2 ms GPU p95 at the stage size | gate P at G3, G5; S8.1 verdict at 5.09 MP |
| R6 | the knobs in the E panel, a «look» group | S2.2 V1 and its browser check; CP1 and CP3 demos |
| Mood | the built-ins' new look; the pump under `DYN` 1 | the user's check at CP2, in the app |
| C1, C2 | the limiter bounds every light move | S1.2 L1–L4, L6; gates H2 S-stress, S-jump |
| C3 | washout | gate W at G3; S3b.1, S3b.2 with E1–E8 and G3b |
| C4 | R5 judged at 5.09 MP with the governor held | § Gates P; S0.2 |
| C5 | no fade to the scene on stage | S0.1 C5a–C5d |
| C6 | light slews on real time | S1.2 L5; S1.1 D10 |
| C7 | `'*'` only on vs3 natives and look keys | S7.2 C7a–C7d |
| C8 | legacy copies | S4.1 C8a–C8f |
| C9 | per-scene macros | a recorded trade-off; one line to the user at CP2 |
| C10 | warp guards, tint, gamut | S3.1 C10a; S1.1 D8; S6.1 U2 |
| C11 | no pass samples its own target | S3.1 C11a; S5.1 C11c |
| C12 | no compile, no big allocation on a visible frame | S3.1 C12a, C12b; S3.2 C12c; S5.1 C12d; gate C12-cue |
| N1 | react before the slew; `REACT_MAX` caps | S1.2 L7, L8 |
| N2 | `reset` on engine frames; `stale` apart | S1.2 N2a–N2d; S1.1 D9; S3b.1 E6; gate S-cut with 1 s holds |
| N3 | no lift; skip `faithful()` | S3b.1 E2, E3; gate W with `LOW=1` |
| N4 | NaN guards | S1.2 N4a, N4b; S3b.1 E4, E7; S3b.2 V8, harness E8 |
| N5 | flash pairs | S0.2 FP1–FP6; S1.2 N5a; H2 rule (c) |
| N6 | the stock clamp | S1.2 L1b; G2's `vs3` figure |

`thoughts/spec_veejay_wizard.md` §7 and a creative spec §8 were not in the brief; this epic's acceptance IDs are R1–R6 of the epic spec.

## Research gaps (none blocks the plan; each has an owner and a fallback)
| Gap | What is missing | Owner | Fallback |
|---|---|---|---|
| G10 (design) | the original's exposure wiring, `O/main.js:2552-2588` | S3b.1 reads it as text | the design's table values stay |
| G11 (design) | the show output's size and mode: a second R5 judging point | the lead | R5 is judged at 5.09 MP only |
| G12 (design) | the donor's `POST_RANGES` for vignette, lens, brightness | S2.1 reads them; K3, K4 | the limiter's vignette leg scales by `vigRange`, whatever it is |
| G13 (design) | the 8 scenes of the `vs3-look-analyser` H2 run | the lead | the fixed list in § Gates H2 |
| G4 (design) | how the E panel draws `group` on the look rows | S2.2's browser check | host.ts:157, :162 show that a labelled `long` is a select and that `group` folds float rows today; a missing fold is one small UI step |
| G14 (new) | whether a harness can pin the governor at scale 1; whether Ink at 5.09 MP holds `minScale` 1 | S0.2 + the lead's baseline run | a lighter scene for P; else 1.93 MP × 2.64 plus one fullscreen run by the user |
| G15 (new) | the exact value write path for the harness (`gl/live.ts` `panel.setValue`, named at midi.ts:7) | S0.2 | — |
| G16 (new) | whether `parseScene` keeps value keys that are not inputs yet | S4.1 reports | S4.1 merges right after S3.2 instead of before |
| G17 (new) | the donor's `BASE_POST.brightness` is taken as 1.4 (the literal at host.ts:99) | S2.1, test K2 | stop and report: the "picture unchanged" claim of S2.2 depends on it |
| G18 (new) | whether the donor table names the hot preset exactly `★ morphogen 2.0 · magma — Magmatic Eye` (the name comes from `g1b.txt` l. 11) and whether we keep it today | S3.3 | `★ sand — token` |
| G19 (new) | the fields the donor scenes expose for the chain (`fxHint` on signal, `fxWet()` on limitless, `faithful()` on morphogen 2.0) were not read in the copied kit | S3.2, S3b.2 | a missing field reads as null / 1 / false |

Open judgement calls for the lead (not gaps):
1. `hot0` (§ The light limiter): confirm or route to the skeptic.
2. W2's factor against the pre-step build for the 3 default rows (§ Gates W).
3. The `vs3`-analyser luma figure at G2: the clamp at 1 darkens loud passages against today (N6's residue). Only "brighter" blocks.
4. The six deviations of § Deviations.

## Gate record
The lead fills it. Status: PASS / FAIL / BLOCKED / UNKNOWN. UNKNOWN is never PASS. A PASS needs runner evidence: commit SHA, command, exit code, path.

| stage | status | reviewer | evidence | waiver |
|---|---|---|---|---|
| S2 design + skeptic | PASS | `system-designer` (response), `architecture-skeptic` (recheck), 2026-11-21 | `agents/architecture-skeptic/skeptic_vs3_engine_2026-11-21.md` §4, l. 191-192: «PASS with findings», no BLOCKER or HIGH open; commit `803abb2`; `agents/STATE.md` HEAD «VS3 ENGINE: LEAD PICK» | — |
| S3 spike + user | UNKNOWN | the user | no spike in this epic; the user's check runs at CP2, in the app | — |
| S4 plan | PASS | lead, 2026-11-21 | this artifact (24 parts joined by the lead, part 21 re-ordered); all 6 deviations accepted, W2 factor 1.4 for the default rows accepted, the S-stress fallback list accepted, `hot0` + NaN-at-entry additions accepted | — |
| S4 coverage | UNKNOWN | `test-architect` | not run: the lead's lean call (`agents/STATE.md` HEAD 2026-11-21: «no test-architect (the skeptic named the test IDs)») | WAIVED by the lead 2026-11-21 (the user's speed preference; test IDs from the skeptic recheck §4) |
| S6 gates + AV QA | UNKNOWN | lead, `tester` | S8.1 | — |
| S7 user | UNKNOWN | the user | — | — |

### Step gates (S5 build)
| Gate | After | Checks (§ Gates) | status | evidence |
|---|---|---|---|---|
| baselines | S0.2 | H2 S-all ×2; W defaults ×2; luma ×2; P validity at both sizes | UNKNOWN | |
| G2 | S2.2 | luma ±.01 (`ours`), the `vs3` figure; H2 S-jump(2) at 250 ms and 125 ms | UNKNOWN | |
| G3 | S3.2 | H2 S-all, S-stress, S-jump, S-cut; W on 8 rows (decides 3b); P warp only at both sizes; C12-cue | UNKNOWN | |
| G3b | S3b.2, if built | W all rows + `LOW=1`; H2 S-all no rise, + a breakdown → drop window; S-cut 1 s, S-jump; `servo.mjs` | UNKNOWN | |
| G3p | S3.3 | H2 P-hot-1; W on the preset | UNKNOWN | |
| user's check | CP2 | ok / not ok, in the app | UNKNOWN | |
| G5 | S5.2 | H2 L-styles, L-stress, L-jump; P warp + glitch at both sizes | UNKNOWN | |
| G6 | S6.1 | luma of vs3 Lasers ±.01; H2 on Ink with hueDrift at its top | UNKNOWN | |
| G7 | S7.1 | H2 P-hot, L-stress; W on the 5 brightest presets | UNKNOWN | |
| G8 | S8.1 | P per scene + the 10-minute run; H2 `all`; the gates on the final commit; R5 per preset class | UNKNOWN | |

Coder steps (status `[ ]` in § Steps; the lead ticks each after its merge with green gates): S0.1, S0.2, S1.1, S1.2, S2.1, S2.2, S3.1, S3.2, S3.3, S4.1, S5.1, S5.2, S6.1, S7.1, S7.2. Conditional: S3b.1, S3b.2, S8.2. Lead: S8.1.

