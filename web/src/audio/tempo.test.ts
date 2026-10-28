import { describe, expect, test } from 'vitest'
import { createTempoSource, type TempoSource } from './tempo'

const HOP = 256 / 48000 // the worklet's hop at 48 kHz

/** Seeded uniform [0, 1). */
const lcg = (seed: number) => () => (seed = (seed * 16807) % 2147483647) / 2147483647

interface Hit { t: number; strength: number; odf: number } // odf: its peak in the bass-band ODF

/**
 * A click train at `bpm` from 0.2 s: one kick per beat (strength 3.5). `jitter` (s, uniform ±), `drop` and
 * `spurious` (fractions of the clicks; spurious ones have little bass, like hats and noise); `offBeats`: a hit on every
 * off-beat as strong as the kicks but with little bass (hats, claps: the real detector fires on them at 4.0).
 */
function train(bpm: number, seconds: number, { jitter = 0, drop = 0, spurious = 0, offBeats = false, seed = 1 } = {}) {
  const rnd = lcg(seed)
  const hits: Hit[] = []
  for (let t = 0.2; t < seconds; t += 60 / bpm) {
    if (rnd() >= drop) hits.push({ t: t + (2 * rnd() - 1) * jitter, strength: 3.5, odf: 13 })
    if (offBeats) hits.push({ t: t + 30 / bpm, strength: 4, odf: 3.5 })
  }
  for (let i = Math.round((spurious * seconds * bpm) / 60); i > 0; i--) hits.push({ t: rnd() * seconds, strength: 3, odf: 3.5 })
  return hits.sort((a, b) => a.t - b.t)
}

/**
 * Feeds hits the way app.ts does: 8-hop ODF batches and the onsets in time order. The ODF mimics the worklet's bass
 * band on test tracks: an exponential floor (mean 1: one track then reads ACF prominence ~7, two non-beatmatched ones ~4.3, as
 * measured) plus each hit at its hop and 40% of it on the next (~13 + 5).
 */
function feed(src: TempoSource, hits: Hit[], seconds: number, onsets = true) {
  const rnd = lcg(99)
  const odf = Float32Array.from({ length: Math.ceil(seconds / HOP) + 8 }, () => -Math.log(1 - rnd()))
  for (const h of hits) {
    odf[Math.round(h.t / HOP)] += h.odf
    odf[Math.round(h.t / HOP) + 1] += 0.4 * h.odf
  }
  let next = 0
  for (let i = 0; i + 8 <= odf.length; i += 8) {
    for (; next < hits.length && hits[next].t <= (i + 7) * HOP; next++) if (onsets) src.push(hits[next])
    src.pushOdf(odf.subarray(i, i + 8), i * HOP, HOP)
  }
  return src.read()
}

/** Distance from `t` to the nearest beat of the grid `first + k · 60/bpm`, s. */
const offGrid = (t: number, bpm: number, first: number) => {
  const p = 60 / bpm
  const r = (((t - first) % p) + p) % p
  return Math.min(r, p - r)
}

