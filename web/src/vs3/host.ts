// The vs3 host (agents/guides/guide_vs3_port.md; research_donor_vs3_scenes.md §1, §3b, §4, §5): one native per copied
// scene of donor/vs3 (the friends' three.js engine, used with permission, 2026-11-19). A scene is the donor contract
// { scene, camera, params, update(s, dt, t), resize(w, h) }, copied near-verbatim into vs3/kit/scenes/ with its
// default export turned into a factory, so every layer owns its scene object.
// Lazy like native/model: three (the shared renderer, three/host.ts three()), the donor libs and the scene module load
// on the first create(); hidden() until the scene's programs compiled. Per frame, in three/host.ts's guard: PAL ← the
// scene's palette, s ← our sources (signal()), update + render into the layer's HalfFloat RT, with setRenderTarget(null)
// and getDrawingBufferSize() meaning that RT (screen()). Then on our passes, vs3/chain.ts's chain: the warp (the donor
// mirror and feedback, the scene's fxHint / fxWet), the scene's own `bloom` field through our gl/bloom.ts (the natives'
// internal bloom; strength as the donor engine.js:193, × the look's bloomMul), the lens (the look's lens and
// lensStyle: the donor LensShader's 7 styles), then the donor finish (FinishShader:
// aberration, the look's brightness × the exposure servo's e and its soft tone map, vignette, grain) into the bound FB; the
// palette's 5 slots turned by the look's hueDrift (frame()'s st.hue) on the CPU, no pass; the servo
// (chain.ts servo()) reads the same finish drawn into its 64² probe first. The look inputs (vs3/look.json:
// the macros, the warp's knobs, the light) reach all of it through frame()'s light limiter; the built-ins carry no fx.
// Colour: a donor ShaderMaterial writes display values (no colorspace chunk; PAL holds three's linear-converted hex, as
// in the donor), so the finish is the only grade: no ACES, no sRGB (unlike native/model). Light on a hit only through
// ⚡ `hit` (flashGate ≤ 3/s, I-FL1): it is the donor `kick` (drawn with the natives' rise slew, gl/post.ts heatStep:
// synapse's kick swell made 19 one-frame luma steps > .10 in 15 s without it, 0 with it), its rise the donor `onKick`,
// the bloom's kick term, the feedback's kick zoom and the finish's kick aberration. A scene that reads onMid / onHigh
// gets a second ⚡ `mid` (look.mid): its rise is both. Analyser 'vs3': the levels and specHi come from the vs3 core
// (audio/vs3.ts vs3Live), and gl/engine.ts's hear() binds ⚡ hit / mid to its kick and onMid, so its light passes the
// same gate. The scene's panel rows (its `params`, `modes`) are the native's
// inputs after the ⚡ ones, declared from vs3/params.json (host.test.ts writes it from the copied scenes) and written
// back into the scene's params each frame (put()).
import { vs3Live, type Vs3Out } from '../audio/vs3'
import type { Sources } from '../bind'
import type { Input, Value } from '../fx/types'
import { createBloom } from '../gl/bloom'
import { copy, engineFrame, fullscreenProgram, shotSize, stage, gl as stageGl } from '../gl/engine'
import { glState, PASS_LIST, restore } from '../gl/glstate'
import type { NativeDef } from '../gl/scene'
import { ease, MORPH_S } from '../presets'
import { MODEL_SPIKE } from '../scenes/model'
import { rose } from '../scenes/shatter'
import { chainState, clock, createChain, frame, hotLook, PROBE, reactTo, warmChain, type LookKey, type LookValues, type SceneFacts } from './chain'
import LOOK from './look.json'
import PARAMS from './params.json'

/** The donor `s` fields the ported scenes read (research §1). Add a field when a ported scene reads it (guide § Signal). */
export interface Signal { onKick: number; kick: number; onMid: number; onHigh: number; sub: number; mids: number; highs: number; air: number; energy: number; specHi: Float32Array; bands?: Float32Array }
/** Our sources → the donor `s` (research §4): the levels from the donor-mode core's bands (the closest edges; it runs in
 *  every mode), the kick from `hit` (the ⚡ input, bound to our kick), onKick on its rise × our kickAccent (the kick's
 *  velocity: .7 at the kicks' mean, 1 for a loud one; `hit` when there is none). onMid and onHigh: both on the rise of
 *  `mid` (the second ⚡ input, bound to our snare). One gated input for the two: they add light (synapse's nodes, anemone's
 *  sparkle), and hats at their own rate would spend the whole 3/s flash budget, the kick's share too. `v` (analyser 'vs3'):
 *  the levels and bands are the vs3 core's own, and onKick is the gated hit's rise at its value (`hit` and `mid` then
 *  follow the core's kick and onMid: gl/engine.ts hear()). */
