// Donor-mode analyser core (plan_audio_donor_mode S1.1; dsp_donor_mode_2026-11-18 §A1, gaps G1). Pure, so Vitest runs
// it in Node. Ported from our own prototype `scratchpad/dsp-donor/donor-model.ts` with its options fixed (hold 'music',
// holdAcc, edge 25 ms, Bass 30–150 Hz). Every constant is ours: inferred and tuned on 3 tracks, none is donor code.
import type { Sources } from '../bind'

/** One frame's inputs from app.ts (CP1 contract). S1.1 reads `fired`, `build`, `peakDb` and `silent`. */
export interface DonorIn { beat: number; bpm: number; confidence: number; kick: boolean; fired: boolean; build: number; peakDb: number; silent: boolean }

// Knobs (plan § Parameters). 150–250 Hz is left out of every band but `all` on purpose (dsp §A2 sweep).
const BANDS = [['', 30, 16000], ['Bass', 30, 150], ['Mid', 250, 2000], ['MidHigh', 2000, 6000], ['High', 6000, 16000]] as const
const SHORT = 10 // s: Level's running mean/σ
const LONG = 60 // s: the N60 stats (Presence, Intensity, BassExpoCurve)
const ATTACK = 0.03 // s, Level
const RELEASE = 0.15 // s, Level
const PRES_TAU = 2 // s
const INT_TAU = 6 // s
const FADE_RISE = 1.5 // s
const FADE_FALL = 2.5 // s
const BANG_TAU = 0.3 // s
const EDGE_SKIP = 0.025 // s after a silent → music edge in which no stat and no accumulator takes the frame (G1)
const MAX_DT = 0.1 // s: a long frame (a hidden tab) steps like this one

const ema = (dt: number, tau: number) => 1 - Math.exp(-dt / tau)
const clamp = (x: number) => Math.min(1, Math.max(0, x))

/** Running mean/σ: an EMA of τ s, a plain mean until the EMA is the slower. norm(): μ → .5, ±2σ → 0 / 1 (σ 0 reads 0 at μ). */
function stats(tau: number) {
  let [mu, v, n] = [0, 0, 0]
  return {
    add(x: number, dt: number) {
      const a = Math.max(1 / ++n, ema(dt, tau))
      const d = x - mu
      mu += a * d
      v += a * (d * d - v)
    },
    norm: (x: number) => clamp((x - (mu - 2 * Math.sqrt(v))) / (4 * Math.sqrt(v) || 1)),
  }
}

/** The 6 s EMA of .8 · Bass N60 + .2 · High N60, one tick on (design C11; the weights of `arrange.ts`). */
export const intensityStep = (e: number, bassN60: number, highN60: number, dt: number) => e + (0.8 * bassN60 + 0.2 * highN60 - e) * ema(dt, INT_TAU)
export const intensity = (e: number) => clamp(0.5 + 2.5 * (e - 0.5))
/** s since our arrangement's `fired` → 1, then e^(−age / .3 s). */
export const primeBang = (age: number) => Math.exp(-age / BANG_TAU)
/** The meter's held sample peak, dBFS: −60..0 → 0..1. */
export const inputLevel = (peakDb: number) => clamp((peakDb + 60) / 60)

export function createDonor(sampleRate: number, fftSize: number) {
  const bin = (hz: number) => Math.min(fftSize / 2 - 1, Math.max(1, Math.round((hz * fftSize) / sampleRate)))
  const B = BANDS.map(([name, lo, hi]) => ({
    lo: bin(lo), hi: bin(hi), s10: stats(SHORT), s60: stats(LONG), lvl: 0, n60: 0.5, pres: 0.5,
    level: `syn_${name}Level`, presence: `syn_${name}Presence`,
  }))
  const [bass, high] = [B[1], B[4]]
  let [t, edgeT, wasSilent, int, fade, expo, bangAge] = [0, -Infinity, true, 0.5, 1, 0, Infinity]

  return {
    /** Writes the S1.1 keys into `out` (each 0..1); allocates nothing. `wave` feeds the Spectrum (S1.3). */
    update(magDb: Float32Array, _wave: Float32Array, dt: number, g: DonorIn, out: Sources): void {
      dt = Math.min(MAX_DT, Math.max(0, dt))
      t += dt
      if (wasSilent && !g.silent) edgeT = t
      wasSilent = g.silent
      const held = g.silent || t - edgeT < EDGE_SKIP // G1: the stats and the Presence / Intensity accumulators hold
      for (const b of B) {
        let p = 0
        for (let i = b.lo; i <= b.hi; i++) p += 10 ** (magDb[i] / 10)
        const db = 10 * Math.log10(p / (b.hi - b.lo + 1) + 1e-12) // the mean bin power, ≥ −120 dB
        if (!held) {
          b.s10.add(db, dt)
          b.s60.add(db, dt)
        }
        if (g.silent) b.lvl = b.n60 = 0 // F1: Level is 0 on every silent frame, so the donor Time stops
        else {
          const target = b.s10.norm(db)
          b.lvl += (target - b.lvl) * ema(dt, target > b.lvl ? ATTACK : RELEASE)
          b.n60 = b.s60.norm(db)
        }
        if (!held) b.pres += (b.n60 - b.pres) * ema(dt, PRES_TAU)
        out[b.level] = b.lvl
        out[b.presence] = b.pres
      }
      if (!held) int = intensityStep(int, bass.n60, high.n60, dt)
      fade += ((g.silent ? 0 : 1) - fade) * ema(dt, g.silent ? FADE_FALL : FADE_RISE)
      expo = clamp(expo + (bass.n60 > 0.55 ? dt / 4 : -dt)) // sustained bass charges it in 4 s, its absence drains it in 1 s
      bangAge = g.fired ? 0 : bangAge + dt
      out.syn_Intensity = intensity(int)
      out.syn_FadeInOut = fade
      out.syn_BassExpoCurve = Math.expm1(3 * expo) / Math.expm1(3)
      out.syn_PrimeBang = primeBang(bangAge)
      out.syn_PrimeAndBang = clamp(g.build)
      out.syn_InputLevel = inputLevel(g.peakDb)
    },
  }
}
