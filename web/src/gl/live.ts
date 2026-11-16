// A live scene (design E1–E3, E5, Variant A): renders a SceneDoc into a target every frame, outside React. Per layer the
// generator draws (at size × res), then each effect reads the previous texture as `inputImage`, ping-ponging the two
// engine temps; an ISF file runs its PASSES through its own TARGETs; a pasted Shadertoy (`toy/…`) is a generator. Each
// layer is composited onto `acc` with its blend and opacity, except the fast path: a bottom layer at normal, opacity 1,
// res 1 draws straight into `acc`, unless its generator writes straight alpha (native/model, LR-7).
// Every layer runs its own clock (`speed`). Bindings write the nodes' uniforms and the layers' opacity/speed per frame.
// The panel (design E6) edits the current scene through `panel`: values and bindings in place, structure by the same one
// op on the built layers (every other node keeps running), each with its inverse recorded for undo (design S3); it saves
// into the library (E4), where `live` finds every scene.
import { bindFramebufferInfo, createTexture, type ProgramInfo } from 'twgl.js'
import { ctx } from '../audio/input'
import { bindable, evaluate, level, type Binding, type BindState, type Sources } from '../bind'
import { cam } from '../camera/camera'
import * as users from '../camera/users' // users.use(): a bare use() reads as React's hook to the rules-of-hooks lint
import { CODE_MAX, defaults, type Blend, type LayerDoc, type MaskMode, type NodeDoc, type SceneDoc, type SceneId } from '../doc'
import * as edit from '../edit'
import { tiles } from '../editor/tiles'
import type { FrameInput } from '../frame'
import { catalog, toyDef, transitions } from '../fx/catalog'
import { pairsByTarget, sizeExpr } from '../fx/isf'
import { clockStep } from '../clock'
import type { EffectDef, Input, InputType, PassDef, ShaderDef, Value } from '../fx/types'
import { library } from '../library'
import { store } from '../store'
import { edits } from '../undo'
import { audioTex, copy, draw, fullscreenProgram, gl, program, programAsync, renderTarget, temps, type Target } from './engine'
import { flashGate, type FlashState } from './post'
import { straight, type Native, type NativeDef } from './scene'

export { docs, type NodePath } from '../edit'

export interface Live {
  readonly doc: SceneDoc; readonly errors: readonly string[]; render(f: FrameInput, s: Sources, acc: Target): void; dispose(): void
  /** The panel, after it edited the doc: one input's live value at `p` (undefined: the default), in place; every
   *  binding compiled again. */
  set(p: edit.NodePath, input: string, v: Value | undefined): void; rebind(): void
  /** The panel, after edit.ts changed the doc's structure: the same one op on the built layers. Every other node and
   *  layer keeps its state and clock. addFx/addLayer build the doc's fx/layer at `at` (the last one without). */
  addFx(layer: number, at?: number): void; removeFx(layer: number, i: number): void; moveFx(layer: number, from: number, to: number): void
  setGen(layer: number): void; addLayer(at?: number): void; removeLayer(i: number): void; moveLayer(from: number, to: number): void
  setBlend(layer: number, b: Blend): void
  /** camera CP1: the layer's mask; none → a mode takes the layer's camera user, a mode → none releases it. */
  setMask(layer: number, m: MaskMode | undefined): void
  /** Preview only (design S2), never saved: a muted layer draws nothing. */
  mute(layer: number, on: boolean): void
  /** A bound input's last evaluated value (`key`: `name`, or `name.i` for one component); undefined when unbound. */
  read(p: edit.NodePath, key: string): number | undefined
  /** GPU3D N7: every layer's generator is hidden (native/model loading, native/camera without a picture), so a render
   *  draws black. The tile bake waits on it. */
  hidden(): boolean
}

/** A built node: a native, or a shader program and its passes; `u` holds its values (+ the ISF uniforms). The passes
 *  naming one TARGET share a read/write pair, swapped after each of them draws (design E2): a PERSISTENT one reads its
 *  last frame, a later pass what the previous one wrote, and no pass samples the texture it draws into. `w`/`h`: the
 *  size the targets were fitted for. `frames`: a shader's FRAMEINDEX, its own draws so far (0 on its first). */
interface Node { def: EffectDef; native?: Native; info?: ProgramInfo; u: Record<string, unknown>; events: string[]; passes: { p: PassDef; pair: Target[] | null }[]; w: number; h: number; frames: number }
/** A built layer: its nodes (a null one blacks the layer out), its live opacity/speed (bindable) and res, its clock,
 *  the reused FrameInput copy a native reads, its own target once `res` < 1, and the editor's mute (black too). `mask`
 *  (camera CP1): the doc's; `release` gives back the camera user a masked layer holds (K-3), idempotent. */
