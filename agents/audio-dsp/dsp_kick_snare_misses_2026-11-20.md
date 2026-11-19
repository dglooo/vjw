# DSP: why kicks and snares are missed on real tracks, measured (2026-11-20)

## TL;DR
- **Baseline: 8 windows of 70 s (7 DnB, 1 dubstep), against a Demucs drums-stem reference. These numbers are micro-averages.**
  - Ours: kick recall (R) .65, precision (P) .81; snare R .47, P .69.
  - vs2: BassHits R .39 / P .40; MidHits R .43 / P .55.
  - vs3: onKick R .79 / P .43; onMid R .69 / P .29 (at ≥ .5: R .45 / P .44).

  So our snare misses about half of the snares. Our kick misses about a third of the kicks, almost all of them on 4 tracks: Sili R .09, Sub Focus .55, Sandstorm .65, Bicep .69.
- **The format is not the cause.** FLAC and WAV decode to bit-identical PCM, and the replay gives identical hits from both. A 44.1 kHz context against a 48 kHz one moves R by ±.04 at most. The worst snare window is the Bicep **WAV** (R .16). The problem comes from the masters: loud DnB with a sustained sub under the kick, and dense 1–5 kHz content.
- **Root causes, ranked by misses explained:**
  1. **Snare under its threshold (441 of 441 snare misses).** In 250 misses the flux stays under the adaptive mean × 1.5 + floor. In 191 it stays under the absolute floor of 40 (80 on Dubstep). At a miss the flux reaches .54–.79 of the threshold (p50). No miss comes from the tilt, the crosstalk or the minGap.
  2. **Kick under the gate (205 of 205 kick misses).** The gate's fast/slow ratio peaks at 1.04–1.27 (p50 per track), under `KICK` 1.35. The kick share is fine (p50 .50–.80). The physical cause: at a missed kick, the kick rises only **2–7.5 dB over a 40–150 Hz bass bed at −5.7 to −10.8 dBFS**. A caught kick rises 8–30 dB.
  3. **Half-time dubstep growls (Rumble).** The growls flood the snare band. At floor 80: R .29 / P .26. At floor 40: R .54 / P .12. No floor fixes it.
- **Recommended: one better default (S), measured on the SAME 8 windows.**
  - The change: snare floor 40 → 30, snare threshold 1.5 → 1.3, and a kick-only gate slow follower of 40 ms instead of 20 ms. The tempo ODF and `held` keep 20 ms.
  - Result: kick R .65 → **.70**, P .81 → .79; snare R .47 → **.67**, P .69 → .62. The BPM outcome is identical on 8 of 8 tracks.
  - Cost: in sections with no drums, false snares 43 → 70 and false kicks 10 → 14 (9.3 min of audio).
  - Genre profiles do not fix the misses. The spread across DnB tracks (snare R .16–.74, kick R .09–.98) is larger than the spread across genres. Make the existing presets carry the drum knobs, so the existing picker becomes the profile switch. A per-scene override can come later (§6).
- **BPM (Auto, from the track start, 48 kHz): 5 of 8 tracks lock at the right tempo 100 % of the time.**
  - Sili: .24 of the time at the right tempo; it reads 116–117 (⅔).
  - Monty: .62; it reads 139–140 (⅘).
  - Rumble: .55; it reads 144–146.
  - At 44.1 kHz, Sandstorm drops to .29 (160–161), and Rumble rises to 1.00.

  A manual BPM must override the period, the octave snap, the beat raws and 7 consumers (§7).
- **Flash:** with the change, ours kick + snare onsets go from 2.13/s to 2.97/s. Under one shared 3/s budget, 67 % of them could light instead of 79 % (§8).

