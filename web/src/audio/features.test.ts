import { describe, expect, test } from 'vitest'
import { SOURCE_IDS, type Sources } from '../bind'
import { createAnalysis } from './analysis'
import type { Drum, Hit } from './drums'
import { createFeatures } from './features'
import type { WorkletMsg } from './onset.worklet'
import { PRESETS, type Preset } from './presets'
import { workletBands, type AudioSettings, type CustomBand } from './settings'
import { mix, pattern, reese, SR, sub, wobble } from './synth'

const DRUMS: Drum[] = ['kick', 'snare', 'hats']
const settings = (sens: Record<string, number> = {}): AudioSettings => ({ v: 1, auto: false, pick: null, sens, custom: [] })
const preset = (sens: Record<string, number> = {}): Preset => ({ ...PRESETS.default, sens })
const hit = (drum: Drum, t = 0): Hit => ({ drum, t, strength: 4 })
const close = (a: number[], b: number[]) => {
  expect(a).toHaveLength(b.length)
  a.forEach((v, i) => expect(v, `#${i}`).toBeCloseTo(b[i], 12))
}

/** `drum`'s value at each fill after one hit; fill i passes dts[i], so fill 0 is the hit's frame (age 0). */
function after(drum: Drum, dts: number[], s = settings(), p = preset()) {
  const f = createFeatures()
  const out: Sources = {}
  f.hit(hit(drum))
  return dts.map((dt) => {
    f.fill(out, dt, s, p)
    return out[drum]
  })
}

describe('hit sources (design C1)', () => {
  test('a hit jumps to 1 on its frame, then decays by 1/e every τ: kick and snare 0.12 s, hats 0.06 s', () => {
    close(after('kick', [0.06, 0.06, 0.06]), [1, Math.exp(-0.5), Math.exp(-1)])
    close(after('snare', [0.06, 0.06, 0.06]), [1, Math.exp(-0.5), Math.exp(-1)])
    close(after('hats', [0.06, 0.06, 0.06]), [1, Math.exp(-1), Math.exp(-2)])
  })

  test('only the hit drum moves; a drum never hit reads 0; a new hit restarts the decay', () => {
    const f = createFeatures()
    const out: Sources = {}
    const fill = () => f.fill(out, 0.06, settings(), preset())
    fill()
    expect(out).toMatchObject({ kick: 0, snare: 0, hats: 0 })
    f.hit(hit('snare'))
    fill()
    expect(out).toMatchObject({ kick: 0, snare: 1, hats: 0 })
    fill()
    f.hit(hit('snare'))
    fill()
    expect(out.snare).toBe(1)
  })

  test("sens: the user's × the preset's factor for that id (missing = 1), capped at 1", () => {
    const kick = (s: AudioSettings, p = preset()) => after('kick', [0.12, 0], s, p) // ages 0 and τ
    close(kick(settings({ kick: 0 })), [0, 0])
    close(kick(settings({ kick: 1 })), [1, Math.exp(-1)])
    close(kick(settings({ kick: 2 })), [1, 2 * Math.exp(-1)]) // the hit frame caps at 1
    close(kick(settings(), preset({ kick: 0.5 })), [0.5, 0.5 * Math.exp(-1)])
    close(kick(settings({ kick: 2 }), preset({ kick: 0.5 })), [1, Math.exp(-1)]) // a product: 2 × 0.5 is neutral
    close(after('hats', [0.06, 0], settings({ kick: 0, hats: 2 })), [1, 2 * Math.exp(-1)]) // each id its own factor
  })

  test('a DnB hit train at 60 fps: each hit peaks on the frame it is drained and crosses 0.5 once (one event per hit)', () => {
    const { truth } = pattern('dnb') // hats include 16th pickups, 86 ms apart at 174 BPM
    const queue = DRUMS.flatMap((d) => truth[d].map((t) => hit(d, t))).sort((a, b) => a.t - b.t)
    const f = createFeatures()
    const out: Sources = {}
    const edges = { kick: 0, snare: 0, hats: 0 }
    const prev = { kick: 0, snare: 0, hats: 0 }
    const dt = 1 / 60
    for (let now = 0; now < truth.hats[truth.hats.length - 1] + 1; now += dt) {
      const drained: Drum[] = []
      while (queue.length && queue[0].t <= now) drained.push(queue.shift()!.drum) // a file's hit is held until heard (T1)
      for (const d of drained) f.hit(hit(d, now))
      f.fill(out, dt, settings(), preset())
      for (const d of drained) expect(out[d]).toBe(1)
      for (const d of DRUMS) {
        if (out[d] >= 0.5 && prev[d] < 0.5) edges[d]++
        prev[d] = out[d]
      }
    }
    expect(queue).toHaveLength(0)
    expect(edges).toEqual({ kick: truth.kick.length, snare: truth.snare.length, hats: truth.hats.length })
  })
})