interface Layer { blend: Blend; mask?: MaskMode; release: () => void; nodes: (Node | null)[]; v: { opacity: number; speed: number; res: number }; t: number; f: FrameInput; small: Target | null; muted: boolean }
/** `y`: the value it evaluated last (Live.read). */
interface Bound { u: Record<string, unknown>; name: string; i: number; type: InputType; b: Binding; state: BindState; flash?: FlashState; y?: number }
const LAYER_INPUTS: readonly Input[] = [{ name: 'opacity', type: 'float' }, { name: 'speed', type: 'float' }] // bindable
/** The one flash budget: the allowed onsets' `f.time`s, oldest first, shared by every layer of every scene (both of a
 *  fade). ponytail: hidden layers and a fade's outgoing scene spend it too, and two flashes in one frame count twice;
 *  both stricter, harmless. */
export const flashOnsets: number[] = []

const SIZE = new Float32Array(2) // the shots' size: `inputImage`'s, even from a gen drawn at res < 1 (it is upscaled)
const IRES = new Float32Array([0, 0, 1]) // a toy's iResolution: RENDERSIZE, z = 1 (Shadertoy's pixel aspect)
const RS = IRES.subarray(0, 2) // RENDERSIZE: the size of the target each pass draws into, set before its draw
const DATE = new Float32Array(4)
const IDATE = new Float32Array(4) // a toy's iDate, as Shadertoy's: year, month from 0, day, seconds with ms
const AUDIO_SIZE = [512, 1] // the engine's audio textures
const MAX_SIZE = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number
const PARALLEL = !!gl.getExtension('KHR_parallel_shader_compile') // warm() compiles off the main thread
// A toy's fixed uniforms (design E5); iMouse stays 0 (GL zero-fills uniforms). iChannel0 is the audio (row 0 FFT, row 1
// waveform); iChannel1–3 share one 256² RGBA noise texture, mipmapped and repeating as Shadertoy's.
const noise = createTexture(gl, { width: 256, height: 256, src: Uint8Array.from({ length: 256 * 256 * 4 }, () => Math.random() * 256) })
const TOY = {
  iResolution: IRES, iDate: IDATE, iSampleRate: ctx.sampleRate, iChannel0: audioTex.toy, iChannel1: noise, iChannel2: noise, iChannel3: noise,
  iChannelResolution: [512, 2, 1, 256, 256, 1, 256, 256, 1, 256, 256, 1],
}
/** A pasted Shadertoy node's def, from its inline code (design E5); other refs are the catalog's. */
const toyOf = (n: NodeDoc) => (n.ref.startsWith('toy/') ? toyDef(n) : undefined)
/** A toy's compile log, its line numbers counted in the paste. Compiles the shader again: on a failure only. */
function toyLog(fs: string, prefixLines: number) {
  const sh = gl.createShader(gl.FRAGMENT_SHADER)!
  gl.shaderSource(sh, fs)
  gl.compileShader(sh)
  const log = gl.getShaderInfoLog(sh)?.trim() || 'failed to link'
  gl.deleteShader(sh)
  return log.replace(/(ERROR|WARNING): (\d+):(\d+)/g, (_, k: string, s: string, n: string) => `${k}: ${s}:${Number(n) - prefixLines}`)
}
const free = (t: Target) => {
  gl.deleteFramebuffer(t.framebuffer)
  gl.deleteTexture(t.attachments[0])
}

