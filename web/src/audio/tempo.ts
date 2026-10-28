// (c) own tempo source (design S2, plan S5.1). Pure: the ACF of the ODF window gives the coarse tempo, a comb over the
// ODF gives the beat phase, and a least-squares fit of the onset times on that grid gives period and anchor. The ODF
// is the worklet's bass band (kicks), the onsets are the full-band (b) ones.
import type { Onset } from './onset'

export interface TempoReading { bpm: number; anchor: number; confidence: number } // anchor = audio time of a beat, s
export interface TempoSource { push(o: Onset): void; pushOdf(values: Float32Array, t0: number, hop: number): void; read(): TempoReading | null }
export interface TempoOpts {
  windowSeconds: number // ODF kept for the ACF
  minBpm: number // readings fold into [minBpm, maxBpm)
  maxBpm: number
  updateEveryHops: number
}

const DEFAULTS: TempoOpts = { windowSeconds: 6, minBpm: 90, maxBpm: 180, updateEveryHops: 32 }
const PRIOR_BPM = 128 // knob: centre of the mild log-Gaussian tempo prior …
const PRIOR_OCTAVES = 1 // … and its σ, octaves
// knobs: ACF peak / mean mapped to 0 and to 1 for that factor of the confidence. Measured on the worklet ODF on test
// tracks: steady 4/4 6.6–9.4, a non-beatmatched overlap 2.5–3.3, a clap-only break ~2.9, arrhythmic hits 1.4–3.0.
const PROM_NONE = 2
const PROM_FULL = 7
const TOL = 1 / 8 // beat: an onset this close to a grid beat belongs to it
const FIT_BEATS = 21 // least-squares span (design S2: ≲0.05 BPM over 21 beats)
const CONF_BEATS = 16 // on-grid fraction span
const COMB_BEATS = 8 // beats summed per phase candidate
const MIN_FIT = 4 // onsets needed for the fit; fewer keeps the ACF period and the comb phase

const prior = (bpm: number) => Math.exp(-0.5 * (Math.log2(bpm / PRIOR_BPM) / PRIOR_OCTAVES) ** 2)

export function createTempoSource(opts?: Partial<TempoOpts>): TempoSource {
  const o = { ...DEFAULTS, ...opts }
  let ring = new Float64Array(0) // ODF, oldest at `pos`
  let x = ring // the window oldest first, mean-removed, half-wave
  let acf = ring
  let pos = 0
  let filled = 0
  let hop = 0
  let tEnd = 0 // time of the newest ODF value
  let due = 0 // hops since the last update
  const onsets: number[] = [] // onset times, oldest first
  let reading: TempoReading | null = null
  const fold = (bpm: number) => {
    while (bpm < o.minBpm) bpm *= 2
    while (bpm >= o.maxBpm) bpm /= 2
    return bpm
  }

  function update() {
    const n = ring.length
    let mean = 0
    for (const v of ring) mean += v
    mean /= n
    for (let i = 0; i < n; i++) x[i] = Math.max(0, ring[(pos + i) % n] - mean)

    // Coarse: ACF over an octave beyond the folding range each way, so a tempo just outside it still peaks (85 → 170).
    const lo = Math.floor(60 / (2 * o.maxBpm) / hop)
    const hi = Math.ceil(120 / o.minBpm / hop)
    let sum = 0
    let best = lo + 1
    const score = (lag: number) => acf[lag] * prior(60 / (lag * hop))
    for (let lag = lo; lag <= hi; lag++) {
      let s = 0
      for (let i = lag; i < n; i++) s += x[i] * x[i - lag]
      acf[lag] = s / (n - lag)
      sum += acf[lag]
    }
    for (let lag = lo + 2; lag < hi; lag++) if (score(lag) > score(best)) best = lag
    const [a, b, c] = [score(best - 1), score(best), score(best + 1)]
    const curve = a - 2 * b + c
    const bpm = fold(60 / ((best + (curve < 0 ? (0.5 * (a - c)) / curve : 0)) * hop)) // parabolic peak
    const prominence = sum > 0 ? acf[best] / (sum / (hi - lo + 1)) : 0

    // Phase: the comb offset (hops back from the newest value) whose last beats hold the most ODF.
    const p = 60 / bpm / hop
    let phase = 0
    let top = -1
    for (let ph = 0; ph < p; ph++) {
      let s = 0
      for (let k = 0; k < COMB_BEATS; k++) s += x[n - 1 - Math.round(ph + k * p)] ?? 0
      if (s > top) [top, phase] = [s, ph]
    }

    // Fine: least squares of the onsets within ±TOL of that grid, over the last ≤21 beats. Every detector onset counts
    // (the plan's `strength ≥ 1` knob passes them all: they fire above 1.5); off-beat ones fall outside ±TOL.
    let anchor = tEnd - phase * hop
    let period = p * hop
    while (onsets.length && onsets[0] < anchor - (FIT_BEATS + 1) * period) onsets.shift()
    let m = 0, sk = 0, st = 0, skk = 0, skt = 0
    for (const t of onsets) {
      const k = Math.round((t - anchor) / period)
      if (k < -FIT_BEATS || Math.abs(t - anchor - k * period) > TOL * period) continue
      m++
      sk += k
      st += t
      skk += k * k
      skt += k * t
    }
    const d = m * skk - sk * sk
    if (m >= MIN_FIT && d) {
      period = (m * skt - sk * st) / d
      anchor = (st - period * sk) / m
    }

    // Confidence: ACF prominence × the fraction of the last 16 grid beats that have an onset within ±TOL. Per beat,
    // not per onset: off-beat hats and claps fire as strong as kicks, so a per-onset share caps near 0.4.
    const hit = new Set<number>()
    for (const t of onsets) {
      const k = Math.round((t - anchor) / period)
      if (k > -CONF_BEATS && k <= 0 && Math.abs(t - anchor - k * period) <= TOL * period) hit.add(k)
    }
    const confidence = Math.min(1, Math.max(0, (prominence - PROM_NONE) / (PROM_FULL - PROM_NONE))) * (hit.size / CONF_BEATS)
    reading = { bpm: fold(60 / period), anchor, confidence } // the fit can land a hair past a fold edge (90 → 180.0000001)
  }

  return {
    push(on) {
      onsets.push(on.t)
    },
    pushOdf(values, t0, h) {
      if (!hop) {
        hop = h
        ring = new Float64Array(Math.round(o.windowSeconds / h))
        x = new Float64Array(ring.length)
        acf = new Float64Array(Math.ceil(120 / o.minBpm / h) + 1)
      }
      for (const v of values) {
        ring[pos] = v
        pos = (pos + 1) % ring.length
      }
      filled += values.length
      tEnd = t0 + (values.length - 1) * h
      due += values.length
      if (due < o.updateEveryHops) return
      due = 0
      if (filled >= ring.length) update() // a reading needs a full window
    },
    read: () => reading,
  }
}
