// The pure core of native/amen-shatter (matrix_amen_shatter.md §2 unit rows, S3 spike set): synthetic hit streams at
// 60 fps (now = audioNow = frame ÷ fps, never performance.now(); T-V10 and T-G7 split the two), 174 BPM unless named, hits as features.ts envelopes
// (1 on the drain frame, 1/e per τ: kick, snare .12 s, hats .06 s). Test names start with the matrix ID (-t <ID>).
import { describe, expect, test, vi } from 'vitest'
import type { Drum } from '../audio/drums'
import { createFeatures } from '../audio/features'
import { PRESETS } from '../audio/presets'
import { gain, type Sources } from '../bind'
import { BUILTIN } from './builtin'
import { barPhase, CELLS, COLS, compose, createShatter, LAYOUTS, rose, ROWS, S3_SEED, shatter, slotOf, type Move, type ShatterIn, type ShatterState } from './shatter'

vi.mock('../gl/engine', () => ({ fullscreenProgram: () => () => {} })) // the engine takes the page's canvas at import

test('T-R7 builtin:amen-shatter: 1 entry, 1 layer, the native only, 0 fx; its binds and seed repeat the def', () => {
  const d = BUILTIN.filter((x) => x.id === 'builtin:amen-shatter')
  expect(d).toHaveLength(1)
  expect(d[0].layers).toHaveLength(1)
  expect([d[0].layers[0].gen.ref, d[0].layers[0].fx.length]).toEqual(['native/amen-shatter', 0])
  expect(d[0].layers[0].gen.bind).toEqual(shatter.bind)
  expect(d[0].layers[0].gen.values?.seed).toBe(S3_SEED)
  expect(shatter.flash).toEqual(['burst', 'kickFlare', 'snareFlare'])
})

const BPM = 174, FPS = 60
const TAU: Record<Drum, number> = { kick: 0.12, snare: 0.12, hats: 0.06 }
type Pat = Partial<Record<Drum, readonly number[]>> // slots 0–15 of a bar
type Hits = Record<Drum, number[]>
const TWO: Pat = { kick: [0, 10], snare: [4, 12], hats: [0, 2, 4, 6, 8, 10, 12, 14] }
const slotT = (n: number, bpm = BPM) => (n * 15) / bpm // the grid time of 16th n
/** Hit times of `pat` over bars [from, to), `lag(n, drum)` s after each grid line, the pattern `shift` slots later. */
function hits(pat: Pat, from: number, to: number, o: { bpm?: number; lag?: (n: number, d: Drum) => number; shift?: number; t0?: number; skip?: (bar: number, slot: number, d: Drum) => boolean } = {}, into: Hits = { kick: [], snare: [], hats: [] }): Hits {
  for (let b = from; b < to; b++)
    for (const d of ['kick', 'snare', 'hats'] as Drum[])
      for (const s of pat[d] ?? []) {
        if (o.skip?.(b, s, d)) continue
        const n = 16 * b + s + (o.shift ?? 0)
        into[d].push((o.t0 ?? 0) + slotT(n, o.bpm) + (o.lag?.(n, d) ?? 1 / FPS))
      }
  return into
}
const merge = (...hs: Hits[]): Hits => ({ kick: hs.flatMap((h) => h.kick).sort((a, b) => a - b), snare: hs.flatMap((h) => h.snare).sort((a, b) => a - b), hats: hs.flatMap((h) => h.hats).sort((a, b) => a - b) })
const drainF = (t: number, fps: number) => Math.ceil(t * fps - 1e-9)

interface Snap { i: number; t: number; st: ShatterState; src: Uint8Array; bands: number[]; strips: number[]; stamps: number[]; moves: Move[]; swaps: number[]; edges: Uint8Array; stampP: Float32Array; rise: Record<Drum, boolean> }
interface Opt { hits?: Hits; bpm?: number | ((t: number, i: number) => number); beat?: (t: number, i: number) => number; drop?: (t: number, i: number) => number; build?: (t: number, i: number) => number; seed?: number; fps?: number; now?: (i: number) => number; audioNow?: (i: number) => number; x?: (i: number, t: number) => Partial<ShatterIn> }
/** Runs a fresh core `frames` frames; a snapshot per frame (the state's arrays copied). */
function drive(frames: number, o: Opt = {}): Snap[] {
  const fps = o.fps ?? FPS, core = createShatter(o.seed ?? S3_SEED), out: Snap[] = []
  const cells = new Uint8Array(4 * CELLS), edges = new Uint8Array(4 * CELLS), stampP = new Float32Array(64)
  const h = o.hits ?? { kick: [], snare: [], hats: [] }
  const df = { kick: h.kick.map((t) => drainF(t, fps)), snare: h.snare.map((t) => drainF(t, fps)), hats: h.hats.map((t) => drainF(t, fps)) }
  const ptr = { kick: 0, snare: 0, hats: 0 }, lastD = { kick: -1e9, snare: -1e9, hats: -1e9 }
  for (let i = 0; i < frames; i++) {
    const t = o.now ? o.now(i) : i / fps, a = o.audioNow ? o.audioNow(i) : t // the beat follows the audio clock
    const rise = { kick: false, snare: false, hats: false }
    const env = {} as Record<Drum, number>
    for (const d of ['kick', 'snare', 'hats'] as Drum[]) {
      while (ptr[d] < df[d].length && df[d][ptr[d]] <= i) { lastD[d] = df[d][ptr[d]++]; rise[d] = lastD[d] === i }
      env[d] = Math.exp(-(i - lastD[d]) / fps / TAU[d])
    }
    const bpm = typeof o.bpm === 'function' ? o.bpm(t, i) : (o.bpm ?? BPM)
    const x: ShatterIn = {
      beat: o.beat ? o.beat(t, i) : bpm > 0 ? (a * bpm) / 60 : 0, bpm, conf: bpm > 0 ? 0.6 : 0, now: t, audioNow: a,
      kick: env.kick, snare: env.snare, hats: env.hats, build: o.build?.(t, i) ?? 0, drop: o.drop?.(t, i) ?? 0, bass: 0.5, sub: 0, seams: 1,
      burst: 0, kickFlare: env.kick, snareFlare: env.snare, ...o.x?.(i, t),
    }
    const st = core.step(x, cells, edges, stampP)
    out.push({ i, t, st: { ...st }, src: st.src.slice(), bands: [...st.bands], strips: [...st.strips], stamps: [...st.stamps], moves: [...st.moves], swaps: [...st.swaps], edges: edges.slice(), stampP: stampP.slice(), rise })
  }
  return out
}
const frames = (bars: number, bpm = BPM) => Math.ceil(slotT(16 * bars, bpm) * FPS)
const all = (s: Snap[]) => s.flatMap((f) => f.moves.map((m) => ({ ...m, i: f.i })))
const whole = (f: Snap) => f.src.every((v, i) => v === i)
const kickish = (m: Move) => m.cause === 'kick' || m.cause === 'predicted'
/** A held run (E6): `bars` bars of two-step locked, then a `drop` rise at `at` slots into the next bar, then `after` bars. */
function held(bars = 8, after = 5, at = 2, o: Opt = {}) {
  const T0 = slotT(16 * bars + at) + 0.005
  const f = drive(frames(bars + after + 1), { hits: hits(TWO, 0, bars + after + 1), drop: (t) => (t >= T0 ? Math.exp(-(t - T0)) : 0), ...o })
  return { f, t0: f.findIndex((x) => x.st.recipe === 'hold'), sh: f.findIndex((x) => x.moves.some((m) => m.kind === 'shatter')) }
}

