# Plan - donor-mode audio analyser (Tier 3 S4)

## TL;DR
- Variant A rev 2 becomes 17 coder steps in 5 checkpoints.
  - CP1: the warm donor core, with the donor sources live in the Sources tab.
  - CP2: the read point (`boundStep`, raws, trail, clocks, new names), hidden.
  - CP3: the Spectrum texture and the mode switch.
  - CP4: S6 tooling (fixtures, parity replay, browser harnesses; scratch only).
  - CP5: P4 `kickAccent`, the last step.
- Donor mode cannot be reached from the UI before S3.3, the switch step. Master stays shippable after every merge.
- Each of the 45 coder-owned matrix IDs is in exactly one step (`## Coverage index`). The 21 lead rows and the 2 user rows are in `## S6 (lead)`.
- Eight deltas against the inputs need the lead's eye (`## Deltas`). The main one: the literal pin that moves in `bind.test.ts` is `:72-73`, not `:81`.
- The user said "plan, then STOP" (2026-11-18). No step is dispatched until the user says go.

## Freshness
- 2026-11-18, planner (Fable 5.2), master `4e7f0c6`. STATE HEAD read: the pick is logged (`76e6ab4`).
- Read, the brief's ranges: spec L1-49; design L26-204 and L299-404; matrix L19-65, L767-825 and every section 2 row by test ID (Grep); dsp A1 L20-48; the gaps file, whole.
- Read beyond the brief, to avoid inventing a fact. These were narrow reads; the planner has no shell, so graphify was not run.
  - Design L1-25 and L257-271 (Part B, gap G6).
  - `web/src/`: `scenes/calib.ts` L1-253, `scenes/calib.test.ts` L1-59, `bind.ts` L1-100, `bind.test.ts` L52-91, `fx/syn.ts` L18-135 and L256-291, `fx/syn.test.ts` L210-226, `fx/types.ts` L10-32, `clock.ts`, `gl/post.ts` L28-63, `gl/live.ts` L236-257, L312-327 and L374-390, `app.ts` L286-321 and L340-419, `audio/settings.ts` L40-107, `ui/SourcesTab.tsx` L1-75.
  - `scratchpad/dsp-donor/donor-model.ts` L17-52. Greps: `SOURCE_IDS`, the imports of `gl/post.ts` and `fx/syn.ts`, `audioTex`, `syn_Prime`, `syn_FadeInOut`.
- The design's code anchors match the tree at `4e7f0c6`. Every `file:line` in this plan is at that commit. Coders re-check anchors with graphify.
- The plan is stale if `fx/syn.ts`, `gl/live.ts`, `gl/post.ts`, `bind.ts`, `scenes/calib.ts` or `app.ts` L291-419 change before S5 starts.

## Chosen variant
- File: `agents/system-designer/design_audio_donor_mode.md`.
- Sections: Variant A (L26-204), as overridden by Skeptic response (L299-367), Lead pick decisions 1-9 (L368-387) and Lead addendum (L389-404).
- Chosen: 2026-11-18 by the lead, commit `76e6ab4`, logged in STATE HEAD.
- In scope: Part A (donor mode) and Part B item P4. Backlog, not planned: P6 `g60`, the Reactivity and AudioSpeed knobs, deviance hits for our detector.
- The plan has 18 parts: this file, then `plan_audio_donor_mode.part2.md` to `.part18.md`. The lead concatenates them in order.


