// (b) onsets, design S2: half-wave-rectified spectral flux of log-compressed magnitudes + causal peak-pick
// (post_max = 0, no look-ahead). Pure: the onset worklet runs it per hop, Vitest runs it on synthetic spectra.

export interface Onset { t: number; strength: number } // t = AudioContext time from currentFrame, s

export interface DetectorOpts {
  threshold: number // onset when odf > mean · threshold + FLOOR
  meanWindow: number // hops in the adaptive mean
  minGap: number // s between onsets
}
const DEFAULTS: DetectorOpts = { threshold: 1.5, meanWindow: 16, minGap: 0.05 } // knobs
// knob: log1p(mag · COMPRESS) on raw fft.js magnitudes (full-scale sine ≈ 128): bins above ~1e-3 are in the
// log regime (level-independent flux), a line-in's ~1e-4 noise floor stays linear, i.e. near 0.
const COMPRESS = 1000
const FLOOR = 1 // knob: absolute ODF floor (log units summed over bins), so silence and a bare noise floor never fire
const PEAK_HOPS = 3 // odf must be ≥ each of the previous 3 hops
const MAX_STRENGTH = 4

export function createDetector(opts?: Partial<DetectorOpts>) {
  const { threshold, meanWindow, minGap } = { ...DEFAULTS, ...opts }
  const hist = new Float64Array(meanWindow) // ODF ring, oldest at `pos`
  let pos = 0
  let prev: Float64Array | null = null // last hop's log-compressed magnitudes
  let odf = 0
  let lastOnset = -Infinity

  return {
    /** The latest ODF value, for the (c) batch. */
    get odf() {
      return odf
    },
    detect(mag: Float32Array, t: number): Onset | null {
      prev ??= new Float64Array(mag.length)
      odf = 0
      for (let k = 0; k < mag.length; k++) {
        const v = Math.log1p(mag[k] * COMPRESS)
        if (v > prev[k]) odf += v - prev[k]
        prev[k] = v
      }
      let sum = 0
      for (const v of hist) sum += v
      const mean = sum / meanWindow
      let peak = true
      for (let i = 1; i <= PEAK_HOPS; i++) peak &&= odf >= hist[(pos - i + meanWindow) % meanWindow]
      hist[pos] = odf
      pos = (pos + 1) % meanWindow
      if (!peak || odf <= mean * threshold + FLOOR || t - lastOnset < minGap) return null
      lastOnset = t
      return { t, strength: Math.min(MAX_STRENGTH, odf / mean) } // odf > FLOOR, so mean = 0 gives the cap, never NaN
    },
  }
}
