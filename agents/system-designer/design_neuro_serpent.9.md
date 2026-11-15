### SG2: the bass dip before the drops
- Not answerable from the inputs (Research gap 2). The design does not depend on it. No dip and no `build` -> `W` stays under .06 -> no release; the `drop` rise then launches the whip from Groove with the +15 % pump (recipe 4). R5 and C13 stay UNKNOWN on such drops (dsp G7). The S9 caption carries the bars of absence.
### SG3: `drop` absent on 3 of 9 drops, late on the rest
- `drop` feeds only the flare and the fallback whip. On a drop without it, recipe steps 1-3 run alone, so C13 must be reachable without step 4. Spike check: one Sub Focus drop (0 of 3 fire there, dsp §2.1).
- For the test-architect: the app-wide drop flash (post.ts L12-13: white mix .8, decay .1 s) lands on the crack frame. C15 "clipped white <= 20 %" is measured with it.
### SG4: growl timbre
- Accepted as specified. The ripple height comes from `B`, the travel from `f.sync.beat` (the monotone integrator, §2.0), the burst from the larger of `reese` and `wobble`. No growl source is needed. C7 measures against `B`.
## Research gaps
1. θ data (SG1): the level distributions of `raw.reese` and `band8` in drum-only bars against bass bars, and at the first 3 frames of each audit drop against lone build kicks. Owner: audio-dsp, from the existing dumps (`scratchpad/dsp/`).
2. SG2: the bars of bass absence before each of the 9 audit drops. The same run as gap 1.
3. MSAA on RGBA16F renderbuffers: the support and the billed cost on ANGLE-Metal, and on ANGLE-D3D11 for the Windows stage. Owner: the spike.
4. The `reeseLevel` scale: `raw.reese` is linear and not normalised (features.ts L55-56). Owner: audio-dsp.
5. The session speed of the b3 numbers, and the split of b1 between beam fill and composite. Both widen the A estimate; the spike replaces them.
