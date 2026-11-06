// plan_camera S0.2 tests for the frozen contract's mask math (design D10).
import { describe, expect, it } from 'vitest'
import { downsample, quantize, stats } from './smooth'

describe('stats', () => {
  it('empty → area 0 and an empty box', () => {
    const s = stats(new Uint8Array(8 * 4), 8, 4)
    expect(s.area).toBe(0)
    expect(s.box).toEqual([0, 0, 0, 0])
    expect(s.cx).toBe(0)
    expect(s.cy).toBe(0)
  })

  it('full → area 1 and the full box', () => {
    const s = stats(new Uint8Array(8 * 4).fill(255), 8, 4)
    expect(s.area).toBe(1)
    expect(s.box).toEqual([0, 0, 1, 1])
    expect(s.cx).toBeCloseTo(0.5)
    expect(s.cy).toBeCloseTo(0.5)
  })

  it('one edge pixel → box and centroid there', () => {
    const w = 8, h = 4
    const tl = new Uint8Array(w * h)
    tl[0] = 255
    let s = stats(tl, w, h)
    expect(s.box).toEqual([0, 0, 1 / w, 1 / h])
    expect(s.cx).toBeCloseTo(0.5 / w)
    expect(s.cy).toBeCloseTo(0.5 / h)
    expect(s.area).toBeCloseTo(1 / (w * h))

    const br = new Uint8Array(w * h)
    br[w * h - 1] = 255
    s = stats(br, w, h)
    expect(s.box).toEqual([(w - 1) / w, (h - 1) / h, 1, 1])
    expect(s.cx).toBeCloseTo((w - 0.5) / w)
    expect(s.cy).toBeCloseTo((h - 0.5) / h)
  })

  it('soft values → area is the mean confidence', () => {
    const s = stats(new Uint8Array(8 * 4).fill(127), 8, 4)
    expect(s.area).toBeCloseTo(127 / 255)
    expect(s.box).toEqual([0, 0, 0, 0]) // nothing is >50%, so no one is "there"
  })
})

describe('downsample', () => {
  it('is area-preserving: a half-filled 4×4 → 2×2 of 128', () => {
    const in4 = new Uint8Array(16)
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) in4[y * 4 + x] = (x + y) % 2 === 0 ? 255 : 0
    const out = downsample(in4, 4, 4, 2, 2)
    expect([...out]).toEqual([128, 128, 128, 128])
  })

  it('a 3:2 ratio keeps the total within ±1 u8', () => {
    const w = 48, h = 32
    const full = new Uint8Array(w * h).fill(255)
    const out = downsample(full, w, h, 24, 16)
    const sumIn = full.reduce((a, b) => a + b, 0)
    const sumOut = out.reduce((a, b) => a + b, 0)
    expect(Math.abs(sumOut * (w * h) / (24 * 16) - sumIn)).toBeLessThanOrEqual(1)
    expect([...out].every((v) => v === 255)).toBe(true)
  })

  it('does not upscale', () => {
    const in4 = new Uint8Array(16).fill(200)
    expect(downsample(in4, 4, 4, 8, 8)).toBe(in4)
    expect(downsample(in4, 4, 4, 4, 16)).toBe(in4)
  })
})

describe('quantize', () => {
  it('0→0, 1→255, .5→128, clamps', () => {
    expect([...quantize(new Float32Array([0, 1, 0.5, -0.7, 1.3, 0.999951]))]).toEqual([0, 255, 128, 0, 255, 255])
  })
})
