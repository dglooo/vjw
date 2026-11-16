# DSP formula review — donor `visual_system_2` vs ours, and "was it better before?" (2026-11-17)

## TL;DR
- **The missing formula is a time scale.** The donor gives each band three readings: Level (fast, 0..1, at rest in the middle), Hits (transients) and Presence (slow, section-level). It also adds macro signals (Intensity, FadeInOut) and audio-driven clocks. Our bass sources have only one reading: the rise over a **4 s** running average, at rest at 0. In the body of a drop the music's bass stays within ±4 dB, but `sub` falls from 0.52–0.83 (first 5 s) to **0.07–0.29** (10–30 s). It reads 0 in 19–38 % of drop frames (`reese`: 34–45 %). After about 5 s the visuals cannot tell a drop from a breakdown.
- **H0, "earlier was better": partly true, and it dates to 2026-11-05, not to the 11-16 tags.** milk-sync, detector-d1d2d3, tempo-t1t2, linein-fixes and master feed identical kick/snare/hats/sub/reese/bass/build/drop on the 3 tracks. On 2026-11-04 the visuals got more continuous motion, for two reasons. (a) `sub`/`reese` = ratio ÷ 2 held about 0.5 through every drop (0–5 % dead). (b) The old bin-1 kick fired **370–390 times a minute** on bass beating, a flicker that acted like a bass level. Today's kick is correct (48–57/min), but sparse. On 11-16, milk-sync moved what MilkDrop presets hear: their bass is now mostly our kick pulse (r 0.81–0.89 with `kick`, 0.45–0.71 with the music's own bass).
- **We are better at:** kick detection, timing (5.3 ms worklet hops and audio-clock timestamps, against the donor's analysis on the render tick), kick-gated bass, drop detection, tempo/genre.
- **Top proposals:** P1 bass-level sources against a 60 s reference (measured: drop body 0.53–0.91 vs break 0.16–0.62 on 7/7 drops; S). P2 a section-energy macro (S). P3 the milk-sync body term from P1 (S). Analysis view: one canvas of stripcharts in the Sources tab, which already reads every source each frame (S).

## Freshness
- 2026-11-17, audio-dsp (Opus 5.5). Code: master `c96f1e0` (`web/src` is the same as at `956410d`).
- Measured offline in Node, with no browser and no dev server. `scratchpad/dsp-formula/sim.ts` (based on `scratchpad/dsp/serpent-replay-sim.ts`) runs each version's own worklet body (`analysis.ts`), `features`, `energy`, `arrange`, `tempo` and `sync`, as `app.ts` runs them for a FILE at 60 fps. It uses a fixed DnB preset (classifier skipped) and 2 s CPU per track.
- Versions: master, `milk-sync` 63ca394, `detector-d1d2d3` 975d3ea, `tempo-t1t2` 905eedb, `linein-fixes` 213dfeb, pre-11-05 `7853c7d` (2026-11-05 05:30, before d8cc285/4bc7664), late-October `4b227d3` (2026-10-31). Each ran in a temporary worktree under `scratchpad/dsp-formula/wt/`, which was removed after the run.
- Tracks: Kanine *Feel The Vibrat*, Sub Focus *Elevate (SOTA)*, Bicep *Glue (Kanine bootleg)*, mono 48 kHz. Annotations: `scratchpad/trackview/annot.json` (7 main drops). The PCM was deleted after the run.
- Donor evidence is text only: `report.md` §2/§5/§7, the AppEngine procedure list (`rea_evidence_bundle.json` record 41: 663 names and addresses, **no pseudo-code**), and 87 scene sources. `App.app` was never executed. Uniform semantics come from the public docs (§ Sources).

## 1. Donor audio model
Pipeline (report §7, §2). CoreAudio callback → `AudioEngine::processAudio` @0x47a6. The analysis runs in `AudioEngine::update(dt)` @0x47ea, which is called from the **render tick** (`sub_10015c128` → `sub_1001a21ce`). The tick is NSTimer-driven at `1/FPS` with dt clamped to [1/240, 0.5]. FFT: `FFTManager` (vDSP `fft_zrip`, `zvabs`/`zvmags`, `normalize`), selectable window (Nuttall/Hamming/Hann/Blackman/Welch/none @0x3860–0x3c98) → bands **Bass / Mid / MidHigh / High** (+ all).

Statistics layer (applies to every feature). `DSPStore` → `DimensionStore1D` keeps a `DoubleRingBuffer` and `Online_Mean` @0x19f6, `Online_StdDev` @0x361a, `Online_Deviance` @0x5040, `Online_Accum` @0xdf84 (additive / dropoff). It exposes `getRaw` @0xdab4, `getMean` @0xdade, `getStdDev` @0xdb08, `getDeviance` @0xdb32, `getClampedAutoNormalized` @0xda2a and `getAccumulatorNormalized` @0xdb84. Scales: `MagnitudeDecibelScale`, `LogScale`, `MusicalFrequencyLogScale`, `ScalarUnitNormalize` @0xdfc0, `ClampedScalarUnitNormalize` @0xcb2a. Accumulators: `Accumulator::createWithHalfLife` @0x100d6. User knobs: `setReactivityUI` and `setAudioSpeedUI` (AudioComponentController @0x6c90/0x6c68).

| Uniform (uses in 87 scenes) | Docs semantics | Component → inferred formula | Evidence |
|---|---|---|---|
| `syn_{,Bass,Mid,MidHigh,High}Level` (132 Bass) | loudness, smoothed, 0..1 | `VUComponent`/`Algorithm_VUBP` → band VU → clamped auto-normalise (running mean/σ) → smoothing | @0xde32, @0x943a, @0xda2a |
| `…Hits` (121 High, 42 Bass) | spikes on isolated transients, 0..1 | `ThresholdDecayComponent::getDevianceValue` → deviance over a threshold → decay | @0xc1c8, @0xc24e |
| `…Presence` (82 all, 53 Bass) | rising/falling activity, not each sound | `PresenceComponent(AudioFeature)` → slow accumulator level | @0x12b36, `getAccumLevel` @0x4e0a |
| `…Time` (71 all, 59 Bass) | clock that advances with the band's volume | `TimeComponent(AudioFeature)` → ∫ level dt | @0x16ae |
| `syn_CurvedTime` | accelerates hard on volume rises | `VUAdditiveTimeFast` / `AccumulatorComponent` | @0xbfe2, @0x1bca |
| `syn_Intensity` | slowly accumulates toward 1 with the song's intensity | `VUIntensityAccum` | @0x9e40 |
| `syn_FadeInOut` | rises slowly when music starts, falls when it ends | `VUFadeToBlack` | @0x12dd2 |
| `syn_BassExpoCurve` | (undocumented) | `BassExpocurveAccum::expoGrowth` → exponential growth on sustained bass | @0x295c |
| `syn_PrimeBang`, `syn_PrimeAndBang` | (undocumented; scenes use it as a >0.5 trigger to re-randomise) | `PrimeAndBangStructureDetector::updatePrimer` → structure: prime (tension), bang (release) | @0x9646, @0x9772 |
| `syn_OnBeat` (51) | 1 on a beat, quick fall | `BeatComponentHFC` / `BeatComponentRMS` (HFC or RMS onset) | @0x2af2, @0xf52a |
| `syn_BeatTime` (46) | +1 per beat | `BeatToIncrement` | @0x10184 |
| `syn_ToggleOnBeat`, `syn_RandomOnBeat` | flip / new random per beat, logistic transition | `BeatToFlipSwitch`, `BeatToRandomLocation` (`doExpoCurve`) | @0xd312, @0xe052 |
| `syn_BPM`, `syn_BPMConfidence` | 50–220; stability 0..1 | `Algorithm_BPM` (leaky histogram, logistic curve, decimation) + `MacleodEstimator` | @0x11090, @0x12074, @0x41fa |
| `syn_BPMTwitcher`, `syn_BPMSin{,2,4}`, `syn_BPMTri{,2}` | beat clock with an exponential jump; sine/triangle at 1, ½, ¼, ⅛ BPM | `BPMComponentTwitcher`, `Sin(float)`, `Tri(float)`, `BPMToTimer` (`phaseCorrection`, `doReactivityMute`) | @0xc834, @0x152c, @0x3708, @0xf262 |
| `syn_InputLevel` | input meter | `InputTrackingComponent` | @0x26ce |
| `syn_Spectrum` (rgba) | r raw FFT, g "juiced", b smooth, a waveform | `Spectrum2D`, `SpectrumJuiced2D` (accumulator normalisation, HF augment, x blur, dB, time smoothing, reactivity), `SmootherSpectrum2D`, `Waveform2D` | @0x1ee6, @0xa4f6, @0xb85a, @0xa07e |
| `syn_LevelTrail` (rgba) | band levels over time: r all, g bass, b mid, a high | `TimeSeries2DComponent(AudioFeature)` | @0x4400 |
| (none) | audio-triggered scene transition | `TransitionComponent::trigger`, `AudioEngine::triggerTransition` | @0xc6e2, @0x4ae2 |

Not recovered (the bundle has names only): band edges, window lengths, thresholds, decay constants, the exact normalisation. Every formula above is **inferred** from the names, the docs and scene usage. Scenes post-shape the values themselves, e.g. `pow(syn_BassLevel, 2.0)` and `pow(syn_Level, 3.0)`. The donor's own debug scene `scenes/release/audio_indicators.synScene` shows: raw / juiced / smooth FFT, the waveform with a feedback trail, the LevelTrail stripchart (bass, mid, high) and `syn_InputLevel` with a peak tracker.

## 2. Our audio model (master)
| Source | Formula | Where | Rate / latency |
|---|---|---|---|
| `kick` | worklet: 40–150 Hz IIR gate ratio ≥ `KICK` 1.35, the kick bins hold > `SHARE` .2 of the hop's power, `MIN_GAP` 60 ms; main thread: `e^(−age/0.12)`, **peak always 1** (`strength` unused) | `drums.ts:28,24,31,96`; `features.ts:14,87–88,113` | hop 5.3 ms; a file's hit waits until audible (`app.ts` drain) |
| `snare`, `hats` | band log-flux detectors (floors 40/50, `TILT` .1, kick crosstalk), τ .12 / .06 | `drums.ts:13,18,35`; `features.ts:14` | as kick |
| `sub`, `reese`, `wobble` | IIR band `held` (kick-gated e2) → `max(0, x / avg₄ₛ − 1)`, cap 1 (rests at 0, 2× its average = 1) | `bands.ts:8–16`; `features.ts:17,31,71–75`; `presets.ts:19` (30–60, 60–250, 150–1500 Hz) | 2 hops per batch; `HOLD` .2 s after a kick (`features.ts:22`) |
| `wobbleDepth` | EMA 1 s of the wobble deviation | `features.ts:76` | — |
| `reeseLevel` | raw `held` amplitude (absolute, depends on gain) | `features.ts:120` | — |
| `bass`, `mid`, `treb` | Butterchurn-style: `att / longAvg₄.₂ₛ / 2` (0.5 = average) | `energy.ts:8–11,58–59`; `bind.ts:54` | AnalyserNode, render time |
| `band0..31` | fixed dB window −75..−15 dB (+1 dB/band tilt), **not adaptive** | `bind.ts:57` | render time |
| `onset` | full-band flux strength mapped, τ .12 | `bind.ts:59` | — |
| `beat`, `bar`, `confidence` | ACF + comb + LSQ fit (`tempo.ts:150`), PLL (`sync.ts`); shapes in `evaluate()` (sine/tri/saw/square/random) | `bind.ts:60–62,119` | per frame |
| `build`, `drop` (+ `heat`) | bass-dip arrangement heuristic; `build` > 0 only while sparse; `drop` = confidence × e^(−t/1 s) | `arrange.ts:56,133,173,175` | per frame |
| MilkDrop levels | `0.6 + 1.9·kick + 0.6·max(sub, reese) + drop burst`, mixed over Butterchurn's own by `sync` (default **.75**) | `milkdrop/levels.ts:7–10,31`; `milkdrop/native.ts:82` | per frame |

## 3. Side by side
**What the donor does that we do not:**
1. Three time scales per band (Level / Hits / Presence). We have only "rise over 4 s" for the bass, and a 4.2 s AGC for bass/mid/treb.
2. Section macros: Intensity, FadeInOut, BassExpoCurve, PrimeAndBang. Our `drop` is a 1 s blip, `build` exists only in sparse runs, and no source says "we are in the drop".
3. Audio-driven clocks (`Time` per band, `CurvedTime`) and beat accumulators (`BeatTime`, `Twitcher`, toggles with logistic easing). Our `evaluate()` shapes cover Sin / Tri / Toggle / Random, but with no easing and no audio clock.
4. Every feature has running mean/σ/deviance, plus a clamped auto-normalised read. Our `band0..31` use a fixed dB window.
5. Hit strength reaches the visuals (Hits is 0..1 by deviance). Our kick peaks at 1 every time: peak CV 0.00, while the worklet's strength varies (CV 0.13–0.18).
6. LevelTrail: scenes get the history as a texture. Global Reactivity / AudioSpeed knobs.

**What we do better (measured or by construction):**
1. Kick: 48–57/min on the 3 tracks, at the DnB two-step rate. The old flux kick fired 370–390/min. A donor-style deviance hit (my offline stand-in) reads 0 in 85–91 % of drop frames and misses most kicks in a dense drop (`strip-kanine.png`, row 2).
2. Timing: the worklet runs 5.3 ms hops stamped on the audio clock, and a file's hits are held until audible. The donor analyses on the render tick (frame-quantised; NSTimer, not vsync).
3. The bass is kick-gated (`held`, `HOLD`), so `sub`/`reese` exclude the kick. The donor's Bass band contains it.
4. Arrangement: drops fire on 5/7 annotated drops here (Kanine 3/3, Sub Focus 146.5, Bicep 176.5) with confidence. The donor's PrimeAndBang is unknown.
5. Genre presets and the classifier, per-genre bands and floors, the line-in parity work.

## 4. Hypothesis tests (offline, 3 tracks × 7 versions)
Evidence: `scratchpad/dsp-formula/out/{table.txt, decay.txt}`; strips `strip-{kanine,subfocus,bicep}.png` (24 s around a drop, 6 rows); `overview-{kanine,subfocus,bicep}.png` (whole track).

**H0 versions.** milk-sync = d1d2d3 = t1t2 = linein-fixes = master on every source and every drop fire (the code diff agrees: `features.ts`/`energy.ts` changed only for the line-in `quiet` flag). pre-11-05 = late-October. The real break is 2026-11-05:

| Metric (hit rates: whole track; the rest: 16 s after each drop) | master (11-05 → now) | pre-11-05 / late-Oct |
|---|---|---|
| kick / snare / hats per min | 48–57 / 22–40 / 132–147 | **370–391** / 0–5 / 29–59 |
| `sub` dead (< .02) · sat (≥ .98) | 19–38 % · 7–19 % | 0–5 % · 7–20 % |
| `reese` dead | 34–45 % | 0 % |
| `sub` r with the raw band level | 0.44–0.76 | 0.65–0.90 |
| drop fires on 7 annotated drops | 5 | 0 |

**Drop body decay** (`decay.txt`; columns: break −12…−2 s | drop 0–5 s → drop 10–30 s):

| Drop | music bass dB | master `sub` | pre-11-05 `sub` | candidate L60 `sub` | donor-style Presence |
|---|---|---|---|---|---|
| Kanine 44.3 | −33 \| −23 → −23 | .07 \| .83 → .14 | .32 \| .91 → .51 | .29 \| .99 → .91 | .54 \| .71 → .62 |
| Kanine 88.4 | −32 \| −23 → −26 | .01 \| .74 → .07 | .16 \| .85 → .42 | .16 \| .92 → .53 | .41 \| .63 → .55 |
| Kanine 154.3 | −33 \| −24 → −23 | .14 \| .78 → .13 | .38 \| .83 → .51 | .16 \| .82 → .83 | .52 \| .69 → .62 |
| Sub Focus 55.5 | −30 \| −22 → −23 | .32 \| .77 → .22 | .55 \| .84 → .51 | .58 \| .93 → .85 | .70 \| .70 → .61 |
| Sub Focus 146.5 | −29 \| −21 → −25 | .24 \| .52 → .29 | .56 \| .67 → .49 | .26 \| .61 → .64 | .70 \| .65 → .57 |
| Bicep 66.2 | −28 \| −23 → −23 | .23 \| .53 → .22 | .50 \| .74 → .52 | .62 \| .95 → .76 | .59 \| .64 → .60 |
| Bicep 176.5 | −30 \| −25 → −23 | .36 \| .54 → .20 | .62 \| .74 → .52 | .39 \| .92 → .72 | .67 \| .67 → .61 |

- Master `sub` has **no break-vs-body contrast**: break .01–.36 vs body .07–.29, and Bicep 176.5 is inverted. `reese` behaves the same way (body .09–.20).
- The L60 candidate (raw ÷ a 60 s running mean ÷ 2) keeps the body above the break on **7/7** drops (body .53–.91, break .16–.62). It saturates in the first 5 s (.61–.99).
- The donor-style 10 s auto-normalisation flattens the sections: body ≤ break on 4/7 drops for Level and 3/7 for Presence. **Adaptive normalisation helps only with a long reference.**
- **MilkDrop (11-16):** in drops the milk-sync bass correlates 0.45–0.71 with Butterchurn's own bass and 0.81–0.89 with our `kick`. The p10–p90 scale is unchanged (0.72–1.99 vs 0.28–2.06): the scale did not move, the content did. The liquid bass motion became a kick pulse train on a flat 0.6 floor. The body term `0.6·max(sub, reese)` adds little, because those sources decay in the drop body.
- **Latency.** The donor-style hit leads our kick envelope by 0–17 ms (one frame). This comes from the sim, not the donor: like the app on a file, the sim reads analyser frames 20 ms ahead of `audioNow` (dsp_linein gap 2), while hits wait until audible. The code has not changed since 11-05, so the latency has not regressed.
- **Confound, not audio, not measured:** the 11-16 WCAG flash fixes (STATE: particles, tunnel, toy-plasma, glitch, strobe) moved scene light from raw bass to ⚡ kick hits through `flashGate` (≤ 3/s). On those scenes this removes more bass-following light.
- **Ambiguous:**
  - The fixed DnB preset skips the classifier and the Dubstep floors.
  - The donor formulas are my inference. My Hits stand-in is weak; it is not the donor's code.
  - pre-11-05's "kick" was not a kick, so "better" there means more motion, not more correct.

## 5. Ranked proposals
| # | Change | Expected visual effect | Risk | Cost | Check (offline sim, same 3 tracks / 7 drops) |
|---|---|---|---|---|---|
| P1 | New sources `subLevel` and `reeseNorm` (names: design's call): `held` ÷ its 60 s running mean (`relative()` with AVG 60, plain mean at the start) ÷ 2, cap 1; rests at .5 = the track's mean. Additive: `sub`/`reese` keep their rise semantics. Alternative, unmeasured: `low ÷ G` from `arrange.ts` (the groove level, which ignores breaks), so the visuals and the drop logic share one reference | bass-bound visuals hold for the whole drop, are calmer in breaks, and rise at the drop | saturates in the first ~5 s of a drop (soft knee or ÷ 2.5); bindings must opt in | S (`features.ts` + `SOURCE_IDS`) | body (10–30 s) mean ≥ .45 and > break on 7/7; dead < 5 % in drops |
| P2 | Section macro `energy`: a τ 3 s level of `low` + `high` against a ≥ 60 s or G reference, 0..1, rests at .5 (the donor's Presence/Intensity, done with our evidence) | scenes scale their overall intensity per section (break / build / drop), not per hit | short references flatten the sections (measured above) | S | p50 body − p50 break ≥ .2 on ≥ 6/7 drops |
| P3 | milk-sync body ← P1 (or REST ← Butterchurn's own level), keeping `HIT·kick` | MilkDrop presets get the liquid bass back, still accented on kicks | brings the presets' own flicker back: rerun the I-FL1 flash audit | S | in drops r(milk, Butterchurn's bass) ≥ .8 and r(milk, kick) ≥ .6; flash ≤ 3/s |
| P4 | Kick accent: carry the kick bins' power in the hit message (contract change) → `kickAccent` = power ÷ running kick mean; `kick` unchanged (the events stay at ≥ .5) | ghost kicks and fills read smaller, downbeats bigger: less metronome | worklet contract; the gate ratio (p10–p90 1.36–1.78) measures sharpness, not loudness, so it is not the accent | M | accent CV ≥ .2; r with the kick-band peak dB ≥ .6 |
| P5 | Audio clock `bassTime` = ∫ P1 level dt, and an eased `toggle` shape | motion speed follows the bass | none | S | unit test; speed ∝ level |
| P6 | `band0..31`: an auto window (running p10/p90 per band), not a fixed −75..−15 dB | spectrum scenes stop depending on the master level | the look of spectrum scenes changes | S | the same p50 at −12 dB and 0 dB input |

Process for P1–P3: Tier 2 per change. The A/B runs `scratchpad/dsp-formula/sim.ts` before and after, on these 3 tracks plus the 19-track set.

## 6. Analysis view ("what the system hears")
**Contents (one panel):**
- **Rows:** stripcharts of the last 10 s (5 / 10 / 30 s selectable), 60 samples/s:
  - kick, snare, hats as hit ticks plus their envelopes;
  - sub, reese, wobble (and P1/P2 once they exist);
  - bass, mid, treb;
  - build, drop, heat, with the `fired` / `confirmed` markers;
  - confidence.
- **Beat grid:** a vertical line at each integer `beat`, a heavier one at each `bar`, opacity = confidence.
- **Header:**
  - BPM;
  - the detected genre with the three style scores;
  - the active preset and Auto;
  - `sparse`;
  - the HUD input meter (dBFS + CLIP, `meter.ts`).
- **Optional:** the 32-band spectrum and the waveform from `audioTex`. That makes it the donor's `audio_indicators` scene, plus the beat grid.

**Cheapest build (S, ≈ 120 lines + 1 ring-buffer test):**
- One `<canvas>` in `SourcesTab.tsx`. Its rAF loop already reads every `src[id]` each frame (`SourcesTab.tsx:72–80`). Push those values into `Float32Array` rings and draw polylines.
- `beat`, `bar`, `confidence`, `build` and `drop` are already in `src`. The genre is in `store.getSnapshot().style`.
- No worklet or contract change. `fired` / `sparse` need a one-line export, or `?debug`'s `__style` can be used.

**Offline twin (exists now):**
- Run `rolldown sim.ts` once, then `node out/sim-<v>.mjs <mono.f32> 48000 <out.json>`.
- Then run `uv run … analyze.py`. It plots the same rows per track in ≈ 2 s per track, without a browser.
- To include it in `trackview`, add the sim's rows to `trackview.py`.

## Sources
- SSF audio uniforms (the donor format's public docs): https://app.synesthesia.live/docs/ssf/audio_uniforms.html
- Donor text: `donor/visual_system_2/report.md` §2 L31–88, §5 L174–215, §7 L256–300; `protocol/uniform_binding_list.txt`; `rea_evidence_bundle.json` record 41 (demangled: `scratchpad/dsp-formula/appengine_procs.txt`); `scenes/release/audio_indicators.synScene/{main.glsl, script.js}`.
