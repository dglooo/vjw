# Research — laser references for the wave-3 laser-scene REWORK

## TL;DR
- TD's Laser CHOPs are **hardware-output** operators (ILDA/AVB/Pangolin sample streams, 10k–96k samples/s). Nothing in the TD dump renders an on-screen laser; the reusable asset is the **shape-generation workflow**: pattern image → blur → level → lookup (off-to-on steps) → **Trace SOP** → traced polygons/points = the beam.
- Trace SOP knobs that matter for a traced-beam look: `thresh`, `doresample` + `step` (point count / unsmoothness), `dosmooth` + `corner`, `fitcurve`/`error`/`convpoly`/`lod` (Bézier fit), `delborder`.
- The rejected `web/src/fx/own/laser-grid.fs` is a fully analytic per-pixel polar fan (4 emitters × 8 beams, 16-step chop, 4 poses, closed-form core + halo) — no geometry, no traced outlines, no real beam cross-section or volume.
- Local MilkDrop inventory (`butterchurn-presets`, 504 presets) has exactly **3 laser-family presets**: `GreatWho - Lasershow`, `martin - cope - laser dome`, `ORB - Lazer Ride` — none of the 25 shipped in our app.
- `donor/ISF-Files/ISF` (371 files): no laser/lazer/beam names; nearest is `God Rays.fs`.

## Freshness
2026-11-15. Sources: local donor tree (TD dump = TouchDesigner **2025.33230** arm64 RE, `donor/td-reverse/touchdesigner/README.md`; ISF-Files; `web/node_modules/butterchurn` 3.0.0-beta.5, `butterchurn-presets` **3.0.0-beta.4 installed** — npm registry same day: `latest` = 2.4.7 (published 2018-06-09), `beta` = 3.0.0-beta.4, last publish overall 2022-04-12 → dormant). TD help pages in the dump: `Trace_SOP.htm` last edited 2021-11-16 (builds 2021.10000/2018.28070 era); `Lasers.htm` last edited 2025-11-04 (mentions the 2025.30000 Laser CHOP overhaul) → fresh. `laser-grid.fs` = current master.

## §1 TD laser workflow facts (snippet readMes)
- `donor/td-reverse/touchdesigner/extracted/dat_texts/Samples/Learn/OPSnippets/Snippets/CHOP/laserCHOP/laserCHOP/example1/readMe.txt`: "a few ways to generate laser patterns."
- `…/laserCHOP/example2/readMe.txt` (text is duplicated in the file; one copy quoted): the recipe for tracing a high-contrast image into beams:
  - "work in as low resolution that you can to minimize the number of pixels the Trace SOP needs to deal with"; "feed the Trace SOP a monochrome image. mono has a single-channel Pixel Format to minimize memory".
  - `blur_softenCurves` — "eliminates the tiny detail that you don't need for lasers".
  - `level_applyGammaOrWhatever` — "adjust gamma or level to get a nice contrast".
  - `lookup_offToOnTransitionsForTrace` — "with the off-to-on steps in `pattern_steps` gives an image with a lot of zero to one transitions which is what Trace will follow to generate its polygons. It is like generating **topographic lines for brightness gradients**. On `pattern_steps` you can adjust **Number of Cycles** and/or **Phase**."
  - `trace_adjustStepSize` — "with point displayed lets you adjust how many points you generate and the un-snoothness you can accept".
  - "Then look at your laser beam and re-adjust everything."
- Fact: the dat_texts extraction contains **only `readMe.txt`** in each example dir (no `.toe` contents) — the node names above come from the readMe prose itself.
- Implication: the transferable core for an on-screen scene is the image pipeline (pattern → blur → level → step-lookup → trace), not the laser CHOPs.

