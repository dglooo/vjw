# Audio-DSP: track viewer + 19-track drop audit (2026-11-16)

## TL;DR
- **The tool works on 19 of 19 tracks.** Run `scratchpad/trackview/trackview <track>`. It writes one PNG per track (1600 px wide) and one JSON. The PNG has 7 rows on one time axis: waveform, log spectrogram, 5 band envelopes, our app's kick/snare/hats hits, build / drop / confidence with the drop fires, the app's BPM and genre, and the reference bars with the annotated sections.
- **Drops.** I annotated 49 main drops (18 DnB tracks + 1 dubstep). These are audio-dsp annotations, not ear-checked. The app fires on 26 of them: recall 53 %, lag p50 +0.38 s (max +1.5 s). It has 13 false fires; 2 of them are late (+4.2 s and +6.8 s). 3 more fires land on alt switch-ups and count as neither hit nor false.
- **The first drop is the weak spot:** the app hits 7 of 19 first drops and 19 of 30 later drops. Confidence does not separate true fires from false ones (p50 .73 for both, min .56 for both).
- **3 worst gaps:** (1) 23 missed drops: 10 breakdown drops, 8 cut drops (≈ 2 s bass cuts), 5 no-dip drops. (2) Tempo and genre errors on DnB: 6 of 18 DnB tracks read as techno or dubstep for long stretches, and 5 of 18 are never classified. (3) 11 false fires on teaser bass stabs in intros and breaks.
- **Changed vs the 2026-11-05 audit:** Sub Focus drop 1 is now 55.5 s, not 44.1 s. It mirrors the ear-checked 146 s. 44.1 s and 171.0 s are now alt.

## Freshness
- 2026-11-16, audio-dsp (Opus 5.5). App code: master `3a7d1e2` for 12 dumps and `63ca394` for 7 dumps. The milk-sync merge `63ca394` changed only `gl/` and `milkdrop/`. `web/src/audio`, `app.ts` and `bind.ts` did not change, so all 19 dumps come from the same analysis.
- **App dumps.** `dump.mjs` runs headless Chrome with `?debug` and the app defaults (Auto, no pick). It holds `builtin:spectrum` and plays each track at 1.00×, 4 pages in parallel. Frame rate: 59.5–59.9 frames/s. Output underruns per track: 0–20 (A.M.C 20, Place 2b 11, the rest ≤ 8).
- **Reference.** `scratchpad/real/ref.py` is unchanged: tempo, beat grid and per-beat band dB, independent of the app. Tempo: 18 tracks at 172–176 BPM, Rumble at 140.
- **Annotations.** I made them from the pictures plus per-bar and per-beat numbers (`bars.py`, `cuts.py`). The rules are in `annot.json` `_doc` (§ Tool). I kept the user's ear check: Sub Focus 146 s = drop 2.
- **Read:** `_adhoc/real_tracks_2026-11-05.md`; `scratchpad/real/{run.mjs, ref.py, an.py, t4/fires.py}`; `app.ts` L225–L408; `audio/input.ts` L20–L154; `arrange.ts` L1–L70; `presets.ts` (bands, `cuts`); `bind.ts` `SOURCE_IDS`.

