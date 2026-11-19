// The panel's edits to a scene (design E6), pure: `gl/live.ts` applies each one to the edited scene's live instance. A
// built-in is immutable, so a scene's first edit clones it into `docs` under the same id; every edit marks it dirty
// (unsaved: the library clears that on save, S6). Each op takes the scene's current doc, as `live` finds it.
import type { Binding } from './bind'
import type { Blend, LayerDoc, MaskMode, NodeDoc, SceneDoc, SceneId } from './doc'
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

// The set ops return the old value, for undo (design S3). Unset (undefined, null) deletes the key, and the record with
// its last key, so the undo of a first value or binding gives back the doc it found.

/** A node's input value, or a layer's opacity, speed or res (other layer keys are ignored); undefined: the default. */
export function setValue(doc: SceneDoc, p: NodePath, input: string, v: Value | undefined) {
  const d = editable(doc)
  if (p.node === 'layer') {
    const l = d.layers[p.layer]
    const old = l[input as 'res']
    if (LAYER_VALUES.includes(input)) l[input as 'res'] = v as number
    return old
  }
  const n = nodeAt(d, p)
  const old = n.values?.[input]
  if (v !== undefined) (n.values ??= {})[input] = v
  else if (n.values) {
    delete n.values[input]
    if (!Object.keys(n.values).length) delete n.values
  }
  return old
}

/** Several of one node's inputs at once (a preset, presets.ts): exactly those keys. Returns their old values (undefined:
 *  the default), for undo. */
export const setValues = (doc: SceneDoc, p: NodePath, values: Readonly<Record<string, Value | undefined>>) =>
  Object.fromEntries(Object.entries(values).map(([k, v]) => [k, setValue(doc, p, k, v)]))

/** Binds a node's input (`name`, or `name.i` for one component) or a layer's opacity/speed; null unbinds it. */
export function setBinding(doc: SceneDoc, p: NodePath, key: string, b: Binding | null) {
  const d = editable(doc)
  const o: { bind?: Record<string, Binding> } = p.node === 'layer' ? d.layers[p.layer] : nodeAt(d, p)
  const old = o.bind?.[key] ?? null
  if (b) (o.bind ??= {})[key] = b
  else if (o.bind) {
    delete o.bind[key]
    if (!Object.keys(o.bind).length) delete o.bind
  }
  return old
}

export function setBlend(doc: SceneDoc, layer: number, b: Blend) {
  const l = editable(doc).layers[layer]
  const old = l.blend
  l.blend = b
  return old
}

/** The layer's camera mask (S1.5): 'person' | 'background', undefined clears it. */
export function setMask(doc: SceneDoc, layer: number, m: MaskMode | undefined): MaskMode | undefined {
  const l = editable(doc).layers[layer]
  const old = l.mask
  if (m === undefined) delete l.mask
  else l.mask = m
  return old
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

/** Moves a[from] so that it ends up at index `to` (gl/live.ts moves the built nodes and layers with it too). */
export function move<T>(a: T[], from: number, to: number) {
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

/** A new layer at normal, opacity 1. */
export const newLayer = (gen: NodeDoc): LayerDoc => ({ gen, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1 })

/** A new top layer (insertLayer's limit). */
export const addLayer = (doc: SceneDoc, gen: NodeDoc) => insertLayer(doc, newLayer(gen), doc.layers.length)

/** The editor's New (2b S2.4): a one-layer scene under a fresh id, held in `docs` and dirty, so `live` finds it before
 *  it is ever saved. ponytail: a draft left unsaved stays in `docs` for the session; drop it on cut-away if that weighs. */
export function newScene(gen: NodeDoc): SceneDoc {
  const d: SceneDoc = { v: 1, id: crypto.randomUUID(), name: 'New scene', star: false, layers: [newLayer(gen)] }
  docs.set(d.id, d)
  dirty.add(d.id)
  return d
}

/** iTime on the music (after the friends' vs3 shader scene, where any pasted shader surges on the drop): a shader
 *  editor layer's clock runs at 0.6× between kicks and leaps on each one (2×, back in 0.3 s). Its layer's speed
 *  binding, so the editor (L) changes or removes it. */
export const MUSIC_TIME: Binding = { source: 'kick', amount: 1, attack: 0.02, release: 0.3, min: 0.6, max: 2 }

/** The shader editor's New (vs3 port): New's draft, its one layer playing Shadertoy `code` on MUSIC_TIME. */
export function newShader(code: string): SceneDoc {
  const d = newScene({ ref: `toy/${crypto.randomUUID()}`, code, credit: '' })
  d.name = 'New shader'
  d.layers[0].bind = { speed: { ...MUSIC_TIME } }
  return d
}

/** The Shadertoy code of a scene's bottom layer, when it plays one: what the shader editor opens. */
export const toyCode = (d: SceneDoc) => (d.layers[0].gen.ref.startsWith('toy/') ? d.layers[0].gen.code : undefined)

/** Removes a layer and returns it, unless it is the last one: false then, nothing changed. */
export function removeLayer(doc: SceneDoc, i: number) {
  if (doc.layers.length <= 1) return false
  return editable(doc).layers.splice(i, 1)[0]
}
