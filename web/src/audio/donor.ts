// Donor-mode analyser core (plan_audio_donor_mode S1.1–S1.3; dsp_donor_mode_2026-11-18 §A1, gaps G1 + G4), plus our
// detector's `kickAccent` (S5.1, P4, gaps G3). Pure, so Vitest runs it in Node. Ported from our own prototype
// `scratchpad/dsp-donor/donor-model.ts` with its options fixed (hold 'music', holdAcc, edge 25 ms, Bass 30–150 Hz, flux
// 'sub' 30 ms, z 2.25). Every constant is ours: inferred and tuned on 3 tracks, none is donor code.
import type { SourceGroup, Sources } from '../bind'

/** One frame's inputs from app.ts (CP1 contract): our grid (`beat`, `bpm`, `confidence`), our kick, the arrangement's
 *  `fired` and `build`, the meter's held peak (dBFS) and app.ts's silence test. */
export interface DonorIn { beat: number; bpm: number; confidence: number; kick: boolean; fired: boolean; build: number; peakDb: number; silent: boolean }

/** The core (CP1 contract). `spectrum`: fftSize / 2 texels × RGBA (512 × 4 bytes at FFT 1024), rebuilt by update(). */
export interface Donor {
  update(magDb: Float32Array, wave: Float32Array, dt: number, g: DonorIn, out: Sources): void
  seedBeat(n: number): void
  readonly spectrum: Uint8Array
}

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
const ONBEAT_TAU = 0.1 // s
const TWITCH_TAU = 0.05 // s: BPMTwitcher's rise to the new count
const KICK_GAP = 0.25 // s: with no grid, our kick is a beat this long after the last one at the earliest
const ACCENT = 0.7 // kickAccent of a kick at the kicks' running mean dB; 1 (the clamp) from +3.1 dB (gaps G3)
const ACCENT_N = 8 // kicks: the running mean's EMA step is 1 / 8
const KICK_TAU = 0.12 // s: our kick's decay (features.ts TAU.kick), so kickAccent falls like the kick tile
const ACCENT_HOLD = 0.016 // s: line-in drains a kick before the analyser window holds it, so L keeps rising up to the first frame this long after the kick frame (1 frame at 30 / 60 fps, 2 at 120, 3 at 144)

const ema = (dt: number, tau: number) => 1 - Math.exp(-dt / tau)
const clamp = (x: number) => Math.min(1, Math.max(0, x))
/** Logistic ease 0 → 1 over T s (ToggleOnBeat's flip, RandomOnBeat's jump). */
const ease = (age: number, T: number) => 1 / (1 + Math.exp(-12 * (age / T - 0.5)))

const per = (kind: string) => BANDS.map(([name]) => `syn_${name}${kind}`)
/** The 31 donor sources (each 0..1) in five groups: design L109–114, in that order. */
export const DONOR_GROUPS: readonly SourceGroup[] = [
  { label: 'donor levels', ids: per('Level') },
  { label: 'donor hits', ids: per('Hits') },
  { label: 'donor presence', ids: per('Presence') },
  { label: 'donor macros', ids: ['syn_Intensity', 'syn_FadeInOut', 'syn_BassExpoCurve', 'syn_PrimeBang', 'syn_InputLevel'] },
  { label: 'donor beat', ids: ['syn_OnBeat', 'syn_ToggleOnBeat', 'syn_RandomOnBeat', 'syn_BPMSin', 'syn_BPMSin2', 'syn_BPMSin4', 'syn_BPMSin8', 'syn_BPMTri', 'syn_BPMTri2', 'syn_BPMTri4', 'syn_BPMTri8'] },
]
/** BPMSin / BPMTri over 1, 2, 4 and 8 beats; the keys are built once, so update() allocates nothing. */
const CYCLES = [1, 2, 4, 8].map((n) => ({ n, sin: `syn_BPMSin${n > 1 ? n : ''}`, tri: `syn_BPMTri${n > 1 ? n : ''}` }))

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
/** `src.donorMix` (design R1): toward `target` by at most dt / 2 (a 2 s ramp; a re-toggle turns where it is), in [0, 1]. */
export const mixStep = (mix: number, target: number, dt: number) => clamp(mix + Math.min(dt / 2, Math.max(-dt / 2, target - mix)))

