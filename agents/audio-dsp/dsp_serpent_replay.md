# Audio-DSP: Neuro Serpent replay pre-step + `reeseLevel` (light SDLC §4)

## TL;DR
- **No knob set passes lines a–g on the 3 real tracks** (144 sets swept). Lines d, e and g fail at every set. Line f fails at every set where a + b pass with the design's source. No rule was changed.
- **S-1 lines a + b + c pass** with `presence` = `reeseLevel` at θ_on .30 / θ_off .15, COMMIT 2 beats, GAP ½ beat, REF_MIN .0755, thaw 16 bars / τ 8 bars. Margins: θ_on .275–.35, COMMIT 1.5–2.5 beats. COMMIT 1 and COMMIT ½ fail. Line d fails on Sub Focus. Residual: a 16th snare roll alone fires the whip.
- **S-2 (line e) and S-3 (lines f, g) stay open, and the cause is the source.** The 60–250 Hz band keeps drums and pads at −7.5 to −9.5 dB re the drop while the sub is gone. A quieter bass section that is still present reads as absence (Andy C: 2 false whips, W .12 and .63). By §R3, the lead decides the L223 fallback with the creative-director.
- **N-3 (line h):** b passes in both chain orders at −6 / −12 dB, and the thaw is needed. `reeseLevel` is on branch `w4-reese-level` @ `100b014`. Existing sources diff 0 on 8 inputs. Gates green (576 tests).

## Freshness
- 2026-11-15, audio-dsp (Opus 5.5). Code at master `d019617`. `web/src/audio`, `bind.ts` and `app.ts` are unchanged since `65288cd`, the commit of the w4 dumps.
- Read: design_neuro_serpent.md L29–L96 and L238–L331; skeptic_neuro_serpent.md L65–L96; dsp_dnb_wave4.md; features.ts L14–L114; bind.ts L26–L42; bands.ts L1–L95; arrange.ts L1–L64 and L144; synth.ts L26–L183.
- Evidence in `scratchpad/dsp/`: the `serpent-replay-{sim.ts, truth.py, .py, diff.py, r.py}` scripts, their `.log` / `.json` outputs, and the dumps `sim-*.json` (master) and `simB-*.json` (branch). PCM was deleted after the run; to regenerate it, use the ffmpeg line of dsp_dnb_wave4.md.
- **Method.** The sim is w4sim.ts trimmed. It matches the w4 dumps: rawReese |Δ| ≤ 5e-11, drop |Δ| ≤ 5e-5. The rig is a literal T1–T8 with N-1/N-2/N-3 in Python (no geometry), using §R2's clocks: dtw = clamp(dt, 0, .1 s), and beats from bpm, with 0 read as 174.
- **Line rules, fixed before the sweep.** The real lead-ins carry bass, so a and c are truth-qualified: a counts presence commits whose on-run starts on a truth-absent frame, and c counts runs that start on truth-absent frames. g opens after line b's window (drop + .2 s + ½ bar).

## §1 Truth (fixed before any rig run)
- **Definition.** HPSS (FitzGerald, DAFx-10) harmonic power over 30–250 Hz. STFT 2048 / 256, medians of 1 bar × 13 bins, centred 1-beat mean. Lref = the median over the 16 bars after each audit drop. Absent = < Lref − 15 dB. Synthetic inputs use the exact arrangement times.
- **v1 failed its check, so v2 replaced it.** v1 used the §2.1 31-frame median and failed its synthetic check before the rig was written: a kick-only drop read "present" on 64 % of frames. v2 uses the 1-bar median. On v2, the kick-only drop reads 100 % absent, groove and drop 0 %, and the breakdown 89 %.
- **Blind spot:** the 16th-roll bar reads −12.5 dB, which counts as "present".
- **Ambiguous:** 80–84 % of the Kanine 44.3 / 154.3 and Sub Focus 44.1 lead-in frames sit at −20 to −10 dB (Andy C: 1 %). On truth-absent lead-in frames, the sub is gone (HPSS 30–60 Hz at −33 / −40 / −68 dB, Sub Focus / Kanine / Andy C). But 60–250 Hz still holds harmonic −10.5 / −12.0 dB and percussive −7.6 / −11.4 dB (Sub Focus / Kanine). This is drums and pads, or a filtered bass; an ear check could call part of it bass.