## Tool (`scratchpad/trackview/`, git-ignored with all of `scratchpad/`)
- **One track:** `scratchpad/trackview/trackview <track>`. It runs the app dump when `out/<slug>.app.json` is missing, then `ref.py` once (→ `out/<slug>.ref.npz`), then the picture (→ `scratchpad/trackview/<slug>.png` + `<slug>.json`; the dumps and refs stay in `out/`). If no dev server listens on `PORT` (default 5176), the wrapper starts Vite with a private dep cache and stops it at the end. Env: `REDO=1` re-dumps; `NOAPP=1` skips the dump. The help text is in the script header.
- **Batch:** `JOBS=4 sh scratchpad/trackview/batch.sh tracks/*` runs the dumps only, longest first. The dev server must already be up. After the batch, `trackview` per track only plots (≈ 10 s each).
- **Cost.** One dump takes as long as its track (real-time playback). 19 tracks took ≈ 25 min of wall time at 4 in parallel.
- **Annotation.** `annot.json[<slug>]` = `{drops, alt, builds: [[start, drop]], note}`. Main drop types: (a) breakdown: the low end returns to body level after ≥ 5 of the 16 bars before sat under body − 6 dB; (b) cut: it returns after a ≥ 6-beat (≈ 2 s) cut under body − 10 dB; (c) no-dip: the full mix enters at the end of a build while the bass stayed. Alt types: stops ≤ 5 beats (switch-ups), an intro groove entry followed by a break within 16 bars, the groove downbeat after a drop impact, and a bass hit that decays into a build.
- **The auto pass** runs when a track has no `annot.json` entry. Rule: the low end is back at ≥ p90 − 4 dB for 2 bars after ≥ 1 bar at ≥ 8 dB under; the largest (low + hi) 2-bar step wins; drops are ≥ 12 bars apart. It reproduced the Kanine audit drops exactly (44.3 / 88.4 / 154.3). It over-reports switch-ups on most other tracks, so `annot.json` overrides it.
- **Scoring** follows `scratchpad/real/t4/fires.py`. A fire within −0.5…+4 s of an annotated drop is a hit; any other fire is false. A fire near an alt is neither.
- **Helpers:** `bars.py <slug> t0 t1 [rot]` prints the per-bar profile. `cuts.py <slug> t,…` prints the cut length and the 16-bar dip before each candidate. `table.py` prints the table below.
- **Trap.** A merge into `web/src` reloads the dev-server page and kills a running dump (it happened at 01:05:27). `dump.mjs` now retries the track. Restart Vite after a merge anyway (the HMR second-module trap).

## 19-track table
All times are media seconds. Hit = a fire −0.5…+4 s from an annotated drop; lag = fire − drop. "alt" = a fire on a secondary return (neither hit nor false). Genre "dnb" for the reference = my label from the 172–176 BPM grid and the picture.

