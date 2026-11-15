// The pure rig of native/serpent (matrix_neuro_serpent.md, the S3 spike set: T-F0, T-F1, T-F2 "exactly one whip per drop
// rise", T-F2d, T-F3 + T-DET, T-SIL, T-C7a, T-B1, T-R7 and a finite-buffer guard), fed 60 frames a s at 174 BPM, `now` =
// frame ÷ 60 (never performance.now()), aspect 1728 ÷ 1117. The GL is the browser check.
import { expect, test, vi } from 'vitest'
import { BUILTIN } from './builtin'
import { createSerpent, MAXP, PART, RING, RINGS, ripplePerBeat, SERPENT_ABSENCE_WIND, serpent, type SerpentState } from './serpent'

vi.mock('../gl/engine', () => ({})) // takes the page's canvas + WebGL at import; the rig needs neither

const BPM = 174, BEAT = 60 / BPM, BAR = 4 * BEAT, FPS = 60, ASPECT = 1728 / 1117
type V = Record<string, number>
interface Fr { t: number; s: SerpentState; finite: boolean }
/** A hit envelope as features.ts fills it: 1 at each hit, e^(−age/τ) after. */
const env = (t: number, hits: readonly number[], tau = 0.1) => hits.reduce((y, h) => (t >= h ? Math.max(y, Math.exp(-(t - h) / tau)) : y), 0)
/** The `drop` source (arrange.ts): the fire's confidence, decaying τ 1 s. */
const dropSrc = (t: number, fires: readonly number[], conf = 0.7) => fires.reduce((y, f) => (t >= f ? conf * Math.exp(-(t - f)) : y), 0)

function drive(frames: number, at: (t: number) => V, o: { seed?: number; bpm?: number; check?: boolean } = {}): Fr[] {
  const rig = createSerpent(o.seed ?? 3)
  const rings = new Float32Array(RINGS * RING), parts = new Float32Array(MAXP * PART)
  const bpm = o.bpm ?? BPM, out: Fr[] = []
  for (let i = 0; i < frames; i++) {
    const t = i / FPS
    const r = rig.step({ v: at(t), beat: bpm > 0 ? (t * bpm) / 60 : 0, bpm, now: t, dt: 1 / FPS, aspect: ASPECT }, rings, parts)
    let finite = true
    if (o.check) {
      for (let k = 0; k < rings.length; k++) finite &&= Number.isFinite(rings[k])
      for (let k = 0; k < r.parts * PART; k++) finite &&= Number.isFinite(parts[k])
      finite &&= [...r.vp, ...r.eye, r.nearDist, r.glow, r.key, r.w].every(Number.isFinite)
    }
    out.push({ t, s: rig.state(), finite })
  }
  return out
}
const whipsAt = (fr: Fr[]) => fr.filter((x, i) => x.s.whips > (i ? fr[i - 1].s.whips : 0)).map((x) => x.t)

test('T-F0: the absence wind is OFF by default', () => {
  expect(SERPENT_ABSENCE_WIND).toBe(false)
})

test('T-F1: presence (reeseLevel 1.0 for 16 bars, 1-frame spikes in silence) never moves W; no whip; coil throughout', () => {
  const N = Math.round(32 * BAR * FPS)
  const pres = (t: number) => (t < 16 * BAR ? 1 : Math.round(t * FPS) % 37 === 0 ? 1 : 0)
  const a = drive(N, (t) => ({ presence: pres(t), bass: t < 16 * BAR ? 0.8 : 0 }))
  const b = drive(N, (t) => ({ presence: 0, bass: t < 16 * BAR ? 0.8 : 0 }))
  expect(a.map((x) => x.s.W)).toEqual(b.map((x) => x.s.W)) // presence has no path to W
  expect(a.at(-1)!.s.whips).toBe(0)
  expect(a.every((x) => x.s.phase === 'coil')).toBe(true)
  expect(a.at(-1)!.s.W).toBeCloseTo(0.3, 2) // the G4 floor: .30 at 32 bars since the entry
})