// The layer composite (design E2): the shader pre-scales the source, fixed-function blending does the rest.
// difference/dodge are absent here: they need acc read and written at once, so they go through compositeDst.
const BLENDS: Record<Exclude<Blend, 'difference' | 'dodge'>, [mode: number, sf: GLenum, df: GLenum]> = {
  normal: [0, gl.ONE, gl.ONE_MINUS_SRC_ALPHA], // alpha-over × opacity
  add: [1, gl.ONE, gl.ONE], // dst + op·src
  screen: [1, gl.ONE_MINUS_DST_COLOR, gl.ONE], // 1 − (1 − dst)(1 − op·src)
  multiply: [2, gl.DST_COLOR, gl.ZERO], // dst · mix(1, src, op)
  max: [3, gl.ONE, gl.ONE], // MAX(op·src, dst): the render sets the equation to MAX, then resets it to FUNC_ADD
}
// The layer mask (camera CP1, D4), in both composites: op × m (person) or × (1 − m) (background), m the feathered
// mask through cam.xf, sampled where scenes/camera.ts samples it (xf.ts's space, y down). So every blend runs at op = m
// and nothing darkens the feather twice. uMaskMode 0: op as it was (an unmasked scene renders the same bytes).
const MASK = `uniform sampler2D uMask;
uniform int uMaskMode; // 0 none, 1 person, 2 background
uniform vec4 uXf;
uniform float uFeather;
float masked(float op) {
  if (uMaskMode == 0) return op;
  float m = smoothstep(0.5 - uFeather, 0.5 + uFeather, texture(uMask, vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uRes * uXf.xy + uXf.zw).r);
  return op * (uMaskMode == 1 ? m : 1.0 - m);
}`
const MASK_MODE = { person: 1, background: 2 } as const
const FEATHER = 0.15 // D2's global feather f
// Alpha 0 (add, screen) and 1 (multiply, max) leave acc's alpha as it was.
const composite = fullscreenProgram(`#version 300 es
precision highp float;
uniform sampler2D uSrc;
uniform vec2 uRes;
uniform float uOpacity;
uniform int uMode;
${MASK}
out vec4 outColor;
void main() {
  vec4 c = texture(uSrc, gl_FragCoord.xy / uRes);
  float op = masked(uOpacity);
  outColor = uMode == 0 ? vec4(c.rgb * c.a, c.a) * op : uMode == 1 ? vec4(c.rgb * op, 0.0) : uMode == 3 ? vec4(c.rgb * op, 1.0) : vec4(1.0 - op + op * c.rgb, 1.0);
}`)
const cu: Record<string, unknown> = { uSrc: null, uRes: SIZE, uOpacity: 1, uMode: 0, uMask: null, uMaskMode: 0, uXf: cam.xf, uFeather: FEATHER } // reused every composite
// difference/dodge (wave-2 S0.1): the old acc is copied into the scratch below, and this two-sampler pass computes
// the new acc. uMode: 0 difference |acc − op·src|, 1 dodge acc / max(1e-3, 1 − op·src).
const compositeDst = fullscreenProgram(`#version 300 es
precision highp float;
uniform sampler2D uAcc;
uniform sampler2D uSrc;
uniform vec2 uRes;
uniform float uOpacity;
uniform int uMode;
${MASK}
out vec4 outColor;
void main() {
  vec4 a = texture(uAcc, gl_FragCoord.xy / uRes);
  vec4 c = texture(uSrc, gl_FragCoord.xy / uRes);
  float op = masked(uOpacity);
  outColor = uMode == 0 ? vec4(abs(a.rgb - op * c.rgb), a.a) : vec4(a.rgb / max(vec3(1e-3), 1.0 - op * c.rgb), a.a); // no scalar/vec3 max overload in ES 3.00
}`)
const cd: Record<string, unknown> = { uAcc: null, uSrc: null, uRes: SIZE, uOpacity: 1, uMode: 0, uMask: null, uMaskMode: 0, uXf: cam.xf, uFeather: FEATHER } // reused like cu
const scratch = renderTarget() // module level, shared by every scene: difference/dodge's old-acc copy, fit at use
let built = 0 // buildLayer calls (__cam.builds(), the camera harness's B7)
export const builds = () => built

