// vs3/chain.ts (plan_vs3_engine S1.1, S1.2): the donor's per-frame wiring for the macros, the mirror and the feedback,
// and the light limiter, with the state passed in. No GL.
import { expect, test } from 'vitest'
import { heatStep } from '../gl/post'
import { chainState, clock, drastic, frame, KNOBS, reactTo, type ChainFrame, type ChainState, type Knobs, type Light, type LookValues, type SceneFacts } from './chain'
import type { Signal } from './host'

const DT = 1 / 60
// the stock look: the macros at .5 and the donor's BASE_POST (post-shaders.js:17-29)
const V: LookValues = { react: 0.5, chaos: 0.5, trails: 0.5, heat: 0.5, mirror: 0, tiles: 0, twist: 0, slice: 0, spin: 0.5, persist: 0.5, zoom: 1.04, bloomMul: 1, lens: 0, lensStyle: 0, aber: 1, vignette: 0.34, brightness: 1.4, hueDrift: 0 }
const F: SceneFacts = { bloom: { strength: 0.5, gain: 0.4 }, hint: null, wet: 1, grain: 1, lateTrails: 0, filter: false, bloomRow: 1, gainBase: 1.4, vigRange: 1 }
const S: Signal = { onKick: 0, kick: 0, onMid: 0, onHigh: 0, sub: 0.3, mids: 0.4, highs: 0.2, air: 0.1, energy: 0.5, specHi: new Float32Array(192) }
const MID = [0.5, 0.4, 0.8]
/** One frame of the stock look with `v` and `f` over it. */
const at = (v: Partial<LookValues>, st = chainState(), f: Partial<SceneFacts> = {}, hit = 0, dt = DT, dtl = DT) => frame({ ...V, ...v }, { ...F, ...f }, S, hit, st, MID, dt, dtl, 0, 16 / 9)

const X = KNOBS.LIGHT_X ** DT // the follow's factor per 60 fps frame: 1.0234
const HOT1 = 1 - Math.exp(-DT / 0.04) // a hit's first-frame share as drawn: .3408
/** k of the scene F (rest .5, gain .4, kick .35) at a level, a kick as drawn and a multiplier. */
const kOf = (energy: number, kick: number, mul: number) => (0.5 + energy * 0.4 + kick * 0.35) * mul
/** 600 frames of a synthetic signal: an energy curve and a kick every 28 frames with its release. */
const track = (energy: (i: number) => number) => Array.from({ length: 600 }, (_, i) => ({ s: { ...S, energy: energy(i) }, hit: 0.85 ** (i % 28) }))
const SWELL = track((i) => 0.5 + 0.4 * Math.sin(i * 0.07) + 0.05 * Math.sin(i * 1.3)) // .05 to .95
const LOUD = track((i) => 1 + 0.07 * Math.sin(i * 0.07) + 0.03 * Math.sin(i * 1.3)) // .9 to 1.1: the vs3 core's (N6)
/** The limiter's bound on the glow's move from `L` to `next`: the stock scene's own move ± the follow (dtl 1/60). */
const bound = (L: Light, next: Light, K = KNOBS) => {
  const r = L.stock > 0 ? Math.min(1, L.glow / L.stock) : 1, dyn = K.DYN * (next.stock - L.stock) * r, foll = (X - 1) * Math.max(L.glow, K.GLOW_SEED)
  return [L.glow + Math.min(dyn, 0) - foll, L.glow + Math.max(dyn, 0) + foll]
}
/** Every number of a frame. */
const nums = (cf: ChainFrame) => [cf.bloom, cf.kick, cf.react, ...Object.values(cf.finish), ...Object.values(cf.warp).flatMap((u) => (typeof u === 'number' ? u : [...u]))]
// N5a counts with S0.2's flashPairs (vs3/pairs.ts), built in parallel with this step: N5a runs once both are on dev.
// ponytail: an optional import until S0.2 is merged; then `import { flashPairs } from './pairs'`.
type Pairs = (t: ArrayLike<number>, luma: ArrayLike<number>) => { total: number; max1s: number }
const flashPairs = Object.values(import.meta.glob<Pairs>('./pairs.ts', { eager: true, import: 'flashPairs' }))[0]

