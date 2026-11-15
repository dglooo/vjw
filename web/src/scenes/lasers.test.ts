// The pure rig of native/lasers (matrix_rave_lasers.md: S3 spike T-L1a–g, T-L4, T-L5, T-L6, T-L9, T-L10, T-N3; S5.1
// T-TC, T-C14, T-C15, T-C11s, T-R2, T-C3, T-R3, T-R6a, T-R8a, T-R9), fed 60 frames per s at 174 BPM, conf 1,
// `RigIn.time` = frame ÷ 60 (never performance.now()), frame 1728×1117 (matrix §1). The GL is the browser check.
import { expect, test, vi } from 'vitest'
import { evaluate, SOURCE_IDS, type BindState } from '../bind'
import { BUILTIN } from './builtin'
import { createRig, EMITTERS, FIG, instLight, lasers, layoutMax, MAX_INST, STRIDE, tone, type LaserState } from './lasers'

const shader = vi.hoisted(() => ({ fs: '' }))
// the engine takes the page's canvas + WebGL at import; the rig needs neither. `program` hands T-R3 the beam FS.
vi.mock('../gl/engine', () => ({ program: (_vs: string, fs: string) => ((shader.fs = fs), {}), fullscreenProgram: () => () => {}, renderTarget: () => ({}) }))

const BPM = 174, BAR = 240 / BPM, BEAT = BAR / 4, FPS = 60, W = 1728, H = 1117
type V = Record<string, number>
const base = (layout = 0): V => ({ layout, green: 0.7, white: 0.3, red: 0, haze: 0.5, open: 0, scissor: 0, converge: 0, flick: 0, pop: 0, snap: 0, climax: 0, burst: 0, hit: 0 })
const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0)
/** A hit source's envelope: 1 at each hit, decaying 1/e per τ (features.ts). */
const env = (t: number, hits: readonly number[], tau = 0.14) => hits.reduce((y, h) => (t >= h ? Math.max(y, Math.exp(-(t - h) / tau)) : y), 0)
const beats = (from: number, to: number, every = BEAT) => Array.from({ length: Math.ceil((to - from) / every) }, (_, i) => from + i * every)
interface Fr { t: number; s: LaserState; light: number; L: number; n: number; hot: number[]; finite: boolean; buf: Float32Array }
interface In { v: V; bar?: number; conf?: number; bpm?: number; width?: number; height?: number }

/** Runs a rig `frames` frames; per frame its state, the frame light recomputed from the instance buffer (Σ gain × area ×
 *  RigOut.light) and the beams' `hot`. */
function drive(frames: number, at: (t: number, i: number) => In, seed = 1): Fr[] {
  const rig = createRig(seed)
  const buf = new Float32Array(MAX_INST * STRIDE)
  const out: Fr[] = []
  for (let i = 0; i < frames; i++) {
    const t = i / FPS
    const x = at(t, i)
    const r = rig.step({ v: x.v, bar: x.bar ?? t / BAR, bpm: x.bpm ?? BPM, conf: x.conf ?? 1, time: t, width: x.width ?? W, height: x.height ?? H }, buf)
    let A = 0
    let finite = [r.n, r.light, r.core, r.haze, r.speckle].every(Number.isFinite)
    const hot: number[] = []
    for (let k = 0; k < r.n; k++) {
      const o = k * STRIDE
      A += instLight(buf, o)
      if (buf[o + 10] === 0) hot.push(buf[o + 8])
      for (let j = 0; j < STRIDE; j++) finite &&= Number.isFinite(buf[o + j])
    }
    out.push({ t, s: rig.state(), light: r.light, L: r.light * A, n: r.n, hot, finite, buf: buf.slice(0, r.n * STRIDE) })
  }
  return out
}
const loudFrames = (bars: number) => Math.round(bars * BAR * FPS)
const hsv = ([r, g, b]: readonly number[]) => {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn
  const h = d === 0 ? 0 : mx === g ? 60 * ((b - r) / d + 2) : mx === r ? 60 * (((g - b) / d) % 6) : 60 * ((r - g) / d + 4)
  return [(h + 360) % 360, mx > 0 ? d / mx : 0]
}
/** The emitter nearest an instance's start, and its distance (px). */
function origin(b: Float32Array, o: number): [number, number] {
  let e = 0, d = Infinity
  EMITTERS.forEach((p, i) => { const di = Math.hypot(p.x * W - b[o], p.y * H - b[o + 1]); if (di < d) { d = di; e = i } })
  return [e, d]
}
/** A frame's beams (kind 0) by identity inside one figure: the emitter + the aim (deg, rounded), with the Grid's common
 *  shear taken out (lasers.ts `aim`: T / F at ±90° + shear, S at 0 / 180° − shear). The `groove` fixture holds `open`
 *  and has no kick, snare, scissor or build, so nothing else turns an aim between two cuts. */
