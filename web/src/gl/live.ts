// A live scene (design E2/E3, Variant A): renders a SceneDoc into a target every frame, outside React. Per layer the
// generator draws, then each effect reads the previous texture as `inputImage`, ping-ponging the two engine temps;
// the last draw lands in `acc`. Bindings are evaluated into the nodes' uniform objects every frame.
import { bindFramebufferInfo, type ProgramInfo } from 'twgl.js'
import { evaluate, type Binding, type BindState, type Sources } from '../bind'
import { defaults, type NodeDoc, type SceneDoc, type SceneId } from '../doc'
import type { FrameInput } from '../frame'
import { catalog } from '../fx/catalog'
import type { InputType, ShaderDef, Value } from '../fx/types'
import { BUILTIN } from '../scenes/builtin'
import { draw, gl, program, temps, type Target } from './engine'
import type { Native, NativeDef } from './scene'

export interface Live { readonly doc: SceneDoc; readonly errors: readonly string[]; render(f: FrameInput, s: Sources, acc: Target): void; rebuild(): void; dispose(): void }

/** A built node: a native, or a shader program; `u` holds its values (+ the ISF uniforms for a shader). */
interface Node { native?: Native; info?: ProgramInfo; u: Record<string, unknown>; events: string[] }
interface Bound { u: Record<string, unknown>; name: string; i: number; type: InputType; b: Binding; state: BindState }

// One size for RENDERSIZE and every image: CP1 renders all targets at the shots' size. ponytail: per-target sizes
// arrive with ISF passes (S3.3).
const SIZE = new Float32Array(2)
const DATE = new Float32Array(4)

function create(doc: SceneDoc): Live {
  const errors: string[] = []
  let layers: (Node | null)[][] = [] // per layer: gen, then fx; a null node blacks the layer out
  let bound: Bound[] = []
  let t0 = 0
  let frames = 0

  const fail = (msg: string) => {
    errors.push(msg)
    console.error(`${doc.id}: ${msg}`)
    return null
  }

  function node(n: NodeDoc): Node | null {
    const def = catalog.get(n.ref)
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
    if ('create' in def) return { native: (def as NativeDef).create(gl), u, events }
    const { vs, fs } = def as ShaderDef
    const info = program(vs, fs) // null when it fails to compile; twgl logged why
    if (!info) return fail(`${n.ref}: shader failed to compile`)
    Object.assign(u, { RENDERSIZE: SIZE, PASSINDEX: 0, DATE, _inputImage_imgSize: SIZE })
    return { info, u, events }
  }

  function build() {
    errors.length = 0
    bound = []
    t0 = performance.now() / 1000 // rAF's clock, as f.time
    frames = 0
    layers = doc.layers.map((l) => [node(l.gen), ...l.fx.map(node)])
  }

  function dispose() {
    for (const n of layers.flat()) n?.native?.dispose?.()
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
      frames++
      // ponytail: CP1 fast path, each layer straight into acc (one layer in every CP1 doc); blend, opacity, res and the
      // layer clock arrive in S3.3.
      for (const chain of layers) {
        if (chain.includes(null)) {
          bindFramebufferInfo(gl, acc)
          gl.clearColor(0, 0, 0, 1)
          gl.clear(gl.COLOR_BUFFER_BIT)
          continue
        }
        let src: Target | null = null
        for (let k = 0; k < chain.length; k++) {
          const n = chain[k]!
          const dst = k === chain.length - 1 ? acc : temps[k % 2]
          bindFramebufferInfo(gl, dst)
          if (n.native) n.native.draw(f, n.u as Record<string, Value>)
          else {
            n.u.TIME = f.time - t0
            n.u.TIMEDELTA = f.dt
            n.u.FRAMEINDEX = frames
            n.u.inputImage = src?.attachments[0] // the previous draw; unused by a generator
            draw(n.info!, n.u)
          }
          for (const e of n.events) n.u[e] = false
          src = dst
        }
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

/** The live instance of a scene, built on first use and cached by id. */
export function live(id: SceneId): Live {
  let l = cache.get(id)
  if (!l) {
    const doc = docs.get(id) ?? BUILTIN.find((d) => d.id === id) // S6.1: the library
    if (!doc) throw new Error(`unknown scene ${id}`)
    cache.set(id, (l = create(doc)))
  }
  return l
}
