# Design: genre-aware audio reactivity (epic `audio-reactivity`, Stage 2c)

## TL;DR
- The two variants differ in one place: where the **sustained** detectors run (sub, reese, wobble and custom bands). In both, the **hits** (kick/snare/hats) run in the existing onset worklet: `createDetector` is reused on three Hz ranges of the 512-point FFT the worklet already computes, so hits add no latency.
- **Variant A (simplest):** the sustained sources run on the main thread, at frame rate. They read a second `AnalyserNode` (fftSize 8192) and the existing 1024 one.
  - It has the fewest moving parts.
  - Costs: line-in sustained lag is ≈85–102 ms (at or over the spec's ≤~85 ms). Quality depends on the frame rate. A kick is masked by holding sub/reese for ~200 ms.
- **Variant B (recommended):** the worklet also runs an IIR band bank. Each band has fast and slow followers, and their difference separates kicks from sustained bass (the differential envelopes of research §2). The worklet posts per-hop frames every 2 hops.
  - Sustained lag is ≈30–70 ms, and quality doesn't depend on the frame rate.
  - Vitest fixtures run the same pure code the worklet runs.
- **Shared core, the same in both:**
  - presets as code data;
  - a per-preset tempo range that restricts the ACF's candidate lags to the range's octaves. This also closes the DnB ⅔-tempo trap, which folding alone can't fix.
  - a rule-based style classifier with EMA, margin, dwell and min-hold;
  - Auto-style remaps the built-ins through a **styled `Sources` overlay**, picked per scene at render, so docs are never touched;
  - a build/drop heuristic with a confidence-gated `director.cut(peek())` that respects LOCK;
  - heat as a post pass plus a clock scale;
  - settings in localStorage `vjw.audio`;
  - a "Sources" tab whose meters are written by rAF.
- **One decision for the user:** Variant A or Variant B.

## Freshness
- 2026-10-28. Inputs, read in this run:
  - `thoughts/spec_audio_reactivity.md`, all of it (§1–§5).
  - `agents/research/research_audio_features.md` §1–§8.
  - `agents/research/research_audio_analysis.md` §2–§5.
  - `agents/planner/plan_pilot.md` drift notes S2.1–S2.3 and S5.1–S5.4.
  - `agents/planner/plan_effects.md` drift notes S1.2, S5.1, S5.2 and S6.1 (and S6.2 for `director.cut`).
  - Shipped code at `cp7-effects`, read-only:
    - `web/src/audio/{input,onset,onset.worklet,energy,tempo,sync}.ts`;
    - `web/src/bind.ts`, `app.ts`, `director.ts`, `scenes/builtin.ts`, `edit.ts`, `library.ts`, `ui/Panel.tsx`;
    - for the binding path: `gl/live.ts` (`render`, `bindAll`), `gl/engine.ts` (`render`, `drawScene`), `frame.ts`, `store.ts`.
  - `agents/STATE.md` HEAD (the roadmap items under "Key decisions"; the effects re-brief is pending).
- graphify was not used: this agent has no shell, so the files were read directly.

## Constraints
- **Scope:**
  - Spec §2.1 sources: `kick`, `snare`, `hats`, `sub`, `reese`, `wobble`, `build`, `drop`, and user bands. All of them go into the open `Sources` registry.
  - Spec §2.2 presets: Default, DnB, Dubstep/bass, Techno/house.
  - Spec §2.3 Auto-style (on by default).
  - Spec §2.4 build/drop behaviour.
  - Spec §2.5 Sources tab and persistence.
- **Two speeds (spec §2.1):**
  - Hits must add no latency.
  - Sustained sources may add ≤ ~85 ms.
  - Spec §2.6: the 8192 FFT is allowed only for the low end; 60A must still hold on the M4.
- **Acceptance:** spec §4.1–§4.7. §4.1 leaves the hit-accuracy number to design. It is set below as a `(default)`.
- **Non-goals (spec §3):** ML stems, MIDI/Link, multi-binding and formulas, the effects re-brief, hip-hop/trap presets.
- **Licensing:** any license is allowed (STATE key decision, session 3). **This design adds no dependency:**
  - fft.js is already in `web/package.json`;
  - Meyda (research §1) is not needed, because the few formulas used here are one-liners.
- **Contracts kept:**
  - `Sources = Record<string, number>`, and `evaluate()` reads an unknown id as 0 (plan_effects S1.2).
  - `WorkletMsg` (CP2) is extended additively; `FrameInput` (CP1) is unchanged.
  - **T1:** a file's onsets wait until audible; line-in applies them on arrival (plan_pilot S2.3).
  - (c) runs on `heard()` time (S5.3).
  - `director.cut(id)` exists (S6.2).
  - The panel's rule holds: no React re-render while a control moves (S5.2).
- **Facts from the code that shape this design:**
  - Onset strength saturates at 4.0 on kicks, claps and hats alike (plan_pilot S5.1, S5.2). A per-drum split must therefore come from **frequency band**, not strength.
  - Tempo:
    - The (c) ODF is the flux of bins 0–3 (0–330 Hz).
    - `tempo.ts` folds readings into [90, 180).
    - Its 128-centred prior is load-bearing against ⅔ errors (S5.1: without it, "174 → 116").
  - `sync` keeps its octave on merges: ×2/÷2 "stick" (S5.2). When a preset changes the tempo range, the running grid's octave has to be snapped.
  - Built-ins:
    - 20 of the 27 bind only `bass`, `onset`, `beat` and `lfo`. None binds `treb`/`mid`/`band*`.
    - The other 7 (four natives, the two native-only combos and the toy) read `FrameInput` or iChannel0 directly.
  - `store.hold` is true under Space (LOCK) **and** while the panel is open (plan_effects S5.1).

---

## Shared core (identical in A and B)

### C1 New sources (ids, values, conventions)
| id | kind | value 0..1 | speed |
|---|---|---|---|
| `kick`, `snare`, `hats` | hit | `clamp((strength − 1.5)/2.5) · exp(−age/τ)`, the `onset` formula of `bind.ts`. τ: kick and snare 0.12 s, hats 0.06 s `(default)`. A hit is an event and an envelope: an `event`-type input fires when the envelope crosses 0.5 (the existing `live.ts` rule). | fast |
| `sub`, `reese` | sustained | The kick-gated band envelope ÷ its running average ÷ 2. This is the `bass/mid/treb` convention: 1 ≈ average → 0.5. | ≤ 85 ms |
| `wobble` | sustained | `max(0, (g − ḡ)/ḡ)` of the wobble band's kick-gated envelope `g`. It is 0 at rest and rises when the filter opens, so it follows the LFO. | ≤ 85 ms |
| `wobbleDepth` | sustained | A ≈1 s EMA of `|g − ḡ|/ḡ`. | slow |
| `build` | arrangement | Tension in a build-up (C6). | slow |
| `drop` | arrangement | 1 at a drop, decaying with τ ≈ 1 s, × the drop's confidence. | event |
| `u:<id>` | custom | The normalised band × gain, gated at the threshold, smoothed with the user's attack/release (a dt-based one-pole, like `evaluate()`). | per band |

- Every value is multiplied by the user's `sens` (0–2, where 1 is neutral) and by the preset's `sens`.
- `SOURCE_IDS` gains the 9 fixed ids. The panel appends the custom ids from the settings.
- **Level independence:** ratios to running averages, as in `energy.ts` (research analysis §4), so line-in and file behave alike.

### C2 Hits: worklet, three band detectors on the existing FFT
- A new `audio/drums.ts` (pure) holds three `createDetector` instances over Hz→bin ranges of the worklet's existing 257 magnitudes. No new FFT.
- `(default)` bands, which presets may override: kick 40–150 Hz, snare/clap 1–5 kHz, hats 7–16 kHz. At 48 kHz the bins are 93.75 Hz wide.
- `DetectorOpts` gains `floor`. Today's module `FLOOR = 1` was calibrated as a sum over 257 bins (plan_pilot S2.1). A 2-bin kick band and a 96-bin hat band need their own floors, tuned on the fixtures.
- **Crosstalk `(default)`:** a snare in the same hop as a kick is dropped unless its strength is ≥ the kick's. A kick's click reaches 1–5 kHz.
- Each hit is posted at once as `{ kind: 'hit', drum, t, strength }`. `app.ts` drains hits through the same T1 rule as onsets.
- The (b) `onset` detector and the (c) bass ODF are untouched, so tempo and sync behave exactly as today.
- **Latency:** the same hop and message path as today's onsets, which were stamped 0.7–4.7 ms after the kick (plan_pilot S2.2). **Nothing is added.**

### C3 Presets and the tempo range
- `audio/presets.ts` is code data. It is not user-editable (YAGNI: the user tunes `sens` and adds custom bands instead).

| | Default | Drum & Bass | Dubstep / bass | Techno / house |
|---|---|---|---|---|
| `bpm` | `null`: today's fold [90, 180), prior 128 | 160–185 | 135–150 | 118–135 (spec defaults) |
| kick / snare / hats | 40–150 / 1k–5k / 7k–16k Hz | same | same | same |
| sub / reese / wobble band | 30–60 / 60–250 / 150–1500 Hz | same | 30–60 / **70–350** / 150–1500 | same as Default |
| `sens` | all 1 | all 1 | all 1 | all 1 (tuned on fixtures and the user's tracks) |
| `map` (Auto-style) | `{}` | `bass→reese, onset→kick, treb→hats` | `bass→wobble, onset→snare, treb→hats` | `onset→kick, treb→hats` |
| classifier prototype | — | kicks/beat ≈ 0.5, bass share high | kicks/beat ≈ 0.25–0.5, wobble high | kicks/beat ≈ 1 |

**Tempo range** (a change to `tempo.ts`, `setRange(bpm | null)`):
- **Candidates:** with a range set, the ACF picks only lags whose BPM is in `[lo/1.1, hi·1.1] × {½, 1, 2}`. The ±10% margin is a `(default)` knob. It also covers research §6's wider genre ranges, for example techno up to 150.
- **Fold and prior:** the reading folds into the window, and the prior is centred on √(lo·hi). `null` keeps today's behaviour exactly.
- **Why restrict instead of only folding (derived):**
  - In a DnB two-step (kick on 1 and on the "and" of 2), the kick-to-kick intervals are 2.5 and 1.5 beats. The 1.5-beat lag is a ⅔-tempo peak at 116 BPM, and today's 128-centred prior favours it.
  - No octave fold window that keeps 160–185 can fix that: it either keeps 116 or folds it to 232.
  - Under DnB the windows are 145–204 / 72–102 / 290–408, so 116 can't be a candidate. ⚠️ The 116 peak is derived, not measured; the §4.2 fixture settles it.
- **The ACF is always computed over the full 45–370 BPM lag span** (about today's 45–360). `families(windows)` returns each genre's evidence for the classifier: the prominence of the best lag in that window, mapped by today's `PROM_NONE`/`PROM_FULL`. The classifier therefore never depends on the active range, so there is no feedback loop.
- **Octave snap:** on a preset change, `app.ts` brings the sync grid into the new window with the existing `sync.double()`/`halve()`. Merges would otherwise keep a stale octave. The snap happens only on the change, so the user's later `[`/`]` presses are respected.

### C4 Style classifier and Auto-style
- **Features**, per frame and the same in both variants:
  - `T_g`: tempo-family evidence per genre, from `tempo.families()`.
  - `K`: kicks per beat over the last 8 s. Used only while `sync.confidence ≥ 0.3`, otherwise ignored.
  - `H`: hats per beat.
  - `W`: the raw `wobbleDepth`.
  - `B`: the bass share, (raw sub + raw reese) / total, using `f.energy.bands` for the total.
- **Score:** `S_g = T_g · (0.5 + 0.5·match_g)`, where `match_g` is the mean Gaussian closeness of (K, H, W, B) to the genre's prototype in `presets.ts`.
  - Tempo is necessary; the pattern features break overlaps. A 140 BPM techno track has 1 kick per beat, against dubstep's 0.25–0.5.
  - It is a hand-tuned heuristic, tuned on the fixtures (Research gaps 5).
- **No-flap `(default)` knobs:**
  - EMA of the scores, τ 4 s.
  - A challenger must lead the current genre by a margin of 0.15 for a **dwell of 16 s**.
  - **Min-hold of 32 s** after any switch.
  - Below a floor of 0.35, the current genre is kept.
  - **Frozen** in silence and during an arrangement "sparse" section (C6), since breakdowns lack drums.
  - Result: a 16-bar crossfade (30 s at 128 BPM) switches at most once.
- **State machine.** The persisted settings are `{ auto, pick }`; the classifier always runs, so the hint stays live.
  - Active preset = `pick ?? (auto ? detected ?? 'default' : 'default')`.
  - Remap = `auto ? PRESETS[active].map : none`.
  - The hint "looks like DnB" shows when `detected ≠ active`.

```mermaid
stateDiagram-v2
  [*] --> Follow: auto on (default)
  Follow --> Locked: user picks a preset
  Locked --> Follow: user picks "Auto"
  Follow --> Manual: toggle off (pick = active)
  Locked --> Manual: toggle off
  Manual --> Manual: user picks a preset
  Manual --> Follow: toggle on (pick = null)
  note right of Follow: auto=true, pick=null. Preset = detected. Built-ins remapped.
  note right of Locked: auto=true, pick=p. Preset = p. Built-ins remapped (p's map).
  note right of Manual: auto=false, pick=p. Preset = p, sources only. No remap.
```
- **How this meets the spec:** Auto is on by default; a manual choice locks it until the user picks "Auto" again (§2.3); Off means scenes use their own bindings while the preset still sets the sources (§2.3).

### C5 Auto-style remap: a styled `Sources` overlay at evaluation time
- **`bind.ts`:** `restyle(src, from, to, w, out)`. `out` starts as a copy of `src`. Then, for each key k in `from ∪ to`, `out[k] = (1−w)·src[from[k] ?? k] + w·src[to[k] ?? k]`.
  - `w` ramps 0 → 1 over **2 s** `(default)` after the active map changes. This is the smooth switch, and Auto off is a fade to `{}`.
  - Aliasing is safe because the new sources share the old ones' scale: `kick` uses `onset`'s formula, and `reese`/`sub` use `bass`'s convention.
- **`engine.render(shot, f, src, styled, post)`:** `drawScene` gives `styled` to ids starting with `builtin:` and `src` to every other scene.
  - The panel's edited copy of a built-in keeps the built-in id, so it stays styled.
  - Untouched: `live.ts`, `evaluate()`, the docs, the library and exports.
- **Panel:** in a built-in's binding row, a dim "→ reese (auto-style)" sits next to the source select whenever the map rewrites that source.
- **Rejected: rewriting the docs.** It would clone and dirty them through `edit.ts`, leak into Save as and export, need an undo when Auto goes off, and need per-scene tables.
- **Known edges, accepted:**
  - Save as on a built-in creates a user scene, which reads its own `bass` again (spec §2.3: user scenes keep their bindings).
  - The 7 unbound built-ins don't change.
  - No built-in binds `treb`, so the spec's "hats → sparks" example appears only once the effects re-brief binds a sparkle parameter to `treb`/`hats`. The map is already there.

### C6 Build, drop, heat and the cut
- `audio/arrange.ts` is pure and runs once per frame. Its inputs:
  - `low`: raw sub + reese, kick-gated, from the features;
  - `high`: raw energy of the `f.energy.bands` at ≥ 4 kHz;
  - `total`;
  - this frame's kick hits;
  - `sync.beat` when confident.
- **Heuristic** (all `(default)` knobs):
  - **Groove `G`:** an EMA of `low` with τ 20 s, updated only outside sparse sections.
  - **`sparse`:** a 1 s EMA of `low` below `0.35·G`, while `total` is above the silence floor. An intro after silence counts as music; a stopped deck does not.
  - **`armed`:** sparse for ≥ 6 s (≈ 4 bars at 174).
  - **`build`:**
    - while sparse: `clamp(0.4·min(1, dur/16 s) + 0.6·riser)`, where `riser` = the log ratio of a 0.5 s EMA of `high` to a 4 s EMA, plus the slope of the snare/hat rate;
    - otherwise it decays with τ 1 s.
  - **A drop fires when armed and either:**
    - (a) the sustained low end comes back at ≥ 4× its sparse mean and ≥ 0.6·G, within 150 ms of a kick; or
    - (b) for kick-only drops such as techno's, a 2nd kick arrives within 1.2 beats with `low` ≥ 0.6·G.
  - A lone teaser kick without bass never fires.
  - **Confidence:** from the sparse duration, the return ratio, beat alignment (when sync is confident) and the build peak.
  - **Refractory:** 30 s. **Warm-up:** `G` needs 20 s of music.
- **Cut:** `if (fired ≥ 0.6 && !store.hold) director.cut(director.peek())`.
  - `prepare()` keeps `peek()` built, so the cut is instant.
  - `cut()` restarts the autopilot's 16-bar count from the drop.
  - `hold` covers both LOCK and an open panel.
  - Below 0.6, `drop` still pulses as a source; it just doesn't cut.
- **False-cut mitigation, all in the numbers above:**
  - arming needs ≥ 6 s of sparse;
  - the bass or the kick pattern must actually come back;
  - beat alignment;
  - 30 s refractory;
  - 20 s warm-up;
  - the confidence gate;
  - LOCK.
  - A DJ's bass swap looks like a drop and will cut. That is accepted: it marks a new track.
- **Heat** composes *on top of* scene bindings and never changes a binding's value:
  - `heat` = `build` smoothed with τ 0.5 s, falling to 0 within 1 s after a drop.
  - **Speed:** `app.ts` multiplies `f.dt` by `(1 + 0.5·heat)`, which speeds up layer clocks and natives' integrators.
  - **Brightness and strobe rate:** a new post pass in `engine.ts`, drawn after `copy`/`fade`. It is a constant-colour quad with fixed-function blending: multiply by `gain` = `1 + 0.25·heat + strobe`, then mix toward white by `flash`. No transition shader changes.
  - **Strobe** is a gentle beat pulse that goes from 1/4 to 1/8 notes as heat rises, with amplitude ≤ 0.15, × `sync.confidence`.
  - **The drop flash** peaks at 0.8 with τ 0.2 s.
  - ⚠️ Assumption, needs confirmation: these caps are conservative for photosensitivity. No research covers it (Research gaps 6), and STATE's backlog already flags the full-white strobe.

### C7 Settings and custom bands
- `audio/settings.ts`: `createSettings(kv)` uses the library's `Kv` seam, so it is tested without a browser. It stores JSON under localStorage `vjw.audio` `(default)`, small and synchronous like `vjw.stars`. `parseSettings` replaces any invalid field with its default; `onChange` follows the library's pattern.
- **Custom band validation `(default)`:**
  - 20 ≤ lo; hi ≥ 1.1·lo; hi ≤ 0.45·sampleRate;
  - gain 0–4, gate 0–1, attack and release 0–2 s;
  - a non-empty name of ≤ 24 characters;
  - **at most 8 bands**, which bounds the audio-thread cost.
- **The id** is `u:` + 6 random characters and never changes; renaming only changes the label. A removed band reads 0 in bindings (`evaluate()`'s unknown-id rule).
- **Sensitivity:** one user value per source, global across presets. It multiplies the preset's value (1 = the preset's default).

### C8 Panel "Sources" tab
- **Layout:**
  - The panel header gets two tabs, **Scene** (today's content) and **Sources**. Tab state is local React state.
  - The Sources tab shows:
    1. the preset picker (`Auto · Default · DnB · Dubstep/bass · Techno/house`), the Auto-style toggle, and "detected: DnB · 0.8" (or the hint);
    2. **Drums:** kick, snare and hats meters, each with a sens slider;
    3. **Bass:** sub, reese, wobble and wobbleDepth;
    4. **Arrangement (experimental):** build, a drop lamp and heat;
    5. **Custom:** one row per band (meter, gain, ×), then "+ Custom band", an inline form for name, from–to Hz, gain, threshold, attack and release.
- **Live meters without re-renders:**
  - `app.ts` exports its per-frame `src`; `Panel` already imports `director` from there.
  - The tab's single `useEffect` rAF loop writes each meter's CSS `--v`.
  - It stops on unmount. Nothing goes into React state.
- **The detected label** rides the 4×/s badge patch as `store.style`, and re-renders only its own small component (the `Gpu()` pattern).
- **Sliders are uncontrolled** (S5.2). On `input` they apply live; on `change` they persist.
- **The binding source select** groups its options as levels / drums / bass / arrangement / custom / band.
- **Known:** an open panel holds the autopilot, so there are no drop cuts while editing. That is today's behaviour, kept.

### C9 Shared contracts (TypeScript, module boundaries)
```ts
// audio/presets.ts
export type Genre = 'dnb' | 'dubstep' | 'techno'
export type PresetId = 'default' | Genre
export type Band = readonly [lo: number, hi: number] // Hz
export interface Preset {
  name: string
  bpm: Band | null // null = today's fold [90, 180), prior 128
  bands: Record<'kick' | 'snare' | 'hats' | 'sub' | 'reese' | 'wobble', Band>
  sens: Readonly<Record<string, number>> // missing = 1
  map: Readonly<Record<string, string>> // built-in source → new source while Auto-style is on
  proto?: { kickPerBeat: number; hatsPerBeat: number; wobble: number; bass: number } // classifier (genres only)
}
export const PRESETS: Readonly<Record<PresetId, Preset>>

// audio/settings.ts
export interface CustomBand { id: string; name: string; lo: number; hi: number; gain: number; gate: number; attack: number; release: number }
export interface AudioSettings { v: 1; auto: boolean; pick: PresetId | null; sens: Record<string, number>; custom: CustomBand[] }
export function parseSettings(x: unknown): AudioSettings
export function createSettings(kv: Pick<Storage, 'getItem' | 'setItem'>): {
  get(): AudioSettings
  patch(p: Partial<Pick<AudioSettings, 'auto' | 'pick' | 'sens'>>): void
  addBand(b: Omit<CustomBand, 'id'>): string | null // error message, or null once added
  removeBand(id: string): void
  onChange(cb: () => void): () => void
}
export const activePreset: (s: AudioSettings, detected: Genre | null) => PresetId

// audio/drums.ts (pure; runs in the worklet)
export type Drum = 'kick' | 'snare' | 'hats'
export interface Hit { drum: Drum; t: number; strength: number } // t = AudioContext time, s
export function createDrums(sampleRate: number, fftSize: number): {
  configure(bands: Record<Drum, Band>): void
  detect(mag: Float32Array, t: number): readonly Hit[] // reused array, 0–3 hits
}

// audio/onset.worklet.ts (CP2, additive; B adds 'feat' and bands, see Variant B)
export type WorkletMsg = /* existing 'onset' | 'odf' */ | { kind: 'hit'; drum: Drum; t: number; strength: number }
export type WorkletIn = { kind: 'config'; rev: number; drums: Record<Drum, Band> }

// audio/tempo.ts (changed)
export interface TempoSource { /* push, pushOdf, read as today */ setRange(bpm: Band | null): void; families(windows: readonly Band[]): number[] }

// audio/features.ts (main thread, pure; its *input* side differs per variant)
export interface Features {
  hit(h: Hit): void // after the T1 drain
  fill(out: Sources, dt: number, s: AudioSettings, p: Preset): void // kick snare hats sub reese wobble wobbleDepth u:*
  readonly raw: { sub: number; reese: number; wobbleDepth: number } // classifier and arrangement
}

// audio/style.ts
export interface StyleIn { families: Record<Genre, number>; kickPerBeat: number | null; hatsPerBeat: number | null; wobble: number; bass: number; freeze: boolean }
export interface StyleOut { detected: Genre | null; scores: Record<Genre, number>; confidence: number }
export function createStyle(opts?: Partial<StyleOpts>): { update(x: StyleIn, now: number): StyleOut }

// audio/arrange.ts
export interface ArrangeIn { low: number; high: number; total: number; kick: boolean; beat: number | null; now: number }
export interface ArrangeOut { build: number; drop: number; heat: number; sparse: boolean; fired: number | null } // fired = this frame's drop confidence
export function createArrangement(opts?: Partial<ArrangeOpts>): { update(x: ArrangeIn): ArrangeOut }

// bind.ts (changed)
export const SOURCE_IDS: readonly string[] // + kick snare hats sub reese wobble wobbleDepth build drop
export function restyle(s: Sources, from: Readonly<Record<string, string>>, to: Readonly<Record<string, string>>, w: number, out: Sources): Sources

// gl/engine.ts (changed)
export interface Post { gain: number; flash: number }
export function render(shot: Shot, f: FrameInput, s: Sources, styled: Sources | null, post: Post): void

// store.ts (+ field, patched at the 4×/s badge cadence only on change)
style: { active: PresetId; detected: Genre | null; confidence: number }
```

### C10 Test strategy (both variants; the variants differ only in what the fixtures run through)
- **Fixtures are synthesised in code** `(default)`: `web/src/audio/synth.ts` is a test-only helper with a seeded PRNG at 48 kHz. There are no binary assets and no ffmpeg in CI; ffmpeg stays a lead/scratchpad tool for optional real-track checks.
  - **Stems:**
    - kick: a sine sweep 150 → 45 Hz with a 180 ms decay, plus a 2 ms click;
    - snare: a 190 Hz tone plus 1–6 kHz noise;
    - clap;
    - hats: noise high-passed at 7 kHz, 40 ms long;
    - sub: a 45 Hz sine;
    - reese: two saws at 55 Hz, ±10 cents, low-passed;
    - wobble: a saw through a low-pass swept 150 Hz ↔ 1.5 kHz at 1/8 notes;
    - riser: noise with a rising high-pass and level;
    - pad.
  - **Patterns** (all return the truth onset times and the drop time):
    - DnB 174 two-step: kick on 1 and 2.5, snare on 2 and 4, hats on 8ths and 16ths;
    - dubstep 140 half-time: kick on 1, snare on 3, wobble;
    - techno 128 four-on-the-floor: clap on 2 and 4, open hats off the beat;
    - arrangement: 16 groove bars, an 8-bar breakdown (no kick or sub, a riser, a snare roll), then the drop;
    - `crossfade(a, b, 16 bars)` (equal power).
- **Mutation-sensitive, as S5.1 (11 mutants) and S5.2 (23) were:** every knob and branch of the following, when broken alone, must fail at least one test:
  - `drums.ts`;
  - the sustained DSP (B: `bands.ts`; A: `features.ts`);
  - `features.ts` normalisation and sens;
  - `style.ts`: EMA, margin, dwell, min-hold, floor, freeze, lock;
  - `arrange.ts`: arming, return ratio, kick-only path, refractory, warm-up, confidence gate;
  - the tempo `setRange` candidates, fold and prior, and `families`;
  - `restyle` (alias and fade);
  - `parseSettings`.
  - The planner enumerates the mutants per step.
- **How spec §4 is measured:**

| §4 | Automated (Vitest) | Manual (Chrome, the user's tracks) |
|---|---|---|
| 1 | The DnB mix (kick + snare + hats + reese + sub) runs through the worklet's pure code. **The F1 for each of kick, snare and hats is ≥ 0.70, with a ±30 ms tolerance `(default)`.** This sets spec §4.1's ⚠️ number. A crosstalk matrix: each stem played solo drives its own source (mean ≥ 0.3) and keeps the others ≤ 0.1 (knobs); for example, reese solo gives 0 kicks, and kick solo keeps reese low. | The meters follow their elements on a DnB track. |
| 2 | The DnB 174 two-step fixture with the DnB preset → `sync.bpm` reads 174 ± 1 within 10 s. 182 → 182, not 91. The Default-preset reading is logged for information. | 174 vs rekordbox. |
| 3 | Each genre (2 pattern variants each) is detected correctly within 20 s. A 16-bar crossfade switches ≤ 1 time and ends on B. A manual pick switches 0 times. A breakdown or silence switches nothing. | Representative tracks; one 16-bar mix. |
| 4 | `restyle` with Auto on/off and the fade. `drawScene` picks per id (a 2-line check through the engine seam, or by eye). | Fractal's `fold` follows the reese meter with Auto on and `bass` with Auto off. |
| 5 | The arrangement fixture: the drop fires ≤ 150 ms after the drop's first kick with confidence ≥ 0.6, and `build` ≥ 0.5 at the end of the breakdown. 3 min of groove give 0 drops. A teaser kick gives 0 drops; a 2-bar break gives no cut. App-level: a pure guard `shouldCut(fired, hold)`. | A flash plus a cut at the drop; Space → no cut. |
| 6 | A custom 40–60 Hz band: a 50 Hz sine reads ≥ 5× a 120 Hz sine. The settings round-trip; corrupt JSON gives the defaults. | Add, bind, see it move, reload. |
| 7 | Gates green; the mutation list above. | `?bench` 60A on the M4; `?debug` shows hits, drops and classifier scores. |

---

## Variant A — Hybrid: worklet hits + main-thread analysers (simplest)

**Summary:**
- The only worklet change is C2 (drums plus the `config` message).
- The sustained sources are computed on the main thread, once per rendered frame:
  - **sub, reese and low custom bands** from a new `AnalyserNode` (fftSize 8192, smoothing 0): 5.86 Hz bins, a Blackman window of 170.7 ms, and an 85.3 ms centre lag (research §5);
  - **wobble and high custom bands** from the existing 1024 analyser, which `app.ts` already reads every frame.
- Kick gating holds sub/reese for 200 ms after each kick hit, about the 8192 window length.

```mermaid
flowchart LR
  IN["line-in / file"] --> HUB["hub (GainNode)"]
  HUB --> A1["AnalyserNode 1024 (existing)"]
  HUB --> A8["AnalyserNode 8192 (NEW)"]
  HUB --> WK["onset worklet: FFT 512 / hop 256<br/>+ drums.ts (NEW)"]
  SET["settings.ts + presets.ts"] -->|"config (drum bands)"| WK
  WK -->|"onset, odf (existing)"| Q["input.ts queues"]
  WK -->|"hit (immediate)"| Q
  Q -->|"T1 drain"| FT["features.ts (NEW): hit envelopes"]
  A1 -->|"dB per frame"| EN["energy.ts (existing)"]
  A1 -->|"dB per frame: wobble band"| FT
  A8 -->|"dB per frame: sub, reese, custom lows"| FT
  Q -->|odf| TP["tempo.ts (+setRange, families)"] --> SY["sync.ts"]
  EN --> SRC["Sources src (bind.ts)"]
  FT --> SRC
  TP -->|families| ST["style.ts"]
  FT -->|raw| ST
  ST --> ACT["active preset"]
  ACT -->|range| TP
  ACT -->|map| RS["restyle → styled"]
  FT -->|raw| AR["arrange.ts: build / drop / heat"]
  SY --> AR
  AR -->|"drop ≥ θ and !hold"| DR["director.cut(peek)"]
  SRC --> RS
  SRC --> ENG["engine.render: user ← src, built-in ← styled"]
  RS --> ENG
  AR -->|"gain, flash"| POST["post pass"]
  ENG --> POST --> CAN["canvas → REC"]
  SRC -.->|"rAF meters"| UI["Panel › Sources tab"]
  UI --> SET
```

**Modules and files (under `web/src/`):**
- **New:**
  - `audio/presets.ts`, `audio/settings.ts` (+test), `audio/drums.ts` (+test), `audio/features.ts` (+test), `audio/style.ts` (+test), `audio/arrange.ts` (+test);
  - `audio/synth.ts` (a test helper, plus a ~15-line `analyserFrames(x, fftSize, fps)` that simulates the analyser in Node: Blackman α 0.16 → fft.js → dB, per research analysis §2);
  - `ui/Sources.tsx`.
- **Changed:**
  - `audio/input.ts`: `lowAnalyser` and `configure()`;
  - `audio/onset.worklet.ts`: drums, `config`;
  - `audio/onset.ts`: the `floor` option;
  - `audio/tempo.ts`;
  - `bind.ts`, `app.ts`, `gl/engine.ts`, `store.ts`, `ui/Panel.tsx`, `ui/panel.css`.

**Variant-specific contract:**
```ts
// audio/input.ts
export const lowAnalyser: AnalyserNode // fftSize 8192, smoothingTimeConstant 0, hub → it
export function configure(c: WorkletIn): void // queued until the worklet node exists
// audio/features.ts: A's input side
export function createFeatures(sampleRate: number): Features & {
  frame(lowDb: Float32Array /* 8192 analyser */, fastDb: Float32Array /* 1024 analyser */, sinceKick: number /* s */, dt: number): void
}
```

**Latency and batching:**
- Hits: no added latency (C2).
- Sustained on line-in: 85.3 ms window centre + 0–16.7 ms rAF ≈ **85–102 ms**, which is at or over the spec's "≤ ~85 ms".
  - Knob: 4096 brings it to ≈43–59 ms, but at 11.7 Hz bins research §5 says 40 Hz and 60 Hz can't be told apart.
  - Files: the analyser leads the audible sound by ≈ baseLatency + outputLatency (research analysis §5; T1 isn't applied to analyser data, as today), so files feel ≈40 ms earlier.
- Wobble: 10.7 ms + 0–16.7 ms.
- New messages: only hits (~10/s) and rare config messages.
- **Frame-rate dependence:** in mode `30`, the frame loop skips every other rAF, so the sustained sources are sampled at 30 Hz. An 11.6 Hz wobble (research §2) then gets ~2.6 samples per cycle.

**Acceptance:** §4.1–§4.7 are met as in C10. Two caveats:
- §4.1 "sustained ≤ ~85 ms" is borderline on line-in.
- The fixture tests run through an analyser *simulation*, not the platform node.

**Roadmap (STATE key decisions: Butterchurn next; editor → camera → clip mixer; MIDI/Link and Electron later):**
- Butterchurn reads its own `AnalyserNode` and computes its own bass/mid/treb (research analysis §4), so it is unaffected.
- Camera and clip layers bind the same open registry, and the post pass applies to any composite.
- Link can feed `sync`, and the classifier's tempo family can take Link's BPM.
- Electron runs the same Web Audio.
- Nothing here blocks the roadmap, and nothing is built for it.

**Risks:**
- The line-in sustained lag is at or over the spec bound.
- With four-on-the-floor kicks (2.13/s at 128 BPM) and a 200 ms hold, sub/reese are frozen ≈43% of the time, so they look steppy (derived).
- Wobble degrades in mode 30.
- The 8192 FFT runs on the main thread every frame. Bounds: 0.1–0.35 ms (research §8: Node/fft.js); Chrome's analyser is unmeasured ⚠️.
- The test fidelity depends on how well the simulation matches Chrome's analyser.

**Effort:** M (≈ 13–14 steps; the smaller of the two).

---

## Variant B — Worklet DSP: hits + IIR band bank in the worklet (recommended)

**Summary:**
- **The worklet body becomes a pure module.** The worklet's `process()` body moves into `audio/analysis.ts`, and `onset.worklet.ts` keeps ~20 lines of glue (mono mix → `block()` → `port.postMessage`).
- **On top of today's FFT path and C2's drums, `analysis.ts` runs `audio/bands.ts` per render quantum:**
  - a bank of up to 11 bands: sub, reese, wobble and ≤ 8 custom;
  - each band is two cascaded RBJ band-pass biquads with Q from its edges (≈12 dB/octave skirts; the configuration research §8 benchmarked);
  - each band has two followers: `e1` (fast attack ≈1 ms) and `e2` (attack ≈20 ms), with equal release.
- **Kick gating** by differential envelopes (research §2, the SPL transient designer): while `e1/e2 > TRANSIENT` (≈2, +6 dB), and for ≈60 ms after, the band's `held` output stops following `e2`.
  - A 2 ms kick attack trips the gate. A wobble's ≥ 40 ms rise does not, because `e2` keeps up (derived).
- **Per-hop frames** `[e2, held] × bands` are posted every **2 hops**.
- `features.ts` normalises them and derives `wobble` and `wobbleDepth` at hop rate (187.5 frames/s), so the result doesn't depend on the render frame rate.

```mermaid
flowchart LR
  IN["line-in / file"] --> HUB["hub (GainNode)"]
  HUB --> A1["AnalyserNode 1024 (existing)"]
  HUB --> WK["onset worklet = glue<br/>analysis.ts (NEW, pure):<br/>FFT 512 → onset, bass ODF, drums.ts<br/>IIR bank bands.ts: e1/e2/held per band"]
  SET["settings.ts + presets.ts"] -->|"config {rev, drum bands, bands}"| WK
  WK -->|"onset, odf (existing)"| Q["input.ts queues"]
  WK -->|"hit (immediate)"| Q
  WK -->|"feat {rev, t0, hop, values} every 2 hops"| Q
  Q -->|"T1 drain: hits; frames up to heard time"| FT["features.ts (NEW): normalise, wobble, hit envelopes, custom"]
  A1 -->|"dB per frame"| EN["energy.ts (existing)"]
  Q -->|odf| TP["tempo.ts (+setRange, families)"] --> SY["sync.ts"]
  EN --> SRC["Sources src (bind.ts)"]
  FT --> SRC
  TP -->|families| ST["style.ts"]
  FT -->|raw| ST
  ST --> ACT["active preset"]
  ACT -->|range| TP
  ACT -->|map| RS["restyle → styled"]
  FT -->|raw| AR["arrange.ts: build / drop / heat"]
  SY --> AR
  AR -->|"drop ≥ θ and !hold"| DR["director.cut(peek)"]
  SRC --> RS
  SRC --> ENG["engine.render: user ← src, built-in ← styled"]
  RS --> ENG
  AR -->|"gain, flash"| POST["post pass"]
  ENG --> POST --> CAN["canvas → REC"]
  SRC -.->|"rAF meters"| UI["Panel › Sources tab"]
  UI --> SET
```

**Modules and files (under `web/src/`):**
- **New:** everything in A's list except `analyserFrames`, plus:
  - `audio/bands.ts` (+test);
  - `audio/analysis.ts` (+test: whole fixtures through the exact worklet code).
- **Changed:** as in A, but `input.ts` gains `featQueue` and `configure()` instead of a second analyser, and `onset.worklet.ts` shrinks to glue.
- **Bundling:** the worklet chunk keeps bundling its imports as today (plan_pilot S2.2: one plain-JS IIFE). It now pulls in `analysis.ts`, `bands.ts` and `drums.ts`.

**Variant-specific contract:**
```ts
// audio/bands.ts (pure)
export interface BandSpec { id: string; lo: number; hi: number } // Hz
export function createBank(sampleRate: number): {
  configure(specs: readonly BandSpec[]): void // new coefficients; follower state kept per id → no jump
  process(x: Float32Array): void // one render quantum, mono
  read(out: Float32Array): void // per band, in spec order: [e2, held]
}
// audio/analysis.ts (pure; the worklet's body)
export function createAnalysis(sampleRate: number): {
  configure(c: WorkletIn): void
  block(chans: Float32Array[], frame: number, post: (m: WorkletMsg) => void): void
}
// onset.worklet.ts (CP2, additive)
export type WorkletMsg = /* 'onset' | 'odf' | 'hit' */ | { kind: 'feat'; rev: number; t0: number; hop: number; values: Float32Array } // hops × bands × 2
export type WorkletIn = { kind: 'config'; rev: number; drums: Record<Drum, Band>; bands: BandSpec[] } // rev: a batch maps to the band list it was made with
// audio/features.ts: B's input side
export function createFeatures(): Features & { push(m: Extract<WorkletMsg, { kind: 'feat' }>): void; at(t: number): void } // t = heard time: file → audioNow, line-in → newest
```

**Latency and batching:**
- Hits: no added latency (C2).
- Sustained, derived from research §5's IIR numbers: biquad and resonator rise ≈2–21 ms (sub, f0 42 Hz, Q 1.4 → τ ≈ 10 ms per stage), `e2` attack ≈20 ms, a batch wait ≤ 10.7 ms and rAF ≤ 16.7 ms. That is ≈ **30–70 ms**, under the ≤ 85 ms bound.
- Wobble: ≈20–45 ms.
- **Batching:**
  - `feat` every 2 hops is 93.75 messages/s with ≤ 44 floats each. Hits go out immediately (~10/s), and `odf` is unchanged (23.4/s).
  - Why 2 hops: 4 hops (21.3 ms) is longer than a 60 Hz frame, so line-in values would repeat on some frames; 8 hops would use up the lag budget.
  - Research analysis §2 warns about per-*quantum* messaging (375/s), not this rate. Batch every 4 hops if the profiler shows the message cost.
  - A SharedArrayBuffer is not used: it needs COOP/COEP headers, and none are set today.
- **T1 timing:** frames carry hop timestamps.
  - A file shows the newest frame ≤ `audioNow`, as its onsets do.
  - Line-in shows the newest frame. Its stamps run ahead of `audioNow` by the output latency (plan_pilot S2.3), so `≤ audioNow` would add ≈43 ms.
- **Config:** a preset or custom-band change sends `{ rev, … }`. The bank swaps coefficients and keeps follower state per id, so the change is smooth. In-flight batches with the old `rev` are mapped with the old band list.

**Acceptance:**
- §4.1–§4.7 are met as in C10, and §2.1's sustained ≤ 85 ms is met with margin.
- The §4.1, §4.2, §4.5 and §4.6 fixtures run through `analysis.ts`, the exact code the worklet executes. That makes the closest thing to the platform test plan_pilot S2.2 ran ad hoc in the scratchpad a permanent part of Vitest.

**Roadmap:** the same as A. In addition:
- Each band already computes a transient gate. A later "custom hit band" (a user band that emits events) is therefore a small step. It is not built now.
- An Electron build would run the same worklet.

**Risks:**
- More audio-thread code. A worklet error only reaches `onprocessorerror`, mitigated because the whole body is pure and tested in Vitest.
- Chrome's audio-thread cost is unmeasured ⚠️: research §8 measured Node V8, 0.15–0.34% of a core for 8–16 bands. Check `AudioContext.playbackStats.underrunEvents` (research §8) on the first step.
- IIR skirts are softer than FFT bins: about 12 dB/octave, against 5.86 Hz bins. A 50 vs 120 Hz test still separates them by ≈ −28 dB (derived from the RBJ band-pass response with Q 2.45, two stages).
- The `WorkletMsg`/`WorkletIn` contract grows.
- Moving `process()` into `analysis.ts` touches the onset/ODF path that tempo depends on. The existing tempo, sync and bench tests guard it.

**Effort:** M (≈ 15–16 steps; ~2 more than A).

---

## Considered and rejected
- **Hits on the main thread, as rAF flux on the 1024 analyser:**
  - analyser data has no timestamp, and reads are quantised to 16.7 ms (research analysis §2);
  - it can't follow T1;
  - it halves in mode 30;
  - the worklet already computes the FFT.
- **HPSS-lite, an 8192 FFT plus a past-only harmonic median (research §3):**
  - the median adds no look-ahead, but it passes a change only once half its length holds the new value: ≈ (l/2)·hop;
  - with l = 9 at hop 1024, plus the 85 ms window centre, that is ≈ 180 ms, over the ≤ 85 ms budget (derived).
- **ML stems:** a non-goal (spec §3; research §4: ≥ 7.8 s lag).
- **A SharedArrayBuffer ring:** COOP/COEP on every asset (research analysis §2) to save ≤ 100 messages/s.
- **Rewriting docs for the remap:** see C5.

## Comparison
| | A: analysers | B: worklet DSP |
|---|---|---|
| Hit latency | No added latency (same path) | No added latency (same path) |
| Sustained lag, line-in | ≈85–102 ms (at or over the bound) | ≈30–70 ms |
| Frame-rate independence | No (mode 30 halves sampling) | Yes (hop rate, 187.5/s) |
| Kick vs reese/sub split | 200 ms hold per kick hit (steppy with four-on-the-floor) | Differential envelopes per band (research §2), ≈60 ms hold |
| 40 vs 60 Hz precision | Sharp (5.86 Hz bins) | ≈12 dB/oct skirts (50 vs 120 Hz ≈ −28 dB) |
| Wobble at 11.6 Hz | OK at 60 fps, poor at 30 | Clean at any fps |
| Worklet change | Drums + config | Drums + bank + feat + config; body moved into pure `analysis.ts` |
| Main-thread cost | 8192 FFT per frame (0.1–0.35 ms ⚠️) | ≈0 |
| Audio-thread cost | +3 detectors on the existing FFT | + ≤ 11-band bank ≈ 0.25% of a core ⚠️ (Node figure) |
| Messages/s | +≈10 | +≈104 (feat 94 + hits) |
| Test fidelity | Through an analyser simulation | Through the exact worklet code |
| New deps | None | None |
| Effort | M (smaller) | M (+~2 steps) |

## Recommendation
**Variant B.** The spec's own two-speed contract is a ≤ ~85 ms extra lag for sustained sources, and A meets it only at the edge on line-in, which is the user's rig (rekordbox → USB card). A's quality also drops in the user-selectable 30 fps mode. B keeps sub, reese and wobble well inside the budget at any frame rate. It separates the kick from the reese with the documented differential-envelope primitive instead of a 200 ms freeze. It also makes the worklet body a pure module, so every acceptance fixture runs through the code that ships. The cost is about two extra plan steps and a larger worklet message contract; there are no new dependencies and the render cost doesn't change. Everything else (classifier, remap overlay, build/drop, heat, settings, the Sources tab) is shared, so choosing B doesn't change the user-facing design.

## Research gaps
1. **Chrome audio-thread cost** of an ≤ 11-band IIR bank plus 3 extra detectors. Research §8 is a Node V8 figure (⚠️ in the research itself). Applies to B. Measured at the first step through `playbackStats`, not guessed.
2. **Main-thread cost of reading an 8192 `AnalyserNode` every frame in Chrome.** Applies to A only. Unmeasured.
3. **Our tempo source on DnB two-step and dubstep half-time patterns:** the ⅔ and ½ peaks are derived from plan_pilot S5.1's prior note, not measured. The §4.2 fixture will show them.
4. **Build/drop detection:** no research artifact covers causal EDM structure or drop detection, so the C6 heuristic is ours. A researcher pass on published causal drop/section detectors would firm up the knobs.
5. **Genre classification from tempo and spectral features** (published feature sets and accuracies for DnB/dubstep/techno): not covered. The C4 rules are hand-tuned on synthetic fixtures.
6. **Photosensitive flash/strobe limits** (relevant to the heat strobe and the drop flash): not covered. C6's caps are a conservative ⚠️ assumption.
7. **Labelled real test tracks** (the user's own, with known BPM, drop times and genre): none are in the repo. The manual acceptance relies on the user's library.
8. **Per-drum band-flux accuracy on real full mixes:** research §1's numbers are drum-only or ML. A synthetic F1 says nothing about real tracks.

## Decision needed
1. **Variant A or Variant B?** Recommended: B. The question is where the sustained detectors (sub, reese, wobble, custom bands) run: on the main thread from a second 8192 analyser (A), or in the worklet as an IIR bank with differential envelopes (B).

Everything else is a `(default)` that the user can veto without answering:
- §4.1 hits: F1 ≥ 0.70 per drum at ±30 ms on the synthetic DnB mix.
- Remap maps as in C3. Built-ins only, including an edited built-in. A built-in saved with Save as reverts to its own bindings.
- The drop cut waits for the bass or the kick pattern to return (≤ 150 ms after the drop's first kick), at confidence ≥ 0.6. An open panel blocks the cut, as LOCK does.
- Heat: +25% brightness, +50% clock, a strobe of ≤ 0.15 amplitude at ≤ 1/8 notes, and a drop flash of 0.8.
- Classifier: dwell 16 s, min-hold 32 s, margin 0.15.
- Settings in localStorage `vjw.audio`; ≤ 8 custom bands.

## Ruling: kick vs sustained/modulated bass (2026-11-05)
**Inputs:** lead brief 2026-11-05 (TD S4.1 trace: `kick` p50 .66 on `dubstep140-arr` and through `dnb174-arr`'s build); C2 (L90–97) and C10 (L315–353) above; `research_audio_features.md` TL;DR, §1–§3; code read 2026-11-05: `web/src/audio/{drums,onset,analysis,bands,features,synth,arrange}.ts`, `drums.test.ts`, `bands.test.ts`, `acceptance.test.ts`, `web/scripts/make-fx.mjs` L44–54.

**Root cause (code + derived).** At 48 kHz, 40–150 Hz is **bin 1 alone** of the 512-point FFT (`drums.ts` L9–14), and the kick's ODF is that one bin's log flux.
- **Full-range bass:** its 55 and 110 Hz partials both sit in bin 1 and beat at 55 Hz, so the bin swings ≈2–3× from hop to hop. `synth.ts` L96–97 already names this for the reese. It is not the LFO: `wobble()` is a full-range 55 Hz saw at amp 0.5, and its sweep only sets the swing depth, which is why the storm pulses with it.
- **Empty band:** the log flux is level-independent (`drums.ts` L13), so in a breakdown, room tone, the riser's leak and the snare's 190 Hz body read as full flux. `arrange.ts` L3–4 already logs "~13 kicks a bar".
- The detector then fires at its 50 ms `minGap` (`onset.ts` L14), and `e^(−age/0.12)` (`features.ts` L14) holds `kick` at .66–1.
- The fixtures hid this. `pattern()` high-passes the reese at 300 Hz (`synth.ts` L96–98), so the bed test passes and the DnB groove looks clean. Even so, kick F1 is only 0.79 / 0.80 / 0.89 (`drums.test.ts` L54, L62).

**Decision: (d) a kick is a transient in the kick band's existing IIR gate that also carries the hop's power.**
1. **Trigger:** `tempo.ratio(0) ≥ TRANSIENT` (1.5). This is `bands.ts`'s differential-envelope gate (research §2) on 40–150 Hz, which `analysis.ts` already runs every quantum for the tempo ODF (L15–17, L86); the band is every preset's kick band (C3). It works on samples with a 200 ms peak-hold, so partials beating in-band read as one steady level (`bands.ts` L11–13): sustained material ≤ 1.30, a kick ≥ 1.65 (L88). A full-range reese and a 4.67/11.6 Hz wobble never trip it on their own bands (`bands.test.ts` L105–137).
2. **Confirm:** at that hop the kick bins hold ≥ `SHARE` of the hop's power. `drums.ts` computes it as Σ mag², with DC excluded so a line-in offset can't fake it. `SHARE` is a knob, start 0.2. Derived: fixture kicks ≈ 0.4–0.9; the riser, room tone and the snare's body ≲ 0.06. Those three do trip the ratio in an empty band, which is why the share check is needed.
3. **Post** at the first hop where both hold, keeping `minGap` 50 ms; `strength = min(4, ratio)`. Delete the kick's bin-1 `createDetector`. Snare and hats are unchanged.
4. **Crosstalk:** today's rule stays (a snare in a kick's hop is dropped unless it is at least as strong), with `ratio` as the kick's side. The band-passed body may trip a hop after the 3 kHz click. If the crosstalk matrix (`drums.test.ts` L69) shows that, widen the rule to ±1 hop: a snare then waits one hop (+5.3 ms).

**Rejected:**
- **(a) wide-band flux / sharpness:** all three false sources are wide-band flux (the wobble's 150 Hz–1.5 kHz sweep, the riser, the roll), and the bin-1 beating stays.
- **(b) ⅛-note IOI + beat grid:** the wobble is tempo-synced at ⅛, so one false kick per LFO cycle passes by construction. It also cuts real 16th and ghost kicks and ties hits to tempo lock.
- **(c) suppress while `reese`/`wobble`/`wobbleDepth` move:** these sources are main-thread, per-frame and themselves kick-gated (`features.ts` L62–67), so the logic is circular. The 1 s `wobbleDepth` lags, and the rule is blind in the build, which has no bass. Its "clears the bass envelope by a margin" half *is* (d)'s ratio.
- **HPSS / a 2048 kick FFT:** the harmonic median needs 43–80 ms of look-ahead (research §3); on the 512 FFT, HPSS would call the beating percussive. A 2048 FFT splits the partials at the cost of ≈21 ms more lag, and it still fires on an empty band.

**What it does:**
- **DnB groove:** every kick trips the gate. `features.ts` L62–63 already relies on the same gate (on the reese band) to catch "every kick, the FFT detector's misses too". The groove stays clean, and F1 should hold or rise from 0.79.
- **Dubstep wobble:** the sweep moves the in-band level ≈ +25 % over ≈ 40 ms, a ratio of ≈ 1.1–1.2 (derived ⚠️; test 5 pins it). That gives 0 kicks between real kicks, and `kick` idles at 0. S1.10's "classifier reads `dubstep140-arr` as techno" likely has the same cause (kicks per beat inflated): check it in the same run, but don't tune for it.
- **Riser + snare roll:** the share is ≪ `SHARE`, so 0 kicks. The roll still drives `snare`.

**Cost:**
- Worklet CPU ≈ 0. The ratio is already computed; the share adds 256 multiply-adds per 5.33 ms hop, and one log1p bin goes away. That is less than one band chain (research TL;DR: 16 chains ≈ 9 µs per quantum).
- Latency: kicks may land up to 1 hop later than today, from the band-pass rise and because the share needs the body inside the window. That is still within ±30 ms and one frame. This supersedes C2's "Nothing is added" (L97).

**Ceilings (⚠️ real tracks, queue #4):**
- An equal 16th double kick at ≳ 150 BPM: the 2nd kick reads ≈ 1.39, because `gf` holds for 200 ms (derived). Knob: the kick band's gate release.
- A square-LFO wobble whose filter closes below its fundamental can jump > 1.5× in band. Knob: a kick-only threshold.
- A loud 40–150 Hz bass stab reads as a kick. A kick that is no louder in band than the bass under it can be missed, as today.

**Acceptance (Vitest, through `createAnalysis(SR).block()` in 128-frame quanta; `hitsOf` in `drums.test.ts` and `acceptance.test.ts` moves onto it):** both arr fixtures are built the way `make-fx.mjs` L46–54 builds them: `arrangement({ genre })`, plus the gated `wobble()` for Dubstep, peak-scaled.
- (1) Groove and drop: kick hits per bar, averaged over each section, = truth ±10 % (DnB 2, Dubstep 1); F1 ≥ 0.70 at ±30 ms (log the value).
- (2) Breakdown (truth 0): ≤ 1 kick in its 8 bars, and 0 in the 4 roll bars.
- (3) Storms: no two kicks closer than an ⅛ note, anywhere.
- (4) `createFeatures` `kick` sampled at 60 Hz: p50 ≤ 0.1 over the Dubstep groove and drop and over the DnB breakdown (today .66).
- (5) 4 s beds give 0 kicks: a full-range `reese(n, 0.15)` (no `hp`) + `sub` + room tone; `wobble()` at 4.67 and 11.6 Hz + `sub` + room tone.
- Regression: §4.1 F1, the crosstalk matrix, §4.3 and §4.5 (5/5) stay green.
- Mutants (C10): the kick threshold, `SHARE` and `minGap` each fail ≥ 1 test when broken alone.

**Size: M**, one `frontend-coder` step: `drums.ts` (the kick path; C9's `detect` gains `kickRatio`), `analysis.ts` (passes `tempo.ratio(0)`), both test harnesses plus the tests above, and comment fixes at `drums.ts` L13 and `arrange.ts` L3–4. `WorkletMsg` and `Hit` are unchanged.

## Ruling: snare vs wobble / modulated bass harmonics (2026-11-05)
**Inputs:** lead brief 2026-11-05, after the kick fix: snare F1 .09 on `dubstep140-arr`; the 4.67 / 11.6 Hz wobble beds fire 12 / 17 snares in 4 s; snare-bound flashes every ≈ 0.42 s in the app. Also the kick ruling above; `research_audio_features.md` §1 (L18: spectral shape per band; L23: Meyda flatness/slope); code read 2026-11-05: `web/src/audio/{drums,onset,bands,analysis,synth}.ts`, `drums.test.ts` L1–129, `bands.test.ts` L40–52 and L131–137, `acceptance.test.ts` L134–194.

**Root cause (code + derived).** The snare's ODF is the log flux over 43 bins (1–5 kHz, `drums.ts` L12–14), and it is level-independent above ≈ 1e-3 (`onset.ts` L15–17).
- `wobble()` is a naive 55 Hz saw through two one-poles swept 150 Hz–1.5 kHz (`synth.ts` L183–196). Its 18.2 ms period is longer than the 10.7 ms window, so each saw edge enters the window as a broadband click, about every 3.4 hops.
- Once the filter is open (fc ≳ 1 kHz), a click lifts the bins ≈ 1–4.5 log units over the −51 dBFS room floor: ≈ 100 summed, over the floor of 80. Spikes fire on the opening flank, while the 16-hop mean is still low.
- In linear power the spike sits ≈ 8 dB under a snare across the band, but ≈ 23 dB under it above 3 kHz. The wobble falls ≈ 18 dB/oct there (6 from the saw, 12 from the filter); the snare is flat noise.
- The fixture puts that flank 36–65 ms before every ⅛ note (4.67 Hz is an ⅛ at 140, and `T0` = 1 s), so before every snare. A false snare posted 36–50 ms early arms the 50 ms `minGap` (`onset.ts` L49) and swallows the real one. F1 .09 is false hits plus lost hits.

**Decision: keep the flux trigger; count the snare's flux only on hops whose band power leans high.** This is the kick's pattern (a trigger, confirmed by where the hop's power sits), but the IIR gate is not the trigger (see Rejected).
1. **Tilt (`drums.ts`):** per hop, `up` = Σ mag² over the snare bins above the band's midpoint ((lo + hi)/2: 3 kHz at the default), and `band` = Σ over all its bins. Both are summed in the loop that already squares every bin for `SHARE`. Then `ok = up ≥ TILT · band`, with `TILT` a knob starting at 0.1. Derived: the fixture snare ≈ .44 (1–6 kHz noise, `synth.ts` L28–35, L52–53), and ≥ .3 at −12 dB over the arr's wobble. A wobble spike reads ≈ .01–.02 (fc 1–1.5 kHz) and room tone ≈ .5. A hat in the hop can't rescue a spike: it is ≈ −27 dB at 5 kHz (`synth.ts` L56–57).
2. **Veto in the ODF (`onset.ts`):** `detect(mag, t, ok = true)`. When `ok` is false, the hop's ODF is 0, and its log magnitudes still become the next hop's reference. A vetoed spike then arms no `minGap`, wins no 3-hop peak window and doesn't lift the 16-hop mean; each of the three would cost an arr snare. The full-band onset detector (`analysis.ts` L83) and hats pass nothing, so they are unchanged.
3. The kick path and the kick/snare crosstalk rule (`drums.ts` L58–62) are unchanged.

**Rejected:**
- **Gate trigger `tempo.ratio(1) ≥ TRANSIENT`.** The 1–5 kHz gate already runs in the tempo bank (`analysis.ts` L17), so no band would be added. But the sweep is a real level transient there: ≈ 25 dB over room tone, against ≈ 9 dB in the 150–1500 Hz band `bands.test.ts` L131 covers. Each click steps `gf` up by as much as ≈ 2× on the rise, so the 4.67 Hz bed reads ≈ 1.3–1.8 (derived). A slower or square LFO clears 1.5. The DnB roll's 86 ms 16ths read ≈ 1.4 (the kick ruling's 16th ceiling).
- **Snare-band share of the hop (`SHARE`'s twin):** the bass under the snare sets it. On the arr it is ≈ .02–.09 at a snare's hop vs ≈ .015 for a spike (derived): no margin. The tilt ignores the bass.
- **Flatness/crest over 1–8 kHz:** a hat in the hop lifts the 7–8 kHz end. Over 1–5 kHz it separates like the tilt, but it costs 43 logs a hop, swings with Rayleigh noise at a single hop, and penalises resonant snares.
- **5–10 kHz share:** hats own 7–16 kHz, and the fixture snare is −18 to −38 dB at 7–10 kHz (8-pole LP at 6 kHz).
- **Higher `FLOORS.snare`:** spikes (≈ 100) overlap a snare's flux over the open wobble (≈ 120, derived), so ghost notes die first.
- **2048 snare FFT / HPSS:** a 2048 window spans the saw's period and kills the flicker, but it costs a second FFT and ≈ 21 ms of lag. HPSS has the kick ruling's look-ahead cost, and on the 512 FFT the saw's edges are vertical, i.e. percussive.
- **Mute while `wobble`/`wobbleDepth` move:** the kick ruling's (c). It is circular and laggy, and it mutes real snares in the drop.

**What it does:**
- **DnB, Techno and Dubstep patterns, and both rolls:** unchanged (.97 / .83 / 1.00). The snare and clap are the same burst, and hats, kick clicks and the riser only raise the tilt.
- **Dubstep arr groove and drop:** the spikes' ODF goes to 0 and snares post on the backbeat. F1 goes from .09 to ≥ .8 (⚠️ derived; test 1 pins it).
- **Wobble beds:** 12 / 17 → 0. In the app, tunnel-mesh and spiral-mesh flash on the snare instead of every 0.42 s.

**Cost:** no new multiply. The snare's bins add 2 conditional adds a hop (< 0.1 µs). It is the same hop, so latency doesn't change. No FFT, bank band or message is added, and `Hit`, `WorkletMsg` and `analysis.ts` are unchanged.

**Ceilings (⚠️ real tracks, queue #4):**
- **Dull claps:** an 808-style clap that sits ≲ 2 kHz (≥ 9 dB/oct above it) reads ≈ .03–.07 and is missed. Knobs: `TILT`, or a lower snare band per preset.
- **Bright growls:** a distorted growl that falls ≤ 6 dB/oct across the band reads ≳ .17 and passes. One hop's shape can't tell it from a clap. The next lever is decay (a snare dies in ≈ 100 ms), which costs look-ahead.
- **Background:** a 3–5 kHz bed (vocals, cymbals) at ≥ 10 % of a growl's 1–3 kHz power lifts the growl over `TILT`.

**Acceptance (Vitest, through `createAnalysis(SR).block()` and the existing `hitsOf`):**
- (1) Both arr fixtures (`arr()`, `acceptance.test.ts` L136): snare F1 ≥ .8 at ±30 ms, inside the §4.1 arr test. Log the value.
- (2) `pattern()` DnB, Dubstep and Techno: snare F1 ≥ .8 (`drums.test.ts` L45–60).
- (3) The bed rows (`drums.test.ts` L75–84) also give `snare` = [] (today: 12 and 17 on the two wobbles).
- (4) Spectrum level (`frame`/`fire`): after quiet hops, a steep hop (bins 11–31 high, 32–53 near 0) gives no snare, and the same hop flat gives one. A vetoed steep hop 2 hops before a weaker flat one doesn't block it.
- **Regression:** the kick arr test, the crosstalk matrix, §4.1, §4.3 and §4.5 stay green.
- **Mutants:** `TILT` at 0 or 0.6, and the veto moved from the ODF to the post, each fail ≥ 1 test.

**Size: S**, one `frontend-coder` step: `onset.ts` (one param, one line), `drums.ts` (`TILT`, two sums, `ok` to the snare's detector, header comment), `drums.test.ts`, `acceptance.test.ts`.

**Lead amendment (2026-11-05, measured by the snare coder):** the ruling as written reached Dubstep arr snare F1 .71 (target ≥ .8). Two causes, each with a measured fix, both adopted:
- **E1:** kick↔snare crosstalk checks ±1 hop (the kick ruling item 4, now evidenced: the kick's 3 kHz click posts a snare one hop before the kick fires under the wobble) → .83.
- **E2:** a vetoed hop does not become the flux reference, so the real snare right after a saw-edge spike is not masked → .84.
- E1 + E2 → 1.00 in the probe. Wobble beds stay 0; patterns and kick unchanged.

## Ruling: real-track tuning (2026-11-05)
**Inputs:** `agents/research/_adhoc/real_tracks_2026-11-05.md` (all); `scratchpad/real/probe.log` (floor sweeps) and `ref.log`; the kick ruling (L612–656) and the snare ruling + amendment (L658–706) above; `plan_audio_reactivity.md` L150; code read 2026-11-05: `web/src/audio/{drums,onset,bands,analysis,arrange,presets,style,tempo,settings}.ts`, `app.ts` L180–294.

**Code facts the items rest on:**
- `sens` is a main-thread envelope gain (`features.ts` L26, L110), never sent to the worklet; `FLOORS` is a `drums.ts` constant.
- **Under Auto the worklet never learns the genre:** `sendConfig` sends `workletBands(settings.get(), null)` (`app.ts` L186), plan L150's placeholder ("no detected genre until S4.3"), never swapped. Dubstep's reese band (70–350) has never applied under Auto either.
- The crosstalk weighs a snare in units of `FLOORS.snare` (`drums.ts` L79): halving the floor doubles every snare's weight against the kick.
- `TRANSIENT` (`bands.ts` L14, L76) also gates every band's `held`, i.e. the bass sources and arrange `low`.
- The classifier's `floor` .35 sits above S on masters (S ≤ T ≈ .2–.4; Kanine dnb ≤ .27): it can't decide there, whatever the pattern.

**(a) Detector floors per genre: a preset field.** `Preset.floors?: { snare: number; hats: number }`; only Dubstep sets it (80/100, today's). `drums.ts` `FLOORS` (= Default, undecided, DnB, Techno) → **40/50**.
- Plumbing: the worklet config gains `floors`; `workletBands` returns the active preset's and `bandKey` includes them; `sendConfig` follows the frame's `active` and runs when it changes (this closes the S4.3 leftover: Dubstep's reese band then applies under Auto, as C4 intended); `analysis.configure` sets floors in place (drum Hz are equal across presets, so there is no restart), so the detector's `floor` gets a setter.
- The crosstalk keeps its tuned units as constants (snare odf / 80, kick ratio / 1.5), not the live floor.
- Undecided = 40/50: DnB decides late or never (24–133 s; Kanine never), and Rumble decides dubstep at 24 s. Ceiling: a dubstep track over-fires until it is classified (Rumble ≈ 7/bar for 24 s; the WCAG cap still holds flashes to 3/s). ⚠️ Techno shares 40/50, with no real techno track measured.
- Fixture tests run at the floors their genre gets once classified (Dubstep `pattern`/`arr` via a config at 80/100). If a DnB fixture F1 dips under its bar at 40, widen the crosstalk to ±2 hops (E1's knob) before touching the floor.
- Rejected:
  - `sens` as a floor scale: it is a main-thread envelope gain and never re-sent, so one field would mean two things.
  - A global 40: Rumble fires 7.3/bar.
  - An undecided 60: there is no sweep point for it, and it is worse for both genres.
  - A level-relative floor: the adaptive term (16-hop mean × 1.5) already runs, and Rumble's higher mean (p50 26 vs 17–19) doesn't hold it back.
  - A floor in the Sources panel: YAGNI.

**(b) Drop path.** `sparse` **.5** (Kanine's 77–88 s break then reads under it for ≈ 9 s), `refractory` **20 s** (drops 23.1 and 27.4 s apart), `GRACE` **8 s** (⚠️ Rumble 48.4, from the profile, not traced). `arm` 6 s and `warmup` 20 s are unchanged.
- **Bass-less intro: a rule.** Until the first drop or the first sparse frame, the music so far is test (a)'s breakdown.
  - `dur`/`sum` accumulate, and `dur ≥ arm` arms (a) only. It does not set `armed`, so (b), the kick-only test, stays off for a teaser kick.
  - It changes neither `out.sparse` (the classifier keeps judging) nor `build`. A track that opens on its groove never fires, because (a) needs `low ≥ ret` (4) × that mean.
  - Ceiling: a full-level bass tease with a kick fires early, and its refractory can swallow the real drop.
- **Short bass cut (Andy C: 1.4 s, drums running): defer.** On `low` alone it looks like an in-groove fill. A weak drop still moves the drop-bound reset/spawn/explode by its conf, and it eats the refractory.
  - Named knob: `CUT` (`low < CUT·G` for ≥ 1 bar arms (a)).
  - Research gap: trace Andy C's 3 cuts and its fills with `arr.mjs`. Is there a riser before? How deep is the cut?
- Rejected: `arm` ≈ 1 s (fills fire and eat the refractory); a G reset at the first drop (Kanine's .35–.39 was already measured against today's intro-diluted G).

**(c) Kick: a kick-only threshold.** `KICK` **1.35** in `drums.ts`, on the trigger only. `TRANSIENT` 1.5 stays for `held` and as the crosstalk unit. It also covers the kick ruling's 16th double-kick ceiling (the 2nd kick reads ≈ 1.39).
- **Bass stabs: no new guard; precision is an acceptance bar.**
  - `SHARE` can't separate them: a stab's power sits in the kick's own bin (bin 1 alone at 44.1 kHz).
  - A decay check costs ≥ 50 ms of look-ahead, against the ±30 ms bar.
  - Lever if precision falls: `CLICK`. A hop at 1.35–1.5 then also needs `tempo.ratio(1)` (1–5 kHz, already computed) ≥ ≈ 1.2 ⚠️ in this hop or the previous one.
- Rejected: a global `TRANSIENT` 1.35 (it moves `held`, i.e. the bass sources and the arrangement); raising `SHARE`; a decay check.

**(d) Tempo: `PRIOR_BPM` 150** (σ 1 octave; the fold is unchanged).
- Weights: 174 .977 vs 116 .934 (today .907 vs .990); 140 .995.
- ⚠️ Techno's 4/3 (170.7) now weighs .983 against 128's .974, so only the ACF holds 128 (it is weak at ¾ beat in a straight 4/4). This is checked on the fixture only.
- Accepted: the late lock in beat-light intros, and Andy C's and Rumble's 1–3 % fit drift (not the prior's job).
- **Families: no ⅔/½ fold.** DnB's ⅔ window (≈ 97–136) would hold a 128 techno track too, so T could no longer tell them apart. The pattern features do that (kicks/beat .5 vs 1), and S1–S2 repair their inputs.
- If the classifier is still late, never decides, or flips after S1–S4, the next ruling is the classifier scale (`floor`/`margin` relative to max T) plus a 3:2 check in `families`. Input to that ruling: techno's ½ window holds DnB's 2.5-beat kick interval (69.6) and Rumble's half-time (70).
- Rejected: harmonic-sum salience (the reference's Σ₈). It is robust, but it is size M and needs a longer window and more CPU. Revisit if 150 leaves ⅔ runs.

**(e) Rumble's growls: defer.** Dubstep keeps 80/100, so Rumble stays at today's 2.4/bar, with no regression.
- Named knob: a Dubstep `floors.tilt` (a per-preset `TILT`).
- Research gap: run `probe.py`'s veto replica on Rumble's off-backbeat snare hops against its backbeat tilt (p10/p50 .06/.33).
- Rejected now: a higher floor (backbeat odf p90 is 93); a Dubstep `minGap` (it cuts build rolls); a decay check (look-ahead).

**(f) Steps, in order** (one `frontend-coder` step each).
- Every step keeps all Vitest fixtures green and adds fixture tests and mutants for its own rule. Real tracks stay out of git.
- The lead keeps today's `scratchpad/real/*.json` as the baseline. After each step it runs `run-all.sh` + `an.py` and compares with the audit table.
- **S1 (M) floors per preset:** `drums.ts`, `onset.ts` (floor setter), `analysis.ts`, `onset.worklet.ts` (`WorkletIn`), `presets.ts`, `settings.ts` + test, `app.ts`.
  - Tests: a floors-only config restarts no drum; Default sends 40/50, Dubstep 80/100.
  - Harness, DnB (drop + body), every track: snare ≥ .8/bar, hats ≥ 3/bar, on-grid ≥ .93 (probe .94–1.00); more app snares in the 4 bars before each drop.
  - Harness, Rumble: still dubstep by ≈ 30 s; after that, snare/hats within ±10 % of 2.4/8.3, bass-class n p50 within ±.05, drops ≥ 1/4.
- **S2 (S) `KICK` 1.35:** `drums.ts` + tests.
  - Tests: the reese/wobble beds stay at 0 kicks and the storm/⅛-IOI checks hold; a hop at ratio 1.4 with its share posts, and one at 1.30 doesn't.
  - Harness: DnB kicks/bar up ≥ 40 % on every track, with on-grid (±.3 16th) no more than .05 under the baseline (Bicep .17, Kanine .4); Rumble has no kick gap under an ⅛ note.
- **S3 (S) `PRIOR_BPM` 150:** `tempo.ts`, plus the `presets.ts` comment.
  - Tests: all tempo and §4.2–§4.3 fixtures stay green, techno at 128 (no 4/3).
  - Harness: Kanine's ⅔ share ≤ 5 % (was 27 %); no new 4/3 or ⅔ run ≥ 2 s on any track; Rumble at 140.
- **S4 (S) arrangement:** `arrange.ts` (3 knobs + the intro rule) + tests.
  - Tests: §4.5 5/5 on both arr fixtures. On `ArrangeIn` sequences, a bass-less 30 s intro with kicks and a teaser kick, then the groove, fires once at conf ≥ .6, and a groove from the start fires 0 in 60 s.
  - Harness: every fire lands within −0.5…+4 s of an audit drop; DnB ≥ 4/11, Kanine 88.4 among them; the intro rule fires on every track whose intro `low` is ≥ 12 dB under its first drop (`prof.py`); Rumble keeps 75.8 (48.4 and 21.0 logged).
- Then the lead re-runs the full audit (classifier, zoom/burst) and rules on the (d) classifier lever and the (b)/(e) gaps.

## Ruling: tempo ⅔ on real DnB (2026-11-05)
**Inputs:** `scratchpad/real/t3-rejected/` (`t3-acf-probe.txt`, `t3-tempo.txt`, `acf-probe.test.ts`); the audit (`agents/research/_adhoc/real_tracks_2026-11-05.md` TL;DR, Method, items 4–6); the tuning ruling (d) above (L747–753); code read 2026-11-05: `web/src/audio/tempo.ts` (`update`, `near`, `fold`, `families`), `sync.ts` (`consider`), `analysis.ts` L15–17 and L88, `presets.ts` (`bpm`), `style.ts` (T_g), `tempo.test.ts` L174–202.

**Facts the ruling rests on:**
- The ODF is the kick band's gate excess plus the snare band's (`analysis.ts` L88). On the fixture the snares give the two-step its beat (`tempo.test.ts` L174–175). On masters the kicks dominate (derived from the 116 readings), and the two-step's kicks sit 1.5 and 2.5 beats apart (the audit's "3-and → 1").
- In the 116 windows (Kanine 52–82 and 96–114 s, Bicep 88 and 94–110 s), ACF(116) is 1.19–3.58× ACF(174) and ACF(87) is .26–1.23× ACF(116). No per-lag weight picks 174 there: even a prior centred on 174 tolerates only 1.19 (T3).
- The ACF span stops at 1.33 s (`hi` = 120/`minBpm`), so 174's bar (1.38 s) lies outside it. On masters the ACF mean is ≈ .25–.33 of the best peak (prominence ≈ 3–4; audit item 5: T ≈ .2–.4).
- The sync relocks after 8 beats of a confident other reading (`sync.ts` L96–100). `families` reads `acf`, never the pick.

**Decision: (b), the 3:2 check, decided by the bar.** In `update()`, after the pick and before the comb:
- `F = fold(1.5·bpm)`. If `(!range || near(F, range)) && bar(F) > EDGE·bar(bpm)`, the reading takes `F`.
  - `bar(b)` is the max ACF over lags `round(240/(b·hop)) ± 2`, summed on the fly from `x` (≤ 2.7 s, inside the 6 s window). `EDGE` 1.2 ⚠️ is a named knob, and the gate sets it.
  - `prominence` (the confidence's ACF factor) and `families` keep `best`. The comb and the fit run on `F`.
- **Why the bar:** a 4/4 bar repeats at 4 beats of the true tempo. 4 beats of its ⅔ reading make 1.5 bars, where only the half-bar content repeats (snares on 2 and 4, ⅛ hats), never the two-step's kicks. The heavier the kicks (so the worse the ⅔), the clearer the test.
  - For a true tempo B, the partner's bar falls at 2⅔ or 5⅓ beats of B, off the 16th grid, so B stays. 4/4 is assumed, which covers all three genres.
- It runs in one direction only, toward the faster partner, so it never moves 174 to 116. A 4/3 reading's partner is 2T, which folds back to T (a bonus, unmeasured).
- `PRIOR_BPM` stays **128**. T3's 150 is dropped: it gained nothing on Kanine and added an 18 s run on Bicep. No sync, style or preset change.
- **CPU:** 10 extra lags per update, ≈ 7k MACs against the span's ≈ 190k (+4 %). Window, span and update rate are unchanged.
- The same `bar` is the classifier ruling's 3:2 lever for `families`: a window's 116 evidence goes to 174 when the bar says so. It is not in this step.

**Expected per track (⚠️ the bar ACF on masters is unmeasured, hence the gate):**
- **Kanine, Bicep:** the 116 windows read 174, so the sync gets no ⅔ reading to relock on.
- **Sub Focus, Andy C:** 174's partner is 130.5, whose bar falls at 5⅓ beats, so nothing changes.
- **Rumble:** the partner 105's bar (5⅓ beats) holds a ⅔-beat triplet growl. 140's bar (4 beats) holds it too, plus the kick and snare, so 140 stays. After 24 s the dubstep range rules 105 out (`near`).
- **Techno fixture:** the partner 95.8's bar falls at 5⅓ beats, so there's no switch. The 4 goldens (L176–186) stay bit-exact, and so does every straight train.
- **Under a range,** `near` blocks any switch the range forbids. Techno's 116 never becomes 174, so Bicep after its techno flip (≥ 199 s) is unchanged and stays the classifier's.

**Rejected:**
- **(a) Harmonic sum:** 174 gains 87, but 116 gains its own 2P, which is 3 beats at 174 (kick→snare, unmeasured). Kanine 110–114 (116 at 2.5–3.6×, 87 ≤ 1.6×) stays 116 either way, and a triplet growl lights all three of 105's octave lags. CPU ≈ 0 with octaves only; Σ₈ needs lags out to 8P, so a 4× span and a longer window (M).
- **(b) As a ratio** `ACF(⅔L) ≥ θ·ACF(L)`: Kanine 114 needs θ ≤ .28, which is the masters' ACF mean, and a triplet growl passes it (Rumble 140 → 105). CPU 0.
- **(c) Drum IOIs:** the two-step's kick IOIs (1.5 and 2.5 beats) are the ⅔ evidence itself. Snare IOIs (2 beats) fit DnB and techno but are noise on Rumble (14–34 % on the backbeat). It would also need a second estimator plus fusion (M).
- **(d) Genre range:** already shipped (`near` drops 116 under DnB). Kanine never decides (dnb ≤ .27, under the .35 floor), and Bicep's techno range admits 116. This lever belongs to the classifier ruling.
- **(e) More relock beats:** Kanine's runs are 32 s and 18 s of confident 116 readings. Relock would need ≥ 62 beats, which delays every real mix change by ≥ 21 s. CPU 0.

**Fallback (e′), only if the gate fails:** `consider` ignores a reading at ⅔ or 4/3 of the grid (octave-normalised `p/period` within 1 % of .75): it neither merges nor competes. It is 2 lines and certain on this corpus (Kanine locks 174 at 4.4 s). Ceilings: the source stays wrong; a fresh lock on a two-step locks 116; and a mix change to within 1 % of 4/3 (128 → 169–172) never relocks.

**Step (S), one `frontend-coder` step:** `tempo.ts` (`bar`, the switch and `EDGE`; `bpm` becomes `let`) and `tempo.test.ts`.
- **Gate first** (scratchpad, no product code): run `acf-probe.test.ts` plus bar(F)/bar(B) on all five tracks. Go if bar(174) > EDGE·bar(116) in ≥ 90 % of the 116 windows, and the switch fires in ≤ 2 % of the windows already at ref. Set `EDGE` in the gap; if there is no gap, build (e′) instead and report.
- **Tests:** a two-step ODF train (kicks on 1 and the and-of-3, weak snares on 2 and 4, sized so master reads 116) reads 174 ± 1. Straight 116 stays 116, 140 with ⅔-beat triplet pulses stays 140, and the two-step under techno's range stays 116.
  - The goldens hold. Mutants: drop `near`; always switch.
- **Acceptance:** `run-all.sh` + `t3-tempo.py` against the T2 baseline, with ¾ and 3/2 added to the run classes, which is where a wrong switch lands.
  - Kanine ⅔ ≤ 5 %. No new off-ref run ≥ 2 s on any track (Bicep from 199 s is reported, not gated).
  - Rumble's ref share is ≥ T2 − .02. Lock and correct-lock are within +0.5 s of T2. The techno fixture holds 118–135.

## Ruling: drop detection v2 (2026-11-05)
**Inputs:** T4 evidence `scratchpad/real/t4/t4/t4-drops.md`; the captures `scratchpad/real/t4/cap/*.json` (`ain`); `replay/out.txt` (`nob`, minConf .5) and `replay/diag.txt` (Bicep); the audit `agents/research/_adhoc/real_tracks_2026-11-05.md` (drop times, Method); the tuning ruling (b) (L730–738) and the tempo ruling (L778–820) above. Code read 2026-11-05: `web/src/audio/arrange.ts` (all), `arrange.test.ts` L89–230, `bands.ts` (`held`), `features.ts` (`HOLD`), `presets.ts` (`floors`), `app.ts` L292–302.
**⚠️ Hand-traced, not replayed.** This agent has no shell, so `replay.sh` was not run. `ain` frames were read by time window (`t`, `low`, `total`, `kick`), and G and `slow` were estimated from 1 Hz `low` profiles (±20 %). Every fire below is a prediction, and each step's first gate is the replay.

**Trace facts:**
- `low` is an amplitude (held |y|), so `ret` 4 = +12 dB. The audit's own drop rule is +6 dB over 4 bars.
- Most real drops come out of a pre-drop cut that is quieter than their break: Andy C 44.41–47.11, 88.61–91.25 and 154.75–157.45 (≤ .07; returns at 47.16 / 91.31 / 157.50); Kanine 42.6–44.5 (.01–.13); Sub Focus 145.11–146.45 (≤ .055); Bicep 176.0–176.85 (≤ .08). The section `mean` never sees that level, hence problem 3's 2.4–3.4×.
- In-groove dips under .2 G last ≤ .85 s: Andy C 101.6 and 167.75; Sub Focus 54.0; Bicep 65.7, 87.7 and 109.8.
- Rumble's 91–108 s is a stutter: `low` swings .004 ↔ .69 every .3–.5 s. Its 108.12–109.85 cut returns at 110.0, which is not an audit drop. `total` doesn't separate that cut from the one before 117.0 (.01–.23 against .0005–.13).
- Bicep 176.5's miss under `nob`, traced cause (estimated): its cut re-enters sparse inside GRACE, and the reset zeroes `dur` and `peak`, so conf ≈ .5. Sub Focus 147.9 has the same shape: break → 3 s bass build → cut.

**(1) Path (b): delete it** (the code, `beats`, `up`/`upBeat`). All false fires came through (b), and no real drop did. `held` gates kicks out of `low`, so (b) only sees partial-bass returns such as Bicep 167.2. Effect: 167.2 goes away, and nothing real is lost (lead's `nob` replay).
- Ceiling: a kick-only techno drop never fires; the techno fixture (L95–102) flips to 0. Rejected: build evidence (167.2 rides a big riser, peak ≈ .9); a minimum breakdown (its break is 35 s).

**(3) `ret` stays 4; the reference becomes `min(mean, slow)`** in both the ret test and the conf ratio, so the return is measured against the quieter of the breakdown and the last second. `slow` updates before the test, so on a spike 4·`slow` climbs about .035 a frame. In effect this demands a ≥ ≈ 1.4 s dip, and no in-groove dip is that long.
- Effect: Kanine 44.3 ≈ 44.7 (+0.4, with 7a); Andy C 46.9 ≈ 47.3 (+0.4, with 7a); Bicep 176.5 ≈ 177.0 (+0.5, with 7b); Kanine 154.3 with (5).
- Still blocked (traced): Andy C 141.0's build bump (.76 against 4·min(.25, .45)); Bicep 167.2 (.27 against .56); Sub Focus's 52 s bass entry (.48 against .60); Bicep's 66.5/88.5/110.6 dip returns (.57 against ≥ .9); Andy C 132.67 (.71 after a .3 s dip, kick at 132.49), whose rise lasts ≈ .03 s.
- Rejected: `ret` 2.5–3 (admits Sub Focus's 52 s entry at 3.2× and Andy C 141.0 at 3.0×); a per-path `ret`.

**(7) Where a sparse run starts (found in the traces):**
- (a) The intro survives sparse runs shorter than `arm`, so it ends at the first drop or the first run ≥ `arm`. `build` reads the run's length (`run`), not `dur`, so the intro's visuals don't change. Today a pre-drop cut's first sparse frame resets the intro into a 1–2 s section that never arms (Kanine 44.3, Andy C 46.9).
- (b) A run that starts while still `armed` resets `dur`/`sum` but keeps `peak` (Bicep 176.5, Sub Focus 147.9). The short run doesn't refresh `armed`, so a missed drop's GRACE doesn't chain through groove dips.

**(5) `sparse` .6:** with the drift it acts as ≈ .52 G, the edge the tuning ruling intended. Kanine 154.3 arms (lead's trace) and fires ≈ 155.1 (+0.8). Rumble's stutter runs stay 1–2 s, so they don't arm.
- ⚠️ Kanine's break sits at .56–.6 G: if it flickers in the gate, use .65, not a hold. Rejected: freezing G under X·G (a DJ fader or gain move would pin G for the rest of the set); an asymmetric τ.

**(6) Debounce: defer.** A hold, or `JOIN`ing runs ≤ 2 s apart, merges Rumble's 90–115 s stutter runs (gaps ≲ 1 s) into an armed section, and its ≈ .6 stabs would then pass 4·min(mean, slow). Rumble is already at 2/4. Named knob: `JOIN`.

**(2) `CUT`, a deep cut that arms (a):** `low < CUT·G` (raw `low`, `CUT` .2) for ≥ `CUTMIN` 1.5 s, with music ≥ `warmup` and `x.cuts` on, sets `armed = now + GRACE` and `peak = 1`. The cut counts as a full build, so conf is ≥ .6 at `align` ≥ .25.
- Effect: Andy C 91.0 and 157.2 fire at ≈ 91.4 and 157.6 (+0.4). No other DnB run qualifies (the longest in-groove run is .85 s, a .65 s margin). On Rumble, 108.12–109.85 (1.73 s) would fire at ≈ 110.0, and its refractory would swallow 116.9.
- So **`ArrangeIn.cuts`** = `PRESETS[configured].cuts !== false` (app.ts, the previous frame's preset), with `Preset.cuts?: false` on Dubstep. Dubstep's bass stops are its groove, and Rumble reads as dubstep from 24 s.
- Ceilings: Dubstep's cut drops stay missed (Rumble 117.0); a DnB groove with ≥ 1.5 s deep stops would fire (none here); ⚠️ a techno 1-bar fill (1.875 s) passes. Rejected: "drums running" (`total`, see above); `CUTMIN` 1.2 (a 1-bar fill at 174 is 1.38 s); the cut on `slow` (1.6–2.2 s late); a return ≥ 1.5 G instead of the preset gate (Rumble 110 reads 1.1–1.5 G).

**(4) No-bass-dip drops: defer.** Sub Focus 44.1's `low` is flat at .12–.21 over 40–51 s (the bass enters at 52), and Bicep 66.2 is a .7 s cut (65.7–66.4), the same shape as the in-groove dips. Kicks are gated out of `held`, so a drums-only drop is invisible to arrange. Research gap: per-bar kick/snare density around both drops, against the grooves. Named lever: a density jump after a `build` peak (M).

**⚠️ Label: Sub Focus 147.9.** The bass is back at 146.51 (.41 ≈ .8 G, after the cut) and full at ≈ 151. v2 fires between 146.6 and ≈ 149, depending on the kick. Re-place the drop by ear before scoring a 146.6 fire as false, and don't tune `back` to the label.

**Combined A + B (hand-traced):**
| track | audit drops | v2 fire (lag) | false |
|---|---|---|---|
| Kanine | 44.3 · 88.4 · 154.3 | 44.7 (+.4) ⚠️ · 91.6 (+3.2; T3′ should bring it to ≈ 88.9) · 155.1 (+.8) | — |
| Sub Focus | 44.1 · 147.9 · 171.0 | — · 146.6–149 (label) · — (split cut, .85 + .45 s) | 146.6, if the label stands |
| Andy C | 46.9 · 91.0 · 157.2 | 47.3 · 91.4 · 157.6 (each +.4) | — |
| Rumble | 21.0 · 48.4 · 75.8 · 117.0 | 20.9 · — · 75.8 · — | — |
| Bicep | 66.2 · 176.5 | — · 177.0 (+.5) | — (167.2 gone) |

DnB **7/11** (6 if Kanine 44.3 misses, 8 if 147.9 is re-placed), Rumble 2/4, 0 false outside the label case, lag +0.4…+0.8 s (Kanine 88.4 is +3.2 s until T3′).

**Steps:** one `frontend-coder` step each, A then B. Each runs the replay on all five captures before merging (B maps `cuts` from `rows[].det`), keeps §4.5 at 5/5 on both arr fixtures, and adds tests and mutants for its rules.
- **A (S):** (1), (3), (5) and (7) in `arrange.ts`, plus `arrange.test.ts`. Tests: the (b) cases flip; a break at .3 G, then a 1.5 s cut at .02, then 1.0 G fires; a groove start with .8 s dips fires 0 in 60 s.
  - Gate: Kanine 88.4 + 154.3, Andy C 46.9 and Bicep 176.5 fire (Kanine 44.3 is reported); 0 false outside the label case; Rumble keeps 20.9 + 75.8 and fires nothing in 90–115 s; no fire at Andy C 132.7. Fallback: if Kanine flickers, `sparse` .65; if Rumble fires in 90–115 s, .55.
- **B (S):** `CUT` in `arrange.ts`, `ArrangeIn.cuts`, `presets.ts`, `app.ts` (one field), plus tests: a 2.7 s cut at .03 G mid-groove fires at ≥ .6; a 1.2 s cut, or `cuts: false`, fires 0. Gate: Andy C 91.0 + 157.2 fire, which makes DnB ≥ 6/11; 0 false; Rumble unchanged.
