import { describe, expect, test } from 'vitest'
import { badge, createGovernor, nextMode, outputFor, type Governor } from './quality'

const VSYNC = 1000 / 60

/** Feeds `frames` frames after time t (ms), `delta(k)` apart, JS time `jsMs`; returns the last frame's time. */
function run(g: Governor, t: number, frames: number, delta: (k: number) => number = () => VSYNC, jsMs = 4) {
  for (let k = 0; k < frames; k++) g.frame((t += delta(k)), jsMs)
  return t
}
/** 2 s at 60 Hz where frames 10, 30, 50, 70 and 90 miss a vsync (33 ms deltas): 5 late frames. */
const missing5 = (k: number) => (k % 20 === 10 && k < 100 ? 2 * VSYNC : VSYNC)

describe('governor', () => {
  test('60 Hz clean for 10 s: scale stays 1, no drops, refresh = the vsync period', () => {
    const g = createGovernor()
    run(g, 0, 721)
    expect(g.scale).toBe(1)
    expect(g.drops).toBe(0)
    expect(g.refreshMs).toBeCloseTo(VSYNC, 6)
  })

  test('33 ms deltas (Energy Saver): refresh ≈ 33 ms and no drops', () => {
    const g = createGovernor()
    run(g, 0, 300, () => 2 * VSYNC)
    expect(g.refreshMs).toBeCloseTo(2 * VSYNC, 6)
    expect(g.drops).toBe(0)
  })

  test('5 late frames in 2 s while GPU-bound step down ×0.85; repeated windows floor at 0.6; reset restores', () => {
    const g = createGovernor()
    let t = run(g, 0, 121) // warm-up: 2 s of clean 60 Hz
    t = run(g, t, 120, missing5)
    expect(g.drops).toBe(5)
    expect(g.scale).toBeCloseTo(0.85, 9)
    for (let w = 0; w < 4; w++) t = run(g, t, 120, missing5)
    expect(g.scale).toBe(0.6)
    g.reset() // a mode change, e.g. to 30: the old 60 Hz deltas must not make every 33 ms frame late
    expect([g.scale, g.drops]).toEqual([1, 0])
    run(g, t, 120, () => 2 * VSYNC)
    expect(g.drops).toBe(0)
  })

  test('late frames while CPU-bound (median JS 14 ms) count as drops but never step down', () => {
    const g = createGovernor()
    let t = run(g, 0, 121) // warm-up: 2 s of clean 60 Hz
    for (let w = 0; w < 3; w++) t = run(g, t, 120, missing5, 14)
    expect(g.drops).toBe(15)
    expect(g.scale).toBe(1)
  })

  test('10 s with no late frame after a step-down probes ×1.1, capped at 1', () => {
    const g = createGovernor()
    let t = run(g, 0, 121) // warm-up: 2 s of clean 60 Hz
    t = run(g, t, 120, missing5) // the last late frame is 0.5 s before the end
    t = run(g, t, 540) // 9.5 s calm
    expect(g.scale).toBeCloseTo(0.85, 9)
    t = run(g, t, 60) // 10.5 s calm
    expect(g.scale).toBeCloseTo(0.935, 9)
    t = run(g, t, 600) // the next probe after another 10 s: a probe that held does not back off
    expect(g.scale).toBe(1)
    run(g, t, 1200)
    expect(g.scale).toBe(1)
  })

  test('a late frame within 2 s of a step-up fails the probe: the next probe needs 20 s', () => {
    const g = createGovernor()
    let t = run(g, 0, 121) // warm-up: 2 s of clean 60 Hz
    t = run(g, t, 120, missing5)
    t = run(g, t, 600) // the probe fires ≈0.5 s before the end
    expect(g.scale).toBeCloseTo(0.935, 9)
    t = run(g, t, 1, () => 2 * VSYNC) // late, < 2 s after the step-up
    t = run(g, t, 60 * 19) // 19 s calm: 10 s no longer suffices
    expect(g.scale).toBeCloseTo(0.935, 9)
    run(g, t, 90) // 20.5 s calm
    expect(g.scale).toBe(1)
  })

  test('jsMs: the median of the last 120 JS times, 0 before 120 samples', () => {
    const g = createGovernor()
    let t = run(g, 0, 120) // 119 samples at 4 ms: the first frame only starts the clock
    expect(g.jsMs).toBe(0)
    t = run(g, t, 1)
    expect(g.jsMs).toBe(4)
    run(g, t, 120, undefined, 12)
    expect(g.jsMs).toBe(12)
  })
})

describe('modes', () => {
  test('Q cycles 60A → 60F → 30 → 60A', () => {
    expect([nextMode('60-adaptive'), nextMode('60-full'), nextMode('30')]).toEqual(['60-full', '30', '60-adaptive'])
  })

  test('outputFor: 60A is ½ base, 60F and 30 the base, always even; 30 renders every other frame', () => {
    expect(outputFor('60-adaptive', 2880, 1864)).toEqual({ w: 1440, h: 932, everyOtherFrame: false })
    expect(outputFor('60-adaptive', 3456, 2234)).toEqual({ w: 1728, h: 1118, everyOtherFrame: false }) // 558.5 → even
    expect(outputFor('60-full', 1755, 877)).toEqual({ w: 1756, h: 878, everyOtherFrame: false })
    expect(outputFor('30', 2880, 1864)).toEqual({ w: 2880, h: 1864, everyOtherFrame: true })
  })

  test('the badge reads mode · scale · drops', () => {
    expect(badge({ quality: '60-adaptive', scale: 0.8, drops: 3 })).toBe('60A · 0.80× · 3 drops')
  })
})
