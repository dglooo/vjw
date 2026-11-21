// The vs3 post chain's pure part (agents/planner/plan_vs3_engine_2026-11-21.md § CP1 contract; design_vs3_engine
// § Variant A, S1, S3 "wiring", S4): per frame, which passes run and their uniforms, every piece of state passed in, so
// Vitest covers it without a browser (like gl/post.ts). The GL half (createChain) is S3.1.
// vs3: the friends' three.js engine, used with permission (2026-11-19). Rewritten as text into TypeScript from
// donor/vs3/visual_kit/src/: engine/engine.js:150-198 (its header: "engine.js — three.js render engine, faithful to the
// original composer"; the macros, the mirror and feedback uniforms, :188 the tint), engine/post-shaders.js:162-198
// ("post-shaders.js — the original post pipeline, extracted verbatim (masked)"; stepTiles, stepSym and, at :155-160, their
// constants) and core/analyzer.js:464-473 ("analyzer.js — audio -> visual signal pipeline"; what react scales).
import { heatStep } from '../gl/post'
import type { Signal } from './host'

/** knob: the light limiter's (design Amendment 1, tuned on gate H2); read by frame() and clock() from S1.2 on. */
export const KNOBS = { LIGHT_X: 4, KNOB_S: 0.5, VIG_S: 1, DYN: 1, GLOW_SEED: 1, DT_MAX: 1 / 60, REACT_MAX: 2 }
export type Knobs = typeof KNOBS
/** heat and chaos (engine.js:150-151): .25× at 0, 1× at .5, 4× at 1. */
export const drastic = (p: number) => 4 ** ((p - 0.5) * 2)
/** A level times the react gain, at most 1 (analyzer.js:464-473; design F3: the reacted kick and energy clamp at 1). */
export const reacted = (level: number, gain: number) => Math.min(1, level * gain)

/** The look knobs, named as the donor's macros (0..1, .5 = stock) and post keys: the native's inputs (look.json). */
export type LookKey = 'react' | 'chaos' | 'trails' | 'heat' | 'mirror' | 'tiles' | 'twist' | 'slice' | 'spin'
  | 'persist' | 'zoom' | 'bloomMul' | 'lens' | 'lensStyle' | 'aber' | 'vignette' | 'brightness' | 'hueDrift'
export type LookValues = Record<LookKey, number>
/** What the scene object tells the chain (the donor scene contract). */
export interface SceneFacts {
  bloom?: { strength: number; gain: number; kick?: number }
  hint?: { mirror?: number; persist?: number; steady?: boolean } | null // signal only
  wet: number; grain: number; lateTrails: number; filter: boolean // wet: fxWet(), limitless only, else 1; lateTrails: LATE_TRAILS, else 0
  bloomRow: number; gainBase: number; vigRange: number // the row's bloomMul, base.brightness, the width of vignette's range
}
/** The limiter's last drawn values (S1.2). */
export interface Light { glow: number; stock: number; gain: number; vig: number; lens: number; persist: number; react: number }
/** Per-layer state as plain data, so frame() is pure. `reset`: snap this frame (frame() clears it); `stale`: the
 *  history holds no fed-back frame, so the next fed-back frame ignores it. */
export interface ChainState {
  angle: number; drift: number; seed: number; hue: number
  hot: number; hot0: number; style: number
  reset: boolean; stale: boolean; light: Light | null
  sym: { from: number; to: number | null; w: number; next: number | null }
  tiles: { y: number | null; v: number }
  rips: Float32Array; rip: number // melt: 6 plume slots × vec4
}
export function chainState(): ChainState {
  return { angle: 0, drift: 0, seed: 0, hue: 0, hot: 0, hot0: 0, style: 0, reset: true, stale: true, light: null, sym: { from: 0, to: null, w: 1, next: null }, tiles: { y: null, v: 0 }, rips: new Float32Array(24), rip: 0 }
}
type Uniforms = Record<string, number | readonly number[] | Float32Array>
/** One frame: which passes run (design S4's skips), and their uniforms. */
export interface ChainFrame {
  mirror: boolean; feedback: boolean; warp: Uniforms
  bloom: number // the limited strength; 0 = skip
  lens: Uniforms | null // null until S5.1
  finish: { uAber: number; uVig: number; uGain: number; uGrain: number }
  kick: number; react: number // `hot`; the limited react gain
}

const SYM_FADE = 0.5 // s: a fold change's crossfade
const TILE_W = 9.5 // the tile glide's spring
const TILE_VMAX = 2 // log-count per second: 1 to 6 in about a second
const smooth01 = (x: number) => (x >= 1 ? 1 : x <= 0 ? 0 : x * x * (3 - 2 * x))

/** stepTiles (post-shaders.js:162-184): the exact critically damped step on the log of the tile count, frame-rate
 *  independent, with the zoom rate capped so a long jump (1 to 6) travels at an even speed instead of lunging at the start. */
