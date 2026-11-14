// The animals' shape sampler (plan_scenes_wave3.md S0.1, picks P1/P2): an animal's hand-authored paths (animals.ts)
// are rasterised once on a 2D canvas into a density map — the fill at grey 96, the outline and the detail strokes at
// 255, so a contour draws ~2.7× the points of the body — and sampled by walking the density CDF. The sampling is
// stratified in raster order: index i is the i/n mass quantile of every shape, so point i sits at a similar height
// in each animal and the morph can stay index-stable (P2).
// Look: TD SN/POP sprinklePOP ex1 (points sprinkled over a shape by density; studied, rewritten). No third-party code.
import { ANIMALS } from './animals'

const S = 256 // knob: the raster's side, px (the 100-unit box → S)
const K = S / 100 // px per box unit
const FILL = 96 // knob: the fill's density (a stroke is 255)
const STROKE = 2 // knob: the stroke width, box units
const PILLOW = 36 // knob: the relief's blur, px: the shoulder from the silhouette's rim (flat) up to the full thickness. Under ≈ 30 it is steep enough to fold over itself at a 30° yaw (S0.3)
const LIFT = 0.5 // knob: how far up the relief its lines ride (1 = its front face): a higher drawing slides off the face at a yaw
const CORE = 0.7 // knob: the share of a line's points that draw it; the rest scatter through the thickness as its haze
const HAZE = 0.25 // knob: the least half-thickness of the dust and the haze, × the depth: the rim and the thin parts keep a volume
const FIT = 0.8 // the box maps onto ±FIT scene units
const U32 = 4294967296

/** points.ts's lowbias32 (`mixu` in its HASH), on the CPU. */
const mixu = (x: number) => {
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d)
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b)
  return (x ^ (x >>> 16)) >>> 0
}

/** n points on a w×h density map, ∝ density (the unit-tested seam): n×2 xy in [0, 1). Stratified: sample i takes
 *  the (i + rand)/n quantile of the raster-order CDF, then jitters inside its texel (0.1 % off the texel's sides, so
 *  floor(x·w) finds the texel again through the float32). Same seed → same points. An all-zero map has no quantiles:
 *  every point lands on the last texel. */
export function sampleMask(density: Uint8Array | Uint8ClampedArray, w: number, h: number, n: number, seed = 1): Float32Array {
  const out = new Float32Array(n * 2)
  const last = w * h - 1
  let total = 0
  for (let k = 0; k <= last; k++) total += density[k]
  let s = mixu(seed)
  const rand = () => mixu(s++) / U32
  let k = 0
  let acc = density[0] // the CDF through texel k
  for (let i = 0; i < n; i++) {
    const u = ((i + rand()) / n) * total
    while (acc <= u && k < last) acc += density[++k] // u only grows: one pass over the map for all n
    out[2 * i] = ((k % w) + 0.001 + 0.998 * rand()) / w
    out[2 * i + 1] = (Math.floor(k / w) + 0.001 + 0.998 * rand()) / h
  }
  return out
}

const cache = new Map<string, Float32Array>()

/** n points of the animal `id` (browser only: a 2D canvas): n×4 [x, y, z, edge]. xy in scene units (the box fits
 *  ±0.8, y up); z in units of a native's depth, a relief: 0 on the silhouette's rim, up to ±1 deep inside (thin on
 *  the feathers and tufts). The fill's dust takes a per-index depth through it (a point keeps its side through a
 *  morph); a stroke's points ride LIFT up its front, so the drawing stays a drawing at a yaw, bar the 1 − CORE that
 *  join the dust as the line's haze. edge = 1 on a stroke. Cached by id:n. */
