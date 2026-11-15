# Audio-DSP feasibility: DnB wave 4 (Neuro Serpent + Amen Shatter)

## TL;DR
- **Both scenes can ship on the existing signals with scene-side workarounds. They need no analyser change.** Nothing below blocks S2.
- **Amen Shatter.** The 16th grid from `f.sync.beat` is usable (right on 59–97 % of each track). The bar phase is arbitrary: without the downbeat key the bar was rotated by 3 / 2 / 1 beats on Kanine / Sub Focus / Andy C, and the rotation stayed constant for the whole lock. A scene-side downbeat estimator gets it right on 86–97 % of locked frames.
- **Amen Shatter, weak inputs.** Snare rolls are not detected: 32nds fire 1 of 64 and 16ths 18 of 32. Ghost notes and velocity are missing. Kicks reach the scene 27–38 ms (p50) after the event, so R6 "≤ 2 frames" fails for kicks unless the moves are grid-predicted.
- **Neuro Serpent.** `reese` and `wobble` are rise-above-average signals. They read 0 for at least half of every drop (p50 .00–.07) and track the harmonic bass level weakly (r .17–.40). No source tracks the growl's timbre motion (|r| ≤ .10 at 0.1 s). The absolute `band6`/`band8` sources track the bass level (r .47–.73 at 0.1 s, .52–.81 per bar). The kick-gated `features.raw.reese` does better (r .53–.74 / .67–.83), but it is not a source today.
- **Both scenes.** `build` gives no rising ramp before 6 of the 9 audit drops. `drop` fired on 6 of 9 here, +0.3…+0.7 s after the audit drop time. `confidence` cannot gate the grid (p50 .32–.41 on right grids).

