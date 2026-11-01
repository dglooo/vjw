// Hit sources (design C1): kick, snare and hats, each an envelope that jumps to 1 on a hit and decays by 1/e every τ.
// Sustained sources (plan S2.4, Variant B): sub, reese, wobble and wobbleDepth from the worklet's `feat` frames, worked
// out per hop in at(), so they don't depend on the frame rate. Each is a ratio to a running average: level independent.
// Custom bands u:<id> (plan S2.5): the band's e2 × gain, zeroed in the kick-gate gaps, one-poled at hop rate with the
// user's attack/release. The level, not a ratio to an average: the band filter's own response is the value.
// Pure, main thread: app.ts drains the worklet's hits (the T1 rule) into hit(), its `feat` batches into push(), then
// calls at(heard time) and fill()s `src` every frame.
import type { Sources } from '../bind'
import type { Drum, Hit } from './drums'
import type { WorkletMsg } from './onset.worklet'
import type { Preset } from './presets'
import type { AudioSettings } from './settings'

const TAU: Record<Drum, number> = { kick: 0.12, snare: 0.12, hats: 0.06 } // knobs: decay per drum, s (C1 defaults)
const DRUMS = Object.keys(TAU) as Drum[]
const FEAT_HOPS = 2 // hops per `feat` batch: analysis.ts's FEAT_HOPS
const AVG = 4 // knob: s, the running average the sustained sources are read against (energy.ts's long average ≈ 4.2 s)
const DEPTH = 1 // knob: s, wobbleDepth's EMA (C1)
// knob: s the three levels hold after a kick trips the reese band's gate. The kick body sweeps into 30–60 Hz over
// ≈40 ms, too slowly to trip the sub band's own gate (S2.1), and rings there and in the reese band's skirt to ≈200 ms.
const HOLD = 0.2
const SUSTAINED = ['sub', 'reese', 'wobble', 'wobbleDepth'] as const

/** The user's × the preset's sens for `id` (missing = 1). */
const sens = (s: AudioSettings, p: Preset, id: string) => (s.sens[id] ?? 1) * (p.sens[id] ?? 1)

/** x ÷ its running average. The average is the mean of every frame since the sound started, until an EMA with rate
 *  `k` is the slower: an EMA from 0 would read ≥ 2× for the first 0.7 AVG of every track. Digital silence (exactly 0,
 *  a paused file) restarts it. */
function relative() {
  let avg = 0
  let n = 0
  return (x: number, k: number) => {
    if (x > 0) avg += (x - avg) * Math.max(1 / ++n, k)
    else n = 0
    return avg > 0 ? x / avg : 0
  }
}