function beams(f: Fr): Set<string> {
  const shear = f.s.figure === FIG.grid ? 15 * Math.sin((Math.PI * f.t) / BAR / 2) : 0, b = f.buf, out = new Set<string>()
  for (let o = 0; o < b.length; o += STRIDE) {
    if (b[o + 10] !== 0) continue
    const e = origin(b, o)[0], a = (Math.atan2(b[o + 3] - b[o + 1], b[o + 2] - b[o]) * 180) / Math.PI
    out.add(`${e}:${(Math.round(a + (EMITTERS[e].group === 'S' ? shear : -shear)) + 720) % 360}`)
  }
  return out
}
/** The loud cycle with hats (T-C14, T-C15): the sub held (`open` .5 = loud), hats on the 8ths of each bar's first half
 *  (the dark share swings both ways: `flick` decays in the second half). */
const HATS = beats(0, 40 * BAR, BEAT / 2).filter((h) => (h / BAR) % 1 < 0.5)
const groove = (t: number): In => ({ v: { ...base(), open: 0.5, flick: env(t, HATS, 0.18) } })
const SEED = 7 // the shipped rig's (lasers.ts `create`): its loud cycle opens Fan, Fan, Grid, Grid (seed 1: 4 Grids)

// The stills of creative §7 as scripted rig states (plan S5.1 ⚠️ Assumption: a tile = the scripted rig state of its
// still): 6 bars quiet, 4 bars of groove, an 8-bar build into the drop D, 16 bars of groove; kicks on the beats, snares
// on 2 and 4, hats on the 8ths. "A hit + 50 ms" = 3 frames after the hit's frame (the shoot takes 48 ms), "+ 30 ms" = 2.
const Q = 6 * BAR, D = Q + 12 * BAR, END = D + 16 * BAR
const KICK = beats(Q, END), SNARE = beats(Q + BEAT, END, 2 * BEAT), HAT = beats(Q, END, BEAT / 2)
const track = (layout: number, pal: V = {}) => drive(Math.round(END * FPS), (t) => ({
  v: t < Q ? { ...base(layout), ...pal } : {
    ...base(layout), ...pal, open: 0.6, flick: env(t, HAT, 0.18), pop: env(t, KICK), hit: env(t, KICK), snap: env(t, SNARE, 0.11),
    converge: t < D ? Math.max(0, (t - Q - 4 * BAR) / (8 * BAR)) : 0, climax: env(t, [D], 0.4), burst: env(t, [D], 0.4),
  },
}), SEED)
type Tile = Fr & { layout: number }
let tileCache: Record<string, Tile> | undefined
function tiles(): Record<string, Tile> {
  if (tileCache) return tileCache
  const truss = track(0), floor = track(1), full = track(2, { green: 0, white: 0.4, red: 0.6 })
  const at = (fr: Fr[], layout: number, i: number): Tile => ({ ...fr[i], layout })
  const latch = (fr: Fr[]) => fr.findIndex((f) => f.s.mode === 'drop')
  const cut = (fr: Fr[], ok: (f: Fr) => boolean) => fr.findIndex((f, i) => i > 0 && f.s.cuts !== fr[i - 1].s.cuts && ok(f))
  const hit = (fr: Fr[], from: number, hits: readonly number[]) => { const h = hits.find((x) => x >= fr[from].t)!; return fr.findIndex((f) => f.t >= h) }
  const bar1 = Math.round((BAR + 0.05) * FPS)
  const s2 = cut(truss, (f) => f.s.figure === FIG.fan && f.t >= D + 4 * BAR), s6 = cut(floor, (f) => f.s.mode === 'loud' && f.s.figure === FIG.grid && f.t > D)
  return (tileCache = {
    S1: at(truss, 0, Math.round(8.2 * FPS)), // quiet held ≥ 8 s
    S2: at(truss, 0, hit(truss, s2, KICK) + 3), // the first Fan ≥ 4 bars after the drop, a kick + 50 ms
    S3: at(truss, 0, latch(truss) - 1), // the build peak: the cage
    S4: at(truss, 0, latch(truss) + 12), // the drop + 0.2 s
    S5: at(truss, 0, latch(truss) + bar1), // the drop + 1 bar + 50 ms
    S6: at(floor, 1, hit(floor, s6, SNARE) + 2), // `floor`: the first loud Grid after the drop, a snare + 30 ms
    S7: at(full, 2, latch(full) + bar1), // `full`, green 0 / white .4 / red .6: the drop + 1 bar + 50 ms
  })
}

test('the rig: 23 emitters, the layouts 86 / 79 / 93 beams (L2), square cells (creative §2.1)', () => {
  expect(EMITTERS).toHaveLength(23)
  expect(EMITTERS.map((e) => e.group).join('')).toBe('TTTTTTTTSSSSSSFFFFFFFBB')
  expect([0, 1, 2].map(layoutMax)).toEqual([86, 79, 93])
  expect(Math.abs((EMITTERS[1].x - EMITTERS[0].x) * 1728 - (EMITTERS[9].y - EMITTERS[8].y) * 1117)).toBeLessThan(1.5) // 207 px both ways
})

