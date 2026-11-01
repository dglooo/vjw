// S7.1 acceptance (spec §4.1, §4.2, §4.3, §4.5, §4.6): one integration file driving the real DSP chain — analysis →
// drums, features → tempo, style, arrangement, settings — on the synth.ts fixtures. §4.4 and §4.7 are browser/lead checks.
// The helpers below are lifted from the per-module tests (drums, tempo, style, arrange, settings) — same DSP, no reinvention.
import FFT from 'fft.js'
import { expect, test } from 'vitest'
import { createAnalysis } from './analysis'
import { createArrangement, shouldCut, type ArrangeIn, type ArrangeOpts } from './arrange'
import { createBank } from './bands'
import { createDrums, type Drum } from './drums'
import { rms } from './energy'
import { PRESETS, type Genre } from './presets'
import { createSettings, parseSettings } from './settings'
import { createStyle, type StyleIn, type StyleOut } from './style'
import { arrangement, crossfade, GROOVES, mix, pattern, rng, SR, T0, type Groove, type Stem } from './synth'
import { createTempoSource, type TempoSource } from './tempo'

// ---- drums (as drums.test.ts): the worklet's FFT path ----
const N = 512
const HOP = 256
const hann = Float32Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N))
const DRUMS: Drum[] = ['kick', 'snare', 'hats']

/** Hit times per drum for a signal run through the worklet's FFT path, after a 0.5 s warm-up. */
function hitsOf(x: Float32Array) {
  const fft = new FFT(N)
  const out = new Float64Array(2 * N)
  const frame = new Float64Array(N)
  const mag = new Float32Array(N / 2 + 1)
  const drums = createDrums(SR, N)
  const hits: Record<Drum, number[]> = { kick: [], snare: [], hats: [] }
  for (let e = HOP; e <= x.length; e += HOP) {
    for (let i = 0; i < N; i++) frame[i] = (x[e - N + i] ?? 0) * hann[i]
    fft.realTransform(out, frame)
    for (let k = 0; k <= N / 2; k++) mag[k] = Math.hypot(out[2 * k], out[2 * k + 1])
    for (const h of drums.detect(mag, e / SR)) if (h.t > 0.5) hits[h.drum].push(h.t)
  }
  return hits
}

/** F1 of `hits` against `truth`, one-to-one matches within ±tol s. */
function f1(truth: number[], hits: number[], tol = 0.03) {
  const used = new Set<number>()
  let tp = 0
  for (const t of truth) {
    const j = hits.findIndex((h, k) => !used.has(k) && Math.abs(h - t) <= tol)
    if (j < 0) continue
    used.add(j)
    tp++
  }
  return (2 * tp) / (truth.length + hits.length)
}

// ---- tempo (as tempo.test.ts): a synth pattern's first 10 s through analysis, as app.ts feeds it ----
function listen(src: TempoSource, genre: Genre, bpm: number, stems: Stem[] = ['kick', 'snare', 'hats', 'room']) {
  const x = mix(pattern(genre, 8, bpm), stems)
  const a = createAnalysis(SR)
  for (let f = 0; f + 128 <= 10 * SR; f += 128)
    a.block([x.subarray(f, f + 128)], f, (m) => (m.kind === 'onset' ? src.push(m) : m.kind === 'odf' && src.pushOdf(m.values, m.t0, m.hop)))
  return src.read()!
}

// ---- style (as style.test.ts): the classifier's inputs from GROOVES, an 8 fps timeline, and the no-flap sim ----
const FPS = 8
const per = (f: (g: Genre) => number): Record<Genre, number> => ({ dnb: f('dnb'), dubstep: f('dubstep'), techno: f('techno') })
const families = (bpm: number) =>
  per((g) => {
    const [lo, hi] = PRESETS[g].bpm!
    const hit = (ks: number[]) => ks.some((k) => bpm * k >= lo / 1.1 && bpm * k <= hi * 1.1)
    return hit([0.5, 1, 2]) ? 1 : hit([2 / 3, 4 / 3]) ? 0.5 : 0
  })
const feats = (g: Groove): StyleIn => ({ families: families(g.bpm), kickPerBeat: g.kick.length / 4, hatsPerBeat: g.hats.length / 4, wobble: g.wobble, bass: g.bass, freeze: false })
function blend(a: StyleIn, b: StyleIn, w: number): StyleIn {
  const l = (p: number, q: number) => p + (q - p) * w
  return { families: per((g) => l(a.families[g], b.families[g])), kickPerBeat: l(a.kickPerBeat!, b.kickPerBeat!), hatsPerBeat: l(a.hatsPerBeat!, b.hatsPerBeat!), wobble: l(a.wobble, b.wobble), bass: l(a.bass, b.bass), freeze: false }
}
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
/** One classifier at 8 fps; `log` keeps every pick/switch as [t, genre]. */
function sim() {
  const s = createStyle()
  const log: [t: number, to: Genre | null][] = []
  let i = 0
  let out: StyleOut | undefined
  return {
    log,
    to(end: number, input: (t: number) => StyleIn) {
      for (; i <= end * FPS; i++) {
        out = s.update(input(i / FPS), i / FPS)
        if (out.detected !== (log.length ? log[log.length - 1][1] : null)) log.push([i / FPS, out.detected])
      }
      return out!
    },
  }
}