/** `own`: a tile's (tile()): its doc, and the size its own temps and natives are made for. */
function create(id: SceneId, own?: { doc: SceneDoc; size: readonly [number, number] }): Live {
  const errors: string[] = []
  let layers: Layer[] = []
  let bound: Bound[] = []
  const doc = () => own?.doc ?? find(id)! // the panel's copy (edit.ts) from the scene's first edit on
  const tmp = own ? [renderTarget(), renderTarget()] : temps // a tile's own ping-pong, at its size
  if (own) for (const t of tmp) t.fit(...own.size)
  const onsets = own ? [] : flashOnsets // a tile never spends the preview's flash budget

  const fail = (msg: string) => {
    if (errors.includes(msg)) return null // rebind() meets a bad binding again
    errors.push(msg)
    console.error(`${id}: ${msg}`)
    return null
  }

  function node(n: NodeDoc): Node | null {
    const toy = toyOf(n)
    const def = toy ?? catalog.get(n.ref)
    if (!def) return fail(`unknown ref ${n.ref}`)
    const u: Record<string, unknown> = { ...defaults(def), ...n.values }
    const events = def.inputs.filter((x) => x.type === 'event').map((x) => x.name)
    if ('create' in def) return { def, native: (def as NativeDef).create(gl, own?.size), u, events, passes: [], w: 0, h: 0, frames: 0 }
    const { vs, fs, passes, inputs } = def as ShaderDef
    const info = program(vs, fs) // null when it fails to compile; twgl logged why
    if (!info) return fail(`${n.ref}: ${toy ? toyLog(fs, toy.prefixLines) : 'shader failed to compile'}`)
    Object.assign(u, { RENDERSIZE: RS, PASSINDEX: 0, DATE, _inputImage_imgSize: SIZE })
    if (toy) Object.assign(u, TOY)
    for (const { name, type } of inputs) {
      if (type !== 'audio' && type !== 'audioFFT') continue
      u[name] = type === 'audio' ? audioTex.wave : audioTex.fft
      u[`_${name}_imgSize`] = AUDIO_SIZE
    }
    const at = pairsByTarget(passes) // passes naming one TARGET share a pair, built to its first pass's FLOAT/PERSISTENT
    const tex = (p: PassDef) => ({ ...(p.filter && { minMag: gl.NEAREST }), ...(p.wrap && { wrap: gl.REPEAT }) }) // a synScene TARGET's sampling
    const pairs = passes.map((p, j) => (at[j] === j ? [renderTarget(p.float, p.persistent, tex(p)), renderTarget(p.float, p.persistent, tex(p))] : null))
    return { def, info, u, events, passes: passes.map((p, j) => ({ p, pair: at[j] < 0 ? null : pairs[at[j]] })), w: 0, h: 0, frames: 0 }
  }

  /** Compiles `binds` onto `u` (a node's uniforms or a layer's values). An input bound before (in `old`) first gets
   *  its value from `base` back; one still bound keeps its smoothing state. The `flashes` (the def's `flash`, WCAG
   *  2.3.1) are gated by flashGate. */
  function bindInto(u: Record<string, unknown>, inputs: readonly Input[], base: Record<string, unknown>, binds: Record<string, Binding> = {}, ref: string, old: Bound[], flashes?: readonly string[]) {
    for (const x of old) if (x.u === u) u[x.name] = base[x.name]
    for (const [key, b] of Object.entries(binds)) {
      const [name, idx] = key.split('.')
      const i = idx === undefined ? -1 : Number(idx)
      const v = u[name]
      const input = inputs.find((x) => x.name === name)
      const ok = input && bindable(input) && v !== undefined && (i < 0 ? !Array.isArray(v) : Array.isArray(v) && i < v.length)
      if (!ok) {
        fail(`${ref}: cannot bind ${key}`)
        continue
      }
      if (i >= 0) u[name] = [...(v as number[])] // our own copy: never write into the def's or the doc's array
      const was = old.find((x) => x.u === u && x.name === name && x.i === i)
      const flash = flashes?.includes(name) ? (was?.flash ?? { prev: 0, blocked: false }) : undefined // kept like `state`: a rebind mid-flash neither re-counts nor leaks
      bound.push({ u, name, i, type: input.type, b, state: was?.state ?? { y: 0 }, flash })
    }
  }

  /** The doc's bindings (design E3) onto the built layers and nodes: at build, and after the panel's setBinding. */
  function bindAll() {
    const old = bound
    bound = []
    doc().layers.forEach((ld, i) => {
      const l = layers[i]
      bindInto(l.v, LAYER_INPUTS, { opacity: ld.opacity, speed: ld.speed }, ld.bind, 'layer', old)
      ;[ld.gen, ...ld.fx].forEach((n, k) => {
        const x = l.nodes[k]
        if (x) bindInto(x.u, x.def.inputs, { ...defaults(x.def), ...n.values }, n.bind, n.ref, old, x.def.flash)
      })
    })
  }

  /** A pass's WIDTH/HEIGHT expression in px, or the node's size without one (or when it fails). */
  function dim(expr: string | undefined, vars: Record<string, number>, fallback: number) {
    if (expr === undefined) return fallback
    try {
      return Math.min(MAX_SIZE, Math.max(1, Math.round(sizeExpr(expr, vars))))
    } catch (e) {
      fail((e as Error).message)
      return fallback
    }
  }

  /** Fits a shader node's pass targets to its new size (persistent ones are resampled: design E2).
   *  ponytail: inputs named in a size expression are read here only, so binding one resizes nothing until the next
   *  resize; re-check them per frame if an effect needs it. */
  function resize(n: Node, w: number, h: number) {
    n.w = w
    n.h = h
    const vars: Record<string, number> = { WIDTH: w, HEIGHT: h }
    for (const [k, v] of Object.entries(n.u)) if (typeof v === 'number') vars[k] = v
    for (const [j, { p, pair }] of n.passes.entries()) {
      if (!pair || n.passes.findIndex((x) => x.pair === pair) < j) continue // a shared pair: fitted once, to its first pass
      const tw = dim(p.width, vars, w)
      const th = dim(p.height, vars, h)
      for (const t of pair) t.fit(tw, th)
      n.u[p.target!] = pair[0].attachments[0] // a persistent fit() swaps in a new texture
      n.u[`_${p.target}_imgSize`] = [tw, th]
    }
  }

  /** One node into `dst` on its layer's clock; returns the texture it produced: dst's, or its last pass's TARGET. */
  function run(n: Node, l: Layer, f: FrameInput, dt: number, src: WebGLTexture | null, dst: Target, s: Sources) {
    let out = dst
    if (n.native) {
      bindFramebufferInfo(gl, dst)
      const fl = Object.assign(l.f, f) // no allocation: the layer's own copy, on its clock and at its size
      fl.time = l.t
      fl.dt = dt
      fl.width = dst.width
      fl.height = dst.height
      n.native.draw(fl, n.u as Record<string, Value>, src, s, l.blend) // a native filter reads src; null for a generator
    } else {
      if (n.w !== dst.width || n.h !== dst.height) resize(n, dst.width, dst.height)
      n.u.TIME = n.u.iTime = l.t // ISF's names and a toy's
      n.u.TIMEDELTA = n.u.iTimeDelta = dt
      n.u.FRAMEINDEX = n.u.iFrame = n.frames++
      n.u.inputImage = src // the previous draw; unused by a generator
      const { clocks, raws } = n.def as ShaderDef // a synScene's audio clocks (on the layer's clock) and frame values
      if (clocks) for (const c of clocks) n.u[c.u] = clockStep((n.u[c.u] as number | undefined) ?? 0, c.rate, n.u, dt)
      if (raws) for (const [k, read] of raws) n.u[k] = read(f)
      for (let j = 0; j < n.passes.length; j++) {
        const { p, pair } = n.passes[j]
        out = pair ? pair[1] : dst
        bindFramebufferInfo(gl, out)
        RS[0] = out.width
        RS[1] = out.height
        n.u.PASSINDEX = j
        draw(n.info!, n.u)
        if (!pair) continue
        pair.reverse() // what it drew is now the one later passes (and the next frame) read
        n.u[p.target!] = pair[0].attachments[0]
      }
    }
    for (const e of n.events) n.u[e] = false
    return out.attachments[0]
  }

  // A masked layer holds one camera user (K-3); a tile's holds none (N-4), so a library bake or hover never spawns a host.
  const buildLayer = (l: LayerDoc): Layer => (built++, {
    blend: l.blend, mask: l.mask, release: users.use(!!l.mask && !own), nodes: [node(l.gen), ...l.fx.map(node)], v: { opacity: l.opacity, speed: l.speed, res: l.res }, t: 0,
    f: {} as FrameInput, small: l.res < 1 ? renderTarget() : null, muted: false,
  })

  /** The one freeing path, of a disposed scene and of a removed node or layer: a native's own dispose() (a milk/* one
   *  goes back to its pool), every pass target. */
  function freeNode(n: Node | null) {
    n?.native?.dispose?.()
    new Set(n?.passes.flatMap((x) => x.pair ?? [])).forEach(free) // a shared pair once
  }
  function freeLayer(l: Layer) {
    l.release()
    if (l.small) free(l.small)
    l.nodes.forEach(freeNode)
  }

  function dispose() {
    layers.forEach(freeLayer)
    layers = []
    if (own) tmp.forEach(free)
  }

  layers = doc().layers.map(buildLayer)
  bindAll()
  return {
    get doc() {
      return doc()
    },
    errors,
    render(f, s, acc) {
      for (const x of bound) {
        let y = evaluate(x.b, s, x.state, f.dt)
        if (x.flash) y = flashGate(y, x.flash, onsets, f.time)
        x.y = y
        if (x.i >= 0) (x.u[x.name] as number[])[x.i] = y
        else if (x.type === 'bool' || x.type === 'event') [x.u[x.name], x.state.held] = level(x.type, y, x.state.held)
        else x.u[x.name] = x.type === 'long' ? Math.round(y) : y
      }
      SIZE[0] = acc.width
      SIZE[1] = acc.height
      const d = new Date()
      DATE.set([d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()])
      IDATE.set([d.getFullYear(), d.getMonth(), d.getDate(), DATE[3] + d.getMilliseconds() / 1000])
      for (let i = 0; i < layers.length; i++) {
        const l = layers[i]
        const dt = f.dt * l.v.speed
        l.t += dt
        const ok = !l.muted && !l.nodes.includes(null) && !l.nodes[0]?.native?.hidden?.() // not ok: black (layer 0 still clears acc); a hidden gen adds nothing (N-1)
        const last = l.nodes[l.nodes.length - 1]
        const small = l.v.res < 1 ? (l.small ??= renderTarget()) : null // the panel may lower res after the build
        // The fast path (design E1): its last pass draws straight into acc, unless that pass writes an ISF TARGET or the
        // generator writes straight alpha (LR-7: only the normal composite premultiplies it).
        const direct = i === 0 && ok && l.blend === 'normal' && l.v.opacity === 1 && !small && !last?.passes.at(-1)?.pair && !l.mask && !straight(l.nodes[0]?.def)
        if (i === 0 && !direct) {
          bindFramebufferInfo(gl, acc)
          gl.clearColor(0, 0, 0, 1)
          gl.clear(gl.COLOR_BUFFER_BIT)
        }
        if (!ok) continue
        small?.fit(Math.max(1, Math.round(acc.width * l.v.res)), Math.max(1, Math.round(acc.height * l.v.res)))
        let src: WebGLTexture | null = null
        for (let k = 0; k < l.nodes.length; k++) {
          const dst = direct && k === l.nodes.length - 1 ? acc : k === 0 && small ? small : tmp[k % 2]
          src = run(l.nodes[k]!, l, f, dt, src, dst, s)
        }
        if (direct) continue
        cu.uMask = cd.uMask = cam.mask // the EMA's current target: it swaps per mask
        cu.uMaskMode = cd.uMaskMode = l.mask ? MASK_MODE[l.mask] : 0
        if (l.blend === 'difference' || l.blend === 'dodge') {
          // acc can't be read and written in one pass: copy it, then compute the new acc from the two samplers.
          scratch.fit(acc.width, acc.height)
          bindFramebufferInfo(gl, scratch)
          copy({ uSrc: acc.attachments[0], uRes: SIZE })
          cd.uAcc = scratch.attachments[0]
          cd.uSrc = src
          cd.uOpacity = l.v.opacity
          cd.uMode = l.blend === 'difference' ? 0 : 1
          bindFramebufferInfo(gl, acc)
          compositeDst(cd) // linear like composite: a layer drawn at res < 1 is upscaled here
        } else {
          const [mode, sf, df] = BLENDS[l.blend]
          bindFramebufferInfo(gl, acc)
          gl.enable(gl.BLEND)
          gl.blendFunc(sf, df)
          if (l.blend === 'max') gl.blendEquation(gl.MAX) // factors first, then MAX: max(op·src, acc)
          cu.uSrc = src
          cu.uOpacity = l.v.opacity
          cu.uMode = mode
          composite(cu) // linear: a layer drawn at res < 1 is upscaled here
          if (l.blend === 'max') gl.blendEquation(gl.FUNC_ADD) // the next frame's blending (post pass, swarm) assumes it
          gl.disable(gl.BLEND)
        }
      }
    },
    dispose,
    set(p, input, v) {
      const l = layers[p.layer]
      if (p.node === 'layer') l.v[input as 'res'] = v as number
      else {
        const n = l.nodes[p.node === 'gen' ? 0 : p.node + 1]
        if (!n) return
        v ??= defaults(n.def)[input] // an undone first value
        n.u[input] = Array.isArray(v) ? [...v] : v // our own copy: a binding may write into it
      }
    },
    rebind: bindAll,
    // The structural ops, mirrored by index as edit.ts made them (nodes[0] is the gen): only what an op adds is built,
    // only what it removes is freed. bindAll() drops a removed node's bindings, compiles an added one's, keeps every
    // survivor's smoothing (matched by its `u`) and realigns the walk. A move needs none of it: bindings follow `u`.
    // ponytail: errors are not pruned on remove; prune per node if it shows.
    addFx(layer, at = doc().layers[layer].fx.length - 1) {
      layers[layer].nodes.splice(at + 1, 0, node(doc().layers[layer].fx[at])) // a failed one is null: blacks the layer out until removed
      bindAll()
    },
    removeFx(layer, i) {
      freeNode(layers[layer].nodes.splice(i + 1, 1)[0])
      bindAll()
    },
    moveFx(layer, from, to) {
      edit.move(layers[layer].nodes, from + 1, to + 1)
    },
    setGen(layer) {
      const l = layers[layer]
      freeNode(l.nodes[0])
      l.nodes[0] = node(doc().layers[layer].gen)
      bindAll()
    },
    addLayer(at = doc().layers.length - 1) {
      layers.splice(at, 0, buildLayer(doc().layers[at]))
      bindAll()
    },
    removeLayer(i) {
      freeLayer(layers.splice(i, 1)[0])
      bindAll()
    },
    moveLayer(from, to) {
      edit.move(layers, from, to)
    },
    setBlend(layer, b) {
      layers[layer].blend = b // read per frame
    },
    setMask(layer, m) {
      const l = layers[layer]
      if (m && !l.mask) l.release = users.use(!own) // none → a mode; person ↔ background moves nothing
      if (!m) l.release() // a mode → none (idempotent: none → none is a no-op)
      l.mask = m // read per frame
    },
    mute(layer, on) {
      layers[layer].muted = on // read per frame
    },
    read(p, key) {
      const [name, idx] = key.split('.')
      const i = idx === undefined ? -1 : Number(idx)
      const l = layers[p.layer]
      const u = p.node === 'layer' ? l.v : l.nodes[p.node === 'gen' ? 0 : p.node + 1]?.u
      return bound.find((x) => x.u === u && x.name === name && x.i === i)?.y
    },
    hidden: () => layers.every((l) => !!l.nodes[0]?.native?.hidden?.()),
  }
}

