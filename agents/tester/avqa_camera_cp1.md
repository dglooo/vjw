# AV QA — Camera CP1 (tester, Haiku 5.5)

> Written by the lead from the tester's hand-back (the tester's harness blocks report .md writes). Verdicts and issues are the tester's; condensed where the hand-back repeated evidence lines.

## TL;DR
- **FAIL** on one literal row: spec §4.1 "0 late frames over 60 s" — `scratchpad/cam/cp1-P4.json` camera-ON run 1 has 1 late frame (run 3: 0); the cam-app P3 case 404s on the preview build (`/src` import).
- Everything else CP1 claims on evidence passes: fault recovery B1–B5, video on/off B11/B26, switching B12/B13/B30, privacy (localhost only + the MediaPipe logger guard), models + licences, gates.
- Counts (49 CP1-scope matrix rows): PASS 40 · FAIL 1 (P3) · UNKNOWN 8 (M1, M2, M3, M5, B20, B24, B25, P7). Spec §4 lines: PASS 5 · FAIL 1 · UNKNOWN 4.

## Freshness
- 2026-11-15. HEAD `28880d2`; the CP1 close tag `cam-cp1` = `ef4b02b`; `web/src` at `ef4b02b` = `430af77`.
- Tester runs: `npx vitest run src/camera` 6 files / 39 tests PASS; at HEAD lint 0, typecheck 0, `npm test` 0 (51 files, 573 tests incl. 2 adversarial). Viewed only `cp1-sheet-1200.png`.

## §1 Spec §4 lines
- §4.1 0 late / 60 s — P4 ON late 1 / 0; P3 harness 404 → **FAIL**
- §4.1 mask ≥ 24 fps — `cp1-P2-probe.json` min1s 28.5 (preview) → PASS
- §4.1 ≤ 100 ms latency — M2 not run; P6 proxy ≈ 46 ms → UNKNOWN
- §4.2 DJ footage — `booth.mp4` absent; B24 not run → UNKNOWN
- §4.3 permission / switching / no camera — B12 4/4, B13 4 orders, B30 saved match → PASS
- §4.3 Windows text — M5 → UNKNOWN
- §4.4 privacy — foreign [] everywhere (`""` entries = blob: URLs, I-6); logger guard `segment.worker.ts` L151–156 → PASS
- §4.4 models / licences — C1, C2, C5 → PASS
- §4.5 gates → PASS · WCAG ≤ 3/s on the CP1 scene — no per-second count (B23 limiter .305 PASS) → UNKNOWN

## §1b Matrix rows (CP1 scope)
U1, U2, U3, U5, U6, U7, C1–C5, B1–B18 (B16 median 19.7 GO), B23, B26–B31, P1, P2, P4, P6 → PASS. P3 → FAIL. B20, B24, B25, P7, M1, M2, M3, M5 → UNKNOWN.

## §2 Issues
- **I-1 MED** §4.1 literal "0 late": P4 run 1 late 1; P3 cannot run on preview. Action: 3 × 60 s ON runs, or the lead ratifies the relative P4 rule (design L599) as the spec meaning; fix the harness's `/src` import.
- **I-2 MED** §4.2 silhouette: staircase edges + keyboard inside the person mask on `cp1-sheet` panels 2–3 (the 3×3 tent fix is on the CP2 branch — verify on the CP2 stills).
- **I-3 MED** §4.2 flicker: B24 not run; "no flicker" rests on U3 only.
- **I-4 LOW** B12/B13/B30 (`bfd23b9`) and B18 (`3153821`) not re-run on `ef4b02b`.
- **I-5 LOW** B20 `glloss@100` fired nothing → GPU-delegate loss untested.
- **I-6 LOW** harness prints `foreign hosts: ;` / `[""]` for blob: URLs — print the scheme.
- **I-7 LOW** evidence gaps: B27 pre-fix control, B11 area clause, B15 on the fake device, P2's benign blob ERR_ABORTED.
- **I-8 LOW** B26 threshold wording reads opposite to its expected text.
- **I-9 INFO** `gate()` in `smooth.ts`: a sustained flood (area > .6) holds k 0 forever → the mask freezes on the last accepted silhouette; designer to confirm.
- **I-10 INFO** spec §4.3 "black" vs the L0 ruling.

## §3 Adversarial
`web/src/camera/host.adversarial.test.ts` (2 cases: a pre-mask host with nothing in flight stalls at INIT_MS strict; a masked idle host never stalls) — 2/2 PASS.

## §4 Verdict
**FAIL** (one literal row, I-1). UNKNOWN rows are user- or run-gated.
