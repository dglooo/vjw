# Creative — Rave Lasers (RL-S2: one DnB scene, a festival laser rig in haze)

## TL;DR
- ONE scene, DnB 170–175 BPM (scope change, see Freshness). The picture: a festival main-stage laser rig seen from front of house. Hair-thin straight beams in haze, pinned to fixed emitters.
- Rig: 23 emitters in 4 groups (truss row 8, side towers 2×3, floor row 7, booth pair 2). Layouts `truss` (default) / `floor` / `full` = 86 / 79 / 135 beams, plus the booth rays.
- Figures: Fan, Grid (squares ↔ diamonds), Sheet + Lone beams (quiet), Grating burst (snare), Beam-to-crowd (drop). Modifiers: Chase, Blanking. Hits are geometry-first (spread snap, `shoot`, chase swap at a constant lit count), so they land hard with no full-frame flash.
- Palette: green `#00FF46`, white `#FFFFFF`, red `#FF1A2E`. The control = 3 amounts. Default: green 0.7 + white 0.3.
- Build = the fans close into a white-hot square cage. Drop = 1 white burst (1 onset through the app flash path) + every emitter shoots at full spread at the viewer + a 2-bar all-open hold.

## Freshness
- 2026-11-15, creative-director. Brief `RL-S2-CREATIVE`, source commit `2233b55`.
- Inputs: `thoughts/spec_rave_lasers.md` §1–§6; `agents/research/research_rave_lasers.md` §1–§4, §7; `agents/creative-qa/cqa_laser_grid_spike.md` §1 F1–F8; `agents/STATE.md` HEAD (flash gate ≤ 3/s, binding policy, `build` = online tracker, `drop` fires on 7 of 11 DnB drops).
- **Scope change (user, relayed by the lead, 2026-11-15, mid-task): one scene, DnB only.** The techno built-in and spec R9 are dropped. `spec_rave_lasers.md` TL;DR, §3 L7 and §6 R9 still name techno and "two built-ins"; the lead updates the spec. Stills use the 3 DnB tracks only.
- Web, 2026-11-15 (vendor pages; provenance only): [Kvant, Let It Roll 2017](https://kvantlasers.sk/blogs/news/lasers-at-let-it-roll) = 8 Spectrum 30 projectors on a DnB main stage; [Tarm Lasergrid](https://www.lsionline.com/news/lighting/tarm-showlaser-launches-lasergrid) = parallel single beams form a grid, each beam dimmed separately.
- Not read: research §5–§6 (render techniques, reuse). No footage was watched (research §7). Split artifact (Write cap 5 KB): this file, then `creative_rave_lasers.2.md` … `.9.md`; the lead joins them in numeric order.

## §1 Intent
- Mood: a DnB festival main stage at night, seen from the crowd. Black air, thin haze, a wall of hair-thin green and white beams that hammer on every hit. Wild, hard, fast. Nothing is soft except the haze.
- The user's test (spec §1): lines that blast and sparkle, pinned to points, several origins, grids and squares, they flicker. The story below uses only the §3 signals; there is no section detector.
- **Quiet (intro, break)** = sub at rest and no kick for ≥ 2 bars. A dark stage, one Sheet with swirling fog, 2–4 Lone beams that sweep slowly. Nothing steps and nothing pops.
- **Loud (groove).** Fans open with the sub, chase with the hats, pop on each kick and burst on each snare. The figure cuts every 2 bars.
- **Build.** The fans close into hot bundles and straighten into a square cage. The chase doubles. The haze thickens. The frame gets darker and tighter.
- **Drop.** One white burst. Every emitter shoots at once, full spread, aimed at the viewer. 2 bars all-open, then the loud cycle.
- **Break.** The groups blank one per beat, back to the quiet picture.
## §2 Look
- Terms. Emitter = a fixed screen point where beams start. Group = the emitters of one placement. Layout = the groups present. Beam = one straight line of light from an emitter. Figure = what the rig draws between two cuts.
- Units. Reference frame 1728×1117. x, y = fractions of the frame width and height; y runs from the top. Luma = 8-bit Y / 255 of the captured frame.
### §2.1 Rig (never varies)
| Group | Placement (ref) | Emitters | Positions | Beams per emitter: max (floor) | Rest aim |
|---|---|---|---|---|---|
| T truss row | upstage truss ([back row](https://pangolin.com/blogs/news/muse-the-2nd-law-world-tour)) | 8 ([Let It Roll: 8 projectors](https://kvantlasers.sk/blogs/news/lasers-at-let-it-roll)) | x 0.08 + 0.12·k, k 0–7; y 0.10 | 7 (5) | down and out, toward the viewer |
| S side towers | left and right flank ([arena sides](https://er-productions.com/items/muse-2019)) | 2 × 3 | x 0.03 and 0.97; y 0.27, 0.455, 0.64 | 5 (3) | across the stage |
| F floor row | upstage floor ([tank traps](https://www.er-productions.com/items-2/jamiroquai)) | 7 | x 0.14 + 0.12·k, k 0–6; y 0.94 | 7 (5) | up and out, toward the viewer |
| B booth pair | over the booth ([booth truss](https://www.starshinelights.com/blogs/news/rgb-laser-bar-fan-tunnel)) | 2 | x 0.46 and 0.54; y 0.50 | 32 rays (24) | at the viewer |
- Layouts (the `layout` control): `truss` (default) = T + S + B, 16 emitters, 86 beams. `floor` = F + S + B, 15 emitters, 79 beams. `full` = T + S + F + B, 23 emitters, 135 beams. Beam counts exclude the B rays. Every layout has ≥ 3 placements; every figure lights ≥ 2 (spec R2).
- The S spacing in pixels equals the T and F spacing in pixels (207 px in the reference frame), so cage cells are square. F sits half a step off T, so T and F beams interleave in `full`.
- The counts are the creative target. system-designer may cut beams per emitter down to the floor value to hold spec R5. Emitter counts and positions are never cut.
- One fixed camera at front of house. Emitters never move on screen (the user: pinned to the same points).
- A dark emitter shows nothing. No truss, housing, stage or crowd is drawn.
### §2.2 Beam (the one primitive; research §2 implication)
- A beam is straight and starts at its emitter. ≥ 85 % of lit beams end at a frame edge; the rest thin out and fade over their last 20 %.
- Core: 2 px wide at the emitter (1.5–3 px). A hot core is white (research §3 cue 6). No core is wider than 10 px.
- Skirt: the beam colour, width 5× the core at half maximum. Halo: width 20× the core, ≤ 8 % of the skirt peak. The halos add up to the haze lift between beams.
- Depth: a beam that passes the viewer reaches 3–4× its origin width at the frame exit and gets brighter (forward scatter, cue 5). A beam across the stage keeps its width (cue 8). A sweep changes this ratio; that change reads as volume (cue 2).
- Entry: `snap` (1 frame) or `shoot` (the tip runs from the emitter to the frame edge in ≤ 48 ms). Exit: blank in 1 frame, afterglow ≤ 50 ms.
### §2.3 Figures (picked from research §2)
| Figure | Groups and beams | Picture | Motion | When | Ref |
|---|---|---|---|---|---|
| Fan | T or F: 3–7 per emitter, spread 24–60°. S: 2–5 per emitter, spread 10–30° | discrete beams diverge from each emitter toward the viewer; neighbour fans cross into diamonds | a kick snaps the spread; reese scissors the aim | loud | [BeamBar](https://www.laserworld.com/en/laser-systems/laserworld/beambar-series.html) |
| Grid | T or F: 1–3 near-parallel beams (±4°) per emitter. S: 3–5 per emitter | two beam sets cross at 60–90°: ≥ 24 four-sided cells (squares at 90°, diamonds at 60°); crossings add up to white | the two sets shear ±15° in opposite directions | loud. The cage = Grid at 90° with 1 beam per emitter (build peak) | [grid / cage](https://www.starshinelights.com/blogs/news/laser-effects-guide-laser-array); [Lasergrid](https://www.lsionline.com/news/lighting/tarm-showlaser-launches-lasergrid) |
| Sheet (liquid sky) | 1–2 emitters of the layout; 1 plane each | a translucent plane with no separable beams; fog swirls show inside it; the dimmest figure per pixel | tilts 1 cycle per 8 bars | quiet | [glossary](https://www.laserworld.com/en/58-terms-and-definitions.html); [ILDA haze](https://ilda.com/hazefoglasers.htm) |
| Lone beams | 2–4 emitters from 2 groups; 1 beam each | the hottest beams of the scene; a white core from end to end | sweep 10–20°/s | quiet | research §3 cue 3 |
| Grating burst | B: 24–32 rays per emitter, in all directions | a starburst of white hair rays (1 px core, no halo) that reach the frame edges | lives 110 ms; turns 20° while alive; min gap 170 ms | each snare; once at the drop | [ER BB4](https://www.er-productions.com/items-3/bb4) |
| Beam-to-crowd | all groups, all beams | every fan tilted out at the viewer; exit width 3–4× origin width; every origin glints | held 1 bar | drop | [audience scanning](https://www.laserworld.com/en/glossary-definitions/71-a/1540-audience-scanning.html) |
| Chase (modifier) | any figure; lit share 40–100 % (lit share = the part of the figure's beams lit at one step) | a lit subset steps along a fan or a row; dark gaps between lit beams; the lit count stays constant | 8ths (5.7–5.8 Hz); 16ths only at build ≥ 0.75, ≤ 4 bars | with hats | [bar chases, 6–8 Hz bursts](https://www.starshinelights.com/blogs/news/rgb-laser-bar-fan-tunnel) |
| Blanking (modifier) | any figure | beams are discrete lines with dark gaps; a group goes dark in 1 frame | chase gaps; loud → quiet | always | [blanking](https://wiki.pangolin.com/beyond:vectors_and_points) |
- Left out: Cone / tunnel (a symmetric radial star from one point is the nearest picture to the rejected attempt 1, and it is the slow figure of the dropped techno scene); "wave" (no source, research §7); graphics, logos, mirror sculptures.
### §2.4 Realism cues (all mandatory; research §3)
- Haze (cues 1, 2; spec L5). A smoke field (features 150–400 px, drift 20–60 px/s) changes every beam by ±25 % along its length and shows as swirls (±40 %) inside the Sheet. Gap luma between two adjacent lit beams = 0.05–0.18. Luma ≥ 200 px away from every beam ≤ 0.02 (cue 10).
- Energy sharing (cue 3). The lit beams of one emitter share its power. Per pixel: Lone beam > Fan beam > Sheet. A Lone beam reads ≥ 1.5× a beam of a 7-beam Fan; the Sheet reads ≤ 0.5× that Fan beam.
- `power` (the operator's master): quiet 0.5, loud 0.7, build 0.7 → 0.85, drop hold 1.0. It makes the wide drop the brightest picture in total light.
- Origin hot spot (cues 4, 5). Every lit emitter shows a white disc ≥ 4× the core width. A glint (4-ray star, 40–90 px, ≤ 50 ms) fires at an emitter when one of its beams points within 10° of the viewer.
- Sparkle = glints + speckle. Speckle = fine grain along each beam, new each frame, ±10 % (a creative choice for the user's word; no source).
- Core-to-white (cue 6). Hot cores clip to white; skirts keep the colour; crossings add up. Allowed: 1-px green and red fringes on white beams.
- Beams leave the frame (cue 9): see §2.2.
### §2.5 Palette and the colour control
- Skirt / hot core: green `#00FF46` / `#E6FFEC`; white `#E8F0FF` / `#FFFFFF`; red `#FF1A2E` / `#FFE8E4`. Background `#000000`.
- Mixes (additive crossings): green × red `#FFE14A`; green × white `#B8FFCC`; red × white `#FFB4B8`; any hot crossing `#FFFFFF`.
- The control: 3 amounts `green`, `white`, `red`, each 0–1. Default 0.7 / 0.3 / 0 (spec R3). The normalised amounts are the shares of emitters in each colour. All three at 0 = green 1.
- One emitter keeps one colour for a whole figure (seeded). Audio never changes the shares.
- White cores, the drop burst and the Grating burst are exposure effects and show in every palette. With `white` = 0 the Grating burst takes the dominant colour.
- No hue cycling. No hue outside the three colours and their additive crossings.
## §3 Signal map
| # | Signal | Visual response (rest → max) | Strength | Attack / release |
|---|---|---|---|---|
| 1 | kick | Pop: spread ×1.3 in 1 frame; the chase jumps 1 step and the newly lit beams enter with `shoot`; core gain +40 % (this part goes through the flash gate) | strong | ≤ 16 ms / 140 ms |
| 2 | snare | Grating burst from B; the chase reverses; the S beams step to their next pose (seeded poses within ±20°) | strong | ≤ 16 ms / 110 ms |
| 3 | hats | Flicker: lit share 100 % → 40 %; speckle ±10 % → ±25 % | medium | 30 ms / 180 ms |
| 4 | sub | `open` 0 → 1: beams per emitter 1 → max; spread 8° → 60° (S: 4° → 30°); lit emitters per group 25 % → 100 % | strong | 40 ms / 300 ms |
| 5 | reese | Scissor: neighbour fans lean opposite ways, 0° → ±25° | medium | 30 ms / 150 ms |
| 6 | build | `converge` 0 → 1: see the build ramp | strong | 150 ms slew / at `drop` ≤ 16 ms; with no drop 800 ms |
| 7 | drop | Climax: see the drop recipe | maximum | ≤ 16 ms / burst 250 ms; hold 2 bars; `power` 1.0 → 0.7 in 600 ms |
| 8 | bar phase (bar saw) | Clock: chase steps on 8ths; figure cut at the bar wrap every 2 bars (loud) or 4 bars (quiet); Sheet tilt 1 cycle per 8 bars | structural | step ≤ 16 ms / none (a clock) |
- `open` = the sub level, 0–1; while loud its floor is 0.3. `converge` = the build level, 0–1. sub and build multiply on the spread.
- Rule H (hits are geometry-first). A kick, snare or chase response moves the frame-mean luma by ≤ 8 % of its value unless its brightness part went through the app flash gate (≤ 3/s). Geometry parts are never gated. (Isobars: chase step ≤ 7.8 %, STATE HEAD.)
- Row 5 follows wobble under Dubstep Auto (STATE binding policy); there is no wobble row. The scene is tuned for 170–175 BPM; at other tempi the same map runs on the bar phase. If the bar phase is not locked, the chase free-runs at 5.8 Hz and the figure cuts every 2.8 s.
### Build ramp (row 6)
- build 0 → 0.5: spread ×1 → ×0.5. The beams of a fan merge toward its axis, so each bundle gets hotter. Haze ×1 → ×1.25 (research §3 cue 1: haze goes up before a drop). Scissor ×1 → ×0.3.
- build 0.5 → 0.8: spread → ×0.15. The fan axes turn perpendicular: T and F vertical (tilted 15° toward the viewer), S horizontal. Haze → ×1.5; gap luma stays ≤ 0.18.
- build ≥ 0.75: the chase runs on 16ths for ≤ 4 bars, then on 8ths.
- build ≥ 0.8 = the cage: 1 beam per emitter (≤ 14 lit beams in `truss`), white cores end to end. The chase runs on the T or F bars only, lit share ≥ 75 %; the S bars stay lit. ≥ 8 closed four-sided cells, ≥ 6 of them near-square (side ratio 0.75–1.33). B is dark. The rest of the frame is dark. The build peak never exceeds the drop in beam count, spread or `power`.
### Drop recipe (row 7; t = the frame where `drop` fires)
- t: the white burst goes through the app flash path (`VJW_FLASH`, spec §4). It is 1 onset. It falls with no second rise to ≤ 25 % at t + 200 ms and ≤ 10 % at t + 250 ms. The app luma cap applies (spec R6).
- t: every emitter of the layout unblanks; every beam enters with `shoot`; B fires one Grating burst. `open` = 1, `converge` = 0, `power` = 1.0.
- Bar 1: Beam-to-crowd, lit share 100 %. Cores stay white ≥ 400 ms; skirts return to the palette within 1.2 s.
- Bar 2: lit share 75 %, 8th chase, ≥ 24 cells from the crossings. Then the loud cycle.
- How the burst stays inside the cap: for 1 s after t the scene sends no other brightness to the flash gate; kick Pops keep their geometry; chases keep the lit count. That window holds 1 scene onset. In any 1-s window the scene makes ≤ 3 full-frame onsets in total; priority: drop burst > figure cut > kick gain.
## Signal gaps
- No new detector is requested. The items below need a codebase fact that my inputs do not hold.
- G1 `hats`: row 3 needs a 0–1 level. If the analyser gives hat onsets only, lit share stays 60 % while loud and row 3 keeps the speckle.
- G2 Quiet / loud is derived from sub and kick (§1). My inputs list no section signal; none is requested.
- G3 `drop` fires on 7 of 11 DnB drops (STATE). On a missed drop, sub → `open` still opens the rig; only the burst and the 2-bar hold are lost. Accepted.
- G4 No signal announces a drop in advance, so the scene has no pre-drop blackout (it would be a hit with no audio event).
- G5 ⚠️ system-designer confirms two facts: a bar-phase lock or confidence state exists (for the free-run fallback); a scene can route only the brightness part of a response through the flash gate (Isobars `hit←kick` used the gate, STATE).
## §4 Transitions
- Scene enter: the groups unblank on the next kicks, one group per kick (T or F, then S, then B), each with `shoot`. With no kick for 2 bars the quiet picture snaps on. Beams never fade in. Scene enter on a `drop`: the drop recipe runs at once.
- Scene leave: every beam blanks in 1 frame (afterglow ≤ 50 ms). Beams never fade out.
- Figure cut: at the bar wrap, in 1 frame. The old figure blanks and the first group of the new figure snaps on in the same frame; the other groups follow on the next beats. There is no dark frame and no cross-fade.
- Quiet → loud: at the first kick, T (or F) unblanks with `shoot`. S follows at the next snare.
- Loud → quiet: the groups blank one per beat (B, S, then T or F down to the Lone beams). The Sheet snaps on at the next bar wrap.
- Build → drop: the drop recipe. Build with no drop: `converge` relaxes in 800 ms, with no burst.
- Controls: a palette change shows within 1 frame. A layout change lands at the next bar wrap with a blank and a `shoot`.
## §5 Randomness
- Seeded: the same seed and the same audio give the same frames.
- Varies per figure: the order of Fan and Grid in the loud cycle; the chase pattern (odd/even swap, a run of 2–3 lit beams, ping-pong, a shuffled order); the group that carries the chase; which emitters take which colour (the shares come from the control); rest aims ±6°; which emitters draw the Sheet and the Lone beams; which B emitter fires a burst.
- Varies always: the haze field and the speckle.
- Never varies: emitter positions; straight beams that start at an emitter; the §3 map and the drop recipe; the figure length (2 bars loud, 4 bars quiet); the constant lit count inside a chase; the palette of the control; black away from the beams; the flash cap.
## §6 Must not happen
1. Rejected look 1 (attempt 1, `own/laser-grid.fs`): a flat fan. Equal-width, equal-brightness lines that radiate from 1–4 points over pure black, with no haze between them, no change of width or brightness along a beam, and no depth.
2. Rejected look 2 (attempt 2, now `builtin:isobars`): closed contour loops, pills or concentric rings around blobs; any stroke that curves or returns to its start; neon tubes (a core wider than 10 px, or a glow tube with no thin core).
3. A beam with no emitter at its start. An emitter that moves. A beam with a hard end inside the frame.
4. Soft beams: a beam that turns on or off slower than 60 ms. (`converge` is the only slow ramp.)
5. A full-frame blink: the whole rig on / off faster than 3/s; a chase step that changes the lit count by more than 1 beam per emitter.
6. Random flicker: on / off states that are not on the chase clock (it reads as noise, not as a rig).
7. Motion with no audio event: a chase step, a Pop or a burst in silence; a pre-drop blackout.
8. Repetitive pulsing: brightness that breathes on a sine; one figure longer than 4 bars while loud; the same chase pattern in two figures in a row.
9. A weak drop: dimmer, narrower or less white than the build peak (CQA F3); gap luma > 0.18 after the burst; beams that cannot be counted on the 1200-px copy; a white frame at drop + 0.2 s.
10. A sparse quiet picture (CQA F5): no beam crosses ≥ 60 % of the frame width.
11. Rainbow: hue cycling, or a hue outside the control's colours.
12. A milky or dressed stage: luma > 0.02 away from the beams; drawn truss, housings or crowd.
## §7 Stills
- Every tile comes from a live pass from 0:00 (`build` is an online tracker; a seek-parked frame shows build 0, STATE). Frame 1728×1117, app flash ON (CQA F8). The sheet holds 1200-px copies; S8 is a 1:1 crop. "Default" = green 0.7 + white 0.3.
- Tracks (`tracks/`): Kanine = `1-Kanine-Feel-The-Vibrat-EW6MXW.flac`; Sub Focus = `1-Sub-Focus-Elevate--SOTA-Remix--CHJWAE.flac`; Andy C = `2-Andy-C-Who-Like-The-What---Extended-Mix--9A9T05.flac`.
- Times are event-relative. Each label prints: track, absolute time (s), layout, palette, `open`, build, lit beams. ⚠️ The only absolute time in my inputs is the Sub Focus drop near 146.6 s (STATE; the user's ear check is pending).
- A drop tile needs a fired `drop`. If the named drop does not fire, use the next `drop` that fires in that track and say so on the label.
| ID | Track, moment | Layout, palette | Must show |
|---|---|---|---|
| S1 quiet | Kanine: the first frame where quiet has held ≥ 8 s (intro or first break) | `truss`, default | 1 Sheet with fog swirls + 2–4 Lone beams from 2 groups; white cores end to end; origin discs; ≥ 60 % of the frame at luma ≤ 0.03; 1 beam crosses ≥ 60 % of the frame width |
| S2 groove | Andy C: the first Fan figure ≥ 4 bars after the first fired `drop`, at a kick + 50 ms | `truss`, default | Fan: ≥ 6 T emitters and ≥ 4 S emitters lit; discrete fans with dark chase gaps; the spread popped; S beams cross the T fans into diamonds; green and white emitters |
| S3 build peak | Sub Focus: the last frame with build ≥ 0.9 before the drop near 146.6 s (else the build maximum of its last 8 bars) | `truss`, default | the cage: ≥ 6 near-vertical and 3 near-horizontal white-hot bars; ≥ 8 closed four-sided cells; ≤ 14 lit beams; the thickest haze; the rest dark |
| S4 drop + 0.2 s | Sub Focus: that `drop` + 0.2 s | `truss`, default | all 16 emitters lit; all beams lit at full spread; exit width ≥ 3× origin width; glints; white cores; burst veil ≤ 25 %; beams leave all 4 frame edges |
| S5 drop + 1 bar | Sub Focus: that `drop` + 1 bar + 50 ms | `truss`, default | no veil; lit share 75 %; ≥ 24 cells; skirts back to green and white; white cores; beams countable |
| S6 Grid, layout 2 | Kanine: the first Grid figure after the first fired `drop`, at a snare + 30 ms | `floor`, default | origins at the bottom edge; F × S lattice with ≥ 24 four-sided cells; white crossings; the Grating burst from B |
| S7 palette, layout 3 | Andy C: the first fired `drop` + 1 bar + 50 ms | `full`, green 0 / white 0.4 / red 0.6 | all 23 emitters lit; T and F beams interleave; red skirts, white beams, white cores; 0 green pixels |
| S8 close-up | 1:1 crop of S2, 640×400 px around the T emitter at x 0.44 (else the nearest lit T emitter) | — | the origin disc; ≥ 3 discrete beams with dark gaps between them at the origin; a 2–3 px white core; a green skirt; haze change along the beam; speckle; the halo lift between beams |
## §8 Creative acceptance
- **C1 (R1)** S1–S7 each read as stage lasers with no caption: straight beams that converge at fixed points, in haze. Judges: creative-qa, then the user.
- **C2 (R2)** Every lit beam, extended backward, passes ≤ 4 px from an emitter of the layout. Every tile shows ≥ 2 lit groups. Emitter points are identical in all tiles of one layout.
- **C3** 0 curved strokes, 0 closed strokes, 0 hard ends inside the frame. ≥ 85 % of lit beams end at a frame edge (S2, S4–S7). A cell exists only where straight beams of ≥ 2 emitters cross.
- **C4 (R4)** Gap luma (a 30×80 px sample between two adjacent lit beams, at 30–50 % of their length) = 0.05–0.18 in S2, S5, S6, S7. Luma ≥ 200 px away from every beam ≤ 0.02 in S1.
- **C5** Energy sharing: at 40 % of the beam length, 4 px off the axis, a Lone beam (S1) reads ≥ 1.5× a Fan beam (S2). The Sheet (S1) reads ≤ 0.5× that Fan sample.
- **C6** Core-to-white: in S4 and S5, ≥ 50 % of lit beams have a core pixel with min(R, G, B) ≥ 0.85 at 25 % of their length. The skirt of a green or red beam keeps saturation ≥ 0.6 there.
- **C7** Origin: every lit emitter shows a disc ≥ 4× the core width at luma ≥ 0.9 (S8). S4 shows a glint on ≥ 50 % of the emitters.
- **C8 (R7)** Drop > build: lit beams S4 ≥ 4× S3; mean luma S5 ≥ 1.5× S3 (S5 has no burst veil); every emitter of the layout is lit in S4.
- **C9** Countable drop: on the 1200-px copy of S5, ≥ 80 % of lit beams are separable (core vs the gap next to it ≥ 3:1). In S4, ≥ 50 % of the beams show through the veil.
- **C10 (R6)** `__flash` ≤ 3 in every 1-s window: the full length of the 3 DnB tracks in `truss`, and one track each in `floor` and `full`. `__flash` = 1 in the 1 s after each `drop`. The frame-mean luma step per chase step has p95 ≤ 8 %.
- **C11** Hits: a kick shows the Pop and a snare shows the Grating burst within 2 frames (≤ 33 ms). In 5 s of silence: 0 chase steps, 0 Pops, 0 bursts.
- **C12 (R8)** Live pass, r per row: sub ↔ `open` ≥ 0.8; reese ↔ scissor ≥ 0.8; build ↔ `converge` ≥ 0.8; kick ↔ Pop spread ≥ 0.8; hats ↔ dark share ≥ 0.6; kick ↔ gated core gain ≥ 0.6 (Isobars precedent .64, STATE).
- **C13 (R3)** Default tiles: every pixel with saturation ≥ 0.5 has a hue of 125–150°. S7: hue 345–5° and 0 green pixels. No tile shows another hue.
- **C14** Flicker (a 10-s capture of the loud cycle with hats present; CQA F7): ≥ 60 % of the beams turn on or off ≥ 4 times per 2 bars. The lit count changes by ≤ 1 beam per emitter per step. Whole-rig cuts ≤ 1 per 2 bars, plus drops.
- **C15** Variety: S2, S5 and S6 show 3 different pictures. In a 32-bar loud capture no figure lasts > 4 bars and no chase pattern repeats in two figures in a row.
- **C16** No tile matches §6 item 1 or item 2. creative-qa checks each tile against both.
## Unknowns and assumptions
- ⚠️ Absolute still times are not in my inputs (§7). The capture resolves them from the live signals and prints them on the labels.
- ⚠️ The origin hot spot, core-to-white and beams leaving the frame are inferences in research §7; this spec adopts them as the look. No footage was watched (research §7); the figure pictures come from vendor descriptions.
- ⚠️ Chase rates: no source gives chases per beat (research §7). 8ths = 5.7–5.8 Hz sit next to the sourced 6–8 Hz burst band. 16ths = 11.3–11.7 Hz, held ≤ 4 bars (≈ 5.5 s; the sourced strobe guidance caps fast strobing near 5 s).
- ⚠️ Luma, gap and r numbers are creative targets. test-architect fixes the measurement method (the CQA used ffmpeg signalstats Y, video range).
