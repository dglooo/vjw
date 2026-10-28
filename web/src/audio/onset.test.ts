import { expect, test } from 'vitest'
import { createDetector, type DetectorOpts } from './onset'

const BINS = 257 // 512-point FFT, as in the worklet
const HOP_S = 256 / 48000
let seed = 1
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647 // seeded: the fixtures are deterministic
const noise = (amp: number) => Float32Array.from({ length: BINS }, () => amp * rand())
const flat = (amp: number) => new Float32Array(BINS).fill(amp) // an impulse has a flat spectrum

/** Hop indices that fire, feeding one spectrum per hop at t = i · HOP_S. */
function onsetHops(frames: Float32Array[], opts?: Partial<DetectorOpts>) {
  const d = createDetector(opts)
  return frames.flatMap((mag, i) => {
    const o = d.detect(mag, i * HOP_S)
    if (o) expect(o.t).toBe(i * HOP_S) // causal: stamped with the hop that carries the click
    return o ? [i] : []
  })
}

test('flux is 0 for identical spectra, positive when rising, 0 when falling', () => {
  const a = noise(0.5)
  const twice = a.map((v) => 2 * v)
  const d = createDetector()
  d.detect(a, 0)
  d.detect(a, HOP_S)
  expect(d.odf).toBe(0)
  d.detect(twice, 2 * HOP_S)
  expect(d.odf).toBeGreaterThan(0)
  d.detect(a, 3 * HOP_S)
  expect(d.odf).toBe(0)
})

test('a click train in 1% noise gives exactly one onset per click, at the click hop', () => {
  const clicks = Array.from({ length: 10 }, (_, i) => i * 20)
  const frames = Array.from({ length: 200 }, (_, i) => (clicks.includes(i) ? flat(1) : noise(0.01)))
  expect(onsetHops(frames)).toEqual(clicks)

  const d = createDetector()
  const strengths = frames.map((m, i) => d.detect(m, i * HOP_S)?.strength).filter((s) => s !== undefined)
  expect(strengths.every((s) => s > 1.5 && s <= 4)).toBe(true)

  // level independence: the same input ×10 fires on the same hops
  expect(onsetHops(frames.map((m) => m.map((v) => 10 * v)))).toEqual(clicks)
})

test('two clicks one hop apart give one onset (minGap)', () => {
  // The second, louder click has the larger flux, so only minGap keeps it from firing.
  const frames = Array.from({ length: 40 }, (_, i) => (i === 30 ? flat(0.1) : i === 31 ? flat(100) : noise(0.01)))
  expect(onsetHops(frames).filter((i) => i >= 30)).toEqual([30])
  expect(onsetHops(frames, { minGap: 0 }).filter((i) => i >= 30)).toEqual([30, 31])
})

test('silence gives no onsets', () => {
  expect(onsetHops(Array.from({ length: 100 }, () => new Float32Array(BINS)))).toEqual([])
})