| track | genre BPM: ref · app (genre changes, BPM median, locked frames at ref / ⅔ / ½) | annotated drops (s) | app fires (s, conf) | hit / miss / false | build onsets (s): annotated · app build ≥ .3 lead (s; · = none) | notes |
|---|---|---|---|---|---|---|
| 1991-full-send-pirapus-remix | dnb 174 · app dnb@20 → techno@96, 116 (ref 42%, ⅔ 37%, ½ 9%) | 67.6, 111.4, 155.9 | — | 0 / 3 / 0 | 62.0, 109.3, 146.0 · app · · −23 | the sub never leaves: no fire at all; techno from 96 s (½, then ⅔ tempo) |
| a-m-c-liftoff | dnb 174 · app none, 175 (ref 60%, ⅔ 0%, ½ 0%) | 44.1 | 171.4 (0.69) | 0 / 1 / 1 | 41.0 · app · | no breakdown, one no-dip drop; never classified; 171.4 false at the outro end |
| agressor-bunx-bunker | dnb 174 · app dnb@19, 174 (ref 80%, ⅔ 1%, ½ 0%) | 44.1, 132.4, 153.8 | 22.5 (0.74), 132.8 (0.91), 154.9 (0.58) | 2 / 1 / 0 (+1 alt) · lag +0.4 +1.1 | 41.0, 121.0, 146.0 · app −6 −13 −35 | 44.1 (2.4 s cut) missed; the 22.5 fire is the intro sub entry (alt) |
| andy-c-who-like-the-what-extended-mix | dnb 174 · app dnb@65, 174 (ref 71%, ⅔ 0%, ½ 0%) | 46.9, 91.0, 157.2 | 47.3 (0.90), 91.4 (0.76), 157.6 (0.77) | 3 / 0 / 0 · lag +0.4 +0.4 +0.4 | 41.0, 86.5, 151.0 · app · · −35 | 3 of 3, all after 2.4 s cuts; classified at 65 s |
| bad-company-uk-planet-dust-latte-remix | dnb 174 · app techno@110 → dnb@179, 169 (ref 26%, ⅔ 0%, ½ 0%) | 107.6, 132.4, 176.5, 284.1 | 12.2 (0.57), 63.8 (0.74), 85.9 (0.81), 262.4 (0.75), 284.4 (0.63) | 1 / 3 / 4 · lag +0.3 | 87.0, 130.0, 174.0, 276.0 · app −33 −36 · −33 | 4 false on teaser bass entries and stabs; techno 110–179 s; BPM at ref 26 % |
| bicep-glue-kanine-bootleg | dnb 174 · app dnb@130 → techno@204, 174 (ref 86%, ⅔ 3%, ½ 1%) | 66.2, 176.5 | 176.9 (0.73) | 1 / 1 / 0 · lag +0.4 | 55.0, 155.0 · app · −27 | first drop missed (the intro carries sub + bass); techno from 204 s (½ → ⅔) |
| darude-sandstorm-dimension-remix | dnb 174 · app none, 174 (ref 64%, ⅔ 0%, ½ 0%) | 70.3, 92.4, 180.7, 202.7 | 18.2 (0.56), 93.9 (0.56), 117.2 (0.78), 139.3 (0.81), 181.1 (0.69), 203.2 (0.64) | 3 / 1 / 3 · lag +1.5 +0.4 +0.4 | 63.0, 83.8, 169.5, 194.1 · app · −0 −36 −0 | 3 false on riff bass stabs (18, 117, 139 s); BPM ≈ 160 until 95 s; never classified |
| enei-stoned | dnb 174 · app dnb@29, 174 (ref 85%, ⅔ 0%, ½ 0%) | 21.7, 132.1 | 22.4 (0.69), 132.8 (0.99), 209.4 (0.56) | 2 / 0 / 1 · lag +0.7 +0.7 | 11.0, 121.0 · app · −11 | 2 of 2; 209.4 false at an outro sub-pattern change |
| kanine-feel-the-vibrat | dnb 174 · app none, 174 (ref 99%, ⅔ 0%, ½ 0%) | 44.3, 88.4, 154.3 | 44.7 (0.70), 88.8 (0.61), 155.0 (0.74) | 3 / 0 / 0 · lag +0.4 +0.4 +0.7 | 33.0, 77.1, 143.0 · app −22 −2 −23 | 3 of 3; never classified, but the tempo is at ref 99 % |
| kanine-release-me-vip | dnb 174 · app none, 174 (ref 99%, ⅔ 0%, ½ 0%) | 67.6 | — | 0 / 1 / 0 | 64.5 · app · | no fire (the intro carries sub); never classified |
| kritikal-left-to-right | dnb 176 · app dnb@19, 176 (ref 60%, ⅔ 0%, ½ 0%) | 31.1, 133.4 | 120.5 (0.73) | 0 / 2 / 1 | 22.0, 110.0 · app −1 −16 | both missed; 120.5 false = 13 s early, inside a 23 s bass-carrying build |
| monty-grind-mode | dnb 174 · app dnb@31 → dubstep@98, 140 (ref 33%, ⅔ 0%, ½ 7%) | 55.9, 165.6 | 12.9 (0.58), 165.9 (0.78) | 1 / 1 / 0 (+1 alt) · lag +0.4 | 37.0, 151.0 · app · −16 | 55.9 (no-dip) missed; dubstep from 98 s at ≈ 140 BPM (≈ 4/5) after a ½ stretch |
| napes-tokyo-drifting | dnb 172 · app dnb@19, 172 (ref 95%, ⅔ 0%, ½ 0%) | 89.5, 200.8, 248.5 | 22.7 (0.67), 67.3 (0.79), 89.7 (0.65), 201.3 (0.98) | 2 / 1 / 1 (+1 alt) · lag +0.2 +0.6 | 85.0, 189.5, 246.0 · app −38 −14 · | 248.5 (2.4 s cut) missed; 67.3 false on half-time sub stabs in the break |
| place-2b-escape | dnb 175 · app none, 175 (ref 51%, ⅔ 0%, ½ 0%) | 54.3, 164.0 | 54.7 (0.73), 165.0 (0.90) | 2 / 0 / 0 · lag +0.4 +1.1 | 43.0, 152.5 · app −12 −12 | 2 of 2; never classified; BPM 127 in the intro and 140 at 125–160 s |
| sili-tronce | dnb 174 · app techno@21, 116 (ref 0%, ⅔ 58%, ½ 0%) | 65.9, 176.2, 220.3 | 72.7 (0.59) | 0 / 3 / 1 · late 72.7 | 56.0, 154.1, 216.5 · app · −33 · | techno at 116 BPM (⅔) the whole track; 72.7 is +6.8 s late |
| skrillex-rumble | dubstep 140 · app dubstep@24, 140 (ref 71%, ⅔ 0%, ½ 0%) | 21.0, 48.4, 75.8, 117.0 | 21.0 (0.60), 75.8 (0.73) | 2 / 2 / 0 · lag -0.0 -0.1 | 14.0, 41.0, 69.0, 110.0 · app · −7 −34 −21 | 48.4 (bass-carrying build) and 117.0 missed: dubstep cuts off, the known ceilings |
| sub-focus-elevate-sota-remix | dnb 174 · app dnb@61, 174 (ref 96%, ⅔ 0%, ½ 0%) | 55.5, 146.5 | 146.6 (0.69) | 1 / 1 / 0 · lag +0.0 | 44.1, 140.0 · app · −33 | drop 1 (55.5) missed; drop 2 (146.5, ear-checked) hit at +0.0 s |
| t-i-fearless | dnb 175 · app dnb@18, 175 (ref 84%, ⅔ 0%, ½ 0%) | 43.9, 153.6 | 48.1 (0.60) | 0 / 2 / 1 · late 48.1 | 30.0, 148.0 · app · −7 | 48.1 is +4.2 s late; 153.6 missed (the break keeps sub swells) |
| voltage-godzilla | dnb 175 · app techno@107, 120 (ref 0%, ⅔ 24%, ½ 0%) | 43.9, 109.7, 153.6 | 44.3 (0.85), 110.1 (0.66), 154.0 (0.86) | 3 / 0 / 0 · lag +0.4 +0.4 +0.4 | 22.0, 107.0, 143.0 · app −20 · −11 | 3 of 3, but techno at ≈ 120 BPM (⅔) from 107 s |