test('T-R6a: the def: ids, def.flash = exactly burst, hit (SR-5: burst first), the binds name real sources and repeat the built-in', () => {
  expect(lasers.id).toBe('native/lasers')
  expect(lasers.flash).toEqual(['burst', 'hit'])
  const doc = BUILTIN.find((d) => d.id === 'builtin:rave-lasers')!
  expect(doc.name).toBe('Rave Lasers')
  expect(doc.layers[0].gen.ref).toBe('native/lasers')
  expect(doc.layers[0].gen.bind).toEqual(lasers.bind)
  expect(Object.keys(doc.layers[0].gen.bind!).indexOf('burst')).toBeLessThan(Object.keys(doc.layers[0].gen.bind!).indexOf('hit')) // live.ts walks the doc's order
  for (const [k, b] of Object.entries(lasers.bind!)) {
    expect(lasers.inputs.some((x) => x.name === k), k).toBe(true)
    expect(SOURCE_IDS, k).toContain(b.source)
  }
})

test('T-L1a: the cage keeps ≥ 12 / 12 / 18 lit and every S beam, flick 1 for 4 bars', () => {
  for (const [layout, floor] of [[0, 12], [1, 12], [2, 18]]) {
    const fr = drive(loudFrames(5) + 30, (t) => ({ v: { ...base(layout), open: 0.5, flick: 1, converge: t < 0.5 ? 0 : 1 } }))
    const cage = fr.filter((f) => f.s.figure === FIG.cage)
    expect(cage.length, `layout ${layout}`).toBeGreaterThanOrEqual(loudFrames(4))
    for (const f of cage) {
      expect(sum(f.s.lit), `layout ${layout} t ${f.t}`).toBeGreaterThanOrEqual(floor)
      for (let e = 8; e < 14; e++) expect(f.s.lit[e]).toBe(1)
    }
    expect(cage.at(-1)!.s.step - cage[0].s.step).toBeGreaterThanOrEqual(30) // it chased (16ths, then 8ths)
  }
})

test('T-L1b: a chased row rotates at a constant lit count; the lit set changes at every step', () => {
  const fr = drive(loudFrames(3), (t) => ({ v: { ...base(), open: 0.5, flick: 1, converge: t < 0.5 ? 0 : 1 } }))
  const cage = fr.filter((f) => f.s.figure === FIG.cage)
  const T = (f: Fr) => f.s.lit.slice(0, 8).join('') // the T line: 8 one-beam emitters, chased
  expect(new Set(cage.map((f) => sum(f.s.lit))).size).toBe(1)
  let steps = 0
  for (let i = 1; i < cage.length; i++) {
    if (cage[i].s.step === cage[i - 1].s.step) continue
    steps++
    expect(T(cage[i]), `step at ${cage[i].t.toFixed(3)}`).not.toBe(T(cage[i - 1]))
  }
  expect(steps).toBeGreaterThanOrEqual(4)
  // a loud Fan / Grid between two cuts: the lit count holds across its steps
  const loud = drive(loudFrames(2) - 5, () => ({ v: { ...base(), open: 0.5, flick: 1 } }))
  expect(loud.every((f) => f.s.cuts === loud[0].s.cuts)).toBe(true)
  expect(new Set(loud.map((f) => sum(f.s.lit))).size).toBe(1)
  expect(loud.at(-1)!.s.step - loud[0].s.step).toBeGreaterThanOrEqual(10)
})

test('T-L1c: Sheet + Lone beams never chase: lit identical on every frame, flick 1 for 8 bars', () => {
  const fr = drive(loudFrames(8), () => ({ v: { ...base(), flick: 1 } }))
  expect(fr.every((f) => f.s.mode === 'quiet' && f.s.figure === FIG.sheet)).toBe(true)
  expect(new Set(fr.map((f) => f.s.lit.join())).size).toBe(1)
  expect(sum(fr[0].s.lit)).toBe(4) // 1 Sheet + 3 Lone beams
})

test('T-L1d: a Grid with 1 beam per T emitter keeps ≥ 4 of 8 T lit under flick 1', () => {
  const kicks = beats(0, 30 * BAR)
  const fr = drive(loudFrames(30), (t) => ({ v: { ...base(), flick: 1, pop: env(t, kicks) } }))
  const grid = fr.filter((f) => f.s.figure === FIG.grid)
  expect(grid.length).toBeGreaterThan(loudFrames(2))
  for (const f of grid) {
    const T = f.s.lit.slice(0, 8)
    expect(Math.max(...T)).toBe(1) // one beam per T emitter
    expect(sum(T), `t ${f.t}`).toBeGreaterThanOrEqual(4)
  }
})