// Sustained sources (plan S2.4, design C1). Hand-made `feat` batches pin the knobs; the real chain runs the fixtures.
type Feat = Extract<WorkletMsg, { kind: 'feat' }>
const HOP = 256 / SR
const SUSTAINED = ['sub', 'reese', 'wobble', 'wobbleDepth']

const ripple = (t: number) => 1 + 0.2 * Math.sin(2 * Math.PI * 7 * t)
/** `s` seconds of 2-hop batches, bands [sub, reese, wobble] at held levels `lv(t)`. e2 ripples in the sub and wobble
 *  bands (only held is read). In the reese band e2 = held, but 2× while `trip(t)`: its gate is on (bands.ts). */
function feats(s: number, lv: (t: number) => number[], trip = (t: number) => t < 0): Feat[] {
  const out: Feat[] = []
  for (let t0 = 0; t0 < s; t0 += 2 * HOP) {
    const values = new Float32Array(12)
    for (let h = 0; h < 2; h++)
      lv(t0 + h * HOP).forEach((v, b) => values.set([b !== 1 ? v * ripple(t0 + h * HOP) : trip(t0 + h * HOP) ? 2 * v : v, v], 6 * h + 2 * b))
    out.push({ kind: 'feat', rev: 1, t0, hop: HOP, values })
  }
  return out
}

/** Pushes each batch, reads it as line-in (at(∞)) and fills: [t, sources] after each batch. */
function play(batches: Feat[], s = settings(), p = preset(), f = createFeatures()) {
  const out: Sources = {}
  return batches.map((m) => {
    f.push(m)
    f.at(Infinity)
    f.fill(out, 2 * HOP, s, p)
    const row: Sources = { ...out, rawSub: f.raw.sub, rawReese: f.raw.reese, rawDepth: f.raw.wobbleDepth }
    return [m.t0 + HOP, row] as const
  })
}
const near = (rows: ReturnType<typeof play>, t: number) => rows.reduce((a, b) => (Math.abs(b[0] - t) < Math.abs(a[0] - t) ? b : a))[1]

