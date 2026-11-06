// plan_camera S0.3 tests for the probe metrics (the frozen CP0 JSON's numbers).
import { describe, expect, it } from 'vitest'
import { centroidDelta, iou, lateCount, minWindowFps, p50, p95 } from './metrics'

describe('p50 / p95', () => {
  it('quantiles on known arrays (floor(n·p) convention)', () => {
    expect(p50([10, 20, 30, 40, 50])).toBe(30)
    expect(p95([10, 20, 30, 40, 50])).toBe(50)
    expect(p50([42])).toBe(42)
    expect(p95(Array.from({ length: 20 }, (_, i) => i))).toBe(19)
    expect(p50([])).toBeNull()
    expect(p95([])).toBeNull()
  })
})

describe('minWindowFps', () => {
  const fps30 = (hole: [number, number] | null) => {
    const ts: number[] = []
    for (let i = 0; i <= 300; i++) {
      const t = (i * 1000) / 30
      if (!hole || t < hole[0] || t >= hole[1]) ts.push(t)
    }
    return ts
  }
  it('a steady 30 fps source reads 30 in every 1 s window', () => {
    expect(minWindowFps(fps30(null))!).toBeCloseTo(30, 1)
  })
  it('one 400 ms hole → the minimum is the window straddling it (≈17.6, not 30)', () => {
    expect(minWindowFps(fps30([4000, 4400]))!).toBeCloseTo(17.586, 2)
  })
  it('fewer than two stamps → null', () => {
    expect(minWindowFps([])).toBeNull()
    expect(minWindowFps([1000])).toBeNull()
  })
})

describe('iou', () => {
  it('identical → 1, disjoint → 0, half-overlap → 1/3', () => {
    const a = new Uint8Array([255, 255, 0, 0])
    const b = new Uint8Array([0, 255, 255, 0])
    expect(iou(a, a)).toBe(1)
    expect(iou(new Uint8Array([255, 0]), new Uint8Array([0, 255]))).toBe(0)
    expect(iou(a, b)).toBeCloseTo(1 / 3, 10)
  })
  it('both empty agree → 1; length mismatch throws', () => {
    expect(iou(new Uint8Array([0, 0]), new Uint8Array([0, 0]))).toBe(1)
    expect(() => iou(new Uint8Array([1]), new Uint8Array([1, 1]))).toThrow()
  })
  it('thresholds at >127', () => {
    expect(iou(new Uint8Array([127]), new Uint8Array([128]))).toBe(0)
  })
})

describe('centroidDelta', () => {
  it('a one-texel shift = 1', () => {
    const w = 4, h = 4
    const a = new Uint8Array(w * h), b = new Uint8Array(w * h)
    for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1]]) a[y * w + x] = 255
    for (const [x, y] of [[1, 0], [2, 0], [1, 1], [2, 1]]) b[y * w + x] = 255
    expect(centroidDelta(a, b, w, h)).toBeCloseTo(1, 10)
    expect(centroidDelta(a, a, w, h)).toBe(0)
  })
  it('an empty side → 0', () => {
    const w = 4, h = 4
    const a = new Uint8Array(w * h)
    a[0] = 255
    expect(centroidDelta(a, new Uint8Array(w * h), w, h)).toBe(0)
  })
})

describe('lateCount', () => {
  it('matches the __raf rule: Δ > 1.5× the median', () => {
    expect(lateCount([16.7, 16.7, 16.7, 16.7, 16.7, 100])).toBe(1)
    expect(lateCount([16.7, 16.7, 16.7, 16.7, 16.7])).toBe(0)
    expect(lateCount([33, 33, 33, 50, 50, 50, 50])).toBe(0) // median is 50, so nothing exceeds 1.5×50
    expect(lateCount([])).toBe(0)
  })
})
