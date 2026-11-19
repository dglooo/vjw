import FFT from 'fft.js'
import { expect, test } from 'vitest'
import { SILENT_RMS } from './arrange'
import { createDonor, inputLevel, intensity, intensityStep, type DonorIn } from './donor'
import { rms } from './energy'
import { burst, hats, kick, rng, room, SR } from './synth'

// Fixtures (plan § Steps): seed 1, 48 kHz, FFT 1024 (512 bins of 46.875 Hz), dt 1/60 s. The core reads magDb frames, so
// a "tone" here is every bin at one level. Bins: Bass 1–3, High 128–341.
const DT = 1 / 60
const BASS = [1, 4] as const // [start, end)
const HIGH = [128, 342] as const
const IN: DonorIn = { beat: 0, bpm: 0, confidence: 0, kick: false, fired: false, build: 0, peakDb: -6, silent: false }
const KEYS = ['', 'Bass', 'Mid', 'MidHigh', 'High'].flatMap((b) => [`syn_${b}Level`, `syn_${b}Presence`, `syn_${b}Hits`])
  .concat(['syn_Intensity', 'syn_FadeInOut', 'syn_BassExpoCurve', 'syn_PrimeBang', 'syn_PrimeAndBang', 'syn_InputLevel'])

const lcg = (s = 1) => () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32
const pct = (a: number[], p: number) => [...a].sort((x, y) => x - y)[Math.round(p * (a.length - 1))]
const swing = (a: number[]) => pct(a, 0.9) - pct(a, 0.1)

/** A fresh core. `run(g)` runs one frame on `mag`; `step(db, g)` fills every bin with `db` first. Both return `out`,
 *  the same object every frame. */
function rig() {
  const d = createDonor(48000, 1024)
  const mag = new Float32Array(512)
  const wave = new Float32Array(1024)
  const out: Record<string, number> = {}
  const run = (g: Partial<DonorIn> = {}, dt = DT) => {
    d.update(mag, wave, dt, { ...IN, ...g }, out)
    return out
  }
  const step = (db: number, g: Partial<DonorIn> = {}, dt = DT) => {
    mag.fill(db)
    return run(g, dt)
  }
  return { mag, out, run, step }
}

test('T1a: a tone with ±1 dB jitter rests mid-range: the median of syn_Level over 20–60 s is in [0.40, 0.70]', () => {
  const { step } = rig()
  const r = lcg()
  const lv: number[] = []
  for (let k = 0; k < 3600; k++) {
    const o = step(-40 + 2 * r() - 1) // the jitter: a constant band has σ 0 and reads 0
    if (k >= 1200) lv.push(o.syn_Level)
  }
  expect(pct(lv, 0.5)).toBeGreaterThanOrEqual(0.4)
  expect(pct(lv, 0.5)).toBeLessThanOrEqual(0.7)
})

test('T1c: 5 s of silence after 10 s of tone: FadeInOut ≤ 0.15, Level 0 on every silent frame (the donor Time stops)', () => {
  const { out, step } = rig()
  const r = lcg()
  for (let k = 0; k < 600; k++) step(-40 + 2 * r() - 1)
  let time = 0 // the donor Time: + 2 · Level · dt
  for (let k = 0; k < 300; k++) time += 2 * step(-Infinity, { silent: true }).syn_Level * DT
  expect(out.syn_FadeInOut).toBeLessThanOrEqual(0.15) // e^-2 ≈ 0.135
  expect(out.syn_Level).toBeLessThanOrEqual(0.05)
  expect(time).toBe(0)
})

test('T1h: dt is clamped to 0.1 s: frames of 30 s give the same values as frames of 0.1 s', () => {
  const [a, b] = [rig(), rig()]
  const r = lcg()
  for (let k = 0; k < 300; k++) {
    const db = -40 + 2 * r() - 1
    a.step(db)
    b.step(db)
  }
  for (const g of [{ silent: true }, {}, {}]) { // FadeInOut falls then rises; the last frame moves Presence (past the edge)
    a.step(-36, g, 30)
    b.step(-36, g, 0.1)
  }
  expect(a.out).toEqual(b.out)
  expect(a.out.syn_FadeInOut).toBeLessThan(0.97) // the frames moved it (0.966)
})