test('D1 drastic: .25, 1, 4 at 0, .5, 1', () => {
  expect([0, 0.5, 1].map(drastic)).toEqual([0.25, 1, 4])
})

test('D2 persist: trails scales it; a lateTrails scene; trails 0 gives 0', () => {
  const p = (v: Partial<LookValues>, f: Partial<SceneFacts> = {}) => at(v, chainState(), f).warp.uPersist
  expect(p({})).toBe(0.5) // trails .5: the scene's own
  expect(p({ trails: 0.25 })).toBe(0.25)
  expect(p({ persist: 0.4, trails: 1 })).toBe(0.8) // × 2 at the top
  expect(p({ trails: 1 })).toBe(0.975) // capped: the history always decays
  // LATE_TRAILS (crystal, pearl, spiral): clean up to the middle, then trails fade in to its persist at 1
  expect(p({ persist: 0 }, { lateTrails: 0.8 })).toBe(0)
  expect(p({ persist: 0, trails: 0.75 }, { lateTrails: 0.8 })).toBeCloseTo(0.4, 12)
  expect(p({ persist: 0, trails: 1 }, { lateTrails: 0.8 })).toBe(0.8)
  expect(p({ persist: 0, trails: 1 })).toBe(0) // no LATE_TRAILS row
  expect(p({ trails: 0 })).toBe(0)
  expect(p({ persist: 0, trails: 0 }, { lateTrails: 0.8 })).toBe(0)
  expect(p({}, { hint: { persist: 0.2 } })).toBe(0.2) // the signal scene's hint wins over the knob
  expect(p({}, { wet: 0.5 })).toBe(0.25) // limitless's dry / wet
})

test('D3 zoom: the donor formula over dt', () => {
  // engine.js:181-183, per frame: (1 + (zoom − 1 + kick · (.15 + heat · .8) · .3) · (.1 + 1.8 · trails)) ^ dt
  const z = (cf: ChainFrame) => cf.warp.uZoom as number
  expect(z(at({}))).toBeCloseTo(1.04 ** DT, 15) // at rest, trails .5: the row's zoom per second
  expect(z(at({}, chainState(), {}, 0, 2 * DT))).toBeCloseTo(z(at({})) ** 2, 15) // frame-rate independent
  const cf = at({ zoom: 1.1, heat: 0.7, trails: 0.6 }, chainState(), {}, 1)
  expect(cf.kick).toBeCloseTo(1 - Math.exp(-DT / 0.04), 12) // the push reads cf.kick: the kick as drawn
  expect(z(cf)).toBeCloseTo((1 + (1.1 - 1 + cf.kick * (0.15 + 0.7 * 0.8) * 0.3) * (0.1 + 1.8 * 0.6)) ** DT, 15)
  expect(z(at({ zoom: 1.1, heat: 0.7, trails: 0.6 }, chainState(), { hint: { steady: true } }, 1))).toBeCloseTo((1 + (1.1 - 1) * (0.1 + 1.8 * 0.6)) ** DT, 15) // steady: no push
})

test('D4 mirror skip: no fold, no fold fade, tiles ≤ 1.0001, |twist| ≤ .001, slice ≤ .001 → cf.mirror false', () => {
  const m = (v: Partial<LookValues>, st?: ChainState) => at(v, st).mirror
  expect(m({})).toBe(false)
  expect(m({ tiles: 1.0001, twist: -0.001, slice: 0.001 })).toBe(false) // at the edges the shader is an exact copy
  expect([m({ mirror: 1 }), m({ tiles: 1.001 }), m({ twist: -0.002 }), m({ slice: 0.002 })]).toEqual([true, true, true, true])
  const st = chainState()
  m({ mirror: 4 }, st)
  const out = Array.from({ length: 31 }, () => m({}, st)) // a fold fading out draws until its fade ends
  expect(out.slice(0, 29)).toEqual(Array(29).fill(true))
  expect(out[30]).toBe(false)
})

test('D5 feedback skip: effective persist ≤ 0 → cf.feedback false', () => {
  const fb = (v: Partial<LookValues>, f: Partial<SceneFacts> = {}) => at(v, chainState(), f).feedback
  expect(fb({})).toBe(true)
  expect(fb({ persist: 0 })).toBe(false) // persist 0 without LATE_TRAILS
  expect(fb({ trails: 0 })).toBe(false)
  expect(fb({ persist: 0, trails: 0.75 }, { lateTrails: 0.8 })).toBe(true)
  expect(fb({}, { wet: 0 })).toBe(false) // limitless all dry
})