test('T-L1e: the frame light = light × Σ gain × area, ≤ 1 % per frame and ≤ 8 % per chase step outside the loads', () => {
  const kicks = beats(0, 40 * BAR), snares = beats(BEAT, 40 * BAR, 2 * BEAT)
  for (const layout of [0, 1, 2]) {
    const fr = drive(loudFrames(40), (t) => {
      const c = t < 16 * BAR ? 0 : t < 26 * BAR ? Math.min(1, (t / BAR - 16) / 6) : 0
      return { v: { ...base(layout), open: 0.5, flick: Math.floor((t / BAR) * 8) % 4 < 2 ? 0 : 1, pop: env(t, kicks), snap: env(t, snares, 0.11), converge: c } }
    })
    let lastStep: Fr | null = null
    for (let i = 1; i < fr.length; i++) {
      const f = fr[i], p = fr[i - 1]
      expect(Math.abs(f.L - f.s.sum) / f.s.sum, `identity t ${f.t}`).toBeLessThan(1e-6)
      const load = f.s.cuts !== p.s.cuts || f.s.mode !== p.s.mode
      if (load) { lastStep = null; continue }
      expect(Math.abs(f.L / p.L - 1), `layout ${layout} t ${f.t.toFixed(3)}`).toBeLessThanOrEqual(0.01)
      if (f.s.step !== p.s.step) {
        if (lastStep && lastStep.s.cuts === f.s.cuts) expect(Math.abs(f.L / lastStep.L - 1)).toBeLessThanOrEqual(0.08)
        lastStep = f
      }
    }
    expect(new Set(fr.map((f) => f.s.figure))).toEqual(new Set([FIG.fan, FIG.grid, FIG.cage]))
  }
})

test('T-L1f (N-1): the loud-on is one step to the loud target on the first allowed hit, never a swell', () => {
  const k0 = 4
  const kick = (t: number) => env(t, t >= k0 ? beats(k0, 6) : [])
  const cases: [string, (t: number) => V][] = [
    ['quiet → loud', (t) => ({ ...base(), pop: kick(t), hit: kick(t) })],
    ['drums back before the sub', (t) => ({ ...base(), flick: t > 2 ? 1 : 0, pop: kick(t), hit: kick(t) })],
  ]
  for (const [name, v] of cases) {
    const fr = drive(5 * FPS, (t) => ({ v: v(t) }))
    const k = fr.findIndex((f) => f.t >= k0)
    expect(fr[k - 1].s.mode, name).toBe('quiet')
    expect(fr[k].s.mode, name).toBe('loud')
    expect(fr[k].s.power, name).toBeCloseTo(0.7, 6)
    expect(fr[k].s.sum, name).toBe(fr[k].s.target)
    expect(fr[k].s.sum / fr[k - 1].s.sum, name).toBeGreaterThan(1.5)
  }
  // a return < 20 s after a drop: drop at 1 s, no kicks → quiet; the kick at 10 s loads in its frame
  const fr = drive(11 * FPS, (t) => ({ v: { ...base(), climax: env(t, [1], 0.4), pop: env(t, t > 9.9 ? [10] : []), hit: env(t, t > 9.9 ? [10] : []) } }))
  const k = fr.findIndex((f) => f.t >= 10)
  expect(fr.some((f) => f.s.mode === 'drop')).toBe(true)
  expect(fr[k - 1].s.mode).toBe('quiet')
  expect(fr[k].s.mode).toBe('loud')
  expect(fr[k].s.sum).toBe(fr[k].s.target)
})

test('T-L1g (N-2): a dark rig, a 0-lit emitter at a cut and a mass shoot stay finite; the light comes back', () => {
  const fr = drive(4 * FPS, (t, i) => ({
    v: i < 10 ? { ...base(), open: NaN, flick: NaN } : { ...base(), open: 0.5, flick: 1, climax: t > 1 && t < 1.3 ? 1 : 0 },
    width: i < 5 ? 0 : W, height: i < 5 ? 0 : H,
  }))
  for (const f of fr) {
    expect(f.finite, `t ${f.t}`).toBe(true)
    expect(f.s.sum).toBeGreaterThan(0)
    expect(Number.isFinite(f.s.sum) && Number.isFinite(f.s.target)).toBe(true)
  }
  const latch = fr.findIndex((f) => f.s.mode === 'drop')
  expect(fr[latch].n).toBeGreaterThan(0) // the mass shoot: every beam at length 0, every origin lit
  expect(fr.at(-1)!.s.mode).toBe('loud')
  expect(fr.at(-1)!.L).toBeGreaterThan(0)
})

test('T-L4: the drop ignores hit for 1 s of RigIn.time; burst holds the white cores ≥ 0.4 s; unlocked steps 5–6 per s', () => {
  const T = 1
  const fr = drive(3 * FPS, (t) => ({ v: { ...base(), open: 0.5, flick: 0.5, climax: env(t, [T], 0.4), burst: env(t, [T], 0.4), hit: env(t, [T + 0.86, T + 1.38]), pop: env(t, [T + 0.86, T + 1.38]) } }))
  const latch = fr.findIndex((f) => f.s.mode === 'drop')
  expect(fr[latch].t).toBeCloseTo(T, 1)
  const o0 = fr[latch].s.onsets
  expect(fr.find((f) => f.t >= T + 0.9)!.s.onsets).toBe(o0)
  expect(fr.find((f) => f.t >= T + 1.4)!.s.onsets).toBe(o0 + 1)
  for (const f of fr.filter((g) => g.t >= T && g.t <= T + 0.4)) expect(f.hot.every((h) => h === 1), `t ${f.t}`).toBe(true)
  // not locked: the chase free-runs at 5.8 Hz of RigIn.time
  const un = drive(5 * FPS, () => ({ v: { ...base(), open: 0.5, flick: 0.5 }, conf: 0 }))
  expect(un.every((f) => !f.s.locked)).toBe(true)
  for (let s = 1; s < 5; s++) {
    const a = un.find((f) => f.t >= s - 1)!, b = un.find((f) => f.t >= s)!
    expect(b.s.step - a.s.step, `second ${s}`).toBeGreaterThanOrEqual(5)
    expect(b.s.step - a.s.step).toBeLessThanOrEqual(6)
  }
})