describe('Amen Shatter core: clock, phase, compose', () => {
  test('slotOf: the −0.4 bias (a hit up to .9 slot late keeps its slot) and the wrap', () => {
    expect([0, 0.2, 0.226, 1, 3.97, 3.98, -0.25].map(slotOf)).toEqual([0, 0, 1, 4, 15, 0, 15]) // the crossing into 16th n is at n − .1
  })
  test('barPhase: two-step at 4 rotations; null under 6 hits and on the half-time ties', () => {
    for (const r of [0, 4, 8, 12]) {
      const h = { k: new Float32Array(16), s: new Float32Array(16), hits: 8 }
      for (const s of [0, 10]) h.k[(s + r) % 16] = 4
      for (const s of [4, 12]) h.s[(s + r) % 16] = 4
      expect(barPhase(h)).toBe(r)
      expect(barPhase({ ...h, hits: 5 })).toBe(null)
    }
    const half = { k: new Float32Array(16), s: new Float32Array(16), hits: 8 }
    half.k[0] = half.s[8] = 4
    expect(barPhase(half)).toBe(null)
  })
  test('compose: a permutation of 0–159 for any offsets, layouts and swaps', () => {
    const out = new Uint8Array(CELLS)
    for (let n = 0; n < 200; n++) {
      const b = Int8Array.from({ length: 4 }, (_, i) => ((n * 7 + i * 3) % 9) - 4), s = Int8Array.from({ length: 16 }, (_, i) => ((n * 5 + i) % 9) - 4)
      compose(b, LAYOUTS[n % 6], s, [n % 160, (n * 13) % 160], out)
      expect(new Set(out).size).toBe(CELLS)
    }
  })
})

