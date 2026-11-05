# Real-track audit: audio analysis + reactivity on the user's DJ tracks (2026-11-05)

## TL;DR
- On real DnB masters the snare and hats detectors are nearly silent: 0–0.5 snares/bar against ≈2. Snare/hats-bound params never move, and builds show no rolls. `FLOORS` were tuned on synth fixtures where a hit rises from silence.
- **0 of 11 DnB drops fired**; Rumble fired 1 of 4. The breaks keep `low` at ≈0.4×G, so `sparse` (0.35) rarely holds and `arm` (6 s) is never reached.
- Kick recall is ≈30–60%: the posted gate ratios pile up at the 1.5 threshold. Zoom pulses on about ⅓ of DnB kicks and idles through Rumble's drops.
- The classifier decides late or never (24 s / 61 s / 108 s / 133 s / never) and wrongly flips Bicep to techno at 200 s. While undecided, the default prior lets tempo slip to ⅔ (116) for ≈27% of Kanine.
- **The bass class works:** displace/turbulence move with the arrangement on all five tracks.

## Freshness
2026-11-05, master `b30bd10`, Chrome, ctx 44.1 kHz, `?debug`, Auto-style on with no pick, `builtin:td-feedback` held. Swarm's params were evaluated in-page with `bind.ts` `evaluate` on `__styled`. Re-run after any tuning.

## Method
- **Reference (offline, independent of the tracker):** log1p flux, ACF, salience Σ₈ACF(k·lag), then a refine over 64 lags. Octave taken in [120, 200). Result: all four DnB tracks 174.00 ±0.01 (the salience ties 87/174), Rumble 140.00 (ties 70/140).
- **Drops:** a per-bar profile (RMS dB of sub 30–60, low 30–150, hi ≥4 kHz). A drop is the bar where low/sub return to body level after ≥1 bar of reduced low. The auto rule (low +6 dB over 4 bars, within 4 dB of p90) finds Kanine's and Rumble's drops directly; the others were placed by eye from the profile.
- **Sections:** build = the 8 bars before a drop, drop = the 8 bars after it; body/break split by low ≥ p90−6 dB.
- **Hits:** `hitQueue.push` wrapped, aligned to the grid by an offline-flux shift (−16…−18 ms).
- **Offline replica of the snare/hats detectors** (`probe.py`) reproduces the app's rates (Kanine snare .12 vs .1/bar; hats 1.73 vs 1.6) and sweeps the floors.
- **Arrange trace:** `arr.mjs` serves `arrange.ts` with one injected state line, so the product tree stays untouched.

## Per track (drop + body; n = param normalised to its binding's min..max)
| Track | ref | bpm>0 / conf≥.6 | tempo off-ref | classifier | kick/snare/hats per bar | drops fired | build max | bass n p50 drop/body/break | zoom jumps/bar |
|---|---|---|---|---|---|---|---|---|---|
| Kanine *Feel The Vibration* | 174.0 | 4.0 / 4.5 s | ⅔ (116) 59–91, 103–121, 134–138 s (27%) | none (dnb ≤.27, techno .24) | 1.1 / 0.1 / 1.7 | 0/3 (44.3, 88.4, 154.3) | .20 | .37/.24/.11 | 0.7 |
| Sub Focus *Elevate* | 174.0 | 45.0 / 47.6 s | none 0–45 s (22%) | dnb @61 s | 0.8 / 0.3 / 1.9 | 0/3 (44.1, 147.9, 171.0) | .15 | .27/.18/.03 | 0.6 |
| Andy C *Who Like The What* | 174.0 | 4.7 / 39.1 s | 169–172 to 35 s, 176 @59–64 (40%) | dnb @108 s | 0.9 / 0.3 / 1.4 | 0/3 (46.9, 91.0, 157.2) | .05 | .34/.27/.12 | 0.7 |
| Skrillex *Rumble* | 140.0 | 4.6 / 9.0 s | 142 (+1.4%) 29–31, 43–47, 83–89 s (27%) | dubstep @24 s | 0.1 / 2.4 / 8.3 (drop) | 1/4 (75.8 ✓; 21.0, 48.4, 117.0 missed) | .47 | .38/.48/.31 | 0.7 (drop p90 .02) |
| Bicep *Glue* (Kanine bootleg) | 174.0 | 56.2 / 60.5 s | none 0–56 and 154–167 s (30%); outro ½/⅔ | dnb @133 → **techno @200** | 0.6 / 0.0 / 1.0 | 0/2 (66.2, 176.5) | .00 | .36/.18/.09 | 0.5 |