describe('sustained sources (design C1)', () => {
  test('in the registry, and fill() writes them: 0 before any feat', () => {
    const out: Sources = {}
    createFeatures().fill(out, 1 / 60, settings(), preset())
    for (const id of SUSTAINED) {
      expect(SOURCE_IDS).toContain(id)
      expect(out[id], id).toBe(0)
    }
  })

  test('held ÷ its running average − 1, at least 0: a steady level reads 0 at any gain; a ×2 step reads 1, then settles in AVG ≈ 4 s', () => {
    const lv = (g: number) => (t: number) => [g * (t < 10 ? 1 : 2), g * 0.3, g * 0.7]
    const [loud, quiet] = [play(feats(16, lv(1))), play(feats(16, lv(0.25)))]
    loud.forEach(([, v], i) => SUSTAINED.forEach((id) => expect(quiet[i][1][id]).toBeCloseTo(v[id], 6)))
    const before = near(loud, 9.9)
    expect([before.sub, before.reese, before.wobble, before.wobbleDepth]).toEqual([0, 0, 0, 0])
    expect(near(loud, 10.01).sub).toBeCloseTo(1, 1)
    expect(near(loud, 14).sub).toBeCloseTo(Math.exp(-1) / (2 - Math.exp(-1)), 2) // ×2 / (2 − e^(−t/AVG)) − 1 at t = AVG
    expect(near(loud, 14).rawSub).toBeCloseTo(2, 6) // raw: the linear level, not normalised
  })

  test('wobble = max(0, (g − ḡ)/ḡ) follows a 5 Hz ±50% swing; wobbleDepth = its |…| through a ≈1 s EMA', () => {
    const rows = play(feats(14, (t) => [1, 1, t < 10 ? 1 : (t * 10) % 2 < 1 ? 1.5 : 0.5]))
    expect(near(rows, 9.9).wobbleDepth).toBe(0)
    expect(near(rows, 11).wobbleDepth).toBeCloseTo(0.5 * (1 - Math.exp(-1)), 1) // 1 s after the swing starts
    expect(near(rows, 13.95).wobbleDepth).toBeGreaterThan(0.47)
    expect(near(rows, 13.95).rawDepth).toBe(near(rows, 13.95).wobbleDepth)
    expect(near(rows, 13.05).wobble).toBeCloseTo(0.5, 1) // open half: g = 1.5ḡ
    expect(near(rows, 13.15).wobble).toBe(0) // closed half: −0.5 clips to 0
  })

  test("a trip of the reese band's gate (a kick) holds sub, reese and wobble 0.2 s from its first hop", () => {
    // all three bands jump ×3 for 0.3 s from 10 s, the reese band's gate on for the first 250 ms
    const rows = play(feats(11, (t) => Array(3).fill(t >= 10 && t < 10.3 ? 3 : 1), (t) => t >= 10 && t < 10.25))
    for (const t of [10.02, 10.1, 10.19]) expect(near(rows, t), `${t}`).toMatchObject({ sub: 0, reese: 0, wobble: 0 })
    const after = near(rows, 10.22)
    expect(after.rawSub).toBe(3)
    expect(after.rawReese).toBe(3)
    expect(after.wobble).toBe(1) // (3 − ḡ)/ḡ ≈ 2, capped
  })

  test('a bed back after a gap reads ≥ 0.9, then decays as its average catches up (design ruling 2026-11-05)', () => {
    // 8 s at 1% (room tone: digital silence would restart the average) between two stretches at 1
    const rows = play(feats(22, (t) => Array(3).fill(t >= 6 && t < 14 ? 0.01 : 1)))
    for (const id of ['sub', 'reese']) {
      expect(near(rows, 13.9)[id], id).toBe(0) // the gap reads 0, as a steady bed does
      expect(near(rows, 14.05)[id], id).toBeGreaterThan(0.9)
      expect(near(rows, 17)[id], id).toBeLessThan(near(rows, 15)[id])
      expect(near(rows, 21.9)[id], id).toBeLessThan(0.2)
    }
  })

  test("sens: the user's × the preset's factor per id (missing = 1), capped at 1", () => {
    const step = (t: number) => (t < 10 ? 1 : 2) // sub and reese read ≈ .44 at 11.95 s
    const at = (s: AudioSettings, p = preset()) => near(play(feats(12, (t) => [step(t), step(t), t < 10 ? 1 : (t * 10) % 2 < 1 ? 1.5 : 0.5]), s, p), 11.95)
    const ref = at(settings())
    const v = at(settings({ sub: 0, reese: 2, wobbleDepth: 1.5 }), preset({ wobbleDepth: 0.5, wobble: 0.5 }))
    expect([v.sub, v.reese, v.wobble]).toEqual([0, 2 * ref.reese, ref.wobble * 0.5])
    expect(v.wobbleDepth).toBeCloseTo(ref.wobbleDepth * 0.75, 12)
    expect(at(settings({ reese: 3 })).reese).toBe(1) // ≈ 1.3 caps at 1
  })

  test('reeseLevel = min(1, sens × raw.reese): the linear kick-gated level, not a ratio; a trip holds the pre-kick level', () => {
    const rows = play(feats(11, (t) => Array(3).fill(t >= 10 && t < 10.3 ? 3 : 0.4), (t) => t >= 10 && t < 10.25))
    for (const [, r] of rows) expect(r.reeseLevel).toBe(Math.min(1, r.rawReese))
    expect([near(rows, 9.9).reeseLevel, near(rows, 9.9).reese]).toEqual([Math.fround(0.4), 0]) // steady: its level; `reese` 0
    expect(near(rows, 10.19).reeseLevel).toBe(Math.fround(0.4)) // the gate's 0.2 s hold
    expect(near(rows, 10.22).reeseLevel).toBe(1) // 3, capped
    expect(near(play(feats(2, () => [1, 0.4, 1]), settings({ reeseLevel: 2 })), 1.9).reeseLevel).toBeCloseTo(0.8, 6)
  })

  test('at(t) reads the hops up to the heard time t; later ones wait in the queue', () => {
    const f = createFeatures()
    for (const m of feats(2, (t) => [t < 1 ? 1 : 4, 1, 1])) f.push(m)
    f.at(0.99)
    expect(f.raw.sub).toBe(1)
    f.at(1 + HOP)
    expect(f.raw.sub).toBe(4)
  })
})

