import { describe, expect, test } from 'vitest'
import { BAND_COUNT } from './audio/energy'
import { ZERO_SYNC } from './audio/sync'
import { evaluate, sources, SOURCE_IDS, type Binding, type Sources } from './bind'
import type { FrameInput } from './frame'

const frame = (over: Partial<FrameInput> = {}): FrameInput => ({
  energy: { bands: new Float32Array(BAND_COUNT), level: { bass: 1, mid: 1, treb: 1 }, att: { bass: 1, mid: 1, treb: 1 } },
  onsets: [], lastOnset: null, audioNow: 10, sync: ZERO_SYNC, time: 0, dt: 1 / 60, width: 0, height: 0, ...over,
})
const src = (over: Partial<FrameInput> = {}) => sources(frame(over), {})
const lin = (db: number) => 10 ** (db / 20)
/** Instant (attack and release 0) unless overridden, range 0..1. */
const bind = (over: Partial<Binding> = {}): Binding => ({ source: 'bass', amount: 1, attack: 0, release: 0, min: 0, max: 1, ...over })
const once = (b: Binding, s: Sources) => evaluate(b, s, { y: 0 }, 1 / 60)

describe('sources', () => {
  test('bass, mid and treb are att / 2, clamped to 0..1', () => {
    const s = src({ energy: { ...frame().energy, att: { bass: 2, mid: 1, treb: 0 } } })
    expect([s.bass, s.mid, s.treb]).toEqual([1, 0.5, 0])
    expect(src({ energy: { ...frame().energy, att: { bass: 3, mid: 1, treb: 1 } } }).bass).toBe(1)
  })

  test('bands: a −75…−15 dB window after a +1 dB/band tilt; silence reads 0', () => {
    const bands = new Float32Array(BAND_COUNT)
    bands[0] = lin(-75)
    bands[1] = lin(-46) // −45 after the tilt
    bands[2] = lin(-17) // −15
    bands[10] = lin(-85) // −75
    bands[11] = lin(-26) // −15
    bands[12] = lin(0)
    const s = src({ energy: { ...frame().energy, bands } })
    expect(s.band0).toBeCloseTo(0, 6)
    expect(s.band1).toBeCloseTo(0.5, 6)
    expect(s.band2).toBeCloseTo(1, 6)
    expect(s.band10).toBeCloseTo(0, 6)
    expect(s.band11).toBeCloseTo(1, 6)
    expect(s.band12).toBe(1)
    expect(s.band31).toBe(0) // 0 magnitude
  })

  test('onset: (strength − 1.5) / 2.5, decaying by 1/e every 0.12 s of age; a negative age clamps to 0', () => {
    const at = (age: number, strength = 2.5) => src({ lastOnset: { t: 10 - age, strength } }).onset
    expect(at(0)).toBeCloseTo(0.4, 12)
    expect(at(0.12)).toBeCloseTo(0.4 / Math.E, 12)
    expect(at(-0.05)).toBeCloseTo(0.4, 12)
    expect(at(0, 9)).toBe(1)
    expect(src().onset).toBe(0)
  })

  test('beat, bar and confidence come from the sync, lfo from the time', () => {
    const s = src({ sync: { bpm: 128, beat: 17.25, bar: 4.3, confidence: 0.7 }, time: 12.5 })
    expect([s.beat, s.bar, s.confidence, s.lfo]).toEqual([17.25, 4.3, 0.7, 12.5])
  })

  test('returns `out` itself, every SOURCE_IDS key filled with a finite number', () => {
    const out: Sources = {}
    expect(sources(frame(), out)).toBe(out)
    expect(Object.keys(out).sort()).toEqual([...SOURCE_IDS].sort())
    expect(SOURCE_IDS).toHaveLength(3 + BAND_COUNT + 5)
    for (const k of SOURCE_IDS) expect(Number.isFinite(out[k]), k).toBe(true)
  })
})

