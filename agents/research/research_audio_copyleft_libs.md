# Research: any-license real-time beat / tempo / phase libs (+ visual libs, MIDI clock, latency)

## TL;DR
- Three candidates give a **causal beat grid with phase** in a browser today:
  - **beatfinder** (MIT): a main-thread `setTimeout` grid nudged by realtime-bpm-analyzer peaks. BPM is an integer.
  - **BeatTrackerJS**, a JS port of madmom online. The README says MIT but there is no LICENSE file, and the **models are CC BY-NC-SA 4.0**. Its own doc reports a 20–25 s warm-up.
  - **aubiojs `Tempo`** (bundles **GPL** aubio): a beat flag per hop, float BPM and a confidence. No phase or last-beat getter is bound to JS.
- **BTrack** (GPL-3.0) has no JS/WASM port. **BeatDetektor** (MIT, 2012) gives 0.1-BPM resolution, but its beat counters run free with no phase lock. **essentia.js** (AGPL-3.0) is standard-mode only: `OnsetDetection`, `TempoTap` and `TempoTapTicks` are frame-wise, while the beat trackers and BPM estimators take the whole signal.
- No candidate has published evidence for spec §7 "±1 BPM within ~10 s". BeatTrackerJS misses the 10 s mark by its own numbers. beatfinder's only test is a synthetic click track that must land within 2 BPM after 22 s.
- **Visuals:** audioMotion is Canvas2D only; projectM's FBO target exists only in unreleased 4.2.0. **Sync:** rekordbox does Link; a native rekordbox MIDI-clock output is unconfirmed ⚠️. A web page cannot join Link (UDP multicast).

## Freshness
- **Date:** 2026-10-27. No `./donor/` directory exists. Nothing was run in a browser; behaviour claims come from reading source, at the cited lines.
- **Checked:**
  - npm tarballs: `aubiojs` 0.2.1, `essentia.js` 0.1.3, `realtime-bpm-analyzer` 5.0.16, `beat-grid` 0.1.0, `beat-tracker` 1.0.3.
  - GitHub API and raw files: beatfinder @`a5294992`, BTrack 1.0.7, aubio master, BeatDetektor, BeatTrackerJS, audioMotion 4.5.4 / 5.0.0-beta.0, projectM master and v4.1.8.
  - Specs: Web Audio `index.bs` (main) and the Web MIDI ED.
- Builds on `research_audio_analysis.md` §1, §3, §5 and `research_donor_milkdrop.md` §5, §7 without repeating them. Per the lead, the user has lifted spec §6's permissive-only rule; copyleft and NC licenses are still flagged.

## §1 aubiojs (aubio → WASM)
- **Identity:** npm 0.2.1 (2022-11-08). Last commit 2023-08-17. 10 open issues, 174★. **Dormant.** Mode: import-as-dep. **License:** the repo says MIT, but it compiles aubio's C sources (`CMakeLists.txt`), and `index.d.ts` carries aubio's **GPL-3.0-or-later ⚠️** header. **Size:** ESM 208.6 kB with a 115 kB WASM inlined as base64; 70.8 kB gzip (measured). https://github.com/qiuxiang/aubiojs
- **API** (`src/tempo.cc`, `src/onset.cc`, `index.d.ts`): `const { Tempo, Onset, Pitch } = await aubio()`.
  - `new Tempo(bufSize, hopSize, sampleRate)` takes no method argument; the C++ hard-codes `"default"`, which aubio maps to `specflux`.
  - `tempo.do(buf)` reads `hopSize` samples. It returns the beat's fractional position inside this hop if a beat falls there, else 0 (aubio `tempo.c` l.87–92). A beat at fraction 0.0 is indistinguishable from no beat (derived).
  - `getBpm()` and `getConfidence()` return floats. aubio's `get_last_s`, `get_period`, `set_delay`, `set_threshold`, `set_silence` and tatum calls are **not bound**, so JS gets no beat time, period or phase.
  - `Onset`: the C++ constructor is `(method, buf, hop, sr)`, but `index.d.ts` omits `method`. Bound: `do()`, `getLast/getLastS/getLastMs`, `setThreshold`, `setSilence`, `setDelay*`, `getDescriptor`.
  - **Bug:** 9 Onset methods are registered with a trailing space (`"setAwhitening "`, `"setMinioi "`, …). The names are present in the 0.2.1 WASM, so `onset.setMinioi()` is undefined from JS.
