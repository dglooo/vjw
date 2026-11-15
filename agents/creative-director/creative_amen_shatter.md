# Creative spec — Amen Shatter (DnB wave 4, Scene B)
## TL;DR
- The frame is a sampler. A glowing ring picture (the **plate**) is cut on a fixed 16 × 10 lattice. Every drum hit relocates whole slices by whole cells. One snare per bar slams the picture whole again.
- One drum = one cut: the kick shoves horizontal bands, the snare cracks vertical strips, the hats tick single cells. Slices only relocate content (wrapped shifts, swaps), so frame-mean luma is conserved: no strobe by construction.
- Build = a roll: frozen copies (stamps) of the plate's centre strip march across the frame at 8ths, then 16ths, timed by the beat grid. Drop = whole and clean for 0.75–1.75 beats; then all 4 bands and 8 strips fly ¼ of the width or ⅖ of the height on a beat crossing.
- All timing = the 16th slot of `f.sync.beat` + hit rises. A wrong bar phase only rotates the cycle. 10 stills on Kanine / Sub Focus / Andy C (§7).
## Freshness
- 2026-11-15, creative-director, source commit `d036b72`. Written as part files `.1`–`.7`; they join in order into `creative_amen_shatter.md`.
- Inputs: `thoughts/spec_dnb_wave4.md` §1, §3–§5; `agents/research/research_dnb_wave4.md` §2 (L49–82), §3 (L83–98); `agents/audio-dsp/dsp_dnb_wave4.md` §1–§3, §5 (cited as "dsp"); `thoughts/creative-engineering-sdlc-v1.2.md` §3 Stage 2, §5; `agents/STATE.md` HEAD.
- Reference files read (`TD/` = `donor/td-reverse/touchdesigner/extracted/`): `donor/gl-transitions-2.0.0/glsl3/WindowSlices.glsl` and `StripDatamoshGlitch.glsl` L1–60 (MIT); `TD/dat_texts/Samples/Palette/ImageFilters/lightTunnel/lightTunnel/lightTunnel/glsl1_pixel.txt`; `TD/dat_texts/Samples/Palette/ImageFilters/bloom/bloom/bloom/glsl1_pixel.txt`; `TD/Samples/Palette/ImageFilters/pixelRelocator.tox` (TD palette: Derivative, proprietary). Web: look references only.
## §1 Intent
- Mood: jungle. Choppy, hand-cut, physical. The screen is a sampler and the plate is the break. After 2–4 bars the viewer predicts the slam.
- Terms (one per thing): **plate** = the source picture. **lattice** = the 16 × 10 cut pattern. **grid** = the beat grid of `f.sync`. **slot** = the 16th index 0–15 of the scene's bar. **head** = the lattice column whose index equals the current slot. **tier** = QUIET / GROOVE / WIDE.
- Intro (no grid): the plate whole and slow, palette C, no hairlines. On grid lock the hairlines of the lattice fade in: the picture is scored, not yet cut.
- Groove: a one-bar cycle. The kick shoves, the snare cracks, the kick shoves again, the bar's last snare slams the picture whole.
- Build → drop: the roll eats the picture strip by strip until the frame is one bar of time-slices. Then clean, whole and hot for about one beat. Then the widest shatter of the track, and the WIDE tier for 8 bars.
- Break: no kick and no snare for 2 bars → every slice home, QUIET tier; the hats still tick.
- Ref (a picture cut on the rhythm): Coldcut & Hexstatic "Timber", edited "like a drum machine" — https://vdmx.vidvox.net/blog/stuart-warren-hill-holotronica (research §2.2); Autechre "Gantz Graf" (A. Rutterford, 2002), a form locked to the track's structure — https://en.wikipedia.org/wiki/Gantz_Graf.
## §2 Look
### §2.1 Lattice and slices (never varies)
- Lattice: 16 columns × 10 rows. **Cell** = 1/16 width × 1/10 height (108 × 112 px at 1728 × 1117). **Strip** = 1 column × full height. **Band** = full width × 2 or 3 rows; 4 bands fill the 10 rows. Seams snap to whole pixels. Nothing is cut finer than a cell.
- A slice (band, strip or cell) moves along its own long axis, with wrap: a band shifts by whole columns, a strip by whole rows, a cell swaps with a neighbour. Strips cut through bands; cells cut through both.
- Result: the screen is always a permutation of the plate's 160 cells. No holes, no overlap, no stretched edges; mean luma is conserved.
- Ref: wrapped slice shifts as `donor/ISF-Files/ISF/Pixel Shifter.fs` (research §2.2); an offset map as `TD/Samples/Palette/ImageFilters/pixelRelocator.tox`; clean equal slices as `WindowSlices.glsl`. Ours is driven by the slot table, never by a hash of time.
### §2.2 Moves (distance: GROOVE / WIDE)
| Move | Trigger | Slices | Distance | Hold |
|---|---|---|---|---|
| **Shove** | kick accent | set A = bands 1 + 3 (the first kick accent after a slam), then set B = bands 2 + 4; A goes right, B goes left | 2 / 4 columns | until the slam |
| **Crack** | snare accent | 4 adjacent strips at the head (WIDE: 8 strips, every other column); neighbouring strips go opposite ways, up / down | 2 / 4 rows | until the slam |
| **Tick** | hats | 2 cells of the head column swap with their right neighbour | 1 column | 1 slot |
| **Ghost** | a kick or snare off the learned pattern | 1 band of the next set / 2 strips at the head | half the tier distance | 1 slot |
| **Slam** | the bar's last learned snare slot (§3.1) | every slice | home | until the next shove |
| **Stamp** | a roll step (§3.2) | the head column | a frozen copy of the plate-centre strip | until the head returns (1 bar) |
- Accent = a kick or snare on a learned slot (slot histogram weight ≥ .5 of its maximum; dsp §3 G1). Before the histogram is defined (< 6 hits) every hit is an accent. Velocity is not detected (dsp §2.2).
- Toggle: an accent that lands on slices already displaced sends them home. No offset exceeds the tier distance.
- Every move is a 1-frame cut: no easing, no drift, no sub-cell rest. The moved slice smears along its axis on the move frame (30 % of the distance) and on the next frame (10 %); the third frame is crisp.
### §2.3 Seams and depth
- **Hairline**: every lattice line, 1 px, `#EAFBFF`, opacity = 8 % × grid confidence + 17 % × `build`.
- **Seam** = the edge between two slices with different offsets. Core 1.5–2.5 px, `#F4FBFF`, HDR 2–4 × white. Halo 16–24 px, tinted by the slice type: band seams `#FF8A1F` (kick), strip and stamp seams `#39E6FF` (snare), cell seams `#C6FF3D` (hats). Seam light stays thin (caps in C3).
- A seam flares on its hit, then rests at 25 % while its slice stays displaced. At a slam the former seams flare once more and fade out. On crack, slam and the drop shatter only, a 2–3 px red / blue fringe runs along the seams for ≤ 3 frames.
- Depth: a displaced slice sits above its neighbours (the later move on top) and drops a soft shadow on them: 12–20 px wide, ≤ 35 % darker, toward lower-right.
- Ref: a thin core + a tinted glow as `TD/dat_texts/Samples/Palette/ImageFilters/bloom/bloom/bloom/glsl1_pixel.txt` (bloom, glow colour, ramp); ribbed-glass crispness: https://shaders.paper.design/fluted-glass.
### §2.4 The plate (source picture; decision)
- Decision: a dedicated generator, the plate, is the default source. Slicing reads only on big curved forms with a gradient everywhere; noise or fine texture hides it. The plate reads as a glowing record or speaker cone seen close: lit and hazy, no turntable, no text, never flat shapes on black.
- **Core**: a disc of radius 1.2 columns at a seeded centre (x .35–.65, y .40–.60 of the frame), solid ring colour, HDR rim. The **plate-centre strip** is the strip that holds this centre.
- **Rings**: 7–9 concentric ripples that travel outward, one ring spacing per beat. The spacing grows × 1.3 per ring, so a shift never re-aligns them. Each ring = a thin HDR edge (2–3 px) with a glow tail that fades inward over 60 % of the spacing.
- **Sheen**: two opposite soft lobes of light across the rings (a bow-tie, 35° each), axis −35°, swaying ± 15° once per 2 bars. It never turns a full circle.
- **Field**: graded haze, 3 hue stops, luma ≥ .03 everywhere. Fine grooves ≥ 14 px apart, ≤ 6 % contrast, seen only inside the sheen. Grain ≤ 2 % against banding.
- Plate rules (luma on a 0–1 scale): P1 after a 2-column shove or a 2-row crack, ≥ 60 % of each seam's length shows a luma step ≥ .05. P2 detail finer than 8 px carries < 10 % of the contrast. P3 in GROOVE the rings travel ≥ 40 px per 8th at a radius of 4 columns. P4 frame-mean luma: QUIET .08–.16, GROOVE .18–.32, WIDE .28–.42; HDR > 1 on ≤ 8 % of pixels. Another generator may replace the plate only if it meets P1–P4 and §2.5.
- Camera (second priority, not gating S3): with a live camera frame, the person cut-out sits over the plate before the cut, graded to §2.5. No frame → the plate alone. Acceptance runs on the plate alone.
- Ref: a picture rebuilt from offset tiles — Hockney's joiners, https://www.halcyongallery.com/news/208-david-hockneys-photocollages-five-things-to-know/ ; radial light from a centre: `TD/dat_texts/Samples/Palette/ImageFilters/lightTunnel/lightTunnel/lightTunnel/glsl1_pixel.txt`.
### §2.5 Palette (hex)
| Role | A — GROOVE | B — WIDE and drop | C — QUIET |
|---|---|---|---|
| Field, 3 stops | `#07060D` `#1A1040` `#3A0F4A` | `#12060F` `#3A0A2E` `#5A1030` | `#05070F` `#0B1026` `#12233F` |
| Rings, by radius | `#FF5A2A` `#FFB000` `#C6FF3D` | `#FF2E88` `#FF7A1A` `#FFF4E0` | `#2BD9C5` `#5B6CFF` |
| Core disc | `#FFB000` | `#FFF4E0` | `#2BD9C5` |
| Sheen | `#FFE9C2` | `#FFF4E0` | `#9FB4FF` |
- At most 3 ring hues on screen; no hue cycling. A palette changes only with the tier: a cross-fade over 1 beat, except the drop (1 frame).
## §3 Signal map
| # | Signal (source) | Visual response | Strength | Attack / release |
|---|---|---|---|---|
| 1 | slot = round(4·beat − 0.4) from `f.sync.beat` (dsp §5 a) | the clock: head column, roll steps, slam slot, the end of the drop hold | — | the crossing frame |
| 2 | grid confidence (`f.sync`) | hairlines 0 → 8 %; below .5 → free mode (§4) | low | 500 / 1000 ms |
| 3 | kick rise (float input, attack 0) + the scene's kick slot histogram (dsp §3 G1, G8) | shove; amber seam flare. A learned kick slot fires its shove on the frame the slot index arrives (0 ms late); a kick rise or a broadband onset (`f.onsets`) must confirm it within 3 frames | high | 1 frame / hold to the slam; flare 150 ms |
| 4 | snare rise (release 0) | crack, or slam on the bar's last learned snare slot; cyan flare; fringe | high | 1 frame / hold to the slam; flare 180 ms |
| 5 | hats rise (release 0) | tick at the head; lime flare | low | 1 frame / 1 slot; flare 60 ms |
| 6 | snare density: ≥ 2 snare rises within 3 slots | roll at 16ths | mid | next 16th / 1 beat without density |
| 7 | `build` | ≥ .15 roll at 8ths; ≥ .40 roll at 16ths (hysteresis .05); ring speed × (1 + `build`); hairlines + 17 % | mid → high | 200 / 500 ms |
| 8 | `drop` rise | the drop recipe (§3.3); palette B; WIDE for 8 bars | max | 1 frame / 8 bars |
| 9 | bass level: absolute `band6`–`band8` (dsp §3 G6.1) | ring and sheen brightness × .6 → × 1.4 | mid | 30 / 300 ms |
| 10 | `sub` | plate push-in, scale 1.00 → 1.04 | low | 80 / 600 ms |
| 11 | beat phase (`f.sync.beat`) | rings advance 1 spacing per beat; sheen sway per 2 bars | — | continuous |
- An unconfirmed predicted shove retracts by frame 4. Its slot stays unarmed until a kick lands there again.
- Snare and hats moves fire on the detected rise (dsp §5 d: 10–14 ms p50). Detected snares never set a roll rate (dsp §3 G5).
- Moves are not flashes. A seam flare is flash-class: if the app's `flashGate` (research §2.4) drops it, the move still happens and the seam shows at 25 %.
### §3.1 The bar cycle (how the eye learns it)
- Slice choice = f(drum, slot, phrase seed). The same hit in the same slot moves the same slices the same way in every bar of a phrase.
- Two-step bar (kick slots 0 and 10, snare 4 and 12): shove A → crack → shove B → slam → whole for 4 slots. 4 tableaux (held slice states) per bar.
- A phrase = 4 slams. The seed changes on every 4th slam, while the frame is whole.
- Wrong bar phase (dsp §2.2: 1–3 beats off without the key): the slots rotate by 4 / 8 / 12, the cycle starts on another beat, the slam lands on the other snare. Nothing else changes. No look needs the true "1".
- No histogram yet: every second snare slams. No slam for 16 slots: the next kick or snare accent slams, whatever its slot.
### §3.2 Build: the roll
- A roll step fires on every 8th crossing (`build` .15–.40) or every 16th crossing (`build` ≥ .40, or snare density). The grid sets the rate.
- Each step stamps the head: a frozen copy of the plate-centre strip as it looks on that frame. At 8ths only the even columns get stamps, so frozen strips alternate with live ones.
- Stamps differ from each other: the rings sit ¼ spacing further out in each next 16th. One full bar at 16ths turns the frame into 16 time-slices of that bar, left to right.
- A stamp lives until the head returns: re-stamped while the roll runs, cleared to the live plate once the roll has stopped. A stamp covers its column; shoves and cracks run on in the unstamped columns; ticks pause during a roll.
- Ref: successive phases side by side — Marey's chronophotography, https://www.moma.org/collection/works/50087 ; the halving loop roll of a DJ build, https://wearecrossfader.co.uk/blog/dj-looping-guide/ ; BBCut repeat rules (research §2.1).
### §3.3 The drop recipe
- Step 1. T0 = the `drop` rise (dsp §2.1: 0.3–0.7 s after the musical drop). On that frame: every slice home, every stamp and hairline cleared, palette B, ring speed × 2, a shockwave of 3 bright rings leaves the core. The app's drop flash (STATE HEAD) is the only full-frame flash.
- Step 2. Hold whole until the first beat crossing ≥ 0.75 beat after T0 (0.75–1.75 beats; 259–603 ms at 174 BPM; free mode: 350 ms). The plate pushes in 1.00 → 1.06 across the hold.
- Step 3. Shatter on that crossing, in 1 frame: the 4 bands go ± 4 columns (alternating), 8 strips (every other column) go ± 4 rows (alternating), the scale snaps to 1.00, every seam flares at full HDR (release 400 ms), fringe for 3 frames, the hairlines return.
- Step 4. The shatter holds until the next slam. Then WIDE for 8 bars: the GROOVE cycle at the WIDE distances. A `drop` rise inside WIDE restarts the recipe. No `drop` rise (dsp §2.1: some drops are missed) → no recipe; the scene stays in GROOVE.
## §4 Transitions
- Enter: the plate whole; no move in the first 2 slots; the first move needs a hit. Leave: no tail; the scene holds no state that must finish.
- Grid lock gained, a tempo change or a ½-beat grid slip (dsp §2.2): hairlines fade in over 500 ms; the histogram starts empty and re-learns in about 4 bars; no prediction until it holds ≥ 6 hits.
- Free mode (grid confidence < .5): kick and snare fire one-shots (out in 1 frame, home after 170 ms); ticks use a seeded column. No slam, no roll, no prediction.
- GROOVE → QUIET: no kick and no snare rise for 2 bars (3 s in free mode) → every slice home on the next beat crossing; palette C over 1 beat. QUIET → GROOVE: the first kick or snare accent. WIDE → GROOVE after 8 bars: palette A over 1 beat.
## §5 Randomness
- Seed = scene seed + phrase index. Same audio + same seed → the same slice tables, frame by frame. No hash of time or frame count drives any offset.
- Varies: per phrase the band heights (6 layouts of {2, 3} rows), which strip of a crack goes up first, the rows of the hat cells; per scene entry the plate centre (inside its box) and the sheen axis (± 10°).
- Never varies: the lattice; drum → move; move axes; distances per tier; head = slot; time runs left → right; one slam per bar; the recipe order; seam colours; the stamp source.
## §6 Must not happen
- N1 A slice move in a slot without its trigger (a hit rise, a predicted kick slot, a roll step, the recipe).
- N2 Random glitch: offsets from noise or time, as `native/glitch` (50 ms seed, research §2.3), `donor/ISF-Files/ISF/Glitch Shifter.fs` and `donor/gl-transitions-2.0.0/glsl3/StripDatamoshGlitch.glsl` (hash-torn strips, scan noise, a flash).
- N3 Full-frame strobe: a blanked, inverted, white or black frame; a brightness or zoom pulse on every beat.
- N4 A slice that is blanked, inverted, tinted, scaled or rotated; holes, black gaps, wrapped garbage, clamped edge smear. Slices only relocate; only seams carry light and shadow.
- N5 Mush at the drop: pieces finer than a cell, more than 6 single cells displaced at once, datamosh smear, pixel sort.
- N6 The 1991 look: flat analytic shapes on black, stair-step edges, banding, rainbow hue cycling, a permanent RGB split, scan lines, VHS / CRT noise, JPEG blocks.
- N7 A radar look (a wedge that sweeps full turns over the rings). A lag look (a whole-frame freeze or frame repeat).
- N8 The picture shattered for more than 2 bars with no whole moment; fewer than 3 tableaux per bar in a two-step GROOVE.
- N9 Any look that needs the downbeat key, detected rolls, ghost notes, velocity, or more than 3 flashes per second.
## §7 Stills (one sheet; label = track + moment)
| # | Moment | Track and event-relative time | Must show |
|---|---|---|---|
| S1 | Quiet | Sub Focus, 20 s (no grid; first lock 44.9 s) | plate whole, palette C, no hairline, no seam |
| S2 | Groove, mid-bar | Kanine, the first crack after 30 s, + 2 frames | 2 bands 2 columns right, a 4-strip crack, amber and cyan seams, shadows |
| S3 | Groove, fullest | Andy C, the second shove of a bar after 60 s, + 2 frames | 4 bands at ± 2 columns + the crack; rings broken at every seam, still readable |
| S4 | Slam | Kanine, the slam after S2, + 2 frames | plate whole, every former seam flaring, fringe |
| S5 | Snare stutter | the first snare-density roll (Andy C, else Kanine, else Sub Focus), 4th stamp + 2 frames | 4 stamps side by side, ring steps between them, the rest live |
| S6 | Build peak | Kanine, the build with the highest `build` (.52, dsp §2.1): the frame with the most stamps | ≥ 12 stamped columns (8 alternating ones if 16ths were not reached); hairlines brighter than in S2 |
| S7 | Drop + 0.2 s | Sub Focus, the `drop` rise near 146.6 s, + 0.2 s | clean whole plate, palette B, white-hot core, the 3-ring shockwave, no seam, no hairline |
| S8 | Shatter | the same drop, shatter + 0.1 s | 4 bands at ± 4 columns, 8 strips at ± 4 rows, all seams at full HDR; the widest frame of the sheet |
| S9 | Drop + 1 bar | the same drop, `drop` rise + 4 beats (the nearest mid-bar frame within ± 2 slots) | WIDE tableau, palette B, ≥ 2 bands at ± 4 columns |
| S10 | Close-up | a 600 × 400 px crop at 1:1 from S8, where a band seam crosses a strip seam | core ≤ 2.5 px, halo, shadow, no stair-steps, no banding |
- 2D scene: no camera angles. If S5 never fires on the three tracks, report it and take S5 from the `dnb174-arr` roll. Optional S11 (camera, not gating): Kanine groove mid-bar with a test clip as the camera source (no live camera: user rule 2026-11-14).
## §8 Creative acceptance
- C1 (user) The sheet reads at a glance as a picture chopped on the break; modern and crisp. ok / not ok.
- C2 At rest (≥ 3 frames after a move) every seam lies on a lattice line ± 1 px, and with no stamp on screen the frame is a permutation of the plate's 160 cells.
- C3 With no stamp on screen, frame-mean luma stays within ± 3 % (relative) of the uncut plate; ± 6 % for 6 frames after the drop shatter.
- C4 Over 60 s: 0 moves without a trigger (N1). Every unconfirmed predicted shove retracts within 4 frames; ≤ 2 of them per kick dropout.
- C5 Timing (R6): cracks start ≤ 2 frames after the snare onset on ≥ 85 % of detected snares. Shoves on learned slots start within ± 2 frames of the kick onset on ≥ 80 % of kicks on Kanine; report the rate for Sub Focus and Andy C.
- C6 Learnability: inside one phrase with an unchanged drum pattern, the slice table at each slot is identical in ≥ 3 of 4 bars.
- C7 Locked two-step section: exactly 1 slam per bar; the frame is whole for ≥ 2 slots per bar; ≥ 3 tableaux per bar.
- C8 With the bar phase forced to + 1, + 2 and + 3 beats, C6 and C7 still hold.
- C9 Roll: stamps appear only on 8th or 16th crossings per §3.2, one per step, with 0 whole-frame freezes. `build` in .15–.40 for 1 bar → 8 stamped columns; `build` ≥ .40 for 1 bar → ≥ 12.
- C10 Drop: whole within 1 frame of T0; hold 0.75–1.75 beats; the shatter within ± 1 frame of a beat crossing; at shatter + 0.1 s all 4 bands and 8 strips are displaced.
- C11 Climax (R5): the mean offset of the 4 bands and 16 strips over the 4 bars after the shatter ≥ 1.8 × that of the 4 bars before T0.
- C12 Flash (R3): frame-mean luma makes ≤ 3 steps larger than .10 (full white = 1) in any 1 s, the app's drop flash included. On 4 × 3 tiles no tile mean makes > 3 opposing step pairs larger than .10 in any 1 s. `__flash` ≤ 3/s.
- C13 No piece finer than a cell; ≤ 6 single cells displaced at once; no region > ¼ cell under luma .02 that the uncut plate does not have (N4, N5).
- C14 QUIET: 2 bars without kick and snare → every slice home, 0 shoves, 0 cracks. Same audio + same seed → identical slice tables (§5).
- C15 Plate rules: P1, P2 and P4 hold on S2, S3 and S8; P3 holds on a 4-bar GROOVE capture.
- C16 (eye: creative-qa, user) thin HDR cores with halos, soft slice shadows, the §2.5 palette, none of N6–N7.
## Signal gaps (none blocks the S3 spike)
- SG1 Build ramp on drum-full builds (dsp §3 G7): `build` peaks .13 / .25 / .52 before Kanine's drops and 0 before Andy C's. The roll then comes late or never, and R5 "the build reads as a ramp" stays UNKNOWN there.
- SG2 Roll density (dsp §3 G5.2): under a riser 18 of 32 roll snares are lost, so signal 6 fires rarely and S5 may not exist on the real tracks.
- SG3 Automatic downbeat (dsp §3 G1.3), velocity and ghost notes (G3, G4): the slam snare and the phrase boundary sit 1–3 beats off without the key; accent = learned slot only. Designed to read OK without them.
- SG4 Drop lateness and misses (dsp §2.1): the recipe starts 1–2 beats after the musical drop, and never on a missed drop (no WIDE tier there).
- SG5 Display latency is unmeasured (dsp §5 d): C5 is measured to the frame the scene draws. Checks C2–C11 need the per-frame slice table, stamp columns and move causes readable from the scene; the designer decides how.