export function signal(src: Readonly<Sources>, hit: number, prev: number, out: Signal, mid = 0, prevMid = 0, v: Vs3Out | null = null): Signal {
  out.kick = hit
  out.onKick = rose(prev, hit) ? (v ? hit : src.kickAccent || hit) : 0
  out.onMid = out.onHigh = rose(prevMid, mid) ? mid : 0
  if (v) {
    out.sub = v.sub
    out.mids = v.mids
    out.highs = v.highs
    out.air = v.air
    out.energy = v.energy
    out.bands = v.bands
    return out
  }
  out.sub = src.syn_BassLevel ?? 0 // 30-150 Hz (donor: the 60 Hz octave)
  out.mids = src.syn_MidLevel ?? 0 // 250-2000 Hz (donor: 240-960)
  out.highs = src.syn_MidHighLevel ?? 0 // 2-6 kHz (donor: 1.9-3.8 k)
  out.air = src.syn_HighLevel ?? 0 // 6-16 kHz (donor: the 7.7 kHz octave)
  out.energy = src.syn_Level ?? 0 // 30-16 kHz (donor: band energy × loudness)
  out.bands = undefined // ours has no octave bands (a switch back from vs3 drops its)
  return out
}

/** The donor `specHi` (192 log display bins, 35 Hz-18 kHz, AGC; sand, signal) from the closest the host has: our 32 log
 *  bands (30 Hz-16 kHz, 0-1), linear in the index. ponytail: no AGC, no display floor; the donor analyser's own bins
 *  if a scene's peaks read wrong. */
export function specHi(src: Readonly<Sources>, out: Float32Array): Float32Array {
  for (let i = 0; i < out.length; i++) {
    const x = (i * 31) / (out.length - 1), j = Math.min(30, Math.floor(x)), a = src[`band${j}`] ?? 0
    out[i] = a + ((src[`band${j + 1}`] ?? 0) - a) * (x - j)
  }
  return out
}

interface Screen { setRenderTarget(t: unknown, ...a: unknown[]): void; getDrawingBufferSize(v: { set(x: number, y: number): unknown }): unknown }
/** While `fn` runs, the scene's screen is `rt` (research §3b): setRenderTarget(null) binds rt (7 donor scenes call it
 *  after their sims), getDrawingBufferSize() reads rt's size (11 files size by it). `made` collects every target the
 *  scene binds, for dispose(). */
export function screen<T>(R: Screen, rt: { width: number; height: number }, made: Set<unknown>, fn: () => T): T {
  const { setRenderTarget: set, getDrawingBufferSize: size } = R
  R.setRenderTarget = (t, ...a) => (made.add(t ?? rt), set.call(R, t ?? rt, ...a))
  R.getDrawingBufferSize = (v) => v.set(rt.width, rt.height)
  try {
    return fn()
  } finally {
    Object.assign(R, { setRenderTarget: set, getDrawingBufferSize: size })
  }
}

/** uExp: the exposure servo's 1 × 1 ln e (vs3/chain.ts servo()). uProbe 1: the servo's probe draw (64², chain.ts PROBE)
 *  writes the luma on screen and step(.85, luma), not the colour. uGrain (S6.1): the donor's film grain, ± .014 per
 *  pixel, rolled by uGrainT (the layer's seconds) every frame, as the kit's (no take recording there; engine.js:235);
 *  the layer target is RGBA8, so it clamps at black as the donor's screen does. */
