# Coverage: GPU3D build plan (S4 check), part 1 of 2

## TL;DR
- **Verdict: GAPS (3)** = FAIL for the S4 coverage gate until B1–B3 close (§A). Part 2 (`coverage_gpu3d_part2.md`) holds the coverage table (§C), the two new matrix rows (§D) and the non-blocking notes (§E).
- Matrix: 83 rows, each with exactly one owner (plan Row owners table). 0 orphans, 0 double owners. Plan IDs not in matrix: 1 (M-B7, proposed; written in §D). All 23 plan steps carry at least one test ID. R1–R6 all map.
- LR-5: 9 of 9 deltas accepted. Two carry a condition (f, i).
- Counts after this check: 83 + 2 proposed (M-B7 visual, I-FL1 browser) = 85 rows.

## Freshness
2026-11-16 · master `2692601` · inputs: `agents/planner/plan_gpu3d.md` (§ Steps L154–498 skimmed by ID, § Row owners, § Acceptance mapping, § Lead rulings), `agents/test-architect/matrix_gpu3d.md` (§2–§4, Lead rulings), `scratchpad/gpu3d/s1t.md` (pass lines), `agents/system-designer/design_gpu3d.md` L274, L630. No internet. No product code read.

## §A Verdict and blocking list
**GAPS (3). Blocking for the S4 gate:**
- **B1. Flash-rate gate has no row.** The lead brief lists `__flash` ≤ 3/s as a project gate; the spec precedents are `spec_dnb_wave4` R3 and `spec_td_look` L40. No matrix row or plan step tests it on the three new layers. The bench `own/flash` tail is a cost tail, not this gate. Fix: add row I-FL1 (part 2 §D), run at S6.
- **B2. M-U6 cannot fail on its own bad input.** The matrix bad input is "a GLB with no CC0 licence". Plan S4.2 checks only "non-empty `licence` and `source`", so a non-CC0 entry passes. Fix (planner text, S4.2): the test asserts `licence` equals the CC0 1.0 string exactly and `source` is an https URL, and runs after `Fox.glb` is deleted.
- **B3. Two rows not in the matrix.** M-B7 (LR-5 g) and I-FL1 (B1). Fix: the lead appends part 2 §D to matrix §2 and §3 (R4) before S4.6 starts. Until then the plan's "every ID in the matrix" check fails.

**Lead rulings (not test defects; they block the gate record, not the coverage count):**
- **M-V1 wording.** The matrix row says "user writes ok / not ok (S3, S7)". The plan (LR-5 h, gate record) says information only. Rewrite M-V1 as information and record the S3/S7 user gate as waived with a reason, or send the stills.
- **User order check.** The 2026-11-16 user order says "no new scenes for now". GPU3D adds three built-in scenes (`builtin:demo-*`). Confirm the go before S1.5 merges.

**Before S5.2 (not an S4 blocker):**
- **G11 open.** The 0.08/255 frozen-pair floor is cited nowhere. `s1t.md` L16 writes "≤ 0.08" with no source; the design (L274, L630) says "the known floor (same source)". S1T-2 and I-B1 both use it. The S1-T coder (or the lead) cites the source in the STATE entry, or re-measures the floor, before S5.2.

## §B LR-5 verdicts

| Delta | Verdict | Reason and condition |
|---|---|---|
| (a) M-U3, M-B5 on the shipped CC0 model | ACCEPT | Fox is absent from worktrees. M-U3 runs at S4.3 and M-B5 at S4.5, both after S4.2. Fox stays only as the S1-T proxy. |
| (b) P-B4 "2 px as shipped" | ACCEPT | P-B4 is record-only, so a px argument cannot flip a verdict. Condition: P-REC writes px as the string `as-shipped`. |
| (c) P-B9 owned in S2.3 (CP2) | ACCEPT | Before S2.3 there is no splat path to switch off. P-B9 would pass trivially, so it cannot fail there. Matrix phase label S5.P becomes S2.3. |
| (d) I-GL1 in S4.1 | ACCEPT | The instrument arrives with the S1-T merge. Its test is `web/src/gl/glstate.test.ts` (plan S4.1). |
| (e) F-PERF1 in S3.3 and again at S6 | ACCEPT | Ruling G5. The S6 rerun is a second run, logged as its own gate-record line. |
| (f) I-GL2 may read RED on shipped natives; control native | ACCEPT WITH CONDITION | Threshold stays `diff = {}` for the new natives. The control's dirty fields are a pre-existing finding, not an exemption. A RED on a new native follows the RED rule (fix ≤ ~15 min, else route to lead). No threshold edit. |
| (g) M-B7 `layer0`, new row | ACCEPT | Written in full in part 2 §D. I add glass 0 and glass 1: the plan names no glass value, and glass 1 on the direct path is the risky case (transmission read of an empty buffer). |
| (h) M-V1 information only | ACCEPT for the test layer | See the lead ruling in §A. The matrix row text must change to match. |
| (i) `Fox.glb` S4.1 to S4.2 | ACCEPT WITH CONDITION | S4.2 deletes `Fox.glb` and its THIRD_PARTY rows, and M-U6 runs after the deletion. Condition: B2 fixed. |