test('T-L5: the tone map keeps the skirt hue 138.7°, whitens crossings, is finite at 0', () => {
  expect(tone(0, 0, 0).every(Number.isFinite)).toBe(true)
  for (let m = 0.1; m <= 8; m += 0.1) {
    const [h, s] = hsv(tone(0.1 * m, m, 0.38 * m))
    expect(Math.abs(h - 138.7), `m ${m}`).toBeLessThan(0.5)
    if (m <= 1.4) expect(s, `m ${m}`).toBeGreaterThanOrEqual(0.6)
    if (m >= 2) expect(s, `m ${m}`).toBeLessThanOrEqual(0.15)
  }
})

test('T-L6: the drop latch carries power 1, every beam, the light load; hot only with burst', () => {
  for (const layout of [0, 1, 2]) {
    const fr = drive(2 * FPS, (t) => ({ v: { ...base(layout), open: 0.5, climax: t >= 1 ? 1 : 0 } }))
    const k = fr.findIndex((f) => f.s.mode === 'drop')
    expect(fr[k].s.power).toBe(1)
    expect(sum(fr[k].s.lit)).toBe(layoutMax(layout))
    expect(fr[k].s.sum).toBe(fr[k].s.target) // the load: L0 · power 1 · φ
    expect(fr[k].hot.every((h) => h === 0)).toBe(true)
    expect(fr.slice(k).every((f) => f.s.mode === 'drop' && f.s.figure === FIG.crowd && sum(f.s.lit) === layoutMax(layout))).toBe(true) // climax held at 1 holds bar 1 (T-L3)
  }
  const fr = drive(2 * FPS, (t) => ({ v: { ...base(), open: 0.5, climax: t >= 1 ? 1 : 0, burst: env(t, [1], 0.4) } }))
  expect(fr.filter((f) => f.t >= 1 && f.t <= 1.4).every((f) => f.hot.length > 0 && f.hot.every((h) => h === 1))).toBe(true)
  // a live drop (climax decays): bar 2 = the Grid (fix 1 F7), ≥ 75 % lit (truss: 8 × 3 + 6 × 4 = 48) even with the hats at rest (creative §3)
  const live = drive(4 * FPS, (t) => ({ v: { ...base(), open: 0.5, climax: env(t, [1], 0.4), pop: env(t, beats(1, 4)) } }))
  const bar2 = live.filter((f) => f.s.mode === 'drop' && f.s.figure === FIG.grid)
  expect(bar2.length).toBeGreaterThan(BAR * FPS - 3)
  expect(bar2.every((f) => sum(f.s.lit) === 48)).toBe(true)
})

test('T-L9: the clock fires each index once; re-bases on a jump back; latches the lock with hysteresis', () => {
  const armed = { ...base(), open: 0.5, flick: 0.3 }
  // (1) the bar jumps back 0.06 just after step boundary 40: that boundary steps once
  const t1 = (40.1 / 8) * BAR
  const b1 = (t: number) => (t < t1 ? t / BAR : t / BAR - 0.06)
  const fr1 = drive(Math.round((t1 + 0.6) * FPS), (t) => ({ v: armed, bar: b1(t) }))
  const j = fr1.findIndex((f) => f.t >= t1)
  for (const f of fr1.slice(j)) if (Math.floor(b1(f.t) * 8) <= 40) expect(f.s.step).toBe(fr1[j].s.step)
  // (2) the bar jumps back 2 beats: 16 ± 1 steps in the next 2 bars, no gap > 2 step periods
  const t2 = 6 * BAR + 0.01
  const fr2 = drive(Math.round((t2 + 2 * BAR + 0.1) * FPS), (t) => ({ v: armed, bar: t < t2 ? t / BAR : t / BAR - 0.5 }))
  const win = fr2.filter((f) => f.t >= t2 && f.t < t2 + 2 * BAR)
  expect(Math.abs(win.at(-1)!.s.step - win[0].s.step - 16)).toBeLessThanOrEqual(1)
  let last = win[0].t
  for (let i = 1; i < win.length; i++) if (win[i].s.step !== win[i - 1].s.step) { expect(win[i].t - last).toBeLessThanOrEqual((2 * BAR) / 8 + 1 / FPS); last = win[i].t }
  // (3) conf alternating .29 / .31 after a lock: the lock holds
  const fr3 = drive(3 * FPS, (t, i) => ({ v: armed, conf: t < 1 ? 1 : i % 2 ? 0.29 : 0.31 }))
  expect(fr3.every((f) => f.s.locked)).toBe(true)
  // (4) the bar moves back across an integer and forward again: no extra cut
  const t4 = 4.02 * BAR
  const b4 = (t: number) => (t < t4 ? t / BAR : t / BAR - 0.12)
  const fr4 = drive(Math.round((t4 + 0.9 * BAR) * FPS), (t) => ({ v: armed, bar: b4(t) }))
  const k = fr4.findIndex((f) => f.t >= t4)
  expect(fr4.at(-1)!.s.cuts).toBe(fr4[k].s.cuts)
})

