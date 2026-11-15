# Audio-DSP: drop detector + DnB tempo/genre diagnosis (2026-11-16)

## TL;DR
- **New harness.** One capture per track records every input of the main-thread analysis chain (tempo → sync → style → arrange), in call order. An offline replay feeds the inputs back. On master's code the replay matches the live run exactly on 19 of 19 tracks: 0 mismatches in BPM, genre and drop fires. Every number below comes from this replay, on the SAME 19 captures.
- **Drops, base → recommended (D1 + D2):** hits 27/49 (55 %) → 33/49 (67 %); first drops 7/19 → 10/19; false fires 13 → 13; lag p50 +0.40 s unchanged. The 5 tuning tracks stay at 10/14 hits and 0 false. **The brief's targets are NOT met** (recall ≥ 75 %, false ≤ 3). No knob reaches them; the gap needs new evidence (§ Remaining).
- **Root causes, drops:** (a) a cut drop arms only after an unbroken run of raw `low` under 0.2·G, but real pre-drop cuts sit at 0.1–0.3·G and carry one-frame blips. (b) A breakdown drop fails `ret` (≥ 4× the break) when the break keeps bass at ≈ 0.3·G. A first drop that comes through the intro path gets no build term (conf .43–.45 < .56). (c) A no-dip drop never arms (the known ceiling). False fires: 6 of 13 are bass stabs after real breaks; no feature we have separates them at fire time.
- **Root cause, tempo/genre:** on two-step DnB the ODF's ACF peaks at 1.5 beats (116 BPM) and 2.5 beats (69.6 BPM, folded to 139). The techno and dubstep tempo windows contain these lags. So the classifier picks the wrong genre, and that genre's range then locks the wrong tempo. Fix T1 + T2: DnB tempo-at-ref 62 % → 69 %, genre-ok 39 % → 45 %, never classified 5 → 4. Rumble does not change.
- **Recommended:** D1 + D2 = one S coder step in `arrange.ts`. T1 + T2 = one S step in `tempo.ts` + `presets.ts`. Together (rec2): 32/49 hits, 13 false, tuning 10/14 with 0 false. **Lead/user call (D3):** a 0.5 s confirmation window cuts false fires 13 → 9 with no hit lost, but adds 0.5 s to every fire (lag p50 +0.92 s).

## Freshness
- 2026-11-16, audio-dsp (Opus 5.5). Code: master `cfc621e`. `web/src/audio` and `app.ts` are the same as at `081dfd1`.
- Captures from 01:24 to 01:41: headless Chrome on port 5176, app defaults (Auto on, no pick), 1.00×, 4 tracks in parallel. Underruns: 0 on 18 tracks, 1 on Monty. The Vite server on 5176 is stopped.
- Annotations: `scratchpad/trackview/annot.json`, unchanged (49 main drops).

## Harness (`scratchpad/dsp/`, git-ignored)
- **Capture:** `chain.mjs <track> <out.json>` = `trackview/dump.mjs` plus `page.route` wraps of `create{TempoSource,Sync,Style,Arrangement}` and `styleIn`. `web/` is not touched. It logs each call from page load: A = arrange in/out, I = style raw inputs, U = style out, O = ODF batch, P = onset, Y = sync out, R/D/H = setRange/double/halve. `batch.sh` runs it over the tracks. Output: `cap/<slug>.json`, 87 MB for 19 tracks.
- **Replay:** `replay/chain.ts` `replay(ev, mods)` re-runs app.ts frame()'s order: families → arrange → styleIn/style → active preset → setRange/snap → pushOdf → push/feed → at. Modules can be swapped (`replay/v/*`, `variants.ts`). `score()` applies the trackview rules (a hit = −0.5…+4 s; a fire near an alt counts neither way). `tempoShare()` gives the locked-frame shares at ref, ⅔, ½ and 4/5, plus the genre-ok share.
- **Validity:** `check.test.ts` gives `bad {Y:0, U:0, A:0}` on 19/19 tracks, for the full chain and for arrange alone.
- **Run:** `sh replay/run.sh ab` with `VARS="base;rec2"`. Also `sweep.sh` (drop knobs), `tsweep.sh` (tempo), `trace.test.ts` (the reason for each miss; the conf terms of each fire), `tempo.test.ts` (a 1 Hz tempo/genre trace) and `table.test.ts` (§ Before/after).
- **Live-run variance (not a harness error):** two live runs of one track can differ near the minConf edge. In this capture 1991 155.9 fires (conf .57); in the trackview dump it does not. Napes 89.5 lags +2.7 s here and +0.2 s there.