// Custom bands u:<id> (plan S2.5): e2 × gain, zeroed in the kick-gate gaps, one-poled in fill() at the frame dt.
// One-pole: l += (y − l) · (1 − e^(−dt/τ)), τ = attack when rising, release when falling, 0 = instant (bind.ts's evaluate()).
const U_ID = 'u:aa11bb'
const uBand = (over: Partial<CustomBand> = {}): CustomBand => ({ id: U_ID, name: 'low', lo: 40, hi: 60, gain: 1, gate: 0, attack: 0.1, release: 0.2, ...over })
/** One 2-hop batch whose custom slot (band 3) holds the given [e2, held]. */
function uFeats(t0: number, cu: [number, number]): Feat {
  const values = new Float32Array(16)
  values.set([1, 1, 1, 1, 1, 1, ...cu], 0)
  values.set([1, 1, 1, 1, 1, 1, ...cu], 8)
  return { kind: 'feat', rev: 1, t0, hop: HOP, values }
}
/** Pushes one batch per row and fills with dt; returns out[U_ID] after each fill. */
function uCurve(cus: [number, number][], b = uBand(), s: AudioSettings = uSet(b), dt = 0.1, p = preset()) {
  const f = createFeatures()
  const out: Sources = {}
  return cus.map((cu, k) => {
    f.push(uFeats(k * 2 * HOP, cu))
    f.at(Infinity)
    f.fill(out, dt, s, p)
    return out[U_ID] ?? 0
  })
}
const E = (x: number) => Math.exp(-x)
const uSet = (b: CustomBand, sens: Record<string, number> = {}): AudioSettings => ({ v: 1, auto: false, pick: null, sens, custom: [b] })

