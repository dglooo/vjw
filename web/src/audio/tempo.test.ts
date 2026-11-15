import { describe, expect, test } from 'vitest'
import { createAnalysis } from './analysis'
import { PRESETS, type Band } from './presets'
import { mix, pattern, SR, type Genre, type Stem } from './synth'
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

/** A synth.ts pattern's first 10 s through the worklet body into `src`, as app.ts feeds it. Drums and room tone by
 *  default; FULL adds the sub and reese beds. */
const fixtures = new Map<string, Float32Array>()
function listen(src: TempoSource, genre: Genre, bpm: number, stems: Stem[] = ['kick', 'snare', 'hats', 'room']) {
  const key = genre + bpm + stems.join() // pattern() synthesises the reese too: build each fixture once
  if (!fixtures.has(key)) fixtures.set(key, mix(pattern(genre, 8, bpm), stems))
  const x = fixtures.get(key)!
  const a = createAnalysis(SR)
  for (let f = 0; f + 128 <= 10 * SR; f += 128)
    a.block([x.subarray(f, f + 128)], f, (m) => (m.kind === 'onset' ? src.push(m) : m.kind === 'odf' && src.pushOdf(m.values, m.t0, m.hop)))
  return src.read()!
}
const ranged = (bpm: Band | null) => {
  const src = createTempoSource()
  src.setRange(bpm)
  return src
}
const { dnb, dubstep, techno } = { dnb: PRESETS.dnb.bpm!, dubstep: PRESETS.dubstep.bpm!, techno: PRESETS.techno.bpm! }
const FULL: Stem[] = ['kick', 'snare', 'hats', 'room', 'sub', 'reese']