test('T-L10: state() hands out copies', () => {
  const rig = createRig(3)
  const buf = new Float32Array(MAX_INST * STRIDE)
  const go = (i: number, flick: number) => rig.step({ v: { ...base(), open: 0.5, flick }, bar: i / FPS / BAR, bpm: BPM, conf: 1, time: i / FPS, width: W, height: H }, buf)
  for (let i = 0; i < 30; i++) go(i, 0)
  const a = rig.state(), b = rig.state()
  expect(a.lit).not.toBe(b.lit)
  const kept = [...a.lit]
  for (let i = 30; i < 200; i++) go(i, 1)
  expect(a.lit).toEqual(kept)
})

test('T-N3: through the def binds (kick τ .12), the first rendered hit after a drop is the T + 1.38 s kick', () => {
  const T = 1, kicks = [T + 0.86, T + 1.38, T + 2.24]
  const st: Record<string, BindState> = { hit: { y: 0 }, pop: { y: 0 }, climax: { y: 0 }, burst: { y: 0 } }
  const fr = drive(4 * FPS, (t) => {
    const src = { kick: env(t, kicks, 0.12), drop: t >= T ? 0.8 * Math.exp(-(t - T)) : 0 }
    const v: V = { ...base(), open: 0.5, flick: 0.5 }
    for (const k of Object.keys(st)) v[k] = evaluate(lasers.bind![k], src, st[k], 1 / FPS)
    return { v }
  })
  const latch = fr.findIndex((f) => f.s.mode === 'drop')
  const first = fr.slice(latch + 1).find((f, i) => f.s.onsets > fr[latch + i].s.onsets)!
  expect(Math.abs(first.t - (T + 1.38))).toBeLessThanOrEqual(0.02)
})

// ---- S5.1 (plan_rave_lasers.md): unit + contract rows ----
test('T-TC: 174 → 156 BPM (8 bars each, a 2-bar ramp): no step gap > 2 step periods; sum ≤ 8 % per 8th', () => {
  const t1 = 8 * BAR, ramp = (2 * 240) / 165 // the ramp: 2 bars at the mean tempo
  const bpmAt = (t: number) => (t < t1 ? 174 : t < t1 + ramp ? 174 - (18 * (t - t1)) / ramp : 156)
  let bar = 0
  const fr = drive(Math.round((t1 + ramp + (8 * 240) / 156) * FPS), (t, i) => {
    const bpm = bpmAt(t)
    if (i) bar += bpm / 240 / FPS // the sync's bar runs on through the change
    return { v: { ...base(), open: 0.5, flick: 0.5 }, bar, bpm }
  })
  const steps = fr.filter((f, i) => i > 0 && f.s.step !== fr[i - 1].s.step)
  expect(steps.length).toBeGreaterThan(130) // ≈ 18 bars × 8
  const ends = [...steps, fr.at(-1)!]
  for (let i = 1; i < ends.length; i++) expect(ends[i].t - ends[i - 1].t, `t ${ends[i].t.toFixed(3)}`).toBeLessThanOrEqual((2 * 240) / 8 / bpmAt(ends[i].t) + 1 / FPS)
  for (let i = 1; i < steps.length; i++) {
    const a = steps[i - 1], b = steps[i]
    if (a.s.cuts === b.s.cuts && a.s.mode === b.s.mode) expect(Math.abs(b.s.sum / a.s.sum - 1), `t ${b.t.toFixed(3)}`).toBeLessThanOrEqual(0.08) // a cut's load is T-L1e's
  }
})

test('T-C14: 10 s of the loud cycle with hats: ≥ 60 % of the beams toggle ≥ 4 times per 2 bars; lit ≤ 1 per emitter per step; ≤ 1 cut per 2 bars', () => {
  const fr = drive(10 * FPS, groove, SEED)
  const figs: Fr[][] = []
  fr.forEach((f, i) => (i && f.s.cuts === fr[i - 1].s.cuts ? figs.at(-1)!.push(f) : figs.push([f])))
  const whole = figs.filter((g) => g.at(-1)!.t - g[0].t >= 2 * BAR - 2 / FPS) // not the cut-off last figure
  expect(whole.length).toBeGreaterThanOrEqual(3)
  for (const g of whole) {
    const on = g.map(beams), all = [...new Set(on.flatMap((s) => [...s]))]
    const flips = all.map((b) => on.reduce((n, s, i) => n + +(i > 0 && s.has(b) !== on[i - 1].has(b)), 0))
    expect(flips.filter((n) => n >= 4).length / all.length, `figure ${g[0].s.figure} at ${g[0].t.toFixed(2)} s`).toBeGreaterThanOrEqual(0.6)
  }
  for (let i = 1; i < fr.length; i++) {
    const f = fr[i], p = fr[i - 1]
    if (f.s.cuts === p.s.cuts) f.s.lit.forEach((n, e) => expect(Math.abs(n - p.s.lit[e]), `t ${f.t.toFixed(3)} emitter ${e}`).toBeLessThanOrEqual(f.s.step - p.s.step))
  }
  for (let i = 1; i < figs.length; i++) expect(figs[i][0].t - figs[i - 1][0].t).toBeGreaterThanOrEqual(2 * BAR - 1.5 / FPS) // no drop in this capture
})