const cache = new Map<SceneId, Live>()
const find = (id: SceneId) => edit.docs.get(id) ?? library.get(id) // the panel's copy first (edit.ts)

/** The live instance of a scene, built on first use and cached by id. */
export function live(id: SceneId): Live {
  let l = cache.get(id)
  if (!l) {
    if (!find(id)) throw new Error(`unknown scene ${id}`)
    cache.set(id, (l = create(id)))
  }
  return l
}

/** A library tile's own instance (2b S3.2, design S6): `doc` into the caller's w×h target, outside `cache`, so
 *  prepare() never frees it. Its own temps and flash budget; natives made for [w, h], so the heavy ones shrink (the
 *  ring, scatter's grid, the point counts); a `res` < 1 layer scales with it through its own `small`; a milk/* layer
 *  takes a pooled visualizer, sized to the tile at its draw. dispose() frees all of it. */
export const tile = (doc: SceneDoc, w: number, h: number): Live => create(doc.id, { doc, size: [w, h] })

const edited = () => live(store.getSnapshot().edited)
const rerender = () => store.patch({ editRev: store.getSnapshot().editRev + 1 })
/** A structural edit (design E6): the doc changes, `sync` mirrors that one op on the running scene, the panel
 *  re-renders once. Returns what the op returned (a removed node or layer, the old gen or blend); false: refused,
 *  nothing synced. */
