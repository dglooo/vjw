# DSP — a donor-mode analyser + our detector's gaps (2026-11-18)

## TL;DR
- **Donor mode is feasible and cheap.** The prototype feeds all 40 donor audio names that the 88 donor scene folders use. It runs on the render tick, on the AnalyserNode frame that `app.ts:304–305` already reads, as the donor does (FR §1). Cost: **23–24 µs p50, 28–31 µs p95 per frame** (Node 20). The R4 budget is 500 µs.
- **R3 PASS on 3 tracks / 7 drops.** Levels rest at p50 .57–.66. BassHits fire 76–79/min against our kick's 49–58/min, and only .31–.44 of BassHits land on a kick. Presence (all) is higher in the drop body than in the break on 6/7 drops (Bass 7/7). Intensity in the bass-weighted form is higher on 7/7 (p50 gap ≥ .2 on 6/7, the same as our `energy`). BeatTime steps 0 or +1 per frame: 174.0/174.4/173.7 steps/min against grid BPMs of 174.0/174.1/174.0.
- **Use ours for structure.** A donor-style PrimeBang either fired on 0/7 drops (1 false) or on 3/7 (39 false). Our arrangement fires on 5/7 with 0 false, so PrimeBang should come from our `fired` and PrimeAndBang from our `build`.
- **R1 needs a warm core.** A cold-started donor instance differs from a warm one for up to 14.8 s (Level) and for more than 30 s (Presence, Intensity), and FadeInOut fades in from black over 4.5 s. Fix: run the stats core from the first audio frame whatever the mode, and gate only the textures. ⚠️ This conflicts with the "runs only while on" clause of R4 (the cost still passes).
- **Part B:** P4 kick accent passes its check (CV .21–.29, r .98–.99), but its musical value is unproven: **embed later**, as an additive source from the analyser frame, with no contract change. Deviance-strength hits: **skip**. On kicks they read weakest in drop bodies, and 46–71 % of kicks fall below .25. P6: **embed later** as one global trim (`g60`): it holds p50 at −12 dB (the fixed window loses .200) and keeps the section contrast. The per-band auto window flattens the highs.

