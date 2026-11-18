# Epic spec — second audio analyser "like the donor's" + our gaps filled

## TL;DR
- The user (2026-11-18) asked for a second sound-recognition algorithm that works exactly like the donor's (`donor/visual_system_2/`), plus the pieces our own detector lacks.
- Part A: a selectable analyser mode "donor" next to ours. Per band (all, Bass, Mid, MidHigh, High), it gives Level, Hits, Presence and Time, plus the macros, beat sources and textures the donor exposes.
- Part B: our default detector gains what it lacks. Candidates: P4 kick accent, P6 band auto-window, and Hits-by-deviance strength (`dsp_formula_review_2026-11-17.md` §3, §5).
- This is Tier 3 and non-visual: S0 → S1 audio-dsp → S2 system-designer → architecture-skeptic → lead pick → test-architect → S4 plan → S5 build → S6. No creative-director, S3 or S7.

## Freshness
- 2026-11-18, lead intake. Inputs: `dsp_formula_review_2026-11-17.md` §1–§3, §5; `research_donor_visual_system_2.md` §4; `web/src/fx/syn.ts` (the `SYN` table, adapter step 3 is moving it onto our detector).

## User words
«добавим еще один алгоритм короче распознавание звука чисто будет как у них и в наш мы встроим то что нам не достает»

## Goal
1. **Donor mode (A).** It reproduces the donor's audio model (formula review §1) as one analyser that can be switched on:
   - per band: `Level` (smoothed, auto-normalised by a running mean/σ), `Hits` (deviance over a threshold, with decay), `Presence` (slow accumulator) and `Time` (∫ level dt);
   - macros: `Intensity`, `FadeInOut`, `CurvedTime`, `BassExpoCurve`, `PrimeBang` / `PrimeAndBang`;
   - beat: `OnBeat`, `BeatTime` (+1 per beat, stepped), `ToggleOnBeat`, `RandomOnBeat` (logistic ease), `BPM`, `BPMConfidence`, `BPMTwitcher`, `BPMSin*`, `BPMTri*`;
   - textures and meters: `Spectrum` rgba (raw / juiced / smooth / waveform), `LevelTrail` rgba, `InputLevel`;
   - the global knobs `Reactivity` and `AudioSpeed`.
2. **Where donor mode is used.** When it is on, syn scenes read donor values natively through the `SYN` table, with no mapping. Our own scenes can bind the donor values as extra sources.
3. **Our detector (B).** Embed the donor features that ours lacks. Our default behaviour and pins do not change unless a fix is measured better.

## Non-goals
- Our detector is not replaced: it stays the default.
- No MilkDrop level change (P3 was dropped, and the user likes MilkDrop as is).
- No donor binary or `script.js` is executed. Text and images only.
- Not exact constants: the donor bundle carries names only (formula review §1 "Not recovered"), so the constants are ours, tuned on our tracks.

## Acceptance (IDs)
- **R1** A mode switch (ours / donor) in the Sources tab. It is persisted, and switching it mid-track causes no false drop and no flash.
- **R2** Donor mode exposes every `syn_*` audio name the 87 donor scenes use (`research_donor_visual_system_2.md` §4 table) as a live value. The values are 0..1 where the donor's docs say 0..1, and `BeatTime` steps +1 per beat.
- **R3** Formula sanity on the same 3 tracks / 7 drops as the formula review (offline sim): Level rests near its mean; Hits fire on transients, with a hit count per minute reported against our kick; Presence rises over a section; Intensity is higher in a drop body than in a break on ≥ 6/7 drops.
- **R4** Cost: the donor analyser adds ≤ 0.5 ms main-thread p95 per frame. It runs only while donor mode is on or a donor source is bound.
- **R5** Part B: each embedded gap has a before/after offline number on the same dataset (SDLC §4). No existing pin moves without a stated reason.
- **R6** I-FL1 holds: a donor-mode `Hits` source never drives light except through a flash-gated ⚡ input.
- **R7** Gates green; the calibration scene shows the donor sources as tiles.

## Open (for S1/S2)
- Band edges, window lengths, thresholds and decays: S1 proposes them from the donor docs + our tracks.
- Whether donor mode runs in the worklet or on the main thread. Donor mode analyses on the render tick, while ours runs on the audio clock.
- Part B scope: which of P4, P6 and deviance hits are worth it.
