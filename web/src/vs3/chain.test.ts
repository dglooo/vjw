// vs3/chain.ts (plan_vs3_engine S1.1, S1.2): the donor's per-frame wiring for the macros, the mirror and the feedback,
// and the light limiter, with the state passed in. No GL. S3.1: createChain on a recording fake (below). S3b.1: the
// exposure servo (at the end).
import { expect, test, vi } from 'vitest'
import { createBloom } from '../gl/bloom'
import { heatStep } from '../gl/post'
import { chainState, clock, createChain, drastic, expose, frame, KNOBS, PROBE, reactTo, SERVO, UPDATE, warmChain, WARP, type ChainFrame, type ChainState, type Knobs, type Light, type LookValues, type SceneFacts, type Servo } from './chain'
import type { Signal } from './host'

/** engine.ts takes the page's canvas + WebGL at import, so a recording fake stands for it. A target: a framebuffer, its
 *  texture, its size; a fit() that changes the size stands for the engine's texImage2D (a persistent target gets a new
 *  texture, as the engine's resample does), a program() cache miss for its compileShader. The fake GL keeps the bound
 *  framebuffer; each draw records it, the program's source and its uniforms. Every fake object has its own id, so
 *  toEqual tells them apart. A generateMipmap records as a draw 'mipmap' of the bound texture. */
const H = vi.hoisted(() => {
  type T = { framebuffer: object; attachments: object[]; width: number; height: number; hdr: boolean; persistent: boolean; tex: { min?: number }; fit(w: number, h: number): void }
  const E = { bound: null as object | null, tex: null as object | null, draws: [] as { fb: object | null; fs: string; u: Record<string, unknown> }[], alloc: 0, compile: 0, targets: [] as T[], cache: new Set<string>(), n: 0 }
  const id = () => ({ id: ++E.n })
  const program = (vs: string, fs: string) => {
    if (!E.cache.has(vs + '\0' + fs)) {
      E.cache.add(vs + '\0' + fs)
      E.compile++
    }
    return { fs }
  }
  const draw = (info: { fs: string }, u: Record<string, unknown>) => void E.draws.push({ fb: E.bound, fs: info.fs, u })
  const renderTarget = (hdr = false, persistent = false, tex: { min?: number } = {}) => {
    const t: T = {
      framebuffer: id(), attachments: [id()], width: 1, height: 1, hdr, persistent, tex,
      fit(w, h) {
        if (t.width === w && t.height === h) return
        E.alloc++
        Object.assign(t, { width: w, height: h }, persistent && { framebuffer: id(), attachments: [id()] })
      },
    }
    E.targets.push(t)
    return t
  }
  const fullscreenProgram = (fs: string) => {
    const info = program('', fs)
    return (u: Record<string, unknown>) => draw(info, u)
  }
  const engine = { program, draw, renderTarget, fullscreenProgram, programAsync: async (vs: string, fs: string) => void program(vs, fs) }
  const gl = {
    BLEND: 0x0be2, ONE: 1, TEXTURE_2D: 0x0de1, NEAREST_MIPMAP_NEAREST: 0x2700, viewport() {}, enable() {}, disable() {}, blendFunc() {},
    bindFramebuffer: (_: number, fb: object | null) => void (E.bound = fb),
    bindTexture: (_: number, t: object | null) => void (E.tex = t),
    generateMipmap: () => void E.draws.push({ fb: E.bound, fs: 'mipmap', u: { tex: E.tex } }),
  } as unknown as WebGL2RenderingContext
  return { E, engine, gl }
})
vi.mock('../gl/engine', () => H.engine)
const { E, gl } = H

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

// S3c (G3b lever 1): the scene's own kick light, compensated for brightness above stock
/** One frame and reactTo at hit 1, onKick .9: what the scene reads. */
const read = (v: Partial<LookValues>, f: Partial<SceneFacts> = {}, K = KNOBS, st = chainState(), sig: Signal = { ...S, onKick: 0.9 }, hit = 1) => {
  const cf = frame({ ...V, ...v }, { ...F, ...f }, sig, hit, st, MID, DT, DT, 0, 1, K)
  reactTo(sig, cf)
  return { s: sig, cf }
}