// ---- arrangement (as arrange.test.ts): the worklet's DSP into ArrangeIn frames, one per 6 quanta ----
const Q = 128
const FRAME = 6 * Q
const HZ = SR / N
function inputs(x: Float32Array, bpm: number | null): ArrangeIn[] {
  const bank = createBank(SR)
  const { sub, reese } = PRESETS.dnb.bands
  bank.configure([{ id: 'sub', lo: sub[0], hi: sub[1] }, { id: 'reese', lo: reese[0], hi: reese[1] }])
  const drums = createDrums(SR, N)
  const fft = new FFT(N)
  const [spec, frame, mag, held] = [new Float64Array(2 * N), new Float64Array(N), new Float32Array(N / 2 + 1), new Float32Array(4)]
  const [lo, hi] = [Math.ceil(4000 / HZ), Math.floor(16000 / HZ)]
  const out: ArrangeIn[] = []
  let [kick, high] = [false, 0]
  for (let e = Q; e <= x.length; e += Q) {
    bank.process(x.subarray(e - Q, e))
    if (e % HOP === 0) {
      for (let i = 0; i < N; i++) frame[i] = (x[e - N + i] ?? 0) * hann[i]
      fft.realTransform(spec, frame)
      for (let k = 0; k <= N / 2; k++) mag[k] = Math.hypot(spec[2 * k], spec[2 * k + 1])
      if (drums.detect(mag, e / SR).some((h) => h.drum === 'kick')) kick = true
      high = mag.subarray(lo, hi + 1).reduce((s, v) => s + v, 0) / (hi - lo + 1)
    }
    if (e % FRAME === 0) {
      bank.read(held)
      const now = e / SR
      out.push({ low: held[1] + held[3], high, total: rms(x.subarray(e - FRAME, e)), kick, beat: bpm && ((now - T0) * bpm) / 60, now })
      kick = false
    }
  }
  return out
}
const run = (frames: readonly ArrangeIn[], opts?: Partial<ArrangeOpts>) => {
  const a = createArrangement(opts)
  return frames.map((f) => ({ now: f.now, ...a.update(f) }))
}
const fires = (r: ReturnType<typeof run>) => r.filter((f) => f.fired !== null)

// ---- settings (as settings.test.ts): localStorage over a Map ----
const KEY = 'vjw.audio'
const storage = () => {
  const m = new Map<string, string>()
  return { m, kv: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) } }
}

// ================= spec §4 =================

test('§4.1 DnB test mix (kick + snare + reese + hats): kick, snare and hats each F1 ≥ 0.70 at ±30 ms', () => {
  const t = pattern('dnb', 8)
  const h = hitsOf(mix(t))
  for (const d of DRUMS) expect(f1(t.truth[d], h[d]), d).toBeGreaterThanOrEqual(0.7)
})

test('§4.2 the DnB 174 pattern reads inside the DnB range [160, 185] — 174/182, never 87', () => {
  const src = createTempoSource()
  src.setRange(PRESETS.dnb.bpm)
  const r = listen(src, 'dnb', 174)
  expect(r.bpm).toBeGreaterThanOrEqual(PRESETS.dnb.bpm![0])
  expect(r.bpm).toBeLessThanOrEqual(PRESETS.dnb.bpm![1])
  expect(r.bpm).toBeGreaterThan(100) // not the 87 half
})

test.each(
  (['dnb', 'dubstep', 'techno'] as const).flatMap((g) => [0, 1].map((v) => [g, v] as const)),
)('§4.3 %s groove %i is detected (and keeps it) under 1 s-step noise', (g, v) => {
  const m = sim()
  m.to(20, jitter(() => feats(GROOVES[g][v]), 7 + v))
  expect(m.log).toHaveLength(1)
  expect(m.log[0][1]).toBe(g)
})

test('§4.3 a 16-bar equal-power crossfade dnb → dubstep switches at most once', () => {
  const [A, B, bpm] = [feats(GROOVES.dnb[0]), feats(GROOVES.dubstep[0]), GROOVES.dubstep[0].bpm]
  const xf = crossfade(60, 16, bpm)
  const m = sim()
  m.to(60 + (16 * 240) / bpm + 30, jitter((t) => blend(A, B, xf(t)[1] ** 2), 11)) // b's share = its power
  expect(m.log.length).toBeLessThanOrEqual(2) // the first pick plus ≤ 1 switch
})

test('§4.5 build → drop → cut: the drop fires ≥ 0.6 at the drop; shouldCut is true unlocked, false under LOCK', () => {
  const song = arrangement() // 16 dnb bars, an 8-bar breakdown (riser + roll), the drop
  const f = fires(run(inputs(mix(song), 174)))
  expect(f).toHaveLength(1)
  expect(f[0].now - song.drop).toBeGreaterThan(0)
  expect(f[0].now - song.drop).toBeLessThanOrEqual(60 / 174) // within a beat of the first drop kick
  expect(f[0].fired!).toBeGreaterThanOrEqual(0.6)
  expect(shouldCut(f[0].fired, false)).toBe(true)
  expect(shouldCut(f[0].fired, true)).toBe(false) // LOCK
})

test('§4.6 a 40–60 Hz custom band: add → vjw.audio JSON → parseSettings comes back intact', () => {
  const { m, kv } = storage()
  const s = createSettings(kv)
  expect(s.addBand({ name: 'sub', lo: 40, hi: 60, gain: 1.5, gate: 0.2, attack: 0.01, release: 0.2 })).toBeNull()
  const reloaded = parseSettings(JSON.parse(m.get(KEY)!))
  expect(reloaded.custom).toEqual([s.get().custom[0]])
  expect(reloaded.custom[0]).toMatchObject({ lo: 40, hi: 60, gain: 1.5, gate: 0.2, attack: 0.01, release: 0.2 })
})
