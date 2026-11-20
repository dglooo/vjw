# DSP: genre profiles (psytrance, DnB, techno, house) + a melodic layer, measured (2026-11-21)

## TL;DR
- **Genres: one 4/4 knob set covers psy, techno and house; DnB keeps its own.** On 6 synthetic 4/4 fixtures (118–150 BPM) the tempo is right 6/6 and Auto already picks Techno/house 6/6. The faults: off-beat house bass reads as kicks (P .56–.62), 1-bar fills fire false drops, and 0/6 real drops fire on time.
- **The proposed 4/4 profile** (kick `minGap` 0.3 s, `cuts: false`, arrangement `low` = sub): kick P ≥ .99 on 6/6, real drops 6/6 at +0.27 to +0.36 s, false fill drops 4 → 0. Worst case on real DnB (Auto wrong for a whole window): kick R .703 → .674, drops 6/14 unchanged (+1 false). Psytrance and House become manual-pick presets with the 4/4 knobs.
- ⚠️ **We have no real psytrance, techno or house track: every 4/4 number is synthetic.** The lead asks the user for 3–5 tracks per genre.
- **The melodic layer** (8 tracks, demucs stems as truth, leave-one-track-out): `tonal` (1 − flatness, 300–3000 Hz) has ρ median .64 with the harmonic share. `pitch` (chroma argmax) agrees .63 median (chance .08). `voice` reaches J .50 (TPR .31–.89, FPR .05–.44) and opens on 73 % of Sandstorm's lead-only frames, so it is not a "words only" gate. `lead` reaches J .36: not shipped.
- **Cost:** ≈ 50 µs of JS per frame on the main thread + one 4096 `AnalyserNode`. The plan has two lanes (§7): G1–G2 (genre) ‖ M1–M2–D1 (melody).

## Freshness
- 2026-11-21, `dev` @ `9aa5585` (clean). Read: `dsp_kick_snare_misses_2026-11-20.md` §6–§7; `agents/backlog.md` § Audio input (lines 50, 52, 60); `web/src/audio/{presets,style,settings,analysis,bands,drums,tempo,features,arrange,energy}.ts`; `web/src/bind.ts`; `web/src/app.ts:267–500` (the frame loop).
- The harness baseline reproduces the lead's post-merge A/B exactly: kick R .703 / P .789, snare R .668 / P .624 on the same 8 windows. So `replay2.mjs` without env knobs is the live tree (a hit-for-hit check on `fx_house`: identical).
- Stale when `drums.ts`, `features.ts`, `arrange.ts` or `presets.ts` change, or when real 4/4 tracks arrive. The 4/4 rows in §3–§4 must then be re-measured.

## §1 Signals needed (the brief, user 2026-11-21)
1. Genre profiles: psytrance (~138–150 BPM, a rolling off-beat bass), drum and bass (~170–176), techno (~125–140, 4/4), house (~118–128, 4/4). Which knobs differ, and why (measured)? Is Auto enough, or is a manual pick needed?
2. A melodic layer: lead/synth presence, a melody / pitch class (chroma), harmonic vs percussive energy, vocal presence («рожа пела только на словах»), risers/builds.
3. A signal contract for `bind.ts`, and coder steps with tests.

## §2 Dataset, truth, harnesses (all in `scratchpad/dsp-genre/`, git-ignored)
- **Synthetic 4/4 fixtures** (`fx.ts`, the drums of `web/src/audio/synth.ts`): psy 145 / 150 (kick + a rolling KBBB 46 Hz bass, 16th hats, no clap), techno 132 / 140 (kick + rumble + clap on 2 and 4 + open hats), house 124 / 118 (kick + off-beat bass + clap).
  - Each fixture runs intro 8 bars (drums only) → full 16 (+ bass + lead arpeggio) → break 8 (pad + lead + riser) → drop 16.
  - psy and techno have a 1-bar fill (no kick, no bass) at full bar 12.
  - Truth: every drum, bass and lead note time, the bass entry, the break, the drop. Files: `out/fx_<g>.f32` + `.json`.
