import { describe, expect, test } from 'vitest'
import { coverFit } from './xf'

describe('coverFit', () => {
  test('16:9 on a 16:9 stage → identity', () => {
    const [sx, sy, ox, oy] = coverFit(1600, 900, 1280, 720, false)
    expect(sx).toBeCloseTo(1)
    expect(sy).toBeCloseTo(1)
    expect(ox).toBeCloseTo(0)
    expect(oy).toBeCloseTo(0)
  })

  test('a 4:3 camera on a 16:9 stage crops top/bottom symmetrically', () => {
    const [sx, sy, ox, oy] = coverFit(1600, 900, 640, 480, false)
    expect(sx).toBeCloseTo(1) // the full width is visible
    expect(ox).toBeCloseTo(0)
    expect(oy).toBeCloseTo((1 - sy) / 2) // symmetric: the same crop top and bottom (sy is the visible height fraction)
    expect(oy).toBeCloseTo(1 - oy - sy)
  })

  test('mirror flips x only', () => {
    const a = coverFit(1600, 900, 640, 480, false)
    const b = coverFit(1600, 900, 640, 480, true)
    expect(b[1]).toBe(a[1])
    expect(b[3]).toBe(a[3])
    expect(b[0]).toBe(-a[0])
    expect(b[2]).toBeCloseTo(1 - a[2])
  })

  test('every stage corner maps inside [0,1]', () => {
    const cases: [number, number, number, number, boolean][] = [
      [1600, 900, 1280, 720, false],
      [1600, 900, 640, 480, false],
      [1920, 1080, 1280, 720, true],
      [1728, 1117, 1280, 720, true], // the real probe stage
      [1000, 1000, 1280, 720, false],
      [1280, 720, 1000, 1000, true],
    ]
    for (const [sw, sh, cw, ch, m] of cases) {
      const [sx, sy, ox, oy] = coverFit(sw, sh, cw, ch, m)
      for (const vx of [0, 1]) for (const vy of [0, 1]) {
        const u = vx * sx + ox
        const v = vy * sy + oy
        expect(u).toBeGreaterThanOrEqual(-1e-9)
        expect(u).toBeLessThanOrEqual(1 + 1e-9)
        expect(v).toBeGreaterThanOrEqual(-1e-9)
        expect(v).toBeLessThanOrEqual(1 + 1e-9)
      }
    }
  })
})