test('T1j: a pause flagged `silent` keeps the 10 s σ: the Level swing after / before is ≥ 0.5', () => {
  /** ±6 dB at 0.5 Hz for 10 s, 60 frames at −120 dB, the tone again: [the pre-pause swing, after / before]. */
  const ratio = (silent: boolean) => {
    const { step } = rig()
    let k = 0
    const am = () => -30 + 6 * Math.sin(2 * Math.PI * 0.5 * k++ * DT)
    const pre: number[] = []
    const post: number[] = []
    for (let i = 0; i < 600; i++) {
      const o = step(am())
      if (i >= 360) pre.push(o.syn_Level) // the last 4 s
    }
    for (let i = 0; i < 60; i++) step(-120, { silent })
    for (let i = 0; i < 240; i++) post.push(step(am()).syn_Level)
    return [swing(pre), swing(post) / swing(pre)]
  }
  const [pre, held] = ratio(true)
  const [, paused] = ratio(false) // the `paused` pattern: the quiet frames reach the stats and σ balloons
  console.log(`T1j: pre-pause swing ${pre.toFixed(3)}; after / before: silent ${held.toFixed(3)}, not silent ${paused.toFixed(3)}`)
  expect(pre).toBeGreaterThan(0.5)
  expect(held).toBeGreaterThanOrEqual(0.5)
  expect(paused).toBeLessThan(0.5) // the fixture discriminates
})

test('T1k: music from frame 0: FadeInOut is 1 at the start and ≥ 0.90 at 1 s; a first dt of 0 leaves every value finite', () => {
  const { step } = rig()
  const r = lcg()
  const o = step(-40, {}, 0) // the app's first frame: dt 0
  expect(o.syn_FadeInOut).toBe(1)
  for (const id of KEYS) expect(Number.isFinite(o[id]), id).toBe(true)
  for (let k = 0; k < 60; k++) step(-40 + 2 * r() - 1)
  expect(o.syn_FadeInOut).toBeGreaterThanOrEqual(0.9)
})

test('T1l: Intensity is the 6 s EMA of .8 · Bass N60 + .2 · High N60, stretched ×2.5 around .5', () => {
  // (a) the pure form, held 60 s at (0.7, 0.3)
  let e = 0.5
  for (let k = 0; k < 3600; k++) e = intensityStep(e, 0.7, 0.3, DT)
  expect(Math.abs(intensity(e) - 0.8)).toBeLessThanOrEqual(0.01)
  // (b) what update() writes: 120 s of every bin at ±1 dB frame by frame (σ 1 dB), then 3 s steady with Bass +1.6 dB and
  // High −1.6 dB (N60 0.9 and 0.1). A .5 / .5 or full-band form reads ≤ 0.5.
  const { mag, out, run, step } = rig()
  for (let k = 0; k < 7200; k++) step(k % 2 ? -41 : -39)
  mag.fill(-40)
  mag.fill(-38.4, ...BASS)
  mag.fill(-41.6, ...HIGH)
  e = 0.5
  for (let k = 0; k < 180; k++) {
    run()
    e = intensityStep(e, 0.9, 0.1, DT)
  }
  expect(intensity(e)).toBeCloseTo(0.74, 2)
  expect(Math.abs(out.syn_Intensity - intensity(e))).toBeLessThanOrEqual(0.03)
})

test('T1m: PrimeBang follows `fired` only: 0 through 10 s of kicks, e^-1 0.3 s after one fire; PrimeAndBang is `build`', () => {
  const { mag, out, run } = rig()
  const r = lcg()
  let max = 0
  for (let k = 0; k < 600; k++) { // a kick every 21 frames (≈ 171 BPM), 4 frames at +12 dB on the Bass bins
    mag.fill(-40 + 2 * r() - 1)
    if (k % 21 < 4) mag.fill(-28, ...BASS)
    max = Math.max(max, run({ kick: k % 21 === 0 }).syn_PrimeBang)
  }
  expect(max).toBe(0)
  expect(run({ fired: true, build: 0.4 })).toMatchObject({ syn_PrimeBang: 1, syn_PrimeAndBang: 0.4 })
  for (let k = 0; k < 18; k++) run() // 0.3 s
  expect(out.syn_PrimeBang).toBeGreaterThanOrEqual(0.36)
  expect(out.syn_PrimeBang).toBeLessThanOrEqual(0.38)
})

