- Determinism (C18): the rig reads `v`, `f.sync.beat`, `f.sync.bpm`, `f.dt` and a seeded hash. No `Math.random`, no wall clock (lasers.ts L601 reads `performance.now()`; do not copy that).
- Spine: a helix (0.8 -> 4.0 turns from `W`) on a seeded drift path, plus additive terms: the thrash wave (`B`), the whip loop and the crack sweep (release), the snap kink (snare). 192 rings, uniform in arc length (knob). Each end tapers over 15 % of `L` and closes on a zero-width ring.
- Frames: rotation-minimising by double reflection (Wang et al. 2008, research §1.2; own code, about 15 lines; the body is open, so no closure fix), anchored at mid-body, then twist(u) on top. An RMF adds no wide / narrow alternation on a planar coil, so C2 (S1 <= 1, S2 >= 3) depends on `twist` alone.
- ⚠️ Assumption, needs confirmation: in the coil the wide chord lies along the coil axis (tape-wound), so the core glow lights the wide inner faces.
- Camera: `orbitVP` unchanged (view.ts L17). The rig subtracts the lagged body centre (lag 1 s). `w` in world units = (% FH) x 2 (view.ts L2-3).
- Ripple phase: a monotone integrator. Each frame adds 2 x max(0, beat step), which is 1 ripple length per 8th note, or 5.8 Hz x dt while bpm = 0. A beat jump adds bpm x dt / 30 for that frame. It never reverses (creative §6).
- `W`: the absence time counts from the last frame with `presence` above θ. Winding starts when it reaches 1 bar and credits that bar. So 16 bars give `W` .85 (3.5 turns), a gap under 1 bar winds 0, and a 1.1-bar gap winds .058, under the .06 whip floor (C11). `W` >= `build`. `W` never falls while the bass is absent. bpm = 0 uses 345 ms per beat.

**Def: inputs and bindings** (creative §3 rows in brackets)
| Input | Source | Attack / release (s) | Rig use |
|---|---|---|---|
| `bass` | `band8` | .06 / .30 | twist, ripple height, flex + thrash, scale [1-4]; rows 3-4 get slower rig one-poles |
| `presence` | `reeseLevel` (SG1) | 0 / 0 | absence -> `W` [12]; return -> release [14] |
| `reese`, `wobble` | same | .03 / .2 | burst = the larger [6] |
| `sub` | `sub` | .04 / .4 | thickness [7] |
| `kick`, `snare`, `hats` | same | 0 / 0 | float; the rig fires on a rise [8-10]. Release 0 keeps 96-100 % of the hits (dsp §2.1) |
| `build` | `build` | 0 / 0 | floor of `W` [11] |
| `drop` | `drop` | 0 / .4 | ungated: the fallback whip and the one-whip latch (recipe 4-5) |
| `flare` | `drop` | 0 / .4 | flash-class, `flash: ['flare']`. On the gated rise the rig starts the shock (400 ms) and key (1 s) envelopes [15] |
| `orbit`, `yaw`, `pitch`, `zoom` | none | - | still angles A / B and the S7 close-up; `orbit` 1 = auto drift |
- `band8` over `band6`: the higher worst-track r (.51 against .47, dsp §2.1). Lever: a second input and the max.
- Row 1 release: .35 s leaves twist .58 at 1 s from twist 6 (0.25 + 5.75 x e^(-1/.35); `release` is the one-pole tau, bind.ts L122). C17 wants <= .5, so the table uses .30 s (.46). dsp G6.1 allows >= .3 s.
- `drop` + `flare` repeat the lasers' `climax` + `burst` pair (lasers.ts L564-565, L576-577).
- If Decision 2 is "no", only the `presence` row changes (source `band8` + a rig-side kick mask). The contract stays.