export function createFeatures() {
  // s since each drum's last hit. ponytail: counted in frame dt from the drain, not audioNow − t, so a file's hit reads
  // up to a frame young (bind.ts's onset age is within a frame of it); at()'s clock can supply it if that ever shows.
  const age: Record<Drum, number> = { kick: Infinity, snare: Infinity, hats: Infinity }
  const queue: Extract<WorkletMsg, { kind: 'feat' }>[] = []
  let hop = 0 // the head batch's next hop
  let until = -Infinity // worklet time: the levels hold until then
  let gated = false // the reese band's gate on the last hop
  let g = 0 // the wobble band's level
  const rel = { sub: relative(), reese: relative(), wobble: relative() }
  const uE2: number[] = [] // per band slot (3 + i): the latest gated e2, the kick latch (held ≠ e2) zeroing it
  const uY = new Map<string, number>() // per band id: the one-pole level
  let uIds: string[] = [] // the u:* ids the last fill wrote, so a removed band reads 0, not a stale value
  const v: Record<(typeof SUSTAINED)[number], number> = { sub: 0, reese: 0, wobble: 0, wobbleDepth: 0 } // before sens
  /** For the classifier and the arrangement: sub and reese are the kick-gated band levels (linear, not normalised);
   *  wobbleDepth is the source before sens and the 0..1 cap. */
  const raw = { sub: 0, reese: 0, wobbleDepth: 0 }

  /** One hop's frame, `x[i…]` = [e2, held] per band; bands 0–2 are sub, reese and wobble (each config sends them first). */
  function frame(x: Float32Array, i: number, t: number, dt: number) {
    const k = 1 - Math.exp(-dt / AVG)
    // The cross-band kick trigger: the reese band's own gate (bands.ts holds `held` ≠ e2) catches every kick, the
    // FFT detector's misses too, on this frame's clock. ponytail: a bass note that starts on a kick shows HOLD late.
    const trip = x[i + 2] !== x[i + 3]
    if (trip && !gated) until = t + HOLD
    gated = trip
    if (t >= until) [raw.sub, raw.reese, g] = [x[i + 1], x[i + 3], x[i + 5]]
    v.sub = rel.sub(raw.sub, k) / 2 // 1 ≈ average → 0.5 (the bass/mid/treb convention)
    v.reese = rel.reese(raw.reese, k) / 2
    const r = rel.wobble(g, k)
    const d = r > 0 ? r - 1 : 0 // (g − ḡ)/ḡ of the gated wobble band; silence reads 0, not −1
    v.wobble = Math.max(0, d)
    raw.wobbleDepth += (Math.abs(d) - raw.wobbleDepth) * (1 - Math.exp(-dt / DEPTH))
    v.wobbleDepth = raw.wobbleDepth
    // Custom bands: the gated e2 (the kick latch, held ≠ e2, reads 0 in the gap). Slot 3 + j is the j-th custom band.
    for (let j = 0; j + 3 < x.length / (2 * FEAT_HOPS); j++) {
      const k = i + 2 * (3 + j)
      uE2[j] = x[k] === x[k + 1] ? x[k] : 0
    }
  }

  return {
    raw: raw as Readonly<typeof raw>,
    /** A drained hit restarts its drum's envelope. `strength` is unused: the band detectors cap it on every hit. */
    hit(h: Hit) {
      age[h.drum] = 0
    },
    /** Queues a worklet `feat` batch; at() reads it. */
    push(m: Extract<WorkletMsg, { kind: 'feat' }>) {
      queue.push(m)
    },
    /** Works through every queued hop up to `t`: the heard time for a file (audioNow), Infinity (the newest) for line-in. */
    at(t: number) {
      for (let m = queue[0]; m; m = queue[0]) {
        for (; hop < FEAT_HOPS; hop++) {
          const th = m.t0 + hop * m.hop
          if (th > t) return
          frame(m.values, (hop * m.values.length) / FEAT_HOPS, th, m.hop)
        }
        queue.shift()
        hop = 0
      }
    },
    /** kick, snare, hats = e^(−age/τ); sub, reese, wobble, wobbleDepth as at() left them. Each × the user's × the
     *  preset's sens (missing = 1), at most 1. The drums read before `dt` is added, so the frame a hit is drained on
     *  reads its peak and an `event` input (≥ 0.5, live.ts) fires on it. */
    fill(out: Sources, dt: number, s: AudioSettings, p: Preset) {
      for (const d of DRUMS) {
        out[d] = Math.min(1, sens(s, p, d) * Math.exp(-age[d] / TAU[d]))
        age[d] += dt
      }
      for (const id of SUSTAINED) out[id] = Math.min(1, sens(s, p, id) * v[id])
      // u:* — e2 × gain through a dt one-pole (bind.ts's evaluate() shape: attack up, release down, 0 = instant).
      // A renamed band keeps its id; a removed one drops from the settings and reads 0 here.
      for (const id of uIds)
        if (!s.custom.some((b) => b.id === id)) {
          out[id] = 0 // a removed band reads 0 (evaluate() would hold the stale value, as the key stays in out)
          uY.delete(id)
        }
      uIds = s.custom.map((b) => b.id)
      s.custom.forEach((b, j) => {
        const y = (uE2[j] ?? 0) * b.gain
        const l = uY.get(b.id) ?? 0
        const tau = y > l ? b.attack : b.release
        const n = l + (y - l) * (tau > 0 ? 1 - Math.exp(-dt / tau) : 1)
        uY.set(b.id, n)
        out[b.id] = Math.min(1, sens(s, p, b.id) * n)
      })
    },
  }
}
