# Splice checks: plan_camera.md rev 2 (CAM-PLAN-REV2)

## Apply rules
- Target: `agents/planner/plan_camera.md` (224 lines at `4322836`). Splices `01`…`20`: every ANCHOR and END is a whole original line, the ranges are disjoint, the order is free. Apply each once, whole-line match.
- Line 1 = `ANCHOR: ` + the line. Line 2 = `MODE: ` + the mode. The body is line 3 to EOF, verbatim, with its leading spaces; drop only the final newline. An empty line 3 is body (04, 09). The body of 10 starts with two spaces.
- `replace-line`: the body replaces the ANCHOR line. `insert-after`: the body follows it. `replace-block-until: <END>`: the body replaces ANCHOR through END, both inclusive.
- 08 + 09 + 10 consume the old S1.2 block (old L148–L150, L151, L152). 06 carries the opening code fence; the closing fence (old L61) stays.
- Verified 2026-11-15 by full-line regex: each of the 20 ANCHOR and 10 END lines matches exactly 1 plan line. Bodies: +116 / −65 lines.

## After applying (repo root)
```bash
P=agents/planner/plan_camera.md
grep -c '' $P  # 275 (limit 300)
grep -cE '^\*\*S[0-9]\.[0-9][ab]? \[' $P  # 16 step headers
grep -cE '^\*\*S1\.2 \[' $P  # 0
grep -cE '^\*\*S1\.2[ab] \[ \]' $P  # 2
grep -cF 'Invoke the `ponytail` skill (full) before writing code' $P  # 17
grep -ciF 'browser harnesses headless (user rule 2026-11-15)' $P  # 10
grep -cF '**Matrix:**' $P  # 9
grep -cF 'goes black' $P  # 0
grep -cF 'goes empty' $P  # 2
grep -cF 'ref: number' $P  # 0
grep -cF 'ref: WebGLTexture' $P  # 1
grep -cF 'video: boolean; error: string' $P  # 1
grep -cF 'to `public/models/*`' $P  # 1 (N-6)
grep -cF 'lastRetryAt' $P  # 2 (N-3)
grep -cF 'BOTH EMA' $P  # 1 (N-2)
grep -cF '`ok` test' $P  # 2 (N-1)
grep -ciF 'a tile build' $P  # 2 (N-4)
grep -cF 'readCam' $P  # 2 (N-5)
grep -cF '15 coder steps' $P  # 0
grep -cF '16 coder steps' $P  # 2
grep -cE 'S1\.2([^ab]|$)' $P  # 4 (TL;DR + three S1.1 history lines)
grep -cE '^## Gate record' $P  # 1
grep -cE '^\| S2 .*\| PASS \|' $P  # 2
grep -cE '^\| S[3-7] .*\| UNKNOWN \|' $P  # 10
for id in U1 U2 U3 U4 U5 U6 C1 C2 C3 $(seq -f 'B%g' 1 25) P1 P2 P3 P4 P5 P6 M1 M2 M3 M4 M5; do grep -qw "$id" $P || echo "MISSING $id"; done  # no output: 45 matrix IDs
git diff -U0 -- $P | grep -E '^@@ -(29|3[0-9]|4[0-6]|7[3-9]|[89][0-9]|1[0-3][0-9]|14[0-7]|16[6-9]|170)[, ]'  # no output: CP0, S1.1, S1.5 untouched
```

## Open points for the lead
- **N-3 (S1.2b).** The plan's rule is `retryAt = lastRetryAt === null ? now : max(now, lastRetryAt + RETRY_MS)`: the window counts from the last granted respawn. "From the LAST failure", read as the previous failure's time, gives 2 respawns per window on a dead host (about 12 constructions in 30 s; B3 allows 7). Confirm or overrule.
- **Import safety (new, S1.2b item 5).** `camera.ts` L361–L365 creates the `<video>` at import and `editor/tiles.test.ts` L8 imports `gl/live`. Without a guard the gates break when `scenes/camera.ts` (S1.3) or `live.ts` (S1.6) imports `cam`.
- **Assumptions.** The "Video" button sits in the HUD of `ui/Overlay.tsx` (S1.4). S2.3 is the S3 spike of the `dj-*` scenes: unmerged until the user's ok on the M4 sheet.
- **Matrix deltas for S4 coverage.** B3 and B6 expect `readMask` null; N-2 makes it an all-zero mask. B12 says "black"; rev 2 says empty. B20 tests a main-canvas context loss; ruling F6 means a worker GPU loss through `fail()`. `N-1 check`, `N-2 check`, `N-4 check` have no ID. 12 harnesses say `headless: false`, not 10.
- **Size.** S1.2a (10 paths, mechanical) and S1.2b (L, 7 files) exceed the 3-file rule by the brief's own split. S1.2b lists a commit order, so it can be cut into two dispatches.
