// plan_camera S0.2 + S1.1 tests for the frozen contract's mask math (design D10).
import { describe, expect, it } from 'vitest'
import { downsample, gate, HOLD, KEEP, presence, PRESENCE_FULL, quantize, SLOW, stats, type Gate } from './smooth'

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

describe("gate (S1.1: the mask's EMA weight, D2; the knobs are the [R0] design defaults)", () => {
  const settled = (area = 0.12): Gate => ({ area, held: 0 })

  it('a one-mask flood (area .9) → k 0, g.area unchanged', () => {
    const s = settled()
    expect(gate(s, 0.9)).toBe(0) // .9 > AREA_MAX: the flood guard
    expect(s.area).toBe(0.12)
  })

  it('a one-mask vanish → held, g.area unchanged; the next mask settles', () => {
    const s = settled()
    expect(gate(s, 0)).toBe(0) // |0 − .12| / .12 = 1 > JUMP, streak 1 ≤ HOLD
    expect(s.area).toBe(0.12)
    expect(s.held).toBe(1)
    expect(gate(s, 0.12)).toBe(KEEP) // back to the person: settled, the streak resets
    expect(s.held).toBe(0)
    expect(s.area).toBe(0.12)
  })

  it('AREA_MAX holds even after HOLD: a flood is k 0 whatever the streak', () => {
    const s = settled(0.05)
    for (let i = 0; i < HOLD + 4; i++) expect(gate(s, 0.9)).toBe(0)
    expect(s.area).toBe(0.05)
    expect(s.held).toBe(0) // a flood is not a jump: the streak does not arm
  })

  it('a sustained jump enters at SLOW after HOLD masks, then KEEP once settled', () => {
    const s = settled()
    const ks: number[] = []
    for (let i = 0; i < 60; i++) ks.push(gate(s, 0.6)) // .6 is under AREA_MAX: the jump path, not the flood guard
    expect(ks.slice(0, HOLD)).toEqual(Array(HOLD).fill(0)) // the first HOLD masks: held at k 0
    expect(ks[HOLD]).toBe(SLOW) // mask HOLD + 1: accepted at SLOW
    const settleAt = ks.indexOf(KEEP)
    expect(settleAt).toBeGreaterThan(HOLD) // it takes more than one SLOW mask to settle
    expect(ks.slice(HOLD + 1, settleAt)).toEqual(Array(settleAt - HOLD - 1).fill(SLOW)) // SLOW until it settles
    expect(ks.slice(settleAt)).toEqual(Array(60 - settleAt).fill(KEEP))
    expect(s.area).toBeCloseTo(0.6, 6) // settled at the new reality
    expect(s.held).toBe(0)
  })

  it('an alternating strobe never grows held past 1, so the strobe frames are always held', () => {
    // the brief's .1/.9: the .9 is also a flood (> AREA_MAX), held by the guard
    const flood = settled(0.1)
    for (let i = 0; i < 60; i++) {
      expect(gate(flood, i % 2 ? 0.1 : 0.9)).toBe(i % 2 ? KEEP : 0)
      expect(flood.held).toBeLessThanOrEqual(1)
    }
    expect(flood.area).toBe(0.1)
    // the sub-flood level (.55) exercises the jump streak: every settle frame resets it, so it peaks at 1
    const s = settled(0.1)
    for (let i = 0; i < 60; i++) {
      expect(gate(s, i % 2 ? 0.1 : 0.55)).toBe(i % 2 ? KEEP : 0)
      expect(s.held).toBeLessThanOrEqual(1)
    }
    expect(s.area).toBeCloseTo(0.1, 6)
  })

  it('g.area follows with the same k', () => {
    const s = settled()
    expect(gate(s, 0.13)).toBe(KEEP) // |.13 − .12| / .12 < JUMP: settled
    expect(s.area).toBe(0.12 + KEEP * (0.13 - 0.12)) // the EMA step at KEEP
    const f = settled(0.05)
    expect(gate(f, 0.9)).toBe(0) // k 0: frozen
    expect(f.area).toBe(0.05)
    const j = settled()
    expect(gate(j, 0.6)).toBe(0) // inside HOLD: frozen
    expect(j.area).toBe(0.12)
  })
})

describe('presence (S1.1: the binding source, the CP1 contract)', () => {
  it('rests at 0: presence(0) = 0', () => {
    expect(presence(0)).toBe(0)
  })

  it('full at PRESENCE_FULL, half at half: .08 → 1, .04 → .5', () => {
    expect(PRESENCE_FULL).toBe(0.08) // the [R0] default the check is written against
    expect(presence(0.08)).toBe(1)
    expect(presence(0.04)).toBeCloseTo(0.5, 12)
  })

  it('clamps above and below', () => {
    expect(presence(0.5)).toBe(1)
    expect(presence(1)).toBe(1)
    expect(presence(-0.1)).toBe(0)
  })
})