describe('Amen Shatter core: kick prediction (K1–K5)', () => {
  test('T-V1 hats rises and snares confirm nothing: 1 predicted, 1 retract on the next crossing, 0 kept', () => {
    const h = merge(hits(TWO, 0, 8), hits({ snare: [4, 12], hats: [0, 2, 4, 6, 8, 10, 12, 14] }, 8, 10))
    const f = drive(frames(10), { hits: h }), from = Math.ceil(slotT(128) * FPS) - 2
    const tail = all(f.slice(from)), p = tail.filter((m) => m.cause === 'predicted'), r = tail.filter((m) => m.cause === 'retract')
    expect([p.length, r.length]).toEqual([1, 1])
    const nextX = f.findIndex((x, i) => i > p[0].i && x.st.crossed)
    expect(r[0].i).toBe(nextX)
    expect(f[r[0].i].bands).toEqual(f[p[0].i - 1].bands)
  })
  test('T-V2 kick rises 0–4 frames after their crossing: 0 retracts; a rise in the next visit: 1 retract + 1 kick-cause move', () => {
    // each kick 0–4 frames after its crossing (the crossing into slot n is at 16th n − .1)
    const h = merge(hits({ kick: [0, 10] }, 0, 8, { lag: (n) => slotT(n - 0.1) - slotT(n) + ((n * 7) % 5) / FPS + 1e-4 }), hits({ snare: [4, 12] }, 0, 9), hits({ kick: [10] }, 8, 9))
    h.kick.push(slotT(16 * 8 + 1) + 1 / FPS) // bar 8: the slot-0 kick lands in the slot-1 visit
    h.kick.sort((a, b) => a - b)
    const f = drive(frames(9), { hits: h }), m = all(f), cut = Math.ceil(slotT(128) * FPS) - 3
    expect(m.filter((x) => x.cause === 'retract' && x.i < cut)).toHaveLength(0)
    expect(m.filter((x) => x.cause === 'predicted' && x.i < cut).length).toBeGreaterThan(8)
    const late = m.filter((x) => x.i >= cut && x.i < cut + 20)
    expect(late.filter((x) => x.cause === 'retract')).toHaveLength(1)
    expect(late.filter((x) => x.cause === 'kick' && (x.kind === 'shove' || x.kind === 'ghost'))).toHaveLength(1) // K4: a shove or a ghost
  })
  test('T-V3 a retract restores src and bands exactly; the next bar shoves as the bar before', () => {
    const h = merge(hits(TWO, 0, 10, { skip: (b, s, d) => b === 8 && s === 0 && d === 'kick' }))
    const f = drive(frames(10), { hits: h })
    const p = all(f).filter((m) => m.cause === 'predicted' && f[m.i].t > slotT(128) - 0.02)[0], r = all(f).find((m) => m.cause === 'retract')!
    expect(f[r.i].src).toEqual(f[p.i - 1].src)
    expect(f[r.i].bands).toEqual(f[p.i - 1].bands)
    const at = (bar: number) => f[all(f).find((m) => kickish(m) && m.kind === 'shove' && f[m.i].t >= slotT(16 * bar) - 0.02)!.i].bands
    expect(at(9)).toEqual(at(7))
  })
  test('T-C4a every unconfirmed predicted shove retracts on the next crossing (1- and 2-bar kick dropouts)', () => {
    const drop = new Set([9, 14, 15, 22, 30, 31])
    const f = drive(3600, { hits: hits(TWO, 0, 45, { skip: (b, _s, d) => d === 'kick' && drop.has(b) }) })
    let unconf = 0
    for (const m of all(f).filter((x) => x.cause === 'predicted')) {
      const nx = f.findIndex((x, i) => i > m.i && x.st.crossed)
      if (nx < 0) continue
      if (f[nx - 1].st.pending >= 0) {
        unconf++
        expect(f[nx].moves.some((x) => x.cause === 'retract')).toBe(true)
      }
    }
    expect(unconf).toBe(4) // 4 dropouts (bars 9, 14–15, 22, 30–31): the pause allows 1 false shove each
    expect(all(f).filter((x) => x.cause === 'retract')).toHaveLength(unconf)
  })
  test('T-C4b 60 s: 0 moves without a trigger; ≤ 1 retract between two kick rises', () => {
    const drop = new Set([9, 14, 15, 22, 30, 31])
    const f = drive(3600, { hits: hits(TWO, 0, 45, { skip: (b, _s, d) => d === 'kick' && drop.has(b) }), build: (t) => (t > 40 && t < 46 ? 0.5 : 0) })
    for (const x of f)
      for (const m of x.moves) {
        const ok = m.cause === 'kick' ? x.rise.kick : m.cause === 'snare' ? x.rise.snare : m.cause === 'hats' ? x.rise.hats : x.st.crossed
        expect(ok, `${m.kind}/${m.cause} @${x.i}`).toBe(true)
      }
    let n = 0
    for (const x of f) {
      if (x.rise.kick) n = 0
      n += x.moves.filter((m) => m.cause === 'retract').length
      expect(n).toBeLessThanOrEqual(1)
    }
  })
  test('T-D3 a second kick rise inside one visit is absorbed: 1 shove for the visit', () => {
    const h = hits(TWO, 0, 9)
    const k = slotT(16 * 8) + 1 / FPS
    h.kick.push(k + 3 / FPS) // + 50 ms, the same visit (a slot lasts 5.2 frames)
    h.kick.sort((a, b) => a - b)
    const f = drive(frames(9), { hits: h })
    const v = all(f).filter((m) => kickish(m) && Math.abs(f[m.i].t - k) < 0.06)
    expect(v).toHaveLength(1)
  })
  test('T-D4 tempo change 174 → 140: histogram reset; 0 predicted in the first new bar; then ≥ 80 % on the kick', () => {
    const tc = slotT(128), h = merge(hits(TWO, 0, 8), hits(TWO, 0, 10, { bpm: 140, t0: tc }))
    const f = drive(Math.ceil((tc + slotT(160, 140)) * FPS), { hits: h, bpm: (t) => (t < tc ? 174 : 140), beat: (t) => (t < tc ? (t * 174) / 60 : 32 + ((t - tc) * 140) / 60) })
    const ic = Math.ceil(tc * FPS)
    expect(f[ic].st.hits).toBeLessThanOrEqual(1)
    const p = all(f).filter((m) => m.cause === 'predicted')
    expect(p.filter((m) => f[m.i].t >= tc && f[m.i].t < tc + slotT(16, 140))).toHaveLength(0)
    const late = p.filter((m) => f[m.i].t >= tc + slotT(32, 140))
    const near = late.filter((m) => h.kick.some((k) => Math.abs(drainF(k, FPS) - m.i) <= 2))
    expect(late.length).toBeGreaterThan(4)
    expect(near.length / late.length).toBeGreaterThanOrEqual(0.8)
  })
  test('T-R6q predicted shoves fire on crossings; kick-cause moves ≤ 2 frames after the kick onset', () => {
    const f = drive(3600, { hits: hits(TWO, 0, 45, { lag: (n) => ((n * 3) % 2) / FPS + 0.005 }) })
    const h = hits(TWO, 0, 45, { lag: (n) => ((n * 3) % 2) / FPS + 0.005 })
    for (const m of all(f)) {
      if (m.cause === 'predicted') expect(f[m.i].st.crossed).toBe(true)
      if (m.cause === 'kick') expect(h.kick.some((k) => m.i - k * FPS >= -1 && m.i - k * FPS <= 2)).toBe(true)
    }
  })
})

