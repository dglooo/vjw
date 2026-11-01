import { describe, expect, test } from 'vitest'
import { snapOctave } from './presets'
import { createSync, type Sync } from './sync'
import type { TempoReading } from './tempo'

const P = 60 / 128

/** A TempoSource stub: `set` publishes a new reading object, which read() returns until the next `set`. */
function stub() {
  let r: TempoReading | null = null
  return { push() {}, pushOdf() {}, setRange() {}, families: () => [], read: () => r, set: (x: TempoReading) => void (r = { ...x }) }
}
type Controller = ReturnType<typeof createSync>

/** Beat times k·p + phase in [from, to). */
function grid(from: number, to: number, p = P, phase = 0) {
  const out: number[] = []
  for (let k = Math.ceil((from - phase) / p - 1e-9); k * p + phase < to; k++) out.push(k * p + phase)
  return out
}

/** Calls at() at 60 fps over [t0, t1), feeding each onset when its time comes; returns a copy of every frame. */
function run(s: Controller, t0: number, t1: number, onsets: number[] = [], each?: (t: number) => void) {
  const frames: (Sync & { t: number })[] = []
  let i = onsets.findIndex((x) => x >= t0)
  if (i < 0) i = onsets.length
  for (let f = Math.round(t0 * 60); f < t1 * 60; f++) {
    const t = f / 60
    for (; i < onsets.length && onsets[i] <= t; i++) s.feed({ t: onsets[i], strength: 4 })
    each?.(t)
    frames.push({ t, ...s.at(t) })
  }
  return frames
}

/** Phase error of the grid at time t against a beat there, ms. */
const offMs = (s: Controller, t: number) => {
  const { beat, bpm } = s.at(t)
  return ((beat - Math.round(beat)) * 60000) / bpm
}

/** A controller locked by a reading (bpm, anchor 0, confidence) at t = 0. */
function locked(bpm = 128, confidence = 0.9) {
  const src = stub()
  const s = createSync(src)
  src.set({ bpm, anchor: 0, confidence })
  s.at(0)
  return { s, src }
}

