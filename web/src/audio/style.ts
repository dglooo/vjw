// Style classifier (design C4): which genre the music looks like, from tempo-family evidence plus pattern features,
// smoothed and with hysteresis so a mix never flaps. Pure, Node-testable. Fed every frame; Auto-style follows `detected`.
import { PRESETS, type Genre, type Preset } from './presets'

type Feature = keyof NonNullable<Preset['proto']>
export interface StyleIn {
  families: Record<Genre, number> // T_g: tempo-family evidence 0..1 (tempo.families)
  kickPerBeat: number | null // K over the last 8 s; null while the beat grid is unsure (sync.confidence < 0.3)
  hatsPerBeat: number | null
  wobble: number // raw wobbleDepth
  bass: number // (raw sub + raw reese) / total
  freeze: boolean // silence, a sparse section (breakdowns lack drums) or a grid it can't count (styleIn): nothing is judged
}
export interface StyleOut { detected: Genre | null; scores: Record<Genre, number>; confidence: number }
export interface StyleOpts { tau: number; margin: number; dwell: number; hold: number; floor: number; width: Record<Feature, number> }

// knobs (default, design C4): score EMA τ (s); the lead a challenger needs over the current genre, held unbroken for
// `dwell` s; no switch within `hold` s of the last one; a challenger below `floor` never takes over. `width`: the σ of
// each feature's Gaussian closeness to the genre prototype (presets.ts), in the feature's units.
const OPTS: StyleOpts = { tau: 4, margin: 0.15, dwell: 16, hold: 32, floor: 0.35, width: { kickPerBeat: 0.25, hatsPerBeat: 1.5, wobble: 0.25, bass: 0.2 } }

/** S4.3: per-beat counts for the classifier, from the caller's 8 s hit windows. K and H are unknown while the grid is
 *  unsure (confidence < 0.3) or the bpm is not locked (bpm ≤ 0), so null, and nothing is judged then (freeze): the
 *  pattern is what tells a two-step from a 4/4 kick, and on tempo evidence alone a DnB section the grid can't count
 *  reads 4/4 (1991 80–100 s: Techno, held in a set for 12 min, its 4/4 profile losing the cut drops: scratchpad/drops). */
export const styleIn = (x: { kick8: number; hat8: number; bpm: number; confidence: number; wobble: number; bass: number; families: Record<Genre, number>; freeze: boolean }): StyleIn => {
  const sure = x.confidence >= 0.3 && x.bpm > 0
  const perBeat = (c: number) => (sure ? c / ((x.bpm / 60) * 8) : null) // c / beats in 8 s
  return { families: x.families, kickPerBeat: perBeat(x.kick8), hatsPerBeat: perBeat(x.hat8), wobble: x.wobble, bass: x.bass, freeze: x.freeze || !sure }
}

/** S_g = T_g·(0.5 + 0.5·match_g): tempo is necessary, the pattern breaks overlaps. match = mean closeness of the known features. */
function score(x: StyleIn, g: Genre, width: StyleOpts['width']) {
  const p = PRESETS[g].proto!
  let sum = 0
  let n = 0
  for (const f of Object.keys(width) as Feature[]) {
    const v = x[f]
    if (v === null || Number.isNaN(v)) continue // NaN: a 0/0 share in silence must not poison the EMA for good
    sum += Math.exp(-0.5 * ((v - p[f]) / width[f]) ** 2)
    n++
  }
  return x.families[g] * (0.5 + 0.5 * (n ? sum / n : 0))
}

/** `update` every frame with `now` in s (f.time). The result object is reused. */
export function createStyle(opts: Partial<StyleOpts> = {}) {
  const o = { ...OPTS, ...opts }
  const scores: Record<Genre, number> = { dnb: 0, dubstep: 0, techno: 0 }
  const genres = Object.keys(scores) as Genre[]
  const out: StyleOut = { detected: null, scores, confidence: 0 }
  let last: number | null = null
  let cand: Genre | null = null // the challenger being timed
  let dwell = 0 // s it has led by the margin, unbroken
  let held = Infinity // s since the last switch: the first pick waits only for its dwell
  return {
    update(x: StyleIn, now: number): StyleOut {
      const dt = last === null ? 0 : now - last
      last = now
      if (x.freeze) return out // state held: the frozen time counts for neither the EMA, the dwell nor the hold
      const a = 1 - Math.exp(-dt / o.tau)
      let lead = genres[0]
      for (const g of genres) {
        scores[g] += a * (score(x, g, o.width) - scores[g])
        if (scores[g] > scores[lead]) lead = g
      }
      const cur = out.detected
      const ok = lead !== cur && scores[lead] >= o.floor && scores[lead] - (cur ? scores[cur] : 0) >= o.margin
      dwell = ok && lead === cand ? dwell + dt : 0
      cand = ok ? lead : null
      held += dt
      if (ok && dwell >= o.dwell && held >= o.hold) {
        out.detected = lead
        held = 0
      }
      out.confidence = out.detected ? scores[out.detected] : 0
      return out
    },
  }
}
