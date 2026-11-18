# DSP — donor-mode gaps G1 / G4 / G3 (2026-11-18)

## TL;DR
- **G1 / C2 confirmed. The proposed `paused` rule fails.** With no rule, every resume after a 10 s pause fires ≥ 4 of the 5 band Hits within 50 ms (14/14 pauses). Hits then run at .36–.70 of the same audio's rate for 7 s. "Hold while `paused`" + "prev reset on the edge frame" removes the burst at 30 / 60 fps (4/14 remain at 144). It gives 1.30–1.51× Hits in the first 2 s, and Level / Presence / Intensity stay off for > 30 s.
- **G1 recommendation (PASS at 30 / 60 / 144 fps):** hold every stat and the Presence / Intensity accumulators on each frame with `frameRms ≤ SILENT_RMS`. Skip 25 ms after a quiet → music edge. Burst 0/14. Hits .98–1.00× in 0–2 s and 1.00–1.01× in 2–7 s. Presence / Intensity are exact at once. Level is ≤ .07 off after 1 s (60 fps).
- **G4 / C5 confirmed, far above ±25 %.** Per-tick Hits/min grow with the frame rate: pooled Bass 39 / 77 / 138 / 161 at 30 / 60 / 120 / 144 fps (spread 308–433 %). The skeptic's two fixes miss 15 %: the 14 ms sub-tick gives 109–169 %, the fixed-lag diff 149–339 %.
- **G4 recommendation:** a 30 Hz Hits tick (flux + its stats + trigger only when ≥ 30 ms have passed since the last Hits tick), θ 2.25. Pooled spread 4–9 %. Every band on every track stays within ±10 % of its 60 fps rate, at the S1 rate level (73–85/min). Level is already frame-rate independent (p50 ±.01).
- **G3:** kickAccent = min(1, .7·10^((L − μ)/20)) at a kick (rest 0, a typical kick .70, clamp at +3.1 dB). CV .21–.29; r .89–.97 vs the truth mapped alike. It stays an unbound extra source.

## Freshness
- 2026-11-18, audio-dsp (Opus 5.5). master `91afb48`. `web/src/app.ts`, `audio/*`, `quality.ts` are unchanged since S1's `7c8caad` (empty git diff).
- Offline Node replay, no browser, no dev server. Driver `scratchpad/dsp-donor/gaps/gaps.ts`. Model `scratchpad/dsp-donor/donor-model.ts`, extended with `Opts`; `{}` = the S1 model, and its 60 fps run reproduces S1's Hits/min and on-drum shares exactly (`gaps/g4.txt` vs `out/score-v2.txt`). Assert self-checks: `demo()` (donor-model.ts) and `gaps/g3.py`.
- Same 3 tracks (Kanine, Sub Focus, Bicep), mono 48 kHz, θ 3, Bass < 150 Hz. The 7 drops come from `scratchpad/trackview/annot.json`. The PCM was deleted after the run.
- ⚠️ 120 / 144 fps are simulated: the analyser frame is resampled from the PCM at each rAF tick (window end = round(t·sr)). `q 480` adds 10 ms audio-callback bursts (WASAPI-like, an assumption). No real high-refresh display was measured.
- Rerun (in `scratchpad/dsp-donor`): ffmpeg each track `-ac 1 -ar 48000 -f f32le pcm/<t>.f32`; `rolldown gaps/gaps.ts -o out/gaps.mjs -p node -f esm`; `FPS=<30|60|144> HIT_Z=3 BASS_HI=150 node out/gaps.mjs g1`; `HIT_Z=3 BASS_HI=150 node out/gaps.mjs g4`; `python3 -I gaps/g3.py`.

## §G1 Silence and the resume edge (C2)
**Protocol.** 10 s of digital zeros go in at d + 15 s (drop body) and d − 7 s (break) of each drop: 14 pauses. Each rule is compared with the same rule's no-pause run on the same audio frames (exact alignment). **Burst** = ≥ 4 of the 5 bands (all, Bass, Mid, MidHigh, High) fire within 50 ms of the first resumed frame; the no-pause audio has 0/14 (1/14 at 144 fps). **Hits** = the 4 bands. Evidence: `gaps/g1-60.txt`, `g1-30.txt`, `g1-144.txt`.