test('T-F2: exactly one whip per drop rise (8 bars Groove / 8 bars Coil, 7 rises, build .4 before 3)', () => {
  const fires = Array.from({ length: 7 }, (_, k) => (k + 1) * 8 * BAR + 0.05)
  const builds = new Set([1, 3, 5])
  const fr = drive(Math.round((7 * 8 + 4) * BAR * FPS), (t) => {
    const k = Math.floor(t / (8 * BAR)), groove = k % 2 === 0
    const nextFire = fires.find((f) => f > t) ?? Infinity
    return {
      bass: groove ? 0.8 : 0, kick: env(t, Array.from({ length: Math.floor(t / BEAT) + 1 }, (_, b) => b * BEAT)),
      build: builds.has(fires.indexOf(nextFire)) && nextFire - t < 4 * BAR ? 0.4 * (1 - (nextFire - t) / (4 * BAR)) : 0,
      drop: dropSrc(t, fires), flare: dropSrc(t, fires),
    }
  })
  const at = whipsAt(fr)
  expect(at.length).toBe(7)
  at.forEach((t, k) => expect(Math.abs(t - fires[k])).toBeLessThanOrEqual(1.5 / FPS)) // on the rise frame
  expect(fr.at(-1)!.s.pumps).toBeLessThan(7) // the build-wound rises release (W ≥ .06), not pump
})

test('T-F3: the 2-s latch on now (rises at T, T + 1.5 s, T + 5 s, T + 7.5 s)', () => {
  const T0 = 3, fires = [T0, T0 + 1.5, T0 + 5, T0 + 7.5]
  const fr = drive(Math.round(12 * FPS), (t) => ({ drop: dropSrc(t, fires), flare: dropSrc(t, fires), bass: 0.6 }))
  const w = (t: number) => fr[Math.round(t * FPS)].s.whips
  expect([w(T0 + 0.1), w(T0 + 1.6), w(T0 + 5.1), w(T0 + 7.6)]).toEqual([1, 1, 2, 3]) // the latch runs from the last whip
  expect(fr.at(-1)!.s.flares).toBe(4) // a refused rise still flares
})

test('T-F2d: the 3 replay dumps → 7 whips at the 7 drop rises, 0 elsewhere (missing dump = UNKNOWN, skipped)', async () => {
  // the app tsconfig has no node types: node:fs and the env arrive untyped, so the browser program stays node-free
  const fsId = 'node:fs'
  const { existsSync, readFileSync } = (await import(/* @vite-ignore */ fsId)) as { existsSync(p: string): boolean; readFileSync(p: string, e: 'utf8'): string }
  const dir = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env.SERPENT_DUMPS
  const files = ['kanine', 'subfocus', 'andyc'].map((k) => `${dir}/${k}-dnb.json`)
  if (!dir || !files.every(existsSync)) return void console.warn('T-F2d UNKNOWN: SERPENT_DUMPS not set or a dump missing')
  const want: Record<string, number[]> = { kanine: [44.63, 88.8, 155], subfocus: [146.55], andyc: [47.22, 91.37, 157.55] }
  for (const [k, f] of ['kanine', 'subfocus', 'andyc'].map((k, i) => [k, files[i]] as const)) {
    const d = JSON.parse(readFileSync(f, 'utf8')) as { cols: string[]; rows: number[][] }
    const c = (n: string) => d.cols.indexOf(n)
    const rig = createSerpent(3), rings = new Float32Array(RINGS * RING), parts = new Float32Array(MAXP * PART)
    const got: number[] = []
    let prev = 0, last = 0
    for (const r of d.rows) {
      const v = { kick: r[c('kick')], snare: r[c('snare')], hats: r[c('hats')], sub: r[c('sub')], reese: r[c('reese')], wobble: r[c('wobble')], build: r[c('build')], drop: r[c('drop')], flare: r[c('drop')], presence: Math.min(1, r[c('rawReese')]) }
      rig.step({ v, beat: r[c('beat')], bpm: r[c('bpm')], now: r[c('t')], dt: r[c('t')] - last, aspect: ASPECT }, rings, parts)
      last = r[c('t')]
      const s = rig.state()
      if (s.whips > prev) got.push(+r[c('t')].toFixed(2))
      prev = s.whips
    }
    expect(got.length, k).toBe(want[k].length)
    got.forEach((t, i) => expect(Math.abs(t - want[k][i]), `${k} ${t}`).toBeLessThanOrEqual(0.05))
  }
})

test('T-DET + finite: the same seed and input give bit-identical traces; every buffer value is finite through whips and snaps', () => {
  const fires = [4, 12], snares = Array.from({ length: 40 }, (_, k) => 0.5 + k * 2 * BEAT), hats = Array.from({ length: 80 }, (_, k) => 0.3 + k * BEAT)
  const at = (t: number) => ({ bass: 0.5 + 0.5 * Math.sin(t), sub: 0.5, reese: t > 6 ? 0.7 : 0, kick: env(t, [1, 1.4, 5, 5.3, 9]), snare: env(t, snares), hats: env(t, hats, 0.05), build: t < 4 ? t / 4 : 0, drop: dropSrc(t, fires), flare: dropSrc(t, fires) })
  const a = drive(16 * FPS, at, { check: true }), b = drive(16 * FPS, at)
  expect(a.map((x) => x.s)).toEqual(b.map((x) => x.s))
  expect(a.every((x) => x.finite)).toBe(true)
  const s = a.at(-1)!.s
  expect([s.whips, s.snaps, s.glints, s.rings]).toEqual([2, snares.filter((x) => x < 16).length, hats.filter((x) => x < 16).length, 5])
})

