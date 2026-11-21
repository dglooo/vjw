// The vs3 post chain's pure part (agents/planner/plan_vs3_engine_2026-11-21.md § CP1 contract; design_vs3_engine
// § Variant A, S1, S3 "wiring", S4): per frame, which passes run and their uniforms, every piece of state passed in, so
// Vitest covers it without a browser (like gl/post.ts). The GL half (S3.1, at the end): createChain's targets and passes.
// S3b.1: the exposure servo (design Amendment 2 with the skeptic's N2-N4): expose()'s law, frame()'s `servo`, UPDATE.
// vs3: the friends' three.js engine, used with permission (2026-11-19). Rewritten as text into TypeScript from
// donor/vs3/visual_kit/src/: engine/engine.js:150-198 (its header: "engine.js — three.js render engine, faithful to the
// original composer"; the macros, the mirror and feedback uniforms, :188 the tint), engine/post-shaders.js:162-198
// ("post-shaders.js — the original post pipeline, extracted verbatim (masked)"; stepTiles, stepSym and, at :155-160, their
// constants) and core/analyzer.js:464-473 ("analyzer.js — audio -> visual signal pipeline"; what react scales).
import { bindFramebufferInfo, type ProgramInfo } from 'twgl.js'
import { VS } from '../fx/glsl'
import type { createBloom } from '../gl/bloom'
import { draw, program, programAsync, renderTarget } from '../gl/engine'
import { heatStep } from '../gl/post'
import type { Signal } from './host'

/** knob: the light limiter's (design Amendment 1, tuned on gate H2). LIGHT_X: uGain and the glow follow by at most ×/÷ 4
 *  per s; KNOB_S, VIG_S: s for react, lens and the persist fall, and for vignette, to cross their range; DYN: the share of
 *  the stock glow's own move a setting may add; GLOW_SEED: the level a zeroed glow grows back from; DT_MAX: the cap of
 *  dtl; REACT_MAX: the react gain's ceiling. */
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
  faithful?: boolean // the scene's faithful() (morphogen 2.0's fixed maps author their final colours): no servo, e 1 (N3)
}
/** The limiter's last drawn values. */
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
  servo: Servo | null // the exposure servo's UPDATE uniforms; null: a filter, which has none
}
/** UPDATE's uniforms, on ln e: uK = dtl / τ, uX = ln(LIGHT_X ** dtl), the most e moves by in a frame, uLo = ln of e's
 *  floor. A reset (N2): uK 1 and uX 1 (above the range's ln(1 / .6)), so the whole step lands at once. A faithful()
 *  scene: uLo 0, so e reads 1 (N3). */
export interface Servo { uTarget: number; uK: number; uX: number; uLo: number }

const SYM_FADE = 0.5 // s: a fold change's crossfade
const TILE_W = 9.5 // the tile glide's spring
const TILE_VMAX = 2 // log-count per second: 1 to 6 in about a second
const smooth01 = (x: number) => (x >= 1 ? 1 : x <= 0 ? 0 : x * x * (3 - 2 * x))
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
/** `cur` moved toward `to` by at most `step`; no `cur` (the light state is null): `to`. */
const toward = (cur: number | undefined, to: number, step: number) => (cur === undefined ? to : cur + clamp(to - cur, -step, step))

/** knob: the exposure servo (design Amendment 2, rev N3 / N4; original renderer/main.js:2361-2375, 2576-2588): τ in s,
 *  e's floor (its top is 1: no lift, N3), the frame-mean luma it holds at base brightness. */
export const SERVO = { TAU: 2.5, LO: 0.6, TARGET: 0.19 }
/** UPDATE's law in JS, line for line: ln e moves by uK × ln(target / mean), at most uX, inside [uLo, 0]; a non-finite
 *  result keeps the old e (N4). `e` and the result are the gain itself (the pair stores its log). */
