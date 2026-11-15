# CQA: Rave Lasers spike, Variant A (brief RL-S3-CQA)
## TL;DR
- Verdict **REVISE**. Straight beams, fixed origins, grids, no loops: the idea reads. The fan tiles (S2, S5, S8) show black air between lines, the rejected attempt-1 look without the haze the spec asks for.
- Two HIGH: no haze lift between beams (F1); no sparkle (F2), the user's own word.
- The drop climbs: S4 > S5 > S2 > S3. S7 is red and white, no visible green.
## Freshness
- 2026-11-15, creative-qa. Source `dfb437e` (branch worktree-agent-ad60551033220a9a3, unmerged).
- Read: `scratchpad/ed/rave-lasers/rl-sheet-1200.png` (1200×942, tiles ≈390×255 px); `rl-spike.md`; creative `creative_rave_lasers.md` §1, §2, §6, §7, §8; `spec_rave_lasers.md` §1, §2.
- Not opened (brief rule): `rl-S*.png` originals, JSON, bench. Luma and counts are visual estimates. Motion is not in stills.
## §1 Findings
ID · severity · tile (time) · what is wrong · spec line · direction
- **F1 · HIGH · S2 (74.62 s), S5 (148.02 s), S8.** Air between lit beams reads black. Lines look equal in brightness and width along their length. No smoke lift. Reads as attempt 1. · §2.4 haze, gap luma; §3 L5; §6.1; C4 FAIL (visual). · Smoke field (gap luma 0.05–0.18); brightness and width change along each beam (§2.2 depth).
- **F2 · HIGH · S4 (146.80 s), S2, S5.** No glints (4-ray stars, 9–20 px at tile scale), no visible speckle. The user asked for "сверкающие". · §1; §2.4 sparkle; C7 FAIL (visual). · Glints at origins on the drop; speckle on beams.
- **F3 · MEDIUM · S4 (drop +211 ms).** Grey-white veil over most of the frame; beams inside it lose contrast. Coder reports veil ≈ .28 (`rl-spike.md`, Stills) vs ≤ .25 at +200 ms. · §3 row 7; C9. · Shorten the burst fall to ≤ .25 by +200 ms.
- **F4 · MEDIUM · S7 (48.71 s).** Densest tile (78 lit, `full`). Red and white crossings merge into a net; cells and T/F interleave not countable at sheet scale. · §2.3 Grid; §6.9. · Cut lit share or beams per emitter in `full` for drop + 1 bar.
- **F5 · MEDIUM · S3 (136.27 s).** Cage reads as a ruled grid: 8 verticals, 3 horizontals, all dead straight, no tilt. Horizontals green; white cores on verticals only. · §2.3 cage ("white-hot bars"); §3 row 6. · 15° tilt; white cores on all bars.
- **F6 · MEDIUM (confirm) · S3.** Verticals appear to run to the top tile edge; the T row sits at y 0.10 (≈25 px). A beam above its emitter breaks §6.3 and C2. · §6.3; C2. · Confirm on full-res S3; if real, clip at the emitter.
- **F7 · MEDIUM · S2 vs S5.** S5 is S2 with more lines: same truss, same palette, same ground. Four of 8 tiles (S2, S4, S5, S8) are truss fans. · C15; §5. · A different figure or aim for drop + 1 bar.
- **F8 · MEDIUM · S1 (124.41 s).** The Sheet is a flat gradient wedge from one T emitter. No fog swirl visible. · §2.3 Sheet. · Visible swirl field inside the Sheet.
- **F9 · MEDIUM · whole scene.** Coder's own open item: flatness p95 9.8 % vs 8 % (`rl-spike.md` Open; post-drop power slew). · C10. · Lower `SUM_RATE`; re-measure.
- **F10 · MEDIUM (confirm) · bench dnb174-arr, drop 34.47 s.** `rl-spike.md` Run line: "first rendered hit +1.07 s". If latency, the drop burst lands late; the line does not say. · §3 row 7; C11. · Lead clarifies; capture 34.4–35.7 s.
- **F11 · LOW · S6 (158.89 s).** Floor lattice reads well (squares, bottom origins, booth starburst). Cell count looks under 24. · S6 "≥ 24 cells". · Count at full res.
- **F12 · LOW · S1 (124.41 s), top-left.** Short beam ends inside the frame; may be the allowed 20 % fade (§2.2). · C3. · Confirm at full res.
- **F13 · LOW · labels.** S6 uses drop 155.04 s, not the first fired drop 44.69 s (disclosed by coder). S7 label lacks "+50 ms". S1 quiet held 8.0 s (borderline). · §7 table. · Lead accepts or re-captures.
## §2 Checks C1–C16 (PASS / FAIL / NOT VISIBLE IN STILLS)
- **C1** (R1) PASS S2, S5, S6. Weak S1, S3, S4, S7 (F2–F5, F8).
- **C2** (R2) NOT VISIBLE for ≤ 4 px. Each tile shows ≥ 2 groups.
- **C3** Curves, closed strokes: PASS. Hard ends: NOT VISIBLE (F6, F12).
- **C4** (R4) FAIL (visual) S2, S5, S6: gaps read black (F1).
- **C5** NOT VISIBLE. S1 lone beams not visibly 1.5× S2 fan beams.
- **C6** PASS S4 (white cores). NOT VISIBLE S5 (cores read pale green).
- **C7** PASS origin discs (S2, S8). FAIL glints (S4, F2).
- **C8** (R7) PASS visual: S4 86 lit vs S3 12; S5 brighter than S3. NOT VISIBLE: mean luma, "all 16 lit".
- **C9** NOT VISIBLE. S5 countable at edges; centre merges.
- **C10** (R6) Flash: NOT VISIBLE (coder: max 3/s, unchecked here). Flatness: FAIL per coder, 9.8 % (F9).
- **C11** NOT VISIBLE (F10). **C12** NOT VISIBLE (metric). **C14** NOT VISIBLE (motion).
- **C13** (R3) PASS visual: S1–S6, S8 green and white only; S7 no green visible.
- **C15** FAIL-leaning: S2 ≈ S5 (F7). 32-bar capture NOT VISIBLE.
- **C16** §6.2 loops: PASS. §6.1: FAIL on S2, S5, S8 (no haze, no depth).