test('D6 stepSym: a fold change fades over 0.5 s; it snaps on reset', () => {
  const st = chainState(), w = (mirror: number) => at({ mirror }, st).warp
  expect(w(2)).toMatchObject({ uSegments: 2, uSegFrom: 2, uSegMix: 1 }) // a new layer: its fold at once
  const fade = Array.from({ length: 31 }, () => w(4))
  expect(fade[0]).toMatchObject({ uSegments: 4, uSegFrom: 2 }) // the new fold over the old one
  expect(fade[0].uSegMix).toBeGreaterThan(0)
  expect(fade[0].uSegMix).toBeLessThan(0.01)
  expect(fade[14].uSegMix).toBeCloseTo(0.5, 9) // 0.25 s: half way (smoothstep)
  expect(fade[28].uSegMix).toBeLessThan(1)
  expect(fade[30]).toMatchObject({ uSegments: 4, uSegMix: 1 }) // over after 0.5 s
  w(8) // a fade 4 → 8 starts
  st.reset = true
  expect(w(8)).toMatchObject({ uSegments: 8, uSegFrom: 8, uSegMix: 1 }) // back on stage: at once
  expect(st.reset).toBe(false) // frame() clears it
})

test('D7 stepTiles: it glides; it snaps on reset', () => {
  const st = chainState(), n = (tiles: number) => at({ tiles }, st).warp.uTiles as number
  expect(n(0)).toBe(1) // off: one tile
  const glide = Array.from({ length: 120 }, () => n(6))
  expect(glide[0]).toBeGreaterThan(1)
  expect(glide[0]).toBeLessThan(1.05) // no jump
  for (let i = 1; i < glide.length; i++) {
    expect(glide[i]).toBeGreaterThanOrEqual(glide[i - 1])
    expect(Math.log(glide[i] / glide[i - 1])).toBeLessThan(2.01 * DT) // the cap, 2 log-counts per second (the spring's own step at the hand-off: 2.004)
  }
  expect(glide[60]).toBeLessThan(5.8) // 1 to 6 takes about a second
  expect(glide.at(-1)).toBe(6) // settled within 2 s
  n(2) // a glide 6 → 2 starts
  st.reset = true
  expect(n(2)).toBe(2) // back on stage: at once
})

test('D8 tint (C10): every uTint channel ≤ 1 for palMid = [1.3, 1, 1]', () => {
  const tint = (mid: number[]) => frame(V, F, S, 0, chainState(), mid, DT, DT, 0, 1).warp.uTint as number[]
  const hot = tint([1.3, 1, 1])
  for (const c of hot) expect(c).toBeLessThanOrEqual(1)
  expect(hot[0]).toBe(1)
  tint([0, 0.5, 1]).forEach((c, i) => expect(c).toBeCloseTo([0.88, 0.94, 1][i], 12)) // white lerped .12 toward the colour
})

test('D9 stale (N2): on the frame the feedback turns on uHist is 0; on the next it is 1', () => {
  const st = chainState(), hist = (persist: number) => at({ persist }, st).warp.uHist
  expect([hist(0.5), hist(0.5)]).toEqual([0, 1]) // a new layer: its history is empty
  for (let i = 0; i < 20; i++) hist(0) // off: the persist falls over 15 frames (PF), then the pass skips: stale
  expect(at({ persist: 0 }, st).feedback).toBe(false)
  expect([hist(0.5), hist(0.5)]).toEqual([0, 1]) // back on: its first frame ignores it
})

test('D10 motion clock (C6): the spin angle follows dt, not dtl', () => {
  const a = chainState(), b = chainState(), c = chainState()
  at({}, a)
  at({}, b, {}, 0, DT, DT / 4) // the same layer clock, a short real frame
  expect(b.angle).toBe(a.angle)
  expect(a.angle).toBeCloseTo(0.5 * DT * 0.12 * (0.5 + 0.4), 15) // engine.js:160: spin · dt · .12 · (.5 + mids)
  const cf = at({}, c, {}, 0, 2 * DT, DT) // a layer at speed 2
  expect(c.angle).toBeCloseTo(2 * a.angle, 15)
  expect(cf.warp.uAngle).toBe(c.angle)
})

