// Donor-mode analyser core (plan_audio_donor_mode S1.1–S1.2; dsp_donor_mode_2026-11-18 §A1, gaps G1 + G4). Pure, so
// Vitest runs it in Node. Ported from our own prototype `scratchpad/dsp-donor/donor-model.ts` with its options fixed (hold
// 'music', holdAcc, edge 25 ms, Bass 30–150 Hz, flux 'sub' 30 ms, z 2.25). Every constant is ours: inferred and tuned on
// 3 tracks, none is donor code.
import type { Sources } from '../bind'

/** One frame's inputs from app.ts (CP1 contract). S1.1 reads `fired`, `build`, `peakDb` and `silent`. */
export interface DonorIn { beat: number; bpm: number; confidence: number; kick: boolean; fired: boolean; build: number; peakDb: number; silent: boolean }

const HIT_DT = 0.03 // s: the Hits tick. The flux, its stats and the trigger run once this long has passed (gaps G4)
const THETA = 2.25 // σ: a hit when the flux's z crosses it upward (gaps G4)
const EDGE_SKIP = 0.025 // s after a silent → music edge in which no stat and no accumulator takes the frame (G1)

// Knobs (plan § Parameters). 150–250 Hz is left out of every band but `all` on purpose (dsp §A2 sweep). The 4th value is
// the band's Hits decay τ, s; the full band has no Hits of its own (syn_Hits is the max of the four).
const BANDS = [['', 30, 16000, 0], ['Bass', 30, 150, 0.12], ['Mid', 250, 2000, 0.1], ['MidHigh', 2000, 6000, 0.08], ['High', 6000, 16000, 0.06]] as const
const SHORT = 10 // s: Level's running mean/σ
const LONG = 60 // s: the N60 stats (Presence, Intensity, BassExpoCurve)
const ATTACK = 0.03 // s, Level
const RELEASE = 0.15 // s, Level
const PRES_TAU = 2 // s
const INT_TAU = 6 // s
const FADE_RISE = 1.5 // s
const FADE_FALL = 2.5 // s
const BANG_TAU = 0.3 // s
const FLUX = 2 // s: the flux's running mean/σ (Hits)
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
    z: (x: number) => (x - mu) / (Math.sqrt(v) || 1),
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
  const B = BANDS.map(([name, lo, hi, tau]) => ({
    lo: bin(lo), hi: bin(hi), s10: stats(SHORT), s60: stats(LONG), sf: stats(FLUX), lvl: 0, n60: 0.5, pres: 0.5,
    tau, prev: NaN, z: 0, hit: 0, level: `syn_${name}Level`, presence: `syn_${name}Presence`, hits: `syn_${name}Hits`,
  }))
  const [bass, high] = [B[1], B[4]]
  let [t, edgeT, wasSilent, int, fade, expo, bangAge, lastTick, tickDt] = [0, -Infinity, true, 0.5, 1, 0, Infinity, -Infinity, 0]

  return {
    /** Writes the S1.1 keys and the five Hits into `out` (each 0..1); allocates nothing. `wave` feeds the Spectrum (S1.3). */
    update(magDb: Float32Array, _wave: Float32Array, dt: number, g: DonorIn, out: Sources): void {
      dt = Math.min(MAX_DT, Math.max(0, dt))
      t += dt
      if (wasSilent && !g.silent) edgeT = t
      wasSilent = g.silent
      const held = g.silent || t - edgeT < EDGE_SKIP // G1: the stats and the Presence / Intensity accumulators hold
      const tick = t - lastTick >= HIT_DT - 1e-9 // G4: a fixed Hits cadence, so the hit rate does not follow the frame rate
      if (tick) {
        tickDt = t - lastTick
        lastTick = t
      }
      let hits = 0
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
        if (!b.tau) continue // the full band: syn_Hits is the max of the four below
        b.hit *= Math.exp(-dt / b.tau)
        if (held) {
          b.prev = NaN // G1: no flux and no flux stat; the first tick after the edge window has no flux
          b.z = 0
        } else if (tick) {
          const flux = Math.max(0, db - b.prev) || 0 // the rise since the last Hits tick, half-wave (NaN prev → 0)
          b.prev = db
          b.sf.add(flux, tickDt)
          const z = b.sf.z(flux)
          if (z > THETA && b.z <= THETA) b.hit = Math.max(b.hit, clamp(0.5 + (z - THETA) / (2 * THETA)))
          b.z = z
        }
        out[b.hits] = b.hit
        hits = Math.max(hits, b.hit)
      }
      out.syn_Hits = hits
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