## Freshness
- 2026-11-20, audio-dsp (Opus 5.5). Code: master `28ba577`. `web/src/audio` last changed at `c16b889` (the vs3 analyser). No product code edited.
- **Offline replay, Node, no browser.** `scratchpad/dsp-misses/replay.ts` runs app.ts's FILE chain at 60 fps, **with the Auto classifier**: style → preset → worklet floors + tempo range + octave snap. It runs from the track start, so the chain is warm at the window. The vs2 (`donor.ts`) and vs3 (`vs3.ts`) cores run on emulated AnalyserNode frames (Blackman window, |X|/N in dB, FFT 1024 / 2048, smoothing 0), as `dsp-donor/parity.ts` does.
- **Fidelity:** the worklet runs from a scratch copy (`src/`, env knobs). With default knobs it reproduces the live tree exactly on Kanine: hits, vs2, vs3 and tempo are all equal (`out/chk_*.json`). `base3` reproduces `base` after the kick-follower patch.
- **Audio:** ffmpeg decodes each track to mono at 48 kHz (44.1 kHz for the rate test) and pipes it into the replay. No PCM is written. The Demucs drums stems were deleted after the reference JSONs were made.
- **Tools (dev only, git-ignored):** venv `scratchpad/dsp-misses/venv` (941 MB) with demucs 4.1.0 and torch 2.15.0 (MPS). The model is htdemucs, from the HF hub.

