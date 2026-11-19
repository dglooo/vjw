# DSP: kickAccent L window on line-in (2026-11-19)

## TL;DR
- **Root cause (measured):** the kick's Bass dB peaks only once the analyser window ends ≥ 10 ms after our kick's `t`. By x (window end − `t`): −24 dB at 0–5 ms, −4 dB at 5–10, 0 dB at 10–25, −1.4 dB at 30–35. Line-in drains a kick at x = 0–17 ms (p50 5.8 ms), so the core samples the rising edge. A headless file drains at x = 23–35 ms, so the frame before it (x = 6–17 ms) sits on the peak.
- **Pick = option (c), the same on both sources.** The value rises on the kick frame as today. On each later frame up to the first one ≥ 16 ms after the kick frame, a louder Bass dB raises the height (it never lowers it). The fall keeps the kick frame's clock. μ takes the kick's final L. **`DonorIn` does not change.**
- **kick-train-120, 60 fps:** line-in CV .42–.51 → .02–.03 (p10/p50/p90 .67/.70/.72). The file is unchanged (.67/.70/.72, CV .02–.03). **H8 with the pick: the first rise p95 17.4 ms ≤ 21.3 PASS.** The full height (≥ 90 %) lands p95 23.2 ms.
- **R5 (H4d) with the pick, offline file model:** CV .30 / .26 / .20 (Bicep .2033), r .98 / .95 / .94: PASS 3 of 3. Line-in model: r .81–.89 → .89–.97.
- **T9a: no pin moves** (23 of 23 donor tests pass on the pick). Add the new T9b (§4). T9b fails on the planned form and on 4 mutants.

