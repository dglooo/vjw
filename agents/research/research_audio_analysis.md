# Research: audio analysis (BPM/onset libs, analysis node, algorithms, bands, latency, multichannel)

## TL;DR
- No permissive JS library gives **real-time BPM + beat phase**. `realtime-bpm-analyzer` (Apache-2.0, AudioWorklet) emits integer BPM candidates only, with no beats or phase. `web-audio-beat-detector`, `@audio/beat`, `music-tempo` and `bpm-detective` analyse whole buffers offline. Meyda (MIT) extracts features, including spectral flux, but has had no commits since 2024-04.
- **Copyleft, do not import:** essentia.js **AGPL-3.0**. aubiojs is labelled MIT, but it compiles **aubio (GPL-3.0-or-later)** into its build. BTrack **GPL-3.0**. projectM **LGPL-2.1**. audioMotion-analyzer **AGPL-3.0**. pitchfinder **"GNU v3"**. madmom models are **CC BY-NC-SA 4.0**.
- AnalyserNode: Blackman window, then FFT, then per-read smoothing; the data carries no timestamp. AudioWorklet: 128-frame quanta, and `currentFrame` gives sample-accurate times. SharedArrayBuffer needs COOP `same-origin` plus COEP `require-corp`/`credentialless`, which Vite sets via `server.headers`.
- ±1 BPM at 128 BPM is ±0.78%, about 5× tighter than the field's Acc1 metric (±4%). A 512-hop onset function at 48 kHz quantises the lag to about 2.9 BPM at 128 BPM (derived). BTrack uses a 5.9 s window and a 2-BPM tempo grid.
- Butterchurn bands are 20–320 / 320–2800 / 2800–11025 Hz, each divided by a ~4 s running average (1.0 = "normal"). Estimated line-in lag (derived, display ⚠️) is about 30–60 ms with no smoothing. Chromium on macOS opens any input with >2 channels as stereo.

## Freshness
- **Date:** 2026-10-27. There is **no `./donor/` directory**, so all research is web-only. Nothing was run in a browser.
- **Checked today:** npm registry for every package listed; GitHub via API, atom feeds and raw files; bundle sizes from bundlephobia (min/gzip); Chrome stable 156.0.8078.48, released 2026-10-20 (chromiumdash); Chromium `main` files `mac/audio_manager_mac.cc`, `apple/audio_low_latency_input.cc` and `base/limits.h`; Web Audio spec ED; MDN browser-compat-data `main`.
- **Prior work:** builds on `_adhoc/audio_capture_feasibility_2026-10-27.md` §1 (constraints, stereo) and §6 (analyser smoothing, `latencyHint`, jefftk measurements), and does not repeat them.

