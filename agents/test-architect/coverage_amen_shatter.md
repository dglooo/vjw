# Coverage: Amen Shatter (W4-S4), test-architect

Part 1 of 4. Parts 2–4 are `coverage_amen_shatter.part2.md` to `.part4.md` (Write cap 5 KB; the lead joins them, as for the plan).

## TL;DR
- 60 of 60 matrix IDs have one owner step. Orphans: 0. Double-owned build IDs: 0. 25 unit IDs are owned only by the plan's block reference "the 33 unit rows" (§1.2).
- R1–R7 and C1–C16 each map to at least one ID or to the user review (part 2, §1.3).
- LR-5: 7 changed readings checked, 7 ACCEPT, 0 REJECT. One extra changed reading found outside the 7 (T-V10 clock fixture): REJECT, S5.1 fix item (part 2, §2).
- T-C15 P1–P4 written as thresholds with baseline sources (part 3, §3).
- Verdict: FAIL. Blocking: B1 (G-7 clock pin has no matrix ID), B2 (G-6 numbers sit in no row). Plan fixes P1–P10 and matrix amendments M-1…M-10 are in part 4.

## Freshness
- 2026-11-15, test-architect (Haiku 5.5). Brief `W4-S4-COVERAGE-SHATTER`. Master `ecee982`. Spike branch `worktree-agent-aacf3643663707b31` @ `1cad1a3` (not merged).
- Read: plan `agents/planner/plan_amen_shatter.md` L1–L88 (whole); matrix `agents/test-architect/matrix_amen_shatter.md` §2–§5; `scratchpad/ed/amen-shatter/as-spike.md` L26–L45; creative `agents/creative-director/creative_amen_shatter.md` §2.4 L43–L51 and §2.5 L52–L59 (palette, no threshold needed).
- Read-only copy of the spike test file: `git show 1cad1a3:web/src/scenes/shatter.test.ts` (509 lines), saved to `/tmp/as_spike_test_readonly.ts` (outside the repo). Cited below as `spike test L<n>`.
- Stale when: the plan or the matrix changes, the spike branch moves past `1cad1a3`, or the lead changes an LR-5 decision.

## §1 Coverage

### §1.1 Owner step per ID (60 IDs)
| Owner step | IDs | n |
|---|---|---|
| Spike green (S3); regression at S5.1 and M | 33 unit rows (§1.2) + T-CT + T-R7 | 35 |
| S5.1 build (`frontend-coder`) | T-CMP, T-LC, T-CTX, T-R2a, T-R2b, T-R2c; T-G1 is the done line | 7 |
| S5.2 build (`frontend-coder`) | T-R3f, T-R3l, T-R3p, T-C12t, T-R5h, T-A3h, T-A8, T-A1r, T-C5a, T-C5b, T-R4a | 11 |
| S5.3 build (`frontend-coder`) | T-A9, T-C2p, T-C3p, T-C13p, T-C15 | 5 |
| S7 user | T-M1, T-M2 | 2 |
| **Total** | | **60** |

S6 (lead) runs every row of S5.1–S5.3 (plan L50). M (lead) runs T-R7 (plan L49). Total check: 35 + 7 + 11 + 5 + 2 = 60 (matrix L23–L82).

