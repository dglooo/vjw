// vs3/chain.ts, pure part 1 (plan_vs3_engine S1.1): the donor's per-frame wiring for the macros, the mirror and the
// feedback, with the state passed in. No GL.
import { expect, test } from 'vitest'
import { chainState, drastic, frame, reactTo, type ChainFrame, type ChainState, type LookValues, type SceneFacts } from './chain'
import type { Signal } from './host'

const DT = 1 / 60
// the stock look: the macros at .5 and the donor's BASE_POST (post-shaders.js:17-29)
const V: LookValues = { react: 0.5, chaos: 0.5, trails: 0.5, heat: 0.5, mirror: 0, tiles: 0, twist: 0, slice: 0, spin: 0.5, persist: 0.5, zoom: 1.04, bloomMul: 1, lens: 0, lensStyle: 0, aber: 1, vignette: 0.34, brightness: 1.4, hueDrift: 0 }
const F: SceneFacts = { bloom: { strength: 0.5, gain: 0.4 }, hint: null, wet: 1, grain: 1, lateTrails: 0, filter: false, bloomRow: 1, gainBase: 1.4, vigRange: 1 }
const S: Signal = { onKick: 0, kick: 0, onMid: 0, onHigh: 0, sub: 0.3, mids: 0.4, highs: 0.2, air: 0.1, energy: 0.5, specHi: new Float32Array(192) }
/** One frame of the stock look with `v` and `f` over it. */
const at = (v: Partial<LookValues>, st = chainState(), f: Partial<SceneFacts> = {}, hit = 0, dt = DT, dtl = DT) => frame({ ...V, ...v }, { ...F, ...f }, S, hit, st, [0.5, 0.4, 0.8], dt, dtl, 0, 16 / 9)

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
  expect([hist(0), hist(0), hist(0.5), hist(0.5)]).toEqual([1, 0, 0, 1]) // off: stale; back on: its first frame ignores it
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
