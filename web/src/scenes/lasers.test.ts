// RL S3 spike: the pure rig of native/lasers (matrix_rave_lasers.md T-L1a–g, T-L4, T-L5, T-L6, T-L9, T-L10, T-N3),
// fed 60 frames per s at 174 BPM, conf 1, `RigIn.time` = frame ÷ 60 (never performance.now()). The GL is the
// browser check.
import { expect, test, vi } from 'vitest'
import { evaluate, SOURCE_IDS, type BindState } from '../bind'
import { BUILTIN } from './builtin'
import { createRig, EMITTERS, FIG, instLight, lasers, layoutMax, MAX_INST, STRIDE, tone, type LaserState } from './lasers'

vi.mock('../gl/engine', () => ({})) // takes the page's canvas + WebGL at import; the rig needs neither

const BPM = 174, BAR = 240 / BPM, BEAT = BAR / 4, FPS = 60, W = 1728, H = 1118
type V = Record<string, number>
const base = (layout = 0): V => ({ layout, green: 0.7, white: 0.3, red: 0, haze: 0.5, open: 0, scissor: 0, converge: 0, flick: 0, pop: 0, snap: 0, climax: 0, burst: 0, hit: 0 })
const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0)
/** A hit source's envelope: 1 at each hit, decaying 1/e per τ (features.ts). */
const env = (t: number, hits: readonly number[], tau = 0.14) => hits.reduce((y, h) => (t >= h ? Math.max(y, Math.exp(-(t - h) / tau)) : y), 0)
const beats = (from: number, to: number, every = BEAT) => Array.from({ length: Math.ceil((to - from) / every) }, (_, i) => from + i * every)
interface Fr { t: number; s: LaserState; light: number; L: number; n: number; hot: number[]; finite: boolean }
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
    out.push({ t, s: rig.state(), light: r.light, L: r.light * A, n: r.n, hot, finite })
  }
  return out
}
const loudFrames = (bars: number) => Math.round(bars * BAR * FPS)

test('the rig: 23 emitters, the layouts 86 / 79 / 93 beams (L2), square cells (creative §2.1)', () => {
  expect(EMITTERS).toHaveLength(23)
  expect(EMITTERS.map((e) => e.group).join('')).toBe('TTTTTTTTSSSSSSFFFFFFFBB')
  expect([0, 1, 2].map(layoutMax)).toEqual([86, 79, 93])
  expect(Math.abs((EMITTERS[1].x - EMITTERS[0].x) * 1728 - (EMITTERS[9].y - EMITTERS[8].y) * 1117)).toBeLessThan(1.5) // 207 px both ways
})

test('the def: ids, the ⚡ order (burst before hit, SR-5), the binds name real sources and repeat the built-in', () => {
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
  const hsv = ([r, g, b]: number[]) => {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn
    const h = d === 0 ? 0 : mx === g ? 60 * ((b - r) / d + 2) : mx === r ? 60 * (((g - b) / d) % 6) : 60 * ((r - g) / d + 4)
    return [h, mx > 0 ? d / mx : 0]
  }
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