describe('Amen Shatter core: the monotonic clock (M1–M4)', () => {
  const roll = { build: () => 0.5 }
  test('T-V4 a −0.03 beat step after the crossing into slot 5 fires no extra crossing or stamp', () => {
    const n = frames(4)
    const ctl = drive(n, { hits: hits(TWO, 0, 4), ...roll })
    const at = ctl.findIndex((x) => x.st.crossed && x.st.slot === 5 && x.t > slotT(32))
    const f = drive(n, { hits: hits(TWO, 0, 4), ...roll, beat: (t, i) => (t * BPM) / 60 - (i > at ? 0.03 : 0) })
    const xs = (s: Snap[], to: number) => s.slice(0, to).filter((x) => x.st.crossed).length
    expect(xs(f, n - 3)).toBe(xs(ctl, n - 3))
    for (let i = at + 1; i < at + 4; i++) expect(f[i].st.crossed || f[i].stamps.some((s) => s === f[i].st.frame)).toBe(false)
  })
  test('T-V5 a −0.2 then +0.2 beat jump: breaks with hits 0, rho null, no armed slot, 0 crossings, 0 stamps', () => {
    const n = frames(10), j1 = frames(8) + 2, j2 = j1 + 30
    const f = drive(n, { hits: hits(TWO, 0, 10), build: () => 0.5, beat: (t, i) => (t * BPM) / 60 + (i >= j1 && i < j2 ? -0.2 : 0) })
    expect(f[j1 - 1].st.hits).toBeGreaterThan(6)
    for (const j of [j1, j2]) {
      const s = f[j]
      expect([s.st.hits, s.st.rho, s.st.armed, s.st.crossed, s.stamps.filter((x) => x === s.st.frame).length]).toEqual([0, null, 0, false, 0])
    }
  })
  test('T-V6 a frame that advances 3 slots: 1 crossing, ≤ 1 stamp, hits kept; a random walk: ≤ 1 stamp per frame', () => {
    const n = frames(9), g = frames(8) + 2, gap = 3 * slotT(1)
    const f = drive(n, { hits: hits(TWO, 0, 9), build: () => 0.5, now: (i) => i / FPS + (i >= g ? gap : 0) })
    expect(f[g].st.crossed).toBe(true)
    expect(f[g].st.hits).toBeGreaterThanOrEqual(f[g - 1].st.hits)
    expect(f[g].stamps.filter((x) => x === f[g].st.frame).length).toBeLessThanOrEqual(1)
    let s = 7, b = 0
    const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296)
    const w = drive(1000, { build: () => 0.5, hits: hits(TWO, 0, 30), beat: () => (b += rnd() * 0.7 - 0.1) })
    for (const x of w) expect(x.stamps.filter((v) => v === x.st.frame).length).toBeLessThanOrEqual(1)
  })
})

describe('Amen Shatter core: entry and the drop recipe (E1–E6, N-1)', () => {
  test('T-V7 cold cut-in at a drop: hold on frame 1, shattered on the first beat crossing ≥ .75 beat, wide at the 2nd snare rise, rho null', () => {
    const f = drive(frames(4), { hits: hits(TWO, 0, 4), drop: (t) => 0.8 * Math.exp(-t) })
    expect([f[0].st.mode, f[0].st.recipe]).toEqual(['locked', 'hold'])
    const sh = f.findIndex((x) => x.st.recipe === 'shattered')
    expect(f[sh].st.crossed && f[sh].st.slot % 4 === 0).toBe(true)
    const beat = (f[sh].t * BPM) / 60
    expect(beat).toBeGreaterThanOrEqual(0.75 - 0.026)
    expect(beat).toBeLessThan(1.75)
    const wide = f.findIndex((x) => x.st.recipe === 'none' && x.st.tier === 'wide')
    const snares = f.slice(sh, wide + 1).filter((x) => x.rise.snare)
    expect(snares.length).toBe(2)
    expect(f[wide].rise.snare).toBe(true)
    for (const x of f.slice(0, wide + 1)) expect(x.st.rho).toBe(null)
  })
  test('T-V8 free mode: shattered at T0 + 350 ms of now', () => {
    const f = drive(60, { bpm: 0, drop: (_t, i) => (i === 0 ? 0.8 : 0) })
    expect(f[0].st.recipe).toBe('hold')
    const sh = f.findIndex((x) => x.st.recipe === 'shattered')
    expect(Math.abs(f[sh].t - 0.35)).toBeLessThanOrEqual(1 / FPS)
  })
  test('T-V9 held run: the 4 bars after the shatter carry ≥ 1.8 × the mean offset of the 4 bars before T0', () => {
    const { f, t0, sh } = held()
    const mean = (s: Snap[]) => s.reduce((a, x) => a + (x.bands.reduce((p, v) => p + Math.abs(v), 0) + x.strips.reduce((p, v) => p + Math.abs(v), 0)) / 20, 0) / s.length
    const bar = Math.round(slotT(16) * FPS)
    const ratio = mean(f.slice(sh, sh + 4 * bar)) / mean(f.slice(t0 - 4 * bar, t0))
    expect(ratio).toBeGreaterThanOrEqual(1.8)
  })
  test.each([0, 2, 5, 9, 13])('T-C10a held run (drop at slot %i): whole on T0 and T0 + 1; hold .75–1.75 beat; the shatter on a beat crossing', (at) => {
    const { f, t0, sh } = held(8, 3, at)
    expect(whole(f[t0]) && whole(f[t0 + 1])).toBe(true)
    const hold = ((f[sh].t - f[t0].t) * BPM) / 60
    expect(hold).toBeGreaterThanOrEqual(0.75 - 0.026 - 1 / FPS * BPM / 60)
    expect(hold).toBeLessThanOrEqual(1.75)
    expect(f[sh].st.crossed && f[sh].st.slot % 4 === 0).toBe(true)
  })
  test.each([0, 2, 5, 9, 13])('T-C10b held run (drop at slot %i): at shatter + 0.1 s all 4 bands and 8 strips displaced', (at) => {
    const { f, sh } = held(8, 3, at), x = f[sh + 6]
    expect(x.bands.filter((b) => b !== 0).length + x.strips.filter((s) => s !== 0).length).toBe(12)
  })
  test('T-N1a cold entry with drum levels on frame 1: 0 moves before the shatter, 0 hits from the frame-1 levels', () => {
    const f = drive(80, { drop: (t) => 0.8 * Math.exp(-t), x: (i) => (i === 0 ? { hats: 0.3, kick: 0.4, snare: 0.2 } : { hats: 0.3 * Math.exp(-i / 3.6), kick: 0.4 * Math.exp(-i / 7.2), snare: 0.2 * Math.exp(-i / 7.2) }) })
    const sh = f.findIndex((x) => x.st.recipe === 'shattered')
    expect(sh).toBeGreaterThan(0)
    expect(f.slice(0, sh).flatMap((x) => x.moves)).toHaveLength(0)
    expect(f[sh].st.hits).toBe(0)
  })
  test('T-N1b hits on every slot: 0 moves in the hold, in shattered before its slam, and in the first 2 slots; hits still rise', () => {
    const every: Pat = { kick: [...Array(16).keys()], snare: [...Array(16).keys()], hats: [...Array(16).keys()] }
    const e = drive(frames(1), { hits: hits(every, 0, 1) })
    const x2 = e.findIndex((_x, i) => i > 0 && e.slice(1, i + 1).filter((y) => y.st.crossed).length === 2)
    expect(e.slice(0, x2).flatMap((x) => x.moves)).toHaveLength(0)
    const T0 = slotT(16 * 8 + 2) + 0.005
    const f = drive(frames(11), { hits: merge(hits(TWO, 0, 8), hits(every, 8, 11)), drop: (t) => (t >= T0 ? Math.exp(-(t - T0)) : 0) })
    const t0 = f.findIndex((x) => x.st.recipe === 'hold'), sh = f.findIndex((x) => x.st.recipe === 'shattered'), slam = f.findIndex((x, i) => i > sh && x.st.recipe === 'none')
    expect(f.slice(t0 + 1, sh).flatMap((x) => x.moves)).toHaveLength(0)
    expect(f.slice(sh + 1, slam).flatMap((x) => x.moves)).toHaveLength(0)
    expect(f[slam].moves.map((m) => m.kind)).toEqual(['slam'])
    expect(f[sh].st.hits).toBeGreaterThan(f[t0].st.hits)
  })
})