test('T1n: InputLevel maps the held peak −60..0 dBFS to 0..1', () => {
  for (const [db, v] of [[-60, 0], [-30, 0.5], [0, 1], [3, 1]]) expect(Math.abs(inputLevel(db) - v)).toBeLessThanOrEqual(1e-9)
  expect(rig().step(-40, { peakDb: -30 }).syn_InputLevel).toBeCloseTo(0.5, 9) // update() reads g.peakDb
})

// ---- S1.2 Hits. A hit event is a Hits value above its last frame's: the decay only lowers it, so only a trigger raises it.
const HITS = ['', 'Bass', 'Mid', 'MidHigh', 'High'].map((b) => `syn_${b}Hits`) // [0] = syn_Hits, the max of the four
function hitter() {
  const last = HITS.map(() => 0)
  return (o: Record<string, number>) => HITS.map((id, i) => {
    const up = o[id] > last[i]
    last[i] = o[id]
    return up
  })
}
/** Frame k (at DT) lies in a 60 ms burst that starts at one of `at`, s. */
const inBurst = (k: number, ...at: number[]) => at.some((s) => k * DT >= s - 1e-9 && k * DT < s + 0.06 - 1e-9)

test('T1b: a +12 dB, 60 ms burst on the Bass bins over a noise bed: one hit, then BassHits falls to 1/e in 0.10–0.14 s', () => {
  const { mag, run } = rig()
  const r = lcg()
  const hit = hitter()
  const bass: number[] = []
  let ups = 0
  for (let k = 0; k < 630; k++) { // 10 s of bed, the burst at 10 s, then 0.5 s
    mag.fill(-40 + 2 * r() - 1) // the jitter gives the flux a σ above 0
    if (inBurst(k, 10)) mag.fill(-28, ...BASS)
    const o = run()
    const up = hit(o)[1]
    if (k < 600) continue
    bass.push(o.syn_BassHits)
    ups += +up
  }
  const peak = bass.indexOf(Math.max(...bass))
  const fall = (bass.findIndex((v, i) => i > peak && v <= bass[peak] / Math.E) - peak) * DT
  console.log(`T1b: ${ups} hit, peak ${bass[peak].toFixed(3)}, 1/e after ${fall.toFixed(3)} s`)
  expect(ups).toBe(1)
  expect(fall).toBeGreaterThanOrEqual(0.1)
  expect(fall).toBeLessThanOrEqual(0.14)
})

test('T1p: a 60 Hz burst hits Bass only; a 10 kHz burst 1 s later hits High only', () => {
  const { mag, run } = rig()
  const hit = hitter()
  const bin = (hz: number) => Math.round((hz * 1024) / 48000) // 60 Hz → 1, 10 kHz → 213
  const n = [[0, 0], [0, 0]] // per burst: [Bass, High] hit events
  const top = [[0, 0], [0, 0]] // per burst: [Bass, High] the highest value
  for (let k = 0; k < 240; k++) { // a steady bed; the 60 Hz burst at 2 s, the 10 kHz one at 3 s, each +12 dB, 60 ms
    mag.fill(-40)
    if (inBurst(k, 2)) mag[bin(60)] = -28
    if (inBurst(k, 3)) mag[bin(10000)] = -28
    const o = run()
    const up = hit(o)
    if (k < 120) continue
    const w = k < 180 ? 0 : 1
    n[w][0] += +up[1]
    n[w][1] += +up[4]
    top[w][0] = Math.max(top[w][0], o.syn_BassHits)
    top[w][1] = Math.max(top[w][1], o.syn_HighHits)
  }
  expect(n).toEqual([[1, 0], [0, 1]])
  expect(top[0][0]).toBeGreaterThanOrEqual(0.5)
  expect(top[0][1]).toBe(0)
  expect(top[1][1]).toBeGreaterThanOrEqual(0.5)
})