## Totals
- **19 tracks, 49 annotated main drops:** 26 hits (recall 53 %), 23 misses, 13 false fires (11 on non-drop bass returns, 2 late), 3 fires on alt. DnB alone: 24 of 45. Rumble: 2 of 4.
- **First drops: 7 of 19 hit. Later drops: 19 of 30 hit.**
- **The 5 tuning tracks vs the 14 new ones.** On the 5 tracks the arrange knobs were tuned on (Kanine, Sub Focus, Andy C, Rumble, Bicep): 10 of 14 hit, 0 false. On the 14 new tracks: 16 of 35 hit (46 %), 13 false. The knobs fit their tuning set.
- **Hit lag:** p50 +0.38 s, max +1.48 s (Sandstorm 93.9). **Confidence:** hits p50 .73 (min .56); false fires p50 .73 (.56–.81). The confidence cannot gate a fire.
- **Build:** the app's `build` reaches ≥ .3 before 31 of 49 drops, 0–38 s ahead.
- **Misses by drop type:** 10 breakdown, 8 cut, 5 no-dip. **Misses by the preset active at the drop:** dnb 8, techno 7, none 6, dubstep 2.

## The 3 worst detector gaps (new tracks)
1. **Drops the arrangement cannot see: 23 misses, 12 of them first drops.**
   - *No-dip drops (5: 1991 67.6, A.M.C 44.1, Kanine RM 67.6, Monty 55.9, Kritikal 133.4) and first drops after an intro that carries bass (Bicep 66.2).* `arrange.ts` needs `low` under .6 G for 6 s (`sparse` / `arm`) or a deep cut. When the bass stays through the build, nothing arms. This is the documented ceiling ("a drop always needs the low end back"). On these tracks the drop shows as a full-mix and hats step, not as a bass return (row 3 of each PNG).
   - *Cut drops (8 missed):* 1991 111.4 / 155.9, Bad Co 132.4 / 176.5, Napes 248.5, Sili 220.3, Agressor 44.1, Kritikal 31.1. My measurement: a 2.1–2.4 s cut under body − 10 dB in 30–150 Hz. That is above `cutMin` 1.5 s, yet no fire. **Cause not traced.** Candidates: `low` (sub + reese, kick-gated) does not dip like 30–150 Hz; `minConf` .56; the `near`-a-kick rule with kicks missed. Next step: the ArrangeIn capture (`scratchpad/real/t4/cap.mjs`) on these 8.
