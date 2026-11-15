ANCHOR: **Count:** 4 CPs; 15 coder steps (CP0 S0.1–S0.5, CP1 S1.1–S1.6, CP2 S2.1–S2.3, CP3 S3.1); 1 ruling (R0); USER: U0.0 (optional), U0.1–U0.4, U2.1.
MODE: replace-line
**Count:** 4 CPs; 16 coder steps (CP0 S0.1–S0.5, CP1 S1.1, S1.2a, S1.2b, S1.3–S1.6, CP2 S2.1–S2.3, CP3 S3.1); 1 ruling (R0, provisional as R0-Mac); USER: U0.0 (optional), U0.1–U0.4, U2.1.

## Gate record
The lead fills this table. UNKNOWN is never PASS. A PASS needs runner evidence (commit SHA, command, exit code) or the named reviewer's artifact.

| Stage | Status | Reviewer | Evidence | Waiver |
|---|---|---|---|---|
| S2 design: skeptic recheck (R0-Mac + contract rev 2) | PASS | architecture-skeptic, 2026-11-15 | `agents/architecture-skeptic/skeptic_camera_r0.md` § Recheck: K-1…K-12 closed, 0 BLOCKER, 0 HIGH; N-1…N-6 folded into S1.2a, S1.2b, S1.3, S1.6 | — |
| S2 matrix | PASS | test-architect, 2026-11-15 | `agents/test-architect/matrix_camera.md` (45 tests); lead rulings F1–F6 in `agents/STATE.md` HEAD | — |
| S3 spike + user: the `dj-*` scenes (M4) | UNKNOWN | creative-qa → user | | |
| S4 coverage: this plan against the matrix | UNKNOWN | test-architect | | |
| S6 CP1: gates + harnesses + AV QA | UNKNOWN | lead (runner) → tester | | |
| S6 CP1: the K-2 live arm (M3: `inferMs.p95` ≤ 33.3 ms, `maskFps.min1s` ≥ 24) | UNKNOWN | user run → lead | the arm JSON; it does not block the CP1 commit (lead decision 2026-11-15) | |
| S6 CP1: K2 on the live arm (`mainMs` p95 ≤ 1 ms) | UNKNOWN | user run → lead | the arm JSON | |
| S6 CP1: latency (M2: K4 ≤ 100 ms) | UNKNOWN | user run → lead | the Latency PNGs | |
| S6 CP2: gates + harnesses + AV QA | UNKNOWN | lead (runner) → tester | | |
| S6 re-check: `booth.mp4` stills and K6 (M1) | UNKNOWN | user → lead | | |
| S6 re-check: the Windows PC run (M5, U2.1) | UNKNOWN | user → lead | | |
| S7 user: the final stills of the `dj-*` scenes (M4) | UNKNOWN | user | | |
