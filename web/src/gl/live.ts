// A live scene (design E1–E3, E5, Variant A): renders a SceneDoc into a target every frame, outside React. Per layer the
// generator draws (at size × res), then each effect reads the previous texture as `inputImage`, ping-ponging the two
// engine temps; an ISF file runs its PASSES through its own TARGETs; a pasted Shadertoy (`toy/…`) is a generator. Each
// layer is composited onto `acc` with its blend and opacity, except the fast path: a bottom layer at normal, opacity 1,
// res 1 draws straight into `acc`.
// Every layer runs its own clock (`speed`). Bindings write the nodes' uniforms and the layers' opacity/speed per frame.
import { bindFramebufferInfo, createTexture, type ProgramInfo } from 'twgl.js'
import { ctx } from '../audio/input'
import { evaluate, type Binding, type BindState, type Sources } from '../bind'
import { defaults, type Blend, type LayerDoc, type NodeDoc, type SceneDoc, type SceneId } from '../doc'
import type { FrameInput } from '../frame'
import { catalog, toyDef, transitions } from '../fx/catalog'
import { sizeExpr } from '../fx/isf'
import type { EffectDef, InputType, PassDef, ShaderDef, Value } from '../fx/types'
import { BUILTIN } from '../scenes/builtin'
import { audioTex, draw, fullscreenProgram, gl, program, programAsync, renderTarget, temps, type Target } from './engine'
import type { Native, NativeDef } from './scene'

export interface Live { readonly doc: SceneDoc; readonly errors: readonly string[]; render(f: FrameInput, s: Sources, acc: Target): void; rebuild(): void; dispose(): void }

/** A built node: a native, or a shader program and its passes; `u` holds its values (+ the ISF uniforms). A pass with
 *  a TARGET owns a read/write pair, swapped after it draws (design E2): a PERSISTENT one reads its last frame, and
 *  no pass samples the texture it draws into. `w`/`h`: the size the targets were fitted for. */
interface Node { native?: Native; info?: ProgramInfo; u: Record<string, unknown>; events: string[]; passes: { p: PassDef; pair: Target[] | null }[]; w: number; h: number }
/** A built layer: its nodes (a null one blacks the layer out), the bindable opacity/speed, its clock, the reused
 *  FrameInput copy a native reads, and its own target when `res` < 1. */
interface Layer { doc: LayerDoc; nodes: (Node | null)[]; v: { opacity: number; speed: number }; t: number; f: FrameInput; small: Target | null }
interface Bound { u: Record<string, unknown>; name: string; i: number; type: InputType; b: Binding; state: BindState }

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
const BLENDS: Record<Blend, [mode: number, sf: GLenum, df: GLenum]> = {
  normal: [0, gl.ONE, gl.ONE_MINUS_SRC_ALPHA], // alpha-over × opacity
  add: [1, gl.ONE, gl.ONE], // dst + op·src
  screen: [1, gl.ONE_MINUS_DST_COLOR, gl.ONE], // 1 − (1 − dst)(1 − op·src)
  multiply: [2, gl.DST_COLOR, gl.ZERO], // dst · mix(1, src, op)
}
// Alpha 0 (add, screen) and 1 (multiply) leave acc's alpha as it was.
const composite = fullscreenProgram(`#version 300 es
precision highp float;
uniform sampler2D uSrc;
uniform vec2 uRes;
uniform float uOpacity;
uniform int uMode;
out vec4 outColor;
void main() {
  vec4 c = texture(uSrc, gl_FragCoord.xy / uRes);
  float op = uOpacity;
  outColor = uMode == 0 ? vec4(c.rgb * c.a, c.a) * op : uMode == 1 ? vec4(c.rgb * op, 0.0) : vec4(1.0 - op + op * c.rgb, 1.0);
}`)
const cu: Record<string, unknown> = { uSrc: null, uRes: SIZE, uOpacity: 1, uMode: 0 } // reused every composite