### §1.2 Findings on the 60 IDs
- Orphans: none. Double-owned: none (no ID is built by two steps).
- Plan steps without a test ID: none. M cites T-R7 (plan L49); S6 lists its IDs (L50); S7 lists T-M1 and T-M2 (L51).
- Plan IDs not in the matrix: none by ID (grep of plan vs matrix). Exception: the pin name `G-7 clocks` (plan L35, item 5) has no matrix ID. This is B1 (part 4).
- Block-only: 8 unit IDs are named in the plan (T-C4a, T-C9, T-C14, T-D1, T-D3, T-V2, T-V7, T-V12r). The other 25 are covered only by "the 33 unit rows" (plan L65): T-A10, T-C10a, T-C10b, T-C13c, T-C2a, T-C4b, T-C6, T-C7, T-C8, T-D2, T-D4, T-N1a, T-N1b, T-R6q, T-V1, T-V3, T-V4, T-V5, T-V6, T-V8, T-V9, T-V10, T-V11, T-V12, T-V12k. They are owned, but the table should name them (P7).
- C10 is mapped in the plan (L62 row "R5, C10, C11") to T-R5h and T-A8 only. Its matrix tests T-C10a and T-C10b (matrix L34–L35) are not named there (P7).
- Matrix T-C15 owner is `lead` (matrix L68); the plan gives the build to S5.3 `frontend-coder` (plan L45–L48). Matrix fix M-7.
## §1.3 Requirements (R1–R7, C1–C16, A-items)
| Req | IDs (plan step) | Status |
|---|---|---|
| R1 | T-M1, T-M2 (S7, user) | covered (user) |
| R2 | T-R2a, T-R2b, T-R2c (S5.1; run S6 (2)); T-G1 | covered |
| R3 | T-R3f, T-R3p, T-R3l, T-C12t (S5.2; run S6 (4)) | covered |
| R4 | T-R4a (S5.2) | covered |
| R5 | T-R5h, T-A8 (S5.2); T-V9 (block) | covered |
| R6 | T-C5a, T-C5b, T-A1r, T-A3h (S5.2); T-R6q, T-V1 (block) | covered |
| R7 | T-CMP, T-LC, T-CTX (S5.1); T-R7, T-CT (spike, M) | covered |
| C1 | T-M1 (user) | covered (user) |
| C2 | T-C2p (S5.3); T-C2a (block) | covered |
| C3 | T-C3p (S5.3) | covered |
| C4 | T-C4a, T-C4b (block); T-A1r (S5.2) | covered |
| C5 | T-C5a, T-C5b (S5.2) | covered |
| C6, C7, C8 | T-C6, T-C7, T-C8 (block) | covered |
| C9 | T-C9 (block) | covered |
| C10 | T-R5h, T-A8 (S5.2); T-C10a, T-C10b (block, unnamed, P7) | covered |
| C11 | T-R5h (S5.2); T-V9 (block) | covered |
| C12 | T-C12t, T-R3f, T-R3p (S5.2) | covered |
| C13 | T-C13p (S5.3); T-C13c (block) | covered |
| C14 | T-C14 (block) | covered |
| C15 | T-C15 (S5.3). P1–P4 numbers: part 3 | covered; numbers written |
| C16 | T-M2 (user) | covered (user) |

A-items and N-items: A-1 T-V1/V2/V3, T-C4a/b, T-A1r · A-2 T-V4/V5/V6 (block) · A-3 T-V7, T-V8, T-A3h · A-4 T-V10 (block) · A-5 T-C12t · A-6 T-V11 (block) · A-7 T-V12, T-V12k, T-V12r · A-8 T-A8 · A-9 T-A9 · A-10 T-A10 (block) · A-11 T-C2a, T-C2p · N-1 T-N1a/b (block) · N-2 T-V1 (block). All mapped.

## §2 LR-5: the 7 changed readings

Method: the spike reading is `as-spike.md` L32 item 3. Each reading was checked against the spike test body. ACCEPT if the reading still fails on the matrix's named bad input. Otherwise REJECT with a fix item.

| Row | Spike test | Matrix wording | Decision and reason |
|---|---|---|---|
| T-V2 | L119–L129 | 1 retract + 1 shove, cause kick (matrix L24) | ACCEPT. The 0-retract check over 8 bars (lags 0–67 ms) catches the fixed 50 ms window. The late rise gives 1 retract and 1 kick-cause shove-or-ghost (K4). Matrix wording: M-1. |
| T-C4a | L140–L153 | 100 % of unconfirmed shoves retract on the next crossing (L26) | ACCEPT. Each unconfirmed shove is checked at the next crossing (delay ≤ 1 slot). 4 dropouts give 4 shoves and 4 retracts. A retract 2 slots late fails. |
| T-C9 | L351–L363 | 8 columns at .15–.40; ≥ 12 at ≥ .40 (L48) | ACCEPT. One level inside the range (.3) gives 8; one above (.6) gives ≥ 12. A count that ignores build gives 16 at .3 and fails. Fixture: two-step drums plus a 16th roll (a superset of the matrix fixture). |
| T-V7 | L235–L247 | exact slot and frame; rho null throughout (L31) | ACCEPT. Beat ∈ [.724, 1.75) at 174 BPM holds only slot 4. Wide at the 2nd snare rise. Rho null up to the wide frame (A-6 adopts ≈ 2.25 bars, so "throughout" cannot hold). The code allows −.026 beat (≈ ½ frame); matrix to state it (M-2). An entry-value bug fails the hold or slot. A free-timer fallback (350 ms ≈ 1.01 beat) also lands on slot 4; T-V8 catches it. |
| T-D3 | L170–L177 | second kick rise 86 ms later, one visit (L52) | ACCEPT with a matrix fix (M-5). At 174 BPM a 16th lasts 86.2 ms, so +86 ms is the next visit. The spike uses +50 ms (a visit is 5.2 frames). Precondition: the first rise is ≤ 1 frame after its crossing; the fixture asserts it. A no-absorb bug gives 2 shoves and fails. |
| T-D1 | L399–L406 | snare-only ≥ 1 crack per snare; kick-only 1 shove per kick (L50) | ACCEPT. Hats-only and snare-only: 0 kick-cause moves over bars 0–3. Snare: exactly 1 snare move per rise. Kick: 1 shove OR 1 kick-cause 16-slot slam. Residual: a kick answered only by slams passes. If the lead wants shove-only, REJECT: count kick shoves only (1 per kick). Matrix: M-4. |
| T-C14 | L383–L398 | 0 shoves, 0 cracks (L49) | ACCEPT. Moves after the last hit are exactly [predicted, retract] (the C4 pair). Home by the end of bar 2. Two runs bit-identical. "0 shoves" contradicts the lead C4 bound; matrix: M-3. |