function stepTiles(g: ChainState['tiles'], target: number, dt: number) {
  if (!(target > 1)) target = 1 // off, NaN included
  const ty = Math.log(target)
  if (g.y === null) {
    g.y = ty
    g.v = 0
  }
  const x0 = g.y - ty
  if (Math.abs(x0) < 1e-4 && Math.abs(g.v) < 1e-3) {
    g.y = ty
    g.v = 0
    return target
  }
  const e = Math.exp(-TILE_W * dt), c = g.v + TILE_W * x0, y0 = g.y
  g.y = ty + (x0 + c * dt) * e
  g.v = (g.v - TILE_W * c * dt) * e
  if (Math.abs(g.v) > TILE_VMAX) {
    g.v = Math.sign(g.v) * TILE_VMAX
    g.y = y0 + Math.max(-TILE_VMAX * dt, Math.min(TILE_VMAX * dt, g.y - y0))
  }
  return Math.exp(g.y)
}

/** stepSym (post-shaders.js:185-198): a fold change fades from the fold on screen over SYM_FADE; back to that fold
 *  mid-fade reverses the fade; a third fold waits for its end. Returns the fold drawn. */
function stepSym(f: ChainState['sym'], target: number, dt: number) {
  if (!(target >= 0)) target = 0 // NaN draws no fold, as it always did
  if (f.to === null) {
    f.from = f.to = target
    f.w = 1
  }
  if (target === f.to) f.next = null
  else if (f.w >= 1) {
    f.from = f.to
    f.to = target
    f.w = 0
    f.next = null
  } else if (target === f.from) {
    f.from = f.to
    f.to = target
    f.w = 1 - f.w
    f.next = null
  } else f.next = target
  if (f.w < 1) {
    f.w = Math.min(1, f.w + dt / SYM_FADE)
    if (f.w >= 1 && f.next !== null) {
      f.from = f.to
      f.to = f.next
      f.next = null
      f.w = 0
    }
  }
  return f.to
}

/** One frame of the chain (engine.js:150-198). `s`: the raw Signal; `hit`: the gated ⚡ kick; `dt`: the layer's clock,
 *  for motion; `dtl`: real seconds, for the light. Light values pass unlimited until the limiter (S1.2). */
export function frame(v: LookValues, sc: SceneFacts, s: Readonly<Signal>, hit: number, st: ChainState, palMid: readonly number[], dt: number, dtl: number, t: number, aspect: number): ChainFrame {
  if (st.reset) st.sym.to = st.tiles.y = null // the fold fade and the tile glide snap: their first-call path
  const hint = sc.hint ?? {}, wet = sc.wet, chaos = drastic(v.chaos), react = v.react * 2
  const hot = (st.hot = heatStep(st.hot, hit, dtl)) // the kick as drawn, on real time (C6)
  const mids = reacted(s.mids, react), sub = reacted(s.sub, react) // the donor's engine reads the reacted signal
  // the mirror (engine.js:155-171)
  const to = stepSym(st.sym, hint.mirror ?? v.mirror, dt), from = st.sym.from, mix = smooth01(st.sym.w)
  st.angle += v.spin * dt * 0.12 * (0.5 + mids)
  const tiles = stepTiles(st.tiles, v.tiles, dt)
  const mirror = to >= 0.5 || (mix < 1 && from >= 0.5) || tiles > 1.0001 || Math.abs(v.twist) > 0.001 || v.slice > 0.001
  // the feedback (engine.js:173-188): trails 0 = no feedback, .5 = the scene's, 1 = the most
  const p = hint.persist ?? v.persist
  const persist = wet * Math.min(0.975, p > 0 ? p * Math.min(2, v.trails * 2) : sc.lateTrails * Math.max(0, v.trails * 2 - 1))
  const feedback = persist > 0, steady = !!hint.steady
  const warp: Uniforms = {
    uSegments: to, uSegFrom: from, uSegMix: mix, uAspect: aspect, uAngle: st.angle, uTiles: tiles, uTwist: v.twist, uSlice: v.slice, uWet: wet,
    uPersist: persist,
    uZoom: (1 + (v.zoom - 1 + (steady ? 0 : hot * (0.15 + v.heat * 0.8) * 0.3)) * (0.1 + 1.8 * v.trails)) ** dt,
    uRotate: v.spin * 0.05 * dt * (0.5 + mids) * chaos,
    uSwirl: v.spin * (0.3 + mids * 0.9) * chaos,
    uWobble: steady ? 0 : (0.35 + v.chaos * 1.8) * (0.4 + sub * 1.2),
    uTime: t,
    uTint: palMid.map((c) => Math.min(1, 0.88 + 0.12 * c)), // C10: ≤ 1 per channel, so the history always decays
    uHist: st.stale ? 0 : 1,
  }
  st.stale = !feedback
  st.reset = false
  const b = sc.bloom, k = b ? ((sc.filter ? 0 : b.strength) + s.energy * b.gain + hot * (b.kick ?? 0.35)) * v.bloomMul : 0 // host.ts:237
  return {
    mirror, feedback, warp, bloom: k > 0 ? 9 * k * k : 0, lens: null,
    finish: { uAber: v.aber * (0.22 + hot), uVig: v.vignette, uGain: v.brightness, uGrain: sc.grain },
    kick: hot, react,
  }
}

const LEVELS = ['sub', 'mids', 'highs', 'air', 'energy'] as const // analyzer.js:466-471, besides the kick
/** Writes the reacted signal for the scene: s.kick = cf.kick; the levels the donor scales, times cf.react, each at most 1.
 *  The impulses (onKick, onMid, onHigh) stay: their light passes the flash gate. */
export function reactTo(s: Signal, cf: ChainFrame): void {
  s.kick = cf.kick
  for (const k of LEVELS) s[k] = reacted(s[k], cf.react)
}