export const FINISH = `#version 300 es
precision highp float;
uniform sampler2D uSrc, uExp;
uniform vec2 uRes;
uniform float uAber, uVig, uFaithful, uGain, uProbe, uGrain, uGrainT;
out vec4 outColor;
// vs3: the friends' three.js engine, used with permission (2026-11-19); donor/vs3/visual_kit/src/engine/post-shaders.js
// ("post-shaders.js — the original post pipeline, extracted verbatim (masked)"), FinishShader: hash() at :229, the grain at :250
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)) + uGrainT) * 43758.5453); }
void main() { // donor engine/post-shaders.js FinishShader, the watermark left out
  vec2 uv = gl_FragCoord.xy / uRes, d = uv - 0.5, off = d * uAber * 0.003;
  vec3 raw = vec3(texture(uSrc, uv + off).r, texture(uSrc, uv).g, texture(uSrc, uv - off).b), col = raw * uGain * exp(texelFetch(uExp, ivec2(0), 0).r); // BRIGHTNESS: the look's brightness, limited, × the servo's e
  col /= 1.0 + dot(col, vec3(0.2126, 0.7152, 0.0722)) * 0.9; // the soft tone map: no palette whites out
  col = mix(col, max(raw, 0.0), uFaithful); // a filter's picture skips the grade (original main.js:2130, uGainF 1)
  col *= 1.0 - uVig * dot(d, d) * 2.4;
  col += (hash(uv * vec2(1287.0, 718.0)) - 0.5) * 0.028 * uGrain;
  float l = any(isnan(col)) || any(isinf(col)) ? 0.0 : dot(clamp(col, 0.0, 1.0), vec3(0.2126, 0.7152, 0.0722)); // N4: a NaN or Inf pixel reads black
  outColor = uProbe > 0.5 ? vec4(l, step(0.85, l), 0.0, 1.0) : vec4(col, 1.0);
}`
let finish: ReturnType<typeof fullscreenProgram> | undefined
const SLOTS = ['bg', 'shadow', 'mid', 'accent', 'glow'] as const
const GAP_MS = 250 // knob: a draw this long after the last one is back on stage (gl/live.ts limit()'s GAP)

let libs: Promise<Awaited<ReturnType<typeof open>>> | undefined
async function open(gl: WebGL2RenderingContext) {
  const [h, THREE, common, palette, context] = await Promise.all([import('../three/host'), import('three'), import('./kit/lib/common.js'), import('./kit/lib/palette.js'), import('./kit/lib/context.js')])
  const t = h.three(gl, MODEL_SPIKE)
  context.ctx.renderer = t.R // morphogen and the other sims reach the renderer here
  return { ...t, fit: h.fit, RENDER_LIST: h.RENDER_LIST, Color: THREE.Color, PAL: common.PAL, scenePointer: common.scenePointer, PRESETS: palette.PRESETS as { name: string; colors: string[] }[] }
}

// The stage's pointer for a `look.pointer` scene (the donor scenePointer, kit/lib/common.js; its setScenePointer
// fields): NDC on #stage, the time of its last move (a still mouse lets a scene drift home after its 4 s), the button.
// Listeners on #stage only, never on window: the bar, the panels and the editors sit above it with pointer-events
// (ui/overlay.css), so they never steer, and leaving the stage (onto them too) kills it. Every other scene reads DEAD,
// the stub it always had. ponytail: NDC of the element box; a REC-frozen size letterboxes (object-fit) and skews it.
const DEAD = { ndc: null, lastMove: -1e9, held: false }
const live: { ndc: { x: number; y: number } | null; lastMove: number; held: boolean } = { ...DEAD }
let fed = false
function feed() {
  if (fed) return
  fed = true
  const at = (e: PointerEvent, held: boolean) => {
    const r = stage.getBoundingClientRect()
    Object.assign(live, { ndc: { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: 1 - ((e.clientY - r.top) / r.height) * 2 }, lastMove: performance.now(), held })
  }
  stage.addEventListener('pointermove', (e) => at(e, live.held))
  stage.addEventListener('pointerdown', (e) => at(e, true))
  stage.addEventListener('pointerup', () => (live.held = false))
  stage.addEventListener('pointercancel', () => (live.held = false))
  stage.addEventListener('pointerleave', () => Object.assign(live, DEAD))
}
type Lib = Awaited<ReturnType<typeof open>>
/** The donor scene's panel fields (research §1): flat 0..1 sliders, labels per mode ('*': any), their order, the modes.
 *  `panelRows` (ours, morphogen 2.0): the scene's own panel's sliders, from its stripped buildPanel. */
interface Rows { params?: Record<string, unknown>; paramLabels?: Record<string, Record<string, string | null>>; paramOrder?: string[]; modes?: string[]; models?(): string[]; panelRows?: [key: string, min: number, max: number, label: string, group?: string][] }
/** The donor scene as the host reads it (research §1). `fxHint`: signal sets it per mode, main stage's `steady`; `fxWet`:
 *  limitless's tune dry / wet (engine.js:152-153); `faithful`: morphogen 2.0's fixed maps (original main.js:2398-2405);
 *  `grain`: the finish's grain (grainOf). */
