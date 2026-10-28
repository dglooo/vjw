# Research: audio features for flexible, genre-aware reactivity (drums, reese/sustain, HPSS, ML stems, resolution, genres, tool UIs, cost)

## TL;DR
- **Causal per-drum detection** has published numbers only on drum-only audio: Dittmar & Gärtner 2014 (NMF) reach F 0.95 at ≈6 ms delay but need per-kit templates. On full mixes, older classifiers score F 0.58–0.82 and a 2026 TCN 0.76 at ≈60 ms. No maintained, permissive kick/snare/hat transcriber runs in the browser; Meyda (MIT, dormant) gives centroid, flatness, ZCR and flux.
- **Reese:** its movement is the detuned saws' beat rate f1−f2 (≈0.3–0.6 Hz at 10 cents, derived); wobble is a tempo-synced LFO at 1/4–1/16 (2.3–11.6 Hz at 140–174 BPM, derived). Two documented primitives split a kick from a sustained bass: differential envelopes (SPL) and median-filter HPSS. No published reese detector was found.
- **HPSS:** the percussive median is within-frame; the centred harmonic median needs (L−1)/2 hops of look-ahead, 43–80 ms at hop 256 / 48 kHz (derived). No JS/WASM HPSS was found; native references are FluCoMa (BSD-3) and sevagh's code (MIT).
- **Browser stems** run today (HTDemucs on onnxruntime-web WebGPU, 126–173 MB, ~3–22× realtime), but each inference takes a 7.8 s segment, so live input would lag ≥7.8 s. The one published real-time separator, HS-TasNet (23 ms), has no official code. WebNN is still an origin trial.
- **Cost vs resolution** (measured on this M4 in V8): 16 band-pass + follower chains cost 9 µs per 128-frame quantum (0.34% of a core); an 8192 FFT every 256 samples costs 6.5%. Resolution binds first: telling 40 Hz from 60 Hz with a Blackman FFT needs N ≥ 8192 at 48 kHz (85 ms centre lag).

