import { beforeEach, expect, test } from 'vitest'
import type { Binding } from './bind'
import { parseScene, type LayerDoc, type SceneDoc } from './doc'
import { addFx, addLayer, dirty, docs, insertLayer, moveFx, moveLayer, newNode, newScene, removeFx, removeLayer, setBinding, setBlend, setGen, setMask, setValue } from './edit'

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
  expect(insertLayer(four, layer('e'), 0)).toBe(false)
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

test('insertLayer: at any index (0 = bottom), up to 4 layers', () => {
  const b = builtin([layer('a'), layer('b')])
  expect(insertLayer(b, layer('x'), 0)).toBe(true)
  expect(insertLayer(cur(b), layer('y'), 2)).toBe(true)
  expect(insertLayer(cur(b), layer('z'), 1)).toBe(false)
  expect(refs(b)).toEqual(['x', 'a', 'y', 'b'])
})

test('removeLayer: removes that one layer and returns it, never the last', () => {
  const b = builtin([layer('a'), layer('b'), layer('c')])
  expect(removeLayer(b, 1)).toStrictEqual(layer('b'))
  expect(refs(b)).toEqual(['a', 'c'])
  expect(removeLayer(cur(b), 0)).toStrictEqual(layer('a'))
  expect(removeLayer(cur(b), 0)).toBe(false)
  expect(refs(b)).toEqual(['c'])
})

test('addFx inserts at `at` or appends to that layer; removeFx removes that one effect and returns it', () => {
  const b = builtin([layer('a'), layer('b')])
  addFx(b, 1, { ref: 'x' })
  addFx(cur(b), 1, { ref: 'y' })
  addFx(cur(b), 1, { ref: 'z' }, 0)
  addFx(cur(b), 1, { ref: 'w' }, 2)
  expect(cur(b).layers[1].fx).toStrictEqual([{ ref: 'z' }, { ref: 'x' }, { ref: 'w' }, { ref: 'y' }])
  expect(removeFx(cur(b), 1, 1)).toStrictEqual({ ref: 'x' })
  expect(cur(b).layers[1].fx).toStrictEqual([{ ref: 'z' }, { ref: 'w' }, { ref: 'y' }])
  expect(cur(b).layers[0].fx).toStrictEqual([])
})

test('moveFx and moveLayer put the item at `to`; from === to changes nothing', () => {
  const fx = (d: SceneDoc) => cur(d).layers[0].fx.map((n) => n.ref)
  const b = builtin([layer('a', { fx: [{ ref: 'f0' }, { ref: 'f1' }, { ref: 'f2' }] }), layer('b'), layer('c')])
  moveFx(b, 0, 0, 2)
  expect(fx(b)).toEqual(['f1', 'f2', 'f0'])
  moveFx(cur(b), 0, 2, 1)
  expect(fx(b)).toEqual(['f1', 'f0', 'f2'])
  moveFx(cur(b), 0, 1, 1)
  expect(fx(b)).toEqual(['f1', 'f0', 'f2'])
  moveLayer(cur(b), 2, 0)
  expect(refs(b)).toEqual(['c', 'a', 'b'])
  moveLayer(cur(b), 0, 1)
  expect(refs(b)).toEqual(['a', 'c', 'b'])
  moveLayer(cur(b), 2, 2)
  expect(refs(b)).toEqual(['a', 'c', 'b'])
})

test('setGen replaces a layer generator, keeps its effects, and returns the old one', () => {
  const b = builtin([layer('a', { gen: { ref: 'a', values: { glow: 2 } }, fx: [{ ref: 'f0' }] })])
  const old = setGen(b, 0, { ref: 'g' })
  expect(old).toStrictEqual({ ref: 'a', values: { glow: 2 } })
  expect(cur(b).layers[0]).toStrictEqual(layer('g', { fx: [{ ref: 'f0' }] }))
  expect(setGen(cur(b), 0, old)).toStrictEqual({ ref: 'g' })
  expect(cur(b)).toStrictEqual(b)
})

// Each op, then its inverse (the undo, design S3): every result parses (S9); the inverse gives back the doc. The set ops
// put back a first value or binding by deleting it, record and all.
const roundTrips: [string, (d: SceneDoc) => (c: SceneDoc) => unknown][] = [
  ['setValue', (d) => { const old = setValue(d, { layer: 1, node: 0 }, 'sides', 8); return (c) => setValue(c, { layer: 1, node: 0 }, 'sides', old) }],
  ['setBinding', (d) => { const old = setBinding(d, { layer: 0, node: 'gen' }, 'glow', B); return (c) => setBinding(c, { layer: 0, node: 'gen' }, 'glow', old) }],
  ['setBlend', (d) => { const old = setBlend(d, 2, 'add'); return (c) => setBlend(c, 2, old) }],
  ['setMask', (d) => { const old = setMask(d, 2, 'person'); return (c) => setMask(c, 2, old) }],
  ['addFx at', (d) => { addFx(d, 1, { ref: 'x' }, 1); return (c) => removeFx(c, 1, 1) }],
  ['removeFx', (d) => { const n = removeFx(d, 1, 0); return (c) => addFx(c, 1, n, 0) }],
  ['moveFx', (d) => { moveFx(d, 1, 0, 2); return (c) => moveFx(c, 1, 2, 0) }],
  ['setGen', (d) => { const old = setGen(d, 0, { ref: 'g' }); return (c) => setGen(c, 0, old) }],
  ['insertLayer', (d) => { insertLayer(d, layer('n'), 1); return (c) => removeLayer(c, 1) }],
  ['addLayer', (d) => { addLayer(d, { ref: 'n' }); return (c) => removeLayer(c, 3) }],
  ['removeLayer', (d) => { const l = removeLayer(d, 2) as LayerDoc; return (c) => insertLayer(c, l, 2) }],
  ['moveLayer', (d) => { moveLayer(d, 2, 0); return (c) => moveLayer(c, 0, 2) }],
]
test.each(roundTrips)('%s, then its inverse, gives back the original doc', (_, op) => {
  const b = builtin([layer('a'), layer('b', { fx: [{ ref: 'f0' }, { ref: 'f1' }, { ref: 'f2' }] }), layer('c')])
  const inverse = op(b)
  expect(cur(b)).not.toEqual(b)
  expect(parseScene(cur(b))).toEqual(cur(b))
  inverse(cur(b))
  expect(cur(b)).toEqual(b)
  expect(parseScene(cur(b))).toEqual(b)
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

test('newScene: one layer of its gen under a fresh id, held and dirty, and a scene parseScene accepts as it is', () => {
  const d = newScene({ ref: 'native/spectrum' })
  expect(parseScene(d)).toStrictEqual(d)
  expect(d.layers).toStrictEqual([layer('native/spectrum')])
  expect(docs.get(d.id)).toBe(d)
  expect(dirty.has(d.id)).toBe(true)
  expect(newScene({ ref: 'native/spectrum' }).id).not.toBe(d.id)
})