interface Scene extends Rows { scene: { traverse(f: (o: { geometry?: { dispose(): void }; material?: { dispose(): void } }) => void): void }; camera: unknown; update(s: Signal, dt: number, t: number): void; resize?(w: number, h: number): void; bloom?: { strength: number; gain: number; kick?: number }; source?: { sourceTexture: WebGLTexture | null }; fxHint?: SceneFacts['hint']; fxWet?(): number; faithful?(): boolean; grain?: number }

// The donor panel's slider order for a scene without paramOrder (original renderer/main.js:7523, addSceneRows).
const ORDER = ['speed', 'shape', 'complexity', 'density', 'fill', 'tilt', 'open', 'morph', 'edge', 'contrast', 'growth', 'movement', 'curl', 'relief', 'pattern', 'form', 'rig', 'room', 'color', 'phase', 'formation', 'screen', 'colors', 'wall', 'chase', 'strips']
// The boolean rows of the donor panels: visage's eyeFollow, morphogen 2.0's colour › invert. Not every boolean param:
// morphogen 2.0's `cream` is a legacy flag it turns into its mode (P.cream = false), which a written input would undo.
const CHECKS = ['eyeFollow', 'invert']
/** The scene's panel rows as the original builds them (main.js addSceneRows) → our inputs: `modes` = `mode`, a select by
 *  index (the scene reads the name); limitless 3d's `model` the same over its `models()` (the math shapes, then the
 *  scans); the 0..1 sliders in paramOrder's order, else the donor's, labelled as in the default mode (main.js
 *  sceneLabel); then its panelRows' sliders at their ranges, folded by their folder; then each CHECKS boolean a
 *  checkbox. Defaults are the scene's own: untouched inputs leave it as it was.
 *  ponytail: one label per slider (the donor relabels per mode), paramChoices / paramSteps as plain sliders. */
export function paramInputs(sc: Rows): Input[] {
  const P = sc.params ?? {}, mode = P.mode as string, out: Input[] = []
  const select = (name: string, labels: string[], v: string) => out.push({ name, type: 'long', values: labels.map((_, i) => i), labels, default: Math.max(0, labels.indexOf(v)) })
  if (sc.modes && mode !== undefined) select('mode', sc.modes, mode)
  if (sc.models && typeof P.model === 'string') select('model', sc.models(), P.model)
  const m = sc.paramLabels?.[mode] ?? {}, all = sc.paramLabels?.['*'] ?? {}
  for (const k of sc.paramOrder ?? ORDER) if (typeof P[k] === 'number') out.push({ name: k, type: 'float', label: (k in m ? m[k] : all[k]) ?? undefined, default: P[k], min: 0, max: 1 }) // a null label: a slider this mode greys out
  for (const [k, min, max, label, group] of sc.panelRows ?? []) if (typeof P[k] === 'number') out.push({ name: k, type: 'float', label, default: P[k], min, max, ...(group && { group }) })
  for (const k of CHECKS) if (typeof P[k] === 'boolean') out.push({ name: k, type: 'bool', default: P[k] })
  return out
}
/** The node's values into the scene's params, each frame (a binding moves them): `mode` back to its name, an index
 *  out of range keeps the current one. */
export function put(P: Record<string, unknown>, ps: readonly Input[], v: Readonly<Record<string, Value>>) {
  for (const i of ps) P[i.name] = i.type === 'long' ? (i.labels![v[i.name] as number] ?? P[i.name]) : v[i.name]
}

/** SCENE_PALETTE (original renderer/main.js:7780; else nocturne); the FX_DEFAULTS rows (main.js:167+) are look.json's.
 *  `filter` (limitless): a filter native; the scene's `source` (a three ExternalTexture) gets the previous layer each
 *  frame, shown as the original shows a dropped clip (its faithful path, main.js:2397): no grade, no resting bloom.
 *  `pointer`: the scene reads the stage's pointer (feed()); opt-in per native, the rest keep the dead stub. */
export interface Look { palette: string; mid?: true; filter?: true; pointer?: true }
/** The look inputs (plan_vs3_engine S2.2, S3.2, S5.2, S6.1): all 18 of look.json's keys, in its order (the donor's post
 *  keys, then the macros), group `look`, after the scene's rows. bloomMul and brightness are never bound (design F3):
 *  light on the music only through ⚡. The selects (SELECTS: labels by value; a preset's glide switches them at its
 *  midpoint): `mirror`, the fold's segment count (the fold fades); `lensStyle`, look.json's lensStyles = LENS's uStyle
 *  (frame() ducks the lens amount to swap it). `lens`: the amount, slewed by the limiter (× a filter's wet there).
 *  `hueDrift`: the palette's turn rate (frame()'s st.hue). */
