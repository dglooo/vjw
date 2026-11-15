# AV QA — Rave Lasers S6 (tester, Haiku 5.5)

> Written by the lead from the tester's hand-back verbatim (the tester's harness blocks report .md writes). Content and verdicts are the tester's.

## TL;DR
- **FAIL** (literal). 16 PASS · 10 FAIL · 6 UNKNOWN of 32 rows. The scene runs: unit 25/25, 0 late frames in both 60 s autopilot runs, lifecycle and context loss PASS, `__flash` ≤ 3/s in every 1 s window, live r-pass 6/6 on both fixtures, dub billed p95 ≤ 5 ms.
- Literal misses: creative §8 C4–C9 (C4 depends on a statistic switched after measurement), C10 drop window (dnb = 2, not 1), C10 dnb luma step 8.1 % (waiver F9), T-SR5 (passes only by ruling), T-L8 (wording unreachable).
- Not evidenced: full-length / floor / full flash runs, stereo G-AUTO, dnb billed bench on master, T-F3m, C1 and C16 (user), G-GATE on this tree.
- The lead's "S6 PASS on master" line reads ruled rows as PASS; this report keeps them FAIL.

## Freshness
- 2026-11-15 ~18:01. HEAD `ebc2180`; web tree = the S5.3 tree (`git diff --stat e2a7801 28880d2 -- web` and `28880d2..ebc2180 -- web` empty).
- Evidence E = `scratchpad/ed/rave-lasers/`. Matrix = `agents/test-architect/matrix_rave_lasers.md` (re-baseline as of `ebc2180`). Creative = `agents/creative-director/creative_rave_lasers.md` §8 L146–L162.
- Unit run: `cd web && npx vitest run src/scenes/lasers.test.ts` → 25 passed, exit 0.

## §1 Matrix results
| # | Req / test | Evidence | Value | Verdict |
|---|---|---|---|---|
| 1 | R1, C1 | user S7 · `rl-sheet-v3-1200.png` | S2–S7 read as lasers | UNKNOWN (user) |
| 2 | R2, C2 | unit T-R2 | ≤ 4 px, ≥ 2 groups | PASS |
| 3 | C3 | unit T-C3 | 0 curves, ≥ 85 % edge | PASS |
| 4 | R3, C13 | unit T-R3 · `rl-s54-metrics.json` | 0 off-hue S1–S6; S7 0 green | PASS |
| 5 | R4 | `rl-s54.md` p10 · S1 dark | .135–.156; .004 | PASS |
| 6 | C4 .05–.18 | `rl-s54.md` | median .181–.215 | FAIL (I-4) |
| 7 | C5 | `rl-s54.md` | Lone/Fan 1.395 (≥ 1.5); Sheet/Fan .673 (≤ .5) | FAIL |
| 8 | C6 | `rl-s54.md` | S4 core .302 (≥ .5); S4 skirt 0/64 | FAIL |
| 9 | C7 | `rl-s54.md` | discs 6/7/6 px (≥ 8); S4 glint 0/14 | FAIL |
| 10 | C8, R7 | `rl-s54.md` | lit 7.17 PASS; luma 1.46 (≥ 1.5); 14/16 emitters | FAIL |
| 11 | C9 | `rl-s54.md` | S5 33 % (≥ 80); S4 0 % (≥ 50) | FAIL |
| 12 | R5 dub | `rl-bench-dubstep140-arr.out.json` | 2.85 / 4.58 / 4.53 ms | PASS |
| 13 | R5 dnb | spike-era bench only | 2.80 / 3.99 / 3.95 ms | UNKNOWN |
| 14 | R6 `__flash` 60 s ×2 | `rl-60s-*-auto.out.json` | max 3 · max 2; 0 late | PASS (60 s) |
| 15 | C10 drop window = 1 | same | dnb 2 · dub 1 | FAIL dnb (I-2) |
| 16 | C10 luma step ≤ 8 % | dub flat · dnb v2 flat | 6.4 · 8.1 (F9) | FAIL dnb (I-5) |
| 17 | C10 full length / floor / full | none | — | UNKNOWN |
| 18 | G-AUTO | 60 s JSONs | 0/3601 both; stereo none | PASS; stereo UNKNOWN |
| 19 | T-F3m | none | — | UNKNOWN |
| 20 | R6/C14 | unit T-C14 | synthetic | PASS |
| 21 | C11 | run JSONs | 0 f all hits | PASS |
| 22 | C11 silence | unit T-C11s | 0/0/0 | PASS |
| 23 | C12, R8 | run JSONs | dnb .996 .977 .971 .928 .797 .928; dub .886 .865 .978 .933 .772 .933 | PASS |
| 24 | C15 | unit T-C15 | figures vary | PASS (one chase type, I-9) |
| 25 | R9 | unit T-R9 | 1 built-in | PASS |
| 26 | C16 | user | — | UNKNOWN |
| 27 | T-L8 | `rl-s54.md` | 2949 runs ≥ 6 px, max 20 | FAIL vs wording (I-7) |
| 28 | T-SR5 | run JSONs | latch .764 vs .399/.391; monotone | FAIL as worded (I-3) |
| 29 | T-L4h | run JSONs | 1.07 / 1.38 s | PASS |
| 30 | T-L11/LC/SH/CTX | `rl-lifecycle.out.json`, `rl-ctx.out.json` | all 0 / 4/4 / 86 ms | PASS |
| 31 | unit file | vitest | 25/25 | PASS |
| 32 | G-GATE | not run by tester | 571/571 at e2a7801 (lead) | UNKNOWN |

## §2 Issues
- **I-1 High** — creative §8 numeric misses C5–C9 (+C4): the user approved the look (C1); the re-baselined guards cannot show creative quality. Disposition: lead or user (accept as debt, or a fix step).
- **I-2 Medium** — C10 drop window = 2 on dnb (burst +17 ms, hidden kick hit +200 ms in the shared flash budget). WCAG cap holds (max 3).
- **I-3 Medium** — T-SR5 fails by formula (latch under the app flash, mix ≈ .68); the ruling's monotone check does not test the cover level; matrix text unchanged.
- **I-4 Medium** — C4 statistic switched after the failing median; record as a ruling.
- **I-5 Medium** — dnb luma step 8.1 % > 8 % (F9); no master re-run; v2 max 84.4 % at 34.17 s excluded by p95.
- **I-6 Low** — write "PASS by ruling" in the gate record.
- **I-7 Low** — the T-L8 guard is unproven without a dither-off mutant.
- **I-8 Low** — T-SH row says 5/5; the build has 4 programs (L3).
- **I-9 Low** — one chase type only (Tier-2 item).
- **I-10 Low** — 60 s runs loop the 45.6 s fixture; the seam sits outside the drop window.

## §3 Gaps
C10 full length on the 3 real tracks; floor/full 60 s runs; stereo G-AUTO; dnb billed bench + flatness on master; T-F3m; C1/C16 (user); G-GATE on this tree; hats-lag/C14 slew; real-audio C14.

## §4 Verdict
**FAIL** (literal). FAIL rows 6–11, 15, 16, 27, 28. UNKNOWN rows 1, 13, 17, 19, 26, 32. S7 user stills blocked until the lead dispositions I-1…I-5.
