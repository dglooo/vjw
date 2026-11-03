import { describe, expect, test } from 'vitest'
import { flashGate, postFor, type FlashState } from './post'

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

describe('flashGate', () => {
  const FPS = 60
  const ph = (k: number, r: number) => ((k * r) % FPS) / FPS // frame k's phase at r flashes/s, exact
  const saw = (r: number) => (k: number) => 0.65 * (1 - ph(k, r)) // own/strobe's bool binding at conf 1 (strobe.fs:12)
  const kick = (r: number) => (k: number) => 0.9 * Math.exp(-ph(k, r) / r / 0.1) // own/flash's float, release 0.1 (flash.fs:12)
  const fresh = (): FlashState => ({ prev: 0, blocked: false })
  const run = (raw: (k: number) => number, secs = 3) => {
    const s = fresh()
    const onsets: number[] = []
    return Array.from({ length: secs * FPS }, (_, k) => flashGate(raw(k), s, onsets, k / FPS))
  }
  const before = (out: number[], k: number) => (k ? out[k - 1] : 0) // the state starts at 0
  const rises = (out: number[]) => out.flatMap((y, k) => (y >= 0.5 && before(out, k) < 0.5 ? [k / FPS] : []))
  const maxPerSecond = (ts: number[]) => Math.max(...ts.map((t) => ts.filter((u) => u >= t && u - 1 <= t).length)) // closed [t, t + 1]
  const climbs = (out: number[]) => out.filter((y, k) => y > before(out, k)).length

  // at 4/s the allowed stamps are 0 .25 .5 1.25 1.5 1.75 2.5 2.75 (at t = 1, stamp 0 is still in the closed window)
  test.each([[1, 3], [4, 8], [10, 9]])('at %i/s: ≤ 3 onsets in any 1 s, %i allowed over 3 s, the only climbs', (r, n) => {
    for (const sig of [saw, kick]) {
      const out = run(sig(r))
      expect(rises(out)).toHaveLength(n)
      expect(maxPerSecond(rises(out))).toBeLessThanOrEqual(3)
      expect(climbs(out)).toBe(n) // the output rises only through an allowed onset: a blocked float never creeps up
    }
  })

  test('under the cap it is the identity', () => {
    for (const raw of [saw(1), saw(2), kick(1), kick(2)]) expect(run(raw)).toEqual(Array.from({ length: 3 * FPS }, (_, k) => raw(k)))
  })

  test('one budget for every flash: a second layer is refused once the first spends it', () => {
    const [a, b] = [fresh(), fresh()]
    const onsets: number[] = []
    const raw = saw(4)
    const A: number[] = []
    const B: number[] = []
    for (let k = 0; k <= FPS; k++) {
      A.push(flashGate(raw(k), a, onsets, k / FPS))
      B.push(flashGate(raw(k), b, onsets, k / FPS))
    }
    expect([A[0], B[0]]).toEqual([0.65, 0.65]) // t = 0: both allowed
    expect(A[15]).toBe(0.65) // t = 0.25: A takes the third slot …
    expect(Math.max(...B.slice(15))).toBeLessThan(0.5) // … B is refused there and stays dark through t = 1
    expect(rises(A).length + rises(B).length).toBe(3)
  })

  test('NaN reads 0; a refusal holds until the raw falls under 0.5, then the next onset counts', () => {
    const s = fresh()
    const onsets = [0, 0, 0] // the budget is spent at t = 0
    expect(flashGate(NaN, s, onsets, 0)).toBe(0)
    expect(s).toEqual({ prev: 0, blocked: false })
    expect(flashGate(0.9, s, onsets, 0.5)).toBe(0) // refused
    expect(s.blocked).toBe(true)
    expect(flashGate(0.9, s, onsets, 1.5)).toBe(0) // still on, the budget free again: no late leak
    expect(flashGate(NaN, s, onsets, 1.6)).toBe(0) // under 0.5: clears
    expect(s.blocked).toBe(false)
    expect(flashGate(0.9, s, onsets, 1.7)).toBe(0.9) // the next onset, counted
    expect(onsets).toEqual([1.7])
  })
})