## Root causes: drops (base on the 19 captures: 22 misses, 13 false)
Each reason is the first `arrange.ts` condition that no frame meets inside the hit window (−0.5…+4 s); source: `trace.test.ts`, `out/trace-19.txt`.

**(a) Cut drops (8 in the audit).**
- `arrange.ts:101` resets `deep` on any music frame where raw `low ≥ 0.2·G`. Real pre-drop cuts break this rule in two ways:
  - *A one-frame blip.* Napes 248.5: low/G stays at .05–.13 from 245.9 s to 248.5 s, but one frame at 247.1 s reaches ≥ .2. The runs are 1.2 s and 1.4 s, both under `cutMin` 1.5 s. The track is not armed. The return at 248.62 s has its kick, but `live` is false.
  - *A shallow cut.* Bad Co 176.5: low/G moves between .12 and .30 from 174.1 s to 176.5 s. The cut is −10…−18 dB, mostly above −14 dB (= .2·G), so the longest run is .65 s. Same shape: Bad Co 132.4 (1.22 s), Sili 220.3 (.59 s, min .11), Agressor 44.1 (.37 s, min .09).
- *`low` never dips.* 1991 111.4: the longest run is 0.00 s. The 30–150 Hz band dips for 2.1 s, but the reese band (60–250 Hz) keeps content. Kritikal 31.1: run .67 s, and the return reaches only .52 of 4·ref.
- My annotation rule (< body − 10 dB ≈ .32 of body) is looser than CUT (< .2·G ≈ −14 dB). CUT's .2 came from Andy C, whose cuts are deep (2.75 s at .016·G). They still pass.
- 1991 155.9 fires in this capture (conf .57, intro path).

**(b) Drops after a breakdown (10).**
- *RET* (`arrange.ts:132`, low ≥ 4·ref): the break keeps bass at ≈ .3·G, so the return reaches only 3.7–3.9×. T>I 153.6: max low/(4·ref) .93. Sub Focus 55.5: .97. Bicep 66.2: .69 (its intro carries sub + bass).
- *Intro-path conf* (`arrange.ts:135`, `:140`): an intro that is never sparse leaves `peak` at 0, and the drop's kick lands off a stale grid after the kick-less build. T>I 44.8: [dur 1, ratio .62, align .12, peak 0] = .43. Sili 67.2: .45. Both are under minConf .56. The next return then fires late and counts as false: T>I 48.1 (+4.2 s), Sili 72.7 (+6.8 s).
- *Not armed:* Bad Co 107.6 (G is .18, learned in a bass-light intro, so the break never reads sparse); Sandstorm 70.3; Sili 176.2 (a filtered return at 154 s, the full sub at 176 s); Rumble 48.4 (a bass-carrying build); Rumble 117 (`cuts: false` under Dubstep, the documented ceiling).

**(c) No-dip drops (5).** 1991 67.6 (RET .95), A.M.C 44.1 (.76) and Kanine RM 67.6 (.70); Monty 55.9 and Kritikal 133.4 are not armed. Monty: low/G is 1.0–1.7 through the build (G .28), then two .4 s micro-cuts, then 2.3–2.6·G at the drop. Nothing arms. This is ruling (4)'s deferred ceiling.