## Deltas (planner findings against the inputs; the lead confirms each)
1. **The `bind.test.ts` pin.** The literal pin is `:72-73`: the keys of `out`, and the count `3 + BAND_COUNT + 5 + 3 + 7 + 3 + 1`. `:81-84` derives from `SOURCE_IDS` and passes unedited. S1.5 moves `:72-73`; S5.1 adds 1 to the count.
2. **The `calib.test.ts` pin.** `ROWS` is imported at `:7` and used at `:11`, `:16`, `:21` and `:30`. All become `rows(0)` in S1.5, and `:14` also drops the donor ids. Donor tiles get no panel inputs (the planner's call on design gap G6), so `:50-59` stays unedited.
3. **`donorChain` goes into `fx/syn.ts`,** not `gl/post.ts` (lead item C7 names `gl/post.ts` or `live.ts`). It needs `SYN_BIND`, and `pushTrail` needs it. In `gl/post.ts` it would make the cycle `gl/post.ts` -> `fx/syn.ts` -> `gl/post.ts`. T8a-c stay in `gl/post.test.ts`, so the matrix command holds.
4. **The T5 fixture.** A committed test cannot read the git-ignored `scratchpad/dsp-donor/out/kanine.json`. T5 uses a seeded synthetic BassHits train.
5. **Three rows are asserted in another form than their wording.**
   - T2g: the reference is the swapped-source chain (design rev 2, C1), not `synValue` (the row keeps the rev 1 wording).
   - T1j: sigma is internal to the core. The test reads it through the Level swing of an AM tone (the swing is proportional to 1 / sigma).
   - T9a: the core computes `kickAccent` (design Part B), so the test is in `audio/donor.test.ts`, not `audio/drums.test.ts`. "Kick peak stays 1" is the existing drums pin, unedited.
6. **`HIT_DT`.** Lead decision 8 says "tick at >= HIT_DT - 2 ms". The later addendum and the lead rulings say ">= 30 ms", which is the form the gaps lane measured. The plan uses >= 30 ms; it is one constant. ⚠️ Assumption, needs confirmation.
7. **PrimeBang.** No ported scene reads `syn_PrimeBang` or `syn_PrimeAndBang` at `4e7f0c6` (only a comment in `overload.glsl`, and the pin). The "intended look change" in the H9 ruling is empty today.
8. **M2.** The user can see `kickAccent` only after S5.1 builds the source (design Part B). The plan reads M2 as a gate on any later binding of it, not on S5.1.


### Lead rulings on the deltas (2026-11-18)
- Deltas 1, 2, 4, 5 and 8: confirmed as written.
- Delta 3: confirmed. `donorChain` goes in `fx/syn.ts` (this avoids the import cycle), and T8a–c stay in `gl/post.test.ts`.
- Delta 6: confirmed. A Hits tick fires when ≥ 30 ms have passed since the last tick: this is the measured form (`dsp_donor_mode_gaps_2026-11-18.md`). The "− 2 ms" tolerance in decision 8 was the skeptic's proposal for a 16.7 ms tick, and the 30 ms tick supersedes it.
- Delta 7: noted. The H9 intended look change is empty today; it applies to any later port that reads `syn_PrimeBang` / `syn_PrimeAndBang`.
- Gate record: the lead set the statuses for S0–S4 plan (evidence in each row). S4 coverage stays UNKNOWN until the test-architect runs it.

## Parameters (every constant is ours)
| Item | Value | Source |
|---|---|---|
| Bands, Hz | all 30-16000; Bass 30-150; Mid 250-2000; MidHigh 2000-6000; High 6000-16000 | dsp A1 |
| Level | norm on the 10 s stats (mean = .5, +-2 sigma = 0 / 1); attack 30 ms, release 150 ms; 0 while silent | dsp A1 |
| Hits | tick `HIT_DT` 0.030 s; `THETA` 2.25; flux stats 2 s; decay tau Bass .12, Mid .10, MidHigh .08, High .06 s; `syn_Hits` = the max of the 4 | dsp A1, gaps G4 |
| Silence | `silent` = `frameRms <= SILENT_RMS` (`app.ts:313`, no debounce); stats and the Presence / Intensity accumulators hold; `EDGE_SKIP` 0.025 s | gaps G1 |
| Presence | EMA tau 2 s of the 60 s norm (N60) | dsp A1 |
| Intensity | clamp(.5 + 2.5 * (EMA 6 s of (.8 * N60 Bass + .2 * N60 High) - .5)) | design C11 |
| FadeInOut | rise tau 1.5 s, fall tau 2.5 s; starts at 1 | dsp A1, C10 |
| BassExpoCurve | s += dt / 4 while N60 Bass > .55, else s -= dt; value expm1(3s) / expm1(3) | dsp A1 |
| PrimeBang | 1 at `fired`, then e^(-t / 0.3 s). PrimeAndBang = `build` | design C11 |
| InputLevel | clamp((peakDb + 60) / 60) | design C11 |
| Beat family | OnBeat tau .1 s; kick fallback >= .25 s apart; BPMTwitcher tau .05 s; ease T = min(.2 s, half a beat); BPM 50-220, 120 before the first grid | dsp A1 |
| Spectrum | r clamp((dB + 100) / 70); g per bin (dB + 3 dB/oct) against its decaying min / max (+.05 / -.1 dB per frame), EMA .5; b = [1 2 1] / 4 blur of g, EMA .2; a = .5 + .5 * wave | dsp A1 |
| Core `dt` | clamped to [0, 0.1] s | design Contracts |
| Mix | 1/2 per s (a 2 s ramp) | design R1 |
| kickAccent | a = min(1, .7 * 10^((L - mu) / 20)); mu += (L - mu) / 8; L = the max Bass dB from the frame before the kick frame through the first frame >= 16 ms after it (`ACCENT_HOLD` 0.016 s). The value rises on the kick frame and rises again while L grows. The fall runs from the kick frame. mu takes the final L. Decay tau .12 s | gaps G3; dsp_kickaccent_linein_2026-11-19 pick (c) |

## Checkpoints

### CP1 (S1.1-S1.5): the warm donor core, donor sources live
- The thinnest end-to-end slice: audio in -> the core -> `src` -> meters that move in the Sources tab.
- **Frozen contract:**
```ts
// audio/donor.ts
export interface DonorIn { beat: number; bpm: number; confidence: number; kick: boolean; fired: boolean; build: number; peakDb: number; silent: boolean }
export interface Donor {
  update(magDb: Float32Array, wave: Float32Array, dt: number, g: DonorIn, out: Sources): void
  seedBeat(n: number): void
  readonly spectrum: Uint8Array // 512 x 4, rebuilt by update()
}
export function createDonor(sampleRate: number, fftSize: number, seed?: number): Donor
export const DONOR_GROUPS: readonly { label: string; ids: readonly string[] }[] // 5 groups, 31 ids
export function intensityStep(ema: number, bassN60: number, highN60: number, dt: number): number
export function intensity(ema: number): number
export function primeBang(age: number): number
export function inputLevel(peakDb: number): number
export function mixStep(mix: number, target: number, dt: number): number
// audio/settings.ts
export interface AudioSettings { /* ... */ analyser: 'ours' | 'donor' }
// scenes/calib.ts
export function rows(donorMix: number): readonly (readonly string[])[]
```
- **`src` keys:** the 31 listed ids (design L109-114); plus `syn_BeatTime`, `syn_BPMTwitcher`, `syn_BPM`, `syn_BPMConfidence`, `syn_PrimeAndBang` (not listed in the UI); plus `donorMix` (0..1, written by `app.ts`).
- **Demo:** `cd web && npm run dev`, load a track, open the Sources tab. Five new groups (`donor levels`, `donor hits`, `donor presence`, `donor macros`, `donor beat`) show live meters. Levels hover near the middle, Hits flick on drums, Presence climbs through a section, OnBeat pulses on the beat. In the Panel, bind an own scene's input to `syn_BassHits`: it moves. The calibration scene still shows 21 tiles. Syn scenes look as before.


### CP2 (S2.1-S2.5): the read point, hidden
- **Frozen contract:**
```ts
// gl/post.ts
export interface Chain { b: Binding; state: BindState }
export function boundStep(x: Chain & { donor?: Chain; flash?: FlashState }, s: Sources, w: number, onsets: number[], dt: number, t: number): number
// fx/syn.ts
export function donorChain(name: string, b: Binding): Binding | undefined
export function synValue(name: string, ours: number, s: Sources, w: number): number
export function synClock(y: number, c: Clock, v: Values, dt: number, w: number): number
export function pushTrail(bytes: Uint8Array, states: BindState[], s: Sources, dt: number, w?: number): void // 8 states
// fx/types.ts
export interface Clock { u: string; rate: Rate; frame?: true; donor?: Rate }
```
- **`SYN`:** `syn_FadeInOut` is a raw. `syn_PrimeBang` and `syn_PrimeAndBang` are bound inputs.
- **Order at the read point:** our chain and the donor chain are each shaped by the input's own binding. The two outputs crossfade by `w`. `flashGate` runs last. At `w` 0 the output is ours, bit for bit. A library tile has `w` 0.
- **Demo:** there is no UI yet. In the dev console run
  `localStorage.setItem('vjw.audio', JSON.stringify({ ...JSON.parse(localStorage.getItem('vjw.audio') ?? '{"v":1}'), analyser: 'donor' }))`
  and reload ("the forced mode" in the steps). Play a track on a syn built-in such as `syn/deeper`: it reacts to the donor values, and its light steps are no harsher than before. Store `analyser: 'ours'` the same way and reload: the scene is as on master.

### CP3 (S3.1-S3.3): the Spectrum texture and the switch
- **Frozen contract:**
  - `gl/engine.ts`: `audioTex.donor` (512 x 1 RGBA8) and `setDonorSpectrum(bytes: Uint8Array)`.
  - `fx/types.ts`: the texture kind `'spectrum'`.
  - A syn scene that reads `syn_Spectrum` also has the sampler `_synSpectrumDonor` and the uniform `_synMix`.
  - The Sources-tab control calls `settings.patch({ analyser })`.
- **Demo:** `npm run dev`, Sources tab: the control "analyser: ours | donor" sits above the groups. Flip it mid-track on a syn scene. The look crossfades over 2 s, with no flash, no stutter and no scene cut. Reload: the mode is kept. In the Panel, each `syn_*` input shows "donor". The calibration scene shows the donor tiles while the mode is donor. With no music in donor mode, a scene that reads `syn_FadeInOut` fades to black (the donor's behaviour, lead decision 5).

### CP4 (S4.1-S4.3): S6 tooling, scratch only
- **Frozen contract:** the command lines of matrix rows H1, H1b, H2, H3, H4a-c, H5, H6c and H7. Scripts are under `scratchpad/donor-mode/` and `scratchpad/dsp-donor/`. Fixtures: `scratchpad/fx_audio/dnb200-synth.wav`, `kick-train-120.wav` and `kick-train-120.json` (the kick times).
- **Demo:** the app does not change. The lead runs `node scratchpad/donor-mode/h2-flash.mjs scratchpad/fx_audio/dnb174-arr.wav` on 3 scenes and reads the JSON.

### CP5 (S5.1): P4 `kickAccent`, last
- **Frozen contract:** `src.kickAccent` (0..1), listed in the `drums` group of `sourceGroups()`, bound nowhere.
- **Demo:** `npm run dev`, the calibration scene: the drums row has a `kickAccent` tile. It jumps on each kick, higher on a louder kick, and falls like the `kick` tile. This is the user's M2 look.


## Steps
Rules for every step:
- **GATES** = `cd web && npm run lint && npm run typecheck && npm test`. A step is done when GATES exits 0 on its branch. The report gives the test count (baseline 722).
- One step per coder dispatch, in its own worktree, time box 45 min. Drift is marked `**Changed during implementation:**`.
- No step adds an npm dependency. No `donor/` code is copied. `scratchpad/dsp-donor/*` is our own prototype with no licence header; S1.1-S1.3, S4.1 and S5.1 may copy from it.
- Vitest fixtures are synthetic: seed 1, 48 kHz, FFT 1024 (512 bins of 46.875 Hz), `dt` 1/60 s unless a test says otherwise. A test never reads `scratchpad/`. Audio is never committed.
- Lanes (2-agent cap): S1.1 -> ... -> S3.3 is one chain. S2.1 can run beside S1.1-S1.5. S4.1 can run beside S1.4-S3.3. Merges stay one at a time.

### S1.1 [x] Donor core A: bands, Level, silence, Presence, macros
Invoke the `ponytail` skill (full) before writing code. Run graphify before reading code.
- **Goal:** the pure core exists, with the level family and the macros. Nothing calls it yet.
- **Files:** new `web/src/audio/donor.ts`, new `web/src/audio/donor.test.ts`.
- **Source:** port `scratchpad/dsp-donor/donor-model.ts` (`stats()`, `ease()`, the LCG, the `createDonor` body) with its options fixed: `hold: 'music'`, `holdAcc: true`, `edge: 0.025`, `BASS_HI` 150. Drop `Opts`, the env knobs, the `steps` counters and the integrated Time. If the file is gone, `## Parameters` and dsp A1 are the spec.
- **Behaviour:**
  1. `createDonor(sampleRate, fftSize, seed = 1)` returns `{ update }`. `update(magDb, wave, dt, g, out)` writes into `out` and allocates nothing.
  2. `dt` is clamped to [0, 0.1] s. A `dt` of 0 (the app's first frame, `app.ts:301`) leaves every value finite.
  3. `DonorIn` is declared whole (CP1 contract). This step reads `fired`, `build`, `peakDb` and `silent`. `silent` replaces the prototype's own -60 dBFS test.
  4. Per band: dB = 10 * log10(mean bin power), floored at -120. Level = one-pole(norm on the 10 s stats), attack 30 ms, release 150 ms; 0 while `g.silent`.
  5. Silence (G1): while `g.silent`, no stat takes the frame, and the Presence and Intensity accumulators hold. For `EDGE_SKIP` (0.025 s) after a silent -> music edge, `prev` is NaN and no stat takes the frame.
  6. It writes `syn_Level`, `syn_BassLevel`, `syn_MidLevel`, `syn_MidHighLevel`, `syn_HighLevel`, the five `...Presence`, `syn_Intensity`, `syn_FadeInOut` (starts at 1), `syn_BassExpoCurve`, `syn_PrimeBang`, `syn_PrimeAndBang` (= `g.build`) and `syn_InputLevel`. Each is clamped to 0..1.
  7. Pure exports: `intensityStep` (the 6 s EMA of .8 * bass + .2 * high, one tick on), `intensity(ema)`, `primeBang(age)`, `inputLevel(peakDb)`. Formulas: `## Parameters`.
- **Tests (`audio/donor.test.ts`):**
  - T1a: a tone with seeded +-1 dB jitter (a constant band has sigma 0 and reads 0). The median of `syn_Level` over 20-60 s is in [0.40, 0.70].
  - T1c: 10 s of tone, then 5 s with `silent`: `syn_FadeInOut` <= 0.15; `syn_Level` <= 0.05; the sum of 2 * Level * dt over the 5 s is 0 (the donor Time rate).
  - T1h: a `dt` of 30 s gives the same FadeInOut and Presence as a `dt` of 0.1 s (<= 1e-9).
  - T1j: an AM tone (+-6 dB at 2 Hz) for 10 s, 60 frames at -120 dB, the tone again. The Level swing (p90 - p10) after / before is >= 0.5 when `silent` is set on the first quiet frame (sigma <= 2x). It is < 0.5 when `silent` stays false (the `paused` pattern).
  - T1k: music from frame 0: `syn_FadeInOut` is 1 at the start and >= 0.90 at 1 s.
  - T1l: `intensityStep` held for 60 s at (0.7, 0.3): `intensity` is within 0.01 of 0.80.
  - T1m: `fired` false for 10 s of kick train: `syn_PrimeBang` is 0 on every frame. 0.3 s after one `fired` it is in [0.36, 0.38].
  - T1n: `inputLevel` at -60, -30, 0, +3 gives 0, 0.5, 1, 1 (1e-9).
- **Done-check:** GATES.
- **Depends on:** none.
- **Changed during implementation:** (1) `createDonor(sampleRate, fftSize)` has no `seed` yet, and the LCG and `ease()` are not ported. Their only readers (RandomOnBeat, ToggleOnBeat) come in S1.3, and `noUnusedLocals` / `noUnusedParameters` reject them unused. S1.3 adds `seed = 1` as the trailing optional parameter; no call changes. (2) The second `update()` parameter is named `_wave` until the S1.3 Spectrum reads it (`noUnusedParameters`). The positional signature is the frozen one, so the S1.1 tests stay valid. (3) `prev` (the flux's last dB, NaN in the edge window) comes with the flux in S1.2. S1.1 has the edge window that S1.2 reuses: `held = g.silent || t - edgeT < EDGE_SKIP`. While `held`, no stat takes the frame and Presence / Intensity hold (the prototype's `holdAcc` with `edge`). (4) The `Donor` interface is not declared yet: it needs `seedBeat` and `spectrum` (S1.3). The return type is inferred.


### S1.2 [x] Donor core B: Hits
Invoke the `ponytail` skill (full) before writing code. Run graphify before reading code.
- **Goal:** the five Hits values exist and do not depend on the frame rate.
- **Files:** `web/src/audio/donor.ts`, `web/src/audio/donor.test.ts`.
- **Source:** the prototype's `flux: 'sub'` form with `sub: 0.030` and `z: 2.25` (`scratchpad/dsp-donor/donor-model.ts`).
- **Behaviour:**
  1. `HIT_DT` (0.030 s), `THETA` (2.25) and `EDGE_SKIP` are named constants at the top of the file.
  2. A Hits tick fires when >= `HIT_DT` have passed since the last tick. Only on a tick:
     - flux = max(0, band dB now - band dB at the last tick);
     - the 2 s flux stats take the flux;
     - z = (flux - mean) / sigma.
  3. When z crosses `THETA` upward: H = max(H, clamp(.5 + (z - THETA) / (2 * THETA))).
  4. On every frame: H = H * e^(-dt / tau), with tau Bass .12, Mid .10, MidHigh .08, High .06 s.
  5. `syn_Hits` = the max of the four band Hits. The step writes the five `...Hits`.
  6. Silence and `EDGE_SKIP` cover the flux too: no flux and no flux stat while `g.silent` or inside the edge window.
- **Tests (`audio/donor.test.ts`):**
  - T1b: a noise bed (so the flux sigma is above 0), then a +12 dB, 60 ms burst on the Bass bins. There is 1 upward crossing. `syn_BassHits` falls from its peak to 1/e in [0.10, 0.14] s.
  - T1p: a 60 Hz burst gives `syn_BassHits` >= 0.5 once and `syn_HighHits` 0. A 10 kHz burst 1 s later gives the reverse.
  - T1q: two bass bursts 150 ms apart give 2 hits. 40 ms apart they give 1 or 2 hits.
  - T1i: 10 s of kick train, 5 s at -120 dB with `silent`, 10 s of kick train.
    - In the first 2 music frames after the resume, at most 1 band triggers (the matrix threshold).
    - No frame within 50 ms of the resume has 4 or more of the 5 bands triggering (the gaps lane's burst).
    - BassHits in the 5 s after the resume, divided by BassHits in the 5 s before the pause, is >= 0.50. The test prints the ratio.
  - T1g: a 60 s seeded train (kick at 174 BPM, hats, a noise bed) as PCM. Analyser frames are cut at 60, 120 and 144 Hz: a 1024-sample Blackman window that ends at round(t * sampleRate), as `scratchpad/dsp-donor/gaps/gaps.ts` does it.
    - BassHits per minute and HighHits per minute at 120 and 144 Hz are within +-10 % of the 60 Hz values.
    - The 30 Hz values are printed (a report, not a gate).
    - Before writing an FFT or a drum synth, check `audio/analysis.ts` and `audio/synth.ts` for one.
  - Mutant check, run once and not committed: with `HIT_DT = 0`, T1g must fail. The report gives both sets of numbers.
- **Done-check:** GATES.
- **Depends on:** S1.1.
- **Changed during implementation:** (1) The core has no trigger output (frozen contract), so the tests count a hit event as a frame in which a `...Hits` value rises above its previous frame's value. The decay only lowers a value, so only a trigger raises it. (2) T1p uses a steady bed with no jitter, so the wrong-band count is exactly 0 (a jitter bed gives random crossings in every band). Its 10 kHz burst is 60 ms like the 60 Hz one, not the matrix row's 5 ms: a burst shorter than one frame falls between two 30 ms Hits ticks. (3) T1g reuses `audio/synth.ts` (`kick`, `hats`, `room`, `rng`) and `fft.js`. `synth.ts` now exports `burst` for the 300 Hz-5 kHz snare (one word; a test-only file). (4) The Hits tick clock also runs through silence and the edge window. After a pause the ticks keep the no-pause phase, so T1i's runs A and B tick on the same frames.


### S1.3 [x] Donor core C: beat family, Spectrum bytes, groups
Invoke the `ponytail` skill (full) before writing code. Run graphify before reading code.
- **Goal:** the core is complete: 36 keys in `out`, the Spectrum bytes, `seedBeat`, `DONOR_GROUPS`.
- **Files:** `web/src/audio/donor.ts`, `web/src/audio/donor.test.ts`.
- **Source:** the prototype's beat family and its `tex` arrays. PrimeBang is not taken from the prototype's own Hits (S1.1 feeds it from `g.fired`).
- **Behaviour:**
  1. Beat event: floor(`g.beat`) passes a new integer while `g.bpm` > 0. At most one event per frame. A backward re-anchor fires none. With `g.bpm` 0 the event is `g.kick`, at least 0.25 s apart.
  2. `syn_BeatTime` grows by 1 per event. `seedBeat(n)` sets the count to `n`.
  3. `syn_BPMTwitcher` = BeatTime - e^(-age / 0.05). `syn_OnBeat` = e^(-age / 0.1). `age` = s since the last event.
  4. Per event `syn_ToggleOnBeat` flips 0 <-> 1 and `syn_RandomOnBeat` takes a new seeded value. Both move with `ease(age, min(0.2 s, half a beat))`.
  5. `syn_BPM` = `g.bpm` clamped to 50-220. With no grid it holds the last value (120 before the first). `syn_BPMConfidence` = `g.confidence`.
  6. `syn_BPMSin`, `syn_BPMSin2`, `syn_BPMSin4`, `syn_BPMSin8` = .5 - .5 * cos(2 * pi * phase / n). `syn_BPMTri`, `...2`, `...4`, `...8` = 1 - |2 * fract(phase / n) - 1|. phase = `g.beat`; with no grid it freewheels at the held BPM. There is no confidence factor.
  7. `spectrum`: 512 x 4 bytes, rebuilt on each `update()` (r, g, b, a as in `## Parameters`). Its state runs in every mode (lead decision 2).
  8. `DONOR_GROUPS`: the 5 groups and 31 ids of design L109-114, in that order.
- **Tests (`audio/donor.test.ts`):**
  - T1d: 60 s of a 174 BPM stub grid with a backward re-anchor at 30 s. The per-frame change of `syn_BeatTime` is 0 or 1. |steps - beats| <= 1. It never decreases.
  - T1e: the grid at beat 3.2, then `seedBeat(7)`: the next event gives `syn_BeatTime` 8.
  - T1r: a ramp from 174 to 140 BPM over 20 s: no frame steps by 2; |steps - beats| <= 1.
  - T1f: 10 s of seeded noise at -6 dBFS, then 2 s of bins at -Infinity dB.
    - Every `DONOR_GROUPS` id is finite and in [0, 1].
    - Every key of `out` is finite.
    - `spectrum` holds integers in 0..255.
    - The same holds after one `update()` with `dt` 0.
  - T1o: 3000 `update()` calls on seeded noise, 3 runs: p95 <= 0.5 ms per call in each run (measured: 31 microseconds).
  - PA1 (plan-added): after one `update()`, `Object.keys(out)` is exactly the 31 ids plus `syn_BeatTime`, `syn_BPMTwitcher`, `syn_BPM`, `syn_BPMConfidence`, `syn_PrimeAndBang`.
- **Done-check:** GATES.
- **Depends on:** S1.2.
- **Changed during implementation:** (1) Five points differ from the prototype; the plan text holds in each. The Spectrum floors `magDb` at -120 dB: in the prototype a -Infinity bin (digital silence, also `app.ts:208`'s first frames) sets its min to -Infinity, so g and b stay NaN for good. The kick gap counts this frame's `dt`, so kicks are >= 0.25 s apart exactly; the prototype allowed 0.25 s plus one frame. `age` starts at Infinity, so OnBeat and BPMTwitcher read exactly 0 before the first beat. The Toggle / Random ease starts from the core's own last value, not from the caller's `out`. The held BPM is clamped to 50-220 before it times the ease and the freewheel. (2) Tests beyond the list: T1r has a second arm (no grid: the kick train steps BeatTime, a flam 0.1 s after every 4th kick does not). A new test, "S1.3 item 4", checks that Toggle flips and that Random takes `lcg(seed)`'s next value, both eased over 0.2 s, for seeds 1 and 2. T1f also asserts that the g and b bytes are above 0 after 1 s of noise follows the silence: a mutant without the -120 dB floor fails it, because Uint8Array stores NaN as 0. T1k checks all 36 keys on the dt-0 frame. (3) `DONOR_GROUPS` is typed `readonly SourceGroup[]` (`bind.ts`, the same shape as the contract's type). `spectrum` has fftSize / 2 texels (512 at FFT 1024). As in the prototype, the b blur skips texels 0 and 511 (they stay 0).


### S1.4 [x] The `analyser` setting, the warm core in `app.ts`, the mix
Invoke the `ponytail` skill (full) before writing code. Run graphify before reading code.
- **Goal:** the core runs on every frame in every mode and fills `src`. `src.donorMix` follows the stored mode. Nothing reads these values yet, so the app looks the same.
- **Files:** `web/src/audio/settings.ts`, `web/src/app.ts`, `web/src/audio/donor.ts` (+ `audio/settings.test.ts`, `audio/donor.test.ts`).
- **Behaviour:**
  1. `AudioSettings.analyser: 'ours' | 'donor'`. `defaults()` gives `'ours'`. `parseSettings` (`audio/settings.ts:49`) accepts only the two strings. `v` stays 1.
  2. `patch` (`:88`) takes `analyser`. A patch with an invalid `analyser` keeps the current value (T4c). It does not fall back to the default.
  3. `mixStep(mix, target, dt)` in `audio/donor.ts`: `mix` moves toward `target` by at most `dt / 2` and stays in [0, 1].
  4. `app.ts`: one `createDonor(ctx.sampleRate, fftSize)` with the main analyser's `fftSize` (1024, `audio/input.ts:16`), and one reused `DonorIn` object.
  5. `app.ts`, between `:406` (`src.energy`) and `:409` (heat scales `f.dt`): fill the `DonorIn`, then call `donor.update(magDb, wave, f.dt, donorIn, src)`.
     - `beat`, `bpm`, `confidence` = `f.sync` (this frame's grid, `:383`).
     - `kick` = `kickThisFrame` (`:319`). `fired` = `arrangeOut.fired !== null`. `build` = `arrangeOut.build`.
     - `peakDb` = `meter.db`. `silent` = `frameRms <= SILENT_RMS` (`:309`, `:313`).
  6. The mix starts at 1 when the stored mode is `'donor'`, else at 0. On every frame `src.donorMix = mixStep(mix, target, f.dt)`, with the unscaled `f.dt`.
  7. On the frame the target turns from 0 to 1: `donor.seedBeat(Math.floor(f.sync.beat))`.
  8. `arrangement.update()` (`:348`) reads no donor value. `gain()` (`:415`) runs after the core, so the user's gain and mute reach the donor sources.
- **Tests:**
  - T4a (`audio/settings.test.ts`, the pattern at `:58`): stored records with `analyser` missing, `'foo'` or `2` parse to `'ours'`; the other fields keep their stored values; `v` is 1.
  - T4b (the pattern at `:121`): after `patch({ analyser: 'donor' })` a new `createSettings` on the same store reads `'donor'`; the stored JSON under `vjw.audio` has `analyser: 'donor'`.
  - T4c: `patch({ analyser: 'donor' })`, then `patch({ analyser: 'x' })`: the value is `'donor'`, and `'x'` is not stored.
  - PA2 (plan-added, `audio/donor.test.ts`): `mixStep` goes 0 -> 1 in 2.0 s at 60 fps; a re-toggle at 0.3 continues from 0.3; the value never leaves [0, 1].
- **Done-check:** GATES. One browser check: play `scratchpad/fx_audio/dnb174-arr.wav`; in the dev console `(await import('/src/app.ts')).src.syn_BassLevel` changes between two reads (or an equal read of `src`); the console has no error. Report one frame-time number against master.
- **Depends on:** S1.3.
- **Changed during implementation:** (1) The `app.ts` anchors had moved by +1 line (`68c9b1d` added a comment line at `:54`). The block sits after `src.presence` and before the heat line, both inside the named range (after this step: `:416`, block `:417-431`, heat `:432`). (2) `AudioSettings.analyser` is required (the contract), so the typed `AudioSettings` literals in 4 more test files gain `analyser: 'ours'` (`audio/acceptance.test.ts`, `audio/features.test.ts` ×2, `scenes/shatter.test.ts`, `ui/SourcesTab.test.ts`); in `audio/settings.test.ts` `DEFAULTS` and three whole-object expectations gain it too. No assert changed. (3) `app.ts` keeps the mix in its own `donorMix` and writes `src.donorMix` from it, so a stored `sens` / `mute` on the key `donorMix` (`gain()` runs later) cannot bend the ramp. (4) T4c also asserts that a patch without `analyser` keeps it, through a reload.


### S1.5 [x] Donor sources listed; calibration `rows(donorMix)`
Invoke the `ponytail` skill (full) before writing code. Run graphify before reading code.
- **Goal:** the 31 donor sources are metered and bindable. The calibration scene shows their tiles only while the mix is above 0. This step closes CP1.
- **Files:** `web/src/bind.ts`, `web/src/scenes/calib.ts` (+ `bind.test.ts`, `scenes/calib.test.ts`).
- **Behaviour:**
  1. `bind.ts:33`: `SOURCE_IDS` appends the ids of `DONOR_GROUPS`.
  2. `bind.ts:38-50`: `sourceGroups()` puts the 5 donor groups after `camera`, before `custom` and `band`.
  3. The import of `audio/donor` into `bind.ts` is one-way: `audio/donor.ts` imports only the type `Sources` back.
  4. The Sources tab (`ui/SourcesTab.tsx:113`) and the Panel's source select (`ui/Panel.tsx:128`) list the new groups by themselves. This step does not edit them.
  5. `scenes/calib.ts:40`: `ROWS` becomes `rows(donorMix)`. At 0 it returns today's rows (no donor group). Above 0 the 5 donor rows follow them. The planner's call on design gap G6: the same `layout()`, 10 rows.
  6. `TILES` and the per-tile state (`calib.ts:42`, `:98`) cover all 52 tiles. `inputs` stay those of the `rows(0)` tiles. A donor tile is view-only: meter shape, attack 0, release 0, its palette colour, size 0.9. Not built: panel inputs for donor tiles.
  7. `draw` (`calib.ts:127`) reads `s.donorMix ?? 0`. It lays the tiles out again when the shown count changes (`:131-136`). Its loops run over the shown tiles only.
- **Tests:**
  - T3a (`bind.test.ts`): `:81-84` stays unedited. One new assert: the `DONOR_GROUPS` ids number 31, with no id twice.
  - T3b (`bind.test.ts`): `gain({ syn_BassLevel: 0.8 }, { sens: { syn_BassLevel: 0.5 }, mute: [] })` gives 0.4 (1e-6).
  - T6a (`scenes/calib.test.ts`): `rows(0)` = `SOURCE_IDS` without the bands, `presence` and the donor ids. It holds no donor id.
  - T6b: `rows(0.5)` holds each of the 31 donor ids once. Its total is the `rows(0)` count plus 31.
  - T6c: `layout(rows(1), 1728, 1118, 13, 73)`: every tile is inside the stage and on no other tile.
- **Pins moved:**
  - `bind.test.ts:72-73`. The test also runs the core for one frame. The key list adds the 5 unlisted names of PA1. The count adds `+ 31`. Reason: 31 donor ids (design L109-114).
  - `scenes/calib.test.ts:7`, `:11`, `:14`, `:16`, `:21`, `:30`: `ROWS` becomes `rows(0)`; `:14` also drops the donor ids; `:16` counts the non-donor groups. Reason: finding C8. `:50-59` stays unedited.
- **Done-check:** GATES. Browser checks:
  - The CP1 demo.
  - The Sources tab scrolls to its last group. If it does not, add one CSS rule and say so.
  - With the forced mode (CP2 demo line), the calibration scene shows 52 tiles and every label is readable. Report its billed p95.
  - If that p95 is over 5 ms: stop and report. Lever L1 is a follow-up step: redraw the stage at 10 Hz while donor rows show.
- **Depends on:** S1.4.
- **Changed during implementation:** (1) Labels: at 52 tiles, `syn_ToggleOnBeat` and `syn_RandomOnBeat` overlapped their values by 18.8 px in the 11-tile `donor beat` row. `parts()` now takes the longest label of the tile's row: `fs = min(0.14 h, w / (11.5 + 0.6 max(0, len - 11)))`. Our rows hold labels of at most 11 characters, so their divisor stays 11.5 and ours mode is unchanged. The `donor beat` row draws at about 9.9 px on a 1728 x 1118 stage. The smallest label-to-value gap is now 14 px. (2) A donor tile draws with its five inputs' defaults (`FIXED`, from the same input builder): `FIRST` has no donor id, so the shape is the meter. (3) Tests beyond the list: T3a also pins the group order (camera, then the 5 donor groups, then custom, then band). T6b also asserts that `rows(0.5)` starts with `rows(0)`, the tile prefix that the inputs rely on. The pinned layout test runs as `test.each([0, 1])`: `rows(0)` is the moved pin and `rows(1)` is T6c. It also checks the right and bottom bounds. (4) Item 3: `audio/donor.ts` imports two types from `bind.ts`, `Sources` and `SourceGroup` (S1.3 drift note 3). Both are type-only, so the runtime import stays one-way. (5) A hidden donor row's history stops, so a row that shows again replays its old 4 s once (a `ponytail:` comment). This matters only after the S3.3 switch.


### S2.1 [x] `boundStep` and `donorChain` (pure, not wired)
Invoke the `ponytail` skill (full) before writing code. Run graphify before reading code.
- **Goal:** the rev 2 read point exists as pure, tested functions. Lead items C7 and N3 are closed here.
- **Files:** `web/src/gl/post.ts`, `web/src/fx/syn.ts` (+ `gl/post.test.ts`).
- **Behaviour:**
  1. `fx/syn.ts`: `donorChain(name, b)` returns `{ ...b, source: name, shape: undefined, rate: undefined }` when `Object.hasOwn(SYN_BIND, name)` and `b.clock` is undefined. Otherwise it returns `undefined`.
  2. `gl/post.ts`: `Chain` and `boundStep` (CP2 contract). It imports `evaluate` and the types from `../bind`.
  3. Ours: `y = evaluate(x.b, s, x.state, dt)`.
  4. With `x.donor`: `yd = evaluate(x.donor.b, s, x.donor.state, dt)` on every call, so the donor chain is warm at the switch. When `w > 0`, `y` becomes `y + (yd - y) * w`.
  5. With `x.flash`: the result is `flashGate(y, x.flash, onsets, t)`. The gate is last.
  6. At `w` 0 the value before the gate is the ours value itself (a branch, no arithmetic).
- **Tests (`gl/post.test.ts`; T8 imports `donorChain` from `../fx/syn`):**
  - T7c, written first, before any product edit: run `flashGate(evaluate(b))` for `SYN_BIND.syn_BassHits` over a seeded 10 s trace on master, and paste 12 samples as the golden literal. Then at `w` 0 every frame of `boundStep` is `Object.is`-equal to that inline composition, with and without `donor`, and it matches the golden.
  - T7a: one flash input; our source silent; the donor source gives 6 one-frame hits in 1 s; `w` 1; 60 fps. The output rises through 0.5 at most 3 times.
  - T7b: a binding with `attack` 0.04 and `amount` 6 (the overrides at `scenes/builtin.ts:28-33`); one donor hit; `w` 1; 60 fps. Frame 1 is <= 0.35 of the step. Frame 2 is <= 0.60 (item N3). Run it with and without `flash`.
  - T7d: `donorChain('syn_BPMTri', { ...SYN_BIND.syn_BPMTri, amount: 0 })` at `w` 1 gives 0 on every frame. An input named `kick` has no chain, so `w` 1 changes nothing for it.
  - T5: two flash inputs share ONE `onsets` array; `w` 1; 60 s. Input A is a seeded BassHits train (about 78 per minute, jittered). Input B is a 185 BPM OnBeat train (tau 0.1 s). In every 1 s window the passes of both inputs together are <= 3. The refused onsets are counted and printed (more than 0).
  - T8a: `donorChain` is `undefined` for inputs named `bass`, `kick`, `build`, `drop` and `presence`. The binding literals mirror `scenes/serpent.ts:675-684` and `scenes/shatter.ts:695-701`.
  - T8b: `donorChain('syn_BPMTri', { ...SYN_BIND.syn_BPMTri, amount: 0 })` has `source` `'syn_BPMTri'`, `amount` 0, no `shape` and no `rate`. The `syn_HighHits` chain keeps the `attack` and `release` of `SYN_BIND.syn_HighHits`.
  - T8c: a `clock` binding on a `syn_*` input gets `undefined`.
- **Pins:** the existing `flashGate` tests (`gl/post.test.ts:73-119`) and `scenes/flash.test.ts` stay unedited and green.
- **Done-check:** GATES.
- **Depends on:** none. It can run beside S1.1-S1.5.
- **Changed during implementation:** T8c uses a clock binding on `syn_Level`, not on `syn_Time` (the matrix fixture). `syn_Time` is a SYN clock, not a `SYN_BIND` name, so it gets no chain without the clock guard and the test would pass vacuously. The test also asserts that `syn_Level` without the clock gets a chain. Stricter asserts, same thresholds: T7a = exactly 3 rises (a dead donor chain fails); T7b frame 2 > 0.5 (the hit lands); T8a adds the name `toString` (the `Object.hasOwn` guard). The T7c golden is from master `2e0a673`.


### S2.2 [x] `gl/live.ts`: bound inputs go through `boundStep`
Invoke the `ponytail` skill (full) before writing code. Run graphify before reading code.
- **Goal:** a bound SYN input crossfades to its donor chain by the mix.
- **Files:** `web/src/gl/live.ts`.
- **Behaviour:**
  1. `w` is read once per `render()`: 0 for a tile instance (`own`, `gl/live.ts:186-188`), else `s.donorMix ?? 0`.
  2. `bindInto` (`:240-257`): for a non-tile instance, a bound input gets `donor = { b, state }` when `donorChain(name, b)` returns a binding. The donor state survives a rebind, as `state` and `flash` do (`:253-255`).
  3. `render()` (`:381-383`): `y = boundStep(x, s, w, onsets, f.dt, f.time)`. The lines after it do not change.
- **Tests:** none new. Vitest cannot reach `gl/live.ts`. T7a-d and T8a-c are its proof.
- **Done-check:** GATES. One browser check, two views:
  - Ours: a syn built-in looks and reacts as on master.
  - Forced mode (CP2 demo line): `syn/deeper` reacts to the music, and by eye no step of light is harsher than in ours. H2 measures it at S6.
- **Depends on:** S2.1, S1.4.
- **Changed during implementation:** H9b does not freeze the AudioContext (the 2026-11-07 frozen pair carries FFT-quantum jitter, so its control floor is above 0). `h9b-pixels.mjs record` keeps what each frame hands the stage scene's `render()` (f.sync and the sources, mode ours) over dnb174-arr 10.5-13.5 s into `out/h9b-trace.json`; `shot` replays that one trace into a fresh `live()` instance of each scene at fixed clocks (dt 1/60, a pinned Date), no audio, and reads the 960x540 target back. The control pair is bit-stable (0), so the pass line is 0 (C2). The mutant wraps the served `boundStep`. S2.5 re-runs it with `STEP=s2.5` on the same trace file.

### S2.3 [x] Raws and LevelTrail follow the mix
Invoke the `ponytail` skill (full) before writing code. Run graphify before reading code.
- **Goal:** the SYN raws and the LevelTrail texture read the donor values in donor mode.
- **Files:** `web/src/fx/syn.ts`, `web/src/gl/live.ts` (+ `fx/syn.test.ts`).
- **Behaviour:**
  1. `synValue(name, ours, s, w)` returns `ours` unless `Object.hasOwn(SYN, name)` and `s[name]` is a number.
  2. For a count (`syn_BeatTime`, `syn_BPMTwitcher`, `syn_BPM`) it returns `s[name]` at `w` >= 0.5, else `ours`. A count never slides.
  3. For any other name it returns `ours + (s[name] - ours) * w`.
  4. `gl/live.ts:322`: `n.u[k] = synValue(k, read(f, s), s, w)`.
  5. `pushTrail(bytes, states, s, dt, w = 0)`: per channel, ours = `evaluate(TRAILED[c], s, states[c], dt)`. While `w > 0`, donor = `evaluate(donorChain(name, TRAILED[c]), s, states[4 + c], dt)`, and the byte is 255 times the crossfade. At `w` 0 the byte is the ours byte.
  6. `gl/live.ts`: the trail gets 8 states, and `:324` passes `w`.
- **Tests (`fx/syn.test.ts`):**
  - T2a: `synValue('syn_BassLevel', 0.3, { syn_BassLevel: 0.8 }, w)` is 0.3, 0.55 and 0.8 at `w` 0, 0.5 and 1 (1e-9).
  - T2b: `syn_BeatTime` with ours 6 and donor 7: 6 at `w` 0.49, 7 at `w` 0.5. No value between them, for each of the three counts.
  - T2c: `synValue('foo', 0.3, { foo: 0.9 }, 1)` and `synValue('kick', 0.3, { kick: 0.9 }, 1)` are 0.3.
  - T2g: four donor levels held for 1 s (60 frames) at `w` 1. The newest texel's 4 bytes equal the bytes of a reference `evaluate` on the swapped-source binding, stepped alongside. At `w` 0 they equal the ours bytes.
- **Pins:** the existing `pushTrail` test passes unedited (`w` defaults to 0).
- **Done-check:** GATES.
- **Depends on:** S2.2.
- **Changed during implementation:** T2g adds a fall phase after the F4 held second: 6 frames with the four donor levels at 0, the same two asserts. The held phase rises through the attack only (.05 on all four), so it cannot tell `syn_Level`'s release .3 from the others' .15; the mutant "one donor binding for all four channels" fails only in the fall. `synValue` returns ours at once when `w` is not > 0 (a branch, as in `boundStep`), so a NaN or infinite donor value never reaches ours mode. `gl/live.ts`: `run()` takes `w` as a parameter (read once in `render()`); the raw and trail lines are now `:324` and `:326`. Ours-mode replay (the S2.2 H9b method and trace, plus `builtin:audio-indicators`, the only LevelTrail reader) gives 0 differing bytes against the base commit `9ad62fa` on all 4 scenes. The control pair is 0. A one-unit trail mutant fails the replay (max 16).


### S2.4 [x] SYN clocks take a donor rate
Invoke the `ponytail` skill (full) before writing code. Run graphify before reading code.
- **Goal:** the six SYN clocks keep their position and blend to the donor rate by the mix (finding C9).
- **Files:** `web/src/fx/syn.ts`, `web/src/fx/types.ts`, `web/src/gl/live.ts` (+ `fx/syn.test.ts`).
- **Behaviour:**
  1. `fx/types.ts:22`: `Clock` gains `donor?: Rate`.
  2. `fx/syn.ts:67-71`: each of the five `...Time` entries gains `donor: [[2, '<its Level name>']]` (rate 2 * L).
  3. `fx/syn.ts:72`: `syn_CurvedTime` gains `donor: [[8, 'syn_Level', 'syn_Level', 'syn_Level']]` (rate 8 * L^3).
  4. `parseSyn` (`fx/syn.ts:272-274`) compiles `donor` as it compiles `clock`.
  5. `synClock(y, c, v, dt, w)`: a clock with no `donor`, or `w` 0, is one `clockStep(y, c.rate, v, dt)`. That is today's path, bit for bit. Otherwise it is `clockStep(clockStep(y, c.rate, v, dt * (1 - w)), c.donor, v, dt * w)`.
  6. `gl/live.ts:321` calls `synClock` with `c.frame ? 1 : dt` and `w`.
- **Tests (`fx/syn.test.ts`):**
  - T2e: with `syn_Level` 0.5 and `dt` 1/60: at `w` 1 `syn_Time` and `syn_CurvedTime` advance at 1.0 per s; at `w` 0 they advance at 0.5 and 0.75 per s (1e-6).
  - T2f: with rates 0.5 and 1.0 per s, the per-frame change at `w` 0.49 and at `w` 0.51 differ by less than 10 %.
  - PA3 (plan-added): a scene clock (`VJW_CLOCK`) with no `donor` steps the same at `w` 1 as at `w` 0.
- **Done-check:** GATES.
- **Depends on:** S2.3.
- **Changed during implementation:** `parseSyn` also walks the donor rate's names into the read set, as it walks the clock's (all six read the clock's own level, so no input changes). Stricter asserts, same thresholds: T2e also pins the five `...Time` entries by name (`donor` = 2 x its own Level) and checks `Object.is` against today's `clockStep` at `w` 0; T2f also checks the fixture's two rates (0.5 and 1.0 per s); PA3 also checks the `w` 1 step against today's `clockStep`. The anchors had moved: the clock line is `gl/live.ts:322`, `parseSyn`'s clock compile `fx/syn.ts:301-302` and `:325`. Browser check (no plan requirement, the S2.2 H9b method and trace, `scratchpad/donor-mode/s24/h9b-pixels-s24.mjs`): ours mode gives 0 differing bytes against the base `b0aee9e` on alien-cavern, deeper, glob and audio-indicators (control pair 0); a mutant that ignores `w` (the donor rate at `w` 0) fails on the three clock readers (max 255, 240, 255); a forced mix of 1 and 0.5 steps every SYN clock at dt x ((1 - w) x ours + w x donor) within 3e-14 (deeper `syn_BassTime` 1.224 per s at L 0.612 for w 1, 0.830 per s at L 0.553 for w 0.5).

### S2.5 [x] SYN names: `syn_FadeInOut` as a raw, `syn_PrimeBang`, `syn_PrimeAndBang`
Invoke the `ponytail` skill (full) before writing code. Run graphify before reading code.
- **Goal:** every donor audio name has a SYN entry that the donor value can feed.
- **Files:** `web/src/fx/syn.ts` (+ `fx/syn.test.ts`).
- **Behaviour:**
  1. `fx/syn.ts:89`: `syn_FadeInOut` becomes `{ raw: () => 1 }`. It is now a `uniform float`. Ours stays 1, and a tile stays 1 (`w` 0).
  2. New entries: `syn_PrimeBang: b('syn_PrimeBang', 0, 0)` and `syn_PrimeAndBang: b('build', 0, 0)`. They are the same in both modes (our `fired` and our `build`).
- **Tests (`fx/syn.test.ts`):**
  - T2i: a scene that reads `syn_PrimeBang` and `syn_PrimeAndBang` parses with no `unsupported` text. Its `bind` holds the two bindings above.
  - T2h: no def outside `fx/syn/` declares an input named `syn_*`. Walk the registered defs, or grep `web/src`.
- **Pin moved:** `fx/syn.test.ts:220-222`. The unsupported example becomes a name that is still outside `SYN` (for example `syn_Nope`). Reason: PrimeBang is now supported (design, "How SYN switches").
- **Done-check:** GATES. Compile check, from the repo root, with a fresh Vite on a free port:
  `node scratchpad/donor-vs2/b1b/check.mjs <port> $(grep -l syn_FadeInOut web/src/fx/syn/*.glsl)`
  All 16 files must print `OK`. A file that fails (the name inside a constant expression) gets a 1-line body edit; its licence header stays.
- **Depends on:** S2.3 (`synValue` feeds the raw), S1.5 (`syn_PrimeBang` is in `SOURCE_IDS`; `fx/syn.test.ts:232` and `doc.test.ts:20` check it).
- **Changed during implementation:** two more pins in `fx/syn.test.ts` move with item 1 and item 2, beside `:220-222`: the uniform-mapping test (`:54-56`: `'#define syn_FadeInOut 1.0'` is now `'uniform float syn_FadeInOut;'`, and the raws are `['syn_FadeInOut', 'syn_BeatTime']`, reading 1 and 7) and the SYN size (`:237`: 46 → 48 entries; the title names the two new ones). The `SYN` anchor was `fx/syn.ts:90`. T2h walks the registered defs (`fx/catalog.ts`, every id outside `syn/`) with the four import mocks of `gl/scene.test.ts`; it also asserts that the natives are in the walk and that the `syn/` defs show `syn_*` inputs, so it cannot pass empty. Mutants: a `syn_Level` input on `native/tunnel` and on `isf/Chromatic Aberration` each fail T2h; `syn_PrimeAndBang` on source `syn_PrimeAndBang`, and `syn_PrimeBang` removed, each fail T2i. Compile check 16/16 `OK`, no body edit (14 files read the uniform; `pop` and `transparent_isoslices` name it in comments only). H9b s2.5 (`scratchpad/donor-mode/s25/h9b-pixels-s25.mjs`: the S2.4 copy plus a `MUT_FADE` and a `SRC` arm; the S2.2 trace): the control pair is 0 on the 4 scenes, so the pass line is 0. Before (base `167fa89`) against after is 0 on all 4. The S2.2 before against the S2.5 after is 0 (`audio-indicators`: its S2.3 before). The one-unit `boundStep` mutant fails (max 243, 243 and 46; `audio-indicators` has no bound input, 0). FadeInOut's ours raw at .996 fails on `glob` only (max 16). At `w` 1 a donor FadeInOut of .5 against 1 changes `glob` only (max 231); at `w` 0 it changes nothing. No PrimeBang re-roll shows: no bundled scene reads `syn_PrimeBang` or `syn_PrimeAndBang`.


### S3.1 [x] Donor Spectrum texture: plumbing
Invoke the `ponytail` skill (full) before writing code. Run graphify before reading code.
- **Goal:** the GL side of the donor Spectrum exists. No scene uses it yet.
- **Files:** `web/src/gl/engine.ts`, `web/src/fx/types.ts`, `web/src/gl/live.ts`.
- **Behaviour:**
  1. `gl/engine.ts:107`: `audioTex.donor`, a 512 x 1 RGBA8 texture (linear, clamp), and `setDonorSpectrum(bytes)`: one `texSubImage2D`.
  2. `fx/types.ts:31`: the kind `'spectrum'` joins `ShaderDef.textures`.
  3. `gl/live.ts:221`: the kind `'spectrum'` binds `audioTex.donor`. A node with that kind gets `n.u._synMix = w` on each frame.
- **Tests:** none (GL only). The typecheck is the check.
- **Done-check:** GATES. The app boots with no GL error in the console.
- **Depends on:** S2.2 (`w`).
- **Changed during implementation:** none in behaviour. `node()` seeds `u._synMix = 0` for a `'spectrum'` texture, and `run()` writes `w` into it while that key exists (a tile: 0). The texture exists in every mode (2 KB at boot); no code uploads to it before S3.2. The browser check went beyond the done-check (`s31-check.mjs`, ours and forced donor): no console error, `gl.getError()` 0, the texture reads back byte for byte after `setDonorSpectrum`, and a probe def with the kind draws bytes × `w` at `w` 0, .5 and 1 (max error 0). Two mutants fail it (no `_synMix` write; the kind bound to black: 255 at `w` 1). The ours-mode replay (the H9b method and trace; alien-cavern, deeper, glob, audio-indicators) against the base `57462c6`: 0 differing bytes; the control pair is 0.

### S3.2 [x] Donor Spectrum: the shader mix and the upload
Invoke the `ponytail` skill (full) before writing code. Run graphify before reading code.
- **Goal:** `syn_Spectrum` crossfades from our toy rows to the donor rgba by the mix. The R2 name pin lands here.
- **Files:** `web/src/fx/syn.ts`, `web/src/app.ts` (+ `fx/syn.test.ts`).
- **Behaviour:**
  1. `SPECTRUM` (`fx/syn.ts:127-130`) also declares `uniform sampler2D _synSpectrumDonor; uniform float _synMix;`. `_synSpectrum(x)` returns `mix(<today's vec4>, texture(_synSpectrumDonor, vec2(x, 0.5)), _synMix)`.
  2. `parseSyn`: a scene that reads `syn_Spectrum` also gets `textures._synSpectrumDonor = 'spectrum'`.
  3. `app.ts`: after `donor.update(...)`, `if (mix > 0) setDonorSpectrum(donor.spectrum)`. In ours mode there is no upload.
- **Tests (`fx/syn.test.ts`):**
  - T2d: for every `web/src/fx/syn/*.glsl` but the preamble, each `syn_*` name the file reads is in `SYN`, and each audio name is fed in donor mode. "Fed" means one of: a key the core writes (PA1), a clock entry with `donor`, the `'spectrum'` texture entry (`syn_Spectrum`), the `'trail'` texture (`syn_LevelTrail`). Not audio, so skipped: the `target` entry, `syn_MediaType`, the `'black'` textures. Missing = 0. The file list is derived, not hardcoded.
  - PA4 (plan-added): a parsed scene that reads `syn_Spectrum` has both texture entries, and its `fs` declares `_synMix`.
- **Done-check:** GATES. Compile check as in S2.5, on `$(grep -l syn_Spectrum web/src/fx/syn/*.glsl)`. One browser check with the forced mode: `syn/audio-indicators` shows a moving spectrum. In ours it looks as on master.
- **Depends on:** S3.1, S2.4, S2.5.
- **Changed during implementation:** (1) The upload line sits right after the `mixStep` line (still after `donor.update`), so it tests this frame's mix: app.ts's own `donorMix`, the value `gl/live.ts` reads as `w`. (2) `parseSyn`'s fs list skips the `_synSpectrumDonor` key, because `SPECTRUM` declares that sampler (a second declaration fails to compile). Two pins in the `textures` test move with item 1 and item 2: the `textures` `toEqual` gains `_synSpectrumDonor: 'spectrum'`, and the `_synSpectrum` text is now the mix. A new assert checks that the sampler is declared once. The anchors had moved: `SPECTRUM` was `fx/syn.ts:157-160`. (3) T2d reads each file's names as `parseSyn` does: the body without comments, plus the `VJW_CLOCK` JSON. That is 602 file/name pairs over 85 files; the guard is n > 2 x files. `syn_Spectrum` counts as fed when the file's parsed def has `_synSpectrumDonor: 'spectrum'`. Mutants: without the donor texture, T2d, PA4 and the `textures` test fail. With `syn_Time` stripped of its `donor` rate, T2d fails on 38 files. PA4 runs over the bundled readers (`audio_indicators`, `bouncy_hexagons`, `entombed_silicon_dreams`, `neon_city`) and also asserts that only readers carry the donor texture. (4) Evidence (`scratchpad/donor-mode/s32/`): compile 85/85 `OK`. H9b s3.2 runs on 7 scenes: the 4 standard ones plus the 3 other readers. Before each scene, the replay task uploads fixed toy and donor spectra, so a reader draws a real spectrum and the donor texture differs from ours. The control pair is 0, so the pass line is 0. Before (`47a8fd4`) against after is 0 on all 7. The one-unit leak mutant (mix weight `max(_synMix, 1/255)` at `w` 0) fails on audio-indicators (max 255), bouncy-hexagons (109) and entombed (16). At `w` 1, two donor patterns differ on those 3 readers (max 255, 230, 252) and give 0 on the 3 non-readers. neon-city gives 0 in every arm: its built-in runs `lighting_mode` 1 (Hits) and never calls `freq()`, the one spectrum read. Live check (`s32-check.mjs`, dnb174-arr, audio-indicators): in ours mode `donorMix` is 0, `audioTex.donor` reads back all 0 after 5.5 s of music (no upload), and the r, g and b rows are equal. In donor mode `donorMix` is 1, the texture is non-zero and changing, the r and g rows differ (10.6 px mean), and the spectrum moves. Neither mode logs a console error. Not measured: the donor fetch that each `_synSpectrum` call now makes in ours mode, multiplied by 0. If a cost shows, the lever is a uniform branch on `_synMix > 0.0`.

### S3.3 [x] The mode switch (Sources tab) and the Panel hint
Invoke the `ponytail` skill (full) before writing code. Run graphify before reading code.
- **Goal:** donor mode becomes visible to the user. This is the switch step; it closes CP3.
- **Files:** `web/src/ui/SourcesTab.tsx`, `web/src/ui/Panel.tsx` (+ the stylesheet, only if a rule is needed).
- **Behaviour:**
  1. Sources tab, above the groups: a two-option native control "analyser: ours | donor". It shows `settings.get().analyser` and calls `settings.patch({ analyser })`.
  2. Panel: while `analyser` is `'donor'`, an input whose name starts with `syn_` shows a read-only "donor" hint beside its binding. The binding controls stay editable: they shape the donor value too.
  3. No other logic. The ramp, the seed and the persistence exist since S1.4.
- **Tests:** none new: the step adds no pure logic. H1 drives this control at S6.
- **Done-check:** GATES. Browser: the CP3 demo, with a reload.
- **Depends on:** S3.2.
- **Changed during implementation:** (1) The control is a `<select>` in a `label.row` ("analyser" in the 80 px column), so it uses the existing styles and the stylesheet does not change. (2) The Panel hint tests `donorChain(k, b)` (`fx/syn.ts`), the same test `gl/live.ts` uses to wire the donor chain, in place of the bare `syn_` prefix. The two agree on every SYN default binding (none is a clock). They differ only on a `syn_*` input that the user switches to a clock: no donor value reaches that input, so it shows no hint. (3) Brief fix: each Sources-tab row label has a `title` with its full text (a source id, or a custom band's name), because the 80 px column cuts long donor ids. (4) Evidence: `scratchpad/donor-mode/s33/` (worktree; `s33-check.mjs`, port 5181, `builtin:deeper`, `dnb174-arr.wav`), all 5 checks PASS. Ours: 0 of 5 `syn_*` rows carry the hint. After the flip to donor: `donorMix` rises monotonically from 0 and reaches 1 at 2033 ms, `vjw.audio` stores `donor`, 5 of 5 rows carry the hint and no other row does. After the reload: `donorMix` is 1 on its first frame, so it does not ramp again, and the select reads `donor`. Flip back: 0 at 2044 ms, `ours` is stored, 0 hints. No console error.


### S4.1 [x] S6 tooling A: fixtures and the offline parity replay
Invoke the `ponytail` skill (full) before writing code. Run graphify before reading code.
- **Goal:** the lead can run H4a, H4b, H4c and H7 on the product core.
- **Files (scratch, git-ignored, never committed):** `scratchpad/donor-mode/gen-fixtures.mjs`, `scratchpad/dsp-donor/parity.ts`, `scratchpad/dsp-donor/score.py` (extended). No product file.
- **Behaviour:**
  1. `gen-fixtures.mjs` writes into `scratchpad/fx_audio/`:
     - `dnb200-synth.wav`: 200 BPM, a kick on each beat, a hat on each off-beat, 60 s, mono, 48 kHz;
     - `kick-train-120.wav`: kicks at 120 BPM, 30 s; and `kick-train-120.json`: the kick times to 1 ms.
  2. `parity.ts` imports `web/src/audio/donor.ts`. It replays a `.f32` or `.wav` file through the product core. It takes our grid, kicks and `fired` as the S1 driver does (`scratchpad/dsp-donor/donor.ts`, `base.ts`).
  3. Its command line is the matrix's: `node out/parity.mjs <file> <rate> <out.json> [samplesPerFrame]` (800 = 60 Hz by default; 400 = 120 Hz; 333 = 144 Hz; 1600 = 30 Hz).
  4. `score.py` prints, per run: the rows of `out/score-v2.txt` (H4a, H4b); Hits per minute per band (H4c); the latency from each kick time to `syn_BassHits` >= 0.5, p50 and p95 (H7).
- **Tests:** none (scratch). GATES must stay green.
- **Done-check:** GATES. `rolldown parity.ts -o out/parity.mjs -p node -f esm` builds. One run on `kick-train-120.wav` prints a latency line. The report gives the ffmpeg line that decodes the three tracks (the PCM was deleted; see gaps Freshness).
- **Depends on:** S1.3. It can run beside S1.4-S3.3.
- **Changed during implementation:** (1) `kick-train-120.wav`: 58 kicks from 1 s, every 0.5 s plus a seeded 0-33 ms delay each, so the H7 latency meets every phase of the 30 ms Hits tick. Both fixtures sit on a -51 dBFS room tone, so `silent` never fires. (2) A Hits event is a rise of the Hits value above its last frame's value, as in `audio/donor.test.ts`, because the core exposes no trigger flag. (3) H7 measures from the kick to the end of the analyser window (frame time + 20 ms LEAD). Its p95 counts only the kicks with a BassHits rise within 250 ms; `score.py` lists the missed kicks and does not gate them. (4) `python3 -I score.py` scores the parity outputs; `score.py s1` reprints `out/score-v2.txt` byte for byte. H4a compares 152 values and 23 counts. Our `syn_Intensity` is compared with the reference's `xInt3` column. (5) ffmpeg can pipe straight into parity (`/dev/stdin`), so no PCM file is needed.

### S4.2 [x] S6 tooling B: the switch and flash harnesses
Invoke the `ponytail` skill (full) before writing code. Run graphify before reading code.
- **Goal:** the lead can run H1 and H2.
- **Files (scratch):** `scratchpad/donor-mode/lib.mjs`, `h1-switch.mjs`, `h2-flash.mjs`. Evidence goes to `scratchpad/donor-mode/out/`.
- **Behaviour:**
  1. `lib.mjs`: headless Chrome through Playwright-core with `--disable-audio-output`; open the app on a port; load a file; set the mode (a click on the Sources-tab control, or `localStorage` before load); sample values per frame. Reuse `scratchpad/ed/cp4-60s.mjs` and the `60s flash audit` mode of `scratchpad/gpu3d/g3-bench.mjs`.
  2. `h1-switch.mjs <track> [port]` writes `out/h1-<track>.json`. It switches through the Sources-tab control at 3 points (intro, drop body, break) and records:
     - (a) the drop events against an ours-only run; (b) the annotated drops that fired;
     - (c) frame-to-frame mean-luma rises above 0.10 per 1 s, in the 4 s around each switch;
     - (d) shader compiles and program links during the switch; (e) the ramp time.
  3. `h2-flash.mjs <fixture> [port]` writes `out/h2-<fixture>-<run>.json`. For every syn built-in in `BUILTIN` (derived), at mix 1, after a 5 s settle, over a 30 s window, it records:
     - (a) luma steps above 0.10 per 1 s; (b) allowed onsets per s; (c) refused onsets per input and per scene.
  4. Refused onsets: use the hook the existing audit reads. If there is none, add one counter under the existing debug flag in `gl/live.ts` (5 lines at most) and say so in the report.
- **Tests:** none (scratch).
- **Done-check:** GATES. A 3-scene smoke run of `h2-flash.mjs` on `dnb174-arr.wav` writes its JSON. The full runs are the lead's (S6).
- **Depends on:** S3.3, S4.1 (the 200 BPM fixture).
- **Changed during implementation:**
  1. Refused onsets: no hook existed (the audit reads only `window.__flash`, the allowed onsets), and the brief forbade `web/src` edits (a parallel lane). So no counter went into `gl/live.ts`. Instead `lib.mjs` wraps `boundStep` in the dev server's served `post.ts` (the `h9b-pixels.mjs` pattern). A refusal is an input's `flash.blocked` turning true in the call, on the shared budget only (`onsets === window.__flash`). Proof: Canvas (⚡ `syn_OnBeat`) on `dnb200-synth.wav` gave 75 allowed (max 3 per 1 s) + 25 refused = 100 onsets in 30 s, which is 200 BPM.
  2. The shared checkout refused writes from the lane. The three files are in the worktree's `scratchpad/donor-mode/` (git-ignored), and the lead copies them. They use absolute paths for playwright-core and `annot.json`, with `out/` next to the script.
  3. `lib.mjs` waits until Start's compile-all warm-up ends (`store.compiling`, the `trackview/dump.mjs` rule) before the track starts. Its compiles stay outside the windows.
  4. H2: the mode is stored before load (`vjw.audio` = `{ v: 1, analyser: 'donor', pick }`, pick from the fixture name), so the mix is 1 from the first frame; each window records its minimum mix, and a window below 1 fails. Per scene: seek to 10 s, cut and hold, `governor.reset()` at 2 s, then the window at 5 s (music 15-45 s). One run takes about 50 min (85 scenes x 35.5 s), not 43 min, because of the 5 s settle. Env `IDS` picks scenes; `<run>` is the next free number.
  5. H1: a drop event is `src.drop` rising by more than 0.25 in one frame (the arrangement's fire). An annotated drop is hit when `-0.5 <= t - y <= 4` s (`trackview.py`). The window is [-1, +3] s around the select's change event. Gate (c) counts luma rises; |change| steps are printed too. Default switch points come from `annot.json`: intro = the first build's start / 2, drop body = the first drop + 8 s, break = the second build's start. Env `AT`, `DROPS`, `END` and `SCENE` override them. The held scene is `builtin:deeper` (5 bound `syn_*` inputs). E opens the HUD panel, not the editor, so no Library tile bake runs. The default port is 5174, as in the matrix commands.


### S4.3 [x] S6 tooling C: cost, toggle, reload and calibration harnesses
Invoke the `ponytail` skill (full) before writing code. Run graphify before reading code.
- **Goal:** the lead can run H3, H1b, H6c, H5 and H6b.
- **Files (scratch):** `scratchpad/donor-mode/h3-cost.mjs`, `h1b-toggle.mjs`, `h6c-reload.mjs`, `h5-calib.mjs` (thin files on `lib.mjs`); `scratchpad/ed/cp4-60s.mjs` (edited).
- **Behaviour (the matrix rows give the full expectations):**
  1. `h3-cost.mjs`: run A (ours) and run B (donor, after the ramp), 60 s each, the same scene stack ending in an `own/flash` layer. It records billed p95; `jsMs` p95, p99 and max; late frames; donor texture uploads per frame (the count of 512 x 1 RGBA `texSubImage2D` calls).
  2. `h1b-toggle.mjs`: 20 toggles in 60 s. It records the program count and the texture count before and after, and the JS heap growth.
  3. `h6c-reload.mjs`: the stored mode is `'donor'`. It forces `webglcontextlost`. After the reload it records the mode, whether the donor texture is non-zero within 2 s, and `syn_FadeInOut` at 1 s.
  4. `h5-calib.mjs`: the calibration scene in donor mode for 60 s. It records billed p95, late frames, the std of each donor tile's value over 10 s, and a Library tile's pixel difference between the modes. It saves `out/h5-calib.png`.
  5. `scratchpad/ed/cp4-60s.mjs`: headless, and the mode is donor for the second half of the run (H6b).
- **Tests:** none (scratch).
- **Done-check:** GATES. Each script completes a 10 s smoke run.
- **Depends on:** S4.2.
- **Changed during implementation:**
  1. Files: the shared checkout is written by a parallel lane, so the five scripts, the edited `lib.mjs` and a lane Vite config (`s43/vite.config.mjs`, a private dep cache) are in the worktree's `scratchpad/` (git-ignored); the lead copies them. `lib.mjs` gains `__up` (the 512 x 1 RGBA `texSubImage2D` count, in the init script), `tail()` (the built-in plus the billed `own/flash` tail as `test:<name>+flash`, g3-bench's FL binding) and `cost()` (a window of app frames: billed gpuMs p50/p95 on scale-1 frames, `jsMs` from `governor.frame`, late = rAF > 1.5 x median, uploads per frame, the `donorMix` range). h1/h2 behave as before. Env `SEC` sets the window length of every script (default 60; smoke `SEC=10`).
  2. H3: one page, A then B, both from the same seek (`AT` 10 s). The mode turns through `settings.patch` (the select's path). The default scene is `builtin:audio-indicators`: it samples the donor Spectrum, pushes the LevelTrail donor chains and reads the `syn_InputLevel` raw, at 2.7 ms billed. `builtin:deeper` bills about 9 ms at its res .85 in both modes, so the 5 ms line would fail on the scene alone. Env `SCENE` picks another one.
  3. H1b: the toggles go through the Sources-tab select (as H1 does) on `builtin:deeper`. Programs and textures alive = created and not deleted (a Set each, every WebGL2 context). The heap is read after a forced GC (CDP `HeapProfiler.collectGarbage`, `Runtime.getHeapUsage`). The alive counts are also logged after each toggle.
  4. H6c: (b) needs music from the reload's first frames (T1k, C10). Re-dropping the file after the 6.5 s warm-up wait measured a fade-in after silence: 0.52 at 1 s, the same with or without the C10 fix. So the reloaded page records from `domcontentloaded`, clicks Start if shown (autoplay runs the context, `input.ts:168`) and drops the file at once from the page's Cache API (it is stored before the loss, so 4 MB does not cross the route after it). The report gives the boot silence: FadeInOut at the recorder's first frame and `bootToPlayMs`. "Non-zero texture" = an R byte (the spectrum dB) above 0, read back through a framebuffer on `audioTex.donor`. The A channel is the wave, 128 on silence, so any byte would read non-zero before the play.
  5. H5: the calibration shows 53 tiles (22 ours + 31 donor), not 52: S5.1 added `kickAccent`. The gate is `ours + 31`. Billed is measured with the `own/flash` tail; the still is taken from the plain built-in after 4 s, so it has a full history strip. A donor tile "moves" when its std is > .01 in at least one 10 s block of the window. A strict every-block list is printed, not gated, because PrimeBang moves only at a drop and FadeInOut only at a silence edge. The calib `draw()` ms (Canvas2D + upload, the C8 cost) is printed beside the billed number. The Library tile check renders three fresh `tile()` instances in one task on one frozen frame and src, at `donorMix` 0, 0 again (the floor) and 1, and compares them byte for byte on a lit tile.
  6. cp4-60s: it now opens and loads through `../donor-mode/lib.mjs`. That makes it headless with `--disable-audio-output`, waits out Start's compile-all warm-up and adds the starved-worklet reload. Phase B runs after `analyser: 'donor'` and its ramp. It prints an H6b PASS line and exits 1 on a late frame.

### S5.1 [x] P4 `kickAccent` (the last step)
Invoke the `ponytail` skill (full) before writing code. Run graphify before reading code.
- **Goal:** our detector gains an unbound extra source for the kick's loudness (spec R5, Part B). The user can then see it (M2).
- **Files:** `web/src/audio/donor.ts`, `web/src/bind.ts` (+ `audio/donor.test.ts`, `bind.test.ts`). Scratch: `scratchpad/donor-mode/h8-p4-align.mjs`, and the P4 column in `scratchpad/dsp-donor/parity.ts`.
- **Behaviour (gaps G3):**
  1. In `update()`, on a frame with `g.kick`: L = 10 * log10 of the summed power of bins 1-3, the max of this frame and the frame before.
  2. `a = min(1, 0.7 * 10^((L - mu) / 20))`, then `mu += (L - mu) / 8`. `mu` starts at the first kick's L.
  3. `out.kickAccent = a * e^(-age / 0.12)` (the `kick` tau, `audio/features.ts:16`). It is 0 before the first kick.
  4. `bind.ts`: `kickAccent` joins `SOURCE_IDS` and the `drums` group. No binding names it. The calibration scene shows its tile by itself.
  5. `kick`, the worklet and `audio/drums.ts` are not touched.
- **Tests:**
  - T9a (`audio/donor.test.ts`): after 20 kicks at one level, a kick gives 0.70. A kick 6 dB lower gives 0.35. A kick 6 dB higher gives 1 (the clamp). The value stays in [0, 1]. It falls to 1/e in 0.12 s. The "kick peak stays 1" clause is the existing drums pin, unedited.
  - T3c (`bind.test.ts`): no binding in `web/src/scenes` or `web/src/fx` names `kickAccent` (walk `BUILTIN` and the defs' `bind`, or grep).
- **Pins moved:** `bind.test.ts:73`: the count adds `+ 1`; PA1's key list adds `kickAccent`. Reason: P4 (spec R5; design Part B). No other pin moves.
- **Scratch:**
  - `h8-p4-align.mjs <input> [port]` feeds the file as a fake capture device (`--use-fake-device-for-media-stream --use-file-for-fake-audio-capture`), logs `kick` and `kickAccent` per frame, and prints the offset of each `kickAccent` rise from its kick time (p50, p95).
  - `parity.ts` gains the P4 column for H4d (r and CV against the 150 Hz truth).
- **Done-check:** GATES. Browser: the CP5 demo.
- **Depends on:** S1.5, S4.1. It runs last.
- **Changed during implementation:** (1) L is the core's own Bass band dB (bins 1-3 at 48 kHz / 1024), the mean bin power floored at -120 dB, not a second sum over bins 1-3. The mean-vs-sum offset (-4.8 dB) cancels in L - mu, and the floor keeps mu finite when a kick lands on digital silence. (2) T9a adds two asserts: the -6 dB probe puts its level one frame early (this pins "the max of this frame and the frame before"), and the next kick at the old level reads .763 (this pins mu's 1/8 step). Five mutants fail T9a (L of this frame only, tau .1, no clamp, N 4, mu start -6 dB). A `kick` -> `kickAccent` rebind in `scenes/builtin.ts` fails T3c. (3) `bind.test.ts:76` holds the count pin (`:73` at the plan's commit). (4) The scratch files are in the coder worktree's `scratchpad/` (the isolation blocks writes to the main checkout); the lead copies them out. `parity.ts` prints one P4 line: the before (kick CV), the after (kickAccent CV, p10/p50/p90), and r against the truth in both forms. `h8-p4-align.mjs` also takes `[seconds]` and `[file]` (a file-source contrast run), and it logs the analyser's Bass dB per frame.
- **Finding for the lead (not a drift):** on line-in, the planned L form is erratic. Line-in drains a kick on arrival, so the drain frame's 1024-sample window holds only 0-17 ms of the kick, and the frame before holds none. On equal kicks (`kick-train-120.wav`, fake capture), the drain-frame kickAccent reads p10/p50/p90 .09/.92/1 (CV .49-.64, an L spread of 24-35 dB). The H8 offset still passes (p95 11.6-17.4 ms). The same window with 1 frame after the drain reads .67/.70/.72 (CV .02). A file source reads .67/.70/.72 with the planned form (CV .02, the offline value). The evidence is `scratchpad/donor-mode/out/h8-kick-train-120{,-file}.json`.
- **Changed during implementation (S5.1b, lead 2026-11-19):** L window = audio-dsp pick (c), see dsp_kickaccent_linein_2026-11-19.md


## S6 (lead): runner evidence
- These rows are not coder steps. The lead runs them after CP5. The H2 runs need only CP3 and S4.2, so they may start after CP4.
- Each row needs the commit SHA, the command, the exit code and the evidence path. UNKNOWN is never PASS.
- Harness Chrome runs with `--disable-audio-output`. Long runs go under `caffeinate`.

1. **G-LINT, G-TYPE, G-TEST.** GATES on master. Pass: exit 0. Record the test count (baseline 722). Only the pins named in `## Coverage index` moved.
2. **H6a.** Start a fresh Vite on :5180. From the repo root run `node scratchpad/donor-vs2/b1b/check.mjs 5180 $(ls web/src/fx/syn/*.glsl | grep -v preamble)`. Save the output to `scratchpad/donor-vs2/merge-check/synchk-donor-mode.txt`. Pass: every scene prints `OK` (baseline 85/85).
3. **H4a, H4b, H4c, H7.** Decode the three tracks (the ffmpeg line in gaps Freshness), then run the matrix commands on `parity.ts`. Pass:
   - H4a: each printed value within 0.01 of `out/score-v2.txt`; counts exact.
   - H4b: Level median in [0.50, 0.70]; Presence and Intensity body > break on at least 6 of 7 drops; BassHits per kick in [0.8, 2.0]; BPM error at most 1 %.
   - H4c: every band within +-10 % of its 60 fps rate at 120 and 144 fps; 30 fps is reported.
   - H7: latency p95 at most 40 ms (⚠️ Assumption, needs confirmation).
4. **H3, H5, H6b, H6c, H1b.** The matrix commands. Pass:
   - H3: billed p95 at most 5 ms in both runs; `jsMs` p95 B - A at most 0.5 ms; 0 late frames; uploads A = 0, B = 1; p99 and max reported.
   - H5: billed p95 at most 5 ms with 52 tiles; 0 late; every donor tile moves; a Library tile is equal in both modes.
   - H6b: 0 late frames on both fixtures.
   - H6c: the mode is kept; the texture is non-zero within 2 s; `syn_FadeInOut` >= 0.90 at 1 s.
   - H1b: program and texture counts are equal before and after; heap growth at most 10 MB (⚠️ Assumption, needs confirmation).
5. **H1.** `node scratchpad/donor-mode/h1-switch.mjs <track>` on Kanine, Sub Focus and Bicep. Pass: 0 false drops; 0 missed drops; at most 3 luma steps per 1 s; 0 compiles; the ramp takes 2.0 +- 0.1 s.
6. **H2.** Two runs with the GPU otherwise idle, 30 s per scene, about 85 min in total: `dnb174-arr.wav` and `dnb200-synth.wav`, every syn built-in. Pass: 0 scenes over 3 luma steps per 1 s; 0 scenes over 3 allowed onsets per s. The refusals per input and scene are listed.
7. **M3, M4.** From the H2 report the lead picks one remedy per flagged scene: accept, add the name to the scene's `VJW_FLASH`, or set the OnBeat divisor. The lead records the R6 working reading and the silence policy in STATE.
8. **H4d, H8.** After S5.1: the P4 column of `parity.ts`, and `node scratchpad/donor-mode/h8-p4-align.mjs`. Pass: r >= 0.60 and CV >= 0.20 on 3 of 3 tracks; offset at most 21.3 ms (⚠️ Assumption, needs confirmation).
9. **AV QA.** The `tester` runs after rows 1-8.
10. **User rows.** M2: the user looks at the `kickAccent` tile (CP5 demo). M1, optional: the user's ear check on the 7 annotated drops.
11. **Not applicable (lead rulings 2026-11-18).** G-R80: no binding of our own sources is retuned. H9: not a frozen pair.

A fix that H2 asks for is a new step, planned from the H2 report. Examples: a name added to a scene's `VJW_FLASH`; a raw or clock name accepted at `fx/syn.ts:283`. This plan does not build such a step in advance.


## Acceptance mapping
| ID | Proof in steps (test IDs) | Lead or user evidence (S6) |
|---|---|---|
| R1 switch, persisted, no false drop, no flash | S3.3 (the control); S1.4 (T4a, T4b, T4c, PA2); S1.1 (T1k); S1.3 (T1e); S1.5 (T3b); S2.1 (T7c); S2.3 (T2b); S2.4 (T2f) | H1, H1b, H6c |
| R2 every `syn_*` name live, 0..1, BeatTime +1 | S1.2 (T1p); S1.3 (T1d, T1f, PA1); S2.3 (T2a, T2g); S2.5 (T2h, T2i); S3.2 (T2d) | H4a |
| R3 formula sanity | S1.1 (T1a, T1c, T1h, T1l, T1m); S1.2 (T1b, T1g, T1q); S1.3 (T1r) | H4b; M1 (user, optional) |
| R4 cost, warm core | S1.3 (T1o); S1.4 (the core runs in every mode) | H3, H5, H7 |
| R5 Part B, no pin moves without a reason | S5.1 (T9a, T3c); the pins in `## Coverage index` | H4d, H8, G-TEST; M2 (user) |
| R6 I-FL1 | S2.1 (T5, T7a, T7b, T7d, T8a, T8b, T8c); S2.2 (the wiring) | H2, H1 (c), M4 |
| R7 gates green, calibration tiles | GATES in every step; S1.5 (T6a, T6b, T6c) | G-LINT, G-TYPE, G-TEST, H5, H6a |
| Lead item C7 | S2.1: `donorChain` exported; T8a-c | - |
| Lead item N3 | S2.1: T7b, frame 2 <= 0.60 | - |
| Lead item: H2 over every syn built-in | tooling S4.2; fixtures S4.1 | S6 row 6 (two runs, about 85 min) |
| Findings C2, C5, C9, C10, C11 | S1.1 (T1j, T1k, T1l-n); S1.2 (T1g, T1i); S2.4 (T2e, T2f) | H4c, H6c |
| Spec deviations (lead record) | Goal 1 knobs: not planned. Goal 2: S2.1 keeps our envelope shaping on donor values. | R6 working reading: M4 |

## Coverage index (for the test-architect's S4 coverage)
| Step | Coder-owned matrix IDs | Plan-added | Pins moved |
|---|---|---|---|
| S1.1 | T1a, T1c, T1h, T1j, T1k, T1l, T1m, T1n | - | - |
| S1.2 | T1b, T1g, T1i, T1p, T1q | - | - |
| S1.3 | T1d, T1e, T1f, T1o, T1r | PA1 | - |
| S1.4 | T4a, T4b, T4c | PA2 | - |
| S1.5 | T3a, T3b, T6a, T6b, T6c | - | `bind.test.ts:72-73`; `scenes/calib.test.ts:7, 11, 14, 16, 21, 30` |
| S2.1 | T5, T7a, T7b, T7c, T7d, T8a, T8b, T8c | - | - |
| S2.2 | none (wiring; proof is S2.1) | - | - |
| S2.3 | T2a, T2b, T2c, T2g | - | - |
| S2.4 | T2e, T2f | PA3 | - |
| S2.5 | T2h, T2i | - | `fx/syn.test.ts:220-222` |
| S3.1 | none (GL plumbing) | - | - |
| S3.2 | T2d | PA4 | - |
| S3.3 | none (UI; H1 drives it) | - | - |
| S4.1 | none (tooling for H4a-c, H7) | - | - |
| S4.2 | none (tooling for H1, H2) | - | - |
| S4.3 | none (tooling for H1b, H3, H5, H6b, H6c) | - | - |
| S5.1 | T3c, T9a | - | `bind.test.ts:73` (+ 1); the PA1 key list |

- Total: 45 coder-owned IDs, each in one step. Lead-owned (21): G-LINT, G-TYPE, G-TEST, G-R80, H1, H1b, H2, H3, H4a-d, H5, H6a-c, H7, H8, H9, M3, M4. User-owned (2): M1, M2.
- The brief names three pins. `fx/syn.test.ts:220-222` and `scenes/calib.test.ts:13` (its lines 14 and 16) move as named. For `bind.test.ts:81` see `## Deltas` item 1.


## Gate record
- The lead fills this table. Per the planner definition every status is `UNKNOWN`: the planner certifies nothing.
- The `evidence` column carries the verdict that the lead has already recorded (STATE HEAD 2026-11-18, the S4 brief). The lead sets the status from it.

| stage | status | reviewer | evidence | waiver |
|---|---|---|---|---|
| S0 spec | PASS | lead | Lead-recorded: done. `thoughts/spec_audio_donor_mode.md` (R1-R7, lead record L45-48) | - |
| S1 audio-dsp + gaps | PASS | audio-dsp | Lead-recorded: done; R3 PASS on the prototype; G1, G4, G3 adopted. `agents/audio-dsp/dsp_donor_mode_2026-11-18.md`, `dsp_donor_mode_gaps_2026-11-18.md` (`4e7f0c6`); `scratchpad/dsp-donor/out/score-v2.txt`, `scratchpad/dsp-donor/gaps/` | - |
| S2 design | PASS | system-designer | Lead-recorded: done, rev 2. `agents/system-designer/design_audio_donor_mode.md` (`73284b2`, response `5403fb5`) | - |
| S2 skeptic | PASS (with findings) | architecture-skeptic | Lead-recorded: recheck PASS with findings (C1 closed; C7 -> S2.1; N1 -> M4; N2 -> H2; N3 -> S2.1). `agents/architecture-skeptic/skeptic_audio_donor_mode.md`, section Recheck | - |
| S2 lead pick | PASS | lead | Lead-recorded: Variant A rev 2, `76e6ab4`, STATE HEAD | - |
| S2 test matrix | PASS | test-architect | Lead-recorded: done, 68 rows + lead rulings. `agents/test-architect/matrix_audio_donor_mode.md` (`4ca52d4`) | - |
| S3 spike + user | N/A | - | Not applicable: non-visual change, no feasibility spike asked (CLAUDE.md, Task tiers). The lead records N/A | - |
| S4 plan | PASS (lead-reviewed, deltas ruled) | planner | `agents/planner/plan_audio_donor_mode.md` (18 parts) | - |
| S4 coverage | PASS (lead-closed: B1, C1, C2 applied verbatim, § Lead amendments) | test-architect | Not run. Input: `## Coverage index`, `## Deltas` | - |
| S6 gates + harnesses | UNKNOWN | lead | Not run. `## S6 (lead)` rows 1-8 | - |
| S6 AV QA | UNKNOWN | tester | Not run | - |
| S7 user | N/A | user | Not applicable: non-visual. M1 is optional; M2 is the P4 look | - |

## Assumptions
Each is `⚠️ Assumption, needs confirmation`.
1. `HIT_DT`: a tick at >= 30 ms, with no 2 ms tolerance (`## Deltas` item 6).
2. The 10-row calibration layout is readable at the user's stage size (S1.5). Lever: split the 11-id `donor beat` row in two.
3. The Sources tab scrolls with 31 more meters (S1.5).
4. The existing flash audit exposes refused onsets (S4.2). If not, S4.2 adds one debug counter to `gl/live.ts`.
5. An FFT for T1g exists in `audio/analysis.ts` or can be copied from `scratchpad/dsp-donor/gaps/gaps.ts` (S1.2).
6. The prototype sets Level to 0 at once while silent, so T1c's sum is exactly 0 (S1.1). If Level releases instead, the coder reports the measured sum.
7. A dev-console `import('/src/app.ts')` returns the running module (the S1.4 check).
8. The thresholds H7 40 ms, H8 21.3 ms and H1b 10 MB (accepted by the lead as assumptions).
9. A stored copy of the calibration scene keeps working: S1.5 adds no input to its def.

## Cold start (when the user says go)
- First dispatch: S1.1 to `frontend-coder` (Opus 5.5, max). A second lane may take S2.1.
- The S1.1 brief points at: this plan `### S1.1`, `## Parameters` and the CP1 contract; `agents/audio-dsp/dsp_donor_mode_2026-11-18.md` L20-48; `agents/audio-dsp/dsp_donor_mode_gaps_2026-11-18.md` L40 and L58; `scratchpad/dsp-donor/donor-model.ts`.
- Every brief opens with the SDLC section 15 YAML header and says: invoke `ponytail` first; run graphify before reading code.
- Before S5 starts: the test-architect runs the S4 coverage on `## Coverage index`, and the lead rules on `## Deltas` items 3 and 6.

## Coverage fixes (2026-11-18)
Source: the S4 coverage section of `agents/test-architect/matrix_audio_donor_mode.md` (plan `245a291`) and the lead's rulings. Each item overrides the plan body.

- **F1, `## Assumptions` item 6:** deleted. S1.1 item 4 sets Level to 0 on every `g.silent` frame; T1c's sum must be exactly 0. No report fallback.
- **F2, S1.1 T1l:** keep the old text as arm (a). Arm (b), what `update()` writes: 120 s of baseline in which every bin alternates +1 / -1 dB frame by frame (sigma 1 dB); then 3 s steady with the Bass bins +1.6 dB and the High bins -1.6 dB (N60 0.9 and 0.1). At the end `syn_Intensity` is within 0.03 of `intensity(e)`, `e` = `intensityStep` run from 0.5 over the same 180 frames at (0.9, 0.1): about 0.74. A .5/.5 or full-band form reads 0.5 or less and fails.
- **F2, S6 row 3 H4b (S4.1 `score.py` prints it):** Intensity is scored on the `xInt3` row, the product's form: body > break on >= 6 of 7 drops, and the p50 gap >= .2 on >= 6 of 7. The rest stays.
- **F3, S6 row 3 H4a (S4.1 `score.py`):** only three blocks of `out/score-v2.txt` are compared: the R3 Level block, the R3 sections block (Intensity = `xInt3`) and the beats block. Values within 0.01; counts exact. Not compared: the R1 cold start, the prototype's PrimeBang list, the P4 and P6 blocks, the cost line. New: the rising edges of `syn_PrimeBang` equal our `fired` count per track: Kanine 3, Sub Focus 1, Bicep 1.
- **F4, S2.3 T2g:** `s` holds ours (`reeseBody` 0.2, `subBody` 0.3, `band27` 0.1) and donor (`syn_Level` 0.8, `syn_BassLevel` 0.7, `syn_MidLevel` 0.6, `syn_HighLevel` 0.9) for 60 frames. The reference bindings are literals in the test, not `donorChain` calls: `{ source: 'syn_Level', amount: 1, attack: 0.05, release: 0.3, min: 0, max: 1 }`, and the other three names with `release: 0.15`. First assert: the ours bytes differ from the donor bytes in all 4 channels. At `w` 1 the newest texel equals the bytes of `evaluate` on the literals, stepped alongside; at `w` 0 it equals the ours bytes.
- **F5 + F7, S1.2 T1g:** the train gains a snare (noise 300 Hz-5 kHz) on every second beat, so all four bands fire. Frames are cut at 30, 60, 120 and 144 Hz. For each of Bass, Mid, MidHigh and High, Hits per minute at 30, 120 and 144 Hz are within +-10 % of the 60 Hz value. 12 gates, none report-only. The mutant check stays.
- **F5, S6 row 3 H4c:** every band within +-10 % of its 60 fps rate at 30, 120 and 144 fps. 30 fps is a gate.
- **F6, S1.2 T1i:** run A = 10.1 s of the T1g train (60 Hz cut), 5 s at -120 dB with `silent`, 10 s of train. The zeros start 100 ms after a beat, so no onset is in the edge window. Run B = the same frames without the 5 s. New assert: the triggers of the four bands, summed over the 0-2 s after the resume, A / B is in [0.9, 1.1]. The old asserts stay.
- **F8, S1.2, new PA5:** on the T1g frames at 30 and 60 Hz, p10, p50 and p90 of each of the five Levels over 20-60 s differ by at most 0.05 (`LEVEL_RATE_TOL`; measured 0.01). p10 and p90 catch a smoother not scaled by `dt`.
- **F9, new H9b (coder-owned), in the done-checks of S2.2 and S2.5:** scratch `scratchpad/donor-mode/h9b-pixels.mjs`. Mode ours. Scenes: the built-ins on `syn/alien_cavern` (SOFT_SNARE), `syn/deeper` (clocks) and `syn/glob` (reads `syn_FadeInOut`). One fixed frame of `scratchpad/fx_audio/dnb174-arr.wav` (the frozen-pair method, STATE 2026-11-07). "Before" = the step's base commit; "after" = the finished step. Pass: 0 differing bytes per scene. A control pair (one build, two captures) runs first; if it differs, its floor is the pass line (matrix row H9) and the report gives both. S2.5 also compares its "after" with the S2.2 "before" (covers S2.3, S2.4). Evidence: the main checkout's `scratchpad/donor-mode/out/h9b-<step>-*`.

Conditions:
- **S1.1 T1j:** the AM rate is 0.5 Hz, not 2 Hz (a 150 ms release flattens a 2 Hz swing). Each swing is taken over 4 s. The test prints the pre-pause swing, which must be above 0.5, and both ratios. Only the `>= 0.5` arm is a product assert; the `< 0.5` arm shows that the fixture discriminates.
- **S1.5, pin `bind.test.ts:72`:** it stays an exact `toEqual` on the full sorted key list (`SOURCE_IDS` + the 5 unlisted names), never a subset check.
- **`## Parameters`, Silence row:** `SILENT_RMS` is the existing constant of `audio/arrange.ts` (-60 dBFS; imported at `app.ts:3`).

`## Coverage index`: S1.2 plan-added = PA5. S2.2 = H9b (owner; S2.5 re-runs it). Totals: 46 coder-owned IDs (45 matrix + H9b), one owning step each; plan-added PA1-PA5; lead 21; user 2.

Planner notes:
- H4a compares no Hits row: G4 changed the tick and THETA, so the Hits rates of `score-v2.txt` moved. H4b and H4c score Hits.
- S3.2's check scene id is `syn/audio_indicators` (underscores).

## Lead amendments after the coverage recheck (2026-11-18)
These apply the recheck's own fixes (matrix § S4 coverage › Recheck) word for word. They override the plan body and the coverage fixes above.
- **B1 (H4a, S6 row 3 + S4.1 `score.py`):** in the R3 Level block of `score-v2.txt`, H4a compares only the `L` (Level rest) values within 0.01. It excludes every `H/min` field (all, Bass, Mid, MidHigh, High) and the "BassHits vs kick" line, because the 30 ms tick and θ 2.25 moved them on purpose. Hits are scored only by H4b (BassHits per kick in [0.8, 2.0]) and H4c (every band at 30 / 120 / 144 Hz within ±10 % of 60 Hz).
- **C1 (PA5, S1.2):** the step adds one mutant run, a Level smoother not scaled by `dt`. PA5 must FAIL on it. The report prints the mutant's p10/p50/p90 shifts beside the correct core's.
- **C2 (H9b, S2.2 + S2.5):**
  - The metric is the max absolute byte difference over the frame (RGBA).
  - Capture is deterministic: a fixed seek time, fixed clocks and the same fixture.
  - A one-unit mutant at w 0 (one byte of one bound input's output shifted) must FAIL H9b.
  - The pass line is 0 when the control pair is bit-stable. Otherwise it is the control pair's max difference, and the report gives both numbers.
- **Stale body text (overridden here):** L556 "45 coder-owned" is now 46. L131 and L197 describe the old two-band T1g rule; T1g is the four-band rule in § Coverage fixes.
- **Gate record:** S4 coverage = PASS (lead-closed). The recheck found 1 blocking item (B1) and 2 conditions (C1, C2), all applied above verbatim; the evidence is the matrix § S4 coverage › Recheck.
