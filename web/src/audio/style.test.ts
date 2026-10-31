import { describe, expect, test } from 'vitest'
import { PRESETS, type Genre } from './presets'
import { createStyle, type StyleIn, type StyleOpts, type StyleOut } from './style'
import { crossfade, GROOVES, rng, type Groove } from './synth'

const GENRES = ['dnb', 'dubstep', 'techno'] as const satisfies readonly Genre[]
const FPS = 8 // dt = 0.125 s is exact in binary, so switch times are exact too
const per = (f: (g: Genre) => number): Record<Genre, number> => ({ dnb: f('dnb'), dubstep: f('dubstep'), techno: f('techno') })

/** Idealised tempo.families (S3.1 owns the real one): 1 when bpm ×{½, 1, 2} lies in a genre's window ±10% (design C3),
 *  0.5 when only ×⅔ or ×4/3 does (the 1.5-beat kick gap of a two-step: DnB 174 → 116), else 0. */
const families = (bpm: number) =>
  per((g) => {
    const [lo, hi] = PRESETS[g].bpm!
    const hit = (ks: number[]) => ks.some((k) => bpm * k >= lo / 1.1 && bpm * k <= hi * 1.1)
    return hit([0.5, 1, 2]) ? 1 : hit([2 / 3, 4 / 3]) ? 0.5 : 0
  })

/** A groove's steady classifier inputs: its 16th steps counted per beat (4 a bar), its tempo's families. */
const feats = (g: Groove): StyleIn => ({ families: families(g.bpm), kickPerBeat: g.kick.length / 4, hatsPerBeat: g.hats.length / 4, wobble: g.wobble, bass: g.bass, freeze: false })

/** Mid-crossfade every input is the energy-weighted mix (w = b's share): windowed counts and ACF peaks scale with it. */
function blend(a: StyleIn, b: StyleIn, w: number): StyleIn {
  const l = (p: number, q: number) => p + (q - p) * w
  return { families: per((g) => l(a.families[g], b.families[g])), kickPerBeat: l(a.kickPerBeat!, b.kickPerBeat!), hatsPerBeat: l(a.hatsPerBeat!, b.hatsPerBeat!), wobble: l(a.wobble, b.wobble), bass: l(a.bass, b.bass), freeze: false }
}

/** Seeded noise on every input, held 1 s at a time: 8 s windows and ACF peaks drift slowly (frame noise averages out). */
function jitter(x: (t: number) => StyleIn, seed: number) {
  const r = rng(seed)
  const d = (amp: number) => amp * (2 * r() - 1)
  let sec = -1
  let n = { T: per(() => 0), k: 0, h: 0, w: 0, b: 0 }
  return (t: number): StyleIn => {
    if (Math.floor(t) !== sec) [sec, n] = [Math.floor(t), { T: per(() => d(0.2)), k: d(0.15), h: d(0.5), w: d(0.15), b: d(0.1) }]
    const v = x(t)
    const p = (a: number, e: number) => Math.max(0, a + e)
    return { families: per((g) => p(v.families[g], n.T[g])), kickPerBeat: p(v.kickPerBeat!, n.k), hatsPerBeat: p(v.hatsPerBeat!, n.h), wobble: p(v.wobble, n.w), bass: p(v.bass, n.b), freeze: v.freeze }
  }
}

/** One classifier at 8 fps: `to(end, input)` plays on until `end` s and returns the last (reused) output; `log` keeps
 *  every switch as [t, genre]; `each` sees every frame. */
function sim(opts?: Partial<StyleOpts>) {
  const s = createStyle(opts)
  const log: [t: number, to: Genre | null][] = []
  let i = 0
  let out: StyleOut | undefined
  return {
    log,
    to(end: number, input: (t: number) => StyleIn, each?: (o: StyleOut, t: number) => void) {
      for (; i <= end * FPS; i++) {
        out = s.update(input(i / FPS), i / FPS)
        each?.(out, i / FPS)
        if (out.detected !== (log.length ? log[log.length - 1][1] : null)) log.push([i / FPS, out.detected])
      }
      return out!
    },
  }
}

/** Features off every prototype (match = 0, so S_g = T_g/2 exactly): the tempo evidence alone dials each score. */
const lever = (T: Partial<Record<Genre, number>>, freeze = false): StyleIn => ({ families: per((g) => T[g] ?? 0), kickPerBeat: null, hatsPerBeat: null, wobble: 99, bass: 99, freeze })