## §2 TD laser operators: what they are
- `donor/td-reverse/touchdesigner/extracted/Samples/Learn/OfflineHelp/https.docs.derivative.ca/Lasers.htm`: "There are 5 pathways from TouchDesigner to lasers": EtherDream DAC (Ethernet, ILDA cable), Helios (serial, ILDA; also IDN/OpenIDN over Ethernet), ShowNET (Ethernet, onboard DAC), LaserAnimation Sollinger AVB (Laser CHOP → Audio Device Out CHOP; MOTU/RME/USB2AVB/macOS; AVB2ILDA = 24-bit X/Y, electronic masking, per-color delay + geometric correction), Pangolin Beyond (shapes straight to Pangolin CHOP; safety masking/shutoff, multi-laser zones). "For all cases except Pangolin, a CHOP, POP or SOP defining the shapes is sent to the Laser CHOP which processes the data into streams of samples, and then passes the samples to the Laser Device CHOP."
- `…/Laser_CHOP.htm`: "The Laser CHOP produces channels that can drive a laser projector. It uses the points and lines of a POP, SOP or CHOP and outputs the channels at a specified sample rate, typically 10,000 to 96,000 samples per second." Replaces the legacy Scan CHOP. Overhauled 2025.30000: input is always generated at 192 000 samples/s, resampled to the Output Rate (default 48 000 → 800 position/color values per frame at 60 fps). Input contract (CHOP source): `x`, `y` per-sample points; `id` groups points into shapes; all other channels = color, blanking applied. Points split into corner vs guide points via `LasCorner` attr (1 = corner) + per-point `LasCornerHoldAdd` / `LasCornerHoldLookupFactor`. Scanning page params: `stepsize` (max x,y change per sample **while emitting color**), `bstepsize` (**while blanking**), `mincornerhold`/`maxcornerhold` (hold scales with corner angle), `cornerholdchop`, `closedoverlap` (ms of start/end overlap on closed shapes for even color). Color page: per-channel scales.
- `…/Laser_Device_CHOP.htm`: "can send laser points to supported laser devices: EtherDream, Helios, and ShowNET" (ILDA cable, except ShowNET onboard DAC). I/O: `x`, `y` ∈ [−1,1]; `r`, `g`, `b` ∈ [0,1].
- `…/LaserdeviceCHOP/…/example1/readMe.txt`: "The Laser Device CHOP receives channels from the Laser CHOP and passes it on to a supported DAC such as: Etherdream, Helios or ShowNET"; notes EtherDream IP discovery.
- `donor/td-reverse/touchdesigner/findings/libC_CHOP.strings.txt` (7 876 lines): the **only** laser strings are "Enable Laser Output" / "Disable Laser Output" (lines 1947, 1949), sitting in a block with "Send Pangolin", "blackout", "Percent of Projector Sample Rate", `targetpos 236.10.10.10` (Pangolin multicast), "total_trackers"; and mangled symbols `enableLaserOutputEP7OP_NodeP8PRM_Parm` / `disableLaserOutputEP7OP_NodeP8PRM_Parm` (lines 4916, 4919) = `enableLaserOutput(OP_Node*, PRM_Parm*)` member functions of the **Pangolin CHOP** class (`13CHOP_Pangolin` line 287, `td.pangolinCHOP` line 2611; neighbours `convertToSDKPoint…PangolinPoint`, `fillZones`, `outputZones`). There is **no** standalone "LaserOutputEP" operator; "LaserOutputEP" is a substring of the mangled names. No ILDA/EtherDream/ShowNET/Helios/"Laser CHOP" strings anywhere in the dump.
- Fact: no license file exists in the TD dump tree; the dump is a RE of proprietary TouchDesigner 2025.33230 (`donor/td-reverse/touchdesigner/README.md`) → usable as read-only reference only.
- Implication: for a browser scene the beam must be self-rendered from the traced geometry; the CHOPs contribute only the motion vocabulary (step size while lit vs blank, corner holds).

## §3 Trace SOP mechanics
Source: `donor/td-reverse/touchdesigner/extracted/Samples/Learn/OfflineHelp/https.docs.derivative.ca/Trace_SOP.htm`.
- Summary: "reads an image file and automatically traces it, generating a set of faces around areas exceeding a certain brightness threshold. You can control this threshold and the resolution of the resulting faces."
- Trace page: `top` (image to trace), `thresh` (brightness level where the outline occurs), `addtexture` (point UVs), `delborder` (drop dirty image edges), `normals`.
- Filters page: `bordwidth`; `doresample` (Resample Shapes — "level of refinement (number of points)"); `step` (Step Size — outline refinement when Resample is on); `dosmooth` (Smooth Shapes — "filtered to remove sharp corners"); `corner` (Corner Delta); `fitcurve` (Fit to Curves → 2-D Bézier, "flat edges are preserved"); `error` (Fitting Error — accuracy of the curve fit); `convpoly` (Convert to Poly); `lod` (Level of Detail of the curve→polygon conversion); `hole` (Hole Faces — bridge holes so it renders properly).
- Info CHOP channels: `num_points`, `num_prims`, `num_particles` (+ common cook times) — the budgeting counts.
- Cross-ref: §1's `trace_adjustStepSize` step tunes exactly `doresample`/`step` ("how many points you generate and the un-snoothness you can accept").

## §4 The rejected `web/src/fx/own/laser-grid.fs`
`web/src/fx/own/laser-grid.fs` (ISF 2.0, categories Geometry/Laser; two passes: `mist` ¼-res float + final full-res). Inputs: `phase` (bar saw), `hits` ∈ {1,3,5,7}, `spread` (sub), `tilt` (reese), `dash` (hats), `swap` (snare), `haze` (build), `hue`, `hit` (kick), `burst` (drop; the latter two VJW_FLASH-gated ≤3/s). The scene is 4 truss emitters (`EM_Y 0.455`, spacing `EM_DX 0.24`) each throwing 8 fixed beams (32 total) as a closed-form polar fan — beam `b` sits at angle `(b−3.5)·pitch` from straight down, `pitch = FAN·spread·pose.z/7`; a 16-step chase `lit(n) = mod(n·hits,16) < hits` selects which beams are on; one of 4 poses per beat (parallel/crossed/fan/scissor) with a `GLIDE 0.5` swing. A beam is a razor core (half-width `CORE_W + CORE_R·r`, floor 0.8 px, `(1−x²/4)⁴` falloff) plus an analytic halo `1/(1+(d/w)²)` (`HALO_W 0.008`, `HALO_R 0.022`), both modulated by a 4-octave value-noise "smoke" (`SMOKE 0.6`); hats dot the cores with rings in `r`, colors crossfade green/white, and total light is conserved by construction (per-beam halos dimmed by path length). Every visual is a per-pixel closed form: there is no geometry, no point set, no traced outline, no real beam cross-section or scattering volume — the "haze" is a flat 2-D noise field, and the only shapes are 32 straight lines in 4 poses, which is exactly the thin/analytic fan the user rejected.

