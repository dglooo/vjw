import FFT from 'fft.js'
import { expect, test } from 'vitest'
import { SILENT_RMS } from './arrange'
import { createDonor, DONOR_GROUPS, inputLevel, intensity, intensityStep, mixStep, type DonorIn } from './donor'
import { rms } from './energy'
import { burst, hats, kick, rng, room, SR } from './synth'

// Fixtures (plan § Steps): seed 1, 48 kHz, FFT 1024 (512 bins of 46.875 Hz), dt 1/60 s. The core reads magDb frames, so
// a "tone" here is every bin at one level. Bins: Bass 1–3, High 128–341.
const DT = 1 / 60
const BASS = [1, 4] as const // [start, end)
const HIGH = [128, 342] as const
const IN: DonorIn = { beat: 0, bpm: 0, confidence: 0, kick: false, fired: false, build: 0, peakDb: -6, silent: false }
/** The 31 listed ids of design L109–114 in their order, written out here (PA1's reference), and the 5 unlisted keys. */
const IDS = ['Level', 'Hits', 'Presence'].flatMap((k) => ['', 'Bass', 'Mid', 'MidHigh', 'High'].map((b) => `syn_${b}${k}`)).concat(
  ['syn_Intensity', 'syn_FadeInOut', 'syn_BassExpoCurve', 'syn_PrimeBang', 'syn_InputLevel'],
  ['syn_OnBeat', 'syn_ToggleOnBeat', 'syn_RandomOnBeat', 'syn_BPMSin', 'syn_BPMSin2', 'syn_BPMSin4', 'syn_BPMSin8', 'syn_BPMTri', 'syn_BPMTri2', 'syn_BPMTri4', 'syn_BPMTri8'])
const UNLISTED = ['syn_BeatTime', 'syn_BPMTwitcher', 'syn_BPM', 'syn_BPMConfidence', 'syn_PrimeAndBang']

const lcg = (s = 1) => () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32
const pct = (a: number[], p: number) => [...a].sort((x, y) => x - y)[Math.round(p * (a.length - 1))]
const swing = (a: number[]) => pct(a, 0.9) - pct(a, 0.1)

/** A fresh core. `run(g)` runs one frame on `mag`; `step(db, g)` fills every bin with `db` first. Both return `out`,
 *  the same object every frame. */