export function createDonor(sampleRate: number, fftSize: number, seed = 1): Donor {
  const bin = (hz: number) => Math.min(fftSize / 2 - 1, Math.max(1, Math.round((hz * fftSize) / sampleRate)))
  const B = BANDS.map(([name, lo, hi, tau]) => ({
    lo: bin(lo), hi: bin(hi), s10: stats(SHORT), s60: stats(LONG), sf: stats(FLUX), lvl: 0, n60: 0.5, pres: 0.5, db: -120,
    tau, prev: NaN, z: 0, hit: 0, level: `syn_${name}Level`, presence: `syn_${name}Presence`, hits: `syn_${name}Hits`,
  }))
  const [bass, high] = [B[1], B[4]]
  let [t, edgeT, wasSilent, int, fade, expo, bangAge, lastTick, tickDt] = [0, -Infinity, true, 0.5, 1, 0, Infinity, -Infinity, 0]
  let [accent, lastBassDb] = [0, -120] // P4: kickAccent, and the Bass dB of the frame before
  let accentMu: number | undefined // P4: the kicks' running mean dB, from the first kick's L
  let [kickL, kickAge] = [-120, Infinity] // P4: this kick's L so far; s since its frame
  let kickMu: number | undefined // P4: μ before this kick (undefined for the first kick)
  // the beat family: `age` s since the last beat, `lastN` the grid's last integer (NaN: no grid last frame), `bpm` held
  let [beats, age, lastN, bpm, phase, tog, togFrom, togTo, rnd, rndFrom, rndTo] = [0, Infinity, NaN, 120, 0, 0, 0, 0, 0, 0, 0]
  const rand = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32 // the seeded LCG, [0, 1)
  // the Spectrum: per bin the decaying max / min of its +3 dB/oct level, the juiced g and the smooth b (floats), the bytes
  const N = fftSize / 2
  const [jMax, jMin, jg, jb] = [new Float32Array(N).fill(-100), new Float32Array(N).fill(-40), new Float32Array(N), new Float32Array(N)]
  const spectrum = new Uint8Array(4 * N)

  return {
    spectrum,
    /** The next beat counts from `n` + 1 (app.ts seeds it from our grid as the donor mode comes in). */
    seedBeat(n: number) {
      beats = n
    },
    /** Writes the 37 keys into `out` (the 31 `DONOR_GROUPS` ids, BPMConfidence and PrimeAndBang 0..1; BeatTime,
     *  BPMTwitcher and BPM counts; our detector's `kickAccent` 0..1, P4) and rebuilds `spectrum`; allocates nothing. */
    update(magDb: Float32Array, wave: Float32Array, dt: number, g: DonorIn, out: Sources): void {
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
        b.db = db
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

      // P4 (gaps G3; L window = dsp_kickaccent_linein_2026-11-19 pick c): kickAccent, our kick's loudness. L = the max
      // Bass dB (bins 1–3 at 1024 / 48 kHz; the mean bin power, not the sum: the offset cancels in L − μ) from the frame
      // before the kick frame through the first frame ≥ ACCENT_HOLD after it. It rises on the kick frame and rises again
      // while L grows; the fall runs from the kick frame. A kick at the kicks' running mean μ reads .7, then μ moves 1/8
      // of the way to its final L. Between kicks it falls like `kick`; 0 before one.
      accent *= Math.exp(-dt / KICK_TAU)
      const holding = kickAge < ACCENT_HOLD // the last kick's hold is still open on this frame
      kickAge += dt
      if (g.kick) [kickAge, kickL, kickMu, accent] = [0, lastBassDb, accentMu, 0]
      if (g.kick || holding) {
        kickL = Math.max(kickL, bass.db)
        const mu = kickMu ?? kickL // the first kick reads .7 and starts μ at its final L
        accent = Math.max(accent, Math.min(1, ACCENT * 10 ** ((kickL - mu) / 20)) * Math.exp(-kickAge / KICK_TAU))
        accentMu = mu + (kickL - mu) / ACCENT_N
      }
      lastBassDb = bass.db
      out.kickAccent = accent

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

      // Beats: a new integer of our grid's beat while it runs (a backward re-anchor fires none), else our kick KICK_GAP
      // after the last beat. At most one per frame; BeatTime counts them.
      age += dt
      let beat: boolean
      if (g.bpm > 0) {
        const n = Math.floor(g.beat)
        beat = n > lastN // false on the grid's first frame (NaN)
        lastN = n
        phase = g.beat
        bpm = Math.min(220, Math.max(50, g.bpm))
      } else {
        beat = g.kick && age >= KICK_GAP
        lastN = NaN
        phase += (dt * bpm) / 60 // no grid: the cycles freewheel at the held BPM
      }
      if (beat) {
        beats++
        age = 0
        togFrom = tog
        togTo = 1 - togTo
        rndFrom = rnd
        rndTo = rand()
      }
      const k = ease(age, Math.min(0.2, 30 / bpm)) // the flip / jump takes ≤ 0.2 s, at most half a beat
      tog = togFrom + (togTo - togFrom) * k
      rnd = rndFrom + (rndTo - rndFrom) * k
      out.syn_BeatTime = beats
      out.syn_BPMTwitcher = beats - Math.exp(-age / TWITCH_TAU) // floor = BeatTime − 1; fract = the per-beat jump
      out.syn_OnBeat = Math.exp(-age / ONBEAT_TAU)
      out.syn_ToggleOnBeat = tog
      out.syn_RandomOnBeat = rnd
      out.syn_BPM = bpm
      out.syn_BPMConfidence = g.confidence
      for (const c of CYCLES) {
        const p = phase / c.n - Math.floor(phase / c.n) // no confidence factor
        out[c.sin] = 0.5 - 0.5 * Math.cos(2 * Math.PI * p)
        out[c.tri] = 1 - Math.abs(2 * p - 1)
      }

      // Spectrum, per frame in every mode: r the bin's dB (−100..−30), g its +3 dB/oct level against its own decaying
      // max / min (−.1 / +.05 dB per frame), EMA .5; b g's [1 2 1] / 4 blur, EMA .2; a the wave. −∞ dB (digital
      // silence) is floored at −120 dB, so the min stays finite.
      for (let i = 0; i < N; i++) {
        const db = Math.max(-120, magDb[i])
        const d = db + 3 * Math.log2(i + 1)
        jMax[i] = Math.max(d, jMax[i] - 0.1)
        jMin[i] = Math.min(d, jMin[i] + 0.05)
        jg[i] += (clamp((d - jMin[i]) / (jMax[i] - jMin[i] || 1)) - jg[i]) * 0.5
        spectrum[4 * i] = Math.round(255 * clamp((db + 100) / 70))
        spectrum[4 * i + 1] = Math.round(255 * jg[i])
        spectrum[4 * i + 3] = Math.round(255 * clamp(0.5 + 0.5 * (wave[i] ?? 0)))
      }
      for (let i = 1; i < N - 1; i++) {
        jb[i] += ((jg[i - 1] + 2 * jg[i] + jg[i + 1]) / 4 - jb[i]) * 0.2
        spectrum[4 * i + 2] = Math.round(255 * jb[i])
      }
    },
  }
}