## Freshness
- 2026-11-19, audio-dsp (Opus 5.5), master `65482bd` (`web/` empty diff since `78b815e`). No product code edited. Target: the kick's loudness. Truth (S1 §B): 150 Hz Butterworth LP, 10 ms RMS, its peak dB over [t − 5, t + 50] ms, mapped by the same μ map.
- Browser: a fresh Vite on :5174 (stopped at the end), headless Chrome `--disable-audio-output`, `donor-mode/h8-p4-align.mjs` run on `scratchpad/dsp/kickaccent/kt120-dsp.wav` (a symlink to `kick-train-120.wav`, so the S5.1 logs stay as they were). One line-in run of 30 s and one file run of 25 s (`out/h8-kt120-dsp{,-file}.json`), plus the two S5.1 coder logs (:5182). The fake device runs the context at 44.1 kHz, so the offsets step in 256-sample quanta (5.8 ms).
- Replays (`scratchpad/dsp/kickaccent/`): `windows.py` applies each L rule to the logged per-frame Bass dB (the core's own input). `parity-pick.ts` is `dsp-donor/parity.ts` with a `LEAD` env and `donor-pick.ts` (= `donor.ts` + the pick). `P4=planned` reproduces the S5.1 P4 rows exactly (CV .2887/.2690/.2115, r .9655/.9358/.8878). The line-in model is `LEAD=0` (the window ends at the drain time). It matches the browser on kick-train: planned CV .46 (browser .42–.51), pick .03. `run-tracks.sh` pipes the tracks through ffmpeg and writes no PCM file.

## §1 The pick: code for the coder (`web/src/audio/donor.ts`, the P4 block at :159–170)
- Add a knob beside `KICK_TAU`: `const ACCENT_HOLD = 0.016 // s: line-in drains a kick before the analyser window holds it, so L keeps rising up to the first frame this long after the kick frame (1 frame at 30 / 60 fps, 2 at 120, 3 at 144)`. Add state beside `accentMu`: `let [kickL, kickAge] = [-120, Infinity]` (this kick's L so far; s since its frame) and `let kickMu: number | undefined` (μ before this kick; undefined for the first kick).
- Replace `if (g.kick) { … }` (:163–168) with:
```ts
const holding = kickAge < ACCENT_HOLD // the last kick's hold is still open on this frame
kickAge += dt
if (g.kick) [kickAge, kickL, kickMu, accent] = [0, lastBassDb, accentMu, 0]
if (g.kick || holding) {
  kickL = Math.max(kickL, bass.db)
  const mu = kickMu ?? kickL // the first kick reads .7 and starts μ at its final L
  accent = Math.max(accent, Math.min(1, ACCENT * 10 ** ((kickL - mu) / 20)) * Math.exp(-kickAge / KICK_TAU))
  accentMu = mu + (kickL - mu) / ACCENT_N
}
```
- These lines stay: `accent *= e^(−dt/.12)` before the block, then `lastBassDb = bass.db` and `out.kickAccent = accent` after it. A new kick still sets its own height, as today.
- New wording for the plan's § Parameters row: "L = the max Bass dB from the frame before the kick frame through the first frame ≥ 16 ms after it. The value rises on the kick frame and rises again while L grows. The fall runs from the kick frame. μ takes the final L."
- **Contract impact: none.** `DonorIn`, `Donor` and the CP5 contract (`src.kickAccent` 0..1, drums group, unbound) stay as they are. Option (a) needed a source kind in `DonorIn`; the pick does not.

## §2 kick-train-120 (equal kicks; expected .70, CV ≤ .05), 60 fps, 2 runs per source (S5.1 + this one)
| Source, L rule | kick-frame value p10/p50/p90 | final p10/p50/p90 | CV | L spread | H8 first rise p50/p95 | full height p50/p95 |
|---|---|---|---|---|---|---|
| line-in, planned (before + drain) | .08–.10 / .90–.95 / 1 | same | .42–.51 | 19.5–24.1 dB | 5.8 / 17.4 ms | 5.8 / 17.4 ms |
| line-in, (a) or (b): rise 1 frame later | — | .67–.68 / .70–.71 / .72 | .02–.03 | 0.5–0.6 dB | 23.2 / 29.0–34.8 ms ✗ | same |
| **line-in, pick** | .04–.08 / .42–.59 / .71 | **.67–.68 / .70–.71 / .72** | **.02–.03** | 0.5–0.6 dB | **5.8 / 17.4 ms ✓** | 17.4 / 23.2 ms |
| file, planned = **pick** (the raise never fires) | = final | .67 / .70–.71 / .72 | .02–.03 | 0.5–0.6 dB | — | — |
| file, (a): drain + 1 after only | = final | .64–.65 / .71–.73 / .75–.77 | .06–.08 | 1.4–1.5 dB | — | — |
- Harness p95 17.4 ms in both runs (max 23.2 ms on 1 of 58 kicks here). Line-in model at 30 / 60 / 120 / 144 fps: planned CV .35 / .46 / .52 / .50 → pick .09 / .03 / .01 / .01 (at 30 fps the 33 ms frames step over the 15 ms peak).

## §3 R5 / H4d on 3 tracks with the pick (pass: r ≥ .60 and CV ≥ .20; CV / r mapped alike)
| Track (kicks) | file model: S5.1 planned | **file model: pick** | line-in model: planned | **line-in model: pick** | line-in pick r at 30 / 144 fps (planned) |
|---|---|---|---|---|---|
| Kanine (193) | .29 / .97 | **.30 / .98** | .29 / .81 | **.28 / .97** | .98 / .95 (.90 / .72) |
| Sub Focus (163) | .27 / .94 | **.26 / .95** | .27 / .89 | **.26 / .94** | .93 / .95 (.90 / .73) |
| Bicep (184) | .21 / .89 | **.2033 / .94** | .23 / .82 | **.22 / .89** | .89 / .96 (.85 / .83) |
- PASS in every column. Bicep's CV clears .20 by only .003 (file model; .2030 at 144 fps line-in): the pick removes noise, so CV drops while r rises. On the tracks the kick-frame value is already p50 .97–1.00 of the final height on line-in (p10 .70–.86).
- The unchanged `parity.ts` P4 column logs the kick-frame value. After the fix it prints CV .30 / .27 / .21 and r .97 / .94 / .89 (still PASS). The finals above come from `parity-pick.ts` (`kickAccentH` after the hold).

## §4 S5.1 tests
- **T9a: no moved pin.** `scratchpad/dsp/kickaccent/donor-pick.test.ts` is `audio/donor.test.ts` run on the pick. It passes 23 of 23 with `P4=pick` and with `P4=planned`. T9a's level sits on the kick frame or the frame before it, and the frame after is the bed, so the hold never raises it. Its decay pin `.7·e^(−k·DT/.12)` also guards the kick-frame clock: a raise without `e^(−kickAge/τ)` fails T9a.
- **Add T9b (a new test, no moved pin; body at the end of `donor-pick.test.ts`).** After 20 kicks whose Bass lands 1 frame late, the kick frame reads < .1 and frame 1 reads `.7·e^(−DT/.12)`; at −6 dB frame 1 reads `.351·e^(−DT/.12)`. At 60 fps, Bass 2 frames late (33 ms) is not caught. At dt 1/144, Bass 3 frames late (20.8 ms) is caught and 4 frames late is not.
- T9b fails on the planned form and on 4 mutants: `ACCENT_HOLD` 1 s, .008 and .017, and the raise without the kick-frame clock (that one fails T9a too). To rerun, from `web/`: `ln -sfn ../../../web/node_modules ../scratchpad/dsp/kickaccent/node_modules`, then `KICK_H=0 P4=pick ./node_modules/.bin/vitest run --root ../scratchpad/dsp/kickaccent donor-pick.test.ts`.

## Gaps
1. **File with a high output latency** (Bluetooth ≈ 100–250 ms): a file drains at x ≈ the latency, and there the kick reads −5 dB at 60 ms and −9 dB at 85 ms, with the next drums inside the window. Neither form helps. A later fix needs a time-stamped L (the kick's age in `DonorIn`). The latency on the real outputs is unmeasured.
2. **Line-in full height:** it lands 1 frame late at 60 fps (p95 23.2 ms > 21.3). H8 as written (the first rise) passes. This is causal: the audio for the full height does not exist yet on the drain frame.
3. **h8 diagnostics after the fix:** `kickAccentAtDrain` shows the kick-frame value, and `framesKickAndAccentRiseApart` grows (the raise frame). Read the full height on frame j+1 ÷ e^(−dt/.12), or read `accentIfL["drain + 1 after"]`. A kick within about 100 ms of a loud one can dip for 1 frame (a new kick sets its own height): 0 of 540 kicks in both models. Not tested: a real USB line-in card, 48 kHz contexts.
