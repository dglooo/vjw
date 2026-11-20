// The melodic layer (dsp_genre_melodic_2026-11-21 §7 M1): magDb frames as analyser4k reads them (scratchpad/dsp-genre
// replay.ts analyser(): Blackman, |X| / N in dB, smoothing 0), 60 fps at 48 kHz (hop 800).
import FFT from 'fft.js'
import { expect, test } from 'vitest'
import { createMelody } from './melody'
import { rng, SR } from './synth'

const N = 4096
const HOP = SR / 60
const BLACKMAN = Float32Array.from({ length: N }, (_, i) => 0.42 - 0.5 * Math.cos((2 * Math.PI * i) / N) + 0.08 * Math.cos((4 * Math.PI * i) / N))

/** The analyser frames of `x`, one per hop, each ending `hop` samples after the last. */
function* frames(x: Float32Array, hop = HOP) {
  const fft = new FFT(N)
  const spec = fft.createComplexArray()
  const w = new Float32Array(N)
  const db = new Float32Array(N / 2)
  for (let end = N; end <= x.length; end += hop) {
    for (let i = 0; i < N; i++) w[i] = x[end - N + i] * BLACKMAN[i]
    fft.realTransform(spec, w)
    for (let i = 0; i < N / 2; i++) db[i] = 20 * Math.log10(Math.hypot(spec[2 * i], spec[2 * i + 1]) / N)
    yield db
  }
}
/** A band-limited saw at `f` Hz, `s` seconds. */
const saw = (f: number, s: number) =>
  Float32Array.from({ length: Math.round(s * SR) }, (_, i) => {
    let y = 0
    for (let n = 1; n * f < SR / 2; n++) y += Math.sin((2 * Math.PI * n * f * i) / SR) / n
    return 0.2 * y
  })
const cat = (...xs: Float32Array[]) => {
  const y = new Float32Array(xs.reduce((n, x) => n + x.length, 0))
  xs.reduce((o, x) => (y.set(x, o), o + x.length), 0)
  return y
}

test.each([60, 30])('at %i fps: a 2 s E saw, then a 2 s A saw: each class wins only after it leads for 1 s; tonal > .8', (fps) => {
  const m = createMelody(SR, N)
  const seen: number[] = []
  let tonal = NaN
  for (const db of frames(cat(saw(329.63, 2), saw(440, 2)), SR / fps)) ({ pitch: seen[seen.length], tonal } = m.update(db, 1 / fps))
  const at = Math.floor((2 * SR - N) / (SR / fps)) + 1 // the first frame with A in its window
  const e = seen.indexOf(4 / 12)
  expect(seen.slice(0, e)).toEqual(Array(e).fill(0)) // C (the start) until E has led 1 s
  expect(e / fps).toBeGreaterThanOrEqual(1)
  expect(seen.slice(e, at)).toEqual(Array(at - e).fill(4 / 12))
  const a = seen.indexOf(9 / 12)
  expect((a - at) / fps).toBeGreaterThanOrEqual(1) // the 20-frame chroma lag at 60 fps, then the 1 s hold
  expect((a - at) / fps).toBeLessThan(1 + 1 / 3)
  expect(seen.slice(a)).toEqual(Array(seen.length - a).fill(9 / 12)) // no step back, no other class on the way
  expect(tonal).toBeGreaterThan(0.8)
})

test('pitch holds 4/12 through an A/E saw that alternates every 0.3 s after a 2 s E', () => {
  const m = createMelody(SR, N)
  const x = cat(saw(329.63, 2), ...Array.from({ length: 12 }, (_, i) => saw(i % 2 ? 329.63 : 440, 0.3)))
  const seen = Array.from(frames(x), (db) => m.update(db, 1 / 60).pitch)
  expect(seen.slice(90)).toEqual(Array(seen.length - 90).fill(4 / 12))
})

test('white noise: tonal < .2', () => {
  const r = rng(1)
  const m = createMelody(SR, N)
  let tonal = NaN
  for (const db of frames(Float32Array.from({ length: SR }, () => 0.3 * (2 * r() - 1)))) tonal = m.update(db, 1 / 60).tonal
  expect(tonal).toBeLessThan(0.2)
})

test('silence (−Infinity dB) and a paused input: no NaN, tonal falls to 0, pitch holds', () => {
  const m = createMelody(SR, N)
  for (const db of frames(saw(440, 1.5))) m.update(db, 1 / 60) // A wins after it leads 1 s
  const silent = new Float32Array(N / 2).fill(-Infinity)
  for (let i = 0; i < 600; i++) {
    const o = m.update(silent, 1 / 60, i % 2 === 0)
    expect([o.tonal, o.pitch, o.voice].every(Number.isFinite)).toBe(true)
    expect(o.pitch).toBe(9 / 12)
  }
  expect(m.update(silent, 1 / 60).tonal).toBe(0)
  for (let i = 0; i < 20; i++) m.update(silent, 10) // minutes of silence: the chroma underflows to 0
  expect(m.update(silent, 1 / 60).pitch).toBe(9 / 12)
  const fresh = createMelody(SR, N).update(silent, 0) // the app's first frame: dt 0, no sound yet
  expect([fresh.tonal, fresh.pitch]).toEqual([0, 0])
  expect(fresh.voice).toBeLessThan(0.01)
})

test('M2 voice: in [0, 1] and NaN-free over silence, white noise and a saw; the same input gives the same output', () => {
  const r = rng(2)
  const x = cat(new Float32Array(SR / 2), Float32Array.from({ length: SR }, () => 0.3 * (2 * r() - 1)), saw(440, 1))
  const run = () => {
    const m = createMelody(SR, N)
    return Array.from(frames(x), (db) => m.update(db, 1 / 60).voice)
  }
  const v = run()
  expect(v.filter((y) => !(y >= 0 && y <= 1))).toEqual([]) // a NaN fails both
  expect(run()).toEqual(v)
})