describe('grid and manual controls', () => {
  test('at(): fract 0 at the anchor, 0.5 half a period later; no grid gives ZERO_SYNC', () => {
    const src = stub()
    const s = createSync(src)
    expect(s.at(5)).toEqual({ bpm: 0, beat: 0, bar: 0, confidence: 0 })
    src.set({ bpm: 120, anchor: 10, confidence: 0.2 }) // below LOCK: no grid
    expect(s.at(10).bpm).toBe(0)
    src.set({ bpm: 120, anchor: 10, confidence: 0.9 })
    expect(s.at(10)).toMatchObject({ bpm: 120, beat: 0, bar: 0 })
    expect(s.at(10.25).beat).toBeCloseTo(0.5, 9)
    expect(s.at(12).bar).toBeCloseTo(1, 9)
  })

  test('tap ×4 at 500 ms → 120 BPM, anchor = last tap, confidence → 1; the median ignores one stray tap', () => {
    const s = createSync(stub())
    for (const t of [1, 1.5, 2, 2.5]) s.tap(t)
    expect(s.at(2.5)).toMatchObject({ bpm: 120 })
    expect(s.at(2.75).beat % 1).toBeCloseTo(0.5, 9)
    expect(run(s, 2.75, 5).at(-1)!.confidence).toBeGreaterThan(0.95)
    for (const t of [10, 10.5, 11, 11.5, 12.2]) s.tap(t) // a 2 s pause restarts the count; the late tap is outvoted
    expect(s.at(12.2).bpm).toBeCloseTo(120, 9) // the mean would say 109
    expect(s.at(12.2).beat % 1).toBeCloseTo(0, 9)
    for (const t of [20, 20.4, 20.8]) s.tap(t) // a new count at 150: the 120 taps before the pause don't vote
    expect(s.at(20.8).bpm).toBeCloseTo(150, 9)
  })

  test('a tap is sure even after the source has seen no rhythm for a long while', () => {
    const src = stub()
    const s = createSync(src)
    src.set({ bpm: 100, anchor: 0, confidence: 0.1 }) // ambience: weak since 0, no grid
    run(s, 0, 20)
    for (const t of [20, 20.5, 21, 21.5]) s.tap(t)
    expect(run(s, 21.5, 23).at(-1)!.confidence).toBeGreaterThan(0.9) // not 1 − 0.05 · (bars since 0)
  })

  test('double/halve go on counting from the beat under the last time seen; downbeat marks bar 1', () => {
    const s = createSync(stub())
    for (const t of [1, 1.5, 2, 2.5]) s.tap(t) // 120 BPM, a beat every half second
    const far = s.at(10).beat // 15 beats on
    s.double()
    expect(s.at(10)).toMatchObject({ bpm: 240, beat: far }) // not 15 beats more: the count isn't redone from the tap
    const b = s.at(11).beat // now the last time seen
    expect(b - far).toBeCloseTo(4, 9)
    s.halve()
    s.halve()
    expect(s.at(11)).toMatchObject({ bpm: 60, beat: b })
    expect(s.at(12).beat - b).toBeCloseTo(1, 9)
    s.downbeat(12.99) // 10 ms early on the beat at 13
    expect(s.at(13).bar % 1).toBeCloseTo(0, 9)
    expect(s.at(17).bar - s.at(13).bar).toBeCloseTo(1, 9) // 4 beats at 60 BPM
    expect(s.at(14).bar % 1).toBeCloseTo(0.25, 9)
  })

  test('nudge shifts the shown grid and stays put while the PLL keeps the grid on the kicks', () => {
    const { s } = locked()
    run(s, 0, 4 * P, grid(P, 4 * P))
    s.nudge(10) // the grid 10 ms later
    run(s, 4 * P, 20 * P, grid(4 * P, 20 * P))
    expect(offMs(s, 20 * P + 0.01)).toBeCloseTo(0, 1)
    s.nudge(-20)
    expect(offMs(s, 20 * P - 0.01)).toBeCloseTo(0, 1)
  })
})

describe('PLL', () => {
  test('onsets 20 ms late for 8 beats → the grid moves ≥ 15 ms toward them, the period ≤ 0.5%', () => {
    const { s } = locked()
    run(s, 0, 8 * P + 0.05, grid(P, 8.5 * P, P, 0.02))
    expect(Math.abs(offMs(s, 8 * P + 0.02))).toBeLessThan(5)
    expect(Math.abs(s.at(8 * P + 0.05).bpm / 128 - 1)).toBeLessThan(0.005)
  })

  test('1 BPM of period error with onsets on the true grid → within ±0.1 BPM in 16 beats, and it stays', () => {
    for (const start of [127, 129]) {
      const { s } = locked(start)
      const frames = run(s, 0, 40 * P, grid(P, 40 * P))
      for (const f of frames.filter((x) => x.t > 16.5 * P)) expect(Math.abs(f.bpm - 128)).toBeLessThan(0.1)
    }
  })

  test('the period term divides by the beats since the last correction: a phase offset after a break is no tempo change', () => {
    const { s } = locked()
    run(s, 0, 8 * P + 0.1, grid(P, 8.5 * P))
    run(s, 8 * P + 0.1, 41 * P, [40 * P + 0.02]) // 32 beats without onsets, then one 20 ms late
    expect(Math.abs(s.at(41 * P).bpm - 128)).toBeLessThan(0.02) // undivided, the same onset shifts it 0.16 BPM
  })

  test('off-beat onsets (hats) never move the grid, and a hat-only break holds it', () => {
    const { s } = locked()
    const kicks = grid(P, 16 * P)
    const hats = grid(P, 48 * P, P, P / 2)
    run(s, 0, 48 * P, [...kicks, ...hats, ...grid(32 * P, 48 * P)].sort((a, b) => a - b))
    expect(Math.abs(offMs(s, 47 * P))).toBeLessThan(1)
    expect(s.at(47 * P).bpm).toBeCloseTo(128, 6)
  })
})

