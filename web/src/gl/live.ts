// A live scene (design E1–E3, E5, Variant A): renders a SceneDoc into a target every frame, outside React. Per layer the
// generator draws (at size × res), then each effect reads the previous texture as `inputImage`, ping-ponging the two
// engine temps; an ISF file runs its PASSES through its own TARGETs; a pasted Shadertoy (`toy/…`) is a generator. Each
// layer is composited onto `acc` with its blend and opacity, except the fast path: a bottom layer at normal, opacity 1,
// res 1 draws straight into `acc`.
// Every layer runs its own clock (`speed`). Bindings write the nodes' uniforms and the layers' opacity/speed per frame.
// The panel (design E6) edits the current scene through `panel`: values and bindings in place, structure by the same one
// op on the built layers (every other node keeps running); it saves into the library (E4), where `live` finds every scene.
import { bindFramebufferInfo, createTexture, type ProgramInfo } from 'twgl.js'
import { ctx } from '../audio/input'
import { evaluate, type Binding, type BindState, type Sources } from '../bind'
import { CODE_MAX, defaults, type Blend, type LayerDoc, type NodeDoc, type SceneDoc, type SceneId } from '../doc'
import * as edit from '../edit'
import type { FrameInput } from '../frame'
import { catalog, toyDef, transitions } from '../fx/catalog'
import { sizeExpr } from '../fx/isf'
import type { EffectDef, Input, InputType, PassDef, ShaderDef, Value } from '../fx/types'
import { library } from '../library'
import { store } from '../store'
import { audioTex, draw, fullscreenProgram, gl, program, programAsync, renderTarget, temps, type Target } from './engine'
import { flashGate, type FlashState } from './post'
import type { Native, NativeDef } from './scene'

export { docs, type NodePath } from '../edit'

export interface Live {
  readonly doc: SceneDoc; readonly errors: readonly string[]; render(f: FrameInput, s: Sources, acc: Target): void; dispose(): void
  /** The panel, after it edited the doc: one input's live value at `p`, in place; every binding compiled again. */
  set(p: edit.NodePath, input: string, v: Value): void; rebind(): void
  /** The panel, after edit.ts changed the doc's structure: the same one op on the built layers. Every other node and
   *  layer keeps its state and clock. addFx/addLayer build the doc's last fx of that layer / last layer. */
  addFx(layer: number): void; removeFx(layer: number, i: number): void
  addLayer(): void; removeLayer(i: number): void; setBlend(layer: number, b: Blend): void
}

/** A built node: a native, or a shader program and its passes; `u` holds its values (+ the ISF uniforms). A pass with
 *  a TARGET owns a read/write pair, swapped after it draws (design E2): a PERSISTENT one reads its last frame, and
 *  no pass samples the texture it draws into. `w`/`h`: the size the targets were fitted for. `frames`: a shader's
 *  FRAMEINDEX, its own draws so far (0 on its first). */
interface Node { def: EffectDef; native?: Native; info?: ProgramInfo; u: Record<string, unknown>; events: string[]; passes: { p: PassDef; pair: Target[] | null }[]; w: number; h: number; frames: number }
/** A built layer: its nodes (a null one blacks the layer out), its live opacity/speed (bindable) and res, its clock,
 *  the reused FrameInput copy a native reads, and its own target once `res` < 1. */
interface Layer { blend: Blend; nodes: (Node | null)[]; v: { opacity: number; speed: number; res: number }; t: number; f: FrameInput; small: Target | null }
interface Bound { u: Record<string, unknown>; name: string; i: number; type: InputType; b: Binding; state: BindState; flash?: FlashState }
const LAYER_INPUTS: readonly Input[] = [{ name: 'opacity', type: 'float' }, { name: 'speed', type: 'float' }] // bindable
// WCAG 2.3.1 (polish §3): the bound params that flash, gated by flashGate. ponytail: by `ref.name`, so a user ISF with a
// strobe-like param is uncapped; a `VJW_FLASH` header key when a third such shader appears.
const FLASH = new Set(['own/strobe.strobe', 'own/flash.flash'])
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