## Freshness
- 2026-11-15, audio-dsp. Code at master `65288cd`; `web/src/audio`, `app.ts`, `bind.ts`, `frame.ts` and `gl/live.ts` are unchanged at `d036b72`.
- Inputs: `thoughts/spec_dnb_wave4.md` §2, §3, §5 R6; `agents/research/research_dnb_wave4.md` §3; the code cited below. Prior data used: `_adhoc/real_tracks_2026-11-05.md` items 1, 3, 7 and `scratchpad/real/db/db/drop-table.md` (the D-B browser run).
- **Method.** An offline sim of master: `scratchpad/dsp/w4sim.ts` bundles the real `createAnalysis`, `features`, `tempo`, `sync`, `arrange`, `energy` and bind `evaluate`/`level`. It replays app.ts's frame loop for a FILE at 60 fps with the preset pinned: `dnb` = a manual pick, `default` = Auto while undecided. The classifier is skipped.
- Tracks: 3 user tracks, mono, 44.1 kHz (the context rate this Mac ran at).
- **Validation.** The sim's drop fires match the D-B browser table within 0.1 s on all three tracks.
- **References.** Grid and downbeat come from `scratchpad/real/<tag>.ref.npz` (ref.py, independent of the app). The downbeat is the kick 0/10 + snare 4/12 score on its 16th folds; margins are 25 / 11 / 26 %, and 2/3, 2/3 and 3/3 of the drops agree. The growl reference is HPSS ([FitzGerald, DAFx-10](https://dafx.de/paper-archive/details/DsmIVcydPX66AuaqEmKyTQ)) on a 2048/256 STFT, 80–1500 Hz.
- **Evidence.** All numbers are in `scratchpad/dsp/w4.log` (scripts `w4synth.py`, `w4grid.py`, `w4lat.py`, `w4growl.py`, `w4extra.py`; dumps `<tag>-{dnb,default}.json`, `synth.json`). The PCM files were deleted. To regenerate one: `ffmpeg -i <flac> -af "pan=mono|c0=0.5*c0+0.5*c1" -ar 44100 -f f32le pcm/<tag>.f32`.
- Not measured: line-in mode, the display pipeline (rAF → photons) and Amen material (no fixture exists).

## §1 Signals needed
- **Serpent (spec §2):**
  - the bass level / presence → twist and coil tightness;
  - the growl's timbre motion → surface ripple;
  - sub → thickness;
  - kick → pressure ring;
  - snare → hard snap;
  - hats → glints;
  - build → winds tighter;
  - drop → whip release.
- **Shatter (spec §3):**
  - a 16th grid plus the bar phase (the pattern position);
  - per-hit events with their slot;
  - accent vs ghost (velocity);
  - roll density → stutter;
  - build → 8ths → 16ths;
  - drop → re-assemble for one beat;
  - R6: moves within 2 frames of the onset, quantised.

## §2 What exists (values listed as Kanine / Sub Focus / Andy C, DnB preset)
### §2.1 Neuro Serpent
| Need | Exists (id, file:line) | Measured | Verdict |
|---|---|---|---|
| Bass level → twist, coil | `reese` features.ts L70, `wobble` L71–73 (each = max(0, level ÷ its 4 s mean − 1)); absolute `band0..31` bind.ts L53 | r vs the HPSS bass level at 0.1 s: reese .17/.31/.24, wobble .39/.29/.28, **band6 .56/.73/.47, band8 .57/.70/.51** (per bar .52–.81). reese in the drops (16 bars each): p50 .07/.00/.00, > .1 on 47/38/43 % of frames | WORKAROUND |
| Growl motion → ripple | none | Every source vs the harmonic flux: \|r\| ≤ .10 at 0.1 s (≤ .38 per bar, where level and motion co-vary). `wobbleDepth` vs level: −.43/−.62/−.25 (it reads high in quiet parts) | GAP |
| Sub → thickness | `sub` features.ts L69 | drops p50 .14/.22/.25, p90 1.0; AUC drop > build .86/.59/.75 | OK as a swell |
| Kick → ring | `kick` features.ts L110 (τ .12) | Broadband onset → the frame the scene sees: p50 38/27/38 ms, p90 50/39/57 | OK (a ring tolerates it) |
| Snare → snap | `snare` (same) | onset → frame p50 10/14/12 ms. The `event` input fires on 96–100 % of hits at release 0, on 77–84 % at release .15 | OK with release 0 |
| Hats → glints | `hats` (τ .06) | p50 10–12 ms. Event at release .15 fires on 60–78 % of hits, at release 0 on 99–100 % | OK with release 0 |
| Build → tighter | `build` arrange.ts L22 | Max over the 8 bars before each audit drop: .13/.25/.52 (Kanine); .00, .76 falling to .00, .02 (Sub Focus); 0/0/0 (Andy C) | GAP |
| Drop → whip | `drop` arrange.ts L23 (τ 1 s) | Fired 3/3 Kanine (+.3/+.4/+.7 s); 0/3 Sub Focus, plus one at 146.6 s (the user's open question); 3/3 Andy C (+.3/+.4/+.4 s) | WORKAROUND |

### §2.2 Amen Shatter
| Need | Exists (id, file:line) | Measured | Verdict |
|---|---|---|---|
| 16th grid | `f.sync.beat` sync.ts L9, L144 (a native reads `f.sync` directly, scene.ts L7) | Grid right (±1 % tempo, ±⅛ beat): 97/59/77 % of the track. No grid: 3/22/18 % (beatless intros; first lock at 6.1/44.9/35.6 s). Wrong: 0/19/6 %: Sub Focus has a 34 s ½-beat slip (the 16ths stay valid); Andy C runs at 176–177 BPM. Hits within 1 frame of the app's 16th: snare 94/80/69 %, hats 93/83/76 % | OK |
| Bar phase | `f.sync.bar` sync.ts L145; the offset comes only from the key (app.ts L158 → sync.ts L172–174) | Rotation without the key is constant per lock and wrong by **3/2/1 beats** (0 changes per track) | GAP → WORKAROUND |
| Per-hit events + slot | FrameInput has only broadband `onsets` (frame.ts L7–17); drums arrive as bound envelopes | A frame-to-frame rise on a float input (attack 0) catches 100 % of drained hits. Slot = round(4·beat − 0.4) is right on 98–100 % of kicks and 98–100 % of snares (with c = 0: kicks 53–85 %) | WORKAROUND |
| Velocity | `Hit.strength` is posted (drums.ts L96, onset.ts L64) and dropped (features.ts L85–87) | Snare strength sits at the cap 4 on 89/99/97 % of hits. Kick ratio p50 1.46–1.47. Band power at the hit (not posted): p10/p90 −5…−7 / +2.4…+3.9 dB around the local median; AUC backbeat vs other .60/.67/.64 | GAP |
| Ghost notes | none (snare floor 40, drums.ts L18) | Not fired at floor 40. At floor 20, hats creep in (ad-hoc item 1) | GAP |
| Rolls → stutter | `snare` | Synth at 174 BPM: 16ths 18/32, **32nds 1/64**. Under the arrangement's riser, 18 of the 32 roll snares are lost (12 of its 16 sixteenths). Real 8-bar builds: 0–1.6 snares a bar | GAP |
| Build / drop | as §2.1 | Drop ≈ 1–2 beats late (+.3…+.7 s) | WORKAROUND |
| R6 ≤ 2 frames | — | Onset → frame within 2 frames: snare 91/89/92 %, **kick 27/80/39 %**, plus the unmeasured display latency | snare OK, kick GAP |

## §3 Gaps: the cheapest paths, ranked (all can ship without the analyser change)
- **G1 Bar phase (Shatter).**
  1. Scene-side estimator, 0 analyser change. On each kick or snare rise: slot = round(4·beat − 0.4) mod 16. Keep EMA histograms K and S (τ 4 bars). After ≥ 6 hits, ρ = argmax over r ∈ {0,4,8,12} of K̂[r]+K̂[r+10]+Ŝ[r+4]+Ŝ[r+12] (each normalised to its max). Bar slot = (slot − ρ) mod 16. Right on 97/86/91 % of locked frames (91/81/95 % in drops); defined on 68–86 % of them.
  2. The downbeat key. It resets when the grid drops (sync.ts L134).
  3. Put option 1 inside sync.ts as an automatic `downbeatOffset`. Then every scene gets the right `bar`. This is an SDLC §4 detector change: fixtures = a synth two-step at 4 rotations, plus these 3 tracks before and after. Other genres need their own template.
- **G2 Per-hit events (Shatter).**
  1. Rise detection on a float input, or an `event` input with release 0.
  2. Add the hits drained this frame to FrameInput (app.ts L279 already loops over them). This is a frozen CP1 contract addition and needs a design decision.
- **G3 Velocity (Shatter).**
  1. A scene accent map by slot (big moves on the backbeat).
  2. Post the band power over its running mean as `strength` (drums.ts sums `own`/`band` at L70–73) and add `kickVel`/`snareVel` sources. SDLC §4: an accent/ghost synth pair, then the AUC re-run. Expected to stay weak (AUC ≈ .6–.7).
- **G4 Ghost notes.** No cheap path: a floor-20 class kept apart from hats is a new detector. Workaround: the hats envelope (3.7–5.4 a bar) as the fine layer.
- **G5 Rolls.**
  1. The stutter rate comes from the grid (8ths → 16ths), driven by the scene's build / phrase state, not by detected snares.
  2. A roll-density source (snare-band ODF peaks above a lower floor, per beat). SDLC §4: the arr roll, the 16th/32nd synth rolls and the real builds. Note: `minGap` 50 ms is not the limit. The floor 40 plus the adaptive mean is (32nds fire 1/64, not every other one).
- **G6 Growl motion (Serpent).**
  1. A procedural ripple. Amplitude ← the bass level (`band6`–`band8`, release ≥ .3 s to smooth the kick pump). Speed ← bpm. Bursts ← `reese`/`wobble` rises.
  2. Expose `features.raw.reese` (kick-gated, no pump) as a `reeseLevel` source: about 5 lines in features.ts `fill` + `SOURCE_IDS`. r .57/.74/.53 (0.1 s), .75/.83/.67 (per bar). Light §4 cost: a reese on/off fixture plus this r.
  3. A real growl feature (gated timbre flux or modulation rate) is research. The naive 150–1500 Hz flux gave r .19–.38 against the growl reference but .27–.47 against the drums.
- **G7 Build ramp (both).**
  1. Design the scenes not to need a ramp; the drop carries the contrast. A phrase ramp from `bar` is only a guess without the downbeat.
  2. arrange.ts: a build for drum-full builds (a ≥ 4 kHz riser/roll slope over 4–8 bars). This is an SDLC §4 change. Without it, R5 "the build reads as a ramp" stays UNKNOWN on these tracks.
- **G8 Kick latency (Shatter R6; the Serpent needs none of it).**
  1. Predictive moves: fire on the 16th crossing that G1's slot histogram predicts, and let the hit confirm it. This gives 0 latency on the learned pattern, and `nudge` (the sync `lead`) can also compensate the display.
  2. Time the move from `f.onsets` (it drains p50 8 ms after its own t), then label it with the kick envelope up to 2 frames later.
  3. Re-stamp a kick to the broadband onset before it. In file mode it would then drain about 25 ms earlier. SDLC §4: kick times also feed the classifier window and arrange's `kick`.

## §4 Risks (genre traps)
- **Confidence is not a validity gate.** On right grids its p50 is .32–.41, and conf ≥ .6 holds on only 14–33 % of right-grid frames. Wrong grids reach ≥ .3 as often or more (Andy C: wrong .84 vs right .64).
  - Bound `beat`/`bar` shapes are multiplied by the confidence (bind.ts L119), so they run at about ⅓ amplitude.
  - Natives should read `f.sync` directly and fall back to unquantised moves while `bpm` is 0.
- **Octave / ⅔ errors.** With the DnB preset: none. With Default (Auto undecided): Andy C sits at 116 BPM for 10 % of the track. Kanine stays undecided until 162 s (the STATE deferred item).
- **Bass sources in a sustained drop.** `reese`/`wobble` rest at 0 for at least half of every drop, so a body bound straight to them freezes. Never bind `wobbleDepth` raw.
- **Kick timing and precision.** On real masters the kick posts p50 +17…+29 ms after the broadband onset of the same event; on the synth fixture the delay is 6.4 ms. Only 52–73 % of kicks fall on the two-step slots (bass stabs; ad-hoc item 3).
- **Event inputs at the default release .15** lose 16–23 % of snares and 22–40 % of hats. Bind them with release 0.
- **Amen material.** The two-step template (kick 0/10) does not fit the Amen's kicks. Its ghosts and 32nd rolls are the measured weak spots. Check G1 again on a jungle track before relying on it there.
- **Line-in.** Hits apply on arrival (app.ts L252), which adds the USB input latency plus 1 hop for the snare's crosstalk wait. Neither is measured.
- **Sample rate.** The sim ran at 44.1 kHz; at 48 kHz the hop is 5.3 ms instead of 5.8 ms.

## §5 Answers to the brief
- **(a) 16th quantising without an automatic downbeat: yes.** The quantiser needs only the beat phase.
  - With an arbitrary bar phase, the pattern sits a whole number of beats off (3/2/1 here), constant per lock. The eye still learns a repeating bar, but events tied to the "1" (re-assembly, the Amen's bar 3–4 variations, the 4-bar phrase) land on the wrong beat.
  - A ½-beat slip (Sub Focus, 34 s) shifts the pattern by 2 sixteenths.
  - Quantise with round(4·beat − 0.4). Plain rounding puts 15–47 % of kicks in the next slot.
- **(b) Hit strength: not cheaply, as posted.**
  - Snares and hats sit at the cap (89–99 %).
  - The kick ratio is unsaturated but not an accent measure (AUC .46–.75, inconsistent).
  - The band power, already summed in `detect`, spans 7–11 dB (p10 → p90) but separates backbeat from other hits only weakly (AUC .60–.67).
  - Ghost notes never fire at floor 40, so no velocity can bring them back.
- **(c) A growl proxy from `reese` vs `wobble`: no.**
  - Against the harmonic bass level, `wobble` does slightly better (r .28–.40) than `reese` (.17–.31). Neither follows the growl motion (|r| ≤ .23).
  - Use the absolute `band6`–`band8` (or a `reeseLevel` source) for the body, with a procedural ripple on top.
- **(d) Latency today (file, 60 fps, attack → the frame the scene sees):**
  - Detector delay on the synth fixtures: kick 6.4, snare 5.0, hats 4.7 ms p50 (p90 ≤ 9.4).
  - Drain wait: p50 8.4, max 16.7 ms.
  - On the real tracks, from the broadband onset: **snare 10–14 ms p50 (≈ 1 frame); kick 27–38 ms p50 (≈ 2 frames), p90 39–57 ms (≈ 3 frames)**.
  - Add the display pipeline (not measured), and for line-in the input latency.