describe('custom bands u:<id> (design C1)', () => {
  test('gate: held ≠ e2 (the kick latch) reads 0 in the gap; e2 × gain otherwise (gain 0 = instant, attack 0 = instant)', () => {
    close(uCurve([[1, 1], [1, 0], [0.5, 0.5], [1, 1]], uBand({ gain: 0, attack: 0, release: 0 })), [0, 0, 0, 0]) // gain 0: silent
    close(uCurve([[1, 1], [1, 0], [0.5, 0.5], [1, 1]], uBand({ attack: 0, release: 0 })), [1, 0, 0.5, 1])
  })

  test('attack/release: a dt-based one-pole, τ = attack rising, release falling (τ 0.1/0.2 s, dt 0.1 s)', () => {
    const up = 1 - E(1)
    const hi = 1 - (1 - up) * E(1)
    close(uCurve([[1, 1], [1, 1], [1, 0], [1, 0], [0, 0]]), [up, hi, hi * E(0.5), hi * E(0.5) * E(0.5), hi * E(0.5) * E(0.5) * E(0.5)])
    const b2 = uBand({ attack: 2, release: 2 })
    expect(uCurve([[1, 1], [1, 0]], b2, uSet(b2), 0.4)[0]).toBeCloseTo(1 - E(0.2), 12) // the dt, not a hop
  })

  test('gain: scales the band level, capped at 1 (attack 0 = instant; with an attack the pole chases the scaled level)', () => {
    close(uCurve([[1, 1]], uBand({ gain: 0.5, attack: 0 })), [0.5])
    close(uCurve([[1, 1]], uBand({ gain: 2, attack: 0 })), [1])
    const g = uBand({ gain: 0.5 })
    close(uCurve([[1, 1], [1, 1]], g, uSet(g)), [0.5 * (1 - E(1)), 0.5 - (0.5 - 0.5 * (1 - E(1))) * E(1)])
  })

  test('sens: the user\'s × the preset\'s factor for the id (missing = 1), capped at 1', () => {
    const b = uBand({ attack: 0 })
    const at = (sens: Record<string, number> = {}, p = preset()) => uCurve([[1, 1], [1, 1]], b, uSet(b, sens), 0.1, p)[1]
    expect(at()).toBe(1)
    expect(at({ [U_ID]: 0.5 })).toBe(0.5)
    expect(at({ [U_ID]: 2 })).toBe(1) // caps
    expect(at({}, preset({ [U_ID]: 0.5 }))).toBe(0.5)
  })

  test('removed band reads 0 (state dropped); a rename keeps its id (the one-pole continues), re-adding starts fresh', () => {
    const b = uBand()
    const f = createFeatures()
    const out: Sources = {}
    const step = (s: AudioSettings) => {
      f.push(uFeats(0, [1, 1]))
      f.at(Infinity)
      f.fill(out, 0.1, s, preset())
      return out[U_ID] ?? 0
    }
    const s1 = uSet(b)
    expect(step(s1)).toBeCloseTo(1 - E(1), 12)
    expect(step(settings())).toBe(0) // removed
    expect(step(s1)).toBeCloseTo(1 - E(1), 12) // re-added: starts at 0
    expect(step(uSet({ ...b, name: 'renamed' }))).toBeCloseTo((1 - E(1)) + E(1) * (1 - E(1)), 12) // rename: continues
  })

  test('no custom bands: fill writes nothing new (the sustained ids only)', () => {
    const f = createFeatures()
    const out: Sources = {}
    f.push(uFeats(0, [1, 1]))
    f.at(Infinity)
    f.fill(out, 0.1, settings(), preset())
    expect(U_ID in out).toBe(false)
  })
})

// The real chain: a 48 kHz fixture → analysis.ts with bands sub, reese and wobble first, then the settings' custom
// bands (S2.5's config: workletBands) → push → at(∞) → fill, after each batch from `from` s.
function listen(x: Float32Array, from = 5, s: AudioSettings = settings()) {
  const a = createAnalysis(SR)
  a.configure({ kind: 'config', rev: 1, ...workletBands(s, 'default') })
  const f = createFeatures()
  const out: Sources = {}
  const rows: Sources[] = []
  for (let i = 0; i + 128 <= x.length; i += 128)
    a.block([x.subarray(i, i + 128)], i, (m) => {
      if (m.kind !== 'feat') return
      f.push(m)
      f.at(Infinity)
      f.fill(out, 2 * m.hop, s, preset())
      if (m.t0 >= from) rows.push({ ...out })
    })
  return rows
}
const col = (rows: Sources[], id: string) => rows.map((r) => r[id])
const maxDiff = (a: Sources[], b: Sources[], id: string) => Math.max(...a.map((r, i) => Math.abs(r[id] - b[i][id])))