const LOOK_KEYS = Object.keys(LOOK.base) as LookKey[]
const UNBOUND: readonly string[] = ['bloomMul', 'brightness']
/** The finish's grain (S6.1; donor engine.js:243 `sc.grain ?? 1`, without its × wet): the scene's own `grain` (0 on
 *  main stage, morphogen 2.0 and the recursive-flight three: crystal, pearl, spiral), else 1; a filter's picture none. */
export const grainOf = (sc: { grain?: number }, filter: boolean) => (filter ? 0 : (sc.grain ?? 1))
const SELECTS: Partial<Record<string, string[]>> = { mirror: Array.from({ length: LOOK.ranges.mirror[1] + 1 }, (_, i) => String(i)), lensStyle: LOOK.lensStyles }
const ROWS = LOOK.scenes as Record<string, Partial<LookValues> | undefined>
/** The node's look values into `out`, each frame. A non-finite one (a bound source gone bad) keeps the last value: the
 *  light limiter would hold a NaN until a reset. */
export function putLook(out: LookValues, v: Readonly<Record<string, Value>>) {
  for (const k of LOOK_KEYS) if (Number.isFinite(v[k])) out[k] = v[k] as number
  return out
}
/** The donor palettes by index, as kit/lib/palette.js PRESETS (append-only there; host.test.ts checks the two agree):
 *  the `palette` select of every vs3 native, its default the look's. Static, as the panel reads it before the load. */
export const PALETTES = ['nocturne', 'ember', 'glacial', 'orchid', 'moss', 'sodium', 'pearl', 'cobalt', 'reef', 'vapor', 'oxide', 'aurora', 'velvet', 'acid', 'neon', 'mirage', 'canyon', 'adobe', 'sage', 'umber', 'prism', 'carnival', 'candy', 'tropic']

/** One scene's frame loop on its own RT; resolves once its programs and the warp compiled (rule 5: no compile on a
 *  visible frame), with the chain's targets at `size`, the draw size (C12: no visible frame allocates them). */
