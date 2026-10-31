// Hit sources (design C1): kick, snare and hats, each an envelope that jumps to 1 on a hit and decays by 1/e every τ.
// Pure, main thread: app.ts drains the worklet's hits (the T1 rule) into hit() and fill()s `src` every frame.
import type { Sources } from '../bind'
import type { Drum, Hit } from './drums'
import type { Preset } from './presets'
import type { AudioSettings } from './settings'

const TAU: Record<Drum, number> = { kick: 0.12, snare: 0.12, hats: 0.06 } // knobs: decay per drum, s (C1 defaults)
const DRUMS = Object.keys(TAU) as Drum[]

export function createFeatures() {
  // s since each drum's last hit. ponytail: counted in frame dt from the drain, not audioNow − t, so a file's hit reads
  // up to a frame young (bind.ts's onset age is within a frame of it); take S2.4's at(t) clock if that ever shows.
  const age: Record<Drum, number> = { kick: Infinity, snare: Infinity, hats: Infinity }
  return {
    /** A drained hit restarts its drum's envelope. `strength` is unused: the band detectors cap it on every hit. */
    hit(h: Hit) {
      age[h.drum] = 0
    },
    /** kick, snare, hats = e^(−age/τ) × the user's × the preset's sens (missing = 1), at most 1. Read before `dt` is
     *  added, so the frame a hit is drained on reads its peak and an `event` input (≥ 0.5, live.ts) fires on it. */
    fill(out: Sources, dt: number, s: AudioSettings, p: Preset) {
      for (const d of DRUMS) {
        out[d] = Math.min(1, (s.sens[d] ?? 1) * (p.sens[d] ?? 1) * Math.exp(-age[d] / TAU[d]))
        age[d] += dt
      }
    },
  }
}