| Rule (60 fps; [30, 144 fps] where they differ) | Burst /14 | Hits 0–2 s ÷ ref | 2–7 s ÷ ref | Level max \|Δ\| after 1 s, med / max | Presence, Intensity: last \|Δ\| ≥ .05, med / max |
|---|---|---|---|---|---|
| none (S1) | 14 [14, 14] | .58 [.70, .52] | .65 [.36, .70] | .49 / .61 | > 30 s, > 30 s |
| hold while `paused` | 14 [14, 14] | .45 [.69, .41] | .60 [.35, .65] | .33 / .42 | > 30 s, > 30 s |
| hold `paused` + edge frame (skeptic C2) | 0 [0, 4] | 1.43 [1.51, 1.30] | 1.09 [1.11, 1.05] | .33 / .42 | > 30 s, > 30 s |
| hold quiet frames | 14 [14, 14] | .41 [.69, .35] | .59 [.34, .62] | .06 / .09 [.09 / .12, .02 / .05] | 5.3 / 5.7 s, 18.8 / 20.5 s |
| edge 25 ms only | 0 [0, 11] | 3.02 [4.39, 3.28] | 1.21 [1.29, 1.14] | .49 / .61 | > 30 s, > 30 s |
| hold quiet + edge frame | 0 [0, 3] | 1.00 [1.00, 1.01] | 1.01 [1.00, 1.00] | .05 / .07 | 5.3 / 5.7 s, 18.8 / 20.5 s |
| hold quiet + edge 25 ms | 0 [0, 0] | 1.00 [1.00, .98] | 1.01 [1.00, 1.00] | .05 / .07 [.09 / .12, .01 / .03] | 5.3 / 5.7 s, 18.8 / 20.5 s |
| **+ hold Presence / Intensity = G1 rec.** | 0 [0, 0] | 1.00 [1.00, .98] | 1.01 [1.00, 1.00] | .05 / .07 [.09 / .12, .01 / .03] | 0, 0 |
| G1 rec. + G4 rec. (30 Hz tick, θ 2.25) | 0 [0, 0] | 1.00 [.99, 1.06] | 1.03 [1.01, .92] | as above | 0, 0 |

- Both skeptic checks confirm: (a) 14/14 bursts; (b) Hits ≤ .70 for 7 s, back to .96–.99 at 7–30 s.
- `paused` fails because of the 1 s debounce (app.ts L314). It lets 60 silent frames (−120 dB) into the 10 s and 60 s stats, and their flux of 0 shrinks σF: 1.30–1.51× Hits after the resume.
- 25 ms, not one frame: frames after the edge hold a part-zero 1024-sample window (21.3 ms at 48 kHz, 23.2 ms at 44.1). At 144 fps one frame (6.9 ms) is too short: 3/14 bursts.
- A file start is the same edge. Kanine opens with 0.15 s of zeros: the S1 core gives 16 Hits in its first 10 s, the rule 47; Sub Focus and Bicep agree within ±1 per 2 s (`gaps/g1-trackstart.txt`). Whole-track Hits, rule ÷ S1: 1.03 / 1.00 / 1.00 (`g1-60.txt`).
- Inside the music no frame is quiet, except 2 frames at Kanine's ends and 23 in Bicep's outro fade (223.6–224.4 s) (`g1-60.txt`, `gaps/quiet.txt`). The rule moves no R3 number elsewhere.
- Residual Level error: only the 1–3 frames at the pause start (part music, part zeros) differ; they count as music and enter the stats.
- Trade-off of holding the accumulators: during a pause, Presence and Intensity keep their pre-pause values while Level → 0 and FadeInOut → 0 (τ 2.5 s). Without the hold they drain: Intensity is −.90 vs ref 1 s after the resume.

**G1 recommendation.** Hold every stat (the 10 s level, 60 s and 2 s flux stats) and the Presence / Intensity accumulators on every frame with `frameRms ≤ SILENT_RMS`: app.ts L313's own test, without L314's 1 s debounce. For 25 ms after a quiet → music edge, set `prev = NaN` and let no stat take the frame. `DonorIn` does not need `paused`.

## §G4 Frame rate (C5)
**Protocol.** Each track was replayed at 30 / 60 / 120 / 144 fps (q 1 and q 480). Rates are Hits per minute of music. On-drum shares use our S1 worklet hits (±34 ms). The forms: **tick** (S1, rise per rAF tick); **sub14** (skeptic: a Hits tick ≥ 14 ms apart); **lag17 / lag33** (rise vs the band dB 16.7 / 33.3 ms earlier, every tick); **sub30** (a Hits tick ≥ 30 ms apart, rise vs the last Hits tick). Evidence: `gaps/g4.txt`.