export function shapePoints(id: string, n: number): Float32Array {
  const key = `${id}:${n}`
  const hit = cache.get(key)
  if (hit) return hit
  const a = ANIMALS[id]
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = S
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const path = (d: string) => {
    const box = new Path2D(d)
    const p = new Path2D()
    p.addPath(box, { a: K, d: K })
    if (a.mirror) p.addPath(box, { a: -K, d: K, e: S }) // the authored left half, reflected about x = 50
    return p
  }
  const body = path(a.d)
  /** Opaque black, then `d` filled even-odd at `grey` through `filter`. The black stays unfiltered: a blurred
   *  backdrop is see-through at the canvas border, and the read-back would un-premultiply the fill up there. */
  const fill = (grey: number, filter: string) => {
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, S, S)
    ctx.filter = filter
    ctx.fillStyle = `rgb(${grey} ${grey} ${grey})`
    ctx.fill(body, 'evenodd')
    ctx.filter = 'none'
  }
  const red = () => ctx.getImageData(0, 0, S, S).data.filter((_, i) => i % 4 === 0)

  fill(255, `blur(${PILLOW}px)`)
  const pillow = red()
  fill(FILL, 'none')
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = STROKE * K
  ctx.lineJoin = ctx.lineCap = 'round'
  ctx.stroke(path(a.d + (a.lines ?? '')))
  const density = red()

  const xy = sampleMask(density, S, S, n)
  const out = new Float32Array(n * 4)
  for (let i = 0; i < n; i++) {
    const x = xy[2 * i]
    const y = xy[2 * i + 1]
    const k = Math.floor(y * S) * S + Math.floor(x * S)
    out[4 * i] = (2 * x - 1) * FIT
    out[4 * i + 1] = (1 - 2 * y) * FIT
    const edge = density[k] === 255
    const relief = Math.max(0, (2 * pillow[k]) / 255 - 1) // a blurred fill reads 0.5 on the rim: 0 there, 1 deep inside
    const core = edge && mixu(i + 0x9e3779b9) < CORE * U32
    out[4 * i + 2] = core ? LIFT * relief : ((2 * mixu(i)) / U32 - 1) * Math.max(relief, HAZE)
    out[4 * i + 3] = edge ? 1 : 0
  }
  cache.set(key, out)
  return out
}

/** The morph clock of a set of animals: `mix` runs 0 → 1 over `dur` s, the share of the points that already aim at
 *  `to` (the rest still at `from`: the staggered switch); `slot` is the bar the hold counts from, NaN = unset. */
export interface Morph { from: number; to: number; mix: number; slot: number; dur: number }
const SLAM = 0.12 // knob: s, the drop's switch: every point retargets within it (the spring is the flight)
const PHASE = 1.5 // knob: s, the calm morph's sweep through the points

/** One frame of the morph clock (pure, the unit-tested seam). `next` (a rising edge: the drop) slams to the set's
 *  next animal over SLAM; `hold` bars after the last switch it morphs there calmly over PHASE, so the drop's animal
 *  always gets its full hold. hold 0 = off: the count is forgotten, and an unset count (or a grid that restarted)
 *  starts at this bar — a scene cut to mid-track opens assembled, and the bars that pass while the clock is off
 *  (creatures: the build's loose cloud) are not made up for. */
export function morphStep(m: Morph, len: number, next: boolean, bar: number, hold: number, dt: number): Morph {
  const since = hold > 0 ? (bar >= m.slot ? m.slot : bar) : NaN
  if (next || bar - since >= hold) return { from: m.to, to: (m.to + 1) % len, mix: 0, slot: hold > 0 ? bar : NaN, dur: next ? SLAM : PHASE }
  return { ...m, slot: since, mix: Math.min(1, m.mix + dt / m.dur) }
}

/** The eased per-point progress of the CPU morph (S1.4, plexus): the twin of creatures' VS switch `i/N < uMix ? B : A`
 *  (there the spring is the easing; here the lerp is). The point at phase t ∈ [0,1) starts when `mix` passes t and
 *  settles exactly at mix 1, so a settled morph is fully `to`. PURE: 0 at mix 0, 1 at mix 1, monotone in mix, a
 *  later t starts later. */
export const stagger = (mix: number, t: number): number => {
  const x = Math.min(1, Math.max(0, (mix - t) / (1 - t)))
  return x * x * (3 - 2 * x)
}