## §1 BPM / onset / beat libraries
| Lib | SPDX | Latest (date) | Last commit | Verdict | Size min/gz | RT vs offline | Mode |
|---|---|---|---|---|---|---|---|
| web-audio-beat-detector | MIT | 8.2.39 (2026-08-26) | 2026-08-30 (dep bump) | maintained (mostly automated dep bumps) | 93.0 / 26.1 kB (incl. worker) | **offline**: `analyze(AudioBuffer)` → BPM; `guess()` → rounded BPM + first-beat offset; default range 90–180 | import-as-dep |
| realtime-bpm-analyzer | Apache-2.0 | 5.0.16 (2026-10-16) | 2026-10-23 | active | 22.6 / 6.1 kB | **real-time**, AudioWorklet; `bpm` event every ~1–2 s, plus `bpmStable` | import-as-dep |
| @audio/beat (audiojs; was `beat-detection`, now deprecated) | MIT | 3.1.0 (2026-10-17); created 2026-07-08 | 2026-09-28 | active but **3 months old** | 13.7 / 4.5 kB | **offline**: takes Float32Array, mono only. Spectral-flux onsets, autocorr/comb tempo, DP `beatTrack`. Docs mark `energyOnsets` for "real-time" use | import-as-dep or copy |
| meyda | MIT | 5.6.3 (2024-04-21) | 2024-04-21 | dormant (~2.5 y) | 15.7 / 5.1 kB | per-buffer `Meyda.extract` (rms, energy, spectralFlux, centroid, chroma, mfcc, loudness…). `MeydaAnalyzer` uses deprecated **ScriptProcessorNode**. No BPM | import or copy single extractors |
| essentia.js | **AGPL-3.0** ❌ | 0.1.3 (2021-06-24) | 2022-07-19 (default branch) | dormant | WASM 1.99 MB + glue 2.56 MB | README: "real-time and offline" | **excluded (spec §6)** |
| aubiojs | wrapper MIT, bundles **aubio GPL-3.0+** ❌ | 0.2.1 (2022-11-08) | 2023-08-17 | dormant | ~209 kB JS (WASM inlined) | real-time per hop: `Tempo.do(buf)`, `getBpm()` | **excluded** |
| music-tempo | MIT | 1.0.3 (2017-06-17) | 2020-03-15 | abandoned | 13.9 / 4.5 kB | **offline** BeatRoot (Dixon 2001): tempo + beat times | reference / copy |
| bpm-detective | npm MIT; GitHub has no LICENSE ⚠️ | 2.0.5 (2021-07-26) | 2021-07-26 | abandoned | 1.5 / 0.8 kB | **offline** AudioBuffer | reference |
| fft.js (custom FFT, e.g. in a worklet) | npm MIT; GitHub has no LICENSE ⚠️ | 4.0.4 | 2021-01-29 | stable / dormant | 4.5 / 1.8 kB | n/a | import-as-dep |

