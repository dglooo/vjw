// The panel's edits to a scene (design E6), pure: `gl/live.ts` applies each one to the edited scene's live instance. A
// built-in is immutable, so a scene's first edit clones it into `docs` under the same id; every edit marks it dirty
// (unsaved: the library clears that on save, S6). Each op takes the scene's current doc, as `live` finds it.
import type { Binding } from './bind'
import type { Blend, LayerDoc, NodeDoc, SceneDoc, SceneId } from './doc'
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

// The structural ops (design S2). Each one's inverse, for undo: addFx ↔ removeFx, moveFx(from, to) ↔ moveFx(to, from),
// setGen ↔ setGen(the old gen), insertLayer ↔ removeLayer, moveLayer(from, to) ↔ moveLayer(to, from).

/** Inserts an effect into a layer's chain at `at`; appends it without. */
export function addFx(doc: SceneDoc, layer: number, n: NodeDoc, at?: number) {
  const fx = editable(doc).layers[layer].fx
  fx.splice(at ?? fx.length, 0, n)
}

/** Removes one effect and returns it. */
export function removeFx(doc: SceneDoc, layer: number, i: number) {
  return editable(doc).layers[layer].fx.splice(i, 1)[0]
}

/** Moves a[from] so that it ends up at index `to`. */
function move<T>(a: T[], from: number, to: number) {
  a.splice(to, 0, ...a.splice(from, 1))
}
export const moveFx = (doc: SceneDoc, layer: number, from: number, to: number) => move(editable(doc).layers[layer].fx, from, to)
export const moveLayer = (doc: SceneDoc, from: number, to: number) => move(editable(doc).layers, from, to)

/** Replaces a layer's generator and returns the old one. */
export function setGen(doc: SceneDoc, layer: number, n: NodeDoc) {
  const l = editable(doc).layers[layer]
  const old = l.gen
  l.gen = n
  return old
}

/** Inserts a layer at `at` (0 = bottom), unless the scene has LAYERS_MAX already: false then, nothing changed. */
export function insertLayer(doc: SceneDoc, l: LayerDoc, at: number) {
  if (doc.layers.length >= LAYERS_MAX) return false
  editable(doc).layers.splice(at, 0, l)
  return true
}

/** A new top layer at normal, opacity 1 (insertLayer's limit). */
export const addLayer = (doc: SceneDoc, gen: NodeDoc) => insertLayer(doc, { gen, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1 }, doc.layers.length)

/** Removes a layer and returns it, unless it is the last one: false then, nothing changed. */
export function removeLayer(doc: SceneDoc, i: number) {
  if (doc.layers.length <= 1) return false
  return editable(doc).layers.splice(i, 1)[0]
}