test('T-SIL: 5 s of zero features: no ring, snap, glint or whip; ripple height 0; W = the floor only', () => {
  const fr = drive(5 * FPS, () => ({}), { bpm: 0 })
  const s = fr.at(-1)!.s
  expect([s.rings, s.snaps, s.glints, s.whips, s.ripple]).toEqual([0, 0, 0, 0, 0])
  expect(s.W).toBeCloseTo((0.3 * (5 / BAR)) / 32, 3) // bpm 0 → 174 for the beat windows
})

test('T-C7a: the ripple travels 1 length per beat at 90 < bpm ≤ 180, per 8th ≤ 90, per 2 beats > 180; ≤ 3 Hz; never back', () => {
  for (const bpm of [0, 90, 140, 174, 200]) {
    const fr = drive(10 * FPS, () => ({ bass: 0.8 }), { bpm })
    const hz = (fr.at(-1)!.s.ripplePhase - fr[FPS].s.ripplePhase) / 9
    expect(hz, `bpm ${bpm}`).toBeCloseTo((ripplePerBeat(bpm || 174) * (bpm || 174)) / 60, 1)
    expect(hz).toBeLessThanOrEqual(3.0 + 1e-9)
    expect(fr.every((x, i) => !i || x.s.ripplePhase >= fr[i - 1].s.ripplePhase)).toBe(true)
  }
})

test('T-B1 + T-R7: presence binds reeseLevel (not the camera presence); one built-in uses native/serpent with the def binds', () => {
  expect(serpent.bind!.presence.source).toBe('reeseLevel')
  const docs = BUILTIN.filter((d) => d.layers.some((l) => l.gen.ref === 'native/serpent'))
  expect(docs.map((d) => d.id)).toEqual(['builtin:neuro-serpent'])
  expect(docs[0].layers[0].gen.bind).toEqual(serpent.bind)
})

test('fix 1 (F-01, F-03): Groove reads w 7.8–9 % FH at angle A; the whip loop (its apex ring) stays in frame', () => {
  const fire = 8 * BAR, rig = createSerpent(3), rings = new Float32Array(RINGS * RING), parts = new Float32Array(MAXP * PART)
  const groove: number[] = []
  let out = 0, seen = 0
  for (let i = 0; i < Math.round((fire + 4 * BAR) * FPS); i++) {
    const t = i / FPS, v = { bass: t > fire ? 0.85 : 0.1, build: t < fire ? (0.9 * t) / fire : 0, drop: dropSrc(t, [fire]), orbit: 0, yaw: 30, pitch: 12 }
    const vp = rig.step({ v, beat: (t * BPM) / 60, bpm: BPM, now: t, dt: 1 / FPS, aspect: ASPECT }, rings, parts).vp
    const s = rig.state()
    const j = s.loop >= 0 ? Math.round(s.loop * (RINGS - 1)) : -1
    if (j >= 0) { // the loop's apex ring (the pan's target): its ndc
      const [x, y, z] = rings.subarray(j * RING, j * RING + 3), cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15]
      out = Math.max(out, Math.abs((vp[0] * x + vp[4] * y + vp[8] * z + vp[12]) / cw), Math.abs((vp[1] * x + vp[5] * y + vp[9] * z + vp[13]) / cw))
      seen++
    }
    if (t > fire + BAR && s.phase === 'groove') groove.push(s.wFH)
  }
  const med = groove.sort((a, b) => a - b)[groove.length >> 1]
  expect(med).toBeGreaterThanOrEqual(7.8) // FRAME 1 (v1 framing) read 7.4 here; the creative's Groove w is 9 % FH
  expect(med).toBeLessThanOrEqual(9)
  expect(seen).toBeGreaterThanOrEqual(15) // the loop lasts 1 beat (≈ 20 frames at 174 BPM)
  expect(out).toBeLessThanOrEqual(1) // inside the frame (the pan box is ±0.8); no pan (PAN_BOX 99): 3.5
})
