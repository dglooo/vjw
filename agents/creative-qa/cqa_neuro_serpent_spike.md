# CQA: Neuro Serpent S3 spike (W4)

## TL;DR
- Verdict **REVISE**: not ready for the user gate. Counts: 6 HIGH · 5 MED · 2 LOW.
- The body reads as a thin, striped hose, not thick liquid chrome. S7 at its spec moment is almost empty. The drop is small and clipped at the top rim. The S4 build peak is 2.33 turns (bar 3.3).
- Passes: full-frame flash ≤ 3/s (all 5 passes); no blank, NaN or visible banding at 1200 px; the snap (S8 A) reads as a discrete kink with forked sparks.
- Judged from the sheet, 10 full-size stills and the JSON, not the coder's note. T-P1 (slow bench) not judged (not creative).

## Freshness
- Spike branch `worktree-agent-a23304b90b3622a50` @ 217e254 (unmerged); master 3527295. Sheet and stills mtime 2026-11-15 23:10.
- Spec read 2026-11-15: `agents/creative-director/creative_neuro_serpent.md` §1 L19–31, §2 L32–52, §3 L53–84, §6 L96–108, §7 L109–123, §8 L124–142.

## §1 Findings
ID · sev · still + time · what is wrong · spec · direction

- **F-01 · HIGH** · S1 A 2.80 s; S2 A 158.21 s; S5 A 155.28 s; S6 A 156.44 s. Body width ≈ 3–6 % FH by eye (§1 `w` 7–9 % FH). Chrome is dark navy with short transverse white rungs. Lengthwise highlight lines are faint or absent in all 4 stills. Lens flutes not legible. Reads as a ribbed hose or ladder, not wireframe, not liquid metal. · §2 Body, Chrome; §8 C2, C3 · Thinner transverse bands; ≥ 3 long specular strips along the body; wider lens; flutes visible at 1200 px.
- **F-02 · HIGH** · S7 at 152.11 s (`ns-S7-A-subfocus.png`; JSON coverage .002, fit .054). Spec moment is almost empty: one faint loop ≈ 10 % FH. The sheet's S7 tile is a 1:1 crop of S3 (158.21 s), a different moment, not disclosed. · §7 S7 (body 60–80 % FH); §8 C1, C2 · Re-capture at 152.11 s with framing that fills the frame; report any substitution.
- **F-03 · HIGH** · S5 A/B 155.28 s; S6 A 156.44 s. The whip is an arc in the top third; its head is cut by the top rim; the lower 60 % of frame is empty. No still shows the whip crossing at full scale. · §1 Groove; §7 S5, S6 (w ≥ 8.5 % FH, twist ≥ 4); §8 C12, C13 · Frame the drop so the whip stays inside the rim and spans ≥ 60 % FW.
- **F-04 · HIGH** · S4 A/B 153.96 s. turns 2.33 (spec ≥ 3.3 separable), build .37 (spec peak .52), W .48 (Wound = 1). The §7 S4 rule (W < .85: use the highest-W audit drop and say so) is not applied or declared. No still reaches a wound coil. · §1 Wound; §7 S4; §8 C2 · Pick S4 at the highest-W moment; caption the change.
- **F-05 · HIGH** · S2 A 158.21 s (labelled Groove; JSON phase `coil`); S6 A. Groove reads as a calm loose curve. No ring pair in transit, no thrash. Drive rule (≥ 15 % FW/s) unverifiable: JSON `speed` 13.7 / 16.1 / 11.1 has no unit. · §1 drive rule; §6 "calm morph"; §7 S2 · Fix the label or move S2 to a true Groove frame; give `speed` a unit; show the 1.5 w lateral thrash.
- **F-06 · HIGH (open)** · `ns-clip-dubstep140-arr.out.json` perBeat 0 maxShare .2018 (own target .10); dnb174 .1486. Share of pixels with > 3 flashes/s is twice the coder's target on dub. Not judged by eye. · §6 "strobing ripple"; §8 C7, C15 · Eye check of a 10 s clip before the gate; if real, slow the per-beat ripple step or cut ring/rung contrast.
- **F-07 · MED** · S1 A/B 2.80 s. Labelled Rest, but B .73, twist 4.4, open loop across the full frame. Not slack. Spike "Changed #7" admits it. · §1 Rest (B 0, twist 0.25); §7 S1 · Use a real break (B ≤ .2) for S1.
- **F-08 · MED** · S9 A/B 46.55 s. 1.76 turns (spec ≥ 2.5 from absence alone). Caption says "G4 floor", not bars of absence. Absence path is off behind a flag (spike "Changed #4"). · §7 S9 caption rule; §8 C11 · Caption the bars of absence; name the floor path as the reason.
- **F-09 · MED** · S7 crop; S2 A; S6 A (gills). Groove gills are cream-tan. Red → orange heat appears only in the coil stills (S4, S9). · §2 Heat ramp · Put the gills on the spec ramp; keep fringe violet-blue.
- **F-10 · MED** · S5 B 155.28 s (≈ x 560–1200, y 280–520 at 1200 px). Tan-orange smear across the centre-right at drop +0.2 s reads as a veil. · §7 S5 "no veil"; §6 "mush at the drop" · Cut or key the haze at the drop; keep the silhouette sharp.
- **F-11 · MED** · sheet (no tile). S10 Break is absent, so the only quiet state is S1. Gills-dark and twist ≤ 0.5 (C17) unshown. · §7 S10; §8 C17 · Capture S10 from a real break after audit drop 1.
- **F-12 · LOW** · S5 B. 4-point sparkle dots (≈ x 600, 820, 1005) read as stars. · §2 "No stars" · Confirm they are sparks; dim them.
- **F-13 · LOW** · S2 A ≈ (380, 340). Blunt rounded cap mid-body reads as a tube end. · §2 taper · Check at 1:1; soften if it is a fold.

## §2 Stress moments
- Kanine 140–156 s, 4-bar steps: W ramp strip (C11, C13). The sheet's S9 → S4 compares two tracks.
- Kanine 155.06 s ± 1 s at 10 fps, angles A and B: whip sweep and haze (F-03, F-10).
- Sub Focus 152.11 s, zoom 1 and 2: framing (F-02).
- Dubstep140-arr 10 s Groove clip at 60 fps: flicker eye check (F-06).
- Kanine first break after audit drop 1 (time not in spike files; lead picks): S10 (F-07, F-11).

## §3 Verdict
**REVISE.** Before a new sheet goes to the user, fix F-02 (S7 moment), F-03 and F-04 (framing, S4 pick), F-01 (width and highlight lines, the look itself), F-05 (Groove label and motion), F-06 (clip eye check). The MED items may go with a note. The user's ok / not ok stays the creative gate.