## §1 Target classes and ground truth (SDLC §4)
- **Reference:** `ref.py`, in two steps.
  1. Demucs htdemucs separates the drums stem from the mix ([Rouard et al. 2022](https://arxiv.org/abs/2211.08553), [demucs](https://github.com/facebookresearch/demucs)).
  2. A non-causal band-split onset detector runs on the stem. Per band: a zero-phase Butterworth filter, then 5 ms RMS every 44 samples in dB. The ODF is the 10 ms rise. Peak picking: the maximum over ±30 ms, above the mean over −100…+70 ms + 3 dB, with a 50 ms wait (Böck, Krebs and Schedl, ISMIR 2012, the madmom picker).
- **Classes:** the gates are relative to the window's own p95.
  - **Kick:** a 35–150 Hz onset with L ≥ top − 6 dB, a rise ≥ 10 dB in 10 ms, and L ≥ the 150–400 Hz level − 3 dB (low-dominant).
  - **Snare:** a 1–5 kHz onset with L ≥ top − 6 dB, a rise ≥ 10 dB, and a body (150–400 Hz ≥ its top − 15 dB). A kick's click does not count: that is an onset within 12 ms of a reference kick and weaker than top − 3 dB.
  - **Ambiguous:** the next 9 dB below each gate (ghosts, fills, snare low ends). A detector hit there counts neither way.
- **Match:** a detector event matches a reference event within −40…+80 ms (detectors lag), one to one, greedy. Ours is stamped at its drain frame, which is what a scene sees. vs2 and vs3 events are stamped at their frame.
- **Accuracy limits, measured:**
  - **Grid conformity** = the share of reference events within ±20 ms of the fitted 8th-note grid (chance ≈ .23).
    - Kicks: Kanine 1.00, Sili 1.00, Monty .99, 1991 .95, Sub Focus .93, Bicep .88, Sandstorm **.77** (riff-bass leak; low confidence).
    - Snares: .85–1.00.
  - **Rumble kicks: no reference.** Its drums stem holds 367 low-band candidates in 70 s at grid .57, so the 808/growl leaked into the drums stem. Rumble is scored for snares only (35 snares, grid 1.00).
  - **The gates were picked by grid conformity, not by ear.** With the 9 dB gate and no rise gate, Kanine kicks scored .75 and Sandstorm .41.
  - **The reference times are the onset rise, not the peak.** A first version drifted 0.23 % (a 1 ms hop assumed for 44 samples). It was caught by the event-triggered envelope and fixed before any score.
  - No ear check: I cannot listen. ⚠️ Spot checks by ear on 2–3 misses per track would firm it up.

## §2 Fixtures (70 s windows, a body plus a break or build; the drop times are from `trackview/annot.json`)

| slug | file (format) | window, s | ref kicks / snares | contents |
|---|---|---|---|---|
| kanine | Kanine *Feel The Vibration* (FLAC 24/44.1) | 55–125 | 54 / 104 | body, build 77–88, drop 88.4 |
| rumble | Skrillex *Rumble* (FLAC 16/44.1) | 30–100 | — / 35 | half-time, builds 41–48, 69–76 |
| sandstorm | Darude *Sandstorm* (Dimension rmx, FLAC 16) | 60–130 | 66 / 88 | build, drops 70.3, 92.4, mini-break |
| subfocus | Sub Focus *Elevate* (SOTA, FLAC 16) | 120–190 | 109 / 85 | break, build 140, drop 146.5 |
| bicep | Bicep *Glue* (Kanine bootleg, **WAV** 24) | 45–115 | 104 / 148 | build 55, drop 66.2, switches |
| monty | Monty *Grind Mode* (**MP3**) | 35–105 | 76 / 94 | bass-carrying build, drop 55.9 |
| 1991 | 1991 *Full Send* (Pirapus, FLAC 24/**48**) | 60–130 | 94 / 142 | (c) drop 67.6, cut, drop 111.4 |
| sili | Sili *TRONCE* (FLAC 16) | 50–120 | 77 / 141 | build 56, drop 65.9 |

## §3 Baseline: R / P per window (48 kHz, Auto, master knobs; `out/base_*.json`)

| window | ours kick | vs2 BassHits | vs3 onKick | ours snare | vs2 MidHits | vs2 MidHighHits | vs3 onMid | vs3 onMid ≥ .5 |
|---|---|---|---|---|---|---|---|---|
| kanine | .98 / .69 | .52 / .32 | .98 / .45 | .36 / .74 | .49 / .59 | .38 / .41 | .78 / .28 | .47 / .54 |
| rumble | — | — | — | .29 / .26 | .37 / .19 | .43 / .25 | 1.00 / .15 | .77 / .28 |
| sandstorm | .65 / .90 | .41 / .34 | .73 / .50 | .59 / .52 | .40 / .44 | .16 / .22 | .42 / .14 | .18 / .15 |
| subfocus | .55 / .91 | .41 / .49 | .75 / .53 | .28 / .65 | .33 / .42 | .42 / .54 | .58 / .20 | .40 / .36 |
| bicep | .69 / .87 | .40 / .43 | .74 / .49 | .16 / .96 | .40 / .71 | .23 / .46 | .54 / .37 | .31 / .53 |
| monty | .84 / .90 | .38 / .45 | .96 / .65 | .49 / .61 | .44 / .51 | .52 / .58 | .88 / .42 | .68 / .52 |
| 1991 | .81 / .76 | .44 / .58 | .91 / .55 | .70 / .90 | .49 / .77 | .37 / .72 | .58 / .32 | .33 / .42 |
| sili | .09 / .33 | .18 / .18 | .48 / .14 | .74 / .73 | .46 / .59 | .38 / .52 | .91 / .44 | .65 / .63 |
| **all** | **.65 / .81** | .39 / .40 | .79 / .43 | **.47 / .69** | .43 / .55 | .35 / .47 | .69 / .29 | .45 / .44 |

- **Timing** (matched event − reference onset, p50):
  - ours: kick +31…+43 ms (p90 ≤ 60), snare +16…+22 ms;
  - vs2: BassHits +12…+27, MidHits +4…+11;
  - vs3: onKick +19…+22, onMid +7…+19.

  vs2 and vs3 read the analyser 20 ms ahead of the heard time (LEAD, `dsp_linein_2026-11-16` cause 1); ours waits for the heard time. So ours shows ≈ 20 ms later by construction, plus its gate-crossing delay.
- **Named misses: the signal state at each miss is in `diag.py` (per miss: max gate ratio, share, ODF against its threshold).** Examples:
  - Sili: all 70 missed kicks sit over a bass bed at −5.7 dBFS (p50, 40–150 Hz) and rise 5.5 dB over it. Its 7 caught kicks are the kicks in sections without bass (bed −33.7 dBFS).
  - Bicep: 124 of 148 snares missed, the flux at .70 of its threshold (p50).
  - Kanine: 67 snare misses, 49 of them under the adaptive mean.
- **Kanine is the tuning-track artefact.** Its kick and its 0.98 recall are why the 2026-11-05 knobs looked right. It is the only window whose kick stands 8 dB over a quiet bed.

## §4 Root causes, ranked by misses explained (`diag.py` on `base`)
1. **Snare flux under its threshold: 441 / 441 snare misses.**
   - Per window: Kanine 67, Bicep 124, Sub Focus 61, Monty 48, 1991 43, Sili 37, Sandstorm 36, Rumble 25.
   - 250 are under `mean₁₆ × 1.5 + floor`: the mean of the last 16 hops (85 ms) is high in dense 1–5 kHz mixes (hats, reese mids, risers).
   - 191 are under the absolute floor (40, or Dubstep 80).
   - At a miss the flux reaches .54–.79 of the threshold (p50). 0 misses come from the tilt veto, the crosstalk or the minGap.
   - Code: `onset.ts:14` (threshold 1.5, meanWindow 16), `drums.ts:18` (`FLOORS` 40/50), `presets.ts:48` (the Dubstep floors).
2. **Kick gate ratio under `KICK` 1.35: 205 / 205 kick misses.**
   - Per window: Sili 70, Sub Focus 49, Bicep 32, Sandstorm 23, 1991 18, Monty 12, Kanine 1.
   - The share test (`SHARE` .2) never vetoes (p50 .50–.80 at a miss), and the minGap never blocks.
   - Physics: the 40–150 Hz gate follows the peak (1 ms attack, 200 ms release). Its slow follower (20 ms) sits on a sustained, loud sub/reese bed.

     | at the kick | caught (p50, per track) | missed (p50, per track) |
     |---|---|---|
     | rise over the 30 ms before | 7.9–30 dB | 2.0–7.5 dB |
     | bed level, 40–150 Hz | −8.6 to −33.7 dBFS | −5.7 to −10.8 dBFS |

   - Code: `drums.ts:28` (`KICK`), `bands.ts:9,74–75` (the gate pair), `analysis.ts:87`.
3. **Half-time growls in the snare band (Rumble).** The 35 real snares compete with growl flux:
   - floor 80 (Dubstep, today): R .29 / P .26;
   - floor 40: R .54 / P .12 (252 hits);
   - floor 30: R .69 / P .09.

   This is not a threshold problem; the band feature cannot tell a growl from a snare. vs3 onMid catches all 35 (R 1.00) at P .15.
4. **Not causes** (measured): FLAC vs WAV (§5); loudness alone (all 7 windows are loud, and crest 6.6–10.8 dB shows no order against R); the adaptive gain (every detector is a ratio); the refractory gaps (0 misses); the kick band edges (30–100 Hz is worse: R .40).

## §5 FLAC, format, sample rate, loudness
- **FLAC vs WAV (Rumble):** the FLAC's native s16 PCM and a WAV made from it are bit-identical. After the 48 kHz mono resample (ffmpeg) they differ by ≤ 0.002, and the replay gives **identical hits**. Chrome decodes FLAC with its bundled FFmpeg, which is lossless, so the same holds there. ⚠️ Assumption, needs confirmation: the in-browser decode was not run (no headless pass).
- **48 vs 44.1 kHz context** (all 8 windows): kick R .647 / .624, snare R .473 / .509; P within .02.
  - At 44.1 kHz the 512-point bins are narrower, so the snare band holds 47 bins instead of 43 and reads more flux against the same floor.
  - BPM flips on 2 tracks (§7). That is the known hop-phase sensitivity (`dsp_linein_2026-11-16` cause 6), not a format effect.
  - The only 48 kHz FLAC (1991, 24-bit) has the best snare R (.70).
- **Why FLAC looked worse to the user.** ⚠️ Assumption, needs confirmation: the FLACs in `tracks/` are the loud DnB/dubstep masters, so the format stands in for the mastering. The WAV (Bicep) and the MP3 (Monty) miss as much.
- **Loudness:** mono ebur128 −3.2 to −6.9 LUFS and crest 6.6–10.8 dB on every window. What matters is the bed under the kick (§4.2), not the integrated level.

## §6 The change (before → after on the SAME 8 windows)

| variant | kick R / P | snare R / P | false kicks / snares in drumless sections* | BPM |
|---|---|---|---|---|
| base (master) | .647 / .805 | .473 / .686 | 10 / 43 | — |
| `KICK` 1.25 | .752 / .687 | — | 25 / — | same |
| `KICK` 1.20 | .807 / .612 | — | 31 / — | same |
| `KICK` 1.15 | .883 / .533 | — | — | same |
| kick + click confirm (1–5 kHz flux ≥ 10–30 within ±2 hops; `kicksim.py`) | ≤ .80 at P ≤ .61; F1 ≤ .715 | — | — | same |
| shared gate slow follower 40 ms | .703 / .789 | — | 14 / — | **moves on 4 / 8** (Sili .24 → 0, 1991 1 → .83) |
| **kick-only slow follower 40 ms** (`KICK_SLOW`) | **.703 / .789** | — | 14 / — | same |
| snare floor 30 | — | .618 / .642 | — / 66 | same |
| snare floor 30 + threshold 1.3 | — | .668 / .624 | — / 70 | same |
| snare floor 20 | — | .779 / .532 | — / 135 | same |
| **rec = kick-only 40 ms + snare floor 30 + threshold 1.3** | **.703 / .789** | **.667 / .623** | **14 / 70** | **identical, 8 / 8** |

\* An unmatched hit > 1 s from any reference hit of its class, over 9.3 min of audio.

- **Kick: F1 is flat across thresholds** (.72 / .72 / .70 / .67). The gate ratio does not separate a kick from a bass-note onset on these masters. The 40 ms kick follower is the one knob that gains F1 (+.03).
  - A better kick needs a new feature (M, design): for example a grid-assisted weak candidate, or a bed-relative onset in a finer low-band FFT.
  - vs3's onKick has the recall (.79) but not the precision (.43).
- **Recommendation, in the brief's order:**
  1. **One better default, now (S, one coder step).** It gains +.19 snare R and +.06 kick R. It costs ≈ +3 false snares per minute of drumless audio and +4 false kicks in 9.3 min.
     - `drums.ts`: `FLOORS.snare` 40 → 30; the snare detector `threshold` 1.3 (the hats stay at 1.5 / 50).
     - `bands.ts`: a kick-only slow follower `gk`, τ 40 ms, exposed as `kickRatio(i)`.
     - `analysis.ts`: pass `tempo.kickRatio(0)` to `drums.detect`. The tempo ODF and `held` keep `gs` (20 ms).
     - Dubstep keeps 80/100. `XT_SNARE` stays 80, so the crosstalk unit does not move.
     - ⚠️ The cost is not zero, so a lead call is needed. If it is too much, floor 30 alone gives R .62 at 66 false snares.
  2. **Profiles: reuse the presets.** Today Default, DnB and Techno share every drum knob, and only Dubstep differs (floors). The classifier pick therefore barely changes detection.
     - Move `KICK`, the kick follower τ and the snare floor/threshold into `Preset`. The existing picker (`settings.pick`) then is the profile switch, with no new UI.
     - Dubstep: floor 80 as today. The growl problem stays (§4.3).
     - House/techno: no window in this dataset, so no evidence. Keep the default. ⚠️
     - The per-track spread within DnB (snare R .16–.74) argues for a Low/Mid/High **sensitivity** knob per profile more than for more genres.
  3. **Per-scene override: later.** A scene that wants every snare can bind vs3 `onMid` (R .69–1.00) and accept its false hits.

## §7 BPM: auto error and what a manual lock must override
- **Auto, from the track start.** "At ref" = the share of locked frames after 10 s within ±2 % of the reference tempo.

  | track | ref BPM | at ref, 48 kHz | at ref, 44.1 kHz | wrong reading |
  |---|---|---|---|---|
  | Kanine, Sub Focus, 1991 | 174 | 1.00 | 1.00 | — |
  | Bicep | 174 | 1.00 | 1.00 | — (no lock for the first ≈ 60 s) |
  | Sandstorm | 174 | 1.00 | **.29** | 160–161 at 44.1 kHz |
  | Monty | 174 | .62 | .62 | 139–140 (⅘) |
  | Sili | 174 | **.24** | **.00** | 116–117 (⅔) |
  | Rumble | 140 | .55 | 1.00 | 144–146 at 48 kHz (+3–4 %) |

  The rec change leaves all 8 identical.
- **Causes:**
  1. On two-step DnB the ODF's ACF peaks at 1.5 and 2.5 beats, so the reading is ⅔ or ⅘ (`dsp_detector_2026-11-16` § Tempo). The default fold [90, 180) admits 116; Dubstep's 135–150 admits 139.
  2. The sync keeps the first lock's octave. Its own header says "a two-step locked from scratch still locks 116" (`sync.ts:35`).
  3. The hop phase and the context rate flip the first lock between runs: the 48/44.1 kHz differences above.

  A DJ mix adds tempo moves at the transitions. A DnB mix mostly holds 172–175, which is why the user asks for a static BPM.
- **A manual BPM lock must override:**
  1. **The tempo:** the sync's `period` (`sync.ts:43,69–71`) must stay at the typed BPM. Readings from the TempoSource must not merge, relock or snap. The app's band snap must be skipped: `tempo.setRange` / `snapOctave` → `sync.double/halve` (`app.ts:386–396`).
  2. **The phase clock:** keep the onset PLL's phase correction (`phaseGain`) with `periodGain` 0. Keep tap / nudge / downbeat as they are (`sync.ts:16`, `app.ts:174–186`).
  3. **The beat raws and consumers that read `f.sync`:** they follow automatically once the sync holds the lock.
     - `beat`, `bar`, `confidence` (`bind.ts:69–71`). `confidence` should read a fixed high value, or the phase-fit confidence: `director.ts:65` and the strobe gate on it.
     - The donor beat family (`app.ts:440–444`).
     - The strobe (`app.ts:460`).
     - The arrangement's beat (`app.ts:376`).
     - The HUD BPM (`app.ts:474`).
     - The classifier's per-beat counts (`style.ts:24–27`).
     - The classifier's tempo families (`app.ts:369`). These come from the TempoSource, not the sync, so they need the manual BPM or a pinned preset.

## §8 Flash safety (`gl/post.ts:16`, WCAG 3/s; `flashGate` `post.ts:50`)
- **Ours kick + snare onsets, mean over the 8 windows:** 2.13/s (base) → 2.97/s (rec).
  - The snare alone: 1.13 → 1.82/s.
  - The kick alone: ≈ 1.0 → 1.1/s.
- **Through one shared 3/s budget** (one array of allowed onsets for the whole chain, as `flashGate` holds it), the share of onsets that can light:
  - kick + snare: 79 % → **67 %**;
  - the snare alone: 89 % → 82 %;
  - the kick alone: ≈ 98 %.
- Higher recall does not break the cap: the gate holds by construction. But a scene with ⚡ on both drums drops about 1 in 3 of them. At 174 BPM, kick + snare already sit at 2.9/s.
- **Advice:** bind one drum to a ⚡ input and the other to a non-flash input (motion, scale, hue). Do not widen the cap.

## §9 Ambiguous cases, not measured, coder notes
- **Ambiguous:**
  - The kick precision of every variant counts unmatched hits on bass-note onsets as false. ⚠️ Some may be kicks that Demucs put into the bass stem: Kanine has 24 unmatched kicks at base R .98.
  - Sandstorm's kick reference is low-confidence (grid .77).
  - The snare classes include ghost and double snares (Bicep 148 and 1991 142 in 70 s are above the 2-per-bar backbeat of ≈ 101). They are on the grid (.94–.97), but a VJ may want only the backbeat.
- **Not measured:**
  - Line-in (the brief's tracks are files).
  - House or techno material (none in `tracks/`).
  - The in-browser FLAC decode (§5).
  - Per-scene binding effects (which scenes read `kick` through a ⚡ input).
  - Ear checks.
- **Coder notes for rec (one S step):**
  - `bands.ts`: add `gk` to the band state, with a `KICK_SLOW` 0.04 coefficient: `gk += (gf − gk) · kickSlow`, and add `kickRatio(i) = gf / gk`. The code is the scratch `src/bands.ts` (`scratchpad/dsp-misses/src/`); diff it against `web/src/audio`.
  - `analysis.ts:87`: pass `tempo.kickRatio(0)`.
  - `drums.ts`: `FLOORS.snare` 30; the snare `createDetector({ floor, threshold: 1.3 })`.
  - **Tests to touch:** `drums.test.ts` snare counts, `bands.test.ts` (`kickRatio` = `ratio` at τ 20 ms), the acceptance / synth fixture counts.
  - **The gate:** rerun `run.sh` + `agg.py` on the same 8 windows. Expect kick .703 / .789 and snare .667 / .623.
- **Re-measure kit:** `scratchpad/dsp-misses/`.
  - `windows.txt`; `run.sh <tag> [rate]` with env knobs; `agg.py <tag> [detector]`; `score.py <slug> <json>…`; `diag.py`; `kicksim.py`.
  - `out/ref_*.json` (the reference; no audio); `out/{base,rec,…}_*.json`.
  - `ref.py` regenerates the references; it needs the venv and decodes from `tracks/`.
