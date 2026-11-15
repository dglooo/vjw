# Creative spec: Neuro Serpent (DnB wave 4, Scene A)
## TL;DR
- Body: one open chrome band-tube (lens cross-section 2.4 : 1, 6 flutes, length 40 w) that coils in lit fog. The twist reads as spiralling flutes.
- Chrome: dark-studio strip-light reflections (no sky, no horizon), Fresnel rim, thin HDR highlight lines, polished crests over satin troughs, incandescent gills.
- The bass level `B` (`band6`/`band8`) drives twist, flex and ripple height. The ripple is procedural (speed from bpm). `reese`/`wobble` add bursts only.
- Build cue: the wind `W` rises with bass absence (0 → .85 in 16 bars) and with `build`. The coil tightens toward 4 turns around a core glow.
- Drop: a cascade. Ignite (from `B`) → release (the bass return unloads `W` in ≤ 2 beats: a whip loop tail → head, scale ×2) → after-flare (the late `drop` lands on the whip crack; never a second whip).
## Freshness
- 2026-11-15, creative-director, master `d036b72`. Inputs: `thoughts/spec_dnb_wave4.md` §1–§2, §4–§5; `agents/research/research_dnb_wave4.md` §1, §3; `agents/audio-dsp/dsp_dnb_wave4.md` §1–§3, §5; `agents/STATE.md` HEAD.
- Not read (brief limit): the SDLC doc, `liquid-chrome.fs`, the TD snippets. The last two are cited through research §1.1, §1.3, §1.4.
- Web refs are inline in §2–§3 (provenance only). Fetched today: 5 Wikipedia pages. Cited from search summaries, pages not opened: Science News, HAL, Bevy PR 13450, Poly Studio Pro docs. Taken from research §1: UKF, Resolume, Schlick. The Filament docs returned HTTP 503 and are not used.
- ⚠️ Spec R6 says "follows the reese / wobble". This spec reads R6 as "follows the bass level `B`" (dsp §2.1, §5c). The lead confirms the reading.
- Parts: this file (TL;DR–§1), `.2.md` (§2), `.3.md` (§2 end, §3 map), `.4.md` (§3 cues, §4, §5), `.5.md` (§6), `.6.md` (§7), `.7.md` (§8, Signal gaps). Join = concatenate in order.
## Terms (one term per thing)
- `w` = body width. `t` = body thickness = w / 2.4. `L` = body length = 40 w. FH / FW = frame height / width. HDR n× = linear value n before the tone map (display white = 1).
- spine = the centreline of the body. coil = the helix of the spine. twist = rotation of the cross-section about the spine, in turns per `L`. head = the leading end. tail = the other end.
- `B` = bass level 0..1 from `band6`/`band8` (one band or the larger; the designer picks). `W` = wind 0..1, a scene state, not a detector. release = `W` unloading when the bass returns. θ = the bass-presence threshold on `B` (unknown, SG1).
- ripple = procedural transverse ridges (ripple length = crest to crest; ripple height = trough to crest). gill = the glowing slit in a ripple trough. ring = the kick bulge. snap = the snare kink. glint = the hat sparkle.
## §1 Intent
| State | `W`, `B` | When | Coil turns | `w` on screen | Twist | Ripple height | Heat | Key gain |
|---|---|---|---|---|---|---|---|---|
| Rest | 0, 0 | scene entry; the first bars after the bass leaves | 0.8 | 7 % FH | 0.25 | 0 | none | 1.0 |
| Wound | 1, ≤ .2 | build peak | 4.0 | 4.5 % FH | ≤ 0.5 | ≤ 0.01 w | core glow, HDR 2× | 1.8 |
| Groove | 0, .5–1 | drop body | 0.8, flexing | 9 % FH | 3–6 | .035–.07 w | gills | 1.3 |
- Mood: neurofunk. Dark, metallic, mechanical, aggressive. A machined chrome serpent: its muscle is the bass, its core is molten.
- Story: cold and slack → wound and glowing → released and thrashing → cooling. Values between the states interpolate on `W` and `B`.
- Intro and break: the body is slack, cold and slow. `W` gathers it into a coil. Bass absence alone reaches `W` = .85 (3.5 turns, `w` 4.9 % FH) in 16 bars.
- Build: the coil tightens, shrinks and brightens. The skin stays smooth (no bass). Hats and snares make it shiver.
- Drop: the coil unloads as a whip across the frame. Twist, ripple and heat slam in with the bass. In Groove the body is large and thrashes; every kick, snare and hat marks it.
- Bass leaves: the twist relaxes within 1 s, the gills cool within 2 bars, and `W` starts again.
- Drive rule: the mean on-screen body speed is ≥ 15 % FW per second in Groove and ≤ 2.5 % FW per second in Rest.
## §2 Look
- Body: one open body, never a closed loop. `L` = 40 w. Each end tapers over its last 15 % of `L` to 20 % of the width and vanishes in the fog. No face.
- Cross-section: a lens (two convex arcs, rounded edges), w : t = 2.4 : 1. Each face carries 3 flutes (grooves along the body, depth 6 % of t).
- Twist shows twice: the silhouette alternates wide / narrow, and the flutes spiral. Ref: twist-fluted columns https://en.wikipedia.org/wiki/Solomonic_column ; TD snippets `SOP/sweepSOP.tox` ("twist and roll") and `POP/tubePOP.tox` (tapered tube), path root in research §1.1; `web/src/scenes/wireform.ts` L60–69, L104–105.
- Coil: the spine is a helix on a slowly drifting curve, 0.8 → 4.0 turns (§1). In Wound the gap between adjacent turns stays ≥ 0.5 w. Body pixels are 8–14 % of the frame in Rest and Wound, 22–30 % in Groove, never > 35 % (close-up excepted).
- Occlusion: a nearer body part fully hides a farther one. No additive see-through. Research §1.2 and §1.4: this needs depth or a raymarch; the designer decides.
- Ripple: transverse ridges, ripple length 0.6 w, saw profile (steep side toward the tail), ripple height 0 → 0.07 w. With the flutes it cuts a diamond pattern. It fades out where its ripple length is < 6 px on screen. Ref: single-cut and double-cut file teeth https://en.wikipedia.org/wiki/File_(tool)
- Chrome: mirror metal, tint `#C8D2DC`. It reflects a dark studio: 1 key strip, 2 rim strips, a fog bounce. No sky, no horizon line, no ground colour. Ref: `env()` in `web/src/fx/own/liquid-chrome.fs` L36–44 (structure only); strip-pair studio lighting https://blendermarket.com/products/poly-studio-pro---hdri-maker--lighting-builder/docs ; TD snippets `MAT/pbrMAT.tox`, `COMP/environmentlightCOMP.tox`.
- Lights: key strip `#EAF4FF`, overhead front, 70° × 6°, HDR 6×. Rim strips `#4A3CFF`, left-back and right-back, 8° × 60°, HDR 3×. Fog bounce from below `#0E1A2E`.
- Highlight lines: ≥ 3 separate lines run along the body in every wide still. Core width ≤ 6 % of w, aspect ≥ 8 : 1, peak ≥ HDR 4×, bloom halo 2–4 % FH. In Groove the ripple chops them into dashes. Ref: anisotropy stretches a highlight "into lines" https://github.com/bevyengine/bevy/pull/13450 ; `web/src/gl/bloom.ts`.
- Fresnel rim: every silhouette edge shows a continuous rim in the rim colour, 2–6 % of w wide. Ref: https://en.wikipedia.org/wiki/Schlick%27s_approximation
- Roughness: crests are polished (sharp reflections). Flute bottoms and ripple troughs are satin (soft reflections). Cavities are ≥ 60 % darker than their crests. The darkest body tone is `#070A10`, never pure black.
- Heat (emissive) uses one ramp: `#5A0A06` → `#B3130B` → `#FF3B12` → `#FF8A1F` → `#FFD98A` → `#FFF6E0` → white HDR. Carriers: gills, the snap gash, sparks, and the core glow (an orange fog glow `#FF8A1F` on the coil axis, radius 1.5 w, that back-lights the inner faces of the turns). Ref: red-heat colours, dark red 705 °C to white 1315 °C, https://en.wikipedia.org/wiki/Red_heat
- Tempering fringe: a band 0.3 w wide borders each hot zone, `#6A2BD9` → `#1E4BFF` → `#3FA0FF`. Ref: tempering colours (purple 282 °C, dark blue 310 °C, light blue 337 °C) https://en.wikipedia.org/wiki/Tempering_(metallurgy) ; thin-film model https://hal.archives-ouvertes.fr/hal-01518344v2
- Area shares of the lit body: steel reflections ≥ 70 %, heat ≤ 25 % (≤ 40 % for 2 beats after the release), fringe ≤ 10 %.
- Sparks: forked streaks, `#FFFFFF` → `#FFB45A` → `#FF5A1F`, speed 6–12 w/s, life 250–400 ms. Ref: "bushy" forking sparks https://en.wikipedia.org/wiki/Spark_testing
- Background: a fog void, `#04060A` (top) → `#0A1220` (bottom), a soft glow band `#12233F` at mid height (no hard edge), slow haze noise (contrast ≤ 4 %). Mean luma 3–8 %. No stars, no grid, no floor, no props.
- Depth fog: body luminance falls to ≤ 25 % at 3× the nearest body distance and takes the fog colour `#0E1A2E`. Fog gradients are dithered: no band edge at 100 % zoom. Ref: haze precedent `web/src/scenes/lasers.ts` L1–9.
- Camera: the orbit camera frames the body centre (lag 1 s), yaw drift 4°/s, pitch +5° to +20°. No cuts, no shake. Still angles: A = yaw 30°, pitch +12°; B = yaw 120°, pitch −6°. Ref: `orbitVP`, `web/src/gl/view.ts` L7–23.
- Mood refs: Noisia "Outer Edges" https://ukf.com/read/everything-you-need-to-know-about-noisia-outer-edges/ (its chrome look is unverified, research §1.1); "LuChrome" https://www.resolume.com/footage/LuChrome (take the evolving 3D chrome, avoid the uniform mirror).
- Budget cut order (R2): tempering fringe, then spark count, then haze noise. Never cut: highlight lines, depth fog, occlusion, gills, the drop recipe.
## §3 Signal map
| # | Signal | Visual response | Strength | Attack / release (ms) |
|---|---|---|---|---|
| 1 | `B` (`band6`/`band8`) | Twist of the cross-section | 0.25 → 6 turns per `L` | 60 / 350 |
| 2 | `B` | Ripple height | 0 → 0.07 w | 60 / 300 |
| 3 | `B` | Flex (the coil radius shrinks) and thrash (a lateral spine wave) | 0 → −25 %; 0 → 1.5 w | 80 / 500 |
| 4 | `B` | Scale (`w` on screen) and key gain | 7 → 9 % FH; ×1 → ×1.3 | 400 / 2000 |
| 5 | bpm phase (`f.sync.beat`) | Ripple travel toward the tail | 1 ripple length per 8th note; 5.8 Hz while bpm = 0 | none |
| 6 | `reese`, `wobble` (the larger) | Burst: ripple height ×1.5, gill width 8 → 20 % of the ripple length, gill HDR ×2 | 0 → 1 | 30 / 200 |
| 7 | `sub` | Thickness `t` swells | +0 → +30 % | 40 / 400 |
| 8 | `kick` (event, bind release 0) | Ring pair: born at the body point nearest the camera, runs to both ends | radius +30 % over 1.2 w; crest highlight ×3; 8 w per beat | 0 / half-life 100 |
| 9 | `snare` (event, bind release 0) | Snap: a lateral kink + a gash + sparks; the side alternates per snare | kink 0.8 w over 2 w; gash HDR 6×; 24–40 sparks | 0, hold 1 sixteenth / ≤ 10 % after 1 beat; the gash cools in 300 |
| 10 | `hats` (event, bind release 0) | Glints on crests; a shiver of the coil about its axis | 8 ± 4 glints, HDR 4×; shiver ± 4° × `W` | 0 / 60; 0 / 80 |
| 11 | `build` | Floor of `W` (`W` ≥ `build`) | 0 → 1 | follows the source; held while the bass is absent |
| 12 | Bass absence (1-bar mean of `B` < θ) | `W` rises | 0 → .85 in 16 bars, .85 → 1 in the next 16 | linear |
| 13 | `W` | Coil turns; scale; key gain; core glow | 0.8 → 4.0; ×1 → ×0.64; ×1 → ×1.8; HDR 0 → 2× (∝ `W`²) | follows `W` |
| 14 | Bass return (`B` > θ after absence) | Release: `W` → 0 and the whip loop (drop recipe 2–3) | ∝ `W` at that moment | start ≤ 3 frames / done ≤ 2 beats |
| 15 | `drop` | After-flare, flash-class: fog shock + key gain ×1.5 (drop recipe 4) | ∝ `drop` | 0 / shock 400, key 1000 |
### Build cue (not `build` alone)
- `W` has two inputs: bass absence (row 12) and `build` (row 11). Either one alone winds the coil.
- Bass absence alone reaches `W` = .85 (3.5 turns) in 16 bars and 1 in 32 bars. `build` can lift `W` earlier.
- `W` never falls while the bass is absent, even when `build` falls back to 0 (dsp §2.1, Sub Focus: .76 falling to .00).
- A kick must not unwind the coil: one kick changes `W` by ≤ 5 % (θ and the kick pump: SG1).
- A bass gap shorter than 1 bar winds `W` by ≤ .06. A fill inside a drop makes no whip.
- Where the bass does not dip and `build` stays 0, the scene shows no build. Drop recipe 4 still fires. R5 stays UNKNOWN there (dsp G7).
### Drop recipe (a cascade; each stage uses the earliest signal that can prove it)
1. Ignite, 0–60 ms, from `B`: twist and ripple rise with the first bass frames, the gills light, the first kick sends a ring pair.
2. Release, on the bass return (start ≤ 3 frames), scaled by `W` at that moment: the turns fall to 0.8 and `w` grows 4.5 → ≥ 8.5 % FH within 2 beats (70 % at 1 beat). The core glow is spent within 2 beats.
3. Whip loop: one curvature loop runs tail → head in 1 beat and grows ×2.5 on the way (the taper). Then the head tip sweeps ≥ 60 % FW in ≤ 1 beat (the crack) and sheds 80–120 sparks. A white-hot band (HDR 6×, 3 w long) rides the loop. Ref: https://www.sciencenews.org/article/loud-loop-new-explanation-whip-snapping-unfurls (Goriely & McMillen, PRL 88(24), 2002).
4. After-flare, on `drop` (+0.3 to +0.7 s late on 6 of 9 audit drops, absent on 3, dsp §2.1): a fog shock ring grows 0 → 60 % FW in 300 ms, and key gain ×1.5 decays with `drop`. The loop needs 1–2 beats to reach the tip, so the late `drop` lands on the crack. If no release ran in the last 2 s, `drop` also launches step 3 from Groove with a +15 % scale pump.
5. One whip per drop. A late `drop` never starts a second whip. If neither the bass return nor `drop` occurs, nothing fires.
6. Targets for a drop that starts from `W` ≥ .7, drop +1 beat against drop −1 beat: body coverage ×≥ 1.8, mean frame luma ×≥ 1.4, mean frame difference ×≥ 3.
## §4 Transitions
- Enter: `W` starts at 0. The body emerges from the far fog along its spine within 2 beats. The first frame is lit and valid. No whip, flash or pop on entry.
- Leave: no exit animation. The scene tolerates a cut at any frame.
- Bass leaves (Groove → Rest): the twist relaxes within 1 s, the ripple dies in 300 ms, the gills cool down the heat ramp within 2 bars, `w` eases 9 → 7 % FH over 4 bars, `W` starts to rise.
- Bass returns: the drop recipe, scaled by `W` at that moment. `W` < .06 gives no whip.
- Grid lost (bpm = 0): the ripple travels at 5.8 Hz; ring and whip timings use 345 ms per beat. Nothing in the scene uses the bar phase (the downbeat is arbitrary, research §3).
- Presets: the same map under DnB and Dubstep. Row 6 takes the larger of `reese` and `wobble`.
## §5 Randomness
- Seeded by the scene seed: the spine drift path, the twist handedness (re-drawn at each release), each snap position and the first snap side, glint positions, spark directions and forks, the camera start yaw.
- Snap positions lie in the central 60 % of the visible body. Two successive snaps are ≥ 4 w apart and on opposite sides.
- Never varies: palette, cross-section, material, lights, the signal map and its timings, the drop recipe, the ring birth rule, the flash cap, `L`. The same seed and audio give the same frames.
## §6 Must not happen
- A pulsing blob. No uniform scale pulse of the whole body on any signal. `sub` changes the thickness only (≤ +30 %). Row 4 is slow (attack 400 ms).
- Flat analytic shapes on black (rejected look). No unlit or single-tone face, no pure-black background, no primitive without fog.
- Dated rendering (the "1991" chrome). No uniform mirror, no sky-and-horizon reflection, no round plastic highlight blob, no visible facets, no banding, no aliasing crawl.
- A hit with no audio event. No free-running pulse, shiver, ring or snap. The ripple height is 0 when `B` is 0.
- A frozen body in a drop. Twist, flex and ripple height never bind to `reese` or `wobble` alone (they read 0 for half of each drop, dsp §2.1). `wobbleDepth` is never bound.
- A calm, pretty morph in Groove (the §1 drive rule fails).
- Mush at the drop. The silhouette stays sharp. Streaks come from HDR highlights only. Clipped white covers ≤ 20 % of the frame in the after-flare and ≤ 8 % otherwise.
- A double drop: a second whip when `drop` arrives late.
- Flicker. Only the after-flare is flash-class, and it passes the ≤ 3 per second gate. A ring, snap, gash or glint changes ≤ 5 % of the frame area.
- A strobing ripple. The ripple drifts to the tail only. It never reverses or blinks. Its bright features (dashes, gills) cover ≤ 20 % of the body area.
- Repetition: two successive snaps at the same place or on the same side.
- Also out: a literal snake (head, eyes, scale texture); a rainbow oil-slick (the fringe stays violet to blue); camera cuts or shake; a look that reads as `liquid-chrome` (2D fluid) or as the lasers.
## §7 Stills
| ID | Track, moment | Angle | Must show |
|---|---|---|---|
| S1 Rest | Kanine "Feel The Vibration", first sound + 2 bars | A | slack body (≤ 1.3 turns), cold steel, ≥ 3 highlight lines, far end ≤ 25 % luma, no heat, background not black |
| S2 Groove | Sub Focus "Elevate", drop (146.6 s) + 8 bars, ≤ 100 ms after a kick | A | ≥ 3 wide / narrow alternations, highlight dashes, gills, a ring pair in transit, rim, body spans ≥ 90 % FW |
| S3 Groove, angle 2 | the same audio frame as S2 | B | ≥ 1 overlap where the near part hides the far part, depth fog, the same light logic |
| S4 Build peak | Kanine, audit drop 3 − 1 beat (`build` max .52 there) | A | ≥ 3.3 separable turns, coil ≤ 50 % FH, core glow, smooth skin, fringe |
| S5 Drop +0.2 s | the S4 drop + 0.2 s (`drop` fires ≈ +0.7 s there) | A | tail half unfurled, head half coiled, the whip loop at 50–65 % of the body with its white-hot band, streaks, gills lit, no veil |
| S6 Drop +1 bar | the S4 drop + 1 bar | A | Groove at full scale: `w` ≥ 8.5 % FH, twist ≥ 4, ripple ≥ 70 %, after-flare gone, coverage ≥ 1.8 × S4 |
| S7 Ripple close-up | Sub Focus, drop (146.6 s) + 4 bars, a frame with `B` ≥ .7 | A, body fills 60–80 % FH | ≥ 8 saw ridges, polished crest against satin trough, gill ramp red → orange → white, fringe, no facets, no aliasing, no banding |
| S8 Snap | Andy C "Who Like The What", audit drop 1 + 2 bars, first snare + 1 frame | B | kink ≈ 0.8 w, white-hot gash, ≥ 20 forked sparks, the rest of the body undisturbed |
| S9 Wind without `build` | Andy C, audit drop 1 − 1 beat (`build` = 0 on this track) | A | ≥ 2.5 turns from bass absence alone; if fewer, the caption gives the bars of bass absence (SG2) |
| S10 Break | Kanine, first break after audit drop 1, bass gone + 4 bars | B | no gills, twist ≤ 0.5, slack body starting to gather (≤ 1.7 turns), cold palette |
- Rules: 1200 px copies; one fixed seed; DnB preset; a live pass from the track start for every still (`W` and `build` are online states; a seek-parked shot reads 0, STATE HEAD). Each caption gives track, moment, angle, `W`, `B`, `drop`.
- Audit drop numbers follow the order of dsp §2.1 (⚠️ order assumed). If `W` < .85 at S4, use the audit drop with the highest `W` on the three tracks for S4–S6 and say so.
## §8 Creative acceptance
- C1 (user) The sheet reads as neurofunk chrome at a glance. S6 is the strongest still.
- C2 Body: a lens cross-section with flutes. S2 shows ≥ 3 wide / narrow alternations, S1 shows ≤ 1. S3 shows ≥ 1 overlap where the near part fully hides the far part.
- C3 Chrome: ≥ 3 highlight lines in every wide still, peak ≥ HDR 4× before the tone map, a continuous rim on silhouette edges, no sky or horizon in any reflection.
- C4 No flat face: the luma range across any face width is ≥ 3 : 1. Cavities are ≥ 60 % darker than their crests (S7). No body pixel is pure black.
- C5 Space: background mean luma 3–8 %. The far body is ≤ 25 % of the near luma. No band edge is visible at 100 % zoom (creative-qa by eye; the test-architect sets the numeric bound).
- C6 Twist follows the bass: r(twist, `B`) ≥ .80 on a live pass (R4; R6 as read in Freshness).
- C7 Ripple: r(ripple height, `B`) ≥ .80. The height is 0 when `B` is 0. Travel is 1 ripple length per 8th note ± 5 %, toward the tail only. No aliasing crawl in a 10 s clip.
- C8 Kick: a ring pair is born on screen ≤ 1 frame after the `kick` rise and is ≤ 10 % after 1 beat. 0 rings without a kick.
- C9 Snare: the kink reaches its full offset within 1 frame of the `snare` event and holds 1 sixteenth. Sides alternate. Successive snaps are ≥ 4 w apart. 0 snaps without a snare.
- C10 Hats: glints sit on crests and last ≤ 60 ms. 0 glints without a hat.
- C11 Build cue: with `build` = 0, 16 bars of bass absence give ≥ 3.3 turns. One kick changes the turn count by ≤ 5 %. A bass gap < 1 bar makes no whip.
- C12 Drop: the release starts ≤ 3 frames after the bass return. At +1 beat the turns are ≤ 1.8. At +2 beats the body spans ≥ 90 % FW.
- C13 Climax (R5), for a drop that starts from `W` ≥ .7: drop +1 beat against drop −1 beat gives coverage ×≥ 1.8, mean frame luma ×≥ 1.4, mean frame difference ×≥ 3.
- C14 One whip per drop on every audited drop. Where neither the bass return nor `drop` fires: 0 whips.
- C15 Flash: full-frame flashes ≤ 3 per second on a 60 s pass. Only the after-flare is flash-class. Clipped white ≤ 20 % of the frame. The ripple's pattern flicker is outside `__flash`: creative-qa judges it in a clip.
- C16 Drive and shape: Groove mean body speed ≥ 15 % FW per second; Rest ≤ 2.5 %. The visible body is ≥ 12 w long along its spine in every wide still. The turns are separable in S4.
- C17 Break: the gills are dark within 2 bars of the bass leaving. The twist is ≤ 0.5 within 1 s (S10).
- C18 Determinism: the same seed and audio give the same stills.
## Signal gaps
- SG1 (needed) A bass presence that a kick does not trip, within 50 ms. `band6`/`band8` pump with the kick (dsp G6.1). Their levels in drum-only bars against bass bars are not listed, so θ is unknown. Cheapest listed path: `reeseLevel` (dsp G6.2; its kick gate holds 0.2 s, research §3). Fallback: `W` from `build` only and the release from `drop`.
- SG2 The bass dip before the drops: how many of the 9 audit drops follow ≥ 4 bars of bass absence is not listed. STATE HEAD names "no-bass-dip drops" as an open item. Without a dip and without `build`, the scene shows no build (R5 UNKNOWN there, dsp G7).
- SG3 `drop` is absent on 3 of 9 audit drops and +0.3 to +0.7 s late on the others (dsp §2.1). Recipe steps 1–3 do not need it. Step 4 does.
- SG4 Growl timbre: no source follows it (dsp G6). The ripple is procedural by decision. C7 measures it against `B`, not against the growl.
