# Audio-DSP: line-in parity, line-in vs file on the same audio (2026-11-16)

## TL;DR
- **At 0 dB the line-in decodes the same signals as the file.** The test ran 19 tracks on master `905eedb`, with Chrome's fake capture device. These are the line-in and file numbers:
  - instant drop fires: 31/49 vs 32/49 hits, 15 vs 12 false;
  - autopilot cuts: 31 vs 32 hits, 11 vs 8 false;
  - lag p50 +0.40 s on both paths, and the fire-time Δ p50 is 0 ms;
  - DnB tempo-at-ref 69 % vs 72 %; genre-ok 44 % vs 44 %;
  - kick/snare/hats per bar: the p50s match within 0.2;
  - the sub + reese stream: r ≥ 0.984.

  The browser adds no processing (AGC, echo cancellation and noise suppression are off, as `input.ts:119` asks).
- **3 line-in-only gaps:**
  1. *The stream connects mid-music.* The connect makes a spike in the tempo ODF. Kanine then locks at 87 BPM (½) for the whole track in 3 of 4 line-in runs, and in 0 of 5 file-path runs. Offline fix: a 0.3 s ODF settle after the first signal. It moves the line-in DnB tempo-at-ref 69 → 77 % and the file 72 → 74 %, with +1 false fire per path.
  2. *Analyser-fed sources change timing.* The spectrum, waveform, energy levels and Butterchurn's levels are read at render time. On a file they lead the sound by base + output latency (≈ 44 ms here). On line-in they do not, so the same scene reacts 33–44 ms later on line-in.
  3. *Music after a pause saturates.* A line-in's noise floor never resets the running averages, so `sub` / `reese` / `wobble` saturate for ≈ 2 s on the first music.
- **Gain.**
  - −12 dB changes only the absolute sources (`reeseLevel`, `u:*`), which read 0.25×.
  - +6 dB clips 15–49 % of the samples. It cuts kicks by 14–46 % and moves snares and hats by up to ±100 %. The drops do not change. The genre is lost on 2 of 6 tracks.
  - The app has no input meter and no clip warning.
- **The other line/file differences are run-to-run divergence, not the path.** Another hop phase of the same file gives only 44–65 % snare agreement. The tempo and genre outcomes flip both ways: Monty genre-ok 0 → 88 % on line-in, Sandstorm 82 → 0 %.

## Freshness
- 2026-11-16, audio-dsp (Opus 5.5).
- **Code:** master `905eedb`. HEAD `e35ab7c` only adds STATE commits; `web/` is unchanged.
- **Captures:** 02:43–03:22, headless Chrome on port 5175, 6–8 runs in parallel. Frame rate 60.0–60.2/s; 0 underruns (one run had 1); every run live on its first attempt.
- **Annotations:** `scratchpad/trackview/annot.json` (49 main drops), unchanged.
- **Evidence:** in `scratchpad/dsp/`:
  - captures: `cap905/` (file), `cap905b/` (file repeat), `cap-line/{0,-12,6,0n}/` (line-in), `cap-pad/{64,128,192}/` (file with a hop-phase pad);
  - results: `replay/out/{line.txt, line.md, line.json, start.txt, start-skip.txt, silence.txt, tempo-*.txt}` and `hishift.txt`.
- **Audio:** the WAVs were deleted after the run (the tracks are copyrighted).

## Method
- **Code under test:** master `905eedb` (tempo T1 + T2 merged). `git diff 905eedb HEAD -- web/` was empty at the start and at the end. No capture was made on `91ec36d`, so no re-run was needed. Vite ran on port 5175 with a private dep cache (`scratchpad/dsp/vite-li.config.mjs`). I stopped it at the end.
- **Capture:** my harness `scratchpad/dsp/chain.mjs`, now with a line-in mode, a hit log and a clock log. It runs headless Chrome with `?debug` and the app defaults (Auto on, no pick). It holds `builtin:spectrum` and plays the whole track in real time. 6 to 8 runs went in parallel. Every run had 60.0–60.2 frames/s and 0 output underruns (one run had 1).
  - *File path:* the track is dropped as a file, as in the earlier audits.
  - *Line-in path:* Chrome runs with `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream --use-file-for-fake-audio-capture=<wav>%noloop`. The WAV is an ffmpeg decode to 48 kHz, s16, stereo, with `volume=<gain>dB`. The harness picks the input in the UI's input `<select>`, as a user does. The focus calls `allowDevices` and the fake UI grants the permission. Then it picks the first device, "Fake Default Audio Input" (id `default`), which calls `selectDevice` (`input.ts:117–125`).
  - *Track settings reported by Chrome:* echoCancellation, noiseSuppression, autoGainControl and voiceIsolation are all false; channelCount 2, sampleRate 44100, latency 0.010 s. So the constraints at `input.ts:119` work, and the browser adds no processing. The fake device runs at the context rate (44.1 kHz), so Chrome's FileSource resamples the 48 kHz WAV.
