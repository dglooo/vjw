// The melodic layer (dsp_genre_melodic_2026-11-21 §7 M1): magDb frames as analyser4k reads them (scratchpad/dsp-genre
// replay.ts analyser(): Blackman, |X| / N in dB, smoothing 0), 60 fps at 48 kHz (hop 800).
import FFT from 'fft.js'
import { expect, test } from 'vitest'
import { createMelody } from './melody'
import { rng, SR } from './synth'

const N = 4096
const HOP = SR / 60
const BLACKMAN = Float32Array.from({ length: N }, (_, i) => 0.42 - 0.5 * Math.cos((2 * Math.PI * i) / N) + 0.08 * Math.cos((4 * Math.PI * i) / N))

/** The analyser frames of `x`, one per hop, each ending `HOP` samples after the last. */
function* frames(x: Float32Array) {
  const fft = new FFT(N)
  const spec = fft.createComplexArray()
  const w = new Float32Array(N)
  const db = new Float32Array(N / 2)
  for (let end = N; end <= x.length; end += HOP) {
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

test('an E saw holds pitch 4/12; after the switch to an A saw, pitch is 9/12 within 20 frames and stays; tonal > .8', () => {
  const m = createMelody(SR, N)
  const seen: number[] = []
  let tonal = NaN
  for (const db of frames(cat(saw(329.63, 1), saw(440, 1)))) ({ pitch: seen[seen.length], tonal } = m.update(db, 1 / 60))
  const at = Math.floor((SR - N) / HOP) + 1 // the first frame with A in its window
  expect(seen.slice(0, at)).toEqual(Array(at).fill(4 / 12))
  const first = seen.indexOf(9 / 12)
  expect(first - at).toBeLessThan(20)
  expect(seen.slice(first)).toEqual(Array(seen.length - first).fill(9 / 12)) // no step back, no other class on the way
  expect(tonal).toBeGreaterThan(0.8)
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
  for (const db of frames(saw(440, 0.5))) m.update(db, 1 / 60)
  const silent = new Float32Array(N / 2).fill(-Infinity)
  for (let i = 0; i < 600; i++) {
    const o = m.update(silent, 1 / 60, i % 2 === 0)
    expect(Number.isFinite(o.tonal) && Number.isFinite(o.pitch)).toBe(true)
    expect(o.pitch).toBe(9 / 12)
  }
  expect(m.update(silent, 1 / 60).tonal).toBe(0)
  for (let i = 0; i < 20; i++) m.update(silent, 10) // minutes of silence: the chroma underflows to 0
  expect(m.update(silent, 1 / 60).pitch).toBe(9 / 12)
  const fresh = createMelody(SR, N).update(silent, 0) // the app's first frame: dt 0, no sound yet
  expect([fresh.tonal, fresh.pitch]).toEqual([0, 0])
})