test('T-C15: 32 loud bars: no figure > 4 bars, no figure repeats the lit pattern before it; tiles S2, S5, S6 differ', () => {
  const fr = drive(loudFrames(32), groove, SEED)
  const starts = fr.filter((f, i) => i === 0 || f.s.cuts !== fr[i - 1].s.cuts), ends = [...starts, fr.at(-1)!]
  expect(starts.length).toBeGreaterThanOrEqual(15)
  for (let i = 1; i < ends.length; i++) expect(ends[i].t - ends[i - 1].t, `t ${ends[i].t.toFixed(2)}`).toBeLessThanOrEqual(4 * BAR)
  const pattern = starts.map((f) => [...beams(f)].sort().join()) // a figure's first frame: its lit beams
  for (let i = 1; i < pattern.length; i++) expect(pattern[i], `figure ${i} at ${starts[i].t.toFixed(2)} s`).not.toBe(pattern[i - 1])
  const { S2, S5, S6 } = tiles()
  expect(new Set([S2, S5, S6].map((f) => f.s.lit.join())).size).toBe(3)
})

test('T-C11s: 5 s of zero features on a running grid: 0 chase steps, 0 Pops, 0 bursts (fresh; after 4 bars of drums, past the drum arm)', () => {
  const T0 = 4 * BAR, kick = beats(0, T0), snare = beats(BEAT, T0, 2 * BEAT), hat = beats(0, T0, BEAT / 2)
  const fresh = drive(5 * FPS, () => ({ v: base() })) // the stale sync: bar = t ÷ BAR at 174 BPM, conf 1
  const after = drive(Math.round((T0 + 5) * FPS), (t) => ({ v: t < T0 ? { ...base(), pop: env(t, kick), hit: env(t, kick), snap: env(t, snare, 0.11), flick: env(t, hat, 0.18) } : base() }))
  expect(after.find((f) => f.t >= T0)!.s.mode).toBe('loud') // the last kick holds loud for 2 bars: a stale clock would step it
  const runs: [string, Fr[], number][] = [['fresh', fresh, 0], ['after drums', after.filter((f) => f.t >= T0), 0.7]] // 0.7 s: the drum arm (design rig rule 4)
  for (const [name, fr, arm] of runs) {
    const still = fr.filter((f) => f.t >= fr[0].t + arm)
    expect(still.at(-1)!.s.step - still[0].s.step, `${name}: chase steps`).toBe(0)
    let pops = 0, bursts = 0
    fr.forEach((f, i) => {
      if (i && f.s.spread > fr[i - 1].s.spread + 1e-9) pops++ // the Pop: spread × 1.3
      for (let o = 0; o < f.buf.length; o += STRIDE) {
        if (f.buf[o + 10] === 0 && f.buf[o + 11] > 0) pops++ // ... and its shoot
        if (f.buf[o + 10] === 2) bursts++
      }
    })
    expect({ pops, bursts }, name).toEqual({ pops: 0, bursts: 0 })
  }
})

test('S5.3 truth: `pops` counts the Pop edges, `bursts` the Grating bursts as drawn (the live r-pass reads them)', () => {
  const kick = beats(0, 4 * BAR), snare = beats(BEAT, 4 * BAR, 2 * BEAT)
  const fr = drive(loudFrames(4), (t) => ({ v: { ...base(), open: 0.5, pop: env(t, kick), snap: env(t, snare, 0.11) } }))
  const rays = (f: Fr) => { for (let o = 0; o < f.buf.length; o += STRIDE) if (f.buf[o + 10] === 2) return true; return false }
  fr.forEach((f, i) => {
    const p = fr[i - 1]
    expect(f.s.pops - (p?.s.pops ?? 0), `pop @${f.t.toFixed(3)}`).toBe(+(env(f.t, kick) >= 0.5 && !(p && env(p.t, kick) >= 0.5)))
    expect(f.s.bursts - (p?.s.bursts ?? 0), `burst @${f.t.toFixed(3)}`).toBe(+(rays(f) && !(p && rays(p))))
  })
  expect([fr.at(-1)!.s.pops, fr.at(-1)!.s.bursts]).toEqual([kick.length, snare.length])
})

