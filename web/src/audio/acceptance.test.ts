// S7.1 acceptance (spec §4.1, §4.2, §4.3, §4.5, §4.6): one integration file driving the real DSP chain — analysis →
// drums, features → tempo, style, arrangement, settings — on the synth.ts fixtures. §4.4 and §4.7 are browser/lead checks.
// The helpers below are lifted from the per-module tests (drums, tempo, style, arrange, settings) — same DSP, no reinvention.
import FFT from 'fft.js'
import { expect, test } from 'vitest'
import type { Sources } from '../bind'
import { createAnalysis } from './analysis'
import { createArrangement, shouldCut, type ArrangeIn, type ArrangeOpts } from './arrange'
import type { Drum } from './drums'
import { rms } from './energy'
import { createFeatures } from './features'
import type { WorkletMsg } from './onset.worklet'
import { PRESETS, type Genre } from './presets'
import { createSettings, parseSettings, type AudioSettings } from './settings'
import { createStyle, type StyleIn, type StyleOut } from './style'
import { arrangement, crossfade, GROOVES, mix, pattern, rng, SR, T0, wobble, type Groove, type Stem } from './synth'
import { createTempoSource, type TempoSource } from './tempo'

// ---- drums (as drums.test.ts): the worklet's body, analysis.ts, in render quanta ----
const N = 512
const hann = Float32Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N))
const DRUMS: Drum[] = ['kick', 'snare', 'hats']