test('the warp reads the reacted mids and sub, as the donor engine reads the reacted signal', () => {
  const st = chainState(), cf = at({ react: 1 }, st) // gain 2: mids .4 → .8, sub .3 → .6
  expect(cf.react).toBe(2)
  expect(st.angle).toBeCloseTo(0.5 * DT * 0.12 * (0.5 + 0.8), 15)
  expect(cf.warp.uWobble).toBeCloseTo((0.35 + 0.5 * 1.8) * (0.4 + 0.6 * 1.2), 15)
})

test('D11 reactTo: at react 1 the levels stay (clamped at 1), at 2 they double (clamped at 1); s.kick = cf.kick; the impulses stay', () => {
  const cf = at({}), s = (): Signal => ({ ...S, kick: 0.2, onKick: 0.9, onMid: 0.6, onHigh: 0.4, sub: 0.3, mids: 0.6, highs: 0.2, air: 0.1, energy: 1.05 })
  const one = s(), two = s()
  reactTo(one, { ...cf, kick: 0.7, react: 1 })
  expect(one).toMatchObject({ kick: 0.7, sub: 0.3, mids: 0.6, highs: 0.2, air: 0.1, energy: 1, onKick: 0.9, onMid: 0.6, onHigh: 0.4 })
  reactTo(two, { ...cf, kick: 0.7, react: 2 })
  expect(two).toMatchObject({ kick: 0.7, sub: 0.6, mids: 1, highs: 0.4, air: 0.2, energy: 1, onKick: 0.9, onMid: 0.6, onHigh: 0.4 })
})

// S1.2: the light limiter (plan § The light limiter, final text). dtl = 1/60 unless said.
/** The stock look over a track: the strength must be the stock scene's 9 k0², its levels clamped at 1 (N6). */
const stockRun = (sig: typeof SWELL) => {
  const st = chainState()
  let hot0 = 0
  for (const { s, hit } of sig) {
    hot0 = heatStep(hot0, hit, DT)
    const cf = frame(V, F, s, hit, st, MID, DT, DT, 0, 1)
    expect(Math.abs(cf.bloom / (9 * kOf(Math.min(1, s.energy), hot0, 1) ** 2) - 1)).toBeLessThan(1e-6)
    expect(Math.abs(st.light!.glow / st.light!.stock - 1)).toBeLessThan(1e-6) // transparent: the glow is the stock's
  }
}

test('L1 stock: stock values, a 600-frame synthetic signal: the strength equals 9 k0² within 1e-6 relative on every frame', () => {
  stockRun(SWELL)
})

test('L1b stock at energy 1.05 (N6): the same with the energy between .9 and 1.1', () => {
  stockRun(LOUD)
})

test("L2 dim: heat .2, react .3, brightness = base, bloomMul = the row's: the strength equals 9 k² within 1e-6 relative", () => {
  const st = chainState()
  let hot = 0
  for (const { s, hit } of SWELL) {
    hot = heatStep(hot, Math.min(1, hit * 0.6), DT) // react gain .6, before the slew (N1)
    const cf = frame({ ...V, heat: 0.2, react: 0.3 }, F, s, hit, st, MID, DT, DT, 0, 1)
    expect(Math.abs(cf.bloom / (9 * kOf(s.energy * 0.6, hot, drastic(0.2)) ** 2) - 1)).toBeLessThan(1e-6)
  }
})

test("L3 hot: heat 1, react 1, brightness 2.4: every frame's glow move is inside dyn ± foll", () => {
  const st = chainState()
  let held = 0
  SWELL.forEach(({ s, hit }, i) => {
    const L = st.light
    frame(i < 60 ? V : { ...V, heat: 1, react: 1, brightness: 2.4 }, F, s, hit, st, MID, DT, DT, 0, 1)
    if (!L) return
    const [lo, hi] = bound(L, st.light!), glow = st.light!.glow
    expect(glow).toBeGreaterThanOrEqual(lo - 1e-9)
    expect(glow).toBeLessThanOrEqual(hi + 1e-9)
    held += +(Math.min(glow - lo, hi - glow) < 1e-9)
  })
  expect(held).toBeGreaterThan(30) // the bound binds: the hot look's ×16 glow arrives over seconds
})