describe('evaluate', () => {
  test('an unknown source reads 0, so the output is `min`', () => {
    expect(once(bind({ source: 'nope', min: 0.3, max: 0.9 }), { bass: 1 })).toBe(0.3)
    expect(once(bind({ source: 'toString', min: 0.3, max: 0.9 }), {})).toBe(0.3) // not the prototype's
  })

  test('amount scales, then the value clamps to 0..1; the range maps it', () => {
    expect(once(bind({ amount: 2 }), { bass: 0.3 })).toBeCloseTo(0.6, 12)
    expect(once(bind({ amount: 2 }), { bass: 0.7 })).toBe(1)
    expect(once(bind({ amount: -1 }), { bass: 0.7 })).toBe(0)
    expect(once(bind({ min: 2, max: 6 }), { bass: 0.25 })).toBe(3)
    expect(once(bind({ min: 1, max: 0 }), { bass: 0.25 })).toBe(0.75) // min > max inverts
  })

  test('the one-pole is fps-independent: a fall with release 0.15 lands on the same value at 60 and 30 fps', () => {
    const fall = (fps: number) => {
      const state = { y: 1 }
      let v = 1
      for (let i = 0; i < 0.3 * fps; i++) v = evaluate(bind({ release: 0.15 }), { bass: 0 }, state, 1 / fps)
      return v
    }
    expect(fall(60)).toBeCloseTo(fall(30), 3)
    expect(fall(60)).toBeCloseTo(Math.exp(-2), 6)
  })

  test('attack 0 is instant; attack 0.5 reaches 1 − 1/e after 0.5 s; dt 0 holds', () => {
    expect(evaluate(bind(), { bass: 1 }, { y: 0 }, 1 / 60)).toBe(1)
    const state = { y: 0 }
    let v = 0
    for (let i = 0; i < 30; i++) v = evaluate(bind({ attack: 0.5 }), { bass: 1 }, state, 1 / 60)
    expect(v).toBeCloseTo(1 - 1 / Math.E, 6)
    expect(evaluate(bind({ attack: 0.5 }), { bass: 1 }, { y: 0.2 }, 0)).toBe(0.2)
    expect(evaluate(bind({ release: 0.5 }), { bass: 0 }, { y: 0.2 }, 0)).toBe(0.2)
  })

  test('beat with saw: 1 on the beat line, 0.5 mid-beat, × confidence', () => {
    const saw = bind({ source: 'beat', shape: 'saw' })
    expect(once(saw, { beat: 4, confidence: 1 })).toBe(1)
    expect(once(saw, { beat: 4.5, confidence: 1 })).toBe(0.5)
    expect(once(saw, { beat: 4, confidence: 0.5 })).toBe(0.5)
    expect(once(bind({ source: 'beat' }), { beat: 0.3, confidence: 0 })).toBe(0.3) // no shape: the raw value
  })

  test('bar with rate 2 cycles twice per bar', () => {
    const b = bind({ source: 'bar', shape: 'saw', rate: 2 })
    expect([0, 0.25, 0.5, 0.75].map((bar) => once(b, { bar, confidence: 1 }))).toEqual([1, 0.5, 1, 0.5])
  })

  test('lfo sine at time 0 / 0.25 / 0.5 → 0 / 0.5 / 1, not gated by confidence', () => {
    const b = bind({ source: 'lfo', shape: 'sine' })
    const v = [0, 0.25, 0.5].map((lfo) => once(b, { lfo, confidence: 0 }))
    expect(v[0]).toBeCloseTo(0, 12)
    expect(v[1]).toBeCloseTo(0.5, 12)
    expect(v[2]).toBeCloseTo(1, 12)
  })

  test('square and tri at three phases', () => {
    const at = (shape: Binding['shape'], lfo: number) => once(bind({ source: 'lfo', shape }), { lfo })
    expect([0.1, 0.4, 0.6].map((p) => at('square', p))).toEqual([1, 1, 0])
    expect(at('tri', 0)).toBe(0)
    expect(at('tri', 0.25)).toBe(0.5)
    expect(at('tri', 2.5)).toBe(1)
  })

  test('random holds within a cycle and changes across cycles', () => {
    const b = bind({ source: 'lfo', shape: 'random', rate: 2 })
    const v = (lfo: number) => once(b, { lfo })
    expect(v(1.01)).toBe(v(1.24)) // one cycle at rate 2 is [1.0, 1.5)
    const cycles = Array.from({ length: 8 }, (_, i) => v(i / 2 + 0.1))
    expect(new Set(cycles).size).toBeGreaterThanOrEqual(2)
    for (const x of cycles) expect(x >= 0 && x < 1).toBe(true)
  })
})