- **Alignment:** a line-in stream has no media clock. Each capture is aligned on the file capture's worklet ODF: normalised cross-correlation over ±8 s at the 5.8 ms hop, with a parabolic refinement. A second window (the last 80–20 s, searched ±0.25 s, since a looped outro matches bars off) gives the drift.
- **Replay and scoring:** `scratchpad/dsp/replay/line.test.ts` replays every capture through 905eedb's tempo → sync → style → arrange. `bad = 0` on every capture, so the replay equals the live run. Scoring uses the trackview rules (`annot.json`, 49 main drops; a hit = −0.5…+4 s). Two drop outputs are scored:
  - *inst:* `fired`, the instant fire that drives the binds and milk.
  - *cut:* `confirmed`, the autopilot cut 0.5 s later (D3′).
  - *Other metrics:* tempo at ref (± 1.05 BPM of the reference) and genre (the top genre's share of the frames; "ok" = the right genre). BPM lock = the first frame with sync confidence ≥ 0.6. Genre lock = the first frame with `detected` ≠ null. Hits = kick/snare/hats per bar (bars from the reference BPM), and the share of the file run's hits matched one to one within ±12 ms.
- **Baselines:**
  - (1) *Run-to-run:* the file path ran twice on the 6-track subset (`file` vs `file2`). Two runs of the same file can differ: the worklet's 256-sample hop can land on another phase of the audio (1 of 6 repeats did).
  - (2) *Resample control:* a 44.1 kHz WAV (`line0n`) on 2 tracks. It has no resample, so no clipped resample overs.
  - (3) *Hop-phase control:* Kanine played as a file with 64 / 128 / 192 samples of leading silence (`scratchpad/dsp/pad.sh` → `cap-pad/`).
- **Levels:** the 6-track subset (Kanine, Sub Focus, Andy C, Kritikal, Voltage, Rumble) also ran at −12 dB and +6 dB. `scratchpad/dsp/clip.py` gives the share of clipped WAV samples.

## Headline: line-in vs file
All runs replay through master's chain with `bad = 0`, so each number is the live run's own output. "fire Δt" = a fire's time minus the file run's fire within 0.5 s.

| metric | file (19) | line-in 0 dB (19) |
|---|---|---|
| instant fires: hits / 49 · first drops · false | 32 · 9 · 12 | 31 · 8 · 15 |
| autopilot cuts: hits / 49 · false | 32 · 8 | 31 · 11 |
| lag p50, instant / cut | +0.40 / +0.92 s | +0.40 / +0.91 s |
| fire Δt vs file, p50 | — | 0 ms (n 44) |
| DnB tempo-at-ref (18) · genre-ok · never classified | 72 % · 44 % · 4 | 69 % · 44 % · 5 |
| BPM lock p50 · genre lock p50 | 24.7 s · 40.4 s | 19.0 s · 30.9 s |
| K/S/H per bar, p50 over tracks | 1.07 / 1.72 / 4.15 | 1.07 / 1.91 / 4.11 |
| hits matched to the file's, p50: K / S / H | — (a file repeat: 100 % on 5 of 6) | 89 / 75 / 83 % |
| frame RMS · `low` (sub + reese) level vs file | — | +0.18 dB · −0.01 dB |
| `low` r vs file at 0 ms (worklet side) | — | 0.984–0.999 |
| `high` r vs file at 0 ms → at the best shift (analyser side) | — | 0.11–0.69 → 0.90–0.99 at 33–44 ms |
| hit arrival − stamp, p50 | 0.0 ms | 0.0 ms |

- **The +3 false fires on line-in:**
  - Bad Co 242.0 and Sub Focus 175.3 are new. 175.3 comes 4.3 s after the 171.0 alt, a 1.7 s cut.
  - Sandstorm fires on other riff stabs: file 117.3 / 139.3, line-in 29.0 / 131.2 / 153.2.
  - All 3 are the known false-fire class of the 2026-11-16 audit (bass stabs and teaser returns), so they are not a line-in class. I did not check their conf.
- **The lost hit is Kanine's first drop (44.3 s).** The line-in run's grid was at 87 BPM then (§ The stream-start spike). Not traced: a kick on a half-beat of that grid scores `align` 0, which would put the fire under minConf.

## Parity at 0 dB: 19 tracks, file vs line-in (same audio, both on 905eedb)
Rows: one per track and path. Columns:
- *drops:* hit / miss / false of the instant fires, then the autopilot cut hits / false.
- *tempo / genre:* the share of locked frames at the ref BPM; the top genre's share of the frames; the share with the right genre.
- *hits:* kick / snare / hats per bar. A line-in row adds the share of the file's hits it matches within ±12 ms.
- *locks:* the first frame with sync confidence ≥ .6 and the genre lock, in media s.

| track | path | drops h/m/f (inst) · cut h/f | tempo at ref · genre top, ok | K/S/H per bar · recall vs file | BPM lock · genre lock (s) |
|---|---|---|---|---|---|
| 1991-full | file | 1/2/0 · 1/0 | 98% · techno 56% · ok 34% | 1.54/2.03/3.89 | 5.0 · 22.9 |
| 1991-full | line0 | 1/2/0 · 1/0 | 98% · techno 56% · ok 33% | 1.54/1.99/3.90 · 90%/73%/83% | 5.5 · 23.6 |
| a-m-c | file | 0/1/1 · 0/0 | 65% · dnb 0% · ok 0% | 1.08/1.17/3.01 | 37.0 · — |
| a-m-c | line0 | 0/1/1 · 0/0 | 53% · dnb 0% · ok 0% | 1.07/1.16/3.03 · 77%/79%/81% | 36.8 · — |
| agressor-bunx | file | 3/0/0 · 3/0 | 84% · dnb 91% · ok 91% | 0.69/2.80/5.37 | 5.0 · 22.7 |
| agressor-bunx | line0 | 3/0/0 · 3/0 | 82% · dnb 91% · ok 91% | 0.66/2.78/5.32 · 78%/80%/85% | 6.1 · 23.0 |
| andy-c | file | 3/0/0 · 3/0 | 71% · dnb 46% · ok 46% | 1.23/1.32/3.32 | 51.5 · 108.5 |
| andy-c | line0 | 3/0/0 · 3/0 | 57% · dnb 46% · ok 46% | 1.20/1.40/3.31 · 89%/72%/79% | 51.8 · 108.4 |
| bad-company | file | 4/0/3 · 4/3 | 26% · dnb 50% · ok 50% | 1.87/1.72/5.03 | 79.3 · 110.4 |
| bad-company | line0 | 4/0/4 · 4/4 | 45% · dnb 50% · ok 50% | 1.89/1.65/4.98 · 87%/62%/75% | 5.9 · 110.5 |
| bicep-glue | file | 1/1/0 · 1/0 | 100% · dnb 43% · ok 43% | 1.07/0.66/3.39 | 60.5 · 130.5 |
| bicep-glue | line0 | 1/1/0 · 1/0 | 100% · dnb 43% · ok 43% | 1.07/0.66/3.37 · 100%/100%/99% | 60.5 · 130.3 |
| darude-sandstorm | file | 3/1/2 · 3/0 | 90% · dnb 82% · ok 82% | 0.74/1.48/3.27 | NaN · 40.4 |
| darude-sandstorm | line0 | 3/1/3 · 3/1 | 90% · dnb 0% · ok 0% | 0.74/1.46/3.20 · 100%/99%/97% | NaN · — |
| enei-stoned | file | 2/0/1 · 2/0 | 85% · dnb 88% · ok 88% | 1.76/4.45/7.12 | 13.9 · 28.9 |
| enei-stoned | line0 | 2/0/1 · 2/0 | 91% · dnb 88% · ok 88% | 1.76/4.46/7.07 · 100%/100%/99% | 14.2 · 28.8 |
| kanine-feel | file | 3/0/0 · 3/0 | 99% · dnb 0% · ok 0% | 1.27/1.02/3.39 | 42.8 · — |
| kanine-feel | line0 | 2/1/0 · 2/0 | 0% · dnb 0% · ok 0% | 1.24/1.09/3.39 · 95%/62%/83% | 42.8 · — |
| kanine-release | file | 0/1/0 · 0/0 | 99% · dnb 0% · ok 0% | 0.77/0.98/2.76 | NaN · — |
| kanine-release | line0 | 0/1/0 · 0/0 | 65% · dnb 0% · ok 0% | 0.80/1.00/2.68 · 93%/72%/83% | NaN · — |
| kritikal-left | file | 0/2/1 · 0/1 | 60% · dnb 87% · ok 87% | 0.95/3.33/5.12 | 5.0 · 22.6 |
| kritikal-left | line0 | 0/2/1 · 0/1 | 68% · dnb 87% · ok 87% | 0.82/3.46/5.08 · 77%/58%/66% | 5.5 · 23.3 |
| monty-grind | file | 1/1/0 · 1/0 | 48% · dubstep 29% · ok 0% | 1.57/1.56/4.15 | 21.8 · 186.3 |
| monty-grind | line0 | 1/1/0 · 1/0 | 91% · dnb 88% · ok 88% | 1.60/1.94/4.91 · 98%/83%/92% | 16.4 · 30.9 |
| napes-tokyo | file | 3/0/1 · 3/1 | 95% · dnb 92% · ok 92% | 0.97/2.50/5.16 | 3.7 · 20.7 |
| napes-tokyo | line0 | 3/0/1 · 3/1 | 94% · dnb 91% · ok 91% | 0.97/2.50/5.16 · 100%/100%/100% | 4.7 · 24.5 |
| place-2b | file | 2/0/0 · 2/0 | 51% · dnb 0% · ok 0% | 1.01/1.91/4.80 | 50.7 · — |
| place-2b | line0 | 2/0/0 · 2/0 | 55% · dnb 0% · ok 0% | 1.01/1.91/4.81 · 100%/100%/100% | 51.0 · — |
| sili-tronce | file | 0/3/1 · 0/1 | 50% · dnb 19% · ok 19% | 0.70/2.66/4.16 | 11.1 · 237.4 |
| sili-tronce | line0 | 0/3/1 · 0/1 | 67% · dnb 19% · ok 19% | 0.70/2.56/4.11 · 88%/75%/88% | 19.0 · 237.6 |
| skrillex-rumble | file | 2/2/0 · 2/0 | 70% · dubstep 83% · ok 83% | 1.15/2.32/6.34 | 9.0 · 24.6 |
| skrillex-rumble | line0 | 2/2/0 · 2/0 | 55% · dubstep 83% · ok 83% | 1.12/2.25/6.21 · 83%/67%/76% | 7.9 · 24.6 |
| sub-focus | file | 1/1/0 · 1/0 | 96% · dnb 70% · ok 70% | 1.03/0.86/3.23 | 47.4 · 61.1 |
| sub-focus | line0 | 1/1/1 · 1/1 | 98% · dnb 70% · ok 70% | 1.03/0.88/3.27 · 88%/65%/76% | 47.4 · 61.1 |
| t-i-fearless | file | 0/2/2 · 0/2 | 83% · dnb 90% · ok 90% | 1.40/4.39/4.48 | 24.7 · 24.0 |
| t-i-fearless | line0 | 0/2/2 · 0/2 | 89% · dnb 89% · ok 89% | 1.40/4.16/4.42 · 81%/84%/94% | 21.4 · 26.0 |
| voltage-godzilla | file | 3/0/0 · 3/0 | 0% · techno 52% · ok 0% | 0.67/1.14/2.36 | 25.3 · 107.2 |
| voltage-godzilla | line0 | 3/0/0 · 3/0 | 0% · techno 52% · ok 0% | 0.64/1.21/2.17 · 74%/49%/62% | 28.5 · 107.2 |

## Baseline and controls: what is path, what is run-to-run
- **A file usually replays bit-exact.** On 5 of the 6 subset tracks, `file2` matches `file` 100 / 100 / 100 % hit for hit: the media element started the audio on the same 256-sample hop phase. Andy C's repeat landed on another phase. Its hits match 85 / 60 / 69 %, and its genre-ok moved 46 → 68 %. The drop fires match on all 6 (Δt p50 0 ms). On the 5 identical runs, the tempo shares differ by ≤ 6 points: frame-timing jitter.
- **Another hop phase of the same file** (`cap-pad`: Kanine with 64 / 128 / 192 samples of leading silence, played as a file) gives these hit matches to the file run: K 94–97 %, S 44–65 %, H 82–86 %. The line-in rows show the same 62–100 % pattern. The line-in's phase is whatever its connect lands on.
  - When the line-in phase lands on the file's, the hits match 97–100 % (Napes, Enei, Bicep, Place 2b, Sandstorm).
  - So the hit-level differences come from the phase, not the line-in path. The per-bar rates hold either way.
- **44.1 kHz control** (`line0n`: no resample, so no clipped overs; Kanine + Voltage): the results match the 48 kHz runs at 0 and −12 dB almost exactly: the same Kanine ½ lock, hits 95/62/83 % vs 95/62/82 %. So the 48 kHz resample and its clipped overs change nothing measurable.
- **The masters are already clipped.** Voltage has 956,695 samples at full scale (flat factor 7.1). A 48 kHz decode overshoots +5.3 dB, so at 0 dB the s16 WAV clips 0–9.8 % of the samples. A real ADC fed this hot clips the same way.

## Gain sensitivity (6 tracks: Kanine, Sub Focus, Andy C, Kritikal, Voltage, Rumble)
Clipped samples in the WAV: −12 dB none; 0 dB 0–9.8 %; **+6 dB 14.9–49.1 %** (Voltage 49 %, Kritikal 32 %, Andy C 30 %).

| run | inst hits / 17 · false | cut hits · false | DnB tempo-at-ref · genre-ok · never (5) | K / S / H per bar p50 | hits matched K / S / H | level · `low` vs file |
|---|---|---|---|---|---|---|
| file | 12 · 1 | 12 · 1 | 65 % · 41 % · 1 | 1.15 / 1.32 / 3.39 | — | — |
| file2 | 12 · 1 | 12 · 1 | 65 % · 45 % · 1 | 1.15 / 1.32 / 3.39 | 100 / 100 / 100 % (Andy C 85 / 60 / 69) | 0.0 · 0.0 dB |
| line −12 dB | 11 · 2 | 11 · 2 | 46 % · 45 % · 1 | 1.15 / 1.32 / 3.36 | 88 / 62 / 75 % | −11.8 · −12.0 dB |
| line 0 dB | 11 · 2 | 11 · 2 | 45 % · 41 % · 1 | 1.12 / 1.40 / 3.39 | 88 / 65 / 76 % | +0.2 · −0.0 dB |
| line +6 dB | 12 · 1 | 12 · 1 | 55 % · 31 % · 3 | **0.89** / 2.14 / 3.60 | 76 / 51 / 67 % | +4.6 · +4.8 dB |

- **−12 dB breaks nothing.** The rates stay within 1 % of the file's; the onset log flux and the gate ratios do not depend on the level. Two things move:
  - the absolute sources: `low` and `reeseLevel` read −12.0 dB (×0.25), and so do the `u:*` bands (e2 × gain);
  - nothing else: the lower tempo-at-ref (46 %) is the Kanine ½ lock, which the 0 dB and 0n runs show too.
- **+6 dB (heavy clipping) breaks the drum detectors.**
  - *Kicks* fall on every track: Kanine 1.27 → 1.02, Sub Focus 1.03 → 0.87, Andy C 1.23 → 0.89, Kritikal 0.95 → 0.51, Voltage 0.67 → 0.42, Rumble 1.15 → 0.99 (−14 to −46 %). The likely mechanism (not traced): clipping flattens the kick's crest, so the 40–150 Hz gate ratio stays under `KICK` 1.35 (`drums.ts:28`).
  - *Snares and hats* move both ways: Voltage snares 1.14 → 2.36, hats 2.36 → 3.60; Andy C snares 1.32 → 0.92.
  - *The classifier* loses the genre on Andy C (genre-ok 46 → 0 %) and Voltage (techno → never classified).
  - *The drops* hold (12 / 17). The arrangement reads `low` only against its own G (`arrange.ts:13`: "only its ratios are used").
- **What a DJ needs:** the input peaking under 0 dBFS. Any level from 0 dB down to at least −12 dB gives the same detectors. The app shows neither a level nor a clip (cause 4).

## Timing: latency model and the read-ahead
- **File path.** `ctx.currentTime − audioNow` = 43.4–43.8 ms on this machine (Chrome reports baseLatency 5.8 ms and outputLatency 40.0 ms, headless with `--mute-audio`). The worklet sees each block ≈ 44 ms before the room hears it. `drain` (`app.ts:254–257`) holds the hits until `audioNow ≥ t`, and `features.at(audioNow)` (`app.ts:291`) reads the bands at the heard time. So a file hit shows on the first frame after it is heard (0–16.7 ms).
- **Line-in path.** `heard()` = audioNow + baseLatency + outputLatency (`app.ts:94`). The median gap to `ctx.currentTime` is −3.2 ms (output 41.0 ms reported), so `heard()` reproduces "the newest captured sample". Hits reach the main thread in the same render quantum that stamped them: arrival − `t` = 0.0 ms median, on both paths. They apply on arrival (`app.ts:255`), and the bands are read at `Infinity` (`app.ts:291`).
- **What the read-ahead buys.** The file's 44 ms lead only hides the output path. The app predicts nothing from it. Both paths have the same analysis delay: the 512-sample window (11.6 ms) plus the frame. The drop fires land at the same media time: fire Δt vs file p50 0 ms (§ Parity).
- **The line-in-only delay** is the capture path before the timeline: the device's input latency. The room hears the sound that much earlier. `getSettings().latency` reports 0.010 s on the fake device; a real interface reports its own. The app does not add it to the line-in phase.
- **The latency the app adds for line-in** (base + output = 46.8 ms here) is not a delay. It converts audioNow back to currentTime, but it depends on the output device's report, and the line-in has no output path. Two cases shift the line-in beat phase by the error:
  - a Bluetooth or aggregate output, which reports 100–300 ms or misreports it;
  - the first ≈ 0.3 s of output, while outputLatency reads 0 (`input.ts:86–87`).
- **Lock times are not a line-in property.** The genre lock waits for the classifier's dwell (16 s) and hold (32 s) on both paths. The p50 is in § Parity.

## Music after silence (line-in only, the real modules, `replay/silence.test.ts`)
- A paused file feeds exact zeros, so `features.ts:35–36` restarts the running averages, and so does `energy.ts:52`. A line-in's "silence" is the interface's noise floor, which is > 0, so nothing restarts. The app also does not freeze the classifier then (`app.ts:311`): the levels are relative to their own long averages, so the noise floor reads ≈ 1, never below 0.02.
- Steady music, a gap, then the same music:

| gap | silence | `sub` ≥ .9 after the return | bass level ≥ 4× after the return |
|---|---|---|---|
| 5 s | digital 0 (a paused file) | 0.00 s | 0.08 s |
| 5 s | −90 / −70 dB floor (line-in) | 1.58 s | 0.00 s |
| 30 s | digital 0 | 0.00 s | 0.08 s |
| 30 s | −90 / −70 dB floor | **2.13 s** | **1.18 s** |

- `reese` and `wobble` go through the same `relative()`, so they saturate as `sub` does. At the set start, the first average is the noise floor, so the first music saturates too.

## The stream-start spike: Kanine locks at half tempo on line-in
- **Symptom.** In 3 of 4 line-in runs (0 dB, −12 dB, 0n), Kanine's grid sits at 87.0 BPM for 94–95 % of the frames. The file path locks at 174 in 5 of 5 runs (`file`, `file2`, pads 64 / 128 / 192: 98–99 % at ref). Line-in +6 dB also locks at 174 (96 %). The cause is not the level and not the resample: the 0 dB, −12 dB and 0n runs all fail.
- **Trace** (`replay/tempo.test.ts`, `DIR=` per capture):
  - *File path:* the first reading comes at 3–5 s (172.6–174.6 BPM, c .50–.88), and the grid locks on it.
  - *Line-in:* the first reading comes at 5–6 s and says 90.9 / 90.0 (c .56–.63). The grid locks there, then walks to 87.0. Later readings say 174 at c .98 (43–47 s), but the grid keeps its octave.
  - *Why it never recovers:* Kanine is never classified, so no band change fires `snapOctave` (`app.ts:320–330`).
- **What feeds it.** The tempo ODF is the gate-ratio excess of two IIR bands (`analysis.ts:88`). From silence, the slow followers start near 0, so the first 0.5 s of signal carries 71–115 ODF units (Σ, all runs). The next 5.5 s of music carries 42. The line-in stream connects mid-music, 0.03–0.04 s into the track: its own spike is 48.6 at 0.065 s, against the file's 9.2 at 0.049 s. In the early ACF, this spike pattern decides the octave (`tempo.ts:76–100`).
- **A/B on the SAME captures** (`replay/start.test.ts`): the ODF fed to `tempo.pushOdf` is changed and nothing else; 18 DnB tracks.

| variant | file: tempo-at-ref · genre-ok · inst F · cut F | line 0 dB: the same | line −12 / +6 / 0n tempo-at-ref | ½ locks |
|---|---|---|---|---|
| base | 72 % · 44 % · 12 · 8 | 69 % · 44 % · 15 · 11 | 46 / 55 / 0 % | Kanine ×3 |
| cap the ODF at 8 | 73 % · 44 % · 13 · 9 | 69 % · 44 % · 15 · 11 | 48 / 59 / 42 % | Kanine ×2 |
| cap the ODF at 4 | 77 % · **39 %** · 14 · 10 | 78 % · 44 % · 15 · 11 | 63 / 59 / 42 % | 0 |
| **settle: ODF = 0 for 0.3 s from the first signal** | 74 % · 44 % · 13 · 9 | **77 %** · 44 % · 16 · 12 | 66 / 59 / 50 % | **0** |

- Instant hits stay at 32 on the file path in every variant. On line-in they move 31 → 32 with cap 4 and with the settle (cap 8: 31). The settle gives the same numbers at 0.3, 0.5 and 1 s.
- **Ruling input:** the settle keeps the file's genre and fixes the ½ lock. It costs +1 false fire per path. The cap at 4 lifts the file's tempo more (77 %), but drops its genre-ok to 39 %.
- **Ceiling:** the replay can only change what the tempo source receives. The onsets and hits the sync gets at the connect stay unchanged; I did not measure whether they burst.

## Causes (file:line)
1. **Two time bases on the file path; one on line-in.** The analysers tap the hub before any delay (`input.ts:22–23`): `hub.connect(analyser)` and `hub.connect(split)`. Every frame reads them at render time (`app.ts:272–277`), but a file's hits and bands wait for the heard time (T1: `app.ts:252–257`, `:291`). The analyser feeds the spectrum and waveform textures, the energy levels and bands, arrange's `high` and `total`, and Butterchurn's own levels. So on a file these lead the sound by base + output latency, and on line-in they sit at the capture time. Evidence: line-in `high` matches the file run's frame 33–44 ms earlier (§ Parity), while `low` (from the worklet) matches at 0 ms.
2. **The line-in clock follows the output device.** `heard()` = audioNow + baseLatency + outputLatency (`app.ts:94`). It equals ctx.currentTime within 3.2 ms here. But the line-in never reaches the output, and the input latency (`getSettings().latency`) is not added. The beat phase therefore shifts by any outputLatency error: a Bluetooth output, or the first ≈ 0.3 s while it reads 0 (`input.ts:86–87`).
3. **Silence = exact zero.** The running averages restart only on digital silence (`features.ts:35–36` `relative()`, `energy.ts:52`). The classifier freezes only when the levels fall under 0.02 of their own long average (`app.ts:34`, `:311`). A line-in's noise floor triggers neither, so the first music after a pause saturates `sub` / `reese` / `wobble` for ≈ 2 s (§ Music after silence).
4. **No input stage.** The hub is a fixed unity gain (`input.ts:15`). The app has no meter, no clip warning and no auto-level, and AGC is off (`input.ts:119`, correct for analysis). Most detectors do not depend on the level by construction: ratios to running averages (`features.ts:30–39`, `energy.ts:53–58`), the log flux (`onset.ts:15–17`, 51) and the kick gate ratio (`drums.ts:28`). The exceptions are absolute:
   - `reeseLevel` = raw.reese (`features.ts:117`);
   - the custom `u:*` bands = e2 × gain (`features.ts:127`);
   - arrange's silence floor, 1e-3 RMS (`arrange.ts:56`);
   - the onset log knee: bins under ≈ 1e-3 of full scale go linear (`onset.ts:15–17`).
5. **The cold-start ODF spike at a connect (line-in only in practice).** The tempo ODF = Σ max(0, gate fast/slow − 1) of two bands (`analysis.ts:88`). The slow followers (`bands.ts`, gs) sit near 0 after silence, so the first frames of a signal read ODF values of 38–55. A file starts at its own soft start, while a line-in connects mid-music. The early ACF (`tempo.ts:76–100`) picks its octave from that spike pattern, and the sync keeps the first lock's octave (§ The stream-start spike).
6. **Run-to-run divergence (both paths).** The 256-sample hop starts wherever the source's first render quantum lands (`analysis.ts` HOP, `t = (frame + BLOCK) / sampleRate`). A half-hop phase change moves individual snares and hats across their floors. The chain (tempo → genre → preset floors and bands → hits) then amplifies this into a different lock or genre on some tracks. A second play of the same file differs the same way when it lands on another phase (Andy C, 1 of 6 repeats; § Baseline).

## Fixes, ranked by gain / risk (none applied: web/ is read-only for me)
1. **ODF settle after silence** (cause 5). Size S, one guard in `tempo.ts` `pushOdf`: values within 0.3 s of the first signal after ≥ 1 s of silent ODF read 0. Offline on the same captures:
   - line-in DnB tempo-at-ref 69 → 77 %; file 72 → 74 %; genre-ok unchanged (44 %);
   - ½ locks 3 → 0; instant hits 31 → 32 (line-in); +1 false fire per path.
   - Risk: low. It needs a unit test (a cold-start spike reads 0) and the 19-track replay gate. A DJ who restarts after a pause gets the same settle.
2. **Silence = below a floor, not exact 0** (cause 3). Size S:
   - `features.ts:35–36`: restart `relative()` when x falls under a floor;
   - `energy.ts:52`: the same for the seed;
   - `app.ts:311`: also freeze the classifier when the frame RMS ≤ arrange's 1e-3.
   - Expected effect (the silence test with digital 0 as the after case): `sub` saturation after a 30 s pause 2.1 s → 0 s; bass level ≥ 4× 1.2 → 0.1 s. Risk: low. The floor knob must stay under real quiet intros; −60 dBFS RMS is the one arrange already uses.
3. **One time base for the analysers** (cause 1). Size S, `input.ts:22–23`: connect `analyser` and `split` after `recDelay` instead of the hub. `recDelay` already waits base + output for a file and 0 for line-in (`input.ts:88`).
   - Effect: a file's spectrum, waveform, energy and Butterchurn levels move ≈ 44 ms later, onto the heard time. A scene then looks the same on both paths (today line-in reacts 33–44 ms later).
   - Risk: medium. It changes the look timing of every file-driven scene, and the replay cannot test it (the analyser data are live). It needs a live A/B on a few tracks, plus the user's eye on whether the file now feels late (the display latency is ≈ 1–2 frames).
4. **Line-in clock = ctx.currentTime + the input latency** (cause 2). Size S, `app.ts:94`: for a device source, heard = `ctx.currentTime + (track.getSettings().latency ?? 0)`.
   - Gain here: +10 ms of phase lead (the fake device's latency), and no dependence on the output device's report (Bluetooth outputs).
   - Risk: low.
5. **An input meter + clip light in the HUD** (cause 4). Size M, Tier 2 UI; the backlog's meter strip.
   - The detectors are the same from 0 dB down to at least −12 dB. At +6 dB (15–49 % of the samples clipped) the kicks fall 14–46 % and the genre is lost on 2 of 6 tracks. So the only rule a DJ needs is "keep the peak light off".
   - Not an auto-gain stage: the running averages already normalise the level, and an AGC would pump them.
   - Optional: scale `reeseLevel` and `u:*` by the input's long-term RMS, so they read the same at any gain (today −12 dB → ×0.25).
6. **Not a line-in fix: hop-phase robustness** (cause 6). Snare and hats at their floors, and the first tempo lock, depend on the sub-hop phase on both paths. → `agents/hardening.md`. Candidates: an octave re-check once a later reading disagrees at c ≥ .9 for ≥ 8 s (Kanine: 174 at c .98 while the grid sat at 87); and a snare/hats hysteresis around the floor.

## Ambiguous cases
- **The extra line-in false fires** (Bad Co 242.0, Sub Focus 175.3) are single runs. With 1 file repeat per track, I cannot tell a path effect from run-to-run noise. On the 6-track subset, the file and its repeat give the same counts (12 hits, 1 false), with fire Δt p50 0 ms.
- **The Kanine ½ lock** is 3 of 4 line-in runs vs 0 of 5 file runs on one track. The mechanism is traced and the settle removes it, but no other track showed it. On a live set it depends on what is playing at the connect moment.
- **The analyser lead** is measured against `high`, the ≥ 4 kHz sum. I infer the same lead for the spectrum, waveform and energy levels from the code (same `AnalyserNode`, `app.ts:272–277`), not from separate measurements.

## Not measured (the fake device cannot show it)
- A real interface's input latency and its clock drift against the output device. Here both run on one timer: drift ≤ 0.6 ms over 3–6 min.
- A 48 kHz device feeding a 44.1 kHz context through Chrome's capture resampler. The fake device ran at the context rate, and its FileSource resampled the WAV.
- A mono or one-channel feed (the worklet averages the channels, `analysis.ts:74`), a mixer's own limiter or EQ, and a live mix's transitions.
