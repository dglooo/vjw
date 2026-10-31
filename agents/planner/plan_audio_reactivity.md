# Plan — Genre-aware audio reactivity (Variant B)

## TL;DR
- 7 checkpoints, 22 atomic steps, one step per coder (fresh context), parallel worktrees by wave (table at the end).
- Order: pure DSP first (analysis/drums/bands/tempo/style/arrange/settings, all Node-testable), wiring in `app.ts` after, panel last.
- Every DSP step ships mutation-sensitive Vitest tests; fixtures are synthesised in code (`audio/synth.ts`, design C10), no binaries.
- Existing effects, shaders and scenes are NOT retuned (effects re-brief pending). Only one built-in binding changes (S1.4).

## Freshness
- 2026-10-29. Inputs: `thoughts/spec_audio_reactivity.md` §1–§5; `agents/system-designer/design_audio_reactivity.md` shared core C1–C10 + Variant B.
- File paths below are from the design; a coder confirms a module's exact path with `graphify query` and records drift as `**Changed during implementation:**`.

## Chosen variant: B (user gate 2026-10-28; designer defaults accepted)
Worklet DSP: `audio/analysis.ts` (pure worklet body) + `audio/drums.ts` + `audio/bands.ts` (IIR bank, e1/e2/held).

## Conventions (apply to every step)
- First line of every step: invoke the `ponytail` skill (full) before writing code.
- `GATES` = `cd web && npm run lint && npm run typecheck && npm test && npm run build`.
- Browser check = ONE targeted run by the lead (no sweeps) with `?debug`, a fixture from `scratchpad/fx_audio/dnb174.wav`, `fx_audio/dubstep140.wav` or `cp5/house128-long.wav`.
- Time box ~45 min per step. "Mutants" = knobs that, broken alone, must fail >=1 test.
- Hot files, never edited by two steps of the same wave: `app.ts`, `audio/onset.worklet.ts`, `ui/Panel.tsx`.

## CP list and frozen contracts (TS from design C9 / Variant B)

**CP1 Hits.** User demo: `?debug` shows kick/snare/hats hits live; one built-in scene flashes on `kick`.
```ts
// audio/analysis.ts
export function createAnalysis(sampleRate: number): { configure(c: WorkletIn): void; block(chans: Float32Array[], frame: number, post: (m: WorkletMsg) => void): void }
// audio/drums.ts
export type Drum = 'kick'|'snare'|'hats'; export interface Hit { drum: Drum; t: number; strength: number }
export function createDrums(sampleRate: number, fftSize: number): { configure(b: Record<Drum, Band>): void; detect(mag: Float32Array, t: number): readonly Hit[] }
// WorkletMsg += { kind:'hit'; drum: Drum; t: number; strength: number }; bind.ts SOURCE_IDS += kick snare hats
// features.ts: hit(h: Hit): void; fill(out: Sources, dt: number, s: AudioSettings, p: Preset): void
```
**CP2 Sustained + custom bands.** User demo: sub/reese/wobble meters in `?debug` follow a bass fixture; a 40-60 Hz custom band (set in code/settings) moves.
```ts
// audio/bands.ts
export interface BandSpec { id: string; lo: number; hi: number }
export function createBank(sampleRate: number): { configure(specs: readonly BandSpec[]): void; process(x: Float32Array): void; read(out: Float32Array): void /* [e2, held] per band */ }
// WorkletMsg += { kind:'feat'; rev: number; t0: number; hop: number; values: Float32Array }
// WorkletIn = { kind:'config'; rev: number; drums: Record<Drum, Band>; bands: BandSpec[] }
// features.ts: push(m: Extract<WorkletMsg,{kind:'feat'}>): void; at(t: number): void; readonly raw: { sub: number; reese: number; wobbleDepth: number }
// presets.ts / settings.ts exactly as C9 (Genre, PresetId, Band, Preset, PRESETS; CustomBand, AudioSettings, parseSettings, createSettings, activePreset)
```
**CP3 Tempo range.** User demo: DnB preset on dnb174.wav reads 174 (not 87/116); Default reading unchanged.
```ts
// audio/tempo.ts: TempoSource += setRange(bpm: Band | null): void; families(windows: readonly Band[]): number[]
```
**CP4 Auto-style.** User demo: Auto on, a DnB fixture flips preset to DnB and Fractal's `fold` follows reese; Auto off reverts.
```ts
// audio/style.ts
export interface StyleIn { families: Record<Genre, number>; kickPerBeat: number|null; hatsPerBeat: number|null; wobble: number; bass: number; freeze: boolean }
export interface StyleOut { detected: Genre|null; scores: Record<Genre, number>; confidence: number }
export function createStyle(opts?: Partial<StyleOpts>): { update(x: StyleIn, now: number): StyleOut }
// bind.ts: restyle(s: Sources, from: Readonly<Record<string,string>>, to: Readonly<Record<string,string>>, w: number, out: Sources): Sources
// gl/engine.ts: render(shot, f, s: Sources, styled: Sources|null, post: Post); store.ts: style: { active: PresetId; detected: Genre|null; confidence: number }
```
**CP5 Build/drop.** User demo: on a build-up fixture the scene heats, then flash + scene cut at the drop; no cut under LOCK/open panel.
```ts
// audio/arrange.ts
export interface ArrangeIn { low: number; high: number; total: number; kick: boolean; beat: number|null; now: number }
export interface ArrangeOut { build: number; drop: number; heat: number; sparse: boolean; fired: number|null }
export function createArrangement(opts?: Partial<ArrangeOpts>): { update(x: ArrangeIn): ArrangeOut }
// gl/engine.ts: interface Post { gain: number; flash: number }
```
**CP6 Panel.** User demo: Sources tab with live meters, preset picker, Auto toggle, "+ Custom band", settings survive reload.
(no new signatures; consumes C9 `createSettings`, `store.style`, exported `src`)

**CP7 Closeout.** User demo: spec §4 items 1-7 each ticked with evidence.

## Steps

### CP1 — Pure analysis + hit sources

### S1.1 [x] Extract the worklet body into pure `analysis.ts`
Invoke the `ponytail` skill (full) before writing code.
- Goal: move `process()` (FFT 512, onset, bass ODF) into `createAnalysis`; worklet = ~20 lines of glue. No behaviour change.
- Files: `web/src/audio/analysis.ts` (new), `web/src/audio/onset.worklet.ts`, `web/src/audio/analysis.test.ts` (new).
- Behaviour: `block()` posts exactly today's `onset`/`odf` messages; `configure()` accepts `WorkletIn` (ignored fields allowed); worklet bundle stays one plain-JS IIFE (Variant B "Bundling").
- Tests: run a synthetic kick train through `block()` and assert the same onset times/ODF as the old code (golden values captured from the pre-move code); existing tempo/sync/bench tests stay green. Mutants: hop size, FFT window, ODF floor.
- Done-check: GATES + browser: dnb174.wav still reads the same BPM as before; check `AudioContext.playbackStats.underrunEvents` is 0 (Variant B risk).
- Depends on: none.
- **Changed during implementation:** (1) `WorkletIn` is `{ kind: 'config'; rev: number }` for now (in `onset.worklet.ts`, next to `WorkletMsg`): `Drum`/`Band`/`BandSpec` don't exist yet, so S1.4/S2.3 add the `drums`/`bands` fields. `configure()` is a no-op, and the glue doesn't wire `port.onmessage` yet (S2.3, "types + glue"). (2) The golden signal puts one hop-aligned click after each kick, with ODF 0.898 on even kicks and 1.103 on odd ones. This brackets onset `FLOOR = 1` from both sides: every FLOOR outside (0.898, 1.103) now fails, where before only FLOOR <= 0.5 did. That guards the S1.2 `DetectorOpts.floor` move. (3) Goldens checked with a temporary harness (not committed): the pre-move worklet's full stream with AudioWorklet globals stubbed (113 msgs) deep-equals both the new glue's stream and `createAnalysis`'s. Mutants killed: HOP, Hann (Hamming and rectangular), FLOOR 0/0.85/0.89/1.11/1.2/2, BASS_BINS, ODF_BATCH, `t` offset, mono mix. (4) The browser done-check (BPM, underrunEvents) was not run, because the brief said no browser check.