## Freshness
- **Date:** 2026-10-28. No `./donor/`. Sources: the web plus one local microbenchmark (Node v20.20.2 on this Apple M4, scratchpad only). Chrome stable 156.0.8078.74 ([chromiumdash](https://chromiumdash.appspot.com/fetch_releases?channel=Stable&platform=Mac&num=1)). "Last push" means GitHub API `pushed_at`.
- **npm:** onnxruntime-web 1.31.1 (2026-10-26), meyda 5.6.3 (2024-04-21), fft.js 4.0.4 (2021-01-11; already in `web/package.json`), demucs-web 1.0.2 (2025-12-01), @tensorflow/tfjs 4.22.0 (2024-10-21), @magenta/music 1.23.1 (2021-11-01).
- **Builds on** `spec_effects.md` §2.2/§5; `research_audio_analysis.md` §3–§5 and `research_editor_effects.md` §6 (not repeated); the `plan_pilot.md` S1.3/S2.1/S5.1/S5.2 drift notes (32 bands on 46.9 Hz bins, strength capped at 4.0, tempo ODF on bins 0–3, fold [90, 180)). Derived from those notes: sub (30–60 Hz) and kick fundamentals (50–80 Hz) share FFT bins 1–2 today.

## §1 Per-instrument drum detection (causal)
- **Dittmar & Gärtner, DAFx 2014** ([pdf](https://dafx14.fau.de/papers/dafx14_christian_dittmar_real_time_transcription_a.pdf)): per-frame NMF with one prior template per drum (kick/snare/hat) learned from isolated hits, then per-drum log-flux novelty with an adaptive threshold. Best F 0.95 (±50 ms) at N 2048, hop 512, 25 iterations; the VST delay measured ≈6 ms. Limits: drum-only test data (IDMT-SMT-Drums, 100–140 BPM), per-kit training.
- **Related work, as reviewed in that paper:**
  - Yoshii 2004 template matching, polyphonic: F 0.82 kick / 0.58 snare. Gillet & Richard 2004 SVMs (MFCC + spectral shape + log-energy in 6 bands at the drums' centroids): 83.9% on loops.
  - Tanghe (MIREX 2005): mean F 0.61. Paulus HMM: 0.81 loops / 0.74 polyphonic. Maximos 2012: real-time, one learned band-pass per drum → envelope → peak-pick.
- **Vogl/Dorfer/Knees, ISMIR 2016** ([pdf](https://archives.ismir.net/ismir2016/paper/000269.pdf)): 84 log bins (12/oct, 20 Hz–20 kHz) at 100 fps; peak-pick with `post_max = post_avg = 0` "allows … online". Forward RNN F 96.3% (IDMT, drum-only), 69.3% cross-dataset (ENST). Time-shift RNN 98.2% (shift ⚠️ not read). The bidirectional RNN is "not usable for real-time".
- **On mixes, ML:** a Fraunhofer TCN averages ≈60 ms detection delay with global F 0.76 on MDB Drums, 8 classes ([AES 2026](https://aes2026automotiveaudio.sched.com/event/2Nozr)); no code found ⚠️. Hats behave differently from kick and snare, having no tunable resonance ([arXiv 1903.01416](https://arxiv.org/pdf/1903.01416), via search summary).
- **Miron/Davies/Gouyon 2013** ([repo](https://github.com/SMC-LAB/drumtranscription_pd)): Pd/Max, sub-band onsets → kNN or online k-means; windows 56 ms (fast) / 136 ms ("best"); README: reliable path for kick/snare, fast path for hats. **GPL**, Pd-extended, no accuracy in the README. Mode: reference only.
- **Meyda** ([features](https://meyda.js.org/audio-features)): rms, zcr, energy, spectralCentroid, spectralFlatness (≈0 tone → ≈1 noise), spectralFlux, spectralCrest, spectralRolloff (99%), spectralSlope/Spread/Skewness/Kurtosis, loudness (24 Bark), mfcc, chroma. MIT; 5.6.3 (2024-04-21); last push 2024-07-15; **dormant**; 556 kB unpacked. Mode: import-as-dep, or copy the formulas.
- **Models: none is browser-ready, maintained and permissive.**

| Model | License | Status / runtime | Notes | Mode |
|---|---|---|---|---|
| ADTOF ([repo](https://github.com/MZehren/ADTOF)) | **CC BY-NC-SA 4.0** | last push 2025-09-18; TF, offline | 5 classes; F1 86.87 MDB / 44.95 E-GMD ([2509.21739](https://arxiv.org/html/2509.21739v2)) | — |
| ADTLib ([repo](https://github.com/CarlSouthall/ADTLib)) | BSD-2-Clause | last push 2024-04-06; Python/TF | — | — |
| OaF Drums ([page](https://magenta.tensorflow.org/oaf-drums)) | Apache-2.0 code; E-GMD CC BY 4.0 | Colab/Python only, no JS | — | — |
| Timbrica drum separator ([hf](https://huggingface.co/Faridzar/timbrica-drum-separator)) | weights **CC BY-NC-SA 4.0** | ORT-web webgpu/wasm; 3 × 19.7 MB fp16 | drum-only input, STFT 4096/1024, 11.9 s chunks; kick/snare/toms, hats = residual | vendor |

- implication: there is no off-the-shelf per-drum detector for a full DJ mix in the browser, and published causal accuracies come from drum-only audio.

## §2 Sustained bass / reese
- **Definition:** two or more detuned saws "beating" against each other, plus heavy filtering and modulation ([NI](https://www.native-instruments.com/blogs/blog/reese-bass)); the beating speeds up with pitch ([FPMS](https://futureproofmusicschool.com/blog/reese-bass-sound-design-everything-you-need-to-know)). Beat rate = f1 − f2 ([Wikipedia](https://en.wikipedia.org/wiki/Beat_(acoustics))); 10 cents → 0.32 Hz at 55 Hz, 0.64 Hz at 110 Hz (derived).
- **Wobble:** an LFO on filter cutoff, tempo-synced 1/4, 1/8 or 1/16, square/sine/saw ([Violet](https://violetrecording.com/how-to-make-a-wobble-bass/)). Rates for 1/2, 1/4, 1/8, 1/16 (derived): 140 BPM → 1.17, 2.33, 4.67, 9.33 Hz; 174 BPM → 1.45, 2.90, 5.80, 11.60 Hz.
- **Where things sit:** kick fundamental ~40–100 Hz, "punch" 100–250 Hz ([NI](https://www.native-instruments.com/blogs/blog/kick-drum-eq)); measured kick fundamentals usually 50–80 Hz, some 100–110 Hz. In DnB the bass may own the sub, with the kick given room by an EQ notch or sidechain ([Copland](https://johnnycopland.com/mixing-kick-and-bass/)); a sidechained bass dips on each kick (derived).
- **Envelope follower:** one-pole α = e^(−1/(τ·fs)), separate attack/release τ (Giannoulis/Massberg/Reiss, JAES 2012, as quoted in [EP3588776B1](https://patents.google.com/patent/EP3588776B1); original ⚠️ not read). Tracking an 11.6 Hz LFO (period 86 ms) needs release τ well below 86 ms (derived).
- **Modulation rate:** modulation-spectrum features take the DFT of per-band loudness envelopes. Rhythm Patterns use 60 modulation frequencies × 24 critical bands; fluctuation strength peaks near 4 Hz and falls toward 15 Hz ([TU Wien](https://www.ifs.tuwien.ac.at/mir/audiofeatureextraction.html)). At hop 256 / 48 kHz the envelope runs at 187.5 frames/s; an ACF over ≥2 periods of the slowest rate needs ≥1.7 s for 1/2-notes at 140 BPM (derived).
- **Movement inside the band:** band-limited flux, or the oscillation of the spectral centroid (Meyda's centre of gravity). A feed-forward comb has notches spaced fs/K = 1/delay ([Wikipedia](https://en.wikipedia.org/wiki/Comb_filter)), and a swept phaser/flanger moves them; no published detector for this was found ⚠️.
- **Splitting a kick from a sustained bass:**
  - Differential envelopes: the SPL Transient Designer subtracts a slow-attack follower from a fast one; level-independent, no threshold ([review](https://barryrudolph.com/mix/transient.html)).
  - HPSS (§3): a kick is a vertical ridge, a sustained reese a horizontal one. Fitzgerald notes "the attack of the bass has been captured by the percussive part".
  - Kick shape: a strong vertical head transient, then a slowly falling centre frequency in the tail (TR-808, Dittmar 2014 §5.3).

## §3 HPSS in real time
- **Fitzgerald, DAFx 2010** ([pdf](https://www.audiolabs-erlangen.com/resources/aps-w23/papers/2010_FitzGerald_HarmonicPercussiveSep_DAFx.pdf)): a median over time per bin gives H, over frequency per frame gives P; masks binary or Wiener `H^p/(H^p+P^p)`. Settings: FFT 4096, hop 1024, 44.1 kHz, median length 17 for both (15–30 similar). ≈2× faster than Ono's iterative method (30 iterations); Ono's real-time sliding-block version is cited as ref [6].
- **Latency (derived):** the median is centred, `y(n) = median x(n−k … n+k)` with k = (l−1)/2, so H needs k hops of look-ahead: 8 × 1024 = 186 ms (Fitzgerald); 348 ms (librosa `kernel_size=31`, hop 512 at 22.05 kHz); at hop 256 / 48 kHz, l = 17 → 43 ms and l = 31 → 80 ms. P is within-frame, and a past-only harmonic median adds no look-ahead.
- **Driedger/Müller/Disch, ISMIR 2014:** a `margin` parameter plus a residual (HPR); librosa `hpss(kernel_size=31, margin=1.0)` (ISC, Python, offline; [decompose.py](https://github.com/librosa/librosa/blob/main/librosa/decompose.py)).
- **Implementations** (none in JS/WASM ⚠️):

| Project | License | Last push | Facts | Mode |
|---|---|---|---|---|
| FluCoMa `hpss` ([ref](https://learn.flucoma.org/reference/hpss/)) | BSD-3-Clause | 2026-10-15 | Max/Pd/SC; harm/percFilterSize, soft or binary masks; latency ⚠️ not stated | reference |
| sevagh/Zen ([repo](https://github.com/sevagh/Zen)) | MIT per README; GitHub detects no LICENSE | 2023-12-22 | CUDA; "sliding causal STFT"; 174 µs per 256-hop on GPU | reference |
| sevagh/Real-Time-HPSS ([repo](https://github.com/sevagh/Real-Time-HPSS)) | MIT | 2021-09-09 | MATLAB/Python; README calls the Python version "buggy" | reference |
| tachi-hi/HPSS ([repo](https://github.com/tachi-hi/HPSS)) | MIT | 2026-03-02 | C++ (Boost + FFTW), Ono/Tachibana method | port |

## §4 ML separation in the browser
- **Demucs** ([adefossez/demucs](https://github.com/adefossez/demucs)): MIT code, weights' license "not clear"; v4.1.0 dated "11/07/2026" in the README (format ⚠️); last push 2026-10-26. The maintainer is "not actively working on Demucs anymore"; facebookresearch/demucs is archived (2024-04-24). HTDemucs: SDR 9.00 dB, segment limit **7.8 s**, CPU ≈1.5× track duration, `_ft` 4× slower. README: "Neutone provides a realtime Demucs" (third party; latency ⚠️).
- **Browser ports:**
  - monteslu/htdemucs-web-onnx ([hf](https://huggingface.co/monteslu/htdemucs-web-onnx), MIT): ORT-web WebGPU, 21 chained pieces, fp16-mixed 126 MB (fp32 173 MB), input 343,980 samples (7.8 s). 10–30 ms GPU per piece; ≈22× realtime back-to-back, ≈8× paced; the UI held 30 fps on a Radeon RX 7600.
  - bakkot/demucs-js ([repo](https://github.com/bakkot/demucs-js)): "about 3x realtime" on WebGPU; license NOASSERTION; last push 2025-10-07. demucs-web ([repo](https://github.com/timcsy/demucs-web)): MIT, npm 1.0.2, EPs `webgpu` → `wasm`.
  - sevagh/free-music-demixer ([repo](https://github.com/sevagh/free-music-demixer)): Demucs on WASM, MIT, **archived** 2025-04-26. olilarkin/free-music-demixer ([repo](https://github.com/olilarkin/free-music-demixer)): Open-Unmix UMX-L quantised 425 → 45 MB, up to 4 GB RAM; MIT; 2023-07-19.
- **Spleeter** ([repo](https://github.com/deezer/spleeter)): MIT, TensorFlow, 2/4/5 stems, "100x faster than real-time" on GPU; last push 2026-06-18; no TF.js port mentioned. **Open-Unmix** ([pypi](https://pypi.org/project/openunmix/)): MIT, 3-layer BLSTM, "cannot be used in an online/real-time manner"; a unidirectional model needs its own training; last push 2024-06-17.
- **HS-TasNet** (L-Acoustics, ICASSP 2024, [arXiv](https://arxiv.org/abs/2402.17701)): 23 ms latency; SDR 4.65, or 5.55 with extra data; ≈4 ms inference on 4 CPU cores within an 11 ms hop; the Small variant runs on 1 core. Unofficial lucidrains/HS-TasNet is MIT (2026-10-13); pretrained weights ⚠️ unverified.
- **Runtimes:** onnxruntime-web is MIT, 1.31.1, 150 MB unpacked (WASM binaries). WebNN: chromestatus "Proposed", origin-trial stage from desktop M147 ([chromestatus](https://chromestatus.com/feature/5176273954144256); [Phoronix](https://www.phoronix.com/news/Chrome-146-Beta) reports it in the 146 beta); CoreML backend ⚠️. Native DJ apps (Serato Stems, djay Neural Mix, rekordbox) separate in real time but publish no latency ⚠️ ([dj.studio](https://dj.studio/blog/stem-separation-djs-methods-metrics)).
- implication: on live line-in, browser stems are either ≥7.8 s behind (HTDemucs needs a full segment, derived) or need a causal model trained or ported by us (HS-TasNet class).

## §5 Resolution vs latency (512–4096 at 48 kHz are in audio §5)
| FFT N | window @44.1k / 48k | bin @44.1k / 48k | centre lag @48k |
|---|---|---|---|
| 4096 | 92.9 / 85.3 ms | 10.77 / 11.72 Hz | 42.7 ms |
| 8192 | 185.8 / 170.7 ms | 5.38 / 5.86 Hz | 85.3 ms |
| 16384 | 371.5 / 341.3 ms | 2.69 / 2.93 Hz | 170.7 ms |
- **AnalyserNode `fftSize`:** a power of two, 32–32768, default 2048; "large FFT sizes can be costly" ([spec](https://webaudio.github.io/web-audio-api/#dom-analysernode-fftsize)).
- **Two equal tones** separate when Δf ≥ the window's −6 dB width: Hann 2.00 bins, Blackman 2.30 bins (derived numerically). 40 vs 60 Hz with Blackman → bins ≤ 8.7 Hz → N ≥ 5,520 at 48 kHz, i.e. 8192.
- **CQT:** N_k = Q·fs/f_k, so the duration Q/f_k is independent of fs ([Wikipedia](https://en.wikipedia.org/wiki/Constant-Q_transform)); Q = 1/(2^(1/b)−1) for b bins/octave (derived). At 40 / 60 Hz: b=3 → 96 / 64 ms, b=6 → 204 / 136, b=12 → 420 / 280, b=24 → 853 / 569 ms. Fast variants: Brown & Puckette 1992 (kernel), Schörkhuber & Klapuri 2010 (octave-wise downsampling).
- **IIR band split (derived):** DC group delay of a 2nd-order Butterworth LP at 60 Hz = 3.75 ms, an LR4 crossover at 60 Hz = 7.5 ms. Resonator envelope τ = 2Q/ω0 = Q/(π·f0) ([Wikipedia](https://en.wikipedia.org/wiki/Q_factor)): 50 Hz Q 1.4 → 8.9 ms, Q 4 → 25.5 ms; 150 Hz Q 1.4 → 3.0 ms.
- **Options:** a second AnalyserNode (fan-out), still polled at rAF; or a worklet running two FFT sizes (e.g. 512 full-band + 4096/8192 for the lows) or a biquad bank (costs in §8).
- implication: below ~100 Hz, frequency resolution costs tens of ms of window (FFT/CQT); IIR splits cost single-digit ms but separate bands less sharply.

## §6 Genre defaults and the octave problem
| Genre | Tempo, feel (source) |
|---|---|
| DnB | 160–180, "typically 165–185", mid-170s hallmark ([wiki](https://en.wikipedia.org/wiki/Drum_and_bass)); 174 felt and often detected as 87 ([mixgraph](https://www.mixgraph.io/glossary/half-time), commercial glossary) |
| Dubstep | 132–142; clap/snare "every third beat in a bar" ([wiki](https://en.wikipedia.org/wiki/Dubstep)), i.e. a half-time feel (~70) |
| Techno / House / Trance | 120–150 ([wiki](https://en.wikipedia.org/wiki/Techno)) / 115–130, four-on-the-floor ([wiki](https://en.wikipedia.org/wiki/House_music)) / 125–150, newer 120–135, 16/32-beat phrases ([wiki](https://en.wikipedia.org/wiki/Trance_music)) |
| Trap / hip-hop | half-time 50 (100) to 88 (176), typically 70 (140) ([wiki](https://en.wikipedia.org/wiki/Trap_music)); general hip-hop range ⚠️ not found |
- **Band layouts in tools:** Butterchurn 3 (audio §4); Synesthesia bass/mid/midhigh/high (editor §6); Resolume L/M/H; TouchDesigner Low/Mid/High + Kick/Snare/Rythm (§7) and the Audio Band EQ CHOP, 16 bands 25 Hz–22 kHz ([doc](https://derivative.ca/UserGuide/Audio_Band_EQ_CHOP)). Synesthesia and TD-palette band edges ⚠️ undocumented.
- **Octave errors:** estimators err by small known factors (×2, ×3, ½…). Schreiber & Müller 2014 correct the octave from a global feature, mean spectral novelty ([pdf](https://www.audiolabs-erlangen.com/content/05_fau/professor/00_mueller/03_publications/2014_SchreiberMueller_TempoEstimation_ICASSP.pdf)); a supervised correction follows in ISMIR 2017 ([pdf](https://archives.ismir.net/ismir2017/paper/000137.pdf)).
- **DJ software:** a user-set analysis BPM range — Traktor Analyze Options → BPM Range ([NI](https://support.native-instruments.com/support/solutions/articles/69000879523-the-track-bpm-detected-by-traktor-is-half-or-twice-the-original-bpm-of-the-track)); Serato "selecting the correct range will help to avoid half or double BPM" ([Serato](https://support.serato.com/hc/en-us/articles/14361435885327-Analysis-setting), search snippet; page 403). Engine DJ users report 87/174 loads ([forum](https://community.enginedj.com/t/track-bpm-being-loaded-as-either-87-or-174/34202)); ×2/÷2 keys fix stragglers.
- **Our CP5 fold [90, 180)** (plan S5.1): 174 → 174, 85 → 170, 70 → 140. Derived: DnB/jungle at 180–185 → 90–92.5; hip-hop at 86–89 → 172–178.

## §7 How flexible tools expose this (beyond editor §6: Resolume, VDMX, Synesthesia uniforms, MilkDrop, hydra)
- **TouchDesigner:**
  - audioAnalysis palette ([doc](https://docs.derivative.ca/Palette:audioAnalysis)): outputs Low/Mid/High, spectral centroid, Smp/Fmp (slow/fast-moving partials), Kick, Snare, Rythm. Per band Threshold/Smooth/Gain/Add; Kick/Snare/Rythm Threshold. Band edges and internals undocumented.
  - Audio Spectrum CHOP: FFT 64–16384 (default 8192, 2048 suggested), log or linear output, high-frequency boost ([doc](https://docs.derivative.ca/Audio_Spectrum_CHOP)).
  - Trigger CHOP: up/down thresholds, retrigger delay, min length, multi-trigger ignore/add/restart, delay + ADSR with peak level/length, 4 curve shapes each ([doc](https://docs.derivative.ca/Trigger_CHOP)).
  - Tutorial patterns ([IIHQ](https://interactiveimmersive.io/blog/touchdesigner-operators-tricks/using-pops-to-drive-audio-reactive-visuals/)): Band EQ → Envelope per band; transients = Spectrum → math → trail → threshold → trigger.
- **Synesthesia:** user audio settings are the device only (first input, channels summed, no channel select; [FAQ](https://app.synesthesia.live/docs/faq/audio.html)). Pro adds Reactivity (global sensitivity) and Audio Speed ([controls](https://app.synesthesia.live/docs/manual/controls.html)). No band editing is documented.
- **Resolume:** each parameter's FFT source has only Gain and Fall (no attack, no threshold); In/Out points are not saved in presets ([doc](https://resolume.com/support/en/parameter-animation)).
- **Magic Music Visuals:** proprietary, Windows/macOS; "nearly all editable parameters can be driven by multi-channel audio" ([wiki](https://en.wikipedia.org/wiki/Magic_Music_Visuals)); audio is set in the Input Sources window ([forum](https://magicmusicvisuals.com/forums/viewtopic.php?p=6735)). Module/parameter names ⚠️ unverified (the guide sits behind a bot check).
- **Kaleidosync:** drives visuals from Spotify's precomputed analysis (beats, bars, sections, segments, tatums), not live audio ([repo](https://github.com/SourceAura/kaleidosync)). Spotify closed Audio Analysis/Features to new apps on 2024-11-27 ([Spotify](https://developer.spotify.com/blog/2024-11-27-changes-to-the-web-api)).
- implication: user-placed bands with per-band threshold and attack/release exist in node tools (VDMX, TouchDesigner); kick/snare outputs appear only as TD palette thresholds; no surveyed tool documents genre presets ⚠️.

## §8 CPU/GPU cost (AudioWorklet, M4)
- **Budget:** a 128-frame quantum lasts 2.67 ms at 48 kHz (the spec's default render quantum); hop 256 means one FFT every second quantum, 187.5 per second.
- **Measured** with scratchpad `bench/bench.mjs` (V8 in Node v20.20.2 on this Apple M4; 20 s of white noise at 48 kHz; loop shaped like `process()`; run after warm-up):

| Workload | Cost | Share of one core |
|---|---|---|
| 8 / 16 / 32 bands × (two cascaded RBJ band-pass biquads + attack/release follower + slow follower) | 4.1 / 9.0 / 18.5 µs per quantum | 0.15 / 0.34 / 0.69% |
| radix-2 FFT + Hann + 16-band log-flux at hop 256: N = 512 / 1024 / 2048 / 4096 / 8192 | 18 / 38 / 79 / 165 / 347 µs per hop | 0.34 / 0.71 / 1.5 / 3.1 / 6.5% |

- **Published:** fft.js README `realTransform`: 4096 at 21,841 ops/s (≈46 µs), 8192 at 9,665 ops/s (≈103 µs); machine unstated ([repo](https://github.com/indutny/fft.js)).
- ⚠️ Node 20's V8 is older than Chrome 156's and runs on a normal thread, so this is not a Chrome AudioWorklet measurement. JS vs WASM in worklets: Chrome's article argues against JIT/GC overhead only qualitatively ([Chrome](https://developer.chrome.com/blog/audio-worklet-design-pattern/)); no biquad benchmark was found.
- **Overload monitor:** `AudioContext.playbackStats` (`underrunEvents`, `underrunDuration`, updated once per second), Chrome 146+, experimental ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/AudioPlaybackStats); BCD `api/AudioContext.json`).
- **GPU:** worklet detectors use none (derived). ML separation on WebGPU shares the GPU with rendering: a monolithic HTDemucs inference is a 200–330 ms GPU burst; chained pieces take 10–30 ms each (§4, monteslu).