## Findings, ranked by impact on visuals
1. **Snare and hats are near-silent on DnB masters.** Every snare/hats-bound param idles: hueStep, the tunnel/spiral ⚡ flashes, edge, sparkle.
   - Before each drop the app fires 0–1 snares/bar; the offline 1–5 kHz flux shows 6–17 peaks/bar, i.e. the rolls exist in the audio.
   - At backbeat hops the band flux is p50 16–17 / p90 32–50, under `FLOORS.snare` 80. Tilt passes 84–93% of those hops, so `TILT` is not the blocker.
   - Snare floor sweep (DnB): 80 → 0–.33/bar; **40 → .85 / 1.48 / 1.79 / 1.93** (Bicep/Sub Focus/Kanine/Andy C), on-grid ≥.97; 20 → 3.4–5.1 (ghosts and hats creep in).
   - Hats sweep: 100 → 1.1–1.9/bar; **50 → 3.7–5.4**.
   - **But Rumble already fires 2.4/bar at 80, and 7.3 at 40.** A global floor cut over-fires dubstep, so per-preset `FLOORS` **needs design** (small): presets carry no detector floors, and `sens` scales only the envelopes after detection.
2. **Drops never fire on DnB.** No cut, no reset/spawn/explode, no heat flood.
   - Kanine trace through the 77–88 s break: slow/G stays .35–.39, `dur` peaks at 2.2 s against `arm` 6 s, so `live` stays 0. The return itself qualified: low/G 1.9, low/mean 7.3, a kick 0.77 s before.
   - Knob `sparse` .35 → **.5**: on this trace slow/G < .5 for ≈9 s, so it arms.
   - `refractory` 30 → **20 s**: drops sit 23.1 s apart (Sub Focus) and 27.4 s apart (Rumble).
   - `GRACE` 1 → **≈8 s**: Rumble's 48.4 drop follows a 7 s bass-carrying build after its break (⚠️ from the profile, not traced).
   - `warmup` 20 s misses Rumble's 21 s drop (14 s of music); minor.
   - **Needs design:** bass-cut drops (all three of Andy C's: a 1.4 s low cut with the drums running) and the first drop after a bass-less intro (G is learned in the intro).
3. **Kicks are missed (≈30–60% recall).** DnB fires 0.4–1.2/bar against ≥2; Rumble's drops fire 0.1/bar.
   - Posted ratios on DnB are p10/p50 1.51/1.58, and 60–76% sit under 1.7, so the threshold cuts the kick population.
   - Knob: a kick-only `TRANSIENT` 1.5 → **≈1.35**, above the ruling's ≤1.30 bound for sustained bass.
   - ⚠️ Precision is already weak on Bicep (body on-grid .17) and Kanine (.4–.6): bass stabs read as kicks (ruling ceiling). Check precision when tuning.
4. **Tempo errors while the classifier is undecided.** The default prior (`PRIOR_BPM` 128, σ 1 oct) weights 116 at .99 and 174 at .91, and the DnB 2-step has a real 1.5-beat kick period (3-and → 1).
   - Knob: `PRIOR_BPM` → ≈150 (⚠️ check techno/house for 4⁄3 errors).
   - No lock in beat-light intros (Sub Focus 45 s, Bicep 56 s) and a slow start on Andy C (169–172): **needs design** (acceptable?).
5. **The classifier is late, never decides, or picks the wrong genre.**
   - S = T·(.5+.5·match). T (ACF prominence, `PROM_NONE` 2 / `PROM_FULL` 7, shared with the sync confidence) stays ≈.2–.4 on real masters (derived: S ≤ T), and the match is depressed by the drum misses (kick/hat per beat ≈ ½ / ⅕ of `proto`).
   - Techno's ±10% window (`MARGIN` 1.1) holds DnB's ⅔ reading (116), so techno ≈ dnb on Kanine and Bicep's ⅔ outro flips the pick to techno.
   - Re-measure after items 1 and 3. A separate families mapping and a ⅔/½-relation check **need design**.
6. **Rumble's snare storms.** 2.4 snares/bar, only 14–34% on the half-time backbeat, 33 gaps < ⅛ in build+drop, and 12 build snares within ±25 ms of a kick (the kick-click residual). This is the ruling's bright-growl ceiling (decay check): **needs design**. Beat-1 snares are unmeasurable on DnB until the snare fires (the 16th-slot folds of these masters are flat).
7. **The bass sources are fine** (n p50/p90): sub drop .21–.34 / 1.0, reese/wobble rest at 0, and the bass class (reese for DnB, wobble under dubstep) tracks drop > body > break. Minor: raw `wobbleDepth` reads .9–1.0 in quiet intros/outros (Rumble intro p50 .97); nothing binds it raw today.

## Reaction spot-check (harnesses + dumps: `scratchpad/real/`, git-ignored)
- **DnB:** zoom (kick) p90 .6–.9 but only 0.5–0.7 jumps/bar (≈⅓ of kicks); burst (kick, swarm) p50 0 / p90 .36–.69 in the body; displace/turbulence (bass class) as in item 7. **Dubstep:** zoom and burst idle in the drops (p90 .02 / 0; 0.1 kicks/bar); displace/turbulence ← wobble drop p50 .38 / p90 .86.
