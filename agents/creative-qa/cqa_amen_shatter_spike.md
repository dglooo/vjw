# CQA · Amen Shatter S3 spike, stills sheet (2026-11-15)

## TL;DR
- Verdict REVISE: 1 HIGH, 6 MED, 4 LOW. S3 ("fullest groove") shows 2 of 4 bands cut, not the 4 that §7 asks for.
- The chop reads as structured and hand-cut (lattice seams, regular ±2/±4 sets, seam colour by drum). S4 slam is whole, S8 is wide. No flash, blank or NaN tile.
- Motion (bar cycle, stutter rhythm, flash feel) is not in stills. Those checks stay UNKNOWN.

## Freshness
- 2026-11-15 · spike HEAD `e3a204b` on `worktree-agent-aacf3643663707b31` (unmerged).
- Read: `scratchpad/ed/amen-shatter/as-sheet-1200.png` (10 tiles), `as-spike.md`, `as-stills-{kanine,andyc,subfocus}.out.json` (scene state per shot), `as-bench-*.out.json`; spec §1, §2.1–2.5, §3, §6, §7, §8.
- Not read (brief): the single stills and `as-S10-subfocus.png`. Thumbnail reads are marked as such (tiles are ~295 px).

## §1 Findings
- F-1 · HIGH · tile 3 (S3, Andy C 61.67 s); `as-stills-andyc.out.json` shots.S3.state `bands [2,0,2,0]`: set A only. Set B (bands 2+4, left) is not held, though the label says "2nd shove". Breaks §7 S3 (4 bands at ±2), §2.2 (set B holds until the slam), C7. Direction: check set-B hold on the 2nd kick accent (a rule miss, not a tune); if the rule holds, re-pick S3 at a frame with both sets out.
- F-2 · MED · tile 6 (S6, Kanine 144.27 s): the 16 stamp columns look like one copy repeated (same disc height, same size). §3.2 wants ¼-spacing ring steps per 16th ("16 time-slices"). Thumbnail-limited. Direction: check at 1200 px; if identical, fix the per-step ring offset.
- F-3 · MED · tile 3 (S3): 8 stamps with `roll 0`, `build 0` (shots.S3.state). §3.2 contradicts itself: "lives until the head returns (1 bar)" vs "cleared to the live plate once the roll has stopped" (spec L85–L87). Direction: lead/designer ruling; then groove reads as groove, not roll.
- F-4 · MED · tile 7 (S7, Sub Focus 146.81 s, T0+0.2 s): the field is a pale lilac veil, not palette B `#12060F`. Probable source: the app drop flash (80 % white, τ .1 s on master; STATE HEAD l.39, l.49) ≈ 0.8·e^−2 ≈ 11 % at +0.2 s. The camera CQA saw the same veil (STATE l.38). Breaks §7 S7 ("clean whole plate"), §2.5. Direction: shoot at +0.35 s (≈3 %), or tell the user the veil is the app's flash.
- F-5 · MED · tiles 1–10: the plate reads as a clean analytic bullseye (thin concentric rings around a centred disc). The §2.4 "lit, hazy record or speaker cone", the bow-tie sheen and the graded haze are not legible. All three tracks share one ring target. Breaks §2.4 (L44, L48), §6 N6 ("flat analytic shapes"). Direction: push sheen and haze, break the ring symmetry. Creative call, see §4.
- F-6 · MED · spec §2.4 L46 (ring = 2–3 px HDR edge) vs P2 L49 ("detail finer than 8 px < 10 % of contrast"): the ring edges carry the contrast, so P2 fails by construction on S2, S3, S8 (C15). Ruling needed: does P2 mean texture only?
- F-7 · MED · tiles 8 + 9 (S8 +0.1 s, S9 +1 bar): identical slice state, bands `[4,−4,4,−4]` and 8 strips ±4 (as-stills-subfocus.out.json). The held shatter makes them near-duplicates. Direction: take S9 after a WIDE slam, or show the WIDE 2-set alternation; or accept with a note.
- F-8 · LOW · tile 10 (S10): labelled 1:1, shown at ~½ scale. Band × strip crossing, halo, shadow and banding are UNKNOWN from the sheet. Direction: judge `as-S10-subfocus.png` at 1:1 before the gate.
- F-9 · LOW · all tiles: labels use engineer terms (`rho null`, `stamps 0`, `mode free`, `slot`). Direction: plain labels (track · time · what the eye sees).
- F-10 · LOW · tiles 2–5: outer rings read blue/indigo at thumbnail size. §2.5 palette A has no blue, and "≤ 3 ring hues". Verify the hue count at 1200 px.
- F-11 · LOW · `flash.maxIn1s 3` on all 5 passes (as-stills-*.out.json, as-bench `__flash`): at the C12 cap, no margin. Seam flares are flash-class and get gated first in dense bars. Direction: motion check on the busiest 10 s of Kanine.

## §1b Brief checks (answers)
- Hand-cut or glitch: reads as structured cuts. Not glitch in any tile (no holes, no offset noise). Motion UNKNOWN.
- S4 slam whole: yes (state bands 0, strips 0; seams still lit at +2 fr). Fringe UNKNOWN at this size.
- S7 hold clean: whole yes, veil no (F-4). S8 wide: yes (state ±4). S9 wide: yes, but a duplicate of S8 (F-7).
- Full-frame flash: none in any tile. Only the app's drop flash (§3.3). Flash ≤ 3/s (F-11).
- Blank, NaN, rim clip: none visible. Banding at seams: UNKNOWN (F-8).
- P1 by eye: seams cut the rings, likely PASS; numeric UNKNOWN. P2: conflict (F-6). P3: motion UNKNOWN. P4: numeric UNKNOWN; by eye S1 and S7–S9 risk the QUIET .16 and WIDE .42 ceilings.

## §2 Keep-list
- Lattice discipline: slices stay on the 16×10 grid, no holes, no black gaps (S2, S4, S8).
- Seam light by drum type (amber, cyan); full-HDR seams at S8.
- Palette follows tier: A amber/lime, B pink, C teal-blue (S1, S7).
- Every real drop fired the recipe: Kanine 3/3, Andy C 1/1, Sub Focus 1/1; hold .97–1.04 beats; burst .54–.81 at the shatter.
- S6 hairlines brighter than S2 (hair .168 vs .018), as §7 S6 asks.

## §3 Stress moments (second capture, not gating)
- Andy C 61.67 s + 1 bar: does set B hold after the 2nd shove? (F-1)
- Sub Focus 146.81 s at +0.35 s: veil gone? (F-4). S7–S9 time to the detector's 146.61 s; STATE HEAD l.16 keeps Sub Focus 146.6 vs 147.9 s UNKNOWN (user ear check).
- Kanine, one locked bar after `rho` locks (~32 s): 4-frame strip, to show shove A → crack → shove B → slam → whole. No sequence on the sheet.
- Slams per locked bar (C7 wants exactly 1). Totals: Kanine 70 / 160 s, Sub Focus 51 / 148 s, Andy C 33 / 61.6 s. Kanine and Sub Focus come to ≈ 0.5–0.65 per bar at 162/174 BPM, before the WIDE and QUIET bars are removed. The JSON has no bar count: ask the coder for per-bar counts.

## §3b Verdict
- REVISE. Fix F-1 first (rule or moment). Decide F-3 and F-4. Re-check S3, S7, S9 at 1200 px, then the user gate.
- Counts: HIGH 1 · MED 6 · LOW 4.
- User question (creative, ok / not ok): "The plate reads as a clean ring target on all three tracks, with no visible record haze or sheen. Keep that look for your judgement, or push haze and sheen first?"