test('T-R2: every instance starts at an emitter (≤ 4 px; each beam extended backward too); ≥ 2 lit groups per tile; one set of points per layout', () => {
  const T = tiles()
  expect(Object.values(T).map((f) => f.s.figure)).toEqual([FIG.sheet, FIG.fan, FIG.cage, FIG.crowd, FIG.grid, FIG.grid, FIG.grid]) // the moments S1–S7
  const pts = new Map<string, string>()
  for (const [id, f] of Object.entries(T)) {
    const b = f.buf, groups = new Set<string>()
    for (let o = 0; o < b.length; o += STRIDE) {
      const [e, d] = origin(b, o), p = EMITTERS[e], xy = `${b[o]},${b[o + 1]}`
      expect(d, `${id} instance ${o / STRIDE}`).toBeLessThanOrEqual(4)
      expect(pts.get(`${f.layout}:${e}`) ?? xy, `${id} emitter ${e}`).toBe(xy)
      pts.set(`${f.layout}:${e}`, xy)
      if (b[o + 10] === 3) continue
      groups.add(p.group)
      const dx = b[o + 2] - b[o], dy = b[o + 3] - b[o + 1]
      expect(Math.abs(dx * (p.y * H - b[o + 1]) - dy * (p.x * W - b[o])) / Math.hypot(dx, dy), `${id} beam ${o / STRIDE}`).toBeLessThanOrEqual(4)
    }
    expect(groups.size, id).toBeGreaterThanOrEqual(2)
  }
})

test('T-C3: straight 2-point instances, no closed stroke, ≥ 85 % of the lit beams end on a frame edge (tiles S2, S4–S7)', () => {
  expect(STRIDE).toBe(12) // x0 y0 x1 y1 | w0 w1 | gain0 gain1 | hot tint kind fade: two points, no control-point field
  for (const id of ['S2', 'S4', 'S5', 'S6', 'S7']) {
    const b = tiles()[id].buf
    let lit = 0, edge = 0
    for (let o = 0; o < b.length; o += STRIDE) {
      expect([0, 1, 2, 3], id).toContain(b[o + 10])
      if (b[o + 10] === 3) continue
      const x = b[o + 2], y = b[o + 3]
      expect(Math.min(...EMITTERS.map((p) => Math.hypot(p.x * W - x, p.y * H - y))), `${id} beam ${o / STRIDE} ends at an emitter (a closed stroke)`).toBeGreaterThan(4)
      lit++
      if (x <= 0.5 || x >= W - 0.5 || y <= 0.5 || y >= H - 0.5) edge++
    }
    expect(edge / lit, id).toBeGreaterThanOrEqual(0.85)
  }
})

test('T-R3: the colour function: default 0.7 / 0.3 / 0 → green + white emitters, hue 125–150°; S7 0 / 0.4 / 0.6 → white + red, hue 345–5°', () => {
  lasers.create(new Proxy({}, { get: () => () => null }) as never) // a no-op GL: the `program` mock takes the FS
  const skirt = [...shader.fs.match(/SKIRT\[3\] = vec3\[3\]\((.*?)\);/)![1].matchAll(/vec3\(([^)]*)\)/g)].map((m) => m[1].split(',').map(Number))
  expect(skirt).toHaveLength(3)
  for (const [green, white, red, lo, hi] of [[0.7, 0.3, 0, 125, 150], [0, 0.4, 0.6, 345, 365]]) {
    const f = drive(FPS + 1, (t) => ({ v: { ...base(2), green, white, red, open: 0.5, climax: t >= 1 ? 1 : 0 } })).at(-1)!
    expect(f.s.mode).toBe('drop') // the latch: every beam of `full` is in the buffer
    const tint = new Map<number, number>()
    for (let o = 0; o < f.buf.length; o += STRIDE) if (f.buf[o + 10] === 0) tint.set(origin(f.buf, o)[0], f.buf[o + 9])
    expect(tint.size).toBe(21)
    const n = [0, 1, 2].map((c) => [...tint.values()].filter((x) => x === c).length), share = [green, white, red].map((x) => x / (green + white + red))
    n.forEach((k, c) => expect(Math.abs(k - 21 * share[c]), `colour ${c}: ${n}`).toBeLessThanOrEqual(0.5)) // 0 deviation: the shares, rounded
    const [h] = hsv([0, 1, 2].map((ch) => n.reduce((s, k, c) => s + k * skirt[c][ch], 0)))
    expect((h - lo + 360) % 360, `hue ${h.toFixed(1)}`).toBeLessThanOrEqual(hi - lo)
  }
})

test('T-R8a: the built-in binds the six rows of creative §3, one input each', () => {
  const bind = BUILTIN.find((d) => d.id === 'builtin:rave-lasers')!.layers[0].gen.bind!
  const by = (s: string) => Object.keys(bind).filter((k) => bind[k].source === s)
  // sub → open, reese → scissor, build → converge, hats → the dark share, kick → the Pop spread + the gated core gain
  expect({ sub: by('sub'), reese: by('reese'), build: by('build'), hats: by('hats'), kick: by('kick') }).toEqual({ sub: ['open'], reese: ['scissor'], build: ['converge'], hats: ['flick'], kick: ['pop', 'hit'] })
})

test('T-R9: one built-in on native/lasers (builtin:rave-lasers); no other rave and no techno id', () => {
  expect(BUILTIN.filter((d) => d.layers.some((l) => l.gen.ref === 'native/lasers')).map((d) => d.id)).toEqual(['builtin:rave-lasers'])
  expect(BUILTIN.filter((d) => /rave|techno/i.test(d.id)).map((d) => d.id)).toEqual(['builtin:rave-lasers'])
})