**False fires (13).**
- *Intro entries without a beat grid (2):* Bad Co 14.8 (conf .57) and Sandstorm 18.2 (.56). The rule `intro && dur ≥ arm` fires any 4× return after 6 s of intro.
- *Late intro fires (2):* T>I 48.1 and Sili 72.7, see (b).
- *Stabs after real breaks (6):* Bad Co 63.8 / 85.9 / 262.4, Sandstorm 117.2 / 139.3, Napes 67.3. Each is armed (sparse ≥ 6 s) with ratio 1.0, peak 1.0 and conf .74–.80. Over the next 1 s, low/G is 1.3–4.7. The picture confirms that Bad Co 63.8 and 85.9 are 2–3 s bass stabs between breaks.
- *Other (3):* Kritikal 120.5 (inside a 23 s bass-carrying build); Enei 212.4 (a blip of ≤ .3 s: low/G is .30 over the next 1 s); A.M.C 171.4 (its intro never ends: 171 s of intro, peak 1 from a cut).
- *No fire-time separator* (measured on all 31 base fires): conf (hits .57–.98, false .56–.80); the ≥ 4 kHz step and the RMS step (the false fires have the bigger steps); align (2 of 6 stabs are off-beat, and 1 hit sits at .05); no beat grid (6 false, 4 hits).

## Changes tried (same 19 captures, full-chain replay; knobs in `replay/v/arrange_v1.ts`)
| variant | hits /49 | first /19 | false | lag p50 | tuning-5 | note |
|---|---|---|---|---|---|---|
| base (master) | 27 | 7 | 13 | +0.40 | 10/14, 0 F | |
| **D1** cut test on EMA(`low`, τ 0.1 s) < 0.3·G | 32 | 9 | 14 | +0.40 | 10/14, 0 F | + Agressor 44.1, Bad Co 107.6 / 132.4 / 176.5, Napes 248.5; + 1 F (T>I 136.5, a sub swell after a cut in its break) |
| D1 at τ .05 / .2, cut .35, cutMin 1.8 | 32 | 9 | 14 | +0.40 | same | all identical: a plateau, not a knife edge |
| D1 with cutMin 1.2 / raw `low` < .3·G | 32 / 31 | 9 | 16 / 14 | | | |
| **D2** an intro return fires only with a beat grid at its kick | 28 | 8 | 12 | +0.41 | 10/14, 0 F | − Sandstorm 18.2 F; + Sandstorm 70.3 (the intro now lasts until the first drop) |
| **D1 + D2 (rec-drop)** | **33** | **10** | **13** | **+0.40** | **10/14, 0 F** | |
| D1 + D2 + D3 confirm 0.5 s (mean low/G ≥ .6 over the wait) | 33 | 10 | 9 | +0.92 | 10/14, 0 F | − A.M.C 171.4, Sandstorm 117.2 / 139.3, Enei 201.5; every fire +0.5 s |
| D1 + D2 + confirm 0.3 s | 33 | 10 | 12 | +0.72 | same | |
| introArm 20 s | 27 | 7 | 13 | | 9/14 | Rumble 20.9 lost; the teasers only move later |
| intro conf without the peak term | 27 | 7 | 14 | | 9/14, 2 F | the intro teasers fire more often |
| intro peak from the riser | 26 | 6 | 15 | | 9/14, 2 F | |
| ret 3.5 / 3 | 26 / 25 | 7 | 16 / 19 | | 10/14, 1 / 3 F | the near-edge drops still miss (other conditions fail) |
| sustain .2 / .3 / .5 s | 20 / 19 / 19 | 5 / 4 / 5 | 15 / 11 / 8 | +.54 / +.88 / +1.08 | 7 / 6 / 6 of 14 | a longer sustain resets `rise`, and a restarted rise rarely starts near a kick |

**Ranked by gain / risk:**
1. **D1** (S; `arrange.ts:101` plus 2 knobs): + 5 hits, + 1 false, a plateau, the tuning set unchanged. CPU: one EMA per frame.
2. **D2** (S; one condition at `arrange.ts:141`): + 1 hit, − 1 false. It narrows the intro path only.
3. **T1 + T2** (tempo, § Tempo). Together with D1 + D2 (rec2): 32/49, first 9/19, 13 false, tuning 10/14 with 0 false. Sandstorm 70.3 flips back to a miss: the grid is now confident at the intro return (an interaction, ±1).
4. **D3, a lead/user call:** a 0.5 s confirmation removes 4 of 13 false fires (the short riff stabs and outro blips) at + 0.5 s on every fire (lag p50 +0.92 s ≈ 2.7 beats at 174 BPM). A cheaper shape for the design: the MilkDrop burst keeps the instant fire, and the autopilot cut waits for the confirmation.