Result: 7 ACCEPT, 0 REJECT among the 7 named readings.

### §2.2 Extra changed reading (not in LR-5): T-V10. Decision: REJECT
- Matrix L36 wants `audioNow` in real time and a 200 ms gap on `now` only.
- Spike: `drive()` sets `now: t, audioNow: t` from one clock (spike test L54, L63). The T-V10 gap option (L429) moves `t`, so `audioNow` gaps too.
- Result: no unit row separates `audioNow` from `now`. The only `audioNow` assignment (L63) equals `now`. So the G-7 pin (B1) is needed. T-V10's "hits unchanged across the gap" does not test the clock split.
- S5.1 fix item (one): give `drive()` a separate `audioNow` source. The gap moves `now` only. Assert the hold and release on `now`, hits unchanged across the gap, and no break on the gap frame (break residual on `audioNow`).
- The lead adds this as an 8th row to LR-5.
## §3 T-C15: P1–P4 as thresholds (LR-3)

Source rules: creative §2.4 L49 (P1–P4), read as written. Luma is on a 0–1 scale. Use the luma formula of `as-luma.mjs`, the one that produced the v2 values, so the numbers stay comparable. The matrix fixture is S2, S3, S8 stills and the 4-bar GROOVE capture (matrix L68). Stills are taken at rest, ≥ 3 frames after a move (the T-C2p rule, matrix L65).

| Rule | Metric | Region | Threshold | Baseline source |
|---|---|---|---|---|
| P1 seam step | For each seam of a fresh 2-column shove or 2-row crack, fraction of seam samples where the adjacent-pixel step ≥ .05 | Each seam, full length, sampled at move + 3 frames. Stills S2, S3, S8 | **≥ .60 per seam**, each seam tested alone (no average) | creative §2.4 L49 (rule). No spike value: the spike did not measure P1 (as-spike L27). S5.3 first run is the baseline. |
| P2 texture | FFT power share above 1/8 cycle per px (detail < 8 px) ÷ total AC power | Field pixels, ring-edge pixels masked ±6 px (⚠️ my mask width, confirm with creative-qa). Stills S2, S3, S8 | **< .10** | creative §2.4 L49. Ring edges exempt: lead ruling F-6 (STATE HEAD L14, as the plan states at L19). No spike value; S5.3 baseline. |
| P3 ring travel | Radial travel of one ring edge at r = 4 columns between two frames one 8th apart (wall clock: 172.4 ms at 174 BPM, LR-8) | GROOVE 4-bar capture | **≥ 40 px at 1728 px width = ≥ 2.3 % of frame width per 8th** (⚠️ the px basis is the 1728 px bench frame; confirm with creative-qa) | creative §2.4 L49. No spike value; S5.3 baseline. |
| P4 tier luma | Frame-mean luma (full frame) | Each S1–S9 still, with its tier | QUIET **.08–.16**; GROOVE **.18–.32**; WIDE **.28–.42** | creative §2.4 L49 (ranges). v2 values: as-spike L43. |
| P4 GROOVE exception (LR-2) | abs(luma − v2 value) | Full frame of S3, S4, S6 | **≤ .010** of v2: S3 .342, S4 .325, S6 .372. A regression guard, not ≤ .32. (⚠️ the .010 tolerance is mine. If the S5.3 3-grab spread is larger, the lead decides, LR-4.) | as-spike L43 and Fix 1 "P4 frame-mean luma"; lead ruling LR-2 (plan L18). |
| P4 HDR | Share of pixels with HDR value > 1 | Float pass, not 8-bit stills | **≤ 8 %** | creative §2.4 L49. Not measurable on 8-bit PNG stills: report "not measured", which is UNKNOWN and never PASS. Lead decides a proxy. |