describe('Amen Shatter core: the bar cycle (C2, C6–C9, C13, C14, V10–V12)', () => {
  const run60 = () => drive(3600, { hits: merge(hits(TWO, 0, 45, { skip: (b, s, d) => d === 'kick' && (b === 9 || b === 22) && s === 0 }), hits({ kick: [3, 7] }, 12, 14)), build: (t) => (t > 30 && t < 36 ? 0.5 : t > 50 && t < 53 ? 0.25 : 0), drop: (t) => (t > 40 ? Math.exp(-(t - 40)) : 0) })
  test('T-C2a 60 s: compose is a permutation of 0–159 on every frame', () => {
    for (const x of run60()) expect(new Set(x.src).size).toBe(CELLS)
  })
  test('T-C13c 60 s: ≤ 6 single cells displaced per frame; whole-cell offsets only', () => {
    const f = run60()
    expect(f.some((x) => x.swaps.length > 0)).toBe(true)
    for (const x of f) {
      expect(2 * x.swaps.length).toBeLessThanOrEqual(6)
      expect([...x.bands, ...x.strips].every(Number.isInteger)).toBe(true)
    }
  })
  /** Per bar of the phrase after `skip` bars: the slice table (src) at each slot's last frame. */
  function tables(f: Snap[], from: number, bars: number, shift = 0) {
    const out: string[][] = []
    for (let b = from; b < from + bars; b++) {
      out.push([])
      for (let s = 0; s < 16; s++) out.at(-1)!.push(f[Math.floor(slotT(16 * b + s + 0.8 + shift) * FPS)].src.join())
    }
    return out
  }
  function cycle(shift: number) {
    const f = drive(frames(18), { hits: hits(TWO, 0, 18, { shift: 4 * shift }) })
    const first = f.find((x) => x.st.rho !== null)!
    // C6: one phrase (4 bars: the phrase moves on at a slam, with the frame whole) after the rho adoption
    const start = Math.ceil((first.t / slotT(16)) + 1)
    const p0 = f[Math.floor(slotT(16 * start + 4 * shift) * FPS)].st.phrase + 1
    const b0 = [...Array(18).keys()].find((b) => f[Math.floor(slotT(16 * b + 4 * shift + 0.5) * FPS)]?.st.phrase === p0)!
    const tb = tables(f, b0, 4, 4 * shift)
    let c6 = true
    for (let s = 0; s < 16; s++) {
      const col = tb.map((b) => b[s]), mode = Math.max(...col.map((v) => col.filter((w) => w === v).length))
      if (mode < 3) c6 = false
    }
    // C7 on bars after the adoption
    let c7 = true
    for (let b = start; b < start + 6; b++) {
      const a = Math.ceil(slotT(16 * b + 4 * shift) * FPS), z = Math.ceil(slotT(16 * (b + 1) + 4 * shift) * FPS), bar = f.slice(a, z)
      const slams = bar.flatMap((x) => x.moves).filter((m) => m.kind === 'slam').length
      const wholeSlots = new Set(bar.filter(whole).map((x) => Math.floor((x.t / slotT(1)) + 0.1))).size
      const tableaux = new Set(bar.map((x) => x.src.join())).size
      if (slams !== 1 || wholeSlots < 2 || tableaux < 3) c7 = false
    }
    return { c6, c7 }
  }
  test('T-C6 one phrase, unchanged two-step: the slice table at each slot repeats in ≥ 3 of 4 bars', () => {
    expect(cycle(0).c6).toBe(true)
  })
  test('T-C7 locked two-step: exactly 1 slam per bar, whole for ≥ 2 slots, ≥ 3 tableaux', () => {
    expect(cycle(0).c7).toBe(true)
  })
  test.each([1, 2, 3])('T-C8 bar phase forced + %i beats: C6 and C7 still hold', (k) => {
    expect(cycle(k)).toEqual({ c6: true, c7: true })
  })
  test('T-C9 the roll: 8 stamped columns at build .15–.40, ≥ 12 at ≥ .40; stamps on 8th / 16th crossings, 1 per step, no freeze', () => {
    const b1 = 8, f = drive(frames(b1 + 3), { hits: hits(TWO, 0, b1 + 3), build: (t) => (t < slotT(16 * b1 - 0.5) ? 0 : t < slotT(16 * (b1 + 1) - 0.5) ? 0.3 : 0.6) }) // each level from the bar's first crossing (16th − .1)
    const end = (b: number) => f[Math.floor(slotT(16 * b) * FPS) - 1]
    expect(end(b1 + 1).stamps.filter((s) => s >= 0)).toHaveLength(8)
    expect(end(b1 + 2).stamps.filter((s) => s >= 0).length).toBeGreaterThanOrEqual(12)
    for (const x of f) {
      const n = x.stamps.filter((s) => s === x.st.frame).length
      expect(n).toBeLessThanOrEqual(1)
      if (n) expect(x.st.crossed && (x.st.roll === 16 || x.st.slot % 2 === 0)).toBe(true)
      const on = x.stamps.filter((s) => s >= 0)
      if (on.length > 1) expect(new Set(on).size).toBeGreaterThan(1) // never a whole-frame freeze
    }
  })
  test('F-2 / F-3 stamps at 16ths sit ¼ ring spacing apart (build .6 speeds the live rings); all clear on the frame the roll stops', () => {
    const b1 = 8, f = drive(frames(b1 + 3), { hits: hits(TWO, 0, b1 + 3), build: (t) => (t >= slotT(16 * b1 - 0.5) && t < slotT(16 * b1 + 22) ? 0.6 : 0) })
    const off = f.findIndex((x, i) => i > 0 && f[i - 1].st.roll === 16 && x.st.roll === 0), last = f[off - 1]
    const cols = [...last.stamps.keys()].filter((c) => last.stamps[c] >= 0).sort((a, b) => last.stamps[a] - last.stamps[b])
    expect(cols).toHaveLength(16)
    for (let k = 1; k < 16; k++) expect(last.stampP[4 * cols[k]] - last.stampP[4 * cols[k - 1]]).toBeCloseTo(0.25, 6)
    expect(f[off].stamps.every((s) => s < 0)).toBe(true)
  })
  test('F-1 the 2nd kick accent shoves set B (A right, B left), held to the slam; after a retract the next kick shoves set A', () => {
    const f = drive(frames(10), { hits: hits(TWO, 0, 10, { skip: (b, s, d) => b === 8 && s === 0 && d === 'kick' }) })
    const inBar = (b: number) => all(f).filter((m) => f[m.i].t >= slotT(16 * b - 0.5) && f[m.i].t < slotT(16 * b + 15.5))
    const s7 = inBar(7).filter((m) => kickish(m) && m.kind === 'shove'), slam7 = inBar(7).find((m) => m.kind === 'slam')!
    expect(s7).toHaveLength(2)
    for (let i = s7[1].i; i < slam7.i; i++) expect(f[i].bands).toEqual([2, -2, 2, -2])
    const b8 = inBar(8), k8 = b8.filter((m) => m.cause === 'kick' && m.kind === 'shove')
    expect(b8.filter((m) => m.cause === 'retract')).toHaveLength(1)
    expect(k8).toHaveLength(1)
    expect(f[k8[0].i].bands).toEqual([2, 0, 2, 0])
  })
  test('T-C14 QUIET: 2 bars without kick and snare → home, 0 shoves, 0 cracks; same audio + seed → identical tables', () => {
    const o = { hits: merge(hits(TWO, 0, 6, { skip: (b, s, d) => b === 5 && s > 10 && d !== 'hats' }), hits({ hats: TWO.hats }, 6, 9)) }
    const f = drive(frames(9), o), g = drive(frames(9), o)
    const lastHit = slotT(16 * 5 + 10)
    const after = f.filter((x) => x.t > lastHit + 0.05)
    expect(after[0].src.every((v, i) => v === i)).toBe(false) // displaced: shove B at slot 10
    // the kick dropout's one predicted shove + its retract (K1/K3, the lead's C4 bound) is the only shove; 0 cracks
    expect(after.flatMap((x) => x.moves).filter((m) => m.kind === 'shove' || m.kind === 'crack').map((m) => m.cause)).toEqual(['predicted', 'retract'])
    const q = f.findIndex((x) => x.st.tier === 'quiet' && x.t > lastHit)
    expect(f[q].moves.map((m) => m.kind)).toEqual(['home'])
    expect(f.slice(q + 1).flatMap((x) => x.moves).filter((m) => m.kind !== 'tick')).toHaveLength(0)
    const endBar2 = f[Math.floor(slotT(16 * 8 - 0.5) * FPS)]
    expect(endBar2.bands.every((b) => b === 0) && endBar2.strips.every((s) => s === 0)).toBe(true)
    expect(endBar2.st.tier).toBe('quiet')
    expect(f.map((x) => x.src.join() + x.edges.join())).toEqual(g.map((x) => x.src.join() + x.edges.join()))
  })
  test('T-D1 discrimination: hats-only and snare-only make 0 kick moves; every snare and every kick makes its own move', () => {
    const f = drive(frames(8), { hits: merge(hits({ hats: TWO.hats }, 0, 2), hits({ snare: [4, 12] }, 2, 4), hits({ kick: [0, 10] }, 4, 8)) })
    const seg = (a: number, b: number) => f.filter((x) => x.t >= slotT(16 * a) && x.t < slotT(16 * b))
    for (const x of seg(0, 4)) expect(x.moves.filter((m) => m.cause === 'kick' || m.cause === 'predicted')).toHaveLength(0)
    for (const x of seg(2, 4).filter((y) => y.rise.snare)) expect(x.moves.filter((m) => m.cause === 'snare').length).toBe(1)
    const k = f.filter((x) => x.t >= slotT(80 - 0.5) && x.t < slotT(128 - 0.5)) // bars 5–7 from their first crossing
    expect(k.filter((x) => x.rise.kick).length).toBe(6)
    expect(k.flatMap((x) => x.moves).filter((m) => (kickish(m) && m.kind === 'shove') || (m.kind === 'slam' && m.cause === 'kick')).length).toBe(6) // a shove (or the 16-slot slam) per kick
  })
  test('T-D2 silence for 60 s (no grid and a grid): 0 moves, 0 hits, compose identity, every field finite', () => {
    for (const bpm of [0, BPM]) {
      const f = drive(3600, { bpm, x: () => ({ kick: 0, snare: 0, hats: 0, kickFlare: 0, snareFlare: 0, bass: 0 }) })
      for (const x of f) {
        expect(x.moves).toHaveLength(0)
        expect(x.st.hits).toBe(0)
        expect(whole(x)).toBe(true)
        expect(Object.values(x.st.plate).every(Number.isFinite) && Number.isFinite(x.st.hair)).toBe(true)
      }
    }
  })
  test('T-V10 free hold 350 ms and shatter release 400 ms of now at 60 and 120 fps; a 200 ms now gap keeps hits', () => {
    for (const fps of [60, 120]) {
      const f = drive(2 * fps, { fps, bpm: 0, drop: (_t, i) => (i === 0 ? 0.8 : 0), x: () => ({ burst: 1 }) })
      const sh = f.findIndex((x) => x.st.recipe === 'shattered')
      expect(Math.abs(f[sh].t - 0.35)).toBeLessThanOrEqual(1 / 60)
      const lvl = (x: Snap) => Math.max(...Array.from({ length: CELLS }, (_, i) => x.edges[4 * i]))
      const at = f.findIndex((x) => x.t >= f[sh].t + 0.4)
      expect(lvl(f[at]) / lvl(f[sh])).toBeCloseTo(Math.exp(-(f[at].t - f[sh].t) / 0.4), 1)
    }
    const g = frames(8) + 2, real = (i: number) => i / FPS // M-10: audioNow (and the beat) on real time, the gap moves now only
    const f = drive(frames(9), { hits: hits(TWO, 0, 9), now: (i) => real(i) + (i >= g ? 0.2 : 0), audioNow: real })
    expect(f[g].st.hits).toBeGreaterThanOrEqual(f[g - 1].st.hits) // no break on the gap frame (a break zeroes the histogram)
    expect(f[g].st.rho).toBe(f[g - 1].st.rho)
  })
  test('T-G7 clocks, audioNow ≠ now: the break residual runs on ΔaudioNow, the 170 ms one-shot on now', () => {
    const real = (i: number) => i / FPS, g = frames(8) + 2
    const breaks = (f: Snap[]) => f.filter((x, i) => i > 0 && x.st.hits < f[i - 1].st.hits).length // only a break zeroes hits
    expect(breaks(drive(frames(9), { hits: hits(TWO, 0, 9), now: (i) => real(i) + (i >= g ? 0.2 : 0), audioNow: real }))).toBe(0) // a 200 ms now gap
    expect(breaks(drive(frames(9), { hits: hits(TWO, 0, 9), audioNow: (i) => real(i) - (i >= g ? 12 / BPM : 0), beat: (t) => (t * BPM) / 60 }))).toBe(1) // a −0.2 beat audioNow jump
    // free mode: a kick one-shot 3 frames before the 200 ms now gap goes home on the first frame with now ≥ its now + 170 ms
    const k = FPS, f = drive(k + 30, { bpm: 0, hits: { kick: [k / FPS], snare: [], hats: [] }, now: (i) => real(i) + (i >= k + 3 ? 0.2 : 0), audioNow: real })
    const out = f.findIndex((x) => x.moves.some((m) => m.kind === 'shove' && m.cause === 'kick'))
    const due = f.findIndex((x) => x.t >= f[out].t + 0.17), home = f.findIndex((x, i) => i > out && whole(x))
    expect([out, due]).toEqual([k, k + 3]) // the gap falls inside the one-shot
    expect(Math.abs(home - due)).toBeLessThanOrEqual(1)
  })
  test('T-V11 half-time streams keep rho null; two-step adopts once, never changes, then slams once per bar', () => {
    let seed = 3
    const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296)
    const ghosts = (h: Hits, bars: number) => { for (let b = 0; b < bars; b++) (rnd() < 0.5 ? h.kick : h.snare).push(slotT(16 * b + Math.floor(rnd() * 16)) + 1 / FPS); return merge(h) }
    for (const pat of [{ kick: [0], snare: [8] }, { kick: [0, 8], snare: [4, 12] }]) {
      const f = drive(frames(32), { hits: ghosts(hits(pat, 0, 32), 32) })
      expect(f.every((x) => x.st.rho === null)).toBe(true)
    }
    const f = drive(frames(32), { hits: ghosts(hits(TWO, 0, 32), 32) })
    const changes = f.filter((x, i) => i > 0 && x.st.rho !== f[i - 1].st.rho)
    expect(changes).toHaveLength(1)
    const from = Math.ceil(changes[0].t / slotT(16)) + 1
    for (let b = from; b < 31; b++) {
      const bar = f.filter((x) => x.t >= slotT(16 * b) && x.t < slotT(16 * (b + 1)))
      expect(bar.flatMap((x) => x.moves).filter((m) => m.kind === 'slam')).toHaveLength(1)
    }
  })
  /** Rises (the core's rule) of a drum over a pair of hits `gap` s apart, the first at frame phase p/16, through
   *  features.fill and the user's sens (bind.ts gain(), as app.ts runs them). */
  function pairRises(drum: Drum, sens: number, p: number, gap = slotT(1)) {
    const f = createFeatures(), out: Sources = {}, s = { v: 1 as const, auto: false, pick: null, sens: { [drum]: sens }, mute: [], custom: [], analyser: 'ours' as const }
    const h = [0.1 + p / 16 / FPS, 0.1 + p / 16 / FPS + gap]
    let prev = 0, n = 0
    for (let i = 0; i < 30; i++) {
      const t = i / FPS
      while (h.length && h[0] <= t) f.hit({ drum, t: h.shift()!, strength: 4 })
      f.fill(out, 1 / FPS, s, PRESETS.default)
      gain(out, s)
      if (i > 0 && rose(prev, out[drum])) n++
      prev = out[drum]
    }
    return n
  }
  test('T-V12 snare pairs 86.2 ms apart, 16 frame phases, sens 1.0 and 1.2: 2 rises per pair (32 of 32)', () => {
    for (const sens of [1, 1.2]) for (let p = 0; p < 16; p++) expect(pairRises('snare', sens, p)).toBe(2)
  })
  test('T-V12k kick and hats pairs, 16 phases, sens 1.0: 2 rises per pair', () => {
    for (const d of ['kick', 'hats'] as Drum[]) for (let p = 0; p < 16; p++) expect(pairRises(d, 1, p)).toBe(2)
  })
  test('T-V12r the A-7 ceiling (recorded): sens 1.6 keeps every 16th, sens 2.0 loses every second rise', () => {
    const miss = (sens: number) => Array.from({ length: 16 }, (_, p) => 2 - pairRises('snare', sens, p)).reduce((a, b) => a + b, 0) / 16
    expect(miss(1.6)).toBe(0) // first recorded run: 0 / 16 missed
    expect(miss(2.0)).toBe(1) // first recorded run: 16 / 16 missed (the clamp at 1, lead ruling A-7)
  })
})