2. **Tempo and genre errors on DnB.**
   - *Wrong genre for long stretches on 6 of 18 DnB tracks:* techno on Sili (the whole track, 116 BPM = ⅔), Voltage (from 107 s, ≈ 120), 1991 (from 96 s, ½ then ⅔), Bad Co (110–179 s) and Bicep (from 204 s); dubstep on Monty (from 98 s, ≈ 140 = 4/5).
   - *Never classified: 5 of 18* (A.M.C, Sandstorm, Kanine, Kanine RM, Place 2b).
   - *Locked frames at the ref BPM under 50 % on 5 tracks:* Sili 0 %, Voltage 0 %, Bad Co 26 %, Monty 33 %, 1991 42 %.
   - The audit's ⅔ finding (items 4–5) holds at scale. New paths: 4/5 into dubstep (Monty) and off-ratio intro tempos (Bad Co 138 ≈ 0.8×, Place 2b 127 ≈ 0.73×, Sandstorm ≈ 160 ≈ 0.92×).
   - 7 of the 23 misses happen under a wrong techno preset.
3. **False fires on bass returns that are not drops (11), plus late fires (2).**
   - *Teaser entries and stabs in intros:* Bad Co 12.2 / 63.8 / 85.9, Sandstorm 18.2.
   - *Riff and half-time stabs in breaks:* Sandstorm 117.2 / 139.3, Napes 67.3, Bad Co 262.4.
   - *13 s early, inside a bass-carrying build:* Kritikal 120.5.
   - *Outro changes:* Enei 209.4, A.M.C 171.4.
   - *Late:* T>I 48.1 (+4.2 s; cause not traced) and Sili 72.7 (+6.8 s; the app detects few kicks after the drop).
   - All 13 are on new tracks. The confidence cannot separate them (see Totals).

## Ambiguous cases (my calls; an ear check can flip them)
- **Sub Focus 44.1 / 171.0:** audit drops, now alt. 44.1 is a groove entry still 5 dB under body; 171.0 is a 1.7 s cut. With the audit's set, Sub Focus scores 1 of 3.
- **Bad Co, impact vs groove (107.6 vs 110.3, 284.1 vs 286.9):** with the groove as the drop, the 284.4 fire becomes −2.5 s (1 miss + 1 false).
- **Sili:** the filtered return at 154.1 vs the full sub at 176.2. **Kanine RM 133.8** (a filter-down return) is alt; as a main drop it adds 1 miss.
- **Teaser stabs** (Napes 67.3, Bad Co 63.8 / 85.9) count as false. A VJ may accept them as energy entries.
- **Cut drops counted as main (type b)** follow the arrange design (Andy C 91.0 / 157.2). As alt, the recall changes.

## Not measured
- Why each miss happens inside `arrange.ts` (needs the capture, gap 1).
- Kick/snare precision (no hit labels).
- Line-in.
- The hits' sub-frame alignment to the offline flux (an.py's ≈ 17 ms shift; below the picture's 0.13 s/px).
- Any ear check beyond Sub Focus 146 s.