## Remaining (no knob reaches it; design items)
- **Long stabs after real breaks (5 false: Bad Co 63.8 / 85.9 / 262.4, Napes 67.3, T>I 136.5):** the bass stays 1–4 s, so D3 keeps them. Unmeasured lever: confirm that the kicks continue (Bad Co 63.8 has 1 kick, then none for 11 s). If a VJ accepts them as energy entries (Bad Co 63.8 / 85.9 and Napes 67.3 are on the trackview ambiguous list), false drops by 3.
- **No-dip drops (5) + RET-bound breaks (3):** a second evidence path is needed (a full-mix / hats step after a riser while the bass stays). This is ruling (4)'s "density jump after a build peak" (M) → system-designer.
- **Intro first drops (T>I 43.9, Sili 65.9):** conf .43–.45 from align .12 + peak 0. Every intro lever above adds false fires.
- **Late / early intro fires (T>I 48.1, Sili 72.7 or 44.3), Kritikal 120.5 (a bass-carrying build), Rumble 117 (Dubstep cuts off), Rumble 48.4:** the known ceilings.

## Before / after: base vs rec2 (D1 + D2 + T1 + T2), 19 tracks
Fires in media s; h/m/f = hit / miss / false per the trackview rules (a fire near an alt counts neither way). Tempo at ref = locked frames within ±1.05 BPM of the reference; genre ok = frames with dnb (dubstep for Rumble). Totals: base 27/49 hits, 13 false, first 7/19, DnB tempo-at-ref mean 62 %, genre-ok mean 39 %, never classified 5 → rec2 32/49 hits, 13 false, first 9/19, 69 %, 45 %, 4. rec-drop alone (no tempo change): 33/49 hits, 13 false, first 10/19.

| track | drops | base: fires (s) · h/m/f | rec2: fires (s) · h/m/f | tempo at ref % · genre ok % (base → rec2) |
|---|---|---|---|---|
| 1991 | 67.6 111.4 155.9 | 156.2 · 1/2/0 | 156.2 · 1/2/0 | 42 → 98 · 34 → 34 |
| a-m-c-liftoff | 44.1 | 171.4 · 0/1/1 | 171.4 · 0/1/1 | 61 → 61 · 0 → 0 |
| agressor | 44.1 132.4 153.8 | 22.5 132.8 154.9 · 2/1/0 | 22.5 44.5 132.8 154.9 · 3/0/0 | 82 → 82 · 91 → 91 |
| andy-c | 46.9 91 157.2 | 47.3 91.4 157.6 · 3/0/0 | 47.3 91.4 157.6 · 3/0/0 | 71 → 71 · 68 → 68 |
| bad-company | 107.6 132.4 176.5 284.1 | 14.8 63.8 85.9 262.4 284.4 · 1/3/4 | 17.3 63.8 85.9 108.0 132.4 176.9 262.4 284.4 · 4/0/4 | 27 → 27 · 50 → 50 |
| bicep | 66.2 176.5 | 176.9 · 1/1/0 | 176.9 · 1/1/0 | 86 → 100 · 33 → 43 |
| darude | 70.3 92.4 180.7 202.7 | 18.2 93.9 117.2 139.3 181.1 203.1 · 3/1/3 | 92.8 117.2 139.3 181.1 203.1 · 3/1/2 | 64 → 58 · 0 → 82 |
| enei-stoned | 21.7 132.1 | 22.4 132.8 212.4 · 2/0/1 | 22.4 132.8 201.5 · 2/0/1 | 85 → 85 · 88 → 88 |
| kanine | 44.3 88.4 154.3 | 44.7 88.8 155.0 · 3/0/0 | 44.7 88.8 155.0 · 3/0/0 | 100 → 100 · 0 → 0 |
| kanine-release-me-vip | 67.6 | — · 0/1/0 | — · 0/1/0 | 99 → 99 · 0 → 0 |
| kritikal | 31.1 133.4 | 120.5 · 0/2/1 | 120.5 · 0/2/1 | 50 → 50 · 87 → 87 |
| monty | 55.9 165.6 | 12.9 165.9 · 1/1/0 | 12.9 165.9 · 1/1/0 | 26 → 37 · 0 → 0 |
| napes | 89.5 200.8 248.5 | 23.1 67.3 92.2 201.3 · 2/1/1 | 23.1 67.3 92.2 136.5 201.3 248.7 · 3/0/1 | 95 → 95 · 91 → 91 |
| place-2b-escape | 54.3 164 | 54.6 165.1 · 2/0/0 | 54.6 165.1 · 2/0/0 | 51 → 51 · 0 → 0 |
| sili-tronce | 65.9 176.2 220.3 | 72.7 · 0/3/1 | 44.3 · 0/3/1 | 0 → 50 · 0 → 19 |
| skrillex-rumble | 21 48.4 75.8 117 | 20.9 75.8 · 2/2/0 | 20.9 75.8 · 2/2/0 | 70 → 70 · 83 → 83 |
| sub-focus | 55.5 146.5 | 146.6 · 1/1/0 | 146.6 · 1/1/0 | 96 → 96 · 70 → 70 |
| t-i-fearless | 43.9 153.6 | 48.1 · 0/2/1 | 48.1 136.5 · 0/2/2 | 84 → 84 · 91 → 91 |
| voltage-godzilla | 43.9 109.7 153.6 | 44.3 110.1 154.0 · 3/0/0 | 44.3 110.1 154.0 · 3/0/0 | 0 → 0 · 0 → 0 |

