// (c) own tempo source (design S2, plan S5.1). Pure: the ACF of the ODF window gives the coarse tempo, a comb over the
// ODF gives the beat phase, and a least-squares fit of the onset times on that grid gives period and anchor. The ODF
// is the worklet's bass band (kicks), the onsets are the full-band (b) ones.
import type { Onset } from './onset'
import type { Band } from './presets'

export interface TempoReading { bpm: number; anchor: number; confidence: number } // anchor = audio time of a beat, s
export interface TempoSource {
  push(o: Onset): void
  pushOdf(values: Float32Array, t0: number, hop: number): void
  read(): TempoReading | null
  /** Design C3: only lags in the range's candidate windows (`near`), folded into the octave around √(lo·hi), with the
   *  prior centred there. null = the default fold and prior. */
  setRange(bpm: Band | null): void
  /** Design C3/C4, for the classifier: per window, the ACF prominence of its best candidate lag mapped to 0–1 like the
   *  confidence. The ACF always spans 45–360 BPM, so this never depends on the active range. T1: `windows[0]` is DnB's.
   *  A later window whose best lag reads ⅔ or 4/5 of DnB's best tempo (octave-folded) gets at most DnB's evidence. */
  families(windows: readonly Band[]): number[]
}
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
const MARGIN = 1.1 // knob (default): a range's candidates reach this factor past each end (techno 135 → 148.5)
// T1 (dsp_detector_2026-11-16 R2): a two-step's kick → kick lags, 1.5 and 2.5 beats (116 and 69.6 at 174), sit in the
// techno and dubstep windows. Their lag over DnB's best lag, folded into [1, 2): 3/2 and 5/4, ±SUB_TOL.
const SUBS = [1.5, 1.25]
const SUB_TOL = 0.03
const SUB_FLOOR = 0.2 // knob: the DnB window caps the others only with this much evidence of its own
// Start settle (dsp_linein_2026-11-16 fix 1): after silence the bands' slow followers sit near 0, so a signal's first ODF
// values spike (38–55 on a line-in picked mid-music) and the early ACF picked its octave from them (Kanine line-in: 87,
// not 174, in 3 of 4 runs). The first SETTLE s of signal after ≥ SILENT s of no-signal ODF (the stream's start counts)
// read 0: 19-track replay line-in DnB tempo-at-ref 69 → 77 %, file 72 → 74 %, +1 false drop per path (Bad Co 16.3);
// 0.3–1 s read the same.
const QUIET = 0.05 // knob: an ODF value at or under this is no signal
const SILENT = 1
const SETTLE = 0.3

const prior = (bpm: number, centre: number) => Math.exp(-0.5 * (Math.log2(bpm / centre) / PRIOR_OCTAVES) ** 2)
/** A range's candidate: `bpm` in [lo/MARGIN, hi·MARGIN] × {½, 1, 2}. DnB 160–185 leaves out the two-step's ⅔ lag (116). */
const near = (bpm: number, [lo, hi]: Band) => [0.5, 1, 2].some((k) => bpm >= (k * lo) / MARGIN && bpm <= k * hi * MARGIN)
const level = (prominence: number) => Math.min(1, Math.max(0, (prominence - PROM_NONE) / (PROM_FULL - PROM_NONE)))

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
  let quiet = Infinity // s of no-signal ODF up to the newest value
  let settle = -Infinity // ODF values before this time read 0
  const onsets: number[] = [] // onset times, oldest first
  let reading: TempoReading | null = null
  let range: Band | null = null
  let centre = PRIOR_BPM // the prior's centre
  let [min, max] = [o.minBpm, o.maxBpm] // readings fold into [min, max)
  // The ACF's lag span (set with the hop): an octave beyond the default fold each way, whatever the range (design C3).
  let lo = 0
  let hi = 0
  let acfMean = 0 // over the span, at the last update; 0 = none yet
  const fold = (bpm: number) => {
    while (bpm < min) bpm *= 2
    while (bpm >= max) bpm /= 2
    return bpm
  }

  function update() {
    const n = ring.length
    let mean = 0
    for (const v of ring) mean += v
    mean /= n
    for (let i = 0; i < n; i++) x[i] = Math.max(0, ring[(pos + i) % n] - mean)

    // Coarse: ACF over an octave beyond the folding range each way, so a tempo just outside it still peaks (85 → 170).
    let sum = 0
    let best = -1
    const score = (lag: number) => acf[lag] * prior(60 / (lag * hop), centre)
    for (let lag = lo; lag <= hi; lag++) {
      let s = 0
      for (let i = lag; i < n; i++) s += x[i] * x[i - lag]
      acf[lag] = s / (n - lag)
      sum += acf[lag]
    }
    for (let lag = lo + 1; lag < hi; lag++) if ((!range || near(60 / (lag * hop), range)) && (best < 0 || score(lag) > score(best))) best = lag
    const [a, b, c] = [score(best - 1), score(best), score(best + 1)]
    const curve = a - 2 * b + c
    // Parabolic peak, at most ½ lag off (a no-op at a local peak): a range's edge candidate needn't be one, and an
    // unbounded step can pass lag 0, where fold() never returns (DnB, 203.75 BPM clicks).
    const bpm = fold(60 / ((best + (curve < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / curve)) : 0)) * hop))
    acfMean = sum / (hi - lo + 1)
    const prominence = sum > 0 ? acf[best] / acfMean : 0

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
    const confidence = level(prominence) * (hit.size / CONF_BEATS)
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
        lo = Math.floor(60 / (2 * o.maxBpm) / h)
        hi = Math.ceil(120 / o.minBpm / h)
        acf = new Float64Array(hi + 1)
      }
      values.forEach((v, i) => {
        const t = t0 + i * h
        if (v > QUIET && quiet >= SILENT) settle = t + SETTLE
        quiet = v > QUIET ? 0 : quiet + h
        ring[pos] = t < settle ? 0 : v
        pos = (pos + 1) % ring.length
      })
      filled += values.length
      tEnd = t0 + (values.length - 1) * h
      due += values.length
      if (due < o.updateEveryHops) return
      due = 0
      if (filled >= ring.length) update() // a reading needs a full window
    },
    read: () => reading,
    setRange(bpm) {
      range = bpm
      centre = bpm ? Math.sqrt(bpm[0] * bpm[1]) : PRIOR_BPM
      ;[min, max] = bpm ? [centre / Math.SQRT2, centre * Math.SQRT2] : [o.minBpm, o.maxBpm]
    },
    families: (windows) => {
      const best = windows.map((w) => {
        let [top, at] = [0, 0]
        for (let lag = lo + 1; lag < hi; lag++) if (near(60 / (lag * hop), w) && acf[lag] > top) [top, at] = [acf[lag], lag]
        return { f: acfMean > 0 ? level(top / acfMean) : 0, at }
      })
      const [d] = best
      const sub = (at: number) => {
        let q = at / d.at
        while (q >= 2) q /= 2
        while (q < 1) q *= 2
        return SUBS.some((r) => Math.abs(q / r - 1) < SUB_TOL)
      }
      return best.map((b, i) => (i > 0 && d.f >= SUB_FLOOR && d.at && b.at && sub(b.at) ? Math.min(b.f, d.f) : b.f))
    },
  }
}