describe('sustained sources through analysis.ts (fixtures)', () => {
  test('a sustained sub + reese bed rests ≈0 at 0 and −12 dB; kicks over it barely move sub and reese', () => {
    const track = pattern('techno', 8) // four on the floor: 32 kicks
    const bed = listen(mix(track, ['sub', 'reese', 'room']))
    const kicks = mix(track, ['sub', 'reese', 'room', 'kick'])
    const [loud, quiet] = [listen(kicks), listen(kicks.map((v) => v / 4))]
    for (const id of ['sub', 'reese']) {
      const v = col(bed, id).sort((a, b) => a - b)
      expect(v[v.length >> 1], id).toBeLessThan(0.1) // p50
      expect(v[v.length - 1], id).toBeLessThan(0.2)
      expect(maxDiff(loud, bed, id), id).toBeLessThan(0.16) // the ratio within 16% (the old .08 at ÷ 2)
      expect(maxDiff(quiet, loud, id), id).toBeLessThan(0.05) // ±5%
    }
  })

  test('reeseLevel: kicks alone peak under 15% of a bass bed (a tail blip at +HOLD); the bed reads linear in the gain', () => {
    const track = pattern('techno', 8) // four on the floor: 32 kicks
    const bed = mix(track, ['sub', 'reese', 'room'])
    const lv = (x: Float32Array) => col(listen(x), 'reeseLevel').sort((a, b) => a - b)
    const [loud, quiet, kicks] = [lv(bed), lv(bed.map((v) => v / 4)), lv(mix(track, ['kick', 'room']))]
    const p50 = (v: number[]) => v[v.length >> 1]
    expect(kicks[kicks.length - 1]).toBeLessThan(0.15 * p50(loud)) // measured .10: 1–3 hops of the kick's tail at +0.2 s
    expect(p50(quiet) / p50(loud)).toBeCloseTo(0.25, 4)
  })

  test('wobbleDepth: a 4.67 Hz LFO wobble reads ≥ 2× a steady reese, at any gain; wobble rises once per LFO period', () => {
    const room = mix(pattern('techno', 8), ['room']).subarray(0, 12 * SR)
    const add = (x: Float32Array) => x.map((v, i) => v + room[i])
    const [wob, quiet, steady] = [listen(add(wobble(12 * SR)), 6), listen(add(wobble(12 * SR)).map((v) => v / 4), 6), listen(add(reese(12 * SR)), 6)]
    for (const v of col(wob, 'wobbleDepth')) expect(v).toBeGreaterThan(0.2) // measured 0.25
    for (const v of col(steady, 'wobbleDepth')) expect(v).toBeLessThan(0.15) // measured ≤ 0.13: the reese's beating
    expect(maxDiff(quiet, wob, 'wobbleDepth')).toBeLessThan(0.0125)
    const w = col(wob, 'wobble')
    const rises = w.filter((v, i) => i > 0 && v >= 0.15 && w[i - 1] < 0.15).length
    expect(rises / 6).toBeGreaterThan(140 / 30 - 1)
    expect(rises / 6).toBeLessThan(140 / 30 + 1)
  })

  test('50 Hz vs 120 Hz sine through the full path: a 40–60 Hz band reads ≥ 5× higher on 50 Hz (the band filter\'s response)', () => {
    const band = uBand()
    const s = uSet(band)
    const med = (rows: Sources[]) => rows.map((r) => r[band.id] ?? 0).sort((a, b) => a - b)[Math.floor(rows.length / 2)]
    const low = med(listen(sub(6 * SR, 0.5, 50), 2, s))
    const high = med(listen(sub(6 * SR, 0.5, 120), 2, s))
    expect(low).toBeGreaterThan(high * 5)
  })
})