function restructure<T>(apply: (doc: SceneDoc) => T, sync: (l: Live) => void): T | false {
  const l = edited()
  const r = apply(l.doc)
  if (r === false) return false
  sync(l)
  rerender()
  return r
}
const fresh = (ref: string) => edit.newNode(ref, catalog.get(ref)?.bind) // with its VJW_BIND suggestions

// The plain ops (design S2): the doc, then the same op on the running scene. `panel` records them; undo and redo run
// them again, so they record nothing.
const op = {
  addFx: (layer: number, n: NodeDoc, at: number) => restructure((d) => edit.addFx(d, layer, n, at), (l) => l.addFx(layer, at)),
  removeFx: (layer: number, i: number) => restructure((d) => edit.removeFx(d, layer, i), (l) => l.removeFx(layer, i)),
  moveFx: (layer: number, from: number, to: number) => restructure((d) => edit.moveFx(d, layer, from, to), (l) => l.moveFx(layer, from, to)),
  setGen: (layer: number, n: NodeDoc) => restructure((d) => edit.setGen(d, layer, n), (l) => l.setGen(layer)),
  insertLayer: (ld: LayerDoc, at: number) => restructure((d) => edit.insertLayer(d, ld, at), (l) => l.addLayer(at)),
  removeLayer: (i: number) => restructure((d) => edit.removeLayer(d, i), (l) => l.removeLayer(i)),
  moveLayer: (from: number, to: number) => restructure((d) => edit.moveLayer(d, from, to), (l) => l.moveLayer(from, to)),
  setBlend: (layer: number, b: Blend) => restructure((d) => edit.setBlend(d, layer, b), (l) => l.setBlend(layer, b)),
  setMask: (layer: number, m: MaskMode | undefined) => restructure((d) => edit.setMask(d, layer, m), (l) => l.setMask(layer, m)),
  setValue(p: edit.NodePath, input: string, v: Value | undefined) {
    const l = edited()
    const old = edit.setValue(l.doc, p, input, v)
    l.set(p, input, v)
    return old
  },
  setBinding(p: edit.NodePath, key: string, b: Binding | null) {
    const l = edited()
    const old = edit.setBinding(l.doc, p, key, b)
    l.rebind()
    return old
  },
}