## Tempo / genre: root causes (1 Hz traces, `tempo.test.ts`)
- **R1, the tempo source's pick on two-step masters.** The ODF's ACF peaks at 1.5 beats (116 BPM: kick → kick from 2.5 to 4, snare → kick) and at 2.5 beats (69.6 BPM, folded to 139 under the default range [90, 180)). PRIOR_BPM 128 (`tempo.ts:27`) favours 116 over 174 by 9 %. Fallback e′ (`sync.ts:92`) protects an existing 174 grid from ⅔ readings only. A fresh lock takes whatever the source reads:
  - Sili locks 115.8 at 6 s.
  - Voltage reads 116–117 for the whole track (ref 0 %).
  - 1991 holds 174 until its break, then goes to 87.1 and 116 (ref 42 %): see R3 for the path.
- **R2, the classifier's families.** `families` (`tempo.ts:168`) takes the best ACF lag inside each genre window; `near` (`tempo.ts:42`) = [lo/1.1, hi·1.1] × {½, 1, 2}. The techno window holds 116; the techno and dubstep ½ windows hold 69.6; the dubstep window holds 139.
  - Sili 7–21 s: fam dnb .38–.50, dubstep 1.00, techno 1.00 → techno at 21 s.
  - Monty 60–100 s: dubstep 1.00 → dubstep at 100 s. The sync relocked to 139.6 at 80 s, because the 4/5 reading is not a PARTNER.
- **R3, the octave bridge (the ½ path).** `snapOctave` (`presets.ts:24`, called at `app.ts:326`) doubles or halves without checking the band. Sili 116.3 → 232.3 at the techno pick; Bad Co 128.3 → 256.9 at the dnb pick. 1991 at 96 s: the break's families flip the genre dnb → techno, and the bridge halves 173.8 → 87.1 (outside [118, 135]). The 116.2 readings that follow are 4/3 of 87.1, so e′ ignores them, and the grid stays at 87.1 until 129 s, then moves to 116. All of these results lie outside their band.
- **R4, a stuck weak grid.** Under a wrong range the true tempo is outside `near`, so the readings stay under LOCK .3. The wrong grid is never replaced; its confidence decays to 0 while its BPM stays. Bad Co 125–195 s: conf 0.00, 123 → 128 BPM.