| Form | Pooled Hits/min Bass·Mid·MidHigh·High at 30 / 60 / 120 / 144 fps | Pooled spread (max ÷ min − 1) | Worst per track |
|---|---|---|---|
| tick θ 3 (S1) | 39·38·38·36 / 77·83·84·98 / 138·138·144·171 / 161·154·165·194 | 308–433 % | 619 % |
| sub14 θ 3 | 39·38·38·36 / 77·83·84·98 / 82·80·81·97 / 67·67·65·78 | 109–169 % | 259 % |
| lag17 / lag33 θ 3 | lag33: 39·38·38·36 / 72·66·67·61 / 120·97·103·85 / 126·102·112·90 | 243–339 % / 149–218 % | 537 % / 274 % |
| sub30 θ 3 | 39·38·38·36 / 38·38·38·37 / 38·35·37·36 / 36·34·35·33 | 8–12 % | 22 % |
| **sub30 θ 2.25** | 77·77·78·81 / 78·79·74·85 / 77·77·74·82 / 73·76·73·78 | **4–9 %** (q 480: 7–9 %) | 17 % (q 480: 18 %); ≤ ±10 % vs 60 fps |

- The trigger counts z-crossings per tick, so the crossing count follows the tick rate. A fixed lag keeps the evaluation rate, so it does not help. Only a fixed Hits cadence helps, and 30 fps caps that cadence at 30 Hz. The 14 ms sub-tick runs at 30 Hz at 30 fps and at 48 Hz at 144 fps (2 frames = 13.9 ms).
- Per-track floor: the same 33.3 ms cadence at another phase (30 vs 60 fps) already differs by ≤ 9 % per band. The 144 fps Hits tick runs at 28.8 Hz (5 frames = 34.7 ms).
- Drum agreement at 60 fps, S1 → sub30 θ 2.25 (Kanine / Sub Focus / Bicep): BassHits on a kick .44 / .31 / .35 → .36 / .24 / .34; kicks with a BassHit .58 / .50 / .55 → .45 / .41 / .53; HighHits on a hat .88 / .65 / .67 → .80 / .65 / .56. At 144 fps the S1 form falls to .24 / .22 / .15 on a kick; sub30 keeps .36 / .24 / .32.
- Level p10 / p50 / p90 at 30–144 fps: within ±.01 on every track (p50: Kanine .59–.60, Sub Focus .63, Bicep .63–.64). Level needs no change.

**G4 recommendation.** Run the flux, its 2 s stats and the trigger on a Hits tick that fires when ≥ 30 ms have passed since the last one. The flux = band dB now − band dB at the last Hits tick; θ = 2.25. Level, the hit decay, Presence and the clocks stay per rAF. Cost: a hit lands up to 33 ms after its onset (≤ 16.7 ms for S1 at 60 fps).

## §G3 kickAccent mapping (P4)
- **Formula.** At a frame that drains a `kick`: L = 10·log10 of the summed power of analyser bins 1–3 (47–141 Hz at 1024 / 48 kHz), the max of this frame and the one before (S1 form iii). Then a = min(1, .7·10^((L − μ)/20)), then μ += (L − μ)/8; μ starts at the first kick's L. Between kicks the source is a·e^(−age/.12 s), the `kick` τ (`features.ts` L16).
- **Values.** Rest (no kick) 0. A kick at its running mean .70. Clamp at L − μ ≥ +3.1 dB. −6 dB → .35, −12 dB → .18. Range 0..1 by construction.

| Track | n | CV | p10 / p50 / p90 | share at the clamp | r vs the truth mapped alike | r vs the truth dB | on- / off-beat mean | r vs subBody 50 ms before |
|---|---|---|---|---|---|---|---|---|
| Kanine | 193 | .29 | .40 / .78 / 1.00 | .16 | .97 | .74 | .76 / .72 | .34 |
| Sub Focus | 163 | .27 | .40 / .77 / .97 | .07 | .94 | .53 | .77 / .72 | .08 |
| Bicep | 184 | .21 | .61 / .72 / 1.00 | .10 | .89 | .56 | .72 / .73 | .49 |

- The r vs the raw truth dB is lower by design: μ removes the section loudness (break vs drop body). Evidence: `gaps/g3.txt` (S1's kick table in `out/<t>.json`; truth = 150 Hz low-pass, 10 ms RMS peak).
- **G3 recommendation.** Keep it an unbound extra source: `src.kickAccent` in the drums group, no default binding. Its musical value is still unproven: on-/off-beat Δ ≤ .05, and r .08–.49 with the sub body before the kick.

## Gaps
1. 120 / 144 fps are resampled analyser frames. The audio-callback size on the Windows show PC is unmeasured (q 480 is an assumption).
2. Not measured: line-in silence near −60 dBFS, seeks, late frames or a hidden tab (a long dt gives a long flux interval), kickAccent at 30 / 144 fps, 44.1 kHz input, Dubstep.
3. θ 2.25 and the 30 ms tick are tuned on the same 3 DnB tracks. Drum agreement at 60 fps drops by up to .13 vs S1 (kicks with a BassHit, Kanine).
4. The post-pause Level residual (≤ .12 at 30 fps) comes from the part-zero window at the pause start. A 25 ms stats delay would remove it (not tested).