Checks the lead must decide before S5.3:
- **S9 tier.** S9 v2 = .330 (as-spike L43). The tier of S9 is not in my inputs. If S9 is GROOVE (≤ .32), it breaches with no exception. Plan the label, or add an LR-2-style exception.
- **S7 includes the app flash** (as-spike L43, "incl. app flash" = .399). Measure S7 with the flash on. WIDE ≤ .42 holds.
- **P1 needs a fresh seam.** A still with no fresh 2-column shove or 2-row crack has no P1 seam. The harness records N/A with the state's `moves` list. N/A is not PASS. At least one seam per still is needed, or the lead reruns the still.
- **P2 and P3 are measured on the v2 stills and the GROOVE capture only** (matrix L68). They are not run on the full 60 s run.

Output rule (S5.3 Done, plan L48): one JSON with the value, the v2 baseline and the 3-grab spread per row and tile. A failing guard on an approved tile goes to the lead (LR-4), never to a silent retune.
## §4 Verdict

**FAIL (2 blocking gaps).** 60 of 60 IDs are mapped. Orphans: 0. LR-5: 7 ACCEPT, 0 REJECT, plus 1 extra REJECT (T-V10). T-C15 numbers written (part 3). No UNKNOWN is recorded as PASS.

### Blocking
- **B1. The G-7 clock pin has no matrix ID.** Plan L35 item 5 adds a `G-7 clocks` pin, and no unit row separates the clocks (part 2, §2.2). The new-row rule needs an ID and a bad input. Proposed row for the next matrix pass (not written to the matrix now):
  ```yaml
  - req: "G-7, LR-8"
    test: "T-G7"
    layer: unit
    fixture: "drive() with audioNow = frame ÷ 60 and now = audioNow, plus a 200 ms now gap at one frame; a −0.2 beat audioNow jump on a separate run"
    bad_input: "break residual runs on Δnow (not ΔaudioNow); 170 ms one-shot runs on audioNow (not now)"
    expected: "the audioNow jump gives 1 break; the now gap gives 0 breaks; the one-shot ends at now + 170 ms"
    command: "cd web && npx vitest run src/scenes/shatter.test.ts -t T-G7"
    threshold: "1 / 0 / one-shot end within 1 frame of now + 170 ms (exact counts)"
    owner: frontend-coder
    phase: S5
  ```
- **B2. The G-6 numbers sit in no row.** Lead ruling L86 routes the G-6 numbers to S5.2. Matrix T-A1r (L69) names G-6 in its req, but its expected omits them. Proposed amendment to T-A1r, owner S5.2: add "(a) share of locked frames with rho non-null, per track (report); (b) rho adoptions after the first, per track (≤ 1); (c) share of kick rises confirmed inside their own slot visit (≥ 95 %). A breach of (b) or (c) goes to the audio-dsp lane (SDLC §4), never to a coder retune."

### Plan fixes (before S5.1 dispatch; plan line refs)
- P1. L35 Goal (4): delete "and T-G1 on both fixtures". Ruling L84 makes T-G1 the done line only.
- P2. L36: `as-life.mjs` → `as-lifecycle.mjs` (matrix L79–L80 commands are authoritative, L87).
- P3. Stale ⚠️ marks: L37 (T-G1 cost wording, resolved L84), L42 (60 s row, resolved L83), L25 (says G-2/G-6 "both closed"; ruling L86 says OPEN, measured in S5.2).
- P4. L40–L41: the held pass and the live pass run through `as-trace.mjs`. The matrix commands for T-C12t, T-R3f, T-R3p, T-R5h, T-A3h, T-A8, T-A1r, T-C5a, T-C5b and T-R4a all use it (matrix L63–L77). Drop `as-live.mjs` (L87) and the `as-bench.mjs` run mode for these rows. T-R3l stays on `as-60s.mjs`.
- P5. L35 item 5: the `G-7 clocks` pin carries T-G7 (B1). It also tests the 170 ms one-shot on `now`.
- P6. L40 (1): T-C12t needs its second seed named. Matrix L15 wants the seed whose disc centre x lies in (.425, .575). Plan seeds are 3 and 7 (L30), and the plan does not say which one qualifies. The coder records both centres in the JSON. If neither qualifies, stop and route to the lead.
- P7. Acceptance table (L55–L65): name the 25 block IDs listed in part 1, §1.2, and name T-C10a and T-C10b under C10.
- P8. Gate record, S3 row (L73): the spike set in matrix §4 (L93) includes items that as-spike L27 says were not run: T-C12t (hard gate), T-R2c, T-A9, T-C2p, T-C3p, T-C13p, T-C15. Record a lead waiver: deferred to S5.1–S5.3, run in S6. The S3 PASS covers the look, not these rows.
- P9. S5.3 (L45–L48): the T-C15 numbers are part 3 of this artifact. The S9 tier label is needed (part 3).
- P10. Gate record S4 coverage (L74): record FAIL with this artifact. It turns PASS after B1 and B2 close and P1–P9 are applied. The test-architect re-checks by a short delta note, not a full pass.