async function start(gl: WebGL2RenderingContext, L: Lib, sc: Scene, look: Look, ps: readonly Input[], d: LookValues, name: string, size: readonly [number, number]) {
  const { R, guard, texture } = L
  const colors = (i: number) => L.PRESETS[i].colors.map((c) => new L.Color(c))
  // the five shown and a crossfade's two ends; palIx -1: nothing drawn yet, so the first palette lands at once
  const pal = colors(PALETTES.indexOf(look.palette)), from = colors(0), to = colors(0)
  let palIx = -1, palK = 1, seen = -Infinity, drawn = -Infinity
  const made = new Set<{ dispose(): void }>()
  const s = { specHi: new Float32Array(192) } as Signal
  const P = sc.params ?? {}
  let rt = L.fit(null, 16, 16, 1), prev = 0, prevMid = 0, w = 0, h = 0
  // the chain (vs3/chain.ts): its state, the look's values (look.json's defaults under the node's), the scene's facts
  const st = chainState(), values = { ...d }, mid3 = [0, 0, 0], tint = new L.Color()
  /** `c` into `out`, turned by the hue drift (S6.1, design C10): pal[] stays unrotated, so nothing accumulates, and three
   *  keeps the turn in gamut. At 0 a plain copy, as the donor skips it (palette.js:181). */
  const turn = (c: typeof tint, out: typeof tint) => (st.hue ? out.copy(c).offsetHSL(st.hue, 0, 0) : out.copy(c))
  const facts: SceneFacts = {
    bloom: sc.bloom, filter: !!look.filter, bloomRow: d.bloomMul, gainBase: LOOK.base.brightness, vigRange: LOOK.ranges.vignette[1] - LOOK.ranges.vignette[0],
    lateTrails: (LOOK.lateTrails as Record<string, number | undefined>)[name] ?? 0, wet: 1, grain: grainOf(sc, !!look.filter), hint: null,
  }
  await Promise.all([guard('compileAsync', () => (R.setRenderTarget(rt), R.compileAsync(sc.scene, sc.camera))), warmChain()])
  finish ??= fullscreenProgram(FINISH)
  const bloom = createBloom(gl, 8, 0.3) // the donor's threshold (luma .3); 8 levels reach its widest mip's ≈ 350 px
  const chain = createChain(gl, ...size)
  return {
    /** S3d, before draw(): this frame's look values (as draw() puts them) against the uGain as last drawn (×1.0234 a frame
     *  at most). */
    hot: (v: Readonly<Record<string, Value>>) => hotLook(putLook(values, v), facts, st.light?.gain ?? values.brightness),
    draw(f: { width: number; height: number; dt: number; time: number }, vals: Readonly<Record<string, Value>>, src: Readonly<Sources>, input: WebGLTexture | null) {
      const hit = vals.hit as number, mid = (vals.mid as number | undefined) ?? 0
      put(P, ps, vals)
      putLook(values, vals)
      const pi = vals.palette as number, now = performance.now()
      const { dtl, reset } = clock(now, seen, engineFrame(), drawn) // the light's real seconds; not drawn last frame: snap (N2)
      drawn = engineFrame()
      if (reset) st.reset = true
      if (pi !== palIx && L.PRESETS[pi]) {
        // the select (a preset) switched it: a crossfade from the colours on screen over the preset glide's time (the
        // donor's PaletteEngine), at once on the first draw or back on stage. ponytail: on the layer's clock, so a
        // layer at speed ≠ 1 fades at its pace; the gap is wall time (the layer clock stops off stage).
        palIx = pi
        from.forEach((c, i) => turn(pal[i], c)) // the colours on screen, then the drift starts over: the donor's set() (palette.js:168-171)
        st.hue = 0
        to.forEach((c, i) => c.set(L.PRESETS[pi].colors[i]))
        palK = now - seen > GAP_MS ? 1 : 0
        if (palK) pal.forEach((c, i) => c.copy(to[i]))
      }
      seen = now
      if (palK < 1) {
        palK = Math.min(1, palK + f.dt / MORPH_S)
        const e = ease(palK)
        pal.forEach((c, i) => c.lerpColors(from[i], to[i], e))
      }
      Object.assign(L.scenePointer, look.pointer ? live : DEAD) // one shared object: this scene's view of it for its update
      if (sc.source) sc.source.sourceTexture = input // a filter's picture: the previous layer
      const v = vs3Live.s // analyser 'vs3': the core's levels and spectrum
      signal(src, hit, prev, s, mid, prevMid, v)
      facts.hint = sc.fxHint ?? null // as the last update() left them: frame() runs before update(), whose signal it reacts
      facts.wet = sc.fxWet?.() ?? 1
      facts.faithful = !!sc.faithful?.() // its mode as put() wrote it: no servo (N3), no resting glow
      const cf = frame(values, facts, s, hit, st, turn(pal[2], tint).toArray(mid3), f.dt, dtl, f.time, f.width / f.height) // pal[2]: SLOTS' mid, as drawn (the donor's tint reads PAL.mid after the drift; one frame behind it)
      reactTo(s, cf) // the kick as drawn (I-FL1: the limiter's slew) and the levels × react; onKick on the raw rise; both × kickGain
      prev = hit
      prevMid = mid
      if (v) s.specHi.set(v.specHi)
      else specHi(src, s.specHi)
      guard('render', () => {
        rt = L.fit(rt, f.width, f.height, 1)
        if (f.width !== w || f.height !== h) sc.resize?.((w = f.width), (h = f.height)) // px, not the donor's CSS px: the scenes read the aspect
        pal.forEach((c, i) => turn(c, L.PAL[SLOTS[i]])) // the uniforms hold PAL's slots: this scene's colours for its draw, turned by its drift
        screen(R, rt, made, () => {
          R.setRenderTarget(rt)
          sc.update(s, f.dt, f.time)
          R.setRenderTarget(rt) // a sim may have left its own target bound
          R.render(sc.scene, sc.camera)
        })
      }, L.RENDER_LIST) // restores the engine's target and viewport
      const out = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null, keep = glState(gl, PASS_LIST) // GPU3D I-GL2
      // the warp (cf.mirror, cf.feedback), then the bloom at cf.bloom: the donor's glow 9 k², limited (three r170
      // UnrealBloomPass: its composite is k × Σ factors (3 at radius .4) × blur, alpha 3k too, and the additive blend is
      // SRC_ALPHA, ONE on a half-float target, so the colour lands × 3k unclamped); a pass that is off is skipped
      const lit = chain.apply(texture(rt), f.width, f.height, cf, bloom) // binds its own targets
      const fin = { uSrc: lit, ...cf.finish, uGrainT: f.time, uFaithful: look.filter ? 1 : 0 }
      // the exposure servo (S3b.2): this frame finished into the probe at the e on screen, then UPDATE; its e lands now
      const uExp = chain.servo(cf.servo, (e) => finish!({ ...fin, uRes: [PROBE, PROBE], uProbe: 1, uExp: e })) // leaves its 1 × 1 target bound
      gl.bindFramebuffer(gl.FRAMEBUFFER, out)
      gl.viewport(0, 0, f.width, f.height)
      finish!({ ...fin, uRes: [f.width, f.height], uProbe: 0, uExp })
      restore(gl, keep)
    },
    dispose() {
      guard('dispose', () => {
        for (const t of made) t.dispose() // the sims' targets and ours (a second dispose is a no-op in three)
        rt.dispose()
        sc.scene.traverse((o) => (o.geometry?.dispose(), o.material?.dispose()))
      })
      bloom.dispose()
      chain.dispose()
    },
  }
}

