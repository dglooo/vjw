// vs3/pairs.ts (plan_vs3_engine S0.2, skeptic N5): WCAG flash pairs on 2 s frame-mean luma traces at 60 fps.
import { expect, test } from 'vitest'
import { flashPairs } from './pairs'

/** 120 frames of `f(t)`, t in s. */
const trace = (f: (t: number) => number) => {
  const t = Array.from({ length: 120 }, (_, i) => i / 60)
  return flashPairs(t, t.map(f))
}
const tri = (x: number) => 4 * Math.abs(x - Math.floor(x) - 0.5) - 1 // -1..1, period 1
const square = (jumpsPerS: number) => (t: number) => Math.floor(t * jumpsPerS + 1e-9) % 2 // 0, 1, 0 …: a jump every 1 / jumpsPerS s

test('FP1 triangle 4 Hz, swing .12 around .5', () => {
  expect(trace((t) => 0.5 + 0.06 * tri(4 * t)).max1s).toBeGreaterThan(3)
})

test('FP2 the same with swing .08', () => {
  expect(trace((t) => 0.5 + 0.04 * tri(4 * t))).toEqual({ total: 0, max1s: 0 })
})

test('FP3 one ramp .2 → .9', () => {
  expect(trace((t) => 0.2 + (0.7 * t) / 2).total).toBe(0)
})

test('FP4 swing .15 between .85 and 1', () => {
  expect(trace((t) => 0.85 + 0.15 * square(8)(t)).total).toBe(0)
})

test('FP5 square, 8 jumps per s of .15 around .5', () => {
  expect(trace((t) => 0.425 + 0.15 * square(8)(t)).max1s).toBeGreaterThan(3)
})

test('FP6 square 2 Hz of .3', () => {
  const r = trace((t) => 0.35 + 0.3 * square(4)(t)) // 2 Hz: 4 jumps per s
  expect(r.max1s).toBeLessThanOrEqual(3)
  expect(r.total).toBeGreaterThanOrEqual(3)
})
