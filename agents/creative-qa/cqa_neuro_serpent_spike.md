# CQA: Neuro Serpent S3 spike (W4)

## TL;DR
- Verdict **REVISE** (not ready for the user gate). 6 HIGH · 5 MED · 2 LOW.
- Body reads as a thin striped hose, not thick liquid chrome. S7 at its spec moment is near-empty. The drop is small and clipped at the top rim. S4 build peak = 2.33 turns (bar 3.3).
- Passes: full-frame flash ≤ 3/s; no blank, NaN or banding at 1200 px; S8 snap reads as a discrete kink with forks.
- Judged from sheet, 10 full-size stills and JSON. T-P1 not judged (not creative).

## Freshness
- Branch `worktree-agent-a23304b90b3622a50` @ 217e254 (unmerged); master 3527295. Files 2026-11-15 23:10.
- Spec: `agents/creative-director/creative_neuro_serpent.md` §1 L19–31, §2 L32–52, §3 L53–84, §6 L96–108, §7 L109–123, §8 L124–142.

## §1 Findings
ID · sev · still + time · defect · spec · direction

- **F-01 · HIGH** · S1 A 2.80 s; S2 A 158.21 s; S5 A 155.28 s; S6 A 156.44 s · Width ≈ 3–6 % FH by eye (§1 `w` 7–9 %). Dark navy with short transverse white rungs; lengthwise highlights faint or absent; flutes not legible. Reads as ribbed hose or ladder. · §2 Body, Chrome; §8 C2, C3 · Thinner rungs; ≥ 3 long specular strips; wider lens.
- **F-02 · HIGH** · S7 152.11 s (`ns-S7-A-subfocus.png`; coverage .002, fit .054) · Spec moment almost empty: one faint loop ≈ 10 % FH. Sheet S7 tile is a 1:1 crop of S3 (158.21 s), undisclosed. · §7 S7 (60–80 % FH); §8 C1 · Re-capture at 152.11 s, framing that fills; report any substitution.
- **F-03 · HIGH** · S5 A/B 155.28 s; S6 A 156.44 s · Whip is an arc in the top third; head cut by the top rim; lower 60 % empty. No still shows the whip crossing at full scale. · §7 S5, S6; §8 C12, C13 · Keep the whip inside the rim, spanning ≥ 60 % FW.
- **F-04 · HIGH** · S4 A/B 153.96 s · turns 2.33 (≥ 3.3 needed), build .37 (peak .52), W .48. §7 S4 fallback (W < .85: use highest-W drop, say so) not applied. No wound coil in any still. · §1 Wound; §7 S4 · Pick S4 at highest W; caption the change.
- **F-05 · HIGH** · S2 A 158.21 s (labelled Groove, JSON phase `coil`); S6 A · Groove reads calm: no ring pair in transit, no thrash. Drive rule unverifiable: `speed` 13.7 / 16.1 has no unit. · §1 drive rule; §6 "calm morph"; §7 S2 · Fix label or pick a true Groove frame; unit for `speed`; show 1.5 w thrash.
- **F-06 · HIGH (open)** · `ns-clip-dubstep140-arr.out.json` perBeat 0 maxShare .2018 (own target .10); dnb .1486 · Flicker share twice target on dub; not judged by eye. · §6 "strobing ripple"; §8 C7, C15 · 10 s clip eye check before the gate.
- **F-07 · MED** · S1 A/B 2.80 s · Labelled Rest; B .73, twist 4.4, open loop across frame. Not slack (spike "Changed #7"). · §1 Rest (B 0); §7 S1 · Use a real break (B ≤ .2).
- **F-08 · MED** · S9 A/B 46.55 s · 1.76 turns (≥ 2.5 needed); caption "G4 floor", not bars of absence (absence path flagged off). · §7 S9; §8 C11 · Caption bars; name the floor path.
- **F-09 · MED** · S7 crop; S2 A; S6 A · Gills cream-tan; red → orange heat only in coil stills (S4, S9). · §2 Heat · Gills on the spec ramp.
- **F-10 · MED** · S5 B 155.28 s (x 560–1200, y 280–520 at 1200 px) · Tan-orange smear across centre-right at drop +0.2 s reads as a veil. · §7 S5 "no veil"; §6 mush · Cut or key the haze at the drop.
- **F-11 · MED** · sheet · S10 Break absent; only quiet state is S1. C17 unshown. · §7 S10 · Capture S10 after audit drop 1.
- **F-12 · LOW** · S5 B · 4-point sparkle dots read as stars. · §2 "No stars" · Confirm sparks; dim.
- **F-13 · LOW** · S2 A ≈ (380, 340) · Blunt cap mid-body reads as a tube end. · §2 taper · Check at 1:1.

## §1a Acceptance checks
1. Thick chrome or thin ribbon: thin striped hose (F-01). Not wireframe (it is shaded).
2. Drop is the climax at full scale: no (F-03). Span rises S4 .16 → S5 .76, the picture does not.
3. Build ramp S9 → S4: not shown. Cross-track, W .30 → .48; no same-track ramp.
4. Snap S8 A: pass (discrete kink, ~20 forks). S8 B: gash not legible.
5. HDR, fog, banding, blank, NaN: none at 1200 px. Veil (F-10), near-empty S7 (F-02).
6. Flashing: full-frame ≤ 3/s holds (`__flash` max 1 per 1 s, 5 passes). Local flicker open (F-06).
7. Moment vs label: match S5, S6, S8; mismatch S1, S2, S4, S7, S9; S10 missing.

## §2 Stress moments
- Kanine 140–156 s, 4-bar steps: W ramp strip (C11, C13).
- Kanine 155.06 s ± 1 s at 10 fps, A and B: whip sweep, haze (F-03, F-10).
- Sub Focus 152.11 s, zoom 1 and 2: framing (F-02).
- Dubstep140-arr 10 s Groove clip at 60 fps: flicker (F-06).
- Kanine first break after audit drop 1 (lead picks the time): S10 (F-07, F-11).

## §3 Verdict
**REVISE.** Fix before a new sheet: F-02; F-03/F-04 (framing, S4 pick); F-01 (width, highlights); F-05 (Groove); F-06 (clip). MED items may go with a note. The user's ok / not ok stays the gate.