/** The native of one copied scene: `load` imports its file (host.test.ts reads every scene's rows through it), `look`
 *  its SCENE_PALETTE and flags; its FX_DEFAULTS row is look.json's. */
export function vs3(name: string, load: () => Promise<{ default: () => Scene }>, look: Look): NativeDef & { load: typeof load } {
  const ready = (gl: WebGL2RenderingContext) => Promise.all([(libs ??= open(gl)), load()])
  const flash = look.mid ? ['hit', 'mid'] : ['hit']
  const ps = (PARAMS as Record<string, Input[] | undefined>)[name] ?? [] // its panel rows, static: bindings and the panel read them before the lazy load
  const d: LookValues = { ...LOOK.base, ...ROWS[name] } // its look's defaults: the donor's base under the scene's FX_DEFAULTS row
  return {
    id: `native/vs3-${name}`, name: `vs3 ${name}`, kind: look.filter ? 'filter' : 'generator', credit: "vs3: the friends' three.js engine, used with permission; three.js r187 (MIT)",
    // ⚡ the donor kick (+ onMid / onHigh): all a hit lights through; the palette, never bound (a swap per beat would
    // strobe the whole picture) and crossfaded here (`fade`); the rows: plain sliders, never auto-bound; then the look
    inputs: [
      ...flash.map((n): Input => ({ name: n, type: 'float', min: 0, max: 1, default: 0 })), { name: 'palette', type: 'long', values: PALETTES.map((_, i) => i), labels: PALETTES, default: PALETTES.indexOf(look.palette), bindable: false, fade: true }, ...ps,
      ...LOOK_KEYS.map((k): Input => {
        const labels = SELECTS[k]
        return labels
          ? { name: k, type: 'long', group: 'look', values: labels.map((_, i) => i), labels, default: d[k] }
          : { name: k, type: 'float', group: 'look', default: d[k], min: LOOK.ranges[k][0], max: LOOK.ranges[k][1], ...(UNBOUND.includes(k) && { bindable: false as const }) }
      }),
    ],
    flash,
    load,
    warm: () => Promise.all([ready(stageGl), warmChain()]).then(() => {}, () => {}), // Start waits for it; a failed load leaves the layer hidden
    create(gl, size) {
      if (look.pointer) feed()
      let run: Awaited<ReturnType<typeof start>> | null = null, gone = false
      // the tile's size, else the stage's (C12); a layer at res ≠ 1 re-fits on its first draw, as three's RT and the bloom
      ready(gl).then(([L, m]) => start(gl, L, m.default(), look, ps, d, name, size ?? shotSize())).then((r) => (gone ? r.dispose() : (run = r)), (e: unknown) => console.error(`native/vs3-${name}: the load failed`, e))
      return {
        hidden: () => !run,
        hot: (v) => !!run?.hot(v), // gl/live.ts runs the layer under the toy limiter while true (S3d)
        draw(f, v, input, s) {
          if (run) run.draw(f, v, s ?? {}, input ?? null)
          else if (input) copy({ uSrc: input, uRes: [f.width, f.height] }) // a filter passes its picture through until it runs
        },
        dispose() {
          gone = true
          run?.dispose()
        },
      }
    },
  }
}