test("L4 undo (C2): brightness 2.4 → 1.36 and heat .98 → .36 between two frames: uGain ≥ 2.345; the glow falls ≤ 2.34 % plus the stock's move; vignette ≤ 1/60 of its range, lens and react gain ≤ 1/30 of theirs", () => {
  const st = chainState()
  at({ brightness: 2.4, heat: 0.98, vignette: 1, lens: 1, react: 1 }, st) // a new layer: its targets at once
  const L = st.light!
  const cf = at({ brightness: 1.36, heat: 0.36, vignette: 0.34, lens: 0, react: 0.3 }, st)
  expect(cf.finish.uGain).toBeGreaterThanOrEqual(2.345)
  expect(st.light!.stock).toBe(L.stock) // a constant signal: the stock's own move is 0
  expect(st.light!.glow).toBeCloseTo(L.glow * (2 - X), 9) // − 2.337 %
  expect(L.vig - cf.finish.uVig).toBeCloseTo(1 / 60, 12)
  expect(L.lens - st.light!.lens).toBeCloseTo(1 / 30, 12)
  expect(L.react - cf.react).toBeCloseTo(2 / 30, 12) // its range is REACT_MAX, 2
})

test('L5 real time (C6): hit 0 → 1: cf.kick is .3408 with dt at 3/60, and the same when the real frame took 100 ms', () => {
  expect(HOT1).toBeCloseTo(0.3408, 4)
  expect(at({}, chainState(), {}, 1, 3 * DT).kick).toBeCloseTo(HOT1, 12)
  const { dtl } = clock(1100, 1000, 7, 6) // 100 ms since the last draw
  expect(dtl).toBe(DT)
  expect(at({}, chainState(), {}, 1, DT, dtl).kick).toBeCloseTo(HOT1, 12)
})

test('L6 light null: every limited value equals its target on that frame', () => {
  const st = chainState()
  at({}, st)
  for (let i = 0; i < 5; i++) at({ brightness: 2.4, heat: 0.9, vignette: 1, lens: 1, lensStyle: 3, react: 1, persist: 0 }, st) // mid-slew
  st.light = null
  const cf = at({ brightness: 2.2, heat: 0.8, vignette: 0.7, lens: 0.6, lensStyle: 2, react: 0.9, persist: 0.3 }, st)
  expect(cf.finish).toMatchObject({ uGain: 2.2, uVig: 0.7 })
  expect([cf.react, cf.warp.uPersist, st.light!.lens, st.style]).toEqual([1.8, 0.3, 0.6, 2])
  expect(cf.bloom).toBeCloseTo(9 * kOf(0.5 * 1.8, 0, drastic(0.8)) ** 2, 12)
})

test('L7 react before the slew (N1): hit 0 → 1 with the react gain settled at 2: cf.kick after one frame ≤ .3408', () => {
  const st = chainState()
  at({}, st)
  for (let i = 0; i < 60; i++) at({ react: 1 }, st) // the gain slews 1 → 2 in 15 frames
  expect(st.light!.react).toBe(2)
  const cf = at({ react: 1 }, st, {}, 1)
  expect(cf.kick).toBeLessThanOrEqual(HOT1 + 1e-12) // not min(1, 2 × .34) = .68
  expect(cf.kick).toBeCloseTo(HOT1, 12)
})

test('L8 REACT_MAX (N1): knobs.REACT_MAX 1.5, react 1: the settled cf.react ≤ 1.5', () => {
  const K: Knobs = { ...KNOBS, REACT_MAX: 1.5 }, st = chainState()
  const gain = (react: number, s = st) => frame({ ...V, react }, F, S, 0, s, MID, DT, DT, 0, 1, K).react
  gain(0.5)
  const gains = Array.from({ length: 60 }, () => gain(1))
  expect(Math.max(...gains)).toBeLessThanOrEqual(1.5)
  expect(gains.at(-1)).toBe(1.5)
  expect(gain(1, chainState())).toBe(1.5) // a new layer: the capped target at once
})