- **realtime-bpm-analyzer** ([how-it-works](https://www.realtime-bpm-analyzer.com/guide/how-it-works), [repo](https://github.com/dlepaux/realtime-bpm-analyzer)): optional 200 Hz lowpass → threshold peaks (scan 0.90→0.20, 0.25 s skip) → intervals to the next 9 peaks, folded to 90–180 and **rounded to integer BPM**. The `confidence` field "remains 0". Needs ~10 s at 90 BPM minimum, "20+ seconds" recommended. The README adds a "commercial licensing inquiries" contact next to Apache-2.0.
- **Sources:**
  - [web-audio-beat-detector](https://github.com/chrisguttandin/web-audio-beat-detector) (uses the [Joe Sullivan](http://joesul.li/van/beat-detection-using-web-audio/) method); [@audio/beat](https://github.com/audiojs/beat) (benchmark is **synthetic** FM drums: comb-tempo Acc1 ±5% 87%, MAE 8.7 BPM).
  - Meyda [meyda-wa.ts:134](https://github.com/meyda/meyda/blob/main/src/meyda-wa.ts); [essentia.js](https://github.com/MTG/essentia.js); [aubiojs](https://github.com/qiuxiang/aubiojs) (`.gitmodules` → aubio; [aubio](https://github.com/aubio/aubio) is "GPL v3 or later"; whether the bundled binary counts as a GPL derivative is a legal question ⚠️).
  - [music-tempo](https://github.com/killercrush/music-tempo), [bpm-detective](https://github.com/tornqvist/bpm-detective), [fft.js](https://github.com/indutny/fft.js).
- **Copyleft/NC, usable only as algorithm references:**
  - [BTrack](https://github.com/adamstark/BTrack) (GPL-3.0, causal real-time C++, last commit 2025-12-31); [projectM](https://github.com/projectM-visualizer/projectm) (LGPL-2.1); [audioMotion-analyzer](https://github.com/hvianna/audioMotion-analyzer) (AGPL-3.0, spectrum analyzer).
  - [pitchfinder](https://www.npmjs.com/package/pitchfinder) ("GNU v3", pitch only); [madmom](https://github.com/CPJKU/madmom) (code BSD, **models CC BY-NC-SA 4.0**); [librosa](https://github.com/librosa/librosa) (ISC, Python).
- implication: none of the permissive options covers real-time BPM, beat phase and a sub-integer BPM together.

## §2 AnalyserNode vs AudioWorklet
- **AnalyserNode** ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode/fftSize), [spec §1.8](https://webaudio.github.io/web-audio-api/#AnalyserNode)):
  - `fftSize` is a power of 2 in 32…32768, default 2048; `frequencyBinCount` = fftSize/2.
  - Pipeline: **Blackman window (α=0.16)** → FFT → smoothing → dB. Defaults: smoothing 0.8, `minDecibels` −100, `maxDecibels` −30.
  - The data has **no timestamp**. At 48 kHz there are ~6.25 render quanta per 60 Hz frame, so rAF reads quantise event times to 16.7 ms (derived).
- **AudioWorklet:**
  - `process()` runs once per render quantum, **128 frames by default** (2.67 ms at 48 kHz). `renderSizeHint` ("default" / "hardware" / integer) is in the spec; BCD lists it for **Chrome 153, experimental** ([BCD](https://github.com/mdn/browser-compat-data/blob/main/api/AudioContext.json)).
  - `AudioWorkletGlobalScope` exposes `currentFrame`, `currentTime` and `sampleRate`, so onset times can be sample-accurate. FFT size and hop can be anything (e.g. fft.js). `getOutputTimestamp()` maps `contextTime` to `performanceTime` (Chrome 57+).
- **Getting data to the main thread** ([Chrome design pattern](https://developer.chrome.com/blog/audio-worklet-design-pattern)): MessagePort `postMessage` is "suboptimal for real-time audio processing because of repetitive memory allocation and messaging latency". The recommended alternative is a SharedArrayBuffer ring buffer with Atomics; WASM is a "perfect companion" (no JIT or GC).
- **SAB requirements:** a **secure context + `crossOriginIsolated`** ([MDN SAB](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer)); `http://localhost` counts as secure ([MDN](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts)).
- **Headers** ([web.dev](https://web.dev/articles/coop-coep)): `Cross-Origin-Opener-Policy: same-origin` plus `Cross-Origin-Embedder-Policy: require-corp` (cross-origin resources must opt in via CORP or CORS), or `credentialless` (Chrome 96+, strips credentials).
- **Vite:** set them in `server.headers` (dev) and `preview.headers` (preview), both typed `OutgoingHttpHeaders` ([docs](https://github.com/vitejs/vite/blob/main/docs/config/server-options.md)). Latest Vite is 8.3.5 (2026-10-21).
- implication: COEP also applies to every cross-origin asset (CDN presets, fonts). Same-origin assets are unaffected.

## §3 Algorithms + references
- **Spectral flux:** `odf[t] = mean_f max(0, S[f,t] − S[f,t−lag])` ([librosa onset.py](https://github.com/librosa/librosa/blob/main/librosa/onset.py), citing Böck & Widmer "superflux"). Survey: Bello et al. 2005 [doi:10.1109/TSA.2005.851998](https://doi.org/10.1109/TSA.2005.851998). Comparison of methods: Dixon 2006 "Onset Detection Revisited" [DAFx](https://www.dafx.de/paper-archive/2006/papers/p_133.pdf).
- **Adaptive threshold / peak picking** ([librosa utils.py](https://github.com/librosa/librosa/blob/main/librosa/util/utils.py); Böck/Krebs/Schedl 2012 [ISMIR](https://archives.ismir.net/ismir2012/paper/000049.pdf)). A frame `n` is a peak if all three hold:
  1. `x[n]==max(x[n−pre_max : n+post_max])`
  2. `x[n] ≥ mean(x[n−pre_avg : n+post_avg]) + delta`
  3. `n − prev > wait`

  Non-zero `post_*` means look-ahead, which adds `post·hop` of lag (derived). Per-bin normalisation: Stowell & Plumbley 2007, "Adaptive whitening…", ICMC ([pub](https://code.soundsoftware.ac.uk/publications/8); aubio's `awhitening`).
- **Tempo estimation:** autocorrelation of the onset function; a comb-filter resonator bank over 6 sub-bands (Scheirer 1998, [doi:10.1121/1.421129](https://doi.org/10.1121/1.421129)); inter-onset-interval histograms or clustering (BeatRoot, and the Sullivan method).
- **Beat phase:**
  - DP with a "tightness" penalty, offline: Ellis 2007, [doi:10.1080/09298210701653344](https://doi.org/10.1080/09298210701653344).
  - Context-dependent tracking: Davies & Plumbley 2007, [doi:10.1109/TASL.2006.885257](https://doi.org/10.1109/TASL.2006.885257).
  - PLL-like adaptive oscillators: Large & Kolen 1994, [doi:10.1080/09540099408915723](https://doi.org/10.1080/09540099408915723).
  - BTrack, causal ([BTrack.cpp](https://github.com/adamstark/BTrack/blob/master/src/BTrack.cpp)): onset buffer `(512·512)/hop` → **≈5.94 s** at hop 512 / 44.1 kHz; **41 tempo states, 80–160 BPM in 2-BPM steps**; `tightness=5`, `alpha=0.9`.
- **Accuracy conventions:**
  - Acc1 = within **4%**; Acc2 also accepts ×2, ×½, ×3, ×⅓ ([ISMIR 2004 contest](https://mtg.upf.edu/ismir2004/contest/tempoContest/node7.html)). Gouyon 2006 [doi:10.1109/TSA.2005.858509](https://doi.org/10.1109/TSA.2005.858509): ">80%" on constant tempo when the metrical level is not required.
  - EDM, GiantSteps Tempo (664 Beatport previews): state-of-the-art systems "perform poorly" relative to other datasets, partly because of annotation ambiguity. Against crowdsourced annotations they scored significantly better ([Schreiber & Müller 2018](https://ismir2018.ismir.net/doc/pdfs/220_Paper.pdf)).
- **Derived numbers for spec §7:**
  - ±1 BPM at 128 BPM is ±0.78%.
  - Lag quantisation is ΔBPM ≈ T²·(hop/fs)/60. At 128 BPM and 48 kHz: hop 512 → 2.9 BPM, 256 → 1.5, 128 → 0.73.
  - 10 s at 128 BPM is about 21 beats.
  - ⚠️ No published convergence-time figure was found for real-time trackers on EDM.

## §4 Bands + auto-gain
- **Butterchurn** (MIT; [audioLevels.js](https://github.com/jberg/butterchurn/blob/master/src/audio/audioLevels.js), [audioProcessor.js](https://github.com/jberg/butterchurn/blob/master/src/audio/audioProcessor.js), [fft.js](https://github.com/jberg/butterchurn/blob/master/src/audio/fft.js)):
  - Reads 8-bit time-domain bytes from an AnalyserNode (fftSize 1024, smoothing 0) and runs its own FFT with an equalise weight `−0.02·ln((512−i)/512)` (0 at DC, ≈0.125 at bin 511).
  - Bands: **bass 20–320 Hz, mid 320–2800 Hz, treb 2800–11025 Hz**; at 48 kHz that is bins 0–5, 6–58 and 59–233 (derived).
- **Butterchurn normalisation (its auto-gain):**
  - `val = imm / longAvg` and `att = avg / longAvg`.
  - `avg` uses rate 0.2 when rising and 0.5 when falling; `longAvg` uses 0.992 (0.9 for the first 50 frames). Rates are tuned at 30 fps and rescaled as `rate^(30/fps)`.
  - Derived time constants: avg ≈21 ms rise / 48 ms fall; longAvg ≈**4.2 s**.
  - MilkDrop guide: "1 is normal; below ~0.7 is quiet; above ~1.3 is loud" ([geisswerks](https://www.geisswerks.com/milkdrop/milkdrop_preset_authoring.html)).
- **projectM** (LGPL-2.1, reference only): linear thirds of the first half of a 512-bin spectrum, with the same 0.2/0.5/0.992 constants ([Loudness.cpp](https://github.com/projectM-visualizer/projectm/blob/master/src/libprojectM/Audio/Loudness.cpp)).
- **Other conventions:** log-spaced N bands `f_k = f_lo·(f_hi/f_lo)^(k/N)` (math); Meyda Bark bands (`numberOfBarkBands`, default 24); per-bin adaptive whitening (§3).
- **Level-independence (derived):** a ratio to a running average cancels a constant gain difference between line-in and file. Browser `autoGainControl` is a voice AGC, which spec §2.1 keeps off.
- implication: Butterchurn computes its own `bass/mid/treb` from the node it's given, independent of any app-side band split.

## §5 Latency budget (audio → visual)
| FFT N | window @44.1k | window @48k | bin width @48k | window-centre lag @48k |
|---|---|---|---|---|
| 512 | 11.6 ms | 10.7 ms | 93.8 Hz | 5.3 ms |
| 1024 | 23.2 ms | 21.3 ms | 46.9 Hz | 10.7 ms |
| 2048 | 46.4 ms | 42.7 ms | 23.4 Hz | 21.3 ms |
| 4096 | 92.9 ms | 85.3 ms | 11.7 Hz | 42.7 ms |
- **Smoothing** (applied per read, at 60 reads/s): time constant = 16.7 ms / −ln τ. τ=0.5 → 24 ms, 0.8 → 75 ms, 0.9 → 158 ms (derived).
- **Chrome macOS buffers:** input 128 frames at ≤48 kHz (2.67 ms); output default ≥256 frames (5.3 ms) ([limits.h](https://chromium.googlesource.com/chromium/src/+/main/media/base/limits.h), `ChooseBufferSize` in [audio_manager_mac.cc](https://chromium.googlesource.com/chromium/src/+/main/media/audio/mac/audio_manager_mac.cc)). Render quantum: 2.67 ms.
- **Output latency fields:** `baseLatency` covers destination → audio subsystem (spec example "(2·128)/44100 = 5.805 ms"); `outputLatency` covers buffer → device and "may change while the context is running" (spec §1.2; Chrome 58 / 102 per BCD). For file playback the analyser taps before output, so visuals lead the audible sound by ≈ `baseLatency + outputLatency` (derived).
- **Line-in estimate** (derived; display ⚠️ assumed ≥1 frame; USB ADC/driver ⚠️ unverified, varies by vendor):
  - Pipeline: capture 2.7 + window centre + rAF wait 0–16.7 + display ≥16.7 ms.
  - FFT 2048: ≈ **41–58 ms**; FFT 1024: ≈ **30–47 ms**.
  - τ=0.8 smoothing adds a ~75 ms time constant on band values; a peak-picker with `post_max = k` adds k·hop.

## §6 Multichannel getUserMedia (Chrome)
- **macOS** (Chromium `main`, `AudioManagerMac::GetInputStreamParameters`): the layout is `Guess(channels)` **only if the device reports ≤2 channels**; otherwise it falls back to **Stereo** and logs "use stereo as default". There is a `TODO(grunell): query the native channel layout`. Input opens at the device's hardware sample rate.
- **Which channels arrive (⚠️ inference):** `apple/audio_low_latency_input.cc` never sets `kAudioOutputUnitProperty_ChannelMap` (0 hits), and AUHAL's default map is identity ([Apple TN2091](https://developer.apple.com/library/archive/technotes/tn2091/_index.html)). So a >2-channel interface should deliver device channels 1–2. Verify on hardware.
- **Windows:** "At least under Chrome, the maximum channel count has been hardcoded to `2`"; in the same report `channelCount:{exact:8}` throws `OverconstrainedError` ([w3c/mediacapture-main#1021](https://github.com/w3c/mediacapture-main/issues/1021), 2024-11-22; crbug [40403559](https://issues.chromium.org/issues/40403559) needs a login, status ⚠️).
- **No channel-pair selection:** no web API picks a channel pair. Reaching inputs 3–4 needs OS- or driver-level routing (aggregate device / interface mixer ⚠️ vendor-specific).
- implication: in Chrome on macOS today, the pilot's "channels 1–2" assumption (spec §2.1) matches Chromium's behaviour as read from source.