/** Hit times per drum for a signal run through analysis.ts, after a 0.5 s warm-up. */
function hitsOf(x: Float32Array) {
  const a = createAnalysis(SR)
  const hits: Record<Drum, number[]> = { kick: [], snare: [], hats: [] }
  for (let i = 0; i + 128 <= x.length; i += 128) a.block([x.subarray(i, i + 128)], i, (m) => m.kind === 'hit' && m.t > 0.5 && hits[m.drum].push(m.t))
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

// ---- arrangement: app.ts's path (S5.3), unlike arrange.test.ts's bands.ts shortcut: analysis.ts → features.ts (low =
// raw sub + reese, held HOLD s past each kick) → ArrangeIn, one 60 fps frame per 1/60 s of heard time from `phase`,
// draining the kicks heard by then (T1). high = the mean 4–16 kHz magnitude of the frame's last FFT window ----
const Q = 128
const HZ = SR / N
const FPS_APP = 60
function inputs(x: Float32Array, genre: Genre, bpm: number) {
  const B = PRESETS[genre].bands
  const a = createAnalysis(SR)
  a.configure({ kind: 'config', rev: 1, drums: { kick: B.kick, snare: B.snare, hats: B.hats }, bands: (['sub', 'reese', 'wobble'] as const).map((id) => ({ id, lo: B[id][0], hi: B[id][1] })) })
  const feats: Extract<WorkletMsg, { kind: 'feat' }>[] = []
  const kicks: number[] = []
  for (let i = 0; i + Q <= x.length; i += Q)
    a.block([x.subarray(i, i + Q)], i, (m) => (m.kind === 'feat' ? feats.push(m) : m.kind === 'hit' && m.drum === 'kick' && kicks.push(m.t)))
  const fft = new FFT(N)
  const [spec, frame] = [new Float64Array(2 * N), new Float64Array(N)]
  const [lo, hi] = [Math.ceil(4000 / HZ), Math.floor(16000 / HZ)]
  return (phase: number): ArrangeIn[] => {
    const f = createFeatures()
    for (const m of feats) f.push(m) // at() works through the hops up to each frame's heard time only
    const out: ArrangeIn[] = []
    let k = 0
    for (let now = phase + 1 / FPS_APP; now <= x.length / SR; now += 1 / FPS_APP) {
      const e = Math.round(now * SR)
      let kick = false
      for (; k < kicks.length && kicks[k] <= now; k++) kick = true
      f.at(now)
      for (let i = 0; i < N; i++) frame[i] = (x[e - N + i] ?? 0) * hann[i]
      fft.realTransform(spec, frame)
      let high = 0
      for (let j = lo; j <= hi; j++) high += Math.hypot(spec[2 * j], spec[2 * j + 1]) / (hi - lo + 1)
      out.push({ low: f.raw.sub + f.raw.reese, high, total: rms(x.subarray(e - SR / FPS_APP, e)), kick, beat: ((now - T0) * bpm) / 60, now })
    }
    return out
  }
}
/** make-fx.mjs's `-arr` fixture: the arrangement, and for Dubstep its wobble stem, silent over the breakdown (5 ms edges),
 *  scaled under clipping as the WAV is. */
function arr(genre: Genre) {
  const song = arrangement({ genre })
  const x = mix(song)
  const gate = (t: number) => Math.min(1, Math.max(0, (song.start - t) / 0.005, (t - song.drop) / 0.005 + 1))
  if (genre === 'dubstep') wobble(x.length).forEach((v, i) => (x[i] += v * gate(i / SR)))
  const peak = x.reduce((m, v) => Math.max(m, Math.abs(v)), 0)
  if (peak > 0.99) x.forEach((v, i) => (x[i] = (v * 0.99) / peak))
  return { ...song, x }
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

/** features.ts's `kick` at 60 fps, the hits drained as app.ts does (T1): its median over the frames in [a, b) s. */
function kickP50(kicks: readonly number[], a: number, b: number) {
  const f = createFeatures()
  const [out, s]: [Sources, AudioSettings] = [{}, { v: 1, auto: false, pick: null, sens: {}, custom: [] }]
  const v: number[] = []
  for (let now = 1 / FPS_APP, k = 0; now < b; now += 1 / FPS_APP) {
    for (; k < kicks.length && kicks[k] <= now; k++) f.hit({ drum: 'kick', t: kicks[k], strength: 1 })
    f.fill(out, 1 / FPS_APP, s, PRESETS.default)
    if (now >= a) v.push(out.kick)
  }
  return v.sort((p, q) => p - q)[v.length >> 1]
}

test.each([['dnb', 174, 2], ['dubstep', 140, 1]] as const)('§4.1 kicks on the %s -arr fixture at %i BPM (ruling 2026-11-05): truth ±10 % a bar in the groove and the drop, ≤ 1 in the breakdown and 0 in its roll, none within an ⅛ note; `kick` idles', (genre, bpm, perBar) => {
  // Measured 2026-11-05: 2.00 / 1.00 a bar in both sections, F1 1.00, 0 in the breakdown, min IOI 512 / 1707 ms, `kick`
  // p50 ≤ .001. The bin-1 detector: DnB 104 breakdown kicks (44 in the roll), Dubstep 18.4 a bar, p50 .66 / .76.
  const s = arr(genre)
  const bar = 240 / bpm
  const end = s.drop + 8 * bar
  const { kick, snare } = hitsOf(s.x)
  // Snares outside the breakdown (snare ruling 2026-11-05 + lead amendment). Measured: DnB .92 (.91 untilted), Dubstep
  // .89, all 24 found (untilted .11: the wobble's 1–3 kHz flank fired 148 false snares; tilt alone .71). Left: 6 kick
  // clicks 1–2 hops before their kick at 1.15–1.47 floors, against a kick that fires at 1.01–1.17 TRANSIENTs. The roll
  // is 0 / 32 on both, before and after: the riser masks it.
  const out = (t: number) => t < s.start || t >= s.drop
  expect(f1(s.truth.snare.filter(out), snare.filter(out))).toBeGreaterThanOrEqual(0.8)
  const n = (a: number, b: number) => kick.filter((t) => t >= a && t < b).length
  for (const [a, b] of [[T0, s.start], [s.drop, end]]) expect(Math.abs((n(a, b) * bar) / (b - a) / perBar - 1), `${a}–${b} s`).toBeLessThanOrEqual(0.1)
  expect(f1(s.truth.kick, kick)).toBeGreaterThanOrEqual(0.7)
  expect(n(s.start, s.drop)).toBeLessThanOrEqual(1) // the riser, room tone and the snare's body in an empty band
  expect(n(s.drop - 4 * bar, s.drop)).toBe(0) // the roll
  expect(Math.min(...kick.slice(1).map((t, i) => t - kick[i]))).toBeGreaterThanOrEqual(bar / 8)
  // Where the bin-1 detector stormed: Dubstep's groove and drop (the wobble), DnB's breakdown (riser + roll).
  for (const [a, b] of genre === 'dubstep' ? [[T0, s.start], [s.drop, end]] : [[s.start, s.drop]]) expect(kickP50(kick, a, b), `${a}–${b} s`).toBeLessThanOrEqual(0.1)
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

test.each([['dnb', 174], ['dubstep', 140]] as const)('§4.5 build → drop → cut, %s -arr through the held features path at 20 frame phases: one drop ≥ 0.6 within a beat; shouldCut unlocked, not under LOCK', (genre, bpm) => {
  const song = arr(genre) // 16 bars, an 8-bar breakdown (riser + roll), the drop, 8 bars
  const frames = inputs(song.x, genre, bpm)
  for (let p = 0; p < 20; p++) {
    // At near = HOLD (the old 0.2 s) DnB missed at 3 of 20 phases: there the 0.203 s hold spans 13 frames (S1.11)
    const f = fires(run(frames(p / 20 / FPS_APP)))
    expect(f, `phase ${p}/20`).toHaveLength(1) // and no extra drop in the groove, the build or after
    expect(f[0].now - song.drop).toBeGreaterThan(0)
    expect(f[0].now - song.drop).toBeLessThanOrEqual(60 / bpm) // measured ≤ 0.34 s: the hold + `sustain`
    expect(f[0].fired!).toBeGreaterThanOrEqual(0.6) // measured ≥ 0.80 DnB, ≥ 0.66 Dubstep
    expect(shouldCut(f[0].fired, false)).toBe(true)
    expect(shouldCut(f[0].fired, true)).toBe(false) // LOCK
  }
})

test('§4.6 a 40–60 Hz custom band: add → vjw.audio JSON → parseSettings comes back intact', () => {
  const { m, kv } = storage()
  const s = createSettings(kv)
  expect(s.addBand({ name: 'sub', lo: 40, hi: 60, gain: 1.5, gate: 0.2, attack: 0.01, release: 0.2 })).toBeNull()
  const reloaded = parseSettings(JSON.parse(m.get(KEY)!))
  expect(reloaded.custom).toEqual([s.get().custom[0]])
  expect(reloaded.custom[0]).toMatchObject({ lo: 40, hi: 60, gain: 1.5, gate: 0.2, attack: 0.01, release: 0.2 })
})