## §5 MilkDrop/Butterchurn laser presets found
- `web/node_modules/butterchurn` (engine, v3.0.0-beta.5, MIT): `dist/` = JS bundles only; **no preset inventory**, zero "Laser" occurrences in `dist/butterchurn.js`.
- `web/node_modules/butterchurn-presets` (v3.0.0-beta.4 installed; packaging **MIT**, homepage butterchurnviz.com; repo `jberg/butterchurn-presets` per `web/scripts/milk-presets.mjs` — the installed package.json has no `repository` field; preset content license "unknown (preset author)"): **504** converted presets in `presets/converted/`. Name grep `laser|lazer|beam` → exactly 3:
  | preset | path (rel. `web/node_modules/butterchurn-presets/`) | pack |
  |---|---|---|
  | `GreatWho - Lasershow` | `presets/converted/GreatWho - Lasershow.json` | `md1` (original MilkDrop 1.x; `md1.js:39`) + `extra` (`extra.js:94`) |
  | `martin - cope - laser dome` | `presets/converted/martin - cope - laser dome.json` | `extra` (`extra.js:106`) |
  | `ORB - Lazer Ride` | `presets/converted/ORB - Lazer Ride.json` | `image` (`image.js`) |
- None of the 3 is among the 25 presets shipped in our app (`web/src/milkdrop/presets/*.json` — full slug list checked).
- Maintenance verdict: dormant — npm last publish 2022-04-12 (3.0.0-beta.4); latest stable 2.4.7 from 2018. Integration mode in this repo: import-as-dep (already in `web/` deps), copied into `src/milkdrop/presets/` by `web/scripts/milk-presets.mjs` with the spec §6 credit fields (`name, author, url, license`).
- `donor/ISF-Files/ISF/` (371 files, mrRay ISF collection, "everything conforms to ISF 2.0", LICENSE = **MIT**, Copyright 2018): **no** laser/lazer/beam-family filenames (grep over all 371). Nearest by name: `God Rays.fs`, `Strobe.fs`, `RGB Strobe.fs` — not laser scenes, noted for completeness only.

## §6 Reusable references for the rework (paths for the planner brief)
1. `donor/td-reverse/touchdesigner/extracted/dat_texts/Samples/Learn/OPSnippets/Snippets/CHOP/laserCHOP/laserCHOP/example2/readMe.txt` — the workflow: mono low-res pattern → blur → level/γ → step-lookup ("topographic lines for brightness gradients"; Number of Cycles / Phase) → trace step size ("points … un-snoothness").
2. `donor/td-reverse/touchdesigner/extracted/dat_texts/Samples/Learn/OPSnippets/Snippets/CHOP/laserCHOP/laserCHOP/example1/readMe.txt` — "a few ways to generate laser patterns".
3. `donor/td-reverse/touchdesigner/extracted/Samples/Learn/OfflineHelp/https.docs.derivative.ca/Trace_SOP.htm` — trace params (§3).
4. `donor/td-reverse/touchdesigner/extracted/Samples/Learn/OfflineHelp/https.docs.derivative.ca/Laser_CHOP.htm` — beam-motion vocabulary (§2): `stepsize`/`bstepsize`, corner holds, `id` shapes, blanking.
5. `donor/td-reverse/touchdesigner/extracted/Samples/Learn/OfflineHelp/https.docs.derivative.ca/Lasers.htm` — 5 hardware pathways (context: all of TD's laser stack is output-side).
6. `donor/td-reverse/touchdesigner/findings/libC_CHOP.strings.txt` lines 287, 1947–1954, 2611, 4915–4919 — the only laser strings belong to the Pangolin CHOP (binary has no visual laser operator).
7. `web/node_modules/butterchurn-presets/presets/converted/GreatWho - Lasershow.json`, `martin - cope - laser dome.json`, `ORB - Lazer Ride.json` — the 3 local laser-family MilkDrop presets (§5).
8. `web/src/milkdrop/presets.ts` + `web/scripts/milk-presets.mjs` — how to ship a preset with the spec §6 credit.
9. `web/src/fx/own/laser-grid.fs` — the rejected analytic approach, for contrast (§4).
10. `donor/ISF-Files/ISF/God Rays.fs` — closest ISF donor (rays, not beams).
