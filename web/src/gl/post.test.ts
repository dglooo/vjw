import { describe, expect, test } from 'vitest'
import { postFor } from './post'

const NONE = Infinity // no drop yet
const gain = (heat: number, beat: number, conf: number, bpm = 60) => postFor(heat, NONE, beat, bpm, conf).gain // 60 BPM: eighths (2/s) stay under the WCAG cap

describe('postFor', () => {
  test('no heat and no drop is the identity, even on a confident beat; so is a cold tail', () => {
    expect(postFor(0, NONE, 0, 128, 1)).toEqual({ gain: 1, flash: 0 })
    expect(postFor(0.005, NONE, 0, 128, 1)).toEqual({ gain: 1, flash: 0 }) // under one 8-bit step: the engine skips the pass
    expect(postFor(0, 2, 0, 128, 1)).toEqual({ gain: 1, flash: 0 }) // the flash's tail, 2 s on
    expect(gain(0.016, 0.5, 0)).toBeCloseTo(1.004, 12) // just over one step: drawn
  })

  test('heat alone adds at most +25% brightness, linearly', () => {
    expect(gain(1, 0, 0)).toBe(1.25)
    expect(gain(0.5, 0, 0)).toBe(1.125)
    expect(gain(5, 0, 0)).toBe(1.25)
  })

  test('the strobe peaks at 0.15 on the beat, x confidence, none below 0.3', () => {
    expect(gain(1, 0, 1)).toBeCloseTo(1.4, 12)
    expect(gain(1, 0, 0.6)).toBeCloseTo(1.25 + 0.15 * 0.6, 12)
    expect(gain(1, 0, 0.3)).toBeCloseTo(1.25 + 0.15 * 0.3, 12)
    expect(gain(1, 0, 0.29)).toBe(1.25)
  })

  test('it follows the beat phase: 1/4 notes below heat 0.5, 1/8 notes from it', () => {
    expect(gain(0.49, 0, 1)).toBeCloseTo(1 + 0.25 * 0.49 + 0.15 * 0.49, 12) // on the beat
    expect(gain(0.49, 0.5, 1)).toBeCloseTo(1 + 0.25 * 0.49 + (0.15 * 0.49) / 16, 12) // off-beat: (1 - 0.5)^4
    expect(gain(0.5, 0.5, 1)).toBeCloseTo(1 + 0.25 * 0.5 + 0.15 * 0.5, 12) // off-beat 1/8 note: a full pulse
    expect(gain(1, 0.25, 1)).toBeCloseTo(1.25 + 0.15 / 16, 12) // between 1/8 notes
    expect(gain(1, 7, 1)).toBe(gain(1, 0, 1)) // only the phase counts
    expect(gain(1, 3.25, 1)).toBe(gain(1, 0.25, 1))
  })

  test('the drop flash peaks at 0.8 and decays with tau 0.2 s, whatever the heat', () => {
    expect(postFor(0, 0, 0, 0, 0)).toEqual({ gain: 1, flash: 0.8 })
    expect(postFor(1, 0.2, 0, 0, 0).flash).toBeCloseTo(0.8 / Math.E, 12)
    expect(postFor(0, 0.4, 0, 0, 0).flash).toBeCloseTo(0.8 / Math.E ** 2, 12)
    expect(postFor(0, -0.1, 0, 0, 0).flash).toBe(0) // not yet
  })

  test('WCAG 2.3.1: the strobe stays ≤ 3 flashes/s — 1/8 notes only while bpm/30 ≤ 3, else 1/4', () => {
    const offBeat = (bpm: number) => postFor(1, NONE, 0.5, bpm, 1).gain // full heat, off-beat: a full pulse iff on a 1/8 note
    expect(offBeat(60)).toBeCloseTo(1.25 + 0.15, 12) // eighths on: a pulse at phase 0.5
    expect(offBeat(90)).toBeCloseTo(1.25 + 0.15, 12) // at the bound: 90/30 = 3/s, still eighths
    expect(offBeat(91)).toBeCloseTo(1.25 + 0.15 / 16, 12) // 91/30 > 3: drops to 1/4, off-beat is a tail
    // the brief's case: 174 BPM full heat is 1/4 notes (2.9/s), not 5.8/s eighths
    expect(postFor(1, NONE, 0.5, 174, 1).gain).toBeCloseTo(1.25 + 0.15 / 16, 12)
    expect(postFor(1, NONE, 0, 174, 1).gain).toBeCloseTo(1.4, 12) // on-beat pulses at every 1/4 note regardless
  })

  test('caps hold and nothing is NaN, whatever comes in', () => {
    const odd = [NaN, Infinity, -Infinity, -1]
    for (const heat of [0, 0.3, 0.5, 1, 2, ...odd])
      for (const drop of [0, 0.1, 1, ...odd])
        for (const beat of [0, 0.25, 0.5, 0.99, 7, -3.5, ...odd])
          for (const bpm of [0, 90, 174, ...odd])
            for (const conf of [0, 0.3, 1, 5, ...odd]) {
              const p = postFor(heat, drop, beat, bpm, conf)
              expect(Number.isFinite(p.gain) && Number.isFinite(p.flash)).toBe(true)
              expect(p.gain).toBeGreaterThanOrEqual(1)
              expect(p.gain).toBeLessThanOrEqual(1.4 + 1e-12)
              expect(p.gain - postFor(heat, drop, beat, bpm, 0).gain).toBeLessThanOrEqual(0.15 + 1e-12) // the strobe's share
              expect(p.flash).toBeGreaterThanOrEqual(0)
              expect(p.flash).toBeLessThanOrEqual(0.8)
            }
  })
})