export function expose(e: number, mean: number, u: Readonly<Servo>): number {
  const l = Math.log(e), n = clamp(clamp(l + u.uK * Math.log(u.uTarget / Math.max(mean, 0.01)), l - u.uX, l + u.uX), u.uLo, 0)
  return Number.isFinite(n) ? Math.exp(n) : e
}

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
 *  for motion; `dtl`: real seconds (clock()), for the light. Every scalar that sets the frame's light passes the light
 *  limiter (plan § The light limiter, final text: design Amendment 1 with the skeptic's N1, N2, N4, N5, N6), and the
 *  skips read the limited values, so a pass finishes its ramp before it skips. `K`: the limiter's knobs. */
export function frame(v: LookValues, sc: SceneFacts, s: Readonly<Signal>, hit: number, st: ChainState, palMid: readonly number[], dt: number, dtl: number, t: number, aspect: number, K: Knobs = KNOBS): ChainFrame {
  const snap = st.reset // N2: the servo snaps on the reset flag only, never on `stale` (persist back from 0)
  if (st.reset) {
    st.sym.to = st.tiles.y = null // the fold fade and the tile glide snap: their first-call path
    st.light = null // N2: every limited value takes its target on this frame
    st.stale = true // and the history holds no fed-back frame
  }
  const L = st.light, x = K.LIGHT_X ** dtl, a = dtl / K.KNOB_S // ×1.0234 and 1/30 of a range at 60 fps
  const en = s.energy >= 0 ? Math.min(1, s.energy) : 0, h = hit >= 0 ? Math.min(1, hit) : 0 // N6: clamped at 1; N4: NaN reads 0
  const react = toward(L?.react, Math.min(v.react * 2, K.REACT_MAX), a * 2) // N1: REACT_MAX caps the target
  const hot = heatStep(st.hot, reacted(h, react), dtl) // N1: react before the slew (the donor's order), on real time (C6)
  const hot0 = heatStep(st.hot0, h, dtl) // the stock scene's kick (react gain 1)
  const hint = sc.hint ?? {}, wet = sc.wet, chaos = drastic(v.chaos)
  const mids = reacted(s.mids, react), sub = reacted(s.sub, react) // the donor's engine reads the reacted signal
  // the mirror (engine.js:155-171)
  const to = stepSym(st.sym, hint.mirror ?? v.mirror, dt), from = st.sym.from, mix = smooth01(st.sym.w)
  st.angle += v.spin * dt * 0.12 * (0.5 + mids)
  const tiles = stepTiles(st.tiles, v.tiles, dt)
  const mirror = to >= 0.5 || (mix < 1 && from >= 0.5) || tiles > 1.0001 || Math.abs(v.twist) > 0.001 || v.slice > 0.001
  // the feedback (engine.js:173-188): trails 0 = no feedback, .5 = the scene's, 1 = the most
  const p = hint.persist ?? v.persist
  const pT = wet * Math.min(0.975, p > 0 ? p * Math.min(2, v.trails * 2) : sc.lateTrails * Math.max(0, v.trails * 2 - 1))
  const persist = !L || pT >= L.persist ? pT : Math.max(pT, L.persist - a) // rises freely, falls slewed
  const feedback = persist > 0, steady = !!hint.steady
  // the light (plan § The light limiter): uGain, vignette, the lens amount, then the glow against the stock scene's
  const gain = L ? clamp(v.brightness, L.gain / x, L.gain * x) : v.brightness
  const vig = toward(L?.vig, v.vignette, (dtl / K.VIG_S) * sc.vigRange) // N5: 1 s across the range
  if (!L) st.style = v.lensStyle
  const lens = toward(L?.lens, v.lensStyle === st.style ? v.lens * wet : 0, a) // S5.1 draws it
  if (lens <= 0.01) st.style = v.lensStyle // F4: a style change ducks the amount to 0, swaps, returns
  const b = sc.bloom, G = sc.filter ? 1 : gain, G0 = sc.filter ? 1 : sc.gainBase // a filter's finish skips the grade
  let target = 0, stock = 0
  if (b) {
    const rest = sc.filter ? 0 : b.strength, kick = b.kick ?? 0.35 // host.ts:237; a filter: no resting glow
    const k = (rest + reacted(en, react) * b.gain + hot * kick) * v.bloomMul * drastic(v.heat)
    const k0 = (rest + en * b.gain + hot0 * kick) * sc.bloomRow // the stock scene: heat .5, react .5, the row's look
    target = G * 9 * k * k // the donor's glow, 9 k² (host.ts:238-240), times the gain ahead of the tone map
    stock = G0 * 9 * k0 * k0
  }
  let glow = target
  if (L) {
    const r = L.stock > 0 ? Math.min(1, L.glow / L.stock) : 1, dyn = K.DYN * (stock - L.stock) * r // the stock's own move
    const foll = (x - 1) * Math.max(L.glow, K.GLOW_SEED)
    glow = clamp(target, L.glow + Math.min(dyn, 0) - foll, L.glow + Math.max(dyn, 0) + foll)
  }
  if (!(glow >= 0)) glow = target >= 0 ? target : 0 // N4: a NaN never latches (flashGate's guard, gl/post.ts:51)
  const strength = glow / G
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
  st.light = { glow, stock, gain, vig, lens, persist, react }
  st.hot = hot
  st.hot0 = hot0
  return {
    mirror, feedback, warp, bloom: strength >= 1e-3 ? strength : 0, lens: null, // under 1e-3 the bloom pass skips
    finish: { uAber: v.aber * (0.22 + hot), uVig: vig, uGain: gain, uGrain: sc.grain }, // uAber: host.ts:243
    kick: hot, react,
    // the servo's target scales with the drawn brightness, as the original's with its slider (main.js:2576)
    servo: sc.filter ? null : { uTarget: (SERVO.TARGET * gain) / sc.gainBase, uK: snap ? 1 : dtl / SERVO.TAU, uX: snap ? 1 : Math.log(x), uLo: sc.faithful ? 0 : Math.log(SERVO.LO) },
  }
}

/** The host's prelude. `now`, `seen`: ms (performance.now(): this draw, the native's last). dtl: real seconds, at most
 *  DT_MAX. reset: this native was not drawn on the previous engine frame (N2: a frame counter, not wall time, so a
 *  late draw on stage keeps its light and history); a new native passes `drawnFrame` -Infinity.
 *  ponytail: a library tile drawn every k-th stage frame resets on each draw, so its light takes its targets; fine for a
 *  thumbnail. */
export function clock(now: number, seen: number, engineFrame: number, drawnFrame: number): { dtl: number; reset: boolean } {
  return { dtl: Math.min(Math.max(0, now - seen) / 1000, KNOBS.DT_MAX), reset: engineFrame - drawnFrame > 1 }
}

const LEVELS = ['sub', 'mids', 'highs', 'air', 'energy'] as const // analyzer.js:466-471, besides the kick
/** Writes the reacted signal for the scene: s.kick = cf.kick; the levels the donor scales, times cf.react, each at most 1.
 *  The impulses (onKick, onMid, onHigh) stay: their light passes the flash gate. */
export function reactTo(s: Signal, cf: ChainFrame): void {
  s.kick = cf.kick
  for (const k of LEVELS) s[k] = reacted(s[k], cf.react)
}

// vs3: the friends' three.js engine, used with permission (2026-11-19). Ported as text into GLSL ES 3.00 from
// donor/vs3/visual_kit/src/lib/fx.js (its header: "Core image-feedback machinery — the MilkDrop lineage. FeedbackPass:
// blends the current frame over a warped copy of frame history (zoom / rotate / swirl / wobble), which is what produces
// silk, smear, tunnels, and recursive detail. MirrorShader: bilateral / quad / n-fold kaleidoscopic symmetry — the
// "totem" look."): MirrorShader's fragment shader (:25-130) and FeedbackPass's (:151-176) as one pass, :172-174 verbatim.
/** The warp (design S3): the mirror's uv transform (slice → tiles → twist → fold) samples the scene, then the warped,
 *  faded history goes under it: max(cur, history × persist × tint × edge), the donor feedback reading the mirror's
 *  output at the same pixel. Its output is the new history. uHist 0 ignores the history (N2: the first fed-back frame). */
export const WARP = `#version 300 es
precision highp float;
uniform sampler2D uSrc, uPrev; // the scene; the history (hist[1 - k])
uniform vec2 uRes;
uniform float uSegments, uSegFrom, uSegMix, uAspect, uAngle, uTiles, uTwist, uSlice, uWet;
uniform float uPersist, uZoom, uRotate, uSwirl, uWobble, uTime, uHist;
uniform vec3 uTint;
out vec4 outColor;
float hash1(float n) { return fract(sin(n * 127.1) * 43758.5453); }
// identity on [0, 1]; the +0.5 phase is load-bearing (without it every frame turns 180°)
vec2 mirrorWrap(vec2 uv) { return abs(fract(uv * 0.5 + 0.5) * 2.0 - 1.0); }
// the symmetry fold for one segment count, sampled: 0 off, 1 mirror-x, 2 quad, >= 3 kaleido. The mirror line slides in
// from the frame edge as wet rises; the kaleido opens from the centre as an iris of radius sqrt(wet) of the corner.
vec4 folded(vec2 uv, float segs, float wet) {
  float fold = 1.0 - 0.5 * wet;
  float iris = 0.0;
  vec2 plain = uv;
  if (segs >= 0.5 && segs < 1.5) {
    uv.x = uv.x < fold ? uv.x : 2.0 * fold - uv.x;
  } else if (segs >= 1.5 && segs < 2.5) {
    uv.x = uv.x < fold ? uv.x : 2.0 * fold - uv.x;
    uv.y = uv.y < fold ? uv.y : 2.0 * fold - uv.y;
  } else if (segs >= 2.5) {
    vec2 p = (uv - 0.5) * vec2(uAspect, 1.0);
    float r = length(p);
    float a = atan(p.y, p.x) + uAngle;
    float seg = 6.2831853 / segs;
    a = mod(a, seg);
    a = abs(a - seg * 0.5);
    p = vec2(cos(a), sin(a)) * r;
    uv = p / vec2(uAspect, 1.0) + 0.5;
    if (wet < 1.0) {
      float R = sqrt(wet) * length(vec2(0.5 * uAspect, 0.5));
      iris = wet > 0.0 ? smoothstep(R - 0.0025, R + 0.0025, r) : 1.0;
    }
  }
  vec4 col = texture(uSrc, mirrorWrap(uv));
  if (iris > 0.0) col = mix(col, texture(uSrc, mirrorWrap(plain)), iris);
  return col;
}
void main() {
  vec2 vUv = gl_FragCoord.xy / uRes, uv = vUv;
  float wet = clamp(uWet, 0.0, 1.0); // limitless's dry / wet; every other scene leaves it at 1
  if (uSlice > 0.001) { // alternating shear slabs, deterministic per band
    float band = floor(uv.y * 12.0);
    float dir = mod(band, 2.0) * 2.0 - 1.0;
    uv.x += uSlice * wet * dir * (0.15 + 0.25 * hash1(band));
  }
  if (uTiles > 1.0001) { // mirror-repeat wallpaper; dry, one cell is the frame and the count grows around the centre
    vec2 t = uv * uTiles;
    if (wet < 1.0) {
      float n0 = floor(uTiles);
      float d0 = mod(n0 * 0.5 + 0.5, 2.0) - 1.0;
      float d1 = mod(n0 * 0.5 + 1.0, 2.0) - 1.0;
      float d = mix(d0, d1, uTiles - n0);
      t = (uv - 0.5) * pow(uTiles, wet) + 0.5 + d * wet;
    }
    vec2 cell = floor(t);
    vec2 f = t - cell;
    if (mod(cell.x, 2.0) > 0.5) f.x = 1.0 - f.x;
    if (mod(cell.y, 2.0) > 0.5) f.y = 1.0 - f.y;
    uv = f;
  }
  if (abs(uTwist) > 0.001) { // vortex: rotation strongest at the centre
    vec2 p = (uv - 0.5) * vec2(uAspect, 1.0);
    float r = length(p);
    float a = atan(p.y, p.x) + uTwist * wet * exp(-r * 1.6);
    p = vec2(cos(a), sin(a)) * r;
    uv = p / vec2(uAspect, 1.0) + 0.5;
  }
  vec4 m = folded(uv, uSegments, wet);
  if (uSegMix < 1.0) m = mix(folded(uv, uSegFrom, wet), m, uSegMix);
  vec3 col = m.rgb;
  if (uHist > 0.5) { // the feedback: the history zoomed, rotated, swirled, wobbled, faded at the frame edge
    vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
    float r = length(p);
    float ang = uRotate + uSwirl * (0.55 - r) * 0.12;
    float c = cos(ang), s = sin(ang);
    p = mat2(c, -s, s, c) * p / uZoom;
    p += uWobble * 0.004 * vec2(
      sin(uTime * 0.7 + p.y * 9.0),
      cos(uTime * 0.9 + p.x * 8.0));
    vec2 huv = p / vec2(uAspect, 1.0) + 0.5;
    vec3 hist = texture(uPrev, clamp(huv, 0.0, 1.0)).rgb;
    float edge = smoothstep(0.0, 0.03, huv.x) * smoothstep(1.0, 0.97, huv.x)
               * smoothstep(0.0, 0.03, huv.y) * smoothstep(1.0, 0.97, huv.y);
    hist *= uPersist * uTint * edge;
    col = max(col, hist);
  }
  // One NaN or Inf pixel from any scene would live forever in the
  // history and bloom would grow it into black squares: drop it.
  if (any(isnan(col)) || any(isinf(col))) col = vec3(0.0);
  outColor = vec4(col, 1.0);
}`

/** The servo's probe, px square: 4 096 bilinear samples of the finished frame (S3b.2 draws them, FINISH's uProbe); its
 *  mipmaps' top level holds their mean. */
export const PROBE = 64
/** The exposure servo's update (design Amendment 2, with N3, N4): one fragment moves e by frame()'s Servo, reading the
 *  probe's mean on the GPU (no readback). The 1 × 1 pair stores ln e, so a new texture's zeros are e 1. */
export const UPDATE = `#version 300 es
precision highp float;
uniform sampler2D uProbe, uExp; // the probe (its luma in r), mipmapped; the old ln e
uniform float uTarget, uK, uX, uLo;
out vec4 outColor;
void main() {
  float l = texelFetch(uExp, ivec2(0), 0).r, m = texelFetch(uProbe, ivec2(0), ${Math.log2(PROBE)}).r; // m: the frame-mean luma
  float n = clamp(clamp(l + uK * log(uTarget / max(m, 0.01)), l - uX, l + uX), uLo, 0.0);
  if (isnan(m) || isnan(n) || isinf(n)) n = l; // N4: a NaN mean keeps the old e (max(NaN, .01) is NaN by the spec, .01 on ANGLE Metal)
  outColor = vec4(n, 0.0, 0.0, 1.0);
}`

/** The chain's GL half (design C11, C12): three owned half-float targets, allocated here at the layer's size, so no
 *  visible frame allocates (a size change re-fits them on that frame, as three's target and the bloom's), and the
 *  servo's three at fixed sizes. The warp writes hist[k] from the scene and hist[1 − k], the bloom its own targets, so no
 *  pass samples its draw target. It binds only its own targets; the caller keeps the GL state (the host's guard).
 *  ponytail: without EXT_color_buffer_float the targets are RGBA8, which store ln e ≤ 0 as 0: the servo holds e at 1. */
export function createChain(gl: WebGL2RenderingContext, w: number, h: number) {
  const hist = [renderTarget(true, true), renderTarget(true, true)] // persistent: the trails survive a governor step
  const lensRT = renderTarget(true) // S5.1's lens writes it
  const all = [...hist, lensRT]
  for (const t of all) t.fit(w, h)
  // the servo's, at fixed sizes: the probe, mipmapped (its top level: the mean), and the 1 × 1 pair of ln e (born 1 × 1)
  const probe = renderTarget(true, false, { min: gl.NEAREST_MIPMAP_NEAREST }), exp = [renderTarget(true), renderTarget(true)]
  probe.fit(PROBE, PROBE)
  let k = 0 // the warp writes hist[k] and reads hist[1 − k]; then the two swap
  let j = 0 // UPDATE writes exp[j] and reads exp[1 − j], the e on screen; then the two swap
  let warp: ProgramInfo | undefined, update: ProgramInfo | undefined
  return {
    /** The chain over `src` (the scene, w × h); returns the texture the finish reads. */
    apply(src: WebGLTexture, w: number, h: number, f: ChainFrame, bloom: ReturnType<typeof createBloom>): WebGLTexture {
      for (const t of all) t.fit(w, h) // a no-op at the same size
      let tex = src
      if (f.mirror || f.feedback) {
        bindFramebufferInfo(gl, hist[k])
        // both samplers on every draw: a sampler left unset keeps its unit's last texture, maybe this draw target
        draw((warp ??= program(VS, WARP)), { ...f.warp, uSrc: src, uPrev: hist[1 - k].attachments[0], uRes: [w, h] })
        tex = hist[k].attachments[0]
        k = 1 - k
      }
      if (f.bloom > 0) tex = bloom.apply(tex, w, h, f.bloom) // into its own targets
      return tex // the lens (S5.1): tex into lensRT
    },
    /** The exposure servo, after apply() and before the finish (S3b.2): `drawProbe` draws the finished frame into the bound
     *  probe (FINISH with uProbe on and uExp = `e`, the ln e on screen now); its mipmaps make the mean; UPDATE writes the
     *  next ln e. Returns it: the finish's uExp. A filter (`u` null) runs nothing and keeps e at 1. */
    servo(u: Readonly<Servo> | null, drawProbe: (e: WebGLTexture) => void): WebGLTexture {
      const e = exp[1 - j].attachments[0]
      if (!u) return e
      bindFramebufferInfo(gl, probe) // with its viewport
      drawProbe(e)
      bindFramebufferInfo(gl, exp[j]) // first, so no bound framebuffer holds the texture the mipmaps are made of
      gl.bindTexture(gl.TEXTURE_2D, probe.attachments[0])
      gl.generateMipmap(gl.TEXTURE_2D)
      draw((update ??= program(VS, UPDATE)), { ...u, uProbe: probe.attachments[0], uExp: e })
      j = 1 - j
      return exp[1 - j].attachments[0]
    },
    /** Deletes the targets; the programs stay in the engine's cache. */
    dispose() {
      for (const t of [...all, probe, ...exp]) {
        gl.deleteFramebuffer(t.framebuffer)
        gl.deleteTexture(t.attachments[0])
      }
    },
  }
}

/** The warp and the servo's update compiled off the main thread into the engine's cache, under apply()'s and servo()'s
 *  keys (fx/glsl.ts's VS is the engine's, glsl.test.ts): no compile on a visible frame (C12, host rule 5). */
export const warmChain = () => Promise.all([programAsync(VS, WARP), programAsync(VS, UPDATE)])