## §2 Knobs (rules unchanged)
| Knob | Value | Margin / evidence |
|---|---|---|
| source | `reeseLevel` = min(1, raw.reese) | the design's SG1; `low` measured in §4 |
| θ_on / θ_off | .30 / .15 | a + b + c pass on θ_on .275–.35. At .25, b fails (Kanine 154.3). At .40, a fails (Kanine false commits) |
| COMMIT | 2 beats | 1.5–2.5 pass. At 1 beat: the roll commits 2.4 beats early (synthetic a, b), and Kanine 154.3 fails b (whip scale .318 < .364 one bar earlier, because `build` fell). COMMIT ½ also fails |
| GAP | ½ beat | ¼ beat passes; 1 beat fails b (Kanine) |
| REF_MIN | .0755 = ½ × .151 (Sub Focus 44.1 median) | 1× (.151) also passes a + b + c. It sits above the synthetic groove (.06), so its synthetic rows are not comparable |
| ref decay / thaw | 30 s / 16 bars, τ 8 bars | not swept; the thaw is needed (§3 h) |
- **Pick rule.** The rule is "the lowest θ_on that passes a–e at COMMIT 1". No set qualifies, because e fails at all 144 sets.
- **Grid.** {reese, low} × REF_MIN {½, 1} × θ_on {.2, .3, .4, .5} (θ_off = θ_on / 2) × COMMIT {½, 1, 2} × GAP {¼, ½, 1}, plus a fine scan of θ_on {.25….35} × COMMIT {1.5, 2, 2.5}.
- **Creative cost of COMMIT 2.** On a kick-coincident return at 174 BPM, the loop starts 1 beat later than rev 2: crossing +0.2 s, commit +0.89 s, crack ends ≈ +1.58 s. The provisional unwind does not change.

## §3 Lines a–h at the chosen set
| Drop | Truth absence before (bars) | W at drop | a false/all | b whips (scale vs W −1 bar) | e `on` share (absent bars) | g frames |
|---|---|---|---|---|---|---|
| Kanine 44.3 | .17 | .24 | 0/0 | 1 (.24 vs .06) ✓ | .97 (2.5) ✗ | 0 |
| Kanine 88.4 | 1.32 | .22 | 0/0 | 1 (.36 vs .21) ✓ | .63 (1.3) ✗ | 0 |
| Kanine 154.3 | 1.12 | .43 | 0/0 | 1 (.43 vs .36) ✓ | .97 (2.6) ✗ | 0 |
| Sub Focus 44.1 | 0 | 0 | 0/0 | n/a: no wind, no `drop` rise, 0 whips | 1.00 (3.1) ✗ | 0 |
| Sub Focus 147.9 | 0 | 0 | 0/0 | n/a; a `drop` rise at 146.55 gives a whip (W .064) **UNKNOWN** | .50 (1.4) ✗ | 17 ✗ |
| Sub Focus 171.0 | 0 | .05 | 0/3 | n/a; 1 presence whip at −.52 s (W .064) | (0.97 bar) | 105 ✗ |
| Andy C 46.9 / 91.0 / 157.2 | 1.80 / 1.80 / 1.81 | .09 each | 0/0, 0/1, 0/0 | 1 each (.10) ✓ | .03 ✓ | 0 / 77 ✗ / 0 |
| synthetic arr 34.10 | 8.0 | .66 | 0/0 | 1 (.69) ✓, fired by the roll at −1.36 beats | .11 (8.0) ✗ | 0 |
- **a** PASS on 10/10 lead-ins. **b** PASS on 7/7 wound drops and the synthetic; the 3 Sub Focus drops do not apply (W < .06).
- **c** PASS. No on-run starts on a truth-absent frame in the 9 real lead-ins: the presence stays on through Kanine and Sub Focus, and off through the Andy C cuts; 0 aborts. The synthetic roll is 1 run: it starts at 32.95 s (first hit + HOLD), reaches x max .51 and commits at 33.63 s; it is not next to a kick. The kick-only fixture gives 1 commit (the roll); its snare bodies give runs of h .24–.29 beat that never commit.
- **d** FAIL. The Sub Focus intro has 7.4 bars of truth absence at W 0: its 60–250 Hz content (p50 .064 = .85 × REF_MIN) confirms at the cold start. The Sub Focus outro (1.40) and the synthetic (1.61) pass.
- **e** FAIL, and it is real false presence, not hysteresis flicker: pooled `on` share .90 / .89 / .03 (Kanine / Sub Focus / Andy C), confirmed share .89 / .87 / .10. The Sub Focus first 16 bars read 1.00.
- **f** FAIL: Andy C has two whips away from any drop, 114.07 s (W .12) and 125.12 s (W .63), both at truth absence 0. Every other drop has exactly one whip.
- **g** FAIL. Andy C 91.0: the presence reads absence on a bass that is present. Sub Focus 171.0: `build` (up to .35) outlives a drop with no fire. Sub Focus 147.9: W .064 at 169.7 s, in the next lead-in.
- **h** b PASS in both orders; g FAIL in both orders (the 0-dB frames).
  - Listed order (Kanine → Sub Focus −6 → Andy C −12): b ✓. Loud-first order (Andy C → Sub Focus −6 → Kanine −12): b ✓; Kanine at −12 dB whips once per drop, at W .25 / .36 / .45.
  - Without the thaw (loud-first): 15 whips, Kanine's drops at W 1.00 / .85 / 1.00. With the thaw: 12.
  - At track joins, W .55–1.0 presence whips fire in the next track's intro or lead-in (example: Kanine at −12 dB, 10.4 s before its first drop). This is the line-a failure mode at a track change.