test('KC1 kick light: at brightness 2.4 the scene reads its kick and onKick × 1.4 / 2.4, on the limited uGain; KICK_COMP 0 and a filter leave them', () => {
  const { s, cf } = read({ brightness: 2.4 }) // a new layer: uGain takes 2.4 at once
  expect(cf.finish.uGain).toBe(2.4)
  expect(s.kick).toBeCloseTo((cf.kick * 1.4) / 2.4, 15)
  expect(s.onKick).toBeCloseTo((0.9 * 1.4) / 2.4, 15)
  const st = chainState()
  read({}, {}, KNOBS, st)
  expect(read({ brightness: 2.4 }, {}, KNOBS, st).s.onKick).toBeCloseTo(0.9 / X, 12) // a slider jump: uGain × X, the factor ÷ X
  for (const off of [read({ brightness: 2.4 }, { filter: true }), read({ brightness: 2.4 }, {}, { ...KNOBS, KICK_COMP: 0 })]) expect([off.s.kick, off.s.onKick]).toEqual([off.cf.kick, 0.9])
})

test('KC2 at or below stock: brightness 1.4 and 1.36 leave the kick and onKick; a 600-frame track is bit-identical with KICK_COMP 0', () => {
  const run = (brightness: number, K = KNOBS, st = chainState()) => SWELL.map(({ s, hit }) => {
    const r = read({ brightness }, {}, K, st, { ...s, onKick: hit }, hit)
    return [...nums(r.cf), r.cf.kickGain, r.s.kick, r.s.onKick, r.s.energy]
  })
  for (const b of [1.4, 1.36]) {
    const { s, cf } = read({ brightness: b })
    expect([cf.kickGain, s.kick, s.onKick]).toEqual([1, cf.kick, 0.9])
    expect(run(b)).toEqual(run(b, { ...KNOBS, KICK_COMP: 0 }))
  }
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

// S3.1: createChain on the fake engine (plan § S3.1; design C10, C11, C12)
const SRC = { id: 'scene' } as WebGLTexture // the scene's target
const W = 640, HT = 360
/** A frame of the stock look with the three switches set; the lens stays off (S5.1). */
const cfOf = (mirror: boolean, feedback: boolean, bloom: boolean): ChainFrame => ({ ...at({}), mirror, feedback, bloom: bloom ? 1 : 0 })
const COMBOS = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => cfOf(!!(i & 1), !!(i & 2), !!(i & 4)))
const samplers = (fs: string) => [...fs.matchAll(/uniform sampler2D ([^;]+);/g)].flatMap((m) => m[1].split(',').map((s) => s.trim()))
/** The texture a draw wrote: its bound framebuffer's, one of the fake's targets. */
const into = (d: (typeof E.draws)[number]) => {
  const t = E.targets.find((x) => x.framebuffer === d.fb)
  expect(t, 'a draw into one of our targets').toBeDefined()
  return t!.attachments[0]
}

test('C10a guard: the warp source contains isnan and isinf (the donor NaN / Inf drop, verbatim)', () => {
  expect(WARP).toContain('isnan')
  expect(WARP).toContain('isinf')
  expect(WARP).toContain('if (any(isnan(col)) || any(isinf(col))) col = vec3(0.0);')
})

test('C11a own target: the 8 on/off combinations of mirror, feedback and bloom (lens off), each after each: no draw samples its draw target, every sampler is set, the warp reads the scene and what it wrote last, the bloom reads the warp', () => {
  const c = createChain(gl, W, HT), bloom = createBloom(gl, 8, 0.3)
  let last: unknown = null // the texture the last warp wrote
  for (const a of COMBOS) for (const b of COMBOS) for (const f of [a, b]) {
    E.draws.length = 0
    const out = c.apply(SRC, W, HT, f, bloom)
    for (const d of E.draws) for (const s of samplers(d.fs)) {
      expect(d.u[s], s).toBeDefined() // an unset sampler keeps its unit's last texture: maybe this target
      expect(d.u[s], s).not.toBe(into(d))
    }
    const warps = E.draws.filter((d) => d.fs === WARP)
    expect(warps.length).toBe(f.mirror || f.feedback ? 1 : 0)
    for (const d of warps) {
      expect(d.u.uSrc).toBe(SRC)
      if (last) expect(d.u.uPrev).toBe(last)
      last = into(d)
    }
    const fed = warps.length ? into(warps[0]) : SRC // what the bloom reads
    if (f.bloom) expect([E.draws[warps.length].u.uSrc, E.draws.at(-1)!.u.uSrc]).toEqual([fed, fed]) // its first downsample, its combine
    expect(E.draws.length).toBe(warps.length + (f.bloom ? 8 + 7 + 1 : 0)) // the bloom: 8 down, 7 up, the combine
    expect(out).toBe(E.draws.length ? into(E.draws.at(-1)!) : SRC) // the finish reads the last pass's output
  }
})

test('C11b skip: mirror and feedback false: no warp draw, the bloom reads src; with the bloom off too: no draw, src back', () => {
  const c = createChain(gl, W, HT), bloom = createBloom(gl, 8, 0.3)
  E.draws.length = 0
  c.apply(SRC, W, HT, cfOf(false, false, true), bloom)
  expect(E.draws.some((d) => d.fs === WARP)).toBe(false)
  expect([E.draws[0].u.uSrc, E.draws.at(-1)!.u.uSrc]).toEqual([SRC, SRC]) // its first downsample, its combine
  E.draws.length = 0
  expect(c.apply(SRC, W, HT, cfOf(false, false, false), bloom)).toBe(SRC)
  expect(E.draws).toEqual([])
})

test('C12a no allocation after create: createChain allocates the three targets at w × h and the servo\'s three; after warmChain() an apply at w × h that turns the warp on, and a servo frame, allocate nothing and compile nothing', async () => {
  E.cache.clear() // nothing compiled yet
  const n = E.targets.length
  const c = createChain(gl, W, HT)
  expect(E.targets.slice(n).map((t) => [t.hdr, t.persistent, t.width, t.height])).toEqual([[true, true, W, HT], [true, true, W, HT], [true, false, W, HT], [true, false, PROBE, PROBE], [true, false, 1, 1], [true, false, 1, 1]])
  const bloom = createBloom(gl, 8, 0.3), compiled = E.compile
  await warmChain()
  expect(E.compile).toBe(compiled + 2) // the warp and UPDATE, off the visible frames
  const [alloc, compile] = [E.alloc, E.compile]
  c.apply(SRC, W, HT, cfOf(false, false, false), bloom)
  c.apply(SRC, W, HT, cfOf(true, true, false), bloom) // a glide turns the warp on
  expect(E.draws.at(-1)!.fs).toBe(WARP)
  c.servo(at({}).servo, () => {})
  expect(E.draws.at(-1)!.fs).toBe(UPDATE)
  expect([E.alloc - alloc, E.compile - compile]).toEqual([0, 0])
})

test('C12b re-fit: a size change re-fits the three targets once; the servo\'s keep their sizes', () => {
  const n = E.targets.length
  const c = createChain(gl, W, HT), mine = E.targets.slice(n), bloom = createBloom(gl, 8, 0.3)
  const alloc = E.alloc
  c.apply(SRC, 320, 180, cfOf(true, true, false), bloom)
  c.apply(SRC, 320, 180, cfOf(true, true, false), bloom)
  expect(E.alloc - alloc).toBe(3)
  expect(mine.map((t) => [t.width, t.height])).toEqual([[320, 180], [320, 180], [320, 180], [PROBE, PROBE], [1, 1], [1, 1]])
})

// S3b.1: the exposure servo (plan § S3b.1; design Amendment 2; skeptic N2, N3, N4)
/** The servo's uniforms on a frame after the first (no reset), the stock look with `v` and `f` over it. */
const servoU = (v: Partial<LookValues> = {}, f: Partial<SceneFacts> = {}) => {
  const st = chainState()
  at(v, st, f)
  return at(v, st, f).servo!
}
/** e after `n` frames over a plant whose mean is m0 × e: the picture's light scales with e. */
const settle = (u: Servo, m0: number, e = 1, n = 1500) => {
  for (let i = 0; i < n; i++) e = expose(e, m0 * e, u)
  return e
}
const T19 = SERVO.TARGET // the target at base brightness

test('E1 law: at a 10× error e moves by at most × 1.0155 per frame; it settles on target / mean inside [.6, 1]', () => {
  const u = servoU()
  expect(u).toEqual({ uTarget: expect.closeTo(T19, 12), uK: DT / 2.5, uX: Math.log(X), uLo: Math.log(0.6) })
  for (const e of [0.6, 0.8, 1]) {
    const down = expose(e, 10 * T19, u), up = expose(e, T19 / 10, u)
    expect(e / down).toBeLessThanOrEqual(1.0155)
    if (e > 0.6) expect(down).toBeLessThan(e)
    expect(up / e).toBeLessThanOrEqual(1.0155)
  }
  expect(settle(u, T19 / 0.75)).toBeCloseTo(0.75, 3)
  expect(settle(u, T19 / 0.3)).toBeCloseTo(0.6, 12) // the floor
  expect(settle(u, T19 / 2, 0.6)).toBe(1) // the top
  expect(servoU({ brightness: 2.4 }).uTarget).toBeCloseTo((T19 * 2.4) / 1.4, 12) // the target scales with brightness
})

test('E2 no lift (N3): mean .005, target .19: e ≤ 1 after 0.3 s, from any start', () => {
  const u = servoU()
  for (let e = 0.6, i = 0; i < 18; i++) expect((e = expose(e, 0.005, u))).toBeLessThanOrEqual(1)
  for (let e = 1, i = 0; i < 18; i++) expect((e = expose(e, 0.005, u))).toBe(1)
})

test('E3 faithful (N3): a faithful() scene: e is 1, on its first frame and after; a filter has no servo', () => {
  const first = at({}, chainState(), { faithful: true }).servo!
  for (const u of [first, servoU({}, { faithful: true })]) for (const [e, mean] of [[0.6, 0.5], [0.8, 0.05], [1, 1]]) expect(expose(e, mean, u)).toBe(1)
  expect(at({}, chainState(), { filter: true }).servo).toBeNull()
})

test("E10 faithful glow (original main.js:15700): a faithful() frame has no resting glow, so heat lifts none; the energy term stays", () => {
  const hot = { heat: 0.98, brightness: 2.4 }, fixed = { strength: 0.12, gain: 0, kick: 0 } // morphogen 2.0's fixed modes
  expect(at(hot, chainState(), { bloom: fixed }).bloom).toBeGreaterThan(1) // the haze: 9 × (.12 × heat's 4^.96)²
  expect(at(hot, chainState(), { bloom: fixed, faithful: true }).bloom).toBe(0)
  const k = 0.5 * 0.4 * drastic(0.98) // F: energy .5 × gain .4 (react .5 reads × 1); its rest .5 dropped
  expect(at(hot, chainState(), { faithful: true }).bloom).toBeCloseTo(9 * k * k, 9)
})

test('E4 NaN mean (N4): e keeps its value; an Inf mean takes the capped step down, a black frame reads .01: both finite', () => {
  const u = servoU()
  expect(expose(0.8, NaN, u)).toBe(0.8)
  expect(expose(0.8, Infinity, u)).toBeCloseTo(0.8 / X, 12)
  expect(expose(0.8, 0, u)).toBeCloseTo(0.8 * 19 ** (DT / 2.5), 12)
})

test('E6 reset snaps; stale does not (N2): st.reset takes the whole step at once, from any old e; persist back from 0 takes one frame of the law', () => {
  const st = chainState()
  for (let i = 0; i < 30; i++) at({ persist: 0 }, st) // no trails: the history is stale
  const stale = at({ persist: 0.5 }, st)
  expect(stale.warp.uHist).toBe(0) // the history's stale frame
  expect(stale.servo).toMatchObject({ uK: DT / 2.5, uX: Math.log(X) })
  expect(expose(1, 0.5, stale.servo!)).toBeCloseTo((T19 / 0.5) ** (DT / 2.5), 12)
  st.reset = true
  const reset = at({ persist: 0.5 }, st).servo!
  expect([reset.uK, reset.uX]).toEqual([1, 1])
  expect(expose(1, 0.25, reset)).toBeCloseTo(0.76, 12) // target / mean
  expect(expose(0.9, 0.25 * 0.9, reset)).toBeCloseTo(0.76, 12) // the probe read the picture at the old e
  expect(expose(1, 0.5, reset)).toBeCloseTo(0.6, 12) // clamped
  expect(at({ persist: 0.5 }, st).servo!.uK).toBe(DT / 2.5) // the next frame: the law again
})

test('E7 sources (N4): UPDATE reads the probe top level and keeps the old e for a non-finite value', () => {
  expect(UPDATE).toContain(`texelFetch(uProbe, ivec2(0), ${Math.log2(PROBE)})`)
  expect(UPDATE).toContain('max(m, 0.01)')
  expect(UPDATE).toContain('if (isnan(m) || isnan(n) || isinf(n)) n = l;')
})

// Skeptic planner note 4: the probe point-samples 4 096 of up to 5.09 M pixels. Sharp line art (2 px rings, 48 spokes
// 1.5 px wide, white on black) at the two sizes the gates judge: the 1.93 MP harness and the 5.09 MP fullscreen. A grid
// period commensurate with the lines aliases (1080p with 6 px rings: −.027; scratchpad/vs3-engine/s3b1/grid.mjs).
test('E5a probe grid: on line art the PROBE × PROBE bilinear samples at the texel centres hold the full mean within ±.02', () => {
  for (const [w, h, ring] of [[1728, 1117, 6], [1728, 1117, 17.45], [2994, 1700, 13]]) { // a 32² probe misses the second by .027, a 16² the first by .051
    const img = new Uint8Array(w * h), seg = (2 * Math.PI) / 48
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = x + 0.5 - w / 2, dy = y + 0.5 - h / 2, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx) + Math.PI
      img[y * w + x] = +(r % ring < 2 || Math.abs((a % seg) - seg / 2) * r < 0.75)
    }
    const px = (x: number, y: number) => img[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))]
    let probe = 0
    for (let j = 0; j < PROBE; j++) for (let i = 0; i < PROBE; i++) { // a texture() at uv = (i + .5, j + .5) / PROBE
      const fx = ((i + 0.5) / PROBE) * w - 0.5, fy = ((j + 0.5) / PROBE) * h - 0.5, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0
      probe += (px(x0, y0) * (1 - tx) + px(x0 + 1, y0) * tx) * (1 - ty) + (px(x0, y0 + 1) * (1 - tx) + px(x0 + 1, y0 + 1) * tx) * ty
    }
    const full = img.reduce((s, l) => s + l, 0) / img.length
    expect(full, `${w}×${h} ring ${ring}`).toBeGreaterThan(0.1) // dense: ±.02 is a real bound
    expect(Math.abs(probe / PROBE ** 2 - full), `${w}×${h} ring ${ring}`).toBeLessThanOrEqual(0.02)
  }
})

