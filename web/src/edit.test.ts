import { beforeEach, expect, test } from 'vitest'
import type { Binding } from './bind'
import type { LayerDoc, SceneDoc } from './doc'
import { addFx, addLayer, dirty, docs, newNode, removeFx, removeLayer, setBinding, setBlend, setValue } from './edit'

const B: Binding = { source: 'bass', amount: 1, attack: 0, release: 0.15, min: 0, max: 1 }
const layer = (ref: string, over: Partial<LayerDoc> = {}): LayerDoc => ({ gen: { ref }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1, ...over })
/** Frozen all the way down, as a built-in: any write into it, or into a shallow copy of it, throws. */
function frozen<T>(x: T): T {
  if (typeof x === 'object' && x !== null) {
    Object.values(x).forEach(frozen)
    Object.freeze(x)
  }
  return x
}
const builtin = (layers = [layer('native/tunnel')]): SceneDoc => frozen({ v: 1, id: 'builtin:t', name: 'T', star: true, layers })
const cur = (d: SceneDoc) => docs.get(d.id) ?? d // as `live` finds a scene
const refs = (d: SceneDoc) => cur(d).layers.map((l) => l.gen.ref)

beforeEach(() => {
  docs.clear()
  dirty.clear()
})

test('the first edit clones the built-in under its id and marks it dirty; later edits change that copy', () => {
  const b = builtin()
  const before = structuredClone(b)
  setValue(b, { layer: 0, node: 'gen' }, 'glow', 2)
  const d = docs.get('builtin:t')!
  expect(d).not.toBe(b)
  expect(b).toStrictEqual(before)
  expect(d.layers[0].gen.values).toStrictEqual({ glow: 2 })
  expect(dirty.has('builtin:t')).toBe(true)
  setValue(d, { layer: 0, node: 'gen' }, 'twist', 0.3)
  setValue(b, { layer: 0, node: 'gen' }, 'speed', 1) // the built-in again: still its one copy
  expect(docs.get('builtin:t')).toBe(d)
  expect(d.layers[0].gen.values).toStrictEqual({ glow: 2, twist: 0.3, speed: 1 })
  expect(docs.size).toBe(1)
})

test('dirty: a refused edit neither clones nor marks; a saved scene is marked again by its next edit', () => {
  const one = builtin()
  expect(removeLayer(one, 0)).toBe(false)
  const four = builtin([layer('a'), layer('b'), layer('c'), layer('d')])
  expect(addLayer(four, { ref: 'e' })).toBe(false)
  expect(docs.size).toBe(0)
  expect(dirty.size).toBe(0)
  setBlend(four, 1, 'add')
  expect(dirty.has(four.id)).toBe(true)
  dirty.delete(four.id) // saved (S6)
  setBlend(cur(four), 1, 'screen')
  expect(dirty.has(four.id)).toBe(true)
  expect(cur(four).layers.map((l) => l.blend)).toEqual(['normal', 'screen', 'normal', 'normal'])
})

test('addLayer: up to 4 layers, each new one on top at normal, opacity 1', () => {
  const b = builtin()
  expect(addLayer(b, { ref: 'g1' })).toBe(true)
  expect(addLayer(cur(b), { ref: 'g2' })).toBe(true)
  expect(addLayer(cur(b), { ref: 'g3' })).toBe(true)
  expect(addLayer(cur(b), { ref: 'g4' })).toBe(false)
  expect(refs(b)).toEqual(['native/tunnel', 'g1', 'g2', 'g3'])
  expect(cur(b).layers[3]).toStrictEqual(layer('g3'))
})

test('removeLayer: removes that one layer, never the last', () => {
  const b = builtin([layer('a'), layer('b'), layer('c')])
  expect(removeLayer(b, 1)).toBe(true)
  expect(refs(b)).toEqual(['a', 'c'])
  expect(removeLayer(cur(b), 0)).toBe(true)
  expect(removeLayer(cur(b), 0)).toBe(false)
  expect(refs(b)).toEqual(['c'])
})

test('addFx appends to that layer, removeFx removes that one effect', () => {
  const b = builtin([layer('a'), layer('b')])
  addFx(b, 1, { ref: 'x' })
  addFx(cur(b), 1, { ref: 'y' })
  addFx(cur(b), 1, { ref: 'z' })
  removeFx(cur(b), 1, 1)
  expect(cur(b).layers[1].fx).toStrictEqual([{ ref: 'x' }, { ref: 'z' }])
  expect(cur(b).layers[0].fx).toStrictEqual([])
})

test('newNode copies the suggested bindings, and has no bind key without them', () => {
  const suggested = { burst: B }
  const n = newNode('own/strobe', suggested)
  expect(n).toStrictEqual({ ref: 'own/strobe', bind: { burst: B } })
  expect(n.bind).not.toBe(suggested)
  expect(n.bind!.burst).not.toBe(B)
  expect(newNode('isf/x')).toStrictEqual({ ref: 'isf/x' })
})

test('setBinding sets, replaces and removes keys; the last one removed drops the record', () => {
  const b = builtin([layer('a', { fx: [{ ref: 'f0' }] })])
  const g = { layer: 0, node: 'gen' } as const
  const half = { ...B, amount: 0.5 }
  setBinding(b, g, 'glow', half)
  setBinding(cur(b), g, 'glow', B)
  setBinding(cur(b), g, 'center.0', half)
  setBinding(cur(b), { layer: 0, node: 0 }, 'sides', B)
  expect(cur(b).layers[0].gen.bind).toStrictEqual({ glow: B, 'center.0': half })
  expect(cur(b).layers[0].fx[0].bind).toStrictEqual({ sides: B })
  setBinding(cur(b), g, 'glow', null)
  expect(cur(b).layers[0].gen.bind).toStrictEqual({ 'center.0': half })
  setBinding(cur(b), g, 'center.0', null)
  expect(cur(b).layers[0].gen).toStrictEqual({ ref: 'a' })
  setBinding(cur(b), { layer: 0, node: 'layer' }, 'opacity', B)
  setBinding(cur(b), { layer: 0, node: 'layer' }, 'speed', null) // not bound: nothing changes
  expect(cur(b).layers[0].bind).toStrictEqual({ opacity: B })
})

test('setValue writes a node input (gen or fx i) or a layer value, and ignores other layer keys', () => {
  const b = builtin([layer('a'), layer('b', { fx: [{ ref: 'f0' }, { ref: 'f1' }] })])
  setValue(b, { layer: 1, node: 1 }, 'sides', 8)
  setValue(cur(b), { layer: 1, node: 'gen' }, 'center', [0.5, 0.25])
  setValue(cur(b), { layer: 1, node: 'layer' }, 'opacity', 0.5)
  setValue(cur(b), { layer: 1, node: 'layer' }, 'res', 0.5)
  setValue(cur(b), { layer: 1, node: 'layer' }, 'blend', 1)
  expect(cur(b).layers).toStrictEqual([
    layer('a'),
    layer('b', { gen: { ref: 'b', values: { center: [0.5, 0.25] } }, fx: [{ ref: 'f0' }, { ref: 'f1', values: { sides: 8 } }], opacity: 0.5, res: 0.5 }),
  ])
})