test('T1q: two bass bursts 150 ms apart give 2 hits; 40 ms apart, 1 or 2', () => {
  const hitsFor = (gap: number) => {
    const { mag, run } = rig()
    const r = lcg()
    const hit = hitter()
    let n = 0
    for (let k = 0; k < 660; k++) { // the T1b bed; 60 ms bursts at 10 s and 10 s + gap (onset to onset), then 1 s
      mag.fill(-40 + 2 * r() - 1)
      if (inBurst(k, 10, 10 + gap)) mag.fill(-28, ...BASS)
      const up = hit(run())[1]
      if (k >= 600) n += +up
    }
    return n
  }
  const [far, near] = [hitsFor(0.15), hitsFor(0.04)]
  console.log(`T1q: 150 ms apart ${far} hits, 40 ms apart ${near}`)
  expect(far).toBe(2)
  expect([1, 2]).toContain(near)
})

// T1g, T1i, PA5: PCM through app.ts's analyser read. A frame is a 1024-sample Blackman window that ends at round(t · SR),
// smoothing 0 (as scratchpad/dsp-donor/gaps/gaps.ts cuts it); `silent` is app.ts:313's test (frame RMS ≤ SILENT_RMS).
const HIT_RATE_TOL = 0.1 // ±, relative to the 60 Hz rate (gaps G4 ruling)
const LEVEL_RATE_TOL = 0.05 // ±, absolute (coverage fix F8; measured 0.01 on the 3 tracks)
const BLACKMAN = Float32Array.from({ length: 1024 }, (_, i) => 0.42 - 0.5 * Math.cos((2 * Math.PI * i) / 1024) + 0.08 * Math.cos((4 * Math.PI * i) / 1024))

/** Runs a fresh core over `x` at `fps`; `each` gets every frame's `out`, its `silent` and its end time, s. */
function replay(x: Float32Array, fps: number, each: (o: Record<string, number>, silent: boolean, t: number) => void) {
  const d = createDonor(SR, 1024)
  const fft = new FFT(1024)
  const spec = fft.createComplexArray()
  const w = new Float32Array(1024)
  const mag = new Float32Array(512)
  const out: Record<string, number> = {}
  for (let k = 1; Math.round((k / fps) * SR) <= x.length; k++) {
    const e = Math.round((k / fps) * SR)
    for (let i = 0; i < 1024; i++) w[i] = (x[e - 1024 + i] ?? 0) * BLACKMAN[i]
    fft.realTransform(spec, w)
    for (let i = 0; i < 512; i++) mag[i] = 20 * Math.log10(Math.hypot(spec[2 * i], spec[2 * i + 1]) / 1024)
    const wave = x.subarray(Math.max(0, e - 1024), e)
    const silent = rms(wave) <= SILENT_RMS
    d.update(mag, wave, 1 / fps, { ...IN, silent }, out)
    each(out, silent, k / fps)
  }
}

/** 60 s at 174 BPM over a noise bed (seed 1): a kick on every beat, a snare (noise 300 Hz–5 kHz) on every second beat,
 *  hats off the beat. Beat 29 falls at 10.0 s. */
const TRAIN = (() => {
  const r = rng(1)
  const x = room(60 * SR, r)
  const add = (t: number, y: Float32Array) => y.forEach((v, i) => (x[Math.round(t * SR) + i] += v)) // a tail past the end drops
  for (let b = 0; b < 174; b++) {
    const t = (b * 60) / 174
    add(t, kick())
    if (b % 2) add(t, burst(r, 0.15, 0.04, 300, 5000).map((v) => 0.5 * v))
    add(t + 30 / 174, hats(r))
  }
  return x
})()

const RATES = [30, 60, 120, 144]
const LEVELS = ['', 'Bass', 'Mid', 'MidHigh', 'High'].map((b) => `syn_${b}Level`)
let runs: { hits: number[]; lv: number[][] }[] | undefined
/** Per rate: the hit events of the five Hits over the train (= per minute), and the five Levels over 20–60 s. */
const trainRuns = () => (runs ??= RATES.map((fps) => {
  const hit = hitter()
  const hits = HITS.map(() => 0)
  const lv = LEVELS.map(() => [] as number[])
  replay(TRAIN, fps, (o, _, t) => {
    hit(o).forEach((up, i) => (hits[i] += +up))
    if (t >= 20) LEVELS.forEach((id, i) => lv[i].push(o[id]))
  })
  return { hits, lv }
}))

