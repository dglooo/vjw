// The vs3 analyser core (settings.analyser 'vs3'): the friends' engine's audio → signal pipeline, so the vs3 scenes hear
// the track as in their app. Copied from donor/vs3/visual_kit/src/core/analyzer.js (Env, OnsetDet, step()'s bands,
// kick, onset, loudness and specHi maths) and src/feed/webaudio-feeder.js (_bands, _spec: the 8 octave bands and the 30
// log bins as the max of the analyser's linear bins), used with permission, 2026-11-19.
// vjw: one instance's state, not module state; fixed at the donor's defaults (REACT .5 → × 1, decay .5 → release × 1,
// gain 1, kickAttack 0 → kick-rise.js is the identity and not copied, LISTEN full, no sidechain). Fed by input.ts
// analyser2k, the feeder's own analyser (FFT 2048, smoothing 0): the bands and bins read its magDb, and specHi's FFT side
// reads its bins too (fft1024.js not copied: the AGC and fftCal rescale it as theirs). Not our FFT 1024: its 47 Hz bins
// put the sub in both low bands, and Kanine's drop (52-72 s) gave 3 kick rises where 2048 gives 28, the DnB kick rate.
// Left out, as no ported scene reads them: spec[30]'s display values (its bins still feed specHi), wave, loud. Pure, so
// Vitest runs it in Node.
import type { Sources } from '../bind'

/** The donor `s` fields the core makes (analyzer.js:443-473), post-REACT. onKick / onMid / onHigh are one-frame impulses:
 *  light from them only through the scenes' flash-gated ⚡ inputs (hear(), vs3/host.ts). */
export interface Vs3Out { kick: number; onKick: number; onMid: number; onHigh: number; sub: number; mids: number; highs: number; air: number; energy: number; bands: Float32Array; specHi: Float32Array }

const MAX_DT = 0.1 // s: a long frame (a hidden tab) steps like this one (as audio/donor.ts)
const DISP_N = 192 // specHi: display bins, log-spaced 35 Hz – 18 kHz
const SLOPE_DB_OCT = 4.5 // the display tilt, dB/octave
const SMOOTH_SIGMA = 2 // specHi's smoothing across bins, in display bins

/** analyzer.js Env: a one-pole follower, `a` s up, `r` s down. */
const env = (a: number, r: number) => ({ v: 0, step(x: number, dt: number) { return (this.v += (x - this.v) * (1 - Math.exp(-dt / (x > this.v ? a : r)))) } })
/** analyzer.js OnsetDet: one hit = one event, min(1, 4 (fast − slow)) once fast − slow passes `thresh`, then none for `gap` s. */
function onset(thresh: number, gap: number) {
  const [fast, slow] = [env(0.003, 0.05), env(0.05, 0.25)]
  let last = -10
  return (x: number, dt: number, now: number) => {
    const d = fast.step(x, dt) - slow.step(x, dt)
    if (d > thresh && now - last > gap) {
      last = now
      return Math.min(1, d * 4)
    }
    return 0
  }
}
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))