describe('hold, confidence and hysteresis', () => {
  test('an 8-bar break: the grid runs on, confidence decays slowly; back on the beat; 16+ bars → bpm 0', () => {
    const { s, src } = locked()
    const p = 60 / 128.5 // the music runs 0.5 BPM fast: the PLL has to have tracked it before the break
    run(s, 0, 64 * p, grid(p, 64 * p, p))
    const before = s.at(64 * p).confidence
    const gap = run(s, 64 * p, 96 * p, [], (t) => {
      const weak = { bpm: 128.5, anchor: 76 * p, confidence: 0.1 } // agrees, but in a hold a weak reading is no news
      if (t === Math.round(80 * p * 60) / 60) src.set(weak)
    })
    expect(gap.every((f) => f.bpm > 0)).toBe(true)
    expect(gap.at(-1)!.confidence).toBeLessThan(before - 0.2) // 0.05 a bar after the first: 0.9 → ≈0.54
    expect(gap.at(-1)!.confidence).toBeGreaterThan(0.45)
    const b = s.at(96 * p).beat
    expect(Math.abs(b - Math.round(b))).toBeLessThan(1 / 8) // the first kick back lands on the grid
    s.feed({ t: 96 * p, strength: 4 })
    expect(run(s, 96 * p, 160 * p - 0.01).every((f) => f.bpm > 0)).toBe(true) // 16 bars without onsets: still held …
    expect(run(s, 160 * p, 162 * p).at(-1)!.bpm).toBe(0) // … then dropped
  })

  test('weak readings (a hat-only break) neither move the tempo nor drop the confidence at once: it decays like a hold', () => {
    const { s, src } = locked(128, 0.9)
    run(s, 0, 8, grid(P, 8))
    const weak = (t: number) => src.set({ bpm: 131, anchor: Math.round(t / P) * P, confidence: 0.1 }) // agrees, barely sure
    const frames = run(s, 8, 8 + 32 * P, grid(8, 8 + 32 * P), weak) // 8 bars, the grid still hit on every beat
    expect(frames.at(-1)!.bpm).toBeCloseTo(128, 2)
    expect(frames.find((f) => f.t > 8 + 4 * P)!.confidence).toBeGreaterThan(0.85) // the first bar is free
    expect(frames.at(-1)!.confidence).toBeLessThan(0.6) // then 0.05 a bar: 0.9 → ≈0.55
    expect(frames.at(-1)!.confidence).toBeGreaterThan(0.5)
    src.set({ bpm: 128, anchor: 8 + 32 * P, confidence: 0.95 }) // the kick is back
    expect(run(s, 8 + 32 * P, 8 + 36 * P, grid(8 + 32 * P, 8 + 36 * P)).at(-1)!.confidence).toBeGreaterThan(0.9)
  })

  test('confidence is smoothed over one beat: a step 1 → 0 crosses 0.4 between 0.9 and 1.1 beats', () => {
    const { s, src } = locked(120, 1)
    run(s, 0, 10, grid(0.5, 10, 0.5))
    src.set({ bpm: 120, anchor: 10.25, confidence: 1 }) // a sure rival half a beat off: the target drops to 0 at once
    const frames = run(s, 10, 11, grid(10, 11, 0.5))
    const crossed = frames.find((f) => f.confidence < 0.4)!.t - (10 - 1 / 60) // the frame at 10 already decays
    expect(crossed).toBeGreaterThan(0.9 * 0.5)
    expect(crossed).toBeLessThan(1.1 * 0.5)
  })

  test('a competing grid half a beat off: 4 beats → no re-anchor, 8 beats → re-anchor, confidence low meanwhile', () => {
    for (const [beats, moved] of [[4, false], [9, true]] as const) {
      const { s, src } = locked(120)
      run(s, 0, 8, grid(0.5, 8, 0.5))
      const off = 8 + 0.25 // the other grid: half a beat later
      const rival = (t: number) => src.set({ bpm: 120, anchor: off + Math.floor((t - off) / 0.5) * 0.5, confidence: 0.9 })
      run(s, 8, 8 + beats * 0.5, grid(8, 8 + beats * 0.5, 0.5, 0.25), rival)
      expect(s.at(8 + beats * 0.5).confidence).toBeLessThan(0.6)
      const end = 8 + beats * 0.5 + 4
      run(s, 8 + beats * 0.5, end, grid(8 + beats * 0.5, end, 0.5, moved ? 0.25 : 0))
      expect(Math.abs(offMs(s, end + (moved ? 0.25 : 0)))).toBeLessThan(5)
    }
  })

  test('a confident reading at a new tempo replaces the grid after 8 of its beats, numbering on (no jump > ½ beat)', () => {
    const { s, src } = locked(128)
    run(s, 0, 10, grid(P, 10))
    const q = 60 / 140
    const frames = run(s, 10, 16, grid(10.1, 16, q, 10.1), (t) => {
      if (Math.round(t * 60) % 10) return
      src.set({ bpm: 140, anchor: 10.1 + Math.floor((t - 10.1) / q) * q, confidence: 0.9 }) // ≈6 readings a second
    })
    const switched = frames.find((f) => Math.abs(f.bpm - 140) < 1)!
    expect(switched.t - 10).toBeGreaterThan(8 * q)
    expect(switched.t - 10).toBeLessThan(8 * q + 0.2)
    const i = frames.indexOf(switched)
    expect(Math.abs(switched.beat - frames[i - 1].beat - 1 / (60 * q))).toBeLessThan(0.5)
    expect(frames.slice(30, i).every((f) => f.confidence < 0.6)).toBe(true) // no confident wrong grid while it waits
    expect(Math.abs(offMs(s, 15.9 - ((15.9 - 10.1) % q)))).toBeLessThan(5)
  })

  test('rival readings that keep changing (an overlap the source flips on) never replace the grid', () => {
    const { s, src } = locked(128)
    run(s, 0, 10, grid(P, 10))
    let flip = false
    run(s, 10, 10 + 16 * P, grid(10, 10 + 16 * P), (t) => {
      if (Math.round(t * 60) % 10) return
      flip = !flip
      src.set({ bpm: flip ? 133 : 123, anchor: t - 0.1, confidence: 0.9 })
    })
    expect(s.at(10 + 16 * P).bpm).toBeCloseTo(128, 1)
  })

  test('×2 and ÷2 stick: readings at the other octave keep refining the tempo instead of undoing it', () => {
    const { s, src } = locked(128)
    s.double()
    run(s, 0, 8, grid(P / 2, 8, P / 2), (t) => src.set({ bpm: 128.6, anchor: Math.floor(t / P) * P, confidence: 0.9 }))
    expect(s.at(8).bpm).toBeGreaterThan(256.2) // 2 × the readings' 128.6, pulled from 256
    expect(s.at(8).bpm).toBeLessThan(258)
  })
})

describe('snapOctave', () => {
  const dnb: [number, number] = [160, 185] // PRESETS.dnb.bpm

  test('below the band doubles, above it halves, inside it stays', () => {
    expect(snapOctave(77, dnb)).toBe('double')
    expect(snapOctave(159.9, dnb)).toBe('double')
    expect(snapOctave(200, dnb)).toBe('halve')
    expect(snapOctave(370, dnb)).toBe('halve')
    expect(snapOctave(174, dnb)).toBe('none')
  })

  test('the bounds are inclusive: sitting exactly on lo or hi is inside', () => {
    expect(snapOctave(160, dnb)).toBe('none')
    expect(snapOctave(185, dnb)).toBe('none')
  })

  test('one step only: a ⅔-lag reading (116 vs 174) doubles, not walks', () => {
    expect(snapOctave(116, dnb)).toBe('double')
    expect(snapOctave(91, dnb)).toBe('double') // 182/2 is still below lo: one double, the relock settles the rest
  })
})
