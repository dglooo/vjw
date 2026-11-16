import { expect, test } from 'vitest'
import { createMeter, FLOOR } from './meter'

const db = (x: number) => 20 * Math.log10(x)
/** One frame whose peak is `l` on the left channel (`r` on the right) at `now` s. */
const at = (m: ReturnType<typeof createMeter>, now: number, l: number, r = 0) => {
  m.update(new Float32Array([l * 0.5, -l]), new Float32Array([r, 0]), now)
  return m
}

test('the peak holds 0.5 s, then falls 20 dB/s; silence reads the floor', () => {
  const m = createMeter()
  expect(at(m, 0, 0).db).toBe(FLOOR)
  expect(at(m, 1, 0.5).db).toBeCloseTo(db(0.5)) // −6.02, from a negative sample too
  expect(at(m, 1.4, 0.1).db).toBeCloseTo(db(0.5)) // held
  expect(at(m, 2, 0.1).db).toBeCloseTo(db(0.5) - 20 * 0.5) // 0.5 s into the fall: −16.02
  expect(at(m, 2.5, 0.1).db).toBeCloseTo(db(0.1)) // the fall stops at the frame's own peak
  expect(at(m, 2.6, 0, 0.25).db).toBeCloseTo(db(0.25)) // the right channel counts
  expect(m.clip).toBe(false)
})

test('a sample ≥ −0.3 dBFS latches CLIP 1.5 s; clips spread over > 1 s show the hint', () => {
  const m = createMeter()
  expect(at(m, 0, 0.96).clip).toBe(false) // −0.35 dBFS: hot, no clip
  expect(at(m, 1, 0.967).clip).toBe(true) // −0.29 dBFS
  expect(at(m, 2.49, 0.1).clip).toBe(true)
  expect(m.hint).toBe(false) // one clip
  expect(at(m, 2.5, 0.1).clip).toBe(false) // 1.5 s after it
  for (let k = 0; k <= 10; k++) at(m, 3 + k / 10, 1) // a clipped second, 10 Hz
  expect(m.hint).toBe(false) // first to last clip = 1.0 s
  expect(at(m, 4.2, 1.2)).toMatchObject({ clip: true, hint: true }) // > 1 s; a file's float over counts
  expect(at(m, 5.69, 0.1)).toMatchObject({ clip: true, hint: true }) // the latch holds both
  expect(at(m, 5.7, 0.1)).toMatchObject({ clip: false, hint: false })
  for (let k = 0; k <= 9; k++) at(m, 6 + k / 10, 0.99) // a new run starts its own clock
  expect(m.hint).toBe(false)
})
