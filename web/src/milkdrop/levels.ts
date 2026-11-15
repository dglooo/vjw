// Our analysis into a MilkDrop preset's audio levels (Tier S milk-sync, 2026-11-16). A preset reads bass / mid / treb
// (≈ 1 = the track's average, hits 1.5–3) and their `_att` (a short smoothing); Butterchurn computes them from the raw
// waveform. Ours: bass ← kick + the sub/reese body, mid ← snare, treb ← hats, and a burst on all three at a drop rise
// that fades over one beat. `sync` mixes them over Butterchurn's after its own update (native.ts). Pure, for Vitest.
import type { Sources } from '../bind'

const REST = 0.6 // knob: the level between hits, under the ≈ 1 average, so a hit stands out
const HIT = 1.9 // knob: a hit's peak above REST (2.5, inside MilkDrop's 1.5–3)
const BODY = 0.6 // knob: the sub/reese swell on bass
const BURST = 2 // knob: the drop burst on all three, fading linearly over one beat
const RISE = 0.25 // a drop rise: `drop` jumps by more than this in a frame (between drops it only decays, arrange.ts)

/** Butterchurn's AudioLevels arrays (dist :3175): [bass, mid, treb], `val` the level and `att` its _att. */
export interface Levels { val: Float32Array; att: Float32Array }

/** One per milk native: frame() reads this frame's sources, apply() writes the mix into Butterchurn's levels. */
export function createMix() {
  const val = new Float32Array(3)
  const att = new Float32Array(3).fill(1) // as AudioLevels starts
  let w = 0
  let drop = 0
  let burst = 0
  return {
    /** `sync` 0..1 (the knob); `dt` s; `beat` s per beat. */
    frame(s: Readonly<Sources>, sync: number, dt: number, beat: number) {
      const x = (k: string) => s[k] ?? 0
      if (x('drop') > drop + RISE) burst = 1
      drop = x('drop')
      const b = BURST * burst
      burst = Math.max(0, burst - dt / beat)
      val[0] = REST + HIT * x('kick') + BODY * Math.max(x('sub'), x('reese')) + b
      val[1] = REST + HIT * x('snare') + b
      val[2] = REST + HIT * x('hats') + b
      for (let i = 0; i < 3; i++) {
        // _att as Butterchurn's own (dist :3276–3282): rate .2 rising, .5 falling per 30 fps frame (its fps floor 15)
        const r = (val[i] > att[i] ? 0.2 : 0.5) ** (30 * Math.min(dt, 1 / 15))
        att[i] = att[i] * r + val[i] * (1 - r)
      }
      w = Math.min(1, Math.max(0, sync))
    },
    /** Ours over Butterchurn's by `sync`; at 0 (or NaN) its levels stay untouched. */
    apply(l: Levels) {
      if (!(w > 0)) return
      for (let i = 0; i < 3; i++) {
        l.val[i] += (val[i] - l.val[i]) * w
        l.att[i] += (att[i] - l.att[i]) * w
      }
    },
  }
}