describe('createTempoSource', () => {
  test('read() is null before data and until the first full window', () => {
    const src = createTempoSource()
    expect(src.read()).toBeNull()
    expect(feed(src, train(128, 5.9), 5.9)).toBeNull()
    expect(feed(createTempoSource(), train(128, 6.5), 6.5)).not.toBeNull()
  })

  test.each([120, 128, 140, 174])('%d BPM clicks → within ±0.05 BPM after 8 s, anchor on a click, confident', (bpm) => {
    const r = feed(createTempoSource(), train(bpm, 8), 8)!
    expect(Math.abs(r.bpm - bpm)).toBeLessThan(0.05) // the coarse ACF alone is off by up to ~0.4: the fit refines
    expect(offGrid(r.anchor, bpm, 0.2)).toBeLessThan(0.001)
    expect(r.confidence).toBeGreaterThan(0.8)
    expect(r.confidence).toBeLessThanOrEqual(1)
  })

  test('octaves: 174 stays 174 (not 87), 85 folds to 170, 200 to 100, 90 stays 90 (the fold edge)', () => {
    for (const [bpm, want] of [[174, 174], [85, 170], [200, 100], [90, 90]]) {
      expect(feed(createTempoSource(), train(bpm, 8), 8)!.bpm).toBeCloseTo(want, 1)
    }
  })

  test('the ACF alone (no onsets to fit) is within ±0.5 BPM: the parabolic peak, not the integer lag (140 → 140.6)', () => {
    expect(Math.abs(feed(createTempoSource(), train(140, 8), 8, false)!.bpm - 140)).toBeLessThan(0.5)
  })

  test('3 ms jitter, 10% dropped and 10% spurious onsets → within ±0.5 BPM, anchor within 10 ms of a beat', () => {
    for (const seed of [1, 2, 3]) {
      const r = feed(createTempoSource(), train(128, 12, { jitter: 0.003, drop: 0.1, spurious: 0.1, seed }), 12)!
      expect(Math.abs(r.bpm - 128)).toBeLessThan(0.5)
      expect(offGrid(r.anchor, 128, 0.2)).toBeLessThan(0.01)
    }
  })

  test('strong off-beat onsets (hats, claps) neither move the phase nor cost confidence', () => {
    const r = feed(createTempoSource(), train(128, 12, { offBeats: true }), 12)!
    expect(Math.abs(r.bpm - 128)).toBeLessThan(0.05)
    expect(offGrid(r.anchor, 128, 0.2)).toBeLessThan(0.001)
    expect(r.confidence).toBeGreaterThan(0.8) // a per-onset share would read 0.5
  })

  test('an off-beat onset never stands in for a missing kick', () => {
    const kicks = train(128, 12, { drop: 0.25 })
    const hats = kicks.map((h) => ({ t: h.t + 30 / 128, strength: 4, odf: 0 })) // onsets only: the ODF stays the same
    const without = feed(createTempoSource(), kicks, 12)!.confidence
    expect(without).toBeLessThan(0.9) // a quarter of the beats lost their kick
    expect(feed(createTempoSource(), [...kicks, ...hats].sort((a, b) => a.t - b.t), 12)!.confidence).toBe(without)
  })

  test('arrhythmic strong onsets (random times, matching ODF) → confidence < 0.2', () => {
    const rnd = lcg(11)
    const hits = Array.from({ length: 40 }, () => ({ t: rnd() * 12, strength: 3.5, odf: 13 })).sort((a, b) => a.t - b.t)
    expect(feed(createTempoSource(), hits, 12)!.confidence).toBeLessThan(0.2) // no ACF peak, though ~40% of beats catch one
  })

  test('a non-beatmatched second kick train (128 + 133) keeps a tempo but drops the confidence below the director θ (0.6)', () => {
    const other = train(133, 12, { offBeats: true, seed: 2 }).map((h) => ({ ...h, t: h.t + 0.17 }))
    const mix = [...train(128, 12, { offBeats: true }), ...other].sort((a, b) => a.t - b.t) // two tracks: kick + off-beat bass
    const r = feed(createTempoSource(), mix, 12)!
    expect([128, 133].some((bpm) => Math.abs(r.bpm - bpm) < 0.5)).toBe(true)
    expect(r.confidence).toBeLessThan(0.6) // each alone reads 1: the ACF prominence halves, every beat still has a kick
  })

  test('silence → confidence < 0.2; a noise ODF without strong onsets too', () => {
    expect(feed(createTempoSource(), [], 8)!.confidence).toBeLessThan(0.2)
    const noise = createTempoSource()
    const rnd = lcg(5)
    for (let i = 0; i < 1500; i += 8) noise.pushOdf(Float32Array.from({ length: 8 }, rnd), i * HOP, HOP)
    expect(noise.read()!.confidence).toBeLessThan(0.2)
  })
})