## Freshness
- 2026-11-18, audio-dsp (Opus 5.5). Code: master `7c8caad` (`web/src` is the same as the brief's `36c75c9`; only STATE commits since). A frozen copy is at `scratchpad/dsp-donor/web/src` (from `git archive`). In that copy, `drums.ts:96` is patched so that the kick hit carries `power` (P4 (i)).
- Measured offline in Node, with no browser and no dev server. `scratchpad/dsp-donor/donor.ts` is `../dsp-formula/sim.p123.ts`'s replay of `app.ts` for a FILE: 60 fps, preset dnb, classifier skipped. On top of that replay it adds `donor-model.ts` (the donor-mode prototype + an assert self-check `demo()`), cold starts, the per-frame cost, a kick table and band0..31 variants.
- Tracks: Kanine *Feel The Vibrat*, Sub Focus *Elevate (SOTA)*, Bicep *Glue (Kanine bootleg)*. Decoded with ffmpeg to mono 48 kHz; the PCM was deleted after the run. Annotations: `scratchpad/trackview/annot.json`, 7 main drops (not ear-checked, except Sub Focus 146.5 s).
- Donor evidence is text only: `report.md` §7, FR §1 (component names and addresses), a grep of `syn_*` over the 88 folders in `donor/visual_system_2/scenes/*/*.synScene`, and the SSF docs (§ Sources). No donor binary or `script.js` was run.
- Abbreviations: **FR** = `dsp_formula_review_2026-11-17.md`; **R §4** = `research_donor_visual_system_2.md` §4; **N60** = a band's dB as a clamped auto-normalised value against 60 s stats (mean ± 2σ → 0/1); **θ** = the hit threshold in σ.

## §1 Signals needed (spec R2)
These are the audio names used in the 88 scene folders, with the number of scenes for each (my grep; R §4 gives the same order of magnitude). BassLevel 62, HighHits 57, Presence 46, Time 41, BassPresence 38, OnBeat 34, BassTime 34, BassHits 33, HighTime 28, BeatTime 25, HighPresence 23, FadeInOut 17, BPMTwitcher 17, MidPresence 16, Level 14, Hits 14, HighLevel 14, BPM 13, MidLevel 11, MidHighPresence 11, CurvedTime 11, RandomOnBeat 10, BPMTri2 10, ToggleOnBeat 9, BPMSin4 8, BPMConfidence 8, MidHighLevel 7, BPMSin2 7, MidHighTime 6, Spectrum 5, MidHighHits 5, Intensity 5, MidTime 4, MidHits 3, BPMTri 3, PrimeBang 2, PrimeAndBang 1, LevelTrail 1, InputLevel 1, BassExpoCurve 1. Public names that no scene uses: RawLevel, BPMSin, BPMSin8, BPMTri4, BPMTri8, TimeSeries\*. Knobs: Reactivity and AudioSpeed (spec Goal 1).

## §A1 Formula table (every constant is OURS: inferred and tuned on the 3 tracks; FR §1 "Not recovered")
**Core.** It runs per frame (60 Hz render tick, `dt` = the frame time) on the `app.ts` analyser frame: 1024-point Blackman, smoothing 0 (`input.ts:16`), 46.9 Hz bins. Bands: all 30–16000 Hz, Bass 30–150, Mid 250–2000, MidHigh 2000–6000, High 6000–16000 (150–250 Hz is left out on purpose: §A2 sweep). Each band has `dB_b` = 10·log10(mean bin power). Running mean/σ are EMAs, a plain mean until the EMA is the slower one. `music` = frame RMS > −60 dBFS. Code: `scratchpad/dsp-donor/donor-model.ts`.

| Name (scenes) | Formula | Constants | Range · rest (measured p50) | Evidence |
|---|---|---|---|---|
| syn_BassLevel (62) | L = one-pole(clamp((dB − (μ − 2σ)) / 4σ)); 0 when not `music` | stats τ 10 s; attack 30 ms, release 150 ms | 0..1 · .5 at the band mean (.57–.61) | FR §1 `Algorithm_VUBP` @0x943a, `getClampedAutoNormalized` @0xda2a; SSF "normalized, smoothed" |
| syn_Level (14), syn_HighLevel (14), syn_MidLevel (11), syn_MidHighLevel (7) | as BassLevel, on its band | as above | 0..1 · .60–.64 / .64–.66 / .62–.64 / .62–.66 | as above |
| syn_HighHits (57), syn_BassHits (33), syn_MidHighHits (5), syn_MidHits (3) | flux = max(0, dB(t) − dB(t−1)); z = (flux − μF)/σF; z crosses θ upward → H = max(H, clamp(.5 + (z − θ)/2θ)); else H·e^(−dt/τ) | θ 3; flux stats τ 2 s; τ Bass .12, Mid .10, MidHigh .08, High .06 s | 0..1 · 0 | FR §1 `ThresholdDecayComponent::getDevianceValue` @0xc24e; `Algorithm_Spectral_Flux` @0x12f96 (halfWaveRectify); SSF "spike on isolated transients" |
| syn_Hits (14) | proposed: max of the 4 band Hits (the full-band flux reads ≈ BassHits: 71–79/min) | — | 0..1 · 0 | R §4 "any-band hit" |
| syn_Presence (46), syn_BassPresence (38), syn_HighPresence (23), syn_MidPresence (16), syn_MidHighPresence (11) | P = EMA(N60_b) | τ 2 s; stats 60 s | 0..1 · .52–.67 | FR §1 `PresenceComponent` @0x12b36, `getAccumLevel` @0x4e0a, `Accumulator::createWithHalfLife` @0x100d6 |
| syn_Time (41), syn_BassTime (34), syn_HighTime (28), syn_MidHighTime (6), syn_MidTime (4) | T += dt · 2·L_b | — | clock · rate 1/s at L .5 (p50 1.14–1.32/s); stops in silence | FR §1 `TimeComponent` @0x16ae; SSF "similar scale to TIME" |
| syn_CurvedTime (11) | C += dt · min(8, (2·L_all)³) | cap 8 | clock · rate p50 1.70–2.09, p90 3.97–4.43 | FR §1 `VUAdditiveTimeFast` @0xbfe2; SSF "accelerates much more strongly" |
| syn_Intensity (5) | I = clamp(.5 + 2.5·(EMA(.8·N60_Bass + .2·N60_High) − .5)) | τ 6 s; ×2.5; weights .8/.2 (as `arrange.ts:89–90`) | 0..1 · drop body .70–1.00 | FR §1 `VUIntensityAccum` @0x9e40; SSF "accumulates toward 1.0" |
| syn_FadeInOut (17) | F += (music − F)·(1 − e^(−dt/τ)) | τ rise 1.5 s, fall 2.5 s | 0..1 · 1 while music (1.00) | FR §1 `VUFadeToBlack` @0x12dd2; SSF "like a film fade" |
| syn_BassExpoCurve (1) | s = clamp(s + dt/4 if N60_Bass > .55, else s − dt); v = expm1(3s)/expm1(3) | 4 s rise, 1 s fall | 0..1 · .00–.34 | FR §1 `BassExpocurveAccum::expoGrowth` @0x295c |
| syn_PrimeBang (2), syn_PrimeAndBang (1) | **ours:** PrimeBang → 1 on arrangement `fired`, decay τ .3 s; PrimeAndBang = `build` | — | 0..1 · 0 | FR §1 @0x9646/@0x9772 (no constants); §A2 measured |
| syn_OnBeat (34) | beat event → 1, then e^(−age/.1 s). **Beat event:** floor(`sync.beat`) passes a new integer while bpm > 0 (at most +1 per frame; a backward re-anchor holds). With no grid, our kick, ≥ .25 s apart | τ .1 s | 0..1 · 0 (p50 .10–.16) | FR §1 `BeatComponentHFC/RMS` @0x2af2/@0xf52a |
| syn_BeatTime (25) | +1 per beat event (stepped) | — | count | FR §1 `BeatToIncrement` @0x10184; SSF "+1.0 per beat" |
| syn_BPMTwitcher (17) | BeatTime − e^(−age/τ) | τ .05 s | clock: floor = BeatTime − 1, fract = the per-beat jump | FR §1 `BPMComponentTwitcher` @0xc834; SSF |
| syn_RandomOnBeat (10), syn_ToggleOnBeat (9) | a new uniform random value / a 0↔1 flip per beat; logistic ease 1/(1 + e^(−12(age/T − .5))) | T = min(.2 s, ½ beat) | 0..1 | FR §1 `BeatToRandomLocation` @0xe052, `BeatToFlipSwitch` @0xd312 (`doExpoCurve`) |
| syn_BPM (13) | `sync.bpm`; holds the last value with no grid (120 before the first); clamp 50–220 | — | 50..220 | SSF "50 to 220" |
| syn_BPMConfidence (8) | `sync.confidence` | — | 0..1 | SSF |
| syn_BPMTri2 (10), syn_BPMSin4 (8), syn_BPMSin2 (7), syn_BPMTri (3) | phase = grid beat (with no grid, it freewheels at the held BPM); Sin_n = .5 − .5·cos(2π·phase/n); Tri_n = 1 − \|2·fract(phase/n) − 1\|; **no × confidence** (SYN's `lfo()` has it, `syn.ts:29`) | n = 1, 2, 4, 8 | 0..1 | FR §1 `BPMToTimer` @0xf262 (phaseCorrection) |
| syn_InputLevel (1) | `meter.ts` held sample peak (dBFS) → (dB + 60)/60 | hold .5 s, fall 20 dB/s (`meter.ts`) | 0..1 · ≈ 1 on mastered tracks (1.00) | FR §1 `InputTrackingComponent` @0x26ce |
| syn_Spectrum (5) | 512×1 rgba: r = clamp((dB + 100)/70); g = per bin (dB + 3 dB/oct) against its decaying min/max (+.05 / −.1 dB per frame), EMA .5; b = [1 2 1]/4 blur of g, EMA .2; a = .5 + .5·wave | — | 0..1 (not scored: no reference) | FR §1 `SpectrumJuiced2D` @0xa4f6 (`doAccumulatorDecay`, `doHighFrequencyAugment`, `blurXAxis`, `doTimeSmoothing`), `Waveform2D` @0xa07e; SSF r/g/b/a |
| syn_LevelTrail (1) | 256×1 rgba ring: r L_all, g L_Bass, b L_Mid, a L_High | 256 frames ≈ 4.3 s | 0..1 | FR §1 `TimeSeries2DComponent` @0x4400; SSF |
| Reactivity (knob) | L' = .5 + (L − .5)·R; θ' = θ/R; contrast of the juiced spectrum ×R | R 0..2, default 1 (unmeasured) | — | `setReactivityUI` @0x6c90, `applyReactivityUI` @0xad6c, `doReactivityMute` @0xf372 |
| AudioSpeed (knob) | rates of Time / CurvedTime ×S; the BPM timers take the nearest ×2^k, so they stay locked | S 0..2, default 1 (unmeasured) | — | `setAudioSpeedUI` @0x6c68, `doBPMAudioSpeedAdjustment` @0xf2c0 |

## §A2 Prototype on the 3 tracks (spec R3)
Evidence: `scratchpad/dsp-donor/out/{score-v2.txt, ranges.txt, sweep.txt}`, `out/<track>.json`, and `strip-{kanine,subfocus,bicep}.png` (24 s around drop 1, donor rows against ours).

| Track | Level p50 all / Bass / Mid / MidHigh / High | Hits/min Bass · High · Mid · MidHigh | Ours/min kick · hats · snare | BassHits on a kick · kicks with a BassHit (±34 ms) | BeatTime steps grid + kick fallback · steps/min vs BPM |
|---|---|---|---|---|---|
| Kanine | .60 / .57 / .62 / .64 / .65 | 76 · 94 · 91 · 84 | 58 · 148 · 40 | .44 · .58 | 497 + 11 · 174.0 vs 174.0 |
| Sub Focus | .63 / .60 / .63 / .62 / .64 | 79 · 91 · 78 · 80 | 49 · 133 · 31 | .31 · .50 | 457 + 12 · 174.4 vs 174.1 |
| Bicep | .64 / .61 / .64 / .66 / .66 | 77 · 107 · 82 · 87 | 49 · 135 · 23 | .35 · .55 | 457 + 17 · 173.7 vs 174.0 |

- **Level rests near its mean.** p50 .57–.66, p10–p90 .31–.84. The .1 above .5 comes from the attack/release asymmetry.
- **Hits threshold sweep** (`sweep.txt`):
  - θ 2: BassHits 153–186/min, of which only .12–.26 land on a kick.
  - **θ 3 with Bass < 150 Hz (picked):** the numbers in the table above. HighHits land on a hat .65–.88 of the time.
  - θ 4: BassHits 34–38/min; only .29–.45 of kicks get one.
  - A Bass edge of 250 Hz instead of 150 (at θ 3) lowers the agreement on Kanine and Bicep: kicks with a BassHit .58 → .49 and .55 → .30. Sub Focus barely moves (.50 → .52).
- **Sections (7 drops, break [d−12, d−2) vs body [d+10, d+30))**, counted as "body > break" (and "p50 gap ≥ .2"):
  - Presence 6/7 (2/7), BassPresence 7/7 (4/7), HighPresence 5/7 (0/7).
  - **Intensity as proposed: 7/7 (6/7).** Per drop: Kanine .60→.98, .65→.70, .25→.88; Sub Focus .77→1.00, .40→.79; Bicep .96→.98, .34→.88.
  - Full-band Intensity without the expansion: 6/7 (2/7). Our `energy`: 7/7 (6/7).
  - Level 2/7, BassLevel 3/7. The 10 s reference flattens sections, as FR §4 found. N60 Level would give 6/7 (all) and 7/7 (Bass).
- **BeatTime.** Every frame's step is 0 or 1. There were 0 multi-beat jumps and 0 backward re-anchors (this replay has no seeks). The grid exists in 69–85 % of frames; the rest falls back to kicks (11–17 steps).
- **PrimeBang, donor-style vs ours** (a hit = a bang within [d − 1, d + 4] s):
  - v1 (prime = full-band N60 < .4 for 3 s): 0/7 drops, 1 false.
  - v2 (prime = BassPresence < .5): 3/7 drops, 39 false (Kanine 18, Sub Focus 11, Bicep 10).
  - Ours, `fired`: 5/7 (Kanine 44.6 / 88.8 / 155.0, Sub Focus 146.5, Bicep 176.9), 0 false.
- **Other outputs** (`ranges.txt`): every 0..1 name stays inside 0..1. BPM is 120 until the first grid, then 174. Twitcher rate p50 .16–.44/s with p90 8.7/s (the jumps). InputLevel p50 1.00 (saturated).

## §A3 Placement and cost (spec R4)
- **Main thread, in `frame()` right after `energy.update` (`app.ts:315`).** It reads the same `magDb` and `wave` (`app.ts:304–305`), so no new FFT and no worklet contract change. This is "like theirs": the donor analyses on the render tick (FR §1).
- **Cost**, measured on the final model with sequential runs (12–13.6 k frames per track, Node 20 V8). It covers the core, all names, and the CPU build of the Spectrum rgba and the LevelTrail:
  - Kanine: p50 23.4 µs, p95 29.5 µs, max 507 µs.
  - Sub Focus: p50 23.8 µs, p95 28.4 µs, max 442 µs.
  - Bicep: p50 23.8 µs, p95 31.3 µs, max 1742 µs.
  - With 3 runs at once (CPU contention), p95 was 29–69 µs. The max values are GC pauses of the sim's own row arrays.
  - Not measured: the two small texture uploads per frame (512×1 and 256×1 rgba).
  - ⚠️ Estimate, needs confirmation: in Chrome, a 2–3× slowdown for main-thread contention plus the uploads gives ≤ 0.15 ms p95, so R4 holds with ≥ 3× margin.
- **Worklet (rejected).** Its gains: values per hop on the audio clock, and Hits that do not depend on the frame rate. Its costs: a new message kind, main-thread interpolation (the `features.at` pattern), a medium-size change, and the result is not the donor's model.
- **Frame-rate dependence.** The flux is measured per tick, so the 30 fps `everyOtherFrame` mode (`app.ts:293`) doubles the per-tick rise. θ was tuned at 60 fps only (Gap 6).
- **Latency.** On a file, the analyser frame runs about 20 ms ahead of `audioNow`, the same as `bass`/`band*` today (FR §4 "Latency"). On line-in it is live.

## §A4 Mode switch mid-track (spec R1)
**Cold start, measured.** A second instance was started at the break and in the body of drop 1 on each track, and compared with the warm instance for 30 s:
- A difference ≥ .05 lasts: Level 2.7–14.8 s, BassLevel 1.1–11.7 s, BassHits 0.2–2.7 s, HighHits 0–4.3 s, Presence and Intensity > 30 s, FadeInOut 4.5 s (it starts at 0 and fades in from black).
- No hit burst: in the first 2 s, the cold and warm hit counts are within ±1 (bass 4/4, 2/2, 5/6, 4/3, 0/1, 2/2).
- The donor-style PrimeBang v2 gave 1–7 false bangs in the 30 s after a cold start.

**Rules (for the designer):**
1. **Keep the core warm.** Run the stats and levels every frame from the first audio frame, whatever the mode (≈ 24 µs p50). Gate only the Spectrum and LevelTrail build/upload by the mode or by a bound donor source. ⚠️ This replaces the "runs only while on" clause of R4; the ≤ 0.5 ms budget still holds.
   - Fallback if that clause must stay: hold the outputs at rest for ≥ 15 s after a cold start: Level .5, Hits 0, Presence/Intensity ← our `energy`, FadeInOut ← 1 while music.
2. **No false drop, by construction.** Our arrangement (build / drop / heat / fired / confirmed → `shouldCut`) never reads the donor block. PrimeBang = our `fired`, so it is the same event in both modes.
3. **⚡ inputs.** Keep each input's `FlashState` and the scene's shared onset budget across the switch (`post.ts:46`). A donor spike at the switch is then an ordinary onset, and ≤ 3/s still holds.
4. **Non-flash bound inputs.** Crossfade ours → donor over 2 s, the Auto-style pattern (`bind.ts` `createRemap`), so a light driven by a Level does not step.
5. **Clocks.** SYN `{clock}` bindings keep their position (`bind.ts:138`: "switching modes never jumps"). Seed the donor BeatTime with floor(`sync.beat`) at the switch, so the raw value jumps by < 1 beat. Today `syn_BeatTime` is the continuous count (`syn.ts` SYN).
6. **FadeInOut.** Seed it at 1 while music plays; a warm core already does this.

## §B Our detector: P4, P6, deviance hits (spec R5; SDLC §4)
**Protocol.**
- Dataset: the same 3 tracks and 7 annotated drops; the same replay on master `7c8caad`. The before and after values come from the SAME run and the SAME frames.
- Kick truth: the PCM through a 150 Hz Butterworth low-pass, a 10 ms RMS envelope, and the peak dB over [t − 5, t + 50] ms around each worklet kick (n = 193 / 163 / 184).
- −12 dB input: `magDb` − 12.04 dB, which is exact for a linear gain.
- To rerun:
  - `cd scratchpad/dsp-donor`
  - `ffmpeg -i <track> -ac 1 -ar 48000 -f f32le pcm/<t>.f32`
  - `../../web/node_modules/.bin/rolldown donor.ts -o out/donor.mjs -p node -f esm`
  - `HIT_Z=3 BASS_HI=150 node out/donor.mjs pcm/<t>.f32 48000 out/<t>.json <cold s,…>`
  - `python3 -I score.py`

| Item | Before | After | Check (FR §5) | Recommendation |
|---|---|---|---|---|
| **P4** kick accent | `kick` peak = 1 on every hit (CV 0.00). The worklet `strength` (gate ratio) has r −.02 / −.03 / −.05 with the truth | (i) Worklet hop power (contract: a `power` field on the kick hit, `drums.ts:96`): r .92 / .99 / .98, CV .27 / .24 / .23. (iii) The analyser frame's 47–141 Hz power at the drain frame (main thread, **no contract change**): r .99 / .98 / .99, CV .29 / .27 / .21 | CV ≥ .2 and r ≥ .6: PASS for both | **Embed later**, via (iii), as an additive `kickAccent` source with no default binding. `kick` and the pins stay. Skip (i). |
| P4, ambiguous | — | On-beat vs off-beat accent: .76 vs .72, .77 vs .72, .72 vs .73 (Δ ≤ .05). r(accent, `subBody` 50 ms before) .51 / .21 / .37: the accent partly tracks the bass line under the kick | no labels for ghost kicks or fills | the user must see it in the app first |
| **Deviance-strength hits** (our kick events, peak = clamp(z/4) of the Bass flux deviance) | as above | r with the truth .22 / .15 / −.02; CV 1.00 / .91 / 1.45; kicks < .25: 51 / 46 / 71 %; mean in the drop body .32 / .43 / .15 vs the break .52 / .61 / .35 | it inverts the drop/break order | **Skip** for ours. It stays inside donor mode, where it IS the donor's Hits. |
| **P6** band0..31 | Fixed −75..−15 dB (`bind.ts:64`): p50 .81–.83 → .61–.63 at −12 dB (a shift of .200); dead .01–.03 (.02–.05 at −12 dB); saturated .08–.12 | **g60**, one global trim (the 60 s mean band dB against REF −50 dB, a knob): shift 0 by construction; p50 .72–.76; dead .01–.02; saturated .01–.06. **a60** (per band, mean ± 2σ over 60 s): shift .0003–.0005; p50 .57–.61; dead .04–.05; saturated .01–.03. a10: rejected | the same p50 at −12 and 0 dB: PASS for g60 and a60 | **Embed later as g60**, once a line-in level offset against files is measured ≥ 6 dB (`meter.ts` header: the DJ trims the mixer). Ceiling: a fader move takes ≈ 60 s to re-normalise. |

The P6 section contrast, body − break for the low / mid / high band groups (Kanine; Sub Focus; Bicep):
- fixed: [.11, −.01, .03]; [.06, −.04, .02]; [.09, .02, .16].
- g60: [.09, −.03, .01]; [.04, −.06, .00]; [.04, −.03, .11]. This is the closest to fixed.
- a60: [.15, −.04, −.04]; [.03, −.07, −.05]; [.07, −.02, .06]. The highs lose their contrast (the per-band window whitens the spectrum).
- a10: [.09, −.05, −.10]; [−.05, −.01, −.14]; [.00, −.05, −.11]. The highs invert.

## §C Flash (spec R6, I-FL1)
How light is gated today:
- A SYN binding becomes a float input (`syn.ts:232`). A scene lists its flash inputs in `VJW_FLASH` (checked at `syn.ts:244`), and those inputs pass `flashGate` (`post.ts:46`: ON .5, ≤ 3 onsets/s, one budget per scene).
- 36 of the 71 ported scenes list Hits, OnBeat or BPMTri names (HighHits 19, BassHits 8, the rest mixed).

**Rule:** donor values enter only as binding sources, by swapping the source id in the SYN entry. They never enter as a `raw` value or a direct uniform: those paths bypass `VJW_FLASH`.

| Class (at 174 BPM, 60 fps) | Donor names | Rate | Path to light |
|---|---|---|---|
| Event (rises in ≤ 1 frame) | Bass/Mid/MidHigh/High Hits; syn_Hits (the union, so more often); OnBeat; PrimeBang | 76–107/min per band; OnBeat 2.9/s | ⚡ only: the scene lists them in `VJW_FLASH` |
| Step per beat | ToggleOnBeat, RandomOnBeat (eased over ≤ .17 s: up to .29 of the range per frame), BPMTwitcher fract (τ .05 s) | 2.9/s | make them bindings (Twitcher is `raw` today) and list them where a scene turns them into light |
| Hard step, no gate possible | BeatTime (a count: `sin(syn_BeatTime)`, noise seeds `iqnoise(… syn_BeatTime*10.0)`) | 2.9/s; > 3/s above 180 BPM | audit I-FL1 on those scenes in donor mode (today the value is continuous) |
| Fast level | the 5 Levels (30 ms attack) | follows transients | bindings: list them if a scene uses one as light |
| Smooth | Presence, Intensity, FadeInOut, the Time clocks, BPMSin/Tri (BPMSin is a 2.9 Hz full swing) | ≤ 3/s | no gate needed |
| Texture | Spectrum r (raw, unsmoothed per frame) | per frame | no gate possible: audit where it lights the whole frame |

## Gaps
1. No donor constant is recovered. Every number here is ours and was tuned on 3 DnB tracks only.
2. No donor-style structure detector works (PrimeBang 0/7 or 3/7 with 39 false), so ours is used.
3. Hits are not drums: only .31–.44 of BassHits land on a kick, and .65–.88 of HighHits on a hat.
4. A cold start takes up to 14.8 s to converge (Level) and more than 30 s (Presence, Intensity), so the core must stay warm. This conflicts with a clause of R4.
5. A stepped BeatTime adds a new per-beat discontinuity to scenes that read it continuously, and no flash gate can apply to a count.
6. Hits depend on the frame rate (flux per tick); θ was tuned at 60 fps only.
7. P4's musical value is unproven: on-beat vs off-beat Δ ≤ .05, and the bass line confounds it (r .21–.51).
8. InputLevel saturates on mastered tracks (p50 1.00).
9. Time scale: SYN clocks run at Level per s (`clock.ts:17`: y + rate·dt), about .5/s at rest. The SSF docs say a scale "similar to TIME"; the prototype runs at ≈ 1.2/s.
10. Spectrum g/b and LevelTrail are not scored, because there is no reference to score them against.
11. Not measured: Dubstep (Rumble), line-in, seeks during donor mode, and the Reactivity and AudioSpeed knobs.

## Risks (genre traps)
- **Reese and growl read as BassHits / MidHits.** The flux deviance fires on bass-note onsets, so on DnB only .31–.44 of BassHits are kicks. Dubstep growls are untested; expect more Mid/MidHigh Hits away from the snare (our `floors.tilt` veto has no donor equivalent).
- **Drops without a bass dip.** Presence and Intensity rise over 6–10 s after a drop (`strip-kanine.png`), and only against the 60 s reference. A no-dip drop gives no step: Kanine 88.4 Presence .54 → .53, full-band Intensity .59 → .57. Only the bass-led values rise: BassPresence .45 → .56, the bass-weighted Intensity .65 → .70, our `energy` .47 → .56.
- **Tempo octave errors.** OnBeat, BeatTime and Toggle follow our grid. A doubled grid (348 BPM) would step 5.8/s, above the WCAG 3/s. The preset's BPM band prevents that today (174 measured).
- **Level rests above .5** (p50 .57–.66). Scenes that apply `pow(syn_BassLevel, 2.0)` get about .35 at rest.

## Sources
- SSF audio uniforms (the donor format's public docs): https://app.synesthesia.live/docs/ssf/audio_uniforms.html
- Donor text: `donor/visual_system_2/report.md` §7 L256–300; FR §1 (addresses from `rea_evidence_bundle.json` record 41, demangled in `scratchpad/dsp-formula/appengine_procs.txt`); 88 folders in `scenes/*/*.synScene` (grep `syn_*`).
- Ours: `web/src/app.ts:293,304–305,315`, `audio/input.ts:16`, `audio/drums.ts:96`, `audio/arrange.ts:89–90`, `audio/meter.ts`, `bind.ts:64,138`, `clock.ts:17`, `fx/syn.ts:29,35–82,232,244`, `gl/post.ts:34,46` (master `7c8caad`).