function create(doc: SceneDoc): Live {
  const errors: string[] = []
  let layers: Layer[] = []
  let bound: Bound[] = []
  let frames = 0

  const fail = (msg: string) => {
    errors.push(msg)
    console.error(`${doc.id}: ${msg}`)
    return null
  }

  function node(n: NodeDoc): Node | null {
    const toy = toyOf(n)
    const def = toy ?? catalog.get(n.ref)
    if (!def) return fail(`unknown ref ${n.ref}`)
    const u: Record<string, unknown> = { ...defaults(def), ...n.values }
    for (const [key, b] of Object.entries(n.bind ?? {})) {
      const [name, idx] = key.split('.')
      const i = idx === undefined ? -1 : Number(idx)
      const v = u[name]
      const input = def.inputs.find((x) => x.name === name)
      const ok = input && v !== undefined && (i < 0 ? !Array.isArray(v) : Array.isArray(v) && i < v.length)
      if (!ok) {
        fail(`${n.ref}: cannot bind ${key}`)
        continue
      }
      if (i >= 0) u[name] = [...(v as number[])] // our own copy: never write into the def's or the doc's array
      bound.push({ u, name, i, type: input.type, b, state: { y: 0 } })
    }
    const events = def.inputs.filter((x) => x.type === 'event').map((x) => x.name)
    if ('create' in def) return { native: (def as NativeDef).create(gl), u, events, passes: [], w: 0, h: 0 }
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
    const pair = (p: PassDef) => (p.target ? [renderTarget(p.float, p.persistent), renderTarget(p.float, p.persistent)] : null)
    return { info, u, events, passes: passes.map((p) => ({ p, pair: pair(p) })), w: 0, h: 0 }
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
    for (const { p, pair } of n.passes) {
      if (!pair) continue
      const tw = dim(p.width, vars, w)
      const th = dim(p.height, vars, h)
      for (const t of pair) t.fit(tw, th)
      n.u[p.target!] = pair[0].attachments[0] // a persistent fit() swaps in a new texture
      n.u[`_${p.target}_imgSize`] = [tw, th]
    }
  }

  /** One node into `dst` on its layer's clock; returns the texture it produced: dst's, or its last pass's TARGET. */
  function run(n: Node, l: Layer, f: FrameInput, dt: number, src: WebGLTexture | null, dst: Target) {
    let out = dst
    if (n.native) {
      bindFramebufferInfo(gl, dst)
      const fl = Object.assign(l.f, f) // no allocation: the layer's own copy, on its clock and at its size
      fl.time = l.t
      fl.dt = dt
      fl.width = dst.width
      fl.height = dst.height
      n.native.draw(fl, n.u as Record<string, Value>)
    } else {
      if (n.w !== dst.width || n.h !== dst.height) resize(n, dst.width, dst.height)
      n.u.TIME = n.u.iTime = l.t // ISF's names and a toy's
      n.u.TIMEDELTA = n.u.iTimeDelta = dt
      n.u.FRAMEINDEX = n.u.iFrame = frames
      n.u.inputImage = src // the previous draw; unused by a generator
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

  function build() {
    errors.length = 0
    bound = []
    frames = 0
    layers = doc.layers.map((l) => {
      const v = { opacity: l.opacity, speed: l.speed }
      for (const k of ['opacity', 'speed'] as const) {
        const b = l.bind?.[k]
        if (b) bound.push({ u: v, name: k, i: -1, type: 'float', b, state: { y: 0 } })
      }
      return { doc: l, nodes: [node(l.gen), ...l.fx.map(node)], v, t: 0, f: {} as FrameInput, small: l.res < 1 ? renderTarget() : null }
    })
  }

  function dispose() {
    for (const l of layers) {
      if (l.small) free(l.small)
      for (const n of l.nodes) {
        n?.native?.dispose?.()
        for (const { pair } of n?.passes ?? []) pair?.forEach(free)
      }
    }
    layers = []
  }

  build()
  return {
    doc,
    errors,
    render(f, s, acc) {
      for (const x of bound) {
        const y = evaluate(x.b, s, x.state, f.dt)
        if (x.i >= 0) (x.u[x.name] as number[])[x.i] = y
        else x.u[x.name] = x.type === 'long' ? Math.round(y) : x.type === 'bool' || x.type === 'event' ? y >= 0.5 : y
      }
      SIZE[0] = acc.width
      SIZE[1] = acc.height
      const d = new Date()
      DATE.set([d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()])
      IDATE.set([d.getFullYear(), d.getMonth(), d.getDate(), DATE[3] + d.getMilliseconds() / 1000])
      frames++
      for (let i = 0; i < layers.length; i++) {
        const l = layers[i]
        const dt = f.dt * l.v.speed
        l.t += dt
        const ok = !l.nodes.includes(null)
        const last = l.nodes[l.nodes.length - 1]
        // The fast path (design E1): its last pass draws straight into acc, unless that pass writes an ISF TARGET.
        const direct = i === 0 && ok && l.doc.blend === 'normal' && l.v.opacity === 1 && !l.small && !last?.passes.at(-1)?.pair
        if (i === 0 && !direct) {
          bindFramebufferInfo(gl, acc)
          gl.clearColor(0, 0, 0, 1)
          gl.clear(gl.COLOR_BUFFER_BIT)
        }
        if (!ok) continue
        l.small?.fit(Math.max(1, Math.round(acc.width * l.doc.res)), Math.max(1, Math.round(acc.height * l.doc.res)))
        let src: WebGLTexture | null = null
        for (let k = 0; k < l.nodes.length; k++) {
          const dst = direct && k === l.nodes.length - 1 ? acc : k === 0 && l.small ? l.small : temps[k % 2]
          src = run(l.nodes[k]!, l, f, dt, src, dst)
        }
        if (direct) continue
        const [mode, sf, df] = BLENDS[l.doc.blend]
        bindFramebufferInfo(gl, acc)
        gl.enable(gl.BLEND)
        gl.blendFunc(sf, df)
        cu.uSrc = src
        cu.uOpacity = l.v.opacity
        cu.uMode = mode
        composite(cu) // linear: a layer drawn at res < 1 is upscaled here
        gl.disable(gl.BLEND)
      }
    },
    rebuild() {
      dispose()
      build()
    },
    dispose,
  }
}

const cache = new Map<SceneId, Live>()
/** ?bench only (bench.ts): its test docs, found by `live` ahead of the built-ins. */
export const docs = new Map<SceneId, SceneDoc>()

const find = (id: SceneId) => docs.get(id) ?? BUILTIN.find((d) => d.id === id) // S6.1: the library

/** The live instance of a scene, built on first use and cached by id. */
export function live(id: SceneId): Live {
  let l = cache.get(id)
  if (!l) {
    const doc = find(id)
    if (!doc) throw new Error(`unknown scene ${id}`)
    cache.set(id, (l = create(doc)))
  }
  return l
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
 *  programs live inside its create(), so a throwaway instance compiles them into the engine's cache, one per frame. */
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
    d.create(gl).dispose?.()
    tick()
    await frame()
  }
  await Promise.all(jobs)
}