test('N2a reset: st.reset true → targets on that frame; uHist is 0 on it; the flag is cleared after it', () => {
  const st = chainState(), hot = { brightness: 2.4, vignette: 1, react: 1 }
  at({}, st)
  for (let i = 0; i < 5; i++) at(hot, st) // mid-slew, the history fed back
  expect(st.light!.gain).toBeLessThan(2.4)
  st.reset = true
  const cf = at(hot, st)
  expect(cf.finish).toMatchObject({ uGain: 2.4, uVig: 1 })
  expect([cf.react, cf.warp.uHist, st.reset]).toEqual([2, 0, false])
  expect(at(hot, st).warp.uHist).toBe(1)
})

test('N2b persist back from 0: a light state mid-slew, then persist 0 → .5: uGain moves by at most × LIGHT_X ** dtl; st.light is not null', () => {
  const st = chainState()
  for (let i = 0; i < 30; i++) at({ persist: 0 }, st) // no trails: the history is stale
  at({ persist: 0, brightness: 2.4 }, st) // the gain on its slew
  const g = st.light!.gain, cf = at({ persist: 0.5, brightness: 2.4 }, st)
  expect(cf.warp.uHist).toBe(0) // the stale history is ignored, the light is not reset
  expect(st.light).not.toBeNull()
  expect(cf.finish.uGain / g).toBeLessThanOrEqual(X + 1e-12)
  expect(cf.finish.uGain).toBeLessThan(2.4)
})

test('N2c clock, late draw: 300 ms since the last draw, engine frames differ by 1: reset false, dtl 1/60', () => {
  expect(clock(1300, 1000, 41, 40)).toEqual({ dtl: DT, reset: false })
  expect(clock(1008, 1000, 41, 40).dtl).toBeCloseTo(0.008, 12) // a short frame: its real time
  expect(clock(1000, 1008, 41, 40).dtl).toBe(0) // never negative
})

test('N2d clock, skipped frame: engine frames differ by 2, and a new native: reset true', () => {
  expect(clock(1016, 1000, 42, 40).reset).toBe(true)
  expect(clock(1016, 1000, 42, -Infinity).reset).toBe(true)
})

test('N4a NaN energy: s.energy NaN for one frame, then finite: every number of cf is finite on that frame and the next two; each glow move stays inside dyn ± foll', () => {
  const st = chainState(), v = { ...V, heat: 0.9, react: 0.8, brightness: 2 }
  for (const { s, hit } of SWELL.slice(0, 30)) frame(v, F, s, hit, st, MID, DT, DT, 0, 1)
  for (const [energy, hit] of [[NaN, 1], [0.5, 1], [0.6, 1], [0.6, NaN], [0.6, 1]]) { // a NaN hit reads 0 too
    const L = st.light!, cf = frame(v, F, { ...S, energy }, hit, st, MID, DT, DT, 0, 1)
    expect(nums(cf).every(Number.isFinite)).toBe(true)
    const [lo, hi] = bound(L, st.light!)
    expect(st.light!.glow).toBeGreaterThanOrEqual(lo - 1e-9)
    expect(st.light!.glow).toBeLessThanOrEqual(hi + 1e-9)
  }
})

test("N4b NaN glow: st.light.glow = NaN: the next frame's glow is finite", () => {
  const st = chainState()
  at({}, st)
  st.light!.glow = NaN
  const cf = at({}, st)
  expect(Number.isFinite(st.light!.glow)).toBe(true)
  expect(cf.bloom).toBeCloseTo(9 * kOf(0.5, 0, 1) ** 2, 12) // its target (flashGate's guard)
  at({}, st)
  expect(Number.isFinite(st.light!.glow)).toBe(true)
})

test.skipIf(!flashPairs)('N5a pump model: brightness 2.4 / 1.36 and vignette 0 / 1 swapped together every 125 ms for 2 s: ≤ 3 flash pairs in every second; > 3 with VIG_S .5', () => {
  const pump = (K: Knobs) => {
    const st = chainState(), t: number[] = [], luma: number[] = []
    let prev: ChainFrame['finish'] | null = null, y = 0.5
    for (let i = 0; i < 120; i++) {
      const bright = Math.floor(i / 7.5) % 2 === 0 // 7.5 frames = 125 ms
      const { finish } = frame({ ...V, brightness: bright ? 2.4 : 1.36, vignette: bright ? 0 : 1 }, F, S, 0, st, MID, DT, DT, 0, 1, K)
      if (prev) y += Math.log(finish.uGain / prev.uGain) / 3.6 - 0.4 * 0.75 * (finish.uVig - prev.uVig) // the luma model
      prev = finish
      t.push(i * DT)
      luma.push(y)
    }
    return flashPairs!(t, luma).max1s
  }
  expect(pump(KNOBS)).toBeLessThanOrEqual(3)
  expect(pump({ ...KNOBS, VIG_S: 0.5 })).toBeGreaterThan(3)
})