describe('Amen Shatter core: tiles (A-10)', () => {
  test('T-A10 60 s two-step with a kick fill: ≤ 3 opposing tile-step pairs per 1 s (disc cells, 4 × 3 tiles, 4 offsets)', () => {
    const f = drive(3600, { hits: merge(hits(TWO, 0, 45, { skip: (b, _s, d) => d === 'kick' && b === 20 }), hits({ kick: [0, 2, 4, 6, 8, 10, 12, 14] }, 20, 21)) })
    const [cx, cy] = f[0].st.centre, W = 1728, H = 1117, R = 1.2 * (W / 16)
    const disc = Array.from({ length: CELLS }, (_, i) => Math.hypot(((i % COLS) + 0.5) * (W / COLS) - cx * W, (Math.floor(i / COLS) + 0.5) * (H / ROWS) - cy * H) < R ? 1 : 0)
    const S = 12, gw = Math.ceil(W / S), gh = Math.ceil(H / S)
    let worst = 0
    for (const [ox, oy] of [[0, 0], [216, 0], [0, 186], [216, 186]]) {
      const means = f.map((x) => {
        const m = new Float64Array(12), n = new Float64Array(12)
        for (let gy = 0; gy < gh; gy++)
          for (let gx = 0; gx < gw; gx++) {
            const px = gx * S, py = gy * S, c = Math.floor((px * COLS) / W), r = Math.floor((py * ROWS) / H)
            const t = Math.min(3, Math.floor(((px + ox) % W) / (W / 4))) + 4 * Math.min(2, Math.floor(((py + oy) % H) / (H / 3)))
            m[t] += disc[x.src[c + COLS * r]]
            n[t]++
          }
        return m.map((v, i) => v / n[i])
      })
      for (let t = 0; t < 12; t++) {
        const steps: { i: number; s: number }[] = []
        for (let i = 1; i < means.length; i++) { const d = means[i][t] - means[i - 1][t]; if (Math.abs(d) > 0.1) steps.push({ i, s: Math.sign(d) }) }
        for (const a of steps) {
          const win = steps.filter((b) => b.i >= a.i && b.i < a.i + FPS)
          let pairs = 0
          for (let k = 1; k < win.length; k++) if (win[k].s !== win[k - 1].s) { pairs++; k++ }
          worst = Math.max(worst, pairs)
        }
      }
    }
    expect(worst).toBeLessThanOrEqual(3)
  })
})