Explicit questions:
- Rave laser show vs the rejected looks? Attempt 2: yes (no loops; straight lines from fixed points; grids). Attempt 1: S3, S6, S7 read different; S2, S5, S8 keep its signature until haze lands.
- Haze where beams pass? No on S2, S5, S6, S8. Partly S1 (wedge), S4 (veil), S7 (pink glow).
- Drop the climax vs S2, S3? Yes: S4 brightest; S5 beyond S2 in count and spread; S3 sparse and dim.
- S7 red and white, no green? Yes visually. Zero-green count is a metric.
## §3 What reads well (keep)
- Origins pinned: top apexes (S2, S8), floor points (S6), side towers (S1).
- Squares and diamonds (S3 cage, S6 lattice, S2 diamonds): the user's "квадраты".
- No loops, curves or drawn rig. Palette clean; S7 has no hue leakage.
## §4 Stress moments (second capture)
- Kanine 0–17 s: quiet flaps every ≈3 s (`rl-spike.md` Open). 10 s motion capture.
- Andy C 60–70 s: 10 s motion capture (C14); frames at 47.28 s + 0 / 50 / 200 ms (burst fall).
- Sub Focus 146.59 s + 0.0 / 0.2 / 0.5 s, full res: veil decay (F3). Sub Focus 136.27 s, full res: beam starts (F6).
- Andy C 74.62 s, full res: haze and line count (F1, F7). Bench dnb174-arr 34.4–35.7 s: latency (F10).
## §5 Verdict
**REVISE.** HIGH 2 · MEDIUM 8 · LOW 3. Haze pass (F1) and sparkle (F2) come before the user gate.

Question for the user (after the haze pass): do S2 and S5 read as laser light in haze, or as the flat fan you rejected (black air between hair-thin lines)?