test('E9 servo() on the fake: the probe draws first, into the mipmapped PROBE² target, with the e on screen; then its mipmaps, then UPDATE into the other half of the pair; the pair swaps; a filter runs nothing; no readback', () => {
  const n = E.targets.length, c = createChain(gl, W, HT), [probe, e0, e1] = E.targets.slice(n + 3), u = servoU()
  expect([probe.width, probe.height, probe.tex.min]).toEqual([PROBE, PROBE, gl.NEAREST_MIPMAP_NEAREST])
  expect([e0, e1].map((t) => [t.hdr, t.width, t.height])).toEqual([[true, 1, 1], [true, 1, 1]])
  let seen: unknown[] = []
  E.draws.length = 0
  const out = c.servo(u, (e) => void seen.push(e, E.bound))
  expect(seen).toEqual([e1.attachments[0], probe.framebuffer]) // a new pair's zeros: ln e 0, e 1
  expect(E.draws.map((d) => d.fs)).toEqual(['mipmap', UPDATE])
  expect(E.draws[0]).toEqual({ fb: e0.framebuffer, fs: 'mipmap', u: { tex: probe.attachments[0] } }) // the probe unbound
  expect(E.draws[1]).toMatchObject({ fb: e0.framebuffer, u: { ...u, uProbe: probe.attachments[0], uExp: e1.attachments[0] } })
  expect(out).toBe(e0.attachments[0])
  seen = []
  expect(c.servo(u, (e) => void seen.push(e))).toBe(e1.attachments[0]) // the next frame reads what this one wrote
  expect(seen).toEqual([e0.attachments[0]])
  E.draws.length = 0
  expect(c.servo(null, () => { throw new Error('a filter draws no probe') })).toBe(e1.attachments[0])
  expect(E.draws).toEqual([])
})