## §4 Why d, e, f and g fail (the source, not the knobs) and the options
- **(1) The gate catches kicks only.** In the truth-absent lead-ins, `reeseLevel` reads −9.5 / −7.5 dB re the drop median (Kanine / Sub Focus), while raw.sub reads −29.6 / −23.8 dB. On the synthetic, snares ≈ .35 s after a kick pass ungated, at x .2–.5. Isolated 8th snares trip the gate. A 16th roll never re-trips it (x .51). This matches GATE_RELEASE .2 s and the skeptic's gf/gs ≈ 1.39.
- **(2) The frozen, peak-held `ref` meets the band's crest.** The Andy C band has p99/p50 = +8.5 dB, so θ_on .30 lands about −2 dB re the median. Its 100–125 s section (−4.1 dB, truth present) therefore reads absent. Any θ_on low enough to keep that section present also keeps the Kanine and Sub Focus lead-ins present: the sweep shows it.
- **(3) `build` without a fire** keeps W up after Sub Focus 171.0.
- **Options for the lead and the creative-director:**
  - **(a) L223 fallback:** W from `build`, the release on `drop` only. 7 whips, one per `drop` rise, and none elsewhere. `build` before each fire is: Kanine .19 / .36 / .32; Sub Focus 0 (146.55, UNKNOWN); Andy C .05 / 0 / 0, which gives pump whips. No whip at Sub Focus 44.1 or 171.0. The absence story is lost.
  - **(b) `low` = raw.sub + raw.reese as the source** (one line; measured, not shipped). At θ .20 / .10, COMMIT 2, GAP ½ and REF_MIN .1407, a, b, c and f pass on all 4 inputs. d, e and g still fail on Sub Focus, and e also fails on Kanine and on the roll. In the loud-first chain, b fails at Sub Focus 44.1 (W .24, 0 whips). Its r vs the truth is .87–.97, but part of that comes from sharing the truth's band.
  - **(c) A sustained-bass presence detector** (rejects snare bodies and rolls in 30–250 Hz). This is an SDLC §4 detector change at research level, not costed here.

## §5 `reeseLevel` §4 record (shipped on a branch, not merged)
- **Target and contract.** A kick-proof bass presence for the rig's `presence` input. `reeseLevel` = min(1, sens × raw.reese): the kick-gated amplitude of the 60–250 Hz band. It is linear, 0..1, and not a ratio: a steady bass reads its level, where `reese` reads 0. On mastered DnB drops: p50 .15–.30, max .34 / .69 / .77. Synthetic inputs ≤ .17. No band, gate, threshold or timing change.
- **Fixtures.** `dnb174-arr.wav` (bass off 23.07–34.10 s, a 16th roll in the last bar); kick-only `arrangement({ bass: false })`; `dnb174`, `dubstep140` and `dubstep140-arr`; the 3 tracks.
- **Before / after.** Same inputs, master bundle against branch bundle: 8 inputs × 18 columns (features, raw, arrange, sync), **0 differing values**. `reeseLevel` = min(1, raw.reese) on 100 % of frames.
- **Kick-proof, with a limit.** Kicks alone (techno pattern, Vitest) peak at .10 × a bass bed's p50, a 1–3-hop tail blip at +HOLD. Snares and rolls are not gated (§4).
- **r table**, Kanine / Sub Focus / Andy C (0.1 s; 1 bar). The references are the HPSS 80–1500 Hz level of dsp_dnb_wave4.md §2.1 and the replay truth.
  - Linear `reeseLevel`: vs §2.1 .41 / .45 / .38 and .52 / .46 / .40; vs the replay truth .68 / .73 / .64 and .81 / .82 / .72.
  - dB(`reeseLevel`): vs §2.1 .57 / .74 / .53 and .75 / .83 / .67 (identical to §2.1's raw.reese row); vs the replay truth .71 / .85 / .85 and .80 / .91 / .93.
- **Branch.** `w4-reese-level` @ `100b014`, worktree `.claude/worktrees/dsp-reese-level`. features.ts: +4 lines in `fill`. bind.ts: `SOURCE_IDS` and the bass group. bind.test.ts: count 4 → 5. 2 new pins in features.test.ts. Gates in the worktree: lint 0, typecheck 0, vitest 576/576.
- **Naming hazard.** The source id `presence` belongs to the camera (bind.ts L26). The Serpent input `presence` must bind source `reeseLevel`.

## §6 Unknowns and risks
- **Sub Focus 146.55 s against the 147.9 s audit drop: UNKNOWN** until the user's ear check. The rig is coiled there (W .064, an attempt pending), so T8 spends a small whip 1.35 s early.
- **Real rolls are not measurable here.** The ≥ 3 rise_snare per beat tag fires on ≤ 0.5 % of lead-in frames, and there are no labels. The synthetic roll reaches x .51, so any θ_on ≤ .5 lets a 1-bar roll commit.
- **The truth's ambiguous band (§1)** decides part of line e on Kanine. Not measured: line-in, 48 kHz real audio, other genres.