/** Runs a structural op and records it with its inverse (design S3), made from what it returned; false: refused,
 *  nothing recorded. */
function act<T>(run: () => T | false, undo: (r: T) => unknown) {
  const r = run()
  if (r === false) return false
  edits.record({ undo: () => undo(r), redo: run })
  return true
}
/** A value or binding step: its undo and redo re-render the panel, which a drag never does. */
const shown = (f: () => unknown) => () => {
  f()
  rerender()
}
/** A layer at `at` (the top without); false at 4 layers. Duplicate = a structuredClone of one at i + 1. */
const insertLayer = (ld: LayerDoc, at = edited().doc.layers.length) => act(() => op.insertLayer(ld, at), () => op.removeLayer(at))

/** The panel's actions on the edited scene (design E6, contract CP5). Each records its inverse into `edits` (design S3)
 *  where it has the data: the old value, the removed node or layer. setValue and setBinding change the running scene
 *  in place and no store field: a dragged slider never re-renders React, and one drag is one step (by key). A
 *  structural one builds only what it added and frees only what it removed. Moving an fx across layers: not built. */
export const panel = {
  setValue(p: edit.NodePath, input: string, v: Value) {
    const old = op.setValue(p, input, v)
    edits.record({ undo: shown(() => op.setValue(p, input, old)), redo: shown(() => op.setValue(p, input, v)), key: `${p.layer}/${p.node}/${input}` })
  },
  /** An event's trigger: it fires on the node's next draw only (run() clears it), and never reaches the doc or undo. */
  pulse: (p: edit.NodePath, input: string) => edited().set(p, input, true),
  /** The editor's New (2b S2.4): an unsaved one-layer Spectrum scene. Returns its id, for the caller's cut. */
  newScene: () => edit.newScene(fresh('native/spectrum')).id,
  setBinding(p: edit.NodePath, key: string, b: Binding | null) {
    const old = op.setBinding(p, key, b)
    edits.record({ undo: shown(() => op.setBinding(p, key, old)), redo: shown(() => op.setBinding(p, key, b)), key: `${p.layer}/${p.node}/${key} bind` })
  },
  addFx(layer: number, ref: string, at = edited().doc.layers[layer].fx.length) {
    const n = fresh(ref)
    return act(() => op.addFx(layer, n, at), () => op.removeFx(layer, at))
  },
  removeFx: (layer: number, i: number) => act(() => op.removeFx(layer, i), (n) => op.addFx(layer, n, i)),
  moveFx: (layer: number, from: number, to: number) => act(() => op.moveFx(layer, from, to), () => op.moveFx(layer, to, from)),
  /** `gen`: a catalog ref, or a node to copy (a library toy, 2b S3.1: its code is in the node). */
  setGen(layer: number, gen: string | NodeDoc) {
    const n = typeof gen === 'string' ? fresh(gen) : structuredClone(gen)
    return act(() => op.setGen(layer, n), (old) => op.setGen(layer, old))
  },
  insertLayer,
  addLayer: (genRef: string) => insertLayer(edit.newLayer(fresh(genRef))),
  removeLayer: (i: number) => act(() => op.removeLayer(i), (ld) => op.insertLayer(ld, i)),
  moveLayer: (from: number, to: number) => act(() => op.moveLayer(from, to), () => op.moveLayer(to, from)),
  setBlend: (layer: number, b: Blend) => act(() => op.setBlend(layer, b), (old) => op.setBlend(layer, old)),
  /** camera CP1: 'person' | 'background', undefined = none (S1.5's setMask). */
  setMask: (layer: number, m: MaskMode | undefined) => act(() => op.setMask(layer, m), (old) => op.setMask(layer, old)),
  /** Preview only (design S2): never saved, never undone. */
  mute: (layer: number, on: boolean) => edited().mute(layer, on),
  /** A pasted Shadertoy `mainImage` (spec §4.4, design E5) as a new top layer. Returns why not (too long, its compile
   *  log with the paste's line numbers, 4 layers), or null once the layer plays. */
  pasteToy(code: string, credit: string) {
    if (code.length > CODE_MAX) return `${code.length} chars: a paste holds at most ${CODE_MAX}`
    const gen: NodeDoc = { ref: `toy/${crypto.randomUUID()}`, code, credit }
    const { vs, fs, prefixLines } = toyDef(gen)
    if (!program(vs, fs)) return toyLog(fs, prefixLines) // compiled into the cache, where addLayer's node() finds it
    return insertLayer(edit.newLayer(gen)) ? null : 'The scene has 4 layers: remove one first'
  },
  // Storage (design E4, plan S6.1). Each resolves to an error message, or null once stored.
  /** The edited scene into the library, its tile baked again (a Save as's new id bakes as any new block). A built-in
   *  can't be saved in place: its message says Save as. */
  async save() {
    const { doc } = edited()
    try {
      await library.put(doc)
      tiles.invalidate(doc.id, library.get(doc.id)) // the stored copy: later edits don't reach the tile
      edit.dirty.delete(doc.id)
      return null
    } catch (e) {
      return (e as Error).message
    }
  },
  /** The edited scene as a new, unstarred user scene `id`, which takes its edits: the original goes back to its stored
   *  doc, built again when next shown. The caller cuts to `id` (director.cut), so the panel edits the new scene. A New
   *  draft has no stored doc to go back to: it stays in `docs`, since `store.edited` names it until the cut lands and a
   *  render in between must still find it. */
  async saveAs(name: string, id: SceneId = crypto.randomUUID()) {
    const { doc } = edited()
    try {
      await library.put({ ...doc, id, name, star: false, created: Date.now() })
    } catch (e) {
      return (e as Error).message
    }
    if (library.get(doc.id)) edit.docs.delete(doc.id)
    edit.dirty.delete(doc.id)
    cache.get(doc.id)?.dispose()
    cache.delete(doc.id)
    edits.clear() // the steps were the old id's; app.ts clears again when the cut lands
    return null
  },
  toggleStar() {
    const { id } = edited().doc
    library.setStar(id, !library.get(id)?.star)
  },
}

