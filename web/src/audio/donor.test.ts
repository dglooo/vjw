import { expect, test } from 'vitest'
import { createDonor, inputLevel, intensity, intensityStep, type DonorIn } from './donor'

// Fixtures (plan § Steps): seed 1, 48 kHz, FFT 1024 (512 bins of 46.875 Hz), dt 1/60 s. The core reads magDb frames, so
// a "tone" here is every bin at one level. Bins: Bass 1–3, High 128–341.
const DT = 1 / 60
const BASS = [1, 4] as const // [start, end)
const HIGH = [128, 342] as const
const IN: DonorIn = { beat: 0, bpm: 0, confidence: 0, kick: false, fired: false, build: 0, peakDb: -6, silent: false }
const S11_KEYS = ['', 'Bass', 'Mid', 'MidHigh', 'High'].flatMap((b) => [`syn_${b}Level`, `syn_${b}Presence`])
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
  for (const id of S11_KEYS) expect(Number.isFinite(o[id]), id).toBe(true)
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