### Matrix amendments (test-architect, next matrix pass; the matrix is not edited now)
- M-1 T-V2 expected: "1 retract; 1 kick-cause move that is a shove or a ghost (K4)".
- M-2 T-V7: "rho null on each frame up to the wide frame"; "shatter on beat slot 4 (beat ∈ [.724, 1.75))". State the ½-frame tolerance.
- M-3 T-C14 expected: "0 confirmed shoves; ≤ 1 predicted shove and its retract (C4)".
- M-4 T-D1: snare-only "exactly 1 snare-cause move per rise"; kick-only "1 kick-cause shove or 16-slot slam per kick". Subject to the lead ruling in part 2, §2.
- M-5 T-D3: +50 ms (same visit), with a precondition that the first rise is ≤ 1 frame after its crossing.
- M-6 T-R3l command: run both fixtures (the expected says both; the command names only dnb174-arr, matrix L62).
- M-7 T-C15 owner: `frontend-coder` measures (plan S5.3); `lead` runs at S6. Numbers from part 3.
- M-8 T-A1r: add the B2 text.
- M-9 new row T-G7 (B1).
- M-10 T-V10 fixture: `audioNow` real time; the 200 ms gap on `now` only (already the matrix wording, L36). Part 2, §2.2.

### Ownership check for the lead
- LR-5 for the 8th row (T-V10): REJECT. S5.1 fix item (one). No other S5.1 fix from LR-5.
- Lane and seeds: no change.

## STATE entry (for the lead to log)
- W4-S4-COVERAGE-SHATTER, test-architect, 2026-11-15: FAIL. 60/60 IDs mapped, 0 orphans, 0 double-owned. LR-5: 7 ACCEPT, 0 REJECT; extra T-V10 REJECT (S5.1 fix). T-C15 P1–P4 written (part 3).
- Blocking: B1 G-7 pin has no ID (proposed T-G7); B2 G-6 numbers absent from T-A1r. Plan P1–P10 and matrix M-1…M-10 pending.
- Artifact: `agents/test-architect/coverage_amen_shatter.md` (+ `.part2.md`–`.part4.md`, lead joins).

## Lead rulings (2026-11-15)
- **B1 CLOSED.** Row T-G7 (§4 B1 yaml) is adopted into the matrix (`matrix_amen_shatter.md` § Amendments). S5.1 implements it. The T-V10 REJECT (§2.2) is an S5.1 fix item: `audioNow` runs on real time, the 200 ms gap moves `now` only.
- **B2 CLOSED.** T-A1r gets the G-6 numbers (a) report, (b) ≤ 1, (c) ≥ 95 % (matrix § Amendments, M-8). Owner S5.2.
- **T-D1 reading:** "a kick-cause shove OR the 16-slot slam" ACCEPTED (M-4 as written).
- **S9 tier = WIDE.** S9 is after the first WIDE slam with both band sets out at ±4 (`as-spike.md` Fix 1, F-7) → WIDE range .28–.42; v2 .330 holds.
- **S7** is measured with the app flash on (WIDE ≤ .42 holds at .399).
- **P4 HDR proxy:** the share of pixels with max channel ≥ 250 in the 8-bit still, ≤ 8 %. Recorded as a proxy row, not the float measure.
- **P2 mask ±6 px, P3 px basis (1728 px frame), P4 GROOVE tolerance ±.010:** ACCEPTED as written. If the S5.3 3-grab spread is larger than .010, the lead decides under LR-4.
- **P1–P9 plan fixes and M-1…M-10:** applied by the lead verbatim (plan + matrix § Amendments). S4 coverage = **PASS by lead ruling**; a short test-architect delta note checks the applied text when a lane frees (P10).