function rig(seed?: number) {
  const d = createDonor(48000, 1024, seed)
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
  return { d, mag, wave, out, run, step }
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
  for (const id of [...IDS, ...UNLISTED]) expect(Number.isFinite(o[id]), id).toBe(true)
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

/** Runs a core (a fresh one by default) over `x` at `fps`; `each` gets every frame's `out`, its `silent` and its end
 *  time, s. */
function replay(x: Float32Array, fps: number, each: (o: Record<string, number>, silent: boolean, t: number) => void, d = createDonor(SR, 1024)) {
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

// ---- S1.3 the beat family, the Spectrum bytes, the groups. The grid is a stub of audio/sync.ts's Sync (beat, bpm).
test('T1d: a 174 BPM grid that re-anchors back at 30 s: BeatTime steps 0 or 1 per frame, never falls, once per beat', () => {
  const { run } = rig()
  const beatAt = (k: number) => (2.9 * k) / 60 + 0.25 - (k >= 1800 ? 0.5 : 0) // frame k at 60 Hz; at 30 s 87.25 → 86.75
  expect(Math.floor(beatAt(1800))).toBeLessThan(Math.floor(beatAt(1799))) // the re-anchor: a floor(beat) count falls here
  let [last, bad] = [0, 0]
  for (let k = 1; k <= 3600; k++) {
    const step = run({ bpm: 174, beat: beatAt(k), confidence: 1 }).syn_BeatTime - last
    bad += +(step !== 0 && step !== 1)
    last += step
  }
  console.log(`T1d: ${last} steps over 174 beats, ${bad} frames with a step outside {0, 1}`)
  expect(bad).toBe(0)
  expect(Math.abs(last - 174)).toBeLessThanOrEqual(1)
})

test('T1e: the grid at beat 3.2, then seedBeat(7): the next beat gives BeatTime 8', () => {
  const { d, out, run } = rig()
  run({ bpm: 174, beat: 3.2, confidence: 1 }) // the grid's first frame: no beat
  d.seedBeat(7)
  for (let k = 1; k <= 20; k++) run({ bpm: 174, beat: 3.2 + (2.9 * k) / 60, confidence: 1 }) // to 4.17: one new integer
  expect(out.syn_BeatTime).toBe(8)
})

test('T1r: a 174 → 140 BPM ramp over 20 s: no frame steps by 2, |steps − beats| ≤ 1; with no grid the kicks step, a flam does not', () => {
  // (a) the grid stub (its kick train is ignored); (b) bpm 0: the kick train, plus a flam 0.1 s after every 4th kick
  for (const grid of [true, false]) {
    const { run } = rig()
    const flams = new Set<number>()
    let [beat, last, bad] = [0, 0, 0]
    for (let k = 1; k <= 1200; k++) {
      const bpm = 174 - (34 * k) / 1200
      const n = Math.floor(beat)
      beat += (bpm * DT) / 60
      const kick = Math.floor(beat) > n // our kick: on each new beat of the stub
      if (kick && Math.floor(beat) % 4 === 0) flams.add(k + 6)
      const step = run(grid ? { bpm, beat, confidence: 1, kick } : { kick: kick || flams.has(k) }).syn_BeatTime - last
      bad += +(step !== 0 && step !== 1)
      last += step
    }
    console.log(`T1r ${grid ? 'grid' : 'kicks + flams'}: ${last} steps over ${beat.toFixed(2)} beats`)
    expect(bad).toBe(0)
    expect(Math.abs(last - beat)).toBeLessThanOrEqual(1)
  }
})

test('S1.3 item 4: per beat ToggleOnBeat flips 0 ↔ 1 and RandomOnBeat takes the next seeded value, both eased over 0.2 s', () => {
  for (const seed of [1, 2]) {
    const { run } = rig(seed)
    const next = lcg(seed) // the core's LCG
    for (let b = 0; b < 4; b++) { // no grid: a kick every 0.5 s
      const o = run({ kick: true })
      expect(Math.abs(o.syn_ToggleOnBeat - (b % 2))).toBeLessThan(0.01) // the beat frame: an ease, not a jump
      for (let k = 0; k < 12; k++) run() // 0.2 s
      expect(Math.abs(o.syn_ToggleOnBeat - ((b + 1) % 2))).toBeLessThan(0.01)
      expect(o.syn_RandomOnBeat).toBeCloseTo(next(), 2)
      for (let k = 0; k < 17; k++) run()
    }
  }
})

test('T1f: 10 s of white noise at −6 dBFS, then 2 s of digital silence: every value finite, every listed id in 0..1', () => {
  const r = lcg()
  const x = new Float32Array(12 * SR)
  for (let i = 0; i < 10 * SR; i++) x[i] = Math.sqrt(3) * 0.5 * (2 * r() - 1) // uniform: RMS 0.5 (−6 dBFS)
  const ids = DONOR_GROUPS.flatMap((g) => g.ids)
  let bad = 0
  const check = (o: Record<string, number>) => {
    for (const v of Object.values(o)) bad += +!Number.isFinite(v)
    for (const id of ids) bad += +!(o[id] >= 0 && o[id] <= 1)
  }
  const d = createDonor(SR, 1024)
  replay(x, 60, check, d) // the last 2 s: every bin at −∞ dB, `silent`
  const out: Record<string, number> = {}
  d.update(new Float32Array(512).fill(-Infinity), new Float32Array(1024), 0, { ...IN, silent: true }, out) // then a dt of 0
  check(out)
  expect(bad).toBe(0)
  expect(d.spectrum).toBeInstanceOf(Uint8Array) // bytes: integers in 0..255 by type
  expect(d.spectrum).toHaveLength(2048)
  // 1 s of noise again: g and b move. A −∞ dB min (not floored at −120 dB) would hold them at NaN (byte 0) for good.
  replay(x.subarray(0, SR), 60, () => {}, d)
  const top = (c: number) => Math.max(...d.spectrum.filter((_, j) => j % 4 === c))
  expect(top(1)).toBeGreaterThan(0)
  expect(top(2)).toBeGreaterThan(0)
})

test('PA1: one update() writes exactly the 31 listed ids, the 5 unlisted keys and kickAccent (P4); DONOR_GROUPS is design L109–114 in order', () => {
  expect(DONOR_GROUPS.map((g) => g.label)).toEqual(['donor levels', 'donor hits', 'donor presence', 'donor macros', 'donor beat'])
  expect(DONOR_GROUPS.map((g) => g.ids.length)).toEqual([5, 5, 5, 5, 11])
  expect(DONOR_GROUPS.flatMap((g) => g.ids)).toEqual(IDS)
  expect(Object.keys(rig().step(-40)).sort()).toEqual([...IDS, ...UNLISTED, 'kickAccent'].sort()) // S5.1: + kickAccent (P4, spec R5)
})

test('T1o: update() costs ≤ 0.5 ms at p95 over 3000 seeded noise frames, in each of 3 runs', () => {
  const r = lcg()
  for (let n = 1; n <= 3; n++) {
    const { d, mag, wave, out } = rig()
    const ms: number[] = []
    for (let k = 0; k < 3000; k++) {
      for (let i = 0; i < 512; i++) mag[i] = -40 + 6 * r() - 3
      for (let i = 0; i < 1024; i++) wave[i] = 0.5 * (2 * r() - 1)
      const g = { ...IN, bpm: 174, beat: (2.9 * k) / 60, confidence: 1 }
      const t0 = performance.now()
      d.update(mag, wave, DT, g, out)
      ms.push(performance.now() - t0)
    }
    console.log(`T1o run ${n}: p95 ${(1000 * pct(ms, 0.95)).toFixed(1)} µs per update()`)
    expect(pct(ms, 0.95)).toBeLessThanOrEqual(0.5)
  }
})

// --- S1.4: the mix ---

test('PA2: mixStep goes 0 → 1 in 2.0 s at 60 fps; a re-toggle at 0.3 turns there; the value never leaves [0, 1]', () => {
  const ramp = (from: number, target: number, frames: number, dt = DT) => {
    const v = [from]
    for (let i = 0; i < frames; i++) v.push(mixStep(v[i], target, dt))
    return v
  }
  const up = ramp(0, 1, 121)
  expect(up[119]).toBeLessThan(1) // 1.98 s
  expect(up[120]).toBeCloseTo(1, 9) // 2.0 s
  expect(up[121]).toBe(1)
  for (let i = 1; i < up.length; i++) expect(up[i] - up[i - 1]).toBeLessThanOrEqual(DT / 2 + 1e-12)
  const at = up.findIndex((x) => x >= 0.3) // the user flips back as the mix passes 0.3
  const down = ramp(up[at], 0, 80)
  expect(down[1]).toBeCloseTo(up[at] - DT / 2, 12) // on from where it is: no jump
  expect(down[Math.ceil(up[at] / (DT / 2) + 1e-9)]).toBe(0) // ≈ 0.6 s later at 0, and it stays there
  expect(down.at(-1)).toBe(0)
  for (const v of [...up, ...down, ...ramp(0.5, 1, 3, 30), ...ramp(0.5, 0, 3, 30), mixStep(1, 1, DT), mixStep(0, 0, 0)]) {
    expect(v).toBeGreaterThanOrEqual(0)
    expect(v).toBeLessThanOrEqual(1)
  }
  expect(ramp(0.5, 1, 1, 30)[1]).toBe(1) // a 30 s frame (a hidden tab) lands on the target, not past it
})

// --- S5.1: P4 kickAccent (gaps G3) ---

/** A fresh core. kick(off, early): our kick, the Bass bins `off` dB from −20 dB over a −60 dB bed on the kick frame
 *  (`early`: on the frame before it, as when the analyser runs ahead), then 29 bed frames; it returns kickAccent on the
 *  kick frame and the 29 after. Every frame's value also goes into `all`. */
function kicker(all: number[]) {
  const { mag, run } = rig()
  const frame = (db: number | null, kick = false) => {
    mag.fill(-60)
    if (db !== null) mag.fill(db, ...BASS)
    const v = run({ kick }).kickAccent
    all.push(v)
    return v
  }
  const kick = (off: number, early = false) => {
    frame(early ? -20 + off : null)
    const v = [frame(early ? null : -20 + off, true)]
    for (let k = 0; k < 29; k++) v.push(frame(null))
    return v
  }
  return { frame, kick }
}

test('T9a: kickAccent after 20 kicks at one level: there 0.70, 6 dB lower 0.35, 6 dB higher 1; 1/e in 0.12 s; 0 before a kick; in [0, 1]', () => {
  const all: number[] = []
  const [a, b, c] = [kicker(all), kicker(all), kicker(all)]
  for (let k = 0; k < 60; k++) expect(a.frame(null)).toBe(0) // 1 s of bed, no kick yet
  for (const x of [a, b, c]) for (let n = 0; n < 20; n++) x.kick(0)
  const at = a.kick(0)
  const low = b.kick(-6, true)[0] // its level one frame early: L is the max of this frame and the one before
  const high = c.kick(6)[0]
  console.log(`T9a: at the mean ${at[0].toFixed(3)}, −6 dB ${low.toFixed(3)}, +6 dB ${high.toFixed(3)}`)
  expect(at[0]).toBeCloseTo(0.7, 9)
  expect(low).toBeCloseTo(0.35, 2) // .7 · 10^(−6/20) = .351
  expect(high).toBe(1)
  expect(b.kick(0)[0]).toBeCloseTo(0.7 * 10 ** (0.75 / 20), 9) // the −6 dB kick moved μ by 1/8 of it: the old level reads .763
  at.forEach((v, k) => expect(v).toBeCloseTo(0.7 * Math.exp(-(k * DT) / 0.12), 9)) // e^(−age / .12 s), `kick`'s fall: 1/e at 0.12 s
  // a seeded train: levels −80..0 dB, every 7th kick on digital silence (−∞ dB, floored at −120 dB), half of them early
  const r = lcg()
  const d = kicker(all)
  for (let n = 0; n < 200; n++) d.kick(n % 7 ? 80 * r() - 60 : -Infinity, r() < 0.5)
  expect(all.filter((v) => !(v >= 0 && v <= 1))).toEqual([]) // NaN fails too
})

// --- S5.1b: T9b (dsp_kickaccent_linein_2026-11-19 §4, pick c): line-in drains a kick before the analyser window holds it ---
test('T9b: a kick whose Bass lands after the kick frame is raised to its height there, on the kick frame\'s clock; the hold closes at the first frame >= 16 ms on', () => {
  const late = (dt: number) => {
    const { mag, run } = rig()
    const frame = (db: number | null, kick = false) => {
      mag.fill(-60)
      if (db !== null) mag.fill(db, ...BASS)
      return run({ kick }, dt).kickAccent
    }
    /** our kick on a bed frame; its Bass (-20 + off dB) lands `lag` frames later; returns kickAccent from the kick frame */
    return (off: number, lag: number) => {
      const v = [frame(null, true)]
      for (let k = 1; k < 30; k++) v.push(frame(k === lag ? -20 + off : null))
      return v
    }
  }
  const k60 = late(DT)
  for (let n = 0; n < 20; n++) k60(0, 1) // μ settles at −20 dB
  const v = k60(0, 1)
  expect(v[0]).toBeLessThan(0.1) // the kick frame holds none of it: a low first height (.007)
  expect(v[1]).toBeCloseTo(0.7 * Math.exp(-DT / 0.12), 9) // raised one frame on, falling from the kick frame
  expect(k60(-6, 1)[1]).toBeCloseTo(0.7 * 10 ** (-6 / 20) * Math.exp(-DT / 0.12), 9)
  expect(k60(0, 2).every((x) => x < 0.1)).toBe(true) // 33 ms on at 60 fps: the hold has closed
  const k144 = late(1 / 144)
  for (let n = 0; n < 20; n++) k144(0, 3) // 20.8 ms on: the first frame >= 16 ms, still in the hold
  expect(k144(0, 3)[3]).toBeCloseTo(0.7 * Math.exp(-3 / 144 / 0.12), 9)
  expect(k144(0, 4).every((x) => x < 0.1)).toBe(true) // 27.8 ms on: closed
})