- **AudioWorklet: ⚠️ unverified.** The build is `-sMODULARIZE -sSINGLE_FILE -Oz`, with an async `WebAssembly.instantiate` of the inlined blob and no fetch. Environment detection tests `window` and `importScripts`; a worklet has neither, so the code takes the "shell" branch (derived).
  - Issue #20, "Import to AudioWorkletProcessor" (2023), is open with no reply.
- **aubio upstream:** GPL-3.0. Release 0.4.9 (2019-02-27); last commit 2026-04-10; 160 open issues. **Maintenance-only.** The algorithm is Davies & Plumbley's causal, context-dependent tracker:
  - The window is `winlen = next_pow2(5.8·sr/hop)`, re-estimated every `winlen/4` hops (`tempo.c` l.188–190). The autocorrelation is Rayleigh-weighted around 120 BPM (`beattracking.c` l.65).
  - Quadratic peak interpolation makes BPM a float (`beattracking.c` l.177, 321, 430–433).
  - **Derived:** the window is 5.94 s at 44.1 kHz but **10.92 s at 48 kHz** for any power-of-two hop. Re-estimation runs every 1.49 s and 2.73 s respectively.
- **Accuracy:** no aubio MIREX figure was found ⚠️. Davies, Brossier & Plumbley (AES 2005) call the causal version weaker than their non-causal one (https://aubio.org/articles/davies05aesbeattracking.pdf; ⚠️ from the abstract and a search summary).

## §2 essentia.js
- **Identity:** **AGPL-3.0 ⚠️.** npm 0.1.3 (2021-06-24). Last commit on master 2022-07-19, on `dev` 2024-06-12. 49 open issues. **Dormant.** Mode: import-as-dep. https://github.com/MTG/essentia.js **Size:** WASM 1.99 MB (539 kB gzip, measured) + `essentia.js-core.es.min.js` 43 kB. The single-file `essentia-wasm.es.js` is 2.56 MB.
- **Exposed algorithms:** all 202 in `core_api.d.ts` link to `std_` pages, so this is **standard mode only**, with no streaming mode.
  - Beat and tempo: RhythmExtractor2013/RhythmExtractor, BeatTrackerMultiFeature/Degara, TempoTap, TempoTapTicks, TempoTapDegara, TempoTapMaxAgreement, PercivalBpmEstimator, LoopBpmEstimator, NoveltyCurve(FixedBpmEstimator).
  - Onsets: OnsetDetection(Global), OnsetRate, SuperFluxExtractor/Novelty/Peaks.
- **Frame-wise** (per the doc strings):
  - `OnsetDetection(spectrum, phase, method)` returns one onset-function value per frame; you write the peak picking.
  - `TempoTap(featuresFrame, …)` "requires to be sequentially run … for each particular audio frame" and returns period and phase candidates. `TempoTapTicks(periods, phases)` turns those into ticks.
- **Whole-signal** (they take `signal`): RhythmExtractor2013 (beats, BPM, confidence; `degara` gives confidence 0), BeatTracker*, Percival, LoopBpm, SuperFluxExtractor, OnsetRate. TempoTapDegara runs 6 s frames with a 1.5 s step. implication: live use means re-running them on a sliding buffer.
- **TempoCNN:** `essentia.js-model` provides only the `'tempocnn'` input extractor.
  - Weights, including `-tfjs.zip` files (deeptemp-k4 is 104 kB), are at https://essentia.upf.edu/models/tempo/tempocnn/.
  - Metadata: input `[256, 40]` mel at 11,025 Hz; softmax over 256 classes covering 30–286 BPM (1-BPM classes).
  - That directory's `LICENSE` is **AGPL-3.0 ⚠️**. MTG's own models are CC BY-NC-SA 4.0 **⚠️ NC** (https://essentia.upf.edu/models.html).
- **AudioWorklet: yes, documented.** The tutorial "2. Real-time analysis" imports the WASM and core into an `AudioWorkletProcessor`. Real-time demos: rms, melspectrogram, pitchmelodia, hpcp-chroma, autotagging. **There is no beat, tempo or rhythm demo** in master or `dev`.
- **Offline reference** (TISMIR 2020, https://transactions.ismir.net/articles/10.5334/tismir.43): Böck 2015 on GiantSteps (EDM) scores Acc1 (±4%) 58.9% (original) / 64.8% (crowdsourced) and Acc2 86.4% / 94.0%. On whether global tempo estimation is solved, the authors answer "*no*".

## §3 BTrack
- **Identity:** **GPL-3.0 ⚠️.** Version 1.0.7 and last commit both 2025-12-31. 430★. Maintained at a low cadence. Wrappers: Python (PyPI), Vamp, Max. https://github.com/adamstark/BTrack
  - **No JS/WASM port was found** (GitHub searches for "btrack wasm" and "btrack emscripten", plus a web search). Mode: vendor the source plus our own Emscripten build.
- **API** (`BTrack.h`):
  - Constructors: `BTrack()` (hop 512, frame 1024), `BTrack(hop)`, `BTrack(hop, frame)`.
  - Input: `processAudioFrame(double*)` per hop, or `processOnsetDetectionFunctionSample(double)` to feed your own onset function.
  - Output: `beatDueInCurrentFrame()` (bool per hop), `getCurrentTempoEstimate()` (double), `setTempo`/`fixTempo`/`doNotFixTempo`, and the static `getBeatTimeInSeconds(frame, hop, fs)`. There is no phase or next-beat getter.
- **Tempo quantisation** (`BTrack.cpp`): `beatPeriod = round(60·44100/(bpm·hop))` (l.435) and `estimatedTempo = 60/((hop/44100)·beatPeriod)` (l.438). **44100 is hard-coded** (l.375, 435, 438).
  - Derived: at hop 512, 128 BPM is 40.4 hops, which rounds to 40, so it reports 129.2 BPM. At 48 kHz input the reported tempo is scaled by 44100/48000 unless resampled ⚠️ (not run).
- **What an Emscripten build needs:** `BTrack.cpp`, `OnsetDetectionFunction.cpp`, `CircularBuffer.h`, Kiss FFT (bundled `libs/kiss_fft130`, `-DUSE_KISS_FFT`; license not checked ⚠️), **libsamplerate** (BSD-2-Clause, `src_simple(SRC_SINC_BEST_QUALITY)` at l.366), and a C or embind wrapper. Derived; no existing build was found.
- **Accuracy:** the DAFx-09 abstract claims the real-time model is comparable to offline methods (https://dafx.de/paper-archive/details/XiEJjIc0a2Hb_KTJon0SaA). No figures were retrieved ⚠️.

## §4 Other real-time trackers (sweep of any license)
**beatfinder** (https://github.com/MrEricSir/beatfinder, @`a52949929ada`)
- **Identity:** npm 0.1.0 (2026-09-07), **MIT**. Created 2026-09-07; last commit 2026-10-26 ("Auto-gain adjustment for loud music venues"). 0★, one author. **New and unproven.** Mode: import-as-dep or copy the single file. Demo: https://mrericsir.github.io/beatfinder/ **Size:** 26.1 kB, 8.7 kB gzip. The caller injects realtime-bpm-analyzer (rba, Apache-2.0) and Meyda (MIT).
- **The review's claims, checked against source:**
  - **Combines rba and Meyda?** Yes, but Meyda feeds only `chordChange` and `keyChange` (l.506, 547). The beat path is HP 60 Hz → LP 600 Hz biquads (l.603, 607) → rba with `continuousAnalysis`, `stabilizationTime: 10_000` and `debug: true` (l.619–623), plus a kick `AnalyserNode` at fftSize 1024 (l.616–617).
  - **Emits `peak`, `predictedBeat` and `bpmChange`?** Yes: l.310, l.230 and l.266. It also emits `downbeat` (l.234), `tempoLost` (8 s with no peak, l.346–350), `loudnessSpike`, `chordChange` and `keyChange`.
  - **Builds a phase-corrected grid?** Yes.
    - On lock it calls `scheduleBeatGrid(60000/bpm, performance.now())` (l.267).
    - For each peak within ±40% of a beat from the grid, `beatGridAnchor += phaseErrorMs * 0.25` (l.315–329): a 25% exponential-moving-average nudge to phase only. Peaks **never change the interval**.
    - The downbeat is whichever of the 4 positions has the highest kick-band RMS average (EMA) (l.199–234).
  - **Beats scheduled with `setTimeout`?** Yes, as a chained `setTimeout` on the main thread (l.250–257). Chrome throttles timers in hidden pages (https://developer.chrome.com/blog/timer-throttling-in-chrome-88).
  - **Peaks timed at receipt, not audio time?** Yes, at l.308–310 (`bpmAnalyser.on('validPeak', () => { const now = performance.now(); emit('peak');`). rba's sample `index` is ignored.
  - **Lock logic:**
    - The first reading with an rba count ≥10 (l.334) locks immediately (l.277).
    - After that, readings within 10% of the lock (`relockDrift`, l.78, 283) are discarded, and re-locks are blocked for 8 s. A ratio-suspicious re-lock needs 15 agreeing readings. BPM is folded into 70–160 (l.168–171).
    - The README says a candidate must hold for 8 s before it is considered; in the code the 8 s applies only to re-locks (l.275–279).
    - Derived: the integer BPM is never refined, so rounding error is absorbed only by the phase nudges.
- **Evidence:** The README says the defaults are "well tested on iPhones with live electronic music (think club DJs …)" but publishes no data.
  - The only test with an expected tempo is a synthetic 90 Hz click at 128 BPM. It waits 22 s and asserts `|lockedBpm − 128| < 2` after octave folding (`tests/beatfinder.spec.js` l.108–175).
  - A Record button logs audio and events from sessions; no logs are published.

**realtime-bpm-analyzer `validPeak`** (5.0.16, `dist/`)
- **Typed:** "Emitted in debug mode when a valid peak is detected", payload `{ threshold, index }` (`core/types.d.ts` l.58–62). It is posted only if `options.debug` is set (`realtime-bpm-processor.js` l.371–384).
- **Timestamp:** `index = currentMinIndex + relativeChunkPeak`, a sample count since start or reset. There is **no audio-time field**: neither `currentTime` nor `currentFrame` is read.
- **Latency:** analysis runs once per 4,096-sample chunk (l.13, 442–449), so ≥85 ms passes at 48 kHz before a message (derived).
- **Repeats:** the threshold loop runs 0.90 → 0.20 in steps of 0.05 (l.5–8, 18–26) and posts per threshold, so one transient can be posted several times (derived ⚠️). Tempos are rounded with `Math.round` (l.195).

**BeatDetektor** (https://github.com/cjcliffe/beatdetektor)
- **Identity:** JS (`js/beatdetektor.js`, 22.9 kB) and C++ (`cpp/BeatDetektor.{cpp,h}`). **MIT** per the README and file header (commit 2012-08-29, "License change to MIT"); there is no LICENSE file. The last commit was 2012-08-29 and it is not on npm, so it is **abandoned**. Mode: copy.
- **API:** `new BeatDetektor(min=85, max=169)`, then `bd.process(timer_seconds, fft_data)` per frame. The caller supplies the time and the FFT magnitudes.
- **Outputs:** `win_bpm_int` is BPM×10 (0.1-BPM resolution); `win_bpm_int_lo` is the integer BPM. `win_val` is the contest rank. The source comment says to wait for ~20–25; above 40 is "pretty much a guaranteed match". Per-range `detection[]` flags, and `modules.vis.BassKick.isKick()`.
- **Phase:** `beat_counter`, `half_counter` and `quarter_counter` advance on `bpm_timer`, which wraps every quarter-beat (`winning_bpm/4`, l.529–546). `bpm_timer` is never re-aligned to detections, so the counters are a free-running clock with no phase lock.
- **Evidence:** none published ⚠️.

**BeatTrackerJS** (https://github.com/mathigatti/BeatTrackerJS)
- **Identity:** the README says "MIT" but there is no LICENSE file; `package.json` is private, not on npm. Created 2026-07-26; last commit 2026-10-26; 2★. Mode: copy or vendor. **Models:** madmom weights, 2.79 MB; code 51 kB. madmom model files are **CC BY-NC-SA 4.0 ⚠️ NC** (https://github.com/CPJKU/madmom_models), although the README credits "madmom … BSD".
- **Pipeline:**
  - AudioWorklet, 441-sample hops → features → ensemble of 8 LSTMs → forward-only HMM (DBN), so beat tracking is causal. Downbeats come from a bidirectional LSTM in a Web Worker over a 6 s window. Cost: 1.9 ms per 10 ms hop (19% of a core).
  - Grid BPM is `60/period`, where `period` is a 0.7/0.3 moving average over the median of the last 8 inter-beat intervals (`web/src/grid.js` l.45–130). The result is a float.
- **Own measurements** (`docs/EXPERIMENTS.md`; the reference is offline madmom, not human annotation): F 0.855; **warm-up before lock 20–25 s**; inter-beat-interval std 6–10 ms once locked; BPM deviation 0.41 on one track. A classic flux + autocorrelation tracker found the right tempo but scored F 0.209 because its phase was wrong.

**Other finds**
- **Offline only:**
  - `jgorset/beatnet` (MIT wrapper; BeatNet is CC-BY-4.0): `analyze(whole 22.05 kHz buffer)` via ONNX Runtime Web, 1.6 MB model.
  - `shiwano/beat-this-onnx` (MIT; Beat This! is MIT): mel input at 20 ms per frame, beat and downbeat logits. Causality is not stated ⚠️.
  - `beat-grid` 0.1.0 (MIT) and `beat-tracker` 1.0.3 (MIT; "best with piano music").
  - `mcfredrick/beat-track-wasm` (unpublished) and `@libraz/libsonare` 1.9.1 (Apache-2.0, 18 MB; its "realtime engine" is for playback).
- **Buffer- or window-based:** `pleco-xa` 2.0.5 (MIT): Ellis DP `beat_track`, a `quickTempo` tier and a windowed `bpm` drift analyser. No causal phase tracker is documented (`docs/guides/beat.md`).
- **Onsets only:** `zz-plant/audio-reactive` (Unlicense; npm returns 404): an AudioWorklet FFT with per-band onset envelopes and a 150 ms refractory period; no BPM or phase.
- **Clock only:** `@kieransimkin/dancemoves` (**GPL-2.0-or-later ⚠️**) runs from a BPM you supply and detects nothing.
- **Not found:** JS or WASM ports of IBT, BTrack, live TempoCNN, or madmom beyond BeatTrackerJS.

## §5 Visual libs
- **audioMotion-analyzer:** **AGPL-3.0-or-later ⚠️.** Latest 4.5.4 (2026-01-09). 5.0.0-beta.0 (2026-07-19) says "DO NOT USE … IN PRODUCTION". 24 open issues, 300.8 kB unpacked. Active. Mode: import-as-dep.
  - **Canvas2D only:** `getContext('2d')` in master and develop.
  - **Our canvas:** the `canvas` option renders into one we provide. `useCanvas:false` skips drawing and still delivers `getBars()` data via `onCanvasDraw`.
  - **Own loop:** it runs its own `requestAnimationFrame` loop (src l.1208, 1766) with a `maxFPS` option, creates its own AnalyserNodes (l.286), and `connectSpeakers` defaults to true.
  - **Retina:** `pixelRatio` follows the device pixel ratio (2 on Retina); `loRes` halves it ("four times less pixels"). No performance figures are published ⚠️.
  - **Into our GL:** a per-frame `texImage2D(canvas)` upload (MDN WebGLRenderingContext/texImage2D). The cost is unmeasured ⚠️.
- **projectM** (beyond milkdrop §7):
  - It loads raw `.milk` through `projectm_load_preset_file` / `_data` (`core.h` l.108, 125); Butterchurn needs JSON conversion first.
  - In v4.1.8, `projectm_opengl_render_frame()` draws to the default framebuffer. `projectm_opengl_render_frame_fbo` is `@since 4.2.0` (`render_opengl.h` l.43–49), which is **unreleased**.
  - Emscripten can adopt an existing JS WebGL2 context via `Module.preinitializedWebGLContext` → `GL.registerContext` (`libwebgl.js` l.742–806). This is untested with projectM ⚠️.
  - The Koel build exports only init, load_preset, add_pcm, render, resize and destroy (`build.sh`): no FBO or external-context hook.

## §6 Comparison: tasks (a) reaction, (b) BPM estimation, (c) phase/grid, plus §7 evidence
| Candidate | License | Live in browser today | (a) beat/onset reaction | (b) BPM estimation | (c) phase/grid | §7 "±1 BPM in ~10 s" evidence |
|---|---|---|---|---|---|---|
| aubiojs Tempo/Onset | GPL-3.0+ ⚠️ | yes (worklet ⚠️) | `Onset.do` per hop, `getLastS` | float BPM + confidence; window 5.9 s @44.1k / 10.9 s @48k | beat flag + in-hop fraction; no period or last-beat getter | ⚠️ unverified |
| essentia.js | AGPL-3.0 ⚠️ | yes (worklet documented; no rhythm demo) | `OnsetDetection` frame-wise | Percival / RhythmExtractor2013 whole-signal; TempoCNN ≈12 s patch, 1-BPM classes | `TempoTap` + `Ticks` frame-wise; beat trackers whole-signal | ⚠️ unverified |
| BTrack | GPL-3.0 ⚠️ | no port | onset-function sample per hop | 2-BPM grid → integer-hop period (129.2 for 128 @ hop 512) | `beatDueInCurrentFrame` (causal) | at hop 512 the reported BPM can't land within ±1 of 128 (derived) |
| beatfinder | MIT (+ rba Apache, Meyda MIT) | yes (demo) | `peak` after a ≥4096-sample chunk, main-thread receipt time | integer BPM from rba; not refined within 10% | `setTimeout` grid, 25% phase nudge, downbeat by kick energy | synthetic 128: <2 BPM after 22 s; DJ sets: claim only ⚠️ |
| realtime-bpm-analyzer | Apache-2.0 | yes (worklet) | `validPeak` (debug only, sample index) | integer; ~10 s minimum, 20+ s recommended (prior §1) | none | no (integer BPM) |
| BeatDetektor | MIT | yes (JS, caller supplies FFT) | `detection[]`, `BassKick` | 0.1-BPM `win_bpm_int` + rank | free-running counters, not phase-locked | ⚠️ unverified |
| BeatTrackerJS | code "MIT" (no file); models CC BY-NC-SA ⚠️ NC | yes (demo) | causal beats; no raw onset event documented ⚠️ | float BPM from IBI median; 0.41 deviation on 1 track | causal beats + bar position + downbeat | own doc: 20–25 s warm-up, which misses 10 s |
| beatnet / Beat This! ONNX | MIT wrappers (BeatNet CC-BY-4.0) | offline API | — | offline | offline | n/a |
| pleco-xa, beat-grid, beat-tracker, libsonare | MIT / MIT / MIT / Apache | buffer-based | — | windowed or offline | offline | ⚠️ unverified |
| audio-reactive | Unlicense | yes (worklet; not on npm) | per-band onset envelopes | none | none | n/a |
| *(ref)* Böck 2015, offline | — | — | — | GiantSteps Acc1 (±4%) 58.9 / 64.8% | — | ±1 BPM (±0.78%) is stricter than Acc1 |

## §7 Sync sources (pilot is line-in only; future rig: rekordbox plus a Pioneer controller over USB)
- **rekordbox and Link:** supported (https://rekordbox.com/en/support/faq/ableton-link/). A global [LINK] button enables it, and a deck's [BEAT SYNC] becomes [LINK]. A controller's TEMPO slider can't change the Link BPM.
- **rekordbox and MIDI clock:** native MIDI Clock out is **not in the official docs ⚠️**. One forum user says rekordbox turns Link into MIDI clock (community.algoriddim.com, "Ableton link fails in 5.6.7 release") ⚠️.
- **Browser and Link: no.** Link discovers peers over UDP multicast `224.76.78.75:20808` (Ableton/link `IpInterface.hpp` l.30–32).
  - Web pages have no UDP API. Direct Sockets is only for Isolated Web Apps, and multicast needs `direct-sockets-multicast` (https://developer.chrome.com/docs/iwa/direct-sockets).
  - Link is dual-licensed **GPLv2+ ⚠️** or proprietary. Native Node wrappers exist (`abletonlink` 0.2.0-beta.0, `@ktamas77/abletonlink` 1.2.3, both MIT): an Electron-only route ⚠️ (untested).
- **Browser and MIDI clock: possible.**
  - `requestMIDIAccess()` without sysex is enough. Chrome prompts for any MIDI access, rolled out from Chrome 124 (https://developer.chrome.com/blog/web-midi-permission-prompt).
  - Real-Time messages are "dispatched as they occur". The timestamp is "the time the message was received by the system" (https://webaudio.github.io/web-midi-api/).
  - F8 clock comes 24 per quarter note; also FA Start, FB Continue, FC Stop, and F2 Song Position Pointer (in MIDI beats of 6 clocks). **No message carries bar or downbeat** (https://midi.org/summary-of-midi-1-0-messages).
  - Map to audio time with `AudioContext.getOutputTimestamp()` → `{contextTime, performanceTime}`. Jitter was not researched ⚠️.

## §8 Latency notes
- **`latencyHint`** (Web Audio `index.bs`): "Identify the type of playback, which affects tradeoffs between audio output latency and power consumption … It is at the browser's discretion to interpret the number appropriately. The actual latency used is given by AudioContext's baseLatency attribute." For `interactive`: "Provide the lowest audio output latency possible without glitching. This is the default." So it is a hint about the **output** path; no spec text covers capture.
- **Measuring:** Loopback tests measure audio round-trip only, not the screen: https://jefftk.com/p/browser-audio-latency and https://superpowered.com/weblatency/.
  - Audio→screen lag needs external sensors. Reimers & Stewart 2016 (Black Box Toolkit) found audio–visual onset lag varies substantially across browsers and machines (https://link.springer.com/article/10.3758/s13428-016-0758-5; ⚠️ abstract).
  - No browser API that reports when the frame reaches the screen (photon time) was found.