### S1.2 [x] `synth.ts` fixtures + `drums.ts` + `DetectorOpts.floor`
Invoke the `ponytail` skill (full) before writing code.
- Goal: three band detectors over the worklet's 257 magnitudes (C2) and the test-only synthetic stems (C10).
- Files: `web/src/audio/drums.ts` (new, +test), `web/src/audio/synth.ts` (new, test-only), the module exporting `createDetector` (add `floor` to `DetectorOpts`, default = today's `FLOOR`).
- Behaviour: bands kick 40-150 / snare 1k-5k / hats 7k-16k Hz; crosstalk rule (snare dropped when same hop kick is not weaker); `configure()` re-maps Hz to bins; existing detector callers unchanged.
- Tests: crosstalk matrix (each solo stem drives only its drum: own >=0.3, others <=0.1 mapped to hit counts); DnB two-step F1 >=0.70 per drum at +-30 ms; reese solo = 0 kicks. Mutants: each band edge, crosstalk rule, per-band floor, strength formula.
- Done-check: GATES (no browser check, pure).
- Depends on: none.
- **Changed during implementation:**
  - Measured F1 at ±30 ms: DnB kick 0.79, snare 0.97, hats 1.00. Dubstep 0.80/1.00/1.00, techno 0.89/0.77/1.00. 27/27 mutants killed (all band edges, Hz→bin rounding, crosstalk rule, per-band floors, strength, `onset.ts` floor).
  - Floors: kick 0.7, snare 80, hats 100. Kick sits near the cliff: floor 1.0 drops DnB kick F1 to 0.58.
  - Bins: a bin belongs to a band if its centre lies in [lo, hi], so the kick is bin 1 alone at 48 and 44.1 kHz.
    - DC is excluded because a sine's ± images interfere there and flood false kicks.
    - Bin 2 (187.5 Hz, the snare's body) is excluded too.
  - `configure()` takes `Record<Drum, readonly [lo, hi]>`. It is structurally C9's `Band`, which S2.2's `presets.ts` owns (no cross-worktree import).
  - Crosstalk compares each band's flux in units of its own floor (`odf / floor`), not `strength`.
    - `strength` saturates at `MAX_STRENGTH` = 4 in sparse bands (mean ≈ 0), so a click and a clap always tie.
    - The rule is still same-hop.
  - Fixtures: the patterns layer the bass as it is mixed.
    - The sub is tuned to 55 Hz, because a 45 + 55 Hz bed beats at 10 Hz.
    - The reese layer is high-passed at 300 Hz. A full-range reese's harmonics beat inside bin 1 and drop kick F1 to about 0.2.
    - Room tone at −51 dBFS: in digital silence, −100 dB leaks read as flux.
    - Kick and snare tone get a 1 ms sin² attack; an instant start leaks broadband.
    - The techno clap reuses the snare stem. Reese + sub stand in for the dubstep wobble until S2.1.
  - The crosstalk matrix runs each drum over the bass bed (reese + sub + room), not in digital silence. "Reese solo = 0 kicks" is tested as "the bed alone gives 0 hits".
  - ⚠️ C2 limit, flagged:
    - A bare reese in silence fires about 157 false kicks in 11 s.
    - A bare snare fires the kick on every hit (its body leaks −6 dB into bin 1, and log flux is level-independent).
    - Relevant for S5.1's breakdown snare roll.

### S1.3 [x] `features.ts` hit envelopes + new source ids
Invoke the `ponytail` skill (full) before writing code.
- Goal: `kick`/`snare`/`hats` as sources with C1 formula `clamp((strength-1.5)/2.5)*exp(-age/tau)`, event at 0.5 crossing.
- Files: `web/src/audio/features.ts` (new, +test), `web/src/bind.ts`.
- Behaviour: `hit()` stores last strength/time per drum; `fill()` writes ids, tau 0.12/0.12/0.06 s, times user `sens` x preset `sens`; `SOURCE_IDS` gains kick snare hats; unknown ids still read 0.
- Tests: decay curve, tau per drum, sens scaling (0, 1, 2), event fires once per hit. Mutants: tau values, 1.5/2.5 constants, sens product, threshold 0.5.
- Done-check: GATES.
- Depends on: S1.2 (types `Hit`, `Drum`), S2.2 (`AudioSettings`, `Preset` types).
- **Changed during implementation:**
  - The envelope is a plain 0→1: `min(1, user sens × preset sens × e^(−age/τ))`, without `clamp((strength − 1.5)/2.5)`. So the "1.5/2.5 constants" mutants don't apply.
    - Measured on the dnb/dubstep/techno fixtures, with drums at 0 and −12 dB: `strength` was the cap of 4 on all 471 hits, so the C1 formula is a constant 1.
    - odf/floor doesn't measure kick level: it spans 1.1–6.2 at constant velocity (it reads the bass bed), and its median rises at −12 dB. For snare and hats it tracks level only weakly.
    - Exposing odf/floor would change the frozen `Hit` and the `hit` message, so `drums.ts` is untouched.
  - Age counts frame `dt` from the drain, because C9's `fill` has no audio clock. `hit()` restarts the envelope; `fill()` reads it, then adds `dt`.
    - The drain frame reads the peak, so an `event` input fires on it. This is within one frame of bind.ts's `audioNow − t` onset age.
    - If that ever shows, S2.4's `at(t)` can supply the clock.
  - The sens product is capped at 1 (C1's 0..1). The 0.5 threshold is live.ts's existing `event` rule, so no constant lives in `features.ts`; the test mirrors the rule on a DnB hit train at 60 fps.
  - `bind.test.ts`: the registry test now fills via `sources()` + `features.fill()`, with length +3.
  - Mutants: 17/17 killed. They covered τ ×3, the sens product / sum / either factor alone / missing = 0 / per id, the cap, read-before-advance, `+= dt`, per-drum reset, initial 0, re-hit restart, and the registry losing kick or hats.
  - There is no `Features` interface (only one implementation). Use `ReturnType<typeof createFeatures>`; `raw`/`push`/`at` come with S2.4.

### S1.4 [x] Wire hits end to end + one built-in on `kick`
Invoke the `ponytail` skill (full) before writing code.
- Goal: worklet posts `hit`, `app.ts` drains it, `?debug` shows hits, one built-in binding uses `kick`.
- Files: `web/src/audio/analysis.ts` (call `drums.detect` in `block`, post `hit`), `web/src/app.ts` (drain via the same T1 rule as onsets, `features.hit`, `features.fill` into `src`), the one built-in scene doc that binds `onset` today (grep `builtin:`; swap that single binding to `kick`).
- Behaviour: no added latency (C2); `onset`/ODF path untouched; debug overlay prints last hit per drum.
- Tests: analysis test: dnb fixture through `block()` emits hits with t within +-30 ms of truth.
- Done-check: GATES + browser: dnb174.wav, `?debug` shows kick/snare/hats lamps ticking on the beat; the chosen scene flashes on kick.
- Depends on: S1.1, S1.3.
- **Changed during implementation:**
  - Glue beyond the listed files:
    - `onset.worklet.ts`: types only, `WorkletMsg += { kind: 'hit' } & Hit`.
    - `input.ts`: `hitQueue` plus a `hit` branch in the port handler. A hit has `t` and `strength`, so without that branch it would type-check as an onset and feed tempo/sync.
  - Merged with S2.3: one shared `drums` instance (S2.3's `configure` re-tunes it). Drum config is S2.3's; nothing sends a config yet, so the built-in bands apply.
  - T1: the onset drain became `drain(q)` in `app.ts`. Onsets and hits share it, same behaviour.
  - `fill()` gets `createSettings(localStorage, ctx.sampleRate).get()` and `PRESETS[activePreset(s, null)]`; no detected genre until S4.3.
  - Debug overlay: it prints hit counts per drum (`debugSync.hits`, 4×/s, a `.hits` line), not the last hit's time. The counts tick on each hit.
    - `?debug` also sets `window.__src` = the live `src`, as `window.__bench` does.
  - Swapped binding: VHS tunnel `own/flash` (`flash`, max 0.9, the full-frame flash) `onset` → `kick`.
  - Test: dnb, 8 bars through `block()`. Recall/precision at ±30 ms: kick 0.81/0.76, snare 0.94/1.00, hats 1.00/1.00 (floor 0.7). Message keys are exact; t comes from `frame`.
  - Browser (merged, port 5174, Chrome, `--mute-audio`), dnb174.wav, 10 s on VHS tunnel:
    - Hits: kick 24, snare 10, hats 58; 81 onsets.
    - `src.kick` crossed 0.5 22×.
    - Canvas luminance: 164 on kick ≥ 0.5 frames vs 111 on kick < 0.05 (+53). The control, Tunnel (no flash), shows +8.
    - 0 console errors, glError 0. Worklet chunk still an IIFE.
  - ⚠️ Kick 24 vs snare 10 in 10 s at 174 BPM (two-step ≈ 14.5 each) fits S1.2's C2 note: a snare body leaks into the kick bin.
  - ⚠️ No BPM/grid on dnb174.wav in Default within ~25 s (conf 0.00), both before and after the merge. S1.4 leaves the tempo inputs (onset/odf queues) unchanged. There is no Default baseline (S1.1's BPM check was skipped), so this matters for CP3's "Default reading unchanged".

### CP2 — Sustained sources + custom bands

### S2.1 [x] `bands.ts` IIR bank with fast/slow envelopes and kick gate
Invoke the `ponytail` skill (full) before writing code.
- Goal: pure bank of up to 11 bands (2 cascaded RBJ band-pass biquads, Q from edges), followers `e1` (~1 ms attack) and `e2` (~20 ms), `held` output gated by `e1/e2 > ~2` for ~60 ms (Variant B).
- Files: `web/src/audio/bands.ts` (new), `web/src/audio/bands.test.ts` (new), `web/src/audio/synth.ts` (add stems if S1.2 merged; else local helpers).
- Behaviour: `configure()` swaps coefficients, keeps follower state per id (no jump); `read()` order = spec order `[e2, held]`; a 2 ms kick trips the gate, a >=40 ms wobble rise does not.
- Tests: 50 Hz sine reads >=5x a 120 Hz sine in a 40-60 Hz band; kick-vs-sustain (reese + kicks: `held` stays flat through kicks, `e2` jumps); wobble stem passes the gate; configure keeps state. Mutants: Q, attack/release, TRANSIENT ratio, hold time, cascade count.
- Done-check: GATES.
- Depends on: none.
- **Changed during implementation:**
  - Gate topology. The design's pair (e1 and e2 both on `|y|`, 20 ms release, TRANSIENT 2) gated a sustained reese 75% and a wobble 100% of the time: e1 peak-follows the rectified ripple and e2 averages it, so e1/e2 ≈ crest factor ≥ 2. Fix: e2 now smooths e1 (20 ms), and the gate runs its own pair (1 ms attack / 200 ms release, then 20 ms smoothing) that bridges a bass note's 18–33 ms peak gaps. Sustained material peaks at ratio ≤ 1.30, kicks at ≥ 1.65.
  - Knobs: TRANSIENT 2 → 1.5 (at 2, a kick at 2.5× the reese's in-band level misses). HOLD 60 → 100 ms (at 60 ms the kick's tail reaches `held` at ≈2×). e2 falls in ≈45 ms (two poles).
  - Known limits for S2.4: the sub band (30–60 Hz) never sees a kick as a transient (the 150→45 Hz sweep enters it over ≈40 ms), so the kick body passes into sub `held` (+≈78%); gating sub needs a cross-band trigger (design question). A bass note starting on a kick reaches `held` ≈125 ms late. Local stems in `bands.test.ts` (S1.2 owns `synth.ts`).
  - Cost (Node 20.20.2): 5.4 µs per 128-frame block for 11 bands, 0.20% of a core. All 19 mutants (knobs, sample rate, e2 source, configure reset, read order) fail ≥1 test.

### S2.2 [x] Presets data + `settings.ts` (de)serialisation
Invoke the `ponytail` skill (full) before writing code.
- Goal: C3 table as code and C7 settings with custom-band validation.
- Files: `web/src/audio/presets.ts` (new), `web/src/audio/settings.ts` (new), `web/src/audio/settings.test.ts` (new).
- Behaviour: `PRESETS` verbatim from C3 (no tempo logic yet); `parseSettings` replaces invalid fields with defaults; `createSettings(kv)` stores `vjw.audio`; `addBand` validates (lo>=20, hi>=1.1 lo, hi<=0.45 sr, gain 0-4, gate 0-1, attack/release 0-2 s, name 1-24, max 8) and returns message or null; `activePreset` per C4 state machine.
- Tests: round-trip, corrupt JSON -> defaults, every validation bound (both sides), 9th band rejected, removeBand, onChange unsubscribe, `activePreset` for all (auto,pick,detected) combos. Mutants: each bound, max count, id stability.
- Done-check: GATES.
- Depends on: none.

**Changed during implementation:**
- `createSettings(kv, sampleRate = 48_000)`: an optional 2nd arg, because `hi <= 0.45 sr` needs a rate and C9's `createSettings(kv)` has none. S2.5/S6.2 may pass `ctx.sampleRate`. `addBand` caps the rate at 96 kHz and a stored band is checked against 96 kHz, so a lower-rate session or a later `patch()` never silently drops a saved band.
- `Preset.proto` (S4.1 input): only `kickPerBeat` is fixed by C3 (dnb 0.5, dubstep 0.35, techno 1). `hatsPerBeat`/`wobble`/`bass` are starting values to tune on the fixtures in S4.1. `sens` maps are `{}` (all 1 = missing).
- `parseSettings` also clamps each stored `sens` factor to 0..2 (design C1) and drops a stored band that is invalid, repeated or past the 8th. `patch()` re-runs `parseSettings`, so a bad `pick` or a NaN slider value is repaired, not stored. Tests: 45 in `settings.test.ts` (presets table + `bpm` windows incl. DnB 174 in / 87, 116 out; hand mutation sweep of ~90 knobs over both files, all killed except 2 equivalent: the `typeof` guard before `Object.hasOwn`, and a preset's display `name`).

### S2.3 [x] Worklet feeds the bank: `feat` messages + config
Invoke the `ponytail` skill (full) before writing code.
- Goal: `analysis.ts` runs `bands.ts` per quantum and posts `feat` every 2 hops; `config` with `rev` re-configures drums and bands.
- Files: `web/src/audio/analysis.ts`, `web/src/audio/onset.worklet.ts` (types + glue only), `web/src/audio/analysis.test.ts`.
- Behaviour: `values` = hops x bands x 2 floats with `t0`/`hop`; batches keep their `rev`; a config change mid-stream does not glitch followers; message rate ~93.75/s.
- Tests: fixture through `block()`: sub-only stem lights band 0 not 1; batch count/size; rev mapping. Mutants: batch size 2 hops, rev tagging, band order.
- Done-check: GATES + browser: dnb174.wav, underrunEvents stays 0 with 11 bands (Variant B risk; record the number).
- Depends on: S1.1, S2.1.
- **Changed during implementation:**
  - Timing. A newer rev's bands apply at the next batch start (≤ 3 quanta, ≈8 ms), so each batch is made and read with one band list and carries its rev. Drums apply at once. "Stale" means a rev ≤ the newest one received, pending or applied. Before any config there are no bands and no `feat` posts, so the app posts none until S2.5 sends a config.
  - Drums restart only when their bands change (a key compare in `configure`). `drums.configure` drops the per-bin flux history, so a restart on every config would fire every drum at full strength on the next hop. S2.5 sends a config per custom-band edit and per preset switch.
  - Merge with S1.4. `analysis.ts` creates `const drums = createDrums(sampleRate, N)` so `configure` can re-tune it. S1.4 adds `drums.detect` in parallel: keep one instance. With no hits in `block()` yet, the drums wiring is tested with a `vi.mock` passthrough spy on `configure`. A hit-level check belongs in S1.4's test after the merge.
  - Outside the file list: `input.ts` gets one line that drops `feat` until S2.5's `featQueue`. `tsc` needs it once `WorkletMsg` has `feat`, and it keeps `feat` out of `onsetQueue`. `hop` moved out of the `odf` block so `feat` shares it. The golden test gains one line ("no config, no `feat`"); its values are unchanged.
  - Tests. Values match a reference `createBank` fed the same quanta, bit-exact. On reese + kick, the sub band reads ≈1776× the 7–16 kHz band (threshold 100×). 20 mutants killed: FEAT_HOPS 1/4, slot offset, rev tagging, stale rule (`<`, applied-only, none), drums always/never/key, apply timing ×3, wrong quantum, t0, hop, empty posts, value copy, band order, new bank per config.
  - The browser done-check (underrunEvents with 11 bands) was not run: the brief said no browser, and nothing sends a config until S2.5, so the bank is idle in the app.

### S2.4 [x] `features.ts` sustained sources: sub, reese, wobble, wobbleDepth
Invoke the `ponytail` skill (full) before writing code.
- Goal: normalise `feat` frames into C1 values at hop rate, level independent.
- Files: `web/src/audio/features.ts`, `web/src/audio/features.test.ts`, `web/src/bind.ts`.
- Behaviour: `push()`/`at(t)` as in B (file: newest <= audioNow; line-in: newest); sub/reese = held / running average / 2; `wobble = max(0,(g-gbar)/gbar)`; `wobbleDepth` ~1 s EMA of `|g-gbar|/gbar`; `raw` exposed; SOURCE_IDS += sub reese wobble wobbleDepth.
- Tests: gain-invariance (x0.25 input same output +-5%); 8 Hz wobble stem gives wobbleDepth high, steady reese gives ~0; kick-gated: kicks do not move reese. Mutants: running-average tau, /2 factor, gate use, EMA tau, sens.
- Done-check: GATES.
- Depends on: S1.3, S2.3.
- **Changed during implementation:**
  - **Kick gating: a cross-band trigger from the bank.** A kick that trips the reese band's own gate (`e2 ≠ held` in its `feat` slot) holds all three levels (sub, reese, wobble) for `HOLD` = 0.2 s from the trip's first hop. `hit()` stays as in S1.3.
    - Why not `features.hit`? The FFT kick detector missed 4/32 (techno), 3/16 (dnb) and 2/8 (dubstep) kicks on the `pattern()` beds, and every miss leaked fully: raw sub ×1.4–2.4.
    - The bank's reese gate also releases ≈130 ms after the kick, while the synth kick's tail rings in the reese band's skirt to ≈200 ms (raw reese ×1.05–2.0).
    - The trigger uses the frame's own clock, so it doesn't depend on hit/feat ordering or the T1 drain.
  - **Measured through `analysis.ts`** (beds: `pattern()` sub + reese + room, kicks from its stem):
    - −12 dB: all four sources are identical (Δ = 0).
    - The bed reads sub 0.48–0.53 and reese 0.44–0.55.
    - With kicks: raw leak sub ×1.03–1.05 and reese ×1.07–1.12; max |Δ| sub 0.024, reese 0.058. Before the trigger it was ×1.7–2.4 and ×1.7–2.0, |Δ| ≈ 0.4.
  - **For S4.1 (W, B):**
    - Raw `wobbleDepth`: the 4.67 Hz wobble stem 0.25, 8 Hz 0.19, 2.33 Hz 0.29. A steady reese (its detune beating) reads 0.06–0.13, the `pattern()` bass bed 0.09, kick-only material 0.06–0.11.
    - S4.1's dubstep proto W = 0.8 is far above anything measured (max ≈ 0.29). Retune W around 0.1 (steady) vs 0.25 (wobble).
    - Raw linear levels on the `pattern()` bed (sub sine 0.2 + reese 0.15 high-passed at 300 Hz): sub ≈ 0.12, reese ≈ 0.085. The bass share B needs `f.energy.bands`' total, so it was not measured here (S4.3/S7.1).
  - **Known limits:**
    - A bass note that starts on a kick shows ≈211 ms late in sub and reese (raw to 50%; before: sub 211 ms, reese 125 ms). This is not trivial: until the kick decays, its energy and the note's share the band. Off-kick note starts take 35 ms (sub) and 25 ms (reese).
    - Kick-only material (room tone only, no bass): the ratio-to-average reads the kick tail after the hold against the room-tone average. Sub means 0.14–0.20 and reese 0.36–0.40, with spikes to 1 ≈200–300 ms after each kick. energy.ts's bass/mid/treb have the same property. A level floor is a design question.
  - **Contract for S2.5:** `config.bands` must start with `sub`, `reese`, `wobble`, in that order (features.ts reads bands 0–2 by position), then `u:*`. `FEAT_HOPS` = 2 is mirrored from analysis.ts.
  - **`at(t)`** works through every queued hop up to t (the averages need every hop), not only the newest.
  - **Outside the file list:**
    - `bind.test.ts`: the registry length +4.
    - `features.test.ts`: the "only the hit drum moves" check is now `toMatchObject` (`fill` writes the sustained ids too).
    - `synth.ts`: a `wobble()` stem, appended at the end.
  - **Mutants: 21/21 killed.** AVG ×½/×2; the /2 (sub, reese); no hold; HOLD 0.1/0.3; the hold re-armed every gated hop; DEPTH ×½/×2; sens dropped, user-only or uncapped; wobble = |d|; signed depth; e2 instead of held (sub, reese, wobble); the trip read on the sub band; at() ignoring t; a plain EMA without the warm-up mean.
  - No browser check: nothing sends a config until S2.5.

### S2.5 [ ] Custom bands `u:<id>` + config pipeline
Invoke the `ponytail` skill (full) before writing code.
- Goal: settings drive worklet config and `u:*` sources (normalised x gain, gate, dt-based attack/release one-pole).
- Files: `web/src/audio/features.ts` (u:* fill), `web/src/audio/input.ts` (`featQueue`, `configure()`), `web/src/app.ts` (send config on settings change, push feat frames, debug meters for sub/reese/wobble/u:*).
- Behaviour: removed band reads 0; ids never change on rename; config only sent on change.
- Tests: u:* gate/attack/release curve; 50 Hz sine vs 120 Hz sine through full analysis -> >=5x on a 40-60 Hz band. Mutants: gate compare, attack/release dt, gain.
- Done-check: GATES + browser: dubstep140.wav, `?debug` meters follow bass; add a 40-60 Hz band in code, see it move, reload keeps it (CP2 demo).
- Depends on: S1.4, S2.2, S2.4.

### CP3 — Tempo range per preset

### S3.1 [x] `tempo.ts`: `setRange` + `families`
Invoke the `ponytail` skill (full) before writing code.
- Goal: C3 "Tempo range": candidate lags restricted to `[lo/1.1, hi*1.1] x {1/2,1,2}`, fold into window, prior centred on sqrt(lo*hi); `null` = today exactly; ACF always over full 45-370 BPM; `families(windows)` returns prominence per window via `PROM_NONE/PROM_FULL`.
- Files: `web/src/audio/tempo.ts`, `web/src/audio/tempo.test.ts`, `web/src/audio/synth.ts` (patterns: DnB two-step 174/182, dubstep 140, techno 128).
- Behaviour: no classifier feedback from the active range; existing tempo tests unchanged.
- Tests: DnB two-step 174 with range 160-185 -> 174 +-1 within 10 s (also 182 -> 182, not 91; assert the 116 lag is not a candidate); `null` golden = old output; families picks the right genre window. Log Default reading for dnb. Mutants: margin 1.1, octave set, prior centre, fold, full-span ACF.
- Done-check: GATES.
- Depends on: S2.2 (`Band` type; use local alias if not merged).

**Changed during implementation:**
- **⚠️ The full mix doesn't lock, with or without a range** (the lead's Chrome finding, reproduced in Node).
  - `fx_audio/dnb174.wav` through `createAnalysis` + tempo: Default reads 132.5, the DnB range 195, both at conf ≈ 0.12, below sync `LOCK` 0.3. Families ≈ 0.15–0.18; dubstep140.wav ≈ 148 / ≤ 0.14.
  - Cause: steady sub/reese partials flicker per hop in the 4 bass bins (a 55 Hz period is longer than the 512-sample window), and log compression makes that flux kick-sized. The ACF goes flat (prominence 2.5–3.0) with no 174-family peak, so no range can fix it.
  - Pinned by `test.fails('the full DnB mix (sub + reese) locks 174 …')`, which reads 150.4 / 0.08. The bass ODF needs a design fix (longer bass FFT, or a kick-band envelope as the tempo ODF) before S3.2 can lock in Chrome.
- No `synth.ts` change: `pattern(genre, bars, bpm)` already gives the two-step at 174/182, dubstep 140 and techno 128. The tests use drums + room (see above).
  - Default reads the two-step's ⅔ lag (kicks 1.5 beats apart): 174 → 115.98 and 182 → 121.34, both at conf 1. This confirms C3's 116.
  - With ranges: DnB 174.01 / 0.84 and 181.99 / 0.90, dubstep 140.00 / 1 (only peak: the 70 lag, ½ octave), techno 127.74 / 1.
- Fold with a range: the octave [c/√2, c·√2) around c = √(lo·hi) (DnB 121.7–243.3). A sub-octave fold would halve a fit stepping past the margin (203.75 → 102). The ACF span is unchanged (45–360, from `minBpm`/`maxBpm`).
- Bug fixed: the parabolic step is clamped to ±½ lag. A range's edge candidate needn't be a local peak, so the unbounded step passed lag 0 and `fold()` never returned: a main-thread hang at 203.75 BPM under DnB, found by a 50–400 BPM sweep. The clamp is a no-op at a local peak, so `null` stays bit-exact (goldens).
- `families` can't "pick the right genre" as designed. Measured [dnb, dubstep, techno]: dnb174 [.84, .96, 1], dnb182 [.90, .79, 1], dubstep140 [0, 1, 1], techno128 [0, 1, 1].
  - The two-step lights techno (⅔ lag). The ±10% windows overlap techno↔dubstep, and PROM_FULL saturates. **S4.1 can't rely on T_g alone.**
  - Tests assert what holds: own window > 0.8, DnB 0 off DnB, equal under every active range.
- `setRange`/`families` are required on `TempoSource` (C9). The `sync.test.ts` stub got two no-ops.
- Mutants, each alone:
  - Killed: margin 1.0/1.05/1.15/1.2; octaves drop ½, drop 1, add ⅔; centre 128; fold default/[lo,hi)/margin window/[c/2,c)/[c,2c); ACF over candidates only; no restriction; families via active range/raw/×1 only; null keeps centre/fold/range; no clamp (hang).
  - Equivalent here, because all candidates fold into one window, so the prior only picks the octave: prior call site at 128; centre lo/hi/arithmetic mean; drop ×2; add 1.5/¼; clamp 0.4; loop start lo+2 (silence only).
- **Fix-forward after merge (`f183a0d` turned master red).** The S3.1 branch predates S1.4/S2.3. Its `listen()` harness sent every non-`onset` message to `pushOdf`, including S1.4's `hit` (no `values`, so tsc failed and 9 tests threw "values is not iterable"). It now routes by `kind` the way `input.ts` does: `onset` → `push`, `odf` → `pushOdf`, while `hit`/`feat` are ignored. `tempo.ts` is unchanged. Re-measured with the same numbers as above: DnB 174.01/0.84 and 181.99/0.90, dubstep 140.00/1, techno 127.74/1, Default 115.98/121.34 (goldens bit-exact), full mix 150.4/0.08 (still `.fails`), families unchanged.

### S3.2 [ ] Wire active preset: range, octave snap, band configs
Invoke the `ponytail` skill (full) before writing code.
- Goal: active preset changes call `tempo.setRange`, snap sync grid with `sync.double()/halve()` only on change, and re-send `config` with the preset's bands.
- Files: `web/src/app.ts`, `web/src/audio/presets.ts` (only if a helper is missing), `web/src/audio/sync.test.ts` (or nearest existing sync test).
- Behaviour: `[`/`]` user presses preserved after the snap; temporary dev hook `?debug` picks preset via URL param `?preset=dnb` until CP6.
- Tests: pure helper `snapOctave(bpm, band)` unit-tested; no snap when already inside the window. Mutants: bounds inclusive/exclusive, halve vs double.
- Done-check: GATES + browser: dnb174.wav with `?debug&preset=dnb` reads 174; without it, unchanged.
- Depends on: S3.1, S2.5.

### CP4 — Classifier, Auto-style, styled remap

### S4.1 [x] `style.ts` classifier with hysteresis
Invoke the `ponytail` skill (full) before writing code.
- Goal: C4 score `S_g = T_g*(0.5+0.5*match_g)` plus no-flap logic.
- Files: `web/src/audio/style.ts` (new), `web/src/audio/style.test.ts` (new), `web/src/audio/synth.ts` (`crossfade(a,b,16 bars)`, patterns with 2 variants per genre).
- Behaviour: score EMA tau 4 s; challenger needs margin 0.15 for 16 s dwell; min-hold 32 s after a switch; floor 0.35 keeps current; `freeze` holds state (silence, sparse); knobs in `StyleOpts`.
- Tests (fed by feature vectors derived from fixtures): each genre detected within 20 s; a 16-bar crossfade switches <=1 time and ends on B; breakdown/silence switch 0 times; stable under noise. Mutants: EMA tau, margin, dwell, min-hold, floor, freeze, match closeness, tempo-necessity (T_g=0 -> never wins).
- Done-check: GATES.
- Depends on: S2.2 (Genre/Preset types).
- **Changed during implementation:**
  - **Feature-level fixtures.** `tempo.families` (S3.1) and the raw `wobbleDepth`/bass share (S2.4) don't exist yet, so the tests derive `StyleIn` from the grooves, not from audio:
    - K and H: the 16th steps counted per beat.
    - T_g: an idealised `families`. It is 1 when bpm ×{½, 1, 2} lies in the window ±10%, 0.5 for the ×⅔ and ×4/3 lags (C3's DnB 174 → 116), else 0.
    - W and B: per-groove values in `synth.ts`, ⚠️ assumed until S2.4 measures them.
    - A crossfade blends every input by energy share; noise is seeded and held 1 s at a time.
    - S7.1 runs the real audio → classifier path.
  - **`synth.ts` (appended at the end only):**
    - `GROOVES`: 2 per genre. [0] is the existing audio pattern; [1] is DnB 170 with a ghost kick and off-beat hats, dubstep 142 with kicks on 1 and the "and" of 3, and house 124 with 16th hats.
    - [1] has the GENRES shape, but `pattern()` can't render it until it takes a groove (a 1-line change, left alone to avoid a mid-file edit in a parallel wave).
    - `crossfade(t0, bars = 16, bpm)` is the equal-power gain law `t → [a, b]`. It serves stems (S7.1) and feature blends (gain²).
  - **No-flap details:**
    - The challenger must be the score leader, and its own lead must stay unbroken: a dip or a leader change restarts the dwell.
    - The first pick waits only for its dwell, not the hold.
    - Frozen time counts for neither the EMA, the dwell nor the hold.
    - `confidence` = the detected genre's smoothed score (0 before a pick).
    - NaN or null features drop out of the match mean (a 0/0 bass share in silence can't poison the EMA). `now` is in s (`f.time`).
    - σ knobs: K 0.25, H 1.5, W 0.25, B 0.2.
  - **`proto` not tuned:** S2.2's placeholders already separate all 6 grooves.
    - Steady lead ≥ 0.28: dnb 0.99/0.91, dubstep 0.96/0.93, techno 0.97/0.91.
    - Every groove is detected at 17.75–18 s. All 6 crossfades switch once, 0–8 s after the fade ends.
    - Retune with S2.4/S3.1's measured features.
  - **Mutants:** a hand sweep killed 36/36, 33 in `style.ts` and 3 in `crossfade`. They cover τ, margin, dwell, hold and floor (both sides), each σ, freeze, `last` while frozen, tempo-necessity (T dropped or made additive), the 0.5 base, the null and NaN skips, the mean, the Gaussian form, dwell continuity and identity, the first-pick hold, the hold reset, `confidence`, per-frame α, challenger vs current, and the floor and dwell guards.

### S4.2 [x] `restyle` + engine styled overlay
Invoke the `ponytail` skill (full) before writing code.
- Goal: C5 overlay: built-ins (`builtin:` ids) read `styled`, every other scene reads `src`.
- Files: `web/src/bind.ts` (`restyle`), `web/src/gl/engine.ts` (`render(shot,f,src,styled,post)`; `post` is accepted but may be a no-op until S5.2), `web/src/bind.test.ts`.
- Behaviour: `out[k]=(1-w)*src[from[k]??k]+w*src[to[k]??k]` over `from ∪ to`; `styled=null` -> all scenes read `src` (today); no change to `live.ts`, `evaluate()`, docs, library, exports.
- Tests: alias, w=0/0.5/1, Auto-off fade to `{}`, source scale preserved; `drawScene` id routing via a 2-line seam test. Mutants: the `??k` fallbacks, `(1-w)` weighting, prefix check.
- Done-check: GATES.
- Depends on: none (touches `engine.ts`; avoid wave overlap with S5.2).
- **Changed during implementation:**
  - The routing seam is `sourcesFor(id, src, styled)`, exported from `bind.ts` and called by `drawScene`, so it is tested in `bind.test.ts` without WebGL.
  - `restyle` reads a missing source as 0 (as `evaluate()` does), so a source that isn't filled yet (`reese` before S2.4) never gives NaN.
  - `render`'s `post` is `_post` with one `eslint-disable-next-line` until S5.2 uses it. `app.ts` passes `styled = src` and a module-level `rest = { gain: 1, flash: 0 }`, so behaviour is unchanged until S4.3, which owns the 2 s `w` ramp.

### S4.3 [ ] Wire classifier -> active preset -> remap + `store.style`
Invoke the `ponytail` skill (full) before writing code.
- Goal: features -> `style.update` each frame; active preset by `activePreset`; `w` ramps 0->1 over 2 s on map change; K/H per beat from `sync` when confidence >=0.3; badge patch at 4x/s.
- Files: `web/src/app.ts`, `web/src/store.ts`, `web/src/audio/style.ts` (adapter `styleIn(...)` pure helper + test in `style.test.ts`).
- Behaviour: classifier always runs; manual `pick` locks; `?preset=` hook from S3.2 becomes `settings.patch({pick})`; the detected hint is `detected != active`.
- Tests: `styleIn` kicks/hats per beat, ignored below confidence 0.3; w ramp timing. Mutants: 0.3 gate, 2 s ramp, K/H window 8 s.
- Done-check: GATES + browser: dnb174.wav -> `?debug` shows detected DnB; Fractal `fold` tracks reese with Auto on and `bass` with Auto off.
- Depends on: S4.1, S4.2, S3.2.

### CP5 — Build, drop, heat, cut

### S5.1 [x] `arrange.ts` build/drop detector
Invoke the `ponytail` skill (full) before writing code.
- Goal: C6 heuristic, pure.
- Files: `web/src/audio/arrange.ts` (new), `web/src/audio/arrange.test.ts` (new), `web/src/audio/synth.ts` (arrangement fixture: 16 groove bars, 8-bar breakdown with riser + snare roll, drop; teaser-kick and 2-bar-break variants).
- Behaviour: G EMA tau 20 s outside sparse; sparse = 1 s EMA of low < 0.35 G; armed after 6 s; drop (a) bass back >=4x sparse mean and >=0.6 G within 150 ms of a kick or (b) 2nd kick within 1.2 beats and low >=0.6 G; refractory 30 s; warm-up 20 s; confidence gate; heat = build smoothed tau 0.5 s, 0 within 1 s after drop.
- Tests: drop fires <=150 ms after the drop's first kick with confidence >=0.6; `build` >=0.5 at end of breakdown; 3 min groove = 0 drops; teaser kick = 0; 2-bar break = no fire >=0.6; second drop inside 30 s ignored. Mutants: arming 6 s, return ratio 4x, 0.6 G, kick-only path, refractory, warm-up, confidence gate, silence rule.
- Done-check: GATES.
- Depends on: S2.2 (types only).
- **Changed during implementation:**
  - Measured through the real DSP (fixture → bands.ts `held` sub + reese, drums.ts kicks, FFT 4–16 kHz, frame RMS):
    - A lone kick lifts `low` to 0.95 G, but only for ≈30 ms, 140 ms after the kick (bands.ts's gate release). The drop's bass rises 144 ms after its kick and stays at ≈1 G.
    - Kicks are weak evidence here: in a breakdown, drums.ts reads the riser, room tone and roll as ~13 kicks a bar.
    - So the drop needs the low end back, never kicks alone, and its timing test is ≤ 1 beat (lead brief), not ≤ 150 ms.
  - Path (a) needs `low` ≥ 4× its sparse mean and ≥ 0.6 G held for `sustain` 0.1 s. The return must start within `near` = 0.2 s of a kick (150 ms is under held's 144 ms lag plus a frame).
  - Path (b) counts two kick-backed *rises* of `low` through 0.6 G at most 1.2 beats apart, i.e. two separate bumps. The design's "2nd kick + low ≥ 0.6 G" would pair the roll's false kicks with one bump. It needs `beat`, so it is off without a confident sync.
  - `riser` = log2 of the 0.5 s / 4 s EMA ratio of `high`, without the snare/hat-rate slope: `ArrangeIn` has no rate input, and the roll lifts `high` anyway.
  - Added to C6:
    - a 1 s `GRACE` (a drop louder than ~3 G ends sparse before `sustain` runs out);
    - `dt` ≤ 0.1 s (a hidden tab isn't a breakdown);
    - at a drop: `build` = 0, the 1 s EMA snaps to G (sparse ends), and heat falls linearly to 0 over 1 s from its value at the drop.
  - Inputs and outputs:
    - `total` = the frame's RMS (energy.ts `rms`), with a silence floor of −60 dBFS. S5.3 must feed that.
    - Confidence = the mean of four terms: min(1, sparse/16 s), log16 of the return ratio, the last kick's beat alignment (0.5 without sync) and the build peak.
    - `ArrangeOpts` = the 11 drop knobs.
  - Fixture: `arrangement({ genre, groove, brk, after, teaser, bass })` appended to `synth.ts`, with a `riser` stem (HP 500 Hz → 4 kHz, +30 dB, end level 0.3).
    - An 8 kHz sweep end, or a 0.1 end level under the −51 dBFS room tone, left `high` too flat for build ≥ 0.5.
  - Results:
    - main: fires once at drop + 0.265 s (0.77 beat), confidence 0.82 (0.71 without sync);
    - build at bar ends 0, .26, .45, .57, .62, .66, .69;
    - teaser kick in the 16th roll: only the real drop fires;
    - 2-bar break: none;
    - 3 min of groove: never sparse;
    - techno kick-only drop: path (b) at 1 beat + 0.135 s, confidence 0.87.
  - ⚠️ Known limit: a track with no sustained bass at all (G = kick tails, ≈0.1× a bassed groove's) fires on a snare roll, because the snare's 190 Hz body sits in the reese band. The confidence there is 0.59, under the cut gate.
  - Mutants (50: every knob, each from both sides; every confidence term; the build/heat/drop constants; the silence, G-freeze, kick-window, (b), GRACE and drop-reset branches):
    - The first sweep left 5 survivors. Two were dead code and are deleted: the sparse mean's exclusion of loud frames, and the `armed` reset. Three got checks: the hidden-tab `dt` clamp, heat's linear fall, and build's τ-1 s decay without a drop.
    - The second sweep: 49/50 killed. The survivor, the `upBeat` reset at a drop, was dead (the refractory covers it) and is deleted, with its twin `rise`.

### S5.2 [x] Heat post pass in `engine.ts`
Invoke the `ponytail` skill (full) before writing code.
- Goal: constant-colour quad after `copy`/`fade`: multiply by `gain`, mix to white by `flash`; transition shaders untouched.
- Files: `web/src/gl/engine.ts`, `web/src/gl/post.ts` (new, pure helper `postFor(heat,drop,beatPhase,conf)` returning `Post` + test in `web/src/gl/post.test.ts`).
- Behaviour: `gain = 1 + 0.25 heat + strobe`; strobe amplitude <=0.15, 1/4 -> 1/8 notes with heat, x sync.confidence; flash peak 0.8, tau 0.2 s; `Post {gain:1, flash:0}` = identical output to today.
- Tests: caps respected (gain <= 1.4, strobe <= 0.15), identity at rest, tau decay. Mutants: caps, tau, 1/4->1/8 switch, confidence scaling.
- Done-check: GATES + browser: `?debug` force-flash key shows the pass; `Post` identity leaves a scene pixel-identical (eye check) and 60A holds in `?bench`.
- Depends on: S4.2 (same file; run after it).
- **Changed during implementation:**
  - `postFor(heat, drop, beat, conf)`:
    - `drop` = seconds since the drop fired (`Infinity` = none yet), not `ArrangeOut.drop`, which is a confidence source with τ 1 s. S5.3 keeps a `dropAt` and passes `now - dropAt`.
    - `beat` = `sync.beat`. Only its fractional part counts, so a phase also works. The strobe reuses sync.ts `pulse` (k 4).
  - The strobe also needs sync confidence ≥ 0.3 (lead brief), and is then scaled by the confidence.
  - Any value under one 8-bit step (1/255) reads as 0. A decayed flash (≈ 1.06 s after the drop) or a cold heat tail then returns exactly `{ gain: 1, flash: 0 }`, so the engine skips the pass and the frame stays bit-identical.
  - Engine: `tint` is one constant-colour fullscreen pass, drawn up to twice:
    - `blendFunc(DST_COLOR, ONE)` with `gain − 1` gives dst·gain;
    - `blendFunc(ONE, ONE_MINUS_SRC_ALPHA)` with `flash` mixes toward white.
    - Each draw is skipped when its term is 0. A build-up has no flash.
  - No `?debug` force-flash key: `post` is app.ts's `rest` until S5.3 wires it, and app.ts isn't in this step's files. S5.3 adds the key (`dropAt = now`) and does the non-identity eye check.
  - The browser check here covered identity only: a walk on 5175 through Tunnel, Spectrum and Particles, at 60A, with 0 console errors.
  - Mutants: 17/17 killed. They cover the caps, τ, the flash peak, the 1/4 → 1/8 switch and its threshold, the confidence gate and scaling, `STEP` from both sides, `drop ≥ 0` and the unit clamp.

### S5.3 [ ] Wire arrangement: heat speed, flash, `director.cut`
Invoke the `ponytail` skill (full) before writing code.
- Goal: per-frame `arrange.update`, `f.dt *= 1+0.5 heat`, `post` from heat/drop, cut on drop.
- Files: `web/src/app.ts`, `web/src/audio/arrange.ts` (export pure `shouldCut(fired, hold)`), `web/src/audio/arrange.test.ts`.
- Behaviour: `if (fired >= 0.6 && !store.hold) director.cut(director.peek())`; `hold` covers LOCK and open panel; `build`/`drop` also in `src`; style freeze while sparse.
- Tests: `shouldCut` truth table (0.59/0.6, hold on/off). Mutants: threshold, hold negation.
- Done-check: GATES + browser: `cp5/house128-long.wav` (drop section) shows heat then flash + cut; Space (LOCK) -> no cut.
- Depends on: S5.1, S5.2, S4.3.

### CP6 — Sources tab + persistence

### S6.1 [ ] Panel tabs + Sources meters (rAF -> CSS)
Invoke the `ponytail` skill (full) before writing code.
- Goal: header tabs Scene/Sources; Sources tab with Drums, Bass, Arrangement, Custom meter groups driven without React state.
- Files: `web/src/ui/Panel.tsx` (tab switch only), `web/src/ui/SourcesTab.tsx` (new), `web/src/app.ts` (export per-frame `src`).
- Behaviour: one `useEffect` rAF loop writes `--v` per meter, stops on unmount; tab state local; Scene tab content unchanged.
- Tests: pure `meterGroups(settings)` (ids and order incl. `u:*`) in `web/src/ui/SourcesTab.test.ts`. Mutants: group membership, custom id append.
- Done-check: GATES + browser: dnb174.wav, meters blink/breathe; no React re-render storm (React Profiler sanity, one look).
- Depends on: S2.5, S5.3 (app.ts); not parallel with S6.2/S6.3 (same panel file).

### S6.2 [ ] Preset picker, Auto toggle, sens sliders, custom-band form
Invoke the `ponytail` skill (full) before writing code.
- Goal: C8 controls wired to `createSettings` so everything persists in `vjw.audio`.
- Files: `web/src/ui/SourcesTab.tsx`, `web/src/ui/Panel.tsx` (hint badge only if needed), `web/src/store.ts` (instantiate settings singleton if absent).
- Behaviour: picker `Auto/Default/DnB/Dubstep/Techno/house` (Auto = `pick:null`); detected label "detected: DnB 0.8" from `store.style` in its own small component; sliders uncontrolled (apply on input, persist on change); "+ Custom band" form shows `addBand` error text; remove button.
- Tests: pure `pickToPatch(choice)` (Auto/toggle off => state machine of C4) unit-tested. Mutants: Auto vs pick null, toggle-off keeps active as pick.
- Done-check: GATES + browser: add a 40-60 Hz band, reload, it persists and moves; manual pick locks Auto.
- Depends on: S6.1, S4.3.

### S6.3 [ ] Binding source select groups + "-> reese (auto-style)" hint
Invoke the `ponytail` skill (full) before writing code.
- Goal: binding row select grouped levels/drums/bass/arrangement/custom/band; dim hint when the active map rewrites a built-in's source.
- Files: `web/src/ui/Panel.tsx`, `web/src/bind.ts` (export `sourceGroups(custom)` pure), `web/src/bind.test.ts`.
- Behaviour: hint only for `builtin:` ids and only while Auto-style is on; a removed custom band shows as unknown (reads 0).
- Tests: `sourceGroups` covers every `SOURCE_IDS` entry once. Mutants: missing id, duplicate.
- Done-check: GATES + browser: a built-in's row shows "-> reese (auto-style)" with DnB.
- Depends on: S6.2.

### CP7 — Closeout

### S7.1 [ ] Acceptance regression suite from fixtures
Invoke the `ponytail` skill (full) before writing code.
- Goal: one integration test file proving spec §4.1, §4.2, §4.3, §4.5, §4.6 end to end through `analysis.ts` + features + tempo + style + arrange.
- Files: `web/src/audio/acceptance.test.ts` (new), `web/src/audio/synth.ts` (only if a pattern is missing).
- Behaviour: no product code changes except bug fixes found (marked `**Changed during implementation:**`).
- Tests: DnB F1 >=0.70 per drum; 174/182 read right under DnB; 3 genres x 2 variants detected; crossfade <=1 switch; drop + no-cut-under-hold; custom band round-trip.
- Done-check: GATES; test runtime under ~30 s.
- Depends on: S5.3, S6.3.

### S7.2 [ ] Closeout checklist and perf/license notes
Invoke the `ponytail` skill (full) before writing code.
- Goal: verify spec §4 items 1-7 by hand and record evidence; no new features.
- Files: `agents/planner/plan_audio_reactivity.md` (tick boxes only), `web/src/app.ts` (only if `?bench` needs a hook for sources).
- Behaviour: lead runs: DnB meters (§4.1), 174 vs rekordbox (§4.2), 16-bar mix (§4.3), Auto on/off scenes (§4.4), drop + LOCK (§4.5), custom band reload (§4.6), `?bench` 60A on M4 + underrun count (§4.7); lists open knob tunings.
- Tests: none new; full GATES green.
- Done-check: GATES + the manual list above.
- Depends on: S7.1.

## Acceptance map (spec §4 -> steps)
| §4 | Steps | Evidence |
|---|---|---|
| 1 sources + F1 >=0.70 | S1.2 S1.4 S2.4 S6.1 S7.1 | crosstalk matrix, F1 test, meters |
| 2 174 reads 174 | S3.1 S3.2 S7.1 | tempo test, browser vs rekordbox |
| 3 Auto-style, no flap, manual lock | S4.1 S4.3 S6.2 S7.1 | style tests, crossfade fixture |
| 4 built-ins remapped on/off | S1.4 S4.2 S4.3 S6.3 | restyle tests, Fractal `fold` check |
| 5 build -> drop -> cut, LOCK | S5.1 S5.2 S5.3 S7.1 | arrangement fixture, `shouldCut`, house128-long.wav |
| 6 custom band persists | S2.2 S2.5 S6.2 | settings tests, reload check |
| 7 60A, gates, mutants | S2.3 S5.2 S7.2 (+ every DSP step) | `?bench`, underrunEvents, mutant lists |

## Wave table (parallel worktrees; hot files `app.ts`, `onset.worklet.ts`, `Panel.tsx` never twice in a wave)
| Wave | Steps in parallel | Note |
|---|---|---|
| W1 | S1.1, S1.2, S2.1, S2.2, S4.2 | all pure/separate files (S1.1 owns the worklet) |
| W2 | S1.3, S3.1, S4.1, S5.1 | S1.3 needs S1.2; others need S2.2 |
| W3 | S1.4, S2.3 | S1.4 owns `app.ts`; S2.3 owns the worklet |
| W4 | S2.4, S5.2 | features.ts vs engine.ts |
| W5 | S2.5 | `app.ts` |
| W6 | S3.2 | `app.ts` |
| W7 | S4.3 | `app.ts` |
| W8 | S5.3 | `app.ts` |
| W9 | S6.1 | `Panel.tsx` |
| W10 | S6.2 | `Panel.tsx` |
| W11 | S6.3 | `Panel.tsx` |
| W12 | S7.1 | |
| W13 | S7.2 | |

Notes: S5.2 touches `engine.ts` after S4.2 (W1) merged, so no overlap. S1.3 refers to settings types: they exist after S2.2 (W1), so no stubs are needed.
