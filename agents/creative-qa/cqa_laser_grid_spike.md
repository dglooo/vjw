# CQA: Laser Grid spike (w3 S2.1', `native/laser` mode 0)

## TL;DR
- The sheet (6 tiles a–f) reads as **neon capsule loops and a contour map, not laser beams**. Every beam is a closed pill around an emitter, and the air between them is black.
- Three HIGH: beam shape (F1), no haze (F2), drop is not a climax (F3). No blank, NaN or flicker-looking frame in the stills.
- Keep: the beam cross-section (f), the palette, the mirror lattice (a, e), the c→d scale step.
- Verdict **REVISE**: the sheet would ask the user to judge a look it already contradicts.

## Freshness
- 2026-11-15. Sheet: `scratchpad/ed/w3s21-spike/laser-grid-sheet-1200.png` (1200×553, downscaled from the 1584×730 sheet; tiles ≈400×277 px). Full-res stills not opened (brief rule).
- Coder report: `scratchpad/ed/w3s21-spike.md` (commit `e9c1342`, branch unmerged).
- Plan: `agents/planner/plan_scenes_wave3.md` L174 (demo), L179 (S2.1 gate). Research: `agents/research/research_donor_laser.md` §1, §4.
- Creative spec used: `thoughts/spec_scenes_wave3.md` §2 B (laser bar) and §4 (gates). ⚠️ The brief names `spec_veejay_wizard.md` §3/§6/§7/§8, but none holds creative anti-goals: §3 = pilot non-goals, §6 = licensing, §7 = pilot acceptance (60 fps, recording), §8 = risks. The rejected analytic fan (research §4) stands in as the anti-goal.
- Tile times: the sheet labels no times for a, b, c, e. Tile d = +0.15 s after the dnb drop edge (≈34.6 s; edge 34.48–34.49 s in STATE).

## §1 Findings
- **F1 · HIGH · sheet a, b, c, d, e (all tiles).** Reads as neon tubes, capsule outlines and a topographic map, not beams. Each emitter traces to a CLOSED pill with 1–4 concentric rings. No beam has an origin, a direction or a far end, and there is no fan. Tile f shows the beam profile is light-like, so the fault is the geometry (closed isobars around blobs). Plan L174 ("traced isobars around a mirrored lattice") describes exactly this picture. Spec: `spec_scenes_wave3.md` §2 B "thin saturated beams fanning from 1–N emitters". Direction: trace open segments from each emitter to a far point with ends fading into the haze, or cut each loop where it meets its emitter. Cut rings to core + skirt.
- **F2 · HIGH · tile a (measured), all tiles.** No haze. A 30×80 px gap between pills reads Y max 16 (ffmpeg signalstats, video black). The only glow is each stroke's own skirt. Spec §2 B "fake haze (beams visible through smoke)". Direction: raise haze gain until a gap sample clearly lifts above black, and judge it on the 1200 px sheet, not only at 1:1.
- **F3 · HIGH · tile d vs c; coder report "Open issues" (K collapse).** The drop is bigger, not brighter. Tile d has five large loops with pale mint cores and no white burst. Tile c (build top) has white cores on 12 small shapes. The coder reports K falls at the drop (3.3–3.7 vs 5 at the build top), so the drop has fewer contour levels than the build. Spec §2 B "a full fan plus a white burst on the drop"; plan L174 "all K levels, white core". Direction: hold K at max at full open (do not inherit the build's K source), and check the burst on the drop frame: the core must go white.
- **F4 · MED · tile d (left, right, bottom loops).** The outer loops leave the left, right and bottom edges mid-curve, so they read as cropped tubes. Direction: keep the widest pose inside ≈90 % of the frame, or fade beam ends in the outer 8 %. If the user wants the bleed, say so at the gate.
- **F5 · MED · tiles a, e (b is the re-pose of a).** The K3 intro is sparse: 12 small pills on black, most of the frame empty. Three of six tiles show one picture (same lattice, different tilt). Plan L174 asks for a wall. Direction: more beams per emitter at K3 (open segments help), and poses that differ in more than tilt.
- **F6 · MED · tile f (2× crop of the sheet tile; coder reports it at 1:1).** Ribbon joint hairlines: thin dark dashes cross the beam bands at segment joins. Coder open issue 1 (per-segment normals). Direction: per-endpoint normals from the field gradient, as the coder proposes.
- **F7 · MED · a → b (16 ms apart), motion unknown.** The whole lattice re-poses in one frame. The pair reads as a step, and the emitter grid keeps its places. Stills cannot show beat-lock or rate. If the pose changes on each 16th at 170 BPM, that is ≈11 full-frame re-poses per second. Luminance flash is covered by the ≤3/s gate, but full-area churn at that rate can read as strobe. Direction: capture 10 s of the intro motion; if it strobes, step on the bar or half-bar, not the 16th.
- **F8 · LOW · sheet d.** The drop tile is labelled "app flash off". The user will judge the drop with the post flash on, which the sheet does not show. Direction: add a 1200 px copy of the app-flash drop still to the sheet.

## What reads well (keep this when fixing)
- Beam cross-section (f): white core, mint skirt, soft falloff. It reads as light intensity.
- Palette: mint-green on black with white cores. Laser colour family, two-colour, on-brief for techno.
- Mirror lattice (a, e): symmetric and strict, reads as an arranged emitter wall at a glance.
- Scale step c→d: the drop is visibly larger than the build.
- Clean frames: no blank tile, no black hole, no NaN-like area, no mush at the build.
- The a→b re-pose keeps the lattice identity: a change, not chaos.

## §2 Stress moments (second capture)
- dnb174-arr drop, 34.48–34.8 s, app flash ON: stills at +0.0 / +0.15 / +0.35 / +0.6 s (F3, F8).
- dnb174-arr build, 28–34 s: 3 stills of the K 3→5 ramp (F3, F5).
- dubstep140-arr drop, 42.5–42.9 s: the second fixture's drop (F3).
- dnb174-arr intro, 0–6 s: 10 s motion strip at 30 fps (F7). A still sheet cannot show this.
- Gap-luma sample at mid-build after any haze change (F2).

## §3 Verdict
**REVISE.** HIGH 3 · MED 4 · LOW 1. The look still reads as neon pills and a contour map, the drop has no white burst, and the haze is missing. Fix F1–F3 (then re-sheet) before the user gate. This QA verdict is not an ok / not ok; that call is the user's.

User question (one line): **Do the closed glowing loops read as laser light to you, or should the beams open from the emitters into haze?**