describe('genres on the fixtures (spec §4.3)', () => {
  test('crossfade: equal power over 16 bars (32 s at 120 BPM)', () => {
    const xf = crossfade(10, 16, 120)
    for (const [t, a, b] of [[0, 1, 0], [10, 1, 0], [26, Math.SQRT1_2, Math.SQRT1_2], [42, 0, 1], [99, 0, 1]]) {
      expect(xf(t)[0], `a at ${t}`).toBeCloseTo(a, 12)
      expect(xf(t)[1], `b at ${t}`).toBeCloseTo(b, 12)
    }
  })

  test.each(GENRES.flatMap((g) => [0, 1].map((v) => [g, v] as const)))('%s groove %i: detected within 20 s, then never flips under noise (4 min)', (g, v) => {
    const m = sim()
    m.to(240, jitter(() => feats(GROOVES[g][v]), 7 + v))
    expect(m.log).toHaveLength(1)
    expect(m.log[0][1]).toBe(g)
    expect(m.log[0][0]).toBeLessThanOrEqual(20)
  })

  test('tempo is necessary: a perfect DnB pattern outside the DnB tempo windows is never DnB', () => {
    const m = sim()
    m.to(120, () => ({ families: per((g) => (g === 'dnb' ? 0 : 1)), ...PRESETS.dnb.proto!, freeze: false }))
    expect(m.log.length).toBeGreaterThan(0)
    expect(m.log.map(([, g]) => g)).not.toContain('dnb')
  })

  test.each(GENRES.flatMap((a) => GENRES.filter((b) => b !== a).map((b) => [a, b] as const)))('a 16-bar crossfade %s → %s switches once, ≥ the dwell after the new genre leads, and ends on it', (a, b) => {
    for (const [va, vb] of [[0, 0], [0, 1], [1, 0], [1, 1]] as const) {
      const [A, B, bpm] = [feats(GROOVES[a][va]), feats(GROOVES[b][vb]), GROOVES[b][vb].bpm]
      const xf = crossfade(60, 16, bpm)
      const m = sim()
      let led = Infinity // first frame b's score leads a's by the margin
      m.to(60 + (16 * 240) / bpm + 60, jitter((t) => blend(A, B, xf(t)[1] ** 2), 11 + va + 2 * vb), (o, t) => {
        if (led === Infinity && o.scores[b] - o.scores[a] >= 0.15) led = t
      })
      expect(m.log.map(([, g]) => g), `groove ${va} → ${vb}`).toEqual([a, b])
      expect(m.log[1][0] - led, `groove ${va} → ${vb}`).toBeGreaterThanOrEqual(16)
    }
  })
})

describe('freeze (silence, sparse sections)', () => {
  // A DnB breakdown can read like dubstep: no kick, a half-time snare roll lighting 140-ish lags, a filtered reese.
  const breakdown = (freeze: boolean): StyleIn => ({ families: { dnb: 0.3, dubstep: 1, techno: 0.3 }, kickPerBeat: 0, hatsPerBeat: null, wobble: 0.7, bass: 0.8, freeze })

  test('a 32-bar breakdown switches nothing while frozen (and would, unfrozen)', () => {
    for (const freeze of [true, false]) {
      const m = sim()
      const dnb = jitter(() => feats(GROOVES.dnb[0]), 3)
      m.to(60, dnb)
      m.to(60 + (32 * 240) / 174, () => breakdown(freeze))
      m.to(200, dnb)
      expect(m.log.map(([, g]) => g)).toEqual(freeze ? ['dnb'] : ['dnb', 'dubstep', 'dnb'])
    }
  })

  test('silence: frozen, every score holds exactly; unfrozen (no beat, a 0/0 bass share) the genre stays and scores stay finite', () => {
    const silence = (freeze: boolean): StyleIn => ({ families: per(() => 0), kickPerBeat: null, hatsPerBeat: null, wobble: 0, bass: NaN, freeze })
    const techno = jitter(() => feats(GROOVES.techno[0]), 5)
    const m = sim()
    const before = { ...m.to(60, techno).scores }
    expect(m.to(90, () => silence(true)).scores).toEqual(before)
    expect(Object.values(m.to(150, () => silence(false)).scores).every((v) => Number.isFinite(v) && v < 0.35)).toBe(true)
    m.to(210, techno)
    expect(m.log.map(([, g]) => g)).toEqual(['techno'])
  })

  test('frozen time counts for neither the dwell nor the min-hold', () => {
    const m = sim({ tau: 1e-6 })
    m.to(20, () => lever({ dnb: 1 })) // picked at 16.125
    m.to(30, () => lever({ dnb: 1, dubstep: 2 })) // 9.875 s of dwell, 13.875 s of hold
    m.to(90, () => lever({ dnb: 1, dubstep: 2 }, true))
    m.to(120, () => lever({ dnb: 1, dubstep: 2 })) // the hold ends 18.125 s after the freeze
    expect(m.log).toEqual([[16.125, 'dnb'], [108.125, 'dubstep']])
  })
})