**LR-5 result: 9 of 9 accepted (f, i with conditions). None rejected.**
# Coverage: GPU3D build plan, part 2 of 2 (§C table, §D new rows, §E notes)

## §C Coverage table

| Req | Tests (owner step) | Status |
|---|---|---|
| R1 | P-U1–U3, U5–U8 (S1.2–S2.1); P-B1–B3 (S1.4); P-PERF1 (S1.5); P-B4, P-B11 (S1.6, record); P-B10 (S1.6); P-PERF2–4, P-B5–B9 (S2.3–S2.4); P-REC (S1.1) | COVERED. Line 2 is record-only (C3). Line 3 claim waits for P-PERF3 (G2, LR-2). |
| R2 | F-U1–U4 (S3.1); F-B1 (S3.2); F-PERF1, F-B2, F-LAT, F-B3 (S3.3, S6) | COVERED |
| R3 | S1T-3a/3b/3c, S1T-5–8 (done); M-U3 (S4.3); M-U6 (S4.2, fix B2); M-B5, M-B6 (S4.5); M-PERF2 (S4.7); M-V1 (manual) | COVERED. M-V1 manual (§A). |
| R4 | S1T-0/1/2/6/7/8 (done); M-B2, M-B4, M-B7 (S4.6); I-B2 (S5.1); I-B1, I-B4 (S5.2); I-B3 (S4.4); I-GOV1 (S4.7); I-REC1, I-CL1 (S5.3); I-GL1 (S4.1); I-GL2, I-LC1, I-LC2 (S5.1); I-SHADER1 (S5.2); I-LC3 (S4.5); P-B8, P-B9 (S2.3); P-B10, F-B3 | COVERED except the flash cap (B1 → I-FL1) |
| R5 | P-U4 (S1.3); P-R5-1 (S1.1 baseline + lead rerun, see §E); P-R5-2 (S1.2, G1 waiver); S1T-9 (done); I-BUNDLE1, I-BUNDLE2 (S4.7); G-GATE | COVERED. G1 waiver recorded. |
| R6 | R6-PRE (S1.1); P-B9 (S2.3) | COVERED on Mac. Windows W-M1–W-M4 MANUAL (user, later). |
| Gate: lint, typecheck, Vitest | G-GATE, every merge | COVERED |
| Gate: billed p95 ≤ 5 ms, A/B own/flash | P-PERF1–3, M-PERF2, S1T-3a/b | COVERED |
| Gate: 0 late at 1.00×, 60 s | P-B10 (particles), F-B3 (fluid), I-GOV1 (model; fluid half via F-B3) | COVERED |
| Gate: frozen pair bit-identical (existing native gains input) | builtin:particles only, waived G1 → P-R5-2 + P-R5-1. Model and fluid are new. | COVERED by waiver |
| Gate: binding r ≥ .80, both fixtures | I-B4 (`force←sub`, `speed←sub`; LR-1) | COVERED |
| Gate: flash ≤ 3 onsets/s | none | **MISSING → B1 (I-FL1)** |