- **Real windows**: the 8 `dsp-misses` windows (7 DnB + Rumble; refs `dsp-misses/out/ref_*.json`), drop truth `trackview/annot.json`.
- **Stems**: demucs htdemucs 4 stems (`sep/htdemucs/<track>/`), on Sandstorm, Monty, Sili, Sub Focus, Kanine Release Me VIP, Rumble, Bicep Glue, Place 2b Escape.
- **Harnesses**:
  - `replay.ts` = `dsp-ab/replay.ts` (the app's file chain at 60 fps, Auto classifier on), plus a drops / style / `low` log.
  - `replay2.ts` = the same on `src/` copies with env knobs: `MIN_GAP`, `XT=0`, `FLAT`, `FLATV` (`src/drums.ts`); `LOW=sub`, `CUTS=0` (arrangement inputs).
  - `score_fx.py` (fixtures), `../dsp-misses/agg.py` (R/P), `drops.py` (drops vs `annot.json`), `mel.py` (melodic features + evaluation), `voicefpr.py`, `cost.mjs` (JS cost).

## §3 Genre profiles: the baseline (the live tree, Auto)
**Synthetic 4/4 fixtures** (`out/base_*.json`, `out/fx_table.txt`). A drop is "on time" when it fires within 0.5 s after the truth.

| fixture | tempo at ref | Auto pick | kick R / P | clap R / P (false snares) | drops fired vs truth |
|---|---|---|---|---|---|
| psy 145 | 1.00 | Techno, from 24 s | 1.00 / 1.00 | no clap (89 false) | entry ✓ · fill ✗ 36.1 · drop +2.1 s late |
| psy 150 | 1.00 | Techno | 1.00 / 1.00 | no clap (14 false) | entry ✓ · fill ✗ 34.9 · drop +2.7 s late |
| techno 132 | 1.00 | Techno | 1.00 / .99 | .64 / .54 | entry ✓ · fill ✗ 39.5 · drop **missed** |
| techno 140 | 1.00 | Techno | 1.00 / 1.00 | .69 / .61 | entry ✓ · fill ✗ 37.3 · drop **missed** |
| house 124 | 1.00 | Techno | 1.00 / **.62** | .64 / .54 | entry ✓ · drop **missed** |
| house 118 | 1.00 | Techno | 1.00 / **.56** | .61 / .53 | entry ✓ · drop **missed** |

**Causes (one per fault, from the replay logs):**
1. **The off-beat bass of house reads as a kick.** The bass note half a beat after the kick is a 40–150 Hz onset: it trips the kick gate (`KICK` 1.35, share > 0.2). `MIN_GAP` 60 ms lets it through. All 98 false kicks (124 BPM) sit within ±30 ms of a bass note.
   - The rolling psy bass did NOT trip the gate here (kick P 1.00): 46 Hz plucks 103 ms apart keep the 40 ms follower high. ⚠️ A real psy bass is louder and sharper and is sidechained, so it may trip the gate: unmeasured.
2. **A 1-bar fill fires a false drop.** A fill with no kick and no bass lasts 1.66–1.82 s at 132–145 BPM, so it passes `cutMin` 1.5 s as a deep cut. The 20 s refractory that follows delays the real drop (GRACE, +2.1 to +2.7 s) or swallows it. The `arrange.ts` header already names this ceiling ("a techno 1-bar fill (1.875 s) passes").
3. **The break of techno and house never reads as sparse.**
   - In a 4/4 groove the kick-gated `low` (sub + reese `held`) is small: sub .01–.05, reese .01–.05. The kick gate + HOLD 0.2 s covers ≈ 40 % of each beat.
   - The pad of the break plays in the reese band (60–250 Hz) at .02–.03, so the break's `low` ≈ .65 G stays over `sparse` .6. As a result `build` reads 0.00 through the whole techno break, and no drop fires.
   - The sub band (30–60 Hz) falls 15–60× in the break (.0008).
4. **Claps and leads in the snare band.**
   - In 4/4 every clap (beats 2 and 4) sits on a kick. The kick/snare crosstalk rule drops a clap unless it is stronger, so clap R is .61–.69.
   - Bright lead plucks read as snares: 14–89 false snares per fixture, 80–90 % of them on a lead-note onset.

**Real DnB windows** (`out/rb_*.json`). The classifier picks (Auto, replayed from the track start):
- Rumble → Dubstep from 26 s ✓.
- Sub Focus → DnB from 61 s ✓. Sili → DnB from 100 s ✓.
- Kanine, Sandstorm, Bicep, Monty → no pick, so Default. This is harmless: Default carries the DnB drum knobs.
- 1991 → DnB from 25 s, then **Techno from 95.6 s (49 % of its frames) ✗**.
- Drops on the same windows (`drops.py`, a hit = a fire within −0.5 to +2 s of a main drop of `annot.json`): 6 / 14 hit, 1 alt, 3 false.

## §4 Genre profiles: the change, A/B on the SAME dataset
**Proposed 4/4 knob set `p3`:** kick `minGap` 0.3 s (one kick per beat region at 118–150 BPM), `cuts: false`, and the arrangement's `low` = `raw.sub` only. DnB, Dubstep and Default do not change.

| fixture | kick P base → p3 | real drop base → p3 | false fill drops base → p3 |
|---|---|---|---|
| psy 145 | 1.00 → 1.00 | +2.1 s → **+0.31 s** | 1 → 0 |
| psy 150 | 1.00 → 1.00 | +2.7 s → **+0.32 s** | 1 → 0 |
| techno 132 | .99 → .99 | missed → **+0.32 s** | 1 → 0 |
| techno 140 | 1.00 → 1.00 | missed → **+0.27 s** | 1 → 0 |
| house 124 | **.62 → 1.00** | missed → **+0.36 s** | — |
| house 118 | **.56 → 1.00** | missed → **+0.35 s** | — |

- Kick R stays 1.00 on all 6 fixtures. The bass entry after the intro still fires on 6/6: this counts as a drop for a scene, as on Bicep.
- **The cost if Auto misreads DnB as 4/4** (worst case: the 4/4 knobs on all 8 real windows for their whole length, `r44`; it also carried `XT=0`, which moves snares by .001):
  - kick R .703 → .674 (Sub Focus .64 → .57), P .789 → .785;
  - snare unchanged (.669 / .624);
  - drops 6/14 → 6/14, false 3 → 4.
  - The real exposure is one window (1991 from 95.6 s), so this cost is an upper bound.
- **Rejected knobs. Their numbers, so that no one retries them blind:**
  - `XT=0` (keep a clap on a kick): clap R → 1.00, but snare P falls to .47–.49, because every lead pluck and kick click passes.
  - Snare-band spectral flatness as a detector gate (`FLAT` .5): fixture snare P .54 → .95, but **real DnB R .668 → .644, P .624 → .531**. A vetoed hop's ODF of 0 lowers the detector's mean, which lets more hits through.
  - The same flatness as a veto on the posted snare only (`FLATV` .4 / .5): DnB R .668 → .562 / .425, P only .624 → .641 / .651.
  - Why both fail: in a dense master the snare hop also holds reese and pad partials, so it is not noise-like.
  - The 4/4 snare (claps on kicks, leads as snares) stays open until real techno/house tracks exist.
- **Tempo windows: none are needed on this evidence.**
  - All 6 fixtures read tempo at ref 1.00 under Default (fold [90, 180), prior 128).
  - Under Techno [118, 135], psy 150 also reads right: the onset fit corrects the edge candidate.
  - Dubstep's [135, 150] breaks house 118 (at ref 0.00). So a Psytrance band of [135, 150] is safe only as a manual pick.
- **Auto vs manual.**
  - `style.ts` finds the 4/4 *family* (6/6 fixtures, after ≈ 24 s). Within the family only the tempo separates the genres, and their real tempo ranges overlap: progressive psy 132–138 ≈ techno, tech house 124–128 ≈ techno.
  - The knobs are identical, so a three-way split buys nothing measurable. Keep the classifier's 3 classes.
  - Add **Psytrance** and **House** as manual-pick presets with the 4/4 knobs (the user's names in the picker), and rename the Techno / house entry to **Techno**.
  - On real DnB, Auto is right on 3/7 windows, silent on 3/7 (Default = the DnB knobs) and wrong on 1/7. A manual pick (or the manual BPM lock) stays the reliable path in a DJ set.
- **Contract impact:**
  - `drums.ts` `Knobs` gains `minGap` (s; default 0.06; the 4/4 presets 0.3). It travels in the worklet config as today, and `bandKey` already serializes the knobs.
  - `Preset` gains `low?: 'sub'` (missing = sub + reese); app.ts and the replay feed `arrange.update`.
  - `PresetId` gains `psy` and `house`, which are not `Genre`s: no `proto`, and the classifier does not score them.
- **Open (no data):**
  - a Low/Mid/High sensitivity (`dsp_kick_snare_misses` §6);
  - growl vs snare (Rumble R .31 / P .28: unchanged);
  - a real rolling psy bass;
  - a techno rumble bed under the kick (the §4.2 held-bed trap of the misses study, unmeasured on 4/4).

## §5 The melodic layer: measured on 8 tracks (demucs stems as truth, `out/mel_eval.txt`)
**Setup.**
- Mix frames: 60 fps (hop 800 at 48 kHz). Causal features come from a 4096-point Blackman FFT: an `AnalyserNode` with `fftSize` 4096.
- "On" truth: a stem's RMS over the newest 1024 samples is > −38 dBFS and > the mix RMS − 14 dB (`ai/voice/cal.py`).
- Models: a logistic regression, trained on the other tracks. J = TPR − FPR at the threshold picked on the training tracks. "Oracle" = the best threshold on the test track itself, as the backlog numbers used.

**Voice** (7 tracks with vocals; Sandstorm has none):

| features | EMA 0 | 167 ms | 333 ms | 667 ms |
|---|---|---|---|---|
| 8 bands + flatness + peakiness (the `cal2.py` set) | J .42 (oracle .48) | .44 (.52) | .41 (.50) | .33 (.46) |
| + causal HPSS share, MFCC 0–12, vocal variance (1 s σ of MFCC 1–5), chroma peak, pitch salience (31 in all) | .44 (.49) | **.50** (.55) | .49 (.55) | .44 (.53) |

- At 167 ms, TPR / FPR per track: Monty .82 / .31, Sili .89 / .33, Sub Focus .82 / .44, Kanine RMV .67 / .05, Rumble .31 / .07, Bicep .76 / .12, Place 2b .87 / .23. The output flips 1.0–2.4 times per second.
- **The trap: leads read as voice.** On Sandstorm (no vocals, lead-heavy) the voice output opens on 67 % of the frames and on 73 % of the lead-only frames. On Sub Focus it opens on 64 % of the lead-only frames.
  - The harmonic cues add only +.06 J, because leads are harmonic too. The singing-voice literature names the same failure: detectors confuse the voice with pitch-varying instruments ([Lee, Choi, Nam 2018](https://arxiv.org/pdf/1806.01180); [Lehner et al., ICASSP 2014](https://dblp1.uni-trier.de/rec/conf/icassp/LehnerWS14.html)).
- The backlog's "J .40–.65 with smoothing" was the oracle J on 2 tracks. The honest cross-track number is .44 → .50.

**Lead / synth presence** (the `other` stem on, 8 tracks): best leave-one-out J .36 (worst track .05–.08). The best single features are peakiness .26, salience .25 and MFCC1 .24. **Do not ship a `lead` source.** In these mixes `other` = pads + FX + risers + stabs + leads; it is not one class.

**Harmonic vs percussive.** The truth is continuous: the energy of (vocals + other + bass) over all four stems, 200–5000 Hz. The table gives Spearman ρ against each mix feature, smoothed 333 ms:

| mix feature | Sandst. | Monty | Sili | SubF | Kanine | Rumble | Bicep | Place2b | median |
|---|---|---|---|---|---|---|---|---|---|
| **1 − flatness (300–3000 Hz)** | .57 | .55 | .23 | .72 | .71 | .26 | .79 | .73 | **.64** |
| peakiness (300–3000 Hz) | .56 | .25 | .42 | .71 | .63 | .45 | .69 | .75 | .60 |
| pitch salience (harmonic sum, f0 100–800 Hz) | .52 | .34 | .12 | .53 | .61 | .09 | .71 | .66 | .53 |
| causal HPSS share (9-frame median) | .29 | −.07 | −.28 | .34 | .37 | −.36 | .54 | .40 | .32 |

- Weak on Sili and Rumble (growls and distorted bass are harmonic, yet dense).
- A causal median filter (the time direction of [FitzGerald, DAFx 2010](https://www.audiolabs-erlangen.com/resources/aps-w23/papers/2010_FitzGerald_HarmonicPercussiveSep_DAFx.pdf), past frames only) does not track the truth here. Use 1 − flatness.

**Pitch class (chroma).** The test frames: the vocal or the other stem is on. The truth: the argmax of the chroma of vocals + other from an 8192-point FFT. Chance = .083.
- Mix chroma (100–2000 Hz, 4096-point FFT): argmax agreement .27–.63 unsmoothed. With a 167 ms EMA: **.43–.77, median .63**.
- The cosine of the smoothed 12-bin chroma to the truth: .76–.88.
- The chroma of the causal-HPSS part is no better (.37–.71).
- The argmax is "the loudest pitch class": often the key root or the held note, not each melody note. It is a usable key colour, but not a melody tracker.

**Latency, cost, placement.**
- Latency: the 4096 window is 85 ms (its centre ≈ 43 ms old) + an EMA τ of 167 ms. A change shows ≈ 0.15–0.25 s after it is heard.
- Cost: `cost.mjs` measures **≈ 50 µs per frame** of JS on this Mac. One frame does dB → power on 2049 bins, chroma, flatness, peakiness, a 40-band mel + 13 DCT, a 1 s MFCC variance ring and the 31-weight logistic. Add one native `getFloatFrequencyData` (4096).
- Placement: the main thread. The worklet's 512-point FFT has 93.75 Hz bins, so it cannot resolve pitch classes under ≈ 1.5 kHz.

**Risers / builds:** already covered by `arrange.ts` `build` (the log2 ratio of the ≥ 4 kHz EMAs). Not re-measured here.

**A better voice: gap, Tier 3.**
- (a) A pretrained singing-voice CNN on log-mel ([Schlüter & Grill, ISMIR 2015](https://www.ismir2015.uma.es/articles/264_Paper.pdf)), in a worker. This is a model dependency, and it is unmeasured on DnB, where synth leads are dense.
- (b) For a loaded file: an offline vocal-activity curve from a separation pass (demucs-class) before or while playing. A line-in cannot do this.

## §6 The signal contract (new `bind.ts` sources; group `melody` in `sourceGroups`, after `arrangement`)
All three sources come from one new `AnalyserNode` (`fftSize` 4096, `smoothingTimeConstant` 0) on `hub` (`audio/input.ts:24–25`), read once per frame in app.ts. They are written into `src` before `gain()`, so the Sources tab gain and mute apply to them. None is in an Auto-style map.

| id | range | computed (per frame, from the 4096 dB bins) | smoothing | one-line use |
|---|---|---|---|---|
| `tonal` | 0..1 | 1 − spectral flatness of the 300–3000 Hz bins (geometric / arithmetic mean of the power), mapped linearly [.60, .95] → [0, 1] and clamped. Real tracks span p5 .58–.75 / p95 .90–.98 | EMA τ 0.33 s | glow, bloom and softness rise with pads, vocals and leads, and fall in drum-only sections |
| `pitch` | [0, 1) = pitch class / 12 (C = 0 … B = 11/12) | the chroma: power summed per pitch class over the 100–2000 Hz bins, EMA τ 0.167 s on the 12-vector. The argmax switches only when the new class is ≥ 1.1 × the held class | none: a step value | key colour: a scene crossfades its palette toward hue = `pitch` over ≥ 0.3 s. Never one-pole a hue: 11/12 → 0 would sweep the whole wheel |
| `voice` | 0..1 | the 28-feature logistic of `scratchpad/dsp-genre/out/voice_model.json` (μ, σ, w, c; trained on 7 tracks) on the features smoothed τ 0.167 s | inside the model | a soft mouth / face level or a vocal glow. Not a gate: it opens on leads (FPR .05–.44) |

- **The `voice` features, in the model's order** (`mel.py` `NAMES` without `hshare`, `chromapk`, `salience`; 4096 bins at 11.72 Hz; P = power):
  1. 8 band log10 energies: 20–60, 60–250, 250–500, 500–1k, 1–2k, 2–4k, 4–8k, 8–16k Hz.
  2. Flatness of 300–3000 Hz.
  3. Peakiness: the mean of max(0, log10 S − its 7-bin moving mean) over 300–3000 Hz.
  4. MFCC 0–12: a 40-band HTK mel from 0 to 8 kHz, log10 of the power, then an unnormalised DCT-II.
  5. The σ of MFCC 1–5 over the last 60 frames.
  - The threshold that maximises J on the training tracks is p = .256. A scene that wants a bool binds `voice` with amount ≈ 2 (on at .5 ≈ p .25).
- **Not shipped:** `lead` (J .36); a separate `harmonic` source (`tonal` is that signal); a 12-float chroma uniform for shaders. A shader param `uniform float voice; // = 0` already binds to any source (`fx/glsl.ts:39`), so `iVoice` needs no new uniform.
- **Consumers that gain most** (⚠️ the lead checks the exact input names):
  - the AI «Singing face» (`scratchpad/ai/face2.glsl`): mouth on `voice`, which replaces its one-frame band gate;
  - vs3 Visage / Chorus Hall: mouth or gaze intensity on `voice`;
  - scenes with a float hue input (`grep hue scenes/*.ts`: fluid, glitch, creatures): a palette drift on `pitch`;
  - glow-heavy scenes (bloom-glitch, halo, boreal, the AI Neuro Cathedral rings): bloom on `tonal`.
- **Flash safety:** `pitch` jumps by design. A saturated-red ↔ other-hue swap is a WCAG 2.3.1 red flash even at an equal luma, and the app-wide gate (`gl/post.ts`) counts luma steps only. ⚠️ Assumption, needs confirmation: that the gate does not see red flashes. Bind hue to `pitch` only through a ≥ 0.3 s crossfade.

## §7 The step plan for the coder (one step per dispatch, worktree off `dev`, ponytail first)
| step | change (files) | test (Vitest) | acceptance |
|---|---|---|---|
| **G1** 4/4 presets + kick `minGap` (S) | `drums.ts`: `Knobs.minGap` (s) replaces `MIN_GAP`; `KNOBS.minGap` 0.06. `presets.ts`: `PresetId` += `psy`, `house` (not `Genre`: no `proto`); `techno` renamed "Techno"; new "Psytrance" (bpm [135, 150]) and "House" (bpm [118, 130]); all three get `knobs: { ...KNOBS, minGap: 0.3 }`, `cuts: false` | `drums.test.ts`: (1) 4/4 kicks + an off-beat 55 Hz pluck (0.2 s, 80 ms decay, at +½ beat): kick P ≥ .95 at `minGap` 0.3, < .8 at 0.06; (2) the existing 16th double-kick test still passes at the default. `settings.test.ts`: `pick: 'psy'` parses; `workletBands(s, 'house').knobs.minGap === 0.3` | gates green. The lead re-runs `scratchpad/dsp-genre`: house 124 / 118 kick P ≥ .95, psy and techno unchanged, the 8 DnB windows identical to `rb` (kick .703 / .789, snare .668 / .624) |
| **G2** arrangement `low` = sub for 4/4 (S) | `presets.ts`: `Preset.low?: 'sub'` on the three 4/4 presets. `app.ts:426`: `low: PRESETS[configured].low === 'sub' ? features.raw.sub : features.raw.sub + features.raw.reese` (as `cuts` reads `configured`). The same line in `scratchpad/dsp-genre/replay.ts` | `arrange.test.ts`, RED first (SDLC §6): a 4/4 groove of kick + rumble (no held bass) with a 175–260 Hz pad in the break, built as `scratchpad/dsp-genre/fx.ts` builds `fx_techno`. Under sub + reese no drop fires (as measured); with `low` = sub the drop fires ≤ 0.5 s after the truth | the lead's fixture replay: real drops 6/6 within +0.4 s; false fill drops 0 (from 4); DnB windows unchanged: drops 6/14, false 3 |
| **M1** `melody.ts` + `tonal`, `pitch` (M) | new pure `audio/melody.ts` (`createMelody(sampleRate, fftSize)`, `update(magDb, dt, quiet)` → `{ tonal, pitch }`); `input.ts` `analyser4k`; app.ts reads it once per frame and writes `src.tonal`, `src.pitch`; `bind.ts` `SOURCE_IDS` + group `melody` | `melody.test.ts` (magDb frames built in the test as `replay.ts` `analyser()` does): an A 440 Hz saw → `pitch` = 9/12 after ≤ 20 frames, `tonal` > .8; white noise → `tonal` < .2; silence (−Infinity) → no NaN, `pitch` holds; `bind.test.ts`: groups cover `SOURCE_IDS` once | gates green; the frame-time delta reported (budget ≤ 0.1 ms p50; `cost.mjs` measured 50 µs) |
| **M2** `voice` (S) | `melody.ts`: the 28 features + the logistic, constants pasted from `voice_model.json` (with a provenance comment); `src.voice` | `melody.test.ts`: `voice` stays in [0, 1] and is NaN-free on silence, white noise and a saw; the same input gives the same output (no synthetic ranking is claimed: none was measured) | parity: the 28 JS features on Kanine RMV vs `out/mel_12-Kanine-Re.npz` `X` (columns per `voice_model.json` `cols`): \|Δ\| / σ < .05 on 95 % of the frames (venv python + numpy, by the coder) |
| **D1** docs (S) | `docs/ai-shader-guide.md`: `tonal`, `pitch`, `voice` as bindable params, their ranges and the `voice` caveat | — | — |

Order: G1 → G2 (genre lane) ‖ M1 → M2 → D1 (melody lane). The two lanes touch disjoint files except `app.ts` (one line each).

- [x] **G1** (frontend-coder 2026-11-21): the drums.test.ts pluck test measured P 1.00 / R 1.00 at `minGap` 0.3 and P .50 / R 1.00 at 0.06. **Changed during implementation:** (1) `synth.ts` (the test fixtures) gains `tone` + `norm`, copied from `fx.ts`: the drums test (pluck) and the arrange test (pad, rumble) share them. (2) The three 4/4 presets spread one `FOUR` base, so Psytrance and House also carry Techno's Auto-style `map` (onset → kick, treb → hats). (3) Picker order: Default, Drum & Bass, Dubstep / bass, Psytrance, Techno, House.

## §8 Risks, ambiguous cases, gaps
- **No real psytrance, techno or house track.** Every 4/4 number is synthetic: one drum kit (`synth.ts`), one bass per genre, one lead, no master chain. Ask the user for 3–5 tracks per genre (FLAC/WAV in `tracks/`, never committed). Then re-run `replay2.mjs` on 70 s windows with drum refs (`dsp-misses/ref.py` on demucs `drums` stems) before G1/G2 ship as more than a manual pick.
- **A real rolling psy bass** may trip the kick gate: the synthetic one did not. `minGap` 0.3 s suppresses a bass note only after a detected kick. If a bass note leads, the real kick is lost for 0.3 s.
- **`minGap` 0.3 s removes 16th kick rolls and double kicks** in the 4/4 presets, by design: one hit per beat region.
- **`low` = sub assumes that a 4/4 break drops the 30–60 Hz band.** A break with a sub drone never reads as sparse, as today's `low` does with a pad.
- **The 4/4 snare stays weak** (clap R .61–.69; lead plucks as snares). Every tested knob fails on real DnB or on P (§4). Growl vs snare (Rumble) is unchanged.
- **The classifier misreads 1/7 DnB windows as 4/4** (1991 from 95.6 s). With G1+G2 the measured worst-case cost is kick R −.03 and +1 false drop per 8 windows.
- **`voice` opens on leads** (Sandstorm 67 %, Sub Focus 64 % of the lead-only frames). It was trained on 7 tracks (5 DnB + Rumble + Place 2b), and its worst leave-one-out J is .20. Other genres are unknown. The robust routes (a CNN, or offline separation for files) are Tier 3.
- **`pitch` is the loudest pitch class** (often the key root), not the melody: agreement is .43 on Monty and .77 on Sandstorm.
- **Demucs truth is imperfect:** `other` and `vocals` bleed into each other. The "on" rule (> −38 dBFS and > mix − 14 dB, from `cal.py`) is a choice, not ground truth. Frames near that threshold are ambiguous: counted as truth, they lower every J above.
- **The house fixture is regenerated** (an off-by-one fill bug removed the last intro bar's kicks). Every house number above comes from the corrected file.
- **No browser run:** the replay harness emulates the AnalyserNode (Blackman, |X|/N in dB), as `dsp-donor/parity.ts` does. No dev server was started.