describe('setRange and families (design C3)', () => {
  test.each([
    ['dnb', 174, dnb],
    ['dnb', 182, dnb],
    ['dubstep', 140, dubstep], // half-time: its one ACF peak is the 2-beat lag (70), the ½ octave
    ['techno', 128, techno],
  ] as const)('the %s pattern at %d BPM reads ±1 within 10 s under its range %j', (genre, bpm, range) => {
    const r = listen(ranged(range), genre, bpm)
    expect(Math.abs(r.bpm - bpm)).toBeLessThan(1) // DnB: never 87, 91, 116 or 121
    expect(r.confidence).toBeGreaterThan(0.8)
  })

  // S3.1b (the lead's Chrome check: dnb174.wav never locked). The old 4-bin bass flux read the beds' steady partials as
  // kick-sized flux: a flat ACF, DnB 150.4 / 0.08 here. The kick/snare transient ODF leaves the beds out.
  test.each([
    ['dnb', 174, dnb],
    ['dubstep', 140, dubstep],
    ['techno', 128, techno],
  ] as const)('the full %s mix (sub + reese) at %d BPM reads ±1 within 10 s under its range %j', (genre, bpm, range) => {
    const r = listen(ranged(range), genre, bpm, FULL)
    expect(Math.abs(r.bpm - bpm)).toBeLessThan(1)
    expect(r.confidence).toBeGreaterThan(0.8) // sync's LOCK is 0.3
  })

  // tempo.ts's null path on these fixtures, bit for bit (S3.1 captured the pre-S3.1 output; S3.1b re-captured DnB for its
  // ODF, dubstep and techno didn't move). The snare band gives the DnB two-step its beat, so Default reads 174 here
  // (the old ODF read the ⅔ lag, 116), and 182 folds to 91.
  test.each([
    ['dnb', 174, { bpm: 174.0141490894796, anchor: 9.624516469038214, confidence: 1 }],
    ['dnb', 182, { bpm: 90.95540852792173, anchor: 9.247315187376724, confidence: 0.875 }],
    ['dubstep', 140, { bpm: 140.00226266283093, anchor: 9.575295815295814, confidence: 1 }],
    ['techno', 128, { bpm: 127.73865560636462, anchor: 9.44758790179332, confidence: 1 }],
  ] as const)('null is today exactly: %s %d reads the golden, also after a range is cleared', (genre, bpm, golden) => {
    expect(listen(createTempoSource(), genre, bpm)).toEqual(golden)
    const src = ranged(dnb)
    src.setRange(null)
    expect(listen(src, genre, bpm)).toEqual(golden)
  })

  // T3′ acceptance: techno at its range's edges holds under Default (genre undecided), never a ⅔, 4/3 or octave lag.
  test.each([118, 135])('the techno pattern at %d BPM reads ±1 under Default, with sub + reese too', (bpm) => {
    for (const stems of [undefined, FULL]) expect(Math.abs(listen(createTempoSource(), 'techno', bpm, stems).bpm - bpm)).toBeLessThan(1)
  })

  test('setRange(null) restores a fresh source, bit for bit, also on the bare ACF (no onsets: the prior shapes the peak)', () => {
    const cleared = ranged(dnb)
    cleared.setRange(null)
    expect(feed(cleared, train(140, 8), 8, false)).toEqual(feed(createTempoSource(), train(140, 8), 8, false))
  })

  // 203.75: past the margin, so the fit steps out and the octave fold keeps it; its edge candidate is no local peak,
  // and an unclamped parabolic step there hung fold().
  test('DnB candidates: 147 and 195 (inside the ±10% margin) read as they are, 203.75 too; 116 and 140 are no candidate', () => {
    for (const bpm of [147, 195, 203.75]) expect(feed(ranged(dnb), train(bpm, 10), 10)!.bpm).toBeCloseTo(bpm, 1)
    for (const bpm of [116, 140]) {
      expect(feed(createTempoSource(), train(bpm, 10), 10)!.confidence).toBeGreaterThan(0.8) // Default locks on…
      expect(feed(ranged(dnb), train(bpm, 10), 10)!.confidence).toBeLessThan(0.2) // … the range finds no peak
    }
  })

  test('families: the ACF prominence per window and its octaves, the same whatever the active range', () => {
    expect(createTempoSource().families([dnb])).toEqual([0]) // no ACF yet
    const W = [dnb, dubstep, techno]
    const fams = (genre: Genre, bpm: number) => {
      const out = [null, dnb, dubstep, techno].map((range) => {
        const src = ranged(range)
        listen(src, genre, bpm)
        return src.families(W)
      })
      for (const f of out) expect(f).toEqual(out[0])
      return out[0]
    }
    // Each fixture lights its own window. The DnB window stays dim off DnB (dubstep 0.26), but the DnB two-step also
    // lights techno (its ⅔ lag, 116–121) and the ±10% windows overlap from techno to dubstep: T_g alone can't pick the
    // genre (S4.1).
    const [d174, d182, s140, t128] = [fams('dnb', 174), fams('dnb', 182), fams('dubstep', 140), fams('techno', 128)]
    expect([d174[0], d182[0], s140[1], t128[2]].every((v) => v > 0.8)).toBe(true)
    expect(s140[0]).toBeLessThan(0.3)
    expect(t128[0]).toBe(0)
  })

  // T1 (dsp_detector_2026-11-16 R2): a two-step's kick → kick lags (1.5 and 2.5 beats: 116 and 69.6 at 174) sit in the
  // techno and dubstep windows; DnB's own window only gets the kick → snare beat. Those windows get at most DnB's evidence.
  test('families: a two-step at 174 (kicks on 1 and the and-of-3, snares on 2 and 4) reads T_dnb ≥ T_dubstep, T_techno', () => {
    const b = 60 / 174
    const hits: Hit[] = []
    for (let t = 0.2; t < 10; t += 4 * b) for (const [k, odf] of [[0, 13], [1, 10], [2.5, 13], [3, 10]]) hits.push({ t: t + k * b, strength: 3.5, odf })
    const src = createTempoSource()
    feed(src, hits, 10)
    const [d, u, t] = src.families([dnb, dubstep, techno])
    expect(d).toBeGreaterThan(0.2) // measured .35; before T1 dubstep read .41 and techno .60
    expect(d).toBeGreaterThanOrEqual(u)
    expect(d).toBeGreaterThanOrEqual(t)
  })
})