describe('no-flap knobs (design C4)', () => {
  test('scores are a dt-based EMA with τ 4 s', () => {
    expect(sim().to(4, () => lever({ dnb: 1 })).scores.dnb).toBeCloseTo(0.5 * (1 - Math.exp(-1)), 9)
  })

  // tau → 0 from here on: the scores jump to S_g, so every switch time below is exact.
  test('a challenger leads by 0.15 for 16 unbroken s (its own); 32 s min-hold; the first pick waits only for its dwell', () => {
    const m = sim({ tau: 1e-6 })
    m.to(20, () => lever({ dnb: 1 })) // S 0.5
    m.to(40, () => lever({ dnb: 1, dubstep: 1.26 })) // leads by 0.13: never
    m.to(50, () => lever({ dnb: 1, dubstep: 1.34 })) // by 0.17: 9.875 s of dwell...
    m.to(52, () => lever({ dnb: 1, dubstep: 1 })) // ...broken by a dip
    m.to(60, () => lever({ dnb: 1, dubstep: 1.34 })) // 7.875 s, then another genre takes the lead
    m.to(80, () => lever({ dnb: 1, dubstep: 1.34, techno: 1.36 })) // techno by 0.18, its own dwell from 60.125
    m.to(140, () => lever({ dubstep: 2 })) // dwell done at 96.125, but the hold runs to 76.125 + 32
    expect(m.log).toEqual([[16.125, 'dnb'], [76.125, 'techno'], [108.125, 'dubstep']])
  })

  test('floor 0.35: a weaker leader is never picked, nor unseats the current genre; confidence = its score', () => {
    const m = sim({ tau: 1e-6 })
    expect(m.to(30, () => lever({ dnb: 0.68 })).confidence).toBe(0) // S 0.34
    expect(m.to(60, () => lever({ dnb: 0.72 })).confidence).toBeCloseTo(0.36, 12)
    expect(m.to(200, () => lever({ dubstep: 0.68 })).confidence).toBe(0) // leads dnb by 0.34, but under the floor
    expect(m.log).toEqual([[46.125, 'dnb']])
  })
})

describe('score S_g = T_g·(0.5 + 0.5·match_g)', () => {
  test('match: the mean Gaussian closeness of the known features to the prototype (σ: K 0.25, H 1.5, W 0.25, B 0.2)', () => {
    const p = PRESETS.dnb.proto!
    const S = (x: Partial<StyleIn>, T = 1) => sim({ tau: 1e-6 }).to(0.125, () => ({ families: per((g) => (g === 'dnb' ? T : 0)), ...p, freeze: false, ...x })).scores.dnb
    const off = 0.5 + 0.5 * ((3 + Math.exp(-0.5)) / 4) // one feature 1σ off
    expect(S({})).toBeCloseTo(1, 12)
    expect(S({}, 0.6)).toBeCloseTo(0.6, 12)
    expect(S({ kickPerBeat: p.kickPerBeat + 0.25 })).toBeCloseTo(off, 12)
    expect(S({ hatsPerBeat: p.hatsPerBeat - 1.5 })).toBeCloseTo(off, 12)
    expect(S({ wobble: p.wobble + 0.25 })).toBeCloseTo(off, 12)
    expect(S({ bass: p.bass - 0.2 })).toBeCloseTo(off, 12)
    expect(S({ kickPerBeat: null, hatsPerBeat: null, bass: NaN })).toBeCloseTo(1, 12) // unknown features don't count
    expect(S({ kickPerBeat: null, hatsPerBeat: null, wobble: 99, bass: NaN })).toBeCloseTo(0.5, 12)
  })
})