function create(id: SceneId): Live {
  const errors: string[] = []
  let layers: Layer[] = []
  let bound: Bound[] = []
  const doc = () => find(id)! // the panel's copy (edit.ts) from the scene's first edit on

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
    if ('create' in def) return { def, native: (def as NativeDef).create(gl), u, events, passes: [], w: 0, h: 0, frames: 0 }
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
    return { def, info, u, events, passes: passes.map((p) => ({ p, pair: pair(p) })), w: 0, h: 0, frames: 0 }
  }

  /** Compiles `binds` onto `u` (a node's uniforms or a layer's values). An input bound before (in `old`) first gets
   *  its value from `base` back; one still bound keeps its smoothing state. */
  function bindInto(u: Record<string, unknown>, inputs: readonly Input[], base: Record<string, unknown>, binds: Record<string, Binding> = {}, ref: string, old: Bound[]) {
    for (const x of old) if (x.u === u) u[x.name] = base[x.name]
    for (const [key, b] of Object.entries(binds)) {
      const [name, idx] = key.split('.')
      const i = idx === undefined ? -1 : Number(idx)
      const v = u[name]
      const input = inputs.find((x) => x.name === name)
      const ok = input && v !== undefined && (i < 0 ? !Array.isArray(v) : Array.isArray(v) && i < v.length)
      if (!ok) {
        fail(`${ref}: cannot bind ${key}`)
        continue
      }
      if (i >= 0) u[name] = [...(v as number[])] // our own copy: never write into the def's or the doc's array
      const was = old.find((x) => x.u === u && x.name === name && x.i === i)
      const flash = FLASH.has(`${ref}.${name}`) ? (was?.flash ?? { prev: 0, blocked: false }) : undefined // kept like `state`: a rebind mid-flash neither re-counts nor leaks
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
        if (x) bindInto(x.u, x.def.inputs, { ...defaults(x.def), ...n.values }, n.bind, n.ref, old)
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
      n.u.FRAMEINDEX = n.u.iFrame = n.frames++
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

  const buildLayer = (l: LayerDoc): Layer => ({
    blend: l.blend, nodes: [node(l.gen), ...l.fx.map(node)], v: { opacity: l.opacity, speed: l.speed, res: l.res }, t: 0, f: {} as FrameInput,
    small: l.res < 1 ? renderTarget() : null,
  })

  /** The one freeing path, of a disposed scene and of a removed node or layer: a native's own dispose() (a milk/* one
   *  goes back to its pool), every pass target. */
  function freeNode(n: Node | null) {
    n?.native?.dispose?.()
    for (const { pair } of n?.passes ?? []) pair?.forEach(free)
  }
  function freeLayer(l: Layer) {
    if (l.small) free(l.small)
    l.nodes.forEach(freeNode)
  }

  function dispose() {
    layers.forEach(freeLayer)
    layers = []
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
        if (x.flash) y = flashGate(y, x.flash, flashOnsets, f.time)
        if (x.i >= 0) (x.u[x.name] as number[])[x.i] = y
        else x.u[x.name] = x.type === 'long' ? Math.round(y) : x.type === 'bool' || x.type === 'event' ? y >= 0.5 : y
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
        const ok = !l.nodes.includes(null)
        const last = l.nodes[l.nodes.length - 1]
        const small = l.v.res < 1 ? (l.small ??= renderTarget()) : null // the panel may lower res after the build
        // The fast path (design E1): its last pass draws straight into acc, unless that pass writes an ISF TARGET.
        const direct = i === 0 && ok && l.blend === 'normal' && l.v.opacity === 1 && !small && !last?.passes.at(-1)?.pair
        if (i === 0 && !direct) {
          bindFramebufferInfo(gl, acc)
          gl.clearColor(0, 0, 0, 1)
          gl.clear(gl.COLOR_BUFFER_BIT)
        }
        if (!ok) continue
        small?.fit(Math.max(1, Math.round(acc.width * l.v.res)), Math.max(1, Math.round(acc.height * l.v.res)))
        let src: WebGLTexture | null = null
        for (let k = 0; k < l.nodes.length; k++) {
          const dst = direct && k === l.nodes.length - 1 ? acc : k === 0 && small ? small : temps[k % 2]
          src = run(l.nodes[k]!, l, f, dt, src, dst)
        }
        if (direct) continue
        const [mode, sf, df] = BLENDS[l.blend]
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
    dispose,
    set(p, input, v) {
      const l = layers[p.layer]
      if (p.node === 'layer') l.v[input as 'res'] = v as number
      else {
        const n = l.nodes[p.node === 'gen' ? 0 : p.node + 1]
        if (n) n.u[input] = Array.isArray(v) ? [...v] : v // our own copy: a binding may write into it
      }
    },
    rebind: bindAll,
    // The structural ops, mirrored by index as edit.ts made them (nodes[0] is the gen). bindAll() drops a removed node's
    // bindings, compiles an added one's, keeps every survivor's smoothing (matched by its `u`) and realigns the walk.
    // ponytail: errors are not pruned on remove; prune per node if it shows.
    addFx(layer) {
      layers[layer].nodes.push(node(doc().layers[layer].fx.at(-1)!)) // a failed one is null: blacks the layer out until removed
      bindAll()
    },
    removeFx(layer, i) {
      freeNode(layers[layer].nodes.splice(i + 1, 1)[0])
      bindAll()
    },
    addLayer() {
      layers.push(buildLayer(doc().layers.at(-1)!))
      bindAll()
    },
    removeLayer(i) {
      freeLayer(layers.splice(i, 1)[0])
      bindAll()
    },
    setBlend(layer, b) {
      layers[layer].blend = b // read per frame
    },
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

const edited = () => live(store.getSnapshot().edited)
/** A structural edit (design E6): the doc changes, `sync` mirrors that one op on the running scene, the panel
 *  re-renders once. False: refused, nothing synced. */
function restructure(apply: (doc: SceneDoc) => boolean | void, sync: (l: Live) => void) {
  const l = edited()
  if (apply(l.doc) === false) return false
  sync(l)
  store.patch({ editRev: store.getSnapshot().editRev + 1 })
  return true
}
const fresh = (ref: string) => edit.newNode(ref, catalog.get(ref)?.bind) // with its VJW_BIND suggestions

/** The panel's actions on the edited scene (design E6, contract CP5). setValue and setBinding change the running
 *  scene in place and no store field: a dragged slider never re-renders React. A structural one builds only what it
 *  added and frees only what it removed.
 *  ponytail: an event's `true` is kept in the doc too, so it fires once more per build; skip it if that shows. */
export const panel = {
  setValue(p: edit.NodePath, input: string, v: Value) {
    const l = edited()
    edit.setValue(l.doc, p, input, v)
    l.set(p, input, v)
  },
  setBinding(p: edit.NodePath, key: string, b: Binding | null) {
    const l = edited()
    edit.setBinding(l.doc, p, key, b)
    l.rebind()
  },
  addFx: (layer: number, ref: string) => restructure((d) => edit.addFx(d, layer, fresh(ref)), (l) => l.addFx(layer)),
  removeFx: (layer: number, i: number) => restructure((d) => edit.removeFx(d, layer, i), (l) => l.removeFx(layer, i)),
  addLayer: (genRef: string) => restructure((d) => edit.addLayer(d, fresh(genRef)), (l) => l.addLayer()),
  removeLayer: (i: number) => restructure((d) => edit.removeLayer(d, i), (l) => l.removeLayer(i)),
  setBlend: (layer: number, b: Blend) => restructure((d) => edit.setBlend(d, layer, b), (l) => l.setBlend(layer, b)),
  /** A pasted Shadertoy `mainImage` (spec §4.4, design E5) as a new top layer. Returns why not (too long, its compile
   *  log with the paste's line numbers, 4 layers), or null once the layer plays. */
  pasteToy(code: string, credit: string) {
    if (code.length > CODE_MAX) return `${code.length} chars: a paste holds at most ${CODE_MAX}`
    const gen: NodeDoc = { ref: `toy/${crypto.randomUUID()}`, code, credit }
    const { vs, fs, prefixLines } = toyDef(gen)
    if (!program(vs, fs)) return toyLog(fs, prefixLines) // compiled into the cache, where addLayer's node() finds it
    return restructure((d) => edit.addLayer(d, gen), (l) => l.addLayer()) ? null : 'The scene has 4 layers: remove one first'
  },
  // Storage (design E4, plan S6.1). Each resolves to an error message, or null once stored.
  /** The edited scene into the library. A built-in can't be saved in place: its message says Save as. */
  async save() {
    const { doc } = edited()
    try {
      await library.put(doc)
      edit.dirty.delete(doc.id)
      return null
    } catch (e) {
      return (e as Error).message
    }
  },
  /** The edited scene as a new, unstarred user scene `id`, which takes its edits: the original goes back to its stored
   *  doc, built again when next shown. The caller cuts to `id` (director.cut), so the panel edits the new scene. */
  async saveAs(name: string, id: SceneId = crypto.randomUUID()) {
    const { doc } = edited()
    try {
      await library.put({ ...doc, id, name, star: false, created: Date.now() })
    } catch (e) {
      return (e as Error).message
    }
    edit.docs.delete(doc.id)
    edit.dirty.delete(doc.id)
    cache.get(doc.id)?.dispose()
    cache.delete(doc.id)
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
