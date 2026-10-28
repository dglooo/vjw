// The panel's edits to a scene (design E6), pure: `gl/live.ts` applies each one to the edited scene's live instance. A
// built-in is immutable, so a scene's first edit clones it into `docs` under the same id; every edit marks it dirty
// (unsaved: the library clears that on save, S6). Each op takes the scene's current doc, as `live` finds it.
import type { Binding } from './bind'
import type { Blend, NodeDoc, SceneDoc, SceneId } from './doc'
import type { Value } from './fx/types'

export type NodePath = { layer: number; node: 'gen' | 'layer' | number } // number = fx index
const LAYERS_MAX = 4 // doc.ts's limit
const LAYER_VALUES: readonly string[] = ['opacity', 'speed', 'res']

/** Scenes held in memory, found by `live` ahead of the built-ins: the edited copies, and ?bench's test docs. */
export const docs = new Map<SceneId, SceneDoc>()
/** The scenes edited since they were last saved. */
export const dirty = new Set<SceneId>()

/** The scene's own copy, cloned on its first edit; marks the scene dirty. */
function editable(doc: SceneDoc): SceneDoc {
  let d = docs.get(doc.id)
  if (!d) docs.set(doc.id, (d = structuredClone(doc)))
  dirty.add(doc.id)
  return d
}

const nodeAt = (d: SceneDoc, p: NodePath) => (p.node === 'gen' ? d.layers[p.layer].gen : d.layers[p.layer].fx[p.node as number])

/** A new node for an effect, with its suggested bindings (VJW_BIND, design E3) copied. */
export const newNode = (ref: string, bind?: Readonly<Record<string, Binding>>): NodeDoc => (bind ? { ref, bind: structuredClone(bind) } : { ref })

/** A node's input value, or a layer's opacity, speed or res (other layer keys are ignored). */
export function setValue(doc: SceneDoc, p: NodePath, input: string, v: Value) {
  const d = editable(doc)
  if (p.node !== 'layer') (nodeAt(d, p).values ??= {})[input] = v
  else if (LAYER_VALUES.includes(input)) d.layers[p.layer][input as 'res'] = v as number
}

/** Binds a node's input (`name`, or `name.i` for one component) or a layer's opacity/speed; null unbinds it. */
export function setBinding(doc: SceneDoc, p: NodePath, key: string, b: Binding | null) {
  const d = editable(doc)
  const o: { bind?: Record<string, Binding> } = p.node === 'layer' ? d.layers[p.layer] : nodeAt(d, p)
  if (b) (o.bind ??= {})[key] = b
  else if (o.bind) {
    delete o.bind[key]
    if (!Object.keys(o.bind).length) delete o.bind
  }
}

export function setBlend(doc: SceneDoc, layer: number, b: Blend) {
  editable(doc).layers[layer].blend = b
}

/** Appends an effect to a layer's chain. */
export function addFx(doc: SceneDoc, layer: number, n: NodeDoc) {
  editable(doc).layers[layer].fx.push(n)
}

export function removeFx(doc: SceneDoc, layer: number, i: number) {
  editable(doc).layers[layer].fx.splice(i, 1)
}

/** A new top layer at normal, opacity 1, unless the scene has LAYERS_MAX already: false then, nothing changed. */
export function addLayer(doc: SceneDoc, gen: NodeDoc) {
  if (doc.layers.length >= LAYERS_MAX) return false
  editable(doc).layers.push({ gen, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1 })
  return true
}

/** Removes a layer, unless it is the last one: false then, nothing changed. */
export function removeLayer(doc: SceneDoc, i: number) {
  if (doc.layers.length <= 1) return false
  editable(doc).layers.splice(i, 1)
  return true
}