test('T1g: Hits per minute at 30, 120 and 144 Hz are within ±10 % of the 60 Hz rate in each of the four bands', () => {
  const R = trainRuns()
  const dev = (j: number, i: number) => R[j].hits[i] / R[1].hits[i] - 1
  for (const [j, fps] of RATES.entries())
    console.log(`T1g ${fps} Hz, Hits/min (vs 60 Hz): ${HITS.slice(1).map((id, i) => `${id.slice(4, -4)} ${R[j].hits[i + 1]} (${(100 * dev(j, i + 1)).toFixed(1)} %)`).join(', ')}`)
  for (const j of [0, 2, 3]) for (let i = 1; i < 5; i++) expect(Math.abs(dev(j, i)), `${HITS[i]} at ${RATES[j]} Hz`).toBeLessThanOrEqual(HIT_RATE_TOL)
})

test('PA5: the five Levels at 30 Hz: p10, p50 and p90 over 20–60 s are within 0.05 of 60 Hz', () => {
  const [a, b] = [trainRuns()[0].lv, trainRuns()[1].lv]
  const shift = LEVELS.map((_, i) => [0.1, 0.5, 0.9].map((p) => pct(a[i], p) - pct(b[i], p)))
  console.log(`PA5 shift 30 − 60 Hz, p10/p50/p90: ${LEVELS.map((id, i) => `${id.slice(4)} ${shift[i].map((v) => v.toFixed(3)).join('/')}`).join(', ')}`)
  for (const [i, s] of shift.entries()) for (const v of s) expect(Math.abs(v), LEVELS[i]).toBeLessThanOrEqual(LEVEL_RATE_TOL)
})

test('T1i: a 5 s `silent` pause in the train: no edge burst, and the Hits resume at the no-pause rate', () => {
  // A = 10.1 s of train (100 ms after beat 29, so no onset falls in the edge window), 5 s of zeros, 10 s of train.
  // B = the same frames without the zeros. At 60 Hz, A's frame k1 + i is B's frame k1 − P + i.
  const cut = Math.round(10.1 * SR)
  const b = TRAIN.subarray(0, cut + 10 * SR)
  const a = new Float32Array(b.length + 5 * SR)
  a.set(b.subarray(0, cut))
  a.set(b.subarray(cut), cut + 5 * SR)
  const rec = (x: Float32Array) => {
    const hit = hitter()
    const ups: boolean[][] = []
    const silent: boolean[] = []
    replay(x, 60, (o, s) => {
      ups.push(hit(o))
      silent.push(s)
    })
    return { ups, silent }
  }
  const [A, B] = [rec(a), rec(b)]
  const P = 300 // frames of pause: 5 s at 60 Hz
  const k0 = A.silent.indexOf(true) // the first frame of the pause
  const k1 = A.silent.indexOf(false, k0) // the first music frame after it
  const bands = (f: boolean[]) => [1, 2, 3, 4].filter((i) => f[i])
  const count = (u: boolean[][], from: number, n: number, only?: number) =>
    u.slice(from, from + n).reduce((c, f) => c + (only ? +f[only] : bands(f).length), 0)
  expect(new Set(A.ups.slice(k1, k1 + 2).flatMap(bands)).size).toBeLessThanOrEqual(1) // the first 2 music frames
  for (let i = 0; i * DT < 0.05; i++) expect(A.ups[k1 + i].filter(Boolean).length).toBeLessThan(4) // of the 5 Hits
  const ratio = count(A.ups, k1, P, 1) / count(A.ups, k0 - P, P, 1)
  const [nA, nB] = [count(A.ups, k1, 120), count(B.ups, k1 - P, 120)]
  console.log(`T1i: BassHits 5 s after / before the pause ${ratio.toFixed(2)}; 4-band hits 0–2 s after the resume A ${nA}, B ${nB} (A/B ${(nA / nB).toFixed(2)})`)
  expect(ratio).toBeGreaterThanOrEqual(0.5)
  expect(nA / nB).toBeGreaterThanOrEqual(0.9)
  expect(nA / nB).toBeLessThanOrEqual(1.1)
})
