# CQA · camera dj-* spike (S2.3, pre-user-gate)

## TL;DR
- Clear: dj-over-tunnel kick/snare (glowing outline, hue step), dj-ghost snare negative, Camera Off keeps L0 in all three (no black).
- No white flood at drop, but a grey/purple veil remains at +0.2 s and the figure is lost at the drop in dj-inside and dj-ghost.
- 0 HIGH · 5 MEDIUM · 3 LOW. Verdict REVISE: one drop-bloom pass, one snare-roll capture, one spec decision (Camera Off), then the user gate.

## Freshness
- 2026-11-15. Source: branch worktree-agent-a8bd11a031073904a @ 31595a9 (Fix 1, v2 sheet `scratchpad/cam/dj-sheet-v2-1200.png`, 1200 px; panels ≈240 px wide).
- Not judged from stills: hair edge, 1.5 px base line, trails and swarm flow (motion). Full-size panels not opened (brief). Pianist clip and piano-as-person not raised (brief).

## §1 Findings
- F1 · MEDIUM · drop +0.2 s, row 1 col 4 and row 2 col 4 (dj-over-tunnel, dj-inside) · grey/purple veil over the frame; dj-inside background bars desaturated. Residual post flash ≈29 % white (s2.3 L27). Not a flood. · Breaks the drop-as-climax question (brief) and design_camera D5 L92–L93. · Direction: drop `level` off the outline blooms (s2.3 L23 lever); FLASH/TAU is engine-wide (RL F3).
- F2 · MEDIUM · drop +0.21 s, row 2 col 4 (dj-inside) · silhouette swells and blurs into a cloud; head-and-shoulders read is lost at the climax. · Breaks D5 L93 (swarm inside the silhouette). · Direction: same bloom lever; keep the mask edge crisp on drop.
- F3 · MEDIUM · drop +0.21 s, row 3 col 4 (dj-ghost) · figure is a green/pink smear; the trail reads as a green streak, the person does not. · Breaks D5 L94 (ghost trailing). · Direction: next lever in s2.3 L28 (GHOST_BLOOM threshold fixed at .35); cap rgba-delay spread on drop.
- F4 · MEDIUM · snare, row 3 col 3 (dj-ghost, negative 1.00) and s2.3 L25 (`__flash` max 3 per 1 s, cap 3) · full inversion on snare shares the ≤3/s budget (design_camera L85, L96). Cap holds (3 ≤ 3) but has no margin; snare inversions in DnB rolls may be silently dropped. · Breaks spec_camera §4.5 (flash cap) in spirit. · Direction: count flashes and dropped snare hits on a roll (Kanine 136–154.6 s).
- F5 · MEDIUM · Camera Off, all three (row col 5) · L0 plays, no black, as the design assumes (L95). But spec_camera §4.3 literally says "falls back cleanly (black, no errors)". The stills contradict the spec text. · Spec conflict, creative call. · Direction: user decides L0 or black (see question).
- F6 · LOW · rest, row 1 col 1 (dj-over-tunnel, glow .09) · outline not evident at rest; figure reads as a colour cut-out until kick. · Breaks D5 L92 "glowing outline" at the most common moment. · Direction: check the 1.5 px base line at full size; raise the sub floor if absent.
- F7 · LOW · Camera Off, row 2 col 5 (dj-inside, luma .14) · fallback is dim spectrum bars; not black, but flat next to the other two. · Spec §4.3 (passes). · Direction: optional L0 gain lift in Off state.
- F8 · LOW · rest, row 3 col 1 (dj-ghost) · figure reads pale over the ring layer (screen blend). · D4 L94 (screen). · Direction: verify at full size; L0 opacity .6 already applied in v2.

## Brief checks
- D5 intent: over-tunnel yes (outline at kick/snare, rest weak, F6). Inside: swarm-in-silhouette yes at rest/kick/snare, lost at drop (F2). Ghost: inversion on snare yes; trail seen only as the drop smear (motion unknown).
- Camera Off keeps L0, no black: yes in all three (luma .14–.32), spec text differs (F5).
- Drop as climax without white flood: no flood (luma .31–.42, s2.3 L21); climax readable in the tunnel only (F1–F3).

## §2 Stress moments
- Kanine 136–154.6 s (build to drop): snare fills on dj-ghost; budget and negative hits (F4).
- Drop +0.5 s, +1.0 s, +1.6 s on dj-inside and dj-ghost: veil decay and figure recovery (F1–F3).
- 50 s groove motion clip (not stills): ghost trail and swarm flow, unknown to this review.

## §3 Verdict
REVISE. One pass: drop-bloom lever (s2.3 L23, L28), snare-roll capture with flash count, then the S3 stills.

Keep-list:
- K1 dj-over-tunnel kick and snare: glowing outline and hue step read clearly (row 1 col 2–3).
- K2 dj-ghost snare: inverted figure is an unmistakable event response (row 3 col 3).
- K3 Camera Off: L0 plays in all three, no black frame.
- K4 Three scenes look different; no near-duplicate stills.
- K5 Drop has no white flood; the figure stays visible in the tunnel.

User question: Camera Off: keep the L0 fallback as shown (design assumption), or go black as spec_camera §4.3 says?