/** Prepare-ahead (design E2), between fades: builds these scenes now and disposes every other live instance, so a
 *  fade into the next scene neither builds nor frees anything. */
export function prepare(keep: readonly SceneId[]) {
  for (const [id, l] of cache) {
    if (keep.includes(id)) continue
    l.dispose()
    cache.delete(id)
  }
  for (const id of keep) live(id)
}

const frame = () => new Promise(requestAnimationFrame)

/** Compile-all at Start (design E2): the programs of every effect in these scenes and of every transition, so no
 *  switch compiles mid-show.
 *  Shaders compile in parallel off the main thread (KHR_parallel_shader_compile; without it 4 per frame). A native's
 *  programs live inside its create(), so a throwaway instance compiles them into the engine's cache, one per frame. A
 *  native with warm() (milk/*: an async preset load) warms itself instead, awaited, one at a time. */
export async function warm(ids: readonly SceneId[], onProgress?: (done: number, total: number) => void) {
  const nodes = ids.flatMap((id) => find(id)?.layers.flatMap((l) => [l.gen, ...l.fx]) ?? [])
  const defs = [...new Set([...nodes.map((n) => toyOf(n) ?? catalog.get(n.ref)), ...transitions.map((r) => catalog.get(r))])].filter((d): d is EffectDef => !!d) // live() reports bad refs
  const natives = defs.filter((d) => 'create' in d) as NativeDef[]
  const shaders = defs.filter((d) => !('create' in d)) as ShaderDef[]
  let done = 0
  const tick = () => onProgress?.(++done, defs.length)
  onProgress?.(0, defs.length)
  const jobs: Promise<unknown>[] = []
  for (const [i, { vs, fs }] of shaders.entries()) {
    // A failed compile counts as done too: twgl logged it, and live() reports it when the scene is built.
    if (PARALLEL) jobs.push(programAsync(vs, fs).catch(() => {}).finally(tick))
    else {
      program(vs, fs)
      tick()
      if (i % 4 === 3) await frame()
    }
  }
  for (const d of natives) {
    if (d.warm) await d.warm()
    else d.create(gl).dispose?.()
    tick()
    await frame()
  }
  await Promise.all(jobs)
}