test('F1 kick terms: the zoom push and uAber read cf.kick; on hit 0 → 1 neither takes more than the .3408 share in one frame', () => {
  const push = (kick: number) => (1 + (1.1 - 1 + kick * (0.15 + 0.8 * 0.8) * 0.3) * (0.1 + 1.8 * 0.5)) ** DT // engine.js:181-183
  for (const react of [0.5, 1]) {
    const st = chainState(), v = { react, heat: 0.8, zoom: 1.1, aber: 2 }
    at(v, st)
    const cf = at(v, st, {}, 1)
    expect(cf.kick).toBeCloseTo(HOT1, 12)
    expect(cf.finish.uAber).toBeCloseTo(2 * (0.22 + cf.kick), 12)
    expect(cf.warp.uZoom).toBeCloseTo(push(cf.kick), 15)
  }
})

test('F4 style duck: a style change at lens 1: the drawn style holds until the limited lens ≤ .01, then swaps, then the amount returns', () => {
  const st = chainState()
  at({ lens: 1, lensStyle: 1 }, st)
  const trace = Array.from({ length: 70 }, () => (at({ lens: 1, lensStyle: 4 }, st), { lens: st.light!.lens, style: st.style }))
  const swap = trace.findIndex((f) => f.style === 4)
  expect(swap).toBe(29) // 1/30 of the range per frame: the duck takes 0.5 s
  expect(trace.slice(0, swap).every((f) => f.style === 1 && f.lens > 0.01)).toBe(true)
  expect(trace[swap].lens).toBeLessThanOrEqual(0.01)
  for (let i = swap + 1; i < trace.length; i++) expect(trace[i].lens).toBeGreaterThanOrEqual(trace[i - 1].lens)
  expect(trace.at(-1)!.lens).toBe(1)
})

test('F6 analysis off: a constant signal: dyn is 0; a heat jump moves the glow by at most × LIGHT_X ** dtl per frame', () => {
  const st = chainState()
  at({}, st)
  const stock = st.light!.stock
  let held = 0
  for (let i = 0; i < 180; i++) {
    const g = st.light!.glow
    at({ heat: 1 }, st)
    expect(st.light!.stock).toBe(stock) // the stock glow holds: its move, dyn, is 0
    expect(st.light!.glow / g).toBeLessThanOrEqual(X + 1e-12)
    held += +(st.light!.glow / g > X - 1e-9)
  }
  expect(held).toBeGreaterThan(100) // heat .5 → 1 is ×16: 2 s at ×4 per second
})

test('PF persist fall: .97 → 0 takes at least 29 frames; 0 → .97 takes 1', () => {
  const st = chainState(), p = (persist: number) => at({ persist }, st).warp.uPersist as number
  expect(p(0.97)).toBe(0.97)
  const fall = Array.from({ length: 40 }, () => p(0))
  expect(fall.findIndex((x) => x === 0)).toBeGreaterThanOrEqual(29)
  expect(fall.at(-1)).toBe(0)
  expect(p(0.97)).toBe(0.97)
})

test('BS bloom skip (R2): at bloomMul 0 the glow follows down; cf.bloom is exactly 0 once the strength is under 1e-3', () => {
  const st = chainState()
  at({}, st)
  const trace = Array.from({ length: 300 }, () => [at({ bloomMul: 0 }, st).bloom, st.light!.glow / 1.4])
  for (let i = 1; i < trace.length; i++) expect(trace[i][0]).toBeLessThanOrEqual(trace[i - 1][0])
  const off = trace.findIndex(([b]) => b === 0)
  expect(off).toBeGreaterThan(60) // it follows down, it does not cut
  for (const [b, strength] of trace) expect(b).toBe(strength < 1e-3 ? 0 : strength)
  expect(trace.at(-1)![1]).toBe(0)
})