// The ported scenes (guide § Register): one line each. Their looks (the original main.js FX_DEFAULTS row, or the
// donor's BASE_POST when a scene has none) are vs3/look.json's, written by scripts/vs3-presets.mjs.
export const VS3: readonly ReturnType<typeof vs3>[] = [
  vs3('ink', () => import('./kit/scenes/ink.js'), { palette: 'nocturne' }),
  vs3('relic', () => import('./kit/scenes/relic.js'), { palette: 'nocturne' }),
  vs3('morphogen', () => import('./kit/scenes/morphogen.js'), { palette: 'pearl' }),
  vs3('mandala', () => import('./kit/scenes/kaleido.js'), { palette: 'nocturne' }),
  vs3('tendril', () => import('./kit/scenes/tendril.js'), { palette: 'nocturne' }),
  vs3('citadel', () => import('./kit/scenes/citadel.js'), { palette: 'nocturne' }),
  vs3('descent', () => import('./kit/scenes/descent.js'), { palette: 'nocturne' }),
  vs3('oracle', () => import('./kit/scenes/oracle.js'), { palette: 'nocturne' }),
  vs3('idol', () => import('./kit/scenes/idol.js'), { palette: 'nocturne' }),
  vs3('spacetime', () => import('./kit/scenes/spacetime.js'), { palette: 'nocturne' }),
  vs3('ingot', () => import('./kit/scenes/ingot.js'), { palette: 'nocturne' }),
  vs3('gate', () => import('./kit/scenes/gate.js'), { palette: 'nocturne' }),
  vs3('synapse', () => import('./kit/scenes/synapse.js'), { palette: 'nocturne', mid: true }),
  vs3('anemone', () => import('./kit/scenes/anemone.js'), { palette: 'nocturne' }), // no `mid`: its onHigh is a sparkle, not worth the kicks the snare takes from the flash budget
  vs3('aurora', () => import('./kit/scenes/aurora.js'), { palette: 'nocturne' }),
  vs3('blob', () => import('./kit/scenes/blob.js'), { palette: 'nocturne' }),
  vs3('echo', () => import('./kit/scenes/echo.js'), { palette: 'nocturne', mid: true }),
  vs3('flow', () => import('./kit/scenes/flow.js'), { palette: 'nocturne' }),
  vs3('fract', () => import('./kit/scenes/fract.js'), { palette: 'nocturne' }),
  vs3('signal', () => import('./kit/scenes/signal.js'), { palette: 'nocturne' }),
  vs3('sand', () => import('./kit/scenes/sand.js'), { palette: 'nocturne' }),
  vs3('chorus', () => import('./kit/scenes/chorus.js'), { palette: 'sodium' }), // its thumb's amber: the factory preset ★ chorus — choir (main.js:9826)
  vs3('chorus-hall', () => import('./kit/scenes/chorus.js'), { palette: 'sodium', pointer: true }), // chorus with the stage pointer (user 2026-11-20: an additional scene, chorus untouched)
  vs3('visage', () => import('./kit/scenes/visage.js'), { palette: 'nocturne', pointer: true }), // its eyes follow the cursor (eyeFollow, user 2026-11-21)
  vs3('limitless3d', () => import('./kit/scenes/limitless3d.js'), { palette: 'nocturne' }),
  vs3('lasers', () => import('./kit/scenes/lasers.js'), { palette: 'vapor' }),
  // Batch 2a (2026-11-19). Rows 254 (crystal), 255 (pearl), 270 (spiral): lib/recursive-flight.js.
  vs3('crystal', () => import('./kit/scenes/crystal.js'), { palette: 'nocturne' }),
  vs3('pearl', () => import('./kit/scenes/pearl.js'), { palette: 'nocturne' }),
  vs3('spiral', () => import('./kit/scenes/spiral.js'), { palette: 'nocturne' }),
  vs3('fluid', () => import('./kit/scenes/fluid.js'), { palette: 'nocturne' }),
  vs3('forge', () => import('./kit/scenes/forge.js'), { palette: 'nocturne' }),
  vs3('pelt', () => import('./kit/scenes/pelt.js'), { palette: 'nocturne' }),
  vs3('wisp', () => import('./kit/scenes/wisp.js'), { palette: 'nocturne' }),
  vs3('morphogen2', () => import('./kit/scenes/morphogen2.js'), { palette: 'glacial' }),
  vs3('locus', () => import('./kit/scenes/locus.js'), { palette: 'nocturne' }),
  vs3('vesica', () => import('./kit/scenes/vesica.js'), { palette: 'nocturne' }),
  vs3('grove', () => import('./kit/scenes/grove.js'), { palette: 'nocturne' }), // row 226
  // Row 170. A filter: the picture it bends is the layer under it (melt, the file's default mode; params are no inputs yet).
  vs3('limitless', () => import('./kit/scenes/limitless.js'), { palette: 'nocturne', filter: true }),
]