export function createVs3(sampleRate: number, fftSize: number) {
  const N = fftSize / 2, binHz = sampleRate / fftSize
  /** The feeder's window: analyser bins from `lo` to `hi` Hz, ends included. */
  const bins = (lo: number, hi: number) => [Math.max(1, Math.floor(lo / binHz)), Math.min(N - 1, Math.ceil(hi / binHz))]
  const BAND = Array.from({ length: 8 }, (_, k) => bins(k ? 60 * 2 ** (k - 0.5) : 30, k < 7 ? 60 * 2 ** (k + 0.5) : 20000)) // centres 60·2^k Hz
  const SPEC = Array.from({ length: 30 }, (_, i) => bins(i ? 50 * 1.22 ** (i - 0.5) : 25, 50 * 1.22 ** (i + 0.5))) // centres 50·1.22^i Hz
  // buildDispTables: per display bin its filterbank position, analyser bin range, filterbank → FFT crossfade and tilt
  const D = Array.from({ length: DISP_N }, (_, j) => {
    const f = 35 * (18000 / 35) ** (j / (DISP_N - 1)), fLo = j ? Math.sqrt(f * 35 * (18000 / 35) ** ((j - 1) / (DISP_N - 1))) : f / 1.04
    const k0 = clamp(Math.round(fLo / binHz), 1, N - 1)
    return { fb: clamp(Math.log2(f / 50) / Math.log2(1.22), 0, 29), k: [k0, clamp(Math.round((f * f) / fLo / binHz), k0, N - 1)], xf: clamp((f - 200) / 300, 0, 1), slope: SLOPE_DB_OCT * Math.log2(f / 1000) }
  })
  const R = Math.ceil(SMOOTH_SIGMA * 2.5), K = Array.from({ length: 2 * R + 1 }, (_, i) => Math.exp(-((i - R) ** 2) / (2 * SMOOTH_SIGMA ** 2)))
  const kSum = K.reduce((a, b) => a + b)
  const [lin, raw, peaks, specRaw, fftDisp, hiLin] = [new Float32Array(N), new Float32Array(8), new Float32Array(8).fill(0.05), new Float32Array(30), new Float32Array(DISP_N), new Float32Array(DISP_N)]
  const envs = Array.from({ length: 8 }, (_, i) => env(0.012, i < 2 ? 0.35 : 0.22)), hiEnvs = Array.from({ length: DISP_N }, () => env(0.05, 0.45))
  const [kickFast, kickSlow, kickPunch, loudEnv] = [env(0.004, 0.06), env(0.06, 0.3), env(0.001, 0.14), env(0.05, 0.4)]
  const [onLow, onMid, onHigh] = [onset(0.07, 0.12), onset(0.05, 0.09), onset(0.04, 0.06)] // the thresholds at REACT .5
  let [clock, loudPeak, specPeak, fftPeak, fftCal] = [0, 0.1, 0.1, 0.05, 1]
  const out: Vs3Out = { kick: 0, onKick: 0, onMid: 0, onHigh: 0, sub: 0, mids: 0, highs: 0, air: 0, energy: 0, bands: new Float32Array(8), specHi: new Float32Array(DISP_N) }
  const norm = out.bands
  /** The largest of `a` over the bin range `w` (ends included). */
  const top = (a: Float32Array, w: readonly number[]) => {
    let m = 0
    for (let i = w[0]; i <= w[1]; i++) m = Math.max(m, a[i])
    return m
  }

  return {
    out,
    /** One frame: `magDb` = the analyser's bins in dB (−∞ = silence); refills `out`, allocates nothing. */
    update(magDb: Float32Array, dt: number): Vs3Out {
      dt = clamp(dt, 0, MAX_DT)
      clock += dt
      for (let i = 0; i < N; i++) lin[i] = 10 ** (magDb[i] / 20) // the feeder's dB → linear amplitude (tilt kept)
      for (let k = 0; k < 8; k++) {
        raw[k] = top(lin, BAND[k])
        peaks[k] = Math.max(peaks[k] * Math.exp(-dt / 6), raw[k], 0.03)
        norm[k] = envs[k].step(Math.min(1, raw[k] / peaks[k]), dt)
      }
      let smax = 0.001
      for (let i = 0; i < 30; i++) smax = Math.max(smax, (specRaw[i] = top(lin, SPEC[i])))
      specPeak = Math.max(specPeak * Math.exp(-dt / 25), smax, 0.04)

      // specHi: the FFT side (from the 200 Hz – 500 Hz crossfade up) fused with the filterbank lows; specPeak and fftPeak
      // are separate AGCs, so fftCal maps the FFT side onto the filterbank's reference from the overlap.
      let fmax = 0
      for (let j = 0; j < DISP_N; j++) fmax = Math.max(fmax, (fftDisp[j] = top(lin, D[j].k)))
      fftPeak = Math.max(fftPeak * Math.exp(-dt / 25), 0.02, fmax)
      let calFb = 0, calFf = 0, calN = 0
      for (let j = 0; j < DISP_N; j++) {
        const { fb: bi, xf } = D[j], b0 = Math.floor(bi), b1 = Math.min(29, b0 + 1)
        const fb = (specRaw[b0] * (1 - (bi - b0)) + specRaw[b1] * (bi - b0)) / specPeak, ff = (fftDisp[j] / fftPeak) * fftCal
        let v = fb * (1 - xf) + ff * xf
        if (xf < 1) v = Math.min(v, ff * 1.26) // the FFT caps the octave-wide filterbank skirts (+2 dB headroom)
        hiLin[j] = Math.min(1.2, v)
        if (xf > 0 && xf < 1 && fb > 0.03 && fftDisp[j] / fftPeak > 0.005) {
          calFb += fb
          calFf += fftDisp[j] / fftPeak
          calN++
        }
      }
      if (calN >= 4) fftCal += (clamp(calFb / calFf, 0.4, 2.5) - fftCal) * Math.min(1, dt / 2)
      for (let j = 0; j < DISP_N; j++) {
        let v = 0
        for (let k = -R; k <= R; k++) v += hiLin[clamp(j + k, 0, DISP_N - 1)] * K[k + R]
        const db = 20 * Math.log10(Math.max(hiEnvs[j].step(v / kSum, dt), 1e-5)) + D[j].slope
        out.specHi[j] = clamp(1 + db / 48, 0, 1) // a 48 dB window
      }

      // the hits: the kick from the two low bands against band 1's peak, the mids from 3-4, the highs from 6-7
      const kickIn = Math.min(1, (raw[0] * 0.5 + raw[1]) / (peaks[1] + 1e-6))
      kickPunch.step(Math.min(1, Math.max(0, kickFast.step(kickIn, dt) - kickSlow.step(kickIn, dt)) * 3.2), dt)
      const midIn = Math.min(1, (raw[3] + raw[4]) / (peaks[3] + peaks[4] + 1e-6))
      const highIn = Math.min(1, (raw[6] + raw[7]) / (peaks[6] + peaks[7] + 1e-6))
      // loudness against a slow (30 s) reference, so quiet sections calm the energy
      const lr = raw[0] * 0.8 + raw[1] * 0.9 + (raw[2] + raw[3] + raw[4]) * 0.7 + (raw[5] + raw[6]) * 0.5 + raw[7] * 0.3
      loudPeak = Math.max(loudPeak * Math.exp(-dt / 30), lr, 0.05)
      const loud = loudEnv.step(Math.min(1, lr / loudPeak), dt)
      out.onKick = onLow(kickIn, dt, clock)
      out.onMid = onMid(midIn, dt, clock)
      out.onHigh = onHigh(highIn, dt, clock)
      out.sub = Math.min(1, norm[0])
      out.kick = Math.min(1.2, kickPunch.v)
      out.mids = Math.min(1, (norm[2] + norm[3] + norm[4]) / 3)
      out.highs = Math.min(1, (norm[5] + norm[6]) / 2)
      out.air = Math.min(1, norm[7])
      out.energy = Math.min(1.1, ((norm[0] * 1.4 + norm[1] * 1.2 + norm[3] + norm[5] + norm[7] * 0.6) / 5.2) * (0.35 + 0.65 * loud))
      return out
    },
  }
}

/** The core's signal while settings.analyser is 'vs3' (app.ts sets it every frame), else null. The vs3 host reads its
 *  levels and spectrum; gl/engine.ts its kick and onMid (hear()). */
export const vs3Live: { s: Vs3Out | null } = { s: null }

/** What a scene with a vs3 native reads: `s` itself with no vs3 signal (ours, donor: unchanged), else a copy whose `kick`
 *  and `snare` carry the core's kick and onMid. Its ⚡ hit binds `kick` and its ⚡ mid `snare` (scenes/builtin.ts VS3),
 *  so live.ts's flashGate still gates every light they add (I-FL1). An onMid under the gate's .5 line lights nothing and
 *  spends no budget: the core fires ≈ 4 a second on DnB, and the kick shares the 3/s. */
export function hear(s: Sources, v: Vs3Out | null, out: Sources): Sources {
  if (!v) return s
  Object.assign(out, s)
  out.kick = v.kick
  out.snare = v.onMid
  return out
}