## Tempo / genre: fixes tried (same captures; DnB = 18 tracks)
| variant | tempo at ref: mean; tracks ≥ 80 % | genre ok | never classified | drops |
|---|---|---|---|---|
| base | 62 %; 8/18 | 39 % | 5 | 27/49, 13 F |
| T1 families cap: a window whose best lag is ⅔ or 4/5 of DnB's best lag (octave-folded, ±3 %) gets at most DnB's evidence, when DnB's evidence is ≥ .2 | 63 %; 8/18 | 45 % | 4 | same |
| T2 snapOctave returns `none` unless the snapped BPM lies inside the band | 66 %; 9/18 | 39 % | 5 | same |
| T3 PARTNER also at 5/4 (`sync.ts:92`) | 64 %; 8/18 | 39 % | 5 | same |
| **T1 + T2** | **69 %; 9/18** | **45 %** | **4** | same |
| T1 + T2 + T3 | 72 %; 9/18 | 45 % | 4 | same |

- Per track, base → T1 + T2: 1991 42 → 98; Bicep 86 → 100; Sili 0 → 50 (genre 0 → 19); Monty 26 → 37; Sandstorm 64 → 58 (genre 0 → 82: now classified dnb); Rumble 70 → 70 (dubstep 83 → 83). No change: Voltage 0, Bad Co 27, Kritikal 50, A.M.C 61.
- **Recommend T1 + T2.** Do NOT ship T3 as is: a DJ mix from 172.8–177.2 BPM into 140 would never relock (the same ceiling shape as e′). If wanted, gate T3 to "no genre range active": + 3 points (Monty → 78, Place 2b 51 → 68).
- **Risk of T1:** a techno track with a strong ⅔-beat lag inside DnB's window could be capped. This set has no techno track → gate on the techno arr fixture plus `style.test.ts` / `tempo.test.ts`.
- **Not fixed:** R1's fresh lock (Voltage 0 %, Sili 50 %, Bad Co 27 %) and R4 → a system-designer ruling (the bar test with these captures as its gate set, or the reading confidence measured outside the range).

## Annotation doubts
- Kept: Bad Co 63.8 / 85.9 = teaser stabs (the picture shows 2–3 s of bass between breaks).
- Still ambiguous: Napes 67.3 (half-time stabs); Bad Co 14.8 / 17.3 (the intro bass entry). T>I 48.1 is drop-related (+4.2 s), outside the +4 s window.
- A signal note, not a label error: 1991 111.4 is a 2.1 s cut in 30–150 Hz but no cut in `low` (30–250 Hz, kick-gated).

## Not measured
- Line-in. The worklet under a changed genre: the replay cannot re-run the worklet, so Dubstep's floors and reese band stay as captured (Monty after 100 s; the techno spans of Sili and Bad Co).
- The kicks-continue confirmation; T1 on a techno track.

## Coder notes (for the picked step)
- **D1** `arrange.ts`: add `cutLow`, an EMA of `low` (τ `cutTau` = 0.1 s) over music frames. `deep` counts while `cutLow < cut·G`; `cut` .2 → .3; `cutMin` stays 1.5. Tests: a 2.4 s cut at .25·G with one .5·G frame in its middle arms; an in-groove .8 s dip at .02·G arms nothing.
- **D2** `arrange.ts:141`: also require `!(intro && !live && kickBeat === null)`. Test: an intro return without a beat does not fire; with a beat it fires.
- **T1** `tempo.ts` `families`: the cap above, plus a test on a two-step train (kicks on 1 and the and-of-3, snares on 2 and 4): T_dnb ≥ T_techno.
- **T2** `presets.ts` `snapOctave`: `none` unless the result is inside the band. Test: 116 under [118, 135] → `none`; 87 under [160, 185] → `double`.
- **Replay gate:** `VARS="base;rec2" sh scratchpad/dsp/replay/run.sh ab` must give 32/49 hits, ≤ 13 false, tuning 10/14 with 0 false, and DnB tempo-at-ref ≥ 69 %. Copy the coder's arrange/tempo files into `replay/v/` and swap them in `variants.ts`.