- **Steps:** 23 plan steps (CP1 S1.1–S1.6, CP2 S2.1–S2.4, CP3 S3.1–S3.3, CP4 S4.1–S4.7, CP5 S5.1–S5.3). 23 carry test IDs; 0 without. S1-T is the spike (passed).
- **Matrix:** 83 rows, 83 owners, 0 orphans, 0 doubles. Layer counts match the matrix §Counts (unit 21, contract 4, integration 1, browser 28, visual 7, performance 17, manual 5).
- **Coverage verdict: GAPS (3)** (B1, B2, B3).

## §D New matrix rows (for the lead to append to matrix §2; R4 in §3)

```yaml
- {req: "R4 (direct path; LR-5 g; S1-T not-tested list)", test: "M-B7", layer: visual, fixture: "model as layer 0 (direct path, no layer below), blend normal, opacity 1, res 1, animation time frozen; glass 0 and glass 1 (2 runs). Reference: the same frame with the model over an opaque black layer", bad_input: "direct path does not clear the destination (last frame ghosts through transparent texels); or direct path writes straight alpha so the silhouette edge differs from the black-backed reference; or glass 1 reads an empty transmission buffer", expected: "per-texel max channel difference, layer-0 frame vs black-backed reference, <= 1/255 at both glass values", command: "node /Users/shaixee/Codered/Veejay-Wizard/scratchpad/gpu3d/g3-px.mjs layer0 5176", threshold: "max texel diff <= 1/255 (2 of 2 glass values)", owner: "frontend-coder (writes); lead (runs)", phase: "S4.6"}
- {req: "R2, R3, R4 (project flash gate; spec_dnb_wave4 R3, spec_td_look L40)", test: "I-FL1", layer: browser, fixture: "builtin:demo-particles, builtin:demo-fluid, builtin:demo-model, each alone, 60 s, dnb174-arr.wav, governor on", bad_input: "a kick-locked full-frame pulse (particle burst, fluid drop ring, or model speed bind) giving more than 3 __flash stamps inside any 1 s window", expected: "stamps per 1 s sliding window <= 3 for each demo; no WCAG luma-cap breach as the counter defines it", command: "node /Users/shaixee/Codered/Veejay-Wizard/scratchpad/gpu3d/g3-60s.mjs flash <particles|fluid|model> dnb174-arr 5176 (new mode `flash`; counter as in scratchpad/ed/bars.mjs)", threshold: "max stamps per 1 s window <= 3, per demo (3 of 3); 0 cap breaches", owner: "frontend-coder (adds mode at S4.7); lead (runs at S6)", phase: "S6"}
```

## §E Non-blocking notes (close in the named step or before S5.2)

1. **G11 floor source** (before S5.2): cite the 0.08/255 source in the STATE entry or re-measure (§A).
2. **P-R5-1 owner**: the Row owners table lists S1.1 only. The post-change comparison is the lead's `pin` rerun at CP1 close and at S6. Add the lead as the owner of the comparison.
3. **I-LIB1**: S1.5 asserts 1 id; the "exactly 3" assertion is in S4.7. Name S4.7 as the closing owner.
4. **I-GOV1 split**: model half in S4.7, fluid half is F-B3's run. Say so in the gate record.
5. **I-BUNDLE1**: S4.7 names the surviving minified marker. Keep the "lazy chunk ≥ 1" clause; without it "0 in entry" is vacuous.
6. **Record rows** (S1T-3c, P-B4, P-B11) can never fail a gate. Their verdict is "recorded", never PASS.
7. **Draw-contract change** (S4.1 adds `blend` to `Native.draw`, which touches every native): no existing-scene frozen pair after S4.1. Cheap add: one before/after pair on `builtin:spectrum` in S4.1.
8. **Snare and double hits**: no row. The fluid binds only kick/hat per LR-1; state "snare N/A" in the gate record. Optional F-U5: two kick onsets 120 ms apart give two impulses.
9. **Phase labels**: the matrix phase column (S5.P, S5.F, S6) differs from the owner step for about 20 rows. The owner table governs.

**STATE entry:** S4 coverage (test-architect, 2026-11-16): GAPS (3). Flash-rate row missing (I-FL1); M-U6 CC0 check too weak; M-B7 and I-FL1 to append to the matrix. LR-5 9/9 accepted (f, i with conditions). G11 floor source open before S5.2. Artifacts: `agents/test-architect/coverage_gpu3d.md`, `coverage_gpu3d_part2.md`.
